# 66 — IMPL E6: THE BOMB'S ART AND THE LASER BOMB'S

status: **DONE** — **THE OWNER CAN SEE THE BOMB AND THE LASER BOMB.** `[M]` in
Chrome, the ordinary bomb is a screen-filling cream blast ring and the laser
bomb is a twisted beam column from the ship's nose to the top of the playfield
with fire billowing out of its head. **drawn% 100.0 % and ZERO missing streams
on all FIVE scenarios** (E3's own, held-fire, held-fire+3 laser bombs,
tapped-fire+3 ordinary bombs, tapped-fire alone). Boot 489.5 → **490.0 KiB**,
+517 B, every byte named. Gate ALL GREEN 67/0/0, `webgate` 14 → **17**, unit
tests 921 → **922**, `bundlegate` 100.0000 % unmoved, `PUBLISH_VERBATIM` still
5. 21 of 21 mutants RED, 0 survivors — **and one of my own checks could not
fail.**

**AND IT FOUND A DEFECT IN W65 THAT NO GATE IN THIS REPO COULD HAVE SEEN:** the
laser bomb's **forty-one beam segments never emitted a display-list record at
all** (§4). Fixed, red-validated, and the reason it was invisible is the reason
this wave exists.

started: 2026-08-05
wave: 66. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
`games/gradius/` NOT TOUCHED.

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.

brief: **the owner can bomb but cannot see it.** W64 shipped the bomb (174
bucket-13 records over three bombs, no sprite shard) and W65 the laser bomb
(three named missing sprite streams). Harvest and ship the art for both.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `64-impl-B2-bomb.md`, `65-impl-B3-bomb-beam.md`,
`58-impl-E3-art.md`, `47-impl-E2-art.md`, `HANDOVER.md`,
`docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE BRIEF'S PREMISE, CHECKED — it holds, and it is SMALLER THAN THE HOLE

The brief says the bomb has **174 bucket-13 records and no sprite shard** and
the laser bomb has **three named missing sprite streams**. Both reproduce, and
both are a floor.

| the brief / W64 / W65 says | `[M]` this session |
|---|---|
| W64 §8.3: 174 bucket-13 records over three bombs, no shard | **CONFIRMED TO THE RECORD.** [M] 174, over **16** distinct streams |
| W65 §7.3: "three named missing sprite streams" `$042924 $040CC8 $040EAC` | **THREE IS THE PAGE'S TOP-3 LINE, NOT THE COUNT.** [M] a laser bomb asks for **48** distinct bucket-13 streams, and 27 more outside bucket 13 — **75 in all** |
| W65 §1: the driver runs 1 + 41 + 3 = 45 records | HOLDS, and the art is not one set: [M] the ordinary bomb's 16 streams are all `$02xxxx`/`$03xxxx` and the laser bomb's are all `$04xxxx`. **They share a bucket and NOTHING else** |
| E3 §7.1: the beam's blocks for `$24BB0A` entries 7..19 sit in the unexported hole `$24B900..$24BB0A` | **NOT MINE.** §9 — [M] every address this wave harvests is named by a table inside a window `tools/export-tables.py` ALREADY exports, so the window and the art never had to move together here. I moved neither and the throw stays |

### 1.1 THE CONTROL THAT MAKES THE COUNT MEAN SOMETHING

Five runs, 2,600 frames each, the shipped seed, the page's own
`portSpriteList` and the page's own map, `$810424` pinned `$FF` the way
`src/web/app.js:699` pins it:

```
[M] E3's own input (fly UP, tap, two 120-frame HOLDS per 600)   0 missing
[M] fire HELD, NO bomb                                          0 missing
[M] fire HELD, THREE LASER BOMBS                               75 missing
[M] fire TAPPED, THREE ORDINARY BOMBS                          18 missing
[M] fire TAPPED, no bomb                                        7 missing
```

**Held fire with no bomb is 100.0 % on every bucket, so every one of the 75 is
the LASER BOMB's** — the control is the same input with Button 2 never pressed,
which is the only way to separate "the bomb has no art" from "this input has no
art". The tapped-no-bomb row is 7 and they are **not the bomb's** (§3.3).

## 2. WHAT THE BOMB ACTUALLY ASKS FOR — six producers, not one

`[M]` every one derived from the cartridge (`.scratch/e6derive.mjs`) and then
checked against the measurement, never the other way round:

| | producer | how it is CLOSED | streams | gz |
|---|---|---|---:|---:|
| (a) | **THE ORDINARY BOMB** — the three scripts the three templates' own `($1E,A6)` longs name: `$256558` (4 x 12-byte entries to `$FFFF`), `$2565DE` (8 longs, `$1C`..0 step 4), `$25663A` (4 longs to `$FFFFFFFF`) | each script's own TERMINATOR | **16** | 119.9 KiB |
| (b) | **THE LASER BOMB** — `$256662..$256986`, W65's own derived data block, scanned for mask-ROM DIRECTORY entries (E3 §2.1(b)'s mechanism) | the block's far end is `$256986`, the bit-1 twin's first script, i.e. the code this port throws on | **168** | 58.1 KiB |
| (c) | **POOL E's OTHER TEMPLATES** `$28A464..$28A506` — W65's own window, the sparks `$289FF4` allocates | the window W65 derived and asserts on export | **24** | 1.2 KiB |
| (d) | **THE SHIP'S BIT-7 AURA** `$2556BA..$2556E2` — two pointers x four frames | `$25567A + 16*4 == $2556BA` from below and `glowSprite $2556E2` from above | **8** | 5.7 KiB |
| (e) | **ENEMY TYPE `$8A`** — `$1BCA34` (the sub-proto `$2766E6`'s `($A)` long) and `$1BCA80` (`$2767B2 eori.l #$B4`) | the `eori` immediate IS the second address | **2** | 0.5 KiB |
| (f) | the family that begins where W58's `$12C7B0` chain ENDS — **not the bomb's**, §3.3 | stride 68 x 8, and `$12D650` is stride 1084 | **8** | 1.6 KiB |
| | | | **226** | **187.6 KiB** |

