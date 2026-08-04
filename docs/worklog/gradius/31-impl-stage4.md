# Wave 31 IMPLEMENTER -- stage 4 ($19=3) plays start-to-finish

status: DONE (with one named UNRESOLVED item -- no in-corpus stage-4 scenario;
the both-sides evidence is an INTERVENTION run, labelled as such)
implementer, 2026-08-04

Scope (brief + `29-plan-whole-game.md` W31): make stage 4 (`$19 = 3`) play start
to finish. The plan calls it "nearly free"; the brief says to treat that as a
HYPOTHESIS.

---

## BASELINE, MEASURED BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (NB: the brief's path
`games/gradius/tools/stageledger.py` does not exist -- the tool is under
`tools/oracle/`, same correction W30 had to make):

```
stage  distinct  ported   unported  inline5  ported %     first unported
0      92        92       0         0        100.0        NONE (shipped)
1      93        93       0         0        100.0        NONE (shipped)
2      78        78       0         45       100.0        NONE (shipped)
3      98        98       0         0        100.0        NONE (shipped)   <-- MY STAGE
4      28        14       14        4        50.0         scroll $0000  (@$ABB6)
5      98        47       51        0        48.0         scroll $03B0  (@$AC2E)
6      111       104      7         0        93.7         scroll $0CC0  (@$AD98)
ALL    598       526      72        49       88.0
```

**FIRST FINDING, and it changes the wave's DONE-WHEN.** Stage `$19=3` already
reads 98/98 at the TOP of this wave -- W30 lifted it as a side effect. So the
ledger CANNOT be this wave's done-when: it reads identically before and after
whatever I do. The ledger's denominator is WAVE RECORDS ONLY. The late spawner
(`jt_$C439`) is not a wave record and is invisible to it.

That is the "nearly free" label's blind spot, stated up front: the number the
plan cites as evidence is a number that cannot move.

---

## INLINE RECON, read out of `rip/prg.asm` before any `src/` edit

### 1. What stage 4 actually still needed (three things, not one)

`python games/gradius/tools/oracle/wavecensus.py` -- stage `$19=3` names types
`$04 $05 $06 $07 $08 $0D $0E $0F $10 $11 $12 $13 $27 $29`; every one has a
ported handler. So the WAVE side is genuinely free, as W30 said. What was left:

1. **`src/enemies.js:354` `if (stageIndex >= 3) throw`** -- W30's own scope
   guard in `runEngine`. This is the wall stage 4 hits on its FIRST wave record,
   and no ledger column sees it. Nothing in `stageledger.py` reads `src/`'s
   scope guards; it reads the type -> handler map only.
2. **`jt_$C439[3] = $C5AD`** -- the stage-4 late-spawner arm, a loud throw.
3. **`$AE1C` entry 21 -> `$B377`** -- its child handler, type `$15`, also a
   loud throw (the `default:` arm of `dispatch`).

### 2. `st_$C5AD` -- transcribed, and it is NOT a copy of the volcano

`$C5AD`-`$C600`, then `$C5FE JMP $C4E4` -- a SHARED TAIL with `st_$C486`
(the stage-1 volcano), which the port had inlined.

```
C5AD  LDA $69 / BNE $C5B6
C5B1  LDA #$0F / JSR $EC1E        sfx $0F, only when $69 == 0   (same as $C48A)
C5B6  LDX #$04 / JSR $C44F        stepper, $C447+4 = $C44B -> stream $C633
C5BB  LDA $A9 / LSR / CLC / ADC $A9 / TAY      Y = a9 * 1.5
C5C2  LDX $A8
C5C4  $042C,X := $C603,Y          xvel
C5CA  $03BC,X := $C604,Y          yvel
C5D0  LDA $69 / CMP #$1E / BCS $C5DC
C5D6  DEC $03BC,X / DEC $03BC,X   yvel -= 2 when $69 < $1E
C5DC  LDA $02 / AND #$0F / CLC / ADC $C605,Y / STA $048C,X   accel
C5E7  $04AC,X := $01
C5EC  LDY $AA / $036C,X := $C601,Y   X pos, $38 or $B8
C5F4  $030C,X := $15              type $15 -> entry 21 -> $B377
C5F9  $032C,X := $2C              Y pos $2C  (the volcano's is $90)
C5FE  JMP $C4E4
```

THREE differences from `$C486` that a copy-paste port would have got wrong:

