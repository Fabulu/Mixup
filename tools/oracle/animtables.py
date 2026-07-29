#!/usr/bin/env python3
"""Resolve loc_00_3127's per-level animated-tile tables straight out of the ROM.

Shared by tools/export_assets.py (which ships the result) and by this
directory's cross-checks (which hold it against what the cartridge staged).

  0:$31EE  word per level -> destination table, $FFFF = this level has none
  0:$3246  word per level -> the $C711 group index per step
  0:$3295  byte per level -> how many steps ($C70F wraps here)
  2:$61A4  word per level -> source-pointer table, high byte $FF = none
  2:$625E                 -> level 6's alternate source table, used when
                             $FFC9 == 1 ($3148-$3154).  $FFC9 == 0 disables
                             animation entirely on that level.

Per frame ($3174-$31B4):
  src  = word[srcTable  + $C70F*4 + $C710*2]     -> 32 bytes staged at $C5CB
  dest = word[destTable + $C710*2 + $C711*4]
and $C711 = stepTable[$C70F] whenever $C710 wraps past 1.
"""
DEST_TABLE = (0, 0x31EE)
STEP_TABLE = (0, 0x3246)
STEP_COUNT = (0, 0x3295)
SRC_TABLE = (2, 0x61A4)
SRC_TABLE_L6_ALT = (2, 0x625E)
NUM_LEVELS = 14


def resolve(rom, level, src_base=None):
    """{'dests': [...], 'steps': [...], 'blocks': [bytes x 2*steps]} or None."""
    dest_ptr = rom.u16(DEST_TABLE[0], DEST_TABLE[1] + (level - 1) * 2)
    if dest_ptr >> 8 == 0xFF:                      # $3164: CP $FF on H
        return None
    src_ptr = src_base if src_base is not None else \
        rom.u16(SRC_TABLE[0], SRC_TABLE[1] + (level - 1) * 2)
    if src_ptr >> 8 == 0xFF:
        return None
    steps_ptr = rom.u16(STEP_TABLE[0], STEP_TABLE[1] + (level - 1) * 2)
    n = rom.u8(STEP_COUNT[0], STEP_COUNT[1] + (level - 1))

    steps = [rom.u8(STEP_TABLE[0], steps_ptr + i) for i in range(n)]
    groups = max(steps) + 1
    dests = [rom.u16(DEST_TABLE[0], dest_ptr + i * 2) for i in range(groups * 2)]
    blocks = []
    for i in range(n * 2):
        p = rom.u16(SRC_TABLE[0], src_ptr + i * 2)
        blocks.append(bytes(rom.rd(SRC_TABLE[0], p, 32)))
    return {'dests': dests, 'steps': steps, 'blocks': blocks,
            'destPtr': dest_ptr, 'srcPtr': src_ptr, 'stepPtr': steps_ptr}


def resolve_all(rom):
    """Every level's entry, plus level 6's $FFC9 == 1 alternate."""
    out = {}
    for lvl in range(1, NUM_LEVELS + 1):
        r = resolve(rom, lvl)
        if r:
            out[lvl] = r
    alt = resolve(rom, 6, src_base=SRC_TABLE_L6_ALT[1])
    if alt:
        out['6alt'] = alt
    return out
