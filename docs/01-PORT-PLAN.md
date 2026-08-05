# 01 - JAVASCRIPT PORT PLAN

Goal: translate the game's **code** into readable, modifiable JavaScript.
Original **data** (tiles, maps, metasprites, songs) is extracted to JSON/PNG
assets at build time. No emulator ships. Reference for every address cited:
`docs/00-MASTER-REFERENCE.md`.

Runtime target: vanilla ES modules + `<canvas>` + WebAudio (AudioWorklet).
No framework, no bundler required (optional esbuild for dev convenience).
Node 20 for build tooling; the existing Python extractors stay and grow.

---

## a) MODULE DECOMPOSITION

Directory layout (`src/`), with the disassembled routines each module absorbs.
Rule: one module per original subsystem; every function carries a
`// ROM: B:$AAAA` provenance comment.

| module | absorbs (by address) | contents |
|---|---|---|
| `main.js` | `00:0150-0563` (init parts), `00:0567-0650` main loop, `00:0A4F` frame gate | boot, fixed-step frame loop (59.7 Hz), main-loop call sequence in original order, pause, soft reset |
| `state.js` | (RAM replacement) | the single `GameState` object: player, camera, arrays, gameflow vars, RNG substitute. Structured clone-able for save-states/rewind |
| `input.js` | `00:07CC-07F6` | keyboard/gamepad → `held`/`pressed` bitmasks (same bit layout as `$FFE1/$FFE2`) |
| `player.js` | `00:1600-20B9`, `00:2777` (damage), `00:29E7-2AC9` (death), `00:1B00-1C3F` (anim select), `00:1D0C` (draw) | walk/jump/gravity/facing, wall-cling/wall-jump (`1F33/2000/1DA0`), punch (`201A`), batarang fire (`1990-1A28`), bat-rope (`193D-198D`, `1B6A`, `3D89`), knockback, i-frames, anim & hitbox tables |
| `collision.js` | `00:20BA-2418` probes, `00:11B9/11D9` map addressing, slope tables `221C-2408`, breakables `00:1E65`+`$C67B` timers, pickups `1:4D4E` | `probe(mode, dx, dy)`, `mapCell(col,row)`, slope resolution, tile mutation + restore queue |
| `camera.js` | `00:104E`, `00:121F`, `00:1287-1308` | camera follow + clamps; column-streaming becomes "mark BG tilemap dirty region" for the renderer |
| `level.js` | `00:0C34` (map), `00:2889` (metatiles/spawns/resources), `00:04BB-0563` (level init), `00:2820` (transition), `00:333F` (stage intro), `00:35E8` (route dispatch) | loads JSON assets into `state.map` (2 B/cell exactly as `$D000`), spawn arrays, per-level tables |
| `actors.js` | `1:4230-4D4D` (driver + 11 handlers at `1:$427B`), `1:4BE8` slot-free, `1:4A5C/4A79` movement helpers | `$C1E8` map objects: platforms, conveyors, doors, debris, vehicle |
| `enemies.js` | `1:4E0C-60DC` driver, dispatch `1:$50D3` states 1-6, 11-12 (`50ED, 5399, 55AA, 7750, 575C, 57D6, 59E0, 5B95`), hit-reaction dispatch `1:$60EF`, activation `1:6094`, contact damage `1:6666/6790` + tables `1:6BC1/6BCE`, player-hit tests `00:2654-2775`, `00:3C1B-3D0F` | `$C268` array logic |
| `bosses.js` | `1:6D8A` (B2), `1:7061` (B3), `1:7288` (Joker), `1:7591` (B1), `1:78A7` (parts), `1:77BD` (L14 mode), `1:6BDC` projectiles + templates, `00:0D50-0E74` boss arming, `00:3050-3126` rescue-helper cheat | one file per boss is fine if it grows |
| `effects.js` | pools: `00:0CC2` (effects/pickups), `00:0CF3`+`00:1445` (ballistics), `00:29ED/2A0D` (death particles), `00:3A35-3DFF` (batarang flight), rope segments `00:3DA6`, markers `1:7AB3` | all small object pools |
| `render/renderer.js` | VBlank `00:0653-0856` (transfer semantics), STAT `00:0857-095E` (raster program), `00:0BC6/0BAF` metasprites, `00:2C13` player tile stream, `00:3127` BG anim, `00:0F7B` HUD, window logic | scanline compositor (§c) |
| `render/vramscript.js` | `00:0A0E-0A4E` | VRAM-script interpreter operating on the JS tilemap (menus, stage intro, ending) |
| `gameflow.js` | `00:022E-04BA` (copyright/title/round select), `00:3893-39E1` (options + sound test), `00:34D0-3652` (clear sequencers), `00:3652-38A0` (ending), death flow | top-level state machine (§9.1 of master ref) |
| `hud.js` | `00:0F7B-0FCB`, cursor `00:0FCC` | energy bar, menu cursors |
| `sound/sequencer.js` | `7:$4000-46D4` entire driver, `00:0AE1` request mailbox, Timer-tick semantics | 1:1 port of the 56-opcode sequencer (§d) |
| `sound/apu-worklet.js` | (hardware behaviour, simplified per proven quirks) | 4-channel synth inside an AudioWorklet |
| `assets.js` | - | fetch + decode `assets/*` into typed arrays |
| `mods.js` | - | tunables registry + hook bus (see `02-MOD-SYSTEM.md`) |
| `debug.js` | - | state inspector, frame-step, trace recorder for oracle diffing |

