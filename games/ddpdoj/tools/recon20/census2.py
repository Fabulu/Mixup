#!/usr/bin/env python3
r"""RECON 20 -- the FULL census: init+8 bodies, handler bodies, primitive
profiles, stage cross-reference.  See census.py for the type table itself.

THE FALL-THROUGH THIS FOUND, and it is systemic:
every one of the 256 inits in the type table is EXACTLY 8 bytes --
`move.w #N,($4,A5) / rts` -- and the real initialisation is the SECOND ENTRY
POINT at init+8, reached by `$26361A addq.w #8,A1 / $263650 jsr (A1)`.
Walking the table address alone reads 2 instructions and misses the routine.
"""
from __future__ import annotations

import collections
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flow                                                    # noqa: E402
from census import (D, entry, roster, is_null, stage_script,    # noqa: E402
                    script_records, PRIM)

OUT = Path(__file__).resolve().parent / "out"

# the prototype loaders found at $26377A..$263800 (recon 20)
PROTO = {
    0x26377A: "REC   D0+1 words -> ($16,A5)   the ENEMY RECORD prototype",
    0x26378E: "OFS   D0+1 (offset,longword) pairs into the sub-record",
    0x2637A2: "SUB   one 28-byte prototype per sub-record (hitbox/HP/spd/dir/gfx)",
    0x2637E0: "SUB2  variant of $2637A2",
}


def walkfull(a: int):
    return flow.walk(a)


def profile(entries: list[int], depth: int = 3) -> dict:
    """transitive primitive profile: which PRIM routines are reachable"""
    seen: set[int] = set()
    frontier = list(entries)
    hits: dict[int, int] = {}
    for _ in range(depth):
        nxt = []
        for a in frontier:
            if a in seen or a in PRIM:
                continue
            seen.add(a)
            w = flow.walk(a)
            for _s, t in w.calls:
                if t in PRIM:
                    hits[t] = hits.get(t, 0) + 1
                else:
                    nxt.append(t)
        frontier = nxt
    return hits


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for t, i, h in roster():
        if is_null(h):
            continue
        ib = i + 8
        wi, wh = flow.walk(ib), flow.walk(h)
        protos = []
        # find the (lea table,PC) immediately feeding each prototype loader
        ks = sorted(wi.insns)
        for site, tgt in wi.calls:
            if tgt in PROTO:
                tab = None
                for s2, t2 in wi.leas:
                    if s2 < site and (tab is None or s2 > tab[0]):
                        tab = (s2, t2)
                protos.append((tgt, tab[1] if tab else None))
        rows.append(dict(
            type=t, init=i, initbody=ib, handler=h,
            init_span=[min(wi.insns), max(wi.insns)],
            hand_span=[min(wh.insns), max(wh.insns)],
            init_calls=sorted({x for _, x in wi.calls}),
            hand_calls=sorted({x for _, x in wh.calls}),
            hand_leas=sorted({x for _, x in wh.leas}),
            init_leas=sorted({x for _, x in wi.leas}),
            protos=protos,
            hand_indirect=[o for _, o in wh.icalls],
            init_indirect=[o for _, o in wi.icalls],
        ))
    (OUT / "census.json").write_text(json.dumps(rows, indent=0))
    flow.save()
    print("live types walked:", len(rows))


if __name__ == "__main__":
    main()
