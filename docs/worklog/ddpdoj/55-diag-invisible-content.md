# 55 — DIAG: WHAT IS STILL INVISIBLE, AND WHY

status: **DONE** — §9 ranks the causes, §10 is the WAVE LIST.

started / finished: 2026-08-05
role: DIAGNOSTIC. **READ-ONLY on `games/ddpdoj/src/` and `games/ddpdoj/tools/`** —
E5b (explosions) is writing there concurrently. This worklog is the only file I
committed; every probe I wrote lives outside the repo, in the session scratchpad.
`games/gradius/` not touched. **No web server was started, so none was left
running.**

target: `ddpdojblk` VERSION-B. Every measurement below was taken against the
**LIVE DEPLOYED BUILD `20260805014211`** — either the deployed page driven in
Chrome, or `dist/games/ddpdoj/` (the exact tree that was published) run headless.
**Nothing here was measured against the working tree**, deliberately: E5b is
editing `src/` and W35 §6.3's hazard is a *plausible* wrong number.

`[M]` = measured by me, this session. Anything from another document is marked
`[cited]` and named.

brief: the owner is playing the live build — *"okay, something fires. It looks
like shit. Laser looks like shit also and flickers. After initial tanks shots
come out of nowhere, tons of enemies completely invisible. I think shots have a
lot more sprites to go with them, same for laser. We're missing something
massive"* — plus, mid-audit, *"I think in the original the player sprite might
have a little hitbox circle in the middle that's also a bit animated? We have
none"*.

---

## 0. THE HEADLINE, IN ONE TABLE

`[M]` 3,000 logic frames from the shipped seed, deployed build, one scenario
(fly up, tap fire, two 120-frame fire-holds per 600 frames):

| | records | sprite PIXELS requested |
|---|---|---|
| drawn | 139,379 (72.6 %) | 129.2 M (20.7 %) |
| **skipped — NO ART IN THE SHEET** | **52,514 (27.4 %)** | **496.4 M (79.3 %)** |

**79.3 % of the sprite pixels this port asks for have no picture behind them.**
Records undersell it by 4x because the missing ones are the BIG ones: the set
includes 18x208 (288x208 px) and 11x144 records, while what draws fine is mostly
3x32.

That is the owner's "something massive", and it is **MISSING ART, not missing
producers.** §3 refutes the missing-producer hypothesis with the board's own
display list.

---

## 1. THE BRIEF'S PREMISE, CHECKED — the A/B/C split is right in KIND and wrong in WEIGHT

| the brief says | `[M]` verdict |
|---|---|
| there are at least two causes, A (missing art) and B (missing producers), needing different waves | **TRUE**, and C exists too. But the brief expects **B** to be the "something massive". **It is A, by an order of magnitude.** A = 496.4 M missing pixels; B (measurable) = the port already emits **more** records per frame than the board does in the only window where the two can be compared (§3) |
| E1's 326 distinct missing streams was a FLOOR | `[cited: brief]`. `[M]` **220 distinct now**, on this scenario, over 3,000 frames. That is **not** "106 fewer than E1": it is a different scenario and a different run length, and it is *also* a floor. The two numbers are not subtractable and I will not subtract them |
| recon 40: 8 of 30 buckets have producers | `[cited: W40 §2]`. **[M] ELEVEN of 30 today** — 0, 2, 3, 5, 7, 14, 15, 16, 19, 20, 23 |
| recon 40: 10 of the 13 unported type-5 calls are emission-path | `[cited: W40 §3]`. **[M] there are only TEN unported type-5 calls now**, not 13: `TYPE5_PORTED` holds 13 of 23 (`src/type5.js`). The unported ten are `$289B80 $27F95A $288E4E $2890F2 $255DD8 $2527CE $27E99E $252BD0 $25292A $252A52` |
| "the misses start at a specific point" | **TRUE and measured.** §2.3: drawn% is **94.2 % over frames 0–499** and collapses to **61.2 % at f1000–1499**. The opening tanks really are fine; everything after them is not |
| deployed and local might differ — "if they differ THAT is the headline" | **[M] THEY DO NOT.** `BUILD_ID` fetched from `https://gbtman.pages.dev/games/ddpdoj/src/buildid.js` **inside the live page** = `20260805014211`, byte-identical to `dist/games/ddpdoj/src/buildid.js`. `diff -rq games/ddpdoj/src dist/games/ddpdoj/src` differs only by `buildid.js` itself. **No divergence; not the headline.** Five waves verifying locally were, on this point, verifying the right thing |

