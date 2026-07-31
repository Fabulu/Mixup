#!/usr/bin/env python3
"""How much of ddpdojblk's main-RAM state is reachable by a STATIC xref?

docs/knowledge/08 rests an architectural decision on the listing being able to
establish the COMPLETE set of readers of a variable. Whether that is possible at
all on this game is an empirical property of the code, not an assumption, so it
gets measured before anything is built on it.

Method: 68000 absolute-long operands embed their target as four big-endian bytes
in the instruction stream. Scan the decrypted image for every 4-byte value that
lands inside main RAM ($800000-$81FFFF) at an even offset and histogram it.

This OVER-counts (any data word pair that happens to look like a RAM address is
included) and UNDER-counts (nothing reached through (An), (d16,An), (d8,An,Xn)
is visible). Both are reported rather than hidden. The under-count is the one
that matters: $13DA02 `move.l (A1)+,(A0)+` is the sprite-list builder and is
invisible to this scan.
"""
from __future__ import annotations

import argparse
import struct
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", type=Path, default=HERE / "out" / "maincpu_ddpdojblk.bin")
    ap.add_argument("--lo", type=lambda s: int(s, 0), default=0x800000)
    ap.add_argument("--hi", type=lambda s: int(s, 0), default=0x81FFFF)
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--code-lo", type=lambda s: int(s, 0), default=0x000000)
    ap.add_argument("--code-hi", type=lambda s: int(s, 0), default=0x300000)
    a = ap.parse_args()

    data = a.image.read_bytes()
    hits = Counter()
    for off in range(a.code_lo, min(a.code_hi, len(data)) - 3, 2):
        v = struct.unpack_from(">I", data, off)[0]
        if a.lo <= v <= a.hi:
            hits[v] += 1

    total_sites = sum(hits.values())
    print(f"# image={a.image} scanned={a.code_lo:#x}..{min(a.code_hi,len(data)):#x}")
    print(f"# distinct RAM addresses referenced absolute-long: {len(hits)}")
    print(f"# total absolute-long reference sites:             {total_sites}")
    span = Counter()
    for v in hits:
        span[(v >> 8) & 0xFFFF] += hits[v]
    print("# reference sites by 256-byte page of main RAM (top 20):")
    for page, n in span.most_common(20):
        print(f"   ${page:04X}xx  {n}")
    print(f"# most-referenced individual addresses (top {a.top}):")
    for v, n in hits.most_common(a.top):
        print(f"   ${v:06X}  {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
