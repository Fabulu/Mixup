#!/usr/bin/env python3
"""C1 RECON: find every static control-transfer into the 68k cue family.

Scans maincpu.bin for jsr/bsr/jmp/bra (abs.l and d16,PC and d32 forms) whose
target lands inside the cue-family address set, and prints site + target +
mnemonic.  Output is the CLOSED caller inventory Wave A ports against.

NOTE: this sees only direct control transfers.  It CANNOT see:
  - indirect jsr (A0) / jsr (d16,A0) -- register/computed dispatch
  - the few sites that load a wrapper addr into A0 then jsr (A0)
Those are found separately by scanning for `lea $28Cxxx,A0` and reporting, so
the architect can decide which are real cue posts.
"""
import struct
from pathlib import Path

IMG = Path(__file__).resolve().parent / "out" / "maincpu.bin"
d = IMG.read_bytes()
N = len(d)

# Cue-family targets (resolved from disasm).  Wrappers + tail + post targets.
FAMILY = {
    0x28BFEC: "tail (vol clamp + $81DEB4 master)",
    0x28BB04: "post: pack+bra $28BAA0 (type from D0)",
    0x28BB28: "post: pack+rts (type from D0)",
    0x28BB4A: "post: D0:=$F ungated",
    0x28BB76: "post: D0:=$10 ungated",
    0x28BB8A: "post: D0:=$20 ungated",
    0x28BB9E: "post: lsl D2 / ... (voice?)",
    0x28BBAC: "post: BGM-command dispatcher (D0=$15/$16)",
    0x28BAA0: "ring enqueue (REAL post, writes $81DD1E ring)",
    0x28C02A: "entry: BGM (D0:=0, 3-gate)",
    0x28C074: "entry: type 2 (D0:=2, gate)",
    0x28C0AE: "entry: SFX (D0:=1, gate)",
    0x28C0E8: "entry: ungated -> $28BB4A",
    0x28C0FC: "entry: ungated -> $28BB76",
    0x28C10C: "entry: ungated -> $28BB8A",
    0x28C160: "entry: -> $28BB9E (uses D6)",
    0x28C170: "wrap: D0=$15 D1=0 -> $28BBAC (BGM cmd)",
    0x28C186: "wrap: D0=$16 -> $28BBAC (BGM cmd)",
    0x28C19A: "MAILBOX DRAIN (ring-> $C10006/$C00002)",
    0x28C25A: "wrap: D0=0 D1=$B4 D2=$1E -> SFX",
    0x28C274: "wrap: D0=1 D1=$9E D2=$1E -> SFX",
    0x28C28E: "wrap: D0=2 D1=$80 D2=$1E -> SFX",
    0x28C2A8: "wrap: D0=3 D1=$8A D2=$1E -> SFX",
    0x28C2C2: "wrap: D0=4 D1=$80 D2=$1E -> SFX",
    0x28C2DC: "wrap: D0=5 D1=$A8 D2=$1E -> BGM",
    0x28C2F6: "wrap: D0=6 D1=$A8 D2=$1E -> BGM",
    0x28C310: "wrap: D0=7 D1=$FF D2=$1E -> BGM",
    0x28C32A: "wrap: D0=8 D1=$80 D2=$1E -> BGM",
    0x28C344: "wrap: D0=9 D1=$80 D2=$1E -> BGM",
    0x28C35E: "wrap: D0=$A D1=$80 D2=$1E -> BGM",
    0x28C378: "wrap: D0=$B D1=$80 D2=$1E -> BGM",
    0x28C392: "wrap: composite (->6,7,6)",
    0x28C3A0: "wrap: D0=$C D1=$B2 D2=$3E -> BGM",
    0x28C3BA: "wrap: D0=$D D1=$5D D2=$A -> BGM",
    0x28C3D4: "wrap: D0=$11 D1=$5D D2=$A -> BGM",
}

# also include any address in the wrapper block we have not named yet, by range
WRAP_RANGE = (0x28C02A, 0x28C800)

FAM_SET = set(FAMILY.keys())


