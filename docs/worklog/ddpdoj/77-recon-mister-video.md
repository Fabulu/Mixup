# 77 - RECON: the MiSTer PGM core as evidence about the SPRITE AND VIDEO hardware

status: **DONE** - §9 is the change/verify list, §0 is the premise check, §10 is
what I could not determine. (Opened IN PROGRESS; the LOG at the foot is in the
order the findings arrived.)

role: RECON 2 of 2 on `MiSTer-devel/Arcade-IGSPGM_MiSTer`, cloned read-only at
`C:\programmieren\pgm-mister` (release tag `20260707`, single squashed commit
`cb19330`, so there is **no commit-message history to mine**).
RECON 1 owns TIMING/SLOWDOWN (`76-*`); this document does not touch it.
date: 2026-08-05.

**`[C]`** = a fact I read out of the core (file and module named).
**`[A]`** = something the core's AUTHORS say, in their own docs/comments/test ROMs.
**`[M]`** = something I measured or computed myself this session.
**`[I]`** = my inference, labelled as such.

---

## LICENCE - WHAT THIS DOCUMENT IS AND IS NOT

The core is **GPL v2/v3**; Mixup is MIT. **Nothing was copied, transliterated or
paraphrased from it into this repo** - not into `src/`, not into this file. No
line of Verilog, C or Python from that tree appears here or anywhere under
`games/`. The clone is not referenced by any build file, manifest, submodule or
path in this repository.

What is written below is **facts about a 1997 arcade board** - register
addresses, bit layouts, list terminators, priority order, limits - expressed in
our own words against our own addresses. Where I state a numeric table it is
either **our own ROM constant** (`src/zoomtable.js`) or a **popcount / bit-index
relationship I computed**, never a transcription of theirs.

Everything below cites the core as *a source consulted*. It is **not** an oracle:
see §0.

---

## 0. THE BRIEF'S PREMISE, CHECKED - the core is faithful in the FORMAT, functional in the PIPELINE

The brief asks whether the core is hardware-faithful or functional in the video
path. **It is both, in different places, and the split is sharp enough to be
stated as a rule.**

| area | verdict | why |
|---|---|---|
| **record layout, list terminator, register map, palette map, mask/colour stream format** | **FAITHFUL, and independently derived.** These are the highest-confidence findings in this document | `[A]` the authors wrote **test ROMs that run on the real board** (`testroms/pages/sprite_test.c`, `sprite_test2.c`) which build sprite records field by field and sweep scale/flip/count from an on-screen GUI; `[A]` they wrote a standalone B-ROM parser (`util/parse_brom.py`) that recovers the stream format from the cartridge itself |
| **CPU↔VRAM arbitration timing** | **FAITHFUL, and LOGIC-ANALYSER CALIBRATED** | `[A]` `docs/comments/rtl/igs023.sv.md` cites `util/vram_bench/results/LA_FINDINGS.md` - captures of a real IGS023 board - and fits the slot schedule to them to 100 ns. **This is RECON 1's material, not mine; I name it and stop** |
| **the sprite DRAW ENGINE's throughput** | **FUNCTIONAL.** Do not port numbers out of it | `[C]` the draw is a 32-deep rolling line-buffer that runs ahead of the beam, with a per-sprite 4-slot 64-bit colour cache over SDRAM and hit/miss counters. Those are FPGA memory-system artefacts. `[A]` the sim UI prints *"Draw reached N/224 lines (RAN OUT OF TIME)"* and a "window-stall" counter the authors describe as a death-spiral sign - i.e. the budget is modelled, but its *size* is the FPGA's, not the board's |
| **ZOOM** | **DELIBERATELY NOT WIRED TO THE GAME'S TABLE** - see §4, this is the most consequential finding | `[C]` the sprite scaler uses a **built-in 32-entry pattern table**; the CPU-written zoom registers at `$B01000` are decoded, readable and writable and then **used by nothing in the sprite path** |
| **BG zoom / `bg_scale` (`$B04000`)** | **NOT IMPLEMENTED**, and the authors say so in code | `[C]` the BG scaler's shift register is loaded with a constant zero and the real source is commented out. **This is the same hole MAME has** (`src/render/igs023.js:19` already records MAME's *"TODO: not implemented, unknown algorithm"*). Two independent emulators, same gap |

**So: weight §1–§3 and §5–§6 heavily. Weight §4 as a strong LEAD that needs its
own measurement. Do not take any throughput number from the core at all.**

One thing the brief got right that is worth stating loudly: **the core is not
derived from MAME in the video path.** Its sprite engine is a scanline state
machine with a wholly different shape from MAME's per-sprite blitter, and the
authors' README names MAME only as a source for protection and the sound chip.
Where it agrees with our renderer, that is genuine independent confirmation.

---

## 1. THE SPRITE LIST AS THE HARDWARE READS IT

### 1.1 The transport `[C]`

The chip is a **bus master**. It asserts BR/BGACK, takes the 68000's bus, and
reads the list **out of main work RAM as a flat word array starting at word 0**
- i.e. **`$800000`** - with a 16-bit word counter, five words per record.
It does **not** read the list from its own address space.

