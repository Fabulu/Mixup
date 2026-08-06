# Wave 34 IMPLEMENTER - the six shipped crashes, and the detector in the gate

status: DONE
implementer, 2026-08-04

Brief: W33's QA sweep (`33-qa-shipped-throws.md`) found six crashes live on the
public site (build 20260804095843). This wave fixes them and puts the check that
found them into `games/gradius/tools/test-all.mjs` as a named gate stage.

---

## HEADLINE, written early so an interrupted run still says something

1. **ALL FIVE REVERTIBLE CRASHES ARE FIXED** - `$B415`, `$C2DC`, `$C13D`,
   `$C159`, and `$BC44` was already W32c's. `$CC23`/`$CC2B` is §6 and it is
   NOT reachable on any stage this port ships -- settled statically, not by
   failing to reach it.
2. **THE DETECTOR IS IN THE GATE**, `stagesweep.mjs`, 80 chunk runs / 112,000
   `nmi()` frames / **2.7 s**, and it is DEMONSTRATED to catch all five when
   they are reverted, on a copy, with the real tree hashed either side.
3. **`stageledger.py`'s column says ADMITTED now**, with two lines under the
   table saying what it does not mean and naming the stage that answers the
   other question.
4. **`$B415` IS A CARTRIDGE OVERRUN AND IT IS PROVEN FROM THE LISTING** - no
   emulator - and the same arithmetic *reproduces W12's 27,400-frame cartridge
   measurement of `$B1C5`* stopping at Y = 4. §1 is the interesting part of
   this wave.
5. **TWO FIXTURES FOR THE GATE STAGE EACH LOOKED CORRECT AND EACH MISSED ONE OF
   THE TWO PICKUPS.** §4c. That is why the demonstration is the deliverable and
   not the fix.

```
node --test games/gradius/tests/     584 pass, 0 fail, 0 skipped  (566 before)
node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
node games/gradius/tools/oracle/stagesweep.mjs   OK -- 0 undecided throws
```

---

## BASELINE, MEASURED BEFORE ANY EDIT

`node --test games/gradius/tests/` → **566 pass, 0 fail, 0 skipped**.
`node games/gradius/tools/test-all.mjs` → **GREEN, 11 passed, 0 SKIPPED**.

W33's sweep reproduced, unmodified tree, my own harness:

```
PASSIVE (no input, no forced state, camera 2 px/frame, 1400 frames):
  stage $19=2 chunk 0 : THROW @f314   $B434 is not in any exported range
  stage $19=2 chunk 7 : THROW @f314   (same -- chunk 7's pointer $AAEC IS
  stage $19=3 chunk 0 : THROW @f314    stage 4 chunk 0's)
PLAYING (alive, shield $FF, A held):
  stage $19=1 chunks 0-7 : THROW @f532..f540  $C2DC breakable wall  (8 of 8)
```

---

## §1. `$B415` - THE OVERRUN IS THE CARTRIDGE'S, AND THE LISTING PROVES IT

W33 left this **UNRESOLVED**: *"either the port's transcription lets the enemy
live one arc longer than the cartridge's (a movement bug), or the cartridge
really does read `$B434`. The measurement that settles it is the one `$B1C5`
already has - an exec hook on `$B415` reading Y."*

**It is settled without the emulator, by arithmetic on bytes in `rip/prg.asm`.**

An arc of entry 13 / entry 14:

* `$B212` seeds `$048C` (accel) = `$20` and `$03BC` (yvel) = 2;
* `$B120` subtracts `$20/256` of velocity a frame, so an integer step is 8
  frames, and `$B422 CMP #$FE` flips the arc at yvel = −3;
* 1 + 4×8 = **33 moving frames**, plus the one frame that INCs `$04AC` and does
  not move → a 34-frame arc;
* `$B1BC` re-seeds xvel to `$FE` every arc, so an arc is **66 px**.

