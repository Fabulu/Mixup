# 53 - IMPL E5a: THE SHOT SPARK (pool E, `$289F54` + `$28A098`)

status: **DONE**

started: 2026-08-05
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

brief: the owner is playing the live build - "Shooting enemies with bullets
works, but you can't see the bullets and no explosions." E4 made the bullets
visible. **Mine is the first half of the explosions: the shot's impact spark**,
recon 50 §8's E5a - pool E, the highest-frequency effect in the game.

inputs read in full: 50-recon-effects, 52-impl-E4-bullets, 47-impl-E2-art,
51-impl-laser-damage, HANDOVER, `docs/knowledge/09` and `10`.

`[M]` = measured by me, this session, on this tree.

---

## 0. THE BRIEF'S PREMISE, CHECKED - its shape is right and FIVE numbers are not

Recon 50's structure is confirmed from the cartridge: pool E really is
`$81D394`/`$81D790`, 60 slots of `$22`, count `$81DB8C`; `$289F54` really is its
allocator and `$28A098` really is its driver; the emitter table really is
`$28A140`, four entries, three distinct, entry [4] code. I reproduced all of it
independently.

| recon 50 / the brief says | [M] this session |
|---|---|
| "`moveq #$1D,D2` = 30 slots, or `moveq #$E,D2` = **15 when `$81308C` is set**" | **BACKWARDS.** `$28A068 bne $28A06C` SKIPS the `moveq #$E`, so it is **30 when `$81308C` is NON-ZERO** and 15 when it is 0 - and the call site is itself behind `tst.w $81308C / beq`, so the spark can *only* ever spawn in the 30-slot case. The narrow arm is unreachable from here. |
| pool E is **652 B**, "`$289F4E..$28A1D9`, ~7 entry points + 1 driver" | The 652 stops one instruction short of the record FILL. `$28A1DA` (the common fill) plus its **8-entry dispatch `$28A232`** and eight fill tails run to `$28A463`; the data runs `$28A464..$28AB85`. **Pool E is 1,302 B of code + 1,826 B of data**, and recon 50's own §10.2 says it never walked the templates. |
| `$289F54` has the two call sites the port reaches | **[M] `xref.py callers 289F54` finds EIGHT**, all `moveq #$14,D0`: `$253C1A` [0] and `$253EF8` [2] are ported; `$253DB6` [9], `$25401A` [3], `$254176` [4], `$2542BA` [5], `$2543E4` [6], `$25450E` [7] are behind loud named throws. **2 of 8 reachable** is the honest coverage sentence. |
| "the templates are PC-relative at `($28A506,PC)` / `($28A786,PC)`; art unpriced" | `$28A786` is **not a template, it is a 256-entry POINTER TABLE**, indexed by `$803916 * 4` with **no mask** - and [M] `$28A786 + 256*4 == $28AB86`, which is `addq.b #1,$803917`, **code**. It resolves to **15 distinct templates that differ only in a starting animation cursor**. `$28A506` is the LASER's, not the shot's. |
| 1,766 `$289F54` spawns / 6,185 frames = 0.29 per frame | **[M] 1,393 in 2,204 tapped frames on the shipped seed = 0.63 per frame, and 0 in the no-fire control.** Recon 50 ran `--no-pods`; L3 gave the option pods shots that hit things. **The number moved UP, and it moved for exactly the reason W52 §0.1 found one level earlier.** |

**AND ONE THING NOBODY HAD:** `$289F62 addq.b #1,$803917` is the FIRST
instruction of `$289F54` after its gate. `src/rng.js`'s own header has named
that site since wave 8 as the reason `$803916` is a compared column - *"any
unported caller of that routine desynchronises every later draw"* - and until
this wave the port did not bump it. **Porting the spark fixes a shared-RNG
desync the port has carried since wave 8**, and it visibly moves the
trajectory: [M] a tapped run's `$26C1C4` wall moves from step 2,204 to 2,192.

---

## 1. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---|---|---|
| `$289F3A..$289F4D` | 20 | the whole-pool clear (both halves + both count words) | `spark.js clearPool` |
| `$289F54..$289F95` | 66 | THE ALLOCATOR's entry, the `$813098` failure return, the shared-RNG bump, the template pick, the P1/P2 fork | `spark.js spawnSpark` |
| `$28A060..$28A095` | 54 | its shared tail: the 30-vs-15 scan and the `ori #1,SR` no-free-slot return | same |
| `$28A1DA..$28A231` | 88 | the record FILL from the 22-byte template | `spark.js fillSlot` |
| `$28A39E..$28A3DB` | 62 | fill tail for kind `$14`: the random heading, the speed clamp, `$241D34`, the 4x one-shot nudge | `spark.js fillTail28A39E` |
| `$28A098..$28A1D9` | 322 | THE DRIVER: budget, cull bound, both delay counters, the animation, three free paths, the 12-byte bulk emit into bucket 20 | `spark.js runSparkDriver` |
| `$242E24`, `$242FFC`, `$28ABE0` | 62 | three more members of the `$803917` RNG family | `rng.js` |
| - | - | `$28C714`'s note re-labelled: it is a SOUND CUE | `shots.js` |

