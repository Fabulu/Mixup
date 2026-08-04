# Wave 31 IMPLEMENTER -- stage 4 ($19=3) plays start-to-finish

status: IN PROGRESS
implementer, 2026-08-04

Scope (brief + `29-plan-whole-game.md` W31): make stage 4 (`$19 = 3`) play start
to finish. The plan calls it "nearly free"; the brief says to treat that as a
HYPOTHESIS.

---

## BASELINE, MEASURED BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (NB: the brief's path
`games/gradius/tools/stageledger.py` does not exist -- the tool is under
`tools/oracle/`, same correction W30 had to make):

```
stage  distinct  ported   unported  inline5  ported %     first unported
0      92        92       0         0        100.0        NONE (shipped)
1      93        93       0         0        100.0        NONE (shipped)
2      78        78       0         45       100.0        NONE (shipped)
3      98        98       0         0        100.0        NONE (shipped)   <-- MY STAGE
4      28        14       14        4        50.0         scroll $0000  (@$ABB6)
5      98        47       51        0        48.0         scroll $03B0  (@$AC2E)
6      111       104      7         0        93.7         scroll $0CC0  (@$AD98)
ALL    598       526      72        49       88.0
```

**FIRST FINDING, and it changes the wave's DONE-WHEN.** Stage `$19=3` already
reads 98/98 at the TOP of this wave -- W30 lifted it as a side effect. So the
ledger CANNOT be this wave's done-when: it reads identically before and after
whatever I do. The ledger's denominator is WAVE RECORDS ONLY. The late spawner
(`jt_$C439`) is not a wave record and is invisible to it.

That is the "nearly free" label's blind spot, stated up front: the number the
plan cites as evidence is a number that cannot move.

---

## INLINE RECON, read out of `rip/prg.asm` before any `src/` edit

### 1. What stage 4 actually still needed (three things, not one)

`python games/gradius/tools/oracle/wavecensus.py` -- stage `$19=3` names types
`$04 $05 $06 $07 $08 $0D $0E $0F $10 $11 $12 $13 $27 $29`; every one has a
ported handler. So the WAVE side is genuinely free, as W30 said. What was left:

1. **`src/enemies.js:354` `if (stageIndex >= 3) throw`** -- W30's own scope
   guard in `runEngine`. This is the wall stage 4 hits on its FIRST wave record,
   and no ledger column sees it. Nothing in `stageledger.py` reads `src/`'s
   scope guards; it reads the type -> handler map only.
2. **`jt_$C439[3] = $C5AD`** -- the stage-4 late-spawner arm, a loud throw.
3. **`$AE1C` entry 21 -> `$B377`** -- its child handler, type `$15`, also a
   loud throw (the `default:` arm of `dispatch`).

### 2. `st_$C5AD` -- transcribed, and it is NOT a copy of the volcano

`$C5AD`-`$C600`, then `$C5FE JMP $C4E4` -- a SHARED TAIL with `st_$C486`
(the stage-1 volcano), which the port had inlined.

```
C5AD  LDA $69 / BNE $C5B6
C5B1  LDA #$0F / JSR $EC1E        sfx $0F, only when $69 == 0   (same as $C48A)
C5B6  LDX #$04 / JSR $C44F        stepper, $C447+4 = $C44B -> stream $C633
C5BB  LDA $A9 / LSR / CLC / ADC $A9 / TAY      Y = a9 * 1.5
C5C2  LDX $A8
C5C4  $042C,X := $C603,Y          xvel
C5CA  $03BC,X := $C604,Y          yvel
C5D0  LDA $69 / CMP #$1E / BCS $C5DC
C5D6  DEC $03BC,X / DEC $03BC,X   yvel -= 2 when $69 < $1E
C5DC  LDA $02 / AND #$0F / CLC / ADC $C605,Y / STA $048C,X   accel
C5E7  $04AC,X := $01
C5EC  LDY $AA / $036C,X := $C601,Y   X pos, $38 or $B8
C5F4  $030C,X := $15              type $15 -> entry 21 -> $B377
C5F9  $032C,X := $2C              Y pos $2C  (the volcano's is $90)
C5FE  JMP $C4E4
```

