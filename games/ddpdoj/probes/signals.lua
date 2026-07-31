-- sig.lua -- the full per-frame signal set of docs/knowledge/06-lag-and-slowdown.md,
-- implemented on MAME 0.288 Lua. Two clocks kept separate: vframe (video) and gframe (logic).
M    = manager.machine
CPU  = M.devices[":maincpu"]
PRG  = CPU.spaces["program"]
SCR  = M.screens:at(1)
PAD1 = M.ioport.ports[":ctrl1:joypad:JOYPAD"]
DBG  = M.debugger
if DBG then DBG.execution_state = "run" end

BASE = os.getenv("MAMEOUT") or "sig"
GOUT = assert(io.open(BASE .. ".gframe.tsv", "w"))
VOUT = assert(io.open(BASE .. ".vframe.tsv", "w"))
NFR  = tonumber(os.getenv("MAMEFRAMES") or "2400")
USEC = (DBG ~= nil)

local function cycles()
  if not USEC then return -1 end
  DBG:command("print totalcycles")
  local cl = DBG.consolelog
  return tonumber(cl[#cl], 16) or -1
end

VFRAME, GFRAME, GTHISV = 0, 0, 0
HOOKS = {}
local function hook(a, n, f)
  HOOKS[#HOOKS+1] = PRG:install_read_tap(a, a, n, function(o,d,mk) f() end)
end

local function reset()
  C = { lock=-1, oam=0, ppumask=0, input=0, done=0, t=-1, c=-1, ventry=-1,
        nslot=0, order={} }
  SEEN = {}
end
reset()

hook(0x806A, "nmi_entry", function() reset(); C.t = M.time:as_double(); C.c = cycles(); C.ventry = VFRAME end)
hook(0x8073, "lock_read", function() C.lock = PRG:read_u8(0x0004) end)
hook(0x8087, "oam_dma",   function() C.oam = C.oam + 1 end)
hook(0x8096, "ppumask",   function() C.ppumask = C.ppumask + 1 end)
hook(0x81BF, "input",     function() C.input = C.input + 1 end)
hook(0x80B5, "lock_clr",  function() C.done = 1 end)

-- (C) detector primitive: order in which object slots are first touched this logic frame
HOOKS[#HOOKS+1] = PRG:install_write_tap(0x0320, 0x033F, "objY", function(off, d, mk)
  local slot = off - 0x0320
  if not SEEN[slot] then SEEN[slot] = true; C.nslot = C.nslot + 1
    C.order[#C.order+1] = slot end
end)

hook(0x80B7, "nmi_tail", function()
  if C.t < 0 then return end
  local dt = M.time:as_double() - C.t
  local dc = USEC and (cycles() - C.c) or -1
  GFRAME = GFRAME + 1; GTHISV = GTHISV + 1
  GOUT:write(string.format("%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%.3f\t%d\t%d\t%s\n",
    GFRAME, C.ventry, VFRAME, C.lock, C.oam, C.ppumask, C.input, C.done,
    dt * 1e6, dc, C.nslot, table.concat(C.order, ",")))
end)

local prevhash
local function pixhash()
  local s = SCR:pixels(); local h = 5381
  for i = 1, #s, 331 do h = (h * 33 + s:byte(i)) % 4294967291 end
  return h
end

SCRIPT = { {240,246,{"P1 Start"}}, {300,306,{"P1 Start"}},
           {420,9000,{"P1 B"}}, {480,560,{"P1 Right"}}, {600,660,{"P1 Up"}},
           {900,1000,{"P1 Right"}}, {1300,1400,{"P1 Down"}}, {1700,1900,{"P1 Right"}} }
local function apply_input(f)
  for _, fl in pairs(PAD1.fields) do fl:set_value(0) end
  for _, e in ipairs(SCRIPT) do
    if f >= e[1] and f <= e[2] then
      for _, n in ipairs(e[3]) do local x = PAD1.fields[n]; if x then x:set_value(1) end end
    end
  end
end

GOUT:write("gframe\tventry\tvexit\tlock\toam\tppumask\tinput\tdone\twork_us\tcycles\tnslot\tslot_order\n")
VOUT:write("vframe\tlogic_frames\tpixhash\tdup\n")

SUB = emu.add_machine_frame_notifier(function()
  VFRAME = VFRAME + 1
  apply_input(VFRAME)
  local ph = pixhash()
  local dup = (prevhash ~= nil and ph == prevhash) and 1 or 0
  prevhash = ph
  VOUT:write(string.format("%d\t%d\t%d\t%d\n", VFRAME, GTHISV, ph, dup))
  GTHISV = 0
  if VFRAME >= NFR then
    GOUT:close(); VOUT:close()
    print(string.format("SIG DONE vframes=%d gframes=%d cycles=%s", VFRAME, GFRAME, tostring(USEC)))
    M:exit()
  end
end)
print("sig installed cycles=" .. tostring(USEC))