The schedule at `$B42F` is `00 00 00 01 01`, and `$B1DA` reads it as
`LDA $046C,X / BNE $B1E5`: 0 → `$B154` addX16 (x += `$FE`, **LEFT**), non-zero →
`$B184` subX16 (**RIGHT**). So **LEFT LEFT LEFT RIGHT RIGHT** and the net over
the whole schedule is **one arc LEFT = 66 px**. An enemy spawning at the right
edge (`$F0`) is at `$AE` when the fifth entry has been consumed - **on screen**,
`$B251`'s box is `[4, $F4)` - and `$B426` makes `$04AC` = 5. **The sixth read is
unavoidable.**

### The check on that reasoning, and it is the good part

The same arithmetic applied to `$B198`, the handler the port DOES guard:
`$B200` = `00 00 01 00 00` is **four left and one right**, `$B1AA` seeds yvel 3
with the flip at −4, so its arc is 49 moving frames = **98 px** and the net is
**three arcs left = 294 px**. From `$F0` that leaves the box **during arc 4**.

W12 put an exec hook on `$B1C5` on the cartridge and measured, over 27,400
frames, 2,439 executions with Y taking 0, 1, 2, 3, 4 and **never 5**.

**The derivation predicts W12's number, from the tables, with no emulator.**
Same routine shape, opposite outcome, and the difference is two table bytes.
That is what turns "the port might be wrong" into "the ROM reads its own code".

### How far Y can go

Past the schedule the bytes are `$B434` = `BD 0C 03` (`st_B434`'s own
`LDA $030C,X`) and `$B461` = `BD 4C 04` (the orphan at `$B461`). **All
non-zero**, so every overrun entry means RIGHT. Reaching Y = 5 at all requires
the spawn x ≥ 202 (three left arcs of 66 px must not leave the box), so x ≥ 136
when the schedule ends; each further arc adds 66 against a free at 244.
136 + 66 = 202 (survives, Y = 6); 136 + 132 = 268 (freed). **Y CANNOT EXCEED 6.**

MEASURED in the port after the fix: `$04AC` reaches **5**, and `$046C` holds
`$BD` - the byte at `$B434` - on 400-frame passive runs of stage 3 chunk 0.
Inside the bound, and the read demonstrably happens.

### The fix, and why it is not "widening a range"

`phaseB42F` → `$B42F-$B436`, `phaseB45C` → `$B45C-$B463` (seven entries plus one
byte of anchor alignment each). **Both anchors are real instruction boundaries
and `export_assets.py` checks the bytes at them** - `$B437` is `10 CE`
(`BPL $B407`) and `$B464` is `38 FD 8C 04` (`SEC / SBC $048C,X`). `arcTurn()`
throws at Y ≥ 7 naming `$B415`/`$B43C` and the derivation, so a wrong index is
still loud and no longer arrives as `assets.js`'s "not in any exported range",
whose message told the reader to go and edit `export_assets.py` - the wrong file
for a read the ROM makes on purpose.

---

## §2. `$C2DC` - THE BREAKABLE WALL

227 field-2 cells across 42 of stage 2's 83 placed blocks (W33's count) against
**zero** on stage 1 - which is the whole reason "`$C2DC` ran 0 times in every
measured run" was true and meaningless.

Ported: `$C32F-$C39A` (the sfx fork, the five-byte `$0700` packet, the `$0500`
map patch) and `$C2DF-$C2E6` (a shot and a missile are consumed, a **LASER goes
through its own hole**).

**The address arithmetic reduces.** `$C353-$C36B` spells out
`ntBase + (tileRow >> 2)*128 + $A3*32 + column`, and since `$A3` is `tileRow & 3`
that is `ntBase + tileRow*32 + column` - ONE nametable tile, blanked to `$00`.
The check derives it the second way, so the two cannot agree through the same
shifts.

**`$A0`-`$A3` are real port state now.** `$C3D3` keeps a 16-bit map pointer,
the byte it read and the sub-cell index in zero page ACROSS the `JSR`, and
`$C396 STA ($A0,X)` with X = 0 writes back through that very pointer. `$A3` is
written twice and the second write is CONDITIONAL - `$C400 BEQ $C40E` leaves
before `$C406`'s mask - so after a probe that found nothing `$A3` holds the
unmasked row. Reproduced literally.

