-- tapcal.lua -- CALIBRATE the read tap on THIS cpu (68000 @ 20 MHz, PGM).
--
-- NOTES-mame-oracle.md says a read tap is an execution hook and CURPC
-- discriminates fetch from data read. That was proven on the NES 6502.
-- On the 68000 the tap fires on the PREFETCH, so CURPC does NOT equal the
-- tapped address. This probe measures what it actually equals, at a known
-- code address (the level-6 autovector handler read out of the vector table)
-- and at a known DATA address (the sprite list at $800000).
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local ROM  = M.memory.regions[":maincpu"]

TAPS, SUBS = {}, {}

local H6 = ROM:read_u32(0x78)
local H4 = ROM:read_u32(0x70)
p("H4=%08X H6=%08X", H4, H6)

local n6, shown = 0, 0
local rel = {}     -- histogram of CURPC - tapped address

TAPS[#TAPS+1] = PROG:install_read_tap(H6, H6 + 1, "h6", function(offset, data, mask)
  n6 = n6 + 1
  local curpc = CPU.state["CURPC"].value
  local pc    = CPU.state["PC"].value
  local d = curpc - offset
  rel[d] = (rel[d] or 0) + 1
  if shown < 12 then
    shown = shown + 1
    p("H6hit off=%06X data=%04X CURPC=%06X PC=%06X SP=%06X IR=%04X",
      offset, data, curpc, pc, CPU.state["SP"].value, CPU.state["IR"].value)
  end
  return data
end)

-- a pure DATA address for contrast: main RAM word 0
local nd, shownd = 0, 0
local reld = {}
TAPS[#TAPS+1] = PROG:install_read_tap(0x800000, 0x800001, "dat", function(offset, data, mask)
  nd = nd + 1
  local curpc = CPU.state["CURPC"].value
  reld[curpc] = (reld[curpc] or 0) + 1
  if shownd < 8 then
    shownd = shownd + 1
    p("DATAhit off=%06X data=%04X CURPC=%06X PC=%06X", offset, data, curpc,
      CPU.state["PC"].value)
  end
  return data
end)

local dumped = false
SUBS[#SUBS+1] = emu.add_machine_frame_notifier(function()
  if SCR:frame_number() >= 400 and not dumped then
    dumped = true
    p("H6_tap_hits=%d DATA_tap_hits=%d frames=%d", n6, nd, SCR:frame_number())
    local a = {}
    for k, v in pairs(rel) do a[#a+1] = {k, v} end
    table.sort(a, function(x, y) return x[2] > y[2] end)
    for i = 1, math.min(#a, 8) do p("H6 CURPC-addr=%d n=%d", a[i][1], a[i][2]) end
    local b = {}
    for k, v in pairs(reld) do b[#b+1] = {k, v} end
    table.sort(b, function(x, y) return x[2] > y[2] end)
    p("DATA_reader_sites=%d", #b)
    for i = 1, math.min(#b, 10) do p("DATA reader CURPC=%06X n=%d", b[i][1], b[i][2]) end
    M:exit()
  end
end)
