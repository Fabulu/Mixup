# W227: the option object's player-death arm

Status: COMPLETE

## Scope

Docket D9: any player death stopped the port. Close the first link of that chain
and measure the next one honestly.

## Starting state

- W226 is committed at `69931bc`, and found D9 while verifying the hyper fix.
- `playerHit249F8A` sets bit 0 of the player's state byte. `$24C14A btst #0,(A4)`
  in the option object tests exactly that bit and sent the port to `$24CA60`,
  which was an `Unreached`. So a death could not survive a live option block.
- The player's own death machinery was already translated:
  `playerDead24A130` runs the animation, the `$20` delay and the
  `$24A172..$24A21A` reset.

## Delivered

Translated `$24CA60`. It is five instructions and holds nothing back:

    24CA60: moveq #$31,d0 / moveq #$0,d1 / movea.l a6,a0
    24CA66: move.w d1,(a0)+ / dbra d0,$24CA66      FIFTY words from the block
    24CA6C: lea $20(a6),a6 / dbra d7,$24C0B0       ...and on to the next block

Fifty words is `$64`, and `$81050E - $8104AA` is exactly `$64`, so the clear
covers this player's option block and stops at the next player's. The `lea`'s
`$20` stride is dead: `$24C0B0` re-loads A6 with an absolute address, which is
why the port's two-entry block list is right and does not need it.

## Verification

`node --test games/ddpdoj/tests/w227death.test.js`

Result: 2/2 pass. The unit case proves the clear covers exactly fifty words and
leaves the adjacent block alone. The live case takes W226's headless hyper
scenario, which kills the player on frame 424, and runs to 494: the death
animation and the reset now run where the port used to stop, and `$8130FA` comes
out armed at 1.

Neighbours: `node --test w226hyper w227death player w164death w60playerbox
integration` gives 63/64, the one failure being the pre-existing stale census in
`integration.test.js:244`.

## The rest of the D9 chain, measured

The reset arms the respawn dispatcher and the next link is one routine deeper:

- `$24A210` writes `$8130FA` = 1, the index word of the two-entry table
  `$25FF7A` walks with stride `$24`.
- `$25FF7A` shifts the index by 4 into the jump table at `$25FF52`, whose
  entries are `[0] $00000000`, `[1] $0025FFA8`, `[2] $00260056`,
  `[3] $0026010E`.
- So a respawn calls `$25FFA8`, which opens `jsr $23C668` then
  `move.l #$0,$18(a6)`. Neither that body nor `$23C668` is translated, and
  `rank.js`'s `computedDispatch` correctly throws rather than calling an
  unported target. This is where a death now stops, at frame 495 of the same
  scenario.

That is the next slice: `$25FFA8` and `$23C668`, and then whether entries 2 and
3 are reachable.
