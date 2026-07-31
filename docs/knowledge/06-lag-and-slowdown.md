# Lag and slowdown

**Read this before designing any harness for a game where timing matters.**

On Batman we declared lag out of scope and tagged it. That was correct *there* and it is
the wrong default for what comes next. The eventual target is **DoDonPachi DaiOuJou**, a
Cave bullet-hell shooter in which **slowdown is a gameplay mechanic, not an artifact** —
dense bullet patterns are survivable *because* the machine slows down, players time
their movement against it, and scoring depends on it. A port with the right logic and the
wrong slowdown is wrong in the way that matters most to the people who care.

Gradius is the rehearsal. Everything we learn about timing there is preparation.

---

## The THREE things all called "lag", which are not the same thing

Getting these confused will produce a port that is wrong in a way no field comparison
catches. Name which one you are dealing with before you model anything. They are not
mutually exclusive: one machine can do (A) to some subsystems and (C) to others.

### A. Dropped updates — "the frame the game gave up on"

The game loop did not finish before the next interrupt. A flag is set, and **specific
subsystems skip that iteration's work entirely**. Other subsystems still run. Time does
not dilate; *work is selectively discarded*.

This is what the Game Boy does, and the NES does the same thing. It is discrete, per
subsystem, and binary: either that driver ran this frame or it did not.

### B. True slowdown — "the whole game runs slower"

The loop misses the display's deadline, so the frame is held and the entire game state
advances **less often in wall-clock time**. Nothing is skipped mid-sequence; everything is
uniformly dilated. A 60 Hz game running at 30 Hz for a stretch is not dropping half its
updates — it is doing all of them, half as often.

This is the arcade case, and it is the one that matters for DaiOuJou.

### C. Partial completion — "the loop got through 19 of 32 objects"

The scheduler walks its object table in order and **runs out of time partway through**.
Objects 0..k update this frame; k+1..31 do not. Next frame it may get further, or less
far.

This is neither of the above and it is the **most consequential of the three**, because it
does not merely change *when* things happen — it changes **which things happen and in what
order**. Bullet timing, which enemy fires first, which death resolves first, whether a
pickup spawns before the slot it needed was taken. Slowdown stops being a presentation
property and becomes a *gameplay* property.

The shape to look for:

```js
for (let slot = 0; slot < objectLimit; slot++) {
  if (!budget.canAfford(costOf(slot))) break;   // <-- the whole question
  updateObject(slot);
}
```

**If a game does this, slowdown cannot be retrofitted.** A port that always updates all 32
slots and then dilates time is not a slower version of the original — it is a *different
game* that happens to run slowly. Find out which of the three you have **before** writing
the object driver, not after.

**Why the difference is load-bearing:** under (A) you must know *which* subsystems skip
and in what order they are gated. Under (C) you must know the per-object cost and the
budget, and the *order of the table becomes semantics*. Under (B) you must know *how long
the work took*, which is a fundamentally harder question — it is cycle accounting, and it presses directly
against this project's founding premise that we write a JS function per ROM routine
rather than emulate. A faithful (B) requires knowing the cost of code we have replaced.
**That tension is real and unsolved; do not let it be discovered late.**

---

## What Batman taught us (case A, fully measured)

The mechanism, exactly:

- The VBlank ISR fires while `$FFE7` is still 0 — meaning the main loop had not finished
  its iteration — and `$065C` sets `$C757`.
- Both the actor driver (`$424D`) and the enemy driver (`$4E39`) then **skip that
  iteration's updates**, doing only their screen tail.
- **Activation still runs.** `$4E27` tests bit 7 *before* the gate. So "the frame was
  dropped" is not uniform even within one driver — part of it still executes.
- The free-running counter alignment **survives**: the loop catches back up within the
  frame, so only the skipped updates are observable, not the counter phase.

Measured frequencies, which are the useful part:

| run | lag frames |
|---|---|
| level 5, 200 frames | **0** |
| level 14, first 800 frames | **1** (at f764) |
| level 14, 1500-frame melee run | **1** (at f1254) |
| level 4, punch-heavy 640 frames | **1** (at f110) |
| level 1, warped water run | **3** (f2, f6, f226) |

So on a Game Boy platformer, lag is *rare* — single frames, minutes apart. That is exactly
why declaring it out of scope was defensible there.

**But every one of those single frames caused a permanent divergence.** The f226 hit
freezes a walker for one frame, after which it runs one frame behind a port that never
lags — forever. One dropped frame at f1254 produced an 18-field "regression" that looked
like a real bug and cost an investigation before it was traced back.

**The lesson to carry:** lag is not noise. It is a discrete, locatable event with
permanent downstream consequences. It is cheap to detect (hook the flag's writer, count
hits) and expensive to misattribute.

### How we handled it, and what to keep

