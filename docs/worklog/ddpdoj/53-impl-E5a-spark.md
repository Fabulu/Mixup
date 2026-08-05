# 53 — IMPL E5a: THE SHOT SPARK (pool E, `$289F54` + `$28A098`)

status: **IN PROGRESS**

started: 2026-08-05
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

brief: the owner is playing the live build — "Shooting enemies with bullets
works, but you can't see the bullets and no explosions." E4 made the bullets
visible. **Mine is the first half of the explosions: the shot's impact spark**,
recon 50 §8's E5a — pool E, the highest-frequency effect in the game.

inputs read in full: 50-recon-effects, 52-impl-E4-bullets, 47-impl-E2-art,
51-impl-laser-damage, HANDOVER, `docs/knowledge/09` and `10`.

`[M]` = measured by me, this session, on this tree.

---

## 0. THE BRIEF'S PREMISE, CHECKED — its shape is right and FIVE numbers are not

Recon 50's structure is confirmed from the cartridge: pool E really is
`$81D394`/`$81D790`, 60 slots of `$22`, count `$81DB8C`; `$289F54` really is its
allocator and `$28A098` really is its driver; the emitter table really is
`$28A140`, four entries, three distinct, entry [4] code. I reproduced all of it
independently.

| recon 50 / the brief says | [M] this session |
|---|---|
| "`moveq #$1D,D2` = 30 slots, or `moveq #$E,D2` = **15 when `$81308C` is set**" | **BACKWARDS.** `$28A068 bne $28A06C` SKIPS the `moveq #$E`, so it is **30 when `$81308C` is NON-ZERO** and 15 when it is 0 — and the call site is itself behind `tst.w $81308C / beq`, so the spark can *only* ever spawn in the 30-slot case. The narrow arm is unreachable from here. |
| pool E is **652 B**, "`$289F4E..$28A1D9`, ~7 entry points + 1 driver" | The 652 stops one instruction short of the record FILL. `$28A1DA` (the common fill) plus its **8-entry dispatch `$28A232`** and eight fill tails run to `$28A463`; the data runs `$28A464..$28AB85`. **Pool E is 1,302 B of code + 1,826 B of data**, and recon 50's own §10.2 says it never walked the templates. |
| `$289F54` has the two call sites the port reaches | **[M] `xref.py callers 289F54` finds EIGHT**, all `moveq #$14,D0`: `$253C1A` [0] and `$253EF8` [2] are ported; `$253DB6` [9], `$25401A` [3], `$254176` [4], `$2542BA` [5], `$2543E4` [6], `$25450E` [7] are behind loud named throws. **2 of 8 reachable** is the honest coverage sentence. |
| "the templates are PC-relative at `($28A506,PC)` / `($28A786,PC)`; art unpriced" | `$28A786` is **not a template, it is a 256-entry POINTER TABLE**, indexed by `$803916 * 4` with **no mask** — and [M] `$28A786 + 256*4 == $28AB86`, which is `addq.b #1,$803917`, **code**. It resolves to **15 distinct templates that differ only in a starting animation cursor**. `$28A506` is the LASER's, not the shot's. |
| 1,766 `$289F54` spawns / 6,185 frames = 0.29 per frame | **[M] 1,393 in 2,204 tapped frames on the shipped seed = 0.63 per frame, and 0 in the no-fire control.** Recon 50 ran `--no-pods`; L3 gave the option pods shots that hit things. **The number moved UP, and it moved for exactly the reason W52 §0.1 found one level earlier.** |

**AND ONE THING NOBODY HAD:** `$289F62 addq.b #1,$803917` is the FIRST
instruction of `$289F54` after its gate. `src/rng.js`'s own header has named
that site since wave 8 as the reason `$803916` is a compared column — *"any
unported caller of that routine desynchronises every later draw"* — and until
this wave the port did not bump it. **Porting the spark fixes a shared-RNG
desync the port has carried since wave 8**, and it visibly moves the
trajectory: [M] a tapped run's `$26C1C4` wall moves from step 2,204 to 2,192.

