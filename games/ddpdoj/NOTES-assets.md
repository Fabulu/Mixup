# The asset pipeline — the gfx gate, the atlas, the sound map

status: wave 3, built and measured 2026-08-01.
Evidence, with every command and its actual output:
`docs/worklog/ddpdoj/03-impl-asset-export-with-teeth.md`.
The decode itself was proved bit-exact by wave 0 (`00-recon-assets.md`); wave 3
turns it into gates, an exporter with a manifest, and an integrity checker.

**Everything the tools below write is ROM-DERIVED and lives under
`games/ddpdoj/rip/`, which is gitignored twice over** (the repo-root unanchored
`rip/` rule, plus `games/ddpdoj/rip/.gitignore` containing `*`). Nothing here
is ever committed.

```
python games/ddpdoj/tools/oracle/pgm.py gfx        THE GFX GATE (16 pairs, 100.0000 %)
python games/ddpdoj/tools/oracle/pgm.py gfx --mutate all      6 mutations, all must go RED
python games/ddpdoj/tools/oracle/pgm.py zoomcov    ALL 16 zoom entries x grow/shrink x axes x flips
python games/ddpdoj/tools/oracle/pgm.py sprites    harvest every offs the game uses
python games/ddpdoj/tools/oracle/pgm.py sound      the sound map (identification only)
python games/ddpdoj/tools/oracle/pgm.py check      the whole runner, skips counted
python games/ddpdoj/tools/assets.py extract|export|check
```

## 1. The gfx gate

`pgm.py gfx` is one command: it runs MAME with the VERSION-B boot script, dumps
16 state+framebuffer PAIRS spread over boot **and** stage 1, re-renders each with
our own Python decoder and diffs it against MAME's framebuffer.

```
PASS: 1605632/1605632 = 100.0000% over 16 frame pair(s)
   ... including f2536 -> f2537 with 111 sprites and f2136 -> f2137 with 90
```

It is a GATE, not a report. It fails on anything below 100.0000 %, **and it fails
if fewer than 12 pairs were produced** — the second half matters more, because a
run whose MAME half silently produced nothing would otherwise print
`ALL EXACT: 0 pairs` and pass. Measured against an empty directory:

```
FAIL: 0/0 = 0.0000% over 0 frame pair(s)  -- TOO FEW PAIRS: 0 < 12 required.
```

### The six mutations, all seen RED

```
BASELINE                                     100.0000%   PASS
tx-msb          TX nibble order flipped       95.6651%   RED
bg-planes       BG 5-bit plane weights rev.   72.4030%   RED
spr-mask        mask bit polarity inverted    51.1631%   RED
zoom-off        zoom loop disabled            97.2763%   RED
spr-order       list drawn FORWARDS           86.7132%   RED
u19-at-200000   u19 loaded at 0x200000        52.8566%   RED
```

The last two are deliberately the two traps this project has actually made:
`NOTES-machine.md` had the draw order backwards (higher list index draws IN
FRONT), and `cave_t04401w064.u19` loads at **0x180000**, overwriting the top
0x80000 of `pgm_t01s.rom`.

**`zoom-off` costs only 2.72 % of the pixels**, and that number is the argument
for §2: the natural corpus barely exercises the zoom path, so a decoder with a
completely broken zoom loop passes the frame gate 97 % of the time.

## 2. Zoom coverage — 384 combinations, twice

`pgm.py zoomcov` writes a synthetic display list into **the game's own sprite
list in main RAM at the sample point** and lets the hardware DMA carry it to the
chip. 18 sprites per batch on a 6x3 grid, one batch per two logic frames, over
16 zoom-table entries x grow/shrink x {x-only, y-only, both} x 4 flips.

```
zoomcov-native (the game's own zoom table)  PASS 2207744/2207744 = 100.0000% over 22 pairs
zoomcov-synth  (a synthetic zoom table)     PASS 2207744/2207744 = 100.0000% over 22 pairs
1488 zoom-path sprites, 2 distinct zoom tables
ZOOM COVERAGE: COMPLETE -- every zoom-table entry x grow/shrink x axis x flip
               put pixels on the screen
basic (no-zoom encoding, zom=0+grow=1 on both axes): 138 sprites, 24326 pixels
EXPECTED-RED zoom-off: diverged, as it must
```

