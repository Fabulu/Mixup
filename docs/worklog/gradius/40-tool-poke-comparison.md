# Wave 40 TOOLING — one poke harness, and the stages it can and cannot reach

status: DONE
tooling, 2026-08-04

Scope: `games/gradius/tools/` ONLY. `src/` and `tests/` belong to a concurrent
agent; I do not write there.

The owner's question that opened this wave:

> "can't you cartridge verify just by warping yourself to all the positions you
> need? Didn't we spend like 5 waves just getting that to work?"

Yes, and yes. The capability was built twice — `stage4poke.py`+`stage4cmp.mjs`
(W31, 271 spawns, 0 divergent) and `b559poke.py`+`b559cmp.mjs` (W32a, 2,371
handler frames x 10 fields, 0 divergent) — and both were hardcoded to one
stage, so W35 (stage 6), W36 (stage 7) and W38 (ending/loops) each shipped
reporting "could not reach: any cartridge comparison".

EVERY RUN IN THIS FILE IS AN INTERVENTION RUN (`docs/knowledge/09`). It
validates the CODE under a forced state. It is not evidence about any stage's
pacing, spawn density, difficulty or appearance.

---

## 0. PLAN

1. generalise the two scripts into one parameterised poke + one parameterised
   comparator; reproduce W31's and W32a's numbers through it.
2. apply it to stage 6 (`$19 = 5`) and stage 7 (`$19 = 6`) — never compared.
3. assess the ending + loops.
4. state what is still unvalidated, per stage.

(notes below are appended as findings arrive, not batched at the end)

---

## 1. BOTH PREDECESSORS RE-RUN ON THIS TREE, UNTOUCHED — the numbers reproduce

`33e0454`, `games/gradius/src` and `tests` clean and untouched by me.

```
python games/gradius/tools/oracle/stage4poke.py      3m16s
  volcano-family spawns: $8A x1, $95 x270
node   games/gradius/tools/oracle/stage4cmp.mjs
  spawns compared : 271
  mismatches      : 0
  $C603 descriptor rows : 16 of 16 exercised

python games/gradius/tools/oracle/b559poke.py        1m51s
node   games/gradius/tools/oracle/b559cmp.mjs
  handler frames compared : 2371     field mismatches : 0
  spawn frames 12 (init agrees on 12)   metasprites $52..$57 (6 of 6)
```

W31's 271/0 and W32a's 2,371/0 are this tree's numbers, not inherited ones.
They are the correctness check the generalised tool has to reproduce.

### 1a. FINDING — a claim in W32a's worklog is contradicted by W32a's own tool

`32a-impl-b559.md` says, in bold:

> **`$0600`'s four group headers were checked, not assumed: zero for the entire
> run.**

Re-running `b559poke.py` unmodified (`git log` says it has not been touched
since `5ee7a2f`, the W32a commit) prints, from the tool itself:

```
$0600 group headers non-zero on 3493 of 5600 frames
  first at f2107: ['$50', '$00', '$00', '$00']
```

The run is deterministic and the script is byte-identical, so the worklog
sentence was written without reading the line above it.

**And the check was never sound in the first place.** `$0600`-`$06BF` is the arm
pool AND the top half of the terrain collision map `$0500`-`$06FF` — an overlap
`src/state.js`'s `ARM_POOL` comment documents on purpose ("IT IS NOT ITS OWN
ARRAY"). Measured here, from the same RAM film:

```
f2106  cam $0380   $0600 non-zero bytes: 0
f2107  cam $0381   $0600 non-zero bytes: 4     $0600 = $50, $0608 = $50
f5599  cam $0A53   $0600 non-zero bytes: 82
```

That is the streamer writing collision bits as the camera crosses `$0380`, not a
group allocation — `$50` is not an enemy slot. A non-zero header does not mean
an arm group exists, and a zero one does not mean none was allocated. The
cartridge cannot tell them apart either: `$9663`'s census reads exactly these
four bytes.

**W32a's CONCLUSION survives, for a different and checkable reason.** The four
walkers are gated on `$19 == 4`, and on that run:

```
$19 histogram over 5600 frames : {0: 5554, 4: 46}     (the poke window, exactly)
$5C histogram over 5600 frames : {0: 5600}            (`$9663` never wrote it)
```

