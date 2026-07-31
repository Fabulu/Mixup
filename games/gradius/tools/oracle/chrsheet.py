#!/usr/bin/env python3
"""Dump the four CHR banks as PNG tile sheets, in the colours the game uses.

games/gradius/tools/chrdump.py already renders the CHR as a grey ramp, because
when it was written the palettes had not been measured. They have been now
(palprobe.lua + videoprobe.py), so this renders each bank the way the PPU would:

  * pattern table $0000 with a BACKGROUND palette,
  * pattern table $1000 with a SPRITE palette,

which is not an arbitrary choice -- it is what $2000 says. Measured at the
vblank write ($829D, `STX $2000` with X = $10): PPUCTRL = $A8 on every gameplay
frame, i.e. bgPat = $0000, sprPat = $1000, sprites 8x16.

It also marks what is actually USED, which is the point of looking at a tile
sheet at all:

    green corner   the tile appears in the measured nametable dump ($2000-$27FF)
    red corner     the tile appears in the measured OAM dump (both halves of an
                   8x16 pair are marked)

ROM-DERIVED OUTPUT. Tile sheets are cartridge graphics; they go under
tools/oracle/out/ (gitignored) or games/gradius/assets/ and are never committed.

Usage
    python games/gradius/tools/oracle/chrsheet.py \
        --state games/gradius/tools/oracle/out/video/f1200 \
        --outdir games/gradius/tools/oracle/out/video/sheets
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from rendercheck import ROM, chr_banks, tile_row  # noqa: E402

SCALE = 3
GAP = 12
COLS = 16


def png(path: Path, w: int, h: int, rgb: bytes) -> None:
    raw = b"".join(b"\x00" + rgb[y * w * 3:(y + 1) * w * 3] for y in range(h))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9))
                     + chunk(b"IEND", b""))


def sheet(bank: bytes, pal4: list[tuple[int, int, int]],
          pal4b: list[tuple[int, int, int]],
          used_bg: set[int], used_spr: set[int]) -> tuple[int, int, bytes]:
    """Two pattern tables side by side, 16x16 tiles each."""
    tw = COLS * 8 * SCALE
    w = tw * 2 + GAP
    h = COLS * 8 * SCALE
    buf = bytearray(w * h * 3)
    for half in (0, 1):
        base = half * 0x1000
        pal = pal4b if half else pal4
        used = used_spr if half else used_bg
        for t in range(256):
            tx = (t % COLS) * 8 * SCALE + half * (tw + GAP)
            ty = (t // COLS) * 8 * SCALE
            for row in range(8):
                px = tile_row(bank, base, t, row)
                for cx in range(8):
                    r, g, b = pal[px[cx]]
                    for sy in range(SCALE):
                        for sx in range(SCALE):
                            o = ((ty + row * SCALE + sy) * w
                                 + (tx + cx * SCALE + sx)) * 3
                            buf[o:o + 3] = bytes((r, g, b))
            if t in used:                       # a 3x3 corner flag
                mark = (0, 255, 0) if half == 0 else (255, 0, 0)
                for sy in range(3):
                    for sx in range(3):
                        o = ((ty + sy) * w + (tx + sx)) * 3
                        buf[o:o + 3] = bytes(mark)
    return w, h, bytes(buf)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", required=True,
                    help="a videoprobe.py output dir (for pal.bin/nt.bin/oam.bin)")
    ap.add_argument("--palette", default=None)
    ap.add_argument("--outdir", required=True)
    a = ap.parse_args()

    st = Path(a.state).resolve()
    out = Path(a.outdir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    mp = Path(a.palette) if a.palette else HERE / "out" / "video" / "master_palette.bin"
    raw = mp.read_bytes()
    master = [(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]) for i in range(64)]

    pal = st.joinpath("pal.bin").read_bytes()
    nt = st.joinpath("nt.bin").read_bytes()
    oam = st.joinpath("oam.bin").read_bytes()

    # $3F00 is the universal backdrop: colour 0 of EVERY palette reads through to
    # it, which is why a tile sheet drawn with pal[4*i] instead of pal[0] would be
    # subtly wrong on the three background palettes whose entry 0 differs.
    def group(i: int) -> list[tuple[int, int, int]]:
        return [master[pal[0] & 0x3F]] + [master[pal[i * 4 + k] & 0x3F]
                                          for k in (1, 2, 3)]

    used_bg = set(nt[0:0x400]) | set(nt[0x400:0x800])
    used_spr: set[int] = set()
    for i in range(64):
        if oam[i * 4] < 0xEF:
            t = oam[i * 4 + 1]
            used_spr.add(t & 0xFE)          # 8x16: the pair is (t & $FE, +1)
            used_spr.add((t & 0xFE) + 1)

    banks = chr_banks(ROM)
    for i, bank in enumerate(banks):
        w, h, buf = sheet(bank, group(0), group(4), used_bg, used_spr)
        p = out / f"bank{i}.png"
        png(p, w, h, buf)
        print(f"wrote {p}  {w}x{h}  "
              f"(left: $0000 in bg palette 0, right: $1000 in sprite palette 0)")

    print(f"\nmarked {len(used_bg)} tiles as used by the nametables and "
          f"{len(used_spr)} by OAM, from {st.name}")
    print("Palettes used for the sheets, from that frame's palette RAM:")
    print("  bg0 " + " ".join(f"${pal[k]:02X}" for k in range(4)))
    print("  sp0 " + " ".join(f"${pal[0x10 + k]:02X}" for k in range(4)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
