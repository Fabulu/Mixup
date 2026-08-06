# Wave 15 - the stage-1 BACKGROUND ASSET (the never-seen-column proof)

status: COMPLETE
started: 2026-08-02
role: implementer (the only agent writing `games/ddpdoj/`)
target: `ddpdojblk`, **VERSION-B**. Every address is build B unless the line
says otherwise.

The brief (20-plan §2 W15, refined by W17): export the 248-column stage-1
background stream (`$225B78`, 8,928 B - ALL 248 columns, do not trim), the
`$800` palette block (`$227E58`), tile base `$0AA9`, the 1,820 BG tiles
`$0AA9..$11C6` through the proven 5-bpp decoder; ship as a per-stage lazy
shard; prove the renderer draws a column the 161-frame capture never saw, past
px 160, against a MAME framebuffer. Resolve the `$26C24A` second writer.
Removes capture-ledger **L7**.

## What was already on disk (built by `14-impl-whole-background.md`)

The export itself was built by the agent that wrote the file numbered 14 (the
plan's W15 is its subject). It is COMPLETE and committed (`87900ab`). On disk:

- `assets/gfx/bg.shard0..7.tiles.u8.gz` - eight column shards (0..6 = map
  columns `[32s, 32s+32)`; 7 = the `$32A9` second map), 1,820 + 205 tiles
  decoded through `bgTile`.
- `assets/gfx/bg.tileno.u16.gz`, `bg.pal.u16.gz`, `bg.smap.u16.gz`.
- `src/web/assets.js` `BgShards` (three-state lazy loader) + `loadBundle`.
- `tools/bundlegate.mjs` (shards vs MAME, but only over the 161-frame CAPTURE,
  px 0..160) and `tools/pixgate.mjs` (ROM tiles vs MAME, over a corpus that
  already reaches `bg_xscroll ≈ 0x0C00`).

So done-when 1 (integrity) and 2 (shard size) were a matter of RE-MEASURING on
a fresh extraction. The genuinely new work was done-when 3, and it is the one
measurement that closes L7.

## The gap, measured before the work

`pixgate.mjs` (the `pixslice` gate) decodes BG tiles from the ROM regions, so
it already matched MAME at `bg_xscroll ≈ 0x0C00` (3,072 px) - 11,239,424 /
11,239,424 = 100.0000 % over 112 pix-slice pairs. `bundlegate.mjs` used the
SHARDS but only over the capture (px 0..160) - 15,955,968 / 15,955,968 =
100.0000 % over 159 frames. **No gate combined SHARD tiles with a scroll
position past px 160.** That combination is done-when 3.

## DONE-WHEN 1 - fresh extraction passes the integrity checker

`node games/ddpdoj/tools/export-web.mjs` run fresh (exit 0; nothing threw):
the exporter's own checks all pass - CHECK 1 (no BG map attribute word has a
bit outside `$3E`), CHECK 2 (stage 1 holds exactly **1,820** distinct tiles
`$0AA9..$11C6`; the second map holds exactly **205** in `$32A9..$3381`), the
palette block (0 of 1,024 words have bit 15 set; **1020 / 1024** agree with the
board's palette RAM `$400..$7FF`), and the region-assembly gate (the assembled
`igs023` is exactly `IGS023_SIZE` and tile `$11C6`'s 5,120 bits fit inside it -
`cave_t04401w064.u19` must load at `$180000`).

Structural asserts (`python games/ddpdoj/tools/oracle/w20level.py columns`):
every stage's column stream is `0 mod 36` (stage 0 = 8,928 B / **248** cols);
the palette block is `$800` (2,048 B); the pairwise tile-set intersection
matrix is **ZERO** in every off-diagonal cell (no stage shares a tile).

**Two-sides rule (the exporter cannot verify itself).** The exporter decodes
through the same `bgTile` the renderer uses, so its own greenness is not the
proof that the *published shards* are correct - that proof is done-when 3
below, where the shard decode is the only variable against an independently
derived MAME framebuffer. The exporter's checks catch the gross errors (wrong
base / stride / address); the shard gate catches everything else.

## DONE-WHEN 2 - the measured shard size, vs the recon's 666 KB gz

Fresh export, zlib (node), per-shard gz:

```
shard 0  cols   0..31   289 tiles   111993 B   BOOT
shard 1  cols  32..63   275 tiles   103309 B   BOOT
shard 2  cols  64..95   174 tiles    66294 B
shard 3  cols  96..127  219 tiles    78715 B
shard 4  cols 128..159  288 tiles    98458 B
shard 5  cols 160..191  288 tiles    77294 B
shard 6  cols 192..223  288 tiles   120442 B
shard 7  second map     205 tiles    81271 B
bg.tileno.u16  3345 B   bg.pal.u16  946 B   bg.smap.u16  517 B
```

- Scroll tiles only (shards 0..6, the 1,820): **656,505 B** gz = 641.1 KiB.
  The recon (`20-recon-level-data.md`) priced these at 661,802 B; the 0.8 %
  difference is node's tighter zlib, as `14-impl` §2 already measured.
- Scroll tiles + map + palette: **660,796 B** (645.3 KiB) - the apples-to-
  apples figure against the recon's 666,469 B "661,802 tiles + 3,764 map + 903
  palette ≈ 666 KB". **0.85 % under**, well inside the 15 % bound.
- Including the second map (shard 7 + smap, which the recon did not price
  separately): **742,584 B** (725.2 KiB) = +8.9 % on 666 KB, still inside 15 %.

Bundle-wide: **967.0 KiB total, 456.8 KiB before the first frame** (boot =
shards 0+1), 510.2 KiB deferred.

