# Wave 37 TOOLING - the sweep must report what it did NOT sweep

status: DONE
tooling, 2026-08-04

Scope: `games/gradius/tools/` only. `src/` and `tests/` belong to W36
(stage 7), running concurrently - I do not write there, and I have not:
`git status --porcelain games/gradius/src games/gradius/tests` is empty and the
tree hash is unchanged (see §5).

Brief: W34 built `stagesweep.mjs` to fix "green means guarded, not played".
W35 found the instrument had inherited the same defect: **it parses the `$A2F0`
admission guard live, so "sweep clean" means "clean on the stages already
admitted"**. Before W35 it swept stages 0..4 and said *nothing whatsoever*
about stage 6, where - forced, with only the guard lifted, on a copy - 16 of 16
runs threw at `$B480` by frame 9.

---

## BASELINE - measured by me, this tree, before any edit

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
reader who wants the denominator has to supply it from memory - which is
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
* the needle must appear **exactly once** - two guards, or none, is a hard error
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
`stagePtrTable.stages` = 7 and `chunksPerStage` = 8 - the export's numbers, not
literals typed into the tool (`docs/knowledge/10` rule 5: never invent a
denominator). Coverage here is **stages swept versus stages the ROM has**,
never frames.

### 1c. ADMITTED-but-UNSWEPT is loud, and the second opinion is a DIFFERENT file

The "ledger BASELINE" column is parsed out of **`stageledger.py`'s frozen
`BASELINE` dict** - a different file, in a different language, hand-maintained,
and the document five wave briefs misread as "this stage plays". That choice is
the whole design: deriving "is this stage shipped" from the `$A2F0` bound the
tool *already* parses for coverage would make the report agree with itself
whatever either file said. **That tautology is both of today's failures.**

If the ledger says ADMITTED and the run did not sweep the stage, the run fails.

### 1d. Three things that used to be silent are now printed

* **the guard not being found at all.** `scopeLimit()` returned "every stage is
  admitted" when `indexOf` missed - a full-coverage claim made by a *failed
  string search*. It prints `GUARD NOT FOUND` in the header and a `***` line in
  the coverage block (seen to fail, §4 test A).
* **a second `if (stageIndex >= N)`**, which would silently bound the forced
  sweep. Hard error.
* **`stageledger.py`'s BASELINE not parsing to exactly `stages` rows.** Hard
  error: a coverage report that cannot read its second opinion must not fall
  back on its first (seen to fail, §4 test B).

---

## §2. WHAT THE FORCED SWEEP FOUND ON THE REAL TREE, TODAY -
## INCLUDING A BUG IN THE HARNESS ITSELF

Stage 7 (`$19 = 6`) had never been swept by anything. 600 frames per chunk,
both modes, guard lifted:

```
  PASSIVE  stage $19=6       .     .     .     .     . f140* f140*   f0*
  PLAYING  stage $19=6       .     .     .     .     .  f76*  f76*   f0*
    $AF10 x2   unimplemented enemy handler, type $20, entry 32   (chunks 5,6 PASSIVE)
    $B569 x2   unimplemented enemy handler, type $1E, entry 30   (chunks 5,6 PLAYING)
    $8010 x2   "enemy tables: $8010 is not in any exported range" (chunk 7, f0, both)
  6 of 16 forced runs threw, earliest at frame 0
```

Measured by me this session. Chunks 5 and 6 are the ones the ledger's
`first unported scroll $0AC0` predicts, and they die on two different handlers
depending on the mode - `$AF10` with the pad down at f140, `$B569` at f76 once
the ship is alive and shooting: **the PLAYING intervention gets there first and
finds a different wall.**

### And I nearly wrote `$8010` up as stage 7's third crash. It is MY OWN BUG.

I went to the listing before writing it down, because `$8010` is the bottom of
PRG and not a plausible table base. Measured out of `assets/prg.bin`, this
session:

```
$A7D0's stage pointers   $A7DE $A7EE $A7FE $A80C $A81A $A828 $A836
spacing                        16    16    14    14    14    14
first chunk STREAM       $A844      so the whole chunk-pointer region is
                                    $A7DE..$A843 -- 102 bytes, 51 words
```

