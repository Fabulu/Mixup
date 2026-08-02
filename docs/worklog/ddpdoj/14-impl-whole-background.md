# Wave 14 — the WHOLE stage-1 background

status: **COMPLETE.** PART ONE (§0–§7, below) was written by an agent stopped at
a usage limit and is left EXACTLY as it stood, because §7 was the handover that
worked. **PART TWO (§8–§12) is the finish and supersedes PART ONE's "NOT RE-RUN"
table in §0 and its open items in §6.** If you are reading §0's status table,
read §10 instead: every row of it has since been run.
started: 2026-08-02
role: implementer (the only agent writing `games/ddpdoj/`)
target: `ddpdojblk`, **VERSION-B**. Every address is build B unless the line
says otherwise.

The brief: the port walks all 8,486 px of stage 1 (W13) but the bundle carries
only the 415 BG tiles the 161-frame capture flew over, which is 160 px. Past
that the screen is black. Export the whole thing, shard it, and make a late or
missing shard SAY SO.

---

## 0. STATE OF THIS WAVE WHEN IT STOPPED

**The implementation is on disk and appears complete; it is NOT fully
re-verified by this agent.** The bulk of the code (`export-web.mjs`,
`src/web/assets.js`, `src/web/app.js`, `tools/bundlegate.mjs`,
`tools/webgate.mjs`, `tools/bgstrip.py`) was written by an EARLIER agent on this
same wave that was stopped, left uncommitted in the working tree, and adopted
here. What this agent added is the region-assembly gate in `export-web.mjs`
(§4.3 below) and this record.

What is PROVEN by this agent's own runs:

| thing | status |
|---|---|
| `node --test games/ddpdoj/tests/` at HEAD | **200 pass, 0 fail, 0 skipped** (baseline) |
| HEAD's bundle size, re-measured | **433.1 KiB**, all of it boot |
| the sharded bundle exists on disk | yes, 8 shards, sizes in §2 |
| bgstrip PNGs incl. RED variants exist on disk | yes, `games/ddpdoj/rip/bgstrip/` |
| the test suite AFTER the working-tree changes | **NOT RE-RUN by this agent** |
| bundlegate / demogate / webgate after the changes | **NOT RE-RUN by this agent** |
| `node tools/build-dist.mjs` leak guard | **NOT RE-RUN by this agent** |
| a human LOOKING at the PNGs | **NOT DONE — see §6** |

Nothing ROM-derived is committed. `games/ddpdoj/assets/` and
`games/ddpdoj/rip/` are gitignored twice over (repo root `.gitignore` matches an
unanchored `assets/`, and `export-web.mjs` writes `assets/.gitignore` containing
`*` in the same breath as it creates the directory).

---

## 1. THE MEASUREMENT THAT SETS THE BAR

`export-web.mjs` **as it is at HEAD** (i.e. the wave-13 page, the 415-tile
recording-derived sheet), run to a scratch directory so the working tree was not
disturbed:

```
$ git show HEAD:games/ddpdoj/tools/export-web.mjs > games/ddpdoj/tools/.export-web.HEAD.mjs
$ node games/ddpdoj/tools/.export-web.HEAD.mjs --out <scratch>/assets-head
reading  C:\programmieren\batman\games\ddpdoj\rip
coverage over 161 captured frames, 7671 records:
  BG tiles 415   TX tiles 159   sprite streams 166 (16 of them the ship's own bank frames, ...)
  gfx/bg.tiles.u8.gz          158569 B  (from 424960 B)
  gfx/bg.tileno.u16.gz           635 B  (from 830 B)
  gfx/tx.tiles.u8.gz            2549 B  (from 10176 B)
  gfx/tx.tileno.u16.gz           297 B  (from 318 B)
  spr/mask.u16.gz               5708 B  (from 32768 B)
  spr/col.u16.gz               34566 B  (from 65536 B)
  capture.bin.gz               67630 B  (from 4131904 B)
  seed.bin.gz                   6880 B  (from 131072 B)
  player.tables.json          121397 B
  manifest.json                 7077 B
  capture.json                 38202 B
BUNDLE <scratch>/assets-head: 433.1 KiB served
```

**433.1 KiB, every byte of it before the first frame.** That is the number the
new boot figure has to beat, and it is the number the brief quotes. (The recon's
407.9 KiB in `20-recon-level-data.md` §4b is the same bundle measured on disk at
an earlier wave; the 25 KiB difference is wave 12's 17-frame ship harvest and
the `.gz` bodies re-measured. Both are honest; **433.1 KiB is the current one**
and is what this wave compares against.)

The temporary copy `games/ddpdoj/tools/.export-web.HEAD.mjs` was deleted
immediately after the run. Do not look for it.

---

## 2. WHAT THE SHARDED BUNDLE ACTUALLY IS, ON DISK

`games/ddpdoj/assets/` after the working tree's `export-web.mjs` was run
(timestamps 2026-08-02 06:34):

```
gfx/bg.shard0.tiles.u8.gz   111993      gfx/bg.pal.u16.gz         946
gfx/bg.shard1.tiles.u8.gz   103309      gfx/bg.smap.u16.gz        517
gfx/bg.shard2.tiles.u8.gz    66294      gfx/bg.tileno.u16.gz     3345
gfx/bg.shard3.tiles.u8.gz    78715      gfx/tx.tiles.u8.gz       2549
gfx/bg.shard4.tiles.u8.gz    98458      gfx/tx.tileno.u16.gz      297
gfx/bg.shard5.tiles.u8.gz    77294      capture.bin.gz          67630
gfx/bg.shard6.tiles.u8.gz   120442      capture.json.gz          3895
gfx/bg.shard7.tiles.u8.gz    81271      player.tables.json.gz   34300
                                        seed.bin.gz              6880
                                        manifest.json           10109
                                        spr/ (mask+col)         ~40274
```