Shell: `index.html` (mod selection screen + canvas), `launcher/` UI code.

Porting style rules:
1. Preserve original control flow per routine first (mechanical translation),
   then readability-refactor **behind the same function boundary** - never
   merge two ROM routines into one JS function until the oracle passes.
2. All game constants come from `tunables.js` (generated from §10 of the
   master reference) - never inline a magic number that the mod system owns.
3. The main loop's call ORDER is sacred (it defines OAM priority and
   platform-carry ordering). Keep the `00:0567` sequence verbatim.

---

## b) STATE REPRESENTATION - **keep fixed-point integer math** (decided)

The game's RAM becomes one plain JS object tree in `state.js`:

```js
state = {
  frame: 0, parity: 0,                    // $FFB1, $FFA7
  input: { held: 0, pressed: 0 },
  player: { x: 0, y: 0,                   // 12.4 fixed, SIGNED 16-bit ints
            vx: 0, vy: 0,                 // signed 8-bit semantics
            air: 0, facing: 0, hp: 10, hpMax: 10,
            anim: 0, animFrame: 0, iframes: 0, action: 0, /* $C71E */ ... },
  camera: { x: 0, y: 0, clampRight: 0 },  // 12.4
  map: Uint8Array(0x1000),                // exact $D000 image: {tileId, coll}*
  metatiles: Uint8Array(328),             // $C368 image
  objects: [8 × MapObject],               // $C1E8 records, named fields
  enemies: [8 × Enemy],                   // $C268 records, named fields
  batarangs: [3], rope: {...}, pools: {...},
  flow: { level: 1, routeMask: 0, lives: 5, difficulty: 1, ammo: 0, ... },
  raster: { mode: 0, ... },               // feeds the renderer
  sound: { queue: [] },
}
```

**Decision: integer 12.4 fixed-point, bit-for-bit, with 8/16-bit wrap
preserved via masks.** Rationale:

* The feel of this game IS its integer math: velocities are signed bytes,
  gravity is ±1/2/3 sixteenths per frame, slope tables are 1/16-px lookup
  values, terminal velocity is an exact byte compare, the crit RNG is
  `(LY ^ frame) < 8`, camera and streaming key off bit 7 of the X low byte.
  Floats reproduce none of the wrap/truncation semantics and every divergence
  becomes an un-diffable "feels slightly off".
* Verification (§f) is diff-based. Diffing requires identical integers.
  With floats there is nothing to diff against.
* JS integers are exact and fast; `(x + dx) & 0xFFFF` costs nothing.
* Readability is solved by encapsulation, not by floats: positions are stored
  in subpixels but accessed through helpers/getters (`px(v) = v >> 4`,
  `SUBPX = 16`), and all constants are expressed in the same named units in
  `tunables.js` (`gravityFalling: 3 /* subpx per frame² */`).
* Mods don't need floats either - they scale the same integer tunables.
  A mod that truly wants float physics can replace `player.js` wholesale via
  the hook system; the core stays exact.

