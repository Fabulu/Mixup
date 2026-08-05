# 61 — IMPL: I2, THE ITEM ITSELF — dropping it, moving it, drawing it, collecting it

status: **DONE** -- gate ALL GREEN 51/0/0, 767 unit tests, webgate 14/14, build-dist clean with PUBLISH_VERBATIM still 5. [M] items DROP, FALL, DRAW and are COLLECTED; the power level goes 0 -> 2 -> 4 and the shot's slot-search window 4 -> 5; NO RANK WRITE became reachable; boot 477.7 -> 480.7 KiB.

started: 2026-08-05
role: IMPLEMENTER (SOLE writer to `games/ddpdoj/`; `games/gradius/` NOT TOUCHED)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

**THE OWNER, PLAYING THE LIVE BUILD:** *"There's some bigger ships that show up
now and they're supposed drop powerups, which they don't. And I'm sure the
powerups don't work yet"*

`[M]` = measured by me this session over
`games/ddpdoj/tools/oracle/out/maincpu.bin` (the decrypted build-B image,
address == file offset) and over the PORT driven from the shipped bundle seed.

Scope, per recon 59 §10's wave I2 and I1's §6: `$27E812`, `$27E99E` (type-5 call
#18), the fill + BOTH dispatch tables, the six item bodies, the ten collect
routines, `$286128`, and 139 art streams.
**OUT OF SCOPE: the hyper-stock kinds `$0C`/`$14` — REFUSED, per recon 59 §11.8.**

---

## 0. THE BRIEF'S PREMISE, CHECKED — and FIVE corrections

Recon 59's geometry, tables and addresses all REPRODUCE. Everything below was
read out of `maincpu.bin` this session.

```
[M] $27E812's six `lea`s ARE the six pool bases, D2 = 7/1/1/5/5/0        EXACT
[M] $816B7A + $640 == $8171BA;  $27E98A clears #$321+1 words = 1,604 B   EXACT
[M] $27F746 -> $27F766 $27F780 $27F79A $27F7B4 $27F7CE $27F7B4
             $27F7E8 $27F7E8   ([5] ALIASES [3]; [6]/[7] are CODE)       EXACT
[M] $27E9F8 -> $27EA2A $27EBDC $27ED8C $27EF50 $27F1A6 $27F254
             $27F2F0 $27EA18   (entry [7] IS the `rts` at $27EA18)       EXACT
[M] the five templates and all five art tables are recon 59 §1.2/§6, word
    for word and address for address; 172 entries, 139 distinct           EXACT
[M] $27F300/$380/$400/$480 + 8 + 30*4 land on the NEXT header;
    $27F508 + 8 + 17*4 == $27F54C, the collect tail itself                EXACT
```

| the record / the brief says | [M] this session |
|---|---|
| recon 59 §4.3 and §7: **"`$286128` is ABSENT from `src/score.js`"**, and the brief repeats it as scope | **IT IS PORTED, and has been since W34.** `src/score.js:730 scoreByMask` IS `$286128`, with both `btst`s and both `bcdAdd`s. Re-read against the listing this session and it matches. The wave's score work is therefore the two CALL SITES, not the adder. |
| recon 59 §0: *"IT IS NOT RANDOM AND THERE IS NO RNG IN IT"* (of the drop) | **True of the DROP and false of the ITEM.** [M] `$27EACE jsr $242E24` and `$27EC7E jsr $242E24` are the kind-`$0`/`$4` INITS — the item's launch ANGLE is a random byte — and `$242B3C` is drawn by both bounce arms and by **both collect tails** (`$27F5DE`). So the moment an item exists the shared `$803916`/`$803917` counters move, on frames they did not before. Measured in §5. |
| recon 59 §4.3: *"and whatever `$25270C` rebuilds"* | **`$25270C` IS A BEAM RESET.** [M] it clears `$811EF2` (the beam record), `$811F32` and `($16,A1)` = `$811F48` (the drawn column), all **32 `$30`-byte slots of `$8112F2`** (`src/laser.js SEG`), `bclr #7,($1,A2)` on `$8104AB` and `andi.w #$DFFB,$8104AA`. **Picking up a power-up destroys the beam you are firing.** |
| recon 59 §9.5: *"the exact end of `$25313D` … ±8"* | **[M] `$25313C rts` is the last instruction**; `$25313E` is `tst.w $8103E6`, a different routine. The region is `$252C96..$25313D`, 1,192 B exactly. |
| recon 59 §1.2 field map: `+$1A` speed, `+$1B` angle | **CONFIRMED here** (unlike pool B, where W54 found `50-recon` backwards): `$2417DE` reads `($1a,A6)` as D0 = the SPEED INDEX and `($1b,A6) & $3F` as D1 = the ANGLE. |

**AND ONE THING NOBODY HAS WRITTEN DOWN: the kind-`$8` body HOMES ON A FIXED
POINT.** [M] `$27EE2E`/`$27EE76 jsr $242038` with `D2 = $4600, D3 = $1C00` — the
`aim64` this port has had since wave 8 — and `$27EE88 jsr $242494` is an
octagonal DISTANCE (`|dy| - |dy|/4` vs `|dx|`, max + min/2). At range `<= $200`
it latches `bset #0,(A6)`, sets speed `$0A`, and spirals `+$10` of angle per
`($1e,A6)` tick. That is 84 bytes of behaviour recon 59 records only as
"the `$08` kind's homing".

---

## 1. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---:|---|---|
| `$27E812..$27E889` | 120 | THE ALLOCATOR, six pool arms, the pool-FULL return | `items.js spawnItem` |
| `$27F6AE..$27F6E3` | 54 | THE FILL — the status word, the dying object's position, 26 B of ROM template | `items.js fill27F6AE` |
| `$27F746..$27F7E7` | 162 | the 8-entry template table + six 26-byte templates, RANGE-CHECKED | ROM window + `TEMPLATES` |
| `$27E98A..$27E99D` | 20 | the whole-family clear, `#$321` words | `clearItemPool` |
| `$27E99E..$27E9F7` | 90 | **THE DRIVER**, type-5 call #18 | `runItemDriver` |
| `$27E9F8..$27EA19` | 34 | the 8-entry kind dispatch, RANGE-CHECKED **and ALIGNMENT-checked** | `DISPATCH` |
| `$27EA2A`, `$27EBDC`, `$27ED8C`, `$27F1A6` | ~1,700 | four kind bodies, their inits, their motion routines and their emits | `body27EA2A` … |
| `$27EF50`, `$27F254` | — | **REFUSED**, and unreachable by construction (§2) | a loud named throw |
| `$27F2F0` | 14 | THE FREE — and it clears a LONGWORD | `freeItem` |
| `$27F54C`, `$27F582` | 168 | the two collect tails, `$10` and `$1000` through `$286128` | `collect27F54C` / `collectMax27F582` |
| `$27F5C2` | 50 | their shared tail — angle from the short axis, speed from the RNG | `tail27F5C2` |
| `$27F5F4`, `$27F656` | 186 | the two collected-animation steppers, 30 frames and 17 | `collectedStep27F5F4` |
| `$252C96..$25313C` | 1,192 | **EIGHT of the ten collect routines** (two refused) | `collect252C96` … |
| `$25270C`, `$252754` | 176 | the BEAM RESET a power-up runs | `beamReset25270C` |
| `$242AC6` | 46 | the double-dabble BCD converter | `bcd242AC6` |
| `$242B3C` | 26 | a 32nd RNG family member, its 256-byte table a NEW window | `drawByte242B3C` |
| `$242494` | 36 | the octagonal distance kind `$8` latches on | `dist242494` |
| `$242684` | 30 | the off-screen test, returning carry | `offScreen242684` |
| `$275B06`, `$275B1A` | 20 | **THE DROP** — two counted notes replaced by two calls | `handlers.js deathSeq85` |

**Nine new ROM windows, 1,200 bytes, and one new sprite shard.**
`games/gradius/` NOT TOUCHED.

### 1.1 READ PAST THE APPARENT END — what was there

`docs/knowledge/02`'s fall-through trap, seventeen incidents. Every routine in
this wave was read to the instruction AFTER its `rts`, and three of them are
worth writing down:

* **`$27F23C` IS AN `rts`, AND IT IS CALLED.** Kind `$10`'s init is
  `$27F1B2 bsr $27F23C` and `$27F23C` is `4E75`. That kind has NO init — its
  speed, angle and lifetime stay at the template's zeroes, which is why it is
  the only body whose motion is the scroll pair and not `$2417DE`. A reader who
  took the `bsr` for a routine would go looking for one.
* **`$27EACA nop / $27EACC rts` (and `$27EC7C`, `$27EE2C`, `$27F23A`) are
  ALIGNMENT PADDING after a `jmp`,** not code. [M] nothing in
  `$27E812..$27F7E7` branches to any of them. Kind `$10`'s `$27F23C` is the one
  that looks identical and is not.
* **`$27F7E8` is `4E75 204E 4A50 6AF8` — `rts / movea.l A6,A0 / tst.w (A0) /
  bpl`.** It is where template entries [6] and [7] point, and it is what makes
  the template range check a real check rather than a precaution: D0 = `$18`
  copies twenty-six bytes of INSTRUCTIONS into a record's `+$06..+$1F`, which
  includes the collision half-extents and the lifetime.

## 2. THE REFUSAL — kinds `$0C` and `$14` are UNREACHABLE BY CONSTRUCTION

Recon 59 §5.2 and the brief: one extra hyper item is `+1` to `$81B65C`, which
`$285A62 add.w $81B65C,$81B646` **ACCUMULATES** at the player's next super, and
`$2608D2` turns into **+16 RANK, PERMANENTLY**. Cause and symptom in different
objects and different frames.

**So the refusal is at the ALLOCATOR, not at the collect routine.**
`spawnItem` will not allocate D0 = `$C` or `$14`; the pools stay empty; and the
two dispatch entries are a **loud named throw** rather than a quiet return,
because a record of a kind the allocator says cannot exist means something wrote
a status word behind it. `$2530BE`/`$2530E6` are therefore not merely unreached —
**there is no path to them.**

The refusal is COUNTED with the player, the stock word and the reason
(`unportedLog`, under `$2530BE`/`$2530E6`).

**AND IT COVERS ONE OF THE TWO DOORS, WHICH IS WORTH SAYING PLAINLY.**
`$27E812` is the door this wave opened and the refusal shuts it. The OTHER way a
hyper item exists on the board is `$27E912` — [M] all four of its callers are
inside the pending-item flush `$2875B4..$287720` — and that allocator is
**entirely unported**, along with the whole `$81B64A → $287682 → $81B6E0`
chain that feeds it (§5). Two doors, both shut, for two different reasons.

**AND THE ANSWER TO THE BRIEF'S QUESTION, EXPLICITLY: NO HYPER STOCK BECAME
REACHABLE, AND NO RANK WRITE BECAME REACHABLE.** §5. [M] the whole-port census
of `$81B65C`/`$81B65E` outside `src/items.js` is `src/score.js:159`, a READ
(`$286782 cmpi.w #$5`), and nothing else.

## 3. THE MEASUREMENT — `tools/w61itemgate.mjs`, with a CONTROL and a TREE CONTROL

The PORT replayed from the shipped bundle seed. **Nothing is compared against
the board; no MAME was run.** The fire input is an INTERVENTION
(`docs/knowledge/09`) and the tool says so. Every run stops at the same wall,
`UNPORTED $292902` — the stage-1 boss, W34's own frontier.

```
[M] MODE none  (CONTROL)   frames 6,184
      ITEM POOL CENSUS   max live 0 of 25, max $8171BA 0, disagreements 0
      $27E812 SPAWNS     (none)          DRAWN  0 records
      power words        $810406/$810408  0/0 throughout
[M] MODE tap               frames 6,100
      ITEM POOL CENSUS   max live 1 of 25, max $8171BA 1, disagreements 0
                         frames back at ZERO 5,493 (longest run 2,952)
                         first spawn frame 695
      $27E812 SPAWNS     2 x kind $0 @ $275B06
      DRIVER $27E99E     610 records walked, 488 emitted, 120 animation steps,
                         2 freed
      DRAWN ($800000)    608 item records over 608 frames, first at frame 695
      COLLECTED          2 x mask $B0 / score $10, first at frame 937
      POWER              $810406/$810408  0/0 -> f937 2/2 -> f3089 4/4
      SHOT cursor        $25523C (word 4) -> $255240 (word 5)   ** ADVANCED **
      POD  cursor        $255278 (word 4) -> $25527C (word 5)   ** ADVANCED **
[M] MODE hold              frames 5,869
      1 spawn, 1 collect, power 0/0 -> 2/2, POD cursor word 4 -> 5
```

**THE CONTROL DOES WHAT A CONTROL MUST**: 6,184 frames with nothing pressed give
0 spawns, 0 draws and 0 power. Items appear only because something died.

### 3.1 THE POOL CENSUS — E5b's standard, and the honest shape of it

The census is a SECOND INSTRUMENT: `itemCensus` scans all 25 slots every frame
and does not consult `$8171BA`; the driver does not consult the census.

```
[M] over 6,100 tapped frames:  count-vs-slots disagreements 0 of 6,100
[M] back at ZERO on 5,493 frames, longest consecutive run 2,952
[M] $8171BC (fill B's variant counter) is 0 on every frame of every run --
    the hyper path is what writes it and the hyper path is refused
```

**AND THE POOL IS STRESSED, because two records prove very little.**
`--stress N` calls the REAL `$27E812` N times a frame at a labelled synthetic
site and every row says STRESSED:

```
[M] tap --stress 3          frames 5,833
      max live 10 of 25, max $8171BA 10, disagreements 0 of 5,833
      1,482 collections (192 x score $10, 1,290 x score $1000 -- THE AT-MAX
      PATH), 1,475 frees, 60 of 139 shard-12 streams reached
      $27E884 (the pool-FULL return) COUNTED 8,561 times
[M] tap --stress 3 --pulse  (pressure stops at frame 1,500)
      max live 10 of 25, disagreements 0, and the pool then returns to ZERO
      and STAYS there: 4,047 zero frames, longest run 3,057
```

**TEN OF THE TWENTY-FIVE SLOTS ARE REACHABLE BY ANY CODE THIS PORT RUNS**, and
that is a fact rather than a shortfall: 12 of the other 15 belong to the two
REFUSED hyper kinds and 2 to kind `$4`, which only the player's own death
(`$24A10E`, behind the unported `$249F8A`) and the boss can drop.

## 4. THE POWER LEVEL — measured, and it is the owner's actual question

**[M] IT CHANGES, AND THE SHOT BEHAVIOUR CHANGES WITH IT.**

| | level 0 | after 1 pickup | after 2 |
|---|---|---|---|
| `$810406`/`$810408` | 0 / 0 | 2 / 2 | 4 / 4 |
| `$8127E4` (SHOT cursor) | `$25523C` | `$25523E` | `$255240` |
| ...the word it points at — **the `dbra` COUNT** | **4** | **4** | **5** |
| `$8127E8` (POD cursor) | `$255278` | `$25527A` | `$25527C` |
| ...its word | **4** | **5** | **5** |

**The shot's slot-search window goes 4 → 5 and the pods' 4 → 5, ONE POWER STEP
APART**, because the shipped row's two lists are `0004 0004 0005 0006 0006`
(shot) and `0004 0005 0005 0006 0006` (laser). That asymmetry is the cartridge's
and it is why a port that computed a "level" instead of walking the cursor would
be wrong at level 1 on one of the two.

**AND THE CONSEQUENCE, IN KILLS:** [M] over the same 6,100 tapped frames the
tree control gives **HEAD 298 kills / 5,787 score and W61 308 / 5,848** — more
simultaneous shots alive, ten more things dead.

**[M] AND A NEW MEASURED FACT ABOUT THE `$25520C` ARRAY, which recon 59 §9.6
could not settle: the twelve longwords are SIX INTERLEAVED (shot, laser) PAIRS**
— `$25523C $255278 $255246 $255282 …`, not twelve lists in order. That is why
`$252CEC movea.l ($4,A0,D0.w)` and `$252CF4 movea.l (A0,D0.w)` read two entries
four bytes apart, and it makes "the row index must be EVEN" a fact rather than a
precaution. It also corroborates the port's own two measured cursors from the
other side: `src/options.js` measured `$8127E8 = $255278`, which is entry [1] —
row 0's LASER list — and `src/shots.js` measured the word behind `$8127E4` as 4,
which is `$25523C`'s word[0], row 0's SHOT list. **Two independent RAM
measurements landing on the two halves of ONE row.** `check_item_extents`
asserts the interleave on every export, and **it found this by being wrong
first**: the first version claimed the array was sequential and the export
stopped.

**AND THE CURSOR STOPS ON "the word EQUALS word[4]", NOT ON "index 4".** [M] the
shipped row's shot list repeats its last word, so the cursor stops at index 3
and a fifth power-up cannot move it. A port that counted to four would be one
word further on every list whose last two words repeat — which is all twelve.

## 5. RANK — the answer, and the ONE word that DID move

`.scratch/w61tree.mjs`, W60 §4.1's method: the three edited `src/` files swapped
for `git show HEAD:`'s, the same seed, the same frames, sha256 verified
byte-identical on the way back. **Each tree is measured IN ITS OWN NODE
PROCESS**, and §7 says why that matters.

| 6,200 frames | tree | frames | kills | score | chain | `$81B646` | `$81B64A` | `$81B65C` | `$81309E` | rng16 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| none | HEAD | 6,184 | 0 | 0 | 0 | 0 | 0 | 0 | 53 | 163 |
| none | **W61** | 6,184 | 0 | 0 | 0 | 0 | 0 | 0 | 53 | 163 |
| tap | HEAD | 6,184 | 298 | 5,787 | 664 | 0 | 0 | 0 | 53 | 244 |
| tap | **W61** | 6,100 | **308** | **5,848** | **776** | 0 | 0 | 0 | 53 | **67** |
| hold | HEAD | 5,869 | 242 | 5,132 | 583 | 0 | **2,136** | 0 | 53 | 231 |
| hold | **W61** | 5,869 | 242 | 5,132 | 583 | 0 | **2,112** | 0 | 53 | 234 |

**THE ANSWER: NO RANK WRITE BECAME REACHABLE.** `$81B646` (the rank POWER term),
`$81B65C`/`$81B65E` (the hyper STOCK) and `$81309E` (rank itself) are
digit-for-digit unchanged in all six runs. The no-fire CONTROL is identical on
both trees in every column, including the RNG.

**Three things must be said with that, because any one alone would mislead:**

1. **`$81309E` cannot move in this port at all**, whatever this wave did:
   `$2608D2` and `$260794` — object type 10, the rank recompute — are ABSENT
   from `src/`, so rank is frozen at its seeded 53. W60 said this and it is
   still true; a later wave must not read it as a W61 result.
2. **`$81B64A` — THE HYPER EARN ACCUMULATOR — MOVED, 2,136 → 2,112 in the hold
   run, AND THE CAUSE IS `$25270C`, THE BEAM RESET.**

   I first wrote here that the cause was the POWER LEVEL, from recon 59 §5.3:
   `$810408`'s readers include the parallel bomb chain machine whose
   hits-per-link is `(8 − $810408)×1.5 + $12`, so a power-up shortens the link.
   **That was a guess with a citation attached, and one experiment refuted it.**
   `.scratch/w61b64a.mjs` cuts each of the five things this wave adds to the
   hold run, one at a time, and re-runs — `src/items.js` sha256'd
   byte-identical after every cut:

   ```
   [M] W61 as shipped                          $81B64A = 2112   rng 234
   [M] CUT $810408, the LASER power word only   $81B64A = 2112   rng 234
   [M] CUT $810406, the SHOT power word only    $81B64A = 2112   rng 234
   [M] CUT $25270C, THE BEAM RESET only         $81B64A = 2136   rng 234  <=
   [M] CUT the whole collect ($252C96 refuses)  $81B64A = 2136   rng 234
   [M] CUT the item entirely (no allocation)    $81B64A = 2136   rng 231
       ...and kills 242 / score 5,132 / chain 583 on EVERY ONE of those rows.
   ```

   **So: picking up a power-up while the beam is firing WIPES the 32-slot
   segment pool `$8112F2` and the beam record `$811EF2`, and the beam's own
   damage ledger moves.** `$81B64A` is fed by `$286774`/`$2867B4`, inside
   `$286096`'s `$400`-bit arm — which W51 measured as THE BEAM's, not the
   bomb's. The kills are the same because the beam re-latches and kills the
   same enemies a few frames later; what changes is which frame each hit lands
   on, and the earn accumulator counts hits.

   **`$81B64A` IS NOT A RANK WORD, AND THE CHAIN FROM IT TO RANK IS FIVE LINKS
   LONG** — `src/score.js`'s own W38 §2.4 correction, which I re-read rather
   than paraphrased:

   ```
   $81B64A  --$287682, tested against #$95F and CLEARED-->  $81B6E0
   $81B6E0  --$2875B4's pending flush-->  $27E912  --> a HYPER ITEM
            --$2530CA-->  $81B65C (the stock)  --$285A62-->  $81B646
            --$2608F4's 16x term-->  RANK
   ```

   **Every one of those five links is unported**, and the first of them is the
   reason it does not bite here: [M] `$81B64A` ends this window at 2,112 on the
   W61 tree and 2,136 on HEAD, and **`$287682`'s threshold is `#$95F` = 2,399**,
   so neither tree reaches it. `src/score.js` already states the consequence of
   `$287682` being absent — `$81B64A` accumulates with nothing to drain it — and
   what this wave adds to that statement is a −24 offset, i.e. a run long enough
   to cross 2,399 crosses it on a slightly later frame than HEAD would.
   **Named here so wave I3 cannot ship `$287682` without re-reading this row.**

   **AND THE HYPER ITEM HAS TWO DOORS, BOTH SHUT, FOR TWO DIFFERENT REASONS.**
   `spawnItem` REFUSES D0 = `$C`/`$14` through `$27E812` (§2) — but the chain
   above does not use `$27E812` at all: [M] all four of the hyper item's spawn
   sites are `$27E912`, inside `$2875B4..$287720`, and that allocator is
   **entirely unported, not refused**. So a reader must not take §2's refusal as
   covering the whole surface: it covers the door this wave opened, and the
   other door was already bricked up.

   And the last row is the RNG's own bisection, free: cutting the ITEM puts
   `$803916` back to HEAD's 231 and cutting only the COLLECT does not, so the
   draws that move it are the item's INIT and its BOUNCES, not the collect tail
   — which is what `$27EACE jsr $242E24` and `$27EB5C jsr $242B3C` say.
3. **THE RNG MOVED, and it had to.** [M] `$27EACE`/`$27EC7E jsr $242E24` is the
   item's launch angle, `$242B3C` is drawn by every bounce and by BOTH collect
   tails. The shared `$803916`/`$803917` counters therefore advance on frames
   they did not before, which is the same class of change W53 §0 made when it
   ported `$289F62` — **the port moving toward the board, not away from it.**
   Its size: the tapped run's `$803916` goes 244 → 67 and the window shortens
   from 6,184 frames to 6,100 (the same wall, reached sooner).

## 6. THE ART — 139 streams, 27.7 KiB, and drawn % STAYS at 100 %

```
[M] shard 12 `items`   139 streams   mask 2,571 + col 25,775 = 27.7 KiB  DEFERRED
[M] BOOT BEFORE  477.7 KiB   (W58's own final figure)
[M] BOOT AFTER   480.7 KiB   -- +3.0 KiB
[M] deferred     1,326.9 -> 1,360.2 KiB
```

**AND EVERY BOOT BYTE IS NAMED**, measured by re-exporting with the PRE-W61
exporters (`git show bfda18b:`) and then with this tree's, both sha256'd
byte-identical on the way back (`.scratch/w61boot.mjs`):

```
[M] player.tables.json.gz   137,536 ->  138,932    +1,396 B
[M] spr/streams.u32.gz        1,002 ->    1,055       +53 B
[M] manifest.json             9,208 ->   10,776    +1,568 B
[M] TOTAL                                          +3,017 B = 2.9 KiB
```

* **+1,568 B `manifest.json`** — and it is the biggest of the three because
  `manifest.json` is the one body served UNCOMPRESSED (W47 §2.4), so every byte
  of shard 12's `why` prose and its ten harvest ledger rows is a boot byte.
* **+1,396 B `player.tables.json.gz`** — the nine new ROM windows are 1,200 raw
  bytes of cartridge, and the JSON hex-encodes them at two characters a byte
  before gzip, so the compressed cost is a little above the raw size.
  **They cannot be deferred**: a missing sprite stream is a NAMED SKIP the page
  draws around, but a missing ROM window is a THROW out of `src/rom.js` — the
  whole reason `RomWindows` exists (W54 §3's own argument, one wave on).
* **+53 B `spr/streams.u32.gz`** — 174 more stream entries at 0.3 B each,
  because W52 made that table planar and delta-coded.

**There is no version of this wave with a flat boot**, and the two claw-backs
W47 and W53 took are already taken. The one still available is gzipping
`manifest.json` itself, which W58 §7.2 handed on and priced at roughly 6 KiB —
more than this wave and W58 together. It is a `src/web/assets.js` change and it
is still nobody's.

**AND drawn % STAYS AT 100.0 % WITH ZERO MISSING STREAMS**, measured with
W58's own tool (`.scratch/e3measure.mjs`) on W58's own scenario — 3,000 frames,
fly UP, tap fire every 4th, two 120-frame HOLDS in every 600:

```
                              W58 (its own final figure)      W61
[M] display-list records              136,685              136,329
[M] DRAWN                       136,685 (100.0 %)     136,329 (100.0 %)
[M] distinct missing streams              0                    0
[M] drawn % at f1000..1499            100.0 %              100.0 %
[M] BUCKET 16 -- THE BEAM        2,606 of 2,606       2,606 of 2,606
[M] BUCKET 17 -- THE ITEM        (absent entirely)       61 of 61
```

**Bucket 17 was not in that table at all before this wave**, and bucket 16's
2,606 is unmoved to the digit — which is the check that says the item did not
displace the beam. The 356-record fall in the total is the RNG shift and the
power level (§5), not a lost picture: `distinct missing streams` is 0 on both.

Ten flat tables, and **every `entries` is pinned by an INSTRUCTION**: the four
four-frame tables by `$27EA96 addq.w #4 / $27EA9A andi.w #$F`, the sixteen-frame
one by the hyper bodies' `andi.w #$3F`, and the five collected animations by
`$27F64A cmpi.w #$78` and `$27F6A2 cmpi.w #$44`. The far end of each is checked
against the cartridge by `checkTableExtent` on every export.

**ALL 139 SHIP, INCLUDING THE 43 THAT BELONG TO THE TWO REFUSED KINDS**
(`$27EF10`'s sixteen, collected animation C's 24, and three immediates at
`$27EFBE`/`$27F03E`/`$27F2C2`). That is `docs/knowledge/09` and W58 §2.1b's
precedent: the harvest is sized off the TABLE and not off a run, so wave I3
finds no hole. It costs [M] about 8 KiB of DEFERRED bytes and zero boot bytes.

## 6b. THE PAGE, IN A REAL BROWSER — WHAT I SAW  `[M]`

Chrome + Python `playwright`, W42's recipe. **BOTH the LOCAL build and the
DEPLOYED one**, the same 100-second script, the same keys: the owner's own from
`docs/knowledge/09` — hold fire, sweep left and right. The server I started was
killed and [M] `Get-CimInstance Win32_Process` finds **zero `python http.server`
processes** and ports 8000/8791/8781/8125 all FREE, checked by process AND by
port.

**AND THE PAGE IS READ, NOT ONLY PHOTOGRAPHED.** `index.html` now exposes the
app on `window.__mixup` — a debugging handle nothing inside the page reads — so
the script samples `$8171BA`, `$810406`/`$810408` and both ROM cursors every
frame it takes a screenshot. A screenshot can show that something is on the
screen; it cannot show that the power word moved.

### LOCAL (`python -m http.server 8791`), `spr 13/13`

```
[M] +1.3 s  lf 2663   ITEM {items: 1, shot: 0, laser: 0, cur $25523C, pod $255278}
                      *** AN ITEM IS LIVE ***
[M] +32.8 s lf 4529   ITEM {items: 0, shot: 2, laser: 2, cur $25523E, pod $25527A}
                      *** PICKED UP -- THE POWER WORDS AND BOTH CURSORS MOVED ***
[M] +52.4 s lf 5686   ITEM {items: 1, ...}            a SECOND one drops
[M] +58.9 s lf 6072   ITEM {items: 1, shot: 4, laser: 4, cur $255240, pod $25527C}
                      *** PICKED UP AGAIN -- power level 2 of 4 ***
[M] +94.8 s lf 8185   STOPS at `$292902 IS NOT PORTED YET` -- the stage-1 boss,
                      W34's own frontier and the same wall every run in §3 hits
```

**That is the owner's report answered in the browser, with the RAM to back it:
the bigger ships drop something, it falls, it is drawn, the ship walks into it,
and the ship gets stronger.** Six screenshots of the item on screen are in
`.scratch/w61local-item0..5.png`.

### DEPLOYED, `https://gbtman.pages.dev/games/ddpdoj/` — THE CONTROL

The same script against the build that was live before this wave (`spr 12/12`,
no shard 12): `FIRST LIVE ITEM: None`, and it stops at the same `$292902` at
+95.1 s.

**AND THE CONTROL EARNED ITS KEEP.** The local run's status line names missing
art on most samples — `NO ART 1: $002380`, `$00208C`, `$0650E4`, `$17D480`,
`$151C70`, `$1725CC`, `$07E8AC`, `$233630`, `$231520` … — and my first reaction
was that this wave had broken E3's "zero missing streams". **It has not.**
[M] the DEPLOYED PRE-W61 build names the SAME addresses at the same points of
the same script (`$17D480`, `$233630`, `$07E8AC`, `$231520`, `$00235C`,
`$065134`, `$12D4FC` …), and **not one of them is in the item range
`$1B8318..$1E4258`.** They are late-stage content past E3's own 3,000-frame
window: E3 §7.3 said its 0-missing figure was "a statement about the same
scenario, not about the game", and this is that limit showing up. This wave adds
no missing stream, and §6's 100.0 % on E3's own scenario is the number that says
so.

## 7. EVERY CHECK WAS SEEN TO FAIL — 41 unit mutants, 8 exporter/gate mutants

`.scratch/mutate61.mjs`: apply ONE edit with a single-occurrence anchor, run ONE
test file, require a NAMED test red, restore, **verify sha256 byte-identical**.
Every restore matched.

**`games/ddpdoj/.scratch/` IS GITIGNORED**, as it has been since wave 4, so the
three harnesses this section quotes — `mutate61.mjs`, `gatemut61.mjs` and
`w61b64a.mjs` — and the tree control `w61tree.mjs` are NOT in the repository and
a later reader has to rebuild them. That is W60's precedent for a harness that
edits `src/` (`tools/` holds gates, `.scratch/` holds things that mutate), and
it is stated rather than assumed: the RESULTS are here, the machinery is not.
`tools/w61itemgate.mjs` — the measurement itself — IS committed.

```
[M] 41 of 41 unit mutants turned a NAMED test RED; survivors 0; SKIPPED 0
[M]  8 of  8 exporter/gate mutants RED against the REAL cartridge
```

**EIGHT SURVIVED THE FIRST PASS AND ALL EIGHT WERE DEFECTIVE CHECKS OF MINE.**
None was uncatchable. Recorded because that is the distinction W31 asked for:

* **M4 — A FIXTURE SITTING WHERE TWO READINGS AGREE, and the data put it
  there.** "The fill copies FIVE longs, not six" survived because [M] words 10
  and 11 of all six templates are `0000`, so on a zeroed `Ram` a short copy is
  invisible. The slot is now DIRTIED before the allocation — which is the only
  kind of slot the game ever has, because `$27F6AE` writes 32 of the record's 64
  bytes and nothing clears the rest.
* **M8 — A VACUOUS LOOP.** The refusal test iterated `REFUSED_KINDS`, so
  emptying the list made the body never run and the test pass. The list is now
  asserted deep-equal and the kinds are driven by literal.
* **M15 — A REPRESENTATION THAT HID THE INSTRUCTION, and it changed the port.**
  `moveq #$3C` against `moveq #$3F` was *undetectable*, because the port divided
  D0 by four before checking. In the ROM D0 is a **BYTE OFFSET**
  (`$27E9E8 adda.w D0,A0 / movea.l (A0),A0`), so `$3F` forms a misaligned
  pointer read — an ADDRESS ERROR on a real 68000. `src/items.js` now checks the
  OFFSET the ROM actually forms, and the test fixture carries a low bit where
  the two masks differ.
* **M20/M21/M22 — one-frame fixtures for multi-frame behaviour.** The
  byte-vs-word `bset #5`, the `$1800` vs `$1000` collect mask and the `andi.w
  #$F` animation wrap are all invisible in a single driven frame. They are now
  a two-frame re-init check (with the RNG counter as the witness), a P2
  collection driven through the body, and a ten-frame cursor walk.
* **M30 — THE CARRY THE EMITTER THROWS AWAY, and this is worth keeping.**
  `add.l (A0)+` against two `add.w`s differs by 1 in the HIGH word, and
  `$23EB1C asr.l #6` + `$23EB1E andi.l #$07FF03FF` put that difference in bit 10
  of the low word, which the mask deletes. **For most positions the two
  readings emit the same twelve bytes.** The fixture is now chosen so the
  shifted value BORROWS out of bit 16, where they cannot agree.
* **M33 — THE RIGHT ASSERTION ON THE WRONG CURSOR.** The mutation moved the
  LASER list's compare (`$252CF0 move.w ($8,A1)`) and the test asserted the SHOT
  cursor (`$252CF8 ($8,A0)`). Both are asserted now, on a row whose word[3] and
  word[4] DIFFER — row 0's do not, so row 0 could never have separated them.
* **AND ONE EXPORTER MUTANT SURVIVES BY DESIGN AND IS CAUGHT BY THE GATE.**
  `checkTableExtent` only refuses a harvest that runs PAST the cartridge's run;
  one that stops SHORT exports cleanly. Cutting a 30-frame collected animation
  to 24, and kind `$0`'s four frames to three, both export perfectly and both
  turn `webgate`'s W61 stage RED — because `records` and `distinct` come out of
  the PORT and no bundle can supply them (W47 §4.1).

**AND THE TREE CONTROL ITSELF COULD NOT FAIL WHEN FIRST WRITTEN.** The first
`.scratch/w61tree.mjs` re-imported the measurement tool with a `?t=` cache
buster, which gives a fresh copy of the TOP module and the CACHED copies of
everything it imports — so the "HEAD" run executed W61's `src/handlers.js` and
printed W61's numbers, digit for digit, as HEAD's. It ran each tree in its own
process afterwards, and only then did the table above have two different rows in
it. **A control that agrees with the thing it is controlling for is not a
control**, and this one agreed perfectly.

## 8. COVERAGE — branches and table entries, never frames

* **`$27E812`'s NINE call sites: 2 WIRED, and [M] 1 of the 2 REACHED.**
  `$275B1A` is behind `tst.w $81308C / bne`, and `$81308C` is `$0001` in this
  port's own measured state, so the SECOND drop never happens — which is the
  live semantic recon 59 §2.1 warned an implementer would get wrong. The other
  seven are the player's own death (`$24A10E`, behind the unported `$249F8A`),
  the stage-1 boss's four (0 of 111 boss entry points ported) and the two
  bodies recon 59 §9.1 could not attribute.
* **`$27E9F8`'s dispatch: 8 of 8 TRANSCRIBED — 4 bodies, 2 REFUSED throws, the
  free and the `rts`.** [M] 1 of 8 reached in a playing run (kind `$0`), 2 of 8
  under `--stress` (kinds `$0` and `$8`). The other two ported bodies, kind
  `$4` (FULL POWER) and kind `$10` (the `$8130BE` counter), are
  **transcribed-and-unexercised, and by CONSTRUCTION**: no `$27E812` site this
  port can reach passes `$4` or `$10`. Their unit tests are the only thing that
  has ever run them.
* **`$27F746`'s template table: 6 of 6 templates exported, 8 of 8 entries
  range-checked.** [M] entries [0] and [2] reached.
* **The ten collect routines: 8 PORTED, 2 REFUSED.** [M] `$252C96` reached in
  a playing run; `$252E9A` under stress. The four P2 mirrors cannot run in a
  one-player game and `$252DAC`/`$252E26` need a kind-`$4` drop.
* **BOTH collect tails and BOTH steppers are EXERCISED**: `$27F54C`/`$27F5F4`
  in a playing run, `$27F582`/`$27F656` under `--stress` (1,290 at-max
  collections).
* **The pool: 10 of 25 slots reachable, and 10 of 10 reached.** 12 of the other
  15 belong to the refused hyper kinds; 2 to kind `$4`; 1 to `$81717A`'s
  catch-all, whose only caller (`$27B4A0`) is unported.
* **The art: 139 of 139 streams EXPORTED; [M] 28 reached in `webgate`'s W61
  window and 61 under `--stress`.** The gap is the two refused kinds' 43 and the
  frames of the collected animations a short run does not walk.
* **Transcribed and unexercised, NAMED:** kind `$4`'s whole body and its
  210-byte motion; kind `$10`'s body; `$27E98A` (both its callers are unported);
  the `$81717A` catch-all arm; the FULL-POWER cursor write; and
  **`$27F624 addi.w #$20,($2,A6)`, which is PROVABLY unreachable rather than
  merely unmeasured** — both collect tails write `move.b #$0,($e,A6)` and
  `$27F642 clr.b ($e,A6)` keeps it there, while the only writers of that word
  (`$27EA96 addq.w #4` masked `$F`) touch the LOW byte. Named, transcribed,
  and not removed.
* **ONE STRUCTURAL DIFFERENCE IS TRANSCRIBED AND IS PROVABLY UNOBSERVABLE,
  which is why it has no test.** `$252C96`'s `cmpi.w #$8,$810406 / beq` is
  OUTSIDE the laser branch and `$252DAC`'s is INSIDE it (`$252DDA` is reached
  only when `$810408 != 8`). Walking the four (laser, shot) cases: the pair
  (8, 8) is caught by the sum test above both; (8, <8) and (<8, <8) proceed in
  both; (<8, 8) returns in both. **So the placement cannot change an answer**,
  and writing a test for it would be writing a test that cannot fail. It is
  transcribed the way the ROM has it and named here instead.
* **NOT transcribed at all, and why:** `$27E88A`, the third allocator — [M]
  recon 59 found NO caller of either kind in `$230000..$2B0000` and I
  re-checked it. `docs/knowledge`'s rule is that an absence proof is a listing
  read, and this is one; writing 136 bytes nothing can call would be worse.
* **Unit tests 727 -> 767, 0 skipped.** New file `tests/w61items.test.js`
  (40 tests). `webgate` 13 of 13 -> **14 of 14**.

## 9. WHAT THIS WAVE DID NOT DO

- **Nothing is compared against MAME.** No gate in this repo compares the port's
  item records against a board frame, and this wave did not build one. I have
  proved the port allocates from the cartridge's own pools, fills from its own
  templates, dispatches through its own tables, draws stream addresses the
  cartridge's own tables contain, and moves the two power cursors the cartridge's
  own lists bound. **A record with a correct descriptor can still be the wrong
  record**, and whether the board drops the same item on the same frame is
  unmeasured.
- **KINDS `$0C` AND `$14` ARE REFUSED, not ported** (§2), and with them
  `$2530BE`/`$2530E6`, `$27F8EE`'s refusal spawn, `$27E912`, `$27F6E4` and the
  `$8171BC` spawn-variant counter.
- **The `$28Cxxx` SOUNDS are counted, not run** — `$28C5CA`, `$28C9F8`,
  `$28CA12`, `$28C678` and the beam-reset cue off `$2527BE`. W53 §0 established
  that family is SOUND; it is deferred whole.
- **The HUD draws are counted** — `$25349A`/`$2534AC`, `$2533C8`/`$2533D4` and
  `$2878CC`/`$28795C`, all of which reach `$240DC2`, a text/sprite subsystem no
  wave has touched. So the set item's icons and the `$8130BE` row are absent
  even though both counters move.
- **`$81040B` still has no writer.** [M] recon 59 §9.2's finding holds: its only
  absolute sites are `$252EA2`, `$252EB6` and `$2534A6`, all reads. Both arms of
  `$252E9A` are transcribed and the port cannot say which one a real game takes.
  [M] in the shipped seed `$81040A` and `$81040B` are both `3`, so the
  already-complete arm is the one that runs.
- **`$2440E0`, the impact pool A, `$289AF4` and `$2890F2`** are exactly where
  W52/W53/W54 left them.
- **`$292902` is still the wall.** Every run in §3 stops there.
- **Nothing was published by the wave itself.** `tools/publish.mjs` deploys all
  three games and the deploy is the orchestrator's call.
- **`games/gradius/` was not touched.**

## 10. THE GATE, ON THE FINAL TREE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 51 passed, 0 failed, 0 SKIPPED
```

**Nothing was disabled, skipped, narrowed or loosened**, and every stage line
was read rather than only the verdict. The ones this wave could plausibly have
broken, all green:

- **`fly-around: port vs board, 0 divergent frames` and its 5 REDs** — the only
  2,200-frame port-vs-board window this project has. Nothing fires in it, so
  nothing dies and no item can spawn; its green says this wave changed nothing
  on the no-input path, which is exactly what §3's 6,184-frame `none` control
  predicts and what the TREE CONTROL's identical `none` row measures directly.
- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs.
  **Bucket 17 is not in `PRODUCED_BUCKETS`**, so the item's writes do not enter
  the substituted set.
- `midboss DEATH` and its `RED [no-kill]` control.
- `assets/integrity` and its four REDs, **including `[rom-byte]`, THE ROM-LEAK
  GUARD** — two new shard files went through it.
- `background shard gate` — the stage that FRESH-EXPORTS, i.e. the one an
  exporter change has to survive.
- `pixel gate` (100.0000 %) and its 9 REDs; `demo gate` and its 4.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/     767 pass, 0 fail, 0 SKIPPED   (was 727)
node games/ddpdoj/tools/webgate.mjs 14 of 14 PASS                 (was 13 of 13)
node tools/build-dist.mjs           clean, 5 deliberate exception(s)  <- UNMOVED
BUNDLE                              480.7 KiB before the first frame (was 477.7)
```

**`PUBLISH_VERBATIM` DID NOT GROW.** [M] neither `spr/mask.shard12.u16.gz` nor
`spr/col.shard12.u16.gz` is a verbatim ROM slice: the 139 item streams come from
five disjoint runs (`$1B83xx`, `$1B84xx..$1B8Axx`, `$1B8Bxx`, `$1B8Cxx..$1BC9xx`
and `$1E3Fxx..$1E42xx`), so the packed shard is not a single contiguous copy.
That is the accident of packing order W47 §3 explains, and it is luck rather
than virtue — stated as such.

**AND THE GATE WAS RUN TWICE.** The first run came back ALL GREEN 51/0/0, but I
had appended a comment block to `src/items.js` and two tests while it was in
flight. W58 §6's own lesson is that a gate started before the tree settled is
not evidence about the tree, so it was re-run from a clean tree and **the
51/0/0 quoted above is the second run.**

## 11. THE DONE-WHEN, EACH AS A MEASUREMENT

| the brief asks for | `[M]` |
|---|---|
| items drop, fall, are drawable, can be collected — **say what you SAW in the browser** | §6b: **an item LIVE at +1.3 s, PICKED UP at +32.8 s with `$810406`/`$810408` 0/0 → 2/2 and both ROM cursors advancing, and again at +58.9 s to 4/4**, in Chrome, with the port's own RAM read out of the page. The pre-W61 deployed build on the same script has no item at all |
| pool census to E5b's standard, over a LONG run | §3.1: **0 count-vs-slots disagreements over 6,100 frames**, back at ZERO on 5,493 of them with a 2,952-frame stretch; under a labelled `--stress`, **10 of the 10 reachable slots, 1,475 frees, 0 disagreements over 5,833 frames**, and the pool returns to zero and stays there once the pressure stops |
| power level actually changes — shot behaviour at level 0 vs after pickup | §4: the SHOT slot-search window **4 → 5** and the pods' **4 → 5, one power step apart**, read out of the cartridge's own five-word lists; and **+10 kills / +61 score** against the HEAD tree over the same window |
| **rank: state explicitly whether any rank write became reachable** | §5: **NO.** `$81B646`, `$81B65C`, `$81B65E` and `$81309E` are digit-for-digit identical between HEAD and W61 across three inputs. The hyper kinds are refused AT THE ALLOCATOR, so `$2530BE`/`$2530E6` are unreachable by construction. **One non-rank word DID move** — `$81B64A`, and §5 names the cause and the experiment that found it |
| art: 139 streams; drawn % STAYS 100 % with zero missing; boot before and after | §6: **139 of 139 shipped**, 27.7 KiB deferred; **drawn 136,329 of 136,329 = 100.0 %, 0 distinct missing streams** on W58's own scenario, with bucket 16 unmoved at 2,606 and **bucket 17 new at 61 of 61**; **boot 477.7 → 480.7 KiB** |
| gate ALL GREEN, unit tests | §10: **ALL GREEN — 51 passed, 0 failed, 0 SKIPPED**; **767 unit tests, 0 skipped** (was 727); **webgate 14 of 14** (was 13) |

---

## LOG (appended as findings arrive)

- opened. Read `59-recon-items`, `60-impl-I1-unblock`, `54-impl-E5b-explosions`,
  `58-impl-E3-art`, HANDOVER, `docs/knowledge/09` and `10`.
- §0 [M]: recon 59's geometry and both dispatch tables REPRODUCE EXACTLY;
  **five corrections**, the sharpest being that **`$286128` was already ported**
  (the brief's scope rests on recon 59 §4.3, which is wrong) and that **the item
  DRAWS FROM THE RNG** on its init, its bounces and both collect tails.
- §0 [M]: **`$25270C` — which a power-up calls — is a BEAM RESET.** It wipes
  `src/laser.js`'s whole 32-slot segment pool and the beam record.
- §1 [M]: **PORTED** -- the allocator, the fill, both range-checked tables, the
  driver (type-5 call #18, now MADE), four kind bodies, the free, both collect
  tails, both animation steppers, eight of the ten collect routines, the beam
  reset, `$242AC6`, `$242B3C`, `$242494`, `$242684`, and **the two drops in
  `handler85`'s death arm**.
- §2 [M]: **KINDS `$0C`/`$14` ARE REFUSED AT THE ALLOCATOR**, so `$2530BE`/
  `$2530E6` are unreachable BY CONSTRUCTION and not merely unreached. The
  dispatch entries are loud named throws.
- §3 [M]: **ITEMS DROP, FALL, DRAW AND ARE COLLECTED.** 2 spawns / 608 drawn
  records / 2 collections over 6,100 tapped frames; the no-fire CONTROL has 0 of
  all three.
- §3.1 [M]: **THE CENSUS, E5b's standard.** 0 count-vs-slots disagreements over
  6,100 frames, back at ZERO on 5,493 of them with a 2,952-frame stretch; and
  under a labelled `--stress`, 10 of the 10 reachable slots with 0
  disagreements over 5,833 frames, 1,475 frees, and the pool returning to zero
  and staying there once the pressure stops.
- §4 [M]: **THE POWER LEVEL CHANGES AND THE SHOT BEHAVIOUR CHANGES WITH IT** --
  the shot search window 4 -> 5 and the pods' 4 -> 5, one power step apart,
  and **+10 kills / +61 score against the HEAD tree over the same window.**
- §4 [M]: **THE `$25520C` ARRAY IS SIX INTERLEAVED (shot, laser) PAIRS**, which
  recon 59 §9.6 left open -- found because the export check was WRONG FIRST --
  and it corroborates both of the port's own measured cursors as the two halves
  of ONE row.
- §5 [M]: **NO RANK WRITE BECAME REACHABLE.** `$81B646`, `$81B65C`, `$81B65E`
  and `$81309E` identical between HEAD and W61 across three inputs.
- §5 [M]: **BUT `$81B64A` MOVED, 2,136 -> 2,112 -- AND MY FIRST EXPLANATION OF
  IT WAS WRONG.** I wrote that `$810408` shortened the bomb chain's link (recon
  59 §5.3) and then cut that write to check: `$81B64A` did NOT move back. A
  five-way bisection says the mover is **`$25270C`, THE BEAM RESET** -- a
  power-up wipes the 32-slot segment pool mid-beam and the beam's own damage
  ledger shifts, while kills/score/chain stay identical. It is not a rank word;
  its consumer `$287682` is a counted note, and the day that ships it becomes a
  hyper grant.
- §5 [M]: **THE RNG MOVED, and it had to** -- the item's init, its bounces and
  both collect tails draw. W53 `$289F62`'s shape one wave on.
- §6 [M]: 139 streams, 27.7 KiB DEFERRED, **boot 477.7 -> 480.7 KiB**; all 139
  ship including the 43 belonging to the refused kinds.
- §7 [M]: **41 unit mutants, 41 NAMED reds, 0 survivors; 8 exporter/gate
  mutants, 8 red.** EIGHT survived the first pass, all eight defective checks of
  mine -- including one (M15) that was undetectable because the PORT'S OWN
  REPRESENTATION hid the instruction, and which changed `src/items.js`.
- §7 [M]: **THE TREE CONTROL COULD NOT FAIL WHEN FIRST WRITTEN** -- a `?t=`
  cache buster reloads the top module and not its imports, so "HEAD" ran W61's
  code and agreed with it digit for digit.
- §6 [M]: **drawn % STAYS AT 100.0 % with ZERO missing streams** on W58's own
  scenario, bucket 16 unmoved at 2,606 and **bucket 17 new at 61 of 61**.
- §6b [M]: **THE OWNER'S WAVE, IN A REAL BROWSER, BOTH BUILDS.** An item LIVE at
  +1.3 s and PICKED UP at +32.8 s with the power words and BOTH ROM cursors
  moving, and again at +58.9 s; the pre-W61 deployed build on the same script
  has none. The missing-art addresses the page names on a 100-second run are
  **the same ones the pre-W61 build names**, and not one is an item stream.
- §6b [M]: the local server was killed; **zero `python http.server` processes**
  and ports 8000/8791/8781/8125 all FREE, checked by process AND by port.
- §10 [M]: **`pgm.py check` ALL GREEN 51/0/0, 0 SKIPPED**; unit tests
  727 -> 767; `webgate` 13 of 13 -> **14 of 14**; `build-dist` clean with
  **5 exceptions, UNMOVED** -- [M] neither shard-12 body is a verbatim ROM
  slice, checked independently against all three sprite ROMs. **The gate was
  run TWICE and the second run is the one quoted** (W58 §6's rule: a gate
  started before the tree settled is not evidence about the tree).
