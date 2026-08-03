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
    * inline-5 records (cmd >= $F0) are an unported ROUTE ($A37A, the 5-byte
      spawn the engine has not ported) and count as UNPORTED. They are not an
      unported *handler* -- but the port cannot dispatch them either, and the
      regression that matters (a handler going missing) is independent of them.

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


def _ported_p(r):
    """Is this record's spawn dispatchable by the port? Inline-5 is not."""
    if r['kind'] == 'inline5':
        return False                             # $A37A route not ported
    t = r.get('type')
    if t is None:
        return False
    h, idx = hf(t)
    if idx >= 42:                                # out of the 42-entry table
        return False
    return h in PORTED


def compute():
    """Return [{stage, distinct, ported, unported, inline5, first_unported_scroll,
               first_unported_at, all_ported}] for stages 0..6.

    Column convention (identical to wavecensus.py, so the ledger agrees with the
    recon table): distinct = ported + unported + inline5, where `unported` counts
    single/formation records whose handler is NOT ported, and `inline5` is the
    separate unported ROUTE. `all_ported` is true only when EVERY record is
    dispatchable -- inline5 counts against it, because the port cannot dispatch
    an inline-5 spawn either."""
    rows = []
    for st in range(7):
        recs = _stage_records()[st]
        ported = unported = inl = 0
        first_scroll = None
        first_at = None
        for addr, r in recs.items():
            if r['kind'] == 'inline5':
                inl += 1                          # the unported $A37A route
            elif _ported_p(r):
                ported += 1
            else:
                unported += 1                     # handler not ported
            # first-unported considers BOTH non-portable kinds: a handler the
            # port lacks AND an inline-5 route. Either is a spawn the port
            # cannot dispatch, and the regression that matters (a handler going
            # missing) shows up here regardless of inline-5.
            dispatchable = (r['kind'] != 'inline5') and _ported_p(r)
            if not dispatchable:
                if first_scroll is None or r['scroll'] < first_scroll or \
                   (r['scroll'] == first_scroll and addr < first_at):
                    first_scroll = r['scroll']
                    first_at = addr
        nondispatchable = unported + inl
        rows.append(dict(stage=st, distinct=len(recs), ported=ported,
                         unported=unported, inline5=inl,
                         first_unported_scroll=first_scroll,
                         first_unported_at=first_at,
                         all_ported=(nondispatchable == 0)))
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
    # Only stage 0 (in-game stage 1) is fully shipped (W22-W27); the other six
    # are the stages-2-7 work (W29+). first_unported_scroll is the EARLIEST spawn
    # the port cannot dispatch in that stage; ported_floor is the minimum number
    # of distinct records the port must keep dispatching.
    0: dict(first_unported_scroll=None,        ported_floor=92),    # shipped
    1: dict(first_unported_scroll=0x09A0,      ported_floor=88),
    2: dict(first_unported_scroll=0x00E0,      ported_floor=28),
    3: dict(first_unported_scroll=0x0160,      ported_floor=96),
    4: dict(first_unported_scroll=0x0000,      ported_floor=8),
    5: dict(first_unported_scroll=0x03B0,      ported_floor=47),
    6: dict(first_unported_scroll=0x0340,      ported_floor=95),
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
    return msgs


def main():
    rows = compute()
    _print_ledger(rows)
    if '--baseline' in sys.argv:
        print("\n# paste this into BASELINE when a wave advances coverage:")
        for r in rows:
            sc = r['first_unported_scroll']
            print("    %d: dict(first_unported_scroll=%s,      ported_floor=%d),"
                  % (r['stage'], 'None' if sc is None else ('0x%04X' % sc),
                     r['ported']))
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
