# Wave 35 IMPLEMENTER — stage 6 (`$19 = 5`)

status: IN PROGRESS
implementer, 2026-08-04

Brief: make stage 6 play start to finish. The plan calls this "W33 — Stage 6"
(`29-plan-whole-game.md` §3); W33 and W34 were spent on the QA sweep and the
shipped-crash fixes, so this wave is numbered 35.

---

## BASELINE, MEASURED BY ME BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (note the path — the brief
says `games/gradius/tools/stageledger.py`; the tool lives in `tools/oracle/`):

```
stage  distinct  ported   unported  inline5  ported %     first unported
5      98        47       51        0        48.0         scroll $03B0  (@$AC2E)

PER-STAGE STATIC ADMISSION
5      THROWS (scope guard)   $C6DE THROWS                 blocked
```

`node games/gradius/tools/oracle/stagesweep.mjs` → `80 chunk runs, 112000
nmi() frames, 4.72 s, OK -- 0 undecided throws` — **and it sweeps stages 0..4
only**, because it parses `runEngine`'s `if (stageIndex >= 5)` bound live. So
the baseline sweep says NOTHING about stage 6. Forcing it onto stage 6 is the
first thing in §2.

`node --test games/gradius/tests/` → (measuring)
`node games/gradius/tools/test-all.mjs` → (measuring)

### On the ledger figure being trustworthy this time

The brief warns that `stageledger.py` reported the LATEST scroll for
shared-pointer records, which made stage 6 read 512 px too optimistic from W28
until W32a fixed it. **The figure above is my own measurement on today's
tree**, not a quote. Everything stage-6 written before W32a is treated as
unknown.

---

## §1. THE SWEEP AGAINST STAGE 6, BEFORE ANY PORT WORK

`stagesweep.mjs` parses `runEngine`'s `if (stageIndex >= 5)` live, so on the
shipped tree it sweeps stages 0..4 and stage 6 is not in it at all. Driven at
stage 6 directly, all 16 runs (8 chunks x PASSIVE/PLAYING) throw **at frame 0**
on the scope guard itself — no information.

So: a COPY at `C:/tmp/w35sweep` (`games/gradius/{src,assets,tools,tests}`), the
guard alone lifted to `>= 7`, nothing else touched, 1400 frames per chunk:

```
PASSIVE  chunks 0..7  THROW @ f533 f172 f41 f28 f16 f9 f9 f534
PLAYING  chunks 0..7  THROW @ f377 f172 f41 f28 f16 f9 f9 f377
  distinct first-throw address:  $B480  x16   (16 of 16 runs)
```

**Every single run dies on `$B480` and nothing else is visible behind it.**
The earliest is frame 9 (chunks 5 and 6, which share stream pointer `$ACBA`).
So the honest pre-existing-crash statement for stage 6 is: **the `$B480` wall is
the only thing the sweep can see until it is ported**, and whatever is behind it
is unknown until then. Re-run after the port is §6.

## §2. SCOPE, VERIFIED AGAINST THE LISTING RATHER THAN BELIEVED

`wavecensus.py`, this tree, today:

```
stage 5 ($19=5)  104 record reads, 98 distinct, 47 ported, 51 unported
  types spawned: $04 $05 $08 $0F $11 $12 $1A $27
  NOT PORTED: type $1A -> entry 26 $B480 (53 spawn records)
```

`$1A`/`$B480` is the **only** unported type on stage 6, and the 53 records are
all stage 6's. The plan's "the cell enemy + a track recon item" is confirmed as
the enemy scope. The other two pieces are `jt_$C439[5]` = `$C6DE` (throws) and
`$9911 JSR $CDA5` (throws), both named in the plan.

### THE PLAN AND THE RECON BOTH UNDER-READ `$CDA5`, AND IT IS THE FALL-THROUGH FAMILY AGAIN

`28-recon-stages-2-7.md` §5c calls `$CDA5` "5 lines... a small scroll/scroll-
target check" and the plan repeats "**`$CDA5` (5-line stage-end hook)**".
`$CDA5`-`$CDB2` really is five instructions — and four of them are
`JSR $CDB3` / `JSR $CDB3` / `RTS`. **`sub_$CDB3` is the routine**: `$CDB3`-
`$CE2C`, ~40 instructions, and it needs an 92-byte data run (`$CE2D`-`$CE88`)
that was not exported. Thirteen-plus incidents; this is the fourteenth. §5.

## §3. THE RANK BOUND — WHY entry 26's SEVEN-ROW TABLE IS NOT AN OVERRUN

`$B48F`/`$B4BE LDA $B4E4,Y` and `$B4D6 LDA $B4EB,Y`, both with `Y = $17`.
`$B4E4`-`$B4F1` is **14 bytes = two 7-entry rows**, and `$B4F2` is dispatch
entry 27's first instruction. A rank of 7 would read entry 27's opcode through
the second row — precisely W34's `$B415` shape, and the export
(`dwellByRank`, `$B4E4`-`$B4F2`) would throw "not in any exported range".

**It cannot happen, and the listing settles it without an emulator.** `$17` has
exactly ONE writer in the whole PRG, `$9C5B STY $17`, at the bottom of `$9C45`:

```
$17 = ($44 != 0) + $45 + ($46 != 0) + ($19 != 0)
```

