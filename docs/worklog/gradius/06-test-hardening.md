# Wave 6 test hardening — closing the breaks that passed in the kill chain
status: IN PROGRESS
wave: 6   role: test   started: 2026-07-29

## The task, as I understood it

I am the TEST WRITER for wave 6 (weapons, shots, missiles, enemy death, score).
I write files under `games/gradius/tests/` and may add oracle scenarios. I do
**not** edit `games/gradius/src/`. Every check I add must be seen RED against a
deliberate source mutation, with the source restored byte-identical afterwards.

Inputs: the implementer's report (commit `4c7f07b`), the reviewer's verdict
(5 findings, one moderate defect in `$2A`), QA's verdict (8 findings, 61 breaks
of which **22 passed**).

## What I did

1. Re-derived every ROM fact I was going to pin, out of `Gradius (USA).nes`
   directly (file offset `16 + addr - $8000`), not through `export_assets.py`.
2. Built an isolated mutation harness in the scratchpad (`t6/`, a copy of
   `src/`, `tests/`, `assets/`, `index.html`, `game.json`) — **I did not edit
   `games/gradius/src/` at any point**.
3. Wrote `games/gradius/tests/weapons-unwitnessed.test.js`, 17 tests.
4. Corrected two false claims inside `games/gradius/tests/weapons.test.js`
   (rule 6): a dead order probe and a test whose title contradicted its own
   assertion.
5. Ran 30 deliberate breaks. All 30 red. Source restored byte-identical each
   time (sha256 asserted by the driver).
6. Ran the gate.

Harness: `<scratchpad>/w6mut.py` (the campaign, re-runnable), `w6muts.json`
(its output), `<scratchpad>/t6/` (the scratch copy).

## What I MEASURED

### The ROM, re-derived by me from `Gradius (USA).nes`

```
$82FA  A9 03 85 20 85 21 A9 01 85 2A 85 2B 60
       LDA #$03 / STA $20 / STA $21 / LDA #$01 / STA $2A / STA $2B / RTS
$9725  A9 01 95 2A                LDA #$01 / STA $2A,X   (the per-player reset)
$A0E0  06 07 06 | 06 07 24 | 01 02 01     slot-A types, slot-B types, sfx ids
$A108  A6 45                LDX $45      ... $A16C  CA 10 9B   DEX / BPL
$A16F  A2 08 86 A8          LDX #$08     ... $A1DE  C6 A8 A5 A8 C9 06 B0 8D
$A18B  A5 A5 38 E9 08 85 A5     $A5 (probe Y) -= 8
$A192  A5 A4 18 69 08 85 A4     $A4 (probe X) += 8
$A199  20 D3 C3 D0 38           JSR $C3D3 / BNE $A1D6      non-zero -> a WALL
$A1A4  02 00 | 00 02 | 80 00    dy, dx-high, dx-low, fly then crawl
$A1E6  A2 00                LDX #$00     ... $A22F  E8 E0 06 90 B6  INX/CPX/BCC
$BFCE  08 10 08 08  10 30 10 10  08 08 08 00      shot X off / WIDTH / Y off
$BFDA  10 20 30 10  |  $BFDE  10 20 30 02         enemy WIDTH  |  enemy HEIGHT
$C00F  A4 A9 B9 0C 03 10 1A      LDY $A9 / LDA $030C,Y / BPL $C030
$C055  B9 0C 03 10 5D            LDA $030C,Y / BPL $C0B7    <- the SAME test
$C3AF  ... E0 06 90 02 69 03 ... C9 01 D0 08 BD 63 03 69 0A
       CPX #$06 / BCC / ADC #$03   ->  +4    (the carry CPX set)
       CMP #$01 / BNE / ADC #$0A   ->  +$0B  (the carry the equality set)
$C0A6  20 63 84 A4 A9 20 93 BE    JSR $8463 (SCORE) then JSR $BE93 (KILL)
$8498  90 39 A2 02 A9 99 9D E0 07 BCC $84D3 / LDX #$02 / LDA #$99 / STA $07E0,X
$BEA5  B9 AC 03 F0 10 C9 01 F0 07 AA A9 00 D6 48 D0 02 A9 01 99 AC 03
```

