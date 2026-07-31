# Wave 7 — The power-up loop closed: capsule pickup, the meter, the shield
status: DONE
wave: 7   role: impl   started: 2026-07-31

## The task, as I understood it

Close the player-visible power-up loop on top of waves 2 (HUD), 5 (collision +
death) and 6 (weapons/kill chain):

* `$894B` pickup (INC `$42`, wrap 7 -> 1, the `$CE89` score-digit bonus, +$0050),
  reached from wave 5's class-1/type-6 collision arm at `$C1AF`.
* `$8974` apply: status exactly 1, **B HELD not edge**, the six `$8989` arms with
  already-owned refusals that KEEP the capsule; SPEED UP uncapped; `$45` capped
  at 2 by the arm only.
* Shield `$46` = 5, consumed at `$C1C1`, sixth hit dies via `$C1D6`;
  destroy-what-you-hit; the `$9E = 3` last-hit flash flag.
* `$9C45`'s rank `$17 = ($44!=0) + $45 + ($46!=0) + ($19!=0)`; `0017` in watch;
  check `$BBE5`'s effect on the cartridge before shipping `$17 >= 3` scenarios.
* HUD bar owned-forms (`$89E3` string `$19` substitution) + `$8A30` cursor patch
  wired to live state.
* Scenarios: natural pickup with B held, poked `$42` sweep 1-6, shield, and
  pickup-then-die.

## What I MEASURED, before writing a line

### 0. Baseline gate, re-run at the start of this wave (not quoted)

```
node --test games/gradius/tests/     239 pass, 0 fail, 0 skipped
```

### 1. The ROM bytes, disassembled here

`python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear ...` over
`$894B-$89E2`, `$8A30-$8A4B`, `$CE89-$CE93`, `$C183-$C1D5`, `$C1FD`, `$9C45`,
`$844B-$8480`, `$8B40-$8B95`, `$BBB7-$BBF0`.

`$8989` inline word table (`$83E4`), indexed by `$42` = 0..6:
`8983 89A1 89AF 89BB 89CF 89D3 8997`.

`$CE89: LDA $18 / ASL / ASL / TAY / LDA $07E5,Y / AND #$0F / RTS` -- confirmed
it genuinely is a digit of the player's own BCD score.

`$BBB7`: `$BBC1 BEQ $BBEC` skips the whole `$46`/`$17` ladder when
`$19 | $1A == 0`, so `$BBE5` is unreachable on stage 1 whatever the rank -- and
that is MEASURED below in the very scenario that drives `$17` to 4.

### 2. The natural pickup, and the same-frame consume (pow.py)

```
python games/gradius/tools/oracle/pow.py --frames 780 \
  --script "200:,10:S,190:,380:AB" --from 600 --poke "44=1@390-779" \
  --wexec 894B,C1AF,8974,89A1,8A30,9C45,BBE5,C1D6,BC59,AEC1 --changes
  f626   $40 0 -> 1   $42 stays 0
  $894B n=1  $C1AF n=1  $89A1 n=1  $9C45 n=470  $8974 n=470
  $BBE5 n=0  $BC59 n=0  $C1D6 n=0  $AEC1 n=2 (a SECOND squadron capsule at 676)
```

Same script without B (`380:A`): `$894B` n=1 at f626, `$89A1` n=0, `$42` reads 1
from f627 on. So the touch-frame consume is real, it is B-HELD, and the two runs
differ in `$40` and `$42` -- both compared bytes.

### 3. The six arms and their refusals, replayed as a corpus script

```
python games/gradius/tools/oracle/pow.py --frames 720 \
  --script "200:,10:S,190:,320:B" --from 400 \
  --poke "42=1@420,42=2@440,42=2@460,42=3@480,42=3@500,42=4@520,42=4@540,\
42=5@560,42=5@580,42=5@600,42=6@620,42=6@640,42=1@660"   (each one frame)

  f421 $40=1        SPEED UP
  f441 $41=1        MISSILE
  f461 $42=2 HELD   MISSILE refused, the capsule is KEPT
  f481 $44=2 $17=1  DOUBLE
  f501 $42=3 HELD   DOUBLE refused
  f521 $44=1        LASER (applies over DOUBLE)
  f541 $42=4 HELD   LASER refused
  f561 $45=1 $17=2  OPTION
  f581 $45=2 $17=3  OPTION again -- the cap is `>= 2`, so 1 still applies
  f601 $42=5 HELD   OPTION refused
  f621 $46=5 $17=4  SHIELD
  f641 $42=6 HELD   SHIELD refused
  f661 $40=2        SPEED UP AGAIN -- no owned test, no cap

  $8974 n=410  $8983 n=402  $89A1 n=2  $89AF n=21  $89BB n=21  $89CF n=21
  $89D3 n=22   $8997 n=21   $89DD n=6  $8A30 n=54
  $BBE5 n=0    $BC59 n=0    $C1C1 n=0  $C1D6 n=0
```

