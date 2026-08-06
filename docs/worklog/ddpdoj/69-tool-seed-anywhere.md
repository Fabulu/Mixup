# 69 - TOOL: CHECKPOINTS THROUGH STAGE 1, AND SEEDING THE PORT FROM ANY OF THEM

status: **DONE** -- a comparison can now start at any rung of a 250-frame ladder
spanning the whole of stage 1, built from ONE 13-minute cartridge run and
consumed with no emulator (10.3 s for 71 segments). Reproduced wave 4's
`fly-around` result through the new path to the byte and to the digest. Deep:
**0 SEEDBAD at 72 board states from lf2,000 to lf19,500**, the port's reach ends
at **lf8,250**, seven distinct unported boss addresses enumerated, and the first
non-shot field to move at depth is `irq6` at **lf8,227** - the board's slowdown.
Found: four corpus scenarios hold a button the port cannot process; `$296DD6`
is documented "unreachable" and is not; `stage1-shot`'s window disagrees with
its own description by 731 frames; and **my own red check could not fail and was
caught doing it**. Gate unweakened (`flyaround` 0 divergent, 934 unit tests).

started: 2026-08-05
role: TOOLING (scope: `games/ddpdoj/tools/` and the oracle harness ONLY;
`games/ddpdoj/src/` belongs to T1 this wave and is NOT touched;
`games/gradius/` READ ONLY; `docs/worklog/ddpdoj/68-*` left alone)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

**THE OWNER:** *"We need to oracle through the whole stages. Ideally with saved
states so we don't have to run everything fully all the time."*

`[M]` = measured by me this session.

---

## 0. THE BRIEF'S PREMISE, CHECKED

The brief says seed-anywhere is *"the capability Gradius has and this game does
not"*. **That is wrong, and it is worth being precise about why, because the
wrong half is the expensive half.**

Checked before writing any code:

- `games/ddpdoj/src/ram.js` - the port **keeps the board's own RAM layout**.
  Its header says so: *"here, seeding is a memcpy and 'player Y' is `$8103E8`
  on both sides"*. Gradius had to build an installer (`seedFromCartridge`);
  this port needs none.
- `frame.lua` has had `PROBE_RAMDUMP="lf:path"` since wave 4 - the whole
  128 KiB of main RAM at the sample point of one logic frame.
- `tools/portdiff.mjs` already takes `--seed-lf N` and starts the port there.
  **Every port gate in this game already begins mid-stage**: `fly-around` seeds
  at lf2000, `stage1-shot` at lf3716.
- `pgm.py seedstate` already takes a **MAME savestate** at the game's own sample
  point and resumes from it (wave 1).

So a port comparison starting at frame N is not missing. What is missing is
cheapness and reach, and those are the owner's actual complaint:

| the brief says | actually |
|---|---|
| the port cannot start at frame N | it has only ever started at frame N |
| we need savestates | we need **many seeds from ONE run**, which is not the same thing |
| - | `PROBE_RAMDUMP` takes **exactly one** logic frame per run, so a seed at frame N costs a full MAME run to N |
| - | no seed anywhere in this repo is later than **lf3716**; the stage is **19,217** frames long |

**Restating the task in the terms that make it cheap:** the expensive thing is
the MAME run, not the port. So take ONE long cartridge run over the whole stage
and harvest a checkpoint every K frames plus the per-frame reference trace; then
every later comparison is pure JavaScript over a file that already exists, and
no wave has to boot MAME again to look at frame 12,000.

---

## 1. WHAT WAS BUILT

| file | what |
|---|---|
| `games/ddpdoj/tools/oracle/frame.lua` | `PROBE_CKPT` + `PROBE_CKPT_AT` - **many** checkpoints per run, at the game's own sample point |
| `games/ddpdoj/tools/oracle/pgm.py` | `ckpt` command + `expand_repeat` (a stage-length input script that fits in an environment block) |
| `games/ddpdoj/tools/oracle/scenarios.json` | `stage1-sweep` and its control `stage1-sweep-natural` |
| `games/ddpdoj/tools/portdiff.mjs` | `untilLf` and `bgSeed` options, both undefined for every pre-existing caller |
| `games/ddpdoj/tools/seedcmp.mjs` | **THE SEGMENT SWEEP** - compares each segment independently, re-seeded from the board |

