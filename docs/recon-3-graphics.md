# RECON-3 - GRAPHICS & LEVEL DATA FORMATS

ROM: `Batman - Return of the Joker (USA, Europe).gb` (128 KB, MBC1, 8 banks).
Static analysis + byte-level verification by re-implementation. Every format
below was proved by extracting it and rendering it (see §9 / `rip/`).

Tooling added by this pass:

| script | purpose |
|---|---|
| `tools/gbrom.py` | ROM/bank access, 2bpp tile decode, stdlib-only indexed-PNG encoder, all table constants, `$0B15` resource loader replay |
| `tools/riplevel.py` | level map → PNG (+ collision overlay PNG, + `.txt` metatile/collision dump) |
| `tools/ripgfx.py` | `map` (tile-block inventory), `sheets` (all 34 resources → PNG), `player` (bank-2 player anim tiles), `sprites` (both metasprite tables → PNG) |

```
python tools/riplevel.py --txt          # rip/levels/levelNN.png, levelNN_coll.png, levelNN.txt
python tools/ripgfx.py all              # rip/tiles, rip/player, rip/sprites
python tools/ripgfx.py map              # inventory table only
```

**Headline correction to recon-1/2:** there is **no compression anywhere** in the
graphics path; `LCDC` is `$E7`, i.e. **BG tile data is the SIGNED `$8800` region**,
not `$8000`; the VBlank "18-tile column" is actually **32 tiles**; the VBlank
"33-byte row transfer" is actually a **32-byte (2-tile) BG-animation transfer**;
`$FF99`/`$FF9B` are the **high** bytes of their dest pointers, not the low ones;
`$C4A7-$C4AF` is *not* free - it is the tail of the metatile table at `$C368`.

---

## 1. LEVEL / MAP FORMAT  (the gating deliverable)

### 1.1 Geometry

Every level is **exactly 16 metatiles (256 px) tall** and `width` metatiles wide.
A metatile is **16×16 px = 2×2 tiles of 8×8**. The BG map (`$9800`, 32×32 tiles)
therefore holds the level's *entire* vertical extent; only horizontal streaming
exists.

World coordinates are 12.4 fixed point (recon-2 §1). The **high byte of X is the
metatile column**; the **high byte of Y is the metatile row**, taken `& $0F` for
map lookups (`sub_00_11B9`). Y-hi in play runs `$10..$20`; `$21` = death pit
(`00:1764`), `$1B` on level `$0B`.

### 1.2 Bank 3 - the level maps

```
3:$4000   16 × LE pointer, indexed by ($FFB0 - 1)          ; consumed by sub_00_0C34
```

| entry | ptr | width | data span |
|---|---|---|---|
| lv 1 | `$401C` | 128 | `$401D-$481C` |
| lv 2 | `$481D` | 33 | `$481E-$4A2D` |
| lv 3 | `$4A2E` | 114 | `$4A2F-$514E` |
| lv 4 | `$514F` | 12 | `$5150-$520F` |
| lv 5 | `$5210` | 82 | `$5211-$5730` |
| lv 6 | `$5731` | 18 | `$5732-$5851` |
| lv 7 | `$5852` | 82 | `$5853-$5D72` |
| lv 8 | `$5D73` | 12 | `$5D74-$5E33` |
| lv 9 | `$5E34` | 128 | `$5E35-$6634` |
| lv 10 | `$6635` | 98 | `$6636-$6C55` |
| lv 11 | `$6C56` | 13 | `$6C57-$6D26` |
| lv 12 | `$6D27` | 98 | `$6D28-$7347` |
| lv 13 | `$7348` | 98 | `$7349-$7968` |
| lv 14 | `$7969` | 12 | `$796A-$7A29` |
| 15,16 | `$4F80`,`$4F4F` | - | **garbage** - inside level 3's data; there are only 14 levels |

The 14 maps are physically contiguous: level 1's data ends exactly at level 2's
pointer, …, level 14's ends exactly at `$7A2A` (the collision-pointer table).

**Map blob layout:**

```
+0        width           (metatile columns, 12..128)
+1 .. +1+width*16-1       width × 16 metatile-id bytes, COLUMN-MAJOR
                          column c, row r  ->  byte[1 + c*16 + r]
                          r = 0 is the TOP row
```

That is the whole format. **No RLE, no compression.**

### 1.3 `sub_00_0C34` - LoadLevelMap (bank 0)

```
0C34  bank := 3
0C3E  DE := [3:$4000 + ($FFB0-1)*2]
0C4C  HL := $D000
0C4F  B  := [DE++]                       ; width
0C52  for column in 0..B-1:
0C54     for row in 0..15:               ; C = $10
             A := [DE]                   ; raw metatile id
             [HL++] := A                 ; EVEN byte  = metatile graphic id
             T := [3:$7A2A + ($FFB0-1)*2]
             [HL++] := [T + A]           ; ODD  byte  = COLLISION byte
             DE++
0C6F  [$C732] := [0:$103F + ($FFB0-1)]   ; camera X clamp (see §1.7)
0C7D  bank := 1
```

So the working map at **`$D000` is 2 bytes per metatile, column-major, 16 rows
per column, stride `$20` per column**:

```
addr($D000 map)  =  $D000 + (Xhi << 5) + (Yhi & $0F) * 2      ; sub_00_11B9
   [addr+0] = metatile graphic id   (index into $C368, and into the slope tests)
   [addr+1] = collision byte        (see §3)
```

Max addressable: Xhi 0..127 → `$D000-$DFFF`. Xhi ≥ 128 would run past `$DFFF`;
no level is wider than 128.

### 1.4 Bank 5 - the metatile definition table (`$C368`)

```
5:$4000   14 × 4 bytes {len_lo, len_hi, src_lo, src_hi}     ; sub_00_2889, 00:2893
```

`len` bytes are memcpy'd from `5:src` to **`$C368`**. Entry size is 4 bytes, so
`len/4` metatiles.

| levels | len | src | metatiles |
|---|---|---|---|
| 1, 2 | `$0144` | `5:$4038` | 81 |
| 3, 4 | `$0130` | `5:$4174` | 76 |
| 5, 6, 7, 8 | `$0148` | `5:$42A0` | 82 |
| 9 | `$0108` | `5:$43E4` | 66 |
| 10, 11 | `$00F8` | `5:$44EC` | 62 |
| 12, 13, 14 | `$0108` | `5:$45E4` | 66 |

Blocks are contiguous `5:$4038-$46EB`; `$46EC` is the enemy-spawn table.

**Metatile entry = 4 tile ids, COLUMN-MAJOR:**

```
$C368 + id*4 + 0  =  top-left      tile
              + 1  =  bottom-left   tile
              + 2  =  top-right     tile
              + 3  =  bottom-right  tile
```

Proof - two independent consumers agree:

* `00:1103` (full-screen build) emits `[+0],[+1]` down one BG column with stride
  `$20`, then `[+2],[+3]` down the next column.
