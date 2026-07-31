# Gradius (NES, Konami 1986) — phase 2

**Status: stage 1 flies.** `src/` is a running port of the play path — the Vic Viper,
the Options and the terrain streamer, verified frame-exact against the cartridge by
`tools/test-all.mjs`. There are no enemies and no sound. The notes below are the
cartridge facts and the decisions the port was built on; the header of each one says
what is measured and what is not.

**Playing it.** Serve the repo (`python -m http.server 8000`) and open
`/games/gradius/` — a standalone page, not the root launcher, because the launcher
imports `code.entry`/`code.mods`/`code.input` and this port has only `boot()`.
Arrows or `W`/`A`/`S`/`D` fly, `Enter` is START, `Z`/`X` are B/A. **On a phone the
page draws an on-screen pad** (coarse pointers only): a d-pad hit-tested as a 3x3
grid, so a finger in a corner third reports two directions at once — the ship's mover
tests X and Y independently and has no diagonal case, so a diagonal is exactly two
bits. See `docs/worklog/gradius/00-touch-controls.md`, including the list of things
only a human with a real phone can check.

Read `docs/knowledge/` first — most of what Batman cost us was method, not Game Boy
knowledge, and all of it applies here.

| file | what is in it |
|---|---|
| [`NOTES-rom.md`](NOTES-rom.md) | vectors, the NMI, shadow OAM, where the split is |
| [`NOTES-lag.md`](NOTES-lag.md) | the lag plan |
| [`NOTES-render.md`](NOTES-render.md) | **the renderer, measured** — CHR banks, palettes, nametables, sprites, and the two raster bands, with a pixel-exact rebuild of real frames as the evidence |
| [`NOTES-player.md`](NOTES-player.md) | the player actor (written by a parallel workstream) |
| [`NOTES-terrain.md`](NOTES-terrain.md) | the stage data (written by a parallel workstream) |
| [`tools/oracle/PROBE.md`](tools/oracle/PROBE.md) | the reference probe and the RAM map |

## The cartridge

Measured from the ROM, not looked up:

| | |
|---|---|
| file | `Gradius (USA).nes` (kept at the repo root, gitignored, supply your own) |
| size | 65,552 bytes = 16-byte iNES header + 65,536 |
| SHA-1 | `92645fe142861c3d3fda209bb906ad2b0e353988` |
| CRC32 | `54f1af1f` |
| PRG | **32 KB** (2 × 16 KB) |
| CHR | **32 KB** (4 × 8 KB banks) |
| mapper | **3 — CNROM** |
| mirroring | vertical |
| battery | no |

**This is about as friendly as an NES cartridge gets, and it matters.** Mapper 3 does
exactly one thing: it switches the 8 KB CHR bank via a write to `$8000-$FFFF`. There is
**no PRG banking at all** — all 32 KB is mapped at `$8000-$FFFF` permanently. So unlike
Batman, where a routine's identity depended on which of eight banks was paged in and the
disassembler had to track `$2000` writes, here **an address is an address**. That removes
an entire category of the confusion that made the Game Boy listing hard to reason about.

The trade is that CHR is *bank-switched data*, so which tileset is visible depends on the
last write to the mapper register. Track it the same way the GB port tracked `$FFB0`.

## What has to be decided before writing code

### 1. The reference emulator — SETTLED: Mesen 2.1.1, headless via `--testRunner`

Measured, not assumed. Full evidence and the traps it hides in:
[`tools/oracle/README.md`](tools/oracle/README.md).

Mesen's `--testRunner` mode runs a Lua script against a ROM with **no window at
all** (`MainWindowHandle : 0` on the live process) and exits with whatever code
the script passes to `emu.stop(n)`. It gives all three capabilities:

- **execution hooks** — `emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr,
  emu.cpuType.nes, emu.memType.nesMemory)`, the direct counterpart of PyBoy's
  `hook_register`. Proven by hooking `$806A` (the NMI vector, read out of PRG at
  runtime) and reading CPU registers and zero page at that instruction.
- **direct memory access** — CPU RAM, OAM, PPU memory, palette RAM, all readable
  *and* writable mid-run, with side-effect-free `nesDebug`/raw memory types.
- **deterministic headless stepping + framebuffer** — two separate processes
  produced a byte-identical 256×240 dump (sha256 `8b74199b…`) and identical
  values in every reported field. Savestates round-trip exactly, and scripted
  input via `emu.setInput` is both effective and reproducible.

Run it yourself:

