# Wave 22 review - the six routines between here and the stage-1 boss

status: DONE
reviewer, 2026-08-02
subject: commit `7088404` "Gradius W22: the six routines the wave data reaches,
and the armour arm nobody had listed"

VERDICT: **SOUND.** No correctness defect found in the ported code. Everything
the implementer reported was re-measured here and reproduced. Five findings, all
minor or informational; one of them is a repo-state hazard that is not W22's
doing but that bit me during this review and will bite the next agent.

---

## What I re-ran (not quoted - executed here, 2026-08-02)

```
node --test games/gradius/tests/        416 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs   GREEN -- 10 passed, 0 failed, 0 SKIPPED
    44 scenarios, 17416 of 17416 frames compared (0 truncated), 0 failures,
    0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
    0 display-list coverage failures, 0 video-coverage failures,
    0 deep-reach failures
    self-check: 7 deliberate neuters all RED
python games/gradius/tools/census.py dispatch
    entries ported 19 / 42 ; throwing 23
    distinct targets 34 ; distinct ported 16 ; distinct throwing 18
python games/gradius/tools/oracle/wavecensus.py
    stage 0: 92 distinct, 92 ported, 0 unported, 100.0%
    ALL     598 distinct, 454 ported, 95 unported, 49 inline5, 75.9%
```

14,098 → 17,416 is exactly 14,098 + 3,099 (`deep-powered`) + 219 (`deep-page4`,
which used to truncate at its `expectThrow` and now compares). Nothing regressed.

## Does a scenario actually cross scroll $0440? - YES, measured from the artifacts

Read out of `tools/oracle/out/scen/*.json` myself, not from the worklog:

* `deep-powered`: compared window frames 2301..5399 (3099), camera **$03E2 →
  $09EF**. First frame with scroll >= $0440 is **2489**. Type `$87` (entry 7)
  first appears at **2490** and holds **2522** slot-frames.
* `deep-page4`: 219 frames, camera **$03E2 → $044F**, type `$87` for 30 frames.
  So the FIRST FAILURE record is inside the strictly-graded window twice.
* All six handlers reproduced off `$030C-$0315` exactly as reported:
  `$87` 2490/2522, `$93` 2498/2640, `$8F` 2778/930, `$89` 2783/1136 (+1 raw `$09`
  at 4111), `$90` 5018/382, `$8C` 5023/433.

## Does the code match the ROM? - spot-checked against rip/prg.asm, instruction by instruction

Read the listing for every address the new code cites: `$B65C`, `$B676`-`$B6A1`,
`$B6A2`-`$B6D1`, `$B6E1`-`$B746`, `$B747`-`$B786`, `$B70B`, `$B723`, `$AF2E`-
`$AF87`, `$AF88`-`$AF97`, `$AF98`-`$B01C`, `$B01D`, `$B311`-`$B36E`, `$B3A2`,
`$B3CB`-`$B401`, `$B31E`-`$B342`, `$B2DB`, `$B103`, `$B164`, `$B17C`, `$B251`,
`$B0B4`, `$CB28`-`$CB4D`, `$C055`-`$C08D`, `$C0B7`, `$8453`-`$846D`, `$A18B`-
`$A1D5`, `$AE1C` (the whole 42-entry table), `$97DD`, `$9B3E`, `$C1B8`-`$C1CD`.

Every branch polarity, every constant, every array base checked. Tables verified
byte-for-byte: `$B6D2` = `3C 37 32 2D 28 28 23`, `$B6D9` = `1C 1C 1F 1F`,
`$B6DD` = `01 03 02 04`, `$B33B` = `5E 5F 60 61 62 61 60 5F`, `$B01D` = `64 46
3C 37 32 2D 28 23 1E`, `$A1A4/6/8` = `02 00 / 00 02 / 80 00`. **No mismatch.**

The `$AE1C` table confirms 7=`$B6E1`, 9=`$B311`, 12=`$B3CB`, 15=`$AF2E`,
16=`$AF88`, 19=`$B747`, and 34 distinct targets - the 19/42 and 16/34 are right.

### The fall-through trap - read past every apparent end myself

Four fall-throughs in this wave, all four handled:

1. `$B6B5 STA $04CC,X` ends at $B6B7 and runs straight into `$B6B8`. Handled
   (`return walkerFrame(...)` from the docked arm).
2. `$B3D5 JMP $B3A2` → `$B3A2/$B3A4` end at $B3A6 and fall into `$B3A7 JMP
   $B0B4`. Handled; entry 9's `$B316` arm correctly does NOT clear `$048C`.
3. `$AF2E BMI $AF43` not taken falls into `$AF33`; `$AF88 BPL $AF33` /
   `$AF96 BNE $AF54` re-enter entry 15 twice. Handled.
4. `$CB28 JSR $EC1E` falls into `$CB2B`. Handled (sound then explodeInPlace).

Near-misses I checked and confirmed are NOT fall-throughs: `$B6EB JMP $B0B4`,
`$B675 RTS`, `$B6D1 RTS`, `$B733/$B746 RTS`, `$B33A RTS`, `$CB4D RTS`,
`$AFD6/$B01C RTS`. Nothing was left on the floor.

