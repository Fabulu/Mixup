# Building a check that is worth having

A check you have never seen fail is not evidence. This file is the discipline that
distinguishes a test from a decoration.

## The rule

**Validate every new check by making it fail.** Revert the fix, watch the check go red,
restore. Record both outcomes in the commit message.

This is cheap — usually two minutes — and it is the only thing that distinguishes "I wrote
a test" from "I know this is tested". Every check in this repo that mattered was
red-validated; every check that turned out to be decorative was not.

## Mutation testing, done by hand

When you are about to reorganise code, mutation-test the thing you are about to move
*before* you move it. Apply a deliberate breakage and see what catches it.

Doing exactly this before a refactor produced the most useful measurement of the whole
project:

- Deleting a sprite-slot ordering rule: **691 unit tests all passed.** The oracle corpus
  caught it, on two scenarios out of fifty.
- Moving a draw flush past another subsystem — the *exact* ordering bug fixed days
  earlier — **26/26 gate stages passed.** Nothing caught it.

The second result located a precise hole: the stage built to guard draw order had four
scenarios and **not one of them pressed the attack button**, so the other subsystem's
sprites never existed in any of those runs. The stage was guarding the order of two
things that were never both present.

**Practice:** for each ordering or invariant you believe is protected, break it and run
the gate. Do this on a scratch copy. What survives tells you where to spend.

## A stage that cannot run must fail, not skip

Our runner decides at startup whether the tests directory and the asset manifest exist,
and turns dependent stages into SKIP. **SKIP does not fail the run.** A restructure that
moves either one prints:

```
ALL GREEN — 2 stage(s) passed, 24 skipped
```

which is the most dangerous output a test runner can produce, because it is technically
true. If a stage cannot run for an *environmental* reason (no emulator installed), SKIP is
right. If it cannot run because a path moved, that is a **failure**. Make the runner tell
them apart, and print the skipped count where it cannot be missed.

## Coverage must be proportional to the content

Two failures of proportion here, both quoted as proof at the time:

- **Eight sampled frames out of 4,137** for a 69-second ending sequence, whose feature of
  interest did not even begin until frame 1,500. The number was real and meaningless.
- **A scenario that connects exactly one hit, dead centre.** Replaying it against
  deliberately mutated geometry still yielded one hit — so it exercised the code path but
  interrogated none of its parameters. The replacement throws 36 attacks across a full
  movement cycle, connects on 4 at different relative heights, and **the misses are as
  load-bearing as the hits**.

**Ask of every scenario: which mutation would this catch?** If the answer is "it reaches
the code", that is not coverage.

## Two sides of a comparison must be independently derived

If your check compares your code against your code, it proves consistency, not
correctness. Ours re-reads ROM tables from raw file offsets *deliberately not* through the
same helpers the exporter uses, so a bug in a helper cannot hide itself.

Same principle inside a test file: a test that spells out the raw byte value is an
independent check on a named constant; a test that uses the constant is only a
readability improvement. Both are legitimate — know which one you are writing.

## Never regex a structured file

A single regex edit with `re.S` silently deleted three oracle scenarios, and the stage
still reported PASS afterwards — because fewer scenarios is not a failure, it is just less
coverage. Parse it, edit the structure, or do line-based edits with an assertion that the
anchor was found exactly once.

Every scripted edit in this repo asserts its anchor count before writing. That habit has
caught several silent misses.

## Report what was skipped

If a check bounds its own coverage — top-N, no-retry, sampling, an early exit — it must
*say so in its output*. Silent truncation reads as "covered everything". A one-line
"dropped 12 candidates" is the difference between a result and a misleading result.
