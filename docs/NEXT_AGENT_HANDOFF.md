# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-22 (W496 published, D26 ships and pilots next)

## CURRENT DIRECTION AND DEFINITION OF DONE

Finish the complete Black Label Version-B game, including the full second loop, then finish DoDonPachi
DaiOuJou White Label. Prioritize gameplay defects and missing visible content with small cartridge-faithful
fixes. Pure duplicate-register cleanup is deferred until both versions are functionally complete.

`docs/DOCKET.md` is authoritative. **W496 completes the additional transformative roster.** The catalogue
now has 30 entries. Boss Rush dynamically scans each newly installed stage script through its `$FFFF`
sentinel, keeps the final approach records from roughly 16 clock units before the last trigger, and leaves
the authentic walker, allocation, boss, result, and stage flow in control. Stage Remix transforms only
`$242952`'s next-stage value to route Stage 1, Stage 3, Stage 2, Stage 4, and Stage 5, including the same
stateless route in loop 2 and the unchanged stage-5 ending value. W492 through W495's thirteen additions
remain unchanged. All fifteen additions block replay v1. Empty, unknown-only, direct, Original, and later
vanilla-Game paths install no mod callback or policy.

The W496 focused and directly affected set passes 170/170. The repaired publication suite passes
4,360/4,360 with no failures or skips. Syntax, diff hygiene, and forbidden-punctuation checks pass. The
published-bundle gate remains 15,955,968/15,955,968 pixel-identical. Production build `20260822120853`
is deployed and confirmed live; W501 is the next five-wave publication point.

W491's mortality, sound, notice, and layout work remains intact. W488 ports the shared two-line per-side
label printer `$25F2D0`. W487 remains the last gameplay translation wave and ports type `$58`, leaving
enemy-handler coverage at 101/256 ported, 25 unknown, and 130 null, with 94 init bodies. Type `$58` emits
no enemy child. Do not follow the static `$48 -> $54` edge because Version B's live callers target the bare
`rts` at `$2714AE`. W496 is live as production build `20260822120853`, superseding W491's
`20260822080859`.

## W496 PUBLISHED: BOSS RUSH AND STAGE REMIX

`spawn.js` invokes one selected callback only after an authentic stage-script installation, both in the
initial type-5 reset and in later stage rebuilds. Boss Rush scans that installed script dynamically to its
`$FFFF` sentinel, derives the final trigger minus `$10`, puts the live cursor at the first retained record,
and aligns `$8130CE` to the threshold. It commits no ROM-derived trigger table and cannot rewind during an
ordinary script walk.

`stageend.js` computes the cartridge next-stage value first, then optionally transforms only the value stored
in the new type-6 object. Stage Remix maps 1 to 2, 3 to 1, and 2 to 3, while 4 and 5 remain authentic. This
routes stages 1, 3, 2, 4, and 5, preserves the ending selector, and repeats without stored host state in loop
2. Vanilla Games own neither callback.

The focused and directly affected set passes 170/170. The first publication run exposed one stale
source-line expectation in the widened-register scan after W494 moved `behaviourFor`; the repaired scan
still identifies the same `$283BAF` claim. The final quiet-tree gate passes 4,360/4,360 DDPDOJ units,
746/746 Gradius units, the 13/13 Gradius gate, the 27/27 Batman gate, both DDPDOJ browser gates, the
distribution build, and the ROM-leak guard. Build `20260822120853` is confirmed live.

## W495 VERIFIED LOCALLY: FRIENDLY CONVERSIONS AND LOOP-2 LAUNCH

`bulletdriver.js` invokes one selected conversion hook only after the ordinary screen-clear arm preserves
its existing impact allocation and authentic bullet-free writes. `shots.js` scans the cartridge P1 primary
and secondary allocation windows, fills a real primary-shot record, switches it to the already-moving
handler, and gives it a fixed upward velocity. Full shot windows refuse without overwriting anything. Free,
unarmed, out-of-window, and high-bit transform-only bullet records never create shots. The converted record
then moves through `runShotDriver` and damages enemies through the existing shot collision path.

`launchSeedForBrowser` writes loop 1 in board numbering only into an ordinary launch copy when Loop 2 From
Stage 1 is selected. It does not hold the word during frames, change the stage, mutate the source seed, or
touch labelled progression and replay paths. Ordinary mortality remains enabled.

The focused and directly affected set passes 89/89. All changed JavaScript parses, `git diff --check` and
the U+2014 scan pass, and the published-bundle gate remains pixel-identical. W495 is the fourth wave after
W491 and is not published.

## W494 VERIFIED LOCALLY: REVENGE, POLARITY, AND SCORE MODS

`enemies.js` wraps the central score-kill callback only while dispatching an ordinary-band record and calls
the selected death hook only if the same handler clears that record's live bit. Revenge Bullets aims from
the captured final sub-record position and uses `spawnCore` Bank A kind 5, retaining authentic no-player,
freeze, and pool-full refusals. Boss and special bands never acquire this seam.

`damage.js` asks one optional filter immediately before authentic enemy-bullet hit marking. Bullet Polarity
uses each player's own focus bit: unfocused ignores Bank A, focused ignores Bank B, and the opposite bank
continues through the original collision writes. `score.js` registers a per-RAM final-addend transform and
applies it only for P1/P2 pending-ledger endpoints. Score Multiplier Mayhem reads `$80390A & 7`, multiplies
packed BCD x1 through x8, and leaves intermediate accumulators and later vanilla Games unchanged.

The compact and directly affected set passes 118/118. All changed JavaScript parses, `git diff --check` and
the U+2014 scan pass, and the published-bundle gate remains pixel-identical. W494 is the third wave after
W491 and is not published.

## W493 VERIFIED LOCALLY: COLLISION AND DEATH MODS

`mods.js` owns four new state-local policies. Graze Reactor tracks Pool-A and Pool-B record addresses per
player, adds packed-BCD 100 for a genuine near miss, and resets both players' seen state whenever that
record is successfully reallocated. Glass Cannon zeros both protection bytes and transforms every
nonnegative player-damage resolution, including shot, weapon, beam, bomb, laser-bomb, and ramming paths;
negative translated damage remains unchanged. Auto Deathbomb delegates to `fireBomb2498E2` and clears the
pending lethal bit only after the authentic arm reports a fired bomb. Resurrection in Place captures a
side's coordinates only when a reserve life exists and consumes them only after successful respawn-object
allocation. A last-life death clears stale state, while allocation refusal retains it for a retry.

`Game` validates and exposes only selected callbacks. Per-RAM bullet-spawn registration lets compact bullet
contexts reset Graze Reactor slot lifetimes without global policy. Vanilla Games own none of these callback
properties, and all four additions block replay v1.

## W492 VERIFIED: FIRST FOUR TRANSFORMATIVE MODS

`mods.js` owns the new catalogue entries, RAM addresses, timing map, gauge snapshot, bee target helper, and
per-Game callback selection. `bee.js` invokes the optional magnet seam only for status words whose allocated
bit is set, collected bit is clear, and kind is bee or flying bee. `bullets.js` applies a per-RAM transform
to the final speed byte immediately before writing both live and original speed. `Game` validates and
registers only callbacks supplied by the selected loadout; `Demo` passes them to initial and replay-created
Games.

Hyper Overdrive restores a gauge only when the post-frame player is active and the change is exactly minus
two. Adaptive Slow Motion wins the timing conflict at priority 30 and maps density 48..210 to scale 1..2.25.
Bee Magnet moves at most `$80` on each axis toward the nearest allocated player record. Boss Enrage reads
`$81309C`, changes no spawn when it is zero, and adds six with saturation when it is nonzero.

## W491 PUBLISHED: VIEWPORT, CHROME, AND MOBILE CONTROL VISUALS

The page grid now has only the menu and stage rows. `body.chrome-hidden` removes the menu row entirely,
while SHOW UI stays fixed at the safe-area corner. Both actions call `fit()` after changing the class. The
page requests `{ fill: true }` in every layout, retaining `pickScale`'s aspect ratio and below-2x integral
floor while using the limiting axis above it. `#stage` aligns the canvas at the top.

The fixed touch pad overlays the stage with translucent control surfaces. Its full-width container has
`pointer-events: none`; only `.dpad` and `.cluster` restore input. `attachStick` now forwards an
`onVisual` callback into shared `attachFloatingStick`. The page paints fixed-position origin and knob
markers, clamps visual displacement to 44 CSS pixels, and relies on the shared null callback for every
release and backstop path.

## W490 VERIFIED: TRANSIENT REPLAY AND RECORDING NOTICES

`createAutoDismissNotice` owns exactly one timer and revision. `show` cancels the previous handle,
advances the revision, paints the banner, and schedules concealment. The callback first verifies its
captured revision before touching the shared handle, which is load-bearing: the first draft correctly
refused to hide newer text but still nulled that text's timer handle. A chained replacement test exposed
that defect before correction. `hide` invalidates the revision and clears class name, HTML, inline display,
and `aria-hidden` state.

The page uses this controller for REC armed, REC saved, PLAY, divergent, green, red, mismatch, and replay
error reports. Arming, stopping, and local replay-load exceptions use the same transient red report instead
of `showError`, which remains reserved for fatal boot and runtime stops. Replay-origin error text is HTML
escaped. The banner stays pointer-transparent, while the button continues to show `STOP REC` for the whole
armed interval.

## W489 VERIFIED: VANILLA MORTALITY AND DEFAULT-ON SOUND

The ordinary browser seed was the defect, not the mod resolver or player update. Its captured P1 record
already held `$810424=$FF`, the indefinite oracle fly-around intervention, while P2 held zero. `Demo`
now passes ordinary launches through `launchSeedForBrowser`, which clones the seed and clears only that
byte unless explicit Invincibility is selected. A labelled progression rung returns its exact seed, and
replay reconstruction remains on its replay-owned seed and poke list. `player.js` still installs `$F0`
for ordinary start and respawn grace and decrements every nonzero value other than `$FF`.

`AudioController` is now constructed and exposed synchronously before the first boot `await`.
`armSoundOnFirstGesture` owns removable one-shot listeners, excludes SOUND-origin gestures until the
button click has applied its explicit toggle, and arms only while enabled. Boot disposal is idempotent and
covers fetch, parsing, construction, input attachment, failed boot, and `stop()`. The page binds a named
removable SOUND click handler through the early controller callback. The compact affected set passes
91/91 with no failures or skips; independent lifecycle review found no remaining defect.

## W488 VERIFIED: SHARED FRONT-END LABEL PRINTER

The exact implementation state is summarized above. The focused regression failed before the
implementation, then proves side order, descriptor read order, the `$10` string stride, the D1 row
decrement, and removal of the counted `$25F2D0` deferral. Slot [9]'s larger `$25E72E` draw remains a
counted unit because it also depends on unported `$25F1EC`; W488 does not pretend that whole caller
is complete.

## W487 VERIFIED: TYPE `$4C`'S PAIRED TYPE `$58` CHILD

The exact implementation state is summarized above. The focused regression proves initialization and inherited
heading, packed movement and vertical acceleration, old-zero cadence and fan filtering, bucket-7 drawing, hit
scoring and death effect, and off-screen free. W486's regression now expects all 16 queued records to drain
rather than an `UNPORTED $270BE4` throw. The exporter declares prototypes only and does not export handler code.

## W486 PUBLISHED: TYPE `$4C` COMPLETE STATE-4 OMISSIONS

Independent review caught the first draft still omitting `$26FD8C..$26FD98`. Step 1 loads target
`$3200/$1C00` and calls `steer4C`; `$26FD98 bcs.w $26FDAE` must leave step 1 and phase `+$2A = 0` intact
while travel is in progress. Arrival alone falls through to band `$04`, step 2, and phase 1. The regression
proves both sides and fails expected step 1 versus actual step 2 when the steering result is bypassed.

The later flow is equally exact. `$26FDC4 bcs.w` lands at `$26FDD4`, whose still-step-2 comparison routes
onward to `$26FDF4`; `$26FDEA bcs.w` lands there directly. The arm therefore runs while state 4 is still
travelling. The former JavaScript waypoint `return` erased that fall-through. Phase byte `+$2A == 1` compares
record word `+$1E` with `$600`, adds `$40` when unequal, uses the signed post-add comparison to continue
ramping, then clamps to `$600`, sets phase 2, loads eight passes into `+$2B`, and clears cursor `+$34`.

Phase 2 is due only when `$80390A & 7 == 0`. It indexes existing table `$26FCD2` by `(+ $2B & 7) * 4` and
calls `$263684` at `$26FE5C` and `$26FE8C`. Both deferred records are type `$58` with fixed-zero flags and copy
the parent position plus the selected table long. Their separate packed biases are `$0C7FF600` and
`$0C800A00`. Each copies `(4 - +$34) & $3F` into child `+$1A` and increments `+$34` independently. After eight
pairs, `+$2B` and phase `+$2A` both reach zero.

The new regression proves no emission one ramp step below the cap, verifies all 16 children, and drains only
type `$58` to the named unported body `$270BE4`. Its red switch fails with child `$57`. The arm's table was
already windowed; only init stub `$270BDC + $08` is new. The regenerated ignored export is 629 windows and
437,705 bytes with 75 overlapping pairs unchanged. The focused W486 test passes 1/1; the existing type `$4C`
field, runtime, retirement, and new arm set passes 96/96. The repaired publication gate passed Gradius units
746/746, the Gradius gate 13/13 with zero skips, DDPDOJ units 4,310/4,310 with zero skips, the DDPDOJ bundle
and web-fetch gates, the Batman gate 27/27 with zero skips, the distribution build, and the ROM-leak guard.
Cloudflare confirmed production build `20260822042005` at <https://gbtman.pages.dev/games/ddpdoj/>.

## W485 VERIFIED: TERMINAL TYPE `$50` CHILD

The lifecycle selected type `$51` at init `$2704C8` and failed on its stub word at `$2704CA`. The exact stub
installs zero run length. W485 adds body `$2704D0`, handler `$270516`, and three exact windows: the eight-byte
init stub, the contiguous `$22`-byte record and long-form sub-record prototype block at `$2704F4`, and 14
reachable art longs at `$2705FC`. The body loads the 28-byte long-form sub-record, preserves the deferred packed
position, and installs record words `$0000,$0000,$0101`.

The handler uses `$242684` to arm retirement after its first on-screen frame and frees before movement once it
later leaves the screen. It calls `$241812` directly without a freeze gate, decelerates to zero, changes heading
to `$20` and flags to `$8001`, then accelerates by one to `$1C` at rank zero or by four to `$3C` otherwise.
Byte-underflow cadence advances its signed art cursor and wraps `$38` to `$28`. It draws with packed bias
`$F600FA00`, size `$0A30`, palette `+$1D`, and flags `$F800F800` through bucket 7 or 22 according to `$803910`.
It emits no child.

Coverage moves from 99 ported and 27 unknown to 100 ported and 26 unknown; 130 null entries do not move. The
init registry moves from 92 to 93 bodies. Three disjoint windows move the local export from 625 to 628 windows,
with 75 overlapping pairs unchanged. The dependency census moves `$50 -> $51` to ported and leaves two static
unported edges. The compact lifecycle, registry, coverage, dependency, and window checks pass 47/47 with no
failures or skips. The regression first failed on the absent body registration. The ignored local table was
regenerated and verified. Browser assets were not regenerated, the full suite was not run, and W485 remains
unpublished at build pin `20260822010546`.

## W484 VERIFIED: TYPE `$4C` PART-4 CHILD

The lifecycle selected type `$50` at init `$2703FA` and failed on its stub word at `$2703FC`. The stub installs
a zero run length. W484 adds body `$270402`, handler `$270446`, and two exact windows: the eight-byte init
stub and the contiguous `$20`-byte record and long-form sub-record prototype block at `$270426`. The body
loads one sub-record from `$27042A`, copies the parent position, and installs record words `$0000,$0030`.

While parent word `$8130E0` remains set, the handler calls `$241812` directly, moves, decrements the 48-frame
lifetime, and draws fixed art `$149978` through `$23DF2A` into bucket 2 with longword position bias
`$F600FE00`, size `$0A10`, and palette from sub-record `+$1D`. On expiry it enqueues type `$51`, copies the
post-movement position, and frees. If the parent word clears first, it shares type `$4F`'s `$2704AA` tail,
emits kind `$04` at `$2704AE`, copies position, sets effect bucket `$10`, and frees.

Coverage moves from 98 ported and 28 unknown to 99 ported and 27 unknown; 130 null entries do not move. The
init registry moves from 91 to 92 bodies. Two disjoint windows move the local export from 623 to 625 windows,
with 75 overlapping pairs unchanged. The dependency census moves `$4C -> $50` to ported and preserves
`$50 -> $51` as unported. The focused lifecycle, registry, coverage, dependency, and window checks pass 46/46
with no skips. The regression first failed on the absent body registration. Browser assets were not regenerated,
the full suite was not run, and W484 is not published. Type `$51` at `$2704CA` is the next bounded runtime
blocker; its init is `$2704C8` and handler is `$270516`.

## W483 VERIFIED: NESTED TYPE `$4E` CHILD

The lifecycle selected type `$4F` at init `$270298` and failed on its stub word at `$27029A`. The stub installs
a zero run length. W483 adds body `$2702A0`, handler `$2702E6`, and three exact windows: the eight-byte init
stub, the contiguous `$22`-byte record and long-form sub-record prototype block at `$2702C4`, and the `$2C`
bytes of eleven reachable art pointers at `$2703BA`. The body loads one long-form sub-record, copies the parent
position, and installs exactly three words from the record prototype.

While parent word `$8130E0` remains set, the handler applies the seen-on-screen retirement rule, calls vector
lookup `$241812` directly, moves, decelerates to zero, reverses to heading `$20`, and then accelerates once or
twice according to rank word `$813098`. Byte-borrow cadence advances a longword art cursor and wraps `$2C`
to `$14` before the read. It draws through bucket 7 or 22 according to `$803910`. When the parent word clears,
it emits kind `$04` at `$2704AE`, copies position, sets effect bucket `$10`, and frees the child.

Coverage moves from 97 ported and 29 unknown to 98 ported and 28 unknown; 130 null entries do not move. The
init registry moves from 90 to 91 bodies. Three disjoint windows move the local export from 620 to 623
windows, with 75 overlapping pairs unchanged. The 43 focused lifecycle, registry, coverage, dependency, and
window checks pass with no skips. Mutating the rank gate makes the lifecycle test fail at expected speed
`$12` versus actual `$11`, and restoration returns it to green. Browser assets were not regenerated, the full
suite was not run, and W483 is not published. Type `$50` at `$2703FC` is the next bounded runtime blocker.

## W482 VERIFIED: PAIRED TYPE `$4C` CHILD

The lifecycle selected type `$4E` at init `$2701D6` and failed on its stub word at `$2701D8`. W482 adds body
`$2701DE`, handler `$270222`, and the exact init and prototype windows. The body loads one long-form sub-record,
copies the parent position, installs a two-word record prototype, and preserves the parent `+$1A` lateral bias.
The handler calls `$241812` directly, moves, draws through `$23DF2A`, and on expiry creates two type `$4F`
children. The second child receives separate `+$0A00` and parent-bias word additions before `$4E` frees.

Coverage moves from 96 ported and 30 unknown to 97 ported and 29 unknown; 130 null entries do not move. The
init registry moves from 89 to 90 bodies. Two disjoint windows move the local export from 618 to 620 windows,
with 75 overlapping pairs unchanged. The 43 focused lifecycle, registry, coverage, dependency, and window
checks pass with no skips. Browser assets were not regenerated, and W482 is not published. Continuing the same
lifecycle one drain further runtime-proves type `$4F`, init `$270298`, first missing read `$27029A`, and handler
`$2702E6` as the next blocker.

## W481 VERIFIED: FIRST LIVE TYPE `$4C` CHILD

At frame 66 the corrected bench drained type `$4C`'s deferred queue, selected type `$52` init `$270634`, and
reached its missing stub read. W481 adds body `$27063C`, handler `$270694`, the exact prototype and draw-table
windows, registration, and one compact lifecycle and lethal-hit behavior test. The child copies the deferred
position and heading, runs all seven ordered state arms, emits paired kind-`$07` shots, and retires with the
cartridge's kind-`$14` effect and cue. Focused lifecycle, registry, and coverage checks pass. Coverage moves
from 95 ported and 31 unknown to 96 ported and 30 unknown; 130 null entries do not move.

## W480 VERIFIED: ALL TYPE-5 FRAME CALLS CLOSED

`$28B66A` now dispatches `$252A52`. The mirrored player arms preserve pause, live-state, stock, bit-14,
bonus, and phase gates, advance the byte-timed stock animation with its longer midpoint pause and wrap, and
emit through `$240976` into bucket 29. Focused mirrored animation and call-order checks pass. Type-5
coverage moves from 22/23 to 23/23.

## W479 VERIFIED: TYPE-5 PLAYER BONUS FOLLOWERS

`$28B664` now dispatches `$25292A`. The mirrored arms preserve the pause, player-state, bit-14, and bonus
gates, reload animation ticks, read phase frames from `$25291C`, advance and wrap the follower path, and emit
through `$240892` into bucket 28. Focused mirrored draw and call-order checks pass. Type-5 coverage moves
from 21/23 to 22/23.

## W478 VERIFIED: TYPE-5 ENEMY-BULLET SPEED BIAS

`$28B652` now dispatches `$252BD0` immediately before call #20 `$281D9A`. `hyper.js` selects and, when
inactive, quarters the players' maximum hyper power. A nonzero result reads the proper loop table and applies
the flag and stage bonuses; zero skips those bonuses and continues with the loop and boss adjustments. The
result is capped at 8 or 15 and stored at `$812950`. The W481 publication repair corrected that zero-power
branch and restored the exact checkpoint ladders. Type-5 coverage is 21/23 at this historical wave.

## W477 VERIFIED: MOD MENU, VANILLA PATH, AND DEATH ORACLE

`start.html` resolves 15 optional mods into deterministic `#mods=id+id` links. RAM, input, timing, and RGB
hooks are isolated behind a nonempty loadout. Ordinary play performs no `$810424` write, selected
Invincibility performs the explicit `$FF` write, progression scenarios keep their declared poke, and replay v1
refuses simulation-changing loadouts while allowing presentation-only effects. Focused mod, replay, input, and
death checks pass 39/39. The extended `w164death.py capture` MAME oracle also passes the complete
invulnerability-off death, life-decrement, respawn, and game-over cycle.

## W476 VERIFIED: TYPE-5 HYPER STOCK FOLLOWER

