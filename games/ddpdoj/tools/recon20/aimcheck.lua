-- aimcheck.lua -- RECON 20: capture EVERY completed 64-direction aim, with the
-- inputs the routine used, so a from-the-listing MODEL can be diffed against
-- the cartridge.
--
-- THE HOOK.  $242086 `move.l A0,-(A7)` is a stack WRITE that executes exactly
-- once per completed atan2 (00-recon-hard 3: a write tap is the reliable 68000
-- execution hook; a read tap only proves prefetch).  At that instant the front
-- half has finished and D4 = octant*2, D0 = the 0..128 ratio index -- which
-- together ARE the direction before the arctan LUT is applied.
--
-- WHY THE INPUTS ARE RECOVERABLE.  $242038 loads the SHOOTER position from
-- ($2,A6) and $242032 the TARGET position from ($2,A0); A5/A6 are not touched
-- by the routine, so at the tap A6 still points at the shooter's sub-record.
-- The target is whichever player $24270A picked, and that decision is
-- reproducible from ($3,A5) plus the two alive words -- all of which are read
-- here at the same instant.  For call sites that enter at $24202C the
-- reconstruction is EXACT (no caller-supplied offset); for $24200A / $24203E
-- the caller may have biased D0/D1 first, and those rows are expected to
-- disagree -- the disagreement is what MEASURES the muzzle offset.
--
-- The longword ABOVE the pushed A0 is the return address of the call, i.e.
-- WHICH call site asked -- so each row can be attributed statically.
--
-- ENV: R20_FRAMES R20_INPUT R20_POKE_FROM R20_REQUIRE_BUILD R20_TSV R20_MAXROWS
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN     = tonumber(os.getenv("R20_FRAMES") or "3000")
local WANT    = os.getenv("R20_REQUIRE_BUILD")
POKE_FROM     = tonumber(os.getenv("R20_POKE_FROM") or "0")
local TSV     = os.getenv("R20_TSV")
local MAXROWS = tonumber(os.getenv("R20_MAXROWS") or "400000")

local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("R20_INPUT") or ""):gmatch("[^;]+") do
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
local rows, nrow, ndrop = {}, 0, 0

local function s16(v) v = v & 0xffff; if v >= 0x8000 then return v - 0x10000 end return v end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x800000, 0x81ffff, "aim",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    -- $242086 is the 64-direction core's `move.l A0,-(A7)`; $2422EA is the
    -- 256-direction core's.  Both sit between the divu and the arctan LUT.
    if pc ~= 0x242086 and pc ~= 0x2422EA then return data end
    if nrow >= MAXROWS then ndrop = ndrop + 1; return data end
    local a5 = CPU.state["A5"].value & 0xffffff
    local a6 = CPU.state["A6"].value & 0xffffff
    -- ($2,A6)/($4,A6): the shooter's own position, exactly what $242038 read.
    local sy, sx = PROG:read_u16(a6 + 2), PROG:read_u16(a6 + 4)
    local t3 = (a5 >= 0x800000 and a5 < 0x820000) and PROG:read_u8(a5 + 3) or 255
    nrow = nrow + 1
    rows[nrow] = string.format(
      "%d\t%06X\t%06X\t%06X\t%06X\t%d\t%d\t%d\t%d\t%d\t%04X\t%d\t%d\t%04X\t%d\t%d\t%d\t%d",
      lf, pc,
      PROG:read_u32(offset + 4) & 0xffffff,           -- the caller's return addr
      a5, a6,
      CPU.state["D4"].value & 0xffff,                 -- octant*2
      CPU.state["D0"].value & 0xffff,                 -- ratio index 0..128
      s16(sy), s16(sx),                               -- shooter pos, as read
      t3,                                             -- ($3,A5) target index
      RAM:read_u16(0x103e6), s16(RAM:read_u16(0x103e8)), s16(RAM:read_u16(0x103ea)),
      RAM:read_u16(0x10448), s16(RAM:read_u16(0x1044a)), s16(RAM:read_u16(0x1044c)),
      RAM:read_u16(0x13094), RAM:read_u16(0x13098))   -- stage*2, loop
    return data
  end)

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
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
    end
    return data
  end)

local function finish()
  if TSV then
    local f = io.open(TSV, "w")
    f:write("lf\tcore\tret\ta5\ta6\td4\td0\tsy\tsx\tt3\tp1w\tp1y\tp1x\tp2w\tp2y\tp2x\tstage2\tloop\n")
    for i = 1, nrow do f:write(rows[i]); f:write("\n") end
    f:close()
    p("WROTE %s rows=%d dropped=%d", TSV, nrow, ndrop)
  end
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d aims=%d fails=%d", lf, SCR:frame_number(), nrow, fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
