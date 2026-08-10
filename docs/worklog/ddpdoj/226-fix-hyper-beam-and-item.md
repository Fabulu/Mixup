# W226: hyper beam strip window and hyper item motion

Status: COMPLETE

## Scope

Two owner-reported defects from the play session recorded in
[../../DOCKET.md](../../DOCKET.md): D1, firing the hyper stops the port, and D2,
hyper pickups cross the screen almost too fast to see.

## Starting state

- W224 is committed at `6d19202`.
- The owner reported the D1 stop with the port's own `Unreached` text, naming a
  longword read at `$24BAF6`.

## D1: the beam strip window

Reproduced headlessly from `rip/web/seed.bin` in 105 frames: hold button 1, load
one stock and the `$095F` duration `collectHyperStock` writes, press button 2.
The throw comes from `runBeamDraw` at `$25509A`, not from the request.

The finding is that the port's arithmetic was already right and the ROM window
was short. All twenty `$24BB0A` (offset, pointer) pairs carry offset `$001E` and
point at a `$28`-byte strip that `$2550A0 subi.w #$A` walks DOWN to zero, so the
twenty strips together span `$24B7EA..$24BB0A`. `$24A800+$1100` stops at
`$24B900`, which left outside every window:

- the shared HYPER strip `$24BAE2`, which all five `+$78` pairs point at,
- the ship arm's upper powers, `$24B902` up,
- the whole formation arm, `$24B97A..$24BA42`.

Normal play survived only because TYPE-A with formation 2 takes the `+$0` arm,
whose strips end at `$24B8B2`, inside the old window.

Writing the test found a second instance of the same class: the pair table
itself sits at `$24BB0A..$24BBAA` across the seam between `$24BB00+$00A0` and
`$24BBA0+$04E0`, and `src/rom.js` serves a read only from a window that contains
it whole, so the `+$78` pair at `$24BB9A` (laser power 6) would have thrown on
its POINTER longword.

Fix: one window, `$24B900+$02AA`, covering both the strips and the pair table
seam-free. Hash `7774e9f92aae7fd15007793715c3f20ba1204f03487038a5b4210fb80f4647f0`.

## D2: the hyper item body

Three defects in `$27EF50/$27F254`, all found by reading the ROM against the
port:

- `$27F0E8 movem.w ($1a,A6),D0-D1` reads TWO words, at `$1A` and `$1C`. The port
  added a word read at `I.angle`, which is `$1B`: that straddles the pair's
  halves, so the row `$FFF4001F` moved the short axis by `$F400` (-3072) per
  step instead of `$001F` (+31). This is the whole of D2's "so fast you almost
  can't see them".
- `$27F00A` adds D5's LOW word `$FA00` to the long axis and, after the `swap`,
  `$F900` to the short axis. The port had the two biases the other way round.
- `$27EFF4` steps the frame counter and the `$3F`-masked animation cursor BEFORE
  the three draws (`$27F06E` leaves through `jmp $23EB06`, so nothing can run
  after the last one), and it reloads on the `subq.b` BORROW, i.e. when the
  counter was already zero. The port ran the block after the draws and reloaded
  when the counter reached zero, so the item animated a third too fast and drew
  one cursor step behind.

## Focused verification

`node --test games/ddpdoj/tests/w226hyper.test.js`

Result: 4/4 pass. The test walks all four arms and all five powers through every
strip row, pins the new window's hash, drives a real live hyper beam for 120
frames and proves it visits the `$24BAE2` strip and cycles all four of its rows,
then pins the item's exact per-step motion, its draw biases through the same
emitter, and the cursor advance happening before the draw.

Full suite: `node --test games/ddpdoj/tests/` gives 1609/1614 with 5 failures,
and all five are pre-existing at `6d19202` (verified by stashing this slice and
re-running them). They are stale census tests from the Stage-4 waves:
`handlers.test.js:113`, `initbody.test.js:54`, `integration.test.js:244`,
`w167coverage.test.js:65` and `w62stageend.test.js:369`, the last of which fails
on `$2A017A`, registered back in W219. Closing them is the next slice.

## Also found

D9, and it outranks the rest of the docket: any player death reaches unported
`$24CA60`. `playerHit249F8A` sets bit 0 of the player's state byte and the next
option-handler pass tests exactly that bit at `$24C14A`. Reproduced at frame 424
of the same headless scenario. `player.js` throws on the same bit at `$249500`.

## Next

The stale census tests, then D9.