Shard KiB: **109.4 100.9 64.7 76.9 96.2 75.5 117.6 79.4**, against the recon's
predicted 110.5 102.1 66.1 77.8 97.7 76.3 119.6 / 80.9 (§4d and §4a of
`20-recon-level-data.md`). Every shard is within ~1.5 % of the prediction, low
in each case, which is the expected sign: node's zlib runs ~0.7 % tighter than
python's and the recon's figures are python's (§4c states this).

**The two JSON bodies are now gzipped**, which they were not at HEAD:
`player.tables.json` 121,397 → 34,300 B and `capture.json` 38,202 → 3,895 B.
That is 121,404 B recovered, and it is what pays for the whole-stage background
at boot. `manifest.json` deliberately stays PLAIN — it is the file that says how
everything else is encoded.

### The boot arithmetic

Boot = everything except the six DEFERRED shards (2,3,4,5,6,7):

```
  111993 + 103309                  shards 0+1              215302
  + 946 + 517 + 3345               bg pal, smap, tileno      4808
  + 2549 + 297                     tx                        2846
  + ~40274                         spr/mask + spr/col       40274
  + 67630 + 3895                   capture                  71525
  + 34300 + 6880 + 10109           tables, seed, manifest   51289
  ---------------------------------------------------------------
  ~= 386 KiB boot, ~= 907 KiB total
```

**Boot goes DOWN from 433.1 KiB.** MEASURED, `node games/ddpdoj/tools/export-web.mjs`,
ACTUAL final lines (this run also exercises the region-assembly gate of §4.3,
which passed):

```
BUNDLE C:\programmieren\batman\games\ddpdoj\assets: 887.2 KiB total,
       377.0 KiB BEFORE THE FIRST FRAME (shards 0+1), 510.2 KiB deferred
  BG shards, gz:
    0 scroll    cols   0.. 31   289 tiles   111993 B = 109.4 KiB  BOOT
    1 scroll    cols  32.. 63   275 tiles   103309 B = 100.9 KiB  BOOT
    2 scroll    cols  64.. 95   174 tiles    66294 B =  64.7 KiB
    3 scroll    cols  96..127   219 tiles    78715 B =  76.9 KiB
    4 scroll    cols 128..159   288 tiles    98458 B =  96.2 KiB
    5 scroll    cols 160..191   288 tiles    77294 B =  75.5 KiB
    6 scroll    cols 192..223   288 tiles   120442 B = 117.6 KiB
    7 secondmap second map      205 tiles    81271 B =  79.4 KiB
```

**887.2 KiB total, 377.0 KiB boot against today's 433.1 KiB — 56.1 KiB LESS
before the first frame, while carrying 4.9x the background.** Slots:
289+275+174+219+288+288+288 = 1,821 for the scrolling map (1,820 map tiles plus
the recording's one orphan, tile $0000) + 205 second-map = **2,026 slots**.
Columns exported: **224 scrolling + 23 second map**.

The recon predicted a whole-stage total of 874.8 KiB; this is 887.2 KiB because
the recon's figure is the BACKGROUND alone and this bundle also carries the
capture, the seed, the sprite streams and the player tables.

---

## 3. THE LAYOUT DATA — every address, so nobody re-derives it

All from `docs/worklog/ddpdoj/20-recon-level-data.md`, which is the brief for
this wave and whose numbers were NOT re-derived here.

```
stage 1 = stage INDEX 0
  column stream   $225B78 .. $227AF7   8,064 B   224 columns   tile base $0AA9
  SECOND MAP      $227AF8 .. $227E33     828 B    23 columns   tile base $32A9
  one spare col   $227E34 .. $227E57      36 B    accounted for by NOTHING
  palette block   $227E58 .. $228657   2,048 B   32 banks x 32 xRGB555
```

* A column record is **9 longwords = 36 B**, `(tile:u16, attr:u16)`.
  `$26135A`'s `dbra D6` with `D6 = 8` is where the 9 comes from.
* `$240D86`/`$240D88` does `add.l D2,D4` with `D2 = base<<16`, i.e. **the base
  is added to the WHOLE LONGWORD**, which in practice means the high word. The
  attribute word rides through untouched.
* **NO BG map entry in the whole game sets a flip bit.** All 8,142 entries of
  all five stages have `attr & ~$3E == 0`. The attribute is a pure 5-bit
  palette-bank select: `bank = (attr & $3E) >> 1`, indexing `$400 + bank*32`.
* Stage-1 tiles span **$0AA9..$11C6**, 1,820 distinct out of 2,232 entries.
* The second map holds **205 distinct tiles $32A9..$3381** in 23x9 = 207
  entries.
* The stream is **248** columns, not 304. `scrollmap.py sim`'s "stream is N
  cols" line over-runs into the palette block; `w20level.py columns` is right.
  Of the 248, the scroll VM reaches **0..223** and no more (measured over an
  11,000-frame invulnerable run: 573 complete ring columns, 0 unmatched).
* The second map's painter is **object type `$1C`, table entry `$267904`, init
  `$26C1C2`, handler `$26C20C`**, and it is in NO stage's spawn script (all
  2,237 records checked). **The painter is UNPORTED.** The bundle ships its
  pixels and its decoded map and nothing draws them yet.

