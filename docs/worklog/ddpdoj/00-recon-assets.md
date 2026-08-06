# RECON 3/5 - DaiOuJou assets: what is in the graphics/sound ROMs and how to extract them
status: DONE (graphics) / PARTIAL (sound - see "What I could not do")
wave: 0   role: recon   started: 2026-07-31

## The task, as I understood it

For `ddpdojblk` (Black Label, the port target):

1. Say what each ROM file **actually** contains - verified, not guessed from its letter.
2. Document the IGS023 sprite format and the tile format: bit depth, block size, how a
   sprite record in RAM addresses ROM data, how palettes apply.
3. Check whether MAME's own driver source documents the decode.
4. **Get real pixels out and LOOK at them** before claiming a format is right.
5. Map the sound arrangement (Z80 + ICS2115 samples); identify music/SFX if possible.

Everything extracted is ROM-derived → gitignored path only. No commits.

## HEADLINE

**A working extractor exists and is validated to 100.000% pixel-exactness against
MAME on a live gameplay frame** (448×224 = 100,352 pixels, 24 sprites, scrolling
background, text overlay). Tiles, sprites, palette and priority are all confirmed.

## Where everything is

| what | path |
|---|---|
| extractor / decoder library | `games/ddpdoj/tools/pgmgfx.py` |
| tile-sheet renderer | `games/ddpdoj/tools/gfxsheet.py` |
| MAME state dumper (Lua) | `games/ddpdoj/tools/framedump.lua` |
| whole-frame re-renderer + differ | `games/ddpdoj/tools/framerender.py` |
| sound-path probe (Lua) | `games/ddpdoj/tools/soundprobe.lua` |
| MAME capability probe (Lua) | `games/ddpdoj/tools/vidprobe.lua` |
| **all ROM-derived output** | `games/ddpdoj/rip/` - gitignored twice over |

`games/ddpdoj/rip/` is covered by the repo-root `.gitignore` rule `rip/` (unanchored,
so it matches at any depth) AND by a `games/ddpdoj/rip/.gitignore` containing `*`
that I added in the same breath as creating the directory.

```
$ git check-ignore -v games/ddpdoj/rip/rom/cave_t04401w064.u19
.gitignore:29:rip/	games/ddpdoj/rip/rom/cave_t04401w064.u19
```

## What I MEASURED

### 0. The inventory changed under me - `ddpdojblk` now verifies

`NOTES-versions.md` records `ddpdojblk BAD (0 OK)` because `ddp3blk_defaults.nv` had
the wrong checksum. **That is no longer true on this machine.** Between two of my own
commands, `C:\oldpcsx2\ddpdojblk.zip` and `ddpdojblk2.zip` disappeared and
`ddpdojblk.7z` (15,094,333 B, mtime 20:45) appeared. Someone is working in that
directory live. The new archive has the right files:

```
$ mame.exe -rompath "C:\oldpcsx2" -verifyroms ddpdojblk
ddpdojblk   : ddp3_igs027a.bin (16384 bytes) - NOT FOUND - NO GOOD DUMP KNOWN
romset ddpdojblk [ddp3] is best available
1 romsets found, 1 were OK.
```

Contents and hashes I computed myself (not read from MAME):

```
cave_a04401w064.u7    8388608  CRC32=ed229794  SHA1=1cf1863495a18c7c7d277a9be43ec116b00960b0
cave_a04402w064.u8    8388608  CRC32=752167b0  SHA1=c33c3398dd8e479c9d5bd348924958a6aecbf0fc
cave_b04401w064.u1    8388608  CRC32=17731c9d  SHA1=0e0aa0ec01035323985ac8e08228a0fd6edf6689
cave_m04401b032.u17   4194304  CRC32=5a0dbd76  SHA1=06ab202f6bd5ebfb35b9d8cc7a8fb83ec8840659
cave_t04401w064.u19   8388608  CRC32=3a95f19c  SHA1=fd3c47cf0b8b1e20c6bec4be68a089fc8bbf4dbe
ddb10_10_8_434f.u45   2097152  CRC32=d21561db  SHA1=66a0103bc5f17b28736b562e32807271a5afa261
ddp3_bios.u37          524288  CRC32=b3cc5c8f  SHA1=02d9511cf71e4a0d6ca8fd9a1ef2c79b0d001824
ddp3blk_defaults.nv    131072  CRC32=c2282720  SHA1=80b7662a7577883dabd043b6500ae244379047c2
pgm_m01s.rom          2097152  CRC32=45ae7159  SHA1=d3ed3ff3464557fd0df6b069b2e431528b0ebfa8
pgm_t01s.rom          2097152  CRC32=1a7123a0  SHA1=cc567f577bfbf45427b54d6695b11b74f2578af3
```

