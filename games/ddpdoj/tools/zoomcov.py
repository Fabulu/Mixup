#!/usr/bin/env python3
"""ZOOM COVERAGE TABLE for the IGS023 sprite decoder (wave 3 item 2).

`gfxgate.py` answers "did our decoder reproduce these frames exactly".  It does
NOT answer "did these frames exercise the zoom path at all", and on the natural
corpus the answer is: barely.  MEASURED -- breaking the zoom loop entirely
(`gfxgate.py --mutate zoom-off`) costs only 2.7 % of the pixels over the 16
gameplay pairs, because the game zooms one or two small sprites per frame.  A
gate that green-lights a decoder with a broken zoom loop 97 % of the time is not
a gate for the zoom loop.

So `pgm.py zoomcov` writes a synthetic display list into the GAME'S OWN sprite
list in main RAM at the sample point and lets the hardware DMA carry it to the
chip, and THIS reads the resulting dumps back and says which combinations
actually put pixels on the screen.  Coverage is MEASURED from the dumped
buffer, never assumed from the poke script: if the poke had silently not taken,
this table would be empty rather than green.

    python zoomcov.py --rom <romdir> --dump <dir> [--dump <dir> ...]

Combination axes, and what "axis" means here:
  z      0..15   zoom-table entry selected by the record
  grow   0/1     grow duplicates a pixel, shrink drops it.  The effective index
                 is `0x10 - z` when grow is set, so **z=0 with grow=1 is the
                 NO-ZOOM encoding** (0x10 -> zoom_word() returns 0), not a zoom.
                 That is the encoding a normal unzoomed sprite uses.
  axis   x/y/xy  which axis carries the zoom; the other gets the no-zoom encoding
  flip   0..3    bit0 = flipx, bit1 = flipy.  Flip matters to the zoom path
                 specifically, because the flipped destination is indexed from
                 realxsize/realysize, which are themselves computed by walking
                 the zoom mask.
"""
from __future__ import annotations
import argparse, glob, os, re, sys
from collections import defaultdict
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pgmgfx import Roms, parse_sprite_list
import framerender as FR

W, H = 448, 224


def eff_index(z, grow):
    return (0x10 - z) if grow else z


def zword(zoomram, eff):
    """igs023_video.cpp:689, restated: >=0x10 is no zoom, 0xf is hard-coded 1."""
    if eff >= 0x10:
        return 0
    if eff == 0xf:
        return 1
    return (int(zoomram[eff * 2]) << 16) | int(zoomram[eff * 2 + 1])


