# Start here

You are taking over **Mixup**, at `C:\programmieren\batman`. Hand-translating
console games from their disassembly into readable JavaScript, verified frame by
frame against the real ROM in an emulator. Not emulation.

## Read these three, in this order, before doing anything

1. **`CATCHUP.md`** - what changed recently and what would most mislead you.
   **Read this first even if you think you know the project.** If you worked on
   this before around 2026-08-04, your mental model is stale in five specific
   ways and that file names them.
2. **`HANDOVER.md`** - the fundamentals that have not changed: the method, the
   three games, every path, every command, the emulators, the platform traps.
3. **`docs/knowledge/`** - the cross-game lessons. `01` the oracle method, `02`
   the traps, `03` what makes a check capable of failing, `09` enumerate
   statically and validate dynamically, `10` coverage is branches not frames.

Then read the newest few files in `docs/worklog/ddpdoj/` and
`docs/worklog/gradius/`. They are numbered; start from the highest.

## Your role

**Orchestrator.** Dispatch waves; do not do the porting yourself. Between waves:
**verify the result yourself rather than trusting the summary**, confirm it is
committed **and pushed**, run the gate, publish if green, start the next wave.

Concurrency: **one DaiOuJou implementer** owning `games/ddpdoj/src/`, plus
optionally one read-only recon. A second writer collides. Gradius is a separate
tree and can run alongside.

## The rules that matter most

- **Tell every agent to CHECK ITS BRIEF'S PREMISE.** 47 briefs here have rested
  on something false. This is the single highest-value instruction you can give
  and it pays off in nearly every wave.
- **The ROM is the source of truth. Tests are verification.** Measurement proves
  presence; only the listing proves absence. Coverage is branches, streams and
  table entries, never frames.
- **Every check must be seen to fail.** Revert the fix, watch it go red, restore.
  Ask agents to report checks of their own they could not make fail; 12 did so in
  four days and every one was right to.
- **Do not invent behaviour. Prefer broken-and-declared to fabricated.** Do not
  clamp an index to stop a throw; the crash is honest.
- **Read PAST the apparent end of every routine.** At least thirty fall-through
  incidents, one of which invalidated an already shipped handler.
- **Never `git add -A`. Never commit ROM-derived data.** Commit through a private
  index in one shell call. `publish.mjs` refuses on a red gate or any skip.
- **No em dashes**, in your output or anything you write. The owner asked twice.

## The owner

Plays the live build and reports defects no gate can see. **Six visual defects
this week were found that way and every one was real**, including one where
their instinct beat a web recon. Treat their play reports as primary evidence
and check their guesses rather than assuming they are loose talk; they have been
right about mechanics repeatedly.

They want to be told plainly when something is not done, and they would rather
have four finished items and one honestly scoped than six half-done.

## What to do first

`CATCHUP.md` section 7 has the live queue. Do not start there blindly: check
`git log` first, because the waves it names as in flight may have landed.
