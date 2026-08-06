# W32 - IMPL: the four scroll-program gate failures

status: **DONE** - the DaiOuJou gate is **`VERDICT: ALL GREEN -- 49 passed, 0
failed, 0 SKIPPED`**. All four scroll-program stages were ONE defect, and it was
in the HARNESS: `tools/scrollportgate.mjs` never ran main-loop call #4's tail
(`$23D70C..$23D71C`), so the background object's own bucket-2 producer walked
`$805CC8 + $80AFC4` into the camera block the gate compares. Fixed; the stage-1
stage now compares **10,431 of 10,431 frames, 0 of 12 columns divergent** and the
attract stage **1,364 of 1,364, 0 of 9**. **DaiOuJou is publishable again.**
wave: 32. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless noted.

## THE BRIEF

W31 left the DaiOuJou gate at **45 passed / 4 failed / 0 skipped**. The four are
the "pre-existing scroll-program red" that has been failing for ten waves and
that nobody owns:

```
[FAIL] scroll program: the port vs the whole of stage 1 (10,431 frames)
[FAIL] scroll program RED (9 mutations)
[FAIL] scroll program: the ATTRACT entry clock $0038 (1,364 frames)
[FAIL] scroll program RED [no-fast-forward] on the attract entry
```

Make them green, or establish exactly why they cannot. `tools/publish.mjs`
refuses a red gate, so DaiOuJou has been unpublishable since W29.

**BASELINE, re-measured on the starting tree before anything was touched** (a
full `pgm.py check`, not quoted from W31): `VERDICT: FAILURES -- 45 passed, 4
failed, 0 SKIPPED`, and the four named stages are exactly the four above.

---

## 1. THE ANSWER IN ONE SENTENCE

**All four are ONE defect, and it is in the HARNESS, not in the port**:
`tools/scrollportgate.mjs` simulates the board's frame as *IRQ6 upload* +
*main-loop call #2*, and omits **main-loop call #4's tail, `$23D70C..$23D71C`**
- `moveq #0,D1 / move.w #$1D,D0 / move.w D1,(A0)+ / dbra`, the thirty words
`$80AFC0..$80AFFB`, the sprite-staging counters, zeroed once per frame.

Since W18 the background object has been a **PRODUCER** of sprite bucket 2:
each of the thirteen background elements reaches `$23DF2A` (`elemStage` in
`src/background.js`), which stages twelve bytes at `$805CC8 + $80AFC4` and does
`addi.w #$C,$80AFC4`. **Nothing in the ROM caps that offset** - `capBytes` in
`src/spritequeue.js` is derived from the next buffer's address and no
instruction checks it; the board's only bound is that call #4 zeroes the counter
every single frame. A harness that runs the producer and never the clear lets
`$80AFC4` climb by 12 per live element per frame, forever, and the staging
pointer eventually walks out of bucket 2 and into the camera block the gate is
comparing against.

Classification, per the brief's four options: **(c) a scenario/harness
artefact**, for all four failures. Not a port defect, not an unported path, not
untranscribed board behaviour. The port was doing exactly what the ROM does.

---

## 2. THE CHARACTERISATION, BEFORE ANYTHING WAS CHANGED

Per the brief: the scenario, the field, the FIRST divergent logic frame, and the
two values. No frame counts, no percentages.

### FAILURE 1 - `scroll program: the port vs the whole of stage 1`

Scenario `tools/oracle/out/w17-stage1-invuln-p2.tsv`, entry clock 0, k = 1620.

| field | first divergent lf | port | board |
|---|---|---|---|
| **`b012`** (`$80B012`, the along-axis camera) | **lf2965** | `$00133940` | `$00033940` |
| `b016` (`$80B016`) | lf2966 | `$80100023` | `$00ED07C0` |
| `b034` (`$80B034`) | lf2966 | `$16900013` | `$00033980` |
| `bgx` (the BG X register) | lf2966 | `$4CE5` | `$0CE5` |
| `b038` | lf2967 | `$805A8010` | `$00ED07C0` |
| `b03c` | lf2967 | `$0023` | `$0000` |
| `bgy` | lf2967 | `$4000` | `$B41F` |
| `d18a` | lf3248 | `$3F34` | `$003A` |
| `d18c` | lf3248 | `$94AE` | `$04C0` |

