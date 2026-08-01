#!/usr/bin/env python3
"""RECON 20 -- enumerate every ENEMY-BULLET FIRE CALL SITE in the decrypted image.

The fire entry points are the bank at $2813F0..$2814AC (each one a different
N-way / speed-layer generator over the core spawners $2814B6 / $2817C2).
This scans for `jsr $xxxxxx.l` (4EB9) and `jmp` (4EF9) to each of them, and
back-decodes the nearest preceding immediate load of D0 (the pattern word:
high = speed bias, low&$3F = BULLET KIND).

CANNOT: see a fire call reached by bsr/PC-relative (none exist -- every entry
is called absolute-long, checked with pcref.py), and cannot resolve a D0 that
is computed rather than loaded immediate.  Those are reported as kind=?.

  python firescan.py sites            every site, decoded
  python firescan.py hist             kind histogram per entry point
"""
import sys, os, struct, collections

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "oracle", "out", "maincpu.bin")
D = open(IMG, "rb").read()

# entry point -> (name, bullets emitted, angle offsets in 1/256-turn units)
ENTRIES = {
    0x2813F0: ("single",            "1 bullet, +0"),
    0x281402: ("single_rankspeed",  "1 bullet, +0 (speed+4 when rank!=0)"),
    0x281420: ("pair_speed",        "2 bullets same angle, speed +0/+6"),
    0x281432: ("triple_speed",      "3 bullets same angle, speed +0/+5/+10"),
    0x281442: ("spread2",           "2 bullets, angle -8/+8"),
    0x281450: ("spread2_rank",      "2 bullets, angle -8/+8, speed+4 when rank"),
    0x281484: ("spread3",           "3 bullets: centre speed+2, then -8/+8"),
    0x281494: ("pair_speed2",       "2 bullets same angle, speed +0/+4"),
    0x2814AC: ("adaptive",          "rank: flags-dependent 2-way or 3-way; else 1"),
}

def w(a): return struct.unpack_from(">H", D, a)[0]
def l(a): return struct.unpack_from(">I", D, a)[0]

def find(pat, lo=0x230000, hi=0x2B0000):
    out, i = [], lo
    while True:
        i = D.find(pat, i, hi)
        if i < 0: return out
        out.append(i); i += 1

def decode_d0(site, back=96):
    """nearest preceding immediate load into D0 before `site`."""
    best = None
    a = site - back if site >= back else 0
    while a < site:
        op = w(a)
        if op == 0x203C:            # move.l #imm,D0
            best = (a, l(a + 2), "move.l"); a += 6; continue
        if op == 0x303C:            # move.w #imm,D0
            best = (a, w(a + 2), "move.w"); a += 4; continue
        if (op & 0xFF00) == 0x7000: # moveq #imm,D0
            v = op & 0xFF
            best = (a, v - 256 if v >= 128 else v, "moveq"); a += 2; continue
        a += 2
    return best

def sites():
    out = []
    for ep in sorted(ENTRIES):
        pat_jsr = b"\x4e\xb9" + ep.to_bytes(4, "big")
        pat_jmp = b"\x4e\xf9" + ep.to_bytes(4, "big")
        for a in sorted(find(pat_jsr) + find(pat_jmp)):
            out.append((a, ep, decode_d0(a)))
    return out

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "hist"
    S = sites()
    if cmd == "sites":
        for a, ep, d in S:
            if d:
                v = d[1] & 0xFFFFFFFF
                kind = v & 0x3F
                bias = (v >> 16) & 0xFFFF
                bias = bias - 0x10000 if bias >= 0x8000 else bias
                print("%06x  %-16s kind=%2d speedbias=%+d  (D0 %s #$%X @%06x)"
                      % (a, ENTRIES[ep][0], kind, bias, d[2], v, d[0]))
            else:
                print("%06x  %-16s kind=?  (no immediate D0 within 96 bytes)" % (a, ENTRIES[ep][0]))
    elif cmd == "hist":
        per = collections.Counter()
        kinds = collections.Counter()
        unk = collections.Counter()
        for a, ep, d in S:
            per[ep] += 1
            if d: kinds[d[1] & 0x3F] += 1
            else: unk[ep] += 1
        tot = 0
        print("FIRE CALL SITES, build-B window $230000-$2B0000")
        for ep in sorted(ENTRIES):
            print("  $%06X %-18s %-52s %4d sites (%d with no immediate D0)"
                  % (ep, ENTRIES[ep][0], ENTRIES[ep][1], per[ep], unk[ep]))
            tot += per[ep]
        print("  TOTAL %d fire call sites" % tot)
        print("KINDS referenced (%d distinct of 39 defined):" % len(kinds))
        print("  " + " ".join("%d:%d" % (k, c) for k, c in sorted(kinds.items())))
    return 0

sys.exit(main())
