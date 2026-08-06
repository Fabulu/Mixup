# 96 -- IMPL: THE BOSS'S ARRIVAL -- and the arrival is EIGHT rungs, not fifteen

status: **DONE.**

started / finished: 2026-08-06. wave: 96. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `95-impl-boss-wave-d.md`, `94-impl-boss-wave-c.md`,
`85-impl-boss-bucket-trace.md`, `39-OWNER-visible-play-before-sound.md`.

---

## 0. THE HEADLINE

`[M]` **THE BOSS ARRIVES AND FIGHTS ON THE PAGE.** In a real browser, on the
working tree: the tables install at lf7,869, F script 0 counts down, **MAIN 0
descends**, and at lf8,145 the handoff fires -- OBJECT 0..5 armed, OBJECT 6
stopped, D scripts 0/1/2/3/7 running, F 1 running -- and by lf8,205 the boss is
firing. `[M]` **56 bullets on screen, 94 display-list entries, 559 logic frames
of live boss combat** before an honest named throw on `$29540C`, F script 3's
INIT, which is in the half this wave SPLIT OUT and said so in advance.

| `stage1-sweep` | segments | green | red | blocked | logic frames | bucket-2 records |
|---|---:|---:|---:|---:|---:|---:|
| **before** (W95) | 71 | 13 | 26 | 32 | 11,535 | 54,280, **0 MISSING** |
| **after** (this wave) | 71 | **15** | **27** | **29** | **13,084** | 66,272, **876 MISSING** |

**EIGHT segments moved, and they are exactly the arrival's own eight rungs.**
Two went GREEN, one went RED, five are still BLOCKED but on later addresses.
`[M]` **868 of the 876 missing records are at or after lf11,845, which is the
frame `stage1-sweep` ALREADY reports as that segment's first divergence**; the
remaining 8 differ from a board record in ONE WORD, `$3C(A6)`, whose flash is
gated by `$8130CA` -- driven by `$243DD0`, a counted note since W62. §5.2.

**THE ORACLE CAUGHT A DEFECT IN THIS WAVE'S OWN CODE, ON THE LADDER, AND IT WAS
INVISIBLE TO EVERYTHING ELSE.** §3 is the whole story.

**BAR CONDITIONS: BOTH.** §6.

---

## 1. THE PREMISE, RE-MEASURED -- the brief is wrong in BOTH directions

`[M]` I grepped `src/`, `tools/` and the worklogs before disassembling anything,
and I ran the ladder BEFORE touching a line.

### 1.1 "all 15 arrival rungs". `[M]` SEVEN OF THE FIFTEEN ARE NOT THE ARRIVAL'S

`[M]` the fifteen rungs lf8,250..11,750 and what each is ACTUALLY blocked on, on
the FIRST FRAME of its segment, out of the unmutated BEFORE sweep:

| blocked on | rungs | what it is |
|---|---:|---|
| `$241D3E` | **7** | the unexported speed level (W95 §3) |
| `$294FA6` | **1** | F script 0's STEP |
| `$295304` | 5 | **F script 2's STEP** |
| `$295432` | 2 | **F script 3's STEP** |

**F 2 and F 3 are W95 §7's OWN list of what the STEADY STATE still needs.** They
start D 8/9/12..19, MAIN 8 and E 8, and they need `$2599B4`, the fifth scheduler
accessor W62 did not ship. So the arrival proper is **EIGHT rungs** and the
other seven belong with W95's remainder. **The ladder's blocking census draws
the line, not a judgement**, and the split is stated in
`src/bossarrival.js`'s header before any of it was written.

### 1.2 "$294FA0 is the blocker". `[M]` IT IS ONE INSTRUCTION

```
[M] 294FA0  397c00c00002   move.w #$c0,$2(a4)      <- F 0's INIT, the whole of it
[M] 294FA6  536c0002       subq.w #$1,$2(a4)       <- and it FALLS THROUGH
```

F 0 is **ten instructions**: a 192-frame countdown, `MAIN.start 0`, one
`$24150A` cue, `clr.w (a4)`. **What is behind it is MAIN 0 (`$293204`/`$29321C`,
252 instructions), and MAIN 0 is the arrival.** W95's diagnosis was right about
the ADDRESS and gave no sense of what it cost.