| | `$C486` (stage 1) | `$C5AD` (stage 4) |
|---|---|---|
| `$69` ramp | TWO arms: `< $1E` -2, `< $0A` a further -2 | ONE arm: `< $1E` -2. **No `$0A` arm.** |
| accel jitter | `$C4C1` `ASL/ASL/ASL` then `AND #$07` -- **always 0** (three shifts clear bits 0-2 before the mask) | `$C5DE` `AND #$0F` on `$02` raw -- **live** (I wrote "0..15" here and the cartridge later corrected me to 0/4/8/12; see below) |
| Y position | `$90` (the crater, bottom) | `$2C` (the ceiling, top) |

The last one is the whole stage: stage 4's volcanoes hang from the CEILING and
drop, and `$99FC` (`$19 == 0 || $19 == 3 -> sfx $3F`) already treats stages 1
and 4 as the same eruption -- ported in `nmi.js:502` since W24. The listing and
the sound table agree, independently.

`$C601`-`$C632` is **byte-identical to `$C4F4`-`$C525`** (checked all 50 bytes).
The ROM carries two copies. The port must read `$C601`, not alias `$C4F4`, and
that is a difference NO mutation test can catch -- recorded below, not hidden.

### 3. `st_$B377` -- three instructions, and both exits already exist

```
B377  LDA $030C,X
B37A  BPL $B3A7        -> $B3A7 JMP $B0B4   (type += $80, the init frame)
B37C  JMP $B1FA        -> JSR $B184 / $B1F4 JSR $B16C / $B1EB JSR $B120 / $B251
```

Its sibling `$B36F` (the stage-1 volcano rock, entry 10) is identical except
its arc is `$B1E5` (`subY16`, moving UP) where `$B377` uses `$B1FA` (`addY16`,
moving DOWN). `loc_B1FA` was already factored out by W30 for `$B434`, and
`setInitialised` (`$B0B4`) has been there since W12. So entry 21 is genuinely
a 4-line port.

### 4. READING PAST THE APPARENT END -- what I checked, and what I found

- `$C5AD` does NOT end at `$C5FE`. `JMP $C4E4` is a continuation with nothing
  returning to it, and it sits **281 bytes EARLIER in the ROM**, inside
  `st_$C486`'s body. The port had that tail INLINED in `st_C486`; it is
  factored into `loc_C4E4(state, j)` now, exactly as W30 had to do for
  `loc_BD2C`/`loc_B1DA`/`loc_B212`. **This is the fourteenth incident of the
  family and the fourth JMP-backwards case in two waves.**
- `loc_$C4E4` really does end at `$C4F3 RTS`: `$C4F4` is the
  `approachStage0` DATA block (confirmed against `export_assets.py`'s block
  list, not by eyeballing the disassembly).
- `$B377` ends at `$B37E`; `$B37F` is `st_$B37F` (entry 11) and is entered only
  by the dispatch, never fallen into -- `$B37C` is a `JMP`.
- `sub_$B0B4` ends `$B0BD RTS`; `$B0BE` is `loc_$B0BE`, reached only from
  `$B0B2 BMI`. Not a fall-through.
- `$C633` (the X=4 stream) is `$C633`-`$C652`, 32 bytes, and `st_$C653` follows
  it. `sub_$C44F`'s index is `(pre-INC $69 & $3F) >> 1`, range 0..31 -- it
  cannot run off the end.
- NO EXPORTER CHANGE NEEDED: `approachStage3` (`$C601`-`$C652`, 82 bytes) was
  already exported. Same dividend W21's speculative block list paid W30.

### 5. Nothing else in the ROM special-cases `$19 == 3`

I grepped every `LDA $19` in `prg.asm` (25 sites) and read the compare after
each. Exactly ONE tests for 3: `$9A00 CMP #$03` inside `st_$99E9`, and it is
already ported (`nmi.js:502`). The stage-4-shaped constants everywhere else are
`CMP #$04` = `$19` 4 = in-game stage 5 (`$8B8D`, `$9663`, `$A17C`, `$C037`,
`$C25D`, `$C2A5`, `$C772`) -- W32's, not mine. Stated as a listing scan, which
is the only thing that can prove an absence.

---

## THE REACHING QUESTION, MEASURED -- and W30's inherited sentence is wrong

The brief: *"W30 could NOT get a stage-3 both-sides cartridge comparison: the
endchain stops at the stage-2->3 transition. If you can extend the scenario to
reach stage 4, that is worth more than the port itself."*

