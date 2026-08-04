# Wave 40 TOOLING — one poke harness, and the stages it can and cannot reach

status: IN PROGRESS
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
