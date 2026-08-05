# 44 -- IMPLEMENTATION: mod run-scope safety, and a check that can see mods at all

status: DONE

Gate: `node games/gradius/tools/test-all.mjs` -> **GREEN, 13 passed, 0 failed,
0 SKIPPED** (the new stage is the 13th); 47 scenarios / 29,693 of 29,693 frames
compared, 0 failures; **732 unit tests**, 0 failing.

**Verdict up front, and it contradicts this wave's own brief in three places.**

1. **Not all 19 mods have the lifetime problem. ONE did.** Sixteen of the
   nineteen own no mutable state at all; two own render scratch that cannot
   reach the simulation. `heal-gradius-syndrome` is the only mod that captures
   run state, and W43 already fixed its leak. The table in section 2 is the
   audit.
2. **`rt.firstIntro` IS a defect, and the measurement that proves it is not the
   one W43 named.** W43 said "a continue does not re-grant the starting kit" and
   called it a design question. The real defect is upstream and worse: **THE
   ATTRACT DEMO WAS SPENDING IT.** A player who launched with a starting kit and
   watched the title screen for six seconds flew a bare Viper. Measured, fixed.
3. **`state.mods` really is undefined on every scenario** -- that part of the
   brief held. Re-checked by grep over `tools/oracle/*.{mjs,py,lua}`,
   `scenarios.json` and every test outside `tests/mods.test.js`: zero hits.

And one thing the brief did not ask about, which was the largest defect found:
**`loop-three` never worked at all on the default launch.** `$8424` wipes
`$28,X` on the first mode-0 frame, so the loop select was gone by frame 128 and
`$1A` was 0 on the first play frame. Same for level select, whenever the launcher
was not already forcing `title: false`.

---

## 1. WHAT WAS CHECKED BEFORE ANYTHING WAS CHANGED

The brief said to doubt it, so:

| claim | verdict | how |
|---|---|---|
| all 19 mods share the lifetime problem | **FALSE** | the inventory in sec 2: 16 own no mutable state |
| `rt.firstIntro` is a defect | **TRUE, for a different reason** | the demo eats it; measured trace in sec 3 |
| `state.mods` is undefined in every scenario | **TRUE** | `grep -rn "state.mods\|attachMods"` over tools/ and tests/ |
| the attract demo can be hung by `immortal` | **FALSE** | the demo ends at f3624 by script exhaustion (`$9CB1`), with `$20 = 1` still unspent; measured with and without the mod |

---

## 2. THE AUDIT: EVERY MUTABLE BYTE THE MOD LAYER OWNS

`state.mods` is `{ lo, rt }` and nothing else. `lo` is the resolved loadout and
is **written once, by `resolveLoadout()`, and never again** -- no hook assigns
into `lo.zp`, `lo.sim`, `lo.render` or `lo.meta`. So the entire mutable surface
of the mod layer is `rt`, plus the two cartridge save slots a loadout seeds.

| field | scope | written by | cleared / re-armed by |
|---|---|---|---|
| `rt.death` | ONE DEATH | `modRefuseDeath` (`$C1D6`) | consumed at the tail of `$9B3E`; dropped at `$97F1` (W43) **and** at `$82D5` (W44) |
| `rt.invuln` | ONE RUN | armed at the tail of `$9B3E`, decremented in `modFrameEnd` (`$80B5`) | reaches 0 on its own; forced to 0 at `$97F1` and `$82D5` (W44) |
| `rt.firstIntro` | ONE RUN | `true` at `attachMods`, `false` at the tail of the run's first `$9B3E` | back to `true` at `$82D5` (W44) |
| `rt.ghost` | SESSION | `modPostRender` only | never; it is a framebuffer, and `modPostRender` runs after `nmi()` has returned |
| `rt.discoPal` | SESSION | `modPalette` only | never; scratch, and `state.vram.pal` is not touched |
| ~~`rt.hidden`~~ | -- | **nothing** | REMOVED in W44: declared in `attachMods` and never read or written anywhere. A field with no lifetime because it had no life. |
| `state.save26[p]` | CARTRIDGE | `attachMods`, `modNewRun` (`$82D5`), and `$979D` on every death | `$8424` (mode 0) and `$8307` (every new game) wipe it |
| `state.save28[p]` | CARTRIDGE | as above | as above |

### the 19 mods against that inventory

