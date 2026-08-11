# W309: the input decode, and the alphabet stops being an inference

Status: DONE. Suite 2226/2226 (2210 + 16), no skips. Sweep 0 missing on both.

## Starting state

W308 committed and pushed at `4aeeb27`, suite 2210/2210.

## THE CHARACTER VALUE IS MADE HERE, WHICH ENDS FOUR WAVES OF INFERRING IT

    28f652  move.w ($16,A4),D1       the count BEFORE the increment
    28f656  addq.w #1,($16,A4)
    28f65a  add.w D0,D0
    28f65c  add.w D0,D0              D0 = the cursor's grid position, times four
    28f65e  movea.l ($30,A4),A0
    28f662  add.w D1,D1 / add.w D1,D1
    28f666  move.l D0,(A0,D1.w)

W301 inferred index-times-four from the factory table. W302 found the instruction that requires
it. W306 decoded seventeen banned names as words, which fixed index 0 as `A`. **This is the
routine that creates the values**, and it is the first causal evidence rather than the fourth
consistent one. The grid position IS the index and `add.w D0,D0` twice IS the scale.

The slot is the count *before* the increment, so the first character goes to slot 0. Using the
post-increment count would leave slot 0 holding whatever the insert's shift dragged down.

## THE GRID IS 27 CELLS AND THEN "END", AND THAT EXPLAINS W306'S LAST ENTRY

`$28F5DC cmpi.w #$1B,D0 / bcs $28F652` -- unsigned, so cells 0..26 are characters and `$1B` or
above is END. Choosing END writes character `$70` (index 28) into **every** remaining slot, not
just the next one:

    28f5e8  moveq #$70,D0
    28f5ea  move.w ($16,A4),D1 / add.w D1,D1 x2 / move.l D0,(A0,D1.w)
    28f5f6  addq.w #1,($16,A4) / cmpi.w #$3,($16,A4) / bne $28F5EA

**So W306's seventeenth banned entry, `$70 $70 $70`, is the name you get by pressing END straight
away.** It is not an arbitrary triple of the last glyph; it is the all-END name, banned for the
same reason `AAA` is. The test asserts it byte for byte against the ROM table and then watches the
filter replace it.

And the counts finally close, exactly:

    0..25    A..Z
    26       a twenty-seventh selectable character, not a letter
    27       the $00000000 hole in both fonts -- NOTHING can reach it
    28       END's glyph

That is the 29-entry font W302 had to size a window around, and W306's hole at index 27, both
accounted for. A test that expected cell 26 to be a letter failed, which is how the
twenty-seventh character got noticed at all.

## `DDP` IS THE DEFAULT NAME, NOT ONLY THE PUNISHMENT

W306 read `$28F59E` as the banned-name replacement. It is, and it has a SECOND caller:

    28f592  jsr $28C6E0              the finish button's cue
    28f598  tst.w ($16,A4)
    28f59c  bne $28F606              something entered -> the filter and commit
    28f59e  ...                      NOTHING entered -> falls through into the DDP write

So pressing finish with an empty name gives `DDP` directly, without consulting the banned list.
W306's reading was right and incomplete: **`DDP` is the default**, and being caught by the filter
is the other way to get it. Both callers are asserted from the image -- one an 8-bit `bne`
displacement, one a `beq.w` -- so the shared-target claim is not just a reading.

Backspace lands in the same territory. `$28F64E moveq #$0,D0` writes character 0 -- `A` -- into
the slot it frees, so backspacing all three leaves `AAA`, which is banned entry 0. **Both "the
player did not really enter a name" outcomes are on that list, one per route**: END gives index
28 three times, typing-then-deleting gives three zeroes.

## THE ARMS ARE ORDERED AND THE ORDER MATTERS

    btst #$F      FINISH      tested first, and it returns
    $20           BACKSPACE
    $50           SELECT      bits 4 and 6, either one on its own

A port that tested select first would commit a character on the frame the player finished; one
that tested it before backspace would add a character while deleting. Both orderings are asserted
with combined presses rather than left to the reading.

Backspace with nothing entered is a bare `rts` (`$28F642 beq $28F6C6`) and must write nothing --
slot -1 is the previous entry in the table.

`$28C6E0` on every press is SFX id `$1A`, already in `sound.js`. Counted so a reader can see the
screen is not silent, but it needed nothing new.

## Changes

* `src/hiscorename.js`: `nameButtons28F588` and `INPUT`.
* `tests/w309nameinput.test.js`, 16 assertions.

No new ROM window: everything here is RAM and immediates.

**The name entry is now complete apart from `$28F606`'s body** (which the finish button hands a
non-empty name to, and which contains W306's filter gate and the commit) and the panel draw
`$28F7F4..$28F8AA`.

## Order for the next wave

1. **`$28F606..$28F664`**, the last of the name entry: what the finish button reaches with a
   non-empty name. W306 ported the filter (`$28F674`) and W309 the character writes, so what is
   left between them is the cursor movement -- `$28F55E`'s direction nibble, the auto-repeat pair
   `($20)`/`($21)`, and the routines `$28FDB0` (a direction held) and `$28FE7A` (the repeat
   fired), plus `$28FAF4`.
2. `$28F7F4..$28F8AA`, the panel draw -- an emitter chain of immediates ending exactly where
   W306's banned-name table begins. Counted three times now.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
5. D11's remainder -- the anim tier, reached from four directions now.
6. Stage 5 and both loops.
