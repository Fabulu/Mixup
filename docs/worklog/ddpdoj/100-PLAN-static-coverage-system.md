# PLAN - a STATIC COVERAGE SYSTEM, not a one-off inventory

owner, 2026-08-06:

> "Once we have his results back let's try to make a system out of it. Who knows
> it might save us a lot of time wasted on oracle runs"

status: PLANNED. Blocked on `99-recon-boss-static-inventory.md`, whose findings
decide the shape. Written now so the intent survives the session.

## THE OBSERVATION THAT MAKES THIS OBVIOUS IN HINDSIGHT

**Two of the three games already have this and DaiOuJou does not.**

| game | tool | what it answers |
|---|---|---|
| Batman | `tools/audit_coverage.py` | cross-references every routine the disassembler finds an xref to against every address the port cites. Currently reports **no region of the ROM the port has never touched** |
| Gradius | `games/gradius/tools/census.py` | `$AE1C` dispatch: **41 of 42 entries**, 33 of 34 distinct routines |
| Gradius | `games/gradius/tools/tablecoverage.py` | a GATE STAGE: every indexed table is exported |
| DaiOuJou | **nothing** | - |

That is not a coincidence and it explains the symptom. Batman and Gradius can
**state their coverage as a number**. DaiOuJou discovers it by running the port
until it throws, which is why its boss has been sized wrong three times:

- W82 briefed at "six addresses", truth 39 unported entry points
- W94 sized the steady state at twelve, W95 measured seventeen live
- W96 briefed "all 15 arrival rungs", truth 8

**The root cause is structural, not carelessness.** `$2596C6` walks its lists in
a fixed order, so an unported entry in an early list throws before anything
behind it is reached. **A census of what threw measures WALK ORDER, not
remaining work** (`83-NOTE`). Every wave sized from one was sized from a
censored measurement.

## WHAT THE SYSTEM IS

Not "the boss inventory". A **general enumerator plus a gate**, so this class of
error cannot recur anywhere in the game.

**1. The enumerator.** Given a dispatcher and its script tables, walk the ROM
and resolve every entry to a routine address, size, and kind (INIT/STEP pairs
where they exist). Output a machine-readable table.

**2. The cross-reference.** Join that against the port's own registry.
**Derive the ported set from `registerScript`, never a hand list** - W95 changed
to this exactly because "39 unported" went stale within four days.

**3. The gate stage.** Fail when a table gains an entry nothing ports, or when
the port claims an entry it does not have. `tablecoverage.py` is already this
shape in the Gradius tree and is already a gate stage there. **A number that is
not gated rots**; that is the whole lesson of the three mis-sizings.

**4. The report.** Ported, unported, unreachable-or-unknown, with totals in
entry points, routines and instructions. Whoever plans a wave reads this instead
of guessing.

## WHAT IT WOULD ACTUALLY SAVE, AND WHAT IT WOULD NOT

**It does NOT replace oracle runs, and any framing that says it does is wrong.**
`docs/knowledge/09` governs: **the ROM is the INVENTORY, the oracle is the
VERDICT.** Static analysis proves what EXISTS; only measurement proves what is
CORRECT. This project has a whole knowledge file about that distinction and
this plan does not weaken it.

**What it saves is the WASTED runs**, which is what the owner asked about:

- **Sizing.** Three waves were briefed at the wrong size and two had to stop and
  re-split mid-flight. A wave that starts from the table starts correct.
- **Discovery.** The current loop is: run 13 minutes of MAME, hit a throw, port
  it, run again. The table gives every throw in advance, in one pass, with no
  emulator.
- **Ordering.** W95 proved the twelve had to ship together because no traced
  frame ran a proper subset. That was discovered the expensive way. A dependency
  view would have shown it.

**And the thing only static analysis can do, which is the real prize:**
**entry points no scenario will ever reach.** Every ladder is one route, one
rank, one player, one loop. Code that only runs at another rank band, in two
player, on the second loop, or on a death and recovery path is **invisible to
every oracle we own**, and no amount of running finds it. `docs/knowledge/10`
says coverage is branches, not frames; this is how you count the branches.

