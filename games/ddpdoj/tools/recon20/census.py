#!/usr/bin/env python3
r"""RECON 20 -- THE ENEMY CENSUS.  All 256 types, all 113 handlers, read past
every apparent end, cross-referenced against the stage-1 spawn script.

  python census.py table       the 256-type roster + the distinct-handler set
  python census.py routines    flow-walk every init and every handler
  python census.py fallthrough only the routines that run into another entry
  python census.py script 1    stage-1 script -> types, order, scroll positions
  python census.py prim        per-handler PRIMITIVE profile (what it calls)
"""
from __future__ import annotations

import collections
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flow                                                    # noqa: E402

D = flow.D
LO_TAB, HI_TAB = 0x267824, 0x27E412
STAGE_TAB = 0x263336

NULL_INIT, NULL_HAND = 0x267814, 0x26781C
NULL_INIT2, NULL_HAND2 = 0x27E402, 0x27E40A

# ---------------------------------------------------------------- primitives
# every one of these was read out of the listing in recon 10 or recon 20; the
# comment is the evidence line, not a guess from the name.
PRIM = {
    0x2638A6: "MOVE   movement-script interpreter",
    0x2417DE: "VEL    dir+speed -> velocity (recompute)",
    0x241812: "VEL    dir+speed -> velocity",
    0x286096: "DMG    damage + score",
    0x28615E: "SFX    explosion/sound",
    0x263762: "FREE   free run, sub-record byte0 = $01",
    0x263754: "FREE   free run, sub-record byte0 = $00",
    0x2636D6: "ALLOC  enemy allocator",
    0x263678: "SPAWN  deferred-queue enqueue (D1=$80)",
    0x263684: "SPAWN  deferred-queue enqueue (D1=0)",
    0x263690: "SPAWN  deferred-queue enqueue (D1=caller)",
    0x24200A: "AIM    atan2 at target player",
    0x24202C: "AIM    atan2 at this record's target",
    0x242022: "AIM    atan2 at P1",
    0x242018: "AIM    atan2 at P2",
    0x242730: "AIM    atan2, target from ($2E,A6)",
    0x242748: "AIM    atan2, target from ($2A,A6)",
    0x242760: "AIM    atan2, alternating target",
    0x242190: "TURN   step facing one unit toward angle",
    0x27F8EE: "BULLET alloc (D1=0, D2=kind*4)",
    0x27F8F0: "BULLET alloc (D2 masked, *4)",
    0x27F8F8: "BULLET alloc (D1=D2=0)",
    0x27F92A: "BULLET alloc in the SECOND pool $817DC6",
    0x289004: "EFFECT alloc, 80 x $38 at $81B732",
    0x24179E: "SCROLL scroll-locked position fixup",
    0x268024: "NEAREST player selection (octagonal metric)",
    0x246CAC: "RES    resource lookup",
}


def entry(t: int) -> tuple[int, int, int]:
    base = LO_TAB if t < 0x80 else HI_TAB
    off = base + (t & 0x7F) * 8
    init, hand = struct.unpack_from(">II", D, off)
    return off, init, hand


def roster() -> list[tuple[int, int, int]]:
    return [(t,) + entry(t)[1:] for t in range(0x100)]


def is_null(h: int) -> bool:
    return h in (NULL_HAND, NULL_HAND2, NULL_INIT, NULL_INIT2)


def stage_script(stage: int) -> tuple[int, int, int]:
    off = STAGE_TAB + stage * 16
    return struct.unpack_from(">III", D, off)


def script_records(addr: int):
    a = addr
    while True:
        trig = struct.unpack_from(">H", D, a)[0]
        if trig == 0xFFFF:
            return
        param = struct.unpack_from(">H", D, a + 2)[0]
        typ, flags = D[a + 4], D[a + 5]
        idx = struct.unpack_from(">H", D, a + 6)[0] & 0xFFF
        yield a, trig, param, typ, flags, idx
        a += 8


# ------------------------------------------------------------------ commands
def cmd_table() -> None:
    hands = collections.Counter()
    inits = collections.Counter()
    for t, i, h in roster():
        hands[h] += 1
        inits[i] += 1
    live = [t for t, i, h in roster() if not is_null(h)]
    print("types                       256")
    print("NULL types (handler = $26781C or $27E40A)  %d" % (256 - len(live)))
    print("LIVE types                  %d" % len(live))
    print("distinct handlers           %d   (of which 2 are the NULL stub)" % len(hands))
    print("distinct REAL handlers      %d" % (len(hands) - 2))
    print("distinct inits              %d   (of which 2 are the NULL stub)" % len(inits))
    print("distinct REAL inits         %d" % (len(inits) - 2))
    print()
    print("handlers serving >1 type:")
    for h, n in hands.most_common():
        if n > 1:
            ts = [t for t, i, hh in roster() if hh == h]
            print("  $%06X x%-3d types %s" % (h, n, " ".join("$%02X" % t for t in ts)))


def routine_set() -> dict[int, str]:
    """every distinct entry point named by the type table, with its role."""
    ep: dict[int, str] = {}
    for t, i, h in roster():
        if is_null(h):
            continue
        ep.setdefault(i, "init")
        ep.setdefault(h, "handler")
    return ep


def cmd_routines(verbose: bool = True) -> dict:
    ep = routine_set()
    entries = set(ep)
    out = {}
    for a in sorted(ep):
        w = flow.walk(a)
        ks = sorted(w.insns)
        lo, hi = ks[0], ks[-1] + w.insns[ks[-1]][0]
        # anything ELSE from the type table that this walk executes
        hit = sorted(x for x in entries if x != a and x in w.insns)
        out[a] = dict(role=ep[a], lo=lo, hi=hi, n=len(ks),
                      calls=sorted({t for _, t in w.calls}),
                      indirect=len(w.icalls),
                      shared=hit, terms=sorted(set(w.terms)),
                      leas=sorted({t for _, t in w.leas}))
        if verbose:
            print("$%06X %-7s span $%06X..$%06X (%d insns, %d bytes) "
                  "terms=%d indirect=%d%s"
                  % (a, ep[a], lo, hi, len(ks), hi - lo, len(out[a]["terms"]),
                     len(w.icalls),
                     ("  RUNS-INTO " + " ".join("$%06X" % x for x in hit)) if hit else ""))
    flow.save()
    return out


if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else "table"
    if c == "table":
        cmd_table()
    elif c == "routines":
        cmd_routines()
    elif c == "script":
        for s in range(5):
            sc, aux, res = stage_script(s)
            recs = list(script_records(sc))
            ts = collections.Counter(r[3] for r in recs)
            hs = {entry(t)[2] for t in ts}
            nul = sum(v for t, v in ts.items() if is_null(entry(t)[2]))
            print("stage %d: script $%06X aux $%06X res $%06X  records=%4d  "
                  "distinct types=%2d  distinct handlers=%2d  NULL-type records=%d  "
                  "trig %d..%d"
                  % (s + 1, sc, aux, res, len(recs), len(ts), len(hs), nul,
                     recs[0][1], recs[-1][1]))
