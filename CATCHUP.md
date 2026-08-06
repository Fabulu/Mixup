# CATCHUP - what changed while you were away

**You are resuming a project you last touched around DaiOuJou W26/W27 and
Gradius W28/W29, on 2026-08-04, when a weekly limit cut you off.**

It is now **2026-08-06** and the project is at **DaiOuJou W100** and **Gradius
W45**. That is roughly seventy waves on one game and sixteen on the other.

**Read `HANDOVER.md` for the things that have NOT changed**: what the project
is, the method, the three games, every path, every command, the emulators, the
platform gotchas. This file is only the delta. Do not re-read the old worklogs
to catch up; read this, then the files it names.

---

## 0. THE FIVE THINGS THAT WOULD MOST MISLEAD YOU

Your mental model is stale in five specific ways. Each cost a wave when someone
acted on the old version.

1. **DaiOuJou is not "enemies and bullets on a capture" any more.** The recorded
   enemies are gone. Enemies draw, move, fire, take damage, die and explode from
   ported code. **The stage 1 boss arrives and fights.** What remains of the
   recording is 800 palette words and the HUD text.
2. **The oracle went from comparing ONE logic frame to 13,084.** When you left,
   every figure this project held came from the first ~6,000 frames of a 19,217
   frame stage. There is now a checkpoint ladder system that re-seeds the port
   from board RAM at 250 frame intervals with no emulator in the loop.
3. **"How big is this job" has been wrong three times in a row, for one
   structural reason.** See section 3. If you size a wave from a count of what
   threw, you will be wrong again.
4. **Gradius is finished as a port** and now has a mod system, a start screen and
   its own 13 stage gate. It is not "stage 2 in progress".
5. **The owner plays the live build and reports defects that no gate can see.**
   Six separate visual defects this week were found by them, not by us. Take
   their play reports as primary evidence.

---

## 1. WHERE EACH GAME ACTUALLY IS

### DaiOuJou (was W26/W27, now W100)

**Live and playable** at `https://gbtman.pages.dev/games/ddpdoj/`, build
`20260806125448`.

Fly, shoot, laser, bomb, laser bomb. Powerups drop and collect. Midboss dies.
Fighters, helicopters, mechs and turrets draw, move, fire, die and explode.
Laser impacts spark at the beam tip. Gold terrain is whole. The bomb is orange.
Stage 1 runs to its end at logic frame 19,217.

**The boss arrives, descends, hands off and fights for 559 frames** before an
honest throw at `$29540C`, which is F script 3's INIT. Porting that is
**mandated** (`97-OWNER-boss-over-gate.md`).

```
[M] 1,200 unit tests, 0 fail
[M] pgm.py check       71 passed / 3 failed   <- 3 is an OWNER DECISION, see 97
[M] seedcmp ladder     15 green / 27 red / 29 blocked / 13,084 frames
[M] bucket 2           54,280 records compared, 0 missing
[M] palette            1,760 of 2,560 words cartridge-sourced
[M] webgate            GREEN, 30 stages
[M] publish --dry      GREEN, six deliberate verbatim art exceptions
```

Since you left, in rough order: sprite emission, the display list keystone, the
laser, the bomb, the laser bomb, items, the HUD state, the stage ending, the
midboss, the seed-anywhere ladder, the auto shot, five enemy types made visible,
their art, the fighter's death, the black terrain, the laser impact, the
palette in three waves, and the boss in five.

### Gradius (was W28/W29, now W45)

**All seven stages play, the game ends and loops.** Not "stage 2 in progress".

```
[M] 733 unit tests, 0 fail
[M] gate               GREEN, 13 stages, 0 skipped
[M] wave records       598 of 598 spawn a ported handler, all seven stages
[M] $AE1C dispatch     41 of 42 entries
[M] play sub-states    16 of 16     game modes 7 of 7
```

**20 mods** in three categories with four presets, on its own start screen with
level select and a starting power up picker. Two of them are the owner's
specific asks: `heal-gradius-syndrome` (respawn in place, ship flies in from the
left blinking and invulnerable) and `hard-won` (keep your loadout through
death). `always-on-enemies` lifts the sprite per scanline cap without removing
deliberate flicker.

