# Player-observed defect docket

Defects seen while playing the live build, in the owner's words, with the
port-side finding underneath. Nothing counts as fixed until a worklog says so and
a focused smoke proves it.

Opened 2026-08-10 from a play session on the shipped web build.

## Fixed

### D1: firing the hyper crashes -- FIXED in W226

Reported as a crash; it was the port's honest `Unreached` on a longword at
`$24BAF6`, the second frame of a hyper beam. The arithmetic was right and the ROM
window was short: the twenty `$24BB0A` pairs point at `$28`-byte strips that
`$2550A0` walks DOWN, so they span `$24B7EA..$24BB0A` while `$24A800+$1100` stops
at `$24B900`. The shared hyper strip `$24BAE2`, the ship arm's upper powers and
the whole formation arm were outside every window. Normal play survived only
because TYPE-A with formation 2 takes the `+$0` arm. Fix: one window,
`$24B900+$02AA`, which also carries the pair table seam-free.

### D2: hyper pickups move far too fast -- FIXED in W226

`$27F0E8 movem.w ($1a,A6),D0-D1` reads two words, at `$1A` and `$1C`. The port
read one word at `$1B`, straddling the pair, so the row `$FFF4001F` moved the
short axis by `$F400` (-3072) instead of `$001F` (+31). Same body: the two draw
biases were swapped, and the animation advance ran after the draws instead of
before, with the borrow inverted.

### D7 (partly) and the rank icons -- FIXED in W230

The rank-icon tables `$2882A6` (P1) and `$288326` (P2), eight longwords each, had
never been harvested into the sprite bundle, so the port enqueued a rank icon
every frame and the page had nothing to draw. Found by the new descriptor sweep.

### D9: CLOSED in W231 -- a death, a respawn and the pods all work

W227 translated `$24CA60` (it clears fifty words of the option block), W228
translated `$25FFA8` (the respawn/game-over fork) and W231 translated the player
object's one-time INIT `$2491C0`/`$249246`, the SET/bonus panel `$2603B0` behind
it, and the pods' deploy `$24C934` it makes reachable.

A death now runs its animation and reset, spends a life, creates a fresh player
object, puts the ship back at the position the respawn entry carries, gives it
`$F0` frames of invulnerability, and deploys its pods to exactly the target
`$24C928` names. The headless scenario survives three deaths and two full
respawns.

What remains is not a defect but the next frontier: when the LAST life goes, the
game-over arm arms dispatcher request 2, which is `$260056`, the credit/continue
entry. That creates object types `$D` and `$B`, and type `$B` is the same
unported `$25DBB4` that D11 is about, so the two meet there.

### D6: bees give no score popup -- FIXED in W234

The award was never the problem (`$27FC72` sets bit 0). What was missing was
`$28112C`, the collected-animation arm, whose body turned out to be the same
instructions as `$2810CA` that W111 already ported. Plus `$2811BE` (the digits),
`$28129E` (the x2 indicator and its five-tile cursor), and `$27FC24`'s descriptor
write. `$23EC20` cost nothing: it is `enqueueRegisters` on bucket 8.

It also uncovered a defect: `$27FC08 bset #$5,(A6)` is byte-sized, so the x2 flag
is `$2000` of the status word, not `$0020` -- and bit 5 of the word is inside the
kind field (`d1 & $7C`), so the flag could never be read and the x2 popup could
never have appeared. Code and test both corrected.

## Open, in priority order

### D11: the stage transition is abrupt -- DIAGNOSED, first piece landed in W232

The owner's words: finishing a level, the ground goes, then the ship disappears,
then it reappears in the new level, far too abrupt -- the real game runs a big
transition sequence there.

W232 forced `$242952` headlessly and measured it. The stage machine WORKS: the
type-6 object runs, the clearing flag sets, the stage word steps, the player parks
and the object retires. What is missing is the presentation, and all of it was
already counted by address:

- the banner's zooming ENTRY picture `$23F82A` -- **PORTED in W232**, and its five
  per-stage pictures are in the sprite bundle now (they never were, so the banner
  could not have drawn even with the emitter),
- the TX TEXT: **DONE**. The printer was W116, W237 ported the SET-item icon row and
  progress cue, and W238 ported `panel2851D2` -- the stage-clear banner's panel, so
  its lives icons, hyper-stock icon and bomb-row text all draw, and W239 ported its
  BOSS-banner twin `panel284FD2` -- which also caught W238 dropping D1's high word,
  so neither panel had a vertical position until W239,
- the banner's five `$24150A` resource installs plus the slide-out's -- **PORTED
  in W236**, and `$24150A` had been ported since W91; the note calling it "data"
  had simply stopped being true,
- the RESULT SCREEN: `$23C638` turned out to be the $900000 TILEMAP RING clear, not
  a palette cue -- that is what takes the ground away, and W240 ported it (the ring
  empties on frame 67 of a forced transition and rebuilds by 400). `$246410` was
  already ported. What is left is `$28C186`/`$28D6FC`, and `$28D77C`, which writes
  palette RAM this port does not model at all,
