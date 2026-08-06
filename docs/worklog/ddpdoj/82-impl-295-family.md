# 82 -- IMPL: the `$294xxx`/`$295xxx` family -- **IT IS THE BOSS**

status: **DONE.**

`[M]` **The brief's labelled hypothesis is CORRECT and it changes the shape of
the job.** `$294FA6`, `$295120`, `$295304`, `$295432` and `$2956F6` are not five
routines: they are the STEP halves of stage-1 boss **table-F script ids 0, 1, 2,
3 and 6**, and `$2943B0` is **D-script 7**. Recon 48 §2.2 and §2.4 tabulated all
six by address in W48 and nobody joined it up. So this is item **B** of recon
48's own three-wave estimate, and per the brief I scoped and split it rather
than burning the wave on a third of it.

`[M]` **AND THE CENSUS IS MASKED.** Clearing the six named addresses does not
unblock one rung. `$2596C6` walks **A4 first**, so the F throw hides everything
behind it. Read out of the ladder's own RAM dumps, the 45 blocked rungs need
**41 distinct entry points on their FIRST FRAME, 39 of them unported** -- the
census's six are six of thirty-nine (§2).

**WHAT I SHIPPED** is the piece the brief named as worth doing even if small,
and it is exactly the piece that is not masked: **the stage ENDING**. `[M]`
`stage1-sweep` went from **9 green / 17 red / 45 blocked / 6,250 frames** to
**9 green / 19 red / 43 blocked / 6,750 frames**. The last two rungs -- lf19,000
and lf19,250 -- are no longer BLOCKED, and `$2943B0` is gone from the census.
**Both reds are pre-existing declared deferrals, named in §5, not new defects.**
1,003 unit tests (was 973), 0 failing.

**BAR CONDITIONS: BOTH, for D-script 7. ONE (feature complete) for the four
OBJECT routines, and §6 says exactly why the second is not available to them.**

started / finished: 2026-08-06. wave: 82. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `78-diag-oracle-blindness.md`, `79-impl-hyper-autoshot.md`,
`48-recon-boss-script.md`, `39-OWNER-visible-play-before-sound.md`,
`docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE PREMISE, CHECKED -- and it was already written down

**I grepped `src/`, `tools/` and the worklogs before disassembling anything, as
the brief requires.** Four things the brief did not know, all of them already on
disk:

### 1.1 IT IS THE BOSS. Recon 48 named every one of these addresses.

`docs/worklog/ddpdoj/48-recon-boss-script.md` §2.2 is the stage-1 boss's
**table F** (`$294F68`, the A4 register), seven `{INIT, STEP}` pairs:

| id | INIT | STEP | in the brief's census |
|---|---|---|---|
| 0 | `$294FA0` | **`$294FA6`** | 1 rung |
| 1 | `$295002` | **`$295120`** | 14 rungs |
| 2 | `$2952D8` | **`$295304`** | 5 rungs |
| 3 | `$29540C` | **`$295432`** | 2 rungs |
| 4 | `$29554A` | `$29556C` | -- |
| 5 | `$295616` | `$295626` | -- |
| 6 | `$295684` | **`$2956F6`** | 21 rungs |

and §2.4 is **table D** (`$29370A`), whose entry **[7] is `$2943B0` twice** --
the brief's "last two rungs, the stage END".

**Every blocked address in the census is a STEP, never an INIT**, and that is
the signature of a SEEDED comparison: the ladder resumes from board RAM in which
the slots' "INIT has already run" bit is set, so the walk takes the `+4` arm on
its first frame. It is not evidence that the INITs are unreachable.

### 1.2 The boss is LIVE from lf~7,870, not only at the end

`[M]` from the ladder's own RAM: `$812984`/`$812BD4`/`$8129CC`/`$812A70`/
`$812D38` are all non-zero from the **lf8,250 rung onward** and carry
`$293104`/`$295856`/`$292932`/`$29370A`/`$294F68` -- the stage-1 boss's five
tables, `$29272E jsr $259554`'s own arguments. **45 rungs, and 45 is the blocked
count.** The boss occupies lf7,870..19,500, i.e. **the entire second half of the
stage**, which is why this family and not the laser is the ladder's ceiling.

### 1.3 WAVE **A** IS ALREADY DONE. `src/scheduler.js` exists, W62 wrote it.

Recon 48 §7 planned three waves, **A** the scheduler, **B** the boss body, **C**
the death. **A shipped in W62** -- 427 lines, `$259554`, `$25962E`, `$2596C6`,
the ten primitives, the `$812980..$812E07` RAM block, the double pass, the
`registerScript` registry. That is why these throws are *reachable* at all: the
scheduler dispatches, finds no body, and `runScript` throws by address. The
brief's premise that this family is "unported" is right; the premise that
porting it is an unblocking job rather than wave B is not.

### 1.4 One correction to recon 48, and the port already had it right

Recon 48 §1.4 says the channel status word's **"bit 0"** means "INIT has already
run". `[M]` the ROM is `$2596E4 bset.b #$0,(A4)` -- a **BYTE** operation on the
even address, so it is **bit 8 of the word**. `src/scheduler.js` reads
`ram.u8(a)` and is correct; recon 48's table is loose. My own first probe
believed the worklog over the source and mis-read every slot's arm state; §2's
numbers are from the corrected probe. *This is the fifth time this project has
treated something already recorded as an open question, and the first time the
recorded thing was the wrong one.*

