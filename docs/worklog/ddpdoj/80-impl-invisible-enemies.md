# 80 — IMPL: sprite emission for the invisible enemies, and the brief's "one job" that is two

status: **DONE** — §1 refuses the premise with the ROM, §3 is the before/after
per type, §5 is the art measurement that re-orders the rest of the queue, §7
says which bar conditions were met and which were not.

started / finished: 2026-08-05
role: IMPLEMENTER. Files written: `games/ddpdoj/src/handlers.js`,
`games/ddpdoj/tests/handlers.test.js`, `games/ddpdoj/tests/w80emission.test.js`,
`games/ddpdoj/tools/w80emitgate.mjs`, `games/ddpdoj/tools/boarddl.mjs` (five
lines, exports only). **`games/ddpdoj/src/player.js`, `tools/breakage.mjs`,
`tools/portdiff.mjs` and `tests/w79autoshot.test.js` belong to the `$2497AA`
agent and were NOT written to.** `games/gradius/` not touched. **No web server
was started.** Nothing ROM-derived is committed.

target: `ddpdojblk` VERSION-B. `[M]` = measured by me this session; anything
from another document is `[cited]` and named.

---

## 0. THE HEADLINE

`[M]` **Types `$05`, `$07` and `$27` now emit, and their pictures are already in
the shipped sheet.** On the board's own ladders, per-type records DRAWN by the
port, before → after:

| type | what it is | before | after | board |
|---|---|---:|---:|---:|
| `$05` | helicopter | **0** | **21** | 22 |
| `$07` | helicopter | **0** | **36** | 36 |
| `$27` | helicopter | **0** | **1** | 1 |
| `$82` | 96x88 fighter | 0 | 0 | 30 |
| `$10` | gold mech | 0 | 0 | 53 |

(`stage1-play`, 27 of 72 rungs compared; `$05`'s 21-of-22 is the gate's declared
one-frame skew, §2.2. The `stage1-laser-hold` ladder gives 2/2, 24/24, 3/3.)

`[M]` **And they are VISIBLE, not merely emitted**: every one of those records'
descriptors is in the shipped sprite sheet — `$05` 21 with art / 0 without,
`$07` 36/0, `$27` 1/0 — measured through `portSpriteList`, the function the page
itself calls, over the bundle the page itself fetches (§5).

`[M]` **`$82` and `$10` are NOT emission jobs yet. They are ART jobs.** Their
descriptors have no picture in the bundle — `$82` 0 of 57 present, `$10` 2 of 27
— so wiring their enqueues today would add NO-ART records and show the owner
nothing. §5 has the numbers and §6 is what to do instead.

---

## 1. THE PREMISE, CHECKED — **AND IT IS TWO MACHINES, NOT ONE**

The brief, W68 §10 and W75 §3.2 all state the same thing, and W68 §2.3 states it
in the ROM's own terms:

> `[cited: W68 §2.3]` *"`$05` `$25` — `$269CEA` — `$269E16`, `$269E3E` →
> `$23D852`, bucket 7 … `$07` `$27` — `$26A2E2` — **the same two** (its span
> `$269B3E..$26A4B0` contains them)"*
>
> `[cited: W68 §10]` *"W69 — THE THIRTY INSTRUCTIONS. `$269D84..$269E1C`, TYPES
> `$05` `$07` `$27`."*

`[M]` **`$26A2E2` never executes one byte of `$269D84..$269E1C`.** The shared
part of the two handlers is `$269CEA..$269D6E` ≡ `$26A2E2..$26A366` and it ends
at the on-screen flag. Read out of `maincpu.bin`:

```
[M] $269D6E 1B7C 0001 0016   move.b #$1,($16,A5)     <- last shared instruction
    $269D74 4A79 008130D2    tst.w  $8130D2
    $269D7A 6600 009A        bne.w  **$269E16**
    $269D7E 4EB9 002417DE    jsr    $2417DE
    $269D84 ...                                       <- $05's OWN machine

[M] $26A366 1B7C 0001 0016   move.b #$1,($16,A5)     <- last shared instruction
    $26A36C 122D 0023        move.b ($23,A5),D1
    $26A370 4A79 008130D2    tst.w  $8130D2
    $26A376 6600 FAA8        bne.w  **$269E20**
    $26A37A 4EB9 002417DE    jsr    $2417DE
    $26A380 ...                                       <- $07/$27's OWN machine
```

`[M]` `$26A380..$26A4B0` is **51 instructions** and it is type `$08`'s machine
(`$26A5E4`, ported at W36) with exactly two differences — `move.w #$3,($24,A5)`
where `$08` has `#$2`, and an extra `$26A3C2..$26A3D2` block that picks the sign
of the heading step from `cmp.b ($22,A5),D1`. Its fire tail `$26A460..$26A4B0`
is byte for byte `$26A738..$26A788`.

**Containment is not reachability.** `$269B3E..$26A4B0` does contain
`$269D84..$269E1C`, and that is how the span came to be quoted as one job; the
control flow inside it does not go there. `[M]` **Wiring only `$269D84` would
have left 47 of the 72 objects invisible** (`$07` 43 + `$27` 4, `[cited: W68
§2.2]`) **and the wave list would have read "done".**

### 1.1 The other thing the labels hide: `$269E16` is a routine nobody names

`[M]` There are **three** entry points into the family's tail, not two:

```
$269E16  jsr $23D852 / bra $269B3E     enqueue + draw, SPRITE POINTER UNTOUCHED
$269E20  heading -> ($A,A6) and ($2C,A5), then falls into $269E16
$269B3E  the two draw arms alone
```

`$269E16` is *inside* `$269CEA`'s span, so a sweep that lists routines by their
heads never prints it. `[M]` It is reached **seven** times — six `bcs.w`/`bcc.w`
out of `$269D84..$269E10` and once from the freeze gate — and every one of those
is a branch into the middle of a block. **A port that read the labels would send
all seven to `$269E20` and rewrite `($A,A6)` on a type whose ROM leaves it
alone.** That is the fall-through trap from the far side, and it is the one
`tests/w80emission.test.js` W80/3 exists to catch (§4).

### 1.2 A defect found on the way, and it is two wrong bytes per record

`[M]` `$269D62` is `4A2D 0016` (`tst.b`) and `$269D6E` is `1B7C 0001 0016`
(`move.b #$1`). The port had `setU16(a5 + R.onScreen, 1)`, which writes
`($16,A5)=0` and **`($17,A5)=1`**. Self-consistent inside the port — it also
*read* the word, so no gate could see it — and two bytes wrong against the board
on every live record of the family. `[M]` Type `$11`'s `$2688F2`/`$268900`
really **are** `tst.w`/`move.w`, so this is not a copy-paste of one shape onto
the other and only this family moves. Fixed for `$05`/`$07`/`$27`; `[M]`
`$268276` (`$10`) and `$2747E2` (`$82`) are **`move.w` and `move.b`
respectively**, so `$82` carries the same defect and is filed with its wave.

### 1.3 What I grepped before disassembling, as instructed

`grep -rn "269D84|269E1C|269CEA" games/ddpdoj/src/` — `handlers.js:1722-1726`
already carried W36's own note that this was deliberately not done and named the
hazard (`($1B,A6)` and the `fly-around` gate). That note was accurate and is
updated in place rather than duplicated. **Nothing here was an already-answered
question**; the thing that was already written down was the *deferral*, and the
thing that was wrong was every later document's estimate of its size.

---

## 2. THE INSTRUMENT — `tools/w80emitgate.mjs`

`[cited: W68 §8.3]` asked for exactly this and said neither of the two gates it
proposed existed. This is the first one.