**This confirms our whole model of stage 4:** `$800000..$8009FF` is 1,280 words
= 256 records × 5 words, and `RAM_STRIDE = 5` is the hardware's stride, not a
convention. `src/render/spritelist.js` is right.

### 1.2 The record - five words, and every field confirmed `[C]` + `[A]`

The authors' on-board test ROM declares the record as a bitfield struct and the
RTL decodes the same five words. Both agree with `parseSpriteList` **field for
field, bit for bit**:

| word | bits | field | our parser |
|---|---|---|---|
| 0 | 15 | X zoom MODE (grow/shrink select) | `xgrow` ✔ |
| 0 | 14..11 | X zoom TABLE INDEX (4 bits) | `xzom` ✔ |
| 0 | 10..0 | X position, **signed 11-bit** | `x = sext(…,11)` ✔ |
| 1 | 15 | Y zoom MODE | `ygrow` ✔ |
| 1 | 14..11 | Y zoom TABLE INDEX | `yzom` ✔ |
| 1 | 10 | **unused - the chip ignores it** | masked out (`0xfbff`) ✔ |
| 1 | 9..0 | Y position, **signed 10-bit** | `y = sext(…,10)` ✔ |
| 2 | 15 | **unused - the chip ignores it** | masked out (`0x7fff`) ✔ |
| 2 | 14 | Y flip | `flip` bit 1 ✔ |
| 2 | 13 | X flip | `flip` bit 0 ✔ |
| 2 | 12..8 | colour bank (5 bits, 32 banks) | `color` ✔ |
| 2 | 7 | **priority** (1 bit) | `pri` ✔ |
| 2 | 6..0 | mask-ROM word address, high 7 bits | `offs` high ✔ |
| 3 | 15..0 | mask-ROM word address, low 16 bits | `offs` low ✔ |
| 4 | 15 | **unused** | ✔ |
| 4 | 14..9 | **width in 16-pixel columns** (6 bits) | `width` ✔ |
| 4 | 8..0 | **height in lines** (9 bits) | `height` ✔ |

**The two "unused" bits are a real hardware fact, not a DMA artefact.**
`spritelist.js` masks them because MAME's DMA drops them; the core shows the
chip simply never reads them. Same result, better reason.

`[A]` The address field is written by the test ROM as **byte-address ≥ 1**, i.e.
a **word offset** into the mask ROM - exactly our `offs`. Max reach 23 bits =
8 M words = the 16 MB mask ROM.

### 1.3 The terminator `[C]` + `[A]`

**The DMA stops when word 4's low 15 bits are all zero** - i.e. width == 0 AND
height == 0 (bit 15 is ignored). `[A]` The test ROM's `SpriteEndMarker` writes
exactly that. Our parser's `(s[4] & 0x7fff) === 0` is **the hardware condition
verbatim**. ✔

Two consequences we did not have written down:

* **width == 0 with height != 0 is NOT a terminator** - it is a record that
  draws nothing and costs a list slot. Same for height == 0 with width != 0
  `[C]` (the pre-scan marks a zero-height sprite inactive immediately).
* There is no other terminator and no count register. **The list is
  terminator-delimited only.**

### 1.4 The cap `[C]`

**256 records, hard.** The DMA's index is 8 bits and it stops after index 255
whether or not a terminator arrived. There is no wrap and no overflow flag -
record 256 onward simply does not exist.

This is exactly the number `spritelist.js` documents and `displaylist.js`
enforces (251 records + 4 fillers + terminator = 256). **Confirmed against a
second implementation.**

### 1.5 Records per frame, and WHEN the snapshot is taken `[C]`

The DMA is triggered **once per frame, on the horizontal sync of visible line
221**, from the chip's own line counter (`$B07000`, which counts 0…221 and is
cleared at the end of vblank), gated on control-register bit 0.

Then: DMA (up to 1,280 word reads with the CPU held off the bus) → a **pre-scan
pass over every record** → a **draw pass over 224 lines**, all overlapping the
NEXT frame's scanout.

**So the list latched at line 221 of frame N is the picture of frame N+1.**
That is our one-frame lag (`src/render/capture.js`: *"`:igs023:spritebuffer`
lags main RAM by one frame … lag 1 gives three offsets holding on 161/161"*),
independently confirmed and now *explained*: it is not a MAME sampling
artefact, it is when the chip takes the snapshot.

### 1.6 Per-scanline limit: THERE IS NO SPRITE-PER-LINE COUNTER `[C]`

Unlike almost every other 2D chip of the era, there is **no 8-or-16-sprites-per-
line rule and no per-line record budget**. The draw engine walks, for each of
the 224 lines, the entire live record list in ascending index order and emits
one row of every sprite whose current line matches.

What exists instead is a **whole-frame time budget**: the draw is a sequential
walk, and if it has not reached line 223 before the next frame's DMA restarts
it, **the remaining lines simply never get their sprites** - the bottom of the
screen loses them. `[A]` The authors instrument this explicitly.

**Caveat, stated because it matters more than the fact:** the *size* of that
budget in the core is set by SDRAM latency and a colour cache that the real chip
does not have. **The board's cut-off is somewhere else and we have not measured
it.** All we can say is that the failure MODE is "sprites vanish from the bottom
of the frame", not "the last N records vanish".

---

## 2. WHAT ARE THE BUCKETS, REALLY? - **THEY ARE OURS, ENTIRELY**

**The hardware has no bucket concept at all.** `[C]` The chip sees one flat,
terminator-delimited array of up to 256 records at `$800000` and nothing else.
There are no per-bucket base registers, no group counts, no depth registers, no
second list, no chained lists.

The thirty counters at `$80AFC0..$80AFFB` and their thirty staging buffers are
**a pure software construct of the game**, and main-loop call #4 (`$23D2AE`,
ported as `buildDisplayList`) is the only thing in the system that knows they
exist. By the time the chip is involved they have been flattened.

