# W302: the high-score screen, and W300's ALL marker confirmed by its renderer

Status: DONE. Suite 2117/2117 (2091 + 26), no skips. Sweep 0 missing on both.

W301's range scan named this family and this wave ports it: **nine of `$25B492`'s eleven
`bsr.w`s**, the routines that read back the nine arrays W299, W300 and W301 wrote.

## Starting state

W301 committed and pushed at `f857a30`, suite 2091/2091.

## EVERY `lea` HERE NAMES A BASE, WHICH IS THE COMPLEMENT OF W300'S RULE

W300 recorded that every `lea` in the insert family names an END, because every walk there is a
`-(An)` climb. The display family is the mirror: it walks with `(A6)+`, so every `lea` names a
BASE. `$803824` and `$803838` are the same two addresses in both families and they mean
opposite ends of the same array depending on which routine you are in. That is exactly the kind
of thing that reads as a typo three waves later, so both rules are now in the source and
asserted.

Nine routines, one shape:

    lea <column base>,A6 / lea (<glyph table>,PC),A0
    move.l #<packed XY>,D1          high word Y, low word X
    moveq #$4,D7                    FIVE rows
    move.w (A6)+,D0 / index A0 by it / jsr $23DFB4
    swap D1 / subi.w #$11C0,D1 / swap D1
    dbra D7

`$23DFB4` needed nothing new: `enqueueRegistersThroughStub(ram, rom, stub, d1, d2, d3, d4)` in
`spritequeue.js` takes those four registers in that order. Another family the port already had,
which is the check that keeps paying.

## THE ALL MARKER, SEEN FROM THE OTHER SIDE

W300 read `$287C4C tst.w $81309A / beq` forcing `(loop, stage)` to `(1, 5)` and argued from
arithmetic that 5 is one past the last zero-based stage index, so it cannot arise from play and
must be a deliberate marker. `$25B650` is the renderer agreeing:

    25b674  move.w (A1)+,D0             the LOOP
    25b676  beq $25B6BA                 loop 0 -> the stage digit alone
    25b678  cmpi.w #$1,D0 / bne $25B696
    25b67e  cmpi.w #$5,(A2) / bne $25B696
    25b684  addq.w #2,A2                consume the stage without drawing it
    25b68a  move.l #$3317C0,D2          ONE glyph, outside the digit table
    25b690  move.w #$218,D3             and its own attribute

An inference about a writer, confirmed by an independent reader. That is as close to
verification as this port gets without a board, and it is why the two waves were worth keeping
adjacent.

The `addq.w #2,A2` is the trap: skipping the draw but not the increment is the natural way to
write the arm, and it shears the stage column by one row from the ALL entry down -- which reads
as corrupt data rather than as control flow. Asserted.

## `dbeq` IS LEADING-ZERO SUPPRESSION, AND THE SCORE'S TEST IS THE PAIR

W299's `DBcc` lesson applied to a different condition. `$25B764 lsr.w #4,D0` sets Z when
nothing is left and `$25B766 dbeq D6` **exits on Z SET**, so the chain draws digits from the
least significant upward and stops as soon as the remainder is zero. The four-digit cap is
`moveq #$3,D6`. Because the test comes AFTER the draw, a chain of zero still draws one glyph --
a port that tested first renders nothing where the board renders a `0`.

The score is the same idea with a second term, and this is the one worth care:

    25b90e  lsr.l #4,D0
    25b910  bne $25B916          more of the long -> keep going
    25b912  tst.w (A2)
    25b914  beq $25B932          long empty AND overflow zero -> row done

**Both halves must be empty.** Reading it as "stop when the long runs out" loses the middle
digits of every score over 100,000,000, which is precisely where the overflow starts mattering.
`$00000123` with overflow 0 draws three glyphs; the same long with overflow 1 draws all eight
plus the overflow's own. Both asserted.

## THREE COLUMNS DRAW ROW 1 IN A DIFFERENT FONT

