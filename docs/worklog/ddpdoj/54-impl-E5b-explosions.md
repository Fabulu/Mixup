# 54 — IMPL E5b: THE ENEMY DEATH EXPLOSION (pool B, `$289004` + `$288E4E`)

status: **IN PROGRESS**

started: 2026-08-05
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

brief: the owner is playing the live build — "Shooting enemies with bullets
works, but you can't see the bullets and no explosions." E4 made the bullets
visible; E5a made the shot's impact spark visible. **Mine is the DEATH
EXPLOSION** — the thing that happens when an enemy actually dies.

inputs read in full: 53-impl-E5a-spark, 50-recon-effects, 47-impl-E2-art,
52-impl-E4-bullets, HANDOVER, `docs/knowledge/09` and `10`.

`[M]` = measured by me, this session, on this tree.

---

## 0. THE BRIEF'S PREMISE, CHECKED

Recon 50's SHAPE is right and I reproduced its headline numbers to the digit —
which is itself worth saying, because W53 found five of its statements about
pool E wrong. Everything below about pools B and D is reproduced independently
from `maincpu.bin` this session.

### 0.1 RECON 50, REPRODUCED EXACTLY  [M]

```
[M] $221520 + 34*8 == $221630                                       EXACT
[M] $221630 + 34*8 == $221740 == kind 0's own descriptor list       EXACT
[M] 68 script entries -> 23 DISTINCT scripts, data $221740..$222618
[M] 269 distinct effect streams, $2016B4..$227FA4
[M] IN THE SHIPPED SHEET: 0 of 269                    (783 shipped keys)
[M] priced with the PORT's own streamExtent + coalesce + gzip -9:
        all 269               218.4 KiB gz, 0 unresolvable
        recon 50's "8 kinds"  204 streams, 195.8 KiB gz
[M] $288E0C clears ($8DC+1)*2 = 4,538 B = 80 x $38 + the bit bucket + the
    count word $81C8EA                                              EXACT
[M] $289084 clears ($280+1)*2 = 1,282 B = 20 x $40 + $81CDEC        EXACT
[M] $288FF0 = $23D762 $23D79E $23D7DA $23D816 $23D852, entry [5] is $289004's
    own `movem.l` -- 5 entries, buckets 0,1,2,3,7
[M] $2440E0's 39-entry table $244ACE: $85 x18, $D x17, $84 x3, $C x1
[M] $26B214: 14 records, terminator $FFFF at $26B284
```

### 0.2 AND SIX THINGS IN IT ARE WRONG  [M]

| recon 50 / the brief says | [M] this session |
|---|---|
| "the eight distinct kinds the port reaches: `$1 $2 $3 $7 $C $D $84 $85`" | That is what its RUN reached. **STATICALLY, from the listing, the port's OWN ported arms can pass TEN**: `$1 $2 $3 $4 $5 $7 $9 $C $D $84 $85` — eleven, once `$4` below is fixed. `$5` is `$275B20`'s (`handlers.js:1067`, ported since W30) and `$9` is two entries of the midboss's own `$26B214` list. Recon 50 priced 204 streams for a set the port can already outrun. **This wave harvests all 269 instead** (§3). |
| "every death arm I read writes `move.w #$0,($12,A0)`" (§4.2, the leak argument) | **[M] SIX of them write `#$1`** — `$273DDA $273E0E $273E42 $273E7A $273EB2 $273EEC`, all inside type `$80`'s death arm — which asks pool D for **TWO** records, not one. And **type `$11`'s death arm then puts `$FFFF` BACK** at `$26888A` when `$815EA2` is already set, i.e. it DISARMS the sub-spawn on the second effect of a frame. The leak is real and its rate is not the one recon 50 computed. |
| the port's own note: type `$10`'s death arm is `D0=$7` (`handlers.js:677`) | **[M] `$2681D6 moveq #$4,D0`. It is kind `$4`, not `$7`.** A defect in a comment that would have shipped the wrong explosion for every type-`$10` kill — and kind `$4` is not in recon 50's eight either. |
| `$28925E..$28960F` is "434 bytes I did not find the table that reaches it" (§10.3) | **It is not reached by a table. `$28915A bpl $28925E` and `$28915E bra $289292` branch to it directly**, out of `$289152 tst.w ($1e,A6)`. Recon 50 looked for a dispatch and the answer is a conditional branch two instructions earlier. |
| pool D core is "474 B, 4 routines" | **[M] far larger.** `$2890F2`'s body runs to `$2892D8`, then `$2892DA..$28930A` (a vector solver), `$28930A..$2893CF` (a 4-arm quadrant jump table at stride $40), `$2893D0..$2894D0` (128 words of `i*8`), `$289610..$289657`, and the FILL `$289658..$2897FB` with its own 5-entry dispatch `$289644`, its 4-entry list table `$2897D0` and **five 144-byte templates `$289810..$289AE0`**. It reads a pointer table at **`$200920`** whose extent nothing pins, and calls `$241E34 $24397A $242FDE $242EC2 $242CAC $2431F4 $242B3C`. **~1,800 B of code and tables plus an unpinned window plus its own unpriced art.** §4. |
| `$81C8EA` is "re-counted each frame, `addq.w #1` per live slot" | True, **and the `addq` is AFTER the spawn-delay skip** (`$288E64`/`$288E74`), so a record still counting down its `($18,A6)` delay is LIVE, occupies a slot, and is NOT in the count. Any census that trusts `$81C8EA` alone under-reports the pool. Mine scans all 80 slots as well. |

### 0.3 `$289004`'s OWN DEAD BRANCH, and its range check  [M]

```
289008: move.w D0,D1 / andi.w #$7f,D1
28900e: cmpi.w #$0,D1 / blt $289078      <- D1 is masked to 0..$7F, so `blt`
                                            CANNOT be taken.  Transcribed and
                                            named, never exercised.
289016: cmpi.w #$21,D1 / bgt $289078     <- kinds $22..$7F (and $A2..$FF) go to
                                            THE BIT BUCKET.  34 entries.
28901e: move.w #$4f,D1                   <- and D1 is REUSED as the 80-slot loop
                                            counter, so the checked value is
                                            never read again.  The KIND lives in
                                            D0, whose bit 7 picks table $221630.
```

---

## LOG (appended as findings arrive)

- opened.
- §0.1 [M]: **recon 50's pool-B numbers reproduce EXACTLY** — 68 entries, 23
  scripts, 269 streams, 0 of 269 in the sheet, 218.4 KiB gz for all of them and
  195.8 KiB for its eight kinds, and both pool clears closing on their count word.
- §0.2 [M]: **six corrections.** The port's ported arms can pass ELEVEN kinds,
  not eight; six death-arm sites arm pool D for TWO records rather than one and
  type `$11`'s DISARMS it again; **the port's own note calls type `$10`'s death
  kind `$7` and the ROM says `$4`**; recon 50's unresolved `$28925E` is reached
  by a branch, not a table; pool D is far bigger than 474 B and reads a window
  nothing pins; and `$81C8EA` excludes spawn-delayed records.