**`$BBE5` n = 0 at `$17` = 4.** That is the plan's risk 5 answered by
measurement, in the window that crosses both thresholds: the rank consumer the
plan names cannot run on stage 1 because `$BBC1` branches past it.

### 4. The shield: five absorptions, the sixth kills

```
python games/gradius/tools/oracle/pow.py --frames 1000 \
  --script "200:,10:S,190:,600:R" --from 400 --poke "46=5@400-400" \
  --wexec 8974,C1C1,C1BD,C1D0,C1D6,BC59,BE93,8B79,8B86,979D --changes

  $46  5 (f401) -> 4 (f493) -> 3 (f509) -> 2 (f526) -> 1 (f542) -> 0 (f647)
  $C1BD n=6   $C1C1 n=5   $C1D0 n=5 (destroy what you hit)  $BE93 n=5
  $C1D6 n=1 at f778   $979D n=1 at f898   $BC59 n=0
  $8B79 n=105  the $9E = 3 last-hit flash, on the 105 frames $46 == 1
  $8B86 n=247  the FORCE-FIELD METASPRITE, an extra $8AAC on 247 frames
```

`$8B86` is why the shield forces the sprite emitter to be ported in this wave:
`msExpanded`/`spriteRecords`/`spritesStored` are COMPARED fields and every
shielded frame draws one more metasprite than the port did.

### 5. Pickup-then-die, and the $CE89 arm reached without inventing a score

At the natural pickup (f626, `$44` = 1) the cartridge's score is
`$07E4 = $50, $07E5 = $00` -- five kills. `($07E5 & $0F) == 0`, so poking
`$42 = 6` one frame earlier makes the INC land on 7 and takes the RAPID-FIRE arm:

```
python games/gradius/tools/oracle/pow.py --frames 900 \
  --script "200:,10:S,190:,230:A,280:RA" --from 620 \
  --poke "44=1@390-899,42=6@625-625" --exec 894B,C1D6,CE89,8958

  f626  $894B with $42 = 6 -> 7; $CE89 -> 0; $8958: $35 = 20 -> 4; $42 -> 1
  f674  a SECOND natural pickup, $42 1 -> 2, $47 1 -> 2
  f778  $C1D6, death by enemy contact
  f898  $979D/$9B3E: $35 back to $14, $47 -> 0, $42 restored to 1 from $22,X
  $894B n=2  $CE89 n=1  $8958 n=1  $8960 n=0  $C1AF n=2  $BC59 n=0
```

### 6. CORRECTION TO MY OWN §2/§4/§5, and it matters

The pow.py runs above and the corpus scenarios are NOT the same experiment. pow
poked `$44` from frame **390**; a corpus scenario pokes from the align at **400**.
Ten extra frames of laser fire move every kill and therefore every capsule. The
same capsule is at f626 in the pow run and **f647** in `capsule-pickup`. I also
mis-attributed one exec frame: `$C1D6 f=778` came from the pickup-then-die run,
not from the shield run, whose death is at **f658**.

**Every number in the five scenarios' `why` blocks, and in the src/ comments, is
now taken from the scenario's own recorded artifact**, not from the pow runs.
The pow numbers are kept where they are labelled as pow numbers.

## What I did

New files:

* `games/gradius/src/powerup.js` -- `$894B` (INC `$42`, the `CMP #$07` gate, the
  `$CE89` digit and its two arms, the wrap to ONE, `$845B`'s +$0050, sfx `$0D`,
  `JMP $8A30`), `$8974` + all seven `jt_8989` arms with their already-owned
  refusals and shared tails, and `$9C45`.
* `games/gradius/tests/powerup.test.js` -- 13 tests.

Changed:

* `src/collision.js` -- `$C1AF` (free through `$C1FD` then `$894B`), `$C18C`
  (the every-16th item: free, sfx `$0B`, destroy every enemy, `JMP $C20A`) and
  `$C1C1` (the shield's DEC, `$C1D0`'s destroy-what-you-hit, `$C1C8`'s armoured
  accumulator). `contact()` now returns one of the ROM's three targets --
  `$C136`, `$C1D6`, `$C1AC` -- because `$C18C` abandons the sweep where `$C1AF`
  does not.
