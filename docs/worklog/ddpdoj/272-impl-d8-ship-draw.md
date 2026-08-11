# W272: DOCKET D8 -- the exhausts are not missing, the INSTRUCTIONS were wrong

Status: DONE. Suite 1851/1851 (1843 + 8), sweep 0 missing on both the shipped seed and the
stage-2 rung, all run before the commit.

The owner reported "the ship may be missing its large exhausts. Only tiny exhausts draw."
The port draws every record the cartridge draws, byte for byte. What was broken is that the
shipped page told the player, in three separate bullets, not to press the buttons that
raise the big one.

## Starting state

W271 committed at `f7a42c4`, suite 1843/1843.

## W271's lesson applied first, and it came back negative

The mechanical check from `w271hyperstock.test.js` -- a `draw(ctx, $X)` where a body named
`$X` exists in the same file -- run over `shipsprite.js` and `player.js`:

    shipsprite.js -- bodies: 0  noted: 0  | NOTED DESPITE A BODY: none
    player.js     -- bodies: 11 noted: 7  | NOTED DESPITE A BODY: none

So D8 was not another uncalled body. That left the docket's own two branches: "a draw the
port never makes" or "a part of the ship record it never fills."

## BRANCH ONE: a draw the port never makes

`tools/w67trailgate.mjs` already names, from the cartridge, every enqueue site reachable
two levels out of the ship's draw block. There are NINE, and the port runs only three of
the seven on bucket 19:

    bucket 19  $24A532   the AURA         run
    bucket 19  $24A538   the SHIP         run
    bucket 19  $24A632   the GLOW         run
    bucket 19  $24A6C4   \
    bucket 19  $24A700    |  the script-driven display walker at $24A6B4
    bucket 19  $24A730    |
    bucket 19  $24A756   /

Four unrun sites is exactly the shape of a missing exhaust, so they had to be settled. The
walker is reached only from `$24A462 btst #8,D0` -- bit 8 of the player state word, which
is bit 0 of the BYTE at offset 0 of the record. A whole-image scan for every instruction
form that can set that bit through A0 or A6 (`bset #0,(An)`, `bset #0,d(An)`,
`ori.b #1,(An)`, `ori.b #1,d(An)`) finds **137 hits in the image and not one of them inside
`$240000..$2A6000`**. Nothing in the main program sets it, so the walker is unreachable and
`drawShipAlt`'s throw is correctly never taken.

Then the direct measurement, which does not depend on that argument at all: the board's own
bucket 19, read out of the W69 checkpoints.

    lf2000  b19[0] size $0A28   b19[1] size $0620   b19[2] size $0220   b19[3..15] ZERO
    lf2100  the same            lf2200 the same     lf2300 the same

**Three records, and the staging buffer is never cleared, so a fourth on any frame of the
ladder would still be sitting there.** The size format is (tiles*2)<<8 | rows: `$0A28` is
5x40, `$0620` is 3x32, `$0620` is the ship's own, `$0220` is 1x32. The port stages three
records of those three sizes. There is no missing draw.

## BRANCH TWO: a record field it never fills

The 5x40 record -- the LARGE one -- is gated on `$24A48E tst.b ($3e,A6)`. Every ladder in
`out/w69` PINS that byte at `$FF` as a declared intervention, so no ladder comparison could
ever have caught a port that fails to write it. Checked by reading the port instead: it is
written in six places, `$2493F2` (`#$F0` on spawn), `$249524`/`$249536` (the decrement),
`$2495A2` (`#$FF`), `$24A3C4` (`#$1`), the bomb's `$249A56`, and the hyper. The field is
filled.

## THE COMPARISON THAT SETTLES IT

Boot the port from the cartridge's own main RAM at lf2200 of `stage1-laser-hold`, feed the
ladder's own script for that segment (`2200=DAL`, Down + Left + Button 1) for 100 logic
frames, and compare against the board's lf2300 checkpoint:

    b19[0] AURA   port 87ec 83f8 0005 80ac 0a28 0002   board identical
    b19[1] SHIP   port 8008 83fc 0000 1200 0620 0000   board identical
    b19[2] GLOW   port 8002 83fc 0000 21ac 0220 001a   board identical
    b12[0..4]     five 3x32 colour-31 trail records     board identical
    b12[5]        zero                                  board identical

