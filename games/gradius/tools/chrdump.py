#!/usr/bin/env python3
"""chrdump - dump an iNES CHR-ROM to per-bank PNG tile sheets.

NES CHR is 2bpp planar: each 8x8 tile is 16 bytes, the first 8 being bit-plane 0
(one byte per row, MSB = leftmost pixel) and the second 8 bit-plane 1.  Pixel
value = plane0.bit | (plane1.bit << 1), giving 0..3, which the PPU then looks up
in a palette.  We have not measured Gradius's palettes yet, so this renders the
four values as a fixed grey ramp and says so: 0 = black (the PPU's transparent /
backdrop index), 1..3 = increasing grey.

An 8 KB bank is 512 tiles = two 4 KB pattern tables of 256 tiles each.  The PPU
addresses them as $0000-$0FFF and $1000-$1FFF, conventionally sprites and
background (which is which depends on PPUCTRL bits 3 and 4).  We lay each 4 KB
half out as 16x16 tiles = 128x128 px and put the two halves side by side, so one
PNG per bank is 256x128 with the $0000 half on the left.

ROM-DERIVED OUTPUT.  Everything this writes is a transformation of copyrighted
cartridge data and must never be committed.

Usage:
    python chrdump.py "Gradius (USA).nes" --outdir games/gradius/rip/chr
    python chrdump.py "Gradius (USA).nes" --outdir out --scale 3 --grid
    python chrdump.py "Gradius (USA).nes" --stats
"""
import argparse
import hashlib
import os

from PIL import Image

TILE_BYTES = 16
BANK_BYTES = 0x2000
GREY = [(0, 0, 0), (85, 85, 85), (170, 170, 170), (255, 255, 255)]


def read_ines(path):
    raw = open(path, 'rb').read()
    if raw[:4] != b'NES\x1a':
        raise SystemExit('not an iNES file')
    trainer = 512 if raw[6] & 4 else 0
    prg = raw[4] * 0x4000
    chrn = raw[5] * 0x2000
    off = 16 + trainer + prg
    return raw[off:off + chrn], raw[5]


def tile_pixels(chunk):
    """16 bytes -> 8x8 list of 0..3."""
    out = []
    for y in range(8):
        lo, hi = chunk[y], chunk[y + 8]
        row = [((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1) for x in range(8)]
        out.append(row)
    return out


def sheet(chr_data, bank, scale=2, grid=False):
    """One bank -> PIL image, two 16x16-tile pattern tables side by side."""
    base = bank * BANK_BYTES
    gap = 8 if grid else 0
    w, h = 16 * 8 * 2 + gap, 16 * 8
    img = Image.new('RGB', (w, h), (255, 0, 255))
    px = img.load()
    for half in range(2):
        for t in range(256):
            off = base + half * 0x1000 + t * TILE_BYTES
            tp = tile_pixels(chr_data[off:off + TILE_BYTES])
            tx = (t % 16) * 8 + half * (128 + gap)
            ty = (t // 16) * 8
            for y in range(8):
                for x in range(8):
                    px[tx + x, ty + y] = GREY[tp[y][x]]
    if scale != 1:
        img = img.resize((w * scale, h * scale), Image.NEAREST)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rom')
    ap.add_argument('--outdir', default='rip/chr')
    ap.add_argument('--scale', type=int, default=2)
    ap.add_argument('--grid', action='store_true', help='8px gap between the two pattern tables')
    ap.add_argument('--stats', action='store_true')
    args = ap.parse_args()

    chr_data, nbanks = read_ines(args.rom)
    print(f'CHR {len(chr_data)} bytes = {nbanks} x 8 KB bank(s), '
          f'{len(chr_data)//TILE_BYTES} tiles total')

    if args.stats:
        seen = {}
        for b in range(nbanks):
            blob = chr_data[b * BANK_BYTES:(b + 1) * BANK_BYTES]
            blank = sum(1 for t in range(512)
                        if not any(blob[t * 16:(t + 1) * 16]))
            solid = sum(1 for t in range(512)
                        if all(v == 0xFF for v in blob[t * 16:(t + 1) * 16]))
            uniq = len({bytes(blob[t * 16:(t + 1) * 16]) for t in range(512)})
            print(f'  bank {b}: sha1 {hashlib.sha1(blob).hexdigest()[:16]}  '
                  f'{uniq:3d} unique tiles, {blank:3d} all-zero, {solid:3d} all-$FF')
            for t in range(512):
                key = bytes(blob[t * 16:(t + 1) * 16])
                if any(key):
                    seen.setdefault(key, []).append((b, t))
        shared = {k: v for k, v in seen.items() if len({b for b, _ in v}) > 1}
        print(f'  {len(seen)} distinct non-blank tiles across all banks; '
              f'{len(shared)} appear in more than one bank')

    os.makedirs(args.outdir, exist_ok=True)
    for b in range(nbanks):
        img = sheet(chr_data, b, args.scale, args.grid)
        p = os.path.join(args.outdir, f'chr_bank{b}.png')
        img.save(p)
        print(f'wrote {p}  {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