**[M] ALL 91 DISTINCT MEASURED MISSING STREAMS ARE INSIDE THE DERIVED SET, and
the set is 226.** The derivation is 2.5x the measurement, which is the whole
point of `docs/knowledge/09`: a harvest sized off one run's misses is the
tank-hull mistake — and §4 is what it bought, because the beam's segments were
not asking for their art at all when the 91 were counted, and the harvest had
it anyway. (The shipped assertion is no longer those 91; §6.1.)

## 3. THREE THINGS NO DOCUMENT IN THIS REPO HAD

### 3.1 **THE BOMB TURNS ON AN ENEMY'S ANIMATION** — `$276756 tst.w $811F72`

`[M]` `$1BCA34` and `$1BCA80` appear in buckets 0 and 3 on the exact frame
Button 2 is pressed, and their first frame MOVES when the press moves. They are
not bomb art: they are enemy type `$8A`, the scroll-locked ground gun
(`src/handlers.js handler8A`, ported since W36).

**`$276756 tst.w $811F72 / bne $2767A6` skips the proximity test while the
bomb's record is live**, so the gun falls straight into `$2767AA bchg #$6` and
`$2767B2 eori.l #$B4,($A,A6)` — it BLINKS between two frames `$B4` apart and
emits, on every other frame, for as long as the bomb is up. `[M]` with the
identical input and no press the same gun spawns on the same two frames
(logic 2,713 and 2,777), writes `$1BCA34` **twice**, and never draws; with a
press it writes 102 times.

That is W64 §1.2's *"one instruction turns on every gate in this port that reads
`$811F72`"* arriving in the ART, and it is a seventh subsystem on top of the
seven that finding lists.

### 3.2 THE LASER BOMB'S ART IS NOT THE ORDINARY BOMB'S

`[M]` zero overlap. 16 streams against 168, in disjoint address ranges. W65 §7.3
naming three addresses off the page's top-3 line is what made this look like a
small hole; it is the largest single art gap left in this port.

### 3.3 A FAMILY W58's OWN NOTE POINTED AT AND DID NOT SHIP

`[M]` fire TAPPED and never held, no bomb: seven missing streams,
`$12D474..$12D60C`. E3 §2.2 closed `$12C7B0..$12D430` and wrote that `$12D430`
"is stride 68", i.e. the first frame of the next family — and stopped there.
`[M]` that family is **eight frames of stride 68 ending at `$12D650`**, which is
stride 1084. It is not the bomb's and it is shipped here anyway, because a
"zero missing streams" claim that only holds when the player holds fire is not
the claim this wave is asked for.

## 4. **THE FORTY-ONE BEAM SEGMENTS NEVER EMITTED A RECORD** — W65's, found by the art

