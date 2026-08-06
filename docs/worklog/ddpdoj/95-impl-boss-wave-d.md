# 95 -- IMPL: the boss's CLOSED SET OF TWELVE, its three guns, and the two
   activations

status: **DONE.**

started: 2026-08-06. wave: 95. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `94-impl-boss-wave-c.md`, `82-impl-295-family.md`,
`85-impl-boss-bucket-trace.md`, `83-NOTE-censored-census-and-the-sim-server.md`,
`39-OWNER-visible-play-before-sound.md`, `48-recon-boss-script.md`.

---

## 0. THE HEADLINE

`[M]` **The brief's premise is CORRECT in every claim I could check, and W94's
own estimate of its size was the one thing that was low.** The twelve are a
closed set, the ten were still throws, and shipping them is what removed W94
§6.2's structural objection:

| `stage1-sweep` | segments | green | red | blocked | logic frames | bucket-2 records |
|---|---:|---:|---:|---:|---:|---:|
| **before** (W94) | 71 | 9 | 19 | **43** | **6,750** | 20,785, 0 MISSING |
| **after** (this wave) | 71 | **13** | **26** | **32** | **11,535** | **54,280, 0 MISSING** |

`[M]` **ELEVEN rungs stopped being blocked** -- four went GREEN and seven went
RED -- **and no segment moved the other way**.
`[M]` **all seven new reds are `vf`/`irq6` and nothing else**: not one column of
the boss's own state and not one bucket-2 record diverges on any of the 4,785
frames the comparison could not see before.

