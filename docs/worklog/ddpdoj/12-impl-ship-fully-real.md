# WAVE 12 - THE SHIP BECOMES FULLY REAL

status: **DONE** - every done-when in `PLAN-no-recordings.md` §W12 met, with two
of the wave-11 ablation's labels corrected against the listing (§3) and one
STANDING GATE now BLOCKED as a direct consequence of the fix the wave was asked
to make (§7 - read this before anything else).
wave: 12   role: implementer   started: 2026-08-01
target: **`ddpdojblk`, VERSION-B** (2002.10.07 BLACK VER). Every address is
build B unless the line says otherwise (`games/ddpdoj/NOTES-build-split.md`).
Machine pin printed on every run: `maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 B,
`BUILD required=B frames_on_required=3501 frames_on_other=699`.

Brief: `PLAN-no-recordings.md` §W12 - the option object `$24C096` as far as the
laser gate; buckets 19 and 15; the exhaust records; the 17 rebased animation
pairs so the ship BANKS; rename `P.animB` to the ship's X half-extents and add
the four hitbox columns; move the held-fire throw to the board's own gate.

*Removes:* **L2 and L3.**

---

## THE HEADLINE

```
python games/ddpdoj/tools/oracle/pgm.py shipgate
  SEED   lf=2000   2200 logic frames compared (lf 2001..4200)
  BUCKETS claimed 5 15 19 of the thirty; the other 27 come from the BOARD's
          staged bytes, so (B) tests this wave's producers and not the rest
  bucket  5  board record-count histogram: 0rec:1100f 3rec:1100f
  bucket 15  board record-count histogram: 2rec:2200f
  bucket 19  board record-count histogram: 1rec:1100f 3rec:1100f
  STAGED BYTES  divergent bucket-frames: 0
  EMITTED LIST  divergent frames: 0
  RESULT 0 DIVERGENT FRAMES over 2200 logic frames, staged AND emitted

pgm.py shipgate --break all
  RED OK: no-aura / aura-phase-flat / no-glow / glow-without-prot / pods-rigid /
          no-shadow / shadow-no-borrow / ship-order-swapped / no-option-object
  EXPECTED-GREEN OK: hitx-frozen (it is RED on pgm.py flyaround, GREEN here)
  ...and one DECLARATION was wrong: pod-asr-toward-zero was declared
  EXPECTED-GREEN and came back RED on 10 of 2,200 frames.  §6.

pgm.py flyaround        (fresh trace, 66 compared columns -- was 57)
  OPTION columns COMPARED (the option object $24C096 is ported, wave 12):
      o0y o0x o1y o1x -- the board first moves them at lf 2001
  DIVERGE scroll   first at lf=2321: port=0 board=65472
  RESULT 1 of 66 columns diverged
      ...and `scroll` is $813176, PRE-EXISTING and W14's: 11-review.md §4b
      reproduced the identical divergence on the commit before wave 11.

node --test games/ddpdoj/tests/     163 tests, 163 pass  (was 142)
pgm.py demogate                     PASS 15955968/15955968 = 100.0000%
node tools/webgate.mjs              PASS 11 files, one frame 100352 px
node tools/export-web.mjs           sprite streams 166 (16 of them the ship's
                                    own bank frames, harvested by address)
                                    BUNDLE 407.9 KiB served  (was 363 KiB)