Every one of these agrees with what wave 6 shipped. The two carry fall-throughs
in `$C3AF` (+4 and +$0B) I re-derived a third time, independently of the
reviewer.

### The `$2A` defect, re-measured (reviewer's moderate finding — CONFIRMED)

The cartridge's own initialiser sets `$2A = $2B = $01` (above), and all **28**
recorded artifacts agree — decoded straight out of `tools/oracle/out/scen/*.json`
by base64ing `seedRam`:

```
autofire-die      2A=01 2B=01 20=03 21=03 35=14 17=00
...  (28 rows, identical in 2A/2B; intro-respawn differs only in 20=02) ...
```

The port's `bootState()` and `introEntryState()` hardcode `0x02`. Pinned as a
`knownFail` in the new file. Verified it retires itself: mutation **M36** fixes
both sites and the knownFail goes RED with `SURPRISE PASS`.

Side result, against the implementer's report and for QA: **`$17` is 0 in all 28
seeds**, not 1. The implementer's "the autofire pokes make the cartridge's
`$17` = 1" is not supported by any artifact.

### The enemy box class `$0460,Y` (QA finding 4 — CONFIRMED, and it is worse)

Decoded every artifact's every row:

```
28 artifacts, 20386 rows scanned
w_0460 .. w_0469  ->  1 distinct value each: {0}
```

(`w_046C`-`w_0475` DO vary, 0..64 — those are `$046C + j`, the damage counter,
a different index of the same array. That is what makes this easy to get wrong.)

So `$C028 CMP $BFDE,X` has only ever read entry 0 in 9062 compared frames, and
the index has never been exercised at all. **And the parameter is not
hypothetical**: scanning the PRG for writers of `$0460` finds five sites that
store a NON-ZERO class, all of them with X = j (they sit beside `$030C,X` /
`$012C,X` / `$016C,X`, the 10-entry enemy arrays):

```
$A4FC  A9 01 9D 60 04   class 1   (after LDA #$89 / STA $012C,X)
$AF35  A9 01 9D 60 04   class 1   (armoured: also $048C,X = 1, $010C,X = $80)
$B7AA  A9 01 9D 60 04   class 1   (armoured: $010C,X = $80)
$B927  A9 03 9D 60 04   class 3   (       : $010C,X = $90)
$C6AE  A9 01 9D 60 04   class 1
```

`$BFDE[3] = $02` — a two-pixel-tall box. The first wave that ports an armoured
enemy will exercise this index for real, and until this commit nothing in the
tree could tell `$BFDE` from `$BFDA` (they differ only at entry 3) or from the
constant `$10`.

### Why the corpus cannot see the terrain arms

Not "the map is empty" — stage 1's block library holds 33 blocks with non-zero
collision (`assets/terrain/stages.json`). The measured reason is already in the
repo and I re-read it rather than re-deriving it: `scenarios.json`'s own
`terrain-death` entry records that **stage 1 pages 0-3 contain zero solid tile
bits and nothing in the corpus gets past camera page 0, so `$C3A3` returns 0 on
all 242 of its calls in every scenario**, which is why that scenario exists and
why it is POKED (`05B3=16@+100`). Cross-check I did make: no artifact watches a
single address in `$0500-$06FF`, so the map is not a compared field either.

So `$A199` (wall), `$A19E` (crawl), `$C2DC` (breakable) and `$C2E8` (absorb) are
all unreachable in the corpus as it stands, and the two carry-dependent offsets
in `$C3AF` are unreadable by it. That is a POKE-shaped hole, and `terrain-death`
proves poking works end to end. See "What I could not do".

### A measurement I threw away

I built a port-side probe counter (`<scratchpad>/probecount.mjs`) to count
non-zero terrain probes over the five autofire windows. It reported 0 — but it
also reported **0 live shot-slot samples over 600 frames of held A**, where the
cartridge artifact `autofire-normal` shows `w_0123` occupied on **247 of 600**
frames. So my harness was not reproducing the corpus's play state from
`bootState()` and its numbers are worthless. Discarded rather than quoted.

### The mutation table — 30 breaks, 30 RED