### $A19E - PORTED, not throwing

`src/weapons.js` has the crawl arm (`y = 1`, metasprite `$08`) and the throw is
gone. Row 1 of `$A1A4/$A1A6/$A1A8` verified from the listing. It EXECUTES inside
the corpus: metasprite `$08` in `$0129/$012A/$012B` (all three watched) on
**6 frames - 3348, 3359, 3370, 4308, 4319, 4330** - see finding 2, the worklog
says "3348-3350, three frames" and that is wrong in a committed file.

---

## The deliberate breaks I ran (six; each restored and SHA-256 verified)

Baseline: `enemies.js 748db184…`, `collision.js 40fee02b…`, `weapons.js 4efd76c6…`.

| # | mutation | result |
|---|---|---|
| 1 | `enemies.js` `$B687` walk-left `0xFE` → `0xFD` | **RED** - 143 TIER 1 fields, 4845 display-list Y mismatches, 3341 live-slot content mismatches on `deep-powered` |
| 2 | `enemies.js` `$AFB1` spawn gate `< 0xC8` → `< 0xC9` | scenario GREEN, **unit tests RED (3 of 24)** - the boundary is only reachable in a unit test, exactly as the test file's own header claims |
| 3 | `collision.js` `$C07E` `zA8 >= 6` → `>= 7` | **RED** (1 test) |
| 4 | `weapons.js` `$A19E` `y = 1` → `y = 0` | **RED** (2 tests) |
| 5 | `enemies.js` `$B6CB` muzzle `rom.read(0xB6DD + y)` → `+ 0` | **RED** on the scenario (`w_0497…w_049F`) *and* the unit tests |
| 6 | `enemies.js` delete `j = state.spawn.zA8;` in `h_B6E1` | **GREEN everywhere** - see finding 3 |

All three files restored byte-identical (hashes re-checked and equal to baseline).
Working tree == `HEAD` for all twelve W22 files, verified with
`git hash-object` vs `git rev-parse HEAD:<path>`.

---

## Findings

### 1. (moderate, environment) The shared git index does not contain W22 - `git checkout <path>` SILENTLY REVERTS IT

`git ls-files -v games/gradius/tests/w22-handlers.test.js` returns **nothing**;
`git diff HEAD --stat -- games/gradius` reports 18 files as 3,851 pure
deletions, including `w22-handlers.test.js`, `wavecensus.py`, `census.py`,
`tablecoverage.py` and `sweep.py`. All of those exist on disk and are in HEAD.

I hit this live: `git checkout games/gradius/src/enemies.js` restored blob
`808a8535` - the **pre-W22 parent**, not `33f8546` - and wiped the wave's work
from the working tree without a word. I recovered with
`git cat-file -p 33f8546… > src/enemies.js` and re-verified the SHA-256.

The implementer flagged this ("the shared index is polluted with another
workflow's staged deletions - `git status` lies") and committed correctly
through `.git/gradfin.index`. The commit is intact. But the trap is still armed:
**do not use `git checkout -- <path>`, `git restore`, `git stash` or `git add -A`
anywhere in this tree.** Restore from the blob. Whoever owns W23+ should be told
this before they start.

### 2. (minor) A committed number is wrong: the `$A19E` frames are six, not three

`scenarios.json`'s `deep-powered.why` and `22-impl-six-routines.md` both say the
crawl "shows up as metasprite `$08` in `$0129/$012A/$012B` on frames 3348-3350 -
three frames on all three missile slots". Measured off the artifact:

```
frames with metasprite $08 on a missile slot: 6
  3348 [8,8,8]  3359 [8,8,8]  3370 [8,8,8]
  4308 [8,8,8]  4319 [8,8,8]  4330 [8,8,8]
```

Six frames in two bursts, eleven frames apart, not a contiguous 3348-3350 run.
The substance (the arm is exercised and compared) is right; the number is not,
and it is in a file the next agent will read as fact.

### 3. (minor) A fourth and fifth line that cannot be told from its mutant, not in the survivor list

`h_B6E1` and `h_B747` both open with

```js
const o = state.obj; const i = j + ENEMY_BASE;
j = state.spawn.zA8;                   // $B6E1 LDX $A8 -- reloads X
```

`i` is computed from the INCOMING `j`, then `j` is overwritten. Deleting the
reassignment entirely is GREEN on all 416 unit tests and on the scenarios (break
6 above). It is a no-op because `updateSlot(state, rom, sp.zA8)` guarantees
`j === sp.zA8`, so the two spellings can never diverge - which also means that
if they ever COULD, `i` would already be pointing at the wrong slot.

Not a defect: it is a faithful transcription of a redundant `LDX $A8`. But the
worklog names exactly three lines that "no test and no scenario can distinguish
from their mutants" (`$B65C`'s `CMP #$20`, `$B73A`'s `CMP #$07`, `$AFD2`'s
restore) and says they are named "so nobody reads their presence as a covered
fact". These two belong on that list.

