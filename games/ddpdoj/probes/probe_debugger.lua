-- probe3: device_debug surface, debugger symbols, expression eval
local m = manager.machine
local cpu = m.devices[":maincpu"]

local function dumpmt(name, obj)
  print("=== " .. name .. " type=" .. type(obj))
  if obj == nil then return end
  local mt = getmetatable(obj)
  if not mt then print("  (no metatable)"); return end
  local keys = {}
  for k, v in pairs(mt) do keys[#keys+1] = tostring(k) .. ":" .. type(v) end
  table.sort(keys)
  for _, k in ipairs(keys) do print("  " .. k) end
end

dumpmt("cpu.debug", cpu.debug)

-- try the debugger console: 'print' evaluates an expression
local dbg = m.debugger
print("### execution_state = " .. tostring(dbg.execution_state))
for _, e in ipairs({"cycles", "totalcycles", "lastinstructioncycles", "frame",
                    "beamx", "beamy", "beamh", "beamv", "pc", "cpunum", "logunmap"}) do
  local ok, err = pcall(function() dbg:command("print " .. e) end)
  if not ok then print("   cmd " .. e .. " -> ERR " .. tostring(err)) end
end
print("### consolelog:")
local cl = dbg.consolelog
for i = 1, #cl do print("   [" .. i .. "] " .. cl[i]) end

emu.print_info("PROBE3 DONE")
m:exit()
