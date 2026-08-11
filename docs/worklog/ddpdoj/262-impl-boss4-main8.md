# W262: Stage-4 boss MAIN8, and the third phase closes

Status: DONE. Suite 1799/1799 (1792 + 7), sweep 0 missing, both run before the commit.

`$29FA8A` (INIT) / `$29FAAE` (STEP), A0 entry 8, which A4 id6's INIT calls in. **Every
script A4 id6 arms is now translated**, so the Stage-4 boss has three phases running.

## Starting state

W261 committed at `5d00730`, suite 1792/1792.

## The third instance of one walker

MAIN4, MAIN7 and MAIN8 are the same instructions in the same order, differing only in
operands:

               waypoints   threshold   cursor bound        entries
    MAIN4      $29F972     $400        `andi.w #$F`        four
    MAIN7      $29FA7A     $200        `andi.w #$F`        four
    MAIN8      $29FB3A     $400        `cmpi.w #$1C/ble`   EIGHT

W251 shared MAIN4's body; this wave adds the third parameter, the cursor bound, because
MAIN8's is **not a mask**. `$29FB0C cmpi.w #$1C,$6(a4) / ble` with a `move.w #$0` reset
admits `$1C` and resets on anything past it.

## AND THE ROM GUARD CANNOT CATCH THIS ONE

`andi.w #$1F` would look equivalent to that compare and is not: it would let the cursor
reach `$20`. Normally an out-of-range table read is a loud `Unreached`, which is what has
caught this class of mistake all session. Not here. `$29FB3A + $20` is `$29FB5A`, the first
byte of an already-exported window, so a ninth read SUCCEEDS and quietly walks the boss to
coordinates taken from unrelated data.

The test asserts that explicitly -- `doesNotThrow` on the ninth entry -- so the reason the
compare has to be transcribed rather than approximated is written down where someone
tempted to simplify it will read it.

## Its waypoints sit between its siblings'

    $6600/$1A00  $6400/$2000  $6200/$1800  $6000/$1E00
    $5E00/$1800  $6000/$2000  $6200/$1A00  $6400/$2000

Long axis `$5E00..$6600`, where MAIN4 spans `$5A00..$6000` and MAIN7 `$6200..$6800`. So the
third phase circles in the middle of the band the first two swept through.

Its INIT also sets the walk speed to 4, which MAIN7's does NOT -- MAIN7 inherits and ramps
whatever it was given, down to a floor of 2, and MAIN8 puts it back to 4. The test drives
that by starting from 2.

## The Stage-4 boss now

    phase 1   F0/F3/F4, MAIN0/MAIN1, D0/D9/D10, E1/E2/E3/E5, objects 0..10
    phase 2   F1, MAIN2/MAIN3, F5 (seven arms), MAIN4, A3 3..8, A1 6..10,
              type $42's body and its $8130F4 in {0,1} half
    phase 3   A4 id6, MAIN7, MAIN8, A1 11, A1 13, A1 14,
              type $42's $8130F4 == 2 half, both $6C(A6) sides

Windows added across W246..W262: `$29F972`, `$29FA7A`, `$29FB3A`, `$2A3132`, `$2A31E8`,
`$2A33B2`, `$2A3556`, `$2A37CC`, `$2A394A`, `$2A4252`, `$23F7C6`.

## What is left

The boss's later A0 entries. `$29F498` entry 9 reads as `$102C0002`, which is not a code
address, so the MAIN table's own end is somewhere between 8 and 9 and needs pinning before
anything past MAIN8 is assumed to exist. That is the first question for the next wave, and
it may turn out that the A0 table stops at 8 and the boss is COMPLETE.

One arm remains a deliberate throw: `$2A3AFE`, a role-`$FF` child meeting `$8130F4 == 2`.
A1 9 is the only writer of that role and A4 id6 stops A1 9 before raising the flag, so no
translated path reaches it.

## Order for the next wave

1. Pin the A0 table's end. If it is eight entries, the Stage-4 boss is done and the next
   frontier is Stage 5.
2. Otherwise translate what entry 9 onward really is.
