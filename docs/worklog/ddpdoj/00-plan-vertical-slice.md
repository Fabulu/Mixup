# Architect: fold five recons into the vertical-slice plan, commit plan + worklogs + tools
status: DONE
wave: 0   role: plan   started: 2026-07-31

## The task, as I understood it

Five recons (oracle, memmap, assets, versions, hard-systems) finished on
DoDonPachi DaiOuJou. Write `games/ddpdoj/PLAN-vertical-slice.md`: know vs
assume, falsified inherited claims marked, oracle as wave 1, waves sized for one
implementer each with measurable done-when conditions, the slowdown/rank
architecture consequences, a deliberately-excluded section, honest risks.
Then commit the plan, the five recon worklogs, `NOTES-versions.md`, and the
tools the recons left under `games/ddpdoj/` — staged BY NAME, diff read before
committing, nothing ROM-derived.

## What I did

- Read in full: `docs/worklog/README.md`, knowledge docs 01/02/03/06/08, all
  four `games/ddpdoj/NOTES-*.md`, and all five recon worklogs in
  `docs/worklog/ddpdoj/`.
- Verified the git state before staging anything:
  - branch is `main` (the "Current branch: HEAD" in my briefing snapshot was
    stale; `git branch --show-current` → `main`, and HEAD had already moved to
    `21c6672` — the concurrent workflow is committing live).
  - `git check-ignore -v` on the ROM-derived paths:
    `games/ddpdoj/rip/...` → ignored by root `.gitignore:29:rip/`;
    `games/ddpdoj/tools/hard/out/maincpu_ddpdojblk.bin` (the decrypted 68000
    image) → ignored by `games/ddpdoj/tools/hard/.gitignore:3:out/`.
    So staging the tool directories by name cannot pick up ROM bytes.
- Wrote `games/ddpdoj/PLAN-vertical-slice.md`.
- Fixed the one sentence in `games/ddpdoj/NOTES-machine.md` that recon 3
  measured to be backwards (sprite draw order), as a dated correction — per
  worklog rule 5, a known-false doc does not get left behind.

## Key synthesis decisions (and why)

1. **The target build is VERSION-B (`$2xxxxx`).** The hard recon proved
   `ddpdojblk` carries two complete builds and the boot default is the WRONG one
   (VERSION-A = 2002.04.05 Master). Recon 1's oracle landmarks and recon 2's
   player facts are VERSION-A numbers. The plan therefore makes "pin VERSION-B
   and re-derive every landmark on it" part of wave 1, not an afterthought.
2. **Oracle recon came back DONE, so the project is not blocked** — wave 1 is
   consolidation (three parallel harnesses exist: `tools/oracle/`, `tools/` +
   `probes/`, `tools/hard/`), not bring-up. Its named open items (RTC,
   flag bisection, savestate phase byte, pixel layer) are wave-1 exit criteria.
3. **The object driver gets a work budget from day one.** Nobody measured (C)
   because nobody forced an overrun; docs/knowledge/06 says (C) cannot be
   retrofitted. The plan orders "locate object driver + force overrun" (wave 2)
   BEFORE any object-driver implementation (wave 5), and mandates the budget
   hook regardless of what wave 2 finds.
4. **Apparent recon contradiction reconciled in the plan rather than averaged:**
   recon 1 found an (A)-style gate inside the IRQ6 handler (build A `$13C7E6`:
   four ISR subroutines skipped when the main loop overran, input still read);
   recon 5 says the main loop has no lag gate and the shape is (B). Both are
   measurements: the ISR drops some of ITS work on overrun, the main loop
   dilates. The port's ISR model must carry the gate; the loop model dilates.
5. **Excluded-with-reasons section names sound, stage 2+, TYPE-B, dynamic-rank
   coverage, slowdown magnitude, and the sprite-cap behaviour** — each with the
   measurement that is missing, so silence cannot be read as coverage.

## What I MEASURED

Nothing new about the game — this is a synthesis role. Git facts measured above
(branch, ignore rules). Staged file list captured below before committing.

## What I could not do, and why

- Could not re-run any recon number; I marked every number in the plan with the
  worklog it came from so it stays checkable.
- Did not stage `games/ddpdoj/NOTES-slowdown-oracle.md` (modified in the tree)
  or `docs/knowledge/*` — they are another workflow's edits, not named in my
  commit list.
- `games/ddpdoj/rip/.gitignore` cannot be committed (it is itself inside the
  ignored `rip/` tree); the root `rip/` rule is what protects the repo, noted in
  the plan's operational rules.

## If someone picks this up cold

The plan is `games/ddpdoj/PLAN-vertical-slice.md`. Read its §2 (falsified
claims) before trusting ANY older ddpdoj note. Wave 1 starts at
`python games/ddpdoj/tools/oracle/pgm.py determinism 150` (must print
IDENTICAL) and the wave-1 checklist in the plan.
