-- dump the decrypted maincpu region + basic driver facts, then exit
local OUT = os.getenv("DDP_OUT") or "dump.bin"
local M = manager.machine
local n = 0
local done = false
emu.add_machine_frame_notifier(function()
  n = n + 1
  if n ~= 3 or done then return end
  done = true
  local ok, err = pcall(function()
    print("PROBE regions:")
    for tag, r in pairs(M.memory.regions) do
      print(string.format("  region %-24s size=%d width=%d", tag, r.size, r.bitwidth or -1))
    end
    print("PROBE shares:")
    for tag, s in pairs(M.memory.shares) do
      print(string.format("  share  %-24s size=%d width=%d", tag, s.size, s.bitwidth or -1))
    end
    local sc = M.screens[":screen"]
    print(string.format("PROBE screen w=%d h=%d refresh=%.9f", sc.width, sc.height, 1.0/sc.frame_period))
    local r = M.memory.regions[":maincpu"]
    local f = io.open(OUT, "wb")
    local t = {}
    for i = 0, r.size - 1 do
      t[#t+1] = string.char(r:read_u8(i))
      if #t == 65536 then f:write(table.concat(t)); t = {} end
    end
    if #t > 0 then f:write(table.concat(t)) end
    f:close()
    print(string.format("PROBE dumped %d bytes of :maincpu to %s", r.size, OUT))
  end)
  if not ok then print("PROBE ERROR " .. tostring(err)) end
  M:exit()
end)