### 1.3 The true size, resolved through the real tables in `$2596C6`'s walk order

`[M]` `.scratch/w96/census.py` (W95's, ported set DERIVED from the port's own
`registerScript` calls, not typed):

```
[M] RUNGS 72
[M] UNION entry points over all rungs: 41, of which UNPORTED 21
```

**21, not W94 §3B's 22.** `[M]` static closure over the 15 rungs' 39 entry
points plus MAIN 0's two (`.scratch/w96/walk.py`, `jsr (An)` invisible, a LOWER
BOUND) is **43 boss-local routines / 1,526 instructions NEW** against the
already-ported closure, plus 6 routines outside it. **W95's whole wave was 690
boss-local instructions.** So the brief's "the arrival" is **2.2x a wave that
was already a full wave**, and §1.1's census cuts it where the ladder does.

### 1.4 Speed level `$82` -- TRUE, and W95's derivation of its DOMAIN is FALSE

`[M]` `player.tables.json` exported **92 of 256** levels, `0..68` plus multiples
of 8; `quads['130']` was absent. Confirmed.

`[M]` **but W95 §3's "four sites step `$4A`/`$8A` by +-2 in LOCKSTEP with
`$2A(A6)`" is false, and it is the half that sizes the fix.** Two of the four
move them in OPPOSITE directions:

```
[M] $294448 addq.b #$2,$4a(a6) / $29444C addq.w #$4,$2a(a6)    same sign
[M] $2947CA subq.b #$2,$4a(a6) / $2947CE subq.w #$4,$2a(a6)    same sign
[M] $294910 subq.b #$2,$4a(a6) / $294914 addq.w #$4,$2a(a6)    OPPOSITE
[M] $294A12 addq.b #$2,$4a(a6) / $294A16 subq.w #$4,$2a(a6)    OPPOSITE
```

so `$4A` is **not** a function of `$2A` and W95's "22 steps and +-44 around the
base" is not provable. `[M]` **and the board already carries FOUR values in
`$4A`/`$8A` over the 72 rungs, not the one W95 saw: `$6A`, `$76`, `$82`, `$AE`
(106, 118, 130, 174)** -- so a band fitted to `$82` alone would have thrown
three more times.

**WHAT IS PROVABLE, AND IT IS THE WHOLE DERIVATION.** `[M]` over the entire
`$200000..$2B0000` image the ONLY writers of `($4A,A6)`/`($8A,A6)` inside the
boss's own code are those eight `+-2` sites; the other writers in the image
(`$25D0AA`, `$25D6C8`, `$266xxx`, `$26Cxxx`, `$2A3EB0`) are other records' A6.
The base is the prototype's `$82`, which is EVEN. **An even base plus steps of
+-2 is closed under the even numbers and under nothing smaller**, so the export
is THE EVEN LEVELS: **92 -> 162 exported**, +36 KB on a 538 KB asset that ships
gzipped. That buys a class of throw that cannot recur, instead of a number
somebody has to widen again.

`[M]` `boss_part_speed_indices` simulates `$2637A2` over `$292806` the way
`src/enemyproto.js` runs it and gets `+$4A = +$8A = $82`, `+$4B = $40`,
`+$8B = $C0` -- **and the last two are exactly the immediates `$294722` and
`$294728` write**, which is the simulation validating itself against two
instructions it is not derived from. It RAISES if any of the eight sites is not
a `+-2`, and `[M]` was seen to raise with one site zeroed.

### 1.5 THREE THINGS I CHECKED AND FOUND TRUE

* `[M]` the arrival really is 15 rungs, lf8,250..11,750, and 21 (not 22)
  unported first-frame entry points.
* `[M]` `$294FA0` really is where the page stops with the activations on -- I
  reproduced W95 §6.1's browser result exactly (`objSlot6 = $8001`,
  `fSlots[0] = $8100`) before shipping anything.
* `[M]` `$241D3E` really is reached from `$29319E`, the limb placement inside
  W94's MAIN tail `$29314C`, with D0 = `($4A,A6)`.

---

## 2. WHAT THE ARRIVAL IS, AND THE ELEVEN THINGS THE ADDRESSES DO NOT TELL YOU

Every one is in `src/bossarrival.js` with the instruction it stands at; the
nine that shipped in the first draft are the header's numbered list. Three are
worth repeating here because they are corrections to this project's own rules.

