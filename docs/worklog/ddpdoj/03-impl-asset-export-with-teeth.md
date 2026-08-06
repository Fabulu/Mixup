# WAVE 3 - asset export with teeth (the gfx gate, zoom coverage, manifest, sound map)
status: DONE
wave: 3   role: impl   started: 2026-08-01

## The task, as I understood it

`PLAN-vertical-slice.md` §"Wave 3 - asset export with teeth", five items:

1. `gfxgate.py` becomes a **gate stage**: one command runs MAME with a scripted
   input, dumps >=12 frame pairs spread over boot + stage 1 **on VERSION-B**,
   runs the decode diff, FAILS (not skips) if any pair is not 100.0000 % or
   fewer than N pairs were produced. Red-validate with a known mutation.
2. **Zoom coverage**: force all 16 zoom-table entries x grow/shrink x both axes
   x flips; red-validate by breaking the zoom loop. (Wave 0's corpus covered
   entries 1 and 0xa only - presence, not coverage.)
3. **Export + manifest**: TX tiles, BG tiles, palettes, and a consciously
   decided sprite policy - **harvest every `offs` the game uses across the
   scenario corpus** (measurement) rather than statically walking the mask ROM
   (a guess); the manifest records which. Integrity checker re-reads the ROMs at
   raw file offsets, deliberately NOT through `pgmgfx.py`'s helpers
   (`docs/knowledge/03`, two-sides rule). Output under gitignored
   `games/ddpdoj/rip/assets/`.
4. **Sound map to the point of identification**: tap `0xC10000-0xC1FFFF` writes,
   correlate with the doorbell, produce the mailbox->keyon table; locate the
   uploaded Z80 program blob inside the 68k ROM; log ICS register writes in
   order to resolve the 17 `end <= start` samples.
5. **`bg_scale` watch**: a standing tap on `0xB04000` in every scenario;
   escalate loudly if the game ever writes != 0x210.

Done when: the gfx gate is wired into the ddpdoj check runner and **has been
seen red**; the manifest + integrity checker pass on a fresh extraction from the
ROMs; the zoom coverage table is complete; the sprite-harvest corpus policy is
written in the manifest.

## Inherited state I am building on (not re-derived)

* The decoder (`tools/pgmgfx.py` + `tools/framerender.py`) is bit-exact against
  MAME: 802,816/802,816 pixels over 8 gameplay frame pairs, red-validated by
  three mutations (91.6 / 74.5 / 37.7 %). `00-recon-assets.md` §4.
* `cave_t04401w064.u19` loads at **0x180000**, not 0x200000, overwriting the top
  0x80000 of `pgm_t01s.rom`. `pgm.cpp:5369-5382`.
* Sprite list is walked BACKWARDS with first-drawn-wins, so a **HIGHER list
  index draws IN FRONT**. `NOTES-machine.md` had that backwards.
* Two sample-point offsets: state dumped at emulator frame N is drawn in frame
  N+1, and the **palette** that applies is frame N+1's.
* The oracle harness is `tools/oracle/pgm.py` + `frame.lua`, pinned to
  VERSION-B by the chooser prefix; every run asserts its build.

## Noted, not mine to fix: the wave-2 BLOCKING OPEN

Wave 2's review says that on a VERSION-B run the **interrupt handlers are build
A's**, so the build-B ISR addresses in `landmarks.json`
(`isr6Gate`/`isr6Release`/`isr6GateSkips`/`inputLea`/`p1MirrorStore`) name code
that never executes. That is a wave-4/5 hazard. It does **not** touch anything in
this wave: my sample point is the semaphore ARM write in build B's main loop,
and `lm_env()` already passes BOTH builds' release PCs to `frame.lua`, so the
`rel` column is attributed correctly either way. I changed nothing there.

## What I did