| mod | mutable state it owns | run-scope risk |
|---|---|---|
| turbo | none (`meta`, read once by `boot()`) | none |
| bullet-time | none (`meta`) | none |
| mirror | none (`render` + a read-only input swap) | none |
| upside-down | none | none |
| full-power | none -- writes six cartridge bytes at every intro | none |
| **heal-gradius-syndrome** | **`rt.death`, `rt.invuln`** | **the only capturing mod. W43's leak; W44 widened the drop** |
| muscle-memory | none -- writes the same six bytes at every intro | none |
| immortal | none (a read-only flag) | none |
| rank-zero | none -- writes `$17` per frame | none |
| rank-max | none -- writes `$17` per frame | none |
| **loop-three** | **`$28,X`** | **erased by the cartridge's own wipes; never applied on the default launch** |
| overtime | none -- writes `$040C,X`, rotates on `state.frame` | none |
| stay-calm | none (a read-only flag) | none |
| always-on-enemies | none (`render`) | none |
| gameboy | none (`render`) | none |
| negative | none (`render`) | none |
| disco | `rt.discoPal` (render scratch) | none: cannot reach the simulation |
| afterimage | `rt.ghost` (render scratch) | none: cannot reach the simulation |
| hitboxes | none (`render`) | none |
| *the picker* (not a mod, but loadout state) | `rt.firstIntro`, `$26,X` | **two defects, both fixed here** |

**So: 1 of 19 mods could leak state into a later run, and W43 had already fixed
that one instance.** The class is real; the population is not what the brief
assumed. What the audit did find is the *other two shapes* of the same class,
which nobody had named:

* **SPENT BY A RUN THE PLAYER IS NOT FLYING** -- the attract demo.
* **ERASED BEFORE THE RUN STARTS** -- the cartridge's own new-game wipes.

---

## 3. THE TWO NEW DEFECTS, MEASURED

Driver: `resetState()` at mode 0, the port's own front end, no interventions at
all except pressing START.

### 3a. the attract demo spends the starting kit

`#shield=5&options=2`, default launch (level 0, so `title: true`):

```
after attachMods    mode=0 kit=0,0,0,0,0,0 first=true
f128  mode 0->1     kit=0,0,0,0,0,0        first=true
f385  mode 1->2     kit=0,0,0,0,0,0        first=true    THE DEMO STARTS
f3624 mode 2->0     kit=2,1,0,0,2,2        first=false   <-- SPENT
f3836 mode 4->5                                          the player's run
f3863 REAL first play frame  kit=0,0,0,0,0,0             <-- THE DEFECT
```

`$45 = 0`, `$46 = 0`. The demo's `$9B3E` ran `modAfterIntroReset`, took the
`rt.firstIntro` branch, granted the kit to the DEMO ship and set the flag false.
The player pressed START and got nothing. **This is reachable by doing nothing
except waiting**, and it is why `rt.firstIntro` is a defect and not a design
question.

The same path armed Heal Gradius Syndrome's invulnerability window for the demo
ship and would have replayed a demo death's position into the player's first
run.

### 3b. the cartridge erases the loadout before the run starts

`#mods=loop-three`, default launch:

```
after attachMods    s28=[2,0]
f128  mode 0->1     s28=[0,0]     <-- $8424, mode 0's own clear, frame < 128
f238  first play frame  $1A = 0
```

`$8424` clears `$0020-$0097` and `$8307` clears `$0012-$00EF`; `$26,X` and
`$28,X` are inside both. So the two bytes `attachMods()` seeds do not survive
mode 0, let alone a continue. **`loop-three` -- one of the three mods in the
`nightmare` preset -- did nothing at all unless the launcher happened to skip
the title screen.** Level select escaped this only because `index.html` sets
`title: false` whenever a stage is picked; it still lost the stage on every
CONTINUE.

---

## 4. THE FIXES

Three, and each is one place.

1. **`modNewRun(state)`, at the tail of `$82D5`** (`src/modes.js`, behind
   `if (state.mods)`). `$82D5` has exactly two callers and both mean "a new run
   begins": `$815F` (START on the title menu) and `$970D` (CONTINUE). It
   re-seeds `$26,X` and `$28,X`, sets `rt.firstIntro = true`, and drops
   `rt.death` and `rt.invuln`. The ONE RULE's call-site inventory goes 6 -> 7.

