# 86 -- IMPL: the fighter can die, and the black terrain gets its pictures

status: **DONE** -- §0 refuses one of the brief's three premises and shrinks item
2 to a quarter of its size, §1 and §2 are the two items with before/after, §3
answers the coordinator's three mid-wave questions with measurement, §5 says
which bar condition each item met, and §6 is a NEW owner-visible defect this
wave found and did NOT fix.

started / finished: 2026-08-06. wave: 86. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree. Anything from another
document is `[cited]` and named.

inputs read in full: `68-diag-invisible-collidables.md`,
`75-diag-laser-hold-run.md`, `81-impl-fighter-mech-art.md`,
`85-impl-boss-bucket-trace.md`, `83-NOTE-censored-census-and-the-sim-server.md`,
`39-OWNER-visible-play-before-sound.md`.

files written: `games/ddpdoj/src/handlers.js`, `games/ddpdoj/src/background.js`,
`games/ddpdoj/tools/export-web.mjs`, `games/ddpdoj/tools/webgate.mjs`,
`games/ddpdoj/tests/w86death.test.js` (new),
`games/ddpdoj/tests/w86bgelem.test.js` (new), and this worklog. Nothing
ROM-derived is committed; `assets/` is gitignored and every probe is in
`.scratch/w86/`, which is too. **One web server was started and it was killed by
process and by port before finishing** (§7).

---

## 0. THE PREMISE, CHECKED FIRST -- and one of the three is REFUSED

| the brief says | `[M]` verdict |
|---|---|
| "`$274AF0` is the only thing standing between `$82` and death" | **TRUE.** `[M]` `tools/oracle/w27disasm.py 274AF0 274B70` is twenty-two instructions with no branch, and every callee is already ported: `$28615E` is `src/score.js scoreKill`, `$289004` is `src/effects.js spawnEffect`, `$263762` is `src/initbody.js freeEnemy`. The only outward call with no port is `$28C274`, and that is ONE SOUND REQUEST (§1.1) |
| "`$8B` and the black terrain are one object" | **TRUE, and unchanged.** `[cited: W75 §3.4]`; nothing I measured moves it, and §2's fix draws the picture `$8B`'s lattice sits on |
| "`$232578` is the only missing bucket 2/3 element" | **FALSE BOTH WAYS, and this is the correction.** `[M]` **FIVE** background elements had no picture, not one; and **W68's "bucket 3 has 42" is CLOSED** -- not one `$151xxx`, `$1723xx`, `$1725xx`, `$1727xx` or `$17Dxxx` address appears in the port's NO-ART list any more. W58, W66, W81 and W84 shipped them between them and nobody re-measured. So item 2 is **five streams and one harvest row**, not forty-seven streams |

### 0.1 THE CENSUS THE SIZING SHOULD HAVE COME FROM

`[M]` `.scratch/w86/noart.mjs`: 6,500 steps from the shipped seed over the
SHIPPED bundle with all 17 sprite shards fetched, fire tapped every 4 and the
ship sweeping, `$810424` poked so the run reaches lf8,500 (`docs/knowledge/09`:
a poked run gives STATES). **The measurement is taken twice**, once as shipped
and once with the five new streams deleted from the map, which is the bundle
exactly as it stood before this wave:

```
                                       PRE-W86 BUNDLE      AFTER
[M] display-list records                    534,575       534,575
[M] ...with NO ART                           11,044         4,017
[M] distinct missing streams                     51            46
[M] of which the five ELEMENTS                7,027             0
```

```
[M] $231C44 x1568  first step 3627   ** background element 8  **
[M] $232578 x1568  first step 4299   ** background element 9  **   <- W75's $8B
[M] $231520 x1504  first step 3755   ** background element 7  **
[M] $232EAC x1376  first step 4747   ** background element 10 **
[M] $233630 x1011  first step 5275   ** background element 11 **
```

**Five streams were 63.6 % of every no-art record, and they are the biggest
records on the screen** (`[cited: W55 §2.2]`, the 18x208 class; `[M]` `$231C44`
is 336x112 px and `$23061C` is 320x192). The 46 that remain are 4,017 records of
two small families and one enemy, named in §6.2.

### 0.2 AND WHY THE FIVE WERE MISSING -- a MEASURED FLOOR, for the third time

