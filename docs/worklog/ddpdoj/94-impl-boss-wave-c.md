# 94 -- IMPL: the boss's MOVEMENT LAYER, and the 43 blocked rungs are TWO populations

status: **DONE.**

started: 2026-08-06. wave: 94. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `82-impl-295-family.md`, `85-impl-boss-bucket-trace.md`,
`83-NOTE-censored-census-and-the-sim-server.md`, `48-recon-boss-script.md`,
`39-OWNER-visible-play-before-sound.md`.

---

## 0. THE HEADLINE

`[M]` **The brief's premise is CORRECT in its central claim and stale in its
number.** `$295xxx` is the stage-1 boss; recon 48 tabulated it; wave A shipped
in W62 and wave B's first slice in W82. The 41 entry points W82 measured is
right and I reproduced it independently. **39 unported is now 34** -- W82 and
W85 landed seven of the forty-one between them and nobody had re-counted.

`[M]` **AND THE 43 BLOCKED RUNGS ARE NOT ONE POPULATION.** That is this wave's
finding and it is what note 83's rule produces when you actually apply it:

| population | rungs | entry points its FIRST FRAME needs |
|---|---:|---|
| **the STEADY STATE**, lf12,000..18,750 | **28** | **12**, and every rung is a subset of the same twelve |
| **the ARRIVAL**, lf8,250..11,750 | **15** | those twelve **plus 22 more** |

**Two thirds of the remaining block is ONE closed set of twelve entry points.**
A first-throw census cannot see that and neither could W82's union table, which
reported the total and not the partition.

**THIS IS MORE THAN ONE WAVE AND I SAY SO EARLY, as the brief asks.** Section 3
is the split, with the closure that sizes it. What I shipped is the slice the
other ten of the twelve are all written against.

**SHIPPED:** MAIN scripts **6** and **7** (INIT and STEP, four entry points),
the tail every MAIN entry ends in (`$29314C`), the waypoint draw (`$2933DE`),
the speed ramp (`$293400`), the distance (`$242494`), and the four scheduler
accessors **W62 did not ship** (`$259A18`, `$259A4A`, `$2598C8`, `$2595F2`).

**BAR CONDITIONS: ONE. And 6.2 names the exact instrument that is missing and
why W85's did not solve it for this slice** -- which is the same shape of answer
W82 gave and the brief calls a first-class result.

---

## 1. THE PREMISE, CHECKED -- three corrections, one of them to a brief I was
   handed as fact

**I grepped `src/`, `tools/` and the worklogs before disassembling anything.**

### 1.1 "39 unported" is stale. `[M]` it is 34, and I re-measured the 41 myself

`.scratch/w94/census.py` reads all 72 `*.ram.bin` rungs and resolves, for each,
exactly what `$25962E` would dispatch on its first frame -- slot status words
through the real tables, in the real walk order (A4 -> A0 -> A1 -> A3, then A2),
with `bset.b #$0,(A4)` read as **bit 8 of the word** (W82 §1.4's correction,
which `src/scheduler.js` already had right).

```
[M] RUNGS 72
[M] UNION entry points over all rungs: 41, of which UNPORTED 34
[M] PORTED entry points seen: $292952 $292BFA $292E0A $292E3E $2933C2 $293E04 $2943B0
```

**41 exactly reproduces W82.** The seven ported ones are W82's own five plus
W62's two, so W82's "39 of 41" was true when it was written and has been false
since W82 itself landed. Nobody re-ran it; the brief carried 39 as a live
number. *That is "verified has a shelf life", instance seven, and it cost this
wave nothing because the brief also said to check it.*

### 1.2 **WAVE A DID NOT SHIP THE SCHEDULER. It shipped the WALKS and TEN of the
   twenty-seven accessors.**

