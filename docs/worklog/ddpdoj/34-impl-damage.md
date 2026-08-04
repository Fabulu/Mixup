# W34 — IMPL: enemy DAMAGE — the path from a player shot to an enemy's death

status: **DONE** — see §8.
wave: 34. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless the line says why not.

## THE BRIEF

W33 established that **8 of the 9 remaining stage-1 handlers are unreachable
until enemy DAMAGE lands** — the midboss halts the scroll at clk 197 and the
port cannot kill it, so the distance clock stops at 239 and every handler whose
first trigger is beyond that is dead code no run can reach.

This wave ports enemy damage: the path by which a player shot reduces an
enemy's HP, and what happens at zero (death, score, the effect/impact pool, the
chain/hit bookkeeping). **Enumerate statically first, with a real denominator.**
Then port, then MEASURE which of the 8 blocked handlers become reachable.

The OWNER CONSTRAINT (`20-OWNER-scoring-must-be-exact.md`) binds: if the damage
path touches score, chain or rank, the ORDER of those writes within the frame is
part of the specification. W19 §1.5 measured the order on the board; this wave
must state how it established the order it implements.

---

## 1. THE INVENTORY, READ OUT OF THE ROM BEFORE ANY PORTING

`games/ddpdoj/tools/oracle/w34damage.py` (committed, so every number below is
reproducible) over `tools/oracle/out/maincpu.bin` — the decrypted build-B image,
address == file offset. It scans build B only (`$230000..$2A0000`) for absolute
`jsr`/`jmp` and for pc-relative `bsr.w`/`bsr.b`/`bra`. It **cannot** see
`jsr (An)` through a pointer or `jsr (d16,PC)`, so every count is a LOWER BOUND
and a zero means "no site of those kinds", never "nothing does this".

### 1.1 THE CALL-SITE POPULATION — the denominators

```
  routine  abs  pcrel   what
  $244D62    4      0   THE COLLISION/DAMAGE PASS  (all four are $28B6B8/$28B6FE/
                        $28B766/$28B79C, i.e. object type 5's tail -- nothing else)
  $244D40    1      0   ...its no-player entry
  $2459D0    0      0   the PLAYER's own box vs $817F8E  (reached by `jmp (pc)`)
  $2453AC    0      1   the LASER's collision pass
  $24536E    1      0   the LASER entry, from $24CE46 inside the option object
  $286096   85      0   A HIT LANDS -- the per-hit score/chain entry
  $28615E   87      0   A KILL -- the enemy's score value, from the CALL SITE
  $2862C6    0      3   P1's per-hit chain machine
  $286476    0      3   P2's per-hit chain machine
  $286626    0     28   THE ONE BCD ADDER
  $28663A    0      2   P1's chain-meter REFILL
  $2866DE    0      2   P2's chain-meter REFILL
  $289004  294      0   the sprite-EFFECT allocator
  $263762  218      0   freeEnemy (PORTED since W23)
  $28614A    8      5   the P1 pending-score wrapper
  $286154    8      5   the P2 pending-score wrapper
  $286128   24      0   the by-D1 pending-score wrapper
  $2842B0    1      0   the pending -> total DRAIN (once a frame)
```

`$286096`'s 85, `$28615E`'s 87, `$289004`'s 294, `$286626`'s 28 pc-relative and
`$2842B0`'s single caller all reproduce W19 §1.2 and W28 §1 L12 **independently**
— a different scanner, written this wave, over the same image.

**AND THE 87 SCORE IMMEDIATES REPRODUCE TOO, WITH THE SAME SELF-CHECK.** A
40-byte back-walk for the last `moveq`/`move.w`/`move.l` into D0 recovers
**87 of 87**, and **87 of 87 are valid packed BCD** (no hex digit A–F). W19 §1.2
recovered the same list; the values are

```
0 0 1 1 8x14 10x7 11x3 13x3 14 15 19x2 20 25 26 31 32x2 34x3 42 46 47 55 72 83
88x2 113 115 130x2 133 162 173x2 174 180 234 250 256 271 290 320 350 353 385x2
457 563 600 632 683 700 712 788 800x4 1000x2 60000
```

### 1.2 THE DAMAGE PASS IS SELF-CONTAINED — one external target, and it is the laser

Scanning **every even offset** of `$244D62..$245312` for `jsr`/`jmp`/`bsr`:

```
  -> $2453AC   $24530C/bsr.w
```

**ONE target, and it is the laser's own pass.** The collision/damage routine
calls nothing else — no allocator, no score routine, no effect spawner. That is
the single most important structural fact of this wave: porting damage delivery
drags in NOTHING. (W31's enumeration of the midboss found 16 external targets;
this found one.)

### 1.3 THE SCORE CORE'S EXTERNAL TARGETS — three, and all three are unreachable here

Same scan over `$286096..$2866A8`:

| target | site | reachable in this port? |
|---|---|---|
| `$286876` | `$2860F2` | behind `btst #2,D1` — **the BOMB hit bit** (`$400`, set only at `$245242`/`$2452F2`, both in the A2/A3 weapon loops). No bomb in the port. |
| `$286A82` | `$2860C8` | behind `$8130F8` bit 2 **and** `$811F72` negative **and** its bit 0 — **the LASER**. No laser in the port. |
| `$286DA8` | `$2860DA` | the P2 mirror of `$286A82`, same gate. |

Everything else `$286096..$2866A8` names is inside itself.

### 1.4 THE SIX BLOCKS OF `$244D62`, and which one is "a player shot"

Read out of the listing, in ROM order. A6/A5 are post-incremented in four of
them, so **`$16(A5)` is record `+$18`** — the same HP word the handlers test
with `tst.w $18(A6)`. Getting that wrong makes the whole routine read as if it
damaged a different field.

| # | span | what it walks | who it damages |
|---|---|---|---|
| 1 | `$244D62..$244D92` | sets up, `jsr $2459D0(pc)` | the PLAYER's box (L16) |
| 2 | `$244D94..$244DFE` | `$816B7C` × `$8171BA`, stride `$3E` | flags only (`or.w $80FA72,-$4(A6)`) |
| 3 | `$244DFE..$244E5C` | `$8171BE` × `$817F7E`, stride `$2A` | flags only |
| 4 | `$244E5C..$244EE0` | the enemy pool, count `$815E9E + $815EA0` | **`$244ED2 subq.w #1,$16(A6)` — RAMMING costs the enemy 1 HP** |
| 5 | `$244EE0..$244F66` | the 36 shot records | nothing — it builds the shots' BOUNDING BOX at `$80FA74..$80FA7B` |
| 6a | `$244F68..$245076` | `$81459C` (100) × the 36 shots | **THE SHOT DAMAGE** |
| 6b | `$245078..$245188` | `$81521C` (50) × the 36 shots | **THE SHOT DAMAGE** |
| 7 | `$24518A..$24525C` | `$811802` vs 150 enemy slots | the A2 weapon object |
| 8 | `$24525C..$245310` | `$811892` vs 150 enemy slots, then `bsr $2453AC` | the A3 weapon object + the laser |

**"The path by which a PLAYER SHOT reduces an enemy's HP" is blocks 5, 6a and
6b, and nothing else.** Blocks 1–3 are L16 (the ship being hit), block 7/8 are
L13 (bomb/laser). Block 4 is enemy damage but consumes block 1's box.

### 1.5 A CORRECTION TO `10-recon-combat.md` §4

That recon reads `$245058 cmpi.w #$6F00,(A5)` as "unless the target's **type
word** is >= `$6F00`". It is not the type word. A5 has been post-incremented by
`$244F8C move.w (A5)+,D0`, so `(A5)` is record `+$2` — **the X coordinate**. The
A2 loop settles it from the other side: `$245248 cmpi.w #$6F00,$2(A5)` with A5
un-incremented is the *identical* test written against the base. Same constant,
same field, two addressing modes.

### 1.6 `$289004` IS 40 INSTRUCTIONS AND I AM STILL NOT PORTING IT — the reason is measured

`$289004..$289082`, read in full: `andi.w #$7F,D1`, the range check
`cmpi.w #$21,D1` (**34 kinds**, `$00..$21`), `move.w #$4F,D1` +
`lea $81B732,A0` + `lea $38(A0),A0 / dbra` (**80 slots of `$38`**), free test
`tst.w (A0)`, and a failure return of `lea $81C8B2,A0` — which is exactly
`$81B732 + 80*$38`, i.e. **the one-past-the-end slot is the bit bucket**.
A0 is deliberately NOT restored by the closing `movem.l`, so A0 is the result.

**Every one of those numbers matches W28's [M] denominators.** So why not port
it? Because of who frees a slot. Complete census of the pool base
(`xref.py lea 81b732` + `abs`): `$187948`/`$187B5E`/`$18798E` (build **A**),
`$25A668`, `$288E0C`, **`$288E52`**, `$289024`. `$288E52` is inside **`$288E4E`
— type-5 call #5**, which is one of the thirteen this port counts and does not
run. It is the pool's only driver: a 120-instruction animation machine over
`$221520`/`$221630` that ends an effect.

**Allocating without it reproduces W33 §4 exactly** — a pool whose free test is
"word 0 is zero", filled by a producer with no consumer, silently failing after
80 allocations. That defect cost four waves of coverage numbers. Porting the
allocator this wave would recreate it knowingly.

### 1.7 THE FRAME-ORDER QUESTION, AND WHY HALF THE LEDGER IS **NOT** PORTED

The owner constraint makes order semantics. Read out of the ROM:

```
$240F62[0] = $28D520          the top-level object TYPE 0
  $28D52E  jsr $2842B0        the pending -> total DRAIN
  $28D534  jsr $28444E        the HUD/score object, and INSIDE IT:
             $2845C4 tst.w $81B5C8 ... $284614 ... $284636 subq.w #1,$81B5C0
                                       <-- THE CHAIN METER DECREMENT
```

So **both** per-frame ledger events W19 §1.5 measured as last —
`drain > drain0 > (brkT) > meter-` — live in **object type 0**, one of the
sixteen top-level dispatch entries the port does not have. And the path from
`$28444E` to `$284614` is *gated*: `$28445C bne $284CF2`, `$2844AE`/`$2844BA
bne $2847FE`, and `$2844C4 bmi $28465C` **jumps past the decrement entirely**.
Reproducing that needs `$285F8A`, `$285F52`, `$285A12` (the HYPER), `$285B3C`,
`$285C5E` and the TX printer `$240DC2` — W28's waves 8 and 9.

**So this wave ports the HIT half of the ledger and not the PER-FRAME half, and
the reason is W19 §1.6's own** — it declined to port the rank clock because
"porting the arithmetic without the slot would bake in an order that later has
to be unpicked". Calling `$284636` from a place I chose would do exactly that.

---

## 2. WHAT WAS PORTED

| file | what |
|---|---|
| `src/damage.js` (NEW) | `$28B670`, type 5's TAIL, all four arms; `$244D62` blocks 5, 6a and 6b — the shot bounding box and both enemy pools |
| `src/score.js` (NEW) | `$286096`, `$28615E`, `$2862C6`, `$286476`, `$286626`, `$28663A`, `$2866DE`, `$286664`, the four wrappers |
| `src/shots.js` | `$253BDE` and `$253ECA` — the shot's own HIT paths, which were loud named throws |
| `src/handlers.js` | the damage-reaction arm of every ported handler, and TWO DEFECTS (§3) |
| `src/midboss.js` | the body's and the eight arms' `$286096`/`$28615E` |
| `src/type5.js` | the tail runs, after the twenty-three calls, where it is |
| `tools/export-tables.py` | ONE new 8-byte window: `$287DF0` (the cap) + `$287DF4` (the refill) |

### 2.1 THE FOUR ARMS OF `$28B670`, AND WHY THE PASS IS A 30 Hz CHECK

`$80390C` is the per-frame alternation word `src/shipsprite.js` already
documents. MEASURED across every 128 KiB RAM dump in `tools/oracle/out/`:

```
stage1-shot.seed3701  $80390A=$0BBA  $80390C=0     stage1-shot.seed4446  $0EA3  1
stage1-shot.seed3716  $80390A=$0BC9  $80390C=1     stage1-shot.seed4447  $0EA4  0
```

— it flips every logic frame. With `$81308C` = 1 (frozen, in every dump) the
tail therefore runs **`$244D62` on the frames `$80390C` is 0 and `$244D40` —
the player's box, no shot loop at all — on the frames it is 1.** The shot-vs-
enemy check is a 30 Hz check on a 59.19 Hz machine, and it is not an
approximation the port chose.

**AND THE TWO ARMS' SENSES ARE OPPOSITE, twenty-six bytes apart.**
`$28B6B6 bne.b $28B706` for P1 and `$28B6FC beq.b $28B706` for P2. Reading the
second as a copy of the first inverts which shot table gets to damage anything;
mutation M6 is exactly that and it reddens.

### 2.2 WHAT IS NOT PORTED, AND UNDER WHICH ADDRESS IT IS COUNTED

| noted at | what |
|---|---|
| `$2459D0` | the PLAYER's own box and, with it, blocks 2–4 — including `$244ED2 subq.w #1,$16(A6)`, the one HP an enemy loses to being RAMMED. All four defer together because 2–4 consume block 1's box. L16. |
| `$24518A` | the A2 and A3 weapon objects and `$24530C bsr $2453AC`, the laser. L13. |
| `$244D40` | the tail's no-shot entry. |
| `$286674` | the cap clamp's tail — the hyper-stock bonus into `$81B64A` and `jmp $287682`, which grants the stock `$285A62` turns into +16 rank. |
| `$286876` / `$286A82` / `$286DA8` | `$286096`'s bomb and laser arms. |
| `$28D520` | the per-frame ledger: `$2842B0`'s drain and `$284636`'s meter decrement (§1.7). |
| `$289F54` / `$28C714` | the shot's own impact effect and burst. |
| `$274AF0` | type `$82`'s death arm, reached for the first time by this wave's damage. |

### 2.3 AN UNREACHABLE ARM INSIDE `$286096`, TRANSCRIBED AS A COMMENT

