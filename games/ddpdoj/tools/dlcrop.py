#!/usr/bin/env python3
"""WAVE 75 -- CUT A DISPLAY-LIST RECORD OUT OF THE BOARD'S OWN FRAMEBUFFER.

    python games/ddpdoj/tools/dlcrop.py PNG X Y W H OUT [--pad N] [--scale N]

`boarddl.mjs` says WHERE the cartridge drew a record and how big it is; this
says WHAT IT LOOKED LIKE, by cutting that rectangle out of the framebuffer PNG
`frame.lua`'s `PROBE_SNAP` wrote at the same logic frame.  Nothing here decodes
a sprite ROM and nothing here is committed: the PNGs and the crops live under
`tools/oracle/out/`, which is gitignored.

THE MAPPING, and it is calibrated rather than assumed.  The PGM bitmap is
448x224; MAME rotates it for this vertical game, so the snapshot is 224 wide by
448 tall.  The display list's word 0 is the game's LONG axis (11 bits, the
bitmap's X) and word 1 is the SHORT axis (10 bits, the bitmap's Y), which
`src/spritequeue.js` is explicit about and which is exactly the naming trap it
warns of.  `--calib` prints the two candidate mappings for a record so a human
can pick the one the ship lands in; the default is the one this wave measured:

    png_x = short                 png_y = (H_png - 1) - long

i.e. the long axis grows UP the portrait image, which is why the ship's
`py = $800` bottom wall is the SMALL end of the range.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


def to_png(long_axis: int, short_axis: int, size: tuple[int, int],
           flip: bool = False) -> tuple[int, int]:
    w, h = size
    if flip:
        return short_axis, long_axis
    return short_axis, (h - 1) - long_axis


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("png")
    ap.add_argument("x", type=int, help="display-list word 0 (LONG axis)")
    ap.add_argument("y", type=int, help="display-list word 1 (SHORT axis)")
    ap.add_argument("w", type=int, help="width in 16-pixel columns")
    ap.add_argument("h", type=int, help="height in pixel rows")
    ap.add_argument("out")
    ap.add_argument("--pad", type=int, default=8)
    ap.add_argument("--scale", type=int, default=3)
    ap.add_argument("--no-rot", action="store_true",
                    help="the OTHER candidate mapping (png_y = long)")
    a = ap.parse_args(argv)

    im = Image.open(a.png).convert("RGB")
    pw, ph = im.size
    # the record's own extent, in bitmap axes
    lo0, sh0 = a.x, a.y
    lo1, sh1 = a.x + a.h, a.y + a.w * 16
    p0 = to_png(lo0, sh0, im.size, a.no_rot)
    p1 = to_png(lo1, sh1, im.size, a.no_rot)
    x0, x1 = sorted((p0[0], p1[0]))
    y0, y1 = sorted((p0[1], p1[1]))
    box = (max(0, x0 - a.pad), max(0, y0 - a.pad),
           min(pw, x1 + a.pad), min(ph, y1 + a.pad))
    if box[2] <= box[0] or box[3] <= box[1]:
        print(f"EMPTY CROP {box} -- the record is off the visible bitmap")
        return 1
    crop = im.crop(box)
    if a.scale > 1:
        crop = crop.resize((crop.width * a.scale, crop.height * a.scale),
                           Image.NEAREST)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    crop.save(a.out)
    print(f"CROP {a.png} long={lo0}..{lo1} short={sh0}..{sh1} -> png box {box} "
          f"({crop.width}x{crop.height}) -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