* VBlank `00:072E` (2×2 queue) writes `t0→dest`, `t2→dest+1`, `t1→dest+$20`,
  `t3→dest+$21`, and `sub_00_11F1` fills `t0..t3` from `$C368+id*4+0..3`.

`$C368 .. $C4AF` = 328 bytes = 82 entries max. **`$C4A7-$C4AF` is the tail of
this table, not free RAM** (recon-2 §5 lists it as a "phantom batarang slot" -
wrong).

*Quirk:* levels 9–14 use metatile id `= len/4` (one past the end of their table),
so the game reads 4 bytes of stale RAM for its graphics. Collision is still
defined for it (level 9 id 66 → `$08` water, level 12 id 66 → `$07` solid). The
extractor renders it blank. **UNCONFIRMED** what it looks like on hardware; would
be settled by dumping `$C470..$C473` in an emulator after a level load.

### 1.5 BG-map addressing and the 2×2 write queue

```
sub_00_11D9  WorldToBGMapAddr:
    HL = $9800 + (Xhi & $0F)*2 + (Yhi & $0F)*64
sub_00_11F1  QueueTileWrite(B=dest_hi, C=dest_lo, E=metatile id):
    DE = $C368 + E*4
    rec = $C130 + [$FF9F];  [$FF9F] += 6
    rec[0..5] = {B, C, t0, t1, t2, t3};  rec[6] = 0     ; zero terminator
VBlank 00:0727 drain:
    VRAM[dest]     = t0     VRAM[dest+1]   = t2
    VRAM[dest+$20] = t1     VRAM[dest+$21] = t3
    then [$C130] = 0, [$FF9F] = 0
```

`$C130` capacity: 8 records fit before `$C160` (the other script buffer).

### 1.6 Full-screen build - `sub_00_104E` (level entry)

After clamping the camera it writes 18 (`$12`) BG columns, one per iteration,
using the `$C160` VRAM-script buffer and `sub_00_0A0E`:

```
$C718 = camX_hi - 2          ; starting metatile column
$C717 = $12                  ; 18 iterations
loop:
  DE = $D000 + ($C718 & $7F) * 32
  script rec A: dest = $9800 + ((($C718*2) & $1E))       ctrl = $A0
                payload = 32 bytes: for r in 0..15 { mt=[DE]; DE+=2;
                                     emit $C368[mt*4+0], $C368[mt*4+1] }
  script rec B: dest = $9800 + ((($C718*2) & $1E)) + 1   ctrl = $A0
                payload = 32 bytes: emit $C368[mt*4+2], $C368[mt*4+3]
  terminator $00; CALL $0A0E
  $C718++; $C717--
```

`ctrl = $A0` → mode 2 (vertical run), count `$20` = 32 rows, stride `$20`.

### 1.7 Horizontal streaming - `sub_00_121F` (`$1287-$1308`)

Runs every frame from the main loop. Triggered when **bit 7 of the camera-X low
byte** (`$FFA3`) flips, i.e. every 8 px of camera movement, and only when
`[$C73E] == 0`:

```
prev := [$FFA6];  [$FFA6] := [$FFA3];  C := [$FFA3] - prev
if bit7([$FFA3] XOR prev) == 0: skip
dir := bit7(C)                                     ; 1 = scrolling LEFT

[$C100] = $98                                      ; dest hi
tcol  = (camX >> 7)                                ; 8-px tile column
[$C101] = ((dir ? tcol - 4 : tcol + $16)) & $1F    ; BG map column 0..31
mcol  = (dir ? camX_hi - 2 : camX_hi + $0B)        ; metatile column
HL = $D000 + (mcol & $7F) * 32
half = bit7([$FFA3])                               ; 0 = left half, 1 = right half
for r in 0..15:
    mt = [HL]; HL += 2
    [$C102 + r*2 + 0] = $C368[mt*4 + (half ? 2 : 0)]
    [$C102 + r*2 + 1] = $C368[mt*4 + (half ? 3 : 1)]
```

VBlank (`00:066E`) then writes those **32 bytes down the BG column** with stride
`$20` starting at `$98xx`, clears `$C100`, and skips the whole block when
`$FFB0 == 6`. On levels 9 and `$0A` it instead forces `H = $99` and skips the
first 8 source bytes (`00:0688`), writing only rows 8..30 - the top 8 tile rows
of those stages are a static parallax band.

Constants: lead ahead `+$16` tiles / `+$0B` metatiles; trail behind `-4` tiles /
`-2` metatiles.

`$C732` (camera right clamp, `camX_max = $C732 - 5`) comes from the byte table
**`0:$103F`** (14 bytes): `7F 21 71 0B 51 11 51 0B 7F 60 0C 60 60 0B`.

### 1.8 Spawn tables (bank 5) - completing the level record

```
5:$46EC   14 × 3 {src_lo, src_hi, count}   -> count × 32 bytes copied to $C268 (enemies)
5:$4716   14 × 3 {src_lo, src_hi, count}   -> count × 16 bytes copied to $C1E8 (map objects)
1:$7C7D   14 × 8 resource indices, $FF-terminated   -> sub_00_0B15 (tile loads)
1:$7CED   14 × 2 {startX_metatile, startY_metatile} -> $FF81 / $FF83 ($FF82 := $80)
0:$1015   14 bytes: bit7 = reset player state, low nibble -> $C73E (level sub-type)
0:$103F   14 bytes: $C732 camera clamp
0:$1023   14 bytes: level BGM id   /  0:$1031: alternate BGM id (SoundRequest B=id,C=3)
3:$7BF9   14 × LE ptr: stage-name VRAM script, prefixed by a 1-byte length
```

The spawn blobs are **verbatim images of the actor records** (recon-2 §2.1/§2.2
layouts); slots beyond `count` are zero-filled.

| lv | enemies (src ×n) | objects (src ×n) |
|---|---|---|
| 1 | `5:$4740` ×6 | `5:$4E80` ×4 |
| 2 | `5:$4800` ×3 | - |
| 3 | `5:$4860` ×8 | `5:$4EC0` ×8 |
| 4 | `5:$50D0` ×1 | - |
| 5 | `5:$4960` ×6 | `5:$4F40` ×4 |
| 6 | `5:$4A20` ×1 | `5:$4FA0` ×1 |
| 7 | `5:$4A40` ×6 | `5:$4F80` ×2 |
| 8 | `5:$50F0` ×1 | - |
| 9 | `5:$4B00` ×6 | - |
| 10 | `5:$4BC0` ×8 | - |
| 11 | `5:$5110` ×1 | - |
| 12 | `5:$4CC0` ×6 | `5:$4FE0` ×8 |
| 13 | `5:$4D80` ×8 | `5:$5060` ×7 |
| 14 | `5:$5130` ×2 | - |

---

## 2. TILE DATA - inventory, and the compression question

### 2.1 There is no compression

