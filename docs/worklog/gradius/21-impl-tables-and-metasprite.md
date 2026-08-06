# Wave 21 - Export the tables the handlers index, and the metasprite that vanishes

status: DONE
implementer, 2026-08-02

Mandate (from `20-plan-completeness.md` §3 W21, scoped by the owner):

1. Export the 28+ ROM ranges the throwing `$AE1C` handlers index into
   `assets/enemies/tables.json`. Minimum: what wave 22's SIX routines need.
2. Remove `export_metasprites.py`'s invented `n > 16` guard so metasprite `$A2`
   (18 records, `$95FB..$9643`) stops being silently dropped, and add a check
   that every metasprite id any explosion script or handler names actually
   exists in the export.
3. Fix `$A592` = 21 entries (not 20) in every note that still says 20.

Plus: a test that cross-references what the port INDEXES against what the
exporter SHIPS, so the `$A2` class of bug (silent absence) is loud.

This wave writes NO `src/`. It changes two exporters, adds one tool, adds one
test file, adds one gate stage, and corrects three worklogs.

---

## 1. What the six wave-22 routines actually index (measured, not read off a list)

`python games/gradius/tools/handlerflow.py`, re-run 2026-08-02. Per handler,
every `LDA/LDX/LDY/CMP/ADC/SBC abs,X|abs,Y` with a PRG base, over the real
branch-walk closure:

```
$AF2E  entries [15]  indexes: $B01D x1 $ECB2 x1 $EFCD x1 $EFCE x1 $EFCF x1
$AF88  entries [16]  indexes: $B01D x1 $ECB2 x1 $EFCD x1 $EFCE x1 $EFCF x1
$B311  entries  [9]  indexes: $B33B x1
$B3CB  entries [12]  indexes: $B33B x1
$B6E1  entries  [7]  indexes: $B6D2 x1 $B6D9 x1 $B6DD x1
$B747  entries [19]  indexes: $B6D2 x1 $B6D9 x1 $B6DD x1
```

`$ECB2`/`$EFCD`-`$EFCF` are the sound driver's and were already in
`assets/sound/tables.json`. So the wave-22 MINIMUM was exactly three new
blocks - `$B01D`, `$B33B`, `$B6D2` (which is one 15-byte run holding
`$B6D2`+`$B6D9`+`$B6DD`) - and they are all in.

Everything else below is the "export the rest if it is cheap" half. It was
cheap: the 49 addresses the census lists collapse into **25 contiguous data
runs**, because the ROM stores its tables in blocks bounded by code.

---

## 2. WHAT I EXPORTED - 25 blocks, all 49 census addresses

`assets/enemies/tables.json`: **9 blocks / 2,073 bytes → 34 blocks / 3,060
bytes**. `ENEMY_BLOCKS_W21` in `tools/export_assets.py`.

