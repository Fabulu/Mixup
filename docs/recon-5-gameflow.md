# RECON-5 - GAME FLOW, LEVEL PROGRESSION & MOD SURFACE

ROM: `Batman - Return of the Joker (USA, Europe).gb` (128 KB, MBC1).
Builds on `docs/recon-1-architecture.md` and `docs/recon-2-ram-map.md`.
Static analysis only; every claim below is backed by a cited address.
Anything not proven twice is marked **UNCONFIRMED** with the test that settles it.

Listings used: `disasm2/bank_XX.asm` (bank-aware; regenerate with
`python tools/banktrace.py "<rom>" --jt --outdir disasm2`).
`tools/show.py` now honours `BATDIS=disasm2`.
New tool: **`tools/leveltables.py`** - dumps every per-level table, all enemy
records and all map-object records (`--enemies --objects --all`).

### Address ↔ file-offset convention used throughout

| bank | file offset of `$A` |
|---|---|
| 0 | `$A` (`$0000-$3FFF`) |
| 1 | `$A` (bank 1 is resident at `$4000-$7FFF`, so file offset == address) |
| 3 | `$0C000 + (A-$4000)` |
| 5 | `$14000 + (A-$4000)` |
| 7 | `$1C000 + (A-$4000)` |

**Correction to recon-1/recon-2:** the tables cited as `0:$7C44`, `0:$7C5C`,
`0:$7C5F/69/73`, `0:$7C7D`, `0:$7CED` are **bank 1** data (`$4000-$7FFF`
window). Bank 0 code reads them because bank 1 is always resident. The file
offsets happen to be identical, so patch tables are unaffected.

---

## 1. TOP-LEVEL STATE MACHINE

There is **no password system** and **no separate game-over screen**. Continue
is `$FFB5` + `$C753`; game over is a jump to the boot vector.

| # | state | entry addr | loop addr | selector var(s) | exit conditions |
|---|---|---|---|---|---|
| 0 | Boot / RAM+HW init | `0:$0100`→`0:$0150` | - | - | falls through to 1. `$0150` is also the **soft-reset** target (A+B+Sel+Start held, `0:$0A55`) and the **game-over** target (`0:$2ABA`) |
| 1 | Sunsoft copyright | `0:$022E` (VRAM script `5:$52F5`) | `0:$0265-$0278` delay | - | timer only → 2 |
| 2 | Sunsoft logo → title build | `0:$027D` (BG clear `$34A4`, script `5:$5170`, text `1:$7C44`) | - | falls through to 3 |
| 3 | **TITLE / main menu** | `0:$027D` | **`0:$02C4`** | `$C712` (0 = START, 1 = OPTION) | `$FFE2==$26` (**B+Select+Left cheat**) → `$C75C=1`, → 4. Up/Down toggles `$C712`. Start with `$C712==0` → 4; Start with `$C712==1` → 6 (`JP $3893`) |
| 4 | Title "press start" flash | `0:$031B` | `0:$031D-$034E` (120 frames) | - | timer → 5 |
| 5 | **ROUND SELECT / CONTINUE** | **`0:$035B`** | **`0:$03DC-$0479`** | `$C712` = route cursor 0..3, `$C713` = 0 START / 1 CONTINUE, `$C753` = route-completion mask, `$FFB5` = continue-available | Start (`$FFE2` bit3, `0:$0477`) → 7. Left/Right cycles `$C712` through *uncleared* routes (`sub_00_0FE6`); Up/Down picks START/CONTINUE (CONTINUE only if `$FFB5!=0`) |
| 6 | **OPTIONS (difficulty + sound test)** | `0:$3893` | **`0:$38D5-$39E1`** | `$C712` = 0 DIFFICULTY / 1 SOUND TEST / 2 EXIT; `$C756` difficulty 0-2; `$C713` BCD sound no. `$01-$46`; `$FF80` = sound-test cursor 0-$2E | Start with `$C712==2` → back to 3 (`0:$3934 JP $02C4`). A with `$C712==1` plays sound `$FF80` |
| 7 | **LEVEL INIT** | **`0:$04BB-$0563`** | - | `$FFB0` = level (set at `0:$04B9` or `0:$0499`) | falls through to 8 |
| 8 | **IN-LEVEL (main loop)** | `0:$0564` | **`0:$0567 … 0:$0650 JP $0567`** | `$C740` cutscene lock, `$C716` pause, `$C715` death, `$C750` boss mode | walk off right edge (`0:$1745`, `C=0`) or top (`0:$1750`, `C=1`) → 9; HP=0 / pit → 11; boss killed → 10 |
| 9 | **Level transition** | `0:$2820` | - | `$286D[(lvl-1)*2 + C]` | new `$FFB0`, re-runs the level loaders in place (no LCD-off screen wipe) → 8. Value `$FE` = *no exit*, teleports player to `Y=$1100`, falling (`0:$285B`) |
| 10 | **Level-clear / boss-clear sequencer** | `1:$793A`/`1:$7959` → `0:$34D0` | `0:$350F`, `0:$3566`, `0:$35D0` (phase = `$C712` 1/2/3) | `$C712` | → `0:$35E8` |
| 10b | **Route-clear dispatch** | **`0:$35E8`** | - | `$FFB0`, `$C753` | L4 → `SET 0`; L8 → `SET 1`; L11 → `SET 2` (`0:$3608/$360F/$3616`); if `$C753==$07` → `$FFB0=$0C`, `JP $04BB` (7); else → 5 (`0:$363A JP $035B`). L14 → 12. Any other level → `0:$3605` `LD C,$01; JP $2820` (9) |
| 11 | **DEATH** | `0:$29E7` (`$C715=1`, `$C712=$78`) | `0:$2A0D-$2A71` particle loop, 120 frames | `$C715`, `$C712` | `0:$2AAD`: `$FFB5=1`, `$C767--`; if 0 → `JP $0150` (**GAME OVER**, state 0); else → 5 |
| 12 | **ENDING** | `0:$3652` | `0:$369A`, `0:$36C1`, `0:$3701`, … | `$C712`, `$FFAC` | multi-page ending: BG clears, resources `$02/$1D/$21/$23`, VRAM scripts `7:$7E09`, `7:$7EAF`, `7:$7F70`, BGP fade table `0:$3A31` (`FF AB 5B 1B`) → eventually state 0/3 |

Notes:

* `$0150` clears **HRAM `$FF80-$FFFE`** and **`$D000-$DFFE`** only
  (`0:$0160-$0179`). `$C000-$CFFF` is *not* cleared, so `$C753`
  (route progress) **survives game over** - but `$C767` (lives=5, `0:$0206`),
  `$C756` (difficulty=1, `0:$01D1`) and `$FFB0` (level=1, `0:$01FC`) are
  re-initialised.