Everything new goes through the wave-1 harness (`tools/oracle/pgm.py` +
`frame.lua`), so every asset run inherits the VERSION-B chooser prefix, the
build assertion, the boot assertions and the lag census. Five new `pgm.py`
commands (`gfx`, `zoomcov`, `sprites`, `sound`, `check`), three new/rewritten
Python tools (`tools/gfxgate.py` rewritten as a gate, `tools/zoomcov.py`,
`tools/assets.py`), and five new instruments inside `frame.lua` (the gfx dump,
the `bg_scale` watch, the zoom-coverage poker, the sprite harvest, the sound
map).

Files:

| path | what |
|---|---|
| `games/ddpdoj/tools/oracle/pgm.py` | + `gfx`, `zoomcov`, `sprites`, `sound`, `check` |
| `games/ddpdoj/tools/oracle/frame.lua` | + gfx dump, bg_scale watch, zoom poker, sprite harvest, sound map |
| `games/ddpdoj/tools/gfxgate.py` | rewritten: a GATE, with 6 red-validation mutations |
| `games/ddpdoj/tools/zoomcov.py` | NEW: the zoom coverage table, measured from the dumps |
| `games/ddpdoj/tools/assets.py` | NEW: extract / export / check (the integrity checker) |
| `games/ddpdoj/tools/framerender.py` | + `SPRITE_ORDER_REVERSED` so a mutation can flip it |
| `games/ddpdoj/NOTES-assets.md` | NEW: the asset-pipeline note |
| `games/ddpdoj/NOTES-oracle.md` | + a wave-3 section |

## What I MEASURED

### 0. The machine pin is unchanged from wave 1

```
$ python games/ddpdoj/tools/oracle/pgm.py verify
romset ddpdojblk [ddp3] is best available    1 romsets found, 1 were OK.
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  refresh_hz=59.185606061 frame_attos=16896000000000000 cycles_per_frame=337920
```

### 1. The gfx gate - 16 pairs over boot AND stage 1, 100.0000 %

```
$ python games/ddpdoj/tools/oracle/pgm.py gfx
  CENSUS gfx_dumps=32 dir=...\rip\gfx-gate
  CENSUS build_by_armpc_top_nibble 1:699 2:1901
  BUILD required=B frames_on_required=1901 frames_on_other=699
OK   state f215  -> pixels f216 : 100352/100352 = 100.0000%  sprites=  2 zoomed= 0
OK   state f822  -> pixels f823 : 100352/100352 = 100.0000%  sprites=  0 zoomed= 0
OK   state f1334 -> pixels f1335: 100352/100352 = 100.0000%  sprites= 24 zoomed= 3
OK   state f1936 -> pixels f1937: 100352/100352 = 100.0000%  sprites= 17 zoomed= 9  paldelta=3
OK   state f2136 -> pixels f2137: 100352/100352 = 100.0000%  sprites= 90 zoomed= 1
OK   state f2436 -> pixels f2437: 100352/100352 = 100.0000%  sprites=102 zoomed= 1
OK   state f2536 -> pixels f2537: 100352/100352 = 100.0000%  sprites=111 zoomed= 2
   (16 rows)
PASS: 1605632/1605632 = 100.0000% over 16 frame pair(s)
```

The pair count is a hard gate, not a note. Against an empty dump directory:

```
$ python games/ddpdoj/tools/gfxgate.py --rom <rip>/rom --dump <empty> --min-pairs 12
FAIL: 0/0 = 0.0000% over 0 frame pair(s)  -- TOO FEW PAIRS: 0 < 12 required.
                                             A gate with no input is not a pass.
rc=1
```

### 2. Red validation of the gfx gate - six mutations, every one caught

```
$ python games/ddpdoj/tools/oracle/pgm.py gfx --mutate all
PASS: 1605632/1605632 = 100.0000% over 16 frame pair(s)
BASELINE: PASS
FAIL: 1536030/1605632 = 95.6651%   tx-msb:        RED (good)
FAIL: 1162525/1605632 = 72.4030%   bg-planes:     RED (good)
FAIL:  821491/1605632 = 51.1631%   spr-mask:      RED (good)
FAIL: 1561899/1605632 = 97.2763%   zoom-off:      RED (good)
FAIL: 1392295/1605632 = 86.7132%   spr-order:     RED (good)
FAIL:  848682/1605632 = 52.8566%   u19-at-200000: RED (good)
RED VALIDATION: every mutation was caught
```

