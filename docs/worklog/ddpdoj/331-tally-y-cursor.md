# W331: the transition screen's Y cursor, and why three entries needs a picker where two needs a mask

Status: suite **2364/2364**, green, no skips (2359 + 5). Sweep 0 missing. `dojcoverage.py` both OK
lines.

Docket **D30**, item 0 of the work order. `$25DEAE..$25DF4A` is ported, which is the second of the
transition screen's two cursors.

## THE SAME ROUTINE TWICE, AND THE DIFFERENCE IS ARITHMETIC

W329 ported `$25DD0C`, the X cursor over `xEntries: 2`. This is `$25DEAE`, the Y cursor over
`yEntries: 3`. They read the same input word through the same `($8,A4)` pointer and test the same
bit 2 / bit 3 pair. Everything that differs follows from **2 being a power of two and 3 not being
one**:

    X cursor   $25DD42  andi.b #$1,($E,A5)          one bit IS the range, so it cannot go wrong
    Y cursor   $25DEE6  subq.b #1,D7 / bge / else 2 } a COMPARE-and-wrap, in both directions,
               $25DF04  addq.b #1,D7 / cmpi.b #$2   } because three cannot be masked

And because it steps rather than masks, it can step ONTO an entry the other player is already
sitting on -- so each step is followed by `bsr $25DAEA` and retried while that answers yes:

    25def0  bsr $25DAEA / bcs $25DEE6      down: retry the step
    25df12  bsr $25DAEA / bcs $25DF04      up: the same

`$25DAEA` is `otherSideHolds25DAEA`, ported since W278. **That retry is the entire reason
`$25DA94`/`$25DEAE` exist as a pair** -- W326's docket entry guessed they were "probably a family of
two" and W330 found they were the up and down halves; this wave shows what they are halves OF.

## FOUR THINGS TRANSCRIBED RATHER THAN TIDIED, EACH WITH A TEST

**1. THE CUE FIRES ONLY IF THE CURSOR MOVED.** `$25DED6 move.w D7,D6` saves the value BEFORE any
step, and `$25DF18 cmp.b D6,D7 / beq $25DF24` skips `$28C6FA` when they agree. So a press whose
every candidate entry is held by the other player is SILENT. The X cursor has no such test, and
does not need one, because masking always moves. A port that cued unconditionally would click on a
press that did nothing.

**2. THE STORE IS AT `($1,A0)`, NOT `(A0)`.** `$25DD4C move.b ($E,A5),(A0)` is the X cursor and
`$25DF2C move.b ($F,A5),($1,A0)` is this one. **They share the descriptor's data pointer**, so an
offset slip here would overwrite the other cursor rather than merely land wrong. The test writes a
sentinel into `(A0)` and asserts it survives.

**3. THE PRE-PASS RUNS BEFORE ANY INPUT IS READ.** `$25DEAE..$25DEC8` reads `($F,A5)`, asks
`$25DAEA`, and steps DOWN while the answer is yes -- all before `$25DECA` reads the stick. So a
cursor that was left on an entry the other player has since taken moves off it on the next frame
whether or not the player touches anything. And `$25DED0` **re-reads `($F,A5)`** rather than using
the pre-pass's D7, which is why the pre-pass's effect is not visible in the same frame.

**4. CONFIRM TAILS INTO STATE 2 RATHER THAN RETURNING A FLAG.** `$25DF48 bra $25DB7C` is
`screenState2_25DB7C`, ported in W276. The port returns a boolean and lets the caller dispatch --
the same behaviour, and the difference is recorded here so it reads as deliberate rather than as a
misreading. Confirm itself is the `$4B0` timeout reaching zero OR a button inside the `$70` mask,
the same pair the X cursor uses, and `$80` is outside it.

## A GUARD THAT IS NOT IN THE ROM, AND WHY

Each retry loop carries `guard++ < 4`. The ROM has no such bound: it relies on at most one of the
three entries being held, so a step always finds a free one. The guard exists because
`otherSideHolds25DAEA` reads RAM the port does not fully control in a unit test, and an unbounded
`do/while` on a hostile fixture would hang the suite rather than fail it. Four is one more than the
entry count, so it cannot change the answer in any state the ROM can reach. **If it ever fires, the
fixture is wrong, not the port** -- and a hang would have been a worse way to learn that.

## What is left of D30

The three value-row emit sites at `$25DF72`, `$25DFBA` and `$25DFE8`, which are this routine's draw
path (`$25DF4C move.l #$5BC00000,D1 / $25DF52 tst.b ($7,A5)` -- the same per-side header shape
`$25DD72`/`$25DD80` has, so the W328 side-0 trap applies here too and must be read, not assumed).
Their literals are in the docket under D30. Bucket 26 holds ten records and the interactive draw
already uses four.

## Order for the next wave

1. **`$25DF4C` onward** -- this routine's draw and the three value rows. That is the last of D30 and
   the last of the owner's zeros.
2. Then stage 5's `$49`/`$4A`/`$4B` (spans `$A2`, `$B6`, `$B6`), then `$47` (`$E2`). `$1A` stays
   blocked until D2/D3 at `$268D8C` are measured.
3. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.
