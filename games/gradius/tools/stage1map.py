#!/usr/bin/env python3
"""Expand a Gradius stage's terrain out of the PRG, offline.

The streamer itself is verified against the running cartridge by
`tools/oracle/terrain.py`; this tool takes the *same* decoder and runs it over
a whole stage without an emulator, so the shape and the size of the level data
can be looked at directly.  It exists to answer "how much of a stage is data
and how much is code", and to catch the one place the ROM's decoder can fall
off the end of a row before a port trips over it.

Everything it prints is ROM-DERIVED and must not be committed -- the default
output directory is `games/gradius/rip/`, which is gitignored in full.

    python games/gradius/tools/stage1map.py            # stage 1
    python games/gradius/tools/stage1map.py --stage 2
    python games/gradius/tools/stage1map.py --all      # every stage, summary

Layout, all of it measured (see games/gradius/NOTES-terrain.md):

    world x  --page-->  $CF4E[page]  --screen-->  56-byte layout array
    layout[row*8 + col] = block id
    block id --> $D778[id] --> RLE'd 4x4 tile stream
             --> $D6F8[id] --> one attribute byte
    tile >= $9FB4[stage]  =>  solid
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "oracle"))
import mesen  # noqa: E402
import terrain as T  # noqa: E402

BLOCKS_X = 8      # blocks across one 256 px page
BLOCKS_Y = 7      # blocks down the 224 px playfield ($58's row counter, 0..6)
# $9926: LDA $3F / CMP $98FD,Y / BCC -- the stage ends when the camera page
# reaches this.  $9A4F / $9986 compare against $9A3D,Y for the boss.
END_PAGE = 0x98FD
BOSS_PAGE = 0x9A3D


def screen_for(rom: T.Rom, stage: int, page: int) -> tuple[int, int]:
    """($9E38-$9E6B) page -> (effective stage for the tables, screen index)."""
    st = rom.stage(stage)
    s = rom.b(st["screenOrder"] + page)
    if stage != 0:
        if s == 0:
            return 0, 0
        s -= 1
    return stage, s


def stage_map(rom: T.Rom, stage: int):
    """Yield (page, screen, row, col, blockId, tiles, attr, collision)."""
    end = rom.b(END_PAGE + stage)
    for page in range(end):
        eff, screen = screen_for(rom, stage, page)
        st = rom.stage(eff)
        layout = st["layoutBase"] + T.SCREEN_STRIDE * screen
        thr = st["threshold"]
        for row in range(BLOCKS_Y):
            for col in range(BLOCKS_X):
                bid = rom.b(layout + row * 8 + col)
                ptr = rom.w(st["patternTbl"] + 2 * bid)
                tiles = T.decode_block(rom, ptr)
                attr = rom.b(st["attrTbl"] + bid)
                yield (page, screen, row, col, bid, tiles, attr,
                       T.collision_bytes(tiles, thr))


def render(rom: T.Rom, stage: int, out: Path):
    end = rom.b(END_PAGE + stage)
    st = rom.stage(stage)
    order = [rom.b(st["screenOrder"] + p) for p in range(end)]
    cells = list(stage_map(rom, stage))

    # collision, one character per 8x8 tile: 4 tiles per block across,
    # 4 down. Rows are the playfield's 28 tile rows.
    grid = [["." for _ in range(end * 32)] for _ in range(BLOCKS_Y * 4)]
    tgrid = [[0] * (end * 32) for _ in range(BLOCKS_Y * 4)]
    for page, _screen, row, col, _bid, tiles, _attr, coll in cells:
        for tc in range(4):
            for tr in range(4):
                x = page * 32 + col * 4 + tc
                y = row * 4 + tr
                bits = (coll[tc] >> (2 * tr)) & 3
                grid[y][x] = "#" if bits else "."
                tgrid[y][x] = tiles[tr * 4 + tc]

    lines = []
    lines.append(f"Gradius stage {stage + 1} (index ${stage:02X}) -- ROM-DERIVED, DO NOT COMMIT")
    lines.append(f"  pages 0..{end - 1}  =  {end * 256} px of world  "
                 f"({end} screens' worth of camera travel)")
    lines.append(f"  boss trigger at page ${rom.b(BOSS_PAGE + stage):02X}, "
                 f"stage ends at page ${end:02X}")
    lines.append(f"  screen order ($CF4E-style table at ${st['screenOrder']:04X}): {order}")
    lines.append(f"  distinct screens used: {sorted(set(order))}  "
                 f"({len(set(order))} x 56 bytes = {len(set(order)) * 56} bytes of layout)")
    ids = sorted({c[4] for c in cells})
    lines.append(f"  distinct block ids: {len(ids)}  min ${min(ids):02X} max ${max(ids):02X}")
    lines.append(f"  solid tiles: {sum(r.count('#') for r in grid)} of "
                 f"{len(grid) * len(grid[0])}")
    lines.append("")
    lines.append("== per-screen block layout (7 rows x 8 cols of 32x32 px) ==")
    for s in sorted(set(order)):
        eff, sc = screen_for(rom, stage, order.index(s))
        base = rom.stage(eff)["layoutBase"] + T.SCREEN_STRIDE * sc
        lines.append(f"  screen {s} @ ${base:04X}")
        for row in range(BLOCKS_Y):
            lines.append("    " + " ".join(
                f"{rom.b(base + row * 8 + c):02X}" for c in range(8)))
    lines.append("")
    lines.append("== collision, one char per 8x8 tile, '#' = solid ==")
    lines.append("   (column ruler is the world tile column; 32 per page)")
    for y, r in enumerate(grid):
        lines.append(f"  {y:2d} " + "".join(r))
    lines.append("")
    lines.append("== nametable tiles, hex, same grid ==")
    for y, r in enumerate(tgrid):
        lines.append(f"  {y:2d} " + " ".join(f"{t:02X}" for t in r))
    out.write_text("\n".join(lines) + "\n")
    return lines[:8]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", type=int, default=0, help="0-based stage index")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--outdir", type=Path,
                    default=HERE.parent / "rip",
                    help="ROM-derived output goes here (gitignored)")
    args = ap.parse_args()
    rom = T.Rom(mesen.DEFAULT_ROM)
    args.outdir.mkdir(parents=True, exist_ok=True)

    stages = range(7) if args.all else [args.stage]
    for s in stages:
        out = args.outdir / f"stage{s + 1}-terrain.txt"
        try:
            head = render(rom, s, out)
        except Exception as e:            # the decoder's own guard rails
            print(f"  stage {s + 1}: DECODER REFUSED -- {e}")
            continue
        print(f"  wrote {out}")
        for l in head:
            print("   " + l)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