`ddb10_10_8_434f.u45` and `ddp3blk_defaults.nv` both match `pgm.cpp:5364/5385` exactly.
The only remaining gap is the undumped ARM7 internal ROM, which MAME simulates.

### 1. Region assembly - the offset nobody would guess

`pgm.cpp:5369-5382`, `ROM_START( ddpdojblk )`. **`cave_t04401w064.u19` loads at
`0x180000`, not `0x200000`** - it OVERWRITES the top `0x80000` of `pgm_t01s.rom`.
Getting this wrong silently shifts every tile index above 0xC000.

| MAME region | size | files (offset, length) |
|---|---|---|
| `igs023` (8-bit) | 0xa00000 | `pgm_t01s.rom` @0x000000 0x200000; `cave_t04401w064.u19` @**0x180000** 0x800000 |
| `igs023:sprcol` (**REGION16_LE**) | 0x2000000 | `cave_a04401w064.u7` @0x0000000; `cave_a04402w064.u8` @0x0800000 |
| `igs023:sprmask` (**REGION16_LE**) | 0x1000000 | `cave_b04401w064.u1` @0x0000000 |
| `ics` | 0x1000000 | `pgm_m01s.rom` @0x000000; `cave_m04401b032.u17` @**0x400000** |

Region tags confirmed live from Lua (`vidprobe.lua`):

```
region :igs023           size=10485760   region :igs023:sprcol   size=33554432
region :igs023:sprmask   size=16777216   region :ics             size=16777216
share :igs023:bg_videoram 4096   :tx_videoram 8192   :rowscrollram 4096
share :igs023:spritebuffer 4096  :zoomram 64  :palette 5120  :sram 131072
share :z80_mainram 65536         :arm7_shareram 64
dev :maincpu spaces=[cpu_space,program]   :soundcpu spaces=[io,program]
dev :ics spaces=[data]                    :prot spaces=[program]
screen w=448 h=224 refresh=59.185606061
```

### 2. What each ROM actually contains - VERIFIED BY LOOKING

- **`pgm_t01s.rom` (2 MB) - 8×8 4bpp text tiles, and it is the PGM BIOS font.**
  Decoded as `gfx_8x8x4_packed_lsb` it renders readable ASCII + katakana.
  `games/ddpdoj/rip/sheets/tx_zoom_lomsb.png` shows `<=>?@ABCDEFG / HIJKLMNOPQRSTUVW /
  XYZ[\]^_`, anti-aliased, perfectly aligned to 8×8 cells. The **wrong** nibble order
  (`hi,msb`) renders unreadable noise - that is the red-validation of this claim, and
  both sheets are on disk.
  65536 tiles × 32 B = 0x200000 exactly, so the TX layer's 16-bit tile number spans
  precisely this ROM (indices ≥0xC000 land in u19 because of the 0x180000 overlap).
- **`cave_t04401w064.u19` (8 MB) - the 32×32 5bpp background tiles**, plus TX tiles
  0xC000-0xFFFF. `rip/sheets/bg_4096_contig.png` (tiles 4096-4159) shows sharp,
  cell-aligned industrial art: hazard stripes, concrete, girders, machinery.
  `rip/sheets/bg_survey_stride64.png` is a whole-region survey; tile indices below
  ~2400 are the t01s font read as 32×32 and are noise, as expected.
