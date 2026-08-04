# Wave 37 TOOLING — the sweep must report what it did NOT sweep

status: IN PROGRESS
tooling, 2026-08-04

Scope: `games/gradius/tools/` only. `src/` and `tests/` belong to W36
(stage 7), running concurrently — I do not write there, and I have not:
`git status --porcelain games/gradius/src games/gradius/tests` is empty and the
tree hash is unchanged (see §5).

Brief: W34 built `stagesweep.mjs` to fix "green means guarded, not played".
W35 found the instrument had inherited the same defect: **it parses the `$A2F0`
admission guard live, so "sweep clean" means "clean on the stages already
admitted"**. Before W35 it swept stages 0..4 and said *nothing whatsoever*
about stage 6, where — forced, with only the guard lifted, on a copy — 16 of 16
runs threw at `$B480` by frame 9.

---

## BASELINE — measured by me, this tree, before any edit

`bec6b28`, `games/gradius/src` clean.

```
node games/gradius/tools/oracle/stagesweep.mjs
  stages 0..5 only (the $A2F0 guard's own bound)
  96 chunk runs, 134400 nmi() frames, 4.61 s
  OK -- 0 undecided throws                                     exit 0

python .../stageledger.py      ALL 598 records, 591 ported, 98.8 %; stage 6
                               ($19=6) 104/111, first unported scroll $0AC0,
                               verdict "blocked"; stages 0..5 ADMITTED
python .../tablecoverage.py    OK, 82 bases, 55 ranges, 4 extent sites, 1 OPEN
node  .../test-all.mjs         GREEN -- 12 passed, 0 failed, 0 SKIPPED
```

**The whole of what the old tool said about its own coverage is one clause in
its header line: `stages 0..5 (the $A2F0 guard's own bound)`.** It never names
how many stages the ROM has, never says stage 7 exists, never says it was not
looked at, and never consults any artifact but the guard it already parses. A
reader who wants the denominator has to supply it from memory — which is
exactly what nobody did in W33, W34 or W35.

---

## §1. WHAT CHANGED IN `stagesweep.mjs`

### 1a. It can sweep UNADMITTED stages, and it does so by default

W35 lifted the guard by hand, on a hand-made copy. It is a capability of the
tool now: `shadowWithGuardLifted()` copies `src/` into a `mkdtemp` directory
under `%TEMP%`, rewrites **exactly one** `if (stageIndex >= N)` to
`>= <stages>`, and imports the port from there. Everything about it is
deliberate and printed:

* the copy is asserted to be **outside the repo**, and the single `writeFileSync`
  in the file (`writeOutsideRepo`) refuses any path under `games/gradius/`;
* `src/enemies.js` is **hashed before and after** the forced section and the run
  fails if it moved;
* the needle must appear **exactly once** — two guards, or none, is a hard error
  rather than a sweep that quietly stops at a bound it did not see;
* the copy is removed in a `finally`, so a crash cannot leave a patched tree
  behind;
* the frame budget is separate (`--force-frames`, default 600) and printed.

`--no-force` turns it off, and the coverage table then says
`NOT SWEPT: --no-force` on the stages it skipped, which is the point.

### 1b. It reports its own coverage on EVERY run

```
  COVERAGE -- STAGES SWEPT vs STAGES THE ROM HAS
  stage   ledger BASELINE   $A2F0 guard   this run                runs
  $19=0   ADMITTED         admits        SWEPT                   16
  ...
  $19=6   debt             THROWS        SWEPT (forced)          16
  7 of 7 stages swept (6 admitted, 1 forced behind the guard); 0 NOT SWEPT.
```

The denominator is `assets/enemies/tables.json`'s own
`stagePtrTable.stages` = 7 and `chunksPerStage` = 8 — the export's numbers, not
literals typed into the tool (`docs/knowledge/10` rule 5: never invent a
denominator). Coverage here is **stages swept versus stages the ROM has**,
never frames.

### 1c. ADMITTED-but-UNSWEPT is loud, and the second opinion is a DIFFERENT file

The "ledger BASELINE" column is parsed out of **`stageledger.py`'s frozen
`BASELINE` dict** — a different file, in a different language, hand-maintained,
and the document five wave briefs misread as "this stage plays". That choice is
the whole design: deriving "is this stage shipped" from the `$A2F0` bound the
tool *already* parses for coverage would make the report agree with itself
whatever either file said. **That tautology is both of today's failures.**

If the ledger says ADMITTED and the run did not sweep the stage, the run fails.

### 1d. Three things that used to be silent are now printed

* **the guard not being found at all.** `scopeLimit()` returned "every stage is
  admitted" when `indexOf` missed — a full-coverage claim made by a *failed
  string search*. It prints `GUARD NOT FOUND` in the header and a `***` line in
  the coverage block (seen to fail, §4 test A).
