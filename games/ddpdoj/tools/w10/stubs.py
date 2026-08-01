#!/usr/bin/env python3
"""Every instruction that ADVANCES a sprite-request bucket counter, keyed on the
PC the write tap reports.  Two shapes exist:
   addi.w #$c,$80AFxx      (0679 000c 0080 afxx)  -- the 12-byte enqueue stubs
   anything else writing $80AFC0..$80AFFB          -- found by the runtime census
"""
import struct, sys
from pathlib import Path
HERE = Path(__file__).resolve().parents[1] / "oracle"
d = (HERE / "out" / "maincpu.bin").read_bytes()

def find(pat, lo, hi):
    out, i = [], lo
    while True:
        i = d.find(pat, i, hi)
        if i < 0: return out
        out.append(i); i += 1

print("=== addi.w #$c,$80AFxx  (the write-tap PC is the addi address itself) ===")
rows = []
for a in find(b"\x06\x79\x00\x0c\x00\x80\xaf", 0x200000, 0x2B0000):
    ctr = struct.unpack(">I", d[a+4:a+8])[0]
    # the routine head = first byte after the previous rts/rte/jmp-abs
    head = None
    for k in range(a-2, a-0x120, -2):
        w = struct.unpack(">H", d[k:k+2])[0]
        if w in (0x4e75, 0x4e73) or (w == 0x4ef9):
            head = k + (2 if w != 0x4ef9 else 6)
            break
    rows.append((a, ctr, head))
for a, ctr, head in rows:
    print(f"  addi=${a:06X}  ctr=$80{ctr&0xffff:04X}  head=${head:06X}" if head else
          f"  addi=${a:06X}  ctr=$80{ctr&0xffff:04X}  head=?")
print(f"  ({len(rows)} stubs)")

print("\n=== every other absolute-long write reference to $80AFC0..$80AFFB ===")
for c in range(0x80AFC0, 0x80AFFC, 2):
    for s in find(struct.pack(">I", c), 0x200000, 0x2B0000):
        if s & 1: continue
        if any(s == a+4 for a,_,_ in rows): continue
        # print the 6 bytes before it (the opcode)
        print(f"  ${s-2:06X}  op={d[s-4:s].hex()}  -> $80{c&0xffff:04X}")
