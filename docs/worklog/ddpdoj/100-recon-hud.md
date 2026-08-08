# 100 -- RECON: the HUD. Pen 0 is not transparent, the "gauge" is a number, and the combo counter has no art

status: **DONE.** (opened IN PROGRESS 2026-08-08, closed same day)

started: 2026-08-08. wave: 100. role: RECON (READ-ONLY; the only tree file I
write is this one; scratch lives in `.scratch/`, gitignored).
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.
instrument: the shipped bundle in `games/ddpdoj/assets/` driven headless
through `src/web/assets.js` `loadBundle` and `src/main.js` `Game` (the same
device `playgate.mjs` and `w63hudgate.mjs` use, so "the page would do this" and
"this measured this" are one statement); `games/ddpdoj/tools/oracle/out/maincpu.bin`
(address == file offset) via `tools/oracle/w27disasm.py`. Scripts:
`.scratch/hudprobe.mjs`, `hudrun.mjs`, `txcensus.mjs`, `txcells.mjs`, `bar.mjs`,
`b25b.mjs`, `rect.mjs`, `spr.mjs`, `corr.mjs`.

`[M]` = measured by me, this session.

---

## 0. THE HEADLINE, and the brief's premise is HALF right and half wrong

The brief asked me to disprove one hypothesis. The mechanism is right and the
constant it named is right; the ELEMENT it blamed is wrong, and the wrongness
matters because it sends two of the three defects to a different asset.

1. **Pen 0 is NOT transparent.** The TX transparent pen is **15**, stated twice
   in this tree's own code and once in its own exporter. `[M]` pen 0 is a real
   colour in **12 of the 15** text palette banks, and **bank 5's pen 0 is
   `$17B7` = RGB (41, 239, 189), CYAN**. `src/web/assets.js:594`'s comment
   `// txTile: pen 0 is unused/background` is **COMMENT TWELVE**.

2. **The cyan rectangle is the CHAIN HIGH-WATER COUNTER**, `$286040`, drawn as
   **TX text digits**, not a gauge and not a bar. `[M]` it sits at TATE screen
   pixels x48..63, y16..39 -- a 16 x 24 solid block -- immediately beside its
   own label `$C53D..$C54E`, which is the "partial MAX" in the recon's
   screenshot. It "jumps" because it is a BCD digit carry and it "freezes"
   because every glyph 1..9 is absent from the 159-tile TX sheet and the
   fallback paints all of them identically as pen 0 of bank 5.

3. **The hyper gauge `$81B642` is not the rectangle and never moves in this
   port.** `[M]` 0 changes in 1,500 frames. Its only non-clearing writer in
   `$230000..$2B0000` is `$2530D0 move.w #$95F,$81B642`, inside the hyper-item
   COLLECT arm `$2530BE`, and `src/items.js:179` `REFUSED_KINDS = [$0C, $14]`
   refuses to allocate the item at all.

4. **The combo counter's STATE runs, its sprites are EMITTED, and every one of
   its 50 digit streams is missing from the SPRITE sheet.** `[M]` 3,314 of
   3,357 bucket-25 records over 900 frames are dropped by `portSpriteList` for
   want of a packed stream. That is a different asset from the TX sheet and a
   different fix.

So the three defects the owner reported are **three defects in two asset
sheets**, and the pen 0 bug is a fourth thing sitting on top of the first.

---

## 1. PEN 0. Measured, and the transparent pen is 15

### 1.1 The code says 15, in three places

```
src/render/tiles.js:146   /** 64x32 tiles of 8x8 -> a (256, 512) u16 map.  `set_transparent_pen(15)`. */
src/render/tiles.js:160     out[o + x] = v === 15 ? TRANSPARENT : (base + v);
games/ddpdoj/tools/assets.py:164        "transparent_pen": 15
games/ddpdoj/tools/framerender.py:102   pal[t == 15] = 0xffff   # set_transparent_pen(15)
```

`src/web/assets.js:594` sets `TX_TRANSPARENT_PEN = 0`. Every missing TX tile is
therefore filled with a pen the renderer treats as **opaque**, and
`buildTxMap` resolves it to palette index `0x800 + colour*16 + 0`.

### 1.2 The palette, out of the bundle's own capture

`src/palette.js` establishes the three staging regions: words `$800..$8EF` are
TEXT/HUD, 15 banks of 16. `[M]` pen 0 and pen 15 of all 15 text banks, read out
of `bundle.cap.part(0, 'palette')`:

| bank | pen 0 | RGB | bank | pen 0 | RGB |
|---|---|---|---|---|---|
| 0 | `$28C5` | (82,49,41) | 8 | `$6FDE` | (222,247,247) |
| 1 | `$0C89` | (24,33,74) | 9 | `$7DEC` | (255,123,99) |
| 2 | `$0120` | (0,74,0) | 10 | `$0000` | (0,0,0) |
| 3 | `$2466` | (74,24,49) | 11 | `$7FFE` | (255,255,247) |
| 4 | `$28A6` | (82,41,49) | 12 | `$0000` | (0,0,0) |
| **5** | **`$17B7`** | **(41,239,189)** | 13 | `$2040` | (66,16,0) |
| 6 | `$7F96` | (255,231,181) | 14 | `$0000` | (0,0,0) |
| 7 | `$7FB7` | (255,239,189) | | | |

**pen 15 is `$0000` in all fifteen.** pen 0 is `$0000` in only three.

`[M]` the HUD's text draws use attribute `$000A` almost everywhere, which is
`colour = ($0A & $3E) >> 1 = 5`. **Bank 5. Pen 0 is cyan.** The owner's "solid
cyan/teal rectangle" is `$17B7` and nothing else on the page is that colour.

### 1.3 What that costs, exactly, on one frame

`[M]` frame 900 of an autofire run, every TX cell holding a tile the sheet does
not have:

```
bank 0: 5 cells, tilemap rows 4..8 col 54
        TATE px x32..71  y8..15    fill = $28C5 (82,49,41)     the SCORE digits
bank 5: 6 cells, tilemap rows 6..7 cols 51..53
        TATE px x48..63  y16..39   fill = $17B7 (41,239,189)   the CHAIN HIGH-WATER digits
```

That 16 x 24 cyan block is the owner's rectangle. Fixing the constant to 15
does not draw the counter; it makes the block **disappear**, which is a strictly
better wrong picture and a five-line change.

---

## 2. WHY IT "JUMPS" AND WHY IT "FREEZES". There is no fill bar

The coordinator's refinement proposed partial-fill tiles at a bar's leading
edge. **`[M]` DISPROVEN: there is no bar.** `$286040` is a four-slot BCD digit
readout with leading-zero suppression, and each digit is drawn by
`txPrint240E1A` with `d2=2 d3=0 d5=$A`, i.e. **three cells at base+0, base+10,
base+20** out of a per-slot ROM table.

`[M]` the four slot tables, read out of the image:

```
$287FFE slot 0: 0000 05aa 05ab 05ac 05ad 05ae 05af 05b0 05b1 05b2
$288026 slot 1: 05c7 05c8 05c9 05ca 05cb 05cc 05cd 05ce 05cf 05d0
$28804E slot 2: 05e5 05e6 05e7 05e8 05e9 05ea 05eb 05ec 05ed 05ee
$288076 slot 3: 0603 0604 0605 0606 0607 0608 0609 060a 060b 060c
```

plus `$C000` from the printer, so the emitted indexes are `$C5AA..$C620`.

`[M]` traced live, cells 435..437 (slot 2, the tens) and 499..501 (slot 3, the
ones) against `$81B5DA`:

```
f  50  chain=  5 (BCD $0005)  slot2 = $C541 IN SHEET (still the LABEL)  slot3 = $C61C MISSING
f  62  chain= 16 (BCD $0016)  slot2 = $C5E6 MISSING                     slot3 = $C617 MISSING
f 112  chain= 32 (BCD $0032)  slot2 = $C5E7 MISSING                     slot3 = $C617 MISSING
f1500  chain=147 (BCD $0147)  slot2 = $C5EE MISSING                     slot3 = $C606 MISSING
```

The label `$C53D..$C54E` is an 18-cell 3x6 block covering rows 2..7; the digits
**overwrite rows 6 and 7** of it when the count is non-zero. That is why the
recon's screenshot shows a *partial* label with a block glued to it.

**The freeze, stated precisely.** The ones digit becomes a missing tile at
chain 1 and the tens digit at chain BCD 10. From that moment on, every value
0..9 in either slot resolves to the same `out.fill(0)`, so the picture is
**pixel-identical for the rest of the run** while the number underneath changes
118 times. The two visible "jumps" are the two moments a slot goes from label
to block. There is no third jump, ever.

**No slot-0/1 tile and no slot-2/3 glyph is in the sheet.** `[M]` the sheet
holds `50493..50528` (`$C53D..$C560`, the label and the panel label) and then
nothing again until `50727`. All 119 indexes in `$C5AA..$C620` are absent.

---

## 3. STATE versus PICTURE, item by item

`[M]` 1,500 logic frames, AUTO held, count of distinct changes per word:

| word | address | changes | final | verdict |
|---|---|---|---|---|
| chain count P1 | `$81B5DA` | 118 | 147 | **STATE LIVE** |
| chain high-water P1 | `$81B632` | 79 | 147 | **STATE LIVE** |
| chain meter P1 | `$81B5C0` | 1096 | 49 | **STATE LIVE** |
| popup countdown P1 | `$81B5C8` | 1139 | 233 | **STATE LIVE** |
| popup value P1 | `$81B5DC` | 106 | 73 | **STATE LIVE** |
| score total P1 | `$81B440` | 4 | 4 | **STATE LIVE** |
| **hyper gauge P1** | `$81B642` | **0** | 0 | **STATE DEAD** |
| **hyper active P1** | `$81B63E` | **0** | 0 | **STATE DEAD** |
| **hyper stock P1** | `$81B6E0` | **0** | 0 | **STATE DEAD** |
| **hyper stock idx P1** | `$81B65C` | **0** | 0 | **STATE DEAD** |
| hyper level | `$81B654` | 0 | 0 | STATE DEAD |
| rank accumulator P1 | `$81B64A` | 0 | 0 | STATE DEAD |

### 3.1 The chain / combo counter

**STATE: computed, both of them.** `$81B5DA` (the live chain) and `$81B632`
(the high-water) both run. So does the popup countdown and its snapshot value.

**PICTURE: two separate pictures, and BOTH are art gaps, in DIFFERENT sheets.**

* The **high-water readout** `$286040` is ported (`src/hud.js:1452`
  `chainHiWater286040`), it writes into `TxVram`, and its glyphs are absent
  from the TX sheet. Section 2.
* The **live chain popup** `$2855B6` is ported (`src/hud.js:1136`
  `chainPopup2855B6`), it is CALLED every frame the countdown is non-zero
  (`src/hud.js:1636`), and it enqueues into sprite **bucket 25**.

`[M]` bucket 25 is drained by `$23D3E0`'s 29-bucket walk like every other
bucket -- `PRODUCED_BUCKETS` in `src/main.js:69` governs only what
`shipgate.mjs` SUBSTITUTES, not what renders, and `src/hud.js:90` is correct
but reads as if the records never reach the screen. They do:

```
[M] 900 frames: bucket 25 emitted 3,357 records, 0..4 per frame,
    mean display list 77.3 records/frame
```

and then:

```
[M] every one of the popup's 50 digit streams resolves to NO packed stream:
      $1C8F58..$1C912C   zoom 0, digits 0..9
      $1C9160..$1C9334   zoom 1
      $1C9368..$1C953C   zoom 2
      $1C9570..$1C9744   zoom 3
      $1C9778..$1C994C   the late path
    also NO stream:  $1CC4A0  the chain-meter BAR base ($2859DC)
                     $1CA008  the hyper-stock sprite icon ($285D26)
    HAS a stream:    $1CF060  the banner panel ($284F86)
```

`portSpriteList` zeroes the WIDTH of a record whose stream it cannot resolve,
so the record is skipped and everything behind it still draws
(`src/web/app.js:545-560`). `[M]` the correlation is one-to-one:

```
bucket-25 record count == display-list SKIPPED count on 847 of 900 frames
totals: 3,357 bucket-25 records, 3,314 skipped
```

The 53 mismatched frames are the first ~50, the slide-in, when the only
bucket-25 record is the banner panel, which has a stream.

**So "no combo counter is drawn at all" is exactly true, and the cause is the
SPRITE sheet, not the TX sheet, not pen 0, and not a missing port.** The code
runs, the numbers are right, the records reach the display list, and the art
is not in the bundle.

### 3.2 Hyper stock

**STATE: DEAD, and by a deliberate refusal.** `[M]` `$81B65C` and `$81B6E0`
never move. `src/items.js:179` `REFUSED_KINDS = [0x0c, 0x14]` refuses to
allocate hyper-stock items, and `src/items.js:288` notes it by address with a
long justification (granting the stock would plant an unspendable +16 rank per
level through `$285A62` / `$2608D2` while the hyper machine is unported). That
refusal is in the tree on purpose and is not a bug; it is the reason the
display can only ever show zero.

**PICTURE: ported and WORKING, for stock 0 only.** `src/hud.js:1382`
`hyperStock286ED6` is a real body; `[M]` it draws its 18 cells every frame,
tiles `$C426..$C437` (`$2883E6[0]`), and **all 18 are in the sheet**. The
stock icon renders correctly. It renders correctly because the count is zero.

