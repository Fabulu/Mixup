# Wave 32c IMPLEMENTER -- the last arm interactions, and the sixth wall nobody had counted

status: IN PROGRESS
implementer, 2026-08-04

Scope, from the brief and `32-recon-destructible-terrain.md` §8 + `32b-impl-substrate.md` §3/§9:
**W32c only.** The remaining arm INTERACTION routines, ~285 bytes:
* `$C037` -> `$BEF3`/`$BF0B` -- a player shot destroys an arm (W32a's WALL 5)
* `$CBD1` -- the arm's tip fires (throwing from INSIDE W32b's ported driver)

`$C263` was in the recon's W32c list; W32b already ported it (its §4, a deliberate
66-byte scope deviation).

---

## HEADLINE, written early so an interrupted run still says something

1. **BOTH WALLS FELL.** `$BEF3`/`$BF0B` (130 bytes) and `$CBD1` (72 bytes) are
   ported. `$CBD1`'s throw was the only place in this subsystem where a gap sat
   behind working code, and it is gone.
2. **THE SCOPE GUARD MOVED, `>= 4` -> `>= 5`.** `stageledger.py`'s runnability
   column now prints **`4  admitted   $C653 ported   RUNNABLE`** for stage `$19=4`.
   The evidence is §4, and it is a measurement, not a decision.
3. **W32a'S FIVE-WALL LIST WAS INCOMPLETE AND SO WAS THE RECON'S.** There are
   **SIX** `$19 == 4` sites in the PRG, counted this session out of
   `assets/prg.bin` by scanning for `A5 19 C9 04`. The sixth is **`$A17C`, the
   MISSILE's terrain-probe bypass**, and it fires for any player past the second
   power-up. §2.
4. **AND A SEVENTH THING, WHICH WAS NEVER A STAGE-5 GAP AT ALL: `$BC44`.** Its
   throw was bounded at `$19 >= 2`, so **stages 3 and 4 -- both printed RUNNABLE
   by `stageledger.py` since W30 and W31 -- crashed the first time any enemy
   fired a bullet.** Found at frame 190 of the first stage-5 run. §3.
5. **A CLAIM I NEARLY SHIPPED, FALSIFIED BY MY OWN CHECK.** §6.

```
stageledger.py, stage $19 = 4

  BEFORE   28 distinct   28 ported   0 unported   100.0 %   THROWS (scope guard)   blocked
  AFTER    28 distinct   28 ported   0 unported   100.0 %   admitted               RUNNABLE

node games/gradius/tools/test-all.mjs   GREEN -- 11 passed, 0 failed, 0 SKIPPED
node --test games/gradius/tests/        565 pass, 0 fail, 0 skipped  (551 before)
python .../tablecoverage.py             OK, 81 indexed bases (78 before), 53 ranges
```

The RECORD ledger could not move -- it was already 28/28 before this wave. The
only column W32c could move is runnability, and it did.

---

## BASELINE, MEASURED BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (the brief's path
`games/gradius/tools/stageledger.py` still does not exist; the tool lives under
`tools/oracle/` -- the same correction W30, W31, W32a and W32b all had to make):

```
stage  distinct  ported   unported  inline5  ported %     first unported
4      28        28       0         4        100.0        NONE (shipped)   <-- MY STAGE

PER-STAGE RUNNABILITY
4      THROWS (scope guard)   $C653 ported          blocked
```

`node --test games/gradius/tests/`: **551 pass, 0 fail, 0 skipped.**
`node games/gradius/tools/test-all.mjs`: **GREEN -- 11 passed, 0 failed, 0 SKIPPED.**

---

## §1. WHAT WAS PORTED

