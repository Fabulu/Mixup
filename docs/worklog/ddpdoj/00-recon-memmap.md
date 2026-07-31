# RECON 2/5 — DaiOuJou memory map and architecture (player, objects, game loop)
status: DONE (partial — items 1 and 3 only partly answered; see "What I could not do")
wave: 0   role: recon   started: 2026-07-31

## The task, as I understood it

Find, BY MEASUREMENT against the real board image under MAME, on `ddpdojblk`:

1. The main loop — entry, phase order within a frame, where per-frame work is dispatched.
2. THE PLAYER — the routine that moves the ship, found the Gradius way (hook writes to the
   coordinate, record the PC), position representation, sub-pixel, speed, clamps, hitbox.
3. The object/entity model — layout in RAM, capacity, allocation-failure behaviour.
4. Stage 1's start — what is on screen and what code path produces it.
5. Shot types — weapon modes, ship types, and what selects them.

**Verify, do not inherit:** "bullets are sprites in the first 0xa00 bytes of main RAM,
256 entries, 10 bytes each". That is a claim about the IGS023 *hardware*, read from MAME's
driver source. It is not a measurement of what DaiOuJou does.

## Tools I added

Under `games/ddpdoj/` (another workflow is writing into `games/ddpdoj/tools/` at the same
time; I only added `tools/pgm.py` and the `probes/pgm_*.lua` files). All probe output goes
to a scratch directory outside the repo. **Nothing ROM-derived is in the repo.**

| file | what it does |
|---|---|
| `tools/pgm.py` | headless MAME driver for the PGM sets — the *hermetic* flag set |
| `probes/pgm_survey.lua` | what the PGM driver exposes to Lua (devices, shares, ports) |
| `probes/pgm_shots.lua` | input script + PNG snapshots — *look at the screen* |
| `probes/pgm_determinism.lua` | per-frame RAM digest; run twice and diff |
| `probes/pgm_ramdiff.lua` | 3-snapshot endpoint diff (kept as the example of a WEAK filter) |
| `probes/pgm_ramp.lua` | pin/sweep/rest filter for a coordinate; rejects frame counters |
| `probes/pgm_rammap.lua` | one write tap over all 128 KiB → which pages, which PCs |
| `probes/pgm_writers.lua` | writer attribution by CURPC + per-frame poke intervention |
| `probes/pgm_track.lua` | given one known per-frame quantity, find everything that moves with it |
| `probes/pgm_sprites.lua` | decode the sprite list; cross-check against the post-DMA display list |

---

## What I MEASURED

### 0. The harness. Three ways a PGM run is not what you think it is.

Every one of these produced a *silent* wrong answer, and all three cost real time.

**(a) A stale NVRAM file makes Black Label print `ROM ERROR !` and stop forever.**

`NOTES-versions.md` records `ddpdojblk` as verifying BAD (wrong `.nv` checksum) and says
"it still boots (with a warning)". Re-measured today:

```
$ mame.exe -rompath C:/oldpcsx2 -verifyroms ddpdojblk
ddpdojblk   : ddp3_igs027a.bin (16384 bytes) - NOT FOUND - NO GOOD DUMP KNOWN
romset ddpdojblk [ddp3] is best available
1 romsets found, 1 were OK.
```

**The inherited BAD is stale.** `C:\oldpcsx2\ddpdojblk.7z` carries `ddb10_10_8_434f.u45`
and a correct `ddp3blk_defaults.nv`; the shadowed zips carry `ddb_1dot.u45` (a
hitbox-display build) and the bad `.nv`.

But "it boots" had never been checked by *looking*. With a leftover `nvram/ddpdojblk/sram`
from an earlier run the machine sits at PC=`$13C39C` forever showing a full-screen
`ROM ERROR !`. `-nonvram_save` stops MAME **writing** nvram; it does not stop it **reading**
an existing file. Moving `nvram/` aside made the identical command boot on the next run.

**(b) MAME writes `cfg/<set>.cfg` between runs although `-showconfig` says `writeconfig 0`.**

```
$ cat cfg/ddpdojblk.cfg
<system name="ddpdojblk"><counters><coins index="0" number="10" /></counters>
```

A coin count **accumulated across runs**. `writeconfig` governs the `.ini`, not the
per-system cfg, and cfg also carries DIP-switch and input state. Early in this session two
2000-frame runs with identical scripts produced different RAM digests **from frame 20**, and
one run reached the **INPUT TEST service screen** where the same script otherwise reached
stage 1. This is the only cross-run channel I found.

