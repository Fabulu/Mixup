# 81 -- IMPL: the art behind the fighter, the mech and the twin turret

status: **DONE** -- §1 refuses four premises with the ROM, §3 is the before/after
per type, §6 says which bar conditions I met, and **§7 is an OWNER DECISION that
blocks `build-dist.mjs` and that I did not take.**

started / finished: 2026-08-05
role: IMPLEMENTER. Files written: `games/ddpdoj/tools/export-web.mjs`,
`games/ddpdoj/tools/export-tables.py`, `games/ddpdoj/src/handlers.js`,
`games/ddpdoj/src/spritequeue.js`, `games/ddpdoj/tests/w81art.test.js` (new),
`games/ddpdoj/tests/handlers.test.js`, `games/ddpdoj/tests/w52weapons.test.js`,
`games/ddpdoj/tests/web-spr-shards.test.js`, and this worklog.
**`games/ddpdoj/src/player.js`, `tools/breakage.mjs`, `tools/portdiff.mjs` and
`tools/playgate.mjs` belong to the `$2497AA` agent and were NOT written to.**
`games/gradius/` not touched. **One web server was started and it was killed by
process and by port before finishing** (§8). Nothing ROM-derived is committed.

target: `ddpdojblk` VERSION-B. `[M]` = measured by me this session; anything
from another document is `[cited]` and named.

---

## 0. THE HEADLINE

`[M]` **The fighter, the mech and the twin turret draw, and I opened the page in
Chrome and looked at them.** Per-type records DRAWN by the port on the board's
own ladders, before → after:

| type | what it is | before | after | board |
|---|---|---:|---:|---:|
| `$82` | 96x88 blue forward-swept-wing FIGHTER | **0** | **57** | 57 |
| `$10` | 64x48 gold armoured MECH | **0** | **27** | 27 |
| `$88` | 96x96 twin-turret gun platform | 3 with **0 art** | **3, art 3** | 3 |

(`stage1-laser-hold`, 29 of 210 rungs compared. `stage1-play` 27 of 72:
`$82` 0 → 30/30, `$10` 0 → 53/53, `$88` 12/12 art 0 → 12.  `stage1-sweep`:
`$82` 31/31, `$10` 49/49, `$88` 12/12.)