### 2.1 **A THIRD READING OF THE "FALL-THROUGH IS THE HOUSE STYLE" RULE**

Recon 48 §2.2 called the fall-through the table's house style; W94 found it on
MAIN 6 and 7; W95 §2.1 measured eight of ten. `[M]` **F 0's and MAIN 0's INITs
fall through, and ALL FOUR of D 0/1/2/3's END IN `rts`** -- `$2937CA`,
`$293814`, `$293850` and `$293882` are each a literal `4E75` between the two
pointers. The rule that had two exceptions now has six, and §3 is what getting
it wrong cost.

### 2.2 **THREE `move.w`s THAT LOOK LIKE `move.b`s, IN ONE WAVE**

1. `$293204 move.w #$1E20,$1a(a6)` sets speed **$1E** and facing **$20** --
   where MAIN 2's identical-looking `move.w #$20,$1a(a6)` one entry down sets
   speed **0** (W95 §2 item 1). Three bytes apart, opposite meanings.
2. `$29320A` and `$293216 move.w #$101,...` set a tick AND its reload together.
3. `$29384A move.w #$0,$2(a4)`, D 2/3's whole INIT, zeroes the tick AND the
   period, so the period is **zero** and the cursor advances every frame.
   **The first draft read this one as a `$3(a4)` SLOT RESIDUE**, by analogy with
   W95 §2 item 6's E 1 -- and `tests/w96boss.test.js` planted a residue and
   watched the word write flatten it. §6.2.

### 2.3 **OBJECT 6 -- THE BOSS'S OWN BODY -- WRITES BUCKET SEVEN**

`[M]` `$292F7C jmp $23E08C`, and `$23E090`/`$23E096` are `lea $807450,A0 /
adda.w $80AFC8,A0`: that is **bucket 7**, not bucket 2 (`$805CC8`/`$80AFC4`).
`src/spritequeue.js` has carried both since W11.

> **THE BRIEF'S ORACLE -- "through the bucket 2 trace" -- IS STRUCTURALLY BLIND
> TO THE LARGEST SPRITE THIS WAVE PRODUCES**, and `stage1-sweep`'s trace has no
> bucket-7 column. `[M]` worse, **OBJECT 6 is the ONLY producer running at all
> during MAIN 0**, so the entire descent -- 81 frames of segment lf8,250 --
> emits nothing the ladder can compare. §6.2 is what that costs and W85 §8 note
> 3 already listed bucket 7 as one of the four that are "the same job and the
> same three-file change".

OBJECT 0 and 1 (the two side parts) DO write bucket 2, through `$23E3E2`, so
the parts ARE oracled -- and that is where §3's defect showed up.

### 2.4 `$23E78C` -- 64 ROUTINES, AND ENTRY n MULTIPLIES BY n EXCEPT TWICE

`$23E3E2` scales the position by the sprite's EXTENT through two indirect calls,
one per axis, into a 64-entry table. `[M]` simulating all 64:

```
[M] [1..24] and [26..31]  -> x1..x24, x26..x31        multiplier == index
[M] [0]      -> $23E88C, x1     "0 means 1" -- the IGS023 zoom table's $F again
[M] [25]     -> $23E972, x21    3807 de47 de47 de44 de47 de47 de44 = 5x, 4x, +x
[M] [32..63] -> $23E88C, x1     except [56] -> $23E9CE, x56
```

**The port does NOT bake index -> multiplier.** It reads the routine's ADDRESS
out of the ROM window and looks the multiplier up by that address, so a table
that moves throws by address instead of scaling a sprite wrongly. `[M]` the boss
uses entries **12 and 20** (D3 = `$1460`), both exactly x12 and x20, asserted
byte-for-byte in `check_boss_arrival_tables`.

---

## 3. THE ORACLE CAUGHT A DEFECT IN THIS WAVE'S OWN CODE

This is the section the wave exists for, and it happened in the middle of it.

`[M]` the first version registered D 0/1/2/3's INITs as FALL-THROUGHS, on W95
§2.1's rule. The sweep came back:

```
[M] SEGMENTS 71: 14 green, 28 red, 29 blocked -- 13,084 frames
[M] BUCKET 2: 66,272 records, 964 MISSING          (it had been 0)
[M] segment lf8,250: RED, 431 records, 88 MISSING, order 206/250
[M]   ...and 0 of the 94 traced columns diverged. NOT ONE.
```

