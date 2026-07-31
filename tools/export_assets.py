#!/usr/bin/env python3
"""Export every ROM asset the JavaScript port needs into `assets/`.

Nothing here is guesswork: each extraction replays the routine the game itself
uses, cited by address.  See docs/00-MASTER-REFERENCE.md.

Outputs
    assets/manifest.json        all small tables (levels, anims, metasprites...)
    assets/levels/NN.map.bin    2 B/cell {metatileId, collision}, column-major
    assets/levels/NN.vram.bin   8192 B VRAM image after the level's resource loads
    assets/player.tiles.bin     player animation tile pool (bank 2)

player.tiles.bin is the one output that is a VERBATIM slice of the cartridge --
`rom.data[pool_start:pool_end]`, 6974 B, no transformation at all.  That is
fine locally (the oracle and pixeldiff compare against exactly these bytes) and
NOT fine publicly: `tools/build-dist.mjs` refuses to publish it and substitutes
original placeholder art from `tools/make-placeholder-tiles.mjs` instead.  If
you ever change what this writes -- its length, or the offsets manifest.player
.anims points at -- regenerate and eyeball the placeholder too, or the site
ships a pool the manifest's offsets no longer fit.

Usage:  python tools/export_assets.py
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                'oracle'))
from gbrom import (Rom, ROOT, GAME_ROOT, build_level_vram, level_map, level_collision_lut,
                   level_metatiles, level_resource_indices, load_resource,
                   NUM_LEVELS)
import animtables

OUT = os.path.join(GAME_ROOT, 'assets')

# --- ROM table addresses (master reference §6.5, §7.3, §7.4, §10) -----------
T_LEVEL_SUBTYPE   = (0, 0x1015)   # b7 reset physics, low nibble -> $C73E
T_MUSIC_FRESH     = (0, 0x1023)
T_MUSIC_REENTRY   = (0, 0x1031)
T_CAMERA_CLAMP    = (0, 0x103F)   # -> $C732
T_LEVEL_EXITS     = (0, 0x286D)   # 14 x {exitRight, exitTop}
T_PLAYER_START    = (1, 0x7CED)   # 14 x {Xhi, Yhi}
T_HITBOX          = (0, 0x27A8)   # 31 x {halfW, halfH} by anim id
T_SINE            = (0, 0x09A2)   # 32 signed bytes (water wobble)
T_SLOPE_Y         = (0, 0x221C)   # slope height tables, 1/16 px
T_SLOPE_Y_END     = (0, 0x227C)
T_SLOPE_X         = (0, 0x23B8)   # slope X-snap tables: SIX 16-byte tables
T_SLOPE_X_END     = (0, 0x2418)   # $23B8-$2417, ending where loc_00_2418 begins
T_PLAYER_ANIM     = (2, 0x4D8C)   # 31 x 24 B = 3 columns x 4 LE tile pointers
PLAYER_ANIM_COUNT = 31
T_PLAYER_TILES    = (2, 0x5074)   # tile pool the anim pointers index into
PLAYER_TILES_END  = (2, 0x6BB2)
T_METASPRITE_1    = (5, 0x5F5C)   # 243 pointers (default table)
T_METASPRITE_2    = (5, 0x736B)   # 105 pointers (levels 4, 11, 14 enemies)
MS1_COUNT         = 243
MS2_COUNT         = 105
T_ENEMY_SPAWNS    = (5, 0x46EC)   # 14 x {src16, count}
T_OBJECT_SPAWNS   = (5, 0x4716)
T_ENEMY_DMG       = (1, 0x6BC1)   # 13 B, by enemy state
T_LEVEL_DMG_BONUS = (1, 0x6BCE)   # 14 B
# loc_00_3D35 does `LD HL,$41B8`, which lands in the BANKED $4000-$7FFF window
# -- so this is 1:$41B8, not bank 0. Reading it from bank 0 yields garbage that
# happens to be valid metasprite indices, which renders spinning Batmen instead
# of batarangs.
T_BATARANG_ANIM   = (1, 0x41B8)   # 8 metasprite ids, spin cycle indexed by
                                  # (frame & $1C) >> 2
# Map-object movement scripts, 1:$4B43-$4BA4. One byte per step:
# 0 = +X, 1 = -X, 2 = -Y, 3 = +Y (jt_01_4525 $459E). The seven entry points are
# immediates in the handler, not a pointer table, so the offsets live in
# src/actors.js next to the code that selects them. Ends where the activation
# table begins at $4BA5.
T_OBJ_SCRIPTS     = (1, 0x4B43)
T_OBJ_SCRIPTS_N   = 0x4BA5 - 0x4B43
# Title screen ingredients. The boot path builds it from two bank-6 tile blobs
# and three VRAM scripts; tools/oracle/titlediff.mjs proves those plus the boot
# clear reproduce the old assets/title.vram.bin capture byte for byte.
# Sources and destinations are immediates in the boot code, not a table.
T_TITLE_TILES = [
    ((6, 0x54B4), 1136, 0x8800),      # 00:01xx -> sub_00_09FB
    ((6, 0x5928), 1680, 0x8C70),
]
T_TITLE_SCRIPTS = [
    (5, 0x52F5),                      # 00:0238, the Sunsoft copyright screen
    (5, 0x5170),                      # 00:0291, the title artwork
    (1, 0x7C44),                      # 00:02AB, the title text
]
# Round select / continue (state 5). Built ON TOP of the title's VRAM -- the
# cartridge never re-clears the tiles, it just refills the BG map and adds its
# own artwork. Ingredients found with tools/oracle/titlebuild.py, which shows
# the whole screen is four events.
T_ROUNDSEL_FILL = 0x00            # 00:0361 -> sub_00_34A4 with D = $00
T_ROUNDSEL_TILES = [
    ((6, 0x54B4), 1136, 0x8800),  # the shared font blob, copied again
    ((6, 0x6E74), 2048, 0x9000),  # the round-select artwork
]
T_ROUNDSEL_SCRIPT = (6, 0x7674)
# The WINDOW tilemap, $9C00-$9FFF, built at level init for EVERY level.
#
# Not the $0E24 script the old notes named: that one sits behind
# `$0DD9: CP $0E / JP NZ, loc_00_0E74` and runs on level 14 alone -- measured,
# tools/oracle/waterbuild.py raises if $0E24 fires on any other level.  What
# actually runs is loc_00_04BB's own pair, three instructions apart:
#   $04C9  LD HL,$9C40 / LD BC,$03C0  -- 960 cells of tile $01
#   $04D7  LD DE,$32A3 -> sub_00_0A0E -- two 20-cell rows at $9C00/$9C20
# $9C14-$9C1F and $9C34-$9C3F are written by NEITHER, and keep the $2F the boot
# clear at $0223 left there.  They are off the right edge of the 20-tile window,
# so they are never seen; they are still part of the byte-exact image.
T_WINDOW_SCRIPT = (0, 0x32A3)
T_WINDOW_FILL_DEST = 0x9C40
T_WINDOW_FILL_LEN = 0x03C0
T_WINDOW_FILL = 0x01
# Level 14 only ($0DDB): $0E0C refills $9C00-$9C3F with $01 and $0E24 paints it.
T_WINDOW_L14_SCRIPT = (5, 0x5276)
T_WINDOW_L14_FILL_DEST = 0x9C00
T_WINDOW_L14_FILL_LEN = 0x0040

# ---- STATIC BACKGROUND ART, painted straight into the $9800 tilemap --------
#
# Two init-time VRAM scripts that the column streamer never overwrites, so they
# are part of the picture on every frame of their levels and are invisible to a
# renderer that samples the level map through the metatile table.
#
#   loc_00_0E8A ($0E94)  levels 9/$0A/$0B   7:$7A5E  256 writes, $9800-$98FF
#                        = tilemap rows 0-7, the city skyline behind the sky.
#   loc_00_0EEA ($0EF8)  level 6 only       7:$7B77  105 writes, $9A6D-$9B70
#                        = tilemap rows 19-27, the train's track band.
#
# Why the streamer leaves them alone, measured rather than assumed:
#   * The VBlank column flush at loc_00_0664 tests $FFB0 and, on 9 and $0A,
#     forces H = $99 and skips its first eight unrolled writes ($0688-$068D) --
#     so a streamed column starts at tilemap ROW 8.  Level $0B is not in that
#     test, but its camera clamp is 12 on a 13-wide arena, so the reachable
#     travel is two tile columns; tools/oracle/tilemapdump.py over a full
#     left-right-left sweep shows rows 0-7 still byte-identical to the script.
#   * Level 6 never reaches the column flush at all: $066B is `CP $06 /
#     JP Z, loc_00_0714`.
# Both verified with tilemapdump.py after 300 scrolled frames: rows 0-7 (9/10)
# and rows 19-27 (6) equal the decoded script exactly.
#
# These ship as the SCRIPT BYTES, not as a decoded 32x32 image, for the same
# reason every other screen does: src/vramscript.js is the ROM's own
# interpreter and is already bit-exact, so decoding in the port keeps one
# implementation instead of two.
T_BG_ART = [
    {'levels': [0x09, 0x0A, 0x0B], 'rom': '7:$7A5E', 'loc': (7, 0x7A5E)},
    {'levels': [0x06],             'rom': '7:$7B77', 'loc': (7, 0x7B77)},
]
# sub_00_0A7F's palette ramp -- the fade every screen enters and leaves through.
# $0B09 is EIGHT bytes: [0..3] is the ramp both BGP and OBP0 walk, [4..7] a
# second ramp BGP alone uses when the caller passes C & $7F == 3 ($0AA0).
# $0B11 is OBP1's four.  $C70E is the step: a fade-IN (C bit 7 set) starts at 3
# and counts DOWN to 0, a fade-out starts at 0 and counts up.
T_FADE_BGP  = (0, 0x0B09)
T_FADE_OBP1 = (0, 0x0B11)
# The title's LCD registers, each read at the address of the immediate that
# writes it -- not captured off a running emulator.  The shadow bytes
# $FFA9-$FFAF are pushed to rSCX/rSCY/rWX/rWY/rBGP/rOBP0/rOBP1 in the VBlank
# ISR at $0806-$0817, so writing the shadow IS writing the register.
#   $0216  LD A,$07 -> $FFAB (rWX)
#   $02A8  LD A,$90 -> $FFAC (rWY), re-armed just before the title's text script
#   $02BC  LD A,$E7 -> rLCDC directly
# rSCY is $021D's XOR A -> $FFAA; rSCX is never written at all on this path and
# keeps the 0 that $0160's HRAM clear left.  BGP/OBP0/OBP1 come out of the fade
# tables above at step 0, which is where $02C1's C = $80 fade ends.
# State 4, loc_00_031B: the press-start flash.  $0333 assembles a VRAM script
# in WRAM at $C61B and lets the VBlank ISR at $0714 run it -- 19 bytes from
# 1:$7C44 when `B & $08` is set, 5 from 1:$7C57 when it is clear.  The first is
# byte-for-byte T_TITLE_SCRIPTS' third entry (the whole title-text script,
# START and OPTIONS both, terminator included); only the eraser is new.  It is
# a single RLE record: $2F over the five cells at $9967, i.e. START alone.
T_TITLE_FLASH_OFF = (1, 0x7C57)
# --- the stage-intro card, sub_00_333F (src/stageintro.js) -----------------
#
# Everything here is read at the address of the IMMEDIATE that produces it, so
# a wrong transcription is a wrong byte rather than a plausible constant.
# MEASURED end to end by tools/oracle/stageintro.py: 60 blank frames, three
# build frames, 180 held, 33 of fade -- 276 on all eight levels that show it.
#
#   $3370  LD D,$DC   -> sub_00_34A4, the BG fill
#   $3375/$337A/$337F  the three sub_00_0B15 resource ids ($02/$1D/$05)
#   $338C  LD A,$E7   -> rLCDC
#   $3390  LD B,$3C   -- the blank hold before anything is painted
#   $345E  LD A,$B4   -> $C712, the held count
#   $3463/$3464 LD BC,$5858 and $3466 LD E,$F2 -- the emblem, drawn every frame
#   $336A/$336B LD BC,$0104 -> sub_00_0AE1 (B = id, C = mask, §32)
T_INTRO_FILL      = (0, 0x3370)
T_INTRO_RES_IDS   = [(0, 0x3375), (0, 0x337A), (0, 0x337F)]
T_INTRO_LCDC      = (0, 0x338C)
T_INTRO_BLANK     = (0, 0x3390)
T_INTRO_HOLD      = (0, 0x345E)
T_INTRO_SPRITE_C  = (0, 0x3463)   # LD BC,$5858 -- C is the low operand byte
T_INTRO_SPRITE_B  = (0, 0x3464)
T_INTRO_SPRITE_ID = (0, 0x3466)   # LD E,$F2
T_INTRO_SOUND_C   = (0, 0x336A)
T_INTRO_SOUND_B   = (0, 0x336B)
# The two halves of the frame decoration, $33A6 and $33D5. Fixed 55-byte copies
# into $C61B, one per frame -- NOT walked to a terminator, because the length is
# the `LD BC,$0037` immediate and that is what the cartridge copies.
T_INTRO_SCRIPTS   = [(3, 0x7C15), (3, 0x7C4C)]
T_INTRO_SCRIPT_N  = 0x37
# $340B: 14 LE pointers, each to {len, script[len]}. len also goes to $FFA0.
T_INTRO_LEVEL_PTRS = (3, 0x7BF9)
# loc_00_343A, boss levels ONLY (4/8/$0B/$0E -- $3428-$3438): 31 bytes appended
# at $C61B + $FFA0, i.e. exactly where the boss levels' own scripts stop without
# a terminator. Decoded with the round-select font ($8A = 'A') it is BATMAN / VS.
T_INTRO_BOSS_SCRIPT = (0, 0x3485)
T_INTRO_BOSS_SCRIPT_N = 0x1F
# --- the ENDING, loc_00_3652 (src/ending.js) -------------------------------
#
# Reached from loc_00_35E8's dispatch: `$35F6 CP $0E / JR Z`, i.e. by clearing
# level 14 and nothing else.  MEASURED end to end by tools/oracle/ending.py:
# 4137 frames from $3652 to the START wait at $3887.
#
# Every constant below is read at the address of the IMMEDIATE that produces
# it, so a wrong transcription is a wrong byte rather than a plausible one.
#
# BANKS.  $3675/$36DD/$371D/$3758 run with bank 7 mapped and $3787/$37A2/
# $3815/$3827/$3865 with bank 1 -- $375F switches back to 1 and only the credit
# lookup ($37BD-$37DF) leaves it.  1:$7B34 and 7:$7B34 are both plausible-
# looking data; only the first is a valid VRAM script, and $C703 says 1.
T_END_FILL        = (0, 0x3653)   # LD D,$7E -- pictures 1/2/3 and THE END
T_END_FILL4       = (0, 0x374A)   # LD D,$6E -- the credits screen, alone
T_END_LCDC        = (0, 0x3695)   # LD A,$E7 -> rLCDC, at all four builds
T_END_RES_IDS     = [(0, 0x3658), (0, 0x365D), (0, 0x3662), (0, 0x3667)]
# The four picture scripts, run DIRECTLY through sub_00_0A0E with the LCD off
# -- not queued through $C61B like the crawl's.  Read the LD DE immediate.
T_END_PIC_PTRS    = [(0, 0x3676), (0, 0x36DE), (0, 0x371E), (0, 0x3759)]
T_END_PIC_BANK    = 7
T_END_THEEND_PTR  = (0, 0x3866)   # LD DE,$7B88 -- bank 1
T_END_TEXT_BANK   = 1
# $3787/$37A2 paint the credit box in tile $7E, $3815/$3827 repaint it in $6E
# and so erase the line.  All four are FIXED 21-byte copies ($378E's LD BC).
T_END_BOX_ON_PTRS  = [(0, 0x3788), (0, 0x37A3)]
T_END_BOX_OFF_PTRS = [(0, 0x3816), (0, 0x3828)]
T_END_BOX_N        = (0, 0x378E)  # LD BC,$0015
# $37CE: 13 LE pointers in bank 7, indexed by $C712 * 2, each -> {len, script}.
T_END_CREDIT_PTRS  = (0, 0x37CF)
T_END_CREDIT_BANK  = 7
T_END_CREDIT_COUNT = (0, 0x3841)  # CP $0D -- $C712 counts 0 .. $0C
T_END_BLACK_BGP    = (0, 0x3686)  # LD A,$FF -> $FFAD, before picture 1
# $36B0's ramp: NOT sub_00_0A7F's $0B09 table.  Four BGP bytes walked into
# $FFAD on the frames where B & 7 == 0, over the $21 frames $36A6 counts.
T_END_RAMP         = (0, 0x3A31)
T_END_RAMP_N       = 4
T_END_RAMP_FRAMES  = (0, 0x36A7)  # LD B,$21
T_END_BLANK_FRAMES = (0, 0x3699)  # LD B,$B4 -- 180 frames of a black screen
T_END_HOLD_C       = (0, 0x36BF)  # LD BC,$01B0, C is the low operand byte
T_END_HOLD_B       = (0, 0x36C0)
T_END_CRAWL_FIRST  = (0, 0x3780)  # LD B,$3C -- the gap before the first line
T_END_CRAWL_WAIT   = (0, 0x3845)  # LD B,$20 -- and before every later one
T_END_TEXT_HOLD    = (0, 0x37F9)  # LD A,$80 -> $C713, the line's own hold
T_END_TAIL_FRAMES  = (0, 0x384A)  # LD B,$78
T_END_END_FRAMES   = (0, 0x3878)  # LD B,$68
# The seven sub_00_0A7F calls, in order.  Note $370E follows picture 3 with NO
# fade out at all -- the cut to the credits screen happens with the LCD off.
T_END_FADES = [(0, 0x36CA), (0, 0x36FA), (0, 0x370A), (0, 0x373A),
               (0, 0x377B), (0, 0x3852), (0, 0x3880)]
T_END_SPRITE_C  = (0, 0x3794)     # LD BC,$3838 -- C is x
T_END_SPRITE_B  = (0, 0x3795)     # ... B is y
T_END_SPRITE_ID = (0, 0x3797)     # LD E,$F2
T_END_SOUND_C   = (0, 0x36A1)     # LD BC,$0A03 -> sub_00_0AE1 (B id, C mask)
T_END_SOUND_B   = (0, 0x36A2)
T_TITLE_WX   = (0, 0x0216)
T_TITLE_WY   = (0, 0x02A8)
T_TITLE_LCDC = (0, 0x02BC)
# The two respawning sewer enemies of levels 1-2, refilled every frame they are
# dead by loc_00_2D3D. 32-byte $C268 records, fixed data in bank 0. They are NOT
# in the level's enemy blob -- 5:$46EC says count 6 while the cartridge runs 8.
T_RESPAWN_ENEMIES = [(0, 0x32F8), (0, 0x32D8)]     # slot 6 (col $2B), 7 ($27)
# --- the per-level sub_00_2CBE subsystems (src/conveyor.js) ---------------
# Level 7's loc_00_2F5F refills $C1E8 slots 4/5/6 from these three 16-byte
# records, up to ten times, whenever all three are free again.  Level $0D's
# loc_00_301E stamps ONE record into slots 0/1/2 and then overwrites each
# slot's Xhi with $58/$5B/$5C.  Both are map objects of type $0A -- which is
# how a type "never placed in any level's spawn data" still reaches the game.
T_SUBSYS_OBJ_L7 = [(5, 0x4FB0), (5, 0x4FC0), (5, 0x4FD0)]
T_SUBSYS_OBJ_L13 = (0, 0x3318)
# Level $0C's collapsing floor, loc_00_2FB7: 72 x {col, row}, one cell erased
# per frame while the player is within 6 columns of the screen centre.
T_COLLAPSE_CELLS = (1, 0x7BB4)
T_COLLAPSE_CELLS_N = 0x48 * 2      # $7BB4-$7C43, ending where 1:$7C44 begins
# loc_00_3050's entry height, indexed by $C73E - 1 -- i.e. one byte per BOSS
# (levels 4, 8, $0B, $0E).  4 B, ending where sub_00_333F begins.
T_RESCUE_ENTRY_Y = (0, 0x333B)
# OPTIONS menu (state 6, loc_00_3893). Its PANEL is not drawn here at all --
# the title's own scripts already put it in the WINDOW tilemap, hidden at
# rWY $90, and the screen just slides the window down to $45. What IS dynamic:
#   1:$7C5C  3 B, cursor Y per row (GAME LEVEL / SOUND TEST / EXIT), $39D4
#   1:$7C5F  3 x 10 B VRAM scripts, one per difficulty, chosen at $39E4. Their
#            dest high byte is patched to $9C at $3A05 -- they write the
#            window map, not the BG.
# Map-object metasprite ids, 1:$4AB7 -- 14 levels x 10 types, indexed
# (level-1)*10 + (type-1) at loc_01_4A37. Every drawable object's sprite comes
# from here; loc_01_49F6 is the common tail EVERY object reaches, retired ones
# included, and it skips only types $07/$09/$0B (terrain stampers, no sprite).
T_OBJ_METASPRITES = (1, 0x4AB7)
T_OBJ_METASPRITES_N = 14 * 10
# Scripted pit leaps, sub_01_7D09. A per-level nibble table indexed by Xhi>>1
# (even column = high nibble) names one of 14 canned {Yvel, Xvel} pairs.
#
# The BASES are immediates in the dispatch, not a pointer table, so they live
# in src/enemies.js next to the guards they pair with. Measured at 1:$7D2E
# onward: L1 $7E3F, L2 $7E7F, L3 $7E8F, L5 $7EB7, L7 and L13 BOTH $7EDC.
# There is a sixth arm at $7D59 (guard $4E, table $7F02) with NO xref -- the
# JR at $7D57 jumps over it. Dead code on the cartridge; the span below still
# covers it so that stays visible rather than looking like a short read.
T_GAP_TABLE       = (1, 0x7E3F)
T_GAP_TABLE_N     = 0x7F29 - 0x7E3F
# The 14 leap velocities are NOT a table -- they are immediates in 14 code
# stubs at 1:$7DBC, each `LD A,Yvel / LD [HL-],A / LD A,Xvel` followed by a
# jump (or, for the last one, a fall-through) into the common tail at $7E26.
T_GAP_LEAPS       = (1, 0x7DBC)
T_GAP_LEAPS_N     = 14
# --- enemy blobs that used to be hex literals in src/enemies.js -------------
# All four verified byte-identical to the cartridge before they moved.
#
# 1:$6891-$6BC0 is the metasprite-id table BLOCK: per-state pointer rows (walk
# $6891, rise/fall $68EF, melee $691B, landing $69F3, turn $6A53, idle $6A97,
# projectile variants $6AF3, ranged poses $6AFD+). enemies.js indexes it by ROM
# ADDRESS through `ar`/`arw`, so the base has to travel with it.
T_ENEMY_ANIM      = (1, 0x6891)
T_ENEMY_ANIM_N    = 0x6BC1 - 0x6891
# The level-14 Joker balloon entrance, 1:$77BD. Path bytes and pose ids, 25
# each, and they are ADJACENT -- $7A41 + $19 is exactly $7A5A.
T_INTRO_PATH      = (1, 0x7A41)
T_INTRO_POSES     = (1, 0x7A5A)
T_INTRO_N         = 25
# sub_01_6BDC's five 32-byte prefab enemy records, copied whole into a slot.
T_PROJECTILES     = (1, 0x6CEA)
T_PROJECTILES_N   = 5
# The bat-rope's chain. 1:$4224 is 5 link metasprite ids per facing (the
# second five are the first five reversed, which is the ROM's data and not an
# optimisation to make here); 1:$422E is the hook head, one id per facing.
T_ROPE_LINKS      = (1, 0x4224)
T_ROPE_LINKS_N    = 10
T_ROPE_HOOKS      = (1, 0x422E)
T_ROPE_HOOKS_N    = 2
# Round select's CONTINUE line. 0:$3328 is a sub_00_0A0E SCRIPT, not a tile
# list: {dest $9A04, ctrl $08, eight tiles, $00}. Exporting the script rather
# than the eight bytes means the destination travels with the data and the
# already-ported interpreter draws it.
T_CONTINUE_SCRIPT = (0, 0x3328)
# The player's attack poses, loc_00_1B4A's two tables. 0:$1C1F is 24
# CONTIGUOUS bytes -- the "three tables" at $1C1F/$1C27/$1C2F are one block
# indexed by (attackTimer & $0C) >> 2 plus $C71D * 4 -- and 0:$2786 is 32,
# likewise contiguous with the $2796 half.
T_ATTACK_ANIM     = (0, 0x1C1F)
T_ATTACK_ANIM_N   = 24
T_ATTACK_MSINDEX  = (0, 0x2786)
T_ATTACK_MSINDEX_N = 32
T_OPT_CURSOR_Y    = (1, 0x7C5C)
T_OPT_DIFFICULTY  = (1, 0x7C5F)
# --- the door/gate sequencer, sub_01_4BB0 (src/doors.js) -------------------
# 1:$4D00  4 x {rowDelta, colDelta}: which of the door's four cells phase
#          $C733 = 1..4 erases, relative to the BOTTOM-LEFT cell in
#          $C734/$C735.  Read low byte first ($4BC0: LD A,[HL+] / LD B,(HL)),
#          so the pair is (row, col), not (col, row).
# 1:$4D08  35 x {xStep, yStep}: the debris arc, indexed by $C733 - 6.  xStep
#          is a MAGNITUDE -- pieces 0/1 negate it ($4C69 CPL/INC A) -- and
#          yStep is signed and ADDED to the position, so $C0 is 4 px up.
#          35 entries exactly: $C733 runs 6..$28 and wraps at $29 ($4CEB).
# 1:$4CF4  the level-3 debris sprites, one per PIECE (loc_01_4CCC).
# 1:$4CF8  everyone else's, one per animation phase (($C733-6) & $0E) >> 1.
#          Levels $0C/$0D read no table at all -- $4CD1 hard-codes id $42.
T_DOOR_STEPS      = (1, 0x4D00)
T_DOOR_DEBRIS_VEL = (1, 0x4D08)
T_DOOR_DEBRIS_VEL_N = 35 * 2       # $4D08-$4D4D, ending where loc_01_4D4E begins
T_DOOR_SPRITES_L3 = (1, 0x4CF4)
T_DOOR_SPRITES    = (1, 0x4CF8)
# The $C693 effect pool's animation table, 0:$2807: five LE pointers, one per
# subtype byte (+5 of the record), each naming a run of metasprite ids indexed
# by (counter & $18) >> 3 -- so 0..3, even though the entries are only THREE
# bytes apart and index 3 therefore reads the next entry's first byte (the
# fifth reads $2820, the first byte of loc_00_2820).  Resolved to 5 x 4 here
# rather than shipped as pointers, so the port never carries a ROM address.
T_EFFECT_SPRITES  = (0, 0x2807)
T_EFFECT_SPRITES_N = 5
# --- the two death sequences (src/effects.js) ------------------------------
# Batman's death, the $C1C0 burst.  sub_00_29E7 seeds 8 x 5 B from 0:$2AD7 and
# loc_00_2A0D drives it; 0:$2ACF names one metasprite per slot and 0:$2AFF is
# the shared flight path, one byte per step packing {dy:dx} as signed nibbles.
#
# The path's LENGTH is not a guess.  A slot sets its "parked" bit the moment
# its 16-bit counter reaches $113 ($2A31: hi nonzero AND lo >= $13), and
# $2AFF + $113 = $2C12, the last byte before sub_00_2C13 -- so the table is
# exactly as long as the walk that reads it.  Summing its signed nibbles over
# 1..$113 gives dx -79 / dy +24, which takes slot 0 from ($88,$38) to
# ($39,$50) -- byte for byte the state the cartridge ends the sequence in.
T_BURST_SPRITES   = (0, 0x2ACF)
T_BURST_INIT      = (0, 0x2AD7)
T_BURST_PATH      = (0, 0x2AFF)
T_BURST_PATH_N    = 0x2C13 - 0x2AFF        # 276
# The boss death, 1:$78CC / 1:$7936.  $7A73 is 16 explosion offsets indexed by
# $C713, packed the same way (high nibble X, low nibble Y, both signed, both in
# whole metatiles).  The pose tables are picked by the enemy's STATE byte:
#   $7A1D  states 7 / $0A, facing * 8 + (($C740 & $70) >> 4)
#   $7A2D  the same index, but only when $C73E == 2 (boss 2 draws through
#          sub_00_0BC6 where everyone else uses sub_00_0BAF)
#   $7A3D  the default arm (boss 3, state 8), by facing
#   $7A3F  state 9, by facing
T_BOSS_EXPLOSIONS = (1, 0x7A73)
T_BOSS_POSE_1     = (1, 0x7A1D)
T_BOSS_POSE_2     = (1, 0x7A2D)
T_BOSS_POSE_WALK  = (1, 0x7A3D)
T_BOSS_POSE_B4    = (1, 0x7A3F)
# STAGE CLEAR -- the victory fanfare's picture, loc_00_34D0 (src/effects.js).
#   6:$611C  23 LE pointers, indexed by $C70F * 2 at $3520.  Each names a $20 B
#            block that loc_00_350F hands to the VBlank block queue ($FF9B /
#            $C5CB), one per frame, landing at $8800 + n * $20 -- 46 tiles,
#            ids $80-$AD in the bg cache's addressing.  MEASURED contiguous
#            ($614A..$6429), but the pointers are followed anyway so a
#            non-contiguous cartridge revision could not silently shift.
#   6:$642A  two sub_00_0A0E scripts, copied into $C61B by loc_00_3566 and run
#   6:$6459  by the ISR at $0714.  They paint the WINDOW map at $9C00, five
#            rows of 20 tiles -- the fifth deliberately blank, which is why the
#            $35B2 LYC clip can land on either side of it.
T_STAGECLEAR_PTRS    = (6, 0x611C)
T_STAGECLEAR_BLOCKS  = 0x17
T_STAGECLEAR_BLOCK_N = 0x20
T_STAGECLEAR_SCRIPTS = [(6, 0x642A), (6, 0x6459)]
# sub_00_0A7F's palette ramp, 0:$0B09 and 0:$0B11 back to back.  $0AAA indexes
# the first with $C70E (+4 when C & $7F == 3) for rBGP/rOBP0 and $0AC5 the
# second with $C70E for rOBP1.  Five stops per fade, one every eighth of the
# routine's 33 frames.
T_FADE_PALETTES   = (0, 0x0B09)
T_FADE_PALETTES_N = 16
T_SCRIPT_PTRS     = (0, 0x27E6)   # loc_00_164A: 3 LE pointers to move scripts
T_SCRIPT_BLOCK    = (0, 0x27E6)   # the scripts themselves live just past them
T_SCRIPT_BLOCK_N  = 0x1E          # $27E6-$2803
T_SCRIPT_STEPS    = (0, 0x2804)   # loc_00_2751: step count per mode
T_HUD_BAR2        = (0, 0x100C)   # sub_00_0F7B second energy bar; three
                                  # overlapping bases $100C/$100E/$1011 chosen
                                  # by max HP (12 / 14 / other)

# --- runtime map patches ---------------------------------------------------
# sub_00_0D50 runs at level init AFTER sub_00_0C34 has expanded the map, and
# for the two water levels it stamps collision $08 (water) straight into the
# $D000 image with hard-coded addresses -- the data is in the *code*, not in
# any table, so replaying the map blob and the collision LUT alone produces a
# map with solid rock where the water should be.
#   loc_00_0E36 (level $05):  LD HL,$D263 / D=$0D    then  $D205 / D=$10
#   loc_00_0E51 (level $0D):  $D41B / $05, $D4FB / $05, $D41D / $0C
# Each writes $08 `count` times with stride $20 (= one map column).
# Verified against the live $D000 by tools/verify_assets.py.
WATER_PATCHES = {
    5:  [(0xD263, 0x0D), (0xD205, 0x10)],
    13: [(0xD41B, 0x05), (0xD4FB, 0x05), (0xD41D, 0x0C)],
}
WATER_STRIDE = 0x20
WATER_VALUE = 0x08


def apply_water_patches(cells, level):
    """Replay sub_00_0D50's hard-coded water stamps. -> number of cells hit."""
    n = 0
    for addr, count in WATER_PATCHES.get(level, ()):
        for i in range(count):
            off = (addr - 0xD000) + i * WATER_STRIDE
            if off >= len(cells):
                raise ValueError(f'level {level}: water patch ${addr:04X}+{i} '
                                 f'lands outside the {len(cells)}-byte map')
            cells[off] = WATER_VALUE
            n += 1
    return n