`[M]` **And they are VISIBLE ON THE LIVE PAGE.** Chrome, the port's own bundle
over HTTP, fire held and the ship parked at the bottom: over 47 samples from
lf2,341 to lf8,133 the port's `$800000` list carried **105 records of `$1735FC`**
(the fighter's body), **49 of `$173810`** (its bucket-3 record), **184 of the
mech's `$16C7B4..$171070` family** and **40 of type `$88`'s**, with `spr 17/17`,
no page errors, and **`NO ART` never once naming any of the three**. §5 has the
screenshots, cropped at the records' own coordinates.

`[M]` **`$267FC6` COSTS ZERO LINES. IT HAS BEEN PORTED SINCE W30.** W80 §5 filed
it as *"a rank-selected position test that is NOT `$2425B2` and is NOT ported …
a second unported routine nobody has costed"*. It is `fireGate267FC6` in
`src/handlers.js`, 43 instructions plus `playerDist268018`, and `handlers.js:52`
has said *"the fire-gate `$267FC6` -- PORTED IN FULL BY W30"* for fifty waves.
Nothing in this wave fakes a rank input.

---

## 1. THE PREMISE, CHECKED -- AND IT IS WRONG IN FOUR PLACES

The brief told me to doubt three specific things and I found a fourth.

### 1.1 `$82`'s art is TWO streams, not fifty-seven

`[cited: W80 §5]` *"`$82` 0 of 57 present, 57 of 57 descriptors have NO PICTURE
in the bundle"*, streams column `$1735FC`.

`[M]` The 57 are **slot-frames of one stream**. Read out of the ROM, type `$82`
puts THREE records on the screen and their art comes from three different
places:

```
[M] $274A22 move.l #$60005000,D6 / $274A28 jsr $23DBCA
      descriptor = ($A,A6), and ($A,A6) is a CONSTANT: the sub-record
      prototype at $274770 carries $001735FC at +6 (loadSubProto copies it).
      Nothing in $2747C6..$274B64 writes ($A,A6).
[M] $274A16 lea $272DFA,A3 / $274A1C move.l (A3,D1.w),($28,A5)
      $274A3E move.l ($28,A5),D2 / $274A4A jsr $23DF86
      -> the 32-entry heading table $272DFA = $151E10..$152A2C, which is
      STRUCTURE_RANGES[3] and HAS BEEN IN SHARD 11 SINCE W58.
[M] $274A70 move.l #$173810,D2 / $274A7E jsr $23DF58
      an IMMEDIATE, and RANK-GATED at $274A50 (`tst.w $813098`).
```

`[M]` So `$82` needs **2 new streams, 2.6 KiB gz**, not 57. And the third one is
the case that makes the point: a rank-0 single-player run never asks for
`$173810`, so a harvest sized off any run would miss it. It is an immediate in
`W81_IMMEDIATES` for exactly that reason.

### 1.2 `$10`'s `$268594` is TWO tables, 64 and 32, and the "96" is their sum

`[cited]` `tools/export-web.mjs` and `manifest.spr.notHarvested` both said
*"`$268594` (enemy type `$10`, 90 absent, 51.8 KiB): no ported code reads it and
0 of its 96 streams were emitted"*. `[M]` Out of the ROM:

```
[M] $268300 move.w ($1A,A6),D7          the HEADING
    $268304 moveq #$3E,D1 / and.w D7,D1 / add.w D1,D1 / add.w D1,D1   -> $F8
    $26831C addq.w #$4,D1               on the mirror bit ($80390B bit 2)
    $26831E lea ($268594,PC),A0 / $268324 move.l (A0,D1.w),($a,A6)
        -> byte offsets 0..$FC = SIXTY-FOUR entries

[M] $2683AE addq.b #$1,D1 / andi.w #$3E,D1 / add.w D1,D1               -> $7C
    $2683B6 lea ($268694,PC),A0 / $2683BC move.l (A0,D1.w),($22,A5)
        -> THIRTY-TWO entries, and $268594 + $100 == $268694
```

`[M]` That is **instruction for instruction type `$11`'s hull/turret pair**
(`$2689A0`/`$2689B4` -> `$268B9E`, 64; `$268A46` -> `$268C9E`, 32; and
`$268B9E + $100 == $268C9E`). Both are reachable, both ship, and the run of 96
that the old note quoted is the two tables end to end -- pinned from below by
`[M]` `$268714` being `$3B7C0000`, code.

`[M]` **And the brief's doubt about "the 2 of 27 that DO have pictures" is
confirmed**: they are not the same kind of object. Of the 96, **2 were already
in the sheet from the HULL table and 4 from the TURRET table** -- the mech's
body and its gun, two different records with two different emitters and two
different position biases.

### 1.3 `$88` needs 37 streams, not one

`[cited: W80 §5]` *"type `$88` already emits 12/12 records with art for none"*
(`$17D480`). True, and `[M]` the census only saw the body because the body is
the only one carried in `($A,A6)`. Type `$88` is a TWIN turret:

```
[M] $275ECC prototype +6 = $0017D480, +$A = $0C60 (96 x 96)   the BODY
[M] $2763D8  4 entries   the sub-record's, ($28,A6) as a byte offset
             ($17D6C4 $17D778 $17D82C $17D8E0; [M] $2763E8 is $00000800,
              not a stream, so the cartridge closes it at four)
[M] $272D7A 32 entries   BOTH BARRELS -- src/initbody.js:560 and :565 have
             read it twice since W36, index (($1B,A6) & $3E) << 1
```

`[M]` `$272D7A` is `$151790..$151DDC`, stride `$34`, and **its run of valid
stream starts is 160**: it walks straight on through `$272DFA` (type `$82`'s, in
shard 11) and `$272E7A` (type `$89`'s, shard 2) before stopping at `$272FFA`. A
harvest sized off the RUN would have shipped 128 streams of other types' art;
the INDEX is what sizes it. That is `46-diag`'s tank-hull lesson from the other
side.

### 1.4 **THE FOURTH ONE, WHICH NOBODY ASKED ME TO DOUBT: `$23DBCA` IS NOT `$23D9E2`**

`[M]` `$274A28` is the first producer this project has ever had for the ZOOMING
enqueue family. `src/spritequeue.js` says so in its own words -- *"NO SCENARIO
IN THE CORPUS REACHES THIS ROUTINE AT ALL -- wave 11 has no producer for it"* --
and being unreached is why **it carried a defect nobody could see**:

```
[M] $23DA16 / $23DBFE   lsl.w #$2,D0        after `moveq #$3E / and.b ($E,A6),D0`
    byte offset into a FOUR-byte table = (hi & $3E) * 4
    ENTRY INDEX          = hi & $3E  = width*2 = pixels/8
    the port computed      (hi & $3E) >> 1 = width = pixels/16
```

The block comment above the function had it right ("entry index = width\*2");
the code halved it. `[M]` On `$82`'s own `($E,A6) = $0C58` the two readings are
12 and 6, i.e. **a 3-pixel error on the long axis of a 96x88 sprite**. Fixed,
and `tests/w81art.test.js W81/10` is red alone under the old line.

`[M]` The family also has **five members feeding five different buckets** -- the
`lea <buf>.l,A0 / adda.w <ctr>.l,A0` at +$3C -- and `$23DBCA`'s pair is
`$807450`/`$80AFC8` = **bucket 7**, which is where `[cited: W75 §4.1]` measured
all 155 of `$82`'s board slot-frames. `resolveZoomStub` reads it out of the
cartridge, and it checks the `41FA <disp>` resolves to `$23E54A` so a routine
that merely opens with the same four opcodes cannot pass as a member.

### 1.5 A defect of my own, and the instrument that could not see it

`[M]` I added a `bucket` parameter to `enqueueZoomedRequest`'s signature and did
not use it in the body. **`tools/w80emitgate.mjs` stayed GREEN at 57/57 for the
whole time it was there**, because a record in the wrong bucket still reaches
`$800000` -- it is at the wrong DEPTH, and nothing in this repo compares depth.
`tests/w81art.test.js` W81/5, /6, /7 and /10 caught it, and the mutation is kept
in that file's header because it is the honest limit of the emission gate.

### 1.6 `($16,A5)` is a BYTE for `$82` too

`[cited: W80 §1.2]` found the port writing `setU16(a5 + R.onScreen, 1)` where the
ROM has `move.b`, fixed it for `$05`/`$07`/`$27`, and filed `$82`'s "with its
wave". `[M]` `$2747D4` is `4A2D 0016` (`tst.b`) and `$2747E2` is
`1B7C 0001 0016` (`move.b #$1`), so the port was writing `($17,A5)=1` on every
live fighter. Fixed. `[M]` Type `$10`'s `$268268`/`$268276` really **are**
`tst.w`/`move.w`, so this is not one shape pasted onto the other, and `$10` is
left alone.

---

## 2. WHAT SHIPPED

### 2.1 The art (`tools/export-web.mjs`, no `src/` change)

```
[M] 14 type10   90 streams  mask  4322 + col 48712 = 51.8 KiB  [deferred]
[M] 15 type82    2 streams  mask   392 + col  2313 =  2.6 KiB  [deferred]
[M] 16 type88   37 streams  mask  1223 + col 12997 = 13.9 KiB  [deferred]
```

Four `HARVEST` rows (`$268594` 64, `$268694` 32, `$272D7A` 32, `$2763D8` 4) and
three `W81_IMMEDIATES` (`$1735FC`, `$173810`, `$17D480`). Every extent is pinned
by the handler's own index arithmetic and re-checked against the cartridge by
`checkTableExtent` on every build; every immediate goes through `romExtent`,
which throws unless the address is a real stream start in the mask ROM's chain.

**`$272DFA` IS DELIBERATELY NOT HARVESTED** and `web-spr-shards.test.js` asserts
its absence: it is the `$151E10` family already in shard 11, and harvesting it
again would ship 32 duplicate streams.

`SPR_ORDER` puts 14, 16, 15 between the spark and shard 1, and the clock is the
BOARD's: `[cited: W75 §3]` type `$10` is on screen from lf2,200 and `[M]` type
`$88` from lf2,500 -- both ahead of shard 1's `[cited: W47]` +7.7 s -- and type
`$82` not until lf3,825, which is 30 s of slack on 2.6 KiB.

### 2.2 One ROM window (`tools/export-tables.py`)

`[M]` `$268494`, type `$10`'s own 32-entry muzzle table, read at `$268474`.
**It is FOUR bytes an entry where type `$11`'s `$268B1E` is EIGHT**, over the
same index. Without the window the port threw `Unreached $2684DC` on one rung of
`stage1-laser-hold` the moment `$10`'s fan was wired, which is the guard working.

### 2.3 The emission (`src/handlers.js`, `src/spritequeue.js`)

* **`$2682F8..$268490`** ported in full for type `$10`. It is `fire11`'s machine
  with different constants (§1.2), and every helper it needs already existed:
  `enqueueThroughStub`, `enqueueRegistersThroughStub`, `aim64FromCaller`
  (`$24200A`), `slew64` (`$242190`), `fireGate267FC6` (`$267FC6`) and
  `fireBullet` (`$281402`).
* **`$274858..$274AEE`** ported for type `$82` down to its three enqueues, its
  heading block and its two cooldowns. **The two BULLET arms stay counted
  notes** (`$27487A..$2749B2`, the `$281708` x4 / `$281764` x2 fans, and
  `$274A9C..$274AEE`, the `$281484` fan) because they are W21/W26/W27's subject
  and every arm of them falls into the draw at `$274A22`. `$274AF0`, the death
  arm, is unchanged: **a `$82` still cannot die.**
* `resolveZoomStub` / `enqueueZoomedThroughStub`, and the `SCALE_TABLE` index
  fix of §1.4.
* `$2749CE..$2749EA` is `$24270A` inlined, and the port now calls
  `targetSelect` **before** building `AimTables`, in the cartridge's own order,
  rather than through `aim64FromCaller`.

---

## 3. THE RESULT, BEFORE AND AFTER

`[M]` Measured by swapping `src/handlers.js` and `src/spritequeue.js` for
`git show HEAD:` and back -- same ladder, same gate, same command, same bundle.

**`stage1-laser-hold`, 29 of 210 rungs:**

```
        BEFORE                                    AFTER
type  board-DRAWN  port-DRAWN  port-art     port-DRAWN  port-art
$82        57           0        0/57   ->       57       57/57
$10        27           0        2/27   ->       27       27/27
$88         3           3        0/3    ->        3        3/3
$11       189         189      189/189  ->      189     189/189   (unchanged)
$07        24          24       24/24   ->       24       24/24    (unchanged)
$27         3           3        3/3    ->        3        3/3     (unchanged)
$05         2           2        2/2    ->        2        2/2     (unchanged)
```

**`stage1-play`, 27 of 72:** `$82` 0 → 30 of 30, `$10` 0 → 53 of 53, `$88` 12/12
with art 0 → 12. **`stage1-sweep`:** `$82` 31/31, `$10` 49/49, `$88` 12/12,
`$11` 206/206. **Nothing else moved** on any ladder.

### 3.1 WHY THIS IS 57 AND NOT THE BRIEF'S 155

`[M]` The brief's targets (`$82` 155/155, `$10` 265/265) are the BOARD's totals
over **all 210 rungs**, and the port can only step **29** of them. Run with
`--break no-emit` the gate compares all 210 (nothing throws, because nothing
runs) and prints exactly those numbers:

```
[M] --break no-emit    $82 board 155 / port 0     $10 board 265 / port 0
                       $88 board  14 / port 0
```

`[cited: W75 §5.1, W80 §2.3]` The 181 blocked rungs are the LASER's own
impact-spark descriptor list `$28A520..$28A5A0` -- a declared deferral in
`src/spark.js` -- plus the `$262xxx` background-element sites and the `$295xxx`
boss family. **None of them is this wave's and none of them moved.** 57 of 57
and 27 of 27 on the rungs the port can step is the whole of what this instrument
can say, and saying 155 would be quoting the board's number as the port's.

---

## 4. THE TESTS, AND THE THREE RUNS THEY WERE WATCHED THROUGH

`games/ddpdoj/tests/w81art.test.js`, eleven tests.

```
[M] src/handlers.js at HEAD                      9 of 11 RED
      (1..8 on an empty bucket counter or an unwritten table entry;
       W81/8 on the word write. 9 and 10 stay green -- they are about
       src/spritequeue.js, which HEAD's handlers never reach.)
[M] MUTATION SCALE_TABLE[(widthByte & $3E) >> 1]  W81/10 RED ALONE
      -- the line as it stood in this repo until today (§1.4)
[M] MUTATION const b = BUCKETS[0] in the zoomed enqueue
                                                  W81/5 /6 /7 /10 RED
      -- the defect I actually shipped, and the emit gate was GREEN
         57/57 the entire time it was there (§1.5)
```

`W81/4` is the one that says `$267FC6` is REACHED and not stood in for: the
fixture answers `$2680A2[0]` with `$8000` (the gate blocks, the mech draws and
does not fire) and `$2680A2[1]` with 0 (the gate passes and the machine walks on
into the second aim, which a synthetic ROM cannot answer). **One word of RAM,
`$813092`, decides which, and it is read out of RAM.**

`W81/7b` is the only test here that needs the cartridge: `aim64` is a real
computation over five real tables, so the aim tables come from
`player.tables.json` and **only `$272DFA` is answered with a marker** -- which is
what makes "byte offset = (facing & `$3E`) * 2" a number instead of a
coincidence with the real art.

**Two existing tests were INVERTED, and the inversion is the finding:**

* `tests/web-spr-shards.test.js` -- *"`$268594` is NAMED as not harvested"*,
  which asserted `0x268594` appears in NO executable line of the exporter. It is
  now *"`$268594` is TWO tables, 64 + 32, and both are harvested"*, and it
  requires `manifest.notHarvested` to SAY the deferral closed rather than going
  quietly empty.
* `tests/w52weapons.test.js` -- the literal `SPR_ORDER` array. It now also
  asserts the ORDERING CONSTRAINT (every shard whose first need precedes shard
  1's must be fetched before it), which the literal cannot say on its own.

**Two edits to `tests/handlers.test.js`'s FIXTURE, both the fixture speaking:**
`$23DBCA`'s twelve operand words transcribed out of `maincpu.bin`, and
`($26,A5)` set non-zero so `$82`'s heading cadence does not borrow -- the same
device the file already used at `($18,A5)=2` and `$803910`, and commented as
such. Neither weakens an assertion.

---

## 5. **THE PAGE, OPENED, AND WHAT I SAW**

`[M]` `python -m http.server 8781` over the working tree, Chrome (the real
`C:\Program Files\Google\Chrome\Application\chrome.exe`, driven by the
`playwright` package that was already installed -- nothing was downloaded),
`http://127.0.0.1:8781/games/ddpdoj/index.html`, fire held and Down held: the
owner's own "park at the bottom and shoot" input.

```
[M] 47 samples, lf2341 .. lf8133, shards 8/8 and spr 17/17 on EVERY one
[M] enemy types on screen: $5 $7 $8 $9 $B $D $E $10 $11 $1C $20 $21 $24
                           $27 $31 $80 $82 $85 $88 $89 $8A $8B
[M] $1735FC   105 display-list records      first at lf3867
[M] $173810    49 records
[M] $16C7B4..$171070 (the mech)  184 records
[M] type $88's three families     40 records
[M] "NO ART" named $1735FC / $173810 / $17D480 on ZERO samples
[M] PAGE ERRORS: one 404, and it is the favicon
```

`[M]` **AND I CROPPED THE CANVAS AT THE RECORDS' OWN COORDINATES**, not by eye:
the port's own `$800000` entry gives `long`, `short`, `size` and `pal`, and the
crop is `x = short`, `y = 447 - long`. At lf~4,100 three `$82` records read
`size 3160 ($0C58) pal 12`, `long 495/342/291`, and the crop around (76, 105) is
**a blue-and-white forward-swept-wing fighter with white nacelles and orange
trim** -- the object `[cited: W75 §3.1]` photographed off the board's own
framebuffer. The mech's crop at (94, 237) is **a gold armoured walker with grey
and green trim, standing on the road**.

`[M]` Independently, and because a screenshot can be argued with: all five
streams rendered STANDALONE through the page's own `SpriteDrawer` over the
shipped bundle and the shipped palette give the fighter (96x88, 3,784 lit
pixels, 31 distinct pens), the mech (64x48), type `$88`'s body (96x96) and the
already-shipped type `$11` hull as recognisable, correctly coloured pictures.

**WHAT I GOT WRONG FIRST, AND IT IS WORTH RECORDING.** My first crop was chosen
by eye and landed on a **black aircraft-shaped silhouette**, and I spent a
detour deciding the palette was broken. It was not: the sprite palette bank 12
is fully populated in the shipped capture (31 of 32 non-zero, `ffff fbde ef7c
…`) and the standalone render is correct. Cropping by eye on a screen that still
has `[cited: W68 §5]`'s missing bucket-2/3 background art on it is how you
diagnose the wrong subsystem. **Crop at the record's coordinates.**

---

## 6. **THE BAR -- WHICH CONDITIONS I MET**

**Condition 1, FEATURE COMPLETE: MET for these three types, and I opened the
page.** `[M]` The owner's test for this wave was *"reach lf3,825+ and SEE the
fighter"*. I loaded the page in Chrome, reached lf3,867, and the fighter is
there, in colour, at the coordinates the port's own display list gives -- and
the mech and the twin turret are there too. §5.

**It is NOT the whole of `39-OWNER`'s condition 1** and must not be read as
such: the capture ledger is not empty, `capture.bin` is still shipped, the HUD
on screen is still the recording's, and the black terrain is untouched.

**Condition 2, ORACLES PERFECTLY: MET for the three types, with the comparison
shown capable of failing three ways.** `[M]` `$82` 57/57, `$10` 27/27, `$88` 3/3
against the board's own display list on `stage1-laser-hold`, reproduced on
`stage1-play` (30/30, 53/53, 12/12) and `stage1-sweep` (31/31, 49/49, 12/12);
`--break no-emit` RED, `--break count-board-twice` and `--break live-not-drawn`
each flipping the honest answer GREEN; and the before/after measured by swapping
the files.

**WHAT THE ORACLE DOES NOT COMPARE, stated because §1.5 is what happens when it
is not:** the emission gate compares COUNTS PER TYPE, never positions and
**never the BUCKET**. A record in the wrong bucket is at the wrong depth and
this gate is green on it. `tests/w81art.test.js` covers the bucket; nothing in
this repo compares an enemy sprite's PIXELS against the board's.

---

## 7. **OWNER DECISION REQUIRED -- `build-dist.mjs` REFUSES, AND I DID NOT TOUCH IT**

`[M]` `node tools/build-dist.mjs`:

```
REFUSING TO BUILD: dist/ contains verbatim cartridge data.
  games/ddpdoj/assets/spr/col.shard15.u16.gz  (3268 B, decompressed,
  verbatim inside games/ddpdoj/rip/rom/cave_a04401w064.u7)
```

`[M]` **It is exactly one file of the six this wave adds.** `mask.shard14`,
`col.shard14`, `mask.shard15`, `mask.shard16` and `col.shard16` all pass; only
type `$82`'s colour half is a contiguous slice, and for the reason the W47 block
in `build-dist.mjs` already gives: **the property this guard tests is PACKING
ORDER, not provenance.** Shard 15 holds TWO streams whose colour data happens to
be adjacent in `cave_a04401w064.u7`, so the packed buffer is one run. Shard 14's
90 streams and shard 16's 37 have holes in them and stitch into something that
matches nothing.

**Against the four answers `build-dist.mjs` itself offers:**

* **an INTERMEDIATE?** No. `src/web/assets.js SprShards` fetches it; §5 measured
  `spr 17/17` on the live page and 105 records drawn out of it.
* **a COPY that should be a TRANSLATION?** This is the real alternative and it
  is the same wave the four existing lines are waiting on: decode the colour
  half one 5-bit pixel per byte. `[cited: W41 §2.2]` raw +50 %, gzipped -9.7 %,
  and it changes `SpriteDrawer`'s inner loop, which is on `bundlegate`'s and
  `pixgate`'s 100.0000 % pixel path. It would retire all five lines at once.
* **a SUBSTITUTE?** A drawn replacement for a 96x88 fighter is a different game.
* **the fourth answer** -- a sixth `PUBLISH_VERBATIM` entry, which is the same
  standing decision `[cited: HANDOVER §8.1]` already applied to five files.

**I HAVE NOT ADDED IT.** The brief is explicit that this is the owner's call and
not the implementer's, and I have not weakened the guard, `publish.mjs` or
`bundlegate`. **The consequence, stated plainly: `tools/build-dist.mjs` and
therefore `tools/publish.mjs` are RED until the owner decides, so this wave
cannot be deployed to the live site**, even though everything else about it is
green. The one-line diff, if the owner wants it, is:

```js
['games/ddpdoj/assets/spr/col.shard15.u16.gz',
 'enemy type $82\'s body $1735FC and its bucket-3 record $173810 (2 streams, '
 + '2.6 KiB). Fetched by src/web/assets.js SprShards; without it the 96x88 '
 + 'fighter is a named skip. Verbatim only because those two streams are '
 + 'consecutive in the ROM -- see the W47 block above.'],
```

---

## 8. THE MEASUREMENTS, ALL OF THEM

```
[M] node --test games/ddpdoj/tests/     973 pass, 0 fail, 0 skipped
                                        (961 before; +11 w81art.test.js,
                                         +1 web-spr-shards, 2 inverted)
[M] node tools/w80emitgate.mjs          $82 57/57, $10 27/27, $88 3/3
                                        --break no-emit RED; the other two
                                        flip the honest answer GREEN
[M] node tools/seedcmp.mjs fly-around   8 segments, 8 GREEN, 0 red
[M] node tools/seedcmp.mjs stage1-play  1 green / 25 red / 45 blocked
                                        -- IDENTICAL to W80 §8's figure
[M] python pgm.py dlgate --reuse        1901 frames, 0 DIVERGENT
[M] node tools/pixgate.mjs              PASS 13647872/13647872 = 100.0000%
[M] python tools/gfxgate.py             PASS 1605632/1605632 = 100.0000%
[M] node tools/bundlegate.mjs           PASS 15955968/15955968 = 100.0000%
[M] node tools/webgate.mjs              9 FAIL, and 9 FAIL AT HEAD TOO --
                                        the SAME nine, with the same NO ART
                                        addresses ($17253C $172560 $172584
                                        $172344 …), counts moved because the
                                        port now emits more records
[M] node tools/build-dist.mjs           REFUSES -- §7, and it is right to
```

**BUNDLE SIZE.** `[M]`

```
              streams  spr shards   TOTAL        BOOT        DEFERRED
  before        1,969      14     2,079.8 KiB   490.0 KiB   1,589.8 KiB
  after         2,098      17     2,149.7 KiB   491.6 KiB   1,658.1 KiB
  delta          +129      +3       +69.9        +1.6         +68.3
```

`[M]` **All 68.3 KiB of art is DEFERRED; boot grows 1.6 KiB and not one byte of
it is a picture.** It is `manifest.json` (11,197 → 12,523 B, served
UNCOMPRESSED, so every character of the three new `why` strings and four new
harvest rows is a boot byte) plus `spr/streams.u32.gz` (1,151 → 1,219 B for 129
more streams). What the page waits for is unchanged: shard 0 and BG shards 0-1.
The three new shards are queued from boot and promoted by `demand()` the moment
a record asks; `[M]` on the live page they were all in before lf3,867 and the
fighter never once read as `SPR SHARD 15`.

`[M]` `webgate`'s W44 line records the schedule working:
`1028 skipped as IN FLIGHT from step 59 on shard(s) 7+3+14` -- shard 14, the
mech's 51.8 KiB, is named rather than drawn black while it is in flight, which
is the "named, never black" contract behaving exactly as it does for shards 3
and 7.

`[M]` `pgm.py check --reuse` was run and its one failure -- *"segment sweep: the
port re-seeded from the board at every rung"* -- is `seedcmp`'s red segments,
which are byte-identical to W80's and which `[cited: W79]` already filed as not
that wave's either. `fly-around` is GREEN inside it.

---

## 9. WHAT I COULD NOT DETERMINE, AND WHAT IS STILL WRONG

1. **The black terrain is untouched.** `[cited: W68 §5.2]` bucket 2's five
   streams and bucket 3's 42, and `[cited: W75 §3.4]` type `$8B`'s lattice,
   whose picture is a background ELEMENT. `[M]` The live page still names
   `$231520 $232578 $231C44 $232EAC $233630 $17253C $172344 $1725CC …` as NO
   ART on most samples past lf5,500. **That is half the owner's original
   complaint and this wave does not close it.**
2. **A `$82` still cannot die.** `$274AF0` is unchanged, and `[cited: W68 §9]`
   signal 5 -- "no splosions" -- stands for this type. Its two bullet arms are
   still counted notes, so a fighter that is now visible still fires nothing.
3. **Whether these three look RIGHT, pixel for pixel.** §5 is a screenshot
   cropped at the record's own coordinates and a standalone render; neither
   compares the port's pixels against the board's for an enemy sprite, and
   nothing in this repo does.
4. **The other 181 rungs of `stage1-laser-hold` and 45 of `stage1-play`.** §3.1.
   The blockers are unchanged and they are what caps this gate's coverage.
5. **Type `$10`'s and `$82`'s bullets.** `$281402` for `$10` is wired and
   `[M]` its fan fires; nothing here measures the bullets against the board.
6. **Whether `$88`'s two barrels index `$272D7A` correctly at run time.** `[M]`
   40 records of its three families drew on the live page, and `src/initbody.js`
   has read that table since W36; I did not write a test for the index because
   the handler I would test is not this wave's.
7. **`col.shard15`.** §7. Blocked on the owner, not on me.

---

## LOG (appended as findings arrived)

- opened. Read W80, W75, W68, W41, W39. Disassembled `$2747C6..$274B64`,
  `$268232..$268490` and `$267FC6..$2680A0` before writing a line.
- `[M]` §1.1: **`$82`'s art is TWO streams, not 57.** Its heading table
  `$272DFA` is the `$151E10` family shard 11 has shipped since W58.
- `[M]` §1.2: **`$268594` is TWO tables, 64 + 32**, type `$11`'s hull/turret
  pair exactly, and the "96 entries" everyone quoted is their sum.
- `[M]` §0: **`$267FC6` HAS BEEN PORTED SINCE W30.** W80's "second unported
  routine nobody has costed" costs zero lines.
- `[M]` §1.3: **`$88` needs 37 streams**, and `$272D7A`'s run of 160 walks
  through two other types' tables -- the index sizes it, not the run.
- `[M]` §1.4: **a defect in `enqueueZoomedRequest`**, alive since W11 because
  nothing ever reached it. `lsl.w #2` makes the entry `hi & $3E`; the port
  halved it. `$274A28` is its first producer.
- `[M]` §2.2: the port threw `Unreached $2684DC` the moment `$10`'s fan was
  wired -- `$268494`, its own muzzle table, had no ROM window. FOUR bytes an
  entry where `$11`'s is eight.
- `[M]` §1.5: **I shipped a bucket defect and `w80emitgate` was GREEN 57/57 on
  it.** A record in the wrong bucket still reaches `$800000`. Four tests catch
  it; no gate in this repo does.
- `[M]` §3: `$82` 0→57/57, `$10` 0→27/27, `$88` art 0→3/3, measured by swapping
  the files. Nothing else moved on three ladders.
- `[M]` §5: **THE PAGE, IN CHROME.** 105 records of `$1735FC` and 184 of the
  mech's family over lf2,341..8,133, `spr 17/17`, `NO ART` never naming either.
  Cropped at the record's own coordinates: the fighter and the mech, in colour.
- `[M]` §5: and my FIRST crop, chosen by eye, was a black silhouette that sent
  me hunting a palette bug that was not there.
- `[M]` §7: **`build-dist.mjs` REFUSES** -- `col.shard15` is a verbatim slice of
  `cave_a04401w064.u7`. Written up, NOT added. The site cannot be republished
  until the owner decides.
- `[M]` §8: 973 tests, 0 fail. dlgate 0 divergent, pixgate / gfxgate /
  bundlegate 100.0000 %. Bundle 2,079.8 → 2,149.7 KiB, boot +1.6 KiB and not
  one byte of it a picture.

status: **DONE**