The brief says "Wave A (the scheduler) shipped in W62" and W82 §1.3 says the
same. `[M]` `src/scheduler.js` before this wave exported `$2595E8`, `$2598D0`,
`$2598E6`, `$25994A`, `$259962`, `$2599EC`, `$25980C`, `$25983E`, `$2598A2`,
`$259B34`, `$259B7E`, `$259B9E`, `$259BB4` -- and **nothing for table E's start
or its running test**, which recon 48 §1.7 lists as `$259A18` and `$259A4A`.
Table E is the guns. Every gun this boss fires is started through a routine the
port did not have.

**And one of the missing four has a RETURN VALUE the other ten do not.**
`$259A18` hands back A0, and `$2957D2 jsr $259A18` is followed four
instructions later by `$2957D8 move.b $8(a4),$4(a0)` -- F-script 6 writing
parameters into the slot the scheduler just claimed. A primitive that returned a
boolean cannot express that at all, and the gun would fire with whatever the
previous occupant left behind. `[M]` and `$259A18` **does not dedupe**, where
`$259962` (the A3 start) does: ten copies of one E script can run at once, which
is how the fans are built. When the table is full, `$259A3E` returns `$812D18`,
the overflow block, and the start is a **silent drop** -- recon 48 §1.3's rule,
now with a test.

### 1.3 `$2595F2` ALWAYS RETURNS 4, and it is checked against the cartridge

Recon 48 §1.7 measured it; `[M]` I re-read `$2595F2..$25962C` and every one of
the four computed branches falls into `$25962A moveq #$4,D0`, which nothing
branches over. The unit test asserts the constant **and** that the two bytes at
`$25962A` really are `70 04` in the image, so the claim cannot rot away from the
ROM. Three of the boss's scripts call it (`$2956B0`, `$29592A`, `$296602`) and
every one discards an elaborately computed value.

---

## 2. WHAT THE BOSS DOES IN THIS PHASE, and it is the thing the other ten sit on

MAIN 6 (`$2935DE`/`$2935E8`) walks the boss toward the fixed point
**(`$7400`, `$1C00`)** and hands over to MAIN 7 when the distance drops to
`$100`. MAIN 7 (`$293634`/`$293642`) wanders between the **eight waypoints of
`$293694`**, drawing the next one at random the moment it arrives. Both end in
the same tail, `$29314C`, which places the two side parts.

`[M]` **and the two halves agree with each other, which is the reading
validating itself**: all eight waypoints are within `$200` of MAIN 6's own
target on Y and `$800` on X.

```
[M] $293694  [0] $7400,$2200  [1] $7200,$2400  [2] $7600,$1800  [3] $7200,$2200
             [4] $7400,$1400  [5] $7600,$2000  [6] $7600,$1400  [7] $7200,$2000
    $2935E8's target                $7400,$1C00
```

**SIX THINGS THE ADDRESSES DO NOT TELL YOU**, all of them in the source
comments, each with the instruction it stands at:

1. **BOTH INITs FALL THROUGH INTO THEIR STEPs.** `$2935DE` is two instructions
   and `$2935E8` is the next address; `$293634`'s third instruction is
   `bsr.w $2933DE`, **whose `rts` returns to `$293642`, the STEP**. The arming
   frame runs INIT *and then* STEP. A port that ran the INIT alone loses one
   frame of movement every time the phase is entered, forever.
2. **`$29316E`'s RING IS FIVE LONGWORDS AND IT PORTS BACKWARDS EASILY.** Both
   operands of `move.l -(a1),-(a0)` pre-decrement, so the four copies shift the
   history **up** in address and the store afterwards lands at `$81585C`. So
   `$81585C` is this frame's body position and **`$81586C` is the position five
   frames ago** -- and `$81586C` is what the limbs read. Shift it the other way
   and the arms LEAD the body instead of trailing it, with no single field
   saying so, because every value in the ring is a position the body really had.
