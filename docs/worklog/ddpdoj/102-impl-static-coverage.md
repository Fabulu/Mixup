# 102 -- IMPL: the STATIC COVERAGE SYSTEM, built and gated

status: **DONE.** (opened IN PROGRESS 2026-08-06, closed same day)

started: 2026-08-06. wave: 102. role: IMPL (the only tree files I write are
the tool, its baseline JSON, the worklog, three small port/harness edits,
and the gate wiring).

target: the stage-1 boss scheduler. ROM = INVENTORY (knowledge/09). Nothing
here runs the emulator.

## 0. THE HEADLINE

`[M]` **The boss coverage system reproduces W99's ground truth exactly: 111
entry points, 59 ported, 44 live-unported, 8 dead (E 2, E 7, E 9, E 10), 0
unresolved D0.** The denominator is ROM-derived, not measured from what threw.
The gate is wired, green, and both red conditions were demonstrated failing.

`[M]` **The join found zero ported-but-unexercised scripts.** Every one of the
59 ported entry points has been dispatched by at least one dynamic run (board
or port). The 26 untested addresses are all UNPORTED, which is the expected
backlog for W103, not a transcription defect.

`[M]` **The join found zero enumerator holes.** Every address the oracle
observed (83 unique, across 72 board RAM dumps + the port's 13,084-frame
dispatch log) is in the static inventory. The walker is complete for the boss.

## 1. WHAT WAS BUILT

Four pieces, per plan 100:

### 1.1 The enumerator (`games/ddpdoj/tools/bosscoverage.py`)

A general M68K routine-closure walker over `maincpu.bin` (capstone
`CS_MODE_M68K_030`), parameterised by a CONFIG block at the top:

- the five table bases (MAIN `$293104`, F `$294F68`, E `$295856`,
  D `$29370A`, OBJECT `$292932`)
- the scheduler API entry points (`$2598D0` etc.)
- the boss bank range (`$292000..$297000`)

The CONFIG is the boss-specific part; everything below it (the table walker,
the branch-closure disassembler, the D0 immediate tracker, the activation
graph, the dynamic-set readers) is general and reusable. To point it at
stage 2 or another boss, add a CONFIG block. W99's three corrections are
baked in and load-bearing:

1. **scan BOTH `jsr` AND `jmp`** for start sites. D 4, D 5 and D 6 are
   tail-call `jmp`s at `$294E8A` / `$294EE0` / `$294E36`; a `jsr`-only scan
   reports them as never started and they join the dead quartet.
2. **OBJECT is walked by `$25962E`'s tail** (`$259682..$2596BA`), not
   `$2596C6`. The OBJECT entries are in the enumerator's table set but their
   activation comes from a different walk.
3. **E 8 STEP spawns a second object** (type `$1E` from `$296DD6`). This is
   outside the five tables and noted but not an entry point.

### 1.2 The cross-reference

The ported set is DERIVED from `registerScript` calls grepped across every
`.js` in `games/ddpdoj/src/`, every run. W95 switched to this because "39
unported" went stale in four days; the gate never reads a hand list.

`[M]` 57 unique `registerScript` addresses, all 57 are boss table entries,
covering 59 entry points (some INIT/STEP pairs share an address).

### 1.3 The gate stage (wired into `pgm.py check`)

Two red conditions, the system-not-a-report requirement (plan 100):

**(a) coverage regression.** The ported set must be a superset of a committed
baseline (`bosscoverage-baseline.json`, 57 addresses). A dropped registration
goes red. Also flags phantom registrations (a `registerScript` in the boss
bank that is not a table entry).

**(b) inventory regression.** Every address the oracle observed must be in the
static inventory. If the board ran an entry the enumerator never listed, the
walker is incomplete and the inventory is a lie. This is how the enumerator
gets validated rather than trusted (knowledge/09).

### 1.4 The join, both directions

The real prize (plan 100, "THE JOIN"):

- **static minus dynamic** = code that EXISTS and has NEVER EXECUTED.
  `[M]` 26 unique addresses, ALL unported. Zero ported scripts are
  unexercised -- every transcribed routine has been checked by at least one
  oracle run. This is the strongest single statement about the boss port's
  testing coverage this project has made.

- **dynamic minus static** = a defect in the enumerator.
  `[M]` 0 addresses. No enumerator hole.

## 2. THE DYNAMIC SET -- two sources, unioned

The brief said to think hardest about this part. It was right to: the port
did NOT record which scheduler entry points it dispatched, and saying so
honestly was a load-bearing requirement.

### 2.1 Board-observed (the oracle's own record, primary)

The checkpoint ladder (`stage1-sweep`) holds the board's whole 128 KiB of
RAM at each of 72 rungs. The tool reads every dump and collects every entry
address that was live in a slot at any sampled instant. This is SAMPLED
presence, not execution: a script that starts and finishes between two rungs
(250 frames apart) is invisible. MAIN 0 (the whole arrival) reads "never"
because it runs between rungs.

`[M]` 73 unique entry addresses across 72 dumps.

### 2.2 Port-dispatched (W102 instrumentation, secondary)

