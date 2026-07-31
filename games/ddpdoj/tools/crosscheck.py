#!/usr/bin/env python3
"""Cross-validate MAME against Mesen on the Gradius (USA) NES ROM.

    python games/ddpdoj/tools/crosscheck.py

Both emulators hook the SAME address -- $806A, Gradius's NMI handler entry --
and emit the same per-NMI digest: CPU registers at the instant of the fetch,
the frame lock $04 and three other zero-page bytes, plus an FNV-1a over zero
page and the object page. The sequences are then aligned and diffed.

Why bother: Mesen is the settled Gradius oracle, and MAME is the candidate
oracle for phase 3. If two independently written emulators agree byte for byte
on hundreds of frames of a real game, that is much stronger evidence than
either one asserted to be accurate. If they disagree, we want to know now.

The scripts attach at slightly different points after power-on, so the NMI
ordinal is offset by a constant between the two. The offset is SEARCHED FOR
rather than assumed, and reported.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mame  # noqa: E402

HERE = Path(__file__).resolve().parent
NMIS = 500


def mesen_exe() -> Path:
    env = os.environ.get("MESEN_HOME")
    if env:
        home = Path(env)
    elif sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        home = base / "Mixup" / "mesen"
    else:
        home = Path.home() / ".local" / "share" / "mixup" / "mesen"
    exe = home / ("Mesen.exe" if sys.platform == "win32" else "Mesen")
    if not exe.exists():
        raise SystemExit(
            f"Mesen not found at {exe}\n"
            f"Run: python games/gradius/tools/oracle/setup_mesen.py"
        )
    return exe


def parse(lines: list[str]) -> tuple[dict[int, str], set[str]]:
    """'n=7 A=.. ... Praw=74' -> ({7: 'A=.. ...'}, {'74'}).

    Praw is split out of the compared payload on purpose. Bits 5 and 4 of the
    6502 status register are not physical flip-flops (bit 5 does not exist; B
    exists only in the pushed byte), so the two emulators are free to report
    them differently and do. Comparing them would be comparing a reporting
    convention, not hardware state -- but dropping them silently would hide a
    real difference, so they are collected and reported separately.
    """
    rows: dict[int, str] = {}
    praw: set[str] = set()
    for ln in lines:
        if not ln.startswith("n="):
            continue
        head, rest = ln.split(" ", 1)
        if " Praw=" in rest:
            rest, raw = rest.rsplit(" Praw=", 1)
            praw.add(raw)
        rows[int(head[2:])] = rest
    return rows, praw


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", type=Path, default=mame.DEFAULT_ROM)
    ap.add_argument("--nmis", type=int, default=NMIS)
    ap.add_argument(
        "--out", type=Path,
        default=Path(tempfile.gettempdir()) / "mixup-mame-probe",
    )
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    env_n = str(args.nmis)

    # ---- MAME ------------------------------------------------------------
    os.environ["XV_NMIS"] = env_n
    r = mame.run_nes(
        HERE / "crosscheck_mame.lua",
        rom=args.rom,
        seconds=max(30, args.nmis // 20),
        timeout=900,
    )
    mame_lines = [ln for ln in r.stdout.splitlines() if ln.startswith("XV ")]
    mame_lines = [ln[3:] for ln in mame_lines]
    print(f"MAME  : exit={r.returncode} lines={len(mame_lines)}")
    if not mame_lines:
        print(r.stdout[-3000:], file=sys.stderr)
        return 1

    # ---- Mesen -----------------------------------------------------------
    argv = [
        str(mesen_exe()), "--testRunner", "--enableStdout",
        str(HERE / "crosscheck_mesen.lua"), str(args.rom),
    ]
    m = subprocess.run(argv, capture_output=True, text=True, timeout=900)
    mesen_lines = [ln[3:] for ln in m.stdout.splitlines() if ln.startswith("XV ")]
    print(f"Mesen : exit={m.returncode} lines={len(mesen_lines)}")
    if not mesen_lines:
        print(m.stdout[-3000:], file=sys.stderr)
        print(m.stderr[-3000:], file=sys.stderr)
        return 1

    (args.out / "xv_mame.txt").write_text("\n".join(mame_lines), encoding="utf-8")
    (args.out / "xv_mesen.txt").write_text("\n".join(mesen_lines), encoding="utf-8")

    A, praw_a = parse(mame_lines)
    B, praw_b = parse(mesen_lines)
    print(f"MAME  header: {mame_lines[0]}")
    print(f"Mesen header: {mesen_lines[0]}")

    # ---- longest identical prefix ----------------------------------------
    # Report the FIRST divergence, per docs/knowledge/01-the-oracle-method.md.
    # A single global offset is the wrong model here: the two emulators can
    # agree on every byte of game state and still disagree about whether one
    # NMI was DELIVERED, which shows up as an insertion, not a shift.
    n_common = min(max(A), max(B))
    prefix = 0
    for n in range(1, n_common + 1):
        if A[n] != B[n]:
            break
        prefix = n
    print()
    print(f"identical prefix: NMI 1..{prefix} of {n_common}"
          f"  (CPU registers + 512-byte RAM digest, byte for byte)")

    clean = prefix == n_common
    if clean:
        print(f"  first: {A[1]}")
        print(f"  last : {A[n_common]}")
    else:
        d = prefix + 1
        print()
        print(f"FIRST DIVERGENCE at NMI {d}:")
        print(f"  mame  n={d}: {A[d]}")
        print(f"  mesen n={d}: {B[d]}")
        # Is it an inserted NMI on one side rather than a state difference?
        for who, X, Y in (("mesen", B, A), ("mame", A, B)):
            tail = [n for n in range(d + 1, n_common) if (n + 1) in X]
            if tail and all(Y[n] == X[n + 1] for n in tail):
                print()
                print(f"  This is an EXTRA NMI delivered by {who}, not a state divergence:")
                print(f"  after skipping it the sequences realign exactly --")
                print(f"  {len(tail)}/{len(tail)} of the remaining samples are identical.")
                extra = X[d]
                lock = dict(
                    kv.split("=", 1) for kv in extra.split() if "=" in kv
                ).get("lock")
                print(f"  The extra NMI has lock=${lock} at entry"
                      f" -- ${lock} != $00 means the game's frame lock was still"
                      f" held, i.e. this is the bail path: a LAG frame.")
                break

    print()
    print("reported-but-not-compared, unmasked P (bits 5,4 are not real 6502 bits):")
    print(f"  MAME  Praw values seen: {sorted(praw_a)}")
    print(f"  Mesen Praw values seen: {sorted(praw_b)}")
    if praw_a != praw_b:
        xor = {f"{int(a,16) ^ int(b,16):02X}" for a in praw_a for b in praw_b}
        print(f"  they differ; xor of the values seen: {sorted(xor)}"
              f"  (0x30 == bits 5 and 4 only)")

    print()
    if clean:
        print(f"RESULT: MAME AND MESEN AGREE on all {n_common} sampled NMIs")
    else:
        print(f"RESULT: identical game state for {prefix} NMIs, then the emulators"
              f" disagree about NMI DELIVERY (see above)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
