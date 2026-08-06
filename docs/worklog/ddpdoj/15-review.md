# W15 REVIEW - the stage-1 background asset (the never-seen-column proof)

status: **APPROVE.** Every load-bearing claim reproduced on a fresh run; L7 is
honestly closed. Three findings, all INFORMATIONAL/MINOR, none must-fix.

date: 2026-08-02
role: reviewer (READ-ONLY - no `src/` edit, no commit). Independently re-derived
every number below from the owner's dumps via `pgm.py`; nothing is quoted from
the impl worklog unchecked.
target: `ddpdojblk`, VERSION-B. MAME 0.288, the single `pgm.py` entry point.

The impl worklog is `15-impl-background-asset.md`. The commit is `cb651c0`
(three files: the worklog, `tools/oracle/pgm.py`, `tools/pixgate.mjs` - **no
`src/` change**, verified with `git show --name-only`).

---

## VERDICT: APPROVE. L7 is closed by measurement.

The never-seen-column proof is sound, the integrity is real (not the exporter
verifying itself), the shard size is within budget, and the `$26C24A` second
writer is honestly out of scope. Every gate the impl claims green I watched pass;
every RED I watched fail. Details below.

## 1. INTEGRITY - VERIFIED, three asset classes, two-sides

The brief's "raw-file-offset re-read (two-sides rule); the exporter is not
verifying itself." I read the published bytes back through the SAME loader the
browser runs (`loadBundle`) and compared against independently derived sources:

| asset class | published (re-read) | independent side | result |
|---|---|---|---|
| BG tiles (all 2,026 slots) | shard pixels, slot-indexed | **fresh `bgTile` decode of the cartridge ROM** | **0 / 2,026 mismatch** (byte-for-byte) |
| palette (`bg.pal.u16`) | 1,024 xRGB555 words | capture's own palette RAM `$400..$7FF` | **1020 / 1024 agree** (the 4 are animated bank 21) |
| second-map stream (`bg.smap.u16`) | 207 `(tile,attr)` pairs | **fresh `decodeMap($227AF8,23,$32A9)`** | **0 / 414 word mismatch** (LE, as the loader reads) |

The tile two-sides check is the one that matters most and the one no pixel gate
performs: `pixgate`/`bundlegate` only ever exercise the tiles the *corpus draws*
(see §5 coverage), so a slot-mapping or gzip/truncation defect on an undrawn
tile would be invisible to them. I re-decoded **every** slot from the ROM and
diffed it against the published shard pixels: all 2,026 match. So the WRITE
(exporter `bgTile` → gzip) and READ (gunzip → `slot*tileBytes`) paths are
byte-perfect for the whole sheet, not just the seen subset.

**Not circular.** The exporter's own checks (CHECK 1 attribute word, CHECK 2 the
1,820/205 counts, palette-vs-board, region-assembly) share the `bgTile` decode
with the renderer, so they are self-checks - they catch a wrong base/stride but
cannot prove the *published* shards correct. That proof is independent: the
shardgate (§3) compares the published shards against MAME, and my two-sides
check above compares them against a fresh ROM decode in a separate process. The
one shared element, `bgTile` itself, is verified against MAME by `pixslice`
(13,647,872/13,647,872, §4) - so shard == ROM == MAME holds transitively, with
no link verifying itself.

## 2. SHARD SIZE - VERIFIED within 15 % of 666 KB gz

Fresh export (`node tools/export-web.mjs`, exit 0, all integrity checks pass).
Per-shard gz, reproduced exactly:

```
shard 0  cols  0..31   289 tiles   111993 B   BOOT
shard 1  cols 32..63   275 tiles   103309 B   BOOT
shard 2  cols 64..95   174 tiles    66294 B
shard 3  cols 96..127  219 tiles    78715 B
shard 4  cols128..159  288 tiles    98458 B
shard 5  cols160..191  288 tiles    77294 B
shard 6  cols192..223  288 tiles   120442 B
shard 7  second map    205 tiles    81271 B
```

