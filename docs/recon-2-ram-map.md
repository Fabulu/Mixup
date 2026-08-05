# RECON-2 - RAM MAP & GAME STATE

ROM: `Batman - Return of the Joker (USA, Europe).gb` (128 KB, MBC1, no cart RAM).
Static analysis only - no emulator. Confidence is stated per claim; anything not
marked is **CONFIRMED** by at least two independent code sites.

Tooling added by this pass:

| script | purpose |
|---|---|
| `tools/ramscan.py` | runs `banktrace` then classifies every WRAM/HRAM/OAM/IO access as `direct` (`LDH`/`LD [a16]`), `ptr` (constant-folded `LD rr,nnnn` + dereference), or `immediate` (RAM-looking constant never dereferenced → false positive). `--range`, `--addr`, `--region`, `--csv`, `--immediates`. |
| `tools/show.py` | `python tools/show.py BANK LO HI` - print an address window of `disasm/bank_XX.asm`. |

```
python tools/ramscan.py "Batman - Return of the Joker (USA, Europe).gb" --region HRAM
python tools/ramscan.py "Batman - Return of the Joker (USA, Europe).gb" --immediates
python tools/ramscan.py "Batman - Return of the Joker (USA, Europe).gb" --csv ram.csv
```

Totals: **216 distinct WRAM addresses**, **93 distinct HRAM addresses**, **22 IO
registers**, **0 direct OAM ($FE00-$FE9F) accesses** (OAM is only ever written by
the DMA stub from shadow OAM `$C000`).

---

## 0. Executive summary of the four things that matter

* **The player is not in an actor slot.** Batman's entire state lives in **HRAM
  `$FF80-$FF98` + `$FF93/$FF94` + `$FFB2/$FFC2/$FFC3-$FFC5`**. Recon-1's guess
  that `1:$4E0C` is "the player state machine" is **wrong** - `1:$4E0C` is a loop
  over the 8-slot, 32-byte actor array at `$C268`.
* Two actor arrays exist, both **8 slots**, both indexed by the same slot number:
  `$C1E8` (16-byte stride, map-spawned platform/hazard objects) and `$C268`
  (32-byte stride, enemies/bosses).
* **There is no score.** The only `DAA` instructions in the ROM are at `00:39AC`
  and `00:39C2`, inside a hidden stage-select menu.
* **Lives = `$C767`**, initialised to 5 at `00:0206`, decremented at `00:2AB6`,
  game-over → `JP $0150` (hard reset).

---

## 1. PLAYER STATE BLOCK (HRAM) - the primary deliverable

All addresses HRAM. World coordinates are **12.4 fixed point** (1 px = 16 units),
stored **high byte first** (`$FF81` = X hi, `$FF82` = X lo). Confirmed by
`sub_00_18E7`/`sub_00_18F1` (16-bit add through `[HL-]`) and `sub_00_1172`
(subtract camera, `<<4`, take high byte).

| addr | w | name | units / encoding | evidence |
|---|---|---|---|---|
| `$FF80` | 1 | **AirState** | 0 = grounded, 1 = rising, 2 = falling | `00:1A63 CP $01`, `00:1A86 LD A,$02`, `00:1B41 XOR A` on land |
| `$FF81` | 1 | **PosX hi** | 12.4, hi byte = metatile column (16 px) | `00:104E`, `00:18E7` |
| `$FF82` | 1 | **PosX lo** | 12.4 low byte (high nibble = sub-tile px, low nibble = 1/16 px) | `00:18E7` |
| `$FF83` | 1 | **PosY hi** | 12.4 | `00:18F1`, `00:20BA` |
| `$FF84` | 1 | **PosY lo** | 12.4 | `00:18F1` |
| `$FF85` | 1 | *(write-only, 1 site `00:1333`)* | UNCONFIRMED - dead/debug | 0 reads in the whole ROM |
| `$FF86` | 1 | **VelX** | signed byte, 1/16 px per frame | `00:1D3D` accel, `00:1888/$18C8` integrate |
| `$FF87` | 1 | **VelY** | signed byte, **positive = up**; `Y -= VelY` | `00:1A7E`, `00:1B00`, `00:1A89` |
| `$FF88` | 1 | **Facing** | 0 = right, 1 = left | `00:187D` (Right→0), `00:18B9` (Left→1); drives `$1D3D` sign |
| `$FF89` | 1 | AnimSubTimer | frames | `00:1BC8 LD A,$05` |
| `$FF8A` | 1 | **HP (current energy)** | 0..`$FF8E` | `00:2777` (damage), `00:0F7E` (HUD) |
| `$FF8B` | 1 | SpriteAttrOverride | OAM attr / flip = `Facing XOR 1` | `00:1BA7`, `00:1BCE` |
| `$FF8C` | 1 | **HitboxHalfWidth** | px, init `$0F` | `00:052C LD A,$0F`, used `00:1EAB` |
| `$FF8D` | 1 | **HitboxHalfHeight** | px, init `$10` | `00:0530 LD A,$10`, used `00:1DBE` |
| `$FF8E` | 1 | **HP max (energy capacity)** | init `$0A`, upgradable to `$10` | `00:0202`, `01:4D6E` |
| `$FF8F` | 1 | TurnAroundTimer | frames, set `$0F` | `00:187A`, `00:18B5`; picks anim `$14/$13` from table `00:1BD3` |
| `$FF90` | 1 | LandingSquatTimer | set `$10` on hard landing | `00:1B3D` |
| `$FF91` | 1 | scratch (1R/1W, `00:1C94/1C99`) | UNCONFIRMED | |
| `$FF92` | 1 | scratch (`00:1C70/1C7A/1C8C`) | UNCONFIRMED - bat-rope sub-state | |
| `$FF93` | 1 | **ScreenX** | OAM X (= `(PosX-camX)>>4 + 8`) | written once `00:1B58`, read 22× |
| `$FF94` | 1 | **ScreenY** | OAM Y (= `(PosY-camY)>>4 + 16`) | written once `00:1B5B`, read 14× |
| `$FF95` | 1 | **SlowModeFlag** | non-zero = water/heavy (halves speed, halves gravity) | `00:2E7F LD A,$80`, `00:2E9A XOR A`; read `00:1D42/1AE4/1AF5` |
| `$FF96` | 1 | cleared each player tick (`00:1641`) | UNCONFIRMED | |
| `$FF97` | 1 | **AttackAnimCounter** | 1..15 ring; ==8 triggers punch hit test `00:201A` | `00:1910-192C` |
| `$FF98` | 1 | AirControlThrottle | 1 = skip accel this frame (halves air accel) | `00:1D4D-1D5D` |
| `$FFB2` | 1 | **WallClingLock** | bits 0-4 = countdown, bits 5-7 = locked d-pad dir (`(v&$E0)>>1` compared to `$FFE1 & $F0`) | set `$50` at `00:1F56`, `$30` at `00:200F`; anim `$11/$12` at `00:1B8F` |
| `$FFC2` | 1 | JumpButtonReleased | 1 = A was released mid-jump (enables wall-jump) | `00:1A71`, `00:1AE0`, read `00:1F42` |
| `$FFC3` | 1 | **PlayerAnimID** | metasprite id, feeds `$0BC6` and the tile streamer | 13 writes, read `00:2C1B/2C28` |
| `$FFC4` | 1 | PlayerAnimFrame | index within anim | `00:2C13` |
| `$FFC5` | 1 | PlayerAnimIDPrev | change detector for tile streaming | `00:2C18/2C1D` |
| `$FFB4` | 1 | **BatRopeSegments** | 5 at fire, counts down | `00:195D LD A,$05`, `00:3D89` |
| `$FFB3` | 1 | actor-loop cursor for `$C268` | 0..7 | `01:4E1A` |