def s8(v):
    return v - 256 if v > 127 else v


def read_table(rom, loc, n):
    return list(rom.rd(loc[0], loc[1], n))


def read_effect_sprites(rom, loc, count):
    """Resolve 0:$2807's pointer table into `count` runs of 4 metasprite ids.

    loc_00_1411 does `A = subtype * 2`, `HL = $2807 + A`, dereferences the LE
    word and then adds the 0..3 animation index. The entries are packed three
    bytes apart, so index 3 legitimately reads into the next entry -- that is
    the cartridge's own arithmetic and is reproduced rather than clamped.
    """
    out = []
    for i in range(count):
        ptr = rom.u16(loc[0], loc[1] + i * 2)
        out.append(list(rom.rd(loc[0], ptr, 4)))
    return out


def read_gap_leaps(rom, loc, count):
    """Decode the 14 pit-leap velocity stubs at 1:$7DBC into {Yvel, Xvel} pairs.

    Each stub is `3E yy` `32` `3E xx` then a terminator -- JP $7E26, JR to it,
    or (the last one) nothing at all, falling straight through. Asserting the
    opcode shape is the whole point: it means a wrong address produces a loud
    failure here instead of fourteen plausible-looking velocities.
    """
    pairs = []
    off = rom.off(loc[0], loc[1])
    for i in range(count):
        ld_y, yv, ldd, ld_x, xv = rom.data[off:off + 5]
        if (ld_y, ldd, ld_x) != (0x3E, 0x32, 0x3E):
            raise SystemExit(f'gap leap {i} at {off:#x} is not LD A,n/LD [HL-],A/'
                             f'LD A,n -- got {ld_y:02X} {ldd:02X} {ld_x:02X}')
        pairs.append([yv, xv])
        off += 5
        op = rom.data[off] if i < count - 1 else None
        if op == 0xC3:                       # JP $7E26
            off += 3
        elif op == 0x18:                     # JR to the same tail
            off += 2
        elif op is not None:
            raise SystemExit(f'gap leap {i} ends with {op:02X}, not a jump')
    return pairs