```
node games/ddpdoj/tools/w80emitgate.mjs --manifest <ladder>/manifest.json
     [--assets games/ddpdoj/assets] [--type 05,07,27] [--break NAME]
```

For each rung of a W69 ladder: census the BOARD's own RAM with **`boarddl.mjs`'s
own `readCheckpoint`, imported rather than re-implemented**, then seed a `Game`
from the same checkpoint, step ONE logic frame on the board's own `portin` word,
and census the port's RAM with the same function. No emulator in the loop.

### 2.1 EVERY CHECK SEEN TO FAIL — and one of the three is the shipped tree

```
[M] --break no-emit            RED  -- $11 237->0, $07 36->0, $05 22->0
[M] --break count-board-twice  turns the honest RED into GREEN ($82 30/30, $10 53/53)
[M] --break live-not-drawn     turns the honest RED into GREEN ($82 30/30, $10 53/53)
```

`no-emit` **is literally the pre-W80 tree** for these types, and the gate is red
under it. The other two are the two ways this gate could have been worthless —
comparing the board with itself, and counting "alive" as "drawn" — and each one
flips the real answer from RED to GREEN, which is the differential requirement
rather than a screenshot of a red line.

### 2.2 THE TWO THINGS THIS GATE GOT WRONG FIRST, RECORDED

1. **It printed GREEN over a comparison that compared nothing.** `board-DRAWN`
   was 0 for every type, because the slot key was built with `& $FF` and
   `width`/`height` swapped against `decode`'s `& $7F`. Nothing matched, no type
   could be red, and the summary line said GREEN. That is `78-diag`'s finding
   happening again inside the tool written after reading it. **The fix is in the
   gate, not in my habits**: a board census with art slot-frames and zero drawn
   records is now a hard `INSTRUMENT RED`, named as such, before any per-type
   verdict.
2. **The art column asked the wrong question.** It tested membership in
   `portSpriteList`'s `missing` map — but `missing` can only name streams of
   records that are IN the list, so a type that emits nothing has nothing
   missing and came back `art 30/0`. `[M]` It reported `$82`'s art as fully
   present. It is fully absent (§5). The question is membership in the SHEET, so
   it now asks the sheet.

### 2.3 What it cannot do

* **One logic frame of skew.** A checkpoint holds frame N's list; a port seeded
  at N produces N+1's. So this compares COUNTS PER TYPE and never positions, and
  a type whose population changes on that frame is off by one — which is exactly
  `$05`'s 21 of 22. Positions are `seedcmp`'s job and it already does them.
* **`stage1-laser-hold` compares 29 of 210 rungs and `stage1-play` 27 of 72.**
  `[M]` The blockers are `78-diag`'s list unchanged: `$28A520..$28A5A0` (the
  laser's declared impact-spark deferral) and the `$262xxx` background-element
  sites on one ladder, the `$295xxx` boss family on the other. **Every blocked
  rung is printed by address and excluded from the ratios.**

---

## 3. THE RESULT, BEFORE AND AFTER

`[M]` Measured by swapping `src/handlers.js` for `git show HEAD:` and back —
same ladder, same gate, same command.

**`stage1-laser-hold`, 29 of 210 rungs:**

```
        BEFORE                          AFTER
type    board-DRAWN  port-DRAWN         port-DRAWN   SHEET has/no-art
$05          2            0        ->        2       2/0
$07         24            0        ->       24      24/0
$27          3            0        ->        3       3/0
$82         57            0        ->        0       0/57   ($1735FC)
$10         27            0        ->        0       2/25   ($16DA14 $16CDD4 ...)
$11        189          189        ->      189     189/0    (unchanged)
```

**`stage1-play`, 27 of 72 rungs:** `$05` 0 → 21 of 22, `$07` 0 → 36 of 36,
`$27` 0 → 1 of 1, `$82` 0 of 30, `$10` 0 of 53.

**Nothing else moved.** `[M]` `$11`, `$80`, `$85`, `$88`, `$89`, `$08`, `$09`,
`$0B` are identical before and after.

