# 00 — MASTER REFERENCE
## Batman: Return of the Joker (GB, Sunsoft 1992) — authoritative technical spec

Supersedes `recon-1` … `recon-5` (now historical). Every disputed claim was
re-verified against the ROM/disassembly; the adjudication log is Appendix A.
Anything still uncertain is marked **UNCONFIRMED**.

ROM: 131072 B, MBC1, 8×16 KB banks, no cart RAM, DMG-only, title `BATMAN ROJ`.
Address notation `B:$AAAA` = bank B, CPU address. File offset: bank 0/1 = the
address itself; bank N≥2 = `N*$4000 + (A-$4000)`.

---

## 1. BANKING & CODE LAYOUT

* **Bank 0** (`$0000-$3FFF`): resident code (~90 %) + tables. Main loop, player,
  collision, camera, VBlank/STAT/Timer ISRs, menus.
* **Bank 1**: resident at `$4000` at all times except during excursions.
  Actor/enemy/boss code + per-level tables (`1:$7C44+`, `1:$7C7D`, `1:$7CED`
  are bank-1 data even though bank-0 code reads them).
* **Banks 2–6**: DATA ONLY (proven: no CALL/JP targets, byte statistics,
  forced-disasm failure). 2 = player anim + tile gfx, 3 = level maps +
  collision LUTs, 4 = tile gfx only, 5 = metatiles + spawns + metasprites +
  VRAM scripts, 6 = tile gfx + menu art.
* **Bank 7**: sound driver `$4000-$46D4` + pitch/song data `$46D5-$7956` +
  **VRAM script (ending text) `$7960-$7FFF`** (run by `00:3758` — not audio).

Bank switching: `LD A,imm / LD [$2000],A / LD [$C703],A` under DI/EI — all 63
sites, all immediate, always returning to bank 1. `$C703` = current-bank shadow,
read only by the Timer ISR save/restore. The only dynamic bank write is inside
`sub_00_0B15` (resource loader). MBC1 mode/RAM registers never touched.
**JS consequence: banking disappears entirely; it is just static code/data
partitioning.**

RST $28/$30/$38 = `HL/DE/BC += A` (unsigned, with carry). Not far-calls.

Runtime-generated code (both write-once, become plain functions in JS):
* `$C4CB-$C58A`: generated unrolled 64-byte memcpy (VBlank tile push).
* `$FFF0-$FFF9`: OAM-DMA stub (shadow OAM `$C000` → OAM).

---

## 2. TIMING, INTERRUPTS, FRAME STRUCTURE

| vector | handler | role |
|---|---|---|
| VBlank `$0040` | `00:0653` | OAM DMA, VRAM transfer queues, joypad read, frame counter, scroll/palette register push |
| STAT `$0048` | `00:0857` | raster-split state machine on `$FFC7` (armed only when `rIE=$07`) |
| Timer `$0050` | `00:095F` | **sound tick**: `rTMA=$BB`, `rTAC=$04` → `4096/69 = 59.36 Hz`. Pops one entry from the `$C6FB` command ring, banks to 7, `CALL 7:412B` |

Main loop `00:0567 … 00:0650` (order = OAM/priority order):

```
$0F7B  HUD energy bar (metasprites, OAM slots first)
$29E7  death-sequence tick
$0BC6  per-level overlay sprite
$121F  camera + column streaming
1:4230 map-object array ($C1E8) update+draw
$1336  delayed tile restores, effect pool, ballistics
$2CBE / $2C13 / $3A35   per-level logic, player tile stream + BG anim, batarangs
1:4E0C ENEMY array ($C268) update+draw          [not the player!]
        └ player state machine is bank-0 inline (~$1600-$2100), drawn at $1D0C
1:4BB0 (conditional), 1:7AD3
pause handling (7:405D / 7:4083)
$0C1F  clear unused shadow OAM
$0A4F  wait VBlank ($FFE7 handshake; A+B+Sel+Start → JP $0150 soft reset)
```

VBlank transfer queues (all drained once per VBlank):

| queue | trigger | payload |
|---|---|---|
| `$C100` descriptor | `[$C100]!=0` | **32 tile bytes** down one BG column, stride $20 (one metatile column = 32 tile rows). On levels 9/`$0A`: dest hi forced `$99`, source +8, first 9 writes skipped (top parallax band is static). Skipped entirely on level 6 |
| `$C61B` script | `[$C61B]!=0` | VRAM script via `$0A0E` |
| `$C130` 2×2 queue | records present | 6-B records `{destHi,destLo,t0..t3}` → t0/t2 top, t1/t3 bottom (+$20). Cursor `$FF9F`, ~8 records max |
| `$C5CB` row buffer | `[$FF9B]!=0` | **32 bytes** (2 tiles) to `($FF9B<<8)\|$FF9C` — BG tile animation. `$FF9B` = dest **HIGH** byte |
| `$C58B` staging | `[$FF99]!=0` | 64 bytes (4 tiles) via generated copier `CALL $C4CB` — player anim tiles. `$FF99` = dest **HIGH** byte |

### STAT raster state machine (`$FFC7` = mode, ISR `00:0857`)

Armed per level inside `sub_00_0D50` (which first zeroes `$FFC7`, then branches
on the level number — the `0:$1015` table feeds `$C73E`, *not* the raster mode):

