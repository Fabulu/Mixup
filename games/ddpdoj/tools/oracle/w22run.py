#!/usr/bin/env python3
r"""WAVE 22 -- drive `w22spawn.lua`: the enemy spawn walker over the whole of
stage 1, under the same labelled interventions as the wave-17 corpus.

    python w22run.py 16000 w22-spawn-stage1
    python w22run.py 2200 smoke

READER-ONLY with respect to the port: it runs the board and writes a TSV under
`out/` (gitignored -- ROM-derived).  It adds no oracle command; `pgm.py` stays
the ONE entry point for the machine and this script goes through `pgm.run`, so
-noreadconfig / -nowriteconfig / the private cfg and nvram directories / the
machine pin all come from there unchanged.

THE INTERVENTIONS ARE LABELLED.  Anything this run measures is "invulnerable,
auto-shot" evidence -- valid for coverage (which spawns land, in what order),
invalid for pacing/density (docs/knowledge/09).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pgm  # noqa: E402

# The version-B chooser + coin + start, from the ONE place it is defined.
BOOT = json.loads((HERE / "scenarios.json").read_text(encoding="utf8")
                  )["bootPrefix"]["versionB"]


def main() -> int:
    argv = sys.argv[1:]
    frames = int(argv[0]) if argv and argv[0].isdigit() else 16000
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w22-spawn-stage1"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W22_FRAMES": str(frames),
        "W22_INPUT": BOOT,
        "W22_TSV": str(tsv),
        "W22_POKE_FROM": opt("--poke", 1250),
        "W22_FIRE_FROM": opt("--fire", 1800),
        "W22_MOVE_FROM": opt("--move", 1900),
        "W22_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w22spawn.lua", seconds=max(600, frames // 20 + 600),
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