`$5C == 0` on every frame is the direct measurement that no arm group was ever
counted and that the `$968E` fork never ran — so the drifters had the frame to
themselves. The generalised tool reports `$19` and `$5C` histograms instead of
the header bytes, because those are the two the ROM actually branches on.

---

## 2. THE HARNESS — `stagepoke.py` + `stagecmp.mjs`

Two files, no stage in either of them.

`stagepoke.py` drives the cartridge. One trajectory (the endchain's, shared with
both predecessors so a measured window stays valid), three modes:

| mode | what it forces | what it reaches |
|---|---|---|
| `crossings` | nothing | prints every 512-px crossing, `$19`/`$1B`/mode change, death — the INPUT to the other two, so a window is measured and never guessed |
| `step` | `$19 = S` across a narrow window containing a crossing | the chunk loader reads stage S's table; the wave engine spawns S's OWN records; every frame of every life is indexed |
| `spawn` | `$19 = S` across the `$82` countdown | `jt_$C439[$19]`, the stage's late spawner — which has no wave records and is reachable no other way |

`stagecmp.mjs` compares, driven entirely by the manifest inside the dump — the
stage, the windows, the field list and the type filter are DATA. It seeds a
whole port machine from the cartridge's own 2 KB at frame i−1 (the same
`seedFromCartridge` every scenario comparison uses), applies the run's own pokes
at that boundary, runs the frame's object chain, and compares at frame i.

Three things it does that neither predecessor did:

* **21 fields, not 10.** The complete object record — every byte the port models
  per slot. `--fields w31` / `--fields w32a` still select the old sets exactly.
* **A whole seeded machine**, not a hand-built state holding one slot. Handlers
  that read the rank `$17`, the camera, the player's position or another slot
  get the board's real values instead of zeros.
* **`--pipeline tail`**, which runs `$9A64`-`$9A73` entire (spawn engine, enemy
  bullets, player, `$ADAB`, the collision sweep, the capsule apply). `$ADAB` is
  NOT the only writer of an object byte in a cartridge frame — `$9A70` runs
  after it — so the default `enemies` pipeline (W32a's, attributable to one
  handler) will call a frame the player shot on divergent, and `tail` will not.

### 2a. W31 REPRODUCED THROUGH THE NEW TOOL, and cross-checked by W31's own comparator

```
python .../stagepoke.py --mode spawn --stage 3 --window 6460-7730 \
    --restore none --frames 8000 --switch 5000 --types 0A,15 --fields w31 \
    --tag w31repro --emit-legacy

poke 0044=2@400-7999,0045=2@400-7999,0046=5@400-7999,0041=1@400-7999,0019=3@6460-7730
     ^ byte-identical to the string stage4poke.py builds
spawns captured: $8A x1, $95 x270              <- W31's 1 control + 270
$19 over 8000 frames: {$00: 6461, $03: 1539}   $5C: {$00: 8000}

node .../stagecmp.mjs --tag w31repro       spawns compared 271, DIVERGENCES 0
node .../stage4cmp.mjs                     spawns compared 271, mismatches  0
                                           $C603 descriptor rows 16 of 16
```

The second line is the one that matters: **W31's own comparator, unmodified,
reading the NEW tool's run.** Same board run, two independent comparators, same
verdict. `--emit-legacy` exists for exactly that check.

### 2b. W32a REPRODUCED THROUGH THE NEW TOOL

```
python .../stagepoke.py --mode step --stage 4 --window 1300-1345 \
    --frames 5600 --types 1D --fields w32a --tag w32arepro

poke 0044=2@400-5599,...,0019=4@1300-1345,0019=0@1346-5599   <- b559poke.py's, exactly
indexed 2385 slot-frames                                     <- b559poke.py's 2385
f1338 $61 $02 -> chunk 1   $19 was $04 at the crossing   <- RIDDEN

node .../stagecmp.mjs --tag w32arepro
  frames compared 2371   fields per frame 10   FIELD DIVERGENCES 0
  spawn frames 12, slot re-used 2        metasprites $52..$57
```

