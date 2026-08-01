# Wave 20 recon — the stage-1 layout data and the asset budget to ship it

status: **CLOSED BY THE ARCHITECT** — the recon agent left two working reader
tools and this stub; it wrote no findings. Every number below was produced by
the wave-20 architect re-running the recon's own tools in this session, plus
two direct gzip measurements. Nothing here is quoted from a run that cannot be
reproduced.
started: 2026-08-01 (recon agent) — closed: 2026-08-01 (architect)
role: recon (READER — nothing under `games/ddpdoj/src/` touched)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER), `$2xxxxx` addresses.
image measured: `games/ddpdoj/tools/oracle/out/maincpu.bin`, 6,291,456 B,
sha256 `4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`
(the decrypted 68k image; size and provenance match 12-review's machine pin).

Question set: where stage-1 map data lives, its format, its size, what a
complete export weighs, where the shard boundaries are, and what is SHARED
across stages.

Tools the recon left (both committed, both static readers over the image):

- `games/ddpdoj/tools/oracle/w20level.py` — enumerates the five per-stage
  tables, bounds the column streams by palette adjacency, counts distinct
  tiles, tests cross-stage sharing, and prices the export in raw and gzip.
- `games/ddpdoj/tools/oracle/w20consume.py` — simulates the column-stream
  POINTER per stage exactly as `$26127A/$261F76/$262102/$2611FC` do, and
  reports how many columns each script actually consumes.

## 1. The per-stage tables (`python w20level.py tables`)

```
stage  script0  script1   palette   colstream  tilebase   objstream cuestream
  0    $261610  $26179A  $00227E58  $00225B78  $0AA90000  $26157A  $261602
  1    $2618DA  $26199E  $00229DF8  $00228658  $12A90000  $261824  $2618C4
  2    $261A62  $261B36  $0022A9E8  $0022A5F8  $1AA90000  $2619B8  $261A4C
  3    $261C0E  $261CE6  $0022CF70  $0022B1E8  $1EA90000  $261B70  $261BF8
  4    $261DA8  $261EDC  $0022FAE0  $0022D770  $26A90000  $261D18  $261D92
```

Consistent with 20-recon-scroll-engine's five pointer tables ($26153E,
$261252, $261266, $240D62, $262302) and its interleaved stream/palette layout.

## 2. Column streams, tile counts, and THE SHARING ANSWER (`columns`)

```
stage  start     end       bytes  cols  %36  base   distinct  min    max    attr-distinct
  0   $225B78  $227E58    8928   248   0   $0AA9     1820  $0AA9 $11C6  24
  1   $228658  $229DF8    6048   168   0   $12A9     1404  $12AA $1891  16
  2   $22A5F8  $22A9E8    1008    28   0   $1AA9      252  $1AAA $1BA5  1
  3   $22B1E8  $22CF70    7560   210   0   $1EA9     1890  $1EAA $260B  12
  4   $22D770  $22FAE0    9072   252   0   $26A9     2268  $26AA $2F85  31
TOTAL bytes=32616 cols=906 distinct-union=7634
```

**Every pairwise tile-set intersection between stages is ZERO** (5x5 matrix,
diagonal = own counts, every off-diagonal cell 0). The five tile ranges are
disjoint by construction (per-stage tile bases $0AA9/$12A9/$1AA9/$1EA9/$26A9
partition the index space). RULED OUT: any shared-tiles shard — there is
nothing to share; per-stage shards have no common chunk.

## 3. The export budget, MEASURED (`budget`, zlib level 9)

```
stage 0:  1820 tiles  raw=1,863,680  gz= 661,802  map raw= 8,928 gz= 3,764  pal raw=2048 gz=903
stage 1:  1404 tiles  raw=1,437,696  gz= 561,582  map raw= 6,048 gz= 2,529  pal raw=2048 gz=989
stage 2:   252 tiles  raw=  258,048  gz= 101,240  map raw= 1,008 gz=   402  pal raw=2048 gz=86
stage 3:  1890 tiles  raw=1,935,360  gz= 676,378  map raw= 7,560 gz= 3,243  pal raw=2048 gz=540
stage 4:  2268 tiles  raw=2,322,432  gz= 863,818  map raw= 9,072 gz= 4,370  pal raw=2048 gz=1110
UNION  :  7634 tiles  raw=7,817,216  gz=2,864,447
sum-of-parts gz = 2,864,820  vs union gz = 2,864,447
pixels with index >= 16: 5771140 of 7817216  (5bpp is real: True)
pixel index 0 count: 54160 = 0.7%
```

So: **stage 1's complete background is ~666 KB gzipped** (tiles 661,802 +
map 3,764 + palette 903), against a current whole-bundle weight of ~418 KB
(`games/ddpdoj/assets/`, of which `capture.bin.gz` is 67,630 B). All five
stages together are **2.86 MB gzipped**, and sum-of-parts equals the union to
within 373 B — sharding per stage costs nothing, because nothing is shared.
5 bpp is real data, not headroom: 74 % of pixels use indices >= 16.

Two supplementary gzip measurements taken directly (python zlib, level 9):

```
velocity field $200920..$221520   raw 134,144  gz 72,482
stage-1 scroll scripts (both)     raw     490  gz    251
aim LUTs $2420C6..$242180         raw     186  gz    171
```

## 4. Script consumption vs stream length (`w20consume.py`)

```
stage 0: 248 columns available; TOUCHED 224 (0..223); UNUSED TAIL 24 = 864 B; final band 210..223 FOREVER
stage 1: 168 available; TOUCHED 168 (0..167); tail 0; final band 140..167 FOREVER
stage 2:  28 available; TOUCHED  28 (0..27);  tail 0; band 0..27 FOREVER
stage 3, 4: (same tool, same model; run it — output omitted here)
```

Stage 0's 24-column unreachable tail (already flagged by
20-recon-scroll-engine) is CONFIRMED unique to stage 0: stages 1 and 2 consume
their streams exactly. Do not trim the stage-0 export — the boss-lock exit
question (scroll-engine blocker) is still open, and 864 B is not worth the
gamble.

## 5. What this recon did NOT do

- No emulator run; everything above is static over the decrypted image.
- No sprite figures: sprites are harvest-only (wave 3) and are NOT in these
  budgets. The numbers above are the BACKGROUND cost only.
- The recon agent's own working notes were never written; whatever it ruled
  out beyond the above is lost. The two tools are the deliverable.