**The one hardware-visible consequence of a bucket, and it is the important
one:** the fixed hand-written order in which call #4 drains the 29 buckets **is
the depth order**, because *list index is the only depth control the sprite
layer has* (§3). A bucket is a Z-BAND. Nothing more, and nothing less.

**This does not reframe our emission model - it validates it.** `40-recon-
emission-path.md` §1 already describes the chain as thirty staging buffers →
one flat list. That is the right shape. Three corollaries worth writing down:

1. **"Bucket coverage" can never be a hardware-side metric.** `68-diag` §1
   already refused it on measurement grounds; the hardware agrees on structural
   grounds. Per-object emission is the only instrument with a hardware meaning.
2. **A bucket's *contents* are interchangeable with any other bucket's at the
   same depth.** Nothing stops a producer writing into a different bucket except
   the depth it wants. When we port a missing producer we are choosing a Z-band,
   not satisfying a hardware requirement.
3. **The drop policy is a software rationing scheme for the 256-record cap**,
   and the cap is real (§1.4). The order in which buckets are sacrificed
   (20 first, then 6 and 9) is a game-design decision about what may disappear.

---

## 3. PRIORITY AND LAYERING - fully resolved, and our renderer is right

### 3.1 Sprite versus sprite `[C]`

For each scanline the engine visits records in **ascending list index** and
writes into the line buffer with **last write wins**. Therefore:

> **A HIGHER LIST INDEX DRAWS IN FRONT.**

`src/render/spritelist.js:17-21` says exactly this - *"the draw walks the list
BACKWARDS and refuses to overwrite a pixel it has already written, so a HIGHER
LIST INDEX DRAWS IN FRONT"*, with wave 3 having measured the wrong order at
86.7132 %. **Confirmed against a second, structurally different implementation.**
Our backwards-walk-first-wins and the hardware's forwards-walk-last-wins are the
same function.

### 3.2 The layer order `[C]`

Per pixel, in this exact order:

1. **TEXT/FG layer**, if its pen is not the transparent one (pen 15 of 16) and
   FG is not disabled - **the text layer is unconditionally on top of
   everything**, sprites included.
2. **SPRITE with priority bit == 0** (and sprites not disabled).
3. **BACKGROUND**, if its pen is not the transparent one (pen 31 of 32) and BG
   is not disabled.
4. **SPRITE with priority bit == 1** - i.e. it shows only where the BG did not.
5. **BACKGROUND** (transparent → the backdrop, see §3.4).