`$28B62E` now dispatches `$2527CE` in the cartridge's type-5 call order. `hyper.js` shifts the fifteen saved
positions at `$81B660`/`$81B6A0`, captures the current live ship, chooses the history sample and vertical
offset from stock 1 through 5, applies the draw and loop-2 blink gates, and emits through bucket 18. The
focused behavior test and syntax checks pass. Type-5 coverage moves from 19/23 to 20/23.

## W475 VERIFIED: GENERIC PALETTE REPORT OWNS NO UPLOAD ENTRY

`palette.js flush24133C` remains the once-per-frame cartridge upload, preserving independent dirty-region
copies, flag clears, source provenance, the background-fade tail, and accounting. `PaletteState#ledger`
retains the same method identity and per-region coverage report; only its preceding documentation is now
address-free. Focused palette and authoritative-register checks passed 24/24; the W446-W462 holder chain
passed 187/187. Only widened heads changed, 69 to 68. W471 remains live as build `20260821175936`; W475 is
the fourth wave in the next publication interval.

## W474 VERIFIED: RETIRED LEDGER NOTE OWNS NO CARTRIDGE ENTRY

`hud.js makeHudObject` remains the factory for `$240F62[0] = $28D520`, preserving all three HUD object
states, the existence flag, cold-boot score destinations, queue kill, score drain, and per-frame ledger.
`score.js notePerFrameLedger` retains the same public identity, call site, and no-op behavior; its preceding
documentation is now address-free and the full history remains inside the function. Focused HUD and live
register coverage passed 224/224. Widened heads changed 71 to 69 and narrow heads changed 16 to 15. W471
remains live as build `20260821175936`; W474 is the third wave in the next publication interval.

## W473 VERIFIED: GENERIC UNSIGNED-LONGWORD HELPER OWNS NO CARTRIDGE ENTRY

`hud.js txPrint240DC2` remains the cartridge entry for the base-grid TX defer printer, preserving its tile
bias, tile step, grid walk, and deferred writes. `ram.js u32` retains the same implementation and public ESM
identity as the generic unsigned 32-bit normalizer; only its preceding documentation is now address-free.
Focused HUD and live-register coverage passed 205/205. Only widened heads changed, 72 to 71. W471 remains
live as build `20260821175936`; W473 is the second wave in the next publication interval.

## W472 VERIFIED: SHARED BOMB-POSITION HELPER OWNS NO CARTRIDGE ENTRY

`bomb.js draw23FF06` remains the cartridge entry that writes the packed record to sprite bucket 13. The
renamed private `packBombRecordPosition` helper preserves the position, live-offset, shift, mask, and flag
arithmetic shared by `$23FF06` and `$23FF42`; it is not another `$23FF06` entry. Focused bomb and live
register coverage passed 221/221. Only widened heads changed, 73 to 72. W471 remains live as build
`20260821175936`; W472 starts the next publication interval.

## W471 VERIFIED: PARAMETERIZED EMITTER HELPER OWNS NO CARTRIDGE ENTRY

`bossarrival.js emitScaled` is one shared implementation parameterized by sprite bucket, not a second
`$23E3E2` entry. Its preceding documentation is address-free, while the cartridge family and bucket
mapping remain documented beside the code. The four wrappers, extent scaling, packed position, attributes,
and calls are unchanged. Focused boss-arrival and banner coverage passed 38/38; the W446-W462 holder chain
passed 187/187. Only widened heads changed, 74 to 73. W471 is live as build `20260821175936`; W472 starts
the next publication interval.

## W470 VERIFIED: GAME BOOT ADAPTER OWNS NO FRONT-END ENDPOINT

`main.js Game#boot` adapts `Game` state to exported `frontend.js bootFrontEnd23BF74`; it does not duplicate
the six-call front-end setup body. The method still stores and returns `bootResult`, remains absent from the
constructor, and retains the full cold-boot and `$23BFDB` fall-through explanation inside its body. Its
preceding documentation is now address-free. Focused front-end and cold-boot coverage passed 21/21; the
W446-W462 holder chain passed 187/187. Only widened heads changed, 76 to 74. W471 completed the next
row above and is the fifth-wave publication.

## W469 VERIFIED: SLOT-12 CLEAR ADAPTER OWNS NO CARTRIDGE HEAD

The former private `objslot12.js clearTx` was a caller adapter, not a second TX-clear transcription. It
still runs `background.js clearTx23C622(ctx.tx)` when render state exists; otherwise it records `$23C622`
with the exact `$28F2BA` or `$28F386` caller and returns, preserving the unit-testable teardown behavior.
Only its address-bearing preceding documentation and generic name changed to `clearTxOrNote`; both callers
remain in place. Focused object-dispatch, context, deferral, and authoritative-register coverage passed
49/49; the W446-W462 holder chain passed 187/187. Only widened heads changed, 77 to 76. W470
completed the next two endpoint rows above.

## W468 VERIFIED: FORM-1 EXIT ADAPTER OWNS NO SHARED BODY HEAD

The former private `boss.js bossExit2A6EDC` supplied only Hibachi form 1's ROM/context arguments and
`bossEnding2A6D8C` tail thunk. The 52-byte freeze, countdown, live-player, re-arm, and death dispatch body
already lives in exported `hibachi2.js bossExitShared`, shared with `$2A707E` and `$2A7294`. The adapter is
now `bossForm1Exit`, with its detailed cartridge correction inside the function. Its phase caller and
ending thunk are unchanged. Focused Hibachi and authoritative-register coverage passed 86/86; the
W446-W462 holder chain passed 187/187. Only widened heads changed, 78 to 77. W469 completed the next row above.

## W467 VERIFIED: HUD HYPER ADAPTER OWNS NO CARTRIDGE HEAD

The former private `hud.js hyper285A12` was a caller adapter, not a second transcription. It still passes
the selected player, HUD-owned ROM context, and `hyperStock286ED6` redraw callback to the exported
`hyper.js stepHyper285A12`; only its address-bearing identity changed to `stepPlayerHyper`. Both calls in
`perFrame28444E` remain in the same order and retain their `$284460/$284464` source markers. The
canonical function remains the only `$285A12` claimant. Focused hyper, HUD, bee, and authoritative
register coverage passed 60/60; the W446-W462 holder chain passed 187/187. Only widened heads changed,
79 to 78. W467 started the next five-wave publication interval; W468 completed the next row above.

## W466 VERIFIED: NAME-FRAME GLUE OWNS NO CANONICAL ENDPOINT

The former `nameFrame28F4C4` is a private caller composite around already exported `hiscorename.js`
steps. It is now `nameEntryFrame`, with its cartridge-range commentary inside the body. Every executable
statement and caller stays in place, while `$28F4C4` and `$28F666` each return to one canonical claimant.
The authoritative register passed 12/12 and the slot-12 surface passed 26/26. Only widened heads changed,
81 to 79. W466 is live as build `20260821162642`; W467 completed the next row above.

## W465 VERIFIED: ONE `$28C6C6` SOUND POSTER

The HUD helper is the cartridge entry's sound action and now owns its sole source identity. The result
screen's former `cue28C6C6` was a caller adapter around two timer words, not a second implementation.
Its renamed helper preserves the decrement, zero test, reload to 3, four caller paths, and canonical
sound call. The authoritative register passed 12/12, the stage-end surface passed 44/44, and a direct
poster check passed. Only widened heads changed, 82 to 81. W466 completed the next two endpoint rows
above and was the required fifth-wave publication.

## W464 VERIFIED: ONE `$28E7A2` BANNER CLEAR

The two private loops both cleared the 40 words at `SE.banner`, including the two guards consumed by
`banner28E7F8`. `stageend.js clear28E7A2` is now exported and its existing stage-end caller is unchanged.
`objslot8.js` imports it for `$25C5F0`; the private `bannerClear28E7A2` identity is removed without an
alias. The authoritative register passed 12/12 and the arm-5 plus stage-end caller surface passed 69/69.
Only widened heads changed, 83 to 82. W465 completed the next `$28C6C6` row above.

## W463 VERIFIED: PRIVATE `$28C0FC` COUNTED-GAP ADAPTERS REMOVED

The two same-named functions were private adapters around `ctx?.unported?.note`, not implementations of
the cartridge entry. Neither was exported or imported. Their only adaptation was the caller address, so
the three slot-8 calls (`$25A7E2`, `$25A7FA`, `$25A9DA`) and slot-12 call (`$28F380`) now retain direct,
optional, address-specific notes. `$28C0FC` remains a counted sound gap because the address-only
`soundPost` API still rejects this ENTRY; W463 does not alter `sound.js` or sound state.

No dependency edge, ROM window, generated output, or public ESM identity changed. Existing W375, W377,
and W387 tests already cover branch multiplicity, exact note keys, optional hooks, and the slot-12 count,
so no new behavior test was needed. Live scanner APIs moved only widened heads from 84 to 83; narrow heads
remain 16, body pairs 27, and body-only findings 22. Focused cue/register coverage passed 93/93, and
the W446-W462 live holder chain passed 187/187. The next obvious batch is W464 `$28E7A2`, where
`objslot8.js bannerClear28E7A2` and `stageend.js clear28E7A2` are two private clear loops over the same
exported `SE.banner` span.

## W462 VERIFIED: PRIVATE `$2414BE` ADAPTER IDENTITIES REMOVED

**CLASSIFICATION AND IMPLEMENTATION.** `palette.js install2414BE` remains the sole canonical public ESM
identity. The private `installTxBank` functions in `objslot8.js` and `objslot12.js` were not cartridge
bodies and had no public consumer, so they were removed without compatibility aliases. Their adaptations
remain directly at all five callers: exact bank 0 and 32-byte source, call site and reason, a counted
unported note when `ctx.palette` is missing, and deferred ROM access on that arm. Slot 8 retains
`$25A80E/$25A92C` main and `$25A9A2/$25AC10` warning sources; slot 12 retains `$28F394` main. The six
production importers point toward `palette.js`, which does not import either object-slot module.

Build-B main CPU size is `$600000` and SHA-256 is:

    4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c

The exact 36-byte body is `[$2414BE,$2414E2)`, SHA-256
`57f81c30f0abf2d85a849805eb3fcdc0c891ddf0f5590ad62b7be6d26be22aa1`, with bytes:

    48e780c043f90080f886eb48d2c0700722d851c8fffc33fc00010080fa6a4cdf03014e75

It decodes as `$2414BE MOVEM.L D0/A0-A1,-(A7)`, `$2414C2 LEA $80F886,A1`, `$2414C8 LSL.W #5,D0`,
`$2414CA ADDA.W D0,A1`, `$2414CC MOVEQ #7,D0`, `$2414CE MOVE.L (A0)+,(A1)+`, `$2414D0 DBRA
D0,$2414CE`, `$2414D4 MOVE.W #1,$80FA6A`, `$2414DC MOVEM.L (A7)+,D0/A0-A1`, and `$2414E0 RTS`.
The prior complete body `[$241404,$2414BE)` hashes to
`a1fe60c29ae893e62620fa745100436f9def1073b6b66f28f3102647d1422a50` and ends with `$2414BC RTS`.
The next multi-bank sibling `[$2414E2,$24150A)` hashes to
`b344ea7538965782e90edc77ba553292f201072dc7a761a6253584ff3d42ce83`. Neither boundary falls through.

The complete aligned scan decoded all 3,145,728 words. Image-wide transfer counts are Bcc.B 119480,
Bcc.W 10851, BRA.B 6815, BRA.W 1969, BSR.B 5809, BSR.W 2042, DBcc 2287, JSR.W 6, JSR.L 12787,
JSR.PC16 649, JSR.PCIX 4, JMP.W 4, JMP.L 1285, JMP.PC16 85, and JMP.PCIX 106. Exactly 29 external calls
enter the head:

    $23BF8E $23BF9C $23BFAA $23BFB8 $23BFC6 $2416C8 $241702 $241742 $24177C
    $25A80E $25A92C $25A9A2 $25AC10 $25C600 $25C9AE $25CDCE $26056C
    $2605DC $2605EA $2605F8 $260606 $260614 $260622 $260630 $26063E
    $26064C $26065A $288590 $28F394

Twenty-five are absolute-long JSR calls, each accounting for one of the 25 aligned exact-longword
references into the body. `$2416C8`, `$241702`, `$241742`, and `$24177C` are PC-relative JSR calls. The
sole internal entry is `$2414D0 DBRA -> $2414CE`. All 110 indexed-PC candidates have no zero-index base
inside the body. There is no external static entry to an inner instruction. Every call and first complete
continuation is byte-pinned, and none consumes returned CCR/SR. Dynamic indirect reachability is unproved.

Every caller passes bank `0..14`, an even pointer, and exactly 32 source bytes. The complete
`(call:bank/source)` census is:

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

Production represents 28 sites. `$288590`, bank 13 from `$222818`, is the sole static source gap and
remains unclaimed because its reachability was not proved.

Machine ownership is exact. MOVEM makes a 12-byte frame and restores D0, A0, A1, and A7; no other
register is touched. `LSL.W #5` owns only D0's low word. `ADDA.W` sign-extends it, so `$07FF` becomes
`$FFE0` and walks 32 bytes backward. Machine `$0800` can alias bank 0 after the word shift, but the public
contract deliberately rejects every value outside `0..14`. Eight longword copies advance internal A0 and
A1 by 32 bytes and write only 16 words of the selected TX bank. Bank 0 and 14 witnesses preserve adjacent
sentinels. The final write sets TX dirty word `$80FA6A` to 1 without owning sprite `$80FA66` or background
`$80FA68`. Internal D0 reaches `$0000FFFF` after DBRA, then MOVEM restores caller D0. Final N/Z/V/C are
clear and X is preserved.

The production RED changed `i < TX_BANK_WORDS` to `i < TX_BANK_WORDS - 1`. It failed three independent
focused sections: word 15 remained dirty `$A55A` instead of `$591E`, provenance word 15 remained `$7E`
instead of sourced `1`, and the exact production-loop guard rejected the shortened body. Twelve other
sections stayed green. Exact restoration returned `palette.js` to both pre-RED and pre-task SHA-256:

    aca9de23e439271c9c51e7ea105302ab53ef778e36ef0d6e89032f759fa00389

Live scanner APIs now reconcile to narrow heads 16, widened heads 84, body pairs 27, and body-only 22,
with body-only derived from `headIndex()`. `$2414BE` is no longer a duplicate head because only the
canonical implementation remains. The complete W446-W462 holder chain passed 187/187. Existing palette
windows remain exactly `$222618 + $0020`, `$222638 + $00C0`, `$2226F8 + $0080`, `$222778 + $0080`, and
`$2227F8 + $0020`. The `$222818..$222838` source gap and executable body remain unexported.

Editing-agent validation on the restored final W462 tree:

    focused W462                              15 pass / 0 fail / 0 skipped
    focused W462 plus authoritative register 27 pass / 0 fail / 0 skipped
    W446-W462 live-register chain            187 pass / 0 fail / 0 skipped
    affected palette/object/register surface 509 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/         4280 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs       31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows
    games/ddpdoj/tools/docket_ids.py         68 items, no duplicates, D71 next

W461 was published as build `20260821132334`. W462 is the first wave after that publication and is not a
publication wave. No export-web, publish, stage, commit, push, branch switch, worktree, generated rip, or
generated asset operation occurred.

**HISTORICAL W462 RECOMMENDATION FOR W463:** audit the private `$28C0FC` `cueStreamNote` adapters.
W463 completed that batch above without porting the counted sound gap.

## HISTORICAL W461 COORDINATOR-VERIFIED: ONE CANONICAL `$242E24` RANK-BYTE DRAW

**THE BODIES ARE EQUIVALENT AND MERGED.** `initbody.js rankByte242E24` was a private transcription of
`rng.js drawByte242E24`. Both incremented only byte `$803917`, read the resulting word at `$803916`,
masked it with `$007F`, and returned the byte at `$242E42 + index`. `initbody.js` now calls the canonical
RNG export at all three source call sites and no longer owns duplicate constants. No alias survives
because the removed helper was never public. The existing import direction remains acyclic.

Build-B main CPU SHA-256 is:

    4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c

The complete 30-byte body is `[$242E24,$242E42)`, SHA-256
`5c280b15e6b2c520824f120b39e9ed5d47144209586b37852d8c8793b53440c3`, with exact bytes:

    523900803917707fc079008039162f0841fa000c4e7110300000205f4e75

Its instructions are `$242E24 ADDQ.B #1,$803917`, `$242E2A MOVEQ #$7F,D0`, `$242E2C AND.W
$803916,D0`, `$242E32 MOVE.L A0,-(A7)`, `$242E34 LEA ($242E42,PC),A0`, `$242E38 NOP`, `$242E3A
MOVE.B (A0,D0.W),D0`, `$242E3E MOVEA.L (A7)+,A0`, and `$242E40 RTS`. The preceding 256-byte table
`[$242D24,$242E24)` hashes to `f45979b11a2946df59ecc5f027d5603ffc2dd52cd29bac2997d1eb931cdd7157`.
The exact 128-byte indexed table `[$242E42,$242EC2)` hashes to
`81ec92daeca70fd966be91ca9f170a8a5c72724320c1c38f3614e57ca5853cbf`. The next 28-byte routine
`[$242EC2,$242EDE)` hashes to `dd09ca2e3cf97f28d6cbe13b9929d6120a61457f0d9f284b4030e2a8c0b0cf58`.
There is no fallthrough into or out of the body.

A complete aligned scan of all 6 MiB covers branches, DBcc, BSR, absolute-word and absolute-long
JSR/JMP, PC-relative JSR/JMP, all 110 indexed-PC candidates, exact longwords, and internal entries. It
finds exactly 37 static external entries, every one `JSR.L $242E24`:

    $265350 $265376 $26728A $268744 $27699C $27E02A $27EAD6 $27EC86
    $280CFA $280D12 $288CD4 $289756 $28A26C $28A2E8 $28A326 $28A360
    $28A3A2 $28A3E0 $28A426 $2933DE $2933EE $297AF0 $297F94 $297F9E
    $29924C $299362 $29A132 $29A13C $29D1EC $2A5062 $2A5164 $2A51E0
    $2A5424 $2A81CC $2A83E8 $2A8810 $2A8EE0

There is no static internal entry, no other direct transfer, and no indexed-PC zero-index base inside the
body. Exactly 37 aligned exact-longword references exist, each the operand at one caller plus two. Every
call and first complete continuation instruction is pinned; every continuation consumes D0 and none
immediately branches on returned SR. Dynamic indirect reachability remains explicitly unproved.

The width proof is load-bearing. `ADDQ.B` wraps `$803917` without carrying into `$803916`; the high byte
is preserved and read but masked away. `MOVEQ` owns all 32 D0 bits, then `AND.W` limits the index to
`0..127`; final `MOVE.B` therefore returns a fully zero-extended `0..255` despite being a byte write. A0
and A7 return exactly unchanged. Final N/Z reflect the table byte, V/C clear, and X is preserved. Dirty
witnesses cover register dirt, high-byte dirt, counter wrap, adjacent sentinels, all 256 recycled
real-table draws, A0/A7, and both X inputs.

The caller conventions remain distinct. Type `$11` applies `LSR.B #1`, making `$FF` unsigned 127. Type
`$8D` applies `ASR.B #1`, making `$80` signed -64. Both now consume the same canonical unsigned byte
without changing those later interpretations.

Cartridge static reachability and production source reachability are not conflated. Nineteen source calls
across `bee.js`, `boss2.js`, `boss2attacks.js`, `boss3.js`, `bossscripts.js`, `effects.js`,
`hibachiguns.js`, `initbody.js`, `items.js`, and `spark.js` represent twenty cartridge callers because one
bee body is duplicated in the image. Those cartridge sites are `$268744`, `$27699C`, `$27E02A`,
`$27EAD6`, `$27EC86`, `$280CFA`, `$280D12`, `$289756`, `$28A26C`, `$28A3A2`, `$2933DE`, `$2933EE`,
`$29924C`, `$299362`, `$29A132`, `$29A13C`, `$29D1EC`, `$2A81CC`, `$2A83E8`, and `$2A8810`. The
remaining 17 static callers are still explicit source gaps.

The production RED changed canonical `& 0x7f` to `& 0x3f`. It failed five independent witnesses: dirty
boundary ownership, the full 256-draw replay, the real type `$11` result, the real type `$8D` result, and
the source mask guard. Restoration returned `rng.js` byte-for-byte to SHA-256:

    f5a3907b477e9df70e2ced5da1135c15d8efb5bd81557a3b90b98003e5da62bd

Focused W461 passed 12/12. The complete W446-W461 live-register chain passed 172/172. Registers reconcile
from W460 as narrow heads 16 -> 16, widened heads 86 -> 85, body pairs 28 -> 27, and body-only 22 -> 22
derived live from `headIndex()`. The removed pair was head-visible. The existing `$242E42 + $0080` ROM
window remains exact; none was added or widened.

Editing-agent validation on the restored final W461 tree:

    focused W461                              12 pass / 0 fail / 0 skipped
    focused W461 plus authoritative register 24 pass / 0 fail / 0 skipped
    W446-W461 live-register chain            172 pass / 0 fail / 0 skipped
    affected caller/RNG/register surface     586 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/         4265 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs       31 PASS / 0 FAIL, exit 0
    export-tables.py --verify               VERIFY OK at 613 windows
    games/ddpdoj/tools/docket_ids.py        67 items, no duplicates, D70 next

Coordinator-independent validation repeated focused W461 at 12/12, the complete W446-W461 register
chain at 172/172, the affected caller/RNG/register surface at 586/586, and the full suite at 4265/4265.
Webgate returned 31 PASS / 0 FAIL, ROM verification returned VERIFY OK at 613 windows, and the docket
remained 67 unique items with D70 next. The coordinator separately reproduced all 37 callers, all 37
exact longword operands, all five production RED failures, and exact `rng.js` restoration. Scope, hashes,
line endings, CRLF `movement.js`, added punctuation, protected paths, generated outputs, staging state,
and `git diff --check` are clean. A stale regression label for the preceding table was corrected from
`$242CAC` to the pinned `$242D24` start without changing behavior.

**HISTORICAL W461 RECOMMENDATION FOR W462 `$2414BE`.** W461 handed off the private `installTxBank`
wrappers in `objslot8.js` and `objslot12.js` as audit candidates only. W462 completed the body,
reachability, dependency, public-identity, and caller-adaptation proof above and removed both private
names without aliases.