| levels | mode chain | effect |
|---|---|---|
| 1, 2 | 6 | **water wobble**: from the water-surface line (`$C755`, also WY) down to `$8C`, every 4 scanlines `rSCX = $FFA9 + sine[((LY>>1)+frame)&$1F]` (table `0:$09A2`, 32 signed bytes); OBP0=$90/OBP1=$80 below surface; window ($9C00 map) draws the water body |
| 9, `$0A`, `$0B` | 2→3→4 | 3-band parallax: lines 0-47 SCX=`$C742` (+1/frame), 48-63 SCX=`$C743` (+3/frame), 64-143 SCX=`$FFA9`; SCY bob ±3 every 8th frame |
| 6 | 0→1 | 2-band split: lines $22-$6F SCX=`$FFCC`, $70+ SCX=`$FFA9`; SCY-2 bob |
| stage clear | 5 | window pushed off at line $90 |
| ending | 7 | per-scanline fractional SCY (8.8 accumulator `$C763/$C764`), BGP switch at line $44 |
| all others | — | no splits, `rIE=$05` |

Up to ~36 splits/frame (mode 6). **Renderer must support per-scanline SCX/SCY
and per-scanline BGP/OBP0/OBP1/WX/WY.**

---

## 3. MEMORY MAP (corrected, final)

### WRAM

| range | size | contents |
|---|---|---|
| `$C000-$C09F` | 160 | shadow OAM (40×4) |
| `$C0A0-$C0FF` | 96 | UNUSED |
| `$C100-$C12F` | 48 | VBlank column descriptor `{destHi,destLo,32 tile bytes}` |
| `$C130-$C15F` | 48 | 2×2 tile-write queue (6-B records, cursor `$FF9F`) |
| `$C160-$C1BF` | 96 | column-build VRAM-script buffer (`00:1136`) |
| `$C1C0-$C1E7` | 40 | death/explosion particles, 8×5 B (seed ROM `0:$2AD7`) |
| `$C1E8-$C267` | 128 | **map-object array**, 8×16 B (§5.1) |
| `$C268-$C367` | 256 | **enemy array**, 8×32 B (§5.2) |
| `$C368-$C4AF` | 328 | **metatile definition table**, ≤82 × 4 tile ids (levels 5-8 use all 328 B — `$C4A7-$C4AF` is NOT free) |
| `$C4B0-$C4CA` | 27 | batarang pool, 3×9 B (indexed `$C4A7+9*(n+1)`, n=0..2) |
| `$C4CB-$C58A` | 192 | generated 64-B copier (code) |
| `$C58B-$C5CA` | 64 | player-anim tile staging (4 tiles) |
| `$C5CB-$C5EB` | 33 | BG-anim row buffer (32 used) |
| `$C5EF-$C606` | 24 | bat-rope segments, 6×4 B `{Xhi,Xlo,Yhi,Ylo}` (slot 0 at `$C5EB` never used) |
| `$C60B-$C61A` | 16 | gate/door debris, 4×4 B |
| `$C61B-$C67A` | 96 | VRAM-script staging (VBlank-drained) |
| `$C67B-$C692` | 24 | delayed tile-restore timers, 8×3 B `{timer,Xhi,Yhi}` |
| `$C693-$C6CE` | 60 | effect/pickup slots, 10×6 B `{sprite,Xhi,Xlo,Yhi,Ylo,sub}` (`$0CC2`) |
| `$C6CF-$C6EE` | 32 | ballistic objects, 4×8 B (`$0CF3`; gravity −3/f, cap −96, pos−=vel) |
| `$C6EF-$C6FA` | 12 | type-`$17` markers, 4×3 B |
| `$C6FB-$C702` | 8 | sound command ring, 4×2 B `{id,cmdmask}` |
| `$C703` | 1 | current ROM bank shadow |
| `$C704-$C709` | 6 | UNUSED |
| `$C70A-$C767` | 94 | game-state block (§3.1) |
| `$C768-$C7FF` | 152 | UNUSED (largest free block) |
| `$C800-$C94C` | 333 | sound-driver RAM (§8) |
| `$C94D-$CFFF` | — | stack (top `$CFFF`) |
| `$D000-$DFFF` | 4096 | level map: `$D000 + (Xhi<<5) + (Yhi&$0F)*2` = `{metatileId, collisionByte}`, column-major, 16 rows, ≤128 cols |

### Game-state block `$C70A-$C767` (high-confidence entries)

| addr | meaning |
|---|---|
| `$C70A/$C70B` | water-surface world Y (level 1/2 subsystem) |
| `$C712` | multi-purpose: menu cursor / death countdown / route cursor |
| `$C713` | in-level cutscene phase; on menus: START/CONTINUE flag & sound-test BCD number |
| `$C714` | **invulnerability timer** (`$5A`=90f; bit7 = knockback-left) |
| `$C715` | death-sequence active |
| `$C716` | pause flag |
| `$C717/$C718` | column-streaming counter/cursor |
| `$C71D` | attack pose (1=batarang, 0=punch) |
| `$C71E` | **player action state**: 0 free / 1 rope-fire / 2 rope-flight / 3 rope-anchored |
| `$C71F` | rope length counter |
| `$C723/$C724` | last frame's platform-carry delta |
| `$C72B` | collision-probe mode (1 horiz, 3 up, 4 down, 5 punch) |
| `$C72C` | boss projectile template selector (1..5) |
| `$C72E` | boss sub-state |
| `$C72F/$C730` | pending platform X/Y carry displacement |
| `$C732` | camera clamp (from `0:$103F`; camXmax = `$C732`−5) |
| `$C733-$C735` | door/gate sequencer + position |
| `$C737-$C73A` | scripted-move state |
| `$C73D` | boss phase counter |
| `$C73E` | **level sub-type / boss id** (low nibble of `0:$1015`; 1-4 = bosses, 5 = level-6 vehicle) |
| `$C73F/$C741` | level event flag / timer |
| `$C740` | cutscene lock (`$FF` = normal play) |
| `$C742/$C743` | parallax SCX values (raster modes 2/3) |
| `$C744-$C74D` | spawn staging for `$0CC2` / `$0CF3` |
| `$C750` | boss-mode flag (level `$0E`: reroutes enemy loop to `1:77BD`, disables pause) |
| `$C751` | super-jump armed (jump vel `$32` instead of `$22`) |
| `$C753` | **route-progress bitmask** (b0=route1/L4, b1=route2/L8, b2=route3/L11; `==$07` → warp to L12). Survives game over (boot only wipes HRAM+`$D000`) |
| `$C754` | max-HP-pickup-taken bits (levels 3/5/13) |
| `$C755` | water-surface screen Y (raster mode 6 stop line; also → WY) |
| `$C756` | **difficulty** 0/1/2 (default 1) |
| `$C757` | lag-frame flag |
| `$C759` | **batarang ammo** (no cap — wraps past 255) |
| `$C75A` | current `$C1E8` slot index |
| `$C75C` | hidden rescue-helper cheat flag (title: B+Select+Left) |
| `$C763-$C766` | raster fraction accumulators / palette-cycle counters |
| `$C767` | **lives** (init 5; 0 → `JP $0150` = game over) |

