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

**Current state: 30/30 oracle scenarios bit-exact, 293 unit tests, 4/4 stages
green.** Levels 1, 5 and 9 match the cartridge exactly over 620 frames each.

If you change gameplay code and `test-all` goes red, you broke something real.

Two harness flags worth knowing, both taken by `trace.py` *and*
`render-frame.mjs` so scenarios stay comparable:

- `--ammo N` — inject batarangs without walking to a pickup.
- `--warp COL[,ROW]` — place the player directly. Late-level content is
  otherwise unreachable from a scripted input. It is applied **after frame 1**
  in both harnesses, because the oracle's first sample is taken during boot;
  get that wrong and every warped scenario sits permanently one frame skewed.

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
python tools/rip_water.py         # -> assets/water.json (window map + anim)
python tools/export_sound.py      # -> assets/sound.json (bank-7 sound data)
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
| Map objects `$C1E8` — types 3, 7, 8, 9 | bit-exact |
| Map-object collision (`loc_00_2426`, all four probe modes) | bit-exact |
| Enemy AI — states 1, 2, 3, 11, 12 + drawing | bit-exact |
| Bat-rope — extend, anchor, swing, tangent launch | bit-exact |
| Window layer (= the water's graphics) | drawn; tilemap + surface animation are a **capture** — see below |
| Levels-1/2 water body (`src/water.js`): rise/fall, waterfall stamp, `$FF95` slow mode, the 1-dmg `$5A` hit, enemy slow-fall bit, splash pool | bit-exact |
| Level transitions, death/lives/respawn | ported |
| HUD energy bar | ported |
| Mod system + launcher, touch controls, fullscreen | ported |
| Difficulty `$C756` (launcher control; every read catalogued in master-ref §8b) | ported |
| Sound driver + DMG APU, music and SFX | plays; **not** bit-exact — see "Sound" |
| Title screen | **captured, not translated** — see below |

---

## What is NOT ported

Roughly in order of how much each would change the game:

1. **Sound: playing well, two known bugs, not yet bit-exact.** See the
   "Sound" section below — it has its own tooling and its own open list.
2. **Enemy states 4–10 and 13** — all bosses, the level-6 vehicle, the level-12
   enemy, plus the level-14 boss reroute at `1:$77BD`. The only one reachable
   in levels 1–5 is state 10 (Boss 1, level 4).
3. **The door/gate sequencer** (`$C733-$C735`) plus the effect and ballistic
   pools it spawns. **This is what blocks level 13**, which has 88 actor-owned
   destructible cells and no way to open them.
4. **Map-object HANDLERS for types 1, 4, 5, 6, 11.** Types 2 and 10 are never
   placed in shipped data. (3, 7, 8 and 9 are ported and bit-exact.) Their
   *collision* works — the `loc_00_2426` scan is ported — so an unported object
   is solid, just frozen at its spawn state. Where each still appears: 3 (`$01
   $05 $06`), 6 (`$0B`), 7 (`$04`), 12 (`$05 $06`), 13 (`$03 $05 $06`).
5. **Raster effects** (the `$0857` STAT program): per-scanline SCX/SCY/palette
   bands. `rasterBands()` still emits a single band. The window LAYER itself is
   now drawn (`drawWindow` in renderer.js) — that was the level-1/2 water.
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
- **Animated tiles** (`assets/water.json`, tools/rip_water.py). Two things are
  captured rather than translated, and neither is in the exported level VRAM.
  (1) The `$9C00` window tilemap: level init fills it flat, then a VRAM script
  at `$0E24` paints its textured surface — *after* the export snapshot, which
  is why the export shows only tile `$01`. (2) The tile animation: a generic
  streamer (`loc_00_3127`, `$C70F`/`$C710`, tables `2:$61A4`, `0:$31EE`,
  `0:$3246`, `0:$3295`) rewrites bitmaps in place through a VRAM write queue.
  In level 1 that is **fourteen** tiles — the falling water `$74-$7B`, the
  surface `$E0-$E3`, and `$F1`/`$F3`. Tilemaps never change; only bitmaps do.
  Porting the streamer means porting its queue as well. The *cadence* is
  measured, not assumed. Which levels animate is knowable without guessing:
  `0:$31EE` is `$FFFF` for levels 4, 8–11 and 14, and a real pointer for
  1, 2, 3, 5, 6, 7, 12, 13.
  `water.js` patches the frames straight into `level.tiles.bg`, exactly as the
  streamer patches VRAM — so background and window animate by one mechanism
  and the renderer has no special case.
- **Title screen.** `assets/title.vram.bin` is a *capture* of what the real
  game builds, not the output of running its two VRAM scripts (5:`$5170`,
  1:`$7C44`). The loop behaviour — fade, the START/OPTION cursor, the
  B+Select+Left cheat — *is* ported, and the cursor's positions, tile cycle and
  XOR-toggle selection were read back off the cartridge's OAM and `$C712`
  (docs/03-VERIFICATION.md §17–18). When `sub_00_0A0E` lands, the capture can
  go. **OPTION (`loc_00_3893`) is not ported** — picking it returns to the
  launcher, which already covers level, difficulty and mods. Deliberate.

---

## Sound

Music and effects both play and sound close to right. It is **not** bit-exact
yet, and it has its own oracle loop, separate from the frame oracle:

```
python tools/oracle/sound.py --id 2 --mask 3 --ticks 120   # record the cartridge
node   tools/oracle/sounddiff.mjs --id 2 [--show 8]        # diff, per register
node   tools/rendersong.mjs --id 2 --seconds 15            # -> a WAV to listen to
node   tools/rendersong.mjs --id 0x10 --dump 6             # per-tick writes
```

- `src/sound/apu.js` — the DMG chip. The one piece here that is *not* a code
  translation, because it is not code. Register writes in, samples out, no Web
  Audio dependency, unit-tested under node.
- `src/sound/driver.js` — `7:$412B`. Eight track slots, channel ownership in
  `$C800-$C803` (higher index wins, so SFX pre-empt music), the note/duration/
  gate machine, volume and pitch envelopes, drums, slides, opcode dispatch.
- `src/sound/index.js` — runs the driver on the **audio** clock at 4096/69 =
  59.36 Hz. It is a timer-interrupt routine, not VBlank; driving it from
  `requestAnimationFrame` would tie tempo to the display refresh.

Current diff for song `$02` over 120 ticks: channels 1 and 2 match on duty,
both frequency bytes and the trigger. Open:

- **The slide's starting frequency** is wrong (`$91` against the cartridge's
  `$1d`). The bass ramps from the wrong place but settles correctly.
