# RECON 1/5 - Enemies: spawn tables, formations, per-type movement and death
status: DONE (with named gaps - see "What I could not do")
wave: 0   role: recon   started: 2026-07-31

## The task, as I understood it

Map the enemy system of `Gradius (USA).nes` from the two entry points earlier
work located - `$A2C0` (spawn engine, called from `$9A64`) and `$ADAB` (enemy
update, called from `$9A6D`). Answer: spawn tables and wave format; slot
allocation and **what happens when it fails**; per-type dispatch; movement;
hit/death and what it spawns; the `$0100+i` / `$0300`-page arrays; and the
32-slot ownership map.

Reader role. No edits under `games/*/src/`. No commits. Two new files written,
both tools: `games/gradius/tools/oracle/enemyprobe.lua` and `.py`.

## What I did

1. Read `docs/worklog/README.md`, `NOTES-rom.md`, `NOTES-player.md`,
   `tools/oracle/README.md`, `PROBE.md`, `objloop.lua`.
2. Disassembled `$A2C0-$A5FD` (spawn engine), `$ADAB-$AF00` (update loop +
   generic handlers), `$B0AF-$B260` (the type-5 handler and the shared
   movement/despawn helpers), `$BE93-$C0C0` (death + collision), `$C2FF`,
   `$BC64-$BCB0` with `games/gradius/tools/dis6502.py`.
3. Wrote `enemyprobe.lua/.py` and ran it on the cartridge at 900, 1400 and 3000
   game frames, with pokes for the two behaviours that do not occur naturally in
   stage 1's opening (allocation failure, squadron completion).

Command shape used throughout:

```
python games/gradius/tools/oracle/enemyprobe.py --frames N --script "..." \
       [--poke "ADDR=VAL@FROM-TO,..."] [--timeline] [--slots F:N --dumpslots]
```

---

## What I MEASURED

### 0. The 32-slot map (measured + closed by ROM)

| slots | owner | evidence |
|---|---|---|
| 0 | player | `NOTES-player.md` |
| 1-2 | Options | `NOTES-player.md` |
| 3-5 | shot A (player + 2 Options) | `$0123,X`, X=0..2 |
| 6-8 | shot B | `$0126,X` |
| 9-11 | missiles | `$0129,X` |
| **12-21** | **enemies (10)** | `$A527`: `LDA $A8 / ADC #$0C / TAX` then 21 `STA $0xxx,X`; `$ADB3: LDX #$09` |
| **22-31** | **enemy bullets (10)** | `$C327`: `LDA #$0A / ADC $A8 / TAX / JSR $AEF8` - the *same* free routine, index +10, so `$0316+j == $030C+(j+10)` |

Measured over a 3000-frame run: the only slots that ever held a non-zero
`$0300+i` were **13-21** (and slot 0 is the player, whose `$0300` stays 0).
Slots 22-31 stayed empty - stage 1's opening has no shooting enemies. So the
22-31 claim is **read-from-ROM, not measured**; see open questions.

```
firstNonZeroType = 13:1149 14:1024 15:960 16:957 17:506 18:411 19:400 20:389 21:378
slotAnim.00 = 1=2632 2=56 3=64 45=10 46=10 47=10 48=20     <- player tilt + player explosion
slotAnim.03 = 6=1009    slotAnim.06 = 6=1005               <- the two player shots
```

### 1. Where the spawn tables live, and what a wave is

Chain, all four levels confirmed against the running cartridge:

```
$A7D0[stage]            7 entries ($A7DE $A7EE $A7FE $A80C $A81A $A828 $A836)
   -> chunk table       8 pointers for stages 0-1, 7 for 2-6
      indexed by $61 = $3F AND $0E      ($3F = scroll high byte)
   -> wave list         2-byte records, $FF terminator
```

`$19` is the stage index (`$A2D1: LDA $19 / ASL / TAY / LDA $A7D0,Y`). Stage 0's
chunk table is `$A7DE` = `$A844 $A859 $A87A $A8A3 $A8C6 $A8ED $A8ED $A8ED`.

**A wave record is 2 bytes: `[trigger, cmd]`.** It fires when the 16-bit scroll
position `$3F:$3E` reaches `($61 << 8) + trigger*2` (`$A30C-$A328`). `$6A:$6B`
is the cursor and is advanced by 2 (`$A34F: LDA #$02 / LDX #$6A / JSR $8402`).

