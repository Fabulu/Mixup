#!/usr/bin/env python3
r"""W20 VALIDATOR: the STATIC stage-1 column stream vs the board's OWN BG map RAM.

The enumeration in w20level.py/w20price.py is a reading of the cartridge.  This
is the verdict half: take the MEASURED `bg_videoram` out of the wave-6 board
capture (rip/web/capture.bin, 161 frames of `fly-around`, stage 1) and check
that every one of the 64 ring columns the hardware holds is, longword for
longword, some column of the statically decoded stream WITH the per-stage tile
base ($0AA90000) added.

  python w20mapgate.py            all 161 frames
  python w20mapgate.py --break N  mutation N, which must go RED:
        1 = drop the tile base   2 = swap tile/attr halves
        3 = read the ring column-major instead of row-major
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import w20level as W  # noqa: E402

GAME = Path(__file__).resolve().parent.parent.parent
WEB = GAME / "rip" / "web"

BRK = 0
if "--break" in sys.argv:
    BRK = int(sys.argv[sys.argv.index("--break") + 1])

cj = json.loads((WEB / "capture.json").read_text())
cb = (WEB / "capture.bin").read_bytes()
off = 0
BGOFF = None
for name, ln in cj["layout"]:
    if name == "bg":
        BGOFF, BGLEN = off, ln
    off += ln
FB = cj["frameBytes"]
NF = cj["frames"]

# --- the static side: stage 0 (= stage 1 of the game), every map column -------
n, base, cols, attrs, raw = W.stage_tiles(0)
if BRK == 1:
    base = 0
static = {}
for c in range(n):
    key = []
    for r in range(9):
        v = W.L(W.L(W.COL_TBL) + c * 36 + r * 4)
        t = ((v >> 16) + base) & 0xFFFF
        a = v & 0xFFFF
        key.append((a, t) if BRK == 2 else (t, a))
    static.setdefault(tuple(key), []).append(c)

print(f"stage 1 static stream: {n} columns, {len(static)} distinct column "
      f"patterns (so {n - len(static)} columns are byte-identical repeats)")

matched = unmatched = 0
seen_cols = set()
blank = 0
for f in range(NF):
    b = cb[f * FB + BGOFF: f * FB + BGOFF + BGLEN]
    words = struct.unpack(">2048H", b)          # 68k share, big-endian u16
    for col in range(64):
        key = []
        for r in range(9):
            i = (col * 16 + r) if BRK == 3 else (r * 64 + col)
            key.append((words[i * 2], words[i * 2 + 1]))
        if all(t == 0 and a == 0 for t, a in key):
            blank += 1
            continue
        m = static.get(tuple(key))
        if m is None:
            unmatched += 1
            if unmatched <= 3:
                print(f"  UNMATCHED frame {f} ring col {col}: "
                      + " ".join(f"{t:04X}/{a:04X}" for t, a in key[:4]))
        else:
            matched += 1
            seen_cols.update(m)

print(f"frames {NF}  ring columns tested {NF*64}")
print(f"  MATCHED   {matched}")
print(f"  UNMATCHED {unmatched}")
print(f"  all-zero  {blank}")
print(f"  distinct STREAM columns the capture's ring proves: {len(seen_cols)} "
      f"of {n}  -> {sorted(seen_cols)[:12]}{' ...' if len(seen_cols) > 12 else ''}")
