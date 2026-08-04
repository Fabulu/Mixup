# W34 — IMPL: enemy DAMAGE — the path from a player shot to an enemy's death

status: **IN PROGRESS**
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