Actor arrays become arrays of named-field objects (not byte buffers) - but
each field documents its original width and every arithmetic site masks
accordingly (`vy = (vy - 1) << 24 >> 24` for signed-byte semantics, provided
by helpers `i8()`, `u8()`, `u16()`).

The `$D000` map stays a real `Uint8Array` with the original layout - it is
performance-relevant, byte-addressed everywhere, and mods that edit terrain
get a stable format.

---

## c) RENDERING - scanline compositor over decoded tile atlases (decided)

Not a PPU emulator: it consumes **our JS state** (tilemap arrays, sprite list,
camera, raster program), but reproduces the layering/priority/palette rules so
the picture matches.

Design:

* **Native 160×144 `ImageData`**, drawn with `putImageData` to an offscreen
  canvas, scaled up via CSS `image-rendering: pixelated`. 23 040 px/frame is
  trivial; the whole compositor is one tight loop, and it makes every
  mid-frame effect free.
* Tile data: build-time-decoded **2-bit index arrays** (`tiles.bin`: 16 B/tile
  → 64 B/tile unpacked). Runtime keeps three JS "VRAM" tables mirroring the
  game's real ones: `bgTiles` (signed-id region), `objTiles` ($8000 region,
  incl. the 12 player tiles that `player-anim` streaming overwrites per frame),
  `bgMap`/`winMap` (32×32 byte arrays). `level.js`/`camera.js` write these
  exactly where the ROM wrote VRAM (column streaming, 2×2 queue, BG anim, VRAM
  scripts) - this is cheap and keeps menu screens working verbatim.
* **Raster program**: per frame, `renderer` asks the raster module (ported
  `$0857` state machine) to emit an ordered list of
  `{fromLine, scx, scy, bgp, obp0, obp1, wx, wy}` bands - identical values to
  what the ISR would have written. Water mode emits ~36 4-line bands using the
  same sine table; parallax mode emits 3 bands; default is 1 band.
* Per scanline: resolve the active band, then compose BG (tilemap fetch with
  scx/scy wrap), window (if `wy ≤ line` and `wx < 167`), then the ≤40 sprites
  from the ordered sprite list (8×16, x-flip/y-flip, OBP0/1, behind-BG bit,
  lowest-index-wins overlap, drop past 40 - same rules as `$0BC6` + DMG
  priority). 10-sprites-per-line hardware limit: **skip** (never load-bearing
  here; revisit only if a visual diff says otherwise).
* Palettes: BGP/OBP are 8-bit values mapping 2-bit pixels → 4 shades; the
  compositor applies the band's palette at pixel-write time (a 4-entry LUT per
  band - this is what makes fades, invuln blink, water darkening, and the
  Disco mod free).
* Shade → RGBA: one global 4-colour theme (classic DMG green + selectable
  themes later; a mod hook).

Sprite list: `render.spriteQueue` replaces shadow OAM - modules push
metasprite draws in main-loop order through a ported `drawMetasprite(table,
index, x, y, attrMask)`; the queue caps at 40 4-byte-equivalent entries with
original overflow behaviour.

---

## d) AUDIO - ported sequencer driving an AudioWorklet APU

Two layers, both ours:

1. **`sound/sequencer.js`** - a straight port of the bank-7 driver: 8 track
   objects (the 36-byte record becomes named fields), the 56-opcode
   interpreter, drum/slide presets, envelopes, arbitration (`owner = max
   track`), fader, and the 4-slot command mailbox fed by `soundRequest(id,
   mask)` calls from gameplay code. Songs are interpreted from the extracted
   song JSON (§e) - same streams, same FIXDUR context-sensitivity, `RET`
   fall-through at depth 0, big-endian active-pointer quirk collapses into
   normal JS variables.
2. **`sound/apu-worklet.js`** - an `AudioWorkletProcessor` implementing only
   what this game can reach (proven in master ref §8): 2 pulse channels with
   4 duty settings + volume-envelope (NRx2 applied on trigger only), 1 wave
   channel with a 32-sample buffer (only one waveform in the game) and 4-level
   volume, 1 LFSR noise channel (15/7-bit, NR43 divisor semantics), NR50/NR51
   panning/volume. **No length counters, no sweep, no zombie envelopes** -
   these are unreachable, so they are simply not implemented.

