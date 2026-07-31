# The wave plan — finishing the Gradius stage-1 port
status: DONE
wave: 0   role: plan   started: 2026-07-31

This file is the spine of the loop. Every implementer, reviewer, QA and test
agent re-reads it. It was written from the five recon worklogs in this
directory (`00-recon-enemies.md`, `00-recon-weapons.md`, `00-recon-sound.md`,
`00-recon-flow.md`, `00-recon-terrain.md`) and from a re-run of the gate at
planning time:

```
node --test games/gradius/tests/        45 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs   GREEN -- 5 passed, 0 failed, 0 SKIPPED
  16 scenarios, 3341 of 4184 frames compared
  (6 truncated at the death: right-wall@493, diag-rd-lu@533, diag-ru-ld@445,
   lr-both@482, speed6-right@515, speed3-diag@529), 0 failures
  [STILL BROKEN] terrain-streams-at-double-rate: 47 field/scenario pairs
```

That is the starting point: one known divergence, 20% of the corpus thrown
away at the death, and five recons' worth of measured behaviour not yet in the
port.

## What the port has today

`games/gradius/src/`: player physics + input + camera + Option rings (bit-exact
over 3341 frames), a terrain streamer (with the known double-rate deviation), a
VRAM queue model, OAM/display-list, a pixel-exact renderer, and an NMI frame
skeleton that models mode-5 play at `$1B = $80` only. It has NO: HUD producers,
enemies, weapons, collision-that-kills, death/respawn, stage intro, pause,
sound. `probeCollision()` exists in `src/terrain.js` and is called by nothing.

## The rules every wave inherits

- One implementer writes to `src/` per wave, sized for one agent in one sitting.
- Every wave ends with `node --test games/gradius/tests/` green AND
  `node games/gradius/tools/test-all.mjs` GREEN with **0 SKIPPED**, and must
  not regress the 16 existing scenarios or the pixel-exact renderer.
- Every check written for a wave must be **seen red** (break the thing, watch
  it fail, restore). A deliberate break that passes is a finding: write it down.
- If you port something, fix its note/comment **in the same commit** (rule 6).
- Nothing ROM-derived is committed. New data extractions (HUD packets, enemy
  tables) go under `assets/` (gitignored) via `tools/export_assets.py`, with a
  `verify_assets.py` check, exactly like `assets/terrain/stages.json`. Do not
  weaken the `build-dist.mjs` guard.
- New per-object loops must settle their work-budget behaviour **in the wave
  that introduces them** (docs/knowledge/06). Every loop in this plan is
  fixed-shape on the cartridge — measured: enemy update = exactly 10
  iterations/frame (26630 over 2663 frames), shot loop = 6, missile loop = 3,
  shot-vs-enemy sweep = 9x10. Each wave asserts its loop's iteration count and
  records that mechanism (C) is answered NO for it.

## The ordering argument (read this before arguing with the order)

**Why not death first?** The six truncated scenarios die at f445-f533 by
running into the **fan enemies** (`$C1D6` fired once at f493 on `right-wall`,
route = the player-vs-object sweep, not terrain — terrain recon measured pages
0-3 contain zero solid tiles, so nothing else is there to hit). A death path
without enemies can never fire in a compared window, so porting it first buys
nothing and cannot be verified against the cartridge except by poke. Enemies
must exist first; then death+respawn un-truncates all 843 frames at once.
That is why the coverage payoff sits at wave 5, not wave 1.

**Why HUD before everything?** The only recorded divergence
(`terrain-streams-at-double-rate`) has two separate causes measured by the
terrain recon: the missing one-byte `$8641` terminator (w_000E off by one from
frame 401, the FIRST compared frame) and the missing `$8898` HUD tick (the
whole alternation — the cartridge with a starved queue becomes the port,
blocks emitted identical at 140 either way). Retiring a known divergence is
worth more than any new feature, everything later touches the queue, and the
HUD producers are needed again by the respawn intro in wave 5. Wave 1 lands
the one-liners so wave 2 is judged on the alternation alone.

**Why flow structure (wave 4) between enemies and death?** `$1B = $A0` (dying),
the `$4C` countdown, and respawn are arms of the `$96A5` ladder, and respawn IS
the stage intro (`$97DD` jumps into `$9B3E` same-frame). The ladder and the
intro machine have to exist before the death wave can compare through f493-f640.

