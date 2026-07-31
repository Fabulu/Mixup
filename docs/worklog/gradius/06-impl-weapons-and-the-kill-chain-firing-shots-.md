# Wave 6 — Weapons and the kill chain: firing, shots, missiles, enemy death, score
status: DONE
wave: 6   role: impl   started: 2026-07-31

## The task, as I understood it

Hold A and the port must fire, hit, kill, score and drop capsules exactly like the
cartridge. Firing block `$A0E9-$A16D`, the shot loop `$A1E6`, the missile loop
`$A16F`, the `$BFE2` inner sweep + `$C055` + `$BE93` kill chain, the capsule
promotion (wave 3 already has `$AEC1`), and the BCD score adder `$845B`/`$8474` so
the wave-2 HUD seed becomes computed state.

The plan's `doneWhen` numbers pre-date waves 3-5. Baseline re-measured below.

## What I MEASURED, before writing a line

### 0. Baseline gate, re-run at the start of this wave (not quoted)

```
node --test games/gradius/tests/     198 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs
  23 scenarios, 7047 of 7047 frames compared (0 truncated), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

### 1. The ROM bytes, disassembled here

`python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear ...` over
`$A0E0-$A2C0`, `$BFCE-$C0C7`, `$BE93-$BEE9`, `$BF75-$BFCD`, `$8440-$8510`,
`$C2C4-$C310`, `$C3A3-$C420`, `$AE71-$AEE5`.

Tables, read out of the PRG:

```
A0E0  06 07 06     slot-A type by $44
A0E3  06 07 24     slot-B type by $44
A0E6  01 02 01     sfx id by $44
A1A4  02 00        dy   by fly(0)/crawl(1)
A1A6  00 02        dxhi
A1A8  80 00        dxlo
BFCE  08 10 08     shot hit-point X offset by SUBTYPE
BFD2  10 30 10     shot WIDTH by subtype   <- laser $30
BFD6  08 08 08     shot hit-point Y offset by subtype
BFDA  10 20 30 10  enemy box width by class   (wave 5)
BFDE  10 20 30 02  enemy box height by class  (wave 5)
BFC5  05 05 05 05 06 07 08 09 0A   the type-$9A hit threshold by rank $17
```

### 2. THREE CARRY FALL-THROUGHS in the terrain probe, and they are +1 each

`$C3AF`, the SHOT probe, is entered with the carry set by the very compare that
selected the branch:

```
C3B7  E0 06     CPX #$06      carry SET when X >= 6 (a missile)
C3B9  90 02     BCC $C3BD
C3BB  69 03     ADC #$03      <- A + 3 + CARRY = A + 4
...
C3C2  C9 01     CMP #$01      carry SET when subtype >= 1; the laser arm is
C3C4  D0 08     BNE $C3CE     taken on EQUAL, so carry is set there too
C3C6  BD 63 03  LDA $0363,X
C3C9  69 0A     ADC #$0A      <- A + $0A + CARRY = A + $0B
```

So a MISSILE probes at Y + 4 (not +3) and a LASER probes at X + $0B (not $0A).
src/collision.js's wave-5 comment said "+$0A X offset and +3 Y offset"; corrected
in this commit (rule 6).

### 3. Which cartridge paths the autofire scripts actually reach

`flowprobe.py --frames 1000 --script "200:,10:S,190:,<tail>" --poke "0044=N@390-1000"`,
exec hooks. `hook.X = total N firstGameFrame F`:

| tail | $44 | $BE93 kills | $AEC1 capsules | $C1AF pickup | $C1D6 death |
|---|---|---|---|---|---|
| 600:A | 0 | 11 @494 | 0 | 0 | 0 |
| 600:A | 1 | 18 @485 | 4 @527 | **3 @626** | 0 |
| 600:A | 2 | 15 @452 | 1 @557 | **1 @770** | 0 |
| 180:A,60:DA,360:A | 1 | 14 @485 | 3 @527 | 1 @983 | 0 |
| 600:LA | 1 | 19 @491 | 4 @534 | 2 @803 | 0 |
| 600:UA / 600:DA | 1 | 0 | 0 | 0 | 0 |
| 600:RA | 0 | 0 | 0 | 0 | 2 @493 |

and in EVERY one of those runs the unported arms stayed at zero:
`$C070` (armoured) 0, `$C06B` (the armoured clink sfx) 0, `$C099` (the type-$9A
hit counter) 0, `$C2DC` (the wall-break VRAM patch) 0, `$C044`/`$BEF3` (stage-5)
0, `$BF7D` (shot versus enemy BULLET, past the empty-slot RTS) 0, `$C13D`/`$C159`
(types $27/$29) 0, `$C18C` 0, `$A1D6` (missile killed) 0 with `$41` = 0.

Two consequences for the scenario design:

* `$C1AF`, the capsule PICKUP, is wave 7 and is a throw. Every 600-frame laser
  window reaches it, so the laser scenario has to end before its first pickup.
  `180:A,60:DA,300:A` (540 frames) drops three capsules and never picks one up.
* nothing else in this wave's reach is unported, so the scenarios can be long.

## What I did

New files:

* `games/gradius/src/weapons.js` -- `$A0E9-$A16D` (the three parameter tables,
  the A edge/held latches, the `X = $45 down to 0` loop, the frozen timers, the
  cross-reload, slot B's fall-through DEC, the missile gate), `$A16F-$A1E5` (the
  three-iteration missile loop, the terrain probe, the fly path) and
  `$A1E6-$A234` (the six-iteration shot loop, both X kill thresholds), plus the
  three spawns `$A235`/`$A250`/`$A26B`.
* `games/gradius/src/score.js` -- `$8455`-`$850F`: the four preambles that fall
  into one adder, `$84A9`'s carry-exact BCD byte add, `$8474`'s three-byte walk,
  `$84D3`'s extra life and `$84F7`'s TOP-score copy.
* `games/gradius/tests/weapons.test.js` -- 23 tests.
* `assets/weapons/tables.json` (gitignored) via `export_assets.py`, with a
  `check_weapons` family and four mutations in `verify_assets.py`.

Changed:

* `src/collision.js` -- `$BFED-$C044` (the inner sweep, with `$A9` as the real
  loop index so `$C0BB`'s `STA $A9` ends it), `$C055` (the hit resolver, the
  laser's survival, the two invulnerability branches), `$BF75`'s empty-slot RTS,
  `$C2C4`'s body and `$C3AF`'s shot probe.
* `src/enemies.js` -- `killEnemy()` (`$BE93`).
* `src/player.js` -- `$9FFC` is whole: the dead gate now jumps INTO the movement
  loops and the Option-animation loop falls through into firing.
* `src/state.js` -- `sfx` (the recorded `$EC1E` requests), `extraLife` (`$2A,X`),
  and the `$03A0` array's second meaning.
* `src/nmi.js`, `src/main.js`, `src/hud.js`, `porttrace.mjs`, `scenarios.json`
  (73 new watched addresses, five new scenarios).

Retired notes, all in this commit (rule 6): src/player.js's "firing is NOT here:
the shot slot types are opaque and were never reversed"; src/hud.js's "every one
of them is a CONSTANT across all 17 compared scenarios"; src/state.js's SEEDED
INPUTS block; src/collision.js's WHAT IS NOT HERE list and its "+$0A X offset
and +3 Y offset" (both were one too low -- see the carry note above);
src/enemies.js's two "wave 6" forward references; tests/collision.test.js's
"a live SHOT slot is a loud throw" (inverted, not deleted).

## What I MEASURED, after

### The gate

```
node --test games/gradius/tests/         222 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs
  28 scenarios, 9062 of 9062 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
  944 dying frames across 8 scenario(s); 9 of 28 carry an expectDying
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
python games/gradius/tools/verify_assets.py --self-test
  35 of 35 mutations reddened their target; 13 of 13 families seen red
