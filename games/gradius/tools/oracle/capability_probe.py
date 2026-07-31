#!/usr/bin/env python3
"""Prove the NES reference emulator can do what the oracle method needs.

Boots `Gradius (USA).nes` in Mesen 2 with no window, runs N frames, installs an
execution hook on the CPU address the NMI vector points at, reads CPU RAM / OAM /
PPU memory / palette RAM at that hook, writes and reads back a RAM byte, dumps
the 256x240 framebuffer, round-trips a savestate, and prints the lot.

    python games/gradius/tools/oracle/capability_probe.py
    python games/gradius/tools/oracle/capability_probe.py --twice   # determinism

Exit code 0 means every capability assertion passed.

OUTPUTS ARE ROM-DERIVED. The .ppm framebuffer dumps and report .json under
`out/` are pixels off the cartridge - they must never be committed. There is a
.gitignore next to this file that covers them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
LUA = HERE / "capability_probe.lua"
OUT = HERE / "out"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(rom: Path, frames: int, out_dir: Path, tag: str) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    run = mesen.run_script(
        LUA, rom,
        timeout_s=120,
        env_extra={
            "PROBE_FRAMES": str(frames),
            "PROBE_OUT": out_dir.as_posix(),
        },
    )
    f = run.fields()
    ppm = out_dir / f"frame{frames}.ppm"
    png = out_dir / f"frame{frames}.png"
    return {
        "tag": tag,
        "exitCode": run.returncode,
        "fields": f,
        "framebufferFile": str(ppm),
        "framebufferSha256": sha256(ppm) if ppm.exists() else None,
        "framebufferBytes": ppm.stat().st_size if ppm.exists() else 0,
        "pngSha256": sha256(png) if png.exists() else None,
        "emulatorLog": run.log,
        "errors": [ln for ln in run.lines if ln.startswith("ERROR")],
    }


CHECKS = [
    ("A  exec hook fired",
     lambda f: int(f.get("hook.hitCount", "0")) > 0),
    ("A  exec hook reported CPU registers",
     lambda f: "hook.firstHit" in f and "pc $" in f["hook.firstHit"]),
    ("A  exec hook read RAM at the hook instant",
     lambda f: "hook.hit90.zeroPage00_0F" in f),
    ("B  CPU RAM readable",
     lambda f: f.get("mem.internalRam.fnv1a", "0x00000000") != "0x00000000"),
    ("B  OAM readable",
     lambda f: "mem.oam.sprite0" in f),
    ("B  PPU nametable readable",
     lambda f: "mem.nametable0.first16" in f),
    ("B  palette RAM readable",
     lambda f: len(f.get("mem.paletteRam.all32", "").split()) == 32),
    ("B  CPU RAM write + readback + restore",
     lambda f: f.get("mem.write.worked") == "true"),
    ("B  OAM write + readback + restore",
     lambda f: f.get("mem.oamWrite.worked") == "true"),
    ("C  framebuffer is 256x240",
     lambda f: "256x240" in f.get("framebuffer.size", "")),
    ("C  framebuffer is a picture, not a flat fill",
     lambda f: int(f.get("framebuffer.distinctColors", "1")) > 1),
    ("C  framebuffer is not all black",
     lambda f: int(f.get("framebuffer.nonBlackPixels", "0")) > 1000),
    ("C  savestate round trip is exact",
     lambda f: f.get("savestate.roundTripExact") == "true"),
    ("C  savestate test was not vacuous (state really drifted)",
     lambda f: f.get("savestate.driftWasObservable") == "true"),
]


def normalise(fields: dict, frames: int) -> dict:
    """Fold the frame-tagged framebuffer keys down to stable names."""
    out = {}
    for k, v in fields.items():
        out[k.replace(f".frame{frames}.", ".")] = v
    return out


def report(res: dict, frames: int) -> tuple[dict, list[tuple[str, bool]]]:
    f = normalise(res["fields"], frames)
    return f, [(name, bool(fn(f))) for name, fn in CHECKS]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rom", type=Path, default=mesen.DEFAULT_ROM)
    ap.add_argument("--frames", type=int, default=240,
                    help="frame at which the framebuffer is captured (default 240)")
    ap.add_argument("--twice", action="store_true",
                    help="run the whole probe twice into separate dirs and diff")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    runs = []
    tags = ["runA", "runB"] if args.twice else ["runA"]
    for tag in tags:
        res = probe(args.rom, args.frames, args.out / tag, tag)
        runs.append(res)

    ok = True
    for res in runs:
        f, checks = report(res, args.frames)
        print(f"=== {res['tag']} ===  exit={res['exitCode']}")
        for k in sorted(f):
            print(f"  {k} = {f[k]}")
        print(f"  framebuffer.ppm.sha256 = {res['framebufferSha256']}")
        print(f"  framebuffer.ppm.bytes  = {res['framebufferBytes']}")
        print(f"  framebuffer.png.sha256 = {res['pngSha256']}")
        for e in res["errors"]:
            print(f"  !! {e}")
        print()
        for name, passed in checks:
            print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
            ok = ok and passed
        if res["exitCode"] != 0:
            print(f"  [FAIL] emu.stop(0) -> process exit code 0 (got {res['exitCode']})")
            ok = False
        print()

    if len(runs) == 2:
        a, b = runs
        fa, fb = normalise(a["fields"], args.frames), normalise(b["fields"], args.frames)
        fa.pop("framebuffer.path", None)
        fb.pop("framebuffer.path", None)
        same_fields = fa == fb
        same_pixels = (a["framebufferSha256"] == b["framebufferSha256"]
                       and a["framebufferSha256"] is not None)
        print("=== determinism ===")
        print(f"  runA framebuffer sha256 = {a['framebufferSha256']}")
        print(f"  runB framebuffer sha256 = {b['framebufferSha256']}")
        print(f"  [{'PASS' if same_pixels else 'FAIL'}] framebuffers byte-identical")
        print(f"  [{'PASS' if same_fields else 'FAIL'}] every reported field identical")
        if not same_fields:
            for k in sorted(set(fa) | set(fb)):
                if fa.get(k) != fb.get(k):
                    print(f"      {k}: {fa.get(k)!r} != {fb.get(k)!r}")
        ok = ok and same_pixels and same_fields
        print()

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "report.json").write_text(json.dumps(runs, indent=2), encoding="utf-8")
    print(f"report -> {args.out / 'report.json'}")
    print("RESULT:", "ALL CAPABILITIES PROVEN" if ok else "SOMETHING FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
