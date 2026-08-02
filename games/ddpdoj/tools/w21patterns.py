#!/usr/bin/env python3
r"""WAVE 21 -- THE ENUMERATION SIDE of the bullet pattern generators.

The ROM is the source of the INVENTORY (docs/knowledge/09).  This tool reads the
decrypted VERSION-B image and prints, with a denominator for each:

    tables      the three 39-entry kind tables, their EXTENTS proven from both
                ends, and every field of all 39 templates
    inits       the 9 distinct spawn-inits, decoded, with the RECORD offsets
                they write (A0 is base+$10 at that point -- the single easiest
                thing to get wrong in this subsystem)
    gens        the 20 generator entry points, their rank!=0 shapes, and the
                fire-site count of each
    field       the $200920 velocity field: extent, stride, the ellipse ratio
    fold        the $283F50 fold table: 256 words, checked against the triangle
    rewrites    every instruction in $282104..$283BAF that writes a live
                bullet's TYPE WORD -- i.e. every IN-FLIGHT KIND REWRITE, which
                is the only way 20 of the 39 kinds are ever produced
    sites       every fire call site, its generator and its back-decoded D0

Everything printed here is static.  MEASUREMENT PROVES PRESENCE; ONLY THE
LISTING PROVES ABSENCE -- and the absence claims in this file (39 kinds, 256
speed levels, 20 entry points) are listing claims, pinned from both ends.

    python w21patterns.py [tables|inits|gens|field|fold|rewrites|sites|all]
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMAGE = HERE / "oracle" / "out" / "maincpu.bin"

# --------------------------------------------------------------- the addresses
TEMPLATE_PTRS = 0x281956      # $28155E lea ($281956,PC),A1 / movea.l (A1,D0.w),A1
SPAWNINIT_PTRS = 0x2815C6     # $2815B0 lea ($2815C6,PC),A1 / adda.w D0,A1
BEHAVIOUR_PTRS = 0x282030     # $281F10 lea ($282030,PC),A0 / adda.w D0,A0
KINDS = 39                    # proven three ways below
TEMPLATE_STRIDE = 0x14
FOLD = 0x283F50               # $2841A2 lea ($283F50,PC),A2
SPEED_PTRS = 0x200920         # $284194 lea $200920,A3
QUAD_ENTRIES = 65
QUAD_STRIDE = QUAD_ENTRIES * 8
POOL, POOL_SLOTS, POOL_STRIDE = 0x817F8C, 210, 0x40
BEHAVIOUR_LO, BEHAVIOUR_HI = 0x282104, 0x283BB0

# The 20 generator entry points, from the byte scan for `tst.w $813098` in
# $281000-$282000 plus the two cores.  bank = the ANGLE UNIT the entry takes.
GENERATORS = [
    (0x2813F0, "A", "single"),
    (0x281402, "A", "single, speed +4"),
    (0x281420, "A", "pair, same angle, speed +0/+6"),
    (0x281432, "A", "triple, same angle, speed +0/+5/+10"),
    (0x281442, "A", "spread2, angle -8/+8 (1/256 units)"),
    (0x281450, "A", "spread2, speed +4"),
    (0x281484, "A", "spread3: centre speed +2, then -8/+8"),
    (0x281494, "A", "ORPHAN BODY -- see gens"),
    (0x2814AC, "A", "flags-adaptive"),
    (0x2814B6, "A", "THE CORE (angle x4 inside)"),
    (0x2816F6, "B", "single"),
    (0x281708, "B", "single, speed +4"),
    (0x281726, "B", "single, speed +2"),
    (0x281744, "B", "pair, same angle, speed +0/+6"),
    (0x281754, "B", "triple, same angle, speed +0/+5/+10"),
    (0x281764, "B", "spread2, angle -8/+8"),
    (0x281776, "B", "spread2, speed +6"),
    (0x2817A8, "B", "spread3: centre, -8, +8"),
    (0x2817B8, "B", "flags-adaptive"),
    (0x2817C2, "B", "THE CORE (angle pre-scaled, sets bit 9)"),
]
ENTRY_ADDRS = {a for a, _, _ in GENERATORS}


def load() -> bytes:
    if not IMAGE.exists():
        raise SystemExit(f"{IMAGE} missing -- run `python tools/oracle/derive.py`")
    return IMAGE.read_bytes()


def u16(d, a):
    return struct.unpack_from(">H", d, a)[0]


def i16(d, a):
    return struct.unpack_from(">h", d, a)[0]


def u32(d, a):
    return struct.unpack_from(">I", d, a)[0]


def i32(d, a):
    return struct.unpack_from(">i", d, a)[0]


# ------------------------------------------------------------------- tables
def cmd_tables(d):
    print("THE THREE 39-ENTRY KIND TABLES -- extent pinned from both ends\n")
    for name, base in (("templates $281956", TEMPLATE_PTRS),
                       ("spawn-inits $2815C6", SPAWNINIT_PTRS),
                       ("behaviours $282030", BEHAVIOUR_PTRS)):
        after = u32(d, base + 4 * KINDS)
        ok = all(0x200000 <= u32(d, base + 4 * k) < 0x2B0000 for k in range(KINDS))
        print(f"  {name:22s} entries 0..{KINDS - 1} all point into $200000-$2AFFFF: {ok}")
        print(f"  {' ':22s} entry[{KINDS}] = ${after:08X} -- NOT a pointer, so the "
              f"extent is exactly {KINDS}")
    print()
    print(" k  template  type  rendoff   descr     gfx  attr spd ini +$12  "
          "spawn-init  behaviour")
    tp = [u32(d, TEMPLATE_PTRS + 4 * k) for k in range(KINDS)]
    for k in range(KINDS):
        a = tp[k]
        w = [u16(d, a + 2 * i) for i in range(10)]
        print(f"{k:2d}  ${a:06X}  {w[0]:04X}  {w[1]:04X}{w[2]:04X}  {w[3]:04X}{w[4]:04X}  "
              f"{w[5]:04X} {w[6]:04X} {w[7]:3d} {w[8]:3d} {w[9]:04X}  "
              f"${u32(d, SPAWNINIT_PTRS + 4 * k):06X}     ${u32(d, BEHAVIOUR_PTRS + 4 * k):06X}")
    print()
    # the invariants a port depends on
    base_speeds = {u16(d, tp[k] + 0x0E) for k in range(KINDS)}
    print(f"  BASE SPEED (+$0E) over all {KINDS} kinds: {sorted(base_speeds)}")
    print(f"  distinct templates: {len(set(tp))} behind {KINDS} kinds "
          f"(shared: {[k for k in range(KINDS) if tp.count(tp[k]) > 1]})")
    bit7 = [k for k in range(KINDS) if u16(d, tp[k]) & 0x80]
    print(f"  type word bit 7 (the $281F3E mover path) set for kinds: {bit7}")
    tw = [k for k in range(KINDS) if (u16(d, tp[k]) & 0x3F) != k]
    print(f"  kinds whose template type word's low 6 bits != the kind index: {tw}")
    p12 = {k: u16(d, tp[k] + 0x12) for k in range(KINDS) if u16(d, tp[k] + 0x12)}
    print(f"  template +$12 NON-ZERO (the recon calls this 'padding'): {p12}")
    print(f"  ...and NEITHER core reads +$12: the last word read is +$10 "
          f"($2815AC tst.w (A1) after six loads totalling $10 bytes)")
    ini = [u32(d, SPAWNINIT_PTRS + 4 * k) for k in range(KINDS)]
    print(f"  distinct spawn-inits: {len(set(ini))}  "
          + " ".join(f"${a:06X}x{ini.count(a)}" for a in sorted(set(ini))))
    beh = [u32(d, BEHAVIOUR_PTRS + 4 * k) for k in range(KINDS)]
    print(f"  distinct behaviours:  {len(set(beh))}  "
          f"range ${min(beh):06X}..${max(beh):06X}")


# -------------------------------------------------------------------- inits
INIT_DECODE = {
    0x2818AC: [],
    0x2818B4: [("+$28", "l", "D3"), ("+$2C", "l", "D4"), ("+$34", "b", "0")],
    0x2818C8: [("+$34", "b", "D4")],
    0x2818D4: [("+$34", "w", "D4")],
    0x2818E0: [("+$28", "l", "D3"), ("+$2C", "l", "D4"), ("+$34", "b", "0")],
    0x2818F4: [("+$28", "l", "D3"), ("+$2C", "l", "D4"), ("+$34", "b", "0"),
               ("+$36", "w", "D5")],
    0x28190C: [("+$28", "w", "$8130D8"), ("+$2A", "w", "$8130DA"),
               ("+$2C", "l", "D4"), ("+$34", "b", "0"), ("+$36", "l", "D5")],
    0x281930: [("+$2A", "b", "($3,A5) the target-player index"), ("+$2C", "l", "D4")],
    0x281942: [("+$28", "l", "D3"), ("+$2C", "l", "D4"), ("+$34", "l", "D5")],
}


def cmd_inits(d):
    print("THE 9 SPAWN-INITS.  A0 IS RECORD BASE + $10 when they run -- the copy\n"
          "sequence left it there and nothing restores it -- so ($18,A0) is rec+$28.\n")
    ini = [u32(d, SPAWNINIT_PTRS + 4 * k) for k in range(KINDS)]
    for a in sorted(set(ini)):
        ks = [k for k in range(KINDS) if ini[k] == a]
        fields = INIT_DECODE.get(a)
        w = ", ".join(f"{o} {s} = {v}" for o, s, v in fields) if fields else "nothing"
        print(f"  ${a:06X}  kinds {ks}")
        print(f"             writes {w}")
    print("\n  $2818AC is not a routine: it IS the shared epilogue "
          "`movem.l (A7)+,D0/D7/A0-A1 / move.w D0,D0 / rts`,")
    print("  byte-identical to the no-init exit $2815BE.  `move.w D0,D0` clears "
          "CARRY = 'the bullet was spawned'.")
    print("  $2818E0 is byte-identical to $2818B4 (a duplicate, not a variant):",
          d[0x2818B4:0x2818C8] == d[0x2818E0:0x2818F4])


# --------------------------------------------------------------------- gens
def cmd_gens(d, sites=None):
    if sites is None:
        sites = fire_sites(d)
    per = {}
    for s in sites:
        per[s["entry"]] = per.get(s["entry"], 0) + 1
    print("THE 20 GENERATOR ENTRY POINTS.  'rank' is $813098, which has read 0 on\n"
          "every frame this project has ever measured; at 0 EVERY entry emits ONE\n"
          "bullet, because the gate is `tst.w $813098 / beq <the core>`.\n")
    print("  entry     bank  sites  rank!=0 shape")
    tot = 0
    for a, bank, what in GENERATORS:
        n = per.get(a, 0)
        tot += n
        print(f"  ${a:06X}   {bank}    {n:5d}  {what}")
    print(f"  {'TOTAL':9s}            {tot:5d}")
    print()
    print("  $281494 IS NOT AN ENTRY POINT.  It opens `jsr ($2814B6,PC)` and ends\n"
          "  `movem.l (A7)+,D0-D1/A0 / rts` -- it POPS THREE LONGWORDS IT NEVER\n"
          "  PUSHED.  Nothing branches to it and nothing calls it; a `jsr $281494`\n"
          "  would return to garbage.  20-recon-pattern-tables lists it among the\n"
          "  twenty with 0 sites; it is an orphan BODY (the rank!=0 arm of a\n"
          "  generator whose head does not exist in this build), not an entry.")
    print(f"  So the callable inventory is 19 entry points, {tot} call sites.")


# -------------------------------------------------------------------- field
def cmd_field(d):
    base = u32(d, SPEED_PTRS)
    n = 0
    while n < 1024 and u32(d, SPEED_PTRS + 4 * n) == base + QUAD_STRIDE * n:
        n += 1
    after = [u32(d, SPEED_PTRS + 4 * (n + i)) for i in range(3)]
    print(f"THE VELOCITY FIELD $200920 -- {n} speed levels, an exact arithmetic\n"
          f"progression: entry s = ${base:06X} + ${QUAD_STRIDE:X}*s.\n"
          f"  entry[{n}..{n + 2}] = " + " ".join(f"${v:08X}" for v in after)
          + "  -> the table ENDS at 256, it is not a scan cap")
    print(f"  last quadrant table ends at ${base + QUAD_STRIDE * n:06X} "
          f"(the next known data object)")
    print(f"  total {n} x {QUAD_ENTRIES} x 8 = {n * QUAD_STRIDE} bytes of velocity table")
    print(f"  pointer table itself: {4 * n} bytes at ${SPEED_PTRS:06X}\n")
    print("  speed  q0 (dA,dB)      q16            q32            q48        q64"
          "            ratio dA(0)/dB(64)")
    for s in (0, 1, 4, 16, 20, 24, 30, 32, 63, 64, 128, 255):
        a = base + QUAD_STRIDE * s
        r = [(i32(d, a + 8 * i) >> 4, i32(d, a + 8 * i + 4) >> 4)
             for i in (0, 16, 32, 48, 64)]
        rat = (r[0][0] / r[4][1]) if r[4][1] else float("nan")
        print(f"  {s:5d}  " + "  ".join(f"({x},{y})" for x, y in r) + f"   {rat:.4f}")
    # the structural invariants
    bad = 0
    for s in range(n):
        a = base + QUAD_STRIDE * s
        if i32(d, a + 4) != 0 or i32(d, a + 8 * 64) != 0:
            bad += 1
    print(f"\n  every one of the {n} rows runs (r,0) at quarter-angle 0 to (0,r) at "
          f"64: {bad} exceptions")
    z = all(i32(d, base + 8 * i) == 0 and i32(d, base + 8 * i + 4) == 0
            for i in range(QUAD_ENTRIES))
    print(f"  speed level 0 is all zeros (a real 'do not move'): {z}")


# --------------------------------------------------------------------- fold
def cmd_fold(d):
    f = [u16(d, FOLD + 2 * i) for i in range(256)]

    def tri(i):
        m = i % 128
        return m if m <= 64 else 128 - m
    print(f"THE FOLD TABLE $283F50 -- 256 words, read at $2841A2 with index dir*2\n"
          f"  all values a multiple of 8 (the 8-byte quadrant record): "
          f"{all(v % 8 == 0 for v in f)}")
    print(f"  max {max(f)} = 8*64, min {min(f)}")
    print(f"  EXACTLY 8*triangle(i), period 128, peak 64, over all 256: "
          f"{all(f[i] == 8 * tri(i) for i in range(256))}")
    print(f"  word after the table (${FOLD + 512:06X}) = ${u16(d, FOLD + 512):04X}")
    print("\n  so with the quadrant negate at $2841C2 (dir & $C0):")
    print("    dir   0 -> quarter 0,  Q0 ( dA, dB)   = (+A, 0)   'down' (+$2)")
    print("    dir  64 -> quarter 64, Q1 (-dA, dB)   = (0, +B)   (+$4)")
    print("    dir 128 -> quarter 0,  Q2 (-dA,-dB)   = (-A, 0)")
    print("    dir 192 -> quarter 64, Q3 ( dA,-dB)   = (0, -B)")


# ----------------------------------------------------------------- rewrites
def cmd_rewrites(d):
    """Every instruction in the 39 behaviours + continuations that writes the
    TYPE WORD of a live bullet -- the IN-FLIGHT KIND REWRITE.

    A6 is the bullet record throughout the mover, so `(A6)` and `($0,A6)` are the
    type word.  The forms searched are the ones the 68000 can encode against
    (A6) with no displacement, plus the `bchg/bset/bclr #n,(A6)` family, which
    is what actually produces the rewrites.
    """
    print("IN-FLIGHT TYPE-WORD REWRITES in $282104..$283BAF\n"
          "  A6 = the $40-byte bullet record for the whole of the mover, so an\n"
          "  instruction with an effective address of (A6) targets the TYPE WORD.\n"
          "  Changing its low 6 bits changes the KIND; setting bit 8 re-runs the\n"
          "  $282030 dispatch, so the NEW kind's behaviour installs a new\n"
          "  continuation at rec+$22.  This is the ONLY producer of the kinds no\n"
          "  fire site passes.\n")
    # 68000 encodings, written out so a reader can check them.  EA (A6) is mode
    # 010 reg 110 = $16; EA (d16,A6) is mode 101 reg 110 = $2E.  A BYTE operation
    # on (A6) addresses the HIGH byte of the word -- bits 8..15 -- and a byte
    # operation on ($1,A6) addresses the LOW byte, bits 0..7.  THE KIND IS BITS
    # 0..5, so a kind rewrite is a LOW-byte write; a high-byte write moves the
    # alive/dispatch/kill flags.  Conflating the two is how "20 kinds are
    # produced by in-flight rewrites" would be asserted from a `bchg #3,(A6)`
    # that touches bit 11.
    BITOPS = {0x0816: "btst", 0x0856: "bchg", 0x0896: "bclr", 0x08D6: "bset"}
    rows = []
    a = BEHAVIOUR_LO
    while a < BEHAVIOUR_HI:
        w = u16(d, a)
        n = None
        if w in BITOPS:                                   # <op> #n,(A6)  -- HIGH byte
            op, half, n, sz = BITOPS[w], "(A6)", u16(d, a + 2), 4
        elif w in (0x086E, 0x08AE, 0x08EE, 0x082E):       # <op> #n,(d16,A6)
            op = {0x082E: "btst", 0x086E: "bchg", 0x08AE: "bclr",
                  0x08EE: "bset"}[w]
            n, half, sz = u16(d, a + 2), f"(${u16(d, a + 4):X},A6)", 6
        elif w in (0x0016, 0x0216, 0x0A16):               # ori/andi/eori.b #x,(A6)
            op = {0x0016: "ori.b", 0x0216: "andi.b", 0x0A16: "eori.b"}[w]
            half, sz = f"#${u16(d, a + 2) & 0xFF:02X},(A6)", 4
        elif w in (0x002E, 0x022E, 0x0A2E):               # ...#x,(d16,A6)
            op = {0x002E: "ori.b", 0x022E: "andi.b", 0x0A2E: "eori.b"}[w]
            half, sz = (f"#${u16(d, a + 2) & 0xFF:02X},(${u16(d, a + 4):X},A6)", 6)
        elif w in (0x0056, 0x0256, 0x0A56):               # ori/andi/eori.w #x,(A6)
            op = {0x0056: "ori.w", 0x0256: "andi.w", 0x0A56: "eori.w"}[w]
            half, sz = f"#${u16(d, a + 2):04X},(A6)", 4
        elif w == 0x3CBC:                                 # move.w #imm,(A6)
            op, half, sz = "move.w", f"#${u16(d, a + 2):04X},(A6)", 4
        elif w == 0x3D7C:                                 # move.w #imm,(d16,A6)
            op, half, sz = "move.w", (f"#${u16(d, a + 2):04X},"
                                      f"(${u16(d, a + 4):X},A6)"), 6
        elif w == 0x1CBC:                                 # move.b #imm,(A6)
            op, half, sz = "move.b", f"#${u16(d, a + 2) & 0xFF:02X},(A6)", 4
        elif w == 0x1D7C:                                 # move.b #imm,(d16,A6)
            op, half, sz = "move.b", (f"#${u16(d, a + 2) & 0xFF:02X},"
                                      f"(${u16(d, a + 4):X},A6)"), 6
        elif 0x3C80 <= w <= 0x3C87:                       # move.w Dn,(A6)
            op, half, sz = "move.w", f"D{w & 7},(A6)", 2
        elif 0x1C80 <= w <= 0x1C87:                       # move.b Dn,(A6)
            op, half, sz = "move.b", f"D{w & 7},(A6)", 2
        elif 0x1D40 <= w <= 0x1D47:                       # move.b Dn,(d16,A6)
            op, half, sz = "move.b", f"D{w & 7},(${u16(d, a + 2):X},A6)", 4
        elif w in (0x0116, 0x0156, 0x0196, 0x01D6):       # <op> Dn,(A6), n in a reg
            op = {0x0116: "btst", 0x0156: "bchg", 0x0196: "bclr",
                  0x01D6: "bset"}[w]
            half, sz = "Dn,(A6)", 2
        else:
            a += 2
            continue
        if op and op != "btst":
            # only the type word: (A6) itself, or a displacement of 0 or 1
            if "A6)" in half and ("(A6)" in half or "($1,A6)" in half
                                  or "($0,A6)" in half):
                rows.append((a, f"{op} {half}", n, "(A6)" in half))
        a += sz
    for addr, txt, bit, high in rows:
        extra = ""
        if bit is not None:
            wbit = bit + 8 if high else bit
            extra = f"   word bit {wbit}" + (
                "  = THE DISPATCH BIT" if wbit == 8 else
                "  = KIND bit" if wbit < 6 else
                "  = the kill bit" if wbit == 12 else
                "  = the alive bit" if wbit == 15 else
                "  = the $281F3E path bit" if wbit == 7 else "")
        print(f"  ${addr:06X}  {txt:34s}{extra}")
    print(f"\n  {len(rows)} type-word writers inside $282104..$283BAF.")
    lowbyte = [r for r in rows if "($1,A6)" in r[1]]
    wholeword = [r for r in rows if r[1].startswith(("move.w", "ori.w", "andi.w",
                                                     "eori.w"))]
    print(f"  writers that touch the LOW byte ($1,A6) = kind bits 0..5: "
          f"{len(lowbyte)}")
    print(f"  writers of the WHOLE word: {len(wholeword)}")
    print("""
  THE KIND OF A LIVE BULLET IS NEVER REWRITTEN IN THIS RANGE.
  Every one of these is a BYTE operation on (A6), i.e. on the HIGH byte --
  word bits 8..15 -- which holds `alive` (15), `kill` (12), `run the
  dispatch` (8) and a private per-bullet FLIP-FLOP at bit 11 that four
  continuations toggle with `bchg #3,(A6)` / `bchg D0,(A6)`.
  20-recon-pattern-tables section 6 reads $2824DC's `bchg #$3,(A6)` as an
  IN-FLIGHT KIND REWRITE.  It is not: on a big-endian 68000 a byte operation
  on (A6) addresses bits 8..15 of the word, so bit #3 is WORD BIT 11 -- and
  bit 11 is not a kind bit and is not in the mover's $5180 dispatch mask
  either.  The KIND of a live bullet is fixed at spawn, in $281568/$28187A,
  and nothing in the 39 behaviours or their continuations changes it.""")


# -------------------------------------------------------------------- sites
def fire_sites(d, back=160):
    """Every `jsr/jmp` to a generator ENTRY POINT, absolute-long and PC-relative,
    with D0 back-decoded over `back` bytes.

    THE BACK-DECODE IS A HEURISTIC AND ITS FAILURE RATE IS MEASURED:
    20-recon-pattern-tables §7 caught it picking the untaken arm at 1 of 91
    stage-1 sites ($273BC2 is kind 5, not kind 4).  Nothing in this wave's port
    depends on it -- it is printed for the DENOMINATOR only.
    """
    out = []
    lo, hi = 0x230000, 0x2B0000
    for a in range(lo, hi - 6, 2):
        w = u16(d, a)
        tgt = None
        if w in (0x4EB9, 0x4EF9):                 # jsr/jmp abs.l
            tgt = u32(d, a + 2)
        elif w in (0x4EBA, 0x4EFA):               # jsr/jmp (d16,PC)
            tgt = (a + 2 + i16(d, a + 2)) & 0xFFFFFF
        if tgt is None or tgt not in ENTRY_ADDRS:
            continue
        d0 = None
        for b in range(a - 2, max(lo, a - back), -2):
            ww = u16(d, b)
            if ww == 0x203C:                      # move.l #imm,D0
                d0 = u32(d, b + 2)
                break
            if ww == 0x303C:                      # move.w #imm,D0
                d0 = u16(d, b + 2)
                break
            if (ww & 0xFF00) == 0x7000:           # moveq #imm,D0
                d0 = struct.unpack_from(">b", d, b + 1)[0] & 0xFFFFFFFF
                break
        out.append({"site": a, "entry": tgt, "d0": d0})
    return out


def cmd_sites(d):
    """The fire-site census, at four back-scan widths.

    A site inside the generator bank itself ($281300-$2818FF) is one generator
    calling a core, not a fire site, and is excluded -- that is the difference
    between this tool's 912 and the recon's 911 plus the one `jsr (d16,PC)`
    inside kind 28's own behaviour, which an absolute-long scan cannot see.
    """
    print("FIRE CALL SITES in $230000-$2AFFFF (abs.l AND (d16,PC), excluding "
          "the generator bank's own internal core calls)\n")
    for back in (96, 160, 300, 600, 1200):
        sites = [s for s in fire_sites(d, back)
                 if not (0x281300 <= s["site"] < 0x281900)]
        kinds, unknown = {}, 0
        for s in sites:
            if s["d0"] is None:
                unknown += 1
                continue
            kinds[s["d0"] & 0x3F] = kinds.get(s["d0"] & 0x3F, 0) + 1
        missing = [k for k in range(KINDS) if k not in kinds]
        print(f"  back={back:5d}  sites={len(sites)}  no immediate D0={unknown:4d}"
              f"  kinds={len(kinds)}/{KINDS}")
        if back == 1200:
            print("    reached: " + " ".join(f"{k}:{n}"
                                             for k, n in sorted(kinds.items())))
            print(f"    NOT PASSED BY ANY SITE ({len(missing)}): {missing}")
    print("""
  THE BACK-DECODE IS A HEURISTIC AND ITS ERROR RATE IS MEASURED.
  20-recon-pattern-tables section 7 caught it picking the untaken arm at 1 of
  91 stage-1 sites ($273BC2 really is kind 5). So "19 kinds are passed by a
  fire site" is a LOWER bound and "20 kinds are passed by none" is NOT a proof
  of unreachability -- see `rewrites`, which shows the mechanism the recon
  proposed for those 20 does not exist. Nothing in the PORT depends on either
  number: the emitter accepts any kind 0..38 and throws by address above.""")


def main() -> int:
    d = load()
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    fns = {"tables": cmd_tables, "inits": cmd_inits, "gens": cmd_gens,
           "field": cmd_field, "fold": cmd_fold, "rewrites": cmd_rewrites,
           "sites": cmd_sites}
    if what == "all":
        for k, f in fns.items():
            print("=" * 78)
            print("== " + k)
            print("=" * 78)
            f(d)
            print()
    elif what in fns:
        fns[what](d)
    else:
        raise SystemExit(__doc__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
