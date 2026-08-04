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