Driver: `python <scratchpad>/w6mut.py`. Each row: mutate one line of the scratch
copy, run
`node --test tests/{weapons-unwitnessed,weapons,collision,collision-unwitnessed,enemies,enemies-unwitnessed,nmi}.test.js`,
restore, assert sha256 unchanged. Baseline before and after: **121 pass, 0 fail**.

| # | mutation | file | result | test(s) that went red |
|---|---|---|---|---|
| M1 | `fireWeapons` loop `$45..0` -> `0..$45` | weapons.js | RED | `$A108: Option 2 fires FIRST and the player LAST` |
| M2 | `missileLoop` `8..6` -> `6..8` | weapons.js | RED | `$A16F: the missile loop runs slot 11 DOWN to 9` |
| M3 | 2nd probe offsets swapped `(px-8, py+8)` | weapons.js | RED | `$A199: a missile against a WALL is freed` |
| M4 | 2nd probe drops the `-8` in Y | weapons.js | RED | `$A199 ...` |
| M5 | 2nd probe drops the `+8` in X | weapons.js | RED | `$A199 ...` |
| M6 | wall arm does not `freeMissile()` | weapons.js | RED | `$A199 ...` |
| M7 | missile probes `Y + 3` | weapons.js | RED (4) | `$C3BB: ... Y + 4, pinned from BOTH sides`, +3 more |
| M8 | missile probes `Y + 5` | weapons.js | RED | `$C3BB ...` |
| M9 | missile liveness read from `$0123,X` | weapons.js | RED | `$A177: liveness is the SUBTYPE` |
| M10 | `$A1AC` per-frame metasprite store deleted | weapons.js | RED (2) | `$A1AC: the metasprite is re-stored EVERY frame` |
| M11 | `$A1D0` carry-out-of-255 test dropped | weapons.js | RED | `$A1D0 BCS: the missile dies on the CARRY` |
| M12 | dy limit read from `$BFDA` (WIDTH table) | collision.js | RED | `$C028: the dy limit is $BFDE[class]` |
| M13 | dy limit is the constant `$BFDE[0]` | collision.js | RED | `$C028 ...` |
| M14 | box class indexed by the object slot | collision.js | RED | `$C028 ...` |
| M15 | `$C0A6`/`$C0A9` swapped: kill before score | collision.js | RED | `$C0A6 then $C0A9: the SCORE is added BEFORE the kill` |
| M16 | `freeShotSlot` drops `$0103,X` | collision.js | RED | `$C0C3: freeing a shot clears $0103,X too` |
| M17 | terrain absorb drops `$0103,X` | collision.js | RED | `$C2E8 JSR $C0BD: the terrain absorb clears the same three` |
| M18 | `$BEAA` already-a-carrier arm removed | enemies.js | RED | `$BEAA: an enemy that is ALREADY the carrier` |
| M19 | `$849A` BCD overflow arm deleted | score.js | RED | `$849A: the BCD overflow fills the TOP score` |
| M20 | `nmi.js` never clears `state.sfx` | nmi.js | RED | `$8073/$80B7: the sfx list is cleared per frame` |
| M21 | `nmi.js` clears `state.sfx` ABOVE the lag gate | nmi.js | RED | `$8073/$80B7 ...` |
| M22 | `fireWeapons` given a REAL range guard | weapons.js | RED | `$A108 has NO range guard -- ... TAUTOLOGY` |
| M23 | `$C011` initialised filter removed | collision.js | RED (2) | `$C011 BPL: ... the shot FLIES ON`, +1 |
| M24 | `$A0FA` two-player throw removed | weapons.js | RED | `$A0FA LDX $18: two-player firing is a loud throw` |
| M25 | `freeMissile` drops `$A1DB STA $0163,X` | weapons.js | RED | `$A199 ...` |
| M26 | `freeMissile` drops `$A1D8 STA $0123,X` | weapons.js | RED (3) | `$A199 ...`, `$A1D0 ...`, `$A1B9 ...` |
| M30 | `$C028` `CMP/BCS` becomes `<=` | collision.js | RED | `$C028 ...` |
| M31 | `$C023` SBC borrow (the `-1`) dropped | collision.js | RED | `$C028 ...` |
| M32 | `$C006 ADC $BFD6,Y` dropped | collision.js | RED (6) | `$C028 ...` and five pre-existing |
| M35 | `$A1CD` 16-bit X carry dropped | weapons.js | RED (2) | `$A1D0 ...`, `$A1AF ...` |
| M36 | the `$2A` defect FIXED at both sites | main.js | RED | `[knownFail] $8302 ...` (SURPRISE PASS, as designed) |