| block | range | len | census addresses it covers |
|---|---|---|---|
| blinkFrames | `$AF0A-$AF0F` | 6 | `$AF0A` |
| rankSpeed | `$B01D-$B025` | 9 | `$B01D` |
| flipFrames | `$B33B-$B342` | 8 | `$B33B` |
| spinFrames | `$B3C2-$B3CA` | 9 | `$B3C2` |
| phaseB42F | `$B42F-$B433` | 5 | `$B42F` |
| phaseB45C | `$B45C-$B460` | 5 | `$B45C` |
| dwellByRank | `$B4E4-$B4F1` | 14 | `$B4E4` `$B4EB` |
| gateTiles | `$B606-$B61D` | 24 | `$B606` `$B612` |
| animRecords | `$B650-$B65B` | 12 | `$B650` |
| **walkerTables** | `$B6D2-$B6E0` | 15 | `$B6D2` `$B6D9` `$B6DD` |
| midBossRank | `$B787-$B7A0` | 26 | `$B787` `$B78F` `$B797` `$B799` |
| midBossHits | `$B852-$B859` | 8 | `$B852` |
| coreTables | `$B8E6-$B912` | 45 | `$B8E6` `$B8E9` `$B8EC` `$B8EF` `$B8F8` `$B901` `$B90A` |
| coreSpread | `$BAF7-$BB0E` | 24 | `$BAF7` `$BAFB` `$BAFF` `$BB07` |
| pathScript | `$BB82-$BBB6` | 53 | `$BB82` |
| lateSpawnerDispatch | `$C439-$C44E` | 22 | `$C439` `$C447` |
| approachStage0 | `$C4F4-$C545` | 82 | `$C4F4` (+ the `$C526` nibble stream) |
| approachStage1 | `$C56D-$C5AC` | 64 | `$C56D` (+ `$C58D`) |
| approachStage3 | `$C601-$C652` | 82 | `$C601` (+ `$C633`) |
| approachStage4 | `$C67A-$C685` | 12 | `$C67A` `$C684` |
| approachStage2 | `$C6CA-$C6DD` | 20 | `$C6CA` `$C6CC` `$C6CE` |
| approachStage5 | `$C750-$C771` | 34 | `$C750` (+ `$C752`) |
| stage2Object | `$C87B-$C905` | 139 | `$C87B` `$C893` (+ the four streams `$C89B`/`$C8BD`/`$C8E0`/`$C8F1` point at) |
| stage2Period | `$C936-$C93C` | 7 | `$C936` |
| page600Object | `$CA29-$CA5D` | 53 | `$CA29` `$CA49` `$CA50` `$CA57` |

**Every one is pinned on the instruction immediately after it**, and the anchor
is a checked field (`anchor: {rom, bytes, is}`) in the JSON, not a sentence in a
comment. The check runs inside `enemy_tables()` at export time. It is not
ceremony:

> **TWO ANCHORS I WROTE WERE WRONG AND THE GUARD CAUGHT BOTH.**
> * `gateTiles` - I wrote `$B61E = A9 00 (LDA #$00)`. The ROM has `A0 00`:
>   entry 38 opens `LDY #$00 / JSR $B628`. Had the anchor not been checked, a
>   two-byte error in either direction here would have shipped `FF FF` or `A0`
>   as gate tiles and looked fine.
> * `approachStage4` - I wrote `$C686 = A5 68 (LDA $68)`. The ROM has `E6 68`
>   (`INC $68`). The anchor is four bytes now, because `$C653` (the stage-4
>   arm) *also* opens `INC $68`.

Both are in the source as comments at the site. A third guard was added at the
same time: **no two of the 34 blocks may overlap**, because `romByteReader`
takes the first block containing an address and with 34 blocks that is past
what an eye checks.

### Where the extents came from

Each run is bounded by code on both sides, read with `tools/dis6502.py` on
2026-08-02. Examples of the shape, so a reviewer can spot-check cheaply:

```
$B6D1  60              RTS
$B6D2  3C 37 32 2D 28 28 23   7 ranks   ($B6A4 LDA $B6D2,Y)
$B6D9  1C 1C 1F 1F           4          ($B6C5 LDA $B6D9,Y)
$B6DD  01 03 02 04           4          ($B6CB LDA $B6DD,Y -> $0496,X)
$B6E1  A6 A8           LDX $A8          dispatch entry 7

$B8E5  60              RTS
$B8E6  00 A0 A0 | 00 00 00 | 00 01 00      entry 23's three muzzles
$B8EF  6C 6D 6E 6F 70 71 00                boss damage metasprites
$B8F6  00 00                               filler
$B8F8  00 20 40 60 80 A0 C0 F0 00          9 ranks
$B901  01 01 01 01 01 01 01 01 02          9 ranks
$B90A  5A 50 46 3C 32 28 23 23 23          9 ranks
$B913  60              RTS                 dispatch entry 25
```

Three ranges are bigger than the census's row because I extended them to the
next code boundary rather than stopping at the last named base:

* `approachStage0/1/3/5` also carry the **packed-nibble spawn streams**
  `$C526`/`$C58D`/`$C633`/`$C752` that `$C447` points at. Those are read through
  `($9A),Y`, not through an indexed load, so `tablecoverage.py` would never have
  flagged them missing - a handler ported without them would have thrown at run
  time on the first eruption. Including them costs 128 bytes and removes a trap.
* `stage2Object` carries the four `$FF`-terminated id streams `$C893`'s
  pointers name, for the same reason. `$C878` is `JMP $C856` and `$C906` is
  dispatch entry 22, so the whole 139-byte run between is data.

### What I did NOT export, and why

* **`$CF2D`/`$CF2E`** - the ending chain's canned-packet pointers, read by
  `$CEB6`/`$CEBB`, reachable only through entry 40 (`$BB0F` → `$CE94`, when
  `$048C != 0` and `$4F != $FF`). `20-plan-completeness.md` §5 excludes the
  ending chain, and exporting the 14-byte pointer table without the flat
  `$CF3B` script it points into would have produced a FALSE GREEN in the new
  coverage tool (the script is read through `($98),Y`, which the tool cannot
  see). They are listed by address and reason in `tablecoverage.py`'s
  `KNOWN_GAPS` and **printed on every run**, so they are visible rather than
  whitelisted.
* **The three loudness fixes in the plan's W21** (`nmi.js`'s mode-dispatch
  `else throw` for modes 0-4/6, a throw for the `$8BD9`/`$8C06` terrain-object
  sprite pass, `camera.js:26`'s false comment) and **worklog 12's wrong
  "power-up dependent" claim about `$B311`/`$AF2E`/`$AF88`. Not done.** They
  are `src/` edits, they change what the port does in windows the corpus
  covers, and the owner's brief for this wave was the exports, the metasprite
  and the `$A592` note. The unpowered sweep's 76 silently-wrong windows are
  still silently wrong. This is the largest thing left on the table.
