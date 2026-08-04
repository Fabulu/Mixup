# 47 — IMPL: THE ART THE PORT ASKS FOR, BY ADDRESS (enemy layer, wave E2)

status: **IN PROGRESS**

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
