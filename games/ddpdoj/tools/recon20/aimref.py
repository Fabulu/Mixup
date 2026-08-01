#!/usr/bin/env python3
"""RECON 20 -- enumerate every CALL SITE of the player-tracking library.

Scans the DECRYPTED :maincpu image for every control transfer whose TARGET is
one of the aim/target/distance entry points.  Covers BOTH the absolute-long
forms xref.py can see AND the PC-relative forms only pcref.py can see:

  4EB9 jsr abs.l    4EF9 jmp abs.l
  4EBA jsr (d16,PC) 4EFA jmp (d16,PC)
  61xx/6100 bsr.s/.w    60xx/6000 bra.s/.w    6xxx Bcc

LIMIT, state it every time: this is a LINEAR BYTE SCAN at even offsets over a
region that contains DATA as well as code, so a hit is a CANDIDATE until it is
confirmed by disassembling backwards.  It is an UPPER bound on `jsr abs.l`
(exact in practice) and an upper bound with noise on the short PC-relative
forms.  Counts are printed split by form so the noisy ones are visible.
"""
import struct, sys, collections
from pathlib import Path

IMG = Path(__file__).resolve().parent.parent / "oracle" / "out" / "maincpu.bin"
d = IMG.read_bytes()
LO, HI = 0x230000, 0x2B0000        # build B only

ENTRIES = {
    # --- 64-direction aim -------------------------------------------------
    0x241FEA: "aim64  target=(3,A5)  self=(2,A6)  -> STORE (1B,A6)",
    0x241FF4: "aim64  target=(2E,A6) self=(2,A6)  -> D1",
    0x241FFC: "aim64  target=(2E,A6) self=CALLER  -> D1",
    0x24200A: "aim64  target=(3,A5)  self=CALLER  -> D1",
    0x242018: "aim64  target=P2 FIXED self=(2,A6) -> D1",
    0x242022: "aim64  target=P1 FIXED self=(2,A6) -> D1",
    0x24202C: "aim64  target=(3,A5)  self=(2,A6)  -> D1",
    0x24203E: "aim64  CORE   self=D0/D1 target=D2/D3 -> D1",
    0x242178: "aim64+turn1 -> STORE (1B,A6)",
    0x242186: "aim64+turn1 -> D1",
    # --- the turn (slew) limiters ----------------------------------------
    0x24218C: "turn64  cur=(1B,A6) step 1",
    0x242190: "turn64  cur=D0 step 1",
    0x2421AC: "turn256 cur=(1B,A6) step 1",
    0x2421C6: "turn64  cur=(1B,A6) step up to D5",
    0x242206: "turn256 cur=(1B,A6) step up to D5",
    # --- 256-direction aim ------------------------------------------------
    0x242242: "aim256 target=(3,A5) +turn1 -> STORE (1B,A6)",
    0x242252: "aim256 target=(3,A5) +turn1 -> D1",
    0x24225C: "aim256 target=(3,A5)        -> STORE (1B,A6)",
    0x242266: "aim256 target=(2E,A6)       -> D1",
    0x24226E: "aim256 target=(3,A5) self=CALLER -> D1",
    0x24227C: "aim256 target=P2 FIXED      -> D1",
    0x242286: "aim256 target=P1 FIXED      -> D1",
    0x242290: "aim256 target=(3,A5) self=(2,A6) -> D1",
    0x2422A2: "aim256 CORE   self=D0/D1 target=D2/D3 -> D1",
    # --- target selectors (read the player ALIVE words) -------------------
    0x24270A: "target-select by (3,A5)",
    0x242730: "target-select by (2E,A6)",
    0x242748: "target-select by (2A,A6)",
    0x242760: "target-select PSEUDO-RANDOM  $242784[$803916.b++]",
    # --- distance / nearest (read the player POSITION, return a scalar) ---
    0x2423A4: "dist: min(both) vs STAGE table $242410 -> CCR",
    0x2423E0: "dist: one player, octagonal",
    0x2423FA: "dist: vs STAGE table $242410 -> CCR",
    0x24241A: "dist: vs STAGE table $24242E -> CCR",
    0x242438: "dist: min over both players",
    0x242454: "dist: to (3,A5)-selected target",
    0x24245C: "dist: to P1 else P2, -1 if none",
    0x242486: "dist: one player (A0), self=(2,A6)",
    0x24249A: "dist CORE: max(3/4|dy|,|dx|) + min/2",
    0x2424BA: "dist |dY| min over both, A0 = the nearer",
    0x2424EA: "dist |dY| one player",
    0x2424FC: "dist |dX| min over both, A0 = the nearer",
    0x24252C: "dist |dX| one player",
    0x268024: "nearest-player select at spawn (own metric)",
    # --- for contrast: NOT player tracking --------------------------------
    0x242A48: "RANDOM direction: RNG $23D17E -> $242A70[16] -> (1B,A6)",
}

hits = collections.defaultdict(lambda: collections.defaultdict(list))
for a in range(LO, HI, 2):
    op = struct.unpack_from(">H", d, a)[0]
    tgt = form = None
    if op in (0x4EB9, 0x4EF9):
        tgt = struct.unpack_from(">I", d, a + 2)[0] & 0xFFFFFF
        form = "jsr.l" if op == 0x4EB9 else "jmp.l"
    elif op in (0x4EBA, 0x4EFA):
        tgt = a + 2 + struct.unpack_from(">h", d, a + 2)[0]
        form = "jsr.pc" if op == 0x4EBA else "jmp.pc"
    elif (op & 0xFF00) in (0x6100, 0x6000) or (0x6200 <= op <= 0x6F00 + 0xFF):
        lo = op & 0xFF
        if lo == 0:
            tgt = a + 2 + struct.unpack_from(">h", d, a + 2)[0]
        elif lo == 0xFF:
            continue
        else:
            tgt = a + 2 + (lo - 256 if lo > 127 else lo)
        k = (op >> 8) & 0xFF
        form = "bsr" if k == 0x61 else ("bra" if k == 0x60 else "Bcc")
    if tgt in ENTRIES:
        hits[tgt][form].append(a)

tot_sites = 0
print("ENTRY     n  by form                                  what")
for e in sorted(ENTRIES):
    h = hits.get(e, {})
    n = sum(len(v) for v in h.values())
    tot_sites += n
    forms = " ".join(f"{k}={len(v)}" for k, v in sorted(h.items()))
    print(f"{e:06X} {n:4d}  {forms:38s}  {ENTRIES[e]}")
print(f"\nENTRY POINTS: {len(ENTRIES)}   CALL SITES (candidates): {tot_sites}")

if len(sys.argv) > 1 and sys.argv[1] == "sites":
    for e in sorted(ENTRIES):
        for f, v in sorted(hits.get(e, {}).items()):
            print(f"{e:06X} {f:7s} " + " ".join(f"{x:06X}" for x in v))