`$2860C0 beq.b $286102` goes to `$286102`, **not** to the P2 laser arm eight
bytes later, and `$2860CC bra.b $2860DE` steps over it. So
`$2860CE..$2860DC` — `btst #3,D1 / add.w $81B640,D0 / bsr $286DA8`, a complete
P2 mirror of the arm above it — **has no path into it at all.** It is in
`src/score.js` as a comment and not as code, because writing it as code would
give the port a path the cartridge has not got.

---

## 3. TWO DEFECTS THE DAMAGE PATH EXPOSED, BOTH INVISIBLE UNTIL NOW

Both are in handlers ported by W25 and reviewed since, and neither could be
seen by any run: `$286096` was a note, so **no enemy's HP had ever moved and no
damage-reaction arm had ever executed.**

### 3.1 TYPE `$11`'s DEATH WAS COLLAPSED FROM TWO STAGES INTO ONE

The port read

```js
if ((ram.u16(a6 + S.hp) & 0x8000) !== 0) { deathSeq11(...); return; }
```

The ROM is

```
$268920 tst.w ($18,A6) / $268924 bpl.b $268990
$268926 tst.b ($20,A5) / $26892A bmi.w $268844   <- ONLY if already marked
$26892E move.w ($26,A5),($18,A6)                 <- RELOAD the HP
$268934 moveq #$8,D0 / $268936 jsr $28615E       <- score 8
$26893C bset #$7,($20,A5)                        <- MARK it
$268942 tst.w $815EA2 / bne $268990              <- one effect per frame
$268988 bra.b $268990                            <- and FALL INTO THE FIRE
```

**Type `$11` takes TWO trips to zero to die, scores 8 on the first and `$10` on
the second, and KEEPS FIRING on the first.** The old code lost all four facts.
Type `$10`'s equivalent arm (`$26829E`) was right, which is what makes the
`$11` one legible as a slip rather than a reading.

Type `$10` had a smaller version of the same: its first-stage arm ended in a
`return` where `$2682F0 bra.b $2682F8` falls into the fire machine, so the fire
machine's counted note was suppressed on every damage frame.

### 3.2 TYPE `$82`'s HP CLAMP WAS A WHOLE-BLOCK NOTE THAT RETURNED

`$274822..$274850` is eight instructions and is the **only** place type `$82`'s
HP is written back:

```
$274836 move.w ($18,A6),D4
$27483A cmp.w ($38,A6),D4 / ble $274844
$274840 move.w ($38,A6),D4            <- CLAMP DOWN to the floor
$274844 move.w D4,($18,A6) / $274848 move.w D4,($38,A6)
$27484C tst.w ($18,A6) / bmi $274AF0  <- THE DEATH ARM
```

With the note in place **a type `$82` could never die however hard it was
shot**, and the death arm `$274AF0` was unreachable. Ported; `$274AF0` itself is
now a note under its own address, so the enemy survives with negative HP and
says so instead of dying silently.

---

## 4. THE MEASUREMENT — AND IT FALSIFIES THE BRIEF'S PREMISE

`tools/w34damagegate.mjs` (committed), on `fly-around`'s seed at lf2000. The
input is an INTERVENTION and the tool prints it as one: the recorded stick for
the trace's own 2,200 frames and then a free run, plus `--stick` (the owner's
own script from `docs/knowledge/09` — hold DOWN, sweep left/right) and
single-frame Button-1 taps every 4 logic frames. `--no-pods` disables the
option object, because a held raw Button-1 bit throws at `$24C164` (the laser
gate) on its FIRST frame. Nothing here is compared against the board.

### 4.1 THE HEADLINE, AND ITS CONTROL

| | `--fire 4` | `--no-fire` (THE CONTROL) |
|---|---|---|
| frames | 12,000 | 12,000 |
| shot-vs-enemy overlaps that damaged an enemy | **2,064** | **0** |
| kills reaching `$28615E` | **343** (`$1`×25 `$8`×172 `$10`×140 `$26`×3 `$83`×3) | **0** |
| P1 pending score `$81B4C0` | **`$00532278`** packed BCD | `$00000000` |
| chain counter `$81B5DA` | **343** BCD | 0 |
| chain meter / its cap | **56 / 56** — the cap W19 measured on the board | 0 / 0 |
| max distance clock `$8130CE` | 836 | **836** |
| unported stage-1 handlers dispatched | **8 of 8** | **8 of 8** |

### 4.2 **W33 §3's WALL WAS THE WINDOW, NOT THE DAMAGE**

W33 measured "the deepest clock any port run can reach is 239" and concluded
that **eight of the nine remaining stage-1 handlers are unreachable until enemy
damage lands**. That is the premise this wave's brief was built on, and the
control above falsifies it: **with zero hits and zero kills the clock still
reaches 836 and all eight handlers still execute.**

The mechanism, measured frame by frame (`$8130CE`, `$813176`, the midboss's
sub-record):