**Zero new pools modelled beyond pool E. Pools A, B, C and D are untouched and
still counted notes. `games/gradius/` NOT TOUCHED.**

### 1.1 THE GEOMETRY, and every arithmetic closes on a landmark  [M]

```
$81D394 + 30*$22 == $81D790   P1 -> P2                      EXACT
$81D790 + 30*$22 == $81DB8C   P2 -> the live count           EXACT
$289F40 move.w #$3FD,D0 -> $3FE words = 2,044 B from $81D394
                          == both halves + BOTH count words  EXACT
$28A786 + 256*4  == $28AB86 == `addq.b #1,$803917`, CODE     EXACT
$28A5C2 + 36*4   == $28A652 == template 1's own base         EXACT
$28A770 + 22     == $28A786 == the pointer table             EXACT
$28ABFA + 64     == $28AC3A == `lea $81DB90,A0`, CODE        EXACT
```

and one cross-check that is worth more than any of them: **the descriptor
list's stride is `$C` = 12 mask words, and the record's own `($e,A6)` is
`$0208` = 1 wide x 8 high.** `2 + wide*high + 2 == 12`. The animation table's
spacing and the sprite's declared size agree, out of two unrelated places in
the cartridge.

### 1.2 Four semantics a "tidy" port gets wrong

1. **D5 IS BOTH THE PER-FRAME RECORD BUDGET AND THE CULL BOUND, AND IT MOVES.**
   `$28A0CA` builds `$700000D0`; `$28A102 subq.w #1,D5` decrements it once per
   live slot; `$28A17C cmp.l D5,D0` uses THE WHOLE LONG. The short-axis half of
   the off-screen bound tightens by one for every record already emitted this
   frame. Splitting them into two variables is right about the intent and wrong
   about the arithmetic. (`subq.w` never borrows into the high word, so `$7000`
   is stable - that is why it works at all.)
2. **A FREE SLOT COSTS NO `dbra`.** `$28A0FC beq $28A0F6` loops back without
   touching D7, so the walk runs until it has processed `$81DB8C` LIVE slots and
   is **not bounded by the pool**. A wrong count word reads the bullet driver's
   RAM as a spark record. The ROM has no guard; the port throws by address.
3. **EITHER DELAY COUNTER ADVANCES THE ANIMATION.** `$28A150` decrements
   counter B and, if it did NOT borrow, jumps to `$28A132` to try counter A;
   either borrow reaches `$28A15C`. [M] every one of the 15 spark templates has
   `+$12/+$13 = 0`, so counter A borrows on EVERY frame - which is why a spark
   is exactly as many frames long as its cursor allows and the `$0E`/`$06`
   counter B never gets to matter.
4. **THE DRIVER HAS ALREADY ADVANCED A6 BY 4** before it dispatches, so every
   displacement in `$28A132`/`$28A150`/`$28A15C` is relative to rec+4. Reading
   them as slot-base offsets shifts the whole record map by two fields - and it
   is what makes `($12,A6)` look like a pointer when it is the cursor.

### 1.3 [M] ENTRY 0 OF THE ANIMATION IS NEVER DRAWN, and it is harvested anyway

`$28A15C` reads the cursor BEFORE `$28A160 subq.w #4`, and `$28A164 bcs` frees
the slot on the borrow. So a record that reaches cursor 0 dies instead of
drawing `list[0]`, and the largest cursor any template carries is `$8C` = entry
35. **Predicted from the branch, then MEASURED: 35 distinct streams reached over
every run, `$22CA1C`..`$22CBB4`, and `$22CBC0` never once.** All 36 are
harvested regardless - trimming to 35 would size the harvest off my reading of a
branch instead of off the table's own extent, which is `46-diag`'s tank hulls.

---

## 2. THE POOL CENSUS - the drain proof, over long runs  [M]

The shipped bundle seed, `$810424 = $FF` each step, three inputs, to each run's
honest end. Per frame the probe scans all 60 slots for `word0 != 0` AND reads
`$81DB8C`, so "the count word and the slots agree" is an assertion on every
frame, not a summary.