**Packaging note (a measured deviation from the §5 letter).** §5 names a single
`bg-stage<N>.bin.gz`. Stage 0 instead ships as **eight column-based lazy
shards** (W14), loaded by scroll position (`followColumn`), boot = the two
shards the capture's own tiles live in. This is a measured improvement on the
single-blob plan - first paint is 456.8 KiB, not core + 666 KB - and it meets
the owner-approved budget either way. A single-blob repackage is trivial but
would regress the progressive load and serve no new measurement, so it is not
done here. The stage-0 background IS a per-stage lazy shard set; the filename
differs.

## DONE-WHEN 3 - the renderer draws a never-seen column, past px 160, == MAME

New gate: `pixgate.mjs --shards <assetsdir>` swaps ONE thing - the BG tile
source becomes the bundle's `BgShards` (`bgTileFn` the browser runs), while
sprites and the TX layer stay on the ROM, so the BG shard decode is the only
variable. The comparison runs over the `pix-slice` corpus's past-160 frames
(`bg_xscroll ≈ 0x0C00`, i.e. BG map columns the 161-frame capture, px 0..160,
never saw). The boot/title frames (`bg_xscroll == 0`, drawn from non-stage-1
tiles the shards deliberately do not carry) are out of scope and filtered.

`python games/ddpdoj/tools/oracle/pgm.py shardgate` (new; also a `check` stage)
runs the fresh export, then baseline + RED:

```
baseline: 6121472/6121472 = 100.0000% over 61 frame pair(s);
          densest run 61 consecutive, busiest 122 sprites; 61/61 past-160 exact
```

So the SHARD-backed renderer is pixel-exact against MAME past px 160. That
closes L7: the bundle holds the stage's 1,820 tiles (not the capture's 415),
and they draw correctly where the recording never reached.

**RED VALIDATION (both seen red):**
- `bg-planes` (the 5-bit plane weights reversed, composed on top of the shard
  decode): **55.9883 %**, 0/61 past-160 pairs exact - proves the shard pixels
  are decoded and compared, not silently skipped.
- `blank-shard-tile` (a MEASURED past-160 tile that is NOT in the capture set,
  blanked in the shard sheet): victim **`$0C2D`** (in `$0AA9..$11C6`, on screen
  in 61/61 past-160 pairs, 1024/1024 pixels opaque) → **99.4845 %**, 0/61 exact.
  This is the red that matters: if the gate were secretly falling back to ROM
  tiles, blanking a shard tile would change nothing and stay 100 %. It diverged
  by 31,558 px, so the past-160 picture is coming from the SHARDS.

(The victim selection excludes every tile the 161-frame capture already holds,
so `$0C2D` is genuinely a newly-exported tile - exactly the class L7 is about.)

## The `$26C24A` second tilemap writer - disposition

W17 measured `$26C24A` writing 23 columns × 9 rows for 271 frames
(**lf 4315..4585**, the midboss window) from tile base `$32A90000` - 64 % of
the stage's BG-map traffic, a second writer the ring writer `$240D76` does not
cover. Two questions, both answered by measurement:

1. **Does the render done-when (#3) need it?** No. The never-seen-column proof
   runs over the `pix-slice` dense stretch at **lf 2500..2560**
   (`bg_xscroll ≈ 0x0C00`), which is PRE-midboss (2500 ≪ 4315), so those frames
   never invoke `$26C24A` and reference only `$0AA9`-base tiles. The
   `blank-shard-tile` victim (`$0C2D`) is a scroll tile, confirming it. So the
   render check passes without the second writer's tiles, by measurement.
2. **Are they exported anyway?** Yes - W14 already shipped them: shard 7 (205
   tiles `$32A9..$3381`) and `bg.smap.u16.gz` (207 decoded `(tile, attr)`
   entries) for the wave that ports the `$26C20C` painter (W18). They are
   validated structurally (`w20level.py columns` and the exporter's CHECK 2)
   and carried by `loadBundle`; nothing currently DRAWS them (the painter is
   unported), which is W18's work, not W15's.

**Outcome: neither BLOCK nor additional export is needed.** The second writer
is out of the render check's measured scope and its assets are already on disk
for W18.

## What this wave changed

```
M  games/ddpdoj/tools/pixgate.mjs            --shards mode + 2 shard REDs
M  games/ddpdoj/tools/oracle/pgm.py          _cmd_shardgate + COMMANDS + check stage
```

`tools/export-web.mjs`, `src/web/assets.js`, `tools/bundlegate.mjs`,
`tools/webgate.mjs` are UNCHANGED (and re-verified green below). No `src/`
change. No ROM-derived bytes are committed (`assets/`, `rip/`,
`tools/oracle/out/` are gitignored).

## Re-runs, all green (measured this wave)

- `node --test games/ddpdoj/tests/` - **308 pass, 0 fail, 0 skipped**.
- `pgm.py pixslice --reuse` - **13,647,872 / 13,647,872 = 100.0000 %** over 136
  pairs (unchanged: the ROM-tile gate; this wave did not touch its path).
- `pgm.py shardgate` - fresh export clean; baseline 6,121,472 / 6,121,472 =
  100.0000 % over 61 past-160 pairs; both REDs diverge.
- `node tools/bundlegate.mjs` - **15,955,968 / 15,955,968 = 100.0000 %** over
  159 frames (the shard path still works).
- `node tools/webgate.mjs` - PASS, 14 files over HTTP, one frame 98.8 % non-black.

L7 is removed. The bundle carries the stage's 1,820 background tiles, they
decode correctly, and a column the capture never saw draws pixel-exact against
MAME past px 160.
