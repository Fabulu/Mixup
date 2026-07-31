# Wave 5 test hardening: un-decorated checks for death, respawn and the checkpoint

status: DONE
wave: 5   role: test   started: 2026-07-29

## THE GATE, on the tracked tree, after the work

```
$ node --test games/gradius/tests/
# tests 198  # pass 198  # fail 0  # cancelled 0  # skipped 0  # todo 0
   (189 before this commit; +9, all in tests/collision-unwitnessed.test.js)

$ python games/gradius/tools/oracle/scen.py          # 10m35s, all 23 re-recorded
$ sha256sum -c <the 24 hashes taken before the re-record>
   24 of 24 OK, 0 mismatches -- every artifact came back byte-identical

$ node games/gradius/tools/test-all.mjs
  ...
  [PASS] terrain-death       121 dying frames, expected 121
  [PASS] terrain-death-miss    0 dying frames, expected 0
  [PASS] right-wall          121 dying frames, expected 121
  [PASS] diag-rd-lu          107 dying frames, expected 107
  [PASS] diag-ru-ld          121 dying frames, expected 121
  [PASS] lr-both             121 dying frames, expected 121
  [PASS] speed6-right        121 dying frames, expected 121
  [PASS] speed3-diag         111 dying frames, expected 111
  823 dying frames across 7 scenario(s); 8 of 23 carry an expectDying

  23 scenarios, 7047 of 7047 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  self-check: neuter lead1 -> RED 193, seed-x+1 -> RED 116, laginject=450 -> RED 640
  GREEN -- 6 passed, 0 failed, 0 SKIPPED

$ node tools/build-dist.mjs
  rom-leak guard: 121 files checked against 2 ROM(s) -- clean, 1 deliberate exception
```

The 6 SKIPPED are FIELDS (the pre-existing emulator-only probe fields with no
port counterpart), not stages, and this commit adds none: it adds no watched
address and no UNMODELLED entry, on purpose -- see "What I RULED OUT" below.

## The task, as I understood it

Wave 5 (`0ac07d4`) ported the collision subsystem, the death, the explosion walk
and `$979D`'s respawn. The reviewer and QA both signed the gate green and both
reported the same shape of defect: behaviours the wave ported that **nothing can
falsify**. I write TESTS ONLY. Every check I add must be seen to go RED against a
deliberate break of the code it guards, with the file restored and hashed.

Targets, taken from the two reports and re-derived myself:

1. `$97AF STA $26,X` / `$97BF STA $28,X` -- swapping or deleting both is green on
   the corpus AND on the whole unit suite (QA finding 1).
2. The two-player switch `$97C5-$97DB` -- deleting `STX $18` is green.
3. `$C125 BCC $C136` (the "player is left of it" rejection) -- deleting it is
   green.
4. `$C2A5`'s per-stage arms: `$19 == 2` (stage 3 probes terrain only on odd `$02`
   frames, and skips the shot loop when it does not) and `$19 == 4` (stage 5 RTS,
   no terrain collision at all). `$19` is 0 on every compared frame of all 23
   scenarios.
5. The checkpoint formula `min($3F AND $0E, 8)`. Wave 5 *replays* the recon's
   three intervention rows; nobody re-ran the intervention. **A number is not a
   fact until it is measured** -- so measure it, on the cartridge, myself.
6. `terrain-death`'s poked cell can silently stop landing and the gate would
   still print `23 scenarios, 7047 of 7047 frames compared, 0 failures` (QA
   finding 3). Needs a corpus-level coverage assertion, like CLAMP COVERAGE.
7. The recorded rationale for the class-3 box test is measurably wrong
   (reviewer finding 1): `$046C-$0475` is NOT zero corpus-wide.

And one I added, from docs/knowledge/03's own worked example ("five order
mutations a 691-test suite passed clean"): **the five slot loops** in
src/collision.js all descend, the corpus contains exactly ONE contact in 7047
frames, and a one-element list agrees with every permutation of itself.

## What I MEASURED

### 1. The checkpoint formula, on the cartridge, by intervention

The wave shipped this as a REPLAY of 00-recon-flow.md's three rows. I re-ran it,
and added the four values that separate the mask from the cap. `PROBE_CRASH`
(park the ship at Y 200) does NOT kill on this script -- `$A052` clamps Y to 192
before any terrain probe runs, `hook.C1D6 = 0` over 700 frames -- so the death is
made by poking `$C1D6`'s own three stores at one frame, which is an intervention
on the INPUT side of `$97B1` (the formula reads none of them):

