# FINDING — the corpus's real coverage limit is SCROLL DISTANCE

status: DONE (finding recorded; deliberately NOT fixed — owner said keep to the plan)
role: bug report from play   found: 2026-07-31

## What happened

Second crash-from-play tonight. Flying around stage 1:

```
Error: wave cmd $00 < $80: the single-enemy spawn at $A3B1 is not ported.
Stage 1 chunks 0 and 1 are all cmd >= $80 up to scroll $0380
(measured allocP_try = 0)
    at fireWave (enemies.js:338) ... at tick (main.js:167)
```

Shown ON THE PAGE, not just the console — the `onError` channel added after the
first crash is working.

## Why this is the more useful of the two crashes

`$A3B1` was **named this morning** as one of five paths resting on the reasoning
"no measured run has exercised them". The first crash (`$BC59`, enemy bullets)
falsified that reasoning once; this falsifies it twice, in one evening, on a
different path. It is not an occasional slip. It is systematic.

**But the throw carries its own diagnosis, and that is the finding:**

> `Stage 1 chunks 0 and 1 are all cmd >= $80 UP TO SCROLL $0380`

The implementer measured a boundary and wrote it into the message. Below scroll
`$0380` every wave command is `>= $80`; past it, chunk 2 begins and `cmd $00`
appears. So the gap is not random and it is not really about `$A3B1`.

**THE CORPUS'S COVERAGE LIMIT IS SCROLL DISTANCE.** Scenarios run ~240 frames
from align 400 at ~0.5 px/frame — roughly 120 px of scroll. Everything gated
behind further scroll is unexercised, and *looks* covered because the scenarios
that do run are green.

Both of tonight's crashes are the same shape: **code reachable by playing longer
or further than any scenario runs.** Neither needed an exotic state. One needed
the ship to the left of an enemy; this one needed thirty seconds of scrolling.

## What this changes

Nothing is being fixed now — the owner's call, and the right one: `$A3B1` is one
path and the class is what matters.

**The systemic fix is already scheduled**: `09-DECIDED-seed-anywhere.md`. Seeding
the port at an arbitrary cartridge frame is exactly what makes chunk 2+ testable,
because it lets a scenario START at a scroll position instead of driving there.
That wave was argued for as the route to the boss and the end of stage 1. Its
real value is larger: **it is the only way the second half of stage 1 gets
verified at all.**

Until then, the honest statement of coverage is not "21 scenarios, 5726 frames,
0 failures". It is that, PLUS: *nothing past scroll ≈ $0380 has ever been
compared, and the throws are what stands between that and a wrong picture.*

## The standing question this makes concrete

Raised after the first crash and now worth doing mechanically rather than by
argument:

> **Which unported throws are reachable in ordinary play, as opposed to under our
> scripts?**

Answerable without guessing: drive the cartridge with long, varied input, record
which throws the port *would* have hit, and rank them. Three throws remain on the
falsified reasoning (`$C413` stage-advance arms, enemy type 6 `$B198`, the
`>= $F0` inline-record path). Some are probably reachable too.