---

## 1. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---|---|---|
| `$289F3A..$289F4D` | 20 | the whole-pool clear (both halves + both count words) | `spark.js clearPool` |
| `$289F54..$289F95` | 66 | THE ALLOCATOR's entry, the `$813098` failure return, the shared-RNG bump, the template pick, the P1/P2 fork | `spark.js spawnSpark` |
| `$28A060..$28A095` | 54 | its shared tail: the 30-vs-15 scan and the `ori #1,SR` no-free-slot return | same |
| `$28A1DA..$28A231` | 88 | the record FILL from the 22-byte template | `spark.js fillSlot` |
| `$28A39E..$28A3DB` | 62 | fill tail for kind `$14`: the random heading, the speed clamp, `$241D34`, the 4x one-shot nudge | `spark.js fillTail28A39E` |
| `$28A098..$28A1D9` | 322 | THE DRIVER: budget, cull bound, both delay counters, the animation, three free paths, the 12-byte bulk emit into bucket 20 | `spark.js runSparkDriver` |
| `$242E24`, `$242FFC`, `$28ABE0` | 62 | three more members of the `$803917` RNG family | `rng.js` |
| — | — | `$28C714`'s note re-labelled: it is a SOUND CUE | `shots.js` |

**Zero new pools modelled beyond pool E. Pools A, B, C and D are untouched and
still counted notes. `games/gradius/` NOT TOUCHED.**

### 1.1 THE GEOMETRY, and every arithmetic closes on a landmark  [M]

```
$81D394 + 30*$22 == $81D790   P1 -> P2                      EXACT
$81D790 + 30*$22 == $81DB8C   P2 -> the live count           EXACT
$289F40 move.w #$3FD,D0 -> $3FE words = 2,044 B from $81D394
                          == both halves + BOTH count words  EXACT
$28A786 + 256*4  == $28AB86 == `addq.b #1,$803917`, CODE     EXACT
$28A5C2 + 36*4   == $28A652 == template 1's own base         EXACT
$28A770 + 22     == $28A786 == the pointer table             EXACT
$28ABFA + 64     == $28AC3A == `lea $81DB90,A0`, CODE        EXACT
```

and one cross-check that is worth more than any of them: **the descriptor
list's stride is `$C` = 12 mask words, and the record's own `($e,A6)` is
`$0208` = 1 wide x 8 high.** `2 + wide*high + 2 == 12`. The animation table's
spacing and the sprite's declared size agree, out of two unrelated places in
the cartridge.

### 1.2 Four semantics a "tidy" port gets wrong

1. **D5 IS BOTH THE PER-FRAME RECORD BUDGET AND THE CULL BOUND, AND IT MOVES.**
   `$28A0CA` builds `$700000D0`; `$28A102 subq.w #1,D5` decrements it once per
   live slot; `$28A17C cmp.l D5,D0` uses THE WHOLE LONG. The short-axis half of
   the off-screen bound tightens by one for every record already emitted this
   frame. Splitting them into two variables is right about the intent and wrong
   about the arithmetic. (`subq.w` never borrows into the high word, so `$7000`
   is stable — that is why it works at all.)
2. **A FREE SLOT COSTS NO `dbra`.** `$28A0FC beq $28A0F6` loops back without
   touching D7, so the walk runs until it has processed `$81DB8C` LIVE slots and
   is **not bounded by the pool**. A wrong count word reads the bullet driver's
   RAM as a spark record. The ROM has no guard; the port throws by address.
3. **EITHER DELAY COUNTER ADVANCES THE ANIMATION.** `$28A150` decrements
   counter B and, if it did NOT borrow, jumps to `$28A132` to try counter A;
   either borrow reaches `$28A15C`. [M] every one of the 15 spark templates has
   `+$12/+$13 = 0`, so counter A borrows on EVERY frame — which is why a spark
   is exactly as many frames long as its cursor allows and the `$0E`/`$06`
   counter B never gets to matter.
