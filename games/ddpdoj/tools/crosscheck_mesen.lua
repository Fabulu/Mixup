-- Cross-validation, Mesen side. Emits the identical line format to
-- crosscheck_mame.lua so the two sequences can be diffed directly.
--
-- Mesen, unlike MAME, has a first-class execution callback:
--   emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr, cpuType, memType)
-- It fires before the instruction at `addr` executes, which is the same instant
-- MAME's read tap on the opcode byte fires.
--
-- P is masked with 0xCF; see the note in crosscheck_mame.lua. Praw= keeps the
-- unmasked value so the emulators' reporting difference stays visible.

local function out(s) print("XV " .. s) end

local CPU = emu.memType.nesDebug     -- side-effect-free CPU space
local MEM = emu.memType.nesMemory

local NMI_ENTRY = 0x806A
local NMAX = tonumber(os.getenv("XV_NMIS") or "") or 500

local n = 0
local lines = {}

local function digest()
  local hi, lo = 0x811C, 0x9DC5
  local function feed(b)
    lo = lo ~ b
    local l = lo * 0x0193
    local h = hi * 0x0193 + (l >> 16)
    lo = l & 0xFFFF
    hi = h & 0xFFFF
  end
  for a = 0x0000, 0x00FF do feed(emu.read(a, CPU, false)) end
  for a = 0x0300, 0x03FF do feed(emu.read(a, CPU, false)) end
  return ((hi << 16) | lo)
end

emu.addMemoryCallback(function ()
  n = n + 1
  if n > NMAX then return end
  local st = emu.getState()
  lines[n] = string.format(
    "n=%d A=%02X X=%02X Y=%02X SP=%02X P=%02X lock=%02X zp0D=%02X zp10=%02X zp11=%02X d=%08X Praw=%02X",
    n, st["cpu.a"], st["cpu.x"], st["cpu.y"], st["cpu.sp"] & 0xFF, st["cpu.ps"] & 0xCF,
    emu.read(0x04, CPU, false), emu.read(0x0D, CPU, false),
    emu.read(0x10, CPU, false), emu.read(0x11, CPU, false),
    digest(), st["cpu.ps"])
  if n == NMAX then
    out("emulator=mesen")
    for i = 1, NMAX do out(lines[i]) end
    out("END")
    emu.stop(0)
  end
end, emu.callbackType.exec, NMI_ENTRY, NMI_ENTRY, emu.cpuType.nes, MEM)