node tools/build-dist.mjs
  rom-leak guard: 124 files checked against 2 ROM(s) -- clean, 1 deliberate exception
```

Before: 23 scenarios, 7047 frames, 198 unit tests, 31 asset mutations.
After: **28 scenarios, 9062 frames (+2015), 222 unit tests, 35 asset mutations.**
The whole corpus was re-recorded (`scen.py`, all 28) because the watch list grew
by 73 addresses -- object slots 3-11 across eight arrays, plus `$2A`/`$2B`.

### The five new scenarios, each 0 divergent frames over 551 compared fields

```
autofire-normal   599 frames  $44 = 0  11 kills from f494, score $0110
autofire-laser    539 frames  $44 = 1  18 kills from f485, 3 capsules from f527
autofire-double   339 frames  $44 = 2  15 kills from f452, 1 capsule at f513
autofire-die      239 frames  the right-wall death at f493 with shots in the air
autofire-missile  299 frames  $41 = 1, driven into the floor
```

### FIFTEEN DELIBERATE BREAKS AT CORPUS LEVEL

Each applied to `src/`, compared against seven scenarios (the five above plus
`right-wall` and `enemy-waves`, baseline **0 failures / 3719 frames**), then
restored from a checksummed copy.

```
[RED  309] fixed-cadence          tick the timer while the slot is occupied
                                  w_07E4@488 w_070A@490 msExpanded@422