`[M]` `tools/export-web.mjs` `STRUCTURE_STREAMS` was eighteen addresses, and
eight of them were background-element data pointers: `$22CBCC $22DA70 $22DED4
$22E508 $22F184 $22FE98 $23061C $233F34` -- handlers **0, 1, 2, 3, 4, 5, 6 and
12** of `src/background.js`'s thirteen, and not one of 7..11. The block's own
header names the correct extent:

> *"they are reached from BACKGROUND-ELEMENT IMMEDIATES (`$2623A6..$262760`) and
> from tables no ported handler indexes, so there is no table for this file to
> walk to an extent ... THIS LIST IS A MEASURED FLOOR AND IT IS SAID SO HERE"*

`[M]` `$2623A6` is constructor 0's immediate field and `$262760` is constructor
12's. **The extent was written down in the file the whole time and the list was
still taken off a 3,000-frame run**, which reaches handlers 0..6 and 12 and not
7..11, because those five first draw at steps 3,627..5,275. That is `46-diag`'s
tank hulls and W81 §1.3's `$272D7A` for the third time, and the first where the
right answer was already in the comment above the wrong one.

---

## 1. ITEM 1 -- `$274AF0`, AND THE FIGHTER DIES

### 1.1 What it is

`[M]` `python tools/oracle/w27disasm.py 274AF0 274B70`:

```
[M] 274AF0  moveq #$42,D0 / jsr $28615E     the KILL SCORE
[M] 274AF8  jsr $28C274                     a SOUND cue
[M] 274AFE  moveq #$D,D0 / jsr $289004      explosion 1, then six fields
[M] 274B2A  move.w #$8,D0 / jsr $289004     explosion 2, then eight
[M] 274B64  jmp $263762                     free the record
```

`[M]` `$28C274` is `movem / move.w #$1,D0 / #$9E,D1 / #$1E,D2 / jsr $28C0AE` --
one request into the sound driver, which `39-OWNER` puts LAST. It stays a
counted note, exactly as `$275BA0` does in `deathSeq85`.

`[M]` **D1 reaches `$274AF2` intact.** `$2747EE..$2747F4` builds the hit mask in
D1 and the only call between it and the death arm is `$27481C jsr $286096`,
whose body works in D2 and A0 (`$286096 btst / $28609E btst / $2860A8 move.w
$811F72,D2`). So `scoreKill(..., 0x42, d1)` takes the same `d1` `deathSeq85`
takes, which is why that function already had the parameter.

`[M]` Both effect kinds are `<= $21`, so neither goes to `$289004`'s bit bucket,
and `src/effects.js` drives both off the cartridge's own 34-entry script tables.
**There is no per-kind code to write.**

### 1.2 The result, before and after

`[M]` `.scratch/w86/weapons.mjs`, 6,500 steps, measured by swapping
`src/handlers.js` for `git show 2be395d:` and back -- same bundle, same input,
two inputs (the ordinary shot TAPPED every 4 frames, and the LASER HELD):

| | TAP before | TAP after | LASER before | LASER after |
|---|---:|---:|---:|---:|
| `$82` live slot-frames | 9,730 | 6,002 | 12,400 | 4,526 |
| **...at NEGATIVE HP** | **4,045 (41.6 %)** | **9** | **7,896 (63.7 %)** | **22** |
| ...carrying a HIT MASK | 605 | 213 | 183 | 103 |
| `($1D,A6)` palette CHANGES | 376 | 390 | 156 | 158 |
| **kills at value `$42`** | **0** | **18** | **0** | **24** |
| explosions at `$274B00`/`$274B2E` | none | 18 + 18 | none | 24 + 24 |
| kills / score, all types | 433 / 5,931 | 459 / 7,037 | 393 / 6,808 | 417 / 8,392 |

`[M]` And the counted note itself: **417 `$274AF0` notes over 12 distinct
records** before, **0** after. The 417-over-12 shape IS the defect: the same
twelve fighters re-entered the death arm on every later hit because none of them
ever died.

**"63.7 % of every fighter slot-frame was a zombie at negative HP" is the
owner's "unkillable ships" as a number.**

### 1.3 The tests, and every one seen to fail

`games/ddpdoj/tests/w86death.test.js`, six tests.

```
[M] src/handlers.js at HEAD                        W86/1..5 RED, /6 GREEN
[M] MUTATION setU8(e2 + B.speed, 0x680)            W86/4 RED ALONE
[M] MUTATION setU16(e2 + B.f1c, 0x40)              W86/4 RED ALONE
[M] MUTATION e1 pos from ($2,A5)                   W86/3 RED ALONE
[M] MUTATION scoreKill(..., 0x25, d1)              W86/2 RED ALONE
[M] MUTATION first allocation kind $08, not $0D    W86/3 and /5 RED
```

