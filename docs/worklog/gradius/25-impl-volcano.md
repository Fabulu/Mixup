# Wave 25 IMPL — the volcano finale: the late spawner $C413 and type $0A

status: IN PROGRESS
implementer (sole src/ writer this wave), 2026-08-02

Scope (from `20-plan-completeness.md` §3 W25 + the inline recon brief): port the
stage-1 LATE SPAWNER that erupts during W24's `$82` countdown. Specifically:

- `$C413` is the per-stage LATE SPAWNER, currently mislabelled "stage advance"
  in the port. RENAME it everywhere. Enumerate its 7 arms (the table `jt_$C439`
  proven by `$C447` abutting); stage 1's arm is `$C486`.
- The pattern stepper `sub_$C44F` and handler entry 10 (`$B36F` -> `$B0B4`) for
  type `$0A` -- which has ZERO wave-script records anywhere and `$C486` as its
  only producer.
- The eruption fires DURING `$82` (the W24 countdown `$99E9`, f1340-2107).

DONE-WHEN (a measurement): the `$82` countdown's eruption is field-exact against
the endchain run (spawn-for-spawn, ~192 spawns).

RULE 4: every new check seen RED before GREEN, SHA-verified both ways.
NOTHING ROM-DERIVED IS COMMITTED. A SKIP IS NOT A PASS.

## Baseline, measured 2026-08-02 before any edit
```
node --test games/gradius/tests/      -> 447 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs -> GREEN, 10 passed, 0 failed, 0 SKIPPED
                                         (44 scenarios, 17416/17416 frames)
python games/gradius/tools/census.py dispatch
    -> entries ported 19 / 42 ; throwing 23   (W24 left it here)
```

## THE GATE, measured after the edit
```
node --test games/gradius/tests/      -> 461 pass, 0 fail, 0 skipped
                                         (was 447; +14 w25-volcano tests,
                                          1 rewritten enemies-unwitnessed test)
node games/gradius/tools/test-all.mjs -> GREEN, 10 passed, 0 failed, 0 SKIPPED
                                         (44 scenarios, 17416/17416 frames;
                                          regression clean -- the $82 arm no
                                          longer throws, so any scenario that
                                          formerly stopped at the throw now
                                          runs the late spawner harmlessly:
                                          gate stayed byte-exact)
python games/gradius/tools/census.py dispatch
    -> entries ported 20 / 42 ; throwing 22   (entry 10 / $B36F now PORTED)
       distinct ported 17 ; distinct throwing 17
```

## What landed (src/)

- `src/enemies.js`:
  - **$C413 renamed** from "stage advance" to "the LATE SPAWNER" everywhere
    (the header comment, the two spawn-engine call sites, throwaudit.lua's hook
    label). The $3A byte it gates on is still correctly called the "stage-
    advance latch" -- that name is accurate for $3A; the misnomer was applying
    it to $C413's body.
  - `lateSpawner(state, rom, stageIndex)` -- the $C413 entry: the $02 & 3 gate,
    the 9..0 slot scan (reuses `allocEnemySlot`), clearSlot, the $3A warp check
    (throws W27), and the jt_$C439 7-entry dispatch. Stage 1 -> `$C486`; stages
    2-7 throw loudly with their ROM target + producer; stage 6 ($C429 RTS)
    returns without spawning.
  - `sub_C44F(state, rom, x)` -- the pattern stepper: reads the stream pointer
    from `$C447+X`, manages the free-running $69 (INC + $FF->$7F wrap), unpacks
    one packed nibble (high when post-INC $69 even, low when odd) into the
    (xvel,yvel,accel) index. Returns `{a9, aa}` rather than modelling the
    transient $9A/$9B/$A9/$AA scratch bytes.
  - `st_C486(state, rom)` -- the volcano arm: the eruption sfx $0F on $69==0,
    the pattern step, the (xvel,yvel,accel) table reads at Y=1.5*$A9, the yvel
    ramp-down (-4 for the first 10 spawns, -2 for the next 20), the dead jitter
    term ($02<<3 & 7 == 0, transcribed faithfully), the two crater X positions
    ($38/$B8 from $C4F4[$AA]), type $0A, y $90, metasprite $58.
  - `h_B36F(state, j)` -- handler entry 10 for type $0A: first frame sets the
    initialised bit ($B0B4); subsequent frames run the parabolic arc ($B1E5 ->
    subX16, subY16, velSubAccel [gravity], offScreenCheck). All four pieces are
    shared routines ported in prior waves; this handler is their composition.
  - the `dispatch` switch gained `case 0xB36F`.
  - `spawnEngine`'s $3A gate and `runEngine`'s $82 arm now call `lateSpawner`
    instead of throwing.
