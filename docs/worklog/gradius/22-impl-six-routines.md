# Wave 22 — The six routines between here and the stage-1 boss

status: DONE
implementer, 2026-08-02

Scope (from the wave brief, merging plan W22+W23):
  entry 7  ($B6E1) — THE FIRST FAILURE, stage 0 chunk 2 trigger $20 cmd $03,
                     type $07, scroll ($61<<8)+trigger*2 = $0400+$40 = $0440
  entry 19 ($B747) — the mirrored terrain walker
  entry 15 ($AF2E) / entry 16 ($AF88) — the two hatches
  entry 9  ($B311) / entry 12 ($B3CB) — the hatch children, types $09 / $0C
  $A19E — the missile crawl path (203 executions measured in W12)

Findings are written as they are learned.

## Log

### Baseline, measured 2026-08-02 before any edit
```
node --test games/gradius/tests/      -> 391 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs -> GREEN, 10 passed, 0 failed, 0 SKIPPED
                                         42 scenarios, 14098/14098 frames, 0 failures
```
(The brief said 378 tests; the tree is at 391 — W21 added the table pins.)

### The six routines, read out of the ROM (dis6502.py, 2026-08-02)

**Entry 7 `$B6E1` — floor walker.**  X on entry is the enemy index j (`$ADB7 LDX
$A8 / JSR $ADE5`), so every `$xx6C,X` is `array[j+12]` and every `$xx60,X` is
`array[j]`.
```
B6E1 LDX $A8 / LDA $030C,X / BMI $B6EE      bit 7 = initialised
B6E8   JSR $B65C / JMP $B0B4                init: pick dock column, set bit 7
B6EE LDA $046C,X / AND #$01 / BNE $B723     ODD phase -> the drift/animate tail
B6F5 $A4 := $036C,X (x) ; $A5 := $032C,X + 8 (y+8) ; JSR $C3D3
B705 BNE $B710                              ground at y+8 is SOLID
B707   LDA #$03 / BNE $B71D                 empty -> FALL 3 px
B710 $A5 -= 3 (y+5) ; JSR $C3D3 ; BEQ $B720 empty at y+5 -> stay
B71B   LDA #$FD                             solid at y+5 -> RISE 3 px
B71D JSR $B70B  ($B70B LDX $A8 / JMP $B17C: y += A)
B720 JMP $B676                              then walk toward the dock column
```
**Entry 19 `$B747` — ceiling walker**, the mirror: probes `y-8` then `y-5`,
`BEQ $B71B` (rise 3 when EMPTY at y-8) / `BNE $B707` (fall 3), init at `$B774`
also sets `$04AC,X = 1` and ORs `$018C,X` with `$80` (vertical flip), then the
same `$B65C`/`$B0B4`.

Shared bodies both entries need — port these as bodies, not per-entry copies:
* `$B65C` dock column := clamp(playerX($0360) + $30, $20, $F0) with `AND #$F8`,
  and the `BCS $B66A` on the ADC means a wrapped sum saturates to $F0. -> $048C,X
* `$B676` walk: `$04EC,X := 0` (disarms the gun), compare `x AND $F8` to $048C,X;
  greater -> `x += $FE` and **free the slot at `$B690 JMP $AEF8` once x < 8**;
  less -> `x += 1`; equal -> `$B6A2`.  Sets status `$010C,X` to 3 / 4.
* `$B6A2` arrival: `$04EC,X = $040C,X = $B6D2[$17]` (rank row, 7 bytes
  `3C 37 32 2D 28 28 23`) — that is the ENEMY-BULLET reload+countdown pair, so a
  docked walker SHOOTS; `INC $046C,X`; status 0; `$04CC,X = 0`; **FALLS THROUGH
  into `$B6B8`**.