**DEAD CODE, and it is a ROM bug.** `$C331 CMP #$04` compares the ACCUMULATOR.
`sub_C32F`'s only xref is `$C2DC`, reached only through `$C2D8 CMP #$02 / BNE`,
so A is 2 on every entry and the `BNE` is always taken; `$C335 LDA #$00 / RTS`
cannot run. Two instructions later the ROM writes `CPX #$05` for the same kind
of test, so `$C331` is almost certainly a `CPX #$04` that was typed `CMP #$04`
- stage 5 is the stage with no collision map, and `$C2AB CMP #$04 / RTS` already
keeps it out one level up. Transcribed as a comment, not as behaviour.

`$C39B`/`$C39F` exported (`collision/tables.json`, anchored on `$C3A3 LDA
$0320`). Both are pure arithmetic on `$A3` - `~(3 << 2k)` and `k * $20` - and
are exported as bytes anyway so the port cannot become its own source of truth.

### A test that got stronger by losing its throw

`collision-unwitnessed.test.js` used `$C2DC`'s throw to prove `$C2C4` counts
DOWN (slot 8 before slot 3). Two shots at one cell now prove **the wall went
away between the two probes**: slot 8 breaks it and is consumed, slot 3 finds a
0 and flies on. A throw only ever proved which call happened first.

---

## §3. `$C13D` / `$C159` - THE 1UP AND THE BONUS

Both throws said *"no measured run has spawned type `$27`/`$29`"* - true, and a
fact about the corpus read back as a claim about the cartridge. The ROM listed
both records on day one.

```
$C13D  X = $18 * 4; bit 0 of $07E5,X must be CLEAR -- the same score test
       $AF70 uses for the warp counter, NOT $CE89's nibble mask. Then
       type := 1, metasprite $A3, and INC $20,X: AN EXTRA LIFE.
       The odd arm is a plain "next slot": nothing is consumed, so the next
       frame tries again with whatever the score is by then.
$C159  no gate at all. type := 1, metasprite $A1, JSR $844B = +$000500.
$C166  both fall into LDA #$36 / JSR $EC1E and JMP $C136.
```

Neither arm frees the slot. The object stays where it is as type 1 with a new
metasprite - which is what draws the legend - and since type 1 with bit 7 clear
is "not initialised", `$AE1C` entry 1 runs its own init next frame and a SECOND
touch falls into the capsule / every-enemy arms instead. All of that is the
ROM's.

`INC $20,X` has no ceiling: `$88BF` draws `$20,X` and `$979F DEC / $97C1 BMI` is
the death path, so ten lives is `$0A` and nothing clamps it. Literal.

---

## §4. THE GATE STAGE

`games/gradius/tools/oracle/stagesweep.mjs`, wired into `test-all.mjs` as
**"every stage survives its own chunks"**.

For every stage the `$A2F0` guard admits (the bound is parsed LIVE out of
`src/enemies.js`, the same parse `stageledger.py` does, and it is a hard error
if the guard is present and unparseable) and every one of its eight chunk
streams, seed on the chunk's own stream pointer, step the camera 2 px a frame,
run `nmi()`. **Require zero throws.**

```
80 chunk runs, 112,000 nmi() frames, 2.7 s
```

### 4a. Two modes, and one of them is an intervention

* **PASSIVE** - no buttons, no forced state, nothing touched but the camera.
* **PLAYING** - `$0100` forced alive, `$46` = `$FF`, `$41` = 1, A held one frame
  in three, and the stick CHASING the nearest live enemy. Off-distribution by
  construction and labelled as a COVERAGE intervention at the function
  (`docs/knowledge/09`).

### 4b. Decided boundaries are counted, not swallowed

`$9751`/`$970D`/`$9721`/`$9B10` - the mode-0 restart-to-title the owner has
already decided is out of scope - are matched on the ROM address their message
leads with, **counted and printed on their own line**, and not failed on. At
2000 frames per chunk, **32 of 80 runs reach `$9751`** (earliest f1477) and
every frame before it is swept evidence. Anything whose message does not lead
with a decided address FAILS, which is the right default: `assets.js`'s "not in
any exported range" reads like an asset problem and was two of the six.

