# W251: Stage-4 boss MAIN7, and MAIN4's twin made explicit

Status: DONE. Suite 1716/1716 (1710 + 6), run before the commit.

`$29F9B4` (INIT) / `$29F9CC` (STEP), A0 entry 7, which F5's arm 5 calls in. The last of
F5's MAIN descendants.

## Starting state

W250 committed at `48284d7`, suite 1710/1710.

## MAIN4 and MAIN7 are the same routine

Instruction for instruction in the same order, differing in exactly TWO operands:

    waypoint base      $29F972 (MAIN4)   against   $29FA7A (MAIN7)
    arrival threshold  $400              against   $200

Both mask the cursor with `andi.w #$F`, which is what bounds each table at four two-word
entries; both aim with `$24203E`, slew `$3B(A6)` with `$242190`, measure with `$24249A`,
take the vector from `$241812`, add it into the PART offsets `$194`/`$196` rather than
the position, and tail into `$29F50E`.

So W245's MAIN4 body became a shared `bossWalk(waypoints, threshold)` and MAIN7 is two
lines on top of it. The refactor is only safe if the port still keeps the thresholds
apart, so the test drives the mirror pair: a boss parked exactly `$300` from its
waypoint advances under MAIN4 and does NOT advance under MAIN7. W245's own four tests
still pass unchanged.

MAIN7's waypoints are `$6800/$1A00`, `$6600/$1E00`, `$6400/$1800`, `$6200/$2000` --
lower down the screen than MAIN4's, and paired with the tighter threshold that is a
closer, tighter weave.

## The one thing MAIN4 does not have: THE SPEED RAMP

    29f9cc: subq.b #$1,$8(a4) / bcc              8 with a period of 8, old-zero borrow
    29f9da: cmpi.b #$2,$3a(a6) / beq             already floored? do nothing at all
    29f9e4: subq.b #$1,$3a(a6)
    29f9e8: cmpi.b #$2,$3a(a6) / bgt
    29f9f2: move.b #$2,$3a(a6)                   the FLOOR

Every ninth frame it takes one off the walk speed and floors it at 2, so the final phase
closes in slower and slower and never stops. The floor is checked TWICE and the two
checks do different jobs: the one before the decrement makes an already-floored speed
cost nothing, and the one after PINS an overshoot instead of letting it wrap. The test
drives both, including an odd starting speed of 3.

MAIN7's INIT deliberately does not touch `$3A(A6)`, so the ramp starts from whatever the
previous MAIN left -- which is MAIN4's 6. F5's cycle restarts MAIN4 on bit 5 and calls
MAIN7 back on bit 3, so the ramp resets every lap.

The test pins the ramp frames as `8, 17, 26, 35` and then stopping, which is the
old-zero borrow's cadence rather than the period read literally.

## The window

New: `$29FA7A + $10`, pinned twice the way MAIN4's was -- `$29FA56 andi.w #$F,$6(a4)`
bounds the cursor at four entries, and `$29FA7A + $10` is `$29FA8A`, MAIN8's own INIT in
the A0 table. `export-web.mjs` re-run afterwards.

## What is still missing, and it is now two things

    A1 10  $2A320E / $2A323E
    type $42  init $2A394A (body $2A3952, prototype $2A3A6A) / handler $2A3AF6, ~2 KB

A1 10 was sized this wave and left: it has a TWO-DIMENSIONAL indirect dispatch
(`$2A32C6 lea $2A33C2 / adda.w $C(a4) / adda.w $19C(a6) / movea.l (a0),a0 / jsr (a0)`),
so its generator entries have to be resolved out of a table indexed by both its own
cursor and a sub-record word before any of it can be written. That plus its two data
tables at `$2A33B2`/`$2A33C2` is a wave, not a tail end.

## Order for the next wave

1. A1 10, starting by enumerating `$2A33C2`'s dispatch entries across both indices and
   checking each against `bullets.js`'s nineteen generator entry points.
2. Type `$42`, body and handler together. Landmarks: `$2A3D5A` is the parent-counter
   increment A1 9 waits on, `$286096` the shared DAMAGE, `$289004` the fire-gen,
   `$263762` the free, and `$3C(a6)` the role selector.