- `$253794`, the option-pod teardown.

So this is three presentation tiers on a working machine, not one missing engine.
The text layer is next and pays for itself three times: D6's score popup and D7's
gauges are likely waiting on the same printers.

Correction to the earlier lead: `[11]` `$25DBB4` is NOT the transition. Its state 0
picks a per-player table, arms a `$4B0` timer, and its body watches `$23C932` and
`$803808` -- it is the credit/start/continue controller, which is why `$260056`
creates it. `[4]` `$260B30` is still unported and still runs twice a frame.

### D3 and D4: missing explosions -- BOTH FIXED (W264..W267)

They had DIFFERENT causes, and assuming they shared one is what kept D4 open.

**D3 was a producer**, and the producer was blocked by a hand-transcribed table.
`$280B3E` reads its template out of `$280E4A` and W29 had transcribed the two kinds
it measured instead, so the screen clear's own kind `$0` had no entry and the
allocator threw. W264 made the templates and the animation hooks come from the
cartridge for all twenty kinds and wired `$27F8F8`; W265 added kind 0's body
`$27FA30`, which the driver then reached; W266 shipped its sixteen-frame animation.

**D4 was the BUNDLE after all** -- but only outside stage 1. W230's sweep only ever
ran the shipped seed, so "every descriptor resolves" was a stage-1 fact being read
as a claim about the game. W265 taught the sweep to boot from a checkpoint rung; run
into stage 2 it named 129 streams the page could not resolve. W266 and W267 sized
nineteen families out of the cartridge's own chain and shipped them.

Both sweep forms now report ZERO missing:

    node tools/w230descriptorsweep.mjs                      stage 1: 0
    node tools/w230descriptorsweep.mjs --lf 19500 --frames 9000   stage 2: 0

Still open in the same neighbourhood, and NOT part of D3 or D4: the two kind-`$8`
sites (their template's lists resolve to zero entries, so porting them would be
invention) and seventeen of `$280BCE`'s twenty finish routines, each of which now
throws naming its own address rather than "unported kind".

### D5: the systemic sprite question -- INSTRUMENT DELIVERED in W230

`tools/w230descriptorsweep.mjs` answers "which sprites cannot draw" mechanically:
it takes the display list the port actually builds and checks every descriptor
against the bundle's own stream table. Bundle-wide it now reports zero. Re-run it
per stage and per boss as coverage grows; a missing sprite that is not in its
output is a producer problem, not a bundle problem.

### D7: the hyper gauges are not painted

The gauge word does count (`$81B642` steps down by 2 per frame while hyper is up,
verified headlessly in W226), so this is likely presentation. The rank icons under
"Fixed" were one instance of the same family; the gauge needs its own look.

### D8: the ship may be missing its large exhausts

Only tiny exhausts draw. Since the sweep says nothing the port draws is missing
from the bundle, the exhaust is either a draw the port never makes or a part of
the ship record it never fills. Check `src/shipsprite.js` against the ROM.

### D10: mobile landscape wastes most of the screen on the browser bar -- FIXED (W268)

The layout was already doing the only thing CSS can do: the page is sized in
`100dvh`, which FOLLOWS the URL bar, so nothing ever goes under the fold. What that
cannot do is get the bar off the screen -- in landscape on a phone it is a large
fraction of a short viewport, so `dvh` correctly shrinks the picture instead, which
is exactly what the owner saw.

Only the Fullscreen API removes browser chrome, and every engine gates it on a user
gesture, so W268 added a **FULL** button to the bar. Three details it gets right and
`w268fullscreen.test.js` pins:

* iPhone Safari has no `Element.requestFullscreen` at all. The button HIDES itself
  rather than offering something that cannot work, feature-detected on the element
  and never sniffed from a UA string. There `100dvh` remains the best available.
* `screen.orientation.lock` throws on engines that have it but are not yet in
  fullscreen. It is attempted in its own `try` and its failure ignored on purpose --
  locking is a bonus, not the feature.
* the label repaints from `fullscreenchange`, not from the click, because the user
  can leave fullscreen with the system gesture and a click-painted label would then
  be wrong. Both transitions re-fit the canvas, since `pickScale` picks an INTEGER
  scale for the box it was given.

### D12: the repo documentation is well behind the code

`docs/` still describes the project as it was several waves ago:
`00-MASTER-REFERENCE.md`, `01-PORT-PLAN.md` and the `recon-*` documents predate
stages 3 and 4 entirely, and nothing in `docs/` except this docket and
`NEXT_AGENT_HANDOFF.md` mentions the Stage-4 boss, the hyper, the death chain or
the web bundle's shard layout. Worth one pass that brings the top-level documents
up to the code, states where the port actually is stage by stage, and points at
the worklogs for detail rather than restating them.
