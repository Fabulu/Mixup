# 47 — IMPL: THE ART THE PORT ASKS FOR, BY ADDRESS (enemy layer, wave E2)

status: **DONE** -- gate `ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED`,
unit tests 585 -> 606, `webgate` 7 of 7, `bundlegate` still 100.0000 %, boot
475.2 -> **473.7 KiB**, and **the tanks have bodies in a real browser**.

started: 2026-08-04. WAVE 47 / enemy-layer E2.
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
brief: fix the owner's report — "lots of turrets running around targetting you...
without tank bodies".
spec: `43-plan-enemy-layer.md` §4 E2 / §6 (delivery), `46-diag-orphan-turrets.md`
(the diagnosis, and this wave's shopping list).
inputs read in full: 46, 43, 44, 41, 39-OWNER, HANDOVER, `docs/knowledge/09`, `10`.

target: `ddpdojblk` VERSION-B. Every address below is build B.
`[M]` = measured by me, this session, on this tree.

## 0. WHAT THIS WAVE IS

The port emits a type-`$11` tank HULL record every frame, correctly positioned
and correctly z-ordered, and the shipped sprite sheet contains 2 of the 64 hull
pictures. So the turret draws and the tank under it does not. This wave harvests
the missing art BY ROM ADDRESS and delivers it without making boot slower.

## 1. THE BRIEF'S PREMISE, CHECKED — three corrections, none fatal

The brief says "do not re-derive, but verify anything you build on". I verified
all of it from the cartridge. **The cause is exactly as diagnosed and the fix is
exactly the one named.** Three numbers are wrong and one of them doubles a
shard.

### CONFIRMED, from the ROM, this session

```
[M] DIRECTORY 8,073 streams, $000000..$33A6E4        (reproduces W35/W41)
[M] run of valid stream starts from $268B9E: 96 longwords, and entry 64 is
    EXACTLY $268C9E.  From $268C9E the run is 32 and stops: $268D1E holds
    $3B7C0001, which is not a stream start.
    -> the HULL table is 64 entries and the TURRET table is 32, both ends
       pinned: the top by $2689A0's `d1 = (($1A,A6) & $3E) << 2` reaching $F8
       plus $2689B4's mirror +4, the bottom by the next table.
       46-diag §10.1's open item ("whether 64 is the whole of $268B9E") is
       CLOSED from below as well: the 96-longword run ends at $268D1E.
[M] $268B9E  64 entries, 64 distinct,  2 IN the shipped sheet, 62 OUT
[M] $268C9E  32 entries, 32 distinct, 32 IN the shipped sheet,  0 OUT
[M] the two tables are DISJOINT -- 0 addresses in common
[M] the 62 missing hulls, packed and gzipped the way export-web.mjs does it:
    mask 2,091 B + colour 25,638 B = 27.1 KiB      (46-diag §6, to the digit)
[M] $269E48  27 of 32 missing =  9.8 KiB           (46-diag §6, to the digit)
[M] $272E7A  32 of 32 missing = 30.5 KiB           (46-diag §6, to the digit)
```

### CORRECTION 1 — `$26990E` is **70 entries, not 24**, and **116.7 KiB, not 37.3**

`46-diag` §6 prices type `$31`'s animation table at 24 entries / 37.3 KiB and
§10.2 says plainly "my reading of a 6-byte-entry / stride-8 walk; I did not find
where it ends."

**It is already found, in this port, and it is in `src/handlers.js:2313-2320`:**
phase 2 frees the record when the cursor reaches `$230`, and
`$26990E + $230 == $269B3E`, which is the damage-first family's shared draw
block — i.e. instructions. So the table is `$26990E..$269B3D`, **70 entries of 8
bytes**, and both ends agree.

```
[M] $26990E  70 entries, 70 DISTINCT streams, 0 in the sheet, 70 missing
[M] priced: mask 2,522 B + colour 116,992 B = 116.7 KiB gz
```

**That triples the diagnosis's "all five tables = 145 streams / 105.7 KiB".**
The five are **191 streams**, and this wave ships more than five (below).

### CORRECTION 2 — the hull row in `46-diag` §3 is the MISSING SUBSET, not the table

The brief and `46-diag` §3 both say:

> hull 4,002 emitted / **ZERO drawn**

**[M] Over 1,000 logic frames from the shipped seed, nothing pressed, through
the page's own `portSpriteList` and the page's own map:**

```
[M] TURRET records ($268C9E's 32 streams)   21,147 emitted   21,147 DRAWN
[M] HULL   records ($268B9E's 64 streams)   21,147 emitted   16,953 DRAWN
                                                              4,194 MISSED
                                             over 32 distinct missing hulls
[M] first turret record lf2000   first hull record lf2000   FIRST ORPHAN lf2458
```

The two counts are **identical because every live tank emits exactly one hull
record and exactly one turret record every frame** — which is itself the
cleanest proof that the body producer is wired and running, and it is `46-diag`
§8 candidate 4's answer measured from the other side.

**A hull record is NOT always undrawn.** Entries 44 and 45 ARE in the sheet, so
16,953 of the 21,147 draw — which is `46-diag` §2's own finding ("[M] it is
visible at boot... every body draws") and contradicts its own §3 row. The 4,002
is the count of hull records whose stream is one of the 62 ABSENT ones, over a
window one frame from mine; the row is mislabelled "$268B9E's 64 streams".

**Nothing about the cause or the fix changes.** It matters for two reasons:
a claim of "0 drawn" would have been falsified by the first screenshot, and the
real number — 4,194 in 1,000 frames — is what this wave has to move.

### CORRECTION 3 — the hulls are **35.9 %** of every miss, not 23.6 %

`46-diag` §6 counts the hulls' share of the 6,185-frame run as "39 distinct
streams in `$165D00..$166FFF`, 36,590 of 154,831 = 23.6 %". That range stops at
`$166FFF` and **the hull table's entries 46..63 are `$166FAC..$167650`**, above
it — the diagnosis lists them itself in §1 and then prices a sub-range.

```
[M] the SAME 6,185-frame run (it reproduces E1 exactly: 288,903 records,
    134,072 drawn, 154,831 MISSED, 326 distinct missing addresses):
      HULL ($268B9E, all 64):  74,826 emitted, 19,252 drawn, 55,574 MISSED
      = 35.9 % of EVERY missed record in the whole run
```

**The 62 missing hulls are 27.1 KiB of art against 35.9 % of every missing
record in the port's longest run.** The brief's "single highest-value 27 KiB in
this project" is if anything understated.

### 1.1 AND TWO TABLES NOBODY HAS COUNTED — the enumeration, completed

`46-diag` §10.2 leaves "the other handlers' tables beyond the five" open. I read
`games/ddpdoj/src/` for every sprite-pointer table a PORTED handler reads and
found two more, both already pinned by code in the port's own comments:

| ROM table | read by | entries | in sheet | missing | gz |
|---|---|---:|---:|---:|---:|
| `$268B9E` | `handlers.js fire11` `$2689BC` | 64 | 2 | **62** | **27.1 KiB** |
| `$268C9E` | `handlers.js draw11` `$268A72` | 32 | 32 | 0 | 0 |
| `$269E48` | `initbody.js`/`FAM.sprite` `$269E20` | 32 | 5 | 27 | 9.8 KiB |
| `$269BB6` | `FAM.anim4` `$269B64` | 4 | 4 | 0 | 0 |
| `$272E7A` | `initbody.js:608` / `handlers.js:1999` | 32 | 0 | 32 | 30.5 KiB |
| `$26990E` | `handlers.js animStep31` | **70** | 0 | **70** | **116.7 KiB** |
| **`$2970D8`** | **`handlers.js:2454` (type `$24`)** | **16** | **0** | **16** | **23.9 KiB** |
| the LASER's five | `src/laser.js` (W45) | 5 | 0 | 5 | 1.1 KiB |
| | | | | **212** | **209.1 KiB** |

**AND ONE TABLE DELIBERATELY NOT SHIPPED.** `$268594` (enemy type `$10`, 96
entries, 90 missing, 51.8 KiB) is in `w35atlas.mjs ROM_TABLES` and **[M] no
ported code reads it** — `grep 268594 games/ddpdoj/src/` is empty, and [M] the
6,185-frame run emits **0** of its 96 streams. Shipping it would be 51.8 KiB of
art for a handler that does not exist yet. Named here so the next wave does not
have to re-derive it.

### 1.2 WHERE EACH TABLE IS FIRST NEEDED — measured, and it sets the shard order

[M] the same 6,185-frame run, per table: which of its streams the port actually
asked for, how many records that was, and the first logic frame.

| table | streams reached | records MISSED | first need |
|---|---:|---:|---|
| `$268B9E` hull | 56 of 62 | **55,574** | **lf2458 = +7.7 s** |
| `$272E7A` type `$89` | 13 of 32 | 7,018 | lf4938 = +49.6 s |
| `$269E48` family body | 12 of 27 | 5,870 | lf6426 = +74.7 s |
| `$2970D8` type `$24` | 16 of 16 | 352 | lf7834 = +98.7 s |
| `$26990E` type `$31` | 37 of 70 | 120 | lf8106 = +103.2 s |
| the LASER's five | 0 (nothing pressed) | 0 | the first held frame |

The four body tables plus the laser are **68,934 of the run's 154,831 missed
records = 44.5 %**, and the hull table alone is 35.9 % of it.

## 2. THE DELIVERY DECISION — the constraint that shaped the wave

**212 streams / 209.1 KiB of art against a standing "boot must not get slower"
(HANDOVER §8.8) and a boot that was 475.2 KiB.**

`41-recon` §2.5 priced four options and its verdict stands: A (ship it all at
boot) is +209 KiB and rejected; C (lazy per-stream fetch) is impossible because
`renderIndexed` is synchronous inside the frame; D (a different compression) is
9.7 % for a renderer change, and brotli is unusable through
`DecompressionStream`. **B, the shard, is the only one that works**, and this
wave builds it.

### 2.1 THE SHARD BOUNDARY, and why shard 0 is byte-identical

The sprite sheet is now **six shards over ONE packed address space**. Each shard
owns a CONTIGUOUS run of the packed mask array and of the packed colour array;
the page allocates both at full size at boot and drops each shard's words into
place as it lands. So **"which shard is a stream in" is a range test on its
packed base** — which is why `spr.streams` needed no fourth field and why the
page can NAME a shard for a stream whose shard has not arrived.

| shard | what | streams | gz | when |
|---|---|---:|---:|---|
| **0 boot** | the recording's 150 + the ship's 17 tilts (W12) | 166 | **39.2 KiB** | boot |
| 1 `type11` | `$268B9E` hull + `$268C9E` turret + the laser's 5 | 67 | 28.2 KiB | **[M] +7.7 s** |
| 2 `type89` | `$272E7A` | 32 | 30.5 KiB | [M] +49.6 s |
| 3 `family` | `$269E48` + `$269BB6` | 27 | 9.8 KiB | [M] +74.7 s |
| 4 `type24` | `$2970D8` | 16 | 23.9 KiB | [M] +98.7 s |
| 5 `type31` | `$26990E`, 70 frames | 70 | 116.7 KiB | [M] +103.2 s |

**Cut by MEASURED FIRST NEED (§1.2), not by a guess**, and shard 0 is
deliberately **exactly what the bundle already shipped**: the same 166 streams,
packed first, so every packed base is unchanged, `capture.bin` is byte-identical
(67,590 B both ways) and **`bundlegate`'s 100.0000 % pixel identity cannot have
moved**. That is also why the laser's five streams are in shard 1 rather than
shard 0 even though the player can hold fire on frame one: inserting them into
shard 0 shifts every base behind them and rewrites the bytes the strongest gate
in this port compares. 1.1 KiB of latency on a beam that is a named skip for the
second shard 1 takes is the cheaper side of that trade.

### 2.2 WHAT HAPPENS WHEN THE PLAYER OUTLIVES A SHARD

Nothing new, and that is the point — **the guard W44 built already names every
record it cannot draw.** W47 adds one distinction, because these are two
different bugs and they must not wear the same sentence:

```
    NO ART $166840x3          the bundle does not contain this picture
    SPR SHARD 1x10            it does, and 28 KiB of it is in flight
```

and `demand(shard)` is called from the guard, so **the shard a record actually
asks for jumps to the head of the fetch queue**. The delivery schedule is a
function of the SIMULATION rather than of a clock — the same reason
`BgShards.followColumn` is driven by the scroll VM's own column cursor
(`41-recon` §2.5), and it cost nothing because the guard was already naming
every record it skipped.

**A record is NEVER drawn out of a shard that has not landed.** Those words are
still zero and a stream of zeroed mask words is a solid rectangle of pen 0 — a
picture that is WRONG rather than absent, which is the one outcome the whole
guard exists to prevent. `--break draw-pending-shard` is the mutation that does
it anyway, and it is red-validated (§4).

### 2.3 THE FAILURE MODE IF A SHARD IS MISSING — seen, in Chrome

`BgShards`' contract exactly, and the sprite half is now the same code (the
queue was lifted into a shared `ShardQueue`; `bundlegate --break shard-404` and
`shard-late` still go red through it, §4).