**The record's priority bit means "BEHIND the background".** `pri == 0` → in
front; `pri == 1` → behind. `src/render/sprites.js:75-80` says precisely that
(*"the record's `pri` bit means BEHIND the BG. pri==0 -> draw unconditionally;
pri==1 -> only where the BG did not already write. Not the other way round"*).
✔ Confirmed.

**And one subtlety our renderer already gets right for the right reason:**
sprite-vs-sprite is resolved in the line buffer BEFORE the BG test. So a
`pri==1` sprite at a high index **occupies** the pixel - hiding a `pri==0`
sprite at a lower index - and then loses to the BG. The lower sprite is *gone*,
not revealed. `SpriteDrawer._drawPix` sets its ownership bit outside the
priority test, which is the same behaviour. ✔

### 3.3 The control register `[C]` + `[A]`

`$B0E000`. Bits the authors have names for:

| bit | meaning |
|---|---|
| 0 | **DMA / sprite-list fetch enable** - the per-frame trigger |
| 2 | IRQ4 enable |
| 3 | IRQ6 (vblank) enable |
| 10 | **BUS MASTER** - CPU takes VRAM outright, video fetch scheduling suspended |
| 11 | disable the TEXT layer |
| 12 | disable the BACKGROUND layer |
| 13 | **disable HIGH-PRIORITY SPRITES ONLY** |
| 1, 4..9, 14, 15 | `[A]` **unknown - the authors have them as UNK1..UNK10** |

**Bit 13 is worth its own line.** `src/render/igs023.js:113` implements it as
*"ctrl bit 13 set = draw only records whose pri bit is set"* - and the hardware
gates exactly the `pri == 0` (in-front) branch. ✔ Same behaviour. **One
divergence in a case we have never seen:** in hardware the suppressed pixel
still occupies the line-buffer slot and so still hides lower-index sprites; our
renderer skips the whole record, so a sprite behind it would show through. If
DDP DOJ never sets bit 13 this is dead code either way; it is recorded so it is
not re-found.

### 3.4 The backdrop is a SPRITE palette entry `[C]`

The line buffer is erased to a value that resolves, when FG/sprite/BG are all
transparent, to **sprite palette word `$3FF`** - bank 31, pen 31.

`src/render/igs023.js:32` has `FILL_PEN = 0x3ff` cited to `igs023_video.cpp:772`.
**It is not a MAME convention: it is what the chip does.** ✔

### 3.5 The palette map `[C]` + `[A]`

`$A00000`, and it lands on our capture exactly:

| words | layer | banks × pens |
|---|---|---|
| `$000..$3FF` | **SPRITES** | 32 × 32 |
| `$400..$7FF` | **BACKGROUND** | 32 × 32 |
| `$800..$9FF` | **TEXT** | 32 × **16** |
| `$A00..$FFF` | `[A]` **unused** |

`41-recon-sprite-art.md` §4.2 measured the capture's palette part as exactly
`$000..$9FF` and noted *"`$A00..$FFF` is not captured at all"*. **Now
explained: there is nothing there.** Sprite and BG pens are 5-bit (32/bank);
text pens are 4-bit (16/bank), which is why the FG transparency test is pen 15.

---

## 4. ZOOM - the quirk is EXPLAINED, and a NEW divergence candidate falls out

This section answers `games/ddpdoj/TODO-zoom-table-quirk.md`.

### 4.1 How the scaler works `[C]`

Zoom is **not a ratio**. Per axis the record carries a 1-bit MODE and a 4-bit
INDEX. The index selects a **32-bit pattern**; **bit *n* of that pattern governs
source pixel/line *n* mod 32**:

* MODE = shrink: a set bit means **drop** this source line/column.
* MODE = grow: a set bit means **emit it twice**.

So the output extent is `32 ± popcount` per 32 source pixels, and **the popcount
of the selected pattern is the entire scale factor**. `src/render/sprites.js`
implements exactly this. ✔

`[A]` The authors publish their own decoding of all 32 scale steps as
skip/once/repeat strings with the resulting line counts - 16 lines at the
smallest step, 32 at 1:1, 47 at the largest. **That is the full scale range of
the chip: 0.5× to ~1.47×.**

### 4.2 The core does NOT read the game's zoom table `[C]` - and this is the headline

The chip's zoom registers at **`$B01000`** (32 × 16-bit, CPU-readable and
writable - our `ZOOM_TABLE_HW` is the same address ✔) are decoded by the core
and then **consumed by nothing in the sprite path**. The sprite scaler uses a
**built-in 32-entry pattern table** instead.

`[A]` There is an on-board test ROM (`sprite_test2.c`) whose whole job is to
**overwrite all 32 zoom registers with a uniform value while sweeping the
record's scale mode and index**. `[I]` That test only makes sense as a probe of
"does sprite zoom follow the table?", and the core's design is what you build
after answering **no**. **This is inference from a test's existence, not a
stated result.**

### 4.3 `[M]` THE CORE'S BUILT-IN TABLE **IS** OUR ROM BLOB - 15 of 15, exactly

I computed this rather than eyeballing it. Let `ROM[z]` be
`src/zoomtable.js`'s `ZOOM_TABLE[z]` (the 16 longwords the game uploads from
`$23C588`), and let `swapHalves(v) = ((v & 0xffff) << 16) | (v >>> 16)`.

**For every z in 0…14, `swapHalves(ROM[z])` equals the core's built-in shrink
pattern for scale index z, bit-for-bit** (after the core's own bit-reversal is
undone). 15 of 15. Zero exceptions. Popcounts run 16, 15, 14 … 2 on both sides.

**And entry `$F` closes the question:**

> `swapHalves(1) = 0x00010000`, which is **exactly** the core's built-in
> pattern for that step.

That is `[M]` arithmetic on our own constant plus one number from the core.

### 4.4 THEREFORE - what the quirk was

`src/zoomtable.js` records that the ROM's entry `$F` is **zero** where the
popcount ramp predicts **one bit**, that MAME substitutes literal `1`, and that
MAME's own comment asks *"is the last entry hard-coded to 1, or does zero have
the same effect as 1?"*.

**Three answers, in descending confidence:**

1. **`[M]` The value the ramp predicts is right, and the core independently
   carries it.** A second emulator, built by people with a real board and their
   own test ROMs, uses a one-bit pattern at exactly that step. MAME's
   substitution is **not a fudge**; reproducing it is correct.
2. **`[I]` MAME's question probably has a third answer: the chip may not read
   the table at that step at all**, because its scale patterns are internal.
   That would explain both the ROM's zero (harmless, because inert) and why the
   PGM BIOS and both build images ship the identical blob (ritual, or it feeds
   something else). **UNRESOLVED and worth naming as unresolved.**
