#!/usr/bin/env python3
"""Render IGS023 tile sheets to PNG so a human can LOOK at them.

    python gfxsheet.py --rom <romdir> --out <ripdir> tx  --first 0 --count 1024
    python gfxsheet.py --rom <romdir> --out <ripdir> bg  --first 0 --count 256

Output is ROM-derived: point --out inside games/ddpdoj/rip/ (gitignored).
"""
import argparse, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pgmgfx import Roms, tx_tile, bg_tile, sheet, gray_pal, save_png


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["tx", "bg"])
    ap.add_argument("--rom", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--first", type=lambda s: int(s, 0), default=0)
    ap.add_argument("--count", type=int, default=1024)
    ap.add_argument("--cols", type=int, default=32)
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--gap", type=int, default=0)
    ap.add_argument("--variant", default="lo,msb",
                    help="tx only: <lo|hi>,<msb|lsb> nibble order / bit order")
    ap.add_argument("--name", default=None)
    a = ap.parse_args()

    roms = Roms(a.rom)
    if a.kind == "tx":
        nib, bits = a.variant.split(",")
        tiles = [tx_tile(roms, a.first + i, nib == "lo", bits == "msb")
                 for i in range(a.count)]
        pal = gray_pal(16)
    else:
        tiles = [bg_tile(roms, a.first + i) for i in range(a.count)]
        pal = gray_pal(32)

    img = sheet(tiles, a.cols, pal, gap=a.gap)
    if a.scale > 1:
        img = np.repeat(np.repeat(img, a.scale, 0), a.scale, 1)
    name = a.name or f"{a.kind}_{a.first:06x}_{a.count}" + \
        (f"_{a.variant.replace(',', '')}" if a.kind == "tx" else "")
    p = save_png(os.path.join(a.out, name + ".png"), img)
    print(f"{p}  {img.shape[1]}x{img.shape[0]}  tiles={len(tiles)}")


if __name__ == "__main__":
    main()