**W86/6 staying green at HEAD is the point of it.** It is the control: a change
that freed the fighter on every hit would satisfy W86/1 and redden /6.

Two assertions deliberately refuse to read their subject through the constant
they test:

* **bucket `$10` is never compared with `$10`.** It is resolved through
  `EMIT_STUB`, `$288FF0`'s own five entries, and asserted to be `$23D852` --
  bucket 7, the layer type `$82` itself draws into.
* **"the fighter explodes" is not "two slots were allocated."** Both kinds are
  resolved in the cartridge's own `$221520` script table and each must name a
  descriptor list inside `$221740..$222617` whose first entry is a real stream.
  An explosion with an empty script is an invisible death.

The fixture carries a DECOY at `($2,A5)` different from `($2,A6)`, because W30
found exactly that swap eight instructions above this arm.

---

## 2. ITEM 2 -- THE FIVE BACKGROUND ELEMENTS, AND THE BLACK TERRAIN

### 2.1 What shipped, and it is an ENUMERATION rather than a run

A stage-1 background element is a `$20`-byte slot whose `($10,A6)` is a SPRITE
STREAM ADDRESS, written ONCE by its constructor's `move.l #imm,($10,A6)` and read
every frame by `$23DF2A` (`src/background.js elemStage`) as the record's
descriptor. `[M]` `elemConstruct` is its only writer; `elemUpdate` only reads it.
**So the art an element can ever ask for is ONE stream, and there are exactly as
many as `src/background.js` has handlers.**

`BGELEM_HANDLERS` is now `export`ed and `tools/export-web.mjs` IMPORTS it. That
is the design point: `elemSpawn` throws a loud named `unreached` for any
constructor outside those thirteen, so *"every element the port can construct has
a picture"* is a property of ONE array rather than an agreement between two
copies of a list. An element the port cannot construct stays a named throw,
which the exporter's own header already prefers to a quiet blank.

**And the thirteen are checked against the cartridge from three sides, which the
port's typed-in constants had never been:**

1. the ROM's own stage-1 handler table `$26224A` must name handler `i`'s
   constructor at entry `i`, in order;
2. the constructor must BE `2D7C <data> 0010`, i.e. `move.l #data,($10,A6)` --
   so `data` is read out of the instruction that writes it;
3. `romExtent(data)` must accept it as a real stream start in the mask ROM chain.

`[M]` Eight were already in the sheet (they were `STRUCTURE_STREAMS`' eight,
which this wave removed from that list) and **five are new**.

### 2.2 The result, before and after

```
[M] sprite shard 11 "structures"   153 streams -> 158        314.6 KiB gz
[M] total sprite streams         2,125 -> 2,130
[M] boot payload                 UNCHANGED (shard 11 is DEFERRED, order 16)
[M] NO ART records, 6,500 steps  11,044 -> 4,017   (-7,027, -63.6 %)
[M] distinct missing streams          51 -> 46
```

### 2.3 The checks, and every one seen to fail

**In the exporter**, three mutations of `src/background.js`, each stopping the
build with a named message:

```
[M] MUTATION row 9's data 0x232578 -> 0x232579
      "background element 9 ($262674): the cartridge writes $232578 into
       ($10,A6) and src/background.js says $232579"
[M] MUTATION row 9's ctor 0x262674 -> 0x262676
      "background element 9: the cartridge's own handler table $26224a names
       $262674 and src/background.js's row 9 is $262676"
[M] MUTATION rows 7 and 8 SWAPPED
      "background element 7: ... names $2625d8 and ... row 7 is $262626"
```

**I could NOT make check (2), the `2D7C ... 0010` instruction shape, fail on its
own**, and this is said rather than left implied: every address that fails the
shape check also fails the table check, which runs first. It guards a hazard that
is real and not reproducible today -- a constructor relocated so the table still
matches while the immediate moves to a different displacement.

**In `tests/w86bgelem.test.js`**, three tests, two mutations:

```
[M] MUTATION row 9's ctor 0x262674 -> 0x262676     W86/1 RED
[M] MUTATION row 9's data duplicates row 8's       W86/2 and /3 RED
```

W86/3 is RED at HEAD by construction: the `$26224A` harvest row it reads out of
`manifest.spr.harvest` is produced by code this wave adds, and without it the
first assertion fires.