`sub_00_0B15` → `sub_00_09FB`, which is a literal `LD A,[HL+] / LD [DE],A /
INC DE / DEC BC` memcpy. The player-tile streamer (`00:2C13`) and the
BG-animation streamer (`00:3127`) are equally plain 16/32-byte copies. There is
**no decompressor in the ROM**: no LZ window, no run-length pass over tile bytes,
no bit-reader. The only "compression" is the **VRAM-script tilemap RLE**
(`sub_00_0A0E`, §7.1), which only ever writes tilemap bytes, never tile data.

Search evidence: every `CALL $09FB` site (`$0A01, $0B35, $28AD, $33AF, $33DE,
$341B, $344B, $3579, …`) targets VRAM, `$C368`, or `$C61B`. `$0B15` is the sole
path from ROM into `$8000-$97FF` other than the two 16/32-byte streamers, and it
is a memcpy.

### 2.2 Resource table `0:$0B43` (36 × `{bank, ptr_lo, ptr_hi}`)

Each `ptr` heads a 4-byte header `{dest_lo, dest_hi, len_lo, len_hi}` followed by
`len` raw 2bpp bytes.

| idx | bank | src | dest | len | tiles | payload |
|---|---|---|---|---|---|---|
| `00` | 2 | `$4000` | `$80C0` | `$0340` | 52 | `2:$4004-$4343` |
| `01` | 6 | `$4000` | `$8E00` | `$0200` | 32 | `6:$4004-$4203` |
| `02` | 6 | `$54B0` | `$8800` | `$0470` | 71 | `6:$54B4-$5923` - **FONT** |
| `03` | 3 | `$7E54` | `$8D00` | `$0100` | 16 | `3:$7E58-$7F57` |
| `04` | 3 | `$7D70` | `$9000` | `$00E0` | 14 | `3:$7D74-$7E53` |
| `05` | 6 | `$4204` | `$90E0` | `$0720` | 114 | `6:$4208-$4927` |
| `06` | 4 | `$586C` | `$8E00` | `$0200` | 32 | `4:$5870-$5A6F` |
| `07` | 2 | `$6BB2` | `$90E0` | `$0720` | 114 | `2:$6BB6-$72D5` |
| `08` | 2 | `$4344` | `$8400` | `$0840` | 132 | `2:$4348-$4B87` |
| `09` | 2 | `$4B88` | `$8E00` | `$0200` | 32 | `2:$4B8C-$4D8B` |
| `0A` | 4 | `$4000` | `$90E0` | `$0680` | 104 | `4:$4004-$4683` |
| `0B` | 2 | `$72D6` | `$8E00` | `$0100` | 16 | `2:$72DA-$73D9` |
| `0C` | 4 | `$45A4` | `$9570` | `$0290` | 41 | `4:$45A8-$4837` |
| `0D` | 4 | `$4838` | `$8FC0` | `$0040` | 4 | `4:$483C-$487B` |
| `0E` | - | unused (`$FFFF`) | | | | |
| `0F` | 4 | `$487C` | `$8E00` | `$0200` | 32 | `4:$4880-$4A7F` |
| `10` | 4 | `$4A80` | `$90E0` | `$0720` | 114 | `4:$4A84-$51A3` |
| `11` | 4 | `$51A4` | `$8E40` | `$01C0` | 28 | `4:$51A8-$5367` |
| `12` | 4 | `$5368` | `$90E0` | `$0500` | 80 | `4:$536C-$586B` |
| `13` | 4 | `$6114` | `$8D80` | `$0280` | 40 | `4:$6118-$6397` |
| `14` | 4 | `$5A70` | `$90E0` | `$06A0` | 106 | `4:$5A74-$6113` |
| `15` | 4 | `$6398` | `$8400` | `$0680` | 104 | `4:$639C-$6A1B` |
| `16` | 4 | `$6A1C` | `$8400` | `$0900` | 144 | `4:$6A20-$731F` |
| `17`,`18` | - | unused (`$FFFF`) | | | | |
| `19` | 6 | `$4928` | `$8400` | `$0460` | 70 | `6:$492C-$4D8B` |
| `1A` | 6 | `$4D8C` | `$8400` | `$0720` | 114 | `6:$4D90-$54AF` |
| `1B` | 6 | `$5924` | `$8C70` | `$0690` | 105 | `6:$5928-$5FB7` |
| `1C` | 2 | `$73DA` | `$8400` | `$0BC0` | 188 | `2:$73DE-$7F9D` |
| `1D` | 6 | `$5FB8` | `$8C80` | `$0160` | 22 | `6:$5FBC-$611B` |
| `1E` | 6 | `$648C` | `$8400` | `$09E0` | 158 | `6:$6490-$6E6F` |
| `1F` | 6 | `$6E70` | `$9000` | `$0800` | 128 | `6:$6E74-$7673` |
| `20` | 4 | `$7320` | `$8400` | `$0C00` | 192 | `4:$7324-$7F23` |
| `21` | 6 | `$7735` | `$9000` | `$07F0` | 127 | `6:$7739-$7F28` |
| `22` | 5 | `$5398` | `$8400` | `$0BC0` | 188 | `5:$539C-$5F5B` |
| `23` | 5 | `$5374` | `$8C70` | `$0020` | 2 | `5:$5378-$5397` |

Per-level lists (`1:$7C7D`, applied in order after the intro-screen loads
`$02`,`$1D`,`$05` from `00:3374`):

```
lv 1: 00 01 04 05 03 15      lv 8: 00 09 04 0A 0D 1C
lv 2: 00 01 04 05 03 15      lv 9: 00 0F 04 10 08
lv 3: 06 07 03 00 04 15      lv10: 00 0F 04 10 11 12 08
lv 4: 06 07 03 00 04 22      lv11: 00 0F 04 10 11 12 1E
lv 5: 00 09 04 0A 16         lv12: 00 13 04 14 1A
lv 6: 00 0B 04 0A 0C 19      lv13: 00 13 04 14 16
lv 7: 00 09 04 0A 0D 16      lv14: 00 13 04 14 20
```

### 2.3 Other raw tile blobs (not in the resource table)

| span | contents |
|---|---|
| `2:$4D8C-$5073` | player animation table, 31 × 24 B (§4.4) |
| `2:$5074-$61A3` | player animation tiles, 275 distinct 16-B tiles |
| `2:$61A4-$61C1` | 14 × LE ptr - per-level BG-animation source table |
| `2:$61C2 …` | BG-animation tile blobs (32 B = 2 tiles each) |

### 2.4 VRAM layout (LCDC = `$E7` - this matters)

`rLCDC` is written as `$E7` at `00:0263, 02BD, 03D5, 0EBC, 0EE3, 0F32, 338D,
3696, 36F7, 3737, 3778, 3875` - **every single write in the ROM**. `$E7` =
`1110 0111`:

| bit | value | meaning |
|---|---|---|
| 7 | 1 | LCD on |
| 6 | 1 | window map `$9C00` |
| 5 | 1 | **window enabled** |
| 4 | **0** | **BG/Window tile data `$8800`, SIGNED ids** |
| 3 | 0 | BG map `$9800` |
| 2 | 1 | **OBJ size 8×16** |
| 1 | 1 | OBJ enabled |
| 0 | 1 | BG enabled |

