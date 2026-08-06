# RECON 1/5 - EVERY enemy: the complete $AE1C dispatch table and every handler
status: DONE
wave: 20   role: recon (reader)   started: 2026-08-01

## Mandate

Read the ENTIRE `$AE1C` dispatch table out of the ROM - all 42 entries - and
every handler each one points at. Deliver a DENOMINATOR. Enumerate the tables
the handlers index so that "handler indexes a table the port does not export"
cannot bite again the way `$B086`/`$B088` did in wave 15.

Reader role. No edits under `games/*/src/`. Two tools added:
`games/gradius/tools/census.py` and `games/gradius/tools/handlerflow.py`.
No commits.

## Method

Everything below is counted out of `games/gradius/assets/prg.bin` (32,768
bytes, byte-identical to the PRG of `Gradius (USA).nes` - verified in-run).
The emulator was NOT used. Per `docs/knowledge/09-enumerate-then-validate.md`
the ROM is the source of the INVENTORY; wave 21+ owes the VERDICT.

```
python games/gradius/tools/census.py dispatch|waves|types|tables|all
python games/gradius/tools/handlerflow.py
python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear <from> <to>
```

`census.py ported_targets()` reads the `case 0xNNNN:` labels out of
`games/gradius/src/enemies.js`'s `dispatch()` so the ported column cannot drift
from the source.

---

## 1. THE DENOMINATOR - $AE1C, 42 entries

```
=== $AE1C dispatch table: 42 entries ===
raw 70 AE DD AE 99 AE E1 AE 05 B2 AF B0 98 B1 E1 B6 6C B2 11 B3 6F B3 7F B3
    CB B3 02 B4 34 B4 2E AF 88 AF 26 B0 98 B0 47 B7 5E CA 77 B3 06 C9 A1 B7
    14 B9 13 B9 80 B4 F2 B4 FD B4 59 B5 69 B5 70 AE 10 AF 10 AF 10 AF 10 AF
    10 AF 10 AF 1E B6 DD AE 0F BB DD AE
entries ported 13 / 42 ; throwing 29
distinct targets 34 ; distinct ported 10 ; distinct throwing 24
  $AE70 shared by 2 entries: [0, 31]
  $AEDD shared by 3 entries: [1, 39, 41]
  $AF10 shared by 6 entries: [32, 33, 34, 35, 36, 37]
```

The table is 84 bytes, `$AE1C-$AE6F`; `$AE70` is the `RTS` entries 0 and 31
point at AND the byte immediately after the table. `$83E4` does `ASL A` in 8
bits and has NO bounds check, so the handler index is `type AND $7F` and a type
with `(type AND $7F) >= 42` would read code at `$AE70+` as a pointer. Measured
against the inventory in §3: **no producer in the ROM makes such a type** - the
largest is `$29` = 41.

