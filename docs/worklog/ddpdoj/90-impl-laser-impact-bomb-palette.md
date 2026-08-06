# 90 -- IMPL: the laser's impact effect, and what colour the bomb really is

status: **DONE** -- §0 refuses the brief's explanation of item 2 and names two
more lying comments, §1 is item 1 with before/after, **§1.7 is the one section a
reviewer should read first** (this wave turned two green gates red and
re-baselined them), §2 is item 2 and it is a MEASUREMENT AND A REFUSAL rather
than a fix, §3 says which bar condition each item met, §4 is what is still
wrong.

started: 2026-08-06. wave: 90. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree. Anything from another
document is `[cited]` and named.

inputs read in full: `86-impl-fighter-death-black-terrain.md`,
`83-NOTE-censored-census-and-the-sim-server.md`,
`39-OWNER-visible-play-before-sound.md`, `games/ddpdoj/src/render/capture.js`,
`games/ddpdoj/src/spark.js`, `games/ddpdoj/src/web/app.js`.

files written: `games/ddpdoj/src/spark.js`, `games/ddpdoj/src/laser.js`,
`games/ddpdoj/src/main.js`, `games/ddpdoj/src/bomb.js`,
`games/ddpdoj/src/web/app.js`, `games/ddpdoj/src/web/assets.js`,
`games/ddpdoj/tools/export-tables.py`, `games/ddpdoj/tools/export-web.mjs`,
`games/ddpdoj/tools/webgate.mjs`, `games/ddpdoj/tests/w90impact.test.js` (new),
and this worklog. Nothing ROM-derived is committed; `assets/` is gitignored and
every probe is in `.scratch/w90/`, which is too. **One web server was started
and it was killed by process and by port before finishing** (§5).

---

## 0. THE PREMISE, CHECKED FIRST -- and item 2's explanation is REFUSED

| the brief says | `[M]` verdict |
|---|---|
| item 1: "`$289FC0`, the laser's impact effect, is still unported ... the shot has pool E's impact spark, the laser's equivalent has no code" | **TRUE**, and it is `[cited: W86 §6.3]`'s own closing line. `[M]` 1,790 counted notes in 6,500 steps and **zero records** |
| item 1: "read both ends of it and follow the fall-through, not the label" | **RIGHT, AND IT IS THE WHOLE SHAPE OF THE WAVE.** `[M]` `$289FC0` is SEVEN INSTRUCTIONS and ends `bra $28A060`. The work is at the other end: it passes KIND 0, whose fill tail `$28A232[0]` = `$28A252` **W65 already transcribed for the laser bomb**. What was missing is one ARM inside it (§1.1) |
| item 2 (a): "four palette entries, bank 21 pens 0 to 3, are ANIMATED ... a bomb whose colours cycle would draw with whatever the recording froze, which is exactly how bright orange becomes flat grey" | **REFUTED, and both of its numbers are exactly right.** `[M]` 1020 of 1024 entries agree and the four that differ ARE bank 21 pens 0..3. **And the bomb's bank is 6, and the shipped block is the BACKGROUND palette.** §2 |
| item 2 (b): "the translucency may be authentic and it is not your call" | **TRUE, and it is MEASURED AND LEFT ALONE.** §2.5. `[M]` the LASER bomb draws on EVERY frame; the ORDINARY bomb's FADE phase draws on ALTERNATE frames |

### 0.1 AND A COMMENT THAT LIED, WHICH MAKES EIGHT AND NINE

`docs/knowledge/02-traps.md`'s standing count was seven. This wave found two
more, and one of them is in the file the brief sent me to read.

* **`src/spark.js:319` called `$28A2D6` "the eight-word table".** `[M]` It is
  **FIVE** words. Both ends are the cartridge's: the power word `$810408` is
  `+= 2, refuse at 8` (`$252C96`), so 0/2/4/6/8 is its whole domain; and
  `[M] $28A232[1]` -- **entry 1 of the cartridge's own fill dispatch** -- is
  `$28A2E0`, which is `addq.w #$6,A0 / rts`, the NULL fill tail. The sixth
  "word" is an instruction the ROM's own table names as code.
* **`src/bomb.js:101` said "bucket 13 has no harvested sprite shard ... the
  records are there and countable; the picture is not."** `[M]` **FALSE SINCE
  W66**: `tools/export-web.mjs BOMB_SHARD = 13` ships 218 streams and 0 of
  3,368 bucket-13 records on a laser bomb lack art. **THE BOMB DRAWS.** It was
  true when it was written and nobody re-measured, which is `86-impl §0.2`
  exactly one file over.

Both are corrected in place, with the old text quoted so the correction is
legible rather than silent.

### 0.2 A TRAP THAT WOULD HAVE SHIPPED SILENTLY

