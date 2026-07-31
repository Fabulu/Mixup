-- vec.lua -- GAME-AGNOSTIC interrupt hook: tap the CPU's interrupt VECTOR FETCH
M = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
NMIV = tonumber(os.getenv("NMIVEC") or "FFFA", 16)
IRQV = tonumber(os.getenv("IRQVEC") or "FFFE", 16)

VF, NMIHITS, IRQHITS, perframe = 0, 0, 0, {}
T1 = PRG:install_read_tap(NMIV, NMIV + 1, "nmivec", function() NMIHITS = NMIHITS + 1 end)
T2 = PRG:install_read_tap(IRQV, IRQV + 1, "irqvec", function() IRQHITS = IRQHITS + 1 end)

-- also try a tap on the CPU space (68k-style autovector / IACK), if the CPU has one
CS = CPU.spaces["cpu_space"]
CSHITS = 0
if CS then
  T3 = CS:install_read_tap(0, 0xFFFFFF, "cpuspace", function() CSHITS = CSHITS + 1 end)
  print("cpu_space present, tap installed")
else
  print("no cpu_space on this CPU")
end

local lastN = 0
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  perframe[#perframe+1] = NMIHITS - lastN
  lastN = NMIHITS
  if VF >= 600 then
    local counts = {}
    for _, v in ipairs(perframe) do counts[v] = (counts[v] or 0) + 1 end
    local ks = {}
    for k in pairs(counts) do ks[#ks+1] = k end
    table.sort(ks)
    local s = {}
    for _, k in ipairs(ks) do s[#s+1] = (k/2) .. "vec-fetch-pairs:" .. counts[k] .. "frames" end
    print(string.format("600 frames: NMI vector byte-reads=%d IRQ vector byte-reads=%d cpu_space reads=%d",
      NMIHITS, IRQHITS, CSHITS))
    print("per-frame NMI vector fetches: " .. table.concat(s, "  "))
    print("VEC DONE")
    M:exit()
  end
end)