def in_family(t):
    if t in FAM_SET:
        return True
    # unknown address inside the dense wrapper block?
    if WRAP_RANGE[0] <= t <= WRAP_RANGE[1] and (t & 1) == 0:
        return True
    return False


def sw16(b):
    return struct.unpack(">h", b)[0]


def sw32(b):
    return struct.unpack(">i", b)[0]


results = []  # (site, target, kind, note)
i = 0
while i + 2 <= N:
    op = (d[i] << 8) | d[i + 1]
    # jsr (d16,PC): 4EBA <dd16> ; target = i + 2 + dd
    if op == 0x4EBA and i + 4 <= N:
        dd = sw16(d[i + 2:i + 4])
        t = (i + 2 + dd) & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "jsr (d16,PC)"))
        i += 1
        continue
    # jsr abs.l: 4EB9 <aaaaaa>
    if op == 0x4EB9 and i + 6 <= N:
        t = (d[i + 2] << 16) | (d[i + 3] << 8) | d[i + 4]
        t = (t << 8) | d[i + 5]
        t = t & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "jsr abs.l"))
        i += 1
        continue
    # bsr (d16,PC): 6100 <dd16>
    if (op & 0xFF00) == 0x6100 and op != 0x61FF and i + 4 <= N:
        dd = sw16(d[i + 2:i + 4])
        t = (i + 2 + dd) & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "bsr (d16,PC)"))
        i += 1
        continue
    # bsr d32: 61FF <dd32>
    if op == 0x61FF and i + 6 <= N:
        dd = sw32(d[i + 2:i + 6])
        t = (i + 2 + dd) & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "bsr (d32)"))
        i += 1
        continue
    # jmp abs.l: 4EF9
    if op == 0x4EF9 and i + 6 <= N:
        t = (d[i + 2] << 16) | (d[i + 3] << 8) | d[i + 4]
        t = (t << 8) | d[i + 5]
        t = t & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "jmp abs.l"))
        i += 1
        continue
    # bra d16: 6000 (tail-call into family)
    if (op & 0xFF00) == 0x6000 and op not in (0x60FF, 0x60FE) and i + 4 <= N:
        dd = sw16(d[i + 2:i + 4])
        t = (i + 2 + dd) & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "bra (d16,PC)"))
        i += 1
        continue
    # bra d32: 60FF
    if op == 0x60FF and i + 6 <= N:
        dd = sw32(d[i + 2:i + 6])
        t = (i + 2 + dd) & 0xFFFFFF
        if in_family(t):
            results.append((i, t, "bra (d32)"))
        i += 1
        continue
    i += 1

# Also: lea $28Cxxx,A0  (41F9|r<<9  + aaaaaa) -- indirect cue dispatch leads
lea_hits = []
i = 0
while i + 6 <= N:
    op = (d[i] << 8) | d[i + 1]
    if (op & 0xF1FF) == 0x41F9:  # lea abs.l,An
        t = (d[i + 2] << 16) | (d[i + 3] << 8) | d[i + 4]
        t = (t << 8) | d[i + 5]
        t = t & 0xFFFFFF
        if WRAP_RANGE[0] <= t <= WRAP_RANGE[1]:
            reg = (op >> 9) & 7
            lea_hits.append((i, t, reg))
    i += 1

print("=== DIRECT CONTROL TRANSFERS INTO THE CUE FAMILY ===")
print(f"total: {len(results)} sites")
# group by target
from collections import defaultdict
by_tgt = defaultdict(list)
for site, tgt, kind in results:
    by_tgt[tgt].append((site, kind))
for tgt in sorted(by_tgt):
    note = FAMILY.get(tgt, f"[unnamed @${tgt:06X}]")
    sites = by_tgt[tgt]
    print(f"\n${tgt:06X}  {note}  ({len(sites)} site(s))")
    for site, kind in sorted(sites):
        print(f"    ${site:06X}  {kind}")

print("\n=== lea $28Cxxx,A0 (INDIRECT DISPATCH LEADS -- check each) ===")
print(f"total: {len(lea_hits)}")
for site, t, reg in lea_hits:
    print(f"    ${site:06X}  lea ${t:06X},A{reg}  -> {FAMILY.get(t, '[unnamed]')}")
