-- w26mover.lua -- WAVE 26: THE BULLET MOVER per-frame BEFORE/AFTER pool dump.
--
-- The mover $281DDE is the per-frame update that drives the live pool.  To test
-- it in ISOLATION (no spawn mixing) this probe captures the WHOLE pool twice a
-- frame: immediately BEFORE the mover runs and immediately AFTER it returns.
-- The gate then seeds the port from BEFORE, runs `runMover` once, and compares
-- to AFTER -- so any divergence is the mover's, not the spawn side's.
--
-- THE TWO TAP POINTS (both in the bullet per-frame driver $281D9A):
--   BEFORE  $281DA6 `clr.w $81B40C`   -- the livecount clear, one insn before
--                                        `bsr $281DDE`.  Tap $81B40C @ PC=$281DA6.
--   AFTER   $281DCE `move.w D0,$80AFE0` -- the sprite-offset store, four insns
--                                        after the mover returns. Tap $80AFE0 @ PC=$281DCE.
-- A logic frame in which the driver does not run produces no rows for that lf,
-- which is correct (the mover did not run either).
--
-- ROWS:
--   B <lf> <globals...>           BEFORE the mover, then one P row per LIVE slot
--   P <slot> <128 hex = the $40-byte record>
--   A <lf>                        AFTER the mover, then one P row per LIVE slot
-- GLOBALS on the B row: scroll d6=$813176, window $81B414/6/8/A, freezeC $811F72,
--   stageKill $8130F8, cadence $81B40E, livecount $81B40C, rank $813098.
--
-- ENV: W26_FRAMES W26_INPUT W26_INVULN_FROM W26_REQUIRE_BUILD W26_TSV
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS = {}                   -- GLOBAL: a local handle is GC'd and the tap goes silent

local RUN     = tonumber(os.getenv("W26_FRAMES")     or "6000")
local INVULN  = tonumber(os.getenv("W26_INVULN_FROM") or "0")
local WANT    = os.getenv("W26_REQUIRE_BUILD")
local TSV     = os.getenv("W26_TSV")
local fh      = TSV and io.open(TSV, "w") or nil

local POOL, SLOTS, STRIDE = 0x817F8C, 210, 0x40

-- --------------------------------------------------------------- build check
local function build()
  -- the version byte (build B = BLACK VER).  Tap a known code address.
  local ok, v = pcall(function() return PROG:read_u8(0x234008) end)
  return ok and v or -1
end
-- report build once at first frame

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVC = M.ioport.ports[":Service"]
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local function resolve(names)
  local fs = {}
  for c in names:gmatch(".") do
    local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
    if f then fs[#fs + 1] = f end
  end
  return fs
end
local held, held_key = {}, nil
local function set_held(names)
  if names == held_key then return end
  held_key = names
  for _, f in ipairs(held) do f:set_value(0) end
  held = resolve(names)
  for _, f in ipairs(held) do f:set_value(1) end
end
local script = {}
for item in (os.getenv("W26_INPUT") or ""):gmatch("[^;]+") do
  local lfn, names = item:match("^(%d+)=(.*)$")
  if lfn then script[tonumber(lfn)] = names end
end

-- --------------------------------------------------------------- the pool dump
local function recHex(slot)
  -- the full $40-byte record as 128 hex chars (big-endian, as the 68000 lays it)
  local base = POOL + slot * STRIDE - 0x800000
  local out = {}
  for i = 0, STRIDE - 1, 2 do
    out[#out + 1] = string.format("%02X%02X", RAM:read_u8(base + i),
                                  RAM:read_u8(base + i + 1))
  end
  return table.concat(out)
end

local function dumpPool(tag, lf)
  if not fh then return end
  local g = {
    string.format("d6=%04X", RAM:read_u16(0x13176)),
    string.format("w0=%04X", RAM:read_u16(0x1B414)),
    string.format("w1=%04X", RAM:read_u16(0x1B416)),
    string.format("w2=%04X", RAM:read_u16(0x1B418)),
    string.format("w3=%04X", RAM:read_u16(0x1B41A)),
    string.format("fc=%04X", RAM:read_u16(0x11F72)),
    string.format("sk=%04X", RAM:read_u16(0x130F8)),
    string.format("cad=%04X", RAM:read_u16(0x1B40E)),
    string.format("lc=%04X", RAM:read_u16(0x1B40C)),
    string.format("rank=%04X", RAM:read_u16(0x13098)),
  }
  fh:write(tag .. "\t" .. lf .. "\t" .. table.concat(g, "\t") .. "\n")
  local live = 0
  for s = 0, SLOTS - 1 do
    local tw = RAM:read_u16(POOL + s * STRIDE - 0x800000)
    if (tw & 0x8000) ~= 0 then
      fh:write(string.format("P\t%d\t%s\n", s, recHex(s)))
      live = live + 1
    end
  end
  return live
end

-- ------------------------------------------------------- the logic-frame semaphore
-- W21's mechanism: a write to $803940 that flips it 0 -> non-zero (by a PC NOT
-- in REL) marks ONE LOGIC FRAME.  lf is advanced here, input is applied here,
-- and the run stops here -- NOT in the mover tap (the mover does not run every
-- frame, so tying lf to it freezes input and the game never starts).
local REL = { [0x13C806] = true, [0x23C46C] = true }
local lf = 0
local reported = false
local tapErr, lastErr = 0, ""
local lastbuild = -1

local function advanceLf(pc)
  local ok, err = pcall(function()
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    if not reported then
      p("BUILD (PC>>20)&$F = %d  (build B = 2)", lastbuild)
      reported = true
    end
    if INVULN > 0 and lf >= INVULN then RAM:write_u8(0x10424, 0xFF) end
    local s = script[lf]
    if s then set_held(s) end
  end)
  if not ok then tapErr = tapErr + 1; lastErr = tostring(err) end
end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "w26lf",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then advanceLf(pc) end
    return data
  end)

-- ------------------------------------------------------- the two pool tap points
local function beforeMover()
  local ok, err = pcall(function() dumpPool("B", lf) end)
  if not ok then tapErr = tapErr + 1; lastErr = tostring(err) end
end
local function afterMover()
  local ok, err = pcall(function() dumpPool("A", lf) end)
  if not ok then tapErr = tapErr + 1; lastErr = tostring(err) end
end

-- BEFORE: $81B40C written by `clr.w $81B40C` at $281DA6 (one insn before the mover).
TAPS[#TAPS + 1] = PROG:install_write_tap(0x81B40C, 0x81B40D, "w26b",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc == 0x281DA6 then beforeMover() end
    return data
  end)

-- AFTER: $80AFE0 written by `move.w D0,$80AFE0` at $281DCE (four insns after the mover).
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80AFE0, 0x80AFE1, "w26a",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc == 0x281DCE then afterMover() end
    return data
  end)

-- ------------------------------------------------------------- the stop
local function finish()
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if tapErr > 0 then p("FAIL tap callback raised: %s", lastErr); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL build %d, wanted %s", lastbuild, WANT); fails = fails + 1
    end
  end
  if fh then fh:close() end
  p("DONE logicframes=%d tapErr=%d fails=%d", lf, tapErr, fails)
  M:exit()
end

SUBS = SUBS or {}
SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf % 500 == 0 and lf > 0 then
    p("LF %d", lf)
    if fh then fh:flush() end
  end
  if lf >= RUN then finish() end
end)

p("W26 MOVER tap: %d frames, invuln_from=%d, tsv=%s", RUN, INVULN, TSV or "(stdout)")
