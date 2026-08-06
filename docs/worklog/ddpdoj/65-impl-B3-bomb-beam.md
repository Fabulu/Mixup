# W65 IMPL - B3: THE LASER BOMB `$249A80`

status: **DONE** - **BOMBING WHILE HOLDING THE BEAM WORKS.** `[M]` on the LIVE
build `20260805144407`: fire held, `($3f,A6)` = 1, press X three times, the
stock falls 3 → 2 → 1 → 0, **thirty-one** of the forty-five records go live,
`$2456A6` takes 32 pool-A hits and 55 pool-B hits and **erases 54 enemy
bullets**, the ship's flags bit 7 goes on for the bomb and off at the teardown,
`PAGE ERRORS []`, 60 Hz. **NO RANK WORD MOVED** - all five, on every one of
2,200 headless frames and every one of 21 browser samples, against a
`rank-poke` control that reddens all five and nothing else. Unit tests 878 →
**921**, 0 skipped. 59 of 59 mutants RED, 0 survivors - **two of my own
controls and eleven of my own fixtures could not fail, and one of the mutants
found a MISSING RAM WRITE in the port.** Boot +7,495 B.

wave: 65. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: **bombing while HOLDING THE BEAM throws at `$249A80`** (W64 §7). Port
`$249A80` and what it needs.

`[M]` = measured by me this session, over
`games/ddpdoj/tools/oracle/out/maincpu.bin` (the decrypted build-B image,
address == file offset) with capstone `CS_ARCH_M68K` / `CS_MODE_M68K_000` and a
recursive-descent tracer, and over the PORT driven from the shipped bundle seed
and from the deployed page.

---

## 0. THE PREMISE, CHECKED

**THE BRIEF HOLDS.** `$249A5C tst.b ($3f,A6) / bne.b $249A80` is reached by
bombing while the beam is held, `src/bomb.js` threw there, and it does not now.
Four corrections to the documents that got me here, and one to my own first
measurement:

| what a document says | `[M]` this session |
|---|---|
| W64 §7: "`src/laser.js` sets it at `$24C282`" | The instruction is `$24C282 move.b #$1,($3f,**A4**)` and `$24C2D6 move.b D0,($3f,**A4**)`. In `$24C164`'s frame **A4 is the PLAYER record and A6 is the OPTION POD** - `$24C2B6 move.b #$A,($3f,A6)` is the pod's own nine-frame counter and is a DIFFERENT byte. The substance survives (it is the player's `+$3f`); the citation does not, and a port that copied it would have written the pod's byte |
| W64 §7 / HANDOVER: "~630 instructions" | **HOLDS. `[M]` 693**, over eleven entries: `$255FE2` 148, `$2456A6` **266**, `$2561AA` 107, `$2563B6` 56, `$289FF4` 34, `$28A1DA` 32, `$2562FC` 21, `$249A80`'s arm 17, `$256468` 16, `$24311A` 9, `$26085C` 3, `$256346` 1 |
| **my own first count said 1,456** | **WRONG, and I nearly shipped it as "B2 under-sized this by 2x".** The recursive-descent tracer follows a `bcc` displacement out of `$2561E6`'s neighbourhood into address `$000006` and disassembles 150 words of the 68000 VECTOR TABLE as code. Recorded because it would have been the twenty-seventh brief resting on something false and it would have been mine |
| W64 §1.3 and `src/bomb.js:144` `poolWipe: 0x252714` | `$252714` **IS ALREADY PORTED** - `src/laser.js` `wipeSegmentPool`, W45. So are `$243DA0` (W64), `$23FF42` (W64) and `$28A1DA` (`src/spark.js` `fillSlot`, W53). The arm's only unported callee was `$26085C`, which is a counted note |
| recon 38 §1.3: "`($3F,A6)` - a DEATH bomb is a distinct path" | Stale by twenty waves. W45 settled that it is the LASER-HELD byte (`src/player.js:516`); "death" was the pre-W45 guess |

---

## 1. THE SHAPE, AND IT EXPLAINS A W64 MYSTERY

`$255FE2`'s A6 is `$811F72`; `$25600C lea ($7B0,A1),A1` puts the second record
at `+$7E0` and the next two follow at `+$30` each; `($7FE,A6)`, `($82E,A6)` and
`($85E,A6)` are their script pointers. `$7E0 / $30 = 42`. And `$2561AA`/
`$2563B6` open `lea $811FA2,A6` + `moveq #$28,D7` + `dbra` - records **1..41**.

```
[M]  record  0        the HEAD          $255FE2's own
[M]  records 1..41    THE BEAM          41 segments, ONE seeded per frame
[M]  records 42,43,44 three more heads  $7E0 / $810 / $840
     ------------------------------------------------------------
     1 + 41 + 3 = 45
```

**So the LASER BOMB is what the 45-record table is SIZED FOR.** W64 §10 could
only say that `$2564F0`'s `moveq #$2C,D7` frees forty-five where the ordinary
bomb allocates one, and call it "the cartridge's own and not a tidy-up". It is
this weapon's footprint exactly, and `[M]` a real bomb reaches **31 of 45** on
the page - 4 heads and 27 live segments, the rest culled at `$7800`.

---

## 2. WHAT WAS PORTED

| ROM | insn | what | where |
|---|---:|---|---|
| `$249A80..$249AF4` | 17 | **THE ARM**: `$26085C`, `($26,A6)=$101`, `($28,A6)=$C`, `bset #$7,($1,A6)`, **`bset #$0,($1,A1)` INTO THE RECORD**, `clr.w $8127E2`, `($46,A6)=$2E`, the pool wipe, `($38,A1)=$26`, `($56,A1)=$8`, and `$243DA0` | `fireBomb2498E2`'s else arm |
| `$255FE2..$25619A` | 148 | the four-head install (`$256CAA`, 158 B), the 120-frame anim phase, `$256712`'s twelve steps, four conditional draws and the `$289FF4` tail | `bombScriptAlt255FE2` |
| `$2561AA` | 107 | **THE 41 SEGMENTS**, two arms | `beamSegments2561AA` |
| `$2562FC` / `$256348` / `$256346` | 22 | records 42's and 44's movers, and a **bare `rts`** | `beamHead2562FC` / `beamHead256348` |
| `$2563B6` | 56 | phase 2's segment REBUILD, ship-outward, with a hard end | `beamRebuild2563B6` |
| `$256468` | 16 | the beam's own reset: `$25270C`, bit 6, bit 7, `$81294C`, `$812954` | `beamReset256468` |
| `$2456A6..$2459CE` | 266 | **THE DAMAGE**: the box over 45 records, then pool B, pool A and the BULLETS | `bombDamageAlt2456A6` |
| `$289FF4` + `$28A252` | 66 | pool E's OTHER allocator and its kind-0 fill tail | `src/spark.js` |
| `$24D188` + `$24D200` | 44 | **THE PODS' KNOCKBACK** | `src/options.js` |
| `$24A4E2..$24A530` | 20 | **THE SHIP'S BIT-7 AURA** | `src/shipsprite.js` |
| `$2496A2..$2496E6` | 20 | **THE PLAYER'S KNOCKBACK** and `$812954`'s speed drag | `src/player.js` |
| `$242EC2` / `$28AB86` / `$24311A` | 21 | three more of the RNG family | `src/rng.js` |

### 2.1 Four things a "tidy" port gets wrong here

* **`$249A98 bset #$0,($1,A1)` AND `$249AD8 move.w #$26,($38,A1)` ARE
  DIFFERENT A1s.** `$249AB2 lea $8104AA,A1` reloads it between them, to the
  OPTION BLOCK. A port that kept one A1 would set bit 0 of `$8104AB` (so the
  driver would never route to `$255FE2`) and write `$811FAA`/`$811FC8` - inside
  SEGMENT 1. Two unit tests assert both halves.
* **`$2561AA`'s two arms are not one loop with a flag.** With `($18,A6) == 0`
  it DEREFERENCES `($2C,A6)` (`$2561C8 movea.l (A0,D0.w),A0`), saves the
  pointer on the segment's `+$18` and re-reads the anim through it every frame;
  with `($18,A6) != 0` it does NOT dereference (the pointer VALUE becomes the
  anim long), skips `+$18` (`$25629A addq.w #$4,A1`) and never re-reads.
* **`$245788 move.b (A6),D4 / btst #$1,D4` READS THE HIGH BYTE**, so the "this
  record is parked" bit is word bit **9**, the same one `$256154` and `$8200`
  use - not bit 1 of the low byte, which is the ship selector. A fixture that
  set the low byte's bit 1 finds both readings agreeing; §8 D.
* **`$256346` IS A BARE `rts` TWO BYTES BEFORE `$256348`**, and `$256128
  bsr.w $256346` calls it on purpose, one instruction before `$25612C bsr.w
  $256348` calls the real routine. Transcribed as the call it is, with a
  counted note, because a reader who starts at `$256346` reads its `rts` as
  `$256348`'s and loses record 44's whole mover.

---

## 3. READ PAST THE APPARENT END - and this time it was FORWARD, not backward

* **`$256346`** above, and it is the first case in this project of the trap in
  the OTHER direction: not a routine that continues past its `rts`, but a
  one-instruction routine sitting in front of one that a reader will merge.
* **`$2456A4` is an `rts` in the MIDDLE of `$24560A`** (W64 §3 found it) and
  `$2459CE` is another two bytes before `playerBox` - both are `$2456A6`'s
  boundaries, and neither is visible reading forward from `$2456A6`.
* **`$24D188` does not fall into `$24D200`.** `$24D18C beq` JUMPS to it, so the
  RAMP runs while `($38,A6)` lasts and the SETTLE runs for ever afterwards,
  until the bomb clears bit 7. A port that let one fall into the other would
  run both on the same frame.
* **`$28A252` ends `movea.l (A7)+,A2` and it never pushed A2.** It is a
  CONTINUATION reached by `$28A22C jmp (A2)`, popping the A2 `$28A1DA` pushed
  at its own first instruction, and returning to `$28A1DA`'s caller.

---

## 4. WHAT THIS WAVE MADE REACHABLE - THREE PATHS, ALL FROM ONE `bset`

**`$249A92 bset #$7,($1,A6)` is the first instruction this port has ever run
that sets the player's flags bit 7**, and `$2564AA bclr #$7,($1,A0)` inside
`$256468` is what clears it 131 frames later. Three routines read that bit and
all three had been named throws since wave 4 or wave 12:

| ROM | what | what it had said |
|---|---|---|
| `$2496A2` | the PLAYER's knockback: `($46,A6)` (seeded `$2E` by `$249AA4`) walks the 24-word ramp `$2552EC` and subtracts it from the knock field. **AND `$812954` COSTS SPEED** - while the beam holds a pool-B target the ship loses `$48` of velocity and `$48` of this frame's Y, every frame | `src/player.js`: "MEASURED 0 across the whole corpus" |
| `$24D188` | the OPTION PODS' knockback: `($38,A1)` (seeded `$26` by `$249AD8`) walks the same-shaped 20-word ramp `$24D28E`, then `($56,A1)` (seeded `$8` by `$249ADE`) settles them through `$2417D4` | `src/options.js`: "MEASURED: ($1,A4) bit 7 is 0 on every sampled frame" |
| `$24A4E2` | the ship's BIT-7 AURA: a different sprite table (`$2556BA`, indirect through the ship selector), size `$830` not `$A28`, **two** counters not one, and **no invulnerability or `$80390C` gate at all** | `src/shipsprite.js`: "MEASURED 0 on every frame of fly-around and of stage1-open" |

All three measurements were TRUE and all three were about the runs, not about
the game - `docs/knowledge/08`'s rule arriving for the sixth time in this
project. **All three are ported rather than declared**, because each one stops
the page on the first laser bomb, and each has a gate row of its own.

`$249AD8 move.w #$26,($38,A1)` and `$249ADE move.w #$8,($56,A1)` were "two
writes into the option block" in W64's reading of the arm. They are the two
ramp cursors, and the seeds are what make the two tables' index spaces
derivable: `$24D28E` is 20 words because `$26` steps by `subq.w #$2`, and
`$24D282` is five because `$8` steps by `subq.w #$4` and `movem.w` reads a
PAIR. `check_beam_bomb_extents` asserts both immediates.

---

## 5. RANK - every address, digit-identical, to I2's standard

**Five rank addresses, four inputs, and a control that PROVES the rows move.**

| 2,200 frames from the shipped seed, fire HELD | `$81309E` | `$81B646` | `$81B648` | `$81B65C` | `$81B65E` |
|---|---:|---:|---:|---:|---:|
| held fire, NO bomb (`--break no-press`) | 53 | 0 | 0 | 0 | 0 |
| held fire, **THREE LASER BOMBS** | **53** | **0** | **0** | **0** | **0** |
| tapped fire, three ORDINARY bombs (`--break tap-fire`) | 53 | 0 | 0 | 0 | 0 |
| held fire, three bombs, **`--break rank-poke`** | **54** | **1** | **1** | **1** | **1** |
| `[M]` deployed page, 21 samples, 3 laser bombs | 53 | 0 | 0 | 0 | 0 |
| `[M]` local page, 21 samples, 3 laser bombs | 53 | 0 | 0 | 0 | 0 |

The gate asserts each of the five **on every frame** - the first frame any of
them differs from the seed is recorded with its value and its logic frame - and
`rank-poke` turns all five rows red and nothing else (15 pass / 5 fail).

**WHY NOTHING MOVED, from the listing and not from the run:**

* `$2456A6` writes `$812952`, `$812954` and the three pools. **It touches no
  rank word**, and its 266 instructions were read for absolute writes to
  `$800000..$81FFFF` before a line was written: the census returns
  `$812952@2457DC` and `$812954@2457E2` and nothing else.
* `$255FE2`'s closure writes `$8103E7`, `$810449`, `$81294C`, `$812968` and
  `$81296C`. No rank word.
* `$249976 subq.w #$3,$81B646` - the bomb's −3 - is on the SHARED part of the
  arm, in front of the `($3f,A6)` fork, so this wave does not change it: it is
  still behind `$249968 tst.w $81B63E / beq $2499D4`, `$81B63E` is still
  unreachable (W64 §0), and the port still **throws at `$285AF2` by address in
  FRONT of the debit**.
* `$81309E` still cannot move in this port at all: `[M]` `$2608D2` and
  `$260794` (object type 10) remain ABSENT from `src/`. W60, W61, W62, W63 and
  W64 each said this and it is still true.

**RECON 38 §3.4's `−3` IS THE ONE COMBINATION THIS WAVE DOES NOT REACH.** The
brief asks for "bombing while LASERING" measured explicitly because "bombing
while HYPERING is −3". `[M]` they are independent: `($3f,A6)` forks at
`$249A5C`, `$81B63E` at `$249968`, and the second is fifty instructions in
FRONT of the first. So a laser bomb takes the same rank path as an ordinary
bomb, and the measured answer is the one above.

---

## 6. CHAIN AND SCORE - **RECON 38 §1.5 AND W64 §6.1 ARE BOTH STALE**

Both say the `$400` hit bit "has exactly two setters and both are in the A2/A3
weapon loops (`$245242`, `$2452F2`)". `[M]` a census of `ori.w #$400` /
`#$4400` over `$230000..$2B0000`:

```
[M] 245242  ori.w #$400,D4     the A2 weapon loop      recon 38 has this
[M] 2452F2  ori.w #$4400,D4    the A3 weapon loop      ...and this
[M] 2454E0  ori.w #$400,D4     $2453AC, THE BEAM       (W51 wired this)
[M] 2455F2  ori.w #$400,D4     $2453AC's second arm
[M] 24580E  ori.w #$400,D4     **$2456A6's POOL B**    <<< W65
[M] 2458E2  ori.w #$400,D4     **$2456A6's POOL A**    <<< W65
```

**So a LASER BOMB kill goes through `$286876`, `src/score.js`'s SECOND chain
machine, and an ORDINARY bomb kill does not** (W64 §6.1 measured that
correctly, for the weapon it had). `[M]` 80 `ori.w #$400` executions over three
laser bombs in the 2,200-step gate, 0 without them. It is a gate row with its
own control, and the row is NOT `$81B636`: `[M]` held fire ALONE leaves
`$81B636` non-zero on 760 of 1,150 frames because the BEAM already feeds that
machine, so a `$81B636` row would have been green either way.

### 6.1 The score, against a control on the SAME input

`.scratch/w65chain.mjs`, 1,150 steps, presses at 380/700/1020, the two rows
differing only in whether Button 2 is pressed:

```
[M] HELD fire, NO bomb      total $10548  chain 34  chainMax 50  $81B64A 216
[M] HELD fire, THREE LASER BOMBS
                            total $14258  chain 49  chainMax 51  $81B64A  72
                            poolA 80 hits, 6 bullets erased, 80 x $400
[M] TAPPED fire, three ORDINARY bombs (a different input, for reference)
                            total $36363  chain  0  chainMax 121
```

**THE SCORE IS HIGHER WITH LASER BOMBS - the opposite of W64's finding for the
ordinary one.** W64 §6.2 measured 1,600 steps at `$39028` with no bomb and
`$38790` with three, and reasoned that "a bomb kills enemies that would
otherwise have been chained". `[M]` the laser bomb goes the other way, +23 %,
and the mechanism is §6's: its kills carry `$400`, so they run `$286876`'s
machine (flat meter 10, per-hit floor, its own score adds) instead of only
`$2862C6`'s. **Both numbers are port-vs-listing; neither has been compared
against the board.**

**AND ONE NON-RANK WORD MOVED**: `$81B64A`, the hyper EARN accumulator, 216 →
72 on the same input. W63 §6.1 moved it 2,112 → 1,512 and W61 named a wave I3
that "must not ship `$287682` without re-reading both rows". This is a third
row in the same window and it is named here for the same reason. Both figures
are far below `$287682`'s `#$95F` = 2,399, so **no hyper stock is granted
either way** and §5's answer is unaffected.

### 6.2 The chain is still RESET at the teardown

`$2499D4`/`$2499D8`'s `$81B5AE` latch is on the SHARED part of the arm, and
`$2561A6 bra $2564F0` reaches the SAME teardown, so a laser bomb thrown into a
running chain deletes it 131 frames later exactly as W64 §6.2 measured for the
ordinary one. `[M]` on the page: chain 35 before BOMB1, **2** at +3.5 s.

---

## 7. THE PAGE, IN A REAL BROWSER - WHAT I SAW `[M]`

Chrome + Python `playwright`, W64's recipe with the one thing it deliberately
did not do: **fire HELD, not tapped**, so `($3f,A6)` reaches 1 and the press
takes `$249A80`. Button 2 is `x`. The page is READ, not only photographed.

### 7.1 DEPLOYED - `https://gbtman.pages.dev/games/ddpdoj/`, build `20260805144407`

TWO deployed runs, because the first (`20260805133936`) predated §8's missing
`$80FA74` store.  `[M]` the second, on the FINAL tree, is the one below and it
agrees with the first in every column: three laser bombs, `stock` 3 → 2 → 1 →
0, `live` 29/24/31, `beam` 35 pool-A / 44 pool-B / 29 bullets erased, `rank`
53/0/0/0/0 on all 17 samples, `PAGE ERRORS []`.

```
[M] BOOTED     lf 2314  held 0  stock 3  live  0  rank 53/0/0/0/0
[M] BEFORE     lf 3168  held 1  stock 3  live  0  chain 35  total $8425
[M] BOMB1+0.5s lf 3220  held 1  stock 2  live 27  r42 $9200 r44 $9000  bit7 1
                        beam 11 poolA / 8 poolB / 14 bullets ERASED
[M] BOMB1+3.5s lf 3408  held 1  stock 2  live  0  bit7 0  beam 18/55/15  chain 2
[M] BOMB2+0.5s lf 3621  held 1  stock 1  live 31  r42 $9000 r44 $8200  bit7 1
[M] BOMB3+0.5s lf 4035  held 1  stock 0  live 31  bit7 1
[M] FINAL      lf 6755  stock 0  live 0  beam 32/55/54  total $24492
[M] rank 53 / 0 / 0 / 0 / 0 on EVERY ONE of the 21 samples
[M] PAGE ERRORS []   -- no throw, no console error, 60.0-60.2 Hz throughout
```

**That is the wave's whole result, on a screen: hold Z until the beam is up,
press X, and thirty-one of the forty-five records go live - four heads and
twenty-seven beam segments marching up the screen from the ship - while
`$2456A6` takes `$1E0` off every pool-A enemy inside the beam's own bounding
box, `$208` off the nearest pool-B one, and ERASES every enemy bullet the beam
touches. The ship is thrown backwards, the pods are thrown backwards, the ship
wears a different aura, and 131 frames later all forty-five records drain and
the flags bit goes off.** Before this wave, holding Z and pressing X stopped
the page with `UNPORTED $249A80`.

### 7.2 LOCAL (`python -m http.server 8765`), and it agrees

```
[M] 3 laser bombs, stock 3 -> 0, live max 31, beam 31 poolA / 57 poolB /
    59 bullets erased, rank 53/0/0/0/0 on all 21 samples, no page error
[M] BOMB1: chain 34 -> 52 at the press (the kills) -> 2 at the teardown
```

### 7.3 **WHAT IS NOT THERE, and a reader should hear it from me**

The beam has **no picture**. `[M]` the page's own stats line reads
`$042924x1`, `$040CC8x1`, `$040EAC x1` during each bomb - those are MISSING
SPRITE STREAMS, and they are exactly the anim longs `$256686`, `$25666E` and
`$25667A` (records 44 and 43's head tables) name. So the four heads' and the
forty-one segments' STATE is this port's and their art is not in the harvested
sheet; `src/render/index.js` skips every one. Same shape as W64 §8.3's bucket
13 and W63's HUD. **On screen the laser bomb is: the enemies dying, the bullets
vanishing, the ship being thrown backwards, and nothing else.**

### 7.4 **THE LIVE PAGE FOUND A DEFECT THE GATE COULD NOT**

`[M]` the first local run stopped with `$28A47A IS NOT PORTED YET` - a pool-E
TEMPLATE outside every ROM window. `$255FE2` reaches `$289FF4` only on frames
where record 44's bit 1 is clear, and `$256348` only clears it when `$812954`
is non-zero, i.e. **only when the beam is holding a pool-B target**. The
headless gate's 2,200 frames never had one. W54 §6.2's rule for the fourth
time: *a short window is not caught at the export; it is caught by `src/rom.js`
on a player's machine* - and this time it was caught by MY browser rather than
by the owner's, which is the only reason it is a paragraph and not an incident.
`$28A464 + $A2` is now a window with six derived extents asserted on export.

---

## 8. EVERY CHECK SEEN TO FAIL - and **TWO OF MY OWN CONTROLS WERE VACUOUS**

**THE WORST ONE FIRST.** The first draft of `tools/w65beamgate.mjs` wrote every
row as `brk === 'no-press' ? <the null expectation> : <the real one>`, and:

```
[M] --break no-press    20 passed, 0 failed      <<< THE CONTROL COULD NOT FAIL
[M] --break rank-poke   20 passed, 0 failed      <<< NOR COULD THIS ONE
```

Both are the brief's named safety-critical controls and both were green because
each row quietly agreed with whatever the break did. `docs/knowledge/03`
exactly. The rows are now the CLAIMS, unconditionally, and the breaks make them
false:

```
[M] --break no-press     Button 2 never pressed                    12 RED
[M] --break rank-poke    +1 into each of the FIVE rank words     5 RED, all rank
[M] --break tap-fire     W64's own input: the ORDINARY bomb runs   11 RED
[M] --break no-driver    type-5 call #7 counted, not run            7 RED
```

`rank-poke` also had to MOVE: the poke was at step 1,800 and `[M]` the run
stops at ~step 1,190 on `$249F8A` (§9), so it never happened. It is now at the
last press + 20.

**AND THE UNIT TESTS FOUND A REAL DEFECT IN THE PORT.** The arm's last
instruction was written

```js
ctx.bombEvent?.('beam-arm', armBombCancel243DA0(ram) ? 'armed' : 'busy');
```

and **optional chaining does not evaluate its argument list when the callee is
undefined** - so on any context without an event sink (every unit test, and any
embedder that does not attach one) the SCREEN CLEAR silently did not happen.
**No gate in this repo could have caught it**, because every gate attaches a
sink. It is now on its own line, with the reason in the file. The other
thirteen `bombEvent?.(...)` sites were audited: all pure values.

**AND ONE MUTANT FOUND A SECOND REAL DEFECT.** `$2456AA lea $80FA74,A5` and
the four `move.w D?,(-$2,A5)` stores put the bounding box **in RAM** - the
same four words `src/damage.js` `BOX` uses and `$245760`/`$245866`/`$24595A`
re-read through A6. The port built it in a JS array and never stored it:
correct arithmetic, four missing stores, and invisible to every row that only
counted hits. Found by the row that asserts all four words exactly.

**ELEVEN MORE OF MY OWN CHECKS COULD NOT FAIL**, and the mutation sweep took
three rounds to say so - **23 survivors, then 11, then 1**:

| | what was wrong | the check that exists now |
|---|---|---|
| **A** | `beamRom()`'s accessor was `bytes[a - base]` with no bounds check, so `$255FE2` reading `$256CAA` (an entirely different window) got `undefined` and the "entry 1 does something else" row passed against NaN | the fixture THROWS on any address outside `$25653C+$112`, and the row asserts the throw NAMES `$256CAA` |
| **B** | ...and the same hole was serving `$24301A`, `$242FDE`'s canned table, so `drawSigned242FDE` returned NaN and TWO of W64's own FADE rows were asserting arithmetic on NaN | the fixture serves that table explicitly, as a constant chosen so `$255F16 tst.w D0 / bne` takes a known arm |
| **C** | the pool-B rows had only record 0 live, and pool B walks records **1..41** while pool A walks **0..44** (`$245780 lea ($30,A6),A6` is the whole difference) - so "pool B hits one enemy" passed with zero hits | the fixture puts the record at index 1 and the row asserts the HIT, its `$208`, and that a FARTHER enemy is untouched |
| **D** | the "a parked record does no damage" row set bit 1 of the record's LOW byte; `$245788 move.b (A6),D4` reads the HIGH byte, so both readings agreed | the fixture sets `$8200` - word bit 9, the bit `$256154` and the install's own template use |
| **E** | every bullet row ran against a fresh all-zero `Ram`, i.e. 211 bullets sitting live at (0,0) inside the box - `[M]` **70 erasures reported** where the row wanted 1, and a port that ignored the box entirely would have passed | `parkBullets()` writes `$FFFF` to all 210 `+$2` words first (`$24593E bmi` skips a negative one), so the row is about the box |
| **F** | the three direct-call rows on `$2456A6` left `$812952` at 0, and `$245622 move.w #$7800,$812952` runs in `$24560A` BEFORE the fork - so `$2457C6 cmp/bcc` rejected every pool-B enemy | the fixture stands in for `$245622`/`$24562C`, with the reason in a comment |

| **G** | the two gate rows for the pods' and the player's knockback read the CURSORS `($46,A6)` and `($38,A1)` - which are `$249AA4`'s and `$249AD8`'s writes, not the ramps' - so DELETING both ramps left them green | the player's row measures `($6,A6)`, which only `$2496B6` moves; the pods' is a UNIT row on `$24D188` itself, because `[M]` `$24C33A` puts the pods back on the ship every frame and one frame of ramp is `$200` against a `$24D146` step of `$800` - no aggregate over 2,200 frames separates them |
| **H** | `liveMax > 4` for the 41 segments: `[M]` a `dbra` one short still peaks at 29, because the `$7800` CULL is the binding constraint and not the loop | the loops' far end is proved by the **CLEAR**: a hand-placed live record in slot 41 must be zeroed by `$25623A` (phase 1) and by `$2563D4` (phase 2) |
| **I** | the segment-step row used `$400 + velY` and `[M]` `($30,A5)` is 0 on every frame of a run with no vertical input, so the third term was never exercised | a unit row that SETS `($30,A5)` to `$123` |
| **J** | `$25606C`'s `-$200` bias and `$2560C6`'s short-axis-only write are not observable from the gate at all: `$2563A4 move.w D0,($7E2,A0)` overwrites record 42's Y from record 44's in the SAME frame | unit rows after exactly one driver frame |
| **K** | four bound constants (`$7800` twice, `$7E00`, `$256460`'s `$1C`) and `$2563F8`'s `+$400` all survived the gate: a `$100` change moves no count it measures | unit rows that place a record by hand ON each bound and one step under it |
| **L** | ...and the LAST survivor of all three rounds was `$256224`'s arm of the cull - the one taken when `$812954` is SET. Every fixture reached the OTHER arm, because setting that word routes the same frame into `$289FF4` and pool E | `beamRom()` now serves pool E's three canned RNG tables and three templates, and the row walks both arms |

C, D, E, H and I are W61's M4/M33, W63's D/E and W64's F/G for the fifth time:
**a fixture sitting where two readings agree is not a check**, and **a
parameter the corpus never varies is not covered** (`docs/knowledge/03`).

`.scratch/mutate65.mjs` applies ONE edit with a single-occurrence anchor, runs
ONE check, requires a NAMED test or a NAMED gate row RED, restores, and
verifies the file sha256 byte-identical; 180-second timeout per child.

```
[M] round 1   36 of 59 RED, 23 survivors
[M] round 2   48 of 59 RED, 11 survivors
[M] round 3   58 of 59 RED,  1 survivor
[M] round 4   **59 of 59 mutants turned a NAMED check RED; survivors 0**
```

---

## 9. WHAT THIS WAVE DID **NOT** FIX - `$249F8A`, and the brief asked

The brief: *"`$2564BA` makes `$249F8A` (player death, which quarters
`$81B646`) reachable, and only the page's own `$FF` poke hides it from players.
If your work touches that path, say so."*

**IT TOUCHES IT AND IT DOES NOT WIDEN IT.** `$2564BA` is the *ordinary* bomb's
cooldown expiry and the laser bomb reaches the SAME instruction, by the same
route (`$25619A move.w #$28,$81296C` then `$255DEA subq.w`), so:

* `[M]` the 2,200-step gate DOES stop, at logic frame ~3,202, and its
  `romAddress` is `$249F8A`. The gate asserts *"the ONLY stop is `$249F8A`"*
  by address, exactly as W64's does, and does not narrow around it.
* `[M]` `--break no-press` on the same input does not stop at all.
* **THE OWNER STILL DOES NOT MEET IT.** `src/web/app.js:699 g.ram.setU8(INVULN,
  0xff)` re-pins `$810424` every frame, so `[M]` `inv` is `ff` on all 21
  browser samples of both runs and `PAGE ERRORS []`.

**Is it MORE reachable now?** `[M]` no, and the reason is measurable rather
than assured: the expiry is the same instruction, fired the same number of
times per bomb, at the same `$28` delay. What IS new is that the laser bomb
lasts 131 frames against 107, so the mortal window opens 24 frames later per
bomb. That is the whole difference. **`$249F8A` remains unported, declared,
named in the throw and asserted by address - it is not this wave's, and this
wave did not make it worse.**

---

## 10. COVERAGE - branches and table entries, never frames

* **`$249A80..$249AF4`: 17 transcribed, `[M]` 17 REACHED** (both P1 and P2 arms
  are transcribed; P2's is unit-tested and unexercised, `$8130C0` is `$FFFF`).
* **`$255FE2`'s TWO phases: 2 transcribed, `[M]` 2 REACHED**, three times each
  on the page. Its `($1,A6)`-bit-1 twin (`$256986` and five more script
  pointers, plus the `$28C542` cue) is transcribed as a THROW and unit-tested.
* **`$2561AA`'s TWO arms: 2 transcribed, `[M]` 2 REACHED** - the deref arm in
  phase 1 and the no-deref arm in phase 2.
* **`$256348`'s FOUR arms: 4 transcribed, `[M]` 3 REACHED**; `$256366 bset #$5`
  returning early needs `($28,A6)` non-zero AND bit 5 already set.
* **`$2456A6`'s THREE pools: 3 transcribed, `[M]` 3 REACHED** - `[M]` 32 pool-A
  hits, 55 pool-B hits and 54 bullet erasures on the deployed page.
* **`$2456A6`'s pool-A guard has THREE arms** (`btst #$D` set → test `($18,A5)`;
  clear → require bit 0; else `$245844 bra`) and all three are transcribed;
  `[M]` 2 REACHED.
* **`$245902`'s bullet LADDER: 5 rungs transcribed, `[M]` 1 REACHED** (`$81B414`
  is 0 in this corpus, so 70 slots). The second rung is unit-tested.
* **`$289FF4`: transcribed, `[M]` REACHED**, and `$28A252`'s NON-NEGATIVE-D7
  arm (`$28A28C`, a third speed domain out of `$28A2D6`) is a THROW - the only
  producer of that tail in this port is `$289FF4`, whose `$28A00E` sets
  `$FFFF`. `$28A030`: 3 of 3 entries EXPORTED, `[M]` 3 REACHED.
* **`$24D188`/`$24D200`: 2 arms transcribed, `[M]` 2 REACHED**; `$2417D4`'s
  `$8130D2` arm is transcribed and unexercised.
* **`$24A4E2`: transcribed, `[M]` REACHED.**
* **Transcribed and unexercised, NAMED:** P2's whole laser arm; `$255FE2`'s
  bit-1 twin; `$28A252`'s `$28A2A8`-alternative; `$2417D4`'s no-move arm;
  `$2456A6`'s pool-A bit-13-clear arm.
* **Unit tests 878 → 921, 0 skipped.** New file `tests/w65beam.test.js` (43);
  three of W64's "it throws" rows are REPLACED, not deleted, by rows that
  separate the two arms. `webgate` **14 of 14**, unmoved.

---

## 11. THE GATE, ON THE SETTLED TREE

W58 §6's rule: a gate started before the tree settled is not evidence about the
tree.  The run below started **after** `.scratch/mutate65.mjs` had finished
touching `src/` (and it verifies every file sha256 byte-identical on the way
out) and after the last test edit; nothing was edited while it ran.

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 67 passed, 0 failed, 0 SKIPPED
  [PASS] THE LASER BOMB: $249A80, $255FE2 and $2456A6
  [PASS] THE LASER BOMB RED [no-press]    -- went red with Button 2 never pressed
  [PASS] THE LASER BOMB RED [rank-poke]   -- went red with a rank word poked
  [PASS] THE LASER BOMB RED [tap-fire]    -- went red with fire TAPPED
  [PASS] THE LASER BOMB RED [no-driver]   -- went red without type-5 call #7
```

**62 → 67 stages, and the five new ones are this wave's scenario and its four
REDs.** Nothing was disabled, skipped, narrowed or loosened. The ones this wave
could plausibly have broken, all green:

- **`fly-around: port vs board, 0 divergent frames` and its 5 REDs** - the only
  port-vs-board window this project has. It presses no button and holds no
  fire, so `($3f,A6)` stays 0, `$249A92` never runs and none of §4's three
  newly reachable paths is on it.
- **`THE BOMB` and its 4 REDs** (W64's) - the ORDINARY arm, and `[M]` 21 of 21
  after this wave rewired `$249A5C`'s other side.
- **`THE CHAIN EXPIRES` and its 3 REDs**; **`STAGE 1 ENDS`**; `display list`,
  `pixel gate` (100.0000 %), `demo gate`, `midboss DEATH`, `zoom coverage`,
  `replay determinism`, and `assets/integrity` with its `[rom-byte]` ROM-LEAK
  GUARD - **six new ROM windows and twenty new speed levels went through it**.
- **`background shard gate`** - the stage that FRESH-EXPORTS, i.e. where
  `check_beam_bomb_extents` actually runs against the cartridge.

**[M] THE SERVER I STARTED WAS KILLED.** `Get-CimInstance Win32_Process` finds
**zero** `python http.server` processes and `netstat` shows nothing listening
on 8000/8763/8764/8765 - checked by PROCESS and by PORT, as W61 §6b and W63 did.
The deployed run used no server of mine at all.

```
node --test games/ddpdoj/tests/     921 pass, 0 fail, 0 SKIPPED   (was 878)
node games/ddpdoj/tools/webgate.mjs 14 of 14 PASS                 (unmoved)
node tools/build-dist.mjs           clean, 5 deliberate exception(s)  <- UNMOVED
```

### 11.1 THE BOOT COST - +7,495 B, and most of it is not a ROM window

```
[M] manifest.json            10,776 ->  10,776       +0   (no new shard)
[M] player.tables.json.gz   140,523 -> 148,018   +7,495
[M] spr/streams.u32.gz         1,055 ->   1,055      +0
[M] seed.bin.gz                6,878 ->   6,878      +0
[M] capture.json.gz            3,920 ->   3,920      +0
[M] TOTAL                   162,744 -> 170,647   +7,495 B = 7.3 KiB
```

**This is the most expensive wave for boot since W54, and the reason is not the
six new ROM windows (1,634 raw bytes).** It is `$28A252`'s two `$241812` calls:
`$28A272 addq.b #$4,D0` after `$242E24` gives a speed domain of `$242E42`'s
whole 128-byte table plus 4, and `$28A284 move.w #$C0,D0` adds 192. **`[M]` the
exported speed set goes 72 → 92 levels, and each level is a 65-entry quadrant
of longword pairs (520 raw bytes).** The set is DERIVED - `beam_spark_speed_
indices()` reads the `addq`'s own immediate out of the opcode and the `move.w`'s
out of its extension word, and enumerates the canned table - exactly as W12
listed the pods' 224 and W31 the midboss's 112. It is not guessed and it is not
measured. **A reader who wants it smaller has to make `$28A252` unreachable,
not narrow the set.**

---

## 12. WHAT THIS WAVE DID NOT DO

- **THE HYPER.** Recon 38's wave 2. Every arm of `$249868` still throws.
- **`$249F8A`** (§9) - touched, measured, not widened, still unported.
- **THE BEAM IS NOT DRAWN** (§7.3). Three named missing sprite streams.
- **`$2926E2`'s TAIL** - W63 §5.3's, still not fixed.
- **`$28C528`/`$28C542`** - the laser bomb's two sound cues, counted notes;
  sound is item 6.
- **Nothing is compared against MAME.** No gate in this repo has ever held fire
  and pressed Button 2 against the board. What is proved is that the port runs
  the cartridge's own instructions in the cartridge's own slots. **Whether the
  board's beam lives 131 frames, whether its pool-B hit is `$208`, and whether
  it erases the same bullets are all unmeasured.**
- **`games/gradius/` was not touched.**

---

## 13. WHAT I COULD NOT DETERMINE

* **Why `$2561AA` dereferences `($2C,A6)` and `$2563B6` does not.** `$2561C8
  movea.l (A0,D0.w),A0` reads a POINTER out of `$256692` and `$2563E6 adda.w`
  then `$256438 move.l (A0),(A1)+` uses the pointer ITSELF as the anim long.
  Both are transcribed as written. Whether the second is a cartridge bug or a
  deliberate reuse of the table as data, I did not decide.
* **What `$812968` is for.** `$256072 move.w D0,$812968` writes 0 on the
  install frame and `[M]` nothing in `$255FE2`'s closure reads it.
* **Whether `$2417D4`'s `$8130D2` arm ever fires.** `[M]` 0 on every frame of
  every run here; the port transcribes both arms.
* **`$28A252`'s `$28A2A8` arm and `$28A2D6`'s eight words.** Reached only from
  the BEAM's three unported producers (`$289F96`/`$289FC0`/`$289FDA`); named in
  the throw with what it would read.
* **Whether `$24A4E2`'s aura and `$24D188`'s knockback look right.** Their
  STATE is transcribed and their art is not in the sheet (§7.3), so "right"
  here means "the same words in the same slots", not "the same pixels".

---

## 13b. A MUTANT REACHED HEAD, AND HOW IT WAS CAUGHT

`[M]` `git diff --stat HEAD` after the last commit of the wave showed ONE line
of `src/bomb.js` different: `$256220 add.w ($30,A5),D0` was `+ 0` in three
commits of HEAD and correct on disk. I had staged the file while
`.scratch/mutate65.mjs` was running in the BACKGROUND, and the bytes on disk at
that instant were mutant 21 of 59, mid-flight. The sweep restored the file and
verified it sha256 byte-identical a second later, so **every measurement in
this document ran against the correct line** - the 921 unit tests, the 22/22
gate, the 59-of-59 mutation round and `ALL GREEN 67/0/0` are all after the
restore. Only the published commits were wrong, and only for as long as it
took to notice.

HANDOVER's rule is *"`git commit` commits the INDEX, not your files"*. The one
this adds is **do not stage a file another process is editing**, and
`git diff --stat HEAD` at the end of a wave is what catches it when you do.

---

## 14. ONE PARAGRAPH

**Bombing while holding the beam works.** `$249A80` had been a throw since W64
declared it rather than inventing it, and the reason it deserved its own wave
is that it is not a bomb with a flag: one instruction, `$249A98 bset
#$0,($1,A1)`, sets bit 0 of the bomb record's own type word, and that bit routes
the driver to `$255FE2` - a FOUR-HEAD, 131-frame machine whose forty-one beam
segments are seeded one per frame at the ship's own position and culled at
`$7800` - and the damage to `$2456A6`, which builds a bounding box over all
forty-five records and asks pool B, pool A and the 210-slot bullet pool whether
they are inside it. **1 head + 41 segments + 3 more heads = 45, which is what
`$2564F0` has been wiping since W64 without anyone knowing why.** The wave also
turned on three routines this port had called "measured 0 on every frame" for
between one and sixty waves - the ship's knockback, the pods' knockback and the
ship's bit-7 aura - all three behind `$249A92 bset #$7,($1,A6)`, the first
instruction this port has ever run that sets that bit, and all three ported
rather than declared because each one stops the page. Recon 38 §1.5's "the
`$400` bit has exactly two setters" is stale: `$24580E` and `$2458E2` are a
third and fourth, so a laser-bomb kill runs `score.js`'s SECOND chain machine
and the score goes UP 23 % where W64 measured the ordinary bomb taking it down.
**No rank word moved** - five addresses, four inputs, 2,200 headless frames and
forty-two browser samples, against a poke that reddens all five. Two of my own
controls were vacuous and are replaced; six of my own fixtures agreed with both
readings and are replaced; and one real defect - an `armBombCancel243DA0` call
inside an optional-chaining argument list, which no gate could ever have caught
- was found by a unit test. **Hold Z on
`https://gbtman.pages.dev/games/ddpdoj/` until the beam is up, press X, and
watch thirty-one records go live and fifty-four enemy bullets disappear.**

status: **DONE**