**The one thing to know about the mods**: every oracle scenario runs with mods
disabled by construction, so **all 20 have zero cartridge coverage**. W44 built
`modscope.mjs` as the first check that can see them at all: 32 loadouts through
demo, run, four deaths, game over and continue.

### Batman

Unchanged. Complete, 27/27 gate stages, 740 tests, bit exact.

---

## 2. THE TOOL THAT CHANGED EVERYTHING, AND HOW TO USE IT

`games/ddpdoj/tools/seedcmp.mjs` plus `pgm.py ckpt`. **This did not exist when
you left.**

A cartridge run does ~23 logic frames per wall second, so reaching lf19,000
costs ~14 minutes of MAME **every time**. `ckpt` pays that once and leaves a
ladder of checkpoints every 250 frames (128 KiB RAM, the `$900000` ring, IGS023
registers). `seedcmp` then re-seeds the port from the board's own state at each
rung and compares only to the next rung, **with no emulator in the loop**.

```sh
node games/ddpdoj/tools/seedcmp.mjs \
  --manifest games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet
```

**Why per segment rather than one long run:** after the port and board disagree
once, every later frame is blast radius rather than evidence. Re-seeding asks a
different and much better question: given the board's own state at frame N, does
the port reproduce N+1 to N+250, separately for every rung.

**What a green segment does NOT mean:** that the port can REACH that state by
playing. Seeding inverts the usual trap. A seeded result is labelled as one,
always.

Four ladders exist: `fly-around`, `stage1-play`, `stage1-sweep`,
`stage1-laser-hold`.

---

## 3. THE TRAP THAT WILL BITE YOU FIRST

**A census of what threw measures WALK ORDER, not remaining work.**
(`83-NOTE-censored-census-and-the-sim-server.md`.)

The boss's dispatcher walks its lists in a fixed order. An unported entry in an
early list throws **before** anything behind it is reached. So counting how many
segments name an address feels like sizing a job and is not.

It has produced a wrong estimate three times:

| briefed | actual |
|---|---|
| "six addresses" | 39 unported entry points, 80 routines, 2,173 instructions |
| "twelve entry points" | seventeen script ids live in a 250 frame window |
| "all 15 arrival rungs" | 8 |

**How to size instead:** take the seeded state at the rung and enumerate the
entry points the frame actually needs, then subtract what is ported. And
**derive the ported set from `registerScript`**, never a hand list, which is why
"39 unported" went stale in four days.

**This is why the owner asked for a static coverage system** (see section 7).

---

## 4. THE STANDING COUNTS, ALL MOVED

Quote these at their current values; every one of them is higher than when you
left, and each represents real cost.

- **Orchestrator briefs that rested on something false: 47.** Three of mine
  about the boss alone. Tell every agent to check its brief's premise; it is not
  a formality and it has paid off in nearly every wave.
- **Comments in this codebase that lied: 11.** A palette file said nothing
  writes palette RAM directly and something does. An exporter comment dismissed
  186 descriptors as "only look like stream starts" and they were art the board
  draws. A note said a painter was unported when it had shipped five waves
  earlier with a gate asserting it.
- **"Verified" has a shelf life: 7 instances.** The worst: a diagnostic's list of
  42 missing addresses had ALL shipped across four waves with nobody
  re-measuring, and my brief cited it.
- **Agents finding one of their OWN checks unable to fail: 12 in four days**,
  each self-reported and each correct. One found a hole in the mutation harness
  itself. **Expect this and ask for it.**
- **Fall-through incidents: at least thirty**, recorded as a floor because the
  running ordinal forked when two games ran in parallel.

---

## 5. OWNER DECISIONS SINCE YOU LEFT (binding)

- **`39-OWNER`'s bar still governs**: stage 1 until FEATURE COMPLETE **and**
  ORACLE-CLEAN. A wave must say which it delivered. Several waves met one and
  said so plainly; that is the expected behaviour, not a failure.