`[M]` **`src/laser.js`'s `BEAM[].d7` is 1 for P1. `$289FC0`'s D7 is 0 for P1.**
They are inverted, they meet at one call site, and D7 is used TWICE -- for the
pool half at the head and for the POWER WORD at `$28A28C`. Passing `b.d7`
through would have given P1's beam P2's power step and P2's thirty pool slots,
and **no count of records would have moved.** The port now names the head BY
ADDRESS and `tests/w90impact.test.js` W90/1 asserts the pool half and the power
word together on both heads with the two power words set to different values.

---

## 1. ITEM 1 -- `$289FC0`/`$289FDA`, AND THE LASER CONNECTS

### 1.1 What it is, both ends

`[M]` `python tools/oracle/w27disasm.py 289FC0 289FF4`:

```
[M] 289fc0  movem.l D0-D7/A0-A6,-(A7)
[M] 289fc4  moveq #$0,D1          ONE record ($289F96 says #$1 -- TWO)
[M] 289fc6  lea ($28A506,PC),A2   the template, an IMMEDIATE, not a table
[M] 289fcc  moveq #$0,D0          KIND 0 -> fill tail $28A252, W65's
[M] 289fce  lea $81D394,A0        <- THE POOL HALF  } the only two
[M] 289fd4  moveq #$0,D7          <- THE PLAYER     } fields that differ
[M] 289fd6  bra $28A060           the shared tail
```

`$289FDA` is the same with `lea $81D790` and `moveq #$1,D7`. **There is no
`$813098` gate** (`$289F54` has one), and there is no gate of any kind inside:
everything that decides whether the beam flashes is at the CALL SITE.

**THE OTHER END, and it is the wave.** `$28A252`'s D7 fork:

```
[M] 28a288  tst.w D7 / bmi $28A2A8     <- $289FF4 sets D7 := $FFFF. W65's arm.
[M] 28a28c  beq $28A296                <- $289FC0 sets D7 := 0
[M] 28a28e  move.w $81046A,D1          <- $289FDA sets D7 := 1  (P2's POWER)
[M] 28a296  move.w $810408,D1          <- ...P1's
[M] 28a29c  lea $28A2D6,A2 / adda.w D1,A2 / move.w (A2),D0 / bra $28A2C0
```

