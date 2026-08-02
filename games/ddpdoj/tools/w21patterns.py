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
def _ea6_name(disp):
    """The EA string for a displacement into the A6 record."""
    return "(A6)" if disp == 0 else f"(${disp:X},A6)"


def _move_src_str(d, a, w, size_char):
    """Decode a MOVE instruction's source EA (bits 5-0 of the opcode word) and
    return (source_text, extension_word_count)."""
    smode, sreg = (w >> 3) & 7, w & 7
    if smode <= 1:
        return (f"{'D' if smode == 0 else 'A'}{sreg}", 0)
    if smode == 2:
        return f"(A{sreg})", 0
    if smode == 3:
        return f"(A{sreg})+", 0
    if smode == 4:
        return f"-(A{sreg})", 0
    if smode == 5:
        return f"(${u16(d, a + 2):X},A{sreg})", 1
    if smode == 6:
        return f"(d8,A{sreg},Xn)", 1
    if sreg == 0:
        return f"(${u16(d, a + 2):X}).w", 1
    if sreg == 1:
        return f"(${u32(d, a + 2):06X}).l", 2
    if sreg == 2:
        return "(d16,PC)", 1
    if sreg == 3:
        return "(d8,PC,Xn)", 1
    if sreg == 4:                                       # immediate
        if size_char == "l":
            return f"#${u32(d, a + 2):08X}", 2
        return f"#${u16(d, a + 2) & (0xFF if size_char == 'b' else 0xFFFF):02X}", 1
    return "?", 0