Timing (the critical part): the **sequencer runs inside the worklet**, ticked
every `sampleRate * 69 / 4096` samples (59.36 Hz, sample-accurate, immune to
rAF jitter and tab throttling). The main thread posts only mailbox commands
(`{id, mask}`) via `port.postMessage`; the worklet consumes ≤1 per tick like
the Timer ISR did. This mirrors the original architecture exactly: sound was
interrupt-driven and independent of the frame loop there, and it is here.

Consequence to accept: gameplay code cannot read sequencer state (it never
does in the ROM either - the interface is the one-way mailbox). Fades are
sequencer-internal, as in the ROM.

---

## e) ASSET PIPELINE

Build step `tools/export_assets.py` (new, wraps the existing rippers) writes
`assets/`:

| file | source | format |
|---|---|---|
| `tiles.bin` + `tiles.json` | all 33 resources via `$0B43` replay + player anim tiles (bank 2) + BG-anim frames | packed 2-bit indices, manifest = `{id: {offset, count, destVRAM}}`; PNG previews kept in `rip/` for humans |
| `levels/levelNN.json` | bank 3 + `3:$7A2A` LUTs | `{width, cells: [{t, c}...] column-major, collisionLUT, mapPatches}` |
| `metatiles.json` | `5:$4000` groups | per-group array of 4 tile ids |
| `metasprites.json` | `5:$5F5C` + `5:$736B` | two arrays of `[{dy,dx,tile,attr}...]` |
| `playerAnim.json` | `2:$4D8C` | 31 anims × 3 columns × 4 tile refs + hitbox table `0:$27A8` |
| `spawns.json` | `5:$46EC/$4716` | decoded named-field enemy/object records per level |
| `leveltables.json` | `0:$1015/$1023/$1031/$103F/$286D`, `1:$7C7D/$7CED`, raster modes, BG-anim tables | one object per level |
| `songs.json` | bank 7 via `dumpsong.py` logic | 47 songs → per-track event arrays `[{op, args}]` with resolved labels for loops/calls; pitch table; drum/slide preset definitions; the single waveform |
| `ui.json` | VRAM scripts (`5:$52F5/$5170`, `3:$7C15+`, `7:$7960+`, stage names, font map) | decoded script records (the JS interpreter replays them) |
| `constants/tunables.js` | master-ref §10 | **generated JS module** - single source of truth for mods |

Hardcoded in JS (small, code-adjacent): sine table `0:$09A2`, slope tables
`0:$221C-$2408`, fade ramps, HUD metasprite ids, anim-select tables.
Rule of thumb: if a mod plausibly edits it → JSON; if it is physics/logic
glue → generated `tunables.js`; if it is pure code shape → inline.

New extractor work needed: metasprite→JSON, spawn→JSON (leveltables.py mostly
does it), song→JSON serializer (dumpsong refactor), VRAM-script→JSON,
tiles.bin packer. All additions go in `tools/`, no throwaways.

---

## f) VERIFICATION STRATEGY - build the throwaway oracle: **yes** (decided)

Recommendation: **build a minimal headless SM83 interpreter as a test oracle.**
It never ships, it is not the game, and it is the only way to make "faithful"
a checkable property instead of a vibe. Honest cost: 3-5 days for a
good-enough core; it pays for itself the first week of physics porting.

Scope of the oracle (deliberately tiny, `tools/oracle/`):
* SM83 CPU interpreter + flat memory + MBC1 bank reg + the game's IRQ pattern:
  fire VBlank every 70224 cycles, Timer per 69×256 cycles, STAT/LYC modelled
  by cycle-derived LY. `rLY` reads = cycle-derived (this feeds the crit RNG).
  rDMA = memcpy. No PPU pixels, no APU - but log per-line SCX/SCY/BGP writes
  (that IS the raster program) and all NRxx writes (that IS the audio trace).
* Input: scripted per-frame joypad from a JSON file.
* Output: per-frame canonical **state vector** dump: player block, camera,
  both actor arrays, gameflow vars, plus the raster-write log and sound-reg
  log. Plus on-demand full WRAM/VRAM snapshots.