- **`cave_a04401w064.u7` + `cave_a04402w064.u8` (8 MB each) - sprite COLOUR data**,
  a packed 5-bit-per-pixel stream (`m_adata`), 3 pixels per 16-bit LE word.
- **`cave_b04401w064.u1` (8 MB) - sprite TRANSPARENCY MASKS plus the per-sprite
  pointer header** (`m_bdata`). Not "colour indexes" despite the ROM_REGION comment.
- **`cave_m04401b032.u17` + `pgm_m01s.rom` - ICS2115 wavetable samples.** MAME's
  comment says "8 bit mono 11025Hz"; **the first keyon I captured is 16-bit**
  (`conf=20`, no ulaw, no eightbit). The comment is boilerplate, not a measurement.
- **`ddp3_bios.u37`** - PGM BIOS, 68000 code, logos hacked out.
- **`ddp3blk_defaults.nv`** - factory NVRAM; the set does not boot without it.

### 3. The formats, from MAME's own source (mame0289, `igs023_video.cpp`)

MAME **does** document the decode, and reading it was the fast path.

**TX tiles** - `GFXDECODE_DEVICE(DEVICE_SELF, 0, gfx_8x8x4_packed_lsb, 0x800, 32)`
(line 102). 8×8, 4bpp, 32 B/tile, low nibble = left pixel. Colour base 0x800,
16 entries per palette. Transparent pen 15. Tilemap 64×32, 8×8.

**BG tiles** - `GFXDECODE_DEVICE_REVERSEBITS(DEVICE_SELF, 0, pgm32_charlayout, 0x400, 32)`
(line 103) with (line 35-44):
```
32,32, RGN_FRAC(1,1), 5, { 4,3,2,1,0 }, { STEP32(0,5) }, { STEP32(0,5*32) }, 32*32*5
```
→ 640 B/tile; with REVERSEBITS this is exactly **a plain LSB-first 5-bit-per-pixel
bitstream**, row-major: pixel(x,y) of tile n is bits `n*5120 + y*160 + x*5 .. +4`,
bit `+0` the LSB. Colour base 0x400, 32 entries per palette, transparent pen 31.
Tilemap 64×16, 32×32, `set_scroll_rows(512)`.

**Palette RAM** (`0xa00000`, 5120 B = 2560 `xRGB_555` entries, big-endian):
```
0x000-0x3FF  sprites   32 banks x 32   index = color*32 + pixel
0x400-0x7FF  BG        32 banks x 32   index = 0x400 + color*32 + pixel
0x800-0x9FF  TX        32 banks x 16   index = 0x800 + color*16 + pixel
```
Screen is cleared to palette entry **0x3ff** (line 772).

**Sprites** - the interesting one. A record does **not** name a tile; it names a bit
position in a *compressed* stream and a size in pixels.

- List: 5 × u16 per entry in main RAM `0x800000-0x8009ff`, DMA'd on vblank rise into
  an 8 × u16 per entry buffer at `0xb00000`. 256 entries max, terminated by
  `word4 & 0x7fff == 0`. Hardware-verified per-word AND mask `{ffff, fbff, 7fff, ffff, ffff}`
  (line 797).
- Fields (line 615-639): X 11-bit signed, Y 10-bit signed, flipX/flipY, 5-bit palette
  select, 1-bit priority, a **23-bit word offset into `sprmask`**, width in 16-pixel
  units (6 bits), height in pixels (9 bits), plus zoom mode + 4-bit zoom-table select
  per axis.
- **`offs` points at a 2-word HEADER, not at mask data**:
  `aoffset = ((sprmask[offs+1] << 16) | sprmask[offs+0]) >> 2` - a **word index into
  `sprcol`**. Mask data starts at `offs+2` (lines 354-358 / 537-541).
- Per line: `wide` mask words are consumed, bit **LSB first**; a SET bit is
  transparent and consumes nothing, a CLEAR bit consumes the next 5-bit pixel from
  the `sprcol` stream (3 px per u16, bits 0-4 / 5-9 / 10-14, bit 15 unused, line 276-286).
  **So sprite data is length-compressed and cannot be random-accessed within a
  sprite** - you must decode from the header forward. That is why MAME draws in ROM
  order rather than pre-decoding.
