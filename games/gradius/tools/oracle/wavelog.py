#!/usr/bin/env python3
"""wavelog.py -- drive wavelog.lua, then DIFF the cartridge against wavedump.py.

wavedump.py is the inventory (read out of assets/prg.bin). This is the verdict:
it runs the cartridge, logs every wave record that actually fires, and checks
each one against the static decode -- same cursor address, same two bytes, same
scroll position, same spawn route.

    python games/gradius/tools/oracle/wavelog.py --frames 7000
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

BOOT = "200:,10:S,190:"
# the only trajectory the corpus has MEASURED to survive stage 1's opening
# (docs/worklog/gradius/12-impl-spawn-and-throw-audit.md, "deep-survivor")
SURVIVOR = BOOT + ",1350:RD,324:RU,80:RD,6000:R"


def static_table():
    """{cursorAddr: record} for every stage, from wavedump.py --json."""
    p = subprocess.run([sys.executable, str(HERE / "wavedump.py"), "--json"],
                       capture_output=True, text=True, check=True)
    d = json.loads(p.stdout)
    by = {}
    for r in d["records"]:
        if r.get("kind") == "END":
            continue
        by.setdefault((r["stage"], r["addr"]), r)
    return by


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=7000)
    ap.add_argument("--script", default=SURVIVOR)
    ap.add_argument("--poke", default="")
    ap.add_argument("--json", default=str(OUT / "wavelog.json"))
    ap.add_argument("--timeout", type=int, default=600,
                    help="Mesen's own --timeout, in seconds")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    jp = Path(a.json).resolve()
    if jp.exists():
        jp.unlink()
    run = mesen.run_script(HERE / "wavelog.lua", timeout_s=a.timeout, env_extra={
        "WL_FRAMES": str(a.frames), "WL_SCRIPT": a.script,
        "WL_JSON": str(jp), "WL_POKE": a.poke})
    for line in run.lines:
        print("  probe:", line)
    if not jp.exists():
        print("no JSON written; emulator log tail:")
        print("\n".join(run.log[-25:]))
        return 1
    d = json.loads(jp.read_text())
    st = static_table()

    print("\nframes %d  maxScroll $%04X  records %d  boss frame %s"
          % (d["frames"], d["maxScroll"], d["records"], d["bossFrame"]))
    print("routes:", d["routes"])
    print("type histogram from $AE19 (A = type byte):")
    print("  " + " ".join("$%s:%d" % (k, v) for k, v in sorted(d["typeHist"].items())))

    ROUTE = {"$A3B1": "A3B1", "$A3E4": "A3E4", "$A466": "A466"}
    ok = bad = unknown = 0
    seen = set()
    print("\n-- cartridge vs wavedump.py --")
    for r in d["fired"]:
        key = (r["stage"], int(r["cur"], 16))
        s = st.get(key)
        if s is None:
            unknown += 1
            print("  UNKNOWN cursor $%s stage %d f%d bytes %02X %02X"
                  % (r["cur"], r["stage"], r["f"], r["b0"], r["b1"]))
            continue
        seen.add(key)
        why = []
        if s["trigger"] != r["b0"] or s["cmd"] != r["b1"]:
            why.append("bytes %02X %02X != %02X %02X"
                       % (r["b0"], r["b1"], s["trigger"], s["cmd"]))
        if ROUTE[s["route"]] != r["route"] and r["route"] != "?":
            why.append("route %s != %s" % (r["route"], s["route"]))
        # the record fires at the first frame the scroll is AT OR PAST it
        if r["scroll"] < s["scroll"]:
            why.append("fired at $%04X, before its $%04X"
                       % (r["scroll"], s["scroll"]))
        if why:
            bad += 1
            print("  MISMATCH $%s f%d: %s" % (r["cur"], r["f"], "; ".join(why)))
        else:
            ok += 1
    print("\nmatched %d   mismatched %d   unknown-cursor %d" % (ok, bad, unknown))
    print("distinct static records confirmed on the cartridge: %d" % len(seen))
    for s in sorted(set(k[0] for k in seen)):
        n = len([k for k in seen if k[0] == s])
        tot = len([k for k in st if k[0] == s])
        print("  stage %d: %d of %d records in the table were reached" % (s, n, tot))
    return 0 if bad == 0 and unknown == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
