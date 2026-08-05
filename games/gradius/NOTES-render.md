# Gradius — the renderer, measured

**Everything in this file was read out of the running cartridge**, either as PRG bytes or
through the oracle (`tools/oracle/videoprobe.py`, `palprobe.lua`, `chrsheet.py`,
`rendercheck.py`, `rendergate.py`). Where a number came from the listing it says so, and it
was then confirmed against the hardware. At least thirty fall-through incidents across the
three games are the reason for that rule — see `docs/knowledge/02-traps.md`, which explains
why that is a deduplicated floor rather than a running count.

**The claim this file makes, and the evidence for it:** the model below rebuilds a Gradius
frame **pixel for pixel**. `rendercheck.py` renders 256×240 from the measured PPU state and
compares all **61,440 pixels** against the frame Mesen produced. On every natural frame
measured it prints `0`. Twelve `--break` switches deliberately lie about one rule each, and
each one has been watched go red.

---

## 0. What the port needs, in one page

| | |
|---|---|
| screen | 256 × 240, no border. `game.json` `display.screen` |
| bands | **exactly two**, split at **scanline 212**. Not a general per-scanline model |
| band A | scanlines **0–211**. scroll = (`$12`, `$13`), PPUCTRL = `$10`, CHR bank = table[`$2D`] |
| band B | scanlines **212–239**. scroll = (0, `$13` — Y does *not* reset), nametable X = 0, CHR bank **1** |
| CHR | 4 × 8 KB, whole bank switched. **Background** takes band B's bank at scanline 212, **sprites** at scanline **213** |
| sprites | 8×16, priority by **OAM index only**, **8 per scanline**, OAM Y is *top − 1*, no horizontal wrap |
| palette | 32 bytes of palette RAM; `$3F00` is the universal backdrop for every transparent pixel |
| mirroring | vertical: `$2800` **is** `$2000`, `$2C00` **is** `$2400` |

Everything else on this page is why each of those lines is written the way it is.

---

## 1. The registers that drew the frame are not the ones in zero page

The first thing to get right, and the easiest to get wrong.

```
$9A79: A5 3E  LDA $3E / 85 12  STA $12     ; the state machine, DURING the frame,
                                           ; loads $12 for the NEXT one
$8281: AD 02 20 A9 20 8D 06 20 A9 00 8D 06 20 AE 02 20
       A6 12 8E 05 20   A6 13 8E 05 20   A6 10 8E 00 20   60
       $8293 STX $2005 (X=$12) / $8298 STX $2005 (X=$13) / $829D STX $2000 (X=$10) / $82A0 RTS
```

`$8281` is called from the NMI at `$809C`, in vblank. **That** write is what drew the
frame. Reading `$12`/`$13`/`$10` at the `$80B5` sample point instead gives you the *next*
frame's scroll — a renderer one frame ahead of the game, which looks almost right.

`videoprobe.lua` therefore latches band A with a hook on **`$82A0`**, the RTS, after all
three stores. Same shape as `PROBE.md`'s `$9C` trap: the value that would not converge was
the measurement, not the game.

Measured over 4,200 frames of boot + play:

```
band A PPUCTRL  = $A8   on 1795/1795 gameplay frames (and on the title screen)
band A PPUMASK  = $1E   on 1795/1795
band A scroll Y = 12    on every gameplay frame; 0 in every other mode
```

`$A8` decodes as: nametable `$2000`, VRAM increment 1, **sprite patterns `$1000`**,
**background patterns `$0000`**, **sprites 8×16**, NMI enabled.
`$1E`: background on, sprites on, leftmost 8 pixels shown for both, no greyscale, no
colour emphasis. Both of those are *reads of the byte the ROM stored*, not deductions.

---

## 2. The nametables, and why the nametable-select bit never changes

The ROM does compute a nametable bit — it is right there:

```
$9A79: A5 3E   LDA $3E        ; level scroll, low byte
$9A7B: 85 12   STA $12
$9A7D: A5 3F   LDA $3F        ; level scroll, high byte
$9A7F: 4A      LSR A          ; carry = bit 0 of $3F
$9A80: A5 10   LDA $10
$9A82: 29 FC   AND #$FC
$9A84: 69 00   ADC #$00       ; ... into PPUCTRL bit 0
$9A86: 85 10   STA $10
```

and it **never fires**: `$3F` reads 0 on every frame measured, and `bandA_ppuctrl` is `$A8`
on all 1,795 gameplay frames of a 2,200-frame run. Reading the listing alone you would
build a two-nametable scroller. Measuring says something simpler is going on:

```
nt.bin, PPU $2000-$27FF at a gameplay frame:
  tile rows differing between $2000 and $2400 : [28, 29]
  attribute tables differ                     : False
```

**The two nametables are byte-identical except tile rows 28 and 29** — the status bar,
which exists only in `$2000`. So the playfield is a **256-pixel treadmill written into both
nametables at once**: `$12` runs 0…255 and wraps, the PPU's own coarse-X overflow pulls the
right-hand side of the screen out of `$2400`, and because `$2400` holds the same columns the
wrap at 255→0 is invisible. That is why the base nametable bit can stay 0 forever.

Mirroring is **vertical**, checked two ways that can disagree:

```
header flags6 = $31 -> bit 0 = 1 = vertical
live PPU read : $2000 == $2800  True      $2400 == $2C00  True      $2000 == $2400  False
```

### Vertical scroll wraps into the status bar

`$13` = **12** during gameplay, so screen scanline *s* shows nametable pixel row 12 + *s*.
At *s* = 228 that reaches 240, the PPU's coarse-Y wraps 29→0 **and toggles the
nametable-Y bit** — which under vertical mirroring lands back on the same physical
nametable. So:

| screen scanlines | nametable rows |
|---|---|
| 0 – 211 | 1½ – 27 (the playfield) |
| 212 – 227 | 28, 29 (the status bar proper) |
| 228 – 239 | **0, 1** — the top of the nametable, wrapped round |

A renderer that clamps instead of wrapping loses the bottom 12 scanlines.
`--break scrolly` (pretend `$13` = 0) costs **1,746 – 9,034 px**.

---

## 3. The sprite-0 split, dot by dot

```
$9A98: A5 15 D0 07 A5 5B D0 03      ; two gates: $15 and $5B must both be 0
$9AA0: 20 EE 98   JSR $98EE
$9AA3: AD 02 20   LDA $2002
$9AA6: 29 40      AND #$40          ; sprite-0 hit
$9AA8: F0 F9      BEQ $9AA3         ; spin
$9AAA: 20 C3 8B   JSR $8BC3         ; $8BC3: LDX #$59 / DEX / BNE  -- a pure delay
$9AAD: AD 02 20   LDA $2002         ; reset the $2005/$2006 write latch
$9AB0: A2 00      LDX #$00
$9AB2: 8E 05 20   STX $2005         ; band B scroll X = 0
$9AB5: 8E 05 20   STX $2005         ; band B scroll Y = 0   (has NO effect, see below)
$9AB8: A5 10      LDA $10
$9ABA: 29 FC      AND #$FC          ; band B nametable bits = 00
$9ABC: 8D 00 20   STA $2000
$9ABF: A0 02      LDY #$02
$9AC1: 20 9E 8A   JSR $8A9E         ; band B CHR bank
```

Measured, with the PPU scanline/dot at each instruction (five consecutive frames, to show
the jitter):

| | scanline | dot |
|---|---|---|
| spin exits (`$9AAA`) | **207** | 273 – 288 |
| `$2005` pair (`$9AB2`) | **211** | 216 – 248 |
| `$2000` (`$9ABC`) | **211** | 255 – 287 |
| CNROM latch (`$8AA4`) | **211 or 212** | 318 – 340 / 2 – 23 |

The spin runs **1,919 – 2,186 iterations** — a little over half the frame with the CPU
doing nothing else. Sprite 0 itself is constant: `y=206 tile=$6D attr=$23 x=248`.

`splitSl` (the scanline of the `$2005` pair) was **211 on 1,795 of 1,795** gameplay frames.
Band B therefore begins at **scanline 212**, because writes to `$2005`/`$2000` land in the
PPU's `t` register and the horizontal half of `t` is only copied into `v` at **dot 257** of
each scanline. The scanline the write happens on still renders with the old scroll.

Three consequences worth writing down before somebody rediscovers them:

1. **The `$2005` Y write at `$9AB5` does nothing.** The vertical half of `t` is copied into
   `v` only on the pre-render line. Band B keeps band A's Y scroll — which is exactly why
   the bottom 12 scanlines wrap to nametable rows 0–1 (§2) instead of showing rows 0–1 of
   the status bar.
2. **The `$2000` write lands *after* dot 257** (255–287 measured), so its nametable-X bit
   takes effect one scanline *later* than the scroll does. In stage 1 both bits are 0, so
   it never shows; a port that ever sets the bit must not assume they move together.
3. The `$8BC3` delay before the writes is not decoration — it is what puts them in the
   hblank window at all.

---

## 4. CHR: four banks, and the swap that carries the status bar

