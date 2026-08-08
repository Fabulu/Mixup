# Gradius (NES, Konami 1986) - phase 2

**Status: stage 1 plays, kills, is killed, and can be heard.** `src/` is a running
port of the play path - the Vic Viper, the Options, the terrain streamer, the HUD,
the enemy spawn engine and update loop, the `$1B` state machine with the stage intro
and pause, collision, death, the explosion and the checkpoint respawn (wave 5), the
weapons and the kill chain (wave 6), the power-up loop (wave 7), the `$ED02` sound
driver (wave 8), the enemy bullets (wave 11) and, since wave 13, an NES APU
synthesiser that turns the driver's register writes into sound - verified
frame-exact against the cartridge by `tools/test-all.mjs`.

**What is still absent, and it is named rather than left to be discovered:**
game over / continue, the boss and the end of
stage 1, stages 2-7, two-player, and the fifteen enemy handlers wave 12's audit
found reachable. Every unported arm in `src/` throws with the ROM address the
cartridge would have reached; nothing is a silent no-op. The notes below are the
cartridge facts and the decisions the port was built on; the header of each one
says what is measured and what is not.

**The frame loop is measured, not assumed (wave 14).** `tools/framecost.mjs` is
the only thing in this repo that has ever asked what a frame COSTS, and it is a
stage of `tools/test-all.mjs`: `nmi()` costs a median of 0.039 ms of the
16.639 ms budget, the wave-13 synthesiser 0.78 ms, and `renderFrame()` 2.48 ms.
Before wave 14 the renderer cost **6.07 ms -- 36% of the whole budget** and
nothing would have said so. Input is taken **one word per LOGIC frame** off a
queue the DOM handlers fill (`src/input.js`), not re-read from the live mask
inside the catch-up loop: a press and its release that both landed between two
animation frames used to be invisible. The page prints `k` -- logic frames per
animation frame -- next to the lag counter, because that number needs a real
browser and this repo has none. See
`docs/worklog/gradius/14-impl-input-granularity.md`.

**Wave 14's input fix was only half a fix, and wave 15 measured the other half.**
Wave 14's rule at the queue's cap was "the newest state overwrites the tail", so
a press and its release arriving while the queue was full wrote the tail twice
and the press never occupied a slot -- and a finger sliding on the touch d-pad
holds the queue at the cap continuously. Measured, k=1, no host load: **a sliding
finger plus FIRE tapped ten times a second fired 0 of 20 shots.** Wave 15
replaced the rule with a merge that carries every undelivered press forward
(`tail := w | (tail & ~prev)`, derived from `$8206`'s `pressed = now & ~prev`):
the same input now fires **20 of 20**. The cap is still 2 and the memory bound is
still two words. See `docs/worklog/gradius/15-impl-input-queue-fix.md`.

**The sound is honest about what it claims.** Wave 8 proves the REGISTER STREAM
matches the cartridge, per frame, over the whole corpus. Wave 13's synthesiser
(`src/audio/apu.js`) turns that stream into samples and is checked for
determinism and for structural properties only - there is deliberately no gate
comparing emitted PCM against an emulator's audio, because that claim would
inherit the emulator's own guesses about the chip. See
`docs/worklog/gradius/13-impl-audio-output.md` and `games/ddpdoj/NOTES-sound.md`.

**Playing it.** Serve the repo (`python -m http.server 8000`) and open
`/games/gradius/` - a standalone page, not the root launcher, because the launcher
imports `code.entry`/`code.mods`/`code.input` and this port has only `boot()`.
Arrows or `W`/`A`/`S`/`D` fly, `Enter` is START, `Z`/`X` are B/A. **Sound starts on
your first key or tap** - every browser refuses audio before a user gesture, so the
page says what it is waiting for rather than being silently mute, and there is a
mute button beside the stats. **On a phone the page draws an on-screen pad** (coarse
pointers only): a d-pad hit-tested as a 3x3 grid, so a finger in a corner third
reports two directions at once - the ship's mover tests X and Y independently and
has no diagonal case, so a diagonal is exactly two bits. See
`docs/worklog/gradius/00-touch-controls.md`, including the list of things only a
human with a real phone can check.

Read `docs/knowledge/` first - most of what Batman cost us was method, not Game Boy
knowledge, and all of it applies here.

| file | what is in it |
|---|---|
| [`NOTES-rom.md`](NOTES-rom.md) | vectors, the NMI, shadow OAM, where the split is |
| [`NOTES-lag.md`](NOTES-lag.md) | the lag plan |
| [`NOTES-render.md`](NOTES-render.md) | **the renderer, measured** - CHR banks, palettes, nametables, sprites, and the two raster bands, with a pixel-exact rebuild of real frames as the evidence |
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
| mapper | **3 - CNROM** |
| mirroring | vertical |
| battery | no |

**This is about as friendly as an NES cartridge gets, and it matters.** Mapper 3 does
exactly one thing: it switches the 8 KB CHR bank via a write to `$8000-$FFFF`. There is
**no PRG banking at all** - all 32 KB is mapped at `$8000-$FFFF` permanently. So unlike
Batman, where a routine's identity depended on which of eight banks was paged in and the
disassembler had to track `$2000` writes, here **an address is an address**. That removes
an entire category of the confusion that made the Game Boy listing hard to reason about.

The trade is that CHR is *bank-switched data*, so which tileset is visible depends on the
last write to the mapper register. Track it the same way the GB port tracked `$FFB0`.

## What has to be decided before writing code

### 1. The reference emulator - SETTLED: Mesen 2.1.1, headless via `--testRunner`

Measured, not assumed. Full evidence and the traps it hides in:
[`tools/oracle/README.md`](tools/oracle/README.md).

Mesen's `--testRunner` mode runs a Lua script against a ROM with **no window at
all** (`MainWindowHandle : 0` on the live process) and exits with whatever code
the script passes to `emu.stop(n)`. It gives all three capabilities:

- **execution hooks** - `emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr,
  emu.cpuType.nes, emu.memType.nesMemory)`, the direct counterpart of PyBoy's
  `hook_register`. Proven by hooking `$806A` (the NMI vector, read out of PRG at
  runtime) and reading CPU registers and zero page at that instruction.
- **direct memory access** - CPU RAM, OAM, PPU memory, palette RAM, all readable
  *and* writable mid-run, with side-effect-free `nesDebug`/raw memory types.
- **deterministic headless stepping + framebuffer** - two separate processes
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
Mesen on the same frame - useful as a second opinion, not as the reference).

