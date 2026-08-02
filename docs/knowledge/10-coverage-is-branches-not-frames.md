# Coverage is branches, not frames — and why transcription beats agreement

> **"Our tests will still be useful, but they can't be our source of truth.
> They are verification."** — the owner, 2026-08-02
>
> **The ROM is the source of truth. The tests are verification.** Everything
> below is a consequence of that one sentence.
>
> It follows that a FAILING test and a PASSING test are not the same currency.
> A failure is strong evidence — the transcription is wrong on that path, and
> the first divergence points at it. A pass is weak — that path matched.
> We have been reporting the passes.
>
> And when they disagree, **the listing wins**. A green test against a wrong
> transcription means the test is broken, usually because its scenario never
> exercises the branch. That has happened SEVEN times on this project, and every
> time the instinct to trust the green number was the expensive one.

**Owner, 2026-08-02, on DaiOuJou:**

> "The routing is a human thing, you won't be able to reconstruct what the routes
> are even supposed to be, so we have to try to be technically perfect. You just
> had the luxury of being able to test the aiming, but lots of other stuff will
> have to be ROM exact and won't be testable, because every different new move
> you make would change the outcome. Just because one or two runs through fit
> what you think the truth is doesn't mean a human won't come in, move down to
> the left a bit and ruin all the spawn logic."

## The unit we have been reporting is the wrong one

"42 scenarios, 14,098 frames, 0 divergent" sounds like coverage and is not. A
frame count says **nothing about which branches executed**. Two runs of 7,000
frames down the same corridor of the state space are one path measured twice.

And in this game the state space is *player-controlled*. Aim reads player
position; spawn logic and pattern parameters read game state the player steers.
So the reachable-state graph is not something a scripted corpus can sample
representatively — it is not even something we can enumerate. **Every passing
comparison is a statement about the paths we walked, and the set of paths a human
can walk is unbounded.**

The turret result was genuinely strong, and it is worth understanding WHY, so we
do not mistake it for the normal case: a turret consumes the aim function
*continuously, every frame*, so 6,000 frames of a moving ship sweeps a large
slice of that function's input space. Aiming is a pure function with a small
input space and a visible output. **Almost nothing else in the game is like
that.** It was luck, not method.

## So the guarantee has to come from transcription, not agreement

If we cannot sample the behaviour space, correctness has to rest on the code
being *the same code*:

- **every branch transcribed**, including the ones no run has taken;
- **every table entry exported**, not the entries some scenario indexed;
- **every order preserved** — within the frame as well as across it;
- **every unported path a loud named throw**, so an unwalked path announces
  itself the first time a human walks it rather than doing something plausible.

That is why `09-enumerate-then-validate.md` exists, and this file is its
consequence: enumeration is not merely *cheaper* than discovery-by-measurement,
it is the **only** thing that can cover a space measurement cannot reach.

The oracle's job shrinks accordingly, and should be stated honestly: it proves
our transcription of a path is right **where a run walks that path**. It cannot
tell us the transcription is complete. Only the listing can.

## What to measure instead of frames

1. **Branch coverage against the ROM.** For each ported routine: how many of its
   branches has any run taken? A routine with an untaken branch is a
   transcription we have never checked. Report `branches taken / branches
   present`, per routine, as the corpus's real coverage number.
2. **Table-entry coverage.** How many of the 42 dispatch entries, 121
   descriptors, 39 bullet kinds, 113 enemy records has any run touched? Report
   the fraction. It will be small and that is the point.
3. **Many short runs from many seeds, not a few long ones.** Chaos is the enemy
   of debugging: a divergence found at frame 6,000 is unusable because
   everything after the first difference is consequence. Short randomised runs
   from varied seed states cover more branches per token AND give a tractable
   first divergence. Long runs are for endurance, not coverage.
4. **Differential fuzzing.** Random input sequences driven into board and port
   together, compared per frame, with the seed recorded. This is the only cheap
   way to explore the space a human explores. A divergence found this way is a
   reproducible bug report; a thousand passes are worth less than one failure.
5. **Structural checks.** Does every `jsr`/`jmp` target in a ported routine
   correspond to something in the port? Does every table the port indexes exist
   in the export, and at full extent? Those questions are answerable statically
   and completely, and they caught real defects in Gradius W21 twice.

## The failure this is guarding against

A human moves down and to the left, some spawn or aim branch we never walked
takes its other arm, and the port does something plausible instead of something
correct. **No frame count we could have reported would have predicted it.** The
only defences are that the branch was transcribed from the listing, or that it
throws with its ROM address.

Neither defence comes from running the game more.

## The honest sentence to use in reports

Not "verified over 14,098 frames". Instead:

> N of M branches in the ported routines have been executed by some run and
> matched the board; the remaining M−N are transcribed but unexercised; K paths
> are unported and throw.

That sentence is harder to write and impossible to misread.