- **in flight** → its records are skipped, the SHARD is named on the status
  line, `spr n/6` says how many have landed. Never black.
- **404 / bad gzip** → recorded at fetch, and **raised by `demand()` from inside
  the first frame that needs it** — not at boot, so a shard nobody reaches
  cannot take the page down.
- **a stream in NO shard** → an EXPORT gap, and `loadBundle` throws for it at
  load in different words.

**[M] Seen, in Chrome, with `spr/mask.shard1.u16.gz` withheld: the page ran
normally and stopped at logic frame 2458 — the exact first frame that asks for a
hull — with**

```
AN ASSET IS MISSING OR BROKEN.
SPRITE SHARD 1 DID NOT LOAD (assets/spr/mask.shard1.u16.gz: HTTP 404 ...).
It holds 67 sprite streams -- type $11's hull $268B9E + turret $268C9E, and the
laser's 5 (W45). The owner's missing tank bodies. -- and a record has asked for
one of them.
```

**AND THAT SCREENSHOT FOUND A DEFECT IN THE PAGE'S ERROR PANEL.** The headline
read **"$268B9E IS NOT PORTED YET"**: `showError` scrapes the first `$xxxxxx` out
of any message, and W47's asset messages name the ROM TABLE a shard came from.
So a missing FILE was being reported as an unported ROUTINE — the port is fine
and the sentence blamed it. `index.html` now branches on `AssetError` and says
so. Nothing but a real browser was going to find that.