## HISTORICAL W460 COORDINATOR-VERIFIED: `$24631C` CORRECTED TO ONE REAL CLEAR

**THE CLAIMANTS WERE NOT EQUIVALENT.** `stageend.js clear24631C` transcribed the cartridge. The
`objslot8.js` head was only an optional `ctx.clear24631C` shim, and `Game#ctx()` never supplied that key,
so `$25A7C6`, `$25A956`, and `$25A9B8` were no-ops. Slots 13 and 14 repeated the invented gate. W460
exports the verified stage-end body, removes the shim, and makes all six source-reachable callers import
it directly. No compatibility alias was needed because `$24631C` had no prior public ESM export.

Build-B main CPU SHA-256 is:

    4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c

The complete routine is the 80-byte half-open span `[$24631C,$24636C)`, SHA-256
`137f82cec8408762cfa4d794873d9004e99b3eda0882ea47a4d6afad15b61ad7`. Its exact bytes are:

    41f90080fa86303c04af30fc000051c8fffa7e0241f9008103464250317c0000
    0004217c00000000002c41e8003051cfffea3e3c001341f90080fa864250217c
    00000000002c41e8007051cffff04e75

The previous routine is exactly `[$246292,$24631C)`, ends with `$24631A RTS`, and hashes to
`7618bcd449ae591a909485d6864e289bc518dc0762e5113d00c0a151f7f8dd9f`. `$24636C` starts the next
routine with `MOVEM.L D0-D1/A0,-(A7)`.

A complete aligned scan of all 6 MiB finds nine external absolute-long JSR callers, all entering at the
head: `$23BF3E`, `$256DB0`, `$25A7C6`, `$25A956`, `$25A9B8`, `$288A48`, `$288C52`, `$28D578`, and
`$28D5FA`. The only internal entries are the three DBcc loops at `$24632A`, `$24634A`, and `$246366`.
The only exact longword references are the nine JSR operands. All 110 aligned indexed-PC JSR/JMP
candidates have zero zero-index bases inside the body. No external static transfer enters an internal
instruction. Dynamic indirect reachability beyond the static inventory remains unproved.

The first DBRA clears 1,200 words, exactly `[$80FA86,$8103E6)`. Later loops deliberately repeat fields
inside that span for three roots and twenty nodes. The canonical body preserves all 1,249 cartridge-real
stores. Dirty tests pin both adjacent sentinels, root and node fields, opposite arms, and exact write
order. A0 returns `$810346`; D0 returns `$xxxxFFFF` with incoming high-word dirt preserved; D7 returns
`$0000FFFF`; Z is set, N/V/C are clear, and X is preserved. No caller observes those returns.

Cartridge and source reachability stay separate. Production covers `$25A7C6`, `$25A956`, `$25A9B8`,
`$288A48`, `$288C52`, and `$28D578`. Reset `$23BF3E`, main-loop call 1 `$256DB0`, and unported object
type 19 `$28D5FA` remain explicit source gaps.

The temporary RED shortened the primary loop by one word. It left `$8103E4..$8103E5` dirty and failed
the 2,400-byte ownership witness, exact 1,249-write trace, and real `$25A7C6` caller witness. Restoration
returned `stageend.js` byte-for-byte to SHA-256:

    1229c5b24f105ab5f4a5f229d4336de01f8d662419e11627c90667b5ecc484e0

Live duplicate registers reconcile:

    narrow export-only head rows             16 -> 16
    widened head rows                        87 -> 86
    widened body pairs                       28 -> 28
    body-only findings                       22 -> 22, derived live

Editing-agent validation on the restored final tree:

    focused W460                              12 pass / 0 fail / 0 skipped
    affected caller/stage/chain/register     391 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/          4253 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs        31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows
    games/ddpdoj/tools/docket_ids.py         67 items, no duplicates, D70 next

Coordinator-independent validation on the restored final tree:

    focused W460                              12 pass / 0 fail / 0 skipped
    broader affected surface                 427 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/          4253 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs        31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows
    games/ddpdoj/tools/docket_ids.py         67 items, no duplicates, D70 next

The coordinator independently reproduced the exact body and boundary hashes, all twelve aligned entries,
nine exact longword references and 110 indexed-PC candidates with no zero-index base in the body. The
one-word-short RED mutation independently failed full range ownership, exact write count and the real
`$25A7C6` parent; restoration returned `stageend.js` exactly to SHA-256
`1229c5b24f105ab5f4a5f229d4336de01f8d662419e11627c90667b5ecc484e0`. Diff, scope, line-ending,
punctuation and protected-path checks are clean. No ROM window was added or widened. No generated rip or
asset changed. No export-web, publish, stage, commit, push, branch switch, or worktree operation occurred
during editing-agent work. W461 should audit `$242E24` because the live widened register names both
`initbody.js rankByte242E24` and `rng.js drawByte242E24`, while `bodyPairs()` also derives
`$242E24/$242E3A`. W461 is the cadence publication after its own verified work on a quiet tree, not part
of W460.

## W459 COORDINATOR-VERIFIED: CORRECTED AND MERGED `$25FF38`

**THE IMPLEMENTATIONS WERE NOT EQUIVALENT ON ENTRY.** The cartridge uses `TST.W D0`; the old
`armRequest25FF38` used full-value `side === 0`. D0 = `$00010000` therefore selected the wrong record in
source. The canonical helper now selects `$8130FA` for a zero low word and `$81311E` for any nonzero low
word, writes only D1.W, clears record `+2`, and preserves the public tally import as an alias.

Build-B main CPU SHA-256 is:

    4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c

The complete routine is the 26-byte half-open span `[$25FF38,$25FF52)`:

    41f9008130fa4a406700000841f90081311e3081426800024e75

Its body SHA-256 is `2c1447e71c1b53f32b005fbf92693968ca790f2dbdafb441e53f1b5544d91405c`.
The seven instructions are `LEA`, `TST.W`, `BEQ.W`, the other `LEA`, `MOVE.W D1,(A0)`, `CLR.W 2(A0)`,
and `RTS`. `$25FF36` is `RTS`; `$25FF52` starts the request table.

A complete aligned scan of all 6 MiB finds one internal branch and eight external direct transfers. The
external sites are `$25DCB4`, `$260434`, `$260472`, `$26080E`, `$26083E`, `$26084A`, `$288B2C`, and
`$288C4C`, all entering at `$25FF38`. Six exact longword references are operands of the absolute-long
transfers. Among 110 aligned indexed-PC JSR/JMP candidates, zero have a zero-index base in the body. No
external direct transfer enters an internal instruction.

D0.W alone owns side polarity; D0 high-word dirt is ignored. D1.W alone owns the request store; D1
high-word dirt is ignored. The final clear leaves Z set, N/V/C clear and X unchanged, but no caller
observes a returned data value or conditionally consumes that SR. `$260816` deliberately leaves possible
D0 high-word dirt after `MOVE.W D2,D0`; it has no aligned static caller, exact longword reference, or
fallthrough. Dynamic indirect reachability beyond the indexed-PC census remains unproved.

Production source has one body and six caller bodies in `objslot13.js`, `objslot14.js`, `player.js`
twice, `rank.js`, and `tallyscreen.js`. The tally phase-0 path now performs request 7 after its successful
load, as `$25DCB4` does. Its following `$25E0EA` row selector branches to the still-unported `$25E200`
text-printer body, which remains an explicit separate deferral.

Dirty tests cover both import names, both side records, zero, noncanonical nonzero words, high-word dirt,
D1 truncation, recycled request/state fields, adjacent memory, and the opposite record. Real parent
witnesses cover `$25DCB4` request 7 and `$2603FE` request 4.

The temporary production RED inverted side polarity. The direct zero case returned `$81311E` instead of
`$8130FA`; the real request-7 parent left dirty `[$E712,$3D68]` instead of `[7,0]`. Exactly 2 of 9 W459
tests failed. The request-4 pair parent stayed green because it writes both sides. Restoration returned
`player.js` byte-for-byte to SHA-256:

    ff9400fff0d3cdaba17ddeee84e20eae508a370676f56cd9a4fa4b91fbd6b4b6

Live duplicate registers reconcile:

    narrow export-only head rows             17 -> 16
    widened head rows                        88 -> 87
    widened body pairs                       29 -> 28
    body-only findings                       22, unchanged and derived live

Editing-agent validation on the restored final tree:

    focused W459                               9 pass / 0 fail / 0 skipped
    W446-W459 register chain                 148 pass / 0 fail / 0 skipped
    broad affected surface                   395 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/          4241 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs        31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows

Coordinator-independent validation on the restored final tree:

    focused W459                               9 pass / 0 fail / 0 skipped
    broader affected surface                 487 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/          4241 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs        31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows

The coordinator independently reproduced the exact image and body hashes, all nine aligned body entries,
six exact longword references and 110 indexed-PC candidates with no zero-index base in the body. Inverting
D0.W side polarity reproduced the same two direct and real-parent RED failures; restoration returned
`player.js` exactly to SHA-256 `ff9400fff0d3cdaba17ddeee84e20eae508a370676f56cd9a4fa4b91fbd6b4b6`.
Diff, scope, line-ending, punctuation and protected-path checks are clean. No ROM window was added or widened.
No generated asset, export-web, publish, stage, commit, push, branch switch or worktree operation occurred
during editing-agent work. `$24631C` is the next audit candidate only, not a proved merge.

## W458 COORDINATOR-VERIFIED AND LANDED: ONE TALLY CURSOR LOAD BODY

**THE `$25DA60` IMPLEMENTATIONS ARE EQUIVALENT AND MERGED.**
`tallyscreen.js loadSavedCursor25DA60` is now the sole function body and the live production name.
`restoreCursors25DA60` remains a compatibility export alias to the same function object. W457's
`cursorsFromPosted25D9E6` and `mapSavedCursor25D9E6` alias remain canonical and unchanged.

Build-B main CPU SHA-256 is:

    4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c

The complete routine is the 52-byte half-open span `[$25DA60,$25DA94)`. Its exact bytes are:

    3c39008130843e39008130884a2d00076700000e3c39008130863e390081308a
    7a001a2d00076100ff5e1b46000e1b47000f4e75

The W458 regression enumerates all twelve instructions. Its control edges are `$25DA70 BEQ.W ->
$25DA80` and `$25DA86 BSR.W -> $25D9E6`. `$25DA5E` is `RTS`, so there is no fallthrough entry, and
`$25DA94` begins the distinct row picker. A full aligned 6 MiB scan covers BSR, BRA/Bcc, DBcc,
absolute-word, absolute-long and PC-relative JSR/JMP forms, plus indexed-PC zero-base candidates. It
finds only `$25DC7C BSR.W -> $25DA60` as an external direct caller and the one internal branch.

Raw evidence also freezes the complete `[$25DC2C,$25DCC0)` parent gate and continuation. The successful
arm calls `$25DA60`, then `$25DA94`, advances phase, announces, installs the bank, clears the slot table,
posts tally request 7 and reaches the `$25E0EA` continuation. W458 found W344's picker transcription had
stopped early. The complete picker is `[$25DA94,$25DAC2)`: `$25DAB2..$25DAC0` follows descriptor `+$10`
to `$813008` or `$813018`, writes the resolved Y row at `+$1`, and returns. The production port now
performs that saved-row store.

`TALLY.postD0` is exactly `$813084/$813086`; `TALLY.postD1` is exactly `$813088/$81308A`. Side zero
selects the first pair and every nonzero byte selects the second. `MOVEQ #0,D5` plus `MOVE.B` zero-extends
the raw side byte, including `$80` and `$FF`. D6/D7 are word loads. The canonical `$25D9E6` carry is
ignored; only D6.B/D7.B store to object `+$0E/+$0F`; `RTS` returns. The compatibility result exposes
exactly `{x,y,defaulted}`.

Cartridge and source reachability are separate proofs. The cartridge has the one `$25DC7C` caller.
Production source has one call from `tallyPhase0Arm25DC2C`, reached by `tallyScreen25DBB4`; the historical
`restoreCursors25DA60` name has no production source caller and survives only as an alias.

Before merge, twelve dirty executions ran six cases through both distinct bodies. Final witnesses cover
side bytes `0`, `1`, `$80`, `$FF`; sentinel and searched arms; matches and misses; `$00FE/$00FF/$0100`;
carry set and clear; low-byte truncation; active and inactive `$81308C`; adjacent `$81308E`; both sides;
and every unowned object, cursor-mailbox, saved-selection and announcement byte. The active side-`$80`
parent case loads sentinel row 2, sees the other side already on row 2, moves to row 0, then publishes row
0, proving `$25DA60` precedes `$25DA94`.

The temporary production RED inverted mailbox-side polarity. The direct side-0 sentinel witness returned
dirty opposite-mailbox words `{x:$93BE,y:$3F6A,defaulted:false}` instead of `(0,0,carry set)`. The full
`$25DC2C` parent produced `$D0/$7C` instead of `(1,1)`. Exactly two W458 tests failed. Restoration returned
`tallyscreen.js` byte-for-byte to SHA-256:

    7abf028d0c7bf6c470fbdca1fd7babfd0fd98e353fe8bdee63f546a096cd44f0

The live duplicate registers reconcile:

    narrow export-only head rows             18 -> 17
    widened head rows                        89 -> 88
    widened body pairs                       30 -> 29
    body-only findings                       22, unchanged

Body-only remains derived from live `headIndex()`. Both `$25D9E6` and `$25DA60` stay absent. No ROM
window was added or widened, and no generated asset, export-web, publish, stage, commit or push operation
was performed.

Editing-agent validation on the final W458 tree:

    focused W458                               9 pass / 0 fail / 0 skipped
    W446-W458 register chain plus picker     143 pass / 0 fail / 0 skipped
    broad tally/front-end/register surface   402 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/          4232 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs        31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                VERIFY OK at 613 windows

Coordinator-independent validation on the restored final tree:

    focused W344/W457/W458                     38 pass / 0 fail / 0 skipped
    affected imported surface                 545 pass / 0 fail / 0 skipped
    node --test games/ddpdoj/tests/           4232 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs         31 PASS / 0 FAIL, exit 0
    export-tables.py --verify                 VERIFY OK at 613 windows

The coordinator reproduced the same two RED external failures and restored SHA-256
`7abf028d0c7bf6c470fbdca1fd7babfd0fd98e353fe8bdee63f546a096cd44f0`. An independent complete-image
transfer scan found only the internal `$25DA70` branch and external `$25DC7C` BSR entering the body;
there are no exact longword references to `$25DA60`. Body, picker and parent SHA-256 values are
`f6a93d6da9212d496c32c8307b1e1fff04be0f8e734862b6292f28210d02c6c8`,
`e238e017046bd7d8d6866e226918eda17f0d3a9042fc71028f508abb4230252d`, and
`a78fed5a07162bf8cbbd40f14c7ee21747321ef44d3aa1f9082482efb13df24c`.

## IMMEDIATE ORDER

1. Make both cartridge-supported ships and all three pilots selectable and playable.
2. Complete Black Label through the full second loop.
3. Finish functional White Label after Black Label. Leave duplicate-only cleanup until both are complete.
4. After D26 and functional completion, D28a and D28b use one synchronized control stream, option-like
   formation offsets, coordinated movement, and combined firepower for both authentic ships and then all
   three authentic pilots. Do not use independent controls or cloned stand-ins.
5. W501 is the next five-wave publication point.

## THE HALF-HOURLY ALARM STILL CARRIES TWO STALE CLAUSES

The front-end slots 7, 9, 13, 15 and 17 are already wired in `main.js`; slot 17 sets
`ctx.selectDraws`. The alarm's W375 publish date is also stale. Publish follows the every-fifth-wave
cadence above. Do not spend a wave redoing either clause.

## PUBLISHED HISTORY

Last confirmed live: build `20260822120853`, confirmed 2026-08-22. Earlier confirmed builds include
`20260822080859`, `20260822042005`, `20260822010546`, `20260821175936`, `20260821162642`,
`20260821132334`, and `20260821060153`.

## W422 LANDED -- POOL-A KIND 5, VERIFIED BY THE COORDINATOR

`$27FF9A..$280081`, `$E8`, all code, **ZERO trailing bytes** -- a FOURTH gap shape, after W418's
tables, W419's next-unit data and W420's padding. The last instruction ends exactly at `$280081`,
so here entry-to-entry is exact rather than an upper bound.

**THE TRAP WAS THE CULL.** Kind 5 is kind 0's body (byte-identical over `$60` bar five bytes), but
kind 0 frees on `bmi` while kind 5 uses `cmpi.w #$FE00` + **`$6D`, which is BLT and SIGNED**. The
record survives a long axis in `[-$200, 0)` where kind 0 frees it. **No fresh-`Ram` fixture would
have caught the difference**, because a fresh slot never sits in that band -- the W416 shape again.

**THE BRIEF WAS WRONG ABOUT THE ART AND THE WAVE SAID SO.** It gave stride `$34`; that is the LIVE
ring's stride and the popup's is **`$54`**. Shipping the brief's eight addresses would have shipped
four frames that are not in the animation and missed four that are.

**KIND 5 IS NOT REACHABLE IN THIS ROM REVISION** -- all 27 references to the six entry addresses
are `jsr` operands and not one passes `D0 = $14`/`$44`. The wave claims no state trace and produces
none, which is the right answer. It is ported because it was the last live latent throw in
`runBody`.

**A PRE-EXISTING FALSE REASON IS CORRECTED.** `bee.js` and `export-tables.py` both said only three
selectors exist in the image. There are FOUR. The bound of three was right; the stated reason was
false, for eleven waves. **W418's fifth lie-shape again -- a true assertion resting on a wrong
explanation.** Look for this shape; it has now appeared twice.

MEASURED BY ME, not adopted:

    node --test games/ddpdoj/tests/       3896 pass / 0 fail / 0 skipped
    node games/ddpdoj/tools/webgate.mjs   exit 0, 31 PASS / 0 FAIL
    export-tables.py --verify             OK at 606 windows, none added
    manifest.json                         streamCount 4351; shard 11 870 streams and
                                          1,171,460 mask words (+656); shard 9 HELD

The agent reported 3886. I measured 3896. **The gap is exactly the 10 tests in W423's own new
file**, so the counts reconcile -- unlike W419, where a 15-test gap did not.

## D60 IS CLOSED. W424 PORTED IT. START AT D58 STEP 2.

The owner's `$286AAA IS NOT PORTED YET` is fixed: `$286A82`, `$286AAA`, the tail `$286AEA..$286B9A`
and the rank feeder `$2867B4` are ported and the `unreached` throw is gone.

**THE ARM IS THE ON-SCREEN ITEM COUNTER, which no note here had said.** `$81B60C/$0E/$10/$12` are
`hud.js`'s `itemTimer/itemDir/itemCount/itemKind`, drawn by `$2857B4` as an 8-nibble BCD walk.

**THE BENCH TRAP, and it is the one to carry forward.** In the owner's scenario `$286AAA` goes
STRAIGHT TO THE TAIL -- `$811F72` is negative once the bomb selected the bomb-laser, so
`$286AB2 bmi` is taken and the start block never runs. **A fresh `Ram()` takes the OTHER arm and
exercises none of the tail, the rank feeder or the score add.** Green, while testing none of the
code that ran. W424 pinned that hole as its own test.

Also: `$286A92`'s fork is live BOTH ways and the arms differ in the DIVIDER words while agreeing on
the score, so **a score-only test would have passed under either reading**.

**RE-CHECK D56 AND D59 AGAINST THIS FIRST -- it is cheap and undone.** The recon named `$286AAA` as
their possible common cause and it is now ported.

### CHECK LINE ENDINGS BY BYTES. `grep -c $'\r'` LIES.

It reported 1425 carriage returns in a file containing **zero**. I converted a test file to CRLF on
that basis, and then put the same wrong claim in W424's brief. **The repo is LF throughout**, bar
`tools/webgate.mjs`, `tools/build-dist.mjs`, and five test files: `bullets`, `mover`, `w227death`,
`w36handlers`, `w62stageend`. 299 of 304 test files are LF. Use:

    python -c "d=open(P,'rb').read(); print(d.count(b'\r\n'), d.count(b'\n')-d.count(b'\r\n'))"

### D58 IS CLOSED. THE EXPLOSION WAS NOT THE CUE THE DIAGNOSIS NAMED.

**THE CAVEAT SAVED THE ITEM, so keep writing them.** D58 said the boss-CLEAR cue was silent and
demanded the wave establish whether the owner's "explosion" was that cue or another before closing.
**It was another.** The death `$294DD4` posts `$28C170` once at fight end AND arms A3 script 6,
whose states 2 and 3 dispatch through `lea ($1D8,PC),A0` -> **`$294134`**, eight cue wrappers masked
`andi.w #$1F`. **Those are the repeated bangs**, and `boss.js` counted the whole dispatch as one
note. Closing on `$28C170` alone would have been D56 again.

**MY BRIEF SAID FIVE SITES. THERE WERE NINE**, two of them live throws. Assume a brief's site list
is a floor, never a ceiling.

**TWO MORE W418-SHAPE LIES FOUND.** `BOSS_NOTED` listed three addresses as deferred SOUND that no
`note()` has passed since Wave A -- real `soundPost` calls all along, three documented gaps that
did not exist, invisible **because nothing read the table**. `w62stageend.test.js` now scans
`boss.js` and fails on a dead key. **That is the general fix for this shape: make something READ
the bookkeeping.** This lie-shape has now appeared four times.

### W426 CLOSED THAT, AND FOUND A DEFECT IN MY OWN W423 CODE

All three `$28C186` sites post now; the `objslot15.js:179` throw is gone. But the wave also found
that `postBgmCommand` packed `(d0 << 8) | (d1 & 0xFF)` when **`$28BBAE` is `8041`, the WORD form of
OR**. **My own doc line one screen above already said `& $FFFF`** -- the code disagreed with the
comment for three waves, and my test asserted the code's version **under the heading "the pack is
WORD-sized"**. Nothing observable moved because all three sites pass D1 = 0. **That is why it
survived, and it is lie-shape 1 in my own work.**

**MY BRIEF'S REASONING WAS ALSO WRONG AND THE WAVE CHECKED IT.** I said the scroll-VM site reads a
varying D1. It reads a script word that is `$0000` in every stage of this revision, proven by
walking five cue streams out of the image. The API is still right, but because of the INSTRUCTION,
not the data.

**FOUR WAVES RUNNING HAVE NOW CORRECTED THEIR BRIEF.** W422 the art stride, W424 the line endings,
W425 five sites that were nine, W426 this. **Write briefs that invite it, and read the correction.**

