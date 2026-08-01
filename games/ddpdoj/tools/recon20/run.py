#!/usr/bin/env python3
"""RECON 20 driver -- same pinned machine as recon10/run.py (tools/oracle/pgm.py).

  python run.py 6000 --autofire --invuln --continues --tag still
  python run.py 6000 --autofire --invuln --continues --move --tag move
"""
import sys
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "oracle"))
import pgm  # noqa: E402

BOOT = json.loads((HERE.parent / "oracle" / "scenarios.json").read_text(
    encoding="utf8"))["bootPrefix"]["versionB"]

SEQ = ["L", "L", "R", "R", "U", "D", "L", "R"]


def build_input(frames, continues, autofire, move):
    parts = [BOOT]
    fire = "C" if autofire else ""
    if autofire:
        parts.append("1800=C")
    if move:
        lf = 2000
        i = 0
        while lf < frames:
            parts.append("%d=%s%s" % (lf, SEQ[i % len(SEQ)], fire))
            i += 1
            lf += 37
    if continues:
        lf = 1400
        while lf < frames:
            parts.append("%d=N" % lf)
            parts.append("%d=%s" % (lf + 10, fire))
            parts.append("%d=S" % (lf + 20))
            parts.append("%d=%s" % (lf + 30, fire))
            lf += 600
    return ";".join(parts)


def main():
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "r20"
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    env = {
        "R20_FRAMES": str(frames),
        "R20_INPUT": build_input(frames, "--continues" in sys.argv,
                                 "--autofire" in sys.argv, "--move" in sys.argv),
        "R20_POKE_FROM": "1990" if "--invuln" in sys.argv else "0",
        "R20_ROWTSV": str(out / ("%s-spawn.tsv" % tag)),
    }
    r = pgm.run(HERE / "recon20.lua", env=env,
                seconds=max(300, frames // 40), timeout=7200)
    for ln in r.lines:
        print(ln)
    if r.returncode != 0:
        print("MAME exit", r.returncode, file=sys.stderr)
        print(r.stderr[-3000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
