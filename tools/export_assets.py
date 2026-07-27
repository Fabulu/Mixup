#!/usr/bin/env python3
"""Export every ROM asset the JavaScript port needs into `assets/`.

Nothing here is guesswork: each extraction replays the routine the game itself
uses, cited by address.  See docs/00-MASTER-REFERENCE.md.

Outputs
    assets/manifest.json        all small tables (levels, anims, metasprites...)
    assets/levels/NN.map.bin    2 B/cell {metatileId, collision}, column-major
    assets/levels/NN.vram.bin   8192 B VRAM image after the level's resource loads
    assets/player.tiles.bin     player animation tile pool (bank 2)

Usage:  python tools/export_assets.py
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbrom import (Rom, ROOT, build_level_vram, level_map, level_collision_lut,
                   level_metatiles, level_resource_indices, NUM_LEVELS)

OUT = os.path.join(ROOT, 'assets')

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
        'enemyContactDamage': read_table(rom, T_ENEMY_DMG, 13),
        'levelDamageBonus': read_table(rom, T_LEVEL_DMG_BONUS, 14),
    }

    # ---- title screen: the ingredients, not a snapshot of the result ------
    manifest['title'] = {
        'tiles': [{'dest': dest, 'bytes': base64.b64encode(
            bytes(read_table(rom, loc, n))).decode('ascii')}
            for loc, n, dest in T_TITLE_TILES],
        'scripts': [base64.b64encode(bytes(vram_script(rom, loc))).decode('ascii')
                    for loc in T_TITLE_SCRIPTS],
        'fill': 0x2F,                 # 00:027D, LD D,$2F -> sub_00_34A4
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
