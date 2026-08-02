# Process — repo, gate, and working with agents

Rules that are not about any console. All of these were learned by breaking something.

## The gate is the arbiter

One command runs every stage, cheapest first, and it is the definition of "working". If
you change gameplay code and the gate goes red, you broke something real.

- **Cheapest first.** A wrong constant or a corrupted export should be reported before
  anything spends a minute inside an emulator.
- **Name the stage that failed**, and stop there by default — with a flag to keep going.
- **Every check goes in the gate the day it is written.** See `02-traps.md` § 5.
- **A stage that cannot run must fail, not skip**, unless the reason is genuinely
  environmental. See `03-checks-that-can-fail.md`.

## Commits

- **Stage by name.** `git add -A` sweeps up whatever else is in flight — another session,
  another agent, a half-finished experiment. This bit us with agents running concurrently.
- **Staging by name is NOT enough with a concurrent writer, and this cost a broken HEAD.**
  `git commit` commits the **index**, not your files. Another agent had `git add`-ed a
  65-file rename it was still writing the path fixes for; a commit of six unrelated doc
  files swallowed that rename and shipped it without them. A fresh checkout then had no
  `src/`, a `package.json` pointing at a directory that did not exist, and every oracle
  tool broken. **Before committing, run `git diff --cached --name-only` and look for files
  that are not yours** — or commit from a separate index (`GIT_INDEX_FILE`). Staging by
  name protects you from *unstaged* work; nothing but checking protects you from work
  someone else already staged.
- **`git checkout -- <file>` on a dirty tree discards uncommitted work in that file.** It
  is not a safe way to drop a probe. Back up first, or use a scratch copy.
- **Separate pure moves from content changes.** A commit that both relocates a file and
  edits its logic is unreviewable, and in a project whose value is line-by-line
  checkability against a listing, that is expensive.
- **Write what was measured in the commit message**, including the numbers and what went
  red when the fix was reverted. Several times the message was the only surviving record
  of *why* a non-obvious line is that way.
- **Nothing derived from the original ROM is ever committed.** Enforce it in
  `.gitignore`, and check the staged file list before pushing.

## Comments are the primary asset

Cite the ROM address on every non-obvious line. The port's value is not that it runs — it
is that a second person can check any line against the original without re-deriving it.

When you split a file, **the comments go with the code they document**. A refactor that
drops them destroys more value than it creates.

Where a comment records a *measurement*, keep the numbers. "MEASURED: 63 out-of-range
entries on L9, 135 on L10" is checkable; "this can overflow" is not.

## Stale documentation is worse than none

Several notes in this repo were confidently wrong for months, and each one cost somebody
time:

- a launcher note telling players a working level was BLOCKED;
- a banner in a test file claiming 8 scenarios were failing, naming a fix that was already
  applied — anyone reading it would believe the suite was red;
- a "not ported" list with three items that had been ported;
- counts (test totals, stage totals, scenario totals) that had drifted by a factor of two
  and contradicted each other **between files**.

**Rule: if you port something, fix its note the same commit.** And when you quote a
number in a doc, re-count it from the file rather than copying the previous claim.

## Working with parallel agents

Multi-agent work is effective here — recon fan-out especially, since diagnosing a ROM
behaviour is naturally parallel. Three hazards, all encountered:

1. **Shared output paths.** The oracle tools write fixed paths (`rip/oracle/trace_L05.json`
   and similar). Two agents running them at once read each other's data and draw confident
   wrong conclusions. Require unique output paths, immediate copies, or self-contained
   scripts with their own emulator instance.
2. **Concurrent writes to the source tree.** Exactly one agent should write to `src/` at a
   time. Reviewers read; implementers write; do not fan out implementation.
   **And that includes YOU.** The most expensive incident here was not two agents
   colliding — it was the human committing documentation while an agent had a rename
   staged. If an agent is mid-restructure, do not commit anything from that repo, even
   files it will never touch. Wait, or work in a worktree.
3. **A confident wrong answer is worse than "unresolved".** Ask explicitly for the second.
   Investigations that reported what they ruled out were consistently more useful than
   ones that produced a tidy conclusion, and at least one tidy conclusion was wrong.

**Have someone triage the reviewers.** In one pass, two of the reviewers' findings were
false alarms and one proposed fix would have reintroduced a bug — caught only because the
final gate re-measured instead of deferring.

## Ask the player what they saw

The single highest-value bug report in this project was **"the boss explodes, the screen
fades out to white, and then we softlock"**. The symptom word sent four investigations
astray; the description of the screen solved it immediately.

Related: when a player says the port looks wrong and your suite says it is perfect,
**suspect the suite**. Twice the player was right and the measurement was rigged — once by
a harness setting up state the app never has, once by a unit test that took the answer as
an argument. Both times the instinct to trust the green number was the expensive one.
