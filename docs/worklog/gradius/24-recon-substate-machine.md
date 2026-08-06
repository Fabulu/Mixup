# Wave 24 RECON - the play sub-state machine (jt_$982F) and the $1B ladder

status: DONE (recon, READ-ONLY - no src/ edits, no commit)
recon, 2026-08-02

Scope (from the W24 brief): enumerate ALL 16 arms of the play dispatch
`jt_$982F` ($1B low nibble), confirm which is the already-ported `$80`, role
the timer/countdown states, the boss-page transition, the despawn sweep, the
game-over arm, the `$96A5` ladder, and CONFIRM the measured `$1B` timeline to
the frame. Deliver the denominator and a per-arm inventory.

Everything below is read out of `games/gradius/rip/prg.asm` (the disassembly)
and cross-checked against `games/gradius/src/nmi.js` + `src/flow.js` (the port)
and the recorded cartridge artifacts in `tools/oracle/out/throwaudit-*.json`.

---

## 1. THE DENOMINATOR

**16 play sub-states; 1 ported; 15 throw.**

- Ported: `$80` → `st_$9A4D` (index 0). Its body - the scroll compare and the
  "keep playing" path - is live (`src/nmi.js playArm`). Its EXIT, the `$9A56`
  advance to `$81` (boss page reached), is still a loud throw. So `$80` runs
  for ~2676 frames and then throws on the frame the scroll hits the threshold.
- Throw: `$81`-`$8F` (indices 1-15). The port's `playArm` refuses any
  `state.substate !== 0x80` with the ROM address.

The **stage-1-clear critical path through jt_$982F is 7 states**, `$80`→`$81`→
`$82`→`$83`→`$84`→`$85`→`$86`, then it leaves the table (`$1B=$90`, bit 4 set →
the `$96CF` next-stage ladder arm). Of those 7, only `$80`'s body is ported;
`$81`-`$86` (6 states) plus the `$9A56` exit of `$80` are the W24 work items.
`$87`-`$8F` are stage-transition / intro-reset / warp states (see §5) and are
OFF the stage-1 clear path (0 hits in the 6000-frame endchain run).

Of the 15 throwing arms, **4 (`$87`-`$8A` = `$9B3E`/`$9BED`/`$9C12`/`$9C1E`)
are routines the port ALREADY runs via the intro dispatch** `jt_$96C5`
(`src/flow.js introStep` → introReset/introPackets/introHud/introMeter). They
are "ported as routines, throwing as jt_$982F arms" - when the cartridge
reaches them through `$982A` instead of `$96BE`, the port throws.

---

## 2. THE DISPATCH MECHANICS - `$83E4`, and why "low nibble" is exact

```
982A  A5 1B      LDA $1B          ; A = the whole $1B byte
982C  20 E4 83   JSR $83E4        ; inline jump table
```
`$83E4` opens with `ASL A` (multiply by 2 for the word index). The play states
are `$80`-`$8F`, so the high bit (`$80`) is consumed by the ASL as **carry-out**
and dropped: `$80`→`$00`, `$81`→`$02`, … `$8F`→`$1E`. The result is exactly
`(low nibble of $1B) << 1`, i.e. a 0-15 word index into the 16-entry table.
`$83E4` then pulls its own return address (the word after the `JSR`, = the
table base `$982F`), reads the 2-byte target `($98),Y`, and `JMP ($0098)`.

This is why jt_$982F is reached ONLY for `$1B & $F0 == $80` - the `$96A5`
ladder (§3) has already peeled off bits 4/5/6 and the `BPL` peels bit-7-clear,
so the table is only ever indexed 0-15. `$90`+ would read past the table, but
the ladder sends `$90` to `$96CF` before `$982A` is ever seen.

The port (`src/nmi.js playArm`) gets this right: it tests `substate !== 0x80`
rather than re-implementing the table.

---

## 3. THE `$1B` LADDER at `$96A5` (the 5 arms, for context)

jt_$982F is the LAST arm of the mode-5 ladder, not a standalone switch. The
ladder is read at `loc_$96A5` (line 2273); the port reproduces its exact order
in `stagePlay()` (src/nmi.js:316-350):