Measured, from the ROM bytes at `$A844` on the left and the emulator on the right:

| ROM record | predicted trigger | measured fire frame / `$3F:$3E` / cursor after |
|---|---|---|
| `10 80` | `$0020` | 378, `$0020`, `$A846` |
| `30 81` | `$0060` | 506, `$0060`, `$A848` |
| `50 80` | `$00A0` | 634, `$00A0`, `$A84A` |
| `70 81` | `$00E0` | 762, `$00E0`, `$A84C` |
| `90 80` | `$0120` | 890, `$0120`, `$A84E` |
| `A0 82` | `$0140` | 954, `$0140`, `$A850` |
| `B0 82` | `$0160` | 1018, `$0160`, `$A852` |
| `C0 82` | `$0180` | 1082, `$0180`, `$A854` |
| `D0 82` | `$01A0` | 1146, `$01A0`, `$A856` |
| `E0 80` | `$01C0` | 1210, `$01C0`, `$A858` |
| `FF` | terminator | - |
| chunk 1 `$A859` `00 81` | `$0200` | 1339, `$0200`, `$A85B` |

Ten for ten, plus the chunk switch. The `$61 = $3F AND $0E` model (512-pixel
chunks) is measured, not assumed.

`$60` is the engine's own state: 0 = do nothing (RTS), 1 = load the chunk table
(then `INC $60`), 2 = run. Measured `$60` = 1 at frame 309, 2 at 310, and
`$6A:$6B` = `$A844` from frame 310.

### 2. cmd decoding, and a fall-through that decides everything

```
$A346  cmd = record[1]
$A34D  CMP #$F0 / BCS $A37A     cmd >= $F0 -> 5-byte INLINE record ($A466)
$A356  BMI $A36D                cmd >= $80 -> table B
       ... table A path ...
```

* `cmd < $80` - table A at `[$A5FE]` = **`$A662`**, offset `3*cmd`, **4 bytes
  read** (stride 3, records overlap by one byte) → single-enemy spawn `$A3B1`.
* `cmd $80-$EF` - table B at `[$A600]` = **`$A602`**, offset `(4*cmd) AND $FF`
  (so `cmd AND $3F` selects one of 64; only 24 records exist, `$A602-$A661`, i.e.
  cmds `$80-$97`) → formation spawn `$A3E4`.
* `cmd >= $F0` - 5 bytes copied inline from the wave stream to `$63-$67`,
  `$6A += 5`, `$64 -= $70`, then `$A466`.

**The trap.** `$A36B: BMI $A3B1` and `$A378: BMI $A3E4` look like tests of the
descriptor's first byte. They are not. The loader `$A397` ends with
`DEY / BPL $A3A8`; the final `DEY` leaves `Y = $FF`, so **N is always set on
return and both BMIs are always taken.** Stage-1 descriptors have `$64 = $01`
and `$64 = $00` - bit 7 *clear* - and the branches were still taken. Measured:

```
total.tabB = 11   total.formSetup = 11   total.raw5 = 0
```

`$A37A` is unreachable from those two sites; the only way in is `cmd >= $F0`.
A port that "correctly" tests bit 7 of the descriptor byte will diverge on the
very first wave of stage 1.

### 3. The descriptor tables

**Table B (formation), 4 bytes, `$A602 + 4*(cmd AND $3F)`** - measured live at
`$A3E4` with the emulator reading `$64-$67`:

| cmd | bytes | `$64` status | `$65` type | `$66` formation | `$67` pattern |
|---|---|---|---|---|---|
| `$80` | `01 05 00 00` | 1 | `$05` | 0 | 0 |
| `$81` | `01 05 01 00` | 1 | `$05` | 1 | 0 |
| `$82` | `00 08 02 04` | 0 | `$08` | 2 | 4 |

`$66` indexes a 2-byte table at **`$A592`**: `(b0 AND $0F)` = member count,
`(b0 AND $F0)` = spawn X, `b1` = first member's Y.
`$A592` = `F4 2A | F4 A0 | F3 08 | F2 08 | F2 28 | F4 AA | F4 08 | F4 30 | F4 80 |
F5 2A | F5 A0 | F3 08 | B5 08 | F3 20 | F3 10 | F3 30 | F4 A0 | F4 2A | F4 A0 |
F4 2A | B3 2C`
(**21 entries**, indices `$00-$14`).