* `src/oam.js` -- `$8B67-$8B86`, the force field: a SECOND `$8AAC` on slot 0
  whenever `$46 != 0` and `$1B AND #$70` is clear, at `$5A + (($02 >> 2) & 3)`,
  with `$9E = 3` on the last hit.
* `src/score.js` -- `$8455`'s preamble (`scoreCapsuleBonus`, +$001000, the
  MIDDLE byte) and `$CE89` (`scoreDigit`).
* `src/enemies.js` -- `freeSlot` exported (`$C1FD` is `TYA / TAX / JMP $AEF8`).
* `src/nmi.js` -- `$9A73 JSR $8974` and `$9AC4 JSR $9C45` wired in.
* `src/state.js` -- `zp17`.
* `src/hud.js` -- `meterCursor` exported ($8A30 is both a fall-through tail and a
  JMP target).
* `porttrace.mjs` -- `$17` seeded and peeked; `$42` and `$46` added to POKEABLE.
* `scenarios.json` -- `0017` watched, five new scenarios.

Retired notes, all in this commit (rule 6): src/nmi.js's "WHAT IS NOT PORTED ...
the power-up rank $17 ($9AC4 JSR $9C45), the capsule apply ($9A73 JSR $8974)";
src/collision.js's three "wave 7" entries in WHAT IS NOT HERE and its
"$17 ... is wave 7"; src/hud.js's "$42 and $46 are still seeded" and its "$42 ...
is 0 on every frame of this corpus, so the whole body below is unexercised by the
oracle"; src/state.js's "SEEDED INPUTS, AND HOW MUCH OF THAT IS LEFT" ($42/$46
row), its `meter`/`shield` "wave 7" notes; src/enemies.js's "$46 (the shield,
wave 7) and $17 (the power-up rank, wave 7)"; src/weapons.js's "$35 is a byte
wave 7 can move"; src/score.js's "the CAPSULE (wave 7)"; src/oam.js's
"$8B67-$8B86 ... Not ported -- $46 is always 0 here and the shield was never
measured"; tests/collision.test.js's two "is wave 7, and says so" tests (INVERTED,
not deleted) and tests/collision-unwitnessed.test.js's use of the `$C1AF` throw
as its descending-order witness; tests/weapons.test.js's "wave 7 uses that one".

## What I MEASURED, after

### The gate

```
node --test games/gradius/tests/          256 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs
  35 scenarios, 11695 of 11695 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
  1350 dying frames across 12 scenario(s); 13 of 35 carry an expectDying
  self-check: lead1 RED 193, seed-x+1 RED 116, laginject=450 RED 640
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
python games/gradius/tools/verify_assets.py --self-test
  35 of 35 mutations reddened their target; 13 of 13 families seen red
node tools/build-dist.mjs
  rom-leak guard: 125 files checked against 2 ROM(s) -- clean, 1 deliberate exception
```

Before this wave (HEAD): 30 scenarios, 9695 frames, 239 unit tests, 521 watched
addresses. After: **35 scenarios, 11695 frames (+2000), 256 unit tests, 522
watched addresses.** The whole corpus was re-recorded (`scen.py`, all 35) because
the watch list grew by `$17`.

### The five new scenarios, each 0 divergent frames

```
capsule-pickup   299 frames  $42 0 -> 1 at f647, held to the end; the $8A30 cursor
capsule-consume  299 frames  the SAME capsule with B held: $40 0 -> 1, $42 never moves
capsule-sweep    319 frames  all six arms + six refusals + a second SPEED UP;
                             $17 walks 0,1,2,3,4
capsule-shield   559 frames  $46 5->0 at f493/509/526/542/647, death at f658
capsule-die      559 frames  $42 6 -> 1 and $35 20 -> 4 at f635; death f793;
                             respawn f914 with $42 restored from $22,X
```

### EIGHTEEN DELIBERATE BREAKS AT CORPUS LEVEL

Each applied to `src/`, compared against eight scenarios (the five above plus
`right-wall`, `enemy-waves`, `autofire-laser`; baseline 0 failures), then
restored byte-for-byte from a sha256'd copy.

