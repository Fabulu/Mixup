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

The remaining seven ([7], [8], [14], [15], [16], [17], [19]) carry none of those anchors in their first `$400`, which
is itself informative: **the main screen is likely among them**, because a title screen reads neither player records
nor the score table.

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

Credits, coining up, lives, extends, game over, continue. The port has scoring (`scoreHit`, `scoreKill`, the
`LEDGER`) but no economy around it.

**Related and already partly measured:** `$8130DC..$8130E6` is the six-word mutual-exclusion block, and
`$269C6C` frees any record seeing any flag set -- game-over handling will touch that. `respawn25FFA8` exists
in `tally.js`. And D25/D32/D21/D12 are open playtest items that may turn out to be life-system symptoms
rather than independent bugs, so re-read them once this lands.

### D37: THE GAME'S ENDINGS

Every ending the cartridge can reach, and the conditions that select between them. Nothing here is measured
yet.

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

**So the first work here is MEASUREMENT, not optimisation.** Nothing about the port's end-to-end latency is
measured today. Establish, in frames:

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

* sampling input later in the frame than the cartridge does, so a press lands one frame sooner
* skipping the game's own input debounce or repeat delays where it has them
* reacting to a press before the frame boundary that would normally consume it

**D38 MUST LAND FIRST.** Without its measurement there is no way to tell which of these actually removes a
frame and which only feels like it does, and no way to keep the faithful build honest while they exist. A
mod that silently becomes the default is the failure mode to design against.

### D36: THE SECOND GAME IN THE ROM -- **DEFINITELY LAST**

The cartridge carries a second game. **The owner's instruction is explicit: this is the last thing tackled,
after everything else.** Do not start it opportunistically because a window happens to be declared or a
routine looks adjacent, and do not let it absorb effort while stage 1-5, the loops, or D33-D35 are open.

Recording it now so it is not rediscovered as a surprise, and so nobody treats an unexplained ROM region as
in-scope work when it belongs to the second game.
