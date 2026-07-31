-- nvcheck.lua -- why does ddpdojblk halt?
--
-- The disassembly of the decrypted image says the boot path is:
--     13c330 cmpi.l #$36982136, $803800 / bne $13c382
--     13c33e cmpi.l #$76349621, $803804 / bne $13c382
--     13c356 MAIN LOOP  (jsr $13be8c ; ... ; bra $13c356 at $13c380)
--     13c382 error path -> prints "ROM ERROR ! " -> $13c398 nop/bra self forever
--
-- pgm.cpp:5359 says Black Label "expects Magic values in NVRAM to boot" and
-- ships ddp3blk_defaults.nv. This compares what is in the ":sram" ROM REGION
-- (the factory defaults blob) against what is actually in main RAM at $803800,
-- which is the NVRAM-backed 128 KiB share.
--
-- Env: HARD_NV_AT (video frame to sample), HARD_NV_POKE=1 to write the magic in
-- before the check runs and see whether the game then boots.

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local cpu  = mach.devices[":maincpu"]
local prog = cpu.spaces["program"]

local AT   = tonumber(os.getenv("HARD_NV_AT") or "") or 300
local POKE = os.getenv("HARD_NV_POKE") == "1"

local frames = 0
local poked = false

local function hex(region, off, n)
  local t = {}
  for i = 0, n - 1 do t[#t+1] = string.format("%02X", region:read_u8(off + i)) end
  return table.concat(t)
end

-- Poke BEFORE the boot check can run. The magic test happens very early, so do
-- it on the first frame notifier.
_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1

  if POKE and not poked then
    poked = true
    prog:write_u32(0x803800, 0x36982136)
    prog:write_u32(0x803804, 0x76349621)
    out(string.format("POKED at frame %d: 803800=%08X 803804=%08X",
        frames, prog:read_u32(0x803800), prog:read_u32(0x803804)))
  end

  if frames == AT then
    local sram_region = mach.memory.regions[":sram"]
    out("sram_region_present=" .. tostring(sram_region ~= nil))
    if sram_region then
      out("sram_region_size=" .. sram_region.size)
      out("sram_region@0x0000=" .. hex(sram_region, 0x0000, 16))
      out("sram_region@0x3800=" .. hex(sram_region, 0x3800, 16))
    end
    local ram = {}
    for i = 0, 15 do ram[#ram+1] = string.format("%02X", prog:read_u8(0x803800 + i)) end
    out("mainram@0x803800=" .. table.concat(ram))
    out(string.format("magic_expected=36982136,76349621 got=%08X,%08X",
        prog:read_u32(0x803800), prog:read_u32(0x803804)))
    out(string.format("cpu PC=%06X CURPC=%06X SP=%06X",
        cpu.state["PC"].value & 0xFFFFFF,
        cpu.state["CURPC"].value & 0xFFFFFF,
        cpu.state["SP"].value & 0xFFFFFF))
    out("END")
    mach:exit()
  end
end)
