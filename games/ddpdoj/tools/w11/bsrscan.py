#!/usr/bin/env python3
"""WAVE 11 -- WHO FEEDS THE TEN `bsr`-ONLY SPRITE BUCKETS.

`10-recon-display-list` §7.5 left this open in as many words:

    The caller lists in §3 are absolute-long only.  Ten of thirty buckets have
    none at all and are fed entirely by `bsr`.  A static `bsr`-target scan of
    $200000-$2A0000 per stub -- the same scan wave 5 ran for $23D726 and got 29
    hits -- would close this and I did not run it.

This is that scan.  For every enqueue stub (a routine whose tail is
`addi.w #$c,$80AFxx`) it reports BOTH caller kinds:

  * absolute-long  `jsr $xxxxxxxx.l` / `jmp $xxxxxxxx.l`   (4EB9 / 4EF9)
  * PC-relative    `bsr.s` (61xx, xx != 00 and != FF) and `bsr.w` (6100 dddd)

WHAT THIS STILL CANNOT SEE, and it is why every number below is a LOWER BOUND: a
call through a register (`jsr (A0)`), a jump table, or any `bsr` whose 16-bit
displacement happens to be assembled differently.  `bsr.l` (61FF) is a 68020
instruction and does not exist on this CPU, so it is not scanned for.

    python games/ddpdoj/tools/w11/bsrscan.py [--all]

Without --all it prints only the buckets whose absolute-long caller count is
ZERO, which is the set the recon could not close.
"""
from __future__ import annotations
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "oracle"
IMAGE = HERE / "out" / "maincpu.bin"
LO, HI = 0x200000, 0x2A0000

if not IMAGE.exists():
    raise SystemExit(f"{IMAGE} missing -- it is the DECRYPTED :maincpu region "
                     f"(init_ddp3 decrypts in place, so the ROM FILE is the "
                     f"wrong bytes). `pgm.py sound` writes it.")
d = IMAGE.read_bytes()


def find(pat: bytes, lo: int = LO, hi: int = HI) -> list[int]:
    out, i = [], lo
    while True:
        i = d.find(pat, i, hi)
        if i < 0:
            return out
        out.append(i)
        i += 1


# ---- every enqueue stub: the tail `addi.w #$c,$80AFxx`, then walk back to the
#      nearest preceding `lea $80xxxx,A0` (optionally preceded by a movem save).
stubs = {}
for a in find(b"\x06\x79\x00\x0c\x00\x80\xaf"):
    ctr = struct.unpack(">I", d[a + 4:a + 8])[0]
    for k in range(a, a - 0x80, -2):
        if d[k:k + 2] == b"\x41\xf9" and d[k + 2] == 0x00 and d[k + 3] == 0x80:
            buf = struct.unpack(">I", d[k + 2:k + 6])[0]
            head = k - 4 if d[k - 4:k - 2] == b"\x48\xe7" else k
            stubs.setdefault(ctr, []).append((head, buf))
            break

# the drain order, so a stub can be named by its BUCKET rather than its counter
drain = []
i = 0x23D3E0
while i < 0x23D624:
    if d[i:i + 2] == b"\x41\xf9" and d[i + 6:i + 8] == b"\x43\xf9":
        drain.append(struct.unpack(">I", d[i + 8:i + 12])[0])
        i += 12
    else:
        i += 2
bucket_of = {0x80AFC0: 0}
for n, ctr in enumerate(drain, 1):
    bucket_of[ctr] = n


def abs_callers(t: int) -> list[tuple[int, str]]:
    tgt = struct.pack(">I", t)
    out = [(s, "jsr.l") for s in find(b"\x4e\xb9" + tgt, 0x100000, 0x300000)]
    out += [(s, "jmp.l") for s in find(b"\x4e\xf9" + tgt, 0x100000, 0x300000)]
    return sorted(out)


def bsr_callers(t: int) -> list[tuple[int, str]]:
    """Every `bsr` in $200000-$2A0000 whose target is `t`.

    bsr.s = 61 dd    (dd != 00, != FF)   target = pc + 2 + sign8(dd)
    bsr.w = 61 00 dddd                   target = pc + 2 + sign16(dddd)
    The scan walks WORD-ALIGNED positions only, which is what the 68000 can
    fetch -- a byte-aligned "match" would be a coincidence, not an instruction.
    """
    out = []
    for pc in range(LO, HI, 2):
        if d[pc] != 0x61:
            continue
        dd = d[pc + 1]
        if dd == 0x00:
            disp = struct.unpack(">h", d[pc + 2:pc + 4])[0]
        elif dd == 0xFF:
            continue                       # bsr.l -- 68020 only, not this CPU
        else:
            disp = dd - 256 if dd >= 0x80 else dd
        if pc + 2 + disp == t:
            out.append((pc, "bsr.w" if dd == 0x00 else "bsr.s"))
    return out