The initials, the score and the digit state each load one table before the loop and a second
one INSIDE it, so the top entry gets the bigger font and rows 2..5 the smaller:

    $25B7E6 / $25B85A    the initials, 29 longs each, stride $24
    $25B984 / $25B9AC    the digits, 10 longs each, stride $C, shared by two columns

The second `lea` sits between the last draw and the `dbra`, which is easy to hoist out while
tidying -- and hoisting it renders every row identically and loses the screen's hierarchy.

## THE INITIALS INDEX IS UNSCALED, AND THE TABLE HAS A HOLE

`$25B7C0 move.l (A6)+,D2 / move.l (A0,D2.w),D2` uses the stored value as a byte offset with no
scaling. That is the instruction that REQUIRES W301's observation that every factory character
is a multiple of four -- inferred from data there, mandated by code here.

It also sharpens the tag. `$287C7E` stamps `$FF`/`$FE`, and `$FF` is neither a multiple of four
nor inside a 116-byte table, so it would be a misaligned read past the end. **The tag cannot
reach this routine**, which is a constraint on whatever writes the name: the name must be
entered before the screen draws the entry. Ported as a throw with that reason in the message.

And both fonts are 29 longs with **`$00000000` at offset `$6C`** and a real glyph after it at
`$70`. A window sized to the 27 usable characters would make the last one unreachable, and a
port treating the hole as a glyph would emit a null sprite. Hence `$25B7E6 + $E8`, and a test
that the hole throws.

## TWO SMALL INDEX SPACES THAT ONLY WORK BECAUSE THE VALUES ARE EVEN

The ship column indexes `value * 4` over **8-byte** entries, which only tiles because the
stored values are 0, 2, 4 and 6. An odd value reads four bytes of one entry and four of the
next and draws a real-looking sprite with the wrong palette, so the port throws on it. The same
evenness is what makes W300's `addq.w #4,D0` work: a `+4` in the value is `+8` bytes, exactly
the gap between P1's icon base `$2881E2` and P2's `$2881EA`. Entries 0 and 1 carry palette 0
and entries 2 and 3 carry palette 1, so the rebase lands P2 on the second palette. The finding
and the mechanism turn out to be one fact.

The style column indexes `(value - 2) * 2` over three longs, so a style of 0 would index `-2`
and read the last two bytes of the routine's own `rts`. Also a throw.

## Changes

* `src/hiscorescreen.js`, new: the nine columns, `SCREEN`, `SCREEN_COLUMNS`,
  `drawHiscoreColumns`.
* `tools/export-tables.py`: six windows. Every extent is pinned on both sides -- the previous
  routine's `rts` and the next routine's first instruction -- because each PC-relative table
  sits immediately after the code that loads it. 398 windows now.
* `tests/w302hiscorescreen.test.js`, 26 assertions.

Two `bsr`s of the eleven are deliberately not in this wave: `$25B4D6` (the frame) and `$25B54C`
(the 1ST..5TH row labels). Neither reads any part of the high-score table, and `$25B54C` uses
`move.l ($18,PC,D6.w),D2`, a different indexing form that wants its own reading.

## A correction to my own search

I spent a search chasing `($C,A4)` because W300's worklog named the name entry as item 1. Its
absolute forms `$81B42C`/`$81B43C` have **zero references** in the build, and following
`$8130CC` instead led to `$28CB74` -- which looked like the entry screen and is already in the
port as BGM cue 10. The rule from W301 stands and is worth repeating because I failed to apply
my own: **scan the address range, not one pointer field.**

## Order for the next wave

1. **`$25B4D6` and `$25B54C`**, the screen's frame and row labels, which finishes `$25B492`.
   Then the driver head itself: `$25B47A move.l $812E60,D0 / jsr $24681A`, `$25B486 bne`, and
   the `ori #$1,SR` on exit -- it returns a carry, so it is a state routine with an answer.
2. `$28F6F6..$28F7D4`, the result screen reading eight of the nine columns, and the `$28F32x`
   head that is the SECOND caller of `$287BD2`/`$287C08`.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
5. The four other announcement-poster caller regions, then D11's remainder.
6. Stage 5 and both loops.
