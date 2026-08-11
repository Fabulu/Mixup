# W287: eight of `$280BCE`'s finish hooks, and they are one body

Status: DONE. Suite 1993/1993 (1988 + 5), sweep 0 missing on both, run before the commit.

`$280BCE` had three of twenty translated and was what stopped a long run at frame 6482. It
now has eleven, the run reaches 6483, and the eight that landed cost one table.

## Starting state

W286 committed and pushed at `0013d1d`, suite 1988/1988.

## THE FAMILY, READ DOWN ITS COLUMNS

    idx  site      lea        ($24,A0) <-   via
     8   $280D76   $280C4E    $8103E6       $280D8C
     9   $280D7C   $280C1E    $8103E6       $280D8C
    10   $280D82   $280C2E    $8103E6       $280D8C
    11   $280D88   $280C3E    $8103E6       $280D8C   (falls through)
    12   $280D3E   $280C4E    $810448       $280D94
    13   $280D4C   $280C1E    $810448       $280D94
    14   $280D5A   $280C2E    $810448       $280D94
    15   $280D68   $280C3E    $810448       $280D94

Three instructions each -- `lea` a hook block, `move.l` a player record into `($24,A0)`,
branch to the shared tail. **The hook BLOCK cycles `$C4E, $C1E, $C2E, $C3E` and the PLAYER is
P1 for 8..11 and P2 for 12..15.** So eight dispatch entries are one body over two parameters,
and `$8103E6`/`$810448` are `RAM.player1`/`player2`.

The shared tail, `$280D94..$280DB8`:

    andi.w #$F,D7 / move.b D7,($1a,A0)     the low nibble of D7 is the anim index
    clr.b ($1e,A0)
    move.l D0,D7 / jsr $242EC2             the RNG, ported in src/rng.js
    andi.l #$E,D0 / move.w (A3,D0.w),D0    one of the block's EIGHT words
    add.l D0,($a,A0)                       ADDED to the sprite pointer
    move.l D7,D0 / rts                     D0 restored, so the caller's value survives

`andi.l #$E` masks to an even 0..$E, which is exactly eight words -- **the index space needs
no bound of its own, because the mask IS the bound.** That is why the new window can be
exactly eight words and the port needs no range check.

`add.l D0,($a,A0)` is the same "the hook offsets the sprite" mechanism the three W264 entries
already use, so `hookOffsets` needed no change; the only genuinely new field is `($24,A0)`,
and it is the only reason these are eight entries rather than four.

## ONE WINDOW, AND IT ABUTS W264's

`$280C1E` was the one hook block outside every window. `$280C1E + $10` is `$280C2E`, where
W264's `$280C2E + $30` starts and covers the other three -- so eight words closes the set
seam-free. The test asserts the adjacency, that the last word of the new block resolves, and
that nothing below it does.

Each block's first word is 0, the identity offset, which is what makes "the hook offsets the
sprite" a no-op on phase 0 rather than a displacement. Asserted for all four.

## THE RUN GOES FURTHER, AND D16 CONFIRMS ITSELF ON THE WAY

Before: the census stopped at **frame 6482, `Unreached $280BCE`** with D0 = `$20` -- index 8,
the first of this family. After: it reaches **frame 6483** and stops at `$280252`, a different
routine one frame further on.

And in that extra frame the census's own conclusion fires:

    $81B6E0 icon count    final 1   MAX 1
    $81B6E4 gate          final 1   MAX 1
    -> THE ICON ROW HAD SOMETHING TO SHOW.

Which is D16 verified positively from a live run rather than from a forced probe: an item
dropped, was collected, and the words the hyper display reads went non-zero. W281 measured
that state drawing one icon per unit.

## The throw that remains is honest about itself

Nine of twenty are still unported, and the message now says ELEVEN are translated and names
the family's index range, because that message is the diagnosis a future run gets. Asserted,
so it cannot drift back to "three".

## Order for the next wave

1. **`$280252`** -- the new stopping point, one frame past the old one. Same neighbourhood,
   and the same question worth asking first: **read the table entry before writing the
   routine.** W286 and W275 both found routines that needed no code, and this wave found
   eight that needed one table between them.
2. Then `$280BCE`'s remaining nine (2, 3, 4, 5, 6, 7, 17 and the two already-done 18/19 aside),
   noting that 5, 6 and 7 all point at `$280D34` -- three more entries, one body, the same
   trick as this wave.
3. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`.
4. **The publish is still the cheapest move for the DOCKET** and still wants the owner's
   go-ahead, being an outward-facing deploy.