```
[RED] apply-on-edge         $8974 reads $05 not $07
                            capsule-consume w_0040@647 w_0042@647; capsule-sweep
[RED] wrap-to-zero          $8965 stores 0 instead of 1
                            capsule-die w_0042@635 (279 frames) + w_0704/w_0705
[RED] refusal-consumes      the MISSILE refusal clears $42
                            capsule-sweep w_0042@461 (20 frames), w_0721@464
[RED] speed-up-owned-test   $89A1 given an "already owned" test
                            capsule-sweep w_0040@661 w_0042@661 w_000E@661
[RED] option-cap-one        $89D5 made `>= 1`
                            capsule-sweep msExpanded/spriteRecords/stored @583
[RED] pickup-no-score       $8969 dropped     w_0709/w_070A@650 -- the HUD digits
[RED] pickup-no-cursor      $8971 JMP $8A30 dropped   w_000E@647 w_0700@647
[RED] rank-adds-shield-value  $17 += $46 instead of ($46 != 0)
                            capsule-sweep w_0017@621; capsule-shield w_0017@401
[RED] no-rank               $9C5B dropped      six scenarios, w_0017@401
[RED] no-shield-dec         $C1C1 dropped      capsule-shield playerX@779 (181)
[RED] shield-no-kill        $C1D0 dropped      capsule-shield playerX@499 (461)
[RED] capsule-not-freed     $C1FD dropped      three scenarios, msExpanded@648
[RED] no-force-field        $8B6B's arm dropped
                            capsule-sweep msExpanded@622; capsule-shield @402
[RED] apply-before-sweep    $9A73 MOVED above $9A70 (both halves)
                            capsule-consume 25 fields, w_0040@647 w_0042@647
[GREEN] digit-whole-byte        $CE89's AND #$0F dropped
[GREEN] flash-always            $8B75's CPY #$01 dropped -> $9E always 3
[GREEN] force-field-no-dying-gate  $8B6F's AND #$70 dropped
[GREEN] every-enemy-keeps-sweeping $C1AC made JMP $C136
```

**One break was written wrong and that is worth recording.** My first
`apply-before-sweep` INSERTED a call before `$9A70` and left the real one at
`$9A73`, so the apply still happened in the right place and the run was GREEN. A
break that does not break validates nothing. Re-run as a genuine move it is RED
on 25 fields, first at frame 647 -- exactly the touch frame.

### THE FOUR THAT PASSED -- the findings, and what closed each

All four are closed by unit tests written for them, and every one of those tests
was then SEEN RED (eight mutations, `node --test` after each):

1. **`digit-whole-byte`.** `capsule-die` is the only scenario that reaches
   `$CE89`, and the score there has `$07E5 = $00` -- where `AND #$0F` and the
   whole byte agree. Nothing recorded can separate them. Closed by
   tests/powerup.test.js's four-row `$07E5` table, whose `$10` row is the one
   that separates them (`$10 & $0F == 0` takes the arm, `$10` does not). RED.
2. **`flash-always` (and `flash-stores-not-ors`).** The compared OAM fields are
   sprite 0's four bytes and the four work counters. `$9E` changes NEITHER -- it
   changes the attribute byte of a sprite the comparison does not read, and the
   recon already measured that `$9E` reads 0 at `$80B5` even on 645 frames it was
   set. Closed by tests/oam.test.js `$8B79`, which reads the force field's own
   attribute byte out of shadow OAM: `$21` at `$46` = 2 and 5, `$23` at `$46` = 1.
   Both mutations RED. Note the assertion is on `$21 | 3 = $23`, not on `& 3`,
   because a port that STORED `$9E` instead of ORing it would pass a `& 3` test.
3. **`force-field-no-dying-gate`.** `capsule-shield` is the only scenario with a
   shield AND a death, and `$46` drains to 0 at f647 -- eleven frames BEFORE the
   death at f658 -- so the `$46` test and the `$1B AND #$70` gate always decline
   together. Closed by tests/oam.test.js `$8B6F`, which forces `$46 = 3` with
   `$1B` = `$A0`/`$90`/`$C0`/`$8F`. RED.
4. **`every-enemy-keeps-sweeping`.** `$C18C` is unreachable in any scenario:
   `$47` must reach 16 promotions in one life and the corpus's best is 2, and
   `$47` is not a pokeable address. Closed by tests/collision.test.js `$C18C`,
   which asserts `$A8` is left at the touched slot (a continuing sweep would run
   it to `$FF`), that `$894B` is NOT called, that the sfx is `$0B` and not `$0D`,
   and that the three skip conditions each skip. Three mutations RED.

### Loop shapes -- docs/knowledge/06 mechanism (C)

This wave adds ONE new loop: `$C194-$C1AA`, ten iterations, `LDY #$09 / DEY /
BPL` with no early exit. It is inside `$C18C`, which no scenario reaches, so it
is asserted by the unit test rather than by a compared counter -- said out loud
because the other loops in this port carry a compared iteration count and this
one cannot. Nothing else here iterates: `$894B`, `$8974`, `$9C45`, `$C1AF`,
`$C1C1` and `$8B67` are all straight-line.

## What I could not do, and why