**`$A7D0` does not address a rectangular 7 x 8 table.** From stage 2 on the
subtables OVERLAP - a stage's 8th word *is* the next stage's 1st - which is why
W33 saw `$19=2` chunk 7 die on `$AAEC`, stage `$19=3` chunk 0's own pointer, at
the identical frame 314. Those slots are the ROM's and they stay swept.

**The last stage is the one that bites.** `$A836 + 14` = `$A844`, which is not a
pointer at all: it is the first two bytes of a chunk stream. `sweepChunk` read it
as one and the port threw at frame 0. Two derivations now bound the table and
must agree - (a) a slot ADDRESS at or after the first stream is not an entry,
(b) every slot VALUE that is an entry points at or above that same address, and
`$8010` fails (b) - and `chunkGeometry()` asserts (b) for every slot it sweeps.
Stage 7 has **7 chunk slots, not 8**; the sweep is 55 slots, not 56.

**No stage but the last has the problem, so nothing could find it until a run
went behind the guard.** The forced mode's first real catch was a defect in the
tool that added it.

Corrected result, same run:

```
  PASSIVE  stage $19=6       .     .     .     .     . f140* f140*
  PLAYING  stage $19=6       .     .     .     .     .  f76*  f76*
  4 of 14 forced runs threw, earliest at frame 76
```

Presence, not absence: two chunks throwing proves those paths are missing; the
five clean chunks prove only that 600 frames from those pointers did not reach
one. (W36, working on stage 7 concurrently, reached the same three causes and
the same table geometry independently - commit `5aeee75`, which landed while I
was measuring. Their `$98FD[6] = $0D` camera-cap derivation is theirs, not
mine; my numbers above are from the pointer table.)

---

## §3. GATE-FAIL versus WARN - the decision and the reasoning

Asked for explicitly, so here is the reasoning rather than the verdict alone.

**FAIL - a stage the ledger BASELINE calls ADMITTED that this run did not
sweep.** On a consistent tree this condition *cannot arise*: coverage follows
the guard that admits, so every admitted stage is swept automatically and the
gate costs nothing to keep green. It fires only when (a) somebody restricted the
run, (b) the guard parse degraded, or (c) the two artifacts genuinely disagree
about what ships. All three are defects, and (c) is the exact combination that
put six crashes on the public site. A gate that fires only on real defects is
not a technicality-block. The escape hatch is `--allow-partial`, which is
explicit, prints "this run does NOT cover those stages", and is never passed by
`test-all.mjs`.

**FAIL - an undecided throw on a ledger-ADMITTED stage that this run could
reach only by FORCING the guard.** This rule exists because my own
demonstration produced it (§4). The first cut treated `SWEPT (forced)` as
covered, so a tree in the pre-W35 state - ledger says ADMITTED, guard blocks,
16 of 16 forced runs dying on `$B480` at frame 9 - **exited 0**. I had rebuilt
the defect I was sent to remove, one layer further in. A stage another artifact
says ships does not get to be called "declared debt" because the tool had to
lift a guard to see it.

**WARN - throws behind the guard on a stage the ledger calls DEBT.** Reported
in full with ROM addresses and run counts (§2), never fatal. Failing here would
block publishing on work nobody has claimed is done: the `$A2F0` guard *is* the
port's honest statement of scope, every unported path behind it is already a
loud named throw, and a gate that goes red for stage 7 today would be red every
day until stage 7 lands - which trains readers to ignore it, the failure mode
that made "GREEN with skips" possible in the first place. The job is to make
the debt visible, not to forbid it.

**WARN - ledger says ADMITTED, guard THROWS.** Printed as a `***` line naming
both artifacts. Not failed on *here* because `stageledger.py`'s own gate
already fails on exactly that ("regressed: was ADMITTED, now blocked") and
double-gating one condition in two tools makes both harder to reason about. If
the stage also throws under forcing, rule 2 above fails anyway - which is what
happens in §4.

**WARN - swept a stage the BASELINE still calls debt.** The sweep covers MORE
than the ledger claims; that is a wave in flight (W36 lifting the guard before
updating `BASELINE`), not a defect. One line, no failure.

No existing gate was weakened to make any of this pass. `--allow-partial` is
the only relaxation and it must be typed.

---

## §4. EVERY CHECK SEEN TO FAIL

### Test A - the demonstration proper: the old tool green, the new tool red, on ONE tree

