#!/usr/bin/env python3
r"""WAVE 17 -- drive `w17stage.lua`: the whole of stage 1, invulnerable.

    python w17run.py 9500 stage1-invuln
    python w17run.py 2200 smoke --poke 1250 --fire 1800

READER-ONLY with respect to the port: it runs the board and writes a TSV under
`out/` (gitignored -- ROM-derived).  It adds no oracle command; `pgm.py` stays
the ONE entry point for the machine (games/ddpdoj/tools/oracle/pgm.py) and this
script goes through `pgm.run`, so -noreadconfig / -nowriteconfig / the private
cfg and nvram directories / the machine pin all come from there unchanged.

THE INTERVENTIONS ARE LABELLED IN THE FILENAME AND IN THE LUA BANNER.  Anything
this run measures is "invulnerable, auto-shot" evidence -- valid for coverage,
invalid for pacing (docs/knowledge/09).
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
    frames = int(argv[0]) if argv and argv[0].isdigit() else 9500
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w17-stage1-invuln"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W17_FRAMES": str(frames),
        "W17_INPUT": BOOT,
        "W17_TSV": str(tsv),
        "W17_POKE_FROM": opt("--poke", 1250),
        "W17_FIRE_FROM": opt("--fire", 1800),
        "W17_MOVE_FROM": opt("--move", 1900),
        "W17_COIN_EVERY": opt("--coin-every", 0),
        "W17_REQUIRE_BUILD": "B",
    }
    if "--no-invuln" in argv:          # the RED control: the same run without
        env["W17_POKE_FROM"] = "0"     # the intervention, so it can be seen to
                                       # matter rather than assumed to
    r = pgm.run(HERE / "w17stage.lua", seconds=max(600, frames // 20 + 600),
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