So a JS renderer must resolve BG tile id `n` as
`n < $80 ? $9000 + n*16 : $8800 + (n-$80)*16`, and OBJ tile id `n` as
`$8000 + (n & $FE)*16` for a 16-px-tall sprite. Tile `$2F` (`$92F0`) is the
blank fill used by the boot VRAM clear.

---

## 3. COLLISION

### 3.1 The collision byte

The **odd** byte of each `$D000` metatile cell. Produced at load time by
`coll = translate[level][metatile_id]` where

```
3:$7A2A   14 × LE ptr -> per-level metatile-id → collision-byte LUT
```

| levels | LUT | entries used |
|---|---|---|
| 1, 2 | `3:$7A46` | 80 |
| 3, 4 | `3:$7A96` | 76 |
| 5–8 | `3:$7AE2` | 82 |
| 9 | `3:$7B34` | 67 |
| 10, 11 | `3:$7B77` | 63 |
| 12–14 | `3:$7BB6` | 67 |

Bit layout:

```
 7 6 5 | 4 3 2 1 0
 slot  |   type
```

* **bits 7-5** = owning `$C1E8` actor slot (0..7), used *only* for type `$1F`
  cells. Recovered by `sub_01_4BE8`: `A & $E0; SRL A` → byte offset `slot*16`.
  Written by `01:43D8`: `LD A,[$C75A]; SWAP A; ADD A,A; OR $1F` = `(slot<<5)|$1F`.
* **bits 4-0** = type. Values `$FD`/`$FF` are special-cased *before* the mask.

Values present in the 6 ROM LUTs (whole-ROM histogram):

| value | count | meaning |
|---|---|---|
| `$00` | 401 | air / passable |
| `$01` | 425 | solid |
| `$02` | 20 | solid + conveyor **right** (`$C72F := +4`) |
| `$03` | 20 | solid + conveyor **left** (`$C72F := -4`) |
| `$04` | 8 | level-exit / kill trigger → `00:272C` |
| `$05` | 8 | trigger → `00:272C` (horizontal probe only), solid to the floor probe |
| `$06` | 7 | **breakable** - sets the cell to 1 and arms a restore timer |
| `$07` | 18 | solid (also used as the "invisible wall" id past the metatile table) |
| `$08` | 54 | **water** - passable, sets `$FF96 = $80` (sprite-priority/behind-BG flag) |
| `$1F` | 28 | **door / actor-owned destructible** (slot bits filled in at runtime) |
| `$20` | 14 | pickup: **energy** +6 HP |
| `$21` | 14 | pickup: **batarangs** +10 |
| `$22` | 14 | pickup: **max-HP** +2 (cap 16) |
| `$FD` | 3 | **spike / hazard**, 4 damage |

Written at runtime but never in a LUT: `$FF` (plain solid, e.g. `01:43BE`), and
`$XX|$1F` with non-zero slot bits.

### 3.2 The probe routine - `sub_00_20BA` (bank 0)

```
IN : BC = signed Y offset (12.4), DE = signed X offset (12.4), [$C72B] = mode
OUT: A  = 0 (passable) or the collision byte (blocked / special)
     $FFB6/$FFB7 = probe X hi/lo, $FFB8/$FFB9 = probe Y hi/lo
     $FFC0 = probe metatile column, $FFC1 = probe metatile row
     $FFBA = result, $FFBB/$FFBD = map address of the hit cell
```

```
20BA  HL = playerY($FF83:$FF84) + BC ; $FFB8=H, $FFC1=H, $FFB9=L
20CA  if H >= $20: return 0                      ; above/below the world
20D3  HL = playerX($FF81:$FF82) + DE ; $FFB6=H, $FFC0=H, $FFB7=L
20E3  HL = WorldToMapAddr(B=Xhi, C=Yhi); INC HL  ; -> the collision byte
20E7  B  = [HL]
      if B != 0:
          if [$C72B] == 4: goto 2418  (floor: slope refinement, see 3.3)
          if [$C72B] == 5 and B == 8: fall through as "empty"   ; punch ignores water
          return B
      ...cell empty: walk to the neighbouring cell in the probe direction
         mode < 3  -> 227C  (horizontal sweep over the hitbox height)
         mode >= 3 -> 210C  (vertical sweep, ±1 metatile)
```

`$C72B` probe modes: **1** = horizontal (`sub_00_1EF9`, `DE=+$0080`, `BC=0`),
**3** = up/ceiling (`sub_00_1EA6`, `BC = -$FF8C*16`), **4** = down/floor
(`sub_00_1DB9`, `BC = +$FF8D*16`), **5** = punch (`00:1FBA`).

### 3.3 Slopes

If the floor/ceiling probe hits a non-empty cell, `$2418`/`$21A6`/`$2348` look at
the **even** byte (the metatile *graphic* id) of the *previous* cell and, for a
small set of ids, index a 16-entry sub-tile height table with `$FFBC` (the
sub-tile pixel offset 0..15) and snap the player's Y (or X) to the slope surface.

| level range | metatile id | up-table (`$C72B==3`) | down-table (`$C72B==4`) | X-tables (`mode 1`) |
|---|---|---|---|---|
| `$FFB0 < 3` | `$29` | `$225B` | `$224C` | `$23E8` |
| | `$2C` | - | `$223C` | `$23D8` |
| | `$2E` | `$224B` | - | `$23D8` |
| | `$31` | `$223B` | - | `$23C8` |
| | `$32` | - | `$222C` | `$23C8` |
| | `$34` | - | `$221C` | `$23B8` |
| | `$36` | `$222B` | - | `$23B8` |
| `3 ≤ lvl < $0C` | (none - always `$2418`) | | | |
| `$FFB0 ≥ $0C` | `$3E` | `$226B` | `$225C` | `$23F8` |
| | `$3F` | `$227B` | `$226C` | `$2408` |

Height tables (16 bytes each, sub-tile Y in 1/16-px units):

```
$221C  80 70 60 50 50 40 20 10 00 00 00 00 00 00 00 00
$222C  50 30 20 10 10 00 00 00 00 00 00 00 00 00 00 00
$223C  A0 A0 70 50 40 30 30 20 10 10 00 00 00 00 00 00
$224C  50 30 20 10 10 00 00 00 00 00 00 10 10 20 30 50
$225C  B0 90 70 50 30 30 20 20 10 10 00 00 00 00 00 00
$226C  70 40 30 20 10 10 10 00 00 00 00 00 00 00 00 00
(the up-tables $222B/$223B/$224B/$225B/$226B/$227B are the same arrays offset by -1)
$23B8  F0 E0 D0 D0 C0 A0 90 80 80 80 80 80 80 80 80 80
$23C8  C0 A0 90 80 80 80 80 80 80 80 80 80 80 80 80 80
$23D8  10 F0 E0 C0 B0 A0 A0 90 90 90 80 80 80 80 80 80
$23E8  C0 A0 90 80 80 80 80 80 80 80 80 80 80 80 80 80
$23F8  10 F0 D0 B0 B0 A0 A0 90 90 80 80 80 80 80 80 80
$2408  E0 B0 A0 90 80 80 80 80 80 80 80 80 80 80 80 80
```

