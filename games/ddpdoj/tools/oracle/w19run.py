#!/usr/bin/env python3
r"""WAVE 19 -- drive `w19ledger.lua`: the score / chain / rank ledger, measured.

    python w19run.py 4600 w19-play
    python w19run.py 4600 w19-play-noinvuln --poke 0

READER-ONLY with respect to the port: it runs the board and writes a TSV under
`out/` (gitignored -- ROM-derived).  It adds no oracle command; `pgm.py` stays
the ONE entry point for the machine, so -noreadconfig / -nowriteconfig / the
private cfg and nvram directories / the machine pin all come from there.

THE INTERVENTION IS IN THE FILENAME AND IN THE LUA BANNER.
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
    frames = int(argv[0]) if argv and argv[0].isdigit() else 4600
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w19-play"

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else str(default)

    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W19_FRAMES": str(frames),
        "W19_INPUT": BOOT,
        "W19_TSV": str(tsv),
        "W19_POKE_FROM": opt("--poke", 1250),
        "W19_FIRE_FROM": opt("--fire", 1800),
        "W19_MOVE_FROM": opt("--move", 1900),
        "W19_BOMB_EVERY": opt("--bomb-every", 600),
        "W19_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w19ledger.lua", seconds=max(600, frames // 20 + 600),
                env=env, timeout=7200)
    log = out / f"{tag}.log"
    log.write_text("\n".join(r.lines), encoding="utf8")
    for ln in r.lines:
        print(ln)
    print(f"TSV {tsv}  ({tsv.stat().st_size if tsv.exists() else 0} B)")
    print(f"LOG {log}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