def vram_script(rom, loc):
    """Bytes of a sub_00_0A0E script, walked to its $00 terminator.

    Record = {destHi, destLo, ctrl}; ctrl is mode<<6 | count, and the RLE modes
    (1 and 3) carry a single payload byte where the copy modes carry `count`.
    A count of 0 means 256 -- the loops are DEC B / JR NZ.
    """
    bank, addr = loc
    p = addr
    while rom.u8(bank, p) != 0x00:
        ctrl = rom.u8(bank, p + 2)
        count = (ctrl & 0x3F) or 0x100
        p += 3 + (1 if (ctrl >> 6) in (1, 3) else count)
    return list(rom.rd(bank, addr, p - addr + 1))


def stage_clear_tiles(rom):
    """loc_00_350F's 23 blocks, concatenated in $C70F order.

    $3520-$3526 reads a LITTLE-endian pointer out of 6:$611C indexed by
    $C70F * 2 -- unlike the VRAM scripts, whose destinations are big-endian --
    and copies $20 bytes from it.  Block n lands at $8800 + n * $20, so the
    concatenation in table order IS the VRAM image.
    """
    bank, base = T_STAGECLEAR_PTRS
    out = []
    for i in range(T_STAGECLEAR_BLOCKS):
        lo, hi = rom.rd(bank, base + i * 2, 2)
        out += list(rom.rd(bank, lo | (hi << 8), T_STAGECLEAR_BLOCK_N))
    return out


