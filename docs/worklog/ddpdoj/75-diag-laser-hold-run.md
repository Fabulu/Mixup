# 75 - DIAG: the owner's own run (park at the bottom, hold the laser), and what the invisible things ARE

status: **DONE** - §3 names all five types with board evidence and a picture, §4
answers "does it grow after the midboss" (it does not; **one type arrives**),
§5 is the divergence report, §6 is what the brief got wrong.

started: 2026-08-05
role: SCENARIO + DIAGNOSTIC. Scope: `games/ddpdoj/tools/` and the scenario
corpus. **`games/ddpdoj/src/` belongs to T1 this wave and was NOT written to.**
`games/gradius/` not touched. No web server was started.
target: `ddpdojblk` VERSION-B. Every address is build B unless the line says so.

**THE OWNER, verbatim:**

> *"Also, launch an oracle backed run where you sit at the bottom of the screen
> and just shoot your laser. That way you should kill the mid boss. Then those
> invisible things you hit should appear. Maybe debris or something? But weird"*

`[M]` = measured by me this session, on the cartridge through MAME 0.288 or on
the checkpoint ladder that run left. Anything from another document is
`[cited]` and named.

---

## 0. THE ANSWER, IN FOUR LINES

`[M]` **They are not debris. Four of the five are ordinary enemies with ordinary
art that the cartridge draws in full, and the fifth has no sprite of its own on
either side.**

| type | what the CARTRIDGE draws | size | bucket |
|---|---|---|---|
| **`$82`** | a **large blue-and-white forward-swept-wing fighter aircraft**, firing a blue beam | `$1735FC`, 6x88 = **96 x 88 px** | **7** |
| **`$05` `$07` `$27`** | a **tan/olive helicopter with a turning four-blade rotor** | the `$171xxx` family, 3x40 = **48 x 40 px** | **7** |
| **`$10`** | a **gold armoured walking mech / heavy tank** | the `$16Cxxx..$16Exxx` family, 4x48 = **64 x 48 px** | 0, 1 and **3** |
| **`$8B`** | **NOTHING - it has no sprite record on the BOARD either.** It is a lattice of `40x16` hitboxes, HP 32, laid on a grid; the picture belongs to a **bucket 2/3 background element** | - | none |

`[M]` And the owner's "after killing the first boss, more and more shows up" is
**one specific arrival, not a growing population**: type `$82` - the biggest of
them, and the one W68 `[cited]` found *cannot die* in the port - **first appears
at lf3,825, the same 25-frame rung the midboss vanishes on, and is never seen
before it or after lf7,400.**

---

## 1. THE SCENARIO - `stage1-laser-hold`, and every number in it was measured first

`games/ddpdoj/tools/oracle/scenarios.json`, additive:

```
tail = 1970=DA;2200=DAL;2400=DAR;2502=DA
```

