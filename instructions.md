# Handoff for the next AI

Last updated: 2026-08-09, after W186 publication.

## Current directive

The CLI problem was external harness state and is resolved. Do not investigate
or fix the CLI. The owner explicitly directed work to continue until the full
project is finished.

The permanent full-game goal is active under thread
`019fe582-cced-7ce0-ae2e-55dea8de48b2`: complete DoDonPachi DaiOuJou Black
Label Version-B as readable JavaScript verified against the ROM, including all
stages, bosses, loops, systems, presentation, sound, authentic timing, and
slowdown. Individual waves are milestones, not the finish line.

The old W175 pause is resolved. W176 through W186 are live. W186 translates F3,
MAIN2, and D3 and advances the controlled runtime to A1/E6 `$299E90`. Do not
repeat W175 through W186.

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
- W184 is committed, pushed, and deployed
- W185 is committed, pushed, and deployed
- W186 is committed, pushed, and deployed
- W175 live build: `20260809081027`
- W176 live build: `20260809092221`
- W177 live build: `20260809095334`
- W178 live build: `20260809102233`
- W179 live build: `20260809105517`
- W180 live build: `20260809112012`
- W181 live build: `20260809114953`
- W182 live build: `20260809124334`
- W183 live build: `20260809140956`
- W184 live build: `20260809144557`
- W185 live build: `20260809151417`
- W186 live build: `20260809160147`
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

W187 is complete and live:

- worklog: `docs/worklog/ddpdoj/187-impl-stage2-boss-e6-e11.md`
- stage-2 type `$30` is ported at record `$233020`, clock `$01DC`
- init stub/body: `$297118` / `$297120`; handler: `$297398`
- the complete `$298310` multi-part controller, A4 bootstrap, arrival MAIN 0,
  initially armed A3 scripts, all eleven A2 objects, and type `$4D` are included
- stage-2 coverage is 332/332 records with 0 unknown
- enemy-type coverage is 44/256
- the complete F3 attack cycle is translated: A1/E6 through E11, including
  aim, RNG, timer, freeze, bullet-generator, and self-retirement behavior
- the seeded boot consumes all 332 records, materializes 327 allocations, runs
  through the old E6 stop for the full 9,000-frame budget, and visibly fires E6
  plus a later randomized E9 leaf
- the web bundle contains 2,919 streams; W185 added 176 to deferred boss shard 17

The next honest gameplay phase dependencies are:

- A4/F1 init `$298CE2`, step `$298D24`, started by the part/HP phase threshold
- A4/F2 init `$298DC2`, step `$298E02`, started by boss death or timeout
- A4/F8 init `$299882`, step `$2998AA`, started by the low-HP threshold

Reserve the next immutable worklog number, statically map these disjoint phase
closures in parallel, and translate their compact shared dependencies together.

Useful current tests and tools:

```powershell
node --test games/ddpdoj/tests/w187boss2attacks.test.js games/ddpdoj/tests/w186boss2f3.test.js
python games/ddpdoj/tools/export-tables.py
node --test games/ddpdoj/tests/w133stage2boot.test.js
node tools/publish.mjs --only ddpdoj --dry
```

`export-tables.py` verifies every invariant before writing, so do not precede
it with a redundant `--verify` run. The W133 tests share one immutable seeded
boot result; keep both assertions in one invocation. Run `dojcoverage.py` only
when a source registry, spawn script, or BGELEM family changed. Run
`export-web.mjs` when sprite/audio harvest declarations changed or once at the
publish boundary, not repeatedly during a code-only boss slice.

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
4. `docs/worklog/ddpdoj/187-impl-stage2-boss-e6-e11.md`
5. `docs/worklog/ddpdoj/186-impl-stage2-boss-f3.md`
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
- Give each non-overlapping ROM closure one static-analysis owner. That owner
  reports code, dependency graph, assets, and next frontier together; do not
  duplicate the same slice across separate recon, graph, asset, reviewer, and
  QA agents. Split agents by disjoint address ranges only when the work can run
  independently.
- Group compact same-frame scheduler dependencies into one delivery slice. A
  newly registered conductor must not become a publication merely to stop one
  call later at a tiny MAIN or D script that static analysis already bounded.
- Use one focused behavior check plus one seeded product smoke per meaningful
  slice. Do not rerun unchanged prior suites or coverage reports.
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

W187 translates the complete E6-E11 leaf set. Its focused scheduler/bullet
checks and 1,530-test release gate pass. The controlled boot runs beyond the
old E6 stop and produces real E6 and E9 bullet output. Build
`20260809173436` is live and confirmed. Continue with the statically mapped
F1, F2, and F8 phase entries; the full-game goal remains active after every
wave.
