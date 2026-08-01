#!/usr/bin/env python3
"""W20: simulate the BG column-stream POINTER for each stage's script 0, exactly
as $26127A/$261F76/$262102/$2611FC do, and report how many columns of the
adjacency-derived stream the script actually consumes.

Model (all read from the listing, addresses in the worklog):
  init  $2611FC : write 15 columns, pointer += 15, cursor = 15
  frame $261300 : clock ($8130CE) ticks every $200 of scroll, ONE COLUMN written
                  every $800 -> exactly 4 clock ticks per column, phase-locked by
                  $261186 ( ($20,A5) = (clock & 3) * $200 ).
                  $261F76 runs BEFORE each column write.
  op $04 $262102: ptr += (s16)*36 immediately; save that as the rewind target;
                  ($12)=n, ($14)=n+1, ($10)=loops ($FFFF = forever)
  op $0C        : freeze the clock, stash clock+4 as the resume value
  $261F76       : --($14); if >0 nothing.  else if loops==$FFFF or --loops>0:
                  ($14)=($12), ptr := rewind target.  else: unfreeze, clock=stash.

Columns keep being written while the clock is frozen; the repeat block is
self-timed in COLUMNS, which is why the freeze is needed at all.
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import w20level as W

OPSZ = W.OPSZ


def sim(stage: int, verbose=True):
    p = W.L(W.STAGE_PTR_TBL + stage * 4)
    sp = W.L(p)                      # script 0 drives the BG stream
    base = W.L(W.COL_TBL + stage * 4)
    end = W.L(W.PAL_TBL + stage * 4)
    avail = (end - base) // 36

    # parse records
    recs, a = [], sp + 8
    while W.W(a) != 0xFFFF:
        t, op = W.W(a), W.W(a + 4)
        n = OPSZ[op]
        recs.append((t, op, [W.W(a + 6 + 2 * i) for i in range(n)]))
        a += 6 + 2 * n

    ptr = 15          # columns consumed by the init fill
    maxptr = 15
    touched = set(range(15))
    clock = 0
    frozen = False
    rew = None        # (target, reload, countdown, loops)
    stash = 0
    subcol = 0        # column phase: a column is written every 4 clock ticks
    ri = 0
    writes = 0
    guard = 0
    log = []
    while guard < 200000:
        guard += 1
        # run every script record whose time == clock
        while ri < len(recs) and recs[ri][0] == clock and not frozen:
            t, op, args = recs[ri]
            if op == 0x04:
                d = args[0] - 0x10000 if args[0] & 0x8000 else args[0]
                ptr += d
                rew = [ptr, args[1], args[1] + 1, args[2]]
                log.append(f"  t=${t:04X} REWIND {d:+d} cols -> col {ptr}, "
                           f"band {args[1]}, loops "
                           f"{'FOREVER' if args[2] == 0xFFFF else args[2]}")
            elif op == 0x0C:
                frozen = True
                stash = clock + 4
                log.append(f"  t=${t:04X} FREEZE (resume at ${stash:04X})")
            ri += 1
        if ri >= len(recs) and rew is None and not frozen:
            break
        # advance one clock tick
        if not frozen:
            clock += 1
        subcol += 1
        if subcol == 4:
            subcol = 0
            # --- $261F76 ---
            if rew is not None:
                rew[2] -= 1
                if rew[2] <= 0:
                    if rew[3] == 0xFFFF:
                        rew[2] = rew[1]
                        ptr = rew[0]
                    else:
                        rew[3] -= 1
                        if rew[3] > 0:
                            rew[2] = rew[1]
                            ptr = rew[0]
                        else:
                            rew = None
                            frozen = False
                            clock = stash
                            log.append(f"  repeat block done at write {writes}, "
                                       f"clock resumes ${clock:04X}, ptr col {ptr}")
            # --- the column write ---
            touched.add(ptr)
            maxptr = max(maxptr, ptr)
            ptr += 1
            writes += 1
        if rew is not None and rew[3] == 0xFFFF and writes > 4 * avail + 4000:
            log.append(f"  FOREVER loop entered; stopping. band = cols "
                       f"{rew[0]}..{rew[0] + rew[1] - 1}")
            break
    if verbose:
        print(f"stage {stage}: stream ${base:06X}..${end:06X} = {avail} columns available")
        for line in log:
            print(line)
        print(f"  columns TOUCHED {len(touched)} (0..{maxptr}), "
              f"UNUSED TAIL {avail - 1 - maxptr} columns = "
              f"{(avail - 1 - maxptr) * 36} bytes, total column writes {writes}")
    return avail, maxptr, len(touched)


if __name__ == "__main__":
    for s in (range(5) if len(sys.argv) < 2 else [int(sys.argv[1])]):
        sim(s)
        print()
