-- reg.lua -- can we read CPU registers AT an execution hook, and attribute a write to its writer?
M   = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
PAD1 = M.ioport.ports[":ctrl1:joypad:JOYPAD"]
OUT = assert(io.open(os.getenv("MAMEOUT") or "reg.tsv", "w"))
NFR = tonumber(os.getenv("MAMEFRAMES") or "1200")

VFRAME, GFRAME = 0, 0
HOOKS = {}
SAMPLES = {}
PCHIST = {}

-- 1) registers at an execution hook: $8087 is `STY $4014` (OAM DMA trigger); Y must be $02
HOOKS[#HOOKS+1] = PRG:install_read_tap(0x8087, 0x8087, "oamdma", function()
  if #SAMPLES < 6 then
    SAMPLES[#SAMPLES+1] = string.format(
      "gframe=%d A=%02X X=%02X Y=%02X SP=%02X P=%02X PC=%04X CURPC=%04X GENPC=%04X IR=%02X",
      GFRAME, CPU.state["A"].value, CPU.state["X"].value, CPU.state["Y"].value,
      CPU.state["SP"].value, CPU.state["P"].value, CPU.state["PC"].value,
      CPU.state["CURPC"].value, CPU.state["GENPC"].value, CPU.state["IR"].value)
  end
end)

-- 2) attribute writes into the candidate object arrays to the code that made them
HOOKS[#HOOKS+1] = PRG:install_write_tap(0x0300, 0x037F, "objw", function(off, d, mk)
  local pc = CPU.state["CURPC"].value
  local k = string.format("%04X", pc)
  local e = PCHIST[k]
  if e then e.n = e.n + 1; e.lo = math.min(e.lo, off); e.hi = math.max(e.hi, off)
  else PCHIST[k] = { n = 1, lo = off, hi = off } end
end)

-- 3) per-game-frame counters
E = {}
HOOKS[#HOOKS+1] = PRG:install_read_tap(0x806A, 0x806A, "nmi", function() GFRAME = GFRAME + 1 end)

SCRIPT = { {240,246,{"P1 Start"}}, {300,306,{"P1 Start"}}, {420,4000,{"P1 B"}},
           {480,560,{"P1 Right"}}, {600,660,{"P1 Up"}} }
local function apply_input(f)
  for _, fl in pairs(PAD1.fields) do fl:set_value(0) end
  for _, e in ipairs(SCRIPT) do
    if f >= e[1] and f <= e[2] then
      for _, n in ipairs(e[3]) do local x = PAD1.fields[n]; if x then x:set_value(1) end end
    end
  end
end

SUB = emu.add_machine_frame_notifier(function()
  VFRAME = VFRAME + 1
  apply_input(VFRAME)
  if VFRAME >= NFR then
    OUT:write("--- registers sampled INSIDE an execution hook at $8087 (STY $4014) ---\n")
    for _, s in ipairs(SAMPLES) do OUT:write(s .. "\n") end
    OUT:write("--- writers into $0300-$037F: CURPC -> count, offset range ---\n")
    local ks = {}
    for k in pairs(PCHIST) do ks[#ks+1] = k end
    table.sort(ks, function(a,b) return PCHIST[a].n > PCHIST[b].n end)
    for i = 1, math.min(#ks, 30) do
      local k = ks[i]
      OUT:write(string.format("%s  n=%-7d off=$%04X..$%04X\n", k, PCHIST[k].n,
                              PCHIST[k].lo, PCHIST[k].hi))
    end
    OUT:close()
    print("REG DONE v=" .. VFRAME .. " g=" .. GFRAME)
    M:exit()
  end
end)
print("reg installed")