A COPY at `C:/tmp/w37demo` (`games/gradius/{src,assets,tools,tests}` plus
`game.json`, `index.html` and the repo `package.json`), patched to the
**pre-W35 state** - two byte edits in the copy's `enemies.js`, nothing else:

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

**Those sixteen frame numbers are W35 §1's, digit for digit** - PASSIVE
`f533 f172 f41 f28 f16 f9 f9 f534`, PLAYING `f377 f172 f41 f28 f16 f9 f9 f377`,
`$B480` ×16, earliest frame 9 - measured this session by the tool itself
instead of by hand on a hand-built tree. The instrument now reproduces
unassisted the measurement that exposed it.

### Test B - a restricted run cannot call itself covered (real tree, no copy)

```
node .../stagesweep.mjs --stages 0-4
  *** 1 stage(s) ADMITTED BY stageledger.py's BASELINE AND NOT SWEPT BY THIS RUN:
      stage $19=5  (NOT SWEPT: --stages)                            exit 1
node .../stagesweep.mjs --stages 0-4 --allow-partial                exit 0
      ("--allow-partial: accepted, and this run does NOT cover those stages.")
node .../stagesweep.mjs --stages 6
  6 stages reported ADMITTED and NOT SWEPT                          exit 1
```

### Test C - the guard renamed out from under the parser

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

### Test D - the second opinion unreadable

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

## §5. HASHES - the real tree is untouched

`sha256` over `sha256sum` of every `.js` under `games/gradius/{src,tests}`,
sorted, measured by me:

```
BEFORE all copy/mutation work  253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58
AFTER  the copy was deleted    253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58
```

(The same value W35 ended on, so W36's `src/` work had not landed while I ran.
It landed later in the session and the hash has moved since - by their edits,
not mine.) `git status --porcelain games/gradius/src games/gradius/tests` is
empty; the copy at `C:/tmp/w37demo` is deleted; no `gradius-stagesweep-*`
directory remains under `%TEMP%`.

Gate after the first change: `node games/gradius/tools/test-all.mjs` →
**GREEN - 12 passed, 0 failed, 0 SKIPPED** (4 m 35 s). Second full gate run
after the `chunkGeometry` fix: see FINAL NUMBERS.

### And the warn rules fired for real, unprompted

W36 lifted the `$A2F0` guard to `>= 7` while my second gate run was in flight,
so that run printed - correctly, and without failing:

```
  $19=6   debt             admits        SWEPT                   14
  7 of 7 stages swept (7 admitted, 0 forced behind the guard); 0 NOT SWEPT.
  ... stage $19=6 was swept and stageledger.py's BASELINE still calls it debt.
      Not a failure (the sweep covers MORE than the ledger claims); update
      BASELINE[6] when the wave that lifted the guard lands.
  OK -- 0 undecided throws on 7 admitted stage(s)
```

That is the coverage report doing its job on a live tree: the stage moved from
`SWEPT (forced)` to `SWEPT`, the forced section emptied itself, the per-stage
chunk count stayed 7, and the one artifact that had not caught up was named.

---

## §6. `tablecoverage.py` - the two secondary items

### 6a. The root-walk blind spot has NOT narrowed, and W34 did not aim at it

W34's extent work is on a **different axis**: it bounds reads whose base the
walk already found. The blind spot is about bases the walk never reaches, and
nothing since W33 has touched it except W35's one new root.

Measured by me this session, importing `tablecoverage` and using its own
decoder and `walk()`:

```
tool's own root set (42 $AE1C entries + $C413 + 5 stage-5 roots)
                                        2,868 PCs, 82 indexed PRG bases
the four straight-line frame entry points $80A1 $80A7 $80AA $9650, alone
                                        3,923 PCs, 84 indexed PRG bases
  bases those four reach that the tool's walk does NOT       59
  of those, in NO exported block                             26
    -- of which the tool's docstring already predicts 14 as the terrain and
       streamer tables decoded into terrain/stages.json rather than into a
       TABLE_FILES block: $9D4F $9D50 $9D6D $9D6F $9D73 $9FB4 $9FBC $9FBD
       $9FCC $9FCD $9FDC $9FDD $9FEC $9FED
    -- leaving 12: $8254 $82B4 $8893 $8894 $8AA8 $8B08 $8D9E $8D9F $8E9E
       $8E9F $9749 $99AE
```

