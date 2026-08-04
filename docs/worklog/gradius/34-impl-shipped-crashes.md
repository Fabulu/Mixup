# Wave 34 IMPLEMENTER — the six shipped crashes, and the detector in the gate

status: IN PROGRESS
implementer, 2026-08-04

Brief: W33's QA sweep (`33-qa-shipped-throws.md`) found six crashes live on the
public site (build 20260804095843). This wave fixes them and puts the check that
found them into `games/gradius/tools/test-all.mjs` as a named gate stage.

---

## HEADLINE, written early so an interrupted run still says something

1. **ALL FIVE REVERTIBLE CRASHES ARE FIXED** — `$B415`, `$C2DC`, `$C13D`,
   `$C159`, and `$BC44` was already W32c's. `$CC23`/`$CC2B` is §5.
2. **THE DETECTOR IS IN THE GATE**, `stagesweep.mjs`, 80 chunk runs / 112,000
   `nmi()` frames / **2.7 s**, and it is DEMONSTRATED to catch all five when
   they are reverted, on a copy, with the real tree hashed either side.
3. **`stageledger.py`'s column says ADMITTED now**, with two lines under the
   table saying what it does not mean and naming the stage that answers the
   other question.
4. **`$B415` IS A CARTRIDGE OVERRUN AND IT IS PROVEN FROM THE LISTING** — no
   emulator — and the same arithmetic *reproduces W12's 27,400-frame cartridge
   measurement of `$B1C5`* stopping at Y = 4. §1 is the interesting part of
   this wave.
5. **TWO FIXTURES FOR THE GATE STAGE EACH LOOKED CORRECT AND EACH MISSED ONE OF
   THE TWO PICKUPS.** §4c. That is why the demonstration is the deliverable and
   not the fix.

```
node --test games/gradius/tests/     579 pass, 0 fail, 0 skipped  (566 before)
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

## §1. `$B415` — THE OVERRUN IS THE CARTRIDGE'S, AND THE LISTING PROVES IT

W33 left this **UNRESOLVED**: *"either the port's transcription lets the enemy
live one arc longer than the cartridge's (a movement bug), or the cartridge
really does read `$B434`. The measurement that settles it is the one `$B1C5`
already has — an exec hook on `$B415` reading Y."*

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
edge (`$F0`) is at `$AE` when the fifth entry has been consumed — **on screen**,
`$B251`'s box is `[4, $F4)` — and `$B426` makes `$04AC` = 5. **The sixth read is
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
`$BD` — the byte at `$B434` — on 400-frame passive runs of stage 3 chunk 0.
Inside the bound, and the read demonstrably happens.

### The fix, and why it is not "widening a range"

`phaseB42F` → `$B42F-$B436`, `phaseB45C` → `$B45C-$B463` (seven entries plus one
byte of anchor alignment each). **Both anchors are real instruction boundaries
and `export_assets.py` checks the bytes at them** — `$B437` is `10 CE`
(`BPL $B407`) and `$B464` is `38 FD 8C 04` (`SEC / SBC $048C,X`). `arcTurn()`
throws at Y ≥ 7 naming `$B415`/`$B43C` and the derivation, so a wrong index is
still loud and no longer arrives as `assets.js`'s "not in any exported range",
whose message told the reader to go and edit `export_assets.py` — the wrong file
for a read the ROM makes on purpose.

---

## §2. `$C2DC` — THE BREAKABLE WALL

227 field-2 cells across 42 of stage 2's 83 placed blocks (W33's count) against
**zero** on stage 1 — which is the whole reason "`$C2DC` ran 0 times in every
measured run" was true and meaningless.

Ported: `$C32F-$C39A` (the sfx fork, the five-byte `$0700` packet, the `$0500`
map patch) and `$C2DF-$C2E6` (a shot and a missile are consumed, a **LASER goes
through its own hole**).

**The address arithmetic reduces.** `$C353-$C36B` spells out
`ntBase + (tileRow >> 2)*128 + $A3*32 + column`, and since `$A3` is `tileRow & 3`
that is `ntBase + tileRow*32 + column` — ONE nametable tile, blanked to `$00`.
The check derives it the second way, so the two cannot agree through the same
shifts.

**`$A0`-`$A3` are real port state now.** `$C3D3` keeps a 16-bit map pointer,
the byte it read and the sub-cell index in zero page ACROSS the `JSR`, and
`$C396 STA ($A0,X)` with X = 0 writes back through that very pointer. `$A3` is
written twice and the second write is CONDITIONAL — `$C400 BEQ $C40E` leaves
before `$C406`'s mask — so after a probe that found nothing `$A3` holds the
unmasked row. Reproduced literally.

**DEAD CODE, and it is a ROM bug.** `$C331 CMP #$04` compares the ACCUMULATOR.
`sub_C32F`'s only xref is `$C2DC`, reached only through `$C2D8 CMP #$02 / BNE`,
so A is 2 on every entry and the `BNE` is always taken; `$C335 LDA #$00 / RTS`
cannot run. Two instructions later the ROM writes `CPX #$05` for the same kind
of test, so `$C331` is almost certainly a `CPX #$04` that was typed `CMP #$04`
— stage 5 is the stage with no collision map, and `$C2AB CMP #$04 / RTS` already
keeps it out one level up. Transcribed as a comment, not as behaviour.

