# Clocks and frame rates

**No console runs at 60 Hz.** Every game must declare its own clock, and the number must
be derived from the hardware's actual timing, not rounded to something convenient.

This matters far more once slowdown is a subject of study — see
[`06-lag-and-slowdown.md`](06-lag-and-slowdown.md). **A wrong base rate contaminates every
lag measurement you will ever take**, because the drift is indistinguishable from the thing
you are trying to measure.

## The numbers, derived

| system | frame rate | derivation |
|---|---|---|
| **NES NTSC** (rendering on) | **60.098814 Hz** | PPU 5,369,318.18 Hz ÷ 89,341.5 |
| NES NTSC (rendering off) | 60.098478 Hz | PPU ÷ 89,342 |
| NES PAL | 50.006978 Hz | PPU 5,320,342.4 Hz ÷ 106,392 |
| **Game Boy DMG** | **59.727501 Hz** | 4,194,304 Hz ÷ 70,224 |

### NES NTSC, in full

```
master clock   236250000/11  = 21,477,272.7273 Hz   (exact as a fraction)
PPU            master / 4    =  5,369,318.1818 Hz
CPU            master / 12   =  1,789,772.7273 Hz
frame          262 scanlines x 341 PPU cycles = 89,342 cycles
```

**But not every frame is 89,342 cycles.** With rendering enabled, one PPU cycle is skipped
at the end of the pre-render scanline on **odd frames** — so frames alternate 89,342 /
89,341 and the average is 89,341.5. That is where 60.098814 comes from.

**With rendering disabled the skip does not happen**, so a blanked screen runs at
60.098478 Hz. The difference is tiny (0.00034 Hz) and almost certainly below the threshold
of anything we care about — but *know that it exists* before someone reports a
one-cycle-per-frame mystery. It matters for Gradius specifically because the game blanks
the screen deliberately: `$0D` counts down and gates the PPUMASK write at `$8096`.

## Why exactness matters

**1. It contaminates lag measurement, and that is the important one.**

Assume 60.000 Hz for an NES game that runs at 60.0988 and you accumulate ~0.099 extra
frames every second — **about 6 frames per minute** of phantom drift. Real slowdown in
Gradius is a handful of frames in a dense wave. The error is an order of magnitude larger
than the signal. You would be measuring your own rounding.

**2. Audio tempo and pitch.** Sound drivers tick per frame. A 0.16% rate error is a 0.16%
tempo error, which compounds over a whole track and is audible to anyone who knows it.

**3. Replay and TAS comparison.** Frame-indexed input scripts only line up if both sides
agree what a frame is.

**4. Wall-clock feel.** Small, but free to get right.

### What Batman actually shipped

`FRAME_MS = 1000 / 59.73` — a rounded 59.73 against the true 59.727501.

That is **0.7 µs per frame**, or about **2.5 ms per hour** of play. Genuinely negligible
for a platformer, and not worth changing now that everything is verified against it. But
it is exactly the shortcut that would have been unacceptable in Gradius, and it is the
reason the rule below exists.

## Every game declares its own clock

Do not assume one universal 60 Hz loop. The rate belongs in the game's manifest, spelled
**once**:

```json
{ "display": { "screen": { "w": 256, "h": 240 }, "frameHz": 60.0988 } }
```

Batman keeps its Game Boy clock; Gradius owns the clock whenever someone is in the Gradius
world. Note the smell to avoid: on Batman the rate is currently spelled **twice** —
`src/main.js` and `tools/oracle/headless.mjs`, whose comment already says *"must match
src/main.js"*. A comment asking a human to keep two constants in sync is a bug waiting for
a quiet moment.

## Host clock vs guest clock — a trap specific to this project

The browser paints at 60, 120 or 144 Hz. The guest runs at 60.0988. **These will never
line up**, so the loop uses a fixed timestep and an accumulator.

Measured on Batman: at 59.727501 Hz guest on a 60 Hz host, the accumulator **underruns** —
roughly **one 0-tick displayed frame every 222 frames**, and a 2-tick frame only ever
appears paired with a 0-tick one, so the average logic rate holds.

**Why this matters for the lag work:** a 0-tick displayed frame is, from the outside,
indistinguishable from the game having slowed down. If you are studying slowdown, the
host's own pacing jitter is *noise sitting in exactly the band of your signal*.

So:

- **Never measure slowdown against wall-clock time.** Measure it against the *guest's own
  logic-frame counter*, which is immune to host pacing.
- **Keep the two clocks separate and named** — `videoFrame` and `logicFrame` — in the state
  vector and in the harness. If they can only be told apart by inference, they will be
  confused.
- The oracle runs headless with no host clock at all, which is one more reason the
  authoritative measurements come from there and not from the browser.

## DoDonPachi DaiOuJou — unknown, and it must be read from the hardware

**We do not know DaiOuJou's frame rate and must not guess it.** Cave boards are well known
for running noticeably below 60 Hz, and figures in the mid-to-high 50s circulate for
various Cave titles — but this project's rule is that a number is not a fact until it is
measured, and a rate that is wrong by even a few tenths would poison exactly the slowdown
work DaiOuJou is being attempted for.

The way to get it **exactly**, rather than from a wiki: MAME drivers declare video timing
as a raw pixel clock plus horizontal and vertical totals. The refresh is then

```
refresh = pixel_clock / (htotal * vtotal)
```

So read the driver's `set_raw(...)` (or `set_refresh_hz(...)`) parameters for the exact
machine, and compute it. That is a checkable derivation with a source, which is the
standard everything else here is held to.

Do this **before** any timing work on DaiOuJou, not during.

## The rule

> Derive the rate from the hardware's clock and cycle counts. Put it in the game manifest,
> spell it once, and never round it. If you are studying slowdown, an inexact base rate is
> not a small error — it is larger than your signal.