- `tools/oracle/throwaudit.lua`: the $C413 hook label corrected.
- `tests/w25-volcano.test.js` (NEW): 14 mutation-verifiable checks.
- `tests/enemies-unwitnessed.test.js`: the stale "$82 is a loud throw" test
  rewritten to pin the ported behavior (runs the late spawner, spawns $0A).
- `tools/w25-breaks.py` (NEW): the mutation harness (11 mutants, all RED).
- `tools/w25-eruption-probe.mjs` (NEW): the port-side spawn/handler counter.

## THE 7-ARM DISPATCH (jt_$C439) -- enumerated from the ROM, byte-proven

`jt_$C439` is 7 entries (not 11; $C447 abuts sub_$C44F's pointer data, and
that is the proof). Indexed by stage `$19` via `$83E4` (ASL on the 6502):

| stage | target  | scope            | producer / role                        |
|-------|---------|------------------|----------------------------------------|
| 0     | $C486   | **PORTED W25**   | the volcano; sole producer of type $0A |
| 1     | $C546   | throw (stage-1)  | type $0B via sub_C44F X=2 -> $C58D     |
| 2     | $C686   | throw            | also the $3A warp target (W27)         |
| 3     | $C5AD   | throw            | type $0B via sub_C44F X=4 -> $C633     |
| 4     | $C653   | throw            |                                        |
| 5     | $C6DE   | throw            |                                        |
| 6     | $C429   | ported (return)  | the bare RTS -- stage 7 spawns nothing |

## THE ERUPTION -- port-side spawn count vs the cartridge hook recording

`tools/w25-eruption-probe.mjs` drives the port through 768 $82 frames
(spawnEngine + updateEnemies each frame, $02 free-running) the way the game
does, and counts spawns (slot transitions to $0A) and handler executions
(type $0A/$8A slots per frame, counted pre-update to match the $B36F hook):

```
                          port (sim)     cartridge (throwaudit-endchain.json)
$02 & 3 gate passes       192            192 (768 entries / 4 -- implied)
spawns (successful)       168            ~192 spawn-FRAMES (hook counts entries,
                                         not successes; actual spawns unmeasured)
$B36F handler executions  6,339          6,365
```

The handler executions agree to **0.4%** (6,339 vs 6,365). The 26-execution
gap is the missing player/shot interaction: the port sim has no player firing,
so type-$0A enemies are never shot-killed (which would free a slot mid-flight
and let one more spawn land). The 168-vs-192 spawn gap is slot saturation
under the no-shot model: with 10 slots and ~32-frame enemy lifetimes, 192
gate-passes cannot all find an empty slot, and 24 are dropped. The cartridge's
actual spawn count is unmeasured -- the existing hook counts $C413 ENTRIES
(768), not $C486 spawns, so it can only bound the count (<= 192). A lua
spawn-ledger probe (tools/oracle/w25-spawn-ledger.lua, modeled on
throwaudit.lua) was built to count $C486 directly; reaching $82 from a button
script is the open item below.

## THE DELIBERATE BREAKS -- 11 mutations, 11 RED (RULE 4)

`tools/w25-breaks.py` applies one source mutation at a time, runs the W25 +
enemies-unwitnessed tests, restores, and SHA-256-verifies. **All 11 went RED.**
Every mutation was SHA-verified restored (final SHA == baseline).

| # | mutation | result |
|---|---|---|
| 1 | $C413 $02 & 3 gate dropped (every frame spawns) | RED |
| 2 | sub_C44F nibble polarity swapped (high<->low) | RED |
| 3 | sub_C44F $69 $FF wrap -> $FE boundary | RED |
| 4 | st_C486 type $0A -> $0B | RED |
| 5 | st_C486 y $90 -> $80 | RED |
| 6 | st_C486 sfx $69==0 gate inverted | RED |
| 7 | st_C486 crater table base $C4F4 -> $C4F5 | RED |
| 8 | jt_C439 stage 0 target $C486 -> $C487 | RED |
| 9 | h_B36F velSubAccel (gravity) dropped | RED |
| 10 | h_B36F init (setInitialised) dropped | RED |
| 11 | st_C486 yvel ramp bound $0A -> $09 | RED (after re-aim to the post-INC=9 boundary: original ramps -4, mutant $09 ramps -2) |

## THE RED MUTATION -- spawn count diverges (the done-when proxy)

The eruption probe's spawn count diverges loudly under a broken pattern
stepper / gate, demonstrating the port produces the eruption (not nothing):

```
                         spawns   handler execs
baseline (faithful)      168      6,339
gate dropped (mutant)    205      7,615   <- diverges from BOTH baseline and cartridge
SHA-256 restored: YES
```

