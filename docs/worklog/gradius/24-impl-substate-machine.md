# Wave 24 IMPL — the play sub-state machine (jt_$982F) and the game-over arm

status: DONE
implementer, 2026-08-02

## Ledger deltas (20-plan-completeness.md)

- **play sub-states, jt `$982F`**: 1 ported -> **7 ported** of 16
  (`$80` body + `$9A56` exit, `$81`, `$82`, `$83`, `$84`+despawn, `$85`).
  Still throwing: `$86`/`$9904` (W27), `$87`-`$8A` (intro-shared, 0 hits),
  `$8B`-`$8D` (off path, 0 hits), `$8E`/`$8F`/`$984F` (W27 warp).
- **`$96A5` ladder arms**: 2 ported -> **3 ported** of 5 (intro, dying, +
  `$96FB` game-over). Still throwing: `$96CF` next-stage (W27). The `$96FB`
  continue (`$970D`, mode 4) and timeout-expired restart-to-title (`$9751`,
  mode 0) sub-paths stay throws (modes 0/4 out of scope); the reproduced window
  is the `$B0`-gated hold + the `$4C` countdown.
- **`$97F1`** (lives-negative, the game-over ENTRY, reached from respawn):
  was a throw -> **ported** (`enterGameOver`).
- ROM tables exported: `$9A35` rank countdown (8 bytes) added as
  `stage.rankCountdown`; `$9A3D`/`$98FD` already exported; `$9A45` = literal
  `$81`.
- New state: `zp4D` ($4D), `spawn.z5E` ($5E), `spawn.z62` ($62, write-only).
- Census UNCHANGED: 19/42 dispatch entries (W24 ports the state machine, not
  the `$AE1C` enemy dispatch).

Scope (from `24-plan-substate-machine.md`, READ-ONLY brief; `24-recon-substate-machine.md`):
  - Replace `playArm`'s single `$80` test with the real 16-entry dispatch at
    jt_$982F. Every arm not ported here throws LOUDLY with its ROM target.
  - Port the `$80` exit (`$9A56` -> `$81`), the timer states `$9A0E`/`$99E9`/
    `$99C0`, the boss-page scroll `$9982` (incl. despawn sweep `$994A`),
    `$997E` (INC $5B only; the fall-through is DEAD, do NOT port), and the
    game-over arm `$96FB` (the `$1B & $40` ladder arm).
  - `$86`/`$9904`, `$8B`-`$8D`, `$8E`/`$8F`, `$87`-`$8A`, `$96CF` stay throws
    (W27 / off the stage-1 clear path / already-ported routines).
  - Export the `$9A35` rank-countdown table (8 bytes) and pin it.

Findings written as they are learned. RULE 4: every new check seen RED before
GREEN, SHA-verified both ways.

## Baseline, measured 2026-08-02 before any edit
```
node --test games/gradius/tests/      -> 416 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs -> GREEN, 10 passed, 0 failed, 0 SKIPPED
                                         44 scenarios, 17416/17416 frames
```

## Log

### What landed (src/)
- `src/state.js`: added `zp4D` ($4D, high byte of the $82 countdown pair) and
  `spawn.z5E`/`spawn.z62` ($5E despawn cursor, $62 write-only phase flag).
