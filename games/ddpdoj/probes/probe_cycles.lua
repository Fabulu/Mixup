-- cyc.lua -- does MAME give us CPU CYCLES per frame, and does elapsed emulated time agree?
M   = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
SCR = M.screens:at(1)
DBG = M.debugger
OUT = assert(io.open(os.getenv("MAMEOUT") or "cyc.tsv", "w"))
NFR = tonumber(os.getenv("MAMEFRAMES") or "600")

if DBG then
  DBG.execution_state = "run"
  print("debugger present; execution_state -> " .. tostring(DBG.execution_state))
else
  print("NO DEBUGGER (run with -debug -debugger none to get cycle symbols)")
end

local function evalsym(sym)
  if not DBG then return -1 end
  DBG:command("print " .. sym)
  local cl = DBG.consolelog
  local s = cl[#cl]
  return tonumber(s, 16) or -1     -- debugger 'print' emits hex by default
end

HOOKS = {}
local function hook(addr, name, fn)
  HOOKS[#HOOKS+1] = PRG:install_read_tap(addr, addr, name, function(o,d,m) fn() end)
end

VFRAME, GFRAME = 0, 0
E = {}
hook(0x806A, "entry", function()
  E.t = M.time:as_double(); E.c = evalsym("totalcycles")
end)
hook(0x80B7, "tail", function()
  if not E.t then return end
  local t1, c1 = M.time:as_double(), evalsym("totalcycles")
  GFRAME = GFRAME + 1
  local dt, dc = t1 - E.t, c1 - E.c
  OUT:write(string.format("%d\t%d\t%.12f\t%d\t%.12f\t%d\t%.6f\n",
      GFRAME, VFRAME, E.t, E.c, dt, dc, (dt > 0) and (dc / dt) or -1))
  E = {}
end)

OUT:write("gframe\tvframe\tt_entry\tcycles_entry\tdt_s\tdcycles\timplied_hz\n")
SUB = emu.add_machine_frame_notifier(function()
  VFRAME = VFRAME + 1
  if VFRAME >= NFR then
    OUT:close(); print("CYC DONE v=" .. VFRAME .. " g=" .. GFRAME); M:exit()
  end
end)
print("cyc installed")
