-- MAME oracle capability probe -- runs against the Gradius (USA) NES ROM.
--
-- Answers, by measurement, the three questions every oracle in this project is
-- judged by (docs/knowledge/01-the-oracle-method.md):
--
--   A. EXECUTION HOOKS -- can a Lua callback fire when the CPU executes an address?
--   B. MEMORY ACCESS   -- read/write CPU RAM and video memory mid-run.
--   C. HEADLESS DETERMINISM -- no window, and byte-identical output across runs.
--
-- Everything printed with the PROBE tag is deterministic by construction: it is
-- indexed by the guest's own NMI ordinal, never by wall clock or host frame timing.
--
-- Gradius facts used as the hook target (games/gradius/NOTES-rom.md):
--   $806A  NMI handler entry          $8073  reads the frame lock $04 and bails
--   $809F  raises the lock            $80B5  clears it
--
-- Run via: python games/ddpdoj/tools/capability_probe.py

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach  = manager.machine
local cpu   = mach.devices[":maincpu"]
local prog  = cpu.spaces["program"]
local ram   = mach.memory.shares[":mainram"]   -- read RAM without re-entering taps
local ppu   = mach.devices[":ppu"]
local vram  = ppu.spaces["videoram"]
local scr   = mach.screens[":screen"]

local NMI_ENTRY = 0x806A   -- opcode byte of the NMI handler's first instruction
local LOCK      = 0x0004   -- Gradius frame lock, zero page

local SAMPLE_NMIS = 400    -- how many NMI executions to sample before reporting

----------------------------------------------------------------------
-- A. EXECUTION HOOK
--
-- MAME has no "call this Lua function on execute" API. What it has is
-- address_space:install_read_tap(), a genuine Lua callback on every READ of a
-- range -- and an opcode fetch is a read. The discriminator between an opcode
-- fetch and a data read is the CPU's CURPC: on a fetch CURPC equals the tapped
-- address; on a data read CURPC is the address of the instruction doing the
-- reading. Both halves of that claim are measured below.
----------------------------------------------------------------------
local nmi_n        = 0     -- executions of $806A
local nmi_nonexec  = 0     -- hits where CURPC ~= address (i.e. NOT an opcode fetch)
local opcode_seen  = nil
local samples      = {}    -- ordinal -> formatted register/memory snapshot
local lock_set_at_entry = 0

local SAMPLE_AT = { [1]=true, [2]=true, [3]=true, [100]=true, [200]=true, [400]=true }

-- NOTE: the handle returned by install_*_tap MUST be kept alive. If it is
-- collected the tap is silently removed and the callback simply stops firing --
-- with no error anywhere. Two hours went into that. Keep them in globals.
_tap_nmi = prog:install_read_tap(NMI_ENTRY, NMI_ENTRY, "nmi_exec_hook", function (offset, data)
  local curpc = cpu.state["CURPC"].value
  if curpc ~= offset then
    nmi_nonexec = nmi_nonexec + 1
    return
  end
  nmi_n = nmi_n + 1
  opcode_seen = data
  local lock = ram:read_u8(LOCK)
  if lock ~= 0 then lock_set_at_entry = lock_set_at_entry + 1 end
  if SAMPLE_AT[nmi_n] then
    samples[nmi_n] = string.format(
      "A=%02X X=%02X Y=%02X SP=%02X P=%02X opcode=%02X lock$04=%02X zp10=%02X zp11=%02X zp0D=%02X",
      cpu.state["A"].value, cpu.state["X"].value, cpu.state["Y"].value,
      cpu.state["SP"].value & 0xFF, cpu.state["P"].value, data, lock,
      ram:read_u8(0x10), ram:read_u8(0x11), ram:read_u8(0x0D))
  end
end)

-- Control hook: a data-only zero page address, to prove CURPC really does
-- distinguish. $04 is read by LDA $04 inside the NMI handler.
local lock_reads, lock_read_sites = 0, {}
_tap_lock_r = prog:install_read_tap(LOCK, LOCK, "lock_read", function (offset, data)
  lock_reads = lock_reads + 1
  local pc = cpu.state["CURPC"].value
  lock_read_sites[pc] = (lock_read_sites[pc] or 0) + 1
end)

-- Write tap: who writes the frame lock, and what with. This is the lag census
-- of docs/knowledge/06-lag-and-slowdown.md, done with one hook.
local lock_writes, lock_write_sites = 0, {}
_tap_lock_w = prog:install_write_tap(LOCK, LOCK, "lock_write", function (offset, data)
  lock_writes = lock_writes + 1
  local pc = cpu.state["CURPC"].value
  local key = string.format("%04X:%02X", pc, data)
  lock_write_sites[key] = (lock_write_sites[key] or 0) + 1
end)

----------------------------------------------------------------------
-- report
----------------------------------------------------------------------
local frames, reported = 0, false

