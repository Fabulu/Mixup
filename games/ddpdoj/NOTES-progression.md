# Progression, bees, and the second loop — and why the corpus needs TWO strategies

status: RESEARCH ONLY — nothing here is measured on our board yet
raised: 2026-08-01

**Everything below is from public player documentation, NOT from our own
measurement.** It is written down as HYPOTHESES to verify against the board,
because this project's rule is that a number is not a fact until measured. Every
item is a claim to confirm with a RAM watch, not a spec to implement.

## 1. It is an arcade game, so the oracle can brute-force reach

Owner's point, and it is a big one for coverage: on a coin-op, dying is not the
end. Insert coin, start, continue. **The oracle does not need to play well; it
needs to persist.** A scripted "die → coin → start" loop can walk the corpus
through the whole first loop regardless of difficulty, which is the thing that
makes stages 2-5 reachable at all.

Combined with the seed-anywhere machinery Gradius wave 10 just proved, that is
the answer to the coverage problem this project keeps hitting: drive deep once,
seed from there forever.

## 2. …but continuing DISQUALIFIES the second loop

**This is the catch, and it means one corpus strategy cannot serve both goals.**
Public documentation is consistent that a player who continues during loop 1
cannot enter loop 2, regardless of whether the other conditions were met.

So:

| goal | strategy | continues |
|---|---|---|
| **reach stages 2-5, verify their content** | coin-feed through deaths | REQUIRED, and harmless |
| **reach loop 2 at all** | a clean run meeting an entry condition | FORBIDDEN |

Do not let the convenient strategy silently become the only one. A corpus built
entirely on continues would make loop 2 unreachable and — worse — would look
like full coverage while the entire second half of the game sits untested. That
is the same failure shape as the scroll-`$0380` blind spot in Gradius, one order
of magnitude larger.

## 2b. A MISS IS NOT A CONTINUE, and the difference decides the strategy

Easy to conflate, and the two have opposite consequences:

- **A miss** — lose a life, respawn. Loop 2 TOLERATES misses: "no more than 2"
  is itself one of the entry conditions. Dying is not disqualifying.
- **A continue** — the stock is exhausted and a coin is inserted. This IS
  disqualifying, and no other condition rescues it.

So coin-feeding cannot reach loop 2 — not because it dies, but because a
coin-fed run is by definition one that ran out of lives.

### The way out: we do not have to EARN loop 2, we have to REACH THE BRANCH

An oracle that cannot play well will exhaust its stock, so a "clean run" by
scripted input is not realistically obtainable. But this project has never
needed to obtain a state naturally in order to test it. **Poke the counters to
qualifying values and let the cartridge decide.**

That is exactly how rank's thresholds were tested in Gradius (an unforced run
only ever reaches rank 0-1, so the values were poked), how the sprite cap was
reached here, and how zoom coverage is produced. The precedent is established
and the discipline that goes with it is too:

1. Find the loop-2 decision routine first. It reads all five pieces of state, so
   hooking it identifies the addresses to poke — do NOT guess which byte is the
   miss counter.
2. Poke at the sample point on BOTH sides, so port and board stay frame-aligned.
3. **A poked run proves the DECISION, not the journey.** It shows the cartridge
   grants loop 2 for a given counter set. It does NOT show that ordinary play
   produces that counter set — that is a separate claim needing separate
   evidence, and conflating them is the seed-hiding-bugs trap from
   `docs/worklog/gradius/09-DECIDED-seed-anywhere.md`.
4. Once inside loop 2, its CONTENT can then be compared normally, and that is
   where the real value is: loop 2 is a different game state with different
   enemy behaviour and rank.

So the corpus needs three strategies, not two: coin-fed for stage content, poked
for the loop-2 branch and its content, and — if it is ever affordable — one
genuinely clean run to confirm the journey matches the poke.

## 3. The loop-2 entry conditions, as reported

Any ONE of these in loop 1, per player documentation:

- no more than **2 misses**
- no more than **3 bombs** used
- **Bee Perfect in at least 3 stages**
- at least **350,000,000 points** (reported as White Label only — so possibly
  NOT applicable to our Black Label target; verify)

Plus the absolute bar: **no continues**.

**What this implies for the port, and it is the useful part:** the game must be
tracking, across a whole loop, at minimum a miss counter, a bomb counter, a
per-stage bee-perfect flag or count, the score, and a "has continued" flag. Those
are five pieces of persistent RAM state with a decision routine reading them at
the end of stage 5. **Find that routine and you find all five addresses at once**
— hook the branch that decides loop 2 and read what it tests, exactly as the
Gradius player mover was found by hooking writes rather than reading listings.

That routine is also a natural home for the rank interaction, since
`docs/knowledge/08` predicts loop and rank stack as two global difficulty
parameters.

## 4. Bees

Reported: **10 hidden bees per stage**, revealed by the laser. Collect all of a
stage's bees without dying and the last one carries a **×2 multiplier**, and the
base value of bees rises in the following stage. That is the "Bee Perfect" bonus,
and 3 of them is one of the loop-2 entry conditions.

Port consequences worth stating before anyone writes scoring code:

- Bees are **hidden objects with a reveal mechanic tied to a specific weapon**.
  A corpus that never fires the laser never reveals a bee, so bee code is
  unreachable by exactly the kind of scripted run we build by default. Another
  instance of the standing pattern: a parameter (here, weapon mode) the corpus
  never varies.
- Bee state is **cross-stage** — the base value carries forward — so it cannot be
  modelled per stage.
- Scoring is not cosmetic here. It is a loop-2 entry condition, so a scoring bug
  is a progression bug.

## 5. What to do with this

1. **Verify every claim above on the board.** Do not port from this file.
2. Find the loop-2 decision routine; it yields the counters for free.
3. When the corpus reaches stage 5, build BOTH strategies: a coin-fed run for
   content coverage, and at least one clean run that satisfies an entry
   condition, or loop 2 stays permanently untested.
4. Watch for the same trap the whole project keeps hitting: "no measured run has
   collected a bee" is a fact about our sampling, never about the cartridge.

Sources consulted (player documentation, not measurement):
<https://zps-stg.github.io/other/cave-loop2>,
<https://shmups.wiki/library/DoDonPachi_DaiOuJou>,
<https://shmups.system11.org/viewtopic.php?t=39713>