**LABEL, and it goes first: this is SCRIPTED INPUT, NOT A HUMAN PLAYING, and the
ladder is POKED.** `$810424` (the player's `($3e,A6)` invulnerability timer) is
held at `$FF` from lf1960 on both sides. `docs/knowledge/09`: this yields
STATES, not a picture of the game.

Everything in that one line was measured on the board before it was written
(`out/w75/probe.tsv`, `walls.tsv`, `step.tsv`):

| `[M]` | value |
|---|---|
| the player record does not exist until | **lf1968** - a 150-frame `D` from lf1750 moved nothing at all |
| the vertical wall pair | `$800` = **the BOTTOM** (confirmed on a framebuffer PNG) and `$6500` = the top |
| the horizontal wall pair | `$300` left, `$3500` right, centre `$1C00` |
| holding Button 1 drives the speed index | **22 → 12 by lf2052** - the laser ramp `$24C8BE`, i.e. the laser is UP |
| the horizontal step at index 12 | **exactly 63 units/frame** |
| the parked position, verified in the run | `py = $800`, `px = $1C1A` at lf2503 - 26 units, ~half a pixel, right of centre |

`D` stays held for the whole run on purpose: it is what *sitting at the bottom*
means, it pins the ship so nothing can drift it, and it keeps the input word
constant for 17,000 frames. **NOT Button 3** - the corpus's own "firing" idiom
is the auto-shot, and W69 `[cited]` measured that the port blocks on its first
frame. **NOT a tap** - the owner asked for the LASER.

### 1.1 The ladder

```
[M] python pgm.py ckpt stage1-laser-hold --every 100 --also 3600,3625..4700 --verify
    LADDER 210 of 210 rungs taken in 795 s (24.7 logic frames per wall second)
    VERIFY wave-4 PROBE_RAMDUMP lf2000 sha256=d270474d6a28d783...4eba2cc7
    VERIFY wave-69 ladder rung  lf2000 sha256=d270474d6a28d783...4eba2cc7
    VERIFY IDENTICAL
```

Thirteen minutes of emulator, once, for a 210-rung ladder spanning the whole of
stage 1 at 100 frames, and 25 frames across the midboss. Every number below is
JavaScript over files that already existed after that.

### 1.2 THE CONTROL, AND IT REFUSES HALF THE BRIEF'S PREMISE

`stage1-laser-hold-natural` - byte for byte the same script, **no poke**.

```
[M] death at lf2237, respawn lf2310
[M] death at lf2605, respawn lf2678
[M] death at lf2996
[M] the player record is GONE from lf3067 and never returns
```

**A ship that parks at the bottom of stage 1 and holds the laser is out of lives
at lf3,067 - 758 logic frames BEFORE the midboss dies.** So the brief's *"that
kills the midboss"* is true **only with the invulnerability intervention**. A
human holding the laser dodges; a parked script does not, and this is exactly
the kind of thing `docs/knowledge/09` means by a seeded or poked run giving
states rather than a picture of the game. Every figure in §3–§5 is from the
POKED ladder and is labelled as such.

---

## 2. THE INSTRUMENT - `tools/boarddl.mjs`

Diagnostic 68 `[cited]` measured which types the **PORT** never draws. It could
not say what they ARE, because the port never draws them. **The cartridge draws
them**, and a W69 checkpoint is the whole 128 KiB of main RAM - which is where
the display list (`$800000..$8009FF`), the enemy table (`$81332C`, 58 x `$50`)
and the sub-record pools (`$81459C`/`$81521C`) all live. So the answer was
already on disk. Nothing in this tool launches an emulator.

**A slot predicts its ENTIRE five-word hardware entry**, through
`enqueueRequest` (`$23D762`) and the emit (`$23D624`) instruction for
instruction, so a match is an equality on 80 bits rather than the
descriptor-only lookalike 68 §11.3 flagged as a floor.

**Bucket attribution is RECONSTRUCTED.** The thirty counters at `$80AFC0..` are
cleared at `$23D70C`, so they are all zero at the sample point; the queue
(`$80397C`), the 29 staging buffers and `$80AFFC` (the emitted byte count) are
not. Walking the queue forwards and matching each 12-byte record against the
head of each staging buffer in turn recovers the boundaries.

```
[M] 210 checkpoints, 21,735 display-list records, 0 UNPLACED
```

### 2.1 EVERY CHECK SEEN TO FAIL - and all three mutations are defects this tool actually shipped

```
[M] --break type-from-word0        RED OK: moved 42 of 14 types  (35 types instead of 14)
[M] --break desc-only              RED OK: moved 2 of 14 types
[M] --break bucket-no-head-search  RED OK: moved 9 of 14 types (every bucket -> b0)
```

* **`type-from-word0`** - read the enemy type from the WORD at `+$0` instead of
  the byte at `+$C`. That word is `(caller's D3 + band index) | $8000`, so the
  census comes out as a **tidy contiguous `$00..$29`** and looks entirely real.
  **This tool printed exactly that on its first run and I nearly believed it.**
* **`desc-only`** - 68's instrument. It turns type `$82`'s 115 soft matches into
  115 "exact" ones and moves 3 of type `$11`'s records between buckets, i.e. it
  cannot tell two objects carrying the same sprite apart.
* **`bucket-no-head-search`** - start the greedy at queue index 0 instead of
  searching for bucket 0's own length. Every record on the screen is then
  attributed to bucket 0, which is plausible *because bucket 0 really is the
  biggest bucket*. The tool did this too, and the report looked fine.

The check is DIFFERENTIAL - baseline first, then the mutation, and it requires
the ANSWER to move. That is W69 §9's lesson applied rather than quoted.

---

## 3. WHAT THEY ARE, PER TYPE, WITH BOARD EVIDENCE

`[M]` 210 checkpoints, lf2,000..19,500, poked ladder:

```
type  objF  liveSF  collSF  artSF  EXACT  desc-only  NOT-DRAWN  buckets       first..last lf
$82    155     310     310    155      0        155          0  7:155          3825.. 7400
$07    182     182     182    182    182          0          0  7:182          2600..17900
$05     80      80      80     80     80          0          0  7:80           2500..17200
$27     43      43      43     43     43          0          0  7:43           2200..16300
$10    265     265     254    265    265          0          0  0:226 3:27 1:12 2200..17700
$8B    508     508     498      0      0          0          0  --             --
$11   1302    1302    1261   1302   1302          0          0  0:1164 3:92 1:46
```

**The board draws every one of them that has a sprite at all, on every frame it
is alive.** `NOT-DRAWN` is zero for all five. The type→handler map came out of
the ladder identical to 68's: `$82`→`$2747C6`, `$05`→`$269CEA`,
`$07`/`$27`→`$26A2E2`, `$10`→`$268232`, `$8B`→`$27687E`.

### 3.1 `$82` - A BIG BLUE FIGHTER AIRCRAFT, and it is the owner's "weird"

`[M]` One stream, `$1735FC`, `6x88` = **96 x 88 pixels**, palette 12 (and a
palette-31 variant on 2 of 155 slot-frames - the damage flash), **bucket 7**.

Cropped straight out of the board's own framebuffer at lf4,000 (the record at
long 184, short 12 - the mapping is `png_x = short`, `png_y = 447 - long`, and
the crop lands on the object with no fudging): **a large blue-and-white
forward-swept-wing / twin-boom fighter with white nacelles and orange trim,
firing a blue beam downward.** It is one of the biggest non-boss sprites in the
stage - 96x88 against the tank's 48x32 - and there are up to six on screen at
once.