def resource_blob(rom, idx):
    """sub_00_0B15's payload for one resource id -> {dest, bytes}.

    The header at the table pointer is {dest16, len16} and the data follows it
    inline ($0B2D-$0B35), so this is the same read the cartridge does.
    """
    got = load_resource(rom, None, idx)
    if got is None:
        raise SystemExit(f'resource ${idx:02X} is the $FFFF hole in 0:$0B43')
    bank, src, dest, length = got
    if not 0x8000 <= dest < 0xA000:
        raise SystemExit(f'resource ${idx:02X} lands at ${dest:04X}, not VRAM')
    return {'dest': dest, 'bytes': base64.b64encode(
        bytes(rom.rd(bank, src + 4, length))).decode('ascii')}


def intro_level_script(rom, level):
    """$3404's per-level record: 3:$7BF9[level-1] -> {len, script[len]}.

    Read by LENGTH, never walked to a terminator. The four BOSS levels' records
    genuinely have no $00 at the end -- loc_00_343A appends 0:$3485 over exactly
    that gap -- so a terminator walk runs off into the next record's data.
    """
    bank, base = T_INTRO_LEVEL_PTRS
    p = rom.u16(bank, base + (level - 1) * 2)
    n = rom.u8(bank, p)
    return list(rom.rd(bank, p + 1, n))