### HRAM (final; see §4 for the player block)

| addr | meaning |
|---|---|
| `$FF80-$FF98` | player block (§4). `$FF80` reused as sound-test cursor on the options screen |
| `$FF99/$FF9A` | player-tile transfer dest **HI**/LO (0 = idle) |
| `$FF9B/$FF9C` | BG-anim row transfer dest **HI**/LO |
| `$FF9D` | shadow-OAM cursor (0..$A0) |
| `$FF9E` | metasprite attr OR-mask |
| `$FF9F` | 2×2-queue cursor |
| `$FFA0` | VRAM-script-pending flag |
| `$FFA1` | sound-queue read index |
| `$FFA2-$FFA5` | **camera X hi/lo, Y hi/lo** (12.4) |
| `$FFA6` | prev camera-X-lo (streaming edge detect) |
| `$FFA7` | **frame parity** (XOR 1 every VBlank; flips enemy-loop direction, gates odd/even work) |
| `$FFA9/$FFAA` | SCX/SCY shadows |
| `$FFAB-$FFAF` | WX/WY/BGP/OBP0/OBP1 shadows (pushed in VBlank) |
| `$FFB0` | **level number, 1-based** (most-read var in ROM) |
| `$FFB1` | frame counter |
| `$FFB2` | wall-cling lock (b0-4 countdown, b5-7 locked dpad dir) |
| `$FFB3` | enemy-loop cursor |
| `$FFB4` | bat-rope segment counter |
| `$FFB5` | continue-available flag |
| `$FFB6-$FFB9` | collision-probe result coords |
| `$FFBA-$FFBD` | secondary object world pos (boss/vehicle) |
| `$FFC0/$FFC1` | probe metatile col/row |
| `$FFC2` | jump-button-released (wall-jump enable) |
| `$FFC3-$FFC5` | player anim id / frame / prev id |
| `$FFC7` | raster mode 0-7 |
| `$FFC8-$FFCC` | parallax state; `$FFCC` = mode-0 SCX |
| `$FFCD-$FFD0` | boss coordinate quad |
| `$FFD2/$FFD3` | sound cmd mask / id (Timer ISR → driver) |
| `$FFD4-$FFD6, $FFD8-$FFDD` | sound-driver private (§8) |
| `$FFE1/$FFE2` | buttons held / newly pressed |
| `$FFE7` | VBlank handshake |
| `$FFE8` | saved rIE across LCD-off |
| `$FFEA` | sound-tick re-entrancy guard |
| `$FFF0-$FFF9` | OAM-DMA stub (code) |

Joypad bits: 0=A 1=B 2=Select 3=Start 4=Right 5=Left 6=Up 7=Down.
A=jump, B=punch/batarang, Up=bat-rope, Down=low throw arc, Start=pause.

---

## 4. PLAYER

World coordinates: **12.4 fixed point** (16 units = 1 px), stored **hi byte
first**. X hi = metatile column; Y hi = metatile row (`&$0F` for map lookup);
Y hi in play runs `$10-$20`, `$21` = death pit (`$1B` on level `$0B`), `<$11` =
top exit.

| addr | field | notes |
|---|---|---|
| `$FF80` | AirState | 0 grounded, 1 rising, 2 falling |
| `$FF81/82` | PosX hi/lo | 12.4 |
| `$FF83/84` | PosY hi/lo | 12.4 |
| `$FF86` | VelX | signed, 1/16 px/frame |
| `$FF87` | VelY | signed, **positive = up** (`Y -= VelY`) |
| `$FF88` | Facing | 0 right, 1 left |
| `$FF89` | anim sub-timer | |
| `$FF8A` | **HP** | |
| `$FF8B` | metasprite select (`Facing XOR 1`) | |
| `$FF8C/8D` | hitbox half-width/height | init $0F/$10; re-read per anim from `0:$27A8` |
| `$FF8E` | **max HP** (init 10, cap 16) | |
| `$FF8F` | turn-around timer ($0F) | |
| `$FF90` | landing-squat timer ($10) | |
| `$FF93/94` | screen X/Y (OAM coords) | |
| `$FF95` | slow/water mode ($80) — halves speed & gravity | |
| `$FF96` | OAM attr mask ($80 = behind BG, set by water) | |
| `$FF97` | attack anim counter (1-15 ring; ==8 fires punch test) | |
| `$FF98` | air-control throttle | |