I did verify the three named survivors from the listing and all three claims
hold:
* `$B65C` low clamp: the smallest value that can reach `$B66C` is `$00 + $30 =
  $30`, because every player X in `$D1..$FF` carries and `$B662 BCS` has already
  forced `$F0`. The `CMP #$20` branch is dead on the cartridge. Confirmed.
* `$B73A CMP #$07`: `$046C` is written only by `$B6AD INC` (even→odd) and
  `$B734 INC` (odd→even), and `$B723` runs only on odd, so the compared value is
  always even and `#$07 ≡ #$08`. I also checked the one OTHER writer of
  `$046C` - `$C1CA INC $046C,X` - and it is gated by `$C1C3 LDA $010C,Y / BPL`,
  i.e. armoured enemies only, which a walker never is. Confirmed.
* `$AFD2 LDX $AB / STX $A8` on the failure path: `$A8` is written only at
  `$AFD7`, past the branch. Confirmed.

### 4. (informational) There is a SECOND route to a hatch kill that the "cannot reach it" note does not mention

The worklog says reaching `$AF67` needs `$C05F`, which needs a shot on an
armoured enemy, and that the geometry forbids it. True for the SHOT route. But
`$C1BD-$C1CA` - the shield-contact arm - does
`LDA $46 / BEQ / DEC $46 / LDA $010C,Y / BPL / LDX $A8 / INC $046C,X`:
**ship-to-hatch contact with a live shield increments the same damage counter,
bypassing `$C05F` entirely.** `deep-powered` holds `$46 = 5` on every frame, so
that route is armed in the existing scenario; it just never happens because the
ship never touches a hatch. That is a cheaper way to drive `$AF67` in W23/W28
than building a left-parked firing script, and it is already ported
(`src/collision.js` line ~675).

I confirmed the reachability claim itself from the artifact rather than trusting
it: the two hatch slots (5 and 6) hold `$8F`/`$90` for 465 and 847 frames,
`$046C` is **0 on every one of those frames**, `$018C` is 0 on every one, and
both end `$8F → $00` (freed by drift), never `→ $02`. So `$C05F`'s damage arm
and `$AF67`'s warp counter really are unit-tested only, exactly as stated.

### 5. (informational) A test mirrors the routine it is checking, and the mirror is wrong outside the tested range

`tests/enemies.test.js`, the `$A3CC` test, now ends with

```js
const expect = Math.min(0xF0, Math.max(0x20, (px + 0x30) & 0xF8));
```

That reimplements `$B65C` in the test - and it reimplements it WRONG: for
`px >= 0xD0` the ROM carries and forces `$F0` without the `AND #$F8`, while this
expression gives `0x20`. It passes only because `px` is small in that state.
Harmless today (the dedicated `$B65C` test in `w22-handlers.test.js` pins the
carry path from both sides), but it is a check that agrees with the code by
construction rather than with the cartridge.

---

## Things I checked and found CORRECT (so nobody re-derives them)

* `$C05F-$C08D`: `$A9` is the enemy index and `$A8` the shot slot (`$BFE2 LDX
  #$08 / STX $A8`, `$C00B LDX #$09 / STX $A9`), so `o.s0460[j]` = `$0460,X` and
  `o.s0460[e]` = `$046C,X` are both right, and `state.spawn.zA8` really is the
  sweep's own weapon index (`src/collision.js:116`).
* The hatch's box class 1 indexes `$BFDA[1] = 32` / `$BFDE[1] = 32`, and the
  exported block `assets/collision/tables.json` covers `$BFDA-$BFE1`. Class 1
  does not fall off the end of anything.
* `$AF6B LDA $18 / ASL / ASL / TAY / LDA $07E5,Y` == `state.score[5 + 4*player]`
  - `$8474` puts P1 at `$07E4`, so index 5 is `$07E5`. Correct.
* `$AF85 JMP $8453` == `addScore(state, 0, 1, 0)`: `$8453 LDA #$01 / STA $9A`,
  `$8469 STA $99`, `$846D STA $9B`. Correct.
* `$39` is NOT in `$9B3E`'s `$3D-$97` wipe (it is below `$3D`) and IS cleared by
  `$97DF`. `$5F` IS in the wipe. Both modelled the right way round.
* `$96D5 STA $39` and `$C786 STA $39` are on paths the port still refuses
  (`$96CF` is a throw in src/nmi.js), so `$39` cannot drift.
* `$A4`/`$A5`, `$A8`/`$A9`/`$AB`/`$AC`, `$02`, `$39`, `$5F` are none of them in
  the 1022-address watch list - the implementer's point 3 is accurate, and it
  also means the `$AF98` `$A8` save/restore is invisible to the oracle by
  construction.
* `$B628` has exactly four callers - `$B498`, `$B512`, `$B560`, `$B620` - and
  none of them is `$B6E1` or `$B747`. The census correction is right.
* `wavecensus.py`'s `PORTED_TARGETS` now parses `src/enemies.js` and raises on
  zero labels; re-running it reproduces 92/92/0/100.0% for stage 0 and 454/598
  overall, which is what the ledger in `20-plan-completeness.md` now says.