| test | ROM | arm | role | port status |
|---|---|---|---|---|
| `$1B & $10` | `$96A5`→`$96CF` | next stage (`INC $19`) | **THROW** |
| `$1B & $20` | `$96AB`→`$96EF` | DYING (`$4C` countdown → respawn) | **PORTED** (`dyingArm`) |
| `$1B & $40` | `$96B1`→`$96FB` | GAME OVER / continue | **THROW** (794 exec - §8) |
| `$1B & $80 == 0` (BPL) | `$96B7`→`$96BE` | stage INTRO (`jt_$96C5`, 5 entries) | **PORTED** (`introStep`) |
| else (bit 7 set) | `$96BB`→`$982A` | PLAY (`jt_$982F`, 16 entries) | **1 of 16 ported** |

So: 2 of 5 ladder arms are fully ported (intro, dying); 3 categories remain
(next-stage `$96CF`, game-over `$96FB`, and 15/16 of play). This matches the
plan's `$96A5` row exactly.

`$96EF` (dying) is live: `$C1D6` (src/collision.js) sets `$1B=$A0`, `$4C`
counts 120→0, then `$979D` respawns via `$9B3E`. `$96CF` (next-stage) does
`INC $19`, clears `$39/$3A/$3F` and `$50-$70`, then `$9C3C` sets `$1B=$80` -
the seamless stage transition (W27). `$96FB` is characterized in §8.

---

## 4. THE 16-ARM INVENTORY - jt_$982F (`$982F`, line 2532)

Index = low nibble of `$1B`. "hits" = exec-hook count in the 6000-frame
`throwaudit-endchain.json` run (a script that reached and killed the boss and
advanced to stage 2 - but it **died and respawned at least once**: 118 frames in
the `$A0` dying state). 0 = not reached by that one run, NOT absent.

| idx | `$1B` | target | role | hits (endchain) | status |
|---|---|---|---|---|---|
| 0 | `$80` | `$9A4D` | scroll-to-boss-page; `CMP $9A3D,X`; exit `$9A56`→`$81` | 2676 (f310) | **PORTED** body; `$9A56` exit THROWS |
| 1 | `$81` | `$9A0E` | countdown SETUP: `$4D := $9A35[$17]`, `$4C:=0`, `INC $1B` | 1 (f1339) | THROW |
| 2 | `$82` | `$99E9` | the COUNTDOWN: loop `$840C` on `$4C:$4D` till 0; `INC $1B` | **768** (f1340) | THROW |
| 3 | `$83` | `$99C0` | transition: `INC $1B`; stage≥5→`$86`, else continue | 1 (f2108) | THROW |
| 4 | `$84` | `$9982` | boss-page scroll: `CMP $9A3D,X` BEQ→despawn `$994A`; else spawn+`INC $1B` | **512** (f2109) | THROW |
| 5 | `$85` | `$997E` | BOSS FIGHT (do-nothing counter; exits via boss-death `INC $1B`) | 1101 (f2621) | THROW |
| 6 | `$86` | `$9904` | stage-end: despawn; `CMP $98FD,X`; `$1B:=$90` (or `$8E` warp) | 513 (f3722) | THROW |
| 7 | `$87` | `$9B3E` | full stage reset (clear `$3D-$97`, obj RAM); `INC $1B`→`$88` | 0 | THROW (routine ported via intro `$96C5[0]`) |
| 8 | `$88` | `$9BED` | intro banner: `JSR $83AB` then falls into `$9BF0` | 0 | THROW (routine ported via intro `$96C5[1]`) |
| 9 | `$89` | `$9C12` | intro HUD: `$88B6/$88F6/$892C`; `INC $1B` | 0 | THROW (routine ported via intro `$96C5[2]`) |
| 10 | `$8A` | `$9C1E` | intro meter: `$89E3`; `INC $1B` | 0 | THROW (routine ported via intro `$96C5[3]`) |
| 11 | `$8B` | `$988C` | conditional: `$57`→spawn 9 / else `$9C24`; `INC $1B`→`$8C` | 0 | THROW |
| 12 | `$8C` | `$98DD` | `INC $5B / JSR $ADAB / JMP $9A8C` | 0 | THROW |
| 13 | `$8D` | `$98E5` | reset-to-intro: `$1B:=0 / JMP $9B3E` | 0 | THROW |
| 14 | `$8E` | `$984F` | WARP route (forced 4px scroll, `STA $2D`) | 0 | THROW (W27) |
| 15 | `$8F` | `$984F` | WARP route (same target as `$8E`) | 0 | THROW (W27) |