### 4c. THE DEMONSTRATION, and the two fixtures that were wrong first

On a COPY at `C:/tmp/w34demo` (`games/gradius/{src,tests,assets,tools}` plus the
repo `package.json`), each fix reverted in turn and the gate stage re-run:

| revert | verdict | runs that threw |
|---|---|---|
| #1 `$B415` 5-entry overrun (W30 state: `rom.read` + a 5-byte export) | **RED** | 3 / 80 |
| #2 `$C2DC` breakable wall (W29 state: a loud throw) | **RED** | 8 / 80 |
| #3a `$C13D` type `$27` touches the ship | **RED** | 9 / 80 |
| #3b `$C159` type `$29` touches the ship | **RED** | 5 / 80 |
| #5 `$BC44` skip arm (pre-W32c state) | **RED** | 48 / 80 |
| | **survivors: none** | |

The copy's three touched files hash identical before and after all five
(`enemies.js 184a67403b0a`, `collision.js 79a0c02c68fe`,
`tables.json 221da5aa4bef`). The copy is deleted.

**The real tree, `sha256` over `sha256sum` of every `.js` under
`games/gradius/{src,tests}`, sorted:**

```
BEFORE  13b5d35f05fb4160357ea945dbbb034570f68ffa236c0152fdec57287d10dddb
AFTER   13b5d35f05fb4160357ea945dbbb034570f68ffa236c0152fdec57287d10dddb
```

`git status --porcelain games/gradius/src games/gradius/tests` is empty.

**AND THE PART WORTH READING.** Two PLAYING fixtures were run before the chase,
and each one caught exactly one of the two pickups:

* **left/right only** - the ship sits at the boot y of `$60` all run and never
  meets a type `$29`, which spawns at y `$24`/`$A4`/`$BA`/`$BD`. This is exactly
  why W33 wrote "I could NOT reach `$C159`'s spawn": the type DOES spawn (464
  frames of it on stage 1 chunk 3, counted this session), the ship was never in
  the row. #3a red, **#3b green**.
* **a lissajous sweep** (60-frame horizontal against 200-frame vertical) -
  reaches those rows and then MISSES the type `$27` at y `$60`, because contact
  needs x AND y inside one 16×16 box on the same frame. #3b red, **#3a green**.

A fixture that steers by the clock catches whichever pickup its trajectory
happens to cross. **Chasing stops the check depending on that**, and it is the
only reason the survivor count is zero. Recorded because both wrong fixtures
produced a green run that looked exactly like the right one.

### 4d. What the stage does NOT prove

Nothing about correctness. A stage can sweep clean and be wrong on every pixel.
It asserts one thing - no throw - so it cannot invent a denominator, and a throw
in this port is a first divergence with a ROM address on it. `compare.mjs` is
the correctness gate.

---

## §5. `stageledger.py`'s COLUMN

It printed **RUNNABLE** for a verdict computed from two source-text predicates
in one file: the integer in `runEngine`'s `if (stageIndex >= N)`, and whether a
`jt_$C439` case body contains `return` and not `throw`. It never runs a frame
and never opens `collision.js`, where four of the six crashes live.

It says **ADMITTED** now, the baseline key is `admitted`, and two lines under
the table say what it does not mean and name the gate stage that answers the
other question:

```
ADMITTED means the two static gates are open. It does NOT mean the
stage plays: this tool runs no frames and reads only enemies.js.
WHETHER A STAGE SURVIVES ITS OWN CHUNKS IS A DIFFERENT QUESTION:
  node games/gradius/tools/oracle/stagesweep.mjs   (gate stage, ~3 s)
```

---

## §6. `$CC33`'s FOUR INDEXED READS - THREE UNBOUNDED, NONE REACHABLE HERE

W33 §5b found two and could not settle reachability. There are **three**, and
the third is worse because it is SILENT.

```
$CC63 LDA $CC1F,Y   TWO entries, Y = the SHAPE
$CC68 LDA $CC21,Y   TWO entries, Y = the SHAPE
$CC7C LDA $CC23,Y   EIGHT, Y = $9A = 4 * $0460[owner] + shape
$CC85 LDA $CC2B,Y   EIGHT, same index
```

