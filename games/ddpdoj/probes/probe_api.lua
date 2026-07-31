-- probe1: introspect MAME Lua API surface
local function dump(name, obj)
  print("=== " .. name .. " type=" .. type(obj))
  if type(obj) ~= "userdata" and type(obj) ~= "table" then return end
  local mt = getmetatable(obj)
  local keys = {}
  local ok = pcall(function()
    for k, v in pairs(obj) do keys[#keys+1] = tostring(k) .. ":" .. type(v) end
  end)
  if not ok then print("  (pairs failed)") end
  if mt then
    local idx = rawget(mt, "__index")
    if type(idx) == "table" then
      for k, v in pairs(idx) do keys[#keys+1] = "mt." .. tostring(k) .. ":" .. type(v) end
    end
    for k, v in pairs(mt) do keys[#keys+1] = "MT." .. tostring(k) .. ":" .. type(v) end
  end
  table.sort(keys)
  for _, k in ipairs(keys) do print("  " .. k) end
end

print("### emu._VERSION = " .. tostring(emu.app_version and emu.app_version() or "?"))
dump("emu", emu)
dump("manager", manager)
local m = manager.machine
dump("machine", m)
dump("machine.video", m.video)
local cpu = m.devices[":maincpu"]
dump("maincpu", cpu)
print("### maincpu tag=" .. tostring(cpu.tag))
dump("maincpu.state", cpu.state)
local scr = m.screens:at(1)
dump("screen", scr)
emu.print_info("PROBE1 DONE")
manager.machine:exit()