**No deliberate break of mine passed.** Every one of QA's twenty-two passing
breaks that is observable at all is now covered; the ones that are NOT
observable are named below rather than papered over.

### The gate, run by me, on this tree

```
$ node --test games/gradius/tests/
# tests 239   # pass 239   # fail 0   # cancelled 0   # skipped 0   # todo 0
# duration_ms 7917.6005

$ node games/gradius/tools/test-all.mjs
  28 scenarios, 9062 of 9062 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  [PASS] port vs cartridge (compare.mjs)
  ---- self-check ----
  neuter lead1          -> RED, 193 TIER 1 failures (good)
  neuter seed-x+1       -> RED, 116 TIER 1 failures (good)
  neuter laginject=450  -> RED, 640 TIER 1 failures (good)
  PASS inputs / PASS unit tests / PASS assets == the cartridge /
  PASS port trace shape / PASS port vs cartridge / PASS self-check
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

222 -> **239** unit tests, **0 skipped**. The "6 fields SKIPPED" line is
FIELD-level and pre-existing (porttrace NOT_PRODUCED); stage skips are 0.

## Findings against wave 6 (I may not fix these — they are src/)

1. **MODERATE — `$2A` is seeded `$02`, the cartridge says `$01`.** Reviewer's
   finding, re-measured by me two ways above. `src/main.js` `bootState()` and
   `introEntryState()`. Pinned as a knownFail that retires itself.
2. **MODERATE — `src/collision.js`'s `$C011` paragraph is wrong.** It says
   `$C055`'s own `BPL $C0B7` "consumes it", presenting it as a live alternative
   branch. It is unreachable: `$C055` has one caller (`$C02D`), reached only when
   `$C014 BPL` was NOT taken, Y is unchanged in between, and `$C055`'s first two
   instructions re-test the same byte with the same Y. QA found it; I re-read the
   ROM bytes and agree. The port's transcription is faithful, the comment is not.
   (I corrected the *test* that repeated the claim.)
3. **MINOR — four `iters !== N` assertions are tautologies, and one comment lies
   about it.** `src/weapons.js` `fireWeapons` says it "asserts the range rather
   than reading past slot 5 / 8 / 11 in silence". MEASURED: `$45 = 3` does not
   throw and writes object slot 6 — the exact aliasing the comment claims to
   prevent. Same shape in `missileLoop` (`iters !== 3`), `shotLoop`
   (`iters !== 6`) and wave 5's `shotSweep` (`iters !== 9`). Only
   `shotVsEnemies`' is real, because `$A9` is written by `$C0BB`.
   docs/knowledge/03 shape 1. Pinned by a test that goes red if a real guard is
   ever added, so at least the behaviour cannot drift silently.
4. **INFORMATIONAL — the implementer's `$17 = 1` claim is unsupported.** All 28
   seeds read `$17 = 0`. The conclusion (safe today) still holds; the reasoning
   given for it does not. `0017` still needs to join `watch` in wave 7.

## What I RULED OUT

* **`shotLoop`'s ascending direction is NOT a hole.** QA reported reversing
  `$A1E6`'s loop (0..5 -> 5..0) as a break that passed and called it a plain
  hole. It is unobservable, not untested: every iteration touches only
  `$0123,X` / `$0163,X` / `$0323,X` / `$0363,X` of its own X, there is no shared
  byte, no early exit and no sound request, and `$A1E6 STX $98` is outside the
  loop and `$98` is never read. The two directions compute the identical final
  state on the cartridge as well as in the port. I wrote no test for it, on
  purpose: a check that claimed to catch it would be decoration. Recorded in the
  new file's header so the next agent does not re-open it.
* **`shotProbe`'s `x >= 6 ? 4 : 0` is unreachable in the port and that is
  structural, not a gap.** `$C3AF` is one ROM subroutine with two callers —
  `$C2CA` (X = 5..0, the shots) and `$A182` (X = 8..6, the missiles). The port
  gave the missile caller its own inline copy, so the shared function's missile
  arm is dead code. The observable case is the inline copy, and that is what
  `$C3BB: ... Y + 4, pinned from BOTH sides` covers (M7/M8 red).
* **`$BFF9 LDA #$FF` (the sweep's X saturation) is unreachable BY
  CONSTRUCTION.** `shotLoop` runs before `shotSweep` and frees at `x >= $F8`
  with `$BFCE[0/2/3] = $08` ($F7 + 8 = $FF) and at `x >= $F0` with
  `$BFCE[1] = $10` ($EF + $10 = $FF). The surviving maximum is always exactly
  $FF and the ADC never carries. Confirmed from the table bytes above. No test
  written; a test would have to invent a state the game cannot be in
  (docs/knowledge/02 trap 4 shape 2).