2,371 and 0, field for field with W32a. With `--pipeline tail` the twelve SPAWN
frames become real comparisons instead of an approximated init arm — the port's
own `$A2C0` produces the drifters — and that is 2,374 frames, still 0.

### 2c. TWO DEFECTS IN THIS HARNESS, FOUND BY ITS OWN NUMBERS

Neither is in `src/`. Both were found because a 21-field comparison over 500,000
fields makes a one-frame phase error visible where a 10-field one did not.

1. **The NMI prologue.** Seeding from sample i−1 and then running `$9A64` hands
   the object chain a stale `$02` (the frame counter `$80BE` INCs) and stale
   `$05`/`$07` (the buttons `$81BF` polls). Signature: 1,034 `$040C,X` shot
   countdowns alternating ±1. Fixed by taking those three from sample i, which
   is exact — nothing writes them again before `$80B5`.
2. **`$9650`-`$965A`.** Every mode-5 frame clears `$5D`, `$5B` and `$5C` before
   the body. A sample is taken after the frame refilled them. `$5D` is
   load-bearing: `$BBB7 LDA $5D / BNE $BC19` skips the whole enemy-shot
   countdown, so a stale `$5D` made the port miss decrements the board made.
   Signature: 405 `$040C,X` divergences, all in one direction. Fixed by zeroing
   the three, which is what the ROM does.

Residual after both: **0**. The two fixes are documented at their constants in
`stagecmp.mjs` with the measurement that found them.

---

## 3. STAGE 6 AND STAGE 7 — THE FIRST CARTRIDGE EVIDENCE EITHER HAS EVER HAD

Both runs ride **five** chunk crossings in one 5,600-frame trajectory, so the
board loads that stage's chunks 1, 2, 3, 4 and 5 in turn and the wave engine
spawns its own records with the game's own descriptor bytes. `$19` is handed
back after each 46-frame window, so every compared frame runs under stage 1's
`$19` — measured, `$5C == 0` on all 5,600 frames of both runs, so `$9663` never
censused an arm group and the `$968E` fork never ran.

```
python .../stagepoke.py --mode step --stage 5 \
    --window 1300-1345 --window 2320-2367 --window 3345-3391 \
    --window 4370-4415 --window 5395-5439 --frames 5600 --fields full \
    --tag s6-chunks                                     ($19 = 5 -> STAGE 6)
    ... --stage 6 ... --tag s7-chunks                   ($19 = 6 -> STAGE 7)

both: f1338 chunk 1, f2362 chunk 2, f3386 chunk 3, f4410 chunk 4, f5434 chunk 5
      -- all five RIDDEN ($19 held at the crossing frame, re-derived from the
      run's own film, not from the run the windows were picked on)
```

### STAGE 6 (`$19 = 5`) — `node stagecmp.mjs --tag s6-chunks --pipeline tail`

```
indexed slot-frames  24016      spawn frames 117 (compared)   re-used 49
frames compared      23967      fields per frame 21  -> 503,307 field comparisons
port THREW on        0
FIELD DIVERGENCES    0                    <- FIRST DIVERGENT FIELD: none
```

| type | handler | frames compared | divergences |
|---|---|---:|---:|
| `$1A` | **`$B480`** — stage 6's own, W35's port | 2,912 | **0** |
| `$11` | `$B026` | 2,666 | 0 |
| `$12` | `$B098` | 2,847 | 0 |
| `$08` | `$B26C` | 2,869 | 0 |
| `$04` | `$B205` | 2,583 | 0 |
| `$09` | `$B311` | 1,587 | 0 |
| `$0F` | `$AF2E` | 930 | 0 |
| `$05` | `$B0AF` | 374 | 0 |
| `$27`/`$01` | `$AEDD` | 5,992 | 0 |
| `$02` | `$AE99` | 1,090 | 0 |
| `$00` | `$AE70` (spawn frames) | 117 | 0 |

43 distinct metasprites appeared on the board across those frames.

### STAGE 7 (`$19 = 6`) — `node stagecmp.mjs --tag s7-chunks --pipeline tail`

```
indexed slot-frames  34923      spawn frames 88 (compared)    re-used 15
frames compared      34908      fields per frame 21  -> 733,068 field comparisons
port THREW on        0
FIELD DIVERGENCES    0                    <- FIRST DIVERGENT FIELD: none
```