| ROM | bytes | where | note |
|---|---|---|---|
| `$C037`-`$C046` | 16 | `src/collision.js` | the gate + the `$0123,X` RE-READ |
| `$BEF3`-`$BF0A` | 24 | `src/collision.js` | the group walk, `$A9` as the index |
| `$BF0B`-`$BF74` | 106 | `src/collision.js` | six segments, the hit counter, the kill |
| `$CBD1`-`$CC18` | 72 | `src/enemies.js` | the tip's shot |
| `$CB97`/`$CBC5` | 6 | `src/enemies.js` | `$A8` in the driver's walk -- `$CBD1` reads it twice |
| `$A17C`-`$A181` | 6 | `src/weapons.js` | the missile's stage-5 bypass (§2) |
| `$BC44`-`$BC4D` | 10 | `src/enemies.js` | the skip arm -- **no body to port** (§3) |
| | **240** | | recon estimated 285 for `$CBD1` + `$BEF3` + `$C263`; `$C263`'s 66 landed in W32b |

### THE TRAP IN `$BEF3`, AND IT IS THE ONE THE PORT ALMOST GOT WRONG

`$BEF3`'s group walk is the **only walk over the `$0600` pool in the whole port
that does not use `ARM_BASES`**, and the reason is four bytes inside a routine
three files away:

```
C0B7  A9 00     LDA #$00
C0B9  A6 A8     LDX $A8
C0BB  85 A9     STA $A9        <-- the loop index of $BEF3
```

Every path out of `$BF0B` that consumes the shot leaves through `$C0B7`, and
`freeShotSlot()` has written `state.spawn.zA9 = 0` since wave 6 for the ENEMY
sweep's sake (`$C033 DEC $A9 / BPL`). `$BF04 SBC #$30` on 0 gives `$D0`, which
fails `$BF08`'s `BPL`. **So a shot that hits anything stops sweeping the
remaining groups.** A `for (const base of ARM_BASES)` port would let one shot
damage two arms in one frame, and no positional or timing check would see it --
it is a two-group fixture or nothing. Check 2 is that fixture.

`JMP $C0B7` IS NOT A STACK DISCARD, which is the other way to get this wrong.
`$C0B7` falls into `$C0BD` and then `$C0C6 RTS`, which pops the address `$BEFE
JSR $BF0B` pushed -- so it returns to `$BF01`, exactly where `$BF30 RTS` would
have. The only difference from an ordinary return is the `$A9 = 0`.

### READING PAST THE APPARENT END -- what was checked

* `$BF0A RTS` ends `sub_BEF3`; `$BF0B` is `sub_BF0B`, whose only xref is
  `$BEFE JSR`. Not a fall-through.
* `$BF72 JMP $C0B7` is followed by `sub_BF75`, whose only xref is `$C030`. Not a
  fall-through.
* `$CBDB` is BOTH a branch target (`$CBE3`, `$CBE7`, `$CBEE`) **and** the
  fall-through of `$CBD9`'s failed `BPL`. Four ways to decline to fire, one RTS.
* `$CC16 JMP $BCB1` is `TXA / CLC / ADC #$0A` **falling into** `$BCB5` -- the
  fall-through pair `allocBullet` already documents. `$CBD1` reuses it rather
  than re-transcribing.
* `$CC19` (`loc_CC19`) sits between `$CC18` and `$CC1F` and is reached only from
  `$CC36 BEQ`. Already W32b's.

### THE POST-TEST LOOPS, ALL FOUR OF THEM

W32b's warning 1 (its first draft's five group walks did nothing, because the
ROM's `BPL` is at the END of the loop and a JS pre-test `while` rejects base
`$90` on sight). W32c has FOUR loops in this region and every one is post-test:

| ROM | loop | shape | check that would fail if reversed |
|---|---|---|---|
| `$BEF3` | four groups `$90..$00` | `SBC #$30 / BPL` at the end | check 2's "the `$30` group IS walked" |
| `$BF0B` | six segments 5..0 | `DEC $AB / BPL` at the end | check 3, all six segments |
| `$CBD1` | ten bullet slots 9..0 | `DEX / BPL` at the end, **falling through to the RTS** | check 7's "slots 9 and 8 busy -> slot 7" |
| `$CB91` | four groups (W32b's) | unchanged | -- |

`$CBD1`'s is the interesting one: the loop's *failure* exit is a fall-through
into `loc_CBDB`, so "no free slot" and "the muzzle is out of bounds" share one
`RTS` and are indistinguishable from outside. They are counted separately in the
port (`state.work.armBulletAllocFail` counts ONLY the allocator's failure), and
check 8 pins both.

### THE DEAD CODE, TRANSCRIBED AS COMMENTS

* `$BF4C LDX #$00` and `$BF4E LDA #$00` -- X is overwritten by `$BF52 LDX
  $0600,Y` and A by `$BF58 LDA #$00`, both within three instructions. They read
  like a slot-0 default and are not one. (The recon named them; this is the
  confirmation from the port.)
* `$CBF0 STX $A9` -- `$BCB5 STA $A9` overwrites it with slot + `$0A` two
  instructions later and nothing in between reads `$A9`. Transcribed anyway
  (one line, and `$A9` is a real zero-page byte), and named so nobody
  re-derives it as meaningful.
* `$CC02 LDY $A8 / LDA $061D,Y` RE-READS both tip coordinates that `$CBDE`/
  `$CBE9` already tested. Nothing writes them in between, so the values are the
  same; transcribed as a re-read because that is what the ROM does.

### THE MISSING `SEC`, AGAIN

`$BF23 LDA $A1 / SBC $0620,X` has no `SEC`. The carry is whatever `$BF1D CMP
$A3` left, and the only way to reach it is that `CMP`'s `BCS` NOT being taken --
i.e. carry CLEAR. So **dy is one more than the true difference** and the 10 px
band sits 1 px high, while dx (which does have `$BF19 SEC`) does not. Check 4
pins both edges of both axes, and pins that dx is compared against the SHOT's
width `$BFD2[subtype]` -- `$10` for a shot, `$30` for the laser -- so "the laser
reaches further" is that one table byte and nothing else.

### `$A8` IN THE DRIVER, A W32b DEVIATION THIS WAVE HAD TO CLOSE

W32b's `armDriver` never wrote `state.spawn.zA8`, because nothing in the walk
read it. `$CBD1` reads it TWICE (`$CBDC LDY $A8` and `$CC02 LDY $A8`), so the
byte is kept for real now, and the exit value is `$D0` (the walk steps by `$30`;
`$00 - $30` is what fails `$CBC7`'s `BPL`), not `$FF`.

---

## §2. THE SIXTH WALL: `$A17C`, AND HOW IT WAS FOUND

W32a's §4 named FIVE stage-5 gates and W32b knocked down four of them. That list
was assembled by reading; this wave counted instead. Scanning `assets/prg.bin`
for the byte sequence `A5 19 C9 04` (`LDA $19 / CMP #$04`) finds **six**:

```
8B8D  -> $8BD9   the segment sprite pass                       W32b
9663             the $5C census + the half-rate frame fork     W32b
A17C             the MISSILE's terrain-probe bypass            W32c   <-- MISSING
C037  -> $BEF3   a shot against an arm segment                 W32c
C25D  -> $C267   the player's body against the segments        W32b
C772  -> $CB8A   the per-frame arm driver                      W32b
```

A wider scan for every `LDA $19` (26 sites) confirms there is no other
comparison of `$19` against 4 anywhere -- no `CPX`/`CPY` form, no absolute
`LDA $0019`.

```
A17C  A5 19      LDA $19
A17E  C9 04      CMP #$04
A180  F0 28      BEQ $A1AA        <-- past $A182 JSR $C3AF and both of $A187's arms
```

`$A1AA` is the FLY body, with Y still 0 from `$A173`. So on stage 5 a missile
never probes terrain, never crawls, is never stopped by a wall, and lives until
`$A1B9`'s floor test or `$A1D2`'s right edge. It is the same exclusion `$C2AB
CMP #$04 / RTS` applies to the player's own terrain block: **stage 5 has no
terrain collision at all**, so probing it would read a map nothing maintains.

The port had it as a loud throw whose message said *"UNMEASURED -- `$19` was 0 on
every frame of every run made here, so the bypass has never been taken."* Both
halves were true and the conclusion drawn from them was the project's oldest
mistake: that was a fact about the CORPUS. Six bytes of branch, and it would have
crashed stage 5 for anybody who picked up missiles.

---

## §3. THE SEVENTH THING, AND IT WAS NEVER STAGE 5's: `$BC44`

Found at **frame 190 of the first 600-frame stage-5 run** -- not by reading, not
by the ledger, and not by any of the three waves that studied this subsystem.

```
BC44  A5 1A      LDA $1A / D0 11 BNE $BC59      any LOOP skips the gate
BC48  A5 19      LDA $19 / C9 02 CMP #$02 / B0 0B BCS $BC59   stage 3+ too
BC4E  A6 A8      LDX $A8 / AD 60 03 LDA $0360 / DD 6C 03 CMP $036C,X
BC56  90 01      BCC $BC59 / 60 RTS            fire only if the ship is LEFT
```

The port threw here, tagged *"stages 3+ are out of scope (W29 ships stage 2)."*
Two things about that were wrong by the time W32c read it:

1. **It was never a stage-5 wall.** The bound is `$19 >= 2`, so it fires on
   stages 3, 4, 5, 6 AND 7 -- and stages 3 (`$19=2`) and 4 (`$19=3`) have been
   past the `$A2F0` scope guard since W30 and W31, with `stageledger.py`
   printing **RUNNABLE** for both. **Any enemy firing a bullet on stage 3 or 4
   crashed the port.** No ledger column could see it: the ledger measures
   type-to-handler coverage and this is a per-frame path *inside an already
   ported handler* -- the exact shape `$CBD1` had, one file away.
2. **There is nothing to port.** Both branches land on `$BC59`, the allocator,
   which has been ported since wave 11. The arm is eight bytes of test and the
   body is the `else` that was already there.

This is the third time on this project that "no measured run has exercised it"
has been found to mean "our runs cannot get there", and the second time the
thing behind it was one branch.

---

## §4. THE MEASUREMENT THE SCOPE GUARD RESTS ON

The brief: *lower it ONLY when both are ported and you have measured that a
stage-5 frame with a NON-EMPTY pool survives a player shot.*

Measured, and it is check 14 of `tests/w32c-interactions.test.js` so it runs on
every gate rather than living in a scratchpad:

```
1780 full nmi() frames, $19 = 4, seeded on stage 5's own chunk 0 ($A7D0[4]),
camera stepped 2 px/frame so the loader crosses all SEVEN 512-px boundaries
(chunk 2 = $ABE8, the four inline-5 records that allocate arms)

  arm groups allocated by the game's own records : 21
  $BF3C segment-2 hits                            : 31
  $BF49 arms shot apart                           : 16
  $CBD1 arm bullets fired                         : 37
  $96A0 forked frames ($5B)                       : 666
  $5C values seen                                 : 0, 1, 2
  scroll reached                                  : $1015  (stage 5 is $0E00)
  THROWS                                          : 0
```

**`$0605` IS THE PROOF OBJECT.** Exactly one instruction in the whole PRG writes
it (`$BF3C INC $0605,X`) and exactly one reads it (`$BF3F`) -- counted, not
assumed -- so a rise in it is a player shot reaching segment 2 of a live arm and
nothing else can produce one.

### THREE INTERVENTIONS, LABELLED (`docs/knowledge/09`)

The shield is held at `$FF`, missiles are re-supplied, and **the two shot slots
are AIMED at segment 2 of whichever group is live**. The last one is necessary
and the necessity is itself measured: **an identical run without it produced
1780 clean frames and ZERO segment-2 hits**, because the boot player position
never intersects the arms. So this run is evidence about the CODE under a forced
state -- valid for "does this path survive" -- and **invalid** as a description
of how stage 5 plays.

### AND THE ORDER THE WALLS WERE FOUND IN

The first version of this run, with the guard already lowered, threw three times
before it got to 1780 frames, and each throw was a wall:

```
frame   0   $0000 is not in any exported range   -- the fixture had no chunk pointer
frame 190   $BC44                                -- §3, and NOT a stage-5 gap
frame 2829  $9751 restart-to-title               -- mode 0, a known out-of-scope path
                                                    reached because the player kept dying
```

Only the middle one was a port gap. The first was my fixture and the third is
`$80D4`'s missing game modes (1 of 7), which is not this wave's.

---

## §5. TABLE COVERAGE, AND A FOURTH ROOT

W32c reads no table W32b did not already export: `$BEEA` (nine rank rows),
`$CBCA` (seven), `$BFCE`/`$BFD2`/`$BFD6` (the shot's own, since wave 6). But the
brief's warning about `tablecoverage.py`'s root set applies again, one routine
further out:

**`$A16F`, the missile loop, hangs off `$9FFC` (the player), not off the enemy
dispatch, so it was outside the walk** -- the same class of blindness as
`$8BD9`/`$CB91`/`$BEF3`, which W32b rooted. It indexes `$A1A4`/`$A1A6`/`$A1A8`.
Added as a fourth root. **MEASURED when it was added: 78 indexed bases -> 81, and
the tool still reports OK, so those three were already exported.** Rooted anyway,
because "already covered" is a fact to be re-checked on every run, not a reason
to leave a live routine outside the walk.

---

## §6. THE CLAIM I NEARLY SHIPPED, AND WHAT KILLED IT

The first draft of `sub_CBD1`'s header said, in bold:

> **THIS BULLET HAS TYPE 0, AND THAT IS NOT A CLEARED FIELD -- IT IS THE
> BULLET'S IDENTITY.** `$CBF9 STA $0316,X` writes 0 where `$BC83` writes
> `$BC66,Y`. ... **A player shot cannot destroy an arm's bullet.** Every other
> enemy bullet in the game can be shot down.

The check written to prove it went red, and the ROM said the check was right.
**`$BC66` is `00 01`** -- so the ordinary kind-0 enemy bullet is type 0 too, and
the last sentence was simply false. Counted properly: exactly six instructions
write `$0316` in the whole PRG (`$B8CA` the boss's, value 2; `$BAD1`, 0;
`$BC83`, `$BC66,Y` = 0 or 1; `$BFAE`, the free; `$C739`, 1; `$CBF9`, 0), and
exactly two read it (`$BF77`, `$BF90`).

What survives is narrower and true, and is what the header and the check now say:

* `$CBF9` writes a **CONSTANT**, so the arm has no counterpart to `$BC6E`'s
  status ladder and always fires kind 0. (Pinned by giving the owner a status in
  `$80`-`$8F`, `$BC6E`'s kind-1 window, and asserting the type is still 0.)
* type 0 makes `$BF7A`'s `BNE` fail, so the shot-vs-bullet sweep declines
  **before it looks at the geometry at all** -- measured against a type-1 bullet
  in exactly the same place, which IS destroyed. That is what makes it a
  statement about the byte rather than about the box.

Recorded rather than quietly corrected, because a bold false sentence in a
header is exactly the kind of inherited "fact" this project keeps having to
falsify, and this one would have been three waves old before anybody checked it.

---

## §7. WHAT ELSE THE PORT LEARNED ABOUT ITS OWN TESTS

* **W32b's `$CB91` check set `+$03 = 1` and called it "ODD -> `$CC45` RTS, no
  kinematics".** `$CC3B` DECs it to 0, which is EVEN, so the kinematics RAN. It
  did not matter then, because `$CBD1` threw before anything read the tip; it
  matters now, and W32c's first draft inherited the same wrong fixture and spent
  a red run on it. Corrected in both files with the derivation written down.
* **W32b's fork check used the `$A2F0` throw as its discriminator** ("did the
  spawn engine run?"). The guard moved, so the throw is gone. Rewritten to
  observe the engine's OUTPUT instead: stage 5's chunk 0 at scroll `$0000` has a
  record whose trigger is already reached, so a frame that runs `$A2C0` SPAWNS a
  type `$1D` and a frame that skips it does not. That is a strictly stronger
  discriminator -- a throw only ever proved the call happened.
* **Four inherited assertions were INVERTED rather than deleted**
  (`flow.test.js`'s stage-5 arm, `weapons.test.js`'s `$A17C` row,
  `w32a-b559.test.js`'s "the W32c gaps are loud", `w32b-arms.test.js`'s `$CBD1`
  throw). "The wall is gone" is exactly what this wave claims, and an absent
  check would not notice one of them coming back.

---

## §8. WHAT I COULD NOT REACH -- attempts, not absences

(filled in below as the wave closes)

---

status: IN PROGRESS
