#!/usr/bin/env python3
r"""WAVE 18 -- drive `w18elem.lua`: the BG-element window, invulnerable.

    python w18run.py 3500 w18-elem

Reader-only wrt the port: runs the board, writes a TSV under out/ (gitignored,
ROM-derived).  Goes through `pgm.run` so the ONE machine entry point supplies
-noreadconfig / -nowriteconfig / private cfg+nvram / the pin unchanged.  Same
labelled interventions as w17run.py (invuln + autopilot); the recording adds
$813170 (scrollPrev) and bucket-2's staged bytes to the wave-17 columns.
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
    frames = int(argv[0]) if argv and argv[0].isdigit() else 3500
    tag = argv[1] if len(argv) > 1 and not argv[1].startswith("-") else "w18-elem"
    out = HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{tag}.tsv"
    env = {
        "W17_FRAMES": str(frames),
        "W17_INPUT": BOOT,
        "W17_TSV": str(tsv),
        "W17_POKE_FROM": "1250",
        "W17_FIRE_FROM": "1800",
        "W17_MOVE_FROM": "1900",
        "W17_REQUIRE_BUILD": "B",
    }
    r = pgm.run(HERE / "w18elem.lua", seconds=max(600, frames // 20 + 600),
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