W86/1 also pins the thing that makes "13" mean something: `[M]` **entry 13 of the
ROM table is `$2627AC`, a constructor of the identical shape**, so the table does
NOT end at thirteen. What ends at thirteen is what THIS PORT can construct, and
`$2627CA` -- `$2627AC`'s updater -- is one of the addresses `[cited: W75 §5.1]`
measured the port blocking on 15 times.

### 2.4 AND THE GATE THAT COULD NOT SEE ANY OF THIS

`tools/webgate.mjs`'s W58 stage pins sprite shard 11 and it moved from 153 to 158
streams. **The other three numbers in that stage -- 12,769 records, 101 distinct
images, first at frame 315 -- did not move at all, and that is the finding rather
than the excuse: the window is 1,500 frames long and the five elements first draw
at step 3,627.** The longest window anywhere in that file was 2,700 steps. W68
§0.2 measured the identical sentence ("drawn% 100.00 %, ZERO missing streams")
being TRUE at 2,600 frames and FALSE at 4,000 on the same input, and this gate
has been reporting the true half ever since.

So a stage was ADDED rather than a number re-pinned:

```
[M] PASS: W86 THE BLACK TERRAIN (the 13 stage-1 background elements,
    $2623A4..$26275E, one sprite each) -- over 5500 logic frames from the
    shipped seed with fire tapped and the ship sweeping, the port's own $800000
    list carries 17047 records of them (expect 17047) over 13 distinct images
    (expect 13), of which 5251 (expect 5251) belong to the 5 of 5 elements
    (expect 5) that had NO PICTURE until W86, first at step 3627 (expect 3627 --
    927 steps past the longest window this file had). 17047 DRAWN, 0 pending,
    0 with NO ART.
[M] PASS: W86 --break drop-bgelem-art -- with handlers 7..11's five streams
    taken back out of the map the SAME 17047 records are emitted (expect 17047
    -- the port does not change) and 5251 of them are named as MISSING ART
    (expect 5251), 11796 drawn.
```

`[M]` The whole gate is GREEN, exit 0, `--break drop-bgelem-art` included. Every
number in it is the PORT's own and no bundle can supply any of them (W47 §4.1's
trap); a window that reached only four of the five would pass a bundle missing
the fifth, so `5 of 5` is asserted separately from the record count.

---

## 3. THE COORDINATOR'S THREE QUESTIONS, ANSWERED WITH MEASUREMENT

Mid-wave the owner reported, on the live build:

> *"after killing the first mid boss, unkillable ships show up. The laser shoots
> through them, the normal shot hits them, but they don't take damage. Sometimes
> they flicker when you shoot the laser through them."*

The coordinator asked three discriminating questions. `[M]` §1.2's table is the
experiment; here is what each column says.

### 3.1 "The laser shoots THROUGH them, the normal shot HITS them"

**BOTH WEAPONS REGISTERED AND BOTH APPLIED DAMAGE, AND THE LASER APPLIED MORE.**
`[M]` Before this wave, with the laser HELD, **63.7 %** of every `$82` slot-frame
was already at negative HP, against **41.6 %** with the shot tapped. The laser
was not missing; it was killing them *faster* and producing *more zombies*. That
is why it reads as "shoots through": there is nothing left to hit.

**What genuinely differs by weapon is the IMPACT EFFECT, and it is unported.**
`[M]` With the laser held, `$255066`/`$2550F0 jsr $289FC0`/`$289FDA` -- the
beam's own impact effect -- is a counted note reached **1,789 times** in 6,500
steps; with the shot tapped it is reached **zero** times. `[cited: W34 §1.6]` and
`src/spark.js` declare that family, and `[cited: W75 §5.1]` priced it as the wall
that blocks 66 of 209 segments on a held-laser ladder. **So "the laser shoots
through them" is one real defect (no impact flash on the beam) sitting on top of
another (the enemy could not die), and only the second is fixed here.**

### 3.2 "Sometimes they FLICKER"

**The flicker is `$274830`, and it is ALREADY PORTED.** `$274822..$274834`:
`move.b ($1D,A6),D0 / cmpi.b #$19 / move.b ($1C,A5),D0 / move.b ($1D,A5),D2 /
eor.b D2,D0`, written back at `$274854 move.b D0,($1D,A6)` -- the enemy's
PALETTE byte, EOR-ed on every damaged frame. That is the damage flash.

