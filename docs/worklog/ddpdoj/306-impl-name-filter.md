# W306: the banned-name filter, and the alphabet three waves had inferred

Status: DONE. Suite 2176/2176 (2163 + 13), no skips. Sweep 0 missing on both.

W305 pointed at `$28F67A..$28F6A6` as "a duplicate-name check". It is not a duplicate check.

## Starting state

W305 committed and pushed at `7e7ce57`, suite 2163/2163.

## IT IS A PROFANITY FILTER, AND ITS TABLE DECODES AS WORDS

`$28F674 lea ($28F8AC,PC),A1` and then a loop with no counter, comparing three longs of the
table against three longs of the player's row and stepping `adda.w #$C` on a mismatch. Seventeen
entries, terminated by `$FFFFFFFF`. Divide each stored value by four and read 0 as `A`:

    AAA  AHO  ASS  AUM  DIE  ETA  FUC  FUK  HIV  IRA  KKK  OSI  PEE  PIS  PLO  SEX  <28><28><28>

Fourteen are recognisable English or Japanese. `SEX` is 18, 4, 23 and `KKK` is 10, 10, 10, and
either one on its own fixes the mapping.

**This verifies three waves of inference with a natural-language check.** W301 inferred from the
factory table that a stored character is an index times four. W302 found the instruction that
requires it -- `move.l (A0,D2.w),D2`, unscaled, over a table of longs. W304 showed the tag
cannot collide with a character. None of them could say what index 0 IS, and none of them had
any independent evidence for the scale beyond "every value happens to be a multiple of four".
Seventeen entries that did not have to agree, all of which do, and which spell words when read
one particular way, is about as good as this port gets without a board.

It also closes W302's font hole. The seventeenth entry is index 28 three times, and 28 is the
glyph immediately after the `$00000000` at index 27. So the alphabet is A..Z at 0..25 plus three
more slots of which 27 is unused -- exactly the 29-entry-with-a-hole shape W302 had to size a
window around, and this entry is the one a 27-character window would have made unrenderable.

## AND THE REJECTION IS A SUBSTITUTION

    28f59e  movea.l ($30,A4),A0 / movea.l A0,A1
    28f5a4  move.l #$C,(A1)+           index 3
    28f5aa  move.l #$C,(A1)+           index 3
    28f5b0  move.l #$3C,(A1)+          index 15
    28f5b6  move.w #$3,($16,A4)        mark the name complete
    28f5bc  bra $28F6A8                and COMMIT it

3, 3, 15 is **`DDP`**. A banned name is silently replaced with the game's own initials and
entered anyway; the player is never asked again. That is a third confirmation of the alphabet,
this time from two constants in the instruction stream rather than from a table.

## THE SENTINEL IS FOUR BYTES, WHICH IS WHAT SIZES THE WINDOW

`$28F686 beq` fires on the first long, so `$28F978` is a four-byte terminator and not a
twelve-byte entry -- and `$28F97C`, the P1 setup block W305 windowed last wave, begins
immediately after it. Sizing this table to whole entries would overlap that block and a reader
would find `$35000A40` where it expected a name. The window is `$28F8AC + $D0`: seventeen
entries (`$CC`) plus the sentinel long, abutting `$28F97C` seam-free.

Worth noting the loop has **no counter at all** -- `bra $28F67A`, no `dbra` anywhere -- so the
sentinel is the only thing bounding it. Past it lie the setup blocks and then code. The port
throws rather than walking there.

## THE FILTER WORKS ON THE ROW ITSELF

`movea.l ($30,A4),A0` sits INSIDE the loop and reloads every iteration. W305 found `($30)` is
the matched row's address, so the filter reads the high-score table directly and the replacement
writes straight back into it. There is no separate entry buffer to keep in step, which is also
why `$28F7C8`'s three-long copy has a source at all: something upstream fills a buffer, but the
filter and the replacement do not use it.

## Changes

* `src/hiscorename.js`: `nameFilter28F674`, `bannedNames`, `charName`, `NAME_ALPHA`.
* `tools/export-tables.py`: one window, `$28F8AC + $D0`. 402 windows.
* `tests/w306namefilter.test.js`, 13 assertions -- the decode, both scan ends, the three-way
  compare, the count gate, and that `SEA` is allowed while `SEX` is not.

## Order for the next wave

1. **`$28F4A6..$28F664`**, the character grid: the cursor at `($2E,A4)`, the count at
   `($16,A4)`, and `$28F664 add.w D1,D1 / move.l D0,(A0,D1.w)` which is the per-character
   commit. That is the last unported part of the name entry, and `$81E0D6` (tested at
   `$28F442`/`$28F49C` by both arms) is the gate above it.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
3. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder.
5. Stage 5 and both loops.