### D59 IS MEASURED AND THE PORT IS NOT AT FAULT

Three probes, each measuring the thing itself and never an overlap. A carrier pinned onto block 7's
own A2 takes real beam damage and **dies on frame 33**; a bee is **allocated on frame 34**; driven
onto the ship it is **collected on frame 2**; and left **entirely alone** it drifts down by itself
and is **still collected**. So the port shoots, kills, drops, flies and collects bees correctly.

**Every D59 hypothesis is dead** -- the position gates, the damage pass, the drop, the collect --
and each died to a measurement. **The reason none of it showed before: no bench had ever put a
carrier in the beam**, because the laser-hold ladder parks the ship at the bottom centre by design.

**THE CAVEAT IS THE COORDINATOR'S AND IT STANDS**: pinning to the muzzle put the bee ~21,500 units
out, so it took ~670 frames to drift down. **That distance is an artifact of the setup, not a
measurement of the game.** The path is proven; the timing is not. **The owner has been asked where
on the screen they see the flickering bees**, and that answer is what D59 now waits on.

### W427 BENCHED IT, AND CORRECTED THE INSTRUCTION I NAMED TWICE

**`$24989E` IS NOT THE SELECTOR. `$249A98` IS.** `08 ee` is mode 5 reg 6 = A6, the PLAYER record;
`08 e9` is reg 1 = A1, and A1 IS `$811F72`. **That is this repo's own EA mode/reg trap, the one
every brief carries, walked into by the person who writes the briefs.** `bomb.js:1548` had it right
all along. Corrected in `score.js` and in the docket.

**AND IT SPLITS THE ITEM IN TWO.** `$249864/$249866` forks on HYPER STOCK: non-zero goes to
`$249868`, the hyper, which **never allocates `$811F72`**, so block 9 never runs; zero goes to
`$249A98`, the bomb-laser, the only path to `$2456A6`. Measured live: at stock 1, **0 guard frames,
0 `$2456A6` frames** across 182 hyper frames.

**SO THE OWNER'S "WHEN YOU HAVE A HYPER" IS THE OTHER WEAPON, and W427 benched the bomb-laser.**
Both are now exercised and **neither is silent**: the bomb-laser flashed up to 6 records in ONE
frame and took 18,690 boss HP in 200 frames against the plain laser's 9,600; the hyper flashed 55
times. **The bits and the HP are measured; THE PIXELS ARE NOT.** D56 now waits on the owner saying
which press they mean.

**A BENCH TRAP WORTH MORE THAN THE WAVE:** writing `$81B65C` alone is NOT a hyper.
`collectHyperStock` also writes `$81B642`, and with the gauge at 0 the hyper ENDS on the frame it
starts, so the whole arm silently measures zero and looks exactly like "the hyper does nothing".
The wave's own first measurement was that. **It is now a test.**

**ALSO: `c003000`/`c003100` cannot be used as seeds** -- they die at frame ~155 on
`UNPORTED $27399E` in `spawnCues28AC72` (`handlers.js:3829`, handler 80). Pre-existing. It rules out
the 17-record pool-B checkpoints, so stage 1 `c008000` is the only clean pool-B rung. **Its own
unit if a wave needs those rungs.**

### W428: A CLIPPED WINDOW, A SILENT BUG, AND THE GUARD THAT DEFENDED IT

**`$27399E` WAS NEVER A ROUTINE.** It is the `script` longword of a cue record, read at
`cues.js:84`. The defect was a **clipped ROM window**. Reachable by anyone who shoots the enemy.

**A RULE IN EVERY BRIEF I WRITE IS WRONG, AND W428 MEASURED IT.** "Declare NEW ROM windows, never
widen -- abutting is correct" **FAILS when a multi-byte read STRADDLES the seam**, because
`RomWindows` needs the whole read inside ONE window. It declared an abutting window, regenerated,
and got the identical throw. **Say this in future briefs.** A RED test now pins it.

**D61, THE SILENT BUG:** three init bodies seeded `table + 28` where the cartridge stores
`table + 2*28`. Every wrong value is a sub prototype's flags word with bit 15 SET, which `$28AC72`
reads as a threshold and breaks on -- so types `$80`, `$82`, `$88` installed **zero cues, forever,
and threw nothing.**

**AND THE REPO'S OWN GUARD AGAINST STALE NOTES WAS DEFENDING IT.**
`tests/w382stalenotes.test.js` asserted those types "open their cue list with a NEGATIVE word".
The words ARE negative -- they are the second sub prototype, not the cue list. **It passed, green,
for waves, with the correct multiplier sitting in the very next test of the same file.** It now
walks the cursor from the cartridge and DERIVES seeds by running the init body, so a regression
moves the test instead of being defended by it.

**THIRTEEN FILES EACH HELD THEIR OWN COPY OF A GLOBAL INVARIANT**, which is how four new windows
broke fourteen tests. Both numbers now live once in `tests/romwindowset.js`, with a guard that
dropping W428's four returns the overlap count to exactly 71 -- **the delta reconciles rather than
merely agreeing.**

**A GATE BASELINE MOVED (records 1742 -> 1821) AND THE HARDWARE SETTLED IT.** Across all 363 oracle
RAM snapshots the three OLD cursor values appear **ZERO** times; the new ones appear 170, 1375 and
145. **The baseline had been captured under the bug.** When the port and a baseline disagree, the
cartridge decides.

### W429 CLOSED `$28AE24` -- AND FOUND A BUG ALREADY LIVE IN SHIPPED KINDS

**D62: `$28ACFE..$28AD26` WAS MISSING FROM `installCue`.** Six of the fifty cue records reach it and
**four of those six feed the ALREADY SHIPPED kinds `$00`/`$04`**. Not cosmetic: `$242FDE` bumps
`$803917`, the cursor every other draw consumer shares, **so it desynced the RNG as well as storing
the wrong byte.**

**MY BRIEF WAS WRONG ABOUT THE UNIT'S SIZE.** `$28AFD4` holds 14 NON-ZERO entries, 12 DISTINCT
addresses, and **SIX REACHABLE** ones -- the six scripts naming `$18..$3C` have ZERO references in
the cartridge. The honest unit was THREE descriptors. **A brief's count is a hypothesis.**

**AND W428'S LESSON IS SITUATIONAL.** "Abutting is wrong" holds for a read that STRADDLES a seam.
W429 measured that here abutting is CORRECT (`$28AC72 + $41C = $28B08E` exactly, overlaps stayed
75). Both cases sit together in `tests/romwindowset.js`. **Do not apply either rule without
checking which case you are in.**

**FLAGGED BY THE WAVE, NOT BY ME:** kinds `$10` and `$14` are ported but **NOT witnessed live** --
the parent dies at frame 116 with `$4F` still on the countdown. Ported because they are the rest of
the script and would throw the moment a longer-lived parent appears.

### D52 IS CLOSED. ALL THREE COLLECT SOUNDS ACCOUNTED FOR.

Medals confirmed by the owner, bees measured (id `$1F`), **stars measured by W430 (id `$1E`, word
uniquely `$28C5E4` -- the TYPE nibble separates it from its neighbours). No defect, no code
changed.**

**W430 FOUND THE MECHANISM BEHIND THE OWNER'S OWN SENTENCE.** *"Only mid bosses leave stars"* is
right about the trigger: the midboss death arms `armScreenClear` with **mode 0**, and the free arm
allocates pool A at **kind index 0** from the BULLET's record. **The midboss does not drop stars --
every live enemy bullet BECOMES one.** A bomb arms mode `$FFFF` and makes none. Only two sites in
the port arm mode 0.

**49 collects -> 49 posts sequentially, but ONE post when all 49 land together** -- that is
`$28C5E4`'s own `debAlways` debounce, the ROM's guard, not a defect.

**UNMEASURED AND NOT FORCED:** kind index 4 is the same arm as 0, but the only site allocating it is
stage-2 type `$90` and **there is no stage-2 rung in `tools/oracle/out`.** Kind 3 likewise. **That
missing stage-2 rung blocks more than this** -- see D56, whose only clean pool-B rung is stage 1.

### W431: THE RUNGS I SAID WERE MISSING ALREADY EXISTED, AND NOBODY HAD LOOKED

I dispatched W431 saying `tools/oracle/out` had **no stage-2 rung**. **It had 92**, in the very
ladder I named -- seventeen carrying the stage-2 BOSS. **362 waves, and nobody looked.** The real
defect was that the ladder stopped a fifth of the way into the fight.

**NEW LADDER `out/w69/stage2-laser-hold`** -- 281/281 rungs, 30,000 frames, `missing: []`. Boss
arrives lf17900, phase transition lf20600 (main HP crosses `$EFC0`, all four parts die together),
**boss dies lf21600**, stage 3 lf22300. Proved USABLE: one seed runs 1,000 unbroken frames
reproducing the board's HP at every rung. **141 MB, and `out/` is gitignored.**

**D56 IS UNBLOCKED** -- a live, vulnerable, dying stage-2 boss now exists as rungs.

**AND MY DIAGNOSIS FOR POOL-A KINDS 3 AND 4 WAS WRONG:** a stage-2 rung was never what blocked
them. Two sweeps over 211 rungs see dispatch indices **0, 1, 2 and 8 only**, with types `$90`,
`$92`, `$93` all live. **The gates are SUB-STATES, not stages.** Kind 3 has TWO sites, not one.

### D63 AND D64 ARE BOTH FIXED AND PUBLISHED

**D63** -- the stage-2 boss-death crash **every player who kills that boss was hitting**. The defect
was OUR ASSERTION, not the arithmetic: it guarded bits 13..10 and **bit 10 is the sign bit of a
signed position**, not a zoom bit. A scan of all 647 board dumps found a real entry with it set.
**Masking would have been wrong in both directions.**

**D64** -- the stage-1 boss death not shaking. **ONE LINE**: a W52-era `note()` deferral for a
routine ported in W189, whose every other caller was already wired. **42 board values vs 42 port
values: MATCH 42, DIFFER 0.** All four corpus windows now match 42/42.

Found in passing by W433 and worth keeping: **the shake table's terminator test compared BOTH words
where the ROM tests X ALONE.** Harmless on this table (0 of 42 pairs have X=0) but **7 of 42 have
Y=0**, so it was one table away from mattering.

### POOL B IS 80/80 (W434), AND THE LESSON IS ABOUT HOW WE READ ROUTINES

**`finalBlast2440E0` IS UNROLLED AND ITS BLOCKS ARE NOT ALL THE SAME.** 555 instructions: 4
preamble + **39 blocks of 14** + 4 tail + **EXACTLY ONE belonging to no block** --
`$2441B4 move.b #$40,($1C,A0)`. The port read all 39 as a uniform loop and dropped it. **No table
or longword scan could find it: it is an IMMEDIATE, INSIDE CODE.**

**IF YOU READ A ROUTINE AS A LOOP, COUNT ITS INSTRUCTIONS AND PROVE THE COUNT DIVIDES EVENLY.**

It was never one slot in one ladder: toggling the store off reproduced it in **five segments across
four ladders**, including the stage-2 death, so `$2440E0`'s other caller had it too. All five are
now 80/80.

**AND THE FREED-SLOT TRAP IS STRONGER THAN ANYONE STATED:** at lf10000 the board has **39 non-blank
slots and ZERO live ones**, so the whole comparison is residue on BOTH sides.

### W435: THE STAGE-END TRANSITION IS THE BOARD'S. `PRESENTATION_DEVIATION` IS EMPTY.

lf10300->10400 went **74/80 -> 80/80**, and the port now unfreezes at **lf10334, the board's frame**
(was lf10303), matching `$8130D2` on all 300 frames of lf10201..10500.

**A `PRESENTATION_DEVIATION` STOOD TEN WAVES ON A FALSE REASON.** DEV-2 blamed an unported
presentation-tier drain. **That drain is `animobjects.js`, main-loop call #3, ported since W91 and
running every frame.** The missing thing was its INPUT. **VERIFY A STATED REASON, NOT JUST THE
CLAIM.** `PRESENTATION_DEVIATION` is now `Object.freeze({})`.

**THE WAVE REFUSED THE TEST I ASKED FOR, CORRECTLY.** I named lf10400 as the deliverable rung; the
board's pool B is **entirely EMPTY there**, so 80/80 would be satisfied by anything that wipes the
pool. **CHECK A RUNG IS LOAD-BEARING BEFORE TRUSTING IT.** The real rung is lf10500.

### W436: THE MISSING RECORDS WERE A3 SCRIPT 5'S SPARK BLOCKS

`partScriptStep` is shared by scripts 4 and 5. **Script 4 opens with a `bra.w` that JUMPS three
`$3(a4)`-gated emitter blocks; script 5 has no such branch and REACHES them**, and the port began
at the state machine. W62 said "NOTHING sets a bit of `$3(a4)`" -- **`burst2938AE` has been setting
bits 0, 1 and 2 since W107** with nothing to read them.

**THE WAVE REFUSED TO CLAIM AN UNCONDITIONAL 80/80, AND THAT IS THE MODEL TO COPY.** Kind word and
descriptor are 80/80 and the counts equal the board's, but 17 slots still differ **only at the
angle**. Forcing the cursor gives 80/80 with zero differing bytes; forcing it with the fix OFF gives
only 62/80 -- **which is what proves the poke is not doing the wave's work.**

**THE UNROLL TRAP AGAIN:** the three blocks are **13/14/14 instructions and NOT uniform**.
Implementing the first with the second's doubling leaves counts, slots, kinds and descriptors all
correct **and still turns the deliverable RED.**

### THE CRLF LIST IN EVERY EARLIER BRIEF IS WRONG. HERE IS THE MEASURED ONE.

**22 CRLF files, not 8**, counted by bytes:

    src/       bulletmath, bullets, framesync, movement, mover, spritequeue*, vectors*
    tests/     bullets, mover, w227death, w36handlers, w62stageend
    ddpdoj tools/  determinism, portdiff, shipgate, w21patterngate, w230descriptorsweep,
                   w62stageendgate*, webgate
    repo tools/    build-dist, render-frame, rendersong

**The three starred files are MIXED, and all three are UNMODIFIED in git -- the mixing is
PRE-EXISTING. Do not "fix" them.** Match whatever a file already is, checked by bytes.

### W437 CLOSED THE LAST DIVERGENCE IN lf9300..9800

**Unconditional 80/80, no cursor forcing**, every neighbour 80/80, empty draw-gap list.

**HALF THE FIX WAS A REMOVAL** -- the port called `$27F8F8` on five paths where the ROM branches to
a clear-and-return with no `jsr`. **CHECK THE PORT IS NOT DOING MORE THAN THE BOARD.**

**AND I CHASED AN ALIASED NUMBER FOR TWO WAVES.** "24 missing draws" was `addq.b`'s delta **mod
256**; the real figure is **280**. **SETTLE COUNTS ON A QUANTITY THAT CANNOT WRAP** -- the wave used
pool A going 0 -> 68, because 24 draws buys 6 fills and 6 cannot become 68.

**W436's "`$27F8F8` is ruled out" was BACKWARDS**: it matched on every frame it fired *because the
port was inventing the call* on the compared path.

### W438: THE DRIVER I SENT IT TO FIX WAS ALREADY EXACT. NO CODE CHANGED.

`$27F95A` produces **70/70 byte-identical slots** on the board's own rung, reaching the board's
count exactly. **My brief named the wrong subsystem**, and my "drains to 27 vs 32" conflated a
200-frame run with the rung.

**POOL A DOES NOT COMPUTE ITS POSITION, IT COPIES IT** -- `$280B56` is the **LONG** form and takes
the whole longword **from the carrier**, a dying enemy bullet. So **pool A is byte-perfect on
exactly the segments where the BULLET pool is, and on no other.** That is the root of what remains.

**THE FALSIFICATION SHAPE TO COPY:** overwrite one group of bytes in the port's own state with the
board's and step on. **Handing it the right answer for all 2,800 OTHER bytes moved the score by
ZERO; four bytes moved it by sixty.** That rules out a second defect anywhere else in the record --
something no amount of reading could establish.

**A WIDE BRANCH READ AS 8-BIT SILENTLY DELETES AN ARM.** `$27F984` is `6b 00 17 44`; the 8-bit
reading makes it a branch to the next instruction and the collected arm vanishes. Same shape as
W437's `bcs.W`. **Decode `.W` forms.**

### W439: THE MISSING BULLET WAS A NOTE FROM W81. 210/210.

Type `$82`'s SECOND FIRE, a counted note in `handlers.js` since **W81**. Nine kills and **zero
spawns** across the window; the log carried **exactly one** line for it. **One note, one bullet.**

**MY BRIEF SENT IT TO THE WRONG FILES.** `bullets.js` and `bulletdriver.js` are EXACT and neither
changed. **The pool was the VICTIM; the producer is a CALLER.** Look at handlers and boss scripts,
and at `unportedLog` for notes that fire in the window.

**THE EVIDENCE THAT SETTLED IT WAS OUTSIDE THE POOL:** whole-RAM divergence fell **717 -> 292
bytes** -- **425 bytes on one call, more than the 64 in the record, so no pool-local poke could
produce it.**

**A TEST WAS ASSERTING THE DEFECT.** W438's last test said "the port NEVER WRITES THIS SLOT" and
went red when it was fixed. **If a test goes red, check whether it was pinning the bug -- then
REWRITE it, do not delete it.**

**WIDE BRANCHES HAVE NOW BITTEN THREE WAVES RUNNING** (W437 `bcs.W`, W438 `bmi.W`, W439 `bra.W`).
`60 00`/`6b 00`/`65 00` read as 8-bit become a branch to the NEXT INSTRUCTION and an arm vanishes.

### W440: FOUR WIDE BRANCHES LEFT ALL THREE STAGE-1 BOSS GUNS FREE-RUNNING

    $29690A / $29610E / $29621A  bcc.W -> the rts        read as 8-bit = fall through
    $296116                      bcc.W -> NOT a return, the cadence RELOAD

**SIX SEGMENTS IMPROVED, FIVE TO 210/210.** Sweep over all 209 rung pairs: **6 improved, 203
unchanged, 0 REGRESSED.** **Pool A followed 2/70 -> 70/70 with NO pool-A code touched**, exactly as
W438 predicted.

**THE WIDE-BRANCH TRAP HAS NOW BITTEN FOUR WAVES RUNNING** -- W437 `bcs.W`, W438 `bmi.W`, W439
`bra.W`, W440 **four `bcc.W` at once**. **It is the most expensive misreading in this codebase.
Decode `.W` forms and ASSERT THE BYTES.**

**THE PORT WAS DOING MORE THAN THE BOARD** -- 128 spawns where 112 is right, and 48 of one kind
where the board fires ZERO. **Over-firing is as likely as under-firing.**

**EVIDENCE FROM OUTSIDE THE STRUCTURE IS WHAT SETTLES THESE:** the boss's script slots are NOT in
the pool and went 3/3/4 differing bytes -> 0/0/0; and only 1,793 of 4,043 differing bytes were
inside the pool at all, so **a perfect pool poke floors at 2,250 while the real result is 637 with
ZERO in the pool.**

**SIX TESTS WERE ASSERTING THE DEFECT.** All rewritten, none deleted.

### D56 IS FIXED AND LIVE. THE HYPER BEAM'S ART SHIPS.

**W442 found the cause, W443 fixed it, published as `20260819205607`.** The exporter's beam harvest
walked pair-table entries **0..4**; the hyper sits on **15..19**, all pointing at ONE block --
**block 19 of 20.** Four frames never packaged. **Bucket-16 missing records 88 -> 0.**

**IT WAS NEVER A WINDOW PROBLEM.** W226 had already declared that window and **its own comment names
the hyper strip by address.** The cause was a `harvest: 5` cutoff.

**AND THE EXPORTER'S OWN COMMENT PROMISED A LOUD THROW IF WINDOW AND HARVEST DISAGREED. THAT HAD
BEEN FALSE SINCE W226 MOVED THE WINDOW ALONE** -- so reaching the hyper's art was a **QUIET BLANK**
for 217 waves. **That is the owner's bug, and it is D66's shape exactly.**

### D66 AUDITED (W444): 430 DEFERRALS, 6 FULLY STALE, GUARD SHIPPED

**The safety net had the same bug.** `$27120A` was `ctx.unported?.unreached(...)` -- **a method
`UnportedLog` does not implement** -- so on a bare ctx it **silently no-opped and returned.**

`tests/w444deferrals.test.js` is **RED-proven seven ways** and covers **all five** bookkeeping tables
plus `INIT_UNREAD` (W425 wired one). **It states what it cannot catch**, including whether the
English is true.

**`node --test` IS CWD-SENSITIVE** -- from `games/ddpdoj/`, twelve tests fail ENOENT on a doubled
path. **Run it from the REPO ROOT.**

### D66 IS CLOSED. W445 WIRED FIVE, W446 MERGED A DUPLICATE.

**W445: FIVE stale sites, not the four I briefed** -- one routine was deferred TWICE with two
DIFFERENT false reasons. **The board settled it: `$8130BE`/`$8130C0` read 2/`$FFFF` on ALL 644
dumps and the port had 0/0 -- wrong for 445 waves.** The lives row now redraws on a loop extend
(defer records 0 -> 12).

**W446: `$25FFA8` was ported TWICE and the LIVE copy was the broken one.** It omitted a store AND
carried **`if (made.ok)` -- a guard the ROM has NO BRANCH for.** Cost: **the background froze with a
player still alive.** Merged to one copy.

**LESSONS THAT KEEP EARNING:**
- **AN INVENTED CONDITION LOOKS LIKE A PORT.** When two copies differ by a conditional, **check the
  ROM for the branch** -- the guarded one looks safer and was wrong.
- **A GREEN SUITE IS NOT THE EXPECTED OUTCOME.** W445 turned four UNRELATED tests red, all pinning
  port-only values. **The board decides.**
- **BLINDING A WITNESS CAN LEAVE A SECTION GREEN** -- W446 proved this, which is why a second
  section reads the actual field.

### NEXT UNIT: 24 ROM ADDRESSES PORTED MORE THAN ONCE -- IN PROGRESS (W447)

Pinned as an exact register in `w444deferrals.test.js` SECTION 2b so a 25th goes red.
**`$246800` and `$246710` are each claimed by THREE exports.** W446 audited exactly one of the 24.

**Merge only what is provably safe; "legitimately distinct" is a real answer.**

### SUPERSEDED: THE FOUR STALE DEFERRALS (W445)

