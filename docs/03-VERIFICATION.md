# 03 — VERIFICATION

How we know the port behaves like the original.

## The oracle

PyBoy (`pip install pyboy`) runs the real ROM headless and deterministically.
It is a **test tool only and never ships** — the shipped artifact is our own
JavaScript. It exists so "faithful" is a checkable property rather than a vibe.

```
python tools/oracle/probe.py                 # inspect the boot path
python tools/oracle/trace.py  --frames 120 --script "20:,40:R,10:RA,50:R"
node   tools/render-frame.mjs --frames 120 --script "20:,40:R,10:RA,50:R"
node   tools/oracle/compare.mjs              # field-by-field diff
```

`compare.mjs` exits non-zero on any divergence and prints the **first** frame
each field breaks on, plus a window around the earliest one. That frame is the
bug.

Script syntax is shared by both harnesses: `frames:BUTTONS`, comma separated,
buttons from `R L U D A B`. `20:,40:R` = 20 idle frames then 40 holding right.

### Two alignment subtleties, both handled in `trace.py`

1. **First gameplay frame.** `boot_to_gameplay` taps START through the logo,
   title and round-select, and returns having *already* ticked the first
   gameplay frame (the `$0567` hook fires mid-tick). That frame is therefore
   sampled without ticking again. Without this the oracle sits one gravity
   step ahead and every comparison is off by one.
2. **Input lead of one frame.** The game reads the joypad in its VBlank ISR and
   the main loop consuming it runs immediately after — i.e. during PyBoy's
   *next* tick. Buttons are therefore held one tick early so the real game acts
   on them on the same numbered frame as the port.

## Current fidelity — level 1

`node tools/oracle/regress.mjs` runs the whole corpus: **14 of 15 scenarios
(2535 frames) are bit-exact on every field, camera included.** The 15th is a
known, diagnosed xfail — see "Open gap" below. See **## Test suite** for the
per-scenario table.

Attacks are verified separately. Both harnesses take `--ammo`, which injects
batarang ammo so the throw path can be exercised without walking to a pickup;
punch, the attack counter, ammo and all three batarang slots are bit-exact over
180 frames.

The runner exits non-zero if any field diverges. Add a scenario for every
behaviour worth protecting — a recorded playtest is a permanent test.

### The camera: solved

`$121F` sits early in the main loop (`$05B7`) and reads the *previous*
iteration's player position, so the visible camera intentionally lags the
player by one frame. The player state machine was hard to locate because **it
is not a call target at all** — it is the fall-through tail of `sub_00_1336`
(`$05BD`), which runs on into `$1640 → $170A` after that routine's
tile-restore, effect-pool and ballistics work. Nothing to grep for.

The apparent impurity was a **measurement artifact, not a port bug**:
`trace.py` sampled at the PyBoy tick boundary, which slices the main loop
mid-head, so some ticks contained two camera executions and some none.
Sampling at the `$0A4F` VBlank-wait hook made every camera field exact. Worth
remembering: when one field refuses to converge while everything around it is
perfect, suspect the measurement.

### Open gap: slope X-snap on horizontal probes

`horizontalCell()` now passes *through* slope graphics rather than treating
them as walls (`$22C6` falls through to `$22C9`, which dispatches on the probe
mode into `loc_00_2348` / `loc_00_22F5` and ends at `loc_00_23B6` = no wall).
But it does not yet apply the X-snap tables at `0:$23B8-$2408` that those paths
run first, which costs ~20 subpixels of position. This is the single
`walljump-chain-both-walls` xfail.

## Bugs the oracle caught that inspection had missed

1. **Wrong camera routine.** `sub_00_104E` and `sub_00_121F` look nearly
   identical; only the latter runs per frame. The init-time one masks the low
   byte with `$F0`, uses `SUB $15`, and tests `$1D` — all three differ.
