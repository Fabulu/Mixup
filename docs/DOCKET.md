# Player-observed defect docket

Defects seen while playing the live build, in the owner's words, with the
port-side finding underneath. Nothing counts as fixed until a worklog says so and
a focused smoke proves it.

Opened 2026-08-10 from a play session on the shipped web build.

**Standing as of W279: eleven of the first twelve closed; of the five new items,
D13 and D15 are FIXED and three remain.**
The section headings below still read "Fixed" and "Open, in priority order" from the
day the docket was opened; the per-item markers are authoritative, and D12 covers
that drift.

    D1  W226   D2  W226   D3  W264/265/266   D4  W265/266/267
    D5  W230   D6  W234   D7  W271           D8  W272 (no draw was missing)
    D9  W227/228/231      D10 W268           D12 W253/263
    D11 partly landed (W232); the execution engine remains

    D13 orientation, portrait + landscape, mobile + desktop     W279
    D14 make it a PWA                                          OPEN
    D15 a user option to LOCK the orientation                   W279
    D16 the hyper bar should show the level when NOT hypering   OPEN
    D17 the in-stage medals are missing                         OPEN

D13, D14 and D15 are PRESENTATION AND PACKAGING and share one file, `index.html`;
they are the only items in this docket that need no ROM reading at all, so they are
the cheapest player-visible wins left. D16 and D17 are translation.

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

### D7: the hyper gauges are not painted -- FIXED (W271)

Not presentation and not counting: `hyperStock286ED6` had been complete in `hud.js`
since W113 and `livesRow2878CC` since W116, and **nothing called either one**.
`slideIn284CF2`'s `flags9` bit-0 arm still called the `note()` those transcriptions
replaced everywhere else. A routine that is written but not called leaves no gap of
any kind, which is why W269's hunt through the hyper subsystem came up empty. The
generalisation now runs on every suite pass: any `draw(ctx, $X)` in `hud.js` where a
body named `$X` exists in the same file is the same defect.

### D8: the ship may be missing its large exhausts -- CLOSED (W272), no draw was missing

The port draws every record the cartridge draws, byte for byte. Booted from the
board's own main RAM at lf2200 of `stage1-laser-hold` and run 100 frames on the
ladder's own input, the port's three bucket-19 ship records (the 5x40 aura, the 3x32
ship, the 1x32 glow) and its five bucket-12 trail records match the board's lf2300
checkpoint exactly. The board stages no fourth record on any rung, and the four
unrun enqueue sites at `$24A6B4` are unreachable: no instruction anywhere in
`$240000..$2A6000` sets bit 8 of the player state word.

What was actually broken was the shipped page. Its fire-button section, unchanged
since wave 9, told the player that holding shot stopped the loop at `$24C8BE`, that
the bomb stopped it at `$249814`, and that shots had no picture. All three had become
false, and each steered the player off an input that works -- so a player following
the page never held the laser and therefore never saw the afterimage trail, the five
3x32 records that read as the big plume and which `$253604` raises only while the
laser is up AND the ship is moving. The text is fixed and pinned by a test.

The 5x40 aura is the invulnerability blink (spawn, bomb, hyper), not an exhaust. The
always-on exhaust is the 1x32 glow, and it is the small one.

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

## Added 2026-08-11 from a second play session

### D13: orientation support is thin -- portrait, landscape, mobile and desktop -- FIXED (W279)

The owner wants the picture to work properly in BOTH orientations on BOTH form
factors, not just to survive them. D10 (W268) fixed the specific case of the mobile
browser bar eating a landscape viewport, and it added a `FULL` button; it did not
make orientation a first-class thing. `pickScale` picks an INTEGER scale for the box
it is given and `fit()` re-runs on `fullscreenchange`, so the machinery is there --
what is missing is deliberate handling of the four cases and of the rotation event
itself.

The game is a TATE (vertical) shooter, so portrait is the native orientation and
landscape is the one that needs a decision: letterbox, or rotate the canvas.