* **a second `if (stageIndex >= N)`**, which would silently bound the forced
  sweep. Hard error.
* **`stageledger.py`'s BASELINE not parsing to exactly `stages` rows.** Hard
  error: a coverage report that cannot read its second opinion must not fall
  back on its first (seen to fail, §4 test B).

---

## §2. WHAT THE FORCED SWEEP FOUND ON THE REAL TREE, TODAY

Stage 7 (`$19 = 6`) has never been swept by anything. 600 frames per chunk,
both modes, guard lifted:

```
  PASSIVE  stage $19=6       .     .     .     .     . f140* f140*   f0*
  PLAYING  stage $19=6       .     .     .     .     .  f76*  f76*   f0*
    $AF10 x2   unimplemented enemy handler, type $20, entry 32   (chunks 5,6 PASSIVE)
    $B569 x2   unimplemented enemy handler, type $1E, entry 30   (chunks 5,6 PLAYING)
    $8010 x2   "enemy tables: $8010 is not in any exported range" (chunk 7, f0, both)
  6 of 16 forced runs threw, earliest at frame 0
```

Measured by me this session. **Five of stage 7's eight chunk streams survive
600 frames in both modes**; three do not. Chunks 5 and 6 are the ones the
ledger's `first unported scroll $0AC0` predicts, and they die on two different
handlers depending on the mode — `$AF10` with the pad down at f140, `$B569` at
f76 once the ship is alive and shooting, i.e. **the PLAYING intervention gets
there first and finds a different wall.**

`$8010` at frame 0 on chunk 7 is the interesting one and I am NOT diagnosing it
here: it is an `enemyTables` read of `$8010`, which is the bottom of PRG and not
a table base at all, on the first frame of the run. Two readings are open —
stage 7 chunk 7's stream pointer really is unported data, or seeding directly
onto that pointer is not a state the game reaches — and settling it needs the
listing, not this tool. **Handed to W36, which is porting stage 7 right now.**

Presence, not absence: three chunks throwing proves those paths are missing; the
five clean chunks prove only that 600 frames from those pointers did not reach
one.

---

## §3. GATE-FAIL versus WARN — the decision and the reasoning

Asked for explicitly, so here is the reasoning rather than the verdict alone.

**FAIL — a stage the ledger BASELINE calls ADMITTED that this run did not
sweep.** On a consistent tree this condition *cannot arise*: coverage follows
the guard that admits, so every admitted stage is swept automatically and the
gate costs nothing to keep green. It fires only when (a) somebody restricted the
run, (b) the guard parse degraded, or (c) the two artifacts genuinely disagree
about what ships. All three are defects, and (c) is the exact combination that
put six crashes on the public site. A gate that fires only on real defects is
not a technicality-block. The escape hatch is `--allow-partial`, which is
explicit, prints "this run does NOT cover those stages", and is never passed by
`test-all.mjs`.

**FAIL — an undecided throw on a ledger-ADMITTED stage that this run could
reach only by FORCING the guard.** This rule exists because my own
demonstration produced it (§4). The first cut treated `SWEPT (forced)` as
covered, so a tree in the pre-W35 state — ledger says ADMITTED, guard blocks,
16 of 16 forced runs dying on `$B480` at frame 9 — **exited 0**. I had rebuilt
the defect I was sent to remove, one layer further in. A stage another artifact
says ships does not get to be called "declared debt" because the tool had to
lift a guard to see it.

**WARN — throws behind the guard on a stage the ledger calls DEBT.** Reported
in full with ROM addresses and run counts (§2), never fatal. Failing here would
block publishing on work nobody has claimed is done: the `$A2F0` guard *is* the
port's honest statement of scope, every unported path behind it is already a
loud named throw, and a gate that goes red for stage 7 today would be red every
day until stage 7 lands — which trains readers to ignore it, the failure mode
that made "GREEN with skips" possible in the first place. The job is to make
the debt visible, not to forbid it.

**WARN — ledger says ADMITTED, guard THROWS.** Printed as a `***` line naming
both artifacts. Not failed on *here* because `stageledger.py`'s own gate
already fails on exactly that ("regressed: was ADMITTED, now blocked") and
double-gating one condition in two tools makes both harder to reason about. If
the stage also throws under forcing, rule 2 above fails anyway — which is what
happens in §4.

**WARN — swept a stage the BASELINE still calls debt.** The sweep covers MORE
than the ledger claims; that is a wave in flight (W36 lifting the guard before
updating `BASELINE`), not a defect. One line, no failure.

No existing gate was weakened to make any of this pass. `--allow-partial` is
the only relaxation and it must be typed.

---

## §4. EVERY CHECK SEEN TO FAIL

### Test A — the demonstration proper: the old tool green, the new tool red, on ONE tree

