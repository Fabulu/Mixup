# Wave 5 - Death, respawn, checkpoint: un-truncate the corpus
status: DONE
wave: 5   role: impl   started: 2026-07-31

## The task, as I understood it

Make the port able to die (enemy contact and terrain), explode, count down, respawn at
the checkpoint with power-ups wiped, and then lift `compare.mjs`'s `$0100 != 1`
truncation so the death-truncated scenarios compare to full length.

Measurement comes FIRST: the player-vs-object sweep at `$C0C7` is the least-mapped code
on the critical path. Establish route + boxes with `kill.py` / `flowprobe.py` before
writing a line.

**The plan's `doneWhen` numbers are from before waves 3-4.** The corpus is 21
scenarios / 6569 nominal frames now, not 16 / 4184. Baseline re-measured at the start
of this wave (below); the target is the same shape: **0 truncated**.

## Baseline, re-measured (not quoted)

```
node games/gradius/tools/test-all.mjs
  21 scenarios, 5726 of 6569 frames compared
  (6 truncated: right-wall@493, diag-rd-lu@533, diag-ru-ld@445, lr-both@482,
   speed6-right@515, speed3-diag@529), 0 failures, 0 clamps uncovered,
  0 stale annotations, 6 fields SKIPPED
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

843 of 6569 frames (12.8% now, 20% of the pre-wave-3 corpus) lost at the death.

## What I MEASURED, before writing a line

### 1. WHO CALLS `$C0C7` - the fall-through trap, again

`dis6502.py xref C0C7`:

```
969D  20 C7 C0  JSR $C0C7        <- the STAGE-5 half-rate arm only
C052  4C C7 C0  JMP $C0C7        <- the tail of $BFE2, the SHOT SWEEP
```

There is **no other caller**. On stage 1 the whole collision subsystem is reached as
the TAIL of `$9A70 JSR $BFE2`:

```
BFE2  LDX #$08 / STX $A8
BFE6  LDX $A8 / LDA $0123,X / BEQ $C047      nine shot slots (3..11)
C047  DEC $A8 / BPL $BFE6
C04B  LDA $5C / CMP #$02 / BCC $C052 / RTS
C052  JMP $C0C7
```

`src/nmi.js` said at `$9A70`: *"the shot-vs-enemy sweep. Not ported (wave 6). ... on the
cartridge it is ten iterations of nothing."* That is wrong twice - the outer loop is
NINE iterations, and what follows it is the entire collision subsystem including the
thing that kills the player. Corrected in this commit (rule 6).

Counts over `"200:,10:S,190:,300:R"`, 700 frames, exec hooks:

```
hook.C0C7 = total 363 firstGameFrame 310
hook.BFE2 = total 363 firstGameFrame 310
hook.C052 = total 363 firstGameFrame 310
hook.C101 = total 243 firstGameFrame 310     <- the ALIVE sweep (363 - 120 dying)
hook.C2A5 = total 362 firstGameFrame 310     <- ONE less than C0C7: $C1D6 ends
                                                `JMP $C2C4` and skips $C2A5
hook.C2B5 = total 362                        (363 - 27 respawn-intro frames = 363
hook.C2BC = total 242                         and 362 - 120 = 242)
```

363 = mode-5 frames 310..699 (390) minus the 27-frame respawn intro at 614-640.

### 2. WHICH ROUTE kills at f493, and with what boxes

Same run, hooks on all four routes into `$C1D6`:

```
hook.C16E = total 1 firstGameFrame 493       the box test PASSED
hook.C1B8 = total 1 firstGameFrame 493       type AND $7F >= 3 -> the shield arm
hook.C1BF = total 1 firstGameFrame 493       $46 == 0 -> DEATH
hook.C24B = total 0   (enemy bullets)
hook.C290 = total 0   (stage-5 blocks)
hook.C2C1 = total 0   (terrain)
hook.C1AF = total 0   (capsule pickup)
hook.C1D6 = total 1 firstGameFrame 493
```

So the route is **`$C101` -> `$C16E` -> `$C1B8` -> `$C1BF` -> `$C1D6`**: the
player-vs-ENEMY sweep with no shield. Terrain kills NOBODY in the whole corpus, which
is why the poke scenario below had to be built.

`--arghook C1D6`: `arg 493 a=00 x=00 y=09` - Y = 9, i.e. enemy index 9 = object slot 21.
`--arghook C16E`: `arg 493 a=05 x=00 y=09` - at `$C16E` A is the **dy** the CMP at
`$C131` accepted (5) and X is the box index `$0460,Y` (**0**).

The boxes, read out of the PRG at `$BFDA`/`$BFDE`:

```
BFDA  10 20 30 10     width  by $0460,Y
BFDE  10 20 30 02     height by $0460,Y
```

`$0460+0..9` is 0 on every frame of every scenario in the corpus (it is watched since
wave 3's test pass), so **every enemy in this corpus uses box 0 = 16 x 16**.

The arithmetic, from the corpus artifact (`right-wall`, which is where f493 lives):

```
f492  playerX 173 playerY 96   slot21 X 161 Y 98   ->  dx = (173+4)-161 = 16 = $10
                                                        CMP #$10 / BCS -> NO HIT
