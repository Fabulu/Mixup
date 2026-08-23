# Mixup

Hand-translating console games from their disassembly into readable, modifiable
JavaScript - **not** emulation. There is no CPU interpreter here. Every ROM
routine is read out of the original machine code and rewritten as a JS function
you own, carrying the address it came from, so the game can be read, retuned and
modded like any other source code.

Fidelity is not a claim, it is a measurement: an emulator runs the real ROM
headless beside the port and the two are diffed field by field, frame by frame.

## The three games

| game | machine | state |
|---|---|---|
| **Batman: Return of the Joker** - Sunsoft, 1992 | Game Boy | **complete** - title screen to end credits, bit-exact |
| **Gradius** - Konami, 1986 | NES | **all seven stages play, the game ends and loops**; no known divergences |
| **DoDonPachi DaiOuJou (Black Label)** - Cave / AMI, 2002 | IGS PGM arcade | W523 fixes the all-pairs round-2 selector stall after W522's first stage-3 progression blocker; production build `20260823074549` publishes W517 through W521, W522-W523 are local, and D109 now targets a parallel asset-free public release by 2026-08-28 |

Each game lives in its own directory behind `games/index.json`, and the launcher
picks a game before it loads any game code. That structure exists for a reason
beyond tidiness: the long-term goal is games that can be **combined** - Batman
playable inside Gradius, the Vic Viper playable in Batman.

## No ROM in this repository

Three cartridges, three rights holders, and none of their material is here: no
ROM, no disassembly listing, no extracted graphics, level maps, sprite art or
music. `.gitignore` enforces it, and it is checked rather than assumed -
`tools/verify_assets.py` and the `asset-integrity` gate stage both operate on
files that only exist after *you* run an exporter against *your* own copy.

**The published site is a separate question, and the answer is not the same.**
`tools/build-dist.mjs` reads every ROM present and blocks any file that appears
byte-for-byte inside one - against 12 ROM files, 333 files checked, 58 of them
also checked decompressed. It is not, however, absolute: **six files are
published verbatim on purpose**, each enumerated in `PUBLISH_VERBATIM` with its
own line of reasoning, and the list is printed on every single build. They are
Batman's player animation tile pool and five DaiOuJou sprite colour shards -
art the ports cannot draw their own characters, enemies or death explosions
without. That is a deliberate owner decision: **the live site may serve real
cartridge art; the repository may not, and does not.**

The exceptions exist because of what the guard actually measures, which is
**packing order, not provenance**: every sprite these pages draw is cartridge
art, and a shard trips the check only when its streams happen to sit
consecutively in the ROM so the packed buffer is one contiguous run. Decoding
the colour data to one pixel per byte would retire all six at once, and is
recorded in `build-dist.mjs` with its measured cost.

The guard blocks everything not named in that list, and the load-bearing rule is
unchanged - nothing ROM-derived is ever committed here.

Everything derived is regenerated from ROMs **you** legally own:

```sh
# Batman - put your own copy at the repo root, named exactly:
#   Batman - Return of the Joker (USA, Europe).gb
python tools/export_assets.py     # -> games/batman/assets/
python tools/gen_tunables.py      # -> games/batman/src/tunables.js

# Gradius - "Gradius (USA).nes" at the repo root
python games/gradius/tools/export_assets.py

# DoDonPachi DaiOuJou - the ddpdojblk MAME set
python games/ddpdoj/tools/export-tables.py
node   games/ddpdoj/tools/export-web.mjs
```

The copies this was built against: Batman SHA-1
`345a332175f58304f91111a13b770662e5ea92c3`, Gradius SHA-1
`92645fe142861c3d3fda209bb906ad2b0e353988`, DaiOuJou MAME set `ddpdojblk`
(the `maincpu` region is 6 MiB; its FNV-64 is recorded in
`games/ddpdoj/game.json`). Each game's `game.json` carries the full identity
block, so a differently-dumped copy announces itself instead of silently
diverging.

