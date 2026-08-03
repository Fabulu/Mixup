#!/usr/bin/env python3
r"""WAVE 26 -- drive `w26mover.lua`: capture the bullet pool BEFORE and AFTER the
mover `$281DDE` every frame, the dynamic verdict for the bullet MOVER.

The gate seeds the port from BEFORE, runs `runMover` once, compares to AFTER --
isolating the mover from the spawn side entirely.

    python w26run.py 6000 w26-mover-stage1

READER-ONLY.  Writes a TSV under `out/` (gitignored, ROM-derived).  Same labelled
interventions as W17/W21 (a PLAYING run by default; --invuln N for an
invulnerable coverage run).  ~5-7 min for 6000 frames.
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
    frames = int(argv[0]) if argv and argv[0].isdigit() else 6000
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w26-mover-stage1"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W26_FRAMES": str(frames),
        "W26_INPUT": BOOT,
        "W26_TSV": str(tsv),
        "W26_INVULN_FROM": opt("--invuln", 0),
        "W26_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w26mover.lua", seconds=max(600, frames // 15 + 600),
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