- **`97-OWNER-boss-over-gate.md`**: keep the boss, carry one red gate on purpose.
  **Then, within the hour, the owner mandated porting `$29540C` to clear it.**
  The red is a debt, not a new normal.
- **A sixth `PUBLISH_VERBATIM` entry was approved** for the fighter's colour
  shard. A seventh is an OWNER DECISION: write it up and stop.
- **No em dashes anywhere.** Asked twice. 10,467 were swept out of this repo.
  Applies to your output, commits, worklogs, comments and site copy.
- **The recorded HUD is to be removed** until the real one draws, on the same
  reasoning as the recorded enemies: a screen that looks right while sourced
  from a recording is the worst outcome.

---

## 6. PROCESS THAT CHANGED

- **The index gets poisoned.** Commit through a private index in ONE shell call;
  shell env does not persist between calls. A spurious staged DELETION of a live
  agent's worklog appeared once. **Never `git add -A`. Never `git checkout --`.**
- **Commit AND push.** Three agents committed without pushing and it was only
  caught by checking. Finish with `git status -sb` level with origin.
- **Watch line endings.** Three consecutive waves had a Python rewrite flip files
  between CRLF and LF. Check `git diff --stat` for whole file rewrites.
- **`pgm.py check` means `games/ddpdoj/tools/oracle/pgm.py`.** There is another
  `pgm.py` and **it exits 0 silently**. Never run two instances concurrently; it
  produces a spurious extra failure.
- **Read a gate file's own header before classifying its red.** Some carry a
  board column and some are port versus listing. That distinction decided an
  owner question this week, and getting it wrong in either direction produces
  the wrong action.
- **Do not pipe a long run through `tail`.** I did this three times and read
  `tail`'s exit code as the command's, then truncated a gate run and treated the
  fragment as complete. Redirect to a file and grep it.
- **Most `[FAIL]` lines in a `pgm.py check` log are EXPECTED**: they are the
  assertions inside mutation stages, where a broken port must fail for the stage
  to pass. Only the stage level verdict counts.

---

## 7. WHAT IS RUNNING AND WHAT IS NEXT

**In flight as this was written** (both may have landed by the time you read
it; check `git log`):

- **W98, boss body art.** The boss runs and nothing draws: 4,071 records with no
  art over 75 streams. This is an export job. It also carries four owner play
  reports folded in: a translucent laser bomb, an always-on flame, missing
  thrusters, and removing the recorded HUD, plus the mandated `$29540C`.
- **W99, a static inventory of the boss** (a `fable` model agent, read only).
  Enumerate every boss entry point from the ROM rather than discovering them one
  throw at a time.

**Then `100-PLAN-static-coverage-system.md`**, which is the owner's idea and the
most valuable thing on the list. Two of the three games already have a coverage
tool (`audit_coverage.py` for Batman, `census.py` and `tablecoverage.py` for
Gradius, the latter already a gate stage). **DaiOuJou has none**, which is
exactly why its boss is discovered by execution.

The system is the **join**, in both directions:
- **static minus dynamic** = code that exists and has never executed. All 39
  bullet behaviours were transcribed long ago and **only one has ever run**.
- **dynamic minus static** = a defect in the enumerator itself, which is how the
  tool gets validated rather than trusted.

**Do not build it before W99 is read.**

**After that**: the hyper (four linked pieces, with a rank multiplier that must
be scoped to hyper-active frames only, since it can corrupt scoring silently);
the bees (a carrier driver that yields no bee, plus a cover sprite the owner
believes is missing); the last 800 palette words; 4,017 records still without
art; stage 2's column stream. Then sound, then lag.

**Lag has a new asset you do not know about.** The MiSTer FPGA PGM core is
cloned at `C:\programmieren\pgm-mister`, outside the repo. It ships a Verilator
simulator with a JSON control server, giving a third oracle that runs locally.
**Using it carries no licence obligation**; copying its code into this MIT tree
does. Two caveats are recorded: it used MAME as a reference so they are not
independent witnesses, and the ARM7 internal ROM is recreated in both, so on
protection they may share one reconstruction.
