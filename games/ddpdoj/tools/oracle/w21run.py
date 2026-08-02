#!/usr/bin/env python3
r"""WAVE 21 -- drive `w21bullets.lua`: every enemy-bullet spawn, write for write.

    python w21run.py 6000 w21-bullets-play                 THE PLAYING RUN (default)
    python w21run.py 9500 w21-bullets-invuln --poke 1250   the coverage run
    python w21run.py 6000 w21-bullets-fan --rank 1900      **$813098 POKED**

READER-ONLY with respect to the port: it runs the board and writes a TSV under
`out/` (gitignored -- ROM-derived).  `pgm.py` stays the ONE entry point for the
machine, so -noreadconfig / the private cfg and nvram directories / the machine
pin all come from there.

THE DEFAULT IS THE ON-DISTRIBUTION RUN: no invulnerability, no rank poke.  The
ship fires, kills, bombs and can die.  `--rank N` is the ONE intervention that
can exercise a multi-bullet arm at all -- `$813098` has read 0 on every frame
this project has ever measured -- and every row of the TSV carries the rank word
it was taken under so the gate never mixes a poked spawn with an unpoked one.
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
    tag = (argv[1] if len(argv) > 1 and not argv[1].startswith("-")
           else "w21-bullets-play")

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W21_FRAMES": str(frames),
        "W21_INPUT": BOOT,
        "W21_TSV": str(tsv),
        "W21_POKE_FROM": opt("--poke", 0),
        "W21_RANK_FROM": opt("--rank", 0),
        "W21_FIRE_FROM": opt("--fire", 1800),
        "W21_MOVE_FROM": opt("--move", 1900),
        "W21_BOMB_EVERY": opt("--bomb-every", 900),
        "W21_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w21bullets.lua", seconds=max(600, frames // 20 + 600),
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
