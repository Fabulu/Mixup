#!/usr/bin/env python3
r"""WAVE 20 -- drive `w20turret.lua`: the first enemies' turret angle, per frame.

    python w20run.py 6000 w20-turret-play              THE PLAYING RUN (default)
    python w20run.py 9500 w20-turret-invuln --poke 1250    the coverage run

READER-ONLY with respect to the port: it runs the board and writes a TSV under
`out/` (gitignored -- ROM-derived).  It adds no oracle command; `pgm.py` stays
the ONE entry point for the machine, so -noreadconfig / -nowriteconfig / the
private cfg and nvram directories / the machine pin all come from there.

THE DEFAULT IS THE ON-DISTRIBUTION RUN.  `--poke 0` (the default) means NO
invulnerability: the ship fires, kills, bombs and can die.
`20-OWNER-scenarios-must-play.md` §2 and docs/knowledge/09 both say to prefer it
-- an invulnerable run is valid only for coverage.  The tag goes in the
filename and the Lua banner prints which kind the run is.
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
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w20-turret-play"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W20_FRAMES": str(frames),
        "W20_INPUT": BOOT,
        "W20_TSV": str(tsv),
        "W20_POKE_FROM": opt("--poke", 0),
        "W20_FIRE_FROM": opt("--fire", 1800),
        "W20_MOVE_FROM": opt("--move", 1900),
        "W20_BOMB_EVERY": opt("--bomb-every", 900),
        "W20_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w20turret.lua", seconds=max(600, frames // 20 + 600),
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
