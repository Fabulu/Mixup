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

- HEAD is `3a0291d ddpdoj: spawn the secondary explosion`.
- Suite: `node --test games/ddpdoj/tests/` is **1634/1634**, green, no skips.
- Stages 1, 2 and 3 have their known live spawn paths translated. Stage 3 is
  closed at 414/414 script records and 28/28 script types.
- The Stage-4 enemy section is translated through its boss spawn, and the Stage-4
  boss through its first damage-driven destruction transition (W224).
- **A death works end to end** (W227, W228, W231): the animation, the reset, the
  life spent, a fresh player object placed where its respawn entry says, `$F0`
  frames of invulnerability, and the pods deploying to the exact `$24C928` target.
- The stage transition MACHINE works and its banner picture draws (W232); the rest
  of its presentation is the gap.
- The bee popup works (W234), and the secondary explosion spawns (W235).
- Sprite streams 3985. `w230descriptorsweep.mjs` draws 718 distinct descriptors
  with ZERO unresolvable.
- Stage 5 has not started, and no loop-2 work has started.

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

Fixed: D1, D2 (W226), D9 entirely (W227, W228, W231), the rank icons and the D5
instrument (W230), and D11's banner picture (W232).

## Work order toward the goal

1. **The rest of D11's transition presentation.** The result screen (`$23C638`
   palette cue, `$246410` animation-object load, `$28D77C` sixteen longwords of
   palette RAM, `$28DE72`/`$28C186` exit handshake), the banner's five `$24150A`
   resource installs, and `$253794` the option-pod teardown. Force `$242952`
   headlessly and read the counted gaps -- that measurement is what scoped W232.
2. **The rest of D3/D4.** `$27F8F8`'s bullet death effect is the next producer on
   the sweep's counted-gap list. D4's stage-2 mid boss needs the sweep run DURING
   stage 2 rather than an assumption that it shares a cause.
3. **The stale `$240DC2` call sites** in `items.js` (five of them). The printer is
   ported; each site needs its own register-setup transcription. This is also the
   likely route to D7's gauges.
4. **Object dispatch `[4]` `$260B30`**, unported and running twice a frame.
5. **Resume W225**, Stage-4 boss A4/F5 `$2A0CF6`, recon banked in its worklog.
6. **Stage 5, then the loops.**

D8, D10 and D12 are presentation or documentation and can be slotted in between.

## Verification commands

- One slice: `node --test games/ddpdoj/tests/<the focused file>.test.js`
- Full suite: `node --test games/ddpdoj/tests/` -- currently 1629/1629, green.
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

Live numbers: 232 is the highest and is COMPLETE. 225 is PAUSED with its recon
banked; every other number through 232 is COMPLETE. Reserve the next number with an `apply_patch` Add File for
`<N>-RESERVED.md`, then rename it immediately to the real `IN PROGRESS` worklog
as `AGENTS.md` requires.