* The title screen has **no attract/demo mode** - `0:$02C4` loops forever.
* Pause: Start toggles `$C716` (`0:$0600-$060A`); `0:$061E`/`0:$063D` call
  `7:$405D`/`7:$4083` to mute/resume. Pause is disabled while `$C750!=0`
  (level `$0E`).

### Menu cursor drawing

`sub_00_0FCC(B=Y, C=X)` draws a blinking cursor whose metasprite id comes from
`0:$3337 + ((frame>>3)&3)` = `19 C9 CA CB`. Cursor positions:
title `(B=$64|$74, C=$28)`, round-select `(B=$6C|$8C, C=$18)`,
options `(B=1:$7C5C[$C712] = $62/$7A/$92, C=$28)`.

---

## 2. LEVEL PROGRESSION

### 2.1 There are exactly **14 levels**

`$FFB0` (HRAM) is the current level, **1-based**, the single most-read variable
in the ROM (65 read sites). Proof of 14:

* `0:$1015` (sub-type), `0:$1023`/`0:$1031` (music), `0:$103F` (width),
  `0:$286D` (exits) are all exactly 14 (or 28) bytes and are butted against the
  next routine/table.
* `3:$4000` level-map pointer table is **14 entries = 28 bytes**; level 1's map
  data begins at `3:$401C`, immediately after the table. (recon-1's "16 entries"
  read two bytes of level-1 map data as pointers 15/16.)
* `5:$46EC` (enemy lists) row 15 aliases `5:$4716` (object lists) row 1.
* `1:$7CED` (player start) row 15 = `E5 7E` - garbage.

### 2.2 The route graph

Three parallel routes are selectable at the round-select screen; each vanishes
from the menu once cleared (`sub_00_0FE6` returns `$FF` for a route whose
`$C753` bit is set). Clearing all three unlocks a fourth, final route.

```
                     ROUND SELECT  (0:$035B / 0:$03DC)
                      $C712 = 0    1     2      3(auto)
                             |     |     |       |
   $FFB0 =                   1     5     9      $0C          (0:$04B3/B7/AF/AB)
                             |     |     |       |
 route 1 (song $02):  1 -> 2 -> 3 -> 4[BOSS]  --> SET 0 in $C753
 route 2 (song $03):  5 -> 6 -> 7 -> 8[BOSS]  --> SET 1 in $C753
 route 3 (song $04):  9 -> A -> B[BOSS]       --> SET 2 in $C753
                                   |
                       $C753 == $07  =>  $FFB0 = $0C, JP $04BB
 route 4 (song $05):  C -> D -> E[FINAL BOSS] --> ENDING (0:$3652)
```

* Route entry levels: `0:$04B3 LD A,$01`, `0:$04B7 LD A,$05`,
  `0:$04AF LD A,$09`, `0:$04AB LD A,$0C`.
* `$C753` bits set at `0:$360F` (L4→b0), `0:$3616` (L8→b1), `0:$3608` (L11→b2),
  stored `0:$361B`; the `CP $07` warp is `0:$361E-$3627`.
* **CONTINUE** (`$C713!=0`, `0:$047C`): restores `$FF8A = $FF8E` (full HP) and,
  if `$FFB0` ∈ {4, 8, `$0B`, `$0E`}, does `DEC A` - i.e. continuing on a boss
  level restarts you on the level before the boss (`0:$0486-$0499`).
* Within a route, advance is by **walking off the right edge** or **off the
  top**, not by a "level clear" flag: `0:$1740` (`PosXhi >= $C732` → `C=0`),
  `0:$174A` (`PosYhi < $11` → `C=1`), both `JP $2820`.

### 2.3 Per-level table decode

`tools/leveltables.py` regenerates this.

| lvl | `$1015` sub | music fresh `$1023` | music cont. `$1031` | width `$103F` | map ptr `3:` | exit R `$286D+0` | exit T `$286D+1` | start X,Y `1:$7CED` | enemies `5:$46EC` | objects `5:$4716` |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | `$80` | 02 | 02 | 127 | `$401C` | 02 | - | 01,12 | `5:$4740` ×6 | `5:$4E80` ×4 |
| 02 | `$00` | 02 | - | 33 | `$481D` | - | 03 | 01,19 | `5:$4800` ×3 | - |
| 03 | `$00` | 02 | - | 113 | `$4A2E` | 04 | - | 01,1E | `5:$4860` ×8 | `5:$4EC0` ×8 |
| 04 | `$81` **BOSS 1** | 06 | 06 | 11 | `$514F` | (05) | - | 01,1E | `5:$50D0` ×1 | - |
| 05 | `$80` | 03 | 03 | 81 | `$5210` | 06 | - | 01,13 | `5:$4960` ×6 | `5:$4F40` ×4 |
| 06 | `$05` (vehicle) | 03 | - | 17 | `$5731` | - | 07 | 01,1D | `5:$4A20` ×1 | `5:$4FA0` ×1 |
| 07 | `$00` | 03 | - | 81 | `$5852` | 08 | - | 01,1D | `5:$4A40` ×6 | `5:$4F80` ×2 |
| 08 | `$82` **BOSS 2** | 06 | 06 | 11 | `$5D73` | - | - | 01,1E | `5:$50F0` ×1 | - |
| 09 | `$80` | 04 | 04 | 127 | `$5E34` | 0A | - | 01,12 | `5:$4B00` ×6 | - |
| 0A | `$00` | 04 | - | 96 | `$6635` | 0B | - | 01,12 | `5:$4BC0` ×8 | - |
| 0B | `$83` **BOSS 3** | 06 | 06 | 12 | `$6C56` | - | - | 01,12 | `5:$5110` ×1 | - |
| 0C | `$80` | 05 | 05 | 96 | `$6D27` | 0D | - | 01,12 | `5:$4CC0` ×6 | `5:$4FE0` ×8 |
| 0D | `$00` | 05 | - | 96 | `$7348` | 0E | - | 01,1E | `5:$4D80` ×8 | `5:$5060` ×7 |
| 0E | `$84` **FINAL BOSS** | 07 | 07 | 11 | `$7969` | - | - | 01,1E | `5:$5130` ×2 | - |

`$1015` bit 7 = "zero `$FF80/$FF86/$FF87/$C714` on entry" (`0:$0D66`); low nibble
→ `$C73E` = **boss/room sub-type** (0 = normal, 1-4 = the four bosses,
5 = level-6 vehicle section). `$1031 == $FF` means "keep the current song".

Levels 2 and 6 are **vertical** (narrow, top exit); everything else scrolls
right. Level `$0E` sets `$C750=1` (`0:$0DE0`) which re-routes the whole enemy
loop to `1:$77BD` and disables pause.