4. **THE DRIVER HAS ALREADY ADVANCED A6 BY 4** before it dispatches, so every
   displacement in `$28A132`/`$28A150`/`$28A15C` is relative to rec+4. Reading
   them as slot-base offsets shifts the whole record map by two fields — and it
   is what makes `($12,A6)` look like a pointer when it is the cursor.

### 1.3 [M] ENTRY 0 OF THE ANIMATION IS NEVER DRAWN, and it is harvested anyway

`$28A15C` reads the cursor BEFORE `$28A160 subq.w #4`, and `$28A164 bcs` frees
the slot on the borrow. So a record that reaches cursor 0 dies instead of
drawing `list[0]`, and the largest cursor any template carries is `$8C` = entry
35. **Predicted from the branch, then MEASURED: 35 distinct streams reached over
every run, `$22CA1C`..`$22CBB4`, and `$22CBC0` never once.** All 36 are
harvested regardless — trimming to 35 would size the harvest off my reading of a
branch instead of off the table's own extent, which is `46-diag`'s tank hulls.

---

## 2. THE POOL CENSUS — the drain proof, over long runs  [M]

The shipped bundle seed, `$810424 = $FF` each step, three inputs, to each run's
honest end. Per frame the probe scans all 60 slots for `word0 != 0` AND reads
`$81DB8C`, so "the count word and the slots agree" is an assertion on every
frame, not a summary.

```
                                   TAP (every 4)    HOLD          NO-FIRE (CONTROL)
[M] frames run                        2,192          1,766          4,001
[M] stopped by                       $26C1C4        $26C1C4        ran to the end
[M] pool E live slots, MAX            24 of 60       10 of 60       0 of 60
[M] $81DB8C max                       24             10             0
[M] $81DB8C vs the slot scan   0 DISAGREEMENTS  0 DISAGREEMENTS  0 DISAGREEMENTS
[M] frames back at ZERO after
    the first spawn                   2              1,717          -
[M] allocator FAILURE returns
    ($28A078 / $813098)               0              0              0
[M] bucket 20 records            22,185           117              0
[M] ...max per frame                  24             10             0
[M] first record                      lf+27          lf+23          never
[M] distinct spark streams            35             35             0
[M]   ...with art                     35             35             -
[M]   ...NAMED-missing                 0              0             -
```

**THE HELD RUN IS THE DRAIN PROOF AND IT IS THE STRONGEST ROW HERE.** The pool
fills to 10 over 26 frames and is then **empty on 1,717 consecutive frames** —
holding fire charges the beam and the ordinary shot cadence nearly stops (W52
§0.1), so the pool gets a burst and then nothing. A leaking pool cannot go back
to zero. The tapped run does the same thing under continuous pressure: 24 of 60
is the high-water mark of a pool that is being refilled 0.63 times a frame and
freed at least as fast.

**And the structural half, which is what makes 24 of 60 not luck:** every spark
is freed unconditionally by `$28A164` after at most 36 frames, whatever else
happens. There is no path that consumes a slot without one of the three frees
releasing it, and the three are `$28A116` (budget), `$28A1A0` (the animation
cursor) and `$28A1BC` (the off-screen cull), all of which `clr.w` word 0 AND
`subq.w #1,$81DB8C`.

**[M] AND THE BOARD SIZED BUCKET 20's STAGING BUFFER AT EXACTLY THIS POOL'S
CAPACITY**: `BUCKETS[20].capBytes` is 720 = 60 records of 12, and pool E is 60
slots. The same relationship W52 §0.2 measured for buckets 22/23. The bulk
writer cannot overrun its bucket; the port checks it by address anyway.

---

## 3. THE ART — 36 streams, 0.8 KiB, and BOOT WENT DOWN

