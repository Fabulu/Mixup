# Wave 18 - the stage-1 BACKGROUND ELEMENTS (op $10 + 13 handlers + 8-slot driver)

status: **COMPLETE**
date: 2026-08-02
role: implementer (the only agent writing `games/ddpdoj/`)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER). Every address is
build B (`$23xxxx–$29xxxx`) unless the line says otherwise.

The brief (20-plan §2 W18): port op `$10` BGELEM, the 13 stage-1 handlers, the
8-slot driver `$26233A` / spawner `$262366`, the `$813176` cross-axis
subtraction, the `$24179E` scroll compensation via `$80B03C` (writer `$240C7C`,
named by W17), the `$8130DA` kill gate. Done-when: a W17-corpus window with the
first three elements compares element-slot columns AND bucket-2's staged bytes
at 0 divergent; red: delete one handler's constructor field. Removes the
background-element sprites from capture-ledger L1's bucket half.

## 0. THE DENOMINATOR (statically enumerated, before any port)

Capstone on `tools/oracle/out/maincpu.bin` (the decrypted :maincpu image).
`out/.dbg/dbg.py` is the disassembly tool.

- **Op `$10` BGELEM** (`$262160`): `id:u16 = (a1)+`; `arg:l = (a1)+`; if
  `$813190` (fastFwd) == 0: `arg.w -= $800`; `arg.w -= $813170` (scrollPrev);
  `jsr $262366` (D0=id, D1=arg). The arg's HIGH word is untouched by op `$10`
  (both subs are `.w` on D1's low half); only the low word is scroll-adjusted.
- **The spawner `$262366`**: scans 8 `$20`-byte slots at `$8131C8` for the first
  whose `+0` byte is 0, sets `+0=$80`, `+2=arg(long)`, reads the constructor
  address from `*(*($8132C8) + id*4)` (the per-stage handler table), and calls
  it. If all 8 are busy the ROM falls through (silent drop) - W17 §5 measured
  only slots 0..4 are ever used in stage 1, so this arm never fires.
- **The driver `$26233A`**: for each of 8 slots, if `+0 != 0`:
  `+4 -= $813176` (scrollDelta, the per-frame cross-axis subtraction), then
  `jsr (+8)` (the slot's updater). Order is slot 0..7.
- **The 13 stage-1 handlers** - `$8132C8` holds `$26224A` (stage 0,
  `rom.u32($262302)`). `$26224A` is a 13-longword table (ids 0..12); stage 1's
  starts at `$26227E`. Each handler is a SHORT constructor (`+10=data ptr,
  +14=Y, +8=updater, +D=kind byte`) followed by its updater. The W17 §5
  "constructor = handler+$E" landmark is the `move.l #upd,$8(a6)` (the `+8`
  write every constructor does).

| id | ctor | data(`+10`) | Y(`+14`) | updater(`+8`) | `+D` | thr | variant | `$8130DA`? |
|----|------|------------|----------|---------------|------|------|---------|------------|
| 0 | `$2623A4` | `$22CBCC` | `$24D0` | `$2623C2` | `$14` | `$4800` | `.w bge` | YES |
| 1 | `$2623FC` | `$22DA70` | `$1470` | `$26241A` | `$13` | `$2800` | `.w bge` | no |
| 2 | `$26244A` | `$22DED4` | `$1690` | `$262468` | `$13` | `$2C00` | `.l bgt` | no |
| 3 | `$26249C` | `$22E508` | `$26A8` | `$2624BA` | `$16` | `$4C00` | `.l bgt` | no |
| 4 | `$2624EE` | `$22F184` | `$26B0` | `$26250C` | `$16` | `$4C00` | `.w bgt` | no |
| 5 | `$26253C` | `$22FE98` | `$2860` | `$26255A` | `$12` | `$5000` | `.w bgt` | no |
| 6 | `$26258A` | `$23061C` | `$28C0` | `$2625A8` | `$12` | `$5000` | `.w bgt` | no |
| 7 | `$2625D8` | `$231520` | `$2660` | `$2625F6` | `$12` | `$4C00` | `.w bgt` | no |
| 8 | `$262626` | `$231C44` | `$2A70` | `$262644` | `$13` | `$5400` | `.w bgt` | no |
| 9 | `$262674` | `$232578` | `$2A70` | `$262692` | `$13` | `$5400` | `.w bgt` | no |
| 10 | `$2626C2` | `$232EAC` | `$1E80` | `$2626E0` | `$14` | `$3C00` | `.w bgt` | no |
| 11 | `$262710` | `$233630` | `$2090` | `$26272E` | `$14` | `$4000` | `.w bgt` | no |
| 12 | `$26275E` | `$233F34` | `$0A50` | `$26277C` | `$15` | `$1400` | `.w bgt` | no |

**13 of 13, denominator from the ROM.** The `$8130DA` kill gate is HANDLER-0
ONLY (`$2623C2: tst.w $8130DA / bne die`); W17 §3b's "every updater tests it"
was a generalisation from the first handler reached. It is a no-op in the W18
window regardless (`$8130DA` rises at lf4314, the midboss; the first three
elements are lf2314/2330/2474). The despawn check reads `+2` (the HIGH word of
the arg) - `move.w $2(a6),d0`; the `.l` variants `ext.l` it first. The `.w` and
`..l` readings differ only when `i16(+2)+thr >= $8000`, so both port exactly.

- **`$24179E` scroll compensation**: if `$8130D2` (bgFreeze) == 0:
  `+2 += (word at $80B03C)` - `move.l $80B03C,d0; swap; add.w d0,$2(a6)`. The
  swapped low word is the HIGH half of the longword = the word at `$80B03C`
  (`CAM.txNegL`, writer `$240C7C` inside `$240C22`, named by W17 §3a). Runs
  AFTER the despawn check, BEFORE the `+2` long is read back as the position.
- **`$23DF2A` sprite stage (bucket 2)**: `d0 = asr.l(d1,6) & $7FF03FF |
  $80008000`; stores `d0(l), d2(l), d3(w), d4(w)` = 12 bytes at `$805CC8 +
  $80AFC4`; `$80AFC4 += $C`. `d1=+2(long)`, `d2=+10(data)`, `d3=+14(Y)`,
  `d4=+C(word)` = the `+D` kind byte (high byte of `+C` is never written → 0).

## 1. THE `$246BB8` CLASSIFICATION (op `$00` SPAWN stream)

Op `$00` SPAWN (`$2620DE`) reads N entries off the object-stream cursor
(`blk+4`); each entry is `ptr:u32 + param:u16` (6 bytes), terminator
`$FFFFFFFF`. The create callee is `$24150A`:

```
24150a: lea $80e886, a1 ; lsl.w #6, d0 ; adda.w d0, a1 ; moveq #$f,d0
        move.l (a0)+,(a1)+ x16   ; copy 64 bytes from ptr to $80E886 + param*64
        move.w #$1,$80fa66       ; "dirty" flag
```

`$24150A` is **CODE** (a 64-byte prototype copier into the work-RAM object
table at `$80E886`). It treats EVERY ptr uniformly as a 64-byte DATA source.

The stage-1 object stream lives at `$26157A` (the script descriptor at `$261610`
holds `objStream=$26157A`, `cueStream=$261602`, records at `$261618`). Its 22
entries (0..21), then `$FFFFFFFF`:

```
0 $2238B8:$000A   1 $223878:$000B   2 $2237F8:$000C   3 $223838:$000D
4 $2239B8:$000E   5 $223938:$000F   6 $246BB8:$0018   7 $2252B8:$0019
8 $2243F8:$001A   9 $2242F8:$001B  10 $224338:$001C  11 $224438:$001E
12 $224378:$001D  13 $225278:$001F  14 $2244B8:$0013  15 $224478:$0014
16 $2245F8:$0015  17 $2244F8:$0016  18 $224538:$0012  19 $223938:$000F
20 $224578:$0013  21 $2245B8:$0014   -- TERMINATOR
```

21 of 22 ptrs are `$22xxxx` DATA; **entry 6 (the task's 1-based "entry 7") is
`$246BB8`** - a `$24xxxx` (build-B CODE-segment) address. Disassembling
`$246BB8` shows **64 bytes of `$00`**: it is a ZERO BLOCK used AS DATA (a
zero prototype that, via `$24150A`, zeroes object slot `$18`). It is NOT an
executable routine. **FLAGGED, not smoothed**: the create routine reads 64
bytes from it exactly as from the `$22xxxx` prototypes; the port walks the
stream and notes each create (the prototype copy itself is W21's object
allocator, out of W18's scope). The cursor advance is ported; `$246BB8` is a
named, classified anomaly the port does not paper over.

## 2. THE `$26C20C` / `$26C24A` RIDER - OUT OF SCOPE (separate object)

`$26C20C` is object-type-`$1C`'s handler (the midboss's second-tilemap
painter): `cmpi.w #$105,$8130CE / bne skip; lea $227AF8,a1; lea $9000BC,a0;
... addi.l #$32A90000,d4; move.l d4,(a2)` at `$26C24A`, 23 cols × 9 rows. It
is **NOT among the 13 op-`$10` handlers** (byte-search of `$2623A4..$26277C`
for `$26C20C`/`$26C24A`/`$32A90000`: all FALSE), it is a different object
type, and its measured window is clock `$0105` (lf4315..4585, the midboss -
W17 §9), **far past W18's first-three-elements window** (clocks `$0090..$009E`,
lf2314..2474). Its 205 tiles + `bg.smap.u16` are already shipped (shard 7,
W15). **W18 does NOT port it; it stays a named, flagged unported arm** for a
wave that covers the midboss window (W29). None of the 13 handlers nor op `$10`
references it.

## 3. WHAT THIS WAVE PORTS (into `src/background.js`)

- op `$10` now calls the spawner (`$262366`) instead of only logging.
- the spawner, the 8-slot driver (`$26233A`), `$24179E`, `$23DF2A`, and all 13
  constructors + updaters, translated as written (every immediate cited).
- `$813176` driver subtraction; `$80B03C` scroll compensation; the `$8130DA`
  kill gate (handler 0 only); the `.w`/`.l` despawn variants.
- op `$00` SPAWN: stream walk + cursor advance + the `$246BB8` flag (the
  prototype copy is W21). op `$14` CUE: stays a named no-op that logs.

## 4. THE DESPAWN OVERFLOW-FLAG TRAP (the bug the gate caught)

First run of `w18gate.mjs`: every element frame divergent on the staged bytes
because no element ever staged -- they all "despawned" on the construction
frame. Cause: the despawn check `addi.w #thr,d0; bgt` sets `bgt = N==V && Z==0`,
which tests the **true signed sum** (the V flag flips on overflow so N==V still
reads "positive"), NOT `i16(wrapped result)`. For the first element (id 12,
slot2=`$7000`, thr=`$1400`): true sum = `$8400` = +33792 > 0 → ALIVE; the
16-bit-wrapped result `$8400` = i16 -31744 → my first draft killed it 2 frames
early and it never drew. Fixed: `sum = i16(slot2) + thr; alive = sum >= 0`
(bge) / `sum > 0` (bgt). The `.w` and `.l` variants reduce to the SAME
expression here (the 32-bit add cannot overflow: the range is [-32768, 54271]).

## 5. THE RECORDER'S TWO BUGS (both mine, both seen as all-zero staged bytes)

`w18elem.lua`'s bucket-2 tap read 12 zero bytes for every record. Two defects,
either sufficient:
1. **off-by-$C.** `addi.w #$c,$80afc4` writes the NEW counter (old+$C); by the
   time the callback ran MAME had committed it, so re-reading `$80AFC4` gave
   the new value and the 12 bytes were read $C past the record. Fixed: derive
   the offset from `data` (the value being written): `before = data - $C`.
2. **share offset vs CPU address.** `:sram`'s readers take a SHARE-RELATIVE
   offset (the sample point reads `$130CE` for CPU `$8130CE`); the b2 tap passed
   the full CPU address `$805CC8`, which is past the 128 KiB share and reads 0.
   Fixed: `$5CC8`. (The sample-point columns were never affected because they
   already used share offsets.)

## 6. THE DONE-WHEN - measured, 0 divergent

`tools/w18gate.mjs` runs `src/background.js` over `out/w18-elem.tsv` (3,500 lf,
invulnerable, the W17 harness) and compares, frame for frame: the element-slot
live mask/count (every constructor's `+8`) and the 12-byte bucket-2 records the
updaters stage via `$23DF2A` (the board's stream filtered to PC `$23DF4E`), with
`$80B03C` as a sanity watch. `$813176`/`$813170` are supplied from the board
(the cross axis is player-driven and the TSV carries no player); `$80B03C` is
COMPUTED by the port's own `$240C22` and matches at 0 divergent.

```
FRAMES 1880 compared (lf1621..3500), 1186 with active elements
DIVERGENT emask=0 ecount=0 staged=0 b03c=0
GATE GREEN
```

The window covers the first three background elements (ids 12/1/2, clocks
`$0090`/`$0092`/`$009E`, lf2314/2330/2474) and a fourth (id 0, clock `$00C0`,
lf3018). The first three spawn in the order id 12, 1, 2 -- NOT id 0, 1, 2 --
which is why the table in §0 is indexed by id and the red targets handler 0
(the first one whose spawn sits in the window after the done-when three).

**RED (seen red, then restored):** `--break delete-handler0-data` zeroes
handler 0's constructor `data` field (`$22CBCC` -> 0). From lf3019 (handler 0's
first stage) the staged bytes diverge in exactly the data word and nothing else:

```
first stream divergence @ lf3019:
  port=81C0800C0000000024D00014   (data word zeroed)
  board=81C0800C0022CBCC24D00014  (handler 0's real data ptr $22CBCC)
DIVERGENT emask=0 ecount=0 staged=482 b03c=0   GATE RED
```

`emask`/`ecount` stay 0-divergent under the red because `+8` is still written --
the constructor-field deletion touches only the staged bytes, exactly the
done-when's scope. Restored; clean run re-confirmed GREEN.

## 7. RE-RUNS, all green

- `node --test games/ddpdoj/tests/` -- **308 pass, 0 fail, 0 skipped**.
- `node tools/w18gate.mjs` -- **0 divergent** on emask/ecount/staged/b03c over
  1,880 frames (1,186 with active elements); `--break delete-handler0-data`
  reddens 482 staged frames.
- `pgm.py pixslice --reuse` -- **PASS, 12,845,056 / 12,845,056 = 100.0000 %**
  over 128 frame pairs (no regression; this wave did not touch the BG-tile
  decode path).
- `pgm.py shardgate` -- **BASELINE PASS, 6,121,472 / 6,121,472 = 100.0000 %**
  over 61 past-160 pairs, 61/61 exact; both REDs (`bg-planes`,
  `blank-shard-tile`) caught.

## 8. WHAT THIS WAVE CHANGED

```
M  games/ddpdoj/src/background.js           op $10 -> spawner; driver/spawner/
                                             13 handlers/$24179E/$23DF2A; ESLOT
M  games/ddpdoj/tests/background.test.js    the frozen-frame driver test + ESLOT import
A  games/ddpdoj/tools/w18gate.mjs           the element-slot + staged-bytes gate
M  games/ddpdoj/tools/oracle/w18elem.lua    fix the b2 byte offset + share offset
M  docs/worklog/ddpdoj/18-impl-background-elements.md  this file
```

L1's bucket half loses its background-element sprites: the page now PRODUCES
the 13 stage-1 scenery objects (their sprite records stage into bucket 2 from
ported code, 0 divergent), where before capture supplied them. The milestone
this closes: the whole stage-1 background -- camera, tilemap, tiles, palette,
motion program, scenery objects -- is produced; `capture.bin` supplies no
background layer.