`[M]` The 155 matches are DESCRIPTOR+SIZE, not 80-bit. That is a shortfall of my
predictor and not of the cartridge: 68 §2.3 `[cited]` names `$82`'s three
enqueue sites as `$274A28`→`$23DBCA`, `$274A4A`→`$23DF86` and
`$274A7E`→`$23DF58`, which are three *different* stubs from the `$23D762` shape
I replicate, so they take a different pair of position fields. The board's own
entry is used for the position and the bucket, and the tool prints `(soft N)`
rather than quietly claiming an exact match.

**So the owner's "no splosions" has a face now.** 68 `[cited]` measured
`$274AF0`, `$82`'s death arm, as an unported note reached 213 times, so *"the
enemy stays alive with negative HP instead of dying"*. `[M]` The thing that
cannot die and cannot be seen is a 96x88 aircraft, and it is the single largest
invisible object in the game.

### 3.2 `$05`, `$07`, `$27` - HELICOPTERS

`[M]` All three share the `$171xxx` stream family - `$1718F4 $171970 $1719EC
$1717FC $171878 $171A68 $171134 $171704 $171780 $171AE4 $171BDC $171CD4 $171EC4
$171FBC` - all `3x40` = **48 x 40 px**, palette 11, **bucket 7 on every single
one of the 305 slot-frames**.

Cropped at lf3,000: **a small tan/olive helicopter, seen from above, with a
white-and-green four-blade rotor turning over it.** The separate stream per
frame IS the rotor animation.