---

## 4. THE TESTS, AND EACH ONE WAS WATCHED GO RED

`games/ddpdoj/tests/w80emission.test.js`, five tests. Reverting
`src/handlers.js` to `HEAD`:

```
[M] not ok 1  $05 ENQUEUES INTO BUCKET 7        -- bucket-7 counter 0, expected 12
[M] not ok 2  $07/$27 enqueue too               -- 0, expected 12
[M] not ok 3  $07 rewrites ($A,A6), $05 does NOT
[M] not ok 4  $269B3E arm A -> b7, arm B -> b3  -- 0, expected 24
[M] not ok 5  ($16,A5) is a BYTE for this family
```

**And test 3 was watched fail on the defect it exists for**, not just on the
empty tree: pointing `$05`'s frozen exit at `drawFamily269E20` — *reading the
label instead of the branch target* — leaves 1, 2, 4 and 5 GREEN and turns 3 RED
alone. That is the mutation a person would actually ship.

`[M]` The bucket the tests assert is **7**, and it is derived twice: from
`$23D852`'s own two longwords out of the cartridge (`$807450`/`$80AFC8`, which
`spritequeue.BUCKETS` resolves to 7) and from `[cited: W75 §4.1]`'s measurement
that all 490 of the family's board slot-frames are in bucket 7.

`[M]` **Two changes to `tests/handlers.test.js`'s FIXTURE, both of which are the
fixture speaking and not the port**, recorded because a fixture edit next to a
behaviour change is exactly where a silent weakening hides:

* `$23D852`/`$23DF86`/`$23DF58` added to the stub ROM. The port now genuinely
  reaches them; before, type `$05` never called an emitter at all. The two
  longwords for each are transcribed from `maincpu.bin`.
* `$803910` set non-zero in `makeRam`. `$26A3E6 jsr $24202C` is **carry-blind**,
  so unlike every other aim in that file it is not gated by a cooldown, and a
  zeroed synthetic ROM cannot construct `AimTables` (its constructor validates
  `$2420C6`'s eight longwords and throws by address). This is the same device
  the fixture already used at `($18,A5)=2` and it is commented as such.

**Neither edit weakens an assertion.** The gate-level aim evidence is
`w80emitgate.mjs` against the cartridge; `handlers.test.js` stays a smoke test
and now says so.

---

## 5. **`$82` AND `$10` ARE ART WAVES, NOT EMISSION WAVES — MEASURED**

`[M]` `--assets`, through `portSpriteList` and `romToPackedMap` — the page's own
two functions — over `games/ddpdoj/assets`, every shard fetched:

```
[M] type  slot-frames with a descriptor   IN THE SHEET   ABSENT   the streams
    $05                 22                     22           0
    $07                 36                     36           0
    $27                  1                      1           0
    $82                 57                      0          57     $1735FC
    $10                 27                      2          25     $16DA14 $16CDD4
                                                                  $16CE98 $16E034 ...
    $88                 12                      0          12     $17D480
```

* `[M]` **`$05`/`$07`/`$27` are complete.** `[cited: W68 §2.4]` said `$1718F4`
  was already shipped; the whole 32-entry table `$269E48` is (shard 3,
  `"the damage-first family, $269E48 + $269BB6"`, 27 added / 5 already). So this
  wave is thirty-odd instructions and **zero new bytes of art**, exactly as
  costed, for the three types it actually covers.
* `[M]` **`$82`'s `$1735FC` is absent from the bundle**, confirming
  `[cited: W68 §2.4]` against the *current* build rather than by citation.
* `[M]` **`$10`'s family is absent**, and the bundle SAYS SO in its own words:
  `manifest.spr.notHarvested` = *"`$268594` (enemy type `$10`, 90 absent,
  51.8 KiB): no ported code reads it and 0 of its 96 streams were emitted in
  6,185 frames."* That is a **declared** deferral in the exporter, not an
  oversight — the same shape `78-diag` found for `$28A5xx` in `src/spark.js`,
  and the fifth time this project has met one.