3. **THE TWO PART BLOCKS ARE NOT SYMMETRIC.** `$29318C addi.w #$80,$24(a6)`
   against `$2931D2 addi.w #$FF80,$64(a6)` -- the left/right mirror. And the two
   shifts on the vector differ (`asl.w #$1` on Y, `asl.w #$2` on X) with a
   constant `#$FD80` on Y alone.
4. **`$242494` SCALES THE Y AXIS TO THREE QUARTERS AND NOT X.** `lsr.w #$2` then
   `sub.w`, with no matching pair on the other side. A port that scaled both, or
   neither, gets a circle where the ROM has a squashed octagon, and MAIN 6 hands
   over in the wrong place.
5. **`$2933DE` MAKES TWO RNG DRAWS AND `(A4)` IS NOT A SLOT STATUS WORD.** The
   MAIN sequencer dispatches with A4 = `$81298C`, the sixteen-word local block
   (`$25973A lea`), so `$2933EC move.w d0,(a4)` is an ordinary variable -- not a
   sibling of `clr.w (a4)`, the "script done" idiom, which is how a reader
   carrying the A1/A3/A4 slot protocol across would read it. And both draws step
   `$803917`, which the whole game shares.
6. **`$293688 bgt.w $293554` IS A TRAMPOLINE, NOT A PHASE CHANGE.** `[M]`
   `$293554` is ONE instruction, `bra.w $29314C`. It sits inside MAIN 5's
   address range and reads like a jump into another script; it is a long branch
   the assembler needed for reach.

### 2.1 A CLAIM THIS WAVE WROTE AND THEN WITHDREW

My first draft said `$293672`'s re-read of the waypoint mattered -- that a port
reusing the pre-move reading would test last frame's distance and overshoot.
**It would not**, and the mutation proved it by refusing to go red.

`[M]` `$293642..$293690` touches `(A4)` at exactly **two** instructions and both
are `adda.w (A4),A0` -- READS, at `$293648` and `$293678`. Nothing in the span
writes it and none of the four callees can (`$24203E` and `$242190` are pure,
`$293400` writes `($1a,A6)`, `$2417DE` writes `($2,A6)`/`($4,A6)`). So the
re-read returns the same two words. What *does* change across `$29366C` is the
boss's own position, and the port reads that at the point of use on both paths.

The comment is **corrected in place** and `main7-stale-target` is kept and
**declared EXPECTED-GREEN with that measurement**, with a test that asserts its
output is **byte-identical** over the block, the sub-record, the ring and the
RNG cursor -- not merely "did not go red". W82 §3.1 set this precedent with
`obj3-unsigned-ac`; this is the second instance.

### 2.2 A CRASH LEFT IN, DECLARED

`[M]` MAIN 6's speed target is `distance >> 7` (`$29360E`), so a distance of
`$4000` or more makes the target byte NEGATIVE -- and `$293400 bgt` is SIGNED,
so the ramp then walks the speed byte **down from 0 to `$FF`**, which is not one
of the 92 speed levels the exporter ships, and `$241820` stops the run by
address. **That crash is honest and is left alone.** MAIN 6 is only ever entered
from F4/F5/F6 with the boss already inside its own arena, and all eight
waypoints are within `$200` of its target, so `$4000` is not a distance the game
produces. A clamp here would hide a real arrival. It is named in the source and
the unit tests are written to stay inside the arena rather than to defeat it.

---

## 3. THE SPLIT -- and it supersedes W82 §8's, because it is by RUNG

W82 §8 cut the work by TABLE (82a the OBJECT list and animators, 82b F+MAIN,
82c E, 82d the death) and warned that F alone unblocks nothing. That is right
and still right. **What §1's partition adds is a cut by RUNG, and it is
strictly better, because a rung is the unit the ladder measures in.**

### 3A -- THE STEADY STATE. 28 rungs, and it must ship AS ONE WAVE.

The twelve, with the rung count each appears at:

| | entry point | rungs | | entry point | rungs |
|---|---|---:|---|---|---:|
| F4 | `$29556C` | 28 | MAIN 6 | `$2935E8` | 2 **(SHIPPED)** |
| F5 | `$295626` | 28 | MAIN 7 | `$293642` | 19 **(SHIPPED)** |
| F6 | `$2956F6` | 21 | D20 | `$294AC0` | 19 |
| F1 | `$295120` | 14 | E0 | `$295948` | 28 |
| MAIN 2 | `$293432` | 10 | E1 | `$295AE0` | 12 |
| MAIN 5 | `$29359E` | 4 | E11 | `$296614` | 28 |

`[M]` static closure over the twelve STEPs (`.scratch/w94/walk.py`; `jsr (An)`
invisible, so a LOWER BOUND): **35 routines, 1,292 instructions**, of which 14
routines / 690 instructions are boss-local and the rest are already ported
(the scheduler primitives, `$281484`/`$2816F6`/`$281764`, the `$242xxx` leaves).

`[M]` and their ACTIVATION GRAPH (`.scratch/w94/api.py`, the immediate reaching
D0 at every scheduler call) reaches, within a 250-frame window, at least: **E12
(`$2966B8`), E13 (`$296790` -- BULLET KIND 11, the first execution of any W27
body), D15 (`$294878`), D7 (ported), F2 (`$295304`), MAIN 4 (`$293506`)**.
So 3A is roughly **twelve script ids, ~24 entry points**, and there is no
smaller subset that unblocks a rung: `[M]` the cheapest rungs are lf12,000 and
lf16,750, which need six of the twelve on their FIRST frame and reach the rest
through F6's own state machine.

### 3B -- THE ARRIVAL. 15 rungs, 22 more entry points.

`$292972` `$292B08` `$292F4A` (the three OBJECT routines W82 left throwing),
D0..D3 (`$2937CC` `$293816` `$293852` `$293884`), D10/11/14/16/17
(`$2944E6` `$29451A` `$294658` `$2948C4` `$29493C`), D15 (`$294878`),
MAIN 4/8 (`$293506` `$2936BE`), F0/2/3 (`$294FA6` `$295304` `$295432`),
E4/5/6/14 (`$295F94` `$2960F4` `$296200` `$2968FE`).

### 3C -- the death, unchanged: recon 48's wave C, `$2440E0` + `$289004`.

**THE FORCED ORDER IS 3A, THEN 3B, THEN 3C**, and §6.2 is why 3A cannot be cut
further.

---

## 4. THE MEASUREMENT -- `stage1-sweep`, before and after

`node --max-old-space-size=8192 games/ddpdoj/tools/seedcmp.mjs --manifest
games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet`

| | segments | green | red | blocked | logic frames | bucket-2 records |
|---|---:|---:|---:|---:|---:|---:|
| **before** | 71 | 9 | 19 | 43 | 6,750 | 20,785, 0 MISSING |
| **after** | 71 | 9 | 19 | 43 | 6,750 | 20,785, 0 MISSING |

`[M]` **the two reports are BYTE-IDENTICAL** (`diff` reports no difference at
all), and that is the correct and expected result: this wave ships 2 of the
steady state's 12, so no rung's needed set became a subset of what the port has.
**No reds rose because none could.** The blocking census is unchanged
(`$2956F6` x21, `$295120` x14, `$295304` x5, `$295432` x2, `$294FA6` x1) --
which is itself §1's point restated: **the census reports the walk order and
this wave moved nothing in it.**

---

## 5. TESTS, AND EVERY CHECK SEEN TO FAIL

`[M]` `node --test games/ddpdoj/tests/` -- **1,112 pass, 0 fail** (was 1,075;
`tests/w94boss.test.js` is the 37).

