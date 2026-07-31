# Knowledge base — how to port a console game from its disassembly

This folder is the **transferable** part of what Batman: Return of the Joker taught
us. It is deliberately not about Batman. Phase 2 is Gradius on the NES, a different
CPU, a different PPU and a different emulator, and the point of this folder is that
most of what cost us time was **not** Game Boy knowledge — it was method.

Read these before starting a new port. They are ordered by how much they will save you.

| file | what it carries |
|---|---|
| [`01-the-oracle-method.md`](01-the-oracle-method.md) | the whole approach: run the real ROM as a reference and diff against it. Transfers wholesale. |
| [`02-traps.md`](02-traps.md) | the eight failure shapes that actually bit us, generalised. Transfers wholesale. |
| [`03-checks-that-can-fail.md`](03-checks-that-can-fail.md) | how to build a check that is worth having. Transfers wholesale. |
| [`04-platform-gameboy.md`](04-platform-gameboy.md) | DMG hardware facts we had to learn the hard way, each paired with the NES question it implies. Partly transfers. |
| [`05-process.md`](05-process.md) | repo, gate and multi-agent working rules. Transfers wholesale. |
| [`06-lag-and-slowdown.md`](06-lag-and-slowdown.md) | **read before designing any harness.** The THREE things called "lag", why one of them is a gameplay mechanic, and why one of them cannot be retrofitted. |
| [`07-clocks-and-framerates.md`](07-clocks-and-framerates.md) | no console runs at 60 Hz. Exact rates, and why a rounded one is larger than your slowdown signal. |
| [`08-rank-and-dynamic-difficulty.md`](08-rank-and-dynamic-difficulty.md) | when the game watches the player back. Why a feedback loop breaks subsystem separation and first-divergence analysis — and the one place measurement is the WRONG tool. |

## What transfers to Gradius, and what does not

**Transfers completely — this is most of the value:**

- The oracle method itself. An emulator with execution hooks, a per-frame state vector,
  a field-by-field diff, and a corpus of scripted scenarios kept as permanent tests.
- The trap taxonomy. Fall-through, byte-exact-but-wrong, measurement artifacts, and the
  four ways a check can be green while the game is broken.
- The verification discipline: a new check must be **seen to fail**.
- The layering: unit tests → data integrity → state trace → **pixels**. Each layer
  catches a class the others structurally cannot.
- The habit of citing the ROM address on every non-obvious line. It is what lets a
  second person check the work without re-deriving it.

**Does not transfer — expect to redo it:**

- The renderer. DMG is 160×144, 4 shades, BG/window/OBJ with 8×8 or 8×16 sprites and
  three palette registers. The NES is 256×240, a completely different PPU with
  attribute tables, sprite 0 hit and a 64-entry OAM.
- The sound driver. Different APU entirely.
- Every ROM address, table layout and routine.
- PyBoy. You need an NES emulator with the same three capabilities — see
  `01-the-oracle-method.md` § "What the emulator must give you".

**Transfers as a question, not an answer** — the DMG rules in
[`04-platform-gameboy.md`](04-platform-gameboy.md) each have an NES counterpart that is
*different but analogous*. Sprite-per-line limits, sprite priority, OAM coordinate
widths, mid-frame register writes, free-running counters, lag frames. Do not assume the
NES answer; go and measure it the same way. But **do** assume each of these categories
exists and will bite you, because every one of them cost us real work on the Game Boy.

## Where this is going

Phase 1 was Batman (Game Boy). Phase 2 is Gradius (NES). The target after that is
**DoDonPachi DaiOuJou**, a Cave bullet-hell shooter — and it changes one of the rules in
this folder. On Batman we declared lag frames out of scope, correctly: they were single
frames, minutes apart, on a platformer. In a Cave shooter **slowdown is a gameplay
mechanic** — dense patterns are survivable because the machine slows down, and players
time their movement against it.

So [`06-lag-and-slowdown.md`](06-lag-and-slowdown.md) is not an appendix. It is the file
that says which of this folder's defaults stop applying, and it presses on the founding
premise: we translate *what* a routine computes, never *how long it took*, and faithful
slowdown needs the second one. Read it before designing a harness for anything where
timing is visible to the player.

## The one-line version

> The port is not the hard part. Knowing whether the port is right is the hard part,
> and a check you have never seen fail is not knowing.