3. **`[M]` The stated consequence in `src/zoomtable.js` is WRONG, and it is
   wrong against our own code.** The comment says a literal 0 *"would make such
   a sprite lose every source pixel and VANISH, not shrink"*. Under the
   hardware's semantics - and under `SpriteDrawer.draw`, which takes the
   unzoomed path when the mask is zero - **a zero pattern means NO SCALING AT
   ALL**. The real difference between the ROM's 0 and the substitute 1 at that
   step is **one dropped line in 32**: a sprite one pixel too tall, not a
   missing sprite. The argument for reproducing MAME survives; the *reason
   given* does not. **Fix that comment.**

### 4.5 `[M]` THE NEW FINDING - a 16-BIT PHASE SHIFT in how the pattern is assembled

The relationship in §4.3 is not an identity - it is `swapHalves`. That is not
cosmetic. It says:

> **The chip assembles a zoom-table entry as `(second word << 16) | (first
> word)`. Our decoder - following MAME - assembles it as `(first word << 16) |
> (second word)`.**

The core states this convention in a second, independent place: its background
scaler assembles a 32-bit pattern from the same register pair in that same
`(odd, even)` order. Two sites, one convention.

Since bit *n* selects source line *n*, swapping the halves is a **rotation of
the pattern by 16**. Consequences, all `[M]`:

* **The scale FACTOR is unaffected** - popcount is rotation-invariant. A sprite
  is never the wrong size *overall*.
* **WHICH lines/columns get dropped changes**, and for a sprite shorter or
  narrower than 32 that changes the size too. Worked example, table entry 1
  (15 drops per 32) on a 16-line sprite: our low half is `0x5555` → **8 lines
  dropped, 8 output lines**; the hardware's low half is `0x5515` → **7 dropped,
  9 output lines**. Visible.
* **Only the EIGHT ODD-numbered table entries are affected.** I checked all 16:
  entries 0, 2, 4, 6, 8, 10, 12, 14 have identical halves and are immune to the
  swap; entries 1, 3, 5, 7, 9, 11, 13 differ; entry 15 differs only once MAME's
  substitute is applied.
* **The GROW half is a separate problem.** Our decoder reaches a grow pattern by
  mirroring the index (`0x10 - z`), which gets the popcount right. The core's
  built-in grow patterns are **not** the shrink patterns re-indexed - `[M]` I
  checked all 15 and the relation is not a reflection, not a complement and not
  a fixed rotation. If the chip really has 32 internal patterns, MAME's mirror
  is an approximation that gets the size right and the phase wrong.

**`[I]` HOW MUCH TO BELIEVE THIS.** The core's shrink half provably *comes from*
the same standard table our ROM ships, so the author started from known data.
Whether he applied the half-swap because hardware told him to, or as an
arbitrary internal convention, **I cannot tell from the source.** What makes it
worth chasing:

* it is exactly the shape `TODO-zoom-table-quirk.md` predicted - *"looks correct
  for six minutes and then diverges"*;
* `games/ddpdoj/tools/zoomcov.py`'s own header records that breaking the zoom
  loop entirely costs **2.7 %** of pixels over 16 gameplay pairs, so **our
  100.0000 % pixel gate is nearly blind to it**;
* and it cannot be settled against MAME, because MAME and our renderer share the
  convention. **Settling it needs the board, or the core's own Verilator sim
  driven with our ROM.**

---

## 5. TRANSPARENCY AND THE EVEN-FRAME SHADOW TRICK - **no hardware for it exists**

**`[C]` There is no blending, alpha, shadow, colour-arithmetic or translucency
anywhere in the video path.** I looked for it specifically:

* a sprite pixel is either written or not - **transparency lives in the MASK
  ROM**, one bit per pixel (**set = transparent**), and a transparent bit
  consumes no colour entry at all;
* the line buffer stores a resolved palette index and a priority bit, and
  **last write wins** - there is no accumulate, no mix, no second buffer;
* the layer mux is a five-way *selector*, not a blender;
* the final pixel is a direct 15-bit RGB palette read, and the only
  post-processing in the whole core is the MiSTer scaler and an optional
  horizontal stretch, which is display-side and per the README exists because
  *consumer CRTs squash PGM horizontally*.

`src/render/sprites.js:12-15` already states the mask polarity (*"A SET bit is
TRANSPARENT; a CLEAR bit consumes the next 5-bit pixel"*, with the inverted
decoder measured at 51.1631 %). ✔ **Confirmed by an independent implementation:
the core counts the ZERO bits of each mask word to advance the colour pointer.**

**THEREFORE the even-frame shadow flicker is SOFTWARE, and it is authentic.**
189 of 189 board records is a game alternating its own emission at 30 Hz on a
59.19 Hz display, because the hardware offers no other way to make a sprite look
half-transparent. **`[C]` The chip's own frame structure makes it exactly 30 Hz:
one list snapshot per frame, at line 221, no partial updates, no double
buffering the game can defeat.** Our standing instruction - do not "fix" it -
is correct, and now has a hardware reason rather than only a measurement.

There is exactly one hardware mechanism that *could* have produced a per-frame
flicker: control bit 13 (§3.3). It is global, not per record, so it cannot
explain a per-record even-frame pattern. Ruled out.

