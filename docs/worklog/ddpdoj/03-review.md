# WAVE 3 REVIEW — asset export with teeth
status: DONE — defects found, none blocking the wave's own gates
wave: 3   role: review   started: 2026-08-01

## The task, as I understood it

Verify commit `7e496e4` by content, not by report: read the diff, read the code,
re-run the measurements. Check hardest for VERSION-B pinning, ROM addresses vs
actual bytes, fall-through end claims, whether the new checks can actually fail,
silent unporting, and "MAME-timed, uncalibrated" labelling.

READER ONLY. I edited nothing under `games/ddpdoj/` and committed nothing.
Every experiment that needed a modified file used a copy in the scratchpad;
`frame.lua` was hashed before and after and is byte-identical
(`d93737961ecd4853aa9c3441158f50226284bd16bb5f0c5656edc923bc7371f7` both ways).

## State of the tree before I started

`git diff HEAD --stat -- games/ddpdoj` shows only DELETIONS, all of files that
exist on disk as untracked. That is the **shared index still carrying staged
deletions** (already flagged in wave 1, commit `977d005`) and it now also covers
wave 3's new files: `games/ddpdoj/tools/assets.py`, `tools/zoomcov.py`,
`NOTES-assets.md`, `docs/worklog/ddpdoj/03-impl-*.md`. Working-tree content is
byte-identical to HEAD for all of them (`git hash-object` == `git rev-parse
HEAD:<path>`), so what I ran is what was committed — but a `git commit` from the
gradius workflow using this index would delete wave 3 from HEAD.

`git show --name-only 7e496e4` touches only `games/ddpdoj/` and
`docs/worklog/ddpdoj/`. Nothing under `rip/` is tracked; `git check-ignore -v`
confirms `.gitignore:29:rip/` catches `games/ddpdoj/rip/assets/tx.tiles.bin`,
and `games/ddpdoj/rip/.gitignore` is `*`.

## What I MEASURED

### 1. The whole check runner, re-run from scratch — reproduces exactly

```
$ python games/ddpdoj/tools/oracle/pgm.py check
  CENSUS gfx_dumps=32 dir=...\rip\gfx-gate
  CENSUS build_by_armpc_top_nibble 1:699 2:1901
  BUILD required=B frames_on_required=1901 frames_on_other=699
  WARN bg_scale was written non-0x210 2 time(s) BEFORE the first logic frame
       (values [0210:2 0610:2], PC(s) [0065E2:2]) ...
  BGSCALE vf=0 lf=0 value=0610 pc=0065E2
  BGSCALE vf=7 lf=0 value=0610 pc=0065E2
PASS: 1605632/1605632 = 100.0000% over 16 frame pair(s)
VERDICT: ALL GREEN -- 10 passed, 0 failed, 0 SKIPPED          rc=0
```

The six mutations reproduce to the pixel — identical totals to the report:
tx-msb 1536030 (95.6651 %), bg-planes 1162525 (72.4030 %), spr-mask 821491
(51.1631 %), zoom-off 1561899 (97.2763 %), spr-order 1392295 (86.7132 %),
u19-at-200000 848682 (52.8566 %). `RED VALIDATION: every mutation was caught`.

```
$ python games/ddpdoj/tools/oracle/pgm.py check --quick --break-decoder u19-at-200000
  [FAIL] gfx gate [DELIBERATELY BROKEN: u19-at-200000] -- exit 1
VERDICT: FAILURES -- 7 passed, 1 failed, 0 SKIPPED            rc=1
```

Zoom coverage re-ran green: `ZOOM COVERAGE: COMPLETE`, `EXPECTED-RED zoom-off:
diverged, as it must`, 90 dumped frames / 1488 zoom-path sprites / 2 tables.
Determinism gate re-ran green.

### 2. Fresh 7z extraction — the "Done when" clause, verified

```
$ python games/ddpdoj/tools/assets.py extract     # C:\oldpcsx2\ddpdojblk.7z, 15,094,333 B
  10 files, sizes and sha256 printed
$ python games/ddpdoj/tools/assets.py check
ASSET INTEGRITY OK: 0 failing check(s) []                     rc=0
```

### 3. Two checks broken by me, seen RED, restored (nothing in the repo touched)