- **Hook the setter and census it.** One hook on `$065C`, count per scenario, print the
  frame numbers. Two minutes of work, and it converted a mystery into a fact repeatedly.
- **Tag, never hide.** `knownLag` annotations mark the affected fields as
  lag-downstream and keep them *visible in the report* rather than trimming the scenario
  to avoid them. A scenario shortened to dodge a lag frame is a scenario that has stopped
  testing the interesting part.
- **Never diagnose a divergence before checking the lag census.** Twice a first
  divergence at frame N turned out to be a lag frame at N−1. This should be the *first*
  question asked of any timing-shaped divergence, not the last.

---

## What Gradius must teach us (see games/gradius/NOTES-lag.md for the plan)

Already measured statically in the ROM (`games/gradius/NOTES-rom.md`):

- **`$04` is the lock.** The NMI at `$806A` reads it at `$8073` and **bails immediately**
  if non-zero; it raises it at `$809F` and clears it at `$80B5`.
- So an NMI arriving while the previous frame's work is unfinished does almost nothing —
  structurally the same as the Game Boy's `$C757`, and it must be measured the same way.

**Do not repeat Batman's default here.** On Batman, lag was tagged out of scope and the
work of characterising it was never done properly. On Gradius, treat it as a **primary
measurement target from the first probe**:

1. **Census it.** Hook the `$04` bail path and the `INC $04` and count. Report lag frames
   per scenario, always, in the standard output — not on request.
2. **Determine exactly what a lag frame skips.** The NMI's bail at `$8073` jumps past OAM
   DMA, the PPU register writes and every `JSR` in the handler. So on a lag frame the
   *display is not updated* — which is visible, unlike the Game Boy case where only
   internal updates were dropped. Confirm this by measurement.
3. **Make lag a COMPARED FIELD in the state vector**, not a diagnostic side-channel. If
   the port cannot reproduce lag, the field will diverge and force an honest decision
   rather than a silent one.
4. **Find out whether Gradius's difficulty depends on it.** Gradius is famous for
   slowdown when the screen fills. If the game is *balanced* around it — and shooters
   generally are — then it has already crossed from artifact to mechanic, and Gradius is a
   better rehearsal for DaiOuJou than it first appears.

---

## What DaiOuJou will demand (case B), and the open problems

**Everything below is a question to be answered by measurement, not a claim.** Cave
hardware and DaiOuJou's specifics have not been verified by this project yet, and this
file must not become a place where guesses acquire authority. What follows is the shape of
the problem and the decisions it forces.

### The premise is under strain, and that is the headline

Our method is: translate each ROM routine into a JS function we own, and verify against an
emulator running the original. That works because we only ever had to match **what** the
code computed, never **how long it took**.

Faithful slowdown requires matching how long it took. A JS function does not take the same
time as the 68000 code it replaces, and no amount of care makes it. So slowdown cannot
come from our port running out of time — it has to be **modelled**: something must decide
"this frame would have overrun" and dilate accordingly.

That is a different kind of fidelity and it needs its own design. Candidates, none
validated:

- **Cost accounting.** Each routine carries a measured cost (cycles, or a proxy such as
  active object count), the frame sums them, and the loop dilates when the sum exceeds
  budget. Requires knowing the real cost of every routine — expensive, but it is the only
  option that is *predictive* rather than recorded.
- **A measured slowdown oracle.** Record, from the real hardware, which frames slowed and
  by how much, for a corpus of inputs — then verify the port's model against that. This
  does not produce slowdown; it *checks* a model that does.
- **Object-count heuristic.** Slowdown in these games tracks sprite and bullet counts
  closely. A fitted function of on-screen object count may reproduce it within tolerance.
  Cheap and probably close — but it is a *fit*, not a translation, and it should be
  labelled as such rather than dressed up as fidelity.

### Questions to answer before any DaiOuJou work starts

1. **What hardware is it, exactly, and what does MAME expose for it?** The oracle needs
   execution hooks, memory access, deterministic headless stepping and a readable
   framebuffer (`01-the-oracle-method.md`). MAME has a Lua API and can run without video;
   whether it gives all four for this driver is unverified.
2. **Is the slowdown deterministic?** If the same inputs produce the same slowdown on the
   same board, it can be verified frame-exactly. If it depends on anything analogue, the
   whole verification strategy changes.
3. **What is the granularity?** Whole frames held, or something finer?
4. **Does the game's own logic observe it?** If any counter or RNG advances per *loop
   iteration* rather than per frame, slowdown changes game state and not just its pace —
   which would make it impossible to bolt on afterwards.
5. **Is there a per-object update budget** that gets truncated under load, i.e. is there
   case-A behaviour hiding inside the case-B slowdown?

### The one thing to decide early

**Whether "faithful" includes slowdown, and to what tolerance.** For a Cave shooter the
honest answer is almost certainly yes — but say it out loud, write it into the project's
definition of done, and design the harness around it. Retrofitting timing fidelity onto a
port built without it is a rewrite, not a fix.