local function sorted_keys(t)
  local k = {}
  for key in pairs(t) do k[#k+1] = key end
  table.sort(k)
  return k
end

local function fnv1a(s)
  -- 32-bit FNV-1a, done in 16-bit halves so Lua's number type stays exact.
  local hi, lo = 0x811C, 0x9DC5
  for i = 1, #s do
    lo = lo ~ s:byte(i)
    local l = lo * 0x0193
    local h = hi * 0x0193 + (l >> 16)
    lo = l & 0xFFFF
    hi = h & 0xFFFF
  end
  return (hi << 16) | lo
end

local function report()
  if reported then return end
  reported = true

  out("mame_version=" .. emu.app_version())
  out("driver=" .. emu.romname() .. " software=" .. tostring(emu.softname()))
  out("cpu=" .. cpu.shortname .. " tag=" .. cpu.tag)

  -- C: the exact refresh, derived from the driver's own timing, not rounded.
  local ras = scr.refresh_attoseconds
  out(string.format("screen=%dx%d refresh_attoseconds=%d refresh_hz=%.9f",
      scr.width, scr.height, ras, 1e18 / ras))

  -- A
  out("A_exec_hook=install_read_tap")
  out("A_nmi_executions=" .. nmi_n)
  out("A_nmi_hits_rejected_as_nonfetch=" .. nmi_nonexec)
  out(string.format("A_opcode_at_%04X=%02X", NMI_ENTRY, opcode_seen or 0xFF))
  for _, n in ipairs(sorted_keys(samples)) do
    out(string.format("A_sample nmi=%d %s", n, samples[n]))
  end
  out("A_lock_reads=" .. lock_reads)
  for _, pc in ipairs(sorted_keys(lock_read_sites)) do
    out(string.format("A_lock_read_site pc=%04X n=%d curpc_equals_addr=%s",
        pc, lock_read_sites[pc], tostring(pc == LOCK)))
  end
  out("A_lock_writes=" .. lock_writes)
  for _, key in ipairs(sorted_keys(lock_write_sites)) do
    out(string.format("A_lock_write_site pc:val=%s n=%d", key, lock_write_sites[key]))
  end
  out("A_lag_frames_lock_set_at_nmi_entry=" .. lock_set_at_entry)

  -- B: memory access, both directions, CPU RAM and video RAM.
  local zp = {}
  for a = 0x00, 0x1F do zp[#zp+1] = string.format("%02X", ram:read_u8(a)) end
  out("B_zeropage_00_1F=" .. table.concat(zp, ""))

  local scratch = 0x07F0                       -- unused by Gradius
  local before = prog:read_u8(scratch)
  prog:write_u8(scratch, 0xA5)
  local after = prog:read_u8(scratch)
  prog:write_u8(scratch, before)
  out(string.format("B_cpu_ram_write addr=%04X before=%02X wrote=A5 readback=%02X restored=%02X",
      scratch, before, after, prog:read_u8(scratch)))

  local pal = {}
  for a = 0x3F00, 0x3F0F do pal[#pal+1] = string.format("%02X", vram:read_u8(a)) end
  out("B_ppu_palette_3F00_3F0F=" .. table.concat(pal, ""))

  local nt = {}
  for a = 0x2000, 0x200F do nt[#nt+1] = string.format("%02X", vram:read_u8(a)) end
  out("B_ppu_nametable_2000_200F=" .. table.concat(nt, ""))

  local vb = vram:read_u8(0x2000)
  vram:write_u8(0x2000, 0x5A)
  local va = vram:read_u8(0x2000)
  vram:write_u8(0x2000, vb)
  out(string.format("B_vram_write addr=2000 before=%02X wrote=5A readback=%02X restored=%02X",
      vb, va, vram:read_u8(0x2000)))

  out("B_prg_rom_len=" .. mach.memory.regions[":nes_slot:cart:prg_rom"].length ..
      " chr_rom_len=" .. mach.memory.regions[":nes_slot:cart:chr_rom"].length)

  -- C: framebuffer readback, headless.
  local px = scr:pixels()
  out(string.format("C_framebuffer bytes=%d expect=%d fnv1a=%08X",
      #px, scr.width * scr.height * 4, fnv1a(px)))
  scr:snapshot("capability_probe.png")
  out("C_snapshot_written=capability_probe.png")
  out("C_frames_elapsed_at_report=" .. frames)

  out("END")
  mach:exit()
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  -- Report on the guest's own clock: as soon as the sampled NMI budget is spent.
  if nmi_n >= SAMPLE_NMIS then report() end
  -- Deadline so a dead hook fails loudly instead of producing silence.
  if frames >= SAMPLE_NMIS * 3 then
    out("ABORT hooks_did_not_reach_budget nmi_n=" .. nmi_n .. " frames=" .. frames)
    report()
  end
end)