- **The volume envelope drifts from tick 5.** The cartridge holds `c0` for two
  ticks even though its own duration byte reads `3`, and the values `$a0` and
  `$90` in the table are never heard at all. Some rule governs that table that
  is not yet understood — this is a real puzzle, not an oversight.
- `UNIMPLEMENTED_OPS`: the channel-mask ops and the release envelope. Their
  operands ARE consumed, so the byte stream stays in sync.

---

## Open bugs with a known reproduction

- **Level 2 → 3 arrival — FIXED.** It was never a transition bug. The scan at
  `loc_00_2426` is now ported (`actorOverlap` in collision.js) and level 3 is
  bit-exact for 350 frames (`l3-object-floor`). What follows is the diagnosis,
  kept because the reasoning is the useful part:

  1. The transition path and the direct-load path **agree**. Both reach
     `sub_00_2889`, whose tail at `$2973` writes `$FF81`/`$FF83` from
     `1:$7CED`, and both land the player at **column 1, row 30** — exactly what
     the manifest says. There is no level-3 special case, and the earlier
     "direct load spawns at row 19" claim was wrong; the port dies on a direct
     boot into level 3 too. Nothing in `$2820`-`$285A` touches the player
     position at all.
  2. Row 30 in level 3 genuinely has **no map cell** under it. Col 1 is air
     from row 1 down, on the cartridge and in our export alike
     (`checkmap.py --level 3` is now an EXACT MATCH).
  3. What holds the player up is a **map object**. `$C1E8` slot 0 is a type
     `$08` that activates to `$88` (bit 7 = live) at level init. The floor
     probe finds air in the map, falls through the slope look, and reaches
     `loc_00_2426` — a scan over all 8 `$C1E8` slots that AABB-tests the probe
     point against each live object's box. On a hit `$2610` rewrites the
     player's Y to the object's surface and `$2622` returns `$FF`
     (`SOLID_RUNTIME`). Verified by hooking the return of `sub_00_20BA`: it
     returns `$FF`, and Y snaps 7683 → 7680 inside the call, every frame.

  **The port implemented none of `$2426`-`$2643`.** `slopeProbe` treated
  `$2418`/`$2423` as "return the neighbour's collision" and "return 0", but both
  of those labels *fall into* the object scan. So every map object was
  intangible, and level 3 starts you on one.

  Why this stayed hidden: the scan skips masked types `$07` and `$09`
  outright (`$2454`, `$2459`) and ignores anything with bit 7 clear — and
  types 3, 7, 9 are precisely the three the port has. Levels 1, 5, 7 use only
  those; 2, 4, 8, 9, 10, 11, 14 have no objects at all. Level 3 is the first
  level that uses a type outside that set.

  **What landed:** the whole scan, all four probe-mode arms, plus the screen
  position cache at `+9/+$0A` that every handler writes (1:`$4852`) and the
  scan compares against — an object that never writes those is invisible to
  collision while still drawing correctly. Two traps worth keeping in mind:

  - Only the FLOOR probe reaches the slope tables and the scan from a
    *non-empty* neighbour. `$2155`/`$2138` test the mode and every other one
    takes `LD A,B / RET` at `$215C`/`$213F`. Routing mode 3 into the scan there
    broke the level-5 gauntlet, and the cartridge is what settled it.
  - `$FF` returns from `sub_00_1DB9` at `$1DDE`, BEFORE the `$1E35` arm that
    snaps the Y low byte. The scan has already placed the player exactly; the
    snap would drag him to metatile alignment.

  Type `$08` has since been ported too (`jt_01_4525`), and with it the reason
  the arrival was already correct without a handler: level 3's slot 0 ships
  with `+$0B = $FE`, the retired state, so the platform never moves and is a
  plain static ledge. The moving one is slot 7, covered by `l3-platform-ride`.

