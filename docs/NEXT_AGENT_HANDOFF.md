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
