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

- HEAD is W276, `ddpdoj: run the stage-clear screen`.
- Suite: `node --test games/ddpdoj/tests/` is **1917/1917**, green, no skips.
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
- **FIVE loop-2 rules exist**: W241's zero-lives extend (`$253794`), W250's A1 6
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

**ELEVEN OF TWELVE ARE CLOSED.** D1, D2 (W226); D9 entirely (W227, W228, W231); the
rank icons and the D5 instrument (W230); D3 (W264/265/266); D4 (W265/266/267); D10
(W268); D7 (W271); D8 (W272); D12 (W253/263). D11's banner picture landed in W232 and
its remainder is the only open docket item.

**Two of the last three closed the same way, and it is worth expecting a third.** D7
and D8 were both routines and records that already existed: D7 was `hyperStock286ED6`
and `livesRow2878CC`, complete since W113/W116 and called by nobody; D8 was a draw
path that already matched the board byte for byte behind a page that told the player
not to press the button. **Before assuming a player-visible gap is untranslated code,
check whether the body exists and is uncalled, and whether the shipped page is lying
about it.** `w271hyperstock.test.js` has the mechanical form of the first check.

## Work order toward the goal

1. **STATE 1 OF OBJECT `[11]`, `$25DBC4..$25DD0A`.** THE FIRST UNFINISHED ITEM. W276
   landed the object's dispatcher, state 0 and state 2, so the score tally now runs;
   state 1 is ONE counted note at `$25DBC4` and the note NAMES what is missing, so read
   it rather than re-deriving. `$28D53C` and `$23C932` are already ported in
   `src/tallyscreen.js`.

   Dependency-first order:
   - **`$25FF38` FIRST.** It does `lea $8130FA,A0` -- it writes the tally records
     `src/tally.js` owns, so everything else in state 1 is safer once it is known.
   - then `$25DA60` (reads `$813084`/`$813088`, the tally's own posted words) and
     `$25DA94` (walks `($f,A5)`);
   - then `$25DFF6` (another `$28D53C` gate) and `$25DEAE` (`($f,A5)` again, from the
     `($c,A5) == 2` arm);
   - then `$25E0EA`, `lea ($25E006,PC),A0 / bra $25E200` -- a table-driven jump.

   State 1 also installs a palette from `$225978`, which needs a window: run
   `node tools/export-web.mjs --extent 0x225978` first.
2. **The menu cursor, `$25DD0C`.** `btst #$2,D0` decrements `($e,A5)` and `btst #$3,D0`
   increments it, each with `move.b #$1,($d,A5)` and a `$28C6FA` sound, and
   `andi.b #$1,($e,A5)` keeps it to two entries. **D0 comes from `($8,A4)`** -- one of
   the descriptor's three code pointers (`$23D186` for side 0, `$23D18E` for side 1) --
   so that routine is the input read and has to land first. W276's window
   `$25D952+$3E` already covers both descriptors.
3. **The four other announcement-poster caller regions** -- `$25CDxx`, `$25D5xx`,
   `$2601xx`, `$288A02` -- which share the protocol W270 landed.
4. **WHAT ADVANCES `($14,A6)` THROUGH `$255B7C`.** W275 ported the walker and shipped
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
5. **The rest of D11's transition presentation.** `$28C186` the exit handshake and
   `$28D6FC` the animation chain. `$28D77C` writes palette RAM the port does not
   model and the four `$25FD38` resets are W62's scope line, so those two stay
   counted. Force `$242952` headlessly and read the counted gaps -- that measurement
   is what scoped W232 and it is still the right way in. The remainder is the
   animation-object EXECUTION ENGINE, the per-frame machine that walks the `$810346`
   chain and decrements each node's `$18`; the way in is the node code pointers at
   `$24627A`, NOT the chain root `$810346`, whose six references are all loaders or
   the clear. `$28C186` is a BGM command and correctly a counted sound gap.
6. **Stage 5, then the loops.** Nothing blocks this any more: the Stage-4 boss is
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