**The red half drives the SHIPPED seam** (`W94_MUTATE`, W79's device), so it
needs no source edit and cannot rot away from the green half. Eight mutations,
declared in `tools/breakage.mjs`:

| mutation | what it falsifies | result |
|---|---|---|
| `ring-reversed` | `$29316E`'s shift direction | **RED** |
| `tail-both-plus80` | `$2931D2 addi.w #$FF80` -> `#$80` | **RED** |
| `tail-same-shift` | `$2931AE asl.w #$2` -> `#$1` | **RED** |
| `pick-one-draw` | `$2933EE`, the second `$242E24` | **RED** |
| `ramp-unsigned` | `$29340E bgt` read unsigned | **RED** |
| `dist-no-aspect` | `$2424A2`'s Y three-quarter scaling | **RED** |
| `main6-unsigned-arrive` | `$293616 bgt` read unsigned | **RED** |
| `main7-stale-target` | `$293672`'s re-read | **GREEN -- DECLARED, §2.1** |

**AND THE EXPORTER'S CHECK WAS SEEN RED TOO**, which matters because a unit test
cannot read the cartridge and so cannot catch a short window:

```
[M] clean:                     PASS
[M] $293104[8].INIT := $2936C0 (the pin moved by $C):
      RAISED -- "$293104[8].INIT reads $2936C0; W94's $293694 window is $20
      bytes and its far end is PINNED by that pointer being $2936B4"
```

`[M]` and the window itself is proven to be the right length from BOTH ends: the
index `$2933EC` can produce is `(rnd & $7) * 4`, i.e. `0..$1C`, and `movem.w`
reads two words -- so `$1C + 4 = $20` is exactly what an instruction can reach,
and the far end is `$2936B4`, **a longword the cartridge publishes** as
`$293104[8]`. One word past the window is a loud named throw, asserted.

---

## 6. THE BAR -- WHICH CONDITIONS I DELIVERED

### 6.1 FEATURE COMPLETE -- **YES for what this wave ships, and §7 is what
    actually happens at the boss, which is not what anyone expected**

* `node games/ddpdoj/tools/playgate.mjs --frames 600 --all` -> **`VERDICT:
  PLAYABLE -- 6 holds, 600 frames each, no unported path reached`**.
* `node tools/publish.mjs --only ddpdoj --dry` -> **GREEN**, build
  `20260806103251`, `dist/ built: 257 files, 6591 KB`, rom-leak guard clean with
  **six** deliberate exceptions. `PUBLISH_VERBATIM` untouched; no seventh entry.
* `node games/ddpdoj/tools/webgate.mjs` -> **30 PASS, 0 FAIL**.
* `[M]` records lacking art: **4,017 over 46 distinct streams, UNMOVED**
  (`node .scratch/w86/noart.mjs`, 6,500 steps, lf2,000..8,500, 534,575 records,
  530,558 drawn). The boss did not move it, because §7 is why.

### 6.2 ORACLES PERFECTLY -- **NO, and the reason is structural, not a hedge**

W85 made bucket 2 comparable and W82's OBJECT routines went from the weaker
claim to the stronger one on nine of twelve mutations. **That instrument cannot
reach this wave's code, and the reason is worth stating precisely because it
decides the shape of the next wave:**

* `sprq2` compares the port's bucket-2 records against the board's **on the
  frames the port can reach**, and the port can reach 6,750 of 19,600.
* MAIN 6 and MAIN 7 run only while the boss is **alive**. `[M]` of the 43
  segments where that is true, **all 43 are still BLOCKED** -- on the other ten
  of the twelve. The two segments that are NOT blocked (lf19,000 and lf19,250)
  are past the death, where the MAIN sequencer is on id 1 (`$2933C2`, W82's
  death drift) and MAIN 6 and 7 never run.
* So there is no frame anywhere in this repo on which the port executes this
  wave's code and a traced column exists to compare it against.

> **THE CONSEQUENCE, AND IT IS THIS WAVE'S MAIN RECOMMENDATION: the steady
> state's TWELVE MUST SHIP AS ONE WAVE, because no proper subset of them can be
> oracled.** Unblocking a rung is the only thing that puts a boss-alive frame
> inside the comparison, and unblocking the cheapest rung needs all twelve.
> W82 §8's "AND BEFORE ANY OF THEM, ONE TOOL" was satisfied by W85; what W85
> could not supply is REACH, and reach is bought with script bodies.

**What this wave's code IS compared against**, said plainly: the listing, by 37
unit tests, with seven of its eight named wrong ports driven red and the eighth
proven a no-op. That is W82's weaker claim, arrived at for a different and
narrower reason than W82's, and it is condition **1** of the bar and not both.

### 6.3 `pgm.py check` -- **72 passed, 2 failed, 0 SKIPPED**, and the same two

`[M]` `python games/ddpdoj/tools/oracle/pgm.py check`, run to completion on this
tree after every change above: **`VERDICT: FAILURES -- 72 passed, 2 failed,
0 SKIPPED`**. That is exactly the brief's number and exactly the same two
stages:

1. **`segment sweep`** -- the stage exits non-zero while any segment is red or
   blocked, and 43 + 19 still are. `[M]` `fly-around:PASS
   stage1-laser-hold:FAIL stage1-play:FAIL stage1-sweep:FAIL`, unchanged in
   shape from W82, W84 and W85.
2. **`THE LASER BOMB: $249A80, $255FE2 and $2456A6`** -- W79 §6.5 filed it as a
   concurrent wave's and W84 and W85 established the same. It cannot be this
   wave's by construction: the scenario runs lf2,000..3,112 and the boss's
   tables are not installed until lf~7,895 (§7), so `$259554` has never run,
   every scheduler pointer is 0, every walk is skipped, and not one line this
   wave wrote can execute.

I have not touched either, per the brief's rule about other agents' work.

#### 6.3.1 A TRAP I WALKED INTO AND IT LOOKS EXACTLY LIKE A REGRESSION

`[M]` **my FIRST reading of this stage was `70 passed, 4 failed`**, with two
extra reds -- `replay determinism (2 in-process + 1 subprocess)` and
`background shard gate: published tiles past px 160` -- neither of which any
previous wave has reported. Both were **my own concurrency**: I had two
`pgm.py check` runs alive at once (and a `seedcmp` sweep beside them), and they
share `games/ddpdoj/tools/oracle/out/`. Re-run ALONE, on the identical tree, the
same command is **72/2/0**.

Worth recording because of the shape: two extra reds, one of them named
*determinism*, in a wave that touched the scheduler -- a more plausible-looking
false regression is hard to construct. **`pgm.py check` is not safe to run
concurrently with itself and nothing says so.** The two runs' logs are in
`.scratch/w94/`.

---

## 7. THE PAGE IN A REAL BROWSER -- AND THE ANSWER IS NOT A THROW

`[M]` `python .scratch/w94/browser.py 8894 220` -- the working tree served over
`http.server`, driven by playwright/Chromium (headed), fire HELD, with the
ship's own invulnerability timer `$810424` held at `$FF` **-- the same labelled
intervention `stage1-sweep`'s manifest carries, and for the same reason: without
it a scripted flight dies long before lf7,870 and the question cannot be asked
at all.** `docs/knowledge/09`: that gives STATES a player would not produce, and
it is labelled here rather than buried. The server is shut down in a `finally`;
`[M]` `netstat` shows nothing on 8894 afterwards.

```
[M] BOOT  lf 2320
[M] +  80s  lf 7290   bossF=0
[M] *** BOSS TABLES INSTALLED at lf=7895  A4=$294F68  MAIN id=$FFFF  HPmax=$0
[M] + 200s  lf 14517  bossF=$294F68  main=$FFFF
[M] FINAL  lf 15611   err: ""     PAGE ERRORS: none (one 404 for a favicon)
```

**WHAT HAPPENS AT THE BOSS, said plainly: the WARNING banner appears, the boss's
five tables install, and then NOTHING. The boss never starts and the page never
throws.**

`.scratch/w94/w94-boss-arrives.png` is the moment: the full-width
`WARNING -- HUGE BATTLESHIP IS APPROACHING` strip, the laser lit, the ship
firing, explosions, the background painted. `.scratch/w94/w94-final.png` is
5,000 frames later: the ship alone over an empty crater field, the page's own
status line reading `dl 5 drawn 5 b0 0`. **The port flies through the boss and
there is no boss.**

`[M]` THE CAUSE, and it is already written down: `src/initbody.js:745` counts
`$2598E6` and `:746` counts `$25980C` -- the two ACTIVATIONS in `$2926E2`
(`$292734 moveq #$6 / jsr $2598E6` arms OBJECT 6, `$29273C moveq #$0 /
jsr $25980C` starts F script 0). W62 installed the tables and deliberately left
both as notes, and says so in its own comment. `[M]` `$81B626` reads 0 as well,
so `$2927AC move.l #$1A0,$81B626` (the HP-bar maximum) has not run either.

> **SO THE PAGE AND THE LADDER DISAGREE ABOUT THE BOSS ON PURPOSE, AND THAT IS
> WHY playgate IS GREEN WHILE 43 RUNGS ARE BLOCKED.** The ladder SEEDS from the
> board's RAM, in which the slots are already occupied, so the walk dispatches
> real scripts and throws. The page reaches the same logic frames with every
> slot empty, so the walk finds nothing and returns. **A wave that only ever ran
> `playgate` would conclude the boss works.** That is `39-OWNER`'s own lesson --
> "green means fidelity in the harness, not that a person can play it" -- with
> the two harnesses now disagreeing in a measurable way.

**This is the next wave's first decision and it is NOT free.** Making
`$25980C moveq #$0` real starts F script 0, which after 192 frames does
`MAIN.start 0` -- and MAIN 0 (`$293204`/`$29321C`, the ARRIVAL) is in 3B, not
3A. So the browser cannot be made to show a live boss by 3A alone; **3A makes
the LADDER green and 3B makes the PAGE show a boss**, and a wave should say
which of the two it is buying.
---

## 8. WHAT I TOUCHED

* `games/ddpdoj/src/bossscripts.js` -- **new**. `$242494`, `$29314C`,
  `$2933DE`, `$293400`, MAIN 6's INIT and STEP, MAIN 7's INIT and STEP, the four
  `registerScript`s and the `W94_MUTATE` seam.
* `games/ddpdoj/src/scheduler.js` -- `$259A18` (returning the slot address),
  `$259A4A`, `$2598C8`, `$2595F2`, and the three OVERFLOW block addresses.
* `games/ddpdoj/src/boss.js` -- `bossA5`/`bossA6` exported, `ctx.bossRec`
  published by `$292902`, and the side-effect import of the new file.
* `games/ddpdoj/tools/export-tables.py` -- the `$293694` window and
  `check_boss_waypoint_extent`, wired into `main`.
* `games/ddpdoj/tools/breakage.mjs` -- the eight mutations and
  `W94_EXPECTED_GREEN`.
* `games/ddpdoj/tools/portdiff.mjs` -- one line, the per-run seam reset.
* `games/ddpdoj/tests/w94boss.test.js` -- **new**, 37 tests.
* `docs/worklog/ddpdoj/94-impl-boss-wave-c.md` -- this file.

Not touched: `publish.mjs`, `bundlegate`, `webgate`, `build-dist.mjs`, the ROM
leak guard, `PUBLISH_VERBATIM`, `boarddl.mjs`, `NOTICE.md`, `CONTRIBUTING.md`,
`src/` (the Game Boy tree), `games/gradius/`. Nothing ROM-derived is committed;
scratch output is in `.scratch/w94/`, which is gitignored.
