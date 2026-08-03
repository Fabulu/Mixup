#!/usr/bin/env python3
"""W27: robust linear-sweep capstone disassembly of the behaviour bodies.
Reads maincpu.bin (decrypted). Handles data embedded in code by skipping one
word at a time when capstone cannot decode at the current offset. NOT committed
(output under gitignored out/)."""
import sys
from pathlib import Path
from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_030

IMG = Path(__file__).resolve().parent / "out" / "maincpu.bin"
D = IMG.read_bytes()
BASE = 0
md = Cs(CS_ARCH_M68K, CS_MODE_M68K_030)
md.detail = False

def disasm(start, end):
    pc = start
    while pc < end:
        off = pc - BASE
        chunk = D[off:min(off+16, len(D))]
        got = list(md.disasm(chunk, pc, count=1))
        if not got:
            # one word of data
            w = D[off] << 8 | D[off+1]
            print(f"  {pc:06X}: {D[off:off+2].hex():20s} .word    ${w:04X}")
            pc += 2
            continue
        i = got[0]
        n = len(i.bytes)
        print(f"  {i.address:06X}: {i.bytes.hex():20s} {i.mnemonic:8s} {i.op_str}")
        pc += n

if __name__ == "__main__":
    lo = int(sys.argv[1], 16) if len(sys.argv) > 1 else 0x282104
    hi = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x283C0E
    disasm(lo, hi)
