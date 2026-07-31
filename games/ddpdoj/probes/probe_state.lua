-- state2.lua -- when exactly does buffer_load take effect?
M = manager.machine
PRG = M.devices[":maincpu"].spaces["program"]
OUT = assert(io.open(os.getenv("MAMEOUT") or "state2.txt", "w"))
local function ramsum()
  local h = 5381
  for a = 0, 0x7FF do h = (h * 33 + PRG:read_u8(a)) % 4294967291 end
  return h
end
VF, BUF, SAVED = 0, nil, nil
LOADAT = 520
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  if VF == 500 then
    SAVED = ramsum()
    BUF = M:buffer_save()
    OUT:write(string.format("vf=500 ramsum=%d buflen=%d\n", SAVED, #BUF))
  elseif VF == LOADAT then
    OUT:write(string.format("vf=%d before load ramsum=%d\n", VF, ramsum()))
    M:buffer_load(BUF)
    OUT:write(string.format("vf=%d immediately after buffer_load ramsum=%d (target %d) match=%s\n",
      VF, ramsum(), SAVED, tostring(ramsum() == SAVED)))
  elseif VF > LOADAT and VF <= LOADAT + 3 then
    OUT:write(string.format("vf=%d ramsum=%d match_saved=%s\n", VF, ramsum(),
      tostring(ramsum() == SAVED)))
  elseif VF > LOADAT + 3 then
    OUT:close(); print("STATE2 DONE"); M:exit()
  end
end)
print("state2 installed")