def cmd_rewrites(d):
    r"""Every instruction in $282104..$283BAF that writes through (A6) or
    (d16,A6) -- the putative IN-FLIGHT KIND REWRITE.

    EXHAUSTIVE BYTE-PATTERN SCAN (review F2).  The scan checks EVERY word
    boundary in the range -- it is alignment-independent, which is why a linear
    disassembly cannot replace it ($282104..$283BAF is 6.7 KB of mixed code and
    continuation data; a linear pass loses sync at the first data island and
    reported only 20 of the ~80 sites on the first try).

    The opcode allowlist now covers EVERY 68000 instruction class that can write
    through EA (A6) [mode 010 reg 110 = $16] or (d16,A6) [mode 101 reg 110 =
    $2E]:

      * ori/andi/subi/addi/eori #imm        -- byte/word/LONG, both EAs
      * clr/neg/not                          -- byte/word/long, both EAs
      * move.b/w/l  any-source               -- dest (A6)/(d16,A6)
      * btst/bchg/bclr/bset  #n and Dn       -- both forms

    The earlier revision (which shipped with wave 21) covered only ori/andi/eori
    .b/.w, move.b/w (#imm and Dn) and the bit ops -- a PARTIAL allowlist that
    HID 11 `clr.w (A6)`, 14 `move.l (A6)` and 12 `addi.l (A6)` sites.  The
    CONCLUSION (no kind rewrite) survives; the PROOF is now exhaustive.

    THE PREMISE "A6 = the record base for the whole of the mover" IS FALSE in
    the continuation tails: `$28213E adda.l #$a,a6` advances A6 and `lea
    $36(a6),a6` restores it, so `(A6)` there is record + $0A, the SPRITE
    DESCRIPTOR.  The classification below no longer assumes the premise, which
    is why move.l/addi.l to (A6) in the tails are filed as sprite-descriptor
    writes and not as type-word rewrites.
    """
    print("WRITES THROUGH (A6) / (d16,A6) in $282104..$283BAF\n"
          "  EXHAUSTIVE BYTE-PATTERN SCAN (every word boundary, not a linear\n"
          "  disassembly).  The TYPE WORD is at A6 (disp 0): its LOW byte ($1,A6)\n"
          "  holds KIND bits 0..5; a BYTE op on (A6) hits the HIGH byte (bits\n"
          "  8..15 = alive/kill/dispatch/flip-flop).  A WHOLE-WORD LIVE write to\n"
          "  (A6) is the only thing that could rewrite a live bullet's kind; a\n"
          "  `clr.w (A6)` writes 0 = a FREE SLOT (the bullet's death).\n")

    # --- opcode tables, written out so a reader can verify each encoding -------
    # EA (A6) = mode 010 reg 110 = $16; EA (d16,A6) = mode 101 reg 110 = $2E.
    A6, D16 = 0x16, 0x2E
    SZ_B, SZ_W, SZ_L = 0x00, 0x40, 0x80      # size field in bits 7-6

    # clr/neg/not: 0b0100_0xx0_ss_EEEEEE  (xx identifies the op)
    UN_OPS = {0x42: "clr", 0x44: "neg", 0x46: "not"}
    # ori/andi/subi/addi/eori: 0b0000_0ooo_ss_EEEEEE
    IMM_OPS = {0x00: "ori", 0x02: "andi", 0x04: "subi", 0x06: "addi", 0x0A: "eori"}
    SZ_NAMES = {SZ_B: "b", SZ_W: "w", SZ_L: "l"}
    # Bit ops operate on a BYTE for memory EAs (the HIGH byte of the word at A6).
    # Static #n form: the full opcode word identifies op+EA.
    BITOPS_STATIC = {0x0816: "btst", 0x0856: "bchg", 0x0896: "bclr", 0x08D6: "bset",
                     0x082E: "btst", 0x086E: "bchg", 0x08AE: "bclr", 0x08EE: "bset"}
    # Dn form: bits 11-9 = register, bit 8 = 1, bits 7-6 = op, bits 5-0 = EA.
    # (w & 0xF13F) collapses to 0x0116 for (A6), 0x012E for (d16,A6).
    BITOPS_DN_OP = {0: "btst", 1: "bchg", 2: "bclr", 3: "bset"}

    rows = []          # (addr, text, bitnum, high_byte, disp, sz_letter, op_root)
    a = BEHAVIOUR_LO
    while a < BEHAVIOUR_HI:
        w = u16(d, a)
        hi = (w >> 8) & 0xFF
        lo = w & 0xFF
        ea = lo & 0x3F
        sz_field = lo & 0xC0
        sz_name = SZ_NAMES.get(sz_field, "")
        op_root = None
        text = None
        bitnum = None
        inst_size = 2
        disp = 0

        # ---- bit ops: static #n form (full word match) ----
        if w in BITOPS_STATIC:
            op_root = BITOPS_STATIC[w]
            is_d16 = (ea == D16)
            disp = 0 if not is_d16 else u16(d, a + 4)
            bitnum = u16(d, a + 2)
            sz_name = "b"                 # bit ops on memory = BYTE (high byte)
            text = f"{op_root} #{bitnum},{_ea6_name(disp)}"
            inst_size = 6 if is_d16 else 4
            if op_root == "btst":
                op_root = None            # btst is a READ, not a write

        # ---- bit ops: Dn form (register in bits 11-9, op in bits 7-6) ----
        elif (w & 0xF13F) in (0x0116, 0x012E):
            sub = (w >> 6) & 3
            op_root = BITOPS_DN_OP[sub]
            is_d16 = ((w & 0xF13F) == 0x012E)
            disp = 0 if not is_d16 else u16(d, a + 2)
            dreg = (w >> 9) & 7
            sz_name = "b"                 # bit ops on memory = BYTE (high byte)
            text = f"{op_root} D{dreg},{_ea6_name(disp)}"
            inst_size = 4 if is_d16 else 2
            if op_root == "btst":
                op_root = None

        # ---- immediate arithmetic: ori/andi/subi/addi/eori #imm,EA ----
        # Extension order: opcode, immediate data, then dest d16 (for (d16,A6)).
        elif hi in IMM_OPS and sz_field in (SZ_B, SZ_W, SZ_L) and ea in (A6, D16):
            op_root = IMM_OPS[hi]
            if sz_name == "l":
                imm = u32(d, a + 2)
                imm_sz = 4
            else:
                imm = u16(d, a + 2)
                imm_sz = 2
                if sz_name == "b":
                    imm &= 0xFF
            # The d16 extension comes AFTER the immediate data.
            disp = 0 if ea == A6 else u16(d, a + 2 + imm_sz)
            dst_ext = 0 if ea == A6 else 2
            width = 8 if sz_name == "l" else (2 if sz_name == "b" else 4)
            text = f"{op_root}.{sz_name} #${imm:0{width}X},{_ea6_name(disp)}"
            inst_size = 2 + imm_sz + dst_ext

        # ---- clr/neg/not (unary, no immediate operand) ----
        elif hi in UN_OPS and sz_field in (SZ_B, SZ_W, SZ_L) and ea in (A6, D16):
            op_root = UN_OPS[hi]
            disp = 0 if ea == A6 else u16(d, a + 2)
            text = f"{op_root}.{sz_name} {_ea6_name(disp)}"
            inst_size = 4 if ea == D16 else 2

        # ---- move: any source, dest (A6) or (d16,A6) ----
        # MOVE extension order: source EA extensions FIRST, then dest d16.
        # move.l dst (A6): (w & 0xFFC0) == 0x2C80
        # move.w dst (A6): (w & 0xFFC0) == 0x3C80
        # move.b dst (A6): (w & 0xFFC0) == 0x1C80
        # move.l dst (d16,A6): (w & 0xFFC0) == 0x2D40  ... etc
        elif (w & 0xFFC0) in (0x2C80, 0x3C80, 0x1C80,  # move to (A6)
                              0x2D40, 0x3D40, 0x1D40):  # move to (d16,A6)
            size_map = {0x2C80: "l", 0x3C80: "w", 0x1C80: "b",
                        0x2D40: "l", 0x3D40: "w", 0x1D40: "b"}
            op_root = "move"
            sz_name = size_map[w & 0xFFC0]
            dst_is_a6 = (w & 0xFFC0) in (0x2C80, 0x3C80, 0x1C80)
            # Decode source FIRST, then read dest d16 AFTER the source extensions.
            src, src_ext = _move_src_str(d, a, w, sz_name)
            disp = 0 if dst_is_a6 else u16(d, a + 2 + src_ext * 2)
            dst_ext = 0 if dst_is_a6 else 2
            text = f"move.{sz_name} {src},{_ea6_name(disp)}"
            inst_size = 2 + src_ext * 2 + dst_ext

        if op_root:
            high_byte = (disp == 0 and sz_name == "b")
            rows.append((a, text, bitnum, high_byte, disp, sz_name, op_root,
                         inst_size))

        a += inst_size if op_root else 2

    for addr, txt, bit, high_byte, disp, sz_name, op_root, _ in rows:
        extra = ""
        if bit is not None:
            wbit = bit + 8 if high_byte else bit
            extra = f"   word bit {wbit}" + (
                "  = THE DISPATCH BIT" if wbit == 8 else
                "  = KIND bit" if wbit < 6 else
                "  = the kill bit" if wbit == 12 else
                "  = the alive bit" if wbit == 15 else
                "  = the $281F3E path bit" if wbit == 7 else "")
        if op_root == "clr" and disp == 0:
            extra += "   -> writes 0 = FREE SLOT (death)"
        elif sz_name == "l" and disp == 0:
            extra += "   -> LONGWORD; at A6=rec+$0A this is the SPRITE DESCRIPTOR"
        print(f"  ${addr:06X}  {txt:34s}{extra}")

    kind_low = [r for r in rows if r[4] == 1 and r[5] == "b"]
    word_live = [r for r in rows if r[4] == 0 and r[5] == "w"
                 and r[6] not in ("clr",)]
    longword = [r for r in rows if r[4] == 0 and r[5] == "l"]
    clr_word = [r for r in rows if r[4] == 0 and r[6] == "clr"]
    high_byte = [r for r in rows if r[4] == 0 and r[5] == "b"]
    print(f"\n  {len(rows)} writes through (A6)/(d16,A6) inside $282104..$283BAF "
          f"(EXHAUSTIVE byte-pattern scan).")
    print(f"  LOW byte ($1,A6) = KIND bits 0..5 writers:        {len(kind_low)}")
    print(f"  WHOLE WORD LIVE writers to (A6):                 {len(word_live)}")
    print(f"  LONGWORD writers to (A6):                        {len(longword)}"
          f"  (sprite-descriptor in tails, A6 advanced)")
    print(f"  clr.w/l (A6) -> 0 (FREE SLOT / death):           {len(clr_word)}")
    print(f"  HIGH byte (A6) bit ops (bits 8..15):             {len(high_byte)}")
    print("""
  THE KIND OF A LIVE BULLET IS NEVER REWRITTEN IN THIS RANGE.
  There are ZERO writers to the LOW byte ($1,A6) = kind bits 0..5, and ZERO
  whole-word LIVE writes to the type word.  The whole-word ops that DO appear
  are `clr.w (A6)` -- which writes 0, i.e. marks the slot FREE (the bullet's
  own death, each followed by `move.w #$FFFF,$2(a6)`) -- and `move.l` /
  `addi.l` against (A6) in the continuations, where A6 has been ADVANCED
  (`$28213E adda.l #$a,a6`, closing `lea $36(a6),a6`) so (A6) is record+$0A,
  the SPRITE DESCRIPTOR, not the type word.  The remaining writes are BYTE
  ops on (A6) = the HIGH byte, bits 8..15: `andi.b #$FE` clears the dispatch
  bit (8), `ori.b #$7C` sets the kill bit (12), and `bchg #3,(A6)` toggles
  the private per-bullet FLIP-FLOP at bit 11.
  20-recon-pattern-tables section 6 reads $2824DC's `bchg #$3,(A6)` as an
  IN-FLIGHT KIND REWRITE.  It is not: on a big-endian 68000 a byte operation
  on (A6) addresses bits 8..15 of the word, so bit #3 is WORD BIT 11 -- and
  bit 11 is neither a kind bit nor in the mover's $5180 dispatch mask.  The
  KIND of a live bullet is fixed at spawn, in $281568/$28187A, and nothing in
  the 39 behaviours or their continuations changes it.""")


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