### 2.4 BOOT, MEASURED BEFORE AND AFTER

```
[M] BEFORE   475.2 KiB before the first frame   (export-web.mjs's own figure)
[M] AFTER    473.7 KiB                          -- 1.5 KiB SMALLER
[M] and the deferred queue grows 510.2 -> 719.4 KiB (the 209 KiB of new art)
```

**Boot went DOWN while 212 streams of art were added**, and the whole of it is
one decision:

- **the stream table left `manifest.json`.** [M] `manifest.json` is the one body
  served UNCOMPRESSED, so every byte of it is a boot byte, and 378 triples of
  pretty JSON is **11,922 B** (7,007 B even compacted onto one line). As
  `spr/streams.u32.gz` — a flat `Uint32Array`, three per stream — it is **4,536 B
  raw and 2,219 B gzipped**. A thousand integers belong in a typed array.
  `manifest.json` 12,272 -> 8,683 B.
- the shard files lose the power-of-two padding the single sheet carried: [M]
  shard 0's mask+col is 40,099 B against the old 40,274.

## 3. THE ROM-LEAK GUARD FIRED, AND IT WAS RIGHT TO

`node tools/build-dist.mjs` **refused to build**:

```
REFUSING TO BUILD: dist/ contains verbatim cartridge data.
  spr/col.shard2.u16.gz  (31920 B, decompressed, verbatim inside cave_a04401w064.u7)
  spr/col.shard4.u16.gz  (31418 B, ...)
  spr/col.shard5.u16.gz  (243548 B, ...)
```

