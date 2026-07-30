# Gradius (NES, Konami 1986) — phase 2

**Status: not started.** This folder holds the cartridge facts and the decisions that
have to be made before any port code is written. Nothing here runs yet.

Read `docs/knowledge/` first — most of what Batman cost us was method, not Game Boy
knowledge, and all of it applies here.

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

### 1. The reference emulator — this is the blocking decision

The oracle method needs three things (`docs/knowledge/01-the-oracle-method.md`):
execution hooks, direct memory access, deterministic stepping with a readable
framebuffer. PyBoy gave us all three for the Game Boy. **Nothing is chosen for the NES
yet.** Candidates to evaluate, in that order of importance:

- Mesen — has a Lua scripting API with execution callbacks and memory access, and is the
  accuracy reference. Question: can it be driven headless and deterministically from a
  script, the way `PyBoy(rom, window='null')` can?
- `nes-py` / other Python cores — easy to drive, but check whether they expose
  *execution* hooks or only frame stepping and memory. Frame-stepping-only is a
  significant downgrade; half the bugs in Batman were found by hooking one address and
  reading a register at that instant.

**Do not start the port until this is settled.** The whole method depends on it, and
choosing wrong is expensive to undo.

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

### 3. What the crossover actually needs

The repo's goal is that Batman can appear in Gradius and the Vic Viper in Batman. Before
designing that, note what the Batman port makes hard: a "playable character" there is a
state machine plus metasprite tables plus tunables plus an animation-to-hitbox map, and
an *enemy* is a 32-byte record interpreted by a driver whose slot order, activation
windows and dispatch numbering are all Batman's. Borrowing a protagonist is plausible;
borrowing an enemy means either translating its record or running two drivers.

Gradius is the better place to design this, because it is being written *after* the
requirement is known. Keep the character's data separable from the driver from day one.

### 4. Coordinate and timing differences to encode once

- Screen is **256 × 240**, not 160 × 144. The launcher already reads screen size from
  `game.json` rather than baking constants.
- Frame rate is **60.0988 Hz** (NTSC), not the DMG's 59.73. It is in `game.json`; do not
  spell it a second time in the frame loop the way the Game Boy port did.

## Where this sits

`games/gradius/` per the phase-2 layout: each game owns its `src/`, `tests/`, `assets/`
and a `game.json` manifest, with `games/index.json` as the registry the launcher reads
before importing any game code. Gradius is **not** in that registry yet — it goes in when
there is something to boot.