### 2.4 Level map format (bank 3)

`sub_00_0C34` (`0:$0C34`):

```
ptr  = LE16 at 3:$4000 + (level-1)*2
[ptr]      = ncols            (128, 33, 113, 11, 81, 17, 81, 11, 128, 96, 12, 96, 96, 11)
[ptr+1..]  = ncols * 16 metatile bytes, COLUMN-MAJOR (16 rows/col)
```

Each source byte is expanded to **2 bytes in `$D000`**: the raw byte, then the
raw byte translated through the per-level table `LE16 at 3:$7A2A + (level-1)*2`
(`0:$0C5C-$0C67`). So `$D000 + (col<<5) + row*2` = `{objectByte, tileByte}`.
Translation tables: `3:$7A46` (L1-2), `3:$7A96` (L3-4), `3:$7AE2` (L5-8),
`3:$7B34` (L9), `3:$7B77` (L10-11), `3:$7BB6` (L12-14).
A second per-level table `3:$7BF9` (14×LE16 → `3:$7C83/$7CA3/$7CD2/$7CF2/
$7D21/$7D31/$7D50/$7D60`) holds tile-attribute/collision classes.

The raw object byte's **top 3 bits** (`AND $E0`, `SRL`, ×16) index the `$C1E8`
slot to free when the tile is destroyed (`sub_01_4BE8`, `1:$4BE8`).

### 2.5 Is there a stage select? Yes - two of them, both normal features

* The **round select** (`0:$035B` / `0:$03DC`) is the normal, always-reachable
  screen. It offers only *uncleared* routes, digits from `0:$1008` = `$81 $82
  $83 $84` (= "1".."4").
* The **DAA digits recon-2 found are a SOUND TEST, not a stage select.**
  `0:$39A7`/`0:$39C2` increment/decrement `$C713` in BCD, range `$01-$46`
  (70 entries), rendered by `sub_00_3A10` into `$9CD0`. The *value actually
  played* is the binary cursor `$FF80` (0..`$2E`), `0:$393F-$3944`
  (`LD B,[$FF80]; LD C,3; CALL $0AE1`). It is item 1 of the OPTION screen,
  reached from the title by selecting OPTION and pressing Start. **Not** a debug
  screen, **not** hidden.
* A genuinely hidden feature *does* exist - see §8.1 (`$FFE2 == $26`).

---

## 3. ENEMY ROSTER

### 3.1 Correction: the enemy "type" is the STATE field `+$02`

recon-2 read `0:$2666` as `+$01`; it actually reads `+$02` (`LD A,[HL+]` at
`$265F` leaves `HL=slot+1`, then `INC HL` / `LD A,[HL-]` reads `slot+2`).
`+$01` is 0 in every spawn record in the ROM.

**The real behaviour dispatch is `1:$50D3`, a 13-entry table** (`1:$50C3-$50D2`
does `A=[slot+2]; DEC A; ADD A,A; LD HL,$50D3; ADD HL,BC; JP HL`):

| state | handler `1:` | role |
|---|---|---|
| 1 | `$50ED` | ground walker |
| 2 | `$5399` | ground walker w/ jump+turn |
| 3 | `$55AA` | flyer (sine/hover) |
| 4 | `$7750` | level-14 chase entity (tracks `$FF93`, ±4/frame) |
| 5 | `$575C` | level-6 vehicle-section enemy |
| 6 | `$57D6` | level-12 enemy |
| 7 | `$6D8A` | **BOSS 2** (level 8) |
| 8 | `$7061` | **BOSS 3** (level 11) |
| 9 | `$7288` | **BOSS 4 / Joker** (level 14) |
| 10 | `$7591` | **BOSS 1** (level 4) |
| 11 | `$59E0` | boss projectile (templates `1:$6CEA`+) |
| 12 | `$5B95` | dying / despawn tail |
| 13 | `$78A7` | boss-2 auxiliary part (slots 1 & 2, drawn only) |

The 12-entry table at `1:$60EF` (recon-1 §6.4) is a **secondary** dispatch,
entered from `1:$4F1B`/`1:$5044` only when flag bits 3/4 of `+$00` are set -
it is the *hit-reaction / stunned* variant of the same states.

### 3.2 Enemy record layout (`$C268`, 8 × 32 B) - refined

| off | field | evidence |
|---|---|---|
| `+$00` | flags: b7 active, b6 disabled/ignore, b4/b3 hit-state, b2 hit-flash, b1/b0 misc | `1:$4E27`, `1:$4F11-$4F19` |
| `+$01` | (always 0 in ROM data) | - |
| **`+$02`** | **STATE = enemy type**, 1..13 → `1:$50D3` | `1:$50C3` |
| `+$03`,`+$04` | speed / period pair (per-instance on L5) | UNCONFIRMED - watch `$C268+3` during an L5 flyer's cycle |
| `+$05` | facing (b0), used for knockback dir | `1:$67AD` |
| `+$06` | "kill me" latch (non-zero → death FX, `1:$4E75`) | `1:$4E71-$4EB7` |
| `+$07`,`+$08` | screen X / Y (recomputed per frame) | `0:$3C3F` |
| `+$0A`,`+$0B` | hitbox half-width pair (`$0B` used by punch test, `$0A` by body) | `0:$267C-$2686` |
| `+$0C`,`+$0D` | hitbox half-height pair | idem |
| `+$0E`,`+$0F` | **world X 12.4** (hi, lo) | `1:$4E48`, `1:$60A0` |
| `+$10`,`+$11` | **world Y 12.4** | `1:$4E64 CP $21` |
| `+$14` | state timer | `1:$6109` |
| **`+$16`** | **HP** | `0:$26F6`, `0:$0D80` |
| `+$17` | hit-flash / stun timer (`$3C`) | `0:$26CA` |
| `+$1A`,`+$1B` | anchor sub-position (mirrors `+$0F`/`+$11` on L9-L13) | UNCONFIRMED |
| `+$1C`,`+$1D` | patrol / amplitude limits (vary per instance on L5) | UNCONFIRMED |
| `+$1E`,`+$1F` | metasprite base / gfx variant | UNCONFIRMED |

### 3.3 Roster (all 26 non-boss enemies + 5 bosses in the whole game)

