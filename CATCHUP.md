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

**BOTH LANDED before this file was finished. Updated results:**

**W98, the boss body art. DONE, and the boss is VISIBLE.** A navy and cyan
battleship filling the top third, twin barrels, two side pods with circular
turrets, firing pink ringed bullets. Photographed in Chrome, cropped at the
records' own coordinates. Records without art went **4,071 to 64**, and 30 of
those 64 are the null stream. All new art deferred; boot grew 1.0 KiB.

Two corrections worth carrying: **"the boss's art is 58 streams" was a CENSUS
figure, not an inventory** - its ROM tables hold **244**, and 58 is merely what
a 559 frame life indexes. Same shape as the walk-order trap. And **two tables
inside those windows are not art at all**, which is the exact trap that produced
186 art-less records a week earlier, caught before export this time.

**W100, the owner's four play reports.** The replayed HUD is REMOVED, so the
upper left is now empty and honest. The always-on flame is **confirmed as the
invulnerability aura**, and removing the poke makes the player mortal, so it is
an OWNER DECISION and was not taken. **Thrusters: nothing is missing**, the
owner's suspicion was wrong. The laser bomb's translucency is **unresolved**:
three candidates killed, the fourth needs MAME.

**W99, the static inventory. DONE, and it is the most valuable single document
about the boss.** See section 8.

**`$29540C` was scoped and NOT taken**, correctly. It is 21 entry points and
~701 instructions, not a fold-in, and **it would not have restored the red gate
anyway** because it belongs to a different script than the one blocking. The
owner mandated it believing otherwise; that mandate is now superseded by
measurement and needs re-putting to them.

## 7a. UPDATE -- session 2026-08-06 evening: W101-W104 + a publish landed

Four waves and a publish went out after section 7 was written. All committed,
pushed, and LIVE. The live site is current. A returning session should read
this section, then section 8, then start the queue at the bottom.

**W101, boot the page at any ladder rung. DONE.** The page and
`webgate --rung N` boot from any of the 72 checkpoint rungs on any ladder, so a
wave photographs the boss in ~300 steps instead of an 8,500-frame walk. LOCAL
DEV ONLY: the ladder is board-memory dumps (ROM-derived), gitignored under
`tools/oracle/out/` and never bundled; the published page keeps its single
seed. The verbatim leak guard does NOT catch RAM dumps, so the structural
INCLUDE-list exclusion in `build-dist.mjs` is the real defence. The seed is
128 KiB work RAM and nothing else (BG and regs are separate Game inputs).
Provenance (SEEDED / INVULNERABLE) is printed on screen and in every capture:
a seeded page proves CODE, never a ROUTE.