**W279 found the concrete defect.** `viewport-fit=cover` is set, which is opt-IN to
painting under the system chrome -- and only `env(safe-area-inset-bottom)` was
handled. A notched phone puts its cutout on a SHORT edge, so **in landscape the inset
that bites is the left/right pair**, and `#bar`'s buttons slid under the notch when
the phone was held with the cutout on the left. `body` now pads right/bottom/left; the
TOP is deliberately left unpadded because `#bar` is a solid strip that reads correctly
under a status bar, and `#bar` must not re-add the horizontal pair because it is inside
the padded box. `#bar` also wraps now, so D15's fourth control cannot push the name
off a narrow strip. All four decisions are pinned by `w279orientation.test.js`.

### D14: it should be a PWA

Installable, with a manifest, an icon set, a service worker and offline capability.
The bundle is already static and self-contained (`assets/` plus `index.html`), which
is most of the work; what is missing is the manifest, the worker and the install
affordance. Worth checking the shard layout against a cache-first strategy -- the
sprite sheet is sharded and deferred, so a naive precache would download everything.

### D15: an option to stop the screen from rotating -- FIXED (W279)

Separate from D13 and asked for separately: the player should be able to LOCK the
orientation. W268 already calls `screen.orientation.lock` inside its own `try` on the
fullscreen path and deliberately ignores failure, so the API contact exists -- this
is about exposing it as a user setting that persists, and about being honest on
engines where it cannot work (it needs fullscreen on most, and iPhone Safari has no
`Element.requestFullscreen` at all).

### D16: the hyper bar should show the level even when NOT hypering

**The owner's words: "hyper bar shows you how much hyper you have even when not
hypering."** MEASURED this session, by calling `scoreRow285C62` directly:

    not hypering            bucket-25 records: 0
    hypering, gauge $40     bucket-25 records: 1   tile $1CBF34
    hypering, gauge $200    bucket-25 records: 1   tile $1CBC14

So the bar EXISTS, it is ported, and its tile really tracks the gauge -- `$285C86`
indexes `$2881F2` by `gauge * $16 / $4B0`. But it draws only on the HYPER arm, and
the port is faithful there: `$285D74..$285DD6`, the non-hyper arm, draws icons and
the rank icon and NO panel. `codexref 2881F2` finds exactly two readers, `$285C86`
and `$285E00`, and both are the two sides' hyper arms.

So the always-visible bar is NOT this record, and the next wave has to find what
draws it. `$81B63E`/`$81B640` -- which `hud.js` calls `hyperActiveP1`/`P2` and which
gate the panel -- have **92 references in build B**, so the name may be wrong and the
word may mean "the gauge is armed" rather than "a hyper is running". That is the first
thing to settle, because if it is the former the port already draws the bar correctly
and the gap is whatever maintains the word.

Do not assume it is a missing draw. D7 and D8 both looked like missing draws and were
not.

### D17: the in-stage medals are missing

The owner reports the stage medals do not appear. What the port already has, so the
next wave does not re-derive it:

* `src/bee.js` (W111) -- "the medal IS the bee", kind index 1 (and 16) of pool A, and
  its header says the owner reported the yellow 500-point medals once before;
* `src/hud.js` (W124) -- the medal ACCUMULATOR `$81B61A`/`$81B616` and the tally body
  `$285400`, which drains `$81B610` through the `$32/$64/$96` medal tiers;
* the gate that body needs, `$8130F9` bit 2, DOES have a writer in this port:
  `src/stageend.js:735` at `$28DE16 bset #$2,$8130F9`. So the tally is reachable.

Which means the gap is upstream of the tally -- the in-stage medal ITEM itself, its
spawn, or its art -- and the way in is a sweep of what the medal pool emits during
play rather than a reading of the bonus screen. Note that the chaining medal value is
the thing a player notices, so check the VALUE progression as well as the picture.
