#!/usr/bin/env python3
r"""WAVE 23 -- drive `w23spawn.lua`: capture the spawn-time enemy stats fields
over the whole of stage 1, under the same labelled interventions as W17/W22.

    python w23run.py 16000 w23-stats-stage1
    python w23run.py 2200 smoke

READER-ONLY.  Writes a TSV under `out/` (gitignored, ROM-derived).  Goes through
`pgm.run`, so -noreadconfig / -nowriteconfig / the private cfg and nvram
directories / the machine pin all come from there unchanged.

THE INTERVENTIONS ARE LABELLED (invulnerable + auto-shot) -- valid for the
spawn-time STATS (which are rank/stage-driven, not player-position-driven except
for the five aim->bucket types), invalid for pacing/density.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pgm  # noqa: E402

BOOT = json.loads((HERE / "scenarios.json").read_text(encoding="utf8")
                  )["bootPrefix"]["versionB"]


def main() -> int:
    argv = sys.argv[1:]
    frames = int(argv[0]) if argv and argv[0].isdigit() else 16000
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w23-stats-stage1"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W23_FRAMES": str(frames),
        "W23_INPUT": BOOT,
        "W23_TSV": str(tsv),
        "W23_POKE_FROM": opt("--poke", 1250),
        "W23_FIRE_FROM": opt("--fire", 1800),
        "W23_MOVE_FROM": opt("--move", 1900),
        "W23_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w23spawn.lua", seconds=max(600, frames // 20 + 600),
                env=env, timeout=7200)
    for ln in r.lines:
        print(ln)
    print(f"TSV {tsv}  ({tsv.stat().st_size if tsv.exists() else 0} B)")
    if not r.lines:
        print(r.stdout[-4000:], file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
    return 0 if r.lines and not any(l.startswith("FAIL") for l in r.lines) else 1


if __name__ == "__main__":
    raise SystemExit(main())