The first browser run with the art shipped showed the laser bomb as a flame
ring around the ship and **nothing above it**. `[M]` the cause is in
`src/bomb.js beamSegments2561AA`:

```
$25620C bra.b $25624C     the freshly SEEDED segment -- INTO the call
$25624C jsr $23FF42       the deref arm's draw
$2562EA jsr $23FF42       the no-deref arm's
```

All three were transcribed as a bare `drawn++`. **The state was right** — W65
§7.1 measured 31 of 45 records live on the deployed page and it was true — but
no segment ever became a display-list entry, so the beam was four heads and
nothing between them.

**NO CHECK IN THIS REPO COULD HAVE CAUGHT IT BEFORE THIS WAVE.** Bucket 13 had
no sprite shard, so every record it *did* emit was skipped for want of a
picture, and a record that is MISSING and a record that is SKIPPED look
identical on a screen and in every count either gate takes. `[M]` 921 unit
tests, 67 gate stages, 22/22 on `w65beamgate` and 59 of 59 mutants all passed
over it. It was found by opening the page — `47-impl` §2.3 and W58 §5.2, for the
third and fourth time in this project.

`[M]` what the fix is worth, same input, same 2,600 frames:

```
[M] bucket 13, three LASER bombs   BEFORE  1,179 records over  48 streams
[M]                                 AFTER  2,605 records over 109 streams
```

**and all 109 were already in the harvest**, because it is derived from the
cartridge rather than sized off a run (§2). The new unit test
*"W66: `$25624C jsr $23FF42` -- EACH LIVE SEGMENT APPENDS A BUCKET-13 RECORD"*
reads bucket 13's own counter `$80AFEC` and asserts `HEADS + live()` exactly;
both draw sites are mutants (§6).

## 5. WHAT SHIPPED, AND WHAT IT COSTS

### 5.1 shard 13 `bomb` — 218 streams, 186.0 KiB gz, DEFERRED

`SPR_ORDER` is now `[0, 7, 6, 10, 9, 13, 12, 8, 1, 2, 3, 4, 5, 11]`. Shard 13
goes **fifth among the deferred**, behind the explosion and ahead of the item,
and the reason is stated rather than assumed: its deadline is a **deliberate
press** rather than an event the game reaches by itself, and at 186 KiB it is
the second-largest body in the bundle, so it must not sit in front of the shards
the simulation reaches on its own. `demand()` promotes it on the frame Button 2
is pressed, exactly as it has since W47.

The other 8 of the 226 derived streams go to shard 11 (§3.3), whose count moves
146 → 153.

### 5.2 BOOT — 489.5 → 490.0 KiB, +517 B, and every byte of it

```
[M] manifest.json          10,776 -> 11,197   +421   (served UNCOMPRESSED)
[M] spr/streams.u32.gz      1,055 ->  1,151    +96   (226 more streams)
[M] player.tables.json.gz 148,018 -> 148,018     0   (NO new ROM window)
[M] seed.bin.gz             6,878 ->  6,878     0
[M] capture.json.gz         3,920 ->  3,920     0
[M] BOOT                    489.5 ->  490.0 KiB      +0.5
[M] deferred              1,360.2 -> 1,547.9 KiB   +187.7
```

**+421 B of `manifest.json` is one new shard entry (its `why` prose, which is
what the page prints when the shard fails to load) and one harvest ledger row.**
`[M]` the first draft of that `why` cost 329 characters and the shipped one
costs 174 — E3 §3's trim-after-measuring, for the same reason.

**`player.tables.json.gz` DID NOT MOVE, and that is the wave's cheapest fact:
this harvest needed NO new ROM window.** Every table it reads is inside one
`tools/export-tables.py` already exports — `$25653C+$112` (W64), `$256662+$324`
(W65), `$28A464+$A2` (W65), `$255330+$900` (W12), `$2766E0+$30` (W23). W64 paid
+408 B for its window and W65 +7,495 B; this wave pays 0.

There is no version of this wave with a flat boot: a shard means a row in the
one uncompressed file and 226 rows in the stream table. **The claw-back that is
still available is gzipping `manifest.json`** — E3 §7.2 priced it at ~6 KiB and
handed it over; it is a `src/web/assets.js` bootstrapping change (the manifest
is what says how everything else is encoded, so its own name has to carry the
answer) and it is deliberately not taken in a wave whose subject is the art.
Handed on again, with the measurement: `manifest.json` is now 11,197 B raw.