Metatile ids `$3E`,`$3F`,`$40`,`$41` are also the four cells of the **door**
block written by `01:43D5-$43F4` together with collision `(slot<<5)|$1F`.

### 3.4 Per-mode dispatch of the returned byte

Floor probe `sub_00_1DB9` (`$1DDA`):

```
$FD -> return 0 (spikes don't stop a fall)     $FF -> return $FF (solid)
(v & $1F) == $1F -> land ($FF84=0, $FF87=0), return 1
v >= $20 -> JP 1:$4D4E  (pickups; $20/$21/$22 handled, everything else -> 0)
$01,$05,$07 -> land            $02 -> land + $C72F=+4      $03 -> land + $C72F=-4
$04 -> 00:272C (level exit)    $06 -> breakable (00:1E65)  $08 -> $FF96=$80, return 0
$09 -> return 1 (land, keep velocity)     other -> return v (solid)
```

Ceiling probe `sub_00_1EA6` (`$1EC9`): `0`→0; `$FF`→`$FF`; `$FD`→spike damage
(4 HP, 90 invuln frames), except level 5 while airborne → return 1;
`(v&$1F)==$1F` → `$C71E=0`, return 1; `v>=$20` → `1:$4D4E`; `$08` → `$FF96=$80`,
return 0; other → return v.

Horizontal probe `sub_00_1EF9` (`$1F08`): `0`→0; `$FD`/`$FF`/`(v&$1F)==$1F` →
wall (`$C71E=0`, wall-cling check at `$1F33`); `v>=$20` → `1:$4D4E`;
`$05`→`00:272C`; `$06`→breakable; `$07`→`$1F61`; `$08`→`$FF96=$80`, return 0;
other → wall.

**Breakable (`$06`)** `00:1E65`: sets the collision byte to `1`, then allocates a
slot in the 8×3-byte timer array at `$C67B` `{timer, Xhi, Yhi}` with
`timer = $40 / $0C / $04` by difficulty `$C756`. On expiry `sub_00_1336`
(`$135D`) zeroes both map bytes, re-queues metatile 0 into the BG, and spawns
effect `$97`.

**Pickups** `1:$4D4E`: `$20` = +6 HP (sound `$13`), `$21` = +10 batarangs (sound
`$14`), `$22` = +2 max HP capped at 16 (sound `$15`) and sets a `$C754` bit for
levels 3/5/13. All three then zero both map bytes and re-queue metatile 0.

---

## 4. METASPRITE FORMAT

### 4.1 The two tables

```
5:$5F5C   243 × LE ptr   -> sub_00_0BC6   (table 1, the default)
5:$736B   105 × LE ptr   -> sub_00_0BAF   (table 2)
```

Table 1 occupies `5:$5F5C-$6141`, its data `5:$6142-$736A`.
Table 2 occupies `5:$736B-$743C`, its data `5:$743D-$7FFF`.
Entry counts derived by scanning forward until the pointer table would overlap
the lowest pointed-to address; every pointer is in-bank and monotone-ish.

Table 2 is selected instead of table 1 for the *enemy* draw on levels
`$04`, `$0B`, `$0E` (`01:6078-$608E`; same test at `01:5D13/5D1A`,
`01:78A0`, `01:797A/7998`, `01:79CB/79D1`).

### 4.2 Entry layout

A metasprite is a flat array of **4-byte OAM records**, terminated by `$FF` in
the *first* byte of the next record:

```
+0  dy    signed, added to B (screen Y)
+1  dx    signed, added to C (screen X)
+2  tile  OAM tile id (8×16 mode: hardware uses tile & $FE and tile | $01)
+3  attr  OR'd with [$FF9E] before storing
$FF  terminator
```

Observed lengths: 4–15 records. Attr bits are the standard DMG OAM ones:
b7 = BG priority, b6 = Y-flip, b5 = X-flip, b4 = OBP1.

### 4.3 `sub_00_0BC6` / `sub_00_0BAF`

```
IN : A = attribute OR-mask (stored to $FF9E)
     E = metasprite index (0..242 / 0..104)
     B = screen Y base, C = screen X base
0BC6  $FF9E := A;  bank := 5;  DE := E*2
0BD8  HL := [$5F5C + DE]              ( $0BAF: HL := [$736B + DE] )
0BDF  E := [$FF9D]  (shadow-OAM cursor)   D := $C0
0BE4  loop:
        if E >= $A0: $FF9D := $A0; bank := 1; return      ; 40-sprite cap
        [$C000+E++] := [HL++] + B          ; OAM Y
        [$C000+E++] := [HL++] + C          ; OAM X
        [$C000+E++] := [HL++]              ; tile
        [$C000+E++] := [HL++] | [$FF9E]    ; attr
        if [HL] == $FF: break
0C02  $FF9D := E;  bank := 1;  return
```

The Y/X adds are 8-bit with wraparound - off-screen sprites are simply parked
at whatever wrapped value results (OAM Y `0` or `≥ $A0` hides them).

### 4.4 Player animation (`$FFC3` / `$FFC4` / `$FFC5`) - `sub_00_2C13`

The player is **not** a metasprite table entry animation. It is a fixed 6-sprite
metasprite (index 0 = facing-left, index 1 = facing-right, both in table 1) whose
**12 OBJ tiles `$00-$0B` are re-streamed from bank 2 every frame**.

```
ms1[0] (facing left,  attr $30 = Xflip|OBP1):
   (-16,+4,$00) (-16,-4,$04) (-16,-12,$08) (0,+4,$02) (0,-4,$06) (0,-12,$0A)
ms1[1] (facing right, attr $10 = OBP1):
   (-16,-12,$00) (-16,-4,$04) (-16,+4,$08) (0,-12,$02) (0,-4,$06) (0,+4,$0A)
```

⇒ a 24×32 px figure: **column `c` (0..2) uses OBJ tiles `4c` (top 16 px) and
`4c+2` (bottom 16 px)**.

```
2:$4D8C   31 × 24 bytes, indexed by [$FFC3] (anim id 0..30)
          entry = 3 groups × 4 LE tile pointers      ; group == column, NOT time
0:$32D2   3 × 2 bytes {dest_lo, dest_hi} = $8000, $8040, $8080
```

```
sub_00_2C13 (called every frame from the main loop, 00:05C9):
  if [$FFC4] == 0 and [$FFC3] == [$FFC5]:      ; nothing to stream
      [$FFC5] := [$FFC3]; [$FF99] := 0; goto BG-anim ($3127)
  bank := 2
  HL := 2:$4D8C + [$FFC3]*24 + [$FFC4]*8
  for t in 0..3:  copy 16 bytes from [HL + t*2] to $C58B + t*16
  bank := 1
  [$FF9A] := lo, [$FF99] := hi  from 0:$32D2 + [$FFC4]*2
  [$FFC4] := ([$FFC4] + 1) % 3
```