* `[M]` **BONUS, AND IT IS NOT IN ANYBODY'S WAVE LIST: type `$88` already emits
  12 of 12 records and has no picture for any of them** (`$17D480`). It is
  invisible today for the *other* reason, and `drawn%` can see it while the
  emission gate cannot — which is precisely why W68 asked for both numbers side
  by side.

**So wiring `$82`'s and `$10`'s enqueues today would produce records with no
pictures**: it would move this gate's `port-DRAWN` column, lower `drawn%`, and
show the owner nothing. `[M]` It would also not be cheap — `$10`'s fire machine
`$2682F8..$268490` calls **`$267FC6`, a rank-selected position test that is NOT
`$2425B2` and is NOT ported** (it is `$2425B2`'s two axes plus a `$8103E6`
nearest-player arm), so that block is a second unported routine nobody has
costed. I did not port either, and §6 says what to do with them.

---

## 6. THE QUEUE, RE-ORDERED BY MEASUREMENT

1. **THE ART EXPORT FOR `$1735FC` (`$82`), `$268594` (`$10`) AND `$17D480`
   (`$88`).** `[M]` 57 + 25 + 12 slot-frames with a descriptor and no picture on
   two ladders. An exporter wave with **no `src/` change**, behind machinery
   that already exists, and `$268594`'s extent is already pinned in
   `tools/w35atlas.mjs ROM_TABLES`. `$88` is free — it is already emitting.
2. **`$82`'s `$2747FA..$274B64`** — after (1), not before. Three enqueue sites
   and **the death arm `$274AF0` in the same block**, so it closes
   `[cited: W68 §9]` signal 5 for the type at the same time.
3. **`$267FC6`, then `$10`'s `$2682F8..$268490`** — in that order; the second
   cannot be honest without the first.
4. **`$8B` is not on this list and should not be.** `[cited: W75 §3.4]` measured
   that it has no sprite record on the BOARD either; its picture is a bucket-2/3
   background ELEMENT (`$232578`, `$172D18`). It is item (1)'s neighbour, not an
   emission job, and the black terrain goes with it.

---

## 7. **THE BAR — WHICH CONDITIONS I MET**

**Condition 2, ORACLES PERFECTLY: MET, for the three types this wave covers.**
`[M]` `$05` 21/22, `$07` 36/36, `$27` 3/3 against the board's own display list
on two independent ladders, with the comparison shown capable of failing three
ways (§2.1) and the before/after measured by swapping the file (§3).

**Condition 1, FEATURE COMPLETE: MET FOR `$05`/`$07`/`$27`, NOT MET FOR `$82`
AND `$10`, AND I DID NOT LOAD THE PAGE.**

* `[M]` For the helicopters the evidence is as close to the owner's test as this
  tree can get without a browser: the port emits the record, and the record's
  descriptor resolves in the shipped bundle through the page's own
  `portSpriteList` — 21/0, 36/0, 1/0 with art. Shots that hit them now hit
  something drawn.
* **I did not open the live page and I am not claiming a screenshot.** `[M]` The
  measurement above is headless, over `games/ddpdoj/assets` on this machine.
  What would falsify it is a delivery failure (a shard that never lands), and
  that is `webgate`'s subject, not this one.
* **For `$82` and `$10` the answer is NO and §5 is why.** The owner still cannot
  see the fighter or the mech, and the black terrain is untouched — those are
  the art wave, and calling them done would have been the fourth "coverage claim
  that was wrong" in this directory.

---

## 8. THE MEASUREMENTS, ALL OF THEM