- Zoom: a 16-entry table in `zoomram` gives a 32-bit bitmask per zoom level; a set bit
  means "double this pixel" (grow) or "drop this pixel" (shrink). Entry 0xf is
  hard-coded to 1; a table select ≥0x10 means no zoom (line 689).
- **Draw order:** `draw_sprites` walks the list BACKWARDS (line 588-591) and
  `pgm_draw_pix` sets `destpri |= 1` for every pixel it touches, refusing to write
  where that bit is already set. So **the first sprite drawn owns the pixel, and the
  first sprite drawn is the LAST list entry**. `games/ddpdoj/NOTES-machine.md` says
  "later entries are behind earlier ones" - **that is backwards**; higher list index
  draws in front.
- `pri` bit: 0 = over background, 1 = only where the BG did not draw.

### 4. The pixel proof - 100.000%, and what it cost to get there

`framerender.py` re-renders a whole frame from ROM + a MAME state dump using only
our Python, then diffs against `screen:pixels()` from the same run. The two sides are
independently derived (`03-checks-that-can-fail.md` §"Two sides of a comparison").

First result on a live gameplay frame was **91.322%**, and the residue was NOT a
decode bug:

```
state f3600 vs pixels f3600:  91643/100352 =  91.322%
state f3599 vs pixels f3600: 100352/100352 = 100.000%
state f3600 vs pixels f3601: 100352/100352 = 100.000%
state f3599 vs pixels f3599:  86500/100352 =  86.197%
```

**`emu.add_machine_frame_notifier` fires AFTER the game's vblank IRQ has already
written the NEXT frame's video state.** So the state you read at emulator frame N is
what MAME will draw in frame N+1, and the framebuffer you read at frame N was drawn
from frame N-1's state. The tell was `bg_xscroll` stepping `00f0 → 00f8 → 0100`,
exactly 8 per frame - the same 8-pixel offset I was chasing in the background layer.
This is `01-the-oracle-method.md`'s "sample at a stable point in the game's own loop"
and `02-traps.md` §3 "when one field will not converge, suspect the measurement",
reproduced from scratch inside two hours. **Any ddpdoj oracle must fix its sample
point before comparing anything.**

The frame proved on is real content, not a blank screen (guarding against
`02-traps.md` §2): 24 sprites including four on the zoom path, a scrolling BG
(`bg_xscroll=0x00f8`, `bg_yscroll=0x20`), a TX overlay, `ctrl=0x001f`.

**And the palette is offset DIFFERENTLY from everything else.** One frame in the
batch (f5500) came back at 17.8% while the other seven were exact. `paldelta=111`:
the game was mid-fade. `screen:pixels()` returns the indexed bitmap resolved to RGB
at the *end* of the frame, so the palette that applies is frame **N+1**'s, while the
tilemaps/scroll/sprites are frame **N**'s:

```
f5500 state + f5500 palette -> pixels f5501:  17899/100352 =  17.836%
f5500 state + f5501 palette -> pixels f5501: 100352/100352 = 100.000%
```

That is two different sample offsets in one comparison, and only a palette-fade
frame exposes it. Both are now encoded in `framerender.py` and `gfxgate.py`.

**The batch, full run of `gfxgate.py` over eight frame pairs:**

```
OK   state f3700 -> pixels f3701: 100352/100352 = 100.0000%  sprites= 67 zoomed= 1 paldelta=1
OK   state f4000 -> pixels f4001: 100352/100352 = 100.0000%  sprites=  1 zoomed= 0 paldelta=3
OK   state f4300 -> pixels f4301: 100352/100352 = 100.0000%  sprites= 95 zoomed= 1 paldelta=0
OK   state f4600 -> pixels f4601: 100352/100352 = 100.0000%  sprites=  1 zoomed= 0 paldelta=0
OK   state f4900 -> pixels f4901: 100352/100352 = 100.0000%  sprites=  2 zoomed= 0 paldelta=0
OK   state f5200 -> pixels f5201: 100352/100352 = 100.0000%  sprites= 33 zoomed= 1 paldelta=0
OK   state f5500 -> pixels f5501: 100352/100352 = 100.0000%  sprites= 33 zoomed= 1 paldelta=111
OK   state f5800 -> pixels f5801: 100352/100352 = 100.0000%  sprites= 87 zoomed= 1 paldelta=2
ALL EXACT: 802816/802816 = 100.0000% over 8 frame pair(s)
```

