#!/usr/bin/env python3
"""bgrecon.lua with a caller-supplied input script.

  python bgrecon2.py <frames> <tsvname> attract|play|deep
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pgm  # noqa: E402

CHOOSE_B = "560=D;570=;600=A;610="
COIN_START = "1000=N;1010=;1100=N;1110=;1200=S;1210=;1500=A;1510=;1560=A;1570=;1700=A;1710="
TAIL = ("1900=C;2000=CU;2060=C;2120=CL;2180=C;2240=CR;2300=C;2360=CD;"
        "2420=C;2480=CU;2540=C;2700=CL;2800=C;2900=CR;3000=C;3200=CU;"
        "3400=C;3600=CD;3800=C;4000=CL;4200=C;4400=CR;4600=C;5000=CU;"
        "5200=C;5400=CD;5600=C;5800=CL;6000=C;6400=CR;6600=C")

SCRIPTS = {
    # NO COIN.  Choose VERSION-B and then touch nothing: whatever the board
    # does on its own is the attract path.
    "attract": CHOOSE_B,
    "play": CHOOSE_B + ";" + COIN_START + ";" + TAIL,
}


def main() -> int:
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 2600
    name = sys.argv[2] if len(sys.argv) > 2 else "bgrecon2"
    which = sys.argv[3] if len(sys.argv) > 3 else "play"
    tsv = HERE / "out" / f"{name}.tsv"
    env = {
        "BGR_FRAMES": str(frames),
        "BGR_INPUT": SCRIPTS[which],
        "BGR_TSV": str(tsv),
    }
    r = pgm.run(HERE / "bgrecon.lua", seconds=7200, env=env, timeout=7200)
    for ln in r.lines:
        print(ln)
    if not r.lines:
        print(r.stdout[-3000:], file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
