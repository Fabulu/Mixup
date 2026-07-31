-- pgm_shots.lua -- drive inputs and take PNG snapshots, so we can SEE what the
-- board is doing rather than guess from a RAM hash.
--
-- PGM_FRAMES   video frames to run
-- PGM_SHOTS    comma-separated video frame numbers at which to snapshot
-- PGM_SCRIPT   input script: "FROM-TO:NAME[+NAME...],..."  frames are video frames
--              names are ioport field names, prefixed by port: "Service/Coin 1"
--              or bare (searched in :P1P2 then :Service)
local function say(s) print("PROBE " .. s) end

M   = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
SCR = M.screens:at(1)
RAM = M.memory.shares[":sram"]

local NFR   = tonumber(os.getenv("PGM_FRAMES") or "") or 1200
local SHOTS = {}
for s in string.gmatch(os.getenv("PGM_SHOTS") or "", "[^,]+") do
  SHOTS[tonumber(s)] = true
end

-- field lookup across the two useful ports
local PORTS = { M.ioport.ports[":P1P2"], M.ioport.ports[":Service"] }
local function field(name)
  local p, n = string.match(name, "^([^/]+)/(.+)$")
  if p then
    local port = M.ioport.ports[":" .. p]
    return port and port.fields[n]
  end
  for _, port in ipairs(PORTS) do
    if port and port.fields[name] then return port.fields[name] end
  end
  return nil
end

local SCRIPT = {}
for seg in string.gmatch(os.getenv("PGM_SCRIPT") or "", "[^,]+") do
  local a, b, keys = string.match(seg, "^%s*(%d+)%-(%d+):(.*)$")
  if a then
    local fs = {}
    for k in string.gmatch(keys, "[^%+]+") do fs[#fs+1] = k end
    SCRIPT[#SCRIPT+1] = { tonumber(a), tonumber(b), fs }
  end
end

local function clear_inputs()
  for _, port in ipairs(PORTS) do
    if port then for _, f in pairs(port.fields) do f:set_value(0) end end
  end
end

local function apply(vf)
  clear_inputs()
  for _, e in ipairs(SCRIPT) do
    if vf >= e[1] and vf <= e[2] then
      for _, n in ipairs(e[3]) do
        local f = field(n)
        if f then f:set_value(1) else say("BADFIELD " .. n) end
      end
    end
  end
end

local VF = 0
local prevpc = -1
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  if SHOTS[VF] then
    SCR:snapshot(string.format("f%05d.png", VF))
    say(("shot vf=%d pc=%X"):format(VF, CPU.state["PC"].value))
  end
  if VF % 120 == 0 then
    say(("vf=%d pc=%X d0=%X a0=%X"):format(VF, CPU.state["PC"].value,
        CPU.state["D0"].value, CPU.state["A0"].value))
  end
  if VF >= NFR then say("END"); M:exit() end
end)
say("shots installed nfr=" .. NFR)