```
$8A9C: A4 2D        LDY $2D
$8A9E: B9 A8 8A     LDA $8AA8,Y
$8AA1: 99 A8 8A     STA $8AA8,Y      <- the CNROM latch. write == ROM byte, because
$8AA4: 99 A8 8A     STA $8AA8,Y         CNROM has a bus conflict
$8AA7: 60           RTS
$8AA8: 30 32 31 33                   <- the table.  bank = byte & 3
```

so the selector `$2D` maps **0→bank 0, 1→bank 2, 2→bank 1, 3→bank 3**. Two callers:

* `$8A7D  JSR $8A9C` — in vblank, from the VRAM-queue routine `$8A51`. This is **band A**.
* `$9AC1  LDY #$02 / JSR $8A9E` — inside the split. This is **band B**, and it is always
  `$8AA8[2] = $31 → bank 1`.

Census of `$2D` over 4,200 frames of boot and play:

| game mode | `$2D` | band-A CHR bank | frames |
|---|---|---|---|
| 0, 1, 3 (title / menu) | 3 | **bank 3** | 281 |
| 4, 5 (stage 1 gameplay) | 0 | **bank 0** | 3,919 |
| — | 1 | bank 2 | **never observed** |

**Which bank is live when, for stage 1: bank 0 for scanlines 0–211, bank 1 for 212–239.**
Confirmed independently by `mapper.chrMemoryOffset0` (0 → 8192 at the latch) and by hashing
the emulator's live `$0000-$1FFF` window against the four banks in the file
(`rendercheck.py` prints `live CHR window at the sample point == file bank(s) [1]`).

### Why the swap is load-bearing — look at the sheets

`chrsheet.py` renders each bank in the palettes measured off the same frame:

* **bank 0**, pattern table `$0000`: stage-1 terrain and the starfield. **No HUD font.**
* **bank 1**, pattern table `$0000`: `GAME OVR`, `SPEED UP`, `MISSILE`, `DOUBLE`, `LASER`,
  `OPTION`, the digits, `HI`, `1P` — the entire status bar.
* **bank 3**, pattern table `$0000`: the GRADIUS title logo.
* **bank 2**, pattern table `$0000`: organic/cell-like terrain — a later stage. Consistent
  with `$2D` = 1 never occurring in 4,200 frames of stage 1, but the *identification* is
  me looking at a picture, not a measurement; treat it as a lead, not a fact.
* pattern table `$1000` is *nearly* the same in all four banks — **46 of 256 tiles differ**
  between banks 0 and 1 — which is why the sprite half of the swap is measurable at all.

So without the mid-frame swap the status bar draws with terrain tiles.
`--break chrbank` costs **845 – 5,024 px on scanlines 212–239**, depending on the frame.

### The swap is not one clean line: background and sprites move on different scanlines

The PPU prefetches. Sprite patterns for scanline *N* are fetched during dots 257–320 of
*N−1*; the first two background tiles of *N* during dots 321–336 of *N−1*. The latch lands
after all of that.

Measured by injecting three 8×16 sprites straddling the boundary, built from a tile pair
that differs between banks 0 and 1 (`STRADDLE` in `rendergate.py`), on two frames whose
latch fell on different scanlines:

| sprite bank switches at | wrong pixels |
|---|---|
| scanline 212 (same as the background) | **26** |
| **scanline 213** | **0** |
| scanline 214 | 31 |

**Sprites take band B's CHR one scanline later than the background does.** That is the
default in `rendercheck.py`; `--break sprbank0` puts it back and costs 26 px.

---

## 5. Palettes

Palette RAM is filled by the VRAM queue at `$8A51`, which walks a command buffer at `$0700`
and pushes it through `$2006`/`$2007` (`$8A69`, `$8A70`, `$8A88`) during vblank. Read
straight out of `$3F00-$3F1F` at a stage-1 gameplay frame:

```
bg0 $3F00: 0F 12 30 0F      sp0 $3F10: 0F 0C 26 30
bg1 $3F04: 0F 27 30 0F      sp1 $3F14: 0F 0C 2C 30
bg2 $3F08: 0F 19 2A 30      sp2 $3F18: 0F 21 26 30
bg3 $3F0C: 0F 07 17 26      sp3 $3F1C: 0F 06 26 30
```

The title screen is different (`bg0 0F 30 30 0F`, `bg2 0F 26 06 1C`, …), so palette RAM has
to be part of the compared state, not a constant.

`$3F00` is the **universal backdrop**: every transparent pixel — background colour 0,
and every pixel where no sprite wins — takes `$3F00`, not the colour-0 entry of its own
palette. Here that is invisible (all eight entry-0 slots read `$0F`), which is precisely
why it must be written down rather than discovered later on a frame where it is not.

