#!/usr/bin/env python3
"""stageledger.py -- the per-stage COVERAGE ledger and the regression gate.

WAVE 28. The "how finished is each stage" number, tracked, so it cannot silently
regress. For each of the 7 stages this prints how many of its distinct wave
records the port can dispatch, and the SCROLL of the first one it cannot, then
FAILS (non-zero exit) if any stage's coverage moved BACKWARD relative to the
frozen BASELINE below -- i.e. a handler that was ported is no longer ported.

It is a COVERAGE gate, not a correctness gate: it answers "did the port lose
ground", and the answer is read out of `assets/prg.bin` (the inventory) and
`src/enemies.js` (the ported set). No emulator.

RECORD-COUNTING CONVENTION (one, documented per the brief):
  A "record" is a DISTINCT ROM ADDRESS in the stage's wave lists. Chunk streams
  share tails (stage 0 chunks 5/6/7 are one pointer; stage 2 chunk 1's stream
  runs through chunks 2/3), so "record reads" overcounts -- the honest
  denominator is distinct addresses (28-recon-stages-2-7.md sec 1, and the same
  convention `wavecensus.py` prints as "DISTINCT wave records (by ROM address)").
  This is the convention the recon used; this tool pins it.

  A record is PORTED if the port can dispatch its spawn:
    * single/formation records (cmd < $F0) need their $AE1C handler address to
      be a `case 0xNNNN:` in src/enemies.js dispatch() (read live, so it cannot
      drift -- the same read `wavecensus.py` / `census.py` use);
    * inline-5 records (cmd >= $F0) need that AND the ARM their stage routes to
      ($A466's `CMP #$02` picks $A46F or $A4A6) to be implemented in
      src/enemies.js.

  WAVE 30 CHANGED THAT SECOND BULLET. It used to read "inline-5 records are an
  unported ROUTE ($A37A) and count as UNPORTED" -- true when it was written and
  a STALE HAND-KEPT LITERAL the moment W30 ported the loader, the splitter and
  the $A46F arm. The test is read out of the source now (wavecensus.dispatchable
  / PORTED_INLINE5_ARMS), the same way the handler set always has been. The
  `inline5` COLUMN still counts every 5-byte record, so it now OVERLAPS ported
  and unported: distinct = ported + unported, and inline5 is a separate tally of
  how many of those came through the 5-byte stride.

WHAT "MOVES BACKWARD" MEANS:
  Per stage the gate watches two signals, both of which a removed handler trips:
    1. the SCROLL of the first unported record (smaller = earlier = worse); a
       fully-shipped stage has none, modelled as infinity;
    2. the PORTED record count.
  The gate FAILS if the first-unported scroll moves backward OR the ported count
  drops below the baseline. A wave that ports more moves them FORWARD; update the
  baseline by hand then (never backward). The baseline is COVERAGE -- the port's
  own state, re-derivable -- not ROM data; nothing ROM-derived is committed.

Usage
  python games/gradius/tools/oracle/stageledger.py            # print + gate
  python games/gradius/tools/oracle/stageledger.py --baseline # print the dict
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wavecensus as g                       # the inventory, already written

rd, wd, u8 = g.rd, g.wd, g.u8
HANDLERS = g.HANDLERS
PORTED = g.PORTED_TARGETS
hf = g.handler_for

STAGE_TBL = [wd(0xA7D0 + 2 * i) for i in range(8)]

ENEMIES_JS = os.path.join(HERE, '..', '..', 'src', 'enemies.js')


def _fn_body(src, header):
    """The text of one JS function, header line through its closing `\\n}\\n`."""
    i = src.index(header)
    return src[i:src.index("\n}\n", i)]


# ---------------------------------------------------------------------------
# WAVE 31: THE TWO SIGNALS THE RECORD COLUMNS CANNOT SEE.
#
# Stage $19=3 read 98/98 in every column of this table for a whole wave while
# the port still threw on its first wave record, because a record's coverage is
# "does its type have a handler" and TWO OTHER THINGS have to hold before a
# stage can run at all:
#
#   (a) runEngine's own SCOPE GUARD, `if (stageIndex >= N) throw`, which is a
#       deliberate wall the implementer moves forward one stage at a time. It
#       lives in src/enemies.js and no column here read it.
#   (b) the stage's LATE-SPAWNER ARM, jt_$C439[$19]. It is not a wave record --
#       it is a second spawner that runs during the $82 countdown -- so it has
#       no row in the record census. Stage 1's ($C486, the volcano) has ZERO
#       wave records anywhere and neither does stage 4's ($C5AD).
#
# Both are read LIVE out of src/enemies.js, for the same reason the inline-5
# rule and PORTED_TARGETS are: a hand-kept literal here would go stale the
# first time somebody ported an arm, which is the failure mode this file's
# docstring already records twice.
# ---------------------------------------------------------------------------

LATE_ARMS = [wd(0xC439 + 2 * i) for i in range(7)]   # jt_$C439, indexed by $19


def _late_arm_child(arm):
    """The `$AE1C` entry an arm's spawned type dispatches to, or None.

    Read out of assets/prg.bin, not from a table in this file: an arm that
    hard-codes its type does it with `LDA #$nn / STA $030C,X` = `A9 nn 9D 0C 03`
    (`$C4DA` type $0A, `$C562` type $0B, `$C5F4` type $15). W31 added this
    because removing `case 0xB377:` from dispatch() reddened NOTHING here: the
    stage-4 rock has ZERO wave records -- its only producer is `$C5AD` -- so the
    record census is structurally blind to it, exactly as it is to the stage-1
    volcano's type $0A.

    None means "this arm does not name its type as an immediate", which is the
    honest answer for `$C686` (it reads `$C6CC,$3A`), `$C653`, `$C6DE` and the
    bare RTS `$C429`. None does NOT mean the arm has no child -- it means this
    scan cannot prove one, and the signal declines to constrain it rather than
    guessing. Whoever ports `$C686`/`$C653`/`$C6DE`'s children should say so
    here instead of letting a None read as an all-clear.
    """
    for p in range(arm, arm + 0xB0):
        if rd(p) == 0xA9 and rd(p + 2) == 0x9D and rd(p + 3) == 0x0C \
           and rd(p + 4) == 0x03:
            return hf(rd(p + 1))[0]          # the $AE1C target for that type
    return None


LATE_ARM_CHILD = [_late_arm_child(a) for a in LATE_ARMS]


def _engine_scope_limit():
    """N from runEngine's `if (stageIndex >= N)` guard: stages < N are admitted.

    7 when no guard is present (every stage admitted). Raises if the guard is
    there but unparseable -- a silently-mis-parsed guard would report stages as
    reachable that throw, which is the exact lie this signal exists to stop.
    """
    src = open(ENEMIES_JS, encoding="utf-8").read()
    body = _fn_body(src, "function runEngine(state, rom, stageIndex, res)")
    key = "if (stageIndex >= "
    if key not in body:
        return 7
    tail = body[body.index(key) + len(key):]
    num = tail[:tail.index(")")].strip()
    try:
        return int(num, 0)
    except ValueError:
        raise SystemExit("stageledger: runEngine's scope guard is present but "
                         "its bound %r did not parse. Fix the parser rather "
                         "than letting the ledger report unreachable stages as "
                         "reachable." % num)


def _ported_late_arms():
    """{rom address} of the jt_$C439 arms lateSpawner() actually runs.

    A `case 0xNNNN:` whose body contains `throw` is NOT ported; one that
    returns is. `$C429` is the cartridge's own bare RTS (stage 7 has no late
    spawner) and returns, so it counts as ported -- correctly: the port does
    what the ROM does there.
    """
    src = open(ENEMIES_JS, encoding="utf-8").read()
    body = _fn_body(src, "function lateSpawner(state, rom, stageIndex)")
    out, cur = set(), None
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("//"):
            continue
        if s.startswith("case 0x"):
            cur = int(s[5:s.index(":")], 16)
            s = s[s.index(":") + 1:].strip()
        elif s.startswith("default:"):
            cur = None
        if cur is not None and "throw" in s:
            out.discard(cur)
            cur = None
        elif cur is not None and ("return" in s or s.startswith("st_")):
            out.add(cur)
            cur = None
    if not out:
        raise SystemExit("stageledger: parsed ZERO ported late-spawner arms out "
                         "of src/enemies.js lateSpawner() -- the parser is "
                         "broken, and an empty set would report every stage's "
                         "spawner missing.")
    return out


def _stage_records():
    """stage -> {rom_addr: record} for DISTINCT records (the honest denominator).

    Reuses wavecensus.stream/decode so the record shape (kind/type/scroll) and
    the chunk-walk are identical to the census the recon quoted.
    """
    per_stage = {}
    for st in range(7):
        tbl = STAGE_TBL[st]
        nchunk = (STAGE_TBL[st + 1] - tbl) // 2
        recs = {}
        for ci in range(nchunk):
            z61 = ci * 2
            ptr = rd(tbl + z61) | (rd(tbl + z61 + 1) << 8)
            for kind, p, trig, cmd in g.stream(ptr, st):
                if kind == 'END':
                    continue
                if cmd >= 0xF0:
                    r = g.decode_inline5(p, st)
                elif cmd < 0x80:
                    r = g.decode_single(cmd)
                else:
                    r = g.decode_formation(cmd)
                r['at'] = p
                r['trigger'] = trig
                r['cmd'] = cmd
                r['scroll'] = (z61 + ((trig >> 7) & 1)) * 256 + u8(trig << 1)
                recs[p] = r                       # distinct by ROM address
        per_stage[st] = recs
    return per_stage


_ported_p = g.dispatchable      # THE one definition, in wavecensus.py


def compute():
    """Return [{stage, distinct, ported, unported, inline5, first_unported_scroll,
               first_unported_at, all_ported}] for stages 0..6.

    Column convention (identical to wavecensus.py, so the ledger agrees with the
    recon table): distinct = ported + unported, and `inline5` is an OVERLAPPING
    tally of how many of the distinct records use the 5-byte stride. Before W30
    the three were disjoint because no inline-5 record was dispatchable; see the
    module docstring. `all_ported` is true only when EVERY record is
    dispatchable, inline-5 included."""
    rows = []
    scope = _engine_scope_limit()
    arms = _ported_late_arms()
    per_stage = _stage_records()
    for st in range(7):
        recs = per_stage[st]
        ported = unported = inl = 0
        first_scroll = None
        first_at = None
        for addr, r in recs.items():
            if r['kind'] == 'inline5':
                inl += 1                          # the $A37A 5-byte stride
            dispatchable = _ported_p(r)
            if dispatchable:
                ported += 1
            else:
                unported += 1
            # first-unported: the earliest spawn the port cannot dispatch, for
            # ANY reason -- a missing handler or an unported inline-5 arm.
            if not dispatchable:
                if first_scroll is None or r['scroll'] < first_scroll or \
                   (r['scroll'] == first_scroll and addr < first_at):
                    first_scroll = r['scroll']
                    first_at = addr
        nondispatchable = unported
        rows.append(dict(stage=st, distinct=len(recs), ported=ported,
                         unported=unported, inline5=inl,
                         first_unported_scroll=first_scroll,
                         first_unported_at=first_at,
                         all_ported=(nondispatchable == 0),
                         # W31: the two signals the record columns cannot see.
                         engine=(st < scope),
                         late_arm=LATE_ARMS[st],
                         late_child=LATE_ARM_CHILD[st],
                         late_ported=(LATE_ARMS[st] in arms
                                      and (LATE_ARM_CHILD[st] is None
                                           or LATE_ARM_CHILD[st] in PORTED))))
    return rows


# THE BASELINE -- frozen coverage, W28b. Coverage is the port's own state (read
# out of src/enemies.js's dispatch() case labels + the ROM's wave lists); it is
# re-derived here, not a ROM dump. A wave that ports more ADVANCES a row (lifts
# the ported floor and/or pushes first-unported to a later scroll / to None);
# update this dict then. The gate fails the moment any row regresses past it.
#
#   first_unported_scroll : the scroll of the earliest record the port cannot
#                           dispatch, or None when the stage is fully shipped
#                           (stage 0 / in-game stage 1, which W22-W27 shipped).
#   ported_floor          : the minimum distinct records the port must dispatch.
BASELINE = {
    # FIRST MEASURED OUT OF assets/prg.bin + src/enemies.js ON 2026-08-03 (W28b).
    # RE-MEASURED 2026-08-04 (W30). first_unported_scroll is the EARLIEST spawn
    # the port cannot dispatch in that stage; ported_floor is the minimum number
    # of distinct records the port must keep dispatching.
    #
    # W29 SHIPPED STAGE 1 AND DID NOT LIFT THIS DICT -- it left rows 1 and 6 at
    # 0x09A0/88 and 0x0340/95 while the port had already moved them to
    # None/93 and 0x0CC0/104 (its own worklog records "stage $19=6 also advanced
    # 95 -> 104"). A floor that trails the port cannot catch the regression it
    # exists to catch, so both are corrected here along with W30's own rows.
    #
    # W31 ADDS `runnable`: True once ALL THREE of the stage's gates are open --
    # every record dispatchable, runEngine's scope guard admitting the stage,
    # and its jt_$C439 late-spawner arm ported. Stage 3 is the reason it exists:
    # it read None/floor-98 in both columns above for a whole wave while
    # `if (stageIndex >= 3) throw` still stopped it dead on its first record, so
    # a row could be perfect and the stage unplayable at the same time. Once
    # True it can never go back to False without the gate failing.
    0: dict(first_unported_scroll=None,        ported_floor=92,  runnable=True),   # W22-W27
    1: dict(first_unported_scroll=None,        ported_floor=93,  runnable=True),   # W29
    2: dict(first_unported_scroll=None,        ported_floor=78,  runnable=True),   # W30 (moai)
    3: dict(first_unported_scroll=None,        ported_floor=98,  runnable=True),   # W31:
                                                # records came free in W30
                                                # ($B402/$B434); W31 opened the
                                                # other two gates ($C5AD, $B377)
    4: dict(first_unported_scroll=0x0000,      ported_floor=14,  runnable=False),  # W32 owns it
    5: dict(first_unported_scroll=0x03B0,      ported_floor=47,  runnable=False),  # W33
    6: dict(first_unported_scroll=0x0CC0,      ported_floor=104, runnable=False),  # W34
}


def _print_ledger(rows):
    print("=" * 76)
    print("PER-STAGE COVERAGE LEDGER  (convention: distinct ROM addresses)")
    print("=" * 76)
    print("%-6s %-9s %-8s %-9s %-8s %-12s %s"
          % ("stage", "distinct", "ported", "unported", "inline5",
             "ported %", "first unported"))
    tot_d = tot_p = tot_u = tot_i = 0
    for r in rows:
        tot_d += r['distinct']; tot_p += r['ported']
        tot_u += r['unported']; tot_i += r['inline5']
        if r['all_ported']:
            fu = "NONE (shipped)"
        else:
            fu = "scroll $%04X  (@$%04X)" % (r['first_unported_scroll'],
                                             r['first_unported_at'])
        print("%-6d %-9d %-8d %-9d %-8d %-12.1f %s"
              % (r['stage'], r['distinct'], r['ported'], r['unported'],
                 r['inline5'], 100.0 * r['ported'] / max(1, r['distinct']), fu))
    print("%-6s %-9d %-8d %-9d %-8d %-12.1f"
          % ("ALL", tot_d, tot_p, tot_u, tot_i,
             100.0 * tot_p / max(1, tot_d)))
    # W31: the two non-record signals, printed separately so nobody reads a
    # 100 % record row as "this stage runs". They are different questions.
    print()
    print("PER-STAGE RUNNABILITY  (NOT record coverage -- see W31)")
    print("%-6s %-22s %-28s %s"
          % ("stage", "$A2F0 runEngine", "late spawner jt_$C439[$19]", "verdict"))
    for r in rows:
        eng = "admitted" if r['engine'] else "THROWS (scope guard)"
        child = ("" if r['late_child'] is None
                 else " +$%04X" % r['late_child'])
        arm = "$%04X%s %s" % (r['late_arm'], child,
                              "ported" if r['late_ported'] else "THROWS")
        ok = r['all_ported'] and r['engine'] and r['late_ported']
        print("%-6d %-22s %-28s %s"
              % (r['stage'], eng, arm, "RUNNABLE" if ok else "blocked"))


def gate(rows):
    """Return list of regression messages ([] = clean)."""
    msgs = []
    for r in rows:
        st = r['stage']
        base = BASELINE.get(st)
        if base is None:
            continue
        # (1) first-unported scroll must not move backward. None (shipped) is the
        # best state: any real scroll where the baseline had None is a regression.
        cur = r['first_unported_scroll']
        bscroll = base['first_unported_scroll']
        if bscroll is None and cur is not None:
            msgs.append("stage %d regressed: was fully shipped (no unported "
                        "record), now first unported at scroll $%04X (@$%04X)."
                        % (st, cur, r['first_unported_at']))
        elif bscroll is not None and cur is not None and cur < bscroll:
            msgs.append("stage %d regressed: first unported moved BACKWARD, "
                        "$%04X -> $%04X (@$%04X)."
                        % (st, bscroll, cur, r['first_unported_at']))
        elif bscroll is not None and cur is None:
            # Coverage advanced (stage became fully shipped) -- forward, not a
            # regression. The ported floor catches it if it later unwinds.
            pass
        # (2) ported count must not drop below the floor.
        if r['ported'] < base['ported_floor']:
            msgs.append("stage %d regressed: ported %d < baseline floor %d "
                        "(a handler that was ported is no longer ported)."
                        % (st, r['ported'], base['ported_floor']))
        # (3) W31: runnability must not unwind. A stage that once ran must keep
        # running -- and this is the only signal that watches the scope guard
        # and the late-spawner arm at all.
        if base.get('runnable') and not (r['all_ported'] and r['engine']
                                         and r['late_ported']):
            why = []
            if not r['all_ported']:
                why.append("a record is no longer dispatchable")
            if not r['engine']:
                why.append("runEngine's scope guard now throws on it")
            if not r['late_ported']:
                why.append("its late-spawner arm $%04X%s now throws"
                           % (r['late_arm'],
                              "" if r['late_child'] is None
                              else " (or its child $%04X)" % r['late_child']))
            msgs.append("stage %d regressed: was RUNNABLE, now blocked -- %s."
                        % (st, "; ".join(why)))
    return msgs


def main():
    rows = compute()
    _print_ledger(rows)
    if '--baseline' in sys.argv:
        print("\n# paste this into BASELINE when a wave advances coverage:")
        for r in rows:
            sc = r['first_unported_scroll']
            run = r['all_ported'] and r['engine'] and r['late_ported']
            print("    %d: dict(first_unported_scroll=%s, ported_floor=%d, "
                  "runnable=%s),"
                  % (r['stage'], 'None' if sc is None else ('0x%04X' % sc),
                     r['ported'], run))
        return 0
    print()
    msgs = gate(rows)
    if msgs:
        print("REGRESSION -- coverage moved backward in %d stage(s):" % len(msgs))
        for m in msgs:
            print("  - " + m)
        print("\nIf this is INTENTIONAL (you removed a handler on purpose), the\n"
              "      gate is doing its job. Otherwise a `case 0xNNNN:` label\n"
              "      left src/enemies.js dispatch(). Porting more ADVANCES the\n"
              "      baseline; run `stageledger.py --baseline` and lift the row.")
        return 1
    print("OK -- no stage's coverage moved backward relative to the baseline.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
