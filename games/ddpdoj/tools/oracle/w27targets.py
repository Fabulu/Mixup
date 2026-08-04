#!/usr/bin/env python3
"""W27: WHO BRANCHES HERE.  Sweeps the behaviour range with capstone and prints
every instruction whose operand resolves to the queried address.  Used to decide
whether a block the linear sweep prints after a routine is REACHABLE or a dead
template vestige -- the sweep cannot tell you, only control flow can.
Output is advisory: a linear sweep misdecodes data, so a HIT must be read in
context.  A clean MISS over the whole range is the useful direction."""
import sys, re
from pathlib import Path
from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_030

D = (Path(__file__).resolve().parent / "out" / "maincpu.bin").read_bytes()
md = Cs(CS_ARCH_M68K, CS_MODE_M68K_030)

def scan(target, lo, hi):
    hits = []
    pc = lo
    while pc < hi:
        got = list(md.disasm(D[pc:pc+16], pc, count=1))
        if not got:
            pc += 2
            continue
        i = got[0]
        for m in re.finditer(r'\$([0-9a-fA-F]{4,8})', i.op_str):
            if int(m.group(1), 16) == target:
                hits.append(f"  {i.address:06X}: {i.mnemonic:8s} {i.op_str}")
                break
        pc += len(i.bytes)
    return hits

if __name__ == "__main__":
    tgt = int(sys.argv[1], 16)
    lo = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x281000
    hi = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0x285000
    hits = scan(tgt, lo, hi)
    print(f"references to ${tgt:06X} in ${lo:06X}..${hi:06X}: {len(hits)}")
    for h in hits:
        print(h)