**[M] WHAT IS ACTUALLY DIFFERENT ABOUT THOSE THREE: NOTHING, IN KIND.** Every
sprite this page has ever drawn is cartridge art. `col.shard0.u16.gz` — the
sheet that has shipped since wave 7 — is the same colour ROM's bytes and is not
flagged, for one reason: its 166 streams come from SCATTERED addresses, so the
packed file is a stitch of many runs and matches nothing contiguously. Shards 2,
4 and 5 each hold ONE ROM TABLE whose streams are CONSECUTIVE, so their packed
colour is a single run. Shards 1 and 3 hold tables with holes in them and pass.

**The property the guard tests is PACKING ORDER, not provenance** — and
reordering the blocks to make it quiet would be gaming it, which is the one
thing a guard like this cannot survive. So the four answers the guard itself
offers, in its own order:

1. **an INTERMEDIATE?** No. `SprShards` fetches all three.
2. **a COPY that should be a TRANSLATION?** *This is the real alternative and it
   is a wave, not a line.* Decode the colour half the way the tiles are already
   decoded — one 5-bit pixel per byte. `41-recon` §2.2 measured it (raw +50 %,
   **gzipped −9.7 %**) and rejected it because it changes `SpriteDrawer`'s inner
   loop, which is on `bundlegate`'s and `pixgate`'s 100.0000 % pixel path, and
   the drawer would then have to read BOTH forms — the gates compare against the
   cartridge's own packed ROM. **This is the thing that would retire the three
   entries below, and it is named here so the next wave does not have to
   re-derive it.**
3. **a SUBSTITUTE?** A drawn replacement for 62 tank hulls and a 70-frame
   explosion is not a placeholder, it is a different game.
4. **`PUBLISH_VERBATIM`.** Taken, with a reason each, and printed on every build.

This is the owner's standing decision (HANDOVER §8.1 — *"the live site may serve
real cartridge art; the repo may not"*) applied to the game it was not written
for. `games/ddpdoj/assets/` is gitignored and every byte of it is regenerated
from the owner's own cartridge. **The list went from one entry to four and that
is a decision the owner may want to reverse; it is flagged rather than buried.**

## 4. EVERY CHECK SEEN TO FAIL — and the one that COULD NOT

### 4.1 THE GATE STAGE THAT AGREED WITH ITSELF. Read this one first.

`webgate`'s new W47 stage first asserted, in substance, *"everything sprite
shard 1 holds is drawn once shard 1 is here"*.

**[M] I cut the hull harvest from 64 entries to 16 — the exact "16-direction"
mistake `46-diag` §6 warns this wave about, i.e. a bundle carrying A QUARTER of
the tank art — re-exported, and the stage reported**

```
PASS: W47 THE TANK BODIES -- ... carries 2310 display-list records.
      With all 6 shards loaded: 2310 drawn of 2310 (expect all)
```

**It passed. On the owner's bug, three-quarters unfixed.** The check read its
subject through the same constant it was testing: a short shard simply makes a
smaller set, and "all of the set" is true of any set. `docs/knowledge/03` names
this exactly, and two checks in this project have already seeded through their
own constant.

It now asserts three **ABSOLUTE, MEASURED** numbers, none of which the bundle
supplies: **67 streams in shard 1** (62 absent hulls + 5 laser), **4,194
records** over 1,000 frames from the shipped seed, **32 distinct hull images**.
Re-mutated:

```
FAIL: W47 THE TANK BODIES -- ... holds 21 streams (expect 67) and carries 2310
      display-list records (expect 4194) over 4 distinct images (expect 32)
```

### 4.2 Seventeen unit mutations, seventeen named reds

`tests/web-spr-shards.test.js`, 21 tests. Each mutation applied to `src/` or
`tools/`, the suite run, **the NAMED test that went red recorded, the file
restored and hashed byte-identical**. All 17 restores byte-identical.