- `src/sound.js`: added exported `pulse1Dur(state)` = `state.snd[OFF.DUR]` ($B0,
  pulse 1's DUR byte; the $96FD gate).
- `src/flow.js`: ported `$97F1` (game-over entry, was a throw) as
  `enterGameOver()`. `respawn()` now returns `false` on game-over so `dyingArm`
  runs the mode-5 body ($9827 JMP $9A5E). `clearAhead()` now models `$5E := #$3F`
  ($9C0F). `clearZeroPage()` clears `$5E`.
- `src/nmi.js`: replaced `playArm`'s single `$80` test with the real 16-entry
  dispatch (`switch (substate & 0x0F)`); ported `st9A4D` (incl. the `$9A56` exit),
  `st9A0E`, `st99E9`, `st99C0`, `st9982` (+ `sub994A` despawn), `st997E`
  (`INC $5B` only; the dead fall-through is NOT ported, cited to `$9658`), and
  `gameOverArm`/`continueTimeout` (`$96FB`). Replaced the bit-6 ladder throw with
  `gameOverArm`. Every unported arm throws with its ROM target.
- `tools/export_assets.py`: added `stage.rankCountdown` ($9A35, 8 bytes) to
  TABLES and to `expand_stage` (`res.stage.rankCountdown`). Regenerated the
  manifest + stages.json: `rankCountdown = [3,3,4,4,5,5,6,6]`.

### The gate, measured after the edit
```
node --test games/gradius/tests/      -> 445 pass, 0 fail, 0 skipped
                                         (was 416; +28 w24 tests, +1 collision rewrite)
node games/gradius/tools/test-all.mjs -> GREEN, 10 passed, 0 failed, 0 SKIPPED
                                         44 scenarios, 17416/17416 frames (regression clean)
python games/gradius/tools/census.py dispatch
    -> entries ported 19 / 42 ; throwing 23   (UNCHANGED: W24 ports the state
       machine jt_$982F, not the enemy dispatch $AE1C)
```

### THE DELIBERATE BREAKS — 18 mutations, 17 seen RED (RULE 4)
`tools/w24-breaks.py` applies one source mutation at a time (binary mode, so
SHA-256 restores byte-identical), runs the affected test files, restores, and
asserts the SHA matches both ways. **17 of 18 went red; the one survivor is
named below with its reason.** Every mutation was SHA-256-verified restored
(`all files SHA-256 == baseline: True`); final re-run GREEN (68 pass).

| # | mutation | result |
|---|---|---|
| 1 | `$80` exit `$81` -> `$82` | RED (1) |
| 2 | `$81` `$4D` reads `rankCountdown[0]` not `[rank]` | **RED** (after re-aim to rank 2: `$9A35[0]==$9A35[1]==$03`, so rank 1 could not tell; rank 2 = `$04` distinguishes) |
| 3 | `$81` `$4C` not cleared (`=1`) | RED (1) |
| 4 | `$82` 16-bit borrow dropped | RED (1) — the load-bearing half of the countdown |
| 5 | `$82` `$60` not reset | RED (1) |
| 6 | `$82` sfx gate fires on stage 1 not 0 | RED (2) |
| 7 | `$83` `$62 := 1` not 2 | RED (1) |
| 8 | `$84` BEQ polarity inverted | RED (5) |
| 9 | `$84` boss type `$98` -> `$99` | RED (1) |
| 10 | `$84` `$5E` seed `$3F` -> `$3E` | RED (1) |
| 11 | `$994A` guard `$D0` -> `$D1` | **RED** (after re-aim to the `$D0` boundary: `$D0` runs, `$D1` would refuse it — `cam.lo=$E0` passed either way) |
| 12 | `$994A` object-clear bound `$14` -> `$15` | **GREEN — the one survivor** (see below) |
| 13 | `$85` `INC $5B` dropped | RED (1) |
| 14 | `$96FB` `$B0` gate inverted | RED (6) |
| 15 | `$96FB` `$4C` not decremented | RED (1) |
| 16 | `pulse1Dur` reads OWNER not DUR | RED (3) |
| 17 | `$97F1` `$1B := $C1` not `$C0` | RED (1) |
| 18 | `$97F1` `$4C := $77` not `$78` | RED (1) |

**THE SURVIVOR (#12):** `$994A`'s `CPX #$14 / BCS` skips the object clear when
the OLD cursor >= `$14`. On the cartridge `$010C+$14 = $0120` (the anim array
base) -- the guard PROTECTS the player's anim byte. In this port the object
arrays are separate 32-slot arrays, so slot `12+$14 = 32` is OUT OF BOUNDS and
a dropped guard writes nothing observable (the alias does not exist). Changing
`$14` -> `$15` is GREEN for the same reason W22's `$AFD2` restore was: the
guard is a faithful transcription whose mutant is silent here. The collision
columns ARE still cleared at cursor `$14` (test pins that), and the LAST cursor
that clears objects (`$13` -> slot 31) is pinned. The guard stands on the
listing (`$9970 CPX #$14`), not on a test.

### Two re-aims (a check that cannot fail is a decoration)
- **#2 rank->0:** at rank 1 the test was GREEN because `$9A35[0]==$9A35[1]`.
  Re-aimed to rank 2 (`$04` != `$03`): now RED. The rank-1 = 768 fact is pinned
  separately in the rank-indexed test.
- **#11 $D0->$D1:** at `cam.lo=$E0` the test was GREEN (>= both). Re-aimed to
  the boundary `cam.lo=$D0` (>= `$D0`, < `$D1`): now RED.

### What I could NOT reach (RULE 2 — never as an absence claim)

- **The endchain `scen/` field dump + compare scenario (done-when #1, #2, #7).**
  I did not record a `scen/endchain.json` field dump, so the `$1B` timeline is
  NOT machine-compared against the cartridge frame-for-frame here. What I tried:
  the endchain run that clears stage 0 was recorded by `throwaudit.py` as a HOOK
  dump (`throwaudit-endchain.json`, 6000 frames, `$1B` gate
  `{128:2676, 129:1, 130:768, 131:1, 132:512, 133:1101, 134:513, 144:1}`,
  `maxScroll=3584`), reproducing the plan's timeline to the frame -- but that is
  a hook recording, not a per-frame `scen/` field dump, and the boss-killing
  button script that produced it is not a named entry in `scenarios.json` or
  `throwaudit.py`'s RUNS (it was an ad-hoc `--script` run; the long scripts in
  the tree -- deep-survivor/deep-autofire/deep-powered -- reach game-over, not a
  boss kill). Recording the `scen` dump would require (a) re-deriving that
  script and (b) a ~6000-frame Mesen run via `scen.py`, plus the port running
  `$80`->`$84` without throwing for ~2300 frames. The port's sub-state arms are
  instead unit-tested arm-by-arm with mutation-verified transitions (the table
  above); the `$80` body over 3099 frames is regression-covered by `deep-powered`
  (GREEN). What is NOT covered: the SEQUENCE in situ and the despawn sweep's
  frame-by-frame effect on the 1022 compared fields. Stated per rule 2: I could
  not reach the in-situ cartridge comparison, here is what I tried.

- **The `$96FB` survivor scenario (done-when #3).** Same shape: the
  deep-survivor/deep-autofire HOOK recordings prove `$96FB` runs 794 times
  (397+397), but no `scen/` field dump exists for the game-over window. The port
  reproduces the `$B0`-gated hold + `$4C` countdown as unit-tested logic; the
  in-situ field comparison is unmeasured.

- **`$85` field-exactness (W26, by design).** On the frame the boss object is
  created (`$84` advance), `mode5Body`'s enemy update routes type `$98` to the
  boss handler `$B914` (entry 24, W26-unported) and throws. This is the expected
  loud throw; `$85`'s own code is one instruction (`INC $5B`), unit-tested.

- **The `$82` countdown at rank != 1.** The 768-frame duration at rank 1 is
  `$9A35[1] x 256` (table-derived, hook-confirmed via the `$1B` gate). At rank 4
  it would be 1280 frames (`$9A35[4]=$05`), UNVERIFIED dynamically -- no powered
  endchain run exists. Exact at rank 1; other rows ship read-from-ROM.

- **Rank-4 / powered endchain.** No powered run that both reaches the boss page
  AND records the `$82` countdown exists in the tree. The rank-indexed test
  pins the table; the duration at higher rank is table-derived, not measured.


### Two stale tests rewritten (the throws they pinned are now ported)
- `collision.test.js` `$97C1` test: was "lives negative is a loud throw"; now
  pins the ported $97F1 entry ($1B=$C0, $0A cleared, $4C=$78, packet $1C). Plus
  a new test for the demo-path throw ($9805).
- `flow.test.js` `$96A5` ladder test: removed `$96FB` and `$81`/`$8F`-at-`$982A`
  from the unported-throws loop ($96FB is ported; $81 is ported; $8F throws at
  `$984F`). Added `$86`/`$8F` as the still-throwing play representatives.