---

## 2. THE FINDING THAT SIZES THE JOB -- the census is masked by WALK ORDER

`$2596C6` runs **A4 → A0 → A1 → A3**, and `$25962E` runs **A2** after. A4 is
first, so **every blocked rung reports an F address and tells you nothing about
the other four tables.**

`[M]` I read the ladder's 45 RAM dumps and resolved, for each rung, exactly what
`$25962E` would dispatch on its first frame -- slot status words through the real
tables, in the real walk order. Two representative rungs:

```
lf12000  n=11  F6.STEP$2956F6  F5.STEP$295626  F4.STEP$29556C
               MAIN6.STEP$2935E8  E11.STEP$296614  E0.STEP$295948
               D7.STEP$2943B0
               OBJ2$292952 OBJ3$292BFA OBJ4$292E0A OBJ5$292E3E
lf 9750  n=17  F2.STEP$295304  MAIN4.STEP$293506
               E5$2960F4 E6$296200 E14$2968FE
               D0$2937CC D1$293816 D10$2944E6 D11$29451A D7$2943B0 D14$294658
               OBJ0..OBJ5
```

**Eleven to seventeen entry points per frame, of which the census sees one.**

`[M]` the UNION over the 45 rung boundaries -- a strict LOWER BOUND, since a
250-frame window starts scripts no boundary captured:

| table | entry points needed | ported before this wave |
|---|---|---|
| F | 7 (ids 0..6, all STEP) | 0 |
| MAIN | 7 (ids 1,2,4,5,6,7,8) | 1 (`$2933C2`, W62) |
| E | 7 (ids 0,1,4,5,6,11,14) | 0 |
| D | 13 (ids 0,1,2,3,6,7,10,11,14,15,16,17,20) | 1 (`$293E04`, W62) |
| OBJECT | 7 (all of `$292932`) | 0 |
| **total** | **41** | **2** |

`[M]` static closure over those 39 unported entry points (`walk.py`, the W48/W49
walker; `jsr (An)` invisible, so a lower bound): **80 routines, 2,173
instructions, 8,626 bytes.** For scale, W28's figure for **all thirteen** of
stage 1's other unported handlers is 2,063 instructions [CITED]. The first
frame alone of the blocked rungs is bigger than that.

> **So porting the six named addresses would have moved the throw, not cleared a
> rung.** A wave that had done only what the brief's table names would have
> reported "five routines ported" and `45 blocked` unchanged, with the census
> pointing at `$2935E8`/`$296614`/`$2937CC` instead. That is the shape
> `docs/knowledge/10` is about, and it is the reason this wave stopped to
> measure before writing the fifth routine.

---

## 3. WHAT I PORTED -- the stage END, and it is the piece that is NOT masked