| # | mutation | the test that went red |
|---|---|---|
| M1 | the packed-space tiling check removed | `SprShards REJECTS shard runs that do not tile the packed space` |
| M2 | the power-of-two check removed | `a non-power-of-two array length is refused` |
| M3 | a pre-W47 bundle accepted silently | `a bundle with no spr.shards says WHICH wave it predates` |
| M4 | `shardOfBase` always says shard 0 | `shardOfBase is a RANGE test on the packed base` (+2 more) |
| M5 | a shard installed at offset 0 | `install() drops a shard's words at ITS OWN offset` |
| M6 | the sprite shard-body length check removed | `a SHORT shard body is refused by length` |
| M7 | the failed-shard message stops naming the files | `a FAILED sprite shard throws from demand(), naming...` |
| M8 | `demand()` throws for a merely LOADING shard | `a LOADING sprite shard does NOT throw` |
| M9 | a pending shard reported as MISSING ART | `...skipped by WIDTH and names the SHARD, not the address` |
| M10 | a record DRAWN out of a shard that has not landed | `THE MUTATION: ...reads ZEROED words` (+1) |
| M11 | `verifyCoverage` stops checking the capture is boot-drawable | `verifyCoverage REFUSES a capture stream ... DEFERRED shard` |
| M12 | the hull harvest sized off the "16-direction" comment | `THE HARVEST TAKES 64 HULL ENTRIES, NOT 16` |
| M14 | the laser folded into the BOOT shard | `SHARD 0 IS THE BOOT SHARD` |
| M15 | the stream table put back into `manifest.json` | `the stream table is a TYPED ARRAY` |
| M16 | `$268594` harvested after all | `$268594 is NAMED as not harvested` (+1) |
| M17 | an `AssetError` wears the "IS NOT PORTED YET" headline | `an AssetError does NOT get the ... headline` |
| M18 | one sentence for both kinds of skip | `the page says WHICH of the two skips it is` |

**AND ONE MUTANT WAS DEFECTIVE, recorded rather than quietly repaired.** M6's
first form anchored on `if (bytes.length !== want) {`, which appears in
**`BgShards.install` as well** — `String.replace` takes the FIRST, so it mutated
the BACKGROUND loader and this file's tests never looked at it. It came back
`*** SURVIVED ***`, which is what a survivor is for. Re-anchored on
`SprShards`' own message and it goes red.

### 4.3 The exporter's own extent checks, seen red against the cartridge

A unit test can only read the exporter's SOURCE. These run the real export
against the real ROM.

| mutation | what the export printed |
|---|---|
| the hull table's stated run 96 -> 90 | `Error: sprite table $268b9e stride 4: the cartridge's run of consecutive stream starts is 96, ending at $268d1e; this file says 90...` |
| type `$31`'s stride 8 read as 4 | `Error: ... the run is 79, ending at $269a4a; this file says 70 ending at $269b3e` |
| the hull table claiming 100 entries | `Error: sprite table $268b9e claims 100 entries but its run of valid stream starts is stated as only 96` |

`export-web.mjs` restored and re-hashed byte-identical after each.

### 4.4 Everything W44 and W14 already had, still red

`webgate --break`: `no-remap` (16,457 of 16,457 records lose their key),
`drop-one-stream` ($166EE4 skipped 3,664, drawn exactly `16457 - 3664`),
`lag-0` (126 of 200 frames), `terminate-instead-of-zero-width` (the renderer
sees 9,406 of 24,889), `no-extent-check` (the `$000000` over-read stops being
named), plus the three fetch breaks. **NEW: `--break spr-shard-404`** — the
bundle LOADS and `demand()` throws from the frame that needs it.

`bundlegate --break`: `drop-tile`, `drop-stream`, `zero-col` (89.4967 %),
`blank-tile` (99.0507 %), `shard-404`, `shard-late` — **all six still red
through the refactored `ShardQueue`**, which is what says the lift did not
quietly weaken the background's contract.

## 4.5 THE RESULT, AS ONE MEASUREMENT — the same 6,185-frame run, twice

Identical conditions to §1's before-run: the shipped seed, nothing pressed, the
page's own `portSpriteList` and the page's own map, all six sprite shards
loaded, stopping at the same loud named throw (`$292902` at lf8185).

```
                                            BEFORE            AFTER
