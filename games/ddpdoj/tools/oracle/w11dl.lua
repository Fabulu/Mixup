-- w11dl.lua -- WAVE 11: THE DISPLAY LIST, INPUT AND OUTPUT, PER LOGIC FRAME.
--
-- This is the probe behind `pgm.py dlgate` and `pgm.py ablate`.  It exists
-- because of one piece of rare luck the wave-10 recons found: main-loop call #4
-- ($23D2AE) is a PURE TRANSFORM of the thirty bucket counters and their staging
-- buffers into the hardware display list at $800000..$8009FF.  So the port's
-- translation of it can be gated BYTE FOR BYTE TODAY, with zero new gameplay
-- simulation, by dumping the board's INPUT and its OUTPUT and replaying the
-- transform offline.  The capture becomes the gate's input instead of its
-- output.
--
-- THE TWO SAMPLE POINTS, and they are not the same instant:
--
--   INPUT   $23D382 `move.w D0,$80B000`, inside call #4 itself.  It is the ONE
--           instant at which all thirty counters are live: the sum is done, the
--           pre-emptive drop has not run, nothing has been copied and nothing
--           has been cleared.  Hooked with a WRITE tap filtered on CURPC,
--           because on the 68000 a read tap only proves the PREFETCH and CURPC
--           does not identify an opcode fetch (that is the 6502 rule).
--
--   OUTPUT  the semaphore arm at $803940, the project's standard sample point.
--           Call #4 runs BEFORE the arm in the same main-loop iteration, so the
--           list read at the arm of logic frame N is the list call #4 built for
--           frame N.  Pairing is done by BUFFERING the input capture and
--           writing the pair at the arm, never by arithmetic on frame numbers.
--
-- WHAT IS DUMPED, and why it is a PREFIX rather than the whole region.
-- $80397C..$80AFFB is 30,336 bytes; dumping all of it for 1,901 frames is 57 MB
-- and 29 million Lua share reads.  The emit provably reads only the ACCOUNTED
-- bytes: `$23D726` copies 16 bytes per 12-byte record without re-deriving A2,
-- which is an identity map S[j] -> Q[q0+j] that merely runs past the accounted
-- end, and the next bucket's copy starts exactly AT that end.  So per frame this
-- dumps the thirty counters, $80B054, and each bucket's first `counter` bytes.
-- IF THAT REASONING IS WRONG THE GATE GOES RED, which is the point of a gate.
--
-- ENV
--   W11_FRAMES      stop after N logic frames
--   W11_INPUT       the button script, "lf=NAMES;..." (same grammar as frame.lua)
--   W11_REQUIRE_BUILD  "A"|"B"; the run FAILS if the last frame is the other one
--   W11_OUT         binary path for the (staged input, display list) pairs
--   W11_FROM        only record pairs from this logic frame on (default 0)
--   W11_POKE        "hexaddr=hexbyte,..." applied at the sample point, AFTER the
--                   pair is written -- an INTERVENTION, consumed by the NEXT
--                   frame, exactly as frame.lua's PROBE_POKE is
--   W11_POKE_FROM   the first logic frame the poke applies at
--   W11_ABLATE      hex counter address, zeroed AT $23D382 -- the bucket
--                   ablation.  The sum has already been taken, so the budget
--                   arithmetic is untouched and only this bucket's records
--                   vanish.
--   W11_PIX         "lf,lf,..." -- dump the raw framebuffer at those logic frames
--   W11_PIXDIR      where to put them (ROM-DERIVED -- under rip/, gitignored)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]
local ZOOM = M.memory.shares[":igs023:zoomram"]

TAPS, SUBS = {}, {}                    -- GLOBALS or they are GC'd and stop

local RUN   = tonumber(os.getenv("W11_FRAMES") or "2600")
local WANT  = os.getenv("W11_REQUIRE_BUILD")
local OUT   = os.getenv("W11_OUT")
local FROM  = tonumber(os.getenv("W11_FROM") or "0")
local ABLATE = os.getenv("W11_ABLATE")
if ABLATE then ABLATE = tonumber(ABLATE, 16) end
local PIXDIR = os.getenv("W11_PIXDIR")