and the run then **BLOCKED at lf3254** with a loud named throw -
`UNPORTED $80100023: longword at $80100023 is outside every ROM window` - i.e.
the corrupted `$80B016` was read back as a pointer. That throw is the port's
own guard doing its job on garbage the harness had scribbled into RAM.

`b012` at lf2965 is the whole story and everything after it is consequence.
`$00133940` − `$00033940` = **`$00100000`**, i.e. **the HIGH WORD went from
`$0003` to `$0013`**, on a frame the board's `$80B012` did not move at all.

### THE WRITE THAT DID IT, NAMED

A write watch on `$80B012` (scratch probe, not committed) over lf2963..2967:

```
--- lf2964 ---   setU32 $80b012 = 33940   camBgAccumulate  ($240B94)
--- lf2965 ---   setU32 $80b012 = 33940   camBgAccumulate  ($240B94)   <- correct
                 setU16 $80b010 = 1690    elemStage <- elemUpdate <- elemDriver
                 setU16 $80b012 = 0013    elemStage <- elemUpdate <- elemDriver
--- lf2966 ---   setU32 $80b014 = 805a8010 elemStage ...
```

`$1690` and `$13` are not camera values. They are **`d3` and `d4` of a
`$23DF2A` sprite request** - a background element's `yPos` constant and its
`kind` byte. At lf2965 `$80AFC4` had reached **`$5340`** = 12 × 1,776, and
`$805CC8 + $5340` = `$80B008`, so that record's last two words landed on
`$80B010` (`d3`, at +8) and `$80B012` (`d4`, at +10).

Four elements were live, each staging one record per frame, so the counter grew
by 48 a frame from the first `bgelem` spawn - a straight line to the camera.

### FAILURE 3 - `the ATTRACT entry clock $0038`

Scenario `tools/oracle/out/bg-attract.tsv`, `--entry 0x38 --k 2636`. **The same
defect, the same signature, a different frame** because the element spawns are
at a different clock:

| field | first divergent lf | port | board |
|---|---|---|---|
| **`b012`** | **lf3701** | `$00130940` | `$00010940` |
| `b016` | lf3702 | `$80100023` | `$006109C0` |
| `b034` | lf3702 | `$16900013` | `$00010980` |

Again the high word of `$80B012` becomes `$0013` - the element kind - and the
low word is untouched, because the twelve-byte record straddles the boundary.

### FAILURES 2 AND 4 - the two RED-SWITCH stages

Neither had a defect of its own. Both are **consequences of failures 1 and 3**,
and each failed for a reason worth writing down separately, because both are the
`docs/knowledge/03` shape - a check that had stopped meaning what it claimed.

**FAILURE 2** (`--break all` on the wave-17 corpus) failed because (a) the clean
baseline inside it was red, and (b) **`no-fast-forward` is DECLARED
EXPECTED-GREEN at entry clock 0 and went RED**, which the gate correctly reports
as `*** DECLARED EXPECTED-GREEN AND WENT RED -- one of the two is wrong.` It was
red on the corruption, not on the mutation: `$26200E` returns immediately when
`$8130CE` is 0, so the mutation genuinely removes nothing at that entry clock.

**AND TWO MORE OF THE NINE WERE GOING RED FOR THE WRONG REASON** - they passed
the gate's `moved.length > 0` test while contradicting their own declared
signature. This is the finding I would rank first for a reviewer, because a red
switch that reddens on unrelated damage is exactly as useless as one that cannot
redden at all:

| mutation | its declaration | what it actually did (before the fix) | after |
|---|---|---|---|
| `upload-subtracts-shake` | "Must move bgx/bgy on **exactly the boss's 42 shake frames and NOTHING else**" | RED on **9 columns**, first `b012@lf2965` - the corruption, 8,958 frames before the shake | **RED on 2 columns: `bgx=42 bgy=35`, first `bgx@lf11923`** - the 42 shake frames, exactly as declared |
| `commit-the-fraction` | "Must move `b012` and `b034` **ONLY** - if it moves the clock, the columns are not independent" | RED on **9 columns** including `b016`/`b038`/`b03c`/`d18a`/`d18c` | **RED on 3: `b012=9673 b034=9673 bgx=9670`**, first `b012@lf2379` (`bgx` is `b012 >> 6`) |

**FAILURE 4** (`--break no-fast-forward` on the attract entry) failed only
because the clean baseline it runs first was red; the mutation itself was
already reddening 6 columns from lf2637.

### 2.1 THE STAGE TITLES WERE ASSERTING NUMBERS THE STAGES HAD NOT PRODUCED

Worth recording on its own. The stage is named
`scroll program: the port vs the whole of stage 1 (10,431 frames)`. Since the
producer landed it compared **1,633** frames and stopped on a throw. The name
said 10,431 and the run said 1,633 and nothing reconciled the two. It now
compares 10,431.

---

## 3. WHEN IT BROKE, AND WHY "SINCE W22" IS WRONG

The inherited claim (W29, W30, W31 all repeat it) is "failing since W22 and
nobody owns it". Measured from the log rather than quoted:

```
git log --follow -- games/ddpdoj/tools/scrollportgate.mjs
  4766bae  The scroll was never frozen, and the chain timer decrements last
  acd39f0  DaiOuJou W13: the whole level scrolls live ...

git log -S "B2_COUNT" -- games/ddpdoj/src/background.js
  1dab88c  feat(ddpdoj): W18 port the 13 stage-1 background elements
```

`1dab88c` is **99 commits back from HEAD** and `4766bae` is **118** - so the
gate's last edit is OLDER than the commit that made the background object a
bucket-2 producer. **The gate went red when W18's elements landed, and the gate
was never revisited.** W22 is where somebody first wrote it down, not where it
started.

**I did not check out `1dab88c` and run it.** What I did instead is stronger and
is in the tree: the new `no-counter-clear` mutation is precisely "the harness as
it was", and it reproduces the failure to the frame and to the value -
`first b012@lf2965` on the wave-17 corpus, `first b012@lf3701` on the attract
entry. The producer alone is sufficient; nothing between W18 and W31 is
implicated.

---

## 4. THE FIX

`tools/scrollportgate.mjs`, inside the per-frame loop, **before** the IRQ6
upload:

```js
// 0. main-loop call #4's TAIL, $23D70C..$23D71C: the thirty staging
//    counters $80AFC0..$80AFFB are zeroed once per frame.
if (mutate !== 'no-counter-clear') resetSpriteQueueCounters(ram);
```

`resetSpriteQueueCounters` is not new - `src/displaylist.js` has exported it
since W11 with the comment *"$23D70C..$23D71C on its own"*, and the PRODUCT
(`src/main.js`) has always run call #4 whole, which is why **the page was never
affected: this was only ever a defect of one gate**. `tools/w18gate.mjs`, W18's
own gate, drains bucket 2 by hand at its line 150 - so W18 knew, and the
knowledge did not reach the scroll gate.

On the board call #4 runs at the END of the frame, after the objects have
staged. Clearing at the top of the next one is the same thing and leaves the
sample point where the TSV took it.

**NOTHING WAS DISABLED, SKIPPED, NARROWED OR LOOSENED.** The compared column
sets are unchanged (12 and 9), the windows are unchanged (both still end at the
same `$8130D2` rising edge / clock reset), no comparison was relaxed, and the
number of frames compared went **UP**, 1,633 → 10,431 and 1,364 → 1,364. The
only additions are a board step the harness was missing and one more red switch.

### 4.1 THE RESULT