**Player-adjacent WRAM:**

| addr | name | notes |
|---|---|---|
| `$C71E` | **PlayerActionState** | 0 = free, 1 = bat-rope firing, 2 = rope in flight/attached, 3 = rope anchored/climb. Gates all input. 19R/24W |
| `$C71D` | AttackPose | 1 = batarang throw pose, 0 = punch pose (`00:194F`, `00:19B8`, `00:1A26`) |
| `$C721` | RopeSubTimer | `00:195A`, `00:3D83` |
| `$C714` | **InvulnerabilityTimer** | `$5A` (90 frames); bit 7 = knockback direction. Every damage path does `LD A,[$C714]; AND A; JR NZ,skip` |
| `$C751` | SuperJumpFlag | 1 → jump velocity `$32` instead of `$22` (`00:1A43`) |
| `$C759` | **BatarangAmmo** | 0 at level start, +10 per pickup, −1 per throw. No cap → can overflow past 255 |
| `$C767` | **LIVES** | init 5, `DEC` at `00:2AB6`, `JP $0150` at 0 |
| `$C72F` / `$C730` | pending player X / Y displacement from moving platforms; consumed and cleared at `00:170A-$1739` |
| `$C723` / `$C724` | copy of the above (last frame's carry delta) |
| `$C737` / `$C738` / `$C739` / `$C73A` | scripted-move state / countdown / X limit / Y limit (`00:1640-$1706`) |
| `$C715` | DeathSequenceActive (1 = playing death animation) |
| `$C716` | PauseFlag (toggled by Start, `00:060A`) |

**Bat-rope segment array:** `$C5EF-$C606` - 6 × 4 bytes `{Xhi,Xlo,Yhi,Ylo}` at
`$C5EB + (n+1)*4`, `n = $FFB4`. Entry at `$C5EB-$C5EE` is never used (`n+1`
indexing). `00:3DA6`, `00:1961`.

**Batarang / thrown-weapon pool:** `$C4B0-$C4CA` - **3 × 9 bytes** at
`$C4A7 + 9*(n+1)`, `n = 0..2` (`00:199F`, `LD DE,$0009`, `CP $03`).
`$C4A7-$C4AF` is a phantom slot 0 that is **never touched - 9 free bytes.**
Layout (from `00:19CE-$1A14`):

| off | field |
|---|---|
| +0 | type = `Facing+1` (1 or 2), OR `$80` on level `$0E` when `$C756!=0` |
| +1,+2 | X hi, X lo (player X) |
| +3,+4 | Y hi, Y lo (player Y ± `$0060`/`-$0040` depending on Down held) |
| +5 | speed: `$50` normally, `$08` on level `$0E` hard mode |
| +6 | `$40` if Up held else `$00` (upward-angled throw) |
| +7,+8 | unused |

---

## 2. ACTOR TABLES

### 2.1 `$C1E8` - 8 × 16 bytes ($C1E8-$C267) - map-spawned objects

Driver: `sub_01_4230` (`LD C,0 … SWAP C; LD HL,$C1E8; ADD HL,BC; … INC C; CP $08`).
Slot is freed by `sub_01_4BE8`, which takes the **top 3 bits of a level-map
metatile** (`AND $E0`, `SRL A` → slot*16) and zeroes 16 bytes - proving stride 16
and count 8.

| off | field | evidence |
|---|---|---|
| +$00 | type/handler index 1..11 (0 = empty). Bit 7 = "on screen this frame" | `01:423F`, jump table `01:$427B` (11 entries) |
| +$01,+$02 | **X world 16-bit** (hi,lo) 12.4 | `sub_01_4A5C` adds BC to +$01/+$02 |
| +$03,+$04 | **Y world 16-bit** (hi,lo) 12.4 | `sub_01_4A79` adds BC to +$03/+$04 |
| +$05 | X velocity (signed) | UNCONFIRMED (symmetry with +$06) |
| +$06 | Y velocity, ramps +1/frame to a cap of `$30` | `01:42BE-$42C6` |
| +$07 | flags; bit 0 = "hurts the player" | `00:15D5 BIT 0,(HL)` |
| +$0B | state timer 0..7 then `$FF` | `01:4298-$42B9` |
| +$0D | "player is riding this" → adds its delta into `$C72F`/`$C730` | `01:4A68`, `01:4A87` |

Activation half-width per type is table **`1:$4BA5`** (13 bytes:
`00 0B 0B 0B 0B 0B 0B 0B 0B 0B 0B 08 09`), compared against
`|camX+5 − actor.X| ` at `01:425D-$4267`.

### 2.2 `$C268` - 8 × 32 bytes ($C268-$C367) - enemies / bosses

Driver: `sub_01_4E0C` (`SWAP A; ADD A,A` → *32; `LD HL,$C268; ADD HL,BC`;
loop `INC A; CP $08` at `01:60D4`, or descending on odd frames `01:60CC`).
Three other loops confirm base+stride+count: `00:2654` (`CP $08` at `00:2725`),
`00:2EB0` (`CP $08` at `00:2EEF`), `00:3C1B` (`CP $08` at `00:3D0F`).

| off | field | evidence |
|---|---|---|
| +$00 | **flags**: b7 = active, b6 = "ignore/off", b3 = already-hit-player, b2 = hit-flash, b1 = misc | `01:4E27 BIT 7`, `00:3C2C BIT 6`, `00:3C90/3CA7 BIT/SET 3`, `00:26C4 SET 2` |
| +$01 | subtype / spawn id | `00:2666` |
| +$02 | **state** 1..12 → jump table `1:$60EF` (`DEC A; ADD A,A`) | `01:60DD-$60EE` |
| +$07 | screen X (recomputed per frame) | `00:3C3F` + `sub_00_0C88` box test |
| +$08 | screen Y | `00:3C40` |
| +$0E,+$0F | **X world 16-bit** 12.4 | `01:4E48` uses +$0E as metatile column for despawn |
| +$10,+$11 | **Y world 16-bit** 12.4 | `00:2EC7-$2ED2` extracts `((+$10 &$0F)<<4)|(+$11>>4)` = pixel Y; `01:4E64 CP $21` = fall-out-of-level |
| +$14 | state timer (decrements to 0) | `01:6109-$6112` |
| +$16 | **HP** | damage at `00:26F6-$26FB`, `+5` on hard at `00:0D80-$0D85` |
| +$17 | hit-flash timer, set `$3C` | `00:26CA`, `00:3D04` |
| +$06/+$09 | cleared/used as sub-flags | UNCONFIRMED |

Absolute references seen in the ROM decode cleanly against this layout:
`$C27E` = slot0+$16 (boss HP), `$C284/$C285` = slot0+$1C/$1D,
`$C288` = slot1+$00, `$C28A` = slot1+$02, `$C29E` = slot1+$16,
`$C2A8` = slot2+$00, `$C2AA` = slot2+$02, `$C2BE` = slot2+$16,
`$C328` = slot6+$00, `$C348` = slot7+$00.

### 2.3 Other pools

| base | shape | allocator | purpose |
|---|---|---|---|
| `$C1C0-$C1E7` | 8 × 5 B | inline `00:29ED` (memcpy from ROM `$2AD7`) | death/explosion particles; `00:2A0D` iterates `A*5`, `CP $08` |
| `$C4B0-$C4CA` | 3 × 9 B | inline `00:199F` | batarangs (see §1) |
| `$C5EF-$C606` | 6 × 4 B | inline `00:3DA6` | bat-rope segments |
| `$C60B-$C61A` | 4 × 4 B | inline `01:4BFF` | boss-door / gate debris (`$C733` sequencer) |
| `$C67B-$C692` | 8 × 3 B | inline `00:1351` | delayed tile-restore timers `{timer, Xhi, Yhi}`; on expiry clears the map cell and spawns effect `$97` |
| `$C693-$C6CE` | 10 × 6 B | **`sub_00_0CC2`** (`A*6`, `CP $0A`) | visual effects / pickups: `{spriteID, Xhi, Xlo, Yhi, Ylo, subtype}` seeded from `$C744-$C747` + `D`,`E` |
| `$C6CF-$C6EE` | 4 × 8 B | **`sub_00_0CF3`** (`A*8`, `CP $04`) | ballistic thrown objects (gravity) - see below |
| `$C6EF-$C6FA` | 4 × 3 B | inline `01:7AB3` | type-`$17` markers `{type, Xhi, Yhi}`, sound `$25` |
| `$C6FB-$C702` | 4 × 2 B | `sub_00_0AE1` | sound command ring |

**`$C6CF` ballistic object layout** (`00:0D03-$0D46` writes it, `00:1445-$14B4`
integrates it):

| off | field |
|---|---|
| +0 | direction/type: `$FF` or `$01` (0 = free slot) |
| +1,+2 | X world hi,lo (from `$C749/$C74A`) |
| +3,+4 | Y world hi,lo (from `$C74B/$C74C`) |
| +5 | X velocity: `$00` / `$F8` (−8) / `$08` from `$C74D` |
| +6 | Y velocity: `$00` / `$20` / `$38`; **gravity −3/frame, clamped to `$A0` (−96)** |
| +7 | subtype (`D`) |

Integration is `pos -= vel` (`00:1477-$14B4`), i.e. positive Y velocity = up.

**Spawn staging registers** (write these, then call the allocator):
`$C744,$C745,$C746,$C747` = `{Xhi,Xlo,Yhi,Ylo}` for `$0CC2`;
`$C749..$C74D` = `{Xhi,Xlo,Yhi,Ylo,dir}` for `$0CF3`.

---

## 3. TUNABLE ROM CONSTANTS (the mod gold)

Bank 0 addresses are also raw file offsets. Bank 1 file offset = `addr - $4000 + $4000` = `addr` (bank 1 starts at file `$4000`), i.e. `01:4D68` → file `$04D68`.
"operand" is the byte to patch.

### 3.1 Player physics

| value | meaning | instruction | operand byte |
|---|---|---|---|
| `$22` | **jump initial velocity** (normal) | `00:1A4D LD A,$22` | **`$01A4E`** |
| `$32` | jump initial velocity when `$C751` set (spring/super) | `00:1A49 LD A,$32` | `$01A4A` |
| `$22` | wall-jump / bounce initial velocity | `00:1DA8 LD A,$22` | `$01DA9` |
| `$01` | **gravity while rising, A held** (variable jump height) | `00:1A7C LD B,$01` | `$01A7D` |
| `$02` | **gravity while rising, A released** | `00:1A78 LD B,$02` | `$01A79` |
| `$03` | **gravity while falling** | `00:1AF3 LD B,$03` | **`$01AF4`** |
| `$02` | gravity while falling, slow mode (`$FF95`), applied 1 frame in 8 | `00:1AEF LD B,$02` | `$01AF0` |
| `$BE` | **terminal fall velocity** (−66 = −4.125 px/f) | `00:1AFA LD C,$BE` | **`$01AFB`** |
| `$F4` | terminal fall velocity, slow mode (−12) | `00:1AFE LD C,$F4` | `$01AFF` |
| `$18` | **max walk speed, right** (+1.5 px/f) | `00:1D4B LD B,$18` | **`$01D4C`** |
| `$E8` | **max walk speed, left** (−1.5 px/f) | `00:1D7A LD B,$E8` | **`$01D7B`** |
| `$08` | max walk speed, slow mode (right) | `00:1D47 LD B,$08` | `$01D48` |
| `$F8` | max walk speed, slow mode (left) | `00:1D76 LD B,$F8` | `$01D77` |
| `$1A` / `$02` | over-speed decel threshold / step (right) | `00:1D65`, `00:1D69` | `$01D66`, `$01D6A` |
| `$E6` / `$02` | over-speed decel threshold / step (left) | `00:1D94`, `00:1D98` | `$01D95`, `$01D99` |
| `$14`,`$EC` | wall-jump X velocity table `[facing]` | data `00:$27A6` | `$027A6`,`$027A7` |
| `$FC`,`$04` | punch recoil X velocity | `00:20B1`, `00:20B5` | `$020B2`, `$020B6` |
| `$50` | wall-cling lock word (dir=left, 16 frames) | `00:1F56 LD A,$50` | `$01F57` |
| `$30` | wall-cling lock word (dir=right, 16 frames) | `00:200F LD A,$30` | `$02010` |
| `$0F` | player hitbox half-width | `00:052C LD A,$0F` | `$0052D` |
| `$10` | player hitbox half-height | `00:0530 LD A,$10` | `$00531` |
| `$05` | bat-rope segment count | `00:195D LD A,$05` | `$0195E` |
| `$0040`/`$FF40` | bat-rope X launch offset | `00:196F`,`00:1974` | `$01970`, `$01975` |
| `$FEC0` | bat-rope Y launch offset (−320 = −20 px) | `00:1984` | `$01985` |
| `$0060`/`$FFC0` | batarang Y launch offset (Down held / not) | `00:19E6`, `00:19EB` | `$019E7`, `$019EC` |
| `$50` | batarang speed | `00:19F6 LD B,$50` | `$019F7` |

### 3.2 Health / lives / economy

| value | meaning | instruction | operand |
|---|---|---|---|
| `$0A` | **starting & max HP** (written to both `$FF8E` and `$FF8A`) | `00:0200 LD A,$0A` | **`$00201`** |
| `$05` | **starting LIVES** → `$C767` | `00:0206 LD A,$05` | **`$00207`** |
| `$02` | max-HP pickup increment | `01:4D68 ADD A,$02` | `$04D69` |
| `$11`/`$10` | max-HP cap test / clamp (16) | `01:4D6A`, `01:4D6E` | `$04D6B`, `$04D6F` |
| `$06` | energy pickup amount | `01:4DB5 ADD A,$06` | `$04DB6` |
| `$0A` | **batarang ammo per pickup** | `01:4D9F ADD A,$0A` | `$04DA0` |
| `$02` | **contact damage from `$C1E8` objects** | `00:15E5 LD B,$02` | **`$015E6`** |
| `$04` | hazard/spike damage | `00:1E20 LD B,$04` | `$01E21` |
| `$01` | environmental drain (slow mode + `$C756!=0`) | `00:2E8D LD B,$01` | `$02E8E` |
| table | **enemy contact damage by state** - `01:$6BC1`, 13 bytes: `00 02 02 02 00 00 00 01 02 01 02 81 00`; bit 7 → add per-level bonus | data `01:$6BC1` | `$06BC1` |
| table | per-level contact-damage bonus - `01:$6BCE`, 14 bytes, `00`×11 then `03 01 01` | data `01:$6BCE` | `$06BCE` |
| `$5A` / `$DA` | **invulnerability frames after a hit** (90; `$DA` = 90 + knockback-left bit) | `00:15EF`/`00:15F3`, `00:1E2A`/`00:1E2E`, `00:2E92`, `01:67B1`/`01:67B5` | `$015F0`,`$015F4`,`$01E2B`,`$01E2F`,`$02E93`,`$067B2`,`$067B6` |
| `$10` / `$F0` | knockback X velocity (right/left) | `00:1790`, `00:1794` | `$01791`, `$01795` |
| `$18` | knockback Y velocity | `00:17B2 LD A,$18` | `$017B3` |
| `$40` | knockback Y velocity, level 4 with `$C73F` | `00:17AC` | `$017AD` |
| `$78` | death-sequence length (120 frames) | `00:2A00 LD A,$78` | `$02A01` |

### 3.3 Damage the player deals

| value | meaning | instruction | operand |
|---|---|---|---|
| `$02` | **melee/punch damage to enemies** | `00:26F0 LD B,$02` | **`$026F1`** |
| `(HL)` | critical hit = enemy's full remaining HP | `00:26E3 LD B,(HL)` | - |
| `$08` | crit window: `(rLY XOR frameCounter) < 8` ≈ 3 % | `00:26D3 CP $08` | `$026D4` |
| `1` | batarang damage (`DEC (HL)` on +$16) | `00:3D0B` | - |
| `$3C` | enemy hit-stun / flash frames | `00:26CA`, `00:3D04` | `$026CB`, `$03D05` |
| `$05` | boss HP bonus on difficulty 2 | `00:0D83 ADD A,$05` | `$00D84` |

### 3.4 Camera / streaming / level

| value | meaning | site | operand |
|---|---|---|---|
| `$05` | camera X lead (metatiles behind player) | `00:1051`, `00:106B`, `00:1073` | `$01052`,`$0106C`,`$01074` |
| `$06` | camera X left clamp | `00:105B` | `$0105C` |
| `$15`,`$10`,`$1D`,`$18` | camera Y window (lo test / lo clamp / hi test / hi clamp) | `00:1082/1086/108E/1092` | `$01083`,`$01087`,`$0108F`,`$01093` |
| `$05` / `$09` | actor activation window (`\|camX+5 − X\| < 9`) | `00:11A9`, `00:11B0` | `$011AA`, `$011B1` |
| `$07` | despawn window for `$C268` actors | `01:60A9 CP $07` | `$060AA` |
| `$21` | **death pit Y threshold** (metatile row 33) | `00:1764 CP $21` | `$01765` |
| `$1B` | death pit threshold on level `$0B` | `00:175D CP $1B` | `$0175E` |
| `$11` | ceiling clamp (Y hi < 17 → level exit) | `00:174C CP $11` | `$0174D` |
| `$01` | starting level number → `$FFB0` | `00:01FC LD A,$01` | `$001FD` |
| `$BB` | `rTMA` → sound tick 59.4 Hz | `00:0248 LD A,$BB` | `$00249` |
| `$0A` | `$0CC2` pool size (10) | `00:0CEC CP $0A` | `$00CED` |
| `$04` | `$0CF3` pool size (4) | `00:0D4B CP $04` | `$00D4C` |
| `$08` | actor-array iteration count (both arrays) | `01:4A56`, `01:60D7`, `00:2725`, `00:2EEF`, `00:3D0F` | - |
| `$03` | gravity on `$C6CF` ballistics | `00:1469 SUB $03` | `$0146A` |
| `$A0` | terminal velocity for `$C6CF` ballistics | `00:1473 LD A,$A0` | `$01474` |
| `$30` | Y-velocity cap for `$C1E8` objects | `01:42C0/42C4` | `$042C1`, `$042C5` |

---

## 4. FULL HRAM MAP `$FF80-$FFFE`

`R`/`W` are distinct instruction sites (not dynamic counts).

| addr | R | W | name |
|---|---|---|---|
| `$FF80`-`$FF98` | | | **player block - see §1** (`$FF80` is *reused* as the stage-select cursor at `00:399C-$39BB`) |
| `$FF99`,`$FF9A` | 1,1 | 3,2 | VBlank tile-transfer dest lo/hi (0 = idle); drives `CALL $C4CB` |
| `$FF9B`,`$FF9C` | 2,1 | 6,3 | VBlank row-transfer dest lo/hi (0 = idle), source `$C5CB` |
| `$FF9D` | 2 | 3 | shadow-OAM write cursor (0..$A0), reset by `$0C1F` |
| `$FF9E` | 1 | 2 | metasprite attribute OR-mask (set by `$0BAF`/`$0BC6`) |
| `$FF9F` | 2 | 2 | 2×2 tile-queue cursor (+6 per entry), reset in VBlank `00:074A` |
| `$FFA0` | 1 | 2 | VRAM-script-pending flag |
| `$FFA1` | 2 | 1 | sound queue read index (0,2,4,6) |
| `$FFA2`,`$FFA3` | 10,7 | 2,2 | **camera X hi,lo** (12.4) |
| `$FFA4`,`$FFA5` | 6,4 | 2,2 | **camera Y hi,lo** (12.4) |
| `$FFA6` | 1 | 1 | scratch in `00:128C` |
| `$FFA7` | 13 | 1 | **frame parity**, toggled every VBlank at `00:07FC-$0800`; flips actor-loop direction and gates the HUD draw. *(Recon-1 called this a level-type flag - it is not.)* |
| `$FFA9`,`$FFAA` | 4,5 | 3,4 | SCX / SCY shadow (camera >> 4) |
| `$FFAB`-`$FFAF` | | | WX, WY, BGP, OBP0, OBP1 shadows |
| `$FFB0` | **65** | 5 | **LEVEL / STAGE number** (1-based). Most-read variable in the ROM |
| `$FFB1` | 23 | 1 | frame counter (++ per VBlank) |
| `$FFB2` | 6 | 7 | wall-cling lock (see §1) |
| `$FFB3` | 2 | 1 | `$C268` loop cursor |
| `$FFB4` | 8 | 3 | bat-rope segment counter |
| `$FFB5` | 3 | 6 | "level was entered / continue available" flag |
| `$FFB6`-`$FFB9` | | | attack/hit-box scratch: `{Xhi,Xlo,Yhi,Ylo}` in, `{screenX,_,screenY,_}` out (`00:2426-$2437`) |
| `$FFBA`-`$FFBD` | 8,6,9,6 | 6,4,7,5 | secondary object world pos `{Xhi,Xlo,Yhi,Ylo}` (boss/level-`$0E` vehicle) |
| `$FFBE`,`$FFBF` | 2,2 | 2,2 | bank-1 scratch pair (`01:640C`, `01:66FB`) |
| `$FFC0`,`$FFC1` | 6,6 | 4,4 | tile-probe coords (metatile col,row) for `$11B9` |
| `$FFC2` | 2 | 7 | jump-button-released flag |
| `$FFC3`,`$FFC4`,`$FFC5` | | | player anim id / frame / previous id |
| `$FFC6` | 1 | 4 | cleared at start of `$1336`; "object drawn" latch |
| `$FFC7` | 2 | 11 | **raster/STAT mode 0..7** (see recon-1 §2) |
| `$FFC8`-`$FFCC` | | | parallax layer state (`00:2EFB-$2F5C`); `$FFCC` = raster SCX for mode 0 |
| `$FFCD`-`$FFD0` | 2,2,2,2 | 4,4,4,4 | bank-1 boss coordinate quad |
| `$FFD2`,`$FFD3` | | | sound command mask / id handed to the driver |
| `$FFD4`-`$FFD6`, `$FFDB`-`$FFDD` | | | **bank-7 sound-driver private state** (only touched by bank 7 + the two hand-off writes) |
| `$FFE1` | 13 | 3 | **buttons held** |
| `$FFE2` | 18 | 10 | **buttons newly pressed** |
| `$FFE7` | 2 | 2 | VBlank-pending handshake |
| `$FFE8` | 1 | 1 | saved `rIE` across `LCDOff` |
| `$FFEA` | 1 | 2 | sound-tick re-entrancy guard |
| `$FFF0`-`$FFF9` | - | - | **OAM-DMA stub (code)**, written once at boot |

**Joypad bit layout** (from `00:07CC-$07F6`; d-pad is read first and `SWAP`ped
into the high nibble):

```
bit 0 = A      bit 4 = Right
bit 1 = B      bit 5 = Left
bit 2 = Select bit 6 = Up
bit 3 = Start  bit 7 = Down
```

Control mapping: **A = jump** (`00:1A2B BIT 0,[$FFE2]`), **B = throw batarang /
punch** (`00:1938 BIT 1`), **Up = fire bat-rope** (`00:193F BIT 6`),
**Start = pause** (`00:0600 BIT 3`), Left/Right = walk, Down modifies throw arc.
Soft reset = `$FFE1 == $0F` (A+B+Select+Start) at `00:0A55`.

### HRAM false positives (do **not** treat as variables)

`--immediates` proves these `LD rr,nnnn` values are never dereferenced - they are
negative 16-bit constants used for backwards pointer arithmetic:

`$FFE0`(−32, 8×) `$FFE3 $FFE5 $FFE7 $FFE8 $FFE9 $FFEA $FFEB $FFEC`(7×)
`$FFED $FFEE`(10×) `$FFEF $FFF0`(15×) `$FFF1 $FFF2`(17×) `$FFF3 $FFF4 $FFF5`
`$FFF6 $FFF7`(17×) `$FFF8 $FFF9`(18×) `$FFFA`(20×) `$FFFB`(25×) `$FFFC`(15×)
`$FFFD`(56×). Also `$FF00 $FF20 $FF40 $FF70 $FF80 $FFA0 $FFB0 $FFC0` used as
+256-aligned constants. `$FFD1`, `$FFD7`-`$FFDA`, `$FFDE`-`$FFE0`, `$FFE3`-`$FFE6`,
`$FFE9`, `$FFEB`-`$FFEF` have **zero** real accesses.

---

## 5. FULL WRAM MAP `$C000-$DFFF`

| range | size | contents |
|---|---|---|
| `$C000-$C09F` | 160 | **shadow OAM** (DMA source), 40 × 4 B |
| `$C0A0-$C0FF` | 96 | **UNUSED - free real estate** (zero accesses) |
| `$C100-$C12F` | 48 | VBlank vertical-column descriptor: `[0]=dest hi`, `[1]=dest lo`, then 18 tile bytes. `[0]==0` → idle |
| `$C130-$C15F` | 48 | VBlank 2×2-tile queue, 6-B records `{dest hi, dest lo, t0..t3}`, cursor `$FF9F`, zero-terminated. Capacity UNCONFIRMED (cursor is 8-bit; practical limit is the `$C160` boundary = 8 entries) |
| `$C160-$C1BF` | 96 | VRAM-script staging buffer built at `00:1136`, executed by `CALL $0A0E` at `00:115D`. Size UNCONFIRMED (upper bound only) |
| `$C1C0-$C1E7` | 40 | death/explosion particles, 8 × 5 B, seeded from ROM `00:$2AD7` |
| `$C1E8-$C267` | 128 | **actor array A**, 8 × 16 B (§2.1) |
| `$C268-$C367` | 256 | **actor array B (enemies)**, 8 × 32 B (§2.2) |
| `$C368-$C4A6` | 319 | tile-block source pool, indexed `$C368 + E*4` by `sub_00_11F1` |
| `$C4A7-$C4AF` | 9 | **UNUSED** phantom batarang slot 0 - free real estate |
| `$C4B0-$C4CA` | 27 | batarang pool, 3 × 9 B |
| `$C4CB-$C58A` | 192 | **generated 64-byte copier (executable code)** - do not relocate |
| `$C58B-$C5CA` | 64 | tile staging buffer (source for `CALL $C4CB`) |
| `$C5CB-$C5EB` | 33 | tilemap row buffer (VBlank row transfer) |
| `$C5EC-$C5EE` | 3 | unused padding |
| `$C5EF-$C606` | 24 | bat-rope segments, 6 × 4 B |
| `$C607-$C60A` | 4 | UNUSED |
| `$C60B-$C61A` | 16 | gate/door debris, 4 × 4 B |
| `$C61B-$C67A` | 96 | VRAM-script staging drained by VBlank (`00:0714`); `[$C61B]==0` → idle |
| `$C67B-$C692` | 24 | delayed tile-restore timers, 8 × 3 B |
| `$C693-$C6CE` | 60 | effect/pickup slots, 10 × 6 B (`sub_00_0CC2`) |
| `$C6CF-$C6EE` | 32 | ballistic objects, 4 × 8 B (`sub_00_0CF3`) |
| `$C6EF-$C6FA` | 12 | type-`$17` markers, 4 × 3 B |
| `$C6FB-$C702` | 8 | sound command ring, 4 × 2 B |
| `$C703` | 1 | **current ROM bank shadow** (60 writes, 1 read) |
| `$C704-$C709` | 6 | **UNUSED - free real estate** |
| `$C70A-$C767` | 94 | **game state block** - see §6 |
| `$C768-$C7FF` | 152 | **UNUSED - free real estate** (zero accesses) |
| `$C800-$C94C` | 333 | sound-driver RAM; 8 tracks × `$24` B from `$C82D` |
| `$C94D-$CFFF` | 1715 | stack (grows down from `$CFFF`); large unused hole in practice |
| `$D000-$DFFF` | 4096 | **decompressed level map**, column-major: `addr = $D000 + (Xhi<<5) + (Yhi & $0F)*2`, 2 B per metatile, 16 rows/column, up to 128 columns (`sub_00_11B9`). Absolute writes seen at `$D205 $D263 $D41B $D41D $D4DA-$D4DD $D4FB $DB84 $DB85` are hard-coded level edits |

---

## 6. GAME-STATE BLOCK `$C70A-$C767`

| addr | R/W | name / meaning | confidence |
|---|---|---|---|
| `$C70A` | 6/3 | level-`$0B`-ish elevator/lift X counter (init `$1F` at `00:0534`) | medium |
| `$C70B`,`$C70C` | 4/3, 1/2 | same subsystem: Y counter, packed target Y | medium |
| `$C70D` | 1/4 | "sequence finished" latch (read `00:2D68`) | medium |
| `$C70E` | 3/2 | fade step counter (`sub_00_0A7F`) | high |
| `$C70F`-`$C711` | | BG-map build cursors (`00:3130`,`00:34E8`) | medium |
| `$C712` | 18/22 | **multi-purpose menu cursor / timer**: title selection, death countdown (`$78` at `00:2A02`), level-select digit | high |
| `$C713` | 12/12 | **dual use**: (a) in-level cutscene progress 1..7 indexing `00:$2DDC`; (b) title/level-select: continue flag and BCD stage number (`00:39A7`, `$01-$46`) | high |
| `$C714` | 10/11 | **invulnerability timer** (`$5A`, bit 7 = knockback dir) | **high** |
| `$C715` | 14/2 | death-sequence active | high |
| `$C716` | 23/3 | **pause flag** (Start toggles, `00:060A`) | high |
| `$C717`,`$C718` | | column-streaming counter / cursor (`00:10CE-$116E`) | high |
| `$C71D` | 1/3 | attack pose select (1 = batarang, 0 = punch) | high |
| `$C71E` | 19/24 | **player action state** (0 free / 1 rope-fire / 2 rope-flight / 3 anchored) | high |
| `$C71F` | 7/5 | rope length counter (thresholds `$14`,`$1E` at `00:1B78`) | medium |
| `$C720`-`$C72A` | | rope/scripted-move scratch; `$C723`/`$C724` = last platform delta | medium |
| `$C72B` | 11/6 | **collision-probe mode** (1 = horizontal, 3 = vertical-down, 4 = vertical-up, 5 = punch) passed to `sub_00_20BA` | high |
| `$C72C` | 9/10 | boss phase selector (bank 1, tables `1:$6D2A/$6D4A/$6D6A`) | medium |
| `$C72E` | 14/4 | boss sub-state | low |
| `$C72F`,`$C730` | 5/7, 4/4 | **pending player X / Y displacement** from moving platforms | high |
| `$C732` | 3/1 | **level width in metatiles** (from the map header, `00:0C7A`) | high |
| `$C733` | 7/4 | door/gate open sequencer 0..6 | high |
| `$C734`,`$C735` | 2/1 | door position (X,Y metatile) | high |
| `$C736`-`$C73B` | | scripted-move state: `$C737` = script id, `$C738` = steps left, `$C739`/`$C73A` = X/Y limits | medium |
| `$C73D` | 16/9 | boss/mini-boss phase counter | medium |
| `$C73E` | 23/4 | **level sub-type** (low nibble of table `00:$1015[level-1]`) - selects boss/room behaviour | high |
| `$C73F` | 12/16 | level event flag A | medium |
| `$C740` | 9/8 | **cutscene lock** (`$FF` = normal play; anything else freezes the actor/HUD logic) | high |
| `$C741` | 7/18 | level event timer | medium |
| `$C742`,`$C743` | 2/1 | parallax SCX for STAT states 2 and 3 | high |
| `$C744`-`$C747` | | `$0CC2` spawn staging `{Xhi,Xlo,Yhi,Ylo}` | high |
| `$C748` | 2/2 | `$C6CF` loop index | high |
| `$C749`-`$C74D` | | `$0CF3` spawn staging `{Xhi,Xlo,Yhi,Ylo,dir}` | high |
| `$C74E`,`$C74F` | 1/2 | spawn staging extras | low |
| `$C750` | 4/4 | **boss-fight flag** (1 on level `$0E`; disables pause and normal player logic) | high |
| `$C751` | 8/5 | super-jump / launch pad armed | high |
| `$C753` | 7/1 | **STAGE-BRANCH PROGRESS BITMASK** - see §7 | high |
| `$C754` | 2/1 | second progress bitmask (`SET 0/1/2` on levels 3/5/13, `01:4D86-$4D91`; read by `01:4DDA` level setup) | high |
| `$C755` | 3/1 | UNCONFIRMED | low |
| `$C756` | 19/2 | **DIFFICULTY** 0/1/2, default 1 at `00:01D1`, cycled at `00:3980-$399A`. Effects: enemy HP `+5` (`00:0D83`), boss activation flags (`00:0DA0` vs `00:0E07`), batarang speed on level `$0E` (`00:1A04`), environmental drain (`00:2E81`) | **high** |
| `$C757` | 2/3 | lag-frame flag (set by VBlank when the main loop is late) | high |
| `$C758` | 2/1 | draw-pass index 0..2 | medium |
| `$C759` | 2/3 | **batarang ammo** | **high** |
| `$C75A` | 5/3 | current `$C1E8` slot index | high |
| `$C75B`-`$C762` | | per-level bookkeeping, low xref counts | low |
| `$C763`,`$C764` | | 16-bit fractional scroll accumulator (STAT state 7) | high |
| `$C765`,`$C766` | | palette-cycle counter / LYC chain state | high |
| `$C767` | 2/2 | **LIVES** (init 5 at `00:0206`, `DEC` at `00:2AB6`, HUD digit `00:03BE`) | **high** |

---

## 7. Debug / cheat / free real estate

* **`$C753` - stage-branch progress bitmask (the game's only save state).**
  Set on *completing* a branch stage, dispatched on `$FFB0` at `00:35E8`:
  level `$04` → `SET 0` (`00:360F`), level `$08` → `SET 1` (`00:3616`),
  level `$0B` → `SET 2` (`00:3608`). When all three are set
  (`00:361E CP $07`) the game jumps straight to **level `$0C`**
  (`00:3623 LD A,$0C; LDH [$FFB0],A; JP $04BB`) instead of returning to the
  stage-select; the stage-select also unlocks a third entry
  (`00:038E`, `00:03EA`, `00:0411`, `00:0FE7`). Written only at `00:361B` and
  never cleared except by the boot WRAM wipe, so it survives game-over.
  **Forcing `$C753 = $07` is the cleanest level-warp hook for mods.**
* **`$C756` - difficulty selector**, 3-way, cycled by the menu at `00:3980`;
  labels come from ROM `00:$7C5F` / `$7C69` / `$7C73` (10-byte VRAM scripts).
* **`$C713` stage select**, BCD `$01-$46` (`00:39A7`, `00:39B3`, DAA), rendered by
  `sub_00_3A10`. `$FF80` is reused as its cursor (0..$2E). Reachable from the
  same menu tree as `$C756`.
* **Unreferenced WRAM (safe to repurpose):**
  * `$C0A0-$C0FF` - 96 B
  * `$C4A7-$C4AF` - 9 B (phantom batarang slot)
  * `$C5EC-$C5EE` - 3 B, `$C607-$C60A` - 4 B
  * `$C704-$C709` - 6 B
  * `$C768-$C7FF` - **152 B, the largest contiguous free block**
  * `$C94D-$CF00` - below the stack; risky but unused in practice
* **Unreferenced HRAM:** `$FFD1`, `$FFD7-$FFDA`, `$FFDE-$FFE0`, `$FFE3-$FFE6`,
  `$FFE9`, `$FFEB-$FFEF` (23 bytes total). `$FFFA-$FFFE` are also untouched but
  are directly below `rIE`.
* **`$FF85`** is written once (`00:1333`) and never read - dead variable.
* `$FF91`, `$FF92`, `$FF96`, `$C755` have ≤2 sites each and no determined
  meaning - candidates for reuse after an emulator check.

---

## 8. Open items (would be settled by a single emulator trace)

| claim | how to settle |
|---|---|
| `$C1E8` +$05 = X velocity | breakpoint-write on `$C1E8+5` and watch `$C1E8+1/+2` |
| `$C130` queue capacity | log max `$FF9F` across a level |
| `$C160` and `$C61B` script-buffer sizes | log max write offset |
| `$C268` +$06 / +$09 / +$1C / +$1D | watch a boss fight |
| `$C755`, `$C75B-$C762` | breakpoint-read |
| whether the difficulty/stage-select menu at `00:3980`-`$39CE` is a debug screen or a reachable option screen | trace which title-screen input reaches `00:38D5` |
| `1:$50D3` jump-table entry 3 (`$7750`) reachability (inherited from recon-1) | log `JP HL` targets |
