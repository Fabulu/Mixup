# The oracle method

The single decision that made this project work: **an emulator runs the real ROM
headless, and we diff our port's state against it frame by frame.** It never ships. It
exists so that "faithful" is a checkable property rather than an opinion.

Everything else here is detail. If you take one thing to the next port, take this.

## Why it matters more than it sounds

Without a reference you are reading a disassembly and believing yourself. That is not a
small risk - on this project, reading the listing carefully and *still being wrong* was
the single most common failure, nine separate times. The listing tells you what the
instructions are. It does not tell you which arm actually executes, what the hardware
does with the result, or what the previous frame left behind.

Two examples worth internalising, both from `docs/03-VERIFICATION.md`:

- The metasprite index looked like `facing XOR 1` in the listing. It is `facing`. That
  arm simply is not the one the walk path takes. Taking the listing at face value drew
  the player mirrored **for his entire run** and cost ~276 wrong pixels a frame - and no
  gameplay field was affected, so only a pixel comparison could ever have caught it.
- A routine that ends in `RET` may never be reached, because the routine above it falls
  through into a different tail.

## What the emulator must give you

Pick your reference emulator on these three capabilities, not on popularity:

1. **Execution hooks** - "call me when the CPU executes address X (in bank B)". This is
   the load-bearing one. It buys you: sampling at a stable point, attributing a write to
   the routine that made it, counting how many times an arm ran, and reading CPU
   registers at the moment of a call. Half the hard bugs here were solved by hooking one
   address and reading one register.
2. **Direct memory access** - read and write RAM/VRAM/OAM at will, mid-run.
3. **Deterministic stepping and a framebuffer you can read.** Plus save/load state if you
   can get it - it makes per-level setup enormously cheaper.

PyBoy gave us all of this via `pyboy.hook_register(bank, addr, cb, ctx)`. For the NES,
evaluate candidates against the same list before writing a line of port code. If your
emulator cannot hook execution, you will be reduced to comparing end states, and most of
what is in `02-traps.md` will be invisible to you.

## Sample at a stable point in the game's own loop

**Do not sample at the emulator's tick boundary.** A hardware frame does not line up with
the game's main-loop iteration. Sampling on tick boundaries slices the loop mid-body, so
some samples contain two executions of a routine and some contain none.

We chased a "camera impurity" for a long time that was purely this. The fix was to sample
at the main loop's own VBlank-wait call, at which point the player fields are
post-update and the camera holds this iteration's output - exactly the pair one tick of
our port produces.

**Rule:** find the instruction in the game's main loop where a frame is unambiguously
"finished", hook it, and sample there. When one field refuses to converge while
everything around it is perfect, **suspect the measurement before the port**.

## Input has a lead

The game reads the joypad in its VBlank interrupt, and the main loop that consumes it
runs immediately after - i.e. during the emulator's *next* tick. So buttons must be held
**one tick early** for the real machine to act on them on the same numbered frame as your
port. Get this wrong and every input response reads as a one-frame divergence, which
drowns out the real bugs.

Expect an analogous offset on any console. Measure it once, encode it in the harness, and
document it where the harness is written.

## Corpus: a recorded playtest is a permanent test

Every behaviour worth protecting becomes a scripted scenario: a level, a frame count, a
button script, and the set of fields to compare. Ours grew to 50 scenarios over 14,519
frames.

Practical points that took a while to learn:

- **Late content is unreachable from a script.** Add injection flags to *both* harnesses
  so they stay comparable - we have `--warp COL[,ROW]` to place the player and `--ammo N`
  to grant items. Apply them at the *same* point on both sides or every warped scenario
  sits permanently one frame skewed.
- **Report the FIRST divergence per field**, plus a window around the earliest. That
  frame is the bug; everything after it is consequence.
- **Annotate known-unfixable divergence rather than deleting the scenario.** We use
  `knownFail` (a diagnosed but unfixed port bug: allowed to diverge, and an unexpected
  *pass* fails the run so nobody forgets to delete the annotation) and `knownLag` (a real
  emulator-timing artifact, tagged and visible, never hidden).
- **Scale coverage to the content, not to the file.** Eight frames out of 4,137 is not
  coverage of a 69-second sequence; it is a spot check that will be quoted as proof.

## Layer the checks - each layer catches what the others cannot

Cheapest first, so a bad constant is reported before anything spends a minute inside an
emulator:

| layer | proves | blind to |
|---|---|---|
| unit tests | one routine's logic in isolation | ordering, integration, anything visual |
| data integrity | the extracted assets are what the game loads | code that misuses correct data |
| state trace | the port's variables match the ROM's, frame by frame | anything not in the compared field list - especially *drawing* |
| **pixels** | what a player actually sees | nothing, but it is slow and hard to attribute |

The pixel layer is not optional. We had a screen match the cartridge's VRAM **byte for
byte** and render wrong, because nothing drew its sprites. VRAM comparison structurally
cannot see that. Add the pixel layer before you think you need it.

## Function-level fixtures

Hooking a routine's entry and exit and snapshotting state at each gives you real
(pre-state → post-state) pairs from actual gameplay, as generated unit tests. That proves
a routine exact without needing the renderer or the frame loop. We rated this the
highest-value remaining tooling work; on the next port, build it early.
