#!/usr/bin/env python3
"""Rip Batman - Return of the Joker tile graphics and metasprites to PNG.

    python tools/ripgfx.py sheets      # every 0:$0B15 resource -> rip/tiles/
    python tools/ripgfx.py player      # bank-2 player animation tiles
    python tools/ripgfx.py sprites     # metasprite tables 5:$5F5C / 5:$736B
    python tools/ripgfx.py map         # print the ROM tile-block map
    python tools/ripgfx.py all

All tile data in this ROM is RAW 2bpp - there is no decompressor anywhere
(sub_00_0B15 -> sub_00_09FB is a plain memcpy).  See docs/recon-3-graphics.md.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbrom import (Rom, ROOT, decode_tile, write_png, bgp_map, Vram,
                   load_resource, build_level_vram, level_resource_indices,
                   RESOURCE_COUNT, NUM_LEVELS)

OUT = os.path.join(ROOT, 'rip')

# ------------------------------------------------------------------ helpers


def sheet(tiles, cols=16, shade=None):
    """tiles: list of 16-byte blobs -> (w, h, pixels)."""
    shade = shade or bgp_map(0xE4)
    rows = (len(tiles) + cols - 1) // cols
    w, h = cols * 8, rows * 8
    px = bytearray(w * h)
    for i, t in enumerate(tiles):
        if len(t) < 16:
            continue
        d = decode_tile(t)
        tx, ty = (i % cols) * 8, (i // cols) * 8
        for y in range(8):
            base = (ty + y) * w + tx
            for x in range(8):
                px[base + x] = shade[d[y][x]]
    return w, h, px


def chunks16(b):
    return [b[i:i + 16] for i in range(0, len(b) - 15, 16)]


# ------------------------------------------------------------------ commands


def cmd_sheets(rom):
    d = os.path.join(OUT, 'tiles')
    print('idx bank  src   dest   len  tiles  file')
    for i in range(RESOURCE_COUNT):
        r = load_resource(rom, None, i)
        if not r:
            print('%02X  -- unused --' % i)
            continue
        bank, src, dest, ln = r
        payload = rom.rd(bank, src + 4, ln)
        w, h, px = sheet(chunks16(payload))
        name = 'res%02X_b%d_%04X_to_%04X.png' % (i, bank, src, dest)
        write_png(os.path.join(d, name), w, h, px)
        print('%02X   %d   $%04X $%04X $%04X %4d  %s'
              % (i, bank, src, dest, ln, ln // 16, name))


def cmd_player(rom):
    """Bank-2 player animation tiles: 31 anims x 3 frames x 4 tile pointers."""
    d = os.path.join(OUT, 'player')
    base = 0x4D8C
    dest = [0x8000, 0x8040, 0x8080]
    for a in range(31):
        tiles = []
        for f in range(3):
            for t in range(4):
                p = rom.u16(2, base + a * 24 + f * 8 + t * 2)
                tiles.append(rom.rd(2, p, 16))
        w, h, px = sheet(tiles, cols=4)
        write_png(os.path.join(d, 'anim%02X.png' % a), w, h, px)
    print('31 player anims -> %s  (each row = one 8x8 tile column pair;'
          ' frame f loads 4 tiles to $%04X)' % (d, dest[0]))
    # one contiguous sheet of the whole bank-2 player tile blob
    blob = rom.rd(2, 0x5074, 0x6BB2 - 0x5074)
    w, h, px = sheet(chunks16(blob), cols=32)
    write_png(os.path.join(OUT, 'player_tiles_2_5074_6BB1.png'), w, h, px)


def parse_metasprite(rom, ptr, limit=64):
    recs = []
    a = ptr
    for _ in range(limit):
        b = rom.rd(5, a, 4)
        if b[0] == 0xFF:
            break
        recs.append((b[0], b[1], b[2], b[3]))
        a += 4
    return recs


def render_metasprite(recs, vram, shade=None, pad=32):
    """8x16 OBJ mode (LCDC bit2 = 1).  Returns (w,h,px) or None if empty."""
    shade = shade or bgp_map(0xE4)
    if not recs:
        return None
    sx = [((r[1] + 128) & 0xFF) - 128 for r in recs]
    sy = [((r[0] + 128) & 0xFF) - 128 for r in recs]
    x0, y0 = min(sx) - 2, min(sy) - 2
    w = max(x + 8 for x in sx) - x0 + 2
    h = max(y + 16 for y in sy) - y0 + 2
    px = bytearray([0] * (w * h))
    for (dy, dx, tile, attr), X, Y in zip(recs, sx, sy):
        xf, yf = bool(attr & 0x20), bool(attr & 0x40)
        for half in (0, 1):                      # 8x16: tile & $FE, then +1
            t = decode_tile(vram.tile_obj((tile & 0xFE) + half))
            for y in range(8):
                for x in range(8):
                    c = t[y][x]
                    if c == 0:
                        continue                 # OBJ colour 0 = transparent
                    px_x = X - x0 + (7 - x if xf else x)
                    sub = half * 8 + y
                    px_y = Y - y0 + (15 - sub if yf else sub)
                    if 0 <= px_x < w and 0 <= px_y < h:
                        px[px_y * w + px_x] = shade[c]
    return w, h, px


def cmd_sprites(rom):
    """Render both metasprite tables using level 1's VRAM as the tile source."""
    d = os.path.join(OUT, 'sprites')
    for tbl, base, n in (('t1', 0x5F5C, 243), ('t2', 0x736B, 105)):
        os.makedirs(os.path.join(d, tbl), exist_ok=True)
        for i in range(n):
            p = rom.u16(5, base + i * 2)
            recs = parse_metasprite(rom, p)
            if not recs:
                continue
            for lv in (1, 5, 9, 12):
                v = build_level_vram(rom, lv)
                r = render_metasprite(recs, v, bgp_map(0xC4))
                if r and any(r[2]):
                    write_png(os.path.join(d, tbl, '%03d_%04X_lv%d.png'
                                           % (i, p, lv)), *r)
                    break
        print('%s: %d entries at 5:$%04X -> %s' % (tbl, n, base, os.path.join(d, tbl)))


