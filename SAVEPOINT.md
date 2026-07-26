# SAVEPOINT — where this project is, and how to pick it up

Read this first after any break. `docs/00-MASTER-REFERENCE.md` is the technical
spec; `docs/03-VERIFICATION.md` is how we prove correctness and carries the
running list of ROM behaviours that caused real bugs. This file is the map.

---

## What this is

A hand translation of **Batman: Return of the Joker** (Game Boy, Sunsoft 1992)
from its disassembly into readable JavaScript. **Not an emulator** — every
routine becomes a JS function we own, so the game can be retuned and modded.

Live: **https://gbtman.pages.dev** · Repo: **https://github.com/Fabulu/batman-roj-js**

Nothing ROM-derived is committed. `assets/`, `disasm/`, `rip/`, `dist/` and the
ROM itself are gitignored and regenerated from your own cartridge.

---

## The one thing that makes this project work

**A PyBoy-based oracle runs the real ROM headless and diffs our state against
it frame by frame.** It never ships. Everything below was found by it, not by
reading the listing:

```
python tools/oracle/trace.py  --frames 620 --script "20:,600:R" --level 5
node   tools/render-frame.mjs --frames 620 --script "20:,600:R" --level 5
node   tools/oracle/regress.mjs         # the whole corpus
npm run test-all                        # 4 stages, the gate for everything
```

**Current state: 28/28 oracle scenarios bit-exact, 4/4 test stages green.**
Levels 1, 5 and 9 match the cartridge exactly over 620 frames each.

If you change gameplay code and `test-all` goes red, you broke something real.

---

## Setup from a clean checkout

```sh
# 1. put your own legal ROM here, named exactly:
#      Batman - Return of the Joker (USA, Europe).gb
#      (No-Intro: CRC 5124bbec, SHA-1 345a332175f58304f91111a13b770662e5ea92c3)
pip install pyboy
python tools/export_assets.py     # -> assets/
python tools/gen_tunables.py      # -> src/tunables.js, read from the ROM
python tools/rip_title.py         # -> assets/title.*
python -m http.server 8000        # module imports need a real origin
```

Deploy: `node tools/build-dist.mjs` then
`npx wrangler@3 pages deploy dist --project-name=gbtman --branch=main`
(wrangler@4 needs Node ≥22).

---

## What is ported and verified

| system | state |
|---|---|
| Player physics, collision, slopes | bit-exact |
| Camera | bit-exact |
| Wall-cling / wall-jump | bit-exact |
| Punch, batarangs (throw, flight, return) | bit-exact |
| Scripted door moves, breakables, pickups | bit-exact |
| Map objects `$C1E8` — types 3, 7, 9 | bit-exact |
| Enemy AI — states 1, 2, 3, 11, 12 + drawing | bit-exact |
| Bat-rope — extend, anchor, swing, tangent launch | bit-exact |
| Levels-1/2 water body (`src/water.js`): rise/fall, waterfall stamp, `$FF95` slow mode, the 1-dmg `$5A` hit, enemy slow-fall bit, splash pool | bit-exact |
| Level transitions, death/lives/respawn | ported |
| HUD energy bar | ported |
| Mod system + launcher, touch controls, fullscreen | ported |
| Title screen | **captured, not translated** — see below |

---

## What is NOT ported

Roughly in order of how much each would change the game:

1. **The sound DRIVER and music.** Nothing is audible yet. What exists:
   `src/sound/apu.js` is a complete, unit-tested DMG APU (both squares with
   sweep, wave, noise LFSR incl. width mode, envelopes, length, frame
   sequencer, panning) — it is not a code translation, it is the hardware the
   code writes to. `tools/oracle/sound.py` records the real driver's NR write
   stream tick by tick, to diff a port against. Missing is `7:$412B` itself:
   8 track slots at `$C82D`, 56 opcodes via `7:$43CE`, pitch table `7:$46D5`,
   song table `7:$477D`. Master-ref §8 documents all of it and
   `tools/dumpsong.py` already round-trips all 47 songs, so this is
   well-scoped work, not research.
2. **Enemy states 4–10 and 13** — all bosses, the level-6 vehicle, the level-12
   enemy, plus the level-14 boss reroute at `1:$77BD`. The only one reachable
   in levels 1–5 is state 10 (Boss 1, level 4).
3. **The door/gate sequencer** (`$C733-$C735`) plus the effect and ballistic
   pools it spawns. **This is what blocks level 13**, which has 88 actor-owned
   destructible cells and no way to open them.
4. **Map-object types 1, 4, 5, 6, 8, 11.** Types 2 and 10 are never placed in
   shipped data. (3, 7 and 9 are ported and bit-exact.)
