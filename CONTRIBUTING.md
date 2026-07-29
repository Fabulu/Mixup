# Contributing

The short version: **measure it against the cartridge, or don't change it.**

This project has one unusual property that shapes everything else — there is a
correct answer to every question, and it is available. A PyBoy oracle runs the
real ROM headless and diffs our state against it. So "I think this is how it
works" is never the standard; "I hooked it and it does this" is.

## Before you start

```sh
# your own cartridge, named exactly:
#   Batman - Return of the Joker (USA, Europe).gb
python tools/export_assets.py      # -> assets/
python tools/gen_tunables.py       # -> src/tunables.js
npm install                        # pyboy is a python dep: pip install pyboy
```

Read `SAVEPOINT.md` first — it is the map of what is done, what is not, and
which traps have already cost someone a day. Then `docs/03-VERIFICATION.md`,
which is the method and a numbered list of ROM behaviours counter-intuitive
enough to have caused real bugs.

## The rules that actually matter

**1. Measure, don't infer from the listing.** Every serious bug in this
project's history came from a plausible reading nobody checked. Two specific
traps, both of which have bitten repeatedly:

- **Follow the fall-through, not the label.** A routine that looks like it
  returns often falls straight into the next one. Nine incidents, one of which
  invalidated an already-shipped handler.
- **Byte-exact data is not a correct picture.** A screen matched the
  cartridge's VRAM to the byte and rendered wrong, because nothing drew its
  sprites. If you can render it or drive it, do that too.

**2. Cite the ROM address.** Every non-obvious line carries the address it came
from. This is not decoration — it is how the next person checks your work
without re-deriving it.

**3. A new check must be seen to fail.** If you add a test or a scenario,
revert the fix, watch it go red, then restore. Two checks in this project's
history sat green through the bug they were written for. A check you have never
seen fail proves nothing.

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

```sh
npm test                       # unit tests — these run WITHOUT the ROM
npm run test-all               # all 21 stages (needs PyBoy + your cartridge)
npm run test-all -- --fast     # skip everything that needs PyBoy
npm run test-all -- --only raster-bands
```

The unit suite deliberately never reads `assets/`, so it runs on a clean
checkout and in CI. It uses synthetic fixtures — see `SYNTHETIC_TABLES` in
`tests/helpers.js`. If your change makes a unit test need real ROM data, the
fixture is the thing to change, not the suite's independence.

The PyBoy stages cannot run in CI, because CI has no cartridge. **Run them
locally and say in your PR what they reported.**

## Writing an oracle harness

The existing ones are the templates, and `objregress.mjs`, `doordiff.mjs`,
`flowdiff.mjs`, `deathdiff.mjs` and `rasterdiff.mjs` are the best-built. Two
habits worth copying:

- **Event-cap, don't frame-cap.** Stop when the ROM's own sequencer lands, plus
  settling frames. A frame count goes stale the moment anything shifts.
- **Assert arrival before reading memory.** A probe that never reached the
  screen it thinks it is sampling once produced two entirely fictitious dumps
  that were acted on.

Lag frames (`$C757`) are instruction-level timing and out of scope by
definition — see `docs/03-VERIFICATION.md` §28. Cap scenarios below the first
one rather than trying to model them.

## Pull requests

Say what you measured and what it said. A diff without evidence is a guess, and
this project has no shortage of plausible guesses that turned out wrong.

Small and cited beats large and sweeping. If you are touching the frame order
in `src/main.js`, be aware it determines OAM priority and carry ordering, and
has caused subtle bugs twice.
