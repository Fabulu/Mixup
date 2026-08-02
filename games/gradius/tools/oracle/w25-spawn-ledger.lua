-- w25-spawn-ledger.lua -- count the eruption's spawns ($C486) and handler
-- entries ($B36F) on the cartridge, for spawn-for-spawn comparison against the
-- port's w25-eruption-probe.mjs. Modeled on throwaudit.lua's hook shape.
--
-- Run via throwaudit.py --script <reaching> --name w25-ledger, or directly:
--   Mesen.exe --testRunner w25-spawn-ledger.lua "Gradius (USA).nes"
--
-- Hooks:
--   0xC486  st_C486 entry -- one execution == one successful volcano spawn
--   0xC413  the late spawner entry (control: should be 768 over the $82 window)
--   0xB36F  handler entry 10 (type $0A) -- the handler-execution denominator
--   0x99E9  the $82 countdown arm (marks the eruption window)
--
-- Emits a JSON line at exit with the counts and the first/last spawn frame.

local frames = tonumber(os.getenv("TA_FRAMES") or "6000")
local script = os.getenv("TA_SCRIPT") or "200:,10:S,190:,1350:RD,324:RU,80:RD,3846:R"
local jsonPath = os.getenv("TA_JSON") or "games/gradius/tools/oracle/out/w25-spawn-ledger.json"
local poke = os.getenv("TA_POKE") or ""

local counters = {}
local function bump(name)
  counters[name] = (counters[name] or 0) + 1
end
local spawnFirst, spawnLast
local curFrame = 0

-- parse the poke list "ADDR=VAL,..." and apply at the given frame
local pokes = {}
for a, v in poke:gmatch("(%x+)=(%x+)") do
  pokes[#pokes+1] = { addr = tonumber(a, 16), val = tonumber(v, 16) }
end

-- parse the script "N:BUTTONS,N:BUTTONS,..." into a schedule
local schedule = {}
local total = 0
for n, b in script:gmatch("(%d+):([A-Za-z]+)") do
  schedule[#schedule+1] = { after = total, len = tonumber(n), btn = b }
  total = total + tonumber(n)
end
local btnToByte = {
  R=0x01, L=0x02, D=0x04, U=0x08, S=0x10, T=0x20, B=0x40, A=0x80,
}
local function heldByte(btn)
  local b = 0
  for ch in btn:gmatch(".") do b = bit.bor(b, btnToByte[ch] or 0) end
  return b
end
local segIdx, segElapsed = 1, 0

function onCycle(e)
  if e.type ~= "EndFrame" then return end
  curFrame = curFrame + 1
  if curFrame > frames then
    -- emit JSON and stop
    local parts = {}
    for k in pairs(counters) do parts[#parts+1] = k end
    table.sort(parts)
    local lines = {}
    for _, k in ipairs(parts) do
      lines[#lines+1] = string.format('  "%s": %d', k, counters[k])
    end
    local firstStr = spawnFirst and string.format('"first": %d', spawnFirst) or '"first": null'
    local lastStr  = spawnLast  and string.format('"last": %d',  spawnLast)  or '"last": null'
    local j = string.format('{\n  "frames": %d,\n%s,\n  "spawnFirst": %s,\n  "spawnLast": %s\n}\n',
      frames, table.concat(lines, ",\n"),
      spawnFirst or "null", spawnLast or "null")
    -- print so --testRunner captures it
    print("W25_LEDGER_BEGIN")
    print(j)
    print("W25_LEDGER_END")
    local f = io.open(jsonPath, "w")
    if f then f:write(j); f:close() end
    emu.stop()
    return
  end
  -- apply pokes every frame (invuln-style pokes are continuous)
  for _, p in ipairs(pokes) do
    memory.write(p.addr, p.val, memory.cpuSpace)
  end
  -- drive the input from the schedule
  if segIdx <= #schedule then
    local seg = schedule[segIdx]
    if curFrame > seg.after + seg.len then
      segIdx = segIdx + 1
      seg = schedule[segIdx]
    end
    if seg then
      local b = heldByte(seg.btn)
      -- $0007 = held, $0005 = pressed (edge). Simplify: write held each frame.
      memory.write(0x07, b, memory.cpuSpace)
    end
  end
end

-- the hooks: count executions
local HOOK_ADDR = { 0xC486, 0xC413, 0xB36F, 0x99E9 }
local HOOK_NAME = { ["0xC486"]="C486_spawn", ["0xC413"]="C413_entry",
                    ["0xB36F"]="B36F_handler", ["0x99E9"]="C99E9_82arm" }

emu.addMemoryCallback(function(addr, sz)
  local name = HOOK_NAME[string.format("0x%X", addr)]
  if name then
    bump(name)
    if name == "C486_spawn" then
      if not spawnFirst then spawnFirst = curFrame end
      spawnLast = curFrame
    end
  end
end, emu.callbackType.execute, memory.cpuSpace)
for _, a in ipairs(HOOK_ADDR) do
  emu.addMemoryCallback(function(addr, sz)
    local name = HOOK_NAME[string.format("0x%X", addr)]
    if name then
      bump(name)
      if name == "C486_spawn" then
        if not spawnFirst then spawnFirst = curFrame end
        spawnLast = curFrame
      end
    end
  end, emu.callbackType.execute, memory.cpuSpace, a)
end

print("W25 spawn-ledger probe armed: " .. frames .. " frames, script=" .. script)
