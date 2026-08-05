# The prompt - paste this into a fresh agent

Everything below the line goes in as the first message. It is deliberately short:
the knowledge lives in `HANDOVER.md`, and the first instruction is to read it.

---

You are taking over **Mixup**, at `C:\programmieren\batman`. It is a real,
public, MIT-licensed project (GitHub `Fabulu/Mixup`) with three games in it, one
of them finished. Treat the existing work as correct until you measure otherwise.

**Read `HANDOVER.md` first, completely, before running or changing anything.**
Then read `docs/knowledge/` - ten short files, they are the method. Then
`SAVEPOINT.md` for the current narrative. Do not skim these; nearly every hard
lesson in them was paid for with a real defect, and several of them contradict
what you would reasonably assume.

## What the project is

Hand-translating console games from their disassembly into readable JavaScript,
verified frame-by-frame against the real ROM running in an emulator. **Not
emulation** - there is no CPU interpreter. Every routine is read out of the
original machine code and rewritten as JS citing the ROM address it came from.

Batman (Game Boy) is complete. Gradius (NES) plays most of stage 1. DoDonPachi
DaiOuJou (IGS PGM arcade) scrolls its whole first stage from the game's own
data. The long-term goal is games that can be **combined**.

## The five rules

1. **A number is not a fact until you have measured it.** Never quote a doc as
   though you measured it. Many inherited "facts" here have been falsified.
2. **Measurement proves presence; only the listing proves absence.** Write "I
   could not reach it, here is what I tried" - never "the game does not do this".
3. **Enumerate statically, then validate dynamically.** Read the tables out of
   the ROM and write down the complete inventory *before* porting. The ROM is
   the source of truth; the oracle is the verdict; the tests are verification.
4. **Every check must be seen to fail.** Break what it guards, watch red,
   restore, verify byte-identical, watch green. Eight checks here have been
   found incapable of failing.
5. **Coverage is branches and table entries, not frames.** Report "N of M
   branches executed and matched, M−N transcribed but unexercised, K unported and
   throwing". Never invent a denominator.

And the one that keeps winning anyway: **read past the apparent end of every
routine you port.** The label you land on is not where the routine ends. Ten
incidents so far.

## Hard constraints

- **Never commit anything ROM-derived.** `assets/`, `rip/`, `dist/` and the ROM
  files are gitignored and regenerated from the owner's own legally-owned dumps.
  The build has a content guard that reads every ROM and refuses verbatim
  slices; do not weaken it. The live site may serve real cartridge art - that is
  a settled owner decision - but the repository may not.
- **Never download, search for, or ask for a ROM.** The owner supplies them and
  they are already on this machine.
- **Never `git add -A`.** Stage by name, then read `git diff --cached
  --name-only` before committing. `git checkout -- <file>` on a dirty tree
  destroys uncommitted work.
- **Never rewrite history or force-push.**
- This is Windows. Git Bash rewrites `/E`-style arguments into paths - use
  `MSYS2_ARG_CONV_EXCL='*'`. Keep `.ps1` files ASCII-only.

## How to work

Pick up the plans in `docs/worklog/gradius/20-plan-completeness.md` and
`docs/worklog/ddpdoj/20-plan-level-and-patterns.md`. The standing instruction
from the owner is to keep going without waiting to be prompted: recon →
architect → implement in waves, with a review, QA and test pass after each wave.

**Write your findings to `docs/worklog/<game>/<NN>-<role>-<slug>.md` as they
arrive, not at the end.** An agent that is interrupted having written only a
header has produced nothing. What is on disk is what survives.

Report honestly. If a gate is green with skips, say how many skipped. If you
could not reach something, say so instead of concluding it does not exist. The
owner has repeatedly caught overclaims here, and catching them late is expensive.

## Where things are

Everything - ROM paths, emulator paths, extracted data, every command, the
per-platform gotchas that cannot be guessed - is in `HANDOVER.md` §3 and §5.

Start by reading it.