**Why weapons after death?** Any A-held scenario kills fan enemies on the
cartridge within the window (enemy recon: 50 kills in 3000 frames), a shot
that connects frees its slot early and changes the fire cadence
(cadence = lifetime + $35, timers frozen while the slot is occupied), and each
kill adds score, which the HUD row-29 digits render. So weapon scenarios are
only comparable once shots can hit, enemies can die, and score can advance —
i.e. the kill chain lands WITH the weapons (wave 6), on top of waves 3 and 5.

**Why sound last?** The sound recon proved by RAM taps that the driver reads
nothing but its own four structs, `$15`, and the stack — it is the one
subsystem nothing else waits on, and nothing in it waits on gameplay. Its only
coupling is the lag rule (a dropped frame drops a music tick), which needs the
frame loop only.

---

## Wave 1 — Set the record straight: model corrections and queue plumbing

**Goal:** every line of `src/` and NOTES that the recons proved wrong is fixed,
and the cheap half of the knownFail is closed, so wave 2 is judged against a
correct baseline.

Tasks, all one-to-few-liners, all measured by recon:

1. `src/state.js` + `src/nmi.js`: `$15`/`$5B` gate `advanceCamera()`
   (`$9AA0 JSR $98EE`), NOT the sprite-0 split. `bandB.ran` becomes the real
   condition: `$1E != 0 && $1F != 0 && $0D == 0` (+ `$1B` bit 7, `$9A88`).
   ROM bytes `$9A94-$9AA3` are quoted in `00-recon-flow.md` §8. Fix both
   comments in the same commit.