`$45` has exactly two writers: `$9C6A STA $45` (the immediate `#$02`) and
`$89D9 INC $45`, which is guarded one instruction earlier by
`$89D3 LDA $45 / CMP #$02 / BCS $8983` — **`$45` is capped at 2**. So

```
max $17 = 1 + 2 + 1 + 1 = 5
```

and Y is 0..5 against a 7-entry row. Entry 6 of each row is transcribed and
unreachable; **nothing is clamped and nothing is widened.** (Note the other
rank rows in this ROM are 8 or 9 wide — `$B787`, `$B852`, `$B8F8` — so entry 26
is the narrowest of them and the only one where a rank of 7 would land on code.)

## §4. `$C6DE` — TWO DEAD INSTRUCTIONS AND AN ENEMY-BULLET SLOT

```
C6DE  A5 69     LDA $69
C6E0  D0 00     BNE $C6E2     <-- branch offset ZERO: the target IS the next
                                  instruction. Dead whichever way it goes.
C6E2  A9 04     LDA #$04      <-- and A is clobbered by $C44F's own first
C6E4  A2 06     LDX #$06          instruction, LDA $C447,X. Also dead.
C6E6  20 4F C4  JSR $C44F     X=6 -> pointer $C44D -> the stream at $C752
```

It does not fill the enemy slot `lateSpawner` cleared for it. It scans
`$0136,X` for X = 9..0 — the **ENEMY-BULLET** slots (object index `$16 + X`,
the same ten `allocBullet` uses) — and writes one:

```
$03C6:$03F6  (yvel:yvelf)  := $A9 * 32 + $02      a 16-bit velocity
$0436/$0456  (xvel:xvelf)  := 4 / 0
$0116 $0356 $0396          := 0                   status, yf, xf
$0476  (s0460, direction)  := ($02 & 4) ? 0 : 1
$0316  (type)              := 1
$0176  (animFrame)         := 1
$0336  (y)                 := $C750[dir] = $84 or $42
$0376  (x)                 := $98 (the IMMEDIATE, not zero page $98)
$0136  (anim)              := $8D   <-- the metasprite the plan names
```

`approachStage5` (`$C750`-`$C772`) was already exported by W25, including the
two-byte row and the 32-byte stream, so `$C6DE` needs no new asset.

## §5. `$CDA5` — THE STAGE-6 EXIT APERTURE, AND WHAT IT ACTUALLY DRAWS

`$9904` (play sub-state `$86`, the stage-end crawl) calls it every frame while
`$19 == 5`. `$CDA5` gates on `$66 >= $58` and otherwise runs `sub_$CDB3`
**twice**, so **two cells a frame, 88 cells, 44 frames**.

Each cell reads one byte `t = $CE31[$66]`, `hi = t >> 4`, `lo = t & $0F`, and:

1. queues a five-byte VRAM packet `01 hi lo 00 FF` at PPU address
   `$2400 + 32*hi + lo + $F0`  — i.e. **nametable 1, row `hi+7`, column
   `lo+16`**, blanked to tile `$00`. (The `$CDC5`-`$CDD9` shift/ORA/ADC chain
   reduces to exactly that; the port derives it the reduced way so the two
   cannot agree through the same shifts — the same discipline W34 used on
   `$C353`.)
2. clears the matching 2-bit collision cell: `$0600 + $81 + 8*lo +
   ((hi+3) >> 2)`, masked with `$CE2D[(hi+3) & 3]` (`FC F3 CF 3F`).

**Decoded, the 88 bytes are a shape and the shape answers the "track"
question.** Plotting `(row hi+7, col lo+16)`:

```
  row  7  ..........##....
  row  8  ..........##....
  row  9  ..........###...
  row 10  ..........###...
  row 11  ..........####..
  row 12  .........######.
  row 13  .....###########
  row 14  .....###########
  row 15  .....###########
  row 16  .....###########
  row 17  .........######.
  row 18  ..........####..
  row 19  ..........###...
  row 20  ..........###...
  row 21  ..........##....
  row 22  ..........##....
      (columns 16..31; the leftmost cell touched is column 21)
```

A bevelled cross — a **horizontal corridor four tiles high opening out of a
two-tile vertical shaft**: the stage-6 exit aperture, carved out of both the
nametable and the collision map so the ship can fly through it. It is opened in
a scrambled order, not left-to-right (the first four bytes are (8,6), (9,10),
(7,12), (4,10)), which is why it reads as an iris rather than a wipe.

**AND FOUR OF THE 88 ENTRIES ARE DUPLICATES** — 84 distinct cells, 88 reads.
Four cells are blanked twice. That is the cartridge's table, not a decode error;
the port re-reads and re-clears them exactly as the ROM does, which is
observable as four extra VRAM packets and four idempotent map writes.

## §6. `$0600` IS MODELLED TWICE IN THIS PORT, AND STAGE 6 USES THE OTHER MODEL

`state.coll` is `$0500-$06FF` (the terrain collision map) and `state.arm` /
`ARM_POOL` is `$0600-$06BF` (W32b's stage-5 articulated arms). On the cartridge
those are **the same bytes**. They do not collide because the arm pool is
`$19 == 4` only and `$CDA5` is `$19 == 5` only — but the two models are not
aliased in the port, so a future wave that makes both live in one stage will get
a silent wrong answer. Recorded, not fixed: nothing in this wave needs it, and
inventing an alias without a stage that exercises it would be a guess.

---

(work in progress — the port and its checks follow)