The last two rungs are the only ones where the needed set is small, because the
boss is dead: **F and E are empty, MAIN is id 1 (`$2933C2`, W62 has it) and D is
7 and 6 (`$293E04`, W62 has it).** What was missing was `$2943B0` and four of
the seven OBJECT routines.

| address | what | insn / B |
|---|---|---|
| `$2943B0` | **D-script 7**, the boss's body ANIMATOR. INIT == STEP | 14 / 62 |
| `$292952` | OBJECT 2 -- one sprite, all literals | 6 / 30 |
| `$292BFA` | OBJECT 3 -- **the consumer of D7's cursor** | 13 / 46 |
| `$292E0A` | OBJECT 4 -- one sprite, table entry [0] only | 9 / 38 |
| `$292E3E` | OBJECT 5 -- **four** sprites off one base | 36 / 138 |
| `$23E020` | the bucket-2 enqueue -- already `spritequeue.js` | (wired) |

**READ BOTH ENDS, and it paid twice:**

* **Nothing falls into `$2943B0`, and proving it took a second look.**
  `$294360..$2943AF` is a table of 12-byte records whose third longword is
  `$00222B38` -- one of the five stream ids `$292744`'s `jsr $24150A` loads, so
  the region is DATA. `[M]` a scan of `$240000..$2A0000` for every control
  transfer landing in `$294370..$2943B0` finds exactly **one**,
  `$292322 bsr.w $294377` -- and `$292322` **is inside the ASCII CREDITS**
  (`SPECIAL ASSIST`, `Toshiaki Tomizawa`, `SALE BY AMI`, `2002 DEVELOP`). The
  `bsr.w` is the bytes `61 00 20 53`, the letters `a`, NUL, space, `S` of
  "...awa" + " SAL". Below, the routine ends at the `rts` at `$2943EC` and
  `$2943EE` is D-script **8**'s INIT. Both ends checked, and the one thing that
  looked like a caller was a sentence.
* **`$23E050 move.l (A7)+,D0` is load-bearing.** `$292E3E` computes a base
  position once into D0 at `$292E60` and then calls `$23E020` **four times**,
  adding a different offset each time. Only the emitter's LAST TWO instructions
  tell you D0 survives. A transcription that let it be clobbered puts all four
  limbs in one place, and it is now the mutation `obj5-d0-clobbered`.

**Three things the addresses do not tell you, all of them in the source
comments:**

1. **`$AF(A6)` converges on 2 and stays there.** `$2943BE`'s three arms
   decrement above 2, increment below 2, and do nothing at 2. A port treating
   the period as a constant is right forever *after* the ramp and wrong exactly
   while the boss arrives.
2. **The cursor wraps AT `$1C`, not after it.** `blt` keeps values strictly
   below, so the cycle is the SEVEN values 0,4,8,`$C`,`$10`,`$14`,`$18` and
   never `$1C`. `ble` would give eight and read one longword past every 32-byte
   row of `$292BFA`'s table.
3. **`$2943C8 blt` IS SIGNED.** My first port compared `$AF(A6)` as an
   unsigned byte. It differs only for `$AF >= $80` -- which the ladder never
   produces -- but `blt` is what the ROM wrote, and an unsigned `<` sends
   exactly those values down the OTHER arm. Fixed before commit and kept as the
   mutation `d7-unsigned-per`, with a probe that drives a period of `$FF`.
4. **`$292BFA`'s `addq.w #$7` is a BIAS.** Row 0 is `$AC(A6) = -7`, so the
   `lea`'s own address is the BOTTOM of the table, not its middle, and `$AC` is
   a signed offset over fifteen rows. `[M]` it really goes negative: `$29578C
   moveq #$19,D1` feeds `$242190` a target of `$19-$20` = -7 through the
   `+$20`/`-$20` bias pair; D-script 15 (`$2948A6`) targets 0.

### 3.1 A CLAIM THIS WAVE WROTE AND THEN WITHDREW