**Red-validated by mutation** (`03-checks-that-can-fail.md` - a check never seen fail
is not evidence). Each mutation applied by monkey-patch over frames 4300 and 5800,
then reverted:

| mutation | score |
|---|---|
| baseline | **100.0000%** |
| TX nibble order flipped (`packed_msb` instead of `packed_lsb`) | 91.6110% |
| BG 5-bit plane weights reversed | 74.5381% |
| sprite transparency-mask bit polarity inverted | 37.7172% |
| baseline restored | **100.0000%** |

### 5. A reproducibility hazard in MAME, found by accident

Runs stopped being reproducible because MAME had persisted a flipped DIP:

```
$ cat mame/cfg/ddpdojblk.cfg
<port tag=":DSW" type="DIPSWITCH" mask="1" defvalue="1" value="0" />
```

Service Mode had been latched ON and every subsequent boot went into the service
menu (I captured the INPUT TEST screen for 6,300 frames without noticing).
`-nonvram_save` does **not** cover this. **Every ddpdoj MAME invocation must pass a
private `-cfg_directory`** (I use `games/ddpdoj/rip/cfg`), or results depend on
whatever a previous run left behind.

### 6. Another instance of the dropped-handle trap

`NOTES-mame-oracle.md` §6.1 records that a discarded `install_read_tap` handle is
silently collected. **The same is true of `emu.add_machine_frame_notifier`.** With the
handle discarded my dumper fired at frame 60 and never again, with no error of any
kind - and an earlier 50-second run produced *zero* output and looked like a script
that had simply not matched anything. Keep the subscription in a global.

### 7. Sound - the arrangement, and a first live capture

Architecture, from `pgm.cpp` (all source-read, not guessed):

- **Z80 @ 8.4672 MHz with 64 KB of RAM and NO ROM.** `map(0x0000,0xffff).ram()`.
  `pgm.cpp:29`: *"There is no ROM for the Z80, the program is uploaded by the 68k"*,
  through `0xc10000-0xc1ffff`. So the sound driver **and, since the Z80 can reach
  nothing else, the sequence data too** live inside the 68000 program ROM and are
  copied into Z80 RAM. Nothing to disassemble statically without finding that blob.
- Z80 I/O map (`pgm.cpp:315-320`): `0x8000-0x8003` ICS2115; `0x8100` latch3 (Z80→68k);
  `0x8200` latch1; `0x8400` latch2.
- 68k side: `0xc00002/3` latch1 **and it pulses the Z80 NMI** - that is the
  "play sound N" doorbell; `0xc00004/5` latch2; `0xc0000c/d` latch3;
  `0xc00008` Z80 reset; `0xc0000a` Z80 bus control.
- Sound chip: **ICS2115V WaveFront wavetable @ 33.8688 MHz**, 32 voices, its own
  24-bit `data` space = the 16 MB `ics` region. Per voice: oscillator config
  (ulaw / 8-bit / 16-bit, loop, bidir loop, IRQ), FC (pitch), start/end (20.12 fixed,
  banked by an 8-bit `saddr` giving `(saddr<<20)|(addr&0xfffff)`), volume envelope,
  pan. Keyon is a write of 0 to register 0x10 (`ics2115.cpp:875`). Register access is
  `port1 = register select`, `port2/3 = data low/high`, `register 0x4f = voice select`.

`soundprobe.lua` mirrors that register file from a write tap on the Z80's I/O space
and logs every keyon with its real ROM addresses. First capture (30 s, attract, no
input - the game sat on the version-select screen, so only one sound fired):

