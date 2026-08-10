# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-11

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

- HEAD is `f281abc ddpdoj: thicken the stage-4 boss barrage`.
- Suite: `node --test games/ddpdoj/tests/` is **1725/1725**, green, no skips.
- Stages 1, 2 and 3 have their known live spawn paths translated. Stage 3 is
  closed at 414/414 script records and 28/28 script types.
- **The Stage-4 boss's SECOND PHASE is translated except for one routine.** W246
  through W252 landed F5 (`$2A0D16`, a seven-arm bit machine), MAIN4, MAIN7, the
  A3 3..8 ramp family, and A1 6, 7, 8, 9 and 10. Everything F5 arms is ported
  except the type `$42` children A1 9 spawns, and
  [worklog 253](worklog/ddpdoj/253-recon-type42.md) is a complete bound and spec
  for that.
- **A death works end to end** (W227, W228, W231): the animation, the reset, the
  life spent, a fresh player object placed where its respawn entry says, `$F0`
  frames of invulnerability, and the pods deploying to the exact `$24C928` target.
- The stage transition MACHINE works, its banner picture draws (W232), its
  palettes install (W236), both panels paint (W238, W239) and the `$900000` ring
  clears (W240); the rest of its presentation is the gap.
- The bee popup works (W234), and the secondary explosion spawns (W235).
- Sprite streams 3985. `w230descriptorsweep.mjs` draws 718 distinct descriptors
  with ZERO unresolvable.
- **Two loop-2 rules exist**: W241's zero-lives extend (`$253794`) and W250's A1 6,
  which changes both its shot count and its generator on `$813098`. Stage 5 has
  not started.

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

1. **Type `$42`, the Stage-4 boss's children.** The last routine between F5 and its
   second phase running end to end.
   [Worklog 253](worklog/ddpdoj/253-recon-type42.md) holds the measured bound, and
   the bound is the useful part: `$3C(a6)` selects among roles `$FF`, 0..7, `$70`
   and `$71`, but only TWO spawners of type `$42` exist in the whole image, and the
   one F5 reaches (A1 9) writes `$FF` as a constant. Roles 0..7 and `$70`/`$71` come
   from A1 11, which A4 id6 starts, so they are honestly unreachable until A4 id6
   lands. Port the role-`$FF` path and `unreached()` by role on the rest.
2. **The rest of D11's transition presentation.** `$28C186` the exit handshake and
   `$28D6FC` the animation chain; `$28D77C` writes palette RAM the port does not
   model, and the four `$25FD38` resets are W62's scope line.
3. **The rest of D3/D4.** `$27F8F8`'s visual pop needs a `$280E4A` window and a
   kind-`$0` spec, or the better refactor of making `fillGeneralImpact280B3E` read
   the cartridge's table. D4's stage-2 mid boss needs the sweep run DURING stage 2
   rather than an assumption that it shares a cause.
4. **The stale `$240DC2` call sites** in `items.js`. The printer is ported and W237
   added two sites; each remaining one needs its own register-setup transcription.
   This is also the likely route to D7's gauges.
5. **Register object dispatch `[4]`.** `announce260B30` is written and tested (W243)
   but its `main.js` entry is COMMENTED OUT on purpose: `.replay` fixtures embed
   frozen tables, so registering it turns five gates red until
   `tools/oracle/out/w69/fly-around` is rebuilt from the oracle. Rebuild, then
   uncomment.
6. **A4 id6 `$2A11D4`**, the Stage-4 boss's third phase, which is what makes type
   `$42`'s other roles reachable.
7. **Stage 5, then the loops.**

D8, D10 and D12 are presentation or documentation and can be slotted in between.

## Verification commands

- One slice: `node --test games/ddpdoj/tests/<the focused file>.test.js`
- Full suite: `node --test games/ddpdoj/tests/` -- currently 1725/1725, green.
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

Live numbers: **253 is the highest**. 253 is a SPEC (type `$42`, no code yet) and
225 is SUPERSEDED by 244; every other number through 252 is COMPLETE. Reserve the
next number by creating `<N>-RESERVED.md`, then rename it immediately to the real
`IN PROGRESS` worklog as `AGENTS.md` requires. Numbers are never reused.