-- The thirty counters, $80AFC0..$80AFFB, and their staging buffers IN DRAIN
-- ORDER.  Read out of $23D3E0..$23D622 by tools/w10/buckets.py; index 0 is the
-- shared queue, which producers append to directly.
local BUCKET = {
  { 0x397c, 0xafc0 }, { 0x5104, 0xafc2 }, { 0x5cc8, 0xafc4 }, { 0x688c, 0xafc6 },
  { 0x83d4, 0xafcc }, { 0x862c, 0xafd0 }, { 0x8674, 0xafd2 }, { 0x7450, 0xafc8 },
  { 0x8014, 0xafca }, { 0x8764, 0xafd4 }, { 0xa864, 0xafe8 }, { 0xad8c, 0xaff0 },
  { 0xaf24, 0xafea }, { 0xa8dc, 0xafec }, { 0x8854, 0xafd6 }, { 0x8eb4, 0xafda },
  { 0x8bb4, 0xafd8 }, { 0x8500, 0xafce }, { 0xaeac, 0xaff8 }, { 0x8ee4, 0xafdc },
  { 0x8fa4, 0xafde }, { 0xa624, 0xafe4 }, { 0x9274, 0xafe0 }, { 0x9c4c, 0xafe2 },
  { 0xaf9c, 0xaffa }, { 0xa6e4, 0xafe6 }, { 0xad14, 0xafee }, { 0xae04, 0xaff2 },
  { 0xae7c, 0xaff4 }, { 0xae94, 0xaff6 },
}
local STAGE_HI = 0xaffc                -- one past the last counter word

local lf, done, lastbuild = 0, false, -1
local pending = nil                    -- the buffered $23D382 capture
local nrec, nlist = 0, 0
local emitpcs, listwriters, b054 = {}, {}, {}
local cen = { halted = 0, capfired = 0, drop20 = 0, drop69 = 0, maxrec = 0 }
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("W11_INPUT") or ""):gmatch("[^;]+") do
  local at, names = item:match("^(%d+)=(.*)$")
  if at then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(at)] = fs
  end
end
local function apply_input(n)
  local fs = script[n]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local POKES = {}
