#!/usr/bin/env python3
"""flowprobe.py -- driver for flowprobe.lua.  Recon 4/5: the game-flow machine.

    python games/gradius/tools/oracle/flowprobe.py --frames 900 \
        --script "200:,10:S,690:" --hooks 80E2,8116,8121,8137,8165,816C,9650

Prints the transitions of every flow field rather than the whole table -- a
900-frame TSV is unreadable and the interesting thing is where a byte CHANGED.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from mesen import run_script, DEFAULT_ROM  # noqa: E402

HERE = Path(__file__).parent
OUT = HERE / "out"
BOOT = "200:,10:S,190:"


def run(frames, script, hooks, arghook, out, crash, poke, timeout=240):
    OUT.mkdir(exist_ok=True)
    tsv = OUT / out
    if tsv.exists():
        tsv.unlink()
    env = {
        "PROBE_FRAMES": str(frames),
        "PROBE_SCRIPT": script,
        "PROBE_OUT": str(tsv.resolve()),
        "PROBE_HOOKS": hooks,
        "PROBE_ARGHOOK": arghook,
        "PROBE_POKE": poke,
    }
    if crash is not None:
        env["PROBE_CRASH"] = str(crash)
    r = run_script(HERE / "flowprobe.lua", timeout_s=timeout, env_extra=env)
    for line in r.lines:
        if line.startswith("ERROR"):
            raise SystemExit("lua: " + line)
    if "END" not in r.lines:
        raise SystemExit("no END line -- the script died:\n" + r.stdout[-3000:])
    if not tsv.exists():
        raise SystemExit(f"{tsv} not written")
    return r, tsv


def load(tsv):
    lines = tsv.read_text().splitlines()
    hdr = lines[0].split("\t")
    rows = [dict(zip(hdr, map(int, ln.split("\t")))) for ln in lines[1:]]
    return hdr, rows


def transitions(hdr, rows, keys=None):
    """(frame, field, old, new) for every byte that changed."""
    out = []
    for i in range(1, len(rows)):
        for k in hdr:
            if k == "frame":
                continue
            if keys and k not in keys:
                continue
            if rows[i][k] != rows[i - 1][k]:
                out.append((rows[i]["frame"], k, rows[i - 1][k], rows[i][k]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=900)
    ap.add_argument("--script", default=BOOT + "500:")
    ap.add_argument("--hooks", default="")
    ap.add_argument("--arghook", default="")
    ap.add_argument("--out", default="flow.tsv")
    ap.add_argument("--crash", type=int, default=None)
    ap.add_argument("--poke", default="")
    ap.add_argument("--fields", default="", help="comma list; default = all")
    ap.add_argument("--timeout", type=int, default=240)
    a = ap.parse_args()

    r, tsv = run(a.frames, a.script, a.hooks, a.arghook, a.out, a.crash,
                 a.poke, a.timeout)
    hdr, rows = load(tsv)
    keys = set(a.fields.split(",")) if a.fields else None
    for line in r.lines:
        if line.startswith(("gameFrames", "nmiEntries", "lagFrames",
                            "guardViolations", "hook.", "lag.", "vram.")):
            print(line)
    print(f"--- transitions ({len(rows)} sampled frames) ---")
    for f, k, o, n in transitions(hdr, rows, keys):
        print(f"  f{f:<5d} {k:<8s} {o:3d} (${o:02X}) -> {n:3d} (${n:02X})")
    args = [l for l in r.lines if l.startswith("arg ")]
    if args:
        print(f"--- arghook, {len(args)} calls ---")
        for l in args:
            print("  " + l)


if __name__ == "__main__":
    main()