`$C39B`/`$C39F` exported (`collision/tables.json`, anchored on `$C3A3 LDA
$0320`). Both are pure arithmetic on `$A3` — `~(3 << 2k)` and `k * $20` — and
are exported as bytes anyway so the port cannot become its own source of truth.

### A test that got stronger by losing its throw

`collision-unwitnessed.test.js` used `$C2DC`'s throw to prove `$C2C4` counts
DOWN (slot 8 before slot 3). Two shots at one cell now prove **the wall went
away between the two probes**: slot 8 breaks it and is consumed, slot 3 finds a
0 and flies on. A throw only ever proved which call happened first.

---

## §3. `$C13D` / `$C159` — THE 1UP AND THE BONUS

Both throws said *"no measured run has spawned type `$27`/`$29`"* — true, and a
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
metasprite — which is what draws the legend — and since type 1 with bit 7 clear
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

* **PASSIVE** — no buttons, no forced state, nothing touched but the camera.
* **PLAYING** — `$0100` forced alive, `$46` = `$FF`, `$41` = 1, A held one frame
  in three, and the stick CHASING the nearest live enemy. Off-distribution by
  construction and labelled as a COVERAGE intervention at the function
  (`docs/knowledge/09`).

### 4b. Decided boundaries are counted, not swallowed

`$9751`/`$970D`/`$9721`/`$9B10` — the mode-0 restart-to-title the owner has
already decided is out of scope — are matched on the ROM address their message
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

* **left/right only** — the ship sits at the boot y of `$60` all run and never
  meets a type `$29`, which spawns at y `$24`/`$A4`/`$BA`/`$BD`. This is exactly
  why W33 wrote "I could NOT reach `$C159`'s spawn": the type DOES spawn (464
  frames of it on stage 1 chunk 3, counted this session), the ship was never in
  the row. #3a red, **#3b green**.
* **a lissajous sweep** (60-frame horizontal against 200-frame vertical) —
  reaches those rows and then MISSES the type `$27` at y `$60`, because contact
  needs x AND y inside one 16×16 box on the same frame. #3b red, **#3a green**.

A fixture that steers by the clock catches whichever pickup its trajectory
happens to cross. **Chasing stops the check depending on that**, and it is the
only reason the survivor count is zero. Recorded because both wrong fixtures
produced a green run that looked exactly like the right one.

### 4d. What the stage does NOT prove

Nothing about correctness. A stage can sweep clean and be wrong on every pixel.
It asserts one thing — no throw — so it cannot invent a denominator, and a throw
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

status: IN PROGRESS
