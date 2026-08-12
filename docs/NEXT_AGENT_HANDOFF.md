# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-12

## READ THIS FIRST -- STATE AS OF W336 (commit `bbbf63a`)

    suite 2389/2389 green, ZERO skips     sweep 0 missing     dojcoverage.py both OK lines
    422 ROM windows                       live build 20260812162556      tree clean, all pushed

**Stage 5: NINE types with no handler over 27 records** (was ten over 29 at the session start).
Ranked: `$46` 13, `$1A` 4, `$48`, `$4A`, `$4B`, `$43`, `$47`, `$4C`, `$B0`.

**PUBLISH CADENCE IS EVERY FIVE WAVES** (owner, 2026-08-12), not every wave. W335 published; next due
after **W340**. Run `export-web.mjs` BEFORE `publish.mjs --only ddpdoj` whenever the run added ROM
windows. Foreground, never while still editing.

### THE NEXT THREE THINGS, IN ORDER

1. **Write `$4A`** (init `$2719AE`, initBody `$2719B6`, handler `$271A64`). Everything needed is in
   the `$4A` section below. Read `$271AE0` onward first -- its alive path, fire arm and draw, and
   whether `($20,A5)`/`($21,A5)` feed cadence or aim -- then write it. Window `$271A1A + $52`.
2. **`$4B`** (init `$271C92`, initBody `$271C9A`, handler `$271D48`), expected to share `$4A`'s
   overlap trap and its mark-and-fall-through death.
3. **`$47`** (`$E2` records). `$1A` stays blocked until D2/D3 at `$268D8C` are measured.

Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.

### THE LESSON THIS SESSION KEPT PAYING FOR: CHECK FOR THE FAMILY FIRST

**Twice in one session a "new mechanism" or a "blocker" dissolved the moment I checked whether the
port already had the shape.** Both times the cost was a wave of attention and both times the check was
two minutes:

  * **W334** -- `$2715A6` has no code xref and looked like a broken disassembly. It is `init + 8`,
    which `spawn.js:219` has computed all along and which `$81` already models as `init`/`initBody`.
  * **W336** -- `$4A` setting `(A6) = $8000` and NOT calling `freeEnemy` looked like an unknown
    lifetime needing a measurement. `death37` in `handlers.js` is the same thing instruction for
    instruction, with the fall-through already labelled in a comment.

A third instance, same root: **W334 also found `bee.js` had carried a docstring saying kind 16 was
unported for fourteen waves after W286 ported it**, and D20 was opened on the strength of it. A stale
comment is not inert.

So: before writing anything, grep the port for the shape, not just for the address. And before
believing a comment, check its condition still holds.

### THREE TRANSCRIPTION TRAPS THIS BAND KEEPS SETTING

1. **Prototypes overlap handlers.** `loadSubProto` copies `($4,A5)+1` records of `$20` bytes and the
   cartridge lets the tail run into code. `$49`: four bytes. `$4A`: **eight** (two sub-records). Never
   trim such a window to the handler start, and never assume the depth from a sibling.
2. **This ROM indexes its own instruction stream.** Four instances now: `$27460A` (W326), `$25DAC2`
   (W332), `$2716D8` (W335, a wholly DEAD `tst.w` of a `lea` opcode) and `$271774`. When a stage-5
   routine reads an address inside itself, check whether the target is code before modelling it.
3. **Word ops on long-loaded registers.** `$27172C neg.w D3` after `move.l (A1),D3` negates the low
   half only, no borrow -- then `add.l` DOES carry. Also `$281744`/`$281764`/`$2816F6` all funnel to
   `$2817C2`, which saves only D7/A0-A1 but **never writes D1..D4**, so chained shots legitimately
   inherit registers (W336). Read the callee before assuming either way.

### STILL OPEN FROM THE OWNER'S PLAYTESTS

D24/D31 hyper laser impact sprites (**start at `src/hyper.js`, not the beam** -- W324 did not fix it),
D25 transition cutting early, D32 stage-2 invisible-but-hittable enemy plus stars/medals only from
midbosses, D21 HUD element near the hyper counter (needs a marked screenshot), D12 repo docs behind
the code. The transition screen's phases 0 and 2 and the arm `$25DC2C..$25DD80` are unwritten.
D28a/D28b are mods, deferred by the owner until the game is done.


## Objective

Complete the readable JavaScript translation of DoDonPachi DaiOuJou Black
Label Version-B, including every stage, boss, loop, system, presentation path,
sound path, and authentic timing/slowdown behavior.

Read the repository `AGENTS.md` before changing anything. The important local
rule is delivery first: spend at least 90 percent of effort on playable product
implementation, use one focused smoke for a meaningful change, and do not
restart broad reconnaissance or build reviewer/test-agent chains.

## THE GOAL: one credit from stage 1 to stage 5 with no Unreached

The milestone to drive at, stated so it can be checked rather than felt: a single
credit plays from the stage-1 start through the stage-4 boss and into stage 5,
including at least one death and every stage transition, without the port
reaching one `Unreached`, and with nothing on screen that the cartridge would
draw and the port does not.

It is worth stating because the objective "translate the whole game" gives no
order, and this one does: everything below is ordered by what that run hits
first, and every item is a defect the owner can see rather than an interior the
owner cannot.

## Current product state

- HEAD is W325, `ddpdoj: type $01, two shared library routines, and a wrong-table error`.
- Live build: **20260811184328**, deployed and confirmed (W321..W324). W325 is NOT yet live.
- Suite: `node --test games/ddpdoj/tests/` is **2345/2345**, green, no skips. 414 ROM windows.
  `dojcoverage.py` reports **82/256** enemy types ported. Web gate 31 of 31, exit 0.
- Stage 5's census is **ELEVEN types over 32 records** (W323 took `$1B`). Note that W325's
  82nd type is `$01`, which NO stage script spawns, so it is not one of the eleven.
- **THE WEB GATE IS GREEN AGAIN AND THE GAME PUBLISHES.** W321 found it had been red for **182
  commits** and that nothing was broken: the expectations were last recorded at `c62f35e` and the
  gate is only ever run BY `publish.mjs`, so it goes stale exactly as long as nobody publishes and
  then blocks the publish that would have caught it. **That ratchet is the reason to publish often.**
  Two controlled experiments cleared the port -- pre-W300 source against current assets gave a
  byte-identical failure set, and current source with the old regenerated tables gave another -- and
  what had actually moved was the sprite PACKING: the art grew to 4244 streams, two shards were
  repartitioned, and every one of those checks counts records filtered by `map.get(offs)?.[2]`. The
  gate's own claim that "`records`, `distinct` and `first` are the PORT's own and no bundle can
  supply them" is FALSE and is corrected in place. `tools/w321itemspan.mjs` is the tool that told
  benign drift from regression: it prints per-frame SPANS and the per-shard spread instead of one
  total, and it takes `--tables` to swap the simulation's tables while leaving the assets alone.
- **READ `HIBACHI CLOSURE RULE` BELOW BEFORE TOUCHING TYPE `$B0`.** It is the one place where every
  measurement this repo has would report a finished stage 5 that has no boss in it.
- **A hand-built `ctx` in a test can agree with a wrong port.** W316 called
  `aim64AtTarget(ctx.tables, ...)` -- and in the live game `ctx.tables` is the MoveTables, not the
  AimTables. Its test passed because the fixture put an AimTables there, so test and port were wrong
  together. W319 corrected both sites to `aimTables(rom)`. Where `main.js` builds a real ctx, prefer
  that shape in fixtures.
