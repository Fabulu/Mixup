-- RECON 20 diagnostic: WHICH PCs write into the enemy-bullet pool $817F8C..$81B40B?
-- The first pass tapped $28158A/$281898 (the build-B spawn stores read out of the
-- listing) and got ZERO hits while $81B40C showed up to 106 live bullets, so the
-- assumption "the run is executing build B's spawner" is what has to be measured.
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}
local RUN = tonumber(os.getenv("R20_FRAMES") or "3000")
POKE_FROM = tonumber(os.getenv("R20_POKE_FROM") or "0")

local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("R20_INPUT") or ""):gmatch("[^;]+") do
  local n, names = item:match("^(%d+)=(.*)$")
  if n then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f end
    end
    script[tonumber(n)] = fs
  end
end
local function apply_input(n)
  local fs = script[n]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local lf, done = 0, false
local pcs, pcs_typeword, mainpc = {}, {}, {}
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x817F8C, 0x81B40B, "pool", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  bump(pcs, string.format("%06X", pc))
  -- a write of a word whose top bit is set into a slot-aligned offset is a
  -- candidate "type word store", i.e. the actual spawn site
  local rel = offset - 0x817F8C
  if (rel % 0x40) == 0 and (data & 0x8000) ~= 0 then
    bump(pcs_typeword, string.format("%06X", pc))
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
    bump(mainpc, string.format("%01X", (pc >> 20) & 0xf))
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
  for i = 1, math.min(n or 40, #ks) do out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]]) end
  return table.concat(out, " "), #ks
end

local function finish()
  if done then return end
  done = true
  local s, n
  s, n = hist(mainpc, 8); p("SAMPLE-POINT PC nibble (build) %d distinct  %s", n, s)
  s, n = hist(pcs, 60);   p("POOL WRITERS %d distinct  %s", n, s)
  s, n = hist(pcs_typeword, 30); p("TYPEWORD WRITERS %d distinct  %s", n, s)
  p("live=%d 81B414..1A=%04X %04X %04X %04X", RAM:read_u16(0x1b40c),
    RAM:read_u16(0x1b414), RAM:read_u16(0x1b416), RAM:read_u16(0x1b418), RAM:read_u16(0x1b41a))
  p("DONE logicframes=%d", lf)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN then finish() end
end)