I ran the endchain's own trajectory out to 26,000 frames on a fresh Mesen
(`probe.run`, the corpus boot + RDA/RUA/RDA opening + `RA` to f5000 + a fixed
`RUA` hold, with the four rank-byte power-up pokes held from f400 -- the exact
recipe `reachcheck.py` uses, only longer). Measured `$19`/`$1B`/`$80D4`/scroll
every frame they change:

```
f11525  $19=00 $1B=90  scroll $0E00     stage 1 ends
f11526  $19=01 $1B=80  scroll $0001     stage 2 begins   ($96CF, W27)
f13525  $19=01 $1B=A0  scroll $03E8     DEATH 1
f13754  $19=01 $1B=A0  scroll $0427     DEATH 2
f13983  $19=01 $1B=A0  scroll $0427     DEATH 3
f14333  $19=01 $1B=C0  scroll $0463     GAME OVER
f15117  $19=00 ...     scroll $0000     restart, unpowered
f18743 / f22369 / f25995                dies again at scroll $0000, three more times
maxScroll $0E00       stages visited: $00, $01 only
```

**THE WALL IS NOT WHERE THE INHERITED SENTENCE PUTS IT.** "The endchain stops at
the stage-2 -> stage-3 transition" describes the DUMP, which ends at f12000. The
run itself does not stop there -- it plays on and **dies three times inside
stage 2 between scroll `$03E8` and `$0463`**, then game-overs. The trajectory
never reaches stage 3 at all, so it is not one dump-length away from stage 4;
it is three deaths and two whole stages away. Every stage past 2 needs a NEW
surviving input, not a longer recording.

So: **I could not reach a stage-4 both-sides cartridge comparison, and I could
not reach a stage-3 one either.** What I tried is above, with the numbers. What
would close it is a stage-2-surviving and stage-3-surviving input script -- the
reaching-method generalisation the plan books as W37 -- and that is a search
over button scripts, not a code change. I am recording the measured wall
(`$19=1`, scroll `$03E8`, f13525) so the next attempt starts from a fact rather
than from a re-quoted sentence.

---

## SO I TOOK THE FALLBACK -- AND IT WORKED: 271 SPAWNS ON THE BOARD, 0 DIVERGENT

`docs/knowledge/09` approves a both-sides intervention when a button script
cannot reach, and the W29 plan names it for exactly this case. The trick is
finding a poke that is SURGICAL, and the listing hands one over: across the
`$82` countdown window, `$19` selects **nothing but the late-spawner arm**,
because stages 1 and 4 agree on every other reader there.

```
$9A3D[0] == $9A3D[3] == $0C      same boss-trigger page
$98FD[0] == $98FD[3] == $0E      same stage-end page
$99FC/$9A00                      stage 0 AND stage 3 both get sfx $3F
the camera is parked at $0C00 for the whole window -> no terrain streams,
                                 and $9E38's per-stage pointers never re-read
```

So: `0019=3@6460-7730` on a real Mesen run of the endchain trajectory. The poke
opens ONE FRAME LATE on purpose, so f6459 still runs the STAGE-1 arm and stands
as an in-run control.

```
volcano-family spawns: $8A x1, $95 x270
```

One stage-1 rock (`$0A`+`$80`, y `$90`, the control) and **270 stage-4 ceiling
rocks** (`$15`+`$80`, y `$2C`). The poke did exactly one thing.

Then `stage4cmp.mjs` rebuilds each spawn's inputs from the board's own RAM --
the PRE-INC `$69`, `$02`, and the slot `$C41E`'s scan landed on -- runs the
port's `spawnEngine`, and compares NINE object fields plus the post-INC `$69`
against the cartridge's bytes:

```
spawns compared : 271
mismatches      : 0

$C603 descriptor rows : 16 of 16 exercised
$C5D4 ramp arms       : $69<$1E + $69>=$1E (of 2)
$C601 craters         : $38 $B8 (of 2)
$C5DE jitter values   : 0,4,8,12
```

**A CARTRIDGE FINDING I DID NOT EXPECT, and it corrected my own comment.** I had
written that `$C5DE`'s jitter is "0..15". It is not: `$C415 AND #$03 / BEQ`
means this arm only runs on frames where `$02 & 3 == 0`, so `$02 & $0F` can only
be 0, 4, 8 or 12. **Four of sixteen is ALL of them**, not a sampling gap. The
board produced exactly those four over 270 spawns. Source comment and test
comment both corrected.

### The cartridge comparison was watched to fail too

Same discipline as the unit tests: mutate the port, watch the BOARD data reject
it, restore, hash. `sha256(enemies.js)` `a5067dbf...` before and after all 12.

