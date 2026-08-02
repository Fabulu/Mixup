#!/usr/bin/env python3
r"""W20 VALIDATOR 2: every BG-map longword the BOARD wrote over a whole stage-1
run, checked against the STATIC column stream.

  python w20maprun.py 11000 --tag whole       # measure  (MAME, ~10 min)
  python w20mapgate2.py out/w20map-whole.tsv  # judge
  python w20mapgate2.py out/w20map-whole.tsv --break N

Breaks, all of which must go RED:
  1  drop the per-stage tile base $0AA90000 that $240D86 adds
  2  read the stream with a 32-byte column record instead of 36
  3  swap the tile and attr halves of the map longword

Each ring column is complete when all nine of its rows have been written since
the last time it was cleared; a complete column must equal, longword for
longword, some column of the statically decoded stream.  The headline is the
fraction of the 248-column stream the cartridge PROVES.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import w20level as W  # noqa: E402

path = Path(sys.argv[1])
BRK = int(sys.argv[sys.argv.index("--break") + 1]) if "--break" in sys.argv else 0

BASE = W.L(W.COL_TBL)                    # $225B78
END = W.L(W.PAL_TBL)                     # $227E58
STRIDE = 32 if BRK == 2 else 36
NCOL = (END - BASE) // STRIDE
TBASE = 0 if BRK == 1 else (W.L(W.BASE_TBL) >> 16)

static = []
for c in range(NCOL):
    col = []
    for r in range(9):
        v = W.L(BASE + c * STRIDE + r * 4)
        t, a = ((v >> 16) + TBASE) & 0xFFFF, v & 0xFFFF
        col.append((a, t) if BRK == 3 else (t, a))
    static.append(tuple(col))
bycol = {}
for i, c in enumerate(static):
    bycol.setdefault(c, []).append(i)
entries = set()
for c in static:
    for r, e in enumerate(c):
        entries.add((r, e))

ring = {}
nrows = zero = badentry = matched = unmatched = 0
proved = set()
firstbad = []
lfmax = clkmax = 0
pending = {}
for line in path.read_text().splitlines()[1:]:
    f = line.split("\t")
    lf, clock, idx, r, c, half, word = (int(f[0]), int(f[1]), int(f[2]),
                                        int(f[3]), int(f[4]), int(f[5]),
                                        int(f[6], 16))
    nrows += 1
    lfmax = max(lfmax, lf)
    clkmax = max(clkmax, clock)
    if half == 0:
        pending[idx] = word
        continue
    tile = pending.pop(idx, None)
    if tile is None:
        continue                       # a half-write with no partner
    attr = word
    if r > 8:
        continue
    if tile == 0 and attr == 0:
        zero += 1
        ring.pop(c, None)
        continue
    if (r, (tile, attr)) not in entries:
        badentry += 1
        if len(firstbad) < 4:
            firstbad.append(f"lf{lf} clk${clock:04X} r{r} c{c} {tile:04X}/{attr:04X}")
        ring.pop(c, None)
        continue
    d = ring.setdefault(c, {})
    d[r] = (tile, attr)
    if len(d) == 9:
        key = tuple(d[i] for i in range(9))
        m = bycol.get(key)
        if m is None:
            unmatched += 1
        else:
            matched += 1
            proved.update(m)
        ring.pop(c)

print(f"{path.name}: {nrows} 16-bit writes to $900000..$900FFF, "
      f"max lf {lfmax}, max $8130CE ${clkmax:04X}")
print(f"  static model: {NCOL} columns of {STRIDE} B, tile base ${TBASE:04X}"
      + (f"   [BREAK {BRK}]" if BRK else ""))
print(f"  all-zero longwords (the $23C668 clear)  : {zero}")
print(f"  map entries matching NO static entry    : {badentry}"
      + (f"   first: {firstbad}" if firstbad else ""))
print(f"  complete 9-row ring columns MATCHED     : {matched}")
print(f"  complete 9-row ring columns UNMATCHED   : {unmatched}")
print(f"  STATIC STREAM COLUMNS PROVEN            : {len(proved)} of {NCOL} "
      f"({100*len(proved)/NCOL:.1f} %)")
if proved and len(proved) < NCOL:
    miss = [i for i in range(NCOL) if i not in proved]
    runs, s = [], miss[0]
    for a, b in zip(miss, miss[1:] + [None]):
        if b != (a + 1 if a is not None else None):
            runs.append((s, a))
            s = b
    print(f"  never written by this run               : {len(miss)} columns, "
          f"runs {runs[:8]}{' ...' if len(runs) > 8 else ''}")