```
                                   TAP (every 4)    HOLD          NO-FIRE (CONTROL)
[M] frames run                        2,192          1,766          4,001
[M] stopped by                       $26C1C4        $26C1C4        ran to the end
[M] pool E live slots, MAX            24 of 60       10 of 60       0 of 60
[M] $81DB8C max                       24             10             0
[M] $81DB8C vs the slot scan   0 DISAGREEMENTS  0 DISAGREEMENTS  0 DISAGREEMENTS
[M] frames back at ZERO after
    the first spawn                   2              1,717          -
[M] allocator FAILURE returns
    ($28A078 / $813098)               0              0              0
[M] bucket 20 records            22,185           117              0
[M] ...max per frame                  24             10             0
[M] first record                      lf+27          lf+23          never
[M] distinct spark streams            35             35             0
[M]   ...with art                     35             35             -
[M]   ...NAMED-missing                 0              0             -
```

**THE HELD RUN IS THE DRAIN PROOF AND IT IS THE STRONGEST ROW HERE.** The pool
fills to 10 over 26 frames and is then **empty on 1,717 consecutive frames** -
holding fire charges the beam and the ordinary shot cadence nearly stops (W52
§0.1), so the pool gets a burst and then nothing. A leaking pool cannot go back
to zero. The tapped run does the same thing under continuous pressure: 24 of 60
is the high-water mark of a pool that is being refilled 0.63 times a frame and
freed at least as fast.

**And the structural half, which is what makes 24 of 60 not luck:** every spark
is freed unconditionally by `$28A164` after at most 36 frames, whatever else
happens. There is no path that consumes a slot without one of the three frees
releasing it, and the three are `$28A116` (budget), `$28A1A0` (the animation
cursor) and `$28A1BC` (the off-screen cull), all of which `clr.w` word 0 AND
`subq.w #1,$81DB8C`.

**[M] AND THE BOARD SIZED BUCKET 20's STAGING BUFFER AT EXACTLY THIS POOL'S
CAPACITY**: `BUCKETS[20].capBytes` is 720 = 60 records of 12, and pool E is 60
slots. The same relationship W52 §0.2 measured for buckets 22/23. The bulk
writer cannot overrun its bucket; the port checks it by address anyway.

---

## 3. THE ART - 36 streams, 0.8 KiB, and BOOT WENT DOWN

```
[M] BOOT BEFORE   473.2 KiB   (export-web.mjs's own figure, HEAD's exporter)
[M] BOOT AFTER    472.0 KiB   -- 1.2 KiB SMALLER
[M] deferred      745.4 -> 746.2 KiB
    shard 8 spark   36 streams  mask 326 + col 510 = 0.8 KiB
```

Boot fell while 36 streams, two ROM windows and a ninth shard were added, and
the arithmetic is three numbers:

* **+0.8 KiB** - the two new ROM windows in `player.tables.json.gz`
  (`$28A5AC+$5DA`, the templates + list + pointer table; `$28ABFA+$40`,
  `$28ABE0`'s draw table). 133,612 B, from 132,824.
* **+0.5 KiB** - `manifest.json` for shard 8's entry and the fetch order.
* **−2.5 KiB** - **the manifest is written COMPACT now.** W47 §2.4's own rule
  is that `manifest.json` is the one body served UNCOMPRESSED, so every byte of
  it is a boot byte; [M] it was **10,282 B pretty-printed at one space per level
  and is 7,722 B with the whitespace gone. A quarter of the file was
  indentation.** Not one `note`, `why` or number is dropped - the prose W47 §2.3
  needs for the "SPRITE SHARD n DID NOT LOAD ... it holds N streams" panel is
  all still there, and any formatter puts the indentation back for a human.

**[M] AND THE OTHER IDEA WAS MEASURED AND REJECTED, recorded so nobody
re-derives it.** `player.tables.json`'s 117 ROM windows are **380,040 hex
characters**, which looks like exactly the waste W47 found in the stream table.
Re-encoding every window as base64 makes the raw JSON 27 KB smaller and the
**gzipped body 14.4 KB BIGGER - 133,612 → 148,032 B** - because hex carries 4
bits of entropy per byte and deflate eats it, while base64 carries 6 and it
cannot. Hex is the right encoding, and it is right by measurement.

Shard 8 is DEFERRED and fetched **fourth** (`SPR_ORDER = [0, 7, 6, 8, 1, 2, 3,
4, 5]`): its deadline is the first frame a shot CONNECTS, which is behind the
first enemy bullet (shard 7, +0.7 s) and the first fire frame (shard 6).
[M] first spark record lf+27 tapped, lf+23 held.

**Shard 0 is untouched**, so `capture.bin` is byte-identical and `bundlegate`'s
pixel identity cannot have moved.

---

---

## 4. EVERY CHECK SEEN TO FAIL

### 4.1 Thirty-eight unit mutants, thirty-seven named reds, ONE survivor

`node games/ddpdoj/.scratch/mutate53.mjs`: apply ONE edit, run ONE test file,
require a NAMED test red, restore, **verify the file's sha256 is byte-identical**
(the harness throws on a mismatch). Every restore matched.

| # | mutation | the NAMED test that went red |
|---|---|---|
| M1 | `$28A068` the 30-vs-15 branch inverted - **recon 50's own reading** | `$28A062 gives THIRTY slots when $81308C is NON-ZERO…` |
| M2 | a full pool fails SILENTLY | `a full pool is a COUNTED failure, not a silent discard` |
| M3 | `$289F5A`'s `$813098` failure return ignored | `$289F54 tst.w $813098 is a FAILURE RETURN…` |
| M4 | `$289F62` does not bump the shared RNG counter | `$289F62 bumps the SHARED RNG counter…` |
| M5 | `$289F68` masks the pointer index with `$3F` | `the four family members draw in ROM ORDER, each with ITS OWN mask` |
| M5b | `$289F6E`/`$289F70` computed in 32 bits, so D5 never wraps or goes negative | `$289F6E/$289F70 are WORD doublings and $289F78 SIGN-EXTENDS…` |
| M6 | `$289F82` picks the pool half the other way | `…the ONLY thing that picks P1 over P2` |
| M7 | `$28A1F6 addq.w #4,A0` dropped | `$28A1DA fills the record … field by field` |
| M8 | `$28A216` read as a WORD (the cursor never installed) | same |
| M9 | `$28A1FC` the negative-attribute arm inverted | `a POSITIVE template attribute is taken as-is…` |
| M10 | `$28A20A` the `$2000` flip on a NON-zero draw | `$28A20C ORs $2000 … exactly when $242FFC draws a ZERO` |
| M11 | `$28A3AA` the speed clamp dropped | `$28A3A8 addq.b #8 / $28A3AA clamp to $24…` |
| M12 | `$28A3B6` the shot's own angle not added | same |
| M13 | `$28A3CC` the one-shot 4x nudge dropped | `…nudges the position by FOUR TIMES it` |
| M14 | **`$28A164` the cursor borrow does not free the slot - W33's leak, rebuilt** | `$28A164 FREES the slot when the cursor borrows…` |
| M15 | `$28A15C` samples the cursor AFTER the decrement | same |
| M16 | counter B's borrow does not reach the animation | `counter B borrowing advances the animation on its own` |
| M17 | `$28A136` tests the SIGN instead of the borrow | `EITHER delay counter borrowing advances the animation` |
| M18 | `$28A17C` the off-screen cull dropped | `$28A17C culls a record that has passed $7000…` |
| M19 | `$28A178` reads D6's high word | same |
| M20 | D5 split - the cull bound stops moving with the budget | `D5 is the budget AND the cull bound…` |
| M21 | `$28A0FC` a free slot costs a `dbra` | `$28A0FC skips a FREE slot without consuming the dbra` |
| M22 | the pool-overrun guard removed | `a count word that outruns the pool is a LOUD NAMED THROW…` |
| M23 | the emitter selector not range-checked | `an emitter selector outside 0/4/8/$C…` |
| M24 | `$28A0FE` the record budget never frees | `$28A0FE frees a record when the … BUDGET runs out` |
| M25 | `$28A1B4` APPENDS to bucket 20 | `…OVERWRITES bucket 20's counter` |
| M26 | `$28A180` two 16-bit shifts instead of one 32-bit | **SURVIVOR - see below** |
| M27 | `$289F3A` clears only P1's half | `$289F3A clears both halves AND both count words` |
| M28 | an unported fill kind filled as if it were the spark | `a kind other than $14 is a LOUD NAMED THROW…` |
| M29 | the `$28A5AC` window one entry short of the pointer table | `the exporter ASSERTS pool E's data block…` |
| M30 | the extent assertion no longer runs on every export | same |
| M31 | the harvest trimmed to the 35 entries a run reaches | `the spark art is harvested by ROM ADDRESS, 36 entries…` |
| M32 | the spark folded into the BOOT shard | same |
| M33 | the driver dropped from `TYPE5_PORTED` | `TYPE5_PORTED is THIRTEEN of the twenty-three…` |
| M34 | the shot handler stops spawning the spark | `$253C18 SPAWNS the spark now…` |
| M35 | the fetch order back to W52's (the spark last) | `the two weapon shards are DEFERRED and fetched FIRST…` |
| M36 | `$242E24` masks with `$3F` instead of `$7F` | `…each with ITS OWN mask` |
| M37 | `$28ABE0` masks with `$7F` instead of `$3F` | same |

**FOUR OF MY OWN CHECKS COULD NOT FAIL WHEN FIRST WRITTEN, and the mutation
cycle caught all four rather than review.** They are recorded as category (a),
defective checks, because that is what they were:

* **M5, M36 and M37 all survived against a FLAT RNG fixture.** The three tables
  were filled with one repeated byte, so a wrong mask read a different index and
  got the same answer. Three different masks over one counter (`$289F68` none,
  `$242E24` `$7F`, `$28ABE0` `$3F`) is exactly the shape a flat fixture cannot
  see. The fixture is index-dependent now, and there is a test whose only job is
  the four draws in ROM order.
* **M34's first target was a test file that does not test it.** A skipped or
  mis-aimed mutant is not a passed one (W52 §4.1's own lesson); it is aimed at a
  source assertion now, and the REAL check for it is the gate run in §4.3.

**M26 IS THE SURVIVOR AND IT IS PROVABLY UNCATCHABLE.** `$28A180 asr.l D4,D0 /
and.l #$07FF03FF,D0` - a port that shifted the two 16-bit halves separately gets
the same answer for **every input**, because the mask removes precisely the bits
the two forms differ in. `src/spritequeue.js` TRAP 1 says this in general ("two
independent 16-bit shifts agree ONLY because of that mask"); at this site the
mask is applied immediately, so there is nothing left to observe. [M] 3,000,000
random longwords plus an exhaustive sweep of all 65,536 high words: **0
differences**. Category (c) of the brief's three, and the port keeps the 32-bit
form because that is the instruction.

### 4.2 The exporter's own checks, seen red against the CARTRIDGE

A unit test can only read the exporter's source. These run the real export
against the real ROM; each file was sha256'd byte-identical after.

| mutation | what it printed |
|---|---|
| the pointer table claimed as 128 entries | `$28A786's pointer table: this file says 128 entries ending at $28A986, but $28A986 is not [addq.b #1,$803917] (0028a7020028). $289F68 indexes it with an UNMASKED $803916, so a short table reads a template out of code.` |
| the templates claimed to start one entry low | `the pool-E templates run $28A5AC..$28A786; this file says $28A596..$28A786…` |
| the spark list claimed to end one longword early | `sprite table $28a5c2 stride 4: the cartridge's run of consecutive stream starts is 36, ending at $28a652; this file says 35 ending at $28a64e…` |

**AND THE SECOND MESSAGE WAS DEFECTIVE WHEN FIRST WRITTEN** - it hardcoded
`$28A5AC` in its own text, so mutating the EXPECTATION printed the same range on
both sides of the sentence. Both sides come out of variables now, and the
mutation was re-run against it.

### 4.3 The GATE stage, seen to fail against the real bundle

| cut | what the stage printed |
|---|---|
| the spark harvest cut to 9 of 36 entries | `FAIL: W53 THE IMPACT SPARK … shard 8 holds 9 streams (expect 36) and the port's own $800000 list carries 2963 records (expect 8843) over 8 distinct images (expect 35), first at frame 33 (expect 24)` |
| **`$253C18` stops spawning the spark - the whole wave, undone** | `FAIL: W53 … 0 records of them (expect 8843) over 0 distinct images (expect 35), first at frame -1 (expect 24)` |

**AND THE SECOND CUT IS ALSO THE PROOF OF §0's RNG CLAIM.** With that one line
removed, `webgate`'s W52 stages snapped straight back to **22,071 and 4,388** -
the exact numbers W52 measured. Nothing else in the tree moved. That is the
shared draw counter `$803917`, isolated to one instruction and measured from the
other side.

### 4.4 THE SCORING, RE-MEASURED - the brief's own "VERIFIED HAS A SHELF LIFE"

W51 measured the ledger; this wave changes what runs (every connecting shot now
advances `$803917`), so the ledger was re-read rather than inherited. Same
1,500-frame tapped window, one line different:

```
                            WITH the spark      WITHOUT it (one line)
[M] kills reaching $28615E        130                 130
[M] $81B4C0 pending score   $00077515           $00077515
[M] $81B5DA chain                 304                 304
[M] $81B5C0 meter / cap        56 / 56             56 / 56
[M] $81B64A rank feed               0                   0
[M] $286674 executions            128                 128
[M] $803916 RNG state            $C2                 $14      <- the ONLY move
```

**The ledger is unmoved and the counter moved by 174 draws.** That is not a
vacuous "nothing changed": the intervention is demonstrably live, and the score
path is demonstrably indifferent to it, over a window in which 130 enemies died.

---

## 5. THE PAGE, IN A REAL BROWSER - WHAT I SAW  [M]

Chrome + Python `playwright`, the recipe W42 established. Nothing downloaded.
**Both servers were killed afterwards and [M] zero `python -m http.server` and
zero `srv53` node processes remain - AND ONE ORPHAN THAT WAS NOT MINE.** The
final sweep found `python serve.py 8125 404` still listening, started at 22:45
by **`pgm.py check`'s own background-shard `--break shard-404` stage**, which had
outlived its parent run. Killed with the rest. The eight orphans of 4 Aug that
locked `dist/` are the reason this sweep exists; this one says the gate leaks
them too, and that the sweep has to be by process, not by "did I start it".**
[M] zero listeners on 8125, 8753 or 8754 afterwards.** - checked with `Get-CimInstance
Win32_Process`, not with `ps`, which does not see them on this machine and would
have reported the orphan as gone while it was still holding the port. (It did:
the first kill attempt "succeeded" and the server was still serving.)

### 5.1 **THE SPARK IS ON THE SCREEN**

**[M] Flying the ship UP into the tanks and tapping fire: TWO BRIGHT
YELLOW-WHITE EIGHT-POINTED STARBURSTS, one on each side of the ship, sitting
exactly where the two option pods' shots meet the two enemies flanking it.**
They flash and are gone within a few frames; over a fourteen-frame burst of tight
crops they appear, move with the enemies and vanish. They are a different thing
from the ship's own orange exhaust plume directly beneath it (which the control
has too) and from the blue and pink enemy bullets.

**[M] THE CONTROL - the same flight path with fire never pressed - has NEITHER
starburst on any of the fourteen frames.** No shot connects, so no spark can
exist. That is the whole claim, and it is the same shape as §2's measurement:
8,843 records with fire and 0 without.

`spr 9/9` on the status line at every sample - all nine sprite shards land - and
**not one address the page names is a spark stream.** The remaining `NO ART`
list is W47/W52's own leftovers (`$233F34`, `$22DA70`, `$22DED4`, `$12D430`,
`$12CD8C`), all background elements or other producers' rows.

### 5.2 THE FAILURE MODE, SEEN - and it names the spark by what it IS

Served with `spr/*.shard8.u16.gz` held back, the page ran normally through boot
and through the whole no-fire window, and **stopped at logic frame 2715 - the
first frame a shot connected - with:**

```
AN ASSET IS MISSING OR BROKEN.
SPRITE SHARD 8 DID NOT LOAD (assets/spr/mask.shard8.u16.gz: HTTP 404 ...).
It holds 36 sprite streams -- THE IMPACT SPARK: pool E 36-frame animation
$28A5C2, the flash where a bullet CONNECTS (W53). 0.8 KiB. -- and a record has
asked for one of them. Those records are SKIPPED AND NAMED rather than drawn
from zeroed words, so nothing on screen is wrong; this stops because the art
will never arrive.
```

**That is the strongest single piece of evidence in this wave**, because it is
the page itself saying, unprompted, that a spark record exists and is asking for
art - and it says it on the exact frame the simulation first needs it, not at
boot. `demand()` raised it from inside that frame, which is `BgShards`' contract
(W47 §2.2) still holding for a shard built six waves later.

### 5.3 What I did NOT see, stated as a limit

**Nothing here is compared against MAME.** No gate in this repo compares the
port's own list against a board frame, and this wave did not build one. I have
proved the port asks for stream addresses the cartridge's own tables contain,
that the bundle holds them, that they draw, and that they draw ONLY when a shot
connects. **A record with a correct descriptor can still be the wrong record**,
and whether this spark looks like the board's spark is unmeasured.

---

## 6. COVERAGE - branches and table entries, never frames

* **`$289F54`'s call sites: 2 of 8 reachable**, 6 behind loud named throws
  (dispatch nibbles 3, 4, 5, 6, 7 and 9). All eight pass `moveq #$14,D0`.
* **pool E's producers: 1 of 4 ported.** `$289F96`, `$289FC0` and `$289FDA` -
  the LASER's three, all inside code W45 already ported - stay counted notes,
  with their own template `$28A506` and their own 36-stream list `$28A51C`
  (`$22C6BC..$22C860`, [M] 0.4 KiB gz) deliberately NOT harvested. **The laser's
  own impact spark is therefore still missing, and it is named rather than left
  to look done.**
* **`$28A1DA`'s fill dispatch `$28A232`: 1 of 8 entries transcribed**; the other
  seven throw by address.
* **`$28A140`'s emitter table: 2 of 4 entries executed** (`$28A150` via selector
  `$C`, and `$28A132` reached from it every frame). Entries 0 and 8 are
  transcribed-and-unexercised: no spark template carries selector 0 or 8.