f493  playerX 174 playerY 96   slot21 X 164 Y 98   ->  dx = (174+4)-164 = 14 < $10
                                                        dy = (96+8)-98-1 = 5 < $10  HIT
```

**The `-1` in dy is real and is the carry**: `$C127 CMP $BFDA,X` leaves carry CLEAR when
it falls through, and `$C12C LDA $A1 / SBC $032C,Y` is a subtract-with-borrow. And the
box is exercised **exactly at its boundary** by this scenario - f492's dx is $10, the
first value the CMP rejects. A port with a 17-wide box dies one frame early.

### 3. The explosion walk `$C0FA`, per frame

Table read out of the PRG: `C0FA: 2D 2E 2F 30 30 00 00` (`$C101` is `A9 09`, so the
table is seven bytes and entry 5 is the terminating `$00`).

From the `right-wall` artifact, `$0120` / `$0140` / `$0160`:

```
f493  $0120 1     $0140 0     $0160 0      <- $C1D6 zeroed $0140 and $0160
f494  $0120 $2D   $0140 9     $0160 1
f504  $0120 $2E   $0140 9     $0160 2
f514  $0120 $2F   $0140 9     $0160 3
f524  $0120 $30   $0140 9     $0160 4
f534  $0120 $30   $0140 9     $0160 5      <- entry 4 is $30 AGAIN: no visible change
f544  $0120 0     $0140 255   $0160 6      <- entry 5 is 0: $0121/$0122/$0140 := 0
                                              and then $C0F4 DECs 0 to $FF
f613  $0120 0     $0140 186   $0160 6      <- 255 counting down, 69 frames later
```

`$0140` going to **255** at f544 is not a bug: `$C0F1 STA $0140` (A = 0) falls THROUGH
into `$C0F4 DEC $0140`. It is a compared field (`w_0140`) and a port that returns early
there reads 0 for the last 70 frames of every death.

`$0160` is the position-ring cursor (`ring.cursor` in the port) - the ROM reuses slot
0's animation-frame byte as the explosion cursor while the ship is dead. Safe because
`$A082`'s ring advance is inside `$9FFC`, which bails at `$0100 >= 2`.

### 4. `$C1D6` does NOT clear `$60` here

`$C1D6 LDA $1B / CMP #$81 / BCC $C1E0 / LDA #$00 / STA $60` - the store only happens for
`$1B >= $81`. Measured `w_0060`: **2 at f492, 2 at f493, 2 through the whole death**,
and 0 only at f614 when `$9B3E`'s zero-page wipe clears it. A port that cleared `$60`
unconditionally would stall the spawn engine for 120 frames.

### 5. The respawn, f614

`w_0020` (lives) 3 -> 2, `w_001B` $A0 -> 1, `w_0100` 2 -> 1, `w_000D` 0 -> 6,
`w_0048` 152 -> 0 (wiped), `w_0035` 20, playerX 174 -> 80, playerY 96,
`w_0022 = w_0024 = w_0026 = w_0028 = 0`, `w_0057` 0, `w_0055`/`w_0054`/`w_0058` 0.
`lag.dropAtGameFrame = 283 AND 614` - the respawn pays `$882C`'s dropped NMI too.

The checkpoint table from 00-recon-flow.md (`$24 = min($3F AND $0E, 8)`) is re-checked
by `tests/collision.test.js` with the recon's own three inputs (3 -> 2, 7 -> 6,
$14 -> 4), not replayed on the cartridge - `$3F` at every death in this corpus is 0.

