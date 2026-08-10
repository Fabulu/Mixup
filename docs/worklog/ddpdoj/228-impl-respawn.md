# W228: the respawn

Status: COMPLETE

## Scope

Docket D9, the link after W227: a death ran its animation and reset and then
stopped at `$25FFA8`, the target `$25FF7A` dispatches once `$24A210` arms it.

## Starting state

- W227 is committed at `2ae418e`.
- `rank.js`'s `computedDispatch` threw for any nonzero index, which was right
  while no index could be nonzero. The death reset made `$8130FA` = 1 real.

## Delivered

- Translated `$25FFA8` as `respawn25FFA8` in `src/player.js`. It clears the
  entry's id long, sets `$8130D4` = `$78`, inlines `$261116` (two writes),
  decrements the word its `$8(a6)` POINTS AT, and forks on the sign.
  - Life in hand: the side's LIVES row redraw is a counted `hud.js`-class draw,
    then `$241182` stages a create of the entry's `$14(a6)` type and the new
    record gets `+6` = 0, `+7` = the side, `+8`/`+A` = the entry's position. The
    entry keeps the minted id and goes to state 0.
  - Out of lives: the side's three `$8129xx` words and state 2, which the rank
    object's own state-2 arm already routes to the `$2603DA` teardown.
- `$23C668` is ten instructions, all of them clearing `$907000..$907400`, a
  text-layer plane outside the `$904000` TxVram this port models. Counted, not
  invented.
- `computedDispatch` now takes a ported-target map. `$25FF7A` index 1 resolves to
  the respawn; every other index and all of `$288610` still throw by the jsr
  site, so the widening cannot weaken the check.

## Verification

`node --test games/ddpdoj/tests/w228respawn.test.js`

Result: 4/4 pass. Both forks are pinned unit-wise, including that the game-over
arm creates NO object and that P2's arm leaves P1's three words alone. The live
case takes the same headless scenario that has carried D9 since W226: the player
dies on frame 424, and the port now runs 1400 frames, spends one of the seed's
two lives, returns the dispatcher to idle, clears the death bit, and answers the
stick again.

Neighbours: `node --test w127rank player w164death w62stageend` gives 78/79, the
one failure being the pre-existing stale census in `w62stageend.test.js:369`.

## The next link, measured

A respawned player is controllable but has no long-axis position: `posY` stays 0,
below its own `$800` clamp. `$2491C0` (and its P2 twin `$249246`) has a ONE-TIME
INIT arm the port does not translate at all: everything from `bset #0,$3(a5)` to
`$2494FA`, including the 48-word template copy out of `$24915E`, the `$2551FA`
byte pair, `jsr $253A1E`, and the `+6`-keyed fresh-start arm. A seeded player
never needed it, because the seed has the bit set and the record filled. A NEWLY
CREATED player object does.

That is very likely docket D11 as well: a stage transition that re-creates the
player object would leave the ship with no position, which is what "your ship
disappears" looks like. Next slice.
