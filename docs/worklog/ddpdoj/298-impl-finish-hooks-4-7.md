# W298: `$280BCE`'s hooks 4..7, and three of the four were free

Status: DONE. Suite 2043/2043 (2039 + 4, and two assertions repointed), sweep 0 missing on
both, run before the commit.

`$280BCE` goes from eleven of twenty translated to **fifteen**.

## Starting state

W297 committed and pushed at `c1e2b13`, suite 2039/2039. Its handoff named the high-score
insert next; see the last section for why this wave went elsewhere.

## FOUR INDICES, TWO BODIES, AND THE TABLE SAID SO

    $280BCE[4] = $280D28   bsr $280CD4 / clr.b ($1,A0) / addq.b #5,($1a,A0) / rts
    $280BCE[5] = $280D34   bsr $280CD4 /                 addq.b #5,($1a,A0) / bra rts
    $280BCE[6] = $280D34   THE SAME ENTRY
    $280BCE[7] = $280D34   THE SAME ENTRY

So three of the four cost nothing, for the third time this session -- W286's kind 16 shared
kind 1's hook, W287's eight were one body over two parameters, and here 5, 6 and 7 are
literally the same table entry. **Read the entry, not just the routine.**

## AND `$280CD4` DIFFERS FROM THE PORTED PATH IN ONE EXPRESSION

    $280C84  jsr $2431F4 / lsr.w #1,D0                       the path W264 ported
    $280CD4  jsr $242B3C / bpl / neg.b D0 / ext.w D0 /       hooks 4..7
             lsr.w #1,D0  -> bra $280C8C

`$280CD4` also writes `move.w #$420,($1A,A0)` before the draw, which the shared fill already
does, and then **branches into the same tail at `$280C8C`**. So the whole difference is
`abs($242B3C) >> 1` against `$2431F4 >> 1`: a parameter, not a routine.

`abs()` is `bpl / neg.b` taken on the BYTE and then `ext.w`-ed, so a draw of `$80` becomes
`$80` rather than `$FF80`. Transcribed in that order.

## THE FIRST DRAFT DREW THE RNG TWICE

The obvious way to write "negate it if it is negative" is to call the draw, test it, and call
it again -- and `$242B3C` opens with `addq.b #1,$803917`, **so a second call advances the
shared counter and desynchronises every later draw in the frame.** Caught before it shipped,
and there is now a test that compares the counter's advance for a hook-4 allocation against a
kind-0 one and requires them equal.

That is a general trap with these RNGs and worth stating: **a stateful draw cannot be
inspected twice.** Any transform on it -- abs, mask, sign-extend -- has to work from one call's
result.

## The two differences, both observable

* the `+5` (`addq.b #5,($1a,A0)`) is what separates these four from kind 0 in the speed field;
* hook 4's `clr.b ($1,A0)` is the **only** instruction separating index 4 from 5, 6 and 7.
  Without it that byte holds the KIND, because the status word is `kind | $8000` and byte 1 is
  its low half. Asserted for all four.

## The throw's count moved again, and the test moved with it

W264 said three of twenty were translated, W287 eleven, W298 fifteen. Each time the number
changed the message changed, and the assertion changed with it -- two existing tests drove
kind `$10` precisely because it used to throw, so they now drive `$08` (index 2, `$280CF8`,
still unported) and the claims they make are unchanged.

## WHY NOT THE HIGH-SCORE INSERT

W297 named it next and this wave read further into it before choosing something else:

    287d96  lea $803838,A1 / lea $8038BA,A3 / A2 = A1 / A5 = A3 / moveq #$4,D0
    287da8  move.l -(A1),D1 / move.w -(A3),D2      <- PRE-decrement: $803838 is the END
    287dac  cmp.w D5,D2 / bhi / bcs / cmp.l D7,D1 / dbcc

**`-(A1)` means `$803838` is the array's END, not its base**, so the five entries live at
`$803824..$803837` and the walk runs from the last entry upward. Whether "last" is the highest
or the lowest score decides the direction of the whole compare, and `dbcc` continuing while
carry is CLEAR reads either way depending on that.

Getting it backwards produces a table that is populated, ordered, and wrong -- the failure is
completely silent. That is the W288 situation, so it wants the ordering established first
(a board capture, or a test that inserts a known sequence and asserts the WHOLE table) rather
than a transcription written from the instruction senses alone.

## Order for the next wave

1. **THE HIGH-SCORE INSERT**, starting with the ORDERING: which end of `$803824..$803837` holds
   the highest score. Everything else follows from that, and until it is settled the compare
   direction is a coin flip with a silent failure mode.
2. **`$280252`** -- still the stopping point of a long run (frame 6483), still blocked on
   measuring A0 at `$28029A` (W288). W298 did not touch it.
3. `$280BCE`'s remaining five: indices 2 (`$280CF8`), 3 (`$280D10`) and 17 (`$280DBA`), plus 1
   and 16 which belong to `allocBee27F92A` rather than this allocator.
4. Then stage 5 and the loops.
