# Wave 3 test hardening - the enemy code nothing was watching
status: DONE
wave: 3   role: test   started: 2026-07-29

## The task, as I understood it

TEST WRITER for wave 3 (Enemies exist: pool substrate, spawn engine, update
loop, the fan). I write tests ONLY - files under `games/gradius/tests/` and, if
a scenario is needed, entries in `games/gradius/tools/oracle/scenarios.json`
plus harness support. I do NOT change `games/gradius/src/`.

Wave 3 shipped a GREEN gate at `e1d0772`. Two independent readers then mutated
the source on scratch copies and found a long list of ported routines that could
be corrupted - in one case three ways at once - with the whole gate still green.
My job was to close that list, and every check I write must be SEEN TO FAIL.

## What I did

1. Read `docs/worklog/README.md` in full and `docs/knowledge/01` and `03`.
   Opened this file with `status: IN PROGRESS` before touching anything.
2. Measured the baseline myself: `node --test games/gradius/tests/` → 110 pass,
   0 fail, 0 skipped. `md5sum games/gradius/src/enemies.js` →
   `90a2b77f732d7d77d7ad8ae18612f1fd`, the same hash the reviewer recorded, so
   the tree I worked on is the tree they audited.
3. Dumped the ROM tables the new tests pin (`assets/enemies/tables.json`, which
   is the cartridge cache) and wrote the MEASURED values into the tests rather
   than deriving them through the same code under test.
4. Wrote `games/gradius/tests/enemies-unwitnessed.test.js` - 30 tests.
5. Strengthened the one existing test that had docs/knowledge/03 shape 4
   (`'$5B freezes handler 1 (the capsule) but NOT handler 3'`).
6. Extended the oracle watch list by 30 addresses and RE-RECORDED the whole
   corpus from `Gradius (USA).nes` myself.
7. Ran 65 deliberate breaks on a scratch copy of the port, hashing before and
   after every one.
8. Ran the whole gate.

## What I MEASURED

### The gate