```
node tools/scrollportgate.mjs tools/oracle/out/w17-stage1-invuln-p2.tsv
  FRAMES 10431 compared (lf1621..12051), window ended at lf12052: $8130D2 rose
  COLS   12: d0ce d18a d18c b012 b016 b034 b038 b03c scr0 scr1 bgx bgy
  RESULT 0 DIVERGENT FRAMES on 12 columns over 10431 logic frames

node tools/scrollportgate.mjs tools/oracle/out/bg-attract.tsv --entry 0x38 --k 2636
  FRAMES 1364 compared (lf2637..4000)
  COLS   9: d0ce d18a d18c b012 b016 b034 b038 bgx bgy
  RESULT 0 DIVERGENT FRAMES on 9 columns over 1364 logic frames
```

10,431 is the number `scrollgate.py`'s Python model has reported since W17 and
the number this stage's own title has claimed all along. The two independent
translations of `$2612A0`/`$262062`/`$261F76`/`$240B94` now agree with the board
over the same window, which is the thing W13 set out to be worth having.

---

## 5. COVERAGE - TABLE ENTRIES, NOT FRAMES

The old gate stopped at lf3254 and therefore never dispatched most of the
script. Because "10,431 frames" is not a coverage number
(`docs/knowledge/10`), the gate now reports the unit that is one. `src/
background.js` gained an optional `ctx.scrollRecord` hook at `$262084` - the
same shape as the existing `scrollEvent`, reporting the record's own ROM address
so a consumer can fold `$26200E`'s replay instead of inflating a dispatch count.

```
COVERAGE 57 DISTINCT script records dispatched (by ROM address, replays folded);
  6 of 7 opcode-table entries at $2620C2 taken:
  $00 SPAWN=6 $04 REPEAT=2 $08 SPEED=32 $0c FREEZE=2 $10 BGELEM=13 $14 CUE=2;
  NOT TAKEN: $18 FLAG
```

**57 of stage 1's 57 records** (HANDOVER §2: "57 stage-1 records of 186 across
ten scripts") - the whole script, dispatched and matched. **6 of the 7 opcodes**
at `$2620C2`; **`$18 FLAG` (`$2621D6`, the `$81B414` power ladder) is never
taken in stage 1** and is transcribed-but-unexercised by this corpus, with one
unit test of its own.

The attract entry, for contrast, dispatches **27 distinct records** and takes
**5 of 7** (no `$14 CUE`, no `$18 FLAG`) - which is what a 1,364-frame window
into the middle of the script should look like, and is why the two corpora are
both in the gate.

Other counts that moved because the window opened:

| | before (blocked at lf3254) | after |
|---|---|---|
| frames compared | 1,633 | **10,431** |
| op-$00 SPAWN events | 18 | **22** |
| op-$10 BGELEM events | 4 | **13** |
| op-$14 CUE events | 0 | **1**, plus the deferred callback firing once |
| map columns written into `$900000` by `$240D76` | 122 | **669** |
| `$813180` external speed push consumed | 0 frames | **1** (lf4379) |

The cue opcode, the deferred callback at `$2620B4`, and the external speed push
`$2612AA` had **never executed in this gate** and now do, with 0 divergent
frames across them.

---

## 6. EVERY CHECK WAS SEEN TO FAIL

### 6.1 THE GATE'S OWN NEW RED SWITCH

`no-counter-clear` was added to `MUTATIONS` with its declaration - *"THIS IS THE
MISREADING THIS GATE ITSELF SHIPPED FOR TEN WAVES"*. Measured, on both corpora:

| corpus | result |
|---|---|
| `w17-stage1-invuln-p2` | **RED on 9 columns**, `first b012@lf2965` |
| `bg-attract` (`--entry 0x38`) | **RED on 8 columns**, `first b012@lf3701` |

and with it in place all ten of the wave-17 corpus's mutations behave as
declared, including the two that had been reddening for the wrong reason (§2).

### 6.2 THE FOUR NEW UNIT TESTS, AND FIVE MUTATIONS

