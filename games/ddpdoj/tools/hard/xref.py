#!/usr/bin/env python3
"""Static cross-reference over the DECRYPTED 68000 image.

docs/knowledge/08-rank-and-dynamic-difficulty.md: "Measurement can prove
PRESENCE. Only the listing can prove ABSENCE." This is the listing half.

The 68000 addresses main RAM ($800000-$81FFFF) with absolute-long operands, so
every such access embeds the target address as four big-endian bytes in the
instruction stream. Scanning for that pattern finds the access sites without a
full disassembly pass.

WHAT THIS CAN AND CANNOT SEE -- state it every time the tool is quoted:

  CAN   absolute-long accesses:  move.w $80390a.l, D0   /  addq.w #1,$80390a.l
  CAN   the 4 bytes appearing as an immediate or as data (reported, not filtered)
  CANNOT (d16,An) / (d8,An,Xn) / (An)+ forms, i.e. anything reached through a
         base register. If the game keeps a pointer to its state block in an
         address register, this tool sees NOTHING and the absence claim is void.

So a clean result here is "no absolute-long access site", never "nothing reads
it". The register-relative case has to be closed separately -- by measuring the
read tap's CURPC set and disassembling each site.

Usage:
  python xref.py 0x80390A [0x803940 ...]   [--image out/maincpu_ddpdojblk.bin]
  python xref.py --dasm 0x13C6A0 --count 20
"""
from __future__ import annotations

import argparse
import os
import struct
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_IMAGE = HERE / "out" / "maincpu_ddpdojblk.bin"


def mame_home() -> Path:
    env = os.environ.get("MAME_HOME")
    if env:
        return Path(env)
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return base / "Mixup" / "mame"


def dasm(image: Path, pc: int, count: int = 8) -> list[str]:
    exe = mame_home() / "unidasm.exe"
    r = subprocess.run(
        [str(exe), str(image), "-arch", "m68000",
         "-basepc", hex(pc), "-skip", hex(pc), "-count", str(count)],
        capture_output=True, text=True)
    return [ln.rstrip() for ln in r.stdout.splitlines() if ln.strip()]


def find(data: bytes, addr: int) -> list[int]:
    pat = struct.pack(">I", addr)
    out, i = [], 0
    while True:
        i = data.find(pat, i)
        if i < 0:
            return out
        out.append(i)
        i += 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("addrs", nargs="*")
    ap.add_argument("--image", type=Path, default=DEFAULT_IMAGE)
    ap.add_argument("--dasm", default=None)
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--back", type=int, default=10,
                    help="bytes to back up before an xref hit when disassembling")
    ap.add_argument("--max", type=int, default=200)
    a = ap.parse_args()

    data = a.image.read_bytes()
    print(f"# image={a.image} size={len(data)}")

    if a.dasm:
        for ln in dasm(a.image, int(a.dasm, 0), a.count):
            print(ln)
        return 0

    for s in a.addrs:
        addr = int(s, 0)
        hits = find(data, addr)
        print(f"\n=== xref {addr:#08x}: {len(hits)} absolute-long occurrences ===")
        if len(hits) > a.max:
            print(f"# showing first {a.max} of {len(hits)} -- TRUNCATED, coverage bounded")
        for off in hits[: a.max]:
            # The operand sits after the opcode word(s); back up and let unidasm
            # re-sync. Print the two instructions that start nearest before it.
            start = max(0, off - a.back)
            lines = dasm(a.image, start, 4)
            print(f"-- operand at file/addr {off:#08x}")
            for ln in lines:
                print("   " + ln)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