```

**Two things the wave-11 ablation labelled wrongly, and one thing three waves of
notes labelled wrongly, are corrected in this commit.** §3.

---

## 1. WHAT WAS BUILT

| file | what |
|---|---|
| `src/shipsprite.js` | `$24A440`/`$24A44C`/`$24A458`/`$24A46C` → `$24A482` whole: the invulnerability aura (`$24A532`), the ship (`$24A538`), the glow (`$24A632`), the ground-plane shadow (`$249EA0`→`$23EFC0`), and the red-validation seam |
| `src/options.js` | `$24C096` as far as the laser gate: the `dbra` over players, the `$24BBAA` template copy with its four-byte hole, the `$24C134`/`$24C13A` byte copies, THE LASER GATE, `$24C29E`'s pod path, formation 2 (`$24C390`), `$24D12E` ×2 → bucket 15, the two pod shadows → bucket 5, the `$24C8E4` ramp-up |
| `src/protsim.js` | the `$500000` latch - `$246D04` set, `$246EA4` sum, `$246CAC` read - because the ship's third record goes through it |
| `src/spritequeue.js` | `enqueueRegisters` (the `$23EFC0`/`$23F1FA`/`$23F2CA` D1..D4 convention), `snapshotBucket`, and the corrected bucket names |
| `src/machine.js` | `P.animB` → the four hitbox half-extents; the `OPT` record map ($64 bytes, not $20) |
| `src/state.js` | 13 new compared columns + three new raw dumps; `OPTION_COLUMNS` spread into `CLAIMED` |
| `src/type5.js` | six of the 23 calls are now RUN, not counted; the held-fire throw moved out of here to where the instruction is |
| `tools/shipgate.mjs`, `pgm.py shipgate` | the gate: staged bytes AND emitted entries, ten mutations |
| `tools/export-tables.py` | the `$2553F2` hitbox under its own name, the ship/glow/aura tables as a ROM window, the option templates, and the pods' speed levels DERIVED from the deploy ramp |
| `tools/export-web.mjs` | the 17 rebased animation pairs in `manifest.ship`, 16 harvested by address |
| `src/render/capture.js`, `src/web/app.js`, `index.html` | the ship BANKS; the page says what is produced and what the recording still supplies |
| `tests/ship.test.js` | 21 listing-derived tests |

---

## 2. THE THREE MEASUREMENTS THE PORT IS BUILT ON

Nothing below was taken from a document. Each was re-measured this wave with
`tools/oracle/w11dl.lua` driving the `fly-around` script (2,301 pairs from
lf1900) plus `xref.py dasm` on the decrypted image.

### 2a. `$80390C` IS NOT A MODE FLAG - it is the phase, and it is why the ship's records alternate

The board's own bucket contents over `fly-around`:

```
bucket 19   0 B on 68 frames, 12 B on 1,116, 36 B on 1,117
bucket 15  24 B on 2,233 frames
bucket  5   0 B on 1,185, 36 B on 1,116
and buckets 19-with-36-B and 5-with-36-B are EXACTLY complementary
```

Three tests key off `tst.w $80390C` - `$24A496` (the aura), `$24A544` (the glow)
and `$249E86` (the ship's shadow) - and a fourth, `$24C3E6`, gates the pods'
shadows. `$80390C` has exactly ONE absolute-long writer in the whole image, the
`clr.w` at `$23BE18`, and it is 1 at the seed. The answer is that it is not
written as a word at all: **it is the high half of the counter word whose low
byte `$23BE92 bchg #0,$80390D` toggles every main-loop iteration**, so `tst.w
$80390C` reads 1 on one logic frame and 0 on the next. `src/machine.js` already
called `$80390D` `altPhase`; nobody had connected the two.

So: aura + ship + glow on one phase, ship alone + three shadows on the other.
Wave 9's attach report saw this and recorded it as "ODD" and "EVEN" phases
without knowing what drove them.

### 2b. THE PROTECTION LATCH IS ON THE SHIP'S DRAW PATH

`$24A5B6..$24A614` sets slot 0 to a ROM word, sets slot 1 to the ship's Y,
issues the `$40` sum and reads slot 1 back. That result is the long-axis
coordinate of the third bucket-19 record. There is no way around it.

The mapping was **derived from the board's own bytes**, not from
`NOTES-machine.md`'s one-line summary of MAME's handler:

```
lf2000   player posY $1179   $255A22[0] -> $255A2A = { F880, FC00, 0220 }
         board bucket-19 record 2 word 0 = $8027, i.e. long-axis field $27
         ($1179 + $F880) & $FFFF = $09F9 ;  $09F9 >> 6 = $27      <-- matches
         a dest of slot 0 would leave slot 1 = posY -> $1179 >> 6 = $45