A COPY at `C:/tmp/w37demo` (`games/gradius/{src,assets,tools,tests}` plus
`game.json`, `index.html` and the repo `package.json`), patched to the
**pre-W35 state** — two byte edits in the copy's `enemies.js`, nothing else:

1. `if (stageIndex >= 6)` → `if (stageIndex >= 5)` (stage 6 not admitted);
2. `case 0xB480: return h_B480(...)` commented out (entry 26 unported, so type
   `$1A` falls to the dispatch's own named throw).

W34's tool, taken from `git show HEAD:...stagesweep.mjs`, on that copy:

```
  stages 0..4 (the $A2F0 guard's own bound)
  80 chunk runs, 112000 nmi() frames, 2.49 s
  OK -- 0 undecided throws                                          exit 0
```

**Green, and silent about two entire stages.** That is W35's finding,
reproduced.

W37's tool, same copy, same frame budget for the admitted stages:

```
  FORCED -- 600 frames per chunk, the $A2F0 guard lifted
            (if (stageIndex >= 5) -> if (stageIndex >= 7)) in a COPY under %TEMP%
  PASSIVE  stage $19=5   f533* f172*  f41*  f28*  f16*   f9*   f9* f534*
  PLAYING  stage $19=5   f377* f172*  f41*  f28*  f16*   f9*   f9* f377*
    $B480 x16
  *** stage $19=5: stageledger.py's BASELINE says ADMITTED and the $A2F0 guard THROWS.
  *** 16 FORCED run(s) THREW on stage(s) $19=5, which the BASELINE calls ADMITTED.
                                                                    exit 1
```

**Those sixteen frame numbers are W35 §1's, digit for digit** — PASSIVE
`f533 f172 f41 f28 f16 f9 f9 f534`, PLAYING `f377 f172 f41 f28 f16 f9 f9 f377`,
`$B480` ×16, earliest frame 9 — measured this session by the tool itself
instead of by hand on a hand-built tree. The instrument now reproduces
unassisted the measurement that exposed it.

### Test B — a restricted run cannot call itself covered (real tree, no copy)

```
node .../stagesweep.mjs --stages 0-4
  *** 1 stage(s) ADMITTED BY stageledger.py's BASELINE AND NOT SWEPT BY THIS RUN:
      stage $19=5  (NOT SWEPT: --stages)                            exit 1
node .../stagesweep.mjs --stages 0-4 --allow-partial                exit 0
      ("--allow-partial: accepted, and this run does NOT cover those stages.")
node .../stagesweep.mjs --stages 6
  6 stages reported ADMITTED and NOT SWEPT                          exit 1
```

### Test C — the guard renamed out from under the parser

On the copy, `if (stageIndex >= 5)` → `if (stageIndex > 4)` (identical
semantics, unparseable needle):

```
  the $A2F0 guard admits stages 0..6  <-- GUARD NOT FOUND, see COVERAGE below
  *** the `if (stageIndex >= N)` guard was NOT FOUND in src/enemies.js. Every
      stage was treated as admitted -- that is a coverage claim made by a
      FAILED STRING SEARCH, not by reading the port. Fix the parser.
  32 of 112 chunk runs THREW                                        exit 1
```

The old tool's `if (at < 0) return 7;` did this **silently**.

### Test D — the second opinion unreadable

One row deleted from the copy's `stageledger.py` `BASELINE`:

```
Error: stagesweep: parsed 6 admitted= rows out of stageledger.py's BASELINE,
expected 7 (the export's own stagePtrTable.stages). Fix the parser: a coverage
report that cannot read its second opinion must not fall back on its first.
                                                                    exit 1
```

### And one check that was seen to fail BY BEING WRONG

Test A is in this worklog because it caught **my own tool**, not only W34's:
the first cut exited 0 on that copy (§3, rule 3). The green run before the fix
looked exactly like the green run after it.

---

## §5. HASHES — the real tree is untouched

`sha256` over `sha256sum` of every `.js` under `games/gradius/{src,tests}`,
sorted, measured by me:

```
BEFORE all copy/mutation work  253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58
AFTER  the copy was deleted    253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58
```

(The same value W35 ended on, so W36's `src/` work had not landed while I ran.)
`git status --porcelain games/gradius/src games/gradius/tests` is empty; the
copy at `C:/tmp/w37demo` is deleted; no `gradius-stagesweep-*` directory
remains under `%TEMP%`.

Gate after the change: `node games/gradius/tools/test-all.mjs` →
**GREEN — 12 passed, 0 failed, 0 SKIPPED** (4 m 35 s).

---

## §6. `tablecoverage.py` — the two secondary items

(in progress)

---

## §7. WHAT I COULD NOT REACH — attempts, not absences

(in progress)