```
lf3098  the midboss spawns              lf4021  $813176 -> 0, the scroll STOPS
lf4250  the clock passes 239            <-- 50 frames after fly-around ENDS
lf4320  clk 244  scroll 0  midboss posX 11072
lf4920  clk 281  scroll 0  midboss posX -8128   (it drifts LEFT, 32/frame)
lf4955  the midboss is FREED by $26B8E2 -- it walked off the left edge
lf9000  clk 836 = $0344, the boss lock W19 §2.4 measured
```

Two facts do the work, and both were already in this repo:

1. **A halted scroll does not halt the distance clock.** W19 §2.1 measured that
   `$26132C addq.w #1,$8130CE` is gated ONLY by the script freeze `($8,A5)`,
   never by the speed; W31 §3.1 watched the board's own clock tick 236→239
   while `$813176` was pinned at 0. So the clock keeps advancing through the
   midboss halt at roughly one per 25 frames.
2. **`fly-around` is 2,200 frames and ends at lf4200**, where the clock is 239.
   W33 read the end of the window as a wall.

So the honest sentence is: **`$27733E`, `$275F30`, `$26A5E4`, `$26AD28`,
`$26A860`, `$29700C`, `$2697F6` and `$292902` — 8 of 8, owning 44 of stage 1's
339 spawn records — are reachable, and every one executed. Damage is not what
made them reachable; running the port past lf4200 is.** The evidence that one
executed is the loud named throw the first run produced with no stubs:

```
BLOCKED at lf4938 by $27733E
  UNPORTED $27733E: enemy handler at $27733E, dispatched from $263538 for the
  record at $81378C (slot 14 of 58)
```

and with `--stub-unported` (a COVERAGE INTERVENTION — each unported handler
counts its dispatch and frees the enemy, as the cartridge's own dummy handler
`$26781C` does) all eight report a dispatch count equal to their record count:
7, 3, 12, 12, 7, 1, 1, 1.

**AND THE FIRST TRIGGER CLOCKS ARE NOT THE ONES W33 PUBLISHED.** The tool reads
them out of the script at run time rather than carrying constants:

```
$27733E 283   $275F30 322   $26A5E4 376   $26AD28 377
$26A860 420   $29700C 464   $2697F6 481   $292902 488
```

W33 §3 lists "283, 322, 420, 424, 464, 481, 488"; 376 and 377 are the two it
got wrong.

### 4.3 WHAT DAMAGE ACTUALLY BUYS, STATED WITHOUT THE FALSE PREMISE

