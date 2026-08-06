# W22 IMPL - THE SPAWN SIDE: the stage-1 spawn walker

status: **DONE.** The port's spawn walker (`src/spawn.js`) drives stage 1's
**339 script spawns to the script terminator at 0 divergent** over the
wave-17-equivalent whole-stage corpus (**10,742 logic frames**, lf 1618..12359),
with the **`clock-per-frame` RED seen red** (6568/10742 divergent) and three more
mutations + three source-breaks all red. The deferred queue is ported and
**measured at 43 stage-1 spawns** (the plan's "33+") -- 5 more than the book
minimum, including **two script-less types** ($1C, $1E) that arrive through it
and no other door. Nothing ROM-derived is committed.

wave: 22 (plan W21, "the spawn side")   role: implementer (DAIOUJOU)
date: 2026-08-02
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`–`$2Axxxx`) unless the line says otherwise; `$2xxxxx` **below**
`$230000` is shared DATA/library, not build-A code. **No build-A address is
introduced anywhere in this wave.**

---

## 0. PROVENANCE - read before quoting one number

Every dynamic number below comes from a 16,000-lf invulnerable+auto-shot run of
stage 1 (`w22-spawn-stage1.tsv`) under the SAME two labelled interventions as
the wave-17 corpus (`docs/knowledge/09`): INVULNERABILITY (`$810424 := $FF` from
lf1250) and AUTOPILOT (auto-shot + L/C/R/C from lf1800/1900). It is the owner's
own routine. **VALID for coverage** (which records execute, which spawns land,
the cursor trajectory, the terminator); **[DIST]** invalid for pacing, density
and rank trajectory.

## 1. WHAT I PORTED

| file | what |
|---|---|
| `games/ddpdoj/src/spawn.js` | the walker `$2633BE`, the dispatch `$2633DE`, the **init+8** dispatch `$2635F6` (the +8 rule, the run-length stub read, the sub-record allocator call, the handler/player/scroll-locked writes), the sub-record allocator `$2635B2`, the deferred queue (`enqueueDeferred` `$263678`/`$263684`/`$263690`, `processDeferred` `$263446`), the stage-table install `$263386`, and the movement-pointer resolver `$2633FA` (resource #$1F noted) |
| `games/ddpdoj/tools/oracle/w22spawn.lua` + `w22run.py` | THE SPAWN LEDGER: per frame `clk / cursor($8132CC) / live($815E9C) / dq-count($815EA8) / claim-count`, plus one S-line per allocator claim (`$26371A` write tap) with its slot and type |
| `games/ddpdoj/tools/w22spawngate.mjs` | THE GATE: the port's `walkScriptLoop` driven frame-by-frame by the board's own `$8130CE`, cursor compared at 0 divergent, spawn counter to the terminator, + a 4-mutation RED sweep |
| `games/ddpdoj/tests/spawn.test.js` | **26 tests** (suite goes 308 -> **334 pass, 0 fail**) |
| `games/ddpdoj/tools/export-tables.py` | **+3 ROM windows** (36 total, 168,576 B): the stage table `$263336`, the stage-1 script `$230C6C`, the stage-1 aux table `$23170C`. The two enemy TYPE tables are reused from W20. |
| `games/ddpdoj/tools/oracle/pgm.py` | `check` runs the spawn gate (clean + RED) |

**NOT wired into the live frame loop** (like W20/W21): the init BODIES at
init+8 throw (W23) and the enemy handlers throw (W25), so a spawned enemy cannot
be drawn or moved yet. The walker is ported and validated; `state.js`'s
`WATCH_SPEC`/`CLAIMED` are unchanged -- there is no new ported write inside the
live frame, and adding one would be a claim I could not back.

### What is DELIBERATELY not ported, and throws by address

* **The 115 init BODIES at init+8** -- the routines that load prototypes through
  `$26377A`/`$2637A2` and run bespoke init. W23. `runInitBody()` throws carrying
  the address; the NULL inits (`$267814`/`$27E402`) short-circuit as written
  (their stub already wrote the zero run-length).
* **The resource lookup `$246CAC`** (resource #$1F = movement scripts) -- W24.
  The resolver `note()`s it and returns the aux offset as a placeholder pointer;
  nothing reads enemy+$12 this wave.
* **The enemy handlers** (the `($4C,A5)` dispatch the init stores) -- W25/W29.

## 2. THE HEADLINE - 339 to the terminator, frame for frame

```
$ node tools/w22spawngate.mjs
window lf 1618..12359 (10742 frames, reset at lf 12360)
RESULT cursor divergent: 0 of 10742 frames (100.0000 %)
SPAWN COUNTER port script=339 board script=339 (terminus REACHED at 339)
BOARD total allocations=382 (script 339 + deferred 43)
CURSOR at terminator: port=231704 board=231704 (want $231704 = $230C6C + 339*8)
```

The cursor at the end of the stage-1 window is **exactly `$230C6C + 339*8` =
`$231704`** on both sides (the `$FFFF` terminator). The clock is an INPUT (real
from W14, compared column `d0ce`); the walker reads it the way `$2633D0 cmp.w
$8130CE,D0` does. The install frame is lf1618 (cursor first non-zero), matching
W17's measured init landing exactly.

The **live-count** column (`$815E9C`) is MEASURED on the board (column 4 of the
TSV) but the port does not yet produce it: the live count is written by the
enemy driver `$263502` AFTER the handlers run, and the handlers are W25. So the
port's live count stays 0. Stated plainly rather than smoothed: **two of the
three done-when columns (cursor, clock) compare at 0 divergent; the third
(live-count) is board-measured and port-pending.** The spawn counter -- the core
of the done-when -- is 339 = 339.

## 3. THE CLOCK-PER-FRAME RED - and three more

```
$ node tools/w22spawngate.mjs --break all
RED [clock-per-frame]  divergent= 6568 of 10742 RED   <-- REQUIRED (plan §3)
RED [advance-by-7]     divergent=10397 of 10742 RED
RED [no-terminator]    divergent=10397 of 10742 RED
RED [trigger-low-byte] divergent= 7870 of 10742 RED
```

`clock-per-frame` feeds the walker `lf` instead of the board's `$8130CE`. The
clock is an odometer (`$26132C`, +1 per `$200` of scroll, W14), NOT a frame
counter; the first board spawn lands at lf1963/clk`$60` and a per-frame counter
would fire it at lf96. It diverges at lf96 and never recovers -- the W13/W16 RED
on the spawn side, exactly as the plan requires.

### Source breaks - three constants, changed one at a time, SHA-verified

```
sha256 BEFORE and AFTER all three, byte-identical:
  70ee530f6eef37772d68e73884290b26febf82eca9be52001f09815168d167a3  src/spawn.js
```

| break | the edit | tests red |
|---|---|---|
| A | `DEFQ_STRIDE` `$50` -> `$48` | **4 of 26** (queue cap + enqueue + drain) |
| B | `initBody = init + 8` -> `init + 7` (the +8 rule) | **1 of 26** (the +8 test) |
| C | walker `cursor += 8` -> `+= 7` (record stride) | **4 of 26** (cursor + dispatch) |

## 4. THE DEFERRED QUEUE - ported, and measured at 43

The deferred queue `$815EAA` is the ONLY door for the 47 script-less types
(plan W21). It is fed by the enemy handlers (`$263678`/`$263684`/`$263690`,
W25/W29, unported) and drained LIFO by the walker at the end of every script
pass (`$263446`). **The port drains it correctly** (unit-tested: LIFO pop, cap,
copy fields, init) but nothing feeds it yet, so over this corpus the port's
deferred count is 0 and the 43 board spawns are a measured gap, not a failure.

The board's queue held at most ONE entry at a time (max `dqct` = `$50`) on 43
frames -- handlers enqueue, the walker drains, every frame. The 43 deferred
spawns break down by type (claims minus the static script):

| type | claims | script | deferred |
|---|---|---|---|
| `$11` | 137 | 104 | **+33** (enemies spawning $11s -- the bulk) |
| `$10` | 24 | 16 | +8 |
| `$1E` | 4 | 0 | +4 (**script-less** -- arrives through the queue and no other door) |
| `$1C` | 1 | 0 | +1 (**script-less**) |
| `$82` | 30 | 33 | -3 (see below) |

**Two script-less types** (`$1C`, `$1E`) arrive PURELY through the queue --
exactly the mechanism `20-recon-enemy-census` named for `$1E` ("an enemy
spawned by another enemy"), now measured across the whole stage. The plan's
"33+" reads **43** on this corpus (the invulnerable run's rank trajectory is
distorted, §0; the honest range needs a no-intervention run, which the control
in W17 §6c showed reaches only 2,202 frames).

The `$82` -3: three more `$82` records exist in the script (33) than produced
allocator claims (30). This is a measurement artifact of the type-byte read
(slot+$C) at the sample point for spawns whose slot was reused within the same
frame by a later handler-driven allocation; the headline counts (339 script, 43
deferred, 382 total) come from the cursor and the cumulative claim tap, which
are not affected.

## 5. THE +8 RULE - ported and unit-tested both ways

Every one of the 256 type-table entries is an 8-byte stub `move.w #N,($4,A5) /
rts` (`20-recon-enemy-census`, verified mechanically). `initDispatch` calls the
stub (reading the run-length `N` from `init+2`, the immediate), then computes
**`init+8`** and calls THAT (the real body). The body throws (W23); a test
passes a no-op `bodyFn` to inspect the state the mechanism writes before the
body -- run-length at +$4, sub-record pointer at +$6, handler at +$4C, player
index at +$3, scroll-locked fixup at subrec+$4. Against the REAL tables, type
`$11` resolves init `$268714`, init+8 `$26871C`, handler `$2688CC` (the census's
§4 values), and the NULL type `$00` resolves the do-nothing stub `$267814`.

## 6. THE SUB-RECORD ALLOCATOR - `$2635B2`, band + run

Two pools, stride `$20`: common `$81459C` (100 slots, `$64`) and special
`$81521C` (50 slots, `$32`). Band selection is the class byte (`+$0D`) bit 7 OR
bit 5 -> special. The allocator finds `runLen+1` CONSECUTIVE free slots (the ROM
resets the consecutive counter on an occupied slot) and marks each `$8000`,
returning the first. Unit tests cover: common vs special band, run lengths 1 and
4, finding a run past an occupied slot, and pool exhaustion (returns null, the
`bcs $2635D4` carry path).

## 7. DENOMINATORS (static, from the ROM)

* **5 stages** x 16-byte entries at `$263336`; stage 1 = (script `$230C6C`,
  aux `$23170C`, res `$231852`), **339 records**, 21 types, 19 handlers,
  trig 96..488.
* **256 type-table entries** (LO `$267824` / HI `$27E412`, 8 bytes each = init,
  handler); 126 live, 130 NULL.
* **Deferred queue**: `$C80`/`$50` = **40 entries** cap (this corrected an
  earlier "25" in my notes -- `$C80` = 3200, `3200/$50` = 40).
* **Sub-record pools**: 100 (common) + 50 (special) slots, stride `$20`.
* Allocator claim tap PC: `$26371A` (`move.w D3,(A0)` with `D3 = idx|$8000`),
  the one write per successful allocation.

## 8. WHAT I COULD NOT REACH

1. **The 43 deferred spawns are not reproducible by the port.** The handlers
   that feed the queue (`$263678` etc.) are W25/W29. The port drains the queue
   correctly but produces 0 deferred spawns over this corpus. Closing this needs
   the scripted carriers (`$20`/`$21`), the midboss (`$0D`) and the regulars
   that re-spawn `$11`/`$10`.
2. **The live-count column.** Port-pending on the enemy driver's handler
   dispatch (W25). Measured on the board, not compared.
3. **The movement-script pointer** (enemy+$12) is a placeholder sentinel.
   Resource #$1F (the movement bytes) is W24.
4. **The `blt` past-due path is unexercised on this corpus.** The clock
   increments by exactly 1 (an odometer), so no trigger is ever past due and
   the skip-without-dispatch branch is never taken dynamically. It is ported
   as-written and covered by a unit test.
5. **Pre-existing `scroll program` gate failure** (9 of 12 columns diverge at
   lf3248). NOT this wave's regression: I verified it fails IDENTICALLY with my
   three W22 ROM windows removed from the export. Surfaced by the tables
   regeneration, owned by the scroll subsystem, not touched here.

## 9. THE COMMANDS

```
python games/ddpdoj/tools/oracle/w22run.py 16000 w22-spawn-stage1   # ~6.5 min
node games/ddpdoj/tools/w22spawngate.mjs                            # GREEN
node games/ddpdoj/tools/w22spawngate.mjs --break all                # 4 RED
node --test games/ddpdoj/tests/                                     # 334 pass, 0 fail
python games/ddpdoj/tools/oracle/pgm.py check                      # spawn gate PASS
```

status: **DONE**
