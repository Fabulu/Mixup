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