```
$ node --test games/gradius/tests/
# tests 140
# pass 140
# fail 0
# cancelled 0
# skipped 0
# todo 0

$ python games/gradius/tools/oracle/scen.py
=== ORACLE CORPUS: 18 scenarios, align frame 400, 354 watched addresses ===
  enemy-waves   1866 frames  lag=1 [283]  slotsVisited 32..32  msExpanded/f 5.82  stored/f 13.50
  ... (18 scenarios) ...
  written to ...\games\gradius\tools\oracle\out\scen  (ROM-derived, gitignored)
  real 3m25.989s

$ node games/gradius/tools/test-all.mjs
  18 scenarios, 5045 of 5888 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515, speed3-diag@529),
  0 failures, 0 clamps uncovered, 0 stale annotations,
  9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
                    w_0019 w_0024 w_004C).
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  port trace shape == probe.lua state vector
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

110 → **140** unit tests. The nine SKIPPED are FIELDS, not stages, each with a
printed reason; the stage skip count is 0. Unchanged from the pre-wave baseline.

`enemy-waves` compared field count went **351 → 381 TIER 1** (382 compared),
because of the watch-list extension below. **143 of 382** compared fields never
change value in that scenario, up from 113 - the 30 new ones are all constant,
which is stated explicitly in `scenarios.json`'s note rather than left to be
discovered.

### Why the holes existed: the dispatch census

Reproduced from the reviewer's instrumentation and consistent with everything I
saw: over all 18 scenarios the handler histogram is

```
{"$B0AF": 23840, "$B26C": 4053, "$B205": 434}
```

THREE targets of the eight that are ported. `$AE99`, `$AEDD` and `$AEE1` are
reachable only from `$BE93` (the kill routine, wave 6). Nothing in stage 1's
first 1465 frames dies, so no scenario can reach them. That single fact explains
every mutation that survived wave 3.

### The mutation table

65 deliberate breaks, all on a scratch copy at
`…\scratchpad\g` (a `tar` copy of `games/gradius`, `md5` verified equal to the
repo's at the start). Runner: `…\scratchpad\w3t_mut.py` +
`w3t_muts{,2,3,4}.json`. Every mutation asserts its anchor appears **exactly
once** before writing (docs/knowledge/03: never regex a structured file), and
the runner **re-hashes the file after restoring and aborts if it differs** -
`all md5-restored: True` for all 65. The repo's `src/` was never edited; final
`md5sum games/gradius/src/enemies.js` = `90a2b77f732d7d77d7ad8ae18612f1fd`,
identical to the start.

Baseline noise: the scratch copy's `page-wiring.test.js` fails 5 tests with
`ERR_INVALID_URL_SCHEME` because it resolves a dynamic import against the
scratchpad path. That set is subtracted from every row; it is an artifact of
where the copy lives, not of any mutation.

**60 RED, 5 GREEN.** The five GREEN are diagnosed below and are not holes.

| # | mutation | site | → test(s) that went RED |
|---|---|---|---|
| 1 | `$AE9E` timer `5` → `99` | h_AE99 | $AE99 plays one metasprite per FIVE frames…; $AEA3 script pointer; $AEB2/$AEB5 cursor |
| 2 | `$AEB5 INC $042C,X` deleted | h_AE99 | same three |
| 3 | `$AEA3` ASL dropped (`animFrame<<1` → `animFrame`) | h_AE99 | $AEA3: the script is picked by $016C,X * 2 |
| 4 | `$AEBF BEQ` inverted (carrier test) | h_AE99 | 6 tests incl. the gold-capsule race |
| 5 | `$AECC AND #$0F` → `#$03` | h_AE99 | $AEC6/$AECC: one capsule in SIXTEEN is gold |
| 6 | `$AECC BEQ` inverted | h_AE99 | gold; carrier promotion; the gold race |
| 7 | `$AEC1 LDA #$01` → `#$02` | h_AE99 | $AEBC/$AEC1 carrier promotion |
| 8 | `$AEC8 INC $47` deleted | h_AE99 | gold; carrier promotion; the gold race |
| 9 | **`$ADAB` loop reversed to 0..9** | updateEnemies | **$ADAB runs 9 DOWN TO 0 … gold capsule** |
| 10 | `tail()`'s fall-through into `$AEDD` deleted | tail | $AEDA falls through into $AEDD and $AEE1 |
| 11 | **`h_AEDD`'s fall-through into `$AEE1` deleted** | h_AEDD | **$5B freezes handler 1 … (the strengthened test)**; $AEDA falls through |
| 12 | `tail()` calls `$AEE1` directly, skipping `$AEDD` | tail | $AEDA respects $5B |
| 13 | **`$ADE8 BMI` arm dropped** | updateSlot | **$ADE8 BMI: bit 7 of $010C,X suppresses the animator** |
| 14 | `$ADEA BEQ` arm dropped (control) | updateSlot | 8 tests |
| 15 | `$ADF1 LDA #$06` → `#$05` | updateSlot | $ADE5's animator (pre-existing); $ADE8 BMI |
| 16 | **`$B154` carry term dropped** | addX16 | **$B154 is a REAL 16-bit add** |
| 17 | **`$B154` fraction term dropped** | addX16 | same |
| 18 | `$BBF9 CMP #$03` → `#$02` | enemyBullets | $BBF4 type filter |
| 19 | `$BBF6 AND #$7F` dropped | enemyBullets | $BBF4 type filter |
| 20 | `$BC02 BCS` boundary `>=` → `>` | enemyBullets | $BC02 reloads on BORROW at 0 |
| 21 | **`$BC04` reload gate removed** | enemyBullets | **$BC04: a zero $04EC … does NOT leave the loop** |
| 22 | `$BC0F` leave-the-loop → `continue` | enemyBullets | $BC0F at most ONE enemy per frame |
| 23 | `$BBEE LDX #$09` walked upward | enemyBullets | $BC02; $BC0F |
| 24 | `$BBB7 BNE $BC19` arm dropped | enemyBullets | $BBB7: a non-zero $5D skips the countdown |
| 25 | **`$BC56 BCC` boundary `>=` → `>`** | fireBullet | **$BC56: strictly to its left** |
| 26 | `$BC23` tripwire → `if (false)` | bulletUpdate | $BC23: a live bullet slot is a LOUD throw |
| 27 | **`$B0DE CMP #$80` → `#$90`** | h_B0AF | **$B0DB: the fan splits at exactly Y = $80** |
| 28 | `$B0DE CMP #$80` → `#$7F` | h_B0AF | same |
| 29 | `$B0D2 CMP #$60` → `#$61` | h_B0AF | same |
| 30 | `$B0D6 LDA #$40` → `#$30` | h_B0AF | same |
| 31 | **`$B111` `>=` → `>`** | homeDown | **$B109/$B117 exactly** |
| 32 | `$B11D` `<` → `<=` | homeUp | same |
| 33 | `$B0F7 BEQ` fires at 1 | curveStep | $B0F7: the 64-frame curve timer |
| 34 | `$B0CC` RTS given sub-state 3's body | h_B0AF | $B0CC: sub-state 4+ is a bare RTS |
| 35 | `$B2A8`'s always-zero store removed | closeDown | $B2A5/$B2CB: the phase counters |
| 36 | `$B2CB`'s always-zero store removed | closeUp | same |
| 37 | `$B289 LDA #$3A` → `#$3B` | h_B26C | $B26C picks one of THREE metasprites |
| 38 | `$B2A0 LDA #$38` → `#$37` | closeDown | same |
| 39 | `$B296 BCC` inverted | h_B26C | same |
| 40 | `$B294 BEQ` dropped | h_B26C | same |
| 41 | `$B0B4` ADD → OR | setInitialised | $B0B4 is an ADD, not an OR |
| 42 | `$B1BC LDA #$FE` → `#$FD` | seedArc | $B0B4 is an ADD, not an OR |
| 43 | `$ADAB STA $AF` `$80` → `$00` | updateEnemies | $ADAB's $AE/$AF preamble |
| 44 | `$ADAF STA $AE` deleted | updateEnemies | same |
| 45 | `$B265 CMP #$C4` → `#$C5` | offScreenCheck | $B251: the off-screen box (pre-existing) |
| 46 | **`$A44A CMP #$0B` removed** | emitMember | **$A44A/$A450: type $0B … NO capsule id** |
| 47 | `$A450 CMP #$04` removed | emitMember | same |
| 48 | **`$A427` 8-bit wrap → 32-bit `*3`** | emitMember | **$A427: the pattern index in EIGHT bits** |
| 49 | **`$8409 INC $01,X` deleted** | addCursor | **$8409: the wave cursor carries across a page** |
| 50 | **`$A2DF AND #$0E` → `#$0F`** | loadChunk | **$A2DF: the chunk index drops bit 0** |
| 51 | **`$A2F2 CMP #$81` → `#$83`** | runEngine | **$A2F0/$A2F7: sub-state $81 is a bare RTS** |
| 52 | `$A2F7` `$82` arm silenced | runEngine | same |
| 53 | `$A52B STA $0496,Y` dropped | clearSlot | $A527 clears 21 arrays … (pre-existing) |
| 54 | `$A52E STA $0460,Y` dropped | clearSlot | same |
| 55 | `$A566 STA $0440,X` dropped | clearSlot | same |
| 56 | allocator walked upward from 0 | allocEnemySlot | 6 tests |
| 57 | `$A4A6`'s DEX/BNE normalised to BPL | allocEnemySlot | the allocators scan DOWNWARD… |
| 58 | `$6C` reloaded on allocation failure | emitMember | an allocation FAILURE drops the member… |
| 59 | `$ADAB` given a `type === 0` fast path | updateEnemies | 36 tests |
| 60 | `work.enemySlots = 0` reset removed | updateEnemies | 22 tests |