- ~~Level 3 diverges at frame 358~~ — **closed, and it was a lag frame.** The
  port took a knockback the cartridge did not. Chasing `$C714` would have been
  the wrong thread: enemy 0's X actually diverges at **318**, where `$C757` is
  set — the only lag frame in the run, measured. The enemy driver skips that
  iteration, the cartridge's enemy stalls one step, and every later X sits 21
  world units behind the port's. 21 units is enough to put the enemy in contact
  range one frame early, which is the knockback at 357.

  This is instruction-level timing and out of scope by definition (§28), not a
  porting bug. `l3-object-floor` is now capped at **317** — one frame short of
  the lag — specifically so enemy fields can be compared as well. A longer run
  would only have passed by excluding them, which hides a divergence instead of
  bounding it.

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
- **Look at the running machine, not just the listing.** The exported level
  VRAM is a snapshot taken at level init, *before* the VRAM scripts that paint
  the water surface run. Trusting it said "the window is one flat black tile",
  and produced a black slab. Fourteen animated tiles were sitting there.
- **When a hook reads a register, hook the STORE, not the load that feeds it.**
  The sound recorder hooked `$431F`/`$4324` instead of `$4320`/`$4325`, so one
  value was attributed to two consecutive registers and every recording was
  quietly wrong. A bad oracle is worse than no oracle.
- **Never mark a mutable asset `immutable`.** `dist` served `/assets/*` with a
  one-year immutable cache while exporters rewrite those files in place. When
  `water.json` changed shape, browsers kept the old one and the water rendered
  as black squares — intermittently, depending on cache state. Assets now
  revalidate; if long caching is ever wanted, the URLs need a content hash.
- **Prefer a loud failure to a plausible-looking one.** That same bug looked
  like a *rendering* fault because the window layer painted its fill tile when
  it had no tilemap. It now draws nothing, and the loader throws.
- **A `--level` flag that does not reach the cartridge is a lie.**
  `checkmap.py` and `probecells.py` both took `--level` and used it only to
  pick which of OUR files to read — neither injected `$FFB0`, so the cartridge
  always booted level 1. `checkmap.py --level 3` therefore diffed our level-3
  export against level 1's `$D000` and reported 1707 bytes wrong. It sent this
  investigation chasing a non-existent map-export bug until level 5 and 9 —
  known bit-exact over 620 frames — also came back "wrong", which is what
  exposed the tool. Both now inject at `$04BB` like `trace.py`, and all maps
  are EXACT MATCH. When a trusted-good subject fails a new check, suspect the
  check.
- **Follow the label to where it *falls through*.** `$2418` and `$2423` read
  like return sites — set `$FFBA` and done. They are not: both fall into
  `loc_00_2426`, the map-object overlap scan. Stopping at the label is what
  left every map object in the port intangible.

---

## Suggested next steps

1. **Map-object handlers for types `$01 $04 $05 $06 $0B`** (1:`$488D`,
   `$4940`, `$4291`, `$42E3`, `$483C`). The overlap scan is in and makes them
   solid; without handlers they are solid *in the wrong place* as soon as one is
   meant to move. Type `$08` is done and is the worked example to copy —
   `actorType8` in actors.js, verified by `l3-platform-ride`. Types `$05` and
   `$06` next: between them they cover levels 3, 12 and 13.
2. **The two sound bugs** (see "Sound"). Both are precisely located.
3. **Verify melee/batarang enemy damage against the oracle** — add a scenario
   that kills an enemy on level 1 and compare `en0hp`. Biggest *unverified*
   gap in gameplay.
4. **The VRAM script interpreter `sub_00_0A0E`.** Best ratio of work to result
   left: master-ref §7.6 documents it as four modes (copy/RLE × horizontal/
   vertical, `$00` terminator), and it gates the options menu, the Joker stage
   select, the per-stage intro cards and the ending — *and* retires both the
   title-screen and the window-tilemap captures.
5. **The door sequencer**, which unblocks level 13.

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