2. **Wall push.** `loc_00_1F61` / `loc_00_1F87` shove the player 1 px out of a
   wall and then snap `xlo` back to `$80` *only* when velocity is not already
   carrying them away. That is why standing beside a wall is stable but the
   first frame of walking keeps a permanent 1 px offset — invisible by
   inspection, obvious in a diff.
3. **The horizontal probe is a three-cell sweep, not one sample.** When the
   sampled cell is empty, `sub_00_20BA` falls through to `loc_00_227C`, which
   also tests the cell ABOVE (if the hitbox pokes past the metatile top) and
   BELOW. Quirk: the up-test uses half-**width** (`$FF8C`) while the down-test
   uses half-**height** (`$FF8D`). That asymmetry looks like an oversight but
   is load-bearing — it is what makes Batman scrape along an overhang for
   exactly three frames while falling past it.
4. **Jump sets the air throttle to 1, not 0** (`$1A3F: LD A,$01`), and landing
   never touches it — there is no write to `$FF98` in the landing path at all.
   Resetting it on landing (which seemed obviously right) inverted the
   odd/even acceleration phase of every subsequent fall.
5. **Pressing into your own momentum brakes, it does not accelerate.**
   `$1881: BIT 7 / JR NZ -> loc_00_1840`. Holding right while still moving left
   bleeds 1 subpx per frame until the direction reverses — no acceleration at
   all — and this applies in the air as well as on the ground. Accelerating
   unconditionally (the obvious reading) makes every direction change too
   sharp.
6. **The wall cling is a 16-frame total freeze.** `loc_00_1F33` does not park
   the player on the wall to await input: it flips the facing, sets the jump
   velocities immediately via `sub_00_1DA0`, and sets a lock in `$FFB2`. For
   the next 16 frames position, velocity AND gravity are all suspended — the
   trace shows x, y, vx, vy literally unchanged — and only then does the stored
   velocity apply. The jump sound plays when the lock EXPIRES, not when it
   starts. The lock's top 3 bits hold the launch direction and survive the
   countdown, gating input until landing clears them (`$1B46`).
7. **The metasprite index is `facing`, not `facing XOR 1`.** `$1BA3` reads
   `LDH A,[$FF88] / XOR $01 / LDH [$FF8B],A`, which is exactly what it looks
   like — but that arm is not the one the walk/idle path takes. Reading the
   real shadow OAM (`tools/oracle/checksprite.py`) shows facing 0 (right)
   selecting entry 0, attr `$30` (X-flipped). Taking the disassembly at face
   value drew Batman mirrored for his entire run and cost ~276 px/frame against
   the real screen — invisible in the state trace, since no gameplay field is
   affected. Only the pixel comparison catches this class of bug.
8. **Ammo is spent before the free-slot search** (`$1996` precedes `$199A`), so
   pressing B with all three batarangs already in flight consumes a batarang
   AND punches. Faithfully reproduced; not a bug to fix.
9. **An attack suppresses directional input entirely** (`$1815`), as does an
   active bat-rope (`$181A`). Both fall through to the friction path, so you
   coast — you cannot steer mid-swing.
10. **Animation ids drive collision.** The hitbox is read per animation from
   `0:$27A8`, and airborne poses are 1 px narrower (halfW 14) than grounded
   ones (halfW 15). Guessed ids therefore produce wrong *collision*, not just
   wrong pixels. `tools/oracle/animmap.mjs` derives the real mapping from a
   trace: walk cycle `$00-$03`, idle `$06`, land `$07`, rising `$08`,
   fall-entry `$09`, falling `$0A`.
11. **The enemy wall jump is fired by the ANIMATION system, not the AI.** A
   walker turning at a wall/ledge (`1:$5262`) only sets r[1] bit 6 and an
   animation timer at +$18; it is the DRAW path (`$5EA0 -> $5ECF`) that, when
   that timer expires, sets the rising bit and loads the +$1C jump velocity.
   Consequently a jump is *delayed* whenever the draw is skipped — outside the
   7-row vertical window, on dark hit-blink frames, or while paused. Modelling
   the animation counters is mandatory for state fidelity.