Every one of the 30 new tests, and the strengthened `$5B` test, appears in the
right-hand column at least once. No new test is decoration.

### THE FIVE DELIBERATE BREAKS THAT PASSED - and why

Per the brief these are the most valuable finding. All five are cases where the
CARTRIDGE'S OWN DATA makes the parameter inert, not cases where a scenario is
missing. Three of them can never be pinned by any test, and saying so is the
point.

1. **`b26c-seed-1E-to-1F`** (`$B298 LDA #$1E` → `#$1F`) and
   **`b26c-seedup-1E-to-1F`** (`$B2BB`). GREEN, and STRUCTURALLY UNPINNABLE.
   `$B2A5 DEC $046C,X / BEQ $B2AF / LDA #$00 / STA $046C,X` zeroes the counter
   on the same frame it is seeded, unconditionally, so no instruction anywhere
   ever reads the seeded value. There is no state in which $1E and $1F differ.
   I turned this from an unknown into a stated invariant instead: the new test
   `'$B2A5/$B2CB: the phase counters are ALWAYS left at zero'` drives seeds
   0/1/2/$1E/$FF through both arms and asserts 0 every time, and the two
   mutations that make the counters count for real go RED.
2. **`spawn-6d-mask-F8`** (`$A408 AND #$F0` → `#$F8`). GREEN, and unpinnable
   from cartridge data. MEASURED, dumping the 2-byte formation table at `$A592`
   myself: the 21 real formations are
   `f4 f4 f3 f2 f2 f4 f4 f4 f4 f5 f5 f3 b5 f3 f3 f3 f4 f4 f4 f4 b3`, so the
   member counts (low nibble) are `4 4 3 2 2 4 4 4 4 5 5 3 5 3 3 3 4 4 4 4 3`
   - **max 5**. No formation in the game has 8 or more members, so `AND #$F0`
   and `AND #$F8` are the same function on every input the ROM can supply.
