# REFERENCE — arcade video sources for LAG / SLOWDOWN verification

owner-supplied, 2026-08-05. Not a wave. Written down so the lag work does not
have to rediscover it.

## THE SOURCES

- **Shmups Wiki video index for DoDonPachi DaiOuJou** —
  `https://www.shmups.wiki/library/DoDonPachi_DaiOuJou/Video_Index`
  The index rather than any single video: it is the durable entry point.
- Two specific runs the owner was pointed at, both 2-ALL (two-loop) clears:
  `https://www.youtube.com/watch?v=qqTQv8JFHc4`
  `https://www.youtube.com/watch?v=tf80ItLp11A` (a PAN 2-ALL video)

## WHY THESE EXIST IN THE PLAN AT ALL

The owner's standing position on lag, from earlier in the project:

> "Just know that mame lag for this board is not accurate... I don't know how it
> is wrong, but the hardware produces a unique kind. The M2 port for the PS4 does
> it right."

and, on how to attack it:

> "Only possible way to find more about lag would be showing you a youtube video
> and comparing at intervals... Since it's an autoscroller it could be possible
> to compare frames."

and:

> "for when we're done we might start comparing with arcade video to make sure
> slowdown works"

So: **MAME is authoritative for WHAT the game computes and NOT for WHEN.** That
is already in `docs/knowledge/06-lag-and-slowdown.md` (the three mechanisms:
dropped updates, time dilation, partial completion). Video of real hardware is
the only external evidence we have for the WHEN.

## WHAT A VIDEO CAN AND CANNOT PROVE — settle this before trusting one

Do not skip this section when the lag wave starts. A recording is not a probe,
and treating it as one would be the same error as reading `RUNNABLE` as "this
stage plays".

**Against it:**
- The board runs at **59.185606 Hz**, not 60. A 60 fps upload has already
  resampled. Frame-for-frame identity is not available.
- Video is re-encoded, possibly deinterlaced, possibly frame-blended.
- A player's inputs are unknown, so the run is not reproducible on our side.
- Slowdown depends on what is on screen, which depends on the route taken.

**For it, and this is the part that makes it worth doing:**
- **The stage is an autoscroller.** The camera's position over time is a
  function the port computes independently. So the useful comparison is not
  frame-vs-frame but **elapsed real time between two fixed scroll landmarks**.
  Cumulative drift over a whole stage is large enough to survive resampling.
- Landmarks already measured on our side and usable as anchors: the midboss
  crawl (`SPEED $0008` at distance clock `$00E7`, restored at `$00F0`, 576
  frames unconditional), the midboss death speed-up (measured 156 frames of
  crawl when killed versus 576), and the stage-1 end at logic frame 19,217.
- If the port and the video agree on wall-clock time between landmarks but the
  port disagrees with MAME, that is evidence MAME's lag model is what is wrong
  — which is exactly the owner's claim, and it has never been tested.

## SEQUENCING

**Lag is not next.** Current priority is stage 1 feature-complete and
oracle-clean (`39-OWNER-visible-play-before-sound.md`), then sound
(`27-OWNER-sound-queued-after-stage-1.md`). This file exists so that when lag
does come up, nobody has to go looking for sources or re-derive what a video is
good for.

One thing to do EARLY when that wave starts: pick the landmark pairs and
measure them on our side FIRST, before watching any video. A measurement taken
after seeing the target is not independent.

## OWNER CALIBRATION DATUM — MAME at ~50% speed

owner, 2026-08-05:

> "Mame running at 50% speed or so should gets closest to real slowdown"

This is the most concrete thing anyone has said about the size of the gap, and
it should be recorded before it is acted on, because **it is a calibration
observation, not a mechanism.**

**What it suggests:** under load, the real board effectively delivers roughly
HALF the game-frames MAME does. That is a factor-of-two discrepancy, which is
large — large enough to be a structural difference rather than a tuning error.
Candidates worth separating when the lag wave runs:

- MAME's emulated CPU completes more work per frame than the board does (the
  documented figure is 337,920 cycles/frame at 15625/264 = 59.185606 Hz).
- The board drops or dilates differently — `docs/knowledge/06` names THREE
  mechanisms (dropped updates, time dilation, partial completion) and they are
  not interchangeable. Halving throughput reproduces the RATE of only one.
- Something in the sprite/DMA path stalls the board in a way MAME does not model.

**THE TRAP, and it is this project's oldest one.** Matching the RATE is not
matching the MECHANISM. If slowdown gets "ported" by scaling a clock until the
game feels right, the result is a screen that looks correct and is sourced from
a fudge — exactly the failure the capture-replay enemies were, and exactly what
`docs/knowledge/10` exists to prevent. A halving factor tuned to taste would
pass every gate we own and be wrong in every route the owner plays.

**So use this datum as a TARGET TO EXPLAIN, not a constant to apply.** The
question it poses is "what does the board do that costs it half its frames under
load", and the answer has to come out of the listing and the hardware, the same
way `$CA5E`'s 1/256-px borrow did — where the obvious fix measured wrong and the
real cause was a carry not propagating through an RTS.

If the mechanism turns out genuinely unreachable from the ROM, then a calibrated
factor is a legitimate LAST resort — but it must be declared as a deviation in
the worklog, the way W62 declared its two invented state exits, and never
presented as a port of the board's behaviour.
