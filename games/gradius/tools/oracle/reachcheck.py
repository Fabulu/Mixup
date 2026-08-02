#!/usr/bin/env python3
"""reachcheck.py -- confirm the boss-reaching method in ONE fresh Mesen run.

W25b / recon. The wave-20 sweep harness (bossreach.py / sweep.py --only boss)
proved stage 1's boss page (`$0C00`, `$1B = $82`) reachable by a fixed `RUA`
hold from frame 5000 with the powered poke. This file re-runs that exact
trajectory and prints the measured `maxScroll`, the `$1B` transition timeline
(every frame `$1B` changes) and the death count, so the reaching method is a
checked fact this wave rather than a quoted one.

    python games/gradius/tools/oracle/reachcheck.py
    python games/gradius/tools/oracle/reachcheck.py --frames 9000

ROM-DERIVED output lands under out/sweep/ (gitignored); nothing is committed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "sweep"

BOOT = "200:,10:S,190:"
LEAD = [(1350, "RDA"), (324, "RUA"), (80, "RDA")]   # the surviving opening
SWITCH = 5000                                        # hold RA to here, RUA after
TAIL = "RUA"
POWER = "0044=2,0045=2,0046=5,0041=1"                # $44=2,$45=2,$46=5,$41=1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=9000)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    used = 400 + sum(n for n, _ in LEAD)
    segs = [BOOT] + [f"{n}:{b}" for n, b in LEAD]
    if SWITCH > used:
        segs.append(f"{SWITCH - used}:RA")
        used = SWITCH
    segs.append(f"{a.frames - used}:{TAIL}")
    script = ",".join(segs)
    poke = ",".join(f"{p}@400-{a.frames - 1}" for p in POWER.split(","))

    jp = OUT / "reachcheck.json"
    ram = OUT / "reachcheck.ram"
    print(f"script {script}")
    print(f"poke   {poke}")
    r = probe.run(a.frames, script, jp, ramdump=ram, watch="", poke=poke,
                  timeout_s=1800)
    rows = json.loads(jp.read_text())["frames"]
    scroll = [(row["scrollHi"] << 8) | row["scrollLo"] for row in rows]
    rb = ram.read_bytes()
    sub = [rb[i * 2048 + 0x1B] for i in range(len(rows))]

    death_frames = [i for i in range(1, len(sub))
                    if sub[i] == 0xA0 and sub[i - 1] != 0xA0]
    mx = max(scroll)
    mxat = scroll.index(mx)
    deaths = len(death_frames)
    first_death = death_frames[0] if death_frames else None

    print(f"\nmaxScroll ${mx:04X} at frame {mxat}; deaths {deaths}"
          + (f", first {first_death}" if first_death is not None else "")
          + f"; distinct $1B {sorted(set(sub))}")
    print(f"lag drops {len([l for l in r.lines if l.startswith('lag.drop')])}")

    print("\n$1B transition timeline (frame : $1B : scroll):")
    prev = None
    for i, v in enumerate(sub):
        if v != prev:
            print(f"  f{i:5d}  $1B = ${v:02X}   scroll ${scroll[i]:04X}")
            prev = v

    jp.unlink(missing_ok=True)
    ram.unlink(missing_ok=True)
    print("\nstage-1 boss page is $0C ($9A3D[0]) = scroll $0C00; the stage "
          "ends at page $0E ($98FD[0]).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
