# DoDonPachi DaiOuJou

This directory contains the JavaScript translation of **DoDonPachi DaiOuJou Black Label Version-B** for the IGS PGM board. It is a source port, not a 68000 emulator. Cartridge routines are translated into named JavaScript functions and retain their original ROM addresses so behavior can be checked against the board.

## Current status

Updated 2026-08-22 after local Wave 502; production remains W501 build `20260822192350`.

| area | current state |
|---|---|
| target | Finish Black Label Version-B through the full second loop, finish functional White Label, then close deferred duplicate-only findings. |
| port | Active across the game loop, player, weapons, enemies, bosses, stage flow, scoring, chaining, hypers, rank, HUD, result and name-entry systems. W477 added the shipped 15-mod start menu without changing the vanilla simulation path. W478 ports the loop-aware enemy-bullet speed bias, W479 restores the mirrored bonus followers, W480 restores the hyper-stock animation and closes all 23 type-5 calls, W481 ports stage-5 type `$52`, W482 ports type `$4E`, W483 completes its nested type `$4F` lifecycle, W484 ports type `$50`, and W485 completes terminal child `$51`. W486 restores type `$4C` state 4's live step-1 steering gate at `$26FD8C..$26FD98` and paired fall-through arm at `$26FDF4..$26FEC7`: step 1 holds until `$3200/$1C00`, record `+$1E` then ramps by `$40` to `$600`, and eight due passes emit paired type `$58` children with distinct packed biases and independently advanced headings. W487 ports type `$58` init body `$270BE4` and handler `$270C66`. All 16 queued children now drain, inherit their heading, move with vertical acceleration, fire the cartridge's cadence-filtered fan, draw through the existing `$270972` art table, and retire on a fatal hit, parent loss, or the signed off-screen bound. W488 ports `$25F2D0`, the shared two-line per-side label printer used by the front-end screen machinery; it selects the cartridge descriptors at `$25F43A/$25F43E` and draws both `$10`-strided strings through `$25A14C` in cartridge order. W489 removes the fly-around oracle's embedded `$810424=$FF` intervention from ordinary browser launches, so vanilla play is mortal and the invulnerability aura is absent; labelled progression and replay seeds remain exact, and explicitly selected Invincibility still starts and stays at `$FF`. Sound is now enabled by default on the first browser gesture, while SOUND remains an explicit mute/on toggle. W490 makes every large replay and recording notice transient: REC armed/saved, playback start/verdict/error, and local operation failures clear after four seconds; replacement invalidates the old timer so stale callbacks cannot hide newer text, and hiding clears banner content and overlay state. W491 adds menu hide/reveal controls in every layout, uses the available viewport with the aspect-preserving fill path, anchors the picture at the top when an axis has spare room, overlays semi-transparent mobile controls, and paints the floating stick's origin and bounded displacement only while it is held. W492 expands the mod catalogue from 15 to 19 with Hyper Overdrive, Adaptive Slow Motion, Bee Magnet, and Boss Enrage. W493 expands it to 23 with Graze Reactor, Glass Cannon, Auto Deathbomb, and Resurrection in Place. W494 expands it to 26 with Revenge Bullets, Bullet Polarity, and Score Multiplier Mayhem. W495 expands it to 28 with Friendly Converted Bullets and Loop 2 From Stage 1. W496 completes the requested roster at 30 with Boss Rush and Stage Remix. Their narrow hooks and ordinary-launch seed copy are state-local and absent from vanilla Games, and all fifteen additions block replay v1. Revenge Bullets uses scored fatal retirement of an ordinary enemy to emit one aimed bullet through the central allocator. Bullet Polarity makes unfocused shot movement ignore Bank A and focused laser movement ignore Bank B independently for each player. Score Multiplier Mayhem applies a deterministic packed-BCD x1 through x8 factor only to final pending score-ledger additions. Friendly Converted Bullets turns each ordinary canceled enemy bullet into an upward projectile in the authentic P1 shot pool, while preserving the cancel impact and allocation refusal. Loop 2 From Stage 1 writes the loop counter only into an ordinary selected launch copy, leaving labelled progression, replay seeds, and later vanilla Games unchanged. Boss Rush dynamically retains each installed stage script's final approach records without hardcoded cartridge data. Stage Remix changes only the authentic next-stage value to route Stage 1, Stage 3, Stage 2, Stage 4, and Stage 5. Enemy-handler coverage is 101 ported, 25 unknown, and 130 null; 94 init bodies are registered. Type `$58` emits no enemy child. The static `$48 -> $54` edge remains in Version B's disabled `$2714B0` body behind the live `$2714AE` return, so no next runtime blocker has been established. W497 begins D26 with the cartridge-proven ship domain `{0,2}` and style domain `{2,4,6}`. Ordinary P1 browser launches now select all six pairs independently of mods, with complete packed Type-B main, shadow, ordinary-glow, and down-stick-glow art plus player and option shots, all reachable regular-laser groups, both 4/8/4 ordinary-bomb phase families, and both laser-bomb families translated. Both ships deliberately share selector-zero horizontal hitbox behavior. Empty and default launches remain exact. The cartridge evidence does not yet map selectors 2, 4, and 6 to human pilot names, so the browser uses numeric slots rather than guessing. W498 restores missing Game Over presentation inside slot 14's existing 300-frame object interval by harvesting both authentic eight-entry rank-selected sprite tables. Their seven-entry overlap yields nine distinct cartridge streams, all packed into boot shard 0, while slot 14's existing `$23DECE` enqueue path remains unchanged. No TX synthesis or DOM overlay is used. The shared mobile cluster now exposes P1 COIN beside the existing START button in AUTO, FIXED, and FLOAT layouts. COIN1 uses the active-low `$C08004` 12-call pulse while START remains on `$C08000`; Standard first-controller back/select and start use those same respective paths. Controller coin input is sampled as an edge, and disconnect, blur, page hide, document visibility change, and replay boundaries cancel and block a stale held SELECT until release. Keyboard, KeyY plus KeyZ shot, replay gates, menu hide/reveal, viewport fill, translucent overlays, and floating-stick visuals remain unchanged. W499 completes D106's physical-controller docket. Browser Gamepad index 0 owns P1 and index 1 owns P2; both provide directions, shot, bomb, auto, start, and separate select-backed coin edges. P1 and P2 are packed into the low and high byte paths of the board's existing one-word `$C08000` contract, and P2 coin clears active-low bit 1 of `$C08004`. The shared layer now resolves the W3C Standard layout plus explicit legacy PS3, modern PlayStation, Nintendo/Switch, and conservative generic DirectInput profiles, including common digital d-pads, axes 6/7, and POV-hat layouts. Unknown devices without at least a safe complete fallback remain inactive. Mobile and keyboard remain P1-only, while replay clears, disconnect, blur, page hide, and visibility lifecycle boundaries block held coin buttons until release. W500 advances D34's live state-7 path by porting `$25FAA4..$25FBF1` and its bounded local leaves `$25FBF2` and `$25FC14`. The ordinary-loop selector now draws both cartridge one/two-round labels through the shared TX blitter, preserves the last-joined-side directional test and all-joined-side confirm OR, posts the move and confirm cues, copies the chosen mode to `$80393A`, blinks for 32 ticks, and queues the exact `$240EBC` clear before retiring. Its labels stay in the exact `$25FC68+$20` ROM window; no DOM or source text replaces them. W501 closes the remaining state-7 head by porting `$25F530..$25F57F` and inner `$25F592..$25F7C1`. The head selects an eligible P1 record when D7 is nonzero and otherwise falls back to P2. The inner body installs the common and selected palettes once, walks the main frame sequence, pauses at `$5C`, draws two distinctly flagged zoom details plus indexed satellites, advances their scales and sprite cursor, and retires at `$9C`. `$25F7C8+$A0`, `$25F880+$78`, and `$25F8F8+$40` are the three exact new cartridge windows. Local W502 removes D34's sole counted per-record draw by porting `$25E72E..$25E7B7` and only the `$260A7C/$25F1EC` behavior it actually reaches. Both live and dead records now select the correct side, draw cartridge labels on the global, announcement-state-4, or active-record exits, preserve carry-setting two-line credit messages, select the returned art offset, adjust each packed coordinate half independently, and enqueue through ordinary bucket-7 stub `$23E08C`. `$25E716+$18` and `$25F270+$60` are exact disjoint cartridge windows. W502 is local only; production remains W501 build `20260822192350`, W506 is the next publication wave, and no next gameplay target has yet been established. Black Label is not complete yet. |
| tests | W496 publication passed all 4,360 DDPDOJ unit tests with no failures or skips, the DDPDOJ bundle and web-fetch gates, all 746 Gradius units, the 13/13 Gradius gate, the 27/27 Batman gate, the distribution build, and the ROM-leak guard. W491's focused viewport, fullscreen, browser-default, notice, and input set remains 46/46. W492's focused affected set passes 133/133 and its final collected-bee correction set passes 46/46. W493's focused and directly affected set passes 232/232. W494's focused and directly affected set passes 118/118. W495's focused and directly affected set passes 89/89. W496's focused and directly affected set passes 170/170. The coordinator independently repeated W497's bounded authentic-selection, Type-B, shot, render, bomb, beam-art, and ROM-window set at 159/159 with no failures or skips. The full suite was not run for W497. The regenerated W497 bundle remains 15,955,968/15,955,968 pixel-identical. W497 table regeneration produced 633 windows and 444,237 exported ROM bytes. W498's focused authentic Game Over sprite, packed-map/runtime, mobile input, coin debounce, replay gate, object-slot, controller lifecycle, and metadata set passes 93/93 with no failures or skips. The full suite was not run. `export-web.mjs` regenerated the ignored browser assets, and W498 was not published. W499's bounded controller regression plus shared-input, web-input, W375 coin-debounce/wiring, and W498 preservation set passes 83/83 with no failures or skips. W500's bounded selection, slot, registry, and ROM-window set passes 193/193 with no failures or skips. W501's compact state-7 head, lifecycle, exact-extent, directly affected select-screen integration, and ROM-window set passes 101/101 with no failures or skips. JavaScript syntax checks pass. `export-tables.py` regenerated the ignored local table export at 637 windows and 444,613 bytes; the three new animation windows are disjoint, so overlap pairs remain 76. The final quiet-tree publication passed 4,397/4,397 DDPDOJ units with zero failures or skips, the DDPDOJ bundle and web-fetch gates, 746/746 Gradius units, the 13/13 Gradius gate, the 27/27 Batman gate, the distribution build, and the ROM-leak guard. Build `20260822192350` deployed successfully and passed three production live polls. W497 through W501 are published. Local W502's compact per-record draw, slot, context, shared-label, state-7 preservation, and registry set passes 54/54 with no failures or skips. JavaScript syntax checks pass. `export-tables.py` regenerated 639 windows and 444,733 exported bytes; both new windows are disjoint, so overlap pairs remain 76. The full suite, browser export, and publication did not run for W502. Production remains W501 build `20260822192350`, and W506 is the next publication wave. |
| duplicate audit | 16 narrow heads, 71 widened heads, 28 body pairs, and 22 body-only findings remain after W497; functional completion precedes their consolidation. |
| oracle | MAME 0.288, pinned to VERSION-B. Determinism and probe behavior are documented in `NOTES-oracle.md`. |
| renderer | The original pixel-slice gate matched `13,647,872 / 13,647,872` pixels over 136 frame pairs. This is historical slice evidence, not a claim that the unfinished full game is pixel-perfect. |
| live build | `20260822192350` at <https://gbtman.pages.dev/games/ddpdoj/> publishes W497 through W501 and supersedes `20260822120853`. |

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