343 kills against 0. The score, chain and meter move for the first time in this
project's history. Three paths that were loud throws now execute
(`$253BDE`, `$253ECA`, and type `$82`'s `$274822` block). And the stage-1 boss
`$292902` is dispatched, so the next wave's largest unknown is now reachable.

---

## 5. HOW THE ORDER WAS ESTABLISHED — the owner constraint

Stated as the brief demands, because it is the part that cannot be checked by
running anything.

**Every write this wave adds happens inside an enemy handler**, at the
instruction the handler reaches: `$26891A`, `$26828E`, `$269CF8`, `$27481C`,
`$27596A`, `$273A68`, `$26B77C`, `$26B848` for `$286096`, and their death arms
for `$28615E`. So the position of every one of them in the frame is **the enemy
driver's dispatch order**, which the port has reproduced since W29 and which
`pgm.py flyaround` compares. **No write below the handler has an order this
wave chose.**

The three ledger events whose order is NOT decided that way are `drain`,
`drain0` and `meter-` — W19 §1.5's last three — and all three live in top-level
object **TYPE 0, `$28D520`** (§1.7), one of the sixteen dispatch entries the
port does not have. They are **not ported**, and the reason is W19 §1.6's own:
porting the arithmetic without the slot bakes in an order that later has to be
unpicked. The consequence is stated, not hidden: **a chain this port starts
never expires**, and `$28D520` is noted by address on every frame the pass runs.

Within one hit the order is the ROM's own `bsr` chain and is transcribed as
such: `$28615E` reloads the cap from `$287DF0` FIRST, then `$2862C6`, inside
which the chain counter increments (`$2863B2`) BEFORE the score add
(`$2863D4`) — W19 §1.5 item 3 — and the meter refill (`$2863E8`) comes between
the two score adds, not after them.

---

## 6. EVERY CHECK WAS SEEN TO FAIL

`games/ddpdoj/tests/w34damage.test.js` (24 tests) plus the three existing files
this wave changed. Mutations applied byte-exactly in Python with a
single-occurrence anchor assertion, the whole 511-test suite run, the file
restored, sha256 verified identical both ways after every one
(`src/damage.js` `ae95e5cf637dc6de`, `src/score.js` `a46faa574844c6d1`,
`src/shots.js` `cfb0aeee134cbc4d`, `src/handlers.js` `1cc5c33b9b1e8cdc`).

| # | mutation | result |
|---|---|---|
| M1 | the outer walk runs COUNT slots, not COUNT LIVE ones | RED — 1 |
| M2 | the box's Y minimum from the RAW Y, not the biased max | RED — 1 |
| **M3** | `$245014`: the SECOND `sub.w ($16,A6)` dropped | **GREEN, then RED — 1** |
| M4 | pool B's `$245138 moveq #$30` test dropped | RED — 1 |
| M5 | pool A's `$245058` X ≥ `$6F00` gate dropped | RED — 1 |
| M6 | `$28B6FC beq` read as `bne` — the P2 arm inverted | RED — 1 |
| **M7** | pool B keeps D7 = `$2800` instead of `$1800` | **GREEN, then RED — 1** |
| M8 | `$286630 abcd` read as a BINARY add | RED — 3 |
| M9 | `$2860E4 moveq #1` read as `moveq #0` | RED — 2 |
| M10 | `$286164 add.w D2,D2` dropped — the cap index unscaled | RED — 1 |
| M11 | `$286314`'s fork inverted — chain when the meter is ZERO | RED — 2 |
| M12 | `$286380 move.w #1,$81B5DA` dropped | RED — 1 |
| **M13** | `$286660 bls` read as `bcs` — no cap clamp | **GREEN, then RED — 1** |
| M14 | `$253BDE bset` read as `btst` — every hit is a first hit | RED — 1 |
| **M15** | `$253C90` read as a WORD, so the anim index stays stale | **GREEN, then RED — 1** |
| **M16** | type `$11`'s two-stage death collapsed back into one | **GREEN, then RED — 1** |
| **M17** | type `$82`'s HP clamp reads `bge` instead of `ble` | **GREEN, then RED — 1** |

**17 mutations, 17 RED. SIX SURVIVED THE FIRST PASS AND ALL SIX WERE DEFECTIVE
CHECKS OF MINE — none was uncatchable**, which is the distinction W31 asked
later waves to keep and W33 kept.

- **M3, M7 and M13 — fixtures sitting where two readings agree.** M3's every
  shot had its four half-extents equal AND the enemy dead-centre, where one
  subtract and two both overlap; the test now drives an enemy `$200` lower,
  where they disagree, with the centred case kept as a control. M7's pool-B
  tests called `poolDamage` directly, and the `$F000` rebias lives in
  `collisionPass` — the test now goes through `runType5Tail`. M13's meter
  OVERSHOT the cap, where `>` and `>=` agree; the two readings differ on
  exactly one value (`meter + refill == cap`) and the test now sits on it.
- **M15 — an assertion written as a DELTA.** It compared the index before and
  after, which is invariant under the mutation; it now pins the absolute value
  the LONG write produces.
- **M16 and M17 — no test at all.** The two defects §3 fixed had no check, which
  is why they had survived since W25. Both now have one.

**Unit tests: 492 → 511 pass, 0 fail, 0 SKIPPED.**

### 6.2 THE RECURRING SKIP — **FOUND, AFTER FIVE WAVES**

`movement.test.js`'s W24 stream inventory has skipped in W29, W31, W32, W33 and
twice in this wave, always with the same message: its gitignored input
`assets/w24-movement/stage1-streams.json` is absent. W29 and W31 attributed it
to "a concurrent `pgm.py check`"; W32 grepped `games/ddpdoj/tools/` for a
remover, found none, and said so; W33 said the mechanism was still
unidentified and refused to repeat the attribution.

**It is `games/ddpdoj/tools/export-web.mjs` line 634:**

```js
fs.rmSync(OUT, { recursive: true, force: true });   // OUT = games/ddpdoj/assets
```

`w24streams.py` writes `games/ddpdoj/assets/w24-movement/`, and `pgm.py check`
runs the exporter — so **every gate run deleted the dump, and the next unit-test
run skipped.** MEASURED here rather than argued: the suite was 516/0/0, I ran
`node tools/export-web.mjs`, and the directory was gone; the gate's own second
run came back `# pass 515 # skipped 1` with `assets/w24-movement/` missing on
disk immediately afterwards.

**Fixed.** The exporter now removes exactly what it owns — `gfx/`, `spr/` and
the top-level FILES — and leaves any other subdirectory alone. Verified: the
dump survives a full `export-web.mjs`, `tools/webgate.mjs` still fetches all 14
files and renders a frame 98.8 % non-black, and the suite is **516 pass, 0 fail,
0 SKIPPED**.

Worth stating plainly for the next reader: W32's grep DID cover this file and
this pattern (`rmSync`, under `games/ddpdoj/tools/`). What it did not do was
resolve `OUT`. A grep that finds a remover and does not follow its argument is
the same class of miss as a note whose address nobody checks.

## LOG (appended as findings arrive)

- opened.
- **the inventory** (§1): `w34damage.py`, committed. 85 / 87 / 294 / 28 / 1 call
  sites reproduce W19 and W28 independently, and the 87 score immediates come
  back 87 of 87 valid packed BCD.
- **`$244D62` names exactly ONE external target in 1,456 bytes** (`$2453AC`, the
  laser). Damage delivery drags in nothing.
- `$286096`'s three external targets are all behind the BOMB or the LASER bit.
- a correction to `10-recon-combat` §4: `$245058`'s `$6F00` test is on the **X
  coordinate**, not the type word — A5 is post-incremented, and the A2 loop's
  `$245248 cmpi.w #$6F00,$2(A5)` is the same test written against the base.
- `$289004` is 40 instructions and **is deliberately not ported**: its only
  driver is type-5 call #5 `$288E4E`, and allocating without it is W33 §4's leak
  rebuilt on purpose (§1.6).
- **the frame-order answer** (§1.7): the two per-frame ledger events live in
  top-level object TYPE 0 `$28D520`, which the port does not have. Every write
  this wave adds happens inside an enemy handler, so its order is the enemy
  driver's dispatch order, which the port already reproduces.
- **PORTED**: `$28B670` + `$244D62`'s three shot blocks (`src/damage.js`), the
  hit/kill ledger (`src/score.js`), and the shot's own hit paths `$253BDE` /
  `$253ECA`, which were loud named throws nothing could reach.
- **TWO DEFECTS** in W25's handlers, both invisible while HP could not move
  (§3): type `$11`'s death was collapsed from two stages into one, and type
  `$82`'s HP clamp was a whole-block note that returned, so a `$82` could never
  die.
- MEASURED: **2,064 overlaps, 343 kills, P1 pending `$00532278` BCD, chain 343,
  meter pinned at its cap 56** — the cap W19 measured on the board. The control
  with the identical script and no fire: **0 and 0**, and the ledger never moves.
- **AND THE CONTROL FALSIFIED THE BRIEF'S PREMISE** (§4.2). W33's "the deepest
  clock any port run can reach is 239" was **the end of the fly-around window,
  not a wall damage removes**: with zero hits the clock still reaches 836 and
  all eight unported handlers still execute. The midboss walks off the left edge
  at lf4955 and `$26B8E2` frees it; the distance clock ticks through the halt
  because `$26132C` is gated on the FREEZE, never on the speed (W19 §2.1).
- 8 of 8 unported stage-1 handlers dispatched, 44 of 44 spawn records, and the
  first-trigger clocks are read from the script at run time: 283 322 **376 377**
  420 464 481 488 — W33 published 420 and 424 for the middle two.
- 17 mutations, 17 RED; six survived the first pass and all six were defective
  checks of mine (§6), none uncatchable.

### 6.1 THE FULL GATE

`python games/ddpdoj/tools/oracle/pgm.py check`, run to completion:

```
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

**RUN TWICE, TO COMPLETION, and the second run was on the FINAL tree** — the
first had already started when the midboss-arm A6 fix landed, and a gate whose
MAME stages ran against a different tree from its unit-test stage is not a
result. Both runs: 49/0/0. Unchanged from W32's and W33's 49/0/0. **Nothing was disabled, skipped,
narrowed or loosened**; no compared column set, window or frame count moved, and
no stage was added. The stages this wave could plausibly have broken all pass:

- **`fly-around: port vs board, 0 divergent frames`** — re-run on the FINAL tree
  as well as inside the gate: **0 DIVERGENT FRAMES on 88 columns over 2,200
  logic frames**, with `$28B670`'s tail now running on every alternate frame.
  Its own `HITEX` line reports what makes that possible: `$245044 fired 0 times
  on the TEN COMPARED RECORDS in the whole window`, because the scenario has no
  buttons.
- `enemy stats: hitbox/HP/palette/HP-reload at spawn (W23)`, whose init bodies
  this wave's handler changes sit beside.
- `spawn walker`, `bullet mover`, and the pattern gate over three corpora.
- `determinism`: three runs, one digest, 2,200 frames × 88 columns IDENTICAL.
- `tools/webgate.mjs`: 14 files over HTTP, one frame rendered, 98.8 % non-black
  — the published page still boots with the new ROM window in the bundle
  (`export-web.mjs` was re-run after `export-tables.py` gained `$287DF0`).

---

## 7. WHAT I COULD NOT DETERMINE

- **Whether the midboss's off-screen exit at `$26B8E2` is right.** It is the
  mechanism §4.2 turns on: with no damage the port's midboss drifts left at 32
  units/frame from posX 11,072 at lf4320 to −8,128 at lf4920 and is freed at
  lf4955. W31 §3.1 compared the board's scroll state only to lf4200 — the end of
  the corpus — and **no recording in this repo covers a frame after that**, so I
  cannot say whether the board's midboss also walks off. If it does not, W33's
  wall is real on the cartridge and false only in the port, and §4.2 would be
  describing a port defect rather than correcting a claim. **What I tried:** the
  `$26B8BE`/`$26B8D8` arm read out of the listing, the position trajectory
  frame by frame, and a search of `tools/oracle/out/` for any trace past lf4200
  with the midboss in it. There is none.
- **Whether the board damages the same enemies on the same frames.** Nothing in
  this wave is compared against the cartridge. `state.js` already taps
  `$245044` on the board (`hitex`/`hitany`), but as a WINDOW-REFUSAL condition,
  not as a compared column, and no scenario records the enemy pool's HP words.
  That comparison is the obvious next measurement and it is a named gap.
- **Whether `$286096` preserves D1** — W31 §9 left this open and this wave did
  not close it, it side-stepped it: `src/score.js` takes the hit mask as an
  ARGUMENT, so the port does not depend on a register convention nobody has
  checked. The ROM's own `$26B7E8 move.w D1,($28,A5)` two instructions after
  `$26B77C jsr $286096` still implies it survives; that is still an inference.
- **The FIELD layout of an effect record.** `$289004` returns A0 and its callers
  write eight to eleven fields into it; those writes are inside the one noted
  gap and I did not decode them.
- **Anything about the board this wave measured itself.** No MAME was run for
  any number above. Every dynamic figure is the PORT replayed against a TSV
  already on disk, or the ROM listing.

## 8. WHERE THE WAVE ENDED

**A. THE INVENTORY: 18 routines enumerated with their real denominators**
(§1.1), reproducing W19's and W28's counts independently, and finding that
`$244D62` names exactly ONE external target in 1,456 bytes.

**B. DAMAGE IS PORTED AND MEASURABLE.** 2,064 shot-vs-enemy overlaps and 343
kills over 12,000 frames against a control of 0 and 0; the score, chain and
meter move for the first time in this project, with the meter pinned at the cap
56 that W19 measured on the board.

**C. 8 OF 8 UNPORTED STAGE-1 HANDLERS EXECUTE — AND DAMAGE IS NOT WHY.** The
control reaches the same clock and the same eight. W33 §3's wall was the end of
the fly-around window.

**D. TWO DEFECTS FOUND AND FIXED** in handlers ported by W25 and reviewed since
(§3), neither of which any run could have seen.

### RANKED, FOR THE REVIEWER

1. **§4.2 and §7's first bullet together.** The premise this wave was
   commissioned on is false in the port; whether it is false on the cartridge
   depends on a midboss exit nobody has compared. Both halves matter and they
   are different claims.
2. **§3.1's two-stage death.** A W25 handler, reviewed by W25's reviewer and
   read again by W30 and W33, had lost four facts of its damage arm. The reason
   nobody saw it is that the arm had never executed — which is the argument
   `docs/knowledge/10` makes about transcription, arriving from the other side.
3. **§5, the order.** No write this wave adds chose its own place in the frame.
   If that reasoning is wrong, the owner's constraint is not met and the
   argument is the thing to attack, not the arithmetic.
4. **§1.6.** `$289004` is 40 instructions and was deliberately NOT ported
   because its only driver is unported. If that judgement is wrong the wave left
   an easy 34-kind subsystem on the table; if it is right, porting it would have
   rebuilt W33 §4's leak on purpose.
5. **§6's six survivors.** Three fixtures sat where two readings agree, one
   assertion was a delta, and two arms had no test at all.

status: DONE

---

## 9. FOR WHOEVER PLANS THE NEXT WAVE

W33 handed this wave a queue built on "damage unblocks the eight handlers".
§4.2 retires that ordering. What the measurements actually put next:

1. **Compare damage against the board.** Nothing in this wave was compared.
   `state.js` already taps `$245044` on the cartridge, but as a window-refusal
   condition. A scenario that FIRES and records the enemy pool's HP words is a
   one-wave job and it is the only thing that can check any of §2.
2. **Settle the midboss's off-screen exit** (§7). It decides whether §4.2 is a
   correction to W33 or a report of a port defect, and it needs one recording
   past lf4200.
3. **The eight handlers are reachable NOW** and each is a loud named throw the
   moment a run walks into it. They are 2,063 instructions (W28 §1 L10 minus
   `$272AAC`) and the port can dispatch every one.
4. **`$289004` + `$288E4E` together, never `$289004` alone** (§1.6). 34 kinds,
   80 slots, 294 call sites, and a driver without which the pool leaks.
5. **The per-frame ledger** (§1.7) — object type 0 `$28D520`. It needs the HUD
   printer `$240DC2` and the hyper `$285A12`, which is W28's wave 8, and until
   it lands a chain the port starts never expires.