THREE differences from `$C486` that a copy-paste port would have got wrong:

| | `$C486` (stage 1) | `$C5AD` (stage 4) |
|---|---|---|
| `$69` ramp | TWO arms: `< $1E` -2, `< $0A` a further -2 | ONE arm: `< $1E` -2. **No `$0A` arm.** |
| accel jitter | `$C4C1` `ASL/ASL/ASL` then `AND #$07` -- **always 0** (three shifts clear bits 0-2 before the mask) | `$C5DE` `AND #$0F` on `$02` raw -- **live, 0..15** |
| Y position | `$90` (the crater, bottom) | `$2C` (the ceiling, top) |

The last one is the whole stage: stage 4's volcanoes hang from the CEILING and
drop, and `$99FC` (`$19 == 0 || $19 == 3 -> sfx $3F`) already treats stages 1
and 4 as the same eruption -- ported in `nmi.js:502` since W24. The listing and
the sound table agree, independently.

`$C601`-`$C632` is **byte-identical to `$C4F4`-`$C525`** (checked all 50 bytes).
The ROM carries two copies. The port must read `$C601`, not alias `$C4F4`, and
that is a difference NO mutation test can catch -- recorded below, not hidden.

### 3. `st_$B377` -- three instructions, and both exits already exist

```
B377  LDA $030C,X
B37A  BPL $B3A7        -> $B3A7 JMP $B0B4   (type += $80, the init frame)
B37C  JMP $B1FA        -> JSR $B184 / $B1F4 JSR $B16C / $B1EB JSR $B120 / $B251
```

Its sibling `$B36F` (the stage-1 volcano rock, entry 10) is identical except
its arc is `$B1E5` (`subY16`, moving UP) where `$B377` uses `$B1FA` (`addY16`,
moving DOWN). `loc_B1FA` was already factored out by W30 for `$B434`, and
`setInitialised` (`$B0B4`) has been there since W12. So entry 21 is genuinely
a 4-line port.

### 4. READING PAST THE APPARENT END -- what I checked, and what I found

- `$C5AD` does NOT end at `$C5FE`. `JMP $C4E4` is a continuation with nothing
  returning to it, and it sits **281 bytes EARLIER in the ROM**, inside
  `st_$C486`'s body. The port had that tail INLINED in `st_C486`; it is
  factored into `loc_C4E4(state, j)` now, exactly as W30 had to do for
  `loc_BD2C`/`loc_B1DA`/`loc_B212`. **This is the fourteenth incident of the
  family and the fourth JMP-backwards case in two waves.**
- `loc_$C4E4` really does end at `$C4F3 RTS`: `$C4F4` is the
  `approachStage0` DATA block (confirmed against `export_assets.py`'s block
  list, not by eyeballing the disassembly).
- `$B377` ends at `$B37E`; `$B37F` is `st_$B37F` (entry 11) and is entered only
  by the dispatch, never fallen into -- `$B37C` is a `JMP`.
- `sub_$B0B4` ends `$B0BD RTS`; `$B0BE` is `loc_$B0BE`, reached only from
  `$B0B2 BMI`. Not a fall-through.
- `$C633` (the X=4 stream) is `$C633`-`$C652`, 32 bytes, and `st_$C653` follows
  it. `sub_$C44F`'s index is `(pre-INC $69 & $3F) >> 1`, range 0..31 -- it
  cannot run off the end.
- NO EXPORTER CHANGE NEEDED: `approachStage3` (`$C601`-`$C652`, 82 bytes) was
  already exported. Same dividend W21's speculative block list paid W30.

### 5. Nothing else in the ROM special-cases `$19 == 3`

I grepped every `LDA $19` in `prg.asm` (25 sites) and read the compare after
each. Exactly ONE tests for 3: `$9A00 CMP #$03` inside `st_$99E9`, and it is
already ported (`nmi.js:502`). The stage-4-shaped constants everywhere else are
`CMP #$04` = `$19` 4 = in-game stage 5 (`$8B8D`, `$9663`, `$A17C`, `$C037`,
`$C25D`, `$C2A5`, `$C772`) -- W32's, not mine. Stated as a listing scan, which
is the only thing that can prove an absence.

(log continues below, updated as findings arrive)
