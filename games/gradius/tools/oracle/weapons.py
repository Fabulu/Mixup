#!/usr/bin/env python3
"""weapons.py -- driver for weapons.lua.  RECON 2: player weapons.

  python weapons.py --frames 560 --script "200:,10:S,190:,160:A" --from 300 \
                    --cols "44,45,ty,sub,x,y,tm"

Columns are printed as a table so a cadence is visible by eye, and the raw JSON
is kept so a later run can diff against it.
"""
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mesen import run_script, DEFAULT_ROM, REPO_ROOT   # noqa: E402

OUT = HERE / "out"
LUA = HERE / "weapons.lua"


def run(frames, script, frm, poke="", exec_="", wexec="", tag="w", rom=None):
    OUT.mkdir(parents=True, exist_ok=True)
    jf = OUT / f"weapons-{tag}.json"
    if jf.exists():
        jf.unlink()
    env = {"WP_FRAMES": str(frames), "WP_SCRIPT": script, "WP_JSON": str(jf),
           "WP_FROM": str(frm), "WP_POKE": poke, "WP_EXEC": exec_,
           "WP_WEXEC": wexec}
    r = run_script(LUA, rom or DEFAULT_ROM, timeout_s=180, env_extra=env)
    if "END" not in r.lines:
        print("\n".join(r.lines[-20:]))
        print("\n".join(r.log[-20:]))
        raise SystemExit(f"script did not finish (rc={r.returncode})")
    for ln in r.lines:
        if ln.startswith("ERROR"):
            raise SystemExit(ln)
    if not jf.exists():
        raise SystemExit(f"no json at {jf}")
    d = json.loads(jf.read_text())
    d["_summary"] = {k: v for k, v in r.fields().items()}
    return d


def zp(d, row, name):
    return row["zp"][d["zpNames"].index(name)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=560)
    ap.add_argument("--script", default="200:,10:S,190:")
    ap.add_argument("--from", dest="frm", type=int, default=300)
    ap.add_argument("--poke", default="")
    ap.add_argument("--exec", dest="exec_", default="")
    ap.add_argument("--wexec", default="")
    ap.add_argument("--tag", default="w")
    ap.add_argument("--cols", default="40,41,42,44,45,46,35,ty,sub,x,y,tm")
    ap.add_argument("--first", type=int, default=0, help="print from this frame")
    ap.add_argument("--n", type=int, default=80, help="rows to print")
    ap.add_argument("--slots", default="0-11")
    a = ap.parse_args()

    d = run(a.frames, a.script, a.frm, a.poke, a.exec_, a.wexec, a.tag)
    lo, hi = (int(x) for x in a.slots.split("-"))
    cols = a.cols.split(",")
    print("frames=%s lag=%s rows=%d" % (d["frames"], d["lagFrames"], len(d["rows"])))
    hdr = []
    for c in cols:
        if c in ("ty", "sub", "x", "y", "xs", "ys", "tm", "st"):
            hdr.append("%-*s" % (3 * (hi - lo + 1) + 1, c))
        else:
            hdr.append("%3s" % c)
    print("  f  " + " ".join(hdr))
    shown = 0
    for row in d["rows"]:
        if row["f"] < a.first:
            continue
        if shown >= a.n:
            break
        shown += 1
        cells = []
        for c in cols:
            if c in ("ty", "sub", "x", "y", "xs", "ys", "tm", "st"):
                cells.append("%-*s" % (3 * (hi - lo + 1) + 1,
                             " ".join("%2X" % v for v in row[c][lo:hi + 1])))
            else:
                cells.append("%3d" % zp(d, row, c.upper()))
        print("%5d " % row["f"] + " ".join(cells))
    for e in d.get("wexec", []):
        print("exec $%04X n=%d" % (e["pc"], e["n"]))


if __name__ == "__main__":
    main()
