#!/usr/bin/env python3
"""RECON 10 -- THE ENEMY TYPE TABLE, read from the listing.

Wave 5 wrote: "An enemy's identity is a FUNCTION POINTER at +$4C, not a type
word ... Enumerate the handlers by measurement; there is no table to read."
That is FALSE and this file is the disproof.  $2635F6 (the enemy init, called
from both spawn paths with A5 = the fresh record) does:

    2635f6: moveq #$0,D7 / move.b ($c,A5),D7      the TYPE byte
    2635fc: lea $267824,A0                        TABLE LO  (types $00..$7F)
    263602: cmpi.w #$80,D7 / blt
    263608: lea $27e412,A0 / subi.w #$80,D7       TABLE HI  (types $80..$FF)
    263612: lsl.w #3,D7                           8 BYTES PER TYPE
    263614: movea.l (A0,D7.w),A1 / jsr (A1)       [+0] = the INIT routine
    263628: movea.l ($4,A0,D7.w),A0
    26362c: move.l A0,($4c,A5)                    [+4] = the PER-FRAME HANDLER

So the handler set is bounded from ABOVE by the listing: 256 types, 2 routines
each.  The per-STAGE handler set is bounded by that stage's spawn script.

  python types.py table            both tables, 256 rows
  python types.py script 230C6C    a stage script -> the type/handler histogram
"""
import sys, os, struct, collections

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "oracle", "out", "maincpu.bin")
with open(IMG, "rb") as f:
    D = f.read()

LO_TAB, HI_TAB = 0x267824, 0x27E412


def entry(t):
    base = LO_TAB if t < 0x80 else HI_TAB
    off = base + (t & 0x7F) * 8
    init, hand = struct.unpack_from(">II", D, off)
    return off, init, hand


def table():
    seen = collections.Counter()
    for t in range(0x100):
        off, init, hand = entry(t)
        seen[hand] += 1
        print("type $%02X  @%06x  init=$%06X  handler=$%06X" % (t, off, init, hand))
    print("\nDISTINCT handlers over all 256 types: %d" % len(seen))
    for h, n in seen.most_common():
        print("  $%06X  x%d" % (h, n))


def script(addr):
    types = collections.Counter()
    hands = collections.Counter()
    n = 0
    a = addr
    first = {}
    while True:
        trig = struct.unpack_from(">H", D, a)[0]
        if trig == 0xFFFF:
            break
        d0 = D[a + 4]
        types[d0] += 1
        _, init, hand = entry(d0)
        hands[hand] += 1
        first.setdefault(d0, trig)
        n += 1
        a += 8
        if n > 20000:
            print("RUNAWAY -- no $FFFF terminator within 20000 records")
            break
    print("script $%06X: %d records, %d bytes, terminator at $%06X" % (addr, n, a - addr, a))
    print("last trigger word = %d" % struct.unpack_from(">H", D, a - 8)[0])
    print("\nTYPES USED (%d distinct):" % len(types))
    for t, c in sorted(types.items()):
        _, init, hand = entry(t)
        print("  type $%02X x%-4d  first trig=%-5d  init=$%06X  handler=$%06X"
              % (t, c, first[t], init, hand))
    print("\nHANDLERS NEEDED (%d distinct):" % len(hands))
    for h, c in hands.most_common():
        print("  $%06X  spawns=%d" % (h, c))


if __name__ == "__main__":
    if sys.argv[1] == "table":
        table()
    else:
        script(int(sys.argv[2], 16))