---

## 5. THE MEASURED `$1B` TIMELINE - confirmed to the frame

Read out of `tools/oracle/out/throwaudit-endchain.json` (6000-frame cartridge
run, hooks on every arm + a `$1B` gate histogram). This is the W24 done-when
timeline, MEASURED here not quoted:

```
$1B   state    frames        game-frame range        role
----  ----     -----------   --------------------    --------------------------
$80   $9A4D    2676          310 - 1338              scroll to boss page $0C
$81   $9A0E    1             1339                    countdown setup
$82   $99E9    768           1340 - 2107             THE 768-frame countdown
$83   $99C0    1             2108                    transition
$84   $9982    512           2109 - 2620             THE 512-frame boss-page scroll
$85   $997E    1101          2621 - 3721             THE BOSS FIGHT
$86   $9904    513           3722 - 4234             stage-end (despawn + wait $0E)
$90   ->96CF   1             4235                    next stage (leaves jt_$982F)
```

The `$1B` gate histogram (`001B`) from the same run has **14 keys** summing to
exactly 6000 frames. The 8 *gameplay* keys are
`{128:2676, 129:1, 130:768, 131:1, 132:512, 133:1101, 134:513, 144:1}`
(128=`$80`, … 134=`$86`, 144=`$90`) - **5573 of 6000 frames**. The other 6 keys
are NOT part of the clean playthrough: `$1B`=0,1,2,3,4 (boot/intro, **309 frames**
total) and `$1B`=160 (`$A0`, the DYING state, **118 frames**) - i.e. the run died
and respawned at least once. The 8 keys above are the gameplay timeline only;
they are **not** 14-of-14 agreement and must not be presented as such (this is
the same species of overclaim as the "7 of 8" denominator - corrected here per
supervisor review).

- **The 768-frame `$82` countdown is EXACT.** `$82` = `$9A35[$17] × 256`. This
  run is unpowered: `$17` (rank) = 1 throughout the countdown, `$9A35[1]=$03`,
  3×256 = **768**. CONFIRMED. (A powered run at rank 4 would be `$9A35[4]=$05`
  = 1280 frames - the countdown is rank-indexed, so W24's done-when is exact
  only at the measured rank row, as the plan §6 warns.)
- **The 512-frame `$84` is EXACT.** 512 frames at the 0.5 px/frame scroll rate
  = 256 px = exactly one page - the boss-page approach scroll.
- **`$85` is the boss fight** (1101 frames here). It exits via the boss-death
  `INC $1B` (`$85`→`$86`), NOT via the `$997E` handler itself (which has no
  `$1B` write). That INC belongs to the boss death chain (W26, `$B914`). This
  is why `$85`'s own code is a one-line counter: the boss lives or dies in the
  shared `$9A5E` tail, and only its death moves `$1B`.

`maxScroll` in the run = 3584 = `$0E00`, i.e. the camera reached the stage-1
end page `$0E` (`$98FD[0]`), which is what unblocks `$86`→`$90`.

---

## 6. THE DEAD `$997E` FALL-THROUGH - structural, not just empirical