**(a) `gfxgate.py`'s bg_scale pair-level FAIL — never red-validated by the
implementer.** Copied `rip/gfx-gate` to the scratchpad, forged one
`f000215.regs.txt` from `bg_scale=0210` to `0610`:

```
FAIL 1 pair(s) were drawn with bg_scale != 0x210 (100%): [(215, '0x610')]. ...
FAIL: 1605632/1605632 = 100.0000% over 16 frame pair(s)       rc=1
```

It really does fail at a 100.0000 % score. (Cosmetic: the verdict line still
prints the percentage with no hint of why it is FAIL.)

**(b) `frame.lua`'s bg_scale run-level FAIL branch — also never seen red.**
Copied `frame.lua` to the scratchpad with `BGSCALE_OK = 0x9999`, ran 900 logic
frames through `pgm.run()` with a private `PGM_SCRATCH`:

```
FAIL bg_scale was non-0x210 (100%) on 0 sampled logic frame(s) and written
     non-0x210 1 time(s) after the first logic frame: ... PC(s) [0065E2:2
     13C95A:1 23C5EE:1] ...
DONE logicframes=900 videoframes=922 fails=1
```

That run also produced a fact the wave-3 material does not state: **the GAME
writes `$B04000` too — once from `$13C95A` (build A) and once from `$23C5EE`
(build B), both with 0x0210.** So the register is actively programmed to 100 %
by both builds, which strengthens the WARN/FAIL split rather than weakening it.

**(c) `assets.py check` against a corrupted export.** Copied `rip/assets`, XORed
one byte of TX tile 2730 (a sampled index) in `tx.tiles.bin`:

```
  [FAIL] TX tiles match an independent decode -- mismatches: [2730]
  [FAIL] tx sha256
ASSET INTEGRITY FAILED: 2 failing check(s)                    rc=1
```

**(d) `--min-pairs`** against an empty directory: `TOO FEW PAIRS: 0 < 12
required`, rc=1.

### 4. ROM bytes at the addresses the wave cites — spot-checked

**`$0065E2` (the bg_scale writer) is real.** `ddp3_bios.u37` is loaded
word-swapped, so the file bytes at 0x65E2 (`f933 8000 0e34 b000 0040`) unswap to

```
$0065E2:  33F9 0080340E 00B04000     move.w  $80340E,$B04000
$0065EA:  4239 00803410              clr.b   $803410
```

Confirmed: the PGM BIOS programs `bg_scale` from RAM word `$80340E`.