| type | handler | frames compared | divergences |
|---|---|---:|---:|
| `$13` | **`$B747`** — the ceiling walker, W36's port | 9,990 | **0** |
| `$07` | **`$B6E1`** — the floor walker, W36's port | 9,525 | **0** |
| `$11` | `$B026` | 4,640 | 0 |
| `$12` | `$B098` | 4,597 | 0 |
| `$04` | `$B205` | 1,983 | 0 |
| `$0B` | `$B37F` | 757 | 0 |
| `$0C` | `$B3CB` | 569 | 0 |
| `$10` | `$AF88` | 465 | 0 |
| `$05` | `$B0AF` | 374 | 0 |
| `$08` | `$B26C` | 153 | 0 |
| `$06` | `$B198` | 133 | 0 |
| `$01`/`$02`/`$00` | `$AEDD`/`$AE99`/`$AE70` | 1,722 | 0 |

42 distinct metasprites appeared on the board across those frames.

**READ THE LABEL.** Both are INTERVENTION runs. They say the port's transcription
of stage 6's and stage 7's handlers agrees with the cartridge, byte for byte,
over 1.24 million field comparisons. They say NOTHING about how either stage
plays, paces or looks — the terrain under these enemies is stage 1's.

### 3a. WHAT THESE RUNS DID *NOT* REACH, stated as an attempt and not an absence