A checkpoint is main RAM (131,072 B) + `$900000` (4,096 B) + the six IGS023
registers. All of it lives under `tools/oracle/out/`, which is gitignored -
`git check-ignore` confirmed before the first run.

### The cost inversion, which is the whole design

```
[M] MAME, -video none -nothrottle, with PORTIN + WATCH + RAWDUMP + EXEC
    and a checkpoint every 250 frames:            15.3 logic frames / wall s
[M] the port, seeded, comparing 94 columns:      162.6 logic frames / wall s
```

So the emulator is **10.6x** the cost of the thing it is oracling, and it used
to be paid again for every question. One `pgm.py ckpt` run leaves a ladder; every
later comparison is `node seedcmp.mjs` over files that already exist.

### The cadence is 250 logic frames, and here is why

Space does not decide it (79 rungs = 10.2 MB against the 158 MB already in
`out/`). **Bisection and attribution** decide it. Segments are compared
INDEPENDENTLY, each re-seeded from the board at its lower rung, so a divergence
in segment 7 does not paint segments 8..79 red - the report is *which parts of
the stage diverge* rather than *everything after the first bug*. 250 frames is
~4.2 s of game time and takes the port ~1.5 s. Coarser blurs attribution; finer
re-seeds away the very drift being hunted.

---

## 2. THE CORRECTNESS CHECK, BEFORE ANY NEW CLAIM

The brief asks for a known result reproduced through the new mechanism first.
Two independent reproductions, both on `fly-around` (9 rungs, lf2000..4000):

**(a) The dumpers agree byte for byte.** `pgm.py ckpt fly-around --verify` asks
the SAME run for a wave-4 `PROBE_RAMDUMP` at lf2000 and for a wave-69 ladder
rung there:

```
[M] VERIFY wave-4 PROBE_RAMDUMP  lf2000  sha256=f5fb3cfd87483da2...701f3256
[M] VERIFY wave-69 ladder rung   lf2000  sha256=f5fb3cfd87483da2...701f3256
    IDENTICAL
```

**(b) The comparison agrees to the digest.** `portdiff.mjs` on the same trace,
once from the wave-4 seed and once from the ladder rung:

```
[M] RESULT 0 DIVERGENT FRAMES on 94 columns over 2200 logic frames
[M] DIGEST 021f24feace38e3f7bfad42223784deca81b457f6263204a057288338c4f8aef
    -- both times
```

That is wave 4's own result (`04-impl-skeleton-and-player.md`: fly-around, seed
lf2000, 2,200 compared). The brief remembered it as *"0 of 88 columns"*; the
corpus has grown to **94** since, and the number is re-measured here rather than
quoted.

**(c) And then the thing wave 4 could not do.** The same ladder swept as eight
independent 250-frame segments:

```
[M] SEGMENTS 8: 8 green, 0 red, 0 blocked, 0 SEEDBAD, 0 error
    2,000 logic frames compared, 12.3 s
```

`0 SEEDBAD` is the load-bearing number. `portdiff.mjs` refuses to proceed if the
port's state at the seed frame already disagrees with the board on any compared
column. Seven of those eight rungs (lf2250, 2500, 2750, 3000, 3250, 3500, 3750,
4000) are frames **nothing in this repo had ever seeded at**, and the port's
seeded state agrees with the board on all 94 columns at every one of them.

---

## 3. EVERY CHECK SEEN TO FAIL

```
[M] node seedcmp.mjs --break clamp-first
    RED OK: mutation 'clamp-first' turned 8 of 8 segments non-green, as it must
    first fields: b5@lf2089, then ptc/ptilt/pst/pf1/anima1/animb0@lf2321,
    px/paccx/o0x/o1x@lf2348, scroll/b016/b038/d16e/d172/d174@lf2441
[M] removing the mutation restores all 8 segment digests IDENTICALLY
```

The mutation is applied from OUTSIDE the port through `breakage.mjs`'s named
switch - no source file is edited, so "restore and verify byte-identical" is
proved by the digests rather than by a hash of a file I put back. This also
respects the wave's split: `games/ddpdoj/src/` belongs to T1 and I did not
write to it.

### THE SEED'S BG RING IS CAPTURED AND IS **NOT** LOAD-BEARING - measured, not assumed