`st_$997E` ($85) is two instructions:
```
997E  E6 5B      INC $5B
9980  D0 35      BNE $99B7      ; taken -> JMP $9A5E (continue)
                               ; NOT taken -> fall into st_$9982 ($84)
```
The brief records "firing 0 times in 1101 opportunities" and says do NOT
implement the fall-through. The endchain run reproduces that (1101 `$85`
frames, 0 fall-throughs). **The listing says why it is dead, not just that it
is**: `$5B` is zeroed EVERY mode-5 frame at `$9658` (`STA $5B`, line 2221)
BEFORE the `$96A5` ladder - and therefore before `$997E` runs. So at the `INC`,
`$5B` is always 0 → becomes 1 → `BNE` (test ≠ 0) is ALWAYS taken. The
fall-through requires `$5B` to wrap `$FF`→`$00` on the `INC`, which is
impossible when `$5B` was just cleared to 0 by `$9658`. Every entry to `$997E`
passes through `$9658` (`$982A` is only reached from the bit-7 ladder arm,
which is downstream of `$9650`-`$965A`), so this is an ABSENCE proof from the
listing, not just a 0/1101 sample. **MUST-CONFIRM (implementer):** this proof
rests on ONE line - `$9658 STA $5B` (line 2221) zeroing `$5B` every mode-5
frame. Confirm that instruction and that it sits on the mode-5 path
unconditionally BEFORE relying on the dead-branch claim; until confirmed, treat
the `$997E` fall-through as "not observed in 1101 frames", not "structurally
dead". Recorded as a DEAD branch per the brief (conditional on the confirm).

(If `$5B` were NOT per-frame-cleared, the fall-through would re-fire `$9982`
every 256 frames and re-spawn the boss-page intro - the plan §6 "respawns the
boss every 256 frames" hazard. It does not, because of `$9658`.)

## 7. THE DESPAWN SWEEP `$994A` - keep the `$3E >= $D0` guard

`sub_$994A` (line 2709), called from `$9982`'s `BEQ $99BA` (when `$3F ==` the
threshold page) and from `$9904`'s `$1C==$93` arm (`JSR $994A` at `$9923`):
```
994A  A6 3E   LDX $3E / CPX #$D0 / BCC $997D      ; THE GUARD: only when $3E >= $D0
9950  A6 5E   LDX $5E / BMI $997D                   ; cursor valid
9954  C6 5E   DEC $5E                               ; advance the despawn cursor
9958-996D  clear 8 object-RAM columns at slot $5E ($0600/$0640/.../$05C0,X)
9970  E0 14   CPX #$14 / BCS $997D                  ; old cursor >= $14: skip status clear
9974-997A  clear $010C,$012C,$030C at the slot
997D  60     RTS
```
- **KEEP the `$3E >= $D0` guard** (`$994C CPX #$D0 / BCC`): the despawn only
  runs in the last ~¼ of each scroll page. `$3E` is the scroll LOW byte; at
  0.5 px/frame the sweep is armed for the tail of `$84`.