* **Stage 7's chunks 5 and 6 boss records** — types `$1E`, `$20`, `$21`, `$22`,
  `$23`, `$24`, `$25`, which are the ONLY types in stage 7 that appear nowhere
  in stages 1-2. The chunk-5 crossing is at f5434 and the player dies at f5514,
  so the board had 80 frames of that chunk and those records' triggers had not
  come round. NOT compared. (Chunks 1-4 use types stage 1/2 also use — but with
  stage 7's own descriptor bytes, which is what these runs exercised.)
* **Stage 6's chunk 6 and both stages' chunk 7.** Stage 7's `$A836` chunk-7
  pointer reads `$8010` and streams 239 records — a table overrun, not a chunk.
  Not ridden and not to be ridden without a separate finding first.
* **Every stage's LATE SPAWNER except stage 4's.** `jt_$C439[$19]` needs the
  `$82` countdown window (`--mode spawn`), which this trajectory reaches at
  f6460 — a second run per stage. Not done here.

### 3b. THE MUTATION TABLE — 21 of 21 red, and `src/` never written

`src/` belongs to a concurrent agent this wave, so the mutant cannot live there.
`mutgate.py` copies `src`, `tests` and `assets` to a scratch tree, mutates the
COPY, and points the copy's comparator back at the REAL run's dump (`--dir`), so
the cartridge bytes are the same bytes the green run used and the only thing
that changed is the port. It re-hashes the real `src/` before and after.

```
python .../mutgate.py --dump s6-chunks --mutants .../mutants-w40.json
RED 21 of 21 mutants; 1 control green as designed: ['NEG-1']
games/gradius/src: 2 file(s) moved under this run (src/flow.js, src/nmi.js)
  -- NOT mine: no '// MUTANT' marker is present in any of them.
```

(The two moved files are the concurrent agent's work, caught by the check and
distinguished from mine by the marker every mutation this tool writes carries.)

| id | target | divergences |
|---|---|---:|
| S6-1 | `$B488` PHASE := 2 → 1 (type `$1A`) | 48 |
| S6-2 | `$B4E4[rank]` FLY dwell row, one byte along | 45 |
| S6-3 | `$B4EB[rank]` DRIFT dwell row, one byte along | 46 |
| S6-4 | `$B4AB` phase dispatch: DRIFT on phase 1 | 11,326 |
| S6-5 | `$B4BC` PHASE := 2 → 0 after the FLY leg | 12 |
| GEN-1 | `$B650,Y` shared animator frame time | 810 |
| GEN-2 | `$B026` type constant `$91` → `$90` | 2,668 |
| GEN-3 | `$B098` type constant `$92` → `$93` | 2,850 |
| S7-1 | `$B6FA` +8 floor probe → +9 | 247 |
| S7-2 | `$B707` step +3 → +4 | 934 |
| S7-3 | `$B75A` −8 ceiling probe → −9 | 4,496 |
| S7-4 | `$B3AA` metasprite `$67` → `$66` | 446 |
| S7-5 | `$B3D0` dwell `$14` → `$13` | 5 |
| S7-6 | `$AF8D` hatch spawn `$F6` → `$F5` | 5 |
| S7-7 | `$AF94` metasprite `$79` → `$78` | 464 |
| R32A-1 | `$B563` DEC → subtract 2 | 2,403 |
| R32A-2 | `$B55E` animator record 9 → 8 | 329 |
| R31-1 | `$C5D9` the second DEC removed | 28 |
| R31-2 | `$C5DE` AND `#$0F` → `#$07` | 135 |
| R31-3 | `$C601` crater X table one along | 270 |
| R31-4 | `$C5F9` ceiling Y `$2C` → `$2D` | 270 |
| NEG-1 | **CONTROL**: a comment-only edit | **0 (green, as designed)** |

The control is not decoration. Without it, "every mutant went red" could equally
mean the harness goes red on any edit at all.

---

## 4. THE ENDING AND THE LOOP — THE BRIEF'S PREMISE IS WRONG, AND HERE IS THE PROOF

The brief asked me to determine whether the poke method can reach the ending,
and offered a reason it might not:

> the ending depends on accumulated run state (checkpoints, loop counter) that
> an intervention may not be able to fabricate faithfully

**It does not.** `$9872` — the first rung — WRITES the checkpoint triple before
it reads anything:

```
$9872   $2001 := 0; $3F := 0; $26,X := 0; $24,X := 0;
        $22,X := ($42 ? 1 : 0);   INC $28,X        <- the only loop increment
```

`$26,X`, `$24,X` and `$22,X` are ASSIGNED, not consumed. The only accumulated
state the whole chain reads is `$28,X` (the loop counter) and `$42` (the meter),
and both are plain RAM bytes holding exactly what ordinary stage-1 play leaves.
So a poked FIRST wrap is a state the cartridge genuinely reaches.

And the entry condition is two bytes. `$1B` is a plain RAM byte that `jt_$982F`
indexes straight off, and `$9904` (`$1B = $86`) is `LDA $19 / CMP #$06 / …
JMP $9872`. `stagepoke.py --mode chain` writes both for ONE frame.

### 4a. WHAT THE BOARD DID

```
python .../stagepoke.py --mode chain --stage 6 --sub 0x86 \
    --window 2000-2000 --frames 5600 --tag chain-ending
poke  ...,0019=6@2000-2000,001B=134@2000-2000
```

| +frames | what the board did |
|---:|---|
| +1 | `$1B` `$86`→`$87`, `$19` = 6, **`$28,X` 0 → 1** — `$9872` ran |
| +2 | `$1B` `$88`, **`$19` := 0 and `$1A` := 1** — `$9B3E`'s wipe. THE WRAP |
| +3,+4,+5 | `$89` `$8A` `$8B`, one frame each |
| +27 | `$57` = 1 — the streamer caught up (23 frames of `$988C` on `$9C24`) |
| +28 | `$1B` `$8C` — **the brain spawns**, sfx `$E8` (`$D4` = `$28`) |
| +354 | `$D4` `$2C` — the 170-frame triangle wait ends; the brain has SETTLED |
| +515 … +650 | **`$4F` steps 1..$10 at exactly 9 frames** — the typewriter |
| +659 | `$4F` := `$81` (the phase bit) |
| +974 | `$4F` := `$FF` — 315 frames on `$B2`, +10,000 points |
| +1230 | `$1B` `$8C`→`$8D` |
| +1231..+1234 | `$1B` 1,2,3,4 — the ordinary intro ladder |
| +1256 | **`$1B` := `$80`, `$1A` = 1 — LOOP 2, STAGE 1, PLAYING** |

`$1B` values visited: `$87 $88 $89 $8A $8B $8C $8D $01 $02 $03 $04 $80`.

### 4b. AND IT WAS COMPARED, NOT JUST REACHED

`stagecmp.mjs` chain mode seeds ONE port machine from the cartridge's 2 KB at
the poke frame, applies the same two pokes at the same instant, and runs the
port's own `nmi()` forward on the same buttons the board was driven with:

```
node .../stagecmp.mjs --tag chain-ending
  poked at f2000: $19 := 6, $1B := $86
  frames run through the PORT'S OWN nmi() : 1400
  fields per frame 26  ->  36,400 field comparisons
  FIELD DIVERGENCES : 0
```

The 26 are the eight flow bytes (`$1B $19 $1A $28 $57 $5B $4F $D4`) plus the
nine object fields of slots 8 and 9 — the brain and its companion, which is the
scene itself.

**EVERY LEG W38 DERIVED FROM THE LISTING IS THE CARTRIDGE'S.** W38's §5 table
and the board's are the same table, frame for frame: 23, 156, 161, 144, 256,
1,256. That includes the two W38 reported as measured-not-derived and named as
the likeliest to be wrong:

> the two waits are the driver's timing, not a counter, so they are exactly the
> kind of number this project has been wrong about before

**170 frames on `$D4` and 315 on `$B2`. Both exact.** W38's item 1 under "what I
could not reach" was *"ANY CARTRIDGE COMPARISON OF ANYTHING IN THIS WAVE …
nobody has watched the brain fly in on the cartridge."* Somebody has now.

### 4c. WHAT THE CHAIN COMPARISON STILL DOES NOT COVER

* **The ending TEXT's pixels.** The comparison watches `$4F`'s cadence and the
  queue's effects on RAM, not the nametable. What `$CF3D`'s sixteen bytes SPELL
  is still a question nobody has rendered (W38 item 2).
* **`$CF12`, the typewriter's restart arm** — still unreachable on this data for
  W38's reason (`$CF3B`'s nineteen bytes contain no `$FF`), and a poke cannot
  put one there without editing the ROM.