2. **`notPlaying(state)` -- the mod SIMULATION runs only at `$00 == 5` with
   `$09 == 0`.** Every simulation hook (`modAfterIntroReset`, `modRefuseDeath`,
   `modFrameEnd`, `modFreezeEnemies`, `modHidePlayer`) returns early otherwise.
   `$09` is the cartridge's own "this is the demo, not a game" flag, which the
   ROM already branches on in three places. The mode test is needed as well as
   `$09`: `modFrameEnd` used to run on title-screen frames too, so `rank-max`
   left `$17 = 6` behind and the demo's FIRST frame differed from vanilla (`$09`
   is still 0 there -- `$82C7` runs inside mode 2's own first phase). Found by
   the new tool, not by reading.

   The RENDER layer is deliberately not gated: it runs after `nmi()` has
   returned, cannot reach the simulation, and a Game Boy title screen is the
   point.

3. **`modAbandonRun` also clears `rt.invuln`**, and `rt.hidden` is deleted.
   Neither was a measured leak -- the window drains itself long before the
   ~400-frame game-over screen ends -- but "the run is over" should clear every
   run-scoped byte in one place, and a dead field in an inventory is how W43's
   defect hid.

**`$9721`, THE CONTINUE CHEAT, IS DELIBERATELY NOT A `modNewRun` CALLER.** It
jumps to `$97DD` without going near `$8307`, so `$19`, `$26,X` and `$28,X` still
hold the run's own values: nothing session-scoped was lost, so there is nothing
to restore, and re-seeding `$26,X` there would drag a player who died on stage 5
back to whatever stage the picker named. It is a mid-run restart, not a start.

---

## 5. THE CHECK THAT CAN SEE MODS: `tools/oracle/modscope.mjs`

The highest-value thing in this wave. Before it, **nothing in the repo drove the
port with a loadout for more than a handful of frames.** It is stage 1b5 of
`test-all.mjs`, runs in ~90 s, and needs no ROM and no emulator.

For **all 19 mods, all 4 presets, and a picker-only launch (24 loadouts)** it
drives the session a player actually has:

```
mode 0/1  title            mode 2  THE ATTRACT DEMO, in full     <- D
START ->  RUN 1 first play frame                                 <- B1
          four deaths (the port's own $C101/$C2C1 sweeps, unaided)
$97F1     GAME OVER                                              <- B2
$970D     CONTINUE -> RUN 2 first play frame                     <- B3
```

and asserts, at each:

* **D** -- the attract demo's SIMULATION is byte-identical to the unmodded
  port's. A per-frame SHA-256 of the whole state object (walked generically, not
  from a field list, so a field added tomorrow is covered), chained over every
  demo frame, compared against one vanilla chain. And `rt.firstIntro` is still
  unspent.
* **B1 / B3** -- `$19` is the stage the loadout chose, `$1A` is its loop, the six
  power-up bytes are its kit, and `$20,X` is 3. Derived from the resolved
  loadout, so a new mod is covered the day it is added.
* **B2** -- `rt.death` and `rt.invuln` are gone.
* **B3** -- `$3F`/`$55` equal the UNMODDED port's own values there (0/1), not
  the page the previous run died on.

### what it proves, and what it does not

* It proves **nothing about the cartridge**, and says so on its last line. Mods
  are behaviour this repo added; `compare.mjs` is the ROM gate and this tool
  cannot reach it -- every state it builds attaches a loadout deliberately, and
  THE ONE RULE is unchanged and re-asserted by four tests.
* It does **not** prove a mod is fun, or that its effect is correct. It proves
  the effect the loadout declared is present at the start of every run and that
  nothing from a dead run is.
* **Nothing was dropped for convenience.** All 19 mods and all 4 presets run.
  Two loadouts (`immortal`, `preset:sightseeing`) refuse `$C1D6` forever, so the
  driver reaches their game over by calling `$979D` with `$20,X = 0` -- the
  routine `$96EF`'s countdown calls -- and **prints that it did**, per loadout,
  rather than skipping the boundary.
* The COVERAGE and WITNESS lines print on every run whether or not anything
  failed.

### the instrument was broken first, and it said so

The first version killed the ship on its first play frame, so **every captured
death was at `$3F = 0`** -- and replaying page 0 into a new run writes the value
that was already there. **It reported GREEN with W43's fix removed.** That is
this project's own failure shape, found inside the tool written to prevent it.
The driver now waits for the camera, and a `WITNESS:` line fails the run if no
`respawnInPlace` loadout ever dies on a page a fresh run does not start on.