* `$B6B8` `LDY $04AC,X` (0 floor / 1 ceiling); `+2` when the walker is left of
  the player; `$012C,X := $B6D9[Y]` (`1C 1C 1F 1F`, metasprites) and
  `$0496,X := $B6DD[Y]` (`01 03 02 04`, the bullet muzzle index).
* `$B723` odd-phase tail: `JSR $AEDD` (drift) / `JSR $B6B8` / `INC $04CC,X`;
  at 60 -> `INC $046C,X`; new value >= 7 -> `$048C,X = 0` (walk off the left
  edge and die at $B690), else `JMP $B65C` (re-dock on the player).

**CENSUS CORRECTION.** `20-recon-enemy-census.md` §1 entry 7 says it "animates
via `$B628` record 0". It does not: neither `$B6E1` nor `$B747` contains a
reference to `$B628`. The animation is `$B6B8`'s `$B6D9` lookup. `$B628`'s only
Y=0 caller is `$B61E` (entry 38).

**Entry 15 `$AF2E` / entry 16 `$AF88` — the hatches.** Init is literally shared:
`$AF8B BPL $AF33` jumps entry 16 into entry 15's init, and `$AF96 BNE $AF54`
jumps it into entry 15's tail.
```
AF33 LDA #$01
AF35 STA $0460,X   <- the j-INDEXED array: the HITBOX CLASS ($C020 LDX $0460,Y)
AF38 STA $048C,X   ;  $AF3B LDA #$80 / STA $010C,X (armoured: $ADE8 BMI skips
                      the status animator entirely)
AF40 JMP $B0B4
AF43 (15) LDY #$08 / LDA #$09 / JSR $AF98      child type $09, 8 px BELOW
AF4A      LDA #$78 ; $19 == 5 -> #$63          metasprite
AF8D (16) LDY #$F6 / LDA #$0C / JSR $AF98      child type $0C, 10 px ABOVE
AF94      LDA #$79                             (no stage-5 arm)
AF54 STA $012C,X ; Y := $046C,X (hits)
     Y >= 3 -> $018C,X := 3 (palette)
     Y <  5 -> JMP $AEDD (drift) and return
AF67 destroyed: on $19 == 0 only, `LDA $07E5,$18*4 / LSR / BCS skip` — the
     SCORE-PARITY gate — else INC $5F, and $5F >= 4 -> INC $39 (the WARP flag)
AF80 LDA #$0A / JSR $CB28 (sfx $0A + become explosion script 2) / JMP $8453 (score)
```
`$AF98` (the parameterised child spawner, the port's 3rd `$A527` site):
phase `$042C,X` 0 -> needs x >= $C8, 1 -> x >= $A0, >= 2 -> never; only on
`($02 AND $0F) == 0`; `INC $044C,X`, at 5 -> reset and `INC $042C,X`; allocates
DEX/BPL from 9, `$A527`, type := A, status := 0, x := parent x + 8,
y := parent y + $AC, and `$04EC,X = $040C,X = $B01D[$17 + ($19!=0) + ($1A!=0)]`
(`64 46 3C 37 32 2D 28 23 1E`) — so the CHILD is armed to shoot too.

**Entry 9 `$B311` (type $09) / entry 12 `$B3CB` (type $0C).** They cross-link:
`$B364 JMP $B3F9` is entry 9 jumping into entry 12's tail, and `$B3FF JMP $B367`
is entry 12 jumping into entry 9's. Shared animator `$B31E`: `INC $014C,X`,
`Y := (t >> 2) AND 7`, `$018C,X := Y >= 4 ? $80 : 0`, `$012C,X := $B33B[Y]`.
Entry 9 init `$04CC := $0A` then `$B0B4`; entry 12 init `$04CC := $14` then
`$B3A2` (`$048C := 0`, `$B0B4`) — entry 12 clears `$048C`, entry 9 does not.

---

## The blocker nobody had listed: `$C05F`, the ARMOURED damage arm

`$AF3B LDA #$80 / STA $010C,X` makes a hatch ARMOURED, and
`src/collision.js hitEnemy()` had a **throw** on exactly that bit:

> `$C05F: enemy N is ARMOURED ... MEASURED: $C070 ran 0 times in every run made
> here, and no stage-1 squadron sets the bit.`

Both halves of that sentence were true and the conclusion was wrong in the usual
way — no stage-1 *squadron* sets it, the stage-1 *hatches* do, and no run in the
corpus had ever reached a hatch. **Porting entries 15/16 without `$C05F` gives a
hatch that is invulnerable AND crashes on the first shot fired at it**, because
`$AF57 LDY $046C,X` reads the counter `$C086` is the only writer of. So `$C05F`-
`$C08D` is ported in this wave too, and the note is replaced rather than deleted:

```
C05F LDA $012C,Y / BEQ $C070      metasprite 0 -> no "clink"
C064 LDA $030C,Y / CMP #$94 / BEQ $C070    type $94 is silently exempt
C06B LDA #$05 / JSR $EC1E
C070 LDA $048C,Y / BEQ $C0B7      $048C == 0 -> INVULNERABLE (the hatch sets 1)
C075 LDX $A9 / LDA #$01 / LDY $0460,X / BEQ $C086     box class 0 always takes 1
C07E LDY $A8 / CPY #$06 / BCC $C086 / LDA #$02        a MISSILE (slot 6-8) takes 2
C086 CLC / ADC $046C,X / STA $046C,X ; JMP $C0B7
```

## `$A19E`, and the second half of its note was simply wrong

The comment in `src/weapons.js` said "its SHAPE is known and its constants are
not". The constants are row **1** of the same three two-byte tables the fly path
already reads, eight bytes away from code that was already running:

```
$A1A4  02 00   dY       fly +2   crawl  0
$A1A6  00 02   dX int   fly  0   crawl  2
$A1A8  80 00   dX frac  fly $80  crawl  0
```

`$A19E LDY #$01 / LDA #$08 / BNE $A1AC` is the whole arm. Ported as `y = 1` plus
metasprite `$08`.

---

## THE VERDICT — measured, not asserted

### `deep-page4` no longer throws, and its `expectThrow` is DELETED

```
node games/gradius/tools/oracle/compare.mjs --only deep-page4
  PASS  deep-page4     219 frames  all TIER 1 fields exact
```
The annotation was deleted rather than moved to the next wall, because there is
no wall left inside that window. Per the corpus rule a surprise success is a
failure, and it was: compare.mjs printed
`the port did NOT throw over 219 frames. $B6E1 has been ported -- DELETE the
expectThrow annotation` before I touched the file.

### The new scenario: `deep-powered`, 3099 frames, the longest in the corpus

`align 2300` (camera `$03E1`) through frame 5399, `poke 0044=2,0045=2,0046=5,
0041=1` — the powered sweep's own four values — script
`1350:RDA,324:RUA,80:RDA,3246:RA`.

```
node games/gradius/tools/oracle/compare.mjs --only deep-powered
  PASS  deep-powered  3099 frames  all TIER 1 fields exact
  1 scenarios, 3099 of 3099 frames compared, 0 failures
```

**Coverage, measured off the recorded artifact's own `$030C-$0315`** (not
asserted, not inferred from the listing):