**SHIPPED:** the ten (MAIN 2 and 5, F 1/4/5/6, D 20, E 0/1/11 -- twenty entry
points), the three E scripts they start inside a 250-frame window (E 3, E 4 and
**E 13, which is BULLET KIND 11 -- the first execution of any of W27's 39
transcribed bodies**), and `$24328E` (the RNG family's first WORD table).

**NOT SHIPPED, AND THE MEASUREMENT IS THE DELIVERABLE: `$2926E2`'s two
ACTIVATIONS.** The brief asked for them with a stated reason -- *"without them
the twelve run against an empty slot table and you will have proven nothing"* --
and `[M]` **that reason is false**: the ladder SEEDS the scheduler's slot tables
out of the board's own RAM, so the twelve ran there whether or not the boss's
init body armed anything, and every one of the eleven unblocked rungs above was
won with those two lines OFF. I shipped them, measured them, and put them back.
§6.1 is the whole story, with what they cost and with the browser evidence that
they do exactly what the cartridge does.

**BAR CONDITIONS: TWO (ORACLES PERFECTLY), for the first time on any boss script
outside W82's four OBJECT routines. ONE is NOT met, and §6.1 is why -- which is
what W94 §7 predicted in advance.**

---

## 1. THE PREMISE, RE-MEASURED -- and W94's own number was the low one

**I grepped `src/`, `tools/` and the worklogs before disassembling anything.**

### 1.1 The census, with the PORTED set derived instead of typed

`[M]` `.scratch/w95/census.py` is W94's, with one change: the ported set is
**read out of the port's own `registerScript` calls** rather than written down,
so it cannot go stale the way the brief's "39 unported" did.

```
[M] RUNGS 72
[M] UNION entry points over all rungs: 41, of which UNPORTED 32
```

41 reproduces W82 and W94 independently. 34 - 2 (W94's MAIN 6 and MAIN 7) = 32,
exactly. **The partition holds**: the 28 rungs lf12,000..18,750 need a union of
exactly TWELVE entry points and every one of the 28 is a subset of it.

| | entry point | rungs | | entry point | rungs |
|---|---|---:|---|---|---:|
| F4 | `$29556C` | 28 | D20 | `$294AC0` | 19 |
| F5 | `$295626` | 28 | E0 | `$295948` | 28 |
| F6 | `$2956F6` | 21 | E1 | `$295AE0` | 12 |
| F1 | `$295120` | 14 | E11 | `$296614` | 28 |
| MAIN 2 | `$293432` | 10 | MAIN 5 | `$29359E` | 4 |

### 1.2 **THE ONE THING THAT WAS WRONG: "roughly twelve script ids, ~24 entry
   points" IS NOT ENOUGH, AND ONLY RUNNING IT SAYS SO**

W94 §3A sized 3A from a STATIC activation graph. `[M]` with the ten registered
and nothing else, all 28 steady rungs stop being blocked on their first frame,
run 39..237 frames each -- and then stop, on exactly FOUR addresses:

```
[M] $296752 E 13 INIT  15 rungs      $2952D8 F 2 INIT   3 rungs (+6, see below)
[M] $295E0E E  3 INIT   8 rungs      $295F44 E 4 INIT   2 rungs
```

15 + 8 + 3 + 2 = 28. So the steady state's real closure inside a 250-frame
window is **not twelve script ids but at least seventeen**. This wave shipped
three of the five (E 3, E 4, E 13) and F 2 and F 3 remain -- §7.

*That is not a criticism of W94: a static graph is a LOWER BOUND by
construction and W94 labelled it one. It is the same shape as note 83's rule --
a number that was honest about what it measured got read as answering the next
question -- and the only instrument that settles it is the ladder.*

### 1.3 THREE OTHER THINGS I CHECKED AND FOUND TRUE

* `[M]` W94's four scheduler accessors ARE enough for the ten: the only
  primitive this wave needed and did not have is **none** -- `$259A18`,
  `$259A4A`, `$2598C8` and `$2595F2` are exactly the four the twelve call.
  (F 2 and F 3 need a fifth, `$2599B4`; it is not in this wave.)
* `[M]` `$2595F2` really does pin every table index in this file. Five of F 1's
  tables, F 6's, E 0's two, E 1's and E 11's are each read at ONE index and the
  other seven entries of each are unreachable in build B.
* `[M]` the boss's five tables and their extents are as recon 48 §2 tabulated,
  re-read this session for all nine of the windows §4 adds.

---

## 2. WHAT THE STEADY STATE DOES, AND THE ELEVEN THINGS THE ADDRESSES DO NOT
   TELL YOU

The loop, in the order `$2596C6` walks it: **F conducts, MAIN is the phase, D is
the limbs, E is the guns.** F 6 waits for `MAIN.get == 7` (the waypoint wander
W94 shipped -- that rendezvous is why W94 had to go first), starts D 20, sweeps
the body row `$AC(A6)` toward the player, fires E 13 in a rising ladder and
hands to F 2. F 1 runs a four-state program over E 1 / E 3 / E 4. F 4 and F 5
are the ONE-PART and BOTH-PARTS-DESTROYED scripts. MAIN 2 wanders eight
waypoints of its own; MAIN 5 walks to (`$5C00`,`$1C00`) and hands to MAIN 2.

Every one of the following is in the source with the instruction it stands at.

1. **`$293424 move.w #$20,$1A(A6)` IS A WORD.** `($1A,A6)` is the SPEED byte and
   `($1B,A6)` the FACING byte -- `$2417E0` and `$2417E4` read exactly those. So
   MAIN 2's init sets **speed := 0 and facing := $20**; it does NOT set the
   speed to $20, which is what MAIN 5 three entries down does with a `move.b`.
   The two are three bytes and one suffix apart and mean opposite things.
2. **`$294ABA move.w #$0,$AE(A6)` CLEARS TWO BYTES.** `$AE` is D-script 7's TICK
   and `$AF` is its PERIOD. Arming D 20 therefore resets D 7's ramp as well, and
   nothing in D 20 mentions D 7.
3. **MAIN 5 HAS NO SPEED RAMP.** `$293582 move.b $1A(A6),$2(A4)` writes a ramp
   target the step never reads (`$2935D4 jsr $2417DE` follows the arrival test
   directly), so **`$293598 move.b #$8,$1A(A6)` STICKS**: both side parts
   destroyed doubles the boss's speed for the whole phase. A port that added the
   ramp every neighbouring MAIN script has would walk the 8 back to 4 at one
   step a frame and the wounded boss would move at the healthy speed.
4. **F 1 ALWAYS STARTS F SCRIPT 3, AND F 3 ALWAYS STARTS MAIN 5.** `$2952BC
   move.w D7,D0` is followed by `$2952C6 moveq #$3,D0`, which BOTH arms fall
   into; `$2954FA move.w D7,D0` is followed by `$295508 moveq #$5,D0` the same
   way. `[M]` **that is `$2595F2`'s fall-through trap's third and fourth
   instances in this one boss**, and in both cases the discarded value is
   computed with a real RNG draw that steps `$803917` for the whole game -- so
   the computation is not dead even though its answer is.
5. **THE `bchg` IS ON THE RECORD, NOT THE SLOT.** E 0, E 3, E 4 and E 13 all
   open `bchg.b #$0,$3(A5)` -- `($3,A5)` is the TARGET INDEX `$242716` reads, so
   arming one of those guns SWITCHES WHICH PLAYER THE WHOLE BOSS AIMS AT, and it
   alternates. `$3(A4)`, one register away, is the field every other script in
   the file uses for its own state.
6. **E 1's `$295A9A add.w D0,$C(A4)` ADDS INTO SLOT RESIDUE.** A scheduler slot
   is freed by `clr.w (a4)`, which zeroes the STATUS WORD ONLY (recon 48 §1.4),
   so `$C(A4)` -- the high word of the kind-12 parameter -- accumulates by -5
   per arm over the boss's life. A port that "initialised" the slot would reset
   the gun every time.
7. **THE SCRIPTS STARTED WITHOUT PARAMETERS INITIALISE EVERY FIELD THEY READ;
   THE ONES STARTED WITH PARAMETERS LEAVE EXACTLY THOSE FIELDS ALONE.** `[M]`
   E 0 and E 11 (started by `E.start` with no writes) set `$2`, `$3`, `$4`,
   `$6`, `$8`, `$A` and `$C` themselves; E 1, E 3, E 4 and E 13 never touch
   `$2`, `$3`, `$4` or `$6`, and F 1 and F 6 write precisely those through the
   address `$259A18` returns. **That split is what makes the return value
   load-bearing rather than convenient**, and it is checkable in both
   directions -- which is how this reading validated itself.
8. **E 4's INIT BRANCHES INTO E 3's STEP. It is a copy-paste bug in the
   cartridge.** `[M]` E 3's `$295E4C bcs.w $295E5E` goes to its own step; E 4's
   is `$295F82 bcs.w $295E5E` (`65 00 FE DA`, -294 from `$295F84`) -- **the same
   target**. With both players dead, arming E 4 runs E 3's step against E 4's
   slot, reading `$3F(A6)` where E 4 means `$7F(A6)`. Transcribed as written;
   `e4-init-own-step` is the reading that "fixes" it.
9. **E 3 AND E 4's MODE 0 FIRES NOTHING**, and it is a phase and not a missing
   transcription: `$295E96` is three register loads and a branch to the tail
   with no `jsr` in the arm, and F 1's state-1 gun starts them with `$3(A0) := 0`
   (`$2951E4`). The first four ticks of every part gun are silent. **And modes 1
   and >=2 are the same block twice**, instruction for instruction.
10. **E 13 DOES NOT SPREAD ITS WORK OVER FRAMES.** `$2968DA subq.w #$1,$6(A4) /
    bne.w $2967FA` loops back inside the same call, so ONE dispatch fires 32
    kind-11 bullets and `3 x $6(A4)` kind-7 bullets and then retires the slot.
    `$6(A4)` is F 6's `$E(A4)`, which starts at 6 and only grows.
11. **ONE FREEZE WORD, TWO OPPOSITE MEANINGS.** `$8130D4` at `$296796` RETIRES
    E 13's slot (`bne.w $2968E2 clr.w (a4)`); the identically-placed `tst.w`
    at `$295E74` in E 3 and E 4 merely skips the volley and still runs the tail.
    The difference is which label the branch carries.

### 2.1 AND EIGHT OF THE TEN INITs FALL THROUGH INTO THEIR STEPs

`[M]` MAIN 2, MAIN 5, D 20, F 1, F 4, F 5, F 6 and E 11 have no `rts` between
the two pointers -- the arming frame runs both. **E 0 (`$295946`) and E 1
(`$295ADE`) are the two that end in one**, and of the guns E 3 and E 4 fall
through while E 13 does not. Recon 48 §2.2 calls the fall-through the table's
house style and W94 found it on MAIN 6 and 7; a port that guessed either way
would be wrong 20 % or 80 % of the time.

MAIN 2's is through a `bsr` (`$293430 bsr.b $2933DE`, whose `rts` lands on
`$293432`), which also means **the ramp target the init stores at `$29342A` is
overwritten by `$2933F4` two instructions later** -- the store saves the zero
the same routine wrote four instructions earlier and the real target is a random
2..5.

---

## 3. A LATENT DEFECT THE RUN FOUND: SPEED LEVEL $82 IS NOT EXPORTED

`[M]` seven of the 33 remaining blocked rungs now stop on **`$241D3E`**, which
is `src/vectors.js`'s "speed index N was not exported" throw, reached from
`$29319E jsr $241D34` -- the LIMB PLACEMENT W94 shipped in `$29314C`.

`[M]` the index is **`$82` = 130**, and it comes straight out of the boss's
SUB-RECORD PROTOTYPE. Simulating `$2637A2` over `$292806` gives
`+$4A = +$8A = $82` and `+$4B = $40`, `+$8B = $C0` -- **and those two angles are
exactly what `$294722 move.b #$40,$4B(A6)` and `$294728 move.b #$C0,$8B(A6)`
write**, which is the simulation validating itself against instructions it was
not derived from. `[M]` the board's own RAM at lf8,500..11,750 carries `$82` in
both bytes.

**`tools/export-tables.py`'s `proto_speed_indices` reads a prototype's `$1A`
byte and nothing else**, so the boss's two PART speed bytes at `$4A`/`$8A` are a
domain it has never seen. The exported set is `0..68` plus multiples of 8; 130
is in neither.

**LEFT UNFIXED, AND DELIBERATELY.** All seven rungs are in the ARRIVAL
population (lf8,500..11,750), every one of them is blocked on 3B scripts as
well, and fixing it cannot unblock anything. Doing it properly means deriving
the ramp's domain from the image -- `[M]` four sites step `$4A`/`$8A` by +-2 in
lockstep with `$2A(A6)`, which is gated `$10..$68` in steps of 4 at `$294450`
and `$2947D2`, i.e. 22 steps and +-44 around the base -- and that is exporter
work with its own pins, not a line in a boss wave. **The throw is honest, loud
and names the exact index.** It is the arrival wave's, and §7 lists it.

---

## 4. NINE ROM WINDOWS ADDED, AND EVERY PIN COMES OUT OF THE CARTRIDGE

Every constant these thirteen scripts use is read at the address the
instruction computes (recon 48's work-list item 4), never baked in, so a table
that moves throws by address instead of firing the wrong gun.
`check_boss_phase_tables` asserts all of them on every export.

| window | len | pinned by |
|---|---|---|
| `$293482` | `$20` | `$293104[3].INIT` -- MAIN 3, which the cartridge publishes |
| `$294FCA` | `$38` | `$294F68[1].INIT` -- F 1's own, and the five tables ABUT |
| `$2952D2` | `$6` | `$294F68[2].INIT` -- F 2 |
| `$295664` | `$20` | `$294F68[6].INIT` -- F 6 |
| `$2958D2` | `$20` | `$295856[0].INIT` -- E 0 |
| `$295A6E` | `$10` | `$295856[1].INIT` -- E 1 |
| `$2965E8` | `$10` | `$295856[11].INIT` -- E 11 |
| `$295DD2` | `$3C` | `$295856[3].INIT` -- E 3 |
| `$2959C4` | `$20` | `$2959E4` being CODE (`movem.w $2(A6),D0-D1`) |
| `$29667C` | `$10` | the four fixed displacements that read it |
| `$2432AE` | `$100` | `$2433AE`, the RNG family's next `addq.b` |

`[M]` **two of them cross-check tables the port already had**, and neither
address is derived from the other:

* `$293482`'s eight X words are **byte-identical to `$293694`'s** (W94's) and
  only the Y column differs -- `$58..$60` here against `$72..$76` there. The
  boss has two arenas and one X layout.
* `$295DD2` is indexed by **`($AC(A6) + 7) * 4`, the same signed [-7,+7] row
  selector `$292C2A` (OBJECT 3, W82) uses at `* $20`.** One number places both
  the bullet and the sprite, so a wrong `$AC` puts the shots where the boss is
  not drawn -- a defect no single field would name.

`[M]` **`$24328E` IS THE RNG FAMILY'S FIRST WORD MEMBER.** `moveq #$7F,D0 /
and.w $803916,D0 / add.w D0,D0 / move.w ($2432AE,PC,D0.w),D0` -- 128 WORDS, and
a port that copied one of the eleven byte members and forgot `add.w D0,D0` would
read the HIGH BYTE of the word it wanted, every time, with plausible values.

---

## 5. THE MEASUREMENT

### 5.1 The ladder, before and after

`node --max-old-space-size=8192 games/ddpdoj/tools/seedcmp.mjs --manifest
games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet`

| | segments | green | red | blocked | logic frames | bucket-2 records |
|---|---:|---:|---:|---:|---:|---:|
| **before** | 71 | 9 | 19 | 43 | 6,750 | 20,785, 0 MISSING |
| **after** | 71 | **13** | **26** | **32** | **11,535** | **54,280, 0 MISSING** |

`[M]` the ORDER report is clean on **11,535 of 11,535** frames.

`[M]` **ELEVEN segments changed verdict, every one of them BLOCKED -> something,
and NOTHING ELSE ON THE LADDER MOVED AT ALL:**

| rung | before | after | first divergence |
|---|---|---|---|
| lf12,000 | BLOCKED | **GREEN** | -- |
| lf12,500 | BLOCKED | **GREEN** | -- |
| lf16,750 | BLOCKED | **GREEN** | -- |
| lf17,250 | BLOCKED | **GREEN** | -- |
| lf13,000 | BLOCKED | RED | `vf`@lf13,079 + `irq6` |
| lf13,750 | BLOCKED | RED | `vf`@lf13,867 + `irq6` |
| lf14,500 | BLOCKED | RED | `vf`@lf14,651 + `irq6` |
| lf15,250 | BLOCKED | RED | `vf`@lf15,373 + `irq6` |
| lf16,000 | BLOCKED | RED | `vf`@lf16,241 + `irq6` |
| lf17,750 | BLOCKED | RED | `vf`@lf17,869 + `irq6` |
| lf18,500 | BLOCKED | RED | `vf`@lf18,707 + `irq6` |

> **`[M]` ALL SEVEN NEW REDS ARE `vf` AND `irq6` AND NOTHING ELSE.** Not one of
> the other 92 columns moves, and bucket 2 is 0 MISSING on every frame of every
> one of them. That pair is the **already-known slowdown divergence** -- W69,
> `76-recon-mister-timing.md`, reported by `78-diag` at lf8,227 and by W82 §5.1
> at lf19,160 -- arriving in view because the boss now runs, not because this
> wave wrote it. **The reds are this wave succeeding and the boss's own state is
> green wherever it can now be seen.**

`[M]` the blocking census, before and after:

| before | after | address | what |
|---:|---:|---|---|
| 21 | 0 | `$2956F6` | F 6 STEP -- **cleared** |
| 14 | 0 | `$295120` | F 1 STEP -- **cleared** |
| 5 | 5 | `$295304` | F 2 STEP |
| 2 | 2 | `$295432` | F 3 STEP |
| 1 | 1 | `$294FA6` | F 0 STEP |
| -- | 3 | `$2952D8` | F 2 INIT (new first-blocker) |
| -- | 8 | `$29540C` | F 3 INIT (new) |
| -- | 7 | `$241D3E` | the unexported speed level, §3 (new) |

`[M]` and SIX more segments are BLOCKED on `$2952D8` **having first diverged on
`vf`/`irq6`**, which the census line does not show because the report prints the
first divergence when there is one. So the honest sizes are **F 2 = 9 rungs and
F 3 = 10** -- §7.

### 5.2 Bucket 2, and it is the condition-2 evidence

`[M]` 20,785 records over 6,750 frames -> **54,280 over 11,535, 0 MISSING**, and
an ordered SUBSEQUENCE of the board's on every frame. W85 built that instrument
and said its limit was REACH; this wave is 2.6x the reach.

---

## 6. THE BAR

### 6.1 FEATURE COMPLETE -- **NO. I SHIPPED THE TWO ACTIVATIONS, MEASURED WHAT
    THEY COST, AND PUT THEM BACK -- and that measurement is this wave's second
    finding**

`[M]` `python .scratch/w95/browser.py 8895 260` -- the working tree over
`http.server`, driven by playwright/Chromium (headed), fire HELD, with the
ship's invulnerability timer `$810424` held at `$FF`. **That is the same
labelled intervention `stage1-sweep`'s manifest carries** (`docs/knowledge/09`:
it gives STATES a player would not produce) and without it a scripted flight
dies long before lf7,860. The server is shut down in a `finally`; `[M]`
`netstat` shows nothing on 8895 afterwards.

**WITH `$292734 jsr $2598E6` AND `$29273C jsr $25980C` MADE REAL:**

```
[M] BOOT   lf 2334   bossF=0  OBJ slot 6 = 0  F slots [0,0,0,0,0]
[M] + 80s  lf 7239   bossF=0
[M] *** BOSS TABLES INSTALLED at lf=7860  A4=$294F68
[M] *** STOPPED at lf=7860:  UNPORTED $294FA0
[M]     OBJ slot 6 = $8001 (ARMED)   F slots [$8100, 0,0,0,0]
```

**They work, exactly and verifiably.** `$8129D0[6]` reads `$8001` -- OBJECT
routine `$292F4A`, the boss's own sprite, armed. `$812D3C` reads `$8100` -- F
script 0 claimed table F's slot 0 and the walk set its "INIT has run" bit before
dispatching. And then the port stops, loudly and by address, on **`$294FA0`, F
script 0's INIT** -- which is the ARRIVAL, W94 §3B, and not the steady state.

**AND THEN I MEASURED THE COST, WHICH IS FOUR THINGS AND NOT ONE:**

| what | before | with the activations |
|---|---|---|
| `pgm.py check` | **72 passed, 2 failed** | **70 passed, 4 failed** |
| the live page | reaches lf15,611 | **stops at lf7,860** |
| `stage1-sweep` lf8,000..8,250 | RED | **BLOCKED** (`$294FA0` at lf8,186) |
| everything else on the ladder | -- | unchanged |

`[M]` **the two new `pgm.py` failures are `STAGE 1 ENDS: the boss timeout,
$242952, and the rebuild` and `THE CHAIN EXPIRES: object type 0, the drain and
$284636`, and BOTH are stages that compare against the BOARD.** Driven directly:
`w62stageendgate.mjs` reports `stopped: UNPORTED $294FA0` at frame 6,124 of
21,000 and then fails 24 of its 27 rows -- the boss timeout, D-script 6's seven
states, `$2595E8`, `$242952`, the rebuild and all four RANK rows. `w63hudgate.mjs`
stops at the same address. **Neither is a divergence in what this wave
transcribed; both are the port reaching lf7,860 and stopping.**

> **AND THE BRIEF'S STATED REASON FOR THE ACTIVATIONS IS FALSE, WHICH IS WHY
> THEY GO BACK.** The brief says *"without them the twelve run against an empty
> slot table and you will have proven nothing."* `[M]` **the ladder SEEDS the
> scheduler's five slot tables out of the board's own 128 KiB at every rung** --
> that is W94 §7's own observation -- so the twelve are dispatched there whether
> or not `$2926E2` arms anything, and they were: **all eleven unblocked rungs,
> all 4,785 new compared frames and all 33,495 new bucket-2 records above were
> won with those two lines OFF.** The activations bought no fidelity that could
> be measured today and cost two board-carrying gates, the live page and a rung.

So they are back to counted notes -- **with the measurement written beside them
in `src/initbody.js`**, so the next wave inherits a number rather than a
question. Turning them on is one line each and they belong in the same wave as
F 0, MAIN 0, OBJECT 0/1/6 and D 0..3, which is what makes the page show a boss
instead of a throw.

**W94 §7 PREDICTED ALL OF THIS**, and it is worth quoting because it means the
brief's expectation ("you should get a boss") was the one thing in it that this
wave's scope could not buy at any price:

> *"Making `$25980C moveq #$0` real starts F script 0, which after 192 frames
> does `MAIN.start 0` -- and MAIN 0 is in 3B, not 3A. So the browser cannot be
> made to show a live boss by 3A alone; **3A makes the LADDER green and 3B makes
> the PAGE show a boss**."*

**WHAT THE PAGE DOES ON THE SHIPPED TREE**, re-measured after the revert
(`python .scratch/w95/browser.py 8896 200`), is exactly what W94 left:

```
[M] *** BOSS TABLES INSTALLED at lf=7961  A4=$294F68
[M] + 180s  lf 13228  bossF=$294F68  main=$FFFF
[M] FINAL   lf 14314  err: ""   PAGE ERRORS: none (one 404 for a favicon)
[M]         OBJ slot 6 = $8000 (present, bit 0 CLEAR)  F[0 x5] E[0 x10] D[0 x10]
```

the `WARNING -- HUGE BATTLESHIP` banner, the boss's five tables installed, and
then **nothing** -- every slot empty, so `$2596C6`'s five walks dispatch
nothing, and the port flies through the boss with no boss and no throw.
**That is unchanged by this wave and it is bar condition 1 not being met**,
stated as plainly as W94 stated it.

`[M]` **`playgate` is GREEN -- `VERDICT: PLAYABLE, 6 holds, 600 frames each, no
unported path reached` -- AND THAT GREEN IS WORTH NOTHING HERE.** 600 frames
from the page's own seed ends around lf2,600 and the boss arrives at lf~7,860.
`playgate` has never been able to see the boss and does not say so; it stayed
green even with the activations on. That is `39-OWNER`'s lesson one level
further in, and it is why this section reports a browser run and not a gate.

### 6.2 ORACLES PERFECTLY -- **YES, and this is the wave W94 said had to exist**

W94 §6.2 stated the objection precisely: *"no frame in this repo runs MAIN 6/7
and has a traced column"*, and *"the twelve must ship as one wave"*. That
sentence is now false and §5 is why.

* **ELEVEN of the 28 steady-state rungs are now compared** -- four of them GREEN
  end to end -- and **54,280 bucket-2 records the boss's own OBJECT routines and
  this wave's scripts produce are checked against the board's, 0 MISSING**.
* **The comparison has been SEEN TO FAIL on this wave's own code**, on the
  ladder and not only in a unit test: `[M]` six of the thirteen mutations move a
  segment relative to the unmutated baseline. (`[M]` the table below was
  measured over lf12,000..19,000, and re-measured on the SHIPPED tree after the
  §6.1 revert for `d20-wrap-ble`: identical, because those windows seed the
  boss's slots out of the board and never run `$2926E2` themselves.)

| `--break` | segments moved of 28 | how |
|---|---:|---|
| `d20-wrap-ble` | **18** | bucket 2, 2,879 records missing |
| `main2-speed-20` | 3 | GREEN->RED x2, 9 columns + 4,382 records |
| `main5-ramp` | 3 | GREEN->RED x2, 3,772 records |
| `f6-one-draw` | 2 | GREEN->RED x2, 1,519 records |
| `e1-one-draw` | 1 | GREEN->RED, 1,498 records |
| `f1-volley-bcc` | 1 | 2 columns |

**And the SEVEN that do not move a segment are DECLARED, with the measurement or
the proof, in `W95_EXPECTED_GREEN`** -- W82 and W94 set that precedent and this
is its third and largest instance. Every one of the seven is driven RED in
`tests/w95boss.test.js`, so the transcription is checked; what is declared is
only why the LADDER cannot see it.

| `--break` | why the ladder cannot see it |
|---|---|
| `e11-muzzle-order` | **HP-GATED SHUT**: `[M]` the board's HP0 over the 28 rungs runs `$147A4` down to `$F44F` and `$296614`'s `cmpi.l #$48CC / bcc` returns first. E 11's volley never executes on this ladder. Same for E 0. |
| `d20-init-byte` | **PROVEN FROM THE BOARD'S RAM**: D 20 is armed only by F 6 state 0, and `[M]` at every rung where `MAIN == 7` the board's `$AF(A6)` is ALREADY `$00`. |
| `e4-init-own-step` | the copy bug is on `$24226E`'s "both players dead" arm; the ladder holds P1 alive. |
| `e13-word-scale` | **PROVABLE NO-OP, exhaustive**: over all 65,536 word values `u8(u8(2x)*2)` and `u8(4x)` differ on ZERO. Asserted BYTE-IDENTICAL, not "did not go red". |
| `e0-bchg-slot` | a DOUBLE no-op: `$24270A`'s fallback rescues every aim onto P1 whichever way `$3(A5)` points, AND `$3(A4)` is overwritten two instructions later by `$2958F8`. |
| `e1-set-param` | the slot residue is 0 in these windows, and `add` and `set` agree on 0. |
| `f1-start-d7` | F 1 state 3 is not reached in a 250-frame window, and the mutation differs only on the `$FFFF` arm with an RNG byte of exactly 0. |

**What is still NOT compared, said plainly:** 33 of 71 segments are still
blocked, so the claim covers 11,535 frames and not the 19,600 the trace holds;
F 2, F 3 and the whole arrival are unported; and the seven declared mutations
above are checked against the LISTING and not against the board.

### 6.3 W27's BULLET KIND 11 RAN FOR THE FIRST TIME, AND IT DID NOT MISBEHAVE

Recon 48 §5: kind 11 lives at `$2967D6` and `$2967EA`, both inside E script
13's STEP, and `39-OWNER` records that none of W27's 39 transcribed bodies had
ever executed anywhere.

`[M]` E 13's INIT was the FIRST BLOCKER at 15 of the 28 steady rungs -- i.e. the
scheduler was already dispatching it -- and with it ported those rungs run on
for 39..237 more frames. **And the volley is not gated away**: `[M]` `$8130D4`
and `$8130D2` are BOTH `$0000` at every one of the 28 rungs, so `$296796`'s
freeze arm (which would `clr.w (a4)` instead of firing) is never taken and the
STEP reaches `$2967D6`. **`src/mover.js`'s kind-11 body produced no throw, no
divergent column and no missing bucket-2 record on any of them.** That is the
first execution of any W27 body and it is a pass rather than a finding, which
this wave records with the same weight it would have recorded a defect.

`[M]` `tests/w95boss.test.js` pins the volume the ROM asks for: **32 kind-11
bullets and `3 x $6(A4)` kind-7 in ONE dispatch**, then `clr.w (a4)`.

### 6.4 `pgm.py check` -- **72 passed, 2 failed, 0 SKIPPED, and the SAME TWO**

`[M]` `python games/ddpdoj/tools/oracle/pgm.py check`, run ALONE on the shipped
tree after every change above -- the brief's rule about never running two
instances at once was followed and W94 §6.3.1's false regression did not recur:

```
[M] VERDICT: FAILURES -- 72 passed, 2 failed, 0 SKIPPED
[M]   [FAIL] THE LASER BOMB: $249A80, $255FE2 and $2456A6 -- exit 1
[M]   [FAIL] segment sweep -- fly-around:PASS stage1-laser-hold:FAIL
[M]                           stage1-play:FAIL stage1-sweep:FAIL
```

1. **`segment sweep`** -- the stage exits non-zero while any segment is red or
   blocked, and 32 + 26 still are. It is the row this wave IMPROVED.
2. **`THE LASER BOMB`** -- W79 §6.5 filed it as a concurrent wave's and W82, W84
   and W85 established the same. It cannot be this wave's by construction: the
   scenario runs lf2,000..3,112 and the boss's tables are not installed until
   lf~7,900, so `$259554` has never run, every scheduler pointer is 0, every
   walk is skipped, and not one line this wave wrote can execute.

I have not touched either, per the brief's rule about other agents' work.

**AND THE INTERMEDIATE READING IS WORTH RECORDING**: with the two activations
ON, the same command was **70 passed, 4 failed**, and the two extra were
`STAGE 1 ENDS` and `THE CHAIN EXPIRES` -- §6.1. That is the brief's *"if your
work moves a gate carrying a BOARD column, stop and report a divergence"*,
which is exactly what happened and what §6.1 does.

### 6.5 THE OTHER GATES, on the shipped tree

* `[M]` `node --test games/ddpdoj/tests/` -- **1,166 pass, 0 fail** (was 1,112;
  `tests/w95boss.test.js` is the 54).
* `[M]` `node games/ddpdoj/tools/webgate.mjs` -- **30 PASS, 0 FAIL**, exit 0.
* `[M]` `node tools/publish.mjs --only ddpdoj --dry` -- **GREEN**, exit 0, build
  `20260806120812`, `dist/ built: 259 files, 6666 KB`, rom-leak guard clean with
  **six** deliberate exceptions. `PUBLISH_VERBATIM` untouched; no seventh entry.
* `[M]` `node games/ddpdoj/tools/playgate.mjs --frames 600 --all` -- **PLAYABLE,
  6 holds, no unported path reached** -- and §6.1 says why that green means
  nothing about the boss.
* `[M]` **records lacking art: 587 over 17 distinct streams** (`node
  .scratch/w91/noart.mjs`, 6,500 steps, 503,866 records, 503,279 drawn). The
  brief's figure of 4,017/46 comes from `.scratch/w86/noart.mjs`, which is no
  longer on disk, so the two are not the same measurement and I do not compare
  them. **What IS provable is that this wave cannot have moved either**: none of
  its 26 entry points can execute in a page run, because with the activations
  back to notes every scheduler slot stays empty -- `[M]` the browser probe at
  lf14,314 reads `F[0,0,0,0,0] E[0 x10] D[0 x10]` and `$8129D0[6] = $8000` with
  bit 0 CLEAR, so `$2596C6`'s five walks dispatch nothing at all.

---

## 7. WHAT IS LEFT, AND IT IS SMALLER THAN IT WAS

**THE STEADY STATE NEEDS TWO MORE SCRIPTS AND THEY ARE NOT FREE:**

* **F 2** (`$2952D8`/`$295304`, **9 + 5 = 14 rungs**) starts D 8, D 9, D 12,
  D 13, D 14, D 15 and **MAIN 8**, and needs `$2599B4` (D.running), the fifth
  accessor W62 did not ship.
* **F 3** (`$29540C`/`$295432`, **8 + 2 = 10 rungs**) starts D 16, D 17, D 18,
  D 19 and **E 8** -- which is where recon 48 §3.4 puts the boss's own spawned
  enemy (type `$1E`) -- and needs `$2599B4` too.

`[M]` between them that is **at least eleven more script ids**, and §1.2's
lesson is that only running it will say whether it is more. `[M]` **F 3 carries
the same discarded-D7 shape F 1 does** (`$2954FA` / `$295508`), so its
`MAIN.start` is always 5 -- that is already written down here for whoever ports
it.

**THE ARRIVAL (W94 §3B) IS UNCHANGED IN SHAPE AND NOW HAS A PRICE ON IT**
(§6.1): 15 rungs, and it is what makes the browser show a boss again. **It
should carry the two ACTIVATIONS**, which are one line each in
`src/initbody.js` with the measurement already beside them. Its own list gains
one item -- **speed level `$82`** (§3).

**THE DEATH (recon 48's wave C) is unchanged**: `$2440E0` + `$289004`.

---

## 8. WHAT I TOUCHED

* `games/ddpdoj/src/bossphase.js` -- **new**. The ten script ids, twenty entry
  points, and the `W95_MUTATE` seam.
* `games/ddpdoj/src/bossguns.js` -- **new**. E 3, E 4 and E 13, six entry
  points, and the `W95G_MUTATE` seam.
* `games/ddpdoj/src/boss.js` -- the two side-effect imports.
* `games/ddpdoj/src/initbody.js` -- the two ACTIVATIONS' comment, rewritten from
  "counted, W30" to **the four measurements §6.1 made of shipping them**. The
  two `note()` calls are what the tree still carries.
* `games/ddpdoj/src/rng.js` -- `$24328E` and `RNG_24328E`.
* `games/ddpdoj/tools/export-tables.py` -- nine windows,
  `check_boss_phase_tables`, and `$2432AE` added to the RNG family's pin check.
* `games/ddpdoj/tools/breakage.mjs` -- thirteen mutations and
  `W95_EXPECTED_GREEN`.
* `games/ddpdoj/tools/portdiff.mjs` -- the two per-run seam resets (edited
  through `write_bytes` so its CRLF survived).
* `games/ddpdoj/tests/w95boss.test.js` -- **new**, 54 tests.
* `games/ddpdoj/tests/w94boss.test.js` -- §8.1.
* `games/ddpdoj/tests/w62stageend.test.js` -- §8.1.

### 8.1 TWO EXISTING TESTS WENT RED, AND BOTH WERE DOING THEIR JOB

* `w94boss.test.js`'s *"the OTHER ten of the steady-state twelve are STILL LOUD
  NAMED THROWS"* -- W94 wrote its own scope down as an assertion and it fired
  the moment this wave registered them. Rewritten to the claim that survives:
  **the twelve are a CLOSED SET, so either all twelve are registered or the set
  is not closed.** The addresses are unchanged.
* `w62stageend.test.js`'s *"every registered script address is one of the boss's
  own table entries"* built its legal set from A3, A0, A1 and A2. **W95 is the
  first wave to register a TABLE-F script**, and A4 (`$294F68`) was the one
  pointer table it never carried. Widened to four classes; the negative case
  (`$2943EC`, D 7's `rts`, must be rejected) is untouched, so it is not weaker.

Not touched: `publish.mjs`, `bundlegate`, `webgate`, `build-dist.mjs`, the ROM
leak guard, `PUBLISH_VERBATIM`, `boarddl.mjs`, `NOTICE.md`, `CONTRIBUTING.md`,
`src/` (the Game Boy tree), `games/gradius/`. Nothing ROM-derived is committed;
scratch output is in `.scratch/w95/`, which is gitignored.
