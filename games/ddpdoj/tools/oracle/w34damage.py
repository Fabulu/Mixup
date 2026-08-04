#!/usr/bin/env python3
r"""W34 -- THE DAMAGE INVENTORY, enumerated STATICALLY out of the ROM.

`docs/knowledge/09`: the ROM is the inventory, the oracle is the verdict.  This
script produces the DENOMINATORS for wave 34 and nothing else -- it runs no
emulator, compares nothing, and every number it prints is a count of something
read out of `out/maincpu.bin` (the decrypted build-B image, address == offset).

WHAT IT CAN AND CANNOT SEE -- the xref.py rule, restated because every count
below inherits it:

  CAN     absolute-long `jsr`/`jmp` ($4EB9/$4EF9 + 32-bit target)
          PC-relative `bsr.w` ($6100 + disp16) and `bsr.b` ($61xx)
  CANNOT  `jsr (An)` through a pointer, `jsr (d16,PC)`, a computed target

so every "N sites" is a LOWER BOUND and a zero is "no site of the kinds above",
never "nothing does this".

  python w34damage.py              the whole inventory
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMG = HERE / "out" / "maincpu.bin"
LO, HI = 0x230000, 0x2A0000          # build B

# ---------------------------------------------------------------- the subjects
# Every routine wave 34 enumerates, with the one-line description that says why
# it is in the damage inventory.  ADDRESSES ARE BUILD B.
SUBJECTS = [
    (0x244D62, "THE COLLISION/DAMAGE PASS -- reached only from $28B670/$28B766"),
    (0x244D40, "...its no-player entry (jmp $2459D0 with the box set up)"),
    (0x2459D0, "the PLAYER's own box vs $817F8E (L16 -- the ship being hit)"),
    (0x2453AC, "the LASER's collision pass (also bsr'd from $24530C)"),
    (0x24536E, "the LASER entry, from $24CE46 inside the option object"),
    (0x286096, "A HIT LANDS -- the per-hit score/chain entry"),
    (0x28615E, "A KILL -- the enemy's score value, from the CALL SITE"),
    (0x2862C6, "P1's per-hit chain machine"),
    (0x286476, "P2's per-hit chain machine"),
    (0x286626, "THE ONE BCD ADDER (four `abcd -(A1),-(A0)`)"),
    (0x28663A, "the chain-meter REFILL"),
    (0x286664, "the chain-meter CAP clamp"),
    (0x289004, "the sprite-EFFECT allocator"),
    (0x263762, "freeEnemy -- marks the sub-record DYING (byte 0 := 1)"),
    (0x28614A, "the P1 pending-score wrapper"),
    (0x286154, "the P2 pending-score wrapper"),
    (0x286128, "the by-D1 pending-score wrapper"),
    (0x2842B0, "the pending -> total DRAIN (once a frame)"),
]

# The stage-1 handler set, measured by W33 §1 and re-derived below from the
# script + the dispatcher rather than quoted.
SPAWN_SCRIPT = 0x230C6C
SCRIPT_END = 0x231704            # the $FFFF terminator
TYPE_TAB_LO = 0x267824           # types $00..$7F, stride 8
TYPE_TAB_HI = 0x27E412           # types $80..$FF
DUMMY_HANDLERS = (0x27E40A, 0x26781C)


def img() -> bytes:
    if not IMG.exists():
        raise SystemExit(f"{IMG} missing -- run `python derive.py` first")
    return IMG.read_bytes()


def u16(d, a):
    return struct.unpack_from(">H", d, a)[0]


def u32(d, a):
    return struct.unpack_from(">I", d, a)[0]


def find_all(d: bytes, pat: bytes, lo=LO, hi=HI) -> list[int]:
    out, i = [], lo
    while True:
        i = d.find(pat, i, hi)
        if i < 0:
            return out
        out.append(i)
        i += 1


def abs_callers(d: bytes, tgt: int) -> list[tuple[int, str]]:
    t = struct.pack(">I", tgt)
    out = [(s, "jsr") for s in find_all(d, b"\x4e\xb9" + t)]
    out += [(s, "jmp") for s in find_all(d, b"\x4e\xf9" + t)]
    out.sort()
    return out


def pcrel_callers(d: bytes, tgt: int) -> list[tuple[int, str]]:
    """Every `bsr.w`/`bsr.b`/`bra.w`/`bra.b` whose target is `tgt`.

    Scanned by trying EVERY even offset in range: a linear sweep would desync on
    the data tables embedded in this code, and a false positive here is visible
    (it names an address one can read) while a false negative is not.
    """
    out = []
    for pc in range(LO, HI, 2):
        op = u16(d, pc)
        if op in (0x6100, 0x6000):                    # bsr.w / bra.w
            disp = struct.unpack_from(">h", d, pc + 2)[0]
            if pc + 2 + disp == tgt:
                out.append((pc, "bsr.w" if op == 0x6100 else "bra.w"))
        elif (op & 0xFF00) in (0x6100, 0x6000) and (op & 0xFF) not in (0x00, 0xFF):
            disp = struct.unpack_from(">b", d, pc + 1)[0]
            if pc + 2 + disp == tgt:
                out.append((pc, "bsr.b" if (op & 0xFF00) == 0x6100 else "bra.b"))
    return out


def stage1_handlers(d: bytes) -> dict[int, list[int]]:
    """{handler -> [types]} for stage 1, straight out of the script."""
    by_handler: dict[int, list[int]] = {}
    types = set()
    a = SPAWN_SCRIPT
    while a < SCRIPT_END:
        types.add(d[a + 4])
        a += 8
    for t in sorted(types):
        base = TYPE_TAB_LO if t < 0x80 else TYPE_TAB_HI
        ent = base + (t & 0x7F) * 8
        h = u32(d, ent + 4)
        by_handler.setdefault(h, []).append(t)
    return by_handler


def targets_in(d: bytes, lo: int, hi: int) -> list[tuple[int, str, int]]:
    """Every call/branch target named by an ABSOLUTE jsr/jmp or a bsr in [lo,hi).

    A linear sweep desyncs on embedded data, so this scans every even offset and
    accepts only the four encodings whose operand is unambiguous.  That over-
    reports (a data word can look like a `jsr`), so every row is printed with
    its site for a human to check against the listing -- which is the point.
    """
    out = []
    for pc in range(lo, hi, 2):
        op = u16(d, pc)
        if op in (0x4EB9, 0x4EF9):
            t = u32(d, pc + 2)
            if LO <= t < HI:
                out.append((pc, "jsr" if op == 0x4EB9 else "jmp", t))
        elif op == 0x6100:
            out.append((pc, "bsr.w", pc + 2 + struct.unpack_from(">h", d, pc + 2)[0]))
        elif (op & 0xFF00) == 0x6100 and (op & 0xFF) not in (0x00, 0xFF):
            out.append((pc, "bsr.b", pc + 2 + struct.unpack_from(">b", d, pc + 1)[0]))
    return out


def main() -> int:
    d = img()
    print("=" * 78)
    print("W34 DAMAGE INVENTORY -- static, from out/maincpu.bin, build B only")
    print("=" * 78)

    print("\n--- 1. CALL-SITE POPULATION PER ROUTINE "
          "(abs jsr/jmp + pc-relative bsr/bra) ---")
    print(f"{'routine':>9} {'abs':>4} {'pcrel':>6}   what")
    totals = {}
    for a, what in SUBJECTS:
        ab = abs_callers(d, a)
        pc = pcrel_callers(d, a)
        totals[a] = (ab, pc)
        print(f"  ${a:06X} {len(ab):4d} {len(pc):6d}   {what}")

    print("\n--- 2. THE 19 STAGE-1 HANDLERS x THE DAMAGE ROUTINES ---")
    hs = stage1_handlers(d)
    print(f"  stage-1 distinct handlers: {len(hs)}   "
          f"distinct types: {sum(len(v) for v in hs.values())}")

    print("\n--- 2b. THE DAMAGE PASS $244D62..$245312: EVERY TARGET IT NAMES ---")
    seen = {}
    for pc, kind, t in targets_in(d, 0x244D62, 0x245312):
        seen.setdefault(t, []).append((pc, kind))
    for t in sorted(seen):
        sites = " ".join(f"${p:06X}/{k}" for p, k in seen[t])
        print(f"  -> ${t:06X}   {sites}")
    if not seen:
        print("  NONE -- the pass is self-contained (no jsr/jmp/bsr at all)")

    print("\n--- 2c. THE SCORE CORE $286096..$2866A8: EVERY TARGET IT NAMES ---")
    seen = {}
    for pc, kind, t in targets_in(d, 0x286096, 0x2866A8):
        seen.setdefault(t, []).append((pc, kind))
    for t in sorted(seen):
        sites = " ".join(f"${p:06X}/{k}" for p, k in seen[t])
        inside = "  (inside this range)" if 0x286096 <= t < 0x2866A8 else ""
        print(f"  -> ${t:06X}   {sites}{inside}")

    print("\n--- 3. $289004's OWN DENOMINATORS, read out of the listing ---")
    # $289004: `cmpi.w #$21,D1 / bhi` range check and `move.w #$4F,D1` pool walk.
    kinds = None
    slots = None
    pool = None
    for pc in range(0x289004, 0x289070, 2):
        if u16(d, pc) == 0x0C41:                       # cmpi.w #imm,D1
            kinds = u16(d, pc + 2)
        if u16(d, pc) == 0x323C:                       # move.w #imm,D1
            slots = u16(d, pc + 2)
        if (u16(d, pc) & 0xF1FF) == 0x41F9:            # lea abs.l,An
            v = u32(d, pc + 2)
            if 0x810000 <= v < 0x820000 and pool is None:
                pool = v
    print(f"  effect-kind range check  cmpi.w #${kinds:04X},D1  -> {kinds + 1} kinds"
          if kinds is not None else "  (no cmpi.w found)")
    print(f"  pool walk                move.w #${slots:04X},D1  -> {slots + 1} slots"
          if slots is not None else "  (no move.w #imm,D1 found)")
    print(f"  pool base                lea ${pool:06X}" if pool else "")

    print("\n--- 4. $28615E's SCORE IMMEDIATES, recovered per call site ---")
    ab = totals[0x28615E][0]
    vals = []
    for s, _ in ab:
        v = backwalk_d0(d, s)
        vals.append((s, v))
    good = [v for _, v in vals if v is not None]
    bcd_ok = [v for v in good if all(c in "0123456789" for c in f"{v:X}")]
    print(f"  {len(ab)} absolute call sites; D0 immediate recovered at "
          f"{len(good)}; VALID PACKED BCD: {len(bcd_ok)} of {len(good)}")
    print("  values: " + " ".join(f"{v:X}" for _, v in sorted(vals, key=lambda x: (x[1] is None, x[1] or 0)) if v is not None))
    miss = [f"${s:06X}" for s, v in vals if v is None]
    if miss:
        print("  NOT RECOVERED: " + " ".join(miss))
    return 0


def backwalk_d0(d: bytes, site: int, span: int = 0x40) -> int | None:
    """The last thing that loads D0 in the `span` bytes before `site`.

    Recognises `moveq #imm,D0` ($70xx) and `move.w #imm,D0` ($303C).  Returns
    None when neither appears -- which is the honest answer for a site whose D0
    comes out of a struct, and W19 §1.2 counted those separately for the same
    reason.
    """
    best = None
    for pc in range(site - span, site, 2):
        op = u16(d, pc)
        if (op & 0xFF00) == 0x7000:                    # moveq #imm,D0
            best = struct.unpack_from(">b", d, pc + 1)[0] & 0xFF
        elif op == 0x303C:                             # move.w #imm,D0
            best = u16(d, pc + 2)
        elif op == 0x203C:                             # move.l #imm,D0
            best = u32(d, pc + 2)
    return best


if __name__ == "__main__":
    raise SystemExit(main())