> **CORRECTED, wave 21.** This list said 20 entries and was missing index
> **19** (`F4 2A`); `B3 2C` is index **20**, not 19. The count is forced by the
> ROM's own two base addresses: `$A3E8 LDA $A592,X` and `$A42F LDA $A5BC,Y`,
> and `($A5BC - $A592) / 2 = 21`. Index 20 is reached by cmd `$93`.
> `20-recon-enemy-census.md` §3 spotted the off-by-one but described it as
> "off by one from index 17 on"; re-measured on 2026-08-02, indices 17 and 18
> agree with this list and only 19 was wrong. Pinned by
> `games/gradius/tests/tables.test.js`.

`$67` indexes a **3-byte** table at **`$A5BC`**: `[delay, dY, styleByte]`.
Entry 0 = `0A 00 C8` - measured: `$6C` reloads to **10** and the four members of
the `cmd $80` squadron appeared on frames 378, 389, 400, 411 (11 frames apart,
i.e. delay+1). `$6E` accumulates `dY` so members are stacked vertically.

`styleByte` goes through `$A579`: `$040C+i = $04EC+i = b AND $FE`,
`$03AC+i = b AND $01`, and if odd `$018C+i = 3`. **`$03AC` odd = "this one
carries a power-up".**

**Table A (single), 4 bytes at `$A662 + 3*cmd`** - `$A662` = `B2 80 12 A6 …`.
`$A3B1` path: type = `$64 - $A0` (spawn X = **`$F0`**, from the right) or, if
that is `>= $30`, `$64 - $D0` (spawn X = **`$10`**, from the left); `$66` → Y;
`$65` → `$A579`. It writes **no** `$0100+i`, so a single-spawn enemy has
status 0 and `$ADE5`'s auto-animation is skipped.
**Never executed in any run I made** (`total.allocP_try = 0` at 3000 frames) -
stage 1's first two chunks are all `cmd >= $80`.

### 4. Allocation, and what happens when it FAILS

There are **four** free-slot searches. All scan `$030C,X` (type byte, 0 = free)
and all start at `X = $09`, i.e. **the highest enemy slot (21) is filled first**.
Measured `allocSlotHist` over 3000 frames:
`Q1=3 Q2=3 Q3=9 Q4=10 Q5=14 Q6=17 Q7=13 Q8=17 Q9=16` - and
`firstNonZeroType` shows slot 21 first (frame 378), then 20, 19, 18, …

They are **not identical**:

| site | loop | reaches index 0? |
|---|---|---|
| `$A3B1` (single) | `DEX / BPL` | yes |
| `$A415` (formation member) | `DEX / BPL` | yes |
| `$A46F` (`$19 == 2` special) | `DEX / BPL` | yes |
| **`$A4A6`** (the `$0600` special) | **`DEX / BNE`** | **no - slot 12 is never tested** |

`$A4A6`'s `BNE` exits with `X = 0` unexamined, so that spawner can only ever use
slots 13-21. Never executed here (`allocS_try = 0`); recorded because it is a
difference a port will silently normalise away.

**Failure is gameplay.** Forced by poking all ten `$030C-$0315` non-zero over
frames 370-420:

```
ev  378 FORMATION cmd=$80 rec=$01$05$00$00 scroll=$0020 ptr=$A846
ev  378 ALLOCFAIL allocQ_fail  $69=3 $6C=0
ev  379 ALLOCFAIL allocQ_fail  $69=2 $6C=0
ev  380 ALLOCFAIL allocQ_fail  $69=1 $6C=0
ev  381 ALLOCFAIL allocQ_fail  $69=0 $6C=0
total.allocQ_fail = 12   total.allocQ_ok = 0   total.slotClear = 0
```

So on failure:
* the member is **dropped silently** - no retry, no queue;
* `$69` (members remaining) **is still decremented**;
* `$6C` (inter-spawn delay) is **not** reloaded - it is loaded at `$A42F`, i.e.
  *after* a successful allocation - so it stays 0 and `$A32F: JMP $A411` fires
  again **on the very next frame**;
* net effect: **a 4-member squadron that cannot allocate burns its whole count in
  4 consecutive frames and spawns nothing**, instead of over 44 frames.
* the wave cursor `$6A` was already advanced and `$5D` already incremented, so
  the wave record is consumed either way.

For the single-spawn allocator the same holds minus the count: record consumed,
nothing spawned.