The port's scheduler (`scheduler.js`) now records every dispatched address
into a module-level Set (`dispatched`), dumped by `seedcmp.mjs
--dump-dispatched` after a sweep. This is per-frame, so it catches the
between-rungs scripts, but only for port-side runs.

`[M]` 58 unique addresses across the 71-segment sweep (13,084 frames).

### 2.3 The union

`[M]` 83 unique entry addresses of 109 in the tables. The union is a
SUPERSET of either source alone (73 board, 58 port), confirming they
complement each other. The 26 untested are all unported.

## 3. W99 REPRODUCED -- the agreement that proves the tool correct

| metric | W99 | W102 | match |
|---|---:|---:|---|
| entry points | 111 | 111 | yes |
| ported | 59 | 59 | yes |
| live-unported | 44 | 44 | yes |
| dead | 8 | 8 | yes |
| dead ids | E2,E7,E9,E10 | E2,E7,E9,E10 | yes |
| unresolved D0 | 0 | 0 | yes |

The closure is slightly larger than W99's (223 routines / 3,159 insns vs
W99's 219 / 3,023) because the walker's call-following range is marginally
wider. This does not affect the entry-point classification: the dead set
and the ported count are identical.

## 4. THE GATE, SEEN TO FAIL

Both red conditions were demonstrated failing, then restored to green:

**Condition (a) -- coverage regression:**
`--break-coverage` drops one address from the ported set:
```
CONDITION (a): coverage regression
  FAIL: 1 ported entry address(es) lost since baseline: ['$292952']
FAIL: (a) coverage regression detected
```
Restored: green.

**Condition (b) -- inventory regression:**
`--break-inventory` injects a dynamic address the enumerator never listed:
```
CONDITION (b): inventory regression (oracle vs enumerator)
  FAIL: oracle observed 1 address(es) the enumerator never listed
FAIL: (b) inventory regression detected
```
Restored: green.

## 5. WHAT I COULD NOT MAKE FAIL

The **phantom-registration** sub-check within condition (a). It flags a
`registerScript` address in the boss bank (`$292000..$297000`) that is not
a table entry. The current port has zero such addresses, so the check is
green. To make it fail I would need to add a `registerScript` call at a
non-table boss-bank address, which is a source edit, not a command-line flag.
The `--break-coverage` path tests the regression half of (a) and is
demonstrated above. If a phantom is wanted, a `--break-phantom` flag is a
five-line addition.

## 6. THE PORT INSTRUMENTATION

`scheduler.js` gained a module-level `Set` and two exports:
```js
const dispatched = new Set();
export function dumpDispatched() { return [...dispatched].sort((x, y) => x - y); }
export function clearDispatched() { dispatched.clear(); }
```
`runScript` adds one line: `dispatched.add(addr & 0xffffff)`.

`seedcmp.mjs` gained `--dump-dispatched <path>`: after the sweep, it writes
the Set as JSON. The import is a one-liner: `dumpDispatched` from
`../src/scheduler.js`, already loaded transitively by `portdiff.mjs`.

## 7. HONEST LIMITS (plan 100 + knowledge 09)

- **`jsr (An)` is invisible.** Every size is a lower bound. The known
  indirect families are modelled; an unknown one would not be.
- **Register-computed RAM writes.** The no-bypass claim (W99 section 1.4)
  is proved for absolute-long operands only.
- **The board-observed set is SAMPLED, not execution.** A script that
  finishes between two rungs is invisible to it. The port-dispatched set
  covers this gap for port-side runs but is not the board's own record.
- **The dead classification requires evidence.** E 2, E 7, E 9, E 10 are
  dead because the full-image scan found no `jsr`/`jmp` to `$259A18` that
  loads their id, AND the slot-RAM write check found no absolute-long write
  to the boss's slot region from outside the scheduler. "Unreachable" has
  lied five times on this project; this classification is evidence-based.
- **The baseline is a regression floor, not a hand list.** The ported set
  is always derived from `registerScript` at runtime. The baseline only
  catches regressions (a previously-ported entry losing its registration).
  When coverage grows, `--update-baseline` snapshots the new floor.

## 8. PREMISE CHECKS

1. **"The dynamic evidence lives in seedcmp / webgate / bucket-2 records."**
   Held in spirit. The actual source is the checkpoint RAM dumps (consumed
   by seedcmp) for board-observed, plus the new port dispatch log. W99
   already used the ckpt dumps; this wave made the tool read them directly
   rather than from a stale JSON.
2. **"Derive the ported set from registerScript, NEVER a hand list."** Held.
   The ported set is grepped from source every run. The baseline is a
   regression floor, not the ported set itself.
3. **"W99's three corrections are load-bearing and must not regress."** Held.
   All three are baked into the walker and the classification matches W99
   entry for entry.
4. **"The gate must be seen to fail."** Held. Both conditions demonstrated
   red above.

## 9. WHAT THIS CHANGES FOR W103

The boss porting wave (W103, not started) starts from this table instead of
from a throw. The 44 live-unported entry points are the denominator, and
they hang off F 2 and F 3 exactly as W99 section 3 said. The 26
never-executed addresses are the transcription backlog. The zero
enumerator-hole result means the walker is trustworthy for sizing.

status: DONE