`[M]` It fires 156 times with the laser held and 376 with the shot tapped, over
6,500 steps, and **the count barely moves across this wave (156 to 158, 376 to
390)** -- because it was never the broken part. **The flicker is the object
registering the hit, and before this wave it was the ONLY thing that happened.**
The coordinator's hypothesis "taking a hit and not accumulating damage" is half
right and the half that is wrong matters: damage accumulated perfectly (HP went
negative and stayed there on 7,896 slot-frames), and what did not happen was
DEATH.

### 3.3 "SOMETIMES", not every time

`[M]` Quantified: with the laser held, **183 hit-mask frames out of 12,400 `$82`
live slot-frames -- 1.5 %.** Damage is delivered by the collision pass on its own
cadence, not by the beam every frame, so the flash is a rare per-hit event and
"sometimes" is the correct description of the ROM's behaviour, not a symptom.

`[M]` A second mechanism exists and is worth recording: `src/effects.js`
`runEffectDriver`'s `parityGate` (`$288FBC lea $811F72 / $288FC2 tst.w / bpl` +
`$288FC8 move.w $80390A / andi.w #$1`) **steps pool B on ALTERNATE FRAMES ONLY
while the laser record is live**. So anything visual out of pool B -- the
explosion this wave adds included -- runs at half rate during a beam. That is the
cartridge's own arithmetic and it is already transcribed; it is named here
because it will look like a defect to whoever measures explosions next.

**None of this changes the fix.** `$274AF0` was the whole of "they don't take
damage", and `$289FC0`/`$289FDA` is the whole of "the laser shoots through them".
The second is not this wave's and is not touched.

---

## 4. THE PAGE, OPENED, AND WHAT I SAW

`[M]` `python .scratch/w86/browser.py 8787 130` -- a `http.server` over the
working tree, the real
`C:\Program Files\Google\Chrome\Application\chrome.exe` driven by the
`playwright` package that was already installed (nothing was downloaded),
`http://127.0.0.1:8787/games/ddpdoj/index.html`, **fire HELD for the whole run**
and the ship swept through all four directions on a 3-second cycle. 435 samples,
**lf2,029 to lf9,704, 60.06 Hz**, `shards 8/8` and `spr 17/17` on every sample
past 10 s.

```
[M]   0s lf2029 shards 4/8 spr 3/17  dl 39  drawn 38  kills 0    $42 0
[M]  30s lf3809 shards 8/8 spr 17/17 dl 71  drawn 71  kills 108  $42 0
[M]  60s lf5592 shards 8/8 spr 17/17 dl 83  drawn 83  kills 189  $42 0
                elem {$22E508, $22FE98, $22F184, $23061C}
[M]  70s lf6184 shards 8/8 spr 17/17 dl 87  drawn 87  kills 212  $42 5
                elem {$231520, $22F184, $23061C, $231C44}
[M]  90s lf7360 shards 8/8 spr 17/17 dl 67  drawn 67  kills 284  $42 7
                elem {$233630, $232578, $232EAC}
[M] 120s lf9142 shards 8/8 spr 17/17 dl 20  drawn 20  kills 323  $42 8
[M] all 13 background elements drew: $22CBCC 106  $232578 90  $231C44 87
       $22E508 86  $22FE98 86  $22DED4 85  $23061C 85  $231520 85  $22F184 83
       $232EAC 80  $22DA70 65  $233630 60  $233F34 55
[M] NO ART never named any of the thirteen, on any of 435 samples
[M] final: 323 kills, score 5014, $42 kills 8, $D@$274B00 x8 | $8@$274B2E x8
[M] PAGE ERRORS: one 404, and it is the favicon
```