`tools/pgm.py` now passes `-nvram_directory <fresh>` and `-cfg_directory <fresh, emptied>`.

Ruled out as causes of that nondeterminism, each by measurement:

- *Autoboot start jitter.* Five runs, all reporting `vf=1 time=0.016896000 pc=F48` — the
  first frame-notifier callback lands at exactly one frame period every time. (0.016896 s
  is also an independent confirmation of the derived `15625/264 Hz`.)
- *The V3021 RTC reading the host clock.* Full 128 KiB RAM dumps at video frames 20 and 200
  from runs at 21:12:48 / 21:13:03 / 21:14:27 — spanning a wall-clock minute boundary —
  **0 differing bytes** in all three pairwise comparisons.

After the fixes: three consecutive 2000-frame runs with the full boot script were
**byte-identical** (100 digest lines each, 0 differing lines in all three pairwise diffs).
That is not yet a standing check and it should become one.

**(c) TWO ways a memory tap silently never fires.** Both produce zero output, no error, and
a *faster* run — the only visible symptom.

1. **`local TAPS` at chunk scope is collectable.** `NOTES-mame-oracle.md` §6.1 already warns
   that a dropped tap handle is garbage-collected. The subtle version, which I walked into:
   a `local` table of handles that **no surviving closure references** (the frame notifier
   never mentions it) is collected too. `install_write_tap` still returns non-nil. Keep tap
   handles in a **global**.
2. **Never tap two aliases of one mirrored block.** Main RAM is `0x800000-0x81ffff` with
   `.mirror(0x0e0000)`, so the same storage decodes at `0x800000 … 0x8e0000`. Installing a
   tap on `0x800000-0x81FFFF` *and* one on `0x8E0000-0x8FFFFF` made **both** stop firing:
   0 callbacks over 120 frames of gameplay.

Taps do work, and the counts are sane once you avoid both (300 frames, six separate taps):

```
count 800000-80000F = 2761     count 801000-807FFF = 21915
count 800010-8000FF = 1728     count 808000-80FFFF = 19987
count 800100-800FFF = 3072     count 810000-81FFFF = 600709
```

### 1. What the PGM driver exposes to Lua — measured, not inherited

`probes/pgm_survey.lua` on `ddpdojblk`, MAME 0.288:

```
dev :ics      spaces=data          dev :maincpu  spaces=cpu_space,program
dev :prot     spaces=program       dev :soundcpu spaces=io,program
share :sram                size=131072 width=16 endian=big
share :palette             size=5120   width=16 endian=big
share :z80_mainram         size=65536  width=8  endian=little
share :arm7_shareram       size=64     width=32 endian=little
share :igs023:bg_videoram  4096 | :igs023:tx_videoram 8192 | :igs023:rowscrollram 4096
share :igs023:spritebuffer 4096 | :igs023:zoomram 64
region :maincpu 6291456 | :igs023 10485760 | :igs023:sprcol 33554432
region :igs023:sprmask 16777216 | :ics 16777216 | :prot 16384 | :sram 131072
screen w=448 h=224 refresh_attoseconds=16896000000000000
maincpu program: width=16 addrmask=FFFFFF endian=big
maincpu_state_regs = A0..A6,CURFLAGS,CURPC,D0..D7,IR,PC,SP,SR,USP
port :DSW     fields=Service Mode | Unknown
port :P1P2    fields=1 Player Start | 2 Players Start | P1 Button 1 | P1 Button 2 |
                     P1 Button 3 | P1 Down | P1 Left | P1 Right | P1 Up | P2 ...
port :P3P4    fields=(none)     port :Region fields=(none)
port :Service fields=Coin 1 | Coin 2 | Service | Test
consistency share[0x1000]=0000 space[0x801000]=0000 same=true
```

- **`refresh_attoseconds = 16,896,000,000,000,000` = 16.896 ms exactly** — the running
  machine confirms the derived `15625/264 Hz`.
- **`share :sram` byte offset N == 68k address `0x800000 + N`**, checked directly against
  the CPU program space rather than assumed.
- **`:prot` (the ARM7) HAS a `program` space in this build.** `NOTES-slowdown-oracle.md` §8.1
  says the ARM7 "is a second programmable CPU that MAME emulates"; `NOTES-machine.md` says
  `pgm_arm_type1_cave` calls `set_disable()` on it. **Both cannot be right** and I did not
  settle it (I never stepped or tapped `:prot`).