### 2. The NES counterparts of the DMG rules that bit us

`docs/knowledge/04-platform-gameboy.md` lists each Game Boy hardware fact that cost real
work, paired with the NES question it implies. Each of these must be **measured**, not
assumed from the Game Boy answer:

- **8 sprites per scanline** (not 10), and the sprite-overflow flag. Does Gradius rely on
  it? It is a shooter with a lot on screen, so almost certainly yes - and its flicker
  pattern is part of how the game looks.
- **Sprite priority is by OAM index only** on the NES, with no X-coordinate rule - the
  opposite of the DMG, where getting this wrong cost us a full investigation. Do not
  inherit the Batman renderer's logic.
- **Mid-frame effects**: the NES uses sprite-0 hit and mapper scanline IRQs. Mapper 3 has
  no IRQ, so Gradius must use **sprite-0 hit** (or timed code) for its status-bar split.
  Find it early; the split is structural, not decoration.
- **OAM is 64 entries × 4 bytes**, Y and X each a single byte - same wrap trap as the DMG.
- **Free-running counters** whose boot phase is load-bearing: find them, measure their
  value at the first gameplay frame rather than starting from zero.
- **Palette**: NES palette RAM is written through PPU ports during VBlank. Same class of
  trap as the DMG palette shadows, which produced a "softlock" that was really an
  invisible running game.

### 3. LAG IS A PRIMARY TARGET HERE, not an artifact to tag

Read `docs/knowledge/06-lag-and-slowdown.md` before writing any harness code.

On Batman lag was declared out of scope and tagged. That was defensible there - single
frames, minutes apart, on a platformer. **It is the wrong default here**, for two reasons:

1. Gradius is famous for slowing down when the screen fills, and shooters are generally
   *balanced* around that. If the difficulty depends on it, it has already crossed from
   artifact to mechanic.
2. The target after this is **DoDonPachi DaiOuJou**, where slowdown is unambiguously a
   gameplay mechanic. Gradius is the rehearsal for getting timing right.

The mechanism is already located (`NOTES-rom.md`): **`$04` is the lock.** The NMI at
`$806A` reads it at `$8073` and bails immediately if non-zero, raises it at `$809F`,
clears it at `$80B5`. Note what the bail skips - OAM DMA, the PPU register writes, every
`JSR` in the handler - which means on the NES a lag frame is **visible**, unlike the Game
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
before importing any game code. Gradius is **not** in that registry yet - it goes in when
there is something to boot.
