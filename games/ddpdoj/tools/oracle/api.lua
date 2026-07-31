-- api.lua -- what does MAME's Lua surface look like on the PGM driver?
-- Nothing game-specific. Prints devices, spaces, shares, regions, screen timing.
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M = manager.machine
local ok, err = pcall(function()
  p("mame_version=%s", emu.app_version and emu.app_version() or "?")
  for tag, dev in pairs(M.devices) do
    local spaces = {}
    local sok = pcall(function()
      for sn, _ in pairs(dev.spaces) do spaces[#spaces+1] = sn end
    end)
    if #spaces > 0 then
      table.sort(spaces)
      p("device %s spaces=[%s]", tag, table.concat(spaces, ","))
    end
  end
  for tag, sh in pairs(M.memory.shares) do
    p("share %s size=%d width=%d", tag, sh.size, sh.bitwidth or -1)
  end
  for tag, rg in pairs(M.memory.regions) do
    p("region %s size=%d width=%d", tag, rg.size, rg.bitwidth or -1)
  end
  local s = M.screens[":screen"]
  p("screen w=%d h=%d refresh_attos=%d refresh_hz=%.9f", s.width, s.height,
    s.refresh_attoseconds, 1e18 / s.refresh_attoseconds)
  local cpu = M.devices[":maincpu"]
  local prog = cpu.spaces["program"]
  p("maincpu shortname=%s", cpu.shortname)
  p("program width=%d addrmask=%X endian=%s", prog.data_width or -1,
    prog.address_mask or 0, tostring(prog.endianness))
  -- register names available at a hook
  local names = {}
  for n, _ in pairs(cpu.state) do names[#names+1] = n end
  table.sort(names)
  p("maincpu_state=[%s]", table.concat(names, ","))
  -- ioports
  for pt, port in pairs(M.ioport.ports) do
    local fs = {}
    for fn, _ in pairs(port.fields) do fs[#fs+1] = fn end
    table.sort(fs)
    p("ioport %s fields=[%s]", pt, table.concat(fs, "|"))
  end
end)
if not ok then p("LUA_ERROR %s", tostring(err)) end

emu.add_machine_frame_notifier(function()
  if M.screens[":screen"]:frame_number() > 3 then M:exit() end
end)