My first draft of the `$292BFA` comment said a port reading `$AC` as **unsigned**
would index past every row. **It would not**, and the mutation proved it by
refusing to go red. `[M]` over all 65,536 word values,
`u16((u16($AC)+7)<<5)` and `u16((i16($AC)+7)<<5)` differ on **0**: `i16(x) ≡ x
(mod 65536)`, `$292C06 lsl.w #$5` is a WORD shift, and `$292C08 adda.w`
sign-extends only the truncated result -- the two readings are the same
instruction. The comment is corrected in place and `obj3-unsigned-ac` is kept
and **declared EXPECTED-GREEN with that measurement** rather than deleted, with
a test that asserts its output is **byte-identical**, not merely "did not go
red".

---

## 4. THREE ROM WINDOWS ADDED -- AND TWO THAT WERE WRONG

`src/rom.js` refused three reads the moment the routines ran, by address, which
is the guard working. The extents are declared in `tools/export-tables.py` with
`check_boss_object_tables` asserting each **out of the image on every export**;
each far end is pinned by the next OBJECT routine's own entry point, and those
are longwords **the cartridge publishes** in the A2 list at `$292932`.

| window | len | pinned by |
|---|---|---|
| `$292C2A` | `$1E0` | `$292E0A` (OBJECT 4's first instruction) -- 15 rows of `$20` |
| `$292E32` | `$C` | `$292E3E` (OBJECT 5's) -- only [0] is reachable |
| `$292ECA` | `$80` | `$292F4A` (OBJECT 6's) -- 32 longwords, `(b & $3E)*2` |

**AND TWO EXISTING WINDOWS WERE WRONG -- the third instance of the same defect.**

* **`$29370A` was `$50`. The table is `$A8`.** W62 sized it at TEN because there
  are ten A3 **slots**; `$2597E2 andi.w #$FF / lsl.w #$3` indexes by the script
  **ID**, and recon 48 §2.4 enumerated **twenty-one**. `[M]` [21] is
  `42 54 4E 75` = `clr.w (a4) / rts`, the shared "script done" tail recon 48
  §1.4 already names as the landmark -- CODE, and the pin.
* **`$295856` (table E, 15 pairs, `$78`) was NEVER DECLARED AT ALL.**

**What the short window cost: nothing yet, and that is the point.** D-scripts
10, 11, 14, 15, 16, 17 and 20 are all live in the ladder, and every one of them
would have thrown as a **ROM-WINDOW read at `$29375A`+ instead of as the SCRIPT
it is** -- naming the table rather than the routine, which is the precise failure
the comment on that window says it exists to prevent. Same for all fifteen E
scripts, which is where the boss's 49 bullet sites are. W64 fixed exactly this
on `$294F68`; `check_boss_script_table_extents` now asserts both from the image
so it cannot be the fourth.

**Nothing ROM-derived is committed.** The tables go through the exporter and
`rip/port/player.tables.json`, which is gitignored.

---

## 5. THE MEASUREMENT -- `stage1-sweep`, before and after

`node games/ddpdoj/tools/seedcmp.mjs --manifest
games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet`

| | segments | green | red | **blocked** | **logic frames compared** |
|---|---|---|---|---|---|
| **before** (W79) | 71 | 9 | 17 | **45** | **6,250** |
| **after** (this wave) | 71 | 9 | **19** | **43** | **6,750** |

**Two rungs unblocked, +500 logic frames.** The new blocking census:

| before | after | address | what it is |
|---|---|---|---|
| 21 | 21 | `$2956F6` | F id 6 STEP |
| 14 | 14 | `$295120` | F id 1 STEP |
| 5 | 5 | `$295304` | F id 2 STEP |
| 2 | 2 | `$295432` | F id 3 STEP |
| 1 | 1 | `$294FA6` | F id 0 STEP |
| 2 | **0** | `$2943B0` | D id 7 -- **cleared** |

### 5.1 THE TWO NEW REDS, REPORTED AND NOT BURIED -- both pre-existing

The brief is explicit that reds going up because previously-blocked segments can
now be compared is this wave succeeding. Both of these were **invisible** before,
because the segments were blocked on their first frame and compared 0 of 500.

* **lf19,000..19,250 -- `vf`/`irq6` first at lf19,160.** 160 clean frames, then
  the **already-known slowdown divergence** (W69, `76-recon-mister-timing.md`),
  the same pair `78-diag` reports at lf8,227 and W79 §6 reports as "not new, not
  mine". Nothing this wave wrote is in that path.
* **lf19,250..19,500 -- `b054` first at lf19,332**, `port=0 board=$FFDB0000`.
  `[M]` `$80B054` is the **screen shake**, and `src/background.js:1131` has
  carried `$260EC8 the screen shake -- UNPORTED` as an explicitly declared
  deferral since long before this wave. `[M]` `$293E04` (D-script 6, the boss's
  death animation) reaches `$260E36` -- the shake family -- only through
  `$293EEC`'s `$2440E0`, which `d6Step293E04` `note()`s rather than runs and
  which recon 48 §7 costs at 2,542 B as **wave C**. So the red is wave C
  arriving in view, on schedule, 82 frames into a window that used to compare
  zero.

Neither is a defect this wave introduced; both are defects this wave made
**measurable**. `vf`/`irq6` then follow `b054` one frame later, which is the
blast radius, not a second finding.

### 5.2 The other three ladders are unmoved, which is the right answer

`fly-around` never reaches the boss; `stage1-play` and `stage1-laser-hold` are
blocked ahead of it on the F family and the laser respectively. Nothing this
wave wrote can run on them.

---

## 6. THE BAR -- WHICH CONDITIONS I DELIVERED, AND WHERE I FELL SHORT

### 6.1 FEATURE COMPLETE -- **YES**, for all five routines

`node games/ddpdoj/tools/playgate.mjs --frames 600 --all` →
`VERDICT: PLAYABLE -- 6 holds, 600 frames each, no unported path reached`. The
stage-end rungs run 250 frames each with no throw where they previously threw on
frame 1. `$2943B0` is gone from the census.

### 6.2 ORACLES PERFECTLY -- **YES for D-script 7. NO for the four OBJECT
routines, and here is the reason rather than a hedge.**

**`seedcmp.mjs`'s 94 columns cannot see this wave's code.** `src/state.js:199`
traces sprite bucket **`$808854`** under the name `sprq` -- the shots. The boss's
OBJECT routines emit into **`$805CC8`** (bucket 2), which nothing in this repo
traces. D-script 7's fields live in the boss sub-record, also not a column.
`[M]` **all twelve W82 mutations leave `--segment 19000` reporting the identical
first divergence** (`vf@lf19160`). The segment sweep is a gate for *"does it
still throw"* and is **not** a gate for *"is it right"*. Saying so is the point;
a green from a comparison that cannot fail is `78-diag`'s own lesson.

**So I built the smallest thing that IS an oracle in spite of that.** The ladder
holds the board's whole 128 KiB of RAM at every rung, so the boss's own
animation state at lf19,250 is on disk and was measured by MAME.
`tools/w82bossgate.mjs` seeds at lf19,000, runs 250 logic frames through the
port's real frame loop, and compares D-script 7's four fields to that dump.
**A6 is derived, not hardcoded**: `$2927B6 lea $16(a5),a0 / move.l a0,$81B62A`
is the boss init publishing its own record for the HP bar, so
`a5 = ($81B62A) - $16` and `a6 = (a5+6).l` come out of the board's RAM by an
instruction.

```
W82 BOSS GATE -- D-script 7 ($2943B0) vs the BOARD's own RAM
  window  lf19000 -> lf19250, 250 logic frames, seeded from the board
  A6      $81523C (derived: $81B62A - $16 -> A5 $81378C, then (A5+6).l)
  [OK  ] $AA (the cursor, $2943D8)      port=$0014 board=$0014
  [OK  ] $AC (the row, $2948A6/$2957AC) port=$0000 board=$0000
  [OK  ] $AE (the tick, $2943B0)        port=$01   board=$01
  [OK  ] $AF (the period, $2943BE)      port=$02   board=$02
VERDICT: FAITHFUL
```

**AND IT IS RED-VALIDATED**, which matters more than the green:

| `--break` | verdict | first differing field |
|---|---|---|
| *(clean)* | **FAITHFUL** | -- |
| `d7-wrap-ble` | **WRONG** | `$AA` port=`$0004` board=`$0014` |
| `d7-step-one` | **WRONG** | `$AA` port=`$0017` board=`$0014` |
| `d7-bcc-inverted` | **WRONG** | `$AA` and `$AE` |
| `d7-no-ramp`, `d7-unsigned-per` | **GREEN -- DECLARED** | see below |
| the seven `obj*` | GREEN -- declared | the gate does not oracle bucket 2 |

`d7-no-ramp` and `d7-unsigned-per` are declared EXPECTED-GREEN in the gate
itself, before the run: `[M]` the board's `$AF(A6)` is **already 2** at
lf19,000, so both arms of `$2943BE` are dead for the whole window and 2 is
positive under either reading. They are **seen red** by the `d7-period-ramp`
(period 5) and `d7-period-signed` (period `$FF`) probes in the unit tests.

**The four OBJECT routines therefore carry the weaker claim**: transcribed from
the listing, unit-tested against the listing, and *not* compared against the
board. That is stated here rather than blurred, and §8 names what would fix it.

### 6.3 The tests, and every check SEEN TO FAIL

`tests/w82stageend.test.js`, **30 tests**. Every expected value is derived from
the listing quoted in `src/boss.js`, never from running the port. They pin D7's
tick gate, both arms of the period ramp, the seven-value cursor cycle, the four
OBJECT routines' immediates, `$292BFA`'s bias and both ends of its window,
`$292E0A`'s unindexed load, `$292E3E`'s four independent positions and its
`$3E` mask, the A3/A1 table extents, the OBJECT-table pins, and that OBJECT 0,
1 and 6 stay loud named throws.

**The red half drives the SHIPPED seam** (`W82_MUTATE`, W79's device) so it
needs no source edit and cannot rot away from the green half. Ten probes, a
declared matrix of **eleven** mutations to the probes that must reject each, and
one mutation declared expected-green with a proof (§3.1). `[M]` running the file
with the matrix inverted is how each probe was seen red.

`[M]` `node --test games/ddpdoj/tests/` -- **1,003 pass, 0 fail** (was 973; this
file is the 30).

**AND THE EXPORTER'S CHECKS WERE SEEN RED TOO**, which matters because a unit
test cannot read the cartridge and so cannot catch a short window
(`check_bomb_extents`'s own docstring says why). `[M]` driven against a mutated
copy of the image, in memory:

| mutation to the image | result |
|---|---|
| *(clean)* | both checks pass |
| `$2937B2 := 0` (the A3 pin is no longer `clr.w (a4)/rts`) | **RAISED** -- "must be `$42544E75`, the CODE that proves the A3 table is 21 pairs" |
| `$292942 := $292E00` (A2 list entry [4] moved) | **RAISED** -- "W82's three table extents are pinned by entries [4] [5] [6] and cannot be derived if it moved" |
| `$292C04`: `addq.w #$7` → `#$6` | **RAISED** -- "OBJECT 3's table base and its SIGNED `$AC` range are derived from that bias" |

### 6.4 One existing test needed widening, and its claim is unchanged

`tests/w62stageend.test.js`'s *"every registered script address is one of the
boss's own table entries"* built its legal set from **A3 (ten pairs) and A0
only**. My four OBJECT routines come from the **A2 list**, a third class it did
not know about. Extended to all four classes (A3 at its true twenty-one, A0,
A1, A2 with its `$FFFFFFFF` terminator asserted), plus a negative case --
`$2943EC`, D7's `rts`, must be rejected -- so the widening did not weaken it.

---

## 6.5 `pgm.py check` -- 72 passed, 2 failed, and NEITHER is mine

`[M]` `python games/ddpdoj/tools/oracle/pgm.py check`, run to completion on this
tree after every change above: **`VERDICT: FAILURES -- 72 passed, 2 failed, 0
SKIPPED`**. That is **exactly W79's number, and exactly W79's two stages**:

1. **`segment sweep`** -- expected, and it is the row this wave IMPROVED. The
   stage exits non-zero while any segment is red or blocked, and 43 still are.
   `fly-around:PASS stage1-laser-hold:FAIL stage1-play:FAIL stage1-sweep:FAIL`,
   unchanged in shape from W79.
2. **`THE LASER BOMB: $249A80, $255FE2 and $2456A6`** -- **W79 SS6.5 already
   filed this as a concurrent wave's, proven three ways, and it fails
   identically here.** `[M]` it cannot be mine by construction: the scenario
   runs lf2,000..3,112 and **the stage-1 boss's tables are not installed until
   lf~7,870** (SS1.2), so `$259554` has never run, every scheduler pointer is 0,
   every walk is skipped and not one line this wave wrote can execute. My other
   change, the ROM windows, is strictly MORE permissive: it adds three windows
   and widens one, and a wider window cannot make a read fail.

I have not touched it, per the brief's rule about other agents' work.

---

## 7. WHAT I TOUCHED

* `games/ddpdoj/src/boss.js` -- `d7Anim2943B0`, `obj2_292952`, `obj3_292BFA`,
  `obj4_292E0A`, `obj5_292E3E`, `emit23E020`, the five `registerScript`s, the
  `W82_MUTATE` seam (11 named wrong ports) and the `W82` test export.
* `games/ddpdoj/tools/export-tables.py` -- three new windows, `$29370A` widened
  `$50`→`$A8`, `$295856` added, and two new check functions wired into `main`.
* `games/ddpdoj/tools/breakage.mjs` -- the 12 mutations and
  `W82_EXPECTED_GREEN`.
* `games/ddpdoj/tools/portdiff.mjs` -- one line: reset `W82_MUTATE` per run,
  beside the two resets that already had the comment explaining why.
* `games/ddpdoj/tools/w82bossgate.mjs` -- **new**, the board comparison.
* `games/ddpdoj/tests/w82stageend.test.js` -- **new**, 30 tests.
* `games/ddpdoj/tests/w62stageend.test.js` -- §6.4, one test widened.

Not touched: `publish.mjs`, `bundlegate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM`, `boarddl.mjs`, `NOTICE.md`, `CONTRIBUTING.md`, `src/` (the
Game Boy tree), `games/gradius/`.

---

## 8. NEXT -- the split, with the forced order

Recon 48 §7's three-wave estimate stands and **A is already done**. What §2
adds is *how to cut B*, and the cut is **not** by table: **F alone unblocks
nothing**, because MAIN, E, D and the OBJECT list all run in the same frame.

**82a -- THE OBJECT LIST AND THE ANIMATORS (the smallest closed set).**
`$292972`, `$292B08`, `$292F4A` -- the three OBJECT routines this wave left
throwing -- plus D-scripts 0, 1, 2, 3 (`$2937CC`, `$293816`, `$293852`,
`$293884`) and 20 (`$294AC0`, which is D7's cursor stepper WITHOUT the period
ramp -- `$294ABA` is its INIT and clears `$AE`). These are present at nearly
every rung, they are small, and `w82bossgate.mjs` extends to them field by field.

**82b -- F + MAIN, the phase machine.** 7 + 7 STEPs, plus their INITs for a run
that plays from the start. This is what the census names and it is the biggest
single block (43 rungs) -- but it must ship WITH 82a or the throw simply moves.

**82c -- E, the guns.** 7 STEPs at the boundaries, 15 ids in full. This is where
recon 48 §5's **bullet kinds 9 and 11** are, and their first execution should be
treated as a finding, not a pass.

**82d -- the death, recon 48's wave C.** `$2440E0` (2,542 B) + `$289004` + the
`$28Bxxx`/`$28Cxxx` cluster, and with it `$260EC8`, the screen shake -- which is
§5.1's `b054` red and is now a red on a ladder rather than a note in a file.

**AND BEFORE ANY OF THEM, ONE TOOL.** §6.2 is the binding constraint: **the
oracle cannot see the boss.** `src/state.js` should trace sprite bucket 2
(`$805CC8`/`$80AFC4`) and the boss sub-record the way it traces the shots, or
every wave above will ship with the weaker of the two bar conditions. The
checkpoint ladder already holds the board's answer -- 128 KiB per rung, 45 rungs
-- so this costs no emulator time. It is the highest-leverage thing on this list
and it is not a boss wave at all.