```
python games/gradius/tools/oracle/setup_mesen.py          # unattended, no compiler
python games/gradius/tools/oracle/capability_probe.py --twice
python games/gradius/tools/oracle/input_probe.py
```

Rejected after being installed and run against the real cartridge: **nes-py**
(refuses this ROM's NES 2.0 header; and no execution hooks, no registers, no OAM
or PPU memory) and **jsnes** (no hook API, and 13.94% of its pixels disagree with
Mesen on the same frame — useful as a second opinion, not as the reference).

### 2. The NES counterparts of the DMG rules that bit us

`docs/knowledge/04-platform-gameboy.md` lists each Game Boy hardware fact that cost real
work, paired with the NES question it implies. Each of these must be **measured**, not
assumed from the Game Boy answer:

- **8 sprites per scanline** (not 10), and the sprite-overflow flag. Does Gradius rely on
  it? It is a shooter with a lot on screen, so almost certainly yes — and its flicker
  pattern is part of how the game looks.
- **Sprite priority is by OAM index only** on the NES, with no X-coordinate rule — the
  opposite of the DMG, where getting this wrong cost us a full investigation. Do not
  inherit the Batman renderer's logic.
- **Mid-frame effects**: the NES uses sprite-0 hit and mapper scanline IRQs. Mapper 3 has
  no IRQ, so Gradius must use **sprite-0 hit** (or timed code) for its status-bar split.
  Find it early; the split is structural, not decoration.
- **OAM is 64 entries × 4 bytes**, Y and X each a single byte — same wrap trap as the DMG.
- **Free-running counters** whose boot phase is load-bearing: find them, measure their
  value at the first gameplay frame rather than starting from zero.
- **Palette**: NES palette RAM is written through PPU ports during VBlank. Same class of
  trap as the DMG palette shadows, which produced a "softlock" that was really an
  invisible running game.

### 3. LAG IS A PRIMARY TARGET HERE, not an artifact to tag

Read `docs/knowledge/06-lag-and-slowdown.md` before writing any harness code.

On Batman lag was declared out of scope and tagged. That was defensible there — single
frames, minutes apart, on a platformer. **It is the wrong default here**, for two reasons:

1. Gradius is famous for slowing down when the screen fills, and shooters are generally
   *balanced* around that. If the difficulty depends on it, it has already crossed from
   artifact to mechanic.
2. The target after this is **DoDonPachi DaiOuJou**, where slowdown is unambiguously a
   gameplay mechanic. Gradius is the rehearsal for getting timing right.

The mechanism is already located (`NOTES-rom.md`): **`$04` is the lock.** The NMI at
`$806A` reads it at `$8073` and bails immediately if non-zero, raises it at `$809F`,
clears it at `$80B5`. Note what the bail skips — OAM DMA, the PPU register writes, every
`JSR` in the handler — which means on the NES a lag frame is **visible**, unlike the Game
Boy case where only internal updates were dropped. Confirm that by measurement.

Requirements for the harness, from the first probe onward:

- **Census lag in every run**, printed by default, not on request.
- **Put it in the compared state vector**, so a port that cannot reproduce it is forced to
  diverge visibly rather than quietly.
- **Determine exactly what a lag frame skips**, subsystem by subsystem.
- **Check the lag census before diagnosing any timing-shaped divergence.** On Batman two
  separate "regressions" turned out to be a single lag frame one frame earlier.

### 4. What the crossover actually needs

The repo's goal is that Batman can appear in Gradius and the Vic Viper in Batman. Before
designing that, note what the Batman port makes hard: a "playable character" there is a
state machine plus metasprite tables plus tunables plus an animation-to-hitbox map, and
an *enemy* is a 32-byte record interpreted by a driver whose slot order, activation
windows and dispatch numbering are all Batman's. Borrowing a protagonist is plausible;
borrowing an enemy means either translating its record or running two drivers.

Gradius is the better place to design this, because it is being written *after* the
requirement is known. Keep the character's data separable from the driver from day one.

### 5. Coordinate and timing differences to encode once

- Screen is **256 × 240**, not 160 × 144. The launcher already reads screen size from
  `game.json` rather than baking constants.
- Frame rate is **60.0988 Hz** (NTSC), not the DMG's 59.73. It is in `game.json`; do not
  spell it a second time in the frame loop the way the Game Boy port did.

## Where this sits

`games/gradius/` per the phase-2 layout: each game owns its `src/`, `tests/`, `assets/`
and a `game.json` manifest, with `games/index.json` as the registry the launcher reads
before importing any game code. Gradius is **not** in that registry yet — it goes in when
there is something to boot.