for kv in (os.getenv("W11_POKE") or ""):gmatch("[^,]+") do
  local a, v = kv:match("^(%x+)=(%x+)$")
  if a then
    a = tonumber(a, 16)
    POKES[#POKES + 1] = { (a >= 0x800000) and (a - 0x800000) or a, tonumber(v, 16) }
  else p("POKE_UNPARSED [%s]", kv) end
end
local POKE_FROM = tonumber(os.getenv("W11_POKE_FROM") or "0")

local pixat = {}
for tok in (os.getenv("W11_PIX") or ""):gmatch("[^,]+") do pixat[tonumber(tok)] = true end
local pix_pending, pix_lf, pix_n = 0, 0, 0

local out
if OUT then
  out = io.open(OUT, "wb")
  if not out then p("FAIL could not open W11_OUT [%s]", tostring(OUT)) end
end

-- Read `len` bytes of :sram from offset `off` as a Lua string, two at a time.
local function bytes(off, len)
  local t = {}
  for a = off, off + len - 2, 2 do
    local w = RAM:read_u16(a)
    t[#t + 1] = string.char((w >> 8) & 0xff, w & 0xff)
  end
  if (len % 2) == 1 then t[#t + 1] = string.char(RAM:read_u8(off + len - 1)) end
  return table.concat(t)
end

-- (1) THE INPUT CAPTURE.  $23D382 `move.w D0,$80B000` -- the one instant all
--     thirty counters are live and nothing has been dropped or copied.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80B000, 0x80B001, "sum",
  function(offset, data, mask)
    if (CPU.state["CURPC"].value & 0xffffff) ~= 0x23D382 then return data end
    local ctrs = bytes(0xafc0, 60)
    local off = RAM:read_u32(0xb054)
    bump(b054, string.format("%08X", off))
    local parts, tot = {}, 0
    for i = 1, #BUCKET do
      local base, ctr = BUCKET[i][1], BUCKET[i][2]
      local n = RAM:read_u16(ctr)
      -- clamp at the end of the whole staged span: the drain really does read
      -- into the NEXT bucket's buffer when a counter overruns its own, and that
      -- is deterministic board state, so it is dumped rather than truncated.
      if base + n > STAGE_HI then n = STAGE_HI - base end
      tot = tot + n
      parts[#parts + 1] = string.pack(">I4I4", 0x800000 + base, n)
      if n > 0 then parts[#parts + 1] = bytes(base, n) end
    end
    if tot > cen.maxrec then cen.maxrec = tot end
    pending = string.pack(">I4I4", #BUCKET, 0) .. ctrs
      .. string.pack(">I4", off) .. table.concat(parts)
    -- THE ABLATION.  Zeroing a counter HERE is after the sum and before the
    -- drop policy and the drain, so the budget arithmetic is bit-identical to
    -- the control and exactly one bucket's records disappear.
    if ABLATE then RAM:write_u16(ABLATE - 0x800000, 0) end
    return data
  end)

-- (2) the pre-emptive drops and the runtime cap, counted so a run that never
--     reached them says so instead of being read as "it works".
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80B002, 0x80B005, "pre",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc == 0x23D3BC then cen.drop20 = cen.drop20 + 1 end
    if pc == 0x23D3D8 then cen.drop69 = cen.drop69 + 1 end
    return data
  end)
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80AFC0, 0x80AFFB, "cap",
  function(offset, data, mask)
    if (CPU.state["CURPC"].value & 0xffffff) == 0x23D75A then
      cen.capfired = cen.capfired + 1
      bump(emitpcs, string.format("capbucket_%06X", offset))
    end
    return data
  end)

-- (3) WHO WRITES THE DISPLAY LIST.  The gate's whole claim is that
--     $800000..$8009FF between call #4 and the arm is call #4's output and
--     nobody else's.  That is a MEASUREMENT, not an assumption: every writer's
--     PC is censused here, and anything outside $23D6xx shows up in the report.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x800000, 0x8009FF, "listw",
  function(offset, data, mask)
    -- Only inside the COMPARED window.  Before it the run is still in build A
    -- (the chooser), whose own call #4 equivalent at $13DAxx writes this same
    -- region -- true, and irrelevant to a gate that compares build-B frames.
    if lf >= FROM then
      bump(listwriters, string.format("%06X", CPU.state["CURPC"].value & 0xffffff))
    end
    return data
  end)

-- (3b) WHAT THE EMIT ACTUALLY WROTE, counted per logic frame from three
--      instructions that execute EXACTLY ONCE each per thing:
--        $23D6BE `move.b D3,(-$6,A0)`   -- one per RECORD (a `move.l` would fire
--                                          a write tap TWICE on this 16-bit bus)
--        $23D68C `move.w #$201,(A0)+`   -- one per FILLER
--        $23D6FA `move.w #$0,(A0)+`     -- one per TERMINATOR
--      These are the board's own answer to "how many records, how many fillers,
--      was the list terminated", and without them the terminator decision is
--      invisible whenever the bytes it would have written are already zero.
local ecrec, ecfill, ecterm = 0, 0, 0
TAPS[#TAPS + 1] = PROG:install_write_tap(0x800000, 0x8009FF, "emitc",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc == 0x23D6BE then ecrec = ecrec + 1
    elseif pc == 0x23D68C then ecfill = ecfill + 1
    elseif pc == 0x23D6FA then ecterm = ecterm + 1 end
    return data
  end)

-- (4) the "ROM ERROR !" halt loop -- a halted machine prints plausible numbers
--     and exits 0 (docs/knowledge/02 trap 2).
local IACK = CPU.spaces["cpu_space"]
TAPS[#TAPS + 1] = IACK:install_read_tap(0, 0xffffff, "iak", function(offset, data)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc >= 0x13C398 and pc <= 0x13C39A then cen.halted = cen.halted + 1 end
  return data
end)

-- (5) THE SAMPLE POINT: the semaphore arm, minus the two ISR release PCs.
local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      apply_input(lf)
      if out and pending and lf >= FROM then
        -- lf, the buffered input, then the OUTPUT: $800000..$8009FF verbatim,
        -- and then call #4's OTHER outputs -- the thirty counters it zeroes,
        -- $80AFFC (the previous queue length, which the zeroing loop does NOT
        -- reach), $80AFFE and $80B000/2/4 (the over-budget telemetry and the
        -- two pre-emptive-drop flags) and $80393C (the section flag it clears
        -- and sets back).  Without these the gate cannot see a mutation that
        -- only changes the budget arithmetic or the drop policy.
        local post = bytes(0xafc0, 64) .. bytes(0xb000, 6) .. bytes(0x393c, 2)
          .. string.pack(">I2I2I2", ecrec, ecfill, ecterm)
        out:write(string.pack(">I4I4", lf, #pending), pending, bytes(0, 0xa00),
                  string.pack(">I4", #post), post)
        nrec = nrec + 1
      end
      pending = nil
      ecrec, ecfill, ecterm = 0, 0, 0
      if pixat[lf] then pix_pending = 1; pix_lf = lf end
      if lf >= POKE_FROM then
        for _, k in ipairs(POKES) do RAM:write_u8(k[1], k[2]) end
      end
    end
    return data
  end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return t[a] > t[b] end)
  local o = {}
  for i = 1, math.min(n or 40, #ks) do o[#o + 1] = string.format("%s:%d", ks[i], t[ks[i]]) end
  return table.concat(o, " "), #ks
end

local function finish()
  if out then out:close() end
  local fails = 0
  -- THE ZOOM TABLE, read off the running machine so the port's baked $23C588
  -- constant is asserted against silicon-as-emulated rather than trusted.
  local zt = {}
  for z = 0, 15 do
    zt[#zt + 1] = string.format("%04X%04X", ZOOM:read_u16(z * 4), ZOOM:read_u16(z * 4 + 2))
  end
  p("ZOOMRAM %s", table.concat(zt, " "))
  p("W11 pairs=%d logicframes=%d staged_bytes_max=%d", nrec, lf, cen.maxrec)
  p("W11 preemptive_drop_bucket20=%d preemptive_drop_b6b9=%d runtime_cap_carry=%d",
    cen.drop20, cen.drop69, cen.capfired)
  local s, n = hist(b054, 8);        p("W11 b054 %d distinct: %s", n, s)
  s, n = hist(listwriters, 30);      p("W11 display_list_writer_pcs %d distinct: %s", n, s)
  s, n = hist(emitpcs, 30);          if n > 0 then p("W11 capbuckets %s", s) end
  if PIXDIR then p("W11 framebuffers=%d dir=%s", pix_n, PIXDIR) end
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if cen.halted > 0 then
    p("FAIL %d interrupts inside the $13C398 'ROM ERROR !' halt loop", cen.halted)
    fails = fails + 1
  end
  if OUT and nrec == 0 then
    p("FAIL W11_OUT was set but not one (staged,list) pair was written: call #4 "
      .. "never reached $23D382, or the run never got past W11_FROM")
    fails = fails + 1
  end
  if PIXDIR and pix_n == 0 then
    p("FAIL W11_PIXDIR was set but no framebuffer was written")
    fails = fails + 1
  end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    p("BUILD required=%s last=%d", WANT, lastbuild)
    if lastbuild ~= want then
      p("FAIL the last logic frame armed from build %d, not the required %s",
        lastbuild, WANT)
      fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if pix_pending > 0 and PIXDIR then
    pix_pending = pix_pending - 1
    local fh = io.open(string.format("%s/lf%06d.pixels.bin", PIXDIR, pix_lf), "wb")
    if fh then fh:write(SCR:pixels()); fh:close(); pix_n = pix_n + 1
    else p("FAIL could not write into W11_PIXDIR [%s]", tostring(PIXDIR)) end
  end
  if lf >= RUN and not done then done = true; finish() end
end)
