# Replay — a requirement for later, with constraints that bind NOW

**Owner's requirement, 2026-07-31: the DaiOuJou port must be able to replay a
recorded game with 100% accuracy.** Implementation comes after the slice. The
*constraints* do not — they are cheap to honour while the skeleton is being
written and expensive to retrofit afterwards.

## Why this is nearly free, if nobody breaks it

Replay accuracy and oracle verification are **the same property wearing two
hats**. The oracle already demands that

> the same initial state + the same input sequence ⇒ the same state, every frame

which is exactly the definition of a deterministic replay. Every scenario in
the Gradius corpus is already a replay: a button script, a seed, and a per-frame
state vector to check it against.

So there is nothing to build yet. There is only something to avoid destroying.

## The five constraints

**1. All state derives from (initial state, input sequence). Nothing else.**
No wall clock, no host frame rate, no `Date.now()`, no `performance.now()`
reaching game logic. The host clock drives *when a frame is presented*, never
*what the frame contains*.

**2. No `Math.random()`. Ever.** The board's RNG is a routine with state in RAM;
port it and seed it from the recorded state. A host RNG is the classic way a
replay desyncs three minutes in and nobody can say why.

**3. Input is sampled once per LOGIC frame, at the same point the board samples
it.** DaiOuJou reads `$C08000` exactly once per logic frame at build A's
`$13D46A` and mirrors it to `$803970`. **Input lead is ZERO** here (measured;
the Game Boy needed one tick, so this is per-machine and never assumed). A
replay stores one input word per logic frame — not per video frame, and not per
host frame.

**4. `logicFrame` and `videoFrame` stay separate and named.** They diverge here
by construction: slowdown means one logic frame can span several video frames
(15 of 1,200 already measured). A replay is indexed by **logic** frames. If the
two can only be told apart by inference, they will be confused, and the replay
will drift exactly where the game is most interesting.

**5. THE ONE THAT WILL ACTUALLY BITE: the slowdown model must be deterministic.**

This is the DaiOuJou-specific hazard and the reason this file exists now rather
than later.

The tempting way to model slowdown is to measure how long the host took to
compute a frame and stretch time accordingly. **That makes every replay
machine-dependent**: the same inputs on a faster laptop produce a different
game, because the slowdown differs. Replays would desync across machines, and —
worse — the port would not be reproducible against itself.

So the work budget must be **counted, not timed**: a deterministic function of
the game's own state (objects processed, sprites emitted, work units consumed),
identical on every machine, with the calibration constant fixed in the build and
not sampled from the host. `NOTES-slowdown-oracle.md` already argues for
exactly this shape on different grounds — one knob, isolated, calibratable
later. Replay determinism is the second, independent reason to build it that
way, and two independent reasons for the same design is usually a sign it is
right.

Note the consequence, and accept it: if the port ever slows down because the
*host* is struggling, that must be visible as dropped presentation, never as a
change to the simulation.

## What the format should carry, when it is built

- the build (VERSION-B vs A — they are different games in one ROM), and the
  port's own version;
- the initial state, or a named start condition;
- one input word per logic frame;
- **a periodic state digest** — a hash of the game state every N logic frames.

That last item is what makes it a *verification* asset rather than a toy. A
replay that desyncs then reports the first logic frame at which it diverged,
which is first-divergence analysis (`docs/knowledge/01`) applied to the port
against itself. Any recorded game becomes a regression test, and a long
superplay becomes the most demanding test in the suite — thousands of frames of
dense patterns, rank changes and slowdown, checked automatically.

## What it is NOT

Not a savestate. Savestates capture a moment; replays capture a history, and
only the history proves the simulation is reproducible. Both are useful — MAME's
savestates already restore DaiOuJou faithfully (27 bytes of dead stack and one
IRQ4 phase byte differ) — but a savestate cannot demonstrate determinism, and a
replay cannot let you skip ahead.