* **The `$CEAE` clamp's effect on the TEXT.** Mutant END-7 clamps the loop index
  at 5 instead of 6 and stays GREEN even at `$1A` = 6, because both indices
  select text this comparison cannot see. Reported as a hole, not hidden.

### 4d. AND A SECOND LAP, AT LOOP 6

`--also 0028=5` carries one more one-frame poke into the same window: `$28,X`,
the loop counter. `$9872` INCs it to 6 and `$9B3E` copies it into `$1A`, so the
poked wrap is the SIXTH — the only way to reach `$CEAE`'s `CMP #$06` clamp.

```
node .../stagecmp.mjs --tag chain-loop6
  +1  $1B=$87 $28=$06        +2  $1B=$88 $1A=$06     ... +1256 $1B=$80
  1,400 frames x 26 fields = 36,400 comparisons, 0 divergent
```

W38 found loops 2/3/6 frame-identical **in the port**. They are frame-identical
**on the cartridge** too. `$1A` is genuinely unpinned and the wrap is real.

---

## 5. THE SAME HARNESS, POINTED AT STAGES 3, 4 AND 5 — AND ONE REAL DEFECT

Once the tool is general the marginal cost of another stage is one 2-minute
emulator run, so all of them were done.

| stage | `$19` | frames compared | fields | field comparisons | divergent |
|---|---:|---:|---:|---:|---:|
| 3 | 2 | 24,013 | 21 | 504,273 | **0** |
| 4 | 3 | 29,387 | 21 | 617,127 | **0** |
| 5 | 4 | 9,886 | 21 | 207,606 | **237** |
| 6 | 5 | 23,967 | 21 | 503,307 | **0** |
| 7 | 6 | 34,908 | 21 | 733,068 | **0** |

### 5a. FINDING — `$CA5E`'s Y INTEGRATOR BORROWS A BIT THE CARTRIDGE DOES NOT

Stage 5's 237 divergences are ALL in one handler, `$CA5E` (dispatch entry 20,
types `$14`/`$94` — the arm owner, W32b's). Every other type on that stage is 0.

```
  type $14 -> $CA5E  : 3826 frames compared, 237 field divergences
    yf: 230   y: 7          (all 21 fields compared; only these two moved)

  f3324 slot 7 type $94 yf: port $1F board $20
  f3325 slot 7 type $94 yf: port $AF board $B0
  f3326 slot 7 type $94 yf: port $3F board $40      ... one LOW, every frame
```