**Where the brief is wrong about C**: it guesses that *shots* and *the laser* are
composited from multiple records of which the port emits only some. **[M] For the
shots that is FALSE** (§4.1) and **for the laser it is FALSE** (§4.2) — both emit
every record the ROM's own enqueue sites can produce. C is real, but it is the
**ship** and the **bullets**, not the shots and not the beam (§4.3, §4.4).

---

## 2. CAUSE A — THE MISSING ART. 220 STREAMS, AND THEY ARE NOT SPREAD EVENLY

### 2.1 By bucket — and three buckets draw NOTHING AT ALL  [M]

Per-bucket attribution is done by walking the emitted `$800000` list and cutting
it at the cumulative `perBucketRecords` boundaries `buildDisplayList` returns,
with the `$FC00 $3800 0 0 $0201` fillers excluded (2,480 of them in 3,000 frames;
the filler is a 1x1 record at `offs $000000`, which the sheet HAS, so anything
that counts fillers as records inflates "drawn" by ~1.3 %).

| bucket | what it is | records | drawn | **drawn %** | distinct missing streams | missing PIXELS |
|---|---|---|---|---|---|---|
| 0 | the enemies | 56,247 | 55,467 | **98.6 %** | 6 | 0.6 M |
| **2** | big background structures | 7,198 | **0** | **0.0 %** | **7** | **252.2 M** |
| **3** | background elements + midboss | 35,018 | 63 | **0.2 %** | **81** | **191.8 M** |
| 5 | ship + pod ground shadows | 4,240 | 3,220 | 75.9 % | 17 | 0.3 M |
| **7** | large emplacements | 6,604 | **0** | **0.0 %** | **53** | **49.1 M** |
| 14 | the player's shots | 21,772 | 21,772 | **100.0 %** | 0 | 0 |
| 15 | the two option pods | 6,000 | 6,000 | **100.0 %** | 0 | 0 |
| **16** | **THE LASER BEAM** | 1,300 | 106 | **8.2 %** | **29** | 2.0 M |
| 19 | the ship, aura, glow | 6,000 | 5,237 | 87.3 % | 29 | 0.4 M |
| 20 | the shot's impact spark (W53) | 1,517 | 1,517 | **100.0 %** | 0 | 0 |
| 23 | the enemy bullets (W52) | 45,997 | 45,997 | **100.0 %** | 0 | 0 |

**Buckets 2, 3 and 7 are 100 % invisible** and carry **89.7 % of all missing
sprite pixels**. E4's bullets and E5a's spark are 100 % complete — those waves
landed and stayed landed.

### 2.2 What is actually in the black holes  [M]

Bucket 2 has only **FOUR** distinct descriptors and every one is enormous:

```
$22DA70  10x112 c19    $22DED4  11x144 c19
$233F34   5x80  c21    $22CBCC  18x208 c20      <- 288 x 208 pixels
```

Bucket 3's 81 include `$12D430 2x32 c15` (the single worst record in the game:
14,104 hits in 3,000 frames), `$11E1FC 13x96 c16`, `$128D20`/`$127E7C 18x208 c17`
and a **38-frame animation run `$12C7B0..$12D3CC`, all 3x32 c15, every frame of
it missing**. Bucket 7's 53 include `$1727C4 10x136 c12` (1,355 hits) and a
**16-frame 3x40 c12 run `$155D2C..$1569C4`, all missing**.

That is what the owner sees as a black hole in the middle of the screen and as
"tons of enemies completely invisible": they are not enemies from bucket 0 (98.6 %
fine) — they are the **large mid-screen structures and emplacements**.

### 2.3 WHEN the misses start — the owner's "after the initial tanks"  [M]

drawn %, sampled every 25th frame:

```
f    0.. 499   94.2 %      <- the opening tanks. Looks nearly right, and IS.
f  500.. 999   85.5 %
f 1000..1499   61.2 %      <- the collapse
f 1500..1999   70.3 %
f 2000..2499   66.1 %
f 2500..2999   62.5 %
```