- **Only three player buttons and a 4-way lever exist.** No `Region` or `P3P4` fields.

### 2. Reaching stage 1, and what Black Label actually is

Measured by snapshotting. Video frames at 59.185606 Hz.

| vf | on screen |
|---|---|
| 250–420 | **VERSION SELECT** — `> 1: VERSION-A (OLD)` / `2: VERSION-B (NEW)`, `SELECT = UP or DOWN`, `START = SHOT`, 5-second countdown |
| ~700 | Japan-only legal notice ending `2002.04.05.MASTER VER` (so VERSION-A **is** the Master version) |
| ~1300 | title — `PRESS 1P OR 2P START`, `1ST 10000000 PTS / 2ND 30000000 PTS`, `RANK: NORMAL`, `C BUTTON FULL-AUTO`, `CREDITS:2` |
| ~1450 | **ship select** — `TYPE-A` art panel, `RIGHT ➜` prompt, 5-second countdown |
| ~1480 | pressing Right gives **`TYPE-B`** with a `LEFT` prompt only → **exactly two ship types** |
| ~1620 | `PLEASE WAIT` and the stage 1 background already scrolling |
| ~1750 | in-stage fly-in, ship drawn, two picture-in-picture panels at the top |
| ~2050 | full gameplay HUD: `PLAYER1`, score, `PRESS START`, bomb row `B B B`, lives row |

The reproducible script (video frames, `FROM-TO:FIELD[+FIELD]`):

```
300-310:P1 Button 1, 400-410:Service/Coin 1, 460-470:Service/Coin 1,
1340-1352:1 Player Start, 1480-1492:P1 Button 1,
1560-1572:P1 Button 1, 1640-1652:P1 Button 1
```

**`ddpdojblk` is two games in one ROM and it asks which one at boot.** Everything below was
measured on **VERSION-A / TYPE-A**, which is the *Master* build reached through the Black
Label ROM — *not* the Black version. Anything measured here must be re-measured on
VERSION-B before it is called a Black Label fact.

### 3. THE PLAYER — found, and its arithmetic

Chain of measurements, each one closing the previous one's hole:

1. `pgm_ramp.lua` v1 asked for a monotone series during a sweep. Over all 65,536 words of
   main RAM **exactly one survived** — and it stepped `+1` every frame: a **frame counter**
   at `$80390A`. A filter that cannot tell a coordinate from a clock is a check that cannot
   fail. v2 requires *constant while pinned against a wall*, *monotone while sweeping*,
   *constant again at rest*.
2. `pgm_rammap.lua` gave the write map (below), and `pgm_writers.lua` attributed the
   candidates.
3. **Poke intervention:** writing `$808EB4/$808EB6` every frame is overwritten on the next
   frame by PC `$13F648` — so that longword is a **derived, per-frame draw position**, not
   state. (Bonus: my own pokes were attributed to CURPC `$13C6B4`/`$13C6BA`, i.e. the CPU
   was in the main-loop spin when Lua wrote — which independently locates the frame wait.)
4. `pgm_track.lua` then took the drawn coordinate as a reference series and searched all of
   RAM for anything whose per-frame **delta sign** matches it exactly (scale-free, so the
   fixed-point format need not be guessed).

**Result — horizontal (P1 Left/Right; the 224-wide axis; sprite `Y` field):**

```
reference $808EB6 & 3FF : 107,110,112,115,117,120,122,125,...,183,183,...,107,107,...
width=16 exact_sign_matches=5   -> $808EB6  $808EC2  $8103EA  $8104AE  $8104CE
$8104AE series: 7394,7394,7557,7720,7883,8046,8209,...   (+163 per frame)
```

**Result — vertical (P1 Up/Down; the 448-tall axis; sprite `X` field):**

```
reference $808EB4 & 7FF : 53,57,61,65,69,73,76,80,...,169,169,...,53,53,...
width=16 exact_sign_matches=5   -> $808EB4  $808EC0  $8103E8  $8104AC  $8104CC
$8103E8 series: 4473,4473,4719,4965,5211,5457,...        (+246 per frame)
```

So:

| fact | value | how |
|---|---|---|
| player position, vertical | **`$8103E8`**, u16 | tracked, then writer-attributed |
| player position, horizontal | **`$8103EA`**, u16 | tracked, then writer-attributed |
| **units** | **1/64 pixel** (10.6 fixed point) | 163 units ÷ 2.546875 px = 64.0; 246 ÷ 3.84375 = 64.0 |
| the two options | `$8104AC/$8104AE` and `$8104CC/$8104CE` | identical vertical, horizontal ±2082 = **±32.53 px**; the player is the middle of the three |
| **THE MOVER** | **PC `$141B2E` (vertical) / `$141B32` (horizontal)** | writes only on frames the stick is deflected — 80 writes over 120 frames with 4×20-frame holds |
| the store/clamp | PC `$148D9C` | writes **every** frame, after the mover |
| the draw-position writer | PC `$13F648`, `move.l D0,(A0)` with `A0=$00808EB4`, `D0=$8035_8038` | trace |

**Clamps, measured by pinning against each wall for >100 frames and reading the two writes
in one frame:**

```
LEFT wall  : $141B32 writes 025D (=605 = 9.453 px), then $148D9C writes 0300 (=768 = 12.000 px)
RIGHT wall : $141B32 writes 35A3 (=13731 = 214.547 px), then $148D9C writes 3500 (=13568 = 212.000 px)
```

The mover adds the full step and the clamp writes back the bound — and the bound is an
**exact whole number of pixels** (768 = 12×64, 13568 = 212×64) while the pre-clamp value is
not. So: **horizontal clamp = [12.0 px, 212.0 px] on a 224-wide field.** The order matters
and is measurable, which is exactly the fall-through hazard `02-traps.md` warns about — do
not port "clamp then move".

**Speed depends on which button is held. Vertical axis, TYPE-A:**

```
no button   n=18 deltas={246} = 3.843750 px/frame
B1 held     n=18 deltas={246} = 3.843750 px/frame
B2 held     n=18 deltas={313} = 4.890625 px/frame
B3 held     n=18 deltas={29,313}  (313 steady; the 29 is the transition frame)
```

**Cross-check that makes both axes believable:** the raw screen is 448×224 in a 4:3 frame,
so a raw-X pixel is 2/3 the size of a raw-Y pixel. `246 × 2/3 = 164`, and the measured
horizontal step is **163**. The ship moves very nearly isotropically *on the glass*; the
per-axis numbers differ because the pixels are not square. Two independent measurements
agreeing to 1 part in 164 is much better evidence than either alone.

### 4. The write map of main RAM (120 frames of stage-1 gameplay)

`pgm_rammap.lua`, 3,773 writes/frame recorded, **60 of 512 pages** touched:

```
page $81FF00  1714.6/frame   <- the stack
page $80B000   160.0         page $800000   154.0   \
page $800100   153.0         page $800200   132.2    > the sprite display list
page $800300    27.9                                 /
page $803B00   129.9   $803A00 128.0   $803C00 127.1   $803900 92.4   $803D00 43.0
page $80AF00   124.7   $80B100 13.0
page $815E00    66.9   $814700 64.0    $814600 63.2   $814800 59.0   $814900 32.4
page $809C00    58.7   $810400 30.8    $808E00 21.9   $810300 16.0
page $813000..$813F00  10-20 each
```

A second run with the shot button held reached 90 pages and 5,194 writes/frame, and the
sprite-list writes spread to `$800400` — i.e. **the write map is load-dependent**, which is
itself the (C)-detector signal `06-lag-and-slowdown.md` asks for.

### 5. The sprite list — the inherited claim, VERIFIED and CORRECTED

`pgm_sprites.lua` decoded main RAM at 10 bytes/entry using the field layout from
`igs023_video.cpp` and the results are coherent: X in 0..447, Y in 0..223 (signed, so
partly-offscreen entries go negative), `w=3 h=32 pal=10` for repeated scenery, `w=4 h=48
pal=11` for another class.

```
dma_crosscheck vf=2100 entries=256 mismatching=57 livelen=57
vf=2140 livelen=73   vf=2160 livelen=80   vf=2180 livelen=85   vf=2220 livelen=85
  e00 rawX= 232 rawY=  22 w= 3 h= 32 pal=10 pri=0 addr=$166EE4  [80E8 8016 0A16 6EE4 0620]
```

- **10 bytes per entry: CONFIRMED by execution, not by reading the driver.** The builder is
  a tight loop at PCs `$13DA02 / $13DA04 / $13DA06 / $13DA0C`, and over 10 frames it writes
  **exactly 1.00 time per frame** to each of `+0, +2, +4, +6, +8` of every live entry.
  The whole list is **rebuilt from scratch every frame**.
