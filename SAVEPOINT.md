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
python tools/export_sound.py      # -> assets/sound.json (bank-7 sound data)
python -m http.server 8000        # module imports need a real origin
```

Deploy: `node tools/build-dist.mjs` then
`npx wrangler@3 pages deploy dist --project-name=gbtman --branch=main`
(wrangler@4 needs Node ≥22).

---

### The newer probes

| tool | what it settles |
|---|---|
| `tools/oracle/drops.py` | the `$C6CF` pool from the instant an enemy dies -- kills a live enemy by zeroing its HP byte and dumps all four slots, player HP and the knockback timers per frame. `--hp` matters: at full health the pickup is consumed with `$FF8A` never moving, so the effect is invisible. |
| `tools/oracle/objtrace.py` + `objregress.mjs` | map objects: all 8 records x 16 bytes including the `+9/+$0A` screen cache, plus the `$D000` cells a type-6 block stamps. |
| `tools/audit_coverage.py` | **"what have we missed?", measured.** Cross-references every routine gbdis finds an xref to against every address any comment in `src/` cites, then ranks the gap by distance to the nearest citation. This is how the stage-intro screen (`sub_00_333F`) was found after sitting unported AND uncatalogued through the entire project. Run it after any big porting wave: `python tools/gbdis.py "<rom>" --all --outdir /tmp/dis` then `python tools/audit_coverage.py . /tmp/dis`. |
| `tools/oracle/flowscen.py` + `flowdiff.mjs` | route clears, death, CONTINUE and game over. **Event-capped, not frame-capped** -- each recording stops when the ROM's own sequencer lands (`$361E`/`$2AAD`/`$0150`) plus 90 settling frames, so a lag frame cannot skew it. |

---

## What is ported and verified

| system | state |
|---|---|
| Player physics, collision, slopes | bit-exact |
| Camera | bit-exact |
| Wall-cling / wall-jump | bit-exact |
| Punch, batarangs (throw, flight, return) | bit-exact |
| Scripted door moves, breakables, pickups | bit-exact |
| Map objects `$C1E8` — **all eleven types** | bit-exact (8 scenarios, all 16 record bytes + stamped cells) |
| Door/gate sequencer (`$C733-$C735`) + debris + the `$C693` effect pool | bit-exact, 8 scenarios — **level 13 is unblocked** |
| The six `sub_00_2CBE` branches (levels 1/2, 6, 7, 11, 12, 13 + the boss default) | bit-exact, 5 scenarios |
| Boss death: the `$C740` countdown, all four per-boss arms, the fanfare's timing | bit-exact, 3 scenarios |
| STAGE CLEAR screen (`loc_00_350F` blocks, `$3566` scripts, `$35B2` STAT/LYC) | **built from ROM data**, 8192/8192 B against the cartridge on levels 4/8/11 |
| Player death: the `$C1C0` burst, 452 frames to the handoff | bit-exact on levels 1, 3 and 4 |
| Map-object collision (`loc_00_2426`, all four probe modes) | bit-exact |
| VRAM script interpreter `sub_00_0A0E` | bit-exact (write stream: address, value AND order) |
| Title VRAM build (boot clear, block copies, `sub_00_34A4` fill) | bit-exact |
| Enemy AI — all states + drawing | bit-exact |
| Enemy death drops (`$C6CF`, `sub_00_0CF3` + `loc_00_1444`) | bit-exact — arc, both bounces and the rest latch |
| Bat-rope — extend, anchor, swing, tangent launch | bit-exact |
| Window layer: map + animated tiles | **built from ROM data**, 13376/13376 B across 11 levels |
| Raster/STAT program (`$0857`), all eight arms | bit-exact, 9 scenarios / 335,664 scanlines |
| Stage-intro card (`sub_00_333F`) | **built from ROM data**, 327680/327680 B across 8 levels |
| GAME OVER lettering (`$C1C0`) | bit-exact — 13504/13504 shadow-OAM bytes over 4 levels |
| Levels 9/10/11 parallax sky, levels 1/2 water band, level 6 track | bit-exact |
| Levels-1/2 water body (`src/water.js`): rise/fall, waterfall stamp, `$FF95` slow mode, the 1-dmg `$5A` hit, enemy slow-fall bit, splash pool | bit-exact |
| Levels-1/2 sewer-enemy respawner (`loc_00_2D3D` head + `loc_00_0EC3` init arm): slots 6/7 refilled from `0:$32F8`/`0:$32D8`, the crawl-out-of-the-wall-hole spawns | bit-exact to the f73 lag frame (`l1-sewer-respawner-emerge`) |
| Level transitions, death/lives/respawn | ported |
| Route clears, CONTINUE, game over (`$C753`/`$FFB5`) | verified against the ROM, 8 progress-flow scenarios |
| HUD energy bar | ported |
| Mod system + launcher, touch controls, fullscreen | ported |
| Difficulty `$C756` (launcher control; every read catalogued in master-ref §8b) | ported |
| Sound driver + DMG APU, music and SFX | **bit-exact** — all 47 ROM ids, SFX over live music, and the fader |
| Title screen, its 8 LCD registers, and state 4's press-start flash | **built from ROM data** — 8192/8192 B, and all 120 flash iterations |
| STAGE CLEAR (`loc_00_34D0`) | **byte-exact**, 8192/8192 VRAM on all three boss levels |
| Round select / continue (`0:$035B`) | build bit-exact; cursor logic verified against the ROM over three `$C753`/`$FFB5` states |

---

## What is NOT ported

Roughly in order of how much each would change the game:

1. ~~**The victory fanfare's PICTURE.**~~ — DONE and byte-exact. `loc_00_34D0`'s
   23 bank-6 blocks, `$3566`'s two window-map scripts, the `$35B2`-`$35C9`
   STAT/LYC program and `sub_00_0A7F`'s palette ramp are all in `src/effects.js`
   now, and `$FFAC` is written through to `state.video.windowY` — the old
   `effects.windowRamp` indirection is gone. `tools/oracle/stageclear.py`
   records the cartridge's whole VRAM either side of the fanfare and
   `tools/oracle/deathdiff.mjs` rebuilds the difference from the manifest:
   **8192/8192** bytes with the pre-fanfare image underneath and **836/836**
   over the two spans the fanfare writes (`$8800-$8ADF`, `$9C00-$9C93`), on
   levels 4, 8 and 11 alike.

   **One renderer line is still missing** and until it lands the band is not
   clipped: `drawWindow` must stop at `state.video.windowEndY` (null = draw to
   the bottom, as now). Without it the window's rows 5+ — tile `$01`, solid
   black on every level — paint from line `rWY + 32` down.
2. **The ENDING (`loc_00_3652`).** Clearing level 14 runs four blocking
   picture screens (`$3691`, `$36F2`, `$3732`, `$3773`, each built from
   bank-7 VRAM scripts) and then a text crawl at `$3781+` that copies 21-byte
   strings from `7:$7B34`. Cited nowhere in `src/`; `clearLevel()` returns
   `'ending'` and main.js falls through to the exit table.


3. ~~**Conveyor carry**~~ — DONE, and the warning that got it there is worth
   keeping: a `sub_00_2CBE` branch hides more than its headline subsystem. The
   levels-1/2 branch's ENTRY (`$2D3D-$2D5C`) was an enemy respawner that fell
   through into the water code. Level 7's "conveyor" branch turned out to be a
   map-object respawner, level 11's a 240-frame entrance freeze, and level
   13's a one-shot spawn. **Read each branch from its entry label**, not from
   where the interesting-looking code starts.
4. **The screens `sub_00_0A0E` feeds.** The interpreter ITSELF is now ported
   and bit-exact (`src/vramscript.js`) — what is still missing is the rest of
   each screen around it: the resource loads that put the tiles in VRAM, and
   the menu logic for the options screen and the Joker stage select. The hard,
   easy-to-get-wrong part is done; the remaining work is plumbing plus the
   raster bands (item 5) for the lettering effects.
5. **Lag frames.** `$C757` is set when VBlank fires before the main loop
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
- **NOTHING is captured any more.** Both remaining captures are retired and
  `tools/rip_water.py` / `tools/rip_title.py` are deleted along with them.

  The window map and the animated tiles are BUILT (`applyLevelArt` /
  `tickTileAnim` in water.js), verified 13376/13376 bytes across 11 levels by
  the `level-art` gate stage. The title's eight LCD registers are DERIVED
  (`title-state` stage), as is state 4's press-start flash.

  Two lessons are worth keeping from how long that took:

  1. **The task was filed against the wrong address for months.** `$0E24` is
     not the window-surface script — it sits behind `$0DD9: CP $0E / JP NZ`,
     so it runs on level 14 and nowhere else. What paints the window on every
     other level is a pair of instructions three apart inside level init:
     `$04C9` fills 960 cells with tile `$01`, `$04D7` runs a 47-byte script at
     `0:$32A3`. Chasing the filed address would never have found it. The
     fall-through rule applies to task descriptions too.
  2. **`$3148` reads `$FFC9` every frame, not at init.** Level 6's conveyor
     rewrites it at `$05C6`, one call before the streamer, so caching the
     choice at level load picks up the zero `$0F0F` left there and animates
     nothing.

  Applying each 32-byte block on its staging frame rather than modelling the
  `$FF9B` VBlank queue is measured-correct — one block per frame, gap set
  exactly `{1}` over ~1400 gameplay frames across ten levels — and
  `waterdiff.mjs` fails loudly if a recording ever shows a gap of 2.

---

## Sound

Music and effects both play and sound close to right. It is **not** bit-exact
yet, and it has its own oracle loop, separate from the frame oracle:

```
python tools/oracle/sound.py --id 2 --mask 3 --ticks 120   # record the cartridge
python tools/oracle/sound.py --under 0x10 --lead 60        # an SFX over live music
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