## 6. EVERY CHECK SEEN TO FAIL — 21 mutants, 21 RED, 0 survivors

`.scratch/mutate66.mjs`: apply ONE edit with a single-occurrence anchor, run ONE
check, require a NAMED assertion red, restore, **verify sha256 byte-identical**.
Exporter mutants export to a SCRATCH directory, never over `assets/`, so a
mutant that throws half-way cannot leave the real bundle short.

```
[M] 21 of 21 mutants turned a NAMED check RED; survivors 0
```

| what was mutated | what went red |
|---|---|
| the INIT template's `($1E,A6)` long read at +$14 | the exporter's own template-offset assertion |
| the FADE template's at +$10 | the same |
| the fade table read as SEVEN longs | the 4/8/4 phase-count assertion |
| the phase-0 script walked at stride 8 | `B13_MEASURED`, naming the addresses |
| the phase-2 blink list cut at two frames | `B13_MEASURED` |
| the laser bomb's block cut at `$256802` | `B13_MEASURED` — **see below** |
| pool E's templates dropped | `B13_MEASURED` |
| the bit-7 aura cut to its two POINTERS | `B13_MEASURED` |
| the aura block cut at the SECOND pointer | the aura block's own 2x4 shape assertion |
| `$2767B2`'s `eori` immediate read as `$B0` | `B13_MEASURED`, naming `$1BCA80` |
| the sub-proto's `($A,A6)` read at table+2 | `B13_MEASURED`, naming `$1BCA34` |
| the `$12D430` chain claimed as 32 frames | the structure-range walk |
| ...ended one frame early ON a boundary | the same (W58 §4.1's defective mutant, re-aimed so it can be seen) |
| `SPR_ORDER` with the bomb shard LAST | *the two weapon shards are DEFERRED and fetched FIRST* |
| the 186 KiB shard folded into BOOT | *SHARD 0 IS THE BOOT SHARD* |
| **`$25624C jsr $23FF42` counted, not emitted** | the new segment-record test |
| **the SEEDED segment's draw removed** | the same |
| the structures stage still claiming 146 | `webgate` W58 |
| the bomb stage expecting 16 distinct | `webgate` W66 tap |
| three presses on CONSECUTIVE frames | `webgate` W66's STOCK row |
| the WITHHELD run given the shard | `webgate` W66 withheld |

### 6.1 **ONE OF MY OWN CHECKS COULD NOT FAIL**, and it is the sixth wave running

`B13_MEASURED` began as **the 91 addresses a run measured MISSING**. `[M]` the
mutant that cuts the laser bomb's data block at `$256802` — the `$FFFFFFFF`
terminator of `$256712`'s twelve entries, which *looks* like a far end and is
not — **SURVIVED it**: all 91 were below that address, because §4's segments
were not emitting a record at all, so nothing in the corpus ever asked for the
block's tail.

It is now **the port's own DEMAND, 152 addresses**, collected from the two
bombing windows on the FIXED tree — and 152 against a harvest of 218 is what
makes it a check rather than a restatement. The same mutant now goes red.
`docs/knowledge/03`: *a fixture that sits where two readings agree is not a
check*, for the sixth wave in a row.

### 6.2 AND ONE CLAIM THAT NO RUN CAN FALSIFY, SO IT IS ASSERTED INSTEAD

The bit-7 aura's block holds **two** pointers and only ship selector 0's four
frames are ever reached (`[M]` `($58,A6)` is 0 on the whole corpus), so a range
that dropped the other four would sit exactly where two readings agree — the
first aimed mutant survived for that reason and is recorded rather than quietly
repaired. The exporter now asserts the block's **shape**: two pointers, both
inside the block, four frames each, from `$249A8C`'s `#$C` seed and `$24A526`'s
`subq.w #$4`. The re-aimed mutant goes red on that.

## 7. THE PAGE, IN A REAL BROWSER — WHAT I SAW `[M]`

Chrome + Python `playwright`, W64/W65's recipe. Two inputs, because
`$249A5C tst.b ($3f,A6)` forks the arm: **fire TAPPED** (the ordinary bomb) and
**fire HELD** (the laser bomb). Button 2 is `x`.

### 7.1 THE ORDINARY BOMB

```
[M] BOOTED     lf 2247  stock 3  [port] dl 79 drawn 79  spr 14/14  no NO ART
[M] BOMB1+0.1s lf 3197  stock 2  rec 8100  bombHits  56  bombDraws  17
[M] BOMB2+0.3s lf 3475  stock 1  rec 8100  bombHits 335  bombDraws  85
[M] BOMB3+3.5s lf 3942  stock 0  rec    0  bombHits 439  bombDraws 174
[M] rank 53 / 0 / 0 / 0 / 0 on every sample;  drawn == dl on every sample
[M] PAGE ERRORS []  (one 404 for the favicon)  60.0-60.1 Hz throughout
```

**WHAT IS ON THE SCREEN.** Press X and the upper two thirds of the playfield
fill with a jagged blue-white energy burst, the ship is wrapped in an orange
flame aura, and huge yellow-orange fire chains bloom down the right side. A
third of a second later it is **a single cream-and-tan blast ring, about 250 px
across, centred over the emplacement the bomb killed** — a hard-edged expanding
shockwave with a bright core, drawn over everything. Before this wave those same
174 records existed and drew nothing at all.

### 7.2 THE LASER BOMB

```
[M] BEFORE     lf 3085  held 1  stock 3   (the beam is up, $249A5C forks right)
[M] BOMB1+0.3s lf 3149  stock 2  live 29  bit7 1  bombDraws 1,072
[M] BOMB1+3.5s lf 3349  stock 2  live  0  bit7 0  bombDraws 3,361
[M] FINAL      lf 4991  stock 0  bombDraws 9,707   drawn == dl on every sample
[M] rank 53 / 0 / 0 / 0 / 0 on every sample;  PAGE ERRORS []
```

**WHAT IS ON THE SCREEN.** Hold Z until the beam is up, press X, and **a
twisted rope of light runs from the ship's nose to the top of the playfield** —
a braided cream-and-brown column about 60 px wide, with the ship sitting inside
a glowing oval at the bottom of it and a mass of orange fire boiling out of its
head two thirds of the way up the screen. That is the four heads and
twenty-seven live segments of §4, drawn.

### 7.3 **E5a's CHECK, BUILT FOR THE BOMB SHARD** — and it can only pass for one reason

`games/ddpdoj/.scratch/serve404.py 8767 shard13`, the identical held-fire
script:

```
[M] BOOTED  spr 13/14  dl 77 drawn 77  err ""      <- the page runs NORMALLY
[M] BEFORE  spr 13/14  dl 30 drawn 30  err ""      <- 15 s of beam, still normal
[M] BOMB1   lf 3091 -- THE FIRST FRAME A BOMB RECORD ASKS FOR ART -- and it stops:
    "SPRITE SHARD 13 DID NOT LOAD (assets/spr/mask.shard13.u16.gz: HTTP 404).
     It holds 218 sprite streams -- THE BOMB AND THE LASER BOMB: $255E3E's
     three phase scripts, the laser bomb's data block $256662..$256986, pool
     E's $28A464, the ship's bit-7 aura and type $8A's pair (W66) -- and a
     record has asked for one of them."
```

**The page ran normally through boot, through fifteen seconds of held fire and
through the whole beam, and stopped on the exact frame the bomb needed the
shard, naming it by what it holds.** The headless half of the same check is a
`webgate` row: the identical run with shard 13 IN FLIGHT emits the SAME 5,906
records starting on the SAME frame, draws 0 of them, and reports all 5,906 as
PENDING and 0 as MISSING ART.

**[M] BOTH SERVERS I STARTED WERE KILLED.** `Get-CimInstance Win32_Process`
finds **zero** python processes and `netstat` shows **no listener** on 8766 or
8767 — checked by PROCESS and by PORT, as W61 §6b, W63 and W65 did. Eight
orphans accumulated on 4 Aug and one blocked a publish; this wave left none.

## 8. THE GATE, ON THE SETTLED TREE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 67 passed, 0 failed, 0 SKIPPED
node --test games/ddpdoj/tests/       922 pass, 0 fail, 0 SKIPPED   (was 921)
node games/ddpdoj/tools/webgate.mjs    17 of 17 PASS                (was 14)
node games/ddpdoj/tools/bundlegate.mjs 15955968/15955968 = 100.0000%  <- UNMOVED
node tools/build-dist.mjs              clean, 5 deliberate exception(s) <- UNMOVED
node games/ddpdoj/tools/w64bombgate.mjs 21 of 21   w65beamgate 22 of 22
```

`bundlegate` could not have moved and that is worth stating as a reason rather
than as luck: **shard 0 was not touched**, so `capture.bin` is byte-identical
and the 159 compared frames read the same packed bases they always did.

**`PUBLISH_VERBATIM` DID NOT GROW.** Shard 13's colour body is 218 streams from
five disjoint ROM regions, so the packed file matches nothing contiguously —
the same accident of packing order W47 §3 explains, and it is luck rather than
virtue, stated as such.

The three new `webgate` stages are this wave's: the ORDINARY bomb, the LASER
bomb and the WITHHELD shard. Each asserts `streams` (the bundle's), and
`records`/`distinct`/`first`/`stock` (the PORT's, which no bundle can supply) —
W47 §4.1's trap, avoided the way every stage since has avoided it.

## 9. WHAT THIS WAVE DID NOT DO

- **E3's HOLE IS NOT MINE.** `$24B900..$24BB0A` is still unexported and
  `$24BB0A` entries 7..19 still throw loudly. `[M]` every address this wave
  harvests is named by a table inside a window the exporter already ships, so
  the window and the art did not have to move together here — and I moved
  neither, exactly as E3 instructed.
- **THE HYPER.** Every arm of `$249868` still throws.
- **`$249F8A`** — still unported, still declared, still hidden from the owner by
  the page's own `$FF` poke.
- **Nothing is compared against MAME.** No gate in this repo has pressed Button
  2 against the board. What is proved is that the port asks for stream addresses
  the cartridge's own tables contain, that the bundle holds every one, and that
  every record draws. **A record with a correct descriptor can still be the
  wrong record**, and whether the board's bomb looks like this is unmeasured.
- **`manifest.json` is still uncompressed** (§5.2), ~6 KiB of boot on the table.
- **Five scenarios, not the game.** "Zero missing streams" is a statement about
  the five inputs in §1.1 and nothing wider.
- **`games/gradius/` was not touched.**

## LOG (appended as findings arrive)

- opened.
- §1 [M]: the premise holds and is a FLOOR. 174 bucket-13 records over **16**
  distinct streams; the laser bomb's "three" is **75**.
- §1.1 [M]: **held fire with NO bomb is 100.0 % and 0 missing**, so all 75 are
  the laser bomb's. The control is what makes that a measurement.
- §2 [M]: **226 streams derived from the cartridge, 187.6 KiB gz, and all 91
  measured misses are inside it.**
- §3.1 [M]: **`$276756 tst.w $811F72` makes enemy type `$8A` animate while a
  bomb is up** -- 2 writes without a press, 102 with one.
- §3.3 [M]: E3 §2.2's own "next family" is 8 frames of stride 68 ending at
  `$12D650`.
- §4 [M]: **THE FORTY-ONE BEAM SEGMENTS NEVER EMITTED A RECORD.** W65
  transcribed `$25624C`/`$2562EA`/`$25620C` as a bare `drawn++`. Bucket 13
  1,179 -> 2,605 records, 48 -> 109 streams, and **all 109 were already in the
  derived harvest.** No gate in this repo could have seen it: bucket 13 had no
  shard, so a MISSING record and a SKIPPED record were indistinguishable.
- §5.2 [M]: **BOOT 489.5 -> 490.0 KiB, +517 B** (manifest +421, stream table
  +96) and **`player.tables.json.gz` DID NOT MOVE -- NO NEW ROM WINDOW.**
- §6 [M]: 21 of 21 mutants RED, 0 survivors, every restore sha256-identical.
- §6.1 [M]: **`B13_MEASURED` COULD NOT FAIL as first written** -- 91 measured
  MISSING addresses, and cutting the laser bomb's block at `$256802` survived
  them all. It is now the port's own DEMAND (152) against a harvest of 218.
- §6.2 [M]: the aura block's second pointer is unfalsifiable by any run here
  (ship selector is 0 on the whole corpus), so its SHAPE is asserted instead.
- §7 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER.** The ordinary bomb is a
  screen-filling cream blast ring; the laser bomb is a braided column of light
  from the ship to the top of the playfield with fire boiling out of its head.
  `drawn == dl` and no `NO ART` on every sample of both runs.
- §7.3 [M]: **E5a's CHECK.** With shard 13 404'd the page boots normally, runs
  fifteen seconds of held fire normally, and stops on the exact frame a bomb
  record asks for art, naming the shard by what it holds. Both servers killed,
  checked by PROCESS and by PORT.
- §8 [M]: gate ALL GREEN 67/0/0; 922 unit tests; webgate 17/17; bundlegate
  100.0000 % unmoved; `PUBLISH_VERBATIM` still 5.
