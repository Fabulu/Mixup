# Wave 42 IMPL - `$CA5E`, the 1/256 px borrow

status: DONE
impl, 2026-08-04

Scope: `games/gradius/` ONLY. `games/ddpdoj/` belongs to concurrent agents.

Task: fix the ONE known cartridge divergence in Gradius - W40 §5a, `$CA5E`
(dispatch entry 20, types `$14`/`$94`, stage 5's articulated-arm owner):
**237 field divergences of 207,606**, all `yf`/`y`, the port one LOW per frame.
W40 measured the obvious fix WRONG (PROBE-1: 237 -> 3,580, wrong the other way).

Reproducer, per W40 §7:
`node games/gradius/tools/oracle/stagecmp.mjs --tag s5-chunks --pipeline tail --only 14`

(notes appended as findings arrive)

---

## 1. REPRODUCED FIRST, ON AN UNTOUCHED TREE

`sha256 games/gradius/src/enemies.js = 89deb328...` (pre-edit)

```
node games/gradius/tools/oracle/stagecmp.mjs --tag s5-chunks --pipeline tail --only 14
  frames compared 3838   fields 21 -> 80,598
  FIELD DIVERGENCES 237      yf: 230   y: 7
  f3324 slot 7 type $94 yf: port $1F board $20   ... one LOW, every frame
```

W40's number is this tree's number.

---

## 2. WHAT THE CARTRIDGE ACTUALLY DOES WITH THE 1/256 px

`$CAE9 SBC $CA57,Y` and `$CB03 ADC $CA57,Y` have **no `SEC`/`CLC`**. Between the
last carry writer and the arithmetic sit only `$CADC DEC` / `$CADF LDY` /
`$CAE1 LDA` / `$CAE4 BNE` / `$CAE6 LDA`, none of which touch carry. So the flag
is decided **before `$CADC`**, and the listing gives exactly THREE ways in:

| path | condition | last carry writer | C |
|---|---|---|---|
| **A1** | `$04AC,X != 0` and `$016C,X != 0` | `$CAAF CMP $99`, `$CAB1 BCS` NOT taken | **0** |
| **A2** | `$04AC,X != 0` and `$016C,X == 0` -> **`$CAB8 JSR $AEE1` runs** | inside `$AEE1` | **1** |
| **B**  | `$04AC,X == 0`, `$CACD`-`$CAD9` runs | `$CAD2 CMP $0320` | `$032C,X >= $0320` |

The port modelled A1 and B and **had no model of A2 at all** - `carry` kept its
initialiser of 0 across the `JSR`. That is the whole defect. 1/256 px per frame
on 243 of 3,826 frames.

### Why A2 is C = 1, PROVED FROM THE LISTING, NOT OBSERVED

`$AEE1` has three exits, all at `$AF09 RTS`:

```
AEE7 SBC #$80 / AEEC BCS $AF09        -> C = 1
AEF1 CMP #$08 / AEF6 BCS $AF09        -> C = 1
AEF6 not taken -> falls into $AEF8    -> C = 0
```

The third leaves C = 0 - **and it is unreachable at `$CAE9`.** `$AEF8` writes
`$012C,X := 0` (`$AF00`), and the very next thing `$CAB8` does is
`$CABB LDA $012C,X / $CABE BNE $CAC1`, which is then NOT taken, so `$CAC0 RTS`
returns before any arithmetic. Nothing in `$AEF8`-`$AF06` is other than
`LDA`/`STA`, so no later instruction re-writes the flag.

**So on every path that reaches `$CAE9` through `$CAB8`, C = 1.** That is why
W40's PROBE-1 (initialiser := 1 unconditionally) measured WRONG in the other
direction - it made A2 right and A1 wrong, and A1 is 3,269 of the frames:
237 -> 3,580 is 3,269 A1 frames plus clamp/spawn edges, not a tuning failure.

### AND IT WAS MEASURED, FROM THE SAME BOARD FILM

Carry recovered independently of the port, from the cartridge's own RAM film:
`C = (16-bit ($032C,$034C) delta) -/+ $CA57[$17]`, clamped frames excluded,
path classified from the PREVIOUS frame's `$04AC,X`/`$016C,X`:

```
A1 up   1390 frames  C=0      A1 down 1879  C=0
A2 up    173 frames  C=1      A2 down   70  C=1     <- the 237
B  up     20 frames  C=1      B  down   24  C=0
```

The listing's table and the board's histogram are the same table. **No constant
was adjusted; the carry is now transcribed, and it came out at 0 on the first
run after the edit.**

### THE BRIEF'S PREMISE, CHECKED

Mostly right, one correction. The wrong *arithmetic* is in `$CA5E`, but the
missing *information* was in `h_AEE1`, which the port wrote as returning
nothing. The fix therefore makes `h_AEE1` return its RTS carry (derived at each
of its three exits) and `$CA5E` consume it - rather than hardcoding a 1 at
`$CAB8`, which would have been the same number with none of the proof.
`$AEE1` has exactly three `JSR` sites in the 32 KB (`$B4C8`, `$CAB8`, `$CB17`);
`$B4C8` is followed by `DEC $04CC,X` and `$CB17` by `RTS`, so **`$CAB8` is the
only carry consumer** and no other handler is affected. `$AEDD` FALLS THROUGH
into `$AEE1` when `$5B == 0` (already modelled in `h_AEDD`), and none of
`$AEDD`'s seven callers reads the flag either.

---

## 3. THE COMPARISON, AFTER THE FIX

```
node games/gradius/tools/oracle/stagecmp.mjs --tag s5-chunks --pipeline tail --only 14
  type $14 -> $CA5E : 3826 frames compared, 0 field divergences
  FIELD DIVERGENCES : 0
```

---

## 4. WHAT SHIPPED

`games/gradius/src/enemies.js`, two functions:

* **`h_AEE1`** now RETURNS its RTS carry - derived at each of its three exits
  from the listing, with the derivation in its header, plus the note that
  `$CAB8` is the only one of the 32 KB's three `JSR $AEE1` sites whose carry is
  ever read (`$B4C8` -> `DEC $04CC,X`, `$CB17` -> `RTS`).
* **`h_CA5E`** consumes it: `carry = c ? 1 : 0` after `$CAB8`. The header's
  "there are exactly two ways in" is replaced with the three, the proof that
  `$AEF8`'s C = 0 exit cannot reach `$CAE9`, and the board histogram.

`games/gradius/tests/w32b-arms.test.js`, two new named tests (section 7). Both
are DIFFERENCES BETWEEN TWO PORT RUNS - the step `$CA57[$17]` cancels, leaving
only the carry - so neither can agree with itself through a constant the port
also reads (`docs/knowledge/03`).

**A FACT THE TEST FOUND WHILE BEING WRITTEN:** on the A2 path `$AEE1` runs
**TWICE** in one frame, `$CAB8` and `$CB17`, so the owner drifts a WHOLE pixel
left on an A2 frame and half a pixel on an A1 frame. The first draft of the
test asserted the half-pixel and went red. It is now pinned.

---

## 5. THE MUTATION TABLE - EVERY CHECK SEEN TO FAIL

`games/gradius/tools/oracle/mutants-w42.json`, run two ways: through
`mutgate.py` (a scratch COPY, real dump, `src/` re-hashed either side) for the
CARTRIDGE COMPARISON, and in place with a scripted restore + sha256 verify for
the UNIT TESTS.

golden `src/enemies.js` sha256 `6a3b96c187746ba4d0f9961f71c643b513169587c5981ef4691433ec64e18c17`,
**verified byte-identical after every one of the seven in-place mutants.**
`mutgate.py`: `games/gradius/src: 25 files, sha256 IDENTICAL before and after`.

| id | what it breaks | `stagecmp` s5-chunks | unit test |
|---|---|---:|---|
| W42-1 | **the defect itself** - `$CAB8`'s carry dropped | **RED 237** | RED (both) |
| W42-2 | **W40's PROBE-1 rebuilt** - initialiser := 1 | **RED 3,580** | RED |
| W42-3 | `$AEEC`'s exit returns C = 0 | GREEN - **a hole, §5a** | RED (both) |
| W42-4 | `$AEF6`'s exit returns C = 0 | **RED 237** | RED |
| W42-5 | `$AEF8`'s exit returns C = 1 | GREEN | GREEN - **(c) uncatchable, §5b** |
| W42-6 | `$CAD2`'s path-B carry forced to 0 | **RED 31** | GREEN - comparison only |
| W42-NEG | CONTROL, comment only | GREEN as designed | GREEN as designed |

W42-1 reproducing **237** and W42-2 reproducing **3,580** are the two numbers
W40 printed. The explanation in §2 predicts both, so the fix is not a constant
that happened to zero the counter.

### 5a. SURVIVOR W42-3 - (a) A DEFECTIVE CHECK, and it is the COMPARISON's

`$AEEC`'s C = 1 is never exercised **at `$CAB8`** by this dump. Measured from
the board film, not inferred:

```
A2 frames, $038C,X entering $CAB8:  {'< $80 -> $AEF6 exit': 247}
                                    (>= $80 -> $AEEC exit: ZERO frames)
```

All 247 A2 frames enter with the fraction below `$80`, so `$CAB8`'s
`SBC #$80` always borrows and always returns through `$AEF6`. It is not
structural - an A2 stretch holds `$038C,X` constant (two calls = one whole
pixel) and an A1 stretch alternates it by `$80`, so which exit a stretch uses
is the parity it happened to start on. A different trajectory would flip it.
**The unit test catches it RED**, which is why the mutant is reported as a
defective CHECK and not as an unguarded path.

### 5b. SURVIVOR W42-5 - (c) PROVABLY UNCATCHABLE

`$AEF8` leaves C = 0 and also writes `$012C,X := 0` (`$AF00`). `$CAB8`'s very
next instructions are `$CABB LDA $012C,X / $CABE BNE $CAC1`, not taken, so
`$CAC0 RTS` returns before any arithmetic; and the other two `JSR` sites
discard the flag. **No comparison of object bytes, and no test of observable
port state, can distinguish the two values.** The listing is the only proof.
The test pins the consequence that IS observable - that the frame does no
arithmetic at all.

---

## 6. REGRESSIONS - EVERYTHING W40 MEASURED, RE-MEASURED

| run | W40 | W42 |
|---|---|---|
| W31 via `stagecmp` `--tag w31repro` | 271 spawns, 0 | **271, 0** |
| W31 via its OWN `stage4cmp.mjs` | 271, 0; 16 of 16 `$C603` rows | **271, 0; 16 of 16** |
| W32a via `stagecmp` `--tag w32arepro` | 0 | **0** |
| W32a via its OWN `b559cmp.mjs` | 2,371 frames, 0 | **2,371, 0**; metasprites `$52`-`$57` |
| stage 3 `s3-chunks` | 504,273 fields, 0 | **0** |
| stage 4 `s4-chunks` | 617,127, 0 | **0** |
| **stage 5 `s5-chunks`** | 207,606, **237** | **207,606, 0** |
| stage 6 `s6-chunks` | 503,307, 0 | **0** |
| stage 7 `s7-chunks` | 733,068, 0 | **0** |
| `chain-ending` | 36,400, 0 | **0** |
| `chain-loop6` | 36,400, 0 | **0** |

**2,565,381 field comparisons across nine board runs, 0 divergent.** The only
divergence this project had is gone, and it went by transcription.

### 6a. ONE W40 NUMBER CORRECTED, and it is not a regression

W40 §2b prints `frames compared 2371` for `stagecmp --tag w32arepro` and 2,374
with `--pipeline tail`. This tree prints **2,364** and **2,375**. The difference
is `$19 == 4 frames skipped: 7` (and 8 on the tail pipeline) - `$9663`'s census
frames, W40 §6a hole 1 - which `b559cmp.mjs` does compare and `stagecmp.mjs`
skips. 2385 − 12 − 2 − 7 = 2364. **Verified not to be my change:** `git show
HEAD:...enemies.js` swapped in produces byte-identical counts (2375, 8 skipped).
2,371 is `b559cmp.mjs`'s number, quoted in `stagecmp.mjs`'s row.

---

## 7. GATE

```
node games/gradius/tools/test-all.mjs   ->  GREEN -- 12 passed, 0 failed, 0 SKIPPED
node --test games/gradius/tests/        ->  725 pass, 0 fail, 0 skipped  (was 723)
```

**A SKIP IS NOT A PASS - the two levels, reported separately:**

* **gate-level SKIPPED: 0.** All twelve stages ran.
* **field-level: 6 fields still SKIPPED** inside `compare.mjs`'s 29,693-frame
  run - `pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins`. Inherited,
  not touched by this wave, and the gate's own summary line still does not say
  it where a reader will see it.
* **`stagecmp.mjs` skips `$9663`'s census frames**: 142 on `s5-chunks`, 7-8 on
  `w32arepro`, 0 elsewhere. Counted and printed, never silently.
* one **`[STILL BROKEN] knownFail $8871`** (the title logo, `src/flow.js`
  `fullScreenLoad`): 10 of 13 windows, 1,916 bytes. Pre-existing and unrelated.

---

## 8. BUDGET REMAINING - THE HARNESS POINTED AT THE CHEAPEST OPEN ITEM

W40 §7 item 4: "the six unreached late spawners - `--mode spawn --window
6460-7730` per stage". Cheapest, so it went first: **stage 5's**, one 3-minute
board run.

**ENUMERATE FIRST (`docs/knowledge/09`).** `jt_$C439[4]` = `$C653`, and reading
it settles what to capture before anything runs: `$C653 INC $68 / CMP #$28 /
BCC RTS` fires one frame in `$28`, then `LDA #$14 / STA $66` - it spawns
**exactly one type, `$14`**, the arm owner, through `$A4A6`, cycling `$69` over
`$C67A`'s four pairs. So the run wanted `--types 14`, and the seven spawns it
produced used **4 of 4** `$C67A` rows.

That one run turned up **three defects, none of them in `src/`, all of them in
the machinery that produces this project's cartridge numbers.**

### 8a. `seedFromCartridge` NEVER SEEDED `$68` - the SHARED seeder, every scenario

`porttrace.mjs` seeds `$5D $60 $61 $64 $65 $66 $67 $69 $6A-$6F`. **`$68` is not
in the list**, and it has two ROM writers - `$C653` (above) and `$C686 INC $68 /
CMP $C684,Y` (the warp rain). Both are one-in-N throttles, so an unseeded `$68`
of 0 makes the port's spawner **do nothing for up to `$28` frames after any
seed**, silently. There was no readback case for `$68` either.

Found because the port produced SEVEN empty slots where the cartridge spawned
seven arm owners. No scenario in the corpus reaches either writer, which is
exactly why it survived to W42. Fixed, with the derivation written at the line.

### 8b. `stagecmp.mjs` SPAWN MODE IS THE `sub_$C44F` FAMILY ONLY

Spawn mode hand-builds a state with `$1B := $82` and the pre-INC `$69`, which
fits `$C486 / $C546 / $C5AD / $C6DE` (W31's stage-4 entry among them) and
nothing else. `$C653` gates on `$68`, so it did nothing: seven spawns, 78
divergent, `$69: port 1 vs cart 2` - the cursor never even advanced. `$68` is
now seeded there from the film too, which took it to 53.

**AND IT STILL CANNOT VALIDATE `$C653`**, because the board's spawn row is
sampled AFTER `$ADAB` dispatched and `$CA5E` has already run one frame on the
new object, while spawn mode's row is pre-dispatch. The residue is systematic:
every field is exactly one `$CA5E` + `$AEE1` frame (`x $F0/$EF`, `xf $00/$80`,
`y $40/$3F` - a whole half-pixel in each axis).

The fix is not to patch spawn mode but to use the SEEDED path: the seven rows
re-expressed as STEP rows over the same film, so the whole machine is seeded
from the cartridge's own 2 KB at frame i−1 and the full `$9A64` tail runs.

```
node stagecmp.mjs --tag s5-late-step --dir .../out/stagepoke/s5-late-step --pipeline tail
  frames compared 7   fields per frame 21  ->  147 field comparisons
  FIELD DIVERGENCES : 0
```

**`jt_$C439[4]` = `$C653` is the FIRST late spawner other than stage 4's ever
compared against the board.** 7 of 7 spawns, 4 of 4 `$C67A` rows, 0 divergent.

### 8c. TWO `$5C >= 2` GATES THE HARNESS WAS NOT MODELLING - and W40's two "window edge" frames explained

W40 skipped every `$19 == 4` frame ("`$9663`'s census is not replayed") - 142
frames on `s5-chunks`. **`$19 == 4` IS NOT THE FORK.** `$9663` is three
conditions and the harness was skipping on the first:

```
9665  CMP #$04 / BNE $96A5              $19 == 4
9683  STX $5C / CPX #$02 / BCC $96A5    the census found TWO groups
9689  LDA $02 / LSR A / BCC $96A5       ...and the frame counter is ODD
```

All three are in the board's own film at sample i, so the skip is now the ROM's
condition: **142 skipped -> 10**, and `$9663`'s census is REPLAYED (`armCensus`)
and **compared against the `$5C` the board wrote at `$9683`** instead of being
assumed. Hole 1 of W40 §6a is closed.

Narrowing it exposed **16 field divergences at f2321 and f4371** - precisely the
two frames W40's own source comment names as "the only non-`$CA5E` divergences
the stage-5 run had", without saying why. Two more listing facts, both real:

1. **`$9A5E LDA $5C / CMP #$02 / BCS $9A70` is a FOURTH `$5C >= 2` gate.** When
   two groups are live the frame does not spawn, does not run the enemy
   bullets, does not move the player and does not dispatch `$ADAB`.
   `src/nmi.js` `mode5Body()` has had this branch since W32b; **the harness's
   `tail` pipeline ran all six calls unconditionally.**
2. **`$9A73` is not the end of the object chain on a stage-5 frame.**
   `$9A76 JSR $C772` -> `$CB8A` runs the arm driver whenever `$5C < 2`, and it
   writes object bytes.

Measured, and this is what makes it a fact rather than a story: at f2321 the
board's `$5C` = 3 and `$02` = `$12` (EVEN), so `$968C`'s BCC was taken and there
was no `$968E` fork - and **every live slot's 21 bytes are byte-identical
between f2320 and f2321.** The board's whole object chain was skipped. With
`$9A5E`'s gate transcribed into the tail, all 16 go to 0.

### 8d. WHAT THAT COST AND BOUGHT, re-measured everywhere

| run | before W42 | after |
|---|---|---|
| `s5-chunks` frames compared | 9,886 (142 skipped) | **10,405 (10 skipped)** |
| `s5-chunks` `$CA5E` frames | 3,826 | **3,962** |
| `w32arepro` type `$1D` frames | 2,364 | **2,371 - `b559cmp.mjs`'s number exactly** |
| every run's divergences | - | **0** |

§6a's "one W40 number corrected" is now moot: `stagecmp.mjs` and `b559cmp.mjs`
agree at 2,371, because the frames one skipped and the other compared are now
compared by both.

**Both mutation tables were re-run on the changed harness**, since a harness
that compares more must still redden:

```
mutants-w40.json --dump s6-chunks --pipeline tail   RED 30 of 30, 2 controls green
mutants-w42.json --dump s5-chunks --pipeline tail   RED  4 of  5, 2 controls green,
                                                    1 declared hole (W42-3)
games/gradius/src: 25 files, sha256 IDENTICAL before and after
```

W42-1 is 237 -> **252** and W42-2 3,580 -> **3,695** on the wider comparison;
the mutant file records both numbers so neither reads later as drift.

---

## 9. STILL OPEN, stated as attempts and not as absences

1. **W42-3's hole.** A cartridge comparison in which `$CAB8` returns through
   `$AEEC` needs an A2 stretch that begins on the other `$038C,X` parity. It is
   a coin flip per stretch and this film lost it 247 times out of 247. A second
   stage-5 trajectory would settle it; the unit test guards it meanwhile.
2. **The other late spawners.** `$C653` is now the worked example for the SEEDED
   path (`--mode spawn --types <from the listing>`, then re-shape to step rows).
   `$C6DE` (stage 6), `$C429` (stage 7), `$C486`, `$C546`, `$C58D`, `$C633` and
   `$C752` remain.
3. **Spawn mode proper.** It compares a pre-dispatch port row against a
   post-`$ADAB` board row. That is sound only for handlers whose init arm does
   not move the object on its spawn frame - true of W31's `$0A`/`$15`, false of
   `$14`. Either dispatch inside spawn mode or retire it for the step path.
4. **`$968E`'s fork itself** is still not replayed: 10 frames on `s5-chunks`, 0
   everywhere else. It is a different call ORDER, not a subset, so it needs
   transcribing rather than reusing the tail.
5. Untouched from W40 §7: stage 7's boss records, stage 3's `$96`/`$A46F`, and
   every boss but stages 1-2's.

## FINAL NUMBERS

```
src/           enemies.js ONLY -- h_AEE1 returns its carry, h_CA5E consumes it
tests/         w32b-arms.test.js +2 named tests    723 -> 725, 0 skipped
tools/         stagecmp.mjs   $68 seeded; $9663's real three-condition fork;
                              $9663 REPLAYED and its $5C COMPARED; $9A5E's
                              gate; $9A76's arm driver
               porttrace.mjs  $68 seeded and read back -- the SHARED seeder
               mutants-w42.json (7 entries)

cartridge comparisons, 11 board runs, ALL re-measured this wave:
  s3 504,273 | s4 617,127 | s5 218,505 | s6 503,307 | s7 733,068
  w31 271x11 | w32a 2,371x10 | chain 36,400 | loop6 36,400 | $C653 7x21
                                                  ALL 0 DIVERGENT
mutation       W40's 30 of 30 red; W42's 4 of 5 red, 2 controls green,
               1 declared hole; src/ sha256 identical before and after
gate           node games/gradius/tools/test-all.mjs
               GREEN -- 12 passed, 0 failed, 0 gate-level SKIPPED
               (6 FIELDS still skipped inside compare.mjs -- inherited)
```

status: DONE