---

## 6. HARDWARE LIMITS THAT MAKE THINGS INVISIBLE

The brief asks whether any of our five never-emitting types could be invisible
on the board too - which would contradict our measurement that the board draws
them. **`[M]/[C]` It would not. Here is the complete list of ways the hardware
loses a sprite, and none of them fits.**

| # | limit | `[C]` what it is | does it explain our five types? |
|---|---|---|---|
| 1 | **256 records** | hard DMA cap, no wrap, no flag | **No.** Our port peaks at 70 records / 72 entries; the ROM's own drop policy rations to 251 |
| 2 | **terminator** | width == 0 **and** height == 0 ends the list | **No.** A truncated list would cut the tail, not five specific types |
| 3 | **zero width or zero height** | draws nothing but is not a terminator | **No** - and worth a guard: our port must never emit such a record thinking it terminates |
| 4 | **Y outside 0…223** | the draw only matches lines 0…223; negative Y is handled by a pre-scan that walks the mask stream forward until the sprite becomes visible | **No.** Also confirms Y is signed 10-bit and top-clipping is free |
| 5 | **X outside 0…447** | a pixel whose column is ≥ 448 is discarded (with one edge case at column −1 so a doubled pixel pair can straddle the left edge). X is signed 11-bit, so negative X wraps and clips correctly | **No** |
| 6 | **the 224-line draw budget** | if the draw does not reach line 223 before the next frame's DMA, the rest of the frame has no sprites | **No** - and see the caveat below |
| 7 | **control bit 13** | globally suppresses in-front sprites | **No** - global, not per type |

**So the contradiction the brief was hunting for does not exist, and that is the
useful answer:** every one of these is a *geometric or structural* limit, and our
five types (`$82`, `$05`, `$07`, `$27`, plus `$10`/`$8B` one step earlier) fail
for a *software* reason `68-diag` §2 already pinned to thirty instructions inside
five handler tails. The hardware could not have hidden them.

**One limit our renderer does not model at all, and probably should not:**
limit 6. On the board a heavy frame can lose the bottom of the screen; our
renderer draws every record unconditionally. **Do not implement this** - the
core's budget is FPGA-shaped and porting it would bake in someone else's SDRAM
latency. Record it as a known, unmeasured difference.

---

## 7. THE MASK AND COLOUR STREAM FORMAT - confirmed, and one new fact

`41-recon-sprite-art.md` describes a stream as **2 header words + wide×high mask
words + 2 trailer**, with a colour pointer closing the chain, walking 8,073
streams from `$000000`. **All of it is confirmed `[C]` + `[A]`, and the *purpose*
of the trailer is now known.**

* **Header (2 words): the START pointer into the colour ROM**, low word first.
* **Mask: `width × height` words**, consumed LSB-first, one bit per pixel,
  **set = transparent**.
* **Trailer (2 words): the END pointer into the colour ROM** - and note **the
  halves are in the OPPOSITE order to the header**, high word first `[A]`.
* **`[C]` WHY THE TRAILER EXISTS: it is what a Y-FLIPPED sprite starts from.**
  The chip implements Y-flip by walking the mask stream **backwards** from the
  end and the colour stream backwards from the END pointer, reversing each mask
  word's bits as it goes. That is also why the chip compensates the X position
  on `xflip XOR yflip` - walking backwards mirrors X for free.
  Our renderer (and MAME) flip by remapping the output row instead, which
  produces the same picture from the forward stream. **No change needed** - but
  it explains a header field we had catalogued without a purpose.
* **`[C]` THE POINTER IS A BASE-4 COUNTER OVER A BASE-3 PACKING.** Colour pens
  are 5 bits, **three per 16-bit word (bit 15 unused)** - which
  `src/render/sprites.js:12-13` already states ✔ - but the *pointer* advances by
  **4 per word**, using only sub-values 0, 1 and 2. Hence the authors' own
  stream-length rule: **end = start + opaque_pixels × 4 / 3**, and hence our
  `>> 2` when we decode the header (`sprites.js:143-144`) ✔.
  **The corollary is a cheap integrity check we do not currently run: for any
  stream, `(trailer − header)` must equal `zero_bits(mask) × 4 / 3`.** That is a
  self-validating checksum on every one of the 8,073 streams, and it would catch
  a mis-walked chain or a bad re-base *without MAME*.

---

## 8. WHAT THE CORE'S AUTHORS FLAG AS UNKNOWN OR GUESSED `[A]`

Their open questions, because the brief rightly says these matter as much as
their answers. There is **no commit history** (one squashed release commit) and
their `docs/comments/` convention deliberately keeps reasoning out of the code,
so this is from the doc files, the test-ROM headers, and the handful of code
comments they allow themselves.