**W102, a static coverage SYSTEM. DONE.** `games/ddpdoj/tools/bosscoverage.py`
is a config block on a general M68K walker (line 86: "Generalize by adding a
config block; the walker below it is general"). It reproduces W99 exactly and
has a gate with two red conditions wired into `pgm.py check`: (a) coverage
regression, (b) inventory regression (the oracle ran something the enumerator
never listed -- this is how the tool validates itself). The join found zero
ported-but-unexercised scripts and zero enumerator holes. Port-side dispatch
instrumentation was added to `scheduler.js` (dump via `seedcmp
--dump-dispatched`). To cover the rest of the game, add a config block per
subsystem; non-stride-8 tables need the walker extended (flag the hole
honestly, never fake).

**W103, the boss F 2/F 3 wave. DONE.** Ported all 44 live-unported scheduler
entries W99 listed, plus the two accessors (`$2599B4`, `$259B08`) and the
type-`$1E` spawn closure. bosscoverage went 59 -> 103 ported, 0 unported. The
`$29540C` throw is gone. `$29540C` was just F 3, one of the 44; the old
"port `$29540C` to clear the gate" mandate is moot (its closure was only 21 of
the 44).

**W104, the boss's remaining sprite emitters. DONE.** Ported `$23E36A` and
`$23E45A` (refactored into a shared `emitScaled`). The boss fight now runs
clean from rung 8500 to ~lf19533 (essentially stage 1's end); the only
remaining throw is `$229DF8`, a 2 KB ROM data window the exporter has not
exported, reached at the stage-1 tail -- a data-export fix, not boss logic.

**Publish. DONE, GREEN.** Build `20260806192552`, live at gbtman.pages.dev.
Batman 27/27, all gates green, deploy confirmed (3/3 polls). Ships the boss
art (W98), the HUD removal (W100) and the complete boss fight.

**NEW PROCESS RULE (owner): every wave snapshots its result from a rung, not
from boot.** Seeded snapshots prove "it draws / runs," not "a player reaches
it"; label which kind of evidence each is.

**Queue (next session, in order):**
1. Whole-game static coverage pass -- point `bosscoverage` at the HUD, items,
   medals and every other stage-1 subsystem. The yellow 500-pt medals and the
   real HUD are KNOWN-missing (owner play reports; "medal" appears nowhere in
   the port) and are ground-truth targets the tool MUST flag, or it has a hole.
   Surface every other unknown.
2. Port the yellow 500-pt medals (recon first).
3. Port the real HUD (score / chain / combo).
4. Publish.
Then sound, then lag, then a MAME replay as the capstone.

**The hourly cron was session-only and is gone on restart.** Recreate it:
recurring at :17, fires only when idle, does nothing if a wave or publish is
already running, otherwise verifies the last wave and dispatches the next.

**Launch directory.** This session was launched from `C:\programmieren\GLMInst`
(an unrelated Go repo), which forced a `cd` into batman on every command and
caused repeated mistakes. Launch the next session FROM batman. The launcher is
`C:\programmieren\GLMInst\glm-temp.ps1` (sets the GLM endpoint env vars and
runs `claude`; reads its key via `$PSScriptRoot`, so it is location-independent).
From a `C:\programmieren\GLMInst>` prompt:

    cd C:\programmieren\batman; & C:\programmieren\GLMInst\glm-temp.ps1 --dangerously-skip-permissions

## 7b. UPDATE -- session 2026-08-06 late: boss explosion live, three recons, input plan

**W107 boss death explosion. DONE + LIVE (build `20260806204157`).** Owner report:
the killed boss froze-then-vanished, no explosion. Recon 106 traced it to the
boss's OWN death burst (D-script 6 `$293E04`) calling `note()` placeholders
instead of the already-shipped `spawnEffect`/`runEffectDriver` (pool B, W54).
W107 ported every emitter (`$2938AE` table bursts, `$293F8C` timer-C, `$28B4BE`
big burst, part scripts), fixed a stale `BOSS_NOTED` comment, added `$242B3C` to
rng.js. Must-fail: pool-B live on the death frame 0 -> 8 (table `$294154`).
Gates 1211/0/0, bosscoverage 103/0/8. SEEDED check (death at ~lf19533 is past
the capture ladder); owner live-play is the real proof. Boss-specific art kinds
`$03/$04/$07/$10/$87` unconfirmed at the death frame -- broken-and-declared if a
stream is missing.

**W105 whole-game static coverage recon. DONE.** PREMISE CORRECTED: "point
bosscoverage at the HUD/medals" is a category error; stage 1 has THREE dispatch
mechanisms (boss scheduler; top-level object driver `$240F62`; type-5 call
list). The medal IS the bee (pool A, type-5 call #4 `$27F95A`, kind 1/16
`$27FACC`, base ladder `$27FD22`, award `base x hits` via `$286128`, not the
chain) -- ported 0. The HUD STATE is ported + frame-exact; its 28 DRAW routines
from `$28444E` are not. Sweep: 6/20 object types ported (RANK type 10 unported,
runs first every frame); 16/23 type-5 calls ported.

**W106 boss-death + bomb-translucency recon. DONE.** Bomb: the port has NO
translucency anywhere (PGM hardware has no blender; canvas alpha:false);
"translucent" is the sparse artwork, plausibly right but UNVERIFIED vs board (no
MAME laser-bomb capture). Needs a ~132-frame MAME run to confirm pixel-for-pixel.

**W108 proximity-damage recon. DONE.** No per-hit point-blank multiplier in DOJ
(absence-proof over 16 shot handlers, ~38 shot-table refs, 101 HP-debit sites).
Point-blank kills faster by overlap-count + piercing, which the port already
reproduces. Nothing to port.

**04 INPUT-SYSTEM plan. DONE + owner-approved.** Shared `shared/input.js` across
all three games; gamepad + touch + KEYBOARD UNIFIED IN ONE PASS (owner);
feed-never-replace adapters; normalized 4-dir booleans + a1/a2/a3 + start/select;
Standard gamepad mapping + 0.28 deadzone + octant gate; fixed 8-way D-pad kept +
floating stick (Auto default for DOJ/Gradius, left-half zone); per-game picker.
Owner decisions in the doc section 11. Headless gates cannot regress (DOM input
isolated); risk is live play + the input unit suites (red-validate each).

**Queue (next, in order):**
1. Shared input layer Wave A (W109): DONE. shared/input.js + DaiOuJou keyboard/gamepad/touch/picker + the build line. Wave B (Gradius + Batman) is next but HELD for owner live-verify of the shared module before touching the complete games.
2. Wave B: Gradius (queue invariant preserved) + Batman (launch-Enter guard preserved) + their input test suites.
3. Yellow medals / bees (`$27F95A` driver, 20-kind table, base ladder, `$286128` award).
4. Real HUD (the 28 draw routines from `$28444E`).
5. Publish.
6. Stage 1 feature-complete -> 5 parallel recons + 1 architect (own model, NOT Fable) plan the next phase -> carry on (owner forward directive).

## 7c. UPDATE -- session 2026-08-07: bees + DOJ input + HUD score digits all LIVE

Stage-1 content shipped and live this session (all published, deploy confirmed 3/3):
- **W111 bees / yellow medals** (live `20260806222827`). Pool-A driver `$27F95A`, body `$27FACC`, flat + chain-multiply award via `$286128` (no chain tick); x2 + cursor ratchet shipped after the `$81293C` no-miss flag was identified; rank gauge REFUSED. Bees drop from the ten type-`$8A` carriers in stage 1. Block-3 collision cap fixed (`idx<70` -> `idx<80`) so bees in slots 70-79 are collectable.
- **W109 shared input layer (DaiOuJou)** (live `20260806213338`). `shared/input.js`: keyboard + gamepad (Standard mapping) + touch (fixed 8-way D-pad + floating stick), keyboard unified, CTRL picker. Wave B (Gradius + Batman) HELD for owner live-verify before touching the complete games.
- **HUD**: W113 sprite frames (live `20260806231854`: panel box, chain bar, banner panels, hyper flash into bucket 25); W115 score digits (live `20260806233817`: the score NUMBER). PREMISE BREAK (W114 MAME): the digits flush through `$185DC4` (IRQ6, already in `machine.js` isr6Gated), NOT `$240DC2`; a `TxVram` model was added and `wantTx` flipped on. W116 (other text: lives/bombs/credits/chain-high-water/labels via `$240DC2`/`$141258`) IN FLIGHT.

Recons W110 (bee port plan), W112 (HUD draw plan), W114 (MAME score-digit, the `$185DC4` premise break) all DONE + committed.

Queue: W116 other text -> chain/combo (Wave D') -> deferred popup `$2855B6` / item-row `$2857B4` (need `$24157A`/`$242AC6`) -> stage-1 FEATURE COMPLETE -> 5 parallel recons + 1 architect (own model, NOT Fable) plan the next phase -> carry on (owner forward directive). Wave B input (Gradius + Batman) held for owner verify.

Owner play-reports still OPEN: the boss-explosion art (`$03/$04/$07/$10/$87` unconfirmed at the death frame -- blank if a stream is missing); the laser-bomb translucency (no translucency anywhere in the port; the sparse artwork is unverified vs board -- needs a MAME laser-bomb capture); and live-verify of the DOJ input feel (unlocks Wave B).

## 8. WHAT THE STATIC INVENTORY FOUND (`99-recon-boss-static-inventory.md`)

**Read this file before touching the boss.** It replaces every earlier size
estimate.

The boss has **111 entry points across five tables, verified CLOSED** against
the ROM rather than estimated. **59 ported, 44 live-unported**, at 937
instructions plus a spawn closure, roughly 1,160 total. **All 44 hang off two
scripts, F 2 and F 3, so the remainder is ONE wave-shaped unit.** The old
figures of 2,173 instructions and 39 entry points are superseded.

**The find that justifies the whole approach: EIGHT entry points are DEAD.**
Four have no start site anywhere in build B, and two of those are the kind-9
guns, so **bullet kind 9 can never fire**. That contradicts recon 48 and every
brief since, including the heartbeat's standing text. A later script still
computes 9-or-10 into a register before a subsequent instruction discards it,
which is exactly the vestigial code that reads as live until traced.

**Dynamic discovery is structurally incapable of finding that.** You cannot
observe the absence of a call site by running the game.

Two premise corrections: the OBJECT list is walked by a different tail than
believed, and one script spawns a **second object**, so the boss is not strictly
one object. And a reusable lesson: earlier reference graphs missed three scripts
because they are entered by **jump tail-calls rather than calls**.

Left unsettled and honestly named: indirect calls through a register,
register-computed RAM writes, and the stage-end release.

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
