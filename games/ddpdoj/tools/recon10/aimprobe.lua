-- aimprobe.lua -- RECON 10: WHO READS THE LIVE PLAYER, AND FROM WHERE.
--
-- The owner's lesson from play: the capture's enemies aim at where the ORIGINAL
-- player was.  Simulated enemies must aim at the LIVE player.  So the question
-- is not "is there an aim routine" (the listing answers that: $24202C ->
-- $24270A -> $242038, a divu-based atan2 into a 6-bit direction) but "which
-- code reads the player's live position, how often, and does it re-read it".
--
-- METHOD, and why a READ tap is legitimate here.  00-recon-hard.md 3 says a
-- READ tap only proves PREFETCH and CURPC does not identify an opcode fetch --
-- that rule is about taps placed on CODE.  $8103E6..$8103EF is main RAM that
-- the 68000 never executes from, so a read there is a genuine DATA read and
-- CURPC is the reading instruction (or the instruction that prefetched past
-- it, which cannot happen for a RAM operand).  The census below is therefore a
-- PC histogram of the player-position readers, which is exactly the field the
-- port has to reproduce.
--
--   $8103E6  P1 record word 0   bit 15 = alive   ($24270A tests it)
--   $8103E8  P1 axis A          ($242022 movem.w $8103E8,D2-D3)
--   $8103EA  P1 axis B
--   $810448  P2 record word 0   (stride $62)
--
-- ENV: R10_FRAMES R10_INPUT R10_REQUIRE_BUILD R10_POKE_FROM R10_PCTSV
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("R10_FRAMES") or "3000")
local WANT = os.getenv("R10_REQUIRE_BUILD")
POKE_FROM  = tonumber(os.getenv("R10_POKE_FROM") or "0")
local PCTSV = os.getenv("R10_PCTSV")

local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("R10_INPUT") or ""):gmatch("[^;]+") do
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

local rd_pos, rd_alive, aim_pc, aim_n = {}, {}, {}, 0
local aim_oct, aim_ratio, aim_ppos = {}, {}, {}
local aim_pa, aim_pb = 0, 0
local rd_pos_n, rd_alive_n = 0, 0

-- (1) the POSITION words.  Any PC here is reading where the player IS.
TAPS[#TAPS + 1] = PROG:install_read_tap(0x8103E8, 0x8103EB, "pos", function(offset, data, mask)
  bump(rd_pos, string.format("%06X", CPU.state["CURPC"].value & 0xffffff))
  rd_pos_n = rd_pos_n + 1
  return data
end)

-- (2) the ALIVE word -- $24270A's target-selection test.
TAPS[#TAPS + 1] = PROG:install_read_tap(0x8103E6, 0x8103E7, "alive", function(offset, data, mask)
  bump(rd_alive, string.format("%06X", CPU.state["CURPC"].value & 0xffffff))
  rd_alive_n = rd_alive_n + 1
  return data
end)

-- (3) THE AIM ITSELF.  $242086 `move.l A0,-(A7)` sits between the divu and the
--     arctan LUT in $242038's common tail, so it is a WRITE that executes
--     exactly once per completed aim.  The stack lives in main RAM; tap a
--     window around it and filter on the PC.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x800000, 0x81FFFF, "aim", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x242086 then
    aim_n = aim_n + 1
    -- `offset` is the stack slot the pushed A0 lands in; the longword ABOVE it
    -- is the return address of the `jsr $24202C` that asked for the aim, i.e.
    -- WHICH enemy routine is aiming.
    bump(aim_pc, string.format("from%06X", PROG:read_u32(offset + 4) & 0xffffff))
    -- THE AIM'S OWN OUTPUT, before the LUT: D4 = the octant (0..7, built by
    -- the three sign/magnitude tests at $24204C..$242066) and D0 = the 6-bit
    -- ratio min/max*64 that indexes the arctan LUT at $2420F6.  Together they
    -- ARE the direction.  Recorded with the LIVE player position so that a
    -- moving-stick run and a still-stick run can be compared directly.
    local d4 = CPU.state["D4"].value & 0xffff
    local d0 = CPU.state["D0"].value & 0xffff
    bump(aim_oct, string.format("%d", d4 // 2))
    bump(aim_ratio, string.format("%02d", d0 // 8))
    aim_pa, aim_pb = RAM:read_u16(0x103e8), RAM:read_u16(0x103ea)
    bump(aim_ppos, string.format("%d,%d", aim_pa // 256, aim_pb // 256))
  end
  return data
end)

local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
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
  local s, n = hist(rd_pos, 60)
  p("READERS of $8103E8/$8103EA (P1 position): %d distinct PCs, %d reads", n, rd_pos_n)
  p("READERS pos %s", s)
  s, n = hist(rd_alive, 40)
  p("READERS of $8103E6 (P1 alive word): %d distinct PCs, %d reads", n, rd_alive_n)
  p("READERS alive %s", s)
  p("AIM $242086 executions (one per completed atan2) = %d", aim_n)
  s, n = hist(aim_pc, 40)
  p("AIM callers (return address on the stack): %d distinct  %s", n, s)
  s, n = hist(aim_oct, 10);   p("AIM octant D4/2: %d distinct  %s", n, s)
  s, n = hist(aim_ratio, 12); p("AIM ratio D0/8:  %d distinct  %s", n, s)
  s, n = hist(aim_ppos, 24)
  p("AIM player position at the aim (posA/256,posB/256): %d distinct  %s", n, s)
  if PCTSV then
    local f = io.open(PCTSV, "w")
    if f then
      f:write("kind\tpc\tcount\n")
      for k, v in pairs(rd_pos) do f:write("pos\t" .. k .. "\t" .. v .. "\n") end
      for k, v in pairs(rd_alive) do f:write("alive\t" .. k .. "\t" .. v .. "\n") end
      f:close()
      p("WROTE %s", PCTSV)
    end
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
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
