-- w20maprec.lua -- WAVE 20 recon (level data): record EVERY longword the board
-- writes into the BG map ring ($900000..$900FFF) for a whole stage-1 run, so
-- the statically decoded column stream can be checked column for column against
-- the cartridge's own behaviour over the WHOLE stage, not just the 161-frame
-- capture window.
--
-- The ring writer is $240D76 (20-recon-scroll-engine.md §2):
--     D0 = (row << 6) + col ; D0 <<= 2 ; ($900000 + D0) = D4
-- so entry index = (offset-$900000)/4, row = idx>>6, col = idx & 63, and the
-- longword is (tile:u16, attr:u16) with the per-stage base ALREADY ADDED.
--
-- Env:  W20_FRAMES  logic frames to run
--       W20_INPUT   the shared "lf=BUTTONS;..." script
--       W20_POKE_FROM  logic frame from which to hold $810424 (invulnerability)
--       W20_OUT     TSV: lf  clock  idx  row  col  tile  attr
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("W20_FRAMES") or "10000")
local OUTF = os.getenv("W20_OUT")
local POKE_FROM = tonumber(os.getenv("W20_POKE_FROM") or "0")

local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("W20_INPUT") or ""):gmatch("[^;]+") do
  local lfx, names = item:match("^(%d+)=(.*)$")
  if lfx then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lfx)] = fs
  end
end
local function apply_input(n)
  local fs = script[n]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local lf, done, errs = 0, false, 0
local rows = {}
local nwrite, npc = 0, {}

TAPS[#TAPS + 1] = PROG:install_write_tap(0x900000, 0x900FFF, "bgmap",
  function(offset, data, mask)
    local ok = pcall(function()
      local pc = CPU.state["CURPC"].value & 0xffffff
      npc[string.format("%06X", pc)] = (npc[string.format("%06X", pc)] or 0) + 1
      nwrite = nwrite + 1
      -- MAME splits the ring writer's `move.l D4,(...)` into TWO 16-bit writes:
      -- byte offset +0 carries the TILE word, +2 carries the ATTR word.  Log
      -- the half so the reader never has to infer it from row order.
      local byteoff = offset - 0x900000
      local idx = byteoff >> 2
      if #rows < 260000 then
        rows[#rows + 1] = string.format("%d\t%d\t%d\t%d\t%d\t%d\t%04X",
          lf, RAM:read_u16(0x130CE), idx, idx >> 6, idx & 63,
          (byteoff >> 1) & 1, data & 0xffff)
      end
    end)
    if not ok then errs = errs + 1 end
    return data
  end)

-- THE SAMPLE POINT, copied from bgrecon.lua/recon20.lua: the $803940 semaphore
-- rising edge, ignoring the two release sites.
local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      apply_input(lf)
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
    end
    return data
  end)

local function finish()
  if done then return end
  done = true
  p("bg-map longword writes: %d  rows kept %d  tapErrors %d", nwrite, #rows, errs)
  local ks = {}
  for k in pairs(npc) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return npc[a] > npc[b] end)
  local o = {}
  for i = 1, math.min(8, #ks) do o[#o + 1] = string.format("%s:%d", ks[i], npc[ks[i]]) end
  p("WRITER PCs %d distinct  %s", #ks, table.concat(o, " "))
  p("final $8130CE=%04X  $813096(stage)=%04X  $8130D2=%04X  $81318A=%04X",
    RAM:read_u16(0x130CE), RAM:read_u16(0x13096), RAM:read_u16(0x130D2),
    RAM:read_u16(0x1318A))
  if OUTF then
    local f = io.open(OUTF, "w")
    f:write("lf\tclock\tidx\trow\tcol\thalf\tword\n")
    for _, r in ipairs(rows) do f:write(r, "\n") end
    f:close()
    p("ROWS %d -> %s", #rows, OUTF)
  end
  p("DONE logicframes=%d", lf)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN then finish() end
end)