Eight records, byte for byte, 100 frames out from a shared state. The ship's draw path is
not approximately right.

## SO WHAT WAS THE OWNER SEEING

Correct behaviour, and a page that hid it. On the cartridge:

* the always-on exhaust IS the 1x32 glow -- wave 9 named it the "exhaust glow" and it is
  the small one;
* the 5x40 aura is the INVULNERABILITY blink (spawn, bomb, hyper), not an exhaust -- W67
  said so and this wave confirms the gate;
* the big plume is the AFTERIMAGE TRAIL, five 3x32 copies of the ship's own art in colour
  31, and `$253604` raises it only while the LASER IS UP **and** the ship is crossing
  coarse cells.

And the page's own fire-button section, unchanged since wave 9, said:

    TAP shot   "You will not see it. None of the nine shot sprite streams is in the
                shipped sheet"
    HOLD shot  "Neither is ported... Holding for four frames stops the loop"
    BOMB       "reaches a named throw at $249814 and stops the loop"

All three are false, and each one steers the player off an input that works:

* holding fire for 900 frames throws nothing, and `$24C8BE` walks the speed index
  22 -> 12 in 100 frames -- **12 is the value the board itself holds at lf2100**;
* `$249814`'s two arms are both in `src/bomb.js` since W64/W65; 300 frames of Button 2
  throws nothing, and neither does Button 3;
* tapping stages 7,203 bucket-14 records over 400 frames across **twenty** distinct
  streams, and all twenty are in the shipped sheet -- the bundle work of W265-W267 put
  them there and nothing updated the sentence.

A player who read the page never held the laser, so never met either condition the plume
needs. That is the defect, and it is a player-visible one.

## What landed

`index.html`'s three bullets rewritten to what is now true, with the measured numbers, and
`HOLD shot` now says outright that holding the laser while moving is what raises the
plume. `tests/w272shipdraw.test.js` is the gate: the board's three-record census on four
rungs, the two byte-for-byte comparisons, a liveness check so the match cannot be two empty
buckets, the speed ramp against the board's own value, the twenty streams against the
sheet, and a mechanical check that the three stale sentences cannot come back by
copy-paste.

## Recorded for later, not fixed here

`src/type5.js`'s header still says `$24C096` is "ONE OF THE 22 THIS FILE COUNTS AND DOES NOT
RUN" and that the port throws on the fourth consecutive held frame. `src/options.js` ports
that object and the ramp demonstrably runs, so the comment is historical. Comment only, no
behaviour: left alone in a wave whose subject is the draw path, noted so the next reader
does not re-derive it.

## Docket status

    D1  fixed (W226)          D7  fixed (W271)
    D2  fixed (W226)          D8  CLOSED (W272) -- no draw was missing; the page was wrong
    D3  fixed (W264/265/266)  D9  fixed (W227/228/231)
    D4  fixed (W265/266/267)  D10 fixed (W268)
    D5  fixed (W230)          D11 partly fixed; the rest is the animation-object
    D6  fixed (W234)              execution engine
                              D12 fixed (W253/263 handoffs)

**Eleven of twelve closed.** D11's remainder is the only open item, and it is not
player-visible in the way the other eleven were.

## Order for the next wave

1. `$2600D8`, then object dispatch `[11]` `$25DBB4` end to end. W270 recon'd it down to one
   unread routine and W271 and this wave have both deferred it. It is the stage-clear SCORE
   TALLY -- the other half of the owner's "maybe even score totalling, which I see none of"
   -- and 900 counted notes a run.
2. Then the four other announcement-poster caller regions (`$25CDxx`, `$25D5xx`, `$2601xx`,
   `$288A02`), which share the protocol W270 landed.
3. Then D11's remainder: the animation-object execution engine, via the node code pointers
   at `$24627A`.
