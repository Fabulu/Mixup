-- m68k.lua -- do Lua memory taps see 68000 OPCODE FETCHES? (execution-hook capability on a 68k)
M = manager.machine
print("system: " .. M.system.name .. " (" .. M.system.description .. ")")
for tag, dev in pairs(M.devices) do
  local ok, sp = pcall(function() return dev.spaces end)
  if ok and sp then
    local names = {}
    for k, v in pairs(sp) do names[#names+1] = k end
    if #names > 0 then print("device " .. tag .. " [" .. dev.name .. "] spaces: " .. table.concat(names, ",")) end
  end
end

CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
print("program space: width=" .. tostring(PRG.data_width) .. " mask=" ..
      string.format("%X", PRG.address_mask) .. " endian=" .. tostring(PRG.endianness))

LO = tonumber(os.getenv("TAPLO") or "0", 16)
HI = tonumber(os.getenv("TAPHI") or "3FFFFF", 16)
HITS, PCS, FIRST = 0, {}, {}
TAP = PRG:install_read_tap(LO, HI, "fetchprobe", function(off, d, mk)
  HITS = HITS + 1
  if HITS <= 8 then
    FIRST[#FIRST+1] = string.format("off=%06X data=%04X PC=%06X CURPC=%06X",
        off, d, CPU.state["PC"].value, CPU.state["CURPC"].value)
  end
  local pc = CPU.state["CURPC"].value
  PCS[pc] = (PCS[pc] or 0) + 1
end)

VF = 0
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  if VF >= 60 then
    print("range $" .. string.format("%X-%X", LO, HI) .. " read-tap hits over 60 frames: " .. HITS)
    for _, s in ipairs(FIRST) do print("   " .. s) end
    local n = 0
    for pc, c in pairs(PCS) do n = n + 1 end
    print("distinct CURPC values seen at tap: " .. n)
    print("M68K PROBE DONE")
    M:exit()
  end
end)
print("m68k probe installed")