## What I could not do, and why

* **THE CORPUS FIX FOR THE TERRAIN ARMS IS SPECIFIED BUT NOT RECORDED.** See the
  next section — this is the one thing I would hand to the next agent first.
* **`scen.py` was NOT re-run for the 28 existing scenarios.** I compared against
  the artifacts as the implementer left them. A regression here looks like
  `compare.mjs` green against stale artifacts.
* **No pixel/OAM-content layer exists in the gradius gate and I ran none.**
  `tools/oracle/rendergate.py` and `rendercheck.py` are in the tree and are
  referenced by nothing. Wave 6 is the first wave to put new sprites on screen.
  Unchanged by me; it remains the largest uncovered layer.
* **Sound is still compared by nothing at corpus level.** My tests pin the sfx
  ids, the count, the ORDER within a frame (`$C0A6`/`$C0A9`) and the list's
  lifetime, but all of that is unit-level until wave 8 hooks `$EC1E`.
* **The armoured path, the type-`$9A` counter, the wall break, the crawl, the
  shot-vs-bullet and the stage-5 arms are still loud throws**, and I did not
  reach any of them from a button script.

## If someone picks this up cold — THE CORPUS FIX, ready to record

`terrain-death` proves the mechanism: a poked collision cell reaches both the
cartridge and the port at the same instant, and `terrain-death-miss` is its
negative control one block row lower. The same trick makes the MISSILE's wall
arm reachable inside a compared window, and nothing else in the tree can.

The geometry, worked out from `probeCollision()` and confirmed against the ROM:

* the ship parked at the floor clamp is `$0320 = $C0`; `$A275 ADC #$06` makes the
  missile `$C6`; `$C3BB` probes it at `$CA`.
* `probeCollision` maps screen Y to `tileRow = (Y + $14) >> 3`, the cell index to
  `(x + 8) & $F8) + (tileRow >> 2)` and the 2-bit field to `(tileRow & 3) * 2`.
* `$C0` -> row 26 -> **cell +6, field 2**; `$CA` -> row 27 -> **cell +6,
  field 3**; `$C2` (the second probe, 8 up) -> row 26 -> field 2, but at
  `x + 8`, which is a DIFFERENT cell byte.

So one byte with **field 3 set and field 2 clear** gives the missile a hit and
the ship a miss (no `$C2C1` death), and a second byte 8 px to the right with
**field 2 = 1** (1, not 2 — 2 is `$C2DC`, the unported wall break) turns the
crawl into the wall. Proposed:

```
name  : autofire-missile-wall
tail  : "120:DA,180:A"        (autofire-missile's own script)
poke  : "0041=1,<cellA>=<v>,<cellB>=<v>"
```

with `<cellA>`/`<cellB>` derived from the ship's parked X the same way `kill.py`
derived `$05B3` for `terrain-death` — **derive them by driving the cartridge,
not from this note**, and record a `-miss` control one field lower exactly as
`terrain-death-miss` does. Expected first divergence for a broken port:
`w_0129`/`w_0169` (the missile slot) on the first frame the missile is at `$C6`.

I did not record it because it needs `scen.py` + Mesen against the ROM and a
matching negative control, and because getting the poked cell wrong silently
produces a scenario that tests nothing — the failure mode `terrain-death-miss`
exists to prevent. `status: BLOCKED` on that item beats a scenario nobody
validated.