Distinct missing streams by the frame they FIRST appear:

```
f    0.. 249    4        f 1000..1249   58
f  250.. 499   65        f 1250..1499   27
f  500.. 749   13        f 1500..1749    7
f  750.. 999   36        f 1750..1999    7
                         f 2000..2999    3
```

**Two waves of first-appearance, at f250–499 and at f1000–1249.** The owner
described this from the couch before any instrument was pointed at it.

### 2.4 The live page agrees with the headless probe, address for address  [M]

Driven in Chrome against `https://gbtman.pages.dev/games/ddpdoj/`, the page's own
status line, verbatim:

```
BOOTED     [port] dl 49 drawn 30 ... NO ART 19: $233F34x1 $22DA70x1 $22DED4x1
TANKS+TAP  [port] dl 57 drawn 47 ... NO ART 10: $233F34x1 $22DA70x1 $22DED4x1
LATE-0     [port] dl 46 drawn 20 ... NO ART 26: $12CCC4x8 $12D430x8 $22DA70x1
LATE-2     [port] dl 102 drawn 90 ... NO ART 12: $12D2A0x4 $12D430x4 $22DED4x1
LATE-5     [port] dl 26 drawn 14 ... NO ART 12: $12D1D8x4 $12D430x4 $22E508x1
```

Same addresses, same shape, on the machine the owner plays. `PAGE ERRORS: none`;
`shards 8/8`, `spr 9/9` — **nothing is stuck in delivery, the pictures are not in
the bundle at all.** Screenshots: the opening tanks read correctly; by LATE-2 a
288x208 hole sits in the middle of the playfield.

### 2.5 ALL 220 EXIST IN THE CARTRIDGE, and the price is known  [M]

Resolved with the port's own `render/spritedir.js streamStride` against the
regions `render/regions.js` assembles, then packed and `gzipSync level 9`-ed the
way `tools/export-web.mjs` does:

```
RESOLVED in the cartridge mask ROM:  220 of 220     0 unresolvable
mask 93,608 words (182.8 KiB raw)    colour 274,095 words (535.3 KiB raw)
GZIP-9:  mask 11.9 KiB + colour 243.2 KiB  =  255.1 KiB
```

*(A trap, recorded so the next wave does not fall in it: `render/regions.js`
builds `sprmask`/`sprcol` as a **host-endian** `Uint16Array` over the raw file
bytes. Assembling them big-endian instead makes 218 of the 220 fail
`streamStride` as "not a stream start" — a wrong answer that looks like a
finding. Use `loadRegions`.)*

Priced by group — **and this is the whole argument for the wave order**:

| group | streams | gz cost |
|---|---|---|
| **b16 — THE LASER** | 29 | **7.8 KiB** |
| b19 — the ship's glow | 29 | 2.9 KiB |
| b5 — the shadows | 17 | 0.4 KiB |
| b0 — the enemies | 6 | 1.0 KiB |
| **subtotal: everything except the big structures** | **81** | **≈12.1 KiB** |
| b2+b3+b7 — the big structures | 141 | 242.0 KiB |

Today's whole sprite bundle is 307 KiB. **12.1 KiB buys the laser, the ship's
glow, the shadows and the last enemies.** 242 KiB buys the other 89.7 % of the
missing pixels and is a delivery decision, not a correctness one — the sheet is
already sharded and demand-driven (`SprShards`, W47), so it can land lazily.

---

## 3. CAUSE B — MISSING PRODUCERS. REAL, ENUMERATED, AND **NOT** THE BIG ONE

### 3.1 The board's own display list says the port is not under-emitting  [M]

The shipped `capture.bin` holds 161 frames of the BOARD's post-DMA sprite buffer.
Running the deployed build from the same seed for the same 161 frames:

```
BOARD   7,601 real records / 161 frames = 47.21 per frame
PORT    7,855 real records / 161 frames = 48.79 per frame
```

**The port emits 3.3 % MORE records than the board**, and 100 % of them are
drawable in that window. If whole classes of sprite were simply never produced,
this is the measurement that would show it, and it does not.