`seedcmp --no-bg` drops `$900000` from the seed entirely:

```
[M] SEGMENTS 8: 8 green, 0 red, 0 blocked, 0 seedbad, 0 error
```

So the 4 KiB tilemap ring makes **no difference to any of the 94 compared
columns**. It is the exact structural analogue of the PPU nametable that
Gradius's wave 10 found missing from ITS seed, and it is now captured - but on
THIS column set it is dead weight, and saying so is the point. It matters to the
PICTURE, and the picture is not in this comparison. `--no-bg` exists so that
claim stays falsifiable when the compared set grows.

---

## 4. THE FINDING THAT CHANGED THE WAVE: FOUR CORPUS SCENARIOS HOLD A BUTTON THE PORT CANNOT PROCESS

The first deep ladder, `stage1-sweep`, holds **Button 3** from lf1890 - because
`stage1-open`, `stage1-deep` and `overrun` all do, so it looked like the
corpus's own idiom for "the ship is firing". Seeding the port at its lf4000
rung:

```
[M] SEED   lf=4000  0 logic frames compared
[M] BLOCKED at lf4001 by the named throw $2497AA -- 0 frames compared before it
```

`src/player.js` `bombAndShotGuards`: `$2497AA tst.b $80380F / beq $2497FE` then
`$2497B2 btst #6,($18,A6)`. Mirror bit 6 **is** Button 3 - the AUTO-SHOT - and
`$80380F` is `$01` on this cartridge (it is in the port's own FROZEN globals
list as *"operator setting gating the `$2497AA` bomb/hyper block"*). So the
unported `$2497BA` block is entered on the **first frame** Button 3 is held.

**Four scenarios in `scenarios.json` hold Button 3 and the port cannot run a
single frame of any of them.** Nobody had noticed, and the reason is exactly the
kind of gap this project keeps finding: all four are BOARD-ONLY scenarios - the
determinism gate, the load meter, the overrun injector - that had never been
handed to the port at all. The two scenarios the port IS driven from
(`fly-around`, `stage1-shot`) press Button 3 never and Button 1 in taps.

That is a tooling defect this wave caused and then found, and the fix is a
scenario the port can follow: `stage1-play` - single-frame taps of **Button 1**
on top of a sustained stick, every 40 logic frames, for the whole stage.

---

## 5. PER-SEGMENT COVERAGE: WHAT HAS EVER BEEN COMPARED AGAINST THE BOARD

Measured by reading every corpus file in `tools/oracle/out/` and every gate that
consumes one - not from any document.

### The FULL state vector (all 94 CLAIMED columns, frame by frame)

| window | scenario | how |
|---|---|---|
| lf2001..4200 | `fly-around` | `portdiff.mjs`, 2,200 frames, 0 divergent |
| lf4448..4572 | `stage1-shot` | `shotgate`, 125 frames |
| **everything else in stage 1** | - | **NEVER** |

Stage 1 is 19,217 logic frames. The full-state comparison covers **2,325 of
them, 12.1 %**, and all of it is in the first quarter.

### Narrower field sets against deeper board corpora

These are real comparisons and it would be wrong to call the deep stage
uncompared without them - but each compares a few fields, not the state vector:

| corpus | deepest lf | what compares against it |
|---|---|---|
| `w17-stage1-invuln.tsv` | 16,133 | the W17 stage ledger |
| `w23-stats-stage1.tsv` | 15,999 | `w23statsgate` - spawn-time fields **per record**, with the rank/stage globals re-seeded from the board's own line each time |
| `w20map-whole.tsv` | 10,996 | `w20mapgate` - the scroll/column map |
| `w20-turret-play.tsv` | 6,000 | `w20turretgate` - turret angle |
| `w21-bullets-play.tsv` | 6,000 | `w21patterngate` - bullet kinds |
| `w26-premidboss.tsv` | 4,959 | `w26movergate` |
| `w25-handler-stage1.tsv` | 5,199 | `w25handlergate` |
| `w24-mover-stage1.tsv` | 2,327 | `w24movegate` |

### And the number that most needed checking

The shipped web bundle (`rip/web/capture.json`) is `scenario fly-around,
frames 161, seedLf 2000` - a **161-frame** board reference, lf2000..2160.

