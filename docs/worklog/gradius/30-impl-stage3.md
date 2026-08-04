# Wave 30 IMPLEMENTER -- stage 3 ($19=2) plays start-to-finish

status: DONE (with one named UNRESOLVED item -- no stage-3 both-sides
cartridge comparison was recorded; see "WHAT I COULD NOT REACH")
implementer, 2026-08-04

Scope (from the brief + `29-plan-whole-game.md` W30): make stage 3 (`$19 = 2`)
play start to finish. The heaviest stage. Five new handler routines + the
inline-5 ROUTE (the stride-change trap) + one wiring fix:

- the inline-5 route `$A37A` loader + `$A466` splitter (cmd >= `$F0` ⇒ 5-byte
  records). STRIDE CHANGE -- a misparse desynchronises the whole remaining
  stream.
- `$A46F` (the moai-spawn arm, `$19==2` ⇒ force `$030C := $96`)
- `$C906` (~180 lines, the moai: nametable-patching destructible, `$0700,Y`
  ring buffer, rank reopen `$C936`)
- `$B7A1` (~187 lines, bespoke mover) + the `$C686` stage-3 wiring fix
- `$B4FD` (entry 28) + the shared pair `$B402`/`$B434` (entries 13/14)

DONE-WHEN: `python games/gradius/tools/stageledger.py` shows stage `$19=2`
complete, and `node games/gradius/tools/test-all.mjs` GREEN with 0 SKIPPED.

---

## LOG

(updated as findings arrive)

### 2026-08-04 -- opened. BASELINE MEASURED before any edit

`python games/gradius/tools/oracle/stageledger.py` (NB the brief's path
`games/gradius/tools/stageledger.py` does not exist; the tool lives under
`tools/oracle/`):

```
stage  distinct  ported   unported  inline5  ported %     first unported
2      78        28       5         45       35.9         scroll $00E0  (@$A9CB)
```

---

## INLINE RECON (read out of rip/prg.asm before any src/ edit)

### 1. THE INLINE-5 STRIDE -- verified against the listing

