-- Cross-validation, MAME side.
--
-- Emits one digest line per execution of Gradius's NMI handler entry ($806A),
-- indexed by the guest's own NMI ordinal. crosscheck_mesen.lua emits the exact
-- same line format from Mesen. Two independent emulators producing the same
-- sequence is far stronger evidence than either asserted to be accurate.
--
-- Sampled at the instant of the opcode fetch at $806A, before PHP executes.
--
-- P is emitted MASKED with 0xCF. Bits 5 and 4 of the 6502 status register are
-- not physical flip-flops: bit 5 does not exist and bit 4 (B) exists only in
-- the byte pushed to the stack. Emulators are free to report them either way
-- and MAME and Mesen genuinely differ there. Praw= carries the unmasked value
-- so the difference stays visible instead of being quietly normalised away.

local TAG = "XV "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local cpu  = mach.devices[":maincpu"]
local prog = cpu.spaces["program"]
local ram  = mach.memory.shares[":mainram"]

local NMI_ENTRY = 0x806A
local NMAX = tonumber(os.getenv("XV_NMIS") or "") or 500

local n = 0
local lines = {}

local function digest()
  -- FNV-1a over zero page and the object page, in 16-bit halves.
  local hi, lo = 0x811C, 0x9DC5
  local function feed(b)
    lo = lo ~ b
    local l = lo * 0x0193
    local h = hi * 0x0193 + (l >> 16)
    lo = l & 0xFFFF
    hi = h & 0xFFFF
  end
  for a = 0x0000, 0x00FF do feed(ram:read_u8(a)) end
  for a = 0x0300, 0x03FF do feed(ram:read_u8(a)) end
  return ((hi << 16) | lo)
end

-- handle kept in a global: a collected tap stops firing silently.
_xv_tap = prog:install_read_tap(NMI_ENTRY, NMI_ENTRY, "xv", function (offset, data)
  if cpu.state["CURPC"].value ~= offset then return end   -- opcode fetch only
  n = n + 1
  if n > NMAX then return end
  lines[n] = string.format(
    "n=%d A=%02X X=%02X Y=%02X SP=%02X P=%02X lock=%02X zp0D=%02X zp10=%02X zp11=%02X d=%08X Praw=%02X",
    n, cpu.state["A"].value, cpu.state["X"].value, cpu.state["Y"].value,
    cpu.state["SP"].value & 0xFF, cpu.state["P"].value & 0xCF,
    ram:read_u8(0x04), ram:read_u8(0x0D), ram:read_u8(0x10), ram:read_u8(0x11),
    digest(), cpu.state["P"].value)
end)

local reported = false
_xv_frame = emu.add_machine_frame_notifier(function ()
  if reported or n < NMAX then return end
  reported = true
  out("emulator=mame " .. emu.app_version())
  for i = 1, NMAX do out(lines[i]) end
  out("END")
  mach:exit()
end)
