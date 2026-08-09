# Handoff for the next AI

Last updated: 2026-08-09, after the owner restarted the buggy CLI and explicitly
lifted the pause.

## Current directive

The CLI problem was external harness state and is resolved. Do not investigate
or fix the CLI. The owner explicitly directed work to continue until the full
project is finished.

The permanent full-game goal is active under thread
`019fe582-cced-7ce0-ae2e-55dea8de48b2`: complete DoDonPachi DaiOuJou Black
Label Version-B as readable JavaScript verified against the ROM, including all
stages, bosses, loops, systems, presentation, sound, authentic timing, and
slowdown. Individual waves are milestones, not the finish line.

The old W175 pause is resolved. W175 was independently reviewed and deployed as
build `20260809081027`. W176 then ported the next chronological stage-2 family,
type `$8C`, including its shared palette-animation dependency. Continue from
the first unsupported type `$91` record. Do not repeat W175 or W176.

## Exact repository and deployment state

Repository root: `C:\programmieren\batman`

At handoff:

- W176 implementation and focused verification are complete
- W175 live build: `20260809081027`
- W176 publication details are recorded in
  `docs/worklog/ddpdoj/176-impl-stage2-type8c.md`
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

W176 is complete:

- worklog: `docs/worklog/ddpdoj/176-impl-stage2-type8c.md`
- stage-2 type `$8C` is ported at record `$232C00`, clock `$0118`
- init stub/body: `$2789EE` / `$2789F6`; handler: `$278C0E`
- its three-part lifecycle, firing, damage, death, cues, sound, six-part draw,
  and `$246410/$24683E` palette-animation path are included
- stage-2 coverage is 315/332 records with 17 unknown
- enemy-type coverage is 36/256; dynamic-minus-static remains zero
- the seeded boot completes the exact 227-record prefix with 223 allocations
  and four authentic declines

The next honest chronological unsupported record is:

- record `$232CE8`
- clock `$013F`
- type `$91`
- movement index `$02B`
- init body `$279AA2`
- handler `$279B2E`

Reserve W177 and start the dependency-complete type `$91` wave.

Useful current tests and tools:

```powershell
node --test games/ddpdoj/tests/w176type8c.test.js games/ddpdoj/tests/w133stage2boot.test.js games/ddpdoj/tests/w167coverage.test.js
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
- W168-W176: stage-2 background elements, stage install, and enemy types `$95`,
  `$8D`, `$8F`, `$84`, `$90`, `$96`, and `$8C`
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
4. `docs/worklog/ddpdoj/176-impl-stage2-type8c.md`
5. `docs/worklog/ddpdoj/175-impl-stage2-type96.md`
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

W176 closed type `$8C` and moved the controlled live frontier from `$232C00`
to `$232CE8`. Its focused 38-test integration set, ROM exporter verification,
and reusable coverage check pass. Continue with W177/type `$91`; the full-game
goal remains active after every individual wave.