| state | levels | count | HP | contact dmg | hitbox (w,h) | notes |
|---|---|---|---|---|---|---|
| 1 | 1 (×6), 2 (×3), 3 (×8) | 17 | 4 | 2 | `$06/$07`, `$0F/$10` | plain walker; L3 has 3 variants with `+$03=$90` and half-w `$08` |
| 2 | 5 (×6), 7 (×6), 13 (×8) | 20 | 6 (one 8 on L5) | 2 | `$08/$09`, `$0F/$10` | L5 instances have per-instance `+$03` = `$80/$60/$40/$30` and `+$1D` = `$10/$15/$20/$22` (speed/period pair) |
| 3 | 9 (×6), 10 (×8) | 14 | 8 | 2 | `$0C/$0D`, `$13/$14` | flyer, `+$03=+$04=$50` |
| 4 | 14 (×1) | 1 | `$20` | 0 | `$10` all round | chases `$FF93`, forces `$FF95=0` and clears `$C269` b7 |
| 5 | 6 (×1) | 1 | 8 | 0 | `$08/$09`, `$08/$08` | level-6 vehicle-section target |
| 6 | 12 (×6) | 6 | 8 | 0 (→ 1+3 when it switches to state 11) | `$0C/$0D`, `$17/$18` | |
| 7 | 8 (×1) | 1 | `$1C` | 1 | `$08/$09`, `$0F/$10` | **BOSS 2**; `+$06=$CE` |
| 8 | 11 (×1) | 1 | `$1C` | 2 | `$0C/$0D`, `$13/$14` | **BOSS 3**; `+$06=$16` |
| 9 | 14 (×1) | 1 | `$30` | 1 | `$08/$09`, `$0F/$10` | **BOSS 4 (Joker)**; `+$06=$2B` |
| 10 | 4 (×1) | 1 | `$20` | 2 | `$08/$09`, `$10/$10` | **BOSS 1** |
| 11 | spawned | - | `$FF` | 1 + level bonus | 4-8 | boss projectile |
| 13 | 8 (spawned) | 2 | - | - | - | boss-2 arms/parts, slots 1 & 2 |

**Maximum 8 enemies alive per level.** The whole `$C268` array is preloaded from
ROM at level init - there is no streaming spawner (§4).

### 3.4 Contact-damage tables - fully decoded

`sub_01_6666` → `1:$6790`: `C = [slot+$02]` (state), `B = $6BC1[C]`;
if bit 7 → `B = (B & $7F) + $6BCE[$FFB0-1]`; then `CALL sub_00_2777`
(subtract `B` from `$FF8A`, play sfx `$12`) and set `$C714 = $5A` (or `$DA`
if `[slot+$05]` bit 0 → knock left).

**`1:$6BC1` (file `$06BC1`), 13 bytes, indexed by enemy STATE 0..12:**

```
state   0  1  2  3  4  5  6  7  8  9 10 11 12
dmg    00 02 02 02 00 00 00 01 02 01 02 81 00
                                       ^ bit7 = add per-level bonus
```

**`1:$6BCE` (file `$06BCE`), 14 bytes, indexed by `$FFB0-1`:**

```
level   1  2  3  4  5  6  7  8  9  A  B  C  D  E
bonus   0  0  0  0  0  0  0  0  0  0  0  3  1  1
```

So boss projectiles (state 11) do 1 damage on levels 1-11, **4 on level 12**,
2 on levels 13-14. State 13 would read `$6BCE[0] = 0` - a harmless 1-byte
overrun.

Other damage sources: `$C1E8` object contact `0:$15E5 LD B,$02`;
spikes/hazards `0:$1E20 LD B,$04`; environmental drain `0:$2E8D LD B,$01`.

---

## 4. SPAWNING

**Enemies are not streamed.** `sub_00_2889` (`0:$2889`, called from level init
`0:$0540` and from the level-transition `0:$283F`) does a straight block copy:

```
0:$28B0   HL = 5:$46EC + (level-1)*3      ; {srcLo, srcHi, count}
0:$28C6   copy count * 32 bytes  ->  $C268          ; enemy array image
0:$28DB   zero the remaining (8-count) * 32 bytes
0:$28F7   HL = 5:$4716 + (level-1)*3
0:$290D   copy count * 16 bytes  ->  $C1E8          ; map-object array image
0:$2922   zero the remainder
```

`srcHi == $FF` ⇒ no records, whole array zeroed (`0:$28E8`, `0:$292F`).
The ROM records are **byte-identical images of the RAM slots**, so the layouts
in §3.2 (32 B) and recon-2 §2.1 (16 B) *are* the file formats.

Everything else in `sub_00_2889` is per-level asset loading:
`5:$4000 + (level-1)*4` = `{len16, src16}` metatile-block defs → `$C368`;
`1:$7C7D + (level-1)*8` = up to 8 `sub_00_0B15` resource ids (`$FF`-terminated);
`1:$7CED + (level-1)*2` = player start `{Xhi, Yhi}` (`$FF82 = $80`,
`0:$298D`; level `$0A` keeps its Y from `0:$054D`).

### 4.1 Activation / deactivation

**Enemies (`$C268`), `1:$6094`** - runs for every *inactive* slot each frame:

```
if [slot+$0E] == 0            -> skip (slot empty)
d = |($FFA2 + 5) - [slot+$0E]|              ; camera X hi vs enemy X hi
if d >= 7 (1:$60A9 CP $07)    -> skip
if flags bit6 set             -> skip (permanently disabled)
if [slot+$01] == 1            -> extra gate: X must equal camX-2
else SET 7,(flags)            -> ACTIVATE
```

Deactivation: `1:$4E4D CALL sub_00_11A7` (`|camX+5 − X| < 9`, constants
`0:$11AA`, `0:$11B1`) → `RES 7`. Falling below `Y hi >= $21` also kills the
slot (`1:$4E69`).

**Map objects (`$C1E8`), `1:$4257`** - activation half-width is
`1:$4BA5[type]`:

```
type    0  1  2  3  4  5  6  7  8  9 10   (11)
width  00 0B 0B 0B 0B 0B 0B 0B 0B 08 09   ($4BB0 = $FA, code byte!)
```

The table is 11 bytes; **type 11 reads one byte past the end**, picking up the
first opcode byte of `sub_01_4BB0` (`$FA`) as a half-width of 250 → always
active. Level 6 does use type 11 (`5:$4FA0`), so this off-by-one is *live* but
benign (the level-6 vehicle should always be active).

Object types actually used across the whole ROM: 1 (×1), 3 (×3), 4 (×1),
5 (×6), 6 (×7), 7 (×4), 8 (×8), 9 (×3), 11 (×1) = 34 objects.
**Types 2 and 10 are never placed** - their handlers `1:$42E3` and
`1:$4765` are dead code in shipped data (see §8).

---

## 5. BOSSES

Boss identity is `$C73E` (low nibble of `0:$1015[level-1]`), set at `0:$0D73`.