### The background is a PAINTED STRIP, not a tile set

88.4 % of stage 1's tiles appear in exactly one map column; 76.2 % of columns
are nine consecutive tile numbers. That is WHY sharding on scroll position is
exact and nearly free: a scroll range *is* a tile range. Measured overhead of 8
shards over one blob: **+865 B = +0.13 %**. Do not go looking for tile-reuse
savings — deduplicating stage 1 saves **two tiles**.

### The schedule the lazy loader is cut against

From the validated scroll simulation — first logic frame at which each shard's
first column is written:

```
shard  cols       needed at          gap to previous
  0     0.. 31   frame   55 =  0.9 s
  1    32.. 63   frame  298 =  5.0 s    +4.0 s
  2    64.. 95   frame 1525 = 25.4 s   +20.4 s
  3    96..127   frame 4037 = 67.3 s   +41.9 s
  4   128..159   frame 6085 =101.4 s   +34.1 s
  5   160..191   frame 6811 =113.5 s   +12.1 s
  6   192..223   frame 7067 =117.8 s    +4.3 s   <- TIGHTEST: 117.6 KiB / 4.3 s
                                                    = 228 kbit/s
  7   second map first painted lf~3000 ~= sim frame 1380 ~= 23 s
```

---

## 4. WHAT THE CODE DOES, FILE BY FILE

### 4.1 `games/ddpdoj/tools/export-web.mjs`

* Reads the **decrypted 68000 image** `games/ddpdoj/tools/oracle/out/maincpu.bin`
  (6,291,456 B) for the map, second map and palette — they are 68000 DATA, not
  tile ROM.
* `decodeMap(at, n, base)` → `[[tile,attr] x 9] x n`, big-endian, base added to
  the high word.
* **CHECK 1** — every attribute word of both maps must have no bit outside
  `$3E`. This one check catches a wrong stride, a wrong base AND a swapped
  tile/attr half at once, because all three turn the attribute into noise.
* **CHECK 2** — 1,820 tiles in `$0AA9..$11C6` and 205 in `$32A9..$3381`, or it
  throws.
* **PALETTE CHECK A** — 0 of 1,024 words may have bit 15 set (xRGB555 never
  does; a block of map entries read as colours sets it on a third of them).
* **PALETTE CHECK B** — the block must agree with the BOARD's own palette RAM
  `$400..$7FF` at capture frame 0 on ≥ 1,000 of 1,024 entries. Measured **1020**;
  the four that differ are **bank 21 pens 0..3**, which the game ANIMATES
  through an unported routine. A wrong palette address drops this to ~370.
* Shards: 0..6 are map columns `[32s, 32s+32)`, shard 7 is the second map. A
  tile goes to the **FIRST** shard that uses it → disjoint by construction, and
  the exporter asserts disjointness.
* **The capture's own tiles are folded into the BOOT set.** 414 of the 415 tiles
  the recording uses are in columns 0..63 (shards 0-1). The 415th is **tile
  $0000** — the value `$23C668`'s ring clear leaves behind, which no map column
  ever names — and it is forced into shard 0. If more than 32 such orphans ever
  appear the exporter throws: that would mean the capture is not of stage 1.
* Slots are contiguous across shards in shard order, so **one** `bg.tileno.u16`
  describes every slot and the loader can build its tile→slot table before a
  single shard body has arrived. That is what makes "shard 4 has not arrived"
  distinguishable from "this tile was never exported".

### 4.2 the outputs

```
gfx/bg.shard<0..7>.tiles.u8.gz   decoded, 1 byte per pixel, 1024 B per tile
gfx/bg.tileno.u16.gz             slot -> tile number, ALL shards, shard order
gfx/bg.pal.u16.gz                the $227E58 block, 1024 xRGB555 words
gfx/bg.smap.u16.gz               the second map DECODED, (tile,attr) pairs,
                                 $32A9 ALREADY ADDED, column-major, 9 rows
```

The 224 scrolling columns are **NOT a file**: the port reads them out of the
`$225B78` ROM window `player.tables.json` already carries (`$22E0` B, which
spans the second map too) and writes `$900000` itself, the way `$26135A` does.

### 4.3 THE REGION-ASSEMBLY TRAP, and the gate this agent added

`cave_t04401w064.u19` loads at **0x180000, NOT 0x200000**, and SHADOWS the top
of `pgm_t01s.rom`. A wrong base shifts every tile index above 0xC000 and still
renders a **plausible** picture — wave 3 measured that mutation at **52.86 % of
pixels correct**. The layout lives in `src/render/regions.js`
(`IGS023_LAYOUT`, `IGS023_SIZE = 0xA00000`) and is repeated in
`games/ddpdoj/tools/bgstrip.py`.

This agent added an explicit assertion to `export-web.mjs`, right after the
shard pixels are decoded: the assembled region must be exactly `IGS023_SIZE`
bytes and the highest tile number any shard names must have all 5,120 of its
bits inside it. **THIS ASSERTION HAS NOT BEEN SEEN RED.** It is a weaker form of
`bgstrip.py --check --break u19`, which HAS been (§5). If you distrust it,
delete it — the pixel check is the real one.

### 4.4 `games/ddpdoj/src/web/assets.js` — the `BgShards` class

Three states, three different messages, and that distinction is the whole point:

```
ready    the tile is drawn
loading  the tile is drawn as the TRANSPARENT PEN (31), the shard is promoted to
         the head of the queue, and the shard is NAMED on the status line
failed   the next draw that needs that shard THROWS an AssetError naming the
         shard, the map columns it covers, and the file to regenerate
```

* `loadIndex()` builds `shardOfTile[]` for all 65,536 tile numbers from
  `bg.tileno.u16` + the manifest's `firstSlot` runs, and requires the runs to
  tile the slot space exactly. So the page always knows WHICH shard a tile is
  in even before that shard exists.
* A tile in **no** shard at all is a different bug — an EXPORT gap — and is
  counted in `bg.orphans` / `missingBgTiles` rather than reported as a late
  fetch.
* `fetch()` resolves even on failure; the failure is raised by `demand()` at the
  moment a draw needs it. A shard nobody has reached cannot kill a running page
  from a background fetch.
* `pump()` is deliberately **serial** — one fetch at a time — because the point
  of the queue is that a promoted shard jumps ahead, and eight parallel fetches
  over one connection make promotion meaningless.
* `followColumn(col)` promotes the shard covering `col` and the one 32 columns
  ahead.
* A **BOOT** shard that fails throws at LOAD, not at draw: there is no picture
  at all without it.

### 4.5 `games/ddpdoj/src/web/app.js`

* `Demo.streamColumn()` turns `game.vram.streamPtr` (the ROM address `$26134E`
  loaded for the current column, `$225B78 + 36*col`) into a map column, and
  returns **-1** rather than a plausible number when the pointer is outside
  stage 1's own stream — the boss lock rewinds it and stages 2..5 are not
  exported at all.
* `step()` calls `bundle.bg.followColumn(this.streamColumn())`.
* `boot()` calls `bundle.bg.prefetchAll()` AFTER `loadBundle` returns, so the
  deferred shards compete with nothing.
* The status line gained `mapColumn` and `shards` (`bg.status()`), whose
  `waiting` field is the honest part: a shard a DRAW asked for and did not have.

### 4.6 the gates

* `tools/bundlegate.mjs` gained two breaks:
  * `--break shard-404` — a deferred shard 404s, then a frame needs one of its
    tiles → the draw must THROW an `AssetError` **naming the file**.
  * `--break shard-late` — a deferred shard is simply not fetched → the draw
    must NOT throw, must return the transparent pen, and the shard must appear
    in `bg.status().waiting`.
  * **and it fixed `--break drop-tile`, which the sharding had silently
    disarmed.** The victim used to be the middle slot of the exported sheet,
    which was safe while all 415 sheet tiles came from the recording. The sheet
    is now the whole stage's ~2,026 tiles and only 415 are the capture's, so the
    middle slot is a tile `verifyCoverage` never looks at — **the break would
    have gone quietly GREEN**. The victim is now measured from the capture
    itself. This is the single most important line of the whole diff to keep.
* `tools/webgate.mjs`'s missing-file VICTIM moved from `gfx/bg.tiles.u8.gz` to
  `gfx/bg.shard0.tiles.u8.gz` — a BOOT shard, because a deferred shard's 404 is
  a different check (`bundlegate --break shard-404`) and would not throw at
  load.

---

## 5. THE PICTURE — `games/ddpdoj/tools/bgstrip.py`

```
python games/ddpdoj/tools/bgstrip.py 0 32            columns 0..31 -> PNG
python games/ddpdoj/tools/bgstrip.py 96 32           past the recording
python games/ddpdoj/tools/bgstrip.py 0 224 --check   EVERY column, bundle vs
                                                     CARTRIDGE, 0 diff or fail
python games/ddpdoj/tools/bgstrip.py --second        the $227AF8 map
python games/ddpdoj/tools/bgstrip.py 0 224 --check --break planes|base|u19
```

It renders **out of the published bundle**, including reading the map from
`assets/player.tables.json.gz`'s ROM window — so a picture from it is a picture
of exactly the bytes the page has. `--check` re-decodes the same columns
straight out of the CARTRIDGE (region assembled from the ROM files, `bgTile`'s
5bpp LSB-first bitstream) and requires **0 differing pixels**.

Output already on disk in `games/ddpdoj/rip/bgstrip/` (gitignored):

```
bg.0_223.png              bg.96_127.png            bg.second.png
bg.0_223.break-base.png   bg.0_223.break-planes.png  bg.0_223.break-u19.png
```

**A RED SWITCH THAT WAS DELETED BECAUSE IT COULD NOT FAIL.** The first version
had a `swap` break that read the map longword's tile and attr halves the other
way round. It came back **100.0000 % identical** — because it mutates the MAP,
and BOTH SIDES of the comparison read the same map. *A mutation of a shared
input is not a mutation at all; it moves both answers together.* The three
surviving breaks are all one-sided: `planes` and `u19` change only how the
cartridge is decoded, `base` changes only which bundle slot is asked for. The
tile/attr split is instead checked where it can be — `export-web.mjs`'s
attribute-bit assertion, which a swap destroys. **Write this down somewhere
permanent; it is the most transferable thing this wave learned.**

---

## 6. WHAT I COULD NOT DO

1. **There is no browser on this machine.** Nothing here proves the page looks
   right, that a shard promoted by `followColumn` actually arrives in time over
   a real connection, or that the status line reads sensibly. A human must open
   the page, scroll past 160 px, and watch. §7 lists it.