def ending_credit_scripts(rom):
    """$37C7's per-line record: 7:$7BFC[$C712] -> {len, script[len]}.

    Read by LENGTH like the stage-intro's, not walked to a terminator -- though
    unlike the intro's these all happen to carry their own $00. $3840's `CP $0D`
    is the loop bound, so entry $0D is not a pointer and must not be read: the
    word there is $9821, which is a tilemap address, not ROM.
    """
    bank, base = T_END_CREDIT_PTRS
    table = rom.u16(bank, base)
    n = rom.u8(*T_END_CREDIT_COUNT)
    out = []
    for i in range(n):
        p = rom.u16(T_END_CREDIT_BANK, table + i * 2)
        ln = rom.u8(T_END_CREDIT_BANK, p)
        out.append(list(rom.rd(T_END_CREDIT_BANK, p + 1, ln)))
    return out


def export_metasprites(rom, loc, count):
    """Each pointer -> N x 4-B OAM records {dy, dx, tile, attr}, $FF-terminated.

    Draw routine: sub_00_0BC6 / sub_00_0BAF (master ref §7.3).
    """
    bank, base = loc
    out = []
    for i in range(count):
        p = rom.u16(bank, base + i * 2)
        recs = []
        a = p
        # A malformed pointer would run away; 64 records is far above the real
        # maximum (the biggest shipped metasprite is 16).
        for _ in range(64):
            dy = rom.u8(bank, a)
            if dy == 0xFF:
                break
            recs.append([s8(dy), s8(rom.u8(bank, a + 1)),
                         rom.u8(bank, a + 2), rom.u8(bank, a + 3)])
            a += 4
        out.append({'addr': p, 'sprites': recs})
    return out