- Scroll tiles (shards 0..6): **656,505 B** = 641.1 KiB.
- + `bg.tileno` (3,345) + `bg.pal` (946): **660,796 B** → **−0.85 %** vs the
  recon's 666,469 B.
- + shard 7 (81,271) + `bg.smap` (517): **742,584 B** → **+8.9 %** on 666 KB.
- Bundle-wide **967.0 KiB total, 456.8 KiB before the first frame** (boot =
  shards 0+1).

All three figures are inside the 15 % bound. The numbers match the impl worklog
to the byte.

## 3. NEVER-SEEN-COLUMN RENDER - VERIFIED, re-derived via `pgm.py shardgate`

```
baseline: 6121472/6121472 = 100.0000% over 61 frame pair(s);
          densest run 61 consecutive, busiest 122 sprites; 61/61 past-160 exact
bg-planes         RED: 3427309/6121472 = 55.9883%, 0/61 past-160 exact
blank-shard-tile  RED: victim $0C2D, 6089914/6121472 = 99.4845%, 0/61
                   (diverged by 6,121,472 - 6,089,914 = 31,558 px)
```

The baseline is pixel-exact past px 160. The two REDs prove the gate is not a
tautology:

- **`blank-shard-tile` is the one that matters for L7.** The victim is
  **`$0C2D`** - a stage-1 scroll tile (`$0AA9..$11C6`), confirmed **NOT in the
  415-tile capture** (I checked `bundle.cap` directly), present in shard slot
  389, opaque 1024/1024, on screen in 61/61 past-160 pairs. Blanking it in the
  shard sheet diverged by 31,558 px. If the gate were silently falling back to
  ROM tiles or the capture, blanking a shard tile would change nothing and stay
  100 %. It went red, so the past-160 picture is coming from the **shards**.
- **`bg-planes`** (5-bit plane weights reversed on top of the shard decode):
  55.99 %, 0/61 - proves the shard pixels are decoded and compared, not skipped.

**I confirmed the corpus genuinely reaches past the capture.** The pix-slice
corpus is 115 frames; `bg_xscroll` spans `0x0..0xC1B` (3,099 px), with **62
frames past 0xA0 (160)** → 61 past-160 pairs (62 consecutive frames pair into
61), consistent with the gate. The capture is 161 frames at the quietest stretch
(px 0..160); `bg_xscroll ≈ 0x0C00` is columns the recording never saw.

## 4. THE `$26C24A` DISPOSITION - VERIFIED, out of scope by measurement

The impl's claim: the render check's frame scope (pix-slice, pre-midboss) never
invokes the second writer (`$26C24A`, lf4315..4585 per W17), so it passes
without the second map; the 205 second-map tiles are exported anyway as shard 7
for W18.

I measured the other half of that: **the pix-slice corpus references 0
second-map tiles.** Scanning every BG-videoram longword in all 115 pix-slice
frames, the count of tiles in `$32A9..$3381` is **0**. So the render check
cannot be exercising `$26C24A`'s output - its baseline is independent of the
second writer, and the disposition is correct, not lucky. (The pre-midboss
lf-range argument in the worklog is also sound: 2500 ≪ 4315.)

The second map IS exported and correct: shard 7 holds 205 tiles (`$32A9..$3381`,
all 205 byte-match a fresh ROM decode per §1), and `bg.smap.u16` carries the 207
`(tile,attr)` entries (0 mismatch vs a fresh `$227AF8` decode). Nothing draws
them yet - the painter `$26C20C` is W18's work, named in the manifest. Honest.

## 5. COVERAGE - what the pixel gates do and do not exercise

- The pix-slice corpus draws **492** of the 1,820 scroll tiles (so the shardgate
  pixel-verifies those 492 past-160 tiles vs MAME; the capture's own 415 are
  pixel-verified by `bundlegate` over px 0..160). The remaining ~828 scroll tiles
  are held in the shards and passed the §1 byte-for-byte two-sides check, but no
  pixel gate draws them. This is the expected shape (RULE 5: coverage is table
  entries, not frames) and the worklog does not overstate it.
- **All 2,026** shard tiles pass the two-sides ROM check (§1), so "held
  correctly" is proven for the whole sheet even where "draws correctly" is not.

