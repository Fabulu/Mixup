#!/usr/bin/env python3
r"""WAVE 17 -- read the whole-stage TSV `w17stage.lua` produced and say what
happened, in the units the later gates need.

    python w17report.py out/w17-stage1-invuln.tsv

READER ONLY -- runs no emulator.  Column numbering is 1-based and matches the
comments in `w17stage.lua`'s fh:write: 1..25 are bgrecon's row unchanged (so
`scrollgate.py` works on the same file), 26..43 are wave 17's.

EVERY NUMBER THIS PRINTS IS FROM AN INVULNERABLE, AUTO-SHOT RUN.  It is valid
for COVERAGE and invalid for pacing (docs/knowledge/09).  The lines flagged
`[DIST]` are the distribution-sensitive ones -- they would read differently in
a run the game could actually produce, and nothing may quote them as ordinary
play.
"""
from __future__ import annotations

import sys
from pathlib import Path

C = dict(lf=0, vf=1, scale=2, ctrl=3, bgw=4, txw=5, rsw=6, b012=7, b016=8,
         b034=9, b038=10, sh_x=11, sh_y=12, d176=13, d16e=14, clock=15,
         stage4=16, cursor=17, acc=18, shake=19, alldead=20, rs_d=21, rs_nz=22,
         bgx=23, bgy=24,
         ff=25, gate=26, extfrz=27, extspd=28, vm0=29, vm1=30, b03c=31,
         emask=32, ecount=33, stageidx=34, stagex2=35, stage=36, f3098=37, rank=38,
         lives=39, life=40, bosshp=41, bosshp2=42)


def rows(path):
    out = []
    for line in Path(path).read_text().splitlines():
        p = line.split("\t")
        if len(p) < 49:
            continue
        out.append(p)
    return out


def runs(rs, col, base=16):
    """[(value, first_lf, last_lf, n)] -- contiguous runs of one value."""
    out = []
    for r in rs:
        v = int(r[C[col]], base)
        lf = int(r[0])
        if out and out[-1][0] == v and out[-1][2] == lf - 1:
            out[-1][2] = lf
            out[-1][3] += 1
        else:
            out.append([v, lf, lf, 1])
    return out


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "out/w17-stage1-invuln.tsv"
    rs = rows(path)
    # PROVENANCE IS NEVER HARDCODED HERE.  A label that says "invulnerable" on
    # a run that was not is exactly the failure docs/knowledge/09 warns about,
    # so it is read back from the run's own PROBE log, verbatim, or the report
    # says it could not find it.
    log = Path(path).with_suffix(".log")
    prov = next((l for l in log.read_text().splitlines()
                 if l.startswith("INTERVENTION")), None) if log.exists() else None
    print(f"ROWS {len(rs)}  lf {rs[0][0]}..{rs[-1][0]}")
    print("PROVENANCE " + (prov or
          f"UNKNOWN -- no INTERVENTION line in {log}; treat every number below "
          f"as unlabelled and do not quote it"))

    # --- the stage boundary, measured
    st = [r for r in runs(rs, "stage") if True]
    print("STAGE $813096 (stage index x4):",
          "  ".join(f"{v:04X}@lf{a}..{b}({n})" for v, a, b, n in st))

    # --- the clock: first arrival at each value, and the lock
    lock = None
    prev = None
    firsts = {}
    for r in rs:
        c, lf = int(r[C["clock"]], 16), int(r[0])
        if c not in firsts:
            firsts[c] = lf
        if prev is not None and c == prev == 0x0344 and lock is None:
            lock = lf - 1
        prev = c
    print(f"CLOCK values seen: {len(firsts)}  max=${max(firsts):04X}"
          f"  boss lock $0344 first at lf{firsts.get(0x344)}")
    if lock:
        held = sum(1 for r in rs if int(r[C['clock']], 16) == 0x344)
        print(f"BOSSLOCK clock parked at $0344 for {held} logic frames"
              f"  (lf{firsts[0x344]}..{firsts[0x344] + held - 1})   [DIST: how"
              f" long a boss takes is a function of the player]")

    # --- the death pause / banner freeze
    ad = [x for x in runs(rs, "alldead") if x[0]]
    print(f"ALLDEAD $8130D2 runs: {len(ad)}  frames={sum(x[3] for x in ad)}  "
          + " ".join(f"lf{a}..{b}({n})" for _, a, b, n in ad))

    # --- did anybody die?  lives and life state must not move if invulnerable
    for name in ("lives", "life"):
        vs = runs(rs, name)
        print(f"{name.upper():6s} ${'8130BE' if name=='lives' else '8130FA'}: "
              + " ".join(f"{v:04X}@lf{a}..{b}({n})" for v, a, b, n in vs[:12])
              + (" ..." if len(vs) > 12 else ""))

    # --- the element gate and the element slots
    for name, addr in (("gate", "$8130DA"), ("ff", "$813190"),
                       ("extfrz", "$81317E"), ("extspd", "$813180")):
        vs = runs(rs, name)
        print(f"{addr} {name}: " + " ".join(
            f"{v:04X}@lf{a}..{b}({n})" for v, a, b, n in vs[:10])
            + (" ..." if len(vs) > 10 else ""))
    em = runs(rs, "emask")
    print(f"BG-ELEMENT live-slot mask, {len(em)} transitions:")
    for v, a, b, n in em:
        print(f"    {v:02X}  lf{a}..{b}  ({n} frames)")

    # --- rank / loop / $813098: the globals every coverage claim must name
    # $813092 is the STAGE INDEX, not the loop count: $25FD0C is
    # `move.w D0,$813092 / add.w D0,D0 / move.w D0,$813094 / add.w D0,D0 /
    #  move.w D0,$813096` -- one setter writing N, 2N and 4N.  bgrecon's and
    # landmarks' name for it (stage) is right; 20-plan section 1's "$813092/94/96"
    # triple is the same word three times over.
    for name, addr in (("rank", "$81309E"), ("stageidx", "$813092"),
                       ("stagex2", "$813094"), ("f3098", "$813098")):
        vs = runs(rs, name)
        print(f"{addr} {name}: {len(vs)} runs, values "
              + " ".join(sorted({f'{v:04X}' for v, _, _, _ in vs}))
              + ("   [DIST: rank is fed by survival]" if name == "rank" else ""))

    # --- rowscroll and bg_scale, over the WHOLE stage this time
    nz = sum(int(r[C["rs_nz"]]) for r in rs)
    d = {int(r[C["rs_d"]]) for r in rs}
    sc = {r[C["scale"]] for r in rs}
    ct = {r[C["ctrl"]] for r in rs}
    print(f"ROWSCROLL over {len(rs)} lf: total non-zero entries={nz} distinct-per-frame={d}")
    print(f"BG_SCALE values at sample point: {sorted(sc)}   CTRL: {sorted(ct)}")

    # --- BG map column writes: the odometer of the tilemap ring
    tot = sum(int(r[C["bgw"]]) for r in rs)
    gp = [r for r in rs if 0 < int(r[C["bgw"]]) <= 36]
    print(f"BGVRAM writes total={tot}  frames with 1..36 writes (the ring "
          f"writer's 9 longwords/column)={len(gp)}")

    # --- $80B03C, the element compensation, now that it has a writer
    b3 = {r[C["b03c"]] for r in rs}
    print(f"$80B03C distinct values over the stage: {len(b3)}  "
          f"e.g. {sorted(b3)[:6]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
