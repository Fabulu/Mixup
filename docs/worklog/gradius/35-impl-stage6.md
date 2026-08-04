# Wave 35 IMPLEMENTER — stage 6 (`$19 = 5`)

status: DONE
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

## §7. THE PORT

| ROM | what | file |
|---|---|---|
| `$B480`-`$B4E3` + `$B4E4`-`$B4F1` | entry 26, the cell creature | `src/enemies.js` |
| `$C6DE`-`$C74F` | `jt_$C439[5]`, the late-spawner arm | `src/enemies.js` |
| `$CDA5`-`$CE2C` + `$CE2D`-`$CE88` | the exit aperture | `src/collision.js` |
| `$99C4`-`$99D2` | the `$83` stage>=5 shortcut | `src/nmi.js` |
| `$C099`-`$C0A4` | the type-`$9A` multi-hit counter | `src/collision.js` |

`$A2F0`'s scope guard moves `>= 5` → `>= 6`.

### `$B480` — a three-phase cycle whose dispatch is a DOUBLE `DEY`

```
$B4A5  LDY $048C,X / DEY / BEQ $B4AE / DEY / BEQ $B4C8
```

Phase 1 branches on the first `DEY`, phase 2 on the second, and **phase 0 falls
past both into `$B4AE`**. So phases 0 and 1 SHARE an arm and only phase 2 is
different. A port written as `switch (phase)` passes every timing check in this
suite and takes the wrong arm on the one frame the creature re-aims — which is
mutant M7, and it reddens two checks only because one of them was written for
exactly this.

The cycle: **phase 2** = `$AEE1`'s generic drift for `$B4EB[rank]` frames, then
phase 0. **Phase 0** = one frame, in which `$B4A0 LDA $A8 / JSR $BCB5` aims the
CREATURE ITSELF at the ship (A is the enemy's own index — the jellyfish's
`$B3B4` call shape, not a bullet), then `$B4AE` flies it and stores 1. **Phase
1** = `$BDFA` along that fixed course for `$B4E4[rank]` frames, then back to 2.
It swims a straight leg toward where the ship *was*, drifts, re-aims, repeats.

Only the DRIFT arm ends on `$B251` (`$B4E1 JMP $B251`); both other arms `RTS`.
So a creature that leaves the box during a flight leg stays allocated until its
next drift. That asymmetry is the ROM's and it has a check of its own — see M10
in §9, which survived the first mutation run precisely because nothing tested it.

### `$C6DE` — see §4. `$CDA5` — see §5.

### `$C099` — the crash the port work UNCOVERED

The sweep found this the moment `$B480` landed: 8 of 8 PLAYING stage-6 chunks
red, earliest at frame 54, PASSIVE clean. Type `$9A` is `$1A | $80`, the
initialised form of the creature, and its throw read *"`$C099` ran 0 times in
every measured run"* — true of the corpus, and nothing could shoot one until
this wave. `$C099 INC $04AC,X`, then `$C0A1 CMP $BFC5,Y / BCC $C0AE`: under the
rank threshold the score and the kill are both skipped and the shot is still
eaten (`$C0AE` falls into `$C0B7`). `$BFC5` is `rankHits`, exported since W6.

### `$99C4` — the crash STATIC SCANNING found and no sweep could

`st99C0` threw for `$19 >= 5` with *"Unreachable: the port loads one stage"*.
Stage 6 IS `$19 == 5`, and `$83` is the sub-state the `$82` countdown hands to,
so it sat on the ordinary stage-6 path from the moment the stage was admitted.
**`stagesweep.mjs` cannot reach it** — it seeds `$1B = $80` and never leaves the
wave stream. What found it was scanning `assets/prg.bin` for every
`CMP/CPX/CPY #imm` with a `$19` load within 16 bytes above it (29 sites), then
reading each one. Per the brief: the listing answered it statically.

**And `$99CF` FALLS INTO `$99D3`.** No branch, no RTS, between `$99D1 STA $1B`
and `$99D3 INC $5B`. The docstring being replaced said *"else INC $5B"* — the
fifteenth incident of the fall-through family, and it would have left `$5B` and
the spawn scratch wrong on the only two stages that take the shortcut.

### THE FOUR `$19 == 5`-UNIQUE SITES, ENUMERATED

```
$990D CMP #$05 -> $CDA5   the exit aperture             W35
$99C4 CMP #$05 -> $99CF   the $86 shortcut + sfx $AC    W35
$AF4E CPY #$05            entry 15's metasprite $63     W22 (already correct)
$C33A CPX #$05            the breakable wall's sfx $04  W34 (already correct)
```

