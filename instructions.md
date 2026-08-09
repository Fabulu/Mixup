# Handoff for the next AI

Last updated: 2026-08-09, immediately after the owner asked all work to stop
because the CLI broke.

## First response to the owner

Do not start another wave, deploy, spawn an agent, or change goal state yet.
Tell the owner that the project is paused and ask these questions first:

1. What exactly broke in the CLI, and what did it display or stop doing?
2. Was the CLI failure related to the persisted goal showing `blocked`, agent
   status, queued messages, or something else?
3. Should the obsolete blocked goal be resumed/replaced with the full-game goal,
   or should goal state remain untouched until the CLI problem is understood?
4. After that is settled, should the first project action be independent review
   and deployment of W175, or should the repository remain paused?

Do not infer the answers. The owner explicitly asked the previous AI to stop and
leave this handoff.

## The goal-state problem

The goal tool currently reports:

- status: `blocked`
- objective: an old five-item DOJ queue covering sound, HUD, bees/rank,
  generalized coverage, and `$29540C`
- thread id: `019fdfed-5db1-7d90-99d2-ca2b30c67668`
- last reported usage: 608,435 tokens and 17,659 seconds

That objective is stale. Sound, HUD/chaining, bee rank feed, and generalized
coverage were completed after it was written, and work continued through stage
2 type `$96`. Earlier in this session, creating a new goal was refused because
the blocked goal was still treated as unfinished. The project itself is not
technically blocked. This appears to be persisted CLI/orchestrator state.

Do not mark it complete merely to clear it. Do not fabricate a new blocker.
Ask the owner whether the CLI failure they saw is this goal-state mismatch and
what they want done with it.

The permanent project objective is in `AGENTS.md`: complete the full
DoDonPachi DaiOuJou Black Label Version-B game as readable JavaScript verified
against the ROM, including all stages, bosses, loops, systems, presentation,
sound, authentic timing, and slowdown. Individual waves are only milestones.

## Exact repository and deployment state

Repository root: `C:\programmieren\batman`

At handoff:

- local `HEAD`: `f0d4a476fbf4d01cb682fbad26abd28f676f24c7`
- `origin/main`: the same commit
- commit title: `ddpdoj: port stage 2 type 96`
- W175 is committed and pushed, but NOT deployed
- W175 dry-publish build: `20260809062532`
- last real deployment: W174 build `20260809060321`
- live URL: `https://gbtman.pages.dev/games/ddpdoj/`
- no agent or command is running now

The worktree contains only these three untracked owner files. They are permanent
user work and must never be staged, edited, removed, or cleaned:

```
games/ddpdoj/tools/oracle/c1_gates.py
games/ddpdoj/tools/oracle/c1_mailbox.py
games/ddpdoj/tools/oracle/c1_scan.py
```

Verify this before doing anything:

```powershell
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

## Where DOJ currently stops

W175 is complete in the repository:

- worklog: `docs/worklog/ddpdoj/175-impl-stage2-type96.md`
- stage-2 type `$96` is ported
- source record: `$2329C0`, clock `$00B8`, movement index `$3C`
- init stub/body: `$27A44C` / `$27A454`
- handler: `$27A548`
- full state, firing, damage, death, screen-clear behavior, art, and emitter
  dependencies are included
- stage-2 coverage is 314/332 records
- dynamic-minus-static is zero
- full suite at commit: 1,482/1,482 pass, zero skips
- bundle gate: 100 percent identical
- exporter, browser gate, boss coverage, and dry publish all passed

The next honest chronological unsupported record is:

- record `$232C00`
- clock `$0118`
- type `$8C`
- movement index `$3F`
- init body `$2789F6`
- handler `$278C0E`

If the owner authorizes resuming, first independently review W175 and deploy it
only if green. Then reserve W176 and start the dependency-complete type `$8C`
wave. Do not begin W176 while the requested pause is still in force.

Useful W175 tests and tools:

```powershell
node --test games/ddpdoj/tests/w175type96.test.js games/ddpdoj/tests/handlers.test.js games/ddpdoj/tests/initbody.test.js games/ddpdoj/tests/w167coverage.test.js
python games/ddpdoj/tools/dojcoverage.py
python games/ddpdoj/tools/export-tables.py --verify
node games/ddpdoj/tools/export-web.mjs
node tools/publish.mjs --only ddpdoj --dry
```

Only after an independent green review and owner clearance to resume:

```powershell
node tools/publish.mjs --only ddpdoj
```

## Recent project state that supersedes the old brief

The root `BRIEF-next.md` and much of `CATCHUP.md` are historically useful but
stale. Always check `git log` and the newest numbered worklogs before believing
their queue or in-flight claims.

Important completed work:

- W149-W162: authentic sound chain, driver, ICS core, browser audio, SFX duration,
  score-bank selection, BGM timer cadence, and live music restoration
- W161: chain presentation, combo display, gauge presentation, and missing HUD
  assets
- W163-W164: chain-earned hyper progression and authentic death/reset behavior
- W165: replay parity and the obstructive recording/help tooltip behavior
- W166: bee chain/rank/hyper feed
- W167: reusable bidirectional static/dynamic coverage
- W168-W175: stage-2 background elements, stage install, and enemy types `$95`,
  `$8D`, `$8F`, `$84`, `$90`, and `$96`
- Gradius commit `21fed98`: restored title/menu nametable after demo return

The owner reported that sound became very good after the duration fix, while
music was initially sparse. W162 fixed the causal score-group selection and
53.846 Hz music-timer cadence. Those changes are included in every later live
build. Do not regress sound while continuing stage content.

The owner also reported chaining as vital, specifically that it must rise on
hits, decay when hits stop, and feed hypers. W161, W163, W164, and W166 close
that reported cluster. Preserve those mechanics and their tests.

## Read these files in this order after the owner answers

1. `PROMPT.md`
2. this `instructions.md`
3. `AGENTS.md`
4. `docs/worklog/ddpdoj/175-impl-stage2-type96.md`
5. `docs/worklog/ddpdoj/174-impl-stage2-type90.md`
6. `docs/worklog/ddpdoj/167-impl-general-static-dynamic-coverage.md`
7. `HANDOVER.md`
8. relevant files under `docs/knowledge/`, especially 01, 02, 03, 09, and 10

For older issue history, use the worklogs rather than summaries:

- sound: `docs/worklog/ddpdoj/149-*` through `162-*`
- chain and hyper: `159-*`, `161-*`, `163-*`, `164-*`, `166-*`
- replay/tooltips: `165-*`
- generalized coverage and stage 2: `167-*` onward

The ROM/listing and evidence tools are under:

- `games/ddpdoj/rip/`
- `games/ddpdoj/tools/oracle/`
- `games/ddpdoj/tools/dojcoverage.py`
- `games/ddpdoj/tools/bosscoverage.py`
- `games/ddpdoj/tools/export-tables.py`
- `games/ddpdoj/tools/export-web.mjs`

Read tool headers before interpreting a red result. The correct general MAME
entry point is `games/ddpdoj/tools/oracle/pgm.py`; another similarly named tool
can exit successfully without doing the intended check.

## Permanent workflow rules

These are also in `PROMPT.md` and `AGENTS.md`, but they are load-bearing:

- The ROM/listing is the source of truth. Measurements validate presence, not
  absence.
- Check every brief premise against live `HEAD`. Many historical premises were
  false or stale.
- Every new check must be demonstrated red, then restored green.
- Read past apparent routine ends and include fall-through tails.
- Do not invent behavior or clamp an authentic failure away.
- One DOJ source writer at a time. A second agent may perform read-only recon.
- Use Luna agents for basic, mechanical, bounded work. Do not force Luna onto
  fidelity-critical ROM translation or difficult architecture.
- Poll agents only at meaningful milestones or with long waits. The owner asked
  to reduce polling because it consumed too many tokens.
- Before a new wave, enumerate numeric worklogs and atomically reserve max+1 as
  specified in `AGENTS.md`. Never reuse gaps or killed numbers.
- Never use `git add -A`. Use a private index and stage exact intended files.
- Never commit ROM-derived assets. Regenerate local assets before publish.
- Preserve the six existing publish-verbatim exceptions. A seventh requires an
  owner decision.
- Independently review each wave, verify commit and push, run gates, and deploy
  only after green.
- No em dash in output or files.

## What was happening when the stop arrived

The previous AI had just deployed W174 after independent review. It then sent
W175 to the single DOJ writer and a separate read-only ROM auditor. The owner's
stop request arrived after both agents had effectively finished. The writer had
already committed and pushed W175; the auditor had made no files. The previous
AI did not deploy W175 and did not start W176.

This is a clean pause point. The next AI should solve the CLI/goal-state question
with the owner first, then continue from W175 review rather than repeating the
implementation or trusting an older queue.