```
for v in 0 3 7 8 16 20 31; do
  python games/gradius/tools/oracle/flowprobe.py --frames 660 \
    --script "200:,10:S,450:" --hooks 979D --fields st24,camHi \
    --poke "001B=160@500-500,004C=120@500-500,0100=2@500-500,003F=$v@480-620"
done
```

Every run: `hook.979D = total 1 firstGameFrame 621`. The `$24` transition on 621:

| poked `$3F` | 0 | 3 | 7 | 8 | 16 (`$10`) | 20 (`$14`) | 31 (`$1F`) |
|---|---|---|---|---|---|---|---|
| read `$24`  | 0 | 2 | 6 | 8 | 0          | 4          | 8          |

0 and 16 show as "no transition"; on the 16 run `camHi 16 -> 0` on the same frame
proves `$9B6A` put a 0 back. `$1F -> 8` is the row that measures the CAP (14
capped to 8), `3 -> 2` and `7 -> 6` measure the MASK, `$10 -> 0` is where the two
pull against each other. All seven agree with `min($3F AND $0E, 8)`.

### 2. `$26,X` and `$28,X`, same method

```
python games/gradius/tools/oracle/flowprobe.py --frames 660 \
  --script "200:,10:S,450:" --hooks 979D --fields st24,st26,st28,stage,f1A,camHi \
  --poke "001B=160@500-500,004C=120@500-500,0100=2@500-500,0019=2@610-620,001A=5@610-620"
  hook.979D = total 1 firstGameFrame 621
  f611  stage 0 -> 2     f611  f1A  0 -> 5      <- the poke
  f621  st26  0 -> 2     f621  st28 0 -> 5      <- $97AF / $97BF
```

`$26 = 2` and `$28 = 5`, not 5 and 2. That is the first time the two stores have
been told apart by anything.

### 3. The `$0460` census (reviewer finding 1, re-measured)

Over the `seedRam` of all 23 artifacts (the cartridge's own `$0000-$07FF` at each
align frame):

* `$0460-$0469` (the box classes): **0 in every one of the 23**.
* `$046C-$0475`: **0 in 22, nonzero in intro-respawn** --
  `[0,0,0,0,41,30,36,36,63,52]`. It is the enemy HANDLER-STATE array
  (scenarios.json `_watch`, wave 3), written to 1..64 during play.

So the reviewer is right that the commit's recorded reason is false, and wrong
about the detail (they said all 23 seeds; it is one). The important half
reproduces: reading `$0460[j+12]` is not a silent alias, it CRASHES --

```
node tools/oracle/compare.mjs --only right-wall
  Error: collision tables: $C01A is not in any exported range
         (boxes $BFDA-$BFE1, explosion $C0FA-$C100)
    at playerVsEnemies (src/collision.js:234)
```

right-wall and enemy-waves both die that way; intro-respawn does NOT (its 85
compared frames are all intro, so no enemy type is non-zero and the class is
never read). Corrected at the test, with the mechanism, in this commit.

### 4. Dying frames in the corpus, independently

`compare.mjs` now counts them: **823 dying frames across 7 of the 23 scenarios**
-- terrain-death 121 (first at f501), right-wall 121 (f493), diag-rd-lu 107
(f533), diag-ru-ld 121 (f445), lr-both 121 (f482), speed6-right 121 (f515),
speed3-diag 111 (f529). Same 823 QA reported, arrived at from the artifacts.

## What I ADDED

**games/gradius/tests/collision-unwitnessed.test.js** (new, 9 tests), following
the `enemies-unwitnessed` / `flow-unwitnessed` convention -- the wave's NUMBERS
and BRANCHES, as opposed to collision.test.js's shapes:

| test | what it pins |
|---|---|
| `$97AF/$97BF` | `$26,X := $19` and `$28,X := $1A` are two different bytes, and `$9B6E/$9B72` read them back |
| `$97C5-$97DB` | all six arms of the two-player switch, AND that the four saves happen before it |
| `$C125 BCC $C136` | an enemy to the RIGHT wraps the 8-bit subtract; only the BCC rejects it |
| `$C101/$C136` | the sweep descends 9 -> 0 and `$C1D6` abandons the rest of it |
| `$BFE6/$C2C8/$C303` | the other four slot loops start at their TOP slot |
| `$C2B0` | stage 3 probes on odd `$02` only, and its BCC jumps past the shot loop, not just the probe |
| `$C2AB` | stage 5 returns before the probe AND before both terrain loops |
| `$9B3E` | all 32 modelled bytes of the `$3D-$97` wipe, in one sweep |
| `$97EB` | `$9B3E` covers `$57`, so the respawn's own `JSR $9C09` is a dead store |

