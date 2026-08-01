#!/usr/bin/env python3
r"""VALIDATE the listing-derived scroll simulation against a MEASURED TSV.

    python scrollgate.py out/bg-deep.tsv 0 1620

  argv: <tsv> <stage-index> <lf-of-sim-frame-0>

READER ONLY -- it runs no emulator.  It replays `scrollmap.py`'s model of
$2612A0 / $262062 / $261F76 / $240B94 one logic frame at a time, GATED BY THE
MEASURED $8130D2 (a frame on which the board's background handler did not run
must not advance the model either), and compares four columns per frame:

    $8130CE  the distance clock          (tsv col 16)
    $81318A  the mod-64 ring cursor      (tsv col 18)
    $81318C  the ($20,A5) column accum   (tsv col 19)
    $80B012  the BG camera along-axis    (tsv col 8)

The TSV is `games/ddpdoj/tools/oracle/bgrecon.lua`'s per-frame row; its column
order is fixed at `bgrecon.lua:181`.  A row whose $8130CE and $80B012 have both
returned to 0 is a RESET (death -> game over -> title) and ends the window.

MEASURED RESULT, 2026-08-01, `out/bg-deep.tsv` (deep play, 7,000 lf, build B):
    window lf 1621..3288 (the run dies at 3289), 1,668 frames compared,
    0 divergent on all four columns.

MEASURED RESULT, 2026-08-02, wave 17, `out/w17-stage1-invuln-p2.tsv`
(16,000 lf, build B, **INVULNERABLE + AUTO-SHOT** -- see
docs/worklog/ddpdoj/17-impl-invuln-stage-run.md for what that label forbids):
    window lf 1621..12359, **10,431 frames compared, 308 handler-skipped,
    0 divergent on all four columns** -- the WHOLE of stage 1 including all
    13 background elements, both cues, the boss lock at $0344 and its exit.
    The old claim covered frames 1..1,668 of 7,317 (22.8 %); this one covers
    the stage and the 3,424-frame boss lock on top of it.
    A no-intervention control (`out/w17-stage1-noinvuln-ctl.tsv`) reaches
    clock $00E9 and 2,202 comparable frames before the run dies out.

    python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0
    python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0 --mutate clock-per-frame
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_SRC = (HERE / "scrollmap.py").read_text().split("if __name__ ==")[0]
SM: dict = {"__file__": str(HERE / "scrollmap.py")}
exec(compile(_SRC, "scrollmap.py", "exec"), SM)      # noqa: S102 -- reader tool

u16, u32, s16, OPS = SM["u16"], SM["u32"], SM["s16"], SM["OPS"]


def read_tsv(path):
    rows = []
    for line in Path(path).read_text().splitlines():
        p = line.split("\t")
        if len(p) < 25:
            continue
        rows.append(dict(lf=int(p[0]), b012=int(p[7], 16), d0ce=int(p[15], 16),
                         d18a=int(p[17], 16), d18c=int(p[18], 16),
                         d0d2=int(p[20], 16)))
    return rows


# --------------------------------------------------------------------------
# THE RED SWITCHES.  A gate nobody has watched fail is not a gate (this project
# has shipped four such).  Each of these is a MISREADING OF THE LISTING that a
# careful person would plausibly make; all four must turn the four columns red.
# 20-plan §2 names `clock-per-frame`, `loop-word-as-iterations` and
# `cond-word-honoured` as W14/W16's required reds -- they live here so the gate
# carries them BEFORE the port does.
MUTATIONS = {
    "none": "the model as translated",
    "clock-per-frame": "$8130CE ticks once per frame instead of once per $200 "
                       "of scroll -- it is an ODOMETER ($26132C), not a frame "
                       "counter",
    "loop-word-as-iterations": "op-$04's loop word read as EXTRA passes",
    "len-not-lenplus1": "$261F76's countdown armed at len instead of len+1",
    "cond-word-honoured": "the record's second word treated as a condition; "
                          "$262082 is an unconditional addq.w #2,A1",
    "commit-the-fraction": "$240B94 adds the whole accumulator instead of "
                           "(acc & ~$3F), i.e. the sub-pixel fraction is "
                           "committed to $80B012",
}


def gate(tsv, stage=0, k=1620, entry=0, mut="none"):
    """entry = ($6,A5), the object's ENTRY CLOCK.  0 for a stage start; the
    attract demo enters stage 1 at $0038 and runs $26200E's fast-forward."""
    if mut not in MUTATIONS:
        raise SystemExit("mutations: " + ", ".join(MUTATIONS))
    if mut != "none":
        print(f"  MUTATION {mut}: {MUTATIONS[mut]}")
    rows = read_tsv(tsv)
    _, s0, s1 = SM["stage_scripts"](stage)
    speed = 0x20
    acc_tick = acc02a = b012 = 0
    frozen = 0
    clock = entry
    acc_col = (clock & 3) << 9                                  # $261186
    colptr = (u32(SM["T_BG_COLSTREAM"] + 4 * stage)
              + (clock >> 2) * 36)                              # $2611E0
    colptr += 15 * 36                                           # $2611FC pre-fill
    cursor = 15
    blk = [dict(cur=s0 + 8, rew=0, loop=0, rlen=0, cnt=0, resume=0),
           dict(cur=s1 + 8, rew=0, loop=0, rlen=0, cnt=0, resume=0)]
    if entry:
        # $26200E: replay the interpreter for clocks 0..entry-1 with $813190=1,
        # then RESTORE ($A,A5)/($10,A5) from the stack and clear the repeat state.
        for c in range(entry):
            for i in (0, 1):
                b = blk[i]
                while True:
                    a = b["cur"]
                    t = u16(a)
                    if t == 0xFFFF or t != c:
                        break
                    op = u16(a + 4)
                    if op == 0x08 and i == 0:
                        speed = u16(a + 6)
                    b["cur"] = a + 6 + OPS[op][1]
        blk[0]["rew"] = blk[1]["rew"] = 0        # $81319E / $8131B6 cleared

    agree = dict(clock=0, cursor=0, acc=0, b012=0)
    tot = skipped = 0
    bad = []
    started = False
    prev_clock = None
    for r in rows:
        if r["lf"] <= k:
            continue
        if prev_clock and r["d0ce"] == 0:
            print(f"  reset detected at lf={r['lf']} -- window ends here")
            break
        prev_clock = r["d0ce"]
        if r["d0d2"]:
            skipped += 1
            continue
        started = True
        for i in (0, 1):
            b = blk[i]
            while True:
                a = b["cur"]
                t = u16(a)
                if t == 0xFFFF or t != clock:
                    break
                if mut == "cond-word-honoured" and u16(a + 2) != 0:
                    break
                op = u16(a + 4)
                sz = OPS[op][1]
                args = [u16(a + 6 + 2 * j) for j in range(sz // 2)]
                if op == 0x08 and i == 0:
                    speed = args[0]
                elif op == 0x0C:
                    frozen = 1
                    b["resume"] = (clock + 4) & 0xFFFF
                elif op == 0x04:
                    if i == 0:
                        colptr += s16(a + 6) * 36
                        b["rew"] = colptr
                    else:
                        b["rew"] = 1
                    b["rlen"] = args[1]
                    b["cnt"] = args[1] + (0 if mut == "len-not-lenplus1" else 1)
                    b["loop"] = args[2] + (1 if mut == "loop-word-as-iterations"
                                           and args[2] != 0xFFFF else 0)
                b["cur"] = a + 6 + sz
        acc_tick += speed
        acc02a += speed
        if mut == "commit-the-fraction":
            b012 += acc02a
            acc02a = 0
        else:
            b012 += acc02a & ~0x3F             # $240B94, the &~$3F / &$3F split
            acc02a &= 0x3F
        if mut == "clock-per-frame":
            if not frozen:
                clock = (clock + 1) & 0xFFFF
        elif acc_tick >= 0x200:
            acc_tick -= 0x200
            if not frozen:
                clock = (clock + 1) & 0xFFFF
        acc_col += speed
        if acc_col >= 0x800:
            acc_col -= 0x800
            b = blk[0]
            if b["rew"]:                        # $261F76
                b["cnt"] -= 1
                if b["cnt"] <= 0:
                    if b["loop"] == 0xFFFF:
                        b["cnt"], colptr = b["rlen"], b["rew"]
                    else:
                        b["loop"] -= 1
                        if b["loop"] > 0:
                            b["cnt"], colptr = b["rlen"], b["rew"]
                        else:
                            b["rew"], frozen, clock = 0, 0, b["resume"]
            colptr += 36
            cursor = (cursor + 1) & 0x3F
        tot += 1
        for key, exp, got in (("clock", r["d0ce"], clock),
                              ("cursor", r["d18a"], cursor),
                              ("acc", r["d18c"], acc_col),
                              ("b012", r["b012"], b012)):
            if exp == got:
                agree[key] += 1
            elif len(bad) < 10:
                bad.append((key, r["lf"], hex(exp), hex(got)))
    print(f"  frames compared: {tot}   handler-skipped ($8130D2=1): {skipped}")
    print(f"  DIVERGENT: " + "  ".join(f"{k}={tot-v}" for k, v in agree.items()))
    for x in bad:
        print("   ", x)
    return tot, {k: tot - v for k, v in agree.items()}


def sweep(tsv, stage=0, lo=1000, hi=2600):
    """Find the lf of sim frame 0 rather than assuming it."""
    import io, contextlib
    best = None
    for k in range(lo, hi):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tot, div = gate(tsv, stage, k)
        if tot > 200 and (best is None or (div["clock"], -tot) < (best[2]["clock"], -best[1])):
            best = (k, tot, div)
    print("BEST k =", best)
    return best


if __name__ == "__main__":
    if sys.argv[1] == "sweep":
        sweep(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    else:
        gate(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 0,
             int(sys.argv[3]) if len(sys.argv) > 3 else 1620,
             int(sys.argv[4], 0) if len(sys.argv) > 4 else 0,
             sys.argv[sys.argv.index("--mutate") + 1]
             if "--mutate" in sys.argv else "none")