| # | level | `$C73E` | enemy state | record | HP (file offset of HP byte) | handler |
|---|---|---|---|---|---|---|
| 1 | 4 | 1 | 10 | `5:$50D0` (file `$150D0`) | `$20` @ `$150E6` | `1:$7591` |
| 2 | 8 | 2 | 7 (+2 parts in state 13) | `5:$50F0` (file `$150F0`) | `$1C` @ `$15106` | `1:$6D8A`, parts `1:$78A7` |
| 3 | 11 | 3 | 8 | `5:$5110` (file `$15110`) | `$1C` @ `$15126` | `1:$7061` |
| 4 | 14 | 4 | 9 | `5:$5130` (file `$15130`) | `$30` @ `$15146` | `1:$7288` |
| 4b | 14 | 4 | 4 | `5:$5150` (file `$15150`) | `$20` @ `$15166` | `1:$7750` |

Common boss setup, `sub_00_0D50` (`0:$0D50`):

* `$C73E != 0` **and** `$C756 == 2` (hardest difficulty) → `$C27E += 5`
  (`0:$0D80-$0D85`, i.e. slot-0 HP +5) and `$C73D = 1`.
* `$C73E == 2` (level 8) additionally seeds slots 1 and 2:
  `$C284=$38`, `$C285=$14`, `$C288=$80`, `$C2A8=$81`, `$C28A=$C2AA=$0D`
  (state 13), `$C29E=$C2BE=$FF` (HP of the parts) - `0:$0D94-$0DB5`.
  They are re-armed to `$40` on death (`1:$4F03`).
* Level `$0E` (`0:$0DDE`): `$C750=1`, `$C740=1`, `$C741=$78`,
  `$FFBA..$FFBD = 08 80 1E 00` (the vehicle position), `$FFAD=$FF`;
  on difficulty 0 (`$C756==0`) `$C288 = $40` - i.e. **the second entity is
  disabled on EASY** (`0:$0E01-$0E09`).

Boss projectiles: `sub_01_6BDC` (`1:$6BDC`) copies a 32-byte template into
**slot 6**. `$C72C` (1..5) selects the template:
`1:$6CEA`, `$6D0A`, `$6D2A`, `$6D4A`, `$6D6A` (file `$06CEA`+`$20`×n).
All five are state `$0B` (=11), HP `$FF`, differing in `+$06` (1..5),
`+$0A..+$0D` hitbox (4/4/2/2 … 8/8/8/8) and `+$12` speed
(`$30/$40/$30/$38/$38`). `$C72B` is written from the template stream at
`1:$6C2C` (collision-probe mode).

Boss phase counters: `$C73D` (phase), `$C72E` (sub-state), `$C72C`
(projectile template), `$C73F` (event flag A), `$C741` (event timer).

---

## 6. PLAYER ABILITIES

`$C71E` gates everything (0 = free). Input read at `0:$18xx`-`0:$1A5x`.

| ability | controlling code | key constants (file offset of operand) |
|---|---|---|
| **Walk / run** | `0:$1D3D` accel, `0:$1888`/`0:$18C8` integrate; facing `0:$187D`/`0:$18B9` | max +`$18`/−`$E8` (`$01D4C`, `$01D7B`); slow-mode `$08`/`$F8` (`$01D48`, `$01D77`); decel `$1A`/`$02` (`$01D66`, `$01D6A`) |
| **Turn-around stall** | `0:$187A`, `0:$18B5`; anim table `0:$1BD3` = `14 13` | `$0F` frames (`$0187B`, `$018B6`) |
| **Jump (A)** | `0:$1A29-$1A55`; needs `$FF80==0` | init vel `$22` (`$01A4E`), spring `$32` (`$01A4A`); sfx `$0F` |
| **Variable jump height** | `0:$1A71-$1A7E` | gravity `$01` while A held (`$01A7D`), `$02` released (`$01A79`) |
| **Fall / terminal velocity** | `0:$1AEF-$1AFE` | gravity `$03` (`$01AF4`), cap `$BE` (`$01AFB`); slow-mode `$02`/`$F4` |
| **Landing squat** | `0:$1B3D` | `$10` frames (`$01B3E`) |
| **Wall cling** | `0:$1F33-$1F60` (left wall) and `0:$2000-$2019` (right wall). Requires `$FFC2` (A released mid-jump) + A still held + airborne | lock word `$50` (`$01F57`) / `$30` (`$02010`); low 5 bits = 16-frame countdown, top 3 bits = locked d-pad dir. Anim `$11`/`$12` at `0:$1B8F` |
| **Wall jump / bounce** | `0:$1DA0` (`sub_00_1DA0`), vel `0:$1DA8` | Y `$22` (`$01DA9`); X table `0:$27A6` = `14 EC` (`$027A6`,`$027A7`) |
| **Punch (B, on ground/air, no ammo)** | `0:$1990` → `0:$19AD` when `$C759==0`; hit test `sub_00_201A` (`0:$201A`) fires when `$FF97==8` | reach `$00E0`/`$FF20` (`$02025`,`$0202A`); damage `$02` (`$026F1`); crit window `CP $08` (`$026D4`) ⇒ ~3 % chance of instant kill (`0:$26E3 LD B,(HL)`); probe mode `$05` → `$C72B` |
| **Batarang (B, needs `$C759>0`)** | `0:$1990-$1A28`; pool `$C4B0` 3×9 B; update `sub_00_3A35` (`0:$3A35`) | speed `$50` (`$019F7`); Y offset `$0060` down-held / `$FFC0` (`$019E7`,`$019EC`); `$40` in `+$6` if Up held (`0:$1A0E`); damage 1 (`0:$3D0B DEC (HL)`); level `$0E` + `$C756!=0` → type `$80`, speed `$08` (`$019CD`, `$01A05`) |
| **Bat-rope (Up)** | fire `0:$193D-$198D`; states `$C71E` 1→2→3; segments `$C5EF` 6×4 B; update `0:$3D89`; length `$C71F`; anim by length at `0:$1B75` (`$14`/`$1E` thresholds) | segments `$05` (`$0195E`); X launch `$0040`/`$FF40` (`$01970`,`$01975`); Y launch `$FEC0` (`$01985`) |
| **Rope climb / swing** | `0:$1B6A-$1B8C` picks anims `$1B/$1C/$1D`; `$C721` sub-timer | thresholds `$14` (`$01B79`), `$1E` (`$01B7D`) |
| **Take damage / knockback** | `sub_00_2777` (`0:$2777`); `0:$1776-$17B6` | invuln `$5A`/`$DA` (`$015F0`,`$015F4`,`$01E2B`,`$01E2F`,`$02E93`,`$067B2`,`$067B6`); knockback X `$10`/`$F0` (`$01791`,`$01795`), Y `$18` (`$017B3`), `$40` on L4 (`$017AD`) |
| **Slow / water mode** | `$FF95`; set `0:$2E7F` (`$80`), cleared `0:$2E9A` | halves walk speed and gravity, drains 1 HP when `$C756!=0` (`0:$2E8D`) |
| **Spring / launch pad** | `$C751`; armed on L11 at `0:$2D09` when player is exactly at `X=$0B, Y=$17` | timer `$F0` in `$C717` (`0:$2D20`); jump vel becomes `$32` |
| **Pickups** | `sub_01_4D4E` (`1:$4D4E`), tile ids `$20`/`$21`/`$22` | `$20` = +6 HP (`$04DB6`); `$21` = +10 batarangs (`$04DA0`); `$22` = **+2 max HP, permanent**, cap 16 (`$04D69`, `$04D6B`, `$04D6F`) - only 3 exist, on levels 3, 5 and 13, tracked by `$C754` bits 0/1/2 (`1:$4D86-$4D91`) and erased from the map on revisit by `sub_01_4DDA` (`$DB84`, `$D4DC`, `$D4DA`) |
| **Soft reset** | `0:$0A55` `CP $0F` | A+B+Select+Start |
| **Pause** | `0:$0600` bit 3 → `$C716` | disabled when `$C750!=0` |

