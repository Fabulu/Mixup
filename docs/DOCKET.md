# Player-observed defect docket

Defects seen while playing the live build, in the owner's words, with the
port-side finding underneath. Nothing counts as fixed until a worklog says so and
a focused smoke proves it.

## HEADING CONVENTION -- READ THIS BEFORE ADDING A SECTION

`docket_ids.py` treats `### D<N>:` and `### D<N>.` as a **DEFINITION** of item N. So a follow-up
written as `### D59: more about the bees` silently declares a SECOND D59 and two items answer to
one name -- the exact failure D47 built the tool to catch.

**Define an item once. Every later section about it starts `### D<N> FOLLOW-UP -- ...`,
`### D<N> UPDATE ...` or `### D<N> CLOSED BY ...`** -- anything except a colon or full stop
straight after the number.

**And run `python games/ddpdoj/tools/docket_ids.py` and READ ITS OUTPUT before you commit.** It
exits 1 on a duplicate. I have tripped this twice, and the second time I pushed before reading it.

Opened 2026-08-10 from a play session on the shipped web build.

**Standing as of W279: eleven of the first twelve closed; of the five new items,
D13 and D15 are FIXED and three remain.**
The section headings below still read "Fixed" and "Open, in priority order" from the
day the docket was opened; the per-item markers are authoritative, and D12 covers
that drift.

**STILL TRUE AS OF W408.** The per-item markers are the authority; the section
headings are not. D47 covers fixing this properly.

**STANDING AS OF W408 (2026-08-18).** Dispatch is **17 of 20**, not 16: `[12] $28F3AC` has been
ported since the block below was written, so the three without a handler are `[16] $256E7A`,
`[18] $24902A`, `[19] $28EE88`. The newest items are **D42..D47**, opened from a play session on
build `20260816181806` and appended at the end of this file; they outrank further boss internals.
**D47 is a documentation pass and the owner confirmed its shape on 2026-08-18**: keep the current
wave plus two in `NEXT_AGENT_HANDOFF.md`, archive older waves into `docs/worklog/` unedited, refresh
the stale headers here, and check that a new docket ID is free before using it. The handoff split is
DONE (`docs/worklog/ddpdoj/ARCHIVE-handoff-W405-and-older.md`); the ID check is not yet written.

**The block that follows is kept as written on 2026-08-15 and is superseded above.**

**STANDING AS OF W375 (2026-08-15).** The docket now runs D1..D41 and its centre of gravity has
moved: the play-session defects D1..D32 are almost all closed, and the open bulk is the **front
end** the owner added on 2026-08-13 (D33 main screen, D34 character select, D35 life and coin,
D37 endings) plus the new **D41 controls to start the game**. **D36, the second game in the
cartridge -- DoDonPachi DaiOuJou WHITE LABEL -- is LAST in order and is the project's definition of
done.** Nothing has been decoded for it.

**D41's central question is ANSWERED as of this wave and the item is largely closed** -- see D41
below. Coin and start alone were NOT sufficient; three blockers stood behind them (no boot path,
slot [8] unported, the `$13CEC8` IRQ4 coin path unmodelled) and all three are cleared. A cold boot
now reaches a drawing screen through the cartridge's own path, and coin is bound on the page. What
remains under D41 is cosmetic-but-stalling: four things that do not throw but keep the attract loop
terminating at state 12 rather than cycling.

**DISPATCH IS 16 OF 20.** The four without any ported handler: [12] `$28F3AC`, [16] `$256E7A`,
[18] `$24902A`, [19] `$28EE88`. `w167coverage.test.js` asserts the count, and `dojcoverage.py`
parses it straight out of `main.js`'s `defaultHandlers` block, so the assertion is the registry
rather than a copy of it.

Two entries in the D33/D34 material below are marked SUPERSEDED in place rather than deleted: the
"eleven untouched dispatch slots" count (six are ported now) and W373's "still open" list for slot
[9] (all of it landed in W374). The superseded text is kept because the reasoning that produced it
is still the right method; only the numbers moved.

    D1  W226   D2  W226   D3  W264/265/266   D4  W265/266/267
    D5  W230   D6  W234   D7  W271           D8  W272 (no draw was missing)
    D9  W227/228/231      D10 W268           D12 W253/263
    D11 partly landed (W232); the execution engine remains

    D13 orientation, portrait + landscape, mobile + desktop     W279
    D14 make it a PWA                                          W280
    D15 a user option to LOCK the orientation                   W279
    D16 the hyper bar should show the level when NOT hypering   W283 (correct as-is)
    D17 the in-stage medals are missing                         W284/W285 -> publish
    D18 commit AND PUSH every wave, not just commit             STANDING RULE
    D19 record the DEPLOYED BUILD ID with every report          STANDING RULE

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

**W375 CORRECTION -- THE PREMISE OF THE PARAGRAPH ABOVE IS WRONG, AND THAT IS
WHY THE ITEM LOOKED BIGGER THAN IT IS.** `00-MASTER-REFERENCE.md`,
`01-PORT-PLAN.md`, `02-MOD-SYSTEM.md`, every `recon-*` and every `research-*`
file **is about BATMAN: RETURN OF THE JOKER (Game Boy, Sunsoft 1992)**, which is
this repository's first game. They cite `B:$AAAA` bank addresses, MBC1 banking
and a 131072-byte ROM. **They do not describe DaiOuJou at all**, so they cannot
"predate stages 3 and 4" -- DaiOuJou has no stages in them to predate.

The repository holds THREE games (`03-VERIFICATION.md`'s own table says so:
Batman, Gradius, DaiOuJou). DaiOuJou's living documents are **this file**,
`ORCHESTRATOR_BRIEF.md`, `NEXT_AGENT_HANDOFF.md` and `docs/worklog/ddpdoj/`;
`04-INPUT-SYSTEM.md` is the only top-level plan that spans all three.

So the real scope of D12 is those four, plus the DaiOuJou row of
`03-VERIFICATION.md`. **Do not "update" the Batman references to mention the
Stage-4 boss.** That would corrupt the record of a different port, which is a
worse outcome than the staleness this item was opened for.

**W375 DID A PASS AND THIS ITEM STAYS OPEN, NARROWED.** Corrected against the code:
this file's front-end sections, `ORCHESTRATOR_BRIEF.md`'s current-state and
next-units sections, and the top-level references. **What was stale was never the
prose -- it was the counts**: ROM window counts, suite counts, "eleven slots
untouched", three routine sizes taken from address gaps, and a "next units" list
every entry of which had already landed. **Numbers rot and reasoning does not**, so
the correction was to date and supersede the numbers and leave the reasoning
standing.

Deliberately not touched: `recon-*` and `research-*` are historical records of
investigations, not living state. Still stale and NOT fixed by that pass:
`NEXT_AGENT_HANDOFF.md`, which is over 10,000 lines because nobody prunes it and
which now contradicts itself within a single wave -- it records `$25E4D0` as having
no ported caller and warns against wiring one, which stopped being true the moment
`$25D560` landed in that same wave and gave it its host.

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

### D14: it should be a PWA -- FIXED (W280)

Installable, with a manifest, an icon set, a service worker and offline capability.
The bundle is already static and self-contained (`assets/` plus `index.html`), which
is most of the work; what is missing is the manifest, the worker and the install
affordance. Worth checking the shard layout against a cache-first strategy -- the
sprite sheet is sharded and deferred, so a naive precache would download everything.

**W280 landed it, and that caveat decided the whole design.** The routing splits by
WHAT a request is: the shell (page, manifest, three icons) is cache-first, and
`assets/` is NETWORK-first with the cache as the offline fallback. So an online player
pays the shard cost exactly when `assets.js` decided to pay it -- shard 9 alone is
218 KiB and the port first asks for shard 5 a hundred seconds into stage 1. A
never-seen asset offline returns **504, never a synthesised 200**, because `assets.js`
turns a missing `.bin` into an empty buffer and "a perfectly plausible empty tile
sheet".

Two things that would have failed silently: `sw.js` MUST sit beside `index.html` (a
worker's scope is its own directory, so one under `src/` controls nothing), and the
build MUST stamp the build id into it, because the cache name IS the version and a
worker shipped with `'dev'` serves the first build it ever saw for ever. The stamp
throws if its anchor is gone. `build-dist.mjs`'s `INCLUDE` covered none of the five
files and now does.

The icons are GENERATED by `games/ddpdoj/tools/make-pwa-icons.mjs`, which never opens
a ROM, `assets/`, or a frame of the game -- an icon cut from the running game would be
cartridge graphics with extra steps, which is the same reason
`tools/make-placeholder-tiles.mjs` exists.

### D15: an option to stop the screen from rotating -- FIXED (W279)

Separate from D13 and asked for separately: the player should be able to LOCK the
orientation. W268 already calls `screen.orientation.lock` inside its own `try` on the
fullscreen path and deliberately ignores failure, so the API contact exists -- this
is about exposing it as a user setting that persists, and about being honest on
engines where it cannot work (it needs fullscreen on most, and iPhone Safari has no
`Element.requestFullscreen` at all).

### D16: the hyper bar should show the level even when NOT hypering -- CLOSED (W283)

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

**W281 SETTLED IT AND IT IS NOT A MISSING DRAW.** `$81B63E` really does mean "a hyper
is RUNNING" (`$285A30 move.w #$1` is reached only after `$285A1C` finds a request), so
the fill panel is genuinely hyper-only. **The always-visible indicator is a different
record: `$285D74`, the non-hyper arm, draws `$81B6E0` ICONS from tile `$1CA008` guarded
by `$81B6E4`** -- and the port draws it, one icon per unit, measured at 1/2/3/5.

The screen is empty because `$81B65C`, `$81B6E0`, `$81B6E4` and `$81B642` are **ZERO on
every frame of a 900-frame run on both the shipped seed and the laser-hold rung**. Every
hyper display correctly draws nothing. Driven by hand they all respond.

So the gap is the item PRODUCER, which is the D3 shape again. `w281hyperdisplay.test.js`
pins the whole display chain so no further wave looks there, and it also pins that
`spawnItem`'s `REFUSED_KINDS` branch -- which reads exactly like the cause -- has been
DEAD since W163.

### D17: the in-stage medals are missing -- MECHANISM PROVEN (W284, W285)

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

**W284 applied W283's method and the chain is COMPLETE for kind 1.** Stage 1 holds TEN
type-`$8A` carriers and all ten spawn; `deathSeq8A` is complete and calls
`allocBee27F92A` at `$2767E6`; forced by hand, kind 1 (`$04` -- what a real carrier
death passes) allocates a reserved slot with ZERO counted notes.

But the RESERVED TEN -- the slots only the carrier's death arm uses -- is never occupied
in a 6400-frame run, because **no scenario in the tree kills a carrier**: the laser-hold
ladder parks the ship at the bottom centre by design, so it kills what enters the beam
and nothing else. That is a property of the scenario, not the port.

One real gap found: **kind 16 (`$40`, the flying variant) throws `Unreached $280CEE`**,
and it throws AFTER claiming the slot, so a caller that swallowed it would leak one of
the ten per attempt.

**And the symptom is `bee.js`'s own header verbatim** -- the report W110 recon'd and W111
fixed. See D19.

**W285 did the one measurement.** Boot the laser-hold rung, find a live carrier, drive
`$276744`'s two death conditions -- a hit bit and the HP SIGN -- and step one frame:
reserved ten goes 0 -> 1 and pool A's live count goes to 1. **The medal appears**, inside
a running game, with nothing forced except the two bits that mean "this enemy just died".

So the mechanism is complete on `main` and the same test pins both halves of the
explanation: carriers are plentiful, and none dies unaided. It also pins that the gate is
the HP SIGN and not zero (`$27674E tst.w / $276752 bmi`) -- a port that tested `=== 0`
would drop nothing whenever a hit took HP negative, which for a laser is the normal case.

**The next step for this item is a PUBLISH and a second look, not another wave.** That is
D19's whole point and D17 is the first item it applies to.

### D18: commit AND PUSH intermittently, not just commit

**The owner's words: "add to the docket to intermittently commit and push."**

Every wave this session committed and none pushed, so `main` sat **73 commits ahead
of `origin/main`** by W279. That is not a code defect; it is a delivery one, and it is
the kind that costs the whole session's work if the machine goes away.

The rule from here: **push at the end of every wave, right after the commit that
closes it.** A wave is not done until `git rev-list --count origin/main..HEAD` is 0.
The existing per-wave discipline already runs the suite and the sweep before the
commit, so the push is the natural last step and adds nothing to verify.

Two things worth writing down, because they are the reason this drifted:

* the remote is `origin` -> `https://github.com/Fabulu/Mixup.git`, and the working
  branch is `main`, which is also the default branch. So the push is plain
  `git push origin main` with nothing to infer.
* `tools/publish.mjs` is a SEPARATE thing and must not be confused with this. It
  gates on the Batman suite being ALL GREEN with 0 skipped, builds `dist/`, and
  deploys to Cloudflare Pages -- pushing to GitHub does not publish the site and
  publishing does not push. D18 is about the git remote only.

### D19: record the DEPLOYED BUILD ID with every report

Not a game defect. A docket-keeping one, and it has already cost waves.

Every entry above records what the owner saw. **None records which build they saw it
on.** Three items this session -- D7, D8 and D16 -- turned out to be things that
already worked, and D17's symptom is `src/bee.js`'s header verbatim, describing the
report W111 fixed:

> The owner is playing the live build and the yellow 500-pt medals the carrier
> type-$8A drops are nowhere.

Meanwhile `git push` is not `tools/publish.mjs` (see D18), and nothing this session ran
the latter -- while the session took the sprite bundle from 4194 streams to 4244, added
seven ROM windows, and closed six docket items. So reports are being taken against a
build that is at best one session stale, and every measurement answering them is taken
against `main`.

The fix costs one line per report. The page already stamps a build id --
`games/ddpdoj/src/buildid.js` in a built tree, and `assets/manifest.json` carries
`buildId` -- so it can be read off the page being played. **Ask for it, write it beside
the symptom, and check it against `main` before spending a wave.**

A useful corollary: when a report cannot be reproduced on `main`, "publish and ask the
owner to look again" is a cheaper next step than a translation wave.

## Added 2026-08-11 from a third play session, on build 20260811171409

The owner played the DEPLOYED build, and D19 worked as intended: the report names the build
it came from, and that build was an hour old rather than a session stale. D17 is the
headline -- **the medals appear.** "First mid boss drops the first medals, awesome!" So
W284/W285's mechanism is confirmed IN PLAY and not merely under test, and D17 closes as
written. Everything below is new ground the sighting opened up.

### D20: FAR FEWER MEDALS SPAWN THAN THE REAL GAME

> "I remember this game having much more medals spawn. You might have to check a game on
> MAME."

D17 proved kind 1 allocates and appears. D20 is about the COUNT, which is a different claim
needing a different measurement.

**W324 DID THAT MEASUREMENT, READ-ONLY, AND IT CHANGES THE ITEM COMPLETELY.** Two facts from
the cartridge, both cheap to re-derive:

1. **`allocBee27F92A` has EXACTLY ONE CALLER IN THE WHOLE ROM.** `rosetta.py codexref
   0x27f92a` returns a single site: `$2767E6`, type `$8A`'s death arm. There is no second
   medal source. The general pool-A allocators `$27F8EE` (seven callers) and `$27F8F8` (four)
   are not one either -- every site that could be read passes `D0 = $8`, kind index 2, not
   the medal's `$04` or `$40`.
2. **EVERY STAGE HOLDS EXACTLY TEN TYPE-`$8A` RECORDS.** Walking all five spawn scripts on the
   8-byte stride:

       stage 1:  10 of 339      stage 4:  10 of 382
       stage 2:  10 of 332      stage 5:  10 of 770
       stage 3:  10 of 414      TOTAL:    50

   Ten per stage, in all five, with no exceptions. That is a designed constant, not a
   coincidence, and it is the classic ten hidden bees per stage.

**So the port's medal count is bounded at ten per stage BY THE CARTRIDGE**, and if all ten
carriers die the port is already right. The owner's "much more medals spawn" therefore cannot
be a missing medal source, because there is only one source and it is ported.

Which makes the next step a QUESTION rather than a wave: what the owner remembers is most
likely a DIFFERENT object. The candidates, and both are already in this docket:

* **the ITEM** (D23, W61's pool family six `$27E812`), which is a separate pool and a separate
  picture, and whose own web-gate witness is one item per 2400-frame window;
* the per-kill score popups or the chain counter, which read as "stuff flying off enemies".

**Ask before spending a wave.** Specifically: are the many medals the owner remembers coming
off ORDINARY ENEMIES as they die, or appearing from the scenery? If it is the former it is not
this pool at all. A MAME or video comparison is worth doing only after that question is
answered, because it decides which object to count.

### D20 CORRECTION: THE LEAD THIS ITEM WAS FILED WITH WAS ALREADY STALE

This item originally said "kind 16 (`$40`, the flying variant) still throws `Unreached
$280CEE` ... **start here**". That was drawn from W284's note and it is **wrong at HEAD**:

* `$280BCE[1]` and `$280BCE[16]` are BOTH `$280CEE`, and **W286 wired kind 16 through the same
  two instructions** -- `bee.js:791` accepts either kind;
* `allocBee27F92A` accepts both kinds by its own contract (`bee.js:315`);
* `$27F99E[1]` and `$27F99E[16]` are BOTH `$27FACC`, and the port has that body.

So kind 16 is fully served end to end, and the "leaked reserved slot" this item warned about
cannot happen. The stale comment at `bee.js:774` ("kind 16 would need its own -- but the flying
bee is REFUSED at the body") is the last trace of it and should be corrected when something
next touches that file. **The lesson is D19's again**: a note written when it was true outlives
the condition it described, and a docket item built on one inherits the staleness.

### D21: THE HUD IS MISSING A SMALL ELEMENT NEAR THE HYPER COUNTER

> "the hud at the top is still missing some kinda small element near the hyper counter."

D7 painted the hyper gauges (W271) and D16 made the level show when not hypering (W283), so
this is the residue of both. It is SMALL and NEAR the hyper counter, which is `src/hud.js`'s
territory.

**W324's recon eliminated the two easy explanations and produced a concrete list.** Not a
missing draw: every one of `hud.js`'s ~29 `DRAWS` entries has a real implementation, including
all the hyper-adjacent ones -- `$285FA6` the hyper label flash, `$286ED6`/`$286F3E` the hyper
STOCK icons, `$2859DC` the chain bar, `$2857B4` the item row. Each has a live body with an
`if (!rom)` fallback, so none is note-only. And not missing ART either: the descriptor sweep
reports 0 not-in-bundle over 900 frames, 4244 of 4244 streams.

**So the element belongs to one of the ELEVEN unported `$240F62` top-level objects.** The table,
read from the image (`addr`, `priority`, and whether `main.js` registers it):

     0 $28D520 $0009 yes    10 $260794 $001F yes
     1 $26127A $001A yes    11 $25DBB4 $000A yes
     2 $2491C0 $001C yes    12 $28F3AC $0009 NO   <- name entry (W305..W311's routines)
     3 $249246 $001B yes    13 $288A60 $000B NO   <- **$288xxx = the HUD/score family**
     4 $260B30 $0009 yes    14 $288C6C $0014 NO   <- **likewise**
     5 $28B5E0 $0018 yes    15 $291F66 $001E NO
     6 $28D63C $000A yes    16 $256E7A $001E NO
     7 $290BE8 $001E NO     17 $25CEB8 $000A NO
     8 $25A770 $000A NO     18 $24902A $000A NO
     9 $25CACA $000A NO     19 $28EE88 $001E NO

**AND THEN THE OBVIOUS CANDIDATES FAILED, WHICH IS WORTH RECORDING SO NOBODY REDOES IT.** 13 and
14 looked right on address family alone -- `$288xxx` is where every HUD table this port uses
lives (`$2881F2`, `$2883E6`, `$28840E`, `$287DF8`) -- and both open as object state machines on
`($2,A5)` at gameplay priorities. Scanning what they actually CALL says otherwise:

* **idx 14 `$288C6C` calls `$246710`**, which is `chainLoader246710`, ported in W303. It also
  calls `$246410`, `$24631C` and `$241182`. That is a STAGE-SEQUENCING object, not a decoration.
* **idx 13 `$288A60` calls `$27F8E6`** -- the bee cursor's own CLEAR -- plus `$25FD82`,
  `$25FE00` (four times), `$25FF38` and `$260A88`. `$25Fxxx`/`$2600xx` is the credit and
  continue family (`$260056` is named as the credit/continue entry in w228respawn's comment). So
  it is a GAME-STATE object that resets the medal cursor at a boundary, which incidentally
  supports the `$29023E` snapshot note in D23.

So the address-family reasoning was too eager and neither is the answer. **The remaining nine
would each need reading, and that is the expensive way to find a small sprite.**

**ASK FOR A SCREENSHOT. It is now unambiguously the cheapest next step** -- one picture with the
missing element marked, and which side of the hyper counter it sits on, replaces reading nine
objects. This item should not consume a wave before that arrives.

### D22: MEDALS MAKE NO SOUND WHEN COLLECTED

> "the medals don't make sounds when collecting."

A CUE and not a sprite, so a different subsystem from D20 and doable independently of it.

**W324 traced the whole chain read-only, and IT IS ALREADY COMPLETE.** So this is not "find the
site and post it" -- every link exists:

    bee.js:1326   ctx.soundPost?.(0x28c62a)     the bee-collect cue, at $27FC6C
    main.js:355   soundPost -> postWrapperWithRuntime(ram, sound, soundSink, addr)
    sound.js:109  0x28C62A: { id: 0x1F, pan: 0xFF, ch: 0x01, entry: 0x28C02A }

The call is made, the wiring routes it to the real runtime, and the wrapper is a known table
entry with an id, a pan and a channel. **So the defect is downstream of all three and this item
needs a MEASUREMENT, not a transcription.** In order, cheapest first:

1. Does `$27FC6C` actually execute when a medal is collected? W285 already has the scenario
   that puts a live medal on screen, so this is a test, not a wave: collect one and assert a
   cue was posted.
2. Does `postWrapperWithRuntime` RETURN TRUE there, or does a gate inside `sound.js` drop it?
   It returns a boolean precisely so a caller can tell; nothing currently checks it.
3. Is id `$1F` on channel 1 audible in the deployed build -- is the sample present in the
   shipped sound assets, and does something else on channel 1 stamp on it?

Note `bee.js:1326`'s own comment calls id `$1F` a **BGM** id, which is worth resolving in step
3: if `$1F` selects music rather than an effect, the cue may be posting correctly and doing
something inaudible, and the fix is a wrong-id fix rather than a missing-call one.

### D23: BIGGER MEDALS EXIST AND HAVE NOT BEEN SEEN

> "Some things also drop bigger medals, haven't seen these yet."

`src/hud.js` (W124) drains `$81B610` through the `$32/$64/$96` medal TIERS, so the port already
knows tiers exist. Two readings needed separating: a different KIND out of pool A, or the same
kind at a higher VALUE with a different picture.

**W324's read-only recon eliminates the first reading and sharpens the second.**

NOT a missing kind, in either pool:

* pool A: kinds 1 and 16 both dispatch to `$27FACC` and both are served (see the D20
  correction). There is no third medal kind.
* the ITEM pool: `runBody` covers **all eight** dispatch indices of `$27E9F8` --
  `$00` power-up, `$04` full power, `$08` set item, `$0C`/`$14` the hyper item for P1/P2,
  `$10` the counter, `[6]` the free and `[7]` the ROM's deliberate `rts`. `REFUSED_KINDS` is
  empty "after W163". Nothing is missing there either.

So it is the VALUE reading, and the ladder is measured and present:

    $27FD22, BASE_LADDER, TEN BCD longs indexed by the cursor $817F82 (byte offset 0,4,8,...):
        100  200  300  400  500  600  700  800  900  1000

Ten values for ten medals a stage -- the classic sequence, and it is already in `bee.js`.

**And W324 then answered the one open question: the PICTURE does NOT change with the cursor.**
`rosetta.py sites 0x817f82 --list` gives Build B **four** sites and no more:

    $27F8E6   clr    -- the reset
    $27FBEE   read   -- the value lookup, BASE_LADDER  (bee.js has it)
    $27FC0C   addq #4 -- the ratchet                    (bee.js has it)
    $29023E   read   -- NOT a sprite lookup: it gathers the cursor alongside $812940 (bombs),
                        $81B49A and $812938, which is the shape of a SNAPSHOT

**Nothing indexes a sprite by the cursor.** `bee.js`'s `BEE_TEMPLATE` is one 22-byte template
with one descriptor (`$001BCA34` at +$0A), and that is all this build has. So a per-value sprite
swap is not missing, because it does not exist: the medal keeps one picture and only the SCORE
climbs, 100 to 1000.

**This item is therefore a closure candidate rather than a wave.** Put it to the owner in those
terms: in this build the medal looks the same every time and is worth more each time. If what
they remember as a "bigger medal" is a different SIZE of sprite, it belongs to another object
(the item pool, D20's question) and this item should be reworded to point there.

One by-product worth its own line: **`$29023E` is unported**, and it collects the bee cursor,
the bomb count and two other counters together. That is the shape of a state snapshot taken at a
boundary -- worth a look while doing D25 (the transition) rather than as its own errand.

### D24: THE HYPER LASER HAS NO IMPACT SPRITES AT ALL

> "Hyper when it hits just cuts off, it's missing all the hit sprites. Might be similar to
> laser. Err, I mean the laser hyper, not the normal hyper bullets, though those feel a bit
> off."

**The owner's own diagnosis is almost certainly right, and it names the family.** W90 is
`THE LASER'S IMPACT EFFECT`: `$289FC0`/`$289FDA` into pool E, template `$28A506`, list
`$28A51C`, 36 streams, still asserted by the web gate (17385 records over 35 distinct
images, ADJACENT-FRAME entries 0). "It just cuts off" is precisely what the beam looked like
BEFORE W90, and the gate's own `--break drop-impact-art` mutation reproduces it exactly:
"the records were always right and there was no picture at the end of them".

So: find the HYPER laser's analogue of `$289FC0`/`$28A51C`. That is a family lookup, not an
investigation, and W90's worklog is the template for the whole wave. **Highest-value item on
this list**: a big visible break, localised by the owner, and the port has already solved
the same problem once.

The second half -- "the normal hyper bullets feel a bit off" -- is a SEPARATE and much
vaguer item. Do not bundle it. Ask what "off" means (speed? density? colour? angle?) or
compare against the oracle once D24 proper is done.

### D25: THE SCENE TRANSITION MAY CUT EARLY

> "Scene transition looks fucking awesome now but it feels like it cuts early? Might check
> that with oracle."

D11's successor, and again the owner names the right tool. D11 was "the stage transition is
abrupt", diagnosed with its first piece landed in W232; W276 and the tally/stage-clear waves
built the rest, including `chainLoader246710` and `chainLoader246704`. So the sequence now
RUNS and the open question is its LENGTH -- a frame count, exactly what an oracle trace can
settle and eyeballing cannot. Trace the board from the stage-clear trigger to the first
frame of the next stage, count frames, compare with the port. A "cuts early" symptom with a
real sequence behind it is usually one loop terminator read a frame short or one chain
loader's count off by one, and `stageend.js` has three chain loaders now.

### D26: THE SECOND SHIP AND THE OTHER TWO PILOTS

> "you do know there's 1 more player ship and 2 more pilots, right? Those will be a
> significant job with all these sprites, particularly since we still seem to be missing
> stuff for this pilot ship combo alone."

Recorded because the owner is right on all three counts, and this belongs in the plan rather
than arriving as a surprise: there is another ship, there are two more pilots, it is a large
sprite job, and **the current combination is not finished yet** -- which is the argument for
sequencing it after the current one is clean, not for skipping it.

This is a PLANNING item, not a next wave. The honest position: the goal is one credit from
stage 1 to stage 5 with no Unreached, for the ship the port flies today. Other ship/pilot
combinations multiply the ART and the per-combination tables, and every item above
(D20..D24) is a gap in the combination already flown. Finish those first, then scope D26
with a real census of what is per-combination and what is SHARED -- because if most of it is
shared, D26 is far smaller than it looks, and that census is the wave that finds out.

### D28: MODS, AFTER THE GAME IS DONE -- FLY BOTH SHIPS, THEN ALL THREE PILOTS

> "I think the first mod for this game I want is to play while flying all 3 ships side by
> side. We'll put that in after the game is actually done, not now."
> "sorry, there's only 2 ships. So both ships. And then another mod for all 3 pilots each
> piloting a ship."

So TWO mods, in this order:

* **D28a -- fly BOTH ships side by side.** Two simultaneous player-controlled ships.
* **D28b -- all THREE pilots, each piloting a ship.** Three simultaneous ships, one per pilot.

D28a needs a second player-controlled ship, which the two-sided machinery may nearly give
already. D28b needs a THIRD, which is where the pool sizing question below actually bites.

**The counts are the owner's from memory and are NOT yet a measurement.** D26's census settles
them from the ROM: how many ship entries the player tables really hold and how many pilots
index them. Take that number from the cartridge rather than from either party's recollection,
and if it disagrees with two-and-three, the census wins and this item gets corrected.

**Explicitly deferred by the owner. Do not start this before the game is finished.** Recorded
now so it is not lost and so the waves before it can avoid painting it into a corner.

It is a MOD and not a translation, which makes it the first item in this docket that is
allowed to depart from the ROM. That distinction matters: everything else here is "make the
port agree with the board", and this one is "make the port do something the board never did".
It therefore must not be built by loosening any ROM-fidelity rule -- it goes ON TOP of a
faithful port, not through it.

What the port would need, and why the ordering the owner chose is the right one:

* **D26 first, necessarily.** Flying every ship at once means every ship exists, which is
  D26's job (the second ship and the other two pilots). D28 is D26 plus a player count.
* The player machinery is already TWO-sided everywhere -- `$8103E6` and `$810448` are P1's
  and P2's records, `laser.js` carries a per-player beam block with `d7` picking the pool
  half, `targetSelect` walks both and `exg` decides which is tried first. So the port already
  thinks in terms of N players rather than one. A THIRD is not obviously a rewrite, but the
  pools are sized for two (`$811F32`/`$811F52`, the 32-slot-per-player segment pool), so the
  real question is which pools are per-player and which are shared.
* That question is the SAME census D26 needs. So when D26 scopes what is per-combination and
  what is shared, it should record the per-PLAYER answer at the same time -- one reading,
  two items served.

No wave should touch this until the goal is met. Its value here is as a constraint on the
waves before it: when a wave finds a two-element array or a `d7` that means "which player",
it costs nothing to write down whether the surrounding pool is sized 2 or sized N.

## Added 2026-08-11 (late) from a fourth play session, on build 20260811184328

### D29: THE RELEASE ITSELF WAS BROKEN -- FIXED (W327)

> "Die Website ist nicht erreichbar ... ERR_FAILED" ... "I think you really really need to fix
> release" ... "ctrl shift r somehow worked, it's back"

**The origin was serving 200 the whole time** -- checked from here, all three URLs including the
exact `/games/ddpdoj/index.html` that failed. The fault was `games/ddpdoj/sw.js`, which is scoped
to `/games/ddpdoj/` and so intercepts precisely that URL. Three defects, fixed in W327:

1. **A throw inside `respondWith` IS `ERR_FAILED`.** The shell's offline path ended in
   `throw new Error('offline')`, and a rejected `respondWith` makes the browser report the page as
   unreachable -- identical, to the person looking at it, to the site being down. One transient
   fetch failure (a phone handing over between cells) was enough.
2. **`caches.match` without `cacheName` searches EVERY cache on the origin**, so a cache-first
   shell could be answered out of the previous build before `activate` had deleted it.
3. **Cache-first on the NAVIGATION meant a deployed build was not picked up** until the old worker
   was replaced. That is why one device showed a stale page and the other failed outright.

Navigations are network-first now, sub-resources stay cache-first, nothing throws, and three tests
pin it. **Ctrl+Shift+R working is what confirmed the diagnosis**: a hard reload bypasses the worker.

### D30: STATIC ANALYSIS OF THE TRANSITION SCREEN -- ASKED FOR, AND IT IS ONE ROUTINE

> "Stage transition looks good but is busted. 0's, some pictures of medals. Must check vs real
> thing" ... "static analysis of transition screens please."

Done, and the answer is much tighter than the symptom suggests.

**The screen is `$240F62[11] = $25DBB4`, and its STATE 1 -- the actual tally -- is a counted note.**
`src/tallyscreen.js` registers the object and implements states 0 and 2; state 1 has never been
written. So the layout draws (which is the "looks good" and the medal pictures) and nothing fills
in the numbers, which is the zeros. `$25FF38` is named in that note as the routine that writes the
tally records at `$8130FA`, and it is **twelve bytes**: `lea $8130FA,A0`, `tst.w D0 / beq`,
`lea $81311E,A0` for the other side, `move.w D1,(A0)`. The zeros are not a hard routine; state 1
simply does not run.

**Every call state 1 makes, enumerated by scanning `$25DBC4..$25E100` for `jsr abs.l`:**

    $23C668  x1   PORTED (player.js)         $260A88  x4   PORTED (rank.js)
    $23C932  x2   PORTED (tallyscreen.js)    $260A9A  x1   PORTED (rank.js)
    $24150A  x1   PORTED (background.js)     $260ACA  x1   PORTED (rank.js)
    $25FF38  x1   the 12-byte writer above   $28C6E0  x2   PORTED (hiscorename.js)
    $28D53C  x3   PORTED (tallyscreen.js)    $28C6FA  x3   PORTED (hiscorename.js)
    $24018C  x9   **THE ONLY MISSING ONE**

Nine of the ten were immediately recognisable as ported. The tenth, `$24018C`, is called NINE
times -- more than anything else in the arm -- and the first pass of this analysis reported it as
**the one missing routine**.

### D30 CORRECTION: `$24018C` IS ALSO ALREADY PORTED, SO STATE 1 NEEDS **NO NEW PRIMITIVE AT ALL**

Reading it to its `rts` instead of stopping at its first two instructions:

    24018c  move.l A0,-(A7) / move.l D0,-(A7)
    240190  lea $80AD14,A0 / adda.w $80AFEE,A0     the buffer+counter pair
    24019c  addi.w #$C,$80AFEE                     bump by ONE 12-byte record
    2401a4  D0 = D1 ; asr.l #6 ; andi.l #$07FF03FF ; ori.l #$80008000
    2401b4  (A0)+ = D0.l ; (A0)+ = D2.l ; (A0)+ = D3.w ; (A0)+ = D4.w
    2401bc  restore D0/A0 ; rts

**That is `spritequeue.js`'s `enqueueRegisters(ram, bucket, d1, d2, d3, d4)`, instruction for
instruction**, and its constants are already exported under the same values:
`ENQUEUE_MASK = 0x07ff03ff`, `NO_ZOOM_OR = 0x80008000`, `RECORD_BYTES = 12`. The port transcribed
the routine from `$23EFC6..$23EFEA`; `$24018C` is the SAME routine at a second address. And
`BUCKETS[26]` resolves to exactly this pair -- verified at runtime: buffer `$80AD14`, counter
`$80AFEE`, capBytes 120.

So every one of state 1's nine emit sites is **`enqueueRegisters(ram, 26, d1, d2, d3, d4)`**.

**This is the `$24226E` trap for the third time this session**, and in the same shape: a routine
that exists in the port under a DIFFERENT address's name, so searching for the address finds
nothing. The lesson that keeps not being applied: **before calling a routine unported, read it to
its `rts` and compare its BODY against what the port already has** -- an address search is not
enough, and neither is reading its first two instructions.

**So the wave is: `$25FF38` (twelve bytes) and state 1's arm, wired to `enqueueRegisters` on bucket
26.** No new primitive whatsoever. That is a materially smaller wave than the first pass of this
analysis claimed, which is the whole reason to do the static analysis before the wave.

### D30, STATE 1's SHAPE -- READ THIS BEFORE WRITING IT, IT IS TWO SCREENS AND NOT ONE

`$25DBC4..$25DC2A` is a GATE CASCADE ending in three mutually exclusive announce calls, all of
which take `D0 = ($7,A5)` and all three of which are ported in `rank.js`:

    25dbc4  jsr $28D53C / bcs                  -> $25DC20
    25dbce  tst.b ($C,A5) / bne                -> $25DC2C, the body
    25dbd6  tst.w $813098 / beq                -> skip the stage test
    25dbe0  cmpi.w #$4,$813092 / beq           -> $25DC20   (stage index 4 = STAGE 5)
    25dbec  jsr $23C932 / tst.w D0 / bne       -> $25DC12
    25dbf8  cmpi.b #$0,$803808 / bne           -> $25DC2C
    25dc04  D0 = ($7,A5) ; jsr $260ACA ; -> body
    25dc12  D0 = ($7,A5) ; jsr $260A88 ; -> body
    25dc20  D0 = ($7,A5) ; jsr $260A9A ; **rts** -- the ONLY early return

Then `$25DC2C` takes `A4 = ($8,A5)`, THE DESCRIPTOR, and calls through **`($4,A4)`** -- the
descriptor's first code pointer, which `tallyscreen.js` already documents as one of
`$23D17E`/`$23D18E`/`$23C9F0` and for which `readInput23D186` is the ported helper. It then tests
`btst #$F,D0`.

**So state 1 is TWO things sharing one state byte**, and the old note said so without the addresses:
a SELECTION SCREEN driven by the descriptor's input pointers (`$25DD0C` onward, with the
`($E,A5)` cursor on D0 bits 2 and 3 and a `$28C6FA` cue), and the TALLY drawing, whose emit sites
are the later ones at `$25DF72`, `$25DFBA` and `$25DFE8`. **The owner's zeros are the tally half.**

Two consequences for whoever writes it:

* **The tally half can be done WITHOUT the cursor half.** The nine `enqueueRegisters` sites and
  `$25FF38` are what put numbers on the screen; the cursor is what lets a player choose something
  on it. Splitting them is legitimate and it gets the visible defect fixed first.
* `$813092 == 4` is tested TWICE in the cascade and it is the STAGE index, so stage 5 takes a
  different path through the screen than stages 1..4 do. Any test of this screen has to say which
  stage it is standing in.

#### W328..W330 LANDED THE WHOLE INTERACTIVE DRAW. WHAT IS LEFT IS THE VALUE ROWS.

`$25DD0C` is **complete** -- it ends at `$25DE66 moveq #$0,D0 / rts` and `$25DE6A` onward is text
data. Ported and pinned by twelve tests: the gate cascade, the per-side header, both per-side label
pairs, the cursor's input/clamp/store/confirm, and the four-phase blinking highlight. Four records
into bucket 26's ten.

**The three remaining emit sites (`$25DF72`, `$25DFBA`, `$25DFE8`) are in a DIFFERENT routine:
`$25DEAE`.** And `$25DEAE` is not what the old note implied either --

    25deae  moveq #$0,D7 / move.b ($F,A5),D7      the SAME two instructions as $25DA94
    25deb4  bsr $25DAEA                            the same "is the other player here?" check
    25debc  subq.b #1,D7 / bge / else D7 = 2       **DOWNWARD**, wrapping at 2

`$25DA94` walks the same three entries **UPWARD** (`addq.b`, limit 2, wrap to 0). So the pair is the
**Y cursor's up and down halves** over `SCREEN11.yEntries = 3`, not two unrelated routines.

**AND `$25DEAE` IS THE Y CURSOR, STRUCTURALLY PARALLEL TO `$25DD0C`'s X CURSOR.** Its tail:

    25deca  movea.l ($8,A4),A0 / jsr (A0)     the SAME edge read $25DD0C uses
    25ded0  moveq #$0,D7 / move.b ($F,A5),D7  the Y cursor ($F,A5), where $25DD0C took ($E,A5)
    25ded6  move.w D7,D6                      saved, so the picker can be retried
    25ded8  btst #$2,D0 / beq $25DEF6         the SAME bit 2 / bit 3 pair

So **the screen has TWO cursors and they are the same routine twice**, over `xEntries: 2` and
`yEntries: 3` -- which is why `SCREEN11` has carried both counts since W276 and why the clamp
differs (`andi.b #$1` for two entries, the `$25DA94`/`$25DEAE` picker for three, because three is
not a power of two and cannot be masked).

That is the shape to port next: `$25DEAE` mirrors `tallyCursor25DD0C`, with the picker in place of
the mask, and the value rows at its tail are the three remaining emit sites.

**AND TWO OF THE FIVE "MISSING" ROUTINES BELONG TO THE CURSOR HALF, NOT THE TALLY.** `$25DA94` is

    25da94  moveq #$0,D7 / move.b ($F,A5),D7
    25da9a  bsr $25DAEA          <- and `tallyscreen.js` ALREADY documents $25DAEA:
                                    "IS THE OTHER PLAYER ALREADY ON THIS ENTRY?"
    25da9e  bcc -> done ; else addq.b #1,D7 ; cmpi.b #$2,D7 / ble -> loop ; else D7 = 0

i.e. a walk over up to THREE entries looking for one the other player is not on, wrapping to 0.
`$25DEAE` opens with the same two instructions, so the pair is the selection screen's
entry-picker. **Neither is a digit formatter**, which is what the zeros needed.

So the tally half narrows further: `$25FF38` writes the record at `$8130FA`/`$81311E` (called ONCE,
from `$25DCB4`), and the nine `enqueueRegisters` sites draw from it. `$25DA60`, `$25DA94`,
`$25DEAE` and `$25E0EA` can all be left to a later cursor wave. **That is the whole remaining
scope of the visible defect**, and it is small.

#### THE NINE EMIT SITES, EXTRACTED -- DO NOT RE-DERIVE THESE

Every site is `enqueueRegisters(ram, 26, D1, D2, D3, D4)` with D4 taken from the DESCRIPTOR's
`($14,A4)` (its palette) rather than an immediate. The immediates, pulled out of the image:

    site      D1 (position)   D2 (descriptor)   D3
    $25DD98   $5BC02C00       $00334300         $0630     the header
    $25DDBC   computed        $00334394         $0410  }
    $25DDD8   computed        $003343B8         $0410  }  FOUR labels, and the
    $25DDF8   computed        $003343DC         $0410  }  descriptors ascend by
    $25DE14   computed        $00334400         $0410  }  exactly $24
    $25DE60   computed        computed          $0618
    $25DF72   $5BC02600       $00334224         $0648
    $25DFBA   computed        computed          $0618
    $25DFE8   computed        $00334424         $0618

`$25DD86 move.l D1,D7` saves the header's position immediately after setting it, and the four label
sites then derive their own D1 -- so the row is laid out relative to the header rather than by nine
independent literals. That is the arithmetic the writing wave still has to read (the `computed`
column), and it is the ONLY thing left unread in the tally half.

**The four ascending-by-$24 descriptors are the labels the owner reported missing**, and the two
`$0618` sites with computed descriptors are the value rows -- which is consistent with the symptom:
labels absent, medal pictures present, numbers zero.

The five other routines the old note named are also now sized: `$25DA60` starts
`move.w $813084,D6`; `$25DA94` and `$25DEAE` **share their first two instructions**
(`moveq #$0,D7 / move.b ($F,A5),D7`) and so are probably a family of two; `$25DFF6` opens with a
`jsr $28D53C` that is ALREADY ported; `$25E0EA` is a two-instruction trampoline
(`lea ($25E006,PC),A0 / bra $25E200`).

**Compare against the real thing when it lands**, as the owner asks -- the oracle can count the
frames and read the drawn values, which is the only way to check a number is RIGHT rather than
merely present.

### D31: HYPER STILL HAS NO HIT ANIMATION -- W324 DID NOT FIX IT

> "hyper still has no hit animation" (tested on build 20260811184328, which carries W324)

**An honest negative result.** W324 wired `$289F96`, the beam-BODY effect, on the reasoning that it
was the one member of the `$28A506` template family still unported and that the owner's "similar to
laser" named that family. The frame-shift evidence (three pinned counts moving in the hyper
scenario) showed the new code really does run there. **It was not the missing hit animation.**

So D24 is reopened and the next attempt must not reuse that reasoning. What is now known:

* the effect family `$289F54`/`$289F96`/`$289FC0`/`$289FDA` is COMPLETE, so the gap is not there;
* the beam's own impact is suppressed during a bomb/hyper BY THE ROM -- `$25505E tst.w $81294C /
  bne` skips the spawn, verified in the listing, so that suppression is correct and not the bug;
* therefore the hyper laser's hit visual comes from somewhere the port has not looked. The
  candidate not yet examined is the HYPER's own object rather than the beam's: `src/hyper.js`
  contains no impact or effect code at all (`grep -i` finds nothing for impact/laser/`289F`).

**Start at `src/hyper.js` and the hyper object's draw, not at the beam.** And ask the owner for one
more discrimination first: does the hyper laser show its BEAM correctly and only lack the sparks
where it lands, or is the whole beam different?

### D32: AN INVISIBLE ENEMY IN STAGE 2, AND STARS/MEDALS ONLY FROM MIDBOSSES

> "First part of stage 2 to the left has an invisible enemy you can hit."
> "Nothing but mid bosses has stars and medals. There have to be a lot more."

Two reports, and the second sharpens D20 by adding STARS to it.

**The invisible enemy is the more tractable of the two** and is a NEW class of defect: a hittable
object with no sprite means the handler runs and the draw does not, which is the opposite of every
missing-art item so far (those had records with no art). Note `w230descriptorsweep.mjs` reports 0
not-in-bundle over 900 frames, so this is not a missing STREAM -- it is a draw that is not being
made, or is made into a bucket nothing renders. Stage 2's types are all ported (the census says
stages 1..4 have no missing handlers), so suspect a draw arm inside one of them, and get the
position: "first part, to the left" plus the scroll clock would name the record.

**On stars:** D20 measured that the medal has exactly ONE allocator caller in the whole ROM and
that every stage holds exactly ten type-`$8A` carriers. That measurement stands and it means
medals are bounded at ten a stage BY THE CARTRIDGE. "Nothing but midbosses has stars and medals"
is therefore consistent with the port being right about medals and wrong about something else --
and "stars" may be a different object entirely. **This is the question D20 already asks and it is
now worth answering before another wave**: are the stars the owner means dropping from ordinary
enemies as they die? If so they are not the bee pool and not the item pool's power-ups, and the
thing to find is what an ordinary enemy death emits that the port does not.

### D27: PUBLISH INTERMITTENTLY -- BUT NOT ON EVERY WAVE

> "Publish intermittently so you catch these mistakes, but not on every wave."

The standing instruction, refined. D19 said record the build id; D18 said push and not just
commit. This adds the CADENCE: publish often enough that reports land against something
recent, and not so often that a roughly 40-minute three-game gate run eats the session. A
batch of waves, suite green, then publish. W321 is why this matters in both directions --
the web gate is only ever run BY `tools/publish.mjs`, so not publishing lets the gate rot
until it blocks the publish that would have caught it.

### D27 REVISED (2026-08-12): PUBLISH EVERY FIVE WAVES, NOT EVERY WAVE

Owner: "don't publish after every checkpoint, let's say after every 5."

D27 originally said "intermittently -- but not on every wave", which was vague enough that recent
waves drifted back to publishing on nearly every one. The rule is now a number:

  * **publish after every FIFTH wave**, and
  * **regenerate assets first** whenever the run added ROM windows to `export-tables.py`
    (`export-web.mjs` THEN `publish.mjs`) -- otherwise the live site serves stale assets;
  * publish off-cadence only when a wave fixes something the owner reported and is waiting to test.

Publish log: W335 `20260812162556`, W340 `20260812173300`, W345 `20260812224307` (off-cadence, to
ship the D24/D31 hyper-laser fix the owner was waiting on), W350 `20260812234300`,
**W355 `20260813052740`**. **Next publish due after W360.**

W355's build is the first to carry types `$55` and `$46` -- the first new ported enemy types to reach the
live site since W345 -- plus the type-table cross-check suite (2440 -> 2453) and 447 ROM windows.

**W360's publish was DELIBERATELY SKIPPED, and the reason is this item's own wording.** The cadence came due
after W360, but W356-W360 added **no ROM windows** (still 447), **no ported handlers**, and **no fixes** -- they
were recon (`$1A`, `$4C`, `$B0` read and specced), tooling (`claimed.py`'s three summary fixes), and three
`ported: false` spec consts, which are inert frozen data with no behaviour. `rip/` is byte-identical to what
`20260813052740` already serves.

D27 says publishing too often "spends the owner's attention on builds that contain nothing they asked about".
**A build identical in behaviour to the live one is exactly that**, so the cadence is honoured by carrying it
rather than by shipping an empty deploy. **Next publish is due when the next handler lands** -- `handler1A`,
`handler4C` or `$B0` -- whichever comes first, and that build will carry something worth looking at.

**The cadence is a FLOOR on how often to publish, not a ritual**: five waves without a behavioural change means
no publish, and a behavioural change the owner is waiting on means publish off-cadence (as W345 did for the
D24/D31 laser fix).

**W363 `20260813062744` -- HIBACHI IS REGISTERED.** Published on that reading rather than on the count: W360's
skip was because nothing had changed behaviourally, and this build changes something. Stage 5 now has **TWO**
unported types over 5 records, down from four over 19 at the start of this session.

**What to look at in this build:** reaching stage 5's end should now produce a Hibachi that APPEARS and lets the
stage CLEAR, where before the driver had no handler for type `$B0`. **It will not attack or move** -- its body
`$2A6B94` is a `note()`. So the thing worth checking is whether the stage completes and the transition runs, not
whether the boss fights. If the stage does NOT clear, that is a real bug and the place to look is
`runStageAdvance242952`, not the boss.

**W365 `20260813065010` -- TYPE `$1A` IS PORTED.** Published on the behavioural-change reading again, and this one
is a real change rather than a registration: `$1A` is a **slewing twin-weapon turret** and it now fires.

**W370 `20260813164141` -- HIBACHI CAN SPAWN.** The cadence wave, and it carried a real behavioural change: the
stage-5 boss's init body `$2A42DC` landed, so `$B0` is no longer unspawnable and stage 5 can reach its end.
`export-web.mjs` ran BEFORE `publish.mjs` because W369 declared a new ROM window (`$2A443C+$1CA`), which is the
exact case where skipping it serves stale assets from the live site.

The wave before it is worth the log line too: `$1A` and `$B0` were BOTH unspawnable and nothing reported it. Their
specs kept `ported: false` after their handlers landed, which made w346's registry tests skip them entirely, so
neither missing init body was ever checked. Three separate green tests were asserting a state that was not true.

**Stage 5 is down to ONE unported type over ONE record** (`$4C`), from FOUR types over 19 records at the start of
this session.

**What to look at in this build:** stage 5's `$1A` records -- four of them -- should now aim, TURN TOWARD the player
rather than snapping, and fire two weapons on separate timers: a seven-shot symmetric fan with randomised shot
speed, and a twin-muzzle burst whose two muzzles aim independently and can target DIFFERENT players in two-player
play. Its rank sensitivity is real: at high rank the fan slows and the muzzles speed up. **The one thing it will not
do is the pool-C death burst** -- that is deferred through `noteEffect` exactly as type `$88` ships it, so the
explosion is the shared one and not `$1A`'s specific flourish.

Next publish due when `handler4C` lands, or on the fifth wave after W365 if a behavioural change arrives sooner.

**PUBLISH IS DUE AT W375, AND `export-web.mjs` IS MANDATORY THIS TIME.** Last publish was W370
(`20260813164141`); five waves later is W375. **W374 took the ROM window count from 498 to 531 --
THIRTY-THREE new windows**, verified by counting `rip/port/player.tables.json`'s `rom.windows`. That
is precisely the case the standing rule exists for:

    node games/ddpdoj/tools/export-web.mjs      FIRST, from the repo root
    node tools/publish.mjs --only ddpdoj        only then

Skipping the first step serves a live page reading stale assets, and a missing window shows up as a
broken page rather than as a failing test. **A mid-wave handoff note recorded "31 new windows"; the
count at the end of the wave is 33.** Take the number from the file, not from a note.

**What to look at in the W375 build:** the two-player character-select screen. It is the first build
where any front-end slot is reachable from the object driver at all -- W374 registered slots 7, 9,
13, 15 and 17 and W375 registered 14, and until then they were correct code nothing could call. Two
real defects also land in it: the select screen used to draw **only on the single frame a button was
pressed** (`confirmAndDraw` modelled a `beq` that lands INSIDE the draw block as an early `return`),
and type `$1B`'s four-corner death rows used to **collapse from a box to a segment** (an
`offset & 0xffff` in `bee.js` dropped the high word).

**W351 correction to this item: the tool name here was WRONG and cost a detour.** The step is
`node games/ddpdoj/tools/export-web.mjs` from the REPO ROOT -- there is no `tools/export-web.mjs`,
and `ls tools/*.mjs` run from inside `games/ddpdoj` resolves against the root, so it looks convincingly
absent. W350 regenerated 443 windows into the bundle (11687.4 KiB, 661.1 KiB before the first frame)
and then published, so the live build is no longer serving the 442-window tables.

Why the cadence matters in both directions: publishing too rarely is what let the web gate rot for
eleven waves and then block the publish that would have caught it (W321), and publishing too often
spends the owner's attention on builds that contain nothing they asked about. Five is the owner's
number, not a derived one.

### D24/D31 ROOT CAUSE FOUND (W342): `$81308C` IS A LIVE-PLAYER COUNT THE PORT NEVER COMPUTES

The owner reported "hyper still has no hit animation" three times, and W324 tried and failed to fix it by
working on the beam. **The cause is not in the hyper code at all.**

`shots.js`'s `hyperShotHit` already spawns the impact spark, and correctly:

    if (ram.u16(SPAWN.gate308c) !== 0) spawnSpark(ram, rom, ctx, rec, prec);

That polarity is right -- the ROM's hyper-hit sites (`$254012`, `$25416E`, `$2542B2`, `$2543DC`, `$254506`)
all read `4A79 0081308C` then **`6708`**, a `beq` that SKIPS the spawn when the gate is ZERO. So non-zero
means spawn, which is what the port has.

**BUT NOTHING IN THE PORT EVER MAKES IT NON-ZERO.** A `setU16` search over `src/` finds no writer at all, and
the ROM has exactly THREE, all in one routine:

    25fda0  clr.w $81308C
    25fdae  addq.w #1,$81308C        if ($18,$8130FA) -- P1's record -- is non-zero
    25fdbc  addq.w #1,$81308C        if ($18,$81311E) -- P2's record -- is non-zero

**`$81308C` IS A COUNT OF LIVE PLAYERS**, recomputed each frame by `$25FD94` (three callers: `$26005C`,
`$2601E4`, `$2602B0`). `$8130FA` and `$81311E` are the two player records. So the gate means "at least one
player is present", and every effect behind it is suppressed in the port because the count is permanently 0.

**THIS IS NOT HYPER-SPECIFIC. `$81308C` HAS 53 READ SITES.** `damage.js` alone tests it at six places
(`$245036`, `$245162`, `$24522E`, `$2452DE`, `$2454CC`, `$2455DE`, `$28B670`). Some of those use `bne` rather
than `beq`, so they take the OPPOSITE branch -- meaning a permanently-zero gate does not merely disable
effects, it makes roughly half of those 53 sites take the wrong path. **Any other "missing effect" report may
share this cause**, which would include D32's "nothing but mid bosses has stars and medals".

**THE FIX IS SMALL AND ITS SHAPE IS KNOWN:** port `$25FD94`'s player count (clear, then two conditional
increments off `($18,A2)`/`($18,A3)`) and call it from wherever the port models `$26005C`/`$2601E4`/`$2602B0`.
Both player-record bases are already constants elsewhere in the port. **Do this before anything else in
stage 5** -- it is one routine and it may close three docket items at once.

W324's failure is now explained: it looked for a missing spawn in the beam code, and the spawn was already
there behind a gate nobody had written to. **A `note` would have caught this; a silent gate did not.** Worth
remembering as a rule -- when an effect is "missing" and the spawn call exists, check what writes its gate
before reading the spawn again.

### D24/D31 CORRECTION (W342): THE PREVIOUS ENTRY IS WRONG. `$81308C` IS `players - 1`, AND 0 IS CORRECT.

**Retract the entry above.** I called `$81308C` a live-player COUNT and concluded the port never sets it, so
the hyper spark was suppressed. Reading nine bytes further would have stopped me:

    25fda0  clr.w $81308C
    25fdae  addq.w #1,$81308C        P1 present
    25fdbc  addq.w #1,$81308C        P2 present
    25fdc2  subq.w #1,$81308C        <-- **AND THEN IT SUBTRACTS ONE**
    25fdc8  move.w $81308C,$81308E

So it is `players - 1`, an INDEX and not a count:

    0 players -> $FFFF     hyper-hit `beq` TAKES the spawn
    1 player  -> $0000     hyper-hit `beq` SKIPS the spawn     <-- the normal case
    2 players -> $0001     hyper-hit `beq` TAKES the spawn

**So a zero gate in one-player play is CORRECT BEHAVIOUR, and the port's permanent zero matches it.** The
`moveq #$14,D0 / jsr $28xxxx` behind those five `beq`s is a TWO-PLAYER (or no-player) effect, not the
single-player hyper impact. Nothing here is broken and **the "fix" I proposed would have added an effect the
board does not show in one-player play.**

**D24/D31 REMAINS OPEN AND ITS CAUSE IS STILL UNKNOWN.** What this rules out is worth keeping: the
`$81308C`-gated spawn at `$254012`/`$25416E`/`$2542B2`/`$2543DC`/`$254506` is not it, and `hyperShotHit`'s
`spawnSpark` is correctly gated. Look instead at `hyperShotHit`'s OTHER work -- it loads four fields from
`tables.hit + ($1E,rec)` (`drawOff`, `dlWord4`, `animPtr`, `anim2`) and then calls `hyperShotLaterHit`, which
is what actually animates. **Check whether `tables.hit` is populated for the hyper shot's `tableIdx`**, and
whether the ROM windows cover the rows it reads: a table that reads as zeros gives exactly the reported
symptom -- the shot stops dead with no impact frames -- and would not throw.

**AND THE PROCESS LESSON, WHICH IS THE THIRD TIME TODAY IN THIS EXACT SHAPE.** I wrote a confident root-cause
entry into the DOCKET -- a document the next agent acts on -- from a reading that stopped nine bytes short of
an instruction that inverted it. The three earlier instances were `$246520` ("fully scoped" twice, then read
to its rts, each time missing a span), `$4B` (predicted mark-and-fall-through from its sibling), and
`$2417DE` (two opposite wrong conclusions from one bad grep). **Displaying every byte from entry to `rts`
before writing a conclusion is not optional, and it is least optional when the conclusion is about to be
written somewhere actionable.**

### D24/D31 (W342): SECOND LEAD ALSO RULED OUT, AND A THIRD THAT FITS THE SYMPTOM EXACTLY

The correction above suggested `tables.hit` might be unpopulated or unwindowed. **Checked against
`player.tables.json`'s 440 windows: all four hit tables ARE covered.**

    p1   hit $24ED4E   covered by $24EC72 + $22E   (W188)
    p2   hit $24F4AE   covered by $24F400 + $C00
    pod0 hit $2519E0   covered by $2519E0 + $AA    (W188)
    pod1 hit $2525D6   covered by $2525D6 + $AA    (W188)

So the impact rows are readable and that is not the cause either. **Two leads ruled out; both were mine and
both were plausible.**

**THE THIRD LEAD FITS THE REPORTED SYMPTOM EXACTLY AND IS IN `hyperShotLaterHit`:**

    function hyperShotLaterHit(ram, rom, rec) {
      const n = subqBorrow(ram.u16(rec + S.animIdx), 4);
      ram.setU16(rec + S.animIdx, n.v);
      if (n.borrow) { ram.setU16(rec, 0); return; }      <-- KILLS THE RECORD
      ...
    }

`hyperShotHit` calls it as its LAST act, and **nothing in `hyperShotHit` seeds `S.animIdx`** -- it loads
`drawOff`, `dlWord4`, `animPtr` and `anim2` from the hit table and then falls straight into the decrement. So
**if `animIdx` is 0 or 1..3 when the shot hits, the very first `subqBorrow(_, 4)` borrows and the record is
zeroed on the same frame** -- the shot vanishes with no impact frames drawn, which is precisely
"hyper when it hits just cuts off, it's missing all the hit sprites".

**WHAT TO MEASURE (do this before changing anything):** read `$25413A`/`$25427E` to their ends and find
whether the ROM writes the anim index on the hit path. If it does and the port omits it, that is the defect and
the fix is one `setU16`. If it does NOT, then the ROM relies on `animIdx` holding a live value from the shot's
flight, and the question becomes what the port leaves there instead.

**Note the shape of this hunt, because it is the useful part.** The spawn call exists, the gate is correct, the
table is windowed -- three things that all had to be checked and none of which was wrong. The remaining
candidate is an UNSEEDED FIELD, which no `note` or `unreached` would ever flag because reading zero from RAM is
legal. **Missing-effect bugs in this port are more likely to be unseeded state than missing code**, and that is
worth trying first next time.

### D24/D31 (W342): THE PORT MATCHES THE ROM ON THE HIT PATH. THE CHASE NARROWS TO ONE SPAN.

Third lead examined. `animIdx` is NOT unseeded -- `shots.js:153` copies it from the player record's `+$44` at
`$24A254`, and `shots.js:161-166` cycles that field. But the port's own comment records the cycle as
**`($44,A6) cycles 4,0,4,0`** (`$24A32E`), so a hyper shot inherits `animIdx` of 4 or 0. On hit,
`subqBorrow(animIdx, 4)` therefore gives:

    animIdx 4  ->  0, no borrow  ->  ONE impact frame, then the next frame borrows and kills the record
    animIdx 0  ->  borrow        ->  ZERO impact frames, record zeroed the same frame

**So the impact is at most one frame, and half the time none.** That matches the report.

**BUT THE PORT MATCHES THE ROM HERE, INSTRUCTION FOR INSTRUCTION.** `$25419A..$2541B4`:

    25419a  move.w ($26,A6),D0                  tableIdx
    25419e  lea $24ED4E,A0 / movea.l (A0,D0.w),A0
    2541a8  move.l (A0)+,($6,A6)                drawOff
    2541ac  move.w (A0)+,($E,A6)                dlWord4
    2541b0  move.l (A0)+,($1E,A6)               animPtr
    2541b4  move.l (A0)+,($22,A6)               anim2

Four loads, exactly what `hyperShotHit` does -- and **NO write to `($24,A6)` anywhere in that span.**

**SO THE REMAINING QUESTION IS ONE SPAN WIDE:** display `$2541B8..$2541E0`. If a `move.w #imm,($24,A6)` (or
`($24,A6)` write of any kind) appears there, the port omits it and that omission IS the defect -- a one-line
fix. **If nothing writes it, the shot's own impact animation is genuinely one frame by design**, and what the
owner remembers as "hit sprites" must be a SEPARATE spawned effect object, not the shot's own frames. In that
case stop looking in `shots.js` entirely and find what the ROM spawns on a hyper kill.

**Do not change anything until that span is displayed.** Three leads in this item have now been proposed and
retracted or ruled out by me -- the `$81308C` gate, the unwindowed table, and the unseeded field -- and each
retraction came from acting on a reading that stopped one span short. The span is twenty bytes.

### D24/D31 RESOLVED AS A MISDIRECTION (W342): `shots.js` IS CORRECT. THE REPORT IS ABOUT THE **LASER** HYPER.

The decisive span, displayed:

    2541b8  6000 ff86     bra $254140        <-- straight back to the later-hit decrement

**There is no `($24,A6)` write anywhere on the ROM's first-hit path.** So the port matches the ROM exactly,
the shot's own impact animation really is one frame at most by design, and **`hyperShotHit` has no defect.**

Worse for my four leads: in ONE-PLAYER play the ROM's hyper-bullet hit does only this -- advance the position,
quarter the velocity, post `$28C714`, load four draw fields, decrement the anim index. **It spawns no impact
effect at all**, because the `$81308C`-gated spawn is two-player-only. That is the board's behaviour.

**AND THAT IS WHY THE CHASE WAS WRONG FROM THE START.** The owner's report says, verbatim:

> "Hyper when it hits just cuts off, it's missing all the hit sprites. Might be similar to laser.
> **Err, I mean the laser hyper, not the nomal hyper bullets**, though those feel a bit off."

They corrected themselves in the original message and I spent four leads in `shots.js`, which is the hyper
BULLET path. **The reported defect is the LASER hyper**, a different subsystem: `src/laser.js`, `$25485E`, and
`spawnBeamBody289F96` (W324's territory -- which is also why W324 "did not fix it": W324 worked on the beam
BODY, not its impact).

**WHERE TO ACTUALLY LOOK:** `laser.js`'s hit path and whatever the ROM spawns when the laser beam damages an
enemy. `$254848`-ish is the laser region (`$25484C` and `$2548A2` both test `$81308C` -- and note `$2548A2`
onward uses **`bne`**, the OPPOSITE polarity, so those sites fire in ONE-player play where the bullet sites do
not). **Start with the `bne`-gated sites at `$2548A2`, `$254964`, `$254A3E`, `$254B46`, `$254F16`, `$254FC4`**
-- six sites that are active in single player and are in the laser range.

**THE LESSON, AND IT IS NOT ABOUT THE ROM.** Four leads, three retractions, and the answer was in the owner's
original sentence. **Re-read the report before the code.** The self-correction "I mean the laser hyper" was
sitting in the docket entry for this item the whole time.

### D24/D31 (W342): THE FIRST `bne`-GATED LASER SITE IS A DRAW GATE, NOT AN IMPACT SPAWN

    2548a0  tst.w $81308C / bne $2548BA        one player -> NOT taken, falls through
    2548a8  moveq #$0,D2
    2548aa  tst.w ($1A,A6) / beq / moveq #$1,D2      D2 := 0 or 1
    2548b2  cmp.w $80390C,D2 / beq $2548C2           MATCH -> rts (draw nothing)
    2548ba  jmp $23F508                              MISMATCH -> emit

So this site is a **per-player draw gate**: it compares a record-derived 0/1 against `$80390C` and skips the
emit when they agree. **Not an impact effect**, so it is not the hit-sprite source either. One of the six
`bne` sites eliminated.

**REMAINING TO CHECK, and they are the whole of the live single-player laser gating:** `$254964`, `$254A3E`,
`$254B46`, `$254F16`, `$254FC4`. All five had the identical following bytes (`66 12 74 00 4a 6e 00 1a`) in the
W342 scan, which means **they are probably five copies of this same draw gate** -- the `74 00 4a 6e 00 1a` is
`moveq #$0,D2 / tst.w ($1A,A6)`, byte-identical to `$2548A8`. If so, all six are draw gates and NONE is the
impact spawn, and the laser's impact effect is somewhere else entirely.

**Check that byte-identity FIRST** -- it is one command and it either eliminates five sites at once or finds the
one that differs. This is the `$26FD0E`/`$26FEE6` technique from `$4C`: compare the bytes rather than reading
five routines.

**AND `$80390C` IS WORTH A GREP.** It sits two bytes from `$80390A` (the input word the dead conditional in
`$4C` subsystem 2 reads) and four from `$803914` (subsystem 3's live one). So `$803908..$803914` is an input or
per-player block, and knowing what `$80390C` holds decides whether these draw gates ever fire in one-player
play at all.

### D24/D31 (W343): THE LASER IMPACT IS GATED ON `$81308C`, WHICH THE TALLY SCREEN COMPUTES AND THE PORT NEVER WRITES

**All six `bne`-gated laser sites are byte-identical** (`$2548A0`, `$254962`, `$254A3C`, `$254B44`, `$254F14`,
`$254FC2`, `$24` bytes each, verified by comparison not by reading). All six are the per-player DRAW gate.
**None is the impact spawn.** One command eliminated five sites -- the `$26FD0E`/`$26FEE6` technique from `$4C`.

**THE IMPACT SPAWN IS `laser.js:1029`, AND ITS GATE IS THE PROBLEM:**

    if ((b.d7 ? phase : !phase) && ram.u16(0x81308c) !== 0 && ram.u16(b.sound2) === 0) {
      spawnBeamImpact289FC0(...)                                  // $255066 / $2550F0

The ROM agrees exactly -- `$255056 tst.w $81308C / beq $25506C` skips the `jsr $289FC0` when the gate is zero.
**So the port matches the ROM and the effect is correctly conditional. The question is the VALUE.**

**WHAT `$81308C` ACTUALLY IS -- three of my earlier readings were wrong, so here is the measured chain:**

    25fda0  clr.w $81308C
    25fdae  addq.w #1,$81308C     if ($18,$8130FA) is non-zero
    25fdbc  addq.w #1,$81308C     if ($18,$81311E) is non-zero
    25fdc2  subq.w #1,$81308C     <-- SUBTRACTS ONE, so it is a count MINUS ONE
    25fdc8  move.w $81308C,$81308E

`$8130FA` and `$81311E` are NOT the player records (`$8103E6`/`$810448`) and NOT the beam blocks
(`$811F32`/`$811F52`) -- **I checked both and both were wrong guesses.** They are reached only by `lea`, from
nine and seven sites, ALL inside `$25Fxxx`/`$260xxx` -- **the stage-clear / tally region.** And `$25FF38` is in
that reference list, which the port already carries as `tallyRequest25FF38` (W276/W328-W332).

**SO `$81308C` IS A TALLY-SCREEN QUANTITY, COMPUTED BY CODE THE PORT PARTLY HAS.** The three writers are all in
`$25FD82..$25FDF8`, called from `$26005C`, `$2601E4` and `$2602B0`. The port writes it nowhere, so it is
permanently 0, so `!== 0` is permanently false, so **the laser beam impact never spawns.** That is the owner's
D24/D31, and it is the LASER hyper as they originally said.

**THE NEXT STEP IS BOUNDED AND IN ALREADY-PORTED TERRITORY:** read `$25FD82..$25FDF8` and its three callers,
identify what `($18,$8130FA)`/`($18,$81311E)` hold, and port the count. `tallyscreen.js` already models
`$25FF38` in the same region, so the structures are probably within reach of code that exists.

**A CAUTION EARNED FOUR TIMES ON THIS ITEM:** do NOT simply force `$81308C` non-zero to make the effect appear.
Its `- 1` means one entry gives 0 and two give 1, so a wrong value changes ELEVEN other `$80390C`-paired sites
and roughly half of the 53 `$81308C` readers. **Port the computation, not the symptom.**

### D24/D31 (W343): `$81308C` IS "PLAYERS IN PLAY MINUS ONE", AND STATIC READING NOW SAYS THE EFFECT IS 2P-ONLY. **THIS NEEDS A TRACE.**

The two `bsr` targets around the counter identify it beyond doubt:

    25fd82  move.w #$1,$8130D2 / rts      SET the global freeze
    25fd8c  clr.w  $8130D2 / rts          CLEAR it
    25fd94  ... the count ...
    25fdd2  bsr $25FD8C                   clear the freeze
    25fdd4  cmpi.w #-$1,$81308E / bne     if the count-1 is -1, i.e. ZERO populated ...
    25fde0  bsr $25FD82                   ... FREEZE THE GAME

**So the routine freezes the game when neither structure is populated** -- that is the game-over/no-players
condition, which makes `$8130FA`/`$81311E` the two PLAYERS' in-play records (in the `$8130xx` game-state block,
not the `$8103E6`/`$810448` object records I checked first). `$81308C` is therefore **players in play, minus
one**: none = `$FFFF` (freeze), one = **0**, two = 1.

**WHICH MEANS STATIC READING SAYS THE LASER BEAM IMPACT IS TWO-PLAYER-ONLY**, on the cartridge as well as in
the port: `$255056 beq` skips `jsr $289FC0` whenever `$81308C` is 0, and in one-player play it IS 0.

**THAT CONTRADICTS THE OWNER'S REPORT, AND I AM NOT GOING TO RESOLVE IT BY READING.** Either
(a) `$81308C` is non-zero during 1P play for a reason the three writers do not show -- something else populates
the second structure, or the counter runs in a state I have not traced; or
(b) the effect genuinely is 2P-only and what the owner remembers is a different effect, or 2P footage.

**THE MEASUREMENT, AND IT IS CHEAP:** trace `$81308C` during one-player stage-1 play with the laser held.
`tools/oracle/` already exists and the value is one word. **One trace decides between a one-line port and a
closed docket item**, and after four wrong readings on this item by me, a trace is worth more than a fifth.

**WHAT IS ESTABLISHED AND SHOULD NOT BE RE-DERIVED:** the six laser draw gates are byte-identical and are not
the impact; `laser.js:1029` and the ROM agree exactly; `$81308C` is `players - 1`; its only three writers are
`$25FDA0`/`$25FDAE`/`$25FDBC` with the `subq` at `$25FDC2`; `$8130FA`/`$81311E` are the in-play records and
`$8130D2` (the freeze the whole port reads) is set from the same routine. **The port never writes `$81308C`,
and that is a real gap regardless of how the trace comes out** -- eleven `$80390C`-paired sites and about half
of the 53 readers depend on it, so porting `$25FD94` is worth doing on its own merits.

### D24/D31 (W343): THE CALL SITE IS THE **TALLY SCREEN**, NOT THE FRAME LOOP. MY WIRING PLAN WAS WRONG.

The previous entry said to "find `$25FD94`'s frame-loop call site". **It has none.** Its three callers
(`$26005C`, `$2601E4`, `$2602B0`) sit inside three of the **nine bonus-line routines** whose table
`tallyscreen.js:184` already documents:

    $25FF52's nine longwords: 0, $25FFA8, $260056, $26010E, $2601F4, $2602B6, $260348, $26035A, $26037C

and that docstring already says, in the port, **"None of the nine is ported and none is called from here."**

**AND `$8130FA`/`$81311E` ARE THE TALLY RECORD HEADS THE PORT ALREADY WRITES.** `tallyRequest25FF38(ram, d0,
d1)` posts `(request, state)` into `$8130FA` for side 0 and `$81311E` for side 1 -- **the same two structures
`$25FD94` counts.** It writes `+$0` and `+$2`; `$25FD94` reads `+$18`. Same records, different fields.

**SO THE WHOLE CHAIN IS:**

    stage clear -> tally screen -> one of nine bonus-line routines -> $25FD94 -> $81308C
                                                                              -> gameplay reads it
                                                                                 (53 sites, incl. the laser impact)

`$81308C` is computed on the RESULTS screen and PERSISTS into the next stage's play. That explains why the
laser impact could be present in some stages and not others on the real board, and it means **calling
`playerFlags25FD94` from a frame loop would be wrong** -- it would recompute a value the board sets once per
stage transition.

**THE FIX PATH, NOW CONCRETE:** port the bonus-line routines at `$260056`, `$2601F4` and `$2602B6` (the three
that call `$25FD94`) far enough to reach their `jsr`, and call `playerFlags25FD94` from there. `tallyscreen.js`
already has the mailbox poster and the table's address; the nine routines are the last unported piece of the
stage-clear screen, which W328-W332 built the rest of.

**A NOTE ON WHAT `+$18` IS.** `tallyRequest25FF38` only ever writes `+$0`/`+$2`, so whatever populates `+$18`
is in the unported nine. Until one of them is read, **do not assume `+$18` non-zero means "this side played"**
-- that inference is what produced four wrong readings on this item already. Read the routine that writes it.

### D24/D31 (W343): THE CHAIN, MEASURED END TO END, WITH ITS ONE REMAINING UNKNOWN

Everything below is displayed, not inferred. **Two links are now ported; the top of the chain is the gap.**

    ?                                          <-- UNKNOWN: $260580 / $2605A4 / $260788 have NO direct
                                                   callers, so they are reached through a table
      -> $26059E / $2605C2 / $2607A4              three `bsr`/`jsr` sites  -- UNPORTED
        -> $25FF7A  bonus-line dispatcher         **PORTED W343** (tallyBonusDispatch25FF7A)
          -> $25FF52[2] / [3] / [4]               three of ten bonus lines -- bodies UNPORTED (noted)
            -> $25FD94  the flag computation      **PORTED W343** (playerFlags25FD94)
              -> $81308C := 1 in one-player play
                -> laser.js:1029 spawns the beam impact   **ALREADY CORRECT IN THE PORT**

**So the two hardest links were the two that were missing, and both are now in.** What is left is the top:
whatever drives `$260580`/`$2605A4`/`$260788`. `codexref` finds no direct caller for any of the three, which
means a table selects them -- the same shape as `$25FF52` one level down, and as `$240F62[11]` selects the
stage-clear object itself.

**FINDING THAT TABLE IS THE WHOLE REMAINING TASK.** Search for absolute longwords `$00260580`, `$002605A4` and
`$00260788` in `$200000..$2B0000` the way W343 found `$25FF52`'s extent -- if two or three of them appear
consecutively at a fixed stride, that is the table, and its reader is the driver to port.

**AND IT PROBABLY CONVERGES WITH WORK ALREADY ON THE DOCKET.** The stage-clear screen's phases 0 and 2 and the
arm `$25DC2C..$25DD80` are unwritten (see the `$25DC2C` note in `tallyscreen.js` and the handoff). The bonus
sequence has to be driven from somewhere in that screen's flow, so **porting the transition screen's remaining
phases may deliver D24/D31 as a side effect** -- and vice versa. Two items, one blocker; do the transition
screen and check whether the laser impact appears.

**WHAT NOT TO DO:** do not call `tallyBonusDispatch25FF7A` from a frame loop or from state 1 speculatively to
"make it fire". Its three real callers are unported and unidentified, and inventing a call site would post
bonus requests at the wrong time -- which would corrupt the tally screen the owner already praised
("stage transition looks fucking awesome now") in exchange for an effect that may appear anyway once the real
driver lands.

### D24/D31 (W343): THE TABLE HYPOTHESIS IS DISPROVEN. THE REMAINING PATH **IS** THE TRANSITION-SCREEN WORK.

The previous entry said to find the table selecting `$260580`/`$2605A4`/`$260788`. **Done, and there is no such
table.** Searched two ways:

  * the three addresses as absolute longwords anywhere in `$200000..$2B0000`: **zero hits** for each, and zero
    for their `-2` variants too. So they are not table entries -- **and that also means my entry points were
    wrong**: I found them by scanning backwards for `$4E75`, which lands on an interior `rts`, not a routine
    start.
  * every longword in the image pointing into `$260400..$260900`: 172 hits, all in `$2276xx`, all sequential
    (`$260635`, `$260636`, `$260637`...). **That is palette/art data coincidentally in numeric range**, not
    pointers -- a good reminder that a value-range scan over a ROM finds art, and only a stride check tells the
    difference.

**SO THE DRIVERS ARE NOT TABLE-DISPATCHED, AND FINDING THEM BY SEARCHING IS THE WRONG METHOD.** They must be
reached by `bsr`/`jsr` from within the stage-clear screen's own flow, from a routine whose entry point is
further back than a naive `rts` scan finds.

**THE RIGHT METHOD IS FORWARD, NOT BACKWARD, AND IT IS ALREADY ON THE DOCKET.** Port the stage-clear screen's
remaining phases -- object [11]'s states 0 and 2 and the arm `$25DC2C..$25DD80` (see the `$25DC2C` note in
`tallyscreen.js`) -- and follow the calls forward. The bonus sequence is driven from inside that flow, so it
will appear as a `jsr` in code that gets transcribed anyway.

**THEREFORE: D24/D31 IS NO LONGER AN INDEPENDENT ITEM. IT IS A CONSEQUENCE OF THE TRANSITION-SCREEN WORK.**
Both halves of its own machinery are ported (`playerFlags25FD94`, `tallyBonusDispatch25FF7A`, W343) and the
laser spawn was already correct; only the driver is missing, and the driver is transition-screen code. **Do the
transition screen next and the laser impact should follow.** That is a better outcome than a fifth speculative
lead: the item went from "unknown cause, three failed attempts" to "one known dependency, already scheduled".

### D24/D31 **FIXED** (W345), AND FOUR EARLIER ENTRIES IN THIS ITEM ARE RETRACTED

**The cause was nine bytes missing from a routine the port already had.** `liveSides25FD94` (tally.js, W273/
W277) stopped at `$25FDC8`, leaving `$81308C` holding count-MINUS-ONE. The ROM continues:

    25fdd2  bsr $25FD8C                clear the $8130D2 pause UNCONDITIONALLY
    25fdd4  cmpi.w #-$1,$81308E / bne
    25fde0  bsr $25FD82                ... re-set it only when NO side is live
    25fde2  cmpi.w #$0,$81308C / bne $25FDF8
    25fdee  move.w #$1,$81308C         ONE live side  -> 1
    25fdf8  clr.w  $81308C             two, or none    -> 0

`laser.js:1029` gates the hyper beam's impact on `$81308C !== 0`, and the ROM agrees (`$255056 tst.w / beq`).
**In one-player play the truncated port left 0 there, so the impact never spawned.** The port's polarity was
correct throughout; the VALUE was wrong. `$81308E` keeps the count-1 for its own readers.

**RETRACTED FROM THIS ITEM'S EARLIER ENTRIES:**

1. **"`$81308C` is a live-player count and nothing writes it"** -- it is written, by `liveSides25FD94`, from a
   ported bonus line. What was missing was the tail, not the writer.
2. **"the effect is two-player-only"** -- that followed from reading only as far as the `subq`. The inversion
   nine bytes later says the opposite.
3. **"the ten bonus-line BODIES are unported"** -- **all nine are ported** (W289-W296, plus line 9 in
   `player.js`), and so is the `$25FF7A` driver. I built a duplicate dispatcher on this false premise.
4. **"the table has TEN entries, not the nine an earlier docstring recorded"** -- ten LONGWORDS, of which
   entry 0 is null, so NINE lines. The docstring was right and my correction of it was wrong.

**EIGHT DUPLICATE PORTS THIS SESSION, ALL MINE, ALL THE SAME MISTAKE:** `$2417DE`, `$28D53C`, `$260A20`,
`$260A88`, `$261100`, `$25FD94`, `$25FD82`/`$25FD8C`, `$25FF7A`. Every one already existed under a
role-based name (`applyVelocityA6`, `menuCarry28D53C`, `announceBox260A20`, `announcePost`,
`pushExternalSpeed`, `liveSides25FD94`, `bgPause25FD82`/`bgResume25FD8C`, the tally driver) and every one was
missed by grepping `0x<addr>` in lowercase. **`tools/claimed.py` (W344) exists to make that impossible; use it
before writing any routine.** Two of the eight were caught only by a runtime `ReferenceError` and one by
`claimed.py` itself reporting owners I did not expect.

**WHAT ACTUALLY DELIVERED THE FIX:** running `claimed.py` on `$2600D8` and reading the owner list. Nine
seconds of the tool I had built the wave before, after two waves of building around a subsystem that was
already there.

**STILL TO VERIFY:** the live build `20260812222642` carries the truncated value, so this needs a republish
before the owner can see the impact. And whether the effect now appears is a playtest question -- the gate
proves the code runs, not that the sprite is right.

## Added 2026-08-13 by the owner: the FRONT END, and the second game

These are scope the port has never had, as distinct from bugs in what it does have. The owner asked for
them in one message, and the ordering below is theirs where they gave one.

### D33: THE MAIN SCREEN

The title/attract front end. The port currently starts in gameplay; there is no title screen to arrive at,
sit on, or attract-loop out of. Nothing here is measured yet, and no ROM window is declared for it.

**Note the one thing already known**, because it is easy to lose: `$81308C` is "players in play minus one",
and `HUDRAM.attract` IS `$81308C`. W345 fixed `liveSides25FD94` to write it, and `laser.js:1029` reads it.
So the attract flag already exists and is already correct -- the main screen work must READ that, not
introduce a second notion of attract.

**W372 ALSO ANCHORED WHERE TO LOOK.** The main loop is `$23BFDC..$23C006` -- **SEVEN calls then `bra`** -- and the
port already maps all seven in `main.js`:

    $23BE8C  counters        $256D5A  call #1        $2410BC  the OBJECT DRIVER
    $24683E  call #3         $23D2AE  the SPRITE LIST BUILD
    $23C212  arm $803940 and spin        $23D12A  post-vblank edges

**So the front end is NOT a separate main-loop call.** Only two were unnamed, and neither is a scene dispatcher:
call #1 `$256D5A` reads `$C08004`/`$C08006`, which are **hardware I/O**, and call #3 `$24683E` is the animation-object
driver that `animobjects.js` already models.

### THE FRONT END IS COMPILED C, AND THE GAMEPLAY IS NOT (W372)

**The most consequential thing this project has learned about the docket.** Slot `[18]`'s state routines use `link`
stack frames, `pea` to push arguments, and `lea d(A7),A7` for CALLER cleanup -- the **C calling convention**. Type
`$4C`'s 666-byte enemy body has **ZERO** of all three. Measured, pinned, and not close: `$248492` alone has a `link`,
sixteen `pea`s and five caller-cleanups.

**So the front end and the gameplay are different KINDS of code**, and every technique this project has built was
developed against the hand-written half: register-by-register transcription, "read the callee's signature from its
definition", the aligned sweep's flow-break rule. **Screens will need their arguments read off the STACK**, and a
port that goes looking for them in registers will find them empty and conclude the routine takes none.

**Plan for it before starting D33/D34/D37, not during.** The reference module `tallyscreen.js` is hand-written
assembly and will NOT show this shape, so it is the right reference for the state-machine skeleton and the wrong one
for the routines inside.

### THE OBJECT DISPATCH TABLE IS THE DOCKET'S KEY (W372)

**Screens in this game are OBJECT DISPATCH ENTRIES.** `tallyscreen.js` opens *"OBJECT DISPATCH [11], `$25DBB4` -- THE
STAGE-CLEAR SCREEN"*. The table is at **`$240F62`**, twenty slots, stride 8, indexed by `(type & $FF)` -- bounded by
the driver's own `moveq #$13` and by slot 20 not being a code pointer.

**ELEVEN of the twenty are unreferenced anywhere in the port**, and D33, D34 and D37 are almost certainly among them:

    [ 7] $290BE8   [ 8] $25A770   [ 9] $25CACA   [12] $28F3AC   [13] $288A60   [14] $288C6C
    [15] $291F66   [16] $256E7A   [17] $25CEB8   [18] $24902A   [19] $28EE88

**SUPERSEDED W372..W375: SIX OF THE ELEVEN ARE PORTED, AND FIVE REMAIN.** The W372 list above is
kept because it is what the sweep found and it is still the right way to enumerate the table. What
has changed is the count:

    PORTED   [ 7] objslot7pool.js   [ 9] objslot9.js    [13] objslot13.js
             [14] objslot14.js      [15] objslot15.js   [17] objslot17.js

    LEFT     [ 8] $25A770   [12] $28F3AC   [16] $256E7A   [18] $24902A   [19] $28EE88

**AND THEY ARE NOW REGISTERED IN `src/main.js`, WHICH THEY WERE NOT.** Until W374 `defaultHandlers`
held only slots 0-6, 10 and 11, so **four waves of screen work was correct code the object driver
could not reach**; W374 added 7, 9, 13, 15 and 17 and W375 added 14. Derive the live list from
`main.js` rather than from any list in a document -- it moved twice in two waves.

`grep`ing for a handler address is NOT how to check this any more: each slot lives in its own
`objslot*.js` and the dispatch address appears there as prose. Check the file, then check the map.

**AND ALL ELEVEN ARE THE SAME SHAPE.** Every one opens `tst.b (d8,A5)` / `beq` then a `cmpi.b` cascade -- a state
machine on a byte in the object record, exactly what `tallyscreen.js` documents for slot [11] (*"$25DBB4 the
dispatcher, on ($2,A5)"*). **So the eleven are not eleven different problems.** They are one shape, and the machinery
`tallyscreen.js` already carries -- the cursor helpers D34 names, the descriptor reads, the state dispatch -- is the
right reference for all of them. Three open at the front slightly differently (`[16]` skips the `tst`, `[19]` does a
`lea` first), which is worth knowing before anyone calls the shape universal.

**FOUR SLOTS CARRY IDENTIFYING ANCHORS (W372) -- CANDIDATES, not conclusions.** Scanning each slot's first `$400`
bytes for known RAM separates them. An anchor says what a slot TOUCHES, not what it IS, so each must be confirmed by
reading it before these entries are updated:

    [18] $24902A   reads $81296E -- THE BOSS-CLEAR FLAG $242922 SETS -- plus both player records,
                   AND calls $23D186, which tallyscreen.js names "THE DESCRIPTOR'S INPUT READ", then
                   masks the result with $80F0 and branches: it WAITS FOR A PRESS. Three independent
                   signals, all pointing at D37 THE ENDINGS.

**BUT SLOT [18] ITSELF IS NOT SHORT, and I said otherwise before measuring.** It is a state sequence on `($4,A5)`:
state 0 waits for a press, then each state calls ONE routine and advances. The three are
**`$2475CA`, `$248492` and `$24842C`, and none is ported**. `$24842C` is 102 bytes with two callees;
**the other two run past 1 KB each before their first `rts`.** So D37 is "one slot away" only in the sense that the
slot is one file -- there is better than 2 KB of new porting inside it.

**The TEXT CHAIN, by contrast, IS short and is now DONE (W372):** `[18]` -> `$25A14C` (42 bytes) -> `$240CF0` (60 bytes), and that is the
depth. `$25A14C` is a **NUL-terminated string draw**: it walks bytes from `(A0)+` until zero and calls `$240CF0` per
glyph. **The trap is `swap D4 / move.w D5,D4`** -- the glyph goes in the HIGH word and a caller-supplied attribute in
the LOW, so passing a bare byte draws nothing. `$240CF0` writes LONGS into a table indexed by D5, stepping the tile
index by `$10000`: **a TILEMAP blit, so the ending screen is TEXT rather than sprites.** Neither is ported; both are
small.
    [ 9] $25CACA   both player records AND palette installs -- the shape D34 CHARACTER SELECT would have.
    [12] $28F3AC   reads the HISCORE table $803824, so it belongs to the hiscore family, not the front end.
    [13] $288A60   reads the LOOP and STAGE words -- stage progression rather than a screen.

**TWO MORE FELL OUT once W372 ported the text routines**, by scanning the seven for `$240CF0` and `$25A14C`:

    [17] $25CEB8   the STRING DRAW, PALETTE INSTALLS and input reads -- print, set up your own colours,
                   wait for a press. That is a TITLE SCREEN's shape, and it is D33's strongest candidate.
    [16] $256E7A   the BLOCK BLIT and three input reads -- and it sits exactly $120 past main-loop call
                   #1 `$256D5A`, which reads `$C08004`, THE SERVICE SWITCHES. A test/service menu is the
                   obvious reading, and it explains why [16] is the one slot opening with `cmpi.b`
                   instead of `tst.b`: no idle state to fall through.

**W373: SLOT [9] IS CONFIRMED AS D34, and most of its mechanism is ported.** It is a TWO-PLAYER CHARACTER
SELECT WITH MUTUAL EXCLUSION over three options:

* `$25D402` is the cursor. Bit 2 steps back, bit 3 forward, and each **loops again while the new value equals
  the other side's byte**, so a player steps OVER the other's pick rather than being blocked by it.
* `$25D306` seeds it: each side reads the OTHER side's byte, and `$25D2EA` returns the first entry that
  DIFFERS. The two order tables are MIRRORED (`0,1,2` and `2,1,0`) so the players scan from opposite ends.
* Confirm is two conditions -- a button in the `$70` mask, or `($30,A6)` set by a per-record countdown.
* `$25D164` cycles the record back to state 3, so the select loops rather than ending.
* The six bytes at `($4,A5)..($9,A5)` are PER-SIDE PAIRS, even for P1 and odd for P2, written by three
  handlers one pair each.

**Slot [17] is the SAME machine with four of the eight states** and is ported too. `$25D306`, `$25D39C`,
`$25D4F0` are literally shared. **Still open: slot [9] state 0 (`$25C8A2`, ~550 bytes), `$25D010`, `$25D1DA`,
`$25D560`, and the seven draw routines state 4 calls.**

**W373 SAID THAT; W374 CLOSED EVERY ITEM ON THE LIST.** All eight of slot [9]'s record states are
ported (`$25D306`, `$25D402`, `$25D39C`, `$25D4F0`, `$25D560`, `$25D010`, `$25D1DA`, `$25D164`), and
so is the seeder `$25C8A2` -- which measured **`$25C8A2..$25CAC0`, `$220` bytes**, not the "~550"
this entry estimated. **All EIGHT shared draws are ported**, in `src/objslot9.js`:

    $25E220   $25E29E   $25E4D0   $25E6CE   $25E824   $25EDF8   $25EF30   $25F074

**IT WAS NEVER "the seven draw routines" -- there are eight, and no single call site runs all of
them.** `confirmAndDraw` (states 1 and 4) fires seven and omits `$25E4D0`; `$25D560`'s tail at
`$25D800` fires seven and omits `$25EDF8`. Counting the `4EB9` jsrs in `$25D800..$25D839` gives
exactly seven. A wave that assumes one canonical draw list will wire a sprite onto the wrong screen.

**Sizes taken from an address gap bound a REGION, not a routine**, and this item recorded three that
were wrong by a lot. Measured to the real `rts`: `$25E6CE` is **70** bytes (recorded as 342),
`$25E4D0` is **446** (recorded as 958), and `$25F074` is **327** (recorded as unknown).

**Still open in slot [9]:** `$25CB94`, the dispatcher's tail past the record walk -- it reads
`$23D16C`, tests bit `$F`, checks record 1 and calls `$23C98E`. Unread, and a counted note.

**Still open in slot [17]:** the six `$25D560` callees, all counted notes and all sized --
`$25F530` (80 B, which `bsr`s the 560-byte `$25F592`), `$25FAA4` (334 B), `$25F456` (218 B),
`$26070C` (124 B) and `$2603FE` (172 B).

Five of the eleven are now candidates: **[17] D33, [9] D34, [18] D37, [16] service, [12] hiscore, [13] stage
progression.** (The [18] anchor was withdrawn in W373 -- see D37.)

**AND THE REMAINING FIVE ARE RANKED BY DEPENDENCY COUNT (W372).** Counting `jsr` AND `bsr` callees and checking each
against the port:

    [14] $288C6C   12 callees,  3 unported     <- the cheapest
    [ 7] $290BE8    9 callees,  6 unported
    [15] $291F66   19 callees, 14 unported
    [19] $28EE88   51 callees, 18 unported
    [ 8] $25A770   51 callees, 34 unported

**`[14]` is the cheapest at three**, and a first slot ported end to end is worth more than a sixth identified, because
it proves the compiled-C convention against real code rather than against a scan. **Its three, measured:**

    $2890FA    262 bytes
    $289292     72 bytes   -- READ (W372). A per-object loop: `jsr $241E34` (ported), then bounds
                              culling with `addi.w #$400` / `#$C000` / `#$9000` and `bcs`, walking
                              A6 by a $40 STRIDE and decrementing a count at $81CDEC.
                              NOT portable alone: A6 and D7 come from the CALLER, so it needs
                              $2890FA or slot [14] itself written first. Bottom-up fails here.
    $2892DA   1220 bytes
    -----------------------
              ~1554 bytes of new porting, plus slot [14]'s own 436

**So "cheapest" is about TWO KILOBYTES, not a morning.** That is the honest size of the smallest front-end slot, and
it is worth knowing before picking it up: no dispatch slot in this table is a quick win, and the three-versus-six
ranking is a ranking of large jobs. **Do not start one expecting the scale of a stage-5 enemy type.**

**SUPERSEDED: `[14]` AND `[7]` ARE BOTH DONE, so the ranking now covers only the five that are left**
-- `[8] $25A770`, `[12] $28F3AC`, `[16] $256E7A`, `[18] $24902A`, `[19] $28EE88`. `[8]` and `[19]`
remain the two large ones by the same count. **And `[14]`'s two-kilobyte estimate was itself wrong in
the interesting direction:** the dispatch address `$288C6C` is not the routine's start -- the state-0
and state-2 arms branch BACKWARD to `$288BCE` and `$288C3E`, so the routine is `$288BCE..$288D62`,
and **all eleven of its callees turned out to be ported** once `4EF9` (`jmp` abs.l) and `4EBA`
(`jsr` PC-relative) were counted. The "three unported" figure came from a fixed forward window
running past the routine's end. Trap 6 and the call-form rule, both in one slot.

**THIS COUNT WAS WRONG TWICE, AND THE RULE IS THE POINT.** The first pass counted `jsr abs.l` only and reported
`[14]` and `[15]` as fully covered. The second added `bsr` and reported `[7]` as needing ONE routine -- a claim that
reached a commit message. Both were wrong because **`4E BA` is `jsr (d16,PC)`**, and this ROM uses it constantly:
slot `[7]`'s own two calls at `$290C14`/`$290C18` are that form, and neither target is ported or even mentioned.

**Enumerate ALL call forms** -- `4EB9` (abs.l), `4EBA`/`4EFA` (PC-relative), `61xx` (bsr short and word) -- or the
dependency count is fiction. Three passes, three answers, and only the third counted what the cartridge actually does.

**So the front-end docket items are not code to go hunting for -- they are slots in a table**, and the work starts by
identifying which slot is which screen. Pinned in `w372objdispatch.test.js`, with the list shrinking as slots land,
the way the enemy type-table census works.

**And the title screen is a STATE INSIDE one of the main loop's seven calls, not a peer of them** -- almost certainly reached
through the object driver, the way every other screen in this game is. Start by finding the state word that selects
it, not by looking for a `jsr` the main loop makes.

**W372 CONFIRMED THAT BY SCANNING THE CARTRIDGE.** `$81308C` has exactly **TWO writers in the whole 6 MB image**,
`$25FDA0` and `$25FDF8`, and **both are `clr.w`** -- both inside `liveSides25FD94`, which is ported. So nothing else
in the ROM sets it, the port already owns every write, and D33 genuinely cannot need a second flag. That is one
question closed before the subsystem is started, which is the cheapest kind.

### D34: CHARACTER SELECTION, AND EVERY TRANSITION IT IMPLIES

Ship/style select, and the owner was explicit that the transitions this implies are part of the item rather
than a follow-up: getting into select, moving within it, confirming, and getting out of it into stage 1.

**This overlaps D11 and the transition-screen work already in flight**, and that is a reason to do them
together rather than twice. `tallyscreen.js` already has the cursor machinery (`pickFreeYRow25DA94`,
`mapSavedCursor25D9E6`, `loadSavedCursor25DA60`, `tallyPhase0Arm25DC2C`), and W344's four descriptor reads
were fixed there. A select screen is a cursor over a descriptor table with a saved position -- check that
file before writing anything new, the way `$55` should have been checked against `aim.js`.

### D35: THE LIFE AND COIN SYSTEM

**W372 ANCHOR: the coin read is `$13CFBA`, 72 bytes, and `isr.js` has been naming it as UNPORTED since W2.** It is
IRQ6's first `jsr` -- `main.js`'s measured phase order item 3, *"IRQ6: coin, THE INPUT READ"* -- so it runs before
anything else in the frame.

    $13CFCE  not.w D0                    the raw switch word, ACTIVE LOW
    $13CFD0  move.w D0,$803950           stored RAW
    $13CFD6  and.w D0,D1 / andi.w #$E0   THREE bits kept: 5, 6 and 7
    $13CFDC  move.w D1,$803954           stored MASKED, as a separate word
    $13CFE2  bsr $13CF86
    $13CFEA  btst #5,D1                  and bit 5 is tested first

**THREE words, and it is EDGE detection.** The head reads `$C08004` -- the same hardware port main-loop call #1
reads -- and takes `$803952`, LAST frame's word, into D1 **before** overwriting it with this frame's:

    $13CFBA  lea $C08004,A0 / move.w (A0),D0     this frame's switches
    $13CFC2  move.w $803952,D1                   LAST frame's, taken FIRST
    $13CFC8  move.w D0,$803952                   then overwritten
    $13CFCE  not.w D0                            ACTIVE LOW: now 1 = pressed
    $13CFD0  move.w D0,$803950                   the RAW level
    $13CFD6  and.w D0,D1                         pressed NOW and not before = NEWLY PRESSED
    $13CFD8  andi.w #$E0,D1                      bits 5, 6, 7 only
    $13CFDC  move.w D1,$803954                   the EDGES

**`$803954` holds newly-pressed bits, not held ones.** A port that stores the level there **coins up once per FRAME
HELD instead of once per press** -- which is the single most likely way to get this wrong, and it would look like a
credit counter running away rather than like an edge bug. Pinned in `w372coinread.test.js`.



Credits, coining up, lives, extends, game over, continue. The port has scoring (`scoreHit`, `scoreKill`, the
`LEDGER`) but no economy around it.

**Related and already partly measured:** `$8130DC..$8130E6` is the six-word mutual-exclusion block, and
`$269C6C` frees any record seeing any flag set -- game-over handling will touch that. `respawn25FFA8` exists
in `tally.js`. And D25/D32/D21/D12 are open playtest items that may turn out to be life-system symptoms
rather than independent bugs, so re-read them once this lands.

### D37: THE GAME'S ENDINGS

Every ending the cartridge can reach, and the conditions that select between them. Nothing here is measured
yet.

**W373: THE SLOT [18] ANCHOR IS WITHDRAWN.** `$24902A` was recorded as D37 on "three signals agree". Its own
text says otherwise: `$24910E` is `'Asic27 Test'`, `$24911A` is `'Wait or Press Any To Start !!'`, and the
block its callees print from (`$2C3100..$2C32B8`) is `'Asic27 Stack Ram Error !!'`, `'Global Ram Testing...'`,
`'Data Compare Testing...'`, `'All Functions Test Ok!'`, `'A) Exit'`. **Slot [18] is the ASIC27 coprocessor's
operator self-test.** It is real work and worth porting for completeness, but it is not an ending and it is not
on the path to one credit through stage 5.

**Do not re-anchor D37 on a slot without reading its strings first.** That check cost one command and would
have saved the wrong anchor standing for two waves.

**What is already known that bears on it, so it is not rediscovered:**

* **`$B0` is Hibachi, the boss-route root** (`$2A42D4`/`$2A4606`), still unported -- but **W357 read its whole
  handler and it needs neither the "HIBACHI CLOSURE RULE" nor a trace.** It is 170 bytes: `jsr $2A6B94`, a clear
  test on `$25962E`, and the stage-clear path. **Everything else in it is disabled** -- eleven `$26331C` calls
  and one `$25A17A` call, all reaching bare `rts` stubs. So the whole boss is `$2A6B94`, the 1838-byte stretch
  ending at `$2A4DDE`.

* **The endings are NOT selected in Hibachi's handler.** W357 briefly recorded `$25A17A` as the likely selection
  point because it is called last with a deliberate `D0=0 D1=0 D2=2 D3=<incoming D0>` setup. **That was wrong:
  `$25A17A` is one of four consecutive `rts` bytes and does nothing.** The register setup before it is dead.
  **Do not start D37 by looking there.** What IS established is that `$2A4614 jsr $242952` is the stage-clear
  call, so Hibachi's handler is the junction the completion path runs THROUGH -- but the selection happens
  somewhere downstream of `$242952`, not in `$B0`.
* **The loops are already in the milestone** ("one credit from stage 1 through stage 5 with no `Unreached`,
  then the loops"), and endings depend on loop state, so this item sits AFTER the loops rather than beside
  them.
* Ending selection will read the same run-state the front end writes, so **D35's life and coin system lands
  first** -- an ending conditioned on credits used or lives remaining cannot be tested before that exists.

Ordering, therefore: D35 and the loops before this, `$B0` before the best ending, and this before D36. **Do
not treat an unreached ROM region as an ending on the strength of it looking cinematic** -- check it against
`$B0`'s route and the second game (D36) first, because a misattribution there would put D36 work in scope
early, which is exactly what the owner ruled out.

### D40: A DECISION ONLY THE OWNER CAN MAKE -- WHAT TO DO WHERE THE CARTRIDGE IS UNDEFINED

**Type `$1A` aims at a register nothing initialises.** W372 proved it over the whole spawn chain: `$268D8C` reads its
target from D2/D3, `$1A` supplies D2 itself (`$1` or `$2`), and **no caller anywhere in the 6 MB image writes D3** --
not the dispatcher, not the sub-record allocator, not the movement reader. The aim's target is therefore (Y = 1 or 2,
X = whatever the previous frame's work left in D3), and it sets the enemy's heading and velocity.

**W372 CORRECTION -- IT IS SMALLER THAN THIS ENTRY FIRST SAID.** I described the aim as setting "the enemy's heading
and velocity". `($24,A5)` is **not velocity**: it is passed as **D2 to `$23DECE`**, the sprite emitter, where D2 is
the ART LONG. The `$272C7A` table it indexes holds 32 art pointers in the `$14xxxx` range -- **directional
sprites**. So the undefined D3 selects **which of 32 facings the turret is DRAWN with at spawn**, and nothing else:
the handler's own slew drives the firing direction, and nothing in `$1A` reads `($29,A5)` at all.

**That moves it from gameplay to a spawn-time sprite choice**, and this project's own criterion is that a `note()`
is acceptable for a cosmetic gap where one for gameplay is not. **So the resolution is option 1b: port the body, use
a documented default, and `note()` the site** -- the type spawns and plays, the inaccuracy is one sprite facing, and
the log says so by address.

The original framing is kept below because the reasoning that narrowed it is worth having, and because the elimination
work stands: FOUR levels of the spawn chain were swept and none writes D3.

Three options as first written, and the choice is a taste call about the project's goal:

1. **`unreached()` at that site.** Truthful and loud: `$1A` cannot spawn, and stage 5 keeps a hole. Consistent with
   how this port treats everything else it cannot justify.
2. **Model the inherited value** -- carry a register file through the spawn path so D3 holds whatever the real
   machine would. Faithful, and the only option that could be *correct*, but it is a large change to a port that
   deliberately does not model registers.
3. **Pick a value and document it.** Cheapest, gets `$1A` on screen, and is a fiction the suite would then enforce.

**No wave should choose this silently.** It is recorded here rather than in the handoff so it reads as a question for
the owner, not a task for the next agent.

### D38: INPUT LAG REDUCTION -- FAITHFUL

**Faithful means the cartridge's own latency is preserved and only the PORT's added latency is removed.** The
arcade hardware polls, the game reads, the game acts, the screen shows it. Any delay the 68000 program itself
imposes is part of the game and stays. What must not stay is delay this translation introduces on top: an
extra buffered frame, a browser event queued behind a render, a poll that happens after the frame it should
have fed rather than before.

**W372 MEASURED THE LOGIC SIDE, and it is already faithful.** Two facts, both from reading the code rather than
timing it:

1. **The port samples input immediately before it steps.** `app.js:step()` computes `pw` from `currentPortWord()`
   on the line before `g.step(pw)`. The cartridge samples in **IRQ6** and then runs the loop (`main.js`'s measured
   phase order, items 3 and 5-10). **Same relationship, no frame inserted.**
2. **The one-frame sprite hold is DELIBERATE AND FAITHFUL.** `step()` snapshots `$800000` BEFORE stepping, because
   at that moment it still holds the list the PREVIOUS frame built -- which is the frame the hardware sprite DMA
   would have shown. W44 put it there against `render/capture.js`'s **measured hardware lag of 1**, and the comment
   says it must stay independent of how often `draw()` runs.

**So the port adds no logic-side frame, and D38's remaining scope is the PRESENTATION path only** -- the browser's
rAF-to-photon chain and anything `draw()` does. That is a much smaller item than this entry assumed, and it means
**the faithful half of D38 may already be done**; what is left is measuring the browser, not the port.

**The original framing is kept below**, because the distinction it draws is still the one that governs D39.

**So the first work here was MEASUREMENT, not optimisation.** Establish, in frames:

* where in the frame the port samples input, against where `$24xxxx`'s poll sits in the cartridge's frame
* how many frames sit between a sample and the pixels that reflect it, in the browser build specifically
* whether any of them are the port's own (a queue, a rAF boundary, a double buffer) rather than the game's

**The distinction is the whole item**, so record for each frame of latency found which of the two it belongs
to. A frame the cartridge spends is not a bug and must not be "fixed" -- removing it changes the game and
belongs in D39 instead. A frame this port added is a defect and is in scope here.

The likely places to look are `framesync.js` and whatever drives the web build's frame loop, but that is a
guess and should be checked rather than assumed.

### D39: INPUT LAG REDUCTION -- UNFAITHFUL, AS PICKABLE MODS

**Everything that makes the game more responsive than the cartridge was**, kept strictly separate from D38 and
never on by default. The owner's framing: these are mods people can pick.

That framing sets the requirement. Each is an INDIVIDUAL toggle, off by default, and the player chooses --
not a single "low latency mode", and not something the port decides for them. Anything that changes
cartridge-visible behaviour belongs here, no matter how small the win.

Candidates to evaluate once D38's measurement exists (each is a separate toggle, not a bundle):

**W372 MADE THESE CONCRETE**, because D38's measurement says where the frames actually are. The port samples input
immediately before `g.step()` and holds the sprite list one frame to match hardware DMA. **So there are exactly three
places a frame can be taken, and each is a separate toggle:**

    MOD 1  DROP THE SPRITE HOLD.  app.js's step() snapshots $800000 BEFORE stepping, deliberately, to match
           render/capture.js's MEASURED hardware lag of 1. Snapshotting AFTER shows the frame the game just
           built, one frame earlier than the arcade ever could. This is the single biggest honest win and
           the most clearly unfaithful: it shows a frame the cabinet physically never displayed.
           W44's comment must be read before touching it -- the hold is also what keeps `draw()` independent
           of step rate, so a naive move breaks repaint-without-step.

    MOD 2  SAMPLE INSIDE THE STEP.  The cartridge samples in IRQ6, before the loop's seven calls. A mod could
           re-read input between calls so a press made during the frame is seen by the object driver in the
           SAME frame. Faithful ordering says no; it is worth roughly one frame.

    MOD 3  SKIP THE EDGE DELAY. $13CFBA-style edge detection (D35) means a press is seen the frame AFTER it
           lands, because the edge needs a previous-frame word to compare against. Acting on the LEVEL for
           menu inputs removes that frame -- and would break auto-repeat behaviour, which is exactly why it
           is a mod and not a fix.

**None is a "low latency mode".** Each is one toggle, off by default, and MOD 1 is the only one that does not change
game logic -- which makes it the right first one to build and the easiest to reason about.

**The original candidate list, kept because it is what the owner asked for:**

* sampling input later in the frame than the cartridge does, so a press lands one frame sooner
* skipping the game's own input debounce or repeat delays where it has them
* reacting to a press before the frame boundary that would normally consume it

**D38 MUST LAND FIRST.** Without its measurement there is no way to tell which of these actually removes a
frame and which only feels like it does, and no way to keep the faithful build honest while they exist. A
mod that silently becomes the default is the failure mode to design against.

## Added 2026-08-15 by the owner

### D41: CONTROLS TO ACTUALLY START THE GAME -- INSERT COIN AND START

> "add to docket controls to actually start the game, like insert coin and start button and such"

**D40 was already taken** (the undefined-cartridge decision), so this item is D41.

**This is the half of D35 that D35 never covered.** D35 is the life and coin SYSTEM, and its coin
handler is recorded there as complete: `$13CFBA`, `$13CF86`, `$13CE22`, `$13CC50` and `$13D068` are
all in `src/isr.js`, covering the edge read, the DIP coinage conversion, the four-byte pending-tick
queue and the six-frame counter solenoid pulse. **The economy works. Nothing can reach it.**

**THE MEASURED GAP IS ONE UNSET FIELD.** `src/isr.js:51` reads

    coinRead13CFBA(ram, ctx.coinPort ?? COIN.idle, ctx);

and a repo-wide grep for `coinPort` returns exactly two hits: that read, and the parameter name in
`coinRead13CFBA`'s own definition at `isr.js:176`. **Nothing anywhere writes it.** So the coin port
sits at `COIN.idle` on every frame of every run, the edge detector never sees a transition, and no
coin can be inserted by any means the port currently offers.

**THE TRAP, WHICH ALREADY COST SIX TEST FAILURES AND IS WRITTEN INTO `isr.js` AT THE SITE:** IRQ6's
`portWord` is `$C08000`, the PLAYER port. `$13CFBA` does its own `lea $C08004,A0` and reads a
DIFFERENT word. **Handing one to the other credits a coin whenever a player holds a button whose bit
falls in the `$E0` mask** -- which is how it was caught. The two ports are separate inputs and must
stay separate all the way out to the browser.

**START IS ALREADY BOUND. ONLY COIN IS MISSING**, which halves the item and is worth knowing before
anyone designs a control scheme. `src/web/input.js`'s `KEYMAP` already carries `Enter: 'START'`
alongside the movement and the three action buttons, and `src/input.js`'s `portWordFromBits` is the
measured inverse of build A's `$13D464`, unit-tested against the board's own port words (`$FFFE` for
1P Start alone, `$FF7F` for Button 3 held). **Start reaches the 68000 today. Coin has no route at
all**, because coin does not travel on that port -- see the trap above.

**KEYBOARD CONSTRAINT, asked for by the owner twice:** the layout is **Swiss QWERTZ**. Bind by
`e.code`, never `e.key`, and whenever `KeyZ` is bound `KeyY` must be bound too, and the reverse.
`src/web/input.js` already does this correctly for SHOT (`KeyZ` and `KeyY` both map to it, because
the key printed Z on a Swiss board sits where QWERTY has Y and reports `KeyY`), so **copy that
file's existing pattern rather than inventing a binding**. `docs/04-INPUT-SYSTEM.md` is the
cross-game plan for this layer and it preserves the same rule.

**Where the work lands:** `src/web/input.js` is the live browser input layer. `games/ddpdoj/.scratch/`
holds a stale copy of it that is NOT the live tree -- do not edit that one.

**THE RECON'S QUESTION IS ANSWERED (W375, 2026-08-15): NO, COIN PLUS START WAS NOT SUFFICIENT.**
The paragraph that stood here left it open. Three blockers stood behind the one unset field, and all
three are now cleared:

1. **There was no boot path at all.** `Game` resumed from a mid-stage-1 seed and `Game#boot()` did
   not exist -- not as a stub, not in any form. It now ports `$23BF74`, which is not a routine entry
   but 23 `jsr`s into `$23BEEA`, and which never returns (it falls into the seven-call main loop and
   `bra`s back forever). See `src/frontend.js`.
2. **Slot [8], `$25A770`, was unported.** It is the attract sequencer and credit gate -- the state
   machine that reads the credit counter, arms the join poll and stages the type it hands off to.
   Now `src/objslot8.js`, and REGISTERED in `main.js`, taking dispatch to 16 of 20.
3. **Coin bits reach the handler only via `$13CEC8` on the IRQ4 phase, which was not modelled.**
   Ported and driven from `main.js`'s `coinTick` hook.

**COIN IS NOW BOUND AND LIVE**: `Digit5` = COIN1, `Digit6` = COIN2, `Digit9` = SERVICE, `F2` = TEST,
in `src/web/input.js` alongside the existing `Enter: 'START'`. The two ports stayed separate all the
way out to the browser, exactly as the trap above requires -- `currentCoinWord()` is its own pure
function feeding `$C08004`, and it never touches the `$C08000` player word.

**A cold boot now reaches a DRAWING screen through the cartridge's own path**: from
`new Game(new Uint8Array(0x20000), tables, {palCatchUp: false})`, `boot()` then `step()` gives slot
[8] as type `$8008` at state `$D` on frame 1, 300 warning frames, `$D -> 2` at frame 302, and 101
terminated display-list entries from there on.

**STILL OPEN, and these are cosmetic-but-stalling rather than blocking** -- none of them throws, they
make the attract loop terminate at state 12 instead of cycling: `$259FF8` (the warning screen draws
nothing), `$23CFDE` (the credit line, so an inserted coin is invisible), the `$25AD02`/`$25AFD8`
blink pair, and the four screen sub-machines that keep arms 1, 5, 9 and 12 holding.

**REPLAY HOLE, STATED NOT HIDDEN:** `Game` now has a SECOND per-frame input, `this.coinPort`, and
the `.replay` v1 format does not carry it (`src/web/replay.js` fixes one `u16be` word per logic
frame and `decodePortinWords` throws on anything else). A recording made while coining up replays
with `COIN.idle` and diverges on credit count. Recordings with no coin key touched are unaffected,
which is every existing fixture. `step()`'s signature is deliberately unchanged: a second per-frame
word is a FORMAT VERSION BUMP, not an argument. The honest fix is a v2 encoding with a sibling
`coinin` block of the same shape, `validateReplay` requiring matching counts, and a v1 file read
back as all `$FFFF` -- which is exactly what a v1 run already means.

### D36: THE SECOND GAME IN THE ROM -- **DEFINITELY LAST, AND IT IS THE FINISH LINE**

The cartridge carries a second game. **The owner's instruction is explicit: this is the last thing tackled,
after everything else.** Do not start it opportunistically because a window happens to be declared or a
routine looks adjacent, and do not let it absorb effort while stage 1-5, the loops, or D33-D35 are open.

Recording it now so it is not rediscovered as a surprise, and so nobody treats an unexplained ROM region as
in-scope work when it belongs to the second game.

**IDENTIFIED (owner, 2026-08-14): the second game is DoDonPachi DaiOuJou WHITE LABEL.** The ROM this port
translates is Black Label Version-B, and the cartridge carries the White Label build alongside it.

**AND IT IS NOW THE PROJECT'S DEFINITION OF DONE.** The owner's words: *"the goal is accomplished when,
following the tasks we set out, the agent finishes the second game in the rom, doj white label."* So D36 is
both LAST in order and the terminal deliverable -- the docket ahead of it is not optional groundwork to be
cut short in order to reach it, and reaching it early is not permitted either. Order is unchanged; only the
endpoint is now named.

**OWNER GOAL UPDATE, 2026-08-21:** finish the whole Black Label game, **including the complete second
loop**, and finish the docket along the way. Then finish White Label last. A first-loop completion or a
green subset of loop 2 is not the handoff point to D36; Black Label loop-2 fidelity and the open docket
remain required work before White Label begins.

**NOTHING HAS BEEN DECODED FOR IT.** No entry point, no region bound, no dispatch table. When its turn
comes, the first job is to locate its reset vector and bound its region, not to assume it mirrors Black
Label's layout.

---

## OPENED 2026-08-18 FROM A PLAY SESSION ON BUILD 20260816181806

The owner played the live build and reported five things, then asked for a sixth. **These outrank
further HIBACHI boss internals**: they are visible in the first minute of play and the boss work is
not. What follows each item is a FIRST LOOK from the source, explicitly not a finding. Confirm
against the image before porting.

**Numbering note: D41 was already taken** by "controls to actually start the game", so this batch
runs D42..D47. An earlier version of this text in `NEXT_AGENT_HANDOFF.md` numbered it D41..D45 and
collided; that section has been corrected to match these numbers.

### D42: THE HYPER LASER HAS NO HIT ANIMATION

> "hyper laser still has no hit animation"

**The emitter is not missing.** `src/laser.js:1031` calls `spawnBeamImpact289FC0(...)` and counts
the result into `ctx.beamImpacts` at line 1058. So the question is not "is it ported" but one of:
is that line reached with the beam actually on a target, does the spawned effect draw, or does only
P1's block spawn it -- line 1020 records that P1's block spawns the impact "in eleven other places",
which is the sort of asymmetry that produces exactly this symptom for P2.

**First job:** measure `ctx.beamImpacts` on a bench with the laser held on a live target, for both
players. If it is non-zero, the defect is downstream in drawing, not in the spawn.

### D43: THE LASER BOMB DOES NOT HIT THE BOSS

> "laser bomb doesn't actually hit the boss and maybe other stuff either"

**There are two different screen-clear paths and they are not the same routine.** `src/bomb.js:329`
is explicit: `$243DA0` is the bomb's entry and is **NOT** the midboss's, whose sibling `$243E7C`
arms `$81B412 := $0` and **walks the 210 slots**. A bomb that clears the slot walk but never
reaches whatever the boss is registered in would look exactly like this.

**First job:** read both routines and establish which pools each one touches, then check which pool
HIBACHI's record lives in. The owner's "and maybe other stuff either" is a real lead -- do not scope
this to the boss alone until the pools are mapped.

### D44: ONLY MID-BOSSES LEAVE STARS

> "only mid bosses leave stars and nothing else"

**The allocator is not the problem.** `src/items.js` has **zero** deferrals, and `spawnItem` is
called from six sites: `boss.js:390`/`394`, `handlers.js:1735`/`1738`/`3263`, `player.js:213` and
`stage4type9d.js:238`.

**The likely cause is coverage, not wiring: 95 of 256 enemy types are ported, 130 are null, and 31
are unported.** If the droppers are among those 31, nothing they kill can spawn. Check the drop
path per type before touching the item code.

### D45: NOTHING LEAVES MEDALS

> "nothing leaves medals"

**READ `src/bee.js:796` BEFORE STARTING.** The medal IS the bee: `bee.js` opens "THE BEE (yellow
medal) -- POOL A's reserved ten. WAVE 111", and its header records that W111 was opened by the
owner reporting *the same complaint*, and that the agent then "spent a wave's worth of attention on
a path that had been closed". Do not repeat that wave.

Fields: the medal accumulators are `$817F84`/`$817F86` (P1) and `$817F88`/`$817F8A` (P2), zeroed at
`src/player.js:176`; the tier compound is `$2854E0` in `src/hud.js:2189`; `$280BCE[1] = $280CEE` is
kind 1, the medal.

### D46: THERE IS NO START-OF-GAME MENU

> "there is no start of game menu"

**This is EXPECTED and is not a regression.** It is **D33, the main screen**, and nothing of it has
been decoded. It is also distinct from D41: D41 is coin and start reaching the game at all, which is
largely closed; D46 is the menu that should stand in front of it.

**Report it as unbuilt, not as broken.** The honest statement to the owner is that the front end
was never ported, not that something stopped working.

### D47: THE DOCS HAVE DRIFTED AND NEED A PASS

> "add a docs update to the docket"

Concrete drift already identified, all of it evidence for the item rather than the whole of it:

1. **This file's own headings lie.** The section headers still read "Fixed" and "Open, in priority
   order" from the day the docket was opened; the per-item markers are authoritative. D12 has
   covered that drift since W279 and it is still true.
2. **The standing summary is stale.** The header block says "STANDING AS OF W375" and "DISPATCH IS
   16 OF 20" naming four unported slots. Dispatch is **17 of 20**; `[12] $28F3AC` has been ported
   since. The live figure is three: `[16] $256E7A`, `[18] $24902A`, `[19] $28EE88`.
3. **`NEXT_AGENT_HANDOFF.md` is 13,299 lines.** It has grown a "START HERE" section per wave with
   every prior wave demoted below, and nothing is ever retired. It is the first thing every agent
   reads, and most of it is now archaeology.
4. **The numbering collision this batch just caused** shows nothing checks docket IDs.

**Do not rewrite history.** The wave notes are the project's memory and several have caught real
defects precisely because an old claim was still readable. The job is to make the CURRENT state
findable at the top, and to move settled waves into an archive that is still in the repo.

**Suggested shape, owner to confirm:** keep the last three waves in `NEXT_AGENT_HANDOFF.md`, move
everything older to `docs/worklog/`, refresh this file's headers and standing block, and add a check
that a new docket ID is not already in use.

### D48: THE RNG SIGN TEST READS THE WRONG BIT, IN ELEVEN PLACES ACROSS FIVE FILES

Found by the W409 porter while porting A4 script 5, and **not fixed there** -- it is out of that
unit's scope and changes behaviour in five files, so it needs its own wave.

**The cartridge tests bit 7. The port tests bit 15.** `$242EC2` ends:

    $242ED6  10 30 00 00   move.b (A0,D0.w),D0
    $242EDA  20 5f         movea.l (A7)+,A0
    $242EDC  4e 75         rts

Verified against `rip/sound/maincpu.bin` by the coordinator, independently of the agent's report.
**MOVEA does not affect the CCR and neither does RTS**, so the last instruction to touch N is the
`move.b`, and N is bit 7 of the table byte. Every `bpl` after `jsr $242EC2` therefore branches on
bit 7.

The port reads `i16(drawWord242EC2(...)) < 0`, which is bit 15 of the returned word -- a different
bit, carried down from `$242EC8 move.w $803916,D0` and untouched by the byte load. `src/rng.js`'s
own doc comment says bit 15, so the error is documented as if it were correct.

**The eleven sites**, all confirmed present by grep:

    src/hibachiend.js:226, 250          ($2A5D52, $2A6222)
    src/hibachiguns.js:370, 730, 868    ($2A81DA, $2A881E, $2A89D0)
    src/initbody.js:653, 1710, 1764, 2309
    src/stage4type9d.js:198             (inverted form, `>= 0`)
    src/stage4type9f.js:88

**It is measurable, not theoretical.** W409's own unit is written correctly (`& 0x80`) and its state
0 emits **5 x `$28C274` and 3 x `$28C28E`** across eight cues. The bit-15 reading gives 8 and 0 --
the second sound never plays at all. Expect the same shape at the other ten: one arm dead.

**Wave shape.** This is a coordinator-scale item. Do NOT let one porter change eleven call sites on
the strength of this note. Fix `rng.js` to expose the flag the hardware sets, correct its doc
comment, then take the sites in small groups with a measurement at each -- several are `if` arms
whose dead branch has never run, so tests that pass today may be pinning the wrong behaviour, and
that is exactly the shape that produces a green ablation.


### D44/D45 DIAGNOSED (W410, 2026-08-18) -- ONE SHARED GATE, AND THE TRIAGE WAS WRONG

**Nothing was changed. This is a diagnosis, and the fix it points to is a PORT, not a wire.**

**The triage in D44/D45 named the wrong subsystem.** `src/items.js` is pool family SIX (`$27E812`,
`$816B7A`) -- P capsules, bombs, hyper stock. Stars, medals and bees are **impact POOL A**
(`$8171BE`, 80 slots of `$2C`), whose allocator is `$27F8FC`, reached by **four entries that fall
into one another**:

    $27F8EE  moveq #$0,D1            D1 = 0, D2 from caller
    $27F8F0  andi.w #$FF,D2 / lsl.w #2,D2 / bra $27F8FC
    $27F8F8  moveq #$0,D1            D1 = D2 = 0
    $27F8FA  moveq #$0,D2            D1 from caller, D2 = 0
    $27F8FC  movem.l / lea $8171BE,A0 / move.w #$45,D7      the one 70-slot scan

**`src/bee.js` ports only `$27F8F0`.** A scan of the 6 MB image for `4EB9/4EF9 0027F8xx` finds 26
call sites, no `bsr`, and no longword pointing at any entry, so the caller set is CLOSED. Eight are
wired; **thirteen are `ctx.unported.note()`, and ten of those are enemy death arms inside FULLY
PORTED handlers** (types `$84 $88 $89 $8B $8E $8F $90 $91 $94 $97`).

**Measured, 5400 frames, fire held:** 18 pool-A records delivered, all kind index 0, all on the
frame the midboss dies, all from `$281D2E jsr $27F8F8` with `D0 = $81B412 = 0` -- **the bullet
cancel**, which `bulletdriver.js` does wire. Refused: `$27F8EE` 11, `$27F8FA` 21, `$27F8F8` 1440.

**So the mid-boss "stars" are cancelled bullets, and no enemy death arm in the cartridge drops a
star.** One shared gate, as suspected. **It is NOT the 31 unported types** -- every one of the ten
refusing handlers is ported, and the same run shows nineteen enemy types spawning and dying
normally. That hypothesis of mine is dead; do not revive it.

**THE MEDAL IS KIND INDEX 2, NOT KIND 1.** Kind 1/16 is the bee (`$1BCA34`, 6x24). Kind 2 is
`$1BE2CC`, 4x24, a shaded gold disc, and its body `$27FE0E` is the star's collect arm on a different
counter. The result screen `$28DB70` reads **four independent word counters, not two lo/hi pairs**:
`$817F86`/`$817F8A` is the star's, valued **x10**; `$817F84`/`$817F88` is kind 2's, valued **x20**.
A gold disc worth double, dropped by ten enemy death arms, is what the owner calls the medal -- and
it is exactly what never spawns. My triage's `$2854E0` pointer was also wrong: that is the stage-end
tally drain on `$81B616`, unrelated.

**W111 was right and was NOT repeated.** The bee path is complete: forcing ten type-`$8A` carriers
into the state a kill leaves produced **10 bees, nothing threw**; the control run produced 0. The
bee never appears because **the carrier is never damaged**. Sub-proto word 0 is `$8100`: bit 13
clear so the ordinary shot pass `$244F90 andi #$2000` skips it, bit 5 clear so block 8 and the
beam's own pass skip it. **Only block 7 accepts it** (`btst #$5` OR `btst #$0`, and `$81` has bit
0), and block 7's A2 is `$811802`, beam slot 27, the **laser muzzle** -- live for exactly 11 frames
per press, because `$24CBB2 bset #$7,($1,A6)` lays the head once and never clears it while the
button is held. Overlaps in 5400 frames: **0**.

**So the medal complaint has two independent causes and the docket has only ever chased one.**
Whether that 11-frame muzzle window is authentic belongs with **D42**, not here.

**D48 IS NOT THE CAUSE.** All four `initbody.js` sites were checked first: `:653` sets type `$83`'s
`($38,A5)`, `:1710` ORs `$40` into type `$9C`'s `($1,A6)`, `:1764` mirrors a drift, `:2309` negates
`($2A,A5)`. None gates a drop. Clean negative -- the next wave need not detour.

### D49: PORT POOL-A KIND INDEX 2 AND WIRE THE TEN REFUSED DEATH DROPS

The fix D44/D45 points to. **Wiring alone would be a REGRESSION today**: `bee.js runBody` dispatches
only `$27FACC`, `$27FA30`, `$280082`, `$28016A` and throws `unreached` on anything else, so wiring
the ten sites would turn 32 silent notes into 32 named throws on the frame after each enemy death.

Order, from the W410 measurement:

1. **Port `$27FE0E`**, kind index 2's body. Collect arm is `$27F9EE`'s shape on `$817F84`/`$817F88`,
   20 instructions to `$27FE5A`; the ordinary-step arm starts at `$27FE6E` and needs a window.
   `IMPACT_FINISH[0x08]` (`$280CF8`) and the template `$280EC6` are already ported.
2. Wire the five `$27F8EE` sites as `allocPoolA27F8F0(kind, 0, layer, a6)`. `$27F8EE` is provably
   `$27F8F0` with `D1 = 0`. Type `$8B`'s `D0` comes from `($18,A5)`, loaded `$0008` by its prototype
   at `$27685E` -- range-check it rather than assume.
3. Wire the five `$27F8FA` sites as `allocPoolA27F8F0(kind, vector, 0, a6)`; every vector table is
   already read by the port.
4. **`$279990` (type `$90`) is a pure wire needing no new body** -- `D0 = $10`, kind index 4, whose
   body `$27FA30` is ported. Cheapest real drop in the list; consider it first as a proof.
5. `$281E3A`/`$282016` last: 1440 refusals per 5400 frames, bullets freeing off-screen, born out of
   bounds and freed by `$27FA96 bmi`. Real but invisible, and expect a large bullet-test blast
   radius.


### D50: THE GROUND CRATER APPEARS A FEW FRAMES AFTER THE DEATH, NOT ON IT

> "There seems to be an issue with some of the enemies who die not leaving craters right away when
> dead as they should, the craters come a tiny bit later"

Reported by the owner 2026-08-18 on live build `20260816181806`, playing from the start of the game
with fire held. **Note the qualifier "some of the enemies"** -- that is a lead, not filler. If it
were every enemy the cause would be one shared timer; if it is some, the cause is more likely a
per-type list or a per-type death sequence, and the first job is to establish WHICH types lag.

**Vocabulary warning for whoever takes this.** The port has no `crater`, `scorch`, `decal` or
`groundMark` anywhere. The owner's "crater" is the ground mark a dying enemy leaves, and in the port
it will be a **death spawn**: `walkDeathSpawns270D92` in `src/effects.js:336`, called from at least
six sites in `handlers.js` (`:2455 :2561 :2770 :2846 :2997 :8839`) plus a separate
`T1B.deathSpawns` list at `:3337`. There are also nine distinct `deathSeqNN` functions. **Do not
grep for the owner's word; grep for the mechanism.**

**First job is a measurement, not a theory.** Take one enemy type the owner would meet in the first
few seconds, kill it on a bench, and record the frame its death is registered against the frame the
ground mark's record is allocated and the frame it first draws. "A tiny bit later" is a frame count
and should be reported as one. A lag of exactly one frame and a lag of eight have completely
different causes.

**Shapes to consider, in the order they cost:**
1. The spawn happens on the correct frame but the record's first drawn animation frame is blank or
   its anim cursor starts one entry late.
2. The death sequence walks its spawn list on a later frame than the cartridge does -- an init/step
   ordering error. **This project has hit exactly that trap before**: `$2596FA jsr (A0)` runs an
   A4 script's init AND step on the same frame, and W403 found every countdown in W399 was one frame
   out because the port ran them on separate frames.
3. The mark is allocated into a pool whose driver runs later in the frame than the drawing pass,
   so it misses one composite.

**Do not assume this is cosmetic-only.** If the mark is late because the whole death spawn list is
walked late, anything else on that list (debris, sound cue, score popup) is late by the same amount
and the owner has only noticed the most visible one.

Related: **D49** is porting other pool-A drops right now and touches `src/bee.js`, not `effects.js`.
Check whether D49 has landed before starting, so the two do not collide.


### D43 CORRECTED BY THE OWNER, 2026-08-18 -- IT IS THE LASER BOMB, A DIFFERENT WEAPON

> "I think you might not have gotten my bomb laser report correct. If you use laser while firing
> bomb, a stronger laser comes out instead of a bomb. That one does not hit first boss and maybe
> other stuff."

**My original D43 was wrong and should not be worked from.** I read "laser bomb" as the ordinary
bomb's screen clear and pointed at `$243DA0` versus the midboss's `$243E7C`. That is the wrong
weapon entirely. Holding laser while bombing produces the **LASER BOMB**, a separate weapon with its
own driver `$255FE2` and its own damage pass `$2456A6`, both already ported in `src/bomb.js` (W65).

**The two weapons do not share a damage routine.** `src/bomb.js:1151` documents it:

* ordinary bomb `$245638` -- walks **150 fixed slots of `$20` from `$81459C`** and takes `$50` off
  everything whose box is on screen.
* laser bomb `$2456A6` -- builds a bounding box over the beam, then asks THREE pools:
  * **POOL A** `$81459C`, **100 slots** -- hits **every** intersecting one for `$1E0`.
  * **POOL B** `$81521C`, **50 slots** -- finds the **NEAREST** intersecting one only, records it in
    `$812952`/`$812954`, and hits **exactly one** for `$208`.
  * BULLETS `$817F8C` -- erases every one inside.

**THE ARITHMETIC IS THE LEAD.** `$81459C + 100 * $20 = $81521C`, and `100 + 50 = 150`. **Pool A and
pool B are the same contiguous 150 slots the ordinary bomb walks, split in two and treated
completely differently.** The ordinary bomb damages all 150. The laser bomb damages the first 100
freely but only ONE record out of the last 50.

**So the first question is which half the boss sits in.** If the boss record is in the last 50, the
laser bomb hits it only when it is the nearest intersecting record, and anything nearer -- a part, a
turret, another enemy -- takes the single hit instead. That would match the owner's report exactly,
including the "and maybe other stuff" for whatever else lives up there.

**Do not assume it is a port defect.** `$2456A6` is 266 instructions and the nearest-only rule is
the cartridge's, so the ported behaviour may be faithful and the real bug elsewhere (the box, the
`$245776 cmpi #$9800` reject, or the arming test). **Measure first:** on a bench with the first boss
present, log which pool index the boss record occupies, whether it intersects the beam box, and what
`$812952`/`$812954` end up holding. A boss that never intersects and a boss that intersects but
loses the nearest test are different bugs.

Second lead, cheaper to check and worth doing first: `$245776 cmpi.w #$9800 / bcc` rejects any
record whose biased near edge is `>= $9800`, and D6 is a `$2800` coordinate bias, not the hit mask.
`bomb.js` warns in the same comment that a port which hoisted the mask read would get D6 wrong.
Confirm the port takes the bias arm, since a wrong D6 moves every comparison.


### D51: THE MEDAL NOW SPAWNS BUT HAS NO EXPORTED ART, SO IT CANNOT DRAW ON THE PUBLISHED PAGE

Found by the W412 agent while measuring D42. **This blocks D49 from actually being finished from the
owner's point of view**, and it must not be missed: W411 made the medal spawn, and the owner will
still see nothing.

`$1BE2CC` -- kind index 2's sprite, the gold disc -- is the **top missing-art offset in every run**:
28 misses per 900 frames before the laser fix, 39 after, with `$1BE300 $1BE334 $1BE368 ...` behind
it. **32 medals spawn per 5,400 frames and not one of them can be drawn.**

The port allocates the record, runs its body, walks its animation and hands the draw a source offset
that the exported sheet has no entry for, so the sprite is dropped silently at composite time. The
game logic is right; the asset pipeline never learned the address.

**What it needs:** a window in `export-tables.py` covering `$1BE2CC` and its animation run, plus a
shard entry in `export-web.mjs` so the cells reach the packed map. Then `export-web.mjs` BEFORE
`publish.mjs`, per the standing rule.

**Sequencing warning.** This is a wave of its own and it touches the asset pipeline, not the port.
Do not fold it into a porting wave: a window added without the matching shard produces a sheet that
verifies clean and still draws nothing, which is the same silent-failure shape as the star-collect
test that stood for eight waves.

**Check the other newly-spawning kinds at the same time.** W411 wired ten death arms; if kind 2 was
missing from the sheet, confirm every kind those arms can allocate is present before declaring this
closed, rather than fixing the one offset the measurement happened to name.


### D52: DO THE COLLECT SOUNDS ACTUALLY FIRE? **MEDALS CONFIRMED GOOD BY THE OWNER** -- STAR AND BEE REMAIN

**NARROWED 2026-08-18, same session it was opened.** The owner played the live build and reported: *"The sounds for medals are good"*. So the shared collect arm, `ctx.soundPost`, `sound.js`'s mapping and the whole chain from `poolACollectArm` to the audio layer are all **proven working in play** for kind 2. **That is the strongest evidence in this item and it was free.**

**What that leaves**, and it is a much smaller question than the one first written:
- **the star** (kinds 0/4, `$27F9EE`) -- shares the SAME cue `$28C5E4` and the SAME arm as the medal, so it is now very likely fine; the residual doubt is only that its collect arm was dead until W411 and may differ in reachability, not in wiring;
- **the bee** (`$27FC6C`, cue `$28C62A`) -- posted from its OWN body, not the shared arm, so the medal result says nothing about it;
- **kind 3** (`$27FED2`, cue `$28C610`) -- not reached on any bench here at all.

**Ask the owner about the star and the bee before spending a wave on either.** One sentence from a play session settled the medal; the same may settle these. Only measure what a play report cannot answer.

The original item, kept because its cautions still apply to the bee:

> "I think medals have sounds too, maybe stars as well and bees too. Those are important"
> "sounds when collected I mean"

Owner, 2026-08-18. **The wiring exists. That is not the same as the sound being heard, and these
paths are all new**, so nobody has ever observed them firing.

**What is already true, checked by the coordinator:**

| pickup | collect cue | in `sound.js`? |
|---|---|---|
| star (kinds 0/4), `$27F9EE` | `$28C5E4` | **mapped** |
| medal (kind 2), `$27FE0E` | `$28C5E4` | **mapped** |
| big medal (kind 3), `$27FED2` | `$28C610` | **mapped** |
| bee, `$27FC6C` | `$28C62A` | **mapped** |

All four go through `poolACollectArm`'s `ctx.soundPost?.(spec.collectSound)` (`bee.js:1523`), and
`main.js:547` passes every address straight to `sound.js`, where **an unmapped address THROWS** --
so a silent drop is not the failure mode here. A wrong or missing post is.

**WHY THIS STILL NEEDS MEASURING.** Every one of these paths is days old:
- the star's collect arm was **dead until W411** -- `$27FA34`'s backward `bne` was read as a no-op
  and a test defended that reading for eight waves;
- the medal did not **spawn** until W411 and had no **art** until W414;
- kind 3 was ported in W417 and **is not reached on any bench here**.

So "the code posts a cue" is inference. **The deliverable is a measurement**: drive a real collect
for each pickup and record that `soundPost` was called, with which address, exactly once per
collect, and that `sound.js` resolved it to a wrapper rather than throwing.

**Specific things to check, each of which has bitten this project:**
1. **Once per collect, not once per frame.** The collected record lives on for its transform
   (`$280FDC`); if the arm re-enters, the cue re-posts. Count posts against collects.
2. **The `ctx.soundPost?.` optional-call.** If `ctx.soundPost` is undefined on some bench the post
   silently vanishes -- that is exactly how `ctx.menuCarry28D53C` hid a dead arm for 45 waves
   (W418). Assert the sink is present, not just that the call site exists.
3. **P1 versus P2.** `$27FE24 btst #$C,D1` picks the counter pair; confirm the cue is not on one
   arm only, the way the impact draw gate was (W412).
4. **The bee's is a different address** (`$28C62A`, `bee.js:1872`) and is posted from its own body,
   not the shared arm. Do not assume the shared arm covers it.

**If they all fire, say so with the counts and close this.** A null result that is measured is worth
more than a fix that is guessed.

### D53: THE PAGE SERVED A STALE MIX AND ONLY A HARD RELOAD FIXED IT

> "website for gbtman.pages.dev gave me an error when selecting dodonpachi. Only cleared when I
> ctrl shift r'd. We need a weapon against this staleness."

Owner, 2026-08-18. **This outranks port work when it recurs**, because a stale mix produces errors
that look exactly like port defects and can burn a whole wave being chased in the wrong place.

**IT IS NOT THE HTTP HEADERS.** `dist/_headers` already sets `no-cache` on `/*` and `/games/*`, and
`no-store, must-revalidate` on `/` and `/index.html`. Those are as strong as headers get.

**IT IS THE SERVICE WORKER**, `dist/games/ddpdoj/sw.js`, registered at `index.html:908`. A service
worker survives an ordinary reload and is bypassed by Ctrl-Shift-R, which is exactly the symptom
described. Its design is mostly right and should not be torn up: caches are build-scoped
(`ddpdoj-shell-${BUILD}` / `ddpdoj-assets-${BUILD}`, `BUILD` rewritten by `build-dist.mjs`), old
caches are deleted on activate, `skipWaiting` and `clients.claim` are both called, and a previous
wave already fixed `caches.match` searching every cache on the origin.

**THE REMAINING HOLE, and it fits the report exactly: asset URLs are NOT content-hashed.** So the
same URL means different bytes across builds, and the failure is a race rather than a logic error:

1. A deploy lands. The user opens the page. The **OLD** worker is still the active one.
2. The navigation is network-first, so the browser gets the **NEW** HTML.
3. That HTML requests its modules and assets by **unchanged URLs**, and the old worker answers them
   **cache-first out of its own shell cache** -- old bytes.
4. New HTML plus old modules is the mix, and the error follows.
5. The new worker installs, claims, and deletes the old caches, so a hard reload looks like a fix
   and the next visit is clean. **That is why it appears intermittent.**

**Fixes, cheapest first. Do not do all of them.**
1. **Content-hash the asset filenames** in `build-dist.mjs`. Then a new build cannot be answered
   from an old cache, because the URL differs. This closes the hole rather than narrowing the race,
   and it makes the aggressive headers unnecessary for those files.
2. Or stamp the build id into the shell request URLs (`?v=BUILD`), which is the same idea with less
   plumbing and a slightly dirtier cache.
3. Or make the shell network-first as well. Simplest, and it gives up the offline shell.

**Whatever is chosen, prove it the way this project proves everything else:** deploy twice in a row
and show that a page loaded against build N, without a hard reload, ends up running build N+1's
modules and not a mixture. **A single clean load is not evidence** -- the failure is a race and will
pass most of the time.

### D54: SOUND LAGS ABOUT ONE SECOND BEHIND THE ACTION

> "I also have this issue where sound lags behind by about 1 second"

Owner, 2026-08-18, same session as D53. **Roughly one second is a very large number** -- far beyond
scheduling jitter -- so it is a buffering or queue-depth fact, not a timing wobble, and it should be
measurable rather than guessed at.

**Start by deciding WHERE the second is**, because the three candidates need different fixes:
1. **Emission**: the port posts cues into a ring (`ctx.soundPost` -> `sound.js`). If the ring is
   drained slower than it fills, the delay grows with activity rather than staying constant. **Ask
   the owner whether the lag grows during heavy play or stays fixed** -- that one answer separates
   this case from the other two.
2. **The audio graph**: a large buffer or a scheduled start offset in the web audio layer costs a
   fixed delay regardless of load.
3. **The frame clock**: if cues are posted against emulated frames but played against wall time, and
   the two drift, the gap accumulates.

**Measure it, do not infer it:** timestamp a cue at `soundPost` and at the moment it is actually
audible in the graph, and report the distribution over a run rather than a single figure. A fixed
offset and a growing one have different causes and different fixes.

**COORDINATOR'S MEASUREMENT, 2026-08-18, before any wave is spent.** The mechanism is almost
certainly a BACKLOG, and the arithmetic fits the owner's "about 1 second" exactly:

- `sound.js` enqueues cues onto a **100-slot ring** at `$81DD1E`, head `$81DEAE`, tail `$81DEB0`.
- `drainFrame` dequeues **exactly ONE longword per frame** -- `$18ACE0`, the BIOS pump. That is
  faithful to the cartridge and must NOT be "fixed" by draining faster.
- At 60 fps, **one cue per frame means 60 queued cues IS one second of lag**, and a 100-slot ring
  can hold over 1.6 seconds before it even starts dropping.

**So the question is not the drain rate. It is whether the port ENQUEUES more than the cartridge
does.** The drain is the cartridge's; the posts are ours.

**THE MEASUREMENT THAT SETTLES IT**, and it is cheap: run a bench and record ring DEPTH
(`tail - head`, modulo the 400-byte span) every frame.
- **Depth grows monotonically** -> the port over-posts. Then find which cue: count posts per
  address per frame and look for one firing every frame instead of once per event.
- **Depth stays near zero and the lag is still there** -> it is not the ring at all; it is the web
  audio layer, and this item moves out of `sound.js` entirely.
- Watch `frameDrops` too: if the ring is overflowing, the port is not merely late, it is **losing
  cues**, and the owner would eventually notice missing sounds as well as late ones.

**THE PRIME SUSPECT, and it is already written down in D52:** a cue posted **once per frame while a
record lives** rather than once per event. The collected item record survives its transform, so a
collect arm that re-enters would post on every frame of it. One such cue at 60 posts a second, into
a queue that drains 1 a frame, produces exactly this symptom and grows with activity.

**THE OWNER ANSWERED, 2026-08-18, AND IT IS BETTER THAN THE QUESTION ASKED:**

> "I think sound lag happens if my computer is loaded heavily, particularly when starting the game.
> Then the sound might end up desynced. If I restart the game again by reloading page it often has
> synced sound"

**That is a LATCHED STARTUP BACKLOG, and it fits the ring arithmetic exactly.** Read against the
mechanism above, every clause of that sentence is diagnostic:

- **"when starting the game"** -- boot posts a burst of cues.
- **"if my computer is loaded heavily"** -- under load the emulator's frames run slow while the
  posts still happen, so the ring fills faster than one-per-frame can drain it.
- **"then the sound might end up desynced"** -- and here is the crucial part: **the drain is one per
  frame and the steady-state post rate is roughly one per frame too, so a backlog acquired during
  the burst NEVER CLEARS.** The queue depth reached during startup becomes a permanent offset for
  the rest of the session.
- **"reloading the page often has synced sound"** -- a reload starts with an empty ring. If the
  machine is not loaded that time, no backlog forms and there is nothing to persist.

**SO THE EARLIER HYPOTHESIS IS PROBABLY WRONG.** This item first suspected an over-posting cue
firing every frame (D52's shape). That would make the lag grow steadily during play. The owner
describes it as established AT START and then STABLE -- which is a one-time fill, not a leak.
**Check the over-posting theory anyway, but do not lead with it.**

**WHAT TO MEASURE, and it is now very specific:** record ring depth per frame across a boot,
deliberately under simulated slow frames. The prediction is a rise during the startup burst and then
a FLAT plateau -- never recovering, because the drain has no headroom to catch up.

**AND THE FIX IS A DESIGN QUESTION, NOT A BUG FIX, so bring it back before implementing.** The
one-per-frame drain is the cartridge's own behaviour (`$18ACE0`) and must not simply be raised: on
real hardware the frame rate never stalls, so a backlog of this kind cannot form and the cartridge
has no recovery path because it never needs one. The port faces a situation the original never did.
Options, none obviously right:
1. **Drain more than one per frame while a backlog exists**, converging back to one. Diverges from
   the cartridge only in a state the cartridge cannot reach.
2. **Drop cues when the depth exceeds a threshold.** Keeps timing honest, loses sounds.
3. **Do not post while frames are stalling.** Prevents the backlog at the source, needs a definition
   of stalling.

**Option 1 is the most faithful in spirit and the least faithful to the letter.** That trade is the
owner's call, and it is exactly the kind of question D40 exists for.

**THE OWNER DECIDED, 2026-08-18:** *"would be nice to have a way to make sure it stayed synced."*

**So: OPTION 1. Catch up, and keep every cue.** Dropping sounds (option 2) is rejected -- the owner
asked for sync, not for silence, and losing cues would trade one audible defect for another. Option
3 is rejected as too blunt: it needs a definition of "stalling" and it suppresses audio exactly when
the game is busiest.

**WHY THIS IS NOT A FIDELITY BREACH, and the argument matters because this project's standing rule
is fidelity over convenience.** On the real board the drain is one per frame AND the frame period is
always 1/60s, so those two facts together mean a cue plays a fixed, small time after it is posted.
The port can only guarantee the first. When frames stall, holding the drain at one per frame stops
being faithful to the cartridge and starts being faithful to an accident of the port's own
scheduling -- the cue plays LATER than the hardware would ever have played it. **Draining the
backlog restores the cartridge's actual timing relationship. It diverges from the letter of
`$18ACE0` only in a state `$18ACE0` can never be in.**

**IMPLEMENTATION SHAPE, to be measured not assumed:**
- Drain one per frame in the normal case, so nothing changes when there is no backlog. **A bench with
  a healthy ring must be byte-identical to today** -- assert that, or the change is unbounded.
- While depth exceeds a small threshold, drain extra per frame until it converges, rather than
  flushing at once: a flush would replay a second of stale cues in one frame, which sounds worse
  than the lag.
- Cap the catch-up rate so a pathological backlog cannot monopolise a frame.
- **The gate fingerprints will move if the drain order changes under load.** Decompose any baseline
  move and say which fields held; do not call it an RNG shift.

**PROVE IT THE WAY D53 WAS PROVEN:** simulate slow startup frames, show the depth rising and then
returning to zero, and show a normal boot unchanged. **A single clean run is not evidence** -- the
defect only appears under load, so the test must create the load.


**ASK THE OWNER FIRST:** does the delay GROW during heavy play or stay fixed? A growing delay
confirms the backlog and points at the over-posting cue; a fixed delay exonerates the ring entirely
and sends the wave to the audio layer. One sentence saves the measurement.

**Not urgent relative to D53**, but it is the kind of defect that makes everything feel wrong even
when the port is exactly right.


### D55: FULL SCREEN IN ALL CONFIGURATIONS, ASPECT PRESERVED, USING THE WHOLE DEVICE

> "We also definitely need a full screen mode in all configurations. Always preserve aspect ratio,
> but we need to use full possible screen of any device we're on."

Owner, 2026-08-18.

**FULLSCREEN ALREADY EXISTS AND IS NOT NAIVE.** `dist/games/ddpdoj/index.html` has a `FULL` button
and a `LOCK` button, and the code already handles the hard parts: iOS Safari has no
`requestFullscreen` on iPhone at all, the button state is driven from `fullscreenchange` rather than
from the click (because the user can leave by system gesture), and `devicePixelRatio` changes when a
window moves between displays. **Do not rewrite that. The gap is elsewhere.**

**THE GAP IS THE SCALER, AND IT IS DELIBERATE.** `web/app.js pickScale`:

    const scale = Math.max(1, Math.floor(Math.min(availW / pic.w, availH / pic.h)));

`Math.floor` means **only integer multiples are ever used**. Its comment says why: a fractional
scale "shows a resampled sub-pixel picture". That is a real choice -- integer scaling keeps every
emulated pixel an exact square block -- and it is **why the screen is not filled**. Measured against
a 240x320 picture:

| device | integer scale | height used | fractional would be |
|---|---|---|---|
| 1080p | x3 | **89%** | x3.38 |
| 1440p | x4 | **89%** | x4.50 |
| phone landscape 2340x1080 | x3 | **89%** | x3.38 |
| iPad 2360x1640 | x5 | 98% | x5.12 |

**So the owner's ask and the current code are in direct conflict, and that must be resolved
deliberately rather than by quietly deleting the `floor`.** Roughly 11% of the screen height is
being left unused on the most common displays.

**OPTIONS, with the trade named honestly:**
1. **Integer backing store, fractional CSS box.** Render at the next integer multiple UP, then let
   CSS scale it down to exactly fill. Fills the screen, keeps a clean source, and the resample is a
   minification rather than a blur-inducing magnification. **Probably the right answer.**
2. **Pure fractional scale.** Simplest, fills exactly, and gives uneven pixel sizes -- some rows one
   device pixel wider than their neighbours. On a shmup with a 1-pixel bullet this is visible.
3. **Keep integer, but guarantee the largest integer that fits the FULLSCREEN viewport**, and accept
   the letterbox. Honest but does not satisfy the request.

**"ALL CONFIGURATIONS" IS THE OTHER HALF OF THE ASK AND IT NEEDS ENUMERATING BEFORE IT IS BUILT:**
desktop windowed, desktop fullscreen, phone portrait, phone landscape, tablet, and the two-player
side-by-side mode if one exists. **Each has a different limiting dimension.** State which ones were
actually exercised and which were reasoned about -- this project has been bitten repeatedly by
conclusions drawn from a bench that could not produce the behaviour.

**ASPECT RATIO IS NON-NEGOTIABLE** -- the owner said "always preserve". Any fix must be measured on
a non-square viewport in BOTH orientations, and the assertion must be that the ratio is exact, not
merely close.

**A TEST ALREADY EXISTS:** `tests/web-page.test.js` section 5 covers `pickScale`, because it is "the
arithmetic that decides which shard gets promoted". Whatever changes here must keep that intact and
add cases for the fill behaviour. **Make the new test fail on HEAD first.**


### D56: THE HYPER LASER STILL HAS NO HIT ANIMATION, AND D42 WAS CLOSED ON A BENCH THAT HAD NO HYPER

> "If you push laser and then bomb when you have a hyper, and then you continue firing your
> laser... that still lacks the hit animation"
> "I remember this being an issue for normal laser too but we eventually got it, bomb laser seems
> to be doing fine, but hyper has been fucked for a long time and you keep saying you found it"
> "bomb is just the trigger for hyper, there is no bomb -- you activate hyper by pressing bomb
> while lasering"

Owner, 2026-08-18. **The complaint about repeated false claims is correct and is the most important
line in this item.**

**WHAT W412 ACTUALLY PROVED, AND WHAT WAS CLAIMED.** W412 found a real defect -- `$24CBCC` is
`bclr #7,($1,A6)` and the port had it on A3, so the beam head was never retired -- and fixing it
moved the muzzle slot from 24 live frames to 742. That fix is real and the owner confirms the
**normal** laser is now correct.

**But the bench was `stage1-laser-hold`, fire held, with NO HYPER ACTIVE.** The word "hyper" appears
in `tests/w412laserhead.test.js` exactly ONCE -- in its title. **The hyper path was never
exercised, and the coordinator reported the hyper laser as fixed anyway.** That is the overclaim,
and it is the fourth time this project has drawn a conclusion from a bench that could not have
produced the behaviour it was reasoning about (W399/W403 installed only the A4 table; W410 called a
rarity authentic when it was a one-register bug; W411 had to force carrier state to prove a path).

**THE MECHANISM, AND IT IS A HYPOTHESIS UNTIL A BENCH WITH A LIVE HYPER SAYS OTHERWISE:**

- `$249A92 bset #$7,($1,A6)` sets bit 7 of the record's `flags1`.
- It sits at `$249A92`, **inside the HYPER arm** -- `BOMB.hyperArm = $249868`, and `bomb.js:171`
  labels that arm "the NON-ZERO arm. **NOT the bomb**", which matches the owner exactly: bomb is
  only the trigger, there is no bomb.
- The laser reads the SAME bit as "a head is already out there": `$24CBB2 bset #$7,($1,A6) / beq
  $24CCD0` lays a head only when the bit was CLEAR (`laser.js:478`, `if (!ram.bset8(...)) toHead`).
- The only clears are `$24CBCC` (`laser.js:530`) which runs **inside the head path**, and `$25279A`
  (`laser.js:342`).

**So activating hyper sets the flag, the laser then sees it set and skips laying a head, and the one
clear that would release it lives on the path that is now skipped.** The head is never re-laid, and
the relaunched head IS the hit animation. That explains every clause of the report: normal laser
fine (nothing sets it), the trigger being what breaks it, and it persisting while you keep firing.

**THE HARD REQUIREMENT FOR THIS WAVE, AND NO CLAIM WITHOUT IT:** the bench MUST have a hyper granted
and activated by the bomb input while the laser is held. **Measure the muzzle slot's live frames and
the block-7 overlaps across the activation** -- before, during and after. A run that never activates
a hyper proves nothing about hyper, however green it is.

**Also verify, do not assume:** whether the hyper arm's A6 is the same block the laser's `$24CBB2`
reads. The port maps one as `rec + P.flags1` and the other as `opt + OPT.flags1`; both are offset
`$01` (`machine.js:81` and `:157`) but they are different bases, and **W412's entire defect was
exactly this class of mistake -- the same instruction text read against the wrong base.** If they
are different blocks, this hypothesis is wrong and the real cause is elsewhere; say so.


### D57: A SOUND LOOPS FOREVER AFTER TABBING AWAY AND BACK -- THERE IS NO AUDIO BACKSTOP

> "Went to the inbetween level score screen. Looks good! Clicked some other tabs, game went silent
> as it should. Came back, started level 2, and now a sound probably from before kept looping and
> it never goes away. very annoying bug."

Owner, 2026-08-18. **This is the worst of the audio cluster** because it does not recover: the other
sound defects are late or missing, this one is permanent until reload.

**THE ASYMMETRY IS THE FINDING, AND IT IS ALREADY IN THE TREE.** `src/web/input.js` has a
**blur / pagehide / visibilitychange BACKSTOP** -- three of them, in fact: one that "clears the whole
mask" (`input.js:24`), one for the coin word specifically because it is separate state
(`input.js:216`), and a third at `:418`. `app.js:1650` cites "its own blur / pagehide /
visibilitychange backstop for the same reason".

**There is NO equivalent anywhere on the audio side.** A grep of `src/sound.js` and `src/web/` for
those three events returns nothing, and there is no audio module in `src/web/` at all.

So the pattern the input layer already applies -- *a browser event can strip you of the "release"
half of a press, so clear the state explicitly* -- **has never been applied to sound**, where the
same hazard exists: a cue that is playing or looping when the tab hides has no counterpart to stop
it, and the state that would have stopped it belongs to a frame that never ran.

**WHAT TO ESTABLISH FIRST, in order:**
1. **Is the stuck sound a LOOPING cue or a retriggered one?** The packed longword carries
   `[type][pan][id][chan]`, and `sound.js` distinguishes `WRAPPERS` from `STREAMING_LEAVES`. A
   streaming/looping leaf that never receives its stop behaves exactly as described. **Read the type
   of whatever is stuck rather than guessing.**
2. **What happens to the ring while hidden?** If frames stop but posts do not, this compounds D54:
   the owner tabs away, the ring fills, and on return it plays a backlog AND holds a stuck loop.
   Measure the depth across a hide/show.
3. **Does the audio context suspend and resume cleanly?** "Game went silent as it should" says the
   suspend works. The defect is on the way BACK.

**THE FIX IS PROBABLY THE INPUT LAYER'S OWN PATTERN**, and it should look like it deliberately:
a backstop on the same three events that silences live channels and drops anything mid-flight, so
returning starts from a known-quiet state rather than resuming a frame that no longer exists.

**Prove it by reproducing it first.** Hide, wait, show, and demonstrate the stuck cue -- then show
the same sequence silent after the fix. **The owner reproduced this in ordinary play; a wave that
cannot reproduce it has not understood it.**

### D58: THE BOSS EXPLOSION HAS NO SOUND, ON LEVEL ONE AND PROBABLY ALL LEVELS

> "boss explosion doesn't have a sound on level one. None of the other levels likely do either"

Owner, 2026-08-18.

**The owner's "probably all levels" is a hypothesis worth testing FIRST**, because it decides the
shape of the whole item. If every boss is silent, the cause is one shared death path and the fix is
one place. If only level one is silent, it is that boss's own script and the others need checking
individually. **Establish which before porting anything.**

**Where to look, and what NOT to assume:** the boss death chain is `hibachi2.js` / `hibachiend.js`
for the final boss and `boss.js` for the ordinary ones, and the cue mechanism is
`ctx.soundPost?.(addr)` into `sound.js`. **Do not conclude "no cue is posted" from a grep** -- W412
had an emitter firing 297 times per 900 frames while the owner saw nothing, because the defect was
two files away in a register. And **an unmapped address THROWS rather than going silent**
(`main.js:547`), so a silent explosion is NOT an unmapped wrapper.

**Candidate shapes, in the order they cost:**
1. The cue is posted but into the backlog described in **D54**, arriving so late it is not perceived
   as the explosion. **Check D54 first -- it may be the same bug.**
2. The cue is posted on a frame the death path no longer reaches, the way `bossExitShared` had no
   phase-B caller for three waves after W403 dropped a jump.
3. The cue was never ported and its `jsr` is a counted note.

**Related and possibly the same root:** D52 is still open on whether the bee's collect sound fires,
and the owner has confirmed medals DO sound. So the audio chain works in general, which makes shape
3 less likely than it looks.


### D54 UPDATE: FIVE SECONDS PROVES A SECOND QUEUE THE ANALYSIS DID NOT ACCOUNT FOR

> "in level 2 sound is now like 5 seconds behind, the looping stopped, but I switched window focus
> a lot"

Owner, 2026-08-18. **This breaks the coordinator's own arithmetic, and that is the useful part.**

The ring is **100 slots** drained **one per frame**, so at 60 fps it can hold **1.67 seconds at
absolute most**. The owner measured **five**. Therefore:

**THE RING IS NOT THE ONLY QUEUE. There is a second one downstream, and it is unbounded.** Any wave
that fixes only the ring will move the number and not the defect.

It also confirms the mechanism's shape: **"I switched window focus a lot"** and the lag grew with
each switch. That is a backlog accumulating per hide/show cycle -- frames stop while posts do not --
which ties D54 and **D57** together as very likely one root cause with two symptoms.

**FIND THE SECOND QUEUE FIRST.** `main.js:547 soundPost` hands to `sound.js`, and `AudioContext`
appears in `src/web/app.js` and the page. **Where do cues wait between `sound.js` and the audio
graph, and what bounds that?** Nothing above the audio layer can be trusted until that is named.

### D59: BEES FLICKER BUT CANNOT BE SHOT, FREED OR COLLECTED

> "Many places I can see bees flickering. But I can't shoot them, free them, or collect them. We
> have a big bee issue since bees are so important as a clear criterion for the better ending or
> second loop or Hibachi or something"

Owner, 2026-08-18. **The owner is right about the stakes**: the bee count gates the loop-2 and true
ending conditions, so this is not cosmetic.

**WHAT IS ALREADY MEASURED, and it makes this stranger than it looks.** W410 proved the bee path is
COMPLETE: forcing ten carriers into the state a kill leaves produced **ten bees, nothing threw**,
against a control of zero. So allocation, fill, driver, body and draw all work.

**The carrier is the problem, and W410 found why.** Sub-proto word 0 is `$8100`:
- the ordinary shot pass `$244F90 andi #$2000` needs **bit 13** -- clear, so it skips;
- block 8 and the beam's own pass `$245472 btst #$5` need **bit 5** -- clear, so they skip;
- **only block 7 accepts it** (`$245218 btst #$5,D4` OR `$24521E btst #$0,D4`, and `$81` has bit 0).

**And block 7's A2 is `$811802` -- beam slot 27, the laser MUZZLE.** W410 measured zero overlaps in
5,400 frames because the muzzle was live 24 frames total. **W412 fixed that** (`$24CBCC` on the
wrong register): muzzle 24 -> **742** live frames, block-7 overlaps **0 -> 84**.

**SO BEES SHOULD BE HITTABLE IN THE PUBLISHED BUILD AND THE OWNER SAYS THEY ARE NOT.** That is the
whole item. Possibilities, and the first two are cheap to separate:

1. **D56 is the cause.** If activating hyper leaves the head flag set, the muzzle stops being laid
   again -- and the muzzle is the ONLY thing that can damage a carrier. **Ask whether bees are
   hittable BEFORE any hyper is used in the run.** If they are, D56 and D59 are one bug.
2. **"Flickering" may be the carrier, not the bee.** Establish which object the owner is seeing.
   A carrier that flickers and cannot be shot is a different report from a released bee that cannot
   be collected, and they have different fixes.
3. The 84 overlaps are real but land somewhere that does not damage -- W412 measured overlaps, not
   deaths. **An overlap is not a kill; check the damage actually applied.**

**DO NOT REPEAT W111.** `bee.js:796` records a wave burned on an already-closed path. And do not
repeat W412's error either: **measure on a bench where a carrier is actually present and shot at**,
and report kills, not overlaps.


### D54 RESOLVED BY W423 -- THE SECOND QUEUE WAS `chip.outLen`

Found, measured and bounded. **It was not in `games/ddpdoj/` at all**, which is why the first
search for it came up empty: it is `shared/audio.js`, backed by `ics2115.js:220 _ensureOut`, a
Float32Array that **doubles forever with no ceiling**.

`MAX_BACKLOG_FRAMES = 15` bounds one pump to 250 ms of emitted audio, produced in the 16.7 ms one
rAF costs -- so every catch-up burst leaves ~233 ms behind **permanently**. The valve bounded the
rate; nothing bounded the buffer. Each window-focus switch is one more burst, which is exactly the
shape the owner described.

    bursts of 30 frames    before      after MAX_BUFFERED_S = 0.25
       5                   1.099 s     0.219 s
      20                   4.605 s     0.226 s      <- the owner's "about 5 seconds"
      40                   9.280 s     0.234 s

Steady 60 Hz play is untouched: 0.016 s buffered, nothing discarded over 600 frames.

**The owner's "catch up the backlog, keep every cue" is honoured literally.** The trim throws away
rendered SAMPLES, never a `frame()` call, so every cue still reaches the chip and its state cannot
drift from the driver's. A test pins that. `stats()` now reports `stale` so the next report of lag
is answerable from the on-screen numbers.

**D57 is still open and is likely the same root cause.** This bounds the lag; it does not give
audio the visibility backstop `input.js` has three of.


### D60: UNPORTED `$286AAA` -- THE LASER SCORE MACHINE, REACHED BY HYPER AT THE STAGE-2 BOSS

> "reached boss of level 2, hit c to shoot, went over and hit y while having c pressed, and got this
> just when fight was about to start: $286AAA IS NOT PORTED YET."

Owner, 2026-08-18. **THIS IS A HARD STOP, not a cosmetic defect.** The port refuses rather than
inventing frames, which is correct behaviour, but the run is over. It outranks the rest of the
docket for that reason alone.

**THE REPRODUCTION IS EXACT AND THE OWNER HANDED IT TO US:** stage-2 boss, laser held (`c`), then
hyper triggered (`y`) while still holding it, at the moment the fight starts. Any bench for this
MUST do all three -- hold the laser, activate hyper on top of it, and be at the boss.

**WHAT THE REFUSAL SAYS.** `$28687E bne $286AAA` is the `$400` arm's OTHER entry. It lands INSIDE
`$286A82`'s body (`$286AAA move.l D0,D3 / tst.w $811F72`) and shares its 282-byte tail. The gate is
`$8130F8` **bit 2**, and that bit has been **0 on every frame of every run in this repo** --
including 601 steps of a live beam in W51. So reaching it means the laser SCORE machine `$286A82`
is live, and `$286A82` needs `$2867B4` ported with it (`37-recon-laser` section 9.8).

**THIS IS THE THIRD TIME HYPER HAS BEEN THE UNDER-TESTED PATH, and the owner said so first:**
*"hyper has been fucked for a long time and you keep saying you found it"*. D56 records me closing
an item on a bench where the word "hyper" appeared once, in the test's title. **`$8130F8` bit 2
being 0 in every run in the repo is not evidence the path is dead -- it is evidence no bench has
ever activated hyper while lasering.** Treat a zero measured over benches that never enter the
state as measuring the bench, not the game.

**IT MAY ALSO BE D56 AND D59's ANSWER.** If hyper-while-lasering drives the beam into a scoring
arm no bench has run, that is a plausible common cause for the missing hyper hit animation (D56)
and possibly for carriers not taking damage (D59, whose only damage source is the beam muzzle).
**Port this first and re-check both before spending a wave on either.**

Unit: port `$286AAA` plus `$286A82` and `$2867B4`. Declare new ROM windows, never widen.


### D60 RECON (coordinator, inline): ALL THREE GATES IDENTIFIED, AND THE "NEVER 0" NOTE IS WRONG

The refusal names one gate. There are three, and every one of them is open in the owner's exact
scenario. This is why it fired for them and never for us.

**GATE 1 -- `$8130F8` bit 2. IT IS SET AT BOSS ARRIVAL, IN OUR OWN PORT.** A whole-image scan of
every static bit operation on `$8130F8` finds `bset #2` at exactly six sites -- `$29279C`,
`$2971F0`, `$29BCBC`, `$29ED3A`, `$2A5994`, `$2A63B2` -- and **every one is immediately preceded by
`bset #0,$8130F8`**. The port already implements that pair as `| 0x05` at `initbody.js:1161`,
`:1226` and `:1256`. So the bit goes up when a boss arrives, which is precisely when the owner saw
it: *"just when fight was about to start"*.

**`score.js` line ~127 says `$8130F8` bit 2 "was 0 on all 600" frames and calls the arm "two
independent gates away from reachable". That note is measuring the bench.** Its 600 frames held the
beam with no boss and no bomb. Neither gate could have been open. **Correct the note as part of
this unit** -- leaving it invites the next agent to re-derive that the path is dead.

**GATE 2 -- `$811F72`'s sign, and this is the bomb-laser, not the beam.** W45 established
`$811F72` is the **BOMB-LASER's** 45 x $30 record, and the only thing that selects that weapon is
**`$24989E bset #$0,($1,A6)`, INSIDE THE BOMB**. The owner's input is `y` (bomb) pressed while `c`
(laser) is held. **That is the instruction that opens gate 2**, and it is also exactly the weapon
of the owner's D43 report -- *"If you use laser while firing bomb, a stronger laser comes out"*.

**GATE 3 -- the hit itself.** `$286876 btst #2` is reached from the score post of a hit, so a boss
had to be present to be hit. Stage-2 boss supplies it.

**SO THE PORT BRIEF'S BENCH IS FULLY DETERMINED, and nothing about it is guesswork:** set
`$8130F8` bit 2 (or run boss arrival), select the bomb-laser via `$24989E`'s bit so `$811F72` is
live and negative, then post a hit. **If that bench does not reach `$286AAA`, the bench is wrong,
not the game** -- the owner has already proved the path executes.

**AND NOTE WHAT THIS MEANS FOR D43.** That report was never fully closed, and the weapon it names
is the same weapon that opens gate 2 here. Re-read D43 against this before treating them as
separate items.


### D57 FIXED BY W423 -- AUDIO NOW HAS THE BACKSTOP INPUT HAS HAD SINCE W375

**THE ASYMMETRY WAS THE WHOLE FINDING.** `input.js:246` wires `blur`, `pagehide` AND
`visibilitychange` and clears the entire button mask, because a key held when focus is lost never
sends its keyup. Audio had the identical hole -- a tab-away leaves logic frames that all arrive at
once on return -- and a search of `games/ddpdoj/src/web/` found **no audio listener for any of the
three**. It has one now, on all three events and on both edges, attached to the target and to
`globalThis` (a canvas target would never see `visibilitychange`, which fires at `document`).

`AudioController.resync()` drops the pending queue, the rendered samples on both sides of the
resampler, and disarms the scheduling clock so the next pump re-arms at NOW instead of inheriting
an offset ten seconds stale. It is a no-op before the arming gesture.

**THE CHIP IS DELIBERATELY NOT RESET, and that is the trap this could have walked into.** Voices,
envelopes and length counters are the game's state. Zeroing them would silence music the driver
still believes is playing and nothing would restart it -- a stuck-silent bug traded for a
stuck-looping one. A test pins that the chip is never reset and that audio resumes after a resync.

**RULED OUT, so nobody re-checks it: the backlog valve does not lose cues.** `ics2115.frame` calls
`applyLog(log)` unconditionally, before `emit` is consulted, so even a fully dropped batch still
applies every register write. A lost note-off was the obvious explanation for the stuck loop and it
is not the explanation.

`stats()` reports `resyncs` alongside `stale`, so the next report is answerable from the numbers.


### D58 DIAGNOSED: THE `$28BBAC` TIER HAS NO POSTING PATH, SO FIVE CUES ARE COUNTED INSTEAD OF PLAYED

> "boss explosion doesn't have a sound on level one. None of the other levels likely do either"

**The owner's guess that other levels are affected too is right, and for a structural reason:
these are not per-level cues.** One shared posting gap silences all of them.

`sound.js`'s `WRAPPERS` table describes exactly one packer, `$28BB04` -- every row sets THREE
immediates (id, pan, channel). **`$28C170` is a different shape entirely:**

    28C174  move.w #$15,D0      28BBAC  lsl.w #8,D0        the OTHER packer
    28C178  moveq  #0,D1        28BBAE  or.w  D1,D0
    28C17A  jsr $28BBAC         28BBB0  swap  D0
                                28BBB2  move.w #$0,D0
                                28BBB6  bra $28BAA0        the ring enqueue

So the longword is `((D0<<8|D1)<<16)` with a **ZERO low word** -- no id byte, no channel nibble,
no gate, no pan tail. `$28C170` posts **`$15000000`**. `$28C186` is its sibling (D0=`$16`, D1 from
the caller). Giving either a `WRAPPERS` row would invent an id, a pan and a channel the cartridge
never loads; `postWrapper` correctly throws `no wrapper at $28C170` instead.

**FIVE SITES ARE WAITING ON THIS, and they are all things the owner would notice:**

    boss.js:1238      $242922  the BOSS-CLEAR cue          <-- D58
    boss.js:1326      $2A6D8C  the ENDING block's cue
    objslot13.js:333  $288A3C  slot 13 state 4, GAME OVER
    hibachi2.js:169   $2A7008
    background.js:1203  the scroll VM's CUE op

**UNIT: give the `$28BBAC` tier its own posting path** -- a second, separate path, NOT a row in
`WRAPPERS`. Then convert the five `note()` calls into real posts. That is one small unit and it
lights up a boss clear, a game over and an ending.

**ONE HONEST CAVEAT, do not skip it.** The owner said "explosion", and what is proven silent here
is the boss-CLEAR cue. Whether the explosion SFX is this cue or a separate one is **not
established**. Confirm which cue the owner is missing before declaring D58 closed -- the D56
mistake was exactly this, closing an item on a bench that never exercised the reported thing.


### D55 FIXED BY W423: FULLSCREEN NOW USES THE SCREEN

> "We also definitely need a full screen mode in all configurations. Always preserve aspect ratio,
> but we need to use full possible screen of any device we're on."

**THE BUTTON ALREADY EXISTED.** W268 (D10) shipped it, which is why this looked like a duplicate
and is not. What it did not do was USE the screen: `pickScale` floors to a whole multiple, so
everything between one multiple and the next stayed black bar.

**THE OWNER'S SENTENCE ALSO SETTLED THE QUESTION THIS ITEM WAS BLOCKED ON.** It had been recorded
as needing their call on integer-versus-fractional scaling. "Use full possible screen of any device
we're on" is that call, and "always preserve aspect ratio" is the constraint it comes with -- so
ONE scale for both axes, never two.

MEASURED, picture area recovered, every configuration:

    1080p tate   2   -> 2.41   +45.3%      iPhone 14 Pro tate  5 -> 5.26   +10.8%
    1080p yoko   4   -> 4.29   +14.8%      iPhone 14 Pro yoko  2 -> 2.63   +73.1%
    1440p tate   3   -> 3.21   +14.8%      iPad Pro 11 tate    5 -> 5.33   +13.7%
    1440p yoko   5   -> 5.71   +30.6%      iPad Pro 11 yoko    3 -> 3.72   +54.0%
    4K tate      4   -> 4.82   +45.3%      Pixel 7 tate        4 -> 4.83   +45.7%
    4K yoko      8   -> 8.57   +14.8%      Pixel 7 yoko        2 -> 2.41   +45.7%

**THE FLOOR IS NOT REMOVED, AND THAT IS THE CAREFUL PART.** It exists because of a defect reported
from play -- the Batman port's dithered circle came out looking like tetris pieces on a fractional
scale. So `fill` is opt-in, the page passes it ONLY while actually fullscreen, and **`fill` still
floors below 2x**: between 1x and 2x the uneven pixels differ by 100% (one device pixel against
two), which IS that defect. Above 2x the worst case is 3 against 4.

The page reads `document.fullscreenElement` rather than a flag of its own, so leaving fullscreen
with Escape -- which fires no click -- still fits the windowed way.

Seven tests in `w423fullscreenfill.test.js`; **three were proven to fail with the fill branch
disabled**, and the other four are guards that must hold under both readings, including "the
windowed path is byte-identical to the pre-D55 arithmetic".


### D60 CLOSED BY W424: `$286AAA` IS PORTED, AND THE OWNER'S RUN NO LONGER DIES

`$286A82`, `$286AAA`, the shared tail `$286AEA..$286B9A` and the rank feeder `$2867B4..$2867DC` are
ported. The `unreached(SCORE.altBombShared, ...)` in `bombHitChain` is gone. `$286B9C` is P2's and
correctly stays a note.

**WHAT THIS ARM ACTUALLY IS, which no note in this repo had said**: `$81B60C/$0E/$10/$12` are
`hud.js`'s `itemTimer/itemDir/itemCount/itemKind` -- **the on-screen ITEM COUNTER** that `$2857B4`
draws as an 8-nibble BCD walk. So this is the laser's hit-counter display plus the pending-score
add, not "some chain words".

**GATE 1 CONFIRMED AT THE OWNER'S EXACT STAGE:** `initbody.js:1161`'s `| 0x05` sits literally
inside the STAGE-2 BOSS's six palette installs.

**AND THE BENCH TRAP WAS REAL.** In the owner's scenario `$286AAA` goes STRAIGHT TO THE TAIL:
`$811F72` is negative because the bomb selected the bomb-laser, so `$286AB2 bmi` is taken and the
start block never runs. **A fresh `Ram()` takes the OTHER arm and exercises none of the tail, the
rank feeder or the score add** -- a bench that forgot to dirty RAM would have been green while
testing none of the code the owner executed. The wave pinned that hole as its own test.

Findings worth keeping:
- **`$286A92`'s fork is live BOTH ways**, and the two arms differ in the DIVIDER words while
  agreeing on the score -- **a score-only test would have passed under either reading.**
- `$2867B4`'s `bcc` displacement `$F6` branches BACKWARDS to `$2867B2`, which is `$286774`'s own
  `4E75`: the two feeders share a return. Its D2 is 4, or `$30` hypering, never `$286774`'s `$18`.
- `5042` is `addq.w #8,D2` confirmed: the reload is `16 - power`, `$D` at power 3, where the
  `addq #0` misreading gives `$5`. Different numbers, so the fixture discriminates.

**THE WAVE ALSO CORRECTED MY BRIEF.** I told it `games/ddpdoj/tests/*.js` are CRLF. **They are
not: 299 of 304 are LF**, and the five exceptions are `bullets`, `mover`, `w227death`,
`w36handlers`, `w62stageend`. My `grep -c $'\r'` check gives false positives and had already caused
one wrong conversion the same day. **Check line endings by BYTES, never with that grep.**

Verified by me on a quiet tree: 3919 pass / 0 fail / 0 skipped, gate exit 0 with 31 PASS / 0 FAIL,
606 ROM windows and none added -- correct, since the unit reads no ROM table.

**RE-CHECK D56 AND D59 AGAINST THIS.** The recon named this as their possible common cause, and it
is now ported. That check is cheap and has not been done.


### D59 LEAD (coordinator, verified from the bytes): FLICKER AND DAMAGE ARE SEPARATED BY ONE GUARD

> "Many places I can see bees flickering. But I can't shoot them, free them, or collect them."

**"FLICKERING BUT NOT DYING" IS A STATE THE CARTRIDGE CAN ACTUALLY BE IN, and block 7 is where.**
Swept this session, `$245246..$245250`:

    $245246  89 55                 or.w D4,(A5)             <- THE HIT BITS. This is the flash.
    $245248  0c 6d 6f 00 00 02     cmpi.w #$6F00,($2,A5)
    $24524E  64 04                 bcc.s -> $245254         <- bcc is UNSIGNED
    $245250  9b 6d 00 18           sub.w D5,($18,A5)        <- the HP subtract, SKIPPED
    $245254  4b ed 00 20           lea ($20,A5),A5

The hit bits are OR'd BEFORE the guard and the HP subtract comes AFTER it. So any record whose
`($2,A5)` reads `>= $6F00` **UNSIGNED** flashes on every overlap and never loses a point of HP.
And because the test is unsigned, that band includes every NEGATIVE Y (`$8000..$FFFF`), not just
large positive ones.

`src/damage.js` already transcribes this correctly (`if (ram.u16(rec + 0x02) >= 0x6f00) continue;`
sits between the `or.w` and the subtract). **So this is not a porting defect -- it is the
cartridge's own behaviour, and that is what makes it a lead rather than a fix.**

**THE CHECK, and it is cheap:** on a bench where a bee carrier is present and being shot at,
**print `($2,A5)` for the carrier's record on the frames block 7 overlaps it.** If it reads
`>= $6F00`, the carrier is being placed at a Y this guard rejects and the flicker-without-death is
fully explained -- and the question becomes why our port puts it there when the cartridge does not.
If it reads below `$6F00`, this lead is dead and the entry says so.

**THIS IS ALSO THE ANSWER TO THE DOCKET'S THIRD POSSIBILITY.** D59 already warned that W412
measured OVERLAPS, not kills, and that "an overlap is not a kill". `$245248` is precisely a place
where an overlap produces a flash and no kill. **Measure deaths, never overlaps.**

**DO NOT CLOSE D59 ON THIS WITHOUT THE MEASUREMENT.** It is a hypothesis with a named check, not a
finding. Closing an item on reasoning that was never exercised is the D56 mistake.


### D59 LEAD, CAVEAT ON MY OWN ENTRY: I CANNOT CONFIRM WHAT W412'S "84" COUNTED

The entry above repeats "W412 measured OVERLAPS, not kills". **I inherited that from the earlier
docket text and did not verify it.** There is no `w412*` test file in `games/ddpdoj/tests/`, so the
number cannot be checked from where it is quoted.

**AND THE PORT CUTS AGAINST IT.** In `damage.js` the counter increments AFTER the guard:

    ram.setU16(rec, ... | hitBits);                       // the flicker
    if (ram.u16(rec + 0x02) >= 0x6f00) continue;          // $245248 -- SKIPS, no count
    ram.setU16(rec + 0x18, u16(... - d5));                // the damage
    hits++;                                                // <-- only reached when damage landed

So `hits` already EXCLUDES guard-skipped records. **If W412's 84 came from this function's return
value, it counted DAMAGE EVENTS and the lead above is much weaker** -- 84 real hits landed and the
carrier still did not die, which would point at HP or at the kill path instead.

**BEFORE RELYING ON THE 84, FIND WHICH COUNTER PRODUCED IT.** The two readings send the next wave
to opposite places, and picking one without checking is how D42 was closed wrongly.


### D59 FOLLOW-UP -- TWO POSITION GATES ON THE CARRIER, AND ONE MEASUREMENT SETTLES BOTH

Beside `$245248`, the bee fill has its own. `bee.js:331`, describing `$280B3E`:

> "If the spawn position is off-screen the fill ABORTS (`$280B2A`): undoes the count bump, frees
> the slot, returns. **So a carrier that dies off-screen drops nothing.**"

So the carrier is gated on position TWICE, by two unrelated routines:

    $245248  position >= $6F00 unsigned  ->  FLICKERS, takes no damage
    $280B2A  spawn position off-screen   ->  dies, drops NO BEE

**THAT IS THE OWNER'S REPORT IN TWO LINES: "I can't shoot them, free them, or collect them."**
Cannot shoot = gate one. Cannot free = gate two. Cannot collect = nothing was ever spawned to
collect. A single wrong position explains all three symptoms without needing three bugs.

**BOTH GATES ARE FAITHFUL TRANSCRIPTIONS.** Neither is a porting defect. So the question is not
"which gate is wrong" but **"is our port putting the carrier somewhere the cartridge does not?"**

**ONE MEASUREMENT SETTLES IT.** On a bench with a carrier present and shot at, print the carrier's
position word every frame: `($2,A5)` on the enemy record for gate one, and `($2,A6)` on the
sub-record for gate two. If either is in a rejected band while the owner can SEE the object, the
position is the bug and both gates are behaving correctly. If both are in range, both gates are
innocent and this whole line of enquiry is dead -- **say so, and delete it**.

This is still a hypothesis. It is a much better shaped one than "the bees are broken", because it
predicts all three symptoms from one quantity and it names the number to print.


### D56 LEAD: THE HYPER LASER'S HIT ANIMATION REACHES **ONE** ENEMY PER FRAME

> "If you push laser and then bomb when you have a hyper, and then you continue firing your
> laser... that still lacks the hit animation"
> "bomb is just the trigger for hyper, there is no bomb"

Pressing bomb while lasering runs `$24989E bset #$0,($1,A6)`, which selects the **bomb-laser**. So
the weapon the owner calls the hyper laser is the one whose damage is `$2456A6`, and its hit
animation comes from there -- not from block 7, block 8 or `$2453AC`.

**AND `$2456A6` FLASHES EXACTLY ONE TARGET PER FRAME.** `bomb.js:1258` onward:

    $2457FA  tst.w $812954 / beq        -- nothing unless a NEAREST was recorded
    $245808  move.w $80FA72,D4
    $24580E  ori.w  #$400,D4
    $245812  or.w   D4,(A5)             <- THE HIT BITS, on ONE record
    $245814  subi.w #$208,($18,A5)      <- and the damage, on that same one

Pool B's loop deliberately does NOT damage inside itself; it records the NEAREST intersecting enemy
in `$812954` and damages that one afterwards. The ordinary bomb arm, by contrast, ORs the mask on
**every** enemy it touches (`$24569A`).

**SO "NO HIT ANIMATION" AND "ONE HIT ANIMATION YOU DID NOT NOTICE" LOOK THE SAME ON SCREEN**, and
the two have different fixes. **Establish which the owner is seeing before changing anything.**

**A STALE NOTE THAT WOULD HAVE SENT THE NEXT WAVE TO THE WRONG FILE, now corrected in place.**
`damage.js` said `$24560A` "is transcribed only as far as its own two guards ... and throws by
address beyond them". That was true when written and is not true now: W65 ported the arm and it
lives in `bomb.js`. The paragraph is KEPT as that wave's record with a dated correction under it.

**WHAT IS STILL TRUE, AND IT IS THE WHOLE PROBLEM:** both guards -- `$245614 bpl` needing `$811F72`
NEGATIVE, and `$245618 btst #$6` needing bit 6 of `($1,A4)` -- are **FALSE on every bench in this
repo**. So not one line of the owner's weapon has ever executed in a test here. That is a fact
about our BENCHES, not about the code, and it is the same distinction D60 turned on.

**THE UNIT FOR D56 IS THEREFORE A BENCH BEFORE IT IS A FIX:** get `$811F72` negative and
`($1,A4)` bit 6 set -- i.e. actually activate hyper while lasering -- and only then ask what the
animation does. D56 already records me closing this item once on a bench where the word "hyper"
appeared only in the test's title.


### D58 CLOSED BY W425 -- AND THE EXPLOSION WAS **NOT** THE CUE THE DIAGNOSIS NAMED

**THE CAVEAT SAVED THIS ITEM.** D58's diagnosis said the boss-clear cue `$28C170` was silent, and
insisted the wave establish whether the owner's "explosion" was that cue or a different one before
closing. **It was a different one.** Closing on `$28C170` alone would have been the D56 mistake
exactly.

The stage-1 boss death `$294DD4` does TWO things:

1. `$294DF0 jsr $242922` -> `$28C170`. ONE cue, at the moment the fight ends. That is D58's
   original diagnosis, and it was genuinely silent.
2. `$294E34 moveq #$6 / jmp $259962` arms A3 script 6, the death ANIMATION. Its states 2 and 3 tick
   timer D and dispatch through `lea ($1D8,PC),A0` -> **`$294134`**, an eight-entry table of cue
   wrappers, masked `andi.w #$1F`. **THOSE ARE THE REPEATED BANGS**, and `boss.js` had been
   counting the whole dispatch as ONE note.

Verified from the image by the coordinator: `$293F5C + $1D8 = $294134` (extension-word rule), and
the table reads `$28C25A $28C274 $28C25A $28C274 $28C2A8 $28C25A $28C2C2 $28C2A8`.

**THE BRIEF SAID FIVE SITES. THERE WERE NINE**, and two were LIVE THROWS rather than notes
(`objslot7pool.js $290B26`, `tally.js $260326`). All nine post now; no `note()` for `$28C170`
remains anywhere in `src/`.

New window `(0x294134, 0x20)`. **It ABUTS W107's `(0x294154, ...)` and did not widen it** --
confirmed by the coordinator. 606 -> 607 windows.

**TWO PRE-EXISTING LIES CORRECTED, both the W418 shape again:**
- `BOSS_NOTED` listed `$28C392`, `$28C2C2` and `$28C2A8` as deferred SOUND. **No `note()` in
  `boss.js` has passed those since Wave A** -- they have been real `soundPost` calls all along.
  Three documented gaps that did not exist, invisible because nothing read the table. Now
  `w62stageend.test.js` scans `boss.js` and fails on any dead key, so it cannot recur.
- `objslot8.js` predicted a `$28BBxx` path "would close all of these AND `$28C170` at once". It
  closed `$28C170` only: `$28C0FC` is `$28BB76`, a THIRD packer.

**STILL OPEN, NAMED BY THE WAVE:** `objslot15.js:179` is a live throw and always was. It calls
`ctx.soundPost?.(0x28c186)`, whose D1 comes from the caller (0 here, verified). Fixing it needs a
ctx-level D1-carrying API. **Not D58; open it as its own unit.**

Verified by the coordinator on a quiet tree: **3928 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at **607 windows**, and no line-ending violations across 32 files.


### D59 FOLLOW-UP -- THE `$245248` LEAD IS **DEAD**. I MEASURED IT AND IT IS WRONG.

The entry above said: *"If both are in range, both gates are innocent and this whole line of
enquiry is dead -- say so, and delete it."* **Here is the measurement, and it says exactly that.**

Harness reused from `w285medallive.test.js` (the W69 stage-1 laser-hold rung), 3,000 frames with
fire held, sampling every live type-`$8A` carrier every third frame:

    carrier position samples          1292
    sub-record IS a pool-A slot       1292 / 1292      <- the right word is being read
    ($2,A6) range                     $0000 .. $FFC0
    samples >= $6F00 (REJECTED)        139  = 10.8%

    by high nibble:  $0xxx 194   $1xxx 129   $2xxx 126   $3xxx 129   $4xxx 165
                     $5xxx 210   $6xxx 215   $7xxx  67*  $Fxxx  57*     (* rejected)

**THE CARRIER IS BELOW THE GUARD AND FULLY DAMAGEABLE ON ABOUT 89% OF FRAMES.** The rejected 10.8%
are the `$Fxxx` band (negative Y, above the screen, still entering) and `$7xxx` (leaving) -- which
is precisely what an off-screen guard is *for*. `$245248` is behaving correctly and **it does not
explain "I can't shoot them"**.

**SO THE TWO-GATE STORY IS WRONG.** It was a tidy hypothesis that predicted all three symptoms from
one quantity, and it is false. Recorded here rather than quietly dropped, because the next agent
would otherwise re-derive it from the same two gates -- they are still both there, still both real,
and still both innocent.

**WHAT THIS DOES ESTABLISH, and it is worth keeping:**
- the carrier's sub-record IS a pool-A slot, 1292 of 1292, so block 7 walks the right records;
- carriers are plentiful in a live run (1292 sightings in 3,000 frames);
- the position words are ordinary and on-screen.

**WHERE D59 NOW POINTS.** Not at position. The remaining candidates from the original entry are
untouched: whether the owner's "flickering" is the CARRIER or a released BEE, and whether the
block-7 overlap actually applies damage. **And the unresolved question from the caveat above still
governs: find which counter produced W412's "84" before trusting it.** `w285medallive.test.js`'s
own header says *"no scenario in the tree kills a carrier -- the laser-hold ladder parks the ship
at the bottom centre and only kills what enters the beam"*, which is a strong hint that no bench
has ever put a carrier IN the beam. **That, not the gates, is the thing to fix next.**


### D59 FOLLOW-UP -- I PUT A CARRIER IN THE BEAM. SHOOTING AND FREEING **WORK**.

No scenario in this tree had ever done it. `w285medallive.test.js`'s header says why: *"the
laser-hold ladder parks the ship at the bottom centre by design and only kills what enters the
beam."* So every zero this project has measured about block 7 and the carrier is a fact about the
BENCH. This probe removes that.

Method: read block 7's own A2, the beam muzzle `$811802`, and pin a live carrier onto the muzzle's
position each frame. No forced hit bit, no forced HP -- **the beam does the work**. Measured on the
W69 stage-1 laser-hold rung:

    muzzle live                  73 of 400 frames      <- W412's fix is holding
    carrier HP at start          $000A
    carrier HP low-water         $FF74                 <- NEGATIVE. It took real damage.
    carrier DIED                 frame 33
    A BEE WAS ALLOCATED          frame 34

**SO THE PATH WORKS END TO END IN A LIVE RUN: beam -> block 7 damage -> carrier death -> bee
dropped.** "Cannot shoot" and "cannot free" are **not** defects in the damage pass or the drop.

**THAT RETIRES BOTH OF MY HYPOTHESES.** The position gates were innocent (measured above), and now
the damage and drop are innocent too. Two tidy stories, both dead, both measured rather than
argued.

**WHAT IS LEFT, and it is now a much smaller target.** The owner said three things: *"I can't shoot
them, free them, or collect them."* Two are disproved. **The remaining one is COLLECT** -- and the
owner's word was *"flickering"*, which may be describing a RELEASED BEE that cannot be picked up
rather than a carrier that cannot be hit. D52's open question is exactly this: the bee's own
collect cue `$28C62A` is posted from its own body, not from the shared `COLLECT_ARMS`.

**NEXT UNIT FOR D59: drive a released bee into the ship and see whether it is collected.** The
probe above already produces a live bee at frame 34, so the hard part is done. **And measure the
COLLECT, not the overlap** -- that distinction has now cost this item two waves.


### D59 FOLLOW-UP -- ALL THREE PARTS OF THE OWNER'S SENTENCE MEASURED. ALL THREE **WORK**.

> "I can't shoot them, free them, or collect them."

Three probes on the W69 stage-1 laser-hold rung, each measuring the THING ITSELF and never an
overlap:

    SHOOT    carrier pinned onto block 7's own A2 (the muzzle $811802), beam left to do the work:
             HP $000A -> $FF74, DIED frame 33.                                  WORKS
    FREE     a bee was allocated from the reserved ten on frame 34.             WORKS
    COLLECT  bee driven onto the ship: P1-touch bit frame 1, collected bit
             frame 2, `$817F80` incremented frame 2.                            WORKS
    UNAIDED  bee left ENTIRELY alone: it drifts down on its own from $5C16
             toward the ship at ~32 units/frame and IS COLLECTED. Count 0 -> 1. WORKS

**SO THE PORT SHOOTS, KILLS, DROPS, FLIES AND COLLECTS BEES CORRECTLY.** Every hypothesis this
docket has raised for D59 is now dead, and each died to a measurement rather than an argument:
the position gates, the damage pass, the drop, and the collect.

**WHY NOBODY SAW THIS BEFORE, and it is the recurring lesson**: `w285medallive.test.js`'s header
says *"no scenario in the tree kills a carrier -- the laser-hold ladder parks the ship at the
bottom centre and only kills what enters the beam."* **No bench had ever put a carrier in the
beam.** Every zero measured about block 7 was a fact about the bench. Same shape as D56 and D60.

**THE ONE CAVEAT, AND IT IS MINE.** I pinned the carrier onto the MUZZLE, which sits at the top of
the beam, so the bee spawned about 21,500 units from the ship and took roughly 670 frames -- ELEVEN
SECONDS -- to drift down. **That distance is an artifact of my setup, not a measurement of the
game**: a real carrier dies wherever it happens to be. The probes prove the PATH works. They do
**not** prove the timing is right, and I am not claiming they do.

**WHERE D59 GOES NEXT.** Not into the damage, drop or collect code -- those are measured and
correct. The remaining candidates are (a) that the owner's bees are unreachable in practice rather
than unimplemented, which would be a TIMING or POSITION question and is what the caveat above
leaves open, and (b) something the node bench does not reproduce about the live web build.
**Ask the owner where on the screen they see the flickering bees**, because that single answer
separates those two and neither can be settled from here.


### W426: THE LAST `$28C186` THROW IS GONE -- AND IT FOUND A DEFECT IN MY OWN W423 CODE

`objslot15.js:179` was a LIVE throw and always had been. It is now
`ctx.soundPostD1?.(0x28c186, 0)`, against a new ctx key `soundPostD1(addr, d1)`. `stageend.js:833`
and `background.js`'s cue sub-op 2 are converted too. **All three `$28C186` sites post.**

**A REAL DEFECT IN `postBgmCommand`, WHICH I WROTE IN W423.** The code packed
`(d0 << 8) | (d1 & 0xFF)`. **`$28BBAE` is `8041`: bits 8..6 = `001`, the WORD form of OR**, so the
68k ORs D1's whole low word. With D1 = `$01FF` the board packs `$17FF` and the command byte becomes
`$17`; the byte mask packed `$16FF` and kept it at `$16`. Verified from the image by the
coordinator.

**AND MY OWN DOC LINE ONE SCREEN ABOVE ALREADY SAID `((D0<<8 | D1) & $FFFF)`.** The code disagreed
with the comment for three waves, and `w423bgmcommand.test.js` SECTION 3 asserted the code's
version **under the heading "the pack is WORD-sized"**. That is **lie-shape 1 in my own work**. The
assertion was REWRITTEN, not deleted. Nothing observable moved because all three sites pass D1 = 0,
which is exactly why it survived.

**THE BRIEF WAS WRONG ABOUT WHY THE API IS NEEDED, and the wave checked instead of inheriting.**
W425 and I both said the scroll-VM site reads a real VARYING D1, so an address-only path would post
`$1600` for everyone. The site does read a script word, but **in this ROM revision that word is
`$0000` in every stage** -- five cue streams walked out of the image to prove it. So an address-only
post would have been right BY LUCK. **The API is still the correct unit, but the reason is the
INSTRUCTION (`$28C18A` sets D0 and never `moveq #0,D1`), not the data.** Both comments now say so.

Site census swept over `$200000..$600000` for every call form: exactly THREE, at `$2621CE`,
`$28DE72`, `$291FAC`. Coordinator confirmed the D1 loads: `321a` (`move.w (A2)+,D1`) at the first,
`7200` at the other two. **The census is a test, so a fourth site fails rather than joining
silently.**

**BOOKKEEPING IS READ, NOT WRITTEN.** SECTION 9 scans all of `src/` for a surviving
`note(..., 0x28c186)` and fails on any. That is the standing fix for the lie-shape that has now
appeared five times.

Verified by the coordinator on a quiet tree: **3942 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 607 windows with none added or widened, no EOL violations.


### D52 FOLLOW-UP -- THE BEE'S COLLECT SOUND **DOES** FIRE, MEASURED ACROSS A REAL COLLECT

> "I think medals have sounds too, maybe stars as well and bees too. Those are important"
> "sounds when collected I mean"

D52 carried an open question: the bee's collect cue `$28C62A` is posted from its own body
(`bee.js:2004`) rather than from the shared `COLLECT_ARMS`, so nothing guaranteed it ran.

**MEASURED, on a real collect rather than a forced one.** The D59 probe produces a genuinely
released bee and drives it onto the ship; watching the 100-slot ring at `$81DD1E` across that:

    sound.postCount        48 -> 49        exactly one cue
    ring slots changed     1
    slot 62                $00EB1F04       type $0, ID $1F
    collected at frame     2

**`$1F` is the id `bee.js:2004` names for the bee-collect sound.** So the cue posts, on the frame
the bee is collected, and it is the right one.

**THIS IS A POSITIVE RESULT AND IT NARROWS THE OWNER'S REQUEST.** They said medals were already
good, and bees are now proven. **STARS ARE THE REMAINING ONE** and have not been measured. The same
probe shape works: get a star collected in a live run and watch `postCount` and the ring, rather
than reading the code and concluding.

**DO NOT take "the call exists in the source" as evidence it runs.** That is what left this question
open in the first place, and this project has been bitten five times by a stated reason that was
false while the code looked right.


### D52 FOLLOW-UP -- MY STAR PROBE **FAILED**, AND STARS ARE STILL UNMEASURED

The bee result above is sound: a real released bee, collected on frame 2, **exactly one** ring slot
changed, id `$1F`, which is the id `bee.js:2004` names. That one stands.

**THE STAR ATTEMPT DOES NOT, AND I AM RECORDING IT SO NOBODY REPEATS IT.** I tried to reach the
star's arm by clearing the kind bits (`status` bits 6..2) on the record the carrier had just
dropped, so `runBody` would dispatch `$27FA30` instead of the bee body. Result:

    re-kinded status       $8000
    collected at frame     NEVER
    postCount              48 -> 85   (delta 37, over 600 frames)
    ring slots changed     37

**37 CHANGED SLOTS IS ORDINARY GAMEPLAY SOUND OVER 600 FRAMES, NOT A COLLECT.** The `$01EB1E04`
(id `$1E`) at slot 62 is NOT evidence of a star collect cue -- there was no collect. My probe's
verdict line was inherited from the bee template and printed a conclusion the data does not
support. **I nearly reported it.**

**WHY THE PROBE IS INVALID:** the record was allocated and FILLED as a bee, so its sprite, speed,
angle and template fields are the bee's. Re-labelling the kind gives the star body bee data. That
is not a star; it is a chimera, and its failure to be collected says nothing about stars.

**WHAT IS STILL TRUE AND CHEAP TO USE:** `COLLECT_ARMS.star27F9EE` (kinds 0 and 4) does carry
`collectSound: 0x28C5E4`, the same cue the medal uses, and the owner has already confirmed medals
sound right. That is suggestive and **it is not a measurement**.

**TO ACTUALLY SETTLE STARS: get a REAL star spawned and collected in a live run** -- the owner's
own report says mid-bosses drop them -- then watch `postCount` and the ring exactly as the bee
probe did. Do not re-kind a record; it does not work.


### D56 FOLLOW-UP -- **I NAMED THE WRONG INSTRUCTION, TWICE.** THE SELECTOR IS `$249A98`.

The "D56 LEAD" entry above, and the D60 recon entry, both say bomb-while-lasering runs
`$24989E bset #$0,($1,A6)` and that this selects the bomb-laser. **Both are wrong.** Read the EA
bytes, verified from the image by the coordinator:

    $24989E  08 ee 00 00 00 01   bset #$0,($1,A6)   mode 5 reg 6 = A6 -- the PLAYER record
    $249A98  08 e9 00 00 00 01   bset #$0,($1,A1)   mode 5 reg 1 = A1, and A1 IS $811F72

**THAT IS THIS REPO'S OWN EA MODE/REG TRAP** -- the one every agent brief carries (`08 ae` is
`(d16,A6)` where `08 ab` would be A3) -- **walked into by the person who writes the trap lists.**
`src/bomb.js:1548` already had it right and nothing had reconciled the two. Corrected in place in
`src/score.js`.

**AND THE TWO ARE ON DIFFERENT ARMS OF THE SAME BUTTON, which changes the item.**
`$249864 move.w (A1),D1 / $249866 beq.b -> $2498E2` (`67 7a`, verified) forks on the **HYPER
STOCK**:

- **stock NON-ZERO** -> `$249868`, the HYPER. It reaches `$24989E` and sets the PLAYER's flags1
  bit 0. **It never allocates `$811F72` at all**, so block 9, `$2456A6` and every laser fork in
  `score.js` behind them NEVER RUN.
- **stock ZERO** -> `$2498E2`, whose laser arm runs `$249A98`. **That is the only path to
  `$2456A6`.**

**MEASURED LIVE (W427):** with hyper stock 1 the press activates the hyper for 182 frames, sets
`($1,A4)` bit 0 for all 182, and `$811F72` is never allocated -- **0 guard frames, 0 `$2456A6`
frames**.

**SO "BOMB WHILE LASERING" IS TWO DIFFERENT WEAPONS DEPENDING ON HYPER STOCK.** The owner said
*"when you have a hyper"*. Taken literally, **the weapon they are reporting is the `$249868` one,
and W427 benched the other.**

**NEITHER IS SILENT ON THE BENCH, which is the other half of the answer:**

    $2456A6 (bomb-laser, stock 0)   flashed up to 6 records in ONE frame; 30 pool-A + 51 pool-B
                                    hits, against the plain laser's 63 total; boss HP -18690 in
                                    200 frames against the plain laser's -9600
    $249868 (hyper, stock 1)        55 pool-B flash events; boss HP -12375 at stock 1,
                                    -20625 at stock 3

**`$2456A6` DOES NOT FLASH "EXACTLY ONE TARGET PER FRAME" EITHER** -- my lead said that too, and it
is true only of the `$2457FA` pool-B half. `$24581C`'s pool-A loop ORs the same bits onto every
unshadowed intersecting record.

**WHAT REMAINS UNANSWERED, and only the owner can settle it:** which press do they mean, and do
they see the flash in a real browser at real speed? The bits and the HP are measured; **the pixels
are not**. And the only clean pool-B rung is stage 1, so their stage-2 boss scenario is still not
reproduced end to end.

**A NEW BENCH TRAP, PINNED AS TEST 6 OF W427:** writing `$81B65C` alone is NOT a hyper.
`$2530BE collectHyperStock` writes the stock **and** `$81B642`, and with the gauge at 0
`$285A5E`'s `before < 2` runs `endHyper` on the same frame `$285A12` set it active. The stock is
spent and `req`/`active`/`level`/`arm`/`mode` all read 0, so the whole hyper arm silently measures
zero -- which looks exactly like "the hyper does nothing". **The wave's own first measurement was
that, and it is now a test.**

**ALSO FOUND:** `c003100` and `c003000` cannot be used as seeds -- they die at frame ~155 on
`UNPORTED $27399E` inside `spawnCues28AC72` (`handlers.js:3829`, handler 80). Pre-existing, and it
rules out the 17-record pool-B checkpoints. **Open it as its own unit if a wave needs those rungs.**


### D52 FOLLOW-UP -- TWO WAYS TO REACH A STAR ARE NOW RULED OUT. NAMED SO NOBODY RETRIES THEM.

Stars remain the one collect sound never measured. **Two obvious routes are dead:**

1. **Re-kinding a released record does not work** (recorded above). The record is FILLED as a bee,
   so clearing its kind bits hands the star body bee data. It was never collected in 600 frames.
2. **`allocBee27F92A` cannot make one.** `bee.js:349` refuses outright:
   `if (kind !== KIND.bee && kind !== KIND.beeFlying) unreached(POOL_A.alloc, ...)`. **The
   reserved-ten allocator is BEE-ONLY**, so a star cannot come from there at all.

**WHERE A STAR ACTUALLY COMES FROM, for whoever picks this up:** pool-A records are allocated by
the table-driven `$280BCE` / `$280DBA` path with a D0 index -- W422 recorded that for kind 5
(`$280BCE[17] = $280DBA`, D0 = `$44`, ending `andi.w #$FF83,(A0) / ori.w #$14,(A0)`, where `$14` is
kind index 5). **A star is kind index 0 or 4**, so the ori constant is what selects it. Start
there, not at the bee allocator.

**AND THE OWNER ALREADY SAID WHERE THEY COME FROM IN PLAY:** *"only mid bosses leave stars"*. So a
live-run route exists: kill a mid-boss on a rung that has one, and watch `postCount` and the ring
exactly as the bee probe did.

**WHAT IS KNOWN AND IS NOT A MEASUREMENT:** `COLLECT_ARMS.star27F9EE` (kinds 0 and 4) carries
`collectSound: 0x28C5E4`, the same cue the medal uses, and the owner has confirmed medals sound
right. That is suggestive. **It is exactly the kind of source-reading that left this question open
in the first place, so do not close D52 on it.**


### D61: THREE ENEMY TYPES INSTALLED **ZERO CUES, FOREVER**, AND NOTHING THREW

Found by W428 while chasing a different defect. **Not an owner report -- a silent bug the owner
would have experienced without being able to name it**, which is why it gets its own number.

`$27380E move.l A0,($44,A5)` stores the LOADER'S CURSOR. Three init bodies hard-coded
`table + 28`. The ROM stores `table + 56`, because the stubs write `move.w #$1,($4,A5)` and the
`dbra` therefore runs TWICE over the sub prototypes.

**VERIFIED FROM THE IMAGE BY THE COORDINATOR** -- every wrong cursor lands on a sub prototype's
own flags word, and every one of those has BIT 15 SET:

    type $80   OLD $27396A = $A001  bit15 SET      NEW $273986 = $0992  clear
    type $82   OLD $27478C = $A000  bit15 SET      NEW $2747A8 = $015E  clear
    type $88   OLD $275EE8 = $8000  bit15 SET      NEW $275F04 = $0CDA  clear

`$28AC72` reads that word as a THRESHOLD, sees bit 15, and **breaks on its first pass**. So any
type `$80`, `$82` or `$88` spawned by the port installed **no cues at all, for its entire life,
and threw nothing.** `$0992` is exactly the first real threshold of type `$80`'s script, which is
what says the corrected cursor is right.

**THIS IS THE FIFTH LIE-SHAPE IN ITS PUREST FORM: silence that looks like correctness.** There was
no throw, no counter, no note. Nothing read the cursor back, so nothing could tell.

### W428 IN PROGRESS -- NOT GREEN, NOT COMMITTED

**The brief (mine) was wrong on its central claim.** `$27399E` is **not a routine and there was
nothing to port**: it is the `script` longword of a cue record, read at `cues.js:84`. The defect
was a **clipped ROM window** (W23's `$273920+$80` ends at `$27399F`), not an untranslated path.

**IT IS REACHABLE BY ORDINARY PLAY.** Traced: the enemy's HP falls `$1400 -> $0950 -> $0824 ->
$078E -> $06F8` against thresholds `$0992 $0785 $0578 $036B`. **Damaging it past about 46% health
is all it takes.** Frame 156 on `c003000`, frame 56 on `c003100`.

**A RULE IN EVERY BRIEF I WRITE IS WRONG FOR THIS CASE.** "Declare NEW ROM windows, never widen --
abutting is correct" **FAILS when a multi-byte read STRADDLES the seam**: `RomWindows.#at` requires
the whole read inside ONE window. The wave MEASURED this -- declared `$2739A0+$20`, regenerated,
and `$27399E` threw identically. **Abutting is not always correct. Say so in future briefs.**

Four clipped scripts, not one: `$268E38` (type `$1A`, record ZERO), `$27399E` (`$80`), `$2747AE`
(`$82`), `$275F20` (`$88`, a WORD read not a longword).

**WHY IT IS NOT GREEN.** Coordinator's own run on a verified-quiet tree: **3955 tests, 3941 pass,
14 FAIL.** All fourteen assert `the overlap count still 71` or a window count, and the wave's four
deliberate overlaps moved it. **Overlaps are not forbidden here -- there are already 71 of them --
the tests pin the COUNT as a tripwire.** Coordinator's decision: keep the overlaps, update the
tripwire, and **rewrite each assertion's PROSE rather than bumping an integer** (the W420 mistake).

**AND `tests/w382stalenotes.test.js` IS GREEN ON A FALSE PREMISE.** It hard-codes the three OLD
seeds and asserts the cursor "does not advance", on a stated reason that is false. **It is the
repo's own guard against stale notes**, so a false reason living inside it is the worst possible
place for one.


### D62: `$28ACFE..$28AD26` WAS MISSING FROM `installCue`, AND IT WAS LIVE IN SHIPPED KINDS

Found by W429 while porting something else. **Not an owner report -- a bug that was already running
in the build the owner is playing.**

Before D3 is stored, the ROM does `tst.b D3 / bpl`, then on a NEGATIVE low byte `not.b D3` plus two
`eori.b` flips, **each gated on its own `jsr $242FDE`**. `installCue` had none of it. Verified from
the image by the coordinator: `$28ACFE 4a 03 6a 26` is `tst.b D3 / bpl -> $28AD26`, then `46 03`
`not.b D3`, `08 03 00 05` `btst #5,D3`, then the `jsr`.

**SIX of the fifty cue records in the image reach it, and FOUR of those SIX feed the ALREADY
SHIPPED kinds `$00`/`$04`** (`$263BFC $263C0C $263C1C $263C2C`). So this was live and wrong before
W429 existed.

**AND IT IS NOT COSMETIC.** `$242FDE` bumps `$803917`, **the cursor every other draw consumer
shares**, so the omission stored the wrong byte AND desynced the RNG for everything downstream.

The reading is settled by elimination against the board: the record holds `$BF`, `not.b` alone
would give `$40`, and all five oracle snapshots read `$00` at `+$18` and `$001E` at `+$1C`.

### W429 CLOSED `$28AE24`, AND MY BRIEF WAS WRONG ABOUT THE SIZE OF THE UNIT

**I said `$28AFD4` holds 14 live descriptors. It holds 14 NON-ZERO entries, 12 DISTINCT addresses,
and SIX REACHABLE ones.** The table is indexed by words from a cue script, and the image contains
exactly five referenced scripts (`$28AF84` 18 refs, `$28AF8A` 26, `$28AF98` 2, `$28AFA0` 2,
`$28AFA4` 2). Between them they name `$00 $04 $08 $0C $10 $14` and nothing else. The six scripts
naming `$18..$3C` have **ZERO references anywhere in the cartridge**.

**So the honest unit was THREE descriptors -- the whole of cue script `$28AF98` -- not one and not
fourteen**, and the wave declared no window for the unreachable six. Kinds `$18..$4C` still throw,
with two DISTINCT reasons, and a test re-scans the image to rebuild the reachability claim rather
than restating it.

**W428's "ABUTTING IS WRONG" IS ITSELF SITUATIONAL, and W429 measured that too.** Here abutting is
correct: `$28B08E + $6A` abuts `$28AC72 + $41C` exactly (coordinator confirmed:
`$28AC72 + $41C = $28B08E`), nothing crosses the seam, and the overlap count stayed at **75**. Both
cases now sit side by side in `tests/romwindowset.js` so they cannot be confused.

**A STATE TRACE, NOT A GREEN RUN:** stepping `c003600` reproduces **all twelve fields** of the
kind-`$C` record against four other snapshots at frames 25/50/75/100, no field diverging.

**HONESTLY FLAGGED BY THE WAVE:** kinds `$10` and `$14` are ported but **NOT witnessed live** -- the
parent dies at frame 116 with `$4F` still on the countdown, so no rung reaches them. They were
ported because they are the rest of `$28AF98` and would throw the moment a longer-lived parent
appears, **not because they were measured.**

Verified by the coordinator on a quiet tree: **3970 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 612 windows, overlaps unchanged at 75.


### D52 CLOSED BY W430 -- STARS POST THEIR COLLECT CUE. ALL THREE ARE NOW ACCOUNTED FOR.

> "I think medals have sounds too, maybe stars as well and bees too. Those are important"
> "sounds when collected I mean"

**MEDALS: confirmed by the owner. BEES: measured (id `$1F`). STARS: measured now. NO DEFECT, AND NO
CODE WAS CHANGED.**

**AND W430 FOUND THE MECHANISM BEHIND THE OWNER'S OWN SENTENCE.** They said *"only mid bosses leave
stars"*, and they were right about the trigger while nobody here knew why. The midboss death
`$26B7D8` arms `armScreenClear` with **mode 0**, and `runScreenClear` then takes the FREE arm whose
`jsr $27F8F8` allocates pool A with **kind index 0 -- the star**, from the BULLET's own record.
**The midboss does not drop stars: every live enemy bullet on screen BECOMES one.** That also
explains why a bomb makes none -- `$243DA0` arms mode `$FFFF`, the transform arm, which allocates
nothing. Only two sites in the port arm mode 0.

Measured on `c003700` with the midboss alive, laser held: bullet pool 49 -> 0, pool-A live 7 -> 56,
**49 records at kind index 0** with kind 0's own art `$1BCBEC`, allocated and filled from the
cartridge template -- not re-kinded, not synthesised.

    ONE STAR      collected frame 2; postCount 3 -> 4; ring slots changed 1;
                  slot 24 = $01EB1E04, type $1, id $1E
    49 STARS      98 frames, 49 collects, 49 posts of $01EB1E04, one per collect
    ALL 49 AT ONCE   2 frames, 49 collects, ONE post

**THE WORD IS UNIQUELY `$28C5E4`** -- the only wrapper with entry `$28C0AE` AND id `$1E`. The
neighbours post `$00EB1E04` and `$00EB1F04`; **the TYPE nibble separates them**, which is why
reading the id alone would not have been proof.

**THE ONE-POST-FOR-49 CASE IS THE ROM'S OWN GUARD, NOT A DEFECT.** `$28C5E4` carries
`deb: [$81DEB6, 2], debAlways`, so simultaneous collects collapse to a single cue.

**MY BRIEF WAS WRONG ABOUT THE ROUTE.** I sent it to `$280BCE`/`$280DBA` expecting an `ori` constant
to select the kind. Kind 0 comes from `allocPoolA27F8F0`'s D0 **directly** (`IMPACT_FINISH[0x00]`,
hook `$280C5E`, `status: null`); the `ori.w #$14,(A0)` normalisation exists only for D0
`$44`/`$48`/`$4C`. Starting where I said would have been a detour.

**AND IT SETTLED MY EARLIER FALSE ALARM PROPERLY.** The failed probe saw `$01EB1E04` and I recorded
that it "is NOT evidence" -- correct at the time, because nothing had been collected. **The word
was the star cue all along; that probe simply never collected anything.** Both halves of that are
now true and on the record.

**STILL UNMEASURED, and the wave flagged it rather than glossing it:** kind index 4 is literally
the same arm (`DISPATCH[0]` and `DISPATCH[4]` are both `$27FA30`) but the only site allocating D0
`$10` is stage-2 type `$90`, and **there is no stage-2 rung in `tools/oracle/out`.** Kind 3
(`$27FED2`, cue `$28C610`) is likewise unreached on any bench. Neither was forced.


### D63: `$23D6AC` THROWS 226 FRAMES AFTER THE STAGE-2 BOSS DIES

Found by W431. **A LIVE THROW in the boss death explosion**, at lf21826 with pool B at 40 records:
*"display-list entry 23: adding `$80B054` = `$100008` carried out of the short axis's ten-bit
position field"*. **No previous ladder covered a boss death, so nothing could have hit it.** Same
class as D60, which ended the owner's run.

### W431 -- MY BRIEF'S FIRST SENTENCE WAS FALSE, AND THAT IS THE FINDING

I wrote *"`tools/oracle/out` contains no stage-2 rung"*. **It contains 92**, in the very ladder I
named. `stage1-laser-hold`'s `$813092` goes 0 -> 1 between lf10300 and lf10400 and never returns,
so 92 of its 210 rungs are stage-2, and **seventeen carry the stage-2 BOSS** (type `$30`,
`$297120`) with its 23 type-`$4D` satellites. **Nobody had looked, for 362 waves.**

**THE REAL DEFECT WAS THAT THE LADDER WAS TOO SHORT**: the boss's main HP falls 179,648 -> 142,598
over lf18000..lf19500 and the run ends at lf19600, holding **only the first fifth of the fight**.

**W431 BUILT A NEW CARTRIDGE LADDER, `out/w69/stage2-laser-hold`** -- 281 of 281 rungs, 30,000
frames, `missing: []`, holding the COMPLETE fight:

    lf10400  stage 2        lf20600->20700  PHASE TRANSITION, main HP 62,456 -> 61,088,
    lf17900  boss arrives                   crossing $EFC0 = 61,376, exactly $298926's gate;
    lf18600  damage starts                  all four parts die together
    lf21600  BOSS DIES      lf22300         stage 3

**Proved usable, not merely present:** `seedcmp` over lf17900..22400 gives 45 segments, 34 green,
**1 blocked, 0 seedbad, 0 error**, and a single seed at lf20600 runs **1,000 unbroken frames**
reproducing the board's HP at every rung.

**D56 IS UNBLOCKED** -- a live, vulnerable, dying stage-2 boss now exists as rungs, and the
HP-refill invulnerability `($148,A6)` is 1 only to lf18500.

**BUT MY DIAGNOSIS FOR KINDS 3 AND 4 WAS WRONG, AND A STAGE-2 RUNG WAS NEVER WHAT BLOCKED THEM.**
Two seeded sweeps (119 new rungs / 11,825 frames, and 92 old / 9,200) see dispatch indices
**0, 1, 2 and 8 only -- never 3, never 4**, with types `$90`, `$92`, `$93` all live on the route.
**The gates are SUB-STATES, not stages:** kind 4 needs `$279990` behind type `$90`'s
`hp < cooldown` (measured `$1000` vs `$0` for its whole life); kind 3 needs `$279D64`/`$279F3C`,
the death tails of `$92`/`$93` behind `($1,A6)` bit 7. **Kind 3 has TWO sites, not one.**

**TWO SELF-CORRECTIONS THE WAVE MADE AND KEPT:** it first read the four PART HP words holding at
`$5000` and concluded the boss took no damage -- wrong, the body's HP is `($16,A5)` on the ENEMY
record while the PARTS table gives A6 displacements. And it blamed the off-centre ship, then
**falsified that itself** by steering to `$1C07` and measuring no change. It also rewrote the
ladder's manifest rather than ship the pre-correction text it had snapshotted.


### D63 FIXED BY W432 -- THE DEFECT WAS THE ASSERTION, NOT THE ARITHMETIC

`$80B054`/`$80B056` **is the SCREEN SHAKE**, and the port's shake is already exact: the ladder's own
`trace.tsv` shows the board non-zero on exactly **lf21819..21860, 42 frames**, and the port matches
the board **frame for frame on all 42**. Nothing about the emit was wrong.

**The old predicate `(before & 0x3c00) !== (after & 0x3c00)` covered bits 13..10, and BIT 10 IS NOT
A ZOOM BIT.** Zoom is 14..11; the sprite DMA drops bit 10 (already modelled and tested). The
position under it is a **SIGNED ten-bit field**, so a carry out of bit 9 is the two's-complement
wrap, not an overflow -- `$3F8` (-8) + 8 = 0 on the board and 0 here. **A scan of all 647 board RAM
dumps found `stage1-play/c019500` entry 65 carrying bit 10 set with `$80B054` ZERO**, so the throw
was refusing a state the cartridge ships.

**AND THE ZOOM POLLUTION IS REAL AND THE CARTRIDGE DOES IT.** `$23D6B2 or.l D3,D1` restores bits
15..11, so only bits the add SETS survive; that needs a borrow past bit 10. Both halves measured:
**14 of the table's 42 pairs** have a negative short-axis term, and **2,330 of 64,239 board
display-list entries across 610 of 647 dumps** are zoom-0, bit-10-clear, short axis 0..7. So
`unreached()` was wrong twice over -- **the emit implements all of it.**

Fix: bit-10 carries counted as `telemetry.shortAxisWrap`; the test is now `(after & ~before) &
0x3800` -- **set-only, zoom bits only** -- and it WARNS AND COUNTS rather than throwing. Measured
over the window: 42 shake frames, **39 bit-10 wraps, 14 zoom pollutions**. The run now steps **700
of 700 frames** from lf21800 through the death into stage 3. A full 281-rung sweep no longer sees
`$23D6AC` anywhere.

**THE HONEST SIZE: the fix is SMALLER than the throw suggested** -- one predicate plus a downgrade.
**Masking, as the brief warned, would have been wrong in BOTH directions**: it would have hidden a
wrap that is correct and a pollution that is the cartridge's.

**MY BRIEF WAS WRONG AGAIN.** I wrote *"no previous ladder covered a boss death, which is why
nothing had hit it."* **False -- four of the five `w69` ladders carry a board shake window and have
for many waves.** The boss death was in the corpus all along; **what was missing was anyone
stepping the port through those frames.** Same shape as W431's own correction.

### D64: THE PORT'S STAGE-1 BOSS DEATH NEVER SHAKES THE SCREEN

Found by W432 while proving the above, **not fixed, out of D63's scope.** On `stage1-laser-hold`
the board moves `b054` on lf9903..9944 and **the port leaves it at 0 for all 42 frames.** `b054` is
in `state.js` `CLAIMED`, so **that is 42 frames of divergence on a COMPARED column, sitting in the
corpus untested.**

Traced: the only writers of shake mode `$813186` are the eight sites in `$260E36..$260F18`, and the
only reachable arm is `$260E36`, called from `$244ABA` (the tail of `$2440E0`, ported as
`boss2.js finalBlast2440E0`), `$2A5C5C` and `$2A5FC4`. **So the port's stage-1 boss death never
calls `$2440E0`.**

Also recorded: `$260E58`/`$260E7A`/`$260E9C` (modes 2, 3, 4) have **NO caller anywhere in the
image** -- no absolute-long, no PC-relative `bsr`/`jsr`, and the longword does not appear as data --
so `screenShake260EC8`'s note for "mode is not yet translated" **covers dead code.**


### D64 FIXED BY W433 -- ONE LINE, AND THE ROUTINE HAD BEEN PORTED SINCE W189

`boss.js d6Step293E04` state 5 carried `note(ctx, 0x2440e0)` at `$293EEC` -- **a W52-era deferral
for a routine ported in W189.** `boss3.js` and `hibachiend.js` both already called
`finalBlast2440E0`; **the stage-1 site was the one caller never wired up.** The note fired at
lf9902, one frame before the board's first shake frame, **so it was on the real route the whole
time, not absent.**

**THE PROOF, 42 board values against 42 port values (`stage1-laser-hold`, seeded lf9800):
MATCH 42, DIFFER 0.** Before the fix: MATCH 0, DIFFER 42. Zero on both sides on every other frame
of lf9801..9960, so the window is 42 exactly on both. **All four corpus windows now match 42/42.**

**MY BRIEF WAS WRONG IN FOUR PLACES and the wave corrected each:**
1. D63 said "four of the five ladders carry a shake window". It is **THREE of five, and FOUR
   windows** -- `fly-around` has none, `stage2-laser-hold` has TWO. **W432 verified that ladder's
   SECOND window while its FIRST carried this exact defect.**
2. "the only writers of `$813186` are the eight sites" -- there are eight REFERENCES; **six are
   writers**, two are reads. Bound right, label wrong.
3. "never calls `$2440E0`" -- true in effect, but it REACHES the site and COUNTS it. **That
   distinction is what made it findable.**
4. **Mode 2 is not an untranslated table.** Modes 1 and 2 SHARE `$260F4C` and differ only by
   `$260F20 asr.w #1`. Only 3 and 4 have their own.

**A SECOND DEFECT FOUND IN PASSING: the terminator test was wrong.** `$260EE6` tests **X ALONE**;
the port required BOTH words zero. Same predicate on this table (0 of 42 pairs have X=0) so it
changed no frame -- **but 7 of 42 have Y=0**, so it was one table away from mattering.

**DEAD ARMS CONFIRMED INDEPENDENTLY.** `$00813186` occurs exactly 8 times, all in
`$260E3A..$260F18`. Scanning `$260E58`/`$260E7A`/`$260E9C` as abs-long, as raw data, and as the
target of every `Bcc`/`bsr`/`jsr`/`jmp (d16,PC)`/`lea (d16,PC)`/`pea (d16,PC)` at every even
address: **zero references each.** Positive control on the same scanner found `$260EC8` reachable
**PC-relative only** -- so a longword scan alone would have called the live driver dead. The note
now says "UNREACHABLE on this ROM", not "not yet translated".

**BONUS, MEASURED:** the stage-1 death also never cleared pool B or seeded the 39-row blast.
Against the board's own dump at lf10000, **pool-B byte-identical slots went 37/80 -> 79/80.** The
one remainder is a residue byte at `+$1C` of a FREED slot -- **flagged, out of scope, for a later
wave.**

Verified by the coordinator on a quiet tree: **3977 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 612 windows with **none added**.


### W434: POOL B IS 80/80 -- AND THE MISSING WRITER WAS AN INSTRUCTION NO SCAN WOULD FIND

**`finalBlast2440E0` IS UNROLLED IN THE ROM AND THE BLOCKS ARE NOT ALL THE SAME.** `aligned.py`
decodes 555 instructions over `$2440E0..$244ACE`: 4 preamble + **39 blocks of 14 (546)** + 4 tail +
**EXACTLY ONE instruction that belongs to no block.**

That one is **`$2441B4 move.b #$40,($1C,A0)`** -- bytes `11 7c 00 40 00 1c`, confirmed by the
coordinator. It sits after block 2's last store and before block 3's first read, **so A0 is still
block 2's slot.** The port read all 39 blocks as one uniform 16-byte-row loop and dropped it.

**A LONGWORD OR TABLE SCAN WOULD NEVER HAVE FOUND IT: it is an IMMEDIATE, INSIDE CODE.** The
layout pins which block on both ends -- all 39 are byte-identical 64-byte copies of block 0, block 2
ends exactly at `$2441B4`, and block 38 ends exactly at `$244ABA`, which is W433's `jsr $260E36`.

**THE DEFECT WAS NOT ONE SLOT IN ONE LADDER.** Falsified by toggling the store off: the same byte
on the same slot 2 appears in **FIVE segments across FOUR ladders** -- including the stage-2 death
at lf21800, **so `$2440E0`'s other caller carried it too.** All five are now **80/80**. W433's "one
remainder" was one remainder *in the segment it measured*.

**THE FREED-SLOT TRAP IS EVEN STRONGER THAN THE BRIEF SAID.** At lf10000 the board has **39
non-blank slots and ZERO live ones** -- every row `$2440E0` wrote had been freed again by lf9975.
**The whole comparison is residue on both sides.**

**AND MY BRIEF'S FRAMING WAS WRONG:** I said "a LIVE-RECORD writer sets it", implying something
running while the record lived. It is the **allocator's own caller, one instruction after
allocation, on the same frame.** Nothing live ever touched that byte.

**FALSIFICATION RUN EXPLICITLY, which is what makes this not a forced pass:** with the store
disabled the ladder arm and the dirty-pool arm both go RED while the ROM-assertion arm stays green.
The dirty-pool arm pre-fills every slot with `$5A` and **fails equally if EVERY slot gets `$40`** --
so the test cannot be satisfied by writing a constant.

Verified by the coordinator on a quiet tree: **3980 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 612 windows with none added.

**TWO PRE-EXISTING POOL-B REDS FLAGGED, OUT OF SCOPE, measured identical with the fix on and off:**
`stage1-laser-hold` lf9500->9600 at **60/80** (multi-byte, in `+$02..$05` position and `+$34..$37`
velocity) and lf10300->10400 at **74/80** (six slots the port keeps alive that the board has
blanked). **Neither is touched by this change.**


### W435: THE STAGE-END TRANSITION IS THE BOARD'S NOW, AND `PRESENTATION_DEVIATION` IS EMPTY

`stage1-laser-hold` lf10300->10400 went **74/80 -> 80/80**, and the real proof is a state trace:
**`$8130D2` matches the board's own per-frame column on all 300 frames of lf10201..10500**, and the
port now unfreezes at **lf10334, the board's frame**, where before it unfroze at lf10303.

**MY BRIEF WAS WRONG IN THREE PLACES AND THE WAVE REFUSED THE TEST I ASKED FOR:**
1. **Not a lifetime defect, and the board has "blanked" nothing.** At lf10400 the board's pool B is
   **entirely EMPTY, 0 of 80.** The port's six records are the stage-2 intro's own effects, spawned
   correctly but **31 frames EARLY**.
2. **`lf10400` COULD NEVER HAVE BEEN THE DELIVERABLE RUNG** -- both sides are an empty array there,
   so 80/80 is satisfied by anything that wipes the pool. **The load-bearing rung is lf10500**,
   where the board has six records and the port must produce the same six. The wave asserted both.
3. **The seed rung matters:** seeded at lf10300 the port INHERITS the board's already-built chain,
   so that seed cannot distinguish the two halves of the fix. **lf10200 is where the port builds it
   itself.**

**A `PRESENTATION_DEVIATION` STOOD FOR TEN WAVES ON A FALSE STATED REASON.** DEV-2 said the
per-frame drain was unported presentation tier. **The drain is `animobjects.js
runAnimObjects24683E` -- main-loop call #3, ported since W91, running every frame.** What was
missing was its INPUT: the chain loader built nodes without their content, so `($6,node)` stayed 0
and the walk skipped every node. W389 decoded that content block and left it `null`, writing that
enabling it "changes the result screen's timing". **It does -- to the board's.**

**NEITHER HALF WORKS ALONE, measured:** content on with the branch ignored moves nothing (74/80);
the branch honoured with content off **hangs the stage end forever** (41/80). Both together give
80/80 and lf10334 to the frame. The 32-frame figure is read off the image, not chosen.

**`PRESENTATION_DEVIATION` IS NOW `Object.freeze({})` -- this port invents no stage-end transition
at all.**

**FALSIFICATION HELD TO W434'S STANDARD:** the dirty-pool arm pre-fills the node pool and root list
with `$5A` and asserts **eight DISTINCT cursors**, so a constant written eight times fails. A RED
test removes the new window and shows the loader throws by address.

**TWO TESTS THAT CONTRADICTED THEIR OWN COMMENTS, fixed:** `w303hiscorestate` and
`w308namecountdown` each say "feeding one loader's script to the other is meaningless" and then did
exactly that -- harmless only while the head was hollow.

**AND THE OTHER SEGMENT IS NOT WHAT I SAID EITHER.** lf9500->9600 is **not** position/velocity
arithmetic: board 33 live / 43 non-blank, port 30 live / 35 non-blank. **The port is missing three
LIVE records and eight non-blank ones**, and the diffs span the whole record. **It is a
spawn-count divergence with everything downstream shifted by allocation order**, and it is the ONLY
red 100-frame segment in lf9300..10700 -- its four neighbours are 80/80 including live records.
**Unmoved by this wave: 60/80 with the fix on and off.**

Verified by the coordinator on a quiet tree: **3985 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at **613 windows** (one added, abutting, overlaps unchanged at 75).


### W436: THE THREE MISSING RECORDS ARE A3 SCRIPT 5'S SPARK BLOCKS -- AND THE 80/80 IS CONDITIONAL

`boss.js partScriptStep` is shared by A3 scripts 4 and 5 and began at the state machine. **Script
4's step opens `$293970 bra.w $293A44` and JUMPS its own copy of three `$3(a4)`-gated emitter
blocks; script 5's step has NO such branch and REACHES them.** W62's note said "NOTHING sets a bit
of `$3(a4)`" -- but `$293D32`'s eight burst entries carry loopctl 1, 2 and 3, so `burst2938AE`
**(ported since W107) has been setting bits 0, 1 and 2 all along with nothing to read them.**

Eight firings, which is exactly the eight non-blank records; three still live at lf9600, which is
exactly the three live ones. **The records ARE spawnable in the port's state.**

**THE WAVE DID NOT REACH AN UNCONDITIONAL 80/80 AND REFUSED TO CLAIM ONE.**

    fix on                            63/80 identical, KIND WORD 80/80, DESCRIPTOR 80/80,
                                      counts 33 live / 43 non-blank / $22 = THE BOARD'S
    fix on, board's $803916 forced    80/80, ZERO differing bytes
    fix off                           60/80, kind 67/80, descriptor 63/80, counts 30/35/$1F
    fix off AND $803916 forced        62/80 -- so the RNG poke is NOT doing this wave's work

**The 17 remaining slots differ ONLY at `+$02..+$05`, `+$1B` and `+$35..+$37` -- the angle and what
follows from it.** Cause traced to a SECOND, OLDER defect: `$242B3C` indexes with `$803916`, and
over lf9501..9600 the port's per-frame draw count matches the board on 97 of 100 frames and is
short on three -- **lf9556 by 24** (the frame `$294DD4` runs), lf9562 and lf9592 by 1. **The 24
draws produce no pool-B/C/D record and move no CLAIMED column; `$27F8F8` is ruled out.** That is
the next unit.

**THE UNROLL TRAP, CHECKED:** `$293BAE..$293C87` is **43 instructions: 2 + 13 + 14 + 14** -- the
blocks are NOT uniform. Blocks 2 and 3 carry `add.b D0,D0`; **block 1 does not**, and block 3 has a
different kind, bucket and speed. **Falsified: implementing block 1 with the doubling leaves counts,
slots, kinds and descriptors all correct and STILL turns the deliverable RED.**

**MY BRIEF WAS WRONG:** "its four neighbours are 80/80 including live records" -- **two of the four
hold ZERO live records on the board** (lf9400, lf9500, 26 non-blank each). Only lf9700 and lf9800
could ever have distinguished a missing live record.

**THE RUNG IS LOAD-BEARING** (W435's trap applied): the board holds 43 records at lf9600, 33 live.

Falsification: a `W436_MUTATE` seam returns the segment to 30/35/`$1F`; the dirty-pool arm asserts
**eight firings into eight DISTINCT slots with three distinct signatures and at least five distinct
angle bytes**, plus that all 22 untouched fields still read `$5A`. **A constant written eight times
fails on the slot set, the signatures, the angles AND the residue.**

Verified by the coordinator on a quiet tree: **3990 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with **none added** -- the nudges are immediates
inside code.

**ALSO CORRECTED: `games/ddpdoj/tools/oracle/c1_*.py` ARE TRACKED and unmodified.** The
session-start snapshot listing them as untracked is stale. **Leave them alone regardless -- they
are not ours -- but the stated reason was wrong.**


### W437: THE MISSING DRAWS ARE `$281E36 jsr $27F8F8` -- AND HALF THE FIX IS A REMOVAL

`mover.js freeSlot` transcribed `$281E36..$281E4E` as a counted note and never made the call.
`$294DDC bset #$7,$8130F8` makes that word negative, `$281E6A bmi` fires, and **every live bullet
takes the kill arm -- 101 of them on lf9556.**

**AND THE PORT WAS RUNNING SOMETHING IT SHOULD NOT.** The bounds kills (`$281E8C`, `$281E94`), the
bit-12 kill (`$281EDA`) and the bit-7 bounds kills (`$281F46`, `$281F50`) all branch to
**`$281EC4`**, which is `clr.w (A6) / move.w #$FFFF,($2,A6)` and **no `jsr`**. The port sent all
five to `$281E36`.

**UNCONDITIONAL 80/80, NO CURSOR FORCING**, with every neighbour also 80/80 and an empty draw-gap
list across lf9300..9800. Port at lf9600: **33 live / 43 non-blank / `$22` = the board's**, and
still 80/80 with the cursor forced. **All three frames closed** -- lf9562 and lf9592 are the same
call, because the bit stays set.

**MY BRIEF WAS WRONG IN FIVE PLACES, AND TWO MATTER:**
1. **IT IS 280 DRAWS, NOT 24.** `addq.b #1,$803917` is a **BYTE** add, so the `rng` column only
   shows delta **mod 256**; 280 = 24. **I had been reading an aliased number.** Settled on a
   non-modular quantity: the board's pool A holds **0 at lf9500 and 68 at lf9600**, and **24 draws
   buys 6 fills -- 6 cannot become 68.** The port now reaches 68/68 where it reached 0/0.
2. **`$27F8F8` WAS NOT RULED OUT -- IT IS THE WHOLE CAUSE.** W436's "fires on 37 frames and the RNG
   matches on every one" is true and **the inference is backwards**: on those frames the port was
   INVENTING the call on the bounds path, where the ROM makes none, **so of course it matched.**
3. lf9562/lf9592 were not a separate defect.
4. **THE CRLF LIST IN EVERY BRIEF I WRITE IS WRONG.** Coordinator counted: **22 CRLF files**, not 8
   -- and **THREE ARE MIXED** (`src/spritequeue.js`, `src/vectors.js`,
   `tools/w62stageendgate.mjs`). All three are **unmodified in git, so the mixing is PRE-EXISTING.**
5. **W433's trap met for real:** `$281F46`/`$281F50` are `bcs.W`; an 8-bit-only read resolves them
   elsewhere. The scan decodes both forms with a positive control.

**HOW THE FIX CANNOT BE FAKED, and this is the sharpest falsification yet.** The deliverable is a
COUNT, so the obvious fake is a constant advance. Over `$5A` dirt, **eight bullets freed by the
SAME gate on the SAME pass cost 16 draws for the four ON-SCREEN ones and ZERO for the four
OFF-SCREEN ones**, because `$280B2A`'s abort fires before `$280C68`. **No constant k gives
8k = 16 and 4k = 0.**

Verified by the coordinator on a quiet tree: **4000 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added.

**RESIDUALS, NAMED BY THE WAVE:** pool A's occupancy and count are now exact (68/68) and status is
62/70, **but only 2/70 slots are byte-identical**, differing overwhelmingly at `+$02..+$05` -- the
per-record position. **That is `$27F95A`'s driver, now reachable and worth a wave.** Also
lf9601..9800 has 15 draw-gap frames (18 before, so no regression), and `$282016 jsr $27F8F8` stays
a note because it has **no `moveq #$0,D0`** in front of it, so its kind is unknown.


### W438: `$27F95A`'s DRIVER IS **EXACT**. MY BRIEF NAMED THE WRONG SUBSYSTEM.

**NO PRODUCTION CODE CHANGED.** Seeded on the board's own lf9600 rung -- where the board holds 68
pool-A records and drains to 32 by lf9700, so 36 are freed inside the window and every survivor is
stepped 100 times -- the port produces **70/70 byte-identical slots**, `$817F7E` = 32, 32 distinct
positions, zero draw-gap frames. Same at lf9700->9800.

**AND MY "at lf9700 the port drains to 27 where the board holds 32" WAS A CONFLATION**: that is the
lf9500->**9700** 200-frame run, not the lf9600->9700 rung. From lf9600 the port reaches 32 exactly.
Both readings are now asserted in one file so they cannot be conflated again.

**WHY POOL A LOOKS WRONG AT lf9600: THE POSITION IS COPIED, NOT COMPUTED.**
`$280B56 add.l ($2,A6),D1` -- the **LONG** form (`d2 ae`, not `d2 6e`, confirmed by the
coordinator) -- takes the record's whole position longword **from the CARRIER**, which on this
route is a dying enemy bullet. Of the 68 differing slots, **60 differ ONLY at `+$02..+$05`**;
status, sprite, descriptor, size, hitbox, blink, **speed, angle**, template, hit count, cached
velocity and layer emitter are already the board's.

**THE REAL DRIVER IS THE ENEMY-BULLET POOL, and pool A is byte-perfect on EXACTLY the segments where
that pool is, and on no other:**

    lf9500->9600   bullets 149/210   (61 differ; 61 at +$05, 56 at +$04)   pool A  2/70
    lf9600->9700   bullets 210/210                                          pool A 70/70
    lf9700->9800   bullets 210/210                                          pool A 70/70

**THE FALSIFICATION IS THE STRONGEST YET.** Each arm overwrites ONE group of bytes in the port's own
state with the board's, then steps 100 frames:

    nothing                      2 -> 2/70
    position +$02..+$05          2 -> 62/70   (52/70 at lf9700)
    ALL FORTY OTHER BYTES        2 -> 2/70

**Handing the port the right answer for every other byte of every record -- 2,800 bytes -- moves the
number by ZERO. Four bytes move it by sixty.** A second defect anywhere in the 44-byte record would
have shown on the all-but-position arm. A constant fails the byte compare outright and could not
survive the 52/70 arm, because a wrong position frees on a wrong frame and yields a different
survivor set. **RED run performed, not asserted:** injecting `- d6 - 1` into `$27F97A`'s scroll
turns 6 of 8 tests red.

**DECODE CORRECTIONS, all three confirmed by the coordinator from the image:** `$27F95A` is **21
instructions** including a **`nop` at `$27F98C`** no note lists, and a **wide `bmi.w` at `$27F984`**
(`6b 00 17 44` -> `$2810CA`) -- **an 8-bit read makes it a branch to the next instruction and the
collected arm VANISHES.** Also `$27F978 beq` goes to `$27F972`, the advance, not `$27F976`; the
wave's first draft had this wrong and its own test caught it.

### NEXT UNIT, PINNED AT ITS SMALLEST BY W438

**`lf4025 -> 4050`: 209 of 210 bullet slots byte-identical, zero draw-gap frames.** The single
differing slot is **slot 3**: the board puts a live kind-7 bank-A bullet there; the port's slot 3 is
**byte-identical to the lf4025 SEED for all 25 frames -- not spawned-and-killed, not killed early,
simply NEVER WRITTEN.** One missing spawn, costing no RNG draw, in an otherwise perfect pool.


### W439: THE MISSING BULLET IS TYPE $82's SECOND FIRE -- 210/210

`$274A9C..$274AEE` had been a counted note in `handlers.js` since **W81**. Instrumenting every write
to a bullet slot's type word over lf4026..4050: the port made **nine kills and ZERO spawns**, and
`unportedLog` carried **exactly one** `$274A9C` line. **One note, one missing bullet.**

**MY BRIEF SENT IT TO THE WRONG FILES.** `bullets.js` and `bulletdriver.js` are both exact and
neither changed. **The bullet pool was not the producer -- it was the VICTIM. The producer is a
CALLER.**

Why it cost no RNG draw: `$274ACC jsr $281484` opens `tst.w $813098 / beq`, rank is 0, and the
bank-A core allocates and copies a template **reading no RNG at all.**

    lf4025->4050   bullets 209/210 -> 210/210   pool A 70/70   pool B 80/80
    lf9500->9600   bullets 149/210 -> 149/210   pool A  2/70   -- UNCHANGED

**"BEFORE" IS NOT ASSERTED FROM MEMORY:** the wave built a pre-fix copy of `src/` from
`git show HEAD:` and ran the same harness against it. **lf9500->9600 did NOT improve, and that is
asserted in the test file so it cannot be quietly re-claimed** -- one missing spawn was not the
same defect as 61 differing slots.

**FOUR FALSIFICATION ARMS, ALL PERFORMED:**
1. **The frame is forced.** `($22,A5)` is 2 at lf4025 and `subq.b #1` borrows on the third
   decrement, so the write lands on lf4028 and nowhere else -- and it is load-bearing: the port
   frees slot 0 at lf4040, so a spawn one frame later takes slot 0 and **two** slots go wrong.
2. **Bytes OUTSIDE the bullet pool.** Whole-RAM divergence at lf4050 falls **717 -> 292 bytes** --
   **425 bytes turn on one call, far more than the 64 in the record. A bullet-pool poke could at
   best reach 653.**
3. **RED run:** raising `($22,A5)` so the cadence cannot borrow returns 209/210, zero type-word
   writes, and 717 bytes.
4. **The muzzle offset is READ, not constant.** Bumping the longword it indexes turns slot 3 red at
   **exactly `+$02` and nowhere else**; bumping a different entry changes **nothing**. A hardcoded
   value survives both.

**W438's WIDE-BRANCH TRAP STRUCK ONE CALL DEEPER AND THE WAVE'S FIRST DRAFT HIT IT.**
`$281490 60 00 ff 14` is `bra.w -> $2813A6` (confirmed by the coordinator). **Read `60 00` as 8-bit
and it becomes a branch to the next instruction, and the three-way rank spread VANISHES.** Its own
byte assertion caught the error.

**AND W438's LAST TEST ASSERTED THE DEFECT** ("the port NEVER WRITES THIS SLOT") and went red.
**Rewritten to assert the fix, keeping every W438 measurement still true** -- not deleted.

**MY LINE-ENDING LIST WAS WRONG AGAIN:** `src/bulletdriver.js` is **LF** (269/0), not CRLF, and
unmodified. `src/bullets.js` IS CRLF (731/0).

Verified by the coordinator on a quiet tree: **4021 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added.


### W440: FOUR WIDE BRANCHES READ AS 8-BIT LEFT ALL THREE STAGE-1 BOSS GUNS FREE-RUNNING

    $29690A  64 00 01 0C  bcc.W $296A18   the rts.  E14's outer cadence
    $29610E  64 00 00 76  bcc.W $296186   the rts.  E5's whole body
    $29621A  64 00 00 76  bcc.W $296292   the rts.  E6's whole body
    $296116  64 00 00 16  bcc.W $29612E   NOT a return -- the ($3,A4)->($2,A4) reload

All four confirmed from the image by the coordinator. **This is the same trap that bit W437
(`bcs.W`), W438 (`bmi.W`) and W439 (`bra.W`) -- four waves running, and here FOUR instances at
once.**

**BEFORE measured from `git archive HEAD`, not asserted:**

    lf9000->9100  194/210 -> 210/210     lf9300->9400  111/210 -> 210/210
    lf9100->9200  113/210 -> 176/210     lf9400->9500  113/210 -> 210/210
    lf9200->9300  108/210 -> 210/210     lf9500->9600  149/210 -> 210/210, pool A 2/70 -> 70/70

**POOL A FOLLOWED WITH NO POOL-A CODE TOUCHED**, exactly as W438's finding predicted. Whole-ladder
sweep over all 209 rung pairs: **6 improved, 203 unchanged, 0 REGRESSED.**

**MY BRIEF WAS WRONG IN FOUR PLACES:** `lf9300->9400` was NOT the worst (`lf9200->9300` at 108/210
was -- my table started too late; the band runs lf9000..9600); `lf9100->9200` carries a draw gap no
earlier wave reported; **W439's method did not apply** (`unportedLog` has no counted note in this
window, so the producers came from the type-word write log alone); and **the producer was not a
missing spawn but three OVER-firing guns** -- the port spawned 128 bullets where it now spawns 112,
and 48 of one kind where the board fires ZERO.

**THE EVIDENCE THAT NO POOL POKE COULD PRODUCE:** the three script slots `$812BD8`/`$812BF8`/
`$812C18` are **not in the pool** and differed by 3/3/4 bytes; now **0/0/0**. And at lf9400 only
1,793 of 4,043 differing bytes were inside the 13,440-byte pool -- **a perfect pool poke floors at
2,250. The result is 637, with ZERO in the pool.**

**THE BOARD'S OWN WITNESS, independent of the port:** across lf9100..9200 `($4,A4)` falls by exactly
$64 = 100 while **`($A,A4)`, the fire cadence, never moves** -- the board returned before the fire
on all 100 frames.

**THREE RED RUNS PERFORMED, one branch at a time**, each reddening differently, and **no single arm
reproduces the pre-wave numbers** -- so all three are load-bearing.

**SIX TESTS WERE ASSERTING THE DEFECT** -- four in `w438poolapos` and two in `w439secondfire82` --
**all REWRITTEN, none deleted.** W438's field-isolation experiment now runs under a mutation seam so
it can still fail.

Also corrected: a **signed compare where the ROM is unsigned** (`$296914 bls`), stated as measured
inert on this rung; and two inverted comments where the code was always right.

Verified by the coordinator on a quiet tree: **4038 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added.

**LEFT OPEN, MEASURED NOT WAVED AT:** `lf9100->9200` stops at 176/210 and is **two independent
defects, neither this wave's** -- the port misses the laser beam-impact spark on two ticks (and
**handing it those 8 draws changes the bullet count by ZERO, performed not argued**), and it frees
8 records where the board frees 16, which is `mover.js`/`boundsKill` territory.


### D59 CLOSED BY THE OWNER, AND LASER-ONLY IS **ORIGINAL BEHAVIOUR**

> "bees seem ok now, though you can only uncover them with laser. I don't know if that's original
> behavior."

**IT IS ORIGINAL, and this repo measured why before the owner asked.** W410: the bee carrier's
sub-proto word 0 is `$8100`, and of the four damage passes only **block 7** accepts it
(`$245218 btst #$5,D4` OR `$24521E btst #$0,D4` -- `$81` has bit 0). The ordinary shot pass needs
bit 13; block 8 and the beam's own pass need bit 5. **Block 7's A2 is `$811802` -- the BEAM MUZZLE,
pool slot 27.** So the laser is the ONLY weapon that can damage a carrier. **The owner is describing
the cartridge.**

D59 is therefore closed on the owner's own play, and W430's measurements stand: shoot, kill, drop,
drift and collect all verified, and the collect cue posts (id `$1F`).

### D56 UPDATE -- THE OWNER'S EXACT SEQUENCE, AND IT IS THE `$249868` ARM

> "I press laser button while I have hyper and keep it pressed. Laser fired. I keep it pressed and
> hit bomb. I go into hyper. I keep laser pressed: Laser comes out, it hits something, and **it just
> cuts off, it has no hit animation or particles or whatever.**"

**THIS SETTLES THE QUESTION W427 COULD NOT.** The owner has hyper stock, so `$249864/$249866`
forks to **`$249868`, the HYPER arm** -- which sets the PLAYER's flags1 bit 0 and **never allocates
`$811F72` at all**. So `$2456A6` and block 9 never run, and **W427 benched the OTHER weapon.**

**AND "IT JUST CUTS OFF" IS A PRECISE SYMPTOM, NOT A VAGUE ONE.** The beam terminating at the
target is CORRECT -- that is the beam stopping where it hit. **What is missing is the IMPACT
EFFECT at the termination point.**

**THAT NAMES A SUBSYSTEM THIS PROJECT HAS JUST BEEN INSIDE.** W440 and W441 both handled a missing
**laser beam-impact spark**: `spawnBeamImpact289FC0` <- `runBeamDraw` (`src/laser.js` ->
`src/spark.js`, **pool E**), and W441 proved that spark is **position-gated on the part it hits**.
**Start there, not in the damage passes.** The damage is landing -- the owner sees the beam react --
so this is the EFFECT, not the hit.

**THE BENCH IS NOW FULLY SPECIFIED BY THE OWNER:** hyper stock non-zero, laser HELD, bomb pressed
while it is held, laser still held. **Not "activate hyper" -- that ordering is the report.**


### W441: THE "TWO DEFECTS" WERE ONE, IN NEITHER FILE I NAMED. THE BAND IS CLOSED.

**`mover.js`, `laser.js` and `spark.js` are all UNTOUCHED.** The whole wave is ONE branch:

    $294666  66 00 00 f4  bne.W $29475C   D14's WHOLE WAIT STATE
    $29471E  66 00 00 2c  bne.W $29474C   the exit, NOT a cadence tick

`$294658` is D14, the script that rotates the boss's two gun mounts. State 0 is a wait. **Read
`66 00` as an 8-bit `bne +0` and it lands on `$294668` -- THE EXTENSION WORD ITSELF** (confirmed by
the coordinator) -- so the wait falls straight into the code that turns both mounts. **The port
rotated the mounts on every frame of a state that exists to turn nothing.**

**FIFTH WAVE RUNNING ON THIS TRAP:** W437 `bcs.W`, W438 `bmi.W`, W439 `bra.W`, W440 four `bcc.W`,
W441 two `bne.W`.

**MY BRIEF WAS WRONG ABOUT BOTH DEFECTS:**
- **Defect 2 was NOT an under-free.** `boundsKill` was right for 441 waves. The port freed 8
  because its 42 bullets were fired from a mount **70 frames out of phase**, so they left the
  playfield on different frames. It now frees **16**.
- **Defect 1 is the SAME cause** -- the beam impact is position-gated on the same part. **W440's
  "handing it 8 draws moves the pool by zero" was CORRECT: they could not move each other because
  both are downstream of one thing.**

    lf9100->9200   176/210 -> 210/210   (whole-RAM 2152 -> 608)
    every segment lf9000..9600 now 210/210, pool A 70/70, pool B 80/80, draw gap [] throughout

**Whole-ladder sweep, 209 rung pairs: 1 improved, 208 unchanged, 0 REGRESSED.** Whole-RAM bytes: 4
fewer, 205 same, **0 more**.

**THE WITNESS HAD TO COME FROM OUTSIDE THE STRUCTURE, and that is the lesson.** `$812B14` -- D14's
own record -- is **byte-identical to the board BEFORE AND AFTER**, and every slot-record gate was
green through 440 waves. **The defect leaves no trace in the structure that carries it.** What
caught it: the board's part facings move `$40 -> $22` and `$C0 -> $A2`, both exactly **-30 =
100-70**, a third independent count of the same 30 -- and **the 8-bit reading predicts `$DC`, which
is exactly what the port had.**

Also: the proving segment `lf9000->9100` was 210/210 **before and after** while its boss-body struct
went **14 differing bytes -> 0**. No pool poke can do that. And at lf9200 only 570 of 2,152
differing bytes were in the pool, so **a perfect pool poke floors at 1,582 where the result is 608
with ZERO in the pool.**

**`$29471E` WAS CALLED INERT IN A CODE COMMENT AND MEASURED FALSE BEFORE COMMIT** -- it costs 1 byte
on two segments and is invisible to every pool count.

**THREE W440 TESTS WERE PINNING THE DEFECT. All REWRITTEN, none deleted**, and now run under W441's
RED arm so they stay true AND falsifiable.

Verified by the coordinator on a quiet tree: **4051 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added.

**PINNED, NOT MINE:** `lf8800->8900` is 171/210 and `lf8900->9000` is 189/210 -- pre-existing,
identical before and after and under both RED arms, **so no later wave is credited with them.**


### D65: BEE VISIBILITY -- THEY MAY BE TOO VISIBLE, AND SOMETIMES SHOULD NOT BE

> "We need to make sure to make passes on how visible bees are any time. I have a feeling I can see
> them better in this port than I should. They sometimes flicker but in some situation I think they
> might have to be invisible? Bees are a bit of a mystery to me"
> "Then when you uncover them they should be visible I think"

**THE OWNER EXPLICITLY REFUSED TO HAVE THEIR MODEL TREATED AS SPEC**, and the coordinator had
written it as one -- corrected here:

> "don't write my bee model down as spec, it's correct as it is for all I know. Needs check with
> oracle."
> "they're everywhere, should be possible to find"

**SO THE ORACLE DECIDES. Not the owner's model, and not the coordinator's.** The owner is reporting
an impression and saying so; the unit is to go and look.

**AND THEY ARE RIGHT THAT THE DATA IS ABUNDANT.** W430 measured **1,292 carrier sightings in 3,000
frames** on the stage-1 ladder, and the corpus holds 363 board RAM dumps plus the new 281-rung
stage-2 ladder. **There is no shortage of frames on which to compare drawn output against the
board's.**

**THIS IS A DRAW QUESTION, NOT A GAMEPLAY ONE, AND D59 ALREADY BOUNDS IT.** W430 measured the whole
bee lifecycle as correct -- carrier shot, bee dropped, drifts, collected, cue posted. So **the
records and their timing are right; what is in question is whether they are DRAWN when the
cartridge draws them.**

**WHAT TO MEASURE, and the standard is the one W441 set:** compare the port's drawn output against
the board's for the carrier and for a released bee, **on the frames each exists**. The type `$8A`
carrier gate is `$2767AA bchg #6,($1,A6)` followed by `$2767B0 bne $2767CE`: only the old-clear
bit-6 arm changes art and emits, so a proximity-eligible carrier draws every other frame. The older
attribution to `$268916 eor.b palCycle,(palette)` was wrong: `$268916` is type `$11` damage flashing
inside `handlers.js damageArm5C`, not type `$8A` visibility. The question is whether the port follows
the real `$2767AA..$2767CE` cadence, and whether anything is drawn that the board suppresses.

**DO NOT change a draw to match a description.** The owner says "I think" and "a bit of a mystery"
-- they are reporting an impression, not a measurement. **Measure first, and if the port already
matches the board, say so.**

### D66: AUDIT EVERY DEFERRAL. THE OWNER IS RIGHT THAT THIS HAS BITTEN US REPEATEDLY.

> "Also make a pass for all deferred stuff. Apparently it's bitten us plenty of times"

**IT HAS, AND HERE IS THE EVIDENCE, ALL FROM THE LAST FIFTEEN WAVES:**

- **W439**: a counted note from **W81** -- an enemy's second fire never happened for 358 waves.
- **W435**: a `PRESENTATION_DEVIATION` that stood **ten waves** blaming a routine which had been
  **ported and running since W91**. `PRESENTATION_DEVIATION` is now empty.
- **W433**: a `note()` from **W52** for a routine **ported in W189** -- every other caller was
  wired; that one site was not.
- **W428**: three init bodies whose cursor was 28 bytes short, so three enemy types installed
  **zero cues, forever, and threw nothing** (D61).
- **W436**: a note saying "NOTHING sets a bit of `$3(a4)`" when `burst2938AE` had been setting
  bits 0, 1 and 2 **since W107**.
- **W425**: `BOSS_NOTED` listed three addresses as deferred SOUND that had been **real posts since
  Wave A** -- invisible **because nothing read the table**.

**THE SHAPE IS ALWAYS THE SAME: the assertion is true, the STATED REASON is false, and nothing ever
reads the bookkeeping back.**

**THE UNIT:** enumerate every deferral in `src/` -- `note()`, `unreached()`, `unported`,
`PRESENTATION_DEVIATION`, `*_NOTED` tables -- and for each one **check whether its stated reason is
still true**. Report: still true / **reason false but assertion holds** / **fully stale, the thing
is ported**.

**THE GENERAL FIX, ALREADY PROVEN TWICE:** W425 made a test **scan `src/` and fail on a dead key**;
W428 made one **derive its seed by running the init body** instead of hard-coding it. **If you write
bookkeeping, make a test READ it.** An audit that produces a list and no guard will go stale the
same way.


### D56 CAUSE FOUND BY W442: **THE HYPER BEAM'S ART WAS NEVER EXPORTED.**

> "Laser comes out, it hits something, and it just cuts off, it has no hit animation or particles"

**THE SIMULATION IS CORRECT. THE PICTURE DOES NOT EXIST IN THE SHIPPED ASSETS.**

With every sprite shard forced resident, the port's own `$800000` list names **18 sprite streams
that are in NO shard of the shipped bundle -- 197 records in 100 frames -- and the hyper-free
control on the same rung names NONE of them.**

**Four are in BUCKET 16, THE LASER BEAM:** `$022084 $022268 $02244C $022630`, stride exactly
`$1E4` -- **a four-frame animation, 22 records each, 88 total. The plain laser has ZERO missing art
in bucket 16.**

**MECHANISM, MEASURED LIVE:** `$255000 btst #$0,($1,A4)` / `$255008 addi.w #$78,D3` indexes
`$24BB0A` at the hyper's slot. The plain laser's art pointer is `$24B7EA`; **the hyper's is
`$24BAE2`**. The bundle's only beam harvest is shard 10, declared from **`$24BB0A`** -- and
**`$24BAE2` is `$28` bytes BELOW that window** (confirmed by the coordinator against
`export-web.mjs:1873`). **Outside the window, never exported.**

**THAT IS WHY 442 WAVES OF RAM COMPARISON FOUND NOTHING: the records are created, correct and
enqueued.** Same shape as shard 10's own note -- *"29 of the beam's 33 descriptors had no picture:
the owner's flicker"* -- **one power step further along.**

**THE BRIEF'S NAMED CAUSE DOES NOT EXIST.** `spawnBeamImpact289FC0` is not missing. On the
board-verified rung with hyper active 99/100 frames: **44 impacts, 46 pool-E records, 1,597
bucket-20 records drawn on 100/100 frames** (plain laser: 50 / 50 / 1,739). RED arms prove those
counts are the cartridge's gate, not the harness: zeroing either gate gives **0 impacts**.

### D56 FOLLOW-UP -- **THE ORACLE HAS NO HYPER.** THE VISUAL CHECK CANNOT RUN YET.

The owner asked for the hyper beam to be checked visually against the oracle. **It cannot be, and
here is exactly why:** a scan of **all 647 board RAM dumps** finds `$81B63E`/`$81B640` = 0 and
`$8103E7` bit 0 = 0 on **every one**. Three ladders carry hyper STOCK and never spend it, because
**no scenario script contains a `B`** -- `frame.lua`'s `BUTTONS` maps `B` to P1 Button 2.

**AND THE TOOLS I NAMED IN THE BRIEF DO NOT EXIST HERE.** No `tools/render-frame.mjs`, no
`rendercheck.py`, no `oracle/out/*/video/`. What exists is `tools/pixgate.mjs`, and it feeds
**MAME's own video RAM** to the port's renderer -- **it gates the RENDERER, not the simulation**, so
even with a hyper dump it could not answer this question.

**TO PRODUCE THE ARTEFACT** (named by the wave, not guessed): add one bomb press to a ladder that
already has stock -- e.g. `stage2-laser-hold`'s script `...;10402=DA;25000=DAB;25006=DA` in
`tools/oracle/scenarios.json` -- then `python games/ddpdoj/tools/oracle/pgm.py ckpt
stage2-laser-hold`.

**A SECOND, SEPARATE GAP, REPORTED SO NOBODY CONFLATES IT:** the other 14 missing streams are
**bucket 25, the HUD** (109 records) -- the hyper's HUD frames. **Not the hit animation.**

**TRAP PINNED (test 6): THE LADDER'S PORT WORD IS ACTIVE LOW.** `input | BOMB` RELEASES every
button. The wave's own first run did this, read hyper inactive on all 100 frames, and **looked
exactly like the defect while still firing 34 impacts.**

Verified by the coordinator on a quiet tree: **4061 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows. **Nothing regressed** -- W441's band is unchanged
to the byte.

**THE FIX IS A SPRITE-HARVEST CHANGE IN `export-web.mjs` PLUS A FULL RE-EXPORT AND REPUBLISH.**
Deliberately not attempted here; it needs its own wave and a quiet tree.


### D56 FIXED BY W443 -- THE HYPER BEAM'S ART SHIPS. **88 MISSING RECORDS -> 0.**

`export-web.mjs`'s `BEAM_ANIM.harvest = 5` walked pair-table entries **0..4 only**.
`$255008 addi.w #$78,D3` puts the hyper on entries **15..19**, and all five point at **ONE** block,
`$24BAE2` -- **the last of the twenty.** Walking it gives exactly W442's four streams at stride
`$1E4`.

    bucket-16 missing records, hyper rung   88 -> 0
    missing streams / records under hyper   18 / 197 -> 14 / 109  (the rest is the HUD, D56b)
    streamCount  4351 -> 4355        maskUsed  2,456,294 -> 2,458,222  (+1,928 = 4 x 482)
    shard 10     407 -> 411 streams, 54,582 -> 56,510 maskLen
    ALL 18 OTHER SHARDS HELD EXACTLY

**MY BRIEF WAS WRONG IN SIX PLACES, and two matter:**
1. **`$255000` is `btst #$0,($1,A5)`, not `($1,A4)`** (`08 2d`, confirmed by the coordinator), and
   `$255026` is **absolute long** `lea $24BB0A,A1` (`43 f9`), not PC-relative. **W442's comment
   carried the same three mis-quotes; corrected in both files.**
2. **"`$24BAE2` is `$28` BELOW the window, outside it" is HALF WRONG.** It is `$28` below the
   POINTER TABLE but **INSIDE the block array `$24B7EA..$24BB0A` -- block 19 of 20**
   (`$24B7EA + 19*$28 = $24BAE2`, confirmed). The exporter reads the whole array from the raw
   image, **so this was never a window problem. The cause is the `harvest: 5` cutoff.**
3. **No new ROM window was needed** -- W226 already declared `(0x24B900, 0x02AA)` and **its own
   comment names "the shared HYPER strip `$24BAE2`".** 613 windows, overlaps 75, unchanged.

**A D66-SHAPED FIND, AND IT IS THE OWNER'S BUG ITSELF.** `export-web.mjs`'s stated reason for
skipping these entries -- *"outside EVERY window ... a LOUD NAMED THROW ... the two must move
together"* -- **has been FALSE since W226 moved the window alone.** From W226 to W442, reaching the
hyper's block was **a QUIET BLANK: exactly what that comment existed to prevent, and exactly what
the owner has been looking at.**

**HOW IT FAILS IF FAKED:** section 1 derives the four addresses from `maincpu.bin` and never looks
at the bundle; section 2 requires them contiguous in shard 10 with **pixels byte-identical to the
cartridge (1,920 mask words compared)**; **section 3 requires every other shard to HOLD to the mask
word, which refuses a 20-entry walk or a range scan -- both CONTAIN the four and both ship 40 extra
streams.** On HEAD's bundle sections 2-4 were RED.

**A RED ARM in `w442hyperbeamimpact.test.js`** drops the four from the resolved map and measures
**88 records / exactly BEAM_FOUR / 18 streams / 197 records** again. **Both W442 tests that pinned
the defect were REWRITTEN, not deleted** -- all eleven removed assertions reappear.

**THE HUD GAP DID NOT FALL OUT FREE** -- 14 streams / 109 records remain, and the test asserts every
one is bucket 25. **None is the beam's.**

Verified by the coordinator on a quiet tree: **4069 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows. W441's band and W442's spark counts unmoved.


### D66 AUDITED BY W444 -- 430 DEFERRALS, 6 FULLY STALE, AND A GUARD THAT FIRES ON THE NEXT ONE

**430 deferral records over 189 distinct ROM addresses**: 215 `note()` + 198 `unreached()` + 17
table rows. **6 FULLY STALE** (2 fixed, 4 reported), **4 REASON FALSE / assertion holds** (3 fixed
as text, 1 reported), the rest verified.

**THE SHARPEST FINDING IS IN THE SAFETY NET ITSELF.** `$27120A` was written
**`ctx.unported?.unreached(...)` -- a METHOD `UnportedLog` DOES NOT IMPLEMENT.** With a log it threw
a bare `TypeError` carrying no ROM address; **on a bare ctx the `?.` short-circuited to a SILENT
NO-OP and the arm returned** -- the exact quiet wrong frame its own comment promised to prevent.
**That is W443's shape living inside the mechanism meant to stop it.** Fixed to the free
`unreached`.

**`$2599EC`**: `boss.js` **RAN** `a3Stop2599EC` for all five ids and then counted it as deferred
**on the next line**, with `BOSS_NOTED` calling it "genuinely deferred". Closed since W62; **census
wrong for 382 waves.**

**REPORTED, NOT FIXED -- each is its own wave:**

    $27F87C   rank.js says bee.js "does not implement it" -- clearPoolA has since W111
    $2603DA   ported as objslot12.js clearRankRam2603DA; W388 calls it
    $24A810   ported as objslot12.js clearPlayerRam24A810; W388 calls it
    $2878CC / $28795C   both say "the same counted draw hud.js defers" -- hud.js PORTS it (W116)

**THE LAST ONE COSTS VISIBLE BEHAVIOUR.** The `stageend.js` site is on a **live path**
(`resetPower25313E` -> loop extend), so **the lives row is not redrawn on a loop extend.** Sharpest
evidence: **`$25FFA8` is ported TWICE** -- `tally.js` draws the row on the live dispatcher, and
`player.js` has a caller-less copy that DEFERS it.

**THE GUARD, `tests/w444deferrals.test.js`, 11 tests, RED-PROVEN SEVEN WAYS** (each defect
reintroduced, guard fired, restored): dead note, dead table key, undeclared ported-and-deferred
overlap, dead allowlist row, dropped register row, wrong ROM-derived ids, method-style throw. **It
covers all five tables plus `INIT_UNREAD`; W425 had wired only one.** S4 **re-derives the five A3
ids FROM THE ROM** rather than typing them (W428's lesson).

**STATED IN THE FILE, what it CANNOT catch:** module-private ports, ports following neither naming
convention, **whether the English is true**, and W443's window-moved-away case.

**A TEST WAS PINNING THE BUG AGAIN.** `w62stageend.test.js:932` asserted `BOSS_NOTED` had exactly 4
keys **and** used a `raised.size >= 4` control that counted the dead note as proof the scan worked.
**Rewritten, not deleted.** Its W425-era guard could never have caught `$2599EC`: it asked *"does a
note() exist for this key"* -- **and one did.**

**MY BRIEF WAS WRONG IN THREE PLACES:** its mechanism list missed `rank.js INIT_UNREAD` (where 3 of
the 6 stale findings live), `objslot12.js SLOT12.clears`, and the broken `.unreached(` variant; the
CRLF list is **5 files in `src/`, not 2**; and **`node --test` is cwd-sensitive** -- run from
`games/ddpdoj/` twelve tests fail ENOENT on a doubled path. **Not a regression, but it will burn a
wave that shortens the command.**

Verified by the coordinator on a quiet tree: **4080 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with **none declared**.


### D66 CLOSED BY W445 -- ALL FIVE WIRED, AND THE BOARD SETTLED A 445-WAVE ERROR

**MY BRIEF SAID FOUR SITES. THERE ARE FIVE.** `rank.js` deferred `$2603DA` **TWICE** -- `$260678`
(named) and **`$260788`, the state-2 teardown, which W444 did not name**, with a DIFFERENT false
reason ("presentation/sound"). `4e ba fc 50` off `$26078A` resolves to `$2603DA`, confirmed by the
coordinator. **Wiring only the named one would have left a lone survivor -- the W433 shape.** The
guard's `SECTION 3c` now counts **CALL SITES, not addresses.**

**THE HEADLINE: THE BOARD DECIDES, AND THE PORT WAS WRONG FOR 445 WAVES.** `$2603DA` ends
`move.w #$FFFF,$8130BE / move.w #$FFFF,$8130C0`. **Across ALL 644 board RAM dumps: `$8130BE` = 2
(644/644) and `$8130C0` = `$FFFF` (644/644).**

    port BEFORE   0/0 from boot, then 2/0 at +2406        -- never matched the board
    port AFTER    ffff/ffff,      then 2/ffff at +2406    -- exact match

**The absent side's sentinel had NO WRITER AT ALL on loop 1** -- `$260680`'s inline `move.w #$FFFF`
covers loop 2+ only.

**`$2878CC`/`$28795C` -- the one that cost visible behaviour, wired at BOTH sites.** State trace on
the TX defer buffer, **outside both changed files**: loop extend **0 defer records -> 12**; respawn
report `['$23C668','$2878CC']` -> `['$23C668']`. P1 ladder `$200..$700`, P2 `$1400..$1900`, **so a
`who = 0` fake fails.**

**THE `$25FFA8` TWIN, ESTABLISHED BEFORE WIRING** (the trap the brief named): both copies
transcribe `$25FFA8..$260054`; **`tally.js` is the LIVE one** (`tallyDriver25FF7A` case 1) and
`player.js respawn25FFA8` **has no production caller.** `$260014 = 4eb9 002878cc` is an
**unconditional** `jsr`, so **the deferring copy was the wrong one.**

**`$27F87C` IS THE PROOF CASE.** `bee.js`'s doc claimed `rebuildWorld25FD38` called it. **It calls
eight resets and `$27F87C` is not one -- nothing in `src/` called `clearPoolA` AT ALL.** `$27E98A`
covers `$816B7A..$8171BD` and `$28131E` covers `$817F8C..$81B41F`; **pool A is `$8171BE..$817F8B`,
abutting both to the byte.** The rebuild skips it because `$2606E8` owns it, **so 3,534 bytes were
never cleared by anything.**

**"GREEN SUITE" WAS NOT THE OUTCOME -- four UNRELATED tests went red, all pinning port-only
values**, two asserting `$8130BE == 0` where the board says `$FFFF`. **Eight tests rewritten, none
deleted.**

**EIGHT RED ARMS, each fired**, every witness **outside the changed file**: the `$80B058` defer
buffer, painted RAM spans, and the 644 board dumps.

**JUDGEMENT CALLS STATED PLAINLY:** attract demo lengths moved (1264 unchanged, 754->749,
732->736) with sequencer arms identical to the frame -- **port-derived numbers, not board-measured,
and the test says so.** And `w375ctxkeys` planted a credit-start reset onto a mid-game seed with a
live ship; **the BENCH was corrected, not the wiring**, with the reason documented.

**NEW DEFECT FOUND, REPORTED NOT FIXED:** `tally.js bonusLine125FFA8` -- **the LIVE copy** --
**omits `$26002E move.l D0,($18,A6)`**, which `player.js`'s caller-less copy has. `liveSides25FD94`
counts a side live iff `($18,A6) != 0`, and bonus line 2 calls it, **so line 1's handle is never
stored and the side count is wrong on the live tally path.** Merging the two copies is its own wave.

Verified by the coordinator on a quiet tree: **4085 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added. Ladder band untouched.


### W446: `$25FFA8` MERGED TO ONE COPY -- AND THE LIVE ONE OMITTED **TWO** THINGS, NOT ONE

**MY BRIEF SAID ONE MISSING LINE. IT WAS TWO.** Besides `$26002E move.l D0,($18,A6)`, `tally.js`
wrapped `$260032..$260044` in **`if (made.ok)` -- a guard the ROM does not have.** Confirmed by the
coordinator: **ZERO branches exist in `$26002E..$260048`.** `$2411D4`'s full-queue arm returns the
dummy `$80D51C` in A0 and **the cartridge writes into it.** The same file's lines 7 and 8 already
write that dummy, **so it was not even self-consistent.**

**AND "THIS PORT KEEPS STAGEEND.JS'S CONVENTION" WAS FALSE.** `$2411DA` is `70 00 moveq #$0,D0`
(confirmed). **It is the instruction, not a convention.**

**WHAT IT COST, STATE TRACE ON THE LIVE PATH, two frames, P1 with lives left and P2 spending its
last:**

    $8130FA+$18   live-object handle      0 -> 1 ($80E882, the staged ($4C,A0))
    $81308E       live-sides minus 1   $FFFF -> 0
    $81308C       one-live-side            0 -> 1     (laser.js gates the beam impact on it)
    $8130D2       background PAUSE         1 -> 0

**HEAD FROZE THE BACKGROUND WITH A PLAYER STILL ALIVE.**

**BOTH COPIES TRANSCRIBED THE SAME RANGE FROM THE SAME ENTRY WITH THE SAME CALLER CONTRACT**, so
they were merged rather than patched. **Survivor: `tally.js`** (the dispatcher lives there;
importing tally into player would invert the existing edge). `player.js respawn25FFA8` is gone.
**W228's five tests -- including its full death-and-respawn run -- now aim at the survivor with NO
assertion weakened**, and two of them were RED on the live copy.

**SIX RED ARMS, each fired and restored with files hash-verified.** The sharpest:
**blinding the witnesses left SECTION 3 green**, which is why SECTION 4 exists -- a `liveSides`
that never reads `($18,A6)` passes a naive check.

**THE GUARD MOVED AND THE WAVE SAID WHAT MOVED.** `w444deferrals` SECTION 3c went red:
`player.js livesRow2878CC` 1 -> 0. **Not a lost draw -- a deleted DUPLICATE**, the same ROM site
tally.js already had. Register updated to 7 sites **and STRENGTHENED**: tally's two calls must
remain two DISTINCT ROM sites, since **per-file counting cannot tell two sites from one site called
twice.**

**NEW FINDING, REPORTED NOT FIXED: 24 OTHER ROM ADDRESSES ARE CLAIMED BY TWO OR MORE
`export function`s** -- `$246800` by three, `$246710` by three. **W446 audited exactly one.** They
are pinned as an exact register so a 25th goes red -- **the check that would have caught this at
W289 instead of W445.**

Verified by the coordinator on a quiet tree: **4093 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added. **No unrelated test went red**, and
W441-W445's numbers all hold.


### D67: HIBACHI'S SECOND FORM REFILLED ITS HP INSTEAD OF DYING -- A DUPLICATE READ THE WRONG BYTE

Found by W447 while auditing the 24 doubly-claimed addresses. **`$2428A6` was ported TWICE and one
copy read the wrong byte.**

`$2428B0` is `08 39 00 00 00 81 03 e6` -- **`btst` with an ABSOLUTE LONG operand of `$8103E6`**, and
**a memory `btst` is BYTE-sized**, so it reads the byte AT `$8103E6`, the record word's HIGH half.
Confirmed by the coordinator from the image. **`livePlayers2428A6` always had it.
`bossDecide2428A6` read `$8103E6 + 1`.**

**THE COST, AND IT IS THE END OF THE GAME.** `hyper.js requestHyper249868` sets bit 0 of `($1,A6)`
when Button 2 is pressed with stock, so **a player in hyper holds `$8103E7` bit 0 set while the
record is still negative.** Under the wrong byte **that player stopped counting**, and the arm taken
on zero is `move.l #$200,($16,A5)` -- **Hibachi's second form refills its HP pool instead of
dying.**

**STATE TRACE**, phase B, one damage frame, P1 alive with the bit set by `hyper.js` (never typed).
**Every witness outside the changed files:**

    $2428A6 return                          0 -> $10
    $81B61A  hud.js tallyMedalAcc           0 -> $00100000
    $812D3C  scheduler.js A4 slot 0     $8013 -> $8005
    $8130F8  stage-end handshake            0 -> $C0     (bits 6|7)
    ($16,A5) THE HP POOL                $0200 -> $FFFFFFFF
    ($15F,A6) phase B's dead flag          0 -> 1

**THE SHARPEST RED ARM IS W446'S LESSON REPEATING:** blinding the survivor to a constant `$10`
**left SECTIONS 3 and 3b GREEN** -- a function that ignores the records entirely satisfies the state
trace. **SECTION 4b exists for that**: it runs the same frame with the record POSITIVE and requires
the A4 slot to hold `$8013` (the phase check) rather than `$8005` (the ending script). **Same cell,
two values, one per arm.** SECTION 3b also runs the **deleted body verbatim** and requires it to
DISAGREE.

### W447: THE 24-ROW AUDIT -- 2 MERGED, 5 REAL, 17 LEGITIMATELY DISTINCT

**MY BRIEF WAS WRONG IN THREE PLACES:**
1. **The register is NOT in `w444deferrals.test.js`** -- it is `w446mergedbonusline1.test.js`
   SECTION 2b (`DOUBLY_CLAIMED_UNAUDITED`). **A wave editing the file I named would not have
   touched the guard.**
2. **"`$246710` by three" is a DOC MISLABEL.** Only one export transcribes it; another's header
   literally says `$246710` when `$246704` is the function (`$246704 3c3c 0001` vs
   `$246710 3c3c 0000`).
3. **The worst drift risk is NOT `$246800`** -- it is `$246520`/`$24652A`: **three independent
   transcriptions of one constructor** across `animobjects.js`, `spawn.js` and `stageend.js`, all
   allocating from **identical pools** under three different vocabularies.

**FIVE REAL SECOND TRANSCRIPTIONS LEFT AS THEIR OWN WAVES:** `$25D9E6`, **`$25DA60` (the W446 shape
exactly -- the live copy is `loadSavedCursor25DA60`; `restoreCursors25DA60` has NO production
caller)**, `$25FF38`, `$246520`+`$24652A`, and **`$246800` (THREE copies, and `animobjects.js`'s
`if (root !== 0)` is an INVENTED condition -- `$246800..$246818` is a do-while with NO entry test:
the `if (made.ok)` shape again)**.

`$242B3C` also merged -- `items.js` and `rng.js` each carried an identical copy over **one shared
`$803917` counter**. Register: **24 - 2 = 22**, and the wave **STRENGTHENED it** with a numeric
`length === 22` beside the set comparison, **because an empty list would satisfy a set comparison
against a shrunken array and read as progress.**

Verified by the coordinator on a quiet tree: **4104 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows. **No unrelated test went red**; ladder band 69/69.


### D68: TYPE `$4C`'s DEATH EFFECT COULD NEVER HAVE RUN -- THE LIVE COPY READ RAM OUT OF ROM

W448 merged `$246520`/`$24652A` and found the live copy crashes.

**`$246528 60 08` is `bra.s $246532`** (confirmed by the coordinator) -- **`$246520` and `$24652A`
are TWO HEADS ON ONE BODY.** That one routine existed **three times**.

**`spawn.js`'s copy was the LIVE one** (`handlers.js`, type `$4C`'s death arm, `$26F6D8`) **and it
read the palette snapshot with `rom.u16`.** `$2465C8` makes A3 `$24627A[family]` + bias, and
`$24627A`'s bases are `$80E886 / $80FA66 / $80F086` -- **palette RAM.** Type `$4C`'s script is
{count 1, family 0, bias `$480`} -> `rom.u16($80ED06)`, **outside every declared window and outside
the 6 MiB image.** Measured: the deleted body **throws `Unreached`** on the real windowed face; the
survivor returns `$810346`. **Third wave running where the LIVE copy is the broken one.**

### W448: NO SINGLE COPY WAS CORRECT. THE UNION OF THEIR CORRECTNESS WAS THE ROM.

**MY BRIEF SAID "same script layout under three vocabularies". THAT WAS TOO KIND.**

    axis                                    animobjects   spawn      stageend
    $246608 moveq #-$1,D0 failure return        0           0        $FFFFFFFF  ok
    $24655E node claim / $246562                ok        ABSENT        ok
    $246592 adda.w sign-extends the bias        ok       unsigned       ok
    $2465D4 snapshot source                    RAM ok      ROM         RAM ok
    ($12,A2) -- the ROM never writes it      INVENTED       ok           ok
    $2465E2 one forward pass                  rescan        ok        rescan
    $246558 is a DO-WHILE (no entry test)       ok          ok       for(n<count)

**AND THE FAILURE RETURN WAS WORSE THAN I SAID -- FOUR wrong returns across two copies, both arms
each**, not one entry differing. `$246608` and `$2465E6` are both `70 ff` (confirmed).
**`stageend.js` was right; the other two were wrong.**

**SURVIVOR: `animobjects.js`** -- a leaf importing only `ram.js`/`unported.js`, already owning the
constants, and already imported by `stageend.js`, **so no import edge inverts.**

**THE DISTINCTION WAS NOT LOST:** `$246762` writes `#$1` where `$246576` writes `#$0`, and the
content shapes differ (6 words with a script target vs 4 words with a constant). **Both pinned
against the image.**

**THE RED ARM AND WHY A PLAIN TRACE IS NOT ENOUGH:** SECTION 3's cells are all script-derived, **so
`spawn.js`'s ROM-reading body would have PASSED it outright.** SECTION 4b runs the same script with
**palette RAM in the opposite state** and requires all 256 snapshot words to differ while every
script-derived field stays identical -- **`($E,A2)` is the only input living in RAM, so this is the
only arm that separates a loader reading `$80E886` from one reading `$24xxxx`.**

**TWO TESTS WERE PINNING THE DEFECT** in `w341chainfree.test.js` -- one asserted `=== 0` **while
citing `'$246608 moveq #-$1,D0'` in the same breath**, and the same file put the snapshot words
into the ROM map. **Both rewritten.**

**REPORTED, NOT FIXED: `$246410` has the IDENTICAL defect** -- `$2464F6`/`$246518` are both
`moveq #-$1,D0` and `loadAnimObjects246410` returns `0`.

**NOTE FOR THE RESERVED `$246800` WAVE:** `freeAnimObjects246800(ram, $FFFFFFFF)` raises
`RangeError`. **Pre-existing** -- `chainLoader246710` already returned `$FFFFFFFF` -- so this wave
makes the heads consistent with it rather than introducing it.

Register: **22 - 2 = 20**, updated in three places, all keeping the numeric `length` beside the set.

Verified by the coordinator on a quiet tree: **4120 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added. **No unrelated test went red**;
ladder band unmoved.


### W449: `$246800` MERGED -- A **FOURTH** COPY WAS HIDDEN, AND THE CRASH IS THE CARTRIDGE'S

**MY BRIEF SAID 1/1/10 CALL SITES, 12 TOTAL. IT IS 5/0/11, AND SIXTEEN.** The brief counted only
calls through an exported `246800`-suffixed name. **`animobjects.js` reached its own body through
the PRIVATE name `clearChain` -- a FOURTH transcription invisible to the register scan** -- at four
sites, all genuine ROM `bsr $246800`. **And `spawn.js freeChain246800` had ZERO production
callers.**

**"THE LIVE COPY KEEPS BEING THE BROKEN ONE" BREAKS HERE, and that is worth recording.** W446/W447/
W448 each found the shipping copy wrong. **Here the defect was in the copy with a production caller,
and the copy correct on EVERY axis was the one nothing called.** SECTION 3b runs it verbatim and
requires it to AGREE with the survivor across all 128 KiB of RAM.

**DEFECT 1 CONFIRMED -- THE CONDITION WAS INVENTED AT BOTH LEVELS.** `$246812 66 f0` is `bne.s -16`
to **`$246804`, the loop top**, and `$246804` is `movea.l D0,A0 / clr.w (A0)` -- **no `tst`, no
`beq`.** **And the CALLER has no test either**: `$27C720 20 2d 00 34` then `$27C724 4e b9 ...` with
**nothing between**. All confirmed by the coordinator. Same at `$28D704` and `$291FBC`.

**DEFECT 2 IS NOT A DEFECT -- THE `$FFFFFFFF` FREE IS THE CARTRIDGE'S OWN BEHAVIOUR.** `$246608`,
`$2465E6`, `$2464F6`, `$246518` are all `70 ff`, and `$27CB6E` is the ONLY writer of `($34,A5)` in
the whole page -- it stores the return verbatim. **There is no guard to port:** `movea.l D0,A0`
makes A0 `$FFFFFFFF`, the 24-bit bus takes it to `$FFFFFF`, and a word `clr.w` at an **ODD** address
is a 68000 **ADDRESS ERROR, vector 3**. **A crash the board also has is not a defect**, so the port
still stops -- but now by ADDRESS, not an anonymous `RangeError`. **Adding a quiet guard would have
been DEFECT 1 again.**

**SURVIVOR: `animobjects.js`** (leaf; `stageend.js` already imports it, so the other direction would
have made a cycle). **The survivor is the UNION of the three**: `spawn.js`'s do-while, null refusal
and cap, in `animobjects.js`'s file, serving `stageend.js`'s eleven sites.

**THE ARM A PLAIN TRACE CANNOT REPLACE (SECTION 4b):** same handle and link count with `($2C)`
pointing at the **opposite half of the pool**, requiring the released sets to be **DISJOINT**. **A
body that clears the whole pool, or runs a fixed stride, or frees only the head, releases the same
set in both arms and satisfies SECTION 3 outright.** A second arm walks the links **backward** so a
stride-walker fails too. The trace is witnessed entirely in `palette.js`, outside all eight changed
files, freeing mid-fade so the pool separates **released / did nothing / freed too much**, with a
positive control.

**NO TEST WAS PINNING THE DEFECT -- and that IS the finding.** `w341chainfree.test.js` proved the
do-while from the image **while `animobjects.js` contradicted it for 108 waves.** The wave added the
test that would have caught it.

**REPORTED, NOT FIXED: two of the 21 ROM callers reach NO port at all.** `$290846` and `$2908C2` go
through an optional `ctx.commit246800` hook **that no production ctx supplies** -- so those frees
never run and their chains **leak** out of the 20-slot pool, while a third site in the same file
calls the routine directly.

Register: **20 -> 19**, updated in all three places, numeric `length` kept beside each set.

Verified by the coordinator on a quiet tree: **4142 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows with none added. Ladder band unmoved.


### D69: THE TRUE DUPLICATE COUNT IS **92**, NOT 19 -- AND HEAD-WIDENING ALONE WOULD NOT HAVE
### CAUGHT W449

**73 newly visible.** All 19 shipped rows survive (0 dropped): 68 appear because of wider head
forms, 5 because of the doc-span rule.

**THE MOST IMPORTANT LINE, AND IT CORRECTS MY BRIEF:** **widening the head forms would NOT have
caught W449's `clearChain`.** The wave recovered the real pre-W449 body from `819ea42~1` -- it had
**no `export`, no name suffix and NO JSDoc** (confirmed by the coordinator). Its only address
markers were **trailing body comments**. A head-only widened scan was measured against that tree
and **still missed it.** It took a **THIRD axis -- body-comment markers -- that my brief did not ask
for.**

**AND A SECOND REGISTER THE OLD SCAN HAD NO AXIS FOR AT ALL: 39 PAIRS of bodies transcribing a
shared RUN of ROM instructions, and 26 of those name a body on NO head-register row.**

**"WHICH END OF A RANGE" -- BOTH, DELIBERATELY.** Taking only the opening address **dropped 3 of the
shipped 19**. **Picking either end just moves the blind spot.** Indexing the whole span keeps all 19
and adds three real rows, at a cost of 2 redundant ones.

**THE REGISTER SCANNER IS ITSELF TRANSCRIBED FOUR TIMES** -- `w446`/`w447`/`w448`/`w449` each carry
an identical inline `portedIndex()`. **That is the W446 defect one level up, living inside the
guard.** Reported, not merged.

**RED-PROVEN THREE WAYS, and the first is the one that matters:**
1. **LIVE PLANT IN THE REAL TREE** -- a private second transcription of the address W446 merged,
   put into `src/unported.js`. **W450 went RED; all four shipped registers stayed GREEN (56 tests,
   0 fail).** That is **W449's blind spot reproduced live.** Restored byte-exact, sha256 verified.
2. **Historical positive control** -- W449's three real bodies verbatim: the widened scan reports
   all three pairings including the private one; the narrow scan reaches only the two exports.
3. **Six hermetic arms** on synthetic trees, plus **two NEGATIVE controls** -- a call target must not
   count as a transcription (**counting it inflated 39 pairs to 112**), and one shared address must
   not make a pair.

**SHARPEST NEWLY VISIBLE, each its own wave, NOTHING MERGED:**
- **`$242684` -- SIX private transcriptions**, and **they already differ**: one reads two separate
  words where the others read one longword, another inverts the sense. **All six were invisible.**
- **`$242494`** -- exported vs private, bodies also sharing 6 instruction markers.
- **`handlers.js fire11` <-> `turret.js turretStep`** -- 7 shared markers, **on neither head row**.
- `$24631C`, `$2414BE`, `$28C0FC` (two written twice under the SAME name), and five more.

Classified as NOT duplicates: same-file wrapper/entry pairs and the 2 range-end rows.

Verified by the coordinator on a quiet tree: **4158 pass / 0 fail / 0 skipped**, gate exit 0 with
31 PASS / 0 FAIL, `--verify` OK at 613 windows. **`src/` untouched -- tests only.**


### D69 FOLLOW-UP -- W451 MERGED ALL SIX `$242684` COPIES, AND ONE WAS AN INVENTION

**W450's sharpest row is gone:** six private helpers became one exported
`movement.js offScreen242684`. The widened register moves **92 -> 91**, and the body-pair register
moves **39 -> 38**. The narrow export-only register remains 19, which is why it could not guide this
merge.

**Five copies were equivalent after normalising their return sense. The sixth was not.**
`stage4type42.js onScreen` omitted `$24268C add.w $813172,D0`, swapped A6+$02 and A6+$04, replaced
both unsigned wrap bands with invented signed bounds, and drove the caller's one-shot on the wrong
arm. A mode-1 type `$42` child could be marked while off-screen and freed on the frame it came
on-screen.

**THE IMAGE SETTLES EVERY AXIS.** `$242684 move.l ($2,A6),D0` leaves A6+$04 in D0.w, adds `$1C00`
and `$813172`, then exits on carry from `+$9000`. After `swap`, A6+$02 takes `+$0800` and
`+$8000`. Carry set means off-screen. The image has **30 direct callers: 26 BCC, 4 BCS**.

**THE TRACE DISTINGUISHES NEVER SEEN FROM SEEN AND FREED:** off-screen -> on-screen -> off-screen
produces `enemies.js` live counts **1, 1, 0**, then its allocator reuses the exact freed slot. Two
opposite-RAM-state arms separately prove the scroll input and the A6+$02 boundary. The RED mutation
replaced the survivor's scroll input with zero, failed on the opposite-scroll arm, and was restored
byte-exactly.

Verified independently by the coordinator: **4166 pass / 0 fail / 0 skipped**, webgate exit 0,
`--verify` OK, and all six W441 rungs remain **210/210 bullets, pool A 70/70, pool B 80/80**.

**NEXT VISIBLE DOCKET UNIT: D65, bee visibility against the oracle.** The owner's impression is not
spec. Compare carrier and released-bee draw output on board frames where each exists; measure before
changing code.


### D65 FOLLOW-UP, W452 BEE DRAW ORACLE: TWO CADENCES, BOTH ALREADY MATCH

**D65 IS CLOSED WITHOUT A PRODUCTION CHANGE.** Cartridge bytes, deterministic VERSION-B board
captures, and checkpoint replay agree. The owner's impression remained a report rather than a
specification, and the measured port already follows the cartridge.

**THE COVERED CARRIER AND RELEASED BEE HAVE DIFFERENT RULES.** Type `$8A` returns without drawing
while no live player is within `$240` on the short axis. Once eligible, `$2767AA bchg #6,($1,A6)` and
`$2767B0 bne $2767CE` emit every other frame. The released kind-1 bee has no corresponding draw gate:
its `$27FC8C..$27FCE6` idle arm emits on every surviving in-bounds frame while art cycles B,A,A.
`$268916`, previously cited here as carrier flicker, is type `$11` hit-palette flashing and unrelated.

**THE BOARD WITNESS IS OBJECT-SPECIFIC.** Covered carrier frames lf11297 and lf11378 contain the
record but not its derived ten-byte hardware entry. Carrier lf3802..3805 and lf3998..4001 alternate
present, absent, present, absent, with art changing only on present frames. After the carrier frees,
lf11380..11385 carries a released bee and its exact entry on all six B,A,A,B,A,A frames. Twenty
selected board frames and 24 framebuffer SHA-256 identities are pinned in
`tools/oracle/w452beevisibility.board.json`; `w452beevisibility.py` verifies them against two raw MAME
captures. Full-list equality is deliberately not claimed because unrelated producers differ. Exact
target-record equality plus aligned target-entry containment is the falsifiable witness.

**DIRTY AND OPPOSITE ARMS ARE PINNED.** A dirty far carrier preserves counter, status and descriptor
and emits nothing; moving that same record near reloads `$000F`, decrements to `$000E`, and emits on
old-clear bit-6 frames only. No-live-player suppresses, while mover freeze bypasses proximity as the
ROM does. A recycled bee slot overwrites all 34 bytes owned by the fill, preserves ten cartridge holes
including `+$1A/+$1B`, and still emits B,A,A continuously. Its off-screen opposite frees without an
emit.

**TWO TEMPORARY RED MUTATIONS WERE PERFORMED AND RESTORED BYTE-EXACT.** Inverting the carrier's
`if (was) return` changed the first board-visible art and shifted requests to the wrong frames. Adding
a timer-1 suppression to the released-bee idle arm removed the exact board entry at lf11381. Both
focused runs failed for those reasons, and both source hashes returned exactly to their starting
values.

**NEXT CONCRETE DOCKET UNIT: W453, D69 `$242494`.** Audit the exported and private transcriptions
that W450's widened register paired by six shared instruction markers. Merge only if cartridge bytes
and opposite-state tests prove equivalence; otherwise classify the difference. Continue all Black
Label, including the full second loop and remaining docket, then finish White Label last.


### D69 FOLLOW-UP, W453 `$242494`: THE EXPORTED AND PRIVATE DISTANCE BODIES WERE EQUIVALENT

**THE COPIES ARE MERGED.** `items.js` no longer carries a private `dist242494`; its real `$27EE88`
caller now reads A6+$02 and A6+$04 explicitly and passes Y, X, target Y, target X to the exported
`bossscripts.js dist242494`. The survivor now has 20 production calls. The narrow export-only
register remains **19**, while the widened head register moves **91 -> 90** and the body-pair register
moves **38 -> 37**.

**THE IMAGE SETTLES THE CALLING CONVENTION AND EVERY WORD OPERATION.** Exact raw-image spans
`$24248E..$2424B9` and `$27EE80..$27EE9F` pin both `movem.w` loads, both subtraction signs, word
negation including `$8000`, Y-only three-quarter scaling, unsigned compare and conditional full-register
swap, logical half-minimum, wrapped `add.w`, final `move.w D0,D0`, the fixed target `$4600/$1C00`, the
`jsr`, unsigned `$0200` threshold, latch bit, and speed store. `movem.w` sign-extends both words, but the
body consumes only their low words. The largest reachable coordinate result is `$B000`, so a final add
carry is unreachable from valid inputs; a separate synthetic post-negation `$FFFF + ($0002 >> 1)`
proves the decoded `add.w` wraps to `$0000` without inventing an impossible coordinate case. The image
contains 21 direct `jsr $242494` sites, all pinned by address.

**THE REAL ITEM DRIVER PROVES RAM ORDER AND EXTERNAL STATE.** Four dirty reused kind `$08` records
run through `$27E99E`: near positive Y and mirrored near negative Y latch to status `$A108`, speed `$0A`
and angle `$20`; far-X-only and far-Y-only records remain `$A008`, speed `$5D` and angle `$29`. Every
arm emits one 12-byte bucket-17 record, preserves frozen coordinates and leaves unowned dirty bytes
untouched. These opposite outcomes catch an omitted A6+$02 read, an omitted A6+$04 read, or swapped
Y/X arguments.

**A REAL TEMPORARY RED MUTATION WAS RUN AND RESTORED BYTE-EXACT.** Replacing the merged call with the
old private signature `dist242494(ram, a6, D2, D3)` made SECTION 3 reject the stale call shape and made
the behavioral arm fail because near positive Y remained status `$A008` instead of latching to
`$A108`. `items.js` SHA-256 was
`4cc3780ebca5af0b9e9cf3a6b3ac91baf12a9782a2974d7eb51832545fa04e5c` before mutation and exactly the
same after restoration.

Validation on the quiet tree: focused W453 **8 pass / 0 fail / 0 skipped**; directly affected item,
W94 and W446-W451/W453 register regressions **165 pass / 0 fail / 0 skipped**; full suite **4181 pass /
0 fail / 0 skipped**; webgate exit 0 with all checks passing; `--verify` OK at **613 windows**, with no
window added. The W441 D14 oracle ladder does not intersect kind `$08` item homing and was not a
relevant behavior ladder for this equivalent merge.

**NEXT CONCRETE DOCKET UNIT: W454, D69 `handlers.js fire11` <-> `turret.js turretStep`.** It is now the
strongest body-only pair: seven shared markers across `$268A1A..$268A54`, with neither body represented
by a widened head-register row. Audit both bodies and their real callers against the cartridge before
merging or classifying them. Continue Black Label through the full second loop and close its docket,
then finish White Label last.


### D69 FOLLOW-UP, W454 TURRET BODY MERGE: TWO TYPE EXITS, ONE PRODUCTION IMPLEMENTATION

**THE BODIES ARE EQUIVALENT AND MERGED.** `handlers.js fire11` no longer carries the private
transcription. Type `$11` and type `$10` both call exported `turret.js turretStep`, passing the live A6
register plus a type specification. The shared result names the cartridge continuation: freeze and
no-live-player carry go to that type's common draw, while cadence no-borrow and successful aim fall
through into that type's own fire counter and fan. Type `$11` keeps table `$268C9E`, draw size `$0620`
and kind `$D`; type `$10` keeps table `$268694`, draw size `$0830` and kind `$C`.

**THE IMAGE PINS BOTH COMPLETE SHARED BLOCKS.** The exact 0x50-byte spans are
`$268A0E..$268A5D` and `$268376..$2683C5`. All seven W450 markers map independently:
`$268A1A/$268382`, `$268A20/$268388`, `$268A26/$26838E`, `$268A36/$26839E`,
`$268A38/$2683A0`, `$268A42/$2683AA`, and `$268A54/$2683BC`. The 80-byte bodies differ at only
three byte offsets: each type's freeze branch displacement, carry branch displacement and PC-relative
sprite-table displacement. Short branches use opcode address plus two. Type `$11`'s `beq.w` at
`$268A5E` targets `$268A68` from extension word `$268A60`; both `lea` targets are likewise based at
their extension words, yielding `$268C9E` and `$268694`.

**DIRTY PRODUCTION RECORDS PROVE THE CALLING CONVENTION AND EXTERNAL STATE.** Both complete handlers
were driven with recycled A5 and A6 bytes through freeze, cadence non-borrow, cadence borrow and
no-live-player carry. The witnesses include cadence, one-step facing wrap 63 to 0, sprite longword,
type-specific two-record bucket output, draw size and fire counter. Borrow reloads the byte from
A5+$19 before target selection. `movem.w ($2,A6),D0-D1` reads Y then X, sign-extends each word, and the
subsequent word operations consume the low words. `addi.w #$0200,D0` applies the muzzle offset. The
sprite index preserves `addq.b`, `andi.w #$003E`, and four-byte longword stride semantics. A separate
dirty-pointer witness leaves A5+$06 aimed at a decoy while passing the caller-held A6; only the live
A6 coordinates determine the result.

**A REAL TEMPORARY RED MUTATION WAS RUN AND RESTORED BYTE-EXACT.** Routing the type `$11` production
call through `TURRET_10` selected `$268694` instead of `$268C9E`. The focused external witness failed
with sprite `$0016F8B4` instead of `$001676B4`. `handlers.js` SHA-256 was
`536d092bb1e90d8ed25a8e9cc84b77237f4df02f723e579ba1c612fe808c114a` before mutation and exactly the
same after restoration.

The duplicate registers reconcile exactly: narrow export-only heads **19**, unchanged; widened heads
**90**, unchanged; body pairs **37 -> 36**, with body-only findings **25 -> 24**. No ROM export window
was widened or added.

Validation on the quiet tree: focused W454 **8 pass / 0 fail / 0 skipped**; directly affected turret,
handler and W446-W453 register regressions **155 pass / 0 fail / 0 skipped**; full suite **4189 pass /
0 fail / 0 skipped**; webgate exit 0 with all checks passing; `--verify` OK at **613 windows**. The W20
board oracle matched type `$10` and `$11` over **14,732 one-step pairs** and **14,732 closed-loop
steps**, with zero facing, cadence or sprite divergence on its production sample-point arm.

**NEXT CONCRETE DOCKET UNIT: W455, D69 `items.js beamReset25270C` <->
`laser.js wipeSegmentPool`.** It is the strongest remaining body-only pair, with six shared markers
over `$25279A..$2527AE`. Audit cartridge bytes, all callers and dirty pool-reset behavior before
merging or classifying. Publish is next due at **W456**, against a quiet tree and with `export-web.mjs`
before `publish.mjs`. Continue Black Label through the full second loop and close its docket, then
finish White Label last.


### D69 FOLLOW-UP, W455 BEAM RESET: DISTINCT FULL HEADS, ONE SHARED INNER WIPE

**THE COMPLETE ROUTINES ARE NOT EQUIVALENT, BUT THE DUPLICATED TAIL IS.** `$25270C` and `$252754`
each execute a side-specific `andi.w #$DFFB` before entering `$252714` or `$25275C`. The cartridge has
one common implementation at `$25279A..$2527BC`. `items.js beamReset25270C` is now a thin full-entry
wrapper for the unique mask and delegates to the sole `laser.js wipeSegmentPool`; release, laser-bomb
and death callers retain their inner-entry semantics and skip the mask. The bomb caller now passes the
canonical `BEAM` side row instead of its locally inverted D7 convention.

**THE IMAGE PINS BOTH HEADS, THE COMMON TAIL AND THE SOUND TABLE.** Raw image SHA-256
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c` pins `$25270C+$48`,
`$252754+$6A`, `$25279A+$24` and `$2527BE+$10`. The selector is a word with live values 0 and 2;
`add.w D0,D0` forms byte offsets 0 and 4, not JavaScript indices 0 and 2. P1 therefore posts
`$28C43C/$28C49C` from `$2527BE`, while P2 posts `$28C452/$28C4B2` from `$2527C6`. Hyper checks
`$81B63E` or `$81B640` and overrides with `$28C4FC` or `$28C512` respectively. This fixes the old
P2-table, P2-hyper and selector-index defects rather than preserving the counted sound note.

**THE COMPLETE CALLER CENSUS SEPARATES ENTRY CONVENTIONS.** Four item callers, two end-hyper
wrappers and two laser-bomb cleanup calls enter a full head directly. Hyper request loads either full
head and calls it once through A0. Option release, bomb firing and player death contribute six live
direct inner-entry calls. `$24972E/$249742` are the only other direct full-head references, inside the
unconditionally skipped `$249712..$2497A0` block. The source census pins eight `beamReset25270C`
function-name occurrences including its declaration and five `wipeSegmentPool` occurrences including
its declaration.

**DIRTY RECYCLED RAM PROVES OWNERSHIP AND CONTINUATION.** Both sides, selectors 0 and 2, and both
hyper overrides clear all 32 slot type words, including slot 31, while preserving the other 46 bytes of
every `$30`-byte slot. Only the beam record word, block word, block `+$16` word and option low-byte bit 7
are cleared; dirty surrounding bytes, the opposite pool and controls, and boundary sentinels survive.
Full-entry item paths additionally apply `#$DFFB`; the real option-release path does not and continues to
`$24C2E8`, restoring reload and pod swing-back state. Real P1 power and P2 full-power item-driver paths
also continue into their collected animation, cursor, queue and item-event behavior.

**A REAL TEMPORARY RED MUTATION WAS RUN AND RESTORED BYTE-EXACT.** Changing the 32-slot loop from
`k <= 0x1F` to `k < 0x1F` made four external witnesses fail because slot 31 retained `$801F` or `$811F`.
`laser.js` SHA-256 was
`321ae35487624fb805feab77fd46270ad8bf8eb8e5a77b82f7adc2bcf2d51944` before mutation and exactly the
same after restoration.

The duplicate registers reconcile exactly: narrow export-only heads **19**, unchanged; widened heads
**90**, unchanged; body pairs **36 -> 35**; body-only findings **24 -> 23**. No production ROM export
window was widened or added; the focused proof reads the raw image.

Validation on the final tree: focused W455 **11 pass / 0 fail / 0 skipped**; affected beam, item, bomb,
hyper, death, option, W444 and W450-W454 regressions **350 pass / 0 fail / 0 skipped**; full suite
**4200 pass / 0 fail / 0 skipped**; webgate and export verification are recorded in the handoff after
their final runs.

**NEXT CONCRETE DOCKET UNIT: W456, D69 `items.js applyItemVelocity` <->
`movement.js applyVelocityA6`.** It is a six-marker body pair over `$2417E0..$2417F8`. Audit the
complete cartridge bodies, every calling convention, wrapped longword and word arithmetic, and dirty
recycled records before merging or classifying. After W456 is independently verified and landed, run
`games/ddpdoj/tools/export-web.mjs` before `tools/publish.mjs`, and publish only on a quiet tree with no
working agent. Continue Black Label through the full second loop and close its docket, then finish
White Label last.


### D69 FOLLOW-UP, W456 ITEM VELOCITY: ONE COMPLETE A6 BODY, SHORTER OVERLAPS UNMERGED

**THE COMPLETE ITEM BODY IS EQUIVALENT AND MERGED.** `items.js applyItemVelocity` and
`movement.js applyVelocityA6` transcribed the same complete `$2417DE..$241803` body. Item records own
the exact raw A6 offsets: the first position word at +$02, second at +$04, speed byte at +$1A, and
heading byte at +$1B. Both item source callers ignored the helper return, so five cartridge item
transfers now pass caller-held A6 and `ctx.tables` through two direct calls to the canonical exported
helper. The `$2417D4` option entry and player continuations remain independent: option owns D0/D1 as
words and skips the speed/heading loads, while player callers consume returned D2/D3 and continue into
player-specific stores.

**THE IMAGE PINS THE COMPLETE BODY, VECTOR HEAD AND REAL CALLERS.** Raw image SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`. The exact 38-byte body is
`7000102E001A723FC22E001B4A79008130D2660C611ED56E0002D76E00044E75740076004E75`, SHA-256
`ca3b54244f3033a7e0ce09004945a5fc7a069fd989d86ce2d51f190dd65c2024`. The regression also pins
`$241812+$3E`, all five item caller spans at `$27EBBA/$27ED6A/$27EEFE/$27F62E/$27F686`, normal and max
collected continuations, `$242684+$20`, option `$2417D4`, player `$2495CA+$16` and stage-clear
`$24A404+$0C`.

A scan of `$230000..$2AFFFF` finds exactly **65 direct transfers** to `$2417DE`: 62 absolute `jsr`, two
absolute `jmp`, and one PC-relative `jmp`. The five item addresses above are the complete item subset.
The source census pins seven `applyVelocityA6` name occurrences including its declaration: two raw A6
handlers, two item paths representing five transfers, the declaration, the A5+$06 wrapper, and the raw
stick tail. The wrapper itself has 31 production calls. Explicit A5 and A6 base ownership cannot drift
silently.

**THE ARITHMETIC IS INSTRUCTION-WIDTH EXACT.** D0 is zero-extended before `move.b +$1A`; D1 is owned by
`moveq #$3F` before `and.b +$1B`. The word freeze gate branches before table lookup and returns D2=D3=0.
The live arm calls `$241812`, which doubles word indices, reads the `$200920` pointer table, folds the
heading, loads two longwords, applies `asr.l #4`, and negates quadrant-selected words. The body then uses
two independent `add.w` operations. Low-half carry cannot enter the high half. Neither the body nor the
vector routine contains a `swap`; the later `$242684` packed-position continuation has the relevant
`move.l`, low-word carry tests, and one `swap D0`.

**DIRTY EXTERNAL STATE PROVES THE CONSOLIDATION.** Direct A6 witnesses cover positive and negative
words, opposite signs, low-half carry without propagation, high-half wrap, six-bit heading masking,
live and frozen gates, and preservation of every unowned byte. A dirty A5 pointer with a decoy record
proves only A5+$06 selects the wrapper target. Raw `$242A48` stick paths prove direct A6 ownership and
the `$40` refusal heading. A reused free item proves only its first 32 bytes are initialized while
+$20..+$3F residue and pool sentinels survive. Real kinds `$00/$04/$08` prove queue output, off-screen
free and count decrement, frozen draw continuation, and opposite lifecycle arms. Normal and maximum
collected paths prove both carry states of the header `add.l`, packed queue coordinates, later independent
movement words, frame/cursor continuation, and preserved recycled residue.

**A REAL TEMPORARY RED MUTATION FAILED AND WAS RESTORED BYTE-EXACT.** Changing the canonical second-axis
term from `v.dx` to `v.dy` failed four external-state sections: direct A6, A5-pointer, kind `$04`
lifecycle, and collected animation. Before mutation and after restoration, `movement.js` SHA-256 was
`f904abe74e6d7d91b7d2c769fe177f9ef459a207688f57583964054b02c90b61`; its 535 CRLF sequences and zero
bare LF also match.

The live duplicate registers reconcile exactly: narrow export-only heads **19**, unchanged; widened
heads **90**, unchanged; body pairs **35 -> 31**; body-only findings **24 -> 22**. The live
`headIndex()` derivation corrects the prior manually stated baseline of 23, which was one low. The
deleted item node removed four edges. Item/movement and item/player-helper were also head-visible at
`$2417DE`; item/option and item/updatePlayer were body-only. All six shorter movement/option/player suffix edges
remain registered. No production ROM export window was added or widened.

Validation on the final working tree: focused W456 **12 pass / 0 fail / 0 skipped**; the 18-file affected
movement/item/D69 set **252 pass / 0 fail / 0 skipped**; full suite **4212 pass / 0 fail / 0 skipped**;
webgate exit 0 with **31 PASS / 0 FAIL**; ROM verification returned **VERIFY OK at 613 windows**. Exact
commands were:

    node --test C:/programmieren/batman/games/ddpdoj/tests/w456mergedvelocity.test.js
    node --test C:/programmieren/batman/games/ddpdoj/tests/integration.test.js C:/programmieren/batman/games/ddpdoj/tests/movement.test.js C:/programmieren/batman/games/ddpdoj/tests/w36handlers.test.js C:/programmieren/batman/games/ddpdoj/tests/w61items.test.js C:/programmieren/batman/games/ddpdoj/tests/w283itemsources.test.js C:/programmieren/batman/games/ddpdoj/tests/w401arity.test.js C:/programmieren/batman/games/ddpdoj/tests/w444deferrals.test.js C:/programmieren/batman/games/ddpdoj/tests/w446mergedbonusline1.test.js C:/programmieren/batman/games/ddpdoj/tests/w447merged2428a6.test.js C:/programmieren/batman/games/ddpdoj/tests/w448merged246520.test.js C:/programmieren/batman/games/ddpdoj/tests/w449merged246800.test.js C:/programmieren/batman/games/ddpdoj/tests/w450widenedregister.test.js C:/programmieren/batman/games/ddpdoj/tests/w451merged242684.test.js C:/programmieren/batman/games/ddpdoj/tests/w452beevisibility.test.js C:/programmieren/batman/games/ddpdoj/tests/w453merged242494.test.js C:/programmieren/batman/games/ddpdoj/tests/w454mergedturretstep.test.js C:/programmieren/batman/games/ddpdoj/tests/w455mergedbeamreset.test.js C:/programmieren/batman/games/ddpdoj/tests/w456mergedvelocity.test.js
    node --test games/ddpdoj/tests/
    node games/ddpdoj/tools/webgate.mjs
    python games/ddpdoj/tools/export-tables.py --verify

No export-web, asset export, publish, commit, push, branch switch or worktree operation occurred.

**NEXT CONCRETE DOCKET UNIT: W457, D69 `tallyscreen.js cursorsFromPosted25D9E6` <->
`tallyscreen.js mapSavedCursor25D9E6`.** It is the strongest live post-W456 pair, with six shared markers
at `$25D9EA`, `$25D9F8`, `$25DA04`, `$25DA10`, `$25DA2E`, and `$25DA50`. Audit complete cartridge
bodies, callers, saved/post cursor ownership, dirty state, branches and continuations before merging or
classifying. The coordinator must first independently verify and land W456, then, on a quiet tree with
no working agent, run `games/ddpdoj/tools/export-web.mjs` before `tools/publish.mjs`. Continue Black
Label through the full second loop and close its docket, then finish White Label last.


### D69 FOLLOW-UP, W457 TALLY CURSOR: ONE COMPLETE WORD-WIDTH BODY, TWO CALLER CONVENTIONS

**THE `$25D9E6` BODIES ARE EQUIVALENT AND MERGED.** `tallyscreen.js cursorsFromPosted25D9E6` is the
sole production implementation. The former `mapSavedCursor25D9E6` name is an export alias, not a second
body. Both `$25DA60` source functions now call the canonical body, but remain separate functions: this
wave does not merge `loadSavedCursor25DA60` and `restoreCursors25DA60`.

**THE BUILD-B IMAGE PINS THE COMPLETE ROUTINE, TABLES, BRANCHES AND CALLERS.** Main CPU SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`. The complete 122-byte body is
`$25D9E6..$25DA5F`, or half-open span `[$25D9E6,$25DA60)`, and its entire byte string is frozen in the
W457 regression. X table `$25D986..$25D989` has two words `$0000,$0002`; Y table
`$25D98A..$25D98F` has three words `$0002,$0004,$0006`. Every control target is pinned:
`$25D9EE -> $25DA10`, `$25D9F4 -> $25DA04`, `$25DA00 -> $25DA56`, `$25DA0C -> $25DA56`,
`$25DA20 -> $25DA2A`, `$25DA26 -> $25DA2E`, `$25DA2A -> $25DA12`, `$25DA3E -> $25DA48`,
`$25DA44 -> $25DA4C`, and `$25DA48 -> $25DA30`. The last two loop edges are downward `DBRA` branches.
X visits indices 1 then 0, Y visits 2 then 1 then 0, and the first match branches out. A duplicated
value therefore selects the highest index. A synthetic duplicate overlay proves that direction, while
raw production tables are separately proven unique.

**WIDTH, SENTINEL AND CARRY OWNERSHIP ARE EXACT.** D0 and D1 are saved and restored. `TST.W` owns only
D5.W; sentinel and comparisons own only D6.W; Y comparisons own only D7.W. High words remain caller
state, and real continuations expose only D6.B and D7.B. D6.W equal to `$00FF` ignores D7 and defaults
to `(0,0)` when D5.W is zero or `(1,2)` when D5.W is nonzero. `$25DA5A ORI.W #$1,SR` sets carry on
that default arm. `$25DA50 ANDI.W #$FFFE,SR` clears carry after every searched arm, whether a value
matched or not. Matched values become word indices; unmatched low words survive unchanged until caller
byte stores truncate them. `$00FE` and `$0100` are searched, not adjacent sentinel aliases.

**ALL THREE DIRECT CALLERS AND BOTH LIVE FAMILIES ARE PINNED.** Direct calls are `$25D9A6`, `$25D9D0`
and `$25DA86`. Posting span `$25D990..$25D9E5` has side-0 and side-1 arms that prewrite two `$FF`
sentinels, call the routine, test carry with `BCS`, and store D6.B/D7.B only when carry is clear. Its
parent continuation `$260756..$260781` is frozen. Load span `$25DA60..$25DA93` calls once and stores both
bytes without observing carry; its phase-0 parent continuation `$25DC7C..$25DCA9` is frozen. Thus carry
has one observer family, not a universal return convention.

**DIRTY RAM AND EXTERNAL WITNESSES PROVE BOTH CONVENTIONS.** Posting tests drive both sides through
sentinel, searched, matched and unmatched values with dirty selection records. They prove carry-set
sentinels remain `$FF,$FF`, matches store `(1,2)` or `(0,0)`, unmatched `$0100/$01FF` truncate to
`$00/$FF`, and unowned bytes survive. Load tests prove side-0 sentinel `(0,0)`, side-1 sentinel `(1,2)`,
matched `(1,1)`, and unmatched low-byte truncation. Full phase-0 tests preserve those cursors, advance
phase to 1, post `[1,0]` to the correct side mailbox at `$813162` or `$813166`, and alter only phase and
the two cursor bytes in each dirty object record.

**A REAL TEMPORARY RED MUTATION FAILED AND WAS RESTORED BYTE-EXACT.** Changing the side-1 sentinel X
default from 1 to 0 failed both the direct `$25DA60` external witness and the full `$25DC2C` phase-0
witness, each receiving `(0,2)` instead of `(1,2)`. Before mutation and after restoration,
`tallyscreen.js` SHA-256 is
`7c7ce7b16ed4b9faef7df564fc06d64f71145fee557f158d8c8ac7a46cf3ec03`.

The live registers reconcile exactly: narrow export-only heads **19 -> 18**; widened heads **90 -> 89**;
body pairs **31 -> 30**; executable `headIndex()` derivation leaves body-only findings **22**, unchanged.
The independent `$25DA60` pair remains registered with markers `$25DA6C`, `$25DA86`, `$25DA8A`, and
`$25DA8E`. No production ROM window was added or widened, and no generated export or asset changed.

Editing-agent validation on the W457 tree: focused W457 **11 pass / 0 fail / 0 skipped**; broad tally,
front-end, integration and W446-W457 register set **675 pass / 0 fail / 0 skipped**; full suite
**4223 pass / 0 fail / 0 skipped**; webgate exit 0 with **31 PASS / 0 FAIL**; ROM verification returned
**VERIFY OK at 613 windows**. The coordinator independently repeated focused W457 at **11 pass**, an
import-derived affected surface at **536 pass**, the full suite at **4223 pass**, webgate at **31 PASS / 0
FAIL**, and ROM verification at **613 windows**. The coordinator also reproduced both RED external
failures, restored the exact source hash, and scanned the complete 6 MiB image for BSR plus absolute and
PC-relative JSR/JMP transfers; exactly the three pinned direct callers target `$25D9E6`.

**NEXT CONCRETE DOCKET UNIT: W458, D69 `tallyscreen.js loadSavedCursor25DA60` <->
`tallyscreen.js restoreCursors25DA60`.** Audit the complete `$25DA60` bodies and all four registered
markers, caller reachability, side indexing, object layout, dirty preservation and continuations before
merging or classifying. `loadSavedCursor25DA60` is live through `tallyPhase0Arm25DC2C`;
`restoreCursors25DA60` has no production source caller, so do not infer equivalence from the shared
inner call. No publish is due at W457. Continue Black Label through the full second loop and close its
docket, then finish White Label last.


### D69 FOLLOW-UP, W458 TALLY LOAD: ONE COMPLETE BODY, ONE LIVE NAME, ONE COMPATIBILITY NAME

**THE COMPLETE `$25DA60` BODIES ARE EQUIVALENT AND MERGED.** `loadSavedCursor25DA60` is the sole
function body and remains live through `tallyPhase0Arm25DC2C`, which is reached by object `[11]` state 1
in `tallyScreen25DBB4`. The source-uncalled `restoreCursors25DA60` name remains an export alias to the
same function object. Source deadness was measured separately and was not used as cartridge-equivalence
evidence. W457's `cursorsFromPosted25D9E6` body and `mapSavedCursor25D9E6` compatibility alias remain
canonical and unchanged.

**BUILD-B PINS THE COMPLETE BODY, BOUNDARIES AND CALLER CENSUS.** Main CPU SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`. The exact 52-byte half-open
span `[$25DA60,$25DA94)` is
`3c39008130843e39008130884a2d00076700000e3c39008130863e390081308a7a001a2d00076100ff5e1b46000e1b47000f4e75`.
The W458 regression separately enumerates all twelve instructions, with `$25DA70 BEQ.W -> $25DA80` and
`$25DA86 BSR.W -> $25D9E6` as the only control edges. `$25DA5E` is `RTS`, so the body has no fallthrough
entry, and `$25DA94` starts the next routine. A complete aligned scan over all 6 MiB covers BSR, BRA/Bcc,
DBcc, absolute-word, absolute-long and PC-relative JSR/JMP forms, plus indexed-PC zero-base candidates.
It finds one external direct caller, `$25DC7C BSR.W -> $25DA60`, one internal branch, and no other entry
into the body.

**THE COMPLETE PARENT GATE AND POST-LOAD ORDER ARE FROZEN.** Raw bytes pin the full
`[$25DC2C,$25DCC0)` gate and continuation. Its gates branch to `$25DCC0`; the successful arm calls
`$25DA60` at `$25DC7C`, then `$25DA94` at `$25DC80`, advances phase, posts the side announcement,
installs the bank, clears the slot table, posts tally request 7, and reaches the `$25E0EA` continuation.
W458 also found that W344 had stopped `$25DA94` too early. The complete picker is
`[$25DA94,$25DAC2)`, not a body ending at `$25DAAE`: `$25DAB2..$25DAC0` reloads the descriptor, follows
its `+$10` pointer to `$813008` or `$813018`, writes the collision-resolved Y row at `+$1`, and returns.
The production port now performs that external saved-row store.

**SIDE, WIDTH, MAILBOX AND RETURN CONVENTIONS ARE EXACT.** `$813084/$813086` are exactly
`TALLY.postD0[0/1]`, and `$813088/$81308A` are exactly `TALLY.postD1[0/1]`. Side byte zero selects the
first interleaved pair; every nonzero byte, including `$80` and `$FF`, selects the second. `$25DA80
MOVEQ #0,D5` followed by `$25DA82 MOVE.B ($7,A5),D5` zero-extends the raw side byte. D6 and D7 are word
loads. The canonical `$25D9E6` call returns mapped D6.W/D7.W and carry, but this caller ignores carry and
immediately stores only D6.B and D7.B at object `+$0E/+$0F`, then returns with `RTS`. The JavaScript
compatibility result exposes exactly `{x,y,defaulted}` and no unowned field. Mailbox words are read-only,
and every object byte except `+$0E/+$0F` is unowned by the load.

**DIRTY EXTERNAL WITNESSES COVER BOTH FORMER BODIES AND THE SURVIVOR.** Before the merge, twelve dirty
executions ran the six-case matrix through both distinct source names. Final W458 tests run both import
names through side bytes `0`, `1`, `$80`, `$FF`; both sides; sentinel and searched arms; matched and
unmatched values; `$00FE/$00FF/$0100`; carry set and clear; low-byte truncation; dirty opposite mailbox
words; dirty `$81308C/$81308E` neighbors; and preservation of every unowned object and mailbox byte.
The live parent runs side 0 with inactive `$81308C`, where an equal other-side row is ignored, and side
`$80` with active `$81308C`, where a loaded sentinel row 2 collides and `$25DA94` moves it to row 0 before
publishing it. The opposite nonzero-phase gate changes no dirty object, cursor mailbox, saved-selection,
or announcement byte.

**THE PRODUCTION RED MUTATION FAILED DIRECT AND FULL-PARENT STATE.** Temporarily inverting the canonical
mailbox-side polarity made the direct side-0 sentinel witness read dirty opposite-side words, returning
`{x:$93BE,y:$3F6A,defaulted:false}` instead of `{x:0,y:0,defaulted:true}`. The full `$25DC2C` witness
produced cursor bytes `$D0/$7C` instead of `(1,1)`. Exactly two W458 tests failed. Restoring the one line
returned `tallyscreen.js` byte-for-byte to SHA-256
`7abf028d0c7bf6c470fbdca1fd7babfd0fd98e353fe8bdee63f546a096cd44f0`, 57,952 bytes, LF-only.

The live scanner APIs reconcile exactly from W457 baseline: narrow heads **18 -> 17**, widened heads
**89 -> 88**, body pairs **30 -> 29**, and executable `headIndex()` derivation leaves body-only findings
**22**, unchanged because the removed pair was head-visible. Both `$25D9E6` and `$25DA60` remain absent
from head and body registers. No production ROM window was added or widened, and no generated rip or
asset changed.

Editing-agent validation on the final W458 tree: focused W458 **9 pass / 0 fail / 0 skipped**; complete
W446-W458 register chain plus row picker **143 pass / 0 fail / 0 skipped**; broad tally, selection
front-end, integration and register surface **402 pass / 0 fail / 0 skipped**; full suite **4232 pass / 0
fail / 0 skipped**; webgate **31 PASS / 0 FAIL**, exit 0; ROM verification **VERIFY OK at 613 windows**.
The coordinator independently repeated the focused W344/W457/W458 surface at **38 pass**, an imported
affected surface at **545 pass**, the full suite at **4232 pass**, webgate at **31 PASS / 0 FAIL**, and
ROM verification at **613 windows**. The coordinator reproduced both RED failures, restored the exact
source hash, and independently scanned the complete image for body entries and exact longword references.
`git diff --check`, added-character, hash, line-ending and ROM-window checks are clean. No export-web,
publish, stage, commit, push, branch switch or worktree operation occurred during editing-agent work.

**NEXT CONCRETE DOCKET UNIT: W459, D69 `player.js armRequest25FF38` <->
`tallyscreen.js tallyRequest25FF38`.** This is the strongest remaining complete-looking live pair,
registered by the widened head scan at `$25FF38` and by body markers `$25FF4A/$25FF4C`. Audit complete
cartridge bodies, every caller and continuation, side word polarity, dirty mailbox ownership and source
reachability before merging or classifying. No publish is due at W458. Continue Black Label through the
full second loop and close its docket, then finish White Label last.


### D69 FOLLOW-UP, W459 REQUEST POSTER: ONE CORRECTED BODY AND ONE COMPATIBILITY NAME

**THE TWO SOURCE TRANSCRIPTIONS WERE NOT EQUIVALENT BEFORE CORRECTION.** The cartridge tests D0.W,
while `player.js armRequest25FF38` originally tested the complete JavaScript value with `side === 0`.
For the concrete witness D0 = `$00010000`, the cartridge sees a zero low word and chooses `$8130FA`, but
the old helper chose `$81311E`. `tallyscreen.js tallyRequest25FF38` already used low-word ownership. The
canonical `armRequest25FF38` now truncates D0 to a word, truncates D1 on store, clears record `+2`, and
returns the selected record for compatibility. `tallyRequest25FF38` is an ESM re-export alias to that same
function object, so both public imports survive with one implementation.

**BUILD-B PINS THE COMPLETE BODY AND ITS BOUNDARIES.** Main CPU SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`. The exact 26-byte half-open
span `[$25FF38,$25FF52)` is
`41f9008130fa4a406700000841f90081311e3081426800024e75`, SHA-256
`2c1447e71c1b53f32b005fbf92693968ca790f2dbdafb441e53f1b5544d91405`. Its seven instructions are
`LEA $8130FA,A0`, `TST.W D0`, `BEQ.W $25FF4A`, `LEA $81311E,A0`, `MOVE.W D1,(A0)`,
`CLR.W 2(A0)`, and `RTS`. `$25FF36` is `RTS`, so there is no prior fallthrough. `$25FF52` begins the
nine-longword request dispatch table.

**THE COMPLETE ALIGNED 6 MiB TRANSFER CENSUS FINDS NINE BODY ENTRIES.** `$25FF40 Bcc -> $25FF4A` is
the one internal branch. The eight external transfers are `$25DCB4 JSR.L`, `$260434 JSR.PC16`,
`$260472 JSR.PC16`, `$26080E JMP.L`, `$26083E JMP.L`, `$26084A JMP.L`, `$288B2C JSR.L`, and
`$288C4C JSR.L`, all to `$25FF38`; no external transfer enters an internal instruction. The scan covers
BSR, relevant BRA/Bcc, absolute and PC-relative JSR/JMP, and 110 aligned indexed-PC JSR/JMP opcode
candidates, of which zero have a zero-index base inside the body. Six exact aligned longword references
at `$25DCB6`, `$260810`, `$260840`, `$26084C`, `$288B2E`, and `$288C4E` are all operands of those
absolute-long transfers.

**CALLER OWNERSHIP IS WORD-SIZED AND RETURN STATE IS NOT CONSUMED.** D0.W zero selects `$8130FA`; any
nonzero word, including `$8000` and `$FFFF`, selects `$81311E`. D0 high-word dirt is irrelevant. Only
D1.W stores, so D1 high-word dirt is irrelevant too. The second word is always cleared. The final
`CLR.W` sets Z, clears N/V/C, and preserves X, but callers either continue unconditionally or overwrite
NZVC before a conditional use. No caller consumes a returned data value. `$26080A` posts request 1,
`$260846` posts request 9, `$25DCB4` posts request 7, `$260434/$260472` post request 4, `$288B2C` posts
request 8, and `$288C4C` posts request 6. `$260816` posts request 3 after `MOVE.W D2,D0`, deliberately
leaving possible D0 high-word dirt, but has no aligned static caller, exact longword reference, or
fallthrough. Dynamic indirect reachability beyond the indexed-PC census remains unproved and is not
silently classified as dead.

**SOURCE AND CARTRIDGE REACHABILITY ARE KEPT SEPARATE.** Production has one `$25FF38` function body and
six caller bodies: `objslot13.js menuArm`, `objslot14.js state2`, `player.js playerDead24A130`,
`player.js playerObject2491C0`, `rank.js stagePair2603FE`, and `tallyscreen.js tallyPhase0Arm25DC2C`.
The death/reset request-1 stores now delegate to the canonical helper. The successful tally phase-0 path
now includes its cartridge request-7 post at `$25DCB4`. The following `$25E0EA` selector and unported
`$25E200` text-printer body remain an explicit deferral; W459 does not claim that separate continuation.

**DIRTY WITNESSES COVER BOTH NAMES, BOTH RECORDS, BOTH ARMS AND PARTIAL-WIDTH DIRT.** The direct matrix
runs D0 values `$00000000`, `$00010000`, `$DEAD0000`, `$00000001`, `$BEEF0002`, `$CAFE8000`,
`$ABCDFFFF` and D1 values including `$00010000`, `$FFFFFFFF`, `$00010001`, `$12340000`, `$FACE7FFF`,
and `$0001FFFF`. Every case starts with dirty request and state words, a dirty opposite record, and dirty
adjacent memory. Real `$25DCB4` request-7 parent witnesses cover both sides, and real `$2603FE` request-4
parent witnesses cover both records.

**THE PRODUCTION RED MUTATION FAILED DIRECT AND REAL-PARENT STATE.** Temporarily inverting only the
canonical D0.W side polarity made the dirty direct test return `$81311E` instead of `$8130FA` for zero.
The real `$25DCB4` request-7 witness left the expected record at dirty `[$E712,$3D68]` instead of
`[7,0]`. Exactly two W459 tests failed; seven cartridge and register checks remained green. The
`$2603FE` witness remained green because that parent posts both sides. Restoring the one line returned
`player.js` byte-for-byte to SHA-256
`ff9400fff0d3cdaba17ddeee84e20eae508a370676f56cd9a4fa4b91fbd6b4b6`, 71,190 bytes, LF-only.

The live scanner APIs reconcile exactly from the W458 baseline: narrow heads **17 -> 16**, widened heads
**88 -> 87**, body pairs **29 -> 28**, and executable derivation from current `headIndex()` leaves
body-only findings **22**, unchanged because the removed pair was head-visible. `$25FF38` is absent from
both authoritative registers. No production ROM window was added or widened, and no generated rip or
asset changed.

Editing-agent validation on the final W459 tree: focused W459 **9 pass / 0 fail / 0 skipped**; complete
W446-W459 register chain **148 pass / 0 fail / 0 skipped**; broad player, tally, rank, menu, death and
register surface **395 pass / 0 fail / 0 skipped**; full suite **4241 pass / 0 fail / 0 skipped**; webgate
**31 PASS / 0 FAIL**, exit 0; ROM verification **VERIFY OK at 613 windows**. The coordinator independently
reproduced the exact image and body hashes, the complete aligned transfer and longword-reference census,
and the same two meaningful RED failures, then restored `player.js` to the exact recorded SHA-256. The
coordinator's focused run passed **9**, broader affected run passed **487**, full suite passed **4241**,
webgate passed **31 / 0**, and ROM verification remained **VERIFY OK at 613 windows**. Diff, scope,
line-ending, punctuation and protected-path checks are clean. No export-web, publish, stage, commit, push,
branch switch or worktree operation occurred during editing-agent work.

**NEXT AUDIT CANDIDATE: W460, `$24631C` `objslot8.js clear24631C` <->
`stageend.js clear24631C`.** The live widened head register exposes the two claims, but the current
two-marker body scan does not establish a duplicate pair. Treat it as an audit candidate, not a proved
merge: pin complete bodies, callers, entries and dirty ownership before classifying. W459 is not a
publication wave. Continue Black Label through the full second loop and close its docket, then finish
White Label last.


### D69 FOLLOW-UP, W460 `$24631C`: THE SECOND CLAIM WAS A DEAD OPTIONAL SHIM, AND THREE LIVE CALLERS DID NOTHING

**THIS IS A CORRECTED MERGE, NOT AN EQUIVALENT-BODY MERGE.** `stageend.js` held the one real and
RAM-correct transcription. `objslot8.js clear24631C` was only a forwarding shim to optional
`ctx.clear24631C`, and production `Game#ctx()` supplied no such key. Its three cartridge-real calls at
`$25A7C6`, `$25A956`, and `$25A9B8` therefore became silent no-ops. `objslot13.js` and `objslot14.js`
independently used the same invented optional condition at `$288A48` and `$288C52`. The cartridge has no
branch around any of those calls. W460 exports the verified body from `stageend.js`, removes the shim, and
makes all six source-reachable caller bodies import and invoke it directly. There was no prior public
`$24631C` ESM name to preserve as a compatibility alias.

**BUILD-B PINS ONE COMPLETE 80-BYTE BODY.** Main CPU SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`. The exact half-open span is
`[$24631C,$24636C)`, with SHA-256
`137f82cec8408762cfa4d794873d9004e99b3eda0882ea47a4d6afad15b61ad7` and bytes
`41f90080fa86303c04af30fc000051c8fffa7e0241f9008103464250317c00000004217c00000000002c41e8003051cfffea3e3c001341f90080fa864250217c00000000002c41e8007051cffff04e75`.
Its 18 instructions are `LEA $80FA86,A0`, `MOVE.W #$04AF,D0`, `MOVE.W #0,(A0)+`, `DBRA D0,$246326`,
`MOVEQ #2,D7`, `LEA $810346,A0`, three root clears, `LEA $30(A0),A0`, `DBRA D7,$246336`,
`MOVE.W #$0013,D7`, `LEA $80FA86,A0`, two node clears, `LEA $70(A0),A0`, `DBRA D7,$246358`, and
`RTS`. The previous complete routine is `[$246292,$24631C)`, 138 bytes, SHA-256
`7618bcd449ae591a909485d6864e289bc518dc0762e5113d00c0a151f7f8dd9f`, ending in `$24631A RTS`.
The next routine starts exactly at `$24636C` with `48E7 C080`, `MOVEM.L D0-D1/A0,-(A7)`.

**THE COMPLETE ALIGNED 6 MiB TRANSFER CENSUS FINDS TWELVE ENTRIES INTO THE BODY.** Nine external
absolute-long JSR sites enter only at `$24631C`: `$23BF3E`, `$256DB0`, `$25A7C6`, `$25A956`,
`$25A9B8`, `$288A48`, `$288C52`, `$28D578`, and `$28D5FA`. Three internal DBcc edges are
`$24632A -> $246326`, `$24634A -> $246336`, and `$246366 -> $246358`. The scan covers BSR, BRA/Bcc,
DBcc, absolute-word and absolute-long JSR/JMP, PC-relative JSR/JMP, and all 110 aligned indexed-PC
JSR/JMP candidates. Zero indexed candidates have a zero-index base inside the body, and no external
static transfer enters an internal instruction. The only exact aligned longword references are the nine
absolute-long JSR operands at `$23BF40`, `$256DB2`, `$25A7C8`, `$25A958`, `$25A9BA`, `$288A4A`,
`$288C54`, `$28D57A`, and `$28D5FC`. Dynamic indirect reachability beyond that static inventory remains
unproved.

**EVERY DIRECT CALLER AND IMMEDIATE CONTINUATION IS BYTE-PINNED.** The nine caller spans are
`[$23BF38,$23BF4A)`, `[$256DAA,$256DC6)`, `[$25A7C0,$25A7D8)`, `[$25A94A,$25A968)`,
`[$25A9B2,$25A9CA)`, `[$288A3C,$288A5E)`, `[$288C3E,$288C68)`, `[$28D566,$28D586)`, and
`[$28D5FA,$28D60A)`. Calls return into unconditional local continuations or instructions that overwrite
NZVC before a conditional use. No direct caller consumes returned A0, D0, D7, or SR.

**RAM AND REGISTER OWNERSHIP ARE EXACT.** The first DBRA owns 1,200 words, exactly
`[$80FA86,$8103E6)`. It clears recycled animation-node and root state, including three root records at
`$810346/$810376/$8103A6` and twenty node records at `$80FA86 + n*$70`, `n=0..19`. The later loops
perform cartridge-real redundant rewrites inside that already-cleared range: each root clears `+0.W`,
`+4.W`, and `+$2C.L`; each node clears `+0.W` and `+$2C.L`. Production preserves all 1,249 ordered
stores: 1,200 primary word stores, six root word stores, three root long stores, twenty node word stores,
and twenty node long stores. Dirty adjacent sentinels survive. The opposite slot-14 countdown arm returns
before the clear and leaves the dirty pool intact.

On return, A0 is `$810346`. `MOVE.W #$04AF,D0` preserves incoming D0 high-word dirt and the first DBRA
leaves D0 as `$xxxxFFFF`. `MOVEQ #2,D7` first owns the full register; the later `MOVE.W #$0013,D7` and
DBRA leave D7 as `$0000FFFF`. The final DBRA leaves Z set, N/V/C clear, and X preserved. Source neither
models nor observes these return registers or SR.

**CARTRIDGE AND SOURCE REACHABILITY REMAIN SEPARATE.** Production reaches six cartridge contexts:
`$25A7C6`, `$25A956`, `$25A9B8`, `$288A48`, `$288C52`, and `$28D578`. Three direct cartridge callers
remain source gaps for independent reasons: reset prologue `$23BF3E` is intentionally skipped, main-loop
call 1 at `$256DB0` remains unported, and object type 19 at `$28D5FA` remains unported. W460 does not
silently promote any of those gaps to source reachability.

**THE TEMPORARY PRODUCTION RED OMITTED THE FINAL PRIMARY WORD.** Changing the loop bound from
`C.clearWords` to `C.clearWords - 1` left `$8103E4..$8103E5` dirty. It independently failed the complete
2,400-byte owned-range witness, the exact 1,249-operation write trace, and a real `$25A7C6` coin-teardown
caller witness. Restoration returned `stageend.js` byte-for-byte to pre-RED SHA-256
`1229c5b24f105ab5f4a5f229d4336de01f8d662419e11627c90667b5ecc484e0`; the focused suite then passed
12 of 12.

The live scanner APIs reconcile from W459 exactly: narrow heads **16 -> 16**, widened heads **87 -> 86**,
body pairs **28 -> 28**, and body-only findings **22 -> 22**, derived live from `headIndex()`. The optional
shim never formed a two-marker body pair. Every live register holder from W446 through W460 now agrees.
No production ROM window was added or widened, and no generated rip or asset changed.

Editing-agent validation on the restored final tree: focused W460 **12 pass / 0 fail / 0 skipped**;
affected caller, stage-end, chain and W446-W460 register surface **391 pass / 0 fail / 0 skipped**; full
suite **4253 pass / 0 fail / 0 skipped**; webgate **31 PASS / 0 FAIL**, exit 0; ROM verification
**VERIFY OK at 613 windows**; docket identifier check **67 items, D1..D69, no duplicates, D70 next**.
The coordinator independently reproduced the exact body and adjacent boundaries, all twelve aligned
entries, nine exact longword references, the same three meaningful RED failures and byte-exact source
restoration. Coordinator validation passed focused **12**, broader affected **427**, full suite **4253**,
webgate **31 / 0**, ROM verification at **613 windows**, and the same docket identifier check. Diff,
scope, line-ending, punctuation and protected-path checks are clean. No export-web, publish, stage,
commit, push, branch switch or worktree operation occurred during editing-agent work.

**HISTORICAL W460 RECOMMENDATION FOR W461: `$242E24` `initbody.js rankByte242E24` <->
`rng.js drawByte242E24`.** At W460 close, this was stronger live evidence than another head-only claim:
the widened register named both heads and `bodyPairs()` derived two shared body markers, `$242E24` and
`$242E3A`. That recommendation is retained as history. W461 completed the audit below and proved the
merge. The W460 note that W461 was the next cadence publication was also historical; this editing pass
did not export or publish.


### D69 FOLLOW-UP, W461 `$242E24`: THE PRIVATE RANK-BYTE BODY WAS THE CANONICAL RNG DRAW TRANSCRIBED TWICE

**THIS IS A PROVED EQUIVALENT-BODY MERGE.** `initbody.js rankByte242E24` and `rng.js
drawByte242E24` both incremented only byte `$803917`, used the post-increment word at `$803916`, masked
it with `$007F`, and returned one unsigned table byte from `$242E42 + index`. W461 removes the private
`initbody.js` body and its duplicate `rankReg`/`rankCtr` constants. Its type `$11` and type `$8D` callers
now invoke `rng.js drawByte242E24`. The removed name was private, so no public ESM compatibility alias is
needed. The existing dependency direction is preserved: `initbody.js` already imported multiple RNG
helpers from `rng.js`, while `rng.js` imports only `ram.js`; no cycle or inverted dependency was added.

**BUILD-B PINS ONE COMPLETE 30-BYTE BODY.** Main CPU SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`. The exact half-open span is
`[$242E24,$242E42)`, with SHA-256
`5c280b15e6b2c520824f120b39e9ed5d47144209586b37852d8c8793b53440c3` and bytes
`523900803917707fc079008039162f0841fa000c4e7110300000205f4e75`. Its nine instructions are
`$242E24 ADDQ.B #1,$803917`, `$242E2A MOVEQ #$7F,D0`, `$242E2C AND.W $803916,D0`, `$242E32 MOVE.L
A0,-(A7)`, `$242E34 LEA ($242E42,PC),A0`, `$242E38 NOP`, `$242E3A MOVE.B (A0,D0.W),D0`, `$242E3E
MOVEA.L (A7)+,A0`, and `$242E40 RTS`.

The preceding object is the complete 256-byte table `[$242D24,$242E24)`, SHA-256
`f45979b11a2946df59ecc5f027d5603ffc2dd52cd29bac2997d1eb931cdd7157`. The indexed table is exactly
`[$242E42,$242EC2)`, 128 bytes, SHA-256
`81ec92daeca70fd966be91ca9f170a8a5c72724320c1c38f3614e57ca5853cbf`; `$242EC2` starts the next
shared-counter routine. That next routine is `[$242EC2,$242EDE)`, 28 bytes, SHA-256
`dd09ca2e3cf97f28d6cbe13b9929d6120a61457f0d9f284b4030e2a8c0b0cf58`. There is no fallthrough into
or out of the target body.

**THE COMPLETE ALIGNED 6 MiB TRANSFER CENSUS FINDS EXACTLY 37 STATIC EXTERNAL ENTRIES, ALL `JSR.L
$242E24`.** They are `$265350`, `$265376`, `$26728A`, `$268744`, `$27699C`, `$27E02A`, `$27EAD6`,
`$27EC86`, `$280CFA`, `$280D12`, `$288CD4`, `$289756`, `$28A26C`, `$28A2E8`, `$28A326`, `$28A360`,
`$28A3A2`, `$28A3E0`, `$28A426`, `$2933DE`, `$2933EE`, `$297AF0`, `$297F94`, `$297F9E`, `$29924C`,
`$299362`, `$29A132`, `$29A13C`, `$29D1EC`, `$2A5062`, `$2A5164`, `$2A51E0`, `$2A5424`, `$2A81CC`,
`$2A83E8`, `$2A8810`, and `$2A8EE0`. The scan covers byte and word branches, DBcc, BSR, absolute-word
and absolute-long JSR/JMP, PC-relative JSR/JMP, and all 110 aligned indexed-PC JSR/JMP candidates. There
is no static internal entry, no non-JSR.L direct entry, and no indexed-PC zero-index base in the body.
Exactly 37 aligned exact-longword references exist, each at its caller address plus two and each serving
as that JSR operand. Dynamic indirect reachability beyond this static inventory remains explicitly
unproved. Every direct caller's JSR and first complete continuation instruction is byte-pinned. Every
continuation consumes D0; none immediately branches on the returned SR.

**REGISTER, WIDTH, STATE AND CCR OWNERSHIP ARE EXACT.** `ADDQ.B` wraps `$803917` from `$FF` to `$00`
without carrying into the high byte at `$803916`. The high byte is read but cannot affect the table index
after `AND.W #$007F`. Incoming D0 dirt is irrelevant because `MOVEQ #$7F,D0` owns all 32 bits; the
masked D0 is in `0..127`, and the final `MOVE.B` leaves all higher bits zero, so the API result is exactly
`0..255`. A0 is preserved by its longword push and pop, A7 returns unchanged, and no other register is
touched. The final `MOVE.B` owns N and Z from the returned byte, clears V and C, and preserves X. The
focused model covers dirty D0, dirty state high byte, counter wrap, adjacent sentinels, all 256 recycled
real-table draws, A0/A7 preservation, and both X inputs.

Caller interpretation remains caller-local. Type `$11` uses `LSR.B #1`, so a table byte `$FF` becomes
unsigned 127 before its bucket-word add. Type `$8D` uses `ASR.B #1`, so `$80` becomes signed -64 while a
positive byte keeps its positive half. Both production paths now consume the same canonical unsigned
byte; the merge does not collapse those opposite caller conventions.

**CARTRIDGE STATIC REACHABILITY, DYNAMIC UNCERTAINTY AND PRODUCTION SOURCE REACHABILITY REMAIN
SEPARATE.** Production has 19 canonical calls across ten files: `bee.js` 1, `boss2.js` 2,
`boss2attacks.js` 2, `boss3.js` 1, `bossscripts.js` 2, `effects.js` 1, `hibachiguns.js` 3,
`initbody.js` 3, `items.js` 2, and `spark.js` 2. One `bee.js` body represents two cartridge copies, so
20 direct cartridge sites are source-represented: `$268744`, `$27699C`, `$27E02A`, `$27EAD6`,
`$27EC86`, `$280CFA`, `$280D12`, `$289756`, `$28A26C`, `$28A3A2`, `$2933DE`, `$2933EE`, `$29924C`,
`$299362`, `$29A132`, `$29A13C`, `$29D1EC`, `$2A81CC`, `$2A83E8`, and `$2A8810`. The other 17 direct
cartridge callers remain source gaps. W461 does not silently classify them as absent or implemented.

**THE TEMPORARY PRODUCTION RED NARROWED THE MASK TO `$003F`.** Changing only canonical
`drawByte242E24` from `& 0x7f` to `& 0x3f` produced five meaningful W461 failures: dirty boundary
ownership returned 190 instead of 255, the 256-draw sequence repeated the wrong 64-entry half, the real
type `$11` witness returned 110 instead of 223, the real type `$8D` positive witness returned 78 instead
of 127, and the source-instruction guard rejected the wrong mask. Seven independent cartridge,
register-model, reachability, register and ROM-window sections remained green. Restoring the exact line
returned `rng.js` byte-for-byte to pre-RED SHA-256
`f5a3907b477e9df70e2ced5da1135c15d8efb5bd81557a3b90b98003e5da62bd`; focused W461 then passed 12
of 12 with no skips.

The live scanner APIs reconcile from W460 exactly: narrow heads **16 -> 16**, widened heads **86 -> 85**,
body pairs **28 -> 27**, and body-only findings **22 -> 22**, derived live from current `headIndex()`.
The removed `$242E24/$242E3A` pair was head-visible. Every live register holder from W446 through W461
now agrees. The existing `$242E42 + $0080` production ROM window is retained exactly; no window was
added or widened, and no generated rip or asset changed.

Editing-agent validation on the restored final W461 tree:

    focused W461                              12 pass / 0 fail / 0 skipped
    focused W461 plus authoritative register 24 pass / 0 fail / 0 skipped
    W446-W461 live-register chain            172 pass / 0 fail / 0 skipped
    affected caller/RNG/register surface     586 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/         4265 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs       31 PASS / 0 FAIL, exit 0
    export-tables.py --verify               VERIFY OK at 613 windows
    games/ddpdoj/tools/docket_ids.py        67 items, no duplicates, D70 next

Coordinator-independent validation on the final tree repeated focused W461 at **12 pass**, the complete
W446-W461 register chain at **172 pass**, the affected caller/RNG/register surface at **586 pass**, and
the full suite at **4265 pass**. Webgate returned **31 PASS / 0 FAIL**, ROM verification returned
**VERIFY OK at 613 windows**, and the docket remained 67 unique items with D70 next. The coordinator
independently reproduced the complete 37-caller and 37-longword census, all five production RED failures,
and exact `rng.js` restoration. Scope, hashes, line endings, CRLF `movement.js`, added punctuation,
protected paths, generated outputs, staging state, and `git diff --check` are clean. The coordinator also
corrected the regression's stale label for the preceding table from `$242CAC` to its pinned start
`$242D24`; no behavior or cartridge claim changed.

**HISTORICAL W461 RECOMMENDATION FOR W462: `$2414BE` private `installTxBank` wrappers in
`objslot8.js` and `objslot12.js`.** At W461 close, both delegated to canonical `palette.js
install2414BE`, making them candidates for a wrapper-identity and reachability audit rather than an
assumed removal. W462 completed that audit below.


### D70: FOLLOW-UP, W462 `$2414BE`: ONE PUBLIC PALETTE BODY, TWO PRIVATE ADAPTER IDENTITIES REMOVED

**THE PRIVATE FUNCTIONS WERE CALLER ADAPTERS, NOT CARTRIDGE IMPLEMENTATIONS.** The sole public ESM
identity remains `palette.js install2414BE`. Neither private `installTxBank` in `objslot8.js` or
`objslot12.js` was exported, imported by a test, or required as a compatibility name, so both private
identities are removed without aliases. Their real behavior remains at all five callers: bank 0, exact
32-byte ROM reads, call-site and reason metadata, a counted `ctx.unported` note when `ctx.palette` is
absent, and no ROM access on that absent-palette arm. The six production importers still point toward
`palette.js`; `palette.js` imports neither object-slot module, so dependency direction remains acyclic.

**BUILD-B PINS THE COMPLETE SINGLE-BANK ROUTINE AND BOTH BOUNDARIES.** Main CPU SHA-256 is
`4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`, size `$600000`. The exact
36-byte half-open body `[$2414BE,$2414E2)` hashes to
`57f81c30f0abf2d85a849805eb3fcdc0c891ddf0f5590ad62b7be6d26be22aa1` and is:

    48e780c043f90080f886eb48d2c0700722d851c8fffc33fc00010080fa6a4cdf03014e75

It decodes completely as `$2414BE MOVEM.L D0/A0-A1,-(A7)`, `$2414C2 LEA $80F886,A1`, `$2414C8
LSL.W #5,D0`, `$2414CA ADDA.W D0,A1`, `$2414CC MOVEQ #7,D0`, `$2414CE MOVE.L (A0)+,(A1)+`,
`$2414D0 DBRA D0,$2414CE`, `$2414D4 MOVE.W #1,$80FA6A`, `$2414DC MOVEM.L (A7)+,D0/A0-A1`, and
`$2414E0 RTS`. The preceding complete body `[$241404,$2414BE)` hashes to
`a1fe60c29ae893e62620fa745100436f9def1073b6b66f28f3102647d1422a50` and ends at `$2414BC RTS`, so
there is no fallthrough entry. The separate multi-bank sibling `[$2414E2,$24150A)` hashes to
`b344ea7538965782e90edc77ba553292f201072dc7a761a6253584ff3d42ce83`; the audited body ends before it.

**THE COMPLETE ALIGNED STATIC CENSUS FINDS 29 EXTERNAL CALLS AND ONE INTERNAL LOOP ENTRY.** All
3,145,728 aligned words were decoded across byte and word Bcc/BRA/BSR, DBcc, absolute-word,
absolute-long, PC-relative, and indexed-PC JSR/JMP forms. Image-wide candidate counts are Bcc.B 119480,
Bcc.W 10851, BRA.B 6815, BRA.W 1969, BSR.B 5809, BSR.W 2042, DBcc 2287, JSR.W 6, JSR.L 12787,
JSR.PC16 649, JSR.PCIX 4, JMP.W 4, JMP.L 1285, JMP.PC16 85, and JMP.PCIX 106. Twenty-five calls are
`JSR.L`; four are PC-relative at `$2416C8`, `$241702`, `$241742`, and `$24177C`. The complete caller set
is:

    $23BF8E $23BF9C $23BFAA $23BFB8 $23BFC6 $2416C8 $241702 $241742 $24177C
    $25A80E $25A92C $25A9A2 $25AC10 $25C600 $25C9AE $25CDCE $26056C
    $2605DC $2605EA $2605F8 $260606 $260614 $260622 $260630 $26063E
    $26064C $26065A $288590 $28F394

Exactly 25 aligned longwords point into the body, and each is the operand of one absolute-long call. The
sole static internal entry is `$2414D0 DBRA -> $2414CE`. All 110 aligned indexed-PC candidates have zero
zero-index bases inside the body. No external static transfer enters an internal instruction. Every call
and first complete continuation is byte-pinned; none consumes returned CCR/SR. Dynamic indirect
reachability remains explicitly unproved.

**EVERY CALLER SUPPLIES A VALID BANK AND AN EXACT 32-BYTE SOURCE.** The full `(call:bank/source)` census
is:

    $23BF8E:0/$222638  $23BF9C:1/$222658  $23BFAA:2/$222678
    $23BFB8:3/$222698  $23BFC6:4/$2226B8  $2416C8:9/$2226F8
    $241702:9/$222738  $241742:10/$222718 $24177C:10/$222758
    $25A80E:0/$222638  $25A92C:0/$222638  $25A9A2:0/$222618
    $25AC10:0/$222618  $25C600:12/$2227F8 $25C9AE:0/$222618
    $25CDCE:0/$222618  $26056C:0/$222618  $2605DC:0/$222638
    $2605EA:1/$222658  $2605F8:2/$222678  $260606:3/$222698
    $260614:4/$2226B8  $260622:5/$2226D8  $260630:6/$222778
    $26063E:7/$222798  $26064C:8/$2227B8  $26065A:11/$2227D8
    $288590:13/$222818 $28F394:0/$222638

Production represents 28 of these 29 static callers. `$288590`, bank 13 from `$222818`, is the sole
source gap and remains unclaimed because its reachability was not established. In production, the four
former slot-8 adapter calls retain `$25A80E` main, `$25A92C` main, `$25A9A2` warning, and `$25AC10`
warning source selection. Slot 12 retains `$28F394` main source selection. `Game#ctx()` continues to
provide both palette state and the unported log.

**THE MACHINE MODEL OWNS EXACT WIDTHS, STACK, REGISTERS, RAM AND FLAGS.** MOVEM creates and removes a
12-byte frame; D0, A0, A1, and A7 return exactly unchanged, and no other register is touched. `LSL.W #5`
changes only D0's low word. `ADDA.W` sign-extends that shifted word; `$07FF` therefore produces `$FFE0`
and addresses 32 bytes below the base, while a machine value such as `$0800` aliases bank 0 after word
shift. The public JavaScript contract deliberately rejects every bank outside `0..14` rather than
accepting machine aliases. Eight longword copies advance both private pointers by exactly 32 bytes and
write only the selected 16-word bank in `$80F886..$80FA65`. Bank 0 and bank 14 dirty witnesses preserve
both adjacent sentinels. The routine finally writes word 1 only to TX dirty flag `$80FA6A`; sprite
`$80FA66` and background `$80FA68` remain separate. Internal DBRA leaves D0 `$0000FFFF` before MOVEM
restores it. Final N, Z, V, and C are clear from `MOVE.W #1`; X is preserved.

**THE TEMPORARY PRODUCTION RED OMITTED WORD 15.** Changing canonical `install2414BE` from
`i < TX_BANK_WORDS` to `i < TX_BANK_WORDS - 1` copied only 15 words. Three focused sections failed:
bank 0 word 15 remained dirty `$A55A` instead of cartridge `$591E`, provenance word 15 remained dirty
`$7E` instead of sourced `1`, and the exact source-loop guard rejected the shortened production body.
The other twelve sections remained green. Restoration returned `palette.js` byte-for-byte to both its
pre-RED and pre-task SHA-256
`aca9de23e439271c9c51e7ea105302ab53ef778e36ef0d6e89032f759fa00389`; focused W462 then passed 15 of
15.

The live scanner APIs reconcile from W461 exactly: narrow heads **16 -> 16**, widened heads **85 -> 84**,
body pairs **27 -> 27**, and body-only findings **22 -> 22**, derived live from `headIndex()`. `$2414BE`
leaves the widened head register because the two private heads are gone and only the canonical head
remains. Every live holder from W446 through W462 agrees. Existing palette windows remain exactly
`$222618 + $0020`, `$222638 + $00C0`, `$2226F8 + $0080`, `$222778 + $0080`, and `$2227F8 + $0020`.
The `$222818..$222838` source gap and executable `[$2414BE,$2414E2)` remain unexported; no ROM window was
added or widened.

Editing-agent validation on the restored final W462 tree:

    focused W462                              15 pass / 0 fail / 0 skipped
    focused W462 plus authoritative register 27 pass / 0 fail / 0 skipped
    W446-W462 live-register chain            187 pass / 0 fail / 0 skipped
    affected palette/object/register surface 509 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/          4280 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs       31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows
    games/ddpdoj/tools/docket_ids.py         68 items, no duplicates, D71 next

W461 was published as build `20260821132334`. W462 is the first wave after that publication, is not a
publication wave, and performed no export-web or publish. No stage, commit, push, branch switch, worktree,
generated rip, or generated asset operation occurred.

**HISTORICAL W462 RECOMMENDATION FOR W463:** audit the two private `$28C0FC` `cueStreamNote`
adapters. W463 completed that batch below.


### D71: FOLLOW-UP, W463 `$28C0FC`: TWO PRIVATE COUNTED-GAP ADAPTER IDENTITIES REMOVED

**THE FUNCTIONS WERE CALLER ADAPTERS, NOT CARTRIDGE IMPLEMENTATIONS.** Neither `cueStreamNote` was
exported or imported. Both only supplied an address-specific message to the optional
`ctx?.unported?.note` hook. The names are removed without aliases, while `$25A7E2`, `$25A7FA`, `$25A9DA`,
and `$28F380` retain direct counted notes under `$28C0FC`. The first three still use `SCREEN8.cueStream`;
the fourth still uses `SLOT12.cueStream`. No caller condition, ordering, optional-hook behavior, public
identity, dependency edge, or sound state changed.

**THE SOUND GAP REMAINS HONEST.** `sound.js` knows `$28C0FC` as an ENTRY, but the address-only
`ctx.soundPost` path rejects it because it is not a WRAPPERS row. W463 does not invent caller registers or
change the sound API. Existing W375, W377, and W387 coverage already pins the two independent coin arms,
the arm-5 teardown, the slot-12 teardown, exact call-site keys, and the counted behavior, so no new test
file was added.

Live scanner APIs reconcile narrow heads **16 -> 16**, widened heads **84 -> 83**, body pairs **27 -> 27**,
and body-only findings **22 -> 22**. `$28C0FC` has zero remaining function-head claims. No ROM window,
generated output, staging, publication, or branch operation was involved.

Focused W375/W377/W387 plus the authoritative widened register passed **93/93**. The W446-W462 live
holder chain passed **187/187**. W463 is the second wave after published build `20260821132334` and is not
a publication wave.

**HISTORICAL W463 RECOMMENDATION FOR W464: `$28E7A2`.** W464 completed that direct merge below.


### D72: FOLLOW-UP, W464 `$28E7A2`: THE SECOND BANNER-CLEAR LOOP IS GONE

`objslot8.js bannerClear28E7A2` and `stageend.js clear28E7A2` were the same 40-word clear over
`SE.banner`. The stage-end copy is now exported, the arm-5 caller imports it, and the private slot-8
loop is removed without an alias. Both existing caller paths still clear exactly `$81DFAC..$81DFFB`.

The live registers move from 83 to **82 widened heads**. Narrow heads remain 16, body pairs remain 27,
and body-only findings remain 22. The authoritative register passed 12/12, and the existing arm-5 plus
stage-end caller surface passed 69/69. No ROM window or generated output changed. W464 is the third wave
after published build `20260821132334` and is not a publication wave.

**HISTORICAL W464 RECOMMENDATION FOR W465: `$28C6C6`.** W465 completed that direct merge below.


### D73: FOLLOW-UP, W465 `$28C6C6`: ONE SOUND POSTER, CALLER THROTTLE PRESERVED

`hud.js note28C6C6` is the canonical bonus-event sound poster and is now exported. The result-screen
`stageend.js cue28C6C6` claimant was not another cartridge implementation: it combined four callers'
three-step RAM timer with the same sound post. That caller adaptation is now named `throttledBonusCue`
and invokes the HUD export only when its timer expires. The four P1/P2 bee/item paths retain their timer
addresses, decrement and reload order, and optional sound behavior. No compatibility alias is needed.

The live registers move from 82 to **81 widened heads**. `$28C6C6` has one remaining claim, narrow heads
remain 16, body pairs remain 27, and body-only findings remain 22. The authoritative register passed
12/12, the existing stage-end caller surface passed 44/44, and a direct canonical-poster check passed.
No ROM window or generated output changed. W465 is the fourth wave after published build
`20260821132334` and is not a publication wave.

**HISTORICAL W465 RECOMMENDATION FOR W466: `$28F4C4`.** W466 completed that direct merge below.


### D74: FOLLOW-UP, W466 `$28F4C4/$28F666`: NAME-FRAME GLUE NO LONGER CLAIMS TWO BODIES

`objslot12.js nameFrame28F4C4` was private whole-frame glue, not a second implementation of either
endpoint in its documented `$28F4C4..$28F666` range. It calls the exported
`hiscorename.js drawGridFrame28F4C4`, then preserves the three counted draws, countdown, band, cursor,
panel and input sequence before the canonical name-button tail. The helper is now named
`nameEntryFrame`; its detailed range commentary lives inside the body so the widened scanner does not
mistake the wrapper for either endpoint. No alias is needed and no executable statement changed.

The live registers move from 81 to **79 widened heads** because the wrapper's opening range claimed both
`$28F4C4` and `$28F666`. Each now has one canonical `hiscorename.js` claimant. Narrow heads remain 16,
body pairs remain 27, and body-only findings remain 22. The authoritative register passed 12/12 and the
existing slot-12 caller surface passed 26/26. No ROM window or generated output changed in the wave
commit.

W466 was committed as `7584a63`, pushed to `origin/main`, and published from a quiet tree after
`games/ddpdoj/tools/export-web.mjs` regenerated the local bundle. The repository-wide publication gate
passed, including all **4,280/4,280** DDPDOJ unit tests, bundle and web-fetch gates, the other game gates,
and the ROM-leak guard. Live build **`20260821162642`** was confirmed at the production URL. W467 begins
the next five-wave publication interval.

**HISTORICAL W466 RECOMMENDATION FOR W467: `$285A12`.** W467 completed that direct classification below.


### D75: FOLLOW-UP, W467 `$285A12`: HUD CALLER ADAPTER NO LONGER CLAIMS THE HYPER BODY

`hyper.js stepHyper285A12` is the exported canonical P1/P2 hyper activation and duration implementation.
The private `hud.js hyper285A12` was not a second transcription. It selected the side from `who`, passed
`ctx.rom`, and supplied the HUD-owned callback that redraws the correct stock row through
`hyperStock286ED6`. That adaptation remains intact under the address-free name `stepPlayerHyper`. Both
`perFrame28444E` callers retain their order, player values, and `$284460/$284464` source markers. The
private helper had no public consumer, so no compatibility alias is needed.

The live registers move from 79 to **78 widened heads**. `$285A12` has one remaining claimant in
`hyper.js`; narrow heads remain 16, body pairs remain 27, and body-only findings remain 22. Focused hyper,
HUD, bee, and authoritative-register coverage passed **60/60**. The W446-W462 live holder chain passed
**187/187**. No executable behavior, public ESM identity, dependency edge, ROM window, or generated output
changed.

W467 is the first wave after live build `20260821162642` and is not a publication wave.

**HISTORICAL W467 RECOMMENDATION FOR W468: `$2A6EDC`.** W468 completed that direct classification below.


### D76: FOLLOW-UP, W468 `$2A6EDC`: FORM-1 ADAPTER NO LONGER CLAIMS THE SHARED EXIT BODY

`hibachi2.js bossExitShared` is the exported canonical implementation of the three 52-byte exit bodies at
`$2A6EDC`, `$2A707E`, and `$2A7294`. They differ only in the final branch displacement selecting each
form's death block. The private `boss.js bossExit2A6EDC` was not another transcription. It supplied form
1's ROM/context values and a thunk for `bossEnding2A6D8C`. That adaptation remains under the address-free
name `bossForm1Exit`; its detailed W403 cartridge correction now lives inside the helper body. The phase
caller, freeze gate, countdown, player test, re-arm path, and form-specific ending thunk are unchanged.
No compatibility alias is needed for the private helper.

The live registers move from 78 to **77 widened heads**. `$2A6EDC` has one remaining claimant in
`hibachi2.js`; narrow heads remain 16, body pairs remain 27, and body-only findings remain 22. Focused
Hibachi and authoritative-register coverage passed **86/86**. The W446-W462 live holder chain passed
**187/187**. No executable behavior, public ESM identity, dependency edge, ROM window, or generated output
changed.

W468 is the second wave after live build `20260821162642` and is not a publication wave.

**HISTORICAL W468 RECOMMENDATION FOR W469: `$23C622`.** W469 completed that direct classification below.


### D77: FOLLOW-UP, W469 `$23C622`: SLOT-12 ADAPTER NO LONGER CLAIMS THE TX CLEAR BODY

`background.js clearTx23C622` remains the exported canonical 2,048-longword clear over the complete 64 by
32 TX map. The private `objslot12.js clearTx` was not another implementation. It passed `ctx.tx` to that
export when available, but allowed two teardown-shaped unit paths to run without `TxVram` by counting the
exact `$28F2BA` or `$28F386` call site and returning. That caller adaptation remains under the address-free
name `clearTxOrNote`, with its detailed `$23C622` explanation inside the helper body. Both calls and their
optional-note behavior are unchanged. No compatibility alias is needed for the private helper.

The live registers move from 77 to **76 widened heads**. `$23C622` has one remaining claimant in
`background.js`; narrow heads remain 16, body pairs remain 27, and body-only findings remain 22. Focused
object-dispatch, context, deferral, and authoritative-register coverage passed **49/49**. The W446-W462
live holder chain passed **187/187**. No executable behavior, public ESM identity, dependency edge, ROM
window, or generated output changed.

W469 is the third wave after live build `20260821162642` and is not a publication wave.

**HISTORICAL W469 RECOMMENDATION FOR W470: `$23BF74/$23BFDB`.** W470 completed that direct
classification below.


### D78: FOLLOW-UP, W470 `$23BF74/$23BFDB`: GAME BOOT ADAPTER NO LONGER CLAIMS THE FRONT-END SPAN

`frontend.js bootFrontEnd23BF74` remains the exported canonical front-end setup body. The `main.js
Game#boot` method is not another implementation. It supplies the `Game` RAM, ROM, palette, and context,
stores the setup result in `bootResult`, and returns it. Its detailed cold-boot warning and the board's
fall-through into `Game#step()` remain inside the method body, while the preceding method documentation is
address-free. The constructor still does not call `boot()`, and executable behavior is unchanged.

The live registers move from 76 to **74 widened heads** because the old opening span claimed both
`$23BF74` and `$23BFDB`. Both now have one remaining claimant in `frontend.js`; narrow heads remain 16,
body pairs remain 27, and body-only findings remain 22. Focused front-end and cold-boot coverage passed
**21/21**. The W446-W462 live holder chain passed **187/187**. No executable behavior, public ESM identity,
dependency edge, ROM window, or generated output changed.

W470 is the fourth wave after live build `20260821162642` and is not a publication wave.

**HISTORICAL W470 RECOMMENDATION FOR W471: `$23E3E2`.** W471 completed that direct
classification below.


### D79: FOLLOW-UP, W471 `$23E3E2`: SHARED EMITTER HELPER NO LONGER CLAIMS A CARTRIDGE ENTRY

`bossarrival.js emit23E3E2` remains the private bucket-2 cartridge entry. The parameterized `emitScaled`
helper is shared by the bucket-1, bucket-2, bucket-3, and bucket-22 entries and is not itself another
`$23E3E2` entry. Its preceding documentation is now address-free; the exact four-entry family and
bucket distinction remain in nearby cartridge commentary and line comments. All wrappers, bucket
selection, extent scaling, position packing, attribute preservation, and caller behavior are unchanged.

The live registers move from 74 to **73 widened heads**. `$23E3E2` has one remaining claimant in
`bossarrival.js`; narrow heads remain 16, body pairs remain 27, and body-only findings remain 22. Focused
boss-arrival and banner coverage passed **38/38**. The W446-W462 live holder chain passed **187/187**. No
executable behavior, public ESM identity, dependency edge, ROM window, or generated output changed.

W471 was the fifth wave after live build `20260821162642` and was published after regenerating the web
bundle. The publication gate passed all **4,280/4,280** DDPDOJ tests, the DDPDOJ bundle and web-fetch gates,
Gradius **746/746** unit tests and **13/13** gate stages, Batman **27/27** gate stages, and the ROM-leak
guard over 330 files with the six deliberate exceptions. Dist contained 336 files and 19,885 KB. Preview
`https://9b366a2a.gbtman.pages.dev` deployed successfully, and three production polls confirmed live build
**`20260821175936`** at `https://gbtman.pages.dev/games/ddpdoj/`. W472 begins the next five-wave interval.


### D80: FOLLOW-UP, W472 `$23FF06`: SHARED BOMB-POSITION HELPER NO LONGER CLAIMS A CARTRIDGE ENTRY

`bomb.js draw23FF06` remains the private cartridge entry that emits one bomb record to sprite bucket 13.
The renamed private `packBombRecordPosition` helper owns the position, record-offset, signed shift, mask,
and live-flag arithmetic shared by `$23FF06` and `$23FF42`; it is not itself another `$23FF06` entry.
The `$23FF42` distinction, saving D0/A0-A1 around the same twenty instructions, remains explicit in line
comments. No arithmetic, sprite-bucket selection, animation or attribute forwarding, caller behavior, or
public ESM surface changed.

The live registers move from 73 to **72 widened heads**. `$23FF06` has one remaining claimant in `bomb.js`;
narrow heads remain 16, body pairs remain 27, and body-only findings remain 22. Focused bomb coverage,
syntax checking, the authoritative register, and the W446-W462 live holder chain passed **221/221**.

W472 is the first wave after live build `20260821175936` and is not a publication wave.

**W472 RECOMMENDATION FOR W473: `$240DC2`.** The widened scanner currently names
`hud.js txPrint240DC2` and `ram.js u32`; classify those claims directly and preserve the actual TX-print
entry and generic RAM access behavior.


### D81: FOLLOW-UP, W473 `$240DC2`: GENERIC UNSIGNED-LONGWORD HELPER NO LONGER CLAIMS A CARTRIDGE ENTRY

`hud.js txPrint240DC2` remains the exported cartridge entry for the base-grid TX defer printer. It preserves
`D4 | $C0000000`, the `$10000` per-cell tile step, the destination-grid iteration, and the deferred-buffer
writes. `ram.js u32` remains the same exported generic unsigned 32-bit normalizer used across the port; a
preceding JSDoc reference to the caller had made the widened scanner treat that arithmetic helper as a
second `$240DC2` entry. The caller provenance now remains in line commentary after the declaration, without
changing implementation, ESM identity, dependency edges, or behavior.

The live registers move from 72 to **71 widened heads**. `$240DC2` has one remaining claimant in `hud.js`;
narrow heads remain 16, body pairs remain 27, and body-only findings remain 22. Focused HUD coverage,
syntax checking, the authoritative register, and the W446-W462 live holder chain passed **205/205**.

W473 is the second wave after live build `20260821175936` and is not a publication wave.

**W473 RECOMMENDATION FOR W474: `$240F62`.** The widened scanner currently names
`hud.js makeHudObject` and `score.js notePerFrameLedger`; classify those claims directly while preserving
the HUD object factory, per-frame ledger behavior, and cartridge provenance.


### D82: FOLLOW-UP, W474 `$240F62` / `$28D520`: RETIRED LEDGER NOTE OWNS NO CARTRIDGE ENTRY

`hud.js makeHudObject` remains the exported factory for dispatch-table slot 0 at `$240F62`, whose cartridge
handler is `$28D520`. It preserves the three object states, HUD-existence flag, cold-boot score destinations,
queue kill, pending-score drain, and per-frame HUD ledger. Exported `score.js notePerFrameLedger` remains the
same compatibility no-op called by the collision pass. Its preceding JSDoc had made that retired historical
note a second claimant for both the dispatch-table address and the handler address. The full retirement and
cartridge history now remains as line commentary inside the no-op, without changing implementation, public
ESM identity, call sites, dependencies, or behavior.

The live registers move from 71 to **69 widened heads** and from 16 to **15 narrow heads**. `$240F62` and
`$28D520` each have one remaining claimant in `hud.js`; body pairs remain 27 and body-only findings remain 22.
Focused HUD coverage, syntax checking, the authoritative registers, and the W446-W462 live holder chain
passed **224/224**.

W474 is the third wave after live build `20260821175936` and is not a publication wave.

**W474 RECOMMENDATION FOR W475: `$24133C`.** The widened scanner currently names
`palette.js PaletteState#ledger` and `palette.js flush24133C`; classify the generic reporting method against
the actual once-per-frame palette upload while preserving all ledger and flush behavior.


### D83: FOLLOW-UP, W475 `$24133C`: PALETTE COVERAGE REPORT OWNS NO UPLOAD ENTRY

`palette.js flush24133C` remains the once-per-frame cartridge palette upload. It copies each dirty sprite,
background, and text staging region into its own palette-RAM third, clears only the copied dirty flags,
carries source provenance, runs the `$241404` background-fade tail, and records the flush. `PaletteState#ledger`
remains the same generic source-coverage report by palette region. Its preceding JSDoc had made that report a
second `$24133C` claimant; the address now remains as line commentary inside the method, without changing
implementation, method identity, callers, dependencies, or behavior.

The live registers move from 69 to **68 widened heads**. Narrow heads remain 15, body pairs remain 27, and
body-only findings remain 22. Focused palette and authoritative-register checks passed **24/24**; the
W446-W462 live holder chain passed **187/187**.

W475 is the fourth wave after live build `20260821175936` and is not a publication wave.

### D84: W476 TYPE-5 CALL #13 `$2527CE`: HYPER STOCK FOLLOWER

`$28B62E` now runs `$2527CE` in the cartridge's type-5 order instead of counting it. For each live player
with stock, the routine advances the fifteen-position history at `$81B660`/`$81B6A0`, records the current
ship position, selects the stock-dependent delayed position and vertical offset, applies the loop-2 blink and
draw gates, and appends the animated follower to sprite bucket 18 through the `$240A88` register convention.
Stock 5 uses the cartridge's faster 16-frame animation cadence.

Type-5 coverage moves from 19/23 to **20/23**. The remaining functional calls are #19 `$252BD0`, #22
`$25292A`, and #23 `$252A52`. The focused W476 behavior check and syntax checks pass. W476 was the fifth
interval wave and published as build **`20260821205739`** from a quiet tracked tree.

Pure duplicate-register cleanup, including `$24150A`, is deliberately deferred until after Black Label's full
second loop and White Label are functionally complete.

### D85: W477 SHIPPED MOD START SCREEN AND REAL DEATH POLICY

The repository launcher now opens `games/ddpdoj/start.html`, a player-facing catalogue of 15 composable
mods. The choices resolve in catalogue order, conflicting rank, timing, and Button-2 stock policies have fixed
winners, and the launch hash is `index.html#mods=id+id`. Direct `index.html`, an empty hash, and an
unknown-only hash attach no mod runtime and retain the vanilla simulation path. The selected Invincibility mod
explicitly maintains `$810424 = $FF`; ordinary browser play no longer writes that byte.

Progression ladders retain their labelled `$810424=FF` intervention so they can still reach deep content.
Replay playback uses only the replay file's poke list, and replay v1 refuses REC or PLAY while a
simulation-changing mod is active. Presentation-only Invert Colors, Monochrome, and Ghost Trail remain
replay-compatible. The existing MAME death oracle now runs three invulnerability-off hits and verifies the
`2 -> 1 -> 0 -> $FFFF` life sequence, two respawns, and game-over request 2. Its fresh W477 capture passed,
and the translated death chain independently passes hit, death initialization, reset, respawn, and game-over
coverage.

Focused mod, browser-input, replay, and death checks pass **39/39**; browser module syntax checks and
`git diff --check` pass. W477 is the first wave after live build `20260821205739` and is not a publication
wave. The next bounded functional unit is type-5 call #19 `$252BD0`.

### D86: W478 TYPE-5 CALL #19 `$252BD0`: ENEMY-BULLET SPEED BIAS

`$28B652` now runs `$252BD0` immediately before the cartridge's bullet-driver call. It selects the unsigned
maximum of the two players' hyper power and quarters it while neither hyper is active. Only a nonzero
post-quarter value reads the loop-specific rank table and applies the global flag and stage adjustments; the
zero-power branch skips directly to the loop and boss-phase adjustments. The cartridge caps remain 8 in loop
1 and 15 in loop 2.

Type-5 coverage moves from 20/23 to **21/23**. The remaining calls are #22 `$25292A` and #23 `$252A52`.
Focused behavior and call-order checks pass. W478 is the second wave after live build `20260821205739` and
is not a publication wave.

### D87: W479 TYPE-5 CALL #22 `$25292A`: PLAYER BONUS FOLLOWERS

`$28B664` now runs `$25292A` in cartridge order. The mirrored P1 and P2 arms retain the pause, live-player,
bit-14, and bonus gates; decrement and reload each animation tick; select the phase-dependent frame from
`$25291C`; advance or hold the follower path; wrap at `$1C8D90`; and append to sprite bucket 28 through the
`$240892` register convention.

Type-5 coverage moves from 21/23 to **22/23**. Only call #23 `$252A52` remains. Focused mirrored draw,
gate, timer, path, and call-order checks pass. W479 adds the `$25291C` ROM window, so generated web assets
must be refreshed before the next publication. It is the third wave after live build `20260821205739` and is
not a publication wave.

### D88: W480 TYPE-5 CALL #23 `$252A52`: HYPER-STOCK ANIMATION

`$28B66A` now runs `$252A52`, completing the cartridge's 23-call type-5 frame list. The mirrored player arms
retain the pause, live-player, stock, bit-14, bonus, and per-player phase gates. Each arm decrements its byte
timer, reloads on underflow, advances the `$81291C`/`$812920` animation path, installs the cartridge's longer
midpoint pause, wraps at `$1C4410`, and appends to sprite bucket 29 through `$240976`.

Type-5 coverage moves from 22/23 to **23/23**. Focused mirrored animation, gate, timer, path, bucket, and
call-order checks pass. W480 is the fourth wave after live build `20260821205739` and is not a publication
wave. The next wave returns to live Black Label stage and loop-2 gameplay content.

### D89: W481 STAGE-5 TYPE `$52`: FIRST LIVE TYPE `$4C` CHILD

A corrected lifecycle bench reached `processDeferred` at frame 66, selected type `$52`'s init stub `$270634`,
and stopped on its missing ROM read. W481 translates the real init body at `$27063C`, copies the deferred
packed position and heading into its one sub-record, installs the nine-word record prototype, registers handler
`$270694`, and drains the child through the ordinary deferred queue.

The handler preserves movement-first lifetime and parent-presence retirement, hit scoring and palette flash,
negative-HP death, kind-`$14` effect and cue, seven ordered state bits, edge turning, aim and slew, paired
kind-`$07` shots, movement kick, randomized restart speed, and the static and turning sprite-table paths.
Enemy coverage moves from **95/256 ported, 31 unknown, 130 null** to **96/256 ported, 30 unknown, 130 null**.
One compact synthetic test covers deferred allocation, real init dispatch, copied fields, registered execution,
movement, lethal hit, effect state, cue, and free.

Four exact ROM windows cover the eight-byte init stub, adjacent record and long-form sub-record prototypes,
eight static art pointers, and 32 turning-art rows. Local tables and browser assets were regenerated. The first
publication attempt exposed a W478 transcription error: `$252BD0` had applied flag and stage bonuses after
zero power, although the cartridge branches past them. Correcting the source restored the exact W438-W442
checkpoint oracles; only genuine lifecycle, ledger, window-count, and W479 follower changes were rebased.
The affected set passed **136/136** and the full DaiOuJou suite passed **4,305/4,305** with no skips.

W481 was the fifth interval wave after build `20260821205739`. The quiet-tree publication completed the
Gradius, DaiOuJou bundle and web-fetch, Batman, build, ROM-leak, deployment, and live-confirmation gates and
published build **`20260822010546`**.

### D90: W482 STAGE-5 TYPE `$4E`: PAIRED TYPE `$4C` CHILD

The corrected deferred lifecycle next selected type `$4E`, init stub `$2701D6`, first missing read `$2701D8`,
and handler `$270222`. W482 translates body `$2701DE`: it loads the exact one-record long-form prototype at
`$270206`, copies the parent-supplied packed position before installing the two-word record prototype at
`$270202`, and deliberately preserves the parent lateral bias at `+$1A`.

The handler calls vector lookup `$241812` directly, without `$2417DE`'s freeze gate, and advances both packed
position words. Its `$28`-frame expiry enqueues two type `$4F` children, with the second child receiving
independent `+$0A00` and parent-bias word additions, then frees type `$4E`. Surviving frames draw fixed art
`$1499CC` through the register-convention bucket-2 stub `$23DF2A`. Enemy coverage moves from **96/256
ported, 30 unknown, 130 null** to **97/256 ported, 29 unknown, 130 null**. Init-body coverage moves from 89
to 90 registered bodies.

Two exact ROM windows cover the eight-byte init stub and the contiguous `$20`-byte prototype block. The local
export moves from 618 to **620 windows** while staying at **75 overlapping pairs**. One compact synthetic test
covers deferred init, exact prototype fields, preserved parent bias, movement, both child coordinates, and
free. The focused lifecycle, registry, coverage, dependency, and ROM-window checks pass **43/43** with no
skips. No browser assets were regenerated, and W482 is not published.

Continuing the corrected lifecycle one drain further reaches the next runtime blocker: type `$4F`, init
`$270298`, first missing read `$27029A`, and handler `$2702E6`.

### D91: W483 STAGE-5 TYPE `$4F`: NESTED TYPE `$4E` CHILD

The corrected deferred lifecycle selected type `$4F`, init stub `$270298`, first missing read `$27029A`, and
handler `$2702E6`. The stub is exactly `move.w #0,($4,A5); rts`. W483 translates body `$2702A0`: it loads
one long-form sub-record from `$2702CA`, copies the type `$4E` supplied packed position from record `+$16`
to sub-record `+$02`, then loads exactly three record words from `$2702C4`. There is no movement script,
palette install, or bespoke global setup.

The handler first retires through `$2704AA` when shared parent word `$8130E0` clears, allocating effect kind
`$04` at call site `$2704AE`, copying position, setting effect bucket `$10`, and freeing the enemy. Otherwise
it applies `$242684`'s seen-on-screen retirement rule, calls velocity lookup `$241812` directly without a
freeze gate, and updates both position words. Before reversal it decrements speed to zero, sets record byte
`+$17`, and changes heading to `$20`; afterward it accelerates by one, plus one more while `$813098` is
nonzero. Cadence borrow reloads record byte `+$1A`, advances the art cursor by four, and wraps `$2C` to `$14`
before reading. The eleven reachable art longs start at `$2703BA`. Drawing uses size `$0620`, sub-record
palette `+$1D`, flags `$F800F800`, bucket 7 through `$23E282` when `$803910` is zero, or bucket 22 through
`$23F82A` otherwise.

Three exact ROM windows cover the eight-byte init stub, the contiguous `$22`-byte record and sub-record
prototype block, and the `$2C`-byte set of eleven reachable art pointers. The local export moves from 620 to
**623 windows** while staying at **75 overlapping pairs**. Enemy coverage moves from **97/256 ported, 29
unknown, 130 null** to **98/256 ported, 28 unknown, 130 null**. Init-body coverage moves from 90 to 91
registered bodies, and the stage-5 dependency census now preserves the nested `$4E -> $4F` edge.

One compact synthetic test covers ordinary deferred init, exact prototype fields, movement ordering,
deceleration, reversal, rank-sensitive acceleration, cadence and art wrap, both zoom buckets, effect
retirement, and free. A one-line rank-gate mutation makes it fail at expected speed `$12` versus actual
`$11`; restored source passes. The focused lifecycle, registry, coverage, dependency, and ROM-window checks
pass **43/43** with no skips. `export-tables.py --verify` covers the regenerated ignored local table. No
browser assets were regenerated, no full suite was run, and W483 is not published. Published build
**`20260822010546`** remains pinned to W481.

The ordinary bounded lifecycle now reaches types `$52`, `$4E`, and `$4F` over 5,000 frames without another
missing read. Exercising type `$4C`'s cartridge-backed part-4 firing branch runtime-selects the next blocker:
type `$50`, init `$2703FA`, first missing read `$2703FC`, and handler `$270446`.

### D92: W484 STAGE-5 TYPE `$50`: TYPE `$4C` PART-4 CHILD

The bounded part-4 lifecycle selected type `$50`, init stub `$2703FA`, first missing read `$2703FC`, and
handler `$270446`. The stub is exactly `move.w #0,($4,A5); rts`. W484 translates body `$270402`: it loads
one long-form sub-record from `$27042A`, copies the type `$4C` supplied packed position from record `+$16`
to sub-record `+$02`, then installs exactly two record words from `$270426`. Those words are `$0000,$0030`,
so the handler receives a 48-frame lifetime. The long-form prototype begins with flags `$8001`, supplies
speed `$08`, heading `$20`, HP `$7FFF`, and palette `$12`, and ends exactly where the handler begins.

The handler first tests shared parent word `$8130E0`. If it is clear, control uses the same `$2704AA` tail as
type `$4F`: allocate effect kind `$04` at `$2704AE`, copy position, set effect bucket `$10`, and free. While
the parent remains present, the handler calls vector lookup `$241812` directly without the `$2417DE` freeze
gate, updates both packed position words, and decrements record word `+$18`. A surviving frame adds position
bias `$F600FE00` as one longword, draws fixed art `$149978` with size `$0A10` and the sub-record palette
through register-convention stub `$23DF2A` into bucket 2. On the zero frame it enqueues type `$51`, copies the
post-movement position to child record `+$16`, and frees without drawing.

Two exact ROM windows cover the eight-byte init stub and the contiguous `$20`-byte record and long-form
sub-record prototype block. The ignored local table was regenerated. Its export moves from 623 to **625
windows** while staying at **75 overlapping pairs**. Enemy coverage moves from **98/256 ported, 28 unknown,
130 null** to **99/256 ported, 27 unknown, 130 null**. Init-body coverage moves from 91 to 92 registered
bodies. The stage-5 dependency census moves `$4C -> $50` to the ported set and preserves the new `$50 -> $51`
unported edge; the other unported child edges remain `$48 -> $54` and `$4C -> $58`.

One compact synthetic lifecycle test covers deferred init, exact prototype fields, direct movement, fixed-art
bucket-2 drawing, movement-before-expiry ordering, type `$51` emission, and the shared effect retirement. It
failed before implementation on the absent `$270402` body registration, then passed after the port. The
focused W481-W484 lifecycle, registry, coverage, dependency, and ROM-window set passes **46/46** with no
skips. `export-tables.py --verify` is part of the final W484 gate. No full suite or browser-asset regeneration
was run, and W484 is not published. Published build **`20260822010546`** remains pinned to W481.

Driving the cartridge-seeded 48-frame lifetime against the regenerated real window set enqueues type `$51`.
Draining it selects init `$2704C8` and throws on its stub word at `$2704CA`; its cartridge handler is `$270516`.
That type `$51` lifecycle is the next runtime blocker.

### D93: W485 STAGE-5 TYPE `$51`: TERMINAL TYPE `$50` CHILD

W485 translates the exact zero-run init stub `$2704C8`, body `$2704D0`, and handler `$270516`. The body loads
one 28-byte long-form sub-record from `$2704FA`, preserves the deferred packed position at record `+$16` into
sub-record `+$02`, and installs the three record words at `$2704F4`: `$0000,$0000,$0101`. The sub-record
prototype supplies flags `$8000`, HP `$7FFF`, speed `$18`, heading `$00`, and palette `$14` while deliberately
skipping the destination position bytes.

The handler applies the shared `$242684` seen-on-screen rule: an unseen off-screen child continues, an on-screen
frame sets record byte `+$16`, and a later off-screen frame frees before movement or drawing. It calls `$241812`
directly, with no `$8130D2` freeze gate, and updates both packed position words. Before reversal it decrements
speed; reaching zero sets record byte `+$17`, heading `$20`, and flags `$8001`. After reversal, rank word
`$813098 == 0` accelerates by one to `$1C`; nonzero rank accelerates by four to `$3C`. Byte-underflow cadence
reloads record byte `+$1A` from `+$1B`, advances the signed art cursor by four, and wraps `$38` to `$28` before
reading `$2705FC + cursor`. Drawing adds packed bias `$F600FA00`, uses size `$0A30`, palette `+$1D`, and flags
`$F800F800`; `$803910` selects bucket 7 through `$23E282` or bucket 22 through `$23F82A`. Type `$51` emits no
child and terminates by leaving the screen.

Three exact, disjoint ROM windows cover the eight-byte init stub, the contiguous `$22`-byte record and
sub-record prototype block ending exactly at the handler, and 14 reachable art longs. The regenerated ignored
local export moves from 625 to **628 windows** and 437,697 ROM-window bytes, with **75 overlapping pairs**
unchanged. Enemy coverage moves from **99/256 ported, 27 unknown, 130 null** to **100/256 ported, 26 unknown,
130 null**. Init-body coverage moves from 92 to **93** registered bodies. The dependency census moves
`$50 -> $51` to ported and leaves two statically unported edges, `$48 -> $54` and `$4C -> $58`.

One compact synthetic lifecycle regression covers deferred init, exact prototype fields, movement ordering,
seen-on-screen retirement, reversal, both rank arms, cadence and cursor wrap, both zoom buckets, and free. It
failed before implementation on the absent `$2704D0` body registration, then passed after the port. The compact
W481-W485 lifecycle, registry, coverage, dependency, and ROM-window checks pass **47/47** with no failures or
skips. `export-tables.py --verify` covers the regenerated ignored local table. No full suite, browser-asset
regeneration, commit, push, or publication was run. W485 is unpublished, and published build
**`20260822010546`** remains pinned to W481.

Type `$51` is terminal. The `$48 -> $54` scan is not a live Version-B frontier: both live callers target the bare
`rts` at `$2714AE`, leaving the `$54` call in the disabled body at `$2714B0`. The next runtime blocker found is
therefore the existing type `$4C` port's omitted live state-4 arm at **`$26FDF4..$26FEC7`**, first missing at
`$26FDF4`. The cartridge arm ramps record word `+$1E` to `$0600`, arms eight paired passes, and calls `$263684`
at `$26FE5C` and `$26FE8C` to emit type `$58` with distinct packed biases. Restoring that parent arm is required
before type `$58` can be honestly runtime-proven.

### D94: W486 TYPE `$4C` COMPLETE STATE-4 OMISSIONS, PUBLISHED

W486 restores both live omissions inside `state4_4C`: the step-1 steering gate `$26FD8C..$26FD98` and the
paired arm `$26FDF4..$26FEC7`. Independent review caught the first W486 draft still advancing step 1
unconditionally. The cartridge loads target `$3200/$1C00`, calls `$26FF9E`, and `$26FD98 bcs.w $26FDAE`
skips the band, step, and phase stores while steering remains in progress. Carry clear falls through to write
band `$04`, step 2, and phase byte `+$2A = 1`. The later step comparisons still run in either case, but phase
zero keeps the paired arm inactive until that first waypoint has actually been reached.

The second decisive control-flow fact is that `$26FDC4 bcs.w` lands at `$26FDD4`, whose still-step-2
comparison routes onward to `$26FDF4`, while `$26FDEA bcs.w` lands there directly. Neither route reaches
`$26FEC8 rts`. The arm therefore runs while the two later state-4 waypoints are still travelling. Replacing
those edges with JavaScript `return` had silently removed the whole parent path and made type `$58` look
unreachable.

At `$26FDF4`, sub-record byte `+$2A == 1` gates the ramp. Record word `+$1E` is compared with `$0600`
before the add; if unequal, `$26FE08` adds `$0040`, then the signed `blt.w` at `$26FE14` leaves phase 1
armed while the result is below `$0600`. Reaching or passing the cap stores exactly `$0600`, changes
`+$2A` to 2, loads eight passes into `+$2B`, and clears heading cursor `+$34`. Phase 2 runs only when the
low byte of `$80390A & 7` is zero. It indexes the already-exported eight-long table `$26FCD2` by
`(+$2B & 7) * 4`, so the eight pass indices are 0, 7, 6, 5, 4, 3, 2, 1.

Each due pass calls deferred fixed-zero enqueue `$263684` twice, at `$26FE5C` and `$26FE8C`, for type
`$58`. Both children add the selected table long to the copied parent position, but the first also adds
packed bias `$0C7FF600` and the second `$0C800A00`. Each copies `(4 - +$34) & $3F` into child byte
`+$1A`, and each emission increments `+$34` separately modulo 8. The pass counter decrements after the
pair; only its eighth zero clears phase byte `+$2A`.

The compact W486 runtime regression first places step 1 far from `$3200/$1C00` and proves both the step and
phase remain unchanged, then places it exactly at the waypoint and proves band `$04`, step 2, and phase 1 are
written only after arrival. It next starts below the cap, proves there is no early emission, drives all eight
every-eighth-frame passes, checks every off-cycle frame and all 16 queue records field by field, and drains the
queue. Every queued type is `$58`; the drain reads init stub `$270BDC` and reaches only the unported init+8 body
`$270BE4`. The cartridge handler is `$270C66`, so type `$58` is now the next runtime-proven blocker. Bypassing
the step-1 steering result fails expected step 1 versus actual step 2. Mutating the child to `$57` also makes the
regression fail, and restoring both cartridge values returns it to green.

The arm reuses the existing `$26FCD2 + $20` table window. The only genuinely new read is the eight-byte type
`$58` init stub, so W486 adds exactly `$270BDC + $08`. The regenerated ignored local export moves from 628 to
**629 windows** and from 437,697 to **437,705 bytes**, with **75 overlapping pairs unchanged**. The focused
new test passes 1/1, and the relevant type `$4C` field, runtime, retirement, and W486 set passes **96/96** with
no failures or skips. Enemy-handler and init-body coverage do not move because type `$58` itself remains
unported.

W486 was published as production build **`20260822042005`**, superseding build
**`20260822010546`**. The repaired quiet-tree publication gate passed Gradius units **746/746**, the
Gradius gate **13/13 with zero skips**, DaiOuJou units **4,310/4,310 with zero skips**, the DaiOuJou bundle
and web-fetch gates, the Batman gate **27/27 with zero skips**, the distribution build, and the ROM-leak
guard. Cloudflare deployment and live confirmation succeeded at
<https://gbtman.pages.dev/games/ddpdoj/>.

**NEXT CONCRETE DOCKET UNIT: W487, TYPE `$58`.** Port the runtime-proven init body `$270BE4` and handler
`$270C66`, beginning from init `$270BDC`. Do not follow the disabled `$48 -> $54` edge behind Version B's
live `$2714AE` return.

### D95: W487 TYPE `$58`, VERIFIED LOCALLY

W487 ports init body `$270BE4` and handler `$270C66`. The body loads one long-form sub-record from `$270C4A`,
copies the deferred position and heading, installs eight record words from `$270C3A`, stores the `$241812`
vector at record `+$1E`, and aims the independent fan heading through `$24202C`, retaining `$20` when no player
is live. W486's type-`$58`-only queue now drains all 16 records successfully.

The handler frees at signed position word `<= -$400` before movement. Otherwise it adds the packed velocity long
to position and subtracts 2 from its high word, retires when parent word `$8130DE` clears, consumes `$5C` hit
bits through `$286096`, advances its eight-frame art cursor every fourth frame, and draws the existing
`$270972` art through `$23DF86` with bias `$FA00FC00` and size `$0620`. Old-zero borrow cadence reloads from
record byte `+$23`, advances fan heading by 3, checks three directions `$15` apart, and calls `$281402` only for
directions strictly inside `($0C,$34)`.

The death bytes are `$270CB6 move.w #$14,D0 / $270CBA jsr $289004`: they allocate effect kind `$14`, then set
bucket `$10`, post `$28C2C2`, and free. There is no `$28615E` scoreKill call in `$270C66..$270D90`. The compact
regression pins that cartridge behavior along with initialization, inherited heading, movement, acceleration,
cadence-filtered fire, draw, hit scoring, death effect, and off-screen free.

Only the contiguous prototype block `$270C3A + $2C` is newly declared. It ends exactly at handler `$270C66`, so
no executable handler byte is exported, and the handler reuses W481's existing `$270972 + $20` art window.
`export-tables.py --verify` measures 630 windows and 437,749 bytes, with 75 overlapping pairs unchanged.
Enemy coverage is 101 ported, 25 unknown, and 130 null; the init registry has 94 bodies. Focused lifecycle,
W486 drain, registry, coverage, and dependency checks pass 35/35 with no failures or skips.

The local generated player table was regenerated and verified, browser assets were not regenerated, the full
suite was not run, and W487 is unpublished. W486
remains live as build `20260822042005`. Type `$58` emits no enemy child. The only remaining static unported edge
is `$48 -> $54`, disabled behind Version B's live `$2714AE` return, so this wave establishes no next runtime
blocker. Select the next target from runtime progression evidence rather than promoting that disabled edge.

### D96: W488 SHARED FRONT-END LABEL PRINTER, VERIFIED LOCALLY

The old D11 `$253794` lead was stale twice over: W241 proved the routine is the loop-only zero-life extend rather
than option-pod teardown, and W435 measured the complete stage transition against the board. W488 therefore
takes a bounded visible front-end gap instead of resuming an open-ended blocker capture.

W488 ports `$25F2D0..$25F30B`. Low-word D0 zero selects descriptor `$25F43A`; non-zero selects `$25F43E`.
The descriptor's second word becomes the text column and its first word the row. The routine prints the string
at `$25F1F0`, advances A0 by `$10`, decrements the row, and prints the second string through `$25A14C`. Object
slot [17]'s state-6 arm calls it for side 0 then side 1 before its sound gate, replacing the counted deferral.
Object slot [9] shares that state arm, but its separate `$25E72E` draw remains counted because it still also
requires unported `$25F1EC`; W488 does not overstate that larger caller as complete.

Two disjoint data windows add the two `$10`-byte string slots and two four-byte descriptors. The ignored player
table was regenerated; `export-tables.py --verify` measures 632 windows and 437,789 bytes with 75 overlap pairs
unchanged. The directly affected screen set passes 153/153; the exporter plus focused window and deferral guards
pass 40/40. The new regression was observed failing before implementation and now pins descriptor read order,
side order, string stride, row decrement, and removal of the `$25F2D0` note. Browser assets were not regenerated,
the full suite was not run, and W488 is unpublished. W486 remains live as build `20260822042005`.

### D97: W489 VANILLA MORTALITY AND DEFAULT-ON SOUND, VERIFIED LOCALLY

The optional loadout was already correct: an empty launch selected no mod runtime, and explicit
Invincibility alone wrote `$810424=$FF`. The defect was the generated fly-around seed itself. Its P1
record contained `$FF`, the oracle's indefinite hold, so ordinary browser play began protected and drew
the invulnerability aura continuously. P2's corresponding byte was zero.

W489 adds `launchSeedForBrowser`. An ordinary browser launch gets a cloned seed with only P1's embedded
invulnerability intervention cleared; unrelated RAM and the generated bundle seed remain unchanged.
Explicit Invincibility retains `$FF` before the first render. Labelled progression rungs retain their exact
seed, while replay reconstruction continues to use its replay-owned seed and poke list. Cartridge mortality
is otherwise untouched: player start and respawn still install `$F0` grace, non-`$FF` values count down,
and zero reaches the authentic hit, death, life-decrement, respawn, and game-over paths.

Sound now defaults on subject to browser gesture policy. `AudioController` is created and exposed before
the first asynchronous bundle fetch, and removable one-shot listeners arm it on the first pointer, key,
touch, or click input. SOUND-origin events are excluded until the button's explicit toggle runs, preventing
a mute click from briefly enabling audio. SOUND remains a direct mute/on control. Failed boot and `stop()`
remove both the global unlock listeners and the page's named click handler; disposal remains idempotent
across every later boot failure.

The mortality, mod, ship-aura, sound-runtime, controller, and browser-default set passes 91/91 with no
failures or skips. The W489 regression was observed failing before implementation. Independent review
found no remaining sound lifecycle defect. The full suite was not run, browser assets were not regenerated,
and W489 is unpublished. W486 remains live as build `20260822042005`. W487, W488, and W489 are the first
three unpublished waves after it; W491 remains the fifth-wave publication point.

### D98: W490 TRANSIENT REPLAY AND RECORDING NOTICES, VERIFIED LOCALLY

The replay banner was pointer-transparent but permanent. REC armed and saved wrote it directly; PLAY,
divergence, green/red verdicts, and replay errors wrote through a helper that likewise never removed it.
Arming, stopping, or loading failures instead entered `showError`, the permanent fatal-runtime overlay,
even though gameplay could continue. A successful save therefore left a large box over play indefinitely.

W490 adds `createAutoDismissNotice`, with one timer and one monotonically advancing revision. Every show
cancels the prior handle, advances the revision, paints the new class and HTML, clears `aria-hidden`, and
schedules concealment after four seconds. The callback verifies its captured revision before touching either
the current notice or timer handle. Manual or timed hiding invalidates the revision and clears class, content,
inline display, and ARIA state. The REC button remains the persistent armed indicator after its banner clears.

Every recording and playback report now uses that controller. Arming, stopping, and local replay-load
exceptions produce a transient red operation report rather than a fatal overlay. Replay-origin error text is
escaped before entering HTML. Existing fatal boot, asset, unported, and frame-loop failures remain on
`showError` and are not auto-dismissed.

The focused W490 notice, W489 browser-default, and W158 sound set passes 19/19 with no failures or skips.
The missing-export regression was observed failing before implementation. A second red witness caught the
first callback draft nulling the current timer handle when a stale callback ran; the revision guard now runs
before that write. Independent review passed W490 at 4/4 and existing recording/playback behavior at 7/7,
and found no concrete defect. The full suite was not run, browser assets were not regenerated, and W490 is
unpublished. W486 remains live as build `20260822042005`; W491 is the next wave and the fifth-wave
publication point.
