# Rank — when the game watches the player back

**Rank is a feedback loop: player state feeds a number, and that number changes
what the game does to you.** Gradius has one (`$17`, computed at `$9C45` from
the power-up state). DoDonPachi DaiOuJou has one too, and it is a far bigger
deal there.

This file is about the *shape* of the problem, because the shape is what
transfers. The Gradius specifics are being measured now
(`docs/worklog/gradius/00-recon-powerups.md`); nothing here should be read as a
measured fact about either game until that lands.

## Why it gets its own file

Most systems in a port are one-directional: input goes in, state changes, pixels
come out. Rank closes a loop. That breaks three assumptions this project has
otherwise been able to rely on.

**1. Subsystems stop being separable.** The working rule has been that you can
port the player without the enemies, the enemies without the sound. Rank is a
wire from the player's state into the enemy system. If it reaches spawn
decisions — not just per-enemy behaviour — then "port the power-ups" silently
means "port the spawn engine too", and you find that out halfway through.

**2. A small error stops producing a small divergence.** Get one pixel of
movement wrong and you get one pixel of divergence. Get rank wrong by one and
you may get *a different wave of enemies* — after which every field diverges at
once and the first-divergence report points at the symptom rather than the
cause. Rank errors are amplifiers.

This is the one that matters for the oracle method. `01-the-oracle-method.md`
says report the FIRST divergence per field, because the first one is the cause
and the rest are consequences. Rank can make the first divergence in *every*
field simultaneous and none of them the cause.

**3. It is a parameter the corpus will silently never vary.** This project has
already been burned exactly this way: a deliberate break of the sub-pixel
accumulator PASSED on 2,860 frames, because `$40` and `$45` read 0 on every
frame a button script could produce. The corpus reached the code and
interrogated none of its parameters (`03-checks-that-can-fail.md`).

Rank has the same shape, and worse: rank is *low at the start of a stage*, and
scenarios start at the start. **A corpus that never powers up tests rank 0 and
nothing else, while appearing to cover the code.** Every rank-dependent branch
is then untested and green.

## What to establish, for any game with rank

Answer these before porting anything that reads it:

| question | why it decides architecture |
|---|---|
| What feeds it? | power-ups, score, shots fired, time, deaths, chain — each is a different coupling |
| Where is it computed, and how often? | per frame, per stage, per spawn? |
| **Who reads it, and does it reach SPAWNS?** | behaviour-only is containable; spawn-affecting is not |
| How many thresholds, and what are they? | this is how many distinct states your scenarios must cover |
| Is it monotonic? Can it go *down*? | dying usually drops it — that is a second code path |
| What resets it? | stage transition, death, continue |
| Is it visible to the player? | if players manipulate it deliberately, being approximately right is being wrong |

That last row is the DaiOuJou row, and it is the same argument as
`06-lag-and-slowdown.md` makes about slowdown: **a system the player
deliberately manipulates is not an implementation detail, it is the game.** In a
Cave shooter, rank and slowdown together *are* the difficulty curve, and players
route around them on purpose. A port with perfect sprites and wrong rank is
wrong in the way that matters most to the people who care.

## The verification rule this forces

**Vary rank deliberately in the corpus, and prove you did.**

A scenario set that only ever runs at the rank a fresh stage starts with is a
vacuous invariant wearing a green hat — the same failure as sampling only frames
with no transitions. Concretely:

- find which rank values are reachable in the window you sample, and record it;
- force the others (poke the byte, as the harness already does for `$40`/`$45`
  — the poke must land at the same instant on BOTH sides, see
  `01-the-oracle-method.md`);
- for each rank-dependent branch, have at least one scenario that takes it, and
  break the branch to confirm something goes red.

And when reporting coverage, say which rank values were exercised. "All
scenarios pass" means very little if they all ran at rank 0.

## Where measurement stops being the right tool

This project's founding rule is *measure against the cartridge, do not infer
from the listing*. Rank is the first system that pushes back on it, and the
resolution is not "start guessing" — it is knowing which question each tool can
answer.

**Measurement can prove PRESENCE. Only the listing can prove ABSENCE.**

A run that reads `$17` proves `$17` is read. No number of runs can prove that
*nothing else* reads it — that is a claim about all possible executions, and a
corpus is a sample. To establish "these are the only readers", you have to look
at every instruction that could be one. That is static work, and there is no
measurement substitute for it.

**We have already paid for getting this backwards.** The plan excluded enemy
bullets because "no run has exercised them" — a *measurement* used to support an
*absence* claim — and the owner reached that code in thirty seconds of ordinary
play. The sentence that was true ("our corpus never populated slots 22-31")
was silently promoted to one that was false ("the cartridge does not do this").
See `03-checks-that-can-fail.md`; this is the same error wearing a new hat.

So for a combinatorial system, split the work by what each method can settle:

| question | tool | why |
|---|---|---|
| Where is rank read? Is that list complete? | **the listing** — find every read of the byte | absence claim; measurement cannot close it |
| What does each branch actually do? | **the listing**, then confirm | structure is static |
| Is my reading of that branch correct? | **measurement** — force the value, watch | presence claim; the cartridge arbitrates |
| Does the whole combination behave? | **neither, exhaustively** | the state space is not enumerable |

The last row is the honest one. You cannot test every constellation. What you
*can* do is make the untestable part small:

- **Enumerate the branch SITES statically** — that set is finite and knowable,
  even though the state space is not.