def cmd_map(rom):
    print('=== 0:$0B15 resource table (0:$0B43, 36 x {bank,ptr}) ===')
    print('idx bank src    hdr.dest hdr.len  tiles  payload span')
    for i in range(RESOURCE_COUNT):
        r = load_resource(rom, None, i)
        if not r:
            print('%02X  ---- unused ($FFFF) ----' % i)
            continue
        bank, src, dest, ln = r
        print('%02X   %d  $%04X  $%04X   $%04X  %4d   %d:$%04X-$%04X'
              % (i, bank, src, dest, ln, ln // 16, bank, src + 4, src + 3 + ln))
    print()
    print('=== per-level resource lists (1:$7C7D, 8 bytes, $FF-terminated) ===')
    for lv in range(1, NUM_LEVELS + 1):
        idxs = level_resource_indices(rom, lv)
        print('lv %2d: %s' % (lv, ' '.join('%02X' % x for x in idxs)))
    print()
    print('=== other raw tile blobs ===')
    print('2:$5074-$6BB1  player animation tiles (435 x 16B), streamed by 00:$2C13')
    print('               anim table 2:$4D8C, 31 x 24B = 3 frames x 4 LE tile ptrs')
    print('               dest table 0:$32D2 = $8000/$8040/$8080')
    print('2:$61A4        per-level BG-animation source ptr table (14 x LE)')
    print('0:$31EE        per-level BG-animation VRAM dest ptr table (14 x LE)')


def main():
    rom = Rom()
    cmds = sys.argv[1:] or ['map']
    if 'all' in cmds:
        cmds = ['map', 'sheets', 'player', 'sprites']
    for c in cmds:
        {'sheets': cmd_sheets, 'player': cmd_player,
         'sprites': cmd_sprites, 'map': cmd_map}[c](rom)


if __name__ == '__main__':
    main()