3. **`form-x-nowrap`** (`$A3E6 ASL` written as a 32-bit `* 2`). GREEN, same
   shape. MEASURED, dumping `$66` from all 24 descriptors in table B at `$A602`:
   `0 1 2 3 4 0 1 2 3 9 10 11 12 17 18 8 8 18 19 20 14 15 4 3` - **max 20**, so
   `$66 << 1` never leaves 8 bits. Also not reachable from a test at all:
   `formationSetup` is not exported and `$66` is only ever written by
   `loadDescriptor` out of ROM. Pinning it would need `src/` to export the
   function, which is not my change to make.
4. **`b26c-anim-3A-to-3B`** was GREEN in the unit layer on the first pass. That
   one WAS a real hole and I closed it: the new test
   `'$B26C picks one of THREE metasprites from the sign of (enemy Y - player Y)'`
   turns it RED, along with three more breaks on the same three-way branch.

### The watch-list extension, and the honest result

`src/enemies.js` `clearSlot()` justifies its reading of the two Y-indexed stores
with "the watch list compares addresses". For `$0460+j` (`$A52E`) and
`$0480+22+j` (`$A52B`) it did not - neither range was watched - and `$044C-$0455`
(the X sub-pixel velocity `$B154` adds) was the one of the twenty-one X-indexed
arrays missing too. I added all 30 addresses and re-recorded from the ROM:
324 → **354 watched**, `enemy-waves` 351 → **381 TIER 1 fields**.

Then I measured whether that actually bought anything, on the scratch copy,
running `compare.mjs` over all 18 scenarios:

```
clear-drop-0496  ($A52B removed)  -> 0 failures
clear-drop-0460j ($A52E removed)  -> 0 failures
clear-drop-xvelf ($A566 removed)  -> 0 failures
```

**It did not.** The QA's suggested "cheapest fix (a) … gives finding 2 teeth" is
WRONG as measured, and I am writing that down rather than quoting it. Nothing in
the corpus ever puts a NON-ZERO value into any of the three arrays, so clearing
them is a no-op on every frame and dropping the clear is invisible however many
addresses are watched. The detection still comes from
`tests/enemies.test.js`'s 21-array enumeration, which reddens on all three.

The extension is still worth having, and I proved the addresses are LIVE rather
than decorative with a positive control - `$B1B9 STA $044C,X` storing `$40`
instead of `0`:

```
w_044E: FIRST divergence at frame 1853 (13/1465 frames differ)
w_044F: FIRST divergence at frame 1725 (141/1465)
w_0450: FIRST divergence at frame 1789 (77/1465)
w_0451: FIRST divergence at frame 1786 (80/1465)
w_0452: FIRST divergence at frame 1722 (144/1465)   <- the first $B205 dispatch
w_0453: FIRST divergence at frame 1850 (16/1465)
... 55 failures
```

Before the change those six fields did not exist and the same bug was visible
only indirectly, through `$036C`. Now it is attributed to the byte that is
wrong. `scenarios.json` says all of this at the data, per rule 5.

## What I could not do, and why

* **`$A408 AND #$F0` and `$A3E6 ASL` cannot be pinned by any check** - see the
  measurements above. They are inert on every input the cartridge's own tables
  can produce. Left unpinned and documented, not papered over.