## 6. REGRESSION - all green, 0 skip

| gate | result | worklog claim |
|---|---|---|
| `node --test games/ddpdoj/tests/` | **308 pass / 0 fail / 0 skipped** | 308/0/0 ✓ |
| `pgm.py pixslice --reuse` (ROM gate) | **13,647,872/13,647,872 = 100%** over 136 pairs | identical ✓ |
| `node tools/bundlegate.mjs` (shards over capture) | **15,955,968/15,955,968 = 100%** over 159 frames | identical ✓ |
| `node tools/webgate.mjs` | **PASS**, 14 files over HTTP, 98.8 % non-black | identical ✓ |
| `pgm.py shardgate` (this wave) | baseline 100 %, both REDs red | identical ✓ |

## FINDINGS

### F1 - INFORMATIONAL: "1,820" labels shards 0..6, which actually hold 1,821 slots

The worklog (DONE-WHEN 2, and the opening "1,820 + 205 tiles") calls shards 0..6
"the 1,820". They hold **1,821** slots: tile `$0000` (the value `$23C668`'s ring
clear leaves behind, which no map column names) is folded into shard 0 as a
`captureExtra` so `verifyCoverage` is satisfiable from the boot set alone.
`manifest.gfx.bg.tiles = 2,026` (= 1,821 + 205), not 2,025. The 1,820 figure is
the distinct *map* tile count (CHECK 2, which is correct); the *slot* count is
1,821. The export is right and the extra tile is necessary - this is a label
conflation, not a defect. The §1 two-sides check covers all 1,821 + 205 + the
`$0000` slot (2,026, 0 mismatch).

### F2 - INFORMATIONAL: "export all 248 columns" vs the exporter's 224 - provably equivalent

Plan §2/§5 and the worklog say "export all 248 columns ... do not trim", but the
exporter decodes `STAGE1.ncols = 224`. I decoded all 248: the stream is 8,928 B =
248 columns, and decoding 248 yields the **same 1,820 tiles** as 224 - the 24
dead-tail columns (columns 224..247, measured-dead by W17's boss-lock-destroys-
the-object finding) reference **0 unique tiles**, and their attribute words are
all clean (0 outside `$3E`). The full 248-column stream is still shipped in
`player.tables.json` as the `$225B78` ROM window for the port to read at
runtime. So no tile and no column-data is lost; the text and the code simply
disagree on a number that does not change the output. Worth a one-line note in
the worklog so the next reader does not think 24 columns went missing.

### F3 - MINOR: the `blank-shard-tile` RED mutates the shared shard pixel buffer in place

`runGate` for `blank-shard-tile` does `a.shardBg.pixels.fill(0, slot*tileBytes,
(slot+1)*tileBytes)`. `a.shardBg` is `bundle.bg`, shared across every
`runGate({...a}, name)` call by reference, so the zeroing is permanent for the
process. This is safe **only** because `blank-shard-tile` is last in
`SHARD_MUTATIONS` and the baseline runs first; `bg-planes` composes on a fresh
per-call copy and is unaffected. Concrete failure scenario: a future third shard
mutation appended *after* `blank-shard-tile` that redraws the victim tile, or a
re-ordering, would inherit the zeroed slot and compare against a corrupted
sheet; and there is no restore-and-re-baseline step after the REDs within one
`shardgate` run (green is established by ordering, then by the fresh process
each invocation). No current effect - the committed order is correct and each
`pgm.py shardgate` is a fresh process. A defensive `bundle = await loadBundle(...)`
per mutation (or restoring the zeroed bytes) would make it order-independent.

## NONE OF THE ABOVE IS MUST-FIX

L7 is removed on the strength of a measurement that I re-derived and could not
break except by the two REDs the impl already ships. The integrity is verified
by independent sources (MAME for 492 past-160 tiles; a fresh ROM decode for all
2,026; the board palette RAM for the palette; a fresh `$227AF8` decode for the
second-map stream). The shard size is within budget. The second writer is
honestly out of scope and its assets are on disk for W18.