`[M]` **PREDICTION for the fix wave, and it is a trap:** `$2883E6` entries
1..5 emit `$C438..$C491`, and the sheet holds **none** of them. The moment the
hyper item refusal is lifted, the hyper-stock icon becomes the second solid
block on the screen. `$2883E6` entries 6 and 7 are junk (`$02000000`,
`$06000000`) and `$81B65C` is uncapped at the increment, so a stock of 8 or
more throws `unreached` out of `RomWindows` rather than drawing anything.

### 3.3 The hyper gauge itself

`[M]` `$81B642`'s writers in `$230000..$2B0000` are five:

```
$2530D0  move.w #$95F,$81B642      the hyper-item COLLECT arm ($2530BE)  <- the ONLY setter
$25393C  move.w D0,$81B642         a bulk clear ($25392E)
$285AEC / $285B14                  inside the hyper END $285AF2, behind src/hud.js's throw
$285C70                            the READ, in the ported score row
```

So the gauge is **not an accumulator**. It is set to `$95F` (2,399) at pickup
and drained by the hyper machine. Recon 88's "2,400 units" is `[M]` **correct
as a magnitude** and wrong as a description of how it fills: nothing fills it
gradually.

`[M]` **and `src/hud.js:230` is wrong about its table.** The comment says
`panelTileTable: 0x2881f2, // 8 longwords, indexed by hyperlevel*4`. The next
table `rankIconP1` is at `$2882A6`, so the window is `$B4` = 180 bytes = **45
longwords**, and `$285C7E`'s `mulu #$16 / divu #$4B0` maps gauge 0..2399 onto
index 0..43. That is a **45-step** panel, which is the smooth progression the
owner is asking for -- it is just behind an item the port refuses to spawn.
Candidate comment thirteen; I did not disassemble `$2881F2`'s contents to
confirm all 45 are valid tile longwords, so I am calling the extent measured
and the contents unchecked.

### 3.4 What I could not settle

**The owner's "at some point I get a hyper and I can use it" does not
reproduce, and I cannot explain it.** `[M]` over 1,500 frames with AUTO held,
`$81B63E` (hyper active), `$81B658` (hyper request), `$81B65C` (stock) and
`$81B642` (gauge) are all flat zero, and the item that is the only source of
stock is refused at allocation. `src/web/input.js:45` exposes three buttons --
SHOT, BOMB, AUTO -- and no hyper control. My run holds one button and does not
move, so it collects nothing; a run that moves over items might differ, but the
refusal is unconditional on kind, so I do not expect it to. **Two readings are
open: the owner is describing the BOMB (which is ported, W64, and has real
stock), or there is a path to `$81B63E` I did not find.** This needs one
question to the owner, not more static work.

**`src/hud.js:105` is STALE and the brief was right to distrust it.** "the
HUD's STATE is this port's and the HUD's PICTURE is not. A player sees no score
row, no chain meter and no bomb icons" -- `[M]` W113/W116/W118 have since
ported the score row, the chain bar, the popup, the item row, the lives row,
the bomb row, the credit row, the hyper-stock row, the chain high-water row and
the panel labels. The picture code is all there. What is missing is **art**.

---

## 4. THE TX TILE INDEX LIST. It can be produced statically, and here it is

Producible. `src/hud.js` is the ONLY file in `src/` that writes TX; `src/isr.js:78`
and `:89` are the only two flush call sites.

**The word order, settled, because getting it backwards inverts everything:**
`TxVram.setLong` (`src/background.js:246`) writes `w[i] = v>>>16`, `w[i+1] = v`,
and `buildTxMap` (`src/render/tiles.js:149`) reads `tileno = txram[ti*2]`,
`attr = txram[ti*2+1]`. **The tile index is the HIGH word; the attribute is the
LOW word.** `$054F000A` is tile `$054F`, attr `$000A`. The printers' `| $C0000000`
adds `$C000` to the tile index, and `$C000 * 32 == $180000`, the offset of
`cave_t04401w064.u19` in `src/render/regions.js:19` -- so `$C000` is byte 0 of
the text ROM and `$C030..$C039` really are ASCII `'0'..'9'`.

### 4.1 The full static enumeration

