# W332: the transition screen's value rows, and the ROM's own two readers disagree about a sentinel

Status: suite **2369/2369**, green, no skips (2364 + 5). Sweep 0 missing. `dojcoverage.py` both OK
lines.

Docket **D30**, the last of the owner's "0's, some pictures of medals". `$25DF4C..$25DFEC` and
`$25DAC2` are ported, which completes the transition screen's Y half.

## THE DRAW, AND THE W328 TRAP IN A NEW SHAPE

    25df4c  move.l #$5BC00000,D1                    side 0's row position
    25df52  tst.b ($7,A5) / beq $25DF60             ... and side 0 KEEPS it
    25df5a  move.l #$5BC02600,D1                    side 1's
    25df60  move.l D1,D7                            saved, for the two rows below
    25df62  D2 = $334224 ; D3 = $648 ; D4 = ($14,A4) ; jsr $24018C
    25df78  D1 = D7 + ($25DFF0 + ($F,A5) * 2)       THIS player's highlight row
    25df8c  A2 = $25DE8E / $25DE9E ; $80390A asr 1, and 3 -- the SAME four-phase blink as the X draw
    25dfb0  D3 = $618 ; jsr $24018C
    25dfc0  jsr $25DAC2 / tst.w D0 / bmi $25DFEE    the OTHER player's marker, or skip
    25dfca  D1 = D7 + ($25DFF0 + D0 * 2) ; D2 = $334424 ; jsr $24018C

**The per-side position trap is here too, and its side-1 constant is DIFFERENT.** `$25DF5A` holds
`$5BC02600`, where the X draw's `$25DD80` holds `$5BC02C00`. A scan finds the side-1 constant; side
0's sits two instructions above the branch. W328 shipped the wrong one for side 0 by exactly this
route, so both constants and the `tst.b` between them are asserted against the image.

**THREE row offsets, where the X draw has two.** `$25DFF0` is `0000 0600 0C00`: the same `$600` step
with one more row, because the Y cursor has three entries and the X cursor two. The blink
descriptors are **reused outright** from the X highlight (`$25DE8E`/`$25DE9E`), which is worth
knowing before someone transcribes a second copy of them.

## THE FINDING: `$25DAEA` AND `$25DAC2` DISAGREE ABOUT THE `$FF` SENTINEL

Both read the same byte -- the other side's saved selection at `($1,$813008)` or `($1,$813018)` --
and both pick the same record for the same side. They do NOT agree on what `$FF` means:

    $25DAEA  (otherSideHolds25DAEA, W278)   checks `cmpi.b #$FF` and answers "nobody holds anything"
    $25DAC2  (this wave)                     returns the byte RAW; only attract-off gets $FFFF

And the caller cannot rescue it. `$25DFC6 bmi` catches a negative WORD, but `$25DAD6 move.b
($1,A0),D0` writes only D0's LOW byte -- and the caller had just masked D0 to 0..3 for the blink
phase at `$25DFA4`, so bits 8..15 are zero and `tst.w D0` sees `$00FF`, which is **positive**. So a
`$FF` byte with attract LIVE reaches `$25DFD6 add.w (A2),D1` with an index of `$1FE`, far past a
three-word table, and adds whatever is there to a sprite position.

**The board relies on that combination not happening**: attract live means a game is running, and a
running game has a real 0..2 selection. The port refuses rather than inventing a row --
`yRow(entry, site)` throws by address with the whole explanation, the same treatment W326 gave
`$27460A`'s ramp where index `$18` is an instruction.

That also shaped the test fixture, which is the part worth copying. `yWorld` defaults attract OFF,
because a fixture that set attract live AND left the `$FF` sentinel in place would be exercising a
state the board cannot reach. Tests that need the hold behaviour pass `attract: 1` **together with a
real entry**. One test asserts the throw, by `romAddress`.

## THE OTHER PLAYER'S MARKER IS WHY THE THIRD ROW EXISTS

Two records normally, three when the other side has a selection: their marker (`$334424`, static)
lands on THEIR row while this player's blinking highlight sits on their own. That is what lets one
screen show both choices, and the attract gate is what stops a phantom marker on the attract loop.

## What this closes and what it does not

D30's tally half is **done**: gate cascade (W328), per-side header and label pairs (W328), X cursor
(W329), blinking highlight (W330), Y cursor (W331), and the value rows here. Twenty-two tests, every
constant pinned against the ROM image.

Not closed: the screen's `($C,A5)` phase machine still only runs phase 1, so the note at `$25DC2C`
stands for phases 0 and 2 and the arm between `$25DC2C` and `$25DD80`. And nothing here has been
seen on a screen yet -- **this needs a publish and the owner's eyes**, which is D19's whole point.

## Order for the next wave

1. **PUBLISH.** D27's cadence, and this is the case for it: five waves have landed on one
   user-visible defect and none of them is deployed. `export-web.mjs` then `publish.mjs`.
2. Then stage 5's `$49`/`$4A`/`$4B` (spans `$A2`, `$B6`, `$B6`), then `$47` (`$E2`). `$1A` stays
   blocked until D2/D3 at `$268D8C` are measured.
3. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.