**The Z80 blob, re-derived with three needles I chose myself** (48 bytes at z80
`$1000`, `$2000`, `$3000`, none of them the implementer's `$010F` needle):

```
region $1C1F56..$1C7A67 = z80 $0086..$5B97  total=23314
region $2C3510..$2C9021 = z80 $0086..$5B97  total=23314
A blob == B blob over 23314 bytes: True
```

Same two addresses, same 23,314 bytes, from every needle. The claim holds and no
end is claimed that the data does not support — the bound is explicitly on the
dump, not the copy, and the two builds' images are byte-identical, so which one
was uploaded does not change the content.

**The `end <= start` refutations, recomputed from `rip/sound/*.tsv` with my own
script:** 1620 keyons, 119 with `end <= start`, **119/119 in the same 1 MiB
bank**, **0 followed within 60 ICS register writes by a rewrite of `$04/$05` for
the same voice**. Both wave-0 hypotheses are refuted, exactly as reported.

### 5. THE BUILD PROBLEM — `$18AD78` is BUILD A's code, on a VERSION-B run

`rip/sound/mailbox.tsv`: 657 doorbells, **all 657 from CURPC `$18AD78`**. In the
decrypted `:maincpu`:

```
$18AD78: 33C0 00C00002    move.w D0,$00C00002      <- the doorbell
$18AD7E: 4E75             rts                      <- wave 0's "$18AD7E"
```

There are **two** copies of that routine: `$18AD78` and `$28C252`. They are
identical over 2,379 bytes (`$18ACE6..$18B630`) and then diverge in exactly the
way two builds of one source do:

```
first differing pair  A=$18B631  B=$28CB0B
   A: ... 4EB9 0018A3AA ...   nearby constants $18A584 $18A6D2
   B: ... 4EB9 0028B884 ...   nearby constants $28BA5E $28BBAC
```

Build A's landmarks live at `$13xxxx-$15xxxx`, build B's at `$23xxxx-$25xxxx`
(`landmarks.json`). So **`$18AD78` is build A's sound routine and `$28C252` is
build B's, and on a VERSION-B run it is build A's that rings the bell, 657 times
out of 657. Build B's copy never fires.** Nothing in the commit message,
`NOTES-assets.md` §5 or the worklog says so.

Consequences:
* The mailbox protocol (`$C10006`/`$C10008` then `$C00002`) was measured through
  **build A's** driver code. The protocol itself is a RAM-level fact and is
  probably build-independent, but that is an inference, not a measurement.
* `NOTES-assets.md`: "For VERSION-B the driver image lives at decrypted
  `:maincpu` **$2C3510**" is an inference too — the doorbell evidence points the
  other way. It happens not to matter because the two blobs are byte-identical,
  but the sentence reads as measured and is not.
* The worklog's §"Noted, not mine to fix" says the wave-2 BLOCKING OPEN
  (build-A ISRs executing on a VERSION-B run) "does **not** touch anything in
  this wave". It touches the sound map directly.

### 6. The zoomcov poke happens BEFORE `emit()`, not after

`frame.lua` line 846 says *"Poked AFTER emit() above, so the TSV still records
the game's own list rather than ours"*, and the implementer told me to confirm
exactly that. The code does the opposite: `zc_write_batch()` is line 851,
`pcall(emit, pc)` is line 855. Measured in the trace the run itself wrote:

```
$ out/gfx-zoomcov-native.tsv
lf 1999 sprites 45   d_spr 888365279663
lf 2000 sprites 18   d_spr 636459051620      <- our poked 18-sprite grid
lf 2040 sprites 18   d_spr 739029840869
```

From `ZC_START` on, `sprites`, `d_spr` and `d_ram` in a zoomcov trace are the
harness's own writes. No current measurement is wrong (nothing compares those
traces, and `gfxgate`/`zoomcov.py` read the dumps, not the TSV), but the stated
invariant is false and a future diff of a zoomcov trace would compare harness
output to itself.

### 7. Zoom coverage is real but narrower than "COMPLETE" reads

`zc_pick_source()` deliberately picks the **smallest** candidate sprite
(`if not best or (wid*16*hgt) < best.area`), and it picked
`offs=$22CAAC width=1(16px) height=8`. I counted its pixels directly:

```
source sprite 16x8: opaque pixels = 29
per-row opaque: [0, 0, 4, 5, 10, 10, 0, 0]
per-col opaque: [0, 0, 0, 2, 2, 2, 4, 4, 4, 4, 3, 2, 2, 0, 0, 0]
```

Consequences, none of which are in `NOTES-assets.md` §6:
* `_line_zoom` reads `xzoom >> (xoffset & 0x1f)` over `wide*16 = 16` iterations
  and `yzoom >> (ycnt & 0x1f)` over `high = 8`. **Only bits 0..15 of every x
  zoom word and bits 0..7 of every y zoom word are ever walked**; bits 16..31
  and the `& 0x1f` wraparound are untested for all 16 entries. A wid=2/hgt=32
  source would have covered all 32 bits and was available (`wid <= 2`,
  `hgt <= 32` are the search bounds) — the code picks the smallest on purpose.
* The coverage criterion is `w != 0 and px > 0`, not "the zoom changed
  anything". Cells reporting `29px` are reporting the *unzoomed* pixel count:
  e.g. `z=1 grow=1` (eff `0x0f`, hard-coded word 1) and `z=3 grow=1 y`
  (eff `0x0d`) are 29px on both tables. Those combinations were still verified
  geometrically by the frame gate (positions shift), so this is an over-read of
  the summary line rather than a hole — but "384 combinations ... COMPLETE"
  claims more than `px > 0` proves.

### 7b. The mailbox payload log double-counts and silently truncates

Every write to the `$C10000-$C1FFFF` window is logged TWICE with identical data
— the tap sees both byte sub-accesses of one 68k word write:

```
door 2 payload tokens: ['0006=00EB', '0006=00EB', '0008=1A00', '0008=1A00']
payload token counts: 4 -> 651 rows, 64 -> 6 rows   (max 64)
```