2. **I did not look at the PNGs with my own eyes.** They exist and the
   `--check` gate they came with is a stronger check than eyeballing — but the
   brief asked for the eyeball check specifically, on the grounds that a wrong
   decode produces plausible garbage, and it is NOT DONE.
3. **I did not re-run the test suite, the three pixel gates, or the leak guard
   after the working-tree changes.** The 200/0/0 baseline is HEAD's.
4. **The unit count did not go up.** No test was added by this agent. The brief
   required it to rise from 200 with 0 skipped.
5. **The second map's painter `$26C20C` is unported.** Shard 7 ships 205 tiles'
   pixels and 207 decoded map entries that NOTHING CURRENTLY DRAWS. What spawns
   type `$1C` is named-not-found (recon §8.5).
6. **The 13 BG ELEMENTS are not exported.** 143,102 B gzipped of sprite streams
   that the scroll VM's op `$10` spawns (recon §4a). They are a real part of the
   stage-1 background and this wave does not ship them. The background will be
   missing its big objects even when this wave is finished.
7. **The palette block is shipped, validated, and NOT USED** — the page still
   draws with the capture's palette, because bank 21 pens 0..3 are animated by
   an unported routine.
8. **Column 247** (`$227E34..$227E57`, 36 B) is accounted for by neither the
   scroll VM nor the `$26C220` painter. 36 bytes. Not chased.

---

## 7. IF SOMEONE PICKS THIS UP COLD

**The code is on disk and uncommitted except for this file. Nothing was
committed but the worklog.** Start by reading §0.

Exactly what I was about to do next, in order:

1. **`node games/ddpdoj/tools/export-web.mjs`** and capture its final three
   lines verbatim — the `BUNDLE ... N KiB total, M KiB BEFORE THE FIRST FRAME`
   line is the number the whole wave is judged on, and it is the one measurement
   §2 estimates rather than states.
2. **`node --test games/ddpdoj/tests/`** — must be > 200 pass, 0 fail,
   0 skipped. If it is exactly 200, tests still have to be written (item 5).
3. **`node games/ddpdoj/tools/bundlegate.mjs`** at 15955968/15955968, then each
   of `--break drop-tile drop-stream zero-col blank-tile shard-404 shard-late`
   SEEN RED. `shard-404` and `shard-late` are new and have never been run by
   me. **`--break drop-tile` is the one to distrust**: §4.6 explains how the
   sharding disarmed it once already.
4. **`node games/ddpdoj/tools/demogate.mjs`** and **`webgate.mjs`** — both were
   100.0000 % and must stay there. webgate's VICTIM changed (§4.6).
5. **`node tools/build-dist.mjs`** — the ROM-leak guard must stay clean. It
   inflates `.gz` bodies and checks them; a 64 KiB slice of mask ROM once
   gzipped to 96 B and slipped under an earlier threshold. **Do not weaken it.**
   The eight new `.gz` shard bodies are the new thing it will see.
6. **Write the tests.** The count must rise from 200. The cheapest honest ones,
   in the repo's existing synthetic-data style (`tests/web-page.test.js` runs on
   source text and synthetic buffers so the suite works with no cartridge
   extracted):
   * `BgShards.loadIndex` rejects shard runs that do not tile the slot space,
     and rejects a tile that appears in two shards.
   * `demand()` on a failed shard throws an `AssetError` that NAMES the shard
     file; `demand()` on a loading shard does not throw and puts the shard in
     `status().waiting`.
   * `promote()` moves a queued shard to the head; `pump()` is serial.
   * `Demo.streamColumn()` returns -1 for a pointer outside the stream and for
     a pointer that is not a multiple of 36, and the right column for
     `$225B78 + 36*c`.
   All four run on synthetic objects; none needs the cartridge.
7. **LOOK AT THE PNGs.** `bg.96_127.png` is the one that matters — those columns
   are past the 160 px the recording covered, so they are exactly what used to
   be black. Also `bg.second.png` ($227AF8, base $32A9) and at least one
   `--break` image for contrast.
8. Then the worklog's status line and the commit.

**What I ruled out / did not need to re-derive:**

* All of `20-recon-level-data.md`'s numbers. They are measured, red-validated by
  mutation, and this wave takes them as given. Do not re-run
  `w20maprun.py 11000` (an 11,000-frame MAME run) to re-confirm them.
* Shipping the ROM's own packed 5bpp instead of decoding: **21 % BIGGER** after
  gzip (792,954 vs 656,958). Planar is worse still. Brotli is worth 14–40 % but
  `DecompressionStream` has no brotli, so it is a server `Content-Encoding`
  lever, not a file-format one.
* Deduplicating stage 1's tiles: saves **two tiles**.
* Sharing tiles between stages: **three duplicate pictures in 7,328**. The
  marginal cost of a later stage is the full cost of that stage.
* A 32-column shard is a choice, not a boundary. The data's own boundary is the
  90-tile / 10-column block, which would give 25 shards of ~26 KiB.

**Files this wave has changed or created (all uncommitted except this one):**

```
M  games/ddpdoj/tools/export-web.mjs      the whole-stage export + shards
M  games/ddpdoj/src/web/assets.js         BgShards, the three-state loader
M  games/ddpdoj/src/web/app.js            streamColumn, followColumn, prefetchAll
M  games/ddpdoj/tools/bundlegate.mjs      +2 breaks, and drop-tile's victim fixed
M  games/ddpdoj/tools/webgate.mjs         VICTIM -> a BOOT shard
?? games/ddpdoj/tools/bgstrip.py          LOOK AT THE BACKGROUND (+3 red switches)
```

