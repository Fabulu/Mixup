# Contributing

The short version: **measure it against the cartridge, or don't change it.**

This project has one unusual property that shapes everything else — there is a
correct answer to every question, and it is available. An emulator runs the real
ROM headless and diffs our state against it, field by field, frame by frame. So
"I think this is how it works" is never the standard; "I hooked it and it does
this" is.

There are **three games and three oracles**, one emulator per machine:

| game | emulator | driven by |
|---|---|---|
| Batman: Return of the Joker (Game Boy) | PyBoy | Python |
| Gradius (NES) | Mesen 2.1.1 | Lua |
| DoDonPachi DaiOuJou (IGS PGM arcade) | MAME 0.288, `-video none -sound none -nothrottle` | Lua |

## Before you start

`npm install` once, for everything — it brings in typescript, which the Batman
gate's stage 2 needs. Then set up whichever game you are touching. Each needs a
ROM **you** own; none of them is in this repository.

```sh
# --- Batman. Your own cartridge at the repo root, named exactly:
#     Batman - Return of the Joker (USA, Europe).gb
pip install pyboy
python tools/export_assets.py            # -> games/batman/assets/
python tools/gen_tunables.py             # -> games/batman/src/tunables.js

# --- Gradius. "Gradius (USA).nes" at the repo root.
python games/gradius/tools/export_assets.py
python games/gradius/tools/oracle/setup_mesen.py   # unattended, outside the repo

# --- DoDonPachi DaiOuJou. The ddpdojblk MAME set.
python games/ddpdoj/tools/export-tables.py
node   games/ddpdoj/tools/export-web.mjs
python games/ddpdoj/tools/setup_mame.py            # unattended, outside the repo
```

Read `SAVEPOINT.md` first — it is the map of what is done per game, what is
not, and which traps have already cost someone a day. Then
`docs/knowledge/`, which is the cross-game distillation and the thing to read
before starting a new game; `docs/03-VERIFICATION.md` is Batman's method and its
numbered list of ROM behaviours counter-intuitive enough to have caused real
bugs. `docs/worklog/gradius/` and `docs/worklog/ddpdoj/` are the per-wave record
for the two games still in flight.

## The rules that actually matter

**1. Measure, don't infer from the listing.** Every serious bug in this
project's history came from a plausible reading nobody checked. Two specific
traps, both of which have bitten repeatedly:

- **Follow the fall-through, not the label.** A routine that looks like it
  returns often falls straight into the next one. **At least thirty distinct
  incidents** across the three games, one of which invalidated an
  already-shipped handler. Treat thirty as a floor and not a total — see
  `docs/knowledge/02-traps.md` for why the project's own running count of these
  cannot be trusted.
- **Byte-exact data is not a correct picture.** A screen matched the
  cartridge's VRAM to the byte and rendered wrong, because nothing drew its
  sprites. If you can render it or drive it, do that too.

**2. Cite the ROM address.** Every non-obvious line carries the address it came
from. This is not decoration — it is how the next person checks your work
without re-deriving it.

**3. A new check must be seen to fail.** If you add a test or a scenario,
revert the fix, watch it go red, then restore. Checks here have sat green
through the very bug they were written for in **four** distinct ways: one
asserted only that rendering did not throw, one set up state the application
never has, one sampled frames that never changed, and one took the answer in as
an argument. A check you have never seen fail proves nothing.

**4. Nothing ROM-derived gets committed.** Not a table, not a tile, not a
sprite list. Data travels through `assets/manifest.json`, exported by
`tools/export_assets.py`, and `tools/verify_assets.py` re-reads each table from
raw file offsets so the exporter cannot verify itself. A missing table should
**throw**, never silently default — metasprite id 0, tile 0 and animation id 0
are all valid, so a default looks plausible and is wrong.

**5. "The cartridge is like that" is a valid, valuable result.** Several of the
best findings here have been that the port was already faithful and the game is
simply hard, or ugly, or strange. Do not invent a fix to match an expectation.

## Verifying a change

There is **one gate per game, and they are three separate runners.** Run the one
for the game you touched.

