-- work.lua -- LOAD METER + (C)-DETECTOR for ddpdojblk, and the input driver
-- that gets the machine out of attract mode and into a real game.
--
-- Landmarks, all read out of the DECRYPTED image with unidasm (m68000) and all
-- confirmed by an absolute-long xref over the same image (xref.py):
--
--   $0CA6  move.l $801470,-(A7) ; rts      BIOS IRQ4 trampoline -> RAM vector
--   $0CBE  move.l $801478,-(A7) ; rts      BIOS IRQ6 trampoline -> RAM vector
--
--   $13C356 jsr $13BE8C     <-- MAIN LOOP HEAD  (xref: the ONLY caller of 13BE8C)
--   $13C374 jsr $13C5B6         frame sync
--   $13C380 bra $13C356     <-- MAIN LOOP TAIL, unconditional
--
--   $13BE8C addq.w #1,$80390A ; bchg #0,$80390D ; addq.w #1,$80390E (mod 3)
--           ^ A COUNTER THAT ADVANCES ONCE PER MAIN-LOOP ITERATION
--   $13C5B6 move.b #1,$803940 ; tst.w $80390E ; bne $13C6B4
--   $13C6B4 tst.b $803940 ; bne $13C6B4        <-- THE VBLANK WAIT LOOP
--   $13C806 subq.b #1,$803940 ; jmp $13C4FC    <-- in the IRQ path: releases it
--
--   $13C9BE lea $800000,A0 ; move.w #$27F,D0 ; ...  the sprite-list clear (640 longs)
--   $13DA02 move.l (A1)+,(A0)+   <-- ONE EXECUTION PER SPRITE ENTRY EMITTED
--   $13DA04 move.l (A1)+,(A0)+       (10 bytes = one 5-word IGS023 entry)
--   $13DA06 move.w (A1)+,(A0)+
--   $13DA10 addq.w #1,D5            D5 = entries emitted so far
--
-- THE 68000 PREFETCH TRAP (NOTES-slowdown-oracle.md section 3a) BIT THIS FILE.
-- The first version gated every execution hook on `CURPC == tapped address`,
-- which is the correct discriminator on the 6502 and WRONG on the 68000: the tap
-- fires on the PREFETCH, one to two instructions ahead of CURPC. Every counter
-- read ZERO and the run looked like "the game never executes its own main loop".
-- Fetch counts here are therefore raw, and each tap covers only the FIRST word
-- of its instruction so one fetch == one execution.
--
-- Env: HARD_FRAMES, HARD_TRACE=1, HARD_SPRITEMAP=1, HARD_SNAP=<frame>,
--      HARD_COIN=<frame>, HARD_START=<frame>, HARD_PLAY=<frame to start playing>

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local cpu  = mach.devices[":maincpu"]
local prog = cpu.spaces["program"]
local ram  = mach.memory.shares[":sram"]
local scr  = mach.screens[":screen"]

local FRAMES    = tonumber(os.getenv("HARD_FRAMES") or "") or 1800
local TRACE     = os.getenv("HARD_TRACE") == "1"
local SPRITEMAP = os.getenv("HARD_SPRITEMAP") == "1"
local COIN_AT   = tonumber(os.getenv("HARD_COIN") or "") or 0
local START_AT  = tonumber(os.getenv("HARD_START") or "") or 0
local PLAY_AT   = tonumber(os.getenv("HARD_PLAY") or "") or 0
local SNAP_AT   = tonumber(os.getenv("HARD_SNAP") or "") or 0

local LOOP_HEAD = 0x13C356
local WAIT_LOOP = 0x13C6B4
local SPR_EMIT  = 0x13DA02
local FLAG      = 0x803940
local CTR       = 0x80390A

local function ram_u8(a)  return ram:read_u8(a - 0x800000) end
local function ram_u16(a) return (ram_u8(a) << 8) | ram_u8(a + 1) end

local frames, irq6 = 0, 0
local f_loop, f_spin, f_emit = 0, 0, 0
local tot_loop, tot_spin, tot_emit = 0, 0, 0
local loop_hist, spin_hist, emit_hist, ctr_hist = {}, {}, {}, {}
local zero_spin = {}
local max_emit, max_emit_frame = 0, 0
local prev_ctr = nil
local raster_reads = 0
local irq6_stack = {}          -- interrupted PC -> count, off the exception frame

local function bump(t, k) t[k] = (t[k] or 0) + 1 end

_tap_loop = prog:install_read_tap(LOOP_HEAD, LOOP_HEAD + 1, "loop", function ()
  f_loop = f_loop + 1; tot_loop = tot_loop + 1
end)
_tap_spin = prog:install_read_tap(WAIT_LOOP, WAIT_LOOP + 1, "spin", function ()
  f_spin = f_spin + 1; tot_spin = tot_spin + 1
end)
_tap_emit = prog:install_read_tap(SPR_EMIT, SPR_EMIT + 1, "emit", function ()
  f_emit = f_emit + 1; tot_emit = tot_emit + 1
end)
_tap_raster = prog:install_read_tap(0xb07000, 0xb07001, "raster", function ()
  raster_reads = raster_reads + 1
end)
_tap_vec = prog:install_read_tap(0x78, 0x79, "irq6", function ()
  irq6 = irq6 + 1
  local sp = cpu.state["SP"].value & 0xFFFFFF
  if sp >= 0x800000 and sp < 0x820000 then
    bump(irq6_stack, prog:read_u32(sp + 2) & 0xFFFFFF)
  end
end)