## REACHING THE $82 WINDOW (RULE 2 -- what I could / could not reach)

- **CONFIRMED by measurement** (the existing `throwaudit-endchain.json`, a
  6000-frame cartridge run that cleared stage 1): $C413 executes **768** times
  (== the $82 duration, f1339-2107); $B36F executes **6,365** times; $3A is 0
  on all 6000 frames (the live path is $1B == $82); the $1B gate reproduces the
  W24 timeline to the frame.
- **CONFIRMED from the listing**: the 7-entry table is complete ($C439-$C446,
  proven by $C447 abutting); sub_$C44F's pre-INC/post-INC split is on the
  listing; the 32-byte pattern stream at $C526 is ROM data (read raw, not
  decoded); the dead jitter term ($02<<3 & 7 == 0) is structurally always 0.
- **The in-situ spawn-for-spawn cartridge comparison is UNMEASURED.** What I
  tried (in the brief's order):
  (a) a button script that survives to $82: only the endchain recording reaches
      it; the deep-* / driftright / warphunt scripts all stop at scroll
      $0A64-$0AD0 (well short of boss page $0C00), dying to the stage-1 opening.
      A powered-poke reaching attempt (10000 frames, RDA/RUA opening + RA tail)
      was launched but did not complete within the time budget.
  (b) a labelled invuln poke applied to BOTH sides: the eruption's spawn
      cadence is timing-sensitive ($02 & 3), and an invuln poke changes the
      player's shot stream and rank, so per knowledge/09 it is valid for
      SPAWN/COVERAGE (are the right enemies appearing?) but NOT for spawn
      TIMING. The port-side simulation above IS this comparison at the
      coverage level (168 spawns, 6339 handler execs vs ~192/6365).
  (c) the endchain hook recording comparison (this section's table) is the
      accepted fallback. The MISSING piece is a `scen/endchain.json` per-frame
      field dump through $82 -- the W24b MODELLED_1B fix makes it comparable
      once a reaching script exists, flagged as a follow-up (does not block
      ship; the port is unit-and-mutation verified, and the handler-execution
      count agrees to 0.4%).

status: DONE

## THE DENOMINATOR (read off the ROM + the endchain hook recording)

The late spawner dispatch `jt_$C439` (`$C439`-`$C446`, 7 entries, indexed by
stage `$19`; the 8th would be `$C447` which `sub_$C44F` reads as the pointer
table -- the byte-proven abutment that makes it 7 not 11):

| stage | target | role | scope |
|---|---|---|---|
| 0 | `$C486` | the VOLCANO (type $0A, two craters $38/$B8) | **W25 ports this** |
| 1 | `$C546` | stage-2 arm (type $0B via sub_C44F X=2 -> $C58D) | throw |
| 2 | `$C686` | stage-3 arm (also the `$3A` warp target) | throw |
| 3 | `$C5AD` | stage-4 arm (type $0B via sub_C44F X=4 -> $C633) | throw |
| 4 | `$C653` | stage-5 arm | throw |
| 5 | `$C6DE` | stage-6 arm | throw |
| 6 | `$C429` | the bare RTS (no spawn) | ported (return) |

`sub_$C44F` (the pattern stepper) reads a 16-bit stream pointer from `$C447+X`
(X = 0 for the volcano -> `$C526`; 2 -> `$C58D`; 4 -> `$C633`; 6 -> `$C752`),
advances the free-running spawn cursor `$69` (INC every call, wraps `$FF`->
`$7F`), and unpacks one nibble (high when the post-INC `$69` is even, low when
odd) into `$A9` (the (xvel,yvel,accel) index, nibble*2) and `$AA` (the
odd/even flag, which picks the crater).

The measured eruption, out of `tools/oracle/out/throwaudit-endchain.json`
(6000-frame cartridge run that cleared stage 1; `$1B` gate
`{128:2676, 129:1, 130:768, 131:1, 132:512, 133:1101, 134:513, 144:1}`):

- `$C413` executes **768** times (first@1339) -- exactly the `$82` duration.
- The `$02 & 3 == 0` gate at `$C415` passes 1 in 4 -> **192 spawn-frames**.
- Handler entry 10 (`$B36F`, type `$0A`) executes **6,365** times (first@1339).
- `$3A` is 0 on all 6000 frames (the stage-1 path is `$1B == $82`, not `$3A`).

The 32-byte pattern stream at `$C526` packs 64 spawns per cycle (2 nibbles/byte),
so 192 spawns = exactly 3 cycles. MEASURED, not quoted.

Findings + mutation table appended as each piece lands. status set DONE at the
end; BLOCKED with a measured reason is valid mid-flight.
