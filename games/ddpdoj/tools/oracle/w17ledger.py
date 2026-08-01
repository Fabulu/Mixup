#!/usr/bin/env python3
r"""WAVE 17 -- THE RECORD-EXECUTION GATE.  Compare the board's own scroll-VM
execution ledger, frame for frame and record for record, against the
listing-derived simulation, over the WHOLE stage.

    python w17ledger.py out/w17-stage1-invuln-p2.log            expect 0 bad
    python w17ledger.py out/w17-stage1-invuln-p2.log --mutate off-by-one

READER ONLY.  It runs no emulator; it reads the PROBE log `w17stage.lua` wrote.

WHY THIS EXISTS AND WHY IT IS NOT scrollgate.py
-----------------------------------------------
`scrollgate.py` compares four *state* columns ($8130CE $81318A $81318C
$80B012).  State can agree while the program that produced it is wrong -- two
different record schedules can pass through the same clock values.  This gate
compares the EVENTS: which record executed, on which logic frame.

The board's side is not inferred.  `$262092: move.l A1,(A6)` writes the script's
record cursor and runs ONLY after a record has been dispatched ($262062's inner
loop), so a write tap on $813192 (script 0) / $8131AA (script 1) fires exactly
once per executed record and its value is the address of the NEXT record.  The
executed record is therefore the previous cursor value.  Likewise every one of
the 13 stage-1 background-element constructors writes the per-frame updater
pointer at (slot+$8) -- `w17stage.lua`'s ELEM tap -- so op-$10 executions are
observed at their handler, not deduced.

DENOMINATOR (20-recon-scroll-engine §4/§5): stage-1 script 0 = 41 records at
$261610, script 1 = 16 at $26179A, 13 of script 0's records are op $10.

MEASURED, 2026-08-02, `out/w17-stage1-invuln-p2.log` (16,000 lf, INVULNERABLE):
    script0 41/41 records, script1 16/16, bgelem 13/13, 0 frame mismatches,
    lf = simframe + 1620 on every single one.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_SRC = (HERE / "scrollmap.py").read_text().split("if __name__ ==")[0]
SM: dict = {"__file__": str(HERE / "scrollmap.py")}
exec(compile(_SRC, "scrollmap.py", "exec"), SM)      # noqa: S102 -- reader tool

u16, u32, s16, OPS = SM["u16"], SM["u32"], SM["s16"], SM["OPS"]

MUTATIONS = {
    "none": "the model as translated",
    "off-by-one": "shift the model one logic frame late -- proves the gate is "
                  "frame-exact and not merely order-exact",
    "clock-per-frame": "tick $8130CE once per FRAME instead of once per $200 "
                       "of scroll (20-plan W14/W16's named red)",
    "loop-word-as-iterations": "read op-$04's loop word as EXTRA passes "
                               "instead of the pass count",
    "len-not-lenplus1": "arm the repeat countdown at len instead of len+1",
    "cond-word-honoured": "treat the record's skipped second word as a "
                          "condition ($262082 is an unconditional addq)",
}


def predict(stage=0, mut="none"):
    """(frame, script, record-address, op) for every record the model executes,
    plus the simulated frame of every op-$10.  This is $2612A0/$262062/$261F76
    with only the fields the mutations touch made switchable."""
    _, s0, s1 = SM["stage_scripts"](stage)
    speed = 0x20
    acc_tick = acc_col = 0
    frozen = 0
    clock = 0
    acc_col = (clock & 3) << 9
    colptr = u32(SM["T_BG_COLSTREAM"] + 4 * stage) + 15 * 36
    blk = [dict(cur=s0 + 8, rew=0, loop=0, rlen=0, cnt=0, resume=0),
           dict(cur=s1 + 8, rew=0, loop=0, rlen=0, cnt=0, resume=0)]
    out = []
    frame = 0
    while frame < 40000:
        for i in (0, 1):
            b = blk[i]
            while True:
                a = b["cur"]
                t = u16(a)
                if t == 0xFFFF or t != clock:
                    break
                if mut == "cond-word-honoured" and u16(a + 2) != 0:
                    break                       # RED: $262082 is unconditional
                op = u16(a + 4)
                sz = OPS[op][1]
                args = [u16(a + 6 + 2 * j) for j in range(sz // 2)]
                out.append((frame + (1 if mut == "off-by-one" else 0), i, a, op,
                            args[0] if args else 0))
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
        if mut == "clock-per-frame":
            if not frozen:
                clock = (clock + 1) & 0xFFFF     # RED: $8130CE is an ODOMETER
        elif acc_tick >= 0x200:
            acc_tick -= 0x200
            if not frozen:
                clock = (clock + 1) & 0xFFFF
        acc_col += speed
        if acc_col >= 0x800:
            acc_col -= 0x800
            b = blk[0]
            if b["rew"]:
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
        frame += 1
        # the model's stage is over when script 0 has nothing left to reach:
        # the last stage-1 record pair is at clock $0344 and locks forever.
        if out and out[-1][3] == 0x04 and out[-1][4] == 0xFFF2 and frame > 8000:
            break
    return out


# $262092 is the EXECUTION write.  $262004/$261FEA also write the cursor -- the
# object's init and $26200E's fast-forward -- and those SEED it without a record
# having run, so they must be read (or the first record is invisible) and must
# not be counted as executions.
CUR = re.compile(r"HUNTLOG (vm0cursor_813192|vm1cursor_8131AA) "
                 r"lf(\d+)/clk([0-9A-F]{4})@([0-9A-F]{6}):(8131[0-9A-F]{2})=([0-9A-F]{4})")
ELEM = re.compile(r"ELEMLOG lf(\d+)/clk([0-9A-F]{4})@([0-9A-F]{6}) slot(\d)\+8="
                  r"([0-9A-F]{4})")
# `$262320` is the object init's slot-table CLEAR (8 slots x 2 words of zero),
# not a construction.  The discriminator is the value, not the PC: a constructor
# writes the high half of a $26xxxx updater pointer, a clear writes 0.
RESET = re.compile(r"RESET clock returned to 0 at lf=(\d+)")


def observe(logpath):
    """The board's ledger: [(lf, script, executed-record-address)] and the
    op-$10 constructor calls [(lf, clk, constructor-pc, slot)]."""
    lines = Path(logpath).read_text().splitlines()
    # a long write on a 16-bit bus is two tap fires: $8131x2 (high) then
    # $8131x4 (low).  Pair them back into the pointer the interpreter stored.
    pend = {}
    cursor = {}
    execs = []
    for ln in lines:
        m = CUR.search(ln)
        if not m:
            continue
        which, lf, clk, pc, addr, val = (m.group(1), int(m.group(2)), m.group(3),
                                         int(m.group(4), 16),
                                         int(m.group(5), 16), int(m.group(6), 16))
        i = 0 if which.startswith("vm0") else 1
        if addr in (0x813192, 0x8131AA):
            pend[i] = val << 16
        else:
            nxt = pend.get(i, 0) | val
            prev = cursor.get(i)
            if prev is not None and pc == 0x262092:
                execs.append((lf, i, prev, int(clk, 16)))
            cursor[i] = nxt
    elems = [(int(m.group(1)), int(m.group(2), 16), int(m.group(3), 16),
              int(m.group(4))) for m in (ELEM.search(l) for l in lines)
             if m and int(m.group(5), 16) != 0]
    # THE STAGE BOUNDARY, taken from the board and not from the model: the run
    # tore stage 1's background object down and built stage 2's, and everything
    # at or after that logic frame belongs to another script.
    end = min([int(m.group(1)) for m in (RESET.search(l) for l in lines) if m]
              or [10 ** 9])
    return ([e for e in execs if e[0] < end],
            [e for e in elems if e[0] < end], end)


def main() -> int:
    log = sys.argv[1] if len(sys.argv) > 1 else "out/w17-stage1-invuln-p2.log"
    mut = sys.argv[sys.argv.index("--mutate") + 1] if "--mutate" in sys.argv \
        else "none"
    if mut not in MUTATIONS:
        raise SystemExit(f"mutations: {', '.join(MUTATIONS)}")
    k = int(sys.argv[sys.argv.index("--k") + 1]) if "--k" in sys.argv else 1620

    execs, elems, end = observe(log)
    pred = predict(0, mut)
    print(f"MUTATION {mut}: {MUTATIONS[mut]}")
    print(f"BOARD stage-1 window: lf < {end} (the frame the board tore the stage-1 background object down)")
    print(f"MODEL   {len(pred)} record executions "
          f"(script0={sum(1 for e in pred if e[1]==0)}, "
          f"script1={sum(1 for e in pred if e[1]==1)}), "
          f"op-$10={sum(1 for e in pred if e[3]==0x10)}")

    # The two scripts are compared SEPARATELY and element-wise: the log groups
    # its lines per tap, so the two ledgers arrive concatenated, not interleaved,
    # and a single forward cursor over both would silently skip records.  This
    # comparison is positional -- record n of the board against record n of the
    # model -- so a WRONG RECORD is a mismatch, not just a wrong frame.
    bad, n = [], 0
    for i in (0, 1):
        obs = [e for e in execs if e[1] == i]
        mod = [e for e in pred if e[1] == i]
        if len(obs) != len(mod):
            bad.append((0, i, 0, f"board ran {len(obs)} script-{i} records, "
                                 f"model runs {len(mod)}"))
        for (lf, _, addr, clk), (f, _, ma, op, a0) in zip(obs, mod):
            if addr != ma:
                bad.append((lf, i, addr, f"model expected record ${ma:06X}"))
            elif f + k != lf:
                bad.append((lf, i, addr, f"model frame {f} -> lf{f + k}"))
            n += 1
    print(f"BOARD   {n} record executions matched against the model "
          f"(script0={sum(1 for e in execs if e[1]==0)}, "
          f"script1={sum(1 for e in execs if e[1]==1)}), "
          f"k(lf of sim frame 0)={k}")
    print(f"RECORD-LEDGER MISMATCHES: {len(bad)}")
    for b in bad[:12]:
        print("   lf%d script%d rec $%06X  %s" % b)

    # op-$10 is checked at the constructor, independently of the cursor tap
    pel = [e for e in pred if e[3] == 0x10]
    oel = elems
    print(f"BGELEM model={len(pel)} board-constructions={len(oel)}")
    ebad = 0
    for (pf, _, pa, _, pid), (lf, clk, pc, slot) in zip(pel, oel):
        if pf + k != lf:
            ebad += 1
            if ebad <= 8:
                print(f"   BGELEM id={pid} model lf{pf+k} board lf{lf} pc=${pc:06X}")
    if len(pel) != len(oel):
        ebad += abs(len(pel) - len(oel))
    print(f"BGELEM MISMATCHES: {ebad}")

    ok = not bad and not ebad
    print("GATE " + ("GREEN" if ok else "RED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