Physics constants (ROM file offsets — the canonical tunables list is §10):
jump vel `$22`, spring `$32`, wall-jump Y `$22` / X `±$14`; gravity rising
1 (A held) / 2 (released), falling 3; terminal `−$42` ($BE); walk max
±`$18` (1.5 px/f); water: speed ±8, gravity 2 (1 frame in 8), terminal −12.

Abilities: walk (turn-stall 15f), variable-height jump, wall-cling (requires A
released then re-held mid-air; 16-frame lock `$FFB2`), wall-jump, punch
(2 dmg, ~3 % crit window `(rLY^frame)<8` → full-HP crit), batarang (needs ammo,
3 in flight, speed `$50`, 1 dmg, Up/Down modify arc), bat-rope (Up: 5 segments,
states `$C71E` 1→2→3, climb/swing), knockback (X ±$10, Y $18), 90 i-frames.
No crouch, no double jump.

Damage sources: enemy contact = `1:$6BC1[state]` (+`1:$6BCE[level]` bonus if
b7), object contact 2, spikes 4, water drain 1 (difficulty ≥1).
Death: `$C715=1`, 120-frame particle sequence, lives−−, →round select (full HP)
or `JP $0150` game over.

---

## 5. ACTOR SYSTEMS

Both arrays preloaded whole at level init from bank-5 blobs that are
**byte-identical images of the RAM records** (no streaming spawner).

### 5.1 `$C1E8` map objects — 8 × 16 B — driver `1:4230`, dispatch `1:$427B` (11 entries)

| off | field |
|---|---|
| +0 | type 1..11 (0 empty; b7 = on-screen). Handlers: `488D 48E4 499B 4940 4291 42E3 4447 4525 464F 4765 483C` |
| +1/+2, +3/+4 | X, Y world 12.4 (hi,lo) |
| +5 | X velocity (UNCONFIRMED) |
| +6 | Y velocity (ramps +1/f, cap $30) |
| +7 | flags; b0 = hurts player (2 dmg) |
| +$0B | state timer |
| +$0D | player-riding flag → adds delta into `$C72F/$C730` |

Activation half-width table `1:$4BA5` (11 B); **type 11 reads 1 byte past the
end** (`$FA` = first opcode of `sub_01_4BB0`) → always active; live on level 6.
Types 2 and 10 never placed in shipped data (dead handlers).
Placed objects: platforms, conveyors, doors (writes metatiles `$3E-$41` +
collision `(slot<<5)|$1F`), the level-6 vehicle, bat-rope anchors.

### 5.2 `$C268` enemies — 8 × 32 B — driver `1:4E0C`

Loop: alternates ascending/descending by frame parity `$FFA7`; level `$0E`
reroutes to `1:77BD`. Inactive slots run the activation check `1:6094`
(`|camXhi+5 − Xhi| < 7`, b6 = permanently disabled). Despawn when
`|camXhi+5 − Xhi| ≥ 9` or Yhi ≥ `$21`.

| off | field |
|---|---|
| +0 | flags: b7 active, b6 disabled, b4/b3 hit-state, b2 hit-flash, b1/b0 misc |
| +1 | always 0 in ROM data |
| **+2** | **STATE = enemy type 1..13** → primary dispatch **`1:$50D3`** |
| +3/+4 | speed/period pair (per-instance on L5) — UNCONFIRMED semantics |
| +5 | facing (b0; knockback dir) |
| +6 | kill latch (non-zero → death FX) |
| +7/+8 | screen X/Y (recomputed) |
| +$0A-$0D | hitbox half-w pair / half-h pair |
| +$0E/$0F, +$10/$11 | X, Y world 12.4 |
| +$14 | state timer |
| +$16 | **HP** |
| +$17 | hit-flash/stun timer ($3C) |
| +$1A-$1F | anchor pos / patrol limits / gfx variant — UNCONFIRMED |

**Primary dispatch `1:$50D3`** (13 entries, on `state−1`):

| st | handler | role | | st | handler | role |
|---|---|---|---|---|---|---|
| 1 | `50ED` | walker (L1-3) | | 8 | `7061` | **BOSS 3** (L11) |
| 2 | `5399` | walker+jump (L5,7,13) | | 9 | `7288` | **BOSS 4 Joker** (L14) |
| 3 | `55AA` | flyer (L9,10) | | 10 | `7591` | **BOSS 1** (L4) |
| 4 | `7750` | L14 chaser | | 11 | `59E0` | boss projectile |
| 5 | `575C` | L6 vehicle target | | 12 | `5B95` | dying/despawn |
| 6 | `57D6` | L12 enemy | | 13 | `78A7` | boss-2 parts |
| 7 | `6D8A` | **BOSS 2** (L8) | | | | |

**Secondary dispatch `1:$60EF`** (12 entries, entered from `1:4F1B`/`1:5044`
only when hit-state flag bits are set) = the hit-reaction/stunned variants.
It is NOT the type dispatch.

Roster stats: walkers HP 4-6, flyers HP 8, contact dmg mostly 2
(full tables: dmg `1:$6BC1` = `00 02 02 02 00 00 00 01 02 01 02 81 00`,
level bonus `1:$6BCE` = `0×11, 3, 1, 1`). Boss HP: L4 `$20`, L8 `$1C`,
L11 `$1C`, L14 `$30`+`$20` (chaser); +5 on difficulty 2. Boss projectiles:
templates `1:$6CEA+$20*n` (5), copied into slot 6, HP `$FF`.

---

## 6. LEVEL DATA

### 6.1 Maps (bank 3) — **no compression anywhere in the game**