-- ------------------------------------------------------------------ inputs
local ports = mach.ioport.ports
local function fld(tag, name)
  local p = ports[tag]
  return p and p.fields[name] or nil
end
local held = {}
local function tap_button(tag, name, nframes)
  local f = fld(tag, name)
  if not f then out("input MISSING " .. tag .. "/" .. name) return end
  f:set_value(1)
  held[#held + 1] = { f = f, until_frame = frames + (nframes or 6) }
  out(string.format("input %s/%s at frame %d", tag, name, frames))
end
local playing = false

-- ------------------------------------------------------------------ report
local function hist_line(t)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks)
  local o = {}
  for _, k in ipairs(ks) do o[#o + 1] = string.format("%d:%d", k, t[k]) end
  return table.concat(o, " ")
end

local function report()
  out("--- ddpdojblk work census ---")
  out(string.format("video_frames=%d irq6=%d", frames, irq6))
  out(string.format("main_loop_iterations=%d  wait_spin_fetches=%d  sprite_entries_emitted=%d",
      tot_loop, tot_spin, tot_emit))
  out("raster_b07000_reads=" .. raster_reads)
  out(string.format("flag_803940=%02X ctr_80390A=%04X", ram_u8(FLAG), ram_u16(CTR)))
  out("loop_iters_per_video_frame " .. hist_line(loop_hist))
  out("ctr_80390A_delta_per_video_frame " .. hist_line(ctr_hist))
  out("sprite_entries_per_frame " .. hist_line(emit_hist))
  out(string.format("max_sprite_entries=%d at_frame=%d", max_emit, max_emit_frame))

  -- spin iterations bucketed; the zero bucket is the overrun candidate set
  local b = {}
  for k, v in pairs(spin_hist) do
    local key = (k == 0) and 0 or math.floor(k / 1000) * 1000
    b[key] = (b[key] or 0) + v
  end
  out("spin_iters_per_video_frame_bucketed " .. hist_line(b))
  out("frames_with_zero_spin=" .. #zero_spin)
  local shown = {}
  for i = 1, math.min(60, #zero_spin) do shown[#shown + 1] = zero_spin[i] end
  out("zero_spin_frames=" .. table.concat(shown, ","))

  local ks = {}
  for k in pairs(irq6_stack) do ks[#ks + 1] = k end
  table.sort(ks, function(x, y) return irq6_stack[x] > irq6_stack[y] end)
  out("distinct_interrupted_pcs=" .. #ks)
  for i = 1, math.min(12, #ks) do
    out(string.format("interrupted_pc=%06X n=%d", ks[i], irq6_stack[ks[i]]))
  end
  out("END")
  mach:exit()
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1

  for i = #held, 1, -1 do
    if frames >= held[i].until_frame then held[i].f:set_value(0); table.remove(held, i) end
  end
  if COIN_AT > 0 and frames == COIN_AT then tap_button(":Service", "Coin 1", 8) end
  if START_AT > 0 and frames == START_AT then tap_button(":P1P2", "1 Player Start", 8) end
  if PLAY_AT > 0 and frames == PLAY_AT then playing = true; out("play_script_on at " .. frames) end
  if playing then
    -- hold shot, and sweep left/right so the ship is never parked in a corner
    local shot = fld(":P1P2", "P1 Button 1")
    if shot then shot:set_value(1) end
    local phase = (frames // 45) % 4
    local l, r = fld(":P1P2", "P1 Left"), fld(":P1P2", "P1 Right")
    local u, d = fld(":P1P2", "P1 Up"), fld(":P1P2", "P1 Down")
    if l then l:set_value(phase == 1 and 1 or 0) end
    if r then r:set_value(phase == 3 and 1 or 0) end
    if u then u:set_value(phase == 0 and 1 or 0) end
    if d then d:set_value(phase == 2 and 1 or 0) end
  end

  if SNAP_AT > 0 and frames == SNAP_AT then
    scr:snapshot(string.format("hard_f%06d.png", frames))
    out("snapshot at frame " .. frames)
  end

  bump(loop_hist, f_loop)
  bump(spin_hist, f_spin)
  bump(emit_hist, f_emit)
  if f_spin == 0 then zero_spin[#zero_spin + 1] = frames end
  if f_emit > max_emit then max_emit = f_emit; max_emit_frame = frames end

  local c = ram_u16(CTR)
  if prev_ctr then bump(ctr_hist, (c - prev_ctr) & 0xFFFF) end
  prev_ctr = c

  if TRACE then
    out(string.format("T\t%d\t%d\t%d\t%d\t%04X\t%02X",
        frames, f_loop, f_spin, f_emit, c, ram_u8(FLAG)))
  end
  f_loop, f_spin, f_emit = 0, 0, 0
  if frames >= FRAMES then report() end
end)