12. **The enemy contact damage is an attack probe, not a bounding box.**
   `sub_01_6666` mode 5 (from `sub_01_6616` at the record's +$1E/+$1F offsets)
   only tests the player when the probed CELL IS EMPTY, in screen space, with
   an 8 px X window and — quirk — the player's half-**width** (`$FF8C`) as the
   Y window. The knockback direction comes from the ENEMY's facing.
13. **The ceiling probe offset is the half-width too** (`$1EAB` reads `$FF8C`,
   not `$FF8D`), it runs on EVERY vertical path — grounded and falling
   included, not just rising (`$1A63` falls into `$1A9D`) — and its empty cell
   falls into the same neighbour/slope lookup as the floor probe (`$20FF ->
   $210C` serves modes 3 AND 4). On level 5 only, spikes overhead are a solid
   ceiling while airborne (`loc_00_1EE9`): that is how the descending spike
   trap shoves a falling player down a row instead of shredding him.
14. **The `$15BA` "object contact" routine walks the `$C6CF` pickup-drop
   array, not `$C1E8`.** An earlier port ran it against the map objects; the
   oracle caught it deleting the level-5 spike trap the moment the player
   walked under it. Map objects have no generic contact test at all.
15. **The type-9 spike trap is terrain that grows.** `jt_01_464F` stamps a
   two-column spike into the map two cells per step (every 3rd frame down to
   row `$1D`, every 13th frame back up to `$17`), with `$FA`-past-the-end
   style hardcoded row bounds. Its activation half-width is `$08`, not the
   `$0B` most objects use — `1:$4BA5` is indexed by RAW type and types 9/10/11
   read `$08/$09/$FA` — and drifting out of the window clears bit 7
   (`loc_01_4A51`), which an early port skipped.
16. **The ROM's 16-bit negate idiom is broken for lo = `$FF`.** The CPL/CPL/+1
   pair at `$6639`/`$6C68`/`$5B30` skips the +1 when the complemented low byte
   is zero, so `-(x)` comes out `$100` short. Unreachable with shipped data
   (the negated quantities are multiples of 16) but reproduced anyway
   (`neg16q` in enemies.js).
17. **The title's UP and DOWN are the same button.** `$02DB` tests bits 6 and 7
   in one `AND`, and `$02F9` acts with `XOR $01` on `$C712` — there is no
   per-direction handling, so from OPTION a *second* DOWN goes back up to
   START. Reading it as a conventional two-way menu gives clamped behaviour
   that the cartridge does not have. Verified live: `$C712` 0 → DOWN → 1 →
   UP → 0, with cursor OAM moving `$64` ↔ `$74`.
18. **The title cursor is drawn from the metasprite table, not fixed tiles.**
   `sub_00_0FCC` cycles ids `19 C9 CA CB` (table `0:$3337`) on
   `(frame & $18) >> 3` — an eight-frame band each, so a full blink is 32
   frames. Each id is two 8×16 sprites at dx `-8`/`0`, the right one X-flipped
   (`attr $20`); real OAM reads x `$20`/`$28`, y `$64` or `$74`. The frame
   counter `$FFB1` ticks in VBlank, so it advances on the title even though no
   game logic runs — a port that only bumps its frame counter inside the main
   game tick leaves the cursor frozen on one tile.

19. **The bat-rope's accumulate loops are seeded, so the multiplier is `e + 1`.**
   `$3EDC` loads `HL` with the delta *and* `BC` with the delta, then adds `BC`
   `E` more times — so slot `$FFB4 + n` moves by `delta * (n + 1)`, not
   `delta * n`. Reading it as a plain `delta * E` multiply makes every link and
   the player move at two-thirds speed, which still *looks* like a pendulum and
   only shows up as an off-by-one in `$C730`. The same seeded-accumulate shape
   is in the launch maths at `$3FEE` and `$4028`.
20. **The rope moves the player through the platform-carry registers.** The
   physics loop runs one slot *past* the end of the chain, and slot 6 writes
   `$C72F`/`$C730` instead of a position. So Batman is carried by the rope the
   same way a moving platform carries him — there is no rope-specific movement
   code. X is `ADD`-ed but Y is `LD`-ed, and a `$C730` that is already negative
   aborts the swing into the release path (`$3F80` → `$3FD3`).
21. **`XOR A` at `$41B0` clears the turn counter as well as the phase.** `$41B4`
   is a shared tail, so `$C720` receives the zero meant for `$C71F`. Every
   swing extreme therefore costs exactly two frames. Storing the incremented
   value instead makes the first turn correct and every later one instant, so
   the swing gains a frame per half-cycle — invisible for about 50 frames, then
   permanently out of step.
22. **The carry is consumed at the TOP of the player update** (`loc_00_170A`),
   not the bottom, and is zeroed there whether or not it was used. Everything
   that writes it — conveyors, platforms, the rope — runs later in the frame,
   so a carry is always applied one frame after it is queued. Consuming it at
   the end of the same update doubles a conveyor's effect on the frame you
   step onto it.

## Tools

| tool | purpose |
|---|---|
| `oracle/probe.py` | boot path: where gameplay starts, what state it starts in |
| `oracle/trace.py` | per-frame reference state vector |
| `oracle/compare.mjs` | field-by-field diff, first divergence per field |
| `oracle/hookprobe.py` | does a routine see this frame's or last frame's state? |
| `oracle/probecells.py` | exactly which map cell a probe read, and what it found |
| `oracle/hits.py` | which code path executed on each frame |
| `oracle/checkmap.py` | our exported map vs the real `$D000` (byte-identical) |
| `oracle/animmap.mjs` | derive the ROM's animation-id mapping from a trace |
| `oracle/regress.mjs` | the whole scenario corpus, port vs ROM, frame-exact |
| `verify_assets.py` | `assets/` vs the real ROM, all 14 levels (see below) |
| `test-all.mjs` | single entry point for every stage (`npm run test-all`) |

## Next: function-level fixtures

`pyboy.hook_register(bank, addr, cb)` fires on execution of a ROM address.
Hooking a routine's entry and exit and snapshotting state at each yields real
(pre-state → post-state) pairs from actual gameplay as generated unit tests —
proving a routine exact without needing the renderer or the frame loop. This is
the highest-value remaining tooling work.

---

## Test suite

Four layers, one entry point. `tools/test-all.mjs` runs them in cheapest-first
order so a bad constant or a corrupted export is reported before anything
spends half a minute inside an emulator.

```
npm run test-all                 # everything
npm run test-all -- --fast       # skip the two PyBoy stages
npm run test-all -- --keep-going # do not stop at the first failing stage
node tools/test-all.mjs --only asset-integrity
```

| stage | command | what it proves | needs PyBoy |
|---|---|---|---|
| `unit-tests` | `node --test tests/` | each `src/*.js` routine in isolation | no |
| `tunables-check` | `python tools/gen_tunables.py --check` | all 44 constants still equal the ROM bytes at their cited file offsets | no |
| `asset-integrity` | `python tools/verify_assets.py` | `assets/` is what the real game loads, for all 14 levels | **yes** |
| `oracle-regression` | `node tools/oracle/regress.mjs` | the port is frame-exact against the ROM on the whole input corpus | **yes** |

The runner exits non-zero and names the stage that failed. Stages that *cannot*
run (no `tests/*.test.js`, no `assets/manifest.json`) are reported `SKIP` and do
not fail the run; a stage that runs and fails always does. Everything is
reproducible from a clean checkout given the ROM and
`python tools/export_assets.py`.

### Asset integrity — `tools/verify_assets.py`

Unit tests prove the *code* right. This proves the *data* right, which is the
other half and the one that wastes whole afternoons when it silently rots. It
boots the real ROM, enters each level, and diffs the emulator's live RAM
against the export. 406 checks, ~1.5 s for all 14 levels.

```
python tools/verify_assets.py                # all 14 levels, PASS/FAIL table
python tools/verify_assets.py --level 7      # one level
python tools/verify_assets.py --verbose      # list every individual check
python tools/verify_assets.py --cross-check  # prove the level-entry trick below
```

Three families:

* **map** — `assets/levels/NN.map.bin` byte-identical to `$D000` after the
  level loads, and also identical to an independent Python replay of the bank-3
  blob crossed with the per-level collision LUT. Any mismatch is the player
  walking through walls.
* **manifest** — every per-level field checked twice: against the ROM table read
  raw at its documented address (deliberately *not* through the `gbrom.py`
  helpers `export_assets.py` uses, so a bug in a helper cannot hide itself),
  and against the live RAM the game derived from it.
  `width` -> `3:$4000` header; `metatiles` -> `5:$4000` and `$C368`;
  `startX/startY` -> `1:$7CED` and `$FF81`/`$FF83`; `cameraClamp` -> `0:$103F`
  and `$C732`; `enemySpawns` -> `5:$46EC` and the 8x32 B image at `$C268`;
  `objectSpawns` -> `5:$4716` and 8x16 B at `$C1E8`; plus subtype, both music
  ids, both exits and the resource list.
* **vram** — `assets/levels/NN.vram.bin` vs live `$8000-$9FFF`, compared over
  the byte spans the level's own resource list actually writes. Bytes outside
  those spans are reported but never fail (see the caveat below).

Sampling happens on the **first execution of `$0567`**: the level is fully
loaded (`$0C34`, `$104E`, `$0D50`, `1:$4DDA` have all run) but no gameplay
frame has executed, so nothing has yet streamed player tiles over the OBJ
region or moved an actor.

#### How each level is reached — and which are legitimate

The round-select screen (`$035B`) offers routes 0-2, which the dispatcher at
`$049D` turns into `$FFB0` = 1 / 5 / 9; route 3 (`$0C`) appears once
`$C753 == $07`.

| levels | method | notes |
|---|---|---|
| 1, 5, 9 | **route** | RIGHT presses on the real menu, then START. Nothing poked. |
| 12 (`$0C`) | **route** | Same code path; `$C753` forced to `$07` first, which is the progress flag three cleared boss levels would set. The game's own dispatcher still picks the level number. |
| 2, 3, 4, 6, 7, 8, 10, 11, 13, 14 | **inject** | Mid-route levels, unreachable without playing through. The menu runs normally; `$FFB0` is overwritten at the instant execution reaches `loc_00_04BB` — one instruction after `$04B9`, where the game's own route dispatcher writes exactly that byte. |

The injection is safe because every routine downstream of `$04BB`
(`sub_00_333F`, `sub_00_2889`, `sub_00_0C34`, `sub_00_104E`, `sub_00_0D50`)
reads the level from `$FFB0` and from nowhere else. `--cross-check` proves it
empirically: levels 1, 5 and 9 are entered **both** ways and the sampled
`$D000`, VRAM, `$C368`, `$C268`, `$C1E8`, `$C732`, `$FF81` and `$FF83` are
byte-identical. No save states of a *played* game are used; one PyBoy instance
is parked at the round select with `save_state` and replayed per level.

(Gotcha for anyone extending this: `pyboy.button(name, delay=)` schedules the
release on an internal queue that does not survive `load_state`, so the menu
never sees the press. Drive `button_press`/`button_release` by hand.)

#### Data-integrity problems this found

1. **Water was missing from levels 5 and 13.** `sub_00_0D50` runs *after*
   `sub_00_0C34` and stamps collision `$08` (water) straight into the expanded
   `$D000` map from immediate operands in the code — `loc_00_0E36` writes
   `$D263`x13 and `$D205`x16 for level `$05`, `loc_00_0E51` writes `$D41B`x5,
   `$D4FB`x5 and `$D41D`x12 for level `$0D`, all stride `$20` (one map column).
   The data is in the *code*, not in any table, so replaying the map blob and
   the collision LUT alone produced solid rock where the water should be: 29
   wrong cells on level 5, 22 on level 13. Fixed in `export_assets.py`
   (`apply_water_patches`); the patch table is transcribed independently in
   `verify_assets.py` so the two must agree.
2. **Level 10 does not start where its table says.** `1:$7CED` gives
   `(startX, startY)`, but level init overrides it at `$0543-$0552` with
   `$FF81 = $02, $FF83 = $12, $FF84 = 0` when `$FFB0 == $0A`, and
   `sub_00_2889` skips its own Y write for the same level (`$2985`). The
   manifest carries the table value; the game uses `(2, $12)`. `src/level.js`
   `resetPlayer()` uses the manifest value and will spawn level 10 in the wrong
   place. The verifier asserts the override explicitly for level 10.
3. **The stage-intro VRAM is not universal.** `sub_00_333F` RETs at `$3364`
   unless the level is a route start or a boss — i.e. only `{1, 4, 5, 8, 9, 11,
   12, 14}` load resources `$02/$1D/$05`. `gbrom.build_level_vram()` loads them
   for *every* level, so `assets/levels/NN.vram.bin` for levels 2, 3, 6, 7, 10
   and 13 contains tiles the real game does not load on entry; in real play
   those bytes hold whatever the previous level left. 125-366 B per level.
   Reported as informational because the level's own resource spans — the part
   the export actually claims — match exactly on all 14 levels.
4. The `$9800-$9FFF` tilemap (1263-1951 B per level) is built at runtime by the
   column streamer and is not modelled by the export at all. The remaining
   0-296 B "unaccounted" per level are gaps no resource writes: zero in our
   export, menu leftovers on hardware, and unreferenced by any level tilemap.

### Oracle regression corpus — `tools/oracle/regress.mjs`

17 scenarios, 2895 frames, ~30 s. Every field compared frame by frame against
the ROM; **camera included**, since the `$0A4F` sampling fix made it exact too.
A scenario may add fields beyond the core eight via `extra:` (attack timer,
ammo, batarang slots) and may pass `ammo:` through to both harnesses.

| scenario | frames | covers |
|---|---|---|
| `fall-and-walk` | 150 | spawn fall, ground acceleration |
| `walk-jump-walk` | 120 | jump from a walk, landing back into a walk |
| `walljump-reverse` | 200 | cling and reverse |
| `idle-then-left` | 140 | idle, leftward acceleration, stop |
| `jump-spam` | 180 | repeated jumps, air throttle odd/even phase |
| `wall-run-into-right` | 260 | run into the col-14 wall, then hold RIGHT into it for 80 frames — the `loc_00_1F61` push and the `xlo=$80` snap as a fixed point |
| `wall-into-left-boundary` | 160 | the mirrored `loc_00_1F87` push against the level's left edge |
| `ledge-walk-off` | 140 | ground->air with no jump, input released mid-fall |
| `jump-tap-min-height` | 140 | A held 2 frames: `gravityRisingReleased` from frame 3 |
| `jump-hold-max-height` | 140 | A held 45 frames: `gravityRisingHeld` throughout; apex 16 px higher |
| `jump-land-exact-frame` | 110 | a short hop whose only interesting event is the landing frame |
| `walljump-launch-off-right-wall` | 115 | cling, the 16-frame total freeze, the launch |
| `walljump-chain-both-walls` | 260 | two clings, both launch directions, no ground contact between — **xfail**, see below |
| `long-fall-terminal` | 200 | 116 px free fall, 17 consecutive frames pinned at `terminalVelocity` |
| `reverse-at-full-speed` | 220 | two full-speed reversals; `$1881` brakes 1 subpx/frame and never accelerates |
| `punch-standing-no-ammo` | 160 | B with no ammo = punch; `$1A1B` refuses to restart the swing mid-animation. `extra`: action, atkTimer, atkPose, ammo |
| `batarang-fill-all-slots` | 200 | `ammo: 5`, four throws: all three slots fill, then the fourth press spends ammo **and** punches — the deliberate `$1990-$19AD` ordering quirk. `extra`: atkTimer, atkPose, ammo, bat0/bat0x/bat0spd, bat1, bat2 |

Scripts are tuned against the level-1 geometry. `#` = solid, `.` = air,
`B` = batarang pickup; the player spawns at metatile (1, 2):

```
    0 ################################
    1 #......#........#########.......
    2 #......#........#########.......      map row = $FF83 - 16
    3 #.....##........#...............
    4 #.....##..#..####...............      spawn platform: cols 0-3,
    5 #.....##B.#..#..................        top at row 8
    6 #.....#####.................####      shaft: cols 1-5, rows 1-7,
    7 #.....#####.................####        walls at col 0 and col 6
    8 ####......#...........###.......      main floor: row 13, cols 4-13
    9 ####......#......###..###.......      wall: cols 13-14, rows 10-12
   10 ####.........##..#########......      pit: cols 28-29
   11 ####..........#..#########......
   12 ####..........#..#########......
   13 ############################..##
   14 ####.#####.#####.######.####..#.
   15 ####.#####.#####.######.####..#.
      00000000001111111111222222222233
      01234567890123456789012345678901
```

#### Expected failures

A scenario may carry a `knownFail` string: a *diagnosed but unfixed* port bug.
It is allowed to diverge (`xfail`) but not allowed to start passing silently —
an `XPASS` fails the run and tells you to delete the annotation. This keeps a
known bug documented and pinned instead of deleted or quietly tolerated.

**Open: the below-cell branch of the horizontal sweep skips the slope X-snap**
(`walljump-chain-both-walls`). When the probed cell is empty and the one below
is solid, `$22C6` falls through to `$22C9`, which dispatches on the probe mode
(`$C72B`) into `loc_00_2348` (mode 1, rightward) or `loc_00_22F5` (mode 2,
leftward), and each tests the below cell's **graphic** id against its own slope
list — `$2C/$29/$32/$34` going right, `$2E/$29/$31/$36` going left on levels
< 3, `$3E/$3F` on levels >= `$0C`. (§6.4 lists the union of the two; the ROM
splits them by probe direction.) On a match it indexes the X-snap tables at
`0:$23B8-$2408` by `$FFBC` and then, at `$231A`/`$2391`, either **rewrites
`$FF81`/`$FF82`** to push the player out along the slope face or ends at
`loc_00_23B6` = `XOR A / RET`, i.e. no wall.

`horizontalCell()` now reproduces the "no wall" outcome but never the position
rewrite. Frame 125 of the scenario: flying left past the spawn platform, the
cell below the probe is col 3 row 8, graphic id `$36` — a slope — and the ROM
snaps x to 928 while the port leaves it at 1036, ~7 px out, which then moves
where the landing happens. Slopes are handled for the floor/ceiling probes
(`$210C` → `$21A6`/`$216A`) but not for the horizontal ones. Confirmed with a
PyBoy hook on `$1FBD` reading register A: the ROM's leftward probe returns 0 on
that frame.

**`skipFrames`.** One scenario drops frame 1 from the comparison, and only for
this reason: `trace.py` injects `--ammo` *after* frame 1 has already been
sampled (frame 1's `$0A4F` sample is collected inside `boot_to_gameplay`),
while `render-frame.mjs` sets it before its first tick. That is a one-frame
harness skew, not a port divergence. Do not use it for anything else.