* **`work.enemySlots` is reset only inside `updateEnemies()`** (the reviewer's
  finding 5). On a frame where `stagePlay()` does not reach `updateEnemies()`
  the port reports the previous frame's 10 while `objloop.lua` reports 0, so the
  field cannot distinguish "the loop ran ten times" from "the loop did not run".
  That is a one-line fix in `src/oam.js`-style reset placement and it is a SOURCE
  change; I am the test writer. It is latent today (I confirmed `enemySlots == 0`
  occurs only on frames outside every compared window). **Left for the next
  implementer.**
* **There is still no pixel layer for the Gradius port.** `games/gradius/tests/`
  has no visual test; `tests/visual/renderer.test.js` belongs to the Batman port.
  docs/knowledge/01's layer table calls this out and trap 2 is exactly the bug it
  hides. Wave 3 is the first wave that puts new sprites on screen and the only
  check on them is the display LIST. Out of scope for a test-hardening pass that
  cannot add a capture pipeline; flagged, not fixed.
* **`$AE99` remains unwitnessed by the CARTRIDGE.** All 10 new tests on it are
  unit tests against the ROM's own script and dispatch tables. Only wave 6's
  `$BE93` can produce a type-2 object, so no scenario can compare it frame by
  frame. That is a coverage bound, and it is stated in the file header rather
  than left to be inferred from a green run.
* **`$BC44`'s fire path and slots 22-31** still have no scenario: `enemy-waves`
  parks the ship at X = 240 and every stage-1 enemy spawns at $F0, so
  `playerX >= enemyX` on every call. I pinned the BOUNDARY in a unit test (the
  equal case must not fire, one pixel left must reach the unported throw), which
  is the most a test writer can do without a scenario that flies the ship past a
  squadron - and that needs `$BDD5` ported first, or the throw fires.

## What I RULED OUT

* **That the wave-3 port is wrong anywhere.** 60 of 65 breaks reddened, and the
  5 that did not are inert-by-data, not wrong-by-code. I found no divergence and
  I did not need a single `knownFail`.
* **That the oracle side is hand-tuned.** I re-recorded all 18 scenarios from
  `Gradius (USA).nes` myself (3m26s) with the extended watch list and the gate
  stayed GREEN at 5045 of 5888 frames, with the 17 pre-existing scenarios
  unchanged at 3580 frames.
* **That the extra watch addresses broke the shape check.** `port trace shape ==
  probe.lua state vector` PASSES with 354 addresses; `peek()` already resolved
  `$0440-$04A0` in full, so no harness change was needed.
* **That I touched `src/`.** `git status -- games/gradius` shows only the two
  test files and `scenarios.json`. `md5sum games/gradius/src/enemies.js` is
  `90a2b77f732d7d77d7ad8ae18612f1fd` before and after, and every one of the 65
  mutations was hash-verified restored by the runner itself.

## If someone picks this up cold

* The 30 new tests are in `games/gradius/tests/enemies-unwitnessed.test.js`.
  Its header explains WHY it is a separate file: it exists because two readers
  mutated wave 3's source and found ported code with nothing on it.
* Every test comment carries a `RED WHEN:` line naming the mutation that reddens
  it. If you change one of those lines and the test still passes, the test has
  rotted - re-derive it, do not delete it.
* The mutation rig is at `…\scratchpad\w3t_mut.py` with
  `w3t_muts{,2,3,4}.json`, operating on `…\scratchpad\g`, a `tar` copy of
  `games/gradius` plus a `{"type":"module"}` package.json. It asserts anchors,
  subtracts the scratch-path baseline, and hashes the file after restoring.
  Reuse it; do not mutate the repo in place.
* The three constants that cannot be pinned (`$A408`'s mask, `$A3E6`'s ASL,
  `$B298`/`$B2BB`'s $1E seeds) are unpinnable because of what is in the ROM's
  tables, not because a scenario is missing. Do not "fix the coverage" for them.
  If a later stage's data ever has a formation with 8+ members or a `$66` above
  127, they become pinnable and that is worth re-checking.
* The next two things worth doing, in value order: (a) a pixel layer for this
  port; (b) move `work.enemySlots`'s reset out of `updateEnemies()` so it can
  tell "did not run" from "ran ten times".