* **`$9A3D`/`$9A45`/`$9A35`/`$98FD`** (also in the plan's W21 sentence).
  `$9A3D` is already exported as `stage.bossPage`; the other three belong to
  `flow/tables.json` and to W24's `$982F` machine, and no `$AE1C` handler
  indexes them, so `tablecoverage.py` does not demand them. Left for W24.

---

## 3. METASPRITE `$A2` - and the bound that is actually in the ROM

`export_metasprites.py:85` had `if n == 0 or n > 16: continue`. The 16 is
invented; `$8AC6`'s loop has no upper limit on the record count, and `$A2` is
**18** records.

Deleting the guard outright is wrong too: it admits **nine** ids, of which
eight (`$A9 $AE $B9 $BA $C1 $CA $CB $F0`) are CHR/sound bytes read as a count.
The real bound is an **id** bound, and the ROM states it:

```
$8EE0   id $A1's slot  = E6 8E  ->  $8EE6
$8EE2   id $A2's slot  = FB 95  ->  $95FB   (18 records, $95FB..$9643)
$8EE4   id $A3's slot  = 44 96  ->  $9644   (starts exactly where $A2 ends)
$8EE6   ...  id $A1's RECORD, 9 bytes, $8EE6..$8EEF
```

The table points at its own last slot + 2. Slots `$A4`-`$A8` would be
`$8EE6`-`$8EEF`, which is `$A1`'s payload - and reading those five slots as
pointers gives `$0402 $01DB $0400 $01DD $0108`, i.e. `02 04 DB 01 00 04 DD 01
08`, `$A1`'s nine bytes exactly. So **the high table is `$8E9E-$8EE5`, 36
entries, ids `$80-$A3`, and there is nothing above `$A3`.** That is now the
export bound, asserted at export time from `$8EE0` itself.

**The census's "the high table `$8E9E` holds only four real entries
(`$A0-$A3`)" is wrong** - it holds 36; `$80-$9F` were being exported all along.
Corrected in place.

Consequences, all measured:

* export is **157** records, `$A2` included, `$A2` = 18 records.
* the 162-vs-170 denominator in the plan's ledger is **neither**. 170 = every
  slot in `$00-$FF` with a non-zero count; **157** = every slot in `$00-$A3`
  with one. `$00 $31 $37 $3B $3C $3D $3E` point at the shared null record
  `$8D9D` (count 0) and draw nothing - which is `$8AC8 BEQ $8B02`, the ROM's
  own behaviour, not an exporter decision.
* the old guard dropped 9 ids **and wrongly kept 5** (`$B8 $C9 $D4 $F2 $FB`,
  small counts pointing into CHR/sound). The id bound removes all 13.

**A finding that explains why nobody saw it: explosion script 4 OVERLAPS script
2.** Script 2 is at `$AE8C`, script 4 at `$AE8B`. Script 4 *is* `$A2` prepended
to script 2, sharing its terminator at `$AE91`:

```
0 $AE7D 26 27 28          3 $AE86 33 34 35 36
1 $AE81 29 2A 2B 2C       4 $AE8B A2 6B 6A 69 68 6A
2 $AE8C 6B 6A 69 68 6A    5 $AE92 A0 68 A2 69 6A 6B
```

`$A2` is one byte in front of a script that already worked. Six scripts, 28
non-zero id bytes over the six walks - fewer distinct positions than that,
because of the overlap.

---

## 4. THE CHECK - `tools/tablecoverage.py` (and it goes both ways)

The `$A2` bug is not visible from the port's side. `drawMetasprite` does
`if (!rec || rec.length === 0) return cursor` - a missing id draws nothing and
throws nothing. No test that asks "is what we shipped right?" can see it. The
only way to see it is to ask the ROM what it NAMES and demand the export
contain it.

`python games/gradius/tools/tablecoverage.py [--verbose]`, wired into
`tools/test-all.mjs` as stage **1b2**. It reads `assets/prg.bin` and the shipped
JSON; nothing is hand-maintained between them, so it cannot go stale as
handlers are ported.

1. **Tables.** Walks all 42 `$AE1C` dispatch targets **plus `$C413`** with the
   real decoder (`dis6502.py`) and collects every `LDA/LDX/LDY/CMP/ADC/SBC
   abs,X|abs,Y` with a PRG base. Cross-references against every exported range
   of `enemies/flow/collision/weapons/sound/tables.json` **and** the `$864E`
   canned-packet pointer table `hud/packets.json` exports in a different shape.
2. **Metasprite ids.** Every id the cartridge can put into the anim field
   (`$0120 + slot`; `$8B4D LDA $0120,X` is what makes an object visible at all)
   must exist in `metasprites.json`. Three sources: the six explosion scripts;
   `LDA #imm` + a store into `$0120-$013F`; and `LDA <table>,Y` followed by such
   a store, whose bytes are ids.

Today:

```
TABLES: 66 PRG bases indexed by the 42 $AE1C handlers + $C413; 48 exported
        ranges (7477 bytes)
  KNOWN GAP $CF2D (read by $CEB6): ending chain ($CE94), excluded by ... 5
  KNOWN GAP $CF2E (read by $CEBB): ending chain ($CE94), excluded by ... 5
METASPRITES: 64 ids named by the ROM, 157 exported
OK: every table the handlers index is exported, and every metasprite id the
    ROM names exists
```

The 66-base number **supersedes the census's 45 rows** as the denominator: it
is machine-derived from the same walk that decides the answer.

### An independent confirmation of the `$A3` bound

The highest metasprite id **named anywhere in the ROM** is `$A3` (`$C14D
LDA #$A3 -> $012C`). That is arrived at from the code side and agrees exactly
with the `$8EE0` argument from the data side - two routes to the same number,
which is what `docs/knowledge/03` asks for. `$A2` is named only by the two
explosion scripts, `$A0` only by script 5, `$A1` by `$C15E`.

### Five things the tool found about the census's own table

* **`$B797` is a metasprite pair (`3F 40`), not a rank row.** `$B7B5 LDA
  $B797,Y` stores into `$012C,X`. The census's count of 2 is right; filing it
  under "mid-boss rank tables" is not.
* **`$CA29` is 8 rows × 4 columns = 32 bytes, not 4.** `$CA29`/`$CA2A`/`$CA2B`/
  `$CA2C` are four parallel columns and the run reaches exactly `$CA49`, where
  the three 7-rank rows start.
* **`$B6D9` is a METASPRITE table, not a walker speed row.** `$B6C5 LDA
  $B6D9,Y` stores into `$012C,X`. It is `1C 1C 1F 1F` - two ids. `$B6D2` is the
  rank row (`-> $04EC,X`/`$040C,X`, the 16-bit X velocity) and `$B6DD` the
  `bulletMuzzle` index (`-> $0496,X`). W22 needs to know which is which.
* **The census has `$B5A9` and `$B5DC` the wrong way round.** It says "`$B5A9
  LDA $B606,Y` and `$B5DC LDA $B612,Y`". The ROM has `$B5A9 LDA $B612,X` (into
  `$06C2,Y`/`$06CA,Y`/`$06D2,Y`) and `$B5DC LDA $B606,X` / `$B5E2 LDA $B607,X`
  (into `$06F1,Y`). Same two ranges, swapped readers.
* **`$B650`'s records are `[frameCount, metaspriteBase, wrapLimit]`, and the
  three loads are `CMP`/`CMP`/`ADC`, not three `LDA`s.** `$B62E CMP $B650,Y`,
  `$B639 CMP $B652,Y` (byte **+2**, which the census wrote as +1), `$B644 ADC
  $B651,Y -> STA $012C,X`. All three `readBy` strings above were copied from
  the census by me before I read the listing; all three are now the listing's.

### EVERY CHECK WAS SEEN TO FAIL - and one of them had already lied to me

The rule is that a check is assumed broken until it has been watched go red.
These were, on a copy of the shipped assets, restored byte-identically
afterwards (sha1 compared both ways, both files, `True True`).

| break | what went red |
|---|---|
| delete metasprite `$A2` from `metasprites.json` | 3 node tests + `tablecoverage.py` exit 1: *"metasprite $A2 is named by explosion script 4 ($AE8B); explosion script 5 ($AE94) and is NOT in metasprites.json - drawMetasprite() would draw nothing and throw nothing"* |
| re-apply the historical `n > 16` guard | the id cross-reference names `$A2` and its two scripts |
| delete the `walkerTables` block | 3 node tests + *"`$B6D2` is indexed by `$B6A4` and is in NO exported range"* (and `$B6D9`, `$B6DD`) |
| delete the `rankSpeed` block | *"`$B01D` is in NO exported range"* |
| cite `rankSpeed` one byte short | the anchor test: *"rankSpeed anchor must be the first byte past it"*, and `$B025` reads as out of range |
| drop metasprite `$6C` (a `$B8EF` boss damage frame) | red **only after a fix** - see below |
| the two export-time anchors | red for real, `gateTiles` and `approachStage4`, before I corrected them |

**The check that could not fail, found and fixed:** source (c) of the id scan
originally stopped walking at the first conditional branch after an
`LDA <table>,Y`. `$B936` is `LDA $B8EF,Y / BEQ $B962 / CMP $012C,X / BEQ $B9A8 /
STA $012C,X` - the store is two branches downstream on the fall-through path.
So the boss core's own damage metasprites `$6C`-`$71` were invisible to the
check and dropping `$6C` produced no complaint at all. Fixed by walking forward
past conditional branches with a 6-instruction window; the named-id count went
**53 → 66** and dropping any of `$6C $71 $5E $89 $A2 $3F` now goes red. That is
the seventh check in this project that could not fail, and it was mine.

**And the fix over-reached, which I only saw by reading its own output.** With
branches walked through, the window ran off the end of one load/store pair into
the *next* one: `$C6A6 LDA $C6CE,Y / STA $032C,X` … `$C6B3 LDA $C6CA,Y /
STA $012C,X` six bytes later, so the tool claimed `$C6CE`'s **position bytes**
were metasprite ids. Wrong direction is the safe direction - it can only invent
demands, never excuse a gap - but it was attributing to the wrong table. The
window now stops at a competing non-immediate `LDA`. It deliberately does NOT
stop at `LDA #imm`, because `$AF21` is `LDA $AF0A,Y / BNE $AF28 / LDA #$00 /
STA $012C,X` and the immediate is the blink-OFF path (`$AF18 BCS $AF26`) - my
first attempt at the tightening broke there and silently lost all six blinking
pickup ids. Final count **64**, and `$C6CE`'s two bogus claims are gone.

**Where the two halves are NOT redundant, deliberately:** citing `rankSpeed` one
byte short leaves `tablecoverage.py` GREEN (`$B01D` is still readable) and only
the node anchor test catches it. Citing a whole block away leaves the anchor
test partly green and `tablecoverage.py` catches it. Both are in the gate.

---

## 5. `$A592` = 21 - corrected, and the correction was itself off

`($A5BC - $A592) / 2 = 21`, and both bases are cited by real instructions
(`$A3E8 LDA $A592,X`, `$A42F LDA $A5BC,Y`), so the count is forced.

`00-recon-enemies.md` §3 listed 20 and has been fixed in place. The
**missing entry is index 19 (`F4 2A`)** - `B3 2C` is index 20. The wave-20
census described this as "off by one from index 17 on"; re-measured, indices 17
and 18 in the old list are correct and only 19 was wrong. Both worklogs now say
so. Pinned by `tests/tables.test.js`.

While re-measuring the neighbours, one more arithmetic slip in the census, which
does **not** change its count: it writes `$A662 + 3*$78 + 3 = $A7D0`. That sum
is `$A7CD`. Entry `$78` starts at `$A7CA`, its four-byte read ends at `$A7CD`,
and `$A7CE`/`$A7CF` are two slack bytes before the stage pointer table at
`$A7D0`. **121 entries stands**; the bound argument does not.

---

## 6. Files

* `games/gradius/tools/export_assets.py` - `ENEMY_BLOCKS_W21` (25 blocks),
  the anchor guard, the overlap guard.
* `games/gradius/tools/export_metasprites.py` - id bound `$A3` replaces
  `n > 16`; `$8EE0` / `$A2`-extent assertions; `referenced_ids()` +
  `check_ids()` and a non-zero exit when an id the ROM names is missing.
* `games/gradius/tools/tablecoverage.py` - NEW.
* `games/gradius/tools/test-all.mjs` - stage 1b2.
* `games/gradius/tests/tables.test.js` - NEW, 13 tests.
* `docs/worklog/gradius/00-recon-enemies.md`, `20-recon-enemy-census.md`,
  `20-plan-completeness.md` - corrections, in this commit.

Nothing ROM-derived is committed; `assets/` and `rip/` stay gitignored.

## 7. Ported-out-of-42

**Unchanged: 13 / 42 dispatch entries, 10 / 34 routines.** This wave ported no
handler. It removed the reason the next 24 could not be written: of the 66 PRG
bases the 42 handlers index, 64 are now exported and the 2 that are not are
named, printed, and out of scope by the plan.

## 8. The gate

```
node --test games/gradius/tests/
  1..391   pass 391  fail 0  skipped 0        (378 before; +13 tables.test.js)

node games/gradius/tools/test-all.mjs
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  every indexed table is exported (tablecoverage.py)      <- NEW
  PASS  sound data == the measured ownership window
  PASS  one frame fits in the budget (framecost.mjs)
  PASS  port trace shape == probe.lua state vector
  PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken
  GREEN -- 10 passed, 0 failed, 0 SKIPPED
```

The corpus did not move and did not regress: **42 scenarios, 14,098 of 14,098
frames compared, 0 truncated, 0 failures, 0 clamps uncovered, 0
death-coverage failures, 0 stale annotations, 0 display-list coverage
failures, 0 video-coverage failures, 0 deep-reach failures.**

**The display list was actually looked at**, because `metasprites.json` changed
underneath it: the export went 161 → 157 records, which is `+$A2` and **−5**
(`$B8 $C9 $D4 $F2 $FB`, junk the old `n > 16` guard kept). If the port had ever
drawn one of those five, the sprite output would have moved. It did not:
`0 nametable (over 30 strictly graded scenarios), 0 palette, 0 hardware-OAM
bytes differ`, and the 1,022-address display-list watch is clean. `$A2` is not
drawn either, because entries 24 and 40 are still unported - it is exported
*ahead* of W26, which is the point.

`deep-page4` still stops where it did - `port reaches $B6E1 at frame 2490,
unimplemented enemy handler $B6E1 for type $07 (entry 7 of the 42-entry table
at $AE1C) in slot 19` - because this wave ported no handler. What changed is
that when W22 writes `$B6E1`, `$B6D2`/`$B6D9`/`$B6DD` will read.

The display-list numbers, in full, from the run **after** `scen.py` re-recorded
the whole corpus (`exit 0`, 45 recordings): **42/42 scenarios compared,
902,272 slot-frames, 201,161 live - every byte of those compared: Y, tile,
attribute, X - 0 differences.** So the metasprite export moving 161 → 157 was
looked at with the instrument that would have seen it, not asserted.

`python games/gradius/tools/oracle/scen.py`: re-run to completion, then the
whole gate re-run against the fresh recordings. Still GREEN, 10/10, 0 skipped.
Expected - nothing in `src/` changed and the cartridge side does not depend on
the export - but "expected" is not a measurement, so it was measured.

## 9. What the reviewer should look at hardest

1. **The 25 anchors, one at a time.** Two of them were wrong when I wrote them
   and the guard caught both. The guard proves the byte AFTER the block; it
   does **not** prove the byte before, and it does not prove the block's
   internal structure. For four blocks I merged runs the census listed
   separately (`walkerTables`, `midBossRank`, `coreTables`, `page600Object`)
   and for four more I extended past the last named base into a pointed-at
   stream (`approachStage0/1/3/5`, `stage2Object`). Those are the ones where a
   wrong start address would still export "a table".
2. **`page600Object`'s 8-row claim.** `$CA29-$CA48` is 32 bytes and I inferred
   "8 rows × 4 columns" from four parallel `,Y` loads plus the run ending
   exactly at `$CA49`. I did not find the instruction that bounds Y. If Y can
   exceed 7, the run is longer and the block is short.
3. **`approachStage4`'s `$C682`/`$C683` (`12 40`).** Two bytes inside the block
   I cannot name. They are between `$C67A`'s four pairs and `$C684`'s gate.
4. **The two heuristics in `tablecoverage.py` source (c)** - the weakest lines
   in the tool, and both were wrong once before they were right.
   *Window:* six instructions, walking past conditional branches, stopping at a
   competing non-immediate `LDA`. *Extent:* a table's ids run "up to the next
   indexed base in the same block". For `$B8EF` that gives 9 bytes instead of 7
   (the two filler `00`s at `$B8F6`/`$B8F7` are skipped as zeros, harmless
   here). Both can only over-claim, i.e. produce a FALSE FAILURE, never a false
   pass. Wrong direction is the safe direction - but check them.
5. **`$96`/`$97` are not covered by the id check.** `$BB0F` computes its
   metasprite as `$96 + nibble` from the `$BB82` path script rather than
   loading a table byte into `$012C,X`, so source (c) cannot see it. Those ids
   exist in the export, but they exist by luck, not by check.
6. **Everything above is inventory, not verdict.** Nothing here ran on the
   cartridge except the unchanged gate. The exported bytes are asserted equal
   to `prg.bin` and `prg.bin` is verified against the cartridge sha1, but no
   measurement in this wave proves any of these 25 tables is read the way the
   census says it is. W22 owes that for `$B01D`, `$B33B` and `$B6D2`.
