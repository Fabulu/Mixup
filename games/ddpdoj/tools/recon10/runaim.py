#!/usr/bin/env python3
"""RECON 10 -- drive aimprobe.lua.  Same pinned machine as run.py.

  python runaim.py 4200 --invuln --autofire
"""
import sys, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "oracle"))
import pgm  # noqa: E402
from run import build_input  # noqa: E402


# A stick script that sweeps the ship across the whole playfield, so the aim's
# INPUT is not a constant.  Deliberately the SAME cadence as `fly-around`'s so
# the two runs are comparable.
MOVE = ";" + ";".join(
    f"{lf}={d}" for lf, d in
    [(2000, "CU"), (2130, "CD"), (2280, "C"), (2320, "CL"), (2420, "C"),
     (2440, "CR"), (2540, "C"), (2560, "CUR"), (2660, "C"), (2680, "CDL"),
     (2780, "C"), (2800, "CUL"), (2900, "C"), (2920, "CDR"), (3020, "C"),
     (3040, "CU"), (3080, "CL"), (3120, "CD"), (3160, "CR"), (3200, "C"),
     (3400, "CL"), (3460, "CU"), (3520, "CR"), (3580, "CD"), (3640, "C"),
     (3700, "CU"), (3760, "CD"), (3820, "C"), (3900, "CL"), (3960, "CR"),
     (4020, "C"), (4060, "CU"), (4090, "C"), (4120, "CD"), (4180, "C")])


def main() -> int:
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "aim"
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    env = {
        "R10_FRAMES": str(frames),
        "R10_INPUT": build_input(frames, "--continues" in sys.argv,
                                 "--autofire" in sys.argv)
        + (MOVE if "--move" in sys.argv else ""),
        "R10_POKE_FROM": "1990" if "--invuln" in sys.argv else "0",
        "R10_REQUIRE_BUILD": "B",
        "R10_PCTSV": str(out / f"{tag}-pc.tsv"),
    }
    r = pgm.run(HERE / "aimprobe.lua", env=env,
                seconds=max(300, frames // 40), timeout=7200)
    for ln in r.lines:
        print(ln)
    if r.returncode != 0:
        print("MAME exit", r.returncode, file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
