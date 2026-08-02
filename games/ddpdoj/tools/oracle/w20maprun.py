#!/usr/bin/env python3
"""Driver for w20maprec.lua -- the WHOLE-STAGE map-write measurement.

  python w20maprun.py 10000 --tag whole

Same pinned machine as every other ddpdoj measurement (tools/oracle/pgm.py:
-noreadconfig, private -cfg_directory, -nonvram_save).  Boot prefix and the
autofire/continue/invulnerability interventions are recon20b/run.py's, which is
the only corpus that has reached the stage-1 boss.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pgm  # noqa: E402

BOOT = json.loads((HERE / "scenarios.json").read_text(encoding="utf8")
                  )["bootPrefix"]["versionB"]


def build_input(frames):
    parts = [BOOT, "1800=C"]
    lf = 1400
    while lf < frames:                       # keep the credit alive
        parts += ["%d=N" % lf, "%d=C" % (lf + 10),
                  "%d=S" % (lf + 20), "%d=C" % (lf + 30)]
        lf += 600
    return ";".join(parts)


def main():
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "whole"
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    env = {
        "W20_FRAMES": str(frames),
        "W20_INPUT": build_input(frames),
        "W20_POKE_FROM": "1990",
        "W20_OUT": str(out / ("w20map-%s.tsv" % tag)),
    }
    r = pgm.run(HERE / "w20maprec.lua", env=env,
                seconds=max(400, frames // 30), timeout=7200)
    for ln in r.lines:
        print(ln)
    if r.returncode != 0:
        print("MAME exit", r.returncode, file=sys.stderr)
        print(r.stderr[-3000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