```

A naive reading of `slot[a] = slot[b] + slot[c]` with `a` first would have drawn
that record 24 pixels out on every frame. `src/protsim.js` says which part of
this the measurement pins (the destination) and which it cannot (which of the
two source fields is which, because the game's only call shape has them equal).

### 2c. THE PODS ARE NOT AT A CONSTANT OFFSET - the offset is one frame of their own velocity

`$24C33A` copies the player's `(posY,posX)` long into BOTH pod sub-records every
frame; `$24D12E` then moves each pod by one frame of its own vector, speed index
`$E0` = 224 at angle `$10` / `$30`. MEASURED at lf2000: player posX `$14C0`,
pod 0 `$1CE2` (+`$822`), pod 1 `$0C9D` (−`$823`). **The one-unit asymmetry is
`asr.w #2` rounding toward −infinity** (−1666 → −417, +1666 → +416), and
`tests/ship.test.js` pins both numbers.

Speed index 224 is not in any template - all three `$24BBAA` templates carry
`($1a,A6) = 0`. It comes from the DEPLOY RAMP `$24C934 addq.b #8,($1a,A6)`,
which walks up to the formation's entry in `$24C928` (MEASURED `$E0 $E0 $F0 $E8
$E8 $F8`). The exporter now derives the reachable set from that ramp rather than
widening a constant by hand, and asserts every entry is a multiple of 8 (if one
were not, the `addq.b #8` could never equal it and the pod would never deploy).

---

## 3. THREE LABELS CORRECTED

1. **`P.animB` is the HITBOX.** `$249E78 move.l (A0,D0.w),($14,A6)` writes
   `$2553CA[0] = $2553F2` into `+$14`/`+$16`, which `$2459D0` reads as the
   ship's X half-extents. 10-recon-combat §3 found this; wave 12 renames it,
   and the four words `$8103F6..$8103FD` are compared columns for the first
   time. **They were in the port's RAM under an animation's name for eight
   waves and checked by nothing.** MEASURED, all 17 entries: `(0000,0080)` at
   tilt −$20, `(0080,0080)` at 0, `(0080,0000)` at +$20 - 4 px wide, against
   build A's `$1549AE` 6 px.