VBlank (`00:07BC`) then does `DE = ([$FF99]<<8) | [$FF9A]; HL = $C58B;
CALL $C4CB` - the generated unrolled 64-byte copier - pushing 4 tiles into VRAM.
So after an animation change it takes **3 frames** to fully repaint the player;
once `$FFC4` wraps back to 0 with an unchanged id, streaming idles.

The player draw itself is `00:1D0C`:

```
1D0C  C := [$FF93] (screen X), B := [$FF94] (screen Y)
1D13  if [$C714] (invuln) != 0 and ([$C714] & $08) == 0: skip drawing  ; blink
1D1C  E := [$FF8B]  (= Facing XOR 1  ->  metasprite index 0 or 1)
1D1F  if grounded, CALL $0F56 (vehicle bob: B += $FE/$FD every 8th frame
                               on levels 6, 9, $0A, $0B)
1D27  A := [$FF96]  (attr mask; $80 = behind BG, set by water collision)
1D29  CALL $0BC6
1D2C  hitbox := 0:$27A8 + [$FFC3]*2   -> $FF8C (half-width), $FF8D (half-height)
```

Anim ids seen in bank 0: `$11`/`$12` wall-cling, `$13`/`$14` turn-around
(table `0:$1BD3` = `14 13`), plus the walk/jump sets selected around
`00:1BD5-$1C37` via tables `0:$2786`, `0:$2796`, `0:$1C1F`, `0:$1C2F`.

### 4.5 HUD metasprites

`sub_00_0F7B` (main loop `00:0573`, so the HUD occupies OAM slots 0..N):

```
BC := $1810                              ; Y = $18 (24), X = $10 (16)
hp := min([$FF8A], 10)
E  := (hp == 0) ? $81 : $82 + ((hp-1) >> 1)      ; ms1[$81..$86]
A  := 0;  CALL $0BC6
if [$FF8E] (max HP) > 10:
    tbl := ($FF8E == 12) ? 0:$100C : ($FF8E == 14) ? 0:$100E : 0:$1011
    C  := max([$FF8A] - 10, 0);  C := (C + 1) >> 1
    E  := [tbl + C];  BC := $1838 ; A := 0; CALL $0BC6
```

`0:$1008` = `81 82 83 84 8A 8B 8C 8D 8E 8F 90 91 92`. Each of `ms1[$81..$86]` is
5 sprites (a 40×16 px, 5-segment energy bar); `$81` = empty, each step fills one
more segment.

---

## 5. OAM / SPRITE PIPELINE

* **Shadow OAM = `$C000-$C09F`**, 40 × 4 bytes `{Y, X, tile, attr}`. DMA'd by the
  HRAM stub at `$FFF0` (`LD A,$C0; LDH [rDMA],A; 40-cycle wait; RET`), called
  first thing in VBlank (`00:0664`). OAM itself is never written directly.
* **Cursor `$FF9D`**, monotonically increasing, `+4` per sprite, hard-capped at
  `$A0`. Overflow is silently dropped (`00:0BE7`) - **there is no sorting and no
  priority system**: OAM order == call order, and DMG priority is
  lowest-OAM-index-wins for overlapping sprites.
* **`sub_00_0C1F` ClearUnusedOAM** zero-fills `$C000 + $FF9D` … `$C0A0` and
  resets `$FF9D = 0`. Called at `00:064A` (end of the main loop) and around every
  screen transition. Y = 0 hides a sprite.
* **Draw order in the main loop** (= OAM index order):
  1. `00:0573 → $0F7B` HUD energy bar (up to 10 sprites)
  2. `00:05AD → $0BC6` per-level overlay (`E=$34`, attr `$10`, BC=`$1880`)
  3. `00:05BA → 1:$4230` `$C1E8` map objects (incl. `1:$411C`, `1:$4150` bat-rope)
  4. `00:05BD → $1336` delayed-restore effects, `$C693` effect pool
     (`00:13C7`, `00:141E`), `$C6CF` ballistics
  5. `00:05C6/05C9/05CC` per-level logic, player tile stream, `$3A35`
  6. `00:05CF → 1:$4E0C` enemies (`1:$6087` / `1:$608E`)
  7. player itself, drawn from the player state machine via `00:1D29`
* **8×16 OBJ always** (LCDC bit 2 set at every write). Tile ids in metasprites are
  even; the hardware pairs `tile & $FE` / `tile | $01`.
* **Flipping** comes only from the metasprite `attr` byte (bit 5 X, bit 6 Y) OR'd
  with `$FF9E`. The player picks a *different metasprite* (index 0 vs 1) rather
  than flipping.
* **OBJ palettes**: `$FFAE` → OBP0, `$FFAF` → OBP1, written to hardware in VBlank
  (`00:0806`). Level entry sets `$FFAD/$FFAE = $E4`, `$FFAF = $C4` (`00:29B9`).
  STAT state 6 overrides OBP0=`$90` / OBP1=`$80` mid-frame (§6).

---

## 6. RASTER EFFECTS - the `$0857` STAT/LYC state machine

`rSTAT` is only ever set to `$40` (LYC=LY interrupt). `rIE` is `$05`
(VBlank+Timer) when no split is armed and `$07` when one is. `$FFC7` holds the
state; the ISR dispatches on it and re-arms `rLYC` itself.

Mode assignment at level entry (`sub_00_0D50`):

| levels | `$FFC7` | initial `rLYC` | other setup |
|---|---|---|---|
| 1, 2 | **6** | `$80` | `$FFAC` (WY) = `$80`, `rIE=$07`, `$C328/$C348 = $40` |
| 9, `$0A`, `$0B` | **2** | `$00` | `rIE=$07`, VRAM script `7:$7A5E` |
| 6 | **0** | `$22` | `rIE=$07`, `$FFCA=$07`, `$FFCB=$FFC9=0`, script `7:$7B77` |
| all others | **0** | - | `rIE=$05` - **STAT disabled, no splits** |
| stage-clear screen `00:35A0` | **5** | `$90` | `$FFAC=$90`, `$FFAB=$07` |
| ending scroll `00:38A0` | **7** | `$00` | `$C763=0`, `$C766=0`, `$FFAE=$1B` |

VBlank always restores `rSCX = $FFA9`, `rSCY = $FFAA` at line 144 (`00:081E`),
and for state 7 also resets `rLYC=0`, `$C764=$C765=0` and ping-pongs the
palette-cycle counter `$C765` 0..11 every 8th frame.

### State-by-state

**0 - `$0878`** (level 6 foreground/background split; also the idle state)
```
if (frameCounter & 7) == 0 and not paused: rSCY := $FFAA - 2
rSCX := $FFCC                 ; parallax offset, computed by 00:2F4B
rLYC := $70 ;  $FFC7 := 1
```