Ability *not* present: no crouch, no ducking attack, no double jump, no shield.

---

## 7. THE MOD SURFACE - ranked catalogue

Ranked by (visible impact) ÷ (implementation cost). "file" = raw ROM byte
offset to patch. All single-byte patches unless stated.

| # | mod | player-visible effect | exact locations | difficulty |
|---|---|---|---|---|
| 1 | **Moon Gravity** | floaty, huge hang time, slow descent | gravity rising `$01A7D`←`$00`, `$01A79`←`$01`; falling `$01AF4`←`$01`; terminal `$01AFB`←`$E0` | trivial |
| 2 | **Super Jump** | Batman jumps 2-3× as high | `$01A4E` (`$22`→`$3A`); optionally `$01A4A` (spring) and `$01DA9` (wall-jump) | trivial |
| 3 | **One-Hit Kill (player deals)** | every punch instantly kills | `$026F1` (`$02`→`$FF`) - or force the crit path by widening `$026D4` (`$08`→`$FF`), which uses the enemy's own HP as damage (`0:$26E3`) | trivial |
| 4 | **Infinite Batarangs** | B always throws, never runs out | NOP the `DEC A` + store at `0:$1996-$1999` (`3D EA 59 C7` → `00 00 00 00`), file `$01996`; or set the pickup to `$FF` at `$04DA0` and start-of-level ammo (`0:$0506` clears `$C759`) | trivial |
| 5 | **Rapid Fire** | no attack cooldown, batarang stream | `$FF97` ring guard: `0:$191D CP $09` → `CP $01` (file `$0191E`); pool size `0:$19A9 CP $03` → `CP $03` stays but the 9-byte slot loop at `0:$199C` can be widened | trivial |
| 6 | **Ice Physics** | slippery, no ground friction | over-speed decel step `$01D6A`/`$01D99` (`$02`→`$00`) and the accel at `0:$1D3D` | trivial |
| 7 | **Glass Cannon / 1-HP Run** | one hit = death | starting+max HP `$00201` (`$0A`→`$01`); optionally lives `$00207`←`$01` | trivial |
| 8 | **Tank Batman** | 16 HP from the start, capped bar still draws | `$00201` (`$0A`→`$10`); HUD already handles `$FF8E` up to 16 via tables `0:$100C/$100E/$1011` | trivial |
| 9 | **Permadeath** | one life, game over → boot | `$00207` (`$05`→`$01`); to remove continues also zero `$FFB5` writes at `0:$2AB1` (file `$02AB1`, `3E 01`→`3E 00`) | trivial |
| 10 | **All Routes Unlocked / Level Warp** | round 4 available immediately | insert `LD A,$07; LD [$C753],A` in boot; free space at `0:$0061-$00FF`, hook `0:$01D1` (`3E 01 EA 56 C7` region) or simply pre-set from the launcher's RAM init | trivial |
| 11 | **Full Level Select (1-14)** | pick any of the 14 levels from the round screen | widen cursor wrap `0:$042A` (`CP $03`→`CP $0E`, file `$0042B`) and `0:$0439` down-branch; make `sub_00_0FE6` always available (`0:$0FF3/$0FF9/$0FFF` → `JR` past the `LD C,$FF`, or patch `0:$1005` `LD C,$FF`→`LD C,B`); replace the `$C712`→level map at `0:$049D-$04B9` with `LD A,[$C712]; INC A; LDH [$FFB0],A`; move the digit table (needs 14 entries, `0:$1008` only has 4 before HUD data) into free space at `1:$7F29` | moderate |
| 12 | **Boss Rush** | 4 boss levels back-to-back, nothing else | rewrite the exit table `0:$286D` (file `$0286D`, 28 B): L4→8, L8→`$0B`, L11→`$0E`; and neutralise the `$35E8` route dispatch by changing the `CP $04/$08/$0B` compares at `0:$35EA/$35EE/$35F2` so they fall through to `0:$3605` (`JP $2820`) | moderate |
| 13 | **Randomiser (level order)** | shuffled route graph each seed | rewrite `0:$286D` (28 B) + `0:$04AB/$04AF/$04B3/$04B7` route heads. Fully data-driven, no code change | moderate |
| 14 | **Enemy Roster Randomiser** | any enemy can appear anywhere | rewrite byte `+$02` (state) of each 32-byte record in `5:$4740…$5150` (file `$14740`…`$15150`); also fix `+$16` HP and the `+$0A..+$0D` hitbox to match the new type or the collision box will look wrong | moderate |
| 15 | **All-Bosses Mode** | bosses spawn as regular enemies mid-level | set `+$02` of ordinary records to 7/8/9/10 and `$C73E` for the level (`0:$1015`, file `$01015`) so the boss code paths arm; bosses read `$C73E`-conditional state (`1:$5049`) so `$C73E` must be non-zero | hard |
| 16 | **Enemy Density ×N** | up to 8 enemies always on screen | raise the count byte in `5:$46EC + (lvl-1)*3 + 2` (file `$146EE`+) to 8 and append 32-byte records in free space `5:$7F8D` (115 B, only ~3 records) - or repoint `srcLo/srcHi` at a new table. Hard cap is **8 slots** (`1:$60D7 CP $08`, file `$060D8`) | moderate |
| 17 | **Aggro Mode (activation range)** | enemies wake up a whole screen early | `1:$60AA` (`$07`→`$40`) - enemy activation window; `0:$011AA`/`0:$011B1` - despawn window; `1:$4BA5` table (file `$04BA5`, 11 B) for `$C1E8` objects | trivial |
| 18 | **Hardcore Damage** | every enemy hurts for 4-8 | rewrite `1:$6BC1` (file `$06BC1`, 13 B) and `1:$6BCE` (file `$06BCE`, 14 B). Whole difficulty curve in 27 bytes | trivial |
| 19 | **Pacifist Run** | enemies do no contact damage, but you cannot hurt them either | zero `1:$6BC1` (13 B) and set `$026F1`←`$00`, `$026D4`←`$00`, `0:$3D0B` (`DEC (HL)`→`NOP`, file `$03D0B`) | trivial |
| 20 | **No-Jump Challenge** | A does nothing; must wall-cling and bat-rope | `0:$1A2D` `JP Z` → `JP` unconditional (file `$01A2D`: `CA`→`C3`) | trivial |
| 21 | **Rope-Only Traversal** | bat-rope fires 20 segments, huge reach | `$0195E` (`$05`→`$14`); enlarge `$C5EF` pool (24 B → needs `$C607-$C60A` + free `$C768-$C7FF`) and the segment writer `0:$3DA6` | moderate |
| 22 | **Invincible / Practice** | permanent invulnerability, HUD unchanged | force `$C714` non-zero every frame: hook the main loop head `0:$0567` or patch `sub_00_2777` at `0:$2777` to `RET` (file `$02777`←`$C9`); also `1:$67A9` call site | trivial |
| 23 | **No-Invuln (Brutal)** | no mercy frames after a hit | `$015F0`,`$015F4`,`$01E2B`,`$01E2F`,`$02E93`,`$067B2`,`$067B6` ← `$01` | trivial |
| 24 | **Negative / Inverted Palette** | whole game in photo-negative | BGP/OBP shadows `$FFAD/$FFAE/$FFAF` - patch the fade ramps `0:$0B09` and `0:$0B11` (8 B each, file `$00B09`/`$00B11`) and the direct writes `0:$34C6` (`$E4`→`$1B`), `0:$0E24`-era `$FFAD` writes; also the raster-mode palette writes at `0:$08F0` (`rOBP1=$80`, `rOBP0=$90`) and `0:$0935` (`rBGP=$1B`) | trivial |
| 25 | **Palette Cycling / Disco** | palettes strobe per frame | STAT state 7 already ping-pongs `$C765` 0..11; add a write of `$FFB1` (frame counter) into `$FFAD` in the main loop tail at `0:$064A` | trivial |
| 26 | **Big Head Batman / sprite swap** | different player metasprites | `$FFC3` PlayerAnimID is written at 13 sites (`0:$1B63`, `$1B8A`, `$1BA1`, `$1BC4`, …); the metasprite tables are `5:$5F5C` and `5:$736B`. Swapping the anim id at `0:$1BC4` (file `$01BC4`) is a 1-byte "always use anim X" | moderate |
| 27 | **Speedrun Timer HUD** | on-screen frame/second counter | free RAM `$C768-$C7FF`; increment from the VBlank frame counter (`0:$07FC` region) and draw with the `$C130` 2×2 tile queue via `sub_00_11F1`; digits are tiles `$80-$89` | moderate |
| 28 | **Turbo / Slow-Mo** | global game speed change | main loop waits on `sub_00_0A4F` (`0:$0A4F`). Turbo = call the loop body twice per frame; slow-mo = call `$0A4F` twice (insert `CD 4F 0A` at `0:$064D`). Timing-sensitive: the STAT raster chain assumes 1 VBlank/frame | moderate |
| 29 | **Mirror Mode** | level geometry flipped | camera/scroll and the `$D000` column-major map both index by X hi; flip in `sub_00_11B9` (`0:$11B9`) by `X = $C732 - X`. Metasprite X flip via `$FF9E`/`$FF8B`. Collision probes at `$FFC0/$FFC1` must be mirrored too | hard |
| 30 | **Difficulty Always Hard / Always Easy** | locks `$C756` | `$001D2` (boot default, `$01`→`$00`/`$02`); or `RET` at `0:$3980` (file `$03980`←`$C9`) to lock the option screen. Effects: +5 boss HP (`0:$0D83`), the level-14 second entity (`0:$0E07`), batarang speed on L14 (`0:$1A04`), water drain (`0:$2E81`) | trivial |
| 31 | **Sound-Test Jukebox in-game** | play any of 46 tracks with Select | `sub_00_0AE1(B=id, C=cmd)` at `0:$0AE1`; hook the main loop at `0:$05FE` on `$FFE2` bit 2; song pointer table `7:$477D` | moderate |
| 32 | **Bat-Rope Grapple Anywhere** | rope attaches to any tile, not just anchors | the anchor test lives in the `$C71E` 1→2 transition around `0:$1B6A`/`0:$3D89` and `sub_00_11B9` tile lookups. Needs an emulator trace to pin the exact accept/reject branch - **UNCONFIRMED** | hard |
| 33 | **Camera Zoom-Out / Lead** | camera sits further ahead | `$01052`,`$0106C`,`$01074` (X lead `$05`), `$0105C` (left clamp `$06`), `$01083`/`$01087`/`$0108F`/`$01093` (Y window) | trivial |
| 34 | **Bottomless-Pit Removal** | falling off the bottom no longer kills | `$01765` (`$21`→`$FF`) and `$0175E` (level-`$0B` variant `$1B`→`$FF`) | trivial |
| 35 | **Wall-Cling Forever** | infinite wall hang | the lock word low 5 bits are the countdown: `$01F57` (`$50`→`$5F`), `$02010` (`$30`→`$3F`); or NOP the decrement in `0:$1B8F`'s consumer | trivial |
| 36 | **Boss HP Sliders / Marathon Boss** | any boss HP 1-255 | file `$150E6` (L4), `$15106` (L8), `$15126` (L11), `$15146` + `$15166` (L14); difficulty bonus `$00D84` | trivial |
| 37 | **Enemy HP Sliders** | global enemy toughness | byte `+$16` of every record in `5:$4740`…`5:$5150`; 26 non-boss records | trivial |
| 38 | **Rescue-Drone Always On** (unlock the built-in cheat) | the hidden boss-fight helper spawns without the code | `$C75C` is the gate at `0:$3050`; set it at boot (free space `0:$0061`) or change `0:$3054 RET Z` → `NOP` (file `$03054`←`$00`) | trivial |
| 39 | **Vertical-Level Everything** | every level exits via the top | rewrite `0:$286D` odd entries and set widths in `0:$103F` so the right edge is unreachable | moderate |
| 40 | **Custom Level Geometry** | hand-authored maps | bank 3, `{ncols, ncols*16 metatile bytes}` at `3:$4000+`. Column-major, 16 rows. Free space `3:$7F58` (168 B). Translation table `3:$7A2A` must contain the metatiles used | hard |

