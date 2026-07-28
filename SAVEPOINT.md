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
node   tools/oracle/vramdiff.mjs --record   # sub_00_0A0E, write for write
npm run test-all                        # 7 stages, the gate for everything
```

**Current state: 36/36 oracle scenarios bit-exact, 360 unit tests, 7/7 stages
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
python tools/rip_title.py         # -> assets/title.json (LCD registers only)
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
| VRAM script interpreter `sub_00_0A0E` | bit-exact (write stream: address, value AND order) |
| Title VRAM build (boot clear, block copies, `sub_00_34A4` fill) | bit-exact |
| Enemy AI — states 1, 2, 3, 11, 12 + drawing | bit-exact |
| Bat-rope — extend, anchor, swing, tangent launch | bit-exact |
| Window layer (= the water's graphics) | drawn; tilemap + surface animation are a **capture** — see below |
| Levels-1/2 water body (`src/water.js`): rise/fall, waterfall stamp, `$FF95` slow mode, the 1-dmg `$5A` hit, enemy slow-fall bit, splash pool | bit-exact |
| Levels-1/2 sewer-enemy respawner (`loc_00_2D3D` head + `loc_00_0EC3` init arm): slots 6/7 refilled from `0:$32F8`/`0:$32D8`, the crawl-out-of-the-wall-hole spawns | bit-exact to the f73 lag frame (`l1-sewer-respawner-emerge`) |
| Level transitions, death/lives/respawn | ported |
| HUD energy bar | ported |
| Mod system + launcher, touch controls, fullscreen | ported |
| Difficulty `$C756` (launcher control; every read catalogued in master-ref §8b) | ported |
| Sound driver + DMG APU, music and SFX | plays; **not** bit-exact — see "Sound" |
| Title screen | **built from ROM data**, 8192/8192 B against the cartridge |
| Round select / continue (`0:$035B`) | build bit-exact; cursor logic verified against the ROM over three `$C753`/`$FFB5` states |

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
   bands, with fraction accumulators at `$C763-$C766`. `rasterBands()` still
   emits a single band. The window LAYER itself is now drawn (`drawWindow` in
   renderer.js) — that was the level-1/2 water.

   This is also what the **snaking pseudo-3D game-over / continue lettering**
   is built from: text that ripples and skews across the screen is per-scanline
   SCX modulation, not animated tiles. Not yet located precisely in the ROM —
   note that game over itself is just `$2ABA: JP Z,$0150`, a hard reset to the
   boot vector, so the effect belongs to a screen reached *before* that, not to
   a game-over state in the flow map. Worth pinning down with the oracle
   (record `rSCX` per scanline across the sequence) before writing any code.
6. **Conveyor carry** is applied (`loc_00_170A`), but levels 6/7/11/12/13 each
   have their own `sub_00_2CBE` branch and only the levels-1/2 branch is
   ported. Warning learned the hard way: a `sub_00_2CBE` branch can hide more
   than its headline subsystem — the levels-1/2 branch's ENTRY (`$2D3D-$2D5C`)
   was an enemy respawner that fell through into the water code, and skipping
   to the water label silently deleted the two respawning sewer enemies.
   Read each remaining branch from its entry label, not from where the
   interesting-looking code starts.
7. **The screens `sub_00_0A0E` feeds.** The interpreter ITSELF is now ported
   and bit-exact (`src/vramscript.js`) — what is still missing is the rest of
   each screen around it: the resource loads that put the tiles in VRAM, and
   the menu logic for the options screen and the Joker stage select. The hard,
   easy-to-get-wrong part is done; the remaining work is plumbing plus the
   raster bands (item 5) for the lettering effects.
8. **Lag frames.** `$C757` is set when VBlank fires before the main loop
   finishes, and the actor/enemy drivers skip that iteration. That is
   instruction-level timing, so it is out of scope by definition — see
   docs/03-VERIFICATION.md §28.

---

## Known-approximate (ported but NOT oracle-verified)

Be suspicious of these; they are the likeliest source of a surprise.

- **The melee CRIT window, and every arm the scenarios do not reach**
  (`meleeHitTest` in enemies.js). Both hit tests are exact transcriptions, and
  their ORDINARY paths are oracle-verified (`l3-punch-miss-behind`,
  `l3-punch-connect`, `l3-batarang-kill`): SCREEN-space scans over cached
  `+7/+8` bytes — melee off the mode-5 probe (`loc_00_2643`, enemy-owned
  half-extents, strict compares, player recoil vx = −4), batarang at
  `loc_00_3C17` (`$1216` box, inclusive, catch-tested BEFORE the hit test).

  Be precise about what "verified" covers, because it is less than it looks.
  Hooking the ROM arms across all four scenarios shows these NEVER execute:
  `$26A0` (the facing-left retry), `$26DD` (crit), `$3C8A` (the whole armored
  2/7/`$0A` bounce), `$20FB` (a punch treating water as empty), and
  `$3C7B`/`$3C80`/`$3C85` (the immune states — no non-state-1 enemy is present
  in any of them). `$271F` fires twice but never with a second candidate in
  range, so "first hit only" is unit-tested and not oracle-tested. And the
  retry arm runs seven times and FAILS all seven — its succeeding branch is
  never taken. Those are transcriptions with unit tests, not measured
  behaviour. What remains approximate on top of all that is the crit: `$26D0`
  reads **rLY
  mid-frame** (measured 44 on the one connecting punch — instruction-level
  timing, out of scope by §28), so the port's rLY model is pseudo-random at
  the right ~3% rate but can never agree punch-for-punch. If a scenario ever
  trips it, widen the scenario, don't chase the model.
- **State-2's ranged attack and projectile flight.** Literal ports with unit
  tests, but no natural input script triggers them, so no frame-by-frame proof.
- **Post-death behaviour.** The ROM shoves x −15 during its sequence and
  returns to round-select; we restart the level in place instead. Still a
  **temporary stopgap** — but round select now exists, so wiring death back to
  it is no longer blocked on anything. That plus `$FFB5`/`$C753` bookkeeping is
  what turns CONTINUE from ported-but-unreachable into something you can use.
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
- **Title screen — the 8 KB capture is GONE.** `assets/title.vram.bin` and the
  half of `tools/rip_title.py` that produced it are deleted. The screen is now
  built the way the cartridge builds it: the boot clear (`$01AB`), two bank-6
  tile blobs through `sub_00_09FB`, `sub_00_34A4`'s tilemap fill, and three
  VRAM scripts (`5:$52F5` copyright, `5:$5170` artwork, `1:$7C44` text). See
  `buildTitleVram` in src/vram.js; `tools/oracle/titlediff.mjs` is a gate stage
  and checks BOTH the replay and the shipped manifest path against the
  cartridge's own VRAM — 8192/8192 bytes.

  What is still captured is 91 bytes: `assets/title.json`, the eight LCD
  registers. Those are read 40 frames into the title loop, so the palettes are
  the state *after* `sub_00_0A7F`'s fade, not the immediates the code writes
  (`$34C6` sets BOTH object palettes to `$E4`; the captured OBP1 is `$C4`).
  Deriving them means porting the fade's palette ramp, which is its own job.

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
- **A "constant" measured on one level may be a per-level value — and may not
  be a constant at all.** The `$FFB1` boot phase was measured on levels
  1/5/9/12 (all `$6D`) and adopted flat; under the oracle's boot path levels
  2/3/6/7/10/13 come up at `$53` instead, and nothing on a `$53` level read the
  counter until the enemy hit-blink did, drifting the landing animation by
  exactly the phase difference.

  But the second half of the lesson is sharper, and this bullet said it wrong
  for a while: `$FFB1` is not a per-LEVEL property, it is a per-BOOT-PATH one.
  Change how many frames the harness spends tapping START and every value moves
  — level 1 gives `$6D`, `$64`, `$74` or `$CB` under four different cadences,
  and the level-to-level delta is not stable either. `$FFA7` is 1 under our
  cadence and 0 under others. Adopting the oracle's phase is a defensible
  choice because it makes the corpus reproducible; calling it what the
  cartridge does is not. A free-running counter has no boot value to be right
  about.

---

## Suggested next steps

1. **The OPTIONS menu (`loc_00_3893`)** — the last menu stopgap. Same drawing
   pattern as the title and round select (find its ingredients with
   `tools/oracle/titlebuild.py --until-pc`, replay, diff), then difficulty,
   the sound test and exit. Note it is the BIGGER routine of the two: 334 bytes
   against round select's 286, and the sound test is a BCD counter over 70
   entries. Retiring it removes the launcher standing in for OPTION.
2. **Feed round select from the game**: set `$FFB5` when a level is reached and
   maintain `$C753` on clear, so CONTINUE and the cleared-route skipping — both
   ported and both verified — stop being unreachable. Then send death back to
   round select instead of restarting in place.
3. **Map-object handlers for types `$01 $04 $05 $06 $0B`** (1:`$488D`,
   `$4940`, `$4291`, `$42E3`, `$483C`). The overlap scan is in and makes them
   solid; without handlers they are solid *in the wrong place* as soon as one is
   meant to move. Type `$08` is done and is the worked example to copy —
   `actorType8` in actors.js, verified by `l3-platform-ride`. Types `$05` and
   `$06` next: between them they cover levels 3, 12 and 13.
4. **The two sound bugs** (see "Sound"). Both are precisely located.
5. **Verify melee/batarang enemy damage against the oracle** — DONE. Three
   level-3 scenarios cover miss, connect and a batarang kill; the death-pit
   frame is pinned too (`l3-pit-death-exact-frame`). Two findings worth
   keeping: `$FFB1`'s boot phase is **per level** ($6D or $53 — measured for
   all 14, table in level.js), and `sub_00_29E7` does NOT zero vx/vy.
6. **The `$0E24` window surface** — the last screen on top of `sub_00_0A0E`,
   and the one that kills the `water.json` tilemap capture. Exactly the title's
   shape: find the ingredients, replay, diff.
7. **The door sequencer**, which unblocks level 13.

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