def sprite_pixel_count(roms, s, zoomram):
    """Draw this ONE sprite on an empty bitmap and count the pixels it touched.
    pgm_draw_pix sets priority bit 0 for every pixel it writes, so the bit count
    is exactly the sprite's on-screen contribution."""
    bm = np.zeros((H, W), np.uint16)
    pri = np.zeros((H, W), np.uint8)
    FR.SpriteDrawer(roms, bm, pri, W, H).draw(s, zoomram)
    return int((pri & 1).sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", required=True)
    ap.add_argument("--dump", required=True, action="append",
                    help="a dump directory; repeat to merge several runs")
    a = ap.parse_args()

    frames = []
    for dd in a.dump:
        for p in sorted(glob.glob(os.path.join(dd, "f*.pixels.bin"))):
            frames.append((dd, int(re.search(r"f(\d+)\.pixels\.bin$", p).group(1))))
    if not frames:
        print("FAIL no dumps in", a.dump)
        return 1
    roms = Roms(a.rom)

    # cell[(z, grow, axis, flip)] -> [(variant, zoomword, pixels), ...]
    cell = defaultdict(list)
    variants = {}            # zoomram signature -> (id, the 16 words)
    nsprites, nbasic, basicpx = 0, 0, 0
    for dd, f in frames:
        d = FR.load_dump(dd, f)
        zr = d["zoomram"]
        sig = zr.tobytes()
        if sig not in variants:
            variants[sig] = (len(variants),
                             [(int(zr[i * 2]) << 16) | int(zr[i * 2 + 1]) for i in range(16)])
        vid = variants[sig][0]
        for s in parse_sprite_list(d["spritebuffer"], stride=8, limit=256):
            xa = not (s["xzom"] == 0 and s["xgrow"])
            ya = not (s["yzom"] == 0 and s["ygrow"])
            if not xa and not ya:
                # zom=0 + grow=1 on BOTH axes is the NO-ZOOM encoding, which is
                # the unzoomed basic path (draw_sprite_new_basic).  It is not a
                # missing zoom combination, it is a different function -- but it
                # still has to be covered, so it is counted rather than skipped.
                nbasic += 1
                basicpx += sprite_pixel_count(roms, s, zr)
                continue
            axis = "xy" if (xa and ya) else ("x" if xa else "y")
            z = s["xzom"] if xa else s["yzom"]
            grow = int(s["xgrow"] if xa else s["ygrow"])
            if xa and ya and (s["xzom"] != s["yzom"] or s["xgrow"] != s["ygrow"]):
                axis = "xy*"                   # mixed levels: not part of the plan
            px = sprite_pixel_count(roms, s, zr)
            cell[(z, grow, axis, s["flip"])].append((vid, zword(zr, eff_index(z, grow)), px))
            nsprites += 1

    print(f"{len(frames)} dumped frames, {nsprites} zoom-path sprites, "
          f"{len(variants)} distinct zoom table(s)")
    for sig, (vid, words) in variants.items():
        print(f"  table variant {vid}: " + " ".join(f"{w:08x}" for w in words))

    print("\n z grow axis  flip0      flip1      flip2      flip3     "
          "  eff  zoomword(s)")
    missing, degenerate = [], []
    for z in range(16):
        for grow in (0, 1):
            for axis in ("x", "y", "xy"):
                eff = eff_index(z, grow)
                # eff >= 0x10 is the NO-ZOOM encoding: there is no such thing as
                # "no zoom on x only", so those cells cannot exist by
                # construction and are counted under the basic path instead.
                na = eff >= 0x10
                row, words = [], set()
                for flip in range(4):
                    hits = cell.get((z, grow, axis, flip), [])
                    px = max([h[2] for h in hits], default=-1)
                    for h in hits:
                        words.add(h[1])
                    if na:
                        row.append("   n/a   ")
                    elif px < 0:
                        row.append("  MISSING")
                        missing.append((z, grow, axis, flip))
                    elif px == 0:
                        row.append("  0px    ")
                        missing.append((z, grow, axis, flip))
                    else:
                        row.append(f"{px:7d}px")
                tag = ("NOZOOM-ENCODING (basic path)" if na
                       else ("HARD1" if eff == 0xf else ""))
                if eff < 0x10 and eff != 0xf and words == {0}:
                    degenerate.append((z, grow, axis))
                print(f"{z:2d} {grow:4d} {axis:>4s}  " + " ".join(row)
                      + f"   {eff:#04x} "
                      + " ".join(f"{w:08x}" for w in sorted(words)) + f" {tag}")

    print(f"\nbasic (no-zoom encoding, zom=0+grow=1 on both axes): "
          f"{nbasic} sprites, {basicpx} pixels")
    ok = True
    if nbasic == 0 or basicpx == 0:
        ok = False
        print("FAIL the unzoomed basic path drew nothing in this corpus")
    if missing:
        ok = False
        print(f"FAIL {len(missing)} combination(s) drew NO pixels: {missing[:20]}"
              + (" ..." if len(missing) > 20 else ""))
    # Every effective table index must have been exercised with a NON-ZERO zoom
    # word at least once; a zero word means the zoomed code path ran but neither
    # grew nor dropped a pixel, which is not coverage of grow/shrink.
    live = set()
    for (z, grow, axis, flip), hits in cell.items():
        for _, w, px in hits:
            if w and px:
                live.add(eff_index(z, grow))
    want = set(range(16))
    if not want <= live:
        ok = False
        print(f"FAIL effective zoom-table indices never exercised with a "
              f"non-zero zoom word AND visible pixels: {sorted(want - live)}")
    if degenerate:
        print(f"NOTE {len(degenerate)} (z,grow,axis) cells only ever saw a zero "
              f"zoom word in the tables present: {degenerate[:10]}"
              + (" ..." if len(degenerate) > 10 else ""))
    print("ZOOM COVERAGE: " + ("COMPLETE -- every zoom-table entry x grow/shrink "
                               "x axis x flip put pixels on the screen"
                               if ok else "INCOMPLETE (see above)"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
