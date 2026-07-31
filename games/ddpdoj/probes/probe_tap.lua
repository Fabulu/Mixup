-- probe6: do memory taps see OPCODE FETCHES? (execution hook without debugger)
-- Gradius NES: NMI handler at $806A (games/gradius NOTES-rom.md)
M = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]

HITS_NMI = 0
HITS_ZP4W = 0
FRAMES = 0
FIRST_T = nil

TAP_A = PRG:install_read_tap(0x806A, 0x806A, "nmi_entry", function(offset, data, mask)
  HITS_NMI = HITS_NMI + 1
  if not FIRST_T then FIRST_T = M.time:as_double() end
end)

TAP_B = PRG:install_write_tap(0x0004, 0x0004, "lock_write", function(offset, data, mask)
  HITS_ZP4W = HITS_ZP4W + 1
end)

SUB = emu.add_machine_frame_notifier(function()
  FRAMES = FRAMES + 1
  if FRAMES == 600 then
    print(string.format("RESULT frames=%d reads@0x806A=%d writes@0x0004=%d firstNMI_t=%s",
          FRAMES, HITS_NMI, HITS_ZP4W, tostring(FIRST_T)))
    print(string.format("machine.time=%.9f screen.frame_number=%d",
          M.time:as_double(), M.screens:at(1):frame_number()))
    emu.print_info("PROBE6 DONE")
    M:exit()
  end
end)
print("probe6 installed: tapA=" .. tostring(TAP_A) .. " sub=" .. tostring(SUB))
