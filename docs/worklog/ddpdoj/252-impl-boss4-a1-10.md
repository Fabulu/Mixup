# W252: Stage-4 boss A1 10, the barrage that thickens

Status: DONE. Suite 1725/1725 (1716 + 9), run before the commit.

`$2A320E` (INIT) / `$2A323E` (STEP), A1 table entry 10, which F5's arm 4 starts. The last
of F5's own descendants: every script F5 arms is now translated except the type `$42`
children A1 9 spawns.

## Starting state

W251 committed at `8c290bd`, suite 1716/1716.

## The indirect dispatch, and the two indices that bound it

    2a32c6: lea ($2A33C2,PC),A0 / adda.w $C(a4),A0 / adda.w $19C(a6),A0
    2a32d4: movea.l (a0),A0 / jsr (a0)

Eight longwords resolving to FOUR fans, and the fans are the point:

    $2A33E2   d1                                one shot
    $2A33EA   d1-$A, d1+$A                      two
    $2A3400   d1, d1+$E, d1-$E                  three
    $2A341C   d1-9, d1-$1B, d1+9, d1+$1B        four

all through `$281708`, which the port already had, and all reached by RELATIVE byte steps
(`subi.b #$A` then `addi.b #$14`, and so on) rather than absolute offsets, so a base near
the wrap folds.

`$19C(a6)` IS A DIFFICULTY RATCHET. `$2A33AC addq.w #$8` bumps it once per completed run
and `$2A33A2 cmpi.w #$10 / beq` stops it at `$10`, so it takes 0, 8, `$10` and nothing
else. `$C(a4)` takes 0, 4, 8, `$C` under `$2A32E4`'s `andi.w #$F`. So the barrage grows
each time the boss reaches this attack:

    $19C = 0     fans of 1, 1, 2, 2
    $19C = 8     fans of 2, 2, 3, 3
    $19C = $10   fans of 3, 3, 4, 4

and the largest reachable index is `$C + $10 = $1C`, which is exactly the last of the
eight entries. The table is neither over- nor under-sized, and the test asserts the
reachable index SET rather than trusting the sum.

Finding the cap took looking: a scan for `$19C(a6)` gave four sites, three in this script
and one in an unrelated record, and the `addq.w #$8` alone would have run the index off
the table by its third pass. The bound is six bytes above the bump.

## Two states, and `$8(a4)` changing hands

State 0 walks the four muzzles: an outer cadence (`$4(a4)`, `$40` with a period of 8)
arms a burst of `$A`, an inner cadence (`$6(a4)`, period 4) spends it one fan at a time,
and when the burst empties the cursor advances. When the cursor WRAPS to zero it hands
over to state 1.

State 1 fires TWO fans a volley, from muzzles 2 and 3 and dispatch entries 8 and `$C`
past the base, and retires after ten volleys, bumping the ratchet on the way out.

`$8(a4)` is a BYTE counter in state 0 (armed from `$9(a4)`, `subq.b`) and a WORD counter
in state 1 (`$2A3398 subq.w`), and the hand-over at `$2A32F4` is where it changes. Same
byte/word reuse A1 8 has in `$10`/`$14`, and the reason the INIT literal `$000A` reads as
both "zero" and "ten".

## What the test corrected

I predicted the burst would arm on the INIT frame. It does not: `$2A3250`'s `bcc` borrows
only out of an old zero and `$4(a4)` arrives at `$40`, so the first volley is `$41` frames
away and the burst counter is still zero after INIT. Two assertions rested on that and
both were wrong in the same way, which is the third time this session the old-zero borrow
has caught a prediction one frame or one lap out.

Also pinned: `$2A3282` adds a `$242B3C` byte to the aim, so the base is jittered rather
than taken raw. A port that skipped that draw would aim slightly differently AND
desynchronise every later draw, so the test varies the RNG cursor and asserts the base
moves with it.

## The window

New: `$2A33B2 + $30`, both tables at once, each end pinned by the other's contents -- the
four biases end where the dispatch begins, and the dispatch's own first entry is
`$2A33E2`, which is `$2A33C2 + $20`. `export-web.mjs` re-run afterwards.

## What is left of the Stage-4 boss's second phase

One thing:

    type $42   init $2A394A (runLen stub; body $2A3952, prototype $2A3A6A)
               handler $2A3AF6, roughly 2 KB

Its landmarks are already found: `$2A3D5A movea.l $1c(a5),a0 / addq.w #$1,$19e(a0)` is the
parent-counter increment A1 9's rendezvous waits on, `$286096` is the shared DAMAGE,
`$289004` the fire-gen, `$263762` the free, and `$3C(a6)` is the role selector that
decides which of its behaviours runs -- values 0..3 and `$70`/`$71` all appear. A1 9
writes `$21(a0) = $FF` and `$20(a0) = $48` into every child, and the body copies `$21(a5)`
into `$3C(a6)`, so every child A1 9 spawns arrives with role `$FF`.

That last fact is worth starting the next wave from: it means the roles 0..3 and
`$70`/`$71` come from somewhere ELSE, and finding the other spawner of type `$42` bounds
how much of the handler this boss can actually reach.