`games/ddpdoj/tests/background.test.js` gained four tests. Mutations applied
byte-exactly in Python with a single-occurrence anchor assertion, the whole
suite run, the file restored, sha256 verified identical **both ways after every
one** (`src/background.js` `3a79aedbff44bde1`).

| # | mutation | result |
|---|---|---|
| M1 | `$23DF4E` dropped - the bucket-2 counter is never stepped | RED - 2 |
| M2 | `$23DF4A`/`$23DF4C` - `d3` and `d4` written in the other order | RED - 1, alone |
| M3 | `$23DF2A`'s `lea` reads bucket 1's buffer `$805104` | RED - 2 |
| M4 | the `$262084` hook reports the cursor, not the record address | RED - 1, alone |
| M5 | the hook's script number: `d6`'s sense inverted | RED - 1, alone |

**5 mutations, 5 RED, no survivors.**

Two shapes were designed out of these tests on purpose, both because this
project keeps re-finding them:

- **The overrun test does not seed its own answer.** Its load-bearing assertion
  is `assert.equal(B2_BASE + 0x5340 + 8, CAM.bgId)` - the ADDRESS arithmetic -
  and it runs *before* anything executes. It then runs **two identical games
  that differ in one word of setup** (counter 0 vs counter `$5340`) and asserts
  the difference is confined to the high word of `$80B012`, so it cannot pass by
  agreeing with itself about where the camera is.
- **`d3` and `d4` are given DIFFERENT fixture values** (`$1690` and `$13`) so a
  swap of the two `move.w`s in `$23DF2A` reddens it. M2 is that mutation and it
  goes red.

### 6.3 UNIT TESTS

**479 pass, 0 fail, 0 SKIPPED** (was 475 before this wave; 4 new).

---

## 7. WHAT I COULD NOT DETERMINE

- **Whether the `$18 FLAG` opcode is ever taken anywhere in the game.** It is
  transcribed (`$2621D6`, the four `$81B414` rungs) and has a unit test, and
  neither corpus in this gate dispatches a record carrying it. Measurement
  proves presence; I did not read every stage's script out of the ROM to prove
  absence, and I am not claiming it.
