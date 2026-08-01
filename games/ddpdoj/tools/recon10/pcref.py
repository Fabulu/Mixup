#!/usr/bin/env python3
"""RECON 10 -- what xref.py CANNOT see: PC-relative control flow and PC-relative
data references, scanned by brute force over the DECRYPTED :maincpu image.

xref.py is honest about its blind spot ("CANNOT (d16,An) / (An)+ / (d8,An,Xn) /
PC-relative"). The enemy subsystem lives almost entirely inside that blind spot:
the allocator $2636D6 has ZERO absolute-long callers, so it is reached by `bsr`,
and the handlers are reached through a record pointer. This scanner closes the
first half of that gap.

WHAT THIS CAN AND CANNOT SEE -- quote it every time:

  CAN   bsr.s / bsr.w            $61xx / $6100+ext16
        bra.s / bra.w            $60xx / $6000+ext16
        jsr (d16,PC)             $4EBA + ext16
        jmp (d16,PC)             $4EFA + ext16
        lea (d16,PC),An          $41FA|$43FA|... i.e. $4nFA + ext16
        pea (d16,PC)             $487A + ext16
        Bcc.s/.w  (all cc)       $6xxx

  CANNOT  distinguish CODE from DATA. This is a byte scan, not a decode: any
          two bytes of a data table that happen to look like $61xx are reported.
          Every hit MUST be confirmed by disassembling backwards from it.
          Alignment: only even addresses are scanned (68000 opcodes are aligned)
          but that does not make a hit an instruction.

  CANNOT  see (d8,PC,Xn) indexed PC-relative with a runtime index -- the shot
          dispatch `lea ($253ADE,PC),A0 / adda.w D0,A0` IS visible (the lea is),
          but a `jmp (d8,PC,Dn)` jump-table target set is not enumerable here.

usage
  python pcref.py to 2636D6                every bsr/bra/jsr/jmp/Bcc reaching it
  python pcref.py lea 2554EA               every lea/pea (d16,PC) reaching it
  python pcref.py any 2636D6               both of the above
  python pcref.py calls 2688CC 400         every PC-relative TARGET taken FROM
                                           the range [addr, addr+len)
  python pcref.py abscalls 2688CC 400      absolute jsr/jmp targets from a range
"""
import sys, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "oracle", "out", "maincpu.bin")

with open(IMG, "rb") as f:
    DATA = f.read()

# The decrypted image is the 68000 program space starting at $000000.
BASE = 0x000000
LO, HI = 0x200000, 0x2A0000     # build-B code window, default scan range


def w(a):
    return struct.unpack_from(">H", DATA, a - BASE)[0]


def sw(a):
    return struct.unpack_from(">h", DATA, a - BASE)[0]


CC = ["ra", "sr", "hi", "ls", "cc", "cs", "ne", "eq",
      "vc", "vs", "pl", "mi", "ge", "lt", "gt", "le"]


def scan_branches(lo, hi):
    """yield (addr, mnemonic, target)"""
    for a in range(lo, hi, 2):
        op = w(a)
        top = op >> 12
        if top == 0x6:
            cc = (op >> 8) & 0xF
            d8 = op & 0xFF
            if d8 == 0x00:
                tgt = a + 2 + sw(a + 2)
                mn = ("bsr.w" if cc == 1 else ("bra.w" if cc == 0 else "b%s.w" % CC[cc]))
            elif d8 == 0xFF:
                continue                       # 68020 long form, not on 68000
            else:
                d = d8 - 256 if d8 > 127 else d8
                tgt = a + 2 + d
                mn = ("bsr.s" if cc == 1 else ("bra.s" if cc == 0 else "b%s.s" % CC[cc]))
            yield (a, mn, tgt)
        elif op == 0x4EBA:
            yield (a, "jsr(pc)", a + 2 + sw(a + 2))
        elif op == 0x4EFA:
            yield (a, "jmp(pc)", a + 2 + sw(a + 2))


def scan_lea(lo, hi):
    for a in range(lo, hi, 2):
        op = w(a)
        if (op & 0xF1FF) == 0x41FA:            # lea (d16,PC),An
            an = (op >> 9) & 7
            yield (a, "lea(pc),A%d" % an, a + 2 + sw(a + 2))
        elif op == 0x487A:                     # pea (d16,PC)
            yield (a, "pea(pc)", a + 2 + sw(a + 2))


def scan_abscalls(lo, hi):
    for a in range(lo, hi, 2):
        op = w(a)
        if op in (0x4EB9, 0x4EF9):             # jsr/jmp abs.l
            tgt = struct.unpack_from(">I", DATA, a + 2 - BASE)[0]
            yield (a, "jsr.l" if op == 0x4EB9 else "jmp.l", tgt)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    tgt = int(sys.argv[2], 16)
    lo, hi = LO, HI
    if cmd in ("to", "lea", "any"):
        if len(sys.argv) > 4:
            lo, hi = int(sys.argv[3], 16), int(sys.argv[4], 16)
        hits = []
        if cmd in ("to", "any"):
            hits += [h for h in scan_branches(lo, hi) if h[2] == tgt]
        if cmd in ("lea", "any"):
            hits += [h for h in scan_lea(lo, hi) if h[2] == tgt]
        hits.sort()
        for a, mn, t in hits:
            print("%06x: %-12s $%06x" % (a, mn, t))
        print("HITS %d  (byte scan; confirm each by disassembling backwards)" % len(hits))
    elif cmd in ("calls", "abscalls"):
        n = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0x200
        lo, hi = tgt, tgt + n
        gen = scan_abscalls if cmd == "abscalls" else scan_branches
        for a, mn, t in gen(lo, hi):
            if cmd == "calls" and not (mn.startswith("bsr") or mn.startswith("jsr")):
                continue
            print("%06x: %-12s $%06x" % (a, mn, t))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