`midbossgate`, `w61itemgate`, `w62stageendgate`, `w63hudgate`, `w64bombgate`,
`w65beamgate` and W47's **6,185-frame** run all construct their `Game` from
`bundle.cap.frames[0]` - i.e. **they seed at lf2000 and run the PORT FORWARD
ALONE.** They assert against the LISTING, not against the board. That is a
legitimate and valuable kind of check; it is not an oracle comparison, and the
figures those gates produce for the midboss, items, the stage end, the bomb and
the beam have **never been diffed against the cartridge frame by frame**.

**So the brief's premise about the measurement window is right even though its
premise about the mechanism was wrong.** Every full-state figure this project
holds was measured over lf2001..4200, and the owner's reported degradation
begins at ~lf3800-4200 - at the far edge of it.

---

## 6. A SECOND THING THE MECHANISM FOUND ON ITS WAY PAST - `stage1-shot`'s WINDOW

Before the deep ladder finished I re-seeded the port at the three seed files
wave 8 left in `out/w8/`, against wave 8's own trace. This costs no emulator
time at all, which is the point of the whole wave.

```
[M] seed lf4447 -> 125 frames, RESULT 0 DIVERGENT on 72 columns        (green)
[M] seed lf3716 -> 856 frames, RESULT 7 of 72 columns diverged
                   HITEX $245044 fired 0 times -- the usual excuse does NOT apply
                   SPRQ CONTAINMENT: 727 of 3,073 records MISSING, first lf3743
                   first fields: s14x s21y s21x shot1 shot2 @lf3743, s14y s14v @lf3763
[M] seed lf2000 -> 2,572 frames, RESULT 13 of 72 columns diverged
                   HITEX fired 314 times on 208 frames, first at lf2023
                   (so THIS one really is explained: the board took the
                    unported hit path)
```

`scenarios.json`'s `stage1-shot` has `"seed": 4447`, giving **125** compared
frames. Its own `why` field still describes the window as *"lf3717..4572 ...
lf3716, giving 856 compared frames, MEASURED"*. **The scenario's data and its
description disagree by 731 frames**, and at the seed its description names the
gate is red on seven shot columns with the hit path never taken. Recorded here
as a measurement; `src/` belongs to T1 this wave and I have not touched it.

---

## 7. THE FIRST WHOLE-STAGE LADDER, AND WHAT A FAITHFUL SEED COSTS

```
[M] pgm.py ckpt stage1-sweep --verify
    LADDER 72 of 72 rungs taken in 1196 s (16.4 logic frames per wall second)
    rungs lf2000..19,500 every 250 frames, 0 missing
    VERIFY lf2000 sha256=3d521775c461de26... IDENTICAL to wave 4's dumper
```

Twenty minutes of emulator, once, for a ladder that spans the whole of stage 1.
The ladder is 72 x 135,168 B = **9.3 MB**, all under gitignored `out/`.

### WHAT A FAITHFUL SEED COSTS HERE - the answer, with its evidence

`seedcmp` over all 71 segments of that ladder:

```
[M] SEGMENTS 71 -- 0 SEEDBAD
```

**`SEEDBAD` is the seed-fidelity test and it is not a soft one.** `portdiff.mjs`
builds the port from the checkpoint and compares its state vector against the
board's row for that same logic frame BEFORE stepping anything; any compared
column that already disagrees is `SEEDBAD` and the segment is not evidence about
the port. Zero, at **72 distinct board states spanning lf2000 to lf19,500** - the
last of them deep inside the boss.

So, concretely, on this game a faithful seed costs:

| the brief asked about | answer |
|---|---|
| RNG state | **free** - `$2433AE` is not a generator, its entire state is the word at `$803916` (`src/rng.js`), which is main RAM |
| deferred queues | **free** - `$240F08`'s deferred write list lives at `CAM.deferHead`/`deferCursor`, main RAM |
| pool cursors | **free** - the object table is `$80E240`, main RAM |
| the scheduler's channel records | **free** - main RAM |
| `$80390C`-style semaphores | **free** - `$80390C` is main RAM and is printed on every `CKPT` line so that this is a number, not a claim |
| the `$803940` vblank ARM semaphore | **one line of code, already there.** It is the ONE byte a naive dump gets wrong: `frame.lua` reads RAM from inside the arm's own write tap, so the dump holds the PRE-arm `0` (`sem=00` on every CKPT line, measured). `src/main.js` restores it to 1 and says why. That is the whole of the "what is NOT captured" list for the compared set |
| `$900000`, the BG tilemap ring | **4,096 B, now captured** - genuinely not main RAM. And **measured not to matter** to any compared column (`--no-bg` is green). It matters to the picture |
| the IGS027A latch at `$500000` | **not captured, and named.** `src/protsim.js` is 32 write-then-read slots; nothing in this corpus carries a slot across a frame boundary. Only the listing can prove that, and this file does not claim it |
| the ICS2115 / Z80 sound state | **not captured, and named.** No ported subsystem reads it |
| MAME's own scheduler / DRC state | **not captured, and out of scope.** A checkpoint reseeds the PORT; it cannot resume the EMULATOR. `PROBE_SAVEAT`/`PROBE_LOAD` are the other thing, and they already existed (wave 1) |

**That is the answer to "is a savestate the right mechanism": no, and it was
already not the mechanism.** A MAME savestate resumes MAME. What makes a
comparison cheap here is a dump the PORT can start from, and because
`src/ram.js` kept the board's layout, that dump is a memcpy.

### And the auto-shot ladder's own verdict, which is a result

```
[M] SEGMENTS 71: 0 green, 0 red, 71 BLOCKED, 0 seedbad
    69 segments BLOCKED at $2497AA  (lf2000..19,000)
     2 segments BLOCKED at $2943B0  (lf19,000 and lf19,250)
```

Every segment blocks on its first frame - Button 3, §4. The two deepest blocks
on a DIFFERENT address are worth keeping: from lf19,000 the port reaches
**`$2943B0`** before the Button-3 gate, which is the boss's own unported code,
and no wave had put the port there.

---

## 8. THE DEEP RUN - WHAT IS PAST FRAME 6,185

`stage1-play`: the whole stage, Button 1 tapped every 40 frames on a sustained
stick, invulnerability poked on both sides. **LABEL: an intervention run. These
are STATES, not a picture of the game, and a seeded segment validates the CODE
from its rung, never the route to it.**

### THE PORT'S REACH ENDS AT lf8,250, AND THE WALL IS THE BOSS

Seeding at successive rungs and running to the end of the trace:

```
[M] rung lf7000  -> 6,382+ frames compared, no block
[M] rung lf7250  -> no block
[M] rung lf7500  -> no block
[M] rung lf7750  -> no block
[M] rung lf8000  -> no block
[M] rung lf8250  -> BLOCKED at lf8251, named throw $294FA6
[M] rung lf8500  -> BLOCKED at lf8501, named throw $295120
[M] rung lf8750  -> BLOCKED at lf8751, named throw $295120
[M] rung lf9000  -> BLOCKED at lf9001, named throw $296DD6
```

Three distinct unported addresses, all the stage-1 boss. Stage 1 is 7,317 logic
frames to the boss lock, so this is the boss arriving and the port stopping at
it - **loudly and by address, which is what this project's named throws are
for.**

### `$296DD6` WAS DOCUMENTED AS UNREACHABLE, AND IT IS NOT

`src/handlers.js` (W36):

> *type `$1E` at `$2963C2`/`$2963F4`/`$29642C`/`$29645E`, inside the boss -
> handler **`$296DD6`, unreachable while `$292902` is unported.***

The port reaches it, at lf9,001. **The comment is right about a port running
from boot and wrong as an absolute** - and the distinction is exactly the one
`docs/knowledge/09` insists on. Seeding from the board hands the port a live
type-`$1E` object it could never have spawned for itself, and the "unreachable"
path runs immediately. This is the seeding caveat working in the useful
direction: a seeded run finds code a self-driven run cannot.

### THE FIRST DIVERGENT FIELD AT DEPTH IS SLOWDOWN, NOT ARITHMETIC

Seeded at lf7000, comparing 6,382+ frames (lf7001..13,382+):