### 6. The terrain-death poke, measured with kill.py on the scenario's OWN script

```
python games/gradius/tools/oracle/kill.py --frames 640 \
    --script "200:,10:S,190:,240:" --at 500
  mode=none  poked=[]        $C2C1: 0        $1B == $A0 first at: None
  mode=hit   poked=[0x5b3]   $C2C1: [501]    $1B == $A0 first at: 501
  mode=miss  poked=[0x5b4]   $C2C1: 0        $1B == $A0 first at: None
  at the poke frame: playerX=80 playerY=96 page=5 idx=179 shift=4
  [PASS] poking the cell $C3D3 computes makes $C2C1 (JMP $C1D6) fire
  [PASS] poking one block row lower does NOT
  [PASS] poking nothing does NOT
```

So the cell is **$05B3**, the field shift is 4, and `$10` in it is a solid cell. That
address is derived from kill.lua's INDEPENDENT re-implementation of `$C3D3` and then
confirmed by the cartridge actually dying - it is not taken from `src/terrain.js`'s
own arithmetic, which is the thing the new scenario has to falsify.

### 7. The loop shapes, measured rather than assumed (docs/knowledge/06 model C)

```
python games/gradius/tools/oracle/flowprobe.py --frames 700 \
  --script "200:,10:S,190:,300:R" --hooks BFE6,C115,C228,C2C8,C303,C0C7,C101,C20A,C2C4,C2FF
  hook.BFE6 = 3267   hook.C0C7 = 363   3267 = 363 x 9   EXACTLY 9
  hook.C115 = 2421   hook.C101 = 243   243 x 10 = 2430  -- NINE SHORT
  hook.C228 = 2420   hook.C20A = 242   242 x 10 = 2420  EXACTLY 10
  hook.C2C8 = 2178   hook.C2C4 = 363   363 x  6 = 2178  EXACTLY 6
  hook.C303 = 3630   hook.C2FF = 363   363 x 10 = 3630  EXACTLY 10
```

Every loop is fixed-shape; mechanism (C) is answered **NO** for all five. The one
short count is the whole point: `$C115` is nine iterations short over the entire run,
which is the death frame's sweep leaving on its FIRST iteration -- and `$C1D6`'s
arghook independently reported `y=09`, i.e. j = 9, the first index the loop visits.
Two derivations of the same fact.

Note `hook.C2C4 = hook.C0C7 = 363`: the shot-vs-terrain loop runs on the death frame
too, because `$C1D6` ends `JMP $C2C4` rather than with an RTS.

## What I did

New file `games/gradius/src/collision.js`, and it is the whole of `$BFE2`'s tail:
`$C0C7`, `$C101`'s player-vs-enemy sweep with the `$BFDA`/`$BFDE` boxes, `$C16E`'s
type dispatch, `$C1B8`'s spawn-frame invulnerability, `$C1D6`, `$C0CE`'s explosion
walk over `$C0FA`, `$C20A`, `$C2A5`'s stage gates, `$C2BC` -> `probeCollision` ->
`$C2C1`, `$C2C4` and `$C2FF`. `src/flow.js` gained `respawn()` (`$979D`/`$97DD`) and
`clearAhead()` (`$9C09`); `src/nmi.js` calls `shotSweep()` at `$9A70` and `respawn()`
from the dying arm.

**`probeCollision()` has a caller for the first time.** It has existed and been
unit-tested in `src/terrain.js` since before there were enemies; `$C2BC` is what
calls it.

**Two `knownFail`s that named wave 5 as their owner are retired**, both seen red on
revert:

* `$9BF0 falls through into sub_9C09` -- `introPackets()` stopped at `$9C07 INC $1B`
  and the RTS is at `$9C11`. Now a shared `clearAhead()`, which `$97EB JSR $9C09`
  calls too. It was inert until this wave, exactly as the annotation predicted.
* `an intro frame does not inherit the previous play frame's split` -- fixed in
  `src/nmi.js` rather than `introStep()`: `bandB.ran` is cleared at the top of every
  non-lag frame, so it means "did `$9AA3` fire on THIS frame" for every arm. Without
  it the six death scenarios would each report `chrOffset 8192` / `sprite0Hit 1` for
  27 respawn-intro frames; the corpus break below confirms it (`chrOffset@614`).

