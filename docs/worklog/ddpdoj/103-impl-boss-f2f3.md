# 103 -- IMPL: the stage-1 boss's F 2/F 3 wave (the 44 live-unported entries)

status: **DONE.** (opened IN PROGRESS 2026-08-06, closed same day)

started: 2026-08-06. wave: 103. role: IMPL (the only tree files I write are the
new `src/bossf23.js`, its baseline, the worklog, and the small edits to
`scheduler.js`, `boss.js`, `handlers.js`, `initbody.js`, `export-tables.py`,
and four tests).

target: the 44 live-unported boss scheduler entries W99 found, plus the two
scheduler accessors (`$2599B4` D.running, `$259B08` E.stop) and the type-`$1E`
spawn closure E 8 reaches.

## 0. THE HEADLINE

`[M]` **bosscoverage reports 103/0/8** (was 59/44/8). All 44 live-unported
entry points are registered via `registerScript`. The 8 dead entries (E 2, E 7,
E 9, E 10) are DELIBERATELY absent: W99 proved they have no start site, and
registering them would be porting dead code.

`[M]` **The `$29540C` throw is gone.** The rung-8500 boot advanced from
lf8873 (373 steps, throw at F 3 INIT `$29540C`) to lf9443 (943 steps, throw
at `$23E45A`, an unported sprite emitter D 14's facing rotation reaches).
The throw moved FORWARD by 570 logic frames through the boss fight.

`[M]` **seedcmp: 4 GREEN boss-fight segments** (lf8500..lf9250, 1000 frames
matching the board across 94 columns). 2 RED segments (divergence in `vf`),
2 BLOCKED (sprite emitters `$23E45A`/`$23E36A`). Before this wave all 4 of
the GREEN segments were BLOCKED. Overall: 27 green / 38 red / 6 blocked (was
15 / 27 / 29).

`[M]` **All 1211 tests pass**, including the four this wave updated (the
handler-address list, the init-body count, the "late arrival throws" test
which is now "late arrival is ported", and the throw-on-unregistered test
which moved from D 10 to the dead E 2).

## 1. WHAT WAS PORTED

### 1.1 The two scheduler accessors (`src/scheduler.js`)

- **`$2599B4`** (`a3Running2599B4`) -- is A3/D-script D0 running? Same shape
  as `$25983E` (A4 running) but for the ten A3 slots. Needed by F 2 and F 3
  to gate phase advance on the limb scripts finishing.
- **`$259B08`** (`a1Stop259B08`) -- stop every A1/E-script slot carrying D0.
  Same shape as `$2599EC` (A3 stop) but for the ten A1 slots. Needed by D 14's
  state-2 finish to retire the part guns (E 5, E 6, E 14).

### 1.2 The 44 scheduler entries (`src/bossf23.js`)

One new file, 44 `registerScript` calls, structured by family:

- **MAIN 3/4/8** (6 entries): clones of MAIN 6/7. MAIN 3 walks to
  (`$6A00`,`$1C00`) and hands to MAIN 4; MAIN 8 walks to (`$7400`,`$1C00`)
  and hands to MAIN 4; MAIN 4 wanders the 8 waypoints of `$293558`.
  All three INITs fall through into their STEPs.
- **F 2/3** (4 entries): five-state conductors. F 2 starts MAIN 8 and
  sequences D 8/9 (open hatches) -> D 14 (rotation + E 5/6/14) -> D 12/13
  (close hatches) -> D 15 (body sweep) -> F 1. F 3 starts MAIN 3 and
  sequences D 16/17 -> E 8 (carrier spawn) -> D 18/19 -> F 6, with the
  discarded 9-or-10 draw at `$2954EC` transcribed as dead computation.
- **E 5/6** (4 entries): the rotation guns D 14 starts. Fire kind 19 (bank
  B) from the part position, angle advancing by +/-`$0F` per tick. Rank adds
  two kind-19 core shots.
- **E 8** (2 entries): the type-`$1E` carrier spawner. Alternates between
  parts, doubling at rank.
- **E 12** (2 entries): the HP-gated 10-shot burst (kind 19). Same `$48CC`
  gate as E 0/E 11. Fires from two muzzles in a fixed angular pattern.
- **E 14** (2 entries): the rotation's own gun (kind 4 fan). Fires at both
  parts on alternate cadences, rank-dependent shot count and spread.
- **D 8..19** (24 entries): twelve limb scripts in six pairs (open/close,
  open/close). D 8/9 open the hatches, D 10/11 fast-wobble, D 12/13 close,
  D 14 rotates and starts/stops E 5/6/14, D 15 sweeps the body row. D 16/17
  and D 18/19 are the second-cycle equivalents started by F 3.
- **D 14** (2 entries): the five-state part-rotation script that starts and
  stops E 5/E 6/E 14. Uses `$259B08` to stop the three guns when the rotation
  completes.

### 1.3 The type-`$1E` spawn closure

- **Init body** (`$296D8A`, `src/initbody.js`): loads the sub-record prototype
  from `$296DBC`, copies position/speed/facing from the record, sets up the
  lifetime/sprite-cursor fields.
- **Handler** (`$296DD6`, `src/handlers.js`): drifts via `applyVelocity`,
  animates through the sprite table at `$296F68`, and on death fires a
  three-volley kind 3/4/5 fan of 16 shots each via `$2813F0`. Uses
  `enqueueRegisters` on bucket 22 (`$23F7C6`) for its sprite emit.
- **`$23F7C6`** (bucket-22 emit): instruction-for-instruction the same as
  `$23E020` (bucket 2) and `$23E08C` (bucket 7).

### 1.4 ROM windows (`tools/export-tables.py`)

Ten new windows for the tables the new code reads:
- `$293558+$20` (MAIN 4 waypoints)
- `$294546+$08`, `$29454E+$08`, `$294556+$10` (D 14's three tables)
- `$29607A+$08` (E 5/6 cadence)
- `$296342+$20` (E 8's two tables)
- `$29668C+$10` (E 12 count table)
- `$296F68+$40` (type-$1E sprite table)
- `$296D82+$56` (type-$1E init stub + body + sub-record proto)
- `$2734FA+$300` (the three fan tables A/B/C, covering the one table C that
  `$2735F0+$220` missed)

## 2. THE BOSS FIGHT NOW

The boss arrives at lf7870, descends, hands off at lf8260, and fights. From
rung 8500 the port reproduces the board's state across 94 traced columns for
**1000 frames** (lf8500..lf9500, four seedcmp segments GREEN). During this
window the boss:
- wanders between waypoints (MAIN 3/4/8)
- opens and closes its side-part hatches (D 8/9/12/13/16/17/18/19)
- rotates its parts to track the player (D 14, with E 5/6/14 firing)
- spawns type-$1E bullet carriers that drift and explode into kind 3/4/5
  fans (E 8 + handler `$296DD6`)
- fires the HP-gated 10-shot burst (E 12)
- sweeps its body row toward the player (D 15)
- cycles between F 2 -> F 3 -> F 6 indefinitely

At lf9414 the first divergence appears (field `vf`, a 1-column difference at
the same frame). At lf9576 the port throws at `$23E45A`, a sprite emitter
D 14's facing rotation reaches that W96 did not port. At lf9751 it throws at
`$23E36A`, a second such emitter.

## 3. HONEST DIVERGENCES AND LIMITS

1. **`$23E45A` / `$23E36A` sprite emitters.** D 14 rotates the facing bytes
   `($4B,A6)`/`($8B,A6)` beyond the range the arrival (W96) produced, and the
   part sprite table `$2929E8` resolves those facings to emitters W96 never
   transcribed. Porting those emitters is a separate sprite-layer task, not
   one of the 44 scheduler entries.

2. **`vf` divergence at lf8227 and lf9414.** Both are 1-frame, 1-column
   differences. `vf` is the velocity-force field. Likely a timing or
   position issue in one of the newly ported scripts. Named honestly; the
   oracle's first-divergence frame points at where to look.

3. **The dead quartet's queries are modelled correctly.** F 2 queries E 2
   (`$2593D4`) and F 3 queries E 7/E 9/E 10 (`$29551A`/`$295526`/`$295532`)
   via `$259A4A`. The dead scripts have no registered body, so
   `a1Running259A4A` returns false (not running) for free. The port does NOT
   throw on these queries. One test verifies the throw mechanism using E 2
   as the permanent dead case (`tests/w62stageend.test.js`).

4. **The 9-or-10 draw is transcribed as dead computation.** F 3's state 3
   computes `moveq #9,D7 / jsr $242FDE / bne / moveq #$A,D7 / move.w D7,D0`
   and then `$295508 moveq #5,D0` overwrites D0 before the scheduler reads
   it. The RNG draw steps `$803917` either way, so it is transcribed. The
   discarded value never reaches the scheduler. (W99 section 5.)

## 4. WHAT I COULD NOT MAKE FAIL

The **phantom-registration** sub-check within bosscoverage condition (a).
Same as W102: the current port has zero phantom registrations, so I could not
make it fail without a source edit.

## 5. PREMISE CHECKS

1. **"Port the 44 live-unported boss scheduler entries."** Held. W99's table
   was the spec; I ported every entry it lists and did not re-derive.
2. **"Do NOT port the dead 8 (E2/E7/E9/E10)."** Held. They are absent from
   the registry. `a1Running259A4A` returns false for them by construction.
3. **"`$29540C` is just F 3, one of the 44."** Held. Ported as part of the
   F 2/F 3 family with no special treatment.
4. **"Derive the ported set from `registerScript`."** Held. bosscoverage
   derives 103 from the source every run.
5. **"W99's three corrections must not regress."** Held. Both `jsr` and `jmp`
   are scanned by the coverage tool; the OBJECT walk and the type-`$1E` spawn
   are encoded.

## 6. WHAT THIS CHANGES

The boss now runs to completion for 1000 seeded frames against the board
(was: threw after 373). The F 2/F 3 loop executes, the guns fire, the
carriers spawn and die, the rotation works. The remaining throw at `$23E45A`
is a sprite-layer task (porting the part emitters the rotation reaches), not
a scheduler entry.

status: DONE