### 5. The update loop and the per-type dispatch

```
$ADAB  LDA #$80 / STA $AF / LDA #$00 / STA $AE
$ADB3  LDX #$09 / STX $A8
$ADB7  LDX $A8 / JSR $ADE5 / DEC $A8 / BPL $ADB7 / RTS      <- 10 slots, 9 down to 0
```

Measured: `total.enemyUpdate = 2663`, `total.perSlot = 26630` over 2663 game
frames - exactly 10 per frame, unconditionally, occupied or not.

`$ADE5` per slot (X = 0..9, actor slot = X+12):

1. `LDA $010C,X` - if bit 7 set **or** zero, skip the animator.
2. otherwise, every `$014C,X` frames (reload **6**), advance `$016C,X` and set
   `$012C,X` (metasprite) from **`$ADC1 + status*4 + ($016C AND 3)`**. A `0`
   byte in the group means "wrap and re-read", so short groups work.
3. `LDA $030C,X` - 0 → RTS. else `JSR $83E4` with the inline table at `$AE1C`.

The animation table `$ADC1`, per status:

| status | bytes | metasprites |
|---|---|---|
| 1 | `0C 0D 0E 0F` | 12,13,14,15 |
| 2 | `16 17 18 19` | 22-25 |
| 3 | `1A 1B 1A 1B` | 26,27 |
| 4 | `1D 1E 1D 1E` | 29,30 |
| 5 | `20 21 22 23` | 32-35 |
| 6 | `10 11 12 00` | 16,17,18 (**power-up capsule**) |
| 7 | `13 14 15 00` | 19,20,21 (capsule, every 16th) |
| 8 | `7D 7E 7F 80` | 125-128 |

Measured: `statusHist = 0=23039 1=6184 5=460 6=317`, and
`slotAnim.17 = 12=220 13=250 14=242 15=234 … 32=6 33=12 34=12 35=12 …` - status
1 and status 5 produce exactly the table's metasprite sets.

**The handler index is `type AND $7F`.** `$83E4` does `ASL A` (which wraps at
256) then reads `table_base + 2*index`. So `$05` and `$85` run the *same*
handler. Proved by counting entries rather than by reading the listing:

```
typeHist            = 2=535 5=28 8=12 133=3088 136=1075
total.hdlr05_B0AF   = 3116      (= 28 + 3088, exact)
total.hdlr08_B26C   = 1087      (= 12 + 1075, exact)
total.hdlr04_B205   = 0         (type $04/$84 absent from this run - no false hits)
```

**Bit 7 of `$030C+i` is an "initialised" flag, and it is also the collision
gate.** `$B0AF: LDA $030C,X / BMI (run) ; else LDA #$80 / ADC $030C,X / STA` -
the first update after a spawn only sets bit 7 and returns. `$C011: LDA $030C,Y
/ BPL $C030` skips the shot sweep for any enemy without bit 7. So **an enemy is
untouchable and motionless for exactly its spawn frame.** The measured 5→133 /
8→136 pairing (28 and 12 dispatches with bit 7 clear vs 102 allocations) is the
same fact seen from the counter side.

The dispatch table, `$AE1C`, **42 entries** (`$AE70` is the `RTS` that entries 0
and 31 point at, and it is also the byte immediately after the table):

```
 0 $AE70(RTS)  1 $AEDD  2 $AE99  3 $AEE1  4 $B205  5 $B0AF  6 $B198  7 $B6E1
 8 $B26C       9 $B311 10 $B36F 11 $B37F 12 $B3CB 13 $B402 14 $B434 15 $AF2E
16 $AF88      17 $B026 18 $B098 19 $B747 20 $CA5E 21 $B377 22 $C906 23 $B7A1
24 $B914      25 $B913 26 $B480 27 $B4F2 28 $B4FD 29 $B559 30 $B569 31 $AE70
32-37 $AF10 (all six)  38 $B61E  39 $AEDD  40 $BB0F  41 $AEDD
```

Exercised in my runs: **1, 2, 4, 5, 8** only.

Two of the generic handlers **fall through into each other** - trap #9 territory:

```
$AE99 (type 2, explosion) ... $AEDA DEC $014C,X
$AEDD (type 1, capsule)   LDA $5B / BNE $AF09
$AEE1 (type 3, generic left-drift)  LDX $A8 ...
```