---

## 6. SEEN TO FAIL

### the tool, on every run

Four neuters, each patching a THROWAWAY COPY of `src/` under the OS temp dir
(the mechanism `stagesweep.mjs` uses for the `$A2F0` guard). Each needle must
appear exactly once, no neuter may touch `assets.js`, `src/` is hashed before
and after, and **each neuter declares WHICH assertion it must trip** -- red for
the wrong reason is a failure, because `test-all.mjs`'s own self-check stage was
once wrong in exactly that way.

```
RED (good)  no-abandon        2/24 -- B2 game over: rt.death survived ({"x":80,"y":96,"camHi":1})
RED (good)  no-newrun        24/24 -- B1 run 1: $19 = 0, the loadout chose stage 2
RED (good)  mods-outside-play 24/24 -- D: the attract demo's simulation diverged from vanilla
RED (good)  stale-death-replayed 24/24 -- B3 run 2: $3F = 1 / $55 = 2 on the first play
                                          frame of a NEW GAME; the unmodded port has 0/1
```

**The fourth neuter exists because the first three could not produce the owner's
symptom.** `modNewRun()` clears `rt.death` as well, so removing only W43's line
leaves the replay unreachable -- measured by injecting `rt.death = {camHi: 1}`
onto the game-over screen and watching run 2 come back at `$3F = 0` anyway.
Defence in depth is good; a check that cannot fail is not.

### the unit tests, by hand

Five new tests in `tests/mods.test.js` (732 total). Each mutation, and what went
red:

```
$82D5 does not call modNewRun     -> not ok 23  a new game re-seeds the level, the loop and the kit
                                     not ok 24  ...so a CONTINUE gives back what the player chose
notPlaying() returns false        -> not ok 22  the mod simulation does not run outside a real run
$97F1 does not call modAbandonRun -> not ok 20  a game over abandons the death position (W43)
restored                          -> 48/48
```

**SAID OUT LOUD:** W43's second test (`...so CONTINUE starts stage 1 at page 0`)
can **no longer be made red by removing W43's fix alone**, because `modNewRun`
now clears `rt.death` too. It is double-defended, which is good for the player
and bad for that one test's evidentiary value. The `stale-death-replayed`
neuter is what covers the combined case, and it is in the gate.

---

## 7. NOT DONE, AND SAID OUT LOUD

* **The render scratch (`rt.ghost`, `rt.discoPal`) is session-scoped on
  purpose.** An Afterimage smear that survives a game over is cosmetic and, if
  anything, wanted. It cannot reach the simulation: `modPostRender` and
  `modPalette` run after `nmi()` has returned and `state.vram.pal` is never
  written. Named so nobody has to rediscover that it is deliberate.
* **The 4 presets are checked as loadouts, not as compositions.** `modscope`
  proves each preset's run-scope contract holds; it does not prove the three
  mods inside it interact the way a player would want. `conflicts` is the
  existing mechanism for that and it is unit-tested.
* **`modscope` drives stage 3 only** (the picker's `stage: 2`). A leak that only
  exists on, say, the stage-6 boss's exit would not be seen. The boundaries it
  checks are stage-independent by construction, but that is an argument, not a
  measurement.
* **No two-player session is driven.** `playerIndex()` refuses player 2 and
  `attachMods` seeds slot `p` only; a real `$0A = 7` game is outside every gate
  in this repo, not just this one.
* **The port-vs-cartridge baseline was not weakened to make any of this
  possible.** `compare.mjs` ran unchanged: 47 scenarios, 29,693 of 29,693
  frames, 0 failures, with `state.mods` undefined throughout.

---

## 8. FILES

* `games/gradius/src/mods.js` -- THE SECOND RULE in the header; `PLAY_MODE`;
  `notPlaying()`; `modNewRun()`; `seedSaveSlots()`; `rt.invuln` dropped at
  `$97F1`; `rt.hidden` removed; the `rt` inventory carries lifetimes now
* `games/gradius/src/modes.js` -- the `modNewRun` call at the tail of `$82D5`
* `games/gradius/tools/oracle/modscope.mjs` -- NEW. 24 loadouts, four
  boundaries, four self-proving neuters
* `games/gradius/tools/test-all.mjs` -- stage 1b5
* `games/gradius/tests/mods.test.js` -- five new tests, all seen red

status: DONE