### The index→RGB table, measured rather than cited

The comparison needs to turn NES colour indices into the RGB Mesen emits. Deriving that
table *from the comparison* would make the check prove nothing
(`docs/knowledge/03`, "two sides of a comparison must be independently derived), so
`palprobe.lua` measures it: force the game's PPUMASK shadow `$11` to 0 (rendering off →
the PPU outputs `$3F00` everywhere), drive `$3F00` through 0…63, and read the resulting
frame back. 64 colours, worst-frame majority 0.825.

That script had to be fixed once, and the way it failed is the useful part: the first
version demanded a **solid** frame and rejected 54 of the 64 colours. The ten it accepted
were exactly the black ones — which is what showed that some scanlines were keeping their
picture (the ROM has six `STA $2001` sites and one of them re-enables rendering for a band
around scanlines 32–87 on the title screen). Majority vote plus a re-read of `$3F00` after
the frame — because a stale backdrop would have produced a perfectly convincing solid frame
of the wrong colour.

---

## 6. Sprites

* **8×16**, from `$2000` bit 5 in the byte the ROM actually stored (`$A8`). In 8×16 mode
  the OAM tile byte's **bit 0 selects the pattern table** and the pair drawn is
  `(tile & $FE, +1)`; **PPUCTRL bit 3 is ignored**. `--break sprsize` costs 150 – 1,820 px.
* **OAM Y is top − 1**: a sprite with `y` covers scanlines `y+1 … y+16`.
* **Priority is by OAM index only.** Proved by intervention, not citation: two overlapping
  sprites were injected with **the higher OAM index at the smaller X**, so the Game Boy's
  smaller-X-wins rule and the NES's lowest-index-wins rule predict *different* colours in
  the overlap. Lowest index wins. `--break prioX` costs **47 px on scanlines 60–74**.
* **8 per scanline**, taken in OAM order; the 9th and 10th are dropped, not flickered by the
  PPU (the *game* flickers, by rotating its shadow-OAM base `$2F` — `PROBE.md`). Ten
  injected sprites on one line produced exactly **64 lit pixels spanning x = 8…183** — the
  first eight — with indices 28 and 29 absent. The limit bit on 31 scanlines of that frame.
* **Attribute byte**: bits 0–1 palette (`$3F10 + n*4`), bit 5 priority (1 = behind opaque
  background), bit 6 horizontal flip, bit 7 vertical flip. All four flip combinations were
  injected and rendered.
* **No horizontal wrap**: a sprite injected at x = 252 drew 4 columns and stopped.
* **Sprite 0 is not special to the renderer** — but it is to the frame loop: it is what the
  split spins on, and it must be evaluated on its scanline or `$9AA3` never exits. It is
  index 0, so the 8-per-scanline rule can never drop it.

---

## 7. The boundary scanline itself, and the limit of the model

The two-band model above is **pixel-exact on every natural Gradius frame measured**. It is
not exact on the boundary scanline *if something is drawn there*, and stage 1 draws nothing
there — screen scanlines 211–212 are blank in the opening. That blankness is also what made
the boundary checks vacuous at first: `--break boundary+1` scored **0 px** on natural
frames. Painting nametable rows 26–29 through the oracle (`--vram`, clearly synthetic, and
labelled as such) makes them cost 127 and 178 px.

With content there, two sub-scanline effects appear:

1. **Fine X changes immediately, mid-scanline.** The first `$2005` write also loads the
   PPU's 3-bit fine-X latch, which is *not* part of `t`/`v` and takes effect at once. So
   the right-hand tail of scanline **211** already draws with band B's fine X (0) while its
   coarse X and nametable are still band A's. Measured transition ≈ `writeDot + 11` (a
   4-wide bracket on one frame, exactly 11 on two others).
2. **The first two background tiles of scanline 212 were prefetched with band A's CHR
   bank** (dots 321–336 of scanline 211). Modelling the leftmost **16 pixels** of scanline
   212 with band A's bank takes one synthetic frame from 14 wrong pixels to 0.

Both are behind `rendercheck.py --refine`, off by default, because the plain model is exact
on everything the game actually draws. With `--refine` the synthetic frames go to 0 as
well — except, on any given run, whichever of them drew the unlucky jitter, which keeps
**6 wrong pixels on scanline 212** because the latch landed mid-tile-fetch.
**That residual is honest and unresolved**: the exact pixel at which each of the three
changes bites depends on where in the scanline the CPU's writes land, and that jitters by a
few dots frame to frame with the sprite-0 spin — so the residual moves between frames from
run to run.