**WHAT IS ON THE SCREEN.** Two screenshots, taken automatically at the first
frame each condition became true rather than chosen by eye (W81 §5's lesson):

* `.scratch/w86/w86-terrain.png`, **lf5,631, the first frame `$231C44` is on
  screen**: the playfield is **gold and orange industrial terrain from edge to
  edge**, with lava channels, blue-grey emplacements and two of the large
  forward-swept-wing fighters. **There is no black polygon.** W68 §6's screenshot
  of the same stretch is *"the left half of the playfield is a large black
  polygon with two big grey emplacements hanging over it"*; that half is now
  drawn.
* `.scratch/w86/w86-fighterkill.png`, **lf5,681, the first frame after a `$82`
  died**: **two large orange fireballs and a dark brown smoke cloud**, with the
  laser beam up through the middle of them. That is `$274B00`'s kind `$0D` and
  `$274B2E`'s kind `$08`.

**So: I shot a fighter and watched it explode, and I flew to where the terrain
went black and it is drawn.** Both of the owner's own tests, in a real browser,
on this tree.

---

## 5. **THE BAR -- WHICH CONDITIONS I DELIVERED, PER ITEM**

### 5.1 ITEM 1, `$274AF0`: **CONDITION 1 MET. CONDITION 2 NOT MET, and why.**

**FEATURE COMPLETE: MET.** §4. The owner's test for this item is "shoot a fighter
and watch it explode" and I did it in Chrome at lf5,681. `[M]` 18 fighters die on
a tapped run and 24 on a held-laser run where 0 died before, each with two
explosions out of the cartridge's own script table.

**ORACLES PERFECTLY: NOT MET, and the reason is a hole rather than a result.**
`[M]` `seedcmp --manifest .../stage1-sweep/manifest.json --quiet` is
**BYTE-IDENTICAL before and after this wave** -- 9 green / 19 red / 43 blocked,
6,750 logic frames, and `diff` over all 71 segment lines is empty. That is not
evidence the death arm is right; **it is evidence the comparison cannot see it.**
The compared columns are the player, the options, the shots, the scroll and the
video counters; **the enemy record table `$81332C`, the sub-record pools, pool B
and the score ledger are not among them**, so a fighter that lives when the board
killed it moves no column. The instrument that CAN see it is `tools/boarddl.mjs`
against a checkpoint ladder, per type -- and `[cited: W81 §3.1]` the reachable
rungs of `stage1-laser-hold` are 29 of 210, so the coverage would be thin.
**Item 1 therefore carries W82's weaker claim: transcribed from the listing,
unit-tested against the listing with five mutations, driven in a real browser,
and NOT compared against the board.**

### 5.2 ITEM 2, the black terrain: **CONDITION 1 MET. CONDITION 2 IS THE WRONG
### INSTRUMENT AND I SAY SO RATHER THAN CLAIM IT.**

**FEATURE COMPLETE: MET.** §4. All thirteen elements draw on the live page,
`NO ART` names none of them on 435 samples, and the black polygon is gone from
the screenshot.

**ORACLES PERFECTLY: THE BUCKET-2 TRACE IS STRUCTURALLY BLIND TO IT, BY
CONSTRUCTION.** `[M]` the sweep reports, before and after, identically:

```
BUCKET 2 ($805CC8): 20785 record(s) the port appended over 6750 frames were
checked for containment in the board's, 0 MISSING; and they were an ordered
SUBSEQUENCE of the board's on 6750 of 6750 frames
```

**and it was already 0 MISSING before this wave.** A bucket-2 record is twelve
bytes of position, descriptor, size and flip/colour word. **The port's records
were always right; what was missing was the PICTURE the descriptor points at, and
no record comparison can see a picture.** The brief asked me to use W85's trace to
prove this work, and the honest answer is that the trace proves the RECORDS and
was already green on them. `[M]` The 0-missing result is worth stating for a
different reason: it says the five elements' records were byte-identical to the
board's for the whole 6,750 frames, so the five streams I harvested are the ones
the board's own records name.

**What DOES oracle item 2, and it was seen to fail:** the exporter's three
cartridge cross-checks (§2.3, three mutations, three named build failures),
`tests/w86bgelem.test.js` (two mutations), and `webgate`'s new `--break
drop-bgelem-art`, which puts the bundle back exactly as it was and reports 5,251
records with NO ART where the honest run reports 0.

### 5.3 The gates

```
[M] node --test games/ddpdoj/tests/        1,028 pass, 0 fail, 0 skipped
                                           (1,019 before; +6 w86death, +3 w86bgelem)
[M] node tools/seedcmp.mjs --manifest .../w69/stage1-sweep/manifest.json --quiet
      SEGMENTS 71: 9 green, 19 red, 43 blocked, 0 seedbad, 0 error
      6,750 logic frames -- IDENTICAL to W85's, segment for segment
      BUCKET 2: 20,785 records compared, 0 MISSING, ordered subsequence
                on 6,750 of 6,750
[M] python tools/oracle/pgm.py check       VERDICT: FAILURES -- 72 passed,
                                           2 failed, 0 SKIPPED
      the SAME TWO as W82, W84 and W85, and NEITHER MOVED:
        `segment sweep` (43 blocked + 19 red rungs remain)
        `THE LASER BOMB: $249A80, $255FE2 and $2456A6` (W79 §6.5 filed it as a
        concurrent wave's; W84 and W85 established the same)
      NO THIRD RED.
[M] node tools/webgate.mjs                 GREEN, exit 0, all stages including
                                           the two new W86 ones
[M] node tools/build-dist.mjs              GREEN, 6 deliberate exceptions,
                                           NO SEVENTH `PUBLISH_VERBATIM` ENTRY
[M] node tools/publish.mjs --only ddpdoj --dry
      GREEN. build 20260806042347, dist/ 255 files 6472 KB, rom-leak guard
      clean with six deliberate exceptions
```

`[M]` **The five new streams did NOT need a seventh `PUBLISH_VERBATIM` entry.**
They went into shard 11, which already holds 153 streams with holes in it, so the
packed buffer matches nothing contiguous in any ROM. Putting them in a new
five-stream shard would have risked exactly W81 §7's `col.shard15` problem; that
is why shard 11 was chosen and it is not an accident.

---

## 6. WHAT IS STILL WRONG

### 6.1 **A NEW OWNER-VISIBLE DEFECT, FOUND HERE AND NOT FIXED -- and it REFUTES
### W81's explanation of the same thing**

`[M]` The lf5,631 screenshot has the terrain drawn AND **six solid black
aircraft-shaped silhouettes** on it. W81 §5 saw the identical shapes, chose them
by eye, spent a detour on a palette theory, and concluded: *"cropping by eye on a
screen that still has W68 §5.2's missing bucket-2/3 background art on it is how
you diagnose the wrong subsystem."* **That explanation is now refused: the
bucket-2/3 art is shipped, the frame reports 0 NO ART, and the black shapes are
still there.**

`[M]` `.scratch/w86/black.mjs` dumps the port's own list at that exact step.
There are **six** records that match the shapes, and they are consecutive:

```
[M] #2 $202848  #3 $2063C4  #4 $203C1C  #5 $205AF4  #6 $205224  #7 $204720
    all 7x80 = 112x80 px, colour bank 28, flip 1
[M] and $202848 -> SPRITE SHARD 9, packed base 133678, 562 words present
[M] colour banks in the frame: c0:4 c4:17 c6:1 c12:2 c16:3 c20:38 c22:4
                               c24:12 c26:4 c28:17
```

**They are SHARD 9 -- the enemy death explosion's own art -- they have their
pixels, and they draw black.** `[M]` I did NOT determine why: my palette-bank
probe read banks 24, 26 and 28 as all-zero, but bank 24 is where `$1735FC` (the
fighter, which draws in full colour on the same frame) lives, so **my palette
indexing is wrong and I am not reporting its answer.** The two candidates are a
palette bank the shipped block does not populate, and a genuinely dark late cell
of the explosion animation (the fighter-kill screenshot does contain a correct
dark-brown smoke cloud). **Settling it needs a pixel comparison against the
board, which nothing in this repo does for an enemy sprite** (W81 §6 says so
too). It is not a regression from this wave, it is on the owner's screen today,
and it is the next thing I would look at.

### 6.2 The 46 streams still with no picture

`[M]` 4,017 records over 6,500 steps, 0.75 % of the frame, in three groups:

* **`$0650xx`/`$06515x` and `$001Fxx..$0023xx`, 41 streams, 3,422 records**, all
  first drawn between steps 91 and 296, i.e. immediately and unchanged by this
  wave. `[cited: W58]` `tools/export-web.mjs` already names this family:
  *"`$065354` has shipped since W45 and `$065388`, the shadow beside it, did not:
  it is bucket 5's only missing stream"*. It is the option pods' muzzle and
  ground-shadow block and it is bigger than that note says.
* **`$07E8AC`, 534 records** -- enemy type `$24`'s literal at `$29709E`
  (`src/handlers.js emit24`). Its OTHER stream, out of the `$2970D8` table, is
  shard 4 and draws; only the immediate has no picture.
* **`$000000` x60** -- the known over-read `webgate`'s own W44 stage asserts.

### 6.3 The rest

1. **Item 1 is not compared against the board.** §5.1. The columns that would
   move are not in `CLAIMED`.
2. **`$82`'s two bullet arms are still counted notes** (`$27487A..$2749B2` and
   `$274A9C..$274AEE`), so a fighter that now dies still fires nothing.
   W21/W26/W27's subject, unchanged by this wave.
3. **The laser's impact effect `$289FC0`/`$289FDA`** -- §3.1, `[M]` 1,789 notes
   in 6,500 steps, and it is half of the owner's "the laser shoots through them".
4. **The shape check in the exporter cannot be made to fail alone.** §2.3.
5. **43 of 71 sweep segments are still BLOCKED** and the two `pgm.py check` reds
   are unchanged. Neither is this wave's.
6. **One input, and a poked one.** Every census here is 6,500 steps of one route
   with `$810424` held; `docs/knowledge/09` governs. Every count is a floor.

---

## 7. WHAT I TOUCHED, AND WHAT I DID NOT

* `games/ddpdoj/src/handlers.js` -- `deathSeq82`, and `$274AF0`'s note removed.
* `games/ddpdoj/src/background.js` -- `BGELEM_HANDLERS` exported, with the reason.
* `games/ddpdoj/tools/export-web.mjs` -- the `BGELEM_ART` block, and eight
  addresses moved OUT of `STRUCTURE_STREAMS`.
* `games/ddpdoj/tools/webgate.mjs` -- shard 11 re-pinned 153 to 158 with the
  reason, and the two new W86 stages.
* `games/ddpdoj/tests/w86death.test.js`, `games/ddpdoj/tests/w86bgelem.test.js`
  -- new, 6 and 3 tests.

Not touched: `publish.mjs`, `bundlegate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM`, `boarddl.mjs`, `seedcmp.mjs`, `portdiff.mjs`, `src/` (the
Game Boy tree), `games/gradius/`.

**THE WEB SERVER.** `.scratch/w86/browser.py` starts a `socketserver` on
127.0.0.1:8787 and calls `httpd.shutdown()` and `httpd.server_close()` before it
exits; the process is gone and the port is free. An earlier run on 8787's
predecessor 8786 died on an exception before its shutdown call, and its process
exited with it; `netstat` showed only `WARTEND` (TIME_WAIT) sockets, no listener.

---

## LOG (appended as findings arrived)

- opened. Read 68, 75, 81, 85, 83, 39. Disassembled `$274AF0..$274B64`,
  `$275B20..$275BA6`, `$2747C6..$274860`, `$286096`, `$28615E`, `$289004`,
  `$28C274`, `$26224A`, `$2623A4`, `$2625D8` and `$2627AC` before writing a line.
- `[M]` §0: **the brief's third premise is refused.** Five elements had no
  picture, not one, and W68's forty-two bucket-3 addresses are ALL GONE.
- `[M]` §0.2: **the exporter's own comment named the extent it did not use.**
  `STRUCTURE_STREAMS` held eight of the thirteen element immediates; the five it
  lacked are handlers 7..11, which no 3,000-frame run reaches.
- `[M]` §1.2: **417 death-arm notes over 12 records became 0, and 18 fighters
  die on a tapped run.** Before: 63.7 % of every fighter slot-frame was a zombie
  at negative HP with the laser held.
- `[M]` §3.1: **the laser was never missing.** It made MORE zombies than the
  ordinary shot. What it lacks is its own impact effect, `$289FC0`/`$289FDA`,
  1,789 counted notes and unported.
- `[M]` §3.2: **the flicker is `$274830`'s palette EOR and it was already
  ported.** Its count barely moves across this wave, because it was the one part
  that worked.
- `[M]` §2.2: NO ART 11,044 -> 4,017 records over 6,500 steps; shard 11 153 ->
  158 streams; boot unchanged.
- `[M]` §2.4: **webgate's longest window was 2,700 steps and the terrain goes
  black at 3,627.** A stage was added rather than a number re-pinned.
- `[M]` §4: **THE PAGE, IN CHROME.** All thirteen elements drew over 435 samples
  with `NO ART` naming none of them; the terrain screenshot has no black polygon
  and the kill screenshot has two fireballs.
- `[M]` §5.2: **the bucket-2 trace was already 0 MISSING and stays 0 MISSING.**
  It compares records; the defect was pictures. Said rather than claimed.
- `[M]` §6.1: **six black silhouettes are shard 9 explosion art with its pixels
  present**, and W81's explanation of them as missing background art is refuted.
  Unresolved and handed on.
- `[M]` §5.3: 1,028 tests 0 fail; `pgm.py check` 72/2/0 with the same two;
  webgate GREEN; `publish --dry` GREEN; no seventh `PUBLISH_VERBATIM` entry.

status: **DONE**
