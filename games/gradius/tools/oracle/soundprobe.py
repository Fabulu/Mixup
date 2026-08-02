#!/usr/bin/env python3
"""soundprobe.py -- drive soundprobe.lua and summarise the $ED02 driver.

RECON ONLY.  Its output is ROM-derived; out/ is gitignored.

  python games/gradius/tools/oracle/soundprobe.py --frames 900 \
      --script "200:,10:S,690:" --tag idle
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"


def run(frames: int, script: str, tag: str, verbose: bool = False):
    OUT.mkdir(parents=True, exist_ok=True)
    jf = OUT / f"snd_{tag}.json"
    if jf.exists():
        jf.unlink()
    env = {
        "SND_FRAMES": str(frames),
        "SND_SCRIPT": script,
        "SND_OUT": str(jf),
    }
    if verbose:
        env["SND_VERBOSE"] = "1"
    if os.environ.get("SND_SILENCE"):
        env["SND_SILENCE"] = "1"
    if os.environ.get("SND_POKE"):
        env["SND_POKE"] = os.environ["SND_POKE"]
    r = mesen.run_script(HERE / "soundprobe.lua", timeout_s=240, env_extra=env)
    if "END" not in r.lines:
        print(r.stdout[-4000:])
        raise SystemExit(f"script did not finish (rc={r.returncode})")
    for line in r.lines:
        if line.startswith("ERROR ="):
            raise SystemExit(line)
    return r, json.loads(jf.read_text())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=900)
    ap.add_argument("--script", default="200:,10:S,690:")
    ap.add_argument("--tag", default="run")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--hist", action="store_true", help="print driver-cycle histogram")
    a = ap.parse_args()

    r, data = run(a.frames, a.script, a.tag, a.verbose)
    for line in r.lines:
        if not line.startswith("lag.dropAtGameFrame") or a.verbose:
            print(line)

    fr = data["frames"]
    idx = {k: i for i, k in enumerate(data["fields"])}
    cyc = [f[idx["drvCyc"]] for f in fr if f[idx["drvCyc"]] > 0]
    if a.hist and cyc:
        c = Counter((v // 100) * 100 for v in cyc)
        print("driverCycles histogram (100-cycle buckets):")
        for k in sorted(c):
            print(f"  {k:5d}-{k+99:5d}  {c[k]:5d}  {'#' * min(60, c[k] // 5)}")

    # The structural question: the driver runs BEFORE the sprite-0 busy-wait at
    # $9AA3, so its cost is absorbed by the wait unless the wait has run out.
    # Report the slack directly.
    if "spin" in idx:
        sp = [f[idx["spin"]] for f in fr if f[idx["spin"]] > 0]
        pre = [f[idx["preSpin"]] for f in fr if f[idx["spin"]] > 0]
        if sp:
            sp_sorted = sorted(range(len(fr)), key=lambda i: fr[i][idx["spin"]]
                               if fr[i][idx["spin"]] > 0 else 10**9)
            print(f"frames with a sprite-0 spin: {len(sp)}/{len(fr)}")
            print(f"spinIters  min={min(sp)} mean={sum(sp)/len(sp):.1f} max={max(sp)}")
            print(f"preSpinCyc min={min(pre)} mean={sum(pre)/len(pre):.1f} max={max(pre)}")
            print("tightest 8 frames (frame, spinIters, preSpinCyc, drvCyc, nmiCyc, cmds):")
            for i in sp_sorted[:8]:
                f = fr[i]
                print(f"   f{f[idx['frame']]:5d} spin={f[idx['spin']]:4d} "
                      f"pre={f[idx['preSpin']]:6d} drv={f[idx['drvCyc']]:5d} "
                      f"nmi={f[idx['nmiCyc']]:6d} cmds={f[idx['cmds']]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
