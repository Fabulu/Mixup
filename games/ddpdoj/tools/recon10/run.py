#!/usr/bin/env python3
"""RECON 10 driver -- reuses tools/oracle/pgm.py's pinned machine (forward-slash
rompath, private cfg/nvram, -noreadconfig/-nowriteconfig, the VERSION-B boot
prefix) rather than rebuilding an invocation.  Nothing here re-derives the
machine; it only adds the recon-10 probe and a longer input script.

  python run.py 3000                       3000 logic frames, coast
  python run.py 9000 --continues           insert a coin + start every 600 lf
"""
import sys, os, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "oracle"))
import pgm  # noqa: E402


# pgm.BOOT_B stops at START; the ship-select taps live only in scenarios.json's
# `bootPrefix.versionB`.  Read it from there rather than retyping it -- a run
# with pgm.BOOT_B alone sits on the ship-select screen forever and censuses
# nothing (measured: 3,000 logic frames, 0 enemies, $8130CE == 0 throughout).
BOOT = json.loads((HERE.parent / "oracle" / "scenarios.json").read_text(
    encoding="utf8"))["bootPrefix"]["versionB"]


def build_input(frames: int, continues: bool, autofire: bool) -> str:
    parts = [BOOT]
    if autofire:
        # Button 3 is AUTO-SHOT ($2497B2 synthesises a shot edge on alternate
        # frames), so holding C is the cheapest way to let the run actually
        # kill things and reach the death/score paths.
        parts.append("1800=C")
    if continues:
        # Coin, then Start, on a 600-logic-frame cadence.  During play START is
        # inert and a coin only adds credit; on the CONTINUE screen the pair is
        # what keeps the stage-1 script advancing instead of falling out to the
        # attract loop.  This is an INTERVENTION and is labelled as one.
        lf = 1400
        while lf < frames:
            parts.append(f"{lf}=N")
            parts.append(f"{lf + 10}=")
            parts.append(f"{lf + 20}=S")
            parts.append(f"{lf + 30}=")
            lf += 600
    return ";".join(parts)


def main() -> int:
    frames = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    cont = "--continues" in sys.argv
    auto = "--autofire" in sys.argv
    poke = "--invuln" in sys.argv
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "r10"
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    env = {
        "R10_FRAMES": str(frames),
        "R10_INPUT": build_input(frames, cont, auto),
        "R10_POKE_FROM": "1990" if poke else "0",
        "R10_REQUIRE_BUILD": "B",
        "R10_AIMTSV": str(out / f"{tag}-aim.tsv"),
        "R10_TIMETSV": str(out / f"{tag}-time.tsv"),
    }
    r = pgm.run(HERE / "recon10.lua", env=env,
                seconds=max(300, frames // 40), timeout=7200)
    for ln in r.lines:
        print(ln)
    if r.returncode != 0:
        print("MAME exit", r.returncode, file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