[RED CRASH] laser-consumed        $C0AE dropped -> the kills move -> the ship
                                  walks into a capsule: "$C1AF ... is wave 7"
[RED    4] no-slotB-dec           $A159's fall-through DEC -> w_03A6@421 exactly
[RED  218] no-cross-reload        $A12A dropped        w_0123@483 w_0126@462
[RED  266] shot-dies-at-F0        subtype 0's threshold made the laser's
[RED   12] score-50               $845B's $50 for $8463's $10  w_07E4@494 AND
                                  w_0709/w_070A -- the HUD digits, two frames later
[RED   83] slotB-sub-and1         $A263 made `$44 AND 1`   (red on $44 = 2 only)
[RED   75] shot-width-from-enemy  $A3 from $BFDA instead of $BFD2
[RED   46] no-borrow-in-dy        the SBC's borrow dropped from the sweep
[RED    2] missile-spawn-clears-xf  $0389,X zeroed on spawn  w_0369@449 w_0389@449
[GREEN] missile-probe-plus3       the missile's probe at Y + 3 instead of Y + 4
[GREEN] squad-clamped             the $0048 counter clamped at 0 instead of wrapping
[GREEN] script-mask-7F            $BEBC's AND $1F made AND $7F
[GREEN] sweep-keeps-going         $C0BB's `STA $A9` dropped
[GREEN] spawn-clears-xf           $0383,X zeroed on a SHOT spawn
```

### THE FIVE THAT PASSED -- the findings, and what closed them

docs/knowledge: a deliberate break that passes is the most valuable finding of
the day. Four of the five are closed by unit tests written for them and each was
then seen red; the fifth turned out to be unfalsifiable and the CODE COMMENT
that claimed otherwise was wrong and is fixed.

1. **`missile-probe-plus3` and the laser's `+$0A`.** The collision map is 0
   everywhere the corpus reaches, so NOTHING recorded can tell Y+3 from Y+4 or
   X+$0A from X+$0B. Both offsets are +1 more than the listing reads because
   `$C3B7 CPX #$06` and `$C3BF CMP #$01` leave the CARRY SET on the very branch
   that reaches the ADC. Closed by `tests/weapons.test.js` -- the crawl-throw
   test pokes the cell the +4 probe lands in, and a new test straddles an 8-px
   column boundary at x = $55 so $0A and $0B read different cells. Both seen red.
   src/collision.js's wave-5 comment ("+$0A X offset and +3 Y offset") is fixed.
2. **`squad-clamped`.** No squadron counter in the corpus ever reaches 0 twice,
   so the underflow to 255 cannot be witnessed by any recording. Closed by the
   three-case unit test (2 -> 1 clears the carrier, 1 -> 0 makes one, 0 -> 255
   makes none), seen red.
3. **`script-mask-7F`.** `AND $1F` and `AND $7F` AGREE for every type any
   measured run has produced -- $85, $05, $9A, $1A, $87 all give the same script
   either way. The test's first five rows were green too; a sixth row, type $A5
   (LISTING-DERIVED, bit 5 set), separates them, and it is labelled as such.
4. **`sweep-keeps-going`.** No recorded frame has a consumed shot with a second
   enemy at a LOWER index inside its box. Closed by the laser test, which puts
   two enemies (indices 4 and 2) under one shot: the laser kills both, an
   ordinary shot kills only the first. Seen red.
5. **`spawn-clears-xf` IS UNFALSIFIABLE AND THE COMMENT THAT SAID OTHERWISE WAS
   WRONG.** Slots 3-8 only ever hold shots, whose X step is a whole number of
   pixels, so `$0383-$0388` is never written by anything and zeroing it at
   `$A235` can never matter. My own comment claimed "a port that zeroes it
   diverges on w_0383 the moment a missile and a shot share a slot number" --
   they never share one. Rewritten to say where the uninitialised fraction IS
   observable: `$A26B`, the MISSILE spawn, whose slots 9-11 are reused by one
   missile after another. That break (`missile-spawn-clears-xf`) is RED on
   `autofire-missile` at w_0369/w_0389@449.

### Eight further unit-level breaks, all seen red

`laser-width-from-BFDA`, `extra-life-no-threshold-bump`, `bcd-add-five` (the
`ADC #$05` written without the carry the `CMP #$0A` set -- 2 failures),
`no-shot-probe-laser-offset`, plus the four re-runs above.