2. **Bucket 5 is the SHADOWS, not "the ship's exhaust"** (wave 11 §6). Its only
   two writers are `$23EFC0` and `$23EFEE`, and the three callers reached in
   `fly-around` are `$249EE2` (the ship's ground-plane shadow, D3 = `$0210`) and
   `$24C438`/`$24C470` (the pods', D3 = `$0208`). The wave-11 label came from a
   bounding box; the listing settles it.
3. **The "exhaust plume" is the INVULNERABILITY BLINK.** Wave 9's attach report
   named a 5x40 colour-2 record that way. It is `$24A532`, drawn only while
   `($3e,A6)` is non-zero (`$24A48E tst.b`). Every count in this worklog is
   therefore under `fly-around`'s `$810424 = $FF` intervention, and
   `tools/shipgate.mjs`'s header says so where the numbers are.

---

## 4. THE HELD-FIRE THROW, MOVED - and what it cost

`type5.js` fired on the **fourth** held frame and only when `speedIdx !==
laserFloor`. The board's gate is `$24C164 btst #4,($40,A6)` on the RAW HELD byte
`$24C134` copies out of the player, entered on the **first** held frame with no
speed-index condition. The old trigger meant **a player already at the speed
floor could hold fire and get silence** - the exact failure the throw existed to
prevent, narrowed instead of removed.

The throw now lives in `src/options.js` at the instruction, carries `$24C180`,
and `tests/ship.test.js` proves a hold AT THE FLOOR throws. Two wave-9 tests
were DELETED because they asserted the wrong thing while passing:

```
'the laser ramp guard trips on the FOURTH held frame, not the first'
'the guard does not trip when the ramp is already at its floor'
```

The second is an assertion that the bug would happen. They are quoted here
because that is what a wrong check looks like from the inside.

---

## 5. THE GATE, AND WHY IT IS TWO CLAIMS

`pgm.py shipgate` joins `w11dl.lua` (the board's thirty staged buffers at
`$23D382` and the list at the arm) with `frame.lua` (the input word and the RAM
seed) and asks two separate questions:

* **(A) staged bytes** - the port's own buckets 5/15/19, counter included,
  against the board's dump of the same instant.
* **(B) emitted entries** - the board's staged bytes for the other 27 buckets
  with the port's substituted for those three, run through the port's call #4,
  compared against the board's real 2,560-byte display list. **A record that is
  right but lands in the wrong entry fails (B) and passes (A)**, which is what
  `ship-order-swapped` exists to prove.

There is a THIRD instrument, at a different sample point: `b19`/`b15`/`b5` are
`PROBE_RAWDUMP` columns read at the ARM (call #4 clears the counters and never
touches the buffers), so `pgm.py shotgate` compared all three byte for byte over
its window as well - 0 divergent on 72 columns for the 13 frames it reached.

---

## 6. RED VALIDATION - nine red, one expected-green, and ONE DECLARATION WRONG

```
no-aura                1100 staged / 1942 list      RED
aura-phase-flat        1031 / 1031                  RED
no-glow                1100 / 1942                  RED
glow-without-prot      1100 / 1100                  RED
pods-rigid             3300 / 2200                  RED
no-shadow              1100 / 2035                  RED
shadow-no-borrow         10 / 10                    RED
ship-order-swapped     1100 / 1100                  RED
no-option-object       3300 / 2200                  RED
hitx-frozen               0 / 0                     GREEN, as DECLARED
pod-asr-toward-zero      10 / 10                    RED -- DECLARED GREEN. WRONG
```

**`pod-asr-toward-zero` was declared EXPECTED-GREEN before the run and came back
RED.** The declaration's reasoning was: one unit of 1/64 px, thrown away by the
enqueue's `asr.l #6`, and it cannot accumulate because `$24C33A` resets both
pods to the ship every frame. All three clauses are true and the conclusion was
still wrong - a unit still crosses a 64-boundary sometimes, and it does so on 10
of 2,200 frames. The declaration is corrected in `tools/shipgate.mjs` rather
than quietly dropped, because a wrong prediction that the gate caught is the
best evidence the gate works. `shadow-no-borrow` is red on the same 10-frame
scale for the same reason, and its rarity is now written next to it so nobody
later deletes it as "a mutation that barely does anything".

`hitx-frozen` is the one that must stay green here: the hitbox is READ by
`$2459D0`, never DRAWN, so freezing it changes no sprite byte and moves
`animb0`/`animb1` on `pgm.py flyaround`. That separation is the entire argument
for giving the hitbox columns of its own instead of trusting it to the picture.

---

## 7. THE COST: `pgm.py shotgate` IS NOW BLOCKED, AND IT IS THE FIX WORKING

```
pgm.py shotgate
  SEED   lf=4447  13 logic frames compared (lf 4448..4460)
  COLS   72 compared ... b19 b15 b5 ...
  BLOCKED at lf4461 by the named throw $24C180 -- the port reached a path this
          wave does not translate. 13 frames were compared before it.
  RESULT 0 of 72 columns diverged; and the run was BLOCKED at lf4461 by $24C180
```

`stage1-shot` taps P1 Button 1 for one frame every twenty. With the throw on the
board's real gate, the FIRST tap reaches `$24C180`. **This is not over-eager: on
that frame the board really does start folding the pods in** - `$24C1F6` →
`$24C23E sub.b D0,($1b,A6)` / `$24C242 add.b D0,($3b,A6)` moves both pod angles,
which feeds `o0x`/`o1x`, which are compared columns. A port that carried on
would be wrong from that frame.

What I did about it: made a named throw a RESULT rather than a stack trace -
`portdiff.mjs` now prints `BLOCKED at lfN by $ADDR` and exits 1, so a reader can
tell "stopped, here" from "diverged, here".

What I did NOT do, and why: there is no button that avoids it. Button 3
(auto-shot) does not touch the laser gate, but `player.js` already throws on it
at `$2497BA` (the `$80380F` operator block). Porting `$24C1F6..$24C29A` - the
pods folding in - is a real piece of work with its own tables (`$2536B6`,
`$2536D0`, `$24C906`) and the plan gives `$24C180` to **W24**. So W13, which
needs `stage1-shot`, inherits a choice: port the fold-in, or ship a
`stage1-shot` variant whose input never sets mirror bit 4. **The gate is
BLOCKED, labelled, and not weakened.**

---

## 8. WHAT IS NOT PORTED, BY ADDRESS

Every one is a loud named throw carrying the ROM address; none is a quiet
return.

> **CORRECTED BY WAVE 12.5, 2026-08-02. THAT SENTENCE WAS FALSE WHEN IT WAS
> WRITTEN.** `$24C390` fell through into `$24C476` - ~30 instructions writing
> the option block's handshake bits `($1,A6).3/.4` and the player's cadence
> pair `($34,A4)/($35,A4)` - and this wave's `formation2()` returned there with
> no throw and no `note()`. 12-review found it (**F2**); it is the ELEVENTH
> fall-through incident in this project and the twelfth entry in this table
> should always have been `$24C476`.
>
> The sentence was true of everything its author *considered*, which is exactly
> the shape of a guard tested only on the path that does not exercise it - and
> it is why 12.5's audit enumerated every `return` in `src/` against the
> listing rather than re-reading the ones it remembered writing. The block is
> ported in `src/options.js fireHandshake()`, its measurement is
> `docs/worklog/ddpdoj/12_5-impl-fallthrough-24C476.md`, and its gate is
> `pgm.py firegate` (2,571 board frames, 0 divergent, five red mutations).
>
> The one thing the sentence got right is the shape of the fix: `$24D480`, the
> pods' shot spawn that `$24C4F2` branches to, **is** a loud named throw now.

| ROM | what | why not |
|---|---|---|
| `$24C180` | THE LASER, the whole branch | W24. Reached the moment fire is held |
| `$24A4E2` | the `($1,A6)` bit-7 aura twin (`$2556BA`, size `$830`) | MEASURED 0 on every frame; `player.js` throws on the same bit at `$2496A2` |
| `$24A6B4` | the script-driven display walker behind state bit 8 | MEASURED 0 on all 2,301 sampled frames. It follows `($14,A6)` - **which is the HITBOX long, reused as a program pointer on that path** |
| `$24A576` | the glow's stick-down table pair (`$255882`/`$255A36`) | needs ship selector ≠ 0; TYPE-B has never run |
| `$24C4F8`, `$24C690` | option formations 4 and 6 | `($5a,A4)` MEASURED 2 everywhere |
| `$24C934` | the pods' DEPLOY ramp | reached only before the pods are out; the corpus seeds after |
| `$24CAA4`, `$24CA60`, `$24C2C4`, `$24C368`, `$24D188` | five state-bit branches inside `$24C096` | each MEASURED 0 in the window; each throws with its own address |
| `$253604` | the call between the ship's enqueue and the phase test | writes nothing in any compared column; counted |
| `$24D480` | THE PODS' SHOT SPAWN, which `$24C4F2` branches to | **ADDED BY WAVE 12.5.** W20's. Reached on the first fire edge, so `firegate` is a trace replay and not a live gate |
| `$249F16` | the score BCD block | W17 |

Not throws, but named absences: the port does not model `$23C008`'s write to
`$B0E000` (11-review F2, still open, W14's), and `$23D9E2`'s scale index
(11-review F1) was **not** fixed here - it is outside this wave's files and
nothing this wave added reaches it.

---

## 9. COMMANDS, AND THEIR ACTUAL OUTPUT

```
python games/ddpdoj/tools/oracle/pgm.py verify
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
python games/ddpdoj/tools/export-tables.py
  speed 256 levels ... 61 EXPORTED     (was 45; +16 for the pods' deploy ramp)
  wrote rip/port/player.tables.json (95623 bytes)
python games/ddpdoj/tools/oracle/pgm.py shipgate                 §THE HEADLINE
python games/ddpdoj/tools/oracle/pgm.py shipgate --reuse --break all
python games/ddpdoj/tools/oracle/pgm.py flyaround
python games/ddpdoj/tools/oracle/pgm.py shotgate                 §7
python games/ddpdoj/tools/oracle/pgm.py demogate
node games/ddpdoj/tools/export-web.mjs ; node games/ddpdoj/tools/webgate.mjs
node --test games/ddpdoj/tests/
python games/ddpdoj/tools/oracle/xref.py callers 23F2CA
  $24C8B4 $24CCC6 $24CDB6 $24CFB0 $24D17E $24D1F8 $24D27A     seven, all in $24C096
python games/ddpdoj/tools/oracle/xref.py callers 23F104
  $24A538 $24A6C4
python games/ddpdoj/tools/oracle/xref.py callers 23F1FA
  $24A532 $24A632
python games/ddpdoj/tools/oracle/xref.py callers 23F294
  $24A700 $24A730 $24A756
```

So bucket 19 has **seven** static feeders, not four: `$24A532`/`$24A538`
(reached), `$24A632` (reached), `$24A6C4`/`$24A700`/`$24A730`/`$24A756` (all
inside `$24A6B4`, which is a named throw). The plan's "four feeders" is a
miscount; the census is above.

---

## 10. WHAT I RULED OUT

1. **"`$80390C` is a mode/player-count flag."** False - §2a. It alternates every
   logic frame because it is the high half of the `bchg #0,$80390D` word.
2. **"The protection device changes no number the port needs."** False - §2b.
3. **"The pods sit at a constant offset from the ship."** True of the PIXELS and
   false of the mechanism: `$24C33A` + one frame of `$24D12E`. The distinction
   is exactly the `pods-rigid` mutation, and it is red on 3,300 bucket-frames.
4. **"The `$24BBAA` template carries the pods' speed index."** False - all three
   carry 0; the deploy ramp `$24C934` walks it to `$E0`.
5. **"A one-unit rounding difference below the sprite shift cannot be seen."**
   False, 10 times in 2,200 frames - §6.
6. **"Bucket 5 is the exhaust."** False - §3 item 2.

---

## 11. WHAT THE REVIEWER SHOULD LOOK AT HARDEST

1. **`src/protsim.js`'s argument mapping** (§2b). It is derived from one call
   shape and the file says which half of it is under-determined. If a second
   shape exists anywhere in build B, it settles the ambiguity - I did not find
   one and did not claim there is none.
2. **`$24C390`'s `bcc` semantics.** Three counters in this wave use
   `subq / bcc` and all three are UNSIGNED borrows (`($28,A6)`, `($48,A6)`,
   `($44,A6)`, plus the byte `($42,A6)`). A signed reading passes the gate on
   this corpus because the values never approach `$8000`.
3. **The `no-shadow` mutation's asymmetry**: 1,100 staged but 2,035 list
   divergences. The extra frames are residue - bucket 5's records are absent, so
   the emitted list is shorter and the tail of the previous frame survives. That
   is 11-review F4 (divergent counts are a presence signal, not independent
   failures) showing up again.
4. **§7.** A standing gate is blocked. It is the right outcome and it is still a
   blocked gate.
5. **The bucket-19 feeder census** (§9) against the plan's "four".