**games/gradius/tools/oracle/compare.mjs**: `reach.dying` / `reach.deaths` /
`reach.diedAt` from the ORACLE side, a per-scenario line, and a new
`=== DEATH COVERAGE ===` block that fails the run (exit 1, counted on the verdict
line) when a scenario carrying `expectDying` no longer matches it.

**games/gradius/tools/oracle/scenarios.json**: `expectDying` on the seven
scenarios that die plus an explicit `0` on terrain-death-miss, and a `_expectDying`
doc block. Edited with a line-based script that asserts its anchor count
(docs/knowledge/03, "never regex a structured file").

**games/gradius/tests/collision.test.js**: two comments corrected in place --
the checkpoint test is now MEASURED rather than replayed (with the commands), and
the class-3 test's `$046C` rationale is replaced with the census and the crash
above (rule 6).

## THE MUTATION TABLE

Every mutation was applied to a COPY of games/gradius in the scratchpad
(`scratchpad/g5`, driven by `scratchpad/w5t_brk.py`), which restores the file and
asserts sha256 equality after every run; `sha256sum` on src/collision.js and
src/flow.js in the copy equals the tracked tree's, and `git diff --stat
games/gradius/src` is empty. Baseline in the copy: units 193 pass / 5 fail (the 5
are touch-pad tests that read files outside games/gradius -- read the DELTA), and
the corpus 23 scenarios / 7047 frames / 0 failures / 0 death-cov failures.

| # | mutation | site | corpus | unit test that went RED |
|---|---|---|---|---|
| M1 | `$26,X := $1A` (swap a) | flow.js:149 | green | `$97AF/$97BF` |
| M1b | `$28,X := $19` (swap b) | flow.js:153 | green | `$97AF/$97BF` |
| M2 | delete `$97AF STA $26,X` | flow.js:149 | green | `$97AF/$97BF` |
| M2b | delete `$97BF STA $28,X` | flow.js:153 | green | `$97AF/$97BF` |
| M3 | delete `$97DB STX $18` | flow.js:171 | green | `$97C5-$97DB` |
| M4 | the switch runs BEFORE the saves | flow.js:144 | green | `$97C5-$97DB` |
| M5 | drop the `$C125` BCC | collision.js:232 | green | `$C125 BCC $C136` |
| M6 | invert the stage-3 parity | collision.js:409 | green | `$C2B0` |
| M7 | stage 3 skips only the probe (`shotsVsTerrain` instead of `bulletsVsTerrain`) | collision.js:409 | green | `$C2B0` |
| M8 | drop the `$C2AF` stage-5 RTS | collision.js:410 | green | `$C2AB` |
| M9 | drop `$57` from the `$9B3E` wipe | flow.js:293 | green | `$9B3E` + `$97EB` |
| M10 | drop `$6F` from the `$9B3E` wipe | flow.js:303 | **RED 5** | `$9B3E` |
| M11 | box class from `$0460[j+12]` | collision.js:231 | **CRASH** | `$C127 vs $C131` |
| M12 | checkpoint mask `$0F` | flow.js:150 | green | `$97B1-$97BB` + `$97C5` |
| M13 | drop the checkpoint cap | flow.js:151 | green | `$97B1-$97BB` |
| M14 | ascend the `$C101` sweep | collision.js:225 | green | `$C101/$C136` |
| M15 | ascend the `$BFE2` sweep | collision.js:96 | green | `$BFE6/$C2C8/$C303` |
| M16 | ascend the `$C2C4` loop | collision.js:448 | green | `$BFE6/$C2C8/$C303` |
| M17 | ascend the `$C20A` loop | collision.js:366 | green | `$BFE6/$C2C8/$C303` |
| M18 | ascend the `$C2FF` loop | collision.js:480 | green | `$BFE6/$C2C8/$C303` |
| M19 | the wipe PRESERVES `$45` (the plan's own break) | flow.js:284 | green | 4 tests, incl. the pre-existing power-up one |
| M20 | terrain-death's poke moved to the miss cell `05B4`, re-recorded | scenarios.json | `PASS terrain-death 239 frames all TIER 1 fields exact`, **0 failures** | -- DEATH COVERAGE: `[FAIL] terrain-death 0 dying frames, expected 121` |

Seventeen of the twenty-one are corpus-GREEN. Every one of them now reddens a
unit test that did not exist before this commit.

M20 is the one to read twice: the corpus stayed *completely* green -- the summary
line still said `1 scenarios, 239 of 239 frames compared (0 truncated: none), 0
failures` -- and the only thing that noticed the scenario had stopped testing its
own subject was the new coverage block. Restored afterwards and re-recorded from
the cartridge: `sha256 c632ebc049cd82a61fbfd474161c1460dfeec327b6a2d2c40d1646a1e46b342f`,
byte-identical to the artifact that was there before the break.

## What I RULED OUT / did not do

* **Watching `$A8`.** Nine `state.spawn.zA8 = ...` stores are unfalsifiable by
  the corpus (QA's minor finding), and the obvious fix is to add `$A8` to the
  watch list. It is worth nothing: every loop in the frame ends with a `DEC $A8`
  that fails its `BPL`, so at the `$80B5` sample point `$A8` is `$FF` on every
  frame of every scenario. It would be a CONSTANT field -- compare.mjs's own
  `constantFields` count exists for exactly this -- and no mutation of an
  individual store could change it. What holds those stores is the loop-count
  assertions plus M15-M18 above.
* **Watching `$A0-$A3`.** These DO vary per frame (they are `$C105-$C113`'s box
  bases and `$C3D3`'s cell arithmetic) and would be a real check -- but the port
  computes them as locals inside `probeCollision()`, so they would be four new
  UNMODELLED/SKIPPED fields (6 -> 10 on the verdict line) checking nothing today.
  That is a src change, and I am the test writer. **Recommended for wave 6**,
  which ports `$C3AF` (the shot entry into the same routine) and will need them.
* **Watching `$0500-$06FF`.** The port's 512-byte map is compared at exactly one
  cell, one frame, one scenario, and is all-zero in every seed. Not fixed here:
  the map only becomes interesting when something writes it, which is wave 6's
  `$C32F` wall-breaking patch.
* **Box classes 1, 2, 3.** M11 shows the INDEX is now interrogated (it crashes),
  but no measured run has ever given an enemy a class other than 0, so the widths
  `$20`/`$30` and class 3's height `$02` remain LISTING-DERIVED. Both tests that
  use them say so at the assertion.
* **The `$19 == 2` and `$19 == 4` arms against the cartridge.** My tests drive the
  PORT into those arms; no cartridge run has ever executed them (stage 3 and
  stage 5 are not reachable from any script this corpus can drive). The tests are
  therefore listing-derived on the ROM's control flow and measured only on the
  port's. Written down rather than implied.
* **`$97E3 STA $5D`.** Still unfalsifiable, for the reason wave 5 documented and
  QA reproduced; my `$97EB` test is the same shape for `$57` and says so.

## A defect I could not fix, because it is in src/ and I am the test writer

`src/flow.js` states, at `clearAhead()` and again in `respawn()`'s header, that
on the respawn path `$97EB JSR $9C09` "is the only thing that clears `$57`".
It is false: `$9B3E` is `LDX #$5A / STA $3D,X` = `$3D-$97` inclusive, `$57` is
inside it, and `$97EE JMP $9B3E` runs four instructions later. QA measured it;
I reproduced it (M9 reddens my `$97EB` test through `introReset()` alone, with no
`clearAhead()` in front of it). The store is correctly PORTED -- the fall-through
out of `$9BF0` is live and is a different path -- only the note is wrong. It is
pinned by a test now, which is the best a test writer can do; the one-line
comment fix belongs to whoever next holds the src/ lock.

## If someone picks this up cold

* The mutation harness is `scratchpad/w5t_brk.py`; `python w5t_brk.py M5 M9` runs
  a subset. It refuses to run if its anchor is not found exactly once, and it
  asserts sha256 on restore.
* The cartridge measurements are reproducible with the two flowprobe commands
  above; both are quoted verbatim at the tests they justify.
* `expectDying` numbers change whenever a compared window changes. That is not a
  nuisance, it is the check: re-measure with `node tools/oracle/compare.mjs` and
  put the new number in scenarios.json in the SAME commit as the window change.