**1 - `$0898`**
```
rSCX := $FFA9 ; rSCY := $FFAA ; rLYC := $22 ; $FFC7 := 0
```
Net: lines `$22..$6F` scroll at `$FFCC`, lines `$70..$8F` at `$FFA9`.

**2 - `$08A9`** (levels 9/`$0A`/`$0B`, three-layer parallax; fires at LY 0)
```
rSCX := [$C742] ; rSCY := $FFAA ; rLYC := $30 ; $FFC7 := 3
```

**3 - `$08BC`** (fires at LY `$30`)
```
rSCX := [$C743]
if (frameCounter & 7) == 0 and not paused: rSCY := $FFAA + 3
rLYC := $40 ; $FFC7 := 4
```

**4 - `$08DD`** (fires at LY `$40`)
```
rSCX := $FFA9 ; rLYC := 0 ; $FFC7 := 2
```
Net per frame: lines 0-47 use `$C742`, 48-63 use `$C743`, 64-143 use `$FFA9`.
`$C742` is incremented by 1/frame and `$C743` by 3/frame at `00:0597`/`00:059E`.

**5 - `$08EA`** (stage-clear screen only)
```
rWX := $A8       ; pushes the window off-screen for the rest of the frame
```

**6 - `$08F0`** (levels 1 & 2 - the chemical-vat water)
```
B := rLY
if rLY >= $90 or [$C755] >= $90: rLYC := $8F; return
i    := (( rLY >> 1 ) + [$FFB1]) & $1F
rSCX := $FFA9 + sine[i]                       ; sine = 0:$09A2, 32 signed bytes
rOBP1 := $80 ; rOBP0 := $90                   ; darker sprites below the surface
n := rLYC + 4
rLYC := (n < $8F) ? n : [$C755]
```
`0:$09A2` (signed):
```
00 00 03 05 06 08 09 0A 0A 0A 09 08 06 05 03 00
00 00 FD FB FA F8 F7 F6 F6 F6 F7 F8 FA FB FD 00
```
`$C755` is the **screen Y of the water surface** - computed at `00:2E36` from the
16-bit world Y in `$C70A/$C70B` minus the camera, clamped to 0 or `$90`, and it
is *also* written to `$FFAC` (WY). So: the window (map `$9C00`) draws the water
body from the surface line down, and the wobble re-arms every 4 scanlines from
the surface line to line `$8C`. WX is `$FFAB = $07` (set once at boot,
`00:0215`), i.e. window x = 0.

**7 - `$0935`** (ending credits - fractional vertical scroll)
```
rLYC++                                   ; fires on EVERY scanline
[$C765] += [$C763]                       ; 8.8 fraction accumulator
[$C764] += carry
A := rSCY + [$C764]
if A >= $44: rBGP := $1B ; $FFAC := rLYC ; rLYC := 0
rSCY := A
```

**A JS port must therefore support**: per-scanline SCX (state 6, up to ~36 splits
via the 4-line re-arm), per-scanline SCY (state 7), 2–3 SCX bands (states 0–4),
mid-frame BGP/OBP0/OBP1 changes, and mid-frame WX/WY.

### Window usage

`rWX/rWY` shadows are `$FFAB`/`$FFAC`, pushed in VBlank (`00:0806`).
Defaults `$FFAB = $07` (x=0), `$FFAC = $90` (off-screen). Window map `$9C00` is
built at level entry: `00:04C9` fills `$9C40-$9FFF` with tile `$01`, then the
VRAM script `0:$32A3` writes row 0 = 20 × `E0 E2 …` and row 1 = 20 × `E1 E3 …`.

---

## 7. TEXT / HUD / FONT

### 7.1 VRAM-script format (`sub_00_0A0E` / `sub_00_0A14`)

```
repeat:
   dest_hi := [DE++]         ; $00 terminates the script
   dest_lo := [DE++]         ; BIG-endian!  HL = dest
   ctrl    := [DE++]
   count   := ctrl & $3F
   mode    := ctrl >> 6
   mode 0 ($0A27): copy `count` stream bytes to [HL++]                (horizontal run)
   mode 1 ($0A2E): read one stream byte, write it `count` times [HL++] (horizontal RLE)
   mode 2 ($0A35): copy `count` stream bytes, HL += $20 each          (vertical run)
   mode 3 ($0A42): read one stream byte, write `count` times, HL += $20 (vertical RLE)
```

Note mode 3 consumes the fill byte *after* the loop (`$0A4D INC DE`), mode 1
before it - both are correct 1-byte RLE.

Callers: `00:023B, 0294, 02AE, 0381, 03BB, 04DA, 071B (VBlank drain of $C61B),
0E27, 0E97, 0EFB, 115D ($C160 column build), …`

### 7.2 Charset

The font is resource `$02`: `6:$54B4-$5923`, 71 tiles, loaded to VRAM `$8800`.
With LCDC bit 4 = 0 the BG tile id for `$8800 + n*16` is `$80 + n`:

| char | tile ids |
|---|---|
| `0`–`9` | `$80`–`$89` |
| `A`–`Z` | `$8A`–`$A3` |
| further glyphs (punctuation, HUD art) | `$A4`–`$C6` |
| space / blank | `$2F` (`$92F0`; the boot VRAM fill value) |

Verified by rendering `rip/tiles/res02_b6_54B0_to_8800.png`.

### 7.3 HUD

* Energy bar: **sprites**, `sub_00_0F7B`, §4.5. No tilemap HUD in-game.
* Lives (`$C767`): not drawn during play; only on the title/continue screen
  (`00:03BE`) and the stage-intro screen.
* Stage-intro screen (`sub_00_333F`): loads resources `$02`,`$1D`,`$05`, clears
  the BG map with tile `$DC` (`sub_00_34A4`), copies the `$37`-byte VRAM script
  `3:$7C15` (or `3:$7C4C`) into `$C61B`, appends the per-level stage-name script
  from `3:$7BF9 + (lvl-1)*2` (length-prefixed, staged into `$C61B` with the
  length kept in `$FFA0`), appends the 31-byte boss banner `0:$3485` on levels
  4/8/`$0B`/`$0E`, and draws metasprite `ms1[$F2]` (15 sprites) at `BC = $5858`.

### 7.4 Background tile animation - `loc_00_3127`

Runs right after the player tile stream, using the *same* `$FF9B` VBlank slot as
nothing else during play.

```
if paused or [$FF9B] != 0: return
bank := 2
src_base  := [2:$61A4 + (lvl-1)*2]              ; $FFFF = level has no BG anim
srcptr    := [src_base + [$C70F]*4 + [$C710]*2]
copy 32 bytes (2 tiles) from srcptr to $C5CB
bank := 1
dst_base  := [0:$31EE + (lvl-1)*2]
[$FF9C] := lo, [$FF9B] := hi  of [dst_base + [$C710]*2 + [$C711]*4]
[$C710]++
if [$C710] == 2:
    [$C710] := 0
    [$C70F] := ([$C70F] + 1) < [0:$3295 + lvl-1] ? [$C70F]+1 : 0
    [$C711] := [ [0:$3246 + (lvl-1)*2] + [$C70F] ]
```