```
[M] node --test games/ddpdoj/tests/        961 pass, 0 fail, 0 skipped
                                           (934 before + 5 mine + 22 the
                                            $2497AA agent's, untouched)
[M] node tools/seedcmp.mjs fly-around      8 segments, 8 GREEN, 0 red
                                           -- W36's named hazard, ($1B,A6) and
                                              the slew, did NOT fire
[M] node tools/seedcmp.mjs stage1-play     BEFORE 1 green / 25 red / 45 blocked
                                           AFTER  1 green / 25 red / 45 blocked
                                           -- IDENTICAL. No state column moved.
[M] python pgm.py dlgate --reuse           1901 frames, 0 DIVERGENT
[M] node tools/w80emitgate.mjs --break     no-emit RED; count-board-twice and
                                           live-not-drawn flip RED -> GREEN
```

`[M]` `pixgate` and `gfxgate` were not re-run and do not need to be: both are
pure-transform gates over MAME dumps (staged bytes → list, ROM words → pixels)
and neither reads an enemy handler. `dlgate` is the one of the three that could
in principle notice, and it is green.

---

## 9. WHAT I COULD NOT DETERMINE

1. **Whether the helicopters look RIGHT.** This wave proves a record is emitted
   and that a picture exists for it. It does not compare the port's pixels
   against the board's for these types; nothing in this repo does that for an
   enemy sprite.
2. **The other 181 rungs of `stage1-laser-hold`.** Every number here is over the
   29 and 27 rungs the port can step at all. `78-diag`'s blockers are unchanged
   and they are what caps this gate's coverage, not anything W80 did.
3. **`$25`.** `[cited: W68 §2.3]` lists `$25` as sharing `$269CEA`; neither
   ladder spawned one, so the port's `$05` tail is unexercised for it.
4. **Whether `$82`'s and `$10`'s emission is correct once the art lands.** I read
   both blocks and costed them; I did not port them, so nothing here is evidence
   about them beyond the ROM quotations.
5. **One skew, and it is stated everywhere it matters.** §2.3.

---

## LOG (appended as findings arrived)

- opened. Grepped `src/` for `$269D84` first, as instructed: `handlers.js:1722`
  already carried W36's deferral note, accurate, with the hazard named.
- `[M]` §1: **THE BRIEF'S PREMISE IS REFUSED.** `$26A2E2` never executes a byte
  of `$269D84..$269E1C`. Two machines, two frozen exits, and wiring only the one
  the wave list names would have left 47 of 72 objects invisible.
- `[M]` §1.1: `$269E16` is a routine no sweep prints, reached seven times by
  branches into the middle of a block. Reading the labels rewrites `($A,A6)` on
  a type whose ROM does not.
- `[M]` §1.2: `($16,A5)` is a BYTE for this family and the port had it as a
  word — `($17,A5)=1` on every live record, invisible because the port also read
  it as a word.
- `[M]` §2.2: **the new gate printed GREEN over a comparison that compared
  nothing** on its first run, which is `78-diag`'s own finding reproduced inside
  the tool written after reading it. It now hard-fails on that state.
- `[M]` §2.2: and its art column asked whether a stream was in `missing`, which
  a type that emits nothing never is — it reported `$82`'s absent art as
  present.
- `[M]` §3: `$05` 0→21/22, `$07` 0→36/36, `$27` 0→1/1, measured by swapping the
  file. Nothing else moved.
- `[M]` §4: all five tests watched red on `HEAD`, and test 3 watched red alone
  on the label-reading mutation.
- `[M]` §5: **`$82` and `$10` are ART waves.** 57 of 57 and 25 of 27 descriptors
  have no picture in the bundle. And **type `$88` already emits 12 of 12 records
  with no art for any of them** — nobody's wave list has it.
- `[M]` §5: `$10`'s fire machine calls `$267FC6`, a second unported rank test
  that is not `$2425B2`. Nobody has costed it.
- `[M]` §8: `fly-around` 8/8 green — W36's hazard did not fire. `stage1-play`
  seedcmp byte-identical before and after. 961 tests, 0 fail.

status: **DONE**