### 7.1 Cheapest high-impact set (recommended launcher "presets")

`Moon Gravity`, `Super Jump`, `One-Hit Kill`, `Infinite Batarangs`,
`Glass Cannon`, `Boss Rush`, `Level Select`, `Hardcore Damage`,
`Aggro Mode`, `Negative Palette`, `No-Jump` - all of these are ≤10 patched
bytes each and mutually independent.

### 7.2 Free space for mod code / data

| region | size | notes |
|---|---|---|
| `0:$0061-$00FF` | 159 B | `$FF` filler between the RST/interrupt vectors and the header; bank 0 = always mapped |
| `1:$7F29-$7FFF` | 215 B | `$FF` filler; bank 1 = always mapped ⇒ **best place for mod code** |
| `3:$7F58` | 168 B | bank 3 (level data) |
| `4:$7F24` | 220 B | bank 4 (graphics only) |
| `5:$44AC` | 48 B, `5:$7F8D` 115 B | bank 5 |
| `6:$7F29` | 215 B | bank 6 |
| WRAM `$C768-$C7FF` | 152 B | largest free RAM block |
| WRAM `$C0A0-$C0FF` | 96 B | |
| HRAM `$FFD1`, `$FFD7-$FFDA`, `$FFDE-$FFE0`, `$FFE3-$FFE6`, `$FFE9`, `$FFEB-$FFEF` | 23 B | |

