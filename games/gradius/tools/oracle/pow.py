#!/usr/bin/env python3
"""pow.py -- driver for pow.lua.  RECON: the power-up system.

  python pow.py --frames 900 --script "200:,10:S,690:A" --from 400 \
      --zp 17,35,40,41,42,44,45,46,47 --arrays 0100,0300,0320,0360,0380 \
      --slots 12-21 --wexec 894B,C1AF,C18C,AEC8

Prints a per-frame table of the zero page and, optionally, of the object arrays,
plus exec-hook totals.  --changes prints only the frames where something in the
selected set changed, which is what you want for a 3000-frame play run.
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mesen import run_script, DEFAULT_ROM   # noqa: E402

OUT = HERE / "out"
LUA = HERE / "pow.lua"


def run(frames, script, frm, *, poke="", arrays="0100,0300,0320,0360,0380",
        slots="0-21", zp="17,35,40,41,42,44,45,46,47", exec_="", execmem="",
        wexec="", tag="p", timeout=300):
    OUT.mkdir(parents=True, exist_ok=True)
    jf = OUT / f"pow-{tag}.json"
    if jf.exists():
        jf.unlink()
    env = {"PW_FRAMES": str(frames), "PW_SCRIPT": script, "PW_JSON": str(jf),
           "PW_FROM": str(frm), "PW_POKE": poke, "PW_ARRAYS": arrays,
           "PW_SLOTS": slots, "PW_ZP": zp, "PW_EXEC": exec_,
           "PW_EXECMEM": execmem, "PW_WEXEC": wexec}
    r = run_script(LUA, DEFAULT_ROM, timeout_s=timeout, env_extra=env)
    if "END" not in r.lines:
        print("\n".join(r.lines[-20:]))
        print("\n".join(r.log[-20:]))
        raise SystemExit(f"script did not finish (rc={r.returncode})")
    for ln in r.lines:
        if ln.startswith("ERROR"):
            raise SystemExit(ln)
    if not jf.exists():
        raise SystemExit(f"no json at {jf}")
    return json.loads(jf.read_text())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=900)
    ap.add_argument("--script", default="200:,10:S,690:")
    ap.add_argument("--from", dest="frm", type=int, default=300)
    ap.add_argument("--poke", default="")
    ap.add_argument("--arrays", default="")
    ap.add_argument("--slots", default="0-21")
    ap.add_argument("--zp", default="17,35,40,41,42,44,45,46,47")
    ap.add_argument("--exec", dest="exec_", default="")
    ap.add_argument("--execmem", default="")
    ap.add_argument("--wexec", default="")
    ap.add_argument("--tag", default="p")
    ap.add_argument("--first", type=int, default=0)
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--changes", action="store_true",
                    help="print only frames where the printed cells changed")
    ap.add_argument("--timeout", type=int, default=300)
    a = ap.parse_args()

    d = run(a.frames, a.script, a.frm, poke=a.poke,
            arrays=a.arrays or "0100", slots=a.slots, zp=a.zp,
            exec_=a.exec_, execmem=a.execmem, wexec=a.wexec, tag=a.tag,
            timeout=a.timeout)
    lo, hi = (int(x) for x in a.slots.split("-"))
    zpn = d["zpNames"]
    arrs = [x for x in a.arrays.split(",") if x] if a.arrays else []
    print("frames=%s lag=%s rows=%d" % (d["frames"], d["lagFrames"], len(d["rows"])))
    hdr = "  f  " + " ".join("%3s" % n for n in zpn)
    for b in arrs:
        hdr += "  " + "%-*s" % (3 * (hi - lo + 1) + 1, b)
    print(hdr)
    prev, shown = None, 0
    for row in d["rows"]:
        if row["f"] < a.first:
            continue
        cells = ["%3d" % v for v in row["zp"]]
        for b in arrs:
            cells.append(" " + " ".join("%2X" % v
                         for v in row["a%s" % b.upper()]))
        key = tuple(cells)
        if a.changes and key == prev:
            continue
        prev = key
        if shown >= a.n:
            break
        shown += 1
        print("%5d " % row["f"] + " ".join(cells))
    for e in d.get("exec", []):
        print("exec $%04X n=%d" % (e["pc"], e["n"]))
        for s in e["samples"][:40]:
            print("   f=%d a=%02X x=%02X y=%02X mem=%s"
                  % (s["f"], s["a"], s["x"], s["y"],
                     " ".join("%02X" % m for m in s["m"])))
    for e in d.get("wexec", []):
        print("wexec $%04X n=%d" % (e["pc"], e["n"]))


if __name__ == "__main__":
    main()