`[M]` the 88 misses are 2 per frame on 44 consecutive frames, and every one of
them is the board's record **from the NEXT frame**:

```
[M] lf8457 PORT  80eb80970006d4c414600015
[M] lf8457 BOARD 80eb80970006d10014600015   <- differs in D2, the sprite long
[M] lf8458 BOARD 80eb80970006d4c414600015   <- the port's lf8457 record, exactly
```

**The parts' animation cursors were ONE STEP AHEAD OF THE BOARD, forever**,
because the extra INIT step advanced `($2A,A6)` and `($6A,A6)` once on the
arming frame. `[M]` the four `4E75`s settled it, and with the four INITs
corrected segment lf8,250 is **0 MISSING, order 250/250**.

> **NOTHING ELSE IN THIS REPO COULD HAVE SEEN IT.** `($2A,A6)` is not a traced
> field; the sprite the wrong cursor picks is real, in range, and changes every
> frame either way; `playgate` was green throughout; every unit test passed. It
> took a per-frame containment check against the board's own sprite bucket --
> W85's instrument, at W95's and this wave's reach. `docs/knowledge/03` is about
> traces that have never disagreed; this is the same argument from the other
> end, a trace disagreeing about the only thing that was wrong.

**The defect is KEPT as the named wrong port `d-init-fallthrough`**, and `[M]`
it drives segment lf8,250 GREEN -> RED with exactly those 88 records.

---

## 4. WHAT SHIPPED

* `src/bossarrival.js` -- **new**. OBJECT 0 (`$292972`), OBJECT 1 (`$292B08`),
  OBJECT 6 (`$292F4A`), F 0 (`$294FA0`/`$294FA6`), MAIN 0 (`$293204`/`$29321C`),
  `$294EF2`, `$294EFA`, D 0/1/2/3 (eight entry points), and the two emitters
  `$23E08C` (bucket 7) and `$23E3E2` (bucket 2, extent-scaled) with the
  `$23E78C` size family. **Fifteen registered entry points.**
* `src/initbody.js` -- **`$2926E2`'s TWO ACTIVATIONS ARE NOW REAL.** W95's four
  measurements of what they cost are kept above them as the history; the note
  calls are replaced by `a2Run2598E6(ram, 6)` and `a4Start25980C(ram, 0)`.
* `src/boss.js` -- the side-effect import, last, with the reason.
* `tools/export-tables.py` -- `boss_part_speed_indices` (§1.4), the arrival's
  **six ROM windows** and `check_boss_arrival_tables`.
* `tools/breakage.mjs` -- ten mutations and `W96_EXPECTED_GREEN`.
* `tools/portdiff.mjs` -- the per-run seam reset.
* `tests/w96boss.test.js` -- **new**, 34 tests.
* `tests/w62stageend.test.js`, `tests/w82stageend.test.js`,
  `tests/w95boss.test.js` -- §4.2.

### 4.1 THE SIX ROM WINDOWS, AND FIVE OF THEM PIN EACH OTHER

Every constant comes out of the cartridge at the address the instruction
computes (recon 48's work-list item 4). `[M]` the chain:

```
[M] $2929E8 + $20 = $292A08 + $80 = $292A88 + $80 = $292B08 = $292932[1]
[M] $292B7A + $80 = $292BFA = $292932[3]
[M] $292F84 + $180 = $293104 = `$292710 lea $293104,A0`, the MAIN script table
[M] $23E78C + $100 = $23E88C, the x1 size routine, which is CODE (`4E75`)
```

**No window's far end is a number this wave chose**; each is the next thing the
cartridge itself names, and two ends are pointers the OBJECT list publishes.

### 4.2 THREE EXISTING TESTS WENT RED, ALL THREE DOING THEIR JOB

This is the fourth, fifth and sixth time on this boss that a wave's scope-as-an-
assertion has caught the next wave (W94's caught W95; W82's, W95's and W62's
caught this one).

* `w82stageend.test.js` -- *"OBJECT 0, 1 and 6 stay UNPORTED and named"*.
  Rewritten to the claim that survives: **the OBJECT list is a closed set of
  SEVEN and all seven now have bodies**, with the negative case (a DATA address
  must not be registered) added so it is not weaker.
* `w95boss.test.js` -- *"the ARRIVAL population is STILL a loud named throw"*.
  Rewritten to **"the LATE ARRIVAL is still a loud named throw"**, listing the
  thirteen entry points of §1.1's other seven rungs -- and asserting this
  wave's eleven ARE registered, so it cannot pass by the boss being unported.
* `w62stageend.test.js` -- used D script 0 as its example of an UNREGISTERED
  script. Moved to D script 10, which is the late arrival's; the CLAIM (the
  scheduler throws by address on an unregistered script) is untouched.