```
SND keyon vf=1316 n=1 voice=8 conf=20 fmt=16bit loop=0 fc=0100
    start=4c7ae3 end=4ca091 len=9646 vol=00 pan=7f saddr=44
```

`0x4c7ae3` is inside `cave_m04401b032.u17` (region `0x400000-0x7fffff`). **16-bit, not
the 8-bit the ROM comment claims.** `fc=0x0100` → 256×33075/1024 = 8268.75 Hz in
32-voice mode.

**110-second in-game capture** (`rip/sound/snd110.log`): **1,490 keyons, 67 distinct
`(start, end, format, bank)` tuples, ALL 16-bit** - not one ulaw or 8-bit voice in the
whole run. Sample banks used: `saddr` 0x40, 0x44, 0x45, 0x46, 0x47, 0x50…0x7x, i.e.
byte addresses `0x400000-0x7fffff` - **every single one inside
`cave_m04401b032.u17`. No keyon in 110 s touched `pgm_m01s.rom` (0x000000-0x1fffff).**
That is a presence measurement over one run, NOT a claim that the BIOS sample ROM is
unused; only a listing of the sound driver could establish that.

The samples fall into three clear classes, and `sampledump.py` writes them as WAV:

```
$ python games/ddpdoj/tools/sampledump.py --rom <rip>/rom --log <rip>/sound/snd110.log --out <rip>/wav --png
1490 keyon events ... 67 distinct (start,end,fmt,bank) tuples
17 of them have end <= start (1 MiB bank wrap) - SKIPPED, not guessed

  s_51b0c6_5cd8dc_16bit_fc0200.wav  samples= 365579  rate= 16537.5Hz  rms= 6912.8  plays=1
  s_500000_59ad6c_16bit_fc0300.wav  samples= 317110  rate= 24806.2Hz  rms= 7936.6  plays=66
  s_500000_584980_16bit_fc0200.wav  samples= 271552  rate= 16537.5Hz  rms= 8246.1  plays=67
  ...
  sfx_5ffed6_5ffff4_fc0100_loop1    samples=    143  rate=  8268.8Hz  rms=14912.6  plays=416
  sfx_6eef3c_6ef13c_fc0200_loop1    samples=    256  rate= 16537.5Hz  rms= 7846.5  plays=136
  sfx_46809b_474637_fc0100_loop0    samples=  25294  rate=  8268.8Hz  rms= 9651.2  plays=3
```

1. **Long, non-looping, 200k-365k samples in bank 0x45 starting at `0x500000`** -
   12 to 22 seconds of audio. `rip/wav/s_500000_584980_16bit_fc0200.png` is a
   waveform plot I looked at: ~30 evenly spaced percussive hits with decaying
   envelopes, symmetric about zero. **That is streamed BGM, not a sequenced score.**
2. **Tiny LOOPING samples (143-1476 samples, `loop=1`) retriggered hundreds of times**
   - 0x5ffed6 played 416 times, 0x6eef3c 136 times. Classic wavetable instrument
   loops. So the driver does both streaming and wavetable synthesis.
3. **Medium non-looping samples (1k-25k)** - SFX and voice.

**The 68k→Z80 command protocol is a mailbox, not a byte.** A write tap on `0xc00003`
(`m68k_latch1_w`, which pulses the Z80 NMI) fired 31 times in 70 s and **every single
write was `data=0x0001`, always from `PC=0x18ad7e`**:

```
SND cmd vf=602  n=1 off=c00002 data=0001 mask=ffff pc=18ad7e
SND cmd vf=924  n=2 off=c00002 data=0001 mask=ffff pc=18ad7e
... (31 identical writes)
```

So the latch is a doorbell; **which** sound to play must be passed through the shared
Z80 RAM window at `0xc10000-0xc1ffff`. `PC=0x18ad7e` is inside the game program ROM
(`0x100000-0x3fffff`), i.e. file offset `0x8ad7e` of `ddb10_10_8_434f.u45` - that is
the doorbell call site and the anchor for finding the sound driver's mailbox layout.

## What I could not do, and why

