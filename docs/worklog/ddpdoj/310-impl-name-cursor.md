# W310: the cursor, a 7x4 grid, and why its position table cannot be arithmetic

Status: DONE. Suite 2243/2243 (2226 + 17), no skips. Sweep 0 missing on both.

## Starting state

W309 committed and pushed at `b956b28`, suite 2226/2226.

## THREE TABLES, 28 CELLS, PINNED FROM BOTH SIDES

`$28FE7A` is table-driven twice: a pointer per cell, then an adjacency table indexed by the
direction bits. The three tables tile `$28FED0..$2901DF` with no gap:

    $28FED0 + $70    28 pointers, and they are consecutive `$28FF40 + i*$14`
    $28FF40 + $230   28 adjacency tables of TEN words
    $290170 + $70    28 packed Y/X longs, the cursor's screen position per cell

28 is pinned at both ends rather than counted: the pointer table's 29th longword reads
`$FFFF0007`, which is the first adjacency table's data, and `$2901E0` is `tst.w $813098` -- code.
A 29-cell reading breaks at one end and a 27-cell reading leaves END unreachable. That matches
W309's `cmpi.w #$1B,D0 / bcs` exactly: 27 characters at cells 0..26, END at cell 27.

## THE INDEX IS `direction bits - 1`, AND IMPOSSIBLE INPUTS ARE BLOCKED BY DATA

`$28FDB0` accumulates 1 up, 2 down, 4 left, 8 right into `($2A,A4)`, so the reachable values are
1..10 and `subq.w #1 / cmpi.w #$A / bcc` bounds them to indices 0..9. Left+right is 12 and falls
out of range; up+down is 3, which is in range and is **`-1` in all 28 cells**. Same for
up+down+left at index 6.

So the cartridge blocks impossible inputs with data, not with code. A port that special-cased
them would be adding a rule the ROM does not have, and the test asserts the `-1`s across the
whole grid instead.

## THE GRID IS 7x4, AND BOTH TABLES SAY SO INDEPENDENTLY

The adjacency graph: every cell not on the bottom row steps DOWN by exactly 7, every cell not on
the right edge steps RIGHT by 1, and the edges are `-1`. Asserted over all 28 cells rather than
at a few corners.

The position table agrees on the shape -- four distinct Y values, seven distinct X values, every
cell taking its row's Y and its column's X. Two tables written by different means agreeing is the
check; either alone could be a coincidence.

## BUT NEITHER AXIS IS EVENLY SPACED, AND THAT IS THE POINT

    X   $0A40 $1000 $1600 $1B80 $2200 $27C0 $2D80     gaps $5C0 $600 $580 $680 $5C0 $5C0
    Y   $3500 $2DC0 $2600 $1E80                       gaps $740 $7C0 $780

My first draft of the test assumed a uniform column step and failed on cell 2. The second assumed
a uniform row step and failed on cell 14. **That irregularity is the reason the table exists at
all** -- a port computing either axis arithmetically would misplace most of the grid, and would
look almost right while doing it, which is the worst kind of wrong for a thing nobody can
regression-test by eye.

Two wrong assumptions in one test is worth recording as a habit: **when a lookup table could have
been arithmetic and is not, that is a finding, not an inefficiency.** Assert the values.

## THE AUTO-REPEAT COUNTS AXES, NOT PRESSES

`($20,A4)` is the subtle one. The VERTICAL arms `move.b #$1` -- they SET it -- and the HORIZONTAL
arms `addq.b #1` -- they INCREMENT it. So it counts engaged AXES, and reaching 2 means a diagonal,
which `$28FE00 cmpi.b #$2 / beq $28FE7A` moves **immediately**, skipping the delay entirely. A
single axis instead arms `($21,A4) = 4` and moves on the fourth frame.

And if `($20)` is already 1 on entry, `$28FDB0` jumps straight to the delay branch and never reads
the nibble. So the direction is captured on the FIRST frame only and `($2A,A4)` holds it for the
repeat -- changing direction mid-delay does nothing, which the test drives.

The vertical pair is exclusive (`bra $28FDDE` after UP skips the DOWN test) while the horizontal
pair ORs in, so up+down resolves to UP alone.

`$28FE7A` clears `($20)` and `($21)` before anything else, which is what makes a fired repeat
one-shot rather than a free run. And `$28F566 tst.b ($20,A4) / beq` means a RELEASED direction
still ticks an armed repeat -- so letting go during the delay still produces the move, once.

## AND IT EXPLAINS W305'S TWO DIFFERING BLOCK WORDS

W305 found the two per-side setup blocks differ in exactly two of their twelve words and could
only call them "an X and a flag". The blocks fill `($6)`, `($8)`, `($14)`, `($16)`, `($18)` in
that order, so word 1 is `($8,A4)` and word 4 is `($18,A4)`:

    word 1   $0A40 vs $1000     the cursor's X
    word 4   0 vs 1             the starting GRID CELL

**P1 starts on cell 0 and P2 on cell 1**, and the "X" is just those two cells' X out of this very
position table -- `$290170[0]` is `$35000A40`, which is the block's first two words. One
difference expressed twice, and neither word was a flag. The test checks the block's words
against the position table rather than against a constant.

## Changes

* `src/hiscorename.js`: `cursorMove28FE7A`, `cursorHeld28FDB0`, `cursorFrame28F55E`, `CURSOR`.
* `tools/export-tables.py`: one window, `$28FED0 + $310`. 404 windows.
* `tests/w310namecursor.test.js`, 17 assertions.

`$28C6FA` on a move is SFX id `$1B`, already in `sound.js`.

**The name entry's logic is now complete.** What remains of the screen is presentation:
`$28F7F4..$28F8AA` (the panel), `$28FAF4`, and `$28F606`'s body.

## Order for the next wave

1. **`$28F606`**, which the finish button hands a non-empty name to. W306 ported the filter at
   `$28F674` and W309 the character writes, so this is the glue between them plus whatever
   `$28F664 add.w D1,D1 / move.l D0,(A0,D1.w)` is doing with a singly-doubled D1.
2. `$28F7F4..$28F8AA` and `$28FAF4`, the panel draws -- emitter chains of immediates, the shape
   W303 and W307 have done twice. The first ends exactly where W306's banned-name table begins.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
5. D11's remainder -- the anim tier, reached from four directions now.
6. Stage 5 and both loops.