Harness (`tools/verify.js` / npm script):
1. **Frame-trace diff** (primary): run oracle and JS port on the same input
   script; compare state vectors frame by frame; first divergence = failing
   frame + field. Build input scripts per subsystem (walk ramp, jump arcs,
   slope walk, wall-jump chain, enemy patrols, boss patterns).
2. **Golden frames** (renderer): feed the oracle's VRAM/OAM/raster log into
   OUR compositor, and separately render the JS port's own frame - pixel-diff.
   (Also reuse `rip/levels/*.png` as static goldens for the BG path.)
3. **Audio**: diff the NRxx write log of the oracle vs the JS sequencer's
   emitted register-equivalent stream for each of the 47 songs (register
   values + tick indices; this is exact, no audio rendering needed).
4. **Determinism guard**: the port replaces the one nondeterminism source
   (`rLY` reads in the crit check and menu cursor) with a modelled LY -
   documented in `state.rng`; oracle comparison uses the same model.
Non-goals: cycle accuracy inside a frame, PPU FIFO, mid-instruction IRQs.
The one real risk - the re-entrant Timer ISR changing mailbox latency by a
frame - is accepted and normalised in the diff (sound commands compare with
±1 tick tolerance).

If the oracle stalls or a divergence is genuinely untraceable, fallback is
incremental porting + playtesting with the trace recorder in `debug.js`; but
do not start there.

---

## g) BUILD ORDER

| phase | deliverable | contents | effort (rel.) | depends |
|---|---|---|---|---|
| **P0** | tooling | asset exporters (§e), `tunables.js` generation, oracle + verify harness (§f), repo scaffold, dev server | 2.5 | - |
| **P1** | **"Batman moves and collides in level 1 on screen"** | `main/state/input/level/collision/camera/player(core)/render(basic)`: fixed-step loop; level-1 JSON loaded; walk/jump/gravity/terminal/turn-stall with exact constants; floor/wall/ceiling/slope probes; camera follow + clamps; single-band BG rendering + player metasprite with streamed anim tiles; keyboard input | 3 | P0 (assets; oracle can trail) |
| **P2** | full player + world interaction | wall-cling/wall-jump, punch, batarang, bat-rope, breakables + restore timers, pickups, conveyors, water/slow mode, death pits, knockback/i-frames, death sequence, lives; map-object array (`actors.js`) incl. platforms/doors; effects pools; HUD bar | 3 | P1 |
| **P3** | enemies + combat loop | enemy driver + states 1-3, 6, 11, 12; activation/despawn; contact/melee/batarang damage; crit; stun/kill FX; level transitions + route dispatch; levels 1-3, 5, 7, 9, 10, 12, 13 playable | 2.5 | P2 |
| **P4** | renderer completion | raster program (water wobble, 3-band parallax, level-6 split), window layer, BG tile animation, palette/fades, stage-intro screens, VRAM-script interpreter, vertical levels 2/6 + vehicle bob | 2 | P1 (parallel with P3) |
| **P5** | audio | sequencer port + worklet APU + mailbox; all 47 songs pass the register-trace diff; wire all `soundRequest` call sites | 2 | P0 (parallel from P2 on) |
| **P6** | bosses + gameflow completion | 4 bosses + parts/projectiles + L14 mode + rescue-helper cheat; title/round-select/options/sound-test; clear sequencers; ending + credits scroll; full 14-level runthrough | 2.5 | P3, P4 |
| **P7** | mod system + selection screen | per `02-MOD-SYSTEM.md`: tunables registry live, hook bus, launcher UI, 15-20 launch mods, localStorage persistence | 2 | P6 (design lands earlier; params flow from P1's tunables discipline) |
| **P8** | polish/release | perf pass, save-states, gamepad remap, themes, itch-style deploy | 1 | P7 |

**P1 definition of done:** level 1 renders from extracted assets at 160×144
(scaled); Batman spawns at `1:$7CED` start; walk, variable-height jump,
gravity, terminal velocity, slopes and wall/floor collision all use the exact
master-ref constants in 12.4 integer math; camera follows with original lead
and clamps; player animates with streamed tiles; runs at full speed; a
600-frame scripted input replay produces a player/camera trace that matches
the oracle exactly (or, if the oracle lags, is recorded as the provisional
golden to re-validate in P2).

Critical path: P0 → P1 → P2 → P3 → P6. P4 and P5 are parallelizable.
