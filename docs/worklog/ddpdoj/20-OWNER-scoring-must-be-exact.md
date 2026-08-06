# OWNER REQUIREMENT - scoring, combo and chain must be frame-exact, possibly sub-frame

status: REQUIREMENT (not a finding) - binding on every wave from here
raised: 2026-08-01 by the repo owner
**The architect must read this before planning. It changes what "done" means.**

## What was said

> "Scoring and combo meter and chaining is incredibly important in this game. We
> have to get these systems right down to the frame and possibly subframe.
> There's no leeway, approximations won't work because this game is so precise
> and there are so many moving parts. **One false move, one wrong rank gain from
> using super and the entire route breaks or the chain doesn't work.**"

## Why this is an architecture requirement and not a polish item

In a Cave shooter the score system is not a readout - it is **the game**. Players
route a stage around chain maintenance, and a route is a frame-by-frame plan. A
chain that drops one frame early is a different game, and a rank value that is
one step high because a bomb was counted wrongly changes bullet speed, aim and
spawn behaviour for the rest of the run.

So "the picture matches" is not the bar here. **The bar is that a route that
works on the board works in the port, and that is a much stronger claim than any
pixel comparison.**

Three consequences, all of which bite EARLY:

**1. The chain timer is frame-counted, so the work budget must be too.** The
counted-not-timed rule (`docs/knowledge/06`, `NOTES-replay.md`) was already
required for replay determinism and for mechanism (C). This is a third,
independent reason: if slowdown is modelled by elapsed host time, chain windows
drift, and a chain that survives on the board dies in the port on a slower
machine. Three separate requirements now converge on the same design.

**2. "Possibly sub-frame" means ORDER WITHIN A FRAME is semantics.** Whether a
hit registers before or after the chain timer decrements, whether a bomb's rank
contribution lands before or after the frame's rank read - those are ordering
questions inside one frame, and the port must reproduce the board's order, not
merely its per-frame totals. This is the same class as the display list's drain
order being the depth order, and as Batman's `$0567` call order deciding sprite
priority. **Enumerate the order; do not assume a frame is atomic.**

**3. Rank is an accumulator fed by player ACTIONS, so every action's rank
contribution must be exact.** `docs/knowledge/08` already says rank errors are
amplifiers - a wrong rank does not produce a small divergence, it produces
different enemy behaviour and possibly different spawns, after which
first-divergence analysis points at symptoms. The owner names the specific case:
**a wrong rank gain from using super**. So the rank ledger needs every credit and
debit enumerated from the ROM, not sampled.

## What this means for the plan

- **Score, chain and rank are not a late wave.** They are read by, and feed back
  into, the systems being ported now. Locate their state and their update sites
  early even if the porting comes later, so nothing is built on a wrong model of
  when they change.
- **Enumerate the ledger statically** (`docs/knowledge/09`): every site that
  adds score, every site that touches the chain counter or its timer, every site
  that moves rank. A COMPLETE list with a denominator, from the ROM. A sampled
  list is worthless here for the same reason a sampled bullet-pattern list is.
- **Wave 5's finding stands and must be closed:** the score/chain words it needed
  DO NOT EXIST in our notes - wave 2 never produced them. Nobody has located
  them. That is now a first-order gap, not a footnote.
- **The verification bar rises.** Comparing score bytes per frame on one scripted
  path is necessary and not sufficient, because the chain depends on which
  enemies died in which order at which frame. The strong test is a REPLAY: a
  recorded input sequence that produces a known chain on the board must produce
  the identical chain, frame for frame, in the port. `NOTES-replay.md` is
  therefore not a nice-to-have either - **it is the only test that can prove this
  requirement is met.**

## The one-line version for anyone skimming

> A port that renders every pixel correctly and drops a chain one frame early has
> failed at the thing this game is about.
