# 85 -- IMPL: making the boss's emission visible to the oracle

status: **DONE.**

`[M]` **`$805CC8` is SPRITE BUCKET 2's staging buffer, counted at `$80AFC4`, and
"bucket 2" is the right name -- but "the boss's bucket" is NOT.** It is a DEPTH
LAYER, and `src/spritequeue.js` has carried it as `BUCKETS[2]` with its counter,
its `$23D3F4` copy site and its `$BC4` capacity since W11. **The boss is not its
only producer and never was**: `src/background.js` `elemStage` has been writing
it since W13 through its own inline copy of `$23DF2A`, and W40's census names
three stub families feeding it. That is the premise correction, and it changed
the design: the comparison had to be CONTAINMENT, and the red-validation had to
cover the background elements as well as the boss.

`[M]` **The trace now exists, it is red-validated, and the ladder did not move:**
`stage1-sweep` is **9 green / 19 red / 43 blocked / 6,750 logic frames**, exactly
as W82 left it, and inside those same 6,750 frames **20,785 bucket-2 records the
port appended were compared against the board's own and 0 are missing.** Before
this wave that number was **zero records over zero frames** and nothing said so.

`[M]` **NINE of W82's TWELVE mutations now go RED on `--segment 19000`, where W82
measured that all twelve were invisible.** The three that stay green are exactly
the three W82 itself declared EXPECTED-GREEN, with reasons, before it ran them.

**BAR CONDITION: TWO (ORACLES PERFECTLY), for the four OBJECT routines W82 could
only claim ONE for.** Condition 1 was never at risk and is re-measured below.

started / finished: 2026-08-06. wave: 85. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `82-impl-295-family.md`, `83-NOTE-censored-census-and-the-
sim-server.md`, `39-OWNER-visible-play-before-sound.md`, `10-recon-display-list`
§3 and its bucket table, `40-recon-emission-path` §bucket 2.

---

## 1. THE PREMISE, CHECKED -- and it was half wrong in a way that matters

### 1.0 THE BRIEF WAS WRONG ABOUT OWNERSHIP. **THIRTY-NINE.**

The brief -- and W82's §8 and note 83 before it -- called `$805CC8` **"the
boss's bucket"** and set the job as *"trace bucket 2 before any further boss
wave"*. `[M]` **it is not the boss's.** It is sprite bucket 2's staging buffer,
a DEPTH LAYER, in `src/spritequeue.js` since **W11** with its counter, its
`$23D3F4` copy site and its `$BC4` capacity; and `src/background.js` `elemStage`
has been writing it since **W13**, two waves' worth of the stage-1 background,
long before the boss existed in this port at all.

So the real job was **"trace a SHARED bucket the boss also writes"**, and that is
not a naming quibble -- it is the whole design:

* it forced **CONTAINMENT** rather than equality (the board carries records this
  port has no producer for: `[M]` eight at lf8,000 against the port's two), and
* it forced the red-validation to cover the **background elements** as well as
  the boss, because W82's twelve mutations can only bite on the last two rungs
  of a 71-segment ladder and all nine GREEN segments are below lf8,250 (§5.1).

A wave that had taken "the boss's bucket" at face value would have written an
equality check, watched it go red over most of stage 1, and reported the
background elements as a boss defect.

**The orchestrator asked for this to be recorded plainly, and it is the
thirty-ninth brief on this project to rest on something false.** The record of
those is the asset; this one cost nothing because the brief also said to check
it.

### ...and the three things the brief named to doubt, one at a time

Here is what each turned out to be, and **I grepped `src/`, `tools/` and the
worklogs before disassembling anything**, as the brief requires. Nothing needed
disassembling: all of it was already on disk.

### 1.1 Is `$805CC8` a bucket at all, and is "bucket 2" the right name? YES.

`src/spritequeue.js:70` -- `{ i: 2, buffer: 0x805cc8, counter: 0x80afc4,
capBytes: 3012, site: 0x23d3f4 }`. The pair was read out of the image by
`tools/w10/buckets.py` at the copy site `$23D3F4` (`lea BUF,A0 / lea CTR,A1 /
bsr $23D726`), not typed in. `10-recon-display-list` §3's table has it as drain
position 2 with `251` records of capacity. W82's name is correct.

### 1.2 Is it a `seedcmp` change or a `portdiff` one? **NEITHER, on its own.**

It is **three** changes and the middle one is the expensive one:

1. `src/state.js` `RAWDUMP_SPEC` has to carry the column, because
   **`tools/oracle/pgm.py w8_rawdump()` reads `PROBE_RAWDUMP` straight out of
   that array** -- the two sides of the comparison are wired together by
   construction and neither can be changed alone.
2. **The BOARD side did not exist and had to be re-measured on the cartridge.**
   `stage1-sweep`'s trace was recorded with 136 columns and none of them is
   bucket 2. §3 is that run and the proof that it reproduced the old one.
3. `portdiff.mjs` compares it and `seedcmp.mjs` reports it.

`seedcmp.mjs` is the thinnest of the three: it carries the counts into the
verdict and prints one summary line. The brief's "extend `seedcmp` / `portdiff`"
would have been a two-file change that compared nothing, because the number it
needed was not in the trace.

### 1.3 Is the boss the only producer writing there? **NO, and this is the one.**

`[M]` `grep 80afc4 src/` and `grep -n 'enqueue.*, 2\|OBJ_BUCKET' src/`:

| writer | since | what |
|---|---|---|
| `src/background.js` `elemStage` (`$23DF2A`) | W13/W18 | the 13 stage-1 background element updaters -- its OWN inline copy of the stub, **not** `spritequeue.js` |
| `src/boss.js` `emit23E020` (`$23E020`) | W82 | the stage-1 boss's four A2 OBJECT routines |
| `resolveEmitStub` (any handler) | W30 | the stub's bucket comes OUT OF THE CARTRIDGE and the enemy tables' stubs resolve to buckets **0, 1, 2, 3 and 7** |

So a hand-kept list of bucket-2 producers would already be a lower bound. That
is why the port's own record set is read off **the counter** (§2.1) and not
collected from the producers.

**And the BOARD has producers the port does not.** `[M]` from the new trace, the
board's dumped prefix at lf8,000 carries **eight** non-zero records, while the
port's own high-water mark over the 250 frames from there is **two**; W40's
census names `$288E4E`/`$289B80` beside the 35 element sites. **Equality would
have been red over most of the stage for a reason that is not a bug.**
Containment is not a hedge here, it is the only correct comparison. (At the boss
the two nearly meet: `[M]` at lf19,100 the board's live records are the six the
port emits, and everything after them in the dump is byte-identical at lf12,000,
lf19,100 and lf19,300 -- which is what residue looks like.)

### 1.4 One thing W82 wrote that is NOT true, corrected in place

`tools/w82bossgate.mjs`'s header said bucket 2 "is drained and rebuilt within a
frame and the checkpoint captures it at a point in the frame this gate cannot
place". `[M]` `tools/oracle/frame.lua` takes the raw dumps (line 1118) and the
checkpoint (line 1218) **inside the same per-frame handler, at the same sample
point**. The bytes were always at a definite instant; what made them useless was
that nobody dumped them, not that they were unplaceable. The comment is
corrected rather than deleted, so the sequence stays legible.

*That is the seventh time a comment in this codebase has said something the code
does not do. It cost this wave nothing because it was checked.*

---

## 2. WHAT THE COMPARISON IS -- and why each weakening is named

### 2.1 The port's own record set needs no producer bookkeeping

Bucket 14's containment check has to collect offsets **slot by slot**
(`ctx.shotRequests`), because the port carries stale copies of shot records for
the option pods' slots, which it does not model. Bucket 2 has no such records:
**the port only ever writes it from code the port has ported.**

Call #4's tail (`$23D70C`) zeroes all thirty counters, so at the top of a logic
frame `$80AFC4` is 0 and **everything the port appended this frame is in
`[0, $80AFC4)`**. `src/main.js` reads that one word at the board's own `$23D382`
instant, beside the `shotRequests` read that has been there since W8. That is
`game.bucket2Bytes`, and it is producer-agnostic on purpose -- a handler that
starts feeding bucket 2 through `resolveEmitStub` is counted without any file
naming it. `tests/w85bucket2.test.js` pins `$80AFC4` as one of `SUM_ORDER`'s
thirty and drives `resetSpriteQueueCounters`, so the premise is the port's own
behaviour and not an assumption living in the differ.

### 2.2 CONTAINMENT, and two ways it is STRONGER than the bucket-14 check

> **EVERY 12-BYTE RECORD THE PORT APPENDED TO BUCKET 2 APPEARS VERBATIM IN THE
> BOARD'S OWN BUCKET 2 FOR THAT FRAME.**

1. **Matched on the ROM's own 12-byte boundary, never as a substring.**
   `sprq` uses `String.includes`, which can match a record straddling two of the
   board's -- at an offset no producer can write. Every bucket-2 producer
   appends exactly `$C` bytes from a counter that starts at 0 and **bucket 2 has
   no BULK writer** (those are 20, 22 and 23), so the alignment is a property of
   the cartridge. There is a test that builds a board dump in which a record
   appears **only** across a boundary, asserts `includes` finds it, and asserts
   the matcher reports it MISSING.
2. **ORDER is reported beside it.** Both sides run the same producers in the
   same object-driver slot order and the port merely SKIPS the ones it lacks, so
   the port's records should be an ordered SUBSEQUENCE of the board's, not merely
   a subset. `[M]` **it holds on 6,750 of 6,750 frames.** It is REPORTED and not
   gated, because promoting a stronger claim to a gate before it has been
   measured over a whole stage is how a gate goes red for a reason that is not a
   defect. A future wave can promote it with this measurement behind it.

### 2.3 THE ONE WEAKENING, NAMED

The board's buffer is **not** cleared between frames -- only the counters are --
so the dumped prefix is this frame's records followed by RESIDUE. A port record
could in principle match a stale one. `[M]` the residue is visible and
identifiable: at lf12,000, lf19,100 and lf19,300 the five records at +84..+132
are **byte-identical**, which is what a record written once and never
overwritten looks like. `order` is what would notice a stale match, and it is
clean on every frame.

### 2.4 THE LENGTH IS MEASURED, NOT PICKED

`[M]` over all 71 checkpoint rungs, the last non-zero byte in the `$BC4`-byte
buffer is at **192 -- sixteen records** (high-water rung lf12,000). `[M]` the
PORT's own per-frame maximum over the same ladder is **seven records (84 bytes)**
at lf19,000, and those seven are the boss: OBJECT 2, OBJECT 3, OBJECT 4 and
OBJECT 5's four limbs. **`$180` = 32 records** is twice the buffer's whole-stage
high-water mark and four and a half times the port's. `portdiff.mjs` prints both
numbers and the count of records that landed past the prefix on every run, so a
later stage that needs more says so instead of quietly comparing a truncation.

`[M]` cost: the trace went from 56.3 MB to 71.3 MB. `--max-old-space-size=8192`
is not required but the sweep is more comfortable with it.

---

## 3. THE BOARD RUN, AND THE PROOF IT IS THE SAME EXPERIMENT

`python tools/oracle/pgm.py ckpt stage1-sweep --verify` -- **72 of 72 rungs in
510 s, 38.4 logic frames per wall second** (the manifest's own figure was 23; the
machine is faster now). `pgm.py ckpt` **deletes the ckpt directory before it
runs**, so the old ladder was copied to `.scratch/` first.

`--verify` passed on its own terms (the wave-4 `PROBE_RAMDUMP` and the wave-69
ladder rung agree byte for byte at lf2,000), but that compares two dumpers
**inside one run** and says nothing about whether the run reproduced. So:

`[M]` `.scratch/w85verify.py`, against the backed-up ladder:

```
CKPT  144 identical (of which 72 identical except the 5 RTC date bytes),
      0 differ, 0 missing, 0 new
COLS  old 136, new 137, added ['sprq2'], lost []
      excluded from the row compare, by name: ['d_date', 'd_ram']
ROWS  19600 compared on the 136 shared columns, 0 differ
VERDICT: REPRODUCED -- the new trace is the old one plus sprq2
```

**19,600 rows and 134 columns identical, and all 72 RAM rungs identical apart
from five bytes.** So the before/after numbers below are one experiment.

### 3.1 A FINDING NOBODY HAD WRITTEN DOWN: a checkpoint rung is not reproducible across days

`[M]` every one of the 72 `*.ram.bin` rungs differs from the old ladder in
**exactly five bytes**, always the same five, always `05` -> `06`:

```
$80209D  $8020AD  $80211D  $802205  $8022C9
```

Those are **the V3021 RTC's day-of-month**, copied to five places at boot.
`01-impl-oracle-pin-versionb.md` found them in wave 1 -- its own listing is
`$80209D` `$8020AC..AD` `$80211C..1D` `$802204..05` `$8022C8..C9`, measured by
running the same scenario on two different days -- and carved them out of the
whole-RAM digest `d_ram` into the reported column `d_date` -- *for a trace*.
Nobody carried that carve-out to the CHECKPOINT DUMPS, and nothing needed to
until a ladder was rebuilt on a different calendar day. `pgm.py ckpt --verify`
cannot see it because both of its dumpers run inside the same day.

It is harmless for a seeded comparison **because the trace and the ladder come
out of one run** and both sides read the same date. It is not harmless for
"re-run the ladder and diff it against the old one", which is exactly what this
wave had to do, so it is recorded here with its five addresses.

---

## 4. THE MEASUREMENT -- `stage1-sweep`, before and after

`node --max-old-space-size=8192 games/ddpdoj/tools/seedcmp.mjs --manifest
games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet`

| | segments | green | red | blocked | logic frames | **bucket-2 records compared** |
|---|---:|---:|---:|---:|---:|---:|
| **before** (W82) | 71 | 9 | 19 | 43 | 6,750 | **0, over 0 frames** |
| **after** (this wave) | 71 | 9 | 19 | 43 | 6,750 | **20,785, over 6,750 frames, 0 MISSING** |

**The verdict columns are deliberately unchanged and that is the right answer.**
This wave ported nothing; it added an instrument. `[M]` the census of blocking
addresses is identical (`$2956F6` x21, `$295120` x14, `$295304` x5, `$295432`
x2, `$294FA6` x1) and the seventeen fields that ever diverge are the same
seventeen, first at the same logic frames, `vf`/`irq6` at lf8,227 and `b054` at
lf19,332. **No new red.** The two W82 reported are still the two W82 reported.

`[M]` the ORDER report: **6,750 of 6,750 frames**.

The sweep now prints one line that did not exist and that is the deliverable:

```
BUCKET 2 ($805CC8, the layer the stage-1 boss draws into): 20785 record(s) the port appended over 6750
frames were checked for containment in the board's, 0 MISSING; and they were an
ordered SUBSEQUENCE of the board's on 6750 of 6750 frames (reported, not gated)
```

and when the trace has no such column it prints, instead of nothing:

```
BUCKET 2 ($805CC8, the layer the stage-1 boss draws into): NOT CHECKED -- this ladder's trace has no
`sprq2` column. Re-run `pgm.py ckpt` (src/state.js RAWDUMP_SPEC carries it now).
```

**A check that is skipped must not read like a check that passed.** The other
three ladders (`fly-around`, `stage1-play`, `stage1-laser-hold`) still have
136-column traces and now say so out loud on every run.

---

## 5. PROVING IT CAN GO RED -- and it is W82's OWN mutations that do it

`docs/knowledge/03`: a trace that watches the right address and has never
disagreed is worth nothing. W82 measured that **all twelve** of its mutations
left `--segment 19000` reporting the identical first divergence. `[M]` re-run
against the new trace, one segment, differential against the unmutated baseline:

| `--break` | verdict | bucket-2 records MISSING |
|---|---|---:|
| *(clean)* | -- | 0 of 1,517 |
| `obj2-no-attr` | **RED** | **250** |
| `obj3-no-bias` | **RED** | **17** |
| `obj4-one-addi` | **RED** | **250** |
| `obj4-index-1` | **RED** | **250** |
| `obj5-d0-clobbered` | **RED** | **750** |
| `obj5-mask-3f` | **RED** | **750** |
| `d7-wrap-ble` | **RED** | **15** |
| `d7-step-one` | **RED** | **15** |
| `d7-bcc-inverted` | **RED** | **16** |
| `obj3-unsigned-ac` | green -- **W82 declared it** | 0 |
| `d7-no-ramp` | green -- **W82 declared it** | 0 |
| `d7-unsigned-per` | green -- **W82 declared it** | 0 |

**Nine of twelve, and the three that do not move are exactly the three W82 wrote
down as expected-green before it ran them**: `obj3-unsigned-ac` is a proven
no-op (`W82_EXPECTED_GREEN`, 0 of 65,536 values differ), and `d7-no-ramp` /
`d7-unsigned-per` are dead in this window because the board's `$AF(A6)` is
already 2 at lf19,000 so both arms of `$2943BE` never execute. **Nothing had to
be invented to explain a green.**

Note the shape of the three D-script-7 mutations going red: D7 writes no sprite
at all. It moves `$AA(A6)`, the cursor **OBJECT 3 indexes its table with** -- so
the bucket-2 trace catches an animation defect through the picture it changes.
That is a second field oracled by one column.

### 5.1 AND IT IS RED WHERE THE BOSS NEVER GOES

Every W82 mutation lives in `src/boss.js` and can only bite on the last two
rungs. A trace proven red at lf19,000 and never exercised at lf2,250 would be a
trace nobody had checked over 95% of the stage it claims to cover. So this wave
adds **one** mutation of its own, `elem-no-kind` (`src/background.js`
`B2_MUTATE`): the transcription that stopped at `$23DF4A` and never read
`$23DF4C move.w D4,(A0)+`, the element's flip/colour word.

`[M]` whole ladder, `--break elem-no-kind`:

```
SEGMENTS 71: 0 green, 28 red, 43 blocked -- 6750 logic frames compared
BUCKET 2: 20785 record(s) checked, 18788 MISSING
RED OK: moved 25 of 71 segments RELATIVE TO THE UNMUTATED BASELINE
```

**All nine green segments go red**, and they go red on bucket 2 alone -- no
column moves. That is the check being a check.

### 5.2 A HOLE IN THE RED-VALIDATOR ITSELF, FOUND BY USING IT

`seedcmp --break` compares the mutated sweep against the unmutated baseline and
counted a segment as MOVED only if its **verdict**, its **first divergent
column** or its **column count** changed. Every W82 mutation's whole effect is on
a sprite bucket, and lf19,000 has been RED since the ladder was built for the
pre-existing `vf`/`irq6` slowdown -- so the mutation moves no column and no
verdict, and the validator would have printed **"changed NOTHING on any of the 1
segments"** for all twelve -- including the nine whose bucket-2 records really do
change, which are the mutations this wave exists to make visible.

The containment miss counts are now part of the differential. The comment
already in that block says the first version of this check could not fail; this
is the same hole one layer down, and it is closed rather than noted.

---

## 6. THE BAR -- WHICH CONDITION I DELIVERED

### 6.1 FEATURE COMPLETE -- **unchanged, and re-measured**

This wave ports nothing. What it adds to the port's frame is ONE RAM READ
(`ram.u16($80AFC4)`) and one mutation seam that is inert while `B2_MUTATE.value`
is `null`, which is the shipped value and which `portdiff` and `breakage` both
reset on every run.

* `node games/ddpdoj/tools/playgate.mjs --frames 600 --all` -> **`VERDICT:
  PLAYABLE -- 6 holds, 600 frames each, no unported path reached`**.
* `node tools/publish.mjs --only ddpdoj --dry` -> **GREEN**, build
  `20260806030843`, `dist/ built: 255 files, 6418 KB`, rom-leak guard clean with
  **six** deliberate exceptions. `PUBLISH_VERBATIM` untouched; no seventh entry.
* `[M]` `node --test games/ddpdoj/tests/` -- **1,019 pass, 0 fail**. The tree's
  pre-existing count is **1,004**, not the 1,003 the brief carries (`[M]` by
  running the suite with this wave's file excluded); the 15 are
  `tests/w85bucket2.test.js`.

### 6.2 ORACLES PERFECTLY -- **YES, and this is the wave**

W82 §6.2: *"the four OBJECT routines therefore carry the weaker claim:
transcribed from the listing, unit-tested against the listing, and not compared
against the board."* That sentence is now false, and §5 is why:

* every record the four OBJECT routines emit is compared against the board's own
  bucket 2, **on every one of the 250 frames of each of the two reachable boss
  segments**, and
* the comparison **has been seen to fail**, on nine of W82's own mutations, and
* it has been seen to fail where the boss never runs, on the elements.

**What is still NOT compared, said plainly:** OBJECT routines 0, 1 and 6
(`$292972`, `$292B08`, `$292F4A`) are still loud named throws, so there is
nothing of theirs to compare. D-script 7's `$AE`/`$AF` fields are still only
compared by `tools/w82bossgate.mjs` against the rung dumps; `$AA` is now covered
transitively through OBJECT 3 (§5) and `$AC` is not. And 43 of 71 segments are
still BLOCKED, so the bucket-2 claim covers the 6,750 frames the port can reach
and not the 10,750 it cannot. **The instrument is now the thing that is not the
limit.**

### 6.3 `pgm.py check` -- and whether the two known reds moved

`[M]` `python games/ddpdoj/tools/oracle/pgm.py check`, run to completion on this
tree after every change above: **`VERDICT: FAILURES -- 72 passed, 2 failed, 0
SKIPPED`**. **The same 72/2/0 as W82 and W84, and the SAME TWO STAGES. No third
red.** Every red-validation stage still passes, including
`segment sweep RED [clamp-first]`, which this wave changed (§5.2).

1. **`segment sweep`** -- the stage exits non-zero while any segment is red or
   blocked, and 43 + 19 still are. `[M]` `fly-around:PASS
   stage1-laser-hold:FAIL stage1-play:FAIL stage1-sweep:FAIL`, unchanged in
   shape and unchanged in every one of the four ladders' own counts
   (`fly-around` 8/0/0, `stage1-play` 1 green / 25 red / 45 blocked,
   `stage1-laser-hold` 14/17/178, `stage1-sweep` 9/19/43).
2. **`THE LASER BOMB: $249A80, $255FE2 and $2456A6`** -- W79 §6.5 filed it as a
   concurrent wave's, W84 established the same. It cannot be this wave's by
   construction: the only line this wave adds to the port's frame is
   `ram.u16($80AFC4)`, which writes nothing.

I have not touched either, per the brief's rule about other agents' work.

---

## 7. WHAT I TOUCHED

* `games/ddpdoj/src/state.js` -- `RAWDUMP_SPEC` gains `sprq2` = `$805CC8:$180`,
  with the measurement that sizes it. Deliberately **not** in `CLAIMED`.
* `games/ddpdoj/src/main.js` -- `this.bucket2Bytes`, one RAM read at the same
  instant as W8's `shotRequests`.
* `games/ddpdoj/src/background.js` -- the `B2_MUTATE` seam (one named wrong
  port, `elem-no-kind`) on `$23DF4C`.
* `games/ddpdoj/tools/portdiff.mjs` -- `bucketContainment()` (exported and pure,
  so a test can drive it), the `sprq2` block, the two report lines including the
  NOT-CHECKED one, the gate, and the `B2_MUTATE` per-run reset.
* `games/ddpdoj/tools/seedcmp.mjs` -- the counts in the verdict and the `why`
  string, the BUCKET 2 summary line, and §5.2's fix to the red-validator.
* `games/ddpdoj/tools/breakage.mjs` -- `elem-no-kind` and the `B2_MUTATE` reset.
* `games/ddpdoj/tools/w82bossgate.mjs` -- §1.4, the corrected header.
* `games/ddpdoj/tests/w85bucket2.test.js` -- **new**, 15 tests.
* the `stage1-sweep` ladder itself, regenerated (gitignored, §3).

Not touched: `publish.mjs`, `bundlegate`, `webgate`, `build-dist.mjs`, the ROM
leak guard, `PUBLISH_VERBATIM`, `boarddl.mjs`, `NOTICE.md`, `CONTRIBUTING.md`,
`src/` (the Game Boy tree), `games/gradius/`. Nothing ROM-derived is committed;
scratch output is in `.scratch/`, which is gitignored.

---

## 8. NEXT

**W82's §8 stands unchanged except that its precondition is met.** The forced
order was 82a (the OBJECT list and the animators), 82b (F + MAIN), 82c (E, the
guns), 82d (the death) -- with *"AND BEFORE ANY OF THEM, ONE TOOL"*. That tool
exists. **The next boss wave can be oracle-clean.**

Three things a future wave should know:

1. **The other three ladders have no `sprq2` column.** Re-running `pgm.py ckpt`
   for them costs 510 s each at this machine's 38 lf/s and is worth doing before
   any wave that expects to unblock `stage1-play` or `stage1-laser-hold`. They
   report NOT CHECKED until then, loudly, on every run.
2. **ORDER is measured clean over 6,750 frames and is still only REPORTED.**
   Promoting it to a gate is a one-line change with a measurement behind it, and
   it would catch a duplicated record, which containment cannot.
3. **Buckets 0, 1, 3 and 7 are the same job and the same three-file change.**
   Bucket 0 alone was 72% of sprite pixels in W11's ablation and carries the
   ENEMIES; `resolveEmitStub` already routes ported handlers into 0, 1, 2, 3 and
   7. `bucketContainment()` is parameterised over nothing but the bytes, so the
   cost is one `RAWDUMP_SPEC` line, one counter read and one MAME run per ladder
   -- and the size of each prefix should be measured off the rungs the way §2.4
   measured this one, not guessed.