A shape of 2 reads `$CC21`'s bytes through the first two tables and gets **no
throw at all**, because `armShapeParams` is exported as one 20-byte run: the
read stays inside the block and returns a plausible number.

**SETTLED, statically.** shape = (a nibble of the record's `$65` byte) − 1
(`$A500-$A509` is the only writer of `$0601`; `$A4CD` shifts `$65` down four
bits per arm). Every inline-5 record enumerated through
`wavecensus.decode_inline5`, so the 5-byte stride is the ROM's:

| `$19` | inline-5 records | `$65` bytes | shapes |
|---|---|---|---|
| 2 | 45 | - | route to `$A46F` (the moai); `$0601` never written |
| 4 | 4 | `$01 $02 $12 $21` | **0 or 1** |
| 6 | 10 | `$06 $07 $20 $85 $9A $A2 $A9 $C9 $F0` | **up to 14** |
| others | 0 | - | - |

Box class: every immediate write of `$0460` counted - 0 at `$A52E`/`$A569`/
`$CA8C`, 1 at `$A4FC`/`$AF35`/`$B7AA`/`$C6AE`, 3 at `$B927` (the boss).
**Nothing writes 2**, so W33's captured `$9A` = 9 cannot be "class 2, shape 1";
9 is class 1 with shape 5, i.e. a `$65` nibble of 6, which no shipped stage has.

So on `$19` = 0..4 the index is 4 or 5 (or 0/1 once `$CA8C` deploys the owner)
and the tables are **not** overrun. **What can overrun is stage 7**, behind the
`$A2F0` guard. A TRIPWIRE for the wave that lands it, not a fix for a live
crash - and a named throw carrying the derivation instead of `assets.js`'s "not
in any exported range" for two of the reads and *nothing at all* for the other
two. **Not a clamp:** what the cartridge does with a shape of 14 is unknown and
this port does not guess.

---

## §7. `tablecoverage.py` - EXTENTS, AND A FOURTH SITE

W33 §8b: it checks BASES, never EXTENTS. Bounding an index register needs
dataflow the tool has not got. What it *can* do completely is enumerate the
shape both overruns had - `LDY <ram>,X` immediately followed by
`LDA <table>,Y` - and report the exported extent and the INCs that write that
RAM byte. Each site must be accounted for by hand in `COUNTER_INDEXED`; an
unaccounted site FAILS.

```
$B1C5 -> $B200   5 entries   GUARDED (W12's cartridge hook, re-derived in §1)
$B415 -> $B42F   8 entries   GUARDED (W34)
$B43C -> $B45C   8 entries   GUARDED (W34)
$B7B5 -> $B797               OPEN -- NEW THIS WAVE
```

**`$B7B5` is a fourth site of the same class and nobody had looked at it.**
`$B797` is **two** entries (`3F 40`, closed/open) inside a 26-byte export, so a
Y of 2 reads `$B799`'s rank row and returns a plausible metasprite id with no
throw from anywhere - the quiet form of the defect. What is measured: entry 23
(`$B7A1`) never writes `$048C` itself, `$A569`'s slot clear zeroes it, and the
INCs the scan pairs it with (`$B0E2`/`$B0E5`) are `loc_B0BE`'s four-phase state
machine on a different object. So Y is **probably** always 0 - and "probably"
is the word this project has been wrong with before. **Handed forward.**

THE PAIRING IS BY RAM ADDRESS AND OVER-REPORTS, said in the code rather than
tuned away: `$04AC` is INCd by six handlers, each on its own object, so "INC
candidates" is a list of suspects and not a proof.

Seen to fail: removing `$B415` from `COUNTER_INDEXED` prints
`*** $B415 ... is not in COUNTER_INDEXED` and FAILs. Restored;
`sha256 be78833f80b2` either side.

---

## §8. THE MUTATION TABLE - 22 MUTANTS, 21 RED, 1 SURVIVOR

Harness `scratchpad/w34/mut.py`, on a COPY at `C:/tmp/w34mut`
(`games/gradius/{src,tests,assets,tools,index.html,game.json}` plus the repo
`package.json`; the copy baselines at **582 pass / 0 fail / 0 skipped**, and it
needs `index.html`/`game.json` or the 14-check touch-pad suite fails for a
copy-environment reason). It patches source as BYTES and normalises the NEEDLE
to each file's line endings. All three files hash identical before and after
all 22: `enemies.js 49b04262d3ba`, `collision.js 79a0c02c68fe`,
`terrain.js 6a5da1f45879`.

| # | mutant | red |
|---|---|---|
| M1 | `arcTurn` bound 7 → 5 (the W30 crash) | 2 |
| M2 | `arcTurn` bound 7 → 99 (no guard at all) | **1, after §8a** |
| M3 | `h_B402` reads entry 14's table | **1, after §8a** |
| M4 | `loc_B1DA`'s direction inverted | 4 |
| M5 | `$B212` seeds yvel 3, not 2 | 4 |
| M6 | `$C145`'s score gate inverted | 3 |
| M7 | `$C154 INC $20,X` removed | 2 |
| M8 | `$C14D` metasprite `$A3` → `$A1` | 2 |
| M9 | `$C163` pays `$8453` (+1), not `$844B` (+5) | 1 |
| M10 | `$C15E` metasprite `$A1` → `$A3` | 1 |
| M11 | `$C173`/`$C177` moved BELOW the `>= 3` arm | 4 |
| M12 | `$C398`'s map write dropped | 3 |
| M13 | `$C391` masks with row 0 whatever `$A3` | 1 |
| M14 | `$C36D`'s queue packet dropped | 1 |
| M15 | `$C33A`'s stage fork dropped (always `$03`) | 1 |
| M16 | `$C349`'s nametable always `$2000` | 1 |
| M17 | `$C2E1`'s laser test dropped | 1 |
| M18 | `$C2E4`'s laser test inverted | 2 |
| M19 | `$C3F1` stores `$A3` MASKED (the `$C400` exit forgotten) | ***SURVIVED*** |
| M20 | `armTableGuard`'s shape bound 2 → 99 | 1 |
| M21 | `armTableGuard`'s `$9A` bound 8 → 99 | 1 |
| M22 | `$C396` writes the wrong map page | **1, after §8a** |

### 8a. THREE SURVIVORS ON THE FIRST RUN, ALL THREE DEFECTIVE CHECKS

Recorded rather than quietly fixed, because the green run before the fix was
worthless and looked identical to the green run after it.

* **M2 survived.** No driven run reaches Y = 7, so every end-to-end check stays
  green with `arcTurn`'s upper guard removed entirely. A guard whose absence is
  invisible is a guard a future tidy-up deletes - the same finding W32c made
  about `$C037`'s gate.
* **M3 survived, and it is the more interesting one.** `$B42F` and `$B45C` are
  **byte-identical for Y = 0..5** (both `$B434` and `$B461` are `$BD`), so
  swapping which one entry 13 reads is invisible until **Y = 6** - and the
  driven run stops at 5. It looked like W31's M21 ("two byte-identical regions,
  provably uncatchable") and it is not: the two tables DIVERGE at entry 6
  (`$0C` against `$4C`), so a fixture that forces `$04AC` = 6 catches it.
* **M22 survived, and it is `docs/knowledge/03`'s named shape.** Every
  breakable-wall check used map page `$05`, where `($A1 - 5) << 8` is zero - so
  the PAGE half of `$C396 STA ($A0,X)`'s pointer was completely unguarded while
  four checks agreed with each other about the offset.

Closed by two new checks (18 in the file now): one forcing `$04AC` to 6 and 7
through `updateEnemies()`, one on a page-`$06` fixture asserting both that the
`$0600` cell is cleared and that the same offset on page `$05` is NOT.

### 8b. THE ONE THAT IS UNCATCHABLE, AND WHY

**M19: storing `$A3` already masked at `$C3F1` reddens nothing.** That is a
fact about the ROM, settled by the listing rather than by trying harder.
**Thirteen instructions in the whole PRG touch `$A3`** - counted out of
`rip/prg.asm` this session: writers `$9E7B`, `$B897`, `$C000`, `$C3F1`,
`$C406`; readers `$B8B9`, `$BF1D`, `$BF8C`, `$C01C`, `$C2CF`, `$C366`, `$C38F`,
`$C402`. On the path where `$C400 BEQ $C40E` leaves before `$C406`'s mask, the
unmasked row is read by NOBODY: `$C2CF`, `$C366` and `$C38F` are all on the
non-zero arm, `$C402` re-reads and re-writes it, and `$C000`/`$B897` overwrite
it before `$C01C`/`$BF1D`/`$BF8C`/`$B8B9` look. **The store has no observable
consequence**; it is transcribed because that is what the ROM does. Same
category as W32c's M34.

---

## §9. WHAT I COULD NOT REACH - attempts, not absences

* **ANY CARTRIDGE COMPARISON OF ANYTHING IN THIS WAVE.** Unchanged from W32b,
  W32c and W33, and still the biggest gap. Every number here is port-vs-listing.
  `$B415`'s derivation *predicts* a cartridge measurement W12 already made, and
  that is the strongest evidence in the wave, but it is not a new measurement.
  W32c §10's handover stands: `tools/oracle/b559poke.py` at f1400 is the
  nearly-free next step.
* **`$B7B5`/`$B797`.** §7. Found, not settled.
* **Whether `$04AC` reaches 6 in play.** The listing bounds it at 6; the port
  reaches **5** on every chunk I drove, and the enemy is freed during arc 5. The
  `$B415`/`$B43C` Y = 6 read is exercised only by the forced fixture.
* **`$C2DC` against the cartridge's own VRAM.** The port queues one packet and
  the check derives its address independently, but nobody has watched stage 2's
  wall disappear on the board.
* **The `$C331` dead arm.** Argued from the single xref; not proven against an
  indirect `JMP` (I did not scan for a computed jump into `$C32F`).
* **`$9721`/`$9B10`.** Still need the pause-screen button code; the sweep does
  not drive one.
* **`$C85D`** (the moai's `STA ($9A),Y` leaving `$0500-$06FF`). Unchanged from
  W33: 45 type-`$16` records on stage 3 and the tripwire never tripped.

---

## §10. OPEN ITEMS HANDED FORWARD

1. **`$B7B5 LDA $B797,Y`** - a two-entry table indexed by `$048C`, inside a
   26-byte export, so an overrun is SILENT. §7. Printed by `tablecoverage.py`
   on every run until somebody settles it.
2. **The stage-5 cartridge comparison** (W32c §11 item 1), unchanged and still
   the highest-value unclaimed work.
3. **`$9751` is a crash a real player reaches on every stage.** The sweep counts
   32 of 80 runs ending there at 2000 frames. It is the `$80D4` game-modes item
   (1 of 7) and it is decided, not defective - but it is the most likely thing
   for a player to hit.
4. **`stagewaves.py` is still broken on the inline-5 stride** (W32c item 4,
   untouched again). `wavecensus.py`'s `stream()` has the right stride and this
   wave used it; `stagewaves.py` does not.
5. **`wavecensus.py` and `handlerclosure.py` are still not CI-wired** (W32c
   item 5, untouched).
6. **The gate stage's frame budget is 1400 per chunk and that is W33's number,
   not a derived one.** At 2000 the decided `$9751` boundary starts appearing;
   beyond that nobody has looked.

---

## FINAL NUMBERS

```
node --test games/gradius/tests/        584 pass, 0 fail, 0 skipped   (566 before)
node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
stagesweep.mjs                          80 chunk runs, 112,000 frames, ~2.7 s, 0 throws
tablecoverage.py                        OK, 81 bases, 54 ranges, 4 extent sites (1 OPEN)
stageledger.py                          OK, no stage moved backward
```

18 new checks in `tests/w34-shipped-crashes.test.js`, one rewritten in
`tests/collision-unwitnessed.test.js`. 22 mutants, 21 red, 1 provably
uncatchable and reported as such.

status: DONE