- **The immediate `$5E = $3F`** is set at `$99B3` (`A9 3F LDA #$3F` - the
  CONSTANT `$3F`, not the register) on the `$84`→`$85` transition, seeding the
  despawn cursor. (`$5E` has two writers - `$99B5`, `$9C0F` - and zero readers
  in the PRG; it is the sweep's own cursor, confirmed by `src/flow.js:155`.)

## 8. THE GAME-OVER ARM `$96FB` - 794 executions, confirmed

Re-summed here from ALL 11 `throwaudit-*.json` recordings (50,100 frames
total): **`$96FB` executes 794 times** - 397 in `deep-survivor` (first@3380) +
397 in `deep-autofire` (first@3968). `$97F1` (lives went negative) executes 2
times. This is the nmi.js comment's "794 executions, first at frame 3380",
reproduced byte-for-byte from the artifacts. It is the highest-traffic
unported arm in the whole port: two ordinary "lose three lives" runs each sit
in `$96FB` for ~400 frames. `$96FD` gates both the timeout and START on `$B0`
(pulse-1's duration counter, src/sound.js - "wait until the game-over jingle
finishes"); neither the timeout arm nor the continue screen is ported.

---

## 9. FALL-THROUGHS FOUND IN THIS REGION (read past every one)

1. **`$997E` → `$9982` (the `$85`→`$84` fall-through): STRUCTURALLY DEAD** -
   §6. The famous one; not implemented, never will be.
2. **`$9BED` → `$9BF0`: REAL.** `st_$9BED` is just `JSR $83AB` then control
   drops into `sub_$9BF0` (the stage-banner display: `LDA #$10 / JSR $85E8`,
   `LDA $19 / ADC #$08 / JSR $85F3`, …, `INC $1B`). So `$88` = `$83AB` +
   `$9BF0`. The intro port already does both (`introPackets`).
3. **`$9A4D`'s `$9A56` arm → `$9A5B`: convergence, not a trap.** Both the
   BCC-taken path (keep playing) and the advance path (`$9A56 STA $1B`) land
   at `loc_$9A5B` (`JSR $8357` = setBgm). Two roads, same tail.

Convergence points that are NOT fall-through traps (verified): `$99C0`→`$99D3`,
`$9A0E`→`$9A25`, `$9982`'s two `JMP $9A5E` exits, `$9904`'s branches to
`$9947 JMP $9A5E`. Every routine in the table ends in `JMP $9A5E`/`JMP $9A5B`
or `RTS`/`JMP` - no other accidental drop-into-the-next-routine besides the
two above.

---

## 10. THE TABLES (read out of the ROM, byte-verified)

| label | addr | bytes | use | indexer |
|---|---|---|---|---|
| `$9A35` | `$9A35` | `03 03 04 04 05 05 06 06` | `$82` countdown = byte × 256 | `X=$17` (rank) |
| `$9A3D` | `$9A35+8` | `0C 0C 0C 0C 0B 0B 0C 02` | boss-page scroll threshold | `X=$19` (stage); `$9A3D[0]=$0C`=3072 px |
| `$9A45` | `$9A35+16` | `81 ×8` | `$80`→`$81` next-state | `X=$19`; always `$81` |
| `$98FD` | `$98FD` | `0E 0E 0E 0E 0D 0C 0D` | stage-END scroll threshold | `Y=$19`; `$98FD[0]=$0E`=3584 px |

**`$9A35` is dual-purpose**: one 16-byte table, first 8 bytes indexed by rank
(`$17`, the `$82` countdown), last 8 bytes = `$9A3D` indexed by stage (`$19`,
the boss-page threshold). They share storage but never collide because rank
and stage index disjoint halves. W24 ports both reads from this one table.

Stage 1 arithmetic, confirmed against `maxScroll=3584` in the endchain run:
boss page at `$0C`×256 = **3072 px** (the `$9A56` transition fired at f1338);
stage end at `$0E`×256 = **3584 px** (the `$86`→`$90` advance fired at f4235,
camera at `$0E00`).

**EXPORT STATUS (checked against every `assets/**/*.json`):**
- `$9A3D` (boss-page thresholds, **8 bytes** - proven by `$9A45` abutting at
  `$9A35+16`; the byte column and `assets/manifest.json` both show
  `[12,12,12,12,11,11,12,2]`, 8 entries) - EXPORTED as `stage.bossPage` in
  `assets/manifest.json` (`values [12,12,12,12,11,11,12,2]`) and carried
  per-stage in `assets/terrain/stages.json`; the port already reads it as
  `res.stage.bossPage`.
- `$98FD` (stage-end thresholds - **byte count UNCONFIRMED**: the read shows 7
  (`0E 0E 0E 0E 0D 0C 0D`) but `$9A3D`'s labeled "7" was really 8, so VERIFY what
  abuts `$98FD`; if it is 8, the last stage's end-threshold read shifts by an
  entry) - EXPORTED as `stage.endPage` in `assets/manifest.json`. (Not yet read by
  the port - `$86`/`$9904` is a throw
  - but the data is in the tree.)
- `$9A35` (the rank-countdown half, first 8 bytes) - **NOT EXPORTED.** W24
  must add it; this is the load-bearing data for the `$82` countdown.
- `$9A45` (next-state, 8 bytes all `$81`) - **NOT EXPORTED**, but trivially
  the constant `$81` for every stage (verified from the ROM); a literal is
  honest, an export is cheaper to defend.

So `$9A3D` is the one case where a single 16-byte ROM block is split across
two names: its tail is exported (`stage.bossPage`), its head (`$9A35`, rank
countdown) is not. This is not a defect in W21 - the head had no reader in the
port until W24's `$82`.

---

## 11. WHAT I COULD / COULD NOT REACH

- **CONFIRMED by measurement** (exec hooks + `$1B` gate, `throwaudit-endchain.json`):
  the full `$80`→`$86`→`$90` timeline to the frame; the 768-frame `$82` (=
  `$9A35[1]`×256, rank 1); the 512-frame `$84`; `$85`=boss fight (1101 f);
  `$86`→`$90` at scroll `$0E`; `$96FB`=794 executions (summed across all 11
  recordings, first@3380).
- **CONFIRMED from the listing** (absence proofs): the `$997E` fall-through is
  structurally dead (`$5B` per-frame-cleared at `$9658`); the `$83E4` ASL
  consumes bit 7 so "low nibble" is exact; the 16-entry table is complete
  (`$982F`-`$984E`, 32 bytes, proven by `$984F st_984F` abutting).
- **NOT measured here**: the countdown at rank ≠ 1 (would need a powered
  endchain run; rank 4 → 1280 frames per the table, unverified dynamically).
  The plan §6 already flags rank coverage; I did not record a higher-rank run.
- **The boss death `INC $1B`** (`$85`→`$86`) is W26 (`$B914`); I confirmed
  `$997E` has no `$1B` writer, so the exit is external, but I did not trace the
  boss death chain itself (out of W24 scope).
- **`$8B`/`$8C`/`$8D`** (`$988C`/`$98DD`/`$98E5`): 0 hits in the endchain
  run; roles inferred from the listing only. `$8D` (`$98E5`) sets `$1B:=0` and
  jumps to `$9B3E` - a reset-to-intro. They are off the stage-1 clear path.

---

## 12. WHAT W24 PORTS (the implementer's to-do, distilled)

1. The 16-entry dispatch in `playArm`: replace the single `$80` test with the
   table, throw loudly on any arm not yet implemented (the 4 intro-shared
   routines can delegate to the existing intro code).
2. `$80`'s `$9A56` exit → `$81` (set `$1B := $9A45[$19]`, all `$81`), then
   `$9A5B` (= setBgm, already ported).
3. `$81` `$9A0E`: `$4D := $9A35[$17]`, `$4C:=0`, `INC $1B`, `$62:=1`, clear
   `$63-$6F` (`$99DF`), → `$9A5B`.
4. `$82` `$99E9`: 16-bit decrement of `$4C:$4D` via `$840C`; loop till 0; then
   `INC $1B`, conditional sfx `$3F` on stage 0/3, → `$9A5E`.
5. `$83` `$99C0`: `INC $1B`; stage≥5 → `$1B:=$86`; else `INC $5B`,`$62:=2`,
   clear `$63-$6F`, → `$9A5E`.
6. `$84` `$9982`: `CMP $9A3D,X`; BEQ → despawn `$994A` + stay; else spawn 2
   (`$A527`), `INC $1B`→`$85`, `$5E:=#$3F`, → `$9A5E`.
7. `$85` `$997E`: `INC $5B` only (the dead fall-through is NOT ported); the
   boss-death `INC $1B` is W26.
8. `$86` `$9904`: despawn on `$1C==$93`; `CMP $98FD,X`; `$39==0` → `$1B:=$90`
   (next stage), else `INC $19`,`$1B:=$8E` (warp, W27), → `$9A5E`.
9. `$96FB` game-over: the `$B0` gate + timeout/continue. (Brief lists it; it
   is the `$1B` ladder, separate from jt_$982F.)

Tables: `$9A3D` and `$98FD` are already exported (`stage.bossPage` /
`stage.endPage` in `assets/manifest.json`); **`$9A35` (rank countdown, the
`$82` data) is NOT exported and W24 must add it**; `$9A45` is the constant
`$81`. See §10 for the per-table export status.

**MUST-CONFIRM before/while porting (carried from supervisor review):**
(a) `$9658 STA $5B` zeroes `$5B` every mode-5 frame - the `$997E`-dead absence
proof (§6) rests on this one line; confirm the instruction and that it is on the
mode-5 path unconditionally before relying on it.
(b) `$98FD`'s byte count - confirm 7 vs 8 (§10); if 8, the stage-end threshold
read shifts by an entry.
(c) The `$1B` histogram is 14 keys, not 8 (§5) - the run died at least once;
quote all 14 or name the omitted 6, never present 8 of 14 as full agreement.
