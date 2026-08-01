#!/usr/bin/env python3
"""bulletprobe.py -- driver for bulletprobe.lua (wave 11, enemy bullets).

Answers, from the cartridge and not from the listing:
  * which scripts reach $BC59 at all, and on which frame;
  * what the allocator, the aim vector and the mover DO with the slots;
  * what happens when allocation FAILS ($BC63).

    python games/gradius/tools/oracle/bulletprobe.py --frames 900 \
        --script "200:,10:S,690:L" --hits

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

ARGFIELDS = {
    0xBC44: ["frame", "enemyIdx", "playerX", "enemyX", "enemyY", "type",
             "status", "muzzle$0496", "count$040C", "reload$04EC"],
    0xBC59: ["frame", "enemyIdx", "playerX", "enemyX", "enemyY", "type",
             "status", "muzzle$0496"],
    0xBC6A: ["frame", "bulletSlot$A9", "enemyIdx$A8"],
    0xBD1C: ["frame", "max$9B", "absDy$9C", "absDx$9D", "dirCode$A0", "steep$A1"],
    0xBD1F: ["frame", "q_hi$98", "q_mid$99", "q_lo$9A", "divisor$9B"],
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=900)
    ap.add_argument("--script", default="200:,10:S,690:")
    ap.add_argument("--poke", default="")
    ap.add_argument("--json", default=str(OUT / "bullet.json"))
    ap.add_argument("--dump", default="", help="FIRST:COUNT of frames to dump all 10 bullet slots")
    ap.add_argument("--hits", action="store_true")
    ap.add_argument("--args", action="store_true")
    ap.add_argument("--timeline", action="store_true")
    ap.add_argument("--dumpslots", action="store_true")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    jp = Path(a.json).resolve()
    if jp.exists():
        jp.unlink()

    df, dn = "-1", "0"
    if a.dump:
        df, dn = a.dump.split(":")

    env = {
        "BP_FRAMES": str(a.frames),
        "BP_SCRIPT": a.script,
        "BP_JSON": str(jp),
        "BP_POKE": a.poke,
        "BP_DUMPFROM": df,
        "BP_DUMPN": dn,
    }
    run = mesen.run_script(HERE / "bulletprobe.lua", timeout_s=600, env_extra=env)
    for line in run.lines:
        print(line)
    if "END" not in run.lines:
        print("!! no END line -- the script died mid-callback", file=sys.stderr)
        print("\n".join(run.log[-20:]), file=sys.stderr)
        return 1

    data = json.loads(jp.read_text())
    counts = {int(k, 16): v for k, v in data["hitCounts"].items()}
    firsts = {int(k, 16): v for k, v in data["hitFrames"].items()}

    if a.hits:
        print("\n--- exec hits (n, first frames) ---")
        for addr in sorted(counts):
            fs = firsts.get(addr, [])
            print("  $%04X  n=%-6d %s" % (addr, counts[addr],
                                          fs[:8] if fs else ""))

    if a.args:
        for addr, fields in ARGFIELDS.items():
            rows = data["args"].get("%04X" % addr)
            if not rows:
                continue
            print("\n--- $%04X ---" % addr)
            print("  " + "  ".join("%-11s" % f for f in fields))
            for r in rows[:24]:
                print("  " + "  ".join("%-11s" % v for v in r))

    if a.timeline:
        print("\n--- frames where bullet occupancy changed ---")
        print("frame  occ    live  pX   pY  $5D  cam    $46 $17 $0100")
        prev = None
        for r in data["rows"]:
            if r[1] != prev:
                print("%5d  %04X  %3d   %3d %3d  %3d  %02X%02X  %3d %3d %3d"
                      % (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7],
                         r[8], r[9], r[10]))
                prev = r[1]

    if a.dumpslots and data.get("dump"):
        print("\n--- the ten bullet slots: " + ":".join(data["slotFields"]))
        for r in data["dump"]:
            cells = r["s"].split(",")
            live = [(22 + i, c) for i, c in enumerate(cells)
                    if c.split(":")[1] != "0"]
            if live:
                print("frame %d  " % r["frame"]
                      + "   ".join("[%d] %s" % (i, c) for i, c in live))

    print("\nframes=%d  $BC44=%d  $BC58(no fire)=%d  $BC59(alloc)=%d  "
          "$BC63(FAIL)=%d  $BC68(ok)=%d  $BDD5=%d  $C22F=%d  $C24B=%d"
          % (data["frames"], counts.get(0xBC44, 0), counts.get(0xBC58, 0),
             counts.get(0xBC59, 0), counts.get(0xBC63, 0),
             counts.get(0xBC68, 0), counts.get(0xBDD5, 0),
             counts.get(0xC22F, 0), counts.get(0xC24B, 0)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
