# W248: Stage-4 boss A1 8, the two-barrel fan

Status: DONE. Suite 1695/1695 (1688 + 7), run before the commit.

`$2A2F1E` (INIT) / `$2A2F72` (STEP), A1 table entry 8, which F5's `$3(A4)` chain starts
once the pod pair retires. The first of F5's five A1 descendants.

## Starting state

W247 committed at `533415d`, suite 1688/1688.

## What it is

Two barrels, one per pod, each a burst counter layered over a cadence counter:

    barrel 1   $2(a4) outer / $4(a4) inner / $6(a4) burst   from $82(a6), angle $40
    barrel 2   $8(a4) outer / $A(a4) inner / $C(a4) burst   from $A2(a6), angle $C0

The outer counter is consulted ONLY while the burst counter is zero (`tst.b $6(a4)` /
`bne`), so once a burst is armed it empties at the inner cadence and bypasses the outer
one entirely. Every counter/reload pair is `subq.b` + `bcc` reading its reload from the
byte immediately above it, which is the old-zero borrow this boss uses everywhere.

`$2A3048` is the fan: four shots at base +$4, +$C, -$4, -$C, all byte-wide, in that
order, which is the order they take pool slots and therefore observable.

## The eighteenth and nineteenth positive availability checks

Neither helper was new:

- `$2817B8` is already the port's fan generator, used by boss3 and by boss4's own
  E1/E2 families.
- `$24226E` is `aim256FromCaller` in `aim.js`, whose header names the address. Its
  reference census already counted 48 sites.

So A1 8 is transcription. No exporter change, no new window.

## THREE DEAD REGISTER LOADS, and reproducing them is the work

Both barrels accumulate an angle, read it into D1, and then overwrite D1 with a
constant on the very next instruction:

    2a2f9c: move.b $13(a4),D0 / add.b D0,$12(a4)
    2a2fa4: move.b $12(a4),D1          <- dead
    2a2fa8: move.b #$40,D1             <- the angle that is actually used

and the same shape at `$2A3018`/`$2A301C` with `$14(a4)` and `$C0`. A third: both load
`$16(a4)`/`$17(a4)` into D7, which `$281576` overwrites out of the shot template.

This reads like a tuning feature someone disabled by adding an override, and the port
has to keep BOTH halves: the accumulators run and are stored, which is observable, and
the angles stay fixed, which is also observable. A port that dropped the accumulate
would diverge in RAM; one that used it would aim this attack somewhere the board never
aims it. The test asserts the fan is `$44/$4C/$3C/$34` explicitly for that reason -- an
accumulator-based base would give `$18` and every angle would be wrong.

Barrel 2 also calls `$24226E` and discards the answer one instruction later. Kept as a
call, because target selection is the one part of it that can fail.

## What the test found that I had wrong

I predicted barrel 1 alone would fire on the fifth frame. It fires EIGHT shots, because
`$2(a4)` and `$8(a4)` both arrive at `$04` from the INIT literals and both inner
counters arrive at zero, so the two barrels open on the same frame and only then drift
apart (reloads `$D` and `$10`). That synchronisation is the attack's opening volley, so
it got its own assertion driven purely from the literals with nothing forced.

Also worth pinning: the spawn position is the pod's pair plus the barrel's own muzzle
bias in D3 (`$F9400200` and `$F93FFE00`), which differ by one count. The two barrels
being one count apart is exactly the kind of thing a swap would hide, so both are
asserted by value.

## What is still missing

    A1 6  $2A2D70 / $2A2D8E        A1 9  $2A307A / $2A30A8
    A1 7  $2A2E8C / $2A2E9E        A1 10 $2A320E / $2A323E
                                   MAIN7 (A0 entry 7)

## Order for the next wave

1. A1 9 `$2A307A`, the repeating shot arm 6 drives, including the `$6(A0)` side
   selector F5 writes into its slot -- the one parameter F5 passes to a child.
2. A1 6 and A1 7, which arm 4 starts and stops as a pair.
3. A1 10 and MAIN7, at which point the second phase runs end to end.