**This is the cheapest fix in the project and it is now visual rather than
statistical.** 68 §2.4 `[cited]` measured `$1718F4` as ALREADY IN THE SHIPPED
SHEET, and W69's wave list `[cited]` costs the wiring at thirty instructions
inside `$269D84..$269E1C`. `[M]` The board puts every record of all three types
in bucket 7 - the bucket the port already fills 100 % of the time - so nothing
but the enqueue is missing.

### 3.3 `$10` - A GOLD ARMOURED WALKING MECH

`[M]` The `$16Cxxx..$16Exxx` family, `4x48` = **64 x 48 px**, palette 11.
Cropped at lf6,000 and lf5,000: **a gold/tan armoured walker with a grey gun
barrel and green trim**, standing on the road.

`[M]` **AND THIS CORRECTS 68 ON A POINT OF MECHANISM.** 68 filed `$10` under
*"the SPRITE POINTER IS NEVER WRITTEN, so the slot is empty"*. That is true of
the PORT and **false of the board**: on the cartridge all 265 of `$10`'s live
slot-frames carry a descriptor and a size, and all 265 are emitted. So `$10` is
the same defect as `$05`/`$07`/`$82` - an unported tail - one step earlier, not
a different one.

`[M]` Its records land in **buckets 0 (226), 3 (27) and 1 (12)** - the first of
the five to reach bucket 3, which matters for §4.

### 3.4 `$8B` - NOT AN ENEMY SPRITE AT ALL

`[M]` 508 slot-frames, 498 of them collidable, and **zero carry a descriptor or
a size on the BOARD**. The cartridge does not draw them either. Their geometry:

```
[M] half-extents $500/$500/$200/$200 = a 40 x 16 px box, HP 32, on a LATTICE
    lf3000: long 374,388,402 (step 14) x short 79,87,95,127,135,143 (step 8)
```

`[M]` Annotating those boxes on the board's own framebuffer at lf3,000 puts them
squarely on **a large gold crystalline structure set in a black pit** - and the
display-list record covering exactly that area is

```
[M] dl34  BUCKET 3  $172D18  5x64 (80 x 64 px) pal24  long 365..445  short 87..151
```

`[M]` At lf6,000 the surviving `$8B` box at (453,17) sits inside

```
[M] BUCKET 2  $232578  21x112 (336 x 112 px) pal19  long 421..757  short -32..80
```

**`$232578` is one of the five bucket-2 streams 68 §5.2 `[cited]` measured as
MISSING from the port's shipped art, and `$172D18` is in the `$172xxx` family
68 named for bucket 3.**

So: `$8B` is the **collision volume of a destructible piece of scenery whose
picture is a background ELEMENT, not a sprite record**. In the port the box is
live and the picture is absent, which is the owner's *"some tanks are on the
golden terrain but also invisible stuff that gets hit"* and *"terrain starts
being black after the golden terrain"* **in one object**.

This is measured overlap plus a negative fact (no sprite record on either side),
not a proof of ownership: only walking `$2623F4..$2631CA` can say which element
index owns which lattice, and I did not do that.

---

## 4. **DOES THE POPULATION GROW AFTER THE MIDBOSS? NO - ONE TYPE ARRIVES.**

`[M]` The midboss is type `$0D` (`$26B6FA`). On the 25-frame rungs:

```
lf     $0D  $82  $05  $07  $27  $10  $8B   all enemy objs   DL records
3800     1    0    0    0    0    1    9         19            114
3825     1    1    0    0    0    1    9         19             91      <- $82 ARRIVES
3850     0    2    0    0    0    1    9         17             82      <- the midboss is GONE
3875     0    2    0    0    0    1    9         15             72
3950     0    3    0    0    0    0    5         12             52
4100     0    5    0    0    0    1    5         18             79
4200     0    6    0    0    0    1    5         21             99
```

