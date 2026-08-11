# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-11 (late)

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

- HEAD is W322, `ddpdoj: the $5C damage arm becomes one routine, and type $1B is not a leaf`.
- Suite: `node --test games/ddpdoj/tests/` is **2315/2315**, green, no skips. 411 ROM windows.
  `dojcoverage.py` reports 80/256 enemy types ported.
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

   ### `$1A` IS A SIBLING OF `$1B`, MEASURED IN W324 -- START THERE

   `$1A` is the biggest CLEAN stage-5 type left and W324 read its init body read-only. **It is
   the same shape as the `$1B` that W323 just ported**, so it should be cheap, and `damageArm5C`
   may well take a third caller:

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

   Spans from the type table, for planning: `$1A` $14E, `$81` $4C, `$49` $A2, `$4A` $B6,
   `$4B` $B6, `$47` $E2.

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