def export_player_anims(rom):
    """2:$4D8C -> 31 anims x 3 columns x 4 tiles.

    Each frame the game streams ONE column (4 tiles = 64 B) into OBJ tiles
    col*4 .. col*4+3, so a full repaint takes 3 frames (master ref §7.4).
    Pointers are resolved to offsets inside player.tiles.bin.
    """
    bank, base = T_PLAYER_ANIM
    pool_start = rom.off(*T_PLAYER_TILES)
    pool_end = rom.off(*PLAYER_TILES_END)
    anims = []
    for i in range(PLAYER_ANIM_COUNT):
        cols = []
        for c in range(3):
            tiles = []
            for t in range(4):
                p = rom.u16(bank, base + i * 24 + c * 8 + t * 2)
                off = rom.off(bank, p) - pool_start
                tiles.append(off)
            cols.append(tiles)
        anims.append(cols)
    return anims, pool_start, pool_end


def main():
    rom = Rom()
    os.makedirs(os.path.join(OUT, 'levels'), exist_ok=True)

    manifest = {
        'title': 'BATMAN ROJ',
        'note': 'Generated by tools/export_assets.py - do not edit by hand.',
        'levelCount': NUM_LEVELS,
        'levels': [],
    }

    # ---- per-level data ---------------------------------------------------
    for lvl in range(1, NUM_LEVELS + 1):
        width, ids = level_map(rom, lvl)
        lut = level_collision_lut(rom, lvl)

        # Replay sub_00_0C34: 2 bytes per cell into the $D000 image.
        cells = bytearray()
        for mid in ids:
            cells.append(mid)
            cells.append(lut[mid])
        apply_water_patches(cells, lvl)
        with open(os.path.join(OUT, 'levels', f'{lvl:02d}.map.bin'), 'wb') as f:
            f.write(cells)

        vram = build_level_vram(rom, lvl)
        with open(os.path.join(OUT, 'levels', f'{lvl:02d}.vram.bin'), 'wb') as f:
            f.write(vram.mem)

        mt = level_metatiles(rom, lvl)
        sx = rom.u8(1, T_PLAYER_START[1] + (lvl - 1) * 2)
        sy = rom.u8(1, T_PLAYER_START[1] + (lvl - 1) * 2 + 1)

        esrc = rom.u16(5, T_ENEMY_SPAWNS[1] + (lvl - 1) * 3)
        ecnt = rom.u8(5, T_ENEMY_SPAWNS[1] + (lvl - 1) * 3 + 2)
        osrc = rom.u16(5, T_OBJECT_SPAWNS[1] + (lvl - 1) * 3)
        ocnt = rom.u8(5, T_OBJECT_SPAWNS[1] + (lvl - 1) * 3 + 2)

        manifest['levels'].append({
            'level': lvl,
            'width': width,              # in metatiles; height is always 16
            'height': 16,
            'metatiles': [list(m) for m in mt],   # (TL, BL, TR, BR) column-major
            'startX': sx, 'startY': sy,           # metatile coords
            'cameraClamp': rom.u8(0, T_CAMERA_CLAMP[1] + lvl - 1),
            'subtype': rom.u8(0, T_LEVEL_SUBTYPE[1] + lvl - 1),
            'musicFresh': rom.u8(0, T_MUSIC_FRESH[1] + lvl - 1),
            'musicReentry': rom.u8(0, T_MUSIC_REENTRY[1] + lvl - 1),
            'exitRight': rom.u8(0, T_LEVEL_EXITS[1] + (lvl - 1) * 2),
            'exitTop': rom.u8(0, T_LEVEL_EXITS[1] + (lvl - 1) * 2 + 1),
            'resources': level_resource_indices(rom, lvl),
            'enemySpawns': {'src': esrc, 'count': ecnt,
                            'records': base64.b64encode(
                                rom.rd(5, esrc, ecnt * 32)).decode()},
            'objectSpawns': {'src': osrc, 'count': ocnt,
                             'records': base64.b64encode(
                                 rom.rd(5, osrc, ocnt * 16)).decode()},
        })

    # ---- player animation -------------------------------------------------
    anims, pool_start, pool_end = export_player_anims(rom)
    with open(os.path.join(OUT, 'player.tiles.bin'), 'wb') as f:
        f.write(rom.data[pool_start:pool_end])
    manifest['player'] = {
        'anims': anims,                      # [31][3 columns][4 tile offsets]
        'tilePoolBytes': pool_end - pool_start,
        'hitboxes': [read_table(rom, T_HITBOX, PLAYER_ANIM_COUNT * 2)[i * 2:i * 2 + 2]
                     for i in range(PLAYER_ANIM_COUNT)],
        'objTileBase': 0x00,                 # player occupies OBJ tiles $00-$0B
    }

    # ---- metasprites ------------------------------------------------------
    manifest['metasprites'] = {
        'table1': export_metasprites(rom, T_METASPRITE_1, MS1_COUNT),
        'table2': export_metasprites(rom, T_METASPRITE_2, MS2_COUNT),
    }

    # ---- misc code-adjacent tables ---------------------------------------
    manifest['tables'] = {
        'sine': [s8(v) for v in read_table(rom, T_SINE, 32)],
        'slopeY': read_table(rom, T_SLOPE_Y, T_SLOPE_Y_END[1] - T_SLOPE_Y[1]),
        'slopeX': read_table(rom, T_SLOPE_X, T_SLOPE_X_END[1] - T_SLOPE_X[1]),
        'hudBar2': read_table(rom, T_HUD_BAR2, 10),   # $100C-$1015
        'batarangAnim': read_table(rom, T_BATARANG_ANIM, 8),
        # Scripted door/exit moves. Pointers are absolute; the loader below
        # rebases them onto scriptData, whose index 0 is $27E6.
        'scriptPtrs': [rom.u16(0, T_SCRIPT_PTRS[1] + i * 2) - 0x27E6
                       for i in range(3)],
        'scriptData': read_table(rom, T_SCRIPT_BLOCK, T_SCRIPT_BLOCK_N),
        'scriptSteps': read_table(rom, T_SCRIPT_STEPS, 3),
        'objectScripts': read_table(rom, T_OBJ_SCRIPTS, T_OBJ_SCRIPTS_N),
        'respawnEnemies': [read_table(rom, loc, 32) for loc in T_RESPAWN_ENEMIES],
        # sub_00_2CBE's per-level subsystems -- see src/conveyor.js.
        'subsysObjects': {
            'level7': [read_table(rom, loc, 16) for loc in T_SUBSYS_OBJ_L7],
            'level13': read_table(rom, T_SUBSYS_OBJ_L13, 16),
        },
        'collapseCells': read_table(rom, T_COLLAPSE_CELLS, T_COLLAPSE_CELLS_N),
        'rescueEntryY': read_table(rom, T_RESCUE_ENTRY_Y, 4),
        'objectMetasprites': read_table(rom, T_OBJ_METASPRITES,
                                        T_OBJ_METASPRITES_N),
        'optionsCursorY': read_table(rom, T_OPT_CURSOR_Y, 3),
        # Indexed BY DIFFICULTY, which is NOT address order: sub_00_39E4
        # dispatches $C756 == 1 -> $7C5F (NORMAL), == 2 -> $7C73 (HARD), and
        # anything else -> $7C69 (EASY). Exporting them in address order gives
        # NORMAL, EASY, HARD and silently swaps the first two.
        'optionsDifficulty': [read_table(rom, (1, a), 10)
                              for a in (0x7C69, 0x7C5F, 0x7C73)],
        'attackAnim': read_table(rom, T_ATTACK_ANIM, T_ATTACK_ANIM_N),
        'attackMsIndex': read_table(rom, T_ATTACK_MSINDEX, T_ATTACK_MSINDEX_N),
        'ropeLinks': read_table(rom, T_ROPE_LINKS, T_ROPE_LINKS_N),
        'ropeHooks': read_table(rom, T_ROPE_HOOKS, T_ROPE_HOOKS_N),
        'continueScript': vram_script(rom, T_CONTINUE_SCRIPT),
        'enemyAnim': read_table(rom, T_ENEMY_ANIM, T_ENEMY_ANIM_N),
        'enemyAnimBase': T_ENEMY_ANIM[1],
        'introPath': read_table(rom, T_INTRO_PATH, T_INTRO_N),
        'introPoses': read_table(rom, T_INTRO_POSES, T_INTRO_N),
        'projectileTemplates': [read_table(rom, (1, T_PROJECTILES[1] + i * 32), 32)
                                for i in range(T_PROJECTILES_N)],
        'gapTable': read_table(rom, T_GAP_TABLE, T_GAP_TABLE_N),
        'gapLeaps': read_gap_leaps(rom, T_GAP_LEAPS, T_GAP_LEAPS_N),
        'enemyContactDamage': read_table(rom, T_ENEMY_DMG, 13),
        'levelDamageBonus': read_table(rom, T_LEVEL_DMG_BONUS, 14),
        # --- door/gate sequencer + the $C693 effect pool (src/doors.js) ----
        'doorSteps': read_table(rom, T_DOOR_STEPS, 8),
        'doorDebrisVel': read_table(rom, T_DOOR_DEBRIS_VEL,
                                    T_DOOR_DEBRIS_VEL_N),
        'doorSpritesL3': read_table(rom, T_DOOR_SPRITES_L3, 4),
        'doorSprites': read_table(rom, T_DOOR_SPRITES, 8),
        'effectSprites': read_effect_sprites(rom, T_EFFECT_SPRITES,
                                             T_EFFECT_SPRITES_N),
        # --- the two death sequences (src/effects.js) ----------------------
        'deathBurstSprites': read_table(rom, T_BURST_SPRITES, 8),
        'deathBurstInit': read_table(rom, T_BURST_INIT, 8 * 5),
        'deathBurstPath': read_table(rom, T_BURST_PATH, T_BURST_PATH_N),
        'bossExplosionOffsets': read_table(rom, T_BOSS_EXPLOSIONS, 16),
        'bossDeathPose1': read_table(rom, T_BOSS_POSE_1, 16),
        'bossDeathPose2': read_table(rom, T_BOSS_POSE_2, 16),
        'bossDeathPoseWalk': read_table(rom, T_BOSS_POSE_WALK, 2),
        'bossDeathPoseB4': read_table(rom, T_BOSS_POSE_B4, 2),
        # STAGE CLEAR. These ride in `tables` rather than in a section of their
        # own because src/level.js does `state.tables = manifest.tables`, so
        # effects.js can reach them with no new wiring -- and effects.js's
        # need() turns a missing one into a throw rather than a blank screen.
        'stageClearTiles': stage_clear_tiles(rom),
        'stageClearScriptA': vram_script(rom, T_STAGECLEAR_SCRIPTS[0]),
        'stageClearScriptB': vram_script(rom, T_STAGECLEAR_SCRIPTS[1]),
        'fadePalettes': read_table(rom, T_FADE_PALETTES, T_FADE_PALETTES_N),
    }

    # ---- round select: applied over the title's VRAM ---------------------
    manifest['roundSelect'] = {
        'fill': T_ROUNDSEL_FILL,
        'tiles': [{'dest': dest, 'bytes': base64.b64encode(
            bytes(read_table(rom, loc, n))).decode('ascii')}
            for loc, n, dest in T_ROUNDSEL_TILES],
        'scripts': [base64.b64encode(
            bytes(vram_script(rom, T_ROUNDSEL_SCRIPT))).decode('ascii')],
    }

    # ---- the stage-intro card (sub_00_333F), src/stageintro.js ------------
    # Built ON TOP of whatever screen came before, exactly like round select:
    # sub_00_333F is the FIRST thing loc_00_04BB does, so nothing has cleared
    # the tile area. Resource $02 is the same 6:$54B4 font blob the title and
    # round select both copy, which is why $8800-$8C7F comes out unchanged.
    manifest['stageIntro'] = {
        'fill': rom.u8(*T_INTRO_FILL),
        'tiles': [resource_blob(rom, rom.u8(*loc)) for loc in T_INTRO_RES_IDS],
        'resources': [rom.u8(*loc) for loc in T_INTRO_RES_IDS],
        'scripts': [base64.b64encode(bytes(read_table(
            rom, loc, T_INTRO_SCRIPT_N))).decode('ascii')
            for loc in T_INTRO_SCRIPTS],
        'levelScripts': {
            str(l): base64.b64encode(
                bytes(intro_level_script(rom, l))).decode('ascii')
            for l in range(1, NUM_LEVELS + 1)},
        'bossScript': base64.b64encode(bytes(read_table(
            rom, T_INTRO_BOSS_SCRIPT, T_INTRO_BOSS_SCRIPT_N))).decode('ascii'),
        'blankFrames': rom.u8(*T_INTRO_BLANK),      # $3C
        'holdFrames': rom.u8(*T_INTRO_HOLD),        # $B4
        'lcdc': rom.u8(*T_INTRO_LCDC),              # $E7
        'sprite': {'id': rom.u8(*T_INTRO_SPRITE_ID),
                   'x': rom.u8(*T_INTRO_SPRITE_C),
                   'y': rom.u8(*T_INTRO_SPRITE_B)},
        'sound': {'id': rom.u8(*T_INTRO_SOUND_B),
                  'mask': rom.u8(*T_INTRO_SOUND_C)},
    }

    # ---- the ENDING (loc_00_3652), src/ending.js -------------------------
    # Built on top of the STAGE CLEAR screen level 14 leaves behind, exactly
    # like the stage-intro card is built on round select's. The four resources
    # are the ONLY tile loads in the whole 4137-frame sequence; every screen
    # after the first re-fills the BG map and repaints it with a script, and
    # nothing touches $8000-$97FF again.
    _b64 = lambda bs: base64.b64encode(bytes(bs)).decode('ascii')
    manifest['ending'] = {
        'fill': rom.u8(*T_END_FILL),                 # $7E
        'fill4': rom.u8(*T_END_FILL4),               # $6E, the credits screen
        'lcdc': rom.u8(*T_END_LCDC),                 # $E7
        'resources': [rom.u8(*loc) for loc in T_END_RES_IDS],
        'tiles': [resource_blob(rom, rom.u8(*loc)) for loc in T_END_RES_IDS],
        'pictures': [_b64(vram_script(rom, (T_END_PIC_BANK, rom.u16(*loc))))
                     for loc in T_END_PIC_PTRS],
        'theEnd': _b64(vram_script(
            rom, (T_END_TEXT_BANK, rom.u16(*T_END_THEEND_PTR)))),
        'boxOn': [_b64(read_table(rom, (T_END_TEXT_BANK, rom.u16(*loc)),
                                  rom.u8(*T_END_BOX_N)))
                  for loc in T_END_BOX_ON_PTRS],
        'boxOff': [_b64(read_table(rom, (T_END_TEXT_BANK, rom.u16(*loc)),
                                   rom.u8(*T_END_BOX_N)))
                   for loc in T_END_BOX_OFF_PTRS],
        'credits': [_b64(s) for s in ending_credit_scripts(rom)],
        'blackBgp': rom.u8(*T_END_BLACK_BGP),        # $FF
        'ramp': read_table(rom, T_END_RAMP, T_END_RAMP_N),   # FF AB 5B 1B
        'rampFrames': rom.u8(*T_END_RAMP_FRAMES),    # $21, the same 33 as $0A7F
        'blankFrames': rom.u8(*T_END_BLANK_FRAMES),  # $B4
        'holdFrames': rom.u8(*T_END_HOLD_C) | (rom.u8(*T_END_HOLD_B) << 8),
        'crawlFirstWait': rom.u8(*T_END_CRAWL_FIRST),   # $3C
        'crawlWait': rom.u8(*T_END_CRAWL_WAIT),         # $20
        'textHold': rom.u8(*T_END_TEXT_HOLD),           # $80
        'crawlCount': rom.u8(*T_END_CREDIT_COUNT),      # $0D
        'tailFrames': rom.u8(*T_END_TAIL_FRAMES),       # $78
        'endFrames': rom.u8(*T_END_END_FRAMES),         # $68
        'fades': [rom.u8(*loc) for loc in T_END_FADES],
        'sprite': {'id': rom.u8(*T_END_SPRITE_ID),
                   'x': rom.u8(*T_END_SPRITE_C),
                   'y': rom.u8(*T_END_SPRITE_B)},
        'sound': {'id': rom.u8(*T_END_SOUND_B),
                  'mask': rom.u8(*T_END_SOUND_C)},
    }

    # ---- the window tilemap, and the animated-tile streamer ---------------
    b64 = lambda bs: base64.b64encode(bytes(bs)).decode('ascii')
    manifest['window'] = {
        'boot': 0x2F,                              # $0223, what nothing rewrites
        'fill': T_WINDOW_FILL,
        'fillDest': T_WINDOW_FILL_DEST,
        'fillLen': T_WINDOW_FILL_LEN,
        'script': b64(vram_script(rom, T_WINDOW_SCRIPT)),
        'level14': {
            'fill': T_WINDOW_FILL,
            'fillDest': T_WINDOW_L14_FILL_DEST,
            'fillLen': T_WINDOW_L14_FILL_LEN,
            'script': b64(vram_script(rom, T_WINDOW_L14_SCRIPT)),
        },
    }
    # ---- static BG art the column streamer never touches ------------------
    # See T_BG_ART.  Levels 9/$0A/$0B get the skyline into tilemap rows 0-7,
    # level 6 the track band into rows 19-27.  Shipped as script bytes so the
    # port decodes them through its own sub_00_0A0E.
    manifest['bgArt'] = [
        {'levels': e['levels'], 'rom': e['rom'],
         'script': b64(vram_script(rom, e['loc']))}
        for e in T_BG_ART
    ]

    # loc_00_3127, resolved per level.  '6alt' is the 2:$625E source table the
    # $3151 arm picks when $FFC9 == 1; on level 6 $FFC9 == 0 disables the
    # streamer outright ($314B), which is why the key can be absent.
    manifest['tileAnim'] = {
        str(k): {'dests': v['dests'], 'steps': v['steps'],
                 'blocks': [b64(b) for b in v['blocks']]}
        for k, v in animtables.resolve_all(rom).items()
    }

    # ---- title screen: the ingredients, not a snapshot of the result ------
    manifest['title'] = {
        'tiles': [{'dest': dest, 'bytes': base64.b64encode(
            bytes(read_table(rom, loc, n))).decode('ascii')}
            for loc, n, dest in T_TITLE_TILES],
        'scripts': [base64.b64encode(bytes(vram_script(rom, loc))).decode('ascii')
                    for loc in T_TITLE_SCRIPTS],
        'fill': 0x2F,                 # 00:027D, LD D,$2F -> sub_00_34A4
        # What used to be assets/title.json, derived instead of captured.
        'lcd': {
            'lcdc': rom.u8(*T_TITLE_LCDC),
            'scx': 0x00,              # $0160's HRAM clear; nothing rewrites $FFA9
            'scy': 0x00,              # $021D XOR A -> $FFAA
            'wx': rom.u8(*T_TITLE_WX),
            'wy': rom.u8(*T_TITLE_WY),
            # $02C1: LD C,$80 -> sub_00_0A7F, a fade IN, so $C70E ends at 0.
            'bgp': rom.u8(T_FADE_BGP[0], T_FADE_BGP[1]),
            'obp0': rom.u8(T_FADE_BGP[0], T_FADE_BGP[1]),
            'obp1': rom.u8(T_FADE_OBP1[0], T_FADE_OBP1[1]),
        },
        # The whole ramp, so the fade can be played rather than jumped.
        'fadeBgp': read_table(rom, T_FADE_BGP, 8),
        'fadeObp1': read_table(rom, T_FADE_OBP1, 4),
        # loc_00_031B's eraser. Its counterpart is scripts[2], unchanged.
        'flashOff': base64.b64encode(
            bytes(vram_script(rom, T_TITLE_FLASH_OFF))).decode('ascii'),
    }

    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, separators=(',', ':'))

    # ---- report -----------------------------------------------------------
    total = 0
    for dirpath, _, names in os.walk(OUT):
        for n in names:
            total += os.path.getsize(os.path.join(dirpath, n))
    print(f'assets/ written: {total/1024:.0f} KB')
    for l in manifest['levels']:
        print(f"  level {l['level']:2d}  w={l['width']:3d}  "
              f"metatiles={len(l['metatiles']):3d}  "
              f"start=({l['startX']},{l['startY']})  "
              f"enemies={l['enemySpawns']['count']}  "
              f"objects={l['objectSpawns']['count']}")
    print(f"  player: {len(anims)} anims, {pool_end-pool_start} B tile pool")
    print(f"  metasprites: {MS1_COUNT} + {MS2_COUNT}")


if __name__ == '__main__':
    main()