`$2878CC`/`$28795C` (**live path -- the lives row is not redrawn on a loop extend**), `$27F87C`,
`$2603DA`, `$24A810`. **Wiring one WILL turn W444's guard red. That is the guard working -- update
the register, do not weaken it.**

### SUPERSEDED: THE LAST TWO (W441)

`lf9100->9200` stops at **176/210**, and W440 measured it as **two independent defects, neither its
own**:
1. **a missing laser beam-impact spark** on two ticks -- and **handing the port those 8 draws
   changes the bullet count by ZERO** (performed, not argued), so it is a draw-cursor defect;
2. **an UNDER-FREE** -- the port spawns the board's 42 records and **frees 8 where the board frees
   16**. `mover.js` / `boundsKill`.

### SUPERSEDED: THE LAST BULLET DIVERGENCE (W440)

    lf9300->9400   bullets 111/210   <- worst, and the one being taken
    lf9400->9500   bullets 113/210
    lf9500->9600   bullets 149/210   pool A 2/70
    lf9600->9800   bullets 210/210   pool A 70/70

**W438 proved pool A is byte-perfect on exactly the segments where the bullet pool is**, so closing
the bullets should carry pool A's 2/70 with it.

### SUPERSEDED: ONE BULLET SLOT NEVER WRITTEN (W439)

**`lf4025 -> 4050`: 209/210 bullets identical, zero draw-gap frames.** Slot 3: the board holds a
live kind-7 bank-A bullet; **the port's slot 3 is byte-identical to the SEED for all 25 frames --
never written -- and it costs NO RNG draw.**

### SUPERSEDED: POOL A's POSITION DRIVER (W438)

Pool A's allocation is now exact (68/68, status 62/70) but **only 2 of 70 slots are byte-identical**,
differing at `+$02..+$05` on 65-68 of them. At lf9700 the port drains to 27 where the board holds 32.

### SUPERSEDED: 24 MISSING RNG DRAWS (W437)

`$242B3C` indexes with `$803916`. Over lf9501..9600 the port matches the board on **97 of 100
frames** and is short on three: **lf9556 by 24** (the `$294DD4` frame), lf9562 and lf9592 by 1.

**Already ruled out by W436, do not redo:** the 24 draws produce no pool-B/C/D record, move no
`CLAIMED` column, and `$27F8F8` is excluded (fires on 37 frames, RNG matches on every one).

**`oracle/c1_*.py` ARE TRACKED** and unmodified -- the session-start snapshot is stale. Leave them
alone regardless; they are not ours.

### SUPERSEDED: THREE LIVE RECORDS THE PORT NEVER SPAWNS (W436)

`stage1-laser-hold` lf9500->9600, **60/80**, and **the only red 100-frame segment in
lf9300..10700** -- its four neighbours are 80/80 INCLUDING live records.

    board  33 live / 43 non-blank / count $22
    port   30 live / 35 non-blank / count $1F

**A spawn-count divergence**, not field arithmetic: three allocations that never happen, with
everything downstream shifted by allocation order.

### SUPERSEDED: TWO PRE-EXISTING POOL-B REDS (W435)

Both measured identical with W434's fix on and off, so they are independent of it:

    stage1-laser-hold  lf9500->9600    60/80   multi-byte, +$02..$05 position, +$34..$37 velocity
    stage1-laser-hold  lf10300->10400  74/80   six slots the PORT KEEPS ALIVE that the BOARD FREED

### SUPERSEDED: THE LAST POOL-B RESIDUE BYTE (W434)

W433 took pool-B byte-identical slots from **37/80 to 79/80** at lf10000. One remains: `+$1C` of a
FREED slot 2, `$40` board / `$00` port. `$289004` zeroes it, **so a LIVE-RECORD writer sets it.**
**Do NOT force the byte** -- "unreachable, and 79/80 is already correct" is a legitimate answer.

### WHEN CLAIMING SOMETHING HAS NO CALLER, SCAN PC-RELATIVE TOO

W433 proved this the hard way: **`$260EC8` is reachable ONLY PC-relative**, so a longword scan alone
would have declared a LIVE driver dead. Scan `Bcc`/`bsr`/`jsr`/`jmp (d16,PC)`/`lea (d16,PC)`/
`pea (d16,PC)` at every even address, **and run a POSITIVE CONTROL on a routine you know is live.**

### SUPERSEDED: D63 WAS IN PROGRESS (W432)

`$23D6AC` throws at **lf21826**, 226 frames after the boss dies, pool B at 40 records. **A HARD
STOP, the same class as D60**, and **every player who kills the stage-2 boss reaches it.** It
survived only because no ladder had ever covered a boss death.

### PUBLISHED: build `20260819075340`, confirmed live 2026-08-19

W432 was the fifth wave since W427, so this was the standing cadence. `export-web.mjs` ran BEFORE
`publish.mjs`. **The owner gets the stage-2 boss-death crash fix (D63)** plus W428/W429's cue work.
**NEXT PUBLISH FALLS AT W437.**

### SUPERSEDED: PUBLISH WAS DUE AT W432

Last publish W427 (`20260819013654`). **W428 and W429 both added ROM windows (606 -> 612), so
`export-web.mjs` MUST run before `publish.mjs`.**

### AFTER THAT: OPEN

Candidates, none started:
- **stars' collect sound** -- bees and medals confirmed, stars NOT. **Do NOT re-kind a record and do
  NOT use `allocBee27F92A`** (it refuses non-bee kinds); go via the `$280BCE`/`$280DBA` pool-A
  allocator, or kill a mid-boss.
- **the remaining cue kinds** -- `$18..$4C` throw with two distinct reasons, both correct today.
- the front-end screens D33/D34/D35/D37; the 161 unported enemy types.
**D36 WHITE LABEL STAYS LAST.**

5 of 363 rungs (`c003600`/`c003625`/`c003650`) arrive from the oracle with a **kind-`$C`** cue
already live at frame 0. Descriptor `$28B08E` (flags `$800C`), dispatch entry 3. **`$28AFD4` holds
14 live descriptors and `cues.js` covers 3.** Much bigger than what W428 fixed.

### THE PATTERN THAT HAS NOW COST SEVEN ITEMS

D42, D52, D56, D59, D60 and W412 all turned on the same thing: **a zero measured over benches that
never enter the state is a fact about the BENCH.** Five waves running have now corrected their own
brief. **Write briefs that invite the correction, and read it.**

### NEXT UNIT

Open. Candidates, none started: **stars' collect sound** (bees and medals confirmed, stars are
NOT -- and do NOT re-kind a record, that was tried and is invalid); **`$27399E`** (blocks two
checkpoint rungs); the front-end screens D33/D34/D35/D37; the 161 unported enemy types. **D36
WHITE LABEL STAYS LAST.**

It calls `ctx.soundPost?.(0x28c186)` and still throws. `$28C186` takes D1 FROM THE CALLER, so it
cannot go through the address-only API -- **and that is not pedantry**: `background.js`'s cue
sub-op 2 reads a real D1 word out of the stage script, so an address-only path would post `$1600`
for every caller. The unit is a ctx-level D1-carrying API plus that one site. Its own D1 is 0,
verified (`$291FA6: 2b40 0008 / 7200 / 4eb9 0028c186`).

### PUBLISH AT W427 -- AND W425 ADDED A ROM WINDOW

606 -> 607. `export-web.mjs` MUST run before `publish.mjs`.

### STILL OPEN, WITH LEADS WORTH READING BEFORE TOUCHING THEM

**D59 (bees)** -- there are TWO position gates on the carrier, in unrelated routines: `$245248`
(position >= `$6F00` unsigned -> flickers, NO damage) and `$280B2A` (spawn off-screen -> dies,
drops NOTHING). Between them they reproduce the owner's sentence exactly. **One wrong position
explains all three symptoms.** Both gates are faithful, so the question is whether the port puts
the carrier somewhere the cartridge does not. Print `($2,A5)` and `($2,A6)`.