Coverage is **measured from the dumped sprite buffer**, never assumed from the
poke script: the table is built by parsing back what MAME was actually handed,
and each cell's number is that sprite's on-screen pixel count computed by
drawing it alone. If the poke had silently not taken, the table would be empty
rather than green.

**The encoding trap, worth knowing before touching this:** "no zoom on this
axis" is **not** `zom=0`. `zoom_word()` returns 0 only for `z >= 0x10`, and grow
flips the index to `0x10 - z`, so the no-zoom encoding is **`zom=0` with
`grow=1`**. `zom=0, grow=0` selects zoom-table entry 0, which is a real zoom.

### Three things measured the hard way while building it

1. **MAME's `draw_sprites` does NOT re-read `:igs023:spritebuffer` at draw
   time.** The first attempt switched the sprite DMA off (`ctrl` bit 0) and wrote
   the post-DMA buffer directly. The poke landed — the dumped buffer held our
   18-sprite grid on both frames of every pair — and MAME drew the game's
   sprites anyway (an explosion and the ship; I looked at the PNG). 92.64 %.
   **The share is an OUTPUT of the DMA, not the INPUT of the draw.** On the
   natural corpus the two always agree, which is why the decoder can be
   validated against the share at all. Poke the game's list in main RAM instead.
2. **The zoom table reaching the draw is latched a frame AHEAD of the sprite
   buffer.** A table changed mid-run costs exactly one frame pair. Measured by
   re-scoring the transition pair against three candidate tables:
   ```
   state f2080 -> pixels f2081:  zr(f2079)=100352/100352   zr(f2080)=99374/100352
   state f2078 -> pixels f2079:  all three candidates 100352 (the tables are equal)
   state f2082 -> pixels f2083:  all three candidates 100352 (the tables are equal)
   ```
   Poking at the sample point instead of in the notifier moved nothing — the
   same 978 pixels, on the same single pair. **I did not establish where MAME
   latches it** (shares are not tappable and the read is in C++), so rather than
   model an offset I could not pin, each coverage run holds its table constant
   and `pgm.py zoomcov` runs twice.
3. The sample point is the only instant at which a poked display list survives:
   the list is rebuilt from scratch by main-loop call #4 every frame and the DMA
   copies it at the following vblank.

## 3. The atlas, the manifest, and the integrity checker

`assets.py extract` re-extracts the ROMs from `ddpdojblk.7z`; `assets.py export`
writes `rip/assets/`; `assets.py check` verifies it.

```
tx  65536 tiles  -> tx.tiles.bin        4,194,304 bytes
bg  16384 tiles  -> bg.tiles.bin       16,777,216 bytes
pal 21 distinct snapshots -> palettes.bin
spr 1211 distinct records -> sprites/sprites.bin   6,363,024 bytes
```

**THE SPRITE POLICY, decided consciously and recorded in the manifest.** Sprites
cannot be enumerated statically: a record in 68k RAM carries a 23-bit WORD offset
into `sprmask`, where a two-word header points into a length-compressed 5bpp
stream in `sprcol`; the stream cannot be random-accessed and a header cannot be
told from two arbitrary bytes. So the exporter **harvests every `offs` the game
actually handed to the hardware**, at the sample point, across the corpus — a
measurement — instead of walking the mask ROM, which would be a guess. The
manifest states the policy, names the corpus (`stage1-open`, `stage1-deep`;
2,600 + 5,000 logic frames) and states the consequence out loud:

> This atlas provably contains exactly what the corpus displayed. Content the
> corpus never reached is ABSENT, not missing-and-unknown: enlarge the corpus to
> enlarge the atlas.

**The integrity checker is deliberately the OTHER SIDE of the comparison**
(`docs/knowledge/03`). `assets.py check` does not import `pgmgfx`'s region
assembly or its tile decoders. It re-reads the ROM FILES at raw file offsets with
plain seek/read, re-derives the region arithmetic from its own transcription of
`pgm.cpp`'s `ROM_START`, and decodes tiles with a bit-by-bit loop that shares no
code with the numpy path. It verifies the **0x180000 overlap in both
directions**, including that the top 0x80000 of `pgm_t01s.rom` really is
*shadowed* and not merely appended.

