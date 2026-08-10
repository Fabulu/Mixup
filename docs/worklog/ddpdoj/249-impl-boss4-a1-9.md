# W249: Stage-4 boss A1 9, the formation spawner

Status: DONE. Suite 1702/1702 (1695 + 7), run before the commit.

`$2A307A` (INIT) / `$2A30A8` (STEP), A1 table entry 9, which F5's arm 6 starts once per
attack cycle. It is a SPAWNER, not an emitter: it waits eight frames, draws one of four
formations, and enqueues a ring of type `$42` children through `$263684`.

## Starting state

W248 committed at `36f3fe9`, suite 1695/1695.

## The four formations, and the two that differ only in direction

`$2A3132` is EIGHT selector longwords resolving to FOUR lists, each appearing twice, so
`andi.w #$7` gives every formation a 2-in-8 chance. Each list is self-describing: a
shared direction byte, its own count, then that many angles.

    $2A3152   $0E   9   $00 $F0 $E0  $55 $45 $35  $AB $9B $8B   three clusters of three
    $2A315D   $F2   9   $00 $10 $20  $55 $65 $75  $AB $BB $CB   the mirror of it
    $2A3168   $0E   8   $00 $20 $40 $60 $80 $A0 $C0 $E0         an even ring
    $2A3172   $F2   8   $00 $20 $40 $60 $80 $A0 $C0 $E0         the same ring, reversed

The direction byte is SIGNED: `$0E` and `$F2` are +14 and -14. So the last two lists
carry byte-for-byte identical angles and differ ONLY in that byte, which is worth
knowing because my first test matcher keyed on angles alone and silently collapsed them
into one formation -- it reported three of four reachable and the fix was in the test.

## The parent pointer, and why the count is a closed loop

`$2A30F4 move.l a6,$1c(a0)` hands every child the boss's sub-record, and
`$2A3D5A movea.l $1c(a5),a0 / addq.w #$1,$19e(a0)` inside type `$42`'s handler is how a
dying child counts itself back. `$19E(a6)` has exactly FOUR references in the whole
6 MB image -- this script's `clr.w` and its read, one longword of table data, and that
one increment -- so the rendezvous at `$2A3108` is closed between this script and its
own children and nothing else.

Finding that took two scans. The first looked only for `(d16,A6)` and found two sites,
which would have supported the wrong conclusion that nothing ever increments the
counter. The write is through A0 because the child holds the pointer in its own
register, so the scan had to be over `(d16,An)` for every An. A scan narrow enough to
answer quickly is also narrow enough to answer wrongly.

## So A1 9 cannot retire yet, and that is honest

Type `$42` (init `$2A394A`, handler `$2A3AF6`) is unported. Its children therefore never
count themselves back, `$2A310C`'s `bne` exits every frame, and A1 9 holds its slot --
which F5's arms 6 and 7 both wait on. The script is correct; its children do not exist.
The test asserts exactly that shape, then sets `$19E` by hand to prove the rest of the
rendezvous runs to completion.

Also worth noting: the retire needs all THREE gates on one frame (`$19E` == `$4(a4)`,
`$8130F4` == 0, and `$10(a4)` reaching zero), and the hold counter does not tick at all
while the first two fail. Its own test covers the `$8130F4` half, which the obvious
scenario would never reach.

## The window, pinned at both ends

New: `$2A3132 + $4A`, the selector plus all four lists.

- The near end: the first selector entry is `$2A3152`, which is exactly `$2A3132 + $20`,
  so the table's own contents say where it stops.
- The far end: the last list ends at `$2A317C`, which is **A1 ELEVEN's INIT**
  (`move.w #$820,$2(a4)`). The A1 table is NOT in address order, so entry 11's body sits
  between entry 9's data and entry 10's code. The test asserts `$2A317C` throws.

`export-web.mjs` re-run after the exporter change, before anything can publish.

## The fourth vestigial write this boss has shown

`$2A3086 move.w #$C,$6(a4)` overwrites the 0/1 side selector F5's arm 6 writes into
this very word (`$2A1170 move.w $12(a4),$6(a0)`), and `$8(a4)` = 3 is never read at all.
A1 8 has three dead register loads of its own. So F5's only parameter to any child is
dead on arrival. All of it transcribed rather than tidied: the stored bytes are
observable even when the values they were meant to carry are not.

## What is still missing

    A1 6  $2A2D70 / $2A2D8E        A1 10 $2A320E / $2A323E
    A1 7  $2A2E8C / $2A2E9E        MAIN7 (A0 entry 7)
    type $42  init $2A394A / handler $2A3AF6

## Order for the next wave

1. Type `$42`, because it is what unblocks A1 9's rendezvous and therefore F5's whole
   attack cycle. Its handler already has a known landmark at `$2A3D5A`.
2. A1 6 and A1 7, which arm 4 starts and stops as a pair.
3. A1 10 and MAIN7, at which point the second phase runs end to end.