`games/ddpdoj/tools/bgstrip.py` is UNTRACKED and is the only genuinely new file.
It must be committed with the rest or the visual check has no tool.

**The commit recipe, because a stale `read-tree` has reverted work on this repo
twice:**

```
export GIT_INDEX_FILE=.git/dojbg.index
# do ALL the work first
git read-tree HEAD          # IMMEDIATELY before the commit, not before the work
git add <paths BY NAME>
git diff --cached --name-only    # READ IT. Only your files.
git commit -m "..."
```

The repository's MAIN index is dirty with an unrelated agent's staged deletions
(`git status` shows `D` for dozens of files that exist on disk). That is exactly
why the private index and the late `read-tree` are not optional here.

---

# PART TWO — the finish, by the agent that picked it up cold

started: 2026-08-02, from `87900ab` (which landed all of PART ONE's code).
Everything below is this agent's own run. Nothing in PART ONE was re-derived.

## 8. THE PICTURES — LOOKED AT, WITH EYES

§6 item 2 and §7 item 7. **DONE. Verdict: SCENERY, not plausible noise.**

`bg.96_127.png` — columns 96..127, the shard-3 range, which is 3,072..4,095 px
into a stage the recording only ever covered the first 160 px of. **This is
exactly the stretch that used to render black, and it is a picture of a place.**
A brick viaduct runs diagonally across the top with a chain-link/girder deck
above it; a blue-grey riveted metal retaining wall runs down the right in
perspective, with its own highlight band and shadow; a pale stone-block kerb
edges a rubble-and-sand riverbed that runs the length of the strip; a small
railed structure appears bottom right. The black is the map's own empty
entries, not a decode failure — it has straight tile-aligned edges where the
map ends and organic edges nowhere.

**The tell that matters is CONTINUITY ACROSS TILE SEAMS.** A wrong plane order
or a wrong ROM base produces per-tile-coherent rubbish: each 32x32 cell looks
like *something*, and the seams between them do not line up. Here the diagonal
viaduct crosses roughly a dozen tile boundaries with the mortar courses
unbroken, the metal wall's highlight band runs continuous for hundreds of
pixels across many cells, and the kerb's stone joints continue through every
seam. Nothing in a mis-decode survives that.

`bg.second.png` — the $227AF8 / base $32A9 map, 23 columns. A blast crater:
molten orange lava pooled at the centre with a soft glow gradient, charred
concrete, scattered wreckage and girders, hexagonal revetment walls, and an
ornate gold-and-cream architectural border along the top left. Deliberate art,
correct palette (the orange has a real hot-to-dark ramp, not banded noise), and
again continuous across seams. **It also draws nothing in the page yet** — the
painter $26C20C is unported (§6 item 5). This is shard 7's pixels, shipped and
unread.

`bg.0_223.png` — the whole stage. Reads top-to-bottom as: a pocked grey
asteroid/rock surface; an industrial deck with catwalks and lit windows; a city
block with green-lit signage; a long diagonal rail/bridge span with blue running
lights; the metal-wall-and-riverbed stretch of `bg.96_127`; a large circular
plaza/arena; a red-brick district; and a gold-lit industrial complex at the end.
That is a stage with a designed progression, not 224 columns of anything else.

### the break images — and a correction to §5

`bg.0_223.break-planes.png` and `bg.0_223.break-u19.png` are **byte-identical
to `bg.0_223.png`** (sha1 `9d8d865a…` for all three). **That is correct and it
is the point**, but it is not stated in §5 and it will mislead the next reader:
`planes` and `u19` are ONE-SIDED breaks that change only how the CARTRIDGE side
is decoded. The PNG is rendered from the BUNDLE. So the break moves the
`--check` diff count and cannot move the picture. **Do not read those two files
as "what a break looks like" — they are not.** The red is in `--check`'s output,
not in the image.

`bg.0_223.break-base.png` is the only break that DOES change the picture,
because `base` is the one that mutates the bundle side: it is a solid **magenta**
column with black holes — magenta being bgstrip's "this tile is not in the
bundle" marker. Dropping the $0AA9 stage base asks for tile numbers no shard
holds, so essentially every lookup misses. Unmistakable, and 20,063 B against
the good picture's 1,254,769 B — even the FILE SIZE says it.

**Stale artifact:** `bg.0_223.break-swap.png` (539,652 B) is still on disk. It
is the output of the `swap` break §5 says was DELETED for being unable to fail.
It is a leftover from before the deletion, it is in gitignored `rip/`, and it
should not be cited as evidence of anything. Left in place; noted here so the
next reader does not go looking for a `--break swap` that no longer exists.

## 9. THE TESTS — 200 -> 207, and TWO MORE DEFECTIVE CHECKS FOUND

§6 item 4 and §7 item 6. **DONE. `node --test games/ddpdoj/tests/` is now
207 pass / 0 fail / 0 skipped / 0 todo**, against the 200/0/0 baseline this
agent re-confirmed at `87900ab` before touching anything.

New file: `games/ddpdoj/tests/web-shards.test.js`, 7 tests. All four items §7
specced, plus three the specced ones needed anyway. Synthetic manifests,
synthetic shard bodies, and the exporter's own SOURCE TEXT — no cartridge, no
`assets/`, no network, in the house style.

| test | what it pins |
|---|---|
| `loadIndex REJECTS shard runs that do not tile the slot space` | gap, overlap, short sum, and a `bg.tileno.u16` of the wrong length |
| `loadIndex REJECTS a tile that appears in TWO shards` | across shards and within one |
| `demand() on a FAILED shard throws an AssetError NAMING THE FILE` | the path, the columns, the rebuild command, the original cause, the second-map wording, and no-retry |
| `demand() on a LOADING shard does NOT throw and puts it in status().waiting` | survivable, named, cleared on arrival, and a SHORT body is a failure not a partial install |
| `promote() moves a QUEUED shard to the head, and pump() is SERIAL` | reordering mid-flight, idempotence, and `maxLive === 1` |
| `followColumn() promotes the shard under the cursor and the one ahead` | the lookahead, the `-1` no-op, the second-map shard never scrolled into |
| `streamColumnOf() places $225B78 + 36*c and REFUSES everything else` | the 224 columns, off-the-end, before-the-base, and MID-COLUMN |

### one source change was needed

`Demo.streamColumn()` was a method on a class `app.js` does not export, so it
could not be reached from a test. The arithmetic is now
**`export function streamColumnOf(map, ptr)`** and the method is a one-line call
to it — the same shape, and for the same reason, as `pickScale`. No behaviour
changed.

### THE MUTATION RUN — every assertion was made to go RED before it was believed

The brief said to assume the sixth defective check until it has been watched
going red. It was right twice. 16 single-line mutations of `src/web/assets.js`
and `src/web/app.js` were applied one at a time, the suite run, the source
restored. **14 went RED. Two came back GREEN and both were MY assertions, not
the loader's:**

**(6) `assert(!bg.queue.includes(2))` after `promote()` on a failed shard.**
Deleting `promote()`'s `state === 'failed'` early return changed nothing:
`promote()` unshifts the shard, `pump()` discards it on the very same tick
because it is not `idle`, and the queue is empty either way. The assertion was
reading a variable that is empty for a reason unrelated to the guard it claimed
to test. **Deleted and replaced by a FETCH COUNT** — the observable property is
"a failed shard is never requested twice", and counting requests is the only way
to see it.

And the replacement taught the more interesting fact: **the no-retry property is
held by a REDUNDANT PAIR of guards, `promote()`'s and `pump()`'s, and either
one alone is sufficient.** No single-line mutation can make the fetch-count
assertion fail. Removing BOTH does (verified RED). That is written into the test
body so nobody reads a green run as "each of those two lines is covered".

**(7) `assert.equal(streamColumnOf(map, 0), -1)` as a test of the `if (!ptr)`
guard.** Deleting the guard changes no answer: `off = 0 - $225B78` is negative
and the `off < 0` arm returns -1 anyway. The same is true for `NaN` and
`undefined`. The assertion is a TRUE statement about behaviour and is kept —
but its comment now says it pins the behaviour and not that line, because the
line is unreachable as a difference.

**The generalisation, which is §5's lesson in a second costume.** §5 found a
red switch that could not fail because it mutated a SHARED INPUT. These two
could not fail because they asserted on a value that a REDUNDANT SIBLING already
forces. Both are the same disease — *an assertion whose subject is not what it
names* — and both are only findable by mutating the source and watching. **A
test that has never been seen red is a comment.** Defective checks in this
project now number seven.

## 10. THE GATES — ALL RUN, ALL GREEN

§6 item 3 and §7 items 1-5. Every gate PART ONE listed as NOT RE-RUN has now
been run against the committed tree. **Paths are relative to `games/ddpdoj/`,
not the repo root, except `build-dist.mjs` which is repo-root.**

| gate | command | result |
|---|---|---|
| unit | `node --test games/ddpdoj/tests/` (repo root) | **207 pass / 0 fail / 0 skipped / 0 todo** (was 200) |
| bundlegate | `node tools/bundlegate.mjs --assets assets --dump rip/pix-demo --tsv tools/oracle/out/w6/demo.tsv` | **PASS 15955968/15955968 = 100.0000 %** over 159 frames |
| demogate | `node tools/demogate.mjs --rom rip/rom --web rip/web --dump rip/pix-demo --tsv tools/oracle/out/w6/demo.tsv` | **PASS 15955968/15955968 = 100.0000 %** over 159 frames |
| webgate | `node tools/webgate.mjs` | **PASS**, 14 files over HTTP in 439 ms, one frame 100352 px / 98.8 % non-black |
| leak guard | `node tools/build-dist.mjs` (repo root) | **clean**, 188 files checked (19 also decompressed) vs 12 ROMs, **1 deliberate exception** (Batman player tiles); `dist/` 192 files, 3359 KB |
| bgstrip | `python tools/bgstrip.py 0 224 --check` | **PASS 2064384/2064384 = 100.0000 %**, bundle vs CARTRIDGE, all 224 columns |

`demogate` needs `--rom` and it is not optional; PART ONE's §7 did not say so
and the first invocation died on it. The working line is in the table above.

**The pixel gates were 100.0000 % before this wave and they still are.** The
19 bodies build-dist inflates and re-checks now include the eight new
`bg.shard*.tiles.u8.gz`; the guard was not weakened to accommodate them and did
not need to be.

`webgate` fetches **14** files, which is the boot set and nothing else — shards
0 and 1 appear in its list and shards 2..7 do not. That is the deferred split
visible from outside the loader.

## 11. THE BREAK TABLE — EVERY SWITCH SEEN RED

`bundlegate --break <b>`, all six, exit 0 = "the break was correctly detected":

| break | exit | what went red |
|---|---|---|
| `drop-tile` | 0 | `AssetError: capture frame 0 (lf2000) uses BG tile 2936 ($b78) at map entry 531, which BG shard 0 is supposed to hold and does not` |
| `drop-stream` | 0 | `AssetError: capture frame 91 (lf2091) record 51 points at packed sprite offset 0, which is not an exported stream base` |
| `zero-col` | 0 | **14280066/15955968 = 89.4967 %** — diverged |
| `blank-tile` | 0 | **15804494/15955968 = 99.0507 %** — diverged |
| `shard-404` | 0 | **NEVER RUN BEFORE.** `AssetError: BG SHARD 2 DID NOT LOAD (assets/gfx/bg.shard2.tiles.u8.gz: HTTP 404 ...)` — and the message names the file, which the gate checks separately |
| `shard-late` | 0 | **NEVER RUN BEFORE.** `BG tile 3261 ($cbd) of shard 2 drew the transparent pen and the shard is named in bg.status().waiting = [2]` |

`bgstrip.py 0 224 --check --break <b>`, the three surviving one-sided switches:

| break | identical | verdict |
|---|---|---|
| (none) | **2064384/2064384 = 100.0000 %** | the bundle IS the cartridge |
| `planes` | 650133/2064384 = **31.4928 %** | red |
| `base` | 193536/2064384 = **9.3750 %**, and **1,819 tiles NOT IN THE BUNDLE** | red |
| `u19` | 101517/2064384 = **4.9175 %** | red |

Note `u19` at **4.9 %** here against wave 3's 52.86 %. Not a contradiction —
wave 3 measured one FRAME, most of which is not the shifted region; this
measures all 224 columns, where nearly every tile index is above 0xC000 and
therefore moves. The 4.9 % is close to what two unrelated pictures share.

### `--break drop-tile` WAS DISTRUSTED, AND THE DISTRUST WAS EARNED

PART ONE §4.6 claims sharding silently disarmed this break and that the fix is
unverified. **Verified, by re-running the OLD victim choice.** `bundlegate.mjs`
was temporarily reverted to `nos[count / 2]` — the pre-wave-14 line — and run:

```
OLD-VICTIM EXPERIMENT: middle slot of the 2026-tile sheet is tile 3743;
                       the capture uses 415 BG tiles and DOES NOT use this one
EXPECTED-RED [--break drop-tile]: BG tile 3743 was removed from the sheet and
                                  NOTHING THREW -- the coverage check is fake
EXIT=1
```

So the claim is true and now measured: **slot 1013 of 2026 is tile $0E9F, and
it is not one of the 415 tiles `verifyCoverage` inspects.** The break removed a
tile nothing looks at. The current victim, tile **2936 ($0B78)**, is measured
from the capture itself and throws.

**ONE CORRECTION TO §4.6, which matters to whoever reads this next.** §4.6 says
the disarmed break "would have gone quietly GREEN". It would not have gone
*quietly*: bundlegate's fall-through prints `NOTHING THREW -- the coverage check
is fake` and **returns exit 1**. The trap is subtler and worse for a human
reader — **both the working and the disarmed outcome print a line beginning
`EXPECTED-RED [--break drop-tile]:`**, and only the exit code and the sentence
after the colon separate them. An operator scanning output for the string
`EXPECTED-RED` sees the same prefix either way. **Check the exit code, not the
prefix.** (The `for` loop in §10's runs prints `EXIT=` after every break for
exactly this reason.)

### restoration

`bundlegate.mjs` was the only file mutated, and it was restored from a copy
taken before the edit: `git diff --quiet HEAD -- tools/bundlegate.mjs` is clean.
The bundle was hashed before and after the whole break session —
`find assets -type f | sort | xargs sha1sum | sha1sum` =
**`49303b089adce7922c88e133d4b1ed34d6014792`** both times. No break writes to
`assets/`; `shard-404` injects its 404 in the READER, not on disk, which is why.

## 12. STILL UNDONE — carried forward from §6, unchanged

Not this agent's job and not fixed:

1. **The 13 BG ELEMENTS are still unported** — 143,102 B gzipped of sprite
   streams that the scroll VM's op `$10` spawns. The background is still
   missing its big objects. `bundlegate`'s unported-call census names the
   driver: `160 x $26233A the 8-slot background-element driver -- W18`.
2. **The second map's painter `$26C20C` (object type `$1C`) is still
   unported.** **Shard 7 ships 205 tiles of pixels and 207 decoded map entries
   that NOTHING DRAWS.** `bg.second.png` is a picture of art the page cannot
   currently show. That is 79.4 KiB of deferred bundle doing nothing yet, by
   design, and it is not a defect — but it is not a feature either until W18.
3. **No browser has opened this page.** There is none on this machine. Every
   claim about the shard schedule holding over a real connection is a
   simulation. `webgate` proves the fetch/assembly path over a real HTTP origin
   and `bundlegate` proves the pixels; neither proves the CADENCE.
4. The palette block is shipped, validated at 1020/1024, and still unused.
5. Column 247 ($227E34) is still accounted for by nothing. 36 bytes.

Items 1 and 2 are the honest headline: **the whole stage-1 background now
scrolls and is pixel-exact, and it is still not the whole picture.**

---

status: **COMPLETE.** Tests 200 -> 207. Six bundlegate breaks and three bgstrip
breaks seen red, including the two that had never been run. Four gates green,
two pixel gates at 100.0000 %. PNGs looked at. Two defective assertions found in
this agent's own tests and fixed.