## THE JOIN - AND THIS IS THE PART THAT MAKES IT A SYSTEM

owner, same message:

> "And we have enough oracle backed stuff now to compare. The two should
> complement each other"

That is the point this plan was missing. The value is not the static table and
not the dynamic evidence. It is **the JOIN between them**, and there is now
enough of the second for the join to mean something:

```
[M] 13,084 logic frames compared against the board
[M] 54,280 bucket 2 records, 0 missing
[M] 71 rungs across four checkpoint ladders
```

Six days ago that figure was **one frame**. The dynamic side only just became
substantial enough to be a witness.

**The join runs in BOTH directions and each one answers a different question.**

**STATIC minus DYNAMIC = code that exists and has never executed.** This is the
untested set, and it is exactly where transcription bugs live. The evidence that
it matters is already on the table: W27 transcribed **all 39 bullet behaviour
kinds** and, until W95, **not one had ever run**. Kind 11 executed for the first
time in W95 and was correct, which is encouraging and proves nothing about the
other 38. **Naming that set is the single most useful output of the whole
system**, because it converts "we transcribed it" into "we transcribed it and
nothing has ever checked it".

**DYNAMIC minus STATIC = a defect IN THE ENUMERATOR.** If the oracle observed an
entry point executing that the static walker never found, **the walker is
incomplete and the inventory is a lie**. This direction is not a curiosity, it
is **how the enumerator gets validated instead of trusted**, and it is the
project's own rule applied to the tool itself: every check must be seen to fail.

**So the gate has two red conditions, not one:**

1. a table gains an entry nothing ports (coverage regression), and
2. the oracle runs something the enumerator did not list (**inventory
   regression**).

Condition 2 is the one that keeps this honest. Without it the enumerator is a
number nobody can dispute, which is precisely the shape of `stageledger.py`'s
RUNNABLE column that hid six shipped crashes, and of the "100% drawn" figure
that was true at 2,600 frames and 95.61% at 7,000.

**This is `docs/knowledge/09` operationalised rather than quoted.** Enumerate
statically, validate dynamically, and **make the disagreement between the two a
gate stage** rather than something a person notices.

## PRECEDENT: THIS PROJECT HAS BEATEN A "CANNOT BE ENUMERATED" CLAIM BEFORE

It was written down here that sprites could not be statically enumerated.
`41-recon-sprite-art.md` then walked **8,073 streams uniquely** from a single
root, and every art wave since has been an export job rather than a hunt.

**Documented impossibilities on this project have been false twice** (the other
was "there is no browser on this machine", with Chrome, Edge and playwright all
installed). That is the prior to hold when 99 reports what it could not resolve.

## HONEST LIMITS TO DESIGN AROUND

- **Computed jumps and runtime-derived table indices.** Where the listing does
  not determine the target, the enumerator must say UNKNOWN and not guess. An
  inventory that quietly resolves an ambiguous jump is worse than one that
  admits the hole, because it will be trusted.
- **"Unreachable" comments have lied five times here**, and W69 found one such
  routine running. So UNREACHABLE is a claim requiring evidence, not a
  convenient bucket for whatever the walker cannot follow.
- **The gate must be seen to fail.** Add an entry, watch it go red, restore.
  Checks here have sat green through the bug they were written for in four
  different ways.

## SEQUENCING

1. `99` lands and says what static walking can and cannot resolve for the boss.
2. Generalise its walker into the enumerator above **only as far as 99's
   evidence supports.** If 99 finds the boss needs a bespoke walker, the system
   is a smaller thing than this file assumes, and this file is then the thing
   that was wrong.
3. Wire the gate stage.
4. Point it at the rest of stage 1, then at stage 2, where `$228658` is
   unexported and the port currently stops.

**Do not build steps 2 to 4 before 1 is read.** That would be sizing a wave from
an assumption, which is the exact failure this whole document exists to end.
