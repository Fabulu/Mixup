#!/usr/bin/env python3
"""Run the MAME capability probe TWICE, headless, and prove the runs are identical.

    python games/ddpdoj/tools/capability_probe.py

Boots the Gradius (USA) NES ROM on MAME's `nes` driver with no window, hooks the
CPU at $806A (the game's NMI handler entry), reads CPU registers and RAM at that
instant, reads and writes CPU RAM and video RAM, hashes the framebuffer, and
writes a PNG snapshot. Then does it all again and diffs.

Exit code 0 means: hooks fired, memory was read and written, and run A's probe
output is byte-identical to run B's.

The ROM path can be overridden with --rom. Nothing ROM-derived is written into
the repo: probe output goes to --out, which defaults to a scratch folder under
the system temp directory.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mame  # noqa: E402

SCRIPT = Path(__file__).with_name("capability_probe.lua")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", type=Path, default=mame.DEFAULT_ROM)
    ap.add_argument("--seconds", type=int, default=20)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path(tempfile.gettempdir()) / "mixup-mame-probe",
    )
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    runs = {}
    for name in ("A", "B"):
        snapdir = args.out / f"run{name}"
        r = mame.run_nes(
            SCRIPT,
            rom=args.rom,
            seconds=args.seconds,
            snapshot_dir=snapdir,
        )
        text = "\n".join(r.lines) + "\n"
        (args.out / f"run{name}.txt").write_text(text, encoding="utf-8")
        runs[name] = (r, text, snapdir)
        print(f"--- run {name}: exit={r.returncode} probe lines={len(r.lines)}")
        if r.returncode != 0 or not r.lines:
            print(r.stdout[-4000:], file=sys.stderr)
            print(r.stderr[-4000:], file=sys.stderr)
            return 1

    print()
    print("=" * 72)
    print("RUN A PROBE OUTPUT")
    print("=" * 72)
    print(runs["A"][1], end="")

    ok = True

    # --- determinism of the probe's own output -------------------------------
    ha = hashlib.sha256(runs["A"][1].encode()).hexdigest()
    hb = hashlib.sha256(runs["B"][1].encode()).hexdigest()
    print("=" * 72)
    print(f"run A sha256 {ha}")
    print(f"run B sha256 {hb}")
    if ha == hb:
        print("IDENTICAL: run A and run B produced byte-identical probe output.")
    else:
        ok = False
        print("DIVERGENT:")
        for line in difflib.unified_diff(
            runs["A"][1].splitlines(), runs["B"][1].splitlines(),
            "runA", "runB", lineterm="", n=1,
        ):
            print("  " + line)

    # --- determinism of the rendered framebuffer -----------------------------
    pa = runs["A"][2] / "capability_probe.png"
    pb = runs["B"][2] / "capability_probe.png"
    if pa.exists() and pb.exists():
        sa = hashlib.sha256(pa.read_bytes()).hexdigest()
        sb = hashlib.sha256(pb.read_bytes()).hexdigest()
        print(f"snapshot A sha256 {sa}  ({pa})")
        print(f"snapshot B sha256 {sb}")
        if sa == sb:
            print("IDENTICAL: the headless PNG snapshots match byte for byte.")
        else:
            ok = False
            print("DIVERGENT: snapshot bytes differ.")
    else:
        ok = False
        print(f"MISSING snapshot: {pa} / {pb}")

    # --- the capability assertions themselves --------------------------------
    kv = {}
    for line in runs["A"][1].splitlines():
        if "=" in line and " " not in line.split("=", 1)[0]:
            k, v = line.split("=", 1)
            kv.setdefault(k, v)

    def check(label: str, cond: bool, detail: str) -> None:
        nonlocal ok
        print(f"[{'PASS' if cond else 'FAIL'}] {label}: {detail}")
        if not cond:
            ok = False

    check("A execution hook fired",
          int(kv.get("A_nmi_executions", 0)) > 0,
          f"{kv.get('A_nmi_executions')} executions of $806A caught by a Lua callback")
    check("A hook is an opcode fetch",
          kv.get("A_opcode_at_806A") == "08",
          f"byte fetched at $806A = ${kv.get('A_opcode_at_806A')} (PHP, Gradius NMI entry)")
    check("A registers readable at the hook",
          any(l.startswith("A_sample") for l in runs["A"][1].splitlines()),
          "A/X/Y/SP/P sampled at the instant of execution")
    check("B CPU RAM writable",
          "wrote=A5 readback=A5" in runs["A"][1],
          "wrote $A5 to CPU RAM and read it back")
    check("B video RAM writable",
          "wrote=5A readback=5A" in runs["A"][1],
          "wrote $5A to PPU videoram and read it back")
    fb = next((l for l in runs["A"][1].splitlines() if l.startswith("C_framebuffer")), "")
    check("C framebuffer readable headless", bool(fb), fb)
    check("C runs identical", ha == hb, "byte-identical probe output across two runs")

    print("=" * 72)
    print("RESULT:", "MAME SATISFIES THE ORACLE CRITERIA" if ok else "SOMETHING FAILED")
    print(f"artifacts in {args.out}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