**D56 (hyper laser)** -- bomb-while-lasering selects the BOMB-LASER, so the weapon is damaged by
`$2456A6`, which flashes **exactly one enemy per frame** (pool B's nearest). **Both guards into it
are FALSE on every bench here**, so not one line of it has ever run in a test. **The unit is a
bench before it is a fix.**



Convert the five `$28C170` sites from counted notes into real posts. `postBgmCommand` and
`BGM_COMMANDS` already exist in `sound.js` with ten tests. **Only `$28C170` may go through
`ctx.soundPost`** -- it sets both D0 and D1 itself; `$28C186` takes D1 from the caller and must keep
the explicit form. **There is NO GATE on this path.** Twelve test files assert these notes and each
assertion must be REWRITTEN to say the opposite, not deleted (the W420 mistake).

### D55 IS DONE: FULLSCREEN NOW USES THE SCREEN

The button existed since W268; it just did not use the screen. `fill` is opt-in, passed only while
fullscreen, and **still floors below 2x** so the tetris-pieces defect keeps its range. Area
recovered: +10.8% to +73.1% across twelve device-and-orientation pairs.



The owner hit **`$286AAA IS NOT PORTED YET`** in the live build. The port refused rather than
inventing frames, which is right, but the run ends. **It outranks everything else in the docket.**

Their reproduction, exact: **stage-2 boss, `c` (laser) HELD, `y` (bomb) pressed on top of it, at
the instant the fight starts.**

**DO NOT REDO THE RECON. It is in `docs/DOCKET.md` under D60 and the bytes are swept.** All three
gates are open in that scenario:

1. `$8130F8` bit 2 -- **set by this port already**, at boss arrival. `bset #2,$8130F8` exists at
   exactly six ROM sites, each preceded by `bset #0`; `initbody.js:1161`, `:1226`, `:1256` write
   that pair as `| 0x05`. Hence "just when fight was about to start".
2. `$811F72`'s sign -- the **bomb-laser's** record, selected only by `$24989E bset #$0,($1,A6)`
   inside the bomb. Bomb-while-lasering IS that instruction.
3. the hit -- the stage-2 boss supplies it.

**THE LESSON, AND IT HAS NOW COST FOUR ITEMS.** `score.js` said this arm was "two independent gates
away from reachable" on the strength of 600 frames in which the beam was held with no boss and no
bomb. **It measured the bench.** A zero collected over runs that never enter the state says nothing
about the state. That note is corrected in place (D60 block in `score.js`) -- read it before you
trust any other "never observed" claim in this repo. The owner said it first and plainly:
*"hyper has been fucked for a long time and you keep saying you found it"*.

**Unit: port `$286AAA`, `$286A82`'s shared tail, and `$2867B4`.** The bench is fully determined:
bit 2 up, bomb-laser selected so `$811F72` is live and NEGATIVE, then post a hit. **If the bench
does not reach `$286AAA`, the bench is wrong, not the game.**

**Check D56, D59 and D43 against this before spending a wave on any of them.** All three involve
the same weapon or the same beam muzzle, and this may be their common cause.

## W423 -- D54 IS FIXED, AND THE FIX WAS NOT WHERE THE DOCKET SAID

**THE OWNER'S OWN NUMBER DISPROVED MY ANALYSIS, and that is the lesson worth keeping.** I had
blamed the game-side sound ring for the lag. The ring is 100 slots drained ONE PER FRAME, so
1.67 s is its arithmetic ceiling. The owner measured **five seconds**. A number that cannot fit
in the thing you blamed is a proof, not a discrepancy -- so a second queue had to exist.

**It did, and it is not in `games/ddpdoj/` at all** -- which is why my first grep found nothing.
It is `chip.outLen` in `shared/audio.js`, backed by `ics2115.js:220 _ensureOut`, which **doubles
its Float32Array forever with no ceiling**.

**WHY THE EXISTING VALVE DID NOT COVER IT.** `MAX_BACKLOG_FRAMES = 15` caps how many logic frames
ONE pump may turn into samples. 15 frames is 250 ms of audio, produced during the 16.7 ms of real
time one rAF costs. So a valve working exactly as designed still leaves ~233 ms of undrained
samples behind on every catch-up burst, permanently. **It bounds the growth rate; nothing bounded
the buffer.** That is also why "I switched window focus a lot" made it worse each time -- every
hide/show is one more burst.

MEASURED, 30-frame bursts, before and after `MAX_BUFFERED_S = 0.25`:

    bursts     before      after
      1        0.153 s     0.153 s
      5        1.099 s     0.219 s
     10        2.268 s     0.221 s
     20        4.605 s     0.226 s        <- the owner's "about 5 seconds"
     40        9.280 s     0.234 s

Steady 60 Hz play is untouched: 0.016 s buffered, `stale = 0`, `dropped = 0` over 600 frames.

**THE OWNER'S DECISION WAS "CATCH UP THE BACKLOG, KEEP EVERY CUE", AND THE FIX HONOURS IT.** The
trim discards *rendered samples*, never a `frame()` call, so every cue still reaches the chip and
chip state cannot diverge from the driver. A test asserts exactly that (all 1,240 posted frames
applied). Dropping cues instead would leave notes that never stop.

Six tests in `shared/audio.test.js` section 5. **Three of them were proven to FAIL with the trim
call commented out** (19, 21, 23); the other three are guards that must hold under both readings.

**D57 IS FIXED TOO -- see below.** It was the same family, not the same line. The owner's stuck looping sound also
followed a tab-away. 

## W423 -- D57 AND D58, THE REST OF THE AUDIO CLUSTER

**D57 IS FIXED. THE ASYMMETRY WAS THE WHOLE FINDING.** `input.js:246` wires `blur`, `pagehide`
AND `visibilitychange` and clears the entire button mask, because a key held when focus is lost
never sends its keyup. **Audio had the identical hole and no backstop at all** -- a search of
`games/ddpdoj/src/web/` found no audio listener for any of the three. That is both halves of the
owner's report: a sound that "kept looping and it never goes away" after tabbing back, and level 2
running seconds behind after switching focus repeatedly.

`AudioController.resync()` drops the pending queue, the rendered samples on both sides of the
resampler, and disarms the scheduling clock so the next pump re-arms at NOW. Wired on all three
events, both edges, to the target and to `globalThis` (a canvas target never sees
`visibilitychange`, which fires at `document`).

**THE CHIP IS DELIBERATELY NOT RESET.** Voices and envelopes are the game's state; zeroing them
would silence music the driver still believes is playing and nothing would restart it -- a
stuck-silent bug traded for a stuck-looping one. A test pins it.

**RULED OUT, DO NOT RE-CHECK: the backlog valve does not lose cues.** `ics2115.frame` calls
`applyLog(log)` unconditionally, before `emit` is consulted, so even a fully dropped batch applies
every register write. A lost note-off was the obvious explanation for the stuck loop and it is not
the explanation.

**D58 IS HALF DONE AND THE SECOND HALF IS SPECIFIED.** `sound.js` had ONE posting path, for
`$28BB04`, whose `WRAPPERS` rows all set three immediates. `$28C170` sets two registers and reaches
**`$28BBAC`**, which packs `((D0<<8|D1) & $FFFF) << 16` with a ZERO low word -- no id, no channel,
no gate, no pan tail. A `WRAPPERS` row would invent three fields the cartridge never loads, which
is why `postWrapper` threw instead. **That one gap silenced five sites**, which is why the owner
was right that other levels are affected too: these are not per-level cues.

`postBgmCommand` now exists and is tested (10/10). **STEP 2 IS CONVERTING THE FIVE `note()` CALLS:**

    boss.js:1238      $242922  the BOSS-CLEAR cue          <-- the owner's report
    boss.js:1326      $2A6D8C  the ENDING block's cue
    objslot13.js:333  $288A3C  slot 13 state 4, GAME OVER
    hibachi2.js:169   $2A7008
    background.js:1203  the scroll VM's CUE op

**THE TRAP, and it is in the tests: there is NO GATE on this path.** `$28BBAC` branches straight to
`$28BAA0`. Sending these through the SFX or BGM gate would silence a boss clear whenever the gate
was down -- the defect, reintroduced one layer lower.

**AND ONE HONEST CAVEAT.** The owner said "explosion"; what is proven silent is the boss-CLEAR
cue. Whether the explosion SFX is this cue or a separate one is NOT established. **Confirm which
cue is missing before closing D58** -- closing an item on a bench that never exercised the reported
thing is exactly the D56 mistake.

## THE HALF-HOURLY ALARM CARRIES **TWO** STALE INSTRUCTIONS. BOTH ARE ANSWERED HERE.

**1. "Publish is due at W375 -- run export-web.mjs BEFORE publish.mjs, because W374 added 33 ROM
windows."** The W375 part is long gone. **The cadence is every FIFTH wave and the last publish was
W427**, live as `20260819013654`, so **the next falls at W432**. The rest of that sentence is still
RIGHT and must be obeyed: **`export-web.mjs` runs BEFORE `publish.mjs`**, because a wave once
shipped stale assets and the owner had to hard-reload to see a fix. W428 added four ROM windows
(607 -> 611), so it applies at W432.

**2. The front-end slots -- already done, see below.**

**Do not spend a wave on either. If the alarm still says these next session, that is the ALARM
being stale, not the work being undone.**

## THE STANDING "WIRE THE FRONT-END SLOTS" INSTRUCTION IS ALREADY DONE

The half-hourly alarm still says *"Wire the front-end slots (7, 9, 13, 15, 17) into main.js's
defaultHandlers -- the owner explicitly authorised this. Whoever wires objSlot17 MUST set
ctx.selectDraws."* **All five are wired and slot 17 does set it.** Verified 2026-08-18:

    main.js:237  [7,  slotObject(objSlot7, rom)]
    main.js:258  [9,  slotObject(slot9.objSlot9, rom)]
    main.js:275  [13, slotObject(objSlot13, rom)]
    main.js:287  [15, slotObject(objSlot15, rom)]
    main.js:293  [17, ...]  ->  ctx.selectDraws ??= slot9

Slot 17 uses `??=` deliberately so a caller supplying its own set still wins, and the comment above
it explains why `ctx` is seeded in place rather than replaced per frame.

**This is D47's drift, in the alarm text rather than in a doc.** Do not spend a wave on it. If the
alarm still says this next session, that is the alarm being stale, not the work being undone.

## START HERE -- W421 (docket D53, the staleness weapon)

### IT WAS NOT A RACE. IT WAS EVERY DEPLOY, AND IT LATCHED.

The coordinator's docket called this a race that would "pass most of the time". **Wrong.** It was
the guaranteed outcome of every deploy for anyone who had visited before, and the split was
measured: **1 file from the new build, 118 from the old.**

    1. the OLD worker is still the controller -- the PAGE is what registers the new one
    2. the navigation is network-first, so the browser gets the NEW index.html
    3. that HTML asks for the SAME module URLs as yesterday
    4. the old worker answers them cache-first out of the previous build's cache

**AND IT LATCHES, which is why only Ctrl-Shift-R cleared it.**
`navigator.serviceWorker.register()` sits at the bottom of the page's inline module, **below its
imports**. A stale module throws, the module body never runs, the new worker is never registered,
and the old one keeps answering for every ordinary reload -- indefinitely. A hard reload bypasses
the worker, the page runs, registration finally happens, and the site "fixes itself".

### THE FIX CHANGES THE URL, NOT THE POLICY

The module tree ships under `src-<buildId>/`, so a previous cache has **never heard of the request**
and physically cannot answer. Relative imports inside the tree need no rewriting -- they resolve
against whatever directory their importer came from. Two consecutive builds confirmed different
paths, and the old bare `src/` directory is gone.

**`?v=BUILD` WOULD HAVE SILENTLY FAILED, and the docket suggested it.** The shipped worker matches
with **`ignoreSearch: true`**, so it strips the query and the stale entry hits anyway. The fix had
to change the PATH. That is pinned in the test so nobody retries it.

### BATMAN AND GRADIUS DO NOT HAVE THE HOLE

Only a game with a cache-first worker does. They have none, and the fix is gated on `sw.js`
existing, so their URLs are untouched. The test asserts that too -- silently changing them would be
scope the owner did not ask for.

### THE AGENT DIED BEFORE THE TEST, AND THE TEST IS THE POINT

It terminated on a connection loss with the message "The proof holds. Now the committed regression
test." The coordinator wrote it, and then did the thing that makes it worth having: **ran it against
the UNFIXED build, where 5 of its 6 checks fail.** A check that cannot fail is not a check -- this
project has now been bitten five separate ways by tests that passed for the wrong reason.

### AND IT HAD REWRITTEN 555 LINES OF LINE ENDINGS

`tools/build-dist.mjs` is CRLF on HEAD; the agent rewrote the whole file to LF, turning a **27-line**
change into a 1,137-line diff that would have buried the real edit in history and in blame.
Restored to CRLF; the diff is 27 insertions. **Match the file you are editing.** `webgate.mjs` has
the same trap and W417 hit it too.

### VERIFIED

Suite, gate and window verify run by the coordinator on the committed tree; figures in the commit.
`dist/` is generated -- the change is in the GENERATOR (`tools/build-dist.mjs` plus new
`tools/shellversion.mjs`), never in the output.

### NEXT

**D54**, sound lagging about a second: the one question that splits the causes is whether the delay
GROWS during heavy play or stays fixed. **Ask the owner before spending a wave.** Then the front-end
slot wiring, and D36.

## START HERE -- W420 (coordinator-ported)

### FOUR DISPATCHES DIED TO SERVER ERRORS, SO THE COORDINATOR DID IT INLINE

Three agents at this unit terminated on API errors (one mid-response after recon, two 529s), each
leaving the tree clean. The recon was banked after the second; after the third the coordinator
ported the unit and wrote its test inline. **The lesson is procedural: when a unit is small and the
recon is already banked, a fourth dispatch is worse than doing it.** Verify the work, not the author.

### A4 SCRIPT $14 IS SIX INSTRUCTIONS

    $2A6B7A  39 7c 00 80 00 02   move.w #$80,($2,A4)
    $2A6B80  53 6c 00 02         subq.w #1,($2,A4)
    $2A6B84  66 00 00 0a         bne.w -> $2A6B90    ext word $2A6B86 + $0A
    $2A6B88  4e b9 00 25 95 e8   jsr $2595E8
    $2A6B8E  42 54               clr.w (A4)          TRAP: 4254 is clr.w (A4)
    $2A6B90  4e 75               rts

Wait 128 frames, suspend the stage, free the slot on the same frame.

### THE `$1A` WAS `$18` OF CODE PLUS TWO BYTES OF ALIGNMENT -- A THIRD SHAPE

W418's gap held the unit's own tables; W419's held the next unit's data; **this one is padding**,
because `$2A6B94` is `bossBody2A6B94`, ported long ago. Three shapes now. **The gap size is not a
signal, and neither is its content.**

**Entry-to-entry cannot bound this one at all**: `$14` is the LAST table entry. Index 21 reads
`$70004EB9` -- `moveq #0,D0 / jsr`, code not a pointer -- and `table + 21*8` equals entry [0].init
exactly, which is W403's own witness that the table ends where its first script begins.

### THE TWO ENDINGS ARE NOT VARIANTS OF ONE ROUTINE

A scan for `moveq #$14` before `jsr`/`jmp $25980C` over `$2A0000..$2AB000` finds **exactly one**
starter, `$2A5CB4`, script 1's first-loop arm.

| | A4 `$14` (first loop) | A4 script 5 (second loop, W409) |
|---|---|---|
| code | **`$18`, six instructions** | **`$270`, five-state machine** |
| does | wait 128, suspend, free | 16 spawns, blast, three ramps, chain, position push, THEN suspend |

**The cartridge gives loop one a bare beat and saves the finale for loop two.** A wave assuming
symmetry would have hunted for structure that is not there.

### THE TEST DIRTIES THE SLOT, AND THAT IS WHAT MAKES IT WORTH ANYTHING

Four ablations, all red, control and restore green:

| ablation | result |
|---|---|
| beat `$80` -> `$40` | 4 fail |
| store one frame early | 2 fail |
| slot not freed | 1 fail |
| **init ORs instead of stores** | **2 fail** |

That last one **passes on a fresh `Ram()`** -- `0 | $80` is `$80`. It only reddens because SECTION 6
seeds the field with `$0001 $007F $0081 $FFFF $8000` first. **That trap has now caught W417, W418
and W419.** Where a field can carry a previous tenant's value, dirty it before asserting.

### VERIFIED

Suite, gate and window verify all run by the coordinator on the committed tree. Figures in the
commit message are the measured ones.

## RECON BANKED -- A4 SCRIPT $14, THE FIRST-LOOP ENDING (coordinator, 2026-08-18)

Two dispatches at this unit died to server errors (one mid-response after recon, one 529 at
startup), both leaving the tree clean. Rather than spend a third on re-deriving, the coordinator did
the recon inline. **It is banked here so the porting attempt starts from it.**

### THE WHOLE UNIT IS SIX INSTRUCTIONS

    $2A6B7A  39 7c 00 80 00 02   move.w #$80,($2,A4)    init: load 128
    $2A6B80  53 6c 00 02         subq.w #1,($2,A4)      step: count down
    $2A6B84  66 00 00 0a         bne.w  -> $2A6B90      ext word $2A6B86 + $0A
    $2A6B88  4e b9 00 25 95 e8   jsr $2595E8            THE ENDING STORE
    $2A6B8E  42 54               clr.w (A4)             free the slot -- TRAP: 4254 is clr.w (A4)
    $2A6B90  4e 75               rts

Wait 128 frames, suspend the stage, free the slot. That is all it does.

### THE `$1A` FIGURE IS A THIRD VARIANT OF THE ENTRY-TO-ENTRY STORY

**Code is `$18`** (`$2A6B7A..$2A6B91`). `$2A6B92..$2A6B93` is two bytes of padding, and **`$2A6B94`
is `bossBody2A6B94`, a different unit already ported** (`claimed.py`: 13 mentions, 4 in code). So
`$1A` = `$18` code + 2 padding. Not the next unit's data (W419), not the unit's own tables (W418) --
**alignment**. Three shapes now; the gap still is not a signal.

**Entry-to-entry cannot bound this one at all**: `$14` is the LAST table entry. Index 21 reads
`$70004EB9`, which is `moveq #0,D0 / jsr` -- code, not a pointer -- confirming W403's "the table ends
where its own first script begins".

### THE TWO ENDINGS ARE NOT THE SAME JOB, AND THAT ANSWERS THE OPEN QUESTION

| | A4 `$14` (first loop) | A4 script 5 (second loop, W409) |
|---|---|---|
| code | **`$18`, six instructions** | **`$270`, five-state machine** |
| does | wait 128, suspend, free | 16 spawns, `$28B34A` blast, three ramps, `$246410` chain, `($2,A6) += $1400` push, THEN suspend |

**Exactly ONE starter**, from a scan of `$2A0000..$2AB000` for `moveq #$14` followed by
`jsr`/`jmp $25980C`: **`$2A5CB4`**, which is script 1's first-loop arm, as the handoff said.

So the cartridge gives the first loop a bare 128-frame beat before the stage ends, and saves the
whole finale for the second. **A wave that assumed the two arms were variants of one routine would
have gone looking for structure that is not there.**

### WHAT IS LEFT FOR THE PORTER

The body is trivial. The work is the test: read the slot's `($2,A4)` back across the 128 frames, and
prove the `$2595E8` store fires on the frame the counter hits zero and not before. **Dirty `($2,A4)`
before the init** -- a recycled slot carries the previous tenant's word, which is the trap that has
now bitten three waves (W417, W418, W419).

## START HERE -- W419

### MY BRIEF NAMED THE WRONG KINDS, AND ACTING ON IT WOULD HAVE SHIPPED DEAD RECORDS

I wrote that `$289DEA` has real entries for kinds **0, 8, `$C` and `$10`**. Coordinator read the
table directly:

    +$00 kind  0 -> $289E0A      +$10 kind 16 -> $289E7A  <-- repeated
    +$04 kind  4 -> $289E26      +$14 kind 20 -> $289E7A  <-- repeated
    +$08 kind  8 -> $289E42      +$18 kind 24 -> $289E7A  <-- repeated
    +$0C kind 12 -> $289E5E      +$1C kind 28 -> $289E7A  <-- repeated

**Wrong twice.** Kind **4** is one of the four real entries (it is the already-ported one, and
leaving it out reads as if it were not in the table). Kind **`$10` is NOT real** -- `+$10..+$1C` are
four copies of one pointer, and the word at `$289E7A` is `$0022`, **bit 15 CLEAR**, so a record
filled from it is born dead and the driver never steps it. Guard is now `(kind & $3C) > $0C`.

The caller side agrees: `$267F4E cmpi.w #$3,D0 / bgt` and `$267F56 tst.w D0 / bmi` both land past
the `jsr`, and a whole-image scan finds **eight** call sites passing only 0, 4, 8 and `$C`.

### A REPORT WHOSE CONCLUSION WAS RIGHT AND WHOSE REASON WAS WRONG

The agent justified `$289E7A` as "`$289E0A + $10`, the kind-0 template's own list 0". **That
arithmetic gives `$289E1A`.** The templates are `$1C` each and adjacent, so `$289E5E + $1C =
$289E7A`: it is simply **the first byte past the four templates**. The conclusion holds and the
stated reason does not.

**That is W418's fifth lie-shape ("stated reason false, assertion true") appearing in a REPORT
rather than a test.** Check reasons, not just conclusions -- including mine and including a
subagent's.

### THE UNIT WAS NOT ONE FILE, AND THE OLD WINDOW ENDED ON THE EXACT LONG NEEDED

Opening the guard alone throws `longword at $289EDA is outside every ROM window` one instruction
later, because W194's `$289B50 + $38A` **ends exactly at `$289EDA`** -- the long kind 8's list 0
starts at. New window `$289EDA + $60`, 605 -> **606**, bounded three ways, and its end `$289F3A` is
`41F9 0081D394 lea`, the first instruction of pool E's clear, ported since W53 as a different unit
that already owns it.

### THE ART WAS 36 STREAMS, NOT 24

W415 counted kinds 8 and `$C` and missed kind 0's twelve, equally absent and equally inside the
domain the guard now accepts. Families are 12/8/12/12 (kind 4's list 2 duplicates list 1). Before:
kind 4 had its 8, kinds 0/8/`$C` had **zero**. After: all 36 present, every stream's `maskWords`
equal to its family's need exactly.

**`streamCount` 4307 -> 4343**, shard 9 only: streams 277 -> 313, `maskLen` +7,752, and
`spr.maskUsed` grew by that **same** 7,752, so nothing outside shard 9 moved. Shard 11 held exactly.

Gate shard-9 row: **records 16,746, distinct 212, first 24, 16,746 DRAWN of 16,746, 0 pending, 0
with no art ALL HELD**; only `streams` moved.

### TYPE $8E'S DEATH, TRACED RATHER THAN ASSERTED

Before: threw, count 0 -> 0, no spawn. After, six frames of state: the record cycles kind 8's list 0
in the cartridge's **descending** cursor order (4, 0, `$C`, 8, 4, 0), reaches the display list, and
`portSpriteList` **draws** it every frame against the shipped bundle -- `skipped` 0, `missing` empty.

The agent explicitly declined to claim boot progress from a green playgate, per W418. **Copy that.**

### 37 ABLATIONS, 3 GREEN, 1 INVALID -- AND THE INVALID ONE IS INSTRUCTIVE

The replacement mutation ALSO went green, because **`$278320` is a byte-identical second run of the
same six words**, so no fixture can separate the two sites. Pinned instead against `$276642 lea
(d16,PC),A0`'s displacement, with the byte-identity asserted as the reason. **When two sites are
byte-identical, no test can tell them apart -- pin the thing that differs.**

Four exporter mutations were caught by the exporters themselves rather than by tests.

### A NEW MEASUREMENT TRAP

`spr/streams.u32.gz` first-differences **planes 0 AND 1**. Reading plane 1 without accumulating
gives every stream a base of a few hundred, files them all under shard 0, and makes a shard
assertion **say nothing while passing**. It cost a reading; the decode is now commented in the test.

### KIND 5 IS OUT OF SCOPE AND WHY

Kind 5 is **pool A** (`DISPATCH[5] = $27FF9A`, unported), not pool C. It will need all eight of
`$1E24DC..$1E2648` stride `$34`, all still absent, **plus** the body.

### VERIFIED

Suite **3851 pass / 0 fail / 0 skipped** (3837 before; +14). Gate **exit 0**. `--verify` **OK at
606 windows**. `export-web.mjs` run BEFORE the gate.

**COUNT DISCREPANCY, RECORDED NOT SMOOTHED.** The agent reported **3866**. On the committed tree,
with its new test file present, the coordinator measures **3851** -- fifteen fewer. Zero fail and
zero skip both ways, and the gate and window verify agree, so the tree is green either way. The
committed number is the measured one. If a future wave finds fifteen tests that only run under
some other condition, that is the explanation and it should be written down.

### NEXT

A4 `$14` for the ending's other arm; kind 5 (body + eight streams); the front-end slot wiring; D36.

## W418 NOTES

### A GREEN PLAYGATE MEANT THE GAME WAS STUCK. READ THIS BEFORE YOU TRUST A RUN.

Between porting entry 3 and repairing `objslot13.js`, **all six holds ran 30,000 frames with no
throw -- because the game could never leave the continue screen.** `mark` sat at 9 for all 1,337
recorded state changes and the cue never fired.

**"How far does a boot get" needs a STATE TRACE, not an absence of throws.** An absence of throws is
equally consistent with progress and with a stall, and this project has now produced both.

### THE DEFECT WAS IN A DIFFERENT FILE, AND THE LINE HAD NEVER RUN

`objslot13.js menuArm` opened with `if (!ctx.menuCarry28D53C?.(ram)) return;` and **nothing anywhere
in the tree assigns `ctx.menuCarry28D53C`** -- coordinator verified against HEAD. `undefined` ->
`!undefined` -> return, so `$288B0A..$288BAC` has been dead since **W373**. Two faults on one line:
the missing ctx key, and the SENSE -- `$288B06` is `65` = `bcs`, carry SET means busy means abandon.

`$288B14 beq` and `$288B1E bcc` branch to `$288B3C`/`$288B36`; they are **not returns**. That is
where the nine seconds live. After the repair: 9 -> 0 at exactly 61 frames a step, then the borrow.

### FIVE OF SIX HOLDS NOW REACH THE ATTRACT LOOP, AND THE STOP IS A CARTRIDGE PARK

| hold | panel opens | times out | type $E | type $C | attract |
|---|---|---|---|---|---|
| shot | f9671 | f10281 | f10282 | f10616 | **f10620** |
| auto | f11284 | f11894 | f11895 | f12229 | **f12233** |
| none | f18800 | f19409 | f19410 | f19744 | **f19748** |

Next stop is **not a port stop**: type `$8` recycling with the object table empty and `$813092` back
to 0. `$288B4E 6C 00 00 26 bge` falls through, `$288B62 move.b #$4,($2,A5)`, `$288B68 bra $288A3C`,
whose `$288A4E jsr $24107C` wipes all 20 slots.

### THE FOUR JUMP-TABLE ENTRIES ARE ONE PANEL, NOT FOUR PEERS

Entry 1's `$288652 bcs $28872A` jumps **INTO** entry 2 past its state test. All four are written by
`objslot13.js`, ported since W373. New `src/continuescreen.js`.

Entry 3 itself was correct in about 40 lines. **My brief framed it as the unit and was wrong**; its
own sentence "the defect may not be where the address points" was the useful part.

### ENTRY-TO-ENTRY OVERSHOT FOR TWO ENTRIES AND WAS EXACT FOR TWO

`$28864C` `$B0` code + `$20` data; `$28871C` `$42` **exact**; `$28875E` `$10C` code + `$E8` data
(entry-to-entry `$1F4`, overshooting by 232 -- 46%); `$288952` `$38` **exact**. **The gap size is
not a signal.** And here the trailing bytes were this unit's OWN tables, not the next unit's.

`$2888AE`'s eighteenth long **exists and is unreachable** -- `$2887EE cmpi.w #$44` caps the offset,
so the window is `$44`, not the `$48` a stride walk gives.

### THE ART WAS COMPLETELY ABSENT AND THE ARITHMETIC PROVES IT

`tx.tileno` held **260** tiles; the panel needs **2,328**. After the fix: **2,588 = 260 + 2,328
exactly**, so all 2,328 were missing and none collided. This is **TX tilemap art, not sprite
streams** -- no shard row moved and `streamCount` did not change.

**A measurement trap:** the agent's first read of `tx.tileno.u16.gz` was big-endian and produced
garbage. It is host little-endian.

### A TEST WHOSE STATED REASON WAS FALSE, FOR 45 WAVES

`w375ctxkeys.test.js`'s inventory said "`$28D53C`. Not ported." It has been ported since **W278**;
`tallyscreen.js` exports it and two files call it. **An inventory built to make silent gaps visible
made one invisible.**

Add this to the family: not only "a test that passes under both readings" (W416) and "a test
defending a wrong reading" (W411), but **"a test whose stated REASON is false while its assertion
happens to hold"**.

### 51 ABLATIONS, 3 GREEN, 1 INVALID

All three greens were fresh-`Ram` artefacts or single-input tests: a clear invisible because both
fields start 0 (**W417's trap for the third time**), a side-choice tested on one side only, and a
credit arm short-circuited by the coin arm. One mutation matched two sites and was replaced with a
unique-context pattern.

### VERIFIED

Suite **3837 pass / 0 fail / 0 skipped** (3805 before; +32). Gate **exit 0**, no baseline moved.
`--verify` **OK at 605** (was 600; five new windows, +260 bytes). `export-web.mjs` run BEFORE the
gate. **18 pre-existing tests moved and every one is decomposed** -- notably W386/W387's four frame
numbers each moved by exactly -1 while `firstD`, upstream of the change, **HELD**. That uniformity
is the witness.

### NEXT

The attract park is a cartridge state, not a stop. Open: the pool-C guard narrower than the ROM
(`handlers.js:2014`), kind 5's missing selector, A4 `$14` for the ending's other arm, and D36.

## W417 NOTES

### STAGE 2 IS REACHABLE. THE BOOT BLOCKER IS GONE.

`$813092` goes **0 -> 1 on frame 8490** and the run continues **1,182 frames into stage 2**. Five
stage-2-only enemy types spawn and are handled: **`$29 $2B $8D $8F $95`**. Every wave that has been
blocked on "no bench can reach stage 2" is unblocked -- W411 had to abandon its own step-1 proof for
exactly this reason.

| hold | HEAD | now |
|---|---|---|
| shot | **6480 `$280252`** | **9672 `$288610`** |
| auto | 11285 `$288610` | identical |
| auto+down | 11985 `$288610` | identical |
| none, auto+left, auto+right | clean to 12000 | clean to 12000 |

**Next stop `$288610`, a PORT STOP in stage 2**, pre-existing and unrelated: `$288618 move.w (A4),D0`
reads 3, `$28861E 41FA 0018` from PC `$288620` gives the table at `$288638`, whose five longs make
entry 3 = `$28875E`, where `rank.js computedDispatch` throws.

### IT WAS NEVER ONE KIND. IT IS EIGHT KINDS, ONE ROUTINE.

A byte diff settles it: kinds 8 vs 12, 9 vs 13, 10 vs 14, 11 vs 15 differ in **exactly two bytes**
(the `btst` bit, one byte of the counter address), and 8's tail from `+$24` matches 9's from `+$28`
in all but three constants. **Porting only kind 8 would have moved the wall by one press** -- 9, 10
and 11 are hyper stock 3, 4 and 5, the very next stops.

They are the **hyper-bank cancel stars**: `grantHyper287682` arms `$81B412 := $20`, and `$255326`
`$FFFF $20 $24 $28 $2C` by stock is the D0 at `$281D2E jsr $27F8F8`. Each record **homes on the
player** -- `$242296` is `aim256` entered PAST its target select.

### A DEFECT FELL OUT OF THE FILL, NOT THE BODY

`$280BCE[8..15]`'s whole arm is `$280D8C..$280DB8`: owner, `andi.w #$F,D7 / move.b D7,($1A,A0)`,
`clr.b ($1E,A0)`, one `$242EC2` hook add, `rts`. **There is no shared speed body.** W287 read the
heads and stopped. The port ran the shared body anyway: **four RNG draws per allocation where the
cartridge makes one**, `($1A,A0)` written from a speed ramp instead of D7, and `($1E,A0)` left
holding the previous tenant's byte. `sharedSpeedBody` has been a field since W312 and **nothing ever
read it**; it is read now.

**The real risk this wave was two hundred lines from the address in my brief.** I pointed at the
body; the regression lived in the fill.

### KIND 3 DONE TOO, AND ITS ART WAS THE ONLY ART MISSING

`$27FED2` is `$27FE0E` with four constants moved; its step `$27FF36` is `$27FE6E` on ring `$1BE94C`
stride `$C4` wrap `$1BF58C`, whose wrap forces the timer to **`$2`** where kind 2's forces `$1`. Not
reached on any bench here, ported because it was a live latent throw.

**Art, read out of `assets/spr/streams.u32.gz`, not assumed:** four of the five rings were ALREADY
shipped 16/16. Only kind 3's `$1BE94C` was 0/16, now 16/16. **W414's missing selector
`$00010004 -> $1E24DC` is NOT needed by kinds 9/13** -- none of the eight reaches `$280FDC`; they
write `($10,A6)` and free. Only kind 5 still needs it.

### 44 ABLATIONS, 3 GREEN, AND ONE WAS W416'S TRAP AGAIN

`$280D9C clr.b ($1E,A0)` passed under BOTH readings because a fresh `Ram()` leaves `+$1E` at 0. The
test now **dirties the slot first** -- a recycled pool slot really does carry the previous tenant's
byte -- and asserts the consequence. The other two were a score read from the image instead of the
accumulator, and a "sprite is inside the ring" assertion true of the bare base as well.

**Two mutations are provably untestable and are NAMED rather than faked**: `and.b -> and.w` on
`$2802BE` (the field is four bits, no input separates them) and dropping `$2802E6 beq` (the skipped
instructions re-store identical values).

### WINDOWS, SHARD, AND A BASELINE THAT HELD WHERE IT MATTERED

`--verify` **OK at 600, unchanged** -- no `maincpu` window; the aim constants are `[M]` literals
asserted against the image. One new `STRUCTURE_RANGES` row `[0x1be94c, 0x1bf58c, 16]`, bounded three
ways. `streamCount` 4,291 -> **4,307**, 16 added and 0 removed, shard 11 the only shard that moves.

W58 shard 11: `streams 846 -> 862`, and **`records` HELD at 15,903, `distinct` HELD at 127, `first`
HELD at 315**. Records holding is the witness that this was an addition and not a repack: kind 3
never spawns on that window, so it cannot draw one of the sixteen.

### TWO THINGS THE BRIEF GOT WRONG, AND ONE HOUSEKEEPING NOTE

- **"frame 6495"** is **6480** on this tree, and only on `hold=shot`. **"45 records at once"** is
  **29**, peak pool-A population 39.
- `src/rank.js:885`'s prose says `$288610`'s jump table is `$288568`; the encoding gives `$288638`,
  which is what `RANK.disp288610Jump` correctly holds. **Prose wrong, code right.** Left alone.
- `tools/webgate.mjs` was **CRLF throughout on HEAD**. The agent's 16 added lines were LF, leaving it
  mixed; coordinator restored the file to uniform CRLF, which keeps the diff at 17 lines instead of
  rewriting 2,293 unrelated ones.

### VERIFIED

Suite **3805 pass / 0 fail / 0 skipped** (3774 before; +31). Gate **exit 0**, 31 PASS / 0 FAIL.
`--verify` **OK at 600 windows**. `export-web.mjs` run BEFORE the gate.

### NEXT

**`$288610` in stage 2** is the new frontier and is now reachable. Also open: the pool-C guard
narrower than the ROM (`handlers.js:2014`), kind 5's missing selector, A4 `$14` for the ending's
other arm, and on toward D36.

## W416 NOTES

### FIFTEEN WRONG SITES, NOT ELEVEN AND NOT TWELVE

Scan, and it re-runs as `tests/w416rngsignbit.test.js` SECTION 1: sweep the 6 MB image for
`4E B9 0024 2EC2`, then read the opcode byte immediately after. **99** `jsr`, **0** `jmp`, **0**
`bsr` (checked `$23A000..$24C000`, the only range a word `bsr` could reach from). **21** are
followed by `bpl`/`bmi`; the other 78 have no `6A`/`6B` within eight bytes.

Of the 21: three are in unported routines, three were already right, **fifteen were wrong**. The
docket said eleven, W412 said twelve. **The four in `src/boss3.js` (`$29CE16 $29D1A8 $29D448
$29D5A4`) are in neither count**, and `$29E162` in the same file was already correct and is the only
`bmi` of the 21.

**`[M]` exactly 128 of the 256 bytes in `$242EDE..$242FDD` have bit 7 set, and all 256 indices are
reachable.** W412's "60 of the 128 reachable" is wrong on both numbers.

### EVERY SITE WAS SWEPT OVER ALL 256 STATES, ITS WHOLE DOMAIN

Before the fix, every one of the fifteen took the `bpl` arm on all 256 states. After, the split is
128/128 at the byte sites. Examples: `$27D44A neg.w ($2A,A5)` went `$0080` x256 to `$0080` x128 /
`$FF80` x128; `$29D5A4 subi.b #$C,($18,A4)` ran **0 of 256** and now runs **128 of 256**; the two
`hibachiend` cue forks went from `10/0` on all 256 states to `10/0` on **zero** states, modal `5/5`.

**13 of the 15 were driven end to end** through the scheduler's own A4 walk off the ROM tables
(`$29CBD0`, `$29D252`, `$2A5886`), not hand-called. **Two were not** -- `$27B6FA` and `$27C77A` need
stage-4 art state, and are pinned at byte level only. The agent said so rather than claiming
otherwise. Copy that.

### THREE TESTS WERE DEFENDING THE WRONG READING, AND PASSED UNDER BOTH

`w404:397`, `w405:768`, `w406:479` each stated the reason wrongly ("bit 15 is ALWAYS clear, the
negate NEVER runs") while asserting something accidentally true. **All three still passed after the
fix**, because a fresh `Ram()` leaves `$803916` at 0, the draw indexes `$242EDE[1] = $10`, and
`$10`'s bit 7 is clear. **A test that passes under both readings is not evidence for either.** Each
now asserts `$242EDE[1] & 0x80 === 0` as an explicit fact about the bench and points at the sweep.

A fourth defect in `w406`'s helper: `peek242EC2` read `$242E42`'s table, not `$242EDE`. Its only
consumer was `assert.ok(want >= 0)`, true of every byte, so it could not fail.

### THE TRAP LIST NEARLY COST THIS WAVE A REGRESSION

The agent first read `44 6D 00 1C` as `neg.b` and "fixed" `initbody.js` to byte negates. **NEG/CLR/
NOT/TST size bits are `00=byte, 01=word`** -- the list's own `4254 = clr.w` proves it -- so `44 6D`
is `neg.w` and the port was already right. `44 2C` (the three guns) is the byte form. Reverted;
both sizes are now asserted from the encoding. Coordinator confirmed the decode.

**"Check WHICH bits" applies to SIZE fields, not just `andi` masks.**

### IT IS MEASURABLY NOT AN RNG SHIFT

Both readings draw exactly once at every one of the fifteen; no arm contains a `jsr`/`bsr` into the
shared-counter family (asserted over all fifteen arm byte ranges); `soundPost` touches no RNG. The
stream is byte-identical and **no gate baseline moved**. A live 5,400-frame bench reaches none of the
fifteen -- only `spark.js`, already fixed in W412 -- which is why.

### WHAT CHANGED IN `rng.js`

New `drawNegative242EC2(ram, rom)` returns **the N flag itself** (bit 7 of the drawn byte), and the
doc comment that asserted bit 15 and called the arms unreachable is rewritten. Callers no longer do
bit arithmetic on a word whose sign is meaningless. `$29E162` keeps the word because it needs value
and flag both. `spark.js` moved onto the shared helper.

### THREE SITES DELIBERATELY NOT CHANGED

`$2A7860` (gun 1), `$2A8EEE` (gun 12), `$2A9804` (alt table) are real forks in **unported** routines.
**Warning for whoever ports them: their taken arm makes two further `$2431F4` draws, so porting gun 1
WILL move the RNG stream.**

### VERIFIED

Suite **3774 pass / 0 fail / 0 skipped** (3760 before; +14). Gate **exit 0**, 31 PASS / 0 FAIL, **no
baseline moved**. `--verify` **OK at 600 windows**, unchanged.

### NEXT

The frame-6495 kind-8 throw, kind 3's missing body, the pool-C guard that is narrower than the ROM
(`handlers.js:2014`), then A4 `$14`, and on toward D36.

## W415 NOTES

### THE LATE CRATER IS NOT A PORT DEFECT. IT IS A SHARD FETCH ORDER.

The crater is **pool C's kind-4 satellite** (`$289AF4` -> `$289B50`, driver `$289B80`), a record that
scrolls with the ground. Its 8 art streams were filed under **sprite shard 17, fetched 19th of 19**
(2.39 MB gz), while the **fireball the SAME death arm spawns is on shard 9, fetched 5th** (0.22 MB).
A shard that has not landed is never drawn; `demand()` promotes 17 the first frame a crater asks,
which is exactly why the owner saw it **late rather than never**.

| shards landed | crater records undrawable |
|---|---|
| first five, before | **5,594 of 5,594** |
| eighteen of nineteen, before | **5,594 of 5,594** |
| first five, AFTER | **0 of 5,594** |

Fix: three `HARVEST` rows moved to `EFFECT_SHARD`, whose own `why` already names its deadline as
"the first frame an enemy DIES". Exact one-for-one move, `streamCount` **unchanged at 4,291**.

### ON A FULL BENCH THE LAG IS ONE FRAME, AND THAT FRAME IS AUTHENTIC

Death -> allocated is the SAME frame for all three producers. Allocated -> first drawn is 0 for the
fireball and the debris and **1 for the crater**, because `$28B5E6 jsr $289B80` (pool C's driver)
runs BEFORE `$28B5EC jsr $2634F4` (the enemy driver, inside which the death arm allocates), while
pool B's driver is the fifth call. **That is the cartridge's call order.** Do not "fix" it.

### "SOME OF THE ENEMIES" HAS TWO HALVES AND BOTH ARE THE CARTRIDGE

1. Only types **`$11`** and **`$10`** reach a `jsr $289AF4`. The other four handlers that free a
   record in that window leave no mark at all.
2. `$268898 addq.w #1,$815EA4` / `$26889E btst #0,$815EA5` / `$2688A6 beq` -- **the first death of a
   frame leaves a mark, the second does not, the third does.** Coordinator verified those bytes.

### THE PORT WAS RULED OUT FIRST, AGAINST THE BOARD

Seeding from the board's own `.ram.bin` at ten consecutive rungs lf2000..lf3000 and comparing pools
B, C and D at the next rung: live counts matched the board **10 of 10 for all three pools**. The
port's effect timing is oracle-clean. **Do that before blaming the port.**

### MY BRIEF POINTED AT THE WRONG MECHANISM ENTIRELY

I named `walkDeathSpawns270D92`, its six call sites, `T1B.deathSpawns` and nine `deathSeqNN`
functions. **The crater is none of them** -- it is pool C, which my brief never mentions, and every
`walkDeathSpawns270D92` caller is a stage-3 or stage-5 type that does not run in the first seconds
of stage 1. Following my grep would have burned the wave.

I also inverted the pool-driver shape (pool C's driver runs EARLIER than the code that allocates
into it, which is what costs the frame), and framed the shard question as "is the art on a late
shard" pointing at shard 11. **The decidable question is RELATIVE**: is this art's shard fetched
later than the shard of the sibling effect the same death arm spawns? That is what
`w415groundmark.test.js` now asserts, and it is the one assertion in that file which fails on HEAD.

### THE BASELINE MOVE WAS DECOMPOSED ON ITS OWN WINDOW

Shard 9: `records 6,079 -> 16,746 = 6,079 + 10,667`, `distinct 204 -> 212 = 204 + 8`, `streams 269
-> 277`, **`first` HELD at 24** (pool C's own first is frame 27). The 10,667 fall on exactly the 8
moved streams. Shard 17 lost precisely what shard 9 gained. The `SIZES` sum-equals-`streamCount`
assertion in W395/W396/W397 is what proves it was a move and not an addition.

### ONE LATENT THROW FOUND AND DELIBERATELY LEFT ALONE

`handlers.js:2014` calls `spawnPoolC289B50(..., 8, ...)` for type `$8E`'s death, but the port's guard
is `(kind & 0x3C) !== 4 -> unreached`, while the cartridge's template table `$289DEA` has real
entries for kinds 0, 8, `$C` and `$10`. **The guard is narrower than the ROM.** Coupled to it: the 24
streams those other pool-C families name are absent from the bundle entirely, so relaxing the guard
alone would produce marks with no art -- the same two-halves shape W414 recorded for kind 3.

### VERIFIED

Suite **3760 pass / 0 fail / 0 skipped** (3754 before; +6). Gate **exit 0**, 31 PASS / 0 FAIL.
`export-web.mjs` run BEFORE the gate. `--verify` **OK at 600 windows**, unchanged -- no new ROM
window, `$289EAA` was already exported.

### THIS ONE ONLY HELPS THE OWNER ONCE PUBLISHED

It is a fetch-order fix. The tree being green changes nothing on the page until `export-web.mjs`
then `publish.mjs` run.

### NEXT

**D48**'s remaining ten wrong-bit sites, the frame-6495 kind-8 throw, kind 3's missing body, the
pool-C guard above, and A4 `$14`.

## W414 NOTES

### THE MEDAL DRAWS. 20,079 DROPPED RECORDS -> 25, ACCOUNTED FOR ONE FOR ONE.

Bench lf2000, fire held, 5,400 frames, against the shipped bundle:

| | before | after |
|---|---|---|
| records emitted | 556,610 | **556,610** (the port did not change) |
| skipped as missing art | 20,079 | **25** |
| distinct missing offsets | 25 | **1** (`$000000`, pre-existing) |
| `$1BE2CC` missing | 1,631 | **0** |
| medal family drawn | 0 of 18,714 | **18,714 of 18,714** |

`18,714 + 1,340 + 25 = 20,079` exactly. **That is the standard of proof this item demanded** -- a
drawn-sprite measurement, not a clean `--verify`.

### THE ITEM WAS ONE FAMILY SHORT, AND THE SECOND ONE MATTERED

The same measurement named `$1E179C x8`, the **collected popup**. Kinds 0/4 write the same selector
`$00050000`, so **the star's collect arm that W411 unblocked could not draw either.** Fixing only
`$1BE2CC` would have left the medal blinking out of existence the instant the player touched it.

### THE EXTENT CAME FROM THE CARTRIDGE'S OWN WRAP, NOT FROM THE STAR

`$27FEB0 addi.l #$34,(A0)` / `$27FEB6 cmpi.l #$1BE60C,(A0)` / `$27FEBE move.l #$1BE2CC,(A0)`.
`$340 / $34 = 16`. Coordinator verified those bytes. **A stride walk reports 32 streams** across
`$1BE2CC..$1BE94C`, which is two families; only the `cmpi.l` says where the first stops. Do not take
an extent from a neighbour's frame count.

### MY BRIEF WAS WRONG ABOUT THE PIPELINE ITSELF

- **"Declare the window in `export-tables.py`"** -- wrong tool. That file is `maincpu` only; sprite
  art lives in the mask ROM. `--verify` correctly stays at **600 windows**.
- **"Then add the matching shard entry"** -- they are the SAME LINE. A `STRUCTURE_RANGES` row in
  `export-web.mjs` is the shard entry (`shardOfStream.set(a, STRUCT_SHARD)`). The two-file split I
  warned about does not exist.
- **`$1BE2CC` is 2x24, not 4x24.** The size word is `$0418` and wide is bits 14..9. The docket's
  "6x24 bee" and "4x16 star" are the same nibble misread. Harmless as a label, **load-bearing for
  the extent check**, since `portSpriteList` counts a present-but-short stream as missing.

### THE BASELINE MOVE WAS DECOMPOSED, NOT ASSERTED

W58 shard 11: streams 822 -> 846, records 12,985 -> 15,903, distinct 103 -> 127, **`first` held at
315**, `drawn === rec` / `pend 0` / `named 0` unchanged. The split is exact: 12,985 sit on the old
streams over the same 103 images, and all 2,918 sit on the 24 new offsets. The counter only sees
them now because `t.rec++` is gated on the stream being in a shard -- **a record whose stream is in
no shard was never counted at all.** Bundle-wide: +24 streams, +1,328 mask, +2,327 colour =
`16 x 50 + 8 x 66` exactly.

W395/W396/W397 got a separate named `W414` term rather than a rewritten `BEFORE`, so each still says
what its own wave did. Copy that habit.

### TWO NAMED GAPS, NEITHER REACHABLE TODAY

- **Kind 3** is allocated by `handlers.js` at `$279D64`/`$279F3C` (W374) but `bee.js runBody` has no
  body for `$27FED2`, so such a record throws `unreached` **before** anything asks for art. Its art
  `$1BE94C` is also absent. Shipping the picture alone would be art no measurement could show
  drawing, so both halves are named in the test instead.
- Selector `$00010004` -> `$1E24DC x8` is missing; written only by kinds 5/9/13, all unported.

**`bee.js:1138`'s "only THREE selectors exist in the 6 MB image" is wrong** -- a scan finds four:
`$00010004 $00010008 $00050000 $00050004`. The port's bound is still right (three distinct LOW
words); the sentence is not.

### ON THE LIVE PAGE THE MEDAL ARRIVES A BEAT LATE, AND THAT IS PARITY

Shard 11 is 3.8 MB and **18th of 19 in `SPR_ORDER`**, so it is `pending` until it lands and
`demand()` promotes it the first frame a medal asks. **The stars and impact explosions already
behave this way.** Not a regression -- but do not confuse it with D50, the late crater, which is a
different mechanism entirely.

### VERIFIED

Suite **3754 pass / 0 fail / 0 skipped** (3748 before; +6). Gate **exit 0**, 31 PASS / 0 FAIL.
`export-web.mjs` exit 0, run BEFORE the gate. `--verify` **OK at 600 windows**, unchanged.

### NEXT

**D50** (the late crater -- get a frame count before a theory), **D48**'s remaining ten wrong-bit
sites, the frame-6495 kind-8 throw, kind 3's missing body, and A4 `$14`.

## W413 NOTES

### THE LASER BOMB'S BOX WAS SIGNED. THE CARTRIDGE'S IS UNSIGNED.

`$2457A0 $2457A8 $2457B8 $2457C0` are all `65 xx` = **`bcs`, unsigned lower**. A signed compare would
be `6D`. Coordinator verified all four bytes. `recordHitsBox` in `src/bomb.js` wrote them as
`i16(...)` **while quoting `bcs` in the comment beside each one**, and the same slip sits on the
eight twins at `$2458B6/$2458BE/$2458CE/$2458D6` and `$245990/$245998/$2459A8/$2459B0`.

**Why it mattered:** every coordinate here carries D6's `$2800` bias, so a raw Y of `$5800` or more
biases past `$8000` and reads NEGATIVE when signed. The boss's biased far edge is `$9F7D` on every
checkpoint of the fight, and the beam's own segments cross `$8000` from segment 24 out.

| 131 damage frames | HEAD | fixed |
|---|---|---|
| box test passes | yes | yes |
| intersecting segments found | **0** | **10** |
| pool-B hits `$2457FA` | **0** | **64** |
| boss HP | `$7FFF` untouched | `$FDFF` |

`$7FFF - 64 * $208 = $FDFF` exactly.

### THE BRIEF'S TWO-WAY FRAMING EXCLUDED THE ACTUAL ANSWER

I asked whether the boss "never intersects" or "intersects but loses the nearest test". **Neither.**
It intersected, nothing beat it, and `$812954` was still 0 -- the port's own comparison rejected all
ten segments, so the nearest test was never reached. Hunting for "what won" would have burned the
wave. **When a brief offers two options, the answer may be a third; say so.**

### THE POOL ORDER IN MY BRIEF WAS BACKWARDS, AND IT IS LOAD-BEARING

The ROM runs **pool B first** (`$24571A`), pool A second (`$24581C`), and `$245886`/`$24588E` make
the pool-B target **SHADOW** pool A: anything behind the nearest pool-B record takes nothing. Pinned
as its own test row.

### WHAT ACTUALLY LIVES WHERE, MEASURED

Pool B is the 50-slot special pool, selected by class byte **bit 7 or bit 5** (`$2635B8 tst.b / bpl`,
`$2635C6 btst #5 / bne`). The boss is `$81523C` = **slot 101 of 150, pool B index 1**.

**And in a boss fight pool A is 0 of 100 live for the entire encounter** (lf8500..lf19250). So the
laser bomb's "hit everything for `$1E0`" pass has nothing to hit, and its only damage is one `$208`
per frame to the nearest pool-B record. That is the cartridge, not a defect.

Once fixed, the boss BODY wins the nearest test on 37 of 50 checkpoints; its two arms and midboss
parts take it on the other 13. Also the cartridge.

### D6 AND THE $9800 REJECT WERE BOTH FINE, AND THERE IS A SECOND D6 WRITE

`$24518A 3c 3c 28 00` sets D6 = `$2800`; the mask read `$24563E` is past `$245636 bne`. **But there
is a SECOND `move.w #$2800,D6` at `$24535A`**, inside a subroutine that `movem.l D0-D7/A0-A6` saves
and restores. A narrower reader would conclude D6 is rewritten. `$245776 0c 41 98 00 / 64 a8` is
`bcc`, unsigned, and the boss's `d1 = $79FD` passes it -- that reject was never the problem.

### TWO MORE THINGS THE BRIEF MISSED

- **The bullets are not a sideshow.** They share `recordHitsBox`, carried the same defect, and their
  erased count moved the OPPOSITE way (19 -> 14), because the signed form was wrong in BOTH
  directions depending on which side of `$8000` an edge fell.
- Pool A's inner loop breaks only on `bmi $2458F8` (HP negative), so **one pool-A enemy can take
  several `$1E0` hits in a single frame** -- 2 and 3 were measured.

### GATE: NO BASELINE MOVED

`w65beamgate`'s informational counters moved (poolA 51 -> 54, bullets erased 19 -> 14, chain 64 ->
55) with a named mechanism, not "RNG shift": the signed form was wrong in both directions, so a rise
and a fall are both expected, and the changed kill frames drive `$81B636`. Its pass/fail is 13/9 on
HEAD and 13/9 now. `w64bombgate` and `midbossgate` failures are **byte-identical on HEAD**,
pre-existing.

### VERIFIED

Suite **3748 pass / 0 fail / 0 skipped** (3735 before; +13). Gate **exit 0**. `--verify` **OK at 600
windows**. No new windows.

### NEXT

**D51** is the urgent one: the medal spawns but has **no exported art**, so the owner still sees
nothing. Asset-pipeline wave, not a port wave. Then **D50** (late crater), **D48**'s remaining ten
sites, the frame-6495 kind-8 throw, and A4 `$14`.

## W412 NOTES

### THE HYPER LASER'S HIT ANIMATION WAS NEVER MISSING. ONE REGISTER WAS WRONG.

`$24CBCC` is `08 ae 00 07 00 01` = `bclr #7,($1,A6)`. **`08 ae` is mode 5, register 6.** The port
read it as A3, because every other instruction in `$24CBBE..$24CBE6` is on A3 and the helper's
signature made A3 look right. Coordinator decoded the effective address independently. A scan of
`$240000..$2B0000` finds **zero** `bclr #7,($1,A3)`: the byte the port cleared has no instruction
behind it, and `$24CBBE clr.w ($4E,A6)` was already ported as `opt + $4E`, which pins A6.

So `$24CBB2 bset #$7,($1,A6) / beq` means "a head is already out there", and `$24CBCC` **retires it
on a hit or a completed beam**. The next quiet frame lays a NEW head at the beam's current reach.
**That relaunched pulse IS the hit animation.**

| measured, 5,400 frames | HEAD | fixed |
|---|---|---|
| slot 27 (`$811802`) live frames | 24 | **742** |
| block-7 overlaps | **0** | **84** |
| type-1 body segment, 900 frames | 11 | **166** |

**W410's conclusion that the bee's rarity might be authentic is WITHDRAWN.** It was this defect.
D24's "missing hit sprites" is very likely the same one.

### THE EMITTER WAS FINE AND MY THREE QUESTIONS ALL ANSWERED "FINE"

`spawnBeamImpact289FC0` fires **297 times per 900 frames**, every frame the phase allows. Pool E
took 301 records, the driver drained 9,625, the sheet drew 81,618 of 81,676 with zero misses
attributable to the impact range. Reached, bodied, drawn, art present. **The defect was two files
away.** Asking "is this line reached" was the wrong question.

**Two measurement traps that cost the agent runs, and will cost you one:**
- `ctx.beamImpacts` at `laser.js:1058` is `=`, not `+=`. Read once at the end, you see ONE frame.
- Bucket 20's counter `$80AFDE` reads 0 after `step()` because call #4's tail zeroes all thirty.

### A REAL PLAYER ASYMMETRY, IN THE DRAW GATE, UNEXERCISED HERE

`$2550C4` is `bne` (P1) and `$25514A` is `beq` (P2) on the same `tst.w $80390C`. The port had P1's
form for both. Fixed. **Unexercised on every bench in this repo** -- `$81308C` is 1 on all 5,400
frames -- and labelled as such rather than claimed as tested.

Note the cartridge's own arithmetic: in genuine two-player play **neither** impact fires, since both
blocks `beq`-skip on `$81308C`. That is the ROM, not a bug.

### D48 HAS TWELVE SITES, NOT ELEVEN

`src/spark.js fillTail28A252`'s `$28A25E bpl` is a twelfth `bpl`-after-`$242EC2` site the docket does
not list. Fixed HERE because it is inside this unit; **the other eleven were left alone.** 60 of the
128 reachable `$242EDE` bytes have bit 7 set, so it fires on ~47% of impact sparks and moves the
angle base `$18 -> $28`. The file's own note called that arm unreachable.

### ONE GATE BASELINE MOVED AND IT IS NOT CALLED AN RNG SHIFT

W90: `beamLive` 1037 -> 1003, `entries` 519 -> 502, `records` 17283 -> 16731. **`distinct` HELD at
35/35, `first` HELD at step 31**, NO ART 0, pending 0. The agent explicitly declined to call this an
RNG shift: `beamLive` moved because the head cadence changes the segment population and therefore
`$254FE6`/`$254FA8`. **That is the standard to hold a baseline move to** -- name the mechanism, or
do not move it.

Three existing tests moved by one frame (`w227death`, `w228respawn`, `w231playerinit`), isolated by
running each fix alone: it is the extra pool-E allocations drawing `$242FFC`, the mechanism W324
already recorded.

### `laser.js`'s OWN DOC IS WRONG TWICE

It claims "P1 `$255042..$2550CA`, P2 `$2550CC..$255154`, two `rts`". There is **no `rts` at
`$2550CA`** -- P1 falls THROUGH into P2's `lea`. P2's `bpl.w` at `$2550D4` targets `$255040`, a
`4E75` sitting BEFORE the routine, and `$255154`/`$255156` are both `4E75` used by different skips.

### NEXT, AND ONE OF THEM IS URGENT

**D51 (new): the medal has no exported art.** W411 made it spawn; `$1BE2CC` is the top missing-art
offset in every run and 32 medals per 5,400 frames cannot draw. **The owner will still see nothing
until the asset pipeline learns the address.** It is an asset wave, not a port wave.

Then **D43** (laser bomb, owner-corrected), **D50** (late crater), **D48**'s remaining eleven, the
frame-6495 kind-8 throw, and A4 `$14`.

## W411 NOTES

### A TEST WAS PINNING A DEFECT, AND IT COST EIGHT WAVES

`$27FA34` is `66 b8`: a **backward** `bne` to `$27F9EE`, the star's collect arm. `bee.js` read it as
"bits 11 or 12 set and it does NOTHING", and `w265poolakind0.test.js` **asserted that reading**. So
since W265 a star the player flew into was never collected, never scored, never counted. Coordinator
verified the bytes independently: `$27FA34 + 2 - $48 = $27F9EE`.

**This is the shape to fear.** Not a wrong constant a test would catch, but a wrong reading a test
was defending. When an ablation of that line passed, the test agreed with the port and both were
wrong together. Treat "the test pins it" as evidence about the TEST until you have read the bytes.

### THE OWNER'S D44/D45 HAD TWO INDEPENDENT CAUSES, AND BOTH ARE NOW FIXED

Ten enemy death arms called three unported entries of the pool-A allocator and logged a deferral
instead of dropping. Kind index 2, the medal, had no body at all. Measured, lf2000, 5400 frames:

| | before | after |
|---|---|---|
| pool-A delivered | 18 | **58** |
| kind 2 (medal) | 0 | **32** |
| `$817F84` medal P1 | 0 | **15** |
| `$817F86` star P1 | 0 | **4** |
| `$27F8EE` / `$27F8FA` refusals | 11 / 21 | **0 / 0** |

`$27F8F8`'s 1440 refusals are the bullet mover freeing off-screen: real, invisible, DEFERRED.

### THE ORDER IN MY BRIEF WAS BACKWARDS AND THE AGENT SAID SO

I ordered type `$90` first as a cheap proof needing no new body. `$90` is a **stage-2** type that
never spawns on any bench in this repo, and reaching stage 2 hits a **pre-existing** throw at frame
6495 (`$280252`, kind index 8, 45 records at once, a bullet cancel with `$81B412 != 0`). The agent
proved it pre-existing by reverting to `HEAD`: original throws at 6495, its tree at 6443, a 52-frame
RNG shift and not a regression. **That throw is still there and is nobody's fix yet.**

### FIVE GATE BASELINES MOVED, AND WHY THAT IS NOT A COVER-UP

W52/W53/W54/W58/W90 fingerprints shifted because real allocations now draw from the shared RNG
counter `$803917`. **`distinct` and `first` held on every shard** -- that is the witness that the ART
side did not change and only counts moved. Coordinator checked the diff. If you ever move a baseline
without being able to say which fields held, stop.

### FOUR MORE DECODING ERRORS FOUND IN ALREADY-SHIPPED CODE

- **`hitShortB` was wrong for both stage-4 kinds.** W216 wrote the ordinary body's sprite advance
  where `$281010 move.w (A0)+,($16,A6)` reads a table: `$0054` for kind 18 (port said `$0064`),
  `$0064` for kind 19 (port said `$00C4`).
- **`andi.w #$F8DF` clears bits 10, 9, 8 and 5, not 13.** Bit 5 is INSIDE the kind field, so the
  instruction edits the kind index of any record carrying it.
- **`$279B16` is `movem.W`, not `movem.L`** -- `4C9C` has bit 6 clear. Read as long, type `$91`
  would run 257 passes off a seven-entry table. `aligned.py` prints the bytes right; the size bit is
  on the reader.
- **The `$27F8FA` bounds tests are CARRY tests, not sign tests.** `addi.w #$800 / addi.w #$7800 /
  bcs` frees `[$8000,$F7FF]` and lets `[$F800,$FFFF]` through, because the first add wraps it back
  down. A `bmi` port would free the whole top half.

### THE ALLOCATOR HAS FIVE ENTRIES AND SEVEN CALLERS, NOT FOUR AND FIVE

`$27F8E6` is a fifth entry, called from `$288ABE`. `$27EF90` and `$27F294` also call `$27F8EE`,
outside `handlers.js`. The docket's four-entry list is incomplete.

### ONE WIRE IS WRITTEN BUT UNREACHABLE, AND IT IS LABELLED AS SUCH

Type `$8E`'s drop calls `$27664E jsr $289AF4` before `$27665A`, and pool C's absolute allocator
refuses kind `$8`, so the whole arm throws. The wire is cited and correct; it needs pool C kind `$8`
first. The agent wrote that in the test file rather than writing a test that pretends.

### 47 ABLATIONS, 9 GREEN, 2 INVALID

All nine were values a test wrote and never read back. Two mutations were provably untestable
(`u8 & 0x80` is the same bit as `u16 & 0x8000`; the `$8E` arm throws earlier) and were replaced.
Pass 3: 47 of 47 red.

### VERIFIED

Suite **3729 pass / 0 fail / 0 skipped** (3698 before; +31). Gate **exit 0**. `--verify` **OK at 600
windows** (one new: `$280F34 + $A8`). `export-web.mjs` was run before the gate.

### NEXT

**D42** (hyper laser hit animation -- it also owns the bee's 11-frame muzzle window from W410),
**D43** (the laser bomb's nearest-only pool B, corrected by the owner), **D50** (the late crater),
**D48** (the wrong-bit RNG at eleven sites), then A4 `$14`. The frame-6495 kind-8 throw needs an
owner too.

## W409 NOTES

### THE ENDING COMPLETES. NOT "DOES NOT STOP" -- COMPLETES, BY THE CARTRIDGE'S OWN STORE.

A4 script 5 takes the slot on frame 4447 and **`$812E06` goes to 1 on frame 4889**, which is
`$2A6466 jsr $2595E8`, the stage-over store. States `[4447,0] [4478,1] [4744,2] [4753,3] [4761,4]`,
and `4761 + $80 = 4889` exactly. `$2A646C clr.w (A4)` frees the slot on the same frame. Nothing
throws in 12,000 frames on the W404 bench.

**MY BRIEF WAS WRONG AND SO WERE THE LAST FOUR HANDOFFS.** I wrote "only A4 `$14` reaches
`$2595E8`" and repeated it as the reason the ending was never nearer. A scan of `$2A4000..$2AB000`
finds **two** `4EB9 002595E8`: `$2A6B88` (A4 `$14`) and **`$2A6466`, in this unit**. Script 1's fork
has an ending on EACH arm, and the arm every bench has been running is now complete.

### WHAT IS STILL OUT: A4 `$14` (`$2A6B7A`, `$1A`) is the OTHER arm's ending, still counted, as are
A4 `$12`, `$13` and A4 script 0.

### ENTRY-TO-ENTRY OVERSHOT AGAIN, AND THIS TIME BY TWO UNITS

`$3AA` splits three ways, not two: `$270` code, `$100` this script's own data, and **`$3A` belonging
to A4 script 0**, which is two thousand bytes away and names it with `$2A5A04 lea ($D82,PC),A0`.
Fourth wave running. Treat entry-to-entry as an upper bound and nothing else.

### 79 ABLATIONS, 21 GREEN ON THE FIRST PASS -- THE WORST RATIO YET

All 21 were in blocks the tests **counted but never read**: the entire `$28B34A` blast (5), the
entire state-1 spawn record (6), both `cmpi.b #$2` guards, two reload fields, `$259924`, and the
palette install, which was invisible because no test supplied a `ctx.palette`. Ten new tests read
records back. Pass 2 still had 2 green: `dx >> 2 -> >> 1` survived **because the default RNG state
draws a dx of zero**. Fixed by driving `$803916 = 7`. Pass 3: 79 of 79 red.

Two mutations were INVALID and were replaced, both stated in the test file: a state guard no value
can separate, and a byte read where all sixteen source words are `$0000`.

### A PORT-WIDE DEFECT WAS FOUND HERE AND DELIBERATELY NOT FIXED: SEE DOCKET D48

`bpl` after `jsr $242EC2` tests **bit 7**, because `$242ED6 move.b (A0,D0.w),D0` is the last
instruction to touch N and neither the `movea.l` nor the `rts` after it does. The port tests bit 15
in **eleven places across five files**, and `rng.js`'s doc comment states bit 15 as if correct.
Coordinator verified the ROM bytes independently. This unit is written correctly and measures the
difference: 5 x `$28C274` + 3 x `$28C28E` where the bit-15 reading gives 8 and 0.

**Do not fix it in a porting wave.** It changes behaviour at eleven sites, several of them `if` arms
whose dead branch has never executed, so today's green tests may be pinning the wrong behaviour.

### WINDOWS: THREE NEW, 599

`$2A6688 + $80` (emitter rows), `$2A670A + $56` (a `$246410` chain -- and `$246410` is
`move.w (A0)+,D0 / subq.w #1,D0 / beq`, **not** a `dbra`, so a count of 6 means 6), and
`$2A676E + $1A` (a `$246520` chain whose entry is twelve bytes with no fill word).

### VERIFIED

Suite **3698 pass / 0 fail / 0 skipped** (3668 before; +30). Gate **exit 0**. `--verify` **OK at 599
windows**.

### PUBLISH STATE, CORRECTED

W408's section said the W407 publish was still owed. **It is not.** It was run against a quiet tree
after W408 landed and confirmed live as build **`20260816181806`**. Next publish falls at W412.

### NEXT

The owner's play report, **docket D42..D47**, outranks further HIBACHI internals. After that,
**D48**, then A4 `$14` for the other arm's ending.

## W408 NOTES

### THE LOOP CLOSES IN THE ROM AND NEVER IN PLAY, AND THE ARITHMETIC SAYS WHY

All seven guns and six scripts of `$F -> $11 -> $10 -> $F` are registered and all three arrows
exist. **The real path still never executes `$2A6AA2`.** `$2A6AD8 move.b #$4,($1A,A5)` re-arms phase
B's timer to `$04xx` when gun `$B` starts, and one lap costs gun `$B` 507 frames + A4 `$10`'s `$60`
+ gun `$A`'s **minimum** `$352` = **1,455 frames against a ceiling of `$04FF` = 1,279**. A shortfall
of `$B0`, and it is structural: `($1F1,A6)` only ever grows, so gun `$A` can only get longer.

**"Closed" in the arrows and "reachable" in play are different claims.** Do not report the first as
if it were the second.

### NEW STOP: FRAME 4447 AT $2A6418, A4 SCRIPT 5, A PORT STOP

`$2A5886[5].init` IS `$2A6418`, `303C 000E` (ordinary code) stands there, and `$2A728A moveq #$5 /
jmp $25980C` in phase B's death tail routed us in. Counted at `$3AA`. Measured: timer `$040B` written
on 3412, and 3412 + 1035 = 4447 exactly.

**The ending is no nearer.** Completion is `$2595E8`; only A4 `$14` reaches it (`$2A5CB4 moveq #$14`)
and only script 1's first-loop arm starts `$14`. Closing a loop is not progress toward an exit that
lies outside it.

### GUN $A IS THE ODD ONE OUT THREE WAYS

It neither aims, nor selects a player, nor toggles `($3,A5)`. Its four absolute calls are exactly
`$242438`, `$242EC2`, `$2817C2`, `$259B08` -- no `$24270A`, no `$2422A2`, no `086D`. Driven: with
both players dead it fires the same twelve bullets. Its ring is kind **28**, the tracker, and gun `$A`
writes the global they read: `$2832B0 tst.w $8130DC` reads the word `$2A8BC0`/`$2A8BD4` rewrite every
frame the gun exists. D4 (`$00030016`) is a real parameter here where every other gun passes zero.
`tst.b ($1F0,A6) / neg.b ($10,A4)`, paired with `$2A8C3C not.b ($1F0,A6)` in the retire tail, makes
the ring alternate direction run to run.

### $2A8B10..$2A8B4B IS $3C BYTES NOTHING POINTS AT

Nine `{bias, kind}` longwords and six `{dY, dX}` muzzle longwords, sitting between gun 9's `4E75` and
gun `$A`'s template. Gun 9 and gun `$A` have exactly one `lea (d16,PC)` each and neither names it; no
longword in the 6 MB image lands inside it. **The layout rule `[code][template][8 longwords][code]`
has a fourth thing in it here.** No window declared, since nothing reads it.

### A NUMBER COPIED ONE GUN TOO FAR

W407's handoff said gun `$A`'s trailing data was `$3C`. It is **`$2A`** (`$11E - $F4` = `$A` template
+ `$20` pointers). `$3C` is gun `$B`'s own trailing figure. `HIBACHI_A1_COUNTED` had the same error;
both corrected. Entry-to-entry minus code is a per-gun number, not a constant.

### 47 ABLATIONS, FOUR GREEN, ONE INVALID

All four holes were the same shape: three ramp caps that every test drove from zero, where a single
`addi` never reaches any cap. New tests drive each at `cap - 1` AND at the cap. One mutation was
**invalid** -- `u8` vs `u16` on the ring index is provably the same routine, since `andi.w #$FC`
clears bit 8 -- and was replaced by two mutations of the index itself, both red. 47 of 47 red.

### VERIFIED

Suite **3668 pass / 0 fail / 0 skipped** (3644 before; +24). Gate **exit 0**. `--verify` **OK at 596
windows** (one new: `$2A8B4C + $10`).

### PUBLISH STATE, READ THIS

W407's publish **REFUSED** and was right to: I started it while the next agent was mid-edit, so it
ran the suite against half-written files and reported 23 failures that do not exist in the committed
tree. Publish is a whole-tree action. **Run `export-web.mjs` then `publish.mjs` BEFORE dispatching
the next agent, or wait until the tree is quiet.** The W407 publish is still owed.

### NEXT

**A4 script 5 `$2A6418`** (`$3AA`, counted), phase B's death tail, which is the frame-4447 stop and
is on the ending chain rather than in either attack loop.

## W407 NOTES

### THE BRIEF SAID THIS WOULD CLOSE A LOOP. IT DOES NOT, AND THE AGENT SAID SO.

`$F -> $11 -> $10 -> $F` is real. But **a three-link loop needs three guns and this unit had one**:
`$10` waits on **A1 gun `$A` `$2A8B7C`**, which is still unported. Porting gun `$B` and A4 `$11`/`$10`
advances the path one gun further and hands the next agent a gun, not a script.

Take the general lesson: **a coordinator's framing is a hypothesis, not a finding.** If the unit does
not do what the brief predicted, report what it does.

### GUN $B HAS A THIRD FREEZE BEHAVIOUR, AND W406'S RULE MISSED IT

W406 said ten of fourteen guns have a `4A79 008130D4` freeze arm. The TEST yes, the ARM no. All
fourteen displacements decoded: guns 0..8 branch backward into their own init, but **`$2A8CB8 6600
01CA` lands FORWARD on `$2A8E84`**, gun `$B`'s own retire tail (`bchg #$0,($3,A5) / moveq #$B /
jsr $259B08`). A frozen gun `$B` **clears its A1 slot** and A4 `$11` walks on the next frame. Three
behaviours, not two, so gun `$B` does not use `gunTick`.

### GUN $B COMPUTES AN AIM AND THROWS IT AWAY

`$2A8D0A jsr $2422A2`, then `$2A8D10 323C 0080` writes `#$80` straight over the answer, and it is
that constant `$2A8D14 move.b D1,($7,A4)` stores. Worse, `$2A8CCA move.b ($4,A4),D2 / cmp.b
($5,A4),D2 / bne.w $2A8D18` runs the block on volley **one only**, because nothing in the gun ever
writes `($5,A4)`. So the heading is `$80` for the whole run and from volley two the gun keeps firing
after both players are dead. Driven: targets at `($6000,$0200)` and `($2000,$2400)` produce
byte-identical volleys. Gun `$B` is also the only ported gun with **no A6 ramp at all**, so it fires
the same pattern every lap.

### EXTENTS, AND WHY ENTRY-TO-ENTRY IS NOT CODE LENGTH

Gun `$B` is `$236` table-entry to table-entry of which **`$1FA` is code**; the trailing `$3C` is
`$1C + $20`, gun `$C`'s 14-word template plus its eight self-pointers. This is now the third wave
running where the two numbers differ, so treat entry-to-entry as an upper bound and nothing more.

### NEW STOP: FRAME 4016 AT $2A8B7C, A PORT STOP

`$2A72C8[$A].init` IS `$2A8B7C`, `41FA lea` stands there, and this wave's own A4 `$10` (`$2A6A90
moveq #$A / jsr $259A18`) is what routed us in. Frames 3317 -> 4016; spawn calls 4,865 -> **8,105**.

### 59 ABLATIONS, SIX GREEN, ONE REAL AND TWO INVALID

The real hole: reversing each arm's `jsr` site list was invisible because every per-site count is 180
either way. The new test derives the eighteen sites by scanning for `4EB9 002817C2` and asserts
ascending order plus the `$10` stride and `$28` gap. Two mutations were **invalid** (a `k < 10` that
never fires, an `addi.l #$30000` provably identical to a word add) and were replaced with ones that
redden. Three are proved equivalences, not weakened tests. `export-tables.py` now fails loudly if any
of them rot.

### VERIFIED AND PUBLISHED

Suite **3644 pass / 0 fail / 0 skipped** (3615 before; +29). Gate **exit 0**. `--verify` **OK at 595
windows** (one new: `$2A8C70 + $A`). This was the fifth wave since W402, so `export-web.mjs` ran
BEFORE `publish.mjs`.

### NEXT

**A1 gun `$A` `$2A8B7C`** -- `$11E` entry-to-entry, `$F4` of code (`4E75` AT `$2A8C6E`, after
`$2A8C66 moveq #$A / jsr $259B08`), the remaining `$3C` being gun `$B`'s template and blob. That is
the frame-4016 stop, and it is the third member that actually closes the `$F/$10/$11` loop.

## W406 NOTES

### W403 DROPPED PHASE B'S EXIT, AND NOTHING NOTICED FOR THREE WAVES

`$2A7226 4EFA 006C` is `jmp $2A7294`, and all three ways out of `$2A71C6` land on it. W403 did not
port it. The consequence was invisible because it is a store with no consumer: `bossExitShared` had
**no phase-B caller at all**, so `$2A7088 subq.w #$1,($1A,A5)` never ran for phase B, and A4 `$F`'s
closing `$2A6A6C move.b #$C,($1A,A5)` went nowhere. Measured: `($1A,A5)` sat at `$6270` for all 390
frames between A4 script 4 and A4 `$F`. Fixed in `src/hibachi2.js`.

This is the shape to watch for: **a missing jump does not throw, it just quietly removes a caller.**

### A1 GUN 9 AND A4 $F ARE PORTED; THE PATH RUNS TO FRAME 3317

Gun 9 `$2A89BA/$2A89F4`: `$1C2` table-entry to table-entry, of which **`$156` is code**. Bounded by
`4E75` AT `$2A8B0E` which `$2A8AE8`'s `bcc.w` lands on exactly, by gun `$A`'s template at `$2A8B4C`
(so `$2A8B10..$2A8B7B` is gun `$A`'s data, not gun 9's), and by `$2A72C8[$A].init`. Sixteen shots a
volley in two mirrored arms picked by `btst #$0,($4,A4)`, sweeping +-1 per volley inside a **signed**
band `[-$20,+$20]` -- `$2A8AD0 6C00` is BGE, not BCC. Bullets went 3,745 -> **4,865**.

New stop: **frame 3317 at `$2A6AB6`**, A4 `$11`'s init, a PORT stop waiting on gun `$B`.

### TWO CONVENTIONS THE LAST THREE WAVES STATED TOO BROADLY

1. **Not every gun has a freeze arm.** `4A79 008130D4` stands at ten of the fourteen step entries;
   **guns 9, `$A` and `$D` have none**. `$2A89F4` is `532C 0002 / 6502 / 4E75`. A frozen gun 9 keeps
   burning volleys and stepping its sweep, and the spawn core's own gate `$2814BA` discards them.
2. **The scripts do not run in id order and `$12` is an orphan.** `$F -> $11 -> $10 -> $F` is a
   closed three-link loop (`$2A6A5C moveq #$11`, `$2A6AE8 moveq #$10`, `$2A6AA2 moveq #$F`), and an
   enumeration of every `moveq #n / jsr $25980C` in `$2A4000..$2AB000` yields 17 ids with `$12` not
   among them.

### THE ENDING CHAIN STILL DOES NOT COMPLETE, IN THE CARTRIDGE'S OWN TERMS

Completing means `$2595E8` suspending the stage. Only A4 `$14` reaches it, and only script 1's
first-loop arm starts A4 `$14`. This bench is the other arm, so the route out is phase B's death
(`$2A722E`) into A4 `5`, still counted at `$3AA`. Do not report "the ending runs" on the grounds that
a run did not stop.

### SIXTY ABLATIONS, FIVE GREEN, FOUR REAL

The byte cap's `bls` vs `bcc` agree everywhere except AT `$1E`; two phase-B arms were never driven
because the real path only takes the middle one; and `pickTarget(a5)` vs `(a6)` pick the same record
whenever only one player is alive. One mutation was invalid (a no-op both consumers mask) and was
replaced by one that reddens. One is a labelled equivalence: D1's bits 8..15 have no consumer, since
`$28158E`/`$281596` are `move.b` and gun 9's D3 is a literal rather than a `$26BFFC` index.

### WINDOWS: ONE NEW, 594

`$2A898C + $E`, gun 9's template. Three bounds: `$2A89BA`'s own `lea`, `moveq #$6` + `dbra` = 7 words
(n+1), and `base + $E = $2A899A` where the eight `$002A89BA` self-pointers begin.

### VERIFIED

Suite **3615 pass / 0 fail / 0 skipped** (3590 before; +25). Gate **exit 0** from its own exit code.
`export-tables.py --verify` **OK at 594 windows**.

### PUBLISH IS DUE NEXT WAVE

W407 is the fifth since W402. **Run `export-web.mjs` BEFORE `publish.mjs`** -- W404, W405 and W406
all added windows, so publishing without regenerating serves stale assets.

### NEXT

**A1 gun `$B` `$2A8C9A`** (`$236`, counted) and **A4 `$11` `$2A6AB6`** (`$46`), which is what the
frame-3317 stop waits on. A4 `$10` (`$40`) closes the three-link loop behind it.
