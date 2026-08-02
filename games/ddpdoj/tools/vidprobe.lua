-- What does MAME expose for ddpdojblk? Regions, shares, devices, spaces.
-- Run once; output is metadata about MAME, not ROM content.
local T = "PROBE "
local function p(s) print(T .. s) end

local M = manager.machine
local done = false

emu.add_machine_frame_notifier(function()
  if done then return end
  done = true
  local ok, err = pcall(function()
    p("--- regions ---")
    for tag, r in pairs(M.memory.regions) do
      p(string.format("region %-28s size=%d width=%s endian=%s", tag, r.size, tostring(r.width), tostring(r.endianness)))
    end
    p("--- shares ---")
    for tag, s in pairs(M.memory.shares) do
      p(string.format("share  %-28s size=%d width=%s endian=%s", tag, s.size, tostring(s.width), tostring(s.endianness)))
    end
    p("--- devices ---")
    for tag, d in pairs(M.devices) do
      local sp = {}
      local okk = pcall(function() for n, _ in pairs(d.spaces) do sp[#sp+1] = n end end)
      p(string.format("dev    %-28s spaces=[%s]", tag, table.concat(sp, ",")))
    end
    p("--- screen ---")
    local scr = M.screens[":screen"]
    p(string.format("screen w=%d h=%d refresh=%.9f", scr.width, scr.height, scr.refresh_attoseconds and (1e18/scr.refresh_attoseconds) or -1))
  end)
  if not ok then p("ERR " .. tostring(err)) end
  M:exit()
end)
