# Gradius: the lag investigation

**This is the reason Gradius is being done at all.** The logic is smaller and simpler than
Batman's; what it uniquely provides is a machine small enough to pin hardware-shaped time
to the table and dissect it. DoDonPachi DaiOuJou depends on that skill, and DaiOuJou is
too big to learn it on.

Read `docs/knowledge/06-lag-and-slowdown.md` first for the three models. This file is the
concrete plan for deciding **which of them Gradius actually does**.

---

## The question, stated precisely

Not "does Gradius slow down" — it visibly does, and TAS documentation describes severe lag
in parts of Stage 5, notes that **Options affect the amount of lag**, and describes route
decisions made partly to manipulate it. The question is **what the cartridge does when it
runs out of time**:

- **(A) dropped updates** — the frame is abandoned, specific subsystems skip entirely;
- **(B) time dilation** — everything advances, just less often;
- **(C) partial completion** — the object loop gets through *k* of 32 slots and stops.

**(C) is the one that cannot be retrofitted**, because it changes *which* objects act and
in what order — bullet timing, which enemy fires, which death resolves first. A port that
always updates all 32 slots and then runs slower is a different game.

Gradius may do more than one: (A) at the NMI and (C) inside the object loop is entirely
plausible, and would be the most instructive possible outcome for DaiOuJou.

## What is already measured (ours, from the ROM)

From `NOTES-rom.md`, read out of the PRG:

- **`$04` is the frame lock.** NMI at `$806A` reads it at `$8073` and **bails** if
  non-zero; raises at `$809F`; clears at `$80B5`.
- The bail at `$8073` jumps past **OAM DMA, the PPU register writes, and every `JSR` in
  the handler**. So on a locked frame the display list is not rebuilt — meaning **an NES
  lag frame here is visible**, unlike the Game Boy where only internal updates were
  dropped.
- Zero page in use: `$04` lock, `$0D` blank countdown, `$10` PPUCTRL shadow, `$11` PPUMASK
  shadow, `$15`/`$5B` mode gates.

That establishes (A) exists. It says **nothing** about (C), and (C) is the prize.

## Unverified leads — treat as hypotheses, not facts

These come from third-party FCEUX work on Gradius, **not from our own measurement**. This
project's rule is that a number is not a fact until we have measured it, so every one of
these is a hypothesis to confirm as the first use of the probe:

| lead | claim |
|---|---|
| object status | `$0100 + slot` |
| object type | `$0300 + slot` |
| object Y | `$0320 + slot` |
| object X | `$0360 + slot` |
| slot count | 32 |
| slot 0 | Vic Viper |
| also mapped | lives, speed, missiles, weapon, Options, shield, power meter |
| position history | buffers used by the Options |

**One of these deserves suspicion immediately.** `$0100-$01FF` is the **6502 stack page**.
An object status array at `$0100 + slot` would occupy `$0100-$011F` while the stack grows
*down* from `$01FF` — which is a real and known NES technique when stack depth is shallow,
but it is also exactly the kind of claim that is repeated because it was written down once.
**Verify it by watching writes**, and while doing so, measure the actual maximum stack
depth; if the game ever pushes deep enough to reach `$011F`, something is wrong with either
the claim or our understanding.

If the parallel-array layout is confirmed, it is very good news: the object system is
**data, not code**, which is the shape that makes both the port and the (C) investigation
tractable.

## The instrumentation — a timing microscope, not a lag flag

**Do not trust an emulator's "lag frame" flag.** It is the emulator's opinion about the
CPU, not the game's opinion about its own work, and a game can poll input and advance
music on a frame whose main logic did not complete.

Record these **separately, every frame**, and carry them as compared fields:

| signal | how to get it |
|---|---|
| emulator frame number | the emulator's own counter |
| `$04` state at NMI entry | hook `$8073`, read before the branch |
| NMI took the bail | hook `$8075`, record whether it branched to `$80B7` |
| OAM DMA ran | hook `$8087` |
| input sampled | hook `$81BF` (called from NMI at `$80A4`) |
| PPUMASK actually written | hook `$8096`, record the value |
| **object slots processed** | **hook the object loop body and count iterations per frame** |
| main-loop iterations completed | an in-game counter, once located |
| audio driver stepped | hook the sound routine once located |

**The object-slot count is the (C) detector and it is the single most important number in
this document.** If it is 32 every frame, Gradius is not doing (C). If it varies with load,
it is — and that changes the port's architecture.

Track the emulator's frame number **and** an in-game counter. Where they disagree is the
measurement.

## The controlled experiments

Gradius is small enough to run genuinely controlled experiments, which is the whole reason
it is the right rehearsal. Each of these is a scenario for the corpus, not a one-off:

1. **Idle baseline.** Sit still on Stage 1 with nothing on screen. Establishes the
   zero-load signal set.
2. **Options 0 vs 4.** TAS notes Options change the lag. Same route, same inputs,
   different Option count — diff the signal set. This is the cleanest available
   load-vs-lag experiment because everything else is held constant.
3. **Empty screen vs full wave.** Same position, with and without an enemy wave present.
4. **Maximum projectile load.** Fire continuously with the highest-load weapon.
5. **Deliberately fill every object slot**, then try to spawn one more. This answers a
   separate but adjacent question: **what does the cartridge do when allocation fails?**
   No enemy? No bullet? No explosion? That behaviour is gameplay and must be preserved.
6. **Stage 5.** Where the TAS documentation reports severe lag. The natural stress case.
7. **Rendering disabled, logic preserved** (via PPUMASK) if the harness can do it — it
   separates "the PPU ran out of time" from "the CPU ran out of time".

For each: the full signal set, per frame, plus the object-slot count. Then answer:

> Does slowdown here correlate with object count, sprite count, collision work, or specific
> routines — and does it drop whole frames, or truncate the object loop?

## What this feeds

**The port's object driver cannot be written until this is answered.** If Gradius does
(C), the driver needs a budget and an early exit from day one; bolting it on later means
rewriting every enemy that assumed it always ran.

The deliverable is a *model* with a falsifiable check, not a feeling:

```js
// Whatever shape this takes, it must be VERIFIABLE against the recorded signal set:
// for scenario S, frame F, the model must predict the same slots-processed count
// the cartridge produced.
```

And the anti-pattern to name explicitly, because it is the obvious wrong answer:

```js
gameSpeed = 0.7;   // NO. Reproduces none of the three mechanisms.
```

## Why this is the DaiOuJou rehearsal

You cannot copy Gradius's slowdown *model* to DaiOuJou — an NES CPU and a Cave board fail
under load in different ways. What transfers is everything else:

- the separation of video clock from logic clock;
- work-budget instrumentation as a first-class harness feature;
- object-update tracing at slot granularity;
- first-divergence analysis that reports *events*, not byte counts;
- replay stability across slowdown;
- and most of all, having already rejected the assumption that **one rendered frame equals
  one complete game update**.

Batman taught semantic reconstruction. Gradius teaches hardware-shaped time. DaiOuJou needs
both.