show_all = "--all" in sys.argv
print("BUCKET  ctr       stub     buf       abs-long  bsr   bsr call sites")
closed, still_open = 0, []
for ctr in sorted(stubs, key=lambda c: bucket_of.get(c, 99)):
    b = bucket_of.get(ctr, -1)
    rows = []
    tot_abs = tot_bsr = 0
    for head, buf in sorted(stubs[ctr]):
        ac = abs_callers(head)
        bc = bsr_callers(head)
        tot_abs += len(ac)
        tot_bsr += len(bc)
        rows.append((head, buf, ac, bc))
    if not show_all and tot_abs:
        continue
    for head, buf, ac, bc in rows:
        sites = " ".join(f"${s:06X}" for s, _ in bc[:10]) + (" ..." if len(bc) > 10 else "")
        print(f"{b:6d}  ${ctr:06X} ${head:06X} ${buf:06X} {len(ac):9d} {len(bc):5d}  {sites}")
    if tot_abs == 0:
        if tot_bsr:
            closed += 1
        else:
            still_open.append(b)
    print(f"        bucket {b}: {tot_abs} absolute-long, {tot_bsr} bsr, "
          f"{tot_abs + tot_bsr} TOTAL (a LOWER BOUND -- register-indirect calls "
          f"are invisible to any static scan)")

print(f"\n{closed} of the abs-long-less buckets now have named callers.")
if still_open:
    print(f"STILL UNFED BY ANY STATIC CALLER: buckets {still_open}. That is "
          f"'I found no caller', never 'nothing calls it' -- a call through a "
          f"register or a jump table would not appear here.")

# ---- and the OTHER half of the answer: who else touches a counter word at all.
# A bucket with a live record count and no reachable stub is being fed by
# something that is not a stub -- the BULK-WRITER convention, which sets the
# counter from a pointer difference at the END (`suba.l (A7)+,A4 /
# move.w A4,$80AFxx`) and therefore never executes an `addi.w #$c`.
print("\n=== EVERY absolute-long reference to $80AFC0..$80AFFB in $200000-$2A0000,"
      "\n    by the instruction that makes it (the addi stubs excluded) ===")
OPS = {
    0x0679: "addi.w #$c   (the per-record stub)",
    0x33C0: "move.w D0,_  (a BULK writer's pointer difference, or a reset)",
    0x33CC: "move.w A4,_  (THE BULK WRITER: $28A098 / $281D9A)",
    0x33C1: "move.w D1,_", 0x33C2: "move.w D2,_", 0x33C3: "move.w D3,_",
    0x33FC: "move.w #imm,_",
    0x4279: "clr.w  _     (the pre-emptive drop, or $23D75A's caller)",
    0x3039: "move.w _,D0  (a READ)", 0x3239: "move.w _,D1  (a READ)",
    0xD079: "add.w  _,D0  (THE SUM)",
    0x3E39: "move.w _,D7  (a READ)", 0x9E79: "sub.w  _,D7",
    0x33F9: "move.w _,_   (a copy)", 0x0C79: "cmpi.w #imm,_",
    0x41F9: "lea    _,A0", 0x43F9: "lea    _,A1", 0xD4F9: "adda.w _,A2",
    0xD0F9: "adda.w _,A0",
}
seen = {}
i = LO
while i < HI - 4:
    if d[i] == 0x00 and d[i + 1] == 0x80 and d[i + 2] == 0xAF and 0xC0 <= d[i + 3] <= 0xFB:
        ctr = struct.unpack(">I", d[i:i + 4])[0]
        for back in (2, 4, 6):
            op = struct.unpack(">H", d[i - back:i - back + 2])[0]
            if op in OPS:
                key = (ctr, OPS[op])
                seen.setdefault(key, []).append(i - back)
                break
        else:
            seen.setdefault((ctr, f"?? {struct.unpack('>H', d[i-2:i]) [0]:04X}"), []).append(i - 2)
    i += 2
for (ctr, what), sites in sorted(seen.items(), key=lambda kv: bucket_of.get(kv[0][0], 99)):
    # `addi.w`, `adda.w` and `lea` are the STUB's own body reading its counter,
    # not somebody calling it; the $23D1F2..$23D2A0 block is the per-counter
    # clear whose only absolute-long caller is $23BF44, outside the main loop.
    if (what.startswith(("addi.w", "adda.w", "lea", "move.w _", "add.w", "sub.w",
                         "cmpi.w"))
            or all(0x23D1F2 <= s <= 0x23D2A0 for s in sites)):
        continue
    b = bucket_of.get(ctr, -1)
    inside = [s for s in sites if 0x23D2AE <= s <= 0x23D724]
    outside = [s for s in sites if not (0x23D2AE <= s <= 0x23D724)]
    if not outside:
        continue
    print(f"  bucket {b:2d} ${ctr:06X}  {what:52s} "
          + " ".join(f"${s:06X}" for s in outside[:8])
          + (" ..." if len(outside) > 8 else "")
          + (f"   (+{len(inside)} inside call #4)" if inside else ""))