```
index            decimal        what                                  producer
$0000                  0        score-digit blank                     hud.js:553
$C000              49152        EBC blank fill (clears lives slots)   hud.js:1334, :814
$C030..$C039  49200..49209      SCORE digits '0'..'9'                 hud.js:541, :560
$C200..$C211  49664..49681      hyper-stock table entry 6 (JUNK)      hud.js:1403
$C3EE..$C3FD  50158..50173      P2 bomb stock                         hud.js:1375
$C404..$C413  50180..50195      P1 bomb stock                         hud.js:1375
$C414..$C425  50196..50213      hyper ACTIVE icon                     hud.js:1405, :1590
$C426..$C491  50214..50385      hyper-stock icons 0..5                hud.js:1405
$C492..$C4C7  50322..50375      credit tens (2-digit)                 hud.js:1433
$C4C8..$C521  50376..50465      credit digit / ones                   hud.js:1420, :1437
$C522..$C53C  50466..50492      credit suffix                         hud.js:1423, :1442
$C53D..$C54E  50493..50510      CHAIN HIGH-WATER LABEL                hud.js:1454
$C54F..$C560  50511..50528      panel label                           hud.js:1478
$C5AA..$C620  50602..50720      CHAIN HIGH-WATER DIGITS (4 slots)     hud.js:1463
$C600..$C611  50688..50705      hyper-stock table entry 7 (JUNK)      hud.js:1403
$C627..$C62E  50727..50734      lives icons P1/P2                     hud.js:1328, :1361
```

Attributes emitted: `$0000`, `$000A` (bank 5), `$0012` (bank 9), `$0014`
(bank 10).

### 4.2 What the 159-tile sheet actually holds

```
0
49152 49184 49200 49217 49221 49232 49234 49235 49236
49862..49884 (with 49881 and 49883 absent)
50180..50195   50214..50231
50493..50528
50727 50728
50815..50870
```

### 4.3 The gap, as a shopping list

`[M]` a 1,500-frame autofire run writes **143 distinct (tile, attr) pairs**,
**77 tile indexes in the sheet and 66 missing**. Statically the shortfall is
larger because the run never exercises credits, lives changes or hyper stock:

| missing run | count | what | consequence today |
|---|---|---|---|
| `$C031..$C039` | 9 | score digits 1..9 (only `'0'` is present) | every non-zero score digit is a `(82,49,41)` block |
| `$C5AA..$C620` | 119 | ALL chain high-water digits, all 4 slots | **the cyan rectangle** |
| `$C438..$C491` | 90 | hyper-stock icons 1..5 | dormant; fires the moment the item refusal lifts |
| `$C3EE..$C3FD` | 16 | P2 bomb stock | 2P only |
| `$C492..$C53C` | 171 | credit rows and suffix | not exercised in play |
| `$C62D..$C62E` | 2 | lives icon variants | fires on a life change |

The two that a player sees on frame one are **`$C031..$C039`** and
**`$C5AA..$C620`**: 128 tiles, 8,192 bytes of 4bpp art.

---

## 5. WHAT THE FIX WAVE SHOULD DO, in order

1. **`src/web/assets.js:594`: `TX_TRANSPARENT_PEN = 0` -> `15`.** Five lines
   with the comment. It draws nothing new; it stops the port drawing solid
   blocks where it means to draw nothing, and it removes the single most
   misleading artefact on the screen. Delete the comment's claim; it is false.
   Consider the same audit for `BG_TRANSPARENT_PEN = 31` -- that one `[M]`
   matches `buildBgMap`'s `v === 31` and is correct.

2. **Ship the 128 TX tiles `$C031..$C039` and `$C5AA..$C620`.** That is the
   score and the chain counter, the two things the owner named. Add
   `$C438..$C491` in the same pass so the hyper stock does not become defect
   four later. The export path is `tools/export-web.mjs` / `tools/gfxsheet.py`;
   the sheet is currently built from the 161-frame capture, which is why it
   holds exactly the glyphs the recording happened to show (`'0'` and nothing
   else).

3. **Ship the bucket-25 sprite streams.** 50 popup digit streams
   (`$1C8F58..$1C994C`), the chain-bar base `$1CC4A0` and the hyper-stock icon
   `$1CA008`. Without them the live combo counter cannot appear no matter what
   happens to the TX sheet. `[M]` 3,314 records a run are being dropped.

4. **Then, and only then, the hyper.** It is a state problem, not a picture
   problem: `src/items.js` refuses the item on purpose and says why. Lifting
   that is `WAVE I3`'s job as `src/items.js:302` already states, and it needs
   `$2875B4..$287720` and `$285A12` ported first. Nothing in the HUD blocks it.

5. **Rewrite `src/hud.js:105`.** It has been false since W113.

6. **A gate.** There is no check anywhere in this tree that a tile the port
   writes exists in the sheet. `[M]` `missingTxTiles` is computed in
   `assets.js:594` and, unlike `missingBgTiles` (`:769`), is **never exported
   and never reported**. A three-line change makes the shortfall visible on the
   status line instead of visible as a cyan rectangle.
