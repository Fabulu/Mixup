# Wave 20 recon — the stage-1 layout data and the asset budget to ship it

status: **DONE** on all four questions, with six named gaps in §8.
started: 2026-08-01 · finished: 2026-08-02
role: recon (READER — nothing under `games/ddpdoj/src/`, `games/gradius/` or
`games/batman/` was touched; nothing committed)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER). Every address is
build B unless the line says otherwise (`NOTES-build-split.md`); `$22xxxx` and
`$230C6C`/`$2302E0` are shared DATA, not build-A code.
static image: `games/ddpdoj/tools/oracle/out/maincpu.bin`, 6,291,456 B.

**This file replaces two earlier versions of itself.** The original recon agent
left a header and two working tools (`w20level.py`, `w20consume.py`) and no
findings; a later interim pass ("CLOSED BY THE ARCHITECT") wrote up those two
tools' output. Both tools are re-used here and their numbers reproduced. §7
lists the three claims of that interim pass that this recon **corrects**, the
largest being that its sharing answer was right for the wrong reason and its
stage-1 total was **26 % low**, because two whole components of the stage-1
background were not in it.

New tools this wave, all READERS, all under `games/ddpdoj/tools/oracle/`:

| file | what it is |
|---|---|
| `w20price.py` | the from-ROM tile-decode check (+RED), the CONTENT-HASH sharing test, the per-stage export price, the encoding comparison, the shard price, and the two extra map painters |
| `w20elemart.py` | sizes the 13 stage-1 BG-ELEMENT sprite streams (scroll-VM op `$10`) — the part of the background that is not in the column stream |
| `w20mapgate.py` | VALIDATOR 1 — the static stream vs the board's `bg_videoram` in the 161-frame capture, three mutations |
| `w20maprec.lua` + `w20maprun.py` | VALIDATOR 2 — a write tap on `$900000..$900FFF` logging **every** map longword the board writes for a whole stage-1 run |
| `w20mapgate2.py` | judges that run against the static stream, three mutations |

One two-line, behaviour-free addition to a sibling's tool: `scrollmap.py` grew a
`TRACE` list (default `None`, appended at its column write) so §4d's streaming
schedule comes out of the *already validated* simulation instead of a second
copy of it.

---

## 0. THE ANSWERS, AS NUMBERS

```
WHERE   stage 1 = stage INDEX 0.
        column stream    $225B78..$227AF7   8,064 B   224 columns  base $0AA9
        SECOND MAP       $227AF8..$227E33     828 B    23 columns  base $32A9
        one spare column $227E34..$227E57      36 B
        palette block    $227E58..$228657   2,048 B   32 banks x 32 xRGB555
        scroll program   $26157A/$261602/$261610/$26179A        678 B
        13 BG elements   sprite streams in b/a-ROMs       260,498 B raw

FORMAT  a column is 9 longwords (tile:u16, attr:u16), 36 B; $240D86 ADDS the
        per-stage base $0AA90000 to the whole longword.  attr bits 5..1 = BG
        palette bank; bits 7..6 (flip) are ZERO in all 8,142 map entries of all
        five stages.

WEIGHT  whole stage 1, encoded exactly as export-web.mjs encodes today
        (tiles DECODED to one byte per pixel, gzip -9):

           1,820 BG tiles                          661,802 B
           map, 2,232 entries                        3,544 B
           tile-number side table                    2,951 B
           palette                                     903 B
           the SECOND MAP: 205 tiles + 207 entries   82,823 B
           13 BG elements (mask + colour)           143,102 B
           scroll program (678 B, uncompressed)         678 B
           ---------------------------------------------------
           TOTAL                                   895,803 B = 874.8 KiB

        The published bundle is 417,734 B (407.9 KiB) measured on disk.
        Swap the recording for the live stage: 1,048,501 B = 1,023.9 KiB.

SHARD   YES.  8 shards of 32 map columns: 110.5 102.1 66.1 77.8 97.7 76.3
        119.6 0.4 KiB, plus the second map as a 9th (80.9 KiB).  Sharding
        costs +865 B (+0.13 %) over one blob because the shards share almost no
        tiles.  Only shards 0-1 (212.6 KiB) are needed in the first 5 s — LESS
        than the page loads today — and every later shard has >= 4.3 s of lead.

SHARED  NOTHING.  7,634 tile numbers across the five stages hold 7,325 distinct
        PICTURES, and the cross-stage intersections are 0 or 1 tile each:
        THREE duplicate pictures in the whole game.  The marginal cost of
        stage 2 is the full cost of stage 2.  All five stages' backgrounds:
        3,751,865 B = 3.58 MiB gzipped.
```

**And the finding underneath all of them: the DoJ background is not a tilemap,
it is a painted strip.** 88.4 % of stage 1's tiles are used in exactly one map
column; 76.2 % of its columns are nine *consecutive* tile numbers; the top tile
of column *c*+1 is the top tile of column *c* minus 9 for 166 of 247 steps, with
a `+171` jump every tenth column. The art is stored as 10-column × 9-row blocks
of 90 consecutive tiles and the 8-KB "map" is very nearly a generated identity.
Stages 2, 3, 4 and 5 obey that rule for **every single column**. That is why
nothing is shared, why the export scales with scroll distance, and why sharding
on scroll position is exact.