```
[M] BOOT BEFORE   473.2 KiB   (export-web.mjs's own figure, HEAD's exporter)
[M] BOOT AFTER    472.0 KiB   -- 1.2 KiB SMALLER
[M] deferred      745.4 -> 746.2 KiB
    shard 8 spark   36 streams  mask 326 + col 510 = 0.8 KiB
```

Boot fell while 36 streams, two ROM windows and a ninth shard were added, and
the arithmetic is three numbers:

* **+0.8 KiB** — the two new ROM windows in `player.tables.json.gz`
  (`$28A5AC+$5DA`, the templates + list + pointer table; `$28ABFA+$40`,
  `$28ABE0`'s draw table). 133,612 B, from 132,824.
* **+0.5 KiB** — `manifest.json` for shard 8's entry and the fetch order.
* **−2.5 KiB** — **the manifest is written COMPACT now.** W47 §2.4's own rule
  is that `manifest.json` is the one body served UNCOMPRESSED, so every byte of
  it is a boot byte; [M] it was **10,282 B pretty-printed at one space per level
  and is 7,722 B with the whitespace gone. A quarter of the file was
  indentation.** Not one `note`, `why` or number is dropped — the prose W47 §2.3
  needs for the "SPRITE SHARD n DID NOT LOAD ... it holds N streams" panel is
  all still there, and any formatter puts the indentation back for a human.

**[M] AND THE OTHER IDEA WAS MEASURED AND REJECTED, recorded so nobody
re-derives it.** `player.tables.json`'s 117 ROM windows are **380,040 hex
characters**, which looks like exactly the waste W47 found in the stream table.
Re-encoding every window as base64 makes the raw JSON 27 KB smaller and the
**gzipped body 14.4 KB BIGGER — 133,612 → 148,032 B** — because hex carries 4
bits of entropy per byte and deflate eats it, while base64 carries 6 and it
cannot. Hex is the right encoding, and it is right by measurement.

Shard 8 is DEFERRED and fetched **fourth** (`SPR_ORDER = [0, 7, 6, 8, 1, 2, 3,
4, 5]`): its deadline is the first frame a shot CONNECTS, which is behind the
first enemy bullet (shard 7, +0.7 s) and the first fire frame (shard 6).
[M] first spark record lf+27 tapped, lf+23 held.

**Shard 0 is untouched**, so `capture.bin` is byte-identical and `bundlegate`'s
pixel identity cannot have moved.

---

## LOG (appended as findings arrive)

- opened.
- §0 [M]: **recon 50's 30-vs-15 branch is BACKWARDS**, its 652 B stops one
  instruction short of the record fill, `$289F54` has EIGHT call sites and not
  two, `$28A786` is a 256-entry POINTER TABLE whose far end is pinned by code,
  and its 1,766 / 6,185 spawn figure is now **1,393 / 2,204 = 0.63 per frame**
  because L3 gave the option pods shots that hit.
- §0 [M]: **`$289F62` bumps `$803917`, the SHARED RNG COUNTER**, and porting the
  spark closes a desync `src/rng.js` has named since wave 8. It moves the
  tapped run's `$26C1C4` wall from step 2,204 to 2,192 — the port changing
  toward the board, not away from it.
- §1.3 [M]: **animation entry 0 (`$22CBC0`) is provably never drawn** — predicted
  from `$28A15C`/`$28A164`, then measured: 35 of 36 streams reached, on every
  run. Harvested anyway, and named.
- §2 [M]: **THE CENSUS. 24 of 60 slots at the high-water mark over 2,192 tapped
  frames; the count word agrees with a full slot scan on 2,192 of 2,192 frames;
  0 allocator failures; and a HELD run fills to 10 and then sits at ZERO for
  1,717 consecutive frames.** 22,185 bucket-20 records where every run before
  this wave had 0.
- §3 [M]: **BOOT 473.2 -> 472.0 KiB. It went DOWN while 36 streams and two ROM
  windows were added**, because the manifest lost 2.5 KiB of indentation. And
  base64 for the ROM windows was measured and REJECTED: 14.4 KB bigger gzipped.