**That is a LOWER BOUND and it is not comparable to W33's figure.** W33 reported
84 of 165 outside the walk (their number, not mine) from a root set that also
included every entry of six jump tables - `jt_$80D4`, `jt_$88AD`, `jt_$8989`,
`jt_$96C5`, `jt_$982F`, `jt_$C439` - and **W33 did not record those tables'
lengths**. Only two of the six are exported (`$AE1C`, `$C439`), so reproducing
165 means deciding four table lengths, which is inventing a denominator; I did
not. What I can say from my own numbers is that the walk went from 81 bases
(W33's reading) to **82** - W35's `$CDA5` root - while four entry points that
the frame demonstrably executes already reach **59 bases it does not see**. The
class is open.

**What closing it would take, concretely.** The blocker is not the roots; it is
`exported_blocks()`. Root the walk at the frame and ~26 unexported bases appear,
and at least 14 of them are *already exported* - decoded into
`terrain/stages.json`'s per-stage fields instead of a raw `TABLE_FILES` range.
So the tool would report 26 gaps of which 14 are false, and that is exactly why
its docstring records "`$9663` is DELIBERATELY NOT A ROOT" (rooting it turns
1 gap into 20, none real). The work is, in order: (1) teach `exported_blocks()`
to read `terrain/stages.json`'s decoded fields as covered ranges, (2) then move
the root set to the frame, (3) then triage the residue - starting with the 12
above - one base at a time against the listing, each landing either in an
export or in a named, reasoned `KNOWN_GAP` entry. Step (1) is the prerequisite
and it is a self-contained wave's worth of work.

### 6b. `$B7B5` -> `$B797` - UNTOUCHED, deliberately

Still OPEN, still printed on every run, and I did **not** widen the export. W34
measured that `$B797` is two entries inside a 26-byte block, so an overrun is
silent, and that entry 23 `$B7A1` never writes `$048C` itself - "so Y is
PROBABLY always 0". Proving the extent needs the listing (the writers of `$048C`
on that object, read one at a time), not another sweep, and the brief forbids
widening without that proof. Nothing in this wave reaches type `$97`. It stays
OPEN with W34's and W35's wording.

`tablecoverage.py` is unmodified this wave - `sha256 fba7e280ac4d`, measured by
me, and `git status --porcelain games/gradius/tools/tablecoverage.py` is empty.
Its own run today: OK, 82 bases, 55 ranges, 4 extent sites, 1 still OPEN.

---

## §7. WHAT I COULD NOT REACH - attempts, not absences

1. **Whether `stagesweep.mjs`'s seeding is a state the game reaches.** It seeds
   `$1B = $80` on a chunk's stream pointer with `$60 = 2` and the camera at 0.
   That is W34's fixture and I did not re-derive it. It is why `$99C4` was
   invisible to the sweep (W35 found it by scanning the listing) and it is the
   standing limit on everything this tool says. A forced sweep does not widen
   that: it only changes WHICH stages get the same fixture.
2. **Any cartridge comparison of anything in this wave.** Unchanged from W32b
   through W36. Every number here is port-vs-listing or tool-vs-tool.
3. **W33's 165-base whole-frame figure**, §6a - not reproduced, because four of
   the six jump-table lengths it depends on are unrecorded.
4. **Whether the five clean stage-7 chunks are clean or merely unreached.**
   600 forced frames each. The old tool ran 1400; I lowered the FORCED budget to
   keep the gate near 4 s, and that is a decision with a cost - `--force-frames
   1400` is one flag away and nobody has spent it.
5. **The `$83` null wave cursor** (W35 §10 item 1) is still the highest-value
   open item and the sweep still cannot see it: it never leaves `$1B = $80`.
6. **W36's `src/` work was landing while I measured.** One forced run picked up
   a half-edited tree (`h_AF10 is not defined`, a `ReferenceError` with no ROM
   address in it). Not a finding about the port; a finding about running a
   sweep against a tree another agent is writing. The numbers in §2 are from
   `src/enemies.js sha256 7265b5388bcb`, W35's committed state.

---

## §8. HANDED FORWARD