New asset export `assets/collision/tables.json` (`$BFDA-$BFE1`, `$C0FA-$C100`, 15
bytes, gitignored) with a `check_collision` family in `verify_assets.py` and three
mutations, all seen red.

Two new scenarios, `terrain-death` and `terrain-death-miss`, and the poke channel
extended to `$0500-$06FF` (`POKEABLE_RANGES` in `porttrace.mjs`; the Lua side already
took any address). `$0A` added to the watch list. `compare.mjs`'s `$0100 != 1`
truncation is **gone** and `$A0` is in `MODELLED_1B`.

## What I MEASURED, after

### The gate

```
node --test games/gradius/tests/         189 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs
  23 scenarios, 7047 of 7047 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 stale annotations, 6 fields SKIPPED
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
python games/gradius/tools/verify_assets.py --self-test
  31 of 31 mutations reddened their target; 12 of 12 families seen red
node tools/build-dist.mjs
  rom-leak guard: 121 files checked against 2 ROM(s) -- clean, 1 deliberate exception
```

Before: 21 scenarios, 5726 of 6569 frames, 6 truncated.
After: **23 scenarios, 7047 of 7047, 0 truncated.** +1321 compared frames, of which
843 are the frames the truncation used to throw away and 478 are the two new
scenarios.

### The death is EXERCISED, not merely compared

Port trace vs oracle, per scenario, `$1B == $A0` frames:

```
right-wall          port 121  rom 121  first@493   26 intro frames after it
terrain-death       port 121  rom 121  first@501   18
diag-ru-ld          port 121  rom 121  first@445   26
lr-both             port 121  rom 121  first@482   26
speed6-right        port 121  rom 121  first@515    4
diag-rd-lu          port 107  rom 107  first@533    0  (window ends first)
speed3-diag         port 111  rom 111  first@529    0
terrain-death-miss  port   0  rom   0  none            <- the control
idle                port   0  rom   0  none
```

823 dying frames and 100 post-death intro frames, all compared. The `$0120` values
seen while dying are `1, 45, 46, 47, 48, 0` -- i.e. `$2D $2E $2F $30` and the
terminator, the `$C0FA` walk.

### Deliberate breaks, at CORPUS level (subset: right-wall, terrain-death,
### terrain-death-miss, diag-ru-ld, intro-respawn -- baseline 0 failures)

```
[RED] no-collision-call        565 failures  right-wall:playerX@494
[RED] explosion-5-entries       18           right-wall:w_0120@535, msExpanded@535
[RED] no-DEC-lives               6           right-wall:w_0020@614 AND w_0706@616
[RED] intro-inherits-split       6           right-wall:chrOffset@614 sprite0Hit@614
[RED] probeCollision-index+1   318           terrain-death AND terrain-death-miss
[RED] countdown-121-frames     565           right-wall:playerX@614
[RED] dying-runs-tail-not-body 221           right-wall:scrollX@494
```

`no-DEC-lives` is worth reading twice: it reddens `w_0706`, a byte of the `$0700`
queue page, two frames after `w_0020`. That is wave 2's `st_88B6` lives producer
rendering a value the port COMPUTED for the first time -- the "seeded input" note in
`src/state.js` is one third retired.

`probeCollision-index+1` reddens BOTH terrain scenarios: the hit stops dying and the
MISS starts. A one-sided check would have caught only half of that.

### Deliberate breaks, at UNIT level (tests/collision.test.js)

All of these were seen red by patching `src/` and restoring:
`box-width-from-BFDE`, `box-height-from-BFDA`, `box-class-from-j+12`,
`dy-without-the-borrow`, `spawn-frame-invuln-dropped`, `clear-60-unconditionally`,
`explosion-returns-early`, `dying-gate-dropped`, `shot-slot-skipped-silently`,
`bullet-slot-skipped-silently`, `checkpoint-mask-0F`, `checkpoint-cap-before-mask`,
`save22-is-the-cursor`, `gameover-BMI-dropped`, `probeCollision-index+1`,
`respawn-keeps-options`, plus the two retired knownFails.

## THREE DELIBERATE BREAKS THAT PASSED -- the findings

docs/knowledge: *"If a deliberate break PASSES, that is your most valuable finding of
the day."* Three did, on the first pass.