so type 2 ends by running type 1's freeze check and type 3's mover.
`$AF2B: JMP $AEDD` (from the type-32..37 handler) does the same on purpose.

### 6. Movement

The generic mover, `$AEE1`, is 8 instructions and is the drift every unhandled
object gets:

```
$038C,X -= $80        (X sub-pixel; 0.5 px/frame LEFT)
on borrow: DEC $036C,X
if $036C,X < $08 -> $AEF8 (free the slot)
```

The shared 16-bit helpers (X = enemy index 0..9, all `+$0C`-based):

| routine | effect |
|---|---|
| `$B154` | X += (`$042C`:`$044C`) |
| `$B184` | X -= (`$042C`:`$044C`) |
| `$B164`/`$B165` | X += A (integer only) |
| `$B16C` | Y += (`$03BC`:`$03EC`) |
| `$B140` | Y -= (`$03BC`:`$03EC`) |
| `$B17C`/`$B17D` | Y += A |
| `$B130`/`$B120` | Y-velocity ± `$048C` (acceleration) |

The shared off-screen check, `$B251`, tail-called by several handlers:
**free the slot unless `X ∈ [$04,$F3]` and `Y ∈ [$08,$C3]`** (`$B250` is `RTS`).

Worked example, the type `$05`/`$85` fan (`$B0AF`), which is what stage 1 opens
with. `$048C+i` is its sub-state:

* state 0 - `X += $FE` (2 px/frame left) until `X < $60`; then `$046C+i = $40`
  and `$048C += 1`, or `+= 2` if `Y >= $80`.
* state 1 - home toward the player's Y (`$B109` compares `$032C,X` to `$0320`),
  `Y += 2`, `X += 1`; after 64 frames (`$046C` counts down) → state 3.
* state 2 - same but reversed sign.
* state 3 - `X += 3` then `$B251`.

Measured at frame 500-502 (4-member squadron, spawned 378/389/400/411):
slot 21 (oldest) X = 185→188→191, slot 18 (newest) X = 110→111→112 - right-moving
phase, older members further right, consistent with fly-left-then-curve-back.

### 7. The hit path and the death path

**`$BFE2`** - shots vs enemies. Outer loop `$A8 = 8..0` over `$0123,X`
(slots 3-11: shot A, shot B, missiles); inner loop `$A9 = 9..0` over enemies.

Box: `A0 = shotX + $BFCE[t]`, `A3 = $BFD2[t]` (width), `A1 = shotY + $BFD6[t]`,
where `t = $0163,X` is the shot subtype;
`$BFCE = 08 10 08 08`, `$BFD2 = 10 30 10 10` (the laser is `$30` wide),
`$BFD6 = 08 08 08 00`. Enemy box height is `$BFDE[$0460+j]` =
`10 20 30 02`. Overlap → `JSR $C055`.

`$C055`:
* `$030C,Y` bit 7 clear → nothing (the spawn-frame invulnerability).
* `$010C,Y` **bit 7 set** → armoured: play sound `$05` unless type = `$94`, and
  `$046C+j += 1` (or `+2` for missiles, `$A8 >= 6`) if `$048C+j != 0`. **Never
  taken in any of my runs** (`total.armourHit = 0`); stage 1's opening enemies
  all die in one hit (`shotHitEnemy = killPath = deathRoutine = 50`).
* otherwise → `$C090` kill. Type `$9A` is special-cased: `$04AC+j` counts hits
  and must reach `$BFC5[$17]` = `05 05 05 05 06 07 08 09 0A`.
* after the kill, `$0163,X == 1` (laser) makes the shot **survive**; anything
  else is consumed (`$0123,X = 0`).

**`$BE93` - the death routine.** Measured 50 times.

```
sound   = $BE6E[type AND $7F]  (only for type AND $7F < $22)
$03AC+j: 0        -> nothing
         1        -> stays 1: this one drops a capsule
         2 or 3   -> DEC $48+that ; result 0 -> $03AC = 1 (capsule), else $03AC = 0
$016C+j = 1, or 0 if (type AND $1F) == $05, or 3 if (type AND $1F) == $1A
$030C+j = 2      <- becomes the explosion object
$014C+j = 3, $018C+j = 0, $010C+j = 0, $012C+j = 0, $042C+j = 0
```

`$0048+g` (g = 2 or 3) is the **squadron kill counter**, seeded at `$A400` with
the member count for any formation of **>= 4 members** whose type isn't `$0B`
(`$A3F1`, `$A450`). `$49` alternates the group id 2/3 per squadron
(`INC $49 / AND #$01 / ORA #$02`).

