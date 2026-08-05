# 03 — VERIFICATION

How we know the port behaves like the original.

**Scope: this file is BATMAN's.** Every command, address, stage and numbered
lesson below is the Game Boy port. The repository holds three games now, and
each has its own oracle, its own gate and its own record:

| game | emulator | gate | record |
|---|---|---|---|
| Batman (Game Boy) | PyBoy, Python | `npm run test-all` — 27 stages | this file |
| Gradius (NES) | Mesen 2.1.1, Lua | `node games/gradius/tools/test-all.mjs` — 12 stages | `docs/worklog/gradius/` |
| DaiOuJou (IGS PGM) | MAME 0.288, Lua, `-video none -sound none -nothrottle` | no `test-all` yet; unit tests plus individual gates under `games/ddpdoj/tools/` | `docs/worklog/ddpdoj/` |

The method is the same for all three and is written up once, cross-game, in
`docs/knowledge/`. What is *below* is Batman's application of it — including the
45 numbered lessons, which are the concrete instances behind
`docs/knowledge/02-traps.md`. **Do not read a count here as a project-wide
count**; the other two games' instances are in their worklogs and have never
been merged into one list.

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

## Current fidelity

`node tools/oracle/regress.mjs` runs the whole corpus: **50 of 50 scenarios
(14,519 frames, levels 1/3/4/5/6/8/9/11/12/14) are bit-exact on every field,
camera included.**
See **## Test suite** for the per-scenario table.

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

### Closed gap: slope X-snap on horizontal probes (kept for the method)

`horizontalCell()` now passes *through* slope graphics rather than treating
them as walls (`$22C6` falls through to `$22C9`, which dispatches on the probe
mode into `loc_00_2348` / `loc_00_22F5` and ends at `loc_00_23B6` = no wall),
and applies the X-snap tables at `0:$23B8-$2408` those paths run first. The
`walljump-chain-both-walls` scenario that pinned this as an xfail is bit-exact
now — the fix narrative lives on its entry in `regress.mjs`.

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

23. **The batarang brakes twice as hard as it accelerates, and stops dead.**
   The return leg's four steering branches are not symmetric: when the velocity
   already points the right way it eases by 2 toward a ±64 cap (`$3A9A`,
   `$3B0B`, `$3ABA`, `$3B2E`), but when it points the *wrong* way it changes by
   **4** and clamps to zero rather than crossing (`$3B52`, `$3B79`, `$3B41`,
   `$3B6B`). Missing the braking branches is invisible on the X axis of a
   standing throw — that stayed 100% for 220 frames — and only shows up when
   the player moves during the return, as a long vertical zigzag instead of one
   clean sweep. The target row only changes every 16 px, so a velocity that
   accelerates through zero oscillates forever.

24. **Level 1's "water" is terrain, not sprites, and not water collision.**
   The map has no `$08` cells at all. The four type-7 objects at columns
   99–112 (`jt_01_4447`) stamp graphic `$47` / collision `$FD` one cell at a
   time straight down their own column from row `$13` to `$1F`, erase the same
   column on the way back up, pause, and repeat — so the falling streams are
   drawn by the tilemap and hurt like spikes. Both the per-row gate and the gap
   between pulses scale with difficulty (`$50`/`$28`/`$10`). This is also why
   the rope has a level-1 special case for `$FD` (`$3DF1`): without it the
   grapple would catch on a column of water.
25. **`--warp` exists because late-level content is unreachable by input.**
   Nothing can walk from level 1's start to column 99 without a solved route,
   so both harnesses take `--warp COL[,ROW]`. trace.py can only write it after
   the oracle's first sample (taken during boot), so render-frame.mjs applies
   it after frame 1's trace row too — otherwise every warped scenario is
   permanently one frame out of step.

