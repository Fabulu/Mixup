# DoDonPachi DaiOuJou

This directory contains the JavaScript translation of **DoDonPachi DaiOuJou Black Label Version-B** for the IGS PGM board. It is a source port, not a 68000 emulator. Cartridge routines are translated into named JavaScript functions and retain their original ROM addresses so behavior can be checked against the board.

## Current status

Updated 2026-08-22 after Wave 495 local verification.

| area | current state |
|---|---|
| target | Finish Black Label Version-B through the full second loop, finish functional White Label, then close deferred duplicate-only findings. |
| port | Active across the game loop, player, weapons, enemies, bosses, stage flow, scoring, chaining, hypers, rank, HUD, result and name-entry systems. W477 added the shipped 15-mod start menu without changing the vanilla simulation path. W478 ports the loop-aware enemy-bullet speed bias, W479 restores the mirrored bonus followers, W480 restores the hyper-stock animation and closes all 23 type-5 calls, W481 ports stage-5 type `$52`, W482 ports type `$4E`, W483 completes its nested type `$4F` lifecycle, W484 ports type `$50`, and W485 completes terminal child `$51`. W486 restores type `$4C` state 4's live step-1 steering gate at `$26FD8C..$26FD98` and paired fall-through arm at `$26FDF4..$26FEC7`: step 1 holds until `$3200/$1C00`, record `+$1E` then ramps by `$40` to `$600`, and eight due passes emit paired type `$58` children with distinct packed biases and independently advanced headings. W487 ports type `$58` init body `$270BE4` and handler `$270C66`. All 16 queued children now drain, inherit their heading, move with vertical acceleration, fire the cartridge's cadence-filtered fan, draw through the existing `$270972` art table, and retire on a fatal hit, parent loss, or the signed off-screen bound. W488 ports `$25F2D0`, the shared two-line per-side label printer used by the front-end screen machinery; it selects the cartridge descriptors at `$25F43A/$25F43E` and draws both `$10`-strided strings through `$25A14C` in cartridge order. W489 removes the fly-around oracle's embedded `$810424=$FF` intervention from ordinary browser launches, so vanilla play is mortal and the invulnerability aura is absent; labelled progression and replay seeds remain exact, and explicitly selected Invincibility still starts and stays at `$FF`. Sound is now enabled by default on the first browser gesture, while SOUND remains an explicit mute/on toggle. W490 makes every large replay and recording notice transient: REC armed/saved, playback start/verdict/error, and local operation failures clear after four seconds; replacement invalidates the old timer so stale callbacks cannot hide newer text, and hiding clears banner content and overlay state. W491 adds menu hide/reveal controls in every layout, uses the available viewport with the aspect-preserving fill path, anchors the picture at the top when an axis has spare room, overlays semi-transparent mobile controls, and paints the floating stick's origin and bounded displacement only while it is held. W492 expands the mod catalogue from 15 to 19 with Hyper Overdrive, Adaptive Slow Motion, Bee Magnet, and Boss Enrage. W493 expands it to 23 with Graze Reactor, Glass Cannon, Auto Deathbomb, and Resurrection in Place. W494 expands it to 26 with Revenge Bullets, Bullet Polarity, and Score Multiplier Mayhem. W495 expands it to 28 with Friendly Converted Bullets and Loop 2 From Stage 1. Their narrow hooks and ordinary-launch seed copy are state-local and absent from vanilla Games, and all thirteen block replay v1. Revenge Bullets uses scored fatal retirement of an ordinary enemy to emit one aimed bullet through the central allocator. Bullet Polarity makes unfocused shot movement ignore Bank A and focused laser movement ignore Bank B independently for each player. Score Multiplier Mayhem applies a deterministic packed-BCD x1 through x8 factor only to final pending score-ledger additions. Friendly Converted Bullets turns each ordinary canceled enemy bullet into an upward projectile in the authentic P1 shot pool, while preserving the cancel impact and allocation refusal. Loop 2 From Stage 1 writes the loop counter only into an ordinary selected launch copy, leaving labelled progression, replay seeds, and later vanilla Games unchanged. Enemy-handler coverage is 101 ported, 25 unknown, and 130 null; 94 init bodies are registered. Type `$58` emits no enemy child. The static `$48 -> $54` edge remains in Version B's disabled `$2714B0` body behind the live `$2714AE` return, so no next runtime blocker has been established. Black Label is not complete yet. |
| tests | W491 publication passed all 4,328 DDPDOJ unit tests with no failures or skips, the DDPDOJ bundle and web-fetch gates, every other game gate, the distribution build, and the ROM-leak guard. Its focused viewport, fullscreen, browser-default, notice, and input set remains 46/46. W492's focused affected set passes 133/133 and its final collected-bee correction set passes 46/46. W493's focused and directly affected set passes 232/232. W494's focused and directly affected set passes 118/118. W495's focused and directly affected set passes 89/89. The bundle gate remains 15,955,968/15,955,968 pixel-identical. `export-tables.py --verify` remains at 632 windows and 437,789 bytes. |
| duplicate audit | 15 narrow heads, 68 widened heads, 27 body pairs, and 22 body-only findings remain after W475. |
| oracle | MAME 0.288, pinned to VERSION-B. Determinism and probe behavior are documented in `NOTES-oracle.md`. |
| renderer | The original pixel-slice gate matched `13,647,872 / 13,647,872` pixels over 136 frame pairs. This is historical slice evidence, not a claim that the unfinished full game is pixel-perfect. |
| live build | `20260822080859` at <https://gbtman.pages.dev/games/ddpdoj/> supersedes `20260822042005` and carries W487 through W491. |