### Loop shapes -- docs/knowledge/06 mechanism (C), answered NO in-wave

Every loop this wave introduces asserts its own iteration count in `src/`:
firing `$45 + 1` objects, missiles exactly 3 (`$A16F` `LDX #$08` down to 6),
shots exactly 6 (`$A1E6` `CPX #$06`), the shot-vs-enemy inner sweep exactly 10
unless `$C055` consumed the shot (which is a state transition -- the slot is
empty afterwards and w_0123 shows it -- not a work budget). The nine-iteration
outer sweep and the six-slot terrain loop were already asserted in wave 5.

## What I could not do, and why

* **The capsule PICKUP (`$C1AF`) is still a throw, and it constrained two
  scenarios.** It is wave 7. `autofire-laser` needed 60 frames of DOWN and
  `autofire-double` 40 to keep the ship out of the capsule's box; both are
  measured, and both are written into the scenario's `why`. Without them the
  windows would have had to stop at f625 and f593.
* **The armoured branch (`$C05F-$C08D`), the type-$9A hit counter (`$C099` and
  its `$BFC5[$17]` threshold), the wall-breaking VRAM patch (`$C2DC`/`$C32F`),
  the missile CRAWL (`$A19E`) and the shot-vs-enemy-bullet body (`$BF7D`) are
  loud throws.** Every one measured 0 executions in every run made here, so
  their constants are unverified; a reading is not a port.
* **`$17`, the power-up rank, is still 0 in the port** (`$9AC4 JSR $9C45` is
  wave 7). The three autofire scenarios poke `$44`, which on the CARTRIDGE makes
  `$17` = 1 -- and that is safe only because both readers test `>= 3` (`$BBE5`)
  or index `$BFC5` from an arm that never runs (`$C0A1`). `$17` is NOT watched,
  so nothing would catch it if that stopped being true. Wave 7 adds it.
* **Status 7, the gold capsule** (`$AECE`, every 16th via `$47`) is unexercised:
  the corpus's biggest capsule count is 3, and `$47` is compared (w_0047) at 1,
  2, 3. Wave 3 ported the arm; nothing has run it.
* **The sound requests are recorded, not compared.** `state.sfx` is a port-side
  list with no oracle counterpart -- probe.lua would need an exec hook on
  `$EC1E`. Held by `tests/weapons.test.js` only ($01/$02 per shot, two per
  DOUBLE volley, none for a missile, $06 for a fan kill, none for a capsule,
  $F7 on the death, $36 on an extra life). Wave 8 is what turns them into a
  compared field.
* **`$84A9`'s overflow arm** (`$849A`: three `$99`s into `$07E0-$07E2`, i.e.
  into the TOP score rather than the player's) is ported literally and is
  unreachable -- it needs a score of 999999x10. It looks like a cartridge bug;
  it is not "fixed" here.
* **Two-player.** `$A0FA LDX $18` throws if `$18 != 0`, as everywhere else.

## If someone picks this up cold

The three things that would have cost me a day if I had not measured them:

1. **`$A131` and `$A159` are FALL-THROUGHS.** Slot A's ticking timer does not
   end the object's turn -- slot B is still evaluated on the same frame, and
   that is the whole of the 21/23 alternation. Slot B's cross-reload runs INTO
   its own DEC, so its timer reads `$35 - 1` on the frame it fires and slot A's
   reads `$35`. Wave 5's QA would call these two "the same shape"; they are not.
2. **`$C3AF`'s two ADCs both take a carry the compare above them just set**, so
   the missile probes at Y + 4 and the laser at X + $0B. The corpus cannot see
   either, because stage 1 pages 0-3 hold no solid tiles.
3. **The inner sweep's loop index IS `$A9`**, and `$C055`'s free WRITES it
   (`$C0BB STA $A9`). Writing the loop with a JS counter and treating the free
   as a `break` is *almost* right and is wrong in one observable way: `$C030
   JSR $BF75` is handed `$A9` -- 0 -- and not the enemy index the iteration
   started with.

Reproduce anything here with:

```
python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear A0E0 A2C0
python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear BFCE C0C7
python games/gradius/tools/oracle/flowprobe.py --frames 1000 \
  --script "200:,10:S,190:,600:A" --poke "0044=1@390-1000" \
  --hooks C1AF,C070,C099,C2DC,C1D6,AEC1,BE93,A235,A250,A26B,BF7D
python games/gradius/tools/oracle/scen.py --only autofire-laser
node games/gradius/tools/oracle/compare.mjs --only autofire-laser
node games/gradius/tools/test-all.mjs
```