1. **`box-width-from-BFDE` was GREEN.** `$BFDA[0]` and `$BFDE[0]` are the SAME byte
   (`$10`), so class 0 is 16 x 16 and swapping the two tables is invisible. Closed by
   a new test using class 3 (`$10` wide, `$02` high -- the only class where they
   differ), which is LISTING-DERIVED and labelled as such: no measured run has used
   any class but 0.
2. **`box-class-from-j+12` was GREEN.** `$0460[j]` and `$0460[j+12]` are both 0 on
   every frame of every scenario, so reading the wrong one of the two DIFFERENT bytes
   wave 3 warned about is unfalsifiable by the corpus. Closed by the same test, which
   sets the two indices to different values.
3. **`respawn-keeps-5D` is STILL GREEN and cannot be closed.** Deleting `$97E3
   STA $5D` changes nothing, because `$5D` is inside `$3D-$97` and `$9B3E`'s wipe
   clears it again four instructions later. The store is genuinely dead on this path.
   It is ported anyway and the fact that nothing can falsify it is written into
   `tests/collision.test.js` at the assertion, so the next agent does not spend the
   afternoon rediscovering it. (`$3A`, `$33` and `$1B` are BELOW `$3D` and so are
   held by that test for real.)

## What I could not do, and why

* **Game over (`$97F1`/`$96FB`) is still a named throw.** `$96FD` gates both the
  timeout and START on `$B0`, a sound-driver byte the flow recon measured oscillating
  1,5,3 for 277 frames and did not characterise. The wave plan excludes it until
  `$B0` is the port's own state (wave 8). `$979D`'s `BMI $97F1` IS ported and throws
  with that address; `tests/collision.test.js` drives it.
* **The shield arm `$C1C1` and the capsule arm `$C1AF` are throws**, not because they
  are hard but because their tails are `$BE93` (wave 6's kill chain) and `$894B`
  (wave 7). Nothing in the port can set `$46` or spawn a capsule, so neither is
  reachable today.
* **Types `$27` and `$29`** (`$C13D`, `$C159`) are throws. No measured run has spawned
  either, so what they do is listing-only and I did not port a reading.
* **Enemy bullets** (`$C20A`'s body, `$C24B`, `$C2FF`'s body) and the **stage-5
  destructible blocks** (`$C263`-`$C2A4`, `$C290`) are throws -- both excluded by the
  plan. Their LOOPS are ported and their iteration counts asserted, because those
  loops run 10 and 10 times on every frame of every measured run.
* **The checkpoint formula is not exercised by the corpus.** Every death in it happens
  at `$3F = 0`. The recon's three intervention rows are replayed in
  `tests/collision.test.js` instead; I did not re-run them on the cartridge, and that
  is the one number in this file I am quoting rather than re-measuring. It would take
  a `flowprobe.py --poke 003F=N@...` run per row to close.
* **`$5E`** (`$9C09`) has two writers and zero readers in the whole PRG; the port has
  no field for it and I did not add one.
* **`$39` and `$1C`** (`$97DD`) are not modelled: `$39` has no reader on any path this
  port takes and `$1C` is the BGM de-dupe byte (wave 8). Named at the code.

## If someone picks this up cold

The one thing to hold on to: **`$C0C7` is not called by name on stage 1.** It is the
tail of `$9A70 JSR $BFE2`, through `$C04B`/`$C052`. If you go looking for "where does
the game check collisions" by grepping the mode-5 handler you will not find it, and
`src/nmi.js` carried the wrong description of that JSR for the port's whole life.

Reproduce anything here with:

```
python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear C0C7 C310
python games/gradius/tools/dis6502.py "Gradius (USA).nes" xref C0C7
python games/gradius/tools/oracle/flowprobe.py --frames 700 \
  --script "200:,10:S,190:,300:R" --hooks C1BF,C24B,C290,C2C1,C1D6 --arghook C16E
python games/gradius/tools/oracle/kill.py --frames 640 \
  --script "200:,10:S,190:,240:" --at 500
python games/gradius/tools/oracle/scen.py
node games/gradius/tools/test-all.mjs
```

The next wave (6, weapons) inherits three things from here: the poke channel
(`POKEABLE_RANGES`), the fact that `$BFE2`'s inner sweep is the ONLY thing left
between it and `$C055`'s kill chain, and 823 newly-compared dying frames that its
shot and missile loops must keep running through (`$9FFC` jumps into `$A16F` at
`$0100 >= 2`).