**THE LIMIT, STATED:** the capture is 161 early frames of `fly-around`, so this
refutes "the port is missing producers *at the start of stage 1*". It cannot
speak for f1000+. It is also a *record-count* comparison, not a per-object one —
and the stream ADDRESSES cannot be compared at all, because `export-web.mjs`
rewrites `capture.bin`'s records into the packed address space (a trap I fell
into once this session and am flagging so nobody else does: a naive comparison
reports "149 board streams the port never emits", and every one of them is an
artefact of the two lists living in different address spaces).

### 3.2 But the producer inventory is real, and here it is  [M]

Every `addi.w #$c,$80AFxx` enqueue stub in `$200000..$2B0000`, resolved to its
routine head and its bucket, then every `jsr`/`jmp` **absolute-long** caller of
each. `bsr` and PC-relative dispatch are invisible to this, so **every number is
a LOWER BOUND** (`tools/oracle/xref.py`'s own rule).

```
159 enqueue stubs + 2 bulk writers
637 absolute-long producer call sites
24 of 30 buckets have >= 1 abs.l producer in ROM
11 of 30 buckets receive records from the PORT
```

The **thirteen buckets with ROM producers that the port never fills**:

| bucket | abs.l sites | where they live |
|---|---|---|
| 1 | 73 | `$262848`, `$262B96..$263314` (the enemy/background installer), `$266052 $2665A2 $267508 $275D6A $27AD72` … |
| 4 | 2 | `$2810A2 $2810B4` |
| 8 | 19 | `$27FAB2 $27FD1A $280068..$280B20 $2811D8..$281316` — the bullet-side impact family behind the unported `$27F95A` |
| **12** | **1** | **`$2536AA`, inside `$253604` — THE SHIP'S AFTERIMAGE TRAIL. §4.3** |
| 13 | 9 | `$255EB4..$2562EA` |
| 17 | 13 | `$255182..$2551D2` (a hitbox box, §6) + `$27EAC4..$27F66E` |
| 18 | 5 | `$2528C8 $287374 $2873F4 $287452 $2874D2` |
| 21 | 5 | `$259C3A $2698C4 $2698E2 $2698F6 $269906` |
| 22 | 35 | the bullet TRAIL (`$281D9A`'s block, §4.4) + hitbox boxes + `$2703AA $2705EC $272C72 $27C432 $28E8DA..` |
| 24 | 1 | `$2A4D2E` |
| 25 | 33 | `$28490E..$285D3E` — one contiguous subsystem |
| 26 | 9 | `$25DD98..$25DFE8` |
| 28, 29 | 2 + 2 | `$2529BC $252A48` / `$252AC8 $252B3C` |

**Recon 40's two named pools are still both unported and still both invisible to
a `bsr` scan**: the effect pool `$288E4E` and the impact pool `$27F95A` are two of
the ten unported type-5 calls, and `$27F95A`'s family is exactly bucket 8's 19
sites. E5b is porting `$288E4E` right now, so bucket-8/`$27F95A` is the obvious
next producer wave — but **note what it costs and what it buys**: it adds records
to a page where 79.3 % of the pixels already have no picture. Producers before art
just adds more `NO ART` lines.

---

## 4. CAUSE C — MULTI-RECORD COMPOSITING. THE OWNER'S HYPOTHESIS, TESTED

Method: for each subsystem, enumerate **every** absolute-long call to an enqueue
stub inside its ROM address range, and compare that list against what `src/` runs.

### 4.1 The shots — **the hypothesis is REFUTED**  [M]

`$253A70..$254800` contains **25** enqueue sites and every one feeds bucket 14:
`$253B40 $253BD2 $253C08 $253CBA $253D4A $253D90 $253DA2 $253E42 $253EBE $253EE6
$253F64 $253FE0 $254008 $25409A $25412E $254164 $2541DE $254272 $2542A8 $25430E
$25439C $2543D2 $254438 $2544C6 $2544FC`. The only others in that range are the
four at `$254610..$254678`, which are the unreachable hitbox box of §6.

Bucket 14 in the port: **21,772 records, 21,772 drawn, 40 distinct descriptors,
ZERO missing.** The shot subsystem is complete on both axes. **A player shot is
not composited from records the port drops.**

### 4.2 The laser — **the hypothesis is REFUTED; the art is the defect**  [M]

The beam has exactly two abs.l emit sites, `$2550C6` (P1) and `$25514C` (P2), both
`jsr $23F508` → bucket 16, plus the segment handlers' shared tail
`$2548A0/$254962/$254A3C/$254B44 → $2548BA` which reaches the same stub. **The
port runs all of them** (`src/laser.js` `emit()`, `runBeamDraw`, `runSegmentDriver`
— type-5 calls #10 and #11, ported at W45). No record is dropped.

What IS wrong is bucket 16's art: **33 distinct descriptors, 29 of them MISS.**

```
$01302C 2x16 HAVE   $013050 MISS  $013074 MISS  $013098 2x16 HAVE
$0130BC MISS  $0130E0 MISS  $013104 MISS  $013128 MISS  $01314C MISS  $013170 MISS
$01447C / $0144E0 / $014544  3x32  ALL MISS
$022AEC / $022B90 / $022C34 / $022CD8 / $022D7C / $022E20  4x40  ALL MISS
$011E8C 7x80 HAVE — and $0120C0 $0122F4 $012528 $01275C $012990 $012BC4 $012DF8 MISS
$013B94 4x32 HAVE — $013C18 MISS
```

**That is the flicker, and it is not a phase bug.** The beam's descriptor is
stepped through an animation every frame (`$255086..$25509E` copies five words
from `($12,A6)+($10,A6)`; `$2550A0 subi.w #$a` walks the pointer and wraps). The
sheet holds **2 of the 10** frames of the 2x16 cycle, **1 of 8** of the 7x80
cycle and **0 of 3** of the 3x32 cycle — so the beam appears on a minority of its
own animation steps and vanishes on the rest. **W45's "five absent art streams"
`[cited]` was itself an undercount; E2 did not fold them in — 29 are still
absent.**

There is a SECOND, separate 50 % duty cycle underneath, and **that one is
faithful**: `$2550AE..$2550C6` and the segment tail both gate the emit on
`$80390C`, the word `$23BE92 bchg #0,$80390D` toggles every main-loop iteration.
The port reproduces it exactly (`laser.js:1030`, `hPhaseEmit`). It is the board's
own 50 %-transparency trick, the same one `render/capture.js` documents for the
exhaust and the shadows, and on a 60 Hz LCD it reads as strobing. **Fix the art
first; if it still reads wrong after that, the phase is a fidelity decision, not
a bug.** Also unported and COUNTED on exactly the frames the beam draws:
`$289FC0`/`$289FDA`, the beam's own impact effect.

### 4.3 The SHIP — **the hypothesis is CONFIRMED, and this is the C finding**  [M]

`$2491C0..$24A7FF` contains **eight** enqueue sites:

| site | bucket | port |
|---|---|---|
| `$249EE2` | 5 | RUN (ground shadow) |
| `$24A532` | 19 | RUN (the aura) |
| `$24A538` | 19 | RUN (THE SHIP) |
| `$24A632` | 19 | RUN (the glow) |
| `$24A6C4` `$24A700` `$24A730` `$24A756` | 19 | not run — all inside the script walker `$24A6B4`, gated on state bit 8, `[cited: W12]` measured 0 on 2,301 frames, and `src/shipsprite.js` throws loudly if it is ever set. **Correctly not run.** |

**And one more, which nothing in the port runs and which no scan of the player's
own address range would find:**

```
$24A53E  jsr $253604          <- between the ship's enqueue and the phase test
$253608  tst.b ($3f,A6)       <- the gate
$253628 / $253636             <- two position/anim RING BUFFERS
                                 $8127F4+$812874  or  $812834+$8128B4
$253660  moveq #$5,D7         <- SIX entries
$253680  move.l ($a,A6),(A3)  <- it stores THE SHIP'S OWN sprite descriptor
$253684  move.l ($2,A6),(A2)  <- and the ship's own position
$2536A2  addi.l #-$5FF0400,D1
$2536AA  jsr $23FDB2          <- $80AF24 / $80AFEA  =  BUCKET 12
```

**`$253604` is the ship's AFTERIMAGE TRAIL: a six-deep history of the ship's
position and image, re-drawn behind it as up to six extra records per frame, in
colour `$1F`, at the ship's own size (`move.w #$620,D3` = 3x32).** `src/type5.js`
runs `$24A440`; `src/shipsprite.js` reaches `$24A53E` and **notes it as
"it writes nothing in bucket 19 and nothing in the compared set"** — which is
true and is exactly why it was missed. It writes bucket **12**, and **bucket 12
has exactly ONE producer in the entire cartridge and this is it** (§3.2).

Three things make this the most actionable finding in the audit:

* **it needs NO NEW ART** — it re-emits `($a,A6)`, the ship's own descriptor,
  which is in the sheet already (`$001520 $001200 $001840` … all HAVE);
* **it is one small routine** — `$253604..$2536B4`, plus its 6-entry ring;
* **it is the tank problem a third time.** The tank was hull + turret from two
  tables and the port drew one; the ship is ship + aura + glow + shadow **+ six
  trail records** and the port draws four. The shipgate that says 0 divergent
  compares **bucket 19 and bucket 5 staged bytes** `[cited: src/shipsprite.js]` —
  it is structurally incapable of seeing a bucket-12 record, exactly as the
  mover gate cannot see sprite fields.

`tst.b ($3f,A6)` gates it and I did not find the writer of `($3f,A6)` this
session; the trail may only run in a state `fly-around` never entered (the 161
board frames contain **zero** colour-31 records, §6). **An implementer must find
that writer before claiming the trail is missing from normal play** — what is
certain is that the port cannot produce the record under ANY condition today.

### 4.4 The bullets — a second compositing gap  [M]

`$281D9A` feeds buckets 22 **and** 23 (`src/bulletdriver.js` transcribes both
counter writes). `src/mover.js trailEmit` (`$283194..$2831A6`, kinds 27/36/37/38)
**moves** an entry from bucket 23 to bucket 22 — "every trailing bullet two
display-list records". **[M] Bucket 23: 45,997 records in 3,000 frames.
Bucket 22: ZERO.** Either no kind-27/36/37/38 bullet occurs in this scenario or
the trail path never fires; I did not separate those two, and an implementer must
(the cheap test is to count kind-27/36/37/38 dispatches in the same run).

---

## 5. "LOOKS LIKE SHIT" — what is drawn WRONG, as opposed to not drawn

`[M]` Live screenshots + the 161-frame board comparison:

* **Nothing is drawn at the wrong SIZE or POSITION that I can find.** Board and
  port agree on record counts to 3.3 % in the compared window, and the ship, the
  pods, the shadows and the shots all land where `attachreport` predicts.
* **No palette defect found.** The board uses colours `c0 c2 c9 c10 c11 c24 c26`
  in the captured window; every colour the port emits is in that set or belongs
  to the missing art (`c12 c15 c16 c17 c19 c20 c21 c28 c30`).
* **The DEPTH order is right**: `attachreport` re-run this session — "ground-plane
  (shadow) records drawn BEHIND the ship 243, IN FRONT 0".
* **So "looks like shit" is the 79.3 % of missing pixels, not a rendering
  defect.** The one thing I would call visually wrong beyond absence is that the
  invulnerability aura (5x40 c2, `$057BE4..$0587D8`, all present) is drawn as a
  large orange flame under a ship whose six trail records and whose four missing
  glow frames are absent — i.e. even the parts that ARE there are an incomplete
  composite.
* The ship's own bucket 19 is **87.3 %**, not 100: `$001F48 $0021AC $002188
  $0023EC` — **four of the six 1x32 c26 glow frames have no art.** The oldest
  "finished" subsystem in this port is missing art too.

---

## 6. THE OWNER'S HITBOX MARKER — the ROM settles it, and the answer is NO

The owner is right that the cartridge contains a hitbox display. They are right
that we have none. **They are wrong that the board draws it, and nobody should
add it.** All `[M]`, from the decrypted image:

**There are FOUR byte-identical copies of one routine**, one per subsystem:

```
$253578   (the ship's block)        -> jsr $23F7F4  = bucket 22
$2545E6   (the shot block)          -> jsr $23F7F4  = bucket 22
$25515A   (the beam-draw block)     -> jsr $23EB6A  = bucket 17
$27F7F0   (the bullet block)        -> jsr $23F7F4  = bucket 22
```

Each loads `move.l #$11EC,D2` (the sprite descriptor), `move.w #$210,D3`
(1x16 = **16x16 px**), `move.w #$1F,D4` and then emits **four** records at
`#$001F`, `#$401F`, `#$201F`, `#$601F` — the same picture in all four flips, at
`(pos ± ($16,A0), pos ± ($12,A0)) + ($10,A0)`. **It is a four-corner BOX around
an object's collision extents. It is not a circle and it is not in the middle.**

**None of the four is reachable.** For each of `$253578 $2545E6 $25515A $27F7F0`:

```
jsr/jmp absolute-long callers : 0
bsr (byte, word and long disp): 0        (whole-image scan, $200000..$2B0000)
longword occurrences anywhere : 0        (so no pointer table reaches it either)
```

**And the board never draws it.** `[M]` All 161 captured board frames, every
record: **colour 31 appears 0 times.** (Board colours used: `c0:653 c2:80 c9:100
c10:6166 c11:174 c24:281 c26:217`.) `$0011EC` is also **not** in the shipped
sheet's 783 keys.

**Conclusion, plainly, so nobody invents one:** the cartridge carries a
four-corner hitbox-box debug drawer in four places; it has no caller of any kind
that three independent searches can find; it draws colour 31; and the board draws
zero colour-31 records. **There is no hitbox circle at the ship's centre in this
build.** What the owner may be remembering as "a little thing in the middle,
a bit animated" is most plausibly the **1x32 colour-26 glow** (`$002068 $0022CC`
present, `$001F48 $0021AC $002188 $0023EC` **missing**), which is drawn at
`(-30,-16)` from the ship on alternate frames and steps through six frames via
`$24A626 subq.w #4,($48,A6)` — **four of whose six frames we do not ship** (§5).
That is a testable prediction: ship the four and ask the owner again.

---

## 7. WHAT I DID NOT MEASURE, AND WHERE THE NUMBERS STOP

* **One scenario.** 220 is a floor for *this* input over 3,000 frames of stage 1.
  Another route, another rank, another ship reaches art I never asked for.
* **Bucket attribution assumes the drain order is `0,1,2,…,29`,** which is what
  `src/displaylist.js` implements and `pgm.py dlgate` gates `[cited: W11]`. It
  is not independent of the port.
* **The board comparison covers 161 early frames only** (§3.1). There is no board
  oracle for f1000+, which is precisely where the collapse is.
* **I did not run MAME.** Every board number is the shipped capture read directly.
* **`($3f,A6)`'s writer is unfound** (§4.3) and so is the reason bucket 22 sees no
  bullet trails (§4.4).
* **The `NO ART` policy is doing its job**: `portSpriteList` zeroes a missing
  record's WIDTH and keeps everything behind it, so nothing downstream of a miss
  is lost. What the owner sees is absence, never corruption.

---

## 8. THINGS I FOUND THAT ARE NOT DEFECTS, RECORDED SO THEY ARE NOT RE-FOUND

* The deployed build **is** the local `dist/` (§1). Stop re-checking.
* Buckets 14, 15, 20, 23 are at **100 %**. E4 and E5a hold.
* The display-list **filler** is a 1x1 record at `offs $000000`, which the sheet
  HAS; it is counted as *drawn*, not as *blank*. 2,480 in 3,000 frames.
* `capture.bin`'s records are in the **packed** address space, not the
  cartridge's. Never compare them with the port's `offs` by value.
* `render/regions.js` assembles the sprite ROMs **host-endian**; a big-endian
  re-implementation fails `streamStride` on 218 of 220 real streams (§2.5).
* The beam's 50 % `$80390C` duty cycle is the board's own (§4.2). Faithful.

---

## 9. THE CAUSES, RANKED BY HOW MUCH OF THE SCREEN THEY ACCOUNT FOR

| rank | cause | share of missing sprite pixels `[M]` | what it needs |
|---|---|---|---|
| **1** | **A — MISSING ART, buckets 2/3/7** | **89.7 %** (493.1 M of 496.4 M) | 141 streams, 242.0 KiB gz. An EXPORT wave, no `src/` change |
| **2** | **A — MISSING ART, the laser (b16)** | 0.4 % of pixels but **91.8 % of the beam's own records** | 29 streams, **7.8 KiB gz**. Highest visibility per byte in the project |
| **3** | A — missing art, the ship's glow + shadows + last enemies | 0.3 % | 52 streams, 4.3 KiB gz |
| **4** | **C — MULTI-RECORD COMPOSITING: the ship's afterimage trail** | not in the miss set at all — the port never asks | port `$253604` → bucket 12. **No art needed** |
| **5** | C — the bullet trail (bucket 22) | unknown, 0 records today | diagnose then port |
| **6** | B — MISSING PRODUCERS (13 buckets, 205+ abs.l sites) | 0 % of *current* misses; unbounded future content | one subsystem at a time, **art first** |

**The owner's "more sprites per shot" hypothesis: half right, and the half that
is right is the half they did not name.** Shots — no. Laser — no. **The ship —
yes, six records.** Bullets — probably yes.

---

## 10. THE WAVE LIST

**W56 — ART: THE LASER.** Add bucket 16's 29 streams to the export set.
`$013050 $013074 $0130BC $0130E0 $013104 $013128 $01314C $013170` (the 2x16
cycle), `$01447C $0144E0 $014544 $014D28 $014D8C $014DF0 $014E54` (3x32),
`$022AEC $022B90 $022C34 $022CD8 $022D7C $022E20` (4x40), `$0120C0 $0122F4
$012528 $01275C $012990 $012BC4 $012DF8` (7x80), `$013C18` (4x32). **7.8 KiB gz.**
Gate: bucket 16 drawn% goes 8.2 → 100 over a hold-fire run. Then ask the owner
whether it still flickers — if it does, the `$80390C` duty cycle is next and it
is a fidelity decision, not a bug.

**W57 — ART: THE SHIP AND THE LAST ENEMIES.** Bucket 19's 29 (`$001F48 $0021AC
$002188 $0023EC` first — the glow), bucket 5's 17, bucket 0's 6. **4.3 KiB gz.**
Gate: b19 → 100 %, b5 → 100 %, b0 → 100 %.

**W58 — PRODUCER: `$253604`, THE SHIP'S AFTERIMAGE TRAIL (bucket 12).** Port
`$253604..$2536B4` and its two 6-entry rings. **First find the writer of
`($3f,A6)`** and say in the worklog when the trail is armed; if it is never armed
in stage 1, port it anyway and say so, because bucket 12 has exactly one producer
in the cartridge and this is it. No art needed. Gate: bucket 12 non-zero on the
frames `($3f,A6)` is set; and **extend the shipgate to compare bucket 12**, since
today it compares 19 and 5 only and is blind to this by construction.

**W59 — ART: THE BIG STRUCTURES.** Buckets 2, 3, 7 — 141 streams, **242.0 KiB gz**.
This is 89.7 % of the missing screen and it is a delivery-budget conversation:
the shard machinery (W47) already demand-loads, so put the 18x208 monsters in
their own late shard. Order within it by hit count: `$12D430`, `$22CBCC`,
`$1727C4`, `$22DED4`, `$22DA70`, `$233F34`, `$11E1FC`, then the `$12C7B0..$12D3CC`
38-frame run and the `$155D2C..$1569C4` 16-frame run.

**W60 — DIAGNOSE bucket 22.** Count kind-27/36/37/38 bullet dispatches in a
3,000-frame run and decide whether `trailEmit` is unreached or broken.

**W61+ — PRODUCERS.** `$27F95A` (bucket 8's 19 sites), then `$288E4E` if E5b has
not closed it, then buckets 25, 1, 22. **Not before W56–W59**: a new producer on
a page where 79.3 % of the pixels have no art just prints more `NO ART`.

---

*Every figure marked `[M]` was produced this session against
`dist/games/ddpdoj/` (build `20260805014211`), the live deployed page, or
`games/ddpdoj/rip/rom/` + `tools/oracle/out/maincpu.bin`. No web server was
started. No file under `games/ddpdoj/` was modified.*