Red-validated, four ways, every one caught:

| mutation | what it breaks | caught by |
|---|---|---|
| `overlap` | u19 loaded at 0x200000 | 4 checks, including both overlap directions and both tile decodes |
| `tx-msb` | TX nibble order | TX independent decode |
| `bg-planes` | BG plane weights | BG independent decode |
| `rom-byte` | one byte of `pgm_t01s.rom` | the ROM re-hash |

## 4. `bg_scale` — the watch tripped on its first run

A standing write tap on `$B04000` is in **every** scenario now, and the value is
also read back at every sample point (a value set before the autoboot script
installed its taps is invisible to a tap and visible to the read).

**MEASURED, and it is a real finding:** the value is not always 0x210.

```
CENSUS bg_scale writes=4 non_0210=2 values_written[0210:2 0610:2]
                values_seen_per_frame[0210:2600]
BGSCALE vf=0 lf=0 value=0610 pc=0065E2
BGSCALE vf=7 lf=0 value=0610 pc=0065E2
```

`$0065E2` is inside the 512 KiB `ddp3_bios.u37`, and both writes happen at
`lf=0` — i.e. **the PGM BIOS programs a non-100 % background scale during boot,
before the game has completed a single logic frame.** MAME does not implement
the register at all (`igs023_video.cpp:193`, "TODO: not implemented, unknown
algorithm"), so **those BIOS boot frames are rendered by MAME without a feature
the hardware has.** Nothing in the corpus compares them, so it is a WARN.

The FAIL condition is the precise one: non-0x210 **at a sample point**, or
written non-0x210 **after the first logic frame**. On 2,600 sampled logic frames
of the gate scenario the register read 0x210 every time. `gfxgate.py` also fails
any pair whose dumped `bg_scale != 0x210` outright, because a 100 % score there
would be agreement between two wrong pictures.

## 5. The sound map (identification only — playback is out of the slice)

`pgm.py sound` over `stage1-deep` (5,000 logic frames):

```
CENSUS sound doorbells=657 z80_window_writes=336798 ics_reg_writes=191367 keyons=1620
```

### The mailbox: the command is a 2-word message at Z80 window $0006/$0008

Wave 0 found every doorbell write to be `data=0001` from one PC and concluded
the selector must go through the shared RAM window — but never tapped it. Tapped
now, logging the bytes written **since the previous ring**:

```
doorbell PCs: {'18AD78': 657}         (CURPC; wave 0's $18AD7E was PC, one word ahead)
doorbell data values: {'0001': 657}   a bell, not a message
window offsets written before a ring (top): 0006 x1306, 0008 x1306, then 0070/A6xx x6
door  2 lf 601  payload[0006=00EB 0008=1A00] -> 1 keyon   start=4C7AE3
door  7 lf 1204 payload[0006=00EB 0008=4150] -> 173 keyons (a BGM track starting)
door 13 lf 1969 payload[0006=0049 0008=0D28] -> 1 keyon    start=474637   (the shot SFX)
door 19 lf 1998 payload[0006=01A0 0008=0078] -> 2 keyons
```

So the protocol is: write two words to `$C10006`/`$C10008`, then ring
`$C00002`. The full 657-row table is `rip/sound/mailbox.tsv`, joined to
`keyon.tsv` by the doorbell index.

### The Z80 program blob: FOUND, and there are two of them

The Z80 has 64 KiB of RAM and no ROM, so its program is uploaded through that
window. Rather than model the 68k→Z80 lane mapping, the run dumps the Z80's RAM
and the decrypted `:maincpu` image and searches the second for a needle out of
the first, under three copy models:

```
Z80 BLOB: needle = 32 bytes at z80 RAM $010F
  verbatim (stride 1)   hits=2 at ['$1C1FDF', '$2C3599']  run(total,back,fwd)=[(23314,137,23177), same]
      matched region $1C1F56..$1C7A67 = z80 RAM $0086..$5B97   build A ($13xxxx, MASTER)
      matched region $2C3510..$2C9021 = z80 RAM $0086..$5B97   build B ($23xxxx, BLACK)
  even byte lane (stride 2, +0)  hits=0
  odd  byte lane (stride 2, +1)  hits=0
```

**23,314 contiguous bytes match, verbatim, at two addresses — one per build.**
The two-version cartridge carries its own Z80 driver in each build, and they are
byte-identical over the matched range. For VERSION-B the driver image lives at
decrypted `:maincpu` **$2C3510 = z80 RAM $0086**, i.e. z80 $0000 would be
$2C348A. The run stops backwards at z80 $0086 and forwards at z80 $5B97 because
by the end of the run the Z80 has overwritten those areas with its own runtime
state — the bound is on the *dump*, not on the copy.

### The 17 `end <= start` samples: the wave-0 explanation is REFUTED

Wave 0 skipped 17 of 67 samples with `end <= start` and suggested a 1 MiB bank
wrap, or `saddr` moving between the start-high and end-high writes. With every
ICS register write now logged in order:

```
end <= start keyons: 119 of 1620
  start=5EBF90 end=564A8A saddr=45 x28      start=5F661E end=59AD6C saddr=45 x18
  start=5C284A end=5B8D64 saddr=45 x15      ... 12 distinct (start,end,saddr) tuples
of the first 119, 0 are followed within 60 ICS register writes by another write
to the END registers ($04/$05) of the SAME voice
saddr high byte written 1620 times; 119/119 have start and end in the SAME 1 MiB
bank, so a bank wrap does not explain them
```

**Both wave-0 hypotheses are measured false**: the addresses are in one bank, and
the driver does not go on to fix the end register. So these keyons genuinely
program `end` below `start`. What the chip does with that is not established
here — `sampledump.py` must keep reporting and skipping them, and
`rip/sound/ics.tsv` now holds every register write in order for whoever picks it
up. **UNRESOLVED, deliberately, rather than guessed.**

## 5a. TWO HOLES IN THIS GATE'S CORPUS, found in wave 6

The gate above is green and its decoder is bit-exact. Wave 6 built a second gate
over the PORT's JavaScript renderer (`NOTES-render.md`) and, in red-validating
it, measured two rules that **this** corpus does not exercise. Neither is a
defect in the decoder; both are defects in the corpus, and they applied to the
Python gate exactly as much as to the JS one.

1. **No palette fade.** The largest palette movement across all 32 frames dumped
   by `pgm.py gfx` is **3 words of 2,560**. So frame N's palette and frame N+1's
   are the same picture, and the measured "the palette that applies is N+1's"
   offset (§ `00-recon-assets.md` §4) is untested here: a decoder that used the
   WRONG palette frame scores 100.0000 % on this corpus. Wave 6's
   `PROBE_PALDELTA` census found a real fade at lf1002..1016 (188-217 words per
   frame) and a cut at lf1204 (403 words); `pgm.py pixslice` requires one.
2. **No sprite record has its `pri` bit set** — 0 of 1,397 records over the same
   32 frames — so `pgm_draw_pix`'s sprite-vs-background priority test is
   exercised by nothing at all. Wave 6 drives it by intervention
   (`PROBE_PRICOV`, two rows of the same sprite at `pri=0` and `pri=1` over
   gameplay background) and measures the difference at 1,301 pixels.

If `gfxgate.py`'s corpus is ever widened, widen it towards those two.

## 6. What is NOT covered

* **Mixed x/y zoom levels.** The coverage grid uses the same `(z, grow)` on both
  axes when it zooms both. A sprite that grows in x while shrinking in y is not
  in the table. The gate would still catch it if the game did it, but coverage
  does not claim it.
* **Zoom-table entries as the GAME programs them over time.** Two tables were
  exercised: the one live at logic frame 2000, and a synthetic one. Other tables
  the game may install elsewhere are not covered.
* **`bg_scale != 0x210` RENDERING.** Watched and escalated, never rendered:
  nothing can be verified against an emulator that lacks the feature.
* **Sprites the corpus never displayed.** §3, stated in the manifest.
* **Audio playback**, per `PLAN-vertical-slice.md` §6 item 2. This unit produced
  the map, not a player.
* **The Z80 driver's own code.** Located (§5), not disassembled.