Measured, natural play - every kill denied:

```
ev  487 DEATH slot=20 type=$85 carrier=$03 …   ev 487 capsuleDeny $4B=1(pre-DEC)
total.capsuleDrop = 0   total.capsuleDeny = 13
```

Measured, with `$004B` poked to 1 over frames 470-486 so the next kill completes
the squadron:

```
ev  487 DEATH slot=20 type=$85 carrier=$03 …
ev  487 capsuleDeny  $4A=0 $4B=1
ev  487 capsuleDrop  $4A=0 $4B=0
total.capsuleDrop = 1   total.becameExpl = 1
statusHist = 0=5774 1=1175 6=51
slotTypes.20 = 1=51 2=19 133=164
slotAnim.20 = … 16=12 17=18 18=15 38=5 39=5 40=11
```

That is the whole chain, end to end and observed:
enemy (type `$85`) → **type 2, status 0** explosion for 19 frames, metasprites
38,39,40 (`$AE7D` script `26 27 28 00`) → `$AEC1` because `$03AC != 0` →
**type 1, status 6**, metasprites 16,17,18 (`$ADC1` status-6 group `10 11 12 00`)
→ drifts left at 0.5 px/frame under `$AEE1` for 51 frames.

**Explosion scripts.** `$AE99` plays a byte list, one byte per ~6 frames, into
`$012C,X`; pointer table at **`$AE71`**, index `$016C+j`:

```
0 $AE7D  26 27 28 00
1 $AE81  29 2A 2B 2C 00
2 $AE8C  6B 6A 69 68 6A 00
3 $AE86  33 34 35 36 00
4 $AE8B  A2 6B 6A 69 68 6A 00
5 $AE92  A0 68 A2 69 6A 6B 00
```

Measured: type `$85` (`AND $1F` = 5 → script 0) produced metasprites 38,39,40;
type `$88` (script 1) produced 41,42,43,44. Both exact.

On the terminating `0`: `$03AC+j == 0` → `$AEF8` frees the slot
(`$030C, $010C, $012C, $014C, $016C` all 0). Otherwise it becomes the capsule,
with status **7** every 16th time (`INC $47 / AND #$0F / BEQ`) and **6**
otherwise.

**The squadron counter underflows.** Measured: after `$4B` hit 0 at frame 487, a
later kill of the same group id printed `capsuleDeny $4B=255` - `DEC $48,X` on 0
wraps and the group can never award another capsule until it is re-seeded.

### 8. The parallel arrays - the complete list

`$A527` is the authority: it clears **21** arrays at `X = $A8 + $0C`, plus two at
`Y = $A8`. Enemy slots use base `+$0C`, enemy bullets base `+$16`.