- **Cover the sites, not the combinations.** One scenario per rank-dependent
  branch, each one seen red when the branch is broken. That is branch coverage,
  and it is achievable.
- **Say which combinations are untested**, explicitly, in the notes and in the
  coverage report. An unmeasured area you *state* is unmeasured is a scheduled
  check; one you imply you covered is a hole.
- **Prefer a loud named throw to a plausible guess** on any branch you could not
  reach. A throw carrying the ROM address turns "we never tested this" into a
  precise pointer at the moment it matters. This port already does that, and it
  is what turned a mystery freeze into a one-line diagnosis.

The rule, restated for systems like this:

> Read the listing to learn what the set of behaviours IS. Measure the cartridge
> to learn whether you read it right. Never use measurement to argue that
> something does not exist.

## Worked example — Gradius, measured

The first use of the rule above, and it worked. Full detail in
`docs/worklog/gradius/00-recon-powerups.md`.

**The question was "does rank reach enemy SPAWNS?"** — because behaviour-only is
containable and spawn-affecting is not. Answer: **no**, and note how the two
halves of the answer were established by different tools:

- **Absence, by the listing.** A 6502 call-graph reachability pass from all five
  spawn entry points (`$A335 $A3B1 $A411 $A420 $A466`) found no read of `$17`,
  **with 0 unresolved jumps** — that last number is what makes it a proof rather
  than a survey. A dynamic run could never have closed this.
- **Presence, by the cartridge.** A 3,600-frame script at rank 1 vs rank 4: all
  92 spawn events, nine parameters each, **byte-identical**.
- **And the control that stops it being vacuous.** In that same pair, five other
  sites *did* change (`$BCBE` 0→24, `$BCD8` 20→0, `$BD65` 0→4, `$BDB9` 0→20,
  `$BC44` 38→43). Without that, "no difference" is equally consistent with the
  rank poke never having taken effect.

That third bullet is the part worth copying. **A negative result needs a positive
control in the same run**, or it is indistinguishable from a broken experiment.

**Two other results generalise:**

*The consumer everyone points at was not the live one.* `$17` has **23 readers**,
and the one named in our own plan (`$BBE5`) is **unreachable in stage 1** —
gated behind `$BBBD: LDA $19 / ORA $1A / BEQ`, n=0 in every run. The consumers
that actually matter early are aim (`$BCB5`) and bullet speed
(`$BD5F`/`$BDB3`). Enumerate the readers; do not trust the famous one.

*The threshold-coverage trap is real and was confirmed.* The whole game has only
**three rank thresholds** (`>=2` twice, `>=3` twice). Stage 1 can reach `$17` 0–4,
but **an unforced scenario only reaches 0–1** — so every threshold in the game
sits untested while the corpus looks covered. Exactly the failure this file
predicts. Rank must be forced.

## The loop counter is the same problem wearing a different hat

**Most arcade games of this era loop.** Finish the last stage and you return to
the first, harder — often with a global counter that feeds difficulty exactly
the way rank does. DoDonPachi DaiOuJou's second loop is a headline feature with
entry conditions; Gradius loops too.

So a "stage 1 port" is really a **stage 1, loop 1** port, and the loop counter
is another global parameter that reads as a constant because the corpus never
leaves its starting value. Everything this file says about rank applies to it:
it gates branches, it is invisible until forced, and a scenario set that never
varies it tests one value while appearing to cover the code.

**Gradius, in evidence and not yet proven:** `$19` is the stage. `$1A` is saved
and restored beside it in the per-player checkpoint slots (`$26,X := $19` and
`$28,X := $1A`, read back at `$9B6E`/`$9B72`) — the pairing you would expect of
(stage, loop). It is also half of `$BBBD: LDA $19 / ORA $1A / BEQ`, which gates
a whole enemy-behaviour routine that measured n=0 in every run we have. Both
bytes are **0 on every frame ever recorded here**. Treat "`$1A` is the loop
counter" as a hypothesis to settle, not a fact.

**What that costs when unnoticed:** two stores of 0 into two bytes that are
already 0 are indistinguishable. Swapping them, or deleting both, stays green
across the entire corpus — the port would be wrong in a way no recorded frame
can see, and would surface only when somebody reached a second loop. Gradius's
own suite caught this only because someone poked the bytes to different values
and asserted the two stores land in different places.

**The rule:** for every global that indexes difficulty — rank, stage, loop,
difficulty setting — ask "what value does my corpus hold this at, and what
breaks if I never move it?" Then move it.

## For DaiOuJou specifically

DaiOuJou is understood to have a rank system, and rank is discussed by its
players as a core mechanic rather than a hidden tuning knob. **We have measured
none of it.** Nothing about its inputs, thresholds or effects is written here,
because writing down an unmeasured number is how the "about 54 fps" figure
nearly became a fact (`07-clocks-and-framerates.md`).

What is already decided is the *method*: the MAME oracle can hook execution and
read memory (`games/ddpdoj/NOTES-mame-oracle.md`), so rank is findable the same
way Gradius's player mover was — hook the writes to the candidate byte and see
which PC does it. Do that before porting anything that could read it.

The rehearsal value of Gradius is real here. It is a small machine with a rank
byte, a readable consumer, and an oracle that already runs. Whatever we learn
about instrumenting a feedback loop — how to vary it, how to keep a rank error
from masquerading as fifty unrelated divergences — is learned cheaply there and
spent on the game where it actually decides whether the port is any good.
