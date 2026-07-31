#!/usr/bin/env python3
"""enemyprobe.py -- driver for enemyprobe.lua.

Runs the cartridge headless, then prints what was measured about the enemy
system.  Nothing here is read out of a disassembly; every number printed came
back from the emulator.

    python games/gradius/tools/oracle/enemyprobe.py --frames 900 \
        --script "200:,10:S,690:" --slots 400:8
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=900)
    ap.add_argument("--script", default="200:,10:S,690:")
    ap.add_argument("--slots", default="", help="FIRST:COUNT of frames to dump all 32 slots")
    ap.add_argument("--poke", default="")
    ap.add_argument("--watchzp", default="")
    ap.add_argument("--json", default=str(OUT / "enemy.json"))
    ap.add_argument("--timeline", action="store_true")
    ap.add_argument("--dumpslots", action="store_true")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    jp = Path(a.json).resolve()
    if jp.exists():
        jp.unlink()

    sf, sn = "0", "0"
    if a.slots:
        sf, sn = a.slots.split(":")

    env = {
        "EP_FRAMES": str(a.frames),
        "EP_SCRIPT": a.script,
        "EP_JSON": str(jp),
        "EP_SLOTFROM": sf,
        "EP_SLOTN": sn,
        "EP_POKE": a.poke,
        "EP_WATCHZP": a.watchzp,
    }
    run = mesen.run_script(HERE / "enemyprobe.lua", timeout_s=240, env_extra=env)
    for line in run.lines:
        print(line)
    if "END" not in run.lines:
        print("!! no END line -- the script died mid-callback", file=sys.stderr)
        print("\n".join(run.log[-20:]), file=sys.stderr)
        return 1
    if not jp.exists():
        print(f"!! {jp} was not written", file=sys.stderr)
        return 1

    data = json.loads(jp.read_text())
    fields = data["fields"]
    frames = data["frames"]

    if a.timeline:
        prev = None
        print("\n--- frames where enemy occupancy or the wave pointer changed ---")
        print("frame  occMask   nEnemy  $3F:$3E  $60 $61 $5D $69 $6B:$6A $6C  waveFire alloc(P/Q/R/S ok:fail)")
        for r in frames:
            key = (r["enemyOcc"], r["z6A"], r["z6B"], r["z60"], r["z61"], r["z69"], r["z6C"])
            if key != prev:
                print("%5d  %08X  %3d     %02X:%02X    %3d %3d %3d %3d  %02X%02X   %3d   f=%d  %d:%d %d:%d %d:%d %d:%d" % (
                    r["frame"], r["occ"], r["enemyOcc"], r["z3F"], r["z3E"],
                    r["z60"], r["z61"], r["z5D"], r["z69"], r["z6B"], r["z6A"], r["z6C"],
                    r["waveFire"],
                    r["allocP_ok"], r["allocP_fail"], r["allocQ_ok"], r["allocQ_fail"],
                    r["allocR_ok"], r["allocR_fail"], r["allocS_ok"], r["allocS_fail"]))
                prev = key

    if a.dumpslots and data.get("slotRows"):
        print("\n--- all 32 slots: status:anim:type:Y:X ---")
        for r in data["slotRows"]:
            print("frame %d" % r["frame"])
            cells = r["s"].split(",")
            for i, c in enumerate(cells):
                st, an, ty, y, x = c.split(":")
                if st != "0" or an != "0" or ty != "0":
                    print("   slot %2d  status=%3s anim=%3s type=%3s  Y=%3s X=%3s" % (i, st, an, ty, y, x))

    # totals that matter, recomputed on this side from the per-frame rows
    tot = {}
    for k in fields:
        if k in ("frame", "occ", "alive", "enemyOcc") or k.startswith(("z", "player", "w")):
            continue
        tot[k] = sum(r[k] for r in frames)
    print("\n--- recomputed from per-frame rows (must match the total.* lines above) ---")
    for k in sorted(tot):
        print("  %-14s %d" % (k, tot[k]))

    maxe = max(r["enemyOcc"] for r in frames)
    print("\nmax simultaneous enemy slots occupied: %d of 10" % maxe)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