The live work queue is `../../docs/DOCKET.md`. The concise continuation state is `../../docs/NEXT_AGENT_HANDOFF.md`. Older numbered files under `../../docs/worklog/ddpdoj/` are historical wave records and may describe a much earlier port.

## What is and is not complete

The old README described a player-only vertical slice with no enemies or weapons. That stopped being accurate hundreds of waves ago. The port now contains broad cartridge-backed gameplay and presentation translations, including stage and boss object families, bullets, all three weapon systems, bombs, items and bees, result flow, high-score name entry, sound-post integration, and loop-aware systems.

That breadth is not the definition of done. Remaining explicit gaps, defects, front-end work, enemy coverage, and second-loop behavior stay open until they are translated and verified. The order is Black Label through its full second loop, then functional White Label, then the deferred duplicate-only cleanup.

## ROM and generated assets

No ROM, disassembly listing, or generated cartridge asset is committed to this repository. Supply a legally owned `ddpdojblk` MAME set locally. The expected identity is recorded in `game.json`; the decrypted 6 MiB `maincpu` region has SHA-256:

```text
4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c
```

Generate the local tables and browser bundle with:

```sh
python games/ddpdoj/tools/export-tables.py
node games/ddpdoj/tools/export-web.mjs
```

At W471, `export-web.mjs` produced a 12,401 KiB local bundle containing 4,355 sprite streams and 161 captured frames with 7,671 records. `rip/` and `assets/` are ROM-derived, gitignored, and must not be committed.

Whenever a wave adds a ROM window, regenerate with `export-web.mjs` before publishing. Otherwise the deployed site serves stale generated data even when the source is current.

## Run locally

After exporting assets:

```sh
python -m http.server 8000
# open http://localhost:8000/games/ddpdoj/
```

Module imports and asset fetches require HTTP rather than opening `index.html` directly.

The repository game launcher opens `start.html`, where any of 28 optional mods can be selected and launched through a deterministic `#mods=id+id` hash. Opening `index.html` directly, using an empty hash, or supplying only unknown mod ids creates no mod runtime and remains cartridge-faithful. Replay v1 refuses recording and playback while simulation-changing mods are active; Invert Colors, Monochrome, and Ghost Trail are presentation-only and remain replay-compatible.

## Test and gate

The unit suite uses synthetic fixtures and does not require a ROM:

```sh
node --test games/ddpdoj/tests/
```

ROM-backed and browser checks require locally generated data:

```sh
python games/ddpdoj/tools/export-tables.py --verify
node games/ddpdoj/tools/bundlegate.mjs
node games/ddpdoj/tools/webgate.mjs
```

The repository-wide publication path runs every game gate, rejects gate failures and disallowed gate skips, checks for ROM leakage, builds the distribution, deploys it, and polls the live site:

```sh
node games/ddpdoj/tools/export-web.mjs
node tools/publish.mjs
```

Publishing requires a quiet working tree. Pushing Git does not publish the site, and publishing does not replace a Git push.

## Machine and oracle facts

DaiOuJou runs on an **IGS PolyGameMaster (PGM)** board, not on a proprietary Cave board. The relevant hardware is a 68000 at 20 MHz, a Z80 at 8.4672 MHz, and IGS023 video. The refresh rate is exactly `15625 / 264`, or approximately `59.185606 Hz`.

Bullets are sprites. The first `0xA00` bytes of main RAM form a vblank-DMA sprite list with a hard maximum of 256 ten-byte entries. That capacity is gameplay behavior and must remain visible in the port.

MAME's IGS027A protection ROM is marked `NO_DUMP`. MAME simulates the device and decrypts the 68000 image in place. Oracle evidence therefore identifies the decrypted VERSION-B image rather than pretending it is an untouched physical ROM dump. See `NOTES-machine.md` for the memory map, sprite format, set identity, and provenance details.

The oracle is MAME 0.288 in headless mode. Lua hooks observe execution and state, and repeated runs established deterministic output for the validated scenarios. Static ROM analysis inventories branches and routines; dynamic oracle comparisons decide whether translated behavior is correct. Neither substitutes for the other.

## Slowdown remains a fidelity requirement

Slowdown in a Cave shooter is gameplay, not cosmetic performance loss. Dense patterns, movement timing, scoring, and survival depend on it. A translation with correct logic but wrong slowdown is still wrong.

The remaining slowdown work must establish its mechanism, granularity, determinism, and whether game state advances per frame or per partial update. `../../docs/knowledge/06-lag-and-slowdown.md` records the architectural distinctions that must not be guessed.

## Key paths

| path | purpose |
|---|---|
| `src/` | translated game code |
| `src/render/` | browser renderer and display-list interpretation |
| `tests/` | ROM-free synthetic unit and regression tests |
| `tools/` | exporters, scanners, gates, and the MAME oracle |
| `assets/` | generated browser data, gitignored |
| `rip/` | generated ROM extraction data, gitignored |
| `game.json` | game metadata and ROM identity |
| `../../docs/DOCKET.md` | authoritative open and completed work ledger |
| `../../docs/NEXT_AGENT_HANDOFF.md` | current continuation state |

## Historical capability record

The project began with a preparatory question: could MAME provide deterministic headless stepping, execution hooks, readable machine state, and framebuffer evidence strong enough to support the same oracle method used for Batman and Gradius?

That question was answered yes. Early waves validated MAME's Lua API, exact timing, VERSION-B identity, asset decoding, display-list translation, and a pixel-perfect vertical slice. Those experiments justified the current port architecture. Their measurements remain in `NOTES-oracle.md`, `NOTES-assets.md`, `NOTES-render.md`, `PLAN-vertical-slice.md`, and `../../docs/worklog/ddpdoj/`, but their old statements about an unexecuted page or missing weapons are historical only.