1. **`wavecensus.py` hard-crashes on a mid-edit `src/enemies.js`.**
   `_ported_targets()` does `src.index("function dispatch(state, rom, j, type)")`
   at IMPORT time, so `stageledger.py` - which imports it - dies with a
   `ValueError` traceback and the gate reports "a stage's coverage moved
   backward", which is not what happened. Seen this session (§FINAL NUMBERS).
   A `SystemExit` naming the file and the missing signature would cost three
   lines and would stop a tooling failure from being read as a coverage
   regression. Not fixed here: `src/` was being written throughout, so I could
   not have red-validated it against a stable tree.
2. **`--force-frames` is 600 and that is a budget decision, not a derived
   number** (the admitted sweep's 1400 is W33's, also not derived - W34 item 6).
3. **`tablecoverage.py`'s root set**, §6a: the ordered work is (1)
   `exported_blocks()` reads `terrain/stages.json`, (2) roots move to the frame,
   (3) triage the residue. Step (1) first, or the tool reports 26 gaps of which
   14 are false.
4. **`$B7B5`/`$B797`** - W34 item 1, W35 item 2, untouched again, §6b.
5. **`stagewaves.py` is still broken on the inline-5 stride** and
   `wavecensus.py`/`handlerclosure.py` are still not CI-wired (W34 items 4/5,
   W35 item 5). Untouched a third time.

---

## FINAL NUMBERS

```
stagesweep.mjs, W35's committed src (7265b5388bcb):
  admitted   96 chunk runs, 134,400 nmi() frames, 0 undecided throws
  forced     14 runs (stage $19=6, 7 slots x 2 modes), 4 threw:
             $AF10 x2 (f140, PASSIVE), $B569 x2 (f76, PLAYING)
  coverage   7 of 7 stages swept -- 6 admitted, 1 forced; 0 NOT SWEPT
  wall clock 3.2-3.6 s

demonstration (a COPY in the pre-W35 state, both tools, same tree):
  W34's stagesweep.mjs   stages 0..4, "OK -- 0 undecided throws", exit 0,
                         silent about two whole stages
  W37's stagesweep.mjs   exit 1; forced stage $19=5 reproduces W35's sixteen
                         frame numbers exactly (PASSIVE f533 f172 f41 f28 f16
                         f9 f9 f534 / PLAYING f377 f172 f41 f28 f16 f9 f9 f377,
                         $B480 x16, earliest frame 9)

seen to fail: --stages 0-4 (exit 1) -- --stages 6 (exit 1) -- guard renamed
              (exit 1, "FAILED STRING SEARCH") -- BASELINE row deleted (exit 1)
              -- and W37's own first cut, which exited 0 on the demo copy

tablecoverage.py   OK, 82 bases, 55 ranges, 4 extent sites, 1 OPEN ($B7B5).
                   Unmodified: sha256 fba7e280ac4d.
root blind spot    82 bases from the tool's roots; the four frame entry points
                   $80A1 $80A7 $80AA $9650 reach 59 more, 26 unexported, of
                   which 14 are the terrain/streamer decode. NOT narrowed.

gate, run 1 (W35's committed src, after the coverage work):
  node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
gate, run 2 (during W36's uncommitted src/tests edits, after chunkGeometry):
  RED -- 9 passed, 3 failed, 0 SKIPPED.  MY STAGE PASSED.
  The three failures are W36's in-flight tree, not this wave:
    unit tests                  -- games/gradius/tests, being written
    per-stage coverage ledger   -- wavecensus.py ValueError at import:
                                   "function dispatch(state, rom, j, type)"
                                   not found in a half-edited enemies.js
    comparison self-check       -- mutates the same src/
  `git status --porcelain games/gradius/src games/gradius/tests` at that moment
  listed 2 modified src files and 6 modified test files, none of them mine.

real tree, sha256 over sha256sum of every .js under games/gradius/{src,tests}:
  BEFORE all copy work  253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58
  AFTER  the copy went  253b352af64941e5f03b59c45cc9e2dd429b7fbc28f57cf5e52977cec4788a58
(it has moved since, by W36's edits; `git status --porcelain` for src and tests
was empty at both measurements)
```

Files changed this wave, all in `games/gradius/tools/`:
`oracle/stagesweep.mjs` (the work) and `test-all.mjs` (the gate stage's comment
and its FAIL note). Nothing in `src/`, `tests/`, or `games/ddpdoj/`. No gate was
weakened; the one relaxation, `--allow-partial`, must be typed and prints that
the run does not cover those stages.

status: DONE
