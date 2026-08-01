-- w10bucket.lua -- RECON 10.1: the SPRITE REQUEST PIPELINE, measured.
--
-- Main-loop call #4 ($23D2AE) is the display-list build.  It is a 29-BUCKET
-- gather:  object handlers enqueue 12-byte REQUESTS into 29 private staging
-- buffers (plus one direct-to-queue path), call #4 sums the pending counts,
-- applies a PRE-EMPTIVE overflow policy, then concatenates the buckets into the
-- shared queue at $80397C in a FIXED ORDER and emits 10-byte hardware entries
-- into $800000.
--
-- WHAT THIS PROBE ANSWERS, per logic frame:
--   * every bucket's pending byte count, read at $23D382 -- the one instant when
--     all 30 counters are live and nothing has been dropped yet
--   * whether the PRE-EMPTIVE drop ($23D3B0 drops bucket $80AFDE outright;
--     $23D3CC drops $80AFD2 and $80AFD4) ever fires in natural play
--   * whether the RUNTIME cap ($23D75A, carry -> abandon the whole tail) fires
--   * how many hardware entries and FILLERS the emit actually writes
--   * $80B054, the global offset added to every request's position at emit time
--   * the CURPC census of every write into $80AFC0..$80AFFB = which enqueue
--     stubs actually run, which is the runtime half of the static caller map
--
-- WHY WRITE TAPS: on the 68000 CURPC does not identify an opcode fetch and a
-- read tap only proves prefetch (docs/worklog/ddpdoj/00-recon-hard.md).  Every
-- hook here is on an instruction that unambiguously STORES.
-- A `move.l` write fires a write tap TWICE on this 16-bit bus (wave 2), so the
-- per-entry counter hooks the BYTE store at $23D6BE, not the longword at
-- $23D6B4.
--
-- Tap handles and notifier subscriptions live in GLOBALS or they are GC'd and
-- silently stop firing.
--
-- ENV: W10_FRAMES, W10_INPUT, W10_REQUIRE_BUILD, W10_OUT (optional TSV)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("W10_FRAMES") or "2600")
local WANT = os.getenv("W10_REQUIRE_BUILD")
local OUT  = os.getenv("W10_OUT")

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("W10_INPUT") or ""):gmatch("[^;]+") do
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

local lf, done, lastbuild = 0, false, -1
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- THE DRAIN ORDER, read out of $23D3E0..$23D622 by tools/w10/buckets.py.
-- index 1..29 = drain position; value = counter address low word.
local DRAIN = { 0xAFC2, 0xAFC4, 0xAFC6, 0xAFCC, 0xAFD0, 0xAFD2, 0xAFC8, 0xAFCA,
                0xAFD4, 0xAFE8, 0xAFF0, 0xAFEA, 0xAFEC, 0xAFD6, 0xAFDA, 0xAFD8,
                0xAFCE, 0xAFF8, 0xAFDC, 0xAFDE, 0xAFE4, 0xAFE0, 0xAFE2, 0xAFFA,
                0xAFE6, 0xAFEE, 0xAFF2, 0xAFF4, 0xAFF6 }

local bmax, bsum, bframes = {}, {}, {}
for i = 1, 29 do bmax[i], bsum[i], bframes[i] = 0, 0, 0 end
local b0max, b0sum, b0frames = 0, 0, 0     -- $80AFC0, the direct-to-queue path
local totmax, totn, over_bd0 = 0, 0, 0
local pre20, pre69 = 0, 0                  -- pre-emptive drop firings
local runtime_full = 0                     -- $23D75A firings (the carry path)
local ent_pf, filler_pf = 0, 0
local entmax, fillmax, ent_hist = 0, 0, {}
local stubpc = {}
local b054 = {}
local rows = {}