## Running it

Export the assets from your own cartridges first, then:

```sh
python -m http.server 8000     # module imports and fetch need a real server
# then open http://localhost:8000
```

The launcher lists whichever games have assets present. Gradius has its own
start screen (`games/gradius/start.html`) with level select, a starting
power-up picker, mod presets and the mod catalogue.

## The method

This is the part worth reading even if you never touch the code.

**The oracle.** An emulator runs the real ROM headless, dumps a per-frame state
vector, and the port's own vector is diffed against it field by field. The rule
is to report the **first** divergence per field, not the loudest one - a
downstream symptom is not the bug. One emulator per machine:

| game | emulator | driven by |
|---|---|---|
| Batman | PyBoy | Python |
| Gradius | Mesen 2.1.1 | Lua |
| DaiOuJou | MAME 0.288, `-video none -sound none -nothrottle` | Lua |

It exists so that "faithful" is a checkable property rather than a vibe, and it
has caught a long list of bugs that reading the disassembly did not - from an
unsigned-byte terminal-velocity clamp, to Batman being drawn mirrored for his
entire run, to a carry that failed to propagate through an `RTS` and borrowed
1/256 of a pixel on 243 of 3,826 frames.

**Enumerate statically, validate dynamically.** The ROM is the *inventory* -
it tells you what exists. The oracle is the *verdict* - it tells you what is
right. Neither substitutes for the other, and confusing them is how this project
has produced its most confident wrong answers. `docs/knowledge/09`.

**Coverage is branches, not frames.** A million frames through one arm of a
dispatch is not coverage. `docs/knowledge/10`.

`docs/knowledge/` is the cross-game distillation - the oracle method, the eight
trap shapes, what makes a check capable of failing, clocks and frame rates, lag
and slowdown, rank and dynamic difficulty. `docs/00-MASTER-REFERENCE.md` is the
authoritative Batman spec; `docs/worklog/` is the per-wave record for the two
games in flight.

Two traps are worth knowing before reading any of this code:

- **Follow the fall-through, not the label.** A routine that looks like it
  returns often runs straight on into the next one. This is the most expensive
  trap in the project's history and it has bitten repeatedly, once invalidating
  an already-shipped handler.
- **Byte-exact data is not a correct picture.** A screen can match the
  cartridge's VRAM to the byte and still render wrong, because what is missing
  is not data but whether anything *draws* it. That is why several gate stages
  compare pixels, and why "renders without throwing" is not a check.

## Layout

| path | what |
|---|---|
| `games/index.json` | the registry the launcher reads before it loads any game code |
| `games/<id>/game.json` | the manifest: ROM identity, screen, frame rate, entry point, levels, options |
| `games/<id>/src/` | the port |
| `games/<id>/tests/` | unit tests - they run **without** any ROM, on synthetic fixtures |
| `games/<id>/assets/` | extracted from your own copy; never committed |
| `games/<id>/tools/` | that game's extractors, oracle and gates |
| `tools/` | Batman's extractors and disassembler, the shared build and publish path |
| `tools/oracle/` | Batman's PyBoy oracle (a test tool; it never ships) |
| `docs/knowledge/` | the cross-game lessons - read this before starting a new game |
| `docs/worklog/` | the per-wave record for Gradius and DaiOuJou |
| `SAVEPOINT.md` | the working map: what is done, what is not, and the traps |
| `HANDOVER.md` | the whole project in one file, for picking it up cold |

Two files in `games/batman/src/` are load-bearing for ORDER and say so in their
headers: `game/frame.js` (the `$0567` main-loop body - call order here is
shadow-OAM order, which is DMG sprite priority and the ten-sprites-per-line cut)
and `enemies/driver.js` (the `$FFA7` parity that reverses the slot walk). Each
names the test that guards it.

## Testing

There is **one gate per game**, and they are separate runners:

```sh
npm test                                        # Batman unit tests only
npm run test-all                                # Batman gate - 27 stages
node games/gradius/tools/test-all.mjs           # Gradius gate - 13 stages
node --test games/gradius/tests/                # Gradius unit tests
node --test games/ddpdoj/tests/                 # DaiOuJou unit tests
npm run typecheck                               # tsc over the ports - no ROM needed
```

`node tools/publish.mjs` is the only thing that runs **all** of them, and it
refuses to publish on a red gate or an unexpected gate skip. `--only gradius` /
`--only ddpdoj` gate one game; `--dry` gates and builds without deploying.

At published DDPDOJ W521, its unit suite records **4,404/4,404 passing**.
The same publication passed all **746/746 Gradius units**, the **13/13
Gradius gate with zero skips**, the DDPDOJ bundle and web-fetch gates, the **27/27
Batman gate with zero skips**, the distribution build, and the repository ROM-leak
guard. Production build `20260823074549` supersedes `20260823031213`, carries
W517 through W521, and passed deployment plus three consecutive live confirmations.
The published export has 783 windows, 448,021 bytes, and 77 overlap pairs. The source
commits are `e28336b`, `f2266f8`, `7918d8a`, `4ce2536`, and `4c6a8c2`; publication
repairs `e55af96` and `b2e671c` reconcile the measured overlap registry. The leak guard
checked 333 files, including 58 decompressed payloads, and the deployed distribution
contains 339 files totalling 20,446 KB. W526 is the next periodic publication point.

**A skip is not a pass.** Both gate runners tell apart a legitimate
environmental skip (no emulator, no cartridge) from a skip caused by a moved
path, which is a failure - because `ALL GREEN - 2 passed, 24 skipped` is the
most dangerous output a test runner can produce. `docs/knowledge/03`.

**A new check must be seen to fail.** Revert the fix, watch it go red, restore.
Checks here have sat green through the very bug they were written for, in four
different ways: one asserted only that rendering did not throw, one set up state
the application never has, one sampled frames that never changed, and one took
the answer in as an argument.

## Where each game stands

### Batman - complete

27/27 gate stages with zero skips, 50/50 oracle scenarios bit-exact over 14,519
frames, 96.023% mean pixel match across the 73-frame visual suite. All fourteen
levels playable, every boss, title screen through to the end credits.

Bit-exact and covered by the gate: player physics, collision and slopes, camera,
wall-cling and wall-jump, the bat-rope, punch and batarangs; all 13 enemy AI
states and every boss; all 11 map-object types, the door sequencer, breakables
and pickups; the six `sub_00_2CBE` subsystems; both death sequences at their
real length; all eight arms of the `$0857` raster program; the sound driver and
DMG APU across all 47 ROM sound ids, 52 recordings and 29,800 ticks; and every
screen from the SUNSOFT copyright card to the ending.

**Nothing is captured.** Every screen is BUILT from ROM data and diffed against
the cartridge's own VRAM. `src/` contains no ROM data at all - every table
travels through `assets/manifest.json`, and `tools/verify_assets.py` re-reads
each one from raw file offsets so the exporter cannot verify itself.