**It is bit-exact.** `node tools/oracle/sounddiff.mjs --all` compares 52
recordings / 29 800 ticks — all 47 ROM sound ids, SFX played *over* live music,
and the fade-out — across all four channels plus NR50/NR51. `UNIMPLEMENTED_OPS`
is empty. This is a gate stage (`sound-driver`) and needs no PyBoy, because it
replays recordings already on disk.

Two rules were doing all the damage, and both are worth remembering:

- **`DEFSLIDE`'s note is the ATTACK note; the byte in the stream is the
  DESTINATION.** `7:$450D` plays the preset's own note for the preset's own
  duration and subtracts it from the written one. Playing the destination from
  tick one is why the target and rate looked right and only the origin was
  wrong.
- **`$F9 GATE` doubles its operand** (`ADD A,A` at `$468F`), and the gate is
  `(min(dur, +$06) >> 1) - 1`. Undoubled, key-off fired one tick early and cut
  the volume table short — which is the entire "mysterious envelope drift".
  Nothing governs that table; it was simply never being heard to the end. With
  `GATE_OFF` the ROM computes `$FF`, a value a duration counter can never
  equal, so an ungated note runs to its full length; special-casing 0 released
  every one of them halfway through.

Note `sub_00_0AE1` takes **B as the sound id and C as the mask** — `LD BC,$1601`
is id `$16`. Reversed, a cue still plays, just the wrong one, and no memory
comparison will ever catch it.

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