| entry | ROM | type | first frame | slot-frames |
|---|---|---|---|---|
| 7 | `$B6E1` | `$87` | 2490 | 2522 |
| 19 | `$B747` | `$93` | 2498 | 2640 |
| 15 | `$AF2E` | `$8F` | 2778 | 930 |
| 9 | `$B311` | `$89` | 2783 | 1136 (+1 frame of raw `$09` at 4111) |
| 16 | `$AF88` | `$90` | 5018 | 382 |
| 12 | `$B3CB` | `$8C` | 5023 | 433 |

and `$A19E`: metasprite `$08` in `$0129/$012A/$012B` on frames **3348-3350**,
all three missile slots — the only place in the corpus where a missile and real
ground exist at the same time. `$1B` is `$80` on all 3099 frames.

The first three frames in that table are the same three the wave brief predicted
from the ROM (2490 / 2498 / 2778) and the same three wave 12 measured with an
exec hook. They were not tuned to match; they fell out of the recording.

### THE GATE

```
node --test games/gradius/tests/     416 pass, 0 fail, 0 skipped   (was 391)
node games/gradius/tools/test-all.mjs
    44 scenarios, 17416 of 17416 frames compared, 0 failures,
    0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
    0 display-list coverage failures, 0 video-coverage failures,
    0 deep-reach failures
    GREEN -- 10 passed, 0 failed, 0 SKIPPED
python games/gradius/tools/oracle/scen.py --only deep-powered   (re-recorded)
python games/gradius/tools/census.py dispatch
    entries ported 19 / 42 ; throwing 23
    distinct targets 34 ; distinct ported 16 ; distinct throwing 18
python games/gradius/tools/oracle/wavecensus.py
    stage 0: 92 distinct, 92 ported, 0 unported, 100.0%
```

