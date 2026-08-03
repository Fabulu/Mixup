#!/usr/bin/env python3
"""W26 REVIEW: independent capstone disassembly of the bullet mover.
Reads maincpu.bin directly (the decrypted image). NO reliance on prior art.
"""
import sys
from pathlib import Path
from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_030

IMG = Path(__file__).resolve().parent / "out" / "maincpu.bin"
D = IMG.read_bytes()
BASE = 0  # maincpu.bin loaded at 0; ROM addresses map directly

md = Cs(CS_ARCH_M68K, CS_MODE_M68K_030)
md.detail = False

def disasm(start, end):
    off = start - BASE
    code = D[off:end + 4]
    for i in md.disasm(code, start):
        print(f"  {i.address:06X}: {i.bytes.hex():20s} {i.mnemonic:8s} {i.op_str}")
        if i.address >= end:
            break

if __name__ == "__main__":
    lo = int(sys.argv[1], 16) if len(sys.argv) > 1 else 0x281D9A
    hi = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x282030
    disasm(lo, hi)