`3:$4000`: **14** LE pointers (words 15/16 seen in old dumps are level-1 map
bytes). Blob = `{width, width×16 metatile ids, column-major, row 0 = top}`.
Loader `00:0C34` writes 2 B per metatile into `$D000`: the raw id, then
`collisionLUT[id]` from the per-level LUT at `3:$7A2A + (lvl-1)*2`
(LUTs: `$7A46` L1-2, `$7A96` L3-4, `$7AE2` L5-8, `$7B34` L9, `$7B77` L10-11,
`$7BB6` L12-14).

Widths: 128, 33, 114, 12, 82, 18, 82, 12, 128, 98, 13, 98, 98, 12.
(`0:$103F` is the *camera clamp*, ≈ width−1 — not the width.)
All levels are 16 metatiles (256 px) tall; only horizontal streaming exists.
Levels 2 and 6 are vertical (exit through the top).

### 6.2 Metatiles (bank 5)

`5:$4000`: 14 × `{len16, src16}` → memcpy to `$C368`. Entry = **4 tile ids,
column-major** (TL, BL, TR, BR). Groups: L1-2 81 tiles, L3-4 76, L5-8 82,
L9 66, L10-11 62, L12-14 66. Quirk: L9-14 reference id `len/4` (one past the
end) → 4 stale RAM bytes as graphics; collision is defined; renders blank in
the extractor (UNCONFIRMED on hardware).

### 6.3 Collision byte

bits 7-5 = owning `$C1E8` slot (type-`$1F` cells only); bits 4-0 = type.