At W498, `export-web.mjs` regenerated a 12,803.6 KiB local bundle containing 4,907 validated sprite streams, including the nine authentic slot-14 Game Over streams in boot shard 0, 33 ship-bank streams, and 85 Type-B attached shadow/glow streams. Its 161 captured frames contain 7,671 records. The 915.3 KiB first-frame set and 11,888.3 KiB deferred set include every cartridge-selected regular-laser group and both ships' ordinary-bomb and laser-bomb art. `rip/` and `assets/` are ROM-derived, gitignored, and must not be committed.

Whenever a wave adds a ROM window, regenerate with `export-web.mjs` before publishing. Otherwise the deployed site serves stale generated data even when the source is current.

## Run locally

After exporting assets:

```sh
python -m http.server 8000
# open http://localhost:8000/games/ddpdoj/
```

Module imports and asset fetches require HTTP rather than opening `index.html` directly.

The repository game launcher opens `start.html`, where any of 30 optional mods can be selected and launched through a deterministic `#mods=id+id` hash. Authentic cartridge choices are separate controls: ship selector 0 or 2 and pilot/style selector 2, 4, or 6 use a query string such as `?ship=2&style=4`. The numeric style labels are deliberate because the cartridge census has not proven their human pilot-name mapping. Opening `index.html` directly, selecting the default pair (ship 0, style 2), using an empty hash, or supplying only unknown mod ids creates no authentic patch or mod runtime and preserves the ordinary default path. Replay v1 refuses recording and playback while simulation-changing mods are active; Invert Colors, Monochrome, and Ghost Trail are presentation-only and remain replay-compatible.

Keyboard P1 coin/start remain `Digit5` and `Enter`, and every mobile scheme remains P1-only with one shared COIN and START row. For physical pads, browser Gamepad index 0 drives P1 and index 1 drives P2. Each has directions, shot, bomb, auto, start, and its own back/select coin edge: P1 clears `$C08004` bit 0 and P2 clears bit 1. Both player states enter the real low/high halves of `$C08000`. The shared profiles cover W3C Standard pads, legacy and modern PlayStation layouts, Nintendo/Switch layouts, and conservative generic DirectInput pads with common d-pad button, axis-pair, or POV-hat exposure. A held controller coin cannot rearm after disconnect, blur, page hide, document visibility change, or replay entry/exit until sampled release; the next genuine press works.

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
