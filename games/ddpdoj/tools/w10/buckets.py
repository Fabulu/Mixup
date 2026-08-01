#!/usr/bin/env python3
"""RECON 10.1 -- the sprite REQUEST pipeline, statically.

Finds every enqueue stub (a routine ending in `addi.w #$c,$80AFxx`), the bucket
staging buffer it appends to, and every absolute-long caller of it.  Also prints
the drain order out of main-loop call #4 and the derived per-bucket capacities.

CAN see: absolute-long jsr/jmp callers.  CANNOT see: bsr / (An) / PC-relative.
So caller lists are LOWER BOUNDS.  Say so wherever they are quoted.
"""
import struct, sys, re
from pathlib import Path
HERE = Path(__file__).resolve().parents[1] / "oracle"
sys.path.insert(0, str(HERE))
IMAGE = HERE / "out" / "maincpu.bin"
d = IMAGE.read_bytes()

def find(pat, lo=0x200000, hi=0x2A0000):
    out, i = [], lo
    while True:
        i = d.find(pat, i, hi)
        if i < 0: return out
        out.append(i); i += 1

# ---- 1. the drain order in call #4: `lea $80xxxx,A0 / lea $80AFxx,A1 / bsr $23D726`
drain = []
i = 0x23D3E0
while i < 0x23D624:
    if d[i:i+2] == b"\x41\xf9" and d[i+6:i+8] == b"\x43\xf9":
        buf = struct.unpack(">I", d[i+2:i+6])[0]
        cnt = struct.unpack(">I", d[i+8:i+12])[0]
        drain.append((i, buf, cnt)); i += 12
    else:
        i += 2
print(f"=== DRAIN ORDER out of call #4 ($23D3E0..$23D622): {len(drain)} buckets ===")

# ---- 2. every enqueue stub: `addi.w #$c,$80AFxx`
stubs = {}
for a in find(b"\x06\x79\x00\x0c\x00\x80\xaf"):
    ctr = struct.unpack(">I", d[a+4:a+8])[0]
    # walk back to the routine head: the nearest preceding `lea $80xxxx,A0`
    head, buf = None, None
    for k in range(a, a-0x80, -2):
        if d[k:k+2] == b"\x41\xf9" and (d[k+2] == 0x00) and d[k+3] == 0x80:
            buf = struct.unpack(">I", d[k+2:k+6])[0]
            head = k
            # a movem.l save one word earlier?
            if d[k-4:k-2] == b"\x48\xe7":
                head = k-4
            break
    stubs[a] = (ctr, buf, head)

byctr = {}
for a,(ctr,buf,head) in sorted(stubs.items()):
    byctr.setdefault(ctr, []).append((head, buf, a))

# ---- 3. capacities from consecutive staging-buffer addresses
bufs = sorted({b for _,b,_ in drain} | {0x80397C})
cap = {}
allb = bufs + [0x80AFC0]
for j,b in enumerate(bufs):
    cap[b] = allb[j+1] - b

print(f"{'#':>3} {'site':>8} {'buffer':>9} {'ctr':>9} {'bytes':>6} {'recs':>5}  enqueue stubs (abs-long callers)")
for n,(site,buf,ctr) in enumerate(drain, 1):
    ss = byctr.get(ctr, [])
    txt = " ".join(f"${h:06X}" for h,_,_ in ss)
    print(f"{n:3d} ${site:06X} ${buf:06X} ${ctr:06X} {cap[buf]:6d} {cap[buf]//12:5d}  {txt}")
print(f"  0 (direct)  $80397C $80AFC0 {cap[0x80397C]:6d} {cap[0x80397C]//12:5d}  "
      + " ".join(f"${h:06X}" for h,_,_ in byctr.get(0x80AFC0, [])))

# ---- 4. callers of each stub
def callers(t):
    tgt = struct.pack(">I", t)
    out = [(s,"jsr") for s in find(b"\x4e\xb9"+tgt, 0x100000, 0x300000)]
    out += [(s,"jmp") for s in find(b"\x4e\xf9"+tgt, 0x100000, 0x300000)]
    return sorted(out)

print("\n=== CALLERS of every enqueue stub (absolute-long only = LOWER BOUND) ===")
tot=0
for ctr in sorted(byctr):
    for head, buf, a in byctr[ctr]:
        cs = callers(head)
        tot += len(cs)
        print(f"  stub ${head:06X} -> buf ${buf:06X} ctr ${ctr:06X}  callers={len(cs)}  "
              + " ".join(f"${s:06X}" for s,_ in cs[:12]) + (" ..." if len(cs)>12 else ""))
print(f"  TOTAL abs-long call sites into the enqueue family: {tot}")
