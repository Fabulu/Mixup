# DoDonPachi DaiOuJou

This directory contains the JavaScript translation of **DoDonPachi DaiOuJou Black Label Version-B** for the IGS PGM board. It is a source port, not a 68000 emulator. Cartridge routines are translated into named JavaScript functions and retain their original ROM addresses so behavior can be checked against the board.

## Current status

Updated 2026-08-22 after Wave 482.

| area | current state |
|---|---|
| target | Finish Black Label Version-B through the full second loop, finish functional White Label, then close deferred duplicate-only findings. |
| port | Active across the game loop, player, weapons, enemies, bosses, stage flow, scoring, chaining, hypers, rank, HUD, result and name-entry systems. W477 added the shipped 15-mod start menu without changing the vanilla simulation path. W478 ports the loop-aware enemy-bullet speed bias, W479 restores the mirrored bonus followers, W480 restores the hyper-stock animation and closes all 23 type-5 calls, W481 ports stage-5 type `$52`, and W482 ports type `$4E`, the next live child of type `$4C`. Enemy-handler coverage is now 97 ported, 29 unknown, and 130 null. Black Label is not complete yet. |
| tests | W482's focused lifecycle, registry, coverage, dependency, and ROM-window set passes 43/43. The published W481 gate passed all `4,305` DDPDOJ unit tests with no failures or skips. |
| duplicate audit | 15 narrow heads, 68 widened heads, 27 body pairs, and 22 body-only findings remain after W475. |
| oracle | MAME 0.288, pinned to VERSION-B. Determinism and probe behavior are documented in `NOTES-oracle.md`. |
| renderer | The original pixel-slice gate matched `13,647,872 / 13,647,872` pixels over 136 frame pairs. This is historical slice evidence, not a claim that the unfinished full game is pixel-perfect. |
| live build | `20260822010546` at <https://gbtman.pages.dev/games/ddpdoj/>. |

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

The repository game launcher opens `start.html`, where any of 15 optional mods can be selected and launched through a deterministic `#mods=id+id` hash. Opening `index.html` directly, using an empty hash, or supplying only unknown mod ids creates no mod runtime and remains cartridge-faithful. Replay v1 refuses recording and playback while simulation-changing mods are active; Invert Colors, Monochrome, and Ghost Trail are presentation-only and remain replay-compatible.

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