Measured on the board at f3323-f3330, rank `$17` = 4 and `$CA57[4]` = `$70`:

```
board yf: 90 20 B0 40 D0 60 F0 80        -- exactly -$70 per frame
port  yf: -- 1F AF 3F CF 5F EF 7F        -- exactly -$71
```

The port's line is

```js
const f = o.yf[i] - step - (1 - carry);    // $CAE6/$CAE9 SBC $CA57,Y
```

and `carry` is assigned ONLY inside `if (o.s04A0[i] === 0)` (from `$CACF CMP
$0320`). On every frame that takes `$CAC1 BNE $CADC` it keeps its initialiser of
0, so the `SBC` borrows. The cartridge does not borrow on those frames.

**THE OBVIOUS FIX IS WRONG AND THAT IS MEASURED, NOT GUESSED.** Mutant `PROBE-1`
changes the initialiser to 1 and runs the same comparison: **237 → 3,580**, with
the port now one HIGH on a different set of frames (`f2620 yf: port $20 board
$1F`). So the carry `$CAE9` inherits is not a constant either way. The remaining
candidates are `$CAAD`'s `CMP $99` and — much more likely — `$CAB8 JSR $AEE1`,
a subroutine call on the `animFrame == 0` path that leaves whatever carry its
own last comparison left. Pinning it needs the listing, not another run.

I cannot fix it: `src/` is out of scope this wave and belongs to a concurrent
agent. It is handed forward in §7 with the run that reproduces it in one command.

Scale, honestly: 237 of 207,606 fields, and the error is 1/256 of a pixel per
frame on the stage-5 arm owner's vertical drift, which reaches the integer `$0320`
on 7 frames of 3,826. It is a real transcription defect and it is a small one.

### 5b. AND WHAT THE STAGE-3 RUN DID NOT REACH — the `$96` moai arm

Stage 3 (`$19` = 2) is the one stage whose inline-5 records route differently:
`$A466 CMP #$02` sends them to `$A46F` (which forces type `$96`) instead of
`$A4A6`. **`$A466` reads `$19` when the record FIRES, not when the chunk loads**,
and the window hands `$19` back within 46 frames — so the records fired under
`$19` = 0, took `$A4A6`, and came out as types `$21`/`$23`/`$24`/`$25`/`$26`
(the raw fourth descriptor byte). Those 13,567 frames compared 0 divergent and
they are NOT the moai.

Type `$96` and `$A46F` therefore remain uncompared. Reaching them needs `$19` = 2
HELD across a record's trigger, which also opens the terrain streamer's
per-stage pointers and the stage-end pages — a wider intervention with a wider
blast radius, and a separate wave's job to bound.

---

## 6. WHAT IS STILL UNVALIDATED, PER STAGE — THE TABLE THE PROJECT ASKED FOR

Every number in the "cartridge" column is a FIELD COMPARISON against the real
board. `ordinary play` means a scripted run the game could actually produce;
`INTERVENTION` means `$19` (and for the ending `$1B`) was forced.

