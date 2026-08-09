# Handoff for the next AI

Last updated: 2026-08-09, after W183 publication.

## Current directive

The CLI problem was external harness state and is resolved. Do not investigate
or fix the CLI. The owner explicitly directed work to continue until the full
project is finished.

The permanent full-game goal is active under thread
`019fe582-cced-7ce0-ae2e-55dea8de48b2`: complete DoDonPachi DaiOuJou Black
Label Version-B as readable JavaScript verified against the ROM, including all
stages, bosses, loops, systems, presentation, sound, authentic timing, and
slowdown. Individual waves are milestones, not the finish line.

The old W175 pause is resolved. W176 through W183 are live. W183 closes the
332/332 stage-2 spawn script and translates type `$30`'s boss entry, complete
damage controller, A4 bootstrap, and arrival MAIN 0. Continue from A3/D0 init
`$297F54`. Do not repeat W175 through W183.

## Exact repository and deployment state

Repository root: `C:\programmieren\batman`

At handoff:

- W176 is committed, pushed, and deployed
- W177 is committed, pushed, and deployed
- W178 is committed, pushed, and deployed
- W179 is committed, pushed, and deployed
- W180 is committed, pushed, and deployed
- W181 is committed, pushed, and deployed
- W182 is committed, pushed, and deployed
- W183 is committed, pushed, and deployed
- W175 live build: `20260809081027`
- W176 live build: `20260809092221`
- W177 live build: `20260809095334`
- W178 live build: `20260809102233`
- W179 live build: `20260809105517`
- W180 live build: `20260809112012`
- W181 live build: `20260809114953`
- W182 live build: `20260809124334`
- W183 live build: `20260809140956`
- live URL: `https://gbtman.pages.dev/games/ddpdoj/`
- no agent or command is running now

The worktree contains these three untracked owner files plus the untracked
`NUL` entry. They are permanent user work and must never be staged, edited,
removed, or cleaned:

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

W183 is complete and live:

- worklog: `docs/worklog/ddpdoj/182-impl-stage2-type86.md`
- stage-2 type `$30` is ported at record `$233020`, clock `$01DC`
- init stub/body: `$297118` / `$297120`; handler: `$297398`
- the complete `$298310` multi-part controller, A4 bootstrap, and arrival MAIN
  0 are included; the remaining boss program is not
- stage-2 coverage is 332/332 records with 0 unknown
- enemy-type coverage is 43/256
- the seeded boot consumes 331 records with 326 allocations and five authentic
  declines, then stops at A3/D0 init `$297F54`
- no new art was needed; the web bundle remains at 2,743 streams

The next honest unsupported boss dependency is:

- A3/D script id `$00`
- init `$297F54`
- step `$297F60`
- installed table base `$297EE0`
- reached during type `$30`'s first handler frame at clock `$01DC`

Reserve the next immutable worklog number, statically map the D0 dependency
closure before implementation, and continue through the stage-2 boss program.

Useful current tests and tools:

```powershell
node --test games/ddpdoj/tests/w183type30.test.js games/ddpdoj/tests/w133stage2boot.test.js games/ddpdoj/tests/w167coverage.test.js
python games/ddpdoj/tools/dojcoverage.py
python games/ddpdoj/tools/export-tables.py --verify
node games/ddpdoj/tools/export-web.mjs
node tools/publish.mjs --only ddpdoj --dry
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
- W168-W183: stage-2 background elements, stage install, and enemy types `$95`,
  `$8D`, `$8F`, `$84`, `$90`, `$96`, `$8C`, `$91`, `$92`, `$97`, `$94`, `$93`,
  and `$86`
- Gradius commit `21fed98`: restored title/menu nametable after demo return

The owner reported that sound became very good after the duration fix, while
music was initially sparse. W162 fixed the causal score-group selection and
53.846 Hz music-timer cadence. Those changes are included in every later live
build. Do not regress sound while continuing stage content.

The owner also reported chaining as vital, specifically that it must rise on
hits, decay when hits stop, and feed hypers. W161, W163, W164, and W166 close
that reported cluster. Preserve those mechanics and their tests.

## Read these files in this order before continuing

1. `PROMPT.md`
2. this `instructions.md`
3. `AGENTS.md`
4. `docs/worklog/ddpdoj/181-impl-stage2-type93.md`
5. `docs/worklog/ddpdoj/180-impl-stage2-type94.md`
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

## Latest completed delivery

W183 closed the final stage-2 spawn record and moved the controlled frontier
inside the boss program to A3/D0 init `$297F54`. Its 1,519-test release,
controlled boot, bundle/web gates, ROM-leak guard, deployment, and stable live
polls pass. Build `20260809140956` is live. Continue through the statically
mapped boss scripts; the full-game goal remains active after every wave.
