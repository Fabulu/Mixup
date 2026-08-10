# Player-observed defect docket

Defects seen while playing the live build, in the owner's words, with the
port-side finding underneath. Nothing counts as fixed until a worklog says so
and a focused smoke proves it.

Opened 2026-08-10 from a play session on the shipped web build.

## D1: firing the hyper crashes -- FIXED in W226

Reported as a crash; it was the port's honest `Unreached`, reading a longword at
`$24BAF6` on the second frame of a hyper beam.

Diagnosis: not a logic bug. All twenty `$24BB0A` (offset, pointer) pairs carry
offset `$001E` and point at a `$28`-byte strip that `$2550A0` walks DOWN by
`$A`, so the twenty strips span `$24B7EA..$24BB0A`. The exporter's
`$24A800+$1100` window stops at `$24B900`, so every strip above that was
outside every window: the shared HYPER strip `$24BAE2`, the ship arm's upper
powers, and the whole formation arm. Normal play survived only because TYPE-A
with formation 2 takes the `+$0` arm, whose strips end at `$24B8B2`.

Fix: one new ROM window `$24B900+$0200` in `tools/export-tables.py`.

## D2: hyper pickups move far too fast -- FIXED in W226

The item body read a WORD at `$1B` for the short-axis step, but `$27F0E8
movem.w ($1a,A6),D0-D1` reads two words at `$1A` and `$1C`. The `I.angle` name
is the byte convention other item kinds use; here it straddled the pair's two
halves, so the row `$FFF4001F` moved the item by `$F400` (-3072) per step
instead of `$001F` (+31).

Also fixed in the same body: the draw-1 axis biases were swapped (`$27F00A`
adds D5's LOW word `$FA00` to the long axis and `$F900` to the short axis after
the `swap`), and the frame/animation advance ran AFTER the three draws when
`$27EFF4` runs it BEFORE them, reloading on the `subq.b` borrow (counter already
zero) rather than when the counter reaches zero.

## D9: any player death stops the port -- FIRST LINK FIXED in W227, still OPEN

Found while verifying D1. `playerHit249F8A` sets bit 0 of the player's state
byte; the next option-handler pass tests that bit at `$24C14A` and lands on
`$24CA60`, which is not translated. Reproduced headlessly at frame 424 from
`rip/web/seed.bin` holding button 1.

W227 translated `$24CA60` (it clears fifty words of the option block), so the
death animation and the `$24A172..$24A21A` reset now run. The chain does not end
there: the reset arms `$8130FA` = 1 and the `$25FF7A` dispatcher then wants
`$25FFA8`, which opens `jsr $23C668`. Neither is translated, so a death now stops
at frame 495 instead of 425. Next slice, and still the top of this docket.

## D11: stage transitions are wrong and the ship disappears

The owner's words: stage transitions are not right, your ship disappears, and
there may be no score totalling either (none is visible). W228 found the likely
cause of the disappearing ship: `$2491C0`'s one-time INIT arm, everything from
`bset #0,$3(a5)` to `$2494FA`, is not translated. A newly created player object
therefore never gets its record filled or its position set, and a respawned ship
provably sits at `posY` 0, below its own `$800` clamp. A stage transition that
re-creates the player object would look exactly like this.

The score totalling is a separate question and needs its own look: find whether
the stage-end tally runs at all (`src/stageend.js` into `src/score.js`) or only
its presentation is missing, which is the same fork as D6 and D7.

## D3: missing explosions in stages 1 and 2

Some enemy deaths have no explosion. Suspect effect kinds whose descriptor was
never harvested, so the record is enqueued but the web renderer has no stream.
Compare the effect kinds `src/effects.js` can spawn against the harvested
streams in `assets/manifest.json`.

## D4: stage 2 mid boss is mostly invisible

Only two small turrets draw; the body does not. Same shape as D3 but for a boss:
either its A2 object draws are not translated or their sprite tables are not in
the web bundle. See `src/midboss.js` and the stage-2 harvest in
`tools/export-web.mjs`.

## D5: hidden and missing sprites in general

D3, D4, D7 and D8 are probably instances of one systemic gap. Worth one sweep
that joins every draw site the port can reach against the harvested stream set
and reports the draws whose descriptor is absent from the bundle. That sweep is
the deliverable, not a list of guesses.

## D6: bees give no score popup and no collect feedback

Bees can be collected but nothing indicates it: no popup, no sound, no HUD
change. Check whether the collect credits score at all or only the presentation
is missing. See `src/bee.js` into `src/score.js` / `src/hud.js`.

## D7: the hyper gauges are not painted in the UI

Unknown whether the gauge logic runs at all. The gauge word does count
(`$81B642` steps down by 2 per frame while hyper is up, verified headlessly in
W226), so this is likely presentation only. See `src/hud.js`.

## D8: the ship may be missing its large exhausts

Only tiny exhausts draw. Check whether the ship has further parts the port never
enqueues, or whether their streams are missing from the bundle. Related to D5.

## D10: mobile landscape wastes most of the screen on the browser bar

On a phone in landscape the browser chrome takes most of the viewport. Look at
the page shell in `src/web/` -- a fullscreen request on first input plus
`viewport-fit=cover` and dynamic viewport units (`100dvh`) is the usual fix.
Presentation only, no simulation risk.
