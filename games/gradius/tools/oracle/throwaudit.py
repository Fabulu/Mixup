#!/usr/bin/env python3
"""throwaudit.py -- driver for throwaudit.lua.  WAVE 12.

WHICH UNPORTED PATHS DOES A PLAYER ACTUALLY REACH?

Every loud named throw in games/gradius/src/ carries the ROM address it would
have reached.  This drives the CARTRIDGE with long, varied input and counts how
often each of those addresses executes.  Non-zero = a player can reach it.

    python games/gradius/tools/oracle/throwaudit.py                 # all runs
    python games/gradius/tools/oracle/throwaudit.py --only deep
    python games/gradius/tools/oracle/throwaudit.py --frames 4000 \
        --script "200:,3800:RD" --name custom

READ THE ZEROES CORRECTLY.  A zero here is NOT "the game does not do this".  It
is "these N frames of these M scripts did not do this", which is the same shape
of statement that produced two crashes in ordinary play
(docs/worklog/gradius/05-FINDING and 06-FINDING).  The output prints the frame
budget next to every zero for exactly that reason.

Nothing here is committed; out/ is gitignored.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

# --------------------------------------------------------------------------
# THE RUNS.  Each is (name, frames, script, poke, why).
#
# The scripts are not decoration.  Stage 1's opening kills almost anything that
# is not in a corner -- MEASURED first death per 1460-frame hold, from frame
# 210: idle 1051, R 493, RU 445, U 1076, L 1083, LD 1098, LU 1108, D 1066, RD
# 1866 (docs/worklog/gradius/scenarios.json `enemy-waves` and `deep-page3`).  So
# "vary the input" cannot mean "mash buttons": a run that dies at frame 500 has
# measured 500 frames and nothing past scroll $00F0.  The long runs below reuse
# the trajectory the corpus already measured as SURVIVING, and the short ones
# deliberately do the things the survivor cannot (fly left, hug the floor).
# --------------------------------------------------------------------------
#
# EVERY SCRIPT STARTS WITH THE CORPUS'S OWN BOOT PREFIX, `200:,10:S,190:`.
# It is not decoration either: MEASURED, a script that never presses START
# leaves the machine in the ATTRACT DEMO, which is mode-5 gameplay with $09 set
# and the pause cheat already granted ($9C5E at f414, $45 = 2, $46 = 5,
# $41 = 1, $17 = 3 for the whole run). The first version of this file did that
# and produced a table full of hits that were the demo playing itself.
BOOT = "200:,10:S,190:"

RUNS = [
    ("deep-survivor", 6000, BOOT + ",1350:RD,324:RU,80:RD,3846:R", "",
     "the deep-page3/deep-page4 trajectory, run four times longer than any "
     "scenario: the only script measured to survive stage 1's opening and "
     "keep scrolling"),
    ("deep-autofire", 6000, BOOT + ",1350:RDA,324:RUA,80:RDA,3846:RA", "",
     "the same, with A held -- kills, capsules, score, and every arm of the "
     "shot-vs-enemy sweep"),
    ("deep-powered", 6000, BOOT + ",1350:RDA,324:RUA,80:RDA,3846:RA",
     "0044=2,0045=2,0046=5,0041=1",
     "the same again with the power-ups the rank byte $17 is built from held "
     "on: $44 = 2 DOUBLE, $45 = 2 Options, $46 = 5 shield, $41 = 1 missiles. "
     "$17 = ($44 != 0) + $45 + ($46 != 0) + ($19 != 0) = 4, which is the ONLY "
     "way past $BBE5's `$17 >= 3` -- the brief's point that an unforced run "
     "reaches rank 0-1"),
    ("left-hugger", 2000, BOOT + ",1600:L", "",
     "fly LEFT, the input that first reached $BC59 in ordinary play"),
    ("floor-hugger", 2000, BOOT + ",1600:D", "",
     "hug the floor, the input most likely to reach terrain arms"),
    ("wander", 3000, BOOT + "," + ",".join(
        f"120:{d}" for d in ("R", "D", "L", "U", "RD", "LU", "RU", "LD") * 3), "",
     "a genuinely varied wander -- it dies early and often, which is itself "
     "part of ordinary play (deaths, respawns, checkpoints)"),
    ("die-thrice", 2400, BOOT + ",2000:U", "",
     "hold UP: dies repeatedly, so this is the run that walks the lives "
     "counter down toward $97F1 / game over"),
]


def one(name, frames, script, poke, quiet=False):
    OUT.mkdir(parents=True, exist_ok=True)
    jp = (OUT / f"throwaudit-{name}.json").resolve()
    if jp.exists():
        jp.unlink()
    env = {"TA_FRAMES": str(frames), "TA_SCRIPT": script,
           "TA_JSON": str(jp), "TA_POKE": poke}
    run = mesen.run_script(HERE / "throwaudit.lua", timeout_s=900, env_extra=env)
    if "END" not in run.lines:
        print(f"!! {name}: no END line -- the script died mid-callback",
              file=sys.stderr)
        print("\n".join(run.log[-20:]), file=sys.stderr)
        return None
    data = json.loads(jp.read_text())
    if not quiet:
        for line in run.lines:
            print(f"  {name}: {line}")
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--frames", type=int, default=0)
    ap.add_argument("--script", default="")
    ap.add_argument("--poke", default="")
    ap.add_argument("--name", default="custom")
    a = ap.parse_args()

    runs = RUNS
    if a.script:
        runs = [(a.name, a.frames or 3000, a.script, a.poke, "ad hoc")]
    elif a.only:
        runs = [r for r in RUNS if a.only in r[0]]
        if not runs:
            raise SystemExit(f"no run matches {a.only!r}; "
                             f"have {[r[0] for r in RUNS]}")

    results, total = {}, 0
    for name, frames, script, poke, why in runs:
        print(f"\n=== {name}: {frames} frames -- {why}")
        d = one(name, frames, script, poke)
        if d is None:
            return 1
        results[name] = d
        total += d["frames"]

    # ---- the table ------------------------------------------------------
    names = list(results)
    hooks = results[names[0]]["hooks"]
    w = max(len(h["name"]) for h in hooks)
    print(f"\n=== EXEC HITS over {total} cartridge frames, "
          f"{len(names)} run(s) ===")
    print(f"{'rom':>5}  {'throw / handler'.ljust(w)}  "
          + "  ".join(f"{n[:13]:>13}" for n in names) + "   TOTAL")
    for i, h in enumerate(hooks):
        row = []
        tot = 0
        for n in names:
            e = results[n]["hooks"][i]
            tot += e["n"]
            row.append(f"{e['n']:>8}@{e['first'] if e['first'] is not None else '-':>4}")
        print(f"${h['rom']}  {h['name'].ljust(w)}  " + "  ".join(row)
              + f"   {tot:>6}")

    print(f"\n=== RAM GATES (distinct values seen, with frame counts) ===")
    gate_names = {
        "0018": "$18 player index (two-player throws)",
        "0019": "$19 stage (stage-5 throws)",
        "001A": "$1A stage sub-index ($BC44, $BBC3)",
        "003A": "$3A stage-advance gate ($A2C4 -> $C413)",
        "001B": "$1B mode-5 sub-state",
        "005C": "$5C stage-5 half-rate census",
        "0017": "$17 power-up rank ($BBE5 needs >= 3)",
        "0042": "$42 power-up meter ($8984's seven arms)",
        "0044": "$44 weapon", "0045": "$45 options", "0046": "$46 shield",
        "000E": "$0E VRAM queue cursor ($88E5 needs >= 4)",
        "0020": "$20 lives ($97F1 at < 0)",
        "000D": "$0D blank counter", "0060": "$60 spawn state",
        "0041": "$41 missiles",
        "0009": "$09 attract-demo flag ($8473 suppresses scoring)",
        "0033": "$33 button-code cursor ($9C5E at $0A)",
        "0360": "$0360 player X, 0 or not ($C3AD's fall-through)",
    }
    merged = {}
    for n in names:
        for addr, hist in results[n]["gates"].items():
            m = merged.setdefault(addr, {})
            for k, v in hist.items():
                m[int(k)] = m.get(int(k), 0) + v
    for addr in sorted(merged):
        vals = ", ".join(f"{k}x{v}" for k, v in sorted(merged[addr].items()))
        print(f"  {gate_names.get(addr, addr):<44} {vals}")

    print(f"\n  max scroll reached: "
          + ", ".join(f"{n}=${results[n]['maxScroll']:04X}" for n in names))
    print("\n  A ZERO ABOVE IS NOT ABSENCE. It is "
          f"{total} frames of {len(names)} script(s) that did not reach it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