`[M]` **Type `$82` first appears on the same 25-frame rung the midboss is last
seen on, and grows 1 → 6 over the next 375 frames.** It is present on 155
slot-frames between lf3,825 and lf7,400 and on **not one rung outside that
window** in 210 checkpoints spanning the whole stage.

`[M]` The other four were always there - `$27` from lf2,200, `$10` from lf2,200,
`$05` from lf2,500, `$07` from lf2,600, `$8B` from before the ladder starts -
and the *total* invisible-in-port population does **not** trend upward:

```
[M] mean live objects of the five types per checkpoint, per 1,000 lf
    lf2000  5.1   lf3000 11.9   lf4000 11.9   lf5000  5.3   lf6000  7.8
    lf7000  2.6   lf8000  0.0   lf9000  0.0   lf10000 5.4   lf11000 5.5
    lf12000 0.7   lf13000 2.1   lf14000 5.9   lf15000 11.0  lf16000 3.6
    lf17000 3.9   lf18000 0.0   lf19000 0.0
```

**So "more and more invisible stuff shows up after the first boss" is a real
observation with a different cause than a growing population.** What changes at
the midboss is that the **biggest** invisible object - 96x88 px, six at a time,
firing beams, and unable to die because `$274AF0` is unported - starts arriving.
Before lf3,825 the invisible things are 48x40 helicopters; after it they are
96x88 aircraft. That is what "more and more" looks like from the player's seat.

`[M]` And it compounds with the second cause 68 named: bucket 2 and bucket 3's
missing background-element art arrives on the same schedule (§3.4), so the same
stretch of stage loses its terrain AND gains its largest invisible enemy.

### 4.1 The bucket question, answered

`[M]` **The four types that carry sprites do NOT draw in buckets 2 or 3 in the
main.** `$82`, `$05`, `$07`, `$27` are **100 % bucket 7** (490 of 490
slot-frames); `$10` is bucket 0/1/3 with 27 of 265 in bucket 3. That confirms 68
§1's correction and refuses the tidy "one bucket explains everything" story.

**But the fifth does, and it is the one with no sprite.** `$8B` is drawn by
whatever owns the bucket-2 and bucket-3 records its lattice sits inside (§3.4).
So **two fixes, not one**: the enqueue tails for `$82`/`$05`/`$07`/`$27`/`$10`
(bucket 7 and 0/3, art mostly present), and the bucket-2/3 element art for
`$8B`'s scenery (W71's export wave `[cited]`).

---

## 5. THE PORT, PAST THE MIDBOSS - `seedcmp` over the same ladder

```
[M] node tools/seedcmp.mjs --manifest .../stage1-laser-hold/manifest.json
    SEGMENTS 209: 14 green, 13 red, 182 BLOCKED, 0 SEEDBAD, 0 error
                  1,657 logic frames compared
```

**`0 SEEDBAD` at 210 board states of a scenario nothing in this repo had ever
run.** The port's state agrees with the board on all 94 compared columns at
every rung before a single frame is stepped.

### 5.1 THE PORT CANNOT RUN THIS INPUT, AND THE REASON IS THE LASER'S OWN SPARK

`[M]` 182 of 209 segments block on their first frame. Grouped by family:

| blocked segments | family |
|---:|---|
| **67** | `$262xxx` - the BACKGROUND ELEMENT sites (`$2627CA` x15, `$26286E` x13, `$26281C` x12, `$26294E` x11, `$2629AE` x11, `$2628DE` x5) |
| **66** | **`$28A5xx` - the LASER's own impact-spark descriptor list** (`$28A520`..`$28A5A0`, 26 distinct entries) |
| 22 | `$29xxxx` - the stage-1 boss (`$295304`, `$2943B0`, `$2956F6`, `$295120`) |
| 27 | `$233030` x6, `$228658`, `$232xxx`, `$229xxx` - stage 2's streams |

`src/spark.js` names the `$28A5xx` family in its own words `[cited]`:

> *"THREE MORE PRODUCERS FILL THIS POOL, all of them the LASER's, all of them
> inside code W45 ALREADY PORTED, all of them still counted notes ... They read
> a DIFFERENT template (`$28A506`) and a DIFFERENT 36-entry descriptor list
> (`$28A51C`) ... **The laser's own impact spark is therefore still missing,
> deliberately.**"*

`[M]` **That declared deferral is what stops a held-laser comparison.** It was a
one-line caveat in a file; on the owner's own input it is the wall, and it
blocks a third of the stage. This is the first time anything has handed the port
a held laser, so the cost of that deferral had never been priced.

### 5.2 THE FIRST DIVERGENT FIELD PER SEGMENT

```
[M] shot1   first at lf2004   (segment from lf2000)   the laser's own records
[M] shot2   first at lf2010
[M] oflg1   first at lf2028   $8104AB, the option/fire handshake -- port=135 board=7
[M] vf      first at lf3778   (segment from lf3775)   port=3845  board=3846
[M] irq6    first at lf3778
[M] optilt  first at lf10104
[M] opglow  first at lf10104
[M] b19 b15 first at lf10104   the ship's and the pods' sprite buckets
[M] d0ce d0d2 first at lf10104
[M] b5      first at lf10303
```

**The first non-shot field to move is `vf`/`irq6` at lf3,778 - SLOWDOWN - and
that is 4,449 logic frames EARLIER than W69's lf8,227.** `[M]` `irq6 port=1
board=2` means the board spent two video frames on one logic frame, which
`portdiff.mjs` already says the port's budget cannot predict.

**W69's lf8,227 is confirmed as a property of ITS input, not of the port.** The
laser-hold run drags the board into slowdown 47 frames before the midboss dies
and again at lf7,875, because a held laser plus the impact-spark pool is a
heavier frame than a tapped shot. **The number to quote is now
"lf3,778 on `stage1-laser-hold`, lf8,227 on `stage1-play`" - never one of them
alone.**

`[M]` The 14 GREEN segments are lf3825..3875, 3925..4000, 4100..4225,
4525..4575, 7600..7800 - **and eight of the fourteen are the 25-frame rungs
immediately AFTER the midboss dies.** The port reproduces the board exactly
across the frames the owner is asking about; what it cannot do is DRAW them.

`[M]` The 13 RED segments diverge on `oflg1` alone in 8 of 13 cases - the option
block's fire handshake at `$8104AB`, first at lf2,028, which is a held-fire
field the corpus's tapping scenarios never exercised.

---

## 6. THE BRIEF'S PREMISE, CHECKED

| the brief says | `[M]` verdict |
|---|---|
| "sit at the bottom and hold the laser - that kills the midboss" | **TRUE, but only with the intervention.** The poked ladder kills it by lf3,850; the un-poked control is out of lives at lf3,067 (§1.2) |
| "those invisible things ... maybe debris or something" | **REFUSED, and this is the finding.** They are a 96x88 fighter aircraft, a 48x40 helicopter and a 64x48 gold mech. No debris (§3) |
| W68's five types | **CONFIRMED as the types and as the handlers**, and **CORRECTED on `$10`**: 68's *"the sprite pointer is never written"* is a PORT fact; the board writes it on all 265 slot-frames (§3.3) |
| "the population grows after the midboss" | **REFUSED as stated.** The total does not grow; ONE type (`$82`) arrives exactly at the midboss's death and is the biggest of them (§4) |
| "do they cluster in buckets 2/3, which draw ~0 %" | **HALF.** The four with sprites are 100 % bucket 7 and 0/1/3. The fifth, `$8B`, has no sprite at all and its scenery IS a bucket-2/3 element - including `$232578`, one of 68's five named missing streams (§3.4, §4.1) |
| W69's "first non-shot divergence `irq6` at lf8,227" | **REFINED: that is a property of `stage1-play`.** On a held laser it is **lf3,778** (§5.2) |

---

## 7. WHAT I COULD NOT DETERMINE

1. **The port side of §3 is `[cited]`, not re-measured.** 68's per-type emission
   figures are the PORT's; `src/` belongs to T1 this wave and I did not run the
   port's display list. Everything I measured is the BOARD's.
2. **Which background element index owns `$8B`'s lattice.** §3.4 is measured
   overlap plus the negative fact that neither side writes a sprite pointer. It
   needs a walk of `$2623F4..$2631CA` to become ownership.
3. **`$82`'s exact enqueue arithmetic.** 155 of 155 are descriptor+size matches
   because the three stubs 68 names are not the `$23D762` shape. The tool says
   `(soft N)` rather than claiming more.
4. **`$8A` and `$4D`.** `[M]` 222 and 368 slot-frames carrying art that the
   board's display list does not contain at the sample point. Not in the five,
   not chased. Presence, not absence.
5. **One input, and a poked one.** 210 checkpoints of one scripted route with
   the player invulnerable. Another route reaches types this one never spawned;
   every count here is a floor.
6. **The bucket reconstruction is a reconstruction.** 0 unplaced of 21,735
   records is strong and is not a proof - only the counters at drain time would
   be, and they are cleared before the sample point.

---

## 8. WHAT DID NOT CHANGE

* `games/ddpdoj/src/` - **not written to.** T1 owns it this wave.
* `games/gradius/` - not touched. No web server was started.
* `node --test games/ddpdoj/tests/` - **934 pass, 0 fail, 0 skipped.**
* `scenarios.json` is **purely additive** - 22 inserted lines, 0 deleted.
* Nothing ROM-derived is committed: the ladder, the traces, the framebuffer PNGs
  and every crop live under `games/ddpdoj/tools/oracle/out/`, which is
  gitignored, or in the session scratchpad.

---

## LOG (appended as findings arrived)

- opened.
- `[M]` **the brief's premise checks out on the board**: a ship parked on the
  bottom wall with the laser held is killing things from lf2,100 (score 59,240
  by lf2,590 on an un-poked probe).
- `[M]` §1.2: **and half of it does not.** Un-poked, this exact input is out of
  lives at **lf3,067**, 758 frames before the midboss dies. The kill needs the
  intervention.
- `[M]` §2.1: **three red checks, and all three are defects this tool shipped** -
  including one that printed a tidy contiguous `$00..$29` type census I nearly
  believed.
- `[M]` §3.1: **type `$82` is a 96x88 blue forward-swept-wing FIGHTER AIRCRAFT**,
  stream `$1735FC`, palette 12, bucket 7 - cropped out of the board's own
  framebuffer. Not debris.
- `[M]` §3.2: **`$05`/`$07`/`$27` are HELICOPTERS with turning rotors**, the
  `$171xxx` family, 48x40, palette 11, **bucket 7 on all 305 slot-frames**.
- `[M]` §3.3: **`$10` is a gold armoured walking mech**, 64x48 - and 68's
  *"sprite pointer never written"* is a PORT fact; the board writes it every
  frame.
- `[M]` §3.4: **`$8B` has no sprite on the BOARD either.** It is a 40x16 hitbox
  lattice on the gold crystal structure, whose picture is bucket 3 `$172D18` and
  bucket 2 **`$232578` - one of 68's five named missing streams.**
- `[M]` §4: **the population does not grow. `$82` ARRIVES**, on the same 25-frame
  rung the midboss vanishes, and on no rung outside lf3,825..7,400.
- `[M]` §5.1: **the port blocks on 182 of 209 segments**, 66 of them on
  `$28A520..$28A5A0` - the laser's own impact-spark descriptor list, a DECLARED
  deferral in `src/spark.js` that had never been priced because nothing had ever
  handed the port a held laser.
- `[M]` §5.2: **the first non-shot divergence is `vf`/`irq6` at lf3,778** -
  slowdown, 4,449 frames earlier than W69's lf8,227, which is therefore a
  property of `stage1-play` and not of the port.
- `[M]` §5.2: **eight of the fourteen GREEN segments are the rungs immediately
  after the midboss dies.** The port reproduces those frames exactly. It just
  does not draw them.

status: **DONE**