- **The `rng` drift at lf2955** (W30/W31's open item) is untouched by this wave.
  It is a `fly-around` column, not a scroll-gate one; nothing here bears on it.
  Noting only that the coincidence of "lf2955" and "lf2965" is a coincidence:
  they are different corpora, different columns and different mechanisms, and
  the lf2965 one is now fully explained.
- **Whether any OTHER harness in the tree runs a producer with no consumer.** I
  checked the three files that drive `makeBackground`/`backgroundFrame`
  (`tools/scrollportgate.mjs`, `tools/w18gate.mjs`, `tests/background.test.js`)
  and `src/main.js`; `w18gate.mjs` clears bucket 2 by hand and `main.js` runs
  call #4 whole. I did NOT audit the other twenty-odd gates for the same shape
  against other buckets.
- **Anything about the board.** No MAME was run this wave. Every number above is
  the port replayed against TSVs already on disk, or the ROM listing.
- **`--break all` on the ATTRACT corpus** reports 4 of the 11 mutations still
  green (`loop-word-as-iterations`, `len-not-lenplus1`, `reload-lenplus1`,
  `freeze-stops-the-scroll`). **That is not one of the four gate stages** - the
  gate runs only `no-fast-forward` there - and it is expected: a 1,364-frame
  window that takes 5 of 7 opcodes cannot exercise the repeat/freeze arms the
  wave-17 corpus covers. Recorded because a later wave that widens that stage
  will meet it.

---

## 8. WHAT THIS WAVE WROTE

- **`tools/scrollportgate.mjs`** - the missing `$23D70C..$23D71C` clear; the
  `no-counter-clear` red switch; a `COVERAGE` line reporting distinct records
  and opcode-table entries; ~25 lines of header explaining the mechanism.
- **`src/background.js`** - the optional `ctx.scrollRecord` coverage hook at
  `$262084`. Behaviour-neutral: nothing reads it back and no arm depends on it.
- **`tests/background.test.js`** - four tests (§6.2).
- **`docs/worklog/ddpdoj/32-impl-scroll-red.md`** - this file.

No ROM window was added or widened, so `export-web.mjs` did not need re-running
(W30 §7.3's trap does not apply).

## LOG (appended as findings arrive)

- opened.
- baseline re-measured on the untouched tree: 45 passed / 4 failed / 0 SKIPPED,
  the four being exactly the scroll-program stages.
- failure 1 characterised: `b012` first at **lf2965, port `$00133940` board
  `$00033940`**, and the run BLOCKED at lf3254 on `$80100023` - the corrupted
  `$80B016` read back as a pointer.
- the writer NAMED with a write watch: `elemStage` (`$23DF2A`), not the camera.
- root cause: `$80AFC4` reached `$5340` because the harness never runs call #4's
  tail `$23D70C`. **A harness artefact, not a port defect.**
- failure 3 is the same defect at lf3701 on the attract entry; failures 2 and 4
  are consequences of 1 and 3.
- **and two of the nine red switches had been reddening for the WRONG REASON** -
  `upload-subtracts-shake` and `commit-the-fraction` both contradicted their own
  declared signatures while still "passing".
- fixed; **10,431 of 10,431 frames, 0 of 12 columns divergent**, and
  **1,364 of 1,364, 0 of 9** on the attract entry.
- `git log` says the gate's last edit is 19 commits OLDER than the commit that
  made the background object a bucket-2 producer: **it broke at W18, not W22.**
- coverage reported as table entries: **57 of stage 1's 57 script records, 6 of
  7 opcodes at `$2620C2`**; `$18 FLAG` not taken.
- 5 mutations, 5 RED, `src/background.js` byte-identical after every one.
- unit tests 475 -> **479 pass, 0 fail, 0 SKIPPED**.
- a line-ending accident of my own, caught by `git show --stat` and fixed in its
  own commit: a Python text-mode write on Windows turned `tests/background.test
  .js` from LF to CRLF and a 105-line addition into a 1,325-line diff.
  `git diff --ignore-cr-at-eol` settled it in one command, exactly as HANDOVER
  §10 says. Content was never touched.
- **THE FULL GATE: `VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED`**
  (was 45/4/0). Nothing else moved: the 45 that passed before still pass, and
  the four that changed are the four this wave owned.
- **A SKIP APPEARED AND WAS CHASED, NOT TOLERATED** (§9): the same
  `movement.test.js` one W29 and W31 hit. Regenerated; 479/0/**0**.

---

## 9. THE RECURRING SKIP, AND THE INHERITED EXPLANATION IS UNPROVEN

`movement.test.js`'s W24 stream inventory skipped again during this wave, for
the third wave running:

```
ok 19 - the 163 stage-1 streams: no run-off-end; EXIT streams EXIT
   # SKIP the gitignored W24 dump is absent
   (games/ddpdoj/assets/w24-movement/stage1-streams.json)
```

Fixed the same way (`python games/ddpdoj/tools/oracle/w24streams.py`, **from the
REPO ROOT** - its paths are repo-relative), and the suite is back to 479 pass /
0 fail / **0 SKIPPED**.

**But W29's and W31's attribution - "deleted by a concurrent `pgm.py check`" -
is not something I could confirm, and I looked.** A grep for `rmtree` / `unlink`
/ `os.remove` / `rmSync` across `games/ddpdoj/tools/`, `games/ddpdoj/tools/
oracle/` and the repo-root `tools/` finds **no site that removes anything under
`games/ddpdoj/assets/`**; the only `rmtree` in `tools/assets.py` targets
`rip/rom`, and `pgm.py`'s five all target `rip/` or `out/` subdirectories. So
the mechanism is still unidentified and the inherited sentence should not be
quoted as measured. **I could not reach it; what I tried is the grep above and a
listing of `games/ddpdoj/assets/` before and after.** The regeneration command
is right whatever the cause.

status: DONE