[M] display-list records                    288,903           288,903
[M] drawn                                   134,072           203,006
[M] MISSED                                  154,831            85,897   -44.5 %
[M] distinct missing addresses                  326               192
[M] HULL ($268B9E) emitted / DRAWN     74,826 / 19,252   74,826 / 74,826
[M] first ORPHAN frame                       lf2458              NONE
```

**[M] And not one stream of any of the seven harvested tables, nor of the
laser's five, is in the remaining miss set — 0 of 0 of 0, table by table.**

The 85,897 that remain are other producers' rows, and the list says whose: the
biggest is `$12D430` at 14,104 records, which is the port's single most-emitted
stream and belongs to no table any ported handler reads. That is the next
wave's shopping list and it is 192 addresses long, not 326.

### 4.6 E2's DONE-WHEN, and the half of it this wave CANNOT meet

`43-plan` §4 E2 asks for *"the guard's `skipped` count is 0 over the first N
seconds for a stated, measured N"*.

**[M] N is 5.32 seconds, and it did not move.** The first record with no art is
still `$233F34` at lf2315 — a 5x80 BACKGROUND ELEMENT reached from the immediate
at `$262760`, which no enemy-body table contains and which this wave was never
going to fix. **Saying "E2 is done" on that metric would be false**, so it is
stated the other way round: the metric this wave moves is **the enemy-body share
of the miss set, 44.5 % of every missed record in the port's longest run, to
zero**, and `webgate`'s W47 stage pins it at three absolute numbers.

## 5. THE PAGE, IN A REAL BROWSER — WHAT I SAW

Chrome + Python `playwright` over a local HTTP server, the recipe W42
established. Nothing downloaded.

### 5.1 THE TANKS HAVE BODIES

**[M] At +15 s — the moment `46-diag` §7 photographed as "lone gun barrels
standing on the pavement, five or six of them around the ship, each with its
shadow and no vehicle underneath" — there are SEVEN COMPLETE TANKS on the road:
tracked hulls with a gun turret on top, and the hulls are on VISIBLY DIFFERENT
HEADINGS** — the pair at centre-left is square to the screen, the three at
top-right are angled away up the road, and every turret is independently swung
round to point at the ship. That is the whole diagnosis on the glass: the turret
is indexed by FACING and the hull by HEADING, and the headings are no longer
restricted to 44 and 45.

**[M] At +10 s: ELEVEN complete tanks**, the frame `46-diag` §7 recorded as
`NO ART 12: $166840x3 $1662C8x2`.

**[M] The page's own status line no longer names a single `$165xxx`/`$166xxx`
/`$167xxx` address, at any of ten sample times over 30 s.** Before:

```
[M 46-diag] +10s  NO ART 12: $166840x3 $1662C8x2
[M 46-diag] +15s  NO ART 19: $1662C8x6 $166264x3
```

after:

```
[M] +10s  [port] dl 39 drawn 29 b0 24 spr 6/6  NO ART 10: $233F34x1 $22DA70x1 $22DED4x1
[M] +15s  [port] dl 56 drawn 26 b0 20 spr 6/6  NO ART 30: $12D174x8 $12D430x8 $172D18x2
```

Every remaining address is a BACKGROUND element or a bullet-animation stream —
other producers' rows, not this wave's.

### 5.2 THE BUG AND THE FIX, IN ONE SESSION

I served the page with `spr/*.shard1.u16.gz` **held back for 26 seconds**, so
the same page shows both states:

- **[M] +16 s, shard 1 in flight: SIX LONE GUN BARRELS floating on the
  pavement**, no vehicle under any of them, aimed at the ship. **This is the
  owner's screenshot, reproduced on demand.** The status line reads
  `spr 1/6 SPR SHARD 1x10` — the page saying, in its own words, that ten records
  this frame are waiting on 28 KiB.
- **[M] +28 s, shard 1 landed: the same tanks are whole.** No reload, no
  restart, no error.

### 5.3 What I did NOT see, stated as a limit

**Nothing here is compared against MAME.** `46-diag` §10.3's limit stands
unchanged: what §4 of that document proved is that the port asks for the same
stream ADDRESS the board asked for, 160 of 160 frames. This wave proves the
bundle now CONTAINS that address's picture and that it draws. **A record with a
correct descriptor can still be the wrong record**, and no gate in this repo
compares the PORT's own list against a board frame. That gate still does not
exist and I did not build it.

## 6. THE CHANGE, FILE BY FILE

- **`tools/export-web.mjs`** — `HARVEST`, seven tables with their entry count,
  stride, the cartridge's own run length and where that run ends, plus a `why`
  citing the code that pins each; `checkTableExtent`, which asserts both numbers
  against the ROM on every export; the laser's five immediates; `SPR_SHARDS` and
  per-shard packing into ONE address space; the packed base widened from 16 to
  the hardware's own 23 bits; `spr/streams.u32` instead of inline manifest JSON;
  `$268594` named as deliberately not harvested.
- **`src/web/assets.js`** — `ShardQueue`, W14's queue machinery lifted out of
  `BgShards` unchanged (three states, one fetch at a time, promotion, a failed
  shard raised by `demand()` from the frame that needs it); `SprShards`, which
  adds `shardOfBase`, a two-file `load` and the packed-space tiling check; the
  stream table materialised out of the typed array onto `manifest.spr.streams`
  so every existing reader is untouched; `verifyCoverage` now also refuses a
  capture stream that has drifted out of the boot shard.
- **`src/web/app.js`** — `romToPackedMap` derives the shard; `portSpriteList`
  gains `pending` (by shard) beside `missing` (by address), calls
  `opts.demand(shard)`, and gains the `draw-pending-shard` mutation; `Demo`
  wires both; `boot()` queues the deferred sprite shards.
- **`index.html`** — `SPR SHARD n` and `spr n/6` on the status line; the
  `AssetError` arm of `showError`.
- **`tools/webgate.mjs`** — the W47 tank-bodies stage with three absolute
  denominators, the `draw-pending-shard` check, `--break spr-shard-404`, and
  `connection: close` on the test server (a 1,000-frame CPU window between
  fetches made Node's idle keep-alive socket produce a reproducible flaky red).
- **`tools/bundlegate.mjs`** — its bundle line prints the shards.
- **`tools/build-dist.mjs`** — three `PUBLISH_VERBATIM` entries, §3.
- **`tests/web-spr-shards.test.js`** — 21 tests, new file.

## 6.5 THE GATE, ON THE FINAL TREE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

Unchanged from W32..W46's 49/0/0. **Nothing was disabled, skipped, narrowed or
loosened**, and every stage line was read rather than only the verdict. The ones
this wave could plausibly have broken, all green:

- `assets/integrity` and its four REDs — **including `assets/integrity RED
  [rom-byte]`, the ROM-leak guard**;
- `pixel gate: the port's JS renderer vs MAME` (100.0000 %) and its 9 REDs;
- `demo gate: the port drives the ship, pixel-exact` and its 4 REDs;
- `background shard gate: published tiles past px 160 (+ RED)` — the stage that
  fresh-exports and then draws off the published shards, i.e. the one the
  exporter rewrite had to survive;
- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/    606 pass, 0 fail, 0 SKIPPED   (was 585)
node tools/webgate.mjs             7 of 7 PASS
node tools/bundlegate.mjs          15955968/15955968 = 100.0000%  <- UNCHANGED
node tools/build-dist.mjs          clean, 4 deliberate exception(s)
BUNDLE                             473.7 KiB before the first frame (was 475.2)
```

**A FIRST GATE RUN WAS THROWN AWAY AND IT IS WORTH RECORDING WHY.** It came back
`48 passed, 1 failed`, the failure being the background shard gate — because I
was re-exporting `assets/` in another shell while it ran, and `export-web.mjs`
removes `gfx/` and `spr/` before rewriting them. `HANDOVER` §10 names this
hazard for concurrent AGENTS; it is just as true of one agent with two shells.
The green above is a clean run with nothing else touching `assets/`.

## 7. WHAT THIS WAVE DID NOT DO

- **Nothing is compared against MAME.** §5.3.
- **The `0 skipped` window did not move.** §4.6 — the first miss is still
  `$233F34` at +5.32 s, a background element.
- **192 stream addresses still have no art**, 85,897 records over the long run.
  They belong to producers this wave did not touch; `$12D430` alone is 14,104.
- **`$268594`** (type `$10`, 90 streams, 51.8 KiB) is NOT shipped, deliberately
  — no ported code reads it. §1.1.
- **The colour half is still packed cartridge words**, not a decode. That is
  what would retire the three `PUBLISH_VERBATIM` entries and it is a wave. §3.
- **`verifyCoverage` still walks only the CAPTURE's records.** `43-plan` E2 asks
  for it to walk the PORT's; that needs a `Game` run and does not belong inside
  `loadBundle`. The port-side coverage assertion is in `webgate`'s W47 stage
  instead, with stated measured numbers. **This is a deliberate deviation from
  the plan, named rather than quietly skipped.**
- **The R6 contention question is still open.** The sprite queue is 209 KiB
  against the background's 510 KiB and its first deadline is looser, so the
  HEAD of the queue is fine; the tail is analysed by nobody, exactly as
  `41-recon` §7.7 left it.
- **`games/gradius/` was not touched.**

## LOG (appended as findings arrive)

- opened.
- §1 [M]: **the diagnosis's cause is confirmed from the cartridge.** 64-entry
  hull table and 32-entry turret table, adjacent, both ends pinned; 2 of 64 and
  32 of 32 in the sheet; the 62 missing hulls are 27.1 KiB gz, to the digit.
- §1 CORRECTION 1 [M]: **`$26990E` is 70 entries / 116.7 KiB, not 24 / 37.3.**
  The extent was already pinned in `handlers.js:2313` by the handler's own wrap
  constant ($230/8) and by the code at `$269B3E`.
- §1 CORRECTION 2 [M]: **the hull table emits 21,147 records in 1,000 frames --
  the SAME count as the turret, one of each per tank -- and 16,953 of them DRAW.**
  The diagnosis's "4,002 emitted / 0 drawn" row is the missing subset wearing
  the whole table's label. 4,194 MISSED is the number this wave has to move.
- §1 CORRECTION 3 [M]: the hulls are **35.9 %** of every missed record in the
  6,185-frame run (55,574 of 154,831), not 23.6 % -- the diagnosis priced a
  sub-range that stops below the table's own entries 46..63.
- §1.1 [M]: two more tables a PORTED handler reads and nobody had counted --
  `$2970D8` (type `$24`, 16, 23.9 KiB) -- and one that must NOT ship:
  `$268594` (type `$10`, 90 missing, 51.8 KiB) is read by no ported code and
  emitted 0 times in 6,185 frames.
- §1.2 [M]: first-need per table, which is what the shard order is cut on.
- [M] BOOT BEFORE THIS WAVE: **475.2 KiB** (`export-web.mjs`'s own figure, this
  tree, re-run today). Not the 470.0 KiB of W41 or the 472.1 of W44:
  `player.tables.json.gz` grew 129,563 -> 132,744 B when W45 exported the laser
  tables.
- §2 [M]: **the delivery decision.** Six sprite shards over one packed address
  space; shard 0 is byte-identical to what shipped before (so `capture.bin` and
  `bundlegate`'s pixels cannot move); the 212 harvested streams are five
  DEFERRED shards cut by MEASURED first need, queued at boot and **promoted by
  the page's own miss guard**. A record whose shard is in flight names the
  SHARD; a record with no art anywhere names the ADDRESS.
- §2.4 [M]: **BOOT 475.2 -> 473.7 KiB. It went DOWN while 212 streams of art
  were added**, because the 378-triple stream table left the uncompressed
  `manifest.json` (11,922 B of pretty JSON) for `spr/streams.u32.gz` (2,219 B).
- §2.3 [M]: the failure mode, in Chrome: with the shard withheld the page ran
  and stopped at **lf2458 -- the exact first frame that asks for a hull** --
  naming the shard, both files and what it holds. **And that screenshot found a
  defect**: the error panel headline read "$268B9E IS NOT PORTED YET", because
  `showError` scrapes the first `$xxxxxx` out of any message. A missing FILE was
  being reported as an unported ROUTINE. Fixed and red-validated.
- §3 [M]: **the ROM-leak guard refused to build.** Three colour shards are
  verbatim slices of `cave_a04401w064.u7` -- not because they are more
  cartridge-y than the sheet that has shipped since wave 7, but because those
  tables' streams are CONSECUTIVE while the boot sheet's 166 are scattered.
  Taken as `PUBLISH_VERBATIM` with a reason each rather than reordering bytes to
  silence a guard, and the real alternative (decode the colour half, -9.7 % gz)
  is named. **The list went from one entry to four; that is the owner's call to
  reverse.**
- §4.1 [M]: **the new gate stage COULD NOT FAIL as first written.** With the
  hull harvest cut to 16 entries -- a bundle carrying a quarter of the tank art
  -- it reported "2310 drawn of 2310" and PASSED. It now asserts three absolute
  measured numbers (67 streams, 4,194 records, 32 distinct images) and the same
  mutation goes red.
- §4.2 [M]: 17 unit mutations, each turning ONE named test red, every restore
  hashed byte-identical; **one recorded as a DEFECTIVE MUTANT** (its anchor
  matched `BgShards` first).
- §4.3 [M]: three exporter extent mutations seen red against the cartridge.
- §4.5 [M]: **THE RESULT. Same 6,185-frame run: the hull table 74,826 emitted /
  19,252 drawn -> 74,826 / 74,826; missed records 154,831 -> 85,897 (-44.5 %);
  distinct missing addresses 326 -> 192; first orphan lf2458 -> NONE**, and not
  one stream of any harvested table left in the miss set.
- §4.6: E2's done-when as the plan wrote it is **NOT met** -- the "0 skipped for
  N seconds" figure is still 5.32 s because the first miss is a BACKGROUND
  element. Said plainly rather than reported as green.
- §5 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER. At +15 s -- the frame the
  diagnosis photographed as lone gun barrels -- SEVEN COMPLETE TANKS on visibly
  different headings, every turret independently aimed at the ship.** At +10 s,
  eleven. The page's status line names no hull address at any of ten sample
  times over 30 s. And with shard 1 held back 26 s the SAME page shows the bug
  and then fixes itself.
- §6.5 [M]: **`pgm.py check` ALL GREEN 49/0/0, 0 SKIPPED**; unit tests
  585 -> 606; `webgate` 7 of 7; **`bundlegate` 15955968/15955968 = 100.0000 %,
  unchanged**; `build-dist` clean with 4 deliberate exceptions.

status: **DONE**

---

## 8. PUBLISHING IS BLOCKED, AND NOT BY THIS WAVE — for whoever picks it up

`node tools/publish.mjs` **refused to deploy**, at the FIRST stage, before it
reached DaiOuJou at all:

```
FAILED at stage: unit-tests
REFUSING TO PUBLISH: "batman gate" failed.

not ok 508 - games/gradius/game.json: schema and paths
  code.note -> games/gradius/`entry` STAYS NULL ON PURPOSE. ... exists on disk
```

**[M] It is `games/gradius/game.json`, landed at 23:00 today by the concurrent
Gradius wave (`aedb7c5` "Gradius W41: a start screen, nineteen mods").**
`games/batman/tests/registry.test.js:110-129` walks every `code.*` key and
asserts it names a file that exists, skipping keys that match `/Note$/` --
`romNote`, `frameHzNote`, `entryNote`, `pageNote`. The new manifest uses the
bare key **`note`**, which does not match that pattern, so 500 characters of
prose are being checked for existence as a filename.

**I DID NOT TOUCH IT.** `games/gradius/` belongs to another agent this session
and `games/batman/tests/` is not this wave's either. The fix is one character in
either place (`note` -> `entryNote`, or widen the test's convention) and it is
theirs to choose.

**Everything DaiOuJou's own publish stages check is green** and was run
separately: unit tests 606/0/0, `bundlegate` 100.0000 %, `webgate` 7 of 7. The
bundle on disk is the one that would ship.