- **Terminator: confirmed.** `livelen` (index of the first entry with word4 & 0x7fff == 0)
  was 57–85 across gameplay frames, and the pages written stop at `$8004FF`
  (= 128 entries × 10 bytes) with no button held, extending further under load.
- **CAVEAT, and it is load-bearing:** the "hard cap 256" was **not reached** in anything I
  ran. Peak observed live length is **85 entries**. I have not seen what happens at the cap,
  so I cannot say what the game does when the list is full. *Measurement proves presence.*
- **The `spritebuffer` share lags by one frame.** `mismatching` came out exactly equal to
  `livelen` every time, with the dead tail matching — i.e. every live entry differs and
  every zero entry agrees. That is the signature of comparing this frame's main RAM against
  last frame's DMA'd copy, not of a decode error. Any oracle that compares the two must
  align them by one frame.
- **Sprite slots are not stable identities.** I tried to find the player by tracking a slot
  index across frames; entries move between slots every frame (their mask-ROM address
  changes with animation too). **Do not build an object identity on the sprite slot.**

### 6. The main loop, partially

Sampling `PC` once per video frame while idle, over hundreds of frames, the 68000 is always
inside a 3-word window, and it is the same window across sets:

```
ddpdojblk   PC ∈ { $13C6B4, $13C6B6, $13C6BA, $13C6BC }   ($13C39C when halted on ROM ERROR)
ddp3        PC ∈ { $13C30C, $13C310, $13C312 }
ddpdoj      PC ∈ { $13C30C, $13C310, $13C312 }
ddpdojb     PC ∈ { $13C310, $13C312 }
```

Independently corroborated: every Lua poke I made from the frame notifier was attributed by
the write tap to CURPC `$13C6B4` or `$13C6BA` — the CPU is in that loop at the moment
MAME's video frame ends. **That is a spin loop and it is the natural sample point.** I did
**not** confirm which flag it spins on, nor hook IRQ6/IRQ4, nor establish the phase order
within a frame. See below.

---

## What I could not do, and why

- **The main loop's phase order.** I have the spin address and nothing else. No IRQ6/IRQ4
  hook, no ordering of input → player → objects → sprite build → DMA. `cpu_space` is present
  on `:maincpu` and `NOTES-slowdown-oracle.md` §3c proves a vector-fetch tap is a
  game-agnostic frame detector on a 68000; it just was not run here.
- **The object/entity model.** I have the write map and the sprite *display list*, but not
  the object table itself: I did not attribute `$803900-$803EFF` or `$80AF00-$80B1FF` to
  code, did not find the struct stride, the slot count, or the allocator. **I therefore do
  not know what happens when allocation fails** — and that is exactly the behaviour the
  brief says must be preserved. Do not let anyone read the sprite-list cap as the answer;
  the display list is not the object table.
- **The hitbox.** Not attempted. The two owner claims in `NOTES-versions.md` (ddp3 being
  "unlocked", Black Label's smaller hitbox) remain unverified.
- **Shot vs laser.** I measured that speed changes with the held button, but I did **not**
  establish which physical button is shot, laser or bomb. The title screen says
  `C BUTTON FULL-AUTO`, which names Button 3 only.
- **VERSION-B (the actual Black version) and TYPE-B.** Every number above is VERSION-A /
  TYPE-A. The version select is a fork in the ROM and I only took one branch.
- **Whether `:prot` (ARM7) executes.** Two project documents contradict each other and I did
  not measure it.
- **A standing determinism check.** Three identical 2000-frame runs is evidence, not a gate.

## If someone picks this up cold

1. **Use `games/ddpdoj/tools/pgm.py`.** Roll your own invocation and you will get
   `ROM ERROR !` and conclude the dump is bad. It is not.
2. **Always look at a PNG before believing a run reached gameplay.** Two of my runs sat in
   the service menu while every counter looked healthy.
3. Keep tap handles in a **global**, and never tap two aliases of the mirrored RAM block.
4. Budget ~20–35 s wall for 2,200 video frames with a per-frame Lua callback plus a
   full-RAM scan every frame. Instrumentation is not the bottleneck; boot is (~1,700 frames
   of menus before stage 1).
5. The player's numbers, to re-derive rather than trust:
   `$8103E8` vertical, `$8103EA` horizontal, 1/64 px, mover `$141B2E`/`$141B32`,
   clamp/store `$148D9C`, draw `$13F648`, horizontal bounds 12.0–212.0 px.