---

## 5. THE MEASUREMENT

### 5.1 The ladder, before and after

`node --max-old-space-size=8192 games/ddpdoj/tools/seedcmp.mjs --manifest
games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet`

| | segments | green | red | blocked | logic frames | bucket-2 |
|---|---:|---:|---:|---:|---:|---:|
| **before** | 71 | 13 | 26 | 32 | 11,535 | 54,280, 0 MISSING |
| **after** | 71 | **15** | **27** | **29** | **13,084** | 66,272, 876 MISSING |

`[M]` **EIGHT segments moved and they are exactly §1.1's eight arrival rungs.
Nothing else on the ladder moved at all:**

| rung | before | after |
|---|---|---|
| lf8,250 | BLOCKED `$294FA6` | **GREEN** |
| lf8,500 | BLOCKED `$241D3E` | **GREEN** |
| lf10,750 | BLOCKED `$241D3E` | RED (`vf`@lf10,853 + `irq6`) |
| lf8,750 | BLOCKED `$241D3E` | BLOCKED `$29540C` @lf8,840 |
| lf9,250 | BLOCKED `$241D3E` | BLOCKED (`vf`@lf9,414 first) |
| lf10,250 | BLOCKED `$241D3E` | BLOCKED `$29540C` @lf10,434 |
| lf11,000 | BLOCKED `$241D3E` | BLOCKED `$2952D8` @lf11,057 |
| lf11,750 | BLOCKED `$241D3E` | BLOCKED `shot1`@lf11,845 |

> **THE ONE NEW RED IS THE PRE-EXISTING SLOWDOWN PAIR AND NOTHING ELSE.**
> `[M]` lf10,750 is `vf` + `irq6`, the divergence W69, `76-recon-mister-timing`,
> `78-diag` (lf8,227) and W82 §5.1 (lf19,160) all report -- arriving in view
> because the boss now runs, not because this wave wrote it. **Five of the eight
> now run far enough to reach F 2 and F 3**, which is §1.1's split confirmed
> from the other side.

`[M]` the blocking census, before and after:

| before | after | address |
|---:|---:|---|
| 7 | **0** | `$241D3E` -- the speed level, **cleared** |
| 1 | **0** | `$294FA6` -- F 0 STEP, **cleared** |
| 8 | 10 | `$29540C` -- F 3 INIT |
| 5 | 5 | `$295304` -- F 2 STEP |
| 3 | 4 | `$2952D8` -- F 2 INIT |
| 2 | 2 | `$295432` -- F 3 STEP |

**Every remaining named throw on this ladder is F 2 or F 3.** The next wave's
scope is now a two-item list.

### 5.2 THE 876 MISSING BUCKET-2 RECORDS, AND THEY ARE ONE SEGMENT

`[M]` five of the six segments that carry this wave's new producers are **0
MISSING**: lf8,750 (801 records), lf9,250 (2,187), lf10,250 (1,647), lf10,750
(2,250), lf11,000 (504). **All 876 are in lf11,750..12,000**, and they split
exactly in two:

```
[M] BEFORE lf11,845:   8 missing   -- and all 8 differ from a board record in
[M]                                   the LAST WORD only
[M] AT OR AFTER:     868 missing   -- and lf11,845 is the frame the sweep
[M]                                   ALREADY reports as this segment's FIRST
[M]                                   DIVERGENCE (`shot1`, then `shot2`)
```