| mutant | mismatches |
|---|---|
| C1 y `$2C` -> `$90` (the crater side) | 270 |
| C2 stream X=4 -> X=0 (stage 1's) | 56 |
| C3 the `$69<$1E` ramp dropped | 28 |
| C4 a `$69<$0A` inner arm added (stage 1's) | 8 |
| C5 the accel jitter made dead (`$C4C1`'s) | 205 |
| C6 the jitter mask `$0F` -> `$07` | 135 |
| C7 crater indexed by `$A9` not `$AA` | 257 |
| C8 the shared tail `loc_$C4E4` dropped | 776 |
| C9 descriptor stride 1.5 -> 2 | 727 |
| C10 xvel/yvel rows swapped | 540 |
| C11 type `$15` -> `$16` | 270 |
| **C12 `$C603` -> `$C4F6` (the duplicate table)** | **0 -- GREEN** |

C4 is the one worth pausing on: adding stage 1's inner ramp arm -- the single
most likely copy-paste error in this routine -- moves only EIGHT of 271 spawns,
because the two arms differ only while `$69 < $0A`. A corpus that happened to
start its window later would have missed it entirely.

**C12 is now a MEASURED fact rather than an inference.** `$C601`-`$C632` is
byte-identical to `$C4F4`-`$C525`, so reading the wrong copy is invisible to the
cartridge as well as to the tests. The port reads the address the instruction
names and there is no experiment that can check it.

### What this is NOT evidence of -- the provenance label

This is an INTERVENTION run. It is valid evidence that our transcription of
`$C5AD`/`$B377` is right, and it is **not** evidence about stage 4's pacing,
spawn density, or what the stage looks like: the terrain under those rocks is
stage 1's, the rank is the endchain's, and the state is one the cartridge can
only be in because we forced it. Both tools' headers say so.

Committed as `tools/oracle/stage4poke.py` + `tools/oracle/stage4cmp.mjs` so the
next wave re-runs it rather than re-deriving it. Output is under `out/`
(gitignored); nothing ROM-derived is committed.

---

## WHAT I CHANGED IN `src/`

| | |
|---|---|
| `st_C5AD()` | new. `$C5AD`-`$C600`, the ceiling volcano. |
| `h_B377()` | new. entry 21, types `$15`/`$95`. |
| `loc_C4E4()` | EXTRACTED out of `st_C486`, where it was inlined. `$C486` falls into it; `$C5AD` jumps back into it. |
| `dispatch()` | `case 0xB377`. |
| `lateSpawner()` | `case 0xC5AD` -- was a throw. |
| `runEngine()` | scope guard `>= 3` -> `>= 4`, with a message naming stage 5's four blockers. |

`$C4DF` (`y := $90`) stayed in `st_C486` and did NOT move into the shared tail:
`$C5F9` writes `$2C` at that point instead, and folding the `$90` into
`loc_C4E4` would have silently overwritten the ceiling. Mutation C1 and unit
test 10 both bite on that.

## THE LEDGER GREW A COLUMN, BECAUSE THE OLD ONE COULD NOT SEE THIS WAVE

`stageledger.py` reported stage `$19=3` at 98/98, first-unported NONE, for a
whole wave while `runEngine` threw on its first record. That is not a bug in the
tool -- record coverage is a real question -- but it was being read as the
answer to a different one. Three gates decide whether a stage runs and the
ledger watched one.

Added, all read LIVE out of `src/enemies.js` and `assets/prg.bin`:

- **`runEngine`'s scope-guard bound**, parsed from `if (stageIndex >= N)`.
- **`jt_$C439[$19]`**, and whether that arm's `case` returns or throws.
- **the arm's CHILD handler**, found by scanning the arm's ROM span for
  `A9 nn 9D 0C 03` (`LDA #$nn / STA $030C,X`). This one was added BECAUSE a
  mutation exposed the gap: deleting `case 0xB377` reddened NOTHING in the
  first version. Type `$15` has ZERO wave records -- `$C5AD` is its only
  producer -- so the record census is structurally blind to it, exactly as it
  is to the stage-1 volcano's `$0A`.

```
PER-STAGE RUNNABILITY  (NOT record coverage -- see W31)
stage  $A2F0 runEngine        late spawner jt_$C439[$19]   verdict
0      admitted               $C486 +$B36F ported          RUNNABLE
1      admitted               $C546 +$B37F ported          RUNNABLE
2      admitted               $C686 ported                 RUNNABLE
3      admitted               $C5AD +$B377 ported          RUNNABLE
4      THROWS (scope guard)   $C653 THROWS                 blocked
5      THROWS (scope guard)   $C6DE THROWS                 blocked
6      THROWS (scope guard)   $C429 ported                 blocked
```

The child scan returns None for `$C686` (it reads `$C6CC,$3A`), `$C653`,
`$C6DE` and the bare RTS `$C429`, and the signal then declines to constrain
them rather than guessing. **None means "this scan cannot prove a child", NOT
"there is no child"** -- written into the docstring so a later reader does not
take a blank column for an all-clear.

## THE MUTATION TABLE (unit tests + the ledger gate)

Harness: patch `src/enemies.js`, run the named check, restore, sha256 before and
after every one. `bd81b768...` before and after all 25.

| # | mutant | reddened |
|---|---|---|
| 1 | `case 0xC5AD` removed | 1, 3, 4, 5, 6, 7, 8, 9, 12, 13 |
| 2 | scope guard `>= 4` -> `>= 3` | 2 |
| 3 | scope guard `>= 4` -> `>= 5` | 2 |
| 4 | stepper X=4 -> X=0 | 5 |
| 5 | `$C5F9` y `$2C` -> `$90` | 4 |
| 6 | stage 1's `$69<$0A` inner ramp arm added | 5 |
| 7 | `$C5D2` bound `$1E` -> `$0A` | 5 |
| 8 | `$C5DE` jitter made dead | 6 |
| 9 | `$C5DE` mask `$0F` -> `$07` | 6 |
| 10 | `$C5EC` crater indexed by `$A9` not `$AA` | 7 |
| 11 | `$C5E7` hit counter 1 -> 2 | 7 |
| 12 | `$C5F4` type written pre-initialised (`$95`) | 1, 7, 12 |
| 13 | `$C5AF` sfx gate inverted | 8 |
| 14 | `$C5FE JMP $C4E4` dropped | 9 |
| 15 | `$C486`'s fall-through into `loc_C4E4` dropped | 10 |
| 16 | `$C4EE` anim `$58` -> `$57` | 9, 10 |
| 17 | `$C4E4` mask `$3F` -> `$1F` | 9, 10 |
| 18 | `case 0xB377` removed | 11, 12, 13 |
| 19 | `$B37A` BPL inverted | 12, 13 |
| 20 | `$B37C` -> the `$B1E5` chain (subY16, the rock rises) | 13 |
| 21 | **`$C603` -> `$C4F6` (the duplicate table)** | **NONE** |
| 22 | `$C486`'s tail dropped, vs **w25-volcano** | w25 #6 |
| 23 | scope guard `>= 3`, vs **stageledger** | stage 3 blocked (scope guard) |
| 24 | `case 0xC5AD` -> throw, vs **stageledger** | stage 3 blocked (arm) |
| 25 | `case 0xB377` removed, vs **stageledger** | stage 3 blocked (child) |

**Mutant 21 reddens nothing and provably cannot.** `$C601`-`$C632` and
`$C4F4`-`$C525` are the same 50 bytes; the ROM carries two copies. No test and
no cartridge run can tell which one the port reads (C12 above confirms it
against the board). The port reads the address the instruction names, and this
is the honest statement of why that is a transcription decision rather than a
verified one. W30 reported one such mutant out of 26; this wave has one out of
25 in the unit table and the same one out of 12 in the cartridge table.

Mutants 23-25 are the NEW ledger signals, and 25 is the one that changed the
design: it was green until the child scan was added.

## ONE EXISTING TEST HAD TO MOVE

`w25-volcano.test.js`'s `jt_$C439` check asserted that index 3 still throws with
`$C439[3] -> $C5AD`. It became false this wave, so index 3 moved out of the
`arms` throw-loop and into a positive assertion (type `$15`, y `$2C`). That is
the THIRD time this one check has had to step forward a stage -- W29 took index
1, W30 index 2. It is doing its job each time.

## WHAT I COULD NOT REACH

Stated as attempts, not absences.

- **A stage-4 (or stage-3) BOTH-SIDES scenario in the corpus.** Measured why,
  above: the endchain trajectory dies three times inside stage 2 at scroll
  `$03E8`-`$0463` and game-overs. What I tried: running that trajectory to
  26,000 frames instead of 12,000, which is the thing the inherited sentence
  implied would be enough. It is not -- the deaths are the wall, not the dump
  length. What would close it: a stage-2-surviving AND stage-3-surviving input
  script (the plan's W37 reaching-method generalisation). That is a search over
  button scripts. The intervention run above is the fallback, and it validates
  the CODE only.
- **`$C5AD` at any rank but the endchain's.** All 271 spawns are one run's
  rank. `$C5AD` reads no rank table (`$C936`-style) so I do not expect a rank
  dependence, and I did not find one in the listing -- but I did not measure a
  second rank either.
- **`$C601` vs `$C4F4`** -- mutant 21 / C12. Undecidable by any experiment.
- **`$A4A6`, `$C653`, `$C6DE`** are DELIBERATELY still loud named throws
  (stages 5 and 6, W32/W33). `$A4A6` scans `$0600`, which this port does not
  have.
- **`$C686`/`$C653`/`$C6DE`'s late-spawner children.** The ledger's new child
  scan returns None for all three because they do not name their type as an
  immediate. I did not chase the table-driven ones; `$C686`'s is `$C6CC,$3A`
  and would need the `$3A` value to resolve, which is a run-time quantity.
  Documented in the tool rather than guessed.

## THE DONE-WHEN, AS A MEASUREMENT

`python games/gradius/tools/oracle/stageledger.py`:

```
stage  distinct  ported   unported  inline5  ported %     first unported
3      98        98       0         0        100.0        NONE (shipped)

PER-STAGE RUNNABILITY
3      admitted               $C5AD +$B377 ported          RUNNABLE
```

Stage `$19 = 3` -- in-game stage 4 -- is 98 of 98 distinct records dispatchable
(unchanged; W30 did that), **and RUNNABLE, which it was not at the top of this
file.**

`node games/gradius/tools/test-all.mjs`: **GREEN -- 11 passed, 0 failed, 0
SKIPPED.** Read the skip count honestly: `compare.mjs` reports "6 fields SKIPPED
(pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)" INSIDE its own
run. Those are per-FIELD skips that predate this wave -- emulator-side
quantities with no port counterpart, declared in `porttrace.mjs`. **The
gate-level skip count is zero.**

Unit tests: **525 pass, 0 fail, 0 skipped** (512 before, +13 W31 checks).
Corpus: **47 scenarios, 29,657 of 29,657 frames, 0 failures**, all 7 deliberate
self-check breaks red. That number is load-bearing this wave for one reason: the
`loc_C4E4` extraction refactored shipped stage-1 code, and the endchain's 1,280
frames of `$82` eruption are what say it was behaviour-preserving.

### Coverage, in branches and table entries rather than frames

- **`$AE1C` dispatch: 29 of 42 entries ported** (28 before), 26 distinct
  routines. Still throwing: 13 entries / 8 distinct (`$CA5E`, `$B480`,
  `$B4F2`, `$B559`, `$B569`, `$AF10` x6, `$BB0F`).
- **`jt_$C439` late spawner: 5 of 7 arms** run (`$C486` `$C546` `$C686` `$C5AD`
  + `$C429`'s RTS). Two throw: `$C653` (stage 5), `$C6DE` (stage 6).
- **Wave records: 526 of 598** dispatchable -- UNCHANGED by this wave, which is
  the whole point of the runnability column.
- **Stages RUNNABLE: 4 of 7** (`$19` 0,1,2,3). Was 3 of 7.
- **`$C603` descriptor rows: 16 of 16** exercised against the cartridge.
- **`$C5D4`'s two ramp arms: 2 of 2**, and `$C601`'s two craters: 2 of 2, both
  against the cartridge.
- **`$C5DE` jitter: 4 of 4 REACHABLE values** (0/4/8/12; the other twelve are
  unreachable through `$C415`'s `AND #$03`).
- **`$B377`: 2 of 2 branches** (the init arm and the `$B1FA` arc), both by unit
  test; the init arm additionally 271 times on the board.

## THE HYPOTHESIS

The brief said to treat "nearly free" as a hypothesis. **It half held.**

FREE, and the plan was right: stage 4's 98 wave records needed nothing --
`$B402`/`$B434` came from W30, and no exporter change was required (W21's
speculative block list had already shipped `approachStage3`).

NOT FREE, and the plan's own evidence was the misleading part: the 98/98 the
plan cites as proof is a number that **cannot move**, and it was hiding a scope
guard, a throwing late-spawner arm and a throwing handler. The port is ~110
lines; the honest cost of the wave was the reaching investigation and the
ledger, not the transcription. And `$C5AD` is NOT the copy of `$C486` the word
"free" invites -- three fields differ, one of them (the `$69 < $0A` arm) moves
only 8 of 271 spawns.