The stride is **2 bytes normally, 5 when `cmd >= $F0`**. (The plan's wording
"5-byte records vs the 4-byte default" is loose: the 4 is the DESCRIPTOR the
2-byte record's cmd indexes, not the stream stride.)

```
A335  INC $5D
A337  LDY #$00 / STY $9A / STY $9B / LDX #$00
A33F  LDA ($6A),Y      Y=0  -> the TRIGGER byte; $FF ends the stream
A346  INY / LDA ($6A),Y  Y=1 -> the CMD, stashed in $98
A34B  CMP #$F0 / BCS $A37A          <-- THE SPLIT
A34F  LDA #$02 / LDX #$6A / JSR $8402        cursor += 2   (normal)
...
loc_A37A:                              X is STILL 0 from $A33D
A37A  LDY #$00
A37C  LDA ($6A),Y / INY / STA $63,X / INX / CPY #$05 / BCC $A37C
        -> the FIVE bytes land in $63,$64,$65,$66,$67
A386  LDA #$05 / LDX #$6A / JSR $8402        cursor += 5   (inline)
A38D  LDA $64 / SEC / SBC #$70 / STA $64     $64 := cmd - $70  (>= $80)
A394  JMP $A466
```

So an inline-5 record is `[trigger][cmd $F0-$FF][b2][b3][b4]`. `$63` receives
the trigger and is never read again (scratch). `$64` is the cmd MINUS $70.

`$A466` splits on the stage, and it is an EQUALITY test, not a range test:

```
A466  LDA $19 / CMP #$02 / BEQ $A46F / JMP $A4A6
```

so every stage except in-game stage 3 routes to `$A4A6` (the stage-5
terrain-mounted arm, deferred to W32 by the plan). `$A4A6` must stay a LOUD
throw, and it is still reachable from `$C653` (`$C676 JSR $A4A6`, stage 5's
late-spawner arm, also still throwing).

### 2. `$A46F` -- the moai spawner (stage 3 only)

```
A46F  LDX #$09 / loop LDA $030C,X / BEQ $A47A / DEX / BPL   (DEX/BPL: tests slot 0)
A479  RTS                                the spawn is DROPPED on a full table
A47A  LDA #$01 / STA $5D                 an absolute STORE, not the INC at $A335
A47E  STX $A8 / JSR $A527                clearSlot
A483  LDX $A8 / STA $69                  <-- $69 := sub_A527's EXIT A (see below)
A487  $010C,X := $64                     status  = cmd - $70   ($80..$8F)
A48C  $032C,X := $65                     Y position
A491  $03BC,X := $66                     nametable addr HI  (yvel, reused)
A496  $03EC,X := $67                     nametable addr LO  (yvelf, reused)
A49B  $030C,X := $96                     type $96 -> entry 22 -> $C906
A4A0  $036C,X := $F0                     X = $F0 (right edge)
A4A5  RTS
```

`$A483 STA $69` is NOT a typo in the listing: A is whatever `sub_$A527` left,
and `sub_$A527` ends `$A56E LDA #$00 / ... / $A577 RTS` -- see below. The port
must reproduce the VALUE, not guess it.

### 3. `$C906` (entry 22, type $96) -- the moai. Span `$C906`-`$CA28` PLUS the
   continuation `$C77C`-`$C821` and the helper `$C822`-`$C87A`.

READ PAST THE APPARENT END: `$C916 JMP $C77C` has nothing returning to it --
`$C77C` is the DESTROYED continuation and it sits BEFORE `$C906` in the ROM.
`$C77C` ends at `$C821 RTS`. `$C822` (`sub_C822`) is its collision-map helper.

- `$A9` := `$010C,X & $0F` = the moai VARIANT (0..3), from the record's cmd.
- `$046C,X` (`s0460`) is the HIT COUNT; `>= 3` -> destroyed -> `$C77C`.
- otherwise `JSR $AEDD` (drift left 0.5 px/frame, free below X=8), then gates:
  `$5D != 0` -> RTS; `$0E >= 4` (VRAM queue not empty) -> RTS;
  `$04AC,X != 0` -> DEC and RTS.
- `$048C,X` is the OPEN flag. Closed -> `$C95A` proximity test against the
  ship; open -> `$C93D` close.
- both arms land on `loc_$C9BA`, which appends **VRAM QUEUE packets at
  `$0700`** -- `$0700` is the port's `state.vram.q` / `$0E` = `state.vram.cursor`
  (src/vram.js), NOT a new substrate. The recon's "plasma-ring buffer" is the
  ordinary nametable queue.
- the moai's nametable address lives in `$03BC:$03EC` (yvel:yvelf), planted by
  `$A46F` from record bytes 3 and 4.
- rank reopen timer `$C936` = `$50 $4B $46 $41 $3C $28 $1E` (7 rows, `$17`).
- tile table `$CA29`, indexed by `$AA` = `$A9*4` (open) or `$A9*4 + $10` (close).

`$C77C` (destroyed): `INC $5F`; **`$5F >= $0A` -> `$39 := 1`, the WARP** (the
same `$39` W27 already routes); `INC $5D`; `JSR $844F` (+$0300); `JSR $C822`
(patch the `$0500`/`$0600` collision map); build the rubble nametable packets
from the pointer table `$C893`; `LDA #$0C / JSR $CB26` -> sound $0C +
`$CB2B` explodeInPlace (both already ported).

### 4. `$B7A1` (entry 23, type $97) -- span `$B7A1`-`$B8E5`, data at `$B852`
   INSIDE it. Reached by ONE stage-3 wave record and by the `$C686`
   late-spawner arm. Calls `$B690` (ported), `$844F`, `$CB26` (ported), and
   **`$BD2C`** -- an entry INTO the middle of `aimBullet`'s tail.

### 5. `$B402`/`$B434` (entries 13/14) share `loc_$B407`; both tail into
   `loc_$B212` (which is inside `st_$B205` and already transcribed in the
   port's `h_B205` init block). `$B434` also uses `loc_$B1F1`/`loc_$B1FA`.

### 6. `$B4FD` (entry 28) -- `loc_$B502` is the shared body stage 5's `$B559`
   will reuse. Uses `$B628`, `$B251`, `$B2AF`, `$B2D2` -- all ported.

### 7. `$C686` -- already ported (W27, the warp rain). The stage-3 arm is the
   SAME function with `$3A == 0`: `$C684[0] = $28` (throttle), `$C6CA[0] = $3F`
   (anim), `$C6CC[0] = $97` (type -> `$B7A1`). The fix is one `case` label.

### 8. NO EXPORTER CHANGE WAS NEEDED, and that is worth writing down

Every table the five new handlers index was ALREADY exported by W21's
`ENEMY_BLOCKS_W21` list: `phaseB42F`, `phaseB45C`, `midBossRank` (which holds
`$B787`/`$B78F`/`$B797`/`$B799` as one 26-byte run), `midBossHits`,
`coreTables` (`$B8E6`/`$B8E9`/`$B8EC`), `animRecords`, `stage2Object` (the moai's
24 offset bytes, its four pointers AND the 107 bytes those point into),
`stage2Period` and `page600Object` (`$CA29`-`$CA2C`). Checked by resolving all
21 addresses against `assets/enemies/tables.json`'s block spans before writing a
line. W21 shipped the ranges for handlers nobody had written yet and it paid off
exactly as intended.

---

## READING PAST THE APPARENT END -- what the trap looked like this wave

Three cases, all found by following JMP targets that nothing returns to:

1. **`$C916 JMP $C77C`.** `st_C906` runs `$C906`-`$CA28`; its DESTROYED arm is
   at `$C77C`-`$C821`, which sits **394 bytes EARLIER in the ROM** and is
   reached by a JMP with no return. Reading `st_C906` top to bottom and stopping
   at its RTS would have shipped a moai that can be shot three times and then
   does nothing for ever -- no explosion, no score, no rubble, and no warp.
2. **`$B7A1` does not end at `$B851 RTS`.** `$B834 BCS $B85A` continues into
   the fire block, which runs to `$B8E5` with a data table (`$B852`) sitting in
   the middle of it. That block is 60 % of the routine.
3. **`$B8DE JSR $BD2C` enters `aimBullet`'s tail.** `$BD2C` is not a routine;
   it is the third instruction of `$BCB5`'s shallow-angle arm, and `$B7A1` calls
   it with a DIFFERENT accumulator (`$40`, not `$BD2A`'s `#$00`) and its own
   `$99`/`$9A`. The port's `aimBullet` had that code inline; it is factored into
   `loc_BD2C(state, i, a, hi, lo)` now, with `a` a parameter for exactly this
   reason.

Also read and NOT a fall-through: `$B4FD` ends at `$B556 JMP $B2D2`, `$B402` at
`$B42C JMP $B1DA`, `$B434` at `$B459 JMP $B1FA`, `$A46F` at `$A4A5 RTS`
(`sub_A4A6` is the next label and is entered only by JMP/JSR). `$B559`
(`$B55C BPL $B502`) shares `$B4FD`'s body but is entry 29 and stage 5's -- not
ported here, still throwing; `loc_B502` is factored out ready for W32.

---

## THE ALIAS TRAP, live in one routine

`$B7A1` uses BOTH `$0460,X` and `$046C,X` with the SAME X (`$A8`, the raw slot
index 0..9), and they are different bytes:

| line | address | port | meaning |
|---|---|---|---|
| `$B7A8` | `$0460 + X` | `s0460[j]` | the COLLISION BOX CLASS (`$C020`/`$C11C` `LDX $0460,Y`) |
| `$B836` | `$0460 + $0C + X` | `s0460[j + 12]` | the HIT ACCUMULATOR (`$C086` adds damage to it) |

Confusing them makes the chaser either unhittable or invincible and **nothing
throws**. Pinned by test 16, and the mutation (`s0460[j]` -> `s0460[i]`)
reddens tests 16 and 19.

---

## THE MUTATION TABLE

Harness: patch `src/enemies.js`, run `tests/w30-stage3.test.js`, restore, and
sha256 the file before and after every single mutant. Baseline GREEN, final run
GREEN, `0523ff8f08dede9d...` before and after all 25.

| # | mutant | tests reddened |
|---|---|---|
| 1 | `addCursor(sp, 5)` -> `4` (THE STRIDE) | 1, 2 |
| 2 | `$19 === 2` -> `$19 >= 2` | **NONE -- see below** |
| 3 | the `$A466` stage guard removed | 3 |
| 4 | `$A491`/`$A496` swapped (`$66`/`$67`) | 4 |
| 5 | `$A47A` store -> increment | 5 |
| 6 | `$C922` queue gate 4 -> 8 | 6 |
| 7 | `$C91C` `$5D` gate dropped | 7 |
| 8 | `$C948` (CLOSE) rank index dropped | 9 |
| 9 | `$C9B0` (OPEN) rank index dropped | 8 |
| 10 | the close tile row loses its `+$10` | 10 |
| 11 | variant-2's `-1` applied to every variant | 10, 11 |
| 12 | 3 hits -> 4 hits | 12, 13, 14 |
| 13 | warp at 10 moai -> 11 | 13 |
| 14 | `$C83B` shift 3 -> 2 (the map pointer) | 14 |
| 15 | `$C853` RTS -> falls through | 15 |
| 16 | `$B7A8` raw index -> `+$0C` (THE ALIAS) | 16, 19 |
| 17 | `$B84E` second INC made unconditional | 17 |
| 18 | `$B787` fire row -> `$B78F` | 17, 19 |
| 19 | `$B852` hit test `>=` -> `>` | 19 |
| 20 | `$B7C4` compare inverted | 20 |
| 21 | `loc_B407` loses its `$B212` call | 21 |
| 22 | `$B402`'s tail -> `$B1F1` (`$B434`'s) | 22 |
| 23 | `$B45C` index dropped | 23 |
| 24 | arc bound `$FE` -> `$FF` | 24 |
| 25 | `$B538` BCS inverted | 25 |
| 26 | `loc_B502` `$80` -> `$81` | 25 |

**Mutant 2 reddened NOTHING and that is a real gap, not a rounding error.**
`$A466`'s `CMP #$02` is an EQUALITY, and relaxing it to `>=` is invisible to
every test I can write today, because `$19 >= 3` cannot reach `$A466` at all --
`runEngine`'s own stage guard throws one call earlier. So the equality is pinned
from BELOW only (`$19` = 0 and 1 route to `$A4A6` and throw). Mutant 3 (removing
the guard entirely) is the check that does bite. **The `>=` case becomes
testable in W32**, when the stage-5 arm lands and `$19 = 4` can reach the
splitter; whoever writes it should add the mutant back.

Two mutants each redden two tests (11 and 18) and one reddens three (12). None
reddens the suite: 12's three are the moai-destroy cluster, which is one
behaviour with three consequences (explosion, `$5F`, the collision map).

---

## WHAT I COULD NOT REACH

Stated as attempts, not absences.

- **`$A485 STA $69`** (store `sub_$A527`'s exit accumulator, 0). Ported and
  NOT pinned by a test. `$A2FE LDA $69 / BNE $A32B` diverts the engine into
  `emitMember` one branch earlier, so every path that reaches `$A335` -- hence
  `$A37A` and `$A46F` -- already has `$69 == 0` and the store is unobservable
  from outside. What I tried: seeding `spawn.z69` before the tick (the engine
  emits a squadron member and never reads the record); looking for a mid-record
  seam (there is none -- `fireWave` is one call). If a producer that sets `$69`
  and then reaches `$A46F` in the same frame is found, that is the check.
- **`$A466`'s `>=` vs `==`** from above -- see mutant 2.
- **`$A4A6`** (the stage-5 terrain-mounted arm) is DELIBERATELY still a loud
  named throw, per the plan: it scans `$0600`, which this port does not have.
  It is reachable two ways and both throw: `$A466`'s else-arm and
  `$C676 JSR $A4A6` inside the still-throwing `$C653`.
- **`collWrite`'s out-of-page throw** has never fired and I have no measurement
  either way. `STA ($9A),Y` is a real 16-bit pointer plus Y and CAN leave
  `$0500`-`$06FF`; the throw is a tripwire naming the address, not a proof that
  the cartridge never does it. Hand-checked against the six nametable-high bytes
  the 45 records actually carry (`$21 $23 $24 $25 $26 $27`) and every derived
  base stays inside the two pages, but that is six samples, not a proof.
- **No stage-3 BOTH-SIDES comparison was recorded.** Every number in this file
  is read out of `rip/prg.asm` or measured against `assets/prg.bin`, and the
  47-scenario corpus's endchain still stops at the stage-2 -> stage-3
  transition. So what is proven is TRANSCRIPTION plus 26 unit checks that were
  each watched to fail, not field-exactness on the cartridge. The plan's W30
  DONE-WHEN asks for the stage-3 BigCore death frame-exact; that half is
  **UNRESOLVED** and is stated as unresolved rather than implied by the green
  gate. What would close it: extend the endchain scenario past `$96CF`'s second
  `INC $19` (the W29 method: seed-anywhere at the stage-3 entry, the powered
  poke, the RDA/RUA tail) and re-record. That is an emulator run, not a code
  change.

---

## WHAT ELSE MOVED, THAT NOBODY ASKED FOR

- **Stage `$19 = 3` (in-game stage 4) went 96/98 -> 98/98 for free.** Its only
  two missing dispatch entries were `$B402`/`$B434`, the shared pair. W31's
  remaining work is `$C5AD` and its child `$B377`, not handlers.
- **The ledger's BASELINE dict trailed the port by a whole wave.** W29 shipped
  stage 1 and lifted stage 6 from 95 to 104 records and did not update
  `stageledger.py`; rows 1 and 6 still read `0x09A0`/88 and `0x0340`/95. A floor
  that trails the port cannot catch the regression it exists to catch. Both
  corrected, along with W30's own rows.
- **"inline-5 is always unported" was a hand-kept literal** in `stageledger.py`
  and `wavecensus.py` -- true when written, false the moment the route landed.
  It is read out of `src/enemies.js` now (`PORTED_INLINE5_ARMS`, the same idea
  as `PORTED_TARGETS`), so the tools cannot go on reporting a ported route as
  unported. This is the FOURTH stale hand-kept list this project has found.
  The column arithmetic changed with it: `distinct = ported + unported`, and
  `inline5` is now an OVERLAPPING tally rather than a third disjoint bucket.
  Documented in both tools.
- **Two existing tests had to move** because what they asserted became false:
  `enemies.test.js`'s "an unported handler is a LOUD named throw" stood on
  entry 13 (`$B402`) and now stands on entry 26 (`$B480`, W33's); it is the
  third entry that check has used. `w25-volcano.test.js`'s late-spawner table
  test now asserts stage index 2 SPAWNS type `$97` instead of throwing.

---

## THE DONE-WHEN, AS A MEASUREMENT

`python games/gradius/tools/oracle/stageledger.py` (the brief's path
`games/gradius/tools/stageledger.py` does not exist; it is under `tools/oracle/`):

```
stage  distinct  ported   unported  inline5  ported %     first unported
0      92        92       0         0        100.0        NONE (shipped)
1      93        93       0         0        100.0        NONE (shipped)
2      78        78       0         45       100.0        NONE (shipped)   <-- W30
3      98        98       0         0        100.0        NONE (shipped)   <-- free
4      28        14       14        4        50.0         scroll $0000  (@$ABB6)
5      98        47       51        0        48.0         scroll $03B0  (@$AC2E)
6      111       104      7         0        93.7         scroll $0CC0  (@$AD98)
ALL    598       526      72        49       88.0
OK -- no stage's coverage moved backward relative to the baseline.
```

Stage `$19 = 2` -- in-game stage 3 -- is **78 of 78 distinct records
dispatchable, first unported NONE**. It was 28/78 at the top of this file.

### Coverage, in branches and table entries rather than frames

- **`$AE1C` dispatch: 28 of 42 entries ported** (23 before this wave), **25
  distinct routines**. Still throwing: 14 entries / 9 distinct routines
  (`$CA5E`, `$B377`, `$B480`, `$B4F2`, `$B559`, `$B569`, `$AF10` x6, `$BB0F`).
- **Wave records: 526 of 598 dispatchable** (468 before), across all 7 stages.
- **The inline-5 route: 45 of 49 distinct 5-byte records** are on a ported arm.
  The other 4 are stage 5's, behind `$A4A6`, which throws.
- **The moai's variant table: 4 of 4 entries exercised** by the unit tests
  (variants 0 and 2 write the collision map, 1 and 3 are the `$C853` RTS).
  Measured off `assets/prg.bin`: the 45 records carry cmd `$F0`-`$F3` ONLY
  (14 / 19 / 9 / 3), so the four `$C893` pointers are exactly the four cases.
- **`$C936` reopen timer: 7 of 7 rank rows** exercised, on BOTH the open arm
  (`$C9B0`) and the close arm (`$C948`) -- separately, because the first
  mutation run proved a single test covered only one of them.
- **`$B42F`/`$B45C` arc schedules: 5 of 5 entries each** exercised.
- **`$B787`/`$B852` rank rows: 1 of 8 each** exercised (rank 0). The other
  seven are transcribed and unexercised -- the same gap the plan's W37 names
  for the boss.
- **`$C87B` collision-map offset runs: 2 of 4 runs** exercised (variant 0's
  two); variant 2's two are transcribed and unexercised.

### The gate, MEASURED 2026-08-04 on this wave's HEAD

`node games/gradius/tools/test-all.mjs`:

```
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  every indexed table is exported (tablecoverage.py)
  PASS  per-stage coverage ledger (stageledger.py)
  PASS  sound data == the measured ownership window (snddata.py --selfcheck)
  PASS  one frame fits in the budget (framecost.mjs)
  PASS  port trace shape == probe.lua state vector
  PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken
  GREEN -- 11 passed, 0 failed, 0 SKIPPED
```

**0 SKIPPED stages.** Read the skip count honestly, though: `compare.mjs`
reports "6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle
splitSpins)" INSIDE its own run -- those are per-field skips that predate this
wave (they are emulator-side quantities with no port counterpart, declared in
`porttrace.mjs`), not skipped gate stages. The gate-level skip count is zero.

Unit tests: **512 pass, 0 fail, 0 skipped** (486 before, + 26 new W30 checks).

Corpus: **47 scenarios, 29,657 of 29,657 frames compared, 0 failures**, and the
self-check drove all 7 deliberate breaks RED (lead1 249, seed-x+1 167,
laginject=450 983, seed-nt+1 1, seed-pal+1 6, seed-coll0 105, bullet-nosub 71
TIER-1 failures). That matters here beyond the usual reason: this wave
REFACTORED five pieces of already-shipped stage-1/2 code out into named
functions -- `loc_BD2C` (out of `aimBullet`'s tail), `loc_B1DA` (out of
`h_B198`), `sub_B2AF` and `loc_B2D2` (out of `h_B26C`'s two closing arms) and
`loc_B212` (out of `h_B205`'s init) -- because stage 3's handlers enter all five
from outside. The corpus staying at 0 divergent over 29,657 frames is what says
those extractions were behaviour-preserving; the endchain alone is 5,839 frames
with every TIER-1 field exact.