| val | meaning | | val | meaning |
|---|---|---|---|---|
| $00 | air | | $07 | solid (also invisible wall) |
| $01 | solid | | $08 | **water** (passable; sets `$FF96=$80`, slow mode) |
| $02/$03 | solid conveyor R/L (`$C72F=±4`) | | $1F | door / actor-owned destructible |
| $04 | level-exit trigger | | $20/$21/$22 | pickup: +6 HP / +10 batarangs / +2 max HP |
| $05 | trigger (horiz probe), solid to floor | | $FD | spikes (4 dmg; doesn't stop a fall) |
| $06 | **breakable** (→ solid + restore timer `$C67B`: 64/12/4 frames by difficulty) | | $FF | solid (runtime-written) |

### 6.4 Collision probes

`sub_00_20BA(BC=Yoff, DE=Xoff, [$C72B]=mode)` → 0 or the collision byte;
mode 1 = horizontal sweep over hitbox height, 3 = ceiling, 4 = floor,
5 = punch (ignores water). Floor/ceiling/horizontal dispatchers:
`$1DB9` / `$1EA6` / `$1EF9`; pickups route to `1:4D4E`.

**Slopes**: on floor/ceiling hit, the *graphic* id of the neighbouring cell
selects a 16-entry sub-tile height table indexed by sub-tile X (`$FFBC`):
L1-2 ids `$29,$2C,$2E,$31,$32,$34,$36`; L12-14 ids `$3E,$3F`;
Y-tables `0:$221C-$227B`, X-snap tables `0:$23B8-$2408` (values in 1/16 px).
Levels 3-$0B have no slopes.

### 6.5 Per-level tables (all 14 entries)

| table | contents |
|---|---|
| `0:$1015` | b7 = reset player physics on entry; low nibble → `$C73E` (1-4 bosses, 5 vehicle) |
| `0:$1023` / `0:$1031` | BGM id fresh / re-entry ($FF = keep). Values `02 02 02 06 03 03 03 06 04 04 06 05 05 07` |
| `0:$103F` | camera clamp → `$C732` |
| `0:$286D` | 14 × `{exitRight, exitTop}` level-transition graph (`$FE` = teleport-fall no-exit) |
| `1:$7C7D` | 14 × 8 resource ids for `$0B15` ($FF-terminated) |
| `1:$7CED` | player start `{Xhi, Yhi}` (`$FF82=$80`) |
| `5:$46EC` / `5:$4716` | `{src, count}` enemy (×32 B) / object (×16 B) spawn blobs |
| `3:$7BF9` | stage-name VRAM scripts (length-prefixed) |
| `2:$61A4` / `0:$31EE` / `0:$3246` / `0:$3295` | BG tile-animation src / dest / sequence / length (L1-3,5-7,12-13 only) |

### 6.6 Camera & streaming

Camera: X lead 5 metatiles, left clamp 6, right clamp `$C732`−5; Y window
tests `$15/$1D`, clamps `$10/$18`. Column streaming (`00:1287`): every 8 px of
camera X (bit 7 of `$FFA3` flips), queue one 32-byte BG column — lead +$16
tiles ahead / trail −4 behind. Level entry builds 18 columns via `$C160`
scripts.

---

## 7. GRAPHICS PIPELINE

### 7.1 VRAM layout — `rLCDC = $E7` at every write site

BG/window tile data = **SIGNED `$8800` region** (bit4=0):
`tileAddr(n) = n < $80 ? $9000+n*16 : $8800+(n-$80)*16`.
OBJ = `$8000`, **8×16 always** (tile `&$FE` top, `|$01` bottom).
BG map `$9800`; window map `$9C00`, window enabled, WX=7 (x=0), WY=`$FFAC`.
Tile `$2F` = blank fill. Font: tiles `$80-$89` = 0-9, `$8A-$A3` = A-Z.

### 7.2 Tile resources

`0:$0B43`: 36 × `{bank, ptr}` → 4-B header `{dest16, len16}` + raw 2bpp bytes
(**plain memcpy — no decompressor exists in the ROM**). 33 valid entries;
`$0E/$17/$18` unused. Per-level load lists at `1:$7C7D`. Player anim tiles
live outside this table in bank 2 (§7.4).

### 7.3 Metasprites

Tables `5:$5F5C` (243 ptrs, default) and `5:$736B` (105 ptrs, used for enemies
on levels `$04/$0B/$0E`). Entry = N × 4-B OAM records `{dy, dx, tile, attr}`,
`$FF`-terminated; attr OR'd with `$FF9E`. Draw = `sub_00_0BC6` / `$0BAF`:
append at shadow-OAM cursor `$FF9D`, hard cap 40 sprites, overflow silently
dropped, no sorting — OAM order = call order.

### 7.4 Player animation

Player = fixed 6-sprite 24×32 metasprite (index 0 = left, 1 = right) using OBJ
tiles `$00-$0B`, which are **re-streamed from bank 2** whenever anim id/frame
changes: `2:$4D8C` = 31 × 24 B (3 columns × 4 tile ptrs into `2:$5074+`),
streamed one 4-tile column per frame (3 frames to fully repaint).
Anim → hitbox table `0:$27A8` (31 × `{halfW, halfH}`).
Invulnerability blink: skip draw when `$C714 & $08 == 0`.

### 7.5 HUD

In-game HUD = energy bar only, drawn as metasprites first each frame
(`$0F7B`): ms1 `$81-$86` = 0-10 HP in 5 segments; second bar at max-HP > 10
via tables `0:$100C/$100E/$1011`. Lives are shown only on menu/intro screens.
(`sub_00_0F39` is the level-music selector, not HUD.)

### 7.6 VRAM script interpreter `sub_00_0A0E`

Records: `{destHi, destLo (BIG-endian), ctrl}`; ctrl = mode(2)<<6 | count(6);
modes: 0 copy-horiz, 1 RLE-horiz, 2 copy-vert (+$20), 3 RLE-vert. Terminator
`$00`. Drives every menu screen, stage intros, ending text (`7:$7960`).

---

## 8. SOUND ENGINE (bank 7)

Full opcode semantics, channel-state layout, driver walkthrough and song
decode proofs: the tables in this section are complete; `tools/dumpsong.py`
implements them and round-trips all 47 songs.

* Tick: Timer IRQ, **59.36 Hz** (`4096/69`). All durations are ticks. No tempo
  command — tempo mod = change the tick rate.
* 8 track slots × 36 B at `$C82D` (music = slots 0-3, SFX = slots 4-7).
  Per-track: seq ptr, FIXDUR, duration/gate counters, transpose, detune
  (unsigned, bias `$80`), freq word, pitch envelope (delay+ptr), volume
  envelope (ptr), duty, vibrato delta, pan byte, wave ptr, release envelope,
  1-deep CALL return, 2 loop counters. Channel ownership `$C800-$C803` =
  `track+1`; higher track index wins → SFX pre-empt music, music resumes on
  SFX `END`.
* Song table `7:$477D`, **47 entries**; header = `{slot, hwchan, ptr16}`*,
  `$FF`-terminated. Sequence bytes `<$C8` = notes (pitch table `7:$46D5`,
  84 × LE16 biased −$80, exact 12-TET C2-B8; noise channel takes the byte as
  raw NR43). Bytes `≥$C8` = 56 opcodes via `7:$43CE`: channel-mask ops, 4 drum
  presets, 6 slide presets, pitch/volume envelope control, legato, tie, rest,
  duty, pan, vibrato, detune, transpose, FIXDUR, CALL/RET/JUMP/2 loops,
  wave-table upload, END.
* Command mailbox: `sub_00_0AE1(B=id, C=mask)` → 4×2-B ring `$C6FB`; Timer ISR
  consumes 1/tick. Masks: `$01` play, `$02` stop-all, `$04` fade out, `$08`
  fade in (never used). Music requests use `$03`.
* Song ids: `$00` title, `$01` round select, `$02-$05` stage themes A-D,
  `$06` boss, `$07` final, `$08` clear, `$09` death, `$0A` ending, `$2E` game
  over; `$0B-$2D` SFX (jump `$0F`, attack `$10`, hurt `$12`, pickups
  `$13-$16`, break `$17`, crit `$18`, enemy hit `$19`, enemy die `$21`, …).

**Quirks that SIMPLIFY a JS port** (all proven): length counters never enabled
(NRx1 rewritten every tick), sweep off forever (NR10=$08 once), no zombie
envelopes (NRx2 writes always accompany a retrigger), silence is emergent
(unowned channels get NRx2=0 each tick), wave channel is inherently legato
(retriggers only on waveform re-upload), only ONE waveform in the whole game
(`7:$47FA`). Hazards: FIXDUR makes the stream context-sensitive; `RET` at
depth 0 is a fall-through no-op; active envelope pointers are stored
big-endian; pitch envelopes clamp at the LO byte, vibrato carries into HI;
track-start deliberately does NOT clear duty/pan/gate/wave/envelope pointers
(state inheritance across songs — UNCONFIRMED whether audible).

---

## 9. GAME FLOW

### 9.1 State machine

boot `$0150` → copyright → title `$02C4` (START/OPTION; hidden cheat
B+Select+Left → `$C75C=1`) → round select `$035B` (route 0-2, CONTINUE if
`$FFB5`) → level init `$04BB` → main loop `$0567` → transitions:
walk off right edge (`Xhi ≥ $C732`) or top (`Yhi < $11`) → `$2820` reads
`0:$286D[(lvl-1)*2 + edge]` → next level in place. Level-clear sequencer
`$34D0`; route dispatch `$35E8` sets `$C753` bits (L4/L8/L11) → back to round
select, or all-3-cleared → level `$0C`. L14 → ending `$3652`. Death `$29E7`
(120 f) → lives−− → round select (full HP; on a boss level, restart one level
earlier) or game over → `JP $0150` (wipes HRAM + `$D000` only — `$C753`
route progress survives). Options screen `$3893`: difficulty (`$C756`) +
**sound test** (the DAA/BCD code is the sound-test number display, not a stage
select). No password, no attract mode, no score.

### 9.2 Route graph

```
round select ── route1: 1→2→3→4[B1]  ──┐ (b0)
             ── route2: 5→6→7→8[B2]  ──┤ (b1)   $C753==$07 → 12(C)→13(D)→14[JOKER]→ending
             ── route3: 9→A→B[B3]    ──┘ (b2)
```

Continue on a boss level restarts on the preceding level. Level `$0E` (14) is
the two-phase final fight (`$C750=1`, pause disabled, easy difficulty disables
the second entity).

---

## 10. TUNABLE CONSTANTS (mod surface)

File offsets are patch bytes in the ROM; in the JS port each becomes a named
parameter. This is the canonical list (verified subset of recon-2 §3 +
recon-5 §6/§7).

### Player physics
| param | value | ROM site |
|---|---|---|
| jumpVelocity | $22 | `$01A4E` |
| springJumpVelocity | $32 | `$01A4A` |
| wallJumpVelocityY | $22 | `$01DA9` |
| wallJumpVelocityX | +$14/−$14 | `$027A6/7` |
| gravityRisingHeld / Released | 1 / 2 | `$01A7D` / `$01A79` |
| gravityFalling | 3 | `$01AF4` |
| terminalVelocity | $BE (−66) | `$01AFB` |
| walkSpeedMax R/L | $18/$E8 | `$01D4C` / `$01D7B` |
| waterSpeed R/L, gravity, terminal | 8/−8, 2, −12 | `$01D48/$01D77/$01AF0/$01AFF` |
| overspeedDecel step | 2 | `$01D6A/$01D99` |
| turnAroundFrames | $0F | `$0187B/$018B6` |
| landingSquatFrames | $10 | `$01B3E` |
| wallClingLock L/R | $50/$30 | `$01F57` / `$02010` |
| hitboxHalfW/H | $0F/$10 | `$0052D` / `$00531` |
| knockbackX / Y | ±$10 / $18 | `$01791/5` / `$017B3` |
| ropeSegments | 5 | `$0195E` |
| batarangSpeed | $50 | `$019F7` |
| batarangPoolSize | 3 | `$019AA` region |

### Health / damage / economy
| param | value | ROM site |
|---|---|---|
| startingMaxHP | $0A | `$00201` |
| startingLives | 5 | `$00207` |
| maxHPCap | $10 | `$04D6F` |
| pickupEnergy / Batarangs / MaxHP | 6 / 10 / 2 | `$04DB6` / `$04DA0` / `$04D69` |
| invulnFrames | $5A (90) | `$015F0,$015F4,$01E2B,$01E2F,$02E93,$067B2,$067B6` |
| meleeDamage | 2 | `$026F1` |
| critWindow | 8 (≈3 %) | `$026D4` |
| batarangDamage | 1 (DEC) | `$03D0B` |
| enemyStunFrames | $3C | `$026CB,$03D05` |
| objectContactDamage | 2 | `$015E6` |
| spikeDamage | 4 | `$01E21` |
| waterDrain | 1 | `$02E8E` |
| enemyContactDamage[13] | table | `$06BC1` |
| levelDamageBonus[14] | table | `$06BCE` |
| bossHPBonusHard | 5 | `$00D84` |
| deathSequenceFrames | $78 | `$02A01` |

### World / camera / enemies
| param | value | ROM site |
|---|---|---|
| cameraLeadX / clampL | 5 / 6 | `$01052+` / `$0105C` |
| cameraYWindow | $15/$10/$1D/$18 | `$01083-$01093` |
| enemyActivationRange | 7 | `$060AA` |
| enemyDespawnRange | 9 | `$011B1` |
| deathPitRow | $21 ($1B on L$0B) | `$01765` / `$0175E` |
| startingLevel | 1 | `$001FD` |
| soundTickTMA | $BB (59.36 Hz) | `$00249` |
| enemy records (state/HP/hitbox/pos) | per level | `5:$4740-$5166` (file `$14740+`) |
| object records | per level | `5:$4E80-$5140` |
| boss HP | $20/$1C/$1C/$30+$20 | file `$150E6/$15106/$15126/$15146/$15166` |
| level exits | 28 B | `$0286D` |
| route entry levels | 1/5/9/$0C | `$004B3/B7/AF/AB` |
| palettes BGP/OBP | $E4/$E4/$C4 | `0:29B9` + fade ramps `$00B09/$00B11` |

---

## 11. FREE SPACE & HIDDEN CONTENT

* Hidden cheat: title-screen **B+Select+Left** → `$C75C=1` → during boss
  fights with HP<3 and boss HP≥$10, a rescue helper spawns a pickup
  (state machine `0:$3050-$3126`).
* Dead: `$FF85` (write-only), unreachable hazard code `1:$7D59` + table
  `1:$7F02` (cut level?), map-object types 2/10 (handlers exist, never
  placed), wave table `7:$47EA`, resource slots `$0E/$17/$18`, fade-in sound
  command, `$FFD4` status latch.
* Free ROM: `0:$0061-$00FF` (159 B), `1:$7F29` (215 B), `3:$7F58` (168 B),
  `4:$7F24` (220 B), `5:$44AC`/`5:$7F8D`, `6:$7F29`.
* Free RAM: `$C768-$C7FF` (152 B), `$C0A0-$C0FF` (96 B), `$C704-$C709`,
  ~23 B of HRAM. (Irrelevant to the JS port, relevant only if we ever patch
  the ROM.)

---

## 12. RESIDUAL UNCONFIRMED ITEMS

| item | impact | settled by |
|---|---|---|
| `$C1E8+5` = X velocity | low | oracle write-watch |
| `$C268 +3/+4, +$1A-$1F` field semantics | medium (enemy fidelity) | oracle trace of L5 flyer / boss |
| L9-14 out-of-range metatile appearance on hardware | cosmetic | oracle VRAM dump |
| sound state inheritance across song starts audible? | low | oracle register diff |
| meanings of SFX ids `$1A,$1B,$1C,$1E-$20,$24,$27-$2D` | naming only | play each call site |
| enemy state 13 ever reaches `1:$60EF` (would jump into data) | low | oracle JP-HL log |
| bat-rope anchor accept test exact branch | medium (mod #grapple) | oracle `$C71E` 1→2 trace |
| exact 1-row shear of the L9/`$0A` column transfer (writes rows 9-31 from source bytes 8-30) | cosmetic | oracle |

---

## Appendix A — ADJUDICATION LOG

All verdicts re-verified against the ROM/disassembly on 2026-07-26, not taken
on seniority.

| # | claim | recon-1 (or earlier) | later position | VERDICT | evidence checked |
|---|---|---|---|---|---|
| 1 | `1:$4E0C` | player state machine | enemy-array loop (recon-2) | **enemy loop** | `1:4E1A`: `SWAP A / ADD A,A` = ×32, base `$C268`, `CP $08` at `1:60D7`, direction flips on `$FFA7`. Player logic is bank-0 inline (~`$1600-$2100`) |
| 2 | BG tile region | `$8000` | signed `$8800` (recon-3) | **signed `$8800`** | `LD A,$E7 / LDH [rLCDC]` at `00:0261` (and all 12 sites); $E7 bit4=0. Recon-3's renderer only matched with signed ids |
| 3 | enemy type field & dispatch | `+1` subtype, dispatch `1:$60EF` (recon-2) | `+2` state, dispatch `1:$50D3` (recon-5) | **recon-5** | `1:50C3-50D2`: reads slot+2, 13-entry table at `$50D3` (bytes verified: `50ED 5399 55AA 7750 575C 57D6 6D8A 7061 7288 7591 59E0 5B95 78A7`). `$60EF` entered only from `1:4F1B`/`1:5044` = hit-reaction path |
| 4 | `$C4A7-$C4AF` | free RAM / phantom batarang slot (recon-2) | tail of `$C368` metatile table (recon-3) | **recon-3** | `5:$4000` table: L5-8 len = `$0148` = 328 B = 82 entries; `$C368+328 = $C4B0` exactly |
| 5 | `7:$7960-$7FFF` | music data | VRAM script (recon-4) | **recon-4** | `00:3751-375B`: bank 7, `LD DE,$7960; CALL $0A0E` (ending text) |
| 6 | `$FFA7` | level-type flag | frame parity (recon-2) | **frame parity** | `00:07FC`: `XOR $01` every VBlank; consumed at `1:4E13`/`1:60C7` to flip loop direction |
| 7 | `$0F39` / `$0F7B` | `$0F39` = HUD tile select from `$1023/$1031`; `$0F7B` = HUD lives+energy | recon-3/4 | **`$0F39` = level-MUSIC selector** (reads `$1023/$1031` = BGM ids, calls SoundRequest cmd 3); **`$0F7B` = energy bar only**, no lives in-game | code read at `00:0F39-0FA0` |
| 8 | `3:$4000` entries | 16 pointers | 14 (recon-5) | **14** | words 15/16 = `$4F80/$4F4F` are level-1 map bytes; level-1 data starts at `$401C`, all 14 blobs contiguous to `$7A2A` |
| 9 | level map loading | "RLE-expands" | plain copy + collision translate (recon-3) | **no compression** | `00:0C52` loop: raw byte + LUT byte, nothing else; no decompressor exists anywhere |
| 10 | VBlank column transfer | 18 (or 9) tile bytes | 32 tiles (recon-3) | **32 writes** | counted 32 unrolled `LD A,[DE]/LD (HL),A/ADD HL,BC` units from `$068F`; L9/`$0A` path skips 9 writes, source +8 |
| 11 | VBlank row transfer | 33 bytes | 32 bytes / 2 tiles (recon-3) | **32 bytes** | 16 writes + `INC DE` + 16 writes from `$C5CB` |
| 12 | `$FF99/$FF9B` | dest LOW bytes | dest HIGH bytes (recon-3) | **HIGH** | `00:074E`: `A=[$FF9B] → D`; `00:07BC`: `A=[$FF99] → D` |
| 13 | `sub_00_0D50` | "InitRasterMode from table `$1015`" | recon-3/5 | **zeroes `$FFC7`; `$1015` low nibble → `$C73E` (boss id); raster modes armed by level-number branches later in the same routine** | code read at `00:0D50-0EEA` |
| 14 | recon-5 "width" column | — | claimed `$103F` = width | **`$103F` = camera clamp**; real widths come from the map blob byte (128,33,114,12,82,18,82,12,128,98,13,98,98,12) | both read from ROM |
| 15 | BCD/DAA menu | "hidden stage select" (recon-2) | sound test (recon-5) | **sound test** on the normal OPTION screen; the played id is binary `$FF80`, the BCD `$C713` is only the displayed number | `00:3937-3947` |
| 16 | song table size | ≥24 | 47 (recon-4) | **47** | `$477D + 47*2 = $47DB` = envelope data start; sound test exposes `$00-$2E` |
| 17 | `0:$7C44/$7C5C/$7C7D/$7CED` bank attribution | bank 0 | bank 1 (recon-5) | **bank 1** (file offsets identical, so no practical impact) | addresses ≥ `$4000` |
