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
| **DoDonPachi DaiOuJou (Black Label)** - Cave / AMI, 2002 | IGS PGM arcade | active Black Label Version-B translation; full second loop and docket still in progress |

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
byte-for-byte inside one - against 12 ROM files, 330 files checked, 58 of them
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

At DDPDOJ W476, its unit suite records **4,281/4,281 passing**. The same
publication completed the Gradius unit and 13-stage gate, the DDPDOJ bundle and
web-fetch gates, the 27-stage Batman gate, and the repository ROM-leak guard.
Live build `20260821205739` is the recorded release. These counts document that
release; each change still needs its relevant focused check.

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
asset path are live, and W476 published as build `20260821205739` after all
4,281 DDPDOJ unit tests passed. W477 adds a shipped start screen with 15 optional
mods, including explicit Invincibility, while an empty loadout remains vanilla.
W478 ports the loop-aware hyper contribution to enemy-bullet speed.

That breadth does not mean the game is finished. The authoritative docket still
tracks explicit defects and gaps, front-end screens, remaining enemy coverage,
and behavior through the complete second loop. W478 raises the type-5 frame
family to 21 of 23 calls. The duplicate
scanners still report 15 narrow heads, 68 widened heads, 27 body pairs, and 22
body-only findings, now deliberately deferred until functional completion.

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