The other 25 of the 29 scanned sites compare `$19` against 0, 1, 2, 3, 4, 6, 8,
`$0A` or `$14`, and on every one of them stage 6 takes an arm a SHIPPED stage
already takes. `$97B5` and `$8B9B` are false positives (both reload A first).

---

## §8. THE SWEEP AFTER THE PORT

`node games/gradius/tools/oracle/stagesweep.mjs`, on the real tree, no patch:

```
  PASSIVE  stage $19=5   .  .  .  .  .  .  .  .
  PLAYING  stage $19=5   .  .  .  .  .  .  .  .

  96 chunk runs, 134400 nmi() frames, 2.34 s
  OK -- 0 undecided throws
```

Before: 16 of 16 stage-6 runs threw, earliest frame 9 (§1). Between those two
states the sweep also went red on `$C099` for 8 of 8 PLAYING chunks — that
intermediate run is the evidence in §7, and it is the reason the sweep is worth
having: `$C099` was found by the check, not by reading.

The gate stage now sweeps **stages 0..5** because it parses the guard live.
80 chunk runs / 112,000 frames → **96 / 134,400**.

### AND A PASS THE SWEEP CANNOT DO

The sweep never leaves `$1B = $80`. So stage 6 was also driven through **all
sixteen `jt_$982F` play sub-states**, seeded directly, 400 frames each, both
modes. Results, and the one finding in them:

* `$80 $81 $82 $84 $85 $86 $8E $8F` — **clean**, 400 frames, both modes.
* `$87 $88 $89 $8A $8B $8C $8D` — the intro/ending arms, throwing with their own
  ROM addresses. Decided out of scope (`$9872` is the plan's W35 end-of-game
  chain; the intro arms are reached through `$96C5`, not `$982A`). Unchanged by
  this wave.
* **`$83` throws at frame 0 with `enemy tables: $0000 is not in any exported
  range` — AND IT DOES THE SAME ON STAGES 0, 1 AND 4.** See §10 item 1. This
  PREDATES the wave and is not a stage-6 property.

Pass B — the ladder driven from `$80` for 1200 frames on chunks 0, 4 and 7 —
is clean in both modes and reaches `$80 $A0 $1 $2 $3 $4` (i.e. death and
respawn), the same set stage 1 reaches.

---

## §9. THE MUTATION TABLE — 35 MUTANTS, 34 RED, 1 PROVABLY UNCATCHABLE

Harness `scratchpad/mut35.py`, on a COPY at `C:/tmp/w35mut`
(`games/gradius/{src,tests,assets,tools,index.html,game.json}` plus the repo
`package.json`; the copy baselines at 0 fail). It patches source as BYTES and
normalises each needle to the file's own line endings. All three files hash
identical before and after all 35: `enemies.js 7265b5388bcb`,
`collision.js 4dcd0cce08a2`, `nmi.js 575eeb5d5b54`. The copy is deleted.