5. **Window layer and raster effects.** The largest remaining *visual* gap —
   the window is ~56% of the pixel delta on level 1. Note this is the window
   LAYER; the water body it draws is now simulated (`src/water.js`).
6. **Conveyor carry** is applied (`loc_00_170A`), but levels 6/7/11/12/13 each
   have their own `sub_00_2CBE` branch and only the levels-1/2 water branch is
   ported.
7. **VRAM script interpreter** `sub_00_0A0E` — needed for the options menu,
   the Joker stage select, the per-stage intro cards and the ending. Format is
   documented in master-ref §7.6. This one routine gates four screens.
8. **Lag frames.** `$C757` is set when VBlank fires before the main loop
   finishes, and the actor/enemy drivers skip that iteration. That is
   instruction-level timing, so it is out of scope by definition — see
   docs/03-VERIFICATION.md §28.

---

## Known-approximate (ported but NOT oracle-verified)

Be suspicious of these; they are the likeliest source of a surprise.

- **Melee and batarang damage to enemies** (`meleeHitTest` in enemies.js,
  `batarangHitTest` in batarang.js). Overlap boxes are derived rather than
  transcribed exactly, and `rLY` for the crit window is modelled from the frame
  counter because we do not emulate a scanline counter. No scenario covers
  either yet — **this is the first thing to verify next.**
- **State-2's ranged attack and projectile flight.** Literal ports with unit
  tests, but no natural input script triggers them, so no frame-by-frame proof.
- **Post-death behaviour.** The ROM shoves x −15 during its sequence and
  returns to round-select; we restart the level in place instead. Deliberate.
- **Title screen.** `assets/title.vram.bin` is a *capture* of what the real
  game builds, not the output of running its two VRAM scripts (5:`$5170`,
  1:`$7C44`). The loop behaviour — fade, the START/OPTION cursor, the
  B+Select+Left cheat — *is* ported, and the cursor's positions, tile cycle and
  XOR-toggle selection were read back off the cartridge's OAM and `$C712`
  (docs/03-VERIFICATION.md §17–18). When `sub_00_0A0E` lands, the capture can
  go. **OPTION (`loc_00_3893`) is not ported** — picking it returns to the
  launcher, which already covers level, difficulty and mods. Deliberate.

---

## Hard-won lessons (the full list is docs/03-VERIFICATION.md)

- **Keep integer/byte math.** Terminal velocity is an *unsigned byte* compare
  that only works because falling velocities wrap into the high byte range.
  Floats silently break it.
- **When one field refuses to converge while everything around it is perfect,
  suspect the measurement.** The camera "bug" was the oracle sampling at the
  wrong point in the frame.
- **The disassembly can mislead.** `$1BA3` genuinely reads `XOR $01`, but that
  arm is not the one the walk path takes — believing it drew Batman mirrored
  for his entire run. Only the *pixel* comparison caught it; no state field is
  affected.
- **Banked addresses.** `LD HL,$41B8` is `1:$41B8`, not bank 0. Reading the
  wrong bank gave garbage that happened to be valid metasprite ids, so
  batarangs came out as spinning Batmen. (Kept on purpose as the Clone Wars
  mod.)
- **Animation counters are load-bearing**, not cosmetic — the enemy wall jump
  is fired by the *draw* path's animation expiry, so jumps are delayed while
  an enemy is off-window or blinking.
- **Reproduce quirks, don't fix them.** Ammo is spent before the free-slot
  search, so throwing with a full pool costs a batarang *and* punches.

---

## Suggested next steps

1. **Verify melee/batarang enemy damage against the oracle** — add a scenario
   that kills an enemy on level 1 and compare `en0hp`. Closes the biggest
   unverified gap.
2. **Audio.** Biggest experiential gap, well-scoped, fully documented.
3. **The door sequencer**, which unblocks level 13.
4. **The window layer**, the biggest visual gap.
5. **Bat-rope**, then delete the `ROPE_IMPLEMENTED` guard.

---

## Agent notes

Four recon agents mapped the ROM, a Fable agent consolidated it into
`docs/00-MASTER-REFERENCE.md`, three test agents built the suites, and a Fable
agent ported the enemy AI. Their raw reports are in `docs/recon-*.md` and
`docs/research-*.md` — historical, superseded by the master reference, but they
contain reasoning the summaries dropped.

One operational note: **tcrf.net served prompt-injection content** to an
automated fetch (instructions addressed to "LLMs and automated agents").
Verified at the byte level only as far as "something anomalous"; the specifics
were a summariser's paraphrase. Don't point unattended agents at it.
`datacrystal.tcrf.net` behaved normally.
