# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-10

## Objective

Complete the readable JavaScript translation of DoDonPachi DaiOuJou Black
Label Version-B, including every stage, boss, loop, system, presentation path,
sound path, and authentic timing/slowdown behavior.

Read the repository `AGENTS.md` before changing anything. The important local
rule is delivery first: spend at least 90 percent of effort on playable product
implementation, use one focused smoke for a meaningful change, and do not
restart broad reconnaissance or build reviewer/test-agent chains.

## Current product state

- HEAD is `2ae418e ddpdoj: let a player death survive the option object`.
- Stages 1, 2 and 3 have their known live spawn paths translated. Stage 3 is
  closed at 414/414 script records and 28/28 script types.
- The Stage 4 enemy section is translated through its boss spawn, and the Stage 4
  boss is translated through its first damage-driven destruction transition
  (W224): A4/F1, MAIN2/MAIN3, A3/D0 and A2 objects 6 through 9.
- Stage 5 has not started.
- Sprite stream total is 3958.

## The docket comes first

[DOCKET.md](DOCKET.md) holds ten defects the owner reported from playing the
shipped web build, each with the port-side finding underneath. Player-visible
defects in stages the player actually reaches outrank Stage-4 boss interiors,
which is why W225 is paused.

Fixed so far: D1 (the hyper beam's missing strip window) and D2 (the hyper item's
motion, draw bias and animation order) in W226; the first link of D9 in W227.

## Immediate next actions, in priority order

1. **Finish D9, the death chain.** A death now runs its animation and reset and
   then stops at `$25FFA8`, reached through the `$25FF7A` computed dispatcher
   with `$8130FA` = 1. Translate `$25FFA8` and its `jsr $23C668`, then decide
   whether jump-table entries 2 (`$260056`) and 3 (`$26010E`) are reachable.
   Reproduce with the headless scenario in `tests/w227death.test.js`: it kills
   the player on frame 424 and the stop is at 495.
2. **Close the five stale census tests.** They fail at `6d19202` too, so they are
   debt from the Stage-4 waves, not a regression. All five want the Stage-4 boss
   tables and handler set added to lists they already keep for stages 1 to 3:
   `handlers.test.js:113`, `initbody.test.js:54`, `integration.test.js:244`,
   `w167coverage.test.js:65`, `w62stageend.test.js:369`. The last fails on
   `$2A017A`, registered back in W219. A green suite protects everything after.
3. **D5, the sprite sweep.** D3, D4, D7 and D8 are probably one systemic gap.
   One sweep joining every reachable draw site against the harvested stream set,
   reporting draws whose descriptor is absent from the bundle, is worth more than
   four separate guesses.
4. **Resume W225**, Stage-4 boss A4/F5 `$2A0CF6`, whose recon is already banked
   in its worklog. Do not repeat that recon.

## Verification commands

- One slice: `node --test games/ddpdoj/tests/<the focused file>.test.js`
- Full suite: `node --test games/ddpdoj/tests/` -- currently 1611/1616 with the
  five stale censuses above as the only failures. Do not pipe it through `tail`;
  that discards the failure detail.
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

Elsewhere:

- `src/rom.js` serves a read only from a window that contains it WHOLE, so a
  table crossing a seam between two adjacent windows still throws. W226's
  `$24BB9A` pair is the worked example.
- The hyper item body uses `movem.w ($1a,A6),D0-D1`, two words at `$1A` and
  `$1C`, not the byte speed/angle convention the `I.speed`/`I.angle` names carry.

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

Live numbers: 227 is the highest and is COMPLETE. 225 is PAUSED with its recon
banked. Reserve the next number with an `apply_patch` Add File for
`<N>-RESERVED.md`, then rename it immediately to the real `IN PROGRESS` worklog
as `AGENTS.md` requires.