26. **The level-1 "enemy hit the port missed" was the water.** The
   l1-water-spouts divergence at f265 (vx=16, vy=23, air=1) looked exactly
   like a melee from the walker at column 95 — but that walker's melee lands
   at f174 and was already bit-exact. The real source is `sub_00_2CBE`
   (`$05C6`) → `loc_00_2D3D`, the levels-1/2 **water body**: a 16-bit surface
   level in `$C70A/$C70B` that rises/falls between rows `$16` and `$1F`,
   8 units per even frame. When the surface reaches the player's row
   (`$2E6A`, HIGH bytes only, equal counts as submerged) it arms `$FF95` —
   the ONLY writer of the water slow mode, ever — and, on difficulty ≥ 1 with
   `$C714` expired, deals 1 damage and stamps `$C714 = $5A` (`$2E8D`), always
   knockback-RIGHT, no facing test. The launch itself is the ordinary `$1776`
   head of the player update, one frame later. Quirks: the 7-cell waterfall
   stamp (`$2DDC` table, cols `$37/$38`) runs one cell per even frame and
   those frames `RET` at `$2DDB` **without** the window-Y/player/enemy tail
   (only the 7th falls through); `$C713` never stores 8; and once the surface
   bottoms out while the player is at column ≥ `$5A` it parks at `$1F00`
   forever (`$2E2D`). The `$2E9C` tail also sweeps all 8 enemy slots setting/
   clearing r[1] bit 1 (the `$F8` slow-fall terminal) against the surface —
   that bit doubles as the edge detector for the one-shot surface splash
   (`1:$7A99`, slots 1-3 of the `$C6EF` pool; slot 0 is the player's).

27. **`$FFB1` and `$FFA7` are free-running and read RAW — boot phase is
   load-bearing.** The water logic gates on `$FFB1 & 1` (`$2D5D`), the
   in-water fall gravity on `$FFB1 & 7 == 0` (`$1AE4`), the enemy loop
   direction on `$FFA7` (`$4E13`). Neither counter ever resets, so their
   phase at gameplay start comes from the boot path: the fixed
   logo→title→round-select route lands **every** level at `$FFB1 = $6D`,
   `$FFA7 = 1` on the first gameplay iteration (measured for 1/5/9/12 — level
   load never costs an extra frame). The port seeded its counter at 0, which
   put every `& 7` cadence 5 frames out; invisible for 27 scenarios because
   nothing COMPARED consumed the raw phase until the water gravity did.
   level.js now seeds `$6D`/1 at level init.

28. **The cartridge drops actor/enemy updates on real lag frames.** When the
   VBlank ISR fires while `$FFE7` is still 0 — the main loop had not finished
   its iteration — it sets `$C757` (`$065C`), and both the actor driver
   (`$424D`) and the enemy driver (`$4E39`) skip that iteration's updates
   (screen-tail only). Activation still runs (`$4E27` tests bit 7 *before*
   the gate). The warped l1-water-spouts run hits real lag at f2, f6 and
   f226; f226 freezes the column-95 walker for one frame, after which it runs
   permanently one frame behind a port that never lags. `$FFB1`-per-iteration
   alignment survives (the loop catches back up within the frame), so only
   the skipped updates are observable. **This is instruction-level timing and
   is out of scope by the project's own definition** — the en3 harness fields
   exist in trace.py/render-frame.mjs for diagnosis but are deliberately not
   compared in any scenario.

29. **`$C714` is decremented at the HEAD of the player update, the port at
   tick end.** Same behaviour, different sampling point: the oracle's `$0A4F`
   sample always reads one more than the port's end-of-tick value while a
   count runs. Comparing `iframes` directly would flag a phantom permanent
   divergence — compare `hp` and the knockback launch frame instead. (Same
   class of artifact as the camera sampling in the section above: when a
   field refuses to converge while its consequences all match, suspect the
   measurement.)

30. **A missing hook makes a CORRECT silence look like a divergence.**
    `tools/oracle/sound.py` never hooked `$434A` — step 4's `NRx2 = 0` sweep
    over unowned channels, which is the engine's only note-off. Recordings
    therefore showed a channel still ringing after the ROM had silenced it, and
    a port that correctly silenced it was reported as wrong. The general shape:
    when the oracle and the port disagree about something *stopping*, check
    that the recorder can see the stop at all. (Same class as the `$431F`/
    `$4324` gap already logged.)

31. **A partial init means one screen can inherit the last one's state, and
    something does rely on it.** `$40B8` does not clear the whole track block,
    so a song can start with the previous song's frequency word still loaded.
    Song `$00`'s first event is a `REST`, which retriggers WITHOUT writing a
    pitch — so it audibly plays whatever was there before. The recorder now
    snapshots `$C800-$C94C` at the song-start tick and the diff seeds the port
    from it. Two songs "diverged at tick 0" for months purely because the port
    started from zeroes and the cartridge did not. `recon-4` §9 listed this as
    an open question; it is answered, and the answer is yes.

32. **`sub_00_0AE1` takes B as the sound id and C as the mask.** `LD BC,$1601`
    is id `$16`, mask `$01`. Reversing them is the worst kind of bug: a cue
    still plays, so nothing crashes and no memory comparison flags it — the
    game just makes the wrong noise. Caught only because someone said the
    pickup chime sounded off. Every `LD BC,$xxyy` feeding `$0AE1` reads
    high-byte-first.

33. **Four routines can be two routines with two entry points each.**
    `$488D`/`$48E4`/`$499B`/`$4940` look like four map-object handlers; they
    are two oscillators whose halves `JP` into one another (`$48A7 → $48E7`,
    `$48FD → $4890`, ...). The brake half subtracts 2 and then falls into the
    accelerate half, which adds 1 back — so the real step is v−1, not v−2, and
    a reversal bleeds 1 per frame. `actorType3` had already shipped with the
    v−2 reading. This is the fall-through lesson again, in its nastiest form:
    the label you land on is not where the routine ends.

34. **A flag named for a milestone can mean something else entirely.**
    `$FFB5` is set at the end of every level load, which reads as "a level has
    been reached". It is not: `$0561`'s CALL falls straight through into
    `loc_00_0564`, `XOR A / LDH [$FFB5],A`, so the flag is cleared before the
    first main-loop iteration finishes, every time. Its job there is the
    `$05C0` restart test. The only write that survives to be read by round
    select is the death sequence's at `$2AAF` — so `$FFB5` actually means
    "you got here by dying". Measured, not deduced.

35. **One ROM condition can gate THREE swaps, and porting two of them is worse
    than porting none.** `CP $0E` + `$C756 != 0` (level 14 above easy) appears
    at `$19C0` (the throw sets the RETURNING bit at once and drops the speed to
    8), at `$3A6B`/`$3ADE` (the flight homes on `$C296`/`$C298`, enemy slot 1 —
    the CHASER, not Batman) **and** at `$3BF5` (the catch test's target pair
    becomes `$C28F`/`$C290`, the chaser's cached screen coords, instead of the
    player's `$FF93`/`$FF94`). The Joker fight's batarang is a slow seeker that
    flies to the chaser and is ABSORBED by it; the player never catches one.
    Porting the first two without the third made every throw die on its own
    first frame — the throw spawns at the player's X and `$40` above him, i.e.
    already inside the `$0C10` catch box, so the slot was freed before anything
    was drawn: ammo spent, no batarang, final boss unwinnable. The symptom
    ("no batarang appears and no ammo is spent") pointed at the throw, and the
    hypothesis in the handover was about update ORDER; both were wrong.
    `tools/oracle/jokerbat.py` settled it by hooking `$3C0F` and reading B/C —
    the pair the ROM chose equals `$C28F`/`$C290` on all 25 flight frames and
    `$FF93`/`$FF94` on none. `jokerSeek()` in `batarang.js` now spells the
    condition once so the three arms cannot drift again.

    Corollary measured on the way: **the `+7/+8` screen pair carries
    sub_00_1172's `+8/+16` OAM offsets**, so anything compared against an enemy
    record's `r[7]`/`r[8]` must use that convention and not the bare drawing
    pair `updateScreenPos` stores. The two differ by a constant, which cancels
    when both sides of a test share it — so the player-catch path was correct
    by accident and the chaser-catch path would have been silently 8/16 px off.

36. **The levels-9/10 pixel score sits at ~87% from f120 on, and it is the
    feeder race -- not the background art.** Worth writing down because it
    looks exactly like an art bug and is not one. `bgartdiff.mjs` reports **0
    wrong background cells** on levels 9 and 10, and a full shadow-OAM diff at
    level 9 frame 120 is **identical entry for entry, all 22 of them** (x, y,
    tile AND attr). What is left is the FAR sky band's `SCX`, off by ONE pixel
    on one frame in four -- and a 1 px shift of a detailed band mismatches most
    of the pixels in its rows, which is how 1 px becomes ~3000 wrong pixels and
    an 87% score.

    The cause is the `layers` feeder ordering, measured frame by frame: the
    port's `$C742` accumulator matches the cartridge's on EVERY frame, so the
    divergence is entirely in `parallaxBands`'s one-step lookahead (TIMING FACT
    2 in `src/raster.js`). The cartridge applies that lookahead at f103 and
    f107 and then STOPS -- at f111, f115, f119 and f123 its band reads the
    pre-increment `$C742`. The switch happens because the main loop's work per
    iteration changes as the level gets busier, which moves `$058B` relative to
    the STAT fire. That is instruction-level timing, out of scope by §28.

    Both choices were measured over 200 frames, which is the useful part:
    keeping the lookahead costs **6288** bad scanlines, dropping it costs
    **8112** and breaks from f3. So the shipped behaviour is the better of the
    two, not an oversight -- do not "fix" it by removing the lookahead.
    `rasterdiff.mjs`'s 100-frame cap on the parallax scenarios sits just below
    the first flip for this reason.

37. **"Renders without throwing" is not "renders a picture" -- and that is how
    a softlock shipped.** Level 6's clear is the only one that leaves through a
    TRANSITION (`$3605`), and its fanfare is a 33-frame fade to white: measured
    on the cartridge, `$FFAD`/`$FFAE`/`$FFAF` walk `E4 -> 90 -> 40 -> 00`,
    `$FFB0` becomes `07` at f181, and on **that same frame** the three are
    rewritten `E4`/`E4`/`C4`. The port's transition arm never restored them.
    Every other arm out of a clear did -- `to: 'level'`, the stage-intro
    handover, the ending -- so this was the one path that could lose them.

    The result was not a freeze and not a crash. Level 7 loaded, ran and
    accepted input; every pixel was the same shade. Reported from play as "the
    boss explodes, the screen fades to white, and then we softlock", which is
    exactly what an invisible running game looks like.

    **THREE harnesses drove this handover and all three said PASS**, because
    each one asked whether frames rendered and none asked whether they rendered
    anything. Two did not call `renderFrame` at all; the one that did only
    checked that it did not throw. This is `byte-exact data is not a correct
    picture` (§ above) wearing a new hat, and the general rule it earns is:
    **a render check must assert on the OUTPUT, not on the absence of an
    exception.** `l6clear.mjs` now counts distinct shades in the framebuffer and
    is a gate stage (`level6-clear`); validated by removing the restore and
    watching it go red with the diagnosis.

    Second-order lesson: chasing this cost several rounds of wrong hypotheses
    (a missing asset, a rejected promise, a sync throw, the victory hold never
    finishing) because the symptom word was "softlock". The report that cracked
    it was the one that described what the SCREEN did -- "fades out to white" --
    not what the game failed to do. Ask what it looked like.

38. **A harness that sets up state the APPLICATION does not have will pass
    while the application is broken.** The ending's credit circle is a flat
    rectangle of tile `$7E` stamped into the BG map by the scripts at
    `1:$7B34`/`$7B49` (measured: five run-fills each, every one a single
    repeated tile id) with a METASPRITE drawn over it -- `$3793`'s
    `LD BC,$3838 / LD E,$F2 / XOR A / CALL sub_00_0BC6`, id `$F2` at OAM
    (56, 56). That sprite is the smooth dithered oval. Without it you see the
    bare rectangle with hard 8-pixel stepped corners.

    `drawEmblem` read its metasprite table from `state.titleManifest`, which
    `main.js` assigns ONLY inside `if (title)` -- i.e. only when the game was
    booted through the title screen. Boot straight into a level, or straight
    into the ending, and it was null, the function returned early, and the
    entire sprite layer vanished silently.

    **Both oracle harnesses assigned `state.titleManifest` themselves.** So both
    always drew the oval, and `endingshot.mjs` reported the ending PIXEL-EXACT
    over 88 frames and 2,027,520 pixels while the shipped game rendered a bare
    rectangle. The number was real; it just measured a configuration no player
    could reach. Removing that one line from each harness turns the same run
    into **59 of 88 frames wrong**, ~1470 pixels each.

    The rule: a harness may only set up state the application itself sets up on
    the path being tested. Anything else is the test writing the answer down
    for itself. When a player reports something the suite says is perfect,
    suspect the SETUP before suspecting the player -- and diff what the harness
    assigns against what `boot()` assigns.

    (Related trap on the way in: the port's own frame counter and
    `ending.py`'s shot numbering are different clocks -- the recorder counts
    `$0A4F` hits and silently skips requested frames -- so "frame 1730" meant
    two different pictures in the two tools, and every comparison landed on a
    full-size frame. Pin the numbering before trusting a frame-indexed diff.)

39. **A scripted walk-through does not draw Batman at all.** `$1643` is
    `LD A,[$C737] / AND A / JP Z, loc_00_170A`; while a script runs the ROM
    takes the `$164A` arm instead, and every path out of it ends at `$1702` or
    `$1706` with a bare `RET`. `loc_00_1D0C` is never reached, so no player
    metasprite is queued, `$FF93`/`$FF94` are not refreshed (`$1B58` is on the
    skipped path) and the `$27A8` hitbox is not reloaded (`$1D2C` is the draw's
    tail). MEASURED on level 5 with hooks on `$170A`/`$1B4A`/`$1D0C`: the draw
    fires every frame to f73, then not once from f74 to f118 while
    `$C737 = 1`, and the cartridge's OAM over that span holds the five HUD
    sprites and nothing else.

    The port ran `cachePlayerScreen` / `applyAnimHitbox` / `drawPlayer`
    unconditionally after `updatePlayer` — the fall-through trap in its usual
    shape, where an arm that "skips the update" quietly borrows the update's
    tail. `updatePlayer` returns a boolean now and main.js gates all three on
    it, which also covers the pit death (`$1773` is a `JP` into `sub_00_29E7`,
    not a `CALL`), the HP death and an exit reload. `pixeldiff l5-walk` f80 went
    315 wrong pixels to 0 and no other frame in any scenario moved.

40. **DMG object priority is smallest OAM X first, index only on ties.** The
    renderer resolved overlaps purely by OAM index, and said so in a comment.
    MEASURED on level 9: the HUD's fifth bar segment (OAM index 4, x = 48) and
    an enemy metasprite (OAM index 7, x = 46) overlap at rows 17-23; 46 < 48,
    so the cartridge draws the ENEMY over the bar and the port drew the bar.
    Substituting the cartridge's own captured OAM into our renderer reproduced
    the identical 14 wrong pixels, which is what ruled out position, tile data
    and capture lag and left only the compositing rule.

    The two rules are separate and must stay separate. The ten-per-line CUT is
    an OAM-order scan — hardware fills the ten slots by index — while PRIORITY
    among the survivors is by X. `drawSprites` is two phases for that reason:
    sorting the whole queue by X and then taking ten per line regresses the
    level-12 f120 case (21 sprites on one line) from 0 to 361 wrong pixels.

41. **The bob gate reads r[0], and a unit test that takes the answer as an
    argument cannot see the difference.** `1:$6069` is
    `LD DE,$FFFA / ADD HL,DE`, and `$606A` reads `(HL)`. MEASURED by hooking
    `1:$606A` over 600 frames of level 9: HL lands on record offset **+0 on 289
    of 289 calls**. Offset +0 is the flags byte whose bits 0-1 are the air
    state -- the same `r[0] & 0x03` `batarang.js` already tests for an airborne
    boss 2. The port shipped `r[1] & 0x03`, which is almost always 0, so it
    bobbed AIRBORNE enemies the cartridge exempts.

    Reported from play as the train levels flickering "up and down like crazy"
    while the real game looked calmer -- and the player was right to compare
    against a longplay rather than trust the port. On level 9 the most-watched
    sprite is the diving flyer: the cartridge glides it, the port popped it 3 px
    every eighth frame. MEASURED: 19 frames of a 600-frame run had one 3x3 enemy
    block at port Y = cart Y - 3, every one on a `$FFB1 & 7 == 0` frame, with
    the enemy records byte-identical on both sides; at f76 that was 9 wrong OAM
    entries, and 0 after.

    Why the existing tests could not catch it: `drawYBob`'s own unit tests pass
    `grounded` in **as an argument**, so they exercise the function's arithmetic
    and never the CALL SITE's operand. They stayed green through the whole bug.
    A test that supplies the very value under suspicion is testing itself. The
    replacement asserts the operand at the call site.

    Ruled out on the way, and worth keeping so it is not re-run: the bob CADENCE
    and amplitude were already exact (3 px, only on `$FFB1 & 7 == 0`, both
    sides); the ten-per-line cut dropped ZERO sprites on either side across the
    whole run; and frame pacing cannot double the rate -- the default loadout is
    `ticksPerFrame: 1` and the accumulator UNDERRUNS on a 60 Hz display (one
    0-tick frame every ~222), so a 2-tick frame only ever appears paired with a
    0-tick one and the average logic rate stays 59.73 Hz.

42. **CALL ORDER WAS UNPROTECTED BY THE UNIT SUITE, AND THE ORACLE ONLY CAUGHT
    HALF OF IT. Both halves were MEASURED, not assumed.** Five distinct order
    mutations were applied one at a time and the whole gate re-run against each.
    All five passed the 691-test unit suite. That is the finding: for two years
    the only thing standing between a refactor and a reordered frame was a PyBoy
    stage that needs the cartridge and covers four scenarios.

    The two that were taken all the way to the ROM:

    **M1, deleting the `$FFA7` slot-direction reversal in the enemy driver
    (`1:$4E13`).** CAUGHT, but barely. `regress.mjs` goes **48/50** -- only
    `l12-shooter-fire` (extra 15.0%) and `l12-projectile-explode` (extra 14.3%)
    diverge, and only in the enemy-record columns, because those are the two
    scenarios where a projectile is spawned into a higher slot than its spawner
    and the direction decides whether it runs on its own spawn frame.
    `oamdiff.mjs` also fails: `l9-walk` drops from 173 exact to 163 with **10
    order-only frames, every one at `$FFA7 = 1`** (the report names f137, 139,
    141, 143, 145, 147, 149 and 151, then truncates the list). Ten
    frames out of a 14,519-frame corpus is what a whole reversed loop is worth
    when almost every scenario has one enemy on screen.

    **M4, moving `main.js`'s SECOND `drawEnemies` flush past `updateDoors`
    (`$05D2`).** **INVISIBLE TO THE ENTIRE ORACLE.** `oamdiff.mjs` PASS with
    identical per-scenario numbers, `pixeldiff.mjs` identical to the byte (73
    frames, 66894 wrong px, 96.023%), `regress.mjs` 50/50 bit-exact. The reason
    is in `main.js`'s own comment and nobody had joined it up: **a door only
    opens to a punch**, `1:$4BB0` is called 0 times and `$C733` reads 0 on all
    400 frames of the level-6 run, and no oracle scenario throws a punch at a
    door at all. So the door side of that ordering rests on the listing alone --
    it always did -- and the 199/400-frames-wrong measurement recorded next to
    it is about the flush being after the **HUD**, which is a different fault.

    The lesson is not "the oracle is weak". It is that **a corpus verifies the
    situations it contains**, and an order only shows up when two producers are
    on screen at once. `tests/frameorder.test.js` and `tests/enemy-order.test.js`
    exist because of this measurement: they construct the contention the corpus
    never happened to contain, they run in 30 ms with no ROM (so CI sees them),
    and each of the five mutations turns a named one of them red. The full
    matrix is in those files' headers.

43. **A draw list can be reordered harmlessly; a contended allocation cannot --
    so test the allocation.** Writing 42's tests turned up the sharper form of
    trap (a). The obvious slot-order test asserts the order of the enemy DRAW
    list, and it is a real test -- but a draw list is only observable through
    OAM, and the moment a scenario has one enemy on screen, every permutation of
    a one-element list agrees. The version that cannot be satisfied by accident
    fills nine of the ten `$C693` effect slots, kills TWO enemies in the same
    frame, and asserts WHICH of them gets the last slot: `sub_00_0CC2` takes the
    first free slot and drops the request when the pool is full, so exactly one
    mark is left and which one is a pure consequence of `$4E13`. Same for the
    spawn-frame question -- `sub_01_6BDC` scans slots 6-7 ascending, so a
    spawner in slot 0 hands its projectile a frame of life on even frames and
    not on odd ones, and the projectile's own `+$13` sink counter says which
    happened after ONE call.

    Generalised: when you need to pin an ORDER, find the place where the order
    decides who wins something scarce. If nothing is scarce, the order may be
    genuinely unobservable -- and then the honest test is the source-order
    CHANGE DETECTOR, labelled as such, which is the other half of
    `tests/frameorder.test.js`.

44. **A harness with no stage behind it is not a check -- it is a file that used
    to work.** `tools/oracle/headless.mjs` is the only thing in this repo that
    drives `boot()`: the real rAF loop, the fixed-timestep accumulator, the
    canvas blit, the suspended-loop watchdog, the fail path and every screen
    hand-off in `stepBody`. It had been throwing
    `document.createElement is not a function` before its first frame ever since
    `c7a1e22` moved the integer upscale inside `boot()` -- five days and several
    phases. NOTHING REPORTED IT, because its only consumer,
    `tools/oracle/flowpix.mjs`, is not one of the gate stages. MEASURED: a grep
    for `.boot(` / `bootHeadless` across `tools/` returns exactly two hits, the
    harness itself and that one non-stage tool.

    The consequence is bigger than the outage. It means the entire host half of
    `src/main.js` -- ~140 lines of browser plumbing -- was covered by no
    automated check at all, and a restructure was about to move it. Phase 10
    repaired the harness FIRST, used it to fingerprint 1072 displayed frames
    across title, round select, level 1, a pit death and the ending, and then
    moved only the pieces that fingerprint could see. The fixed-timestep
    accumulator stayed put and `src/host/runtime.js` says why: the harness
    advances a CONTROLLED clock exactly one `FRAME_MS` per callback, so it can
    only ever exercise the one-step case, and the `Math.min(now - last,
    FRAME_MS * 4)` clamp that exists for backgrounded tabs would have been
    rewritten blind under a green harness. That is 38's shape again.

    Generalised: for every harness, name the stage that runs it. If there is
    none, it is documentation, and it should be either promoted or deleted --
    because a broken one is indistinguishable from a passing one until the day
    you need it.

45. **A checker catches the one defect class a test never can: a comment that
    has drifted from its code.** `src/collision.js`'s `probe()` documented
    `@returns {{value, col, row, subX}}`. It has ALWAYS also returned `px` and
    `py` -- emitted at both return sites, read at five call sites, two in that
    file and three in `src/player.js`. Nine of the twenty-eight errors in the
    first `tsc --checkJs` run over this port were that single line.

    No behavioural check could ever have found it, and that is the whole point:
    the CODE was right. Every unit test passed, all 50 oracle scenarios stayed
    bit-exact, the pixel mean did not move. Only the documentation was wrong,
    and in a project whose stated primary asset is its comments, a lying comment
    is the defect. The same run found `renderFrame` declaring three required
    parameters when its only in-game call site passes two, and then found an
    error in the lazy-field inventory being written in the same commit -- a scan
    that matched `state.tables.X` and missed `state.tables?.X`, and so reported
    three lazy fields where there are seventeen.

    What was NOT bought, deliberately: `noImplicitAny` measures 1,193 errors,
    1,025 of them pure annotation labour and 384 the `state` parameter alone
    across 34 files. Not one of the lessons above this line is a type error.
    The stage is `tsc` with `checkJs` on and `noImplicitAny` off -- about 10% of
    the available typing, chosen because it is the part that pays.

    One trap worth naming, since it cost a measurement here:
    `ReturnType<typeof createState>` does NOT work in this tree. `src/state.js`
    sits in an eight-way import cycle and TypeScript silently degrades an
    inferred return type in a cycle to `any` -- `createState().BOGUS_FIELD`
    raises nothing. The escape hatch is an explicit typedef in a cycle-free leaf
    (`src/gametypes.js`, zero imports) plus one `@type` cast at the return.

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
| `test-all.mjs` | single entry point for every **Batman** stage (`npm run test-all`) |

`tools/test-all.mjs` is not the project's gate, only Batman's. Gradius has its
own runner, deliberately not wired into this one (its header says why: two
writers in one file), and DaiOuJou has no aggregate runner at all yet.
**`node tools/publish.mjs` is the only thing that runs all three**, and it
refuses to deploy on a red gate *or on any SKIP*.

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
npm run test-all -- --fast       # skip the 20 PyBoy stages
npm run typecheck                # stage 2 on its own; needs no ROM
npm run test-all -- --keep-going # do not stop at the first failing stage
node tools/test-all.mjs --only asset-integrity
```

| stage | command | what it proves | needs PyBoy |
|---|---|---|---|
| `unit-tests` | `node --test games/batman/tests/` | each `src/*.js` routine in isolation, 740 of them | no |
| `typecheck` | `node node_modules/typescript/bin/tsc -p tsconfig.json` | `checkJs` over `games/batman/src/` -- catches JSDoc that has drifted from the code it documents (see 45) | no |
| `tunables-check` | `python tools/gen_tunables.py --check` | all 44 constants still equal the ROM bytes at their cited file offsets | no |
| `sound-driver` | `node tools/oracle/sounddiff.mjs --all` | every recorded sound id, all four channels plus NR50/NR51 | no |
| `oam-wrap` | `node tools/oracle/oamwrap.mjs` | every queued sprite coordinate stays inside the byte an OAM entry can hold | no |
| `l14-init` | `node tools/oracle/l14init.mjs` | level 14's entrance block, value by value, on all three difficulties | no |
| `level6-clear` | `node tools/oracle/l6clear.mjs` | clearing level 6 reaches level 7 AND the screen is still visible | no |
| `asset-integrity` | `python tools/verify_assets.py` | `assets/` is what the real game loads, for all 14 levels | **yes** |
| `vram-scripts` | `node tools/oracle/vramdiff.mjs --record` | `sub_00_0A0E`'s write stream: address, value AND order | **yes** |
| `title-build` | `node tools/oracle/titlediff.mjs --record` | title + round-select VRAM built from ROM data, all 8192 B each | **yes** |
| `level-art` | `node tools/oracle/waterdiff.mjs` | the window map + animated tiles built from ROM data, 11 levels | **yes** |
| `title-state` | `node tools/oracle/titlestatediff.mjs` | the title's 8 LCD registers and state 4's press-start flash | **yes** |
| `stage-intro` | `node tools/oracle/introdiff.mjs` | `sub_00_333F` built from ROM data, 8 levels x 5 states of VRAM | **yes** |
| `stage-intro-screen` | `node tools/oracle/introscreen.mjs` | the card's 160x144 PIXELS vs what the cartridge displayed | **yes** |
| `ending` | `node tools/oracle/endingdiff.mjs` | `loc_00_3652`: 4 pictures, the 13-line crawl and THE END | **yes** |
| `ending-screen` | `node tools/oracle/endingshot.mjs` | the ending's PIXELS vs the cartridge's own framebuffer | **yes** |
| `game-over-lettering` | `node tools/oracle/gameoverdiff.mjs` | the `$C1C0` GAME OVER letters: shadow OAM and records, 4 levels | **yes** |
| `round-select` | `node tools/oracle/roundseldiff.mjs --record` | route/mode cursor logic, three `$C753`/`$FFB5` states | **yes** |
| `oracle-regression` | `node tools/oracle/regress.mjs` | the port is frame-exact against the ROM on the whole input corpus | **yes** |
| `map-objects` | `node tools/oracle/objregress.mjs` | the `$C1E8` handlers, all 16 record bytes plus stamped map cells | **yes** |
| `progress-flow` | `node tools/oracle/flowdiff.mjs` | route clears, death, CONTINUE and game over vs `$C753`/`$FFB5` | **yes** |
| `raster-bands` | `node tools/oracle/rasterdiff.mjs` | the `$0857` STAT program per SCANLINE: SCX/SCY/BGP/OBP0/OBP1 | **yes** |
| `door-sequencer` | `node tools/oracle/doordiff.mjs` | punch-opened doors, the debris pool and the `$C693` effect pool | **yes** |
| `subsystems` | `node tools/oracle/subsysdiff.mjs` | the six `sub_00_2CBE` branches: conveyor, respawner, freeze, collapse | **yes** |
| `death-sequences` | `node tools/oracle/deathdiff.mjs` | the boss countdown into the fanfare, and the 452-frame player death | **yes** |
| `death-pixels` | `node tools/oracle/deathpix.mjs` | the death sequence's PIXELS, not just its records | **yes** |
| `oam-order` | `node tools/oracle/oamdiff.mjs` | shadow-OAM ORDER against the cartridge, both parities | **yes** |

The runner exits non-zero and names the stage that failed.

**A MISSING PATH IS A FAILURE, NOT A SKIP.** This used to report `SKIP` for a
missing `tests/` or `assets/manifest.json` and still print ALL GREEN with exit
0 -- so a tree whose layout had moved under the runner announced success having
run two stages of twenty-six, and `assets/` being gitignored meant the move left
no trace in a diff either. The runner now prints the absolute paths it probed on
every run and EXITS NON-ZERO naming the one it could not find.
`--allow-missing` restores the old tolerance and says so loudly in the banner.
`--fast` is unaffected: that is a deliberate scope reduction, not a missing
path, and its skips are still skips. Everything is reproducible from a clean
checkout given the ROM and `python tools/export_assets.py`.

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

50 scenarios, 14,519 frames, ~5 min. The table below lists the 28 the
corpus started with; the other 20 (bosses 1-4, the level-3 object and punch
set, the level-12 shooter, the level-14 entrance) are read from the file. Every field compared frame by frame against
the ROM; **camera included**, since the `$0A4F` sampling fix made it exact too.
A scenario may add fields beyond the core eight via `extra:` (attack timer,
ammo, batarang slots, enemy records, water state) and may pass `ammo:` /
`warp:` through to both harnesses.

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
| `batarang-full-return` | 220 | one standing throw, the whole out-and-back: the return-leg homing and its asymmetric braking |
| `batarang-throw-on-the-run` | 240 | thrown mid-run; the return homes on a moving player |
| `batarang-arc-throw-in-air` | 240 | airborne Up-throw (the `$1A08` arc flag), landing mid-flight |
| `rope-fire-and-swing` | 320 | Up fires the rope: extension, bite, pendulum, the two-frame turn at each extreme, the platform-carry that moves Batman |
| `rope-release-launch` | 320 | A mid-swing: the `$3FD6` tangent launch |
| `l1-water-spouts` | 400 | warped to col 95: the type-7 spout phase machines, the level-1 water body (trigger, waterfall stamp, rise), the `$2E8D` water hit + `$1776` knockback, and a walker's full activation/leap/melee. `extra`: objects, enemies, hp, slow, water state |
| `l1-water-rising-hits` | 620 | warped to col 74 (outside every enemy window): six water hit/knockback cycles (hp 10→4), in-water walking, the `$FFB1 & 7` water fall gravity |
| `l1-walker-approach` | 620 | dormant level-1 records staying dormant while the player grinds the col-13/14 wall (no walker activates — the wall stops the camera short) |
| `l5-walkerjump-approach` | 620 | state 2: idle → chase across ledges, melee lunge, committed walk, turn-anim wall jumps |
| `l9-flyer-dive` | 620 | state 3: slow sink, committed flight, wall hops, the dive |
| `l5-spike-trap-gauntlet` | 578 | four jumps deep into level 5 under the type-9 spike traps; enemy melees, knockback, spike damage, player death at f578 |

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

**Closed (kept as a worked example): the below-cell branch of the horizontal
sweep skipped the slope X-snap**
(`walljump-chain-both-walls`, since fixed and bit-exact). When the probed cell
is empty and the one below
is solid, `$22C6` falls through to `$22C9`, which dispatches on the probe mode
(`$C72B`) into `loc_00_2348` (mode 1, rightward) or `loc_00_22F5` (mode 2,
leftward), and each tests the below cell's **graphic** id against its own slope
list — `$2C/$29/$32/$34` going right, `$2E/$29/$31/$36` going left on levels
< 3, `$3E/$3F` on levels >= `$0C`. (§6.4 lists the union of the two; the ROM
splits them by probe direction.) On a match it indexes the X-snap tables at
`0:$23B8-$2408` by `$FFBC` and then, at `$231A`/`$2391`, either **rewrites
`$FF81`/`$FF82`** to push the player out along the slope face or ends at
`loc_00_23B6` = `XOR A / RET`, i.e. no wall.

While open, the symptom was: frame 125 of the scenario, flying left past the
spawn platform, the cell below the probe is col 3 row 8, graphic id `$36` — a
slope — and the ROM snaps x to 928 while the port left it at 1036, ~7 px out,
which then moved where the landing happens. Confirmed with a PyBoy hook on
`$1FBD` reading register A: the ROM's leftward probe returns 0 on that frame.
`horizontalCell()` now performs the rewrite too and the scenario is bit-exact.

**`skipFrames`.** One scenario drops frame 1 from the comparison, and only for
this reason: `trace.py` injects `--ammo` *after* frame 1 has already been
sampled (frame 1's `$0A4F` sample is collected inside `boot_to_gameplay`),
while `render-frame.mjs` sets it before its first tick. That is a one-frame
harness skew, not a port divergence. Do not use it for anything else.