| # | mutant | red |
|---|---|---|
| M1 | `$B488` seeds phase 0, not 2 | 1 |
| M2 | the init reads row B (`$B4EB`), not row A | 1 |
| M3 | `$B4D6` reads row A — one row for both dwells | 1 |
| M4 | `$B4DC` stores 2: the creature never re-aims | 1 |
| M5 | `$B49E`'s guard dropped: it re-aims every frame | 1 |
| M6 | `$B4C4` stores 1: the drift phase is unreachable | 2 |
| M7 | phase 0 routed to `$B4C8` — the double-`DEY` misread | 2 |
| M8 | animator row 3 (`$B4FD`'s), not 6 | 1 |
| M9 | `$B4B6` stores 2: the flight leg is one frame | 1 |
| M10 | `$B4E1 JMP $B251` dropped | **1, after §9a** |
| M11 | the `$C6EB` scan reads the ENEMY band | 1 |
| M12 | `A9 98` read as `LDA $98` — zero page, not immediate | 2 |
| M13 | `$C712`'s ADC loses the low half's carry | **1, after §9a** |
| M14 | metasprite `$8E`, not `$8D` | 5 |
| M15 | `$C6E4` X = 4 selects stage 4's stream | **1, after §9a** |
| M16 | `$C6F3`'s RTS becomes a forced overwrite of slot 9 | 1 |
| M17 | `$C730`'s BNE inverted | 1 |
| M18 | one of the two `JSR $CDB3` calls dropped | 4 |
| M19 | `sub_$CDB3`'s own `$58` bound widened | **1, after §9a** |
| M20 | the `+$F0` dropped from the nametable address | 1 |
| M21 | nametable 0, not nametable 1 | 1 |
| M22 | `hi` and `lo` swapped in the VRAM address | 1 |
| M23 | `$CE1A`'s page `$06` becomes page `$05` | 1 |
| M24 | `$CE14`'s `ADC #$81` dropped | 1 |
| M25 | the mask index loses `$CE0D`'s +3 | 1 |
| M26 | `$CDBA` steps the cursor by two | 5 |
| M27 | `$CDA7`'s outer bound removed | ***SURVIVED*** |
| M28 | `$C099`'s INC dropped: one shot kills | 2 |
| M29 | `$C0A4`'s BCC inverted | 2 |
| M30 | the under-threshold arm forgets `$C0B7` | 1 |
| M31 | `$99CF` read as an else-branch, not a fall-through | 1 |
| M32 | `$99C8`'s BNE dropped: stage 7 plays stage 6's sfx | 1 |
| M33 | `$1B` left at `$84` — the shortcut does not shortcut | 1 |
| M34 | the `$A2F0` guard walks back to `>= 5` | 4 |
| M35 | the guard admits stage 7 (`>= 7`) | 4 |

### 9a. FOUR SURVIVORS ON THE FIRST RUN, ALL FOUR DEFECTIVE CHECKS

Recorded rather than quietly fixed, because the green run before the fix was
worthless and looked identical to the green run after it.

* **M10 survived.** Nothing exercised entry 26's off-screen box. Only the DRIFT
  arm ends on `$B251`, so the asymmetry needed its own check — one creature at
  x `$F8` in phase 2 (freed) and the same creature at the same x in phase 1
  (kept).
* **M13 survived, and it is an arithmetic blind spot.** The velocity is
  `$A9 * 32 + $02` as ONE 16-bit number. At `$69` = 0 the stream byte is `$AF`,
  the low nibble gives `a9` = `$1E`, and `a9 * 32` = 960 whose LOW BYTE is 192.
  With the fixture's frames 0, 4 and 8 the sum never reaches 256, so **the carry
  the mutant deletes never fires**. Frame 64 makes it fire.
* **M15 survived, and it is the stride trap's little brother.** `$C526`,
  `$C633` and `$C752` **all open with the byte `$AF`**, so the first spawn of a
  fresh run is byte-identical whichever stream is read and picking the wrong
  `LDX` is invisible until further along. The two first disagree at stream index
  2 (`$69` = 4 or 5): high nibble 1 against `$E`. The new check walks there.
* **M19 survived, and the reason is a PARITY.** `$66` starts at 0 and steps by
  TWO, so it only ever takes EVEN values and `sub_$CDB3`'s own `CPX #$58` never
  arbitrates — the outer gate always gets there first. That makes the inner
  bound look redundant, **and it is not**: `$66` is the spawn engine's third
  descriptor byte and `$A397` writes it from a wave record, and the wave engine
  runs during `$86` (`$A2F0` is entered for every `$1B` that is not `$81`/`$82`).
  An odd `$66` is reachable, and on an odd cursor the second call is the only
  thing between the walk and `sub_$CE89`'s opcodes. The new check seeds `$57`.

Four new checks, 19 in `tests/w35-stage6.test.js`.

### 9b. THE ONE THAT IS UNCATCHABLE, AND WHY

**M27: removing `$CDA5`'s own `CMP #$58` reddens nothing, and it cannot.**
Settled from the listing rather than by trying harder:

```
$CDA5  LDA $66 / CMP #$58 / BCC $CDAC / RTS
$CDAC  JSR $CDB3 / JSR $CDB3 / RTS
$CDB3  LDX $66 / CPX #$58 / BCC $CDBA / RTS
```

The outer test and the inner test read **the same zero-page byte against the
same immediate**, and the only instruction `$CDB3` executes before its own test
is `LDX $66`, which has no side effect. Nothing runs between `$CDA7` and
`$CDB5` that could change `$66`. So with `$66 >= $58` the outer `RTS` and the
two inner `RTS`es are indistinguishable in every observable: `$66`, the VRAM
queue, the collision map. **The outer gate is a redundancy in the cartridge**,
transcribed because the ROM has it. Same category as W34's M19 and W32c's M34.

---

## §10. WHAT I COULD NOT REACH — attempts, not absences

1. **`$1B = $83` throws `enemy tables: $0000 is not in any exported range`, ON
   EVERY STAGE, AND IT PREDATES THIS WAVE.** `$99D9 JSR $99DF` clears `$63-$6F`,
   which zeroes the wave cursor `$6A:$6B`; the same frame's `$9A5E` runs the
   spawn engine, and with `$60 = 2` `$A2F0` dereferences the null cursor.
   **On the cartridge `LDA ($6A),Y` with `$6A:$6B` = 0 reads zero page and does
   not crash** — the port models the cursor as a ROM-only pointer, so it throws.
   MEASURED identical on stages 0, 1, 4 and 5, so it is not a stage-6 property
   and not a regression; and it is invisible to `compare.mjs`, whose stage-1
   clear is GREEN. I could NOT determine whether ordinary play reaches a frame
   in that state: passive runs die and end at the decided `$9751` boundary
   first, and with the ship forced alive the `$82` countdown did not expire
   inside 4,000 frames in my fixture. **Not clamped and not widened** — the fix
   is a substrate decision (letting the wave cursor address RAM) that needs its
   own evidence, and guessing it here would be exactly the move the brief
   forbids. Handed forward as the highest-value open item.
2. **ANY CARTRIDGE COMPARISON OF ANYTHING IN THIS WAVE.** Unchanged from W32b,
   W32c, W33 and W34. Every number here is port-vs-listing. Nobody has watched
   stage 6's aperture open on the board, and `$CDA5`'s 88 VRAM packets are the
   single most visible thing in this wave.
3. **The stage-6 BOSS and the `$86` → `$90` hand-off, end to end.** `$84`, `$85`
   and `$86` each sweep clean for 400 frames when seeded, and `$9A3D[5]` =
   `$0B` / `$98FD[5]` = `$0C` are read from the export — but I did not drive one
   continuous run from `$80` through the boss to the next stage, because item 1
   sits in the middle of that path at `$83`.
4. **`$B7B5`/`$B797`** — W34's OPEN finding, printed by `tablecoverage.py` every
   run. Untouched: nothing in stage 6 reaches type `$97`.
5. **Whether the four DUPLICATE cells in `$CE31` matter.** 84 distinct cells,
   88 reads, so four tiles are blanked twice and four map cells cleared twice.
   Both are idempotent in the port; whether the cartridge's VRAM queue does
   anything different with two identical packets in 44 frames is unmeasured.
6. **`$0600`'s two models.** §6. Not aliased, because no stage exercises both.

---

## §11. OPEN ITEMS HANDED FORWARD

1. **The `$83` null wave cursor** (§10 item 1) — every stage, pre-existing, and
   the thing most likely to stop a real stage-6 clear.
2. **`$B7B5 LDA $B797,Y`** — W34's item 1, unchanged.
3. **The cartridge comparison for stages 2-6** — W32c/W33/W34's standing item,
   unchanged and still the highest-value unclaimed work.
4. **`$9751` is a crash a real player reaches on every stage** — W34's item 3,
   unchanged. Stage 6's passive runs end there like every other stage's.
5. **`stagewaves.py` is still broken on the inline-5 stride**; `wavecensus.py`
   and `handlerclosure.py` are still not CI-wired (W34 items 4 and 5, untouched
   again).
6. **Stage 7 is what is left.** `stageledger.py` reads `stage 6: 104/111, first
   unported scroll $0AC0` and the guard now names `$9872`, the end-of-game
   chain, as the debt.

---

## FINAL NUMBERS

```
stageledger.py  stage $19=5   BEFORE  98 distinct, 47 ported, 51 unported,
                                      48.0 %, first unported scroll $03B0
                                      (@$AC2E); admission BLOCKED
                              AFTER   98 distinct, 98 ported, 0 unported,
                                      100.0 %, first unported NONE; ADMITTED
                ALL           BEFORE  540/598, 90.3 %   AFTER  591/598, 98.8 %

stagesweep.mjs  BEFORE (guard lifted on a copy)  16 of 16 stage-6 runs THREW
                                                 on $B480, earliest frame 9
                AFTER   96 chunk runs, 134,400 nmi() frames, 2.34 s, 0 throws
                        (the gate stage swept 80 / 112,000 before this wave)

node --test games/gradius/tests/        603 pass, 0 fail, 0 skipped  (584 before)
node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
tablecoverage.py                        OK, 82 bases (81 before), 55 ranges,
                                        4 extent sites, 1 still OPEN ($B7B5)
```

19 new checks in `tests/w35-stage6.test.js`, plus rewrites of eight boundary
checks in seven existing suites (each inverted rather than deleted, and each
named in its own comment). 35 mutants, 34 red, 1 provably uncatchable and
reported as such.

Real tree, `sha256` over `sha256sum` of every `.js` under
`games/gradius/{src,tests}`, sorted, after all mutation work:
`253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58`.
`git status --porcelain games/gradius/src` is empty.

status: DONE
