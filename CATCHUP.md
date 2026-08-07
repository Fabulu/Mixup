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

## 7d. UPDATE -- 2026-08-07: stage-1 FEATURE-COMPLETE + live; strategic plan W119; Phase 0 BLOCKED at the usage limit

**Stage 1 is FEATURE-COMPLETE and live** (build `20260807010426`): full gameplay plus the
whole HUD -- W113 sprite frames, W115 score digits (via `$185DC4`), W116 other text (via
`$240DC2`/`$141258`), W118 chain-break popup (the combo) + item row. Bees (W111), boss
explosion (W107), shared DOJ input (W109) all live.

**Strategic round done -> plan in W119** (`docs/worklog/ddpdoj/119-strategic-plan.md`,
5 recons + architect, committed `2531d27`). Six premise corrections, notably: boss-explosion
art is NOT missing (166/166 streams; W107 fixed the emitters); the slowdown gate is `$803940`
(the vblank semaphore), not `$81308C`. Plan order: Phase 0 (correctness recons: RANK type-10
`$260794` vs score.js inline rank; + the 20 per-type sub-handler budget loops, open since W2)
-> Phase 1 (MAME capture for boss-verify + bomb translucency; Wave B input Gradius+Batman,
held for owner live-verify of the DOJ module) -> Phase 2 (result screen `$28D9AA`, removes
the two declared deviations) -> sound, lag/slowdown, replay, stage 2.

**BLOCKED: the two Phase 0 recons FAILED at the 5-hour usage limit** (429; resets
2026-08-07 10:23:01). RANK got most of the way (partial worklog `120-recon-rank-type10.md`,
committed -- resume from there; it had the full recompute, was finalizing the verdict on
whether score.js substitutes for the rank object). Sub-handler was early (no worklog yet).
Re-dispatch BOTH after the reset. Tree clean; W118 green (1268/0/0, bosscoverage 103/0/8).
The hourly idle cron was DELETED for the block (it cannot dispatch under the limit and reads
the stale 7a queue) -- recreate it next session per 7a. Wave B input (task 9) still held for
owner live-verify of the DOJ module.

## 7e. UPDATE -- 2026-08-07: Phase 0 verdicts -- RANK diverges (substantive fix), sub-handler CLEAN

