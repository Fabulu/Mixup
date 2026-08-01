#!/usr/bin/env python3
r"""RECON 20 -- attribute every ENEMY-BULLET FIRE CALL SITE to the enemy TYPE
that owns the code it sits in, and decode the pattern word.

The fire entry bank is $2813F0..$2814AC (nine N-way / speed-layer generators)
plus the two cores $2814B6 and $2817C2 called directly.  D0 is the PATTERN
WORD: low 6 bits = BULLET KIND (0..38), high word = SPEED BIAS.

OWNERSHIP is approximate and says so: the code region owned by a type is taken
as [entry, next entry in the sorted set of all 256*2 type-table entries), so a
fire site inside a helper that lives between two handlers is attributed to the
earlier one.  It is a partition of the code, not a call-graph.

  python firemap.py sites            every site with its owner
  python firemap.py stage1           only the types stage 1's script names
  python firemap.py inventory        the counts
"""
from __future__ import annotations

import collections
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMG = HERE.parent / "oracle" / "out" / "maincpu.bin"
D = IMG.read_bytes()

TBL_LO, TBL_HI = 0x267824, 0x27E412       # type $00-$7F, $80-$FF; 8 bytes/type
SCRIPT_STAGE1 = 0x230C6C

ENTRIES = {
    0x2813F0: ("single",           1),
    0x281402: ("single_rank",      1),
    0x281420: ("pair_speed6",      2),
    0x281432: ("triple_speed5",    3),
    0x281442: ("spread2",          2),
    0x281450: ("spread2_rank",     2),
    0x281484: ("spread3",          3),
    0x281494: ("pair_speed4",      2),
    0x2814AC: ("adaptive",         1),
    0x2814B6: ("core_plain",       1),
    0x2817C2: ("core_bit9",        1),
}


def w(a): return struct.unpack_from(">H", D, a)[0]
def l(a): return struct.unpack_from(">I", D, a)[0]


def type_entries():
    """(init, handler) for all 256 types."""
    out = []
    for t in range(256):
        base = TBL_LO if t < 0x80 else TBL_HI
        off = base + (t % 0x80) * 8
        out.append((l(off) & 0xFFFFFF, l(off + 4) & 0xFFFFFF))
    return out


def stage1_types():
    """types named by stage 1's spawn script, and the record count."""
    a, types, n = SCRIPT_STAGE1, set(), 0
    while w(a) != 0xFFFF:
        types.add(D[a + 4]); n += 1; a += 8
    return types, n


def owners():
    te = type_entries()
    pts = set()
    for i, h in te:
        pts.add(i); pts.add(h)
    pts = sorted(p for p in pts if 0x230000 <= p < 0x2B0000)
    # map each region start -> the types that own it
    own = collections.defaultdict(set)
    for t, (i, h) in enumerate(te):
        own[i].add(t); own[h].add(t)
    return pts, own


def find(pat, lo=0x230000, hi=0x2B0000):
    out, i = [], lo
    while True:
        i = D.find(pat, i, hi)
        if i < 0:
            return out
        out.append(i); i += 1


def decode_d0(site, back=160):
    best = None
    a = max(0, site - back)
    while a < site:
        op = w(a)
        if op == 0x203C:
            best = (a, l(a + 2), "move.l"); a += 6; continue
        if op == 0x303C:
            best = (a, w(a + 2), "move.w"); a += 4; continue
        if (op & 0xFF00) == 0x7000:
            v = op & 0xFF
            best = (a, (v - 256) & 0xFFFFFFFF if v >= 128 else v, "moveq"); a += 2; continue
        a += 2
    return best


def sites():
    out = []
    for ep in sorted(ENTRIES):
        for pat in (b"\x4e\xb9", b"\x4e\xf9"):
            for a in find(pat + ep.to_bytes(4, "big")):
                out.append((a, ep, decode_d0(a)))
    return sorted(out)


def attribute(S, pts, own):
    import bisect
    rows = []
    for a, ep, d in S:
        j = bisect.bisect_right(pts, a) - 1
        start = pts[j] if j >= 0 else None
        ts = sorted(own.get(start, set())) if start is not None else []
        kind = bias = None
        if d:
            v = d[1] & 0xFFFFFFFF
            kind = v & 0x3F
            bias = (v >> 16) & 0xFFFF
            bias = bias - 0x10000 if bias >= 0x8000 else bias
        rows.append((a, ep, kind, bias, start, ts))
    return rows


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "inventory"
    pts, own = owners()
    S = sites()
    rows = attribute(S, pts, own)
    s1types, nrec = stage1_types()

    if cmd in ("sites", "stage1"):
        for a, ep, kind, bias, start, ts in rows:
            in1 = bool(set(ts) & s1types)
            if cmd == "stage1" and not in1:
                continue
            print("%06X  %-13s kind=%-3s bias=%-4s  region $%06X  types %s%s"
                  % (a, ENTRIES[ep][0], kind if kind is not None else "?",
                     bias if bias is not None else "?",
                     start or 0, ",".join("%02X" % t for t in ts) or "-",
                     "  <STAGE1>" if in1 else ""))
        return 0

    per = collections.Counter()
    kinds_all = collections.Counter()
    kinds_s1 = collections.Counter()
    unk = 0
    s1sites = 0
    s1types_firing = set()
    for a, ep, kind, bias, start, ts in rows:
        per[ep] += 1
        if kind is None:
            unk += 1
        else:
            kinds_all[kind] += 1
        if set(ts) & s1types:
            s1sites += 1
            s1types_firing |= (set(ts) & s1types)
            if kind is not None:
                kinds_s1[kind] += 1
    print("STAGE 1 script $%06X: %d records, %d distinct enemy types"
          % (SCRIPT_STAGE1, nrec, len(s1types)))
    print("FIRE ENTRY POINTS (call sites, window $230000-$2B0000):")
    for ep in sorted(ENTRIES):
        print("  $%06X %-14s %4d" % (ep, ENTRIES[ep][0], per[ep]))
    print("  TOTAL %d sites, %d with no immediate D0 in 160 bytes" % (sum(per.values()), unk))
    print("BULLET KINDS defined in ROM: 39  (tables $281956 / $2815C6 / $282030)")
    print("  referenced by ANY fire site: %d distinct -> %s"
          % (len(kinds_all), " ".join("%d:%d" % kv for kv in sorted(kinds_all.items()))))
    print("  inside stage-1-owned code:  %d distinct -> %s"
          % (len(kinds_s1), " ".join("%d:%d" % kv for kv in sorted(kinds_s1.items()))))
    print("  stage-1 fire sites: %d, in %d of %d stage-1 types (%s)"
          % (s1sites, len(s1types_firing), len(s1types),
             ",".join("%02X" % t for t in sorted(s1types_firing))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
