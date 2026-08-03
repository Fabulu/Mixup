#!/usr/bin/env python3
r"""WAVE 25 -- drive `w25handler.lua`: capture EVERY six-handler enemy's
sub-record position (($2,A6)/($4,A6)) at the pre-handler point every frame from
spawn to death, the dynamic verdict for the six enemy handlers.

    python w25run.py 5000 w25-handler-stage1

READER-ONLY.  Writes a TSV under `out/` (gitignored, ROM-derived).  Same labelled
interventions as W17/W22/W23/W24 (invulnerable + auto-shot), so the corpus is
comparable.  AUTO-SHOT DISABLED by default (isolates movement from the W28
hit-reaction, as W24 F6 measured); pass --fire N to re-enable.  ~3-4 min for
5000 frames.
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
    frames = int(argv[0]) if argv and argv[0].isdigit() else 5000
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w25-handler-stage1"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W25_FRAMES": str(frames),
        "W25_INPUT": BOOT,
        "W25_TSV": str(tsv),
        "W25_POKE_FROM": opt("--poke", 1250),
        "W25_FIRE_FROM": opt("--fire", 99999),   # auto-shot DISABLED by default
        "W25_MOVE_FROM": opt("--move", 1900),
        "W25_REQUIRE_BUILD": "B",
        "W25_MAX_TRACK": opt("--maxtrack", 48),
    }
    r = pgm.run(HERE / "w25handler.lua", seconds=max(600, frames // 20 + 600),
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