-- (1) THE ONE INSTANT ALL 30 COUNTERS ARE LIVE: $23D382 `move.w D0,$80B000`.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80B000, 0x80B001, "sum", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc ~= 0x23D382 then return data end
  local tot, line = 0, {}
  local v0 = RAM:read_u16(0xAFC0)
  b0sum = b0sum + v0; if v0 > b0max then b0max = v0 end
  if v0 > 0 then b0frames = b0frames + 1 end
  tot = tot + v0
  line[#line + 1] = tostring(v0 // 12)
  for i = 1, 29 do
    local v = RAM:read_u16(DRAIN[i])
    bsum[i] = bsum[i] + v
    if v > bmax[i] then bmax[i] = v end
    if v > 0 then bframes[i] = bframes[i] + 1 end
    tot = tot + v
    line[#line + 1] = tostring(v // 12)
  end
  totn = totn + 1
  if tot > totmax then totmax = tot end
  if tot >= 0xBD0 then over_bd0 = over_bd0 + 1 end
  bump(b054, string.format("%08X", RAM:read_u32(0xB054)))
  if OUT then rows[#rows + 1] = string.format("%d\t%d\t%s", lf, tot // 12,
                                              table.concat(line, "\t")) end
  return data
end)

-- (2) THE PRE-EMPTIVE DROPS.  $23D3BC sets $80B002; $23D3D8 sets $80B004.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80B002, 0x80B005, "pre", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x23D3BC then pre20 = pre20 + 1 end
  if pc == 0x23D3D8 then pre69 = pre69 + 1 end
  return data
end)

-- (3) THE RUNTIME CAP.  $23D75A `clr.w (A1)` zeroes the CURRENT bucket's
--     remaining count and returns with carry; all 29 call sites `bcs $23D624`,
--     abandoning the whole remaining TAIL.
--     The write lands in $80AFC2..$80AFFA, so this shares the range with (4).
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80AFC0, 0x80AFFB, "q", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x23D75A then runtime_full = runtime_full + 1 end
  bump(stubpc, string.format("%06X", pc))
  return data
end)

-- (4) THE EMIT.  $23D6BE `move.b D3,(-$6,A0)` is exactly one BYTE store per
--     hardware entry; $23D68C `move.w #$201,(A0)+` is one per FILLER.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x800000, 0x8009FF, "emit", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x23D6BE then ent_pf = ent_pf + 1
  elseif pc == 0x23D68C then filler_pf = filler_pf + 1 end
  return data
end)

-- (5) THE SAMPLE POINT.
local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    apply_input(lf)
    if ent_pf > entmax then entmax = ent_pf end
    if filler_pf > fillmax then fillmax = filler_pf end
    bump(ent_hist, ent_pf - (ent_pf % 10))
    ent_pf, filler_pf = 0, 0
  end
  return data
end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return t[a] > t[b] end)
  local out = {}
  for i = 1, math.min(n or 40, #ks) do
    out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]])
  end
  return table.concat(out, " "), #ks
end

local function finish()
  p("SAMPLES %d  (frames on which call #4 reached $23D382)", totn)
  p("BUCKET  drain#  ctr      recs_max  recs_mean  frames_nonzero")
  p("BUCKET   0(direct) $80AFC0 %8d %10.2f %6d",
    b0max // 12, (b0sum / math.max(totn, 1)) / 12, b0frames)
  for i = 1, 29 do
    p("BUCKET  %2d       $80%04X %8d %10.2f %6d",
      i, DRAIN[i], bmax[i] // 12, (bsum[i] / math.max(totn, 1)) / 12, bframes[i])
  end
  p("TOTAL   pending records max=%d  (cap $BC4=251, pre-emptive test $BD0=252)", totmax // 12)
  p("OVERFLOW frames_total>=252recs=%d  preemptive_drop_bucket20=%d  preemptive_drop_b6b9=%d  runtime_cap_carry=%d",
    over_bd0, pre20, pre69, runtime_full)
  p("EMIT    hardware entries max/frame=%d  fillers max/frame=%d", entmax, fillmax)
  local s = hist(ent_hist, 24); p("EMIT    entries/frame hist(bucket 10) %s", s)
  local n
  s, n = hist(stubpc, 60); p("STUBS   %d distinct PCs writing $80AFC0..FB: %s", n, s)
  s, n = hist(b054, 8);    p("B054    %d distinct values of $80B054: %s", n, s)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if totn == 0 then p("FAIL call #4 never reached $23D382"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  if OUT then
    local f = io.open(OUT, "w")
    if f then
      local hd = { "lf", "total" , "q0" }
      for i = 1, 29 do hd[#hd + 1] = string.format("b%02d_%04X", i, DRAIN[i]) end
      f:write(table.concat(hd, "\t"), "\n")
      for _, r in ipairs(rows) do f:write(r, "\n") end
      f:close()
    else
      p("FAIL could not open W10_OUT"); fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