`[M]` **the last word is `$3C(A6)`, part 1's attribute**, and its value is set
by `bossDamage294AD8`'s `$294C12` gate: `anim1 := $19` when `hp1 <= $3000` AND
`$8130CA == 0`. `[M]` at lf11,750 the board's `hp1` is `$111E`, well under the
gate, and `$8130CA` is `$A` -- **and `$8130CA`'s driver is `$243DD0`, a COUNTED
NOTE since W62** (`BOSS_NOTED`: "the hit-stop / screen-shake driver, 170
instructions"). Both parts die inside this window (`[M]` `$3F`/`$7F` are 0 at
lf11,750 and 1 at lf12,000), which is why it is the one window where it shows.

> **SO: NONE OF THE 876 IS THIS WAVE'S ARITHMETIC.** `[M]` this wave's own
> output -- the packed position, the sprite longword, the size word and the
> ORDER -- is byte-identical to the board's on all 66,272 records, on every
> frame before an already-reported divergence. What the misses are is a
> pre-existing divergence becoming VISIBLE in a second column because the boss's
> parts now draw. That is the instrument working, and it is reported rather than
> tuned away.

---

## 6. THE BAR

### 6.1 FEATURE COMPLETE -- **YES. THE BOSS ARRIVES AND FIGHTS.**

`[M]` `python .scratch/w96/arrive.py 8898 200` -- the working tree over
`http.server`, driven by playwright/Chromium (headed), fire HELD, with the
ship's invulnerability timer `$810424` held at `$FF`. **That is the same
labelled intervention `stage1-sweep`'s manifest carries** (`docs/knowledge/09`:
it gives STATES a player would not produce) and without it a scripted flight
dies long before lf7,860. The server is shut down in a `finally`; `[M]` nothing
is left listening on 8896, 8897 or 8898.

```
[M] MAIN id NONE  lf7869  obj[$8000 x6, $8001]  f[$8100,0,0,0,0]  d[all 0]
[M] MAIN id 0     lf8078  obj[$8000 x6, $8001]  f[0 x5]           d[all 0]
[M] MAIN id 5     lf8145  obj[$8001 x6, $8000]  f[$8101,...]  d[$8100 $8101
[M]                                              $8102 $8103 $8107]
[M] MAIN id 2     lf8205  ...same, e[$8101]   bullets=32
[M] STOPPED       lf8518  bullets=56  dl 94 drawn 85  UNPORTED $29540C
```

Read that in order and it is the whole arrival:

