#!/usr/bin/env python3
"""RECON 20 -- drive aimcheck.lua.  Same pinned machine, same stick script as
recon10/runaim.py's --move so the two runs are directly comparable.

  python runaimcheck.py 3600 --invuln --autofire --move --tag mv
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "oracle"))
sys.path.insert(0, str(HERE.parent / "recon10"))
import pgm  # noqa: E402
from run import build_input  # noqa: E402
from runaim import MOVE  # noqa: E402


def main() -> int:
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "aim"
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    env = {
        "R20_FRAMES": str(frames),
        "R20_INPUT": build_input(frames, "--continues" in sys.argv,
                                 "--autofire" in sys.argv)
        + (MOVE if "--move" in sys.argv else ""),
        "R20_POKE_FROM": "1990" if "--invuln" in sys.argv else "0",
        "R20_REQUIRE_BUILD": "B",
        "R20_TSV": str(out / f"{tag}.tsv"),
    }
    r = pgm.run(HERE / "aimcheck.lua", env=env,
                seconds=max(300, frames // 40), timeout=7200)
    for ln in r.lines:
        print(ln)
    if r.returncode != 0:
        print("MAME exit", r.returncode, file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
