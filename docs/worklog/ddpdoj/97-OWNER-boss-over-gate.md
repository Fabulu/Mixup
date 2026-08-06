# OWNER DECISION - keep the boss, accept STAGE 1 ENDS red

owner, 2026-08-06. Binding. Asked explicitly and answered explicitly.

## THE QUESTION PUT

W96 shipped two lines in `src/initbody.js` that activate the boss. With them the
boss arrives, descends, hands off and fights for 559 frames. Without them the
tables install, the `WARNING - HUGE BATTLESHIP` banner appears, and the port
flies through to lf15,611 with no boss and no crash.

The cost: `pgm.py check` goes 72/2 to **71/3**. The new red is `STAGE 1 ENDS`.

**Decision: KEEP THE BOSS.** The revert remains two lines if that changes.

## WHAT THE RED ACTUALLY IS, MEASURED

**It is not a disagreement with the cartridge.** `w62stageendgate.mjs` says so
in its own header: *"IT IS PORT-VS-LISTING, NOT A BOARD COMPARISON. No MAME run
in this repo has ever reached the stage-1 boss, let alone timed him out, and
this file does not pretend otherwise."*

`[M]` **Zero rows differ in value.** All seventeen assertions fail for one
reason: the run stops at `$29540C`, an honest declared throw, before reaching
the stage ending the gate walks to.

The three failing stages after the decision:

| stage | kind | since |
|---|---|---|
| `STAGE 1 ENDS` | port-vs-listing | W96, this decision |
| `THE LASER BOMB` | known red | W80 |
| `segment sweep` | expected while any rung blocks | W69 |

## A CORRECTION THAT MATTERS FOR HOW THIS WAS DECIDED

**W96 reported the new red as "board-carrying". It is not.** The orchestrator
checked the file rather than accept the summary, and the header says
port-vs-listing in terms. That single word changed the severity of the question
from "the port now disagrees with the board" to "the port no longer walks its
own recorded path to the end", which is a much smaller claim.

**Both matter and they are not the same, and the distinction is now load
bearing**: W90 was allowed to re-baseline two gates *because* their headers
declared no board column, and W95 reverted its activations *because* it
believed two board-carrying stages had moved. Getting this label wrong in either
direction produces the wrong action. **Read the gate file's own header before
classifying a red.**

## WHAT THIS DOES NOT CHANGE

- **`39-OWNER`'s bar is unchanged.** Stage 1 still needs FEATURE COMPLETE **and**
  ORACLE-CLEAN, and this decision is explicitly a debt against the second, not a
  redefinition of it. `STAGE 1 ENDS` going green again is owed.
- `publish.mjs` is unaffected and stays GREEN: it does not run `pgm.py check`.
- The ladder gains do not depend on the two lines. `[M]` 15 green / 27 red / 29
  blocked / 13,084 frames, bucket 2 54,280 records, reproduced by the
  orchestrator independently of W96's report.

## THE WAY OUT, WHEN SOMEBODY TAKES IT

Port `$29540C`. The run then reaches the stage ending again and the gate returns
to green on its own, with the boss still on screen.

**UPDATE, same day: THE OWNER HAS NOW MANDATED IT.**

> "Can we actually make sure we fix the thing that stops the boss too? Something
> unported I guess? Before you stop that is"

So this stops being a queued option and becomes the work. It was offered as a
third choice when the decision above was put, and not taken then; the owner came
back to it unprompted within the hour.

**The debt was therefore never accepted as permanent, and this file should not
be read as blessing a standing red.** The decision was "keep the boss now", not
"the gate may stay red". Anyone citing 97 to justify carrying a red must cite
this section with it.

**How it must NOT be closed:** by clamping, stubbing, or special-casing the
gate. If `$29540C` turns out to be large, or if porting it does not restore
`STAGE 1 ENDS`, both are findings to report, and the red stays where it is. A
red carried honestly beats a green bought with a fake, and this project has
`docs/knowledge/03` because that trade has been made badly before.

The original warning stands regardless: a red carried on purpose stops being a
decision and becomes rot the moment nobody remembers why it is there.