| array | at enemy slot | meaning (where established) |
|---|---|---|
| `$0100+i` | `$010C+j` | **status**; 0 = no auto-anim, 1..8 = `$ADC1` group, bit 7 = armoured (`$C05D`) |
| `$0120+i` | `$012C+j` | metasprite id (drawn by `$8B4D`'s 32-slot loop) |
| `$0140+i` | `$014C+j` | animation timer |
| `$0160+i` | `$016C+j` | anim frame / explosion-script selector |
| `$0180+i` | `$018C+j` | palette-ish, set to 3 by `$A579`/`$AF5E` |
| `$0300+i` | `$030C+j` | **type**; 0 = free; bit 7 = initialised & collidable |
| `$0320+i` | `$032C+j` | Y integer |
| `$0340+i` | `$034C+j` | Y sub-pixel |
| `$0360+i` | `$036C+j` | X integer |
| `$0380+i` | `$038C+j` | X sub-pixel |
| `$03A0+i` | `$03AC+j` | power-up carrier: 0 none, 1 drop, 2/3 squadron group id |
| `$03B0+i` | `$03BC+j` | Y velocity, integer |
| `$03E0+i` | `$03EC+j` | Y velocity, fraction |
| `$0400+i` | `$040C+j` | from `$A579` (`style AND $FE`) |
| `$0420+i` | `$042C+j` | X velocity integer **or** explosion-script cursor |
| `$0440+i` | `$044C+j` | X velocity fraction |
| `$0460+i` | `$046C+j` | per-handler state / damage counter |
| `$0480+i` | `$048C+j` | sub-state / acceleration / "armour present" |
| `$04A0+i` | `$04AC+j` | script index / hit counter (type `$9A`) |
| `$04C0+i` | `$04CC+j` | (unresolved) |
| `$04E0+i` | `$04EC+j` | from `$A579` |

Two arrays are indexed by the **enemy index j (0..9), not the slot**:
`$0460+j` (hit-box height class → `$BFDE`) and `$0496+j` (bullet-pattern index,
`$BC90`). `$A527` clears both, `STA $0460,Y` / `STA $0496,Y` with `Y = $A8`.
Note `$0460,Y` (j) and `$0460,X` (j+12) are *different bytes* and both are
cleared in the same routine - this is not a typo in the ROM and a port that
merges them will be wrong.

### 9. Two spawners I could not exercise

`$A466` (only for `cmd >= $F0`) splits on `$19`:
* `$19 == 2` → `$A46F`: allocates, sets `$010C = $64`, `$032C = $65`,
  `$03BC = $66`, `$03EC = $67`, **`$030C = $96`**, `$036C = $F0`, `$5D = 1`.
  (`$96 AND $7F` = 22 → handler `$C906`.)
* otherwise → `$A4A6`: the `$0600`-page allocator (the `DEX / BNE` one), which
  walks `$0600 + $90, +$60, +$30, +$00` looking for a free entry, shifts `$65`
  right 4 bits at a time, and on success sets `$030C = $66`, `$010C = $80`,
  `$012C = $89`, `$036C = $F0`, `$0460+j = 1`. The `$0600` page is a second
  object table (`$0600/$0601/$0602/$0610/$0618/$061A/$0622` are all touched)
  that `$BF4C` also reads - almost certainly the Moai / multi-part bosses.

Both are `total.allocR_try = total.allocS_try = 0` in every run I made.

---

## What I could not do, and why

* **Slots 22-31 were never populated.** The identity `$0316+j == $030C+(j+10)`
  is proved by `$C321-$C327` (`LDA #$0A / ADC $A8 / TAX / JSR $AEF8`) and by
  `$BCB1-$BCB7`, but no enemy in the first 3000 frames of stage 1 fires. The
  claim is read-from-ROM.
* **The single-enemy path `$A3B1` never ran.** Stage 1 chunks 0 and 1 are all
  `cmd >= $80`. Its table (`$A662`, stride 3) is decoded from the listing only.
* **`total.armourHit = 0`** - the `$0100+i` bit-7 armoured branch, the type-`$9A`
  multi-hit counter and `$BFC5[$17]` are unexercised.
* **37 of the 42 handlers are unexercised.** I have their entry addresses and
  nothing else. `$B205`, `$B26C`, `$B198`, `$AF2E`, `$AF88` are the next ones a
  stage-1 port needs.
* **`$AE`/`$AF` are set to `$0080` at `$ADAB` and I never found the reader.**
* **`$04CC+j` is unidentified.**
* **`$5D`** is incremented at `$A335` (wave fired) and `$BF9F` (enemy bullet
  destroyed) and set to 1 at `$A47C`; I did not find its consumer.
* I did not run the gate (`node --test games/gradius/tests/`,
  `node games/gradius/tools/test-all.mjs`) - I wrote no source and no test; the
  two files I added are probes, not checks. **Nothing here has been guarded by a
  check that was seen to fail**, which is the honest status of a recon.

## If someone picks this up cold

* `python games/gradius/tools/oracle/enemyprobe.py --frames 1400 --script
  "200:,10:S,120:,1070:A" --timeline` reproduces almost everything above.
* The two intervention runs are:
  `--poke "030C=1@370-420,…,0315=1@370-420"` (allocation failure) and
  `--poke "004B=1@470-486"` with `--script "200:,10:S,120:,370:A"` (capsule).
* **The single most dangerous thing to get wrong** is `$A36B`/`$A378`: the BMI is
  a consequence of `DEY`, not of the descriptor byte. Write that as an
  unconditional jump in the port and add a comment, or you will "fix" it later.
* The second is allocation failure: it drops a member *and* collapses the
  squadron's spacing to one frame per member. It is visible on screen.
* The third is that the allocator fills **downward from slot 21**, which fixes
  the OAM draw order (`$8B47` walks slots 0→31), i.e. it fixes sprite priority
  and flicker. Getting the direction wrong changes the picture.
