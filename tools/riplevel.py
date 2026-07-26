#!/usr/bin/env python3
"""Rip Batman - Return of the Joker level maps to PNG + text.

    python tools/riplevel.py            # all 14 levels -> rip/
    python tools/riplevel.py 1 5        # only levels 1 and 5
    python tools/riplevel.py --txt 1    # also dump metatile / collision text

Format (see docs/recon-3-graphics.md):
  3:$4000  16 x LE ptr, indexed by level-1  -> [width][width*16 metatile bytes]
           column-major, 16 rows per column (level is always 256 px tall)
  5:$4000  4 bytes/level {len, src}         -> len/4 metatile defs {TL,BL,TR,BR}
  3:$7A2A  14 x LE ptr                      -> metatile id -> collision byte
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbrom import (Rom, ROOT, decode_tile, write_png, build_level_vram,
                   level_map, level_metatiles, level_collision_lut,
                   NUM_LEVELS, bgp_map, DMG)

# Collision-byte classes, from sub_00_20BA's callers (see docs §3).
COLL_NAME = {
    0x00: 'air', 0x01: 'solid', 0x02: 'conveyor-R', 0x03: 'conveyor-L',
    0x04: 'kill/exit', 0x05: 'trigger5', 0x06: 'breakable', 0x07: 'solid7',
    0x08: 'water', 0x09: 'ledge', 0x20: 'pickup:energy', 0x21: 'pickup:ammo',
    0x22: 'pickup:maxHP', 0xFD: 'spike', 0xFF: 'solid',
}
# overlay colours (r,g,b) for the collision debug PNG
COLL_RGB = {
    'air': None, 'solid': (200, 40, 40), 'conveyor-R': (40, 200, 40),
    'conveyor-L': (40, 140, 40), 'kill/exit': (255, 0, 255),
    'trigger5': (255, 160, 0), 'breakable': (180, 100, 40), 'solid7': (200, 40, 40),
    'water': (40, 80, 255), 'ledge': (255, 255, 0), 'spike': (255, 0, 0),
    'pickup:energy': (0, 255, 255), 'pickup:ammo': (0, 255, 255),
    'pickup:maxHP': (0, 255, 255), 'door': (255, 255, 255), 'solid?': (150, 30, 30),
}


def classify(v):
    if v in COLL_NAME:
        return COLL_NAME[v]
    if (v & 0x1F) == 0x1F:
        return 'door'          # top 3 bits = owning $C1E8 actor slot
    if v >= 0x20:
        return 'air'           # 1:$4D4E returns 0 for anything but $20/$21/$22
    return 'solid?'


def render_level(rom, level, outdir, want_txt=False):
    w, cells = level_map(rom, level)
    mts = level_metatiles(rom, level)
    coll = level_collision_lut(rom, level)
    vram = build_level_vram(rom, level)

    px_w, px_h = w * 16, 256
    img = bytearray(px_w * px_h)
    ovr = bytearray(px_w * px_h)          # 0 = none, else index into ov_pal

    ov_names = [n for n in dict.fromkeys(COLL_RGB) if COLL_RGB[n]]
    ov_index = {n: i + 4 for i, n in enumerate(ov_names)}
    ov_pal = list(DMG) + [COLL_RGB[n] for n in ov_names]

    # tile cache
    cache = {}

    def tile(tid):
        if tid not in cache:
            cache[tid] = decode_tile(vram.tile_bg(tid))
        return cache[tid]

    shade = bgp_map(0xE4)                 # $FFAD is set to $E4 at level start
    for col in range(w):
        for row in range(16):
            mt = cells[col * 16 + row]
            defn = mts[mt] if mt < len(mts) else (0x2F, 0x2F, 0x2F, 0x2F)
            tl, bl, tr, br = defn
            for sub, tid in ((0, tl), (1, bl), (2, tr), (3, br)):
                tx = col * 16 + (8 if sub >= 2 else 0)
                ty = row * 16 + (8 if sub in (1, 3) else 0)
                rows = tile(tid)
                for y in range(8):
                    base = (ty + y) * px_w + tx
                    r = rows[y]
                    for x in range(8):
                        img[base + x] = shade[r[x]]
            cname = classify(coll[mt] if mt < len(coll) else 0)
            if COLL_RGB.get(cname):
                idx = ov_index[cname]
                for y in range(16):
                    base = (row * 16 + y) * px_w + col * 16
                    for x in range(16):
                        ovr[base + x] = idx

    os.makedirs(outdir, exist_ok=True)
    p1 = write_png(os.path.join(outdir, 'level%02d.png' % level), px_w, px_h, img)

    # collision overlay: draw the map, then stamp a 4px corner marker per metatile
    comb = bytearray(img)
    for i, v in enumerate(ovr):
        if v:
            y, x = divmod(i, px_w)
            if (y % 16) < 4 and (x % 16) < 4:
                comb[i] = v
    p2 = write_png(os.path.join(outdir, 'level%02d_coll.png' % level),
                   px_w, px_h, comb, ov_pal)

    if want_txt:
        with open(os.path.join(outdir, 'level%02d.txt' % level), 'w') as f:
            f.write('level %d  width=%d metatiles (%d px)  height=16 (256 px)\n'
                    % (level, w, w * 16))
            f.write('\n-- metatile defs (id: TL BL TR BR  coll  class) --\n')
            for i, d in enumerate(mts):
                c = coll[i] if i < len(coll) else 0
                f.write('%3d $%02X: %02X %02X %02X %02X   $%02X %s\n'
                        % (i, i, d[0], d[1], d[2], d[3], c, classify(c)))
            f.write('\n-- map (rows top..bottom, columns left..right) --\n')
            for row in range(16):
                f.write(''.join('%02X' % cells[c * 16 + row] for c in range(w)) + '\n')
    print('level %2d  w=%3d mt=%3d -> %s' % (level, w, len(mts), os.path.basename(p1)))
    return p1, p2


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    want_txt = '--txt' in sys.argv
    rom = Rom()
    outdir = os.path.join(ROOT, 'rip', 'levels')
    levels = [int(a) for a in args] or list(range(1, NUM_LEVELS + 1))
    for lv in levels:
        render_level(rom, lv, outdir, want_txt)


if __name__ == '__main__':
    main()