So the reported census `0006 x1306, 0008 x1306` is **2x** the real 653 word
writes. The two-word conclusion is unaffected (the offsets are right), but the
counts in `NOTES-assets.md` §5 and the worklog are inflated. Separately,
`snd.pend` is capped at 64 entries with **no truncation marker**: 6 doorbells
(the ones preceded by the Z80 program upload) report only their first 32 word
writes, and the "top 12 offsets" ranking is computed over those truncated lists.

### 8. Smaller things I checked and found sound

* `pairs_in()` — tested directly on synthetic dumps: sparse
  `[215,216,415,416,822,823] -> [(215,216),(415,416),(822,823)]`, contiguous
  `[100..103] -> [(100,101),(102,103)]`, odd run `[100..104]` drops 104, gap
  `[100,101,103,104,105] -> [(100,101),(103,104)]`. No off-by-one. In zoomcov a
  one-frame mis-pairing would also be harmless because each batch is held for
  two logic frames.
* The gfxgate mutations run in **separate processes** (`sp.run([sys.executable,
  gfxgate.py ...])`), so the monkeypatches cannot leak between mutations.
* `FR.tx_tile` / `FR.bg_tile` / `FR.zoom_word` / `FR.SPRITE_ORDER_REVERSED` are
  all resolved as framerender module globals at call time, so every mutation
  really takes effect (and all six went red, which proves it).
* `_cmd_check` stage arithmetic: 1 env + 1 integrity + 4 integrity-RED + 1 gfx +
  1 gfx-RED + 2 (zoomcov, gate) = 10; `--quick --break-decoder` = 8 with one
  FAIL. Matches the reported 10/0/0 and 7/1/0.
* Harvest recomputed from the committed TSVs: **1211** distinct
  `(offs,width,height)` over `stage1-open` + `stage1-deep`; manifest agrees,
  `sum(record bytes) = 6363024` = blob size.
* `assets.py check` genuinely shares no decode code with `pgmgfx.py`: its own
  `REGIONS`, `_raw_region_byte` (seek/read), `_tx_tile_slow`, `_bg_tile_slow`.
  The u19-at-0x180000 value is not merely transcribed twice — the
  `u19-at-200000` mutation dropping the frame gate to 52.86 % is the
  measurement that the value is right.
* No slowdown or timing-magnitude figure is introduced anywhere in wave 3, so
  the "MAME-timed, uncalibrated" rule has nothing to bite on. The one
  emulator-timing claim (the zoom table latched a frame ahead) is explicitly
  labelled as a fact about MAME's implementation, untestable against hardware.

## What I could not do, and why

* **MAME's C++ source is not on this machine**, so `igs023_video.cpp:193`
  ("bg_scale not implemented") and the `pgm.cpp:5361-5386` line numbers could
  not be read. The u19 offset is verified by measurement instead; the
  "bg_scale is unimplemented" claim is unverified here and is load-bearing for
  calling the BIOS writes an oracle hole rather than a port hole.
* **Whether the VERSION-B run uploads the Z80 driver from `$1C1F56` or
  `$2C3510`** — the two are byte-identical, so no experiment I ran can tell
  them apart. The doorbell evidence says build A's code is in charge.
* **Whether the zoomcov poke perturbs the game itself** (as opposed to only the
  trace). The sprite list is rebuilt from scratch every frame per
  `00-recon-memmap.md`, so the risk is low, but no run compares a zoomcov trace's
  non-sprite columns against an unpoked run.
* `pgm.py sprites` and `pgm.py sound` MAME halves were not re-run (7,600 and
  5,000 logic frames); I re-analysed their committed outputs in `rip/` instead.

## If someone picks this up cold

The wave's gates are real and reproduce to the pixel. The four things to fix are
all about what the wave SAYS, not what it computes:

1. Label `$18AD78` as build A and stop implying the VERSION-B run used build B's
   sound code. Re-open the wave-2 build-A blocking item as touching wave 3.
2. Fix `frame.lua`'s line-846 comment (the poke is before `emit()`), or move the
   poke after `emit()` so the comment becomes true.
3. Add the zoom-word bit-range gap to `NOTES-assets.md` §6, and consider making
   `zc_pick_source` prefer the LARGEST candidate.
4. Say that sprite pixel data is never independently re-decoded by
   `assets.py check` — only TX and BG, and only ~25 tiles of each.