- **17 of 67 captured samples have `end <= start`** and I did not extract them.
  The ICS2115 banks by `(saddr << 20) | (addr & 0xfffff)`, so a sample cannot cross a
  1 MiB boundary - it wraps inside the bank. Those 17 are either genuine wraps or an
  artefact of my mirroring the register file (the driver may reprogram `saddr` between
  the start-high and end-high writes and my model applies one bank to both).
  **`sampledump.py` reports and skips them rather than guessing.** Resolving this needs
  the register writes logged in order, not just at keyon.
- **I did not separate music from SFX by ID.** The 68k doorbell carries no ID (above);
  the mapping needs a write tap on `0xc10000-0xc1ffff` correlated with the doorbell at
  `PC=0x18ad7e`. One run, not done.
- **The BGM "distinct samples" count is probably inflated.** Several entries share a
  start (`0x500000`, `0x51b0c6`) with different ends and high replay counts - that
  looks like one logical stream whose end/loop point the driver moves, split by my
  `(start,end)` dedup key. Per-voice, per-time-window capture would settle it.
- **I did not find the Z80 program blob in the 68k ROM.** The route is a write tap on
  `0xc10000-0xc1ffff` recording the 68k PC and the source data - one run, not done.
- **I did not exercise the sprite zoom path deliberately.** The 100% frame contains
  four zoomed sprites (one grow at table entry 1, three shrinks at entry 0xa), which
  is presence, not coverage. `03-checks-that-can-fail.md` would want a frame per
  zoom-table entry, and a red-validation that breaking the zoom loop fails.
- **Nothing was extracted to a portable asset format.** The decoder produces numpy
  arrays and PNGs; there is no manifest, no atlas, no stable naming.
- **BG `bg_scale` is unimplemented in MAME itself** (`igs023_video.cpp:193` "TODO: not
  implemented, unknown algorithm"). It reads `0x210` (=100%) in every frame I captured.
  If the game ever writes something else, **our oracle is comparing against an emulator
  that does not implement the feature** - that is a fidelity hole to watch for, not a
  port bug.
- **Sprites cannot be enumerated statically.** There is no sprite table in ROM: the
  record lives in 68k RAM and points into a compressed stream. Extracting "all
  sprites" means either (a) harvesting every `offs` the game ever uses at runtime, or
  (b) statically walking the mask ROM's header/mask structure, which nobody has
  validated. (a) is measurement, (b) would be a guess.

## If someone picks this up cold

```
# tile sheets you can look at
python games/ddpdoj/tools/gfxsheet.py bg --rom games/ddpdoj/rip/rom \
    --out games/ddpdoj/rip/sheets --first 4096 --count 64 --cols 8 --scale 2
python games/ddpdoj/tools/gfxsheet.py tx --rom games/ddpdoj/rip/rom \
    --out games/ddpdoj/rip/sheets --first 0x40 --count 64 --cols 16 --scale 6 --gap 1

# the pixel gate: dump N and N+1, render N's state, diff against N+1's framebuffer
cd "$LOCALAPPDATA/Mixup/mame"
DDP_DUMPDIR=<rip>/dump DDP_FRAMES="3599,3600" DDP_HOLD=20 \
DDP_KEYS="600:P1 Button 1,900:Coin 1,1100:1 Player Start" \
./mame.exe ddpdojblk -rompath C:\oldpcsx2 -cfg_directory <rip>/cfg \
  -video none -sound none -nothrottle -skip_gameinfo -seconds_to_run 62 \
  -autoboot_delay 0 -autoboot_script <tools>/framedump.lua \
  -snapshot_directory <rip>/dump -nonvram_save -noautosave
python games/ddpdoj/tools/framerender.py --rom <rip>/rom --dump <rip>/dump \
  --frame 3599 --out <rip>/render        # compare against f003600 pixels
```

Three things that will waste your day if you do not know them:
1. **The state dump is one frame ahead of the framebuffer.** Compare state(N) with
   pixels(N+1).
2. **Keep every MAME Lua subscription handle in a global** or it silently stops.
3. **Pass your own `-cfg_directory`** or a stray DIP change poisons every later run.
