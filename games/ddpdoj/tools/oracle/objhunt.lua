-- objhunt.lua -- WAVE 2 item 1: LOCATE THE TOP-LEVEL OBJECT DRIVER.
--
-- The method, and why it is this one.  00-recon-memmap.md produced a write MAP
-- (which pages, how many writes) and 00-recon-hard.md produced a writer list for
-- the sprite display list only.  Neither gives the thing wave 2 needs: a per-slot
-- loop with a STRIDE and a COUNT.  So this probe attributes every write in a RAM
-- range to the writing instruction (CURPC) and, per instruction, measures
--
--   * the offsets it touches (min, max, and the GCD of consecutive deltas = the
--     STRIDE of the table it is walking),
--   * how many times it fires PER LOGIC FRAME (the (C) detector: a per-slot
--     instruction's per-frame count IS "object slots processed"),
--   * the ORDER of the offsets within one frame, for one chosen PC.
--
-- WHY CURPC IS LEGITIMATE HERE AND NOT FOR EXECUTION HOOKS.  On the 68000 a READ
-- tap fires on the prefetch and CURPC lags the fetch, so `CURPC == tapped
-- address` cannot prove execution (docs/worklog/ddpdoj/00-recon-hard.md §3, and
-- NOTES-oracle.md §2).  A WRITE is never speculative: when a write tap fires,
-- CURPC is the instruction that issued the bus cycle.  That is why every
-- attribution in this project goes through write taps.
--
-- Tap handles and notifier subscriptions live in GLOBALS.  A dropped handle is
-- garbage-collected and the hook SILENTLY STOPS FIRING; three agents hit this.
--
-- ENV
--   OBJ_FRAMES   logic frames to run                         (default 2600)
--   OBJ_INPUT    button script, same syntax as frame.lua's PROBE_INPUT
--   OBJ_LO/OBJ_HI  68k address range to tap    (default $800000-$81FFFF)
--   OBJ_SKIPSTACK 1 = ignore writes to $81FF00-$81FFFF (the stack: 1714/frame)
--   OBJ_TRACK    "pc[,pc...]" hex -- for these PCs record the OFFSET SEQUENCE of
--                one frame (OBJ_TRACKFRAME) and per-frame counts for all frames
--   OBJ_TRACKFRAME  logic frame whose offset sequence to dump   (default: last)
--   OBJ_TOP      how many PCs to report                      (default 60)
--   OBJ_REGS     "pc" hex -- dump D0-D7/A0-A7 at the first 24 hits of this PC
--   OBJ_REQUIRE_BUILD  "A"|"B"
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                              -- GLOBALS. See the header.

local RUN     = tonumber(os.getenv("OBJ_FRAMES") or "2600")
local LO      = tonumber(os.getenv("OBJ_LO") or "800000", 16)
local HI      = tonumber(os.getenv("OBJ_HI") or "81FFFF", 16)
local TOP     = tonumber(os.getenv("OBJ_TOP") or "60")
local SKIPSTK = os.getenv("OBJ_SKIPSTACK") == "1"
local WANT    = os.getenv("OBJ_REQUIRE_BUILD")
local TRACKF  = tonumber(os.getenv("OBJ_TRACKFRAME") or "0")
local REGPC   = tonumber(os.getenv("OBJ_REGS") or "0", 16)

local TRACK = {}
for tok in (os.getenv("OBJ_TRACK") or ""):gmatch("[^,]+") do
  TRACK[tonumber(tok, 16)] = true
end

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("OBJ_INPUT") or ""):gmatch("[^;]+") do
  local lf, names = item:match("^(%d+)=(.*)$")
  if lf then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lf)] = fs
  end
end
local function apply_input(lf)
  local fs = script[lf]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

-- ------------------------------------------------------------------ state
local lf, done = 0, false
local W = {}          -- pc -> {n, lo, hi, last, gcd, thisframe, maxpf, minpf, frames}
local seq, seqframe = {}, nil
local percount = {}   -- pc -> { [lf] = count }  (only for TRACK pcs)
local buildhist, lastbuild = {}, -1
local regdump = 0

local function gcd(a, b)
  while b ~= 0 do a, b = b, a % b end
  return a
end