---

## 1. WHERE THE DATA IS

`python w20level.py tables` (the recon's own tool, ACTUAL output):

```
stage  script0  script1   palette   colstream  tilebase   objstream cuestream
  0    $261610  $26179A  $00227E58  $00225B78  $0AA90000  $26157A  $261602
  1    $2618DA  $26199E  $00229DF8  $00228658  $12A90000  $261824  $2618C4
  2    $261A62  $261B36  $0022A9E8  $0022A5F8  $1AA90000  $2619B8  $261A4C
  3    $261C0E  $261CE6  $0022CF70  $0022B1E8  $1EA90000  $261B70  $261BF8
  4    $261DA8  $261EDC  $0022FAE0  $0022D770  $26A90000  $261D18  $261D92
```

`python w20level.py columns`:

```
stage  start     end       bytes  cols  %36  base   distinct  min    max    attr-distinct
  0   $225B78  $227E58    8928   248   0   $0AA9     1820  $0AA9 $11C6  24
  1   $228658  $229DF8    6048   168   0   $12A9     1404  $12AA $1891  16
  2   $22A5F8  $22A9E8    1008    28   0   $1AA9      252  $1AAA $1BA5  1
  3   $22B1E8  $22CF70    7560   210   0   $1EA9     1890  $1EAA $260B  12
  4   $22D770  $22FAE0    9072   252   0   $26A9     2268  $26AA $2F85  31
TOTAL bytes=32616 cols=906 distinct-union=7634
```

### 1a. The stream's end bound, measured rather than assumed

`scrollmap.py sim 0` prints `stream is 304 cols`, because **that one line alone**
bounds the stream by the *next stage's* column stream (`$228658`) and so runs
straight through the palette block. `scrollmap.py tables` and `w20level.py
columns` both bound it correctly at the stage's own palette. The correct number
is **248**, and here is the measurement rather than the argument:

```
last map cols  $227D00: 91/128 longwords look like (tile,attr) map entries
claimed pal    $227E58: 12/128 longwords look like (tile,attr) map entries
pal+0x400      $228258: 24/128 longwords look like (tile,attr) map entries
next stream    $228658: 128/128 longwords look like (tile,attr) map entries

first 16 words at $227E58 : 77B8 77B4 77B0 6B97 7791 774F 6755 772F 730E ...
first 16 words at $228658 : 0052 0000 0053 0000 0054 0000 0055 0000 0056 ...
words in $227E58..$228657 with bit15 set: 0 of 1024 (xRGB555 -> expect 0)
```

1,024 xRGB555 entries with **zero** words having bit 15 set, and `$228658`
resuming perfect (tile, attr) structure. 248 columns; 2,048 B of palette =
**32 banks × 32 colours**, exactly what the renderer's
`colour = (attr & 0x3e) >> 1` indexes into `$400 + colour*32`.

### 1b. The record and the attribute word

Column record = 9 longwords = 36 B (`$26135A`'s `dbra D6`, `D6 = 8`);
`$240D86` adds the per-stage base to the **whole longword** before the store, so
the tile number in `bg_videoram` is `streamHigh + $0AA9` and the attribute is the
stream's low word unchanged.

```
stage 0: 24 distinct attrs, entries with flip bits(0xC0)=0, any bit outside 0x3E=0
   palette banks used: [0..23]
stage 1: 16 distinct attrs, flip=0, outside=0    banks [0..14, 16]
stage 2:  1 distinct attr,  flip=0               banks [0]
stage 3: 12 distinct attrs, flip=0               banks [0..11]
stage 4: 31 distinct attrs, flip=0               banks [0..30]
```

**No BG map entry in the entire game sets a flip bit**, and none sets a bit
outside `$3E`. The attribute is a pure 5-bit palette-bank select. A port can
carry the map as `(u16 tile, u8 bank)` and lose nothing.

---

## 2. THE FORMAT FINDING — a painted strip, not a tile set

```
stage 0: 2232 entries, 1820 distinct, reuse 1.23x
   entries where tile == base + streamIndex : 0 of 2232 (0.0 %)
   tile column-span: median 0  mean 25.7  max 234  span==0: 1608 (88.4 %)
   tiles used in >1 column: 212
   first 9 tiles of col 0: 0AFB 0AFC 0AFD 0AFE 0AFF 0B00 0B01 0B02 0B03
   first 9 tiles of col 1: 0AF2 0AF3 0AF4 0AF5 0AF6 0AF7 0AF8 0AF9 0AFA
stage 1: 1512 entries, 1404 distinct, reuse 1.08x   span==0: 92.3 %
stage 2:  252 entries,  252 distinct, reuse 1.00x   span==0: 100 %
stage 3: 1890 entries, 1890 distinct, reuse 1.00x   span==0: 100 %
stage 4: 2268 entries, 2268 distinct, reuse 1.00x   span==0: 100 %

stage 0: 248 columns, 189 are 9 CONSECUTIVE tile numbers (76.2 %)
   col-to-col delta of the top tile: [(-9,166), (0,29), (171,12), (-4,8), (-6,4), (773,3)]
   top-tile offsets, first 20: [82,73,64,55,46,37,28,19,10,1, 172,163,154,145,136,...]
stage 1: 168 of 168 CONSECUTIVE (100 %)   deltas [-9 x150, 171 x13, 153 x2, ...]
stage 2:  28 of  28 (100 %)               stage 3: 210 of 210 (100 %)
stage 4: 252 of 252 (100 %)               deltas [-9 x226, 171 x24, 99 x1]
```

Ten columns descend `82, 73, …, 1` — covering tile offsets 1..90 — then `+171`
starts the next block at 172 covering 91..180. The tile ROM holds each stage as
a sequence of **90-tile blocks, 10 map columns each, columns stored
back-to-front**. Stage 1 (index 0) is the only stage with hand edits: 59 of its
248 columns break the run, 212 tiles appear in more than one column, and the 29
`delta == 0` steps are literal repeated columns.

Three consequences that matter more than the observation:

1. **Tile data is proportional to scroll distance**, not to level complexity.
   1,820 tiles is a 288 px × ~6,500 px painting.
2. **There is no tile set to share** — not with another stage, barely with
   itself.
3. **Sharding on scroll position is exact**, because tile number is very nearly
   a linear function of map column. §4d.

---

## 3. VALIDATOR 1 — the static stream vs the board's map RAM (the capture)

`w20mapgate.py` takes the MEASURED `bg_videoram` out of the wave-6 board capture
(161 frames of `fly-around`, stage 1, `rip/web/capture.bin`) and requires every
one of the 64 hardware ring columns, in every frame, to equal longword for
longword some column of the statically decoded stream **with `$0AA90000` added**.

```
$ python games/ddpdoj/tools/oracle/w20mapgate.py
stage 1 static stream: 248 columns, 248 distinct column patterns (so 0 columns are byte-identical repeats)
frames 161  ring columns tested 10304
  MATCHED   10304
  UNMATCHED 0
  all-zero  0
  distinct STREAM columns the capture's ring proves: 46 of 248
```

Red-validated by mutation (`03-checks-that-can-fail.md`):

| break | what it changes | result |
|---|---|---|
| — | baseline | **10,304 matched / 0 unmatched** |
| 1 | drop the `$0AA90000` tile base | 0 matched / 10,304 unmatched |
| 2 | swap the tile and attr halves | 0 matched / 10,304 unmatched |
| 3 | read the ring column-major, not row-major | 0 matched / 5,796 unmatched |

## 3b. VALIDATOR 2 — the WHOLE stage, and it found something

`w20maprec.lua` taps **every write to `$900000..$900FFF`** for an entire
invulnerable stage-1 run and logs the map longword with its logic frame and
`$8130CE`. Machine pin as every other ddpdoj measurement (`pgm.run`:
`-noreadconfig -nowriteconfig -cfg_directory <scratch>/cfg -nonvram_save`),
build-B boot prefix from `scenarios.json`, `$810424` held at `$FF` from lf1990
(the value the game itself writes at `$2495A2`), auto-shot from lf1800, credit
fed every 600 frames.

```
$ python games/ddpdoj/tools/oracle/w20maprun.py 11000 --tag whole
bg-map longword writes: 207050  rows kept 207050  tapErrors 0
WRITER PCs 21 distinct  26C24A:186300 240D9A:10314 13C9AE:4096 23C642:4096 25BB98:196 000E76:128 ...
final $8130CE=0344  $813096(stage)=0000  $8130D2=0000  $81318A=003D
DONE logicframes=11000
```

`$8130CE` finished at **`$0344`** — the run reached the stage-1 boss lock, i.e.
the end of the scroll program (`20-recon-scroll-engine.md` §5).

```
$ python games/ddpdoj/tools/oracle/w20mapgate2.py out/w20map-whole.tsv
w20map-whole.tsv: 207050 16-bit writes to $900000..$900FFF, max lf 10996, max $8130CE $0344
  static model: 248 columns of 36 B, tile base $0AA9
  all-zero longwords (the $23C668 clear)  : 2880
  map entries matching NO static entry    : 93248
  complete 9-row ring columns MATCHED     : 573
  complete 9-row ring columns UNMATCHED   : 0
  STATIC STREAM COLUMNS PROVEN            : 224 of 248 (90.3 %)
  never written by this run               : 24 columns, runs [(224, 247)]
```

**573 complete ring columns, 0 unmatched, and the 224 columns proven are exactly
0..223** — a measured confirmation of `w20consume.py`'s listing-derived claim
that the script reaches columns 0..223 and never the tail. Mutations:

| break | matched columns | stream columns proven |
|---|---|---|
| — baseline | **573** | **224 of 248** |
| 1 drop the tile base | 0 | 0 |
| 2 read the stream with a 32-byte column record | 57 | 28 of 279 |
| 3 swap tile/attr | 0 | 0 |

(Break 2 is a partial red on purpose: `lcm(32,36)` realigns every ninth column,
so a wrong stride still lands on 10 % of the stream. 573 → 57 is still red.)

### And the 93,248 unexplained writes — the SECOND MAP

Those writes come from `$26C24A`, not from the ring writer `$240D9A`, and carry
tile numbers `$32A9..$370B`, above every stage bank. Disassembled:

```
26c20c: cmpi.w #$105,$8130CE ; bne $26c220 ; jmp $263762
26c220: lea $227AF8,A1              <- INSIDE stage 1's own column-stream region
26c226: lea $9000BC,A0              <- ring column 47
26c22c: tst.w $803926 ; beq -> A0 = $9000A4      (ring column 41)
26c23c: moveq #$16,D6               <- 23 columns
26c23e: A2 = A0 ; moveq #$8,D7      <- 9 rows
26c242: D4 = (A1)+ ; addi.l #$32A90000,D4
26c24a: (A2) = D4 ; A2 += $100      <- +$100 = the next ROW
26c250: dbra D7
26c254: A0 += 4 ; A0 = A0 & $FF     <- next column, wrapping mod 64
26c260: dbra D6
```

`$227AF8` is **stream column 224** (`($227AF8-$225B78)/36 = 224.0`) and the block
runs to `$227E33` = column 246. Decoding those 23 columns × 9 rows with base
`$32A9` and re-checking the measurement:

```
$227AF8 decoded as 23x9: 207 entries, 205 distinct tiles $32A9..$3381
measured writes NOT in the stage-1 stream: explained by $227AF8/base $32A9: 93150,
                                           still unexplained: 98
```

**93,150 of 93,248, exactly.** So `20-recon-scroll-engine.md` §9.3's "24 of
stage 1's 248 map columns are unreachable — do not delete them on my say-so"
resolves: **23 of the 24 are a second map with a different tile base, painted in
one shot by a different routine.** The instinct not to delete them was right.

The painter is a normal enemy-type handler: `census.py`'s type table gives
**type `$1C`, table entry `$267904`, init `$26C1C2`, handler `$26C20C`**. It is
in **no stage's spawn script** (checked all five, 2,237 records) — see §8.5.

The remaining 98 writes are `$25BB98`, at lf1014 (before the stage), base
`$36A9`: `$25BB6C` paints **14 columns × 7 rows from `$2302E0` = exactly one
448×224 screen** into ring column 0 — the pre-stage page. A byte scan of the
whole image for `addi.l #$xxA90000,Dn` finds exactly four sites, two per build:

```
$15AF3E  addi.l #$36A90000,D4      build A
$16B2A6  addi.l #$32A90000,D4      build A
$25BB92  addi.l #$36A90000,D4      build B
$26C244  addi.l #$32A90000,D4      build B
```

so **there are exactly two extra BG-map bases in each build and I have both.**

---

## 4. THE PRICE, AND THE SHARDING DECISION

### 4a. What a whole stage weighs

`python w20price.py price` — the encoding is the one `export-web.mjs` already
ships: BG tiles DECODED to one byte per pixel (1,024 B/tile), tile numbers as
u16, everything gzip level 9.

```
stage  tiles   sheet raw    sheet gz    map raw  map gz  tileno gz  pal gz   TOTAL gz   KiB
  0    1820   1,863,680     661,802     8,928   3,544     2,951     903    669,200    653.5
  1    1404   1,437,696     561,582     6,048   2,268     2,260     989    567,099    553.8
  2     252     258,048     101,240     1,008     399       384      86    102,109     99.7
  3    1890   1,935,360     676,378     7,560   2,867     3,079     540    682,864    666.9
  4    2268   2,322,432     863,818     9,072   3,860     3,740   1,110    872,528    852.1
  ALL 5 STAGES                                                              2,893,800   2826.0

  stage 0:  363.6 gz bytes per tile (35.5 % of raw)
```

(`w20level.py budget` reports the same tile figures and a slightly larger map
figure — 3,764 vs 3,544 — because it packs the map big-endian and this packs it
little-endian. Both are honest; the port will pick one.)

The **second map** (§3b), which no earlier pass counted:

```
$ python w20price.py extra
second map  type $1C  $26C220
  stream $227AF8..$227E33 = 828 B, 23x9 = 207 entries, 205 distinct tiles $32A9..$3381
  tiles raw 209,920  gz 82,451   map gz 372
    content shared with stage 0: 3   stage 1: 1   stage 2: 0   stage 3: 1   stage 4: 1
pre-stage screen  $25BB6C
  stream $2302E0..$230467 = 392 B, 14x7 = 98 entries, 98 distinct tiles $36AA..$370B
  tiles raw 100,352  gz 30,400   map gz 167
    content shared with stage 0..4: 0 0 0 0 0
```

And the **13 BG elements** — the big background objects the scroll VM's op `$10`
spawns, which are sprite streams, not map columns:

```
$ python games/ddpdoj/tools/oracle/w20elemart.py 0
  id  handler   offs(sprmask word)  size    wide high   px       maskwords  colwords   bytes
   0  $2623A4  $022CBCC          $24D0    18  208  288x208     3746     14862    37216
   1  $2623FC  $022DA70          $1470    10  112  160x112     1122      3336     8916
   2  $26244A  $022DED4          $1690    11  144  176x144     1586      4653    12478
   3  $26249C  $022E508          $26A8    19  168  304x168     3194      9502    25392
   4  $2624EE  $022F184          $26B0    19  176  304x176     3346     10398    27488
   5  $26253C  $022FE98          $2860    20   96  320x96      1922      7319    18482
   6  $26258A  $023061C          $28C0    20  192  320x192     3842     15079    37842
   7  $2625D8  $0231520          $2660    19   96  304x96      1826      6424    16500
   8  $262626  $0231C44          $2A70    21  112  336x112     2354      9744    24196
   9  $262674  $0232578          $2A70    21  112  336x112     2354      9995    24698
  10  $2626C2  $0232EAC          $1E80    15  128  240x128     1922      3656    11156
  11  $262710  $0233630          $2090    16  144  256x144     2306      4194    13000
  12  $26275E  $0233F34          $0A50     5   80   80x80       402      1165     3134
  TOTAL mask 29922 words in 13 coalesced blocks (29922 words), colour 100327 words in 1 blocks
  raw 260,498 B   gzip-9 143,102 B
```

Each handler's `($10,A6) = #<long>` is a **sprmask word offset** and its
`($14,A6) = #<word>` is the same packed extent word `export-web.mjs` already
models for the ship (`wide = bits 14..9`, `high = bits 8..0`). Two checks that
this reading is right and not a coincidence: the thirteen mask blocks are
**contiguous with two-word gaps** — id 0 at `$22CBCC` + 3,746 words lands at
`$22DA6E` and id 1 begins at `$22DA70`, all thirteen in a row — and their
thirteen colour blocks **coalesce into exactly one** run of 100,327 words. A
wrong `wide`/`high` split makes neither true.

**Whole stage 1: 895,803 B = 874.8 KiB gzipped.**

### 4b. What that does to the published bundle

`games/ddpdoj/assets/` as measured on disk (407.9 KiB; the 363.2 KiB in
`07-impl-publish.md` grew by wave 12's 17-frame ship harvest):

```
158569  gfx/bg.tiles.u8.gz        95623  player.tables.json
 67630  capture.bin.gz            38202  capture.json
 34566  spr/col.u16.gz             7077  manifest.json
  6878  seed.bin.gz                5708  spr/mask.u16.gz
  2549  gfx/tx.tiles.u8.gz          635  gfx/bg.tileno.u16.gz
   297  gfx/tx.tileno.u16.gz
417734 TOTAL = 407.9 KiB
```

Playing the level instead of replaying it deletes the recording and replaces the
415-tile sheet it was harvested from:

```
  417,734  today
  -67,630  capture.bin.gz          the recording
  -38,202  capture.json            the recording's per-frame metadata
 -158,569  gfx/bg.tiles.u8.gz      415 tiles, harvested from the recording
     -635  gfx/bg.tileno.u16.gz
 +661,802  1,820 BG tiles, the whole stage
   +2,951  tile numbers
   +3,544  the 2,232-entry map
     +903  the 2,048 B palette block
  +82,451  the second map's 205 tiles
     +372  the second map
 +143,102  the 13 BG elements
     +678  the scroll program, uncompressed
 ---------
1,048,501  =  1,023.9 KiB
```

**NOT in that figure, named so nobody adds it silently:** every sprite the live
stage draws that the 161-frame recording never contained. `spr/*.gz` is 40,274 B
today for 150 streams plus the ship's 17 bank frames; a stage-1 run reaches 15
firing enemy types and a boss (`20-recon-enemy-census.md`,
`20-recon-pattern-tables.md` §7). §8.1.

### 4c. Encoding levers, measured before the shard argument

```
stage  form                       raw        gzip-9     brotli-11
  0   decoded 1 B/px          1,863,680    656,958      563,420   (br/gz 85.8 %)
  0   packed 5bpp (ROM)       1,164,800    792,954      674,529
  0   planar 5x1bpp           1,164,800    815,177          —
  3   decoded 1 B/px          1,935,360    670,531      405,373   (br/gz 60.5 %)
  4   decoded 1 B/px          2,322,432    855,266      714,455
```

(gzip differs ~0.7 % between python `zlib` and node `zlib`; §4a's table is
python's, this one is node's, both quoted as measured.)

* **Shipping the ROM's own packed 5bpp is WORSE by 21 %** — 792,954 vs 656,958.
  Decoding to a byte per pixel costs 60 % more raw and gzip more than wins it
  back: a byte-aligned stream is compressible, a 5-bit bitstream is not.
  `export-web.mjs`'s existing choice is right and should not be "optimised".
* **Planar is worse still.**
* **Brotli is worth 14 % on stage 1 and 40 % on stage 3** — but
  `DecompressionStream` has no brotli, so that is a server-side
  `Content-Encoding` lever, not a file-format one. Noted, not assumed.

### 4d. THE SHARD DECISION — shard it, and here are the boundaries

`python w20price.py shard 0 32`:

```
shard  cols        tiles  new-tiles  sheet gz  map gz  TOTAL gz    KiB
   0     0.. 31    288        288   112,730     469   113,199   110.5
   1    32.. 63    275        275   104,051     507   104,558   102.1
   2    64.. 95    175        174    67,324     389    67,713    66.1
   3    96..127    221        219    79,164     484    79,648    77.8
   4   128..159    288        288    99,540     555   100,095    97.7
   5   160..191    288        288    77,678     474    78,152    76.3
   6   192..223    288        288   122,010     453   122,463   119.6
   7   224..247    210          0         0     383       383     0.4
  TOTAL over 8 shards: 666,211 B = 650.6 KiB
```

**The shards are disjoint.** Six of the eight introduce every tile they use as a
new tile; two introduce all but one or two. Sharding costs **865 bytes** over
the single-blob 665,346 B — **0.13 %** — which is what §2 predicted: the map is
a strip, so a scroll range *is* a tile range. (Shard 7 shows 0 new tiles because
those columns are the second map read with the wrong base; its real cost is the
80.9 KiB in §4a.)

The schedule, from the validated simulation (`scrollmap.cmd_sim(0)` with the
`TRACE` hook) — the first logic frame at which each shard's first column is
written:

```
shard  cols       needed at            gap to the previous shard
  0     0.. 31   frame     55 =   0.9 s
  1    32.. 63   frame    298 =   5.0 s    +243 frames =  4.0 s
  2    64.. 95   frame   1525 =  25.4 s   +1227 frames = 20.4 s
  3    96..127   frame   4037 =  67.3 s   +2512 frames = 41.9 s
  4   128..159   frame   6085 = 101.4 s   +2048 frames = 34.1 s
  5   160..191   frame   6811 = 113.5 s    +726 frames = 12.1 s
  6   192..223   frame   7067 = 117.8 s    +256 frames =  4.3 s
```

**The recommendation, and it is not "sharding is premature":**

* **Boot bundle = shards 0 and 1 (212.6 KiB) + map + palette + tile numbers +
  scroll program (7,398 B).** That is *less* than the 363–408 KiB the page loads
  today, so the first frame arrives sooner than it does now.
* **Prefetch shards 2..6 from boot.** The tightest deadline in the whole stage is
  shard 6: 119.6 KiB with 4.3 s of lead = **228 kbit/s**. Every other shard has
  12–42 s. A prefetch that simply queues all of them at boot has 25 s to move
  441 KiB.
* **The second map (80.9 KiB) is its own shard**, first painted at lf≈3000
  ≈ sim frame 1380 ≈ 23 s in. Ample lead.
* **The 13 BG elements (143.1 KiB) ship as one blob.** They are *events*, not
  scroll range — the first fires at frame 694 and the last at 5,654 — and 11 s
  of lead on 140 KiB does not justify a second scheduler.
* **32 columns is a choice, not a boundary the data forces.** The data's own
  boundary is the 90-tile / 10-column block (§2), which would give 25 shards of
  ~26 KiB. 32 stays disjoint (measured above) and is big enough that per-request
  overhead does not matter. If the deployment prefers uniform shard *weight*
  rather than uniform column count, shard 6 (119.6 KiB) and shard 2 (66.1 KiB)
  are the two to split and merge.

---

## 5. WHAT IS SHARED BETWEEN STAGES — nothing, and here is the right proof

Tile NUMBERS *cannot* collide: `$240D62` gives each stage its own base and the
five ranges are disjoint by construction. **An empty intersection of tile
numbers therefore proves nothing about sharing** — it is a restatement of the
table. The question can only be answered on CONTENT. `w20price.py share` hashes
each tile's 1,024 decoded bytes:

```
CONTENT HASHES -- two tile NUMBERS with the same 1024 decoded bytes are
the same picture, wherever they sit in the ROM.

               0        1        2        3        4   distinct-content
  0       1818        1        0        1        1     1818 of  1820 numbers
  1          1     1274        0        1        1     1274 of  1404 numbers
  2          0        0      252        0        0      252 of   252 numbers
  3          1        1        0     1806        1     1806 of  1890 numbers
  4          1        1        0        1     2178     2178 of  2268 numbers

  union by NUMBER  : 7634
  union by CONTENT : 7325
  sum of per-stage content sets: 7328
  => cross-stage duplicate pictures: 3
  the all-zero (index 0) tile appears in stages: []

CONTIGUITY of each stage's tile-number range (are these tile BANKS?)
  stage 0: $0AA9..$11C6 span  1822, used  1820, holes    2 (99.9 % of the span used)
  stage 1: $12AA..$1891 span  1512, used  1404, holes  108 (92.9 %)
  stage 2: $1AAA..$1BA5 span   252, used   252, holes    0 (100.0 %)
  stage 3: $1EAA..$260B span  1890, used  1890, holes    0 (100.0 %)
  stage 4: $26AA..$2F85 span  2268, used  2268, holes    0 (100.0 %)

GAPS BETWEEN CONSECUTIVE STAGE RANGES
  stage0 ends $11C6 -> stage1 starts $12AA   gap 227
  stage1 ends $1891 -> stage2 starts $1AAA   gap 536
  stage2 ends $1BA5 -> stage3 starts $1EAA   gap 772
  stage3 ends $260B -> stage4 starts $26AA   gap 158
```

**Three duplicate pictures in 7,328.** Every off-diagonal cell is 0 or 1. The
309-tile difference between the number union (7,634) and the content union
(7,325) is **intra-stage**: stage 2 has 1,404 numbers for 1,274 pictures,
stage 4 has 1,890 for 1,806, stage 5 has 2,268 for 2,178 — the artists painted
the same cell twice inside one strip. Stage 1 has 1,820 numbers for 1,818
pictures; deduplicating it saves **two tiles**.

The second map's `$32A9` bank shares 3, 1, 0, 1, 1 pictures with the five
stages; the pre-stage screen's `$36A9` bank shares **nothing with anything**.

**What this changes about the plan.** The marginal cost of a later stage is its
full cost. There is no "load the tile set once" saving to design for:

| | tiles+map+palette gz | BG elements gz | stage total |
|---|---|---|---|
| stage 1 | 669,200 | 143,102 | **812,302 B** (+82,823 second map = **895,803 B = 874.8 KiB**) |
| stage 2 | 567,099 | 66,308 | 633,407 B = 618.6 KiB |
| stage 3 | 102,109 | 506,655 | 608,764 B = 594.5 KiB |
| stage 4 | 682,864 | 81,633 | 764,497 B = 746.6 KiB |
| stage 5 | 872,528 | 60,367 | 932,895 B = 911.0 KiB |
| **all five** | 2,893,800 | 858,065 | **3,751,865 B = 3.58 MiB** |

(Stages 2–5 have not been checked for second maps of their own; §8.4. The
`addi.l #$xxA90000` scan says there is no *third* base, but a per-stage painter
could reuse `$32A9`.)

Stage 3 (index 2) is the outlier and it is not an error: 28 map columns of
scenery and **fourteen** BG elements totalling 804 KiB raw — the arena stage
`20-recon-scroll-engine.md` §8c found locking after 14 seconds. Its background
is built out of big objects rather than a long strip.

The whole game's backgrounds are **3.58 MiB gzipped** — a per-stage download,
not a boot download, and §4d's shard machinery is the same machinery for it.

---

## 6. THE TILE DECODE, CHECKED AGAINST THE ROM

Every byte figure above rests on `rip/assets/bg.tiles.bin` being a correct
decode. `w20price.py verify` re-assembles the `igs023` region from the ROM files
(with `cave_t04401w064.u19` at **`0x180000`**, `00-recon-assets.md` §1) and
re-decodes 100 tiles — the ten range endpoints of the five stages plus 90 at
random — straight out of the bitstream:

```
$ python games/ddpdoj/tools/oracle/w20price.py verify
rip/assets/bg.tiles.bin = 16777216 B = 16384 tiles
igs023 region assembled  = 10485760 B
  100 tiles re-decoded from the ROM: 100 match, 0 differ
  RED (5-bit plane order reversed): 15 match, 85 differ
```

---

## 7. WHAT I RULED OUT — including three claims of the earlier pass

1. **"Every pairwise tile-set intersection between stages is ZERO, therefore
   nothing is shared."** (interim pass §2.) The conclusion is right; **the proof
   was not** — disjoint tile *numbers* are a restatement of `$240D62`'s
   per-stage bases and are compatible with every stage using identical art. The
   content-hash test in §5 is the proof, and it gives a different number:
   3 shared pictures, not 0.
2. **"Stage 1's complete background is ~666 KB gzipped."** (interim pass §3.)
   That is tiles + map + palette only. It omits the 13 BG elements (143,102 B)
   and the second map (82,823 B). The measured figure is **895,803 B**, 34 %
   higher.
3. **"sum-of-parts gz = 2,864,820 vs union gz = 2,864,447 — sharding per stage
   costs nothing."** True, but that comparison cannot detect sharing: gzip's
   union figure would be smaller than sum-of-parts if tiles were shared, and it
   is not, which is a *consequence* of §5 rather than evidence for it. The
   sharding cost that matters is the intra-stage one, measured in §4d: +865 B.
4. **"Ship the ROM's own packed 5bpp and decode in the browser."** 21 % BIGGER
   after gzip. §4c.
5. **"Planar bitplanes compress better."** They do not: 815,177 vs 656,958.
6. **"The map is a tilemap with a reusable tile set."** 88.4 % of stage 1's
   tiles are used in exactly one column; three of five stages have reuse
   factor 1.00. §2.
7. **"BG map entries use the flip bits."** Zero flip bits in all 8,142 entries
   of all five stages. §1b.
8. **"Stage 1's column stream is 304 columns."** It is 248; the extra 56 are the
   palette block. §1a.
9. **"Deduplicating stage 1's tiles is worth doing."** Two tiles. §5.
10. **"The 24 unreachable tail columns are dead weight."** 23 of them are the
    second map (§3b). Deleting them would have removed a whole background
    structure and 205 tiles.

## 8. WHAT I COULD NOT DO

1. **Price the sprite art a live stage 1 needs.** §4b's 1,024 KiB covers the
   BACKGROUND. Enemy, boss, explosion and pickup streams are not in it. The
   method is proven — §4a did exactly this for the 13 background elements from
   `($10,A6)`/`($14,A6)` — but the enemy side needs the per-type
   `($a,A6)`/`($e,A6)` pairs across `20-recon-enemy-census.md`'s 111 handlers,
   which is a wave, not a paragraph.
2. **The last 24 columns are 23 + 1.** Column 247 (`$227E34..$227E57`, 36 B) is
   accounted for by neither the scroll VM nor the `$26C220` painter, and no run
   ever wrote it. It is 36 bytes and I did not chase it.
3. **Follow the BG elements past their constructors.** `w20elemart.py` sizes the
   stream each element names and shows the sizes are self-consistent (contiguous
   mask blocks, one coalesced colour block). It does NOT model the per-frame
   updater, `$80B03C` (the scroll compensation whose writer
   `20-recon-scroll-engine.md` §9.6 could not find) or `$8130DA` (the gate at
   `$2623C2`). A port that ships the pixels still has to place them.
4. **Check stages 2–5 for second maps of their own.** The `addi.l #$xxA90000`
   scan proves there is no *third* tile base in either build, but a per-stage
   painter reusing `$32A9`, or a painter that adds its base some other way
   (a table read, a register), would not appear in that scan. The five figures
   in §5's table are therefore **lower bounds** for stages 2–5. Only stage 1 has
   been measured end to end.
5. **Find what spawns type `$1C`.** It is in none of the five stage scripts
   (all 2,237 records checked). The scroll VM's own SPAWN op reads a 22-entry
   object stream at `$26157A` whose eleventh entry is `$224338` with param
   `$001C` — suggestive, but the params of the other entries do not look like
   type numbers and the pointers themselves (`$2238B8`, `$224338`, …) dump as
   colour data, not object records. `$24150A`'s record format is still unopened
   (`20-recon-scroll-engine.md` §9.5). **Named, not resolved.**
6. **Loop 2, and stages 2–5 dynamically.** Every dynamic number here is loop 1,
   stage 1. `$813092` (loop) and `$813096` (stage) read 0 throughout the run.
   The scroll program is indexed by `$813096` alone, so I have no reason to
   expect different layout data on loop 2 — but "no reason to expect" is not a
   measurement.
7. **The inter-bank tile gaps** (227, 536, 772, 158 tile numbers between the five
   stage ranges, 1,693 tiles = 1.06 MB packed) are referenced by no stage's
   column stream. Title screens, endings, a sixth map, or padding — I did not
   look for their readers.
8. **The TX layer beyond the bundle's current 159 tiles.** It is the HUD and the
   PGM BIOS font, it does not scroll with the stage, and I did not price a full
   run of it.

## 9. IF SOMEONE PICKS THIS UP COLD

```
python games/ddpdoj/tools/oracle/w20level.py  tables       the five per-stage tables
python games/ddpdoj/tools/oracle/w20level.py  columns      sizes, tile counts
python games/ddpdoj/tools/oracle/w20consume.py 0           which columns the script reaches
python games/ddpdoj/tools/oracle/w20price.py  verify       the from-ROM decode check (+RED)
python games/ddpdoj/tools/oracle/w20price.py  share        the cross-stage CONTENT test
python games/ddpdoj/tools/oracle/w20price.py  price        the per-stage export weight
python games/ddpdoj/tools/oracle/w20price.py  extra        the two extra map painters
python games/ddpdoj/tools/oracle/w20price.py  encodings    decoded vs packed vs planar
python games/ddpdoj/tools/oracle/w20price.py  shard 0 32   the eight shards
python games/ddpdoj/tools/oracle/w20elemart.py 0           the 13 BG elements, sized
python games/ddpdoj/tools/oracle/w20mapgate.py             VALIDATOR 1 (--break 1|2|3)
python games/ddpdoj/tools/oracle/w20maprun.py 11000 --tag whole      VALIDATOR 2, measure
python games/ddpdoj/tools/oracle/w20mapgate2.py out/w20map-whole.tsv (--break 1|2|3)
python games/ddpdoj/tools/oracle/xref.py dasm 26C20C 90    the SECOND map painter
python games/ddpdoj/tools/oracle/xref.py dasm 25BB6C 80    the pre-stage screen painter
```

Six things that will save the hours they cost me:

1. **The background is a painting, not a tile set.** Every instinct about tile
   reuse, shared banks and palette-swapped variants is wrong on this game. The
   export budget follows scroll distance directly.
2. **The scroll VM is not the only thing that writes the BG map.** `$26C220`
   (type `$1C`) paints 23×9 columns with its own tile base every frame it lives,
   and `$25BB6C` paints a whole screen before the stage. A port that implements
   only the column stream renders a hole where a background structure should be.
3. **MAME splits `move.l` into TWO 16-bit tap callbacks** — byte offset +0
   carries the tile word, +2 the attribute, both in the low half of `data`. A
   tap reading `(data >> 16)` gets zero for every tile number in the game. This
   cost one full 11,000-frame run.
4. **`scrollmap.py sim`'s "stream is N cols" line over-runs into the palette.**
   Use `tables` or `w20level.py columns`. §1a.
5. **Decoded-and-gzipped beats the cartridge's own packing by 21 %.** Do not
   "save space" by shipping the 5bpp bitstream. §4c.
6. **`cave_t04401w064.u19` loads at `0x180000`.** `rip/assets/bg.tiles.bin` is
   already right — §6 re-decodes 100 tiles from the assembled region and gets
   100/100, and the plane-order mutation gets 15/100.
