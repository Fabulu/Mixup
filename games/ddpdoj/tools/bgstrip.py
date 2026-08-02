#!/usr/bin/env python3
r"""WAVE 14 -- LOOK AT THE BACKGROUND.  Render stage-1 map columns to a PNG,
out of the PUBLISHED BUNDLE, and check them against the cartridge.

    python games/ddpdoj/tools/bgstrip.py 0 32          columns 0..31 -> PNG
    python games/ddpdoj/tools/bgstrip.py 96 32         a shard the recording
                                                       never reached
    python games/ddpdoj/tools/bgstrip.py 0 224 --check compare EVERY column,
                                                       bundle vs cartridge
    python games/ddpdoj/tools/bgstrip.py --second      the $227AF8 map
    python games/ddpdoj/tools/bgstrip.py 0 224 --check --break planes|base|u19

WHY THIS EXISTS.  A wrong tile decode produces PLAUSIBLE GARBAGE -- wave 3
measured a reversed 5-bit plane order at 72.4 % of pixels correct and a
mis-located ROM at 52.9 %.  Neither looks like an error in a thumbnail.  So this
tool does two separate things and both of them matter:

  1. it WRITES A PICTURE a human can look at, which is the only check on
     "does the whole stage-1 background actually look like a background"; and
  2. with --check it re-decodes the same columns STRAIGHT OUT OF THE CARTRIDGE
     -- assembling the igs023 region from the ROM files, `bgTile`'s bitstream,
     and the 68000 image's own map columns -- and requires the two to be
     pixel-identical.  0 differing pixels, or it fails.

EVERYTHING IT READS FOR (1) IS THE BUNDLE, INCLUDING THE MAP.  The 224 map
columns are not a bundle file: the port reads them out of the $225B78 ROM window
that `player.tables.json` carries and writes $900000 itself.  So this reads the
window out of `assets/player.tables.json.gz`, which means a picture from this
tool is a picture of exactly the bytes the page has.

`--break` are the RED SWITCHES, and every one of them must be seen to fail:
  planes  reverse the 5-bit plane weights, on the CARTRIDGE side
  base    drop the $0AA9 per-stage tile base, on the BUNDLE's map
  u19     load cave_t04401w064.u19 at 0x200000 instead of 0x180000

AND ONE THAT WAS REMOVED BECAUSE IT COULD NOT FAIL.  The first version of this
tool had a `swap` break that read the map longword's tile and attr halves the
other way round.  It came back **100.0000 % identical** -- because it mutates
the MAP, and both sides of this comparison read the same map.  A mutation of a
SHARED INPUT is not a mutation at all; it moves both answers together.  The
three above are all one-sided: `planes` and `u19` change only how the cartridge
is decoded, `base` changes only which bundle slot is asked for.  (The tile/attr
split is checked where it can be: `export-web.mjs` requires every one of the
2,223 attribute words to have no bit outside $3E, which a swap destroys.)
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ASSETS = GAME / "assets"
ROMDIR = GAME / "rip" / "rom"
IMAGE = HERE / "oracle" / "out" / "maincpu.bin"

BG_W = BG_H = 32
BG_BPP = 5
BG_TILE_BITS = BG_W * BG_H * BG_BPP          # 5120 bits = 640 bytes packed

# pgm.cpp ROM_START(ddpdojblk) -- and cave_t04401w064.u19 loads at 0x180000,
# NOT 0x200000.  It OVERWRITES the top of pgm_t01s.rom.  Getting this wrong
# shifts every tile index above 0xC000 and still renders a plausible picture
# (wave 3 measured 52.8566 % of pixels correct), which is why it is spelled out
# here as well as in src/render/regions.js.
IGS023_LAYOUT = [("pgm_t01s.rom", 0x000000, 0x200000),
                 ("cave_t04401w064.u19", 0x180000, 0x800000)]
IGS023_SIZE = 0xA00000


def load_bundle():
    man = json.loads((ASSETS / "manifest.json").read_text())
    bg = man["gfx"]["bg"]
    nos = np.frombuffer(gzip.decompress((ASSETS / "gfx/bg.tileno.u16.gz").read_bytes()),
                        dtype="<u2")
    if len(nos) != bg["tiles"]:
        raise SystemExit(f"bg.tileno.u16 has {len(nos)} slots, manifest says {bg['tiles']}")
    pixels = np.zeros((bg["tiles"], BG_H, BG_W), np.uint8)
    for m in bg["shards"]:
        raw = gzip.decompress((ASSETS / f"gfx/bg.shard{m['i']}.tiles.u8.gz").read_bytes())
        want = m["tiles"] * BG_H * BG_W
        if len(raw) != want:
            raise SystemExit(f"shard {m['i']} is {len(raw)} B, manifest says {want}")
        pixels[m["firstSlot"]:m["firstSlot"] + m["tiles"]] = \
            np.frombuffer(raw, np.uint8).reshape(m["tiles"], BG_H, BG_W)
    slot = {int(n): i for i, n in enumerate(nos)}
    pal = np.frombuffer(gzip.decompress((ASSETS / "gfx/bg.pal.u16.gz").read_bytes()),
                        dtype="<u2")
    return man, pixels, slot, pal


def rom_window(man, base):
    """One of `player.tables.json`'s ROM windows, as bytes -- the port's own copy."""
    tab = json.loads(gzip.decompress((ASSETS / "player.tables.json.gz").read_bytes()))
    for w in tab["rom"]["windows"]:
        at = int(w["base"].lstrip("$"), 16)
        if at <= base < at + w["len"]:
            return at, bytes.fromhex(w["hex"])
    raise SystemExit(f"no ROM window in the bundle covers ${base:06X}")


def decode_map(data, at, base_addr, ncols, tile_base, brk=None):
    """[(tile, attr)] x 9 per column, tile base added to the WHOLE longword."""
    out = []
    off = base_addr - at
    for c in range(ncols):
        col = []
        for r in range(9):
            k = off + c * 36 + r * 4
            v = int.from_bytes(data[k:k + 4], "big")
            hi, lo = (v >> 16) & 0xFFFF, v & 0xFFFF
            tb = 0 if brk == "base" else tile_base
            col.append(((hi + tb) & 0xFFFF, lo))
        out.append(col)
    return out


def palette_rgb(pal):
    v = pal.astype(np.uint32)
    r, g, b = (v >> 10) & 0x1F, (v >> 5) & 0x1F, v & 0x1F
    return np.stack([(r << 3) | (r >> 2), (g << 3) | (g >> 2),
                     (b << 3) | (b >> 2)], -1).astype(np.uint8)


def paint(cols, tile_of, pal_rgb, missing=None):
    """A column-major strip: 9 rows of 32 px tall, one 32 px column per map column."""
    h, w = 9 * BG_H, len(cols) * BG_W
    img = np.zeros((h, w, 3), np.uint8)
    for x, col in enumerate(cols):
        for y, (tile, attr) in enumerate(col):
            px = tile_of(tile)
            if px is None:
                if missing is not None:
                    missing.add(tile)
                img[y * BG_H:(y + 1) * BG_H, x * BG_W:(x + 1) * BG_W] = (255, 0, 255)
                continue
            bank = (attr & 0x3E) >> 1
            img[y * BG_H:(y + 1) * BG_H, x * BG_W:(x + 1) * BG_W] = \
                pal_rgb[bank * 32 + px.astype(np.int32)]
    return img


def rom_tiles(brk=None):
    """The igs023 region, assembled, plus a `bgTile` that decodes out of it."""
    region = bytearray(IGS023_SIZE)
    for name, off, ln in IGS023_LAYOUT:
        if brk == "u19" and name == "cave_t04401w064.u19":
            off = 0x200000            # the mutation wave 3 measured at 52.8566 %
        d = (ROMDIR / name).read_bytes()
        if len(d) != ln:
            raise SystemExit(f"{name}: {len(d)} B, pgm.cpp says {ln}")
        region[off:off + ln] = d
    region = np.frombuffer(bytes(region), np.uint8)
    bits = np.unpackbits(region, bitorder="little")

    def tile(n):
        base = n * BG_TILE_BITS
        if base + BG_TILE_BITS > bits.size:
            return None
        b = bits[base:base + BG_TILE_BITS].reshape(BG_W * BG_H, BG_BPP)
        w = np.array([1, 2, 4, 8, 16], np.uint8)
        if brk == "planes":
            w = w[::-1]
        return (b * w).sum(1).astype(np.uint8).reshape(BG_H, BG_W)
    return tile


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("start", nargs="?", type=int, default=0)
    ap.add_argument("count", nargs="?", type=int, default=32)
    ap.add_argument("--second", action="store_true",
                    help="render the $227AF8 second map instead")
    ap.add_argument("--check", action="store_true",
                    help="re-decode the same columns from the CARTRIDGE and require "
                         "0 differing pixels")
    ap.add_argument("--break", dest="brk", choices=["planes", "base", "u19"])
    ap.add_argument("--out", type=Path, default=GAME / "rip" / "bgstrip")
    a = ap.parse_args()

    man, pixels, slot, pal = load_bundle()
    bg = man["gfx"]["bg"]
    pal_rgb = palette_rgb(pal)

    if a.second:
        smap = np.frombuffer(gzip.decompress((ASSETS / "gfx/bg.smap.u16.gz").read_bytes()),
                             dtype="<u2")
        n = bg["secondMap"]["ncols"]
        cols = [[(int(smap[(c * 9 + r) * 2]), int(smap[(c * 9 + r) * 2 + 1]))
                 for r in range(9)] for c in range(n)]
        start, count, label = 0, n, "second"
    else:
        base = int(str(bg["map"]["cols"]).lstrip("$"), 16)
        at, data = rom_window(man, base)
        ncols = bg["map"]["ncols"]
        start = max(0, a.start)
        count = min(a.count, ncols - start)
        if count <= 0:
            raise SystemExit(f"columns {a.start}..{a.start + a.count - 1} are outside "
                             f"stage 1's {ncols}")
        cols = decode_map(data, at, base + start * 36, count,
                          int(str(bg["map"]["tileBase"]).lstrip("$"), 16), a.brk)
        label = f"{start}_{start + count - 1}"

    missing = set()
    img = paint(cols, lambda t: pixels[slot[t]] if t in slot else None, pal_rgb, missing)
    a.out.mkdir(parents=True, exist_ok=True)
    from PIL import Image
    # The cabinet is TATE: the board's "columns" run along the screen's long
    # axis, so the strip is rotated to read the way a player sees it scroll.
    p = a.out / f"bg.{label}{'.break-' + a.brk if a.brk else ''}.png"
    Image.fromarray(np.rot90(img)).save(p)
    print(f"{p}  {img.shape[1]}x{img.shape[0]} px, {count} map columns"
          + (f", {len(missing)} tiles NOT IN THE BUNDLE" if missing else
             ", every tile came from the bundle"))
    if missing:
        print("  missing: " + " ".join(f"${t:04x}" for t in sorted(missing)[:16]))

    if a.check:
        rt = rom_tiles(a.brk)
        ref = paint(cols, rt, pal_rgb)
        diff = int((img != ref).any(-1).sum())
        px = img.shape[0] * img.shape[1]
        same = px - diff
        red = a.brk is not None
        ok = (diff == 0) if not red else (diff != 0)
        print(f"{'EXPECTED-RED ' if red else ''}"
              f"{'PASS' if ok else 'FAIL'}: bundle vs CARTRIDGE over {count} map "
              f"columns: {same}/{px} = {100 * same / px:.4f}% identical"
              + (" -- diverged, as it must" if red and ok else ""))
        if not ok:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