-- ------------------------------------------------------------------ taps
-- Write tap over the range, attributed by CURPC.  16-bit space: the range must
-- be word-aligned or MAME dies with "end address has low bits unset".
TAPS[#TAPS + 1] = PROG:install_write_tap(LO, HI, "objmap", function(offset, data, mask)
  if SKIPSTK and offset >= 0x81FF00 then return data end
  local pc = CPU.state["CURPC"].value & 0xffffff
  local e = W[pc]
  if not e then
    e = { n = 0, lo = offset, hi = offset, last = -1, g = 0,
          tf = 0, maxpf = 0, minpf = 1 / 0, frames = 0 }
    W[pc] = e
  end
  e.n = e.n + 1
  if offset < e.lo then e.lo = offset end
  if offset > e.hi then e.hi = offset end
  if e.last >= 0 then
    local d = offset - e.last
    if d ~= 0 then e.g = gcd(e.g, d < 0 and -d or d) end
  end
  e.last = offset
  e.tf = e.tf + 1
  if TRACK[pc] then
    if seqframe == lf and #seq < 4096 then
      seq[#seq + 1] = string.format("%06X", offset)
    end
  end
  if REGPC == pc and regdump < 24 then
    regdump = regdump + 1
    local s = {}
    for _, r in ipairs({"D0","D1","D2","D3","D4","D5","D6","D7",
                        "A0","A1","A2","A3","A4","A5","A6","SP"}) do
      s[#s + 1] = string.format("%s=%08X", r, CPU.state[r].value & 0xffffffff)
    end
    p("REGS pc=%06X off=%06X data=%04X mask=%04X %s",
      pc, offset, data & 0xffff, mask & 0xffff, table.concat(s, " "))
  end
  return data
end)

-- The sample point: the 0 -> non-zero transition of the vblank semaphore
-- $803940 (see frame.lua's header).  Every per-frame quantity is bucketed by
-- the GAME'S OWN frame, never by the video frame -- the two come apart exactly
-- when slowdown happens.
local REL = {}
for tok in (os.getenv("OBJ_REL") or "13C806,23C46C"):gmatch("[^,]+") do
  REL[tonumber(tok, 16)] = true
end
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    buildhist[lastbuild] = (buildhist[lastbuild] or 0) + 1
    apply_input(lf)
    for k, e in pairs(W) do
      if e.tf > 0 then
        e.frames = e.frames + 1
        if e.tf > e.maxpf then e.maxpf = e.tf end
        if e.tf < e.minpf then e.minpf = e.tf end
        if TRACK[k] then
          percount[k] = percount[k] or {}
          percount[k][lf] = e.tf
        end
        e.tf = 0
      end
    end
    if TRACKF > 0 and lf == TRACKF - 1 then seqframe = lf + 1; seq = {} end
  end
  return data
end)

-- ------------------------------------------------------------------ report
local function finish()
  local list = {}
  for pc, e in pairs(W) do list[#list + 1] = { pc = pc, e = e } end
  table.sort(list, function(a, b) return a.e.n > b.e.n end)
  p("RANGE $%06X-$%06X frames=%d distinct_writer_pcs=%d", LO, HI, lf, #list)
  for i = 1, math.min(TOP, #list) do
    local x = list[i]
    p("W pc=%06X n=%d off=%06X..%06X span=%d stride=%d "
      .. "perframe_min=%d perframe_max=%d frames_active=%d",
      x.pc, x.e.n, x.e.lo, x.e.hi, x.e.hi - x.e.lo, x.e.g,
      x.e.minpf == 1 / 0 and -1 or x.e.minpf, x.e.maxpf, x.e.frames)
  end
  for pc in pairs(TRACK) do
    local t = percount[pc]
    if t then
      local hist, mn, mx = {}, 1 / 0, 0
      local ks = {}
      for f, c in pairs(t) do
        hist[c] = (hist[c] or 0) + 1
        if c < mn then mn = c end
        if c > mx then mx = c end
        ks[#ks + 1] = f
      end
      table.sort(ks)
      local hs = {}
      local cs = {}
      for c in pairs(hist) do cs[#cs + 1] = c end
      table.sort(cs)
      for _, c in ipairs(cs) do hs[#hs + 1] = string.format("%d:%d", c, hist[c]) end
      p("TRACK pc=%06X per_logicframe_counts min=%d max=%d hist=%s",
        pc, mn, mx, table.concat(hs, " "))
      -- the raw series, so a reader can see WHEN it moved
      local ser = {}
      for _, f in ipairs(ks) do ser[#ser + 1] = string.format("%d=%d", f, t[f]) end
      for i = 1, #ser, 40 do
        p("TRACKSERIES pc=%06X %s", pc, table.concat(ser, " ", i, math.min(i + 39, #ser)))
      end
    end
  end
  if seqframe then
    p("SEQ frame=%d n=%d", seqframe, #seq)
    for i = 1, #seq, 32 do
      p("SEQ %s", table.concat(seq, " ", i, math.min(i + 31, #seq)))
    end
  end
  local bs = {}
  for b, n in pairs(buildhist) do bs[#bs + 1] = string.format("%d:%d", b, n) end
  p("CENSUS build_by_armpc_top_nibble %s lastbuild=%d", table.concat(bs, " "), lastbuild)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL the LAST logic frame armed from build %d, not the required %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