* **the animation list: 35 of 36 entries reached**, and the 36th is provably
  unreachable (§1.3), not merely unmeasured.
* **the 15 templates: all 15 exported**, and the run reaches the whole cursor
  ladder `$8C..$20` - which is what makes 35 distinct streams appear rather than
  one repeated sequence.
* **transcribed and unexercised, named:** `$28A0AA clr.w $81DB8E` (unreachable
  while D0 = 0 at `$28A098`), `$28A0FE`'s budget free (60 slots against a
  208-record budget), `$28A1FE`'s negative-attribute arm (all 15 templates are
  `$001E`), and `$289F3A` itself - its two callers are `$25FD58` and `$28B5CC`,
  and `$28B5CC` is inside object type 5's "not started" branch, which this port
  throws for.
* **unit tests 635 → 666, 0 skipped.** New file `tests/w53spark.test.js`, 31
  tests -- 28 written first, and THREE more added because the mutation cycle
  found the first set could not see the three RNG masks, the spawn call, or
  `$289F68`'s word wrap (§4.1). `webgate` 9 of 9 → **10 of 10**.

---

## 6.1 THE GATE, ON THE FINAL TREE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

Unchanged from W32..W52's 49/0/0. **Nothing was disabled, skipped, narrowed or
loosened**, and every stage line was read rather than only the verdict. The ones
this wave could plausibly have broken, all green:

- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs --
  the port's own `$800000` build, still byte-exact against the board. **Bucket
  20 is not in `PRODUCED_BUCKETS`**, so the spark's writes do not enter it;
- `bullet mover: per-frame pool drive vs the board` and its 3 REDs. It passes no
  `spriteOut` and compares alive/kind/speed/dir/posA/posB, so it cannot see this
  wave -- **but it CAN see the shared draw counter**, and it is green, which is
  the evidence that `$289F62`'s bump does not move a bullet's own state;
- `fly-around: port vs board, 0 divergent frames` and its 5 REDs -- the only
  2,200-frame port-vs-board window this project has. It never fires, so no shot
  can connect and no spark can spawn; its green says this wave changed nothing
  on the no-input path, which is what `$253C10 tst.w $81308C / beq` predicts;
- `assets/integrity` and its four REDs, **including `[rom-byte]`, the ROM-leak
  guard** -- two new shard files went through it;
- `background shard gate: published tiles past px 160 (+ RED)` -- the stage that
  fresh-exports, i.e. the one the exporter change had to survive;
- `pixel gate` (100.0000 %) and its 9 REDs; `demo gate` and its 4.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/     666 pass, 0 fail, 0 SKIPPED   (was 635)
node games/ddpdoj/tools/webgate.mjs 10 of 10 PASS                 (was 9 of 9)
node games/ddpdoj/tools/bundlegate.mjs
                                    15955968/15955968 = 100.0000%  <- UNMOVED
