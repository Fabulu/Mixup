# W308: the countdown, the loader's third head, and a defect W305 shipped

Status: DONE. Suite 2210/2210 (2190 + 19 new + 1 added to W305's file), no skips. Sweep 0
missing on both.

## Starting state

W307 committed and pushed at `fb17982`, suite 2190/2190.

## THE DEFECT: `($12,A4)` IS THE SETUP BIT NUMBER, AND W305 WROTE 1 FOR BOTH SIDES

W305 named `($12,A4)` `live` and had `nameArm28F428` write `1` unconditionally. It is the setup
**bit number**, and the image has two different immediates for it:

    28f41a  move.w #$1,($12,A4)      the P1 block
    28f472  move.w #$2,($12,A4)      the P2 block

Those are the same 1 and 2 that `$28F77A`/`$28F788` load into D0 for `bset D0,$81E0D9` -- which
W305 itself found and tested. What W305 could not see was the other half, one wave away:

    28f6ac  move.w ($12,A4),D1
    28f6b0  bclr D1,$81E0D9

immediately after `$28F6A8 bsr $28F7C8`, the name writer. So the sequence is: the arm records the
side's bit number, `$28F790` sets it, the name is written, `$28F6B0` clears it.

**With 1 in `($12,A4)` for a P2 name, `$28F6B0` clears P1's bit and P2's stays set forever** --
and the countdown below is suspended while any setup bit is set, so it would never tick again.
A real defect, not a naming slip. W305's test asserted the field only for side 0, which is
exactly why it passed. The new test drives both sides and asserts they differ.

Worth stating as a habit: **a field written by two sibling routines with different immediates is
not a constant.** W305 read one arm's store, saw `#$1`, and generalised.

## `tst.w $81E0D8` IS A BYTE TEST WEARING A WORD

`$28F506 tst.w $81E0D8 / bne $28F540` suspends the countdown. `$81E0D8` looks like its own flag
and is not one: the word spans `$81E0D8` and `$81E0D9`, and **`$81E0D8` has no writer anywhere in
the build.** Scanned it -- one reference, that read. `$81E0D9` has two, the `bset` and the `bclr`.

So the word test reduces exactly to "is any side still being set up". It is fragile in a way the
ROM gets away with: anything that ever wrote a non-zero `$81E0D8` would freeze the countdown
permanently, and nothing does. The reference counts are asserted rather than described, so a
future wave that adds a writer breaks a test instead of the game.

## THE SCREEN HAS TWO ENDINGS AND THEY SHARE ONE EXIT

`$28F532 beq $28F6D8` on the countdown reaching zero lands on the same two instructions
`$28F6C8` reaches when the work list empties: `move.b #$2,($2,A5)` and `rts`. So the name entry
ends either because nobody is left to name or because time ran out, and both go through one exit.

The countdown's arms, all four:

    counter 0        -> the caller takes the input path at $28F542
    any setup bit    -> suspended, no tick
    cursor 0         -> no tick
    counter == $30   -> tick AND load $28FAD2 through $246704, then rts
    otherwise        -> tick; zero ends the screen

The `$30` arm is a one-shot at a single value, so it fires exactly once per countdown, and the
`bne` at `$28F51A` makes it mutually exclusive with the ordinary tick -- driven at `$2F`, `$30`
and `$31` to prove the split.

`$28F536 cmpi.w #$30 / $28F53E moveq #$20,D2` is reachable only from `$31` and D2 is never read
again on either path. Transcribed as the no-op it is rather than dressed up.

## AND THE FRAME COUNTER HAS TWO UNSIGNED THRESHOLDS

    28f542  addq.w #1,($2,A4)        FIRST, before any test, so no band can stall it
    28f54a  cmpi.w #$30,D7 / bcc     below 48 frames: draw only, no input
    28f556  cmpi.w #$738,D7 / bcc    at or past 1848: the time-limit arm at $28F606

`bcc` is carry-clear, so both are unsigned `>=` and `$30` is the first input frame. `$738` is
1848 frames, a little over thirty seconds at 60Hz -- a name-entry time limit, and a separate
mechanism from the `($1E,A4)` countdown. Its body is counted, not this wave.

## `$246704` IS THE LOADER'S THIRD HEAD, ON A SECOND AXIS

    246704  movem.l D1-D7/A0-A4,-(A7) / move.w #$1,D6 / bra $246718

It jumps into `$246710`'s body four instructions in, and **D6 is what `$24672A move.w D6,($4,A1)`
writes into the player slot.** So the family has two independent axes: `($1E,node)` and
`($4,slot)`. `$24652A` is (0, 0), `$246710` is (1, 0), `$246704` is (1, 1).

W303 ported `$246710` and hardcoded 0 for `($4,slot)` because that is what `$246714` loads. That
was correct for `$246710` and left this sibling absent -- `$28F526 jsr $246704` is what needed
it. The test builds the same script through both and asserts the ONLY differing byte in main RAM
is the low half of `($4,slot)`.

There is a FOURTH pair at `$246610` (D6 = 1) and `$24661A` (D6 = 0), but they fall into a
different body at `$246622`. Named as `CHAIN_OTHER_BODY` and asserted to be a different body, so
the next reader neither has to find them nor assumes they are variants of these three.

## Changes

* `src/hiscorename.js`: the `($12,A4)` correction, `nameReleaseSetup28F6B0`,
  `nameCountdown28F4FC`, `nameFrameBands28F542`, `TIMEOUT`.
* `src/stageend.js`: `chainLoader246704`, `CHAIN_LOADERS` gains `field4`, `CHAIN_OTHER_BODY`.
* `tools/export-tables.py`: one window, `$28FAD2 + $22`, ending exactly at `$28FAF4`. 403 windows.
* `tests/w308namecountdown.test.js`, 19 assertions; one added to `w305hiscorename.test.js` and
  one updated for the renamed field.

## Order for the next wave

1. **`$28F55E..$28F605`, the input decode.** `moveq #$F,D0 / and.w ($36,A4),D0` is the direction
   nibble of `readInput23D186`'s word, `($20)`/`($21)` are an auto-repeat armed flag and delay,
   and `btst #$F,D0` at `$28F58C` is a button. It calls `$28FDB0` (a direction held), `$28FE7A`
   (the repeat fired) and `$28FAF4`; `$28F664 add.w D1,D1 / move.l D0,(A0,D1.w)` is the
   per-character commit and `($16,A4)` the count W306's filter gates on.
2. `$28F7F4..$28F8AA`, the panel draw -- an emitter chain of immediates ending exactly where
   W306's banned-name table begins. Counted twice now.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
5. D11's remainder -- the anim tier, now reached from FOUR directions (`$24652A`, `$246710`,
   `$246704`, `$246410`) and overdue for a proper wave rather than a fifth note.
6. Stage 5 and both loops.