VBlank `00:074E` then copies the 32 bytes from `$C5CB` to
`DE = ([$FF9B]<<8)|[$FF9C]` (16 `INC E`, one `INC DE`, 16 `INC E`) and clears
`$FF9B`.

| lv | src tbl (bank 2) | dest tbl (bank 0) | seq tbl (bank 0) | seq len `0:$3295` |
|---|---|---|---|---|
| 1, 2 | `$61C2` | `$320A` | `$3262` | `$0C` |
| 3, 5, 7 | `$61F2` | `$321A` | `$326E` | `$12` |
| 6 | `$623A` | `$3232` | `$3280` | `$09` |
| 12, 13 | `$6282` | `$323E` | `$3289` | `$0C` |
| 4, 8, 9, 10, 11, 14 | - | - | - | - |

Sequences: `$3262` = `00 01 02 03` ×3, `$326E` = `00..05` ×3, `$3280` =
`00 01 02` ×3, `$3289` = `00 01` ×6.

---

## 8. QUICK REFERENCE - all graphics tables

| addr | shape | consumer |
|---|---|---|
| `0:$0B43` | 36 × 3 `{bank, ptr}` | `$0B15` tile-resource loader |
| `0:$09A2` | 32 signed bytes | STAT state 6 sine wobble |
| `0:$1008` | 13 bytes | HUD second-bar metasprite ids |
| `0:$1015` | 14 bytes | level sub-type / player-reset flag |
| `0:$1023`, `0:$1031` | 14 bytes each | level BGM ids |
| `0:$103F` | 14 bytes | `$C732` camera clamp |
| `0:$1BD3` | 2 bytes | turn-around anim ids `$14 $13` |
| `0:$221C`–`0:$227B` | 6 × 16 bytes | slope Y-height tables |
| `0:$23B8`–`0:$2408` | 6 × 16 bytes | slope X-snap tables |
| `0:$2786`, `0:$2796`, `0:$1C1F`, `0:$1C2F` | anim-id tables | player animation select |
| `0:$27A6` | 2 bytes | wall-jump X velocity |
| `0:$27A8` | 31 × 2 bytes | per-anim hitbox `{halfW, halfH}` |
| `0:$31EE` | 14 × LE ptr | BG-anim VRAM dest tables |
| `0:$3246` | 14 × LE ptr | BG-anim frame sequences |
| `0:$3295` | 14 bytes | BG-anim sequence lengths |
| `0:$32A3` | VRAM script | window/HUD bar at `$9C00` |
| `0:$32D2` | 3 × 2 bytes | player tile stream dests `$8000/$8040/$8080` |
| `0:$3337` | 4 bytes | blinking-cursor sprite ids |
| `0:$3485` | 31 bytes | boss-stage banner script fragment |
| `1:$7C7D` | 14 × 8 bytes | per-level resource index list |
| `1:$7CED` | 14 × 2 bytes | player start `{Xmetatile, Ymetatile}` |
| `2:$4D8C` | 31 × 24 bytes | player animation → 3 × 4 tile ptrs |
| `2:$61A4` | 14 × LE ptr | BG-anim source tables |
| `3:$4000` | 16 × LE ptr | level maps |
| `3:$7A2A` | 14 × LE ptr | metatile → collision LUTs |
| `3:$7BF9` | 14 × LE ptr | stage-name VRAM scripts (length-prefixed) |
| `3:$7C15`, `3:$7C4C` | `$37` bytes each | stage-intro VRAM scripts |
| `5:$4000` | 14 × 4 bytes | metatile definition blocks → `$C368` |
| `5:$46EC` | 14 × 3 bytes | enemy spawn blobs → `$C268` |
| `5:$4716` | 14 × 3 bytes | object spawn blobs → `$C1E8` |
| `5:$5F5C` | 243 × LE ptr | metasprite table 1 |
| `5:$736B` | 105 × LE ptr | metasprite table 2 |
| `6:$611C` | ≥12 × LE ptr | (`00:3520`, menu/ending art - not graphics-critical) |

---

## 9. DUMP PROOF

`tools/riplevel.py` and `tools/ripgfx.py` reconstruct the formats above from
scratch (no emulator, stdlib only - `zlib` for the PNG IDAT).

Produced under `rip/`:

* `rip/levels/levelNN.png` - all 14 levels, full-size (`width*16 × 256`),
  built by: bank-3 map → bank-5 metatile defs → per-level `$0B15` resources
  replayed into a simulated VRAM → signed `$8800` BG tile lookup → 2bpp decode.
  Level 1 renders as the recognisable Ace Chemicals interior; level 12 as the
  cave stage with ladders, spikes and `?` item boxes; level 9 as the vehicle
  stage. **This is the proof that §1, §2.4 and the metatile ordering are right.**
* `rip/levels/levelNN_coll.png` - same image with a per-metatile collision-class
  corner marker.
* `rip/levels/levelNN.txt` - width, metatile defs with their collision byte and
  class, and the raw map grid.
* `rip/tiles/resXX_*.png` - all 34 valid resources as 16-wide tile sheets;
  `res02` visibly contains the `0-9 A-Z` font, confirming §7.2.
* `rip/player/animXX.png` + `rip/player_tiles_2_5074_6BB1.png` - the 31 player
  animations (3 columns × 4 tiles) and the whole player tile blob.
* `rip/sprites/t1/*.png`, `rip/sprites/t2/*.png` - every metasprite in both
  tables, composited in 8×16 mode with flips, against the first level VRAM in
  which its tiles are non-blank. `t1/134` is the full energy bar; `t2/000` is a
  walking thug.

---

## 10. OPEN / UNCONFIRMED

| item | evidence that would settle it |
|---|---|
| Levels 9–14 read metatile id `= len/4`, one past the copied table, so its 4 tile ids are stale `$C368` bytes. | Dump `$C470-$C473` after `sub_00_2889` in an emulator. |
| `$C130` 2×2 queue capacity is 8 records (bounded by `$C160`); never checked in code. | Log max `$FF9F` over a level. |
| Which OBJ tiles each enemy type uses - the metasprite tile ids are absolute, and each level loads a different `$8400`-region resource, so table-1 entries are only meaningful for the levels that load the matching sheet. The ripper brute-forces 4 candidate levels per entry. | Per-level enemy-type → metasprite-id mapping from `1:$60EF` handlers. |
| Metasprite entry counts (243 / 105) are derived from the pointer/data boundary, not from a bound check in code; `$0BC6` will happily read past the table. | Log the max `E` passed to `$0BC6`/`$0BAF`. |
| STAT state 7's `$C763` (scroll fraction) source. | Trace `00:38A0` on the ending. |
| `6:$611C` pointer table contents (title/ending art, reached via `00:3520`). | Out of scope for gameplay rendering. |