Phase 0 (the strategic plan's correctness guard) is complete:
- **0a RANK type-10: DIVERGENCE.** Rank (dynamic difficulty) is FROZEN at seed, never
  computed (object type 10 `$260794`/`$2608D2` not in the port's dispatch; 0 source writes to
  the rank output `$81309E` or its clock `$8130C6`). Stage-1 SCORING (points/chain/combo) is
  CORRECT -- those machines never read rank. The frozen rank affects ENEMY BULLET DENSITY (the
  `$2650BC/CC` selector at thresholds `$C0`/`$E0`): a playing run diverges in difficulty, not
  score. MASKED in the corpus (seedcmp re-seeds `$81309E` every 250 frames, so the green ladder
  is not proof of correctness). Fix: port the gauge/stock pipeline (`$287682` -> `$2530CA` ->
  `$285A62`) FIRST, then object type 10 -- else the recompute unmasks the inert upstream errors
  (frozen -> wrong-and-rising). Zero risk to the frame-exact chain (separate dispatch entry;
  the recompute reads no chain/score state). This is a substantive multi-wave port (recon 71
  sec 4.2's chain), NOT the quick fix the plan assumed.
- **0b sub-handler budget: CLEAN.** All 8 stride-based per-slot sub-tables are
  unbounded/correct -- no truncation under a 60,000-nop overrun inject (MAME-measured, mirrors
  W2). `src/budget.js NEVER_TRIGGERS` stands for the sub-handlers too. No fix.

Net: the foundation is mostly solid (object ordering + scoring correct). The one open
correctness item is the RANK/difficulty subsystem -- a substantive port, scheduled (not
urgent: difficulty not scoring; masked in verification). Next per W119: Phase 1 (MAME capture
for boss-death verify + bomb translucency, IN FLIGHT; Wave B input Gradius+Batman owner-gated)
-> Phase 2 (result screen `$28D9AA`) -> Phase 3/4 (stage-2 data, replay) -> Phase 5 (sound,
slowdown). The RANK fix slots in as its own subsystem port.

## 7f. UPDATE -- 2026-08-07: Phase 1a MAME capture -- both play-reports RESOLVED (port correct)

Phase 1a (batched MAME capture, W122) done; both owner play-reports closed in the port's favor:
- **Boss death: CORRECT, no defect.** Premise correction: under passive-laser hold the boss is
  never HP0-killed (HP drains ~44/frame and times out at `$294F32`), and the BOARD shows the same
  stasis at timeout (~100 boss-body entries, zero effects at lf19500-19555). A forced HP0 death
  (poke `$813752=-1`) makes BOTH the board and the port explode (pool-B burst: 5/19/15 entries
  lf18100-18300, boss freed by lf18500). The port wires every death emitter (W107; 166/166 streams;
  must-fail green). So "stasis, no explosion" was the pre-W107 placeholder bug (fixed) COMBINED
  with the passive-laser-timeout path (correct -- to SEE the explosion the boss must be HP0-killed,
  e.g. point-blank, not parked under the laser until timeout).
- **Laser bomb: PIXEL-FAITHFUL.** The board's bomb is ~30 fully opaque palette-indexed beam
  segments (no alpha; PGM has no blender). The port transcribes the same `$2561AA` 41-segment beam
  (W66 `draw23FF06` fix), `alpha:false` canvas, byte-exact display list. Recon 106's 4th candidate
  pixel-verified: the "translucent" look is genuinely sparse opaque art. No blender needed.
- **Coverage gap (not a defect):** the seeded oracle blocks past ~lf2700 in the bomb/boss scenario
  on `$27FE0E` (an unported pool-A kind-2 body) and `$2629AE` (an unported element updater). Live
  play doesn't hit them (different input path). Surfaced for a future coverage wave.

Next: Phase 2a (result-screen recon `$28D9AA`, IN FLIGHT) -> Phase 2b impl (completes stage 1
honestly, removes the two declared deviations). Phase 1b (Wave B input Gradius+Batman) still
owner-gated.

## 7g. UPDATE -- 2026-08-07: Phase 2a result-screen recon (W123) -> plan; R2a logic IN FLIGHT

Phase 2a done. Decisive: `$28D9AA` is a clean 8-phase FSM on `$81DEC0` (A6 = `$81DEBE` = W62's
`SE.result`), NOT a separate object with indirect pointers -- W119's biggest risk resolved. Two
score machines (F6 bee/item tick `$286128` + HUD tally `$285400`) coordinate via the `$8130F9`
bit 1/2/3 handshake. Deviations confirmed: DEV-1 = `$285496` (sole producer, inside tally
`$285400`); DEV-2 = `$28DE6C` (inside F8, fed by `$24652A`). Stuck slot freed by `$28EAD4`
(banner teardown, sole clearer in build B). Score callees all ported (`$28614A`/`$286154`/
`$286626`/`$286128` in score.js; `bcd242AC6`).

Smallest port = 2 waves: **R2a LOGIC** (~750 instr: phase machine + tally `$285400`/`$28556C` +
anim chain `$24652A`/`$24681A`/`$246800` + banner state machine `$28E7F8`; clears DEV-1/DEV-2,
awards the score, frees the slot; headlessly testable from the seed) IN FLIGHT; then **R2b
PRESENTATION** (~660 instr + art: the draws `$28DED8`/`$28E1AC`/`$28EDC0`, banner painters,
score-number renderer; makes it visible). Risk: `$24652A` writes the shared `$80FA86` pool (port
exactly + red-validate); banner slide-in visual is R2b (R2a frees the slot correctly but not
visually).

## 7h. UPDATE -- 2026-08-07: R2a (result-screen logic) FAILED at the usage limit; partial stashed

R2a (the result-screen logic impl, W124) FAILED at the 5h usage limit (429; reset
2026-08-07 15:36:08) mid-work. The gate crashed on an UNWINDOWED ROM read at `0x288346` (a
result-screen data table needing an `export-tables.py` window). The agent's partial src/
changes (stageend.js, hud.js, w62/w63 tests, export-tables.py) are in `git stash` (label
"W124 R2a..."); worklog 124 is committed with the findings. Tree is clean (HEAD `3cb30e7`).

RESUME after the reset: re-dispatch R2a. The fresh agent should READ worklog 124 + run
`git stash pop` FIRST (recover the partial), then add the `0x288346` window to
`export-tables.py` and complete the wave (clear DEV-1/DEV-2, award the score, free the slot).
The cron (clean tree now) will auto-dispatch R2a after the reset.

## 7i. UPDATE -- 2026-08-07: R2a result-screen logic DONE (`05d59e3`); R2b presentation IN FLIGHT

R2a landed (recovered from the stash; committed `05d59e3`, tree clean). The 8-phase FSM
`result28D9AA` + tally `tallyBody285400`/`tally2853D2`/`tallyAward28551E` + anim chain
`$24652A`/`$24681A`/`$246800` + banner `banner28E7F8` (teardown `$28EAD4` frees the slot).
**DEV-1 cleared** (the real `$285496` producer fires at lf10628). Three premise corrections:
(1) `$288346` was a RANK-ICON P2 table overrun (W113 said 8 entries, it is 32; window widened
`$20`->`$80`); (2) the tally had two ROM-faithfulness bugs that made `$285496` never fire
(wrong fall-through `===0xfffe` vs N=1&C=0; wrong hold-recompute sign) -- both fixed; (3) the
seed cannot reach the banner drain (next-stage BG data) -- (c)/(d) verified by unit test.
DEV-2 has a residual (`$246410` anim-driver, R2b). Gates 1270/0/0, bosscoverage 103/0/8.
NOT yet published (logic-only, no visual change; deploys with R2b).

R2b PRESENTATION IN FLIGHT: the draws `$28DED8`/`$28E1AC`/`$28EDC0`, banner painters, 8 art
windows, score-number renderer, + the `$246410` DEV-2 residual. Makes the result screen
visible. Publish R2a+R2b together after R2b.

## 7j. UPDATE -- 2026-08-07: R2b result-screen presentation DONE (`b737c8f`); result screen VISIBLE; R2a+R2b PUBLISHING

R2b landed (committed `b737c8f`): the draws `$28DED8`/`$28E1AC` (panels, medal/item counters,
bonus numbers via bucket 0/2 sprite enqueues), banner paint `$23F782`/`$23F7F4` + picture
`$28EDC0`, F0 art install (seven `install24150A`), 8 art windows. The result screen is now
VISIBLE. Premise correction: `$246410` is a LOADER (not the per-frame drain); the true drain
is the animation-object EXECUTION engine (register-indirect, invisible to xref.py) -- DEV-2
honestly refined (names the engine gap, not fabricated-cleared). Score renderer `$2855B6`
deferred (it is the popup, W117-named, not result-specific). Gates 1272/0/0, bosscoverage
103/0/8.

R2a+R2b PUBLISHING together (`--only ddpdoj`). Result: the stage-clear result screen is live
(banner, score tally, bonus numbers); DEV-1 cleared; DEV-2 refined (animation engine = named
gap). Stage 1 is "complete honestly" modulo DEV-2's deep engine + the deferred draws.

NEXT (W119, owner to steer): the RANK/difficulty fix (Phase 0a divergence -- gauge/stock
pipeline `$287682`/`$2530CA`/`$285A62` + rank object type 10; recon IN FLIGHT to size it),
Phase 3 (stage-2 data export + boot verification), Phase 4 (replay packaging -- cheap/light),
Phase 5 (sound via W27; slowdown via MiSTer). Wave B input (Gradius+Batman) owner-gated.

## 7k. UPDATE -- 2026-08-07: RANK-fix recon (W126) -> sized; Wave A (type 10) IN FLIGHT

The RANK-fix recon (W126) reframes the fix. Premise correction: the middle "pipeline" link
`$285A62` is NOT a pipeline link -- it is the hyper-ACTIVATION body (gated by the unported
hyper button `$24989A`/`$249814`, thrown in player.js since W4). So the fix SPLITS:
- **Wave A -- object type 10 (Tier 1, ~1 wave, CORPUS-SAFE).** Port the dispatch entry
  (`$260794`, priority `$001F`, runs first) + state machine + recompute `$2608D2`
  (rank = base[stage] + (clock>>8) + hyper-term) + `$288610`. On no-hyper runs (the corpus +
  most play) the hyper term is 0 on BOTH port+board, so `$81309E` = base+clock matches the
  board. Zero scoring risk (recompute reads no chain/score state). Unfreezes the rank clock
  (currently frozen). IN FLIGHT. Defer state-0 INIT `$2605C8` (cold-boot only). One unknown:
  `$288610` jump-table (trace before ship).
- **Wave B -- the hyper subsystem (Tier 2, 3-4 waves, MAME-gated).** Hyper button + activation
  `$285A62` + grantor `$287682` + spawner `$27E912` + collect `$2530CA` + sinks (death-quarter
  `$24A006`, bomb debit `$249976`, bee feed `$27FBDE`). The "wrong-and-rising" risk (W120) lives
  here. Needs a hyper-active MAME capture to red-validate (the corpus has no hypers).

Wave A ships FIRST (safe, corpus-matchable, unfreezes the rank for no-hyper play); Wave B (the
hyper power term) follows. This inverts the brief's "pipeline first" but is safe (the recompute
reads no chain/score state; no wrong-and-rising until hypers activate).

## 7l. UPDATE -- 2026-08-07: RANK Wave A DONE + LIVE; big DOJ milestone checkpoint -- owner steer requested

RANK Wave A (object type 10, W127) landed (`ec07f18`) + PUBLISHING. The rank clock unfreezes:
`$81309E` = base[stage] + (clock>>8) matches the board on no-hyper runs (validated against the
seed: `$35`, exact). Declared side-effect: enemy fire cadence now reads the live rank, so two
webgate baselines shifted to live-rank values (+5 bullets in one scenario) -- the port matching
the board's live rank, not a regression. Gates 1284/0/0, bosscoverage 103/0/8.

SESSION MILESTONE: stage 1 is FEATURE-COMPLETE + HONEST. Live DOJ now has the scrolling level,
enemies/bullets/boss+explosion, items, bees, the full HUD (score/chain/combo/lives/bombs/
credits), the result screen, the shared input layer (keyboard/gamepad/touch), and the live rank
clock. Wave B input (Gradius+Batman gamepad) remains owner-gated.

NEXT PHASE -- OWNER STEER REQUESTED (strategic fork after the DOJ milestones):
- **RANK Wave B** (the hyper subsystem: hyper button + activation + grantor + death/bomb sinks;
  3-4 waves; MAME-gated for red-validation). Completes the rank power term.
- **Phase 3** (stage-2 data export + boot verification -- a scrolling stage-2 background).
- **Phase 4** (replay packaging -- cheap, light, high-leverage).
- **Phase 5** (sound via the W27 10-recons+architect process; slowdown via the MiSTer FPGA).
- **Wave B input** (gamepad on Gradius + Batman -- needs the owner's DOJ-module live-verify).

The session has been heavy (two 5h usage-limit blocks today). The cron should AWAIT owner steer
on the next phase rather than auto-dispatch -- the owner should test the DOJ milestones + pick
the direction.

## 7m. UPDATE -- 2026-08-07: un-holding; Phase 4 (replay packaging) recon IN FLIGHT (continue-default; owner can redirect)

Stage 1 is feature-complete + honest (W127 RANK Wave A live, build `20260807112531`). The owner
has been away since the 7l checkpoint; per the standing loop + the offered "continue -> Phase 4"
default, proceeding with the safe/light Phase 4 (replay packaging) while awaiting steer. Owner:
redirect anytime (RANK Wave B / stage-2 / sound / Wave B input remain on the menu); the DOJ
milestones are live for testing.

Phase 4 replay-packaging recon IN FLIGHT: map the existing replay infra (portdiff.mjs,
determinism.mjs, seedcmp, boot-from-rung) + design the `.replay` format + headless player + the
RTC date-leak decision. Then ~1 impl wave.

## 7n. UPDATE -- 2026-08-07: Phase 4 replay-packaging recon done; W129 impl IN FLIGHT

The Phase 4 recon (W128, text-only) confirmed the replay property is ALREADY structurally built
(portdiff's step loop + SHA-256 digest + determinism + seed-anywhere + boot-from-rung); only the
packaged `.replay` artifact + headless player are missing. RTC date-leak is a NON-ISSUE for the
port (the port does not read the RTC -- grep zero; the date bytes are frozen in the seed and
excluded from the CLAIMED digest) -- document + freeze, zero code. Phase 4a+4b = one small
packaging wave (W129, IN FLIGHT): `games/ddpdoj/tools/replay.mjs` (player + builder + red mode,
imports only) + `NOTES-replay.md` v1 spec + a gitignored fixture + a gate stage. Phase 4c (live
REC/PLAY) deferred (depends on 4a).

## 7o. UPDATE -- 2026-08-07: Phase 4a+4b (replay packaging) DONE (`cdd4aaf`); tooling, no publish; next phase owner-TBD

W129 landed (`cdd4aaf`): `games/ddpdoj/tools/replay.mjs` (verify + record modes; reuses portdiff's
EXACT digest feed so a green `.replay` is provably the same property the oracle checks), the v1
`.replay` format spec + the RTC freeze decision in `NOTES-replay.md` (the port does NOT read the
RTC -- grep zero; the date is frozen in the seed, zero code), and `tests/w129replay.test.js` (the
gate, 6/6, A/B/C red-validated). TOOLING only -- no `src/` game-logic change, not bundled into the
live page, so no deploy needed. Gates 1290/0/0. Phase 4c (live REC/PLAY) deferred (depends on 4a,
now done).

The continue-default (Phase 4) is FULFILLED. The next phase is owner-TBD (a strategic fork): RANK
Wave B (the hyper subsystem), Phase 3 (stage-2 data + boot), Phase 4c (live REC/PLAY), Phase 5
(sound via W27 / slowdown via MiSTer), or Wave B input (Gradius+Batman, owner-gated). The cron
should AWAIT owner steer -- do not auto-dispatch.

## 7p. UPDATE -- 2026-08-07: un-holding; Phase 4c (live REC/PLAY) recon IN FLIGHT (continue-default)

The owner has been away ~4hr since the 7o checkpoint; per the standing loop + the offered
"continue -> likely Phase 4c" default, proceeding with Phase 4c (live REC/PLAY) -- completing the
replay feature on the live DOJ page (record a run -> `.replay`; load + play it back, surfacing the
first divergence). Owner: redirect anytime to RANK Wave B / stage-2 / sound / Wave B input; the
DOJ milestones remain live for testing.

Phase 4c recon IN FLIGHT: design the live-page REC (tee `currentPortWord` + package with the seed
via the W129 format) + PLAY (boot from `.replay`, feed portin, compare digests, show divergence) +
the UI + the integration points. Then ~1-2 impl waves.

## 7q. UPDATE -- 2026-08-07: Phase 4c recon done (W130); W131 (REC + browser digest) IN FLIGHT

Phase 4c recon (W130): live-page REC (tee `currentPortWord` + capture the seed -- 128 KiB RAM + BG
ring + tables + package via the W129 `.replay` format) + PLAY (boot from `.replay`, feed portin,
digest, surface first divergence). UI: `#rec` toggle + `#play` file-input + `#replay-banner`; off
by default (normal play undisturbed). Key subtlety: the browser cannot import `replay.mjs`
(`node:fs/crypto`), so a new `src/web/replay.js` uses `crypto.subtle` (accumulate-then-hash ==
the incremental hash; a cross-check gate proves it). 2 waves: **W131 (REC + the browser digest
module) IN FLIGHT**; W132 (PLAY + the divergence UI) next.

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