The corpus went from 42 scenarios / 14,098 frames to **44 / 17,416** — one new
scenario and one promoted out of `expectThrow`. Nothing regressed.

### THE DELIBERATE BREAKS — 52 mutations, 51 seen RED

`breaks.py` (scratch, not committed) applies one source mutation at a time, runs
the five affected test files, restores the file and asserts the SHA-256 is
byte-identical both ways. Every mutation named in a `RED WHEN:` comment was run.
**51 of 52 went red; the one survivor is listed below with its reason, and two
more were re-aimed when the first form turned out to be semantically equivalent
rather than uncaught.**

The three that needed re-aiming or admitting, in the project's own terms — a
check that cannot fail is not a check:

* **`$B65C`'s low clamp `CMP #$20` is UNPINNABLE.** `#$20` → `#$18` is GREEN.
  Reason from the listing, not from the corpus: reaching the CMP with a value
  below `$20` needs a player X in `$D1..$EF`, and every one of those makes
  `ADC #$30` carry, which `$B662 BCS $B66A` has already turned into `$F0`. The
  smallest value that reaches the CMP is `$00 + $30 = $30`. The branch exists in
  the ROM and nothing in the game can take it. Written into the test.
* **`$B73A`'s `CMP #$07` → `#$08` is GREEN and equivalent.** `$B723` runs only
  when `$046C AND $01` is set, so the INC'd value tested is always EVEN — 2, 4,
  6, 8. No odd value ever reaches the compare. Re-aimed to `#$06`, which is red.
* **`$AFD2 LDX $AB / STX $A8` on the ALLOCATION-FAILURE path is a no-op.**
  Deleting it is GREEN. `$A8` is written only at `$AFD7`, past the failure
  branch, so on the cartridge too it restores a value that never changed. Kept
  because the SUCCESS path reaches the same exit with `$A8` genuinely clobbered.
  **This is the one true survivor.**

### WHAT I COULD NOT REACH — say it the way knowledge/09 requires

**No scenario in this corpus kills a hatch.** Measured off `deep-powered`'s own
recording: the two hatches that appear (slots at `$0311` and `$0312`) both end
`$8F -> $00`, i.e. freed by drift, never `-> $02`; and `$018C` is 3 on ZERO
hatch frames, so no hatch in the window took even three hits. The reason is
geometry and it is worth writing down rather than hand-waving: **a hatch spawns
at x = `$F0` and drifts LEFT, and the powered script parks the ship at the right
edge (x = 240) with `R` held, so every shot it fires leaves the screen to the
RIGHT of the hatch.** Killing one needs the ship LEFT of the hatch and within
`$BFDE[1]` = 32 px of its Y (`$A5` for the floor hatch), which no existing
script does. Consequences, stated plainly:

* `$C05F`-`$C08D` (the armour damage accumulator) is **unit-tested only**. The
  scenario corpus proves it is not REACHED, not that it is right.
* `$AF67`-`$AF85` (the destroyed arm, the score-parity gate, `INC $5F`,
  `INC $39`, the `$CB2B` explosion, `$8453`) is **unit-tested only** for the
  same reason.
* `$39` and `$5F` are **not in the 1022-address watch list**, so even a run that
  killed a hatch would not compare them directly today. Adding them means
  re-recording all 44 scenarios; it belongs with W28's ledger work.

What I tried: a longer window (5399 frames, the ship survives to 5514 on this
script), and reading the artifact for `$018C == 3` and for any `$8F -> $02`
transition. Both came back empty. I did not build a left-parked firing script
because the ship has to be inside a 32-px Y band it cannot be steered into
reliably from a button script, and a poked `$0320` would be testing my own
arithmetic on both sides.

**FOUR NEW HOOKS ARE IN `throwaudit.lua` FOR WHOEVER PICKS THIS UP** — `$C086`
(the damage accumulator actually storing), `$AF76` (`INC $5F`), `$AF7E`
(`INC $39`) and `$AF80` (a hatch destroyed at all) — because reaching `$C05F` is
NOT the same fact as taking damage: `$C070`'s BEQ turns away any armoured enemy
whose `$048C` is 0, and only the hatch opens that gate. **I did not get a
5400-frame run of them to finish inside this wave's budget**; the lua is
smoke-tested (700 frames, `--name w22smoke`, hooks load and report) and the
counts are unmeasured. Say it that way and not "they are unreachable".

**`$B65C`'s low clamp and `$AFD2`'s restore** are the two lines in this wave that
no test and no scenario can distinguish from their mutants, both for reasons
read out of the listing. They are named here so nobody reads their presence as a
covered fact.

### Two stale things fixed in the same commit

1. **`wavecensus.py`'s `PORTED_TARGETS`.** The comment said "read from the
   source"; it was a hand-kept literal of ten addresses frozen at wave 12, and
   it was still printing `MISS` for `$B6E1`/`$B747`/`$AF2E`/`$AF88`/`$B311`/
   `$B3CB` after they were ported. It parses `src/enemies.js`'s `dispatch()` now,
   the way `census.py` always has, and raises if it parses zero labels (an empty
   set would silently mark every record MISS). **This is the third stale
   hand-kept list this project has found.**
2. **`src/collision.js`'s `hex2` helper** existed solely to format the `$C05F`
   throw's message. With the arm ported it had zero call sites, so it is deleted
   rather than left behind.

### The ledger

`20-plan-completeness.md` §1a and §1b are updated in this commit:
`$AE1C` entries **13 → 19 of 42**; distinct routines **10 → 16 of 34**;
`$A527` spawner sites **2 → 3 of 9** (`$AFD9` is the new one); enemy types with
a producer **13 → 19 of 38**; wave records that spawn a ported handler
**370 → 454 of 598**; and stage 1's own row goes from `74 spawnable / 18
remaining` to **92 / 0**. `20-recon-enemy-census.md` gets the six rows marked
ported plus two corrections (see below).

### Corrections to the recon this wave owed

* **Entry 7 does not use `$B628`.** `20-recon-enemy-census.md` §1 says it
  "animates via `$B628` record 0". Neither `$B6E1` nor `$B747` references
  `$B628` anywhere; the animation is `$B6B8`'s `$B6D9` lookup. `$B628`'s only
  Y = 0 caller is `$B61E` (entry 38).
* **A dispatch-table census is not a closure over what a handler needs.** The
  census enumerated all 42 entries and every table they index, and still could
  not see that entries 15/16 require `$C05F` in a different file. Recorded in
  the recon so the same shape of miss is expected for W26's boss.
