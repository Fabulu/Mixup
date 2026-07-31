#!/usr/bin/env python3
"""Driver for kill.lua -- does the terrain map kill the ship, through $C2C1?

    python games/gradius/tools/oracle/kill.py --at 600
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


def run(frames, script, at, mode):
    OUT.mkdir(exist_ok=True)
    jf = OUT / f"kill-{mode}.json"
    if jf.exists():
        jf.unlink()
    env = {"K_FRAMES": str(frames), "K_SCRIPT": script, "K_JSON": str(jf),
           "K_POKEAT": str(at), "K_MODE": mode}
    r = mesen.run_script(HERE / "kill.lua", env_extra=env, timeout_s=180)
    if "END" not in r.lines:
        print("\n".join(r.lines[-20:] + r.log[-20:]))
        raise SystemExit(f"probe did not finish (rc={r.returncode})")
    return json.loads(jf.read_text())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=700)
    ap.add_argument("--script", default="200:,10:S,490:")
    ap.add_argument("--at", type=int, default=600)
    a = ap.parse_args()

    results = {}
    for mode in ("none", "hit", "miss"):
        d = run(a.frames, a.script, a.at, mode)
        h = d["hitFrames"]
        F = d["logFields"]
        i = {k: n for n, k in enumerate(F)}
        after = [r for r in d["log"] if r[i["frame"]] >= a.at]
        died = next((r[i["frame"]] for r in after if r[i["sub1B"]] == 0xA0), None)
        results[mode] = (h, died, d)
        print(f"--- mode={mode}  poked={[hex(x) for x in d['poked']]}")
        for pc in ("C2A5", "C2B5", "C2BC", "C2C1", "C1D6", "C1BF", "C24B",
                   "C290", "C31C"):
            fr = h.get(pc, [])
            near = [f for f in fr if a.at - 2 <= f <= a.at + 4]
            print(f"    ${pc}: {len(fr)} logged (cap 64), near the poke: {near}")
        print(f"    $1B == $A0 (death substate) first at frame: {died}")
        row = next((r for r in d["log"] if r[i["frame"]] == a.at), None)
        if row:
            print("    at the poke frame: " +
                  " ".join(f"{k}={row[i[k]]}" for k in F))

    hh = results["hit"][0]
    print()
    ok_hit = any(a.at <= f <= a.at + 2 for f in hh.get("C2C1", []))
    ok_miss = not any(a.at <= f <= a.at + 2
                      for f in results["miss"][0].get("C2C1", []))
    ok_none = not any(a.at <= f <= a.at + 2
                      for f in results["none"][0].get("C2C1", []))
    print(f"[{'PASS' if ok_hit else 'FAIL'}] poking the cell $C3D3 computes "
          f"makes $C2C1 (JMP $C1D6) fire")
    print(f"[{'PASS' if ok_miss else 'FAIL'}] poking one block row lower does NOT")
    print(f"[{'PASS' if ok_none else 'FAIL'}] poking nothing does NOT")


if __name__ == "__main__":
    main()
