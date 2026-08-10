# W245: Stage-4 boss MAIN4

Status: COMPLETE

## Scope

The first item in W244's order: MAIN4 `$29F8CC`/`$29F8F0`, which F5's INIT starts with
`seqStart2598D0(4)`. F5 without it would arm an `Unreached` on its own first frame, so
it goes first.

## Starting state

W244 is committed at `46a7e01`, suite 1667/1667.

## Delivered

MAIN4 in full. It walks the boss around FOUR waypoints, aiming and slewing at each,
and ends in the same `placeBoss4Parts29F50E` every other MAIN uses.

Every helper it needs was already in the port, which is why this is forty lines:

- `$24203E`, the aim64 CORE -> `aim64`
- `$242190`, the one-step slew -> `slew64`
- `$24249A`, the distance body -> `dist242494`. `$242494` loads D0/D1 out of `($2,A6)`
  and FALLS INTO `$24249A`, and MAIN4 enters at `$24249A` precisely because it has
  already put its own values there -- the port's function takes them as parameters, so
  it is the same routine at the same entry.
- `$241812`, the ship's vector routine -> `tables.vector`
- `$29F50E` -> already in this file

That is the thirteenth availability check to come back positive this session.

One ROM window, pinned by code twice over: `$29F972+$10` is four waypoints of two
words, which `andi.w #$F,$6(a4)` bounds, and `$29F972 + $10` is `$29F982` -- MAIN5's
own entry in the A0 table at `$29F498`. [M] the four are `$6000/$C00`, `$5E00/$2E00`,
`$5C00/$A00`, `$5A00/$2C00`: a weave between left and right at descending Y.

## The detail worth naming

The vector goes into `$194(a6)`/`$196(a6)`, the two PART OFFSETS, and never touches
`$2(a6)`. F5 opens the pods by driving `$18E`/`$192`; MAIN4 then moves what F5 opened.
A reader who assumed a MAIN moves the boss would have written this into the position
and produced a boss that walks while its pods stay put.

## Verification

`node --test games/ddpdoj/tests/w245main4.test.js` -> 4/4: the registration and both
A0 entries with the waypoint table ending exactly at MAIN5's; INIT seeding the speed
and falling through (visible because `$3B` is slewed on the same frame); the vector
landing in the offsets and NOT in the position; and the cursor refusing to advance
beyond `$400` and then walking 0, 4, 8, `$C`, 0 when sat on each waypoint in turn.

Full suite -> **1671/1671**, run before the commit.

## Next, unchanged from W244's order

F5's four arms, then A3 5 `$2A1506`, A3 7 `$2A1562` and A1 8. At that point the
Stage-4 boss's second phase runs end to end.