`spr-order` (list drawn forwards) and `u19-at-200000` are the two traps named in
my brief, turned into standing tests. **`zoom-off` costs only 2.72 %** - that is
the measured argument for item 2: the natural corpus barely touches the zoom
path, so a decoder with a dead zoom loop passes the frame gate 97 % of the time.

### 3. Zoom coverage - 384 combinations, twice, COMPLETE

```
$ python games/ddpdoj/tools/oracle/pgm.py zoomcov 2000
  ZOOMCOV source offs=$22CAAC width=1(16px) height=8 color=30 from_list_index=35
  ZOOMCOV combos=384 per_frame=18 batches=22 table=the game's own
PASS: 2207744/2207744 = 100.0000% over 22 frame pair(s)      (native table)
PASS: 2207744/2207744 = 100.0000% over 22 frame pair(s)      (synthetic table)
90 dumped frames, 1488 zoom-path sprites, 2 distinct zoom table(s)
  table variant 0: 55555555 55155555 ... 00010001 00000000     (the game's)
  table variant 1: 00000000 ffffffff ... deadbeef 12345678     (synthetic)
 z grow axis  flip0     flip1     flip2     flip3      eff  zoomword(s)
 0    0    x      29px      29px      29px      29px  0x00 00000000 55555555
 0    1    x    n/a       n/a       n/a       n/a     0x10 NOZOOM-ENCODING (basic path)
 1    1    x      29px      29px      29px      29px  0x0f 00000001 HARD1
10    1   xy     116px     116px     116px     116px  0x06 0000ffff 15111511
15    1   xy     116px     116px     116px     116px  0x01 55155555 ffffffff
   (96 rows; every non-n/a cell non-zero)
basic (no-zoom encoding, zom=0+grow=1 on both axes): 138 sprites, 24326 pixels
ZOOM COVERAGE: COMPLETE -- every zoom-table entry x grow/shrink x axis x flip
               put pixels on the screen
EXPECTED-RED zoom-off: diverged, as it must
```

Coverage is read back out of the dumped sprite buffer and each cell's number is
that sprite drawn alone; a poke that failed to take would give an empty table,
not a green one.

### 4. Two mechanism facts, each found by a failure and each nailed down

**(a) MAME's `draw_sprites` does not re-read `:igs023:spritebuffer` at draw
time.** My first zoom poker switched the sprite DMA off (`ctrl` bit 0) and wrote
the post-DMA buffer directly. The poke landed - parsing the dumps back:

```
f2036 n=18 ctrl=001e   {'i':0,'x':8,'y':8,'xzom':0,'ygrow':True,'offs':15868,...}
f2037 n=18 ctrl=001e   (same 18 synthetic entries)
```

