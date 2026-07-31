#!/usr/bin/env python3
"""Narrow the RANK candidate set from a series of main-RAM snapshots.

docs/knowledge/08-rank-and-dynamic-difficulty.md asks seven questions about rank
and warns that the corpus will silently never vary it. Step zero is finding the
byte. This does the arithmetic half; the listing half is xref.py.

Feed it snapshots taken by ramsnap.lua from ONE continuous play, in frame order.
A rank-like variable is:

  * SLOW      -- changes on few of the samples, not every frame;
  * MONOTONE  -- goes up through a stage (and the ones that also come back down
                 are the interesting second code path: "can it go down?");
  * SMALL     -- lives in a byte or a word with a handful of distinct values,
                 not a 32-bit score or a position;
  * NOT a copy of a counter that is already explained.

It reports each class separately and prints how many addresses it dropped, per
`03-checks-that-can-fail.md`'s "report what was skipped".

THIS IS A CANDIDATE GENERATOR, NOT AN ANSWER. Every address it prints still has
to be confirmed by forcing the value and watching the game, and its readers
enumerated from the listing.
"""
from __future__ import annotations

import argparse
from pathlib import Path

BASE = 0x800000


def load(paths: list[Path]) -> list[bytes]:
    out = []
    for p in paths:
        b = p.read_bytes()
        if len(b) != 0x20000:
            raise SystemExit(f"{p}: expected 131072 bytes, got {len(b)}")
        out.append(b)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("snaps", nargs="+", type=Path, help="in frame order")
    ap.add_argument("--width", type=int, choices=(1, 2), default=2)
    ap.add_argument("--max-distinct", type=int, default=12)
    ap.add_argument("--top", type=int, default=60)
    a = ap.parse_args()

    snaps = load(a.snaps)
    n = len(snaps)
    if n < 3:
        raise SystemExit("need at least 3 snapshots for a monotonicity claim")

    step = a.width
    constant = changed = noisy = 0
    monotone_up, monotone_down, other = [], [], []

    for off in range(0, 0x20000, step):
        if a.width == 1:
            vals = [s[off] for s in snaps]
        else:
            vals = [(s[off] << 8) | s[off + 1] for s in snaps]
        if len(set(vals)) == 1:
            constant += 1
            continue
        changed += 1
        if len(set(vals)) > a.max_distinct:
            noisy += 1
            continue
        ups = sum(1 for i in range(1, n) if vals[i] > vals[i - 1])
        downs = sum(1 for i in range(1, n) if vals[i] < vals[i - 1])
        rec = (BASE + off, vals)
        if downs == 0:
            monotone_up.append(rec)
        elif ups == 0:
            monotone_down.append(rec)
        else:
            other.append(rec)

    print(f"# snapshots={n} width={a.width}")
    print(f"# addresses constant across all snapshots : {constant}")
    print(f"# addresses that changed                  : {changed}")
    print(f"#   of those, dropped as noisy (>{a.max_distinct} distinct values): {noisy}")
    print(f"#   monotone increasing : {len(monotone_up)}")
    print(f"#   monotone decreasing : {len(monotone_down)}")
    print(f"#   non-monotone        : {len(other)}")
    for name, lst in (("MONOTONE-UP", monotone_up),
                      ("MONOTONE-DOWN", monotone_down)):
        print(f"\n=== {name} (first {a.top} of {len(lst)}) ===")
        for addr, vals in lst[: a.top]:
            print(f"  ${addr:06X}  " + " ".join(f"{v:>5}" for v in vals))
        if len(lst) > a.top:
            print(f"  ... {len(lst) - a.top} more NOT SHOWN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