- **STAGE 5 HAS STARTED AND IS SCOPED EXACTLY.** W313 windowed its spawn span
  (`$237978 + $2640`, the one stage whose far end is its last movement stream's terminator rather
  than the next stage's script) and W314/W315 censused it: **fifteen enemy types have no handler,
  over 65 of its 770 script records.** Stages 1..4 have zero missing. The ordered list, by how
  much of the stage each buys, with every init and handler address, is pinned in
  `tests/w314stage5scope.test.js` -- start there, do not re-derive it:

      $45 x21  $46 x13  $8E x6  $1B x5  $1A x4  $81 x3
      $48 $49 $4A $4B x2 each   $43 $47 $4C $59 $B0 x1 each

  `$45`'s handler is `$270E36..$27102B` -- **502 bytes**, comparable to the stage-4 types that each
  took a wave (W211..W218). Expect per-type waves, not table rows.
- **THREE THINGS THAT LOOK LIKE SHORTCUTS TO STAGE 5 AND ARE NOT.**
  1. A bare `new Ram()` cannot drive ANY stage: all five throw on garbage pointers, including
     stage 1, which plays end to end. Seeding it and re-installing the stage still throws, because
     `runEnemyFrame` is one of the seven calls a frame makes. Asserted in W314's test.
  2. Absence from `enemyHandlerMap` is NOT the same as unported. `dojcoverage.py` line 120 declares
     `NULL_HANDLERS = {0x26781C, 0x27E40A}` -- the reason 130 of 256 types report as `null`. W314
     counted type `$00` as missing and W315 corrected it.
  3. `$48`/`$49`/`$4A`/`$4B` are NOT one family. Consecutive types, consecutive inits, two records
     each -- the exact shape that paid off in W286, W287, W298 and W312 -- and W315 diffed them:
     seven shared bytes for one pair, forty-seven for the other, then real divergence. Fifteen real
     routines.
- **RUN `python games/ddpdoj/tools/dojcoverage.py`, not just the suite.** Its inventory check
  compares the live source registries against a ROM-derived inventory and rejects a handler
  registration the ROM does not agree is a handler. It is what caught W315's error.
- **`$280BCE` IS DONE at eighteen of twenty** (W312 added hooks 2, 3 and 17). The two left are
  indices 1 and 16, which are both `$280CEE` and belong to `allocBee27F92A`, so this dispatch will
  never translate them. Hooks 2 and 3 are the same twenty-four bytes at two addresses and do NONE
  of the shared speed work, which is why `fillGeneralImpact280B3E` gates it on `sharedSpeedBody`.
- **THE HIGH-SCORE SUBSYSTEM IS COMPLETE** (W300..W311), including the name entry end to end:
  search, insert, entry, factory table, the display screen's eleven `bsr`s and its state routine,
  the tag lookup and writer, the arms, the work list, the banned-name filter, the cursor, the input
  decode, the finish, and the countdown. What is left of it is presentation only:
  `$28F7F4..$28F8AA` and `$28FAF4`, both gated on `$23E45A` -- a SIXTH member of the zooming
  emitter family (`movem.l D4/D7/A0`, its own table at `$23E78C`, extent from D3 rather than
  `($E,A6)`), which `resolveZoomStub` does not accept and which needs the emit-stub window widened
  past `$23E0C2`.
- **THE HIGH-SCORE SUBSYSTEM IS ESSENTIALLY COMPLETE.** W300..W306 took it from one measured
  ordering fact to the whole thing:
  - `src/hiscore.js` -- the search `$287D96`, the insert `$287CEE`, the entry
    `$287BD2`/`$287C08`/`$287C3E`, the factory table `$28841E`, and the tag routines
    `$28F6F4`/`$28F7C8`.
  - `src/hiscorescreen.js` -- all **eleven** of `$25B492`'s `bsr`s and the state routine
    `$25B412` above them.
  - `src/hiscorename.js` -- the name-entry arms `$28F428`/`$28F482`, the row cache `$28F75A`,
    the work-list drop `$28F6C8`, and the banned-name filter `$28F674`.
  - Bonus line 2 calls the check instead of noting it. No counted gap inside any of the above.
  - **What is left is the character GRID only**: `$28FCAA` (the cursor draw, `$28FCAA..$28FD2A`),
    `$28FD2C`/`$28FD6E` (two entry points sharing a tail that ends at `$28FE0E`, drawn only when
    exactly ONE side owes a name), and `$28F4BA jsr $246410` with `$28FA98` -- which is the anim
    driver `stageend.js` declares out of scope as `PRESENTATION_DEVIATION[0x28d6fc]`.
- **THE LAYOUT, because two conventions share nine arrays.** They tile `$803824..$8038B9`: five
  score longs, five 12-byte name entries (three longs, one character each), six arrays of five
  words (loop, stage, ship, style, chain, digits), five overflow words. **The insert family's
  `lea`s name ENDS** (it walks `-(An)`); **the display family's name BASES** (it walks `(A6)+`).
  Same addresses, opposite meanings, depending on which routine you are reading.
- **THE NAME ALPHABET IS SETTLED.** A stored character is its index times four and index 0 is
  `A`. Proved three ways: the factory data is all multiples of four (W301), the display indexes
  its font UNSCALED so it must be (W302), and `$28F8AC`'s seventeen entries spell `SEX`, `KKK`,
  `DIE`, `ASS` and eleven more when read that way (W306). A..Z at 0..25, then 26, 27 and 28,
  with **27 a `$00000000` hole in both fonts**. The rejection constants `3, 3, 15` spell `DDP`.
- **`$8130CC` IS A WORK LIST, one bit per side that owes a name.** Bonus line 2 sets bit 0 or 1,
  `$28F350` copies the byte to `($5,A5)`, and `$28F6C8` clears a bit when that side has no
  tagged row; at zero the screen ends. Note that `$81E0D9` one screen away uses bits **1 and 2**
  for the same kind of thing -- do not pattern-match one onto the other.
- **THE `$FF`/`$FE` TAG IS A SEARCH KEY, not just a sentinel**, and it is `not.b` of the side.
  Two routines find a row by it. The `($C,A4)` slot pointer the insert writes has **zero**
  readers in the build -- W302 lost a search assuming a pointer written is a pointer read.
- **CHECK HOW A ROUTINE LEAVES THE CARRY BEFORE DECIDING IT RETURNS NOTHING.** Four this
  session: `$287D96` (a `sub` borrow), `$287C3E` (explicit `ori`/`andi`), `$25B412` (`ori`
  against `move.w D0,D0`, which exists only to CLEAR it), `$28F6F4` (a `subq` borrow on the
  miss path and an incidental non-carrying `add.w` on the hit path).
- **WHEN A SUBSYSTEM IS PARALLEL ARRAYS, SCAN THE ADDRESS RANGE, NOT ONE POINTER FIELD.**
  W301 wasted a search chasing `($C,A4)` -- whose absolute forms `$81B42C`/`$81B43C` have zero
  references -- and then found all four caller families in one scan for absolute longs landing
  anywhere in `$803824..$8038BA`. The family that touches every column is the one that
  understands the layout.
- **BEFORE DECIDING A QUESTION NEEDS NEW EVIDENCE, CHECK THE EVIDENCE THE REPO SHIPS.**
  Three waves deferred the high-score subsystem because the table's ordering was unknown.
  `rip/web/seed.bin` is a snapshot of the board's main RAM and had the answer in it. W301
  then found the same five scores in the ROM at `$287DF8`: **the shipped seed carries the
  FACTORY table**, so no boot catch-up is needed and a test asserts that.
- **`DBcc` EXITS WHEN ITS CONDITION IS TRUE** -- "decrement and branch if FALSE". So `dbcc`
  exits on carry CLEAR. Reading it the other way makes `$287D96`'s search run backwards,
  and both readings look plausible from the instructions alone.
- `$280BCE` is at **FIFTEEN of twenty** finish hooks translated.
- **A STATEFUL RNG DRAW CANNOT BE INSPECTED TWICE.** `$242B3C` opens with
  `addq.b #1,$803917`, so calling it again to test the sign desynchronises every later
  draw in the frame. W298's first draft did exactly that; there is now a test comparing
  the counter's advance against a known-good kind.
- **THE NINE BONUS LINES ARE COMPLETE with no counted gap of their own.** W297 ported
  `$2532B6`, which `setPanel2603B0` had been counting as the deferred text path even
  though both its printers landed in W116 -- the only missing part was the arithmetic.
- **THE SCORE TALLY'S SPINE IS COMPLETE.** `$25FF7A` walks both records and all NINE of
  `$25FF52`'s real entries have bodies. Line 9 turned out to be already ported --
  `player.js`'s `setPanel2603B0` calls itself "jump-table entry 9 of `$25FF7A`" -- so two
  of the nine cost nothing because an earlier wave wrote down something it could not use
  yet. What remains inside it: one note (`$2532B6`) and the HIGH-SCORE INSERT.
- **SEVEN of the nine bonus lines are in.** Line 8 is `$26037C`, whose head is the same
  both-records shape as line 5 (`lea $8130FA,A2 / lea $81311E,A3`), so read it alongside
  `$2602B6` rather than fresh.
- `$813142` is a LEASE, not a countdown: `$2600D8` spends one per post and bonus line 7
  gives one back. W273's note that the decrement is "UNGUARDED" was true and incomplete.
- **SIX of the nine bonus lines are in.** Line 7 is `$26035A`, whose head is
  `addq.w #1,$813142` -- the same counter `$2600D8` DECREMENTS at `$260112`, going the
  other way, so read the pair together.
- **A RULE WORTH KEEPING (W294):** a register the driver does not set needs MEASURING when
  it feeds arithmetic, and can be a PARAMETER when it feeds one unconditional store into a
  known field. That is why `$280252`'s A0 is still blocked and `$260348`'s A5 shipped.
- **FIVE of the nine bonus lines are in.** Line 6 is `$260348`, and its head writes an
  OBJECT's state byte through **A5** -- which none of the first five does, so A5 must be
  live at entry. **CHECK THAT FIRST**: it is the same class of question that stopped
  `$280252` in W288, and checking it last cost a reverted transcription there.
- **FOUR of the nine bonus lines are in.** Line 5 is `$2602B6`, and its head takes BOTH
  records at once (`lea $8130FA,A2 / lea $81311E,A3`) -- a shape none of the first four
  has, so do not assume the family.
- **THREE of the nine bonus lines are in** ($25FFA8, $260056, $26010E). Before
  transcribing line 4 (`$2601F4`), check its head against `$2600D8`'s and `$25FFA8`'s --
  three of the first four shared something.
- **D9's old note is closed**: `$260056` creates object types `$D` and `$B`, and `$B` is
  the `$25DBB4` W276 ported -- the creator and the created are both in the tree.
- A long census run reaches **frame 6483** and stops at `$280252`, whose body is READ
  but NOT portable until one register is measured -- see work-order item 1.
- **THE LIVE BUILD IS STALE AND NOBODY IS TRACKING IT (D19).** `git push` is not
  `tools/publish.mjs`. This session closed six docket items and moved the bundle
  4194 -> 4244 streams with no publish, and THREE of those items turned out to be
  things that already worked. Ask for the build id with the next report.
- **`900 FRAMES IS TOO SHORT TO SEE AN ITEM.** Every gate here runs 900 and the item
  producer's first drop is at frame 2576. If a probe about items, medals or hyper
  reports zero, check the window before believing it (W282).
- **`top_objects` coverage is 9/20** -- nine of the twenty top-level dispatch entries
  are registered in `main.js`. `w167coverage.test.js` pins it.
- Stages 1, 2 and 3 have their known live spawn paths translated. Stage 3 is
  closed at 414/414 script records and 28/28 script types.
- **THE STAGE-4 BOSS IS COMPLETE FOR EVERY REACHABLE PATH.** W246 through W263
  landed all three phases and the damage-controller edge that drives them:
  - phase 1 was already there (F0/F3/F4, MAIN0/MAIN1, D0/D9/D10, E1/E2/E3/E5).
  - phase 2: F5 (`$2A0D16`, a seven-arm bit machine), MAIN4, the A3 3..8 ramp
    family, A1 6/7/8/9/10, and type `$42`'s body and handler.
  - phase 3: A4 id6, MAIN7, MAIN8, A1 11/13/14, and type `$42`'s `$8130F4 == 2`
    half. W263 translated the low-HP transition that STARTS it, which W219 had
    left as a throw.
  - `w256type42handler.test.js` drives a whole phase-2 cycle in one test: F5's
    arm 6 starts A1 9, A1 9 spawns a formation, each child homes and counts itself
    back on arrival, A1 9 retires, and its retirement flips every survivor into its
    second mode.
- **Deliberately unreachable and left as such**, each pinned by a census rather
  than assumed: A4 id2, MAIN5 and MAIN6 (no `a4Start`/`seqStart` in the bank
  reaches them); the `$281744` twins of A1 13's two fans (21 call sites behind a
  `bra`); type `$42`'s three call-site-less emitters; and `$2A3AFE` (a role-`$FF`
  child meeting `$8130F4 == 2`, which no translated path produces).
- **A death works end to end AND NOW DRAWS** (W227, W228, W231, W275): the
  animation, the reset, the life spent, a fresh player object placed where its
  respawn entry says, `$F0` frames of invulnerability, and the pods deploying to the
  exact `$24C928` target. W275 ported `$24A6B4`, the script-driven display walker the
  ship runs WHILE DYING, and harvested the 49 sprites of the explosion -- all of
  which were missing from the bundle, so the six frames of the death drew nothing.
- The stage transition MACHINE works, its banner picture draws (W232), its
  palettes install (W236), both panels paint (W238, W239) and the `$900000` ring
  clears (W240); the rest of its presentation is the gap.
- The bee popup works (W234), and the secondary explosion spawns (W235).
- Sprite streams **4244**. `w230descriptorsweep.mjs` draws 718 distinct descriptors
  from the shipped seed and 783 from the stage-2 rung (`--lf 19500 --frames 1800`),
  with ZERO unresolvable in both. **Eleven test files pin the stream count exactly**
  and all eleven get bumped together when a wave harvests art; `w218stage4.test.js`
  carries the explanation.
- **SEVEN loop-2 rules exist** (W292 added two, both in bonus line 4 `$2601F4`: the
  pointer word's source and whether `$286FB4` runs -- one `beq` and one `bne` on the
  same word, so a shared flag would get exactly one backwards). The five before them:: W241's zero-lives extend (`$253794`), W250's A1 6
  (which changes both its shot count and its generator), A4 id6's two (`$2A1250`,
  `$2A1346`) and W270's `$260ACA` announcement choice. All read `$813098`. Stage 5
  has not started.
- **The announcement pipeline is closed end to end**: the consumer `announce260B30`
  is registered as object dispatch `[4]` (W269, via `adoptCurrentWindows` in
  `src/rom.js` -- a replay fixture's frozen ROM WINDOW LIST is a port artifact, not
  game state, so it can be substituted once proven a byte-superset), and W270 landed
  the four producers at `$260A20`/`$260A88`/`$260A9A`/`$260AB6`/`$260AF2`.
- **The ship's draw path is verified against the board byte for byte** (W272): three
  bucket-19 records and five bucket-12 trail records, 100 frames out from the
  cartridge's own RAM. See D8 -- there was no missing draw. W274 found that
  `drawShipAlt`'s bit-15 compare was INVERTED; W275 fixed it together with the walker
  it reaches, which is the only way it could be fixed.
- **The stage-clear SCORE TALLY works AND IS DRIVEN** (W273, W274, W276): `$2600D8`
  posts a bonus line, drives all seven HUD rows per side, installs the tally's four
  palette banks (`$241688`) and recounts the live sides; its only counted gap is
  `$23C668`. W276 registered object dispatch `[11]` `$25DBB4`, the stage-clear SCREEN
  the tally lives inside -- states 0 and 2 transcribed, state 1's gates and its menu
  cursor ONE counted note that NAMES the six routines still missing.

## DEFINITION OF DONE, PER WAVE -- and why this section exists

A wave is DONE when all five hold. Nothing else counts, and "the game is finished" is not a
per-wave test:

1. `node --test games/ddpdoj/tests/` is green with **zero skips**.
2. `node games/ddpdoj/tools/w230descriptorsweep.mjs` reports **0 not in the bundle**.
3. `python games/ddpdoj/tools/dojcoverage.py` prints **both OK lines**.
4. A worklog exists under `docs/worklog/ddpdoj/`, numbered by the reserve-then-rename rule.
5. It is **committed AND pushed** (D18).

If the wave is BLOCKED instead, it is done when the blocker is recorded with the specific
MEASUREMENT that would unblock it -- as `$1A` is ("measure D2/D3 at `$268D8C`") and `$280252` is
("measure A0 at `$28029A`"). "Unported" is not a blocker; an unread register is.

**WHY THIS IS WRITTEN DOWN.** A session-scoped Stop hook was set by `/goal` with the condition
*"finishing the whole game including loops, plus everything else we ever said"*. That is a
COMPLETION test used as a TURN-END gate, so it can never pass: every turn ends with the game
unfinished, the hook fires, and once the context is spent the only thing left to produce is
restatement. It fired eight times in a row at the end of 2026-08-11 for exactly that reason.

The lesson for whoever sets the next one: **a goal condition enforced at turn-end has to be
satisfiable at turn-end.** The five checks above are. "The whole game" is not. And autonomy is a
different mechanism entirely -- `/loop` or a cron RE-INVOKES with a fresh context, which is what
unattended progress actually needs; a Stop hook only refuses to let a turn finish and cannot hand
back the one resource that ran out.

This repo is already built for the fresh-context model: this handoff and `docs/DOCKET.md` are the
state carriers, and they are kept current precisely so a new session continues without re-reading
the code. Trust them over trying to keep one context alive.

## An hourly cron is running

A session-scoped job fires every hour at :23 telling the next wake to resume
immediately, take the FIRST unfinished item in the work order below, and spend the
wake on translation rather than on process. It is session-only: it dies with the
Claude session and cannot restart one that has exited. It also auto-expires after
seven days.

## The docket comes first

[DOCKET.md](DOCKET.md) holds twelve defects the owner reported from playing the
shipped build, each with the port-side finding underneath. Player-visible defects
in stages the player actually reaches outrank Stage-4 boss interiors, which is why
W225 is paused.

**THE OWNER ADDED FIVE ITEMS ON 2026-08-11: D13..D17.** D13 (orientation/safe-area) and
D15 (the orientation lock as a setting) are FIXED in W279, D14 (the PWA) in W280. **D16
(the hyper bar should show the level when NOT hypering) and D17 (the in-stage medals)
are OPEN and they are the top of the work order.**

Of the first twelve, eleven are closed: D1, D2 (W226); D9 entirely (W227, W228, W231);
the rank icons and the D5 instrument (W230); D3 (W264/265/266); D4 (W265/266/267); D10
(W268); D7 (W271); D8 (W272); D12 (W253/263). D11's banner picture landed in W232 and
its remainder is the only one of the original twelve still open.

**Two of the last three closed the same way, and it is worth expecting a third.** D7
and D8 were both routines and records that already existed: D7 was `hyperStock286ED6`
and `livesRow2878CC`, complete since W113/W116 and called by nobody; D8 was a draw
path that already matched the board byte for byte behind a page that told the player
not to press the button. **Before assuming a player-visible gap is untranslated code,
check whether the body exists and is uncalled, and whether the shipped page is lying
about it.** `w271hyperstock.test.js` has the mechanical form of the first check.

## D18: FINISH EVERY WAVE WITH A PUSH

The owner asked for this explicitly. Every wave of this session committed and none
pushed, so `main` reached **73 commits ahead of `origin/main`**. A wave is not done
until `git rev-list --count origin/main..HEAD` is 0.

    git push origin main

The remote is `origin` -> `https://github.com/Fabulu/Mixup.git` and the branch is
`main`, which is also the default, so nothing has to be inferred. This is NOT
`tools/publish.mjs`: that gates the Batman suite, builds `dist/` and deploys to
Cloudflare Pages. Pushing does not publish and publishing does not push.

## HIBACHI CLOSURE RULE -- read this before touching type $B0

**Do NOT declare stage 5 complete because** all 770 records initialise, all 35 top-level types have
handlers, the missing-handler census reaches zero, or `$2A4614` reaches the generic stage-advance.
**None of those measurements proves the boss graph**, and the project has already disproved the
weaker version of the same reasoning: W313 walked 770/770 records with no `Unreached` and W314 then
showed spawning and per-frame behaviour are DIFFERENT table entries, so a type can spawn perfectly
and have nothing to run. Stage 5 even contains one type-`$00` record that legitimately appears and
frees itself on its first frame without ever becoming a visible enemy.

**Type `$B0` is not an ordinary enemy.** One script record, and W317 mislabelled it "standalone".
Its handler is about 28 bytes:

    2a4606  jsr $2A6B94        UNPORTED -- this is what owns the boss
    2a460c  jsr $25962E        ported
    2a4612  bcc $2A4622        the carry decides
    2a4614  jsr $242952        THE STAGE ADVANCE
    2a461a  jmp $263762        freeEnemy

`src/stageend.js` has documented `$2A4614` since long before stage 5 started, as **one of the five
`$242952` callers that are the five bosses** (`$292922` stage 1, `$2973A8`, `$29BE36`, `$29EF14`,
`$2A4614`). That fact and the type census lived in different files, which is why nobody joined them.

So `$B0` is a **completion GATE** and `$2A6B94` is the boss machinery. `$2A6B94` opens
`tst.w ($106,A6) / tst.b ($10E,A6) / bne $2A6F12` -- record offsets past 256 bytes and a branch
`$370` forward, i.e. a boss-sized record and a large routine.

**The trap, exactly:** port `$B0`'s 28 bytes, watch the census reach zero, watch `$242952` fire and
the stage number advance -- and no boss ever existed. Every measurement this repo currently has would
report success.

Treat `$B0` (init `$2A42D4`, handler `$2A4606`) as the stage-5 boss-route ROOT until disproven. Read
its complete init body and handler and recursively enumerate every direct call, indirect table call,
object allocation, deferred spawn, scheduler/script-VM entry and mode/loop branch. Pin concrete ROM
addresses and runtime-created object roots. **A name inferred from graphics, a stage counter moving,
or the absence of `Unreached` is not proof.**

### The conditions, researched 2026-08-11 (two agents, sources below)

This section is EXTERNAL EVIDENCE, not ROM measurement. It says what to look for and what to refuse
to implement; it does not license writing any of it without finding the code. Every number here still
needs a ROM witness.

**1-Loop mode: Hibachi has NO conditions.** He follows the stage-5 boss unconditionally and continues
are permitted. Attested by shmups.wiki, HG101, kakigames, 1cclog and a forum post, independently.

**And in 1-Loop mode the 1-5 boss gains Kouryu's SECOND FORM** -- the loop-2 boss chain is substituted
into loop 1, so 1-Loop is not "Hibachi bolted onto the normal 1-5 ending". Medium confidence, a
Japanese source plus a corroborating blog. If true it means the mode branch reaches further back than
the post-boss transition, which matters for where to look.

**2-Loop mode: the gate is evaluated at the END OF LOOP 1**, and it is an OR of three, behind two
preconditions. From Japanese Wikipedia, verbatim structure:

    REQUIRED:  no continue used  AND  no second player joined
    THEN ANY ONE OF:
      misses <= 2                        (not zero -- you may lose two ships)
      bombs used <= 3                    (not zero)
      bee-perfect on >= 3 stages         (all 10 bees in a stage, no death before that stage's boss)

Then Hibachi follows Kouryu's second form in 2-5 with **no further check**. So the owner's guess was
half right: bees are ONE of three alternatives, and it is at most two deaths rather than none.

**Explicitly NOT conditions, and refuse to implement them without ROM evidence:** a strict no-miss, a
strict no-bomb, any chain or hit minimum, "bees collected at maximum value", and any score threshold.
The 350,000,000-point route appears only in English sources and only ever flagged White Label; the
Japanese canon lists three conditions and no score.

**Contested, settle in the ROM, do not pick a side from documentation:**
* whether continues are blocked at the 2-Loop Hibachi in Black Label (sources directly conflict);
* whether rank carries across the loop boundary, and whether there are one or two rank values (one
  page implies BL resets it, another implies a live-count-derived component carries);
* whether ordinary enemy HP is loop-scaled at all -- nothing documents it either way.

**"Black Label Version B" IS NOT A DOCUMENTED DESIGNATION.** Nothing public uses it. There are three
Black Label dumps -- MAME `ddpdojblk` (`ddb10_10_8_434f.u45`), `ddpdojblka` (`ddb_1dot.u45`) and
`ddpdojblkb` (`ddb10.u45`) -- all displaying the same `2002.10.07 Black Ver`, and **no source says
what differs between them.** The `b` suffix is the likely origin of the phrase. If a wave ever needs
to know which dump this port targets, that cannot be answered from documentation and needs a binary
diff. Worth knowing before trusting any external claim about "Black Label" behaviour.

**A safety note from the research:** `tcrf.net/DoDonPachi_DaiOuJou_(Arcade)` served a page containing
embedded instructions rather than game data. Both agents hit it and both correctly ignored it and
reported it. Treat that URL as hostile; do not point tooling at it unattended.

Sources: shmups.wiki DoDonPachi_DaiOuJou and Hibachi pages, ja.wikipedia 怒首領蜂大往生,
hardcoregaming101, world-of-arcades Cave/DdpDaiOuJouBl (incl. its Hardware page), shmups.system11.org
threads 34601 / 17432 / 39713 / 49965 / 34513, kakigames, 1cclog, adb.arcadeitalia MAME set list.

**So "check the loop counter" is not enough: there is a MODE branch as well.** "Stage 5's boss and end
sequence" in any earlier work order is underspecified; it means all five of:

1. the normal stage-5 boss;
2. the post-boss route decision;
3. Hibachi in 1-Loop mode;
4. the loop transition in 2-Loop mode;
5. Hibachi after the second-loop stage-5 route.

Require a separate executable witness for each, plus Hibachi visibly drawing, carrying
cartridge-derived HP, taking multiple attack-script transitions, dying, and reaching the right
ending. A useful oracle trace starts at `$2A42D4`, logs every allocation and indirect call, and
breakpoints `$2A4606` and `$2A4614` under BOTH mode selections -- that shows whether `$B0` creates
the normal boss, launches another scheduler, branches to Hibachi, or merely observes completion.

## Work order toward the goal

### THE NEXT WAVE IS ITEM 0. Start here, do not re-derive the order.

**0. `$25DEAE` -- THE TRANSITION SCREEN'S VALUE ROWS.** This is first because it is the only
   USER-VISIBLE defect on the list: the owner reported "0's, some pictures of medals" and D30 traced
   it. W328..W330 landed the whole interactive draw (cascade, per-side header, both label pairs,
   cursor, blinking highlight; twelve tests). What remains:

   * `$25DEAE` is the **Y cursor**, structurally the same routine as the ported
     `tallyCursor25DD0C` -- same `($8,A4)` edge read, same bit 2 / bit 3 pair -- but over
     `yEntries: 3` on `($F,A5)`, so the `andi.b #$1` mask is replaced by the `$25DA94`/`$25DEAE`
     picker (up and down halves, skipping an entry the other player holds via the already-ported
     `otherSideHolds25DAEA`). Three is not a power of two, which is WHY there is a picker.
   * its TAIL holds the three remaining emit sites -- `$25DF72` (literals `D1 $5BC02600`,
     `D2 $00334224`, `D3 $0648`), `$25DFBA` and `$25DFE8` (`D2 $00334424`, `D3 $0618`) -- all
     `enqueueRegisters(ram, 26, ...)`, and bucket 26 holds TEN records of which the draw already
     uses four.
   * `tallyRequest25FF38` already writes the record the rows read. `$24018C` is NOT a new emitter.

   Every constant above is in `docs/DOCKET.md` under D30. This is a transcription.

### `$49` IS READ END TO END AND VERIFIED AGAINST THE TYPE TABLE (W334). WRITE IT.

Type table `$267824 + $49 * 8 = $267A6C` reads `0027159e 00271640`, and the body address is not a
fall-through: `spawn.js:219` computes `initBody = init + 8` (`$26361A addq.w #8,A1`), so
`$27159E + 8 = $2715A6`. `codexref` finds NO code reference to `$2715A6`, which is expected and not
a disassembly fault. Record it exactly as `$81` is recorded:

    type $49    init $27159E  (($4,A5) = 0, ONE sub-record)   initBody $2715A6   handler $271640

**THREE TRAPS, ANY ONE OF WHICH PRODUCES A WRONG `$49` (W334):**

1. **The sub prototype OVERLAPS the handler.** `loadSubProto` copies `$20` bytes from `$271624`, so
   `$271624..$271643`, and the handler starts at `$271640`. The record's `+$1C`/`+$1D` receive
   `$72 $5C` and are immediately overwritten by the init (`$2715D2`, `$2715DE`); `+$1E`/`+$1F` keep
   `$C2 $16`. The window must therefore cover `$271616..$271644` and span into code. That is legal
   and deliberate -- declare it with this note or it reads as an off-by-one.
2. **`$2716D8 tst.w $271774.l` IS DEAD. OMIT IT.** `$271774` is inside this routine; the word is
   `$41FA`, the `lea` opcode. `$2716DE subq.b` then overwrites every flag before `$2716E2 bcc` reads
   carry. Third instance in stage 5 of the ROM indexing its own instruction stream, after W326's
   `$27460A` and W332's `$25DAC2`.
3. **`$27172C neg.w D3` where D3 came from `move.l (A1),D3`.** Only the LOW word negates and there is
   no borrow into the high word, so the mirrored variant flips Y and keeps X -- then `$27172E add.l`
   lets a low-word carry reach X. A long negate would move the formation sideways.

**`($20,A5)` IS A POINTER TO A FORMATION FLAG, NOT A VALUE.** `$2715F4..$271610` picks `$8130E0` when
the scroll clock is `< $260` and `$8130E4` otherwise, stores the ADDRESS, and writes 1 through it.
Both exits clear it through the pointer: the death arm at `$27168A` and the off-screen free at
`$2716BE`. Storing the value breaks both.

**THE FIRE TABLES, MEASURED.** `($1C,A5)` steps by 4 and wraps at `$78`, so 30 steps.

    $27179C   30 LONGS, index RAW        draw sprite records, $316494 step $2A4
    $271814   30 LONGS, index RAW        packed muzzle offsets
    $27188C   30 WORDS, index ASR 1      ($17,A5) SET   -- $66 up by 6, then back down
    $271904   30 WORDS, index ASR 1      ($17,A5) CLEAR -- $9A down by 6, then back up

Two tables, one index, **two conventions**. The word values sweep out and return, so the attack is a
30-frame fan and `($17,A5)` picks the starting direction. Spawners `$2816F6` (D0 = 4), `$281764`
(D0 = `$FFFC0005`) and `$281744` (D0 = `$40003`, gated on scroll `>= $268`) are all already ported
and reachable through `shoot`.

The init body, read in full:

    27159e  move.w #$0,($4,A5) / rts            the stub -- run length ZERO
    2715a6  loadSubProto($271624)               SHORT form (first word $A000, bit 15 clear)
    2715b2  loadRecordProto($271616, 6)         D0+1 = SEVEN words
    2715c0  readInitPosition
    2715c6  cmpi.w #$1F3,$8130CE / bne          **AN EQUALITY on the scroll clock**, not a
    2715d2  ($1C,A6) = $40 ; ($17,A5) = 1       threshold -- so these two writes happen only on the
                                                exact frame the clock reads $1F3, and a port that
                                                used >= or < would do them for hundreds of frames
    2715de  ($1D,A6) = ($18,A5)
    2715e4  $81B414 = 1 ; $2715EC  $81B416 = 1  the same pair type $81's init writes
    2715f4  A0 = $8130E0
    2715fa  cmpi.w #$260,$8130CE / bcs          clock BELOW $260 keeps $8130E0 ...
    271606  A0 = $8130E4                        ... at or past it, the other word
    27160c  ($20,A5) = A0 ; $271610 (A0) = 1    store the CHOSEN POINTER, then mark it

So `($20,A5)` is a pointer the handler will use, and which of two counters it points at is decided
once, at spawn, by the clock. Two clock reads with two different comparisons, one equality and one
threshold: transcribe both as written.

**AND ITS DAMAGE ARM DOES NOT FIT `damageArm5C`.** It is the same family by mask and by clear, and
simpler:

    271640  moveq #$5C,D1 / and.b (A6),D1 / beq $271698    the sense is INVERTED (beq, not bne)
    271648  move.b #$A3,D0 / and.b D0,(A6)                 the clear via D0, not `andi.b`
    27164e  jsr $286096                                    scoreHit
    271654  D0 = ($1D,A6) ; $271658 D2 = ($19,A5) ; eor.b D2,D0
    27165e  move.b D0,($1D,A6)                             stored HERE, before the death test
    271662  tst.w ($18,A6) / bpl $27169E                   `bpl` to ALIVE, not `bmi` to death
    27166a  move.l #$250,D0                                the death arm, killScore $250

**There is NO base-palette arm, no `hpFull` compare, no `$8130CA` gate and no `cmpi.b #$19` low-HP
check.** `damageArm5C` has all four, so passing this through it would invent a palette decision the
ROM does not make. Keep it separate, and note in the `DAMAGE_5C` table that the family has a
SIMPLE member as well as its three parameterised ones.

### AND `$49`'s DEATH ARM NAMES A SHARED PREREQUISITE: PORT `$270D92` FIRST

    27166a  move.l #$250,D0 / jsr $28615E     scoreKill($250)
    271676  D2 = ($2,A6)
    27167a  lea ($27197C,PC),A1 / jsr $270D92 <-- UNPORTED
    271684  jsr $28C2DC                       the cue type $81 already posts

`$270D92` opens `move.w (A1)+,D1 / cmpi.w #-$1,D1`: a WORD-LIST WALKER terminated by `$FFFF`, taking
its list in A1 and a position in D2. And `codexref` gives it **SIX callers**:

    $270DCC  bra.s          $271390  jsr        $271680  jsr   <- type $49's death arm
    $271AC2  jsr            $271D88  jsr        $27248E  jsr

`$271AC2` is inside type `$4A` (`$271A64`) and `$271D88` is inside type `$4B` (`$271D48`). **So this
one routine is the shared death-spawn walker for the whole `$48`/`$49`/`$4A`/`$4B` band**, which is
the band W315 proved is NOT one family by prototype -- they diverge in their bodies and share this.

**PORT `$270D92` BEFORE ANY OF THEM.** It is small, it is shared six ways, and doing it first turns
three of the remaining stage-5 types from "read a death arm each" into "one call each". Doing `$49`
first instead means porting the walker inside a type wave and then finding two more callers for it.

Its list for `$49` is `$27197C`, whose first words are `0000 008D 0000 FC00 0000 0000 0000 0084` --
so the entries are not uniform and the walker's stride needs reading, not assuming.

`$49`'s alive path, also read: `$27169E` sign-extends `($2,A6)` to a LONG, adds `$4000`, and
`cmpi.l #$2000,D0 / bgt $2716CC` -- a SIGNED LONG compare, unlike the two-`addi.w` word idiom types
`$1B` and `$81` use for the same job. Do not reach for that idiom here.

### `$49` IS NOW READ END TO END. `$270D92` IS PORTED (W333). WRITE IT.

    27169e  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l D0 / addi.l #$4000,D0
    2716ac  cmpi.l #$2000,D0 / bgt $2716CC     **A SIGNED LONG COMPARE.** Not the two-`addi.w` word
                                               idiom `$1B` and `$81` use for the same job -- do not
                                               reach for it here
    2716b6  tst.b ($16,A5) / beq $2716D2       off screen and never seen -> carry on
    2716be  movea.l ($20,A5),A0 / clr.w (A0)   off screen AND seen -> **CLEAR THE COUNTER THE INIT
                                               MARKED**, then $2716C4 jmp $263762
    2716cc  move.b #$1,($16,A5)                on screen -> mark seen
    2716d2  jsr $24179E                        `scrollCompensate`, ported
    2716d8  tst.w $271774                      a ROM word, so a constant test
    2716de  subq.b #1,($1A,A5)                 the cadence

**`($20,A5)` IS A MARKER PAIR, and the init half is already read.** The init body picks `$8130E0` or
`$8130E4` by the scroll clock, stores the POINTER in `($20,A5)` and writes 1 through it; this arm
clears it on the way out. That is the same bracket-your-own-lifetime shape `$1B` has around
`$8130D8`, with a pointer instead of a fixed address -- so whichever of the two counters this type
chose at spawn is the one it releases.

Everything `$49` needs now exists: `loadSubProto`/`loadRecordProto`, `readInitPosition`,
`scrollCompensate`, `scoreHit`, `scoreKill`, `soundPost(0x28C2DC)`, and `walkDeathSpawns270D92` for
the death arm (W333). Its damage arm is the SIMPLE member of the `$5C` family -- write it inline and
do NOT route it through `damageArm5C`, which would invent a palette decision.

Windows to declare with the code: `$271616 + $E` (the 7-word record prototype) and `$271624 + ?`
(the sub prototype, SHORT form, extent from `$2637A2`); the block runs `$271616..$271640` and ends at
the handler, so one window `(0x271616, 0x002A)` covers both. Its death list `$27197C` needs one too.

### AND THE `$1F3` EQUALITY AT SPAWN SELECTS THIS TYPE'S WHOLE ATTACK PATTERN

The init's `cmpi.w #$1F3,$8130CE / bne` arm looked like a curiosity. It is the switch:

    2716e2  bcc $271774                        no borrow -> straight to the draw
    2716e6  move.b ($1B,A5),($1A,A5)           reload the cadence
    2716ec  tst.w $8130D4 / bne $271760        gated OUT while $8130D4 is set
    2716f6  lea ($271904,PC),A1                the DEFAULT fire list
    2716fc  tst.b ($17,A5) / beq $27170A
    271704  lea ($27188C,PC),A1                the ALTERNATE list
    27170a  move.w ($1C,A5),D0 / asr.w #1,D0 / adda.w D0,A1 / move.w (A1),D1
                                               a WORD from that list, indexed by ($1C,A5) HALVED
    271714  lea ($271814,PC),A1 / adda.w ($1C,A5),A1 / move.l (A1),D3
                                               and a LONG from a SECOND table, indexed UNHALVED
    271720  move.l ($2,A6),D2
    271724  tst.b ($17,A5) ...                 tested AGAIN below

**`($17,A5)` is written in exactly one place: the init body's `$2715D8`, on the arm guarded by the
`$8130CE == $1F3` equality.** So a `$49` that spawns on that one frame fires from `$27188C` and every
other `$49` fires from `$271904`. That is why the equality matters and why reading it as a threshold
would give every instance the alternate pattern.

**Two tables, two index conventions, one index.** `($1C,A5)` is halved for the word table at
`$271904`/`$27188C` and used RAW for the long table at `$271814`. Transcribe both; a shared helper
that halved once would put the long table's reads on the wrong entries.

Still unread: `$271724` onward (the fire itself), `$271760`, and `$271774` (the draw).

**Then, in order:** the real `$81` is DONE (W326), so stage 5 is at **ten types over 29 records**.
`$1A` is BLOCKED on a measurement (see below). Next unblocked: `$49`/`$4A`/`$4B` (spans `$A2`,
`$B6`, `$B6`), then `$47` (`$E2`), then the dependency bundles, `$4C` last. Then stage 5's boss, then
the HIBACHI CLOSURE RULE, then the loops.

1. **STAGE 5'S REMAINING TWELVE TYPES.** W316 took `$45` (21 records), W317 `$59`, W319 `$8E` -- so
   the census is **twelve types over 37 records**, pinned with every address in
   `tests/w314stage5scope.test.js`.

   **Do not order them by record count.** W317 scanned for the three deferred-spawn entry points and
   found four of them pull in an UNPORTED CHILD TYPE:

       $55 before $46      $54 before $48      $44 before $43
       $4E, $50, $52 and $58 before $4C     <- four children; leave $4C last

   So "twelve left" understates it: those twelve expose seven more child types, at least nineteen
   handler types before anything found deeper.

   **`$1B` IS DONE (W323).** The census is now **ELEVEN types over 32 records**. The order from
   here is **`$1A` (4 records) then `$81` (3)**, then `$49`/`$4A`/`$4B`, then `$47`, then the
   bundles, leaving `$4C` last.

   ### `$1A` IS BLOCKED ON REGISTER PROVENANCE -- DO NOT START THERE

   **W325 corrects W324's "it should be cheap".** Reading past the init body's opening found:

       268d7e  movem.w ($2,A6),D0-D1        D0 = X, D1 = Y
       268d84  addi.w #$B00,D0
       268d88  addi.w #$0,D1                a no-op add that is IN THE LISTING
       268d8c  jsr $24203E                  <-- THE BLOCKER
       268d92  bcc $268D98                  and it branches on the CARRY
       268d94  move.b ($1B,A6),D1           the carry arm: use the record's own angle

   `$24203E` is `aim.js`'s `core64` and it is **PURE**: `move.w #$1800,D4 / add.w D4,D0..D3`, self
   in D0/D1 and **target in D2/D3**. Type `$1A` never sets D2 or D3 -- D2 is a stage byte from
   `$268D4C` and D3 is untouched -- and `$263808` does not set them either (it reads `($12,A5)`,
   tests bits and writes `($2,A6)`).

   So the aimed angle depends on **whatever the enemy init dispatcher left in D2/D3**, and the
   `bcc` depends on a carry out of the core's own internal arithmetic. Both are answerable only by
   measuring the dispatcher's register state at `$268D8C`. **This is the same class of blocker as
   `$280252`, which W288 left pending "measuring A0 at `$28029A`", and it must be measured rather
   than guessed** -- an invented target would put every one of this type's shots in a plausible
   wrong direction, which no record count would show.

   The rest of `$1A` is read and recorded below; only the aim is blocked.

   The init body, for the wave that measures D2/D3 and then writes it:

       268d1e  move.w #$1,($4,A5) / rts            the init STUB, identical shape to $1B's
       268d26  lea ($268DFA,PC),A0 / jsr $2637A2 / move.l A0,($44,A5)
                                                   the SAME ($44,A5) table-advance idiom
       268d36  lea ($268DDC,PC),A0 / moveq #$E,D0 / jsr $26377A
                                                   15 words, the SAME count as $1B
       268d44  D0 = 4, D1 = 4, D2 = 2; `cmpi.w #$1,$813092 / bls` keeps them on stages 0 AND 1,
               and stage 2 on takes 3, 6, 1  <- THREE bytes here, and D1 is 6, NOT 0
       268d66  ($2A,A5) = D0 ; ($2B,A5) = D1 ; ($30,A6) = D2   -- different offsets from $1B's,
               and the third one lands on the SUB-RECORD (A6) rather than the record
       268d72  jsr $263808                         a JSR, not $1B's tail JMP: more follows it
       268d78  lea $272C7A,A0                      and $272C7A + $80 is ALREADY A WINDOW

   ### AND READ THE TYPE TABLE WITH BOTH BASES -- W325 GOT THIS WRONG AND LOST A WAVE

   There are TWO tables: **`$267824` for types `$00..$7F` and `$27E412` for `$80..$FF`**, indexed
   by `(t & $7F) * 8`. `tests/w314stage5scope.test.js typeEntry` is the correct form; copy it:

       const tab = t < 0x80 ? TYPE_LO : TYPE_HI;
       const off = (t & 0x7f) * SPAWN.TYPE_STRIDE;

   W325 copied the MASK and not the BASE (`0x267824 + (t & 0x7f) * 8`), so asking for `$81` got
   entry 1 of the low table and it translated **type `$01`** instead. The code it wrote is fine and
   is committed, but it is not one of stage 5's eleven and the census did not move.

   **The thing that caught it was the census refusing to move**, not the suite: 2334 tests went
   green and `enemy_types` rose 81 -> 82, while `w314stage5scope.test.js` still said ELEVEN types
   over 32 records. A wave that ports one of the eleven MUST move that number. If it does not,
   suspect the wave before the test -- `enemyHandlerMap` is built from the port's own
   `handlerMap()`, so it does see new registrations.

   Spans from the type table (correctly read): `$1A` $14E, the REAL `$81` at `$273F06`/`$274076`,
   `$49` $A2, `$4A` $B6, `$4B` $B6, `$47` $E2.

   Next, in order: **the real `$81`** (3 records), then `$49`/`$4A`/`$4B`, then `$47`, then the
   dependency bundles, leaving `$4C` last. `$1A` re-enters the queue once D2/D3 are measured.

   ### THE REAL `$81` (`$273F06`/`$274076`): ITS INIT BODY IS READ, AND IT IS CLEAN

   W325 read `$273F0E..$273FE2` completely. **Unlike `$1A` it is not blocked**: it aims through
   `$24200A`, which is `aim64FromCaller` -- the entry that does its OWN `targetSelect` and returns
   a real carry -- rather than `$1A`'s raw `$24203E` core with unset D2/D3. That difference is the
   whole reason this one is next and `$1A` is not.

       273f0e  lea ($274004,PC),A0 / jsr $2637A2 / move.l A0,($44,A5)
                                          the ($44,A5) advance idiom, as $1A/$1B/$9F
       273f1e  lea ($273FEE,PC),A0 / moveq #$A,D0 / jsr $26377A     D0+1 = ELEVEN words
       273f2c  jsr $263808                readInitPosition -- a jsr, more follows
       273f32  lea $272DFA,A2             **ALREADY INSIDE the $272D70 + $190 window**
       -- BLOCK 1 --
       273f38  movem.w ($2,A6),D0-D1 ; D0 += $5C0 ; D1 += $A40
       273f46  jsr $24200A                aim64FromCaller: self from the CALLER, target selected
       273f4c  bcc +4 ; else D1 = ($1B,A6)   NO live player -> fall back to the record's angle
       273f52  ($2B,A6) = D1 ; D1 &= $3E ; D1 += D1 ; ($26,A6) = (A2,D1.w)
       -- BLOCK 2, the same nine instructions with two constants and two offsets changed --
       273f62  movem.w ($2,A6),D0-D1 ; D0 += $5C0 ; D1 += -$A00   (`addi.w #$F600`)
       273f70  jsr $24200A ; bcc ; else D1 = ($1B,A6)
       273f7c  ($31,A6) = D1 ; D1 &= $3E ; D1 += D1 ; ($2C,A6) = (A2,D1.w)
       -- the rest --
       273f8c  D0 = $10, D1 = $8 ; `cmpi.w #$1,$813092 / bls` -- and **BOTH ARMS WRITE $10/$8**,
               so it is $10/$8 on every stage. Same shape W319 found in type $8E; transcribe the
               branch, not the constant, and say why
       273fa6  ($28,A5) = $10 ; ($29,A5) = $8
       273fae  ($1E,A5) -= $8130B0        a RANK adjustment, and it is a BYTE subtract on a word read
       273fb8  $813094 (stage index DOUBLED) indexes $273FE4:
               ($1D,A6) = byte[0] ; ($1C,A5) = byte[0] ; ($1D,A5) = byte[1]
               -- note ($1D,A6) and ($1C,A5) BOTH take byte 0: `move.b (A0),($1D,A6)` does not
               post-increment and the two `(A0)+` after it do
       273fd2  $81B414 = 1 ; $273FDA  $81B416 = 1

   **AND ITS STAGE ROWS ARE NOT ALL THE SAME**, unlike `$1A`'s and `$1B`'s. Read from the image:

       $273FE4:  11 0E  11 0E  11 0E  11 0E  0D 12
                 stages 0..3 identical, and **STAGE 5 (index 4) DIFFERS**

   So here the indexed read matters for real, and stage 5 is precisely the stage this type appears
   in. A port that folded the row to a constant would use the wrong pair in the only stage that
   spawns it.

   Data extents, all pinned by code: the stage rows `$273FE4 + $A`, the 11-word record prototype
   `$273FEE + $16`, and the sub prototype from `$274004` (SHORT form -- its first word is `A001`
   with bit 15 clear). The whole block runs `$273FE4..$274076` and ends at the handler, so **one
   window `(0x273FE4, 0x0092)`** covers it. Nothing in `$273xxx` currently reaches it: the nearest
   is `$2735F0 + $220`, which ends at `$273810`.

   #### AND ITS HANDLER'S STRUCTURE IS READ TOO -- `$274076..$274116`

   It is `$1B`'s shape, which is what makes it the right next wave:

       274076  jsr $2638A6                stepMovement
       27407c  an INLINE bounds test, TWO separate addi.w (#$E00 then #$7A00) with the branch on
               the SECOND -- the same idiom as $1B's #$C00/#$7800, and the same trap: folding
               them into one add tests a different quantity. NOTE it does NOT decrement $8130D8
               on the free path; that refcount is $1B's, not a family convention
       27408a  off screen and ($16,A5) set -> jmp $263762 ; $274098 on screen -> ($16,A5) = 1
       -- THE ARMOUR TIMER, and this type's one genuinely new mechanism --
       27409e  tst.w ($2A,A5) / bmi -> skip
       2740a4  ($18,A6) = $7FFF          HP PINNED AT MAX while the timer runs
       2740aa  D0 = 1 ; tst.w $811F72 / bpl ; else D0 = 2
       2740b6  ($2A,A5) -= D0            **the drain is DOUBLE while $811F72 is negative**
       2740ba  on the borrow, ($18,A6) = $2600   the real HP once the armour is gone
       -- the damage arm --
       2740c2  `damageArm5C` with hpFull **$980**, base ($1C,A5), xor ($1D,A5) -- see the table
               above that routine: this is its THIRD member and it shares $1B's field offsets
       274102  bmi $27449C               the death arm
       274106  ($1D,A6) = D0 ; jsr $28AC72 (`spawnCues28AC72`)
       274110  tst.L $8130D2 / bne $27432C   the LONGWORD freeze -> straight to the draw

   **`$811F72` is the BEAM word.** `spark.js` already reads `$811F73` bit 7 (`ram.btst8(0x811f73, 7)`)
   to pick the pool half, so this is the same word tested as a sign. Meaning: **the laser strips
   this type's armour twice as fast as shots do**, which is a real gameplay behaviour and the kind
   of thing worth a test rather than a comment.

   #### AND ITS STATE MACHINE, TO STATE 2 -- ANOTHER MEMBER OF THE `$45`/`$1B` RAMP FAMILY

   The state word is **`($38,A6)`**, on the SUB-RECORD, where `$1B` uses `($18,A5)` on the record.
   Read it as a word and write it as a word, as everywhere else in this family.

       27411a  cmpi.w #$1000,($2,A6) / blt $274286     below the fire X -> just draw
       274124  move.w ($38,A6),D0 / bne                the dispatch
       -- STATE 0 --
       27412a  ($1E,A5) cadence ; on borrow ($1E,A5) = ($28,A5) -- the $10 the init body wrote --
               and ($38,A6) = 1                                                     -> state 1
       -- STATE 1, the RAMP UP --
       274148  ($3A,A6)/($3B,A6) cadence
       274156  ($36,A6) += 4 ; indexes $27460A -> ($32,A6) ; at index $14 -> ($38,A6) = 2
               **SIX entries** (0,4,8,$C,$10,$14), where $1B's ramp has eight and clamps at $1C
       -- STATE 2, and it does NOT ramp to a clamp: it LOOPS --
       274184  ($3A,A6)/($3B,A6) cadence
       274190  ($36,A6) += 4 ; **if it reaches $18 it is reset to $10**, so the animation
               oscillates over the last two entries instead of stopping. That wrap is the
               difference from $1B's state 3, which walks back DOWN to zero
       2741a2  ($36,A6) indexes the table again ...

   So this is a fourth member of the `$45`/`$1B` ramp family (delay, ramp up, act) with a LOOPING
   tail rather than a ramp-down one. Worth noting for the shared-driver question W323 raised: the
   members now differ in the state field, the table, the entry count AND the tail behaviour, which
   argues for keeping them as separate transcriptions a while longer.

   #### STATE 2's FIRE ARM IS COMPLETE, AND IT SETTLES THE `$1A` QUESTION

       2741a2  ($36,A6) indexes $27460A -> ($32,A6)      the sprite, every frame
       2741b2  ($1E,A5) cadence ; on borrow reload from ($28,A5)
       2741c0  lea $8103E6,A0 / lea $810448,A1 / tst.b ($3,A5) / exg A0,A1
               **the SAME "pick the nearer live player" idiom `handler8E` uses** (W319's
               $27655C..$276578): `($3,A5)` decides which is TRIED first
       2741d4  tst.w (A0) / bmi -> use it ; else tst.w (A1) / bpl -> NOBODY ALIVE, skip to $27423C
               ; else exg and use the second. A negative status word is a LIVE player
       2741e2  movem.w ($2,A0),D2-D3     **the TARGET, out of the selected player's record**
       2741e8  movem.w ($2,A6),D0-D1     self ; D0 += -$880
       2741f2  jsr $2422A2               `aim256` -- the PURE core, and D2/D3 ARE SET
       2741f8  D6 = D1                   the aimed direction, saved
       2741fa  D2 = ($2,A6) ; D3 = $F7800380 ; D4 = 0 ; D0 = $FFFD0005
       27420c  D1 += $A  ; jsr $281764   FIRE
       274216  D1 -= $14 ; jsr $281764   FIRE again -- net -$A the other side of the aim
       274220  D3 = $F780FC80            a SECOND muzzle, and the pair repeats

   So it is a symmetric pair off the aim from each of two muzzles. `$281764` is already driven by
   `boss3.js` through `shoot(...)`, and `$2422A2` is `aim.js`'s `aim256`. Nothing new needed.

   **AND THIS IS THE CONTRAST THAT MAKES `$1A`'s BLOCKER REAL.** Both types call a PURE aim core.
   `$81` sets D2/D3 from the selected player's record immediately before the call, three
   instructions away. `$1A` calls `$24203E` with D2/D3 never set at all -- D2 holds a stage byte and
   D3 is untouched. So the anomaly is `$1A`'s and not a convention this family shares, which is
   worth knowing before someone assumes the dispatcher must be pre-loading them: the sibling that
   does the same thing properly is right here.

   #### THE VOLLEY TAIL AND STATE 3: THE CYCLE CLOSES, 0 -> 1 -> 2 -> 3 -> 0

       -- after the four shots, and ALSO the arm reached when nobody is alive ($27423C) --
       27423c  ($20,A5) volley counter ; on borrow reload from ($21,A5)
       274248  D0 = $40 - $8130B6 ; ($1E,A5) = D0
               **the RANK-shortened cadence**, the same idiom as $8E's `$276602 move.w #$40,D0 /
               sub.w $8130BA,D0` -- a different rank byte, the same construction
       274256  ($38,A6) = 3                                                          -> state 3
       -- STATE 3, the RAMP DOWN --
       27425e  ($3A,A6)/($3B,A6) cadence
       27426a  ($36,A6) -= 4 ; **on the BORROW `clr.w ($38,A6)`**                     -> state 0
       274276  otherwise index $27460A again and carry on down

   So the machine is a closed four-state cycle: delay, ramp up to `$14`, loop `$10..$14` while
   firing rank-paced volleys, ramp down, repeat. `$1B`'s is the same four states with a ramp-down
   that walks to zero; `$45`'s is the same again on a different field. **Four members now**, and
   they differ in the state field, the table, the entry count, the tail and the cadence source --
   which is the argument for four transcriptions rather than one driver, recorded so the question
   does not get reopened from scratch.

   **`$274286` IS NOT THE DRAW.** It is a further cadence -- `subq.b #1,($26,A5) / bcc $27432C`,
   reloading from `($27,A5)` -- and `$27432C` is where the draw actually begins. So there is one
   more animation/behaviour block at `$274292..$27432C` between the state machine and the emit.

   #### THE PRE-DRAW BLOCK AND THE DEATH ARM -- THE MAP IS COMPLETE

       -- $274294, the SPRITE-FACING update, and it is $8E's shape again --
       274294  move.b ($24,A5),D0 / cmp.b ($25,A5),D0 / bne $27432C
               a two-byte EQUALITY gate before the work, exactly as $8E's
               `$276552 cmp.b ($1C,A5),($1D,A5) / bne` gates its own facing update
       2742a0  lea $8103E6,A0 ... the player-select idiom a SECOND time in this handler
       -- $27449C, the DEATH ARM --
       27449c  move.l #$271,D0 / jsr $28615E     `scoreKill` -- note a move.l, not a moveq
       2744a8  jsr $28C2DC                       a KNOWN cue: `ctx.soundPost?.(0x28c2dc)`,
                                                 already used at handlers.js:2828 ("BGM id=5,
                                                 death burst") and in boss4.js
       2744ae  moveq #$D,D0 / jsr $289004        the canonical family shape, kind $D
       2744b6  ($2,A0) = ($2,A6) ; ($1E,A0) = $10 ; ... the SEVEN writes, as $1B's death arm

   **So the whole handler is mapped and it needs NOT ONE NEW PRIMITIVE.** Everything it calls is in
   the port: `stepMovement`, the inline bounds idiom, `damageArm5C` (as its third caller),
   `spawnCues28AC72`, `aim256`, `$281764` via `shoot`, the player-select idiom (twice),
   `scoreKill`, `soundPost(0x28C2DC)`, `spawnEffect` at kind `$D`, and `enqueue*ThroughStub`.

   Constants to carry in: `killScore` **`$271`** (a `move.l`), `deathCue` `$28C2DC`, `hpFull`
   `$980`, armour HP `$7FFF` and post-armour HP `$2600`, the fire gate X `$1000`, the ramp clamp
   `$14` with the wrap `$18 -> $10`, the aim bias `-$880`, the muzzles `$F7800380` and `$F780FC80`,
   the spread `+$A` then `-$14`, `D0 = $FFFD0005`, and the rank cadence `$40 - $8130B6`.

   Windows: **`(0x273FE4, 0x0092)`** and **`(0x27460A, 0x0018)`**, both bounded by code.

   #### THE DRAW, `$27432C` -- AND THE MAP IS NOW 100 PERCENT

       27432c  jsr $23D852               the RECORD-convention emitter, **bucket 7** -- the
                                         damage-first family's own, which W80 resolved out of the
                                         cartridge (`$23D852 41F9 00807450 / D0F9 0080AFC8`)
       274332  D1 = ($2,A6) with -$500 on one half and -$C00 on the other, applied around a `swap`
       274342  D2 = ($32,A6)             the ramped sprite the state machine installed
       274346  D3 = $428 ; D4 = ($1C,A6)
       27434e  jsr $23DF86               the REGISTER-convention emitter, **also bucket 7** (arm A;
                                         `handlers.test.js` names it `EMIT_A`)
       274354  D1 = ($2,A6) ...          and a second register emit follows

   So the draw drives ONE bucket through BOTH conventions, the same structure `$1B`'s draw has with
   bucket 3. Both stubs are already in the port.

   **NOTHING IS UNREAD. THIS TYPE IS READY TO WRITE, BOTH HALVES IN ONE WAVE.**

   #### AND WRITE BOTH HALVES TOGETHER -- W326 STARTED THE INIT BODY AND REVERTED IT

   W326 wrote and verified the init body (`BODY.set(0x273f0e, ...)`, bodies 75 -> 76, module loads
   clean) and then **reverted it**, because registering an init body whose handler is not yet
   registered is the W322 mistake: `$81` HAS three records in stage 5's script, so the body would
   run and the handler lookup at `$274076` would then fail. Type `$01` was safe to land alone only
   because no script spawns it.

   The init body's transcription, for the wave that lands both, since it was written once already:

   * `loadSubProto(0x274004)` with the advanced pointer into `($44,A5)`;
     `loadRecordProto(0x273fee, 0x0a)` = 11 words; `readInitPosition` (a JSR).
   * The two aim blocks as a two-row table -- `{biasY: $5C0, biasX: $A40, angleOff: $2B,
     longOff: $26}` and `{biasY: $5C0, biasX: -$A00, angleOff: $31, longOff: $2C}` -- each
     `aim64FromCaller`, and **on carry the angle is `($1B,A6)`, a VALUE fallback and not a branch
     around the work**. The table index is `(d1 & $3E) * 2` into `$272DFA`.
   * `($28,A5) = $10`, `($29,A5) = $8` (both stage arms agree), the byte-subtract rank adjustment
     `($1E,A5) -= $8130B0`, then the stage row where `($1D,A6)` and `($1C,A5)` BOTH take byte 0.
   * `$81B414 = 1` and `$81B416 = 1`.
   * An `AimTables` WeakMap keyed on the ROM, as this file's other five per-type maps do.

   #### THE RAMP TABLE'S EXTENT IS PINNED BY CODE, AND IT EXPLAINS THE WRAP

   Read from the image at `$27460A`:

       [00] $001732E0   [04] $00173334   [08] $00173388   [0C] $001733DC
       [10] $00173430   [14] $00173484   [18] $3B7C0001   <- CODE, `move.w #$1,...`

   Six `$0017xxxx` sprite descriptors ascending by exactly `$54`, and then **index `$18` is an
   INSTRUCTION**. So state 2's `cmpi.w #$18 / move.w #$10` wrap is not a stylistic choice: it is
   what stops the ROM indexing into its own code, and the table is exactly six longwords with its
   far end bounded by code rather than by a count.

   That also settles the window: **`(0x27460A, 0x0018)`**, plus **`(0x273FE4, 0x0092)`** for the
   prototypes and stage rows. Two windows, both extents pinned by code on the far side.

   A port that ramped one entry further would emit an address built from `$3B7C0001` -- so this is
   a case where the guard IS the semantics, and it needs the `unreached` treatment if the index can
   ever arrive out of range.

   ### W322 CLAIMED `$1B` WAS BLOCKED ON `$24226E`. IT IS NOT, AND THE WAY THAT ERROR HAPPENED IS
   ### THE MOST REUSABLE THING IN THIS SECTION

   W322 read `$2694DA jsr $24226E` in `$1B`'s state-2 fire arm, searched for it, found it only in
   `aim.js`'s `AIM_REFS` reference-count map, and concluded it was unported. **It is ported**, as
   `aim256FromCaller`, whose docstring is literally `` `$24226E` -- aim256 at the record's target,
   self from the CALLER. 48 sites. ``

   The search that produced the wrong answer was `grep 24226e src/*.js` with the `AIM_REFS` line
   filtered out. It missed the implementation because **`AIM_REFS` spells the address `0x24226e` in
   lowercase while every docstring spells it `$24226E` in uppercase.** Filtering out the one hit
   removed the only lowercase occurrence and left the real one invisible to that pattern.

   This repo already had the rule written down -- "`grep 0x2xxxxx` is NOT a test for 'is this
   ported'; this project names routines after their addresses and cites them as `$2xxxxx` in prose"
   -- and W322 quoted W318 for it in the same breath as getting it wrong. So:

   **To decide whether `$2xxxxxx` is ported, grep CASE-INSENSITIVELY for the bare hex digits and
   read every hit, including comments and docstrings.** `grep -ri "24226e"` finds it. Never filter
   hits out of that search before reading them: in this repo the prose IS where the answer lives.

   `git log -S` on the address and a look at the owning module's export list are the two
   confirmations worth adding when the answer matters.

   **Add a type's ROM windows in the SAME wave as its code, never ahead of it.** W321 established
   why: windows change `player.tables.json`, which changes the asset bytes, which repacks the sprite
   shards, which moves the web gate's shard-filtered record counts. Windows for code that is not
   there can turn the gate red for nothing.

   **`$B0` is NOT in this queue.** It is the head of boss reconnaissance; see HIBACHI CLOSURE RULE
   above.

1b. **THE NAME-ENTRY CHARACTER GRID** -- superseded by W307/W311 except for the two panel draws,
   which are gated on `$23E45A`. Kept below for the emitter's description:
   - `$28FCAA..$28FD2A` -- the cursor/grid draw. Straight-line `jsr $23DECE` calls built from
     immediates, the same shape as `$25B4D6` which W303 ported, so it is a transcription and not
     a puzzle. Gated on `($2E,A4)` being non-zero at `$28F4C4`.
   - `$28FD2C` and `$28FD6E` -- two entry points sharing a tail that ends at `$28FE0E`, and they
     differ only in the first immediate (`$4E800C80` vs `$4E802B80`). Called from
     `$28F4E0`/`$28F4EE`, and only when **exactly one** side owes a name: `cmpi.b #$3,D0 / beq`
     skips both when both sides do.
   - `$28F4A6` sets `($2E,A4) = 1` and `$81E0D6 = 1`, then `jsr $246410` with `$28FA98`. That
     call is the anim driver `stageend.js` declares out of scope, so **count it, do not invent
     it** -- `PRESENTATION_DEVIATION[0x28d6fc]` is the precedent.
   - `$28F664 add.w D1,D1 / move.l D0,(A0,D1.w)` is the per-character commit, and `($16,A4)` is
     the count W306's filter gates on. `$81E0D6` is tested by both arms at `$28F442`/`$28F49C`.

   Do NOT go looking for a reader of `($C,A4)`: `$81B42C`/`$81B43C` have zero absolute
   references and W302 lost a search there. The row is found by its tag.

1b. **PUBLISH, then ask the owner to look again at D16 and D17.** This is the cheapest
   next move for the docket and it is D19's whole point. **It is outward-facing and D18 does
   not cover it** ("`git push` is not `tools/publish.mjs`"), so it needs the owner's
   go-ahead; every wave so far has raised it and left it unrun.

   W285 settled D17's mechanism with one measurement: drive `$276744`'s two death
   conditions on a live type-`$8A` carrier mid-run and the reserved ten goes 0 -> 1 the
   next frame. **The medal appears.** So the chain is complete on `main`, and the reason
   it was never seen is that no scenario in the tree kills a carrier.

   Six docket items have been closed since the last deploy and THREE of them turned out
   to be things that already worked. So:

       node games/ddpdoj/tools/export-web.mjs      # FIRST -- this session added windows
       node tools/publish.mjs

   **`export-web.mjs` before `publish.mjs`, always** -- a wave that adds ROM windows and
   publishes without regenerating serves a stale bundle. `publish.mjs` gates on the
   Batman suite being ALL GREEN with 0 skipped, builds `dist/`, deploys, and then
   CONFIRMS the build id landed on several consecutive polls.
2. **MEASURE A0 AT `$28029A`, then port `$280252`.** W288 read the whole body and
   **backed a finished transcription out** rather than ship it, for one reason:

       242290: bsr $24270A              the target select -- SETS A0
       242294: bcs $242264
       242296: movem.w ($2,A0),D2-D3    <- the entry point these bodies use

   Eight sites enter `$242296` directly, skipping the `bsr` that sets A0, and all eight
   are in this family (indices 8..11). But `$27F990 movea.l (A0),A0 / jsr (A0)` leaves
   **A0 = the body's own address**, and nothing on the not-collected path changes it --
   so taken literally the pickup would chase coordinates made of its own opcodes.

   Three possibilities, all testable and only one true: the driver differs from that
   reading; something between `$27F992` and `$28029A` sets A0; or the family really does
   read its own code. **The oracle can answer this and reasoning cannot** -- `w69`'s
   ladders carry full RAM but not registers, so it wants a register capture at a
   breakpoint.

   Two things W288 established that survive regardless: `($24,A6)` is the player record
   W287's finish family writes (the body frees itself when that player's bit 15 goes, so
   the two waves confirm each other), and the draw gate has **two different** exemptions
   from the half rate -- a quiet pool draws everything, and a busy pool still draws a
   pickup within `$600` of its OWNER, so the sprite about to be collected keeps full
   frame rate.
3. **`$280BCE`'s finish routines**, or enough of them to drive a run past frame 6482.
   A long census run from the laser-hold rung throws `Unreached $280BCE` there --
   seventeen of its twenty finish routines are unported, already docketed under D3's
   neighbourhood -- and **that is what stands between the port and observing the whole
   item chain through to a boss part death.**
3. **D17 background, kept for the next reader.** The tally IS reachable (`$8130F9` bit 2 has a writer
   at `src/stageend.js:735`), so the gap is upstream: the medal item, its spawn, or its
   art. `src/bee.js` (W111) says "the medal IS the bee"; `src/hud.js` (W124) has the
   accumulator and the tier drain. Sweep what the medal pool emits during play.
4. **`$25DEAE` AND `$25E0EA`**, the last of state 1 of object `[11]`, then wire state 1
   up and delete its note. W277 landed `$25FF38`/`$25D9E6`/`$25DA60` and W278 landed
   `$25DAEA`, `$25DFF6` and the input read `$23D186`/`$23D18E` -- all in
   `src/tallyscreen.js`.
   - `$25DEAE` is fully read EXCEPT its draw tail from `$25DF4C` (which loads
     `D1 = $5BC00000` for side 0 and `$5BC02600` for side 1). `$28C6FA` and `$28C6E0`
     are sounds and stay counted. **Its tail at `$25DF48 bra $25DB7C` is how the screen
     enters the tally**, and NOTHING ever writes `($2,A5) = 2` -- that branch skips the
     dispatcher, which is why `screenState2_25DB7C` is exported separately. Do not
     "fix" the dispatcher to set the state byte.
   - `$25E0EA` is `lea ($25E006,PC),A0 / bra $25E200`, and `$25E006` is a run of `$20`
     bytes -- ASCII SPACES -- so it is a text blit. Needs that text's extent measured
     and `$25E200` read.

   State 1 also installs a palette from `$225978`: run
   `node tools/export-web.mjs --extent 0x225978` first. The state-1 note in
   `tallyScreen25DBB4` names all six and is now five names too long -- trim it.
5. **THE NINE BONUS LINES AT `$25FF52`** -- the score tally's actual arithmetic, and
   the largest single thing left in that subsystem. **The table is already windowed**
   (`$25FF52+$28`, W279, far end pinned by `$25FF7A`'s own `lea $8130FA,A6`): TEN
   longwords, entry 0 null and guarded by `$25FF84 cmpi.w #$0,D0 / beq`, then
   `$25FFA8`, `$260056`, `$26010E`, `$2601F4`, `$2602B6`, `$260348`, `$26035A`,
   `$26037C`, `$2603B0` -- **NINE lines, not the eight worklog 270 counted.**
   `$25FF7A` is the per-frame driver: it walks BOTH records at stride `$24` with
   `moveq #$1,D7 / dbra`, and `$25FF92` is the only reader of the table. Until these
   land the tally RUNS and its rows PAINT but the figures are not the cartridge's.
6. **The menu cursor, `$25DD0C`.** `btst #$2,D0` decrements `($e,A5)` and `btst #$3,D0`
   increments it, each with `move.b #$1,($d,A5)` and a `$28C6FA` sound, and
   `andi.b #$1,($e,A5)` keeps it to two entries. **D0 comes from `($8,A4)`** -- one of
   the descriptor's three code pointers (`$23D186` for side 0, `$23D18E` for side 1) --
   so that routine is the input read and has to land first. W276's window
   `$25D952+$3E` already covers both descriptors.
7. **The four other announcement-poster caller regions** -- `$25CDxx`, `$25D5xx`,
   `$2601xx`, `$288A02` -- which share the protocol W270 landed.
8. **WHAT ADVANCES `($14,A6)` THROUGH `$255B7C`.** W275 ported the walker and shipped
   all 49 of its descriptors, but only entries 0..5 of the 39-entry pointer table are
   KNOWN to be reached, because only `$24A120`'s write of `$255B7C` is transcribed.
   The port already walks entry 1 during a real death, so **the advance exists and is
   being done by code this port runs without a name for it.** Find the writer and the
   other 32 frames get their trigger. `rosetta.py codexref 255B7C` is the way in, and
   the art is already in the bundle so the fix is code-only.

### A rule this session paid for twice

Two claims went in wrong and both were ABSENCES: "nothing sets this bit" (W272) and
"nothing calls this block" (W273's diagnosis). Each came from a scan whose base or
range was not checked against the instrument that already existed.

**`tools/rosetta.py codexref <addr>` is the instrument.** It handles all six
encodings that carry a code address, including `jsr (d16,PC)`, and has since it was
written. `tools/hard/absxref.py` is NOT a caller xref -- it histograms operands
landing in MAIN RAM, so it cannot see a reference to a ROM block at all.

**The image `rip/sound/maincpu.bin` is OFFSET-ADDRESSED: file offset IS the 68000
address.** Build B is `$200000..$2B0000`. W272 scanned it with a base of `$200000`
and read the wrong bytes. When a hand-rolled scan returns zero, first check it finds
something you already know is there -- `u16($2600D8) == $48E7` is that habit written
down, and `tests/w274paletteset.test.js` now runs the whole audit every suite pass.
9. **The rest of D11's transition presentation.** `$28C186` the exit handshake and
   `$28D6FC` the animation chain. `$28D77C` writes palette RAM the port does not
   model and the four `$25FD38` resets are W62's scope line, so those two stay
   counted. Force `$242952` headlessly and read the counted gaps -- that measurement
   is what scoped W232 and it is still the right way in. The remainder is the
   animation-object EXECUTION ENGINE, the per-frame machine that walks the `$810346`
   chain and decrements each node's `$18`; the way in is the node code pointers at
   `$24627A`, NOT the chain root `$810346`, whose six references are all loaders or
   the clear. `$28C186` is a BGM command and correctly a counted sound gap.
10. **Stage 5, then the loops.** Nothing blocks this any more: the Stage-4 boss is
   complete for every reachable path and the docket is down to one item. Five
   loop-specific rules are translated so far; see the loop-2 bullet above.

## Comment drift found and deliberately not fixed

`src/type5.js`'s header still says `$24C096` is "ONE OF THE 22 THIS FILE COUNTS AND
DOES NOT RUN" and that the port throws on the fourth consecutive held-fire frame.
`src/options.js` ports that object and W272 measured the ramp running and landing on
the board's own value. Comment only, no behaviour. Fix it in a wave that touches
`type5.js` for another reason.

D8, D10 and D12 are presentation or documentation and can be slotted in between.

## Verification commands

- One slice: `node --test games/ddpdoj/tests/<the focused file>.test.js`
- Full suite: `node --test games/ddpdoj/tests/` -- currently 1806/1806, green.
  Keep it that way: W229 had to close five censuses that had been red since the
  Stage-4 waves, and while they were red they could not catch anything. Do not
  pipe the run through `tail`; that discards the failure detail.
- The sprite question: `node games/ddpdoj/tools/w230descriptorsweep.mjs`, which
  reports every descriptor the port draws that the bundle cannot resolve, plus the
  display-list drops and the counted gaps. Currently zero missing.
- After any change to `tools/export-tables.py`, run `python export-tables.py`,
  and run `node export-web.mjs` before any publish so the site does not serve
  stale assets.

## Timing and fidelity traps already resolved

Stage-4 boss (W224), all proved by `w224stage4boss.test.js`:

- F1 INIT falls through into STEP and spends its initial word timer tick, so
  state 0 fires on the following boss pass.
- F1's state checks are sequential, so a promoted state spends its newly written
  timer in the same call.
- `$2596C6` walks A4 before A0 before A1 before A3, and A2 last. So F1 starts
  MAIN2 in the same walk, MAIN3 starts D0 in the same walk, and MAIN3's A4 id5
  would begin on the following pass.
- D0 INIT falls through, changing timer `$0202` to byte 1 on its first call while
  object 6 draws cursor row 0 in that same pass. It then advances `+$106` by 4
  every third call and terminates on exact equality with `$003C`.
- The Stage-4 boss linked main-hit damage aggregation uses the maximum damage
  delta, not the sum or minimum.

Stage-4 boss second phase (W246..W252):

- **EVERY INIT IN THIS BOSS FALLS THROUGH INTO ITS STEP.** F5, MAIN4, MAIN7, all six
  A3 ramps, and A1 6, 7, 8, 9 and 10 -- checked one by one against the image, not
  assumed. Worklog 244's spec claimed F5's did not, and it does.
- **The old-zero borrow caught a prediction in four separate waves.** `subq.b #1 / bcc`
  reloads on the frame the counter was ALREADY zero. So a reload value of 1 fires every
  SECOND frame (a ramp of n steps takes 2n-1 frames, W247), a counter arriving at `$40`
  is `$41` frames from firing (W250, W252), and a counter arriving at zero fires
  immediately (W246's arm 6). Predict the frame number in the test; it is what finds
  this.
- **F5's arms all re-read `$2(a4)`**, so an arm that hands its bit on lets the next arm
  run on the SAME frame. Its latch writes `$4(a4)` and `$C(a4)` as `$10` and the frame
  ends with both at `$0F`.
- **Word literals that are really two byte fields**: `$10(a4)`/`$11(a4)` and
  `$14(a4)`/`$15(a4)` in F5 and A1 8, and A1 10's `$8(a4)` which is a BYTE counter in
  its state 0 and a WORD counter in its state 1.
- **This boss is full of vestigial writes and they must be kept.** A1 8 accumulates two
  angles, reads them into D1, and overwrites D1 with a constant on the next instruction;
  it also loads D7 from a field the shot template overwrites. A1 9's INIT clobbers the
  0/1 side selector F5's arm 6 writes into `$6(a4)`. The stored bytes are observable even
  when the values are not.
- **Limits are PINNED, not compared for equality.** The A3 ramps and MAIN7's speed floor
  both overshoot and then get written back to the limit; an `=== limit` test leaves
  `$FFFE` in an animation cursor.
- **A1 9's rendezvous is a closed loop through the child's parent pointer.** `$19E(a6)`
  is incremented at `$2A3D5A` through `movea.l $1c(a5),a0`, so a scan for `(d16,A6)`
  finds only two sites and supports the WRONG conclusion. Scan `(d16,An)` for every An.

- **Type `$42` cannot be killed by damage**, and the port throws by address if it
  ever is. `$2A3B82` restores `$18(A6)` to `$7FFF` unconditionally two instructions
  before `$2A3B96` tests it. Its children die by ARRIVING, which is also how they
  count themselves back to A1 9 through the parent pointer in `$1C(A5)`.
- **A branch target can be 470 bytes behind the branch.** `$2A3DD4 bgt $2A3C1C` is a
  FREE, not a clamp, and reads as a clamp unless the target is resolved.

- **`POOL_B.base` IS `0x81b732`**, the address every boss4 test uses for A6. It has
  never mattered because none of them spawned pool-B effects; the moment one does,
  the pool scribbles over the sub-record under test. Use an address in the
  sub-record pool's own range instead (`w263lowhp.test.js` does).
- **The old-zero borrow corrected a frame-count prediction in SIX of W246..W263's
  waves.** `subq.b #1 / bcc` reloads on the frame the counter was ALREADY zero. And
  watch which byte of a word literal the counter lives in: `move.w #$20,$4(a4)`
  puts the ZERO in `$4` and the period in `$5`, so that one fires immediately.
- **An out-of-range table read is NOT always a loud throw.** MAIN8's cursor bound is
  a compare rather than a mask, and `$29FB3A + $20` is the first byte of an
  already-exported window, so approximating it would silently read unrelated data.

Elsewhere:

- `src/rom.js` serves a read only from a window that contains it WHOLE, so a
  table crossing a seam between two adjacent windows still throws. W226's
  `$24BB9A` pair is the worked example.
- The hyper item body uses `movem.w ($1a,A6),D0-D1`, two words at `$1A` and
  `$1C`, not the byte speed/angle convention the `I.speed`/`I.angle` names carry.

- NEVER edit source with `sed -i` over a glob, or with a Python script that writes
  in text mode, on this machine: both rewrite whole files as CRLF. Two tests read
  the shipped source AS TEXT (`fire.test.js` splits `options.js` on `
}
`, four
  exporter-assertion tests match `def build(...) -> dict:
\s*check_...`) and go
  red for that reason alone, and a `sed -i` over `tests/*.js` churns every file it
  touches. Write bytes, with LF.

## Protected and generated files

Do not touch, delete, stage, or commit these user-owned/untracked files:

- `NUL`
- `.scratch-*`
- `games/ddpdoj/tools/oracle/c1_gates.py`
- `games/ddpdoj/tools/oracle/c1_mailbox.py`
- `games/ddpdoj/tools/oracle/c1_scan.py`

Do not commit generated rip/assets. Rebuild them locally when needed, but stage
only authored source/exporter/test/worklog files. Never use `git add -A`.

## Worklog numbering

Live numbers: **263 is the highest and is COMPLETE**. 253 is a SPEC that W254/W255
implemented, and 225 is SUPERSEDED by 244; every other number through 263 is
COMPLETE. Reserve the
next number by creating `<N>-RESERVED.md`, then rename it immediately to the real
`IN PROGRESS` worklog as `AGENTS.md` requires. Numbers are never reused.

### `$4A` AND `$4B`: NEAR-CLONES OF `$49` THAT DIVERGE ON THE ONE FIELD THAT MATTERS (W336 recon)

    type $4A    init $2719AE   initBody $2719B6   handler $271A64
    type $4B    init $271C92   initBody $271C9A   handler $271D48

`$4A`'s init body, read in full:

    2719ae  move.w #$1,($4,A5) / rts        TWO sub-records, where $49 declares ONE
    2719b6  loadSubProto($271A2C)
    2719c2  loadRecordProto($271A1A, 8)     D0+1 = NINE words, where $49 takes seven
    2719d0  readInitPosition
    2719d6  cmpi.w #$2B6,$8130CE / bne      the same equality idiom, a DIFFERENT frame ($1F3 for $49)
    2719e2  move.b #$40,($1C,A6) / move.b #$1,($17,A5)
    2719ee  move.w #$1,$81B414 / move.w #$1,$81B416    the same bullet-budget opt-in (W336)
    2719fe  move.b ($18,A5),($1D,A6)
    271a04  jsr $242EC2 / move.b D0,($20,A5)
    271a0e  jsr $242EC2 / move.b D0,($21,A5)
    271a18  rts

**`($20,A5)` IS TWO RNG BYTES HERE, NOT A POINTER.** In `$49` that same field holds the ADDRESS of a
formation flag and both of its exits clear the flag through it. `$4A` calls `drawWord242EC2` twice and
stores a byte from each into `($20,A5)` and `($21,A5)`, and has no formation flag at all. **Porting
`$4A` by copying `$49` would dereference two random bytes as an address.** This is the W315 finding
again in a sharper form: the band shares idioms and diverges in its fields, so every field must be
re-read even when the surrounding code is identical.

**THE OVERLAP TRAP IS HERE TOO AND IT IS EIGHT BYTES DEEP.** `($4,A5) = 1` means TWO `$20`-byte sub
records, so `$271A2C + $40 = $271A6C` while the handler starts at `$271A64`. Its window must be
declared `$271A1A + $52` (`$271A1A..$271A6B`, record proto + both sub records) and must not be trimmed
to the handler. `$49`'s was four bytes; do not assume the depth.

**`$271A6C` IS A DESPAWN TRIGGER, NOT THE OFF-SCREEN TEST -- `$4A` HAS BOTH.**

    271a6c  cmpi.w #$2800,($2,A6) / bgt $271A7E     a POSITION TRIGGER
    271a76  tst.b ($16,A5) / bne $271AB4            ... into the DEATH sequence
    271a7e  moveq #$5C,D1 / and.b (A6),D1 / beq $271AD2    the $5C mask, SIXTH member
    271ad8  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000    <-- and $49's LONG test IS here

An earlier version of this section called `$271A6C` a third spelling of the off-screen test. **That is
wrong and is corrected here:** `$4A` carries `$49`'s signed-long test verbatim at `$271AD8` as well.
`$271A6C` is a separate check that retires the record once it reaches `$2800` with `($16,A5)` set. Two
different tests, not one test spelled differently -- so the count of bounds idioms stays at two
(`addi.w` pairs for `$1B`/`$81`, signed long for `$49`/`$4A`).

**THE REAL FINDING: `$4A` DOES NOT FREE ITSELF WHEN IT DIES.**

    271aa8  move.l #$180,D0 / jsr $28615E       scoreKill -- $180, where $49 pays $250
    271ab4  move.w #$8000,(A6)                  <-- the record MARKS itself
    271ab8  D2 = ($2,A6) ; lea ($271C30,PC),A1 ; jsr $270D92    its OWN list, not $27197C
    271ac6  jsr $28C2DC
    271acc  move.b #$1,($3F,A6)
    271ad2  move.b ($18,A5),($1D,A6)            <-- FALLS THROUGH into the alive path

There is **no `jmp $263762`**. Where `$49`'s death arm ends in `freeEnemy`, `$4A` sets `(A6)` to
`$8000` and `($3F,A6)` to 1 and **keeps running the alive path in the same frame**. So the record
survives its own death as a marked, still-drawing object, and something else retires it later.

That also means `$271AB4` is shared by BOTH exits: the `bne` at `$271A7A` jumps straight into it, so
reaching `$2800` runs the same spawn walk, sound and marking as being shot does. A port that wrote
`$4A`'s death as `$49`'s -- score, walk, free -- would delete a live record and lose whatever `$8000`
and `($3F,A6)` are for.

**AND IT IS NOT BLOCKED -- THE PORT ALREADY HAS THIS EXACT SHAPE.** I first wrote that `$4A` needed a
measurement naming whoever reads `(A6) == $8000`. That was wrong, and it was wrong by skipping the one
check this project has a standing rule about: look for the family before declaring a mechanism new.

`death37` (`handlers.js`, type `$37`) is the same pattern instruction for instruction:

    scoreKill(...)                      $2647F4
    ram.setU16(a6, 0x8000)              the record marks itself
    ram.setU8(a5 + R.rec1E, 1)          the marker byte
    ... effects, spawns, soundPost ...
    ram.setU8(a5 + R.rec1B, ...)        `$26483C fall-through` -- and the port SAYS fall-through

So mark-and-fall-through is an established member shape with a working port, and `$4A` is another
member of it. `$8000` in the first word is what the collision walk at `$2456C6` (`tst.w (A6)+ / bpl`,
already ported in `bomb.js`) reads to skip the record as a target, so the object stops being shootable
while it keeps drawing. `($3F,A6)` is the per-part dead flag `bossf23.js` and `bossphase.js` already
read as `($3F,A6) + ($7F,A6) == 2`.

**So `$4A` can be written now**, with `death49`'s score/walk/sound replaced by `death37`'s
mark-and-continue and no `freeEnemy`. What still needs reading is only `$271AE0` onward: its alive
path, fire arm and draw, plus whether `($20,A5)`/`($21,A5)` feed cadence or aim.

`$4B` is not yet read past its table entry, and is expected to share both the overlap trap and the
mark-and-fall-through death.

### `$4A`'s ALIVE PATH AND FIRE ARM, `$271AD8..$271B42` (W336 recon, continued)

    271ad8  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000
    271ae6  cmpi.l #$1C00,D0 / bgt $271B00        <-- $1C00, where $49 uses $2000
    271af0  tst.b ($16,A5) / beq $271B06
    271af8  jmp $263762                            the off-screen free -- and it does NOT touch a flag
    271b00  move.b #$1,($16,A5)
    271b06  tst.w $8130D2 / bne $271BD8            FREEZE -- and it skips to $271BD8, past everything
    271b10  jsr $24179E                            scrollCompensate
    271b16  jsr ($2714AE,PC)                       <-- UNREAD, and it is NOT in the port yet
    271b1a  tst.b ($3F,A6) / bne $271BC0           <-- the DEATH MARKER, read by $4A ITSELF
    271b22  tst.b ($24,A5) / bne $271B3E           a second-level cadence gate
    271b2a  subq.b #1,($1E,A5) / bcc $271BC0
    271b32  move.b ($1F,A5),($1E,A5) / move.b ($25,A5),($24,A5)
    271b3e  lea ($271C28,PC),A1

**REFINEMENT TO THE DEATH FINDING:** the previous section said "something else retires it later". The
reader is LOCAL: `$271B1A` tests `($3F,A6)` and branches past the whole fire arm to `$271BC0`, so a
marked-dead `$4A` **keeps drawing and stops firing**. That is the observable behaviour of the mark, and
it is `$4A`'s own code that implements it. Whether anything ever frees the record is still open -- the
only `freeEnemy` in the type is the OFF-SCREEN one at `$271AF8`, which suggests a dead `$4A` drifts off
the top and is collected there.

**Three more differences from `$49`, none of them inheritable:**

  * the off-screen limit is `$1C00`, not `$2000`;
  * the freeze at `$271B06` branches to `$271BD8` and skips the counter step, where `$49`'s freeze
    branches INTO its counter step so the sweep keeps advancing. **Opposite behaviour from the same
    idiom** -- do not copy `$49`'s freeze handling;
  * the cadence is TWO levels (`($1E,A5)`/`($1F,A5)` reloading, gated by `($24,A5)`/`($25,A5)`), where
    `$49` has one.

**`$2714AE` IS A NEW CALLEE AND IS NOT PORTED.** It is called every unfrozen frame before the fire
gate. Read it and `codexref` it FIRST -- on this band's record, it is likely shared with `$4B` and
possibly `$48`, and porting it inside a type wave is the mistake W333 avoided by doing `$270D92` first.

Still unread: `$271B42..$271C28` (the fire itself), `$271BC0`/`$271BD8` (the draw and the freeze tail),
and `$2714AE`.

### `$2714AE` IS A BARE `rts`, AND THE BODY BEHIND IT IS UNREACHABLE (W336)

The prerequisite the section above told the next wave to read first turns out to need no porting at
all, and knowing why saves a subsystem's worth of wasted work.

    2714ae  4e75            rts          <-- THE ENTRY POINT IS THE RETURN
    2714b0  tst.b ($3F,A6) / beq $27150E     the body: unreachable
    2714b8  tst.b ($3E,A6) / beq $27150E
    2714c0  subq.b #1,($3C,A6) / bcc $27150E
    2714c8  move.b ($3D,A6),($3C,A6)
    2714ce  moveq #$54,D0 / jsr $263684      an ALLOCATION
    2714d6  move.l ($2,A6),($16,A0)
    2714dc  jsr $242B3C / addi.b #$14,D0 / move.b D0,($1A,A0)

**BOTH callers target `$2714AE`, not `$2714B0`:**

    $2713DA  bsr.w   opcode $6100 disp $D2   -> $2713DA + 2 + $D2 = $2714AE
    $271B16  jsr (d16,PC)  disp $F996        -> $271B18 - $66A   = $2714AE

and `codexref $2714B0` finds **no code reference whatsoever**. So the body has no reachable entry
point in this build: it is a feature Version-B disabled by pointing its entry at a return, which is
what an `rts` patched over a first instruction looks like from the outside.

**WHAT THE PORT MUST DO:** treat both call sites as no-ops and do NOT port `$2714B0..$27150E`. It
allocates through `$263684` with D0 = `$54` and randomises a byte through `$242B3C`, so porting it
would add spawns the board does not make -- a *visible* invention, not a harmless one.

**WHY THIS IS THE FOURTH INSTANCE OF ONE PATTERN.** This build carries dead code that looks live:
`$2716D8`'s `tst.w` of a `lea` opcode, `$27460A` index `$18` and `$25DAC2`'s sentinel disagreement all
have the same shape -- an instruction or a table entry that reads as meaningful and is not. Add "a
`jsr` whose target is an `rts`" to the checklist. **Before porting any callee, read its FIRST
instruction and `codexref` the body separately from the entry.** Two commands, and here it was the
difference between one line of nothing and an invented spawner.

`$4A` therefore has one fewer prerequisite. Still unread: `$271B42..$271C28` (its fire), and
`$271BC0`/`$271BD8` (draw and freeze tail).

### `$4A`'s FIRE ARM, `$271B42..$271BC0` -- A SEVEN-SHOT AIMED FAN WITH A DRIFTING CENTRE (W336)

    271b58  add.w (A1),D0 / add.w ($2,A1),D1        a muzzle bias pair out of $271C28
    271b5e  jsr $24226E                             aim256FromCaller -- ALREADY PORTED (W323)
    271b64  move.b D1,($20,A5)                      <-- THE AIM IS STORED IN ($20,A5)
    271b68  subq.b #1,($26,A5) / bcc $271BC0        a THIRD cadence level
    271b70  move.b ($27,A5),($26,A5)
    271b76  moveq #$0,D1 / move.b ($20,A5),D1       the stored aim comes back as the centre
    271b7c  move.l #$FFFF000B,D0
    271b82  move.l ($2,A6),D2
    271b86  lea ($271C28,PC),A1
    271b8c  tst.b ($17,A5) / bne $271B9A
    271b94  lea ($271C2C,PC),A1                     the mirrored muzzle -- TWO longs, not a table
    271b9a  add.l (A1),D2                           ONE longword add, so a low-half carry reaches X
    271b9c  moveq #$0,D3 / moveq #$0,D4
    271ba0  subi.w #$9,D1                           start NINE units below centre
    271ba4  move.w #$6,D7
    271ba8  jsr $281764  /  addq.b #3,D1  /  dbra D7,$271BA8
    271bb4  move.b ($22,A5),D0 / add.b D0,($20,A5)  the centre DRIFTS by ($22,A5) per volley
    271bbc  subq.b #1,($24,A5)                      the volley counter the $271B22 gate reads

**`move.w #$6,D7` + `dbra` IS SEVEN PASSES**, the standing DBcc rule -- `dbra` branches while the
counter is not -1, so it runs at 6,5,4,3,2,1,0. With `subi.w #$9` first and `addq.b #3` after each, the
headings are centre-9, -6, -3, 0, +3, +6, +9: a **symmetric seven-way fan at 3-unit spacing**. Six or
eight would both be wrong and both would look plausible on screen.

`$281764` is the same spawner `$49`'s second shot uses, and W336 measured that it preserves D1..D4 --
which is exactly why this loop can mutate D1 alone between calls and leave D2/D3/D4 standing. **That
measurement was for `$49` and it pays off again here**, unprompted, which is the argument for reading
callees properly the first time.

**CORRECTION TO THE `($20,A5)` FINDING ABOVE.** An earlier section called `($20,A5)`/`($21,A5)` "two
RNG bytes". More precisely: the init SEEDS them from `drawWord242EC2`, and the fire arm then maintains
`($20,A5)` as the live aim -- written from `$24226E`'s result at `$271B64` and drifted by `($22,A5)` at
`$271BB8`. So it is RNG-seeded aim state, not scratch randomness. The warning that matters is unchanged
and is the whole point: **it is not `$49`'s formation-flag pointer**, and treating it as one would
dereference an aim byte.

So `$4A` is a three-level-cadence, seven-way aimed fan turret whose aim wanders. Only `$271BC0` (which
begins `subq.b #1,($1A,A5)`) and `$271BD8` remain unread, and both are short.

### `$4A` IS NOW READ END TO END, `$271BC0..$271C06` (W336)

    271bc0  subq.b #1,($1A,A5) / bcc $271BD8       the ANIMATION counter
    271bc8  move.b ($1B,A5),($1A,A5)
    271bce  addq.w #4,($1C,A5)
    271bd2  andi.w #$1F,($1C,A5)                   <-- A MASK, not a compare-and-wrap
    271bd8  tst.b ($3F,A6) / bne $271C06           <-- the death marker AGAIN, skipping the DRAW
    271be0  lea ($271C08,PC),A0 / adda.w ($1C,A5),A0 / move.l (A0),D2
    271bec  move.l ($2,A6),D1 / addi.l #-$11FF1400,D1      = $EE00EC00
    271bf6  move.w #$12A0,D3 / moveq #$0,D4 / move.w ($1C,A6),D4
    271c00  jsr $23DECE
    271c06  rts

**CORRECTION, AND IT IS THE THIRD ON THIS TYPE.** Two sections above I wrote that a marked-dead `$4A`
"keeps drawing and stops firing". Wrong: `($3F,A6)` is tested TWICE, at `$271B1A` before the fire arm
AND at `$271BD8` before the draw. A marked-dead `$4A` therefore skips **both** -- it goes invisible and
inert, runs only its animation counter, and occupies its slot until the off-screen free at `$271AF8`
collects it. The mark is a full retirement in everything but slot ownership, which is a different thing
from a dying animation and would have been a visible bug either way round.

**`andi.w #$1F` IS AN EIGHT-ENTRY RING.** Step 4, mask `$1F`, so `($1C,A5)` cycles 0,4,8..$1C: EIGHT
frames, where `$49` uses `cmpi.w #$78 / blt` for thirty. **Do not carry `$49`'s wrap over.** The mask
also means an out-of-range index is impossible by construction, so unlike `$49`'s draw this one needs no
`unreached` guard -- the ROM's own mask is the bound.

That makes the table layout self-consistent and worth recording as a block: `$271C08 + $20` is the
eight-entry draw table (`$314860` ascending), and `$271C28`/`$271C2C` are the two muzzle longwords the
fire arm picks between on `($17,A5)`. So one window `$271C08 + $28` covers the draw table AND both
muzzles.

**`$4A` IS NOW FULLY READ AND HAS NO UNPORTED PREREQUISITE.** Its callees are `$2637A2`, `$26377A`,
`$263808`, `$286096`, `$28615E`, `$270D92` (W333), `$24179E`, `$24226E` (W323), `$281764` (W336),
`$23DECE`, `$242EC2` -- all ported -- plus `$2714AE`, which is an `rts` and must be omitted. Windows
needed: `$271A1A + $52` (record + BOTH sub prototypes, overlapping the handler by eight bytes),
`$271C08 + $28` (draw ring + both muzzles), and `$271C30 + n` for the death list.

### CORRECTION: `$4A` WAS NOT READ END TO END, AND THE TWO MISSING SPANS BOTH MATTER (W336)

The section above claimed `$4A` was read end to end. It was not: `$271A64..$271A6B` and
`$271B42..$271B58` had never been displayed, only assumed from what surrounds them. Both contained
something.

**1. THE HANDLER'S FIRST INSTRUCTION IS THE DEATH MARKER, AND I ASSUMED IT WAS `stepMovement`.**

    271a64  4a2e 003f    tst.b ($3F,A6)
    271a68  6600 0068    bne  -> $271A68 + 2 + $68 = $271AD2

So `($3F,A6)` is tested **THREE** times, not twice, and the first test is the handler's opening
instruction: a marked-dead `$4A` skips the despawn trigger, the whole `$5C` damage arm and everything
else, landing at `$271AD2` and running only the movement/off-screen path, then skipping the fire gate at
`$271B1A` and the draw at `$271BD8`. **The mark makes the record completely inert on its very next
frame** -- it cannot be hit, cannot fire, does not draw, and only drifts until `$271AF8` frees it.

I had guessed these eight bytes were `jsr $2638A6 / nop`, because that is what the byte count fitted and
what most handlers open with. **`$4A` never calls `stepMovement` at all.** Guessing a routine's opening
from its length is exactly the class of mistake the rest of this document is about, and it was one
`python` call away from being checked.

**2. `$271B52 movem.w ($2,A6),D0-D1` SIGN-EXTENDS.** `movem.w` into data registers sign-extends each
word to 32 bits -- it is not a pair of `move.w`s. Here it loads Y into D0 and X into D1 before the
muzzle bias and the aim, so a negative coordinate arrives already extended.

    271b3e  lea ($271C28,PC),A1
    271b44  tst.b ($17,A5) / bne $271B52        ($17,A5) SET keeps $271C28
    271b4c  lea ($271C2C,PC),A1                 CLEAR takes $271C2C
    271b52  movem.w ($2,A6),D0-D1               SIGN-EXTENDING
    271b58  add.w (A1),D0 / add.w ($2,A1),D1    the SAME four bytes as a WORD PAIR
    271b5e  jsr $24226E

**And those four bytes are read two different ways.** `$271B58` takes `$271C28` as a pair of words to
bias the aim, and `$271B9A add.l (A1),D2` takes the same longword to bias the bullet's position. One
table, two conventions, four bytes -- the same shape as `$49`'s one counter feeding two index
conventions, in a smaller space.

So `$4A` is NOW read end to end, and this time that is checked rather than inferred: every byte from
`$2719AE` to `$271C06` has been displayed.

### `$4B`'s INIT BODY, READ IN FULL (W337 recon) -- init `$271C92`, body `$271C9A`, handler `$271D48`

    271c92  move.w #$0,($4,A5) / rts        ONE sub-record -- back to $49's count, not $4A's two
    271c9a  loadSubProto($271D2C)
    271ca6  loadRecordProto($271D18, 9)     D0+1 = TEN words
    271cb4  readInitPosition
    271cba  cmpi.w #$299,$8130CE / bne      a THIRD distinct frame ($49 $1F3, $4A $2B6, $4B $299)
    271cc6  move.b #$40,($1C,A6) / move.b #$1,($17,A5)
    271cd2  move.b ($18,A5),($1D,A6)
    271cd8  move.w #$1,$81B414 / move.w #$1,$81B416      the same budget opt-in (W336)
    271ce8  move.w #$1,$8130E2              <-- UNCONDITIONAL, and it happens either way
    271cf0  lea $8130E2,A0
    271cf6  cmpi.w #$280,$8130CE / bcs $271D0E
    271d02  lea $8130E6,A0
    271d08  move.w #$202,($1A,A5)           <-- late branch ONLY
    271d0e  move.l A0,($26,A5)              <-- the flag pointer, at ($26,A5) NOT ($20,A5)
    271d12  move.w #$1,(A0)
    271d16  rts

**THE OVERLAP DEPTH RULE HOLDS AND IS NOW CONFIRMED RATHER THAN ASSERTED.** `($4,A5) = 0` means ONE
`$20`-byte sub record, so `$271D2C + $20 = $271D4C` against a handler at `$271D48`: **four** bytes, the
same as `$49` and not `$4A`'s eight. The depth follows from `($4,A5)` exactly as W337's window note
said. Window: `$271D18 + $34` (`$271D18..$271D4B`, ten-word record prototype plus the sub prototype).

**THE FLAG POINTER IS BACK, BUT AT A DIFFERENT OFFSET AND ON DIFFERENT WORDS.** `$49` stores it in
`($20,A5)` over `$8130E0`/`$8130E4`; `$4A` has no flag and uses `($20,A5)` for aim state; `$4B` stores it
in **`($26,A5)`** over **`$8130E2`/`$8130E6`**. Three consecutive types, three different meanings for the
same region of the record. Find `$4B`'s exits and clear through `($26,A5)`, and do NOT reuse either
sibling's offset.

**`$8130E2` IS WRITTEN TWICE ON THE LATE BRANCH.** `$271CE8` sets it to 1 unconditionally, and only then
does the `$280` test possibly redirect A0 to `$8130E6` -- so a late `$4B` arms `$8130E2` AND `$8130E6`,
while an early one arms `$8130E2` only, through both the direct write and the pointer. Collapsing the
unconditional write into the branch would leave the early flag set once instead of twice (harmless) and
the LATE case with `$8130E2` clear (not harmless).

**`move.w #$202,($1A,A5)` IS TWO BYTE FIELDS.** The standing rule: `($1A,A5) = 2` and `($1B,A5) = 2`.
Those are the animation counter and its reload, which `$4A` uses the same way -- so the late-spawning
`$4B` gets a 2-frame animation cadence and the early one keeps whatever the prototype gave it.

Still to read: the handler `$271D48` onward, including its `$270D92` call at `$271D88`.

### CORRECTION: `$4B` FREES ITSELF. IT IS `$49`'s SHAPE, NOT `$4A`'s (W337 recon)

The order-for-next-wave note above said of `$4B`: "expect the overlap trap, expect mark-and-fall-through".
The overlap prediction held. **The mark prediction is WRONG** and is corrected here before anyone builds
on it.

    271d48  moveq #$5C,D1 / and.b (A6),D1 / beq $271DA0     the handler OPENS on the damage mask,
                                                            not on a ($3F,A6) test like $4A
    271d56  jsr $286096                                     scoreHit
    271d5c  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b ; store    the simple palette XOR
    271d6a  tst.w ($18,A6) / bpl $271DA6
    271d72  move.l #$290,D0 / jsr $28615E                    scoreKill -- a THIRD value
    271d7e  D2 = ($2,A6) ; lea ($271F20,PC),A1 ; jsr $270D92   SIX entries, ending $271F6A
    271d8c  jsr $28C2DC
    271d92  movea.l ($26,A5),A0 / clr.w (A0)                 the flag, through ($26,A5)
    271d98  jmp $263762                                     <-- freeEnemy. IT REALLY DOES FREE.
    271da0  move.b ($18,A5),($1D,A6)                         the not-hit path
    271da6  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000 / cmpi.l #$400 / bgt
    271dbe  tst.b ($16,A5) / beq $271DDA
    271dc6  movea.l ($26,A5),A0 / clr.w (A0) / jmp $263762   the off-screen free, flag cleared too
    271dd4  move.b #$1,($16,A5)
    271dda  tst.w $8130D2                                    the freeze

So `$4B` has **no `$8000` mark and no `($3F,A6)` flag at all**. It is `$49`'s lifetime exactly: score,
walk the death list, clear the formation flag through the stored pointer, `freeEnemy`. `$4A` is the odd
one of the three, not the pattern.

**THREE TYPES, THREE OFF-SCREEN LIMITS, ALL THE SAME IDIOM.** `ext.l` / `addi.l #$4000` / `cmpi.l` /
`bgt`, with the limit `$2000` for `$49`, `$1C00` for `$4A` and **`$400`** for `$4B`. And three kill
scores: `$250`, `$180`, `$290`. Every one of these is a per-type constant wearing shared code.

**WHY I GOT IT WRONG, WHICH IS THE REUSABLE PART.** I predicted mark-and-fall-through for `$4B` because
`$4A` had it and they are adjacent siblings -- the exact inference this document warns against four
sections earlier, applied by me in the same session. The band shares idioms and diverges in fields, and
"it will resemble its neighbour" is not a shortcut even when the neighbour is one type away. **Predicting
a routine's shape before reading it is only useful if the prediction is then checked; recording it as an
expectation in a handoff makes it load-bearing.** Left in place, that line would have had the next agent
looking for a death mark that does not exist.

Window for the death list: `$271F20 + $4A` (SIX 12-byte entries then `$FFFF`, ending `$271F6A`).

Still to read for `$4B`: `$271DDA` onward -- the freeze tail, fire arm and draw.

### `$4B`'s SWEEP AND FIRE ARM, `$271DDA..$271E54` (W337 recon) -- `$49`'s shape again

    271df2  move.b ($1B,A5),($1A,A5)
    271df8  addq.w #4,($1C,A5) / cmpi.w #$78,($1C,A5) / blt / move.w #$0,($1C,A5)
    271e0c  lea ($271F6A,PC),A1 / adda.w ($1C,A5),A1 / move.l (A1),D3     RAW index, 30 LONGS
    271e18  move.l ($2,A6),D2
    271e1c  lea ($271FE2,PC),A1
    271e22  tst.b ($17,A5) / beq $271E32          CLEAR keeps $271FE2 and does NOT negate
    271e2a  lea ($27201E,PC),A1
    271e30  neg.w D3                              SET takes the other table AND mirrors
    271e32  move.w ($1C,A5),D0 / asr.w #1,D0 / adda.w D0,A1 / move.w (A1),D1   HALVED index
    271e3c  add.l D3,D2 / moveq #$0,D3 / moveq #$0,D4
    271e42  move.l #$10003,D0  / jsr $281744
    271e4e  move.l #$FFFD0004,D0 / ...

**`$4B` WRAPS THIRTY, NOT EIGHT.** `cmpi.w #$78 / blt`, the same `$49` construction, where `$4A` uses
`andi.w #$1F` for eight. So the sweep length is a third per-type constant on shared code, alongside the
three off-screen limits (`$2000`/`$1C00`/`$400`) and three kill scores (`$250`/`$180`/`$290`). **Nothing
about this band is inheritable except the instruction sequences themselves.**

It carries `$49`'s two traps verbatim: **one counter, two index conventions** (RAW for the long table at
`$271F6A`, ASR 1 for the word tables), and **`neg.w D3` on a `move.l`-loaded long** at `$271E30`, low word
only, no borrow, followed by `add.l` which does carry. Note the polarity is the OPPOSITE of `$49`'s: here
`($17,A5)` SET takes the second table and mirrors, where `$49` SET took the FIRST table. Do not copy the
sense of the test.

Registers are reused across shots (`$281744` with D0 = `$10003`, then D0 = `$FFFD0004`), which W336
licensed by measuring that the `$2817C2` family preserves D1..D4.

**THE TABLE BLOCK IS CONTIGUOUS AND SELF-CHECKING:**

    $271F20 + $4A   death list, SIX 12-byte entries then $FFFF        ends $271F6A
    $271F6A + $78   30 muzzle LONGS, index RAW                        ends $271FE2
    $271FE2 + $3C   30 sweep WORDS, ($17,A5) CLEAR, index ASR 1       ends $27201E
    $27201E + $3C   30 sweep WORDS, ($17,A5) SET, index ASR 1         ends $27205A

Each table's end is the next one's start, so `$271F20 + $13A` covers all four as one window and the
arithmetic checks itself. Declare it that way or as four; either is defensible, but state which.

Still to read for `$4B`: `$271E54` onward -- the remaining shots and the draw.

### `$4B` IS NOW READ END TO END, `$271E42..$271EA6` (W337 recon). FOUR SHOTS, ASYMMETRIC.

    271e42  move.l #$10003,D0    / jsr $281744      shot 1, at the sweep word itself
    271e4e  move.l #$FFFD0004,D0 / addq.w #2,D1 / jsr $2816F6     shot 2, base+2
    271e5c  subq.w #4,D1         / jsr $2816F6                    shot 3, base-2  (D0 UNCHANGED)
    271e64  addq.w #3,D1 / move.l #$FFF90005,D0 / jsr $2816F6      shot 4, base+1
    271e72  addq.b #1,($25,A5) / andi.b #$1,($25,A5)               a 0/1 TOGGLE
    271e7c  subq.b #1,($22,A5)                                     decremented, NOT branched on
    271e80  lea ($271EA8,PC),A0 / adda.w ($1C,A5),A0 / move.l (A0),D2      RAW index, 30 LONGS
    271e8c  move.l ($2,A6),D1 / addi.l #-$1DFF1600,D1              = $E200EA00
    271e96  move.w #$1EB0,D3 / moveq #$0,D4 / move.w ($1C,A6),D4
    271ea0  jsr $23DECE
    271ea6  rts

**FOUR SHOTS, NOT A LOOP AND NOT SYMMETRIC.** D1 walks base, base+2, base-2, base+1 by three separate
`addq`/`subq`s, and D0 changes for shots 1, 2 and 4 while shot 3 REUSES shot 2's. `$49` has three shots
this way and `$4A` has a seven-pass `dbra` loop -- so all three types spell "fire several bullets"
differently. Shot 3 inheriting D0 is another instance of the register-reuse W336 licensed; without that
measurement it would look like an omission.

`$271E7C subq.b #1,($22,A5)` sets flags that nothing reads -- the next instruction is a `lea`. It is a
plain decrement, not a gate. Do not invent a branch for it.

**THE WHOLE BAND'S TABLE BLOCK IS ONE CONTIGUOUS RUN, AND EVERY BOUNDARY CHECKS THE PREVIOUS ONE:**

    $271EA8 + $78    $4B's 30 draw LONGS, index RAW               ends $271F20
    $271F20 + $4A    $4B's death list, SIX entries then $FFFF     ends $271F6A
    $271F6A + $78    $4B's 30 muzzle LONGS, index RAW             ends $271FE2
    $271FE2 + $3C    $4B's 30 sweep WORDS, ($17,A5) CLEAR         ends $27201E
    $27201E + $3C    $4B's 30 sweep WORDS, ($17,A5) SET           ends $27205A

So `$271EA8 + $1B2` is one window covering all five, with the arithmetic self-checking end to end.
Prefer that single declaration and say in the comment that the five spans abut, since five separate
windows would hide the property that pins them.

**`$4B` NOW HAS NO UNREAD SPAN AND NO UNPORTED PREREQUISITE.** Callees: `$2637A2`, `$26377A`, `$263808`,
`$286096`, `$28615E`, `$270D92` (W333), `$281744`/`$2816F6` (W336), `$23DECE` -- all ported, plus
`$24179E` (`scrollCompensate`, at `$271DE4`), also ported. **An earlier draft of this line said "it needs
no `$24179E`"; that was wrong** -- I had not yet displayed `$271DDA..$271DF2` when I wrote it. It does not
call `$2714AE`, which is the bare `rts` (W336). Windows: `$271D18 + $34` (record + sub prototype,
overlapping the handler by FOUR bytes) and `$271EA8 + $1B2` (all five tables).

**WRITE IT.** The three-way divergence table for the band is in `docs/worklog/ddpdoj/337-type4a.md`;
`$4B` differs from `$49` in the `($17,A5)` polarity, the limit (`$400`), the score (`$290`), the flag
offset (`($26,A5)`) and the flag words (`$8130E2`/`$8130E6`), and from `$4A` in essentially everything
except the shared instruction sequences.

### `$48` FIRST LOOK (W338 recon) -- init `$271284`, handler `$27133A`. IT MARKS, LIKE `$4A`.

Type table `$267824 + $48*8 = $267A64` reads `00271284 0027133A`, so initBody is `$27128C` by the
`init + 8` rule.

    271390  jsr $270D92                     the shared death-spawn walker (W333), its SIXTH caller
    271394  jsr $28C2DC
    27139a  move.b #$1,($3F,A6)             <-- THE MARK. No clr.w through a flag, no freeEnemy.
    2713a0  move.b ($18,A5),($1D,A6)        FALLS THROUGH into the alive path
    2713a6  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000
    2713b4  cmpi.l #$2C00,D0 / bgt $2713CE  <-- a FOURTH off-screen limit
    2713be  tst.b ($16,A5) / beq $2713D4
    2713c6  jmp $263762                     the off-screen free

**SO THE BAND SPLITS 2-2 ON LIFETIME, NOT 3-1.** `$4A` and `$48` mark-and-continue; `$49` and `$4B` free
themselves in the death arm. When W337 found `$4A` marking it looked like the odd one out and W338 said
so; `$48` makes it a genuine pair. **Do not treat any of the four as the band's "normal" shape** -- there
isn't one, and the write-up in `338-type4b.md` should be read with that correction in mind.

Whether `$48` also carries `$4A`'s THREE `($3F,A6)` tests (handler head, before the fire arm, before the
draw) is UNREAD and is the first thing to check: it decides whether a marked `$48` is fully inert or only
partly.

**Four off-screen limits now, one idiom** (`ext.l` / `addi.l #$4000` / `cmpi.l` / `bgt`):

    $49 $2000     $4A $1C00     $4B $400     $48 $2C00

Still to read for `$48`: the init body `$27128C`, the handler from `$27133A` to `$271390`, and everything
after `$2713CE`. Its death list address is inside the unread `$271384`-ish span just before the walker
call.

### `$48`'s HANDLER HEAD AND DAMAGE ARM (W338 recon continued) -- the `$2800` GUARD IS MISSING

    27133a  tst.b ($3F,A6) / bne $27133E + 2 + $60 = $2713A0    <-- the mark test, test 1 of ?
    271342  cmpi.w #$2800,($2,A6)
    271348  ble $271348 + 2 + $38 = $271382                     <-- STRAIGHT to the retirement
    27134c  moveq #$5C,D1 / and.b (A6),D1 / beq $2713A0          the $5C mask
    271354  move.b #$A3,D0 / and.b D0,(A6)
    27135a  jsr $286096                                         scoreHit
    271360  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b ; store        the simple palette XOR
    27136e  tst.w ($18,A6) / bpl $2713A6
    271376  move.l #$130,D0 / jsr $28615E                        a FIFTH kill score
    271382  move.w #$8000,(A6)                                   the mark, as $4A
    271386  D2 = ($2,A6) ; lea ($271558,PC),A1 ; jsr $270D92      FIVE entries, ends $271596

**CONFIRMED: `$48` tests `($3F,A6)` at the handler's first instruction, exactly as `$4A` does.** So the
2-2 lifetime split is real and both marking members gate on the mark from instruction one. Whether `$48`
also tests it before its fire arm and before its draw is still unread.

**THE DIVERGENCE: `$48`'s `$2800` TRIGGER HAS NO `($16,A5)` GUARD.**

    $4A   cmpi.w #$2800,($2,A6) / bgt (skip) ; then tst.b ($16,A5) / bne -> retire
    $48   cmpi.w #$2800,($2,A6) / ble -> retire                      NO ($16,A5) TEST AT ALL

Same constant, same purpose, and `$4A` requires the record to have been on screen first while `$48` does
not. `($16,A5)` is the "has been on screen" latch every member sets in its off-screen arm, so `$4A`
retires only after appearing and `$48` retires the moment its position qualifies -- **including
potentially before it ever appears.** A port that copied `$4A`'s guarded form would make `$48` outlive
its intended retirement.

That is the *ninth* distinct axis on which these four types differ while sharing instruction sequences,
and the first where the difference is a MISSING instruction rather than a changed constant. Absence is
harder to notice than a different literal, which is the reason this is written down rather than left to
the next reader's diff.

**Five kill scores now:** `$250` (`$49`), `$180` (`$4A`), `$290` (`$4B`), `$130` (`$48`) -- and four
off-screen limits: `$2000`, `$1C00`, `$400`, `$2C00`.

Still to read for `$48`: the init body `$27128C`, and everything after `$2713CE` (the freeze tail, fire
arm and draw). Death-list window: `$271558 + $3E` (FIVE 12-byte entries then `$FFFF`).

### THE BAND IS TWO PAIRS, NOT FOUR SINGLETONS (W338, `$48`'s init body read in full)

    271284  move.w #$1,($4,A5) / rts        TWO sub-records, as $4A
    27128c  loadSubProto($271302)
    271298  loadRecordProto($2712F0, 8)     D0+1 = NINE words, as $4A
    2712a6  readInitPosition
    2712ac  cmpi.w #$201,$8130CE / bne      a FOURTH frame ($49 $1F3, $4A $2B6, $4B $299, $48 $201)
    2712b8  move.b #$40,($1C,A6) / move.b #$1,($17,A5)
    2712c4  move.w #$1,$81B414 / move.w #$1,$81B416
    2712d4  move.b ($18,A5),($1D,A6)
    2712da  jsr $242EC2 / move.b D0,($20,A5)
    2712e4  jsr $242EC2 / move.b D0,($21,A5)
    2712ee  rts                             <-- NO formation flag, exactly as $4A

**So the four types are TWO PAIRS on structure:**

    { $48, $4A }   ($4,A5) = 1 -> TWO sub records -> EIGHT-byte handler overlap
                   NINE-word record prototype
                   ($20,A5)/($21,A5) RNG-SEEDED, no formation flag
                   lifetime: MARK ($8000 + ($3F,A6)) and fall through, tested at instruction one

    { $49, $4B }   ($4,A5) = 0 -> ONE sub record -> FOUR-byte handler overlap
                   SEVEN- and TEN-word record prototypes
                   ($20,A5) / ($26,A5) holds a POINTER to a formation flag word
                   lifetime: score, walk, clear the flag, freeEnemy

That is a real and useful structure -- it says where to look and which sibling's code to read alongside.
**It does NOT license copying.** Within the `{$48,$4A}` pair the constants still all differ (limit `$2C00`
vs `$1C00`, score `$130` vs `$180`, frame `$201` vs `$2B6`, death list five entries vs eight) and `$48`
is MISSING `$4A`'s `($16,A5)` guard on the `$2800` trigger. The pairing tells you the shape; every field
still has to be read.

Window for `$48`'s prototypes: `$2712F0 + $52` (`$2712F0..$271341`, nine-word record prototype plus BOTH
sub prototypes, overlapping the handler at `$27133A` by eight bytes -- do not trim).

Still to read for `$48`: everything after `$2713CE` -- the freeze tail, fire arm and draw. Expect them to
resemble `$4A`'s and verify every constant and every guard, including whether `($3F,A6)` is tested before
the fire arm and the draw as it is in `$4A`.

### `$48`'s FREEZE TAIL AND AIM SETUP, `$2713CE..$271422` (W338) -- and the dead `bsr` in situ

    2713ce  move.b #$1,($16,A5)
    2713d4  jsr $24179E                     scrollCompensate -- so $48 DOES call it, like $4B
    2713da  bsr $2714AE                     <-- THE BARE rts (W336). OMIT IT.
    2713de  tst.b ($3F,A6) / bne $271488    the mark, test 2 -- before the fire arm, as $4A
    2713e6  tst.b ($24,A5) / bne $271402    the two-level cadence gate, as $4A
    2713ee  subq.b #1,($1E,A5) / bcc $271488
    2713f6  move.b ($1F,A5),($1E,A5) / move.b ($25,A5),($24,A5)
    271402  lea ($271596,PC),A1
    271408  tst.b ($17,A5) / bne $271416    SET KEEPS the first table -- $4A's polarity, NOT $4B's
    271410  lea ($27159A,PC),A1
    271416  movem.w ($2,A6),D0-D1           SIGN-EXTENDING, as $4A
    27141c  add.w (A1),D0 / add.w ($2,A1),D1    the muzzle as a WORD PAIR
    271422  jsr $24226E                     aim256FromCaller

**`$2713DA` IS THE OTHER CALLER OF THE BARE `rts`, NOW SEEN IN CONTEXT.** W336 established that both
callers of `$2714AE` target the `rts` and that the body at `$2714B0` has no reachable entry point; this is
that second caller, sitting in `$48`'s per-frame path exactly where `$4A` has its `jsr`. **Both marking
members call a routine that does nothing, every unfrozen frame.** Omit it in both. Two independent call
sites make it much less likely to be a mis-disassembly and much more likely to be a deliberately disabled
feature in Version-B.

**THE `($17,A5)` POLARITY MATCHES `$4A`, NOT `$4B`.** `bne` keeps the first table, so SET = first. `$4B`
inverted this (SET = second, and it also mirrors). So polarity tracks the PAIRS: `{$48,$4A}` share it and
`$4B` differs from both. That is the first axis found to respect the pairing -- nine others do not, so it
is worth noting as a coincidence to verify rather than a rule to lean on.

`$48` also carries `$4A`'s `movem.w` sign-extension and its word-pair reading of the muzzle longword.

**THE TABLE RUN IS CONTIGUOUS AGAIN:** `$271558 + $3E` is the five-entry death list, ending exactly at
`$271596`, which is the first muzzle longword; `$27159A` is the second. So `$271558 + $46` covers the
death list and both muzzles as one self-checking window, the same construction W338 used for `$4B`.

Still to read for `$48`: `$271426` onward -- its shot loop (or shot list) and its draw, plus whether
`($3F,A6)` is tested a third time before the draw as it is in `$4A`.

### `$48`'s SHOT LOOP, `$27143E..$271486` (W338) -- FIVE shots at 5-unit spacing

    27143e  moveq #$0,D1 / move.b ($20,A5),D1      the stored aim as the centre, as $4A
    271444  move.l #$FFFE000B,D0                   $4A's is $FFFF000B -- the HIGH word differs
    27144a  move.l ($2,A6),D2
    27144e  lea ($271596,PC),A1 / tst.b ($17,A5) / bne -> keep ; else lea ($27159A,PC),A1
    271462  add.l (A1),D2                          the SAME longword, now read as a LONG
    271464  moveq #$0,D3 / moveq #$0,D4
    271468  subi.w #$A,D1                          start TEN below centre ($4A starts NINE)
    27146c  move.w #$4,D7
    271470  jsr $281744  /  addq.b #5,D1  /  dbra D7,$271470
    27147c  move.b ($22,A5),D0 / add.b D0,($20,A5)  the centre DRIFTS, as $4A
    271484  subq.b #1,($24,A5)                      the volley counter

**`move.w #$4,D7` + `dbra` IS FIVE PASSES** (4,3,2,1,0), the standing DBcc rule again. With `subi.w #$A`
first and `addq.b #5` after each, the headings are centre-10, -5, 0, +5, +10: a symmetric **five-way fan at
5-unit spacing**, where `$4A` is a **seven-way fan at 3-unit spacing** (`move.w #$6,D7`, `subi.w #$9`,
`addq.b #3`).

**Identical construction, and FOUR of its five parameters differ between the pair**: the pass count (`#$4`
vs `#$6`), the initial offset (`#$A` vs `#$9`), the step (`#5` vs `#3`) and the spawner (`$281744` vs
`$281764`). Plus D0 (`$FFFE000B` vs `$FFFF000B`). This is the clearest single illustration of the band's
character: the two closest relatives in it share a loop skeleton and agree on almost none of what goes in
it. **Reading `$4A`'s loop and adjusting one number would have produced a wrong fan four ways over.**

The muzzle longword is again read BOTH ways, as in `$4A`: a word pair at `$27141C` to bias the aim inputs
and a longword at `$271462` to bias the bullet position.

Note `$27143A` disassembles as `ori.b #$26,-(A7)`, which is data caught mid-stream, not an instruction --
`$271426..$27143C` is the aim tail and needs one more read at a correct instruction boundary before the
fire arm can be written.

Still to read for `$48`: `$271426..$27143C` (the aim tail) and `$271488` onward (the animation counter and
the draw, plus the expected third `($3F,A6)` test).

### `$48`'s TAIL, `$27142C..$2714AC` (W338) -- the THIRD mark test confirmed, and the draw is a `bsr`

    27142c  move.b D1,($20,A5)              the aim store -- W323's trap, exactly as $4A's $271B64
    271430  subq.b #1,($26,A5) / bcc $271488    the THIRD cadence level, as $4A
    271438  move.b ($27,A5),($26,A5)
    27143e  ... the five-shot fan ...
    271488  subq.b #1,($1A,A5) / bcc        the animation counter
    271490  move.b ($1B,A5),($1A,A5)
    271496  addq.w #4,($1C,A5) / andi.w #$1F,($1C,A5)    EIGHT-entry ring, as $4A -- a MASK, not a compare
    2714a0  tst.b ($3F,A6) / bne $2714AC    <-- THE THIRD MARK TEST, before the draw. As predicted.
    2714a8  bsr $271510                     the draw is a SEPARATE SUBROUTINE
    2714ac  rts
    2714ae  rts                             <-- the bare rts, the very next byte

**THE THIRD `($3F,A6)` TEST IS THERE.** `$48` tests the mark at the handler head, before the fire arm and
before the draw, the same three points as `$4A`. So a marked `$48` is fully inert -- unhittable, silent,
invisible -- and only the movement path runs until the off-screen free. The open question recorded two
sections ago is answered YES, and the `{$48,$4A}` pairing holds on lifetime in full detail.

**`$2714AE` IS THE BYTE IMMEDIATELY AFTER `$48`'s HANDLER ENDS**, which finally explains what it is: a
stub `rts` parked between `$48`'s handler and the disabled body at `$2714B0`. And that body tests
`($3F,A6)`, `($3E,A6)` and `($3C,A6)` -- all dying-state fields -- so the disabled feature is an extra
effect for MARKED records specifically. Version-B turned it off by pointing both call sites at the stub.
That is a coherent story rather than an oddity, and it is now recorded as one.

`$48` also shares `$4A`'s **eight-entry `andi.w #$1F` ring** (`$49` and `$4B` use `cmpi.w #$78` for
thirty), so the ring length tracks the pairs, like the `($17,A5)` polarity. Two axes respect the pairing
now; nine do not.

**Its draw is a `bsr` to `$271510`, not inline** -- the only member of the band that factors it out. That
is the last unread span: `$271510` onward.

### `$48`'s DRAW SUBROUTINE `$271510` (W338) -- and its table run is contiguous too

    271510..27151E   NOT YET DISPLAYED -- the table index setup. READ IT; do not assume it matches $4A's.
    271520  addi.l #-$9FF0A00,D1        = $F600F600     ($4A's is $E200EA00, $4B's $E200EA00-shaped)
    271526  move.w #$A50,D3             ($4A $12A0, $4B $1EB0 -- a THIRD value)
    27152a  moveq #$0,D4 / move.w ($1C,A6),D4
    271530  jsr $23DECE
    271536  rts
    271538  the DRAW RING: EIGHT longwords, five distinct, ping-ponging:
              $318F78 $31910C $3192A0 $319434 $3195C8 $319434 $3192A0 $31910C

The ring is eight entries, matching the `andi.w #$1F` mask, and it ping-pongs over five distinct frames --
the same construction as `$4A`'s (`$314860`.. five distinct, eight entries). Its step is `$194` where
`$4A`'s is `$54C`.

**ONE WINDOW COVERS ALL THREE OF `$48`'s TABLES, AND THE ARITHMETIC CHECKS ITSELF:**

    $271538 + $20   the 8-longword draw ring        -> ends $271558
    $271558 + $3E   death list, FIVE entries + $FFFF -> ends $271596
    $271596 + $08   the two muzzle longwords        -> ends $27159E

So **`$271538 + $66`** (`$271538..$27159D`) is the single declaration, the same construction W338 used for
`$4B`'s five-table run and for `$4A`'s. Every boundary is checked by the next table's start rather than by
a terminator or a row count.

Together with `$2712F0 + $52` (record prototype + BOTH sub prototypes, eight-byte handler overlap), that is
`$48`'s complete window set.

**`$48` IS NOW READ EXCEPT `$271510..$27151E`, SIXTEEN BYTES.** That span is the draw's table index setup.
It is NOT to be assumed from `$4A` -- this session recorded nine axes where the pair diverges and produced
eight self-corrections, every one from inferring across a span instead of displaying it. Display these
sixteen bytes, then `$48` can be written in one pass: its callees are `$2637A2`, `$26377A`, `$263808`,
`$286096`, `$28615E`, `$270D92`, `$24179E`, `$24226E`, `$242EC2`, `$281744`, `$23DECE` -- all ported -- plus
`$2714AE`, the stub `rts`, which is omitted.

### `$47` FIRST LOOK (W339) -- init `$26D6EE`, handler `$26D7D0`. NOT a band member.

`$E2` records, the biggest remaining unblocked type in stage 5. It is structurally unlike
`$48`/`$49`/`$4A`/`$4B` in every way that matters:

    26d6ee  move.w #$3,($4,A5) / rts        FOUR sub records ($4,A5)+1 -- the band has 1 or 2
    26d6f6  loadSubProto($26D760)
    26d702  move.w #$F,D0 / loadRecordProto($26D740)    SIXTEEN words -- and a `move.w`, NOT a `moveq`
    26d712  readInitPosition
    26d718  move.w #$1,$81B414              <-- ONE budget word only; the band always sets TWO
    26d720  move.w #$1,$8130DC              <-- a global the band never touches
    26d728  move.w #$10,D0 / lea $224F38,A0 / jsr $24150A     <-- A PALETTE BANK INSTALL

**THE OVERLAP IS SIXTEEN BYTES, THE DEEPEST YET, AND THE RULE STILL PREDICTS IT.**
`($4,A5) = 3` means FOUR `$20`-byte sub records, so `$26D760 + $80 = $26D7E0` against a handler at
`$26D7D0`. Depth = `subRecords * $20 - (handler - subProto)` = `$80 - $70` = `$10`. The rule established
across `$49` (4), `$4A` (8) and `$4B` (4) generalises; it is arithmetic, not a per-type fact. Window:
`$26D740 + $A0` (`$26D740..$26D7DF`, sixteen-word record prototype plus all FOUR sub prototypes).

**`move.w #$F,D0` RATHER THAN `moveq`** is worth flagging: `loadRecordProto` takes `D0+1` words, so this
is SIXTEEN, and every band member used `moveq #$6`/`#$8`/`#$9`. A reader pattern-matching on `moveq` would
miss the count entirely.

**`$24150A` IS THE PALETTE-BANK INSTALL** the port already has as `installBank` (see `$27C5BE`'s body in
`initbody.js`, which installs three). `$47` installs ONE: bank `$10` from `$224F38`. Check whether
`$224F38` is already inside W91's `$222A78..$2252F8` palette-family window before declaring anything --
W169 found exactly that situation and needed no new window.

Still to read for `$47`: the rest of the init body past `$26D738`, and the whole handler from `$26D7D0`.

**W340 IS THE PUBLISH WAVE.** Land the next type, then `export-web.mjs` then `publish.mjs --only ddpdoj`.

### `$47`'s HANDLER HEAD, `$26D7D0..$26D80E` (W339) -- IT REINSTALLS ITS PALETTE EVERY FRAME

    26d7d0  move.w #$10,D0 / lea $224F38,A0 / jsr $24150A    <-- THE SAME THREE INSTRUCTIONS AS THE INIT
    26d7e0  tst.w $8130D2 / bne $26DAC8                       the freeze, jumping FAR (the draw)
    26d7ea  tst.b ($7E,A6) / beq $26D810                      a flag in the LAST sub-record
    26d7f2  move.w #$0,$8130DC                                clears the global the init SET
    26d7fa  move.w #$20,D0 / move.w #$20,D1 / jsr $261100     <-- $261100, a NEW callee. Read it.
    26d808  jmp $263762                                      freeEnemy

**THE PALETTE INSTALL IS NOT INIT-ONLY.** `$26D7D0` is byte-for-byte the init's `$26D728`: bank `$10` from
`$224F38`, every single frame this handler runs. That is easy to read as redundant and delete, and it is the
first instruction of the handler so it is also easy to skip past on the way to "the real logic". **Port it as
the per-frame call it is.** Something else in stage 5 is presumably overwriting bank `$10`, and this type
repainting it every frame is the mechanism that keeps it correct.

**`$8130DC` IS A SINGLE GLOBAL, NOT A POINTER.** The init sets it to 1 (`$26D720`) and the retirement clears
it (`$26D7F2`). Same purpose as the band's formation flags but with no `($n,A5)` pointer indirection -- `$47`
has only one instance's worth of state to track, which fits a type with `$E2` records driven from one place.

`($7E,A6)` is the retirement trigger. Note the offset: FOUR `$20`-byte sub records give a `$80`-byte record,
so `+$7E` is the last word of the last sub-record. A port that allocated a band-sized record would write
outside it.

**`$261100` IS NOT YET IDENTIFIED** and is called with D0 = `$20` and D1 = `$20` on the retirement path.
`codexref` it before writing `$47`: on this project's record a routine reached from a retirement path with two
equal register arguments is likely shared, and W333's lesson was to port the shared callee FIRST rather than
discover it mid-type.

Still to read for `$47`: `$26D738` (one instruction, the init's tail), `$26D810` onward (the alive path), and
`$26DAC8` (the draw). Its window is `$26D740 + $A0`; check `$224F38` against W91's existing palette family
window before declaring a second one.

### `$261100` IS ALREADY PORTED. `$47` HAS NO UNIDENTIFIED CALLEE. (W339)

The previous section said to `codexref $261100` before writing `$47`. Done, and the answer is that it needs
no work: it is **`pushExternalSpeed(ram, d0, d1)` in `src/background.js`** (line 1222), documented there since
W31 as "THE EXTERNAL SPEED PUSH, the writer side" -- three writes, `$813180 = 1`, `$813182 = D0`,
`$813184 = D1`, and `backgroundFrame` has consumed those words since W13.

`background.js` had already recorded that it has **nine callers in build B**, and `$26D802` -- `$47`'s
retirement path -- is one of them. So `$47` calling it with `D0 = D1 = $20` is the same construction as the
stage-1 midboss at `$26B73A`, which pushes `D0 = D1 = $0020` as its death countdown passes `$30`.

**AND THAT TELLS US WHAT `$47` IS.** `pushExternalSpeed` is the owner's "minibosses stop the scroll" from the
writer end: the stage stops ADVANCING because a paired speed push overrides the script. A type with `$E2`
records that pushes the same `$20`/`$20` on retirement is doing the same job -- **`$47` is a scroll-stopping
set-piece**, not an ordinary enemy, which also explains its four sub records, its sixteen-word prototype and
its per-frame palette repaint.

**FIFTH TIME THIS SESSION** that a "new callee" or "blocker" dissolved on checking whether the port already
had it (after W334's `init + 8`, W336's `death37`, W336's `$2816F6` measurement, W338's `$2714AE` story). The
check is `grep -rniE '<addr>' games/ddpdoj/src/` plus `codexref`, it costs two commands, and it has never once
failed to be worth running. **Run it on EVERY callee before reading its body.**

So `$47`'s remaining work is pure reading: `$26D738` (one instruction), `$26D810` onward (the alive path) and
`$26DAC8` (the draw). Window `$26D740 + $A0`; still check `$224F38` against W91's palette family window.

### `$47`'s DAMAGE ARM IS THE BOSS `$7FFF` DAMAGE-SINK, WHICH THE PORT ALREADY HAS (W339)

    26d810  moveq #$5C,D1 / and.b (A6),D1 / beq $26D892       (4 bytes not yet displayed -- confirm)
    26d818  move.b #$A3,D0 / and.b D0,(A6)
    26d81e  move.w D1,($6E,A6)                    the hit mask is SAVED, unlike any band member
    26d822  jsr $286096                           scoreHit
    26d828  D0 = ($1D,A6) ; eori.b #$F,D0 ; store  <-- a LITERAL $F, not ($19,A5)
    26d834  move.l #$7FFF,D0 / sub.w ($18,A6),D0   the damage TAKEN this frame
    26d83e  sub.l D0,($32,A5)                     ... subtracted from a LONG accumulator
    26d842  move.w #$7FFF,($18,A6)                ... and the sink is RE-ARMED
    26d848  tst.l ($32,A5) / bpl $26D898          alive while the LONG is non-negative
    26d850  move.l #$600,D0 / jsr $28615E         scoreKill $600
    26d85c  move.w #$20,D0 ...

**`($18,A6)` IS NOT `$47`'s HP.** It is a per-frame damage SINK: the bullet code decrements it, and each
frame `$47` computes `$7FFF - ($18,A6)` as the damage taken, subtracts that from the real HP -- a **LONG** at
`($32,A5)` -- and re-arms the sink to `$7FFF`. Reading `($18,A6)` as the HP, as every band member's
`tst.w ($18,A6)` does, would make `$47` effectively immortal.

**AND THE PORT ALREADY HAS THIS PATTERN, IN FOUR PLACES** -- `boss3.js:110`, `boss4.js:224`,
`handlers.js:6221` (all `u16(0x7fff - ...)`) and `midboss.js:727` (the re-arm). So do not invent it: read one
of those and match it. **Sixth family check to pay off this session**, and this one also settles what `$47`
is: the `$7FFF` sink plus a long HP accumulator is a BOSS/large-structure idiom, which together with
`pushExternalSpeed` on retirement and the per-frame palette repaint makes `$47` a scroll-stopping set-piece
beyond reasonable doubt.

Two more per-type details: the palette XOR uses the **literal `$F`** rather than `($19,A5)`, and the hit mask
is saved to `($6E,A6)` -- neither appears anywhere in the band.

Still to read for `$47`: `$26D810` (4 bytes, confirm the mask), `$26D738` (1 instruction), `$26D85C..$26DAC8`
(the death tail and alive path) and `$26DAC8` (the draw). Window `$26D740 + $A0`; check `$224F38` against
W91's palette family window.

### `$47` HAS TWO UNPORTED SHARED PREREQUISITES. PORT THEM FIRST, AS THEIR OWN WAVES. (W339)

Confirmed by displaying the bytes: `$26D810` is `725C C216` = `moveq #$5C,D1 / and.b (A6),D1`, the same `$5C`
mask the band uses. And `$26D738` is `jsr $23C4A0 / rts` -- the init's tail is a CALL.

Running the callee check on everything `$47` touches:

    $23C4A0   NOT PORTED   -- SIX callers ($26D738, $29B6EA, $2A5D14, +3)
    $26C74E   NOT PORTED   -- SIX callers ($26C7A8, $26C7CE, $26C838, +3)
    $26DCB6   NOT PORTED   -- reached by `bsr` from inside `$47`; likely private
    $28C310   ported       -- already used at `handlers.js:6160` as a death-burst cue
    $261100   ported       -- `pushExternalSpeed` (background.js)
    $24150A   ported       -- `installBank`
    $286096` / `$28615E` / `$2637A2` / `$26377A` / `$263808`   all ported

**`$26C74E` IS `$47`'s DEATH-SPAWN WALKER AND IT IS *NOT* `$270D92`.** `$26D880 lea ($26DCEC,PC),A1 / jsr
$26C74E` is the same construction the band uses with `$270D92`, but a different routine with its own six
callers. Do NOT reach for `walkDeathSpawns270D92` here; the entry format is unverified and W333's whole point
was that the stride must come from the code.

**SO THE ORDER IS: `$23C4A0`, THEN `$26C74E`, THEN `$47`.** Six callers each means both are shared
infrastructure, and W333 established the payoff: porting `$270D92` first turned three types from "read a
death arm each" into "one call each". Porting either of these inside `$47`'s wave repeats the mistake that
lesson exists to prevent -- and `$47` is `$E2` records, the wave least able to absorb a surprise.

**MORE `$47` PER-TYPE DETAILS** (none shared with the band): the death path pushes `pushExternalSpeed` a
SECOND time (`$26D864`, so both death and retirement stop the scroll); it marks with `(A6) = $8000` and
`($7F,A6) = 1` -- note **`+$7F`, not `+$3F`**, because the record is `$80` bytes; it clears `$8130DC`; its
sound cue is `$28C310` where the band uses `$28C2DC`; and its not-hit palette restore writes the **literal
`$10`** to `($1D,A6)` rather than `($18,A5)`.

Still to read for `$47`: `$26D89C..$26DAC8` (the rest of the alive path), `$26DAC8` (the draw), `$26DCB6`,
and the two prerequisites. Window `$26D740 + $A0`; check `$224F38` against W91's palette family window.

### CORRECTION: `$23C4A0` IS NOT A PREREQUISITE WAVE. IT IS THREE LINES. (W339)

The previous section said the order was "`$23C4A0`, then `$26C74E`, then `$47`", treating both as shared
infrastructure on the strength of six callers each. **That over-scoped `$23C4A0`.** Displayed:

    23c4a0  move.w #$1,$803934 / clr.w $803936 / rts
    23c4b0  move.w #$6,$803934 / clr.w $803936 / rts
    23c4c0  move.w #$5,$803934 / clr.w $803936 / rts
    23c4d0  clr.w $803934      / move.w #$1,$803936 / rts

**It is one of a family of three-instruction MODE SETTERS**, each writing a number to `$803934` and clearing
`$803936` (or the reverse). Six callers because it is a one-line helper, not because it is infrastructure --
**caller count alone does not distinguish "shared subsystem" from "trivial setter", and I used it as if it
did.**

And both globals are ALREADY in the port: `background.js:1336-1337` writes exactly `$803934 = 0` /
`$803936 = 1`, which **is `$23C4D0`, inlined** in the screen-shake arm. So these are the screen-shake / camera
mode words, the port already produces and consumes them, and `$23C4A0` is two `setU16` calls plus a name.

**REVISED ORDER: `$26C74E` (the real prerequisite, `$47`'s death-spawn walker), then `$47`, with `$23C4A0`
written inline inside `$47`'s wave as `shakeMode23C4A0` or similar.** One wave saved.

**SEVENTH family check to pay off this session**, and the first where it corrected a plan rather than a fact.
The lesson sharpens: run the check on every callee, and read the FIRST INSTRUCTION before deciding a routine
deserves its own wave. `$2714AE` was a bare `rts` (W336), `$23C4A0` is three instructions -- twice now, sizing
a routine by its caller count or its address rather than by its body has produced the wrong plan.

### `$26C74E` IS `$270D92`'s TWIN, DIFFERING IN ONE CONSTANT. THE LAST PREREQUISITE COLLAPSES. (W339)

    $26C74E head:  32 19 0c 41 ff ff 67 00 00 34    move.w (A1)+,D1 / cmpi.w #-1,D1 / beq $26C78A
    $270D92 head:  32 19 0c 41 ff ff ...             IDENTICAL

    $270DB6:  31 7c 00 04 00 1e     move.w #$4,($1E,A0)
    $26C772:  31 7c 00 10 00 1e     move.w #$10,($1E,A0)    <-- THE ONLY DIFFERENCE

Field for field the same walker: word 1 to `($18,A0)`, word 2 as the effect KIND through `$289004`, word 3's
LOW BYTE to `($1C,A0)`, a LONG to `($26,A0)`, the caller's D2 to `($2,A0)`, zeros to `($12,A0)`/`($14,A0)`,
word 6 to `($1A,A0)`, `$FFFF` terminates, twelve bytes per entry. **The only divergence in the whole routine
is `($1E,A0)`: `$4` in `$270D92`, `$10` in `$26C74E`.**

So there is **no prerequisite wave left**. `effects.js:348` already hardcodes `ram.setU16(slot + 0x1e, 4)`;
give `walkDeathSpawns270D92` an `anim` parameter defaulting to `4`, pass `0x10` for `$26C74E`, and pass the
site address as it already does. Both of `$47`'s "prerequisites" have now dissolved -- `$23C4A0` into three
inline lines, `$26C74E` into one parameter.

**EIGHTH family check to pay off this session, and it retired the entire prerequisite plan.** The sequence is
worth reading as one thing: caller count said "two shared subsystems, two waves"; displaying ten bytes of each
said "one parameter and two `setU16`s". **`$47` can now be written as a single wave** once `$26D89C..$26DAC8`,
`$26DAC8` and `$26DCB6` are read.

Do keep the two names distinct in the port. The generalised helper should still record BOTH addresses in its
docstring and the caller should pass the site (`0x271680`-style) so `bulletSpawn`/note attribution stays
truthful about which ROM routine ran -- W333's `siteAddr` parameter already exists for exactly this.

### `$47`'s ALIVE PATH, `$26D89C..$26D8FE` (W339) -- `($17,A5)` IS A STATE VARIABLE HERE

    26d89c  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000
    26d8aa  cmpi.l #$800,D0 / bgt $26D8CC        <-- limit $800, a FIFTH distinct value
    26d8b4  tst.b ($16,A5) / beq $26D8D2
    26d8bc  move.w #$0,$8130DC / jmp $263762     the off-screen free ALSO clears the global
    26d8cc  move.b #$1,($16,A5)
    26d8d2  jsr $24179E                          scrollCompensate
    26d8d8  tst.b ($7F,A6) / bne $26DAC8         the mark -- and $26DAC8 IS THE DRAW
    26d8e0  cmpi.b #$0,($17,A5) / bne $26D8F8    <-- ($17,A5) AS A STATE NUMBER
    26d8ea  subq.w #1,($1C,A5) / bne $26D8F8     a WORD countdown, not a byte
    26d8f2  move.b #$1,($17,A5)                  state 0 -> 1
    26d8f8  cmpi.b #$1,($17,A5) / bne $26D976    state 1's arm begins

**A MARKED `$47` DOES NOT DRAW. THIS SENTENCE PREVIOUSLY CLAIMED THE OPPOSITE AND WAS WRONG.**
`$26D8DC` branches to `$26DAC8`, which I recorded as "the draw" -- but `$26DAC8` is itself
`tst.b ($7F,A6) / bne $26DAF2`, and `$26DAF2` is `4E75`, an `rts`. So the mark is tested a SECOND time at
the draw's own entry and a marked `$47` returns without painting, exactly like `$48` and `$4A`. I called
`$26DAC8` the draw from the branch target alone without displaying its first instruction -- the same error
this document records eight other instances of.

**`($17,A5)` IS A STATE NUMBER, NOT A MIRROR FLAG.** In all four band members `($17,A5)` was the
mirror/table-select bit written once by the init. `$47` uses it as a multi-state machine variable, tested
with `cmpi.b #$0` then `cmpi.b #$1`, advanced by a countdown on `($1C,A5)`. **The band's reading of that
offset does not transfer** -- and `($1C,A5)` is likewise a WORD countdown here where the band used it as a
sweep/ring index.

**Nothing about record offsets is portable between `$47` and the band.** `($17,A5)` state vs mirror,
`($1C,A5)` countdown vs index, `($18,A6)` damage sink vs HP, `+$7F` mark vs `+$3F`, `($32,A5)` long HP
where the band has none. Read every offset from `$47`'s own code.

Five off-screen limits now, one idiom: `$2000` (`$49`), `$1C00` (`$4A`), `$400` (`$4B`), `$2C00` (`$48`),
`$800` (`$47`).

Still to read for `$47`: `$26D8FE..$26DAC8` (states 1+), `$26DAC8` (the draw) and `$26DCB6`.

### `$47` STATE 1, `$26D902..$26D970` (W339) -- SEVEN word-literal-as-two-bytes writes in a row

    26d902  subq.b #1,($18,A5) / bcc $26D976       a cadence on ($18,A5)/($19,A5)
    26d90a  move.b ($19,A5),($18,A5)
    26d910  addq.w #4,($1A,A5) / cmpi.w #$1C,($1A,A5) / blt      an OPENING RAMP, 8 steps of 4
    26d91e  move.w #$1C,($1A,A5)                   clamped, not wrapped
    26d924  move.w #$0,$803934 / move.w #$0,$803936    <-- CLEARS BOTH SCREEN-SHAKE WORDS
    26d934  move.b #$2,($17,A5)                     state 1 -> 2
    26d93a  move.w #$1020,($1E,A5)                  ($1E)=$10  ($1F)=$20
    26d940  move.w #$606,($20,A5)                   ($20)=$06  ($21)=$06
    26d946  move.w #$6,($22,A5)                     ($22)=$00  ($23)=$06   <-- THE TRAP, PUREST FORM
    26d94c  move.w #$2030,($24,A5)                  ($24)=$20  ($25)=$30
    26d952  move.w #$404,($26,A5)                   ($26)=$04  ($27)=$04
    26d958  move.w #$4,($28,A5)                     ($28)=$00  ($29)=$04   <-- again
    26d95e  move.b #$0,($2A,A5) / move.b #$0,($2B,A5)   genuine BYTE writes, for contrast
    26d96a  move.w #$6040,($2C,A5)                  ($2C)=$60  ($2D)=$40

**THE WORD-LITERAL RULE, SEVEN TIMES IN ONE BLOCK.** `move.w #$6,($22,A5)` writes **`$00` to `($22,A5)`
and `$06` to `($23,A5)`** -- the byte the literal names lands in the SECOND field. Read as "`($22,A5) = 6`"
this whole block would misconfigure seven cadence pairs at once, and every one of them is a timer reload,
so the symptom would be wrong firing rates rather than a crash.

`$26D95E`/`$26D964` are genuine `move.b`s to `($2A,A5)` and `($2B,A5)`, sitting in the middle of the block.
**The mix is the hazard**: two real byte writes among seven word-pair writes, so a reader who spots the rule
and applies it uniformly gets those two wrong in the other direction.

**`$26D924` CONFIRMS THE SCREEN-SHAKE READING.** The init calls `$23C4A0`, which sets `$803934 = 1` and
clears `$803936`; state 1 clears BOTH. So `$47` starts a screen shake on spawn and stops it when its opening
ramp completes -- which is exactly what a scroll-stopping set-piece arriving on screen would do, and it
independently corroborates that `$803934`/`$803936` are the shake mode words `background.js` already writes.

`($1A,A5)` is an 8-step ramp CLAMPED at `$1C` (`move.w #$1C` after the `blt`), not wrapped -- unlike every
band ring. `($18,A5)`/`($19,A5)` are a cadence pair here, where in the band `($18,A5)` was the base palette.

Still to read for `$47`: `$26D976` onward (state 2+), `$26DAC8` (the draw) and `$26DCB6`.

### `$47` STATE 2, `$26D98E..$26D9E2` (W339) -- THE PACKED-LONG BORROW, DEMONSTRATED BY THE ROM ITSELF

    26d98e  tst.w $8130D4 / bne $26DA74            the freeze (D4, not D2 -- $47 tests BOTH, separately)
    26d998  movem.w ($2,A6),D0-D1                  SIGN-EXTENDING
    26d99e  addi.w #-$580,D0  /  addi.w #-$800,D1   muzzle 1's WORD biases
    26d9a6  jsr $24200A / bcs $26DA74              aim -- and a REAL `bcs` here, unlike $4A/$48
    26d9b0  moveq #$D,D0 / move.l ($2,A6),D2
    26d9b6  addi.l #-$5800800,D2                   = $FA7FF800   <-- NOTE THE HIGH WORD
    26d9c0  movem.w ($2,A6),D0-D1
    26d9c6  addi.w #-$580,D0  /  addi.w #$800,D1    muzzle 2: same X bias, OPPOSITE Y
    26d9ce  jsr $24200A
    26d9d4  moveq #$D,D0 / move.l ($2,A6),D2
    26d9da  addi.l #-$57FF800,D2                   = $FA800800

**THE ROM PRE-SUBTRACTS THE BORROW AND A PORT MUST NOT RE-DERIVE IT.** Muzzle 1's word biases are `-$580`
(high) and `-$800` (low). Combining them naively gives `$FA80F800`. **The ROM's longword is `$FA7FF800`** --
high word `$FA7F`, one LESS -- because as a single `addi.l` the low half's borrow takes one off the high
half. Muzzle 2's low bias is POSITIVE, so no borrow, and its long `$FA800800` does match naive combination.

So the two muzzles differ by exactly the borrow, and that is the cleanest demonstration in the whole port of
why packed position offsets must be transcribed as the longword the ROM writes rather than assembled from
the word pair. **Transcribe `$FA7FF800` and `$FA800800` literally.** Deriving either from `-$580`/`∓$800`
gets muzzle 1 one unit off in X -- invisible in a test, visible as a misaligned muzzle.

**`$24200A` IS KNOWN TO THE PORT**: `aim.js:81` carries it in the aim-variant table as `[0x24200a, 61]` --
sixty-one callers. But `initbody.js:822` still holds a `note` for it in type `$80`'s init, so **check whether
the variant is actually executed or only tabulated** before relying on it; that distinction is exactly what
`grep 0x2xxxxx is NOT a test for "is this ported"` was written for.

Two more `$47`-only details: it tests `$8130D4` here having tested `$8130D2` at `$26D7E0`, so it gates on
BOTH freeze words at different points -- no band member does that. And `$26D9AC bcs` is a REAL carry test on
the aim result, where `$4A` and `$48` have none and store the biased X instead (W323's trap). `$47` skips the
volley properly.

Still to read for `$47`: `$26D9E8..$26DAC8` (state 2's tail and state 3+), `$26DAC8` (the draw), `$26DCB6`.

### THE PACKED-LONG BORROW, NOW A CHECKED RULE ACROSS FOUR MUZZLES (W339)

`$47`'s state 2 fires from at least five muzzles, each set up as a word pair for the aim and a longword for
the bullet position. Tabulating four of them against the ROM's own constants:

      Xbias   Ybias    ROM long    naive       borrow?
      -1408   -2048    fa7ff800    fa80f800    YES
      -1408   +2048    fa800800    fa800800    no
      +3968   +1728    0f8006c0    0f8006c0    no
      +5056   -1024    13bffc00    13c0fc00    YES

**`long = ((Xbias << 16) | Ybias) - (0x10000 if Ybias < 0 else 0)`** -- verified against all four. The high
word is decremented by exactly one whenever the Y bias is negative, because a single `addi.l` propagates the
low half's borrow.

That is no longer an abstract caution: **two of these four differ from the naive combination and two do not**,
in the same routine, with the same X bias in the first pair. A port that derived the longs from the word pairs
would misplace the negative-Y muzzles by one unit in X and leave the positive-Y ones correct -- the worst
possible failure shape, because it looks like a subtle art or table problem rather than an arithmetic one.

**TRANSCRIBE EVERY `addi.l` CONSTANT LITERALLY.** Do not compute it, do not "simplify" it to the word pair it
appears to encode, and do not assume two muzzles with the same X bias share a high word. The four constants
above and any further ones in `$26DA5E..$26DAC8` come out of the image verbatim.

This is also why `movem.w ($2,A6),D0-D1` matters alongside them: the aim path gets SIGN-EXTENDED words and the
position path gets the packed longword. Two different readings of the same `($2,A6)` in adjacent instructions.

Still to read for `$47`: `$26DA5E..$26DAC8` (the remaining muzzles and state 2's tail), `$26DAC8` (the draw)
and `$26DCB6`.

### `$47`'s SECOND STATE MACHINE MIXES A5 AND A6 AT THE SAME OFFSET (W339)

    26da6a  addi.l #$13C00400,D2               muzzle 5: +$13C0/+$400, positive Y, NO borrow -- rule holds
    26da74  0c2d 0001 002e   cmpi.b #$1,($2E,A5)      <-- tests A5
    26da7a  bne $26DA90
    26da7e  536e 002e        subq.w #1,($2E,A6)       <-- decrements A6
    26da82  bne $26DA90
    26da86  bsr $26DB14                              another private subroutine
    26da8a  move.b #$2,($2E,A5)                       advances A5
    26da90  cmpi.b #$2,($2E,A5) / bne $26DAAC         state 2's arm

**THE OFFSET IS `$2E` IN ALL FOUR INSTRUCTIONS AND THE BASE REGISTER IS NOT.** `$26DA74` and `$26DA8A` use
**A5** (the record); `$26DA7E` uses **A6** (the sub-record). Checked in the encoding rather than trusted from
the disassembler: `536E` is `subq.w #1,(d16,A6)` -- `536D` would be A5. So the state number lives at
`($2E,A5)` and its countdown lives at `($2E,A6)`, two different fields that share an offset.

This reads exactly like a transcription slip and is not one. **A port that "corrected" it to a single field
would fuse a state variable with its timer**, and the symptom would be a set-piece that changes phase on the
wrong frame -- no crash, nothing for the suite to catch. Copy the register letters from the encoding, and when
`$47` is written, put a comment on that line saying why the two differ, or the next reader will try to fix it.

Note also this is a SECOND state machine: `($17,A5)` drives states 0/1/2 (`$26D8E0` onward) and `($2E,A5)`
drives an independent one nested inside state 2. `($2E,A5)` is also the offset `bossf23.js`/`bossphase.js`
read as a per-part dead flag on OTHER types -- another offset whose meaning does not travel.

Muzzle 5's long `$13C00400` is the fifth data point for the borrow rule and it agrees: positive Y, no borrow,
naive combination correct.

Still to read for `$47`: `$26DAAC..$26DAC8`, `$26DAC8` (the draw), `$26DB14` and `$26DCB6`.

### `$47` STATE 3 AND THE DRAW ENTRY, `$26DAAC..$26DAD0` (W339) -- plus a correction

    26daac  cmpi.b #$3,($2E,A5) / bne $26DAC8
    26dab6  bsr $26DC00 / bcs $26DAC8            a subroutine that reports FAILURE through carry
    26dabe  move.b #$2,($2E,A5)                  on success, back to state 2
    26dac4  bsr $26DB14
    26dac8  tst.b ($7F,A6) / bne $26DAF2         <-- the draw's OWN mark test
    26dad0  lea ($26DAF4,PC),A0                  the draw table
    26daf2  4E75                                 rts

**CORRECTION, and it is the ninth of this kind in this run.** An earlier section here said "a marked `$47`
STILL DRAWS", reasoning that `$26D8DC bne $26DAC8` jumps to the draw. `$26DAC8`'s first instruction is
another `tst.b ($7F,A6)` whose `bne` lands on an `rts`. **A marked `$47` returns without painting**, the
same as `$48` and `$4A`. I named `$26DAC8` "the draw" from the branch target alone, without displaying its
first instruction. Corrected in place above.

The pattern in every one of these nine: I described a span I had not displayed. The fix each time was one
command. **Display the first instruction of every branch target before naming what it is.**

**`($2E,A5)` STATES 2 AND 3 FORM A LOOP.** State 3 calls `$26DC00`, and on CARRY CLEAR returns to state 2
and calls `$26DB14`; on carry set it falls through to the draw and stays in state 3. So `$26DC00` reports
failure through carry -- read it before writing this, because "which way the carry means retry" decides
whether the set-piece cycles or stalls.

Two more private subroutines to read: `$26DB14` (called from both state 2's inner machine and state 3) and
`$26DC00`. With `$26DCB6` that is three, plus the draw body from `$26DAD0`.

Still to read for `$47`: `$26DAD0..$26DAF2` (the draw body), `$26DAF4` (its table), `$26DB14`, `$26DC00`,
`$26DCB6`.

### `$47`'s DRAW BODY, `$26DAD0..$26DAF2` (W339) -- IT HAS NO TABLE INDEX

    26dad0  41fa 0022    lea ($26DAF4,PC),A0
    26dad4  4e71         nop
    26dad6  2410         move.l (A0),D2          <-- NO `adda.w`. ALWAYS entry 0.
    26dad8  move.l ($2,A6),D1
    26dadc  addi.l #-$1BFF1600,D1                 = $E400EA00
    26dae2  move.w #$1CB0,D3
    26dae6  moveq #$0,D4 / move.b ($1D,A6),D4     <-- D4 from the PALETTE byte, not ($1C,A6)
    26daec  jsr $23DECE
    26daf2  rts

**TWO THINGS HERE THAT EVERY SIBLING WOULD HAVE MISLED ME ABOUT, AND I DISPLAYED THE BYTES FIRST.**

**1. NO INDEX.** `$49`, `$4A`, `$4B` and `$48` all do `lea table,A0 / adda.w ($1C,A5),A0 / move.l (A0),D2`.
`$47` does `lea / nop / move.l (A0),D2` -- there is no `adda.w`, so the main draw ALWAYS uses entry 0,
`$31A600`. The eight-entry table at `$26DAF4` (uniform step `$9A4`) is real, but the main draw never indexes
into it; the remaining seven entries must be reached by the private subroutines (`$26DB14`, `$26DC00`,
`$26DCB6`), which is consistent with a multi-part set-piece drawing its pieces from one table. **Do not add
an index. Do not assume the ring counter feeds this.**

**2. D4 COMES FROM `($1D,A6)`, THE PALETTE BYTE**, via `moveq #$0,D4 / move.b ($1D,A6),D4`. Every band
member loads D4 from `($1C,A6)` with `move.w`. Here it is a BYTE from the next offset -- so `$47`'s draw
passes its palette where its siblings pass their sprite/bank field. Getting this wrong swaps two fields at
once and produces a set-piece drawn in the wrong colours from the wrong bank.

This is the tenth time in this run that displaying beat inferring, and the first where the habit caught the
error BEFORE it reached a document -- I expected an `adda.w` from four consecutive siblings and checked
instead of writing it down. That is the whole return on the rule.

Still to read for `$47`: `$26DB14`, `$26DC00`, `$26DCB6`. Then it can be written: two windows
(`$26D740 + $A0`, and one covering `$26DAF4 + $20` for the eight-entry table), no unported prerequisite, and
twelve traps documented above.

### `$26DB14` (W339) -- a 60-pass `dbra` that computes a triangular number. TRANSCRIBE THE LOOP.

    26db14  move.w #$258,($2A,A6)          TWO byte fields: ($2A)=$02 ($2B)=$58
    26db1a  move.w #$104,($28,A6)          TWO byte fields: ($28)=$01 ($29)=$04
    26db20  jsr $242EC2 / andi.w #$1F,D0   an RNG draw masked to 0..31
    26db2a  move.b #$40,($2C,A6) / sub.b D0,($2C,A6)     ($2C) = $40 - rng
    26db34  move.b #$0,($2D,A6)
    26db3a  move.w #$3B,D7                 <-- #$3B + dbra = SIXTY passes
    26db3e  addq.b #1,($2D,A6)
    26db42  move.b ($2D,A6),D0
    26db46  add.b D0,($2C,A6)
    26db4a  dbra D7,$26DB3E
    26db4e  rts

**THE LOOP IS A TRIANGULAR-NUMBER ACCUMULATION AND IT FOLDS**, verified for rng = 0, 1 and `$1F`:

    ($2D,A6) = $3C  (60)
    ($2C,A6) = ($40 - rng + 1830) & $FF = ($66 - rng) & $FF     [1830 = 60*61/2, mod 256 = $26]

**Transcribe the loop anyway.** The fold is correct, but writing `($2C,A6) = (0x66 - rng) & 0xff` puts a
derived constant in the port where the ROM has an iteration, and the next reader cannot check it without
redoing this algebra. A sixty-iteration byte loop costs nothing at runtime. If it is folded, the proof above
must sit in the comment -- and `move.w #$3B,D7` + `dbra` being SIXTY and not fifty-nine is exactly the kind
of off-by-one the fold would bake in permanently.

Two more `move.w`-into-byte-pairs at the top (`$258` -> `$02`/`$58`, `$104` -> `$01`/`$04`), bringing this
routine's count of that idiom to two and `$47`'s total to nine.

**AND `$26DB14` IS `($2E,A5)`'s TRANSITION ACTION.** It is called from state 2's inner machine (`$26DA86`)
and from state 3 on success (`$26DAC4`), and it re-seeds `($28,A6)` through `($2D,A6)` each time. So the
set-piece's cycle is: state 2 counts down, `$26DB14` re-seeds, state 3 tests `$26DC00`, on success re-seed
again and return to state 2. **`$26DC00` is the last thing needed to know whether that cycle terminates.**

Still to read for `$47`: `$26DC00` and `$26DCB6`.

### `$26DC00` (W339) -- `subq.b` + `bpl`, so the counter goes NEGATIVE. `due8` IS WRONG HERE.

    26dc04  subq.b #1,($48,A6) / bpl $26DC3C      <-- bpl, NOT bcc. SIGNED.
    26dc0a  move.b ($4C,A6),D0 / addi.b #$10,D0
    26dc12  cmpi.b #$20,D0 / bhi $26DC28          an UNSIGNED range test: is ($4C,A6) outside -$10..+$10?
    26dc1a  cmpi.b #-$2,($48,A6) / bgt $26DCA2    inside the band: threshold -2
    26dc28  cmpi.b #-$3,($48,A6) / bgt $26DCA2    outside it: threshold -3
    26dc32  move.b ($49,A6),($48,A6) / bra $26DCA2    the reload

**THE COUNTER IS SIGNED AND RUNS PAST ZERO.** `subq.b` then `bpl` continues while the result is
NON-NEGATIVE, so `($48,A6)` reaches `-1`, `-2`, `-3` before the reload. **The port's `due8` helper implements
the `bcc`/underflow convention** -- fire when the decrement borrows -- which is what six of seven countdowns
in W27 used and what every band member uses. Using `due8` here fires a frame early and never reaches the
negative thresholds at all. Write this countdown by hand.

**AND THE THRESHOLD DEPENDS ON AN ALIGNMENT TEST.** `($4C,A6) + $10` compared `bhi #$20` is the idiomatic
signed-range-via-unsigned-compare: it asks whether `($4C,A6)` lies within `-$10..+$10`. Inside that band the
counter is allowed to reach `-2`; outside it, `-3`. So the set-piece holds one extra frame when whatever
`($4C,A6)` measures is near zero. Three different comparison flavours in nine instructions -- `bpl` signed,
`bhi` unsigned, `bgt` signed -- and each one is load-bearing.

**WHAT THIS DOES *NOT* ANSWER.** `$26DABA bcs` expects `$26DC00` to report through CARRY, and nothing in
`$26DC00..$26DC38` sets carry explicitly; every path here branches to `$26DCA2`, which is still unread. So
**whether the state-2/state-3 cycle terminates is still open** and `$26DCA2` onward is the place it is
decided. Recorded as open rather than guessed, because the earlier version of this section would have said
"the gate reloads and returns" and been describing a span it had not displayed.

Still to read for `$47`: `$26DC3C..$26DCB6` (including `$26DCA2`, which carries the answer above) and
`$26DCB6` itself.

### `$26DCA2` ANSWERS THE CARRY QUESTION, AND `$26DCB6` EXPLAINS `($6E,A6)` (W339)

    26dca2..26dca8   6 bytes NOT YET DISPLAYED -- the condition that picks between the two exits
    26dcaa  ori  #$1,SR    / rts        <-- FAILURE: carry SET
    26dcb0  andi #$FFFE,SR / rts        <-- SUCCESS: carry CLEAR

**So `$26DC00` does report through carry, by writing SR directly** -- the same house idiom as `$281842
ori #$1,SR` on the bullet spawner's full-pool path (W336). Two independent routines in this ROM return
status by `ori`/`andi` on SR rather than by a flag-setting operation, so treat "explicit SR write" as this
codebase's convention for a boolean return and look for it whenever a caller has a `bcs`/`bcc` with no
obvious flag source. The condition at `$26DCA2` is still six undisplayed bytes; **`$26DABA bcs` means carry
set is the retry/stall path**, so those six bytes decide whether the state-2/3 cycle advances.

    26dcb6  tst.b ($7F,A6) / beq $26DCE0        <-- runs ONLY when the record IS MARKED
    26dcbe  cmpi.b #$0,($66,A6) / bne $26DCE0
    26dcc8  move.w ($6E,A6),D1                  <-- THE HIT MASK THE DAMAGE ARM SAVED

**`$26DCB6` IS WHY `$26D81E move.w D1,($6E,A6)` EXISTS.** That store looked gratuitous when the damage arm
was read -- no band member saves its hit mask -- and this is its only consumer. `$26DCB6` runs on MARKED
records only (`beq` skips when the flag is clear, the inverse polarity of the three tests in the handler) and
reads the saved mask to drive its dying-state effect. **So the damage arm's `($6E,A6)` write must be ported
even though nothing in the damage arm itself uses it.**

That is the fourth place `($7F,A6)` is tested and the first with INVERTED sense: the handler's three tests
skip work when the mark is SET, and this one skips when it is CLEAR. A port that factored "if marked, return"
into a shared guard would invert this routine.

Still to read for `$47`: `$26DCA2..$26DCA8` (six bytes -- the carry condition), `$26DC3C..$26DCA2`, and
`$26DCCC..$26DCE0` (the rest of `$26DCB6`). Then the read is complete.

### THE OPEN QUESTION IS ANSWERED: `$47`'s STATE-2/3 CYCLE TERMINATES (W339)

    26dca2  subq.w #1,($4A,A6)
    26dca6  beq $26DCB0          <-- ZERO, not underflow
    26dcaa  ori  #$1,SR / rts     carry SET   -> $26DABA bcs -> stay in state 3
    26dcb0  andi #$FFFE,SR / rts  carry CLEAR -> state 3 goes back to state 2 and re-seeds

**`($4A,A6)` IS A REPEAT COUNTER AND THE CYCLE RUNS EXACTLY THAT MANY TIMES.** While it is non-zero
`$26DC00` returns carry SET, `$26DABA bcs` sends `$47` to the draw and it stays in state 3. On the frame the
counter REACHES zero, carry is clear, state 3 writes `#$2` to `($2E,A5)` and calls `$26DB14` to re-seed. So
the set-piece cycles a bounded number of times rather than indefinitely -- the question left open two
sections ago, now answered by displaying the six bytes rather than reasoning about them.

**AND IT IS THE `$25354C` SHAPE, WHICH THIS PROJECT HAS ALREADY BEEN BITTEN BY.** `subq.w` + **`beq`** fires
when the counter REACHES zero, not when it underflows. W29's `$25354C` note and the test in
`integration.test.js` ("`$25354C` fires when `$81B410` REACHES zero, not when it underflows") exist precisely
because six of seven W27 countdowns use the `subq`/`bcc` underflow shape and applying that heuristic to a
`beq` one acts a frame late and then again every 65,536 frames. **`$47` now contains BOTH conventions**:
`$26DC04`'s `subq.b`/`bpl` (signed, runs negative) and `$26DCA2`'s `subq.w`/`beq` (fires at zero), fourteen
bytes apart. Neither is `due8`.

Three countdown conventions are now attested in this ROM and `$47` uses two of them in one routine:

    subq + bcc    fire on UNDERFLOW      the common shape; `due8` implements this
    subq + bpl    run into NEGATIVES     $26DC04 -- thresholds at -2/-3
    subq + beq    fire AT ZERO           $26DCA2, and $25354C (W29)

**Read the branch mnemonic on every countdown.** It is two characters and it selects between three different
behaviours.

Still to read for `$47`: `$26DC3C..$26DCA2` and `$26DCCC..$26DCE0`. Everything else is read.

### `$47` STATE 3'S ATTACK IS RANK-GATED, `$26DC3C..$26DC74` (W339)

    26dc40  move.l #$FFFD0004,D0
    26dc46  move.l ($2,A6),D2 / addi.l #$10000000,D2     a PURE high-word bias: +$1000 X, 0 Y, no borrow
    26dc50  moveq #$0,D3 / moveq #$0,D4
    26dc54  tst.w $813098 / bne $26DC70                  <-- THE RANK GATE ($813098 = G.rank98)
    26dc5e  jsr $281744                                  rank 0: shot 1
    26dc64  neg.b D1                                     ... mirrored by a BYTE negate
    26dc66  jsr $281744                                  ... shot 2
    26dc6c  bra $26DCA2                                  straight to the repeat counter
    26dc70  tst.w ($4E,A6) / bne $26DC8A                 rank > 0: a DIFFERENT, longer pattern

**THE ATTACK SCALES WITH RANK AND THE TWO ARMS ARE STRUCTURALLY DIFFERENT.** At rank 0 `$47` fires a
mirrored PAIR and jumps straight to the repeat counter. Above rank 0 it takes a separate arm gated on
`($4E,A6)` running to at least `$26DC8A`. This is not a parameter difference like the band's -- it is two
code paths. `$813098` is already `G.rank98` in `handlers.js` and `$81B414`-style rank reads appear across the
port, so the gate itself is familiar; **what matters is not folding the two arms together.**

**`neg.b D1` IS A HEADING MIRROR AND IS NOT THE `neg.w` TRAP.** Headings in this game are BYTES over 256
directions, so `neg.b` is the correct and complete mirror. That is a different operation from `$27172C`/
`$271E30`'s `neg.w D3` on a `move.l`-loaded PACKED OFFSET, where the word negate leaves the high half alone
and is a trap. **Two negates, two widths, two purposes** -- do not unify them or "fix" either. The
distinguishing question is what the register holds: a heading byte or a packed coordinate pair.

`$26DC4A addi.l #$10000000` is also worth one line: a pure high-word bias, so there is no borrow and the
naive reading is correct here. That makes three flavours of position bias in `$47` alone -- borrowing
(`$FA7FF800`), non-borrowing negative-Y (`$FA800800`) and high-word-only (`$10000000`) -- and only the first
needs the rule.

Still to read for `$47`: `$26DC74..$26DCA2` (the rank > 0 arm) and `$26DCCC..$26DCE0`.

### `$47` STATE 3, THE RANK > 0 ARM, `$26DC70..$26DCA0` (W339) -- IT ALTERNATES BULLET TYPES

    26dc70  tst.w ($4E,A6) / bne $26DC8A
    26dc78  jsr $281744 / neg.b D1 / jsr $281744    toggle 0: a mirrored pair, the RANK-0 spawner
    26dc86  bra $26DC98
    26dc8a  jsr $2816F6 / neg.b D1 / jsr $2816F6    toggle 1: a mirrored pair, a DIFFERENT spawner
    26dc98  addq.w #1,($4E,A6) / andi.w #$1,($4E,A6)    the 0/1 TOGGLE
    26dca2  ... falls into the repeat counter

**SO THE RANK SCALING IS AN INTERLEAVE, NOT A VOLUME INCREASE.** At rank 0, `$47` fires a mirrored pair
through `$281744` every volley and nothing else. Above rank 0 it fires the SAME pair count but alternates the
spawner every volley -- `$281744`, then `$2816F6`, then `$281744` -- so the player sees two bullet types
interleaved rather than more bullets. That is a much more specific piece of behaviour than "harder at rank",
and it is the kind of thing a port that collapsed the two arms would silently lose while still looking right
in a screenshot.

`($4E,A6)` is masked with `andi.w #$1`, the same 2-state toggle construction as `$48`'s `($25,A5)`
(`addq.b #1 / andi.b #$1`) -- one of the few idioms that IS shared across this part of stage 5. `neg.b D1`
mirrors the pair in all three arms identically.

**`$47`'s STATE-3 ATTACK IS NOW FULLY READ:**

    rank 0                 mirrored pair via $281744
    rank > 0, ($4E,A6)=0   mirrored pair via $281744
    rank > 0, ($4E,A6)=1   mirrored pair via $2816F6

all sharing D0 = `$FFFD0004`, D2 = `($2,A6) + $10000000`, D3 = D4 = 0.

Still to read for `$47`: `$26DCCC..$26DCE0` only -- the tail of `$26DCB6`, the marked-record effect. That is
the last span.

### `$47` IS READ END TO END (W339). `$26DCB6` IS WHAT RETIRES IT, AND `+$7E`/`+$7F` ARE DIFFERENT FLAGS.

    26dcb6  tst.b ($7F,A6) / beq $26DCE0        runs only when MARKED (inverted vs the handler's tests)
    26dcbe  cmpi.b #$0,($66,A6) / bne $26DCE0
    26dcc8  move.w ($6E,A6),D1                  the hit mask the damage arm saved at $26D81E
    26dccc  jsr $243E02                         armScreenClearMode -- ALREADY PORTED (midboss.js:235)
    26dcd2  subq.w #1,($70,A6) / bne $26DCE0    a word countdown
    26dcda  move.b #$1,($7E,A6)                 <-- SETS THE HANDLER'S RETIREMENT TRIGGER
    26dce0  andi #$FFFE,SR / rts                carry clear
    26dce6  ori  #$1,SR    / rts                carry set

**THE LIFETIME LOOP CLOSES HERE.** Damage sets the `$8000` mark and `($7F,A6) = 1` (`$26D86A`/`$26D86E`).
`$26DCB6` then runs on marked records only, feeds the saved hit mask to `armScreenClearMode`, and counts
`($70,A6)` down; when that reaches zero it sets **`($7E,A6) = 1`**, which is exactly what the handler tests at
`$26D7EA` to run its retirement (clear `$8130DC`, `pushExternalSpeed`, `freeEnemy`).

**`+$7E` AND `+$7F` ARE ADJACENT BYTES WITH COMPLETELY DIFFERENT ROLES.** `($7F,A6)` means "I am dying" and
gates four tests; `($7E,A6)` means "retire me now" and gates one. One byte apart, in an `$80`-byte record, both
written as `move.b #$1`. **Do not conflate them and do not typo them** -- swapping them makes `$47` either
immortal or instantly gone, and both look like a spawn-table problem rather than a one-nibble error.

**`$243E02` IS ALREADY PORTED** as `armScreenClearMode` (`midboss.js:235`, nine callers). **NINTH family check
to pay off this session.** So `$47` has NO unported callee of any kind:

    ported: $2637A2 $26377A $263808 $286096 $28615E $24179E $24200A $242EC2 $24150A $261100
            $23DECE $243E02 $28C310 $26C74E (via the W339 anim parameter)
    inline: $23C4A0 (three lines)
    omit:   nothing

**`$47` CAN NOW BE WRITTEN.** Windows: `$26D740 + $A0` (16-word record prototype + FOUR sub prototypes,
overlapping the handler by SIXTEEN bytes) and one covering `$26DAF4 + $20` (the eight-entry draw table) plus
`$26DCEC` (the `$26C74E` death list -- measure its length first). Twenty-one traps are documented in the
sections above; the load-bearing ones are the `($18,A6)` damage sink, the `+$7E`/`+$7F` pair, the three
countdown conventions, the packed-long borrow, the missing draw index, and the rank interleave.

### `$1A`'s BLOCKER IS NOW ONE SPECIFIC READ, NOT AN OPEN QUESTION (W340)

The standing note said `$1A` is "blocked until D2/D3 at `$268D8C` are measured". Narrowed:

    268d72  jsr $263808                       readInitPosition
    268d78  lea $272C7A,A0
    268d7e  movem.w ($2,A6),D0-D1             SIGN-EXTENDING -- sets D0 and D1 ONLY
    268d84  addi.w #$B00,D0
    268d88  addi.w #$0,D1                     a REAL instruction that adds zero; do not drop it
    268d8c  jsr $24203E
    268d92  bcc $268D98

**`aim.js:62` ALREADY DOCUMENTS THE CONVENTION**: `core64: 0x24203e,  // aim64 CORE  self=D0/D1
target=D2/D3 -> D1`. So D2/D3 are the TARGET coordinates, and reading upward from `$268D8C` until they
are dead: **nothing in `$1A`'s init writes them at all.** `$268D7E` sets D0/D1, `$268D78` sets A0, and
before that is `jsr $263808`. So the target is whatever `readInitPosition` leaves in D2/D3.

**THE BLOCKER IS THEREFORE: read `$263808` to its `rts` and record its exit state in D2/D3.** That is one
routine and one register pair, not an open-ended provenance hunt. Two possibilities and they are
distinguishable by reading it: either `$263808` deliberately leaves the player position there (in which
case `$1A` aims at the player and the port passes it explicitly), or it leaves something incidental (in
which case `$1A`'s init aims at garbage by construction and the `bcc` at `$268D92` is what saves it -- and
the port must reproduce that, not "fix" it).

`$268D88 addi.w #$0,D1` is worth its own line: **adding zero is a real instruction here**, not padding. It
sets flags, and while `$268D8C`'s `jsr` overwrites them before the `bcc` reads any, dropping it changes
nothing but keeping it costs nothing and preserves the one-to-one correspondence the port relies on. Note
it rather than delete it -- the sibling case `$2716D8` (W335) WAS deletable and the distinction is that
this one's operand is a live register.

Also confirmed: `$272C7A` is the table A0 carries into the aim. Check it against W36's `$272D70 + $190`
window before declaring anything -- it is 246 bytes BELOW that window's start, so it is probably NOT
covered, unlike `$272DFA` which W326 found already inside it.

### `$1A`'s BLOCKER IS A *DYNAMIC* MEASUREMENT, NOT A STATIC READ (W340) -- reclassified

The previous section said: read `$263808` to its `rts` and record its exit state in D2/D3. Done, and the
answer changes what kind of blocker this is.

    263808  move.l ($12,A5),D0 / beq         the script pointer; no script -> early out
    263812  btst #$6,($2,A5) / beq           two ways to seed ($2,A6)/($4,A6)
    26383a  cmpi.b #-$80,($4,A6) / bcs / bset #$7,($4,A6)
    263848..26386E   THE SCRIPT LOOP:
              andi.w #$F,D1 / add.w D1,D1 / add.w D1,D1     an opcode index, x4
              lea ($263948,PC),A1 / adda.w D1,A1 / movea.l (A1),A1 / jsr (A1)
              bra $263848                                    ... and loop
    263870  move.l A0,($12,A5)

**`$263808` IS A MOVEMENT-SCRIPT INTERPRETER**, not a leaf routine. It dispatches through a SIXTEEN-entry
longword table at `$263948` and loops until an opcode breaks out. So **it has no single exit state in
D2/D3**: whatever is there depends on which opcode handlers ran for this record's script, and each of those
sixteen can touch any register.

**SO THE BLOCKER IS NOT "READ ONE MORE ROUTINE".** It is: instrument `$268D8C` and record what D2/D3
actually hold when `$1A`'s init reaches it, across the records stage 5 spawns. That is oracle/trace work --
`tools/oracle/` -- not disassembly, and it is the right classification because sixteen opcode handlers is a
combinatorial static problem and a one-line trace answers it directly.

**AND THE LIKELY ANSWER IS "GARBAGE, GUARDED".** `aim.js:62` says `$24203E` takes target in D2/D3, `$1A`'s
init sets neither, and `$268D92 bcc` immediately follows the call. If the trace shows D2/D3 carrying
whatever the last movement opcode left, then `$1A`'s init aims at an undefined target BY CONSTRUCTION and
the `bcc` is what makes that harmless. **The port must then reproduce the indeterminacy, not repair it** --
which in practice means the aim's result must be shown not to matter on the guarded path, and that is a
statement a trace can support and a static read cannot.

**Recorded honestly as a reclassification, not progress toward a fix.** The blocker moved from "unmeasured
register provenance" to "needs a trace at one instruction", which is more actionable but is not resolved.
`$1A` stays blocked, and it is now the ONLY stage-5 type blocked on something other than reading.

Remaining stage 5 after W340: `$46` (13 records, wants `$55` first), `$1A` (trace-blocked, above), `$43`,
`$4C`, `$B0`. Five types, 20 records.

### `$43` FIRST LOOK (W340) -- init `$26DDA4`, handler `$26DE32`. IT HAS NO `readInitPosition`.

    26dda4  move.w #$0,($4,A5) / rts       ONE sub record -> FOUR-byte handler overlap
    26ddac  loadSubProto($26DE16)
    26ddb8  move.w #$4,D0 / loadRecordProto($26DE0C)     FIVE words -- a `move.w`, not a `moveq`
    26ddc8  move.l #$30001C00,($2,A6)      <-- A FIXED SPAWN POSITION. No jsr $263808 ANYWHERE.
    26ddd0  move.w $813172,D0 / sub.w D0,($4,A6)          scroll-compensated at spawn
    26ddda  move.w #$12,D0 / lea $223578,A0 / jsr $24150A  palette bank $12

**IT NEVER CALLS `readInitPosition`.** Every type read this session calls `$263808`; `$43` writes
`($2,A6)` from a LITERAL instead and then subtracts `$813172` (`G.scroll`) from the X half. So it is a
screen-anchored object placed at a fixed spot and corrected once for the scroll position at spawn -- which
also means it is NOT affected by the `$263808`/D2/D3 indeterminacy that blocks `$1A`.

`move.l #$30001C00,($2,A6)` is the same idiom type `$01` uses (`spawnPos: 0x38001c00`, W325), so this is a
small shared family: fixed-position spawners that write the packed longword directly. Worth checking `$4C`
and `$B0` for it too.

**BOTH OUTSTANDING PALETTE SOURCES ARE ALREADY COVERED BY W91's WINDOW** (`$222A78..$2252F8`), checked
arithmetically:

    $223578   $43's bank $12    inside
    $224F38   $47's bank $10    inside      <- resolves the check flagged in $47's sections

So neither needs a declaration, and the W169 situation repeats: the palette-family window was drawn wide
enough that later types need nothing. **Do not declare a palette window for either.**

`$43`'s prototype window: `$26DE0C + $2A` (`$26DE0C..$26DE35`) -- five-word record prototype plus the ONE
sub prototype, overlapping the handler at `$26DE32` by FOUR bytes, as `($4,A5) = 0` predicts.

Still to read for `$43`: the rest of the init past `$26DDEA`, and the handler from `$26DE32`.

### `$43`'s INIT BODY IS READ IN FULL (W340) -- THREE palette banks, and it is `$9F`'s shape

    26ddac  loadSubProto($26DE16)
    26ddb8  move.w #$4,D0 / loadRecordProto($26DE0C)      FIVE words
    26ddc8  move.l #$30001C00,($2,A6)                     a FIXED position, no readInitPosition
    26ddd0  move.w $813172,D0 / sub.w D0,($4,A6)          scroll-compensated once, at spawn
    26ddda  move.w #$12,D0 / lea $223578,A0 / jsr $24150A     bank $12
    26ddea  move.w #$13,D0 / lea $2235B8,A0 / jsr $24150A     bank $13
    26ddfa  move.w #$14,D0 / lea $2236B8,A0 / jsr $24150A     bank $14
    26de0a  rts

**THREE CONSECUTIVE BANKS, AND THE PORT ALREADY HAS THIS EXACT SHAPE.** `$27C5BE` (type `$9F`, stage 4)
installs three banks the same way -- `installBank` called three times with consecutive bank numbers -- and
`initbody.js` carries it. So `$43`'s init body is `$9F`'s body with different constants, which makes it a
short write. **Tenth family check to pay off this session.**

**ALL THREE SOURCES ARE INSIDE W91's `$222A78..$2252F8` WINDOW** (checked arithmetically), so **no palette
window is to be declared for `$43`**. Their spacing is `$40` then `$100`, i.e. NOT uniform -- do not derive
the second and third addresses from the first by a stride.

`$43` is a screen-anchored, fixed-position, three-bank object with no `readInitPosition` and a four-byte
prototype overlap. Its init needs: `loadSubProto`, `loadRecordProto`, `installBank` x3, one packed-longword
literal and one `G.scroll` subtraction -- **every one of which the port already has.**

Window: `$26DE0C + $2A` (`$26DE0C..$26DE35`), five-word record prototype plus the one sub prototype,
overlapping the handler at `$26DE32` by four bytes.

Still to read for `$43`: the handler `$26DE32` onward. **The init body could be written now** -- it changes
no registration and `$43` is already counted as missing a handler, so it cannot half-register anything.

### `$43`'s HANDLER HEAD (W340) -- A FOURTH COUNTDOWN CONVENTION

    26de32  tst.w $8130D2 / bne $26DED2         the freeze, jumping far
    26de3c  cmpi.b #$0,($17,A5) / bne $26DE5A   ($17,A5) as a STATE NUMBER, as $47 -- not the band's mirror
    26de46  jsr $24179E                         scrollCompensate
    26de4c  subq.w #1,($1E,A5) / bne $26DE5A    a WORD countdown, fires at ZERO
    26de54  move.b #$1,($17,A5)                 state 0 -> 1
    26de5a  cmpi.b #$1,($17,A5) / bne $26DE8C
    26de64  jsr $2417DE                         playerMove -- ALREADY PORTED (machine.js:215)
    26de6a  subq.b #1,($1C,A5) / bcc $26DE8C    a BYTE cadence, fires on UNDERFLOW
    26de72  move.b ($1D,A5),($1C,A5)
    26de78  subq.b #1,($1A,A6)
    26de7c  cmpi.b #$2,($1A,A6) / bne $26DE8C   <-- DECREMENT, THEN COMPARE AGAINST **2**
    26de86  move.b #$2,($17,A5)                 state 1 -> 2

**A FOURTH COUNTDOWN CONVENTION, AND IT IS THE MOST DECEPTIVE ONE YET.** `$26DE78` decrements `($1A,A6)`
and `$26DE7C` compares the result against **`#$2`**, not zero. So the transition fires when the counter
reaches TWO and the counter keeps its final value of 2 rather than wrapping or resting at 0. Every
established reading is wrong here: `bcc` (underflow), `bpl` (runs negative), `beq` (fires at zero) and now
"fires at an arbitrary constant". Four conventions, and `$43` uses two of them nine bytes apart -- `bcc` at
`$26DE6E` and this at `$26DE7C`.

    subq + bcc            fire on UNDERFLOW                 `due8` implements this
    subq + bpl            run into NEGATIVES                 $26DC04 ($47)
    subq + beq / bne      fire AT ZERO                       $26DCA2 ($47), $25354C (W29)
    subq + cmpi #$N       fire at an ARBITRARY CONSTANT      $26DE7C ($43)   <-- NEW

**Read the instruction AFTER every `subq`, not just the branch.** A `cmpi` between them changes the meaning
entirely, and three of these four look identical at a glance.

**`$2417DE` IS `applyVelocityA6` (movement.js). THIS TOOK THREE ATTEMPTS; READ WHY.**

  1. First I called it ported, citing `machine.js:215`'s `playerMove: 0x2417de`. That is an address in a
     CONSTANT TABLE with no consumer -- not a port.
  2. Then I "corrected" that to **NOT ported**, on the strength of the same `grep 0x2417de`.
  3. Both wrong. **`movement.js:89` documents `$2417DE` in PROSE** and `applyVelocityA6(ram, tables, a6)` is
     its implementation, annotating `$2417E0`, `$2417E4`, `$2417EA`, `$2417F2`, `$2417F4` and `$2417F8` line
     by line. `grep 0x2417de` could never have found it.

**This is the standing rule earning its keep against me twice on one address**: *grep case-insensitively for
BARE HEX digits, read every hit INCLUDING comments and docstrings, and read the routine to its `rts`
comparing its BODY.* Searching for `0x`-prefixed lowercase is the failure mode the rule names, and I used it
to reach two opposite wrong conclusions before searching for the routine's BEHAVIOUR instead.

`$2417DE` is the freeze-gated vector application with **62 callers**: read speed/heading from `($1A,A6)`/
`($1B,A6)`, `bsr $241812` for the vector, add D2/D3 into `($2,A6)`/`($4,A6)`, and on freeze return zeros.
`$43` uses the RAW A6 form, which is why `applyVelocityA6` is exported separately from `applyVelocity`.

**AND IT IS A LEAD ON `$1A`'s BLOCKER.** `$2417DE`/`$241812` are what SET D2 and D3 -- the movement delta. So
the D2/D3 that `$1A`'s init hands to `$24203E` at `$268D8C` are very likely the last movement delta left by
whichever `$263808` opcode ran, not a target position at all. That sharpens the trace: instrument `$268D8C`
and compare D2/D3 against the record's last delta rather than against any player coordinate.

`($17,A5)` is a state number here, as in `$47` and unlike all four band members. That is now two of two
non-band stage-5 types using it that way, so the band's mirror-flag reading looks like the exception.

Still to read for `$43`: `$26DE8C` onward (state 2+) and `$26DED2` (the freeze target, probably the draw).

### `$43`'s STATE 2 AND DRAW (W340) -- and `$263678` IS ALREADY PORTED (twelfth family check)

    26de96  subq.b #1,($18,A5) / bcc $26DED2      a cadence
    26de9e  move.b ($19,A5),($18,A5)
    26dea4  addq.w #4,($1A,A5)                    the RAMP
    26dea8  cmpi.w #$40,($1A,A5) / bne $26DEBA
    26deb2  jmp $263762                           at EXACTLY $40 -> freeEnemy
    26deba  cmpi.w #$3C,($1A,A5) / bne $26DED2
    26dec4  moveq #$44,D0 / jsr $263678           at $3C -> a DEFERRED SPAWN of type $44
    26decc  move.l ($2,A6),($16,A0)
    26ded2  lea ($26DF00,PC),A0 / adda.w ($1A,A5),A0    the draw, index RAW

**THE RAMP TERMINATES ON EQUALITY, NOT A THRESHOLD.** `cmpi.w #$40 / bne` -- if the step ever missed `$40`
the object would never free. Step 4 from 0 hits `$40` exactly, so it is safe as written, but the port must
use `=== 0x40` and not `>= 0x40`: the two behave identically here and differently under any future edit, and
"threshold read as equality" has already cost this project a wave (`$1F3`, W335).

**IT SPAWNS TYPE `$44` ONE STEP BEFORE IT DIES**, at ramp `$3C`, and copies its own position into the new
record's `($16,A0)`. So `$43` is a two-part effect: sixteen ramp frames, a spawn on the penultimate one,
then self-free.

**AND `$263678` IS ALREADY PORTED. I NEARLY RECORDED THE OPPOSITE.** A grep for `0x263678` returned nothing
in `src/`, and a grep for its sibling `$263684` returned only a `note` in `midboss.js` -- which I first read
as "the allocator is unported and already blocks the midboss's death spawn". **Wrong on both counts.** That
note is about the deferred queue being FULL at runtime, not about a missing routine, and `spawn.js:419-427`
carries the whole family:

    export const DEFQ_D1 = { FIXED80: 0x80, FIXED00: 0x00, CALLER: -1 };
    /** Enqueue a deferred spawn.  `$263678/$263684/$263690`. ... */

All three addresses are named in that docstring, and `$263678`'s `D1 = $80` is `DEFQ_D1.FIXED80`. So `$43`
needs `enqueueDeferred(ram, 0x44, DEFQ_D1.FIXED80)` and nothing new. **Twelfth family check to pay off, and
the lesson is sharper than the previous eleven**: grepping the ADDRESS found nothing because the port names
the family in a docstring and exports it under a NAME. `grep 0x2xxxxx is NOT a test for "is this ported"`
already says to grep case-insensitively for bare hex and read comments -- this is that rule earning its
keep, and I only got there by reading the cited note instead of trusting my own summary of the grep.

Draw table: `$26DF00 + $40` (sixteen longwords, index `($1A,A5)` RAW, ramp `0..$3C`). Prototype window
`$26DE0C + $2A`. `$43` has NO unported callee: `$2637A2`, `$26377A`, `$24150A`, `$24179E`, `$2417DE`
(`playerMove`), `$263678` (`enqueueDeferred`), `$263762`, `$23DECE`-family draw -- all present.

Still to read for `$43`: `$26DED8` onward (the draw body). Everything else is read.

### `$43` IS READ END TO END (W340). ITS DRAW APPLIES TWO LONG BIASES, AND THOSE *DO* COMBINE.

    26ded2  lea ($26DF00,PC),A0 / adda.w ($1A,A5),A0 / move.l (A0),D2    index RAW, 16 longs
    26dede  move.l ($2,A6),D1
    26dee2  subi.l #$4000000,D1          = + $FC000000
    26dee8  addi.l #-$19FF1A00,D1        = + $E600E600
    26deee  move.w #$1AD0,D3
    26def2  moveq #$0,D4 / move.b ($1D,A6),D4     the PALETTE byte, as $47 and unlike the band
    26def8  jmp $23DECE                  a TAIL JUMP, not a jsr

**TWO SEQUENTIAL LONG BIASES, AND UNLIKE THE PACKED-WORD CASE THEY COMBINE EXACTLY.** `$FC000000` then
`$E600E600` is `$E200E600` applied once -- verified identical on three sample positions including a
low-half-carry case. That is the precise contrast with `$47`'s muzzle constants: **two full 32-bit adds are
associative and may be folded; a word pair is NOT a longword and may not be assembled.** Both facts live in
`addi.l` instructions and look alike, and the distinguishing question is whether the ROM performed word
arithmetic on the halves.

Even so, transcribe both instructions. Folding costs a reader the ability to match the port line-for-line
against the listing, and the fold's safety is a property of these two constants rather than of the idiom.

`$26DEF8` is a **`jmp`, not a `jsr`** -- a tail jump into the emit stub, so `$43`'s handler has no code after
its draw. The port's `enqueueRegistersThroughStub` models the call either way, but a reader looking for an
`rts` will not find one.

D4 comes from `($1D,A6)`, the palette byte, as in `$47` -- so both non-band stage-5 types do this and all four
band members use `($1C,A6)`. **Two of two vs four of four: the band is the outlier, not these.**

**`$43` IS NOW COMPLETE AND HAS NO UNPORTED CALLEE.** `$2637A2`, `$26377A`, `$24150A` (x3), `$24179E`,
`$2417DE` (`playerMove`), `$263678` (`enqueueDeferred`, `DEFQ_D1.FIXED80`), `$263762` (`freeEnemy`),
`$23DECE`. Windows: `$26DE0C + $2A` (prototypes, four-byte handler overlap) and `$26DF00 + $40` (sixteen
draw longwords). No palette window -- all three banks are inside W91's.

**Order for the next wave:** write `$43` (init body + handler + draw, one pass), then `$4C` (`$26F4DA` init,
`$26F5F2` handler), then `$B0`. `$46` wants `$55` first; `$1A` is trace-blocked at `$268D8C`.

### `$4C` FIRST LOOK (W341) -- init `$26F4DA`, handler `$26F5F2`. FIVE sub records, 20-byte overlap.

    26f4da  move.w #$4,($4,A5) / rts       FIVE sub records -- the most of any stage-5 type read
    26f4e2  loadSubProto($26F566)
    26f4ee  move.w #$5,D0 / loadRecordProto($26F55A)     SIX words -- another `move.w`, not a `moveq`
    26f4fe  move.l #$F4001C00,($2,A6)      a FIXED position -- NO readInitPosition, as $43
    26f506  move.w $813172,D0 / sub.w D0,($4,A6)          scroll-compensated once
    26f510  move.w #$1,$81B414             ONE budget word, as $47 (the band sets two)
    26f518  move.w #$1,$8130DE             its alive flag

**THE OVERLAP RULE HOLDS A SIXTH TIME AND PREDICTS THE DEEPEST CASE YET.** `($4,A5) = 4` means FIVE
`$20`-byte sub records, so `$26F566 + $A0 = $26F606` against a handler at `$26F5F2`: **`$14` = TWENTY bytes**.
`depth = subRecords * $20 - (handler - subProto)` has now been confirmed at 4, 8, 4, 16, 4 and 20 bytes across
six types. **It is arithmetic. Compute the window extent from the init's first instruction and stop guessing.**
Window: `$26F55A + $AC` (`$26F55A..$26F605`).

**`$F4001C00` IS A NEGATIVE Y.** The high word `$F400` is `-$C00`, so `$4C` spawns ABOVE the visible field and
descends. `$43`'s `$30001C00` is positive. Same idiom, opposite side -- do not assume a fixed-position
spawner starts on screen.

**THE ALIVE-FLAG WORDS ARE ONE CONTIGUOUS FAMILY**, which is worth naming because six waves found them one at
a time:

    $8130DC   $47          a single global, set in init, cleared on all exits
    $8130DE   $4C          the same shape
    $8130E0   $49  early   reached through a POINTER in ($20,A5), chosen by scroll < $260
    $8130E2   $4B  early   through ($26,A5), chosen by scroll < $280
    $8130E4   $49  late
    $8130E6   $4B  late

So `$8130DC..$8130E6` is a six-word block of per-type presence flags: `$47` and `$4C` write theirs directly,
`$49` and `$4B` hold a POINTER to one of two, and `$4A`/`$48` have none at all. **Anything reading this block
is reading "which stage-5 set-pieces are currently alive"**, and that is probably what gates the stage's
progression -- worth a `codexref` sweep over all six before writing `$4C`.

`$4C` is in the fixed-position family with `$43` and `$01` (W325). Still to read: the init past `$26F520` and
the handler from `$26F5F2`.

### THE `$8130DC..$8130E6` BLOCK IS A MUTUAL-EXCLUSION GATE (W341) -- the sweep answered

Absolute-reference counts across `$200000..$2B0000`, and the pattern in the addresses is the finding:

    $8130DC  18 refs   264DA8 264DE0 264E7C 26730C 269C6C 26D724 26D7F6 26D878 26D8C0 ...
    $8130DE   7 refs   269C7E 26F51C 26F608 26F6B2 2706A4 270C86 274738
    $8130E0  14 refs   269C90 26A56A 26ACA2 26AFDE 26C2BA 26C524 26CA68 26D4B6 26F524 ...
    $8130E2  10 refs   269CA2 26A57C 26ACB4 26AFF0 271CEC 271CF2 27790C 29ED6A 29FE2C
    $8130E4   7 refs   26A58E 26ACD2 271608 27792A 29ED52 2A3FF8 2A4032
    $8130E6   8 refs   26A5A0 26AC6C 26ACE4 271D04 27793C 29ED58 29FB6A 29FC7E

**FOUR ROUTINES TOUCH ALL SIX IN SEQUENCE AT UNIFORM STRIDES** -- `$269C6C/7E/90/A2`, `$26A56A/7C/8E/A0`,
`$26ACA2/B4/D2/E4` and `$26AFDE/F0`. So the block IS treated as a unit, and reading the first one settles
what for:

    269c6a  tst.w $8130DC / beq $269C7C      flag clear -> test the next
    269c74  jmp $263762                      flag SET -> the POLLING RECORD FREES ITSELF
    269c7c  tst.w $8130DE / beq $269C8E      ... and so on down the block

**IT IS A MUTUAL-EXCLUSION GATE.** A record running that code refuses to exist while ANY stage-5 set-piece is
alive: it walks the six flags and `freeEnemy`s itself on the first one set. So `$47`'s `$8130DC` and `$4C`'s
`$8130DE` are not bookkeeping -- **they suppress other enemies for as long as the set-piece is on screen**,
which is exactly what a scroll-stopping set-piece needs and is a visible gameplay behaviour.

That also explains why `$47` clears its flag on **all three** exits (death, off-screen, retirement) and why
`$4B` writes `$8130E2` unconditionally BEFORE choosing its pointer: leaving a flag set would permanently
suppress whatever polls it, and the ROM is careful about it in a way that reads as over-engineering until you
know there is a reader.

**CONSEQUENCE FOR THE PORT:** the flags must be written and cleared exactly, and any type whose handler polls
this block needs the poll ported or it will spawn on top of a set-piece. Four polling sites are named above;
`$269C6C`'s owner should be identified first, since it is the one confirmed to self-free.

Still to read for `$4C`: the init past `$26F520` and the handler from `$26F5F2`.

### `$4C`'s INIT IS READ IN FULL (W341) -- it claims TWO flags, and shares `$43`'s BANK NUMBERS

    26f518  move.w #$1,$8130DE
    26f520  move.w #$1,$8130E0            <-- **A SECOND FLAG**
    26f528  move.w #$12,D0 / lea $2235F8,A0 / jsr $24150A
    26f538  move.w #$13,D0 / lea $223638,A0 / jsr $24150A
    26f548  move.w #$14,D0 / lea $223678,A0 / jsr $24150A
    26f558  rts

**CORRECTION TO THE FLAG MAP TWO SECTIONS ABOVE.** I recorded `$8130E0` as "`$49` early". `$4C` writes it
DIRECTLY as well, so the block is not one-flag-per-type: `$4C` claims **two** of the six (`$8130DE` and
`$8130E0`), while `$49` reaches `$8130E0` through a pointer. Both must be cleared when `$4C` retires, and the
mutual-exclusion gate at `$269C6C` walks both.

**AND IT INSTALLS THE SAME BANK NUMBERS AS `$43` FROM DIFFERENT SOURCES.** Both write banks `$12`, `$13` and
`$14`; `$43` sources `$223578`/`$2235B8`/`$2236B8` and `$4C` sources `$2235F8`/`$223638`/`$223678`. **So these
two set-pieces overwrite each other's palettes**, which is precisely why `$47` reinstalls bank `$10` on EVERY
FRAME (W339) instead of once at init: bank numbers in this range are contested, and a type that wants its
colours to survive has to keep repainting them. Two findings from different waves explaining each other.

`$4C`'s bank spacing is `$40`/`$40` -- uniform, where `$43`'s was `$40`/`$100`. **So neither type's sources are
derivable by a stride from the first, and they are not derivable from each other either.** Transcribe all six
addresses. All three of `$4C`'s are inside W91's `$222A78..$2252F8` window, so again no palette window.

`$4C`'s init needs: `loadSubProto`, `loadRecordProto`, one packed-longword literal (with a NEGATIVE Y),
one `G.scroll` subtraction, two flag words and `installBank` x3 -- all present in the port.

Still to read for `$4C`: the handler `$26F5F2` onward. Windows: `$26F55A + $AC` (prototypes, TWENTY-byte
handler overlap) and whatever its draw table turns out to be.

### THE DYING/RETIRE FLAGS ARE ALWAYS THE LAST TWO BYTES OF THE RECORD (W341) -- one rule for all of them

`$4C`'s handler head is `$47`'s shape, and comparing the two settles an offset question six waves have been
answering type by type:

    26f5f2  tst.w $8130D2 / bne $26F704       the freeze -> the draw
    26f5fc  tst.b ($9E,A6) / beq $26F622      the RETIRE trigger
    26f604  move.w #$0,$8130DE                clears ONE flag -- see below
    26f60c  pushExternalSpeed($20, $20) / jmp $263762
    26f622  tst.b ($16,A5) / bne / tst.b ($9F,A6) / bne     the DYING flag
    26f632  cmpi.w #$1F0,$8130CE              a scroll-clock EQUALITY, as the band's

**`dying = size - 1` and `retire = size - 2`, where `size = (($4,A5) + 1) * $20`:**

    ($4,A5)   size    retire   dying     types
      0       $20     --       --        $49, $4B  (no flags at all; they free directly)
      1       $40     +$3E     +$3F      $4A, $48
      3       $80     +$7E     +$7F      $47
      4       $A0     +$9E     +$9F      $4C

Every type read this session fits. **So stop memorising these offsets and compute them from `($4,A5)`,** the
same way the prototype-overlap depth is computed from it. Two structural facts now fall out of one field in
the init's first instruction. And `$49`/`$4B` having no such flags is consistent rather than exceptional: at
`$20` bytes the pair would land on prototype fields, so those types free directly instead.

**THE ASYMMETRY: `$4C`'s RETIREMENT CLEARS ONLY `$8130DE`, NOT `$8130E0`.** Its init sets BOTH (`$26F518`,
`$26F520`) and `$26F604` clears one. So either something else clears `$8130E0`, or `$4C` leaves it set --
which, given `$269C6C`'s gate frees any record that sees ANY flag set, would permanently suppress the polling
type for the rest of the stage. **Do not "fix" this by clearing both.** Transcribe the single clear, and
`codexref $8130E0`'s fourteen references for another writer -- `$26F524` is `$4C`'s own init and the rest are
listed in the sweep section above. If nothing clears it, that is a cartridge behaviour the port must
reproduce, and it may be the mechanism that ends the stage's enemy spawning.

Still to read for `$4C`: `$26F650` onward and `$26F704` (the draw).

### `$8130E0` IS A *SHARED* FLAG, AND `$4C`'s "ASYMMETRY" WAS MY UNREAD SPAN (W341)

The previous section flagged that `$4C` sets `$8130DE` and `$8130E0` but clears only `$8130DE`, and warned it
might leave a flag stuck. Classified all fourteen references by the opcode preceding each:

    READS  (tst.w)   $269C8E  $26A568  $26ACA0  $26AFDC  $26D4B4  $2702E6  $270446  $2778EC   -- EIGHT
    WRITES (move.w)  $26C2B6 = 1   $26C520 = 0   $26CA64 = 0   $26F520 = 1   $26F6B6 = 0     -- FIVE
    ADDRESS (lea)    $2715F4                                                  -- $49's pointer load

**`$26F6B6` IS INSIDE `$4C`'s OWN HANDLER**, in the `$26F650..$26F704` span I had not read. So `$4C` clears
`$8130DE` at `$26F604` on one exit and `$8130E0` at `$26F6B6` on another: two exits, two flags, no bug. **The
asymmetry was my unread span, not the cartridge's.** Ninth or tenth time this session that an anomaly
dissolved on displaying the bytes -- and this one I had already written into the handoff as a thing not to
"fix", which was the right instinct for the wrong reason.

**AND `$8130E0` IS NOT PER-TYPE.** Three other writers live in `$26Cxxx` -- `$26C2B6` sets it, `$26C520` and
`$26CA64` clear it -- so at least one more type owns this same word, plus `$49` reaches it through a pointer.
So the six-word block is **not** one-or-two-flags-per-type: `$8130E0` at minimum is shared between `$4C`,
`$49` and whatever owns `$26C2B6`. Correct the map two sections above accordingly, and **do not treat any of
the six as belonging to one type.**

Eight readers is the number that matters for the port: whichever types those eight belong to all self-free
while the flag is set (the `$269C6C` gate shape), so a missing clear suppresses eight code paths, not one.
That is why the ROM is careful and why the port must be.

Still to read for `$4C`: `$26F650..$26F704` (which contains that clear) and `$26F704` (the draw).

### `$4C`'s DAMAGE ARM (W341) -- a THIRD size-relative offset, and a damage GATE `$47` lacks

    26f658  move.b #$A3,D0 / and.b D0,(A6)
    26f65e  move.w D1,($8E,A6)             the hit mask -- and see the formula below
    26f662  jsr $286096                    scoreHit
    26f668  D0 = ($1D,A6) / eori.b #$D     a LITERAL $D, where $47 uses $F
    26f674  move.l #$7FFF,D0 / sub.w ($18,A6),D0        the damage taken -- the $7FFF SINK again
    26f67e  tst.b ($16,A5) / bne $26F68A   <-- THE SUBTRACTION IS GATED. $47 HAS NO SUCH TEST.
    26f686  sub.l D0,($1A,A5)              the real HP is a LONG at ($1A,A5), not $47's ($32,A5)
    26f68a  move.w #$7FFF,($18,A6)         re-arm the sink
    26f690  tst.l ($1A,A5) / bpl $26F6E4
    26f698  move.l #$700,D0 / jsr $28615E  kill score $700, where $47 pays $600

**A THIRD SIZE-RELATIVE OFFSET: `hitMask = size - $12`.** `$47` (size `$80`) saves at `+$6E`; `$4C` (size
`$A0`) saves at `+$8E`. Both are `size - $12`. So the record's tail carries a fixed trio:

    2 sub records ($40):  hitMask +$2E   retire +$3E   dying +$3F
    4 sub records ($80):  hitMask +$6E   retire +$7E   dying +$7F
    5 sub records ($A0):  hitMask +$8E   retire +$9E   dying +$9F

**Compute all three from `($4,A5)`.** With the prototype-overlap depth that is FOUR structural facts derived
from the init's first instruction. Confirm `+$2E` on `$4A`/`$48` when either is revisited -- neither was read
as saving a hit mask, so the trio may only be populated by types that have a `$26DCB6`-style consumer.

**THE DAMAGE SUBTRACTION IS GATED ON `($16,A5)`.** `$26F67E tst.b / bne` skips `sub.l D0,($1A,A5)` unless the
record has been on screen -- so **`$4C` is INVULNERABLE until it appears**, and its sink is still re-armed
either way at `$26F68A`. `$47` has no such gate. Porting `$4C` from `$47`'s arm would make it killable before
it enters, which is exactly the class of difference that shows up as "the set-piece sometimes never appears"
rather than as a crash.

Its constants, none shared with `$47`: palette XOR `$D` (not `$F`), HP long at `($1A,A5)` (not `($32,A5)`),
kill score `$700` (not `$600`). **The `$7FFF` sink idiom is shared; nothing else in the arm is.**

Still to read for `$4C`: `$26F6A4..$26F704` (the death tail, which contains the `$8130E0` clear at `$26F6B6`)
and `$26F704` (the draw).

### `$4C`'s DEATH PATH (W341) -- it clears BOTH flags; the RETIREMENT path clears one

    26f6a4  move.w #$8000,(A6)             the mark
    26f6a8  move.b #$1,($9F,A6)            dying at size-1, as the formula predicts
    26f6ae  move.w #$0,$8130DE
    26f6b6  move.w #$0,$8130E0             <-- BOTH cleared here
    26f6be  pushExternalSpeed($20, $20)
    26f6cc  moveq #$6,D0 / bsr $26F858     a private subroutine, EIGHT callers
    26f6d2  lea ($2701C8,PC),A0 / jsr $246520      $246520: SIX callers, UNPORTED
    26f6de  move.b #$12,($1D,A6)           a LITERAL palette, as $47's $10
    26f6e4  bsr $26FFE8                    a private subroutine, ONE caller
    26f6e8  tst.b ($9F,A6)                 the mark again

**THE ASYMMETRY IS REAL BUT PATH-SPECIFIC, AND NARROWER THAN I FIRST WROTE.** Two commits ago I said `$4C`
clears only `$8130DE`; one commit ago I said the missing clear was in my unread span and there was no bug.
**Both were partly wrong.** The DEATH path (`$26F6AE`/`$26F6B6`) clears BOTH. The RETIREMENT path
(`$26F5FC` -> `$26F604`) clears only `$8130DE`. So the two exits genuinely differ, and `$8130E0` survives a
retirement. Given eight readers self-free on it, that is either deliberate -- the retirement is *meant* to
keep suppressing them -- or a cartridge bug. **Transcribe both paths exactly as written and do not unify
them.** This is the third statement I have made about this one flag; the first two were made before reading
the relevant span, and the lesson is the session's usual one.

**THREE MORE CALLEES, AND `$4C` IS NOT A SMALL TYPE:**

    $246520   SIX callers, UNPORTED, and it opens `movem.l D1-D7/A0-A4,-(A7)` -- it saves TWELVE registers,
              so it is a substantial routine, not a setter. It takes a table in A0 ($2701C8 here).
              **Read and codexref it BEFORE writing $4C** -- six callers plus a twelve-register prologue is
              the W333 situation, and porting it inside a type wave is the mistake that lesson prevents.
    $26F858   EIGHT callers, unported, called with D0 = 6. Also likely shared beyond $4C.
    $26FFE8   ONE caller -- private to $4C.

So `$4C` has **two genuine shared prerequisites** (`$246520`, `$26F858`) plus one private subroutine, which
makes it the largest remaining stage-5 type by dependency depth even though it holds one record. Contrast
`$47`, whose two apparent prerequisites both dissolved: these two have caller counts AND substantial bodies,
which is the pair of signals that distinguishes real infrastructure from a three-line setter (the `$23C4A0`
lesson).

Still to read for `$4C`: `$26F6E8..$26F704`, `$26F704` (the draw), and the two prerequisites.

### `$246520` IS A TWO-POOL SPAWNER OVER POOLS THE PORT DOES NOT HAVE (W341)

    246520..246528  an entry variant, then bra $246532
    24652a  movem.l D1-D7/A0-A4,-(A7)      TWELVE registers saved -- a substantial routine
    24652e  move.w #$0,D6
    246532  lea $810346,A1 / moveq #$2,D7  <-- POOL 1, and #$2 + dbra = THREE slots
    24653a  tst.w (A1) / bmi $246600       the free-slot test: NEGATIVE means occupied
    246540  move.w #$8000,(A1)             claim it
    246544  move.w D6,($4,A1)
    246548  movem.l A0-A1,-(A7)
    24654c  move.w (A0)+,D0                read the caller's table ($2701C8 for $4C)
    24654e  move.w #$13,D6
    246552  lea $80FA86,A2 / tst.w (A2) / bmi $2465DE      <-- POOL 2, and #$13 -> TWENTY slots

**NEITHER POOL IS IN THE PORT.** `$810346` and `$80FA86` return nothing on a bare-hex search of `src/` --
this time using the correct pattern (`\$?(0x)?<hex>`, case-insensitive), not the `0x`-lowercase form that
misled me twice on `$2417DE`. So `$246520` is **genuine new infrastructure**: a two-stage allocator that
claims one of THREE slots in `$810346`, then walks TWENTY slots in `$80FA86`, driven by a caller-supplied
table.

**`#$2` and `#$13` with `dbra` are THREE and TWENTY**, not two and nineteen -- the standing DBcc rule, and the
second pool's twenty-slot walk is the sort of count that is wrong by one in a port unless it is read off the
literal.

**SO `$4C` IS PROPERLY BLOCKED, AND CORRECTLY SO.** Its prerequisites are:

    $246520   a two-pool spawner over $810346 (3 slots) and $80FA86 (20 slots)   -- NEW SUBSYSTEM
    $26F858   eight callers, unported, D0 = 6                                    -- unread
    $26FFE8   one caller, private to $4C                                         -- unread

This is the first stage-5 type this session whose prerequisites did NOT dissolve on inspection, and the two
signals that predicted it were caller count PLUS a substantial body -- `movem.l` of twelve registers and two
RAM pools. **`$246520` deserves its own wave**, and it should be measured before `$26F858` because a
twenty-slot pool with a three-slot parent is likely the thing `$26F858` feeds.

**RECOMMENDED ORDER FROM HERE:** `$B0` and `$46`/`$55` are the other remaining work; `$4C` should wait for
`$246520`'s wave rather than absorb it. `$1A` needs the `$268D8C` trace. Stage 5 stands at FOUR types with no
handler over 19 records, from ten over 29 at the start of this session.

### WHAT "FOUR TYPES OVER 19 RECORDS" ACTUALLY MEANS (W341) -- the census is not four comparable units

Stage 5 ends this session at FOUR types with no handler over 19 records, from ten over 29. But I have been
reporting that number as if the four were comparable pieces of work, and they are not:

    $46   13 records   BLOCKED on $55, an unported 1130-byte child (W317). The biggest by record count and
                       still the wrong thing to start with -- W317 measured exactly this.
    $1A    4 records   BLOCKED on a TRACE at $268D8C, not a read (W340). D2/D3 reach $24203E from whichever
                       $263808 opcode ran last, and $2417DE/$241812 are what set them.
    $4C    1 record    BLOCKED on $246520 (a two-pool spawner over $810346/$80FA86, neither in the port) and
                       $26F858 (eight callers). Read end to end otherwise.
    $B0    1 record    **NOT AN ORDINARY TYPE.** Init $2A42D4, handler $2A4606 -- already recorded at line
                       418 above as "the stage-5 boss-route ROOT until disproven", and $2A42D4 is the address
                       the owner's own Hibachi analysis names as the oracle trace start.

**So the remaining 19 records are: one boss route, one type behind a new subsystem, one behind a trace, and
one behind a 1130-byte child.** None is a "write the handler" wave, and reporting "four types left" invites
the next agent to pick the smallest record count and hit `$B0`, which is the true final boss.

**The honest next-wave options, cheapest first:**

    1. `$246520`'s own wave -- a bounded new subsystem (3-slot + 20-slot pools), unblocks `$4C`.
    2. the `$268D8C` trace -- one instrumented instruction, unblocks or reclassifies `$1A`.
    3. `$55` -- unblocks `$46`, the largest remaining record count.
    4. `$B0`/Hibachi -- boss work, and the owner has flagged it as a trap; it wants the HIBACHI CLOSURE RULE
       and a trace, not a handler wave.

Stage 5's enemy-type sweep is effectively DONE: every type that was a straightforward read-and-write has been
written this session. What remains is one subsystem, two measurements and a boss.

### `$246520` IS A MULTI-PART OBJECT CONSTRUCTOR, AND `$24627A` HAS EXACTLY THREE ENTRIES (W341)

    246568  move.l #$0,($2C,A2)
    246570  move.l A2,($2C,A1)      <-- LINKS the new node into the previous one
    246574  movea.l A2,A1           <-- and advances, so this builds a LINKED LIST
    246576  move.w #$0,($1E,A2) / move.w #$0,($2,A2)
    246582  move.w (A0)+,D2         an index from the CALLER's table
    246584  lea ($24627A,PC),A3
    246588  move.l ($4,A3,D2.w),($6,A2)      the SECOND long of the entry
    24658e  movea.l (A3,D2.w),A3             the FIRST long, as a base
    246592  adda.w (A0)+,A3 / move.l A3,($E,A2)
    246598  move.l (A0)+,($A,A2) / move.w (A0)+,($4,A2)
    2465a0  move.w (A0)+,D3 / andi.w #$1F,D3 / add.w D3,D3 / add.w D3,D3

So `$246520` allocates a parent from the 3-slot pool at `$810346`, then builds a **chain of up to twenty
nodes** from `$80FA86`, linking each through `($2C,A1)` and configuring it from the caller's table. `$4C`
passes `$2701C8`. **It is a multi-part-object constructor** -- which is consistent with `$4C` being a
set-piece and with the twelve-register `movem.l` prologue.

**`$24627A` HOLDS EXACTLY THREE ENTRIES AND ENTRY 3 IS CODE:**

    [0]  0080E886  0080FA66
    [1]  0080F086  0080FA68
    [2]  0080F886  0080FA6A
    [3]  48E77F00  3E013200      <-- `movem.l D1-D7,-(A7)` -- AN INSTRUCTION

**Fourth instance in this ROM of a table bounded by its own instruction stream**, after `$27460A` (W326,
index `$18` is `$3B7C0001`), `$2716D8`/`$271774` (W335) and `$2714B0` (W336). So `D2` is `0`, `8` or `$10`
only, and the port must **throw by address on anything else rather than clamp** -- W326's treatment, for the
same reason: the guard IS the semantics.

The three entries are pairs of RAM pointers (`$80E886`/`$80FA66`, `$80F086`/`$80FA68`, `$80F886`/`$80FA6A`),
stepping `$800` and `2` respectively -- so they name three parallel part-pools. **Neither those nor
`$810346`/`$80FA86` are in the port**, so `$246520`'s wave has to introduce the whole region.

**A WINDOW IS NEEDED FOR `$24627A + $18`** (three 8-byte entries), with the note that index 3 is code, and one
for `$2701C8` (`$4C`'s part table -- length unmeasured; it is walked by `(A0)+` with no terminator visible in
what has been read, so its extent must come from the node count or from `$26F858`).

That completes what can be learned about `$246520` without writing it. **It is one bounded wave**: two pools,
a three-entry dispatch table, a linked-list constructor, and a caller table per user.

### `$2701C8` MEASURED (W341) -- ONE node, and `$246520`'s wave is now fully scoped

`$24654C move.w (A0)+,D0` reads a leading COUNT word before the per-node fields, and each node consumes
exactly twelve bytes (`move.w (A0)+,D2`, `adda.w (A0)+,A3`, `move.l (A0)+`, `move.w (A0)+`, `move.w (A0)+`).
So the table shape is `count word, then count * 12`.

    $2701C8:  count = 1
    node[0]:  D2 = $0000   A3 offset = $0480   long = $00225238   word = $001F   D3 = $0009
    $2701D6 onward: CODE  ($3B7C..., $4E75...) -- so the table is $E bytes, $2701C8..$2701D5

**Every field checks out, which is what says the reading is right:** `D2 = 0` is a VALID dispatch index (the
only legal values are `0`, `8`, `$10`, since `$24627A` has three entries and entry 3 is code), and
`long = $225238` is inside W91's `$222A78..$2252F8` palette window -- consistent with dispatch entry `[0]`
being the RAM pointer pair `$80E886`/`$80FA66`. A misread stride or a missing count word would have produced
an out-of-range `D2` immediately, and node[1] read as data would have given `D2 = $3B7C`.

**So `$4C` builds ONE part through `$246520`**, not twenty. The twenty-slot walk at `$80FA86` is the pool's
capacity, not this caller's demand -- **do not size anything from `#$13`.** Other callers of `$246520` (six
total) will pass their own count words, and that is where a twenty-node chain would come from.

**`$246520`'s WAVE IS NOW FULLY SCOPED.** Everything it needs is measured:

    pools      $810346 (3 slots) and $80FA86 (20 slots), plus the three parallel pools named by $24627A
    dispatch   $24627A + $18 -- THREE entries, index 3 is CODE, so D2 in {0, 8, $10} and throw otherwise
    per-caller a count word plus count*12-byte nodes; $4C's is $2701C8 + $E, one node
    windows    $24627A + $18 and $2701C8 + $E; node[0]'s $225238 needs none (inside W91's)
    linkage    parent from $810346, chain through ($2C,A1), each node advanced by `movea.l A2,A1`

That is a bounded wave with no unmeasured quantity left in it. **Write `$246520` next, then `$4C`.**

### `$246520` READ TO ITS `rts` (W341) -- THE POOLS ARE CONTIGUOUS, WHICH PROVES THE STRIDES

    2465cc  move.w ($4,A2),D4 / lea ($30,A2),A4
    2465d4  move.w (A3)+,(A4)+ / dbra D4,$2465D4      a variable-length WORD PAYLOAD at node +$30
    2465da  subq.w #1,D0 / beq $2465E8                <-- D0 IS THE NODE COUNT, confirmed
    2465de  lea ($70,A2),A2                           <-- node stride is $70
    2465e2  dbra D6,$246558                           the twenty-slot loop
    2465e6  moveq #-$1,D0                             pool exhausted -> FAILURE
    2465e8  movem.l (A7)+,A0-A1
    2465ec  tst.w D0 / bpl $2465F8
    2465f0  move.l A1,D0 / bsr $246800                <-- FAILURE UNWIND, and it is UNPORTED
    2465f8  move.l A1,D0 / movem.l (A7)+,D1-D7/A0-A4 / rts     success: the PARENT in D0
    246600  lea ($30,A1),A1                           slot occupied -> parent stride is $30

**THE ARITHMETIC PROVES ITSELF:**

    pool 2 (nodes)    $80FA86 + 20 * $70 = $810346
    pool 1 (parents)  $810346 + 3  * $30 = $8103D6

**`$80FA86 + 20 * $70` lands EXACTLY on `$810346`, the parent pool's own base.** The two pools abut, so if
either stride or either count were wrong the boundary would not land there. That is the same
self-checking-extent property the abutting ROM tables have, in RAM -- and it independently confirms `$70`,
`$30`, twenty and three, none of which was obvious from the literals alone (`#$13` and `#$2` are the dbra
counts; the strides are separate `lea` displacements).

**CORRECTION TO MY OWN "FULLY SCOPED" CLAIM one commit ago.** I said the wave had no unmeasured quantity
left. It had three: both pool STRIDES and the failure unwind. I had measured the pool bases, the slot counts,
the dispatch table and the caller table, and called that complete without reading to the `rts`. **The strides
are not derivable from anything I had measured**, and `$246800` is a whole routine.

**`$246800` IS UNPORTED AND IS NOT OPTIONAL.** It is the unwind called when the twenty-node pool runs dry
mid-chain: the parent is already claimed and some nodes are already linked, so without it a failed
construction leaks a parent slot out of THREE permanently. Read it before writing `$246520`.

**Also: each node carries a variable-length word payload at `+$30`**, length `($4,A2)+1` words, copied from
the `A3` the dispatch table computed. So a node is `$70` bytes of which `$30` is header and up to `$40` is
payload -- and `($4,A2)` comes from the caller's table (`word = $001F` for `$4C`'s node[0], so **32 words =
$40 bytes**, exactly filling the node). Another self-checking fit.

### `$246800` IS A SIX-INSTRUCTION CHAIN-FREE WITH TWENTY-ONE CALLERS (W341) -- port it first

    246800..246803   the prologue (D0/A0 saved)
    246804  movea.l D0,A0
    246806  clr.w (A0)                     release the node
    246808  move.w #$0,($4,A0)             and its second field
    24680e  move.l ($2C,A0),D0 / bne $246804    follow the ($2C) LINK and loop
    246814  movea.l (A7)+,A0 / move.l (A7)+,D0 / rts

**It walks the `($2C)` linked list `$246520` builds and releases every node**, and the two writes are exactly
the inverse of `$246520`'s claim: that routine sets `move.w #$8000,(A1)` and `move.w D6,($4,A1)`, this one
clears both. The pool convention is confirmed from both ends -- `tst.w / bmi` means occupied when NEGATIVE,
so `clr.w` is what frees it.

**TWENTY-ONE CALLERS.** This is not `$4C` infrastructure, it is core linked-list teardown used across the
ROM, and it is six instructions. **Port `$246800` before `$246520`**: it is the cheapest item in this whole
dependency chain and the one most likely to be needed again immediately. `codexref` its twenty-one callers
after writing it -- that list is a map of every multi-part object in the game.

**So the dependency order for `$4C` is now fully determined, cheapest first:**

    1. $246800   6 instructions, 21 callers   the chain-free
    2. $246520   the two-pool constructor: pools $80FA86 (20 x $70) and $810346 (3 x $30), CONTIGUOUS;
                 dispatch $24627A (3 entries, index 3 is CODE); caller table = count word + count*12
    3. $26F858   8 callers, unread, called with D0 = 6
    4. $4C       everything else about it is read

Nothing in items 1 and 2 is unmeasured any more. Item 3 is the only unread routine left in `$4C`'s chain.

**AND THE `($2C)` LINK IS WORTH NAMING GLOBALLY.** `$24681A` (a separate routine immediately after) walks the
same chain summing `($18,A0)`, so `+$2C = next` and `+$18 = a per-node quantity` are a convention shared by at
least three routines. Any future multi-part object in this ROM will use them.

### `$246520` IS NOW READ END TO END (W341) -- a SECOND dispatch table at `$246B38`

The span `$2465A8..$2465CC`, which two earlier commits skipped over while calling the routine "fully scoped"
and then "read to its rts":

    2465a0  move.w (A0)+,D3 / andi.w #$1F,D3 / add.w D3,D3 / add.w D3,D3     mask to 0..31, then x4
    2465aa  lea ($246B38,PC),A3 / adda.w D3,A3        <-- A SECOND TABLE, 4 bytes per entry
    2465b2  move.w (A3)+,($16,A2)
    2465b6  move.w ($16,A2),($14,A2)                  the same word lands in TWO fields
    2465bc  move.w (A3),($1C,A2)
    2465c0  move.l #$FFFF0000,($18,A2)                +$18 -- the field $24681A SUMS
    2465c8  movea.l ($E,A2),A3                        A3 = the sprite base computed at $246592
    2465cc  move.w ($4,A2),D4                         the payload word count

**`$246B38` HOLDS 32 ENTRIES OF FOUR BYTES (`$80` bytes, `$246B38..$246BB7`)**, and the mask is what bounds it:
`andi.w #$1F` makes 0..31 the only reachable indices, so unlike `$24627A` this table needs no guard -- **the
ROM's own mask is the bound**, the same construction `$4A`/`$48`'s `andi.w #$1F` ring uses. Entry 32 reads
`0000 0000`, consistent with the table ending there.

Its contents are a descending-then-ascending pair ladder (`[0] 0000 0004`, `[1] 0000 0003`, `[2] 0000 0002`,
`[3] 0000 0001`, `[4] 0001 0001`, `[5] 0002 0001` ... `[31] 001C 0001`), so the first word climbs while the
second holds at 1 after entry 4. **Transcribe it; do not model it as a formula.**

**`($16,A2)` IS WRITTEN TO TWO FIELDS.** `$2465B6` copies it straight into `($14,A2)` as well, so a node's
`+$14` and `+$16` start equal and presumably diverge as it animates. Writing only one would leave the other at
whatever `loadSubProto` left.

**`+$18` IS INITIALISED TO `$FFFF0000`.** As a word that is `$FFFF` = -1, and `$24681A` sums `($18,A0)` across
the chain with `add.w`. So each fresh node contributes -1 to that sum, which is almost certainly a
"parts remaining" or "damage budget" accumulator counting up from a negative base -- worth confirming when
`$24681A`'s caller is identified.

**A THIRD CORRECTION ON THIS ONE ROUTINE.** I called it "fully scoped" (missing both strides and the unwind),
then "read to its rts" (missing this 36-byte span and this second table). Each claim was made after reading
*most* of it. **The pattern is now unmistakable: I claim completeness at the point where the remaining span is
small enough to feel like a detail.** The only reliable check is to display every byte from entry to `rts` and
say which addresses were displayed.

**WINDOWS `$246520`'s WAVE NEEDS:** `$24627A + $18` (3 entries, index 3 is CODE -- needs a guard) and
`$246B38 + $80` (32 entries, bounded by `andi.w #$1F` -- needs none). Plus each caller's table; `$4C`'s is
`$2701C8 + $E`.

### `$26F858` IS A STATE SETTER; THE DISPATCHER IS A SEPARATE ENTRY AT `$26F86A` (W341)

Displayed rather than inferred, because the first `dasm` started mid-routine and made these look like one
thing:

    26f858  b06e 0026    cmp.w ($26,A6),D0        <-- the SETTER begins
    26f85c  6700 000a    beq $26F868              already in that state -> do nothing
    26f860  3d40 0026    move.w D0,($26,A6)       set it
    26f864  426e 0028    clr.w ($28,A6)           ... and reset the sub-timer, ONLY on a change
    26f868  4e75         rts
    26f86a  41fa 001a    lea ($26F886,PC),A0      <-- the DISPATCHER, a SEPARATE entry
    26f870  move.w ($26,A6),D0 / add.w D0,D0 / add.w D0,D0 / adda.w D0,A0
    26f87a  movea.l (A0),A0 / jsr (A0)            the indirect call
    26f87e  jmp $2417DE                           tail jump to applyVelocityA6 -- ALREADY PORTED
    26f886  the EIGHT-entry jump table

**`$26F6CC moveq #$6,D0 / bsr $26F858` is therefore "GO TO STATE 6"**, and the `clr.w ($28,A6)` is why it
matters that the setter checks first: re-entering the same state must NOT reset the sub-timer. A port that
wrote the state unconditionally would restart the timer every frame the state was re-requested.

**THE JUMP TABLE AT `$26F886` HAS EIGHT ENTRIES** (`$20` bytes, `$26F886..$26F8A5`), and entry 8 reads
`$0C6E0000` -- not a code address -- so the table is bounded by its own data end and the state index is 0..7.
The eight handlers are `$26F8A6`, `$26F90E`, `$26FBD4`, `$26FCF2`, `$26FD66`, `$26FECA`, `$26FF3E`, `$26FF56`
-- **all unread**, and `$26F8A6` immediately follows the table, so the first handler's address doubles as the
table's far end.

**THIS REVISES `$4C`'s SIZE UPWARD, AND THAT IS THE USEFUL PART.** I had it as "one unread routine away from
writable". It is an eight-state machine whose eight handlers are all unread, spanning `$26F8A6..$2701C8` --
roughly **2300 bytes**. That makes `$4C` comparable to a boss, not to `$43`, and it should be scheduled as
several waves: the setter and dispatcher (small, and the dispatcher needs only `applyVelocityA6` plus the
table), then the handlers in groups.

**Windows:** `$26F886 + $20` for the jump table. The handlers will want their own once read.

So the honest state of `$4C`: init read and small, handler head read, damage arm read, death path read, and an
eight-state machine of ~2300 unread bytes behind `$26F86A`. Its two shared prerequisites (`$246800`,
`$246520`) are now PORTED, which was the real value of this stretch.

### `$4C` IS A TWO-LEVEL STATE MACHINE, WHICH EXPLAINS THE SETTER (W341)

`$26F8A6`, the state-0 handler, is itself a sub-state machine on **`($28,A6)`** -- exactly the field
`$26F858`'s setter clears:

    26f8a6  cmpi.w #$0,($28,A6) / bne $26F8C2
    26f8b0  move.w #$1600,($1A,A6)         speed $16, heading $00 -- the applyVelocityA6 FIELDS
    26f8b6  move.w #$202,($34,A6)          TWO byte fields: ($34)=2 ($35)=2
    26f8bc  move.w #$1,($28,A6)            sub-state 0 -> 1
    26f8c2  cmpi.w #$1,($28,A6) / bne $26F8DC
    26f8cc  cmpi.w #$2000,($2,A6) / blt $26F8DC     wait until Y reaches $2000
    26f8d6  move.w #$2,($28,A6)            sub-state 1 -> 2
    26f8dc  cmpi.w #$2,($28,A6) / ...

**SO `($26,A6)` SELECTS ONE OF EIGHT HANDLERS AND EACH HANDLER RUNS ITS OWN MACHINE ON `($28,A6)`.** That is
why the setter clears `($28,A6)` and why its early-out matters: entering a NEW outer state must restart the
inner one, and re-requesting the SAME outer state must not. Two facts recorded separately now explain each
other -- the setter's shape is a consequence of the handler's shape.

**AND IT CONFIRMS THE DISPATCHER'S TAIL JUMP.** `$26F8B0` writes `($1A,A6)`/`($1B,A6)`, which are exactly the
speed and heading `applyVelocityA6` reads -- so state 0 sets a velocity and the dispatcher's
`jmp $2417DE` is what applies it every frame. The three pieces (setter, dispatcher, handler) are one design.

`move.w #$202,($34,A6)` is the word-literal-as-two-byte-fields rule again: `($34,A6) = 2` and
`($35,A6) = 2`. That is the tenth instance of that idiom this session across `$43`, `$47`, `$4B` and `$4C`.

**PORTING SHAPE FOR THE EIGHT HANDLERS:** each is `if (sub === 0) {...} if (sub === 1) {...}` -- a FALL-THROUGH
cascade, not a switch. `$26F8AC bne` skips to the next test rather than to an exit, so a handler can advance
through several sub-states in one frame. **Do not write these as `else if` or as a `switch`**: sub-state 0
setting `($28,A6) = 1` means the `cmpi.w #$1` immediately below it takes effect on the SAME frame. That is the
same cascade shape `$43`'s three states use and the opposite of `$4A`'s mutually exclusive arms.

Still unread: the rest of `$26F8A6` past `$26F8DC`, and the seven handlers `$26F90E`, `$26FBD4`, `$26FCF2`,
`$26FD66`, `$26FECA`, `$26FF3E`, `$26FF56`.

### `$4C` STATE 0 IS COMPLETE (W341) -- and `($1A,A6)` IS BOTH THE SPEED AND THE DECELERATION COUNTER

    26f8dc  cmpi.w #$2,($28,A6) / bne $26F90C          sub-state 2
    26f8e6  subq.b #1,($34,A6) / bcc $26F90C           the cadence -- UNDERFLOW convention
    26f8ee  move.b ($35,A6),($34,A6)                   reload from the pair sub-state 0 seeded
    26f8f4  subq.b #1,($1A,A6) / bne $26F90C           <-- DECREMENT THE SPEED, test for ZERO
    26f8fc  move.b #$1,($17,A5)
    26f902  move.w #$A001,(A6)                         the record's type word
    26f906  moveq #$1,D0 / bsr $26F858                 -> outer state 1
    26f90c  rts

**`($1A,A6)` IS THE SPEED `applyVelocityA6` READS *AND* THE COUNTER THIS ARM DECREMENTS.** Sub-state 0 seeds
it to `$16` (via `move.w #$1600,($1A,A6)`), the dispatcher's `jmp $2417DE` reads it every frame to move the
object, and sub-state 2 knocks it down by one per cadence tick until it hits zero. **So state 0 is "enter
moving, decelerate to a stop, then advance"** -- the deceleration and the timer are the same byte.

Read as a plain timer, the object would keep its entry speed and then teleport into state 1. Read as a plain
speed, the state would never advance. **It is both, and a port must decrement the field the velocity code
reads.** That is a third distinct meaning for `($1A,A6)` in this project after `$4B`'s animation counter and
the band's palette base -- and the fourth countdown-shaped thing that is not a countdown.

Note the mixed conventions inside eight instructions: `($34,A6)` uses `subq.b`/`bcc` (underflow) and
`($1A,A6)` uses `subq.b`/`bne` (fires AT ZERO). **Two of the four catalogued conventions, six bytes apart**,
which is the same trap `$43` set at `$26DE6E`/`$26DE7C`.

`move.w #$A001,(A6)` sets the record's type word on the way out: bit 15 (alive), bit 13, and bit 0.
Transcribe the literal; do not decompose it into flag names that have not been measured.

**STATE 0 IS THEREFORE FULLY READ AND SMALL** -- roughly 24 instructions across three sub-states. If the other
seven are comparable, `$4C`'s ~2300 bytes are mostly the later handlers, and the eight can be written in two
or three waves rather than eight.

Still unread: `$26F90E` (state 1, which begins immediately at `$26F90E cmpi.w #$0,($28,A6)` -- the same
cascade shape) and the six after it.

### `$4C` STATE 1 (W341) -- a two-point oscillation, and a table bounded TWICE

    26f90e  cmpi.w #$0,($28,A6) / bne $26F938        sub-state 0
    26f918  move.w #$1,($28,A6)
    26f91e  move.b #$4,($1A,A6)                      speed 4 (state 0 left it at ZERO)
    26f924  move.w #$0,($2A,A6)                      the oscillation cursor
    26f92a  move.w #$12C,($30,A6)                    a 300-frame duration
    26f930  bsr $26F994 / bsr $26FA5E                two more private subroutines
    26f938  lea ($26F984,PC),A0 / adda.w ($2A,A6),A0
    26f942  movem.w (A0),D2-D3                       <-- SIGN-EXTENDS both words
    26f946  bsr $26FF9E / bcs $26F958                a call reporting through CARRY
    26f94e  addq.w #4,($2A,A6) / andi.w #$7,($2A,A6) advance the cursor on SUCCESS only
    26f958  subq.w #1,($30,A6) / bne $26F982         the duration

**`($2A,A6)` ALTERNATES BETWEEN EXACTLY TWO VALUES.** Step 4, mask `$7`: `0 -> 4 -> 0 -> 4`, because `8 & 7`
is 0. So the table at `$26F984` has **TWO** four-byte entries and no more:

    [+0]  5000 2A00
    [+4]  5000 0E00
    [+8]  3D7C 0000   <-- CODE (`move.w #$46,...` then `rts` at $26F992)

**IT IS BOUNDED TWICE OVER** -- by the ROM's own `andi.w #$7`, and by code at `+8`. That is the fifth table
this session bounded by its own instruction stream, and the first that is *also* mask-bounded. So no guard is
needed (the mask suffices) but the window must still stop at `$8`: `$26F984 + $8`, not `$10`.

**Both entries share D2 = `$5000` and differ only in D3 (`$2A00` / `$0E00`)**, and `movem.w` sign-extends both
into full longs. Given `$24203E`'s documented convention (`self=D0/D1 target=D2/D3`), these are almost
certainly **two target positions at the same X**, and `$26FF9E` is a move-toward-target that reports arrival
through carry: on carry CLEAR the cursor flips to the other point. **So state 1 is "oscillate between two
points at speed 4 for 300 frames"** -- and the `bcs` skipping the flip is what makes it wait until it arrives.

State 0 left `($1A,A6)` at ZERO after decelerating; state 1 re-seeds it to 4. **The speed field is handed
between states**, which is worth knowing before writing them independently.

Two more private subroutines appear: `$26F994` and `$26FA5E`, both called once from sub-state 0. And
`$26FF9E` is the target-mover, called every frame.

Still unread: `$26F982`'s tail, `$26F994`, `$26FA5E`, `$26FF9E`, and the six handlers from `$26FBD4`.

### `$26FF9E` IS A DISTANCE-BANDED APPROACH, AND ONLY `$242494` IS NEW (W341)

`$26FF9E`, called every frame by `$4C`'s state 1 and by six other sites:

    26ffa4  sub.w D0,D3                    the delta to the target
    26ffa6  jsr $242494                    -> D0 = a DISTANCE
    26ffac  cmpi.w #$200,D0 / bge $26FFCC  far: keep the current speed
    26ffb2  move.b #$8,($1A,A6)            under $200: speed 8
    26ffb8  cmpi.w #$100,D0 / bge $26FFCC
    26ffbe  move.b #$6,($1A,A6)            under $100: speed 6   <-- the writes CASCADE
    26ffc4  cmpi.w #$40,D0 / blt $26FFE2   under $40: ARRIVED -- and $26FFE2 CLEARS carry (corrected)
    26ffcc  jsr $242038                    otherwise aim and move

**THE SPEED WRITES CASCADE RATHER THAN SWITCHING.** For `$40 <= D0 < $100` BOTH `move.b`s execute and the
field ends at 6, because `$26FFB0`'s `bge` only skips when D0 is `$200` or more. So the bands are: `>= $200`
unchanged, `$100..$1FF` speed 8, `$40..$FF` speed 6, `< $40` arrived. **Written as a switch, the `$40..$FF`
band would get speed 8** -- the same fall-through-not-switch shape the eight state handlers use.

So `$4C` decelerates as it approaches each of state 1's two oscillation points, and `($1A,A6)` is written here
too -- a FOURTH writer of that field after state 0's seed, state 0's decrement and state 1's re-seed.

**BOTH OF ITS CALLEES RESOLVE, AND ONLY ONE IS NEW:**

    $242038   THREE callers. Its preamble is `4CAE 0003 0002` = `movem.w ($2,A6),D0-D1` -- and it FALLS
              STRAIGHT INTO `$24203E`, which `aim.js:62` already carries as `core64` ("self=D0/D1
              target=D2/D3 -> D1", 48 callers). **So `$242038` is the A6-convenience entry to a ported
              routine**, exactly analogous to `applyVelocityA6` vs `applyVelocity`. Two instructions, not a
              prerequisite.
    $242494   TWENTY-ONE callers, UNPORTED, returns a distance in D0. **This is the one real gap here**, and
              at twenty-one callers it is core geometry infrastructure like `$246800` was -- port it on its
              own and expect it to unblock widely.

That is the sixth time this session a suspected prerequisite turned out to be a thin entry onto ported code,
against three that were real (`$246520`, `$246800`, and now `$242494`). The distinguishing signal remains
caller count PLUS a substantial body: `$242038` is two instructions.

Still unread for `$4C`: `$26F994`, `$26FA5E`, `$26FFE2`'s carry tail, and the six handlers from `$26FBD4`.

### `$26FF9E`'s TWO EXITS, AND A POLARITY I HAD BACKWARDS (W341)

    26ffd8  move.b D1,($1B,A6)        the aim result becomes the HEADING
    26ffdc  ori  #$1,SR / rts         <-- carry SET   = still moving
    26ffe2  andi #$FFFE,SR / rts      <-- carry CLEAR = ARRIVED (from $26FFC8's blt)

**CORRECTION.** The `$26FF9E` section above said "`$26FFE2` sets the carry state 1 reads". It **clears** it.
Fixed in place. The state-1 section's reading was right for the wrong stated reason, so both now agree:

    state 1: bsr $26FF9E / bcs $26F958
      carry SET   -> still moving -> SKIP the cursor flip, keep aiming at the same point
      carry CLEAR -> arrived      -> advance ($2A,A6) to the other point

So the `bcs` is what makes the oscillation wait for arrival, and the ROM signals "not done" with carry set --
the same convention as `$281842`'s full-pool path (W336) and `$26DC00`'s retry (W340). **Three routines now
return failure-or-not-yet as carry SET via an explicit `ori #$1,SR`.** Treat that as this codebase's idiom and
check the polarity at the `ori`/`andi`, never at the caller's branch alone: I read the caller correctly and
still wrote the callee backwards.

`$26FFD8` also names a field: the aim result from `$242038`/`core64` lands in `($1B,A6)`, which is exactly the
heading `applyVelocityA6` reads. **So `$26FF9E` steers and the dispatcher's tail jump moves** -- and with
`($1A,A6)` set by the distance bands, that pair is the whole locomotion of `$4C`.

### `$26FFE8` IS `$4C`'s DYING DRIFT (W341)

    26ffe8  tst.b ($9F,A6) / beq $270128      runs ONLY when the dying flag is set
    26fff0  subi.w #$40,($2,A6)               and moves the record UP by $40 per frame

`$26F6E4 bsr $26FFE8` is its one caller, on the death path. So a dying `$4C` drifts upward at `$40` per frame
-- which is what eventually takes it past the `$800` off-screen limit and frees it. **The retirement is a
drift, not a timer**, and the `($9F,A6)` test has the same "runs only when marked" polarity as `$47`'s
`$26DCB6`.

Still unread for `$4C`: `$26F994`, `$26FA5E`, `$270128` onward, and the six handlers from `$26FBD4`.

### `$4C` USES THE "ARM + RUN" SPLIT TWICE, AND HAS A THIRD STATE LEVEL (W341)

    26f994  move.w #$1,($46,A6)        <-- the ARM: three instructions
    26f99a  move.w #$0,($4C,A6)
    26f9a0  rts
    26f9a2  tst.w ($46,A6) / beq $26FA24     <-- the RUNNER, a SEPARATE routine
    26f9aa  cmpi.w #$1,($4C,A6) / bne $26F9C6
    26f9b4  move.w #$A00,($48,A6) / move.w #$A00,($4A,A6) / move.w #$0,($4C,A6)
    26f9c6  cmpi.w #$0,($4C,A6) / bne $26FA24
    ...

**THIS IS THE SAME SETTER/RUNNER SPLIT AS `$26F858`/`$26F86A`, AND IT IS THE SECOND INSTANCE IN THIS TYPE.**
`$26F994` arms a subsystem (`($46,A6) = 1`) and resets its cursor (`($4C,A6) = 0`); `$26F9A2` runs it, gated
on the arm flag and cascading on the cursor. Both have exactly ONE caller each -- so they are `$4C`-private,
not shared, and the split is a **style** this author uses rather than an interface for other types.

**SO `$4C` HAS THREE LEVELS OF STATE**, and a port must keep them distinct:

    ($26,A6)   the OUTER state, 0..7, selecting one of eight handlers   (set by $26F858, run by $26F86A)
    ($28,A6)   each handler's own sub-state cascade                     (cleared by $26F858 on a change)
    ($4C,A6)   a THIRD machine, gated by the arm flag ($46,A6)          (set by $26F994, run by $26F9A2)

`($48,A6)`/`($4A,A6)` are seeded to `$A00` each -- a pair of equal values, so likely a symmetric X/Y or a
two-muzzle offset, and note they are set on cursor `1` and the cursor is then reset to `0`, so the runner
cycles rather than advancing monotonically.

**Recognising the split matters because both halves look like one routine in a `dasm` that starts at the
first address.** That is exactly how I first misread `$26F858`, and this is the same shape fourteen bytes
further on. **When a routine in `$4C` ends in an `rts` followed immediately by a `tst.w` of the flag it just
set, expect two entry points.**

`$26FA5E`, state 1's other one-caller subroutine, is still unread -- and by this pattern it may well be
another arm or runner.

Still unread for `$4C`: `$26F9C6` onward, `$26FA24`, `$26FA5E`, `$270128` onward, and the six handlers from
`$26FBD4`.

### `$4C`'s SUBSYSTEMS ARE ONE PER SUB-RECORD, AT A `$20` STRIDE (W341)

`$26FA5E` is a THIRD arm, and comparing it with `$26F994` reveals the layout:

    26fa5e  move.w #$1,($66,A6)        arm #2
    26fa64  move.w #$0,($6C,A6)        cursor #2
    26fa6a  move.w #$1818,($6E,A6)     a cadence PAIR: ($6E)=$18 ($6F)=$18
    26fa70  tst.w $813098 / beq $26FA80    <-- THE RANK GATE
    26fa7a  move.w #$404,($6E,A6)      above rank 0: $04/$04 -- FOUR TIMES FASTER
    26fa80  rts
    26fa82  tst.w ($66,A6) / beq $26FBA2   the runner, same shape as $26F9A2

**THE ARM/CURSOR PAIRS SIT ONE PER SUB-RECORD AT A `$20` STRIDE:**

    sub-record 1   +$26 outer state   +$28 its cascade      ($26F858 / $26F86A)
    sub-record 2   +$46 arm           +$4C cursor           ($26F994 / $26F9A2)
    sub-record 3   +$66 arm           +$6C cursor           ($26FA5E / $26FA82)

`$66 - $46 == $20` and `$6C - $4C == $20`, exactly the sub-record stride. **So each of `$4C`'s five
`$20`-byte sub-records hosts one machine**, and `($4,A5) = 4` (five sub-records) is not just a size -- it is
how many independent machines the object has room for. That is a fifth structural fact derived from `($4,A5)`,
after the overlap depth and the hitMask/retire/dying trio.

**It also predicts where to look:** a fourth pair would be `+$86`/`+$8C` in sub-record 4, and the `+$8E` hit
mask and `+$9E`/`+$9F` flags already measured live in that same sub-record. So sub-record 4 is the
damage/lifetime record and sub-records 2 and 3 are weapon subsystems.

**AND THE RANK GATE IS A CADENCE, NOT A PATTERN CHANGE.** `$1818` at rank 0 becomes `$404` above it -- the
reload byte drops from `$18` to `$04`, so the subsystem fires **four times as often** at higher rank. Contrast
`$47`, whose rank arm interleaves a second bullet TYPE at the same rate (W339). **Two types, two different
rank mechanisms**: `$47` changes what it fires, `$4C` changes how often. Neither is a difficulty multiplier
applied uniformly, so neither can be inferred from the other.

`move.w #$1818` and `move.w #$404` are the word-literal-as-two-byte-fields idiom for the eleventh and twelfth
time this session.

Still unread for `$4C`: `$26F9C6` onward, `$26FA24`, `$26FA8A` onward, `$26FBA2`, `$270128` onward, and the
six handlers from `$26FBD4`.

### `$4C` SUBSYSTEM 2's RUNNER (W341) -- A DEAD CONDITIONAL, AND THE BORROW RULE AGAIN

    26f9d0  move.w ($48,A6),D0 / add.w ($4A,A6),D0 / bne $26FA24   wait until BOTH counters are zero
    26f9dc  moveq #$0,D0                                           <-- D0 := 0
    26f9de  and.w $80390A,D0                                       <-- 0 AND anything IS 0
    26f9e4  bne $26FA24                                            <-- SO THIS IS NEVER TAKEN
    26f9e6  move.w #$1,($4C,A6)
    26f9ec  moveq #$4E,D0 / jsr $263684        enqueueDeferred(type $4E, DEFQ_D1.FIXED00) -- PORTED
    26f9f4  move.l ($2,A6),D0 / addi.l #-$3C01380,D0 / move.l D0,($16,A0)
    26fa02  move.w #$FA00,($1A,A0)             a speed/heading PAIR: $FA / $00
    26fa08  moveq #$4E,D0 / jsr $263684        a SECOND spawn

**`$26F9DC..$26F9E4` IS A DEAD CONDITIONAL AND IT LOOKS COMPLETELY LIVE.** `moveq #$0,D0` then
`and.w $80390A,D0` leaves D0 zero whatever `$80390A` holds, so the `bne` can never be taken. `$80390A` is in
the player-input region (`movement.js` has `P2RAW = $803976`), so this READS as "only fire when the player is
doing something" and is in fact unconditional. **Third kind of dead code this session** -- after `$2716D8`'s
`tst.w` of a `lea` opcode (W335) and `$2714AE`'s bare `rts` (W336), this is a *test whose operand is forced to
zero by the instruction before it*.

**Omit the branch, keep the reading.** A port that modelled the input test would silence subsystem 2 whenever
the player was idle, which is a plausible-looking bug nobody would trace to a `moveq`. And do NOT "repair" it
to `move.w $80390A,D0`: that is a guess about intent, and the board runs the dead version.

**THE BORROW RULE, A SIXTH TIME.** `addi.l #-$3C01380` is `$FC3FEC80`. Assembled naively from the word pair
`-$3C0`/`-$1380` it would be `$FC40EC80` -- **one more in the high word**, because the low half's borrow takes
one off. Transcribe the longword.

Both spawns go through `$263684`, which is `enqueueDeferred` with `DEFQ_D1.FIXED00` -- **already ported**, and
the same family `$43` uses at `$263678` with `FIXED80`. So subsystem 2 needs no new machinery: it waits for two
counters, then queues two type-`$4E` objects with biased positions and a `$FA00` speed/heading pair.

By the `$20`-stride finding, subsystem 3's runner at `$26FA82` should mirror this with `+$68`/`+$6A` counters
and its own spawn type. **Read it rather than assuming the mirror** -- this band has punished that inference
nine times.

Still unread for `$4C`: `$26FA10` onward, `$26FA24`, `$26FA8A` onward, `$26FBA2`, `$270128` onward, and the six
handlers from `$26FBD4`.

### `$4C` SUBSYSTEM 3 IS *NOT* SUBSYSTEM 2's MIRROR (W341) -- and its input gate is LIVE

The previous section said to read `$26FA82` rather than assume it mirrored `$26F9A2`. It does not:

    26fa8a  cmpi.w #$1,($6C,A6) / bne   -> move.w #$800,($68,A6) / cursor := 0
    26faa0  cmpi.w #$2,($6C,A6) / bne   -> move.w #$800,($6A,A6) / cursor := 0
    26fab6  cmpi.w #$0,($6C,A6) / bne $26FBA2
    26fac0  tst.w $803914 / bne $26FB3E          <-- a LIVE input test
    26faca  moveq #$0,D0
    26facc  tst.w $8103E6 / ...

**THREE differences from subsystem 2**, none inferable:

    subsystem 2 ($26F9A2)          subsystem 3 ($26FA82)
    TWO cursor cases (1, 0)        THREE (1, 2, 0)
    seeds ($48)/($4A) TOGETHER     seeds ($68) and ($6A) SEPARATELY, on different cursors
    its input test is DEAD         its input test is LIVE

**AND THE DEAD/LIVE DISTINCTION IS ONE INSTRUCTION.** Both subsystems have a `moveq #$0,D0` next to an address
test, and only one is dead:

    subsystem 2:  moveq #$0,D0 / and.w $80390A,D0 / bne     DEAD -- the moveq feeds the AND's destination
    subsystem 3:  tst.w $803914 / bne                       LIVE -- a direct tst, nothing zeroed it
                  moveq #$0,D0 / tst.w $8103E6              LIVE -- the moveq clears D0 for LATER use,
                                                            and `tst.w` does not read D0 at all

**So the test for deadness is whether the zeroed register is the following instruction's DESTINATION**, not
whether a `moveq #$0` appears nearby. Getting that backwards in either direction is a live defect: modelling
subsystem 2's gate silences it when the player is idle; omitting subsystem 3's makes it fire unconditionally.

`$803914` joins `$80390A` in the player-input region, and `$8103E6` is new -- and note it sits just past the
`$810346 + 3 * $30 = $8103D6` parent pool measured earlier, so it is in the RAM the `$246520` subsystem
neighbours rather than in the input block.

Still unread for `$4C`: `$26FA10`, `$26FA24`, `$26FACC` onward, `$26FB3E`, `$26FBA2`, `$270128` onward, and the
six handlers from `$26FBD4`.

================================================================================
## TYPE `$4C` -- ONE CONSOLIDATED REFERENCE (W341). READ THIS INSTEAD OF THE 22 SECTIONS ABOVE.
================================================================================

Twenty-two sections above accumulated `$4C` one finding at a time. This block is the whole picture; they
remain only as the reasoning trail. **Everything below was displayed, not inferred.**

    init      $26F4DA  (($4,A5) = 4 -> FIVE $20-byte sub records)
    initBody  $26F4E2
    handler   $26F5F2
    records   ONE, in stage 5's script.  Window: $26F55A + $AC (prototypes, TWENTY-byte handler overlap)

### THE FIVE FACTS THAT FALL OUT OF `($4,A5) = 4`

    record size          5 * $20 = $A0
    prototype overlap    $26F566 + $A0 = $26F606 vs handler $26F5F2  ->  TWENTY bytes
    hitMask              size - $12 = +$8E
    retire flag          size - 2   = +$9E
    dying flag           size - 1   = +$9F
    subsystem slots      one machine per sub-record, arm/cursor at a $20 stride

### THREE LEVELS OF STATE, EACH AN "ARM + RUN" PAIR WITH TWO ENTRY POINTS

    sub-rec 1   +$26 state / +$28 cascade   $26F858 sets (with an early-out) / $26F86A dispatches
    sub-rec 2   +$46 arm   / +$4C cursor    $26F994 arms                     / $26F9A2 runs
    sub-rec 3   +$66 arm   / +$6C cursor    $26FA5E arms                     / $26FA82 runs

**Every pair is TWO routines, and both halves look like one in a `dasm` that starts at the first address.**
`$26F858`'s early-out is load-bearing: re-entering the same outer state must NOT clear `($28,A6)`.

### THE OUTER MACHINE

`$26F86A`: index `($26,A6) * 4` into the eight-entry table at **`$26F886 + $20`** (its far end is `$26F8A6`,
the first handler it names), `jsr (A0)`, then `jmp $2417DE` -- `applyVelocityA6`, already ported.

    state 0  $26F8A6  READ.  Enter at speed $16, decelerate to a stop, -> state 1.
    state 1  $26F90E  READ.  Speed 4; oscillate between two points from $26F984 + $8 for 300 frames.
    state 2  $26FBD4  READ.  Speed $10 to ONE target, D2/D3 IMMEDIATE ($2800/$1C00), stop on arrival.
    state 3  $26FCF2  READ (head).  Duration $F0 and speed $10; winds ($1E,A5) DOWN BY $40 with a
                      SIGNED CLAMP at zero, every frame and outside the sub-state cascade.
    state 4  $26FD66  READ (head).  State 2's SHAPE with every constant different -- see below.
    state 5  $26FECA  READ (head).  State 3's shape: duration $40 (vs $F0), speed $10 (SAME), and the
                      SAME wind-down block -- BYTE-IDENTICAL, 24 bytes, verified.
    state 6  $26FF3E  READ, COMPLETE.  FOUR instructions: `move.w #$420,($1A,A6)` then rts. Speed $04,
                      heading $20, as a WORD write to the speed/heading PAIR. Nothing else.
    state 7  $26FF56  READ (head).  Heading := 0, then ACCELERATE: `addq.b #1,($1A,A6)` per frame,
                      capped at 8 by `cmpi.b #$8 / beq`. The counterpart to state 0's deceleration.

**ALL EIGHT STATES ARE NOW MAPPED**, and the machine reads as a scripted entrance:

    0  enter at speed $16, DECELERATE to a stop            -> state 1
    1  speed 4, oscillate between two table points, 300 frames
    2  speed $10 to $2800/$1C00 (immediate), STOP on arrival
    3  duration $F0, speed $10, wind ($1E,A5) down by $40
    4  speed 8 to $3200/$1C00 (immediate), slow to 4 on arrival
    5  duration $40, speed $10, the SAME 24 bytes as state 3
    6  speed $04 heading $20, and nothing else (four instructions)
    7  heading 0, ACCELERATE to 8

**Speed is the through-line**: `$16` decelerating to 0, then 4, `$10`, `$10`, 8-to-4, `$10`, 4, accelerating
to 8. Six of the eight states write `($1A,A6)` and they never agree on a value -- which is why the four
writers of that field (state 0's seed, state 0's decrement, state 7's increment, and `$26FF9E`'s distance
bands) all have to be ported separately.

**State 6's `move.w #$420,($1A,A6)` is the word-pair idiom landing on the LOCOMOTION fields** -- speed `$04`
and heading `$20` in one instruction. Read as a single word this state would set an absurd speed and no
heading. Twelfth-plus instance of that idiom this session and the first on these two fields.

**STATES 3 AND 5 SHARE 24 BYTES VERBATIM, AND THIS IS THE FIRST THING IN `$4C` THAT ACTUALLY IS SHARED.**
`$26FD0E..$26FD25` and `$26FEE6..$26FEFD` are byte-identical:

    4a6d 001e  6700 0012  046d 0040 001e  6e00 0008  3b7c 0000 001e

Both also use speed `$10`; only the duration differs (`$F0` against `$40`). **So a helper IS justified here**,
in contrast to states 2/4 where a shared move-to-a-point routine would have needed five parameters and still
got the arrival semantics wrong. The distinguishing evidence is byte-identity, not similarity of shape:

    states 2 & 4   same SHAPE, five constants differ    -> write them separately
    states 3 & 5   24 bytes IDENTICAL, one constant differs -> ONE helper, one parameter

**Check byte-identity before factoring anything in this type.** Six of `$4C`'s eight states are now read and
that is the only verbatim repeat among them.

**STATES 2 AND 4 ARE THE SAME SHAPE AND SHARE NO CONSTANT BUT ONE.** Both are "set a speed, move to an
immediate D2/D3 target, change speed on arrival":

                        state 2        state 4
    entry speed         $10            $08
    target D2 (X)       $2800          $3200
    target D3 (Y)       $1C00          $1C00      <-- the ONE they share
    arrival speed       $00 (stop)     $04 (keep moving slowly)
    sub-state 0 clears  ($2A),($2B),($34)   ($2A) only

**So a shared "move to a point" helper would need five parameters and would still get the arrival semantics
wrong**: state 2 stops, state 4 slows. That is the `$48`/`$49`/`$4A`/`$4B` band's lesson one level down --
identical instruction sequences, different constants, and the sameness of the Y target is the only thing that
transfers.

**STATE 3 ADDS A FIFTH COUNTDOWN CONVENTION**, and it is the only one so far that is not a decrement-by-one:

    26fd0e  tst.w ($1E,A5) / beq $26FD26          skip entirely when already zero
    26fd16  subi.w #$40,($1E,A5) / bgt $26FD26    subtract a STRIDE, signed-compare the result
    26fd20  move.w #$0,($1E,A5)                   ... and CLAMP rather than let it go negative

    subq + bcc          fire on UNDERFLOW                  due8
    subq + bpl          run into NEGATIVES                  $26DC04 ($47)
    subq + beq / bne    fire AT ZERO                        $26DCA2 ($47), $25354C (W29)
    subq + cmpi #$N     fire at an ARBITRARY CONSTANT       $26DE7C ($43)
    subi #$N + bgt      subtract a STRIDE, CLAMP at zero    $26FD16 ($4C)   <-- FIFTH

Note it runs OUTSIDE the `($28,A6)` cascade -- between sub-state 0's block and sub-state 1's test -- so it
winds down on every frame the state is active regardless of sub-state. **A port that put it inside a sub-state
arm would stall it.**

**THE TARGET CAN BE IMMEDIATE OR TABLE-SOURCED, AND `$26FF9E` DOES NOT CARE.** State 1 loads D2/D3 with
`movem.w (A0),D2-D3` from a two-entry table (sign-extending); state 2 uses `move.w #$2800,D2` /
`move.w #$1C00,D3` outright. Same callee, same carry protocol -- so do not build a shared "load the target"
helper that assumes a table.

**AND `($2A,A6)` IS WRITTEN AT TWO DIFFERENT WIDTHS.** State 1 does `move.w #$0,($2A,A6)`; state 2 does
`move.b #$0,($2A,A6)` AND `move.b #$0,($2B,A6)` as separate instructions. Both zero the same two bytes here,
but they are not the same instruction and a port that unified them would lose the distinction the moment
either wrote a non-zero. State 2 also writes `($34,A6)` as a BYTE where state 0 wrote it as the word pair
`$202`.

**Each handler is a FALL-THROUGH cascade of `if (sub === N)`, never a switch**: setting `($28,A6) = 1` means
the `cmpi.w #$1` below it fires on the SAME frame.

### LOCOMOTION -- three fields, four writers

`($1A,A6)` speed and `($1B,A6)` heading are what `applyVelocityA6` reads. `$26FF9E` steers (writing the
heading from `core64`) and sets the speed by DISTANCE BAND: `>= $200` unchanged, `$100..$1FF` -> 8,
`$40..$FF` -> 6, `< $40` -> arrived. **The band writes CASCADE**, so `$40..$FF` really is 6.
`$242494` (ported W341) supplies the distance: `max(a,b) + min(a,b)/2` with **`a = |dy| * 3/4`, one axis only**.

`($1A,A6)` is ALSO state 0's deceleration counter and is re-seeded by state 1. Four writers, three meanings.

### DAMAGE AND DEATH

`$7FFF` sink at `($18,A6)` over a LONG HP at `($1A,A5)`; the subtraction is **gated on `($16,A5)`**, so `$4C`
is invulnerable until it appears. Palette XOR literal `$D`. Kill score `$700`.
Death marks `(A6) = $8000` and `($9F,A6) = 1`, clears BOTH `$8130DE` and `$8130E0`, pushes
`pushExternalSpeed($20,$20)`, and builds parts via `$246520` (ported W341) from `$2701C8 + $E`.
**Retirement clears only `$8130DE`** -- the two exits genuinely differ; do not unify them.
`$26FFE8` then drifts the record UP `$40` per frame until the `$800` off-screen limit frees it.

### THE TWO DEAD-CODE TRAPS, AND THE ONE-INSTRUCTION TEST THAT SEPARATES THEM

    subsystem 2  moveq #$0,D0 / and.w $80390A,D0 / bne     DEAD: the moveq feeds the AND's DESTINATION
    subsystem 3  tst.w $803914 / bne                       LIVE: a direct tst
                 moveq #$0,D0 / tst.w $8103E6              LIVE: tst.w never reads D0

**Deadness is "is the zeroed register this instruction's destination", not "is there a `moveq #$0` nearby".**

### RANK

`$4C` scales rank as a **cadence**: `($6E,A6)` is `$1818` at rank 0 and `$404` above, so subsystem 3 fires four
times as often. (`$47` scales rank by interleaving a bullet TYPE instead -- two types, two mechanisms.)

### WHAT REMAINS

Six state handlers (`$26FBD4` onward, the bulk of ~2300 bytes) plus the spans `$26FA10`, `$26FA24`, `$26FACC`,
`$26FB3E`, `$26FBA2`, `$270128`. **No unported callee remains**: `$246800`, `$246520`, `$242494`,
`applyVelocityA6`, `core64`, `enqueueDeferred` (both `FIXED00` and `FIXED80`), `installBank`, `scoreHit`,
`scoreKill`, `pushExternalSpeed`, `scrollCompensate` and `$23DECE` are all in the port.

### W344 START: THE TRANSITION SCREEN'S PHASE-0 ARM IS READ. `$23C668` NEEDS A VIDEO-SPACE MODEL FIRST.

**`$25DC2C..$25DCA8` -- object [11] phase 0's arm, read in full:**

    25dc2c  movea.l ($8,A5),A4                     the descriptor
    25dc30  cmpi.b #$0,($C,A5) / bne $25DCC0       PHASE 0 ONLY
    25dc3a  tst.w $813098 / beq $25DC50            rank
    25dc44  cmpi.w #$4,$813092 / beq $25DCC0       ... and stage index 4 -> skip entirely
    25dc50  tst.w $803926 / bne $25DCC0
    25dc5a  movea.l ($4,A4),A0 / jsr (A0)          the descriptor's INPUT READ ($23D186, ported)
    25dc60  btst #$F,D0 / beq $25DCC0              bit 15 -- START not pressed -> nothing
    25dc68  jsr $28D53C / bcs $25DCC0              a gate, 6 callers, UNPORTED
    25dc72  movea.l ($C,A4),A0 / jsr (A0) / bcs    a SECOND descriptor slot, UNPORTED
    25dc7c  bsr $25DA60 / bsr $25DA94              the two cursor routines (1 caller each)
    25dc84  move.b #$1,($C,A5)                     **PHASE 0 -> 1**
    25dc8a  move.b ($7,A5),D0 / jsr $260A88        6 callers, UNPORTED
    25dc94  move.w ($14,A4),D0 / lea $225978,A0 / jsr $24150A    installBank (PORTED)
    25dca4  jsr $23C668                            the block clear

**So phase 0 is "wait for START, then set up and advance to phase 1"**, and the `cmpi.w #$4,$813092` means it
is skipped outright on stage 5 at non-zero rank -- worth knowing before wondering why it never runs there.

**`$23C668` IS FOUR INSTRUCTIONS AND I COULD NOT PORT IT.** It is `lea $907000,A0 / move.w #$FF,D0 /
move.l #$0,(A0)+ / dbra` -- 256 longwords, `$400` bytes, and `#$FF` + `dbra` is 256 not 255. **But `$907000`
is not main RAM**: `new Ram().setU32(0x907000, ...)` throws `RangeError: $907000 is outside main RAM`.
`background.js`'s video object addresses `$904000` through `setLong(dest)` with `(dest - $904000) >> 2`, and
whether its array reaches `$907000` (`$3000` further on) is unmeasured.

**I wrote the function against `ram`, its tests failed on that throw, and I removed both rather than leave code
that cannot run.** The reading is kept here because it is correct and the routine has SIX callers -- it opens
the phase-0 arm AND bonus lines 1 and 2 (`$25FFA8`, `$260056`), so the D24/D31 chain runs through it.

**MEASURED (W344): `$907000` IS NOT IN ANY VIDEO OBJECT THE PORT HAS.**

    TxVram   64 * 32 * 2 = 4096 words = $2000 bytes, base $904000  ->  covers $904000..$905FFF
    BgVram   64 * 16 * 2 = 2048 words = $1000 bytes
    $907000  is $1000 bytes PAST TxVram's end -- outside it, and outside BgVram

**So this is not "a four-line port with six callers waiting", as I estimated one commit ago.** It needs a new
video region first: something must model `$907000..$9073FF` before `$23C668` can write anything. That is a new
subsystem decision (which object, what size, who else reads it), not a transcription.

**`$907000`'s ROLE IS STILL UNMEASURED.** `$904000` is the text plane (`TxVram`, 8KB) and `$9000A4`/`$9000BC`
in `handlers.js` are selected by `$803926`. `$907000` sits `$1000` past the text plane, so a second plane or a
sprite region are both plausible and neither is measured. **Find its other readers before choosing a model** --
`$23C668` only clears it, so the routine that READS it is what defines its shape.

**REMAINING FOR PHASE 0:** `$28D53C` (6 callers), `$260A88` (6 callers), `$25DA60` and `$25DA94` (1 each,
and `$25DA94` calls `$25DAEA` which the port HAS as `otherSideHolds25DAEA`), and the descriptor's `($C,A4)`
slot. **Two of those five have six callers each, so they are shared infrastructure and worth their own waves**
-- the signal that separated `$246520` from `$23C4A0` earlier this session.

### `$907000` IS ONE OF A PAIR OF `$400`-BYTE BUFFERS (W344). THE MODEL IS NOW DEFINED.

Scanned every longword in `$200000..$2B0000` pointing into `$907000..$9073FF`. **Four hits, three real:**

    23c66a  lea $907000,A0     the clear ($23C668)
    2592d2  lea $907000,A0     a consumer
    2593d4  lea $907000,A0     a second consumer
    2655b8  -- NOT a reference: the preceding word is `6D00`, a `blt` displacement, and `$9072xx` here is
            `blt` + `moveq #$0,D1` read as a longword. A value-range scan finds these; check the opcode.

**AND THE FIRST CONSUMER NAMES ITS PARTNER:**

    2592d0  lea $907000,A0
    2592d6  lea $907400,A1     <-- a SECOND buffer, exactly $400 further on
    2592dc  jsr $2593F8        ... called with BOTH in A0/A1

**CORRECTION (same wave): `$907400` IS THE REGION'S *END*, NOT A SECOND BUFFER.** Reading `$2593F8` settles
it:

    2593f8..259414   an inner loop: cmp.l (A0),D0 / bne / move.l D5,(A0) / addq.w #4,D2 / dbra D1
    259418  lea ($4,A0),A0
    25941c  cmpa.l A0,A1 / bne $2593F8      <-- A0 walks UP TO A1, so A1 is the EXCLUSIVE END
    259420  andi #$FFFE,SR / rts            carry CLEAR = success

So `$2592D0`/`$2592D6` pass a start and an end, not two buffers, and **the region is ONE `$400`-byte block,
`$907000..$9073FF`** -- which is exactly what `$23C668` clears. The two facts agree, which is what makes this
reading trustworthy where "a pair of buffers" did not explain why the clear covered only half.

`$2593F8` itself is a **search-and-claim**: it scans the block a longword at a time for a value matching D0 and
writes D5 into the first match, returning success in carry. So the block is a small table of `$100` longword
slots, and `$23C668` empties it.

**THE MODEL TO BUILD:** one object covering `$907000..$9073FF` -- **`$400` bytes, `$100` longword slots**,
addressed absolutely the way `TxVram.setLong` handles `$904000`. Half the size I said one paragraph earlier,
and it is the size `$23C668` clears, which is the check that the reading is right.

**READ `$2593F8` BEFORE CHOOSING** -- it is the routine that consumes both halves, so it says whether they are
double-buffered (swap each frame), a copy pair (A0 -> A1), or two independent planes. `$2593D2` is a second
consumer and should agree with it.

Sequence for whoever picks this up: `$2593F8` (defines the pair) -> the video object -> `$23C668` (four lines,
six callers) -> the rest of phase 0 (`$28D53C`, `$260A88`, `$25DA60`, `$25DA94`) -> phase 0 lands -> follow its
calls forward for the bonus-line driver -> **D24/D31 closes.**

================================================================================
## W344 SUMMARY -- FOUR ROUTINES PORTED, PHASE 0 ONE ROUTINE FROM LANDING
================================================================================

**Ported this wave** (13 tests, suite 2425 -> 2438):

    SlotTable907000 + clearSlotTable23C668   background.js   $23C668, 6 callers, and a NEW video region
    busyGate28D53C                           sound.js        $28D53C, 6 callers, the 5th explicit-SR return
    announceMailbox260A20                    rank.js         $260A20, the tst.b side selector
    postAnnounce260A88                       rank.js         $260A88, 6 callers, the house mailbox shape

**Phase 0's arm (`$25DC2C..$25DCA8`) now needs only `$25DA60` and `$25DA94`**, one caller each.

### `$25DA60` IS READ: "LOAD THIS SIDE'S SAVED CURSOR"

    25da60  move.w $813084,D6 / move.w $813088,D7      side 0's saved X/Y
    25da6c  tst.b ($7,A5) / beq $25DA80
    25da74  move.w $813086,D6 / move.w $81308A,D7      side 1's
    25da80  moveq #$0,D5 / move.b ($7,A5),D5           the side, into D5
    25da86  bsr $25D9E6                                 the SENTINEL substitution
    25da8a  move.b D6,($E,A5) / move.b D7,($F,A5)      stored as BYTES
    25da92  rts

**`($E,A5)` and `($F,A5)` ARE THE X AND Y CURSORS the ported draw code already reads** -- W332's
`drawTallyYRows25DF4C` indexes `$25DFF0 + ($F,A5) * 2`. So this routine is what puts a value there, and the
port has been drawing from a field nothing initialised.

**AND THE `$813084..$81308E` BLOCK IS ONE STRUCTURE**, which is worth recording because W343 measured its far
end from the other direction:

    $813084  side 0 cursor X       $813086  side 1 cursor X
    $813088  side 0 cursor Y       $81308A  side 1 cursor Y
    $81308C  the ONE-PLAYER flag (W343)      $81308E  players - 1 (W343)

Interleaved by side at a 2-byte stride, then the two W343 words. **Six words, one block** -- so
`playerFlags25FD94` and the tally cursor live side by side, which is consistent with both being written by the
stage-clear screen.

### `$25D9E6` IS THE `$FF` SENTINEL SUBSTITUTION -- READ IT BEFORE WRITING `$25DA60`

    25d9ea  cmpi.w #$FF,D6 / bne $25DA10     not the sentinel -> the normal path
    25d9f2  tst.w D5 / bne $25DA04           side 1 takes a different default
    25d9f8  move.w #$0,D6 / move.w #$0,D7    side 0's default is 0,0

So a saved cursor of `$FF` means "never set" and each side substitutes its own default. **This is the same
`$FF` sentinel W332 found `$25DAC2` and `$25DAEA` disagreeing about** -- and there the port THROWS on an
out-of-range Y rather than inventing a row. `$25D9E6` is the routine that makes `$FF` legal upstream, so
reading it may explain why that disagreement was survivable on the board.

**Still unread: `$25D9E6`'s head, `$25DA04`, `$25DA10`, and `$25DA94`.** All short, all in one region.

### `$25D9E6` IS A VALUE -> INDEX MAP, AND IT IS PHASE 0's LAST PIECE (W344)

    25d9e6  move.l D0,-(A7) / move.l D1,-(A7)
    25d9ea  cmpi.w #$FF,D6 / bne $25DA10          not the sentinel -> the SEARCH
    25d9f2  tst.w D5 / bne $25DA04                 side 1 takes a different default
    25d9f8  move.w #$0,D6 / move.w #$0,D7          side 0's default: 0, 0
    25da04  ... side 1's default ...
    25da10  moveq #$1,D0                           <-- #$1 + dbra = TWO, the X table's entry count
    25da12  lea ($25D986,PC),A0                    SCREEN11.xTable, xEntries = 2
    25da16  move.w D0,D1 / add.w D1,D1 / move.w (A0,D1.w),D1
    25da1e  cmp.w D6,D1 / bne $25DA2A
    25da24  move.w D0,D6                           FOUND -> D6 becomes the INDEX
    25da2a  dbra D0,$25DA12
    25da2e  moveq #$2,D0                           <-- #$2 + dbra = THREE, the Y table's count
    25da30  lea ($25D98A,PC),A0                    SCREEN11.yTable, yEntries = 3
    ... the same search for D7 ...

**IT CONVERTS SAVED CURSOR *VALUES* INTO TABLE *INDICES*.** `$25DA60` loads raw words from
`$813084`/`$813088`, this maps each to its position in `$25D986`/`$25D98A`, and `$25DA60` then stores the
indices as bytes into `($E,A5)`/`($F,A5)` -- which is what the ported draw code indexes. **So the round trip
is value -> index -> row offset**, and the port currently has only the last leg.

**BOTH TABLES AND BOTH COUNTS ARE ALREADY IN `SCREEN11`** (`xTable`/`yTable`, `xEntries: 2`, `yEntries: 3`),
and the counts match the `dbra` literals exactly -- `moveq #$1` is two passes and `moveq #$2` is three. That
agreement is the check that this reading is right.

**PHASE 0 IS NOW ONE WAVE FROM LANDING**, with nothing unported beneath it:

    $25D9E6   value -> index, with the $FF per-side default    READ (above)
    $25DA60   load this side's saved cursor, call the above     READ (W344 summary)
    $25DA94   pick a free Y row                                 PORTED (pickFreeYRow25DA94)
    $28D53C   the busy gate                                     ALREADY PORTED (menuCarry28D53C)
    $260A88   the announce post                                 PORTED (postAnnounce260A88)
    $23C668   the slot-table clear                              PORTED (clearSlotTable23C668)
    $24150A   installBank                                       ALREADY PORTED
    ($4,A4)   the descriptor's input read = $23D186              ALREADY PORTED

**Still unread: `$25DA04` (side 1's default pair) and the Y half of the search, `$25DA34..$25DA5E`.** Both
short, both in the routine above. Read those two, write `$25D9E6` and `$25DA60`, and phase 0's arm is
transcribable in full -- after which follow its calls forward for the bonus-line driver, which is D24/D31.

### `tools/claimed.py` -- RUN THIS BEFORE PORTING ANY ROUTINE (W344)

**Built after FIVE duplicate ports in one session, all mine, all from one mistake.** I grepped `0x<addr>` in
lowercase, got nothing, and ported a routine the port already had:

    $2417DE   already `applyVelocityA6` (movement.js)   -- and I reached TWO opposite wrong conclusions
    $28D53C   already `menuCarry28D53C` (tallyscreen.js) -- I shipped a copy with INVERTED polarity
    $260A20   already `announceBox260A20` (rank.js)
    $260A88   already covered by `announcePost` (rank.js), a FOUR-poster table
    $261100   already `pushExternalSpeed` (background.js)

The port writes these as `$260A88` in docstrings and names symbols after their ROLE -- `announcePost`,
`announceBox260A20`, `menuCarry28D53C`, `carryWord`. **A `0x`-prefixed lowercase grep finds none of them.**

    python tools/claimed.py 260a88 28d53c 2417de

It matches `$260A88`, `$00260A88`, `0x260a88` and bare `260A88` case-insensitively, reports CODE versus
COMMENT mentions, and names the nearest enclosing declaration so the answer is **who claims it**. Exit 1 when
every address given is unclaimed, so a wave can gate on it.

On `$260A88` it reports 13 mentions, 8 in CODE, and shows `tallyscreen.js:360` already calling
`announcePost(ram, 0x260a88, ...)` -- i.e. the answer was two lines from code I was editing.

**The rule was already written down** (`grep 0x2xxxxx is NOT a test for "is this ported"`). Four violations
after writing it is a compliance problem, not a knowledge problem, which is why this is a tool and not another
paragraph. **Run it on every callee before reading the body, and on every routine before writing one.**

### REACHABILITY IS A WAVE CHECK NOW (W344). THREE EXPORTS ARE CORRECTLY AHEAD; ONE WAS A DEFECT.

`tallyPhase0Arm25DC2C` shipped with **no caller in `src/`** -- written, tested eight ways, committed, inert.
Suite green, sweep clean, coverage OK, tree clean, pushed: **not one of the five checks can see an uncalled
function.** So a new export now needs a caller check, and here is that audit for everything W335-W344 added:

    freeChain246800          called by buildParts246520              OK
    playerFlags25FD94        called by tallyBonusDispatch25FF7A      OK
    clearSlotTable23C668     called by tallyPhase0Arm25DC2C          OK
    pickFreeYRow25DA94       called by tallyPhase0Arm25DC2C          OK
    loadSavedCursor25DA60    called by tallyPhase0Arm25DC2C          OK
    mapSavedCursor25D9E6     called by loadSavedCursor25DA60         OK
    walkDeathSpawns270D92    called by four handlers                 OK
    tallyPhase0Arm25DC2C     called by tallyScreen25DBB4             FIXED THIS WAVE (was dead)
    buildParts246520         NO caller -- and its ROM caller $26F6D2 is UNPORTED     ahead, correctly
    octDistance242494        NO caller -- and its ROM caller $26FFA6 is UNPORTED     ahead, correctly
    tallyBonusDispatch25FF7A NO caller -- its ROM caller $26059E has 0 CODE mentions ahead, correctly

**THE DISTINCTION IS THE WHOLE POINT.** "Dead because its ROM caller is not ported yet" is a correctly staged
prerequisite -- that is what porting `$246800` before `$246520`, or `$242494` before `$26FF9E`, is FOR.
"Dead because I forgot to wire it into code the port already has" is a defect, and it is the one that hid,
because it looks identical from inside the file.

**THE CHECK THAT SEPARATES THEM, and it is two commands:**

    grep -rn <exportName> src/ | grep -v 'export function'      # any caller in the port?
    python tools/claimed.py <its ROM caller's address>            # is that caller ported?

If the export has no caller AND its ROM caller is unclaimed, it is staged. If the export has no caller but its
ROM caller IS claimed, **that is the `tallyPhase0Arm25DC2C` bug** -- wire it.

Both of this wave's process failures were invisible to the five-check definition of done: five duplicate ports
(now guarded by `tools/claimed.py`) and one unreachable export (guarded by the two commands above). **Neither
was a knowledge problem; both were checks I had not made mechanical.**

### `$55` FIRST LOOK (W345) -- init `$272390`, handler `$272424`. IT IS A CHILD, AND ITS POSITION PROVES IT.

`$55` is what blocks `$46`, the biggest remaining stage-5 type at 13 records (W317).

    272390  move.w #$0,($4,A5) / rts       ONE sub record
    272398  loadSubProto($272408)
    2723a4  move.l ($16,A5),D0 / addi.l #$2000000,D0 / move.l D0,($2,A6)
    2723b2  move.l ($1A,A5),($30,A5)
    2723b8  moveq #$E,D0 / loadRecordProto($2723EA)     FIFTEEN words
    2723c6  cmpi.w #$2800,($2,A6) / ...

**IT NEVER CALLS `readInitPosition`. ITS POSITION COMES FROM `($16,A5)` PLUS `$2000000`** -- a pure high-word
bias, so no borrow. `($16,A5)` is a field the PARENT writes, which is what makes `$55` a child rather than a
spawnable type in its own right, and it is why W317 said `$46` "spawns an unported child". **So `$55` cannot be
tested standalone**: any test needs `($16,A5)` and `($1A,A5)` seeded the way `$46` seeds them.

`$2723B2 move.l ($1A,A5),($30,A5)` copies a long within the record before the prototype load, so the
prototype does NOT overwrite it -- worth noting because `loadRecordProto` writes from `($16,A5)` onward and the
order matters.

**THE OVERLAP RULE HOLDS A SEVENTH TIME.** `($4,A5) = 0` means one `$20`-byte sub record, so
`$272408 + $20 = $272428` against a handler at `$272424`: **four bytes**, exactly as the arithmetic predicts.
Confirmed now at 4, 8, 4, 16, 4, 20 and 4 bytes across `$49`, `$4A`, `$4B`, `$47`, `$43`, `$4C` and `$55`.
Window: `$2723EA + $3E` (fifteen-word record prototype plus the one sub prototype, `$2723EA..$272427`).

**AND THE CENSUS IS SOUND.** Audited every remaining stage-5 entry point with `claimed.py` after the nine
duplicates: `$272390`/`$272424` (`$55`), `$27102C`/`$2710E2` (`$46`), `$268D1E`/`$268E6C` (`$1A`) and all
eight of `$4C`'s state handlers are genuinely unported. The duplicates were confined to shared primitives with
role-based names; nothing in the type census was overstated.

### `$55`'s HANDLER HEAD (W345) -- SPAWN INVULNERABILITY, ON A TIMER THE PARENT SUPPLIES

    272424..27242A  NOT YET DISPLAYED (8 bytes)
    27242c  tst.w ($30,A5) / beq $272448        the timer -- zero means it has expired
    272434  move.w #$7FFF,($18,A6)              ... while it runs, HP is $7FFF: INVULNERABLE
    27243a  subq.w #1,($30,A5) / bne $272448
    272442  move.w #$1100,($18,A6)              on the frame it hits zero, REAL HP $1100
    272448  moveq #$5C,D1 / and.b (A6),D1 / beq $27249A     the $5C family mask
    272456  jsr $286096                         scoreHit

**`$55` IS INVULNERABLE FOR A PARENT-SUPPLIED NUMBER OF FRAMES.** The init copies `($1A,A5)` -- a field `$46`
writes -- into `($30,A5)`, and the handler counts it down while forcing HP to `$7FFF`. On the frame it reaches
zero it installs the real HP of `$1100`. So a `$55` cannot be killed before its parent's timer expires, and the
timer's LENGTH is `$46`'s choice.

**THE SUBTLETY: A LONG COPY, A WORD COUNTDOWN.** `$2723B2 move.l ($1A,A5),($30,A5)` copies FOUR bytes, but
`$27242C tst.w` and `$27243A subq.w` touch only the first WORD -- which on a big-endian read is the long's HIGH
half. So the parent supplies a longword of which only the top half is the timer, and `($32,A5)` keeps whatever
the low half was. **Porting the copy as a word would lose that low half**, and porting the countdown as a long
would make the timer effectively never expire.

That also explains why the init copies at all rather than reading `($1A,A5)` directly each frame: the handler
DESTROYS its copy by counting it down, and `($1A,A5)` has to survive for whatever else reads it.

**Its HP `$1100` and the `$7FFF` invulnerability value are both literals**; `$7FFF` is the same sink constant
`$47` and `$4C` use, but here it is a HP FLOOR rather than a per-frame sink -- there is no `sub.w`/re-arm pair,
just a forced value. Do not reach for the sink helper.

Still unread for `$55`: `$272424..$27242A` (the entry, 8 bytes) and everything from `$27245C` on.

### `$55`'s ENTRY AND DAMAGE ARM (W345) -- the invulnerability is itself OPTIONAL

    272424  tst.b ($17,A5) / beq $272448      <-- the WHOLE timer block is skipped when ($17,A5) is 0
    27242c  ... the invulnerability timer (previous section) ...
    272448  moveq #$5C,D1 / and.b (A6),D1 / beq $27249A     the $5C mask -- an EIGHTH family member
    272450  move.b #$A3,D0 / and.b D0,(A6)
    272456  jsr $286096                       scoreHit
    27245c  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b ; store    the SIMPLE palette XOR, base+mask
    27246a  tst.w ($18,A6) / bpl $2724A0
    272472  move.l #$113,D0 / jsr $28615E     scoreKill $113 -- a `move.l`, not a moveq
    27247e  jsr $28C2DC                       the band's cue, not $47/$4C's $28C310
    272484  D2 = ($2,A6) ; lea ($272850,PC),A1 ; ...        its own death list

**SO THE SPAWN INVULNERABILITY IS OPTIONAL AND THE PARENT CHOOSES.** `($17,A5)` gates the entire block: zero
means no protection at all and the prototype's HP stands. Non-zero runs the `($30,A5)` countdown with HP forced
to `$7FFF`. **Both `($17,A5)` and the timer's length come from `$46`**, so one parent can spawn protected and
unprotected children.

`($17,A5)` is a THIRD meaning for that offset in stage 5 -- the mirror/table-select bit in all four band
members, a state number in `$47` and `$43`, and now an invulnerability enable. **Nothing about that offset is
transferable.**

Its damage arm is the SIMPLE `$5C` member -- base `($18,A5)`, XOR mask `($19,A5)`, no `hpFull` reload -- so it
joins `$49`, `$4B` and `$48` rather than the `damageArm5C` variants. That makes eight family members now.

Kill score `$113` via `move.l`, and the cue is `$28C2DC` (the band's), not the `$28C310` that `$47` and `$4C`
use -- so `$55` sounds like an ordinary enemy despite being a set-piece child.

Still unread for `$55`: `$27248C` onward (the death arm's tail, its walker call and its list length) and
`$2724A0` onward (the alive path). Its death list is at `$272850`.

### `$55`'s DEATH ARM AND ALIVE PATH HEAD (W345) -- it needs NOTHING new

    27248e  jsr $270D92                      **the SHARED walker, ported W333/W336**, list $272850
    272492  jmp $263762                      freeEnemy -- $55 FREES itself, no $8000 mark
    27249a  move.b ($18,A5),($1D,A6)         the not-hit palette restore
    2724a0  tst.w $8130D2 / bne $272722      the freeze, jumping FAR
    2724aa  move.w ($2,A6),D1 / sub.w ($2A,A5),D1 / move.w D1,($2,A6)    a per-frame DRIFT
    2724b6  jsr $24179E                      scrollCompensate
    2724bc  addi.w #$1400,D0 / addi.w #$7400,D0    the TWO-addi.w bounds idiom

**`$55` NEEDS NO UNPORTED CALLEE.** `$270D92` is `walkDeathSpawns270D92` with the default `anim` of 4 and its
list is `$272850 + $3E` (FIVE 12-byte entries then `$FFFF`, measured). `$286096`, `$28615E`, `$28C2DC`,
`$24179E`, `$2637A2`, `$26377A`, `$24150A` and `$263762` are all in the port. **So `$55` is writable now**, and
with it `$46` stops being blocked.

**IT USES THE TWO-`addi.w` BOUNDS IDIOM, not the band's signed long.** `$2724BC`/`$2724C4` are the
`$1B`/`$81` shape, where `$49`/`$4A`/`$4B`/`$48`/`$47`/`$43` all use `ext.l`/`addi.l`/`cmpi.l`. So the
deciding carry is the SECOND `addi.w`'s alone (W326's finding), and reading it as a signed long compare would
change which side of the screen frees it.

**AND IT DRIFTS BY A PARENT FIELD.** `$2724AA` subtracts `($2A,A5)` from the Y each frame -- a third value
`$46` supplies, after `($16,A5)`'s position, `($1A,A5)`'s timer and `($17,A5)`'s invulnerability enable.
**`$55` is almost entirely parameterised by its parent**, which is why W317 called it a child and why any test
of it is really a test of the pair.

Windows: `$2723EA + $3E` (declared W345) and `$272850 + $3E` for the death list -- **not yet declared.**

Still unread: `$2724C4` onward (the bounds test's tail and the rest of the alive path) and `$272722` (the
freeze target). Everything before that is read.

### `$55`'s ALIVE PATH (W345) -- `($17,A5)` DOES TWO JOBS IN ONE TYPE

    2724c4  addi.w #$7400,D0 / bcc $2724DA    the SECOND addi.w's carry is the deciding one (W326)
    2724cc  tst.b ($16,A5) / beq $2724E0
    2724d2  jmp $263762                       off-screen AND the latch is set -> free
    2724da  move.b #$1,($16,A5)               ... otherwise set the on-screen latch
    2724e0  cmpi.b #$0,($17,A5) / bne $272536 <-- ($17,A5) AGAIN, now selecting the BEHAVIOUR ARM
    2724ea  subq.b #1,($1C,A5) / bcc $272536  arm A's cadence
    2724f2  move.b ($1D,A5),($1C,A5)

**`($17,A5)` IS READ TWICE IN `$55`, AND THE SECOND READ IS A THREE-WAY SELECTOR -- not the two arms I first
wrote.** At `$272424` `tst.b` enables the spawn invulnerability for any non-zero value. Then:

    2724e0  cmpi.b #$0,($17,A5) / bne $272536      0        -> arm A at $2724EA
    272536  cmpi.b #$2,($17,A5) / blt $272582      1        -> $272582
    272540  ... the sinusoidal drift ...           2 and up -> arm C at $272540

**AND IT IS A FALL-THROUGH CASCADE, NOT A SWITCH** -- `$272582` is itself `cmpi.b #$2,($17,A5) / bne $2725B6`,
so the arms are successive tests that a value can pass through more than one of:

    ($17,A5) = 0   runs $2724EA only          (cmpi #0 / bne skips to $272536)
    ($17,A5) = 1   runs $272582's test, FAILS it, so $2725B6            (blt sends 1 past $272540)
    ($17,A5) = 2   runs $272540's sinusoid AND THEN falls into $272582's arm, which tests == 2
    ($17,A5) > 2   runs $272540's sinusoid, then $272582 fails, so $2725B6

**So value 2 runs TWO arms and value 3+ runs one.** That is the same shape `$43`'s three states and every one
of `$4C`'s eight handlers use -- successive `if` tests, never `else if` -- and writing this as a switch would
silently drop the second arm for value 2.

A port must also not cache the byte as a boolean (that collapses 1 against 2+) nor split protection and mode
into separate fields (the cartridge cannot let them disagree, since one `tst.b` and three `cmpi.b`s read the
same byte).

That is now FOUR distinct meanings for offset `+$17` across stage 5 -- mirror/table select in all four band
members, a state number in `$47` and `$43`, and in `$55` both an invulnerability enable and an arm selector.

**CORRECTION (same wave): `($2A,A5)` IS NOT A PARENT PARAMETER.** Arm B COMPUTES it. `$272544..$272556` loads
`D0 = $28` as an amplitude and `D1 = ($2C,A5)` as a phase, advances that phase by 2 (`addq.b #2`), calls
`$241D34` -- already ported, 29 mentions and 7 in code, the angle/vector helper `boss4.js` and others use --
and stores the returned `D2` into `($2A,A5)`. **So arm B gives `$55` a SINUSOIDAL drift**, phase-advancing two
steps a frame, and the drift subtraction at `$2724AA` consumes what arm B produced.

So what `$46` actually supplies is FOUR things: `($16,A5)` position, `($1A,A5)` timer, `($17,A5)` protection
AND arm select, and the `($1C,A5)`/`($1D,A5)` cadence pair. `($2A,A5)` is internal state, and in arm A -- which
never reaches `$272544` -- it presumably stays whatever the prototype left, making arm A's drift constant where
arm B's oscillates. **That is the difference between the two arms and it is worth confirming when arm A's tail
is read.**

Still unread: `$272536` (arm B), `$2724F8`..`$272536` (the rest of arm A) and `$272722` (the freeze target).
Everything else in `$55` is read, its init is ported, and it needs no unported callee.