| # | target | types | ported | what it is (read out of the ROM) |
|---|---|---|---|---|
| 0 | `$AE70` | `$00/$80` | **yes** | bare `RTS`. No producer of type `$00` exists. |
| 1 | `$AEDD` | `$01/$81` | **yes** | freeze check (`$5B`), then **falls through** to `$AEE1`. The power-up capsule. |
| 2 | `$AE99` | `$02/$82` | **yes** | explosion-script player (`$AE71`), then **falls through** to `$AEDD` → `$AEE1`. |
| 3 | `$AEE1` | `$03/$83` | **yes** | the generic 0.5 px/frame left drift + off-left free. No producer of type `$03` exists; it is live only as the fall-through tail. |
| 4 | `$B205` | `$04/$84` | **yes** | 4-phase arcing squadron member (shares `$B1B1`/`$B1DF`/`$B1F1` with entry 6). 90 wave spawns. |
| 5 | `$B0AF` | `$05/$85` | **yes** | the fan: fly left to X<$60, home on player Y for 64 frames, exit right. 38 spawns. |
| 6 | `$B198` | `$06/$86` | **yes** | arc with turn schedule `$B200` (`00 00 01 00 00`). 50 spawns. |
| 7 | `$B6E1` | `$07/$87` | no | **terrain WALKER, floor-hugging.** Probes terrain with `$C3D3` at (x, y+8) and (x, y-3+8); rides the ground, animates via `$B628` record 0, docks to a target column set by `$B65C` (= player X + $30, clamped $20..$F0, `AND $F8`). Tables `$B6D2`/`$B6D9`/`$B6DD`. 35 spawns. |
| 8 | `$B26C` | `$08/$88` | **yes** | vertical sine chaser (uses `$03BC/$03EC` as a 16-bit Y accumulator via `$B2EE`/`$B304`). 72 spawns. |
| 9 | `$B311` | `$09/$89` | no | the enemy the FLOOR HATCH (`$AF2E`) launches. 8-frame flip animation `$B33B` (`5E 5F 60 61 62 61 60 5F`) with the palette bit flipped for frames 4-7; rises to player Y then goes ballistic (`$B2DB`). **Never spawned by wave data - only by `$AF98`.** |
| 10 | `$B36F` | `$0A/$8A` | no | 5 bytes: if bit 7 clear `BPL $B3A7` (entry 11's init), else `JMP $B1E5` (entry 6's rightward mover). Produced ONLY by `$C4DC` - the stage-0/2 boss-approach spawner. |
| 11 | `$B37F` | `$0B/$8B` | no | 9-frame spin `$B3C2` (`64 64 64 65 65 65 66 66 66`), then metasprite `$67` and **it aims itself like a bullet**: `$B3B6 JSR $BCB5` + `$B3B9 JSR $BDFA`. 14 wave spawns, plus `$C564`. Exempt from the squadron capsule counter (`$A44C CMP #$0B`). |
| 12 | `$B3CB` | `$0C/$8C` | no | the enemy the CEILING HATCH (`$AF88`) launches; mirror of entry 9. **Never spawned by wave data.** |
| 13 | `$B402` | `$0D/$8D` | no | entry-4 variant with its own phase table `$B42F` (`00 00 00 01 01`). 5 spawns. |
| 14 | `$B434` | `$0E/$8E` | no | entry-4/13 variant, phase table `$B45C` (`00 00 00 01 01`). 5 spawns. |
| 15 | `$AF2E` | `$0F/$8F` | no | **FLOOR HATCH.** `$010C = $80` (armoured), `$0460 = 1`, `$048C = 1`. Every frame `JSR $AF98` with Y=$08, A=$09 → spawns type `$09`. Metasprite `$78` (`$63` on stage 5). Damage counter `$046C`: ≥3 → `$018C = 3` (palette), ≥5 → destroyed, and on stage 0 it checks `$07E5,Y`, bumps `$5F`, and at `$5F >= 4` does **`INC $39`** - the warp flag. 14 spawns. |
| 16 | `$AF88` | `$10/$90` | no | **CEILING HATCH.** Same body entered at `$AF33`/`$AF54`; Y=$F6, A=$0C, metasprite `$79`. 8 spawns. |
| 17 | `$B026` | `$11/$91` | **yes** | aiming turret, 6-octant metasprite `$B086` + muzzle rows `$B08C`/`$B092`. 102 spawns - the most-spawned type in the game. |
| 18 | `$B098` | `$12/$92` | **yes** | the armoured/flipped turret; sets `$018C |= $80`, then branches INTO `$B026`'s body. 74 spawns. |
| 19 | `$B747` | `$13/$93` | no | **terrain WALKER, ceiling-hugging.** Mirror of entry 7 (probes y-8, y-8+3), shares `$B723` and `$B676`. Sets `$018C |= $80`. 44 spawns. |
| 20 | `$CA5E` | `$14/$94` | no | **big multi-part `$0600`-page object** (the only consumer of the `$A4A6` allocator). Type `$94` is the one `$C05D` silences the armour ping for. Two damage thresholds by rank: `$CA49` (`0A 0C 0E 10 12 14 16`) and `$CA50` (`14 18 1C 20 24 28 2C`), Y speed `$CA57`. Metasprites `$81/$82`, +2 after the first threshold. Spawned by stage 4's inline records and by `$C653`. |
| 21 | `$B377` | `$15/$95` | no | 3 instructions: bit-7 test then `JMP $B1FA` (entry 6's leftward-mover tail). Produced ONLY by `$C5F6` (stage-3 boss approach). |
| 22 | `$C906` | `$16/$96` | no | the **stage-2-only** object spawned by `$A46F`. `$010C AND $0F` selects one of four sub-variants; `$046C >= 3` → `$C77C`. Indexes `$C87B` (four `$FF`-terminated streams), `$C893` (4 pointers: `$C89B $C8F1 $C8BD $C8E0`), `$C936` (period by rank), `$CA29`. |
| 23 | `$B7A1` | `$17/$97` | no | **a mid-boss.** Forces type `$97`, `$010C = $80`, hitbox class 1. Charges in to X=$F0 then homes on the player Y with per-rank speeds (`$B78F` X-frac, `$B799` Y-frac), fires **three** bullets at once into slots 22-31 (`$B870-$B8E5`, offsets `$B8E6`/`$B8E9`/`$B8EC`), fire period `$B787`, dies after `$B852[$17]` hits (2..8 by rank). 1 wave spawn (stage 2 cmd `$2B`) + `$C6BC` when `$3A = 0`. |
| 24 | `$B914` | `$18/$98` | no | **THE BOSS CORE.** A THREE-slot object: it writes `$030B,X`/`$030A,X` etc. - base slot plus the two below it, which it seeds as type `$99` (entry 25). Damage frames `$B8EF` (`6C 6D 6E 6F 70 71 00`), Y speed `$B8F8`/`$B901` by rank, fire period `$B90A`, 4-way spread `$BAF7`/`$BAFB`/`$BAFF`/`$BB07`. On death: `INC $3B,X` (per-player stage counter), `INC $1B` (game state), and on stage 1 with `$04CC == 1` and `$04AC < $78` **`INC $39`**. Spawned at a fixed address by `$999D-$99AF` (slot 21) when `$3F == $9A3D[$19]`. |
| 25 | `$B913` | `$19/$99` | no | a single `RTS` byte. The boss core's two extra slots are this type: they are drawn and collidable but have no update. Not the same address as entry 0/31. |
| 26 | `$B480` | `$1A/$9A` | no | `$B628` animator record 6, and **it aims itself like a bullet** (`$B4A2 JSR $BCB5`, `$B4B3 JSR $BDFA`), alternating fire/drift with per-rank dwell `$B4E4` (`50 50 40 30 20 10 10`) and `$B4EB` (`60 60 50 40 30 20 20`). Also the multi-hit type: `$C090` counts hits in `$04AC` against `$BFC5[$17]` (`05 05 05 05 06 07 08 09 0A`). Explosion script 3 (`$BEC1`). 53 spawns. |
| 27 | `$B4F2` | `$1B/$9B` | no | 3 instructions: bit-7 init or `JMP $BDFA` - a pure ballistic mover. **I found no writer of type `$1B` anywhere in the ROM** (see §3 caveat). |
| 28 | `$B4FD` | `$1C/$9C` | no | `$B628` record 3; a 4-phase pursuit driven by `$046C` (0 dwell → 1 pick side → 2/3 climb/dive to player Y → 4 accelerate). 2 spawns (stage 2 cmds `$8D`/`$8E`). |
| 29 | `$B559` | `$1D/$9D` | no | `$B628` record 9 + `DEC $036C` + `$B251`; shares entry 28's init. 10 spawns. |
| 30 | `$B569` | `$1E/$9E` | no | **the STAGE-END GATE / scripted set piece.** `JSR $AEDD` first, then once X < $B0 it does `INC $5B` (FREEZES the whole game), plays sound `$1F`, and over 7 steps writes canned packets (`$85E8`, `$864E`) plus direct nametable rows into `$06C2/$06CA/$06D2/$06DA` and `$06F1..` from `$B606`/`$B612`. 2 spawns (stage 5, cmd `$4B`). |
| 31 | `$AE70` | `$1F/$9F` | **yes** | bare `RTS`. No producer of type `$1F` exists. |
| 32-37 | `$AF10` | `$20-$25` | no | **six blinking pickups.** Metasprite `$AF0A[type-$20]` = `89 87 8C 8B 8A 88`, blanked whenever `($02 AND $1F) >= $1A` (blinks off 6 frames in 32), then `JMP $AEDD` → drift. 2 spawns each (stage 5 cmds `$63-$68`). |
| 38 | `$B61E` | `$26/$A6` | no | `$B628` record 0 then `JMP $B103` (entry 5's "X += 3 then `$B251`"). Produced ONLY by `$C6BC` when `$3A = 1`. |
| 39 | `$AEDD` | `$27/$A7` | **yes** | same routine as entry 1. 9 spawns. |
| 40 | `$BB0F` | `$28/$A8` | no | **the scripted fly-past on slot 21**, spawned by `$988C-$98AE`. Walks a 26-record path script at `$BB82` (`[dX, YhiNibble|metaspriteLowNibble]`, `$FF` at `$BBB6`), metasprite `$96 + nibble`. At the end: sound `$AC`, explosion script **5**, `INC $0495`, `$4E = $A0`. If `$048C != 0` and `$4F != $FF` it jumps to `$CE94`; otherwise `DEC $4C` to zero → free the slot and `INC $1B`. |
| 41 | `$AEDD` | `$29/$A9` | **yes** | same routine as entry 1. 5 spawns. |

**13 ported / 42. 29 throwing. 24 distinct throwing routines.**

> **WAVE 22 - SIX OF THE 29 LANDED, and the table above is now stale in exactly
> six rows.** Entries **7 (`$B6E1`)**, **9 (`$B311`)**, **12 (`$B3CB`)**,
> **15 (`$AF2E`)**, **16 (`$AF88`)** and **19 (`$B747`)** read **yes**.
> `census.py dispatch` re-measured on 2026-08-02:
> `entries ported 19 / 42 ; throwing 23` and
> `distinct targets 34 ; distinct ported 16 ; distinct throwing 18`.
> That is every entry stage 0's wave script names - `wavecensus.py` prints
> `stage 0: 92 distinct, 92 ported, 0 unported, 100.0%`. See
> `22-impl-six-routines.md`.
>
> **ONE CORRECTION TO ENTRY 7's ROW, from the listing.** It says the walker
> "animates via `$B628` record 0". It does not: **neither `$B6E1` nor `$B747`
> contains any reference to `$B628`.** The animation is `$B6B8`'s `$B6D9`
> lookup (`1C 1C 1F 1F`, indexed by `$04AC` + 2 when the walker is left of the
> ship). `$B628`'s only Y = 0 caller is `$B61E`, entry 38.
>
> **AND ONE THING THE CENSUS COULD NOT SEE, because it only walked `$AE1C`.**
> Porting entries 15/16 required porting `$C05F-$C08D` in the COLLISION code as
> well: `$AF3B LDA #$80 / STA $010C,X` makes a hatch armoured, and the port's
> armoured arm was a throw. A hatch without it is invulnerable AND crashes on
> the first shot fired at it. A dispatch-table census is not a closure over what
> a handler needs.

---

## 2. FALL-THROUGH - read past the apparent end

`handlerflow.py` walks each target with a real decoder and reports where control
actually arrives. Result:

**TRUE fall-throughs (no jump - the bytes just run on):**

```
$AE99 (entry 2)  ends $AEDA DEC $014C,X  ->  $AEDD (entry 1)  ->  $AEE1 (entry 3)
$AEDD (entries 1,39,41) ends $AEDF BNE $AF09  ->  $AEE1 (entry 3)
```

That is the ONLY fall-through chain between dispatch entries. Everything else is
an explicit jump/branch/JSR **into the interior of another handler**, which is
the more dangerous shape for a port that writes one function per entry:

```
$AF2B  JMP $AEDD     from $AF10 (32-37), and reached by $AF65 BCC from $AF2E (15)
$AF40  JMP $B0B4     entry 15 -> the MIDDLE of entry 5
$AF8B  BPL $AF33     entry 16 -> the MIDDLE of entry 15   (16 IS 15, re-entered)
$AF96  BNE $AF54     entry 16 -> the MIDDLE of entry 15
$B083  JMP $AEDD     entries 17,18
$B0AB/$B0AD BCS $B033 / BCC $B038   entry 18 -> the MIDDLE of entry 17
$B22E..$B232 JMP $B1B1   entry 4  -> the MIDDLE of entry 6
$B23E  JMP $B1F1     entry 4  -> entry 6's shared tail
$B2DB  JMP $B103     entry 8  -> the MIDDLE of entry 5
$B31B  JMP $B0B4     entry 9  -> the MIDDLE of entry 5
$B36C  JMP $B2DB     entry 9  -> the MIDDLE of entry 8
$B372  BPL $B3A7     entry 10 -> the MIDDLE of entry 11
$B374  JMP $B1E5     entry 10 -> the MIDDLE of entry 6
$B37C  JMP $B1FA     entry 21 -> entry 6's shared tail
$B3D5  JMP $B3A2     entry 12 -> the MIDDLE of entry 11
$B3FC  JMP $AEDD     entries 9,12
$B3FF  JMP $B367     entry 12 -> the MIDDLE of entry 9
$B40F/$B44E JMP $B212  entries 13,14 -> the MIDDLE of entry 4
$B42C  JMP $B1DA     entry 13 -> the MIDDLE of entry 6
$B437  BPL $B407     entry 14 -> the MIDDLE of entry 13
$B456/$B459 JMP $B1F1/$B1FA   entry 14 -> entry 6's tails
$B4C8  JSR $AEE1     entry 26 CALLS entry 3
$B4FA  JMP $BDFA     entry 27 -> the ENEMY-BULLET mover
$B502  (via $B55C BPL) entry 29 -> the MIDDLE of entry 28
$B556  JMP $B2D2     entry 28 -> the MIDDLE of entry 8
$B569  JSR $AEDD     entry 30 CALLS entry 1 as its FIRST instruction
$B625  JMP $B103     entry 38 -> the MIDDLE of entry 5
$B723  JSR $AEDD     entries 7,19
$B753  BNE $B723     entry 19 -> entry 7's shared tail
$B7F3  JMP $B690     entry 23 -> the MIDDLE of the shared docking routine $B676
$C919  JSR $AEDD     entry 22 CALLS entry 1
$CAB8/$CB17 JSR $AEE1  entry 20 CALLS entry 3 TWICE
```

**One near-miss worth recording.** `$B098` (entry 18) ends
`$B0AB BCS $B033 / $B0AD BCC $B038`. Those two cover both carry states, so
control never reaches `$B0AF` - but a linear fall-through reader (and my own
tool, before I read the pair) reports "entry 18 falls into entry 5". It does
not. The `BCS`/`BCC` pair is an unconditional branch written as two.

**A second near-miss.** `$B913` (entry 25) is a single `RTS` byte immediately
before `$B914` (entry 24). `RTS` terminates; entry 25 does NOT run the boss.

---

## 3. WHO CAN CREATE WHICH TYPE - the reachability inventory

Every absolute store into the type page `$0300-$031F` in the whole 32 KB
(scanned for opcodes `8D/9D/99/8E/8C`), plus `INC`/`DEC` (there are **none**):

| site | type written | reaches entry |
|---|---|---|
| `$A3D2` | `$64-$A0`, or `$64-$D0` if ≥$30 | table A - see below |
| `$A462` | `$65` from table B | 4,5,8,11,13,14,28,29 |
| `$A49D` | `#$96` | 22 (stage 2 inline only) |
| `$A4DE` | `$66` from an inline record | 20 (`$66` is `$14` at every caller) |
| `$AEC3` | `#$01` | 1 (explosion → capsule) |
| `$AEFA` | `#$00` | free |
| `$AFE0` | `$AA` = 9 or 12, from `$AF98`'s two callers | 9, 12 |
| `$B028`/`$B09A` | `#$91`/`#$92` | 17, 18 (self) |
| `$B0BA` | `+$80` | bit-7 init, all handlers |
| `$B7AF` | `#$97` | 23 (self) |
| `$B92C` | `#$98` | 24 (self) |
| `$B9FF` | `#$99` | **25** |
| `$BED3` | `#$02` | 2 (death) |
| `$C14A`/`$C15B` | `#$01` | 1 |
| `$C4DC` | `#$0A` | **10** |
| `$C564` | `#$0B` | 11 |
| `$C5F6` | `#$15` | **21** |
| `$C6BC` | `$C6CC[$3A]` = `$97` or `$A6` | **23, 38** |
| `$CA6E` | `#$94` | 20 (self) |
| `$CB47` | `#$02` | 2 |
| `$98A1` | `#$28` → `$0315` (slot 21) | **40** |
| `$99A2` | `#$98` → `$0315` (slot 21) | **24** |
| `$9974`/`$9B49`/`$A548` | 0 | clears |

`$C413` is a whole second spawner I had not seen described anywhere: it is the
stage-end/boss-approach engine, reached from `$A2C4` (`$3A != 0`) and `$A2FB`
(`$1B == $82`). It has its OWN inline dispatch on `$19` at `$C439`, 7 entries:

```
$C486 (stage 0)  $C546 (1)  $C686 (2)  $C5AD (3)  $C653 (4)  $C6DE (5)  $C429 (6, the RTS)
```

plus a 4-entry pointer table at `$C447` (`$C526 $C58D $C633 $C752`) of packed
nibble streams that pick spawn X/Y. `$C6DE` (stage 5) does not spawn an enemy at
all - it fills an **enemy-bullet** slot (`$0316`/`$0136`) directly.

**Types with NO producer anywhere in the 32 KB: `$00` (entry 0), `$03` (entry
3), `$1B` (entry 27), `$1F` (entry 31).** Caveat, stated the way the method
requires: I enumerated every absolute store and every INC/DEC into the page.
A write through an indirect pointer would not appear; I found no zero-page
pointer anywhere set to an `$03xx` address, but I did not prove that
exhaustively. Entries 0 and 31 are `RTS` so it does not matter; entry 3 is live
as the fall-through tail regardless; **entry 27 (`$B4F2`) is the one entry that
looks genuinely dead.**

### Wave data, complete

```
unique chunk wave-lists: 39 of 51 chunk slots
table-A cmds used 119, range $00-$78, UNUSED: ['$32', '$52']
table-B cmds used 24: $80-$97 (all 24)
inline cmds used: ['$F0', '$F1', '$F2', '$F3']
spawning wave records (all chunk slots): 718
spawning wave records (unique lists): 598
TOTAL wave records (incl. $FF terminators): 769
```

**Table A** (`$A662`, stride 3, four bytes read, `$67` unused on the `$A3B1`
path) has exactly **121 entries**, `$00-$78`: `$A662 + 3*$78 + 3 = $A7D0`, which
is the stage pointer table. Two (`$32`, `$52`) are never referenced.

**Table B** (`$A602`, stride 4) has exactly **24 entries**, `$A602-$A661`, cmds
`$80-$97`, all 24 used. Note `$A36F ASL/ASL` makes the index `(4*cmd) AND $FF`,
so a cmd in `$98-$EF` would read table A as a descriptor - no wave list contains
one.

**`$A592` formation geometry has 21 entries, not 20** (`$A592-$A5BB`, indices
`$00-$14`; index 20 = `B3 2C` is used by cmd `$93`). `00-recon-enemies.md` §3
lists 20. *(Wave 21, re-measured: the missing entry is index **19** (`F4 2A`);
indices 17 and 18 in that list are correct, so "off by one from index 17 on"
overstated it. `00-recon-enemies.md` is now fixed and both counts are pinned by
`games/gradius/tests/tables.test.js`.)* **`$A5BC` pattern table has 22
entries** (`$A5BC-$A5FD`, 3 bytes each, max index used `$15`).

**Types the wave data can spawn: 26 distinct, hitting 26 distinct entries -
8 ported, 18 throwing.**

```
type $04 -> entry  4 $B205  x90   PORTED      type $13 -> entry 19 $B747  x44   THROWS
type $05 -> entry  5 $B0AF  x38   PORTED      type $17 -> entry 23 $B7A1  x1    THROWS
type $06 -> entry  6 $B198  x50   PORTED      type $1A -> entry 26 $B480  x53   THROWS
type $07 -> entry  7 $B6E1  x35   THROWS      type $1C -> entry 28 $B4FD  x2    THROWS
type $08 -> entry  8 $B26C  x72   PORTED      type $1D -> entry 29 $B559  x10   THROWS
type $0B -> entry 11 $B37F  x14   THROWS      type $1E -> entry 30 $B569  x2    THROWS
type $0D -> entry 13 $B402  x5    THROWS      type $20 -> entry 32 $AF10  x2    THROWS
type $0E -> entry 14 $B434  x5    THROWS      type $21 -> entry 33 $AF10  x2    THROWS
type $0F -> entry 15 $AF2E  x14   THROWS      type $22 -> entry 34 $AF10  x2    THROWS
type $10 -> entry 16 $AF88  x8    THROWS      type $23 -> entry 35 $AF10  x2    THROWS
type $11 -> entry 17 $B026  x102  PORTED      type $24 -> entry 36 $AF10  x2    THROWS
type $12 -> entry 18 $B098  x74   PORTED      type $25 -> entry 37 $AF10  x2    THROWS
                                              type $27 -> entry 39 $AEDD  x9    PORTED
                                              type $29 -> entry 41 $AEDD  x5    PORTED
```

### STAGE 1 SPECIFICALLY - the owner's complaint, quantified

Stage 0's eight chunk slots (six distinct lists) reference these cmds:

```
chunk 0 $A844  10:80 30:81 50:80 70:81 90:80 A0:82 B0:82 C0:82 D0:82 E0:80 FF
chunk 1 $A859  00:81 20:80 30:82 40:82 50:82 60:83 70:84 80:83 90:82 A0:82 B0:82
               C0:00 C8:00 D0:00 E0:01 F0:02 FF
chunk 2 $A87A  00:82 10:82 20:03 22:04 30:83 40:84 50:05 58:05 68:06 70:96 80:02
               90:01 A0:03 A2:04 B0:83 C0:96 D0:83 E0:96 F0:83 F8:74 FF
chunk 3 $A8A3  00:04 10:03 20:01 30:82 40:82 50:82 60:01 70:83 80:96 90:05 98:05
               A8:06 B8:82 C8:82 D8:82 E0:83 F0:96 FF
chunk 4 $A8C6  10:02 20:82 30:83 40:84 50:09 60:82 70:03 80:00 88:00 98:07 A0:83
               B0:84 C0:82 C0:03 D0:82 D4:04 E0:05 E8:08 F8:06 FF
chunk 5/6/7 $A8ED  00:04 02:03 20:09 30:02 34:69 40:02 50:04 60:02 70:01 80:02 FF
```

Computed per stage (`census.py` + the dispatch/ported join):

```
stage 0: 12 entries reached; PORTED [4,5,6,8,17,18,39,41] ; THROWS [7,15,16,19]
stage 1: 10 entries reached; PORTED [4,5,8,17,18,39,41]   ; THROWS [11,15,16]
stage 2: 11 entries reached; PORTED [4,5,8,17,18,39,41]   ; THROWS [13,14,23,28]
stage 3: 14 entries reached; PORTED [4,5,6,8,17,18,39,41] ; THROWS [7,13,14,15,16,19]
stage 4:  4 entries reached; PORTED [8]                   ; THROWS [13,14,29]
stage 5:  8 entries reached; PORTED [4,5,8,17,18,39]      ; THROWS [15,26]
stage 6: 17 entries reached; PORTED [4,5,6,8,17,18]       ; THROWS [7,11,16,19,30,32,33,34,35,36,37]
```

and, for stage 0 (the one the owner played), per chunk:

```
chunk 0 $A844: 0 unported spawns
chunk 1 $A859: 0 unported spawns
chunk 2 $A87A: 5 unported; FIRST = trigger $20, cmd $03, type $07, entry 7 $B6E1
chunk 3 $A8A3: 3 unported; first = trigger $00, cmd $04, type $13, entry 19 $B747
chunk 4 $A8C6: 6 unported; first = trigger $50, cmd $09, type $13, entry 19 $B747
chunk 5/6/7 $A8ED: 4 unported each; first = trigger $00, cmd $04, entry 19
```

**That is the answer to "super unfinished as soon as you get a bit further along
in stage one."** Chunks 0 and 1 - the first two 512-pixel chunks - contain zero
unported spawns, which is exactly why the opening plays. Chunk 2 is selected
when `$61 = $3F AND $0E` = 4, and its first record fires at
`($61 << 8) + trigger*2 = $0400 + $40 = $0440` with cmd `$03` → type `$07` →
**`$B6E1`, unported**. Stage 0 needs entries 7, 15, 16 and 19 ported, and the
two hatches (15, 16) then spawn types `$09` and `$0C`, whose handlers (entries 9
and 12) are ALSO unported: **six distinct routines before stage 1 runs to the
boss.** The `$AE1C` table has said so since day one.

That is the answer to "super unfinished as soon as you get a bit further along
in stage one": **stage 1's chunk 2 (scroll `$0400`+) is the first place the
wave data reaches four unported handlers in a row, and the two hatches then
spawn types `$09` and `$0C`, whose handlers (entries 9 and 12) are ALSO
unported.** Six distinct unported routines are required before stage 1's third
screen-chunk runs to completion.

---

## 4. EVERY TABLE THE HANDLERS INDEX, AND WHETHER THE PORT EXPORTS IT

`handlerflow.py` records every `LDA/LDX/LDY/CMP/ADC/SBC abs,X|abs,Y` with a
base in PRG, per handler. The port's exported blocks are in
`games/gradius/assets/enemies/tables.json` (9 blocks).

| table | size | read by | exported? |
|---|---|---|---|
| `$A592` formation geometry | **21** x2 | `$A3E8`/`$A405`/`$A40C` | yes (inside `spawnData`) |
| `$A5BC` spawn pattern | **22** x3 | `$A42F` | yes |
| `$A602` table B | 24 x4 | `$A397` | yes |
| `$A662` table A | **121** x3 | `$A397` | yes |
| `$A7D0`/chunk tables/wave lists | 7 + 51 + 39 lists | `$A2D5` | yes |
| `$ADC1` anim groups | **9** x4 (0..8) | `$AE09` | yes |
| `$AE71` explosion ptrs + 6 scripts | 12 + 28 | `$AEA8` | yes |
| `$AF0A` blink metasprites | 6 | `$AF21` | **NO** |
| `$B01D` rank speed | 9 | `$B008` | **NO** |
| `$B086`/`$B08C`/`$B092` turret | 3 x 6 | `$B06D`/`$B078`/`$B07D` | yes |
| `$B200` arc turns | 5 | `$B1C5` | yes |
| `$B33B` flip frames | 8 | `$B334` | **NO** |
| `$B3C2` spin frames | 9 | `$B392` | **NO** |
| `$B42F` phase | 5 | `$B415` | **NO** |
| `$B45C` phase | 5 | `$B43C` | **NO** |
| `$B4E4`/`$B4EB` dwell by rank | 2 x 7 | `$B48F`/`$B4BE`/`$B4D6` | **NO** |
| `$B650` `$B628` animator records | 4 x 3 (Y=0,3,6,9) | `$B62E`/`$B639`/`$B644` | **NO** |
| `$B606`/`$B612` gate tiles | 12 + 12 | `$B5A9`/`$B5DC` | **NO** |
| `$B6D2`/`$B6D9`/`$B6DD` walker | 7 / 4 / 4 | `$B6A4`/`$B6C5`/`$B6CB` | **NO** |
| `$B787`/`$B78F`/`$B797`/`$B799`/`$B852` mid-boss | 8/8/2/8/8 | `$B7B5`..`$B839` | **NO** |
| `$B8E6`/`$B8E9`/`$B8EC` mid-boss muzzles | 3 x 3 | `$B8A9`-`$B8B4` | **NO** |
| `$B8EF` core damage frames | 7 | `$B936` | **NO** |
| `$B8F8`/`$B901`/`$B90A` core by rank | 3 x 9 | `$BA3E`..`$BA73` | **NO** |
| `$BAF7`/`$BAFB`/`$BAFF`/`$BB07` core spread | 4/4/8/8 | `$BABA`..`$BAEC` | **NO** |
| `$BB82` path script | **26** x2 + `$FF` | `$BB38`/`$BB49` | **NO** |
| `$BC32`/`$BC3B` bullet muzzle | 2 x 9 | `$BC93`/`$BC98` | yes |
| `$BC64`/`$BC66` bullet kind | 2 x 2 | `$BC7A`/`$BC80` | yes |
| `$BDD1` bullet anim | 4 (1..3 read) | `$BDED` | yes |
| `$BE6E` death sound | 34 | `$BE9D` | (in src/sound.js) |
| `$BFC5` multi-hit by rank | 9 | `$C09B` | (collision block) |
| `$BFCE`/`$BFD2`/`$BFD6`/`$BFDA`/`$BFDE` boxes | 5 x 4 | `$BFE2` sweep | (collision block) |
| `$C87B`/`$C893`/`$C936`/`$CA29` stage-2 obj | 24 / 4ptr / 7 / 4 | `$C906` body | **NO** |
| `$CA49`/`$CA50`/`$CA57` `$0600` obj | 3 x 7 | `$CA60`..`$CB03` | **NO** |
| `$C439` stage-end dispatch | **7** | `$C436 JSR $83E4` | **NO** |
| `$C447` nibble-stream ptrs | 4 | `$C44F` | **NO** |
| `$C4F4`/`$C4F6`/`$C4F7`/`$C4F8` | 2/…/… | `$C49D`-`$C4D4` | **NO** |
| `$C56D` stage-1 approach XY | 16 x2 | `$C556`/`$C55C` | **NO** |
| `$C601`-`$C60C` stage-3 approach | 2 + 4x3 | `$C5C4`-`$C5EE` | **NO** |
| `$C67A` stage-4 approach | 4 x2 | `$C664`/`$C66D` | **NO** |
| `$C684` `$3A` gate | 2 | `$C68C` | **NO** |
| `$C6CA`/`$C6CC`/`$C6CE` | 2 / 2 / 16 | `$C6B3`/`$C6B9`/`$C6A6` | **NO** |
| `$C750` | 2 | `$C73F` | **NO** |
| `$9A3D` boss scroll page | 7 | `$9986` | yes (`stage.bossPage`) |

The port's `romByteReader` throws with a block list when asked for an address
outside the exported ranges, so every one of the **NO** rows is a loud failure
at porting time, not a silent wrong value. That is the right shape. But it means
**28 more ROM ranges have to be added to `assets/enemies/tables.json` before the
throwing handlers can be written**, and that is a mechanical, enumerable job now
rather than a discovery.

> **DONE, WAVE 21 - every **NO** row above except `$CF2D`/`$CF2E` is now
> exported.** `assets/enemies/tables.json` went from 9 blocks / 2,073 bytes to
> **34 blocks / 3,060 bytes**; the 49 addresses this section lists collapse
> into **25 contiguous data runs**, each one pinned on the *instruction
> immediately after it* (`ENEMY_BLOCKS_W21` in `tools/export_assets.py`, and
> the anchor is checked at export time, not asserted in prose). Two of those
> anchors were WRONG when first written and the guard caught both: `$B61E` is
> `LDY #$00 / JSR $B628`, not `LDA #$00`, and `$C686` is `INC $68`, not
> `LDA $68`. See `21-impl-tables-and-metasprite.md`.
>
> The only bases any of the 42 handlers still index and no exporter ships are
> **`$CF2D`/`$CF2E`** - the ending chain's canned-packet pointers, reached only
> through entry 40 (`$BB0F` → `$CE94`) - excluded by `20-plan-completeness.md`
> §5 and named in `tools/tablecoverage.py`'s `KNOWN_GAPS` so they print on
> every run instead of being whitelisted silently.
>
> Two corrections this section's table needs, both measured on 2026-08-02 by
> `tools/tablecoverage.py`, which resolves `LDA <base>,Y … STA $012C,X` chains:
> * **`$B797` is a metasprite pair (`3F 40`), not a rank row.** `$B7B5 LDA
>   $B797,Y` stores into `$012C,X`, the anim field. Its "2" is right; its
>   place in the "mid-boss rank tables" list is misleading.
> * **`$CA29` is 8 rows × 4 columns (32 bytes), not 4.** `$CA29`/`$CA2A`/
>   `$CA2B`/`$CA2C` are four parallel columns and the run reaches exactly to
>   `$CA49`, where the three 7-rank rows begin. Exported as one 53-byte block.
> * **`$B6D9` is a METASPRITE table** (`1C 1C 1F 1F`): `$B6C5 LDA $B6D9,Y`
>   stores into `$012C,X`. Of entry 7/19's three tables, `$B6D2` is the rank
>   row (`-> $04EC,X`/`$040C,X`), `$B6D9` the metasprites and `$B6DD` the
>   `bulletMuzzle` index (`-> $0496,X`). W22 needs the distinction.
> * **`$B5A9` and `$B5DC` are the wrong way round in the table above.** The
>   ROM has `$B5A9 LDA $B612,X` (into `$06C2,Y`/`$06CA,Y`/`$06D2,Y`) and
>   `$B5DC LDA $B606,X` / `$B5E2 LDA $B607,X` (into `$06F1,Y`).
> * **`$B650`'s three loads are `CMP`/`CMP`/`ADC` and the middle one is +2:**
>   `$B62E CMP $B650,Y`, `$B639 CMP $B652,Y`, `$B644 ADC $B651,Y -> $012C,X`.
>   So each 3-byte record is `[frameCount, metaspriteBase, wrapLimit]`.

### The one that is NOT loud: metasprite `$A2`

```
id $A2  tblptr $8EE2 -> $95FB  count=18
```

`games/gradius/tools/export_metasprites.py:85` has
`if n == 0 or n > 16: continue`. That bound is invented - `$8AC6`'s loop has no
upper limit on the record count. Metasprite `$A2` is a real 18-record entry
whose data runs `$95FB..$9643`, ending exactly where `$A3`'s record begins at
`$9644`. It is dropped from `assets/metasprites.json` (161 records, `$A2`
missing), and `drawMetasprite` treats a missing record as
`if (!rec || rec.length === 0) return cursor` - i.e. **it silently draws
nothing**, which is the one failure mode this project has agreed not to have.

`$A2` is referenced by **explosion script 4** (`$AE8B`: `A2 6B 6A 69 68 6A 00`)
and **explosion script 5** (`$AE92`: `A0 68 A2 69 6A 6B 00`). Script 4 is set by
`$B988` (the boss core's death), script 5 by `$BB75` (`$BB0F`). Both handlers
are unported today, so this is not yet a live bug - it is a live bug the moment
entry 24 or entry 40 is ported. The other eight ids the `n > 16` guard drops
(`$A9 $AE $B9 $BA $C1 $CA $CB $F0`) point into sound/CHR data and are not
metasprites; the high table `$8E9E` holds only four real entries (`$A0-$A3`).

> **FIXED, WAVE 21, and the last sentence above is wrong.** The high table
> holds **36** real entries, ids `$80-$A3` - `$80-$9F` were always being
> exported. What is true is that **`$A3` is the last one**, and the ROM proves
> it: `$8EE0` (id `$A1`'s slot) contains **`$8EE6`**, the byte *after* `$A3`'s
> slot at `$8EE4`, because `$A1`'s own 9-byte record is stored there. Reading
> the would-be slots `$A4`-`$A8` as pointers gives `$0402 $01DB $0400 $01DD
> $0108`, which is `$A1`'s payload byte for byte. So the table is
> `$8E9E-$8EE5`, 36 entries, and the correct bound is an **id** bound, not a
> record-count bound.
>
> `export_metasprites.py` now stops at `$A3` and has no count limit at all.
> That keeps `$A2` (18 records) and drops **thirteen** junk ids, not eight:
> the `n > 16` guard also happily kept `$B8 $C9 $D4 $F2 $FB`, which are CHR
> and sound bytes with small counts. The export is **157** records, which
> settles the 162-vs-170 question in `20-plan-completeness.md` §1a: neither.
> 170 = every slot in `$00-$FF` with a non-zero count; 157 = every slot in
> `$00-$A3` with one (`$00`, `$31`, `$37`, `$3B`, `$3C`, `$3D`, `$3E` point at
> the shared null record `$8D9D` and draw nothing, which is `$8AC8 BEQ $8B02`).
>
> **And script 4 OVERLAPS script 2.** Script 2 is at `$AE8C` and script 4 at
> `$AE8B`: script 4 *is* `$A2` prepended to script 2, sharing its terminator at
> `$AE91`. That is why `$A2` was invisible - one byte in front of a script that
> already worked.

---

## 5. What I RULED OUT

* **`$BB9B` is not a table.** `prgmap.txt` lists it as a 14-word pointer-table
  candidate. It is the tail of `$BB82`'s path script; the script's `$FF`
  terminator is at `$BBB6`, 26 records in, and the "pointers" are
  `[dX, packed]` pairs with negative dX. Ruled out by reading `$BB33-$BB63`.
* **Entry 18 does not fall into entry 5.** `$B0AB BCS` + `$B0AD BCC` is an
  unconditional pair. My own tool reported the fall-through; the listing
  refutes it.
* **Entry 25 does not fall into entry 24.** `$B913` is `RTS`.
* **`$83E4` cannot overrun the 42-entry table with any type this ROM
  produces.** Largest `(type AND $7F)` over every producer in §3 is `$29` = 41.
* **`$A5BC` index cannot overrun.** Max `$67` in table B is `$15` = 21, and the
  table has 22 entries. **`$A592` index cannot overrun**: max `$66` is `$14` =
  20, 21 entries.
* **`$ADC1` index cannot overrun.** Every status written anywhere in the ROM is
  0..8 or has bit 7 set (`$80 $81 $82 $83 $90`), and bit-7 statuses skip the
  animator at `$ADE8 BMI`. `8*4+3 = 35` is the last byte of the 36-byte table.
* **`$BE6E` index cannot overrun**: guarded by `$BE99 CPX #$22`, and the two
  types above `$21` (`$27`, `$28`, `$29`) fall on the silent side.
* **`$B650` has no fifth record.** Its callers pass Y = 0, 3, 6 and 9 only
  (`$B61E`, `$B4FD`, `$B480`, `$B559`); `$B65C` is the start of the
  player-X-docking routine, not a Y=12 record.

## 6. What I could NOT do

* **Nothing here was run on the cartridge.** This is an inventory, not a
  verdict. Every behavioural sentence about an unported handler is
  READ-FROM-ROM, and several are inference from a listing (which sprite a
  handler "is" in the game's own terms, in particular, is a guess I have
  deliberately avoided naming).
* I did not decode the `$0600` page's own update loop (`$BF4C` reads it) or the
  `$C77C`/`$CB4E`/`$CE94` continuations that three throwing handlers tail into.
* I did not enumerate the stage-2 `$C87B` streams' semantics, only their extent.
* `$04CC+j` remains unidentified in general, though `$B311`/`$B3CB` use it as a
  countdown and `$B914` as a phase counter.