So the impact effect's speed is `$28A2D6[power]` = `[M]` **32 / 64 / 96 / 128 /
176, one per power step**, and the arm **JUMPS `$28A2A8..$28A2BC`** -- the
bomb's `move.b D3,(-$11,A0)` partial overwrite of rec+$0F never happens to an
impact spark. `[M]` D1 is the ANGLE again at `$28A2C0` (`move.w (A7)+,D1` pops
`$28A274`'s push), so the power lives in its own variable; reusing it would fly
every spark the same way.

`[M]` **Every extent closes EXACTLY**, which is what makes this a geometry:

```
[M] $28A506 + $16 == $28A51C     the template ABUTS the list its own +$10 names
[M] $28A51C + 36*4 == $28A5AC    ...and the list abuts W53's template 0
[M] template +$0C low word = $008C -> 36 longwords.  $28A160 steps it -4
[M] the 36 are $22C860 down to $22C6BC, step $C, DESCENDING
[M] $28A2D6 + 10 == $28A2E0 == fill dispatch $28A232[1] -- CODE
```

Three ROM windows now abut: `$28A464..$28A506..$28A5AC..$28AB86`.

### 1.2 The result, before and after

`[M]` `.scratch/w90/impact.mjs`, 6,500 steps from the shipped seed over the
SHIPPED bundle with all 17 sprite shards fetched, `$810424` poked, measured by
swapping `src/spark.js`, `src/laser.js` and `src/main.js` for `git show HEAD:`
and back -- same bundle, same input:

| | LASER HELD, before | after | SHOT TAPPED |
|---|---:|---:|---:|
| `$811F32` beam-live frames | 3,576 | 3,477 | **0** |
| **`$289FC0`/`$289FDA` ENTRIES** | **0** (1,790 notes) | **1,740** | **0** |
| **pool-E records with impact art** | **0** | **58,240** | 0 |
| ...over distinct streams | 0 | **35** | 0 |
| ...with NO ART | 0 | **0** | 0 |
| first at step | -- | 31 | -- |

**`[M]` 35 DISTINCT, NOT 36, AND IT IS A PREDICTION RATHER THAN A COUNT.**
`$28A15C` reads the cursor BEFORE `$28A160 subq.w #4` and `$28A164 bcs` frees
the slot on the borrow, so a record seeded at `$8C` walks list entries 35..1 and
**never entry 0** (`$22C860`). It is harvested anyway, exactly as W53's row
harvests its own unreachable entry 0, because trimming would make the list's
length a consequence of a control-flow argument instead of the template's field.

**THE TAPPED CONTROL IS THE DISCRIMINATOR.** `[M]` with the shot tapped the beam
is never up and the effect is entered **zero** times. That is the owner's "the
laser shoots through them, the normal shot hits them" as an experiment: the shot
has had pool E's spark since W53 and the beam had nothing.

### 1.3 WHAT "SOMETIMES" TRACKS -- and it is BOTH, measured

The brief asked whether it is the power step, the frame phase, or the target.

**1. THE FRAME PHASE, and it is STRICT.** The call site's middle gate is
`$25504E tst.w $80390C`, the per-frame alternation word this port already uses
in eleven other places. `[M]` over 6,500 steps:

```
[M] $80390C at entry: NON-ZERO 1740   ZERO 0      <- P1's block, and $2550D8
                                                     gives P2 the other half
[M] frames with an entry            1740
[M] ...ADJACENT to the previous one    0          <- STRICT ALTERNATION
[M] 1,740 entries / 3,477 beam-live frames      = 50.04 %
```

**The effect fires on at most every other frame, and on exactly half of them.
That is the owner's "sometimes", it is the cartridge's own arithmetic, and it is
not tuned here.** `webgate`'s new stage asserts `ADJACENT == 0` so that a future
wave which "fixes" the flicker by spawning every frame reddens instead of
looking better.

**2. THE POWER STEP, and it scales the effect.** `[M]` `$28A2D6[power]` is the
SECOND `$241812` call's speed, so a stronger laser throws its sparks further:

```
[M] by POWER word $810408 over 6,500 steps:  pw0=370  pw2=690  pw4=680
[M] the five speeds:  32 / 64 / 96 / 128 / 176
```

**3. NOT the target.** The effect is spawned by the beam's DRAW off `$811F32`,
not by a collision, so it does not depend on what is hit. `[cited: W86 §3.3]`
measured the OTHER "sometimes" -- the enemy's damage flash `$274830` -- at 1.5 %
of slot-frames; that one is per-hit and this one is per-frame. They are two
different mechanisms and the owner's sentence contains both.

### 1.4 The art

```
[M] sprite shard 8 "spark"    36 streams -> 72        0.8 -> 1.1 KiB gz
[M] total sprite streams   2,130 -> 2,166
[M] boot payload           UNCHANGED (shard 8 is DEFERRED)
```

### 1.5 The checks, and every one seen to fail

**In the exporter** (`check_beam_impact_extents`, new, runs on EVERY export),
nine mutations, each stopping the build with a named message:

```
[M] head $289FC0's D7 0 -> 1     "$289FD4 is $7E00, not `moveq #$1,D7`. D7
                                  picks which power word ($810408 vs $81046A)
                                  indexes $28A2D6, so this is the PLAYER"
[M] head $289FDA's pool half     "$289FE8 is not `lea $81D394.l,A0` --
                                  $289FDA's POOL HALF moved, so its player did"
[M] POWERS gains 10              "$28A2D6 + 10 is $5C48 (23624), which is not a
                                  speed level -- $200D20 has 256 ... reading
                                  past them reads the null fill tail at $28A2E0"
[M] null-tail opcode claim       "$28A2E0 is $5C48 $4E75 and must be $5C4A ..."
[M] list step $C -> $10          "$28A51C[1] is $0022C854, not $22C850"
[M] cursor seed $8C -> $88       "...is $008C, not $0088 ... and 35 is wrong"
[M] caller $255066 -> $255068    "$255068 is not `jsr $289FC0.l`"
[M] template $28A506 -> $28A50A  "$289FC0 names template $28A506, not $28A50A"
[M] list ptr $28A51C -> $28A520  "...the template does not abut it at +$16"
```

**Three of those messages were themselves defective when first written** and are
recorded because the mutation is what found it: they printed a HARDCODED
expected value beside the measured one, so under mutation they read "is $008C,
not $008C". They now name the constant. A red-validation that cannot describe
its own mutation is half a check.

**In `tests/w90impact.test.js`**, seven tests, five mutations of `src/spark.js`:

```
[M] src/spark.js at HEAD                     all 7 RED (the export does not exist)
[M] MUTATION BEAM_IMPACT's two d7 SWAPPED    W90/1 /2 /3 /7 RED
[M] MUTATION the speed indexed by the ANGLE  W90/1 and /2 RED
[M] MUTATION the arm falls through to $28A2BC   W90/4 RED ALONE
[M] MUTATION the power CLAMPED, not thrown   W90/3 RED ALONE
[M] MUTATION template from the pointer table W90/1..6 RED
```

Two assertions deliberately refuse to read their subject through the constant
they test:

* **W90/1 never compares a pool half with a pool half.** It sets the two POWER
  WORDS to different values (4 and 8), spawns from both heads, and asserts the
  slot landed in one half AND that `$241812` was handed the OTHER player's table
  entry never. That is the §0.2 trap, and it is the only assertion that catches it.
* **W90/4 is a difference between two producers, not a value.** The same fixture
  is run through `$289FF4` (the bomb) and `$289FC0`, and rec+$0F must be `$55`
  for one and `2` for the other.

**In `webgate`**, a new stage and its `--break`:

```
[M] PASS: W90 THE LASER'S IMPACT EFFECT -- over 1500 logic frames from the
    shipped seed with fire HELD, the beam is up on 1039 of them (expect 1039)
    and the port ENTERS the effect 520 times (expect 520), first at step 31,
    emitting 17286 records (expect 17286) over 35 distinct images (expect 35 --
    THIRTY-FIVE of the 36 harvested, because $28A164 frees the slot before
    entry 0 is ever read). 17286 DRAWN, 0 pending, 0 with NO ART.
    ADJACENT-FRAME entries 0 (expect 0) and entries on the WRONG $80390C phase
    0 (expect 0).
[M] PASS: W90 --break drop-impact-art -- with $28A51C's 36 streams taken back
    out of the map the SAME 17286 records are emitted (expect 17286 -- the port
    does not change) and 17286 of them are named as MISSING ART, 0 drawn.
[M] SEEN TO FAIL: with src/ reverted to HEAD the stage reports "ENTERS the
    effect 0 times (expect 520) ... 0 records (expect 17286) ... 0 distinct
    (expect 35)" -- **and `beamLive` stays 1039 in BOTH**, which is the control
    that says the BEAM did not change and only the EFFECT did.
```

### 1.6 THE NO-ART CENSUS DID NOT MOVE, AND THAT IS BY CONSTRUCTION

```
[M] .scratch/w86/noart.mjs 6500, the SAME probe and input W86 used:
      records 534,575   drawn 530,558   NO ART 4,017   distinct missing 46
    -- every one of those four IDENTICAL to W86 §2.2's
```

Two reasons, and both are worth having written down:

1. **That census TAPS fire**, so it never raises a beam and never enters
   `$289FC0` at all. It is `86-impl` §2.4's lesson one more time: a window that
   cannot reach the subject reports the true half.
2. **This wave shipped the CODE and the ART in the same commit**, so the 58,240
   new records arrived with pictures already on them. Had the code shipped
   alone, no-art would have risen by 58,240 -- and that is exactly the number
   `--break drop-impact-art` reports (§1.5).

So the answer to "report the new figure" is **4,017, unchanged**, and the
interesting figure is the one beside it.

### 1.6b FOUR GATE NUMBERS MOVED, AND THEY ARE AN RNG SHIFT

Stated rather than quietly re-pinned, because "a number moved and I updated it"
is how W86 §0 describes forty briefs going wrong.

```
[M] webgate W53 shard 8 streams        36 -> 72     (the new art)
[M] webgate W58 records            12,769 -> 12,805 (+36, +0.28 %)
[M] webgate W66 laser-bomb records  5,906 -> 5,948  (+42, +0.7 %)
```

`[M]` W53's three PORT-side fields (9,271 records, 35 distinct, first at 24) did
**not** move, because that window taps fire and never raises a beam -- so that
stage is structurally blind to what this wave shipped, which is why the W90
stage exists. W58 and W66 hold fire, so from this wave the impact effect spawns,
and **its fill draws FOUR times from the shared `$803917` counter**
(`$242FFC`, `$242EC2`, `$28AB86`, `$242E24`). Every later draw steps
differently.

**That is the port moving TOWARD the board, not away from it.** Those four
`addq.b #1,$803917` sites execute on the cartridge every time the effect spawns
and until this wave the port skipped them -- the identical defect
`src/spark.js`'s own header records W53 fixing for `$289F54` ("every draw after
a shot hit was one step out"). W66 also filters on shard 13 and the new art is
shard 8, so not one of its 42 is an impact spark. `distinct` and `first` held on
both.

### 1.7 **AND IT TURNED TWO `pgm.py check` GATES RED. I RE-BASELINED THEM AND
### THIS SECTION IS WHY.**

**This is the most questionable thing this wave did and it gets its own
section rather than a line in a table.**

`[M]` `pgm.py check` went **72 passed / 2 failed** to **70 / 4**. The brief said
do not add a third. I added two, and they are:

```
[M] midboss DEATH: the scroll release, type $1C and its 207 map longwords
[M] STAGE 1 ENDS: the boss timeout, $242952, and the rebuild
```

`[M]` **Both are GREEN at HEAD and RED with this wave's `src/` -- I ran them on
the reverted tree to establish that, rather than assuming it.** Both scenarios
HOLD FIRE, so both are the §1.6b RNG shift.

**WHAT MOVED, and it is a coherent phase shift and nothing else:**

```
[M] midbossgate    the midboss dies        3830 -> 3838   +8
                   the scroll push         3830 -> 3838   +8
                   the crawl                156 -> 164    +8
                   type $1C spawns         3767 -> 3775   +8
                   type $1C frees          4271 -> 4277   +6  (DISTANCE-clocked
                                                       by $26C20C, not frames)
[M] w62stageendgate  ALL EIGHT FRAMES MOVED BY EXACTLY +6, over an
                   11,000-frame span: 7871/18669/19143/19144/19147/19216/
                   19217 -> 7877/18675/19149/19150/19153/19222/19223
[M] ...and the DURATIONS did not move at all: `timeoutSteps` 10,799 and
    `animFrames` 474 are unchanged, as is `timeoutStart` $2A2F, which is
    asserted from the CARTRIDGE rather than from a previous run.
```

**A corrupted run does not move a causal chain coherently and leave every
duration intact.** The phase shifted; the mechanism did not.

**WHY RE-BASELINING IS ALLOWED HERE, and the test I applied.** The question is
only ever "is this number the BOARD's or the PORT's?", and both files answer it
themselves, unprompted:

> `midbossgate.mjs` lines 28-29: *"no MAME run in this repo has ever killed the
> midboss either, so there is no board column to compare against and this file
> does not pretend there is."* Line 37: *"EVERY EXPECTED NUMBER BELOW IS [M]
> MEASURED ON THE FINAL W57 TREE."*
>
> `w62stageendgate.mjs` line 26: *"IT IS PORT-VS-LISTING, NOT A BOARD
> COMPARISON."*

**They are port-side regression baselines, and re-pinning one to the current
tree is what it is for.** Had either number been the board's, the correct action
would have been to stop and report a divergence, and I would have. `seedcmp` --
which IS the board comparison -- is byte-identical across this wave (§3.3), and
`timeoutStart`, the one cartridge-derived constant in either gate, did not move.

**The reason is written into both gate files**, quoting the old values, so the
next reader sees a re-baseline and not a number that was always 3,838.

**What I am NOT claiming:** that the port's new frame is more correct than its
old one. Nothing in this repo can say. What I am claiming is narrower and
checkable -- the port now executes four `addq.b #1,$803917` sites that the
cartridge executes and the port previously skipped, and the frames moved as a
consequence.

---

## 2. ITEM 2 -- THE BOMB IS GREY, AND IT IS NOT THE ANIMATED ENTRIES

**This item is a MEASUREMENT AND A REFUSAL. No colour was changed.**

### 2.1 The bomb's bank is 6, and the brief's explanation is about bank 21

```
[M] bomb display-list records, LASER bomb   3,368 over 132 live frames
[M] ...colour bank                          6, on 3,368 of 3,368 (100.00 %)
[M] bomb records, ORDINARY bomb                58 over 108 live frames
[M] ...colour bank                          6, on 58 of 58 (100.00 %)
[M] ...records lacking art                  0 of 3,368 and 0 of 58
```

`[M]` And the cartridge says 6 too, independently of any run: `$249A62 jsr
$260852` (ordinary) and `$249A80 jsr $26085C` (laser) both fall into
`$260862 move.w #$6,D0 / jmp $24150A`.

**So the brief's candidate (a) does not apply.** Bank 21 pens 0..3 are not the
bomb's, and `[M]` both of its numbers are exactly right anyway: 1020 of 1024
entries agree with the board and the four that differ ARE bank 21 pens 0..3.

### 2.2 AND THE SHIPPED PALETTE IS THE BACKGROUND'S -- the sprite half has NO
### CARTRIDGE SOURCE AT ALL

This is the finding, and it makes `src/web/app.js`'s paragraph misleading while
every number in it is true.

`[M]` `$227E58` is 1,024 words and `$2415E8` uploads it into palette RAM
**`$400..$7FF`, the BACKGROUND third** -- `tools/export-web.mjs:1900` and
`src/web/assets.js`'s own check both say so, and the exported file is even
called `bg.pal.u16`. **It contains no sprite entry.** The bomb is a sprite in
bank 6 = palette words 192..223, inside `$000..$3FF`.

**So every SPRITE colour on the page -- the ship, the pods, every enemy, every
shot, the bomb -- comes from one frozen instant of `capture.bin` and from
nothing else, and the port models no palette RAM whatsoever.** A reader acting
on the old paragraph would have hunted four wrong entries and never found the
cause of a wrong sprite colour. Corrected in `src/web/app.js` and
`src/web/assets.js`, with the old text quoted.

### 2.3 WHAT THE GREY ACTUALLY IS, and the ROM has the orange in it

`[M]` `$24150A` is ten instructions:

```
[M] 24150a  movem.l D0/A0-A1,-(A7)
[M] 24150e  lea $80E886,A1
[M] 241514  lsl.w #$6,D0 / adda.w D0,A1        <- D0*64: ONE 32-entry bank
[M] 241518  moveq #$F,D0 / move.l (A0)+,(A1)+ / dbra     16 longs = 64 bytes
[M] 241520  move.w #$1,$80FA66                 <- THE DIRTY FLAG
```

so `D0 = 6` IS the bank number and `$80E886 + 6*64 = $80E886+$180` is where the
bomb's palette goes. `[M]` **The source blocks are in the cartridge and they are
orange:**

```
[M] $222A78 (ordinary) and $222AB8 (laser), first eight words, IDENTICAL:
      FFFF FFB6 FF91 FF6C FF48 FEE7 FE87 FE04
    = (255,255,255) (255,238,180) (255,230,139) (255,222,98)
      (255,214, 57) (255,189, 57) (255,164, 57) (255,131,33)
```

**White, then pale yellow, then gold, then orange. That is the owner's "bright
orange with yellowish highlights", read straight out of the ROM.**

`[M]` And `$24150A` is a **COUNTED NOTE in seven files** and has never executed.
So bank 6 keeps whatever the capture froze, and `[M]` the shipped seed's own
`$80E886 + $180` reads `5EF3 5EF3 5EF3 5EEF 5EEE 5EAE ...` = **(189,189,156)
(189,189,156) (189,189,123) ...**, a desaturated khaki ramp with R = G. `[M]`
Across 538 board dumps the only users of bank 6 are `$3326A8`/`$3329AC`, the
**stage-title card**. The bomb is being drawn through the title screen's sepia.

`[M]` **Measured on the live canvas** (§3.1's browser run), the bomb's brightest
decile over three bombs: `(199,198,164)` `(219,204,148)` `(228,221,185)`,
**chroma 49 / 74 / 60 with R approximately equal to G**. Bright orange is
R much greater than G. "Grey" is the correct word and now it is a number.

### 2.4 WHY THIS WAVE DID NOT FIX IT

`[M]` The fix is not a line, it is a subsystem, and three of its four parts do
not exist:

1. export `$222A78`/`$222AB8` -- **neither is inside any exported ROM window**;
2. port `$24150A` + `$260852`/`$26085C` -- ten instructions, easy;
3. the staging area `$80E886` -- **this one is already there**, and `[M]` the
   shipped seed carries all 32 board banks in it (1,861 of 2,048 bytes
   non-zero), which is what makes the whole thing tractable;
4. **make the page draw sprites from the port's palette instead of the
   capture's** -- and this is the one that is not bounded. It changes the colour
   of EVERY sprite on the screen at once, and every other `$24150A` site
   (`src/hud.js` five, `src/initbody.js` three, `src/boss.js` five,
   `src/background.js`) is equally unported, so a half-ported palette would make
   the picture worse in exchange for making the bomb right.

**Hand-patching bank 6 with the ROM's eight words would have made the bomb
orange in one afternoon and it would have been a fabricated palette**, which is
`docs/knowledge/08`'s rule and the brief's own ("prefer broken-and-declared to
fabricated"; "a seventh `PUBLISH_VERBATIM` entry is an OWNER DECISION -- write
it up and stop"). This is written up and stopped, with every address and every
byte, so the next wave is a port rather than a hunt.

### 2.5 DOES THE BOMB ALTERNATE FRAMES? MEASURED, AND NOT CHANGED

`src/render/capture.js` lines 27..85 governs: on this hardware alternate-frame
drawing is how transparency was faked, `[cited: recon 77]` the PGM hardware has
no blender anywhere, and **the decision to change it is the owner's**.

```
[M] LASER BOMB ($255FE2), 132 live frames:  present 131 of 132 -- EVERY FRAME
      four appearance classes (c6 1x64, 5x96, 7x96, 8x112), each 131 of 132
      NO parity gate anywhere in $256120 / $2561AA
[M] ORDINARY BOMB ($255E3E), 108 live frames: present 57 of 108
      phase 0 ($255E9C, 18x192)     7 of  7   EVERY FRAME
      phase 1 THE FADE (17x192)    46 of 93   ALTERNATE -- gate $255F1C
                                              `tst.w $80390C / bne rts`
      phase 2 THE BLINK             4 of  8   ALTERNATE, and the PHASE INVERTS
                                              at the 1->2 boundary ($255F7E
                                              `bchg #$1,(A6)`)
```

**So the owner's "a bit translucent" is real, it is the ORDINARY bomb's fade,
and it is a 272x192 sprite drawn on every second frame at 59.186 Hz -- the
board's own no-blender transparency.** The laser bomb, which is what the
screenshots show, does NOT alternate: its washed-out look is the palette alone.

**NOTHING HERE WAS CHANGED.** If the alternation is to become half-alpha, that
is an owner decision with Batman's water dither as precedent.

---

## 3. **THE BAR -- WHICH CONDITIONS I DELIVERED, PER ITEM**

### 3.1 ITEM 1, `$289FC0`/`$289FDA`: **CONDITION 1 MET. CONDITION 2 NOT MET.**

**FEATURE COMPLETE: MET.** `[M]` `python .scratch/w90/browser.py 8792 95` -- a
`http.server` over the working tree, the real
`C:\Program Files\Google\Chrome\Application\chrome.exe` driven by the
`playwright` package that was already installed, fire HELD for the whole run and
the ship swept through all four directions. **303 samples.**

```
[M] IMPACT records sampled  1,147 over 35 distinct streams
[M] first on screen         lf2,055, screenshotted automatically at the first
                            frame the condition became true (W81 §5's lesson)
[M] NO ART never named ANY of the 36 impact streams on any of 303 samples
[M] PAGE ERRORS: one 404, and it is the favicon
```

**WHAT I SAW.** `.scratch/w90/w90-laser-impact.png`: the red laser column runs
from the ship to the top of the playfield, and **there are bright yellow-white
bursts at the top of it where it meets the tank column, and another at the
muzzle**. Before this wave that column ended in nothing. **I held the laser
through a group of enemies and watched it flash where it connected.**

**ORACLES PERFECTLY: NOT MET, and it is the same hole W86 named.** `[M]`
`seedcmp --manifest .../w69/stage1-sweep/manifest.json --quiet` is
**byte-identical before and after**: 9 green / 19 red / 43 blocked, 6,750 logic
frames, bucket 2 20,785 records 0 MISSING. That is not evidence the effect is
right; **it is evidence the comparison cannot see it.** The compared columns are
the player, the options, the shots, the scroll and the video counters; **pool E,
bucket 20 and `$803916` are not among them for these segments**, and none of the
71 sweep segments holds the laser long enough to raise a beam. The instrument
that could see it is `tools/boarddl.mjs` against a checkpoint ladder, and
`[cited: W81 §3.1]` the reachable rungs of `stage1-laser-hold` are 29 of 210.
**Item 1 therefore carries W82's weaker claim: transcribed from the listing,
cross-checked against the cartridge at export nine ways, unit-tested with five
mutations, gated in `webgate` with a `--break` and a revert both seen to fail,
driven in a real browser -- and NOT compared against the board.**

### 3.2 ITEM 2, the bomb's colour: **NEITHER CONDITION, BY DESIGN.**

**FEATURE COMPLETE: NOT MET, AND NOT ATTEMPTED.** §2.4. I dropped three bombs in
Chrome and **the bomb is khaki-brown**: `.scratch/w90/w90-bomb1.png` is the
laser bomb as a full-height column from the ship to the top of the screen, right
shape, dusty sepia, exactly the owner's "kinda correct ... a bit translucent and
kinda grey". The cause is identified to the instruction and the byte and it is
**not fixed**.

**ORACLES PERFECTLY: NOT MET, AND THE INSTRUMENT DOES NOT EXIST.** No gate in
this repo compares a PIXEL COLOUR against the board for a sprite; `[cited: W81
§6]` and `[cited: W86 §6.1]` both say so, and W86 handed on an unresolved
black-silhouette question for the same reason. What item 2 delivered is a
diagnosis with the cartridge's own bytes attached, plus two corrected comments.

**Naming the wrong instrument is a first-class result, and so is naming the
wrong subsystem.** The brief's candidate (a) was a real defect in the right
family and the wrong third of the palette.

### 3.3 The gates

```
[M] node --test games/ddpdoj/tests/        1,035 pass, 0 fail, 0 skipped
                                           (1,028 before; +7 w90impact)
[M] node tools/seedcmp.mjs --quiet         9 green / 19 red / 43 blocked,
                                           6,750 logic frames, 0 seedbad,
                                           0 error -- IDENTICAL to W86's
      BUCKET 2: 20,785 records, 0 MISSING, ordered subsequence 6,750/6,750
[M] node tools/webgate.mjs                 GREEN, exit 0, 21 stages
                                           (19 before; +2 W90)
[M] python tools/oracle/pgm.py check       VERDICT: FAILURES -- 72 passed,
                                           2 failed, 0 SKIPPED
      the SAME TWO as W82, W84, W85 and W86, and NEITHER MOVED:
        `segment sweep` (43 blocked + 19 red rungs remain)
        `THE LASER BOMB: $249A80, $255FE2 and $2456A6` (W79 §6.5 filed it as
        a concurrent wave's; W84, W85 and W86 established the same)
      NO THIRD RED -- but it was 70/4 mid-wave and §1.7 is the whole story of
      how it got back, which is the one thing in this document a reviewer
      should read before the numbers.
[M] node tools/build-dist.mjs              GREEN, 6 deliberate exceptions,
                                           NO SEVENTH `PUBLISH_VERBATIM` ENTRY
[M] node tools/publish.mjs --only ddpdoj --dry
      GREEN. build 20260806052815, dist/ 255 files 6,487 KB, rom-leak guard
      251 files checked against 12 ROMs -- clean, six deliberate exceptions
[M] NO ART records, 6,500 steps            4,017 -- UNCHANGED (§1.6)
```

`[M]` **The 36 new streams did NOT need a seventh `PUBLISH_VERBATIM` entry.**
They went into shard 8, which already holds 36 streams from a different table,
so the packed buffer matches nothing contiguous in any ROM.

---

## 4. WHAT IS STILL WRONG

1. **THE SPRITE PALETTE IS NOT PORTED, and the bomb is grey because of it.**
   §2. Every `$24150A` site in seven files, the staging area `$80E886`, the
   dirty flag `$80FA66`, and the page's own `paletteRgb`. This is the biggest
   owner-visible thing this wave found and it is handed on whole.
2. **`$289F96` is still unported.** The THIRD head that fills pool E from this
   template (`$25485E`, inside the beam's segment driver). `[M]` 4 notes in
   6,500 steps. It allocates TWO records (`moveq #$1,D1`) and picks its half
   from `($1A,A6)`. **Its art shipped with this wave** because it shares
   `$28A506`, so porting it is code only.
3. **Item 1 is not compared against the board.** §3.1.
4. **The ordinary bomb's fade draws on alternate frames.** §2.5. Measured, not
   changed, and it needs an owner decision.
5. **The six black aircraft silhouettes** `[cited: W86 §6.1]` are unresolved and
   this wave did not look at them -- though §2.2 is a new and better candidate
   for them than either of W86's two, since they are shard 9 art with its pixels
   present drawing black, which is what a sprite bank the capture never
   populated would look like.
6. **One input, and a poked one.** Every census here is one route with
   `$810424` held; `docs/knowledge/09` governs. Every count is a floor.

---

## 5. WHAT I TOUCHED, AND WHAT I DID NOT

* `games/ddpdoj/src/spark.js` -- `spawnBeamImpact289FC0`, `BEAM_IMPACT`,
  `$28A252`'s D7 arm, and the "eight-word table" correction.
* `games/ddpdoj/src/laser.js` -- `$255066`/`$2550F0` wired, `BEAM[].impact`.
* `games/ddpdoj/src/main.js` -- `this.beamImpacts`.
* `games/ddpdoj/src/bomb.js` -- the false "it does not draw the bomb" block.
* `games/ddpdoj/src/web/app.js`, `src/web/assets.js` -- the palette paragraphs.
* `games/ddpdoj/tools/export-tables.py` -- two windows, the speed domain,
  `check_beam_impact_extents`.
* `games/ddpdoj/tools/export-web.mjs` -- the `$28A51C` harvest row.
* `games/ddpdoj/tools/webgate.mjs` -- the W90 stage and four re-pins.
* `games/ddpdoj/tests/w90impact.test.js` -- new, 7 tests.

Not touched: `publish.mjs`, `bundlegate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM`, `boarddl.mjs`, `seedcmp.mjs`, `portdiff.mjs`, `src/` (the
Game Boy tree), `games/gradius/`. **No colour, palette or frame cadence was
changed anywhere.**

**THE WEB SERVER.** `.scratch/w90/browser.py` starts a `socketserver` on
127.0.0.1 and calls `httpd.shutdown()` and `httpd.server_close()` before it
exits; the run log prints "server closed" on both runs, and `netstat` shows no
listener on 8791 or 8792.

---

## LOG (appended as findings arrived)

- opened. Read 86, 83, 39, `src/render/capture.js`, `src/spark.js`,
  `src/web/app.js`. Disassembled `$289F54..$28A060`, `$28A252..$28A2F8`,
  `$255030..$255110`, `$24150A`, `$260852` and the tables at `$28A232`,
  `$28A2D6`, `$28A506`, `$28A51C` before writing a line.
- `[M]` §1.1: **`$289FC0` is seven instructions and passes KIND 0**, so its fill
  tail is `$28A252`, which W65 already ported. The wave is ONE ARM.
- `[M]` §0.1: **`$28A2D6` is FIVE words, not the eight `src/spark.js` claimed**,
  and `$28A232[1]` -- the cartridge's own fill dispatch -- is what pins it.
- `[M]` §0.2: **`BEAM[].d7` is 1 for P1 and `$289FC0`'s D7 is 0 for P1.** The
  head is named by address now.
- `[M]` §1.2: **0 records -> 58,240 over 35 distinct streams, 0 with no art**,
  and the tapped control emits none of them.
- `[M]` §1.3: **"SOMETIMES" IS `$80390C`.** 1,740 entries on 3,477 beam-live
  frames (50.04 %) and ZERO adjacent. Plus five speeds, one per power step.
- `[M]` §2.1: **the bomb's bank is 6, not 21** -- so the brief's explanation is
  about a different bank, and both of its numbers are right anyway.
- `[M]` §2.2: **the shipped palette is the BACKGROUND's (`$400..$7FF`). The
  SPRITE palette has no cartridge source in the bundle at all.**
- `[M]` §2.3: **the bomb's real palette is in the ROM and it is orange** --
  `$222A78`/`$222AB8`, `FFFF FFB6 FF91 FF6C FF48 FEE7`. `$24150A` is a counted
  note in seven files, so bank 6 keeps the capture's stage-title sepia.
- `[M]` §2.5: **the LASER bomb draws every frame; the ORDINARY bomb's FADE
  alternates.** Measured, reported, NOT changed.
- `[M]` §0.1: **`src/bomb.js` said the bomb has no shard.** False since W66.
- `[M]` §1.7: **two `pgm.py check` gates went red and I re-baselined them.**
  Both green at HEAD, both HOLD FIRE, +8 and +6 phase shifts with every duration
  intact, and both files say in their own words that they carry no board column.
- `[M]` §3.1: **THE PAGE, IN CHROME.** 1,147 impact records over 35 distinct
  streams across 303 samples, first at lf2,055, and the screenshot has bright
  bursts at the top of the beam. Three bombs dropped: khaki, chroma 49..74.
- `[M]` §3.3: 1,035 tests 0 fail; `pgm.py check` 72/2/0 with the same two;
  webgate GREEN 21 stages; `publish --dry` GREEN; no seventh entry.

status: **DONE**