1. **`bg_scale` (`$B04000`) is not implemented.** The register is decoded; the
   background scaler's pattern source is commented out and replaced by a
   constant zero. **MAME has the same hole** (*"TODO: not implemented, unknown
   algorithm"*). **Two independent emulators, neither of which knows what this
   register does.** Our `src/render/igs023.js:19-24` already refuses to score a
   frame whose `bg_scale` is unexpected - that refusal is more justified than we
   knew.
2. **Ten control-register bits are unnamed** - 1, 4, 5, 6, 7, 8, 9, 14, 15 and
   the "UNK" set generally.
3. **Six whole registers are unnamed**: `$B08000`, `$B09000`, `$B0A000`,
   `$B0B000`, `$B0C000`, `$B0D000`, `$B0F000`. `[M]` We have no writer
   documented for any of them either.
4. **Three record bits are "unk"**: word 1 bit 10, word 2 bit 15, word 4 bit 15.
   We mask all three. Nobody on either side knows if the chip ever uses them.
5. **The X position of a flipped, zoomed sprite is computed from a truncated
   scaled width** - flagged in their code as a known imprecision. `[M]` Our
   renderer computes the drawn extent exactly by counting, so **if the board
   truncates, we would differ on a flipped+zoomed sprite.** Unmeasured on both
   sides.
6. **`global_flip` is unverified against hardware** - their logic-analyser data
   is all unflipped, and they say a flipped board might need mirrored scroll
   alignment. Irrelevant to us (DDP DOJ is a normal TATE cabinet) but it bounds
   what their BG timing model covers.
7. **The core is BETA by its own README**, and DDP DOJ / DDP III is on the
   *supported* list - so it runs, but "runs" is not "verified".
8. **`[I]` The largest unstated one: the sprite scaler ignores the CPU's zoom
   table** (§4.2). The authors do not flag this as a limitation anywhere I
   found. It is either a deliberate hardware finding they did not write up, or a
   shortcut. **It is the single most valuable thing to ask them.**

---

## 9. WHAT OUR RENDERER SHOULD CHANGE OR VERIFY

Ranked. Each line says what it is and what would prove it.

### CHANGE

**C1. Fix the wrong consequence in `src/zoomtable.js`.** The comment claims a
zero at entry `$F` would make a sprite **vanish**. `[M]` It would not - under
the hardware's semantics *and* under our own `SpriteDrawer`, a zero pattern
means **no scaling**, and the real difference is one dropped line in 32. The
*decision* (reproduce MAME's substitute) is right and is now better supported
than it was; only the reasoning is wrong. **Cost: one comment. Value: the file
is the project's own record of an inference, and it currently argues from a
false premise.** Add the new support: a second, independent emulator built with
board access carries a one-bit pattern at that step.

**C2. Add the stream-integrity check to the atlas tooling.** `[C]` For every
stream, `(trailer pointer − header pointer)` must equal
`zero_bits(mask) × 4 / 3`. `[M]` This is a self-validating checksum over all
8,073 streams that needs no MAME, no capture and no board. It would catch a
mis-walked chain, a bad extent, or a wrong re-base in `export-web.mjs` -
exactly the failure class `41-recon` §1.3 and `68-diag` §5.2 keep hitting.
*Done when:* `w35atlas.mjs rom` reports N of 8,073 streams self-consistent, and
a deliberately corrupted extent is seen to make it red.

**C3. Guard against zero-width / zero-height records in `buildDisplayList`.**
`[C]` Only `width == 0 AND height == 0` terminates; a record with one of them
zero is a live list slot that draws nothing. A port bug that emits `width = 0`
would silently waste a slot rather than truncating the list. Cheap assertion.

### VERIFY

**V1. THE ZOOM PHASE - the highest-value open item in this document.**
`[M]` The core implies our 32-bit zoom mask is **rotated 16 bits** from the
chip's, affecting the **eight odd-numbered table entries** and only sprites with
a real zoom. Our 100.0000 % pixel gate is nearly blind to it (2.7 % of pixels by
`zoomcov`'s own measurement). Two ways to settle it, neither of which is MAME:
   * add a NAMED `zoomcov` case per odd entry with a source ≥ 32 px on the
     scaled axis, and compare **our output extent** against the popcount law for
     both conventions - they differ in *length* for sub-32 sprites, which is
     measurable without a board;
   * or drive the core's own Verilator simulator with our ROM and compare one
     zoomed frame. That is a real instrument and it is the only board-shaped
     oracle available to this project. **Consult the core; copy nothing.**

**V2. The GROW patterns.** `[M]` Our `0x10 - z` index mirror gets the popcount
right; the core's built-in magnify patterns are not the shrink patterns
re-indexed by any transform I could find. Same test as V1, on `grow = 1`
records. Same blindness applies today.

**V3. Flipped + zoomed X position.** `[A]` The core flags its own scaled-width
truncation there; we compute the extent exactly. `[M]` Unmeasured on both sides.
A `zoomcov` case with `xflip = 1` and a non-1:1 X scale would expose it.

**V4. Control bit 13's occupancy semantics** (§3.3). Only matters if DDP DOJ
ever sets it - grep the port for a writer of `$B0E000` bit 13 before spending
anything.

### DO NOT CHANGE

**N1. Do not model the 224-line draw budget.** `[C]` Real on the board in
*kind*, but the core's threshold is SDRAM-shaped. Porting it would bake in
someone else's timing.

**N2. Do not "fix" the even-frame shadow flicker.** §5. The hardware has no
blender; 30 Hz alternation is the only translucency the board can produce.

**N3. Do not change the list order, the priority rule, the terminator, the
`FILL_PEN`, the mask polarity or the field layout.** `[C]` All six were
confirmed against an independent implementation this session. They are settled.

---

## 10. WHAT I COULD NOT DETERMINE

1. **Whether the chip reads the zoom table for sprites at all.** §4.2. The core
   says no by construction; MAME says yes. This is a direct contradiction
   between two emulators and I cannot break the tie from source.
2. **Whether the core's half-swap (§4.5) is a hardware finding or an internal
   convention.** The strongest thing available: it appears in two independent
   places in their code. That is not proof.
3. **The board's real sprite throughput limit.** §1.6. The failure mode is
   known; the threshold is not, on either side.
4. **What `bg_scale` does.** §8.1. Nobody knows - not MAME, not the core, not us.
5. **The six unnamed video registers and the ten unnamed control bits.** §8.
6. **Nothing here was run.** I did not build the core, did not run its
   simulator, did not run MAME, and did not execute our port. Every number in
   this document is either read out of source (ours or theirs) or arithmetic I
   did on our own `ZOOM_TABLE` constant. §4.3 and §4.5 are the only computed
   results and both are reproducible from `src/zoomtable.js` alone plus 32
   numbers from the core.
7. **Whether any of this changes a pixel today.** DDP DOJ zooms "one or two
   small sprites per frame" by `zoomcov`'s own measurement. V1 could be real and
   still be worth less than one background-element stream.

---

## LOG (appended as findings arrived)

- opened. Read our `40`, `41`, `68` and `TODO-zoom-table-quirk` first; then the
  core's own docs, then its sprite/buffer/top-level RTL, then its on-board test
  ROMs and its B-ROM parser.
- §0: **the premise check.** The core is faithful in the *format* (test ROMs on
  real hardware, LA-calibrated VRAM timing) and functional in the *pipeline*
  (32 line buffers, an SDRAM colour cache, a hardcoded zoom table, BG scaling
  stubbed out). Weight the format findings; discard the throughput numbers.
- §1 `[C]`: **the record layout matches `parseSpriteList` field for field**,
  including the two ignored bits, the terminator condition, the 256 cap, the
  5-word stride and the read from main RAM word 0 = `$800000`. Independent
  confirmation of stage 4 of `40-recon`.
- §1.5 `[C]`: **the one-frame lag is explained, not just measured** - the chip
  latches the list on the hsync of visible line 221 and draws it during the
  next frame's scanout.
- §2 `[C]`: **the buckets are ours.** The hardware sees one flat 256-record
  array and nothing else. A bucket is a Z-band; list index is the only depth
  control the sprite layer has. This validates our emission model rather than
  reframing it.
- §3 `[C]`: **priority fully resolved and our renderer is right** - higher list
  index in front; text layer above everything; `pri == 1` means *behind the
  background*; `FILL_PEN = 0x3ff` is the chip's backdrop, not MAME's convention.
- §3.5 `[C]`: the palette map explains why our capture's `$A00..$FFF` is empty -
  the hardware has nothing there.
- §4.3 `[M]`: **the core's built-in scale table IS our ROM blob** - 15 of 15
  entries equal under one half-swap, computed not eyeballed - **and entry `$F`
  matches MAME's substituted 1 exactly.** The quirk's *decision* is confirmed.
- §4.4 `[M]`: **but our own stated reason for it is wrong.** A zero pattern
  means NO SCALING, not a vanished sprite - in the hardware and in our own
  `SpriteDrawer`. Comment fix filed as C1.
- §4.5 `[M]`: **a new divergence candidate.** The chip assembles a zoom entry as
  `(second word << 16) | (first word)`; we (and MAME) do the opposite. That is a
  16-bit rotation of the pattern, affecting the **eight odd-numbered entries**,
  changing *which* lines are dropped and, for sub-32-pixel sprites, the size.
  Our 100 % pixel gate is nearly blind to it by `zoomcov`'s own 2.7 % figure.
- §5 `[C]`: **there is no blending hardware of any kind.** The even-frame shadow
  flicker is software, is the only translucency the board can express, and must
  not be "fixed".
- §6 `[C]`: **seven ways the hardware loses a sprite, and none of them fits our
  five invisible types.** The brief's hoped-for contradiction does not exist;
  `68-diag`'s software explanation stands unopposed.
- §7 `[C]`: the stream trailer is the **END pointer**, and it exists so a
  Y-flipped sprite can walk the colour stream backwards. The pointer is a
  base-4 counter over a 3-pens-per-word packing, which yields a **free
  integrity check over all 8,073 streams** (filed as C2).
- §8 `[A]`: their open questions - `bg_scale` unimplemented (as in MAME), ten
  unnamed control bits, six unnamed registers, three unknown record bits, a
  self-flagged truncation in flipped+zoomed X, and the unstated big one: the
  sprite scaler ignores the CPU's zoom table.

status: DONE