---

## 8. UNUSED / DEBUG / UNREACHABLE CONTENT

### 8.1 Hidden title-screen cheat: **B + Select + Left**

`0:$02C7-$02D8`:

```
02C7  F0 E2     LDH A,[$FFE2]      ; newly-pressed
02C9  FE 26     CP $26             ; %00100110 = B(b1) + Select(b2) + Left(b5)
02CB  20 0E     JR NZ,...
02CD  3E 01     LD A,$01
02CF  EA 5C C7  LD [$C75C],A       ; <- the cheat flag
02D2  01 01 13  LD BC,$1301        ; confirmation jingle, sfx $13
02D5  CD E1 0A  CALL $0AE1
02D8  C3 1B 03  JP $031B           ; start the game as usual
```

`$C75C` is read at exactly one place, `0:$3050`, inside the per-level logic
`sub_00_2CBE`. When set, during any boss fight (`$C73E != 0`) with
`$FF8A < 3` (player nearly dead) and boss HP `$C27E >= $10`, it spawns a
homing helper object (`$C75B/$C75D-$C762` state block, metasprite `$68` via
`sub_00_0BAF` at `0:$3123`, Y from table `0:$333B` = `1E 1E 16 1F` per boss)
that drops a ballistic pickup through `sub_00_0CF3` with sfx `$22`.
**A rescue/helper cheat.** All 8 lines of the state machine are in
`0:$3050-$3126`. Prime mod material: enable it unconditionally, or repurpose
`$C75C` as a general "assist mode" flag.

### 8.2 Orphaned hazard table `1:$7F02` + unreachable code `1:$7D59`

`1:$7D11-$7D2B` dispatches the per-level hazard-tile lookup on `$FFB0` for
levels 1, 2, 3, 5, 7 and `$0D`, falling through to `$7E3C` otherwise. The block
at `1:$7D59-$7D61`:

```
7D59  7A         LD A,D
7D5A  FE 4E      CP $4E
7D5C  D2 3C 7E   JP NC,$7E3C
7D5F  21 02 7F   LD HL,$7F02
```

is **never branched to** - no `JR`/`JP` targets `$7D59`. Its table `1:$7F02`
(≈39 bytes of nibble-packed hazard ids, `$7F02-$7F28`) is therefore dead data.
Almost certainly a cut level or a level whose hazard set was moved. Reachable
again by adding one `CP nn / JR Z,$7D59` to the dispatcher.

### 8.3 Never-placed map-object types 2 and 10

Handlers `1:$42E3` (type 2) and `1:$4765` (type 10) exist in the 11-entry table
`1:$427B` but no `$C1E8` record in the ROM uses them (§4.1). Free content -
place a type-2 or type-10 record in `5:$4E80`+ and see what appears.

### 8.4 `1:$4BA5` off-by-one

11-entry table, index 11 is live (level 6) and reads `$4BB0` = `$FA`, the first
opcode byte of `sub_01_4BB0`. Benign today; **any relocation of `sub_01_4BB0`
changes level-6 behaviour.**

### 8.5 Unused resource-table slots

`sub_00_0B15`'s table `0:$0B43` has 36 entries; **`$0E`, `$17`, `$18` are
`FF FF` = unused** (recon-1 §3). Three free graphics slots.

### 8.6 Other dead things

* `$FF85` - written once (`0:$1333`), never read.
* `$C4A7-$C4AF` - phantom batarang slot 0, never touched.
* `$C5EB-$C5EE` - bat-rope segment 0, never used (`n+1` indexing).
* `$C0A0-$C0FF`, `$C704-$C709`, `$C768-$C7FF` - zero accesses.
* Sound test exposes ids `$00-$2E` (47) but only ~20 are used in-game; songs
  `7:$477D` lists ≥24 pointers while `0:$1023`/`0:$1031` only reference
  songs `$02-$07`. **Unused music exists** - `$0A` (ending), `$08`, `$09`, `$0B`+
  are candidates. UNCONFIRMED which are distinct tracks vs SFX banks; settle by
  playing each id through the sound test.
* No demo/attract loop, no debug level viewer, no password entry. The DAA code
  is the sound test (§2.5), not a stage select.

### 8.7 Level-select "bug" worth keeping

Because `sub_00_0FE6` hides *cleared* routes, a player who clears routes 1 and 2
sees only route 3; after clearing all three the menu jumps straight to round 4.
`$C753` is never cleared except by a WRAM power-cycle (`0:$0150` only wipes
`$D000-$DFFE` and HRAM), so **route progress survives game over** - a save
system by accident.

---

## 9. OPEN ITEMS (single emulator trace settles each)

| claim | test |
|---|---|
| `$C268 +$03/$04` = speed/period pair | log them on an L5 flyer over one cycle |
| `$C268 +$1C/$1D` = patrol limits | breakpoint-read while an L5 enemy turns |
| `$C268 +$1E/$1F` = metasprite base | compare against the id passed to `sub_00_0BC6` at `1:$6087` |
| whether state 13 can ever reach `1:$60EF` (would `JP $6B62`, data) | log `JP HL` targets at `1:$60EE` during the level-8 boss |
| exact bat-rope anchor accept test (mod #32) | breakpoint `$C71E` 1→2 transition |
| which sound-test ids are unused music | play `$00-$2E` from the option screen |
| `1:$50D3` entry 4 (`$7750`) reachability outside level 14 | log `JP HL` at `1:$50D2` |
