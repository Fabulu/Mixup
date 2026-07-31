-- loop.lua -- THE MAIN-LOOP INSTRUMENT for ddpdojblk.
--
-- Established by disassembling the decrypted image (unidasm, m68000):
--
--   13c330 cmpi.l #$36982136,$803800 / bne 13c382   NVRAM magic gate
--   13c33e cmpi.l #$76349621,$803804 / bne 13c382
--   13c356 jsr $13be8c    <-- MAIN LOOP HEAD
--   13c35c jsr $1562f0
--   13c362 jsr $1413f6
--   13c368 jsr $145f1c
--   ...
--   13c380 bra $13c356    <-- MAIN LOOP TAIL, unconditional
--   13c382 error path: prints "ROM ERROR ! " then 13c398 nop / 13c39a bra self
--
--   13be8c addq.w #1,$80390a       <-- A COUNTER THAT ADVANCES PER LOOP ITERATION
--   13be92 bchg  #0,$80390d
--   13be9a addq.w #1,$80390e ; cmpi.w #3,$80390e ; bne ...   (mod-3 phase)
--
-- docs/knowledge/06-lag-and-slowdown.md calls "does the game's own logic observe
-- the slowdown" the single most important question in the folder. $80390a is the
-- candidate answer: if it advances per LOOP ITERATION and the loop iterates less
-- often under load, slowdown changes game STATE, not merely pace.
--
-- Two independent derivations of the same number are carried on purpose
-- (docs/knowledge/03): the RAM counter delta, and an opcode-fetch tap on the
-- loop head $13c356. They must agree.
--
-- Env: HARD_FRAMES, HARD_LIST_PORTS=1, HARD_TRACE=1 (per-frame TSV to stdout)

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local cpu  = mach.devices[":maincpu"]
local prog = cpu.spaces["program"]
local ram  = mach.memory.shares[":sram"]      -- read RAM without re-entering taps
local scr  = mach.screens[":screen"]

local FRAMES = tonumber(os.getenv("HARD_FRAMES") or "") or 1800
local TRACE  = os.getenv("HARD_TRACE") == "1"

local LOOP_HEAD = 0x13C356
local HALT_LOOP = 0x13C398
local CTR_A     = 0x390A     -- offset into :sram share (68k $80390A)
local RASTER    = 0xb07000

-- share:read_u16 is indexed in the share's own units; use byte offsets via u8.
local function ram_u16(off)
  return (ram:read_u8(off) << 8) | ram:read_u8(off + 1)
end

local frames = 0
local f_loop, f_halt = 0, 0
local tot_loop, tot_halt = 0, 0
local loop_hist, ctr_hist = {}, {}
local prev_ctr = nil
local raster_reads = 0
local irq6 = 0
local sp_samples = {}

local function bump(t, k) t[k] = (t[k] or 0) + 1 end

_tap_loop = prog:install_read_tap(LOOP_HEAD, LOOP_HEAD + 1, "loophead", function (offset, data)
  if (cpu.state["CURPC"].value & 0xFFFFFF) == LOOP_HEAD and offset == LOOP_HEAD then
    f_loop = f_loop + 1; tot_loop = tot_loop + 1
  end
end)

_tap_halt = prog:install_read_tap(HALT_LOOP, HALT_LOOP + 1, "haltloop", function (offset, data)
  f_halt = f_halt + 1; tot_halt = tot_halt + 1
end)

_tap_raster = prog:install_read_tap(RASTER, RASTER + 1, "raster", function ()
  raster_reads = raster_reads + 1
end)

-- IRQ6 vector fetch: capture the exception stack frame so the "interrupted PC"
-- reading of boot.lua can be validated rather than trusted.
_tap_vec = prog:install_read_tap(0x78, 0x79, "irq6vec", function (offset, data)
  irq6 = irq6 + 1
  if irq6 <= 3 or irq6 == 600 or irq6 == 1200 then
    local sp = cpu.state["SP"].value & 0xFFFFFF
    local usp = cpu.state["USP"].value & 0xFFFFFF
    local w = {}
    for i = 0, 7, 2 do w[#w+1] = string.format("%04X", prog:read_u16(sp + i)) end
    sp_samples[#sp_samples+1] = string.format(
      "irq6=%d SP=%06X USP=%06X SR=%04X stack=[%s] PC=%06X CURPC=%06X",
      irq6, sp, usp, cpu.state["SR"].value, table.concat(w, " "),
      cpu.state["PC"].value & 0xFFFFFF, cpu.state["CURPC"].value & 0xFFFFFF)
  end
end)

local function report()
  out("--- ddpdojblk main-loop census ---")
  out(string.format("video_frames=%d irq6=%d loop_head_fetches=%d halt_loop_fetches=%d",
      frames, irq6, tot_loop, tot_halt))
  out("raster_b07000_reads=" .. raster_reads)
  for _, s in ipairs(sp_samples) do out("stackframe " .. s) end
  local ks = {}
  for k in pairs(loop_hist) do ks[#ks+1] = k end
  table.sort(ks)
  for _, k in ipairs(ks) do
    out(string.format("loop_iterations_per_video_frame %d -> %d frames", k, loop_hist[k]))
  end
  ks = {}
  for k in pairs(ctr_hist) do ks[#ks+1] = k end
  table.sort(ks)
  for _, k in ipairs(ks) do
    out(string.format("ctr_803A0A_delta_per_video_frame %d -> %d frames", k, ctr_hist[k]))
  end
  out(string.format("final_ctr_80390A=%04X", ram_u16(CTR_A)))
  out("END")
  mach:exit()
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  bump(loop_hist, f_loop)
  local c = ram_u16(CTR_A)
  if prev_ctr then bump(ctr_hist, (c - prev_ctr) & 0xFFFF) end
  prev_ctr = c
  if TRACE then
    out(string.format("T\t%d\t%d\t%d\t%04X", frames, f_loop, f_halt, c))
  end
  f_loop, f_halt = 0, 0
  if frames >= FRAMES then report() end
end)