Two deliberate deviations, both documented, neither to be "fixed": the water's
50% dither is reproduced spatially rather than as the hardware's 30 Hz
alternation (on a modern display that alternation is a photosensitivity hazard
rather than the translucency a DMG's slow LCD made of it), and a parallax feeder
race kept the way that measured better - the lookahead costs 6,288 bad
scanlines, dropping it costs 8,112.

### Gradius - playable end to end

All seven stages, the ending, and the loop back round. Measured, not assumed:
598 of 598 wave records spawn a ported handler across all seven stages; 41 of 42
`$AE1C` enemy-dispatch entries; all 16 play sub-states; all 7 `$80D4` game
modes. `$1A` is no longer pinned, so the game wraps to loop 2 - and loops 2, 3
and 6 sweep frame-for-frame identically, because every gameplay reader of `$1A`
has three tiers, so difficulty tops out at loop 3 rather than at the ending
table's 7.

Six crashes that had shipped were found and fixed after `stageledger.py`'s
RUNNABLE column turned out to mean "statically guarded", not "plays" - the
replacement, `stagesweep.mjs`, actually runs 112,000 frames in 2.7 s.

**19 mods** in three categories (physics, combat, chaos) and 4 presets, on a
start screen with level select and a starting power-up picker. They include
`heal-gradius-syndrome` (respawn in place with your loadout, instead of the
checkpoint death-spiral) and `always-on-enemies`, which lifts the NES
sprite-per-scanline cap without removing the flicker the game uses deliberately.

### DoDonPachi DaiOuJou - Black Label in progress

The active translation targets Black Label Version-B first. Its source now spans
the main loop, player and all three weapon systems, bombs, bullets, enemies,
bosses, items and bees, stage and result flow, score and chaining, hypers, rank,
HUD, sound posts, and high-score name entry. The browser port and generated
asset path are live, and W521 published as production build `20260823074549`
after all 4,404 DDPDOJ unit tests passed. W477 shipped the first
15 optional mods, including explicit Invincibility, while an empty loadout remains
vanilla. W492 through W496 raise the catalogue to 30 with Hyper Overdrive, Adaptive Slow
Motion, Bee Magnet, Boss Enrage, Graze Reactor, Glass Cannon, Auto Deathbomb,
Resurrection in Place, Revenge Bullets, Bullet Polarity, Score Multiplier Mayhem,
Friendly Converted Bullets, Loop 2 From Stage 1, Boss Rush, and Stage Remix. Each
remains behind explicit state-local simulation seams or an ordinary-launch copy, and
all fifteen block replay v1.
W478 ports the loop-aware hyper contribution to enemy-bullet speed, with its
zero-power flag branch corrected during the W481 publication gate. W479
restores the mirrored player bonus followers, and W480 closes the final type-5
frame call with the hyper-stock animation. W481 follows corrected live stage-5
evidence into type `$4C`'s first runtime-selected child, type `$52`. W482 follows
the next runtime blocker into type `$4E`, whose expiry emits two independently
positioned type `$4F` children. W483 completes that nested type `$4F` lifecycle:
it decelerates, reverses, rank-accelerates, selects either zoom sprite bucket,
and retires with effect kind `$04`. W484 ports type `$50`, type `$4C`'s part-4
runtime child: it moves and draws for a `$30`-frame lifetime, then emits type
`$51`, while sharing type `$4F`'s parent-gated effect retirement. W485 completes
that terminal type `$51` lifecycle: it arms retirement once seen, moves without a
freeze gate, decelerates, reverses, rank-accelerates, animates through either zoom
bucket, and frees after leaving the screen. W486 restores type `$4C` state 4's
live step-1 steering gate at `$26FD8C..$26FD98` and paired fall-through arm at
`$26FDF4..$26FEC7`. Step 1 now holds until arrival at `$3200/$1C00`; only then
does record `+$1E` begin ramping by `$40` to `$600`. Eight every-eighth-frame
passes each enqueue a paired type `$58` emission with separate packed biases and
headings. W487 ports type `$58` init body `$270BE4` and handler `$270C66`. The
16-child queue now drains successfully; each child inherits heading, moves with
vertical acceleration, cadence-filters a three-heading fan, draws with the
existing `$270972` art table, and retires on a fatal hit, parent loss, or its signed
off-screen bound. W488 restores the shared front-end label printer `$25F2D0`: both
screen slots now draw each side's two cartridge strings in side order through
`$25A14C`, using the two fixed descriptors at `$25F43A`. W489 removes the fly-around
oracle's embedded `$810424=$FF` hold from ordinary browser launches, so vanilla play
is mortal and has no persistent invulnerability aura. Labelled progression and replay
seeds remain exact, explicit Invincibility still starts and stays at `$FF`, and sound is
now enabled by default on the first browser gesture while SOUND remains an explicit
mute/on control. W490 makes replay and recording banners transient: arm, save, playback,
verdict, and operation-error notices clear after four seconds, while replacement invalidates
the old timer so a stale callback cannot hide newer text. W491 lets every layout hide and
restore the menu, gives the aspect-preserving canvas all available viewport area, top-aligns
it when the other axis cannot grow, overlays translucent mobile controls, and shows the
floating stick's origin and bounded displacement only while held. Coverage is 101 ported,
25 unknown, and 130 null, with 94 init bodies. Type `$58` emits no enemy child,
and the remaining static `$48 -> $54` edge is disabled behind Version B's
`$2714AE` return, so no next runtime blocker has been established. W492 through W521
are live in production build `20260823074549`; W492 through W496 supplied all fifteen requested transformative
mods. W497 is the first substantial D26 cartridge-choice slice: ordinary browser starts
can select Type-A or Type-B with numeric style selectors 2, 4, or 6, independently
of mods. Both ships have their complete browser-packed 17-image animation, attached
shadow/glow, shot, option, regular-laser, ordinary-bomb, and laser-bomb dependencies.
The cartridge does not yet prove the human pilot-name mapping, so the UI does not
guess it. Empty and default launches remain byte-exact. The coordinator repeated W497's
159/159 bounded affected set, and its regenerated bundle remains
15,955,968/15,955,968 pixel-identical while containing 4,898 validated sprite streams
in 12,623.9 KiB. W498 restores authentic Game Over art and shared mobile P1 COIN/START
with lifecycle-safe first-controller coin edges. W499 completes D106: browser Gamepad
index 0 drives P1, index 1 drives P2 through the existing two-half `$C08000` machine
word, and each controller has its own active-low `$C08004` coin path. Standard,
PlayStation, Nintendo/Switch, and conservative generic DirectInput profiles are
supported; mobile remains P1-only. W500 advances D34's cartridge state-7 path:
`$25FAA4` now draws both one/two-round labels from ROM, applies the last joined
side's directional input while OR-ing both sides for confirmation, blinks the chosen
mode for 32 ticks, stores it to `$80393A`, and queues the cartridge clear before
retirement. Its exact `$25FC68+$20` data window raises the registry to 634 windows
without changing 76 overlap pairs. W501 closes state 7's remaining counted head:
`$25F530` selects P1 or falls back to P2, and `$25F592` installs each record's palettes,
draws the main sequence and zoomed detail pair, advances the pause satellites, and retires
at sequence `$9C`. Three exact disjoint animation windows at `$25F7C8+$A0`, `$25F880+$78`,
and `$25F8F8+$40` raise the published registry to 637 windows and 444,613 bytes without moving the
76 overlap pairs. W502 removes D34's sole counted per-record edge by porting
`$25E72E..$25E7B7`. Both live and dead records take its exact side selection, announcement
and active-record label exits, `$25F1EC` credit-message carry path, coordinate adjustment,
art-offset selection, and `$23E08C` bucket-7 enqueue. The exact disjoint windows
`$25E716+$18` and `$25F270+$60` raise the registry to 639 windows and 444,733 bytes while
preserving 76 overlap pairs. W503 ports dispatch type `$13` at `$28EE88`, restoring the
bounded stage-5 ending tally and type-7 handoff. W504 through W516 follow that natural
loop-2 edge through variant 0's complete five-script list and sequence list A's first eight entries,
emitting 325 visible pool records and completing thirteen `$8003` resource lifecycles. W509's
`$2914F0..$291549` script proves `$8005`: operands 1 and 3 publish banner 1, select W372's
existing two-node `$290E1C` mode-0 resource, run its two exact 32-word palettes for 32 animation
steps, and free it. W510 adds `$29154A..$29159F`, W511 adds `$2915A0..$291603`, W512 adds
`$291604..$29166B`, W513 adds `$29166C..$291691`, W514 adds `$291692..$2916D9`, W515
adds `$2916DA..$2916FF`, and W516 adds `$291700..$29177B`, all without a new opcode arm.
W516's four groups emit 38 records: the first 26 arrive on consecutive `$0000` cadence, then
`$0202` spaces the final 12 by three frames. After the `$C0` wait, `$8003 $0003` completes its
one-node `$290E76` primary resource while `$8005 $0000 $0003` runs the two-node `$290D42`
first phase for 32 steps and returns directly to idle because banner 0 is already live. `$FFFF`
advances the cursor from 28 to 32, clears the pool, and reaches entry 8 at `$29177C`. W517 finishes
sequence list A. W518 follows the normal handoff through slot [15]'s complete credits-text lifecycle, W519
through slot [14]'s normal Game Over lifecycle, W520 through slot [12]'s zero-score no-name exit, and W521
into slot [8]'s first stable state-2 high-score presentation. Production build `20260823074549` publishes
W517 through W521 with 783 windows, 448,021 bytes, and 77 overlap pairs after 4,404/4,404 DDPDOJ units,
all bundle and web gates, the cross-game gates, the distribution build, the ROM-leak guard, deployment, and
three consecutive live confirmations. The source commits are `e28336b`, `f2266f8`, `7918d8a`, `4ce2536`,
and `4c6a8c2`; publication repairs are `e55af96` and `b2e671c`. W522 starts the six authentic-pair loop-2
matrix. The default pair reaches stage 3, exposes unported type `$3D`, and crosses that boundary after its exact
init and handler are translated. The local registry is 785 windows, 448,099 bytes, and 77 overlap pairs.
Cartridge evidence now records exact `1 ROUND GAME` and `2 ROUND GAME` semantics, the round-2 qualification
gate, and the final Hibachi route truth table. W523 then fixes the shared round-2 slot-[17] stall: the nonzero
round branch skips only a style rewrite and still advances through both common tails to state 7. D109 now has
a hard 2026-08-28 deadline for a second public site that ships no cartridge assets and boots all three games
from locally supplied, exactly identified ROMs. Remaining ending variants will be batched by complete family or
variant rather than split into one commit per understood script.

That breadth does not mean the game is finished. The authoritative docket still
tracks explicit defects and gaps, front-end screens, remaining enemy coverage,
and behavior through the complete second loop. All 23 type-5 frame calls now
run, while enemy-handler coverage is 102 ported, 24 unknown, and 130 null. The
duplicate scanners still report 16 narrow heads, 71 widened heads, 28 body
pairs, and 22 body-only findings, now deliberately deferred until functional
completion.

The completion order is deliberate: finish Black Label through the full second
loop, finish functional White Label, then close the duplicate-only audit rows. Current status
lives in `docs/DOCKET.md` and `docs/NEXT_AGENT_HANDOFF.md`; old numbered
worklogs are historical snapshots. `games/ddpdoj/README.md` contains setup,
asset, oracle, testing, and fidelity details.

## Contributing

`CONTRIBUTING.md` has the rules that actually matter. The short version:
**measure it against the ROM, or don't change it.** There is a correct answer to
every question in this repository and it is available, so "I think it works like
this" is never the standard.

Two habits that are not optional: **cite the ROM address** on every non-obvious
line, and **make a new check fail before you trust it**.

## Licence

MIT - see `LICENSE`. That covers this repository's own work: the ports, the
tooling, the tests and the docs.

It grants nothing over *Batman: Return of the Joker*, *Gradius* or *DoDonPachi
DaiOuJou*, which remain the property of Sunsoft, Konami and Cave respectively.
No ROM, listing or extracted asset is distributed here, and nothing runs without
ROM images you supply yourself. `NOTICE.md` sets out exactly what is and is not
included, and what this project is legally.
