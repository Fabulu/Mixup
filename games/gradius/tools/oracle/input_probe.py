#!/usr/bin/env python3
"""Prove scripted input is injectable AND reproducible.

Runs the same 400 frames four times: {no input, hold START} x {run 1, run 2}.

  - the two modes must produce DIFFERENT pictures  (input actually reaches the game)
  - each mode must reproduce ITSELF byte for byte  (the corpus can be trusted)

A green result that only checked "the run finished" would be worthless here;
that is trap #4.3 - a check with no transition in it cannot fail.

    python games/gradius/tools/oracle/input_probe.py

Outputs under out/input/ are ROM-derived and gitignored.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
LUA = HERE / "input_probe.lua"


def once(rom: Path, mode: str, frames: int, out: Path) -> tuple[dict, str, int]:
    out.mkdir(parents=True, exist_ok=True)
    run = mesen.run_script(LUA, rom, timeout_s=120, env_extra={
        "PROBE_PRESS": mode, "PROBE_FRAMES": str(frames), "PROBE_OUT": out.as_posix()})
    png = out / f"input_{mode}.png"
    digest = hashlib.sha256(png.read_bytes()).hexdigest() if png.exists() else "MISSING"
    return run.fields(), digest, run.returncode


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", type=Path, default=mesen.DEFAULT_ROM)
    ap.add_argument("--frames", type=int, default=400)
    ap.add_argument("--out", type=Path, default=HERE / "out" / "input")
    args = ap.parse_args()

    results = {}
    for mode in ("none", "start"):
        for rep in (1, 2):
            fields, digest, rc = once(args.rom, mode, args.frames,
                                      args.out / f"{mode}{rep}")
            results[(mode, rep)] = (fields, digest, rc)
            print(f"{mode} run{rep}: exit={rc} "
                  f"fnv1a={fields.get('framebuffer.fnv1a')} "
                  f"forcedPolls={fields.get('input.forcedPolls')} "
                  f"nonBlack={fields.get('framebuffer.nonBlackPixels')} "
                  f"png.sha256={digest[:16]}...")
    print()

    ok = True
    for mode in ("none", "start"):
        a, b = results[(mode, 1)], results[(mode, 2)]
        same = a[0] == b[0] and a[1] == b[1]
        print(f"  [{'PASS' if same else 'FAIL'}] '{mode}' reproduces itself exactly")
        ok = ok and same
    n, s = results[("none", 1)], results[("start", 1)]
    differ = n[1] != s[1]
    print(f"  [{'PASS' if differ else 'FAIL'}] holding START changes the picture "
          f"(input really reaches the game)")
    forced = int(s[0].get("input.forcedPolls", "0"))
    print(f"  [{'PASS' if forced > 0 else 'FAIL'}] setInput ran on {forced} polled frames")
    ok = ok and differ and forced > 0
    print("\nRESULT:", "INPUT INJECTION PROVEN" if ok else "SOMETHING FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