---

## Instrument the signals separately — one flag is not enough

**Do not trust an emulator's generic "lag frame" flag.** A game can poll input, advance
music and update *some* state on a frame its main logic did not complete. One boolean
cannot distinguish (A), (B) and (C), and the flag is usually the emulator's opinion about
the CPU, not the game's opinion about its own work.

Instrument these **separately**, per frame, and compare them as distinct fields:

| signal | what it answers |
|---|---|
| video frame advanced | did the display change |
| input sampled | did the game read the controller |
| main logic advanced | did the top-level update run at all |
| script / scheduler advanced | did stage or wave logic step |
| player advanced | did the player object update |
| **object slots processed: 0..N** | **how far down the table did it get** — the (C) detector |
| sprites prepared / OAM written | did the display list get rebuilt |
| audio advanced | did the sound driver step |

The object-slot count is the one most likely to be missing from any tooling you inherit,
and it is the one that distinguishes the model that can be retrofitted from the model that
cannot. **Get it into the state vector before the port has an object driver.**

Track both the *emulator's* frame number and one or more counters **inside the game's own
loop**. When those two disagree, that disagreement is the measurement you want.

## Two emulators disagreed about a lag frame, and that is the whole problem in miniature

The single most important measurement taken while preparing for DaiOuJou, and it was an
accident. Gradius was run under **Mesen** and **MAME** with the same input, both hooking
the same address and emitting the same per-NMI digest.

**They were byte-identical for NMIs 1 through 388.** At 389, Mesen delivers one NMI that
MAME does not. After skipping it, the sequences realign exactly for all 110 remaining
samples — so **the game's computation never diverges**. The extra NMI has the frame lock
already set on entry and a stack pointer 13 bytes deeper than usual: it is the re-entrant
NMI that hits the lock test and bails. **A lag frame — the first one in the run.**

So: two respected emulators, in perfect agreement about every value the game computes, and
in disagreement about **whether a lag frame happened at all**. That is precisely the signal
DaiOuJou depends on.

**What this means for method:**

1. **When the thing you are measuring IS the timing, one emulator is not a reference.**
   Cross-validate. Two independent implementations agreeing is evidence; one asserted to be
   accurate is an assumption.
2. **Verify computation and delivery separately.** The digests agreeing proves the game's
   logic matches. It says nothing about whether the interrupt arrived. Those are different
   claims and a single comparison conflates them.
3. **A realignment that works is itself data.** "Skip one event and everything after lines
   up" localises the disagreement to exactly one frame, which is far more useful than a
   divergence count.

## What MAME can and cannot see, measured

Established while proving MAME viable as the DaiOuJou oracle. Useful for any machine:

- **Per-frame CPU cycles: yes**, two independent ways that agree to a constant 4 cycles —
  the debugger's `totalcycles` expression, and `machine.time` read inside a callback (which
  needs no debugger at all).
- **Execution hooks: yes**, and via an unobvious route — `install_read_tap()` fires on
  **opcode fetches**, so a read tap is an execution hook. Distinguish a fetch from a data
  read by comparing the current PC against the tapped address.
- **A game-agnostic frame detector: yes.** A tap on the CPU's **interrupt vector fetch**
  fires exactly once per dispatched interrupt, with no knowledge of the game's code.
- **Instrumentation is non-perturbing:** 10.4 million tap callbacks changed the cycle count
  by **exactly zero**.
- **The duplicate-framebuffer test is NOT a slowdown detector.** Measured over 2,400
  frames: **518 duplicate frames against 4 real overrun events, and it missed 2 of the 4.**
  A game can redraw an identical picture while advancing perfectly well, and can overrun
  while the picture changes. If you were planning to detect slowdown by comparing
  consecutive framebuffers — and it is the obvious first idea — this is the measurement
  that says don't.

## The rules, distilled

1. **Decide which of the THREE kinds you have — dropped updates, partial completion, or
   time dilation — before modelling anything.** Partial completion changes outcomes, not
   just pace, and cannot be retrofitted.
2. **Census it from day one.** Hook the flag, count per scenario, print it always.
3. **Never diagnose a timing-shaped divergence without checking the lag census first.**
4. **Tag, do not hide.** A scenario trimmed to avoid a lag frame has stopped testing the
   thing that mattered.
5. **A single dropped frame diverges permanently.** Treat it as a discrete event with
   downstream consequences, not as noise.
6. **Never model slowdown as a global speed multiplier.** `gameSpeed = 0.7` makes
   everything uniformly sluggish and reproduces none of the three mechanisms.
7. **Instrument the signals separately.** One "lag frame" boolean cannot tell them apart.
8. **If slowdown is a mechanic, it is a requirement** — and it must be in the state
   vector, in the definition of done, and in the harness design from the start.
