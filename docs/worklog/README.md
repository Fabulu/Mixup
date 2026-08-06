# Worklog - the restart record

**Every agent writes here, before and after, without being asked twice.**

This directory exists for one reason: **a run can die.** Context fills, a
workflow is killed, a machine reboots, a session hits its limit. When that
happens the only thing that survives is what somebody wrote down. Twice in this
project a confident result was lost because it lived in an agent's head and
nowhere else, and the re-derivation cost more than the original work.

So: if you are an agent working on this repo, you write a file here. Not a
summary at the end - a file you open when you start and update as you go.

## Where

```
docs/worklog/
  README.md                 this file
  gradius/                  the Gradius port
    00-plan.md              the architect's wave plan -- the spine of the loop
    NN-<role>-<slug>.md     one file per agent, NN = wave number, 00 = pre-wave
  cleanup/                  ROM-derived removal, placeholder art
```

`NN` is the wave. `role` is one of `recon`, `plan`, `impl`, `review`, `qa`,
`test`, `cleanup`. Example: `03-impl-shot-loops.md`.

## What goes in the file

Write it as you work. The header goes in **first**, before you have answers:

```markdown
# <what you were asked to do>
status: IN PROGRESS | DONE | BLOCKED | ABANDONED
wave: <n>   role: <role>   started: <the date you were told, or "unknown">

## The task, as I understood it
## What I did
## What I MEASURED
## What I could not do, and why
## If someone picks this up cold
```

**"What I MEASURED" is the section that matters.** This project's rule is that
a number is not a fact until it is measured. Put the command and the output in,
not a claim about them. `regress.mjs -> 50/50 bit-exact, 14,519 frames` is
checkable. "verified everything works" is not, and will be treated as if you
had written nothing.

**Write down what you ruled OUT.** An investigation that reports "it is not the
scroll latch, here is how I know" is worth more than a tidy conclusion that
turns out to be wrong - and at least one tidy conclusion in this project's
history was wrong. If you did not resolve something, `status: BLOCKED` with the
reason beats a confident guess. Nobody is penalised for unresolved.

## The rules that are not negotiable

1. **Nothing ROM-derived is ever committed.** `assets/`, `rip/`, `dist/`, and
   any ROM file. This is absolute and it is about **the repo**, which is public
   source anyone can clone.

   **The published site is a separate question with a separate answer.** It is
   the owner's own deployment of their own legally-owned cartridge, and the
   owner has decided it may serve real cartridge art. `player.tiles.bin` - the
   player animation pool, without which the port cannot draw its protagonist -
   is published verbatim, deliberately, and is listed in `PUBLISH_VERBATIM` in
   `tools/build-dist.mjs` with its reason. Do not "fix" that back to a
   placeholder.

   `tools/build-dist.mjs`'s ROM-leak guard still reads every ROM and blocks
   anything verbatim that is **not** named there - **do not weaken it**. What it
   exists to catch is bulk cartridge content nobody meant to ship: `prg.bin`,
   `chr.bin` and four `chr/bank*.bin` files, together the whole Gradius
   cartridge, none of which the site ever fetches. Every deliberate exception is
   printed on every build, because an exception that stops being mentioned is
   how the previous one survived unexamined from the first deploy onward. If the
   site ever needs bytes that genuinely should not be published, draw an
   original replacement of the same length and layout and add it to
   `SUBSTITUTE` - `tools/make-placeholder-tiles.mjs` is the worked example, and
   the local tree keeps the real assets either way, so the oracle is unaffected.
2. **Never `git add -A`.** Stage by name, then run
   `git diff --cached --name-only` and read it. Staging by name protects you
   from unstaged work; only looking protects you from what another agent
   already staged. This cost a broken HEAD once.
3. **Exactly one agent writes to `src/` at a time.** Reviewers read.
4. **`git checkout -- <file>` on a dirty tree destroys uncommitted work.**
5. **If you port something, fix its note in the same commit.** A stale doc in
   this repo has misled somebody every single time one was left behind.

## Before you say you are done

The gate is the arbiter, not your opinion of your change:

```
node --test games/gradius/tests/
node games/gradius/tools/test-all.mjs      # expect GREEN, 0 SKIPPED
```

"ALL GREEN" alone is not enough - **a SKIP is not a PASS**. Read the skip count.
A stage that cannot run must fail, not skip, unless the reason is genuinely
environmental, and then it is written down here.

See `docs/knowledge/` for the method: `01` the oracle, `02` the traps, `03` the
ways a check passes while the game is broken, `05` process, `06` lag.
