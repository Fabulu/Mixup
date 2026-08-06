# WAVE 10 - the architect: PLAN-no-recordings.md

status: DONE
wave: 10   role: plan   started: 2026-08-01

## The task, as I understood it

Read the five wave-10 recons in full (`10-recon-display-list.md`,
`10-recon-background.md`, `10-recon-enemies.md`, `10-recon-combat.md`,
`10-recon-flow.md`), plus `PLAN-vertical-slice.md`, `src/web/app.js`'s
SIMULATED/REPLAYED/SPLICED header, `05-impl-enemies-and-weapons.md`'s blocked
chain, `NOTES-replay.md`, `NOTES-progression.md` and `docs/knowledge/06`/`08`
- then write `games/ddpdoj/PLAN-no-recordings.md`, the successor plan whose
goal is the owner's: a playable, finished game with no recordings necessary.
Commit the plan, the five recon worklogs and the recon probe tooling through a
private index. I am a READER for `src/`; I edited nothing under `games/*/src/`.

## What I did

- Read all five recon worklogs end to end (3,075 lines) and the supporting
  docs above. Confirmed what `capture.bin` physically carries per frame by
  reading `tools/pixpack.mjs`'s header and `src/render/capture.js` (palette,
  display list, both tilemaps, rowscroll, zoom table, registers × 161
  frames) - that inventory is the plan's CAPTURE LEDGER, 18 rows.
- Wrote `games/ddpdoj/PLAN-no-recordings.md`: the ledger (§1), the ordering
  argument (§2 - call #4 is the keystone, three recons converging; the
  playfield track is orthogonal except for `$813176`), 20 scheduled waves in
  three phases plus an honestly unpriced Phase IV (§3), the cross-cutting
  constraints lifted from the notes rather than reinvented (§4), the
  deliberate exclusions with their missing measurements (§5), and the risks
  including the infeasibility question and its fallback (§6).
- Scale statement, deliberately blunt: ~20 waves to a recording-free stage-1
  game, 20–35 more for the rest of the cartridge - 40–55 total, five to
  seven times the vertical slice. Phase IV is priced as a range because the
  warp-driven per-stage censuses that would price it exactly have not run;
  the plan says to run them first thing in Phase IV and re-price.

## What I MEASURED

Nothing. This wave ran no oracle commands and added no probes. Every number
in the plan is cited to the recon worklog that measured it, and claims the
recons labelled "candidate"/"listing-only"/"inferred" keep those labels in
the plan (the zoom-table classification, `$81B64A`/`$81B65C`, the debug warp,
the 350M negative result). Where the plan needed a fact no recon owned - the
per-frame palette writers during gameplay - the ledger row says "not yet
answered" (L14) and assigns the census to W17 rather than papering over it.

## What I could not do, and why

1. **I did not re-run `pgm.py check`/`gate`/`flyaround`** to prove the recons
   left the corpus digests unmoved. Two recons flagged the same omission.
   The next impl wave should run the full gate before trusting any
   cross-session number - the plan's risk 7 says so.
2. **The five recon summaries and their worklogs disagree in two small
   places I did not adjudicate by measurement** (wave-5's type-10 vs type-5
   entry, corrected identically by two recons; the queue-headroom number).
   The plan follows the corrected values with citations.
3. **Repo state**: the shared git index held staged deletions of ddpdoj
   worklogs and src files made by another agent mid-restructure, and nearly
   the whole `games/ddpdoj/` tree is untracked at HEAD. I committed through
   a private index (`GIT_INDEX_FILE=.git/dojplan.index`, `git read-tree
   HEAD` immediately before staging), staging BY NAME only: the five
   `10-recon-*.md`, this file, the plan, and the wave-10 probe tooling
   (`tools/w10/`, `tools/recon10/` sources, `tools/oracle/w10*.{lua,py}`,
   `tools/oracle/bgrecon*.{lua,py}`, `tools/flowrecon.py`). I did NOT
   commit the other agents' untracked src/tests/NOTES files, and did NOT
   touch the shared index's staged deletions - the restructuring agent owns
   those.

## If someone picks this up cold

Read `games/ddpdoj/PLAN-no-recordings.md` §1 (the ledger) and §3 (the
waves). The next unit of work is W11 - port main-loop call #4 gated by the
staged-bucket byte replay, plus the bucket ablation - and it depends on
nothing else in the plan. W14 (`$813176` and the registers) is the other
no-dependency entry point and unblocks W13/W18/W20 comparisons.