* **`$8960`, the `($07E5 & $0F) == 5` score bonus, is not in the corpus.** It
  needs a seventh capsule collected at a score whose hundreds digit is exactly 5,
  and `$07E5` is not a pokeable address (only values the cartridge produces are,
  and a score is produced by kills, not by a poke). `capsule-die` takes the OTHER
  arm and measures `$8960` n = 0 on the cartridge; the `== 5` row is a unit test.
* **`$C18C` has no scenario**, for the reason above. It is ported rather than
  left a throw because a real player DOES reach a 16th capsule and an unported
  throw there is a frozen game -- 05-FINDING-enemy-bullets-reached-in-play.md is
  that exact mistake, found the hard way. The port is from the listing with the
  recon's outcome measurement (`--poke 47=15`: type 7, `$C18C` n=1, `$C1AF` n=0,
  all ten slots -> class 2) behind it, and it says so at the code.
* **`$C1C8`, the armoured tail of the shield**, is one line and unexercised: no
  stage-1 squadron sets bit 7 of `$010C`, and `$C1D0` fired on 5 of 5
  absorptions. Held by a unit test only.
* **`$C24E` and `$C293`, the other two `DEC $46` sites**, are still absent. They
  need the `$0136,Y` array populated (enemy bullets, excluded) and `$19 == 4`
  (stage 5). The recon could not reach either. The port is unchanged there and
  both routes remain loud throws in `playerVsBullets` / the stage-5 arm.
* **Terrain versus the shield.** `$C2B5`-`$C2C1` has no `$46` test at all, so
  terrain kills a shielded ship. That is read off the bytes; `$C2C1` has never
  fired with a shield up on this machine and `capsule-shield` does not cross a
  poked cell. Recorded in src/collision.js at the code, unverified.
* **The picture.** No pixel comparison covers a shielded ship. The force field's
  position, id and attribute are held against shadow OAM, which is one step short
  of a framebuffer -- docs/knowledge/02 trap 2. A `videoprobe.py` capture of a
  shielded frame would close it and is not in this wave.
* **The sound requests are still recorded, not compared.** `$896C` (`$0D`),
  `$89DD` (`$0E`) and `$C18F` (`$0B`) join the list `state.sfx` carries; wave 8
  is what turns them into a compared field.
* **Two-player.** `$897D LDA $07,X` throws if `$18 != 0`, as everywhere else.

## If someone picks this up cold

Four things that would have cost a day each:

1. **`$9A73` is AFTER `$9A70`, and that is the whole design.** The pickup INCs
   `$42` and the apply consumes it three instructions later, in the same frame,
   which is why `$8974` reads `$07` (held) and not `$05` (edge) and why `$42` is
   almost never observable at the `$80B5` sample point. Moving the call is RED on
   25 fields; the ONLY frames `$42` is visible at all with B down are the
   already-owned refusals, which keep it.
2. **`$C1AF` and `$C18C` end differently.** `$C1B5` is `JMP $C136` (keep
   sweeping) and `$C1AC` is `JMP $C20A` (abandon it). Both look like "the item is
   consumed, carry on". A single boolean return cannot express that, which is why
   `contact()` returns the ROM's three targets by name.
3. **A shield puts an extra sprite in the display list on every frame.** It is
   not cosmetic: `msExpanded`/`spriteRecords`/`spritesStored` are compared
   counters and the extra expansion re-orders every sprite after it. Any wave
   that gives the ship a shield must port `$8B67` in the same commit.
4. **`$17` is not wiped by the death.** `$9B3E` clears `$3D-$97` and `$17` sits
   below it, and no intro state reaches `$9AC4`, so the rank the last played frame
   computed survives the whole 121-frame death and the respawn intro. A port that
   recomputed the rank wherever `$44`/`$45`/`$46` are written zeroes it one frame
   early, at the wipe.

Reproduce anything here with:

```
python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear 894B 89E3
python games/gradius/tools/oracle/pow.py --frames 720 \
  --script "200:,10:S,190:,320:B" --from 400 \
  --poke "42=1@420-420,42=2@440-440,42=2@460-460,42=3@480-480,42=3@500-500,\
42=4@520-520,42=4@540-540,42=5@560-560,42=5@580-580,42=5@600-600,\
42=6@620-620,42=6@640-640,42=1@660-660" \
  --wexec 8974,8983,89A1,89AF,89BB,89CF,89D3,8997,89DD,8A30,BBE5,BC59 --changes
python games/gradius/tools/oracle/scen.py --only capsule-sweep
node games/gradius/tools/oracle/compare.mjs --only capsule-sweep
node games/gradius/tools/test-all.mjs
```
