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

**Start at 13 and 14.** Both are in `$288xxx`, which is where every HUD table this port already
uses lives (`$2881F2` the panel tiles, `$2883E6` the hyper-stock icons, `$28840E`, `$287DF8`).
Both open the same way -- `tst.b ($2,A5) / beq` then `cmpi.b #$2,($2,A5)`, an object state
machine on a state byte -- and both run at gameplay priorities ($000B and $0014) rather than
menu ones. That is the profile of a small thing painted next to the other small things.

A screenshot would still cut this in half, and asking is cheaper than reading two objects: mark
on it what is missing and which of the two candidates it sits next to.

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

### D27: PUBLISH INTERMITTENTLY -- BUT NOT ON EVERY WAVE

> "Publish intermittently so you catch these mistakes, but not on every wave."

The standing instruction, refined. D19 said record the build id; D18 said push and not just
commit. This adds the CADENCE: publish often enough that reports land against something
recent, and not so often that a roughly 40-minute three-game gate run eats the session. A
batch of waves, suite green, then publish. W321 is why this matters in both directions --
the web gate is only ever run BY `tools/publish.mjs`, so not publishing lets the gate rot
until it blocks the publish that would have caught it.