2. `src/nmi.js` `$80B0` position: port `$8641` — append ONE `$00` byte (the
   queue's mode-0 terminator) every non-lag frame, and fix the comment that
   calls it "HUD packets". Make porttrace's `$0E` accounting include it.
3. `src/terrain.js`: the streamer gate counts BYTES (`$0E`, `$9D87 CMP #$04`),
   not packets — replace `queue.length >= 4` with the byte sum
   `porttrace.mjs:198` already computes.
4. `src/nmi.js`: add the `$5B` gate (`$9ACA LDA $5B / BNE`) around the
   streamBlock call. ($5B is 0 on every measured frame; this is future-proofing
   with zero behaviour change today — say so in the comment.)
5. `src/terrain.js`: materialise `$57` — `= 0` at the `$9D8E` position,
   `+= 1` at `$9DAF` — replacing the seeded-and-frozen `state.build.ahead`.
   And fix the `$9DA1 BMI` mistranslation: the ROM BUILDS when the 16-bit lead
   is negative; the port's unsigned `lead >= 0x0180` refuses. Compare signed.
6. `NOTES-player.md` §2/§9: `$44` = 0 normal / **1 LASER / 2 DOUBLE** (currently
   inverted); slot B is skipped when `$44 != 2` (currently backwards); `$A1A4`
   is three interleaved 2-entry tables; the "90 frames → 3 spawns" figure is 5.
   Cite `00-recon-weapons.md`.
7. `scenarios.json`: add `0000, 0019, 0020, 0024, 004C` to `watch`
   (`001B`, `000D` are already watched) and re-record with `scen.py`. All are
   constants in the current window; they become live in waves 4-5.
8. Update the `terrain-streams-at-double-rate` annotation text to record the
   two-cause split and that only the `$8898` cause remains.

**Done when:** gate GREEN, 0 SKIPPED; the `[STILL BROKEN]` report no longer
contains any `w_000E@401`-shaped first-frame divergence (the constant +1 is
gone; the odd-frame HUD-byte divergence remains and the annotation names
`$8898` as the sole remaining cause); all 16 scenarios still 3341/3341 compared
frames, 0 failures.

**Test focus:** each fix must be seen red — e.g. revert the `$8641` append and
watch w_000E@401 come back; feed the signed-lead test a negative lead and watch
the old code refuse where the new code builds (unit test with the five lead
values 0, $00FF, $0100, $017F, and one negative).

## Wave 2 — The HUD: canned packets + the $8898 rotation. Retire the knownFail.

**Goal:** the port's queue carries the same bytes as the cartridge's; the only
recorded divergence is gone; nametable rows 28-29 rejoin the comparison.

Tasks:

1. Extend `tools/export_assets.py` to emit `assets/hud/packets.json` from the
   39-entry pointer table at `$864E` (pointer + raw stream bytes per index).
   ROM-derived → gitignored; add a `verify_assets.py` check. `queue.py`'s
   decoder already matches the cartridge on all 10 stage-1 packets — use it as
   the reference.
2. New `src/hudpackets.js`: `$85E8` (the 5-instruction prologue that appends
   mode byte `$01` and FALLS THROUGH — label it a prologue; `$85F1` is a JSR
   operand, not a routine) + `$85F3` (copy until `$FF` = end leaving the run
   OPEN, `$FE` = append `$FF` and end, `$FD` = two packets from one index) +
   the index-bit-7 blanker + `$863D`/`$8641`/`$8645`/`$8647`/`$864B` append
   primitives. Unit-test byte-for-byte against the measured queue images in
   `00-recon-terrain.md` §2 (f572 = 8 bytes, f574 = 14, f576 = 39, f578 = 14).
3. New `src/hud.js`: `$8898` — the `$0E < 4` gate, the `$02 & 1` parity
   (odd frames only, measured 195/195), `$48 = ($48+1) & 3`, and the four
   producers `st_88B6` (lives, patches the queue in place; 0 lives writes
   nothing; tens digit suppressed at 3 lives), `st_88F6` (top score),
   `st_89E3` + `$8A30` (power bar as ONE open run + the cursor patch
   `$0700[$0E-(8-$42)] = $55`; the `$0100 >= 2` early-exit emits ZERO bytes),
   `st_892C` (score). Call from the `$9AC7` position, BEFORE the streamer.
4. Seed the inputs the producers read (`$07E0-$07EA` BCD scores, `$18`,
   `$20,X`, `$42`, `$46`) from the cartridge seed. This is honest for the
   current corpus because nothing in it scores — write that in the code; wave 6
   replaces the seed with a real score adder.
5. Add `$48` to `state.js` and `0048` to the watch list; re-record.
6. **Remove the `terrain-streams-at-double-rate` entry from `scenarios.json` in
   the same commit** — the runner is designed to fail on an unexpected PASS.
7. Re-enable nametable rows 28 and 29 in the renderer/nametable comparison
   (currently printed as `differing rows [["nt0:row28",24],["nt0:row29",20]]`)
   and fix what they expose.

**Done when:** `test-all.mjs` GREEN, 0 SKIPPED, **zero knownFail annotations**
(the `[STILL BROKEN]` line is gone); `w_000E/w_0054/w_0055/w_0057/w_0058`
compared clean on all 16 scenarios; `node --test` passes with rows 28-29
included in the nametable comparison.

**Test focus:** shift the packet table pointer by one entry and watch the
byte-for-byte packet test go red (the recon's length-only check went red on
only 4/10 — the byte comparison must be strictly stronger); flip the parity
gate to even frames and watch w_0057/w_0058 diverge at f571/572.

## Wave 3 — Enemies exist: pool substrate, spawn engine, update loop, the fan

**Goal:** the first ~1400 frames of stage 1's enemy waves are bit-exact:
squadrons spawn on the measured scroll triggers, fly the fan pattern, and
despawn — nothing dies yet.

Tasks:

1. Object-pool substrate in `state.js`: the 32-slot parallel arrays exactly as
   `$A527` clears them (the 21 arrays at slot base +$0C, PLUS the two
   j-indexed arrays `$0460+j` and `$0496+j` — `$0460,Y` (j) and `$0460,X`
   (j+12) are DIFFERENT bytes and a port that merges them is wrong). Slot map:
   0 player, 1-2 Options, 3-5 shot A, 6-8 shot B, 9-11 missiles, 12-21
   enemies, 22-31 enemy bullets. `clearSlot()` = `$A527`.
2. Spawn engine `$A2C0`: the `$60` state (0/1/2), the
   `$A7D0` → chunk table (`$61 = $3F AND $0E`) → wave-list chain, 2-byte
   records firing at `($61<<8) + trigger*2`, `$FF` terminator, chunk reload on
   the 512-px crossing. Descriptor split cmd `>=$F0` / `>=$80` / `<$80`.
   **The `$A36B`/`$A378` BMIs are ALWAYS taken** (they test the N flag left by
   the loader's final DEY, not the descriptor byte) — write them as
   unconditional jumps WITH the comment saying why, or someone will "fix" them.
3. Formation machine: `$A3E4`/`$A411`, `$A592` (count/spawnX/Y), `$A5BC`
   (delay/dY/style), the `$69/$6C` emitter — members (delay+1) frames apart;
   on allocation failure the member is DROPPED, `$69` still decrements, `$6C`
   is NOT reloaded (it loads at `$A42F`, after success only). All four
   allocators scan DOWNWARD from index 9 (slot 21 first — this fixes OAM
   order/flicker); `$A4A6` uses DEX/BNE and never tests slot 12 — reproduce
   the difference, do not normalise it. Table data (descriptors, `$A592`,
   `$A5BC`, `$ADC1`, `$AE71` scripts) goes through `export_assets.py`.
4. Update loop `$ADAB`/`$ADE5`: exactly 10 iterations, 9 down to 0,
   unconditional; the status-gated animator (skip if 0 or bit 7; reload 6;
   metasprite `$ADC1[status*4 + ($016C & 3)]`, 0 = wrap); dispatch on
   `type AND $7F` into a 42-entry table. Implement handlers 1 (`$AEDD`/`$AEE1`
   generic 0.5 px/frame left drift, free at X<8), 2 (`$AE99` explosion-script
   player, six scripts at `$AE71`), 3, the fall-through chain 2→1→3 AS a
   fall-through, 5 (`$B0AF` the fan, four `$048C` sub-states, homes on player
   Y), the shared 16-bit movers (`$B120-$B184`), and `$B251`'s off-screen box
   [X 4..$F3, Y 8..$C3]. Bit 7 of `$030C` = the initialised flag: first update
   only sets it (one frame motionless + invulnerable). **Every other handler
   and both `>=$F0` spawners: a loud named throw** (`unimplemented enemy type
   N at $XXXX`), never a silent no-op.
5. Work budget: assert 10 slot iterations per frame; note in the code that
   mechanism (C) of docs/knowledge/06 is answered NO for this loop (measured
   26630/2663).
6. New oracle scenario(s): extend the corpus (or `enemyprobe.py`'s JSON as the
   reference side, mirrored by porttrace) to compare, per frame, the occupancy
   mask and per-slot tuples (type/status/metasprite/X/Y) for slots 12-21 over
   at least 1400 frames — long enough to cover all ten stage-1 chunk-0 waves
   AND the chunk switch at scroll `$0200` (cartridge frame 1339). Watch fields
   for the enemy arrays get added and re-recorded.

**Done when:** the enemy-slot comparison runs ≥1400 frames with 0 divergent
frames including the chunk-0→1 switch; the 16 existing scenarios are unchanged
(3341/3341, 0 failures); gate GREEN 0 SKIPPED.

**Test focus:** three deliberate breaks, each seen red: (a) make the
`$A36B`/`$A378` branches conditional on the descriptor byte — must diverge on
the FIRST wave; (b) allocate upward from slot 12 — positions stay right, so
only the per-slot comparison catches it, which is the point; (c) reload `$6C`
on allocation failure — needs the poke that fills all ten slots
(`enemyprobe.py --poke "030C=1@370-420,..."`) mirrored on the port side.

## Wave 4 — Flow structure: the $1B ladder, the stage intro, pause

**Goal:** mode 5 is a real state machine, not a constant `$1B = $80`; the
intro's 5 states and the blank screen exist; pause works. This is the scaffold
the death wave hangs everything on.

Tasks:

1. Port the `$96A5` bitfield ladder (bit4 next-stage, bit5 dying, bit6 game
   over, bit7 play → low-nibble dispatch at `$982F`, none → intro dispatch at
   `$96C5`). `$1B = $80` keeps today's behaviour bit-for-bit; every other arm
   that is not ported in THIS wave throws with the ROM address it would have
   reached (`$96CF`, `$96FB`, `$9A0E`...). The dying arm (`$96EF`: DEC `$4C`,
   at 0 → `$979D`) IS ported here as structure; nothing reaches it until
   wave 5.
2. The intro 5-state machine (`$9B3E $9BED/$9BF0 $9C12 $9C1E $9C24`):
   `$9B3E`'s clear of `$3D-$97` + the page clears + per-player restore
   (`$22→$42`, `$24→$3F` and `$55`, `$26→$19`, `$28→$1A`) + position/ring
   seeding from `$9BCC/$9BD4`; the four canned intro packets (16, 8+`$19`, 7,
   5 — wave 2's emitter); `$9C12`/`$9C1E` (wave 2's producers); `$9C24`'s REAL
   shape — `$0D = 5`, four `$9D8E` calls per frame while `$57 == 0`, exit by
   fall-through into `$9C3C` (`$60 = 1`, `$1B = $80`). Replace
   `preloadTerrain()`'s 4000-iteration exhaustion loop with this and fix its
   "NEITHER has been measured" comment in the same commit. The `$882C`
   full-screen RLE load is NOT ported (see exclusions) — reproduce only its
   RAM side effects (`$0E`, `$0D = 6`, `$12/$13/$1F` zeroing) and leave the
   nametable image to the existing preload, with a comment naming the gap.
3. `$0D` as a real PPUMASK behaviour in `src/nmi.js` (the `$808E-$8094` arm:
   PPUMASK forced 0 while `$0D` counts; screen blank for the whole intro and
   4 frames after; split first reachable when `$0D` hits 0 — cartridge frame
   314, always scanline 207).
4. Pause: `$9ADA` (START edge toggles `$15` when `$1B` is `$80-$8F`, blocked
   by `$09`/`$16`/`$0D`) + `$9650`'s first branch jumping the whole update to
   `$9A8C`. Wave 1 already made `$15` freeze the camera correctly.
5. Cartridge-side references already exist: `flowprobe.py` recorded the boot
   intro (f282-f314: `$1B` 0,1,2,3,4×22,$80; `$0D` 6,3,3,3,5×23,4,3,2,1,0;
   `$57` 0→1 at f308) and a respawn intro (f614-f640, 26 frames — the exit is
   data-dependent, NOT a fixed 28). The port side drives its intro machine
   from a seeded mode-4-entry state and compares those sequences per frame.

**Done when:** a new intro comparison (port intro trace vs `flowprobe.py`'s
recorded boot AND respawn sequences: `$1B`, `$0D`, `$0E`, `$57`, camera, per
frame) is green on both windows; a pause scenario (START at f450, START at
f500) matches the cartridge's `$15`/camera-freeze/resume behaviour per frame;
all unported ladder arms throw with ROM addresses; 16 scenarios unchanged;
gate GREEN 0 SKIPPED.

**Test focus:** make the intro exit a fixed 28-frame counter instead of the
`$57` loop and watch the respawn window (26 frames) go red — that is the
difference between the two measured intros and the reason the loop shape
matters.

## Wave 5 — Death, respawn, checkpoint: un-truncate the corpus

**Goal:** the port can die, explode, respawn at the checkpoint with its
power-ups wiped — and the 6 truncated scenarios compare to their full length.
This is the single biggest coverage gain available: +843 frames (20%).

Tasks:

1. FIRST, measurement, not porting: the player-vs-object sweep inside `$C0C7`
   (the arm at `$C1AF` region: class 1/type 6 = capsule pickup, `$C1B8` shield
   test, `$C1D6` death; routes `$C1BF/$C24B/$C290/$C2C1`) is the least-mapped
   code on the critical path. The flow recon proved `$C1D6` fires once at f493
   on `right-wall`; WHICH route and with what boxes must be measured with the
   existing harnesses (`kill.py`, `enemyprobe.py` + an arghook) before a line
   is written. Record it in this wave's worklog.
2. Port: the sweep that kills the player on enemy contact (with the measured
   boxes), `$C1D6` (`$4C=$78`, `$0100=2`, `$0140=$0160=0`, `$1B=$A0`, and the
   `$60=0` arm for `$1B >= $81`), the `$C0C7` explosion walk over `$C0FA`
   (metasprites $2D/$2E/$2F/$30 at f494/504/514/524, clear at 544), the
   `$96EF` 120-frame countdown, `$979D` (DEC lives; `$22,X = ($42?1:0)`;
   `$26,X = $19`; **`$24,X = min($3F & $0E, 8)`** — five checkpoints/stage;
   `$28,X = $1A`), `$97DD` → same-frame `$9B3E` (wave 4's intro — the wipe of
   `$3D-$97` loses ALL power-ups; `$35` restored to $14; `$42` from `$22,X`).
   Game over (`$97F1`/`$96FB`) stays a named throw — `$B0` is uncharacterised
   (see exclusions).
3. Wire terrain death: `$C2A5`'s stage gates, `$C2B5`'s `$0100 < 2` gate,
   `$C2BC → $C3A3 → probeCollision → $C2C1 → $C1D6`. `probeCollision` exists
   and is unit-tested; this makes game code call it.
4. Lift `compare.mjs`'s `$0100 != 1` truncation and re-record the corpus to
   full scenario length. The respawn windows (f614-f640 etc.) compare through
   wave 4's intro machinery; the death windows compare `$1B/$4C/$0100/$0120`
   and the frozen weapon state.
5. A poke-driven terrain-death scenario mirroring `kill.py` (poke one solid
   cell at the cell `$C3D3` computes → death next frame; the one-row-lower
   miss control does not). This needs a symmetric poke channel in
   `scen.py`/`porttrace.mjs` — build it here; waves 6-7 reuse it.

**Done when:** `test-all.mjs` reports **16 scenarios, 4184 of 4184 frames
compared (0 truncated), 0 failures**, GREEN 0 SKIPPED; the kill.py-mirror
scenario is green and its miss control is green (and was seen red by moving
the poked cell one row).

**Test focus:** the checkpoint formula by intervention (poke `$3F` = 3, 7, 20
before the death → `$24` = 2, 6, 4 — the recon's own table, replayed on both
sides); break the `$3D-$97` wipe (preserve `$45`) and watch the respawn frames
diverge.

## Wave 6 — Weapons and the kill chain: firing, shots, missiles, enemy death

**Goal:** hold A and the port fires, hits, kills, scores, and drops capsules
exactly like the cartridge.

Tasks:

1. Firing block `$A0E9-$A16D`: the three parameter tables
   (`$A0E0/$A0E3/$A0E6`), A-edge/held latches, the X = `$45` down to 0 loop
   (Options fire same frame, own X, own timer pairs), the exact timer
   semantics — **frozen while the slot is occupied** (cadence = lifetime +
   `$35`, measured 21/23 alternation), slot B evaluated same-frame ONLY when
   `$44 == 2`, the cross-reload of the other slot's timer when `$44 != 2`,
   slot B's fall-through DEC (reads `$35-1` on its spawn frame), missile gate
   on `$41` + A HELD + slot free, no timer. Every shot spawn plays sfx `$99`
   (a request into wave 8's stub — record the request, no audio yet); the
   missile spawn plays nothing.
2. Shot movement `$A1E6` (objects 3-8; subtypes 0/2 die at X≥$F8, subtype 1 at
   ≥$F0) and missile movement `$A16F` (fly path only; terrain probe per frame;
   crawl branch = loud throw — unexercised on the cartridge, do not port a
   reading; the born-dead-at-the-floor silent respawn case). Both loops run
   while the player is dead (`$9FFC` jumps into them at `$0100 >= 2`).
3. The kill chain: `$BFE2`'s 9x10 sweep with the `$BFCE/$BFD2/$BFD6` shot
   boxes (laser $30 wide) and `$BFDE[$0460+j]` heights; `$C055` — bit-7
   spawn-frame invulnerability, laser (`$0163 == 1`) survives the hit,
   armoured branch (`$010C` bit 7) = loud throw (never exercised); `$BE93` —
   sound id recorded, squadron counter `$0048+g` (seeded at `$A400` for ≥4
   members, alternating group id via `$49`, DEC on kill, **underflows to 255**
   — reproduce it), explosion-script selector, type := 2 / status := 0; the
   capsule promotion in `$AE99`/`$AEC1` (status 6, status 7 every 16th via
   `$47`) — handlers 1/2 exist from wave 3.
4. The BCD score adder (`$845B`/`$8474`, 3 bytes at `$07E4 + 4*$18`) so kills
   score and the wave-2 HUD seed becomes computed. Remove the seed note.
5. Work budget: assert the fixed loop shapes (6 shots, 3 missiles, 9x10
   sweep); mechanism (C) answered NO, in-wave.
6. Scenarios: autofire holds at `$44` = 0, 1, 2 (via the wave-5 poke channel,
   mirroring `weapons.py --poke 44=N@390-459`), comparing per frame the
   object 3-11 tuples (type/subtype/X/Y/timers), the enemy slots, and the
   score bytes. Add the score/weapon fields to the watch list; re-record.

**Done when:** the autofire scenarios (≥300 frames each at `$44` = 0, 1, 2,
shots connecting with real enemies in-window) compare 0 divergent frames
including kill frames and a capsule drop; 16 + wave-3/5 scenarios unchanged;
gate GREEN 0 SKIPPED.

**Test focus:** the negative control from the weapons recon — replace the
frozen-timer rule with a fixed 21-frame cadence and watch the comparison go
red at the first early shot death; break the laser-survives rule and watch a
`$44=1` kill frame diverge.

## Wave 7 — The power-up loop closed: capsule pickup, the meter, the shield

**Goal:** touching a capsule moves the meter, B applies it, the bar redraws,
the shield absorbs five hits — the full loop a player sees.

Tasks:

1. `$894B` pickup (INC `$42`, wrap at 7 → 1 with the `$CE89` score-digit
   bonus: `($07E5 & $0F) == 0` → `$35 = 4` rapid fire, `== 5` → score bonus —
   semantically surprising, measured both ways, port it as-is with the recon
   citation), +$0050 score, reached from the collision arm for class 1/type 6
   (wave 5's sweep).
2. `$8974` apply: status exactly 1, **B HELD not edge** (holding B consumes on
   the touch frame — pickup at `$9A70` precedes apply at `$9A73` in-frame),
   the six `$8989` arms with their already-owned refusals that KEEP the
   capsule (SPEED UP has no cap — reproduce), `$45` capped at 2 by the arm
   only.
3. Shield `$46` = 5 hits, consumed one per collision at `$C1C1`, sixth hit
   dies via wave 5's `$C1D6`; destroy-what-you-hit; the `$9E = 3` last-hit
   flash flag for the renderer.
4. `$9C45`'s rank `$17 = ($44!=0) + $45 + ($46!=0) + ($19!=0)` — port the
   computation now (its consumer `$BBE5` changes enemy behaviour at `$17 >=
   3`; if the consumer is not yet ported, the computed `$17` must still match
   the watched byte so powered-up scenarios do not silently diverge — add
   `0017` to watch).
5. HUD bar owned-forms (`$89E3` string `$19` substitution) and the `$8A30`
   cursor patch — wave 2 built the machinery; this wires the state.
6. Scenarios: a natural-pickup scenario (the cartridge collects at a measured
   frame; B held → same-frame consume) and a poked `$42` sweep (1-6, one B tap
   each — the recon's own six-row table) compared per frame; a shield scenario
   (poke `$46 = 5`, fly into enemies, count 5 absorptions then death).

**Done when:** the pickup, sweep, and shield scenarios compare 0 divergent
frames; the death-wipe interaction (rapid-fire `$35 = 4` lost on death, `$42`
restored from `$22,X`) is covered by a scenario that picks up then dies; gate
GREEN 0 SKIPPED.

**Test focus:** change B from held to edge and watch the touch-frame consume
diverge; give an owned arm consume-on-refuse semantics and watch the sweep go
red; both squadron-capsule scenarios must include a SECOND squadron so the
`$47` every-16th counter and the `$49` group alternation are live state, not
constants.

## Wave 8 — Sound: the $ED02 driver, state-exact first

**Goal:** the port runs the real sequencer — requests, priority rejection,
music phase — verified per frame against the cartridge. Register/audio output
is the stretch, state-exactness is the bar.

Tasks:

1. Data via `export_assets.py`: the 63-record table at `$EFCD`, the pitch
   table at `$EFB8` (12 big-endian periods), the channel bases
   [$B0,$C1,$D2,$E3], the sequence streams. Build-time assertion that record
   0 is absent and the pitch table's last entry aliases record 0's bytes, so
   nobody "fixes" the overlap.
2. `$EC1E` request entry: index = low 6 bits, channelCount = high 2 bits + 1,
   consecutive records, **priority: accept iff index >= channel owner** (73 of
   83 shot SFX rejected in the measured stage-1 window — the silence is
   correct), stream[0]==0 STOP records, the silencing writes, assert on a
   request with low 6 bits 0. Wire the callers: `$839B` set-BGM de-dupe on
   `$1C`, `$83AB` stop-all, and the request sites waves 5-7 recorded.
3. The frame loop `$ED02`/`$ED46` (four 17-byte structs, DEC duration, free on
   `$FF`), control commands `$FD` (return address in the SHARED global
   `$DD/$DE` — one slot for all four channels, reproduce, do not give each
   channel its own), `$FE` (cnt = TOTAL passes), `$FF`, chained within one
   tick.
4. Dialect B (music: `$Dn vv [dd]` with the triangle's missing dd, `$En`,
   note NNNNdddd, **duration = base*(dddd+1)** — repeated add, not shift) and
   dialect A (SFX: `$2n/$11/$10/$F8`, raw 11-bit period, `AND #$07` mask,
   triangle skips `$10/$11`), the `$EE35` release ramp, the `$EF62` period
   write with the `$07,X` retrigger guard. Implement the `$EF56` octave-shift
   loop LITERALLY (Y wraps through 256 for octave > 4 — the recon could not
   close whether real data hits it; the literal loop is correct either way).
5. Pause (`$15` INC-back freeze except the `$3B` channel; `$9AE2`/`$9B21`
   struct save/restore) and the `$F0` fade epilogue (poke-driven test — no
   scripted run reaches it).
6. The lag rule: on a dropped frame the driver does not tick
   (`driverCalls == nmiEntries - lagFrames`, measured). Add the
   audio-advanced signal as its own compared field per docs/knowledge/06.
7. `snddata.py --selfcheck` (index `$13` decodes to 512 ticks; already seen
   red both ways) joins the gate.

**Done when:** a per-frame comparison of the four owner bytes
(`$B2/$C3/$D4/$E5`) and four duration counters (`$B0/$C1/$D2/$E3`) against
`soundprobe.py`'s JSON over a boot+play+pause script shows 0 divergent frames
(this window includes the 513-frame pulse-1 ownership and the priority
rejections); `--selfcheck` runs in the gate; gate GREEN 0 SKIPPED.

**Test focus:** break `base*(exp+1)` to `base<<exp` — the ownership window
moves from 513 to 769 frames and the comparison goes red (the recon's own
falsified check, now guarding the port); drop the priority test and watch the
owner bytes diverge on the first autofire frame.

---

## Deliberately excluded from these eight waves

Written down so nobody mistakes silence for coverage:

- **Cold boot, the mode machine, title, attract, mode 6.** The corpus stays
  aligned at frame 400 (wave 4's intro comparison is driven from a seeded
  mode-4-entry state, not a cold boot). Lowering `align` toward 282 and
  porting `$80BE`/`$83E4`/modes 0-3 is the flow recon's rated-high-risk unit
  and depends on the `$882C`/`$8871` loader.
- **The `$8871` full-screen RLE loader.** Its 2304-byte write pattern and the
  open question of what 2304 bytes starting at `$2000` means for mirroring are
  unresolved. Wave 4 reproduces only its RAM side effects.
- **Game over / continue.** `$96FB` gates both the timeout and START on `$B0`
  (a sound-driver byte, measured 277 frames of non-zero, uncharacterised).
  Revisit after wave 8, when `$B0` is the port's own state.
- **Enemy bullets (slots 22-31), the armoured branch, the type-`$9A` hit
  counter, the single-spawn path `$A3B1`, the two `>=$F0` spawners.** All
  listing-only — no run has exercised them. They are loud throws. A recon
  follow-up (drive the cartridge past scroll `$0200`/into stage 2 with
  `enemyprobe.py`) is the prerequisite, not a port.
- **The missile crawl path** (terrain probe returned 0 on all 916 calls) —
  loud throw until a scenario makes the cartridge do it.
- **The end of stage 1** (`$3F >= $0C` ≈ 6100 frames of scrolling), play
  sub-states `$81-$8F`, the boss, and any scenario past world x = 1024 (where
  solid terrain starts). These need savestate support in the scenario runner
  (replaying 2000+ frames from boot per scenario is not viable — the oracle
  README already says so). That is real infrastructure, deliberately not
  crammed into a wave here; the poke-driven death scenario (wave 5) covers
  terrain collision meaningfully in the meantime.
- **Two-player, the Konami code, stages 2-7, PAL.**

## Risks

1. **The symmetric poke channel** (`scen.py` + `porttrace.mjs`) is
   infrastructure waves 5, 6 and 7 all lean on and it does not exist yet. It
   is scoped into wave 5; if it turns out ugly, the fallback is standalone
   mirror harnesses per wave (`kill.py`/`weapons.py` shape), which is more
   code but the same evidence.
2. **The player-vs-enemy sweep is the least-mapped code on the plan's critical
   path.** Wave 5 budgets measurement time for it explicitly. If it turns out
   large (multi-class dispatch), wave 5 may need to land death-by-poke first
   and enemy-contact death in a follow-up commit inside the same wave.
3. **Wave 6 is the widest wave** (firing + movement + sweep + death + score).
   The pre-agreed split point if it overruns: land firing+movement with
   scenarios whose compared windows END before the first shot-enemy contact
   (measure the contact frame first), and move the kill chain to a 6b. Do NOT
   land the kill chain without the score adder — the HUD renders the score.
4. **The respawn window comparison** (wave 5) depends on wave 4's intro
   reproducing every watched field the cartridge rebuilds (`$0E`, `$0D`,
   `$57`, camera, rings). The `$882C` exclusion is the most likely place this
   bites; if it does, the exclusion is revisited, not fudged.
5. **`$17` couples power-ups to enemy behaviour** (`$BBE5` at `$17 >= 3`).
   Wave 7's scenarios can push `$17` to 3+; if the consumer is unported the
   ENEMY fields may diverge in a way that looks like a wave-3 bug. Wave 7
   must check `$BBE5`'s effect on the cartridge before shipping scenarios
   that cross the threshold.
6. **Stale-doc debt is the repo's recurring failure.** Waves 1, 2, 4 and 6
   each retire specific named comments in the same commit as the code. Review
   passes should grep for the retired claims.
7. **Sound's octave-loop open question** (index `$24`, possible ~5000-cycle
   note) is unresolved on the cartridge side. The port implements the literal
   loop so it is correct either way; the perf question only matters for a
   port, which has no cycle budget. Recorded, not blocking.
8. **The corpus is still shallow** even at 4184/4184: no solid terrain in any
   compared window, no enemy bullets, nothing past camera x ≈ 143. The plan
   raises coverage where it is cheap (death, weapons, capsules) and names the
   savestate work as the gate to the rest. Do not let 0-failure runs be read
   as "stage 1 done" — docs/knowledge/03, shape 1.