```
[M] DIVERGE shot1/shot2  first at lf7006     the shot records
[M] DIVERGE s14y s14x s14v s21y s21x  lf7043
[M] DIVERGE s14t s21t    first at lf7723
[M] DIVERGE vf, irq6     first at lf8227  port=1 board=2
[M] DIVERGE b19 b15 b5   first at lf13945     the sprite buckets
[M] HITEX $245044 fired 156 times on 88 frames, FIRST AT lf7001
```

`irq6 port=1 board=2` at **lf8,227** is the board spending TWO video frames on
one logic frame - **slowdown**, which `portdiff.mjs` already says the port's
budget cannot predict. It is the first non-shot field to move, and it is the
deepest such measurement this project has: nothing before this wave compared
`irq6` past lf4,200.

The shot columns move from the first tap onward, and `HITEX` fires on the very
first compared frame, so **the shot columns in this window are not evidence**
(wave 8's own rule): the board is taking the unported shot-vs-enemy damage
branch and the port cannot.

### THE WHOLE-STAGE SEGMENT SWEEP

```
[M] pgm.py ckpt stage1-play --verify
    LADDER 72 of 72 rungs in 749 s (26.2 logic frames per wall second)
    VERIFY lf2000 sha256=a826674f5b58fec5... IDENTICAL to wave 4's dumper

[M] node tools/seedcmp.mjs --manifest .../stage1-play/manifest.json     (10.3 s)
    SEGMENTS 71: 1 green, 25 red, 45 BLOCKED, 0 SEEDBAD, 0 error
                 6,250 logic frames compared
    of the red: 24 have DIVERGENT COLUMNS; 1 is red ONLY because the board took
                an unported branch
    the single GREEN segment is lf4447..4500 -- which is `stage1-shot`'s own
    seed frame, arrived at independently
```

**SEVEN DISTINCT UNPORTED ROM ADDRESSES, reached from board states and counted:**

| address | segments blocked on it |
|---|---|
| `$295304` | 17 |
| `$2956F6` | 11 |
| `$295120` | 9 |
| `$295432` | 3 |
| `$2937AE` | 2 (lf19,000 and lf19,250) |
| `$296DD6` | 2 |
| `$294FA6` | 1 |

That is a coverage list for the stage-1 boss that no previous wave could
produce, because producing it needs the port to START inside the boss fight.
It is presence, not absence: only the listing can say these are all of them.

---

## 9. MY OWN RED CHECK COULD NOT FAIL, AND IT WAS CAUGHT BY RUNNING IT

`seedcmp --break` originally passed when *"70 of 71 segments"* were non-green
under the mutation - on a ladder where **70 of 71 were already non-green
without it**. The mutation had changed the verdict of ZERO segments.

```
[M] before the fix: green BEFORE mutation [4447], green AFTER mutation [4447],
    segments whose verdict CHANGED: 0        ... and the check printed RED OK
```

The check compared against *"all green"* instead of against the baseline, so it
was **incapable of failing on any ladder whose segments are mostly blocked -
i.e. on every deep ladder**, which is the only kind this wave builds. It is now
DIFFERENTIAL: it runs the unmutated baseline and requires the mutation to move
at least one segment (a changed verdict, an earlier first divergence, or more
divergent columns).

```
[M] fly-around                              moved 8 of 8 segments,   exit 0
[M] stage1-play                             moved 25 of 71 segments, exit 0
    (the other 46 are BLOCKED on frame one, where no port mutation can show,
     and the report says so rather than counting them)
[M] stage1-play --from 12000 --to 15000     changed NOTHING -> FAIL, exit 1
    (blocked segments only -- THE CHECK SEEN TO FAIL)
```

**And `clamp-first` is invisible on the one green segment.** 53 frames is not
long enough for the ship to reach a wall, and the wall is the only place the
clamp order can show (wave 4 measured that). A 250-frame segment is the right
size for attribution and the wrong size for that particular mutation; both facts
are now printed rather than one of them being assumed.

---

## 10. THE CONTROL: WHERE A SCRIPTED PLAYER ACTUALLY GETS TO

`stage1-sweep-natural` - the same tap script, **no poke**, 8,000 frames.

```
[M] objlive == 0 (the whole 20-slot object table gone) at lf3,722 and lf3,926
[M] from lf3,800 to lf8,000 the run sits at objlive 1, sprites 32
    (the poked twin holds objlive 8 and 55-132 sprites over the same frames)
[M] BUILD required=B frames_on_required=7301 -- the machine is fine; the GAME
    is over
```

**A scripted player on this input reaches lf3,722 of 19,217 - 19.4 % of stage 1
- and then plays no more of it.** Everything past that in this project, in this
wave and in every wave before it, is reachable only by intervention. That is the
label the coverage table needed and it is now a measured frame number instead of
an impression.

It also puts the owner's report in its place: the degradation begins at
~lf3,800-4,200, which is *just past where an unaided scripted run dies* and
*just past where the entire measured corpus ends*.

---

## 11. COVERAGE, AFTER THIS WAVE

Full 94-column state-vector comparison against the cartridge, per segment of
stage 1 (`stage1-play` ladder, 250-frame rungs):

| range | segments | verdict | note |
|---|---|---|---|
| lf2,000..4,447 | 10 | **RED** | shot records diverge from the first tap (lf2016); `HITEX` fires, so wave 8's rule says the shot columns here are not evidence |
| lf4,447..4,500 | 1 | **GREEN** | the only green segment; it is `stage1-shot`'s own seed frame, found independently |
| lf4,500..8,250 | 14 | **RED** | 13 with divergent columns; `vf`/`irq6` join at **lf8,227** - the board's slowdown, which the port's budget cannot predict |
| lf8,250..19,500 | 45 | **BLOCKED** | the boss. 7 distinct unported addresses |
| lf19,500..19,600 | - | **NEVER COMPARED** | past the last rung |
| stages 2-5 | - | **NEVER COMPARED, NEVER TRACED** | |

Before this wave the same table read: lf2,001..4,200 compared, everything else
never. **6,250 logic frames of stage 1 are now compared against the board where
2,325 were before**, and the 45 blocked segments are a *measured* statement
about where the port stops rather than an absence of data.

What is still true and must not be rounded off:
* `midbossgate`, `w61itemgate`, `w62stageendgate`, `w63hudgate`, `w64bombgate`,
  `w65beamgate` and the 6,185-frame figure remain **port-vs-listing**. They seed
  at lf2000 from a 161-frame capture and run the port alone. This wave did not
  change that; it measured it.
* Every deep number here comes from an **invulnerable** run. States, not a
  picture of the game.

---

## 12. WHAT DID NOT CHANGE

* `games/ddpdoj/src/` - **not written to.** T1 owns it this wave.
* `games/gradius/` - read only (`09-DECIDED-seed-anywhere.md`,
  `10-impl-seed-anywhere.md`, `stagepoke.py`, `stagecmp.mjs`).
* `docs/worklog/ddpdoj/68-*` - not touched.
* The wave-4 gate: `pgm.py flyaround --reuse` still prints
  **`RESULT 0 DIVERGENT FRAMES on 88 columns over 2200 logic frames`**. (88, not
  94: the wave-4 trace requests fewer columns than the wave-69 ladder does. Both
  numbers are real and neither is the other.)
* `node --test games/ddpdoj/tests/` - **934 pass, 0 fail, 0 skipped.**
* Nothing ROM-derived is committed: every ladder is under
  `games/ddpdoj/tools/oracle/out/`, which `git check-ignore` was asked about
  before the first run.

---

## 13. HOW TO USE IT

```
# ONCE per scenario, ~13-20 minutes of MAME:
python games/ddpdoj/tools/oracle/pgm.py ckpt stage1-play --verify

# then, as often as you like, with NO emulator (~10 s for a whole stage):
node games/ddpdoj/tools/seedcmp.mjs --manifest <out>/w69/stage1-play/manifest.json
node games/ddpdoj/tools/seedcmp.mjs --manifest ... --segment 8000     # one rung
node games/ddpdoj/tools/seedcmp.mjs --manifest ... --from 8000 --to 9000
node games/ddpdoj/tools/seedcmp.mjs --manifest ... --break clamp-first
node games/ddpdoj/tools/seedcmp.mjs --manifest ... --no-bg            # falsify the BG seed
```

`pgm.py check` runs the sweep over every ladder on disk and **skips, counted,
with the command to fix it**, when there are none. Gradius's poke harness went
unused for three waves because it was named after one stage; nothing here names
a stage - `ckpt` takes any scenario, `seedcmp` takes any manifest, and the
cadence is a flag.
