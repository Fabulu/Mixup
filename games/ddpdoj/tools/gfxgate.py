#!/usr/bin/env python3
"""The pixel gate for the IGS023 asset decode.

For every dumped frame pair (N, N+1) present in --dump, re-render frame N's state
with our own decoder and diff it against MAME's framebuffer for frame N+1.

    python gfxgate.py --rom <romdir> --dump <dumpdir>

Exit code 1 if any frame is not bit-exact. Prints the sprite count and the number of
zoomed sprites per frame, because a green run over blank frames proves nothing
(docs/knowledge/03-checks-that-can-fail.md).
"""
from __future__ import annotations
import argparse, glob, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pgmgfx import Roms, parse_sprite_list
import framerender as FR


def eff_zoom(s, zr):
    xz, yz = s["xzom"], s["yzom"]
    if s["xgrow"]:
        xz = 0x10 - xz
    if s["ygrow"]:
        yz = 0x10 - yz
    return FR.zoom_word(zr, xz), FR.zoom_word(zr, yz)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", required=True)
    ap.add_argument("--dump", required=True)
    a = ap.parse_args()

    frames = sorted(int(re.search(r"f(\d+)\.pixels\.bin$", p).group(1))
                    for p in glob.glob(os.path.join(a.dump, "f*.pixels.bin")))
    pairs = [(n, n + 1) for n in frames if n + 1 in set(frames)]
    if not pairs:
        print("NO FRAME PAIRS in", a.dump, "- dump N and N+1 for each sample point")
        return 1

    roms = Roms(a.rom)
    ok, tot, totn = True, 0, 0
    for n, m in pairs:
        ds, dp = FR.load_dump(a.dump, n), FR.load_dump(a.dump, m)
        idx = FR.render(roms, ds)
        pal = FR.palette_rgb(dp["palette"])
        ours = pal[np.clip(idx, 0, len(pal) - 1)]
        ref = FR.mame_pixels(dp["pixels"])
        same = (ours == ref).all(axis=2)
        sp = parse_sprite_list(ds["spritebuffer"], stride=8, limit=256)
        nz = sum(1 for s in sp if eff_zoom(s, ds["zoomram"]) != (0, 0))
        tot += int(same.sum())
        totn += same.size
        good = same.all()
        ok &= bool(good)
        print(f"{'OK  ' if good else 'FAIL'} state f{n} -> pixels f{m}: "
              f"{same.sum()}/{same.size} = {100*same.sum()/same.size:8.4f}%  "
              f"sprites={len(sp):3d} zoomed={nz:2d} "
              f"bgx={ds['regs']['bg_xscroll']:#06x} bgy={ds['regs']['bg_yscroll']:#06x} "
              f"ctrl={ds['regs']['ctrl']:#06x} paldelta={int((ds['palette']!=dp['palette']).sum())}")
    print(f"{'ALL EXACT' if ok else 'FAILURES PRESENT'}: "
          f"{tot}/{totn} = {100*tot/totn:.4f}% over {len(pairs)} frame pair(s)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