and every pair scored **92.64 %**. I looked at the framebuffer PNG
(`rip/render/f002036.mame.png`): MAME had drawn the GAME's sprites - an
explosion and the ship - not our 6x3 grid. So the share is an OUTPUT of the DMA,
not the INPUT of the draw. Fixed by poking the game's own list in main RAM
(`$800000`, 5 u16/entry) at the sample point, which is the one instant between
the list build (main-loop call #4) and the vblank DMA.

**(b) The zoom table reaching the draw is latched one frame AHEAD of the sprite
buffer.** After (a) was fixed, exactly ONE pair of 22 still failed, at the
boundary where the synthetic table was installed. Re-scoring that pair against
three candidate tables:

```
state f2078 -> pixels f2079:  zr(f2077)=100352  zr(f2078)=100352  zr(f2079)=100352
state f2080 -> pixels f2081:  zr(f2079)=100352  zr(f2080)= 99374  zr(f2081)= 99374
state f2082 -> pixels f2083:  zr(f2081)=100352  zr(f2082)=100352  zr(f2083)=100352
```

The draw of f2081 used the table dumped at f2079. Poking at the sample point
instead of in the notifier changed nothing - the same 978 pixels, the same one
pair. Rather than model an offset I could not pin, each coverage run now holds
its table constant for its whole length and `zoomcov` runs twice.

### 5. `bg_scale` - the watch tripped on its very first run

```
CENSUS bg_scale writes=4 non_0210=2 values_written[0210:2 0610:2]
                values_seen_per_frame[0210:2600]
CENSUS bg_scale_bad_pcs 0065E2:2
BGSCALE vf=0 lf=0 value=0610 pc=0065E2
BGSCALE vf=7 lf=0 value=0610 pc=0065E2
WARN bg_scale was written non-0x210 2 time(s) BEFORE the first logic frame ...
```

`$0065E2` is inside `ddp3_bios.u37` (the 512 KiB PGM BIOS at `$000000`), and
both writes are at `lf=0`. **The PGM BIOS programs a non-100 % background scale
during boot**, and MAME does not implement the register at all
(`igs023_video.cpp:193`, "TODO: not implemented, unknown algorithm") - so those
BIOS boot frames are rendered by MAME without a feature the hardware has.

My first version FAILED the run on any non-0x210 write, which made every run
red for a reason nothing in the corpus depends on. The gate is now precise: FAIL
if the register is non-0x210 **at a sample point**, or written non-0x210 **after
the first logic frame**; WARN (loudly, on every run) for the BIOS-era writes.
On 2,600 sampled logic frames the register read 0x210 every time
(`values_seen_per_frame[0210:2600]`). `gfxgate.py` independently fails any frame
pair whose dumped `bg_scale != 0x210`.

### 6. The atlas, the manifest, and an integrity checker seen red four ways

```
$ python games/ddpdoj/tools/oracle/pgm.py sprites
  CENSUS sprite_harvest distinct=1004 logicframes=2600  (stage1-open)
  CENSUS sprite_harvest distinct=1259 logicframes=5000  (stage1-deep)
1211 distinct (offs,width,height) records over 2 scenario(s)

$ python games/ddpdoj/tools/assets.py extract      # FRESH, from ddpdojblk.7z
$ python games/ddpdoj/tools/assets.py export
  tx  65536 tiles -> tx.tiles.bin        (4,194,304 B)
  bg  16384 tiles -> bg.tiles.bin       (16,777,216 B)
  pal 21 distinct snapshots -> palettes.bin
  spr 1211 distinct records -> sprites/sprites.bin  (6,363,024 B)

$ python games/ddpdoj/tools/assets.py check
  [ok] all 10 ROM files re-hashed (size + sha256 + crc32)
  [ok] bytes below 0x180000 come from pgm_t01s.rom
  [ok] bytes from 0x180000 up come from cave_t04401w064.u19
  [ok] the top 0x80000 of pgm_t01s.rom IS SHADOWED (not merely appended)
  [ok] TX tiles match an independent decode -- mismatches: []
  [ok] BG tiles match an independent decode -- mismatches: []
  [ok] sprite blob length == sum of record sizes -- 6363024 vs 6363024
  [ok] the sprite policy is recorded in the manifest -- HARVESTED FROM THE RUNNING GAME
  [ok] the sprite corpus is named -- ['stage1-deep.tsv', 'stage1-open.tsv']
  [ok] the atlas is not empty
ASSET INTEGRITY OK: 0 failing check(s) []
```

Red-validated, four mutations, all caught:

```
--mutate overlap    4 FAILs: both overlap directions + both tile decodes
--mutate tx-msb     1 FAIL:  TX independent decode, mismatches at 2730, 5460, ...
--mutate bg-planes  1 FAIL:  BG independent decode, mismatches at 682, 1364, ...
--mutate rom-byte   1 FAIL:  pgm_t01s.rom re-hash
```

The checker shares no code with `pgmgfx.py`: its own transcription of
`ROM_START`, plain `seek/read` on the ROM FILES, and bit-by-bit tile decoders.

### 7. The sound map

```
$ python games/ddpdoj/tools/oracle/pgm.py sound            # stage1-deep, 5,000 lf
CENSUS sound doorbells=657 z80_window_writes=336798 ics_reg_writes=191367 keyons=1620
CENSUS sound z80ram_nonzero=58012 of 65536 maincpu_dumped=6291456
```

**The mailbox, which wave 0 never tapped.** Logging the window writes made since
the previous ring:

```
doorbell PCs: {'18AD78': 657}          (CURPC; wave 0's $18AD7E is PC, one word ahead)
doorbell data values: {'0001': 657}    a bell, not a message -- confirmed on B
window offsets written before a ring (top 12):
  [('0006',1306), ('0008',1306), ('0070',6), ('A600',6), ('A602',6), ...]
door  2 lf 601  payload[0006=00EB 0008=1A00] ->   1 keyon  starts=4C7AE3
door  7 lf 1204 payload[0006=00EB 0008=4150] -> 173 keyons starts=500000,53E359,...
door 13 lf 1969 payload[0006=0049 0008=0D28] ->   1 keyon  starts=474637
door 19 lf 1998 payload[0006=01A0 0008=0078] ->   2 keyons starts=400000,5FFED6
```

**The command is two words at Z80-window `$0006`/`$0008`, then the doorbell at
`$C00002`.** 657 rows in `rip/sound/mailbox.tsv`, joined to `keyon.tsv` by the
doorbell index.

**The Z80 program blob, which wave 0 could not find.** Dump the Z80's RAM and the
DECRYPTED `:maincpu` (init_ddp3 decrypts in place, so the ROM file is the wrong
bytes to search), then search the second for a needle from the first, under three
copy models:

```
Z80 BLOB: needle = 32 bytes at z80 RAM $010F
  verbatim (stride 1)  hits=2 at ['$1C1FDF','$2C3599']  run(total,back,fwd)=(23314,137,23177)
      matched region $1C1F56..$1C7A67 = z80 RAM $0086..$5B97  build A ($13xxxx, MASTER)
      matched region $2C3510..$2C9021 = z80 RAM $0086..$5B97  build B ($23xxxx, BLACK)
  even byte lane (stride 2, +0)  hits=0
  odd  byte lane (stride 2, +1)  hits=0
```

**23,314 contiguous bytes, verbatim, at two addresses - one per build.** For
VERSION-B the driver image is at decrypted `:maincpu` **$2C3510 = z80 RAM
$0086** (so z80 $0000 would be $2C348A). The run stops at z80 $0086/$5B97
because by the end of the run the Z80 has overwritten those areas with runtime
state: that bound is on the DUMP, not on the copy. The first attempt anchored
the run at z80 $0000 and reported 6 bytes, which would have been read as "not
found" - the anchor has to be the needle, not the origin.

**The 17 `end <= start` samples: BOTH wave-0 hypotheses measured FALSE.**

```
end <= start keyons: 119 of 1620
  start=5EBF90 end=564A8A saddr=45 x28    start=5F661E end=59AD6C saddr=45 x18
  start=5C284A end=5B8D64 saddr=45 x15    ... 12 distinct (start,end,saddr) tuples
of the first 119, 0 are followed within 60 ICS register writes by another write
to the END registers ($04/$05) of the SAME voice
saddr ($11) high byte written 1620 times; 119/119 have start and end in the SAME
1 MiB bank, so a bank wrap does not explain them
```

So they are not bank wraps and they are not half-programmed voices being fixed
up. What the ICS2115 does with `end < start` is NOT established here.
`sampledump.py` must keep reporting and skipping them; `rip/sound/ics.tsv` now
carries all 191,367 register writes in order for whoever picks it up.

### 8. The check runner - ALL GREEN, and seen RED

On a **fresh extraction of the ROMs from `ddpdojblk.7z`**:

```
$ python games/ddpdoj/tools/oracle/pgm.py check
  [PASS] environment
  [PASS] assets/integrity
  [PASS] assets/integrity RED [overlap] [tx-msb] [bg-planes] [rom-byte]
  [PASS] gfx gate
  [PASS] gfx gate RED (6 mutations)
  [PASS] zoom coverage (+ RED)
  [PASS] determinism gate
VERDICT: ALL GREEN -- 10 passed, 0 failed, 0 SKIPPED

$ python games/ddpdoj/tools/oracle/pgm.py check --quick --break-decoder u19-at-200000
  [FAIL] gfx gate [DELIBERATELY BROKEN: u19-at-200000] -- exit 1
VERDICT: FAILURES -- 7 passed, 1 failed, 0 SKIPPED     (rc=1)
```

## What I could not do, and why

1. **Where MAME latches the IGS023 zoom table.** Measured that it reaches the
   draw one video frame ahead of the sprite buffer (§4b, 978 pixels on one
   pair, and the previous frame's table scores 100352/100352). I could not
   locate the latch: shares are not tappable and the read happens in C++. Rather
   than model an offset I could not pin, `zoomcov` holds the table constant per
   run and runs twice. **This is a fact about MAME's implementation; whether the
   real IGS023 latches it the same way is untested and untestable here.**
2. **What the ICS2115 does with `end < start`.** Both wave-0 explanations are
   refuted (§7); no replacement is offered. 119 of 1620 keyons in a 5,000-frame
   run do it, all in one bank, none corrected afterwards. Unresolved on purpose.
3. **Mixed x/y zoom levels are not covered.** The grid uses the same `(z, grow)`
   on both axes when it zooms both, so "grow in x while shrinking in y" is
   absent from the coverage table. The frame gate would still catch it if the
   game did it; coverage does not claim it.
4. **Only two zoom tables were exercised** - the one live at logic frame 2000
   and a synthetic one. Other tables the game may install elsewhere in the game
   are not covered.
5. **The Z80 driver is located, not disassembled.** §7 gives its address in both
   builds; nothing was decoded out of it. Audio playback is out of the slice by
   `PLAN` §6 item 2 anyway.
6. **The sprite atlas is bounded by the corpus** - 1,211 records from
   `stage1-open` + `stage1-deep`. That is stated in the manifest as the policy's
   consequence, not hidden.
7. **The wave-2 BLOCKING OPEN (build-A ISRs on a VERSION-B run) is untouched.**
   Nothing in this wave depends on the ISR landmark addresses: my sample point
   is the semaphore arm in build B's main loop, and `lm_env()` already passes
   both builds' release PCs so `rel` is attributed either way. It is still open
   and still blocks wave 4/5.

## If someone picks this up cold

```
python games/ddpdoj/tools/assets.py extract          # fresh ROMs into rip/rom
python games/ddpdoj/tools/oracle/pgm.py sprites      # harvest -> rip/harvest/*.tsv
python games/ddpdoj/tools/assets.py export           # -> rip/assets/ + manifest.json
python games/ddpdoj/tools/oracle/pgm.py check        # every gate; expect ALL GREEN, 0 SKIPPED
python games/ddpdoj/tools/oracle/pgm.py check --quick --break-decoder spr-order   # see it red
```

Four things that will cost you a day if you do not know them:

1. **The state dump is one video frame ahead of the framebuffer, and the palette
   is a SECOND offset.** Compare `state(N)` + `palette(N+1)` against
   `pixels(N+1)`.
2. **You cannot poke `:igs023:spritebuffer` and expect MAME to draw it.** Poke
   the game's list in main RAM at the sample point instead (§4a).
3. **"No zoom on this axis" is `zom=0` AND `grow=1`, not `zom=0`.**
4. **Every Lua tap and notifier handle lives in a global** or it is collected and
   silently stops firing. Three agents have hit this; `frame.lua` keeps `TAPS`
   and `SUBS`.
