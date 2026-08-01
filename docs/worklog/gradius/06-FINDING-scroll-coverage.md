# FINDING — the corpus's real coverage limit is SCROLL DISTANCE

status: DONE -- and the port work is done too, in wave 12.
        See `12-impl-spawn-and-throw-audit.md`: `$A3B1` is ported, and so are
        the two handlers stage 1 reaches through it (`$B098`/`$B026` the aiming
        turret, `$B198` the arc). `deep-page3` now COMPARES 579 frames from 1900
        to 2479, camera $0319 -> $043B, i.e. straight through the $0380 boundary
        this file is about. The standing question at the bottom -- "which
        unported throws are reachable in ordinary play?" -- was answered
        mechanically: `tools/oracle/throwaudit.py`, 79 exec hooks, 27,400
        cartridge frames, and a ranked table in the wave-12 worklog. FIFTEEN
        paths are reachable; the next wall is `$B6E1` at frame 2490 and
        `deep-page4`'s expectThrow now pins it.
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

> **ANSWERED, wave 12.** Of those three: enemy type 6 (`$B198`) is reached at
> frame 2234 and is now ported; `$C413` and the `>= $F0` path were NOT reached
> by 27,400 frames of seven scripts, which is a smaller statement than
> "unreachable" and is recorded as such. And the guess "some are probably
> reachable too" was an understatement — **fifteen** are, including game over
> (`$96FB`, 794 executions from frame 3380, i.e. "lose three lives"), the
> missile crawl path (`$A19E`, 203 executions, which the weapons recon had
> called unexercised on 916 probe calls), and five more handlers of the `$AE1C`
> table. The full table, with what it took to reach each one and an honest "I
> could not reach it, here is what I tried" for the rest, is in
> `12-impl-spawn-and-throw-audit.md`.
>
> **The one number that changes how to think about this:** every unpowered run
> stalled at scroll ~`$04BD`; the run carrying power-ups reached `$0A64` and
> four otherwise-unreached handlers. Power-ups are not a corner case, they are
> how the game is played, and they are what gets a player deep enough to meet
> the code nobody has ported.
