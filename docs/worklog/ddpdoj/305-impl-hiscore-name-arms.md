# W305: the name-entry arms, and `$8130CC` closes as a work list

Status: DONE. Suite 2163/2163 (2148 + 15), no skips. Sweep 0 missing on both.

W304 ported the two routines that USE the tag. This is the screen that calls one of them, and
it closes the last open thread in the high-score subsystem.

## Starting state

W304 committed and pushed at `e662f7e`, suite 2148/2148.

## `$8130CC` IS A WORK LIST, ONE BIT PER SIDE THAT OWES A NAME

Five waves each found one end of this and none of them found the middle:

    $26007C / $260092   bonus line 2 sets bit 0 or bit 1 -- "this side MADE the table"   W300
    $28F32C / $28F348   a second caller of $287BD2/$287C08 sets the same bits            W301
    $28F350             move.b $8130CC,($5,A5) -- the screen COPIES them into its object
    $28F358             tst.b ($5,A5) / bne -> jsr $28CB74, the entry BGM cue            W301
    $28F6C8             bclr <side>,($5,A5) when that side has no tagged row left        W305

So it is a work list. `$28F6C8` clears a side's bit when the lookup cannot find its tag, and
when the byte reaches zero it writes `move.b #$2,($2,A5)` -- the screen's own state -- and the
name entry is over. `$28F6D4 bne $28F6C6` lands on a bare `rts`, so a side dropping out while
the other still owes a name changes nothing else: only the last one to go ends the screen.

The bit numbering agrees at both ends, which is the part worth an assertion rather than a
comment: `ori.b #$1`/`#$2` sets bits 0 and 1, and `bclr D0,($5,A5)` takes D0 straight from
`($2C,A4)`, the side. The test checks the two against each other.

## AND ONE SCREEN LATER THE BITS ARE NUMBERED DIFFERENTLY

`$28F790 bset D0,$81E0D9` with `$28F77A moveq #$1,D0` and `$28F788 moveq #$2,D0`, so
**that** flag uses bits 1 and 2. Two flag bytes in the same routine family, one numbered from 0
and one from 1, and the only thing separating them is which register the side goes through.
Pattern-matching the first onto the second is the obvious mistake and both are now pinned.

## THE ARMS ARE TWINS AND THE TAG IS THE DIFFERENCE

`$28F428` (P1) and `$28F482` (P2) are byte-identical apart from the `bsr` displacement -- the
third two-head-one-body pair in this subsystem after `$287BD2`/`$287C08` and
`$28F6E2`/`$28F6EA`. Asserted from the image word by word, because "identical twins" stops
being true the moment one of them grows a special case, and both `bsr` displacements are
resolved and checked against the two lookup heads.

## THE LOOKUP'S CARRY IS IMPLICIT, AND THAT IS AN ADDITION TO W304

`$28F430 bcc $28F43A` reads a carry `$28F6F4` never sets explicitly:

    the MISS path   moveq #$0,D0 / subq.w #1,D0     0 - 1 BORROWS -> carry SET
    the HIT path    add.w D0,D0 / lea / adda.w      the doubling does not carry, and neither
                                                    `lea` nor `adda` touches the flags

So carry SET means not found, and the hit path's carry-clear is a **side effect of the last
`add.w`** rather than a decision. It is correct for a five-entry table because the largest index
is 4 and `4 * 4` cannot carry out of a word; in a bigger table the same code would be wrong.
W304's `found` boolean already had the behaviour right, so this is an addition rather than a
correction -- but the mechanism was not written down and it is the kind that reads as arbitrary.

That is the FOURTH routine this session whose whole answer is the carry, after `$287D96` (a
borrow), `$287C3E` (an explicit `ori`/`andi`) and `$25B412` (`ori` against `move.w D0,D0`). The
habit W303 named holds: in this cartridge, check how a routine leaves the carry before deciding
it returns nothing.

## `$28F75A`, AND A RECORD LAYOUT READ RATHER THAN GUESSED

Every offset in `NAME_REC` is a store this wave transcribed, and the test asserts they are all
distinct and all inside the record -- a guard against the struct drifting into invention later.

Two `swap` pairs, both with the same shape: the HIGH half lands in the SECOND field. `($A)`
takes D2's low (digits) and `($10)` its high (overflow); `($3A)` takes D3's low (ship) and
`($3C)` its high (style). The two fields of a pair sit far apart in the record, so one round the
wrong way is invisible until something reads it.

`($30,A4)` receives the matched entry's ADDRESS -- so there IS a stored pointer to the row here,
unlike `($C,A4)`, which W304 proved has no readers. The difference is that this one is written
by the screen for its own use on later frames, while the insert's was internal to one routine.

The twelve-word setup block is the per-side parameter set: `$28F97C` for P1 and `$28F994` for
P2, adjacent, and they differ in exactly **two** of their twelve words -- an X (`$0A40` vs
`$1000`) and a flag (0 vs 1). The destination offsets are neither contiguous nor ascending past
`($8)`, so the copy order is the data's; sorting the fields would pair the wrong word with the
wrong one. Asserted as a list.

## Changes

* `src/hiscorename.js`, new: `nameArm28F428`, `nameCache28F75A`, `nameGiveUp28F6C8`,
  `NAME_REC`, `NAME_OBJ`, `NAME_SCREEN`, `NAME_ARMS`.
* `tools/export-tables.py`: one window, `$28F97C + $30`, covering both blocks. 401 windows.
* `tests/w305hiscorename.test.js`, 15 assertions.

`$23D186` at `$28F408` is `readInput23D186`, already ported in W277/W278 -- so the name entry's
input read needs nothing new either.

## Order for the next wave

1. **`$28F59E..$28F6AC`**, the rest of the name entry: the cursor, the character grid, and the
   duplicate-name check at `$28F67A..$28F6A6` that compares three longs of `(A1)` against three
   of `(A0)` across the table and branches to `$28F59E` on a match. What fills A0's three longs
   is the character grid, and `($2E,A4)` is the cursor the arms clear.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
3. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder.
5. Stage 5 and both loops.
