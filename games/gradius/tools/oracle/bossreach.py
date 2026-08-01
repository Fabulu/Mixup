#!/usr/bin/env python3
"""bossreach.py -- CAN A SCRIPT REACH STAGE 1'S BOSS? WAVE 20 / recon 4.

The sweep's own run (sweep.py, powered) stops at scroll $0A64: the ship is
parked at X = 240, Y = 96 and something kills it at frame 5514 / scroll $0A28,
after which the checkpoint sends the camera back to $0800. Stage 1's boss page
is $0C ($9A3D[0], read from the ROM by stagewaves.py), i.e. scroll $0C00, and
the stage ends at page $0E.

So "is the boss reachable" is an open question and this file answers it BY
MEASUREMENT rather than by argument. It runs the same trajectory to frame 5000
and then holds a DIFFERENT direction for the rest, printing max scroll, the
first death and whether $1B ever reaches the boss sub-states ($81-$8F).

    python games/gradius/tools/oracle/bossreach.py
    python games/gradius/tools/oracle/bossreach.py --frames 12000 --switch 5000

A zero here is NOT "the boss is unreachable". It is "these N scripts did not
reach it", and the output says so.
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
LEAD = [(1350, "RDA"), (324, "RUA"), (80, "RDA")]     # the surviving opening
POKE = "0044=2,0045=2,0046=5,0041=1"

# What to hold once the opening is over. `zig` alternates, because a fixed hold
# parks the ship against a wall and stage 1's later enemies aim.
TAILS = ["RA", "RUA", "RDA", "UA", "DA", "A", "zig"]


def build(tail: str, switch: int, frames: int) -> str:
    used = 400 + sum(n for n, _ in LEAD)
    segs = [BOOT] + [f"{n}:{b}" for n, b in LEAD]
    if switch > used:
        segs.append(f"{switch - used}:RA")
        used = switch
    rest = frames - used
    if tail == "zig":
        # 90 frames up, 90 down, forever -- a moving target, still scrolling
        n, i = 0, 0
        while n < rest:
            k = min(90, rest - n)
            segs.append(f"{k}:{'RUA' if i % 2 == 0 else 'RDA'}")
            n += k
            i += 1
    else:
        segs.append(f"{rest}:{tail}")
    return ",".join(segs)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=9000)
    ap.add_argument("--switch", type=int, default=5000)
    ap.add_argument("--tails", default=",".join(TAILS))
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    print(f"{'tail':>6}  {'maxScroll':>9}  {'atFrame':>7}  {'deaths':>6}  "
          f"{'firstDeath':>10}  $1B values")
    for tail in a.tails.split(","):
        script = build(tail, a.switch, a.frames)
        jp = OUT / f"bossreach-{tail}.json"
        ram = OUT / f"bossreach-{tail}.ram"
        poke = ",".join(f"{p}@400-{a.frames - 1}" for p in POKE.split(","))
        probe.run(a.frames, script, jp, ramdump=ram, watch="", poke=poke,
                  timeout_s=1800)
        rows = json.loads(jp.read_text())["frames"]
        scroll = [(r["scrollHi"] << 8) | r["scrollLo"] for r in rows]
        rb = ram.read_bytes()
        sub = [rb[i * 2048 + 0x1B] for i in range(len(rows))]
        dead = [i for i in range(1, len(sub)) if sub[i] == 0xA0 and sub[i - 1] != 0xA0]
        mx = max(scroll)
        print(f"{tail:>6}  {'$%04X' % mx:>9}  {scroll.index(mx):>7}  "
              f"{len(dead):>6}  {(dead[0] if dead else '-'):>10}  "
              f"{sorted(set(sub))}")
        ram.unlink(missing_ok=True)
        jp.unlink(missing_ok=True)
    print("\n  boss page for stage 1 is $0C ($9A3D[0]) = scroll $0C00; "
          "the stage ends at page $0E ($98FD[0]).")
    print("  A tail that never reaches $0C00 has NOT proved the boss "
          "unreachable -- it has measured that this script did not get there.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
