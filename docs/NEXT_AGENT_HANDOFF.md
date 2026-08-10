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

- HEAD is `62c0a80 ddpdoj: sweep every drawn descriptor against the bundle`.
- Suite: `node --test games/ddpdoj/tests/` is **1620/1620**, green, no skips.
- Stages 1, 2 and 3 have their known live spawn paths translated. Stage 3 is
  closed at 414/414 script records and 28/28 script types.
- The Stage-4 enemy section is translated through its boss spawn, and the Stage-4
  boss through its first damage-driven destruction transition (W224).
- A player death is survivable: W227 the option arm, W228 the respawn.
- Sprite stream total is 3974, and the descriptor sweep reports zero
  unresolvable descriptors bundle-wide.
- Stage 5 has not started.

## The docket comes first

[DOCKET.md](DOCKET.md) holds twelve defects the owner reported from playing the
shipped build, each with the port-side finding underneath. Player-visible defects
in stages the player actually reaches outrank Stage-4 boss interiors, which is why
W225 is paused.

Fixed: D1 and D2 (W226), the first two links of D9 (W227, W228), the rank icons
and the D5 instrument (W230).

## Work order toward the goal

1. **Finish D9: the player object INIT.** `$2491C0` and `$249246` have a one-time
   init arm the port does not translate at all, so a newly created player object
   has no position -- a respawned ship provably sits at `posY` 0. Fully mapped in
   DOCKET.md D9: the `$24915E` 48-word template (needs a ROM window), `$2551FA`,
   `$253A1E`, the `+6`-keyed fresh-start arm, the `$803926`-gated five `$2530BE`
   calls, `$25FF38`/`$260846` arming dispatcher request 9, and `$2603B0` into
   `$2534F8`/`$253522`. `$249426` is the instruction that copies the object's
   `+8`/`+A` into the record's position.
2. **D11: the stage transition.** Object dispatch `$240F62` entry `[11]`
   `$25DBB4` (900 calls per 900 frames, reads the stage number and loop flag) and
   entry `[4]` `$260B30` (1800 calls, once per side) are not implemented, and the
   transition cannot look like the cartridge's while they are no-ops. Start with
   `[11]`.
3. **D3/D4: the missing explosions.** The sweep proves these are producer
   problems, not bundle problems. Run
   `node games/ddpdoj/tools/w230descriptorsweep.mjs` and work its counted-gap
   list; `$289AF4` (the secondary effect spawn) is the first candidate.
4. **Resume W225**, Stage-4 boss A4/F5 `$2A0CF6`, whose recon is banked in its
   worklog. Do not repeat that recon.
5. **Stage 5.** Only after a credit reaches it.

D6, D7, D8, D10 and D12 are presentation or documentation and can be slotted in
between the above whenever a natural gap appears.

## Verification commands

- One slice: `node --test games/ddpdoj/tests/<the focused file>.test.js`
- Full suite: `node --test games/ddpdoj/tests/` -- currently 1620/1620, green.
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

Live numbers: 230 is the highest and is COMPLETE. 225 is PAUSED with its recon
banked; every other number through 230 is COMPLETE. Reserve the next number with an `apply_patch` Add File for
`<N>-RESERVED.md`, then rename it immediately to the real `IN PROGRESS` worklog
as `AGENTS.md` requires.