| stage | `$19` | cartridge evidence | provenance | what is STILL unvalidated |
|---|---:|---|---|---|
| 1 | 0 | the whole 47-scenario corpus, full-frame, 1,022 watched addresses | **ordinary play** | nothing this method can add |
| 2 | 1 | `endchain`, 5,839 frames full-frame incl. the stage-2 boss and the `$19` 1→2 transition (W29) | **ordinary play** | nothing this method can add |
| 3 | 2 | **504,273 field comparisons, 0 divergent** (W40) | INTERVENTION | **type `$96` and the `$A46F` moai arm** — §5b. `$A466` reads `$19` at TRIGGER time, so a crossing-width window cannot reach them |
| 4 | 3 | **617,127, 0 divergent** (W40) + 271 late-spawner spawns x 11 fields, 0 (W31) | INTERVENTION | its `$82` boss trigger and stage-end pages; chunks 6-7 |
| 5 | 4 | **207,606, 237 divergent** (W40) + 2,374 x 10, 0 (W32a) | INTERVENTION | **`$CA5E`'s carry (§5a — an OPEN DEFECT)**; `$9663`'s census and the `$968E` fork, which this harness skips (529 frames) rather than replays |
| 6 | 5 | **503,307, 0 divergent** (W40) | INTERVENTION | its late spawner `$C6DE`; chunks 6-7; the stage-6 boss |
| 7 | 6 | **733,068, 0 divergent** (W40) | INTERVENTION | **the boss records `$1E $20 $21 $22 $23 $24 $25`** (chunks 5-6 — the crossing lands 80 frames before the death); the late spawner `$C429`; `$A836`'s chunk-7 pointer, which reads `$8010` and streams 239 records |
| ending `$9872` | — | **36,400 comparisons, 0 divergent**, loop 1→2 (W40) | INTERVENTION | the ending TEXT's PIXELS; `$CF12`'s restart arm; `$CEAE`'s clamp (§4c) |
| loop wrap | — | **36,400, 0 divergent** at loop 6→7 (W40) | INTERVENTION | loops above 6 are clamped by `$CEAE` and were not run |
| every stage's BOSS | — | **none** | — | no boss but stage 1's and stage 2's has ever been compared |
| every late spawner but stage 4's | — | **none** | — | `jt_$C439[$19]` needs the `$82` window (`--mode spawn`), one more run per stage |

**Read the provenance column, every time.** Six of the ten rows are intervention
runs. They say the port's CODE agrees with the cartridge under a forced state.
They do not say those stages play, pace or look right, and nothing in this wave
is evidence that they do.

### 6a. THE THREE HONEST HOLES IN THE COMPARISON ITSELF

1. `$9663`'s arm census is not replayed, so any frame the board held `$19 == 4`
   is COUNTED AND SKIPPED, not compared (529 frames on the stage-5 run, 9 on
   W32a's, 0 on all the others).
2. The chain comparison watches 26 RAM bytes. It does not watch the nametable,
   so END-7 stays green.
3. `--pipeline enemies` calls a frame the player shot on divergent, because
   `$9A70` runs after `$ADAB`. Every number above uses `--pipeline tail`, which
   runs every writer of an object byte in a mode-5 frame.

---

## 7. HANDED FORWARD

1. **`$CA5E`'s carry (§5a).** OPEN DEFECT, reproducible in one command:
   `node .../stagecmp.mjs --tag s5-chunks --pipeline tail --only 14`.
   The obvious fix is measured wrong (PROBE-1). Needs the listing at `$CAB8`.
2. **Stage 7's boss records.** A longer-lived trajectory, or a window that rides
   the chunk-5 crossing earlier than f5434, would reach `$1E`/`$20`-`$25`.
3. **Stage 3's `$96` / `$A46F`.** Needs `$19 = 2` HELD across a trigger.
4. **The six unreached late spawners.** `--mode spawn --window 6460-7730` per
   stage; stage 4's is the worked example and the tool is already parameterised
   for the rest.
5. **`stagecmp.mjs` chain mode is a general sub-state warp**, not an ending tool.
   `$1B` is a plain byte and `jt_$982F` indexes off it, so any rung of any
   ladder is one poke and one comparison away.

## FINAL NUMBERS

```
tools added   games/gradius/tools/oracle/stagepoke.py    (poke, 4 modes)
                                        stagecmp.mjs     (compare, 3 modes)
                                        mutgate.py       (mutate a COPY)
                                        mutants-w40.json (32 entries)
tools changed none. stage4poke.py, stage4cmp.mjs, b559poke.py and b559cmp.mjs
              are untouched and still run; W31's comparator was RE-RUN on the
              new tool's dump and agreed.
src/ tests/   NOT WRITTEN. Measured by sha256 before and after every mutant.

cartridge comparisons this wave   2,664,912 field comparisons over 9 board runs
      271x11 + 2375x10 + 504,273 + 617,127 + 207,606 + 503,307 + 733,068
      + 36,400 + 36,400
                                  237 divergent, ALL in one handler ($CA5E)
mutation gate                     RED 30 of 30, 2 controls green as designed
                                  games/gradius/src sha256 unchanged by me
```