node tools/build-dist.mjs           clean, 4 deliberate exception(s)
BUNDLE                              472.0 KiB before the first frame (was 473.2)
```

**`PUBLISH_VERBATIM` is still W47's four entries and this wave added none.**
Shard 8's colour body is 652 B and does not appear verbatim in the colour ROM,
which is luck about packing rather than virtue and is stated as such.

**A FIRST GATE RUN WAS THROWN AWAY, for W47's and W52's reason.** It came back
ALL GREEN, but it had been started before this wave's last two source edits.
The 49/0/0 above is a clean re-run on the tree that is committed, with nothing
else touching `assets/`.

---

## 7. WHAT THIS WAVE DID NOT DO

- **Nothing is compared against MAME.** §5.3.
- **The LASER's three pool-E producers are NOT ported** (`$289F96`, `$289FC0`,
  `$289FDA`), and their art is not harvested. The driver in `src/spark.js` would
  step their records correctly the day they land; until then the beam's own
  impact flash is missing. §6.
- **Pools A, B, C and D are untouched.** `$289004`/`$288E4E` (E5b, 218.4 KiB of
  art), `$289098`/`$2890F2` (pool D, and `50-recon` §4.2's second leak),
  `$27F8F8`/`$27F95A` (the impact pool, still E4's refusal) and `$2440E0` (E5c)
  are all still counted notes. **The DEATH explosion is not in this wave** - the
  owner's "no explosions" is half answered, and the half that is answered is the
  4.6x more frequent half.
- **`$26C1C4` is still the wall.** A tapped run now reaches it at step 2,192
  rather than 2,204, because the spark's RNG bump shifts the trajectory. The
  enemy-layer export frontier is unchanged and is not this wave's.
- **`$28C714` was RE-LABELLED, not ported.** It is a sound cue and belongs to
  the sound wave the owner deferred.
- **Nothing was published.** The bundle on disk is the one that would ship;
  `tools/publish.mjs` deploys all three games and the deploy is the
  orchestrator's call.
- **`games/gradius/` was not touched.**

---

## LOG (appended as findings arrive)

- opened.
- §0 [M]: **recon 50's 30-vs-15 branch is BACKWARDS**, its 652 B stops one
  instruction short of the record fill, `$289F54` has EIGHT call sites and not
  two, `$28A786` is a 256-entry POINTER TABLE whose far end is pinned by code,
  and its 1,766 / 6,185 spawn figure is now **1,393 / 2,204 = 0.63 per frame**
  because L3 gave the option pods shots that hit.
- §0 [M]: **`$289F62` bumps `$803917`, the SHARED RNG COUNTER**, and porting the
  spark closes a desync `src/rng.js` has named since wave 8. It moves the
  tapped run's `$26C1C4` wall from step 2,204 to 2,192 - the port changing
  toward the board, not away from it.
- §1.3 [M]: **animation entry 0 (`$22CBC0`) is provably never drawn** - predicted
  from `$28A15C`/`$28A164`, then measured: 35 of 36 streams reached, on every
  run. Harvested anyway, and named.
- §2 [M]: **THE CENSUS. 24 of 60 slots at the high-water mark over 2,192 tapped
  frames; the count word agrees with a full slot scan on 2,192 of 2,192 frames;
  0 allocator failures; and a HELD run fills to 10 and then sits at ZERO for
  1,717 consecutive frames.** 22,185 bucket-20 records where every run before
  this wave had 0.
- §3 [M]: **BOOT 473.2 -> 472.0 KiB. It went DOWN while 36 streams and two ROM
  windows were added**, because the manifest lost 2.5 KiB of indentation. And
  base64 for the ROM windows was measured and REJECTED: 14.4 KB bigger gzipped.
- §4.1 [M]: 38 mutants, **37 turned a NAMED test red**, every restore
  byte-identical by sha256. **FOUR of my own checks could not fail when written**
  and the mutation cycle caught all four -- three of them because the RNG
  fixture was FLAT, which cannot see a mask. One survivor, `$28A180`'s 32-bit
  `asr.l`, **provably uncatchable**: the `$07FF03FF` mask removes exactly the
  bits two 16-bit shifts would differ in (3,000,000 random longs plus an
  exhaustive high-word sweep, 0 differences).
- §4.2 [M]: three exporter assertions seen red against the CARTRIDGE -- **and
  one of my own messages was defective**, printing the same range on both sides
  when the EXPECTATION was mutated. Both sides come out of variables now.
- §4.3 [M]: **the W53 gate stage SEEN TO FAIL** -- 9/2,963/8 against
  36/8,843/35 with the harvest cut, and 0 records with the spawn removed. **And
  that second cut is the proof of the RNG claim**: W52's stages snapped straight
  back to 22,071 and 4,388 with one line gone.
- §4.4 [M]: **THE SCORING RE-MEASURED, not inherited.** 130 kills, `$00077515`
  pending, chain 304, meter 56/56 -- IDENTICAL with and without the spark over
  1,500 tapped frames, and `$803916` the only thing that moved ($14 -> $C2).
- §5 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER. Two bright yellow-white
  starbursts, one on each side of the ship, exactly where the pods' shots meet
  the enemies flanking it -- and NEITHER of them on any frame of the same flight
  with fire never pressed.** With shard 8 withheld the page ran normally and
  stopped at logic frame 2715, the exact first frame a shot connected, naming
  the shard by what it holds. Both servers killed; zero orphans.
- §6.1 [M]: **`pgm.py check` ALL GREEN 49/0/0, 0 SKIPPED**, on a clean re-run of
  the committed tree; unit tests 635 -> 666; `webgate` 9 of 9 -> 10 of 10;
  `bundlegate` 15955968/15955968 = 100.0000 %, UNMOVED; `build-dist` clean with
  W47's same four exceptions.

status: **DONE**
