#!/usr/bin/env python3
r"""WAVE 24 -- drive `w24move.lua`: capture ONE type-$11 mover's sub-record
position (($2,A6)/($4,A6)) at the pre-handler point every frame from spawn to
death, the dynamic verdict for the movement interpreter `$2638A6`.

    python w24moverun.py 4000 w24-mover-stage1

READER-ONLY.  Writes a TSV under `out/` (gitignored, ROM-derived).  Same labelled
interventions as W17/W22/W23 (invulnerable + auto-shot), so the corpus is
comparable.  ~3-4 min for 4000 frames (the first $11 mover dies long before).
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
    frames = int(argv[0]) if argv and argv[0].isdigit() else 4000
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w24-mover-stage1"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W24_FRAMES": str(frames),
        "W24_INPUT": BOOT,
        "W24_TSV": str(tsv),
        "W24_POKE_FROM": opt("--poke", 1250),
        # AUTO-SHOT IS DISABLED by default: a $11 mover's position is ENTIRELY
        # $2638A6's output (its handler reads/copies position but never writes it),
        # so an interpreter-only replay must match at 0 -- BUT an auto-shot bullet
        # that connects triggers a W28 hit-reaction that displaces the enemy (a
        # measured +$40 posY swing for ~4 frames).  Disabling fire isolates the
        # interpreter (this wave's scope) from W28.  Pass --fire N to re-enable.
        "W24_FIRE_FROM": opt("--fire", 99999),
        "W24_MOVE_FROM": opt("--move", 1900),
        "W24_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w24move.lua", seconds=max(600, frames // 20 + 600),
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