`rendergate.py` does not average that away. It requires every **natural** frame to be
exactly 0 and holds the synthetic frames to a **stated bound: ≤ 6 px, and never off
scanlines 211–212**. Both halves have been seen to fail — tightening the bound to 5 px
turns the gate red, and reclassifying a synthetic frame as natural turns it red.

**For the port:** two bands, boundary at 212, and do not put anything on scanlines 211–212
that you expect to be exact.

---

## 8. The evidence, and how to re-run it

```
python games/gradius/tools/oracle/rendergate.py            # the whole thing, ~4 min
python games/gradius/tools/oracle/rendergate.py --quick
python games/gradius/tools/oracle/videoprobe.py --at 1200  # one frame, with a report
python games/gradius/tools/oracle/rendercheck.py --dir out/video/f1200 --all-breaks --png
python games/gradius/tools/oracle/chrsheet.py --state out/video/f1200 --outdir out/video/sheets
```

### The corpus, and what each frame can see

| frame | what it is |
|---|---|
| `f400` | stage 1 opening, natural |
| `f1200` | later, natural, different scroll phase |
| `f2600` | **title screen** — a full nametable, three background palettes, **no split** |
| `inj` | 20 injected sprites over natural background |
| `sb810` | sprites straddling the band boundary, tiles that differ between banks |
| `inj2` | injected sprites **and** painted boundary rows (synthetic) |
| `gx802` | painted boundary rows on a frame with different split jitter |

### The negative controls, all of which have been seen to fail

Measured on `inj2` (the frame that can see all of them):

```
--break band          4379 px  scanlines 212-239   one band only, no split
--break chrbank       5018 px  scanlines 212-239   band B keeps band A's CHR bank
--break boundary+1     127 px  scanlines 212-213   band boundary one scanline late
--break boundary-1     178 px  scanline  211       band boundary one scanline early
--break chrline+1      105 px  scanlines 212-213   CHR boundary one scanline late
--break chrline-1      214 px  scanline  211       CHR boundary one scanline early
--break sprsize       1784 px  scanlines  60-229   8x8 sprites instead of 8x16
--break prioX           47 px  scanlines  60-74    sprite priority by X (the DMG rule)
--break scrollx       3271 px  scanlines   0-211   background scroll X forced to 0
--break scrolly       9034 px  scanlines   0-239   background scroll Y forced to 0
--break sprbank0        26 px  scanline  212       sprites swap CHR with the background
```

`rendergate.py` prints, for every break, which frames **see** it and which are **BLIND** to
it, and fails if any break is seen by nobody. The title-screen frame is blind to all six
split-related breaks — correctly, there is no split there — and that is reported rather
than averaged away.

### ROM-derived outputs — none of these may be committed

`tools/oracle/out/video/**` : `pal.bin`, `nt.bin`, `oam.bin`, `chr.bin`, `ram.bin`,
`fb.bin`, `shot.png`, `mine.png`, `diff.png`, `dump.json`, `frames.json`,
`master_palette.bin`, and `sheets/bank{0..3}.png`. `out/` is already in
`tools/oracle/.gitignore`.

---

## 9. What has NOT been measured

* **Only stage 1's opening.** Every gameplay frame here is starfield; the runs die before
  the terrain appears, so no frame in the corpus has ground tiles in band A. Nothing here
  has been checked against a boss, a death animation, or stages 2–6. **First thing to do
  next:** get one frame with terrain on screen into `CORPUS` in `rendergate.py`. It is a
  one-line change once there is an input script (or a lives poke) that survives long
  enough — `NOTES-terrain.md`, from the parallel stage-data workstream, is the place to
  look. Terrain in band A is also what would make the boundary checks discriminating
  *without* the synthetic `--vram` painting.
* **CHR bank 2 has never been observed live** (`$2D` = 1 never occurred in 4,200 frames).
  Presumably a later stage.
* **The nametable-X bit has never been observed set** (`$3F` = 0 always). §2 explains why,
  but the explanation is measured on stage 1 only — if a later stage uses a 512-pixel
  treadmill instead, band B's `AND #$FC` at `$9ABA` starts to matter and the one-scanline
  lag of the `$2000` write (§3) becomes visible.
* **The `$15` / `$5B` gates at `$9A98`** decide whether the split runs at all. They were 0
  on every frame that mattered here; what sets them is not known.
* `$0D`, the blank-screen countdown that gates PPUMASK at `$808E`, was never non-zero in
  these runs. A stage transition presumably uses it.