Every task on the original list is done. What remains was found on the way,
mostly by `tools/audit_coverage.py`:

1. **The ENDING (`loc_00_3652`)** — four picture screens and a text crawl,
   the last unported screen in the game. See item 2 under "What is NOT ported".
2. **OAM draw ORDER during the GAME OVER lettering.** `$0567` runs the pair
   `sub_00_0F7B` (HUD) + `sub_00_29E7` at `$0573`/`$057A` when `$FFA7 == 0`
   and the SAME pair at `$05E5`/`$05EC` when it does not — so the cartridge
   queues the letters before the player on even frames and after the player,
   enemies and doors on odd ones. Measured: the burst's first OAM cursor
   alternates 20/44 on level 1, 20/60 on level 3, 20/88 on level 9. The port
   always produces the `$057A` ordering. OAM index is DMG sprite priority and
   the 10-per-line cut, and the letters do cross the energy bar's row and the
   dying Batman, so it is occasionally visible. `gameoverdiff.mjs` reports it
   and does not fail on it.
3. **`applyAnimHitbox` is not gated on the invulnerability blink**, and the
   ROM's is (`$1D1B RET Z` leaves before `$1D2C`). Deliberately not
   reproduced: main.js decrements `$C714` at tick end while the ROM does it at
   the head of the player update (§29), so gating now would pick the wrong
   eight frames. **Fix the `$C714` sampling point first.**
4. **`sub_00_0F56`** (`$1D24`, grounded only) — a 2-3 px draw-Y bob every 8th
   frame on levels 6/9/10/11. Cosmetic, but a real gap in `$1D0C`.
5. **Level 6's `$FFC9 == 1` alternate tile-animation table** (`2:$625E`) is
   exported but never exercised — the conveyor came up 2 on every recorded
   frame, so that arm is a transcription with a unit test, not a measurement.

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