```sh
npm test                                     # Batman unit tests — 740, no ROM
npm run typecheck                            # tsc over the ports — no ROM either
npm run test-all                             # Batman gate — 27 stages (PyBoy + cartridge)
npm run test-all -- --fast                   # skip everything that needs PyBoy
npm run test-all -- --only raster-bands

node --test games/gradius/tests/             # Gradius unit tests — 725
node games/gradius/tools/test-all.mjs        # Gradius gate — 12 stages

node --test games/ddpdoj/tests/              # DaiOuJou unit tests — 934
```

**2,399 unit tests green** at the time of writing: 740 Batman, 725 Gradius, 934
DaiOuJou. The Gradius gate is deliberately **not** wired into the root runner —
its header says so and says why — and DaiOuJou has no `test-all` at all yet,
only its unit tests plus individual gates (`bundlegate.mjs`, `webgate.mjs` and
a long list of per-wave ones under `games/ddpdoj/tools/`).

`node tools/publish.mjs` is the only thing that runs **all** of them, and it
refuses to publish on a red gate *or on any skip*. `--only gradius` / `--only
ddpdoj` / `--only batman` gate one game; `--dry` gates and builds without
deploying. **A skip is not a pass** — the runners tell apart a legitimate
environmental skip (no emulator, no cartridge) from a skip caused by a moved
path, which is a failure. `docs/knowledge/03`.

Every unit suite deliberately never reads `assets/`, so they run on a clean
checkout and in CI. They use synthetic fixtures — see `SYNTHETIC_TABLES` in
`games/batman/tests/helpers.js`. If your change makes a unit test need real ROM
data, the fixture is the thing to change, not the suite's independence.

No emulator stage can run in CI, because CI has no ROM for any of the three
games. **Run them locally and say in your PR what they reported.** CI runs what
needs neither ROM nor assets: the unit suites and the typecheck.

## Writing an oracle harness

The existing ones are the templates. For Batman, `objregress.mjs`,
`doordiff.mjs`, `flowdiff.mjs`, `deathdiff.mjs` and `rasterdiff.mjs` are the
best-built; the Gradius and DaiOuJou harnesses live under
`games/gradius/tools/oracle/` and `games/ddpdoj/tools/` and follow the same
shape against Mesen and MAME. Two habits worth copying:

- **Event-cap, don't frame-cap.** Stop when the ROM's own sequencer lands, plus
  settling frames. A frame count goes stale the moment anything shifts.
- **Assert arrival before reading memory.** A probe that never reached the
  screen it thinks it is sampling once produced two entirely fictitious dumps
  that were acted on.

Lag frames (`$C757`) are instruction-level timing and out of scope by
definition — see `docs/03-VERIFICATION.md` §28. Cap scenarios below the first
one rather than trying to model them.

## Committing

- **Stage by name.** `git add -A` sweeps up whatever else is in flight.
- **Then check the index before you commit.** `git commit` commits the *index*, not the
  files you named — so run `git diff --cached --name-only` and look for anything that is
  not yours. This is not theoretical: a commit of six documentation files once swallowed a
  65-file rename another writer had staged but not finished fixing up, and shipped a HEAD
  where `npm test` pointed at a directory that no longer existed. Staging by name protects
  you from *unstaged* work; only checking protects you from work someone else staged.
- **If an automated restructure is running, do not commit from that repo at all** — even
  files it will never touch. Wait, or use a separate worktree.
- **`git checkout -- <file>` on a dirty tree discards uncommitted work in that file.** It
  is not a safe way to drop a probe.

## Pull requests

Say what you measured and what it said. A diff without evidence is a guess, and
this project has no shortage of plausible guesses that turned out wrong.

Small and cited beats large and sweeping. If you are touching the frame order
in `games/batman/src/game/frame.js`, be aware it determines OAM priority and
carry ordering, and has caused subtle bugs twice. That file and
`games/batman/src/enemies/driver.js` are the only two that know any order; both
name the test that guards them (`games/batman/tests/frameorder.test.js`,
`games/batman/tests/enemy-order.test.js`). Those tests exist because FIVE distinct order
mutations passed the entire unit suite before they were written.