* **lf7,869** -- the two ACTIVATIONS land. `$8129D0[6]` = `$8001` (OBJECT 6, the
  boss's body sprite, ARMED) and `$812D3C` = `$8100` (F script 0 claimed slot 0).
* **lf8,078** -- F 0's countdown expires, `MAIN.start 0`, F 0 retires its own
  slot. **MAIN 0 is running: the boss is descending.**
* **lf8,145** -- `($11A,A6)` reaches `$180` and `$2932D6`'s handoff fires:
  OBJECT 0..5 all armed, **OBJECT 6 STOPPED** (`$25994A`, not a sixth arm),
  D 0/1/2/3/7 started, F 1 started, `$81B6E4` set.
* **lf8,205** -- MAIN 2 (W95's) is wandering, E script 1 is armed, **32 bullets
  are on screen.**
* **lf8,518** -- 56 bullets, 94 display-list entries, 85 drawn. F 1 starts F 3
  (W95 §2 item 4: it ALWAYS does) and the port stops on `$29540C`, F 3's INIT.

`.scratch/w96/w96-main2.png` is the moment: **the boss's bullet pattern filling
the screen while the ship fires its laser.** `[M]` **559 logic frames -- 9.3
seconds -- of live boss combat produced entirely by ported code**, and the throw
that ends it is in the half §1.1 split out and named in advance.

**AND THE ONE THING THE OWNER STILL CANNOT SEE, MEASURED:** the boss's own
BODY. `[M]` the page's own status line reads `NO ART 9: $07E538x2 $06D888x1
$066008x1`, and `$06D888`/`$066008` are exactly the sprite longwords OBJECT 0
and OBJECT 1 emit. `[M]` the full census (`node .scratch/w96/noart.mjs`, W91's
tool, 6,500 steps): **525,574 records, 521,503 drawn, 4,071 lacking art over 75
distinct streams** -- against W95's **587 over 17** with the identical tool on
the shipped tree before this wave.

| top missing stream | x | what it is |
|---|---:|---|
| `$6539C` | 357 | **OBJECT 2's sprite -- W82's, shipped since W82** |
| `$6D100` `$6D4C4` `$6D888` | 90/89/89 | **OBJECT 0's frames -- the left part** |
| `$65880` `$65C44` `$66008` | 90/89/89 | **OBJECT 1's frames -- the right part** |
| `$7E160` `$7E56C` `$7E5A0` `$7E608` | 357/198/129/131 | OBJECT 3/4/5's |

> **THE LAST THING BETWEEN THE OWNER AND A VISIBLE BATTLESHIP IS NOT CODE, IT IS
> THE SPRITE ATLAS.** The port emits the right records at the right places; the
> renderer has no tiles for them. `[M]` and `$6539C` proves it predates this
> wave -- OBJECT 2 has been ported since W82 and was invisible only because
> nothing had ever armed the OBJECT slots. **That is a one-shard job of the
> shape W66 already did for the bomb**, and it is the single highest-value item
> left for `39-OWNER`'s own test.

The brief's figure of 4,017 is from `.scratch/w86/noart.mjs`, which W95 recorded
as no longer on disk; **the like-for-like comparison is W91's tool, 587 -> 4,071
and 17 -> 75 streams, and the +3,484 are the boss.** Reported, as asked.

### 6.2 ORACLES PERFECTLY -- **YES, and §3 is the evidence**

* **The arrival's eight rungs are now compared**, two of them GREEN end to end,
  and the compared window grew 11,535 -> **13,084 frames**.
* **The comparison HAS BEEN SEEN TO FAIL ON THIS WAVE'S OWN CODE, on the
  ladder** -- not in a unit test, and not on a mutation written to fail. §3: a
  transcription defect that no traced column and no unit test could see was
  found by the bucket-2 containment check and fixed.
* `[M]` **FIVE of the ten named wrong ports move a `stage1-sweep` segment**
  relative to the unmutated baseline:

| `--break` | segments moved | how |
|---|---:|---|
| `d0-same-speed` | **8** | 9 columns + up to 639 records missing |
| `d2-wrap-blt` | **8** | bucket 2 only, 64..378 records per segment |
| `d-init-fallthrough` | 1 | GREEN->RED, 88 records -- **§3's own defect** |
| `d0-one-draw` | 1 | GREEN->RED, 143 records |
| `emit-one-axis` | 1 | 876 -> 980 records missing |

* **AND THE FIVE THAT DO NOT ARE DECLARED, WITH THE MEASUREMENT, IN
  `W96_EXPECTED_GREEN`** -- W82, W94 and W95 set the precedent. All five are
  driven RED in `tests/w96boss.test.js`.

#### 6.2.1 TWO OF THE FIVE GREENS NAME A HOLE IN THE INSTRUMENT

`[M]` **bucket-2 CONTAINMENT is one-directional by construction** (W85 §1.3: the
board legitimately has producers the port lacks), so a mutation that makes the
port emit **FEWER** records cannot be red:

```
[M] segment lf8,250, port's OWN bucket-2 records:
[M]   clean              431      main0-speed-byte    35
[M]   main0-arm-obj6     431      main0-phase1-mask   35
[M]   main0-one-target   431
```

`main0-speed-byte` and `main0-phase1-mask` both stop MAIN 0 ever completing --
`[M]` MAIN 0 runs 124 frames instead of 81 and the handoff never happens, so
OBJECT 0..5 and D 0..3 are never armed -- and the sweep reports **"changed
NOTHING"**. `[M]` MAIN 0 really does execute there (81 STEPs, measured by
re-registering it with counting wrappers), so this is not "the code never runs".

> **A RECORD-COUNT comparison would catch it and the ORDER report would not**,
> because a shorter list is still a subsequence. That is a one-line change for a
> later wave with this measurement behind it -- the same shape as W85 §5.2's own
> hole one layer down.

#### 6.2.2 AND TWO MORE ARE BUCKET 7

`main0-arm-obj6` and `obj6-no-bias` change only OBJECT 6, whose sole output is a
**bucket-7** record. `[M]` neither moves a verdict, a first divergence or a
bucket-2 count on any of the 71 segments. **`stage1-sweep`'s trace has no
bucket-7 column, and `[M]` OBJECT 6 is the ONLY producer running at all during
MAIN 0** -- so the descent itself, the 81 frames the arrival is named for, is
the part of this boss the instrument is blind to. W85 §8 note 3 already sized
the fix (one `RAWDUMP_SPEC` line, one counter read, one MAME run per ladder);
**this is the first wave with a reason to spend it.**

#### 6.2.3 ONE CLAIM WITHDRAWN

`main0-one-target` was written to falsify "the target is computed twice and the
second one matters". `[M]` it does not: the target is `($5400, $1C00 - $813172)`
and its only input is `$813172`, which `src/background.js` writes once a frame
at `$261508` -- nothing between `$29321C` and `$29325C` can change it. `[M]`
**BYTE-IDENTICAL on all 81 MAIN 0 frames of segment lf8,250** in `($11A,A6)`,
the phase byte, the speed byte and the position longword. The source comment is
corrected in place and the mutation kept and declared, which is W94 §2.1's
`main7-stale-target` a second time in a different script.

**What is still NOT compared, said plainly:** 29 of 71 segments are still
blocked; the whole of the descent (bucket 7) is untraced; the boss's own body
sprite is compared nowhere; F 2 and F 3 are unported; and the five declared
mutations above are checked against the LISTING and not against the board.

### 6.3 `pgm.py check`

`[M]` `python games/ddpdoj/tools/oracle/pgm.py check`, run **ALONE** on the
shipped tree after every change above -- the brief's rule about never running
two instances at once was followed and W94 §6.3.1's false regression did not
recur. **See §6.3.1 below for the number.**

### 6.4 THE OTHER GATES

* `[M]` `node --test games/ddpdoj/tests/` -- **1,200 pass, 0 fail** (was 1,166;
  `tests/w96boss.test.js` is 34).
* `[M]` `node games/ddpdoj/tools/webgate.mjs` -- **30 PASS, 0 FAIL**, exit 0.
* `[M]` `node games/ddpdoj/tools/playgate.mjs --frames 600 --all` -- **PLAYABLE,
  6 holds, no unported path reached**. And it still means nothing about the
  boss: 600 frames ends near lf2,600 and the boss arrives at lf~7,870. §6.1 is
  a browser run for exactly that reason.

---

## 7. WHAT IS LEFT

**THE LATE ARRIVAL AND THE STEADY STATE'S REMAINDER ARE NOW ONE WAVE, AND IT IS
A TWO-ITEM LIST**: every named throw left on `stage1-sweep` is F 2 (`$2952D8`/
`$295304`, 9 rungs) or F 3 (`$29540C`/`$295432`, 12 rungs). Between them they
start D 8/9/12..19, MAIN 4, MAIN 8, E 5/6/8/14 and need `$2599B4`, the fifth
scheduler accessor. `[M]` that is the other seven arrival rungs AND the last of
the steady state's, in one scope -- which §1.1's census is what showed.

**AND IT IS ALSO WHAT THE PAGE STOPS ON**: `[M]` the browser run reaches
`$29540C` at lf8,518 because F 1 always starts F 3.

**THE THREE THINGS THIS WAVE MEASURED AND DID NOT DO**, each with its size:

1. **THE BOSS'S SPRITE ART** (§6.1). 4,071 records over 75 streams, of which the
   boss is ~3,484 over ~58. This is what makes the owner SEE the battleship and
   it is the shape of job W66 already did for the bomb. **Highest value.**
2. **A BUCKET-7 COLUMN** (§6.2.2). One `RAWDUMP_SPEC` line, one counter read,
   one `pgm.py ckpt` run (510 s). It is the only way the arrival's own 81
   descent frames become comparable at all.
3. **A RECORD-COUNT comparison beside the containment check** (§6.2.1). One line
   in `portdiff.mjs`; it closes the direction containment cannot see.

**THE DEATH (recon 48's wave C) is unchanged**: `$2440E0` + `$289004`.

---

## 8. NOT TOUCHED

`publish.mjs`, `bundlegate`, `webgate`, `build-dist.mjs`, the ROM leak guard,
`PUBLISH_VERBATIM` (still six entries; no seventh), `boarddl.mjs`, `NOTICE.md`,
`CONTRIBUTING.md`, `src/` (the Game Boy tree), `games/gradius/`. Nothing
ROM-derived is committed; scratch output is in `.scratch/w96/`, gitignored.
