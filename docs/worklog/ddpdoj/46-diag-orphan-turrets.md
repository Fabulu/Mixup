# 46 — DIAG: TURRETS WITHOUT TANK BODIES

status: **DONE**
started: 2026-08-04. role: DIAGNOSIS. **READ-ONLY on `games/ddpdoj/src/` and
`tools/`** — the laser wave is the sole writer there. This file is the only
thing I write, and only it is committed.

target: `ddpdojblk` VERSION-B. Every address is build B.
`[M]` = measured by me, this session, on this tree.

## 0. THE REPORT

The owner loaded the live page (build `20260804185301`, wave 44 / E1):

> "Daioujou has lots of turrets running around targetting you... without tank
> bodies. Sometimes the tank bodies then appear a bit after"

So the turret draws and tracks correctly; the BODY it sits on is missing, and
sometimes arrives late rather than never.

## 1. THE CAUSE, IN ONE TABLE

**It is E2 — ART, BY ADDRESS. It is not E1's render path, not a latency
difference, not bucket order, and not an unported producer.** The body producer
is wired, running, and emitting a correctly positioned, correctly ordered record
every frame. **The sheet simply does not contain the picture, and the guard is
naming every one of them.**

Enemy type `$11` — **104 of stage 1's 339 spawn records, the most common enemy in
the stage** — draws itself from TWO ROM tables, both read by
`src/handlers.js`'s `fire11`/`draw11`:

| | ROM table | index | emitted at | entries | **in the shipped sheet** |
|---|---|---|---|---:|---|
| **HULL / BODY** | `$268B9E` | **HEADING** — `d1 = (($1A,A6) & $3E) << 2`, +4 on the mirror bit | `$2689BC` writes `($A,A6)`, drawn by the record-convention stub `($2A,A5)` at `$2689C6` | **64** | **[M] 2** |
| **TURRET** | `$268C9E` | **FACING** — `((($33,A5)+1) & $3E) * 2`, the slewed aim | `$268A54` writes `($22,A5)`, drawn by the register-convention stub `($2E,A5)` in `draw11` at `$268A72`, size `#$620` = 3x32 | **32** | **[M] 32** |

```
[M] h11_fire  $268C9E, 32 entries: 32 IN THE SHEET, 0 NO ART
    $1676B4 $167718 $16777C $1677E0 ... $1682D0   (stride $64)

[M] h11_main  $268B9E, 64 entries:  2 IN THE SHEET, 62 NO ART
    IN:  [44] $166EE4   [45] $166F48
    OUT: [0..43] $165DB4 $165E18 $165E7C $165EE0 $165F44 $165FA8 $16600C
                 $166070 $1660D4 $166138 $16619C $166200 $166264 $1662C8
                 $16632C $166390 $1663F4 $166458 $1664BC $166520 $166584
                 $1665E8 $16664C $1666B0 $166714 $166778 $1667DC $166840
                 $1668A4 $166908 $16696C $1669D0 $166A34 $166A98 $166AFC
                 $166B60 $166BC4 $166C28 $166C8C $166CF0 $166D54 $166DB8
                 $166E1C $166E80
         [46..63] $166FAC $167010 $167074 $1670D8 $16713C $1671A0 $167204
                 $167268 $1672CC $167330 $167394 $1673F8 $16745C $1674C0
                 $167524 $167588 $1675EC $167650
```

**The body table is 64 entries, not 32**, and that matters for E2's harvest:
`d1 = (d7 & $3E) << 2` spans 0..$F8 and the mirror path adds 4, so the whole
`$268B9E..$268C9A` block is reachable and `$268C9E` is exactly where the turret
table begins. `src/handlers.js:181-184`'s comment calls both "16-direction"
tables; **[M] they are 64 and 32 longwords.** A harvest that trusts "16" would
ship a sixteenth of the body art and leave the same bug in place.

## 2. WHY IT LOOKS LIKE LATENCY — "sometimes the bodies appear a bit after"

**Because the two tables are indexed by DIFFERENT THINGS, and only one of them
moved during the recording the sheet was harvested from.**

- the **turret** is indexed by **FACING**, which tracks the player. Over the
  161 recorded frames the recorded turrets swept the whole circle, so all 32
  facing images are in the sheet.
- the **hull** is indexed by **HEADING**, i.e. which way the tank is driving.
  The recording's tanks drove one way, so **[M] exactly two of the 64 heading
  images were ever drawn: entries 44 and 45.**

So a body is not late; it is **present only while its tank happens to be on
heading 44 or 45**, and it blinks out the moment the tank turns off them. From a
seat in front of the page that reads exactly as "sometimes the tank bodies then
appear a bit after".

**[M] It is visible at boot.** The page's own seed starts inside the recording's
window, so at lf2000 every tank is on heading 45 and **every body draws**:

```
[M] lf2000 -- 23 records, 0 missed. Seven complete tanks:
  [ 0] $166F48 3x32 c10 at (388,35)  draws     <- HULL, heading 45
  [ 1] $167CF4 3x32 c10 at (396,35)  draws     <- TURRET, facing 16
  [ 2] $166F48 3x32 c10 at (409,66)  draws
  [ 3] $167CF4 3x32 c10 at (417,66)  draws
  [ 4] $166F48 ... [ 5] $167C90 ...  [ 6] $166F48 ... [ 7] $167DBC ...
  ...
```

Every pair is **hull at x, turret at x+8, same y**, hull in the LOWER list slot
and the turret in the next one — and a higher list index draws IN FRONT
(`spritelist.js`), so the turret correctly sits on top of its hull. **The
geometry and the z-order are right.** Only the picture is missing.

## 3. THE MEASUREMENT

**[M] 1,000 logic frames from the shipped seed, nothing pressed, the page's own
`portSpriteList` and the page's own map:**

```
TURRET records ($268C9E's 32 streams)   21,147 emitted   21,147 DRAWN  100.00 %
BODY   records ($268B9E's 64 streams)    4,002 emitted        0 DRAWN    0.00 %

first frame with any type-$11 TURRET record:  lf2000  (7 records, 7 drawn)
first frame with any type-$11 BODY   record:  lf2458  (2 records, 0 drawn)

FIRST ORPHAN: lf2458 -- 28 turret records, all drawn; 2 body records, none drawn
   BODY $166840 3x32 c10 at (453,88)  slot 0
   TURRET $167C2C 3x32 c10 at (461,88) slot 1     delta (8,0)
   BODY $1662C8 3x32 c10 at (209,-65) slot 4
   TURRET $167970 3x32 c10 at (217,-65) slot 5    delta (8,0)
```

**lf2458 = +7.75 s from boot.** Before it the tanks are still on the recorded
heading and are whole; after it they start turning and the hulls go.

Over the 6,185-frame run in `44-impl-E1-render.md`: **[M] 39 distinct missing
streams lie in `$165D00..$166FFF` and they account for 36,590 of the 154,831
missed records — 23.6 % of every miss in the whole run is a tank hull.** The
first is `$166840` at lf2458.


## 4. THE PORT IS ASKING FOR THE RIGHT PICTURE — the alternative I had to kill

The obvious rival explanation is that the port's heading arithmetic is wrong, so
it asks for a hull image the recording never drew, and the whole thing is a
handler defect rather than an art gap. **[M] It is not.**

The capture is 161 board frames from the same seed. Its records are re-based, so
inverting `manifest.spr.streams` turns them back into cartridge addresses and the
BOARD's own hull choices become readable:

```
[M] BOARD hull indices used over all 161 recorded frames:  44 45
[M] PORT  hull indices used over the same window        :  44 45
```

**The board only ever drove those tanks on two of the 64 headings, and the port
drives them on exactly the same two.** That is why precisely entries 44 and 45
are in the sheet, and it is the whole mechanism in one line.

Stronger, because the board's key carries the TANK COUNT as well as the index:

```
[M] the board's hull key is non-empty on 161/161 frames, takes 29 DISTINCT
    values (45x7, 45x8, 44x8, 45x9, ... 44x29) and CHANGES on 54 of the 160
    frame boundaries -- so this is not a constant being compared with itself
[M] port vs board, hull index AND live-tank count:
        lag 0 -> 67/161      lag 1 -> 107/161      lag 2 -> 160/160
```

**160 of 160 exact.** The port's enemy layer is choosing the same hull image for
the same number of tanks as the board did, frame for frame. Nothing is wrong with
the producer.

**The turret comparison is INVALID BY CONSTRUCTION and I am not reporting it as a
divergence.** The turret index is the slewed aim at the PLAYER; the recording is
`fly-around` with real inputs and my run presses nothing, so the two ships are in
different places and the turrets are correctly pointing at different things
(3 / 6 / 10 of 161 at lags 0 / 1 / 2). The hull is the tank's own heading and
depends on no input, which is why it is comparable and the turret is not.

## 5. AN OPEN FINDING FOR A LATER WAVE — E1's HOLD MAY BE ONE FRAME SHORT

**[M] the lag sweep above is the first time anything on this project has compared
the PORT's own `$800000` list against the BOARD**, and it does not favour the lag
the page uses: **lag 2 matches 160/160, lag 1 matches 107/161, lag 0 matches
67/161.**

**THIS IS NOT THE CAUSE OF THE OWNER'S BUG AND MUST NOT BE "FIXED" ON THIS
EVIDENCE.** At every lag the hull index is 44 or 45, both in the sheet: a phase
error cannot make a hull disappear. And the evidence is not yet decisive:

- `webgate`'s W44 hold check passes at lag 1, but it compares the port's list
  against the port's OWN `prevPos`. It pins the page's INTERNAL consistency and
  would be equally satisfied at lag 2 against the position two frames back. It is
  not a measurement against the board.
- `render/capture.js`'s measured lag of 1 is between the RECORDING's sprite
  buffer and the RECORDING's own main RAM. Whether the port's `logicFrame`
  counter is in phase with the recording's `lf` on this signal is a THIRD
  question nobody has measured, and it is the one that decides this.

**What settles it:** compare the SHIP's drawn position against the board at each
lag — `pgm.py demogate` / `shipgate` already have the machinery. Until that is
done this is one measurement against one, and changing the page on the strength
of the newer one would be exactly the mistake this project keeps writing down.

## 6. THE OTHER BODY TABLES — E2's shopping list, priced

Same measurement over every sprite-pointer table the ported handlers read.

| ROM table | what | entries | in the sheet | **missing** | **gz** |
|---|---|---:|---:|---:|---:|
| `$268C9E` | type `$11` TURRET, facing | 32 | **32** | 0 | 0 |
| `$269BB6` | `FAM.anim4`, four longs | 4 | **4** | 0 | 0 |
| `$268B9E` | **type `$11` HULL, heading** | **64** | **2** | **62** | **27.1 KiB** |
| `$269E48` | `$07`/`$27` family BODY, heading | 32 | 5 | 27 | 9.8 KiB |
| `$272E7A` | type `$89` BODY, facing-slewed | 32 | **0** | 32 | 30.5 KiB |
| `$26990E` | type `$31` animation, stride 8 | 24 | **0** | 24 | 37.3 KiB |
| | **all five together**, shared colour counted once | | | **145** | **105.7 KiB** |

**[M]** gzip -9 over the coalesced word ranges, extents from the ROM chain via
`src/render/spritedir.js streamExtent` — the same packing `tools/export-web.mjs`
does. For scale: today's whole sprite sheet is **39.3 KiB gz** and boot is
**472.1 KiB**.

**The single highest-value 27 KiB in this project right now is `$268B9E`'s 62
missing hulls.** Type `$11` is 104 of stage 1's 339 spawn records, and those
streams are **36,590 of the 154,831 missed records — 23.6 % of every miss in the
whole 6,185-frame run** (`44-impl-E1-render.md` §3).

**AND THE TABLE SIZES ARE A TRAP FOR E2.** `src/handlers.js:181-184` calls both
`SPRITE_TAB` entries "16-direction sprite-pointer tables". **[M] they are 64 and
32 longwords**: `$2689A0` builds `d1 = (($1A,A6) & $3E) << 2`, which reaches
`$F8`; `$2689B4` adds 4 on the mirror bit; and `$268C9E` — the turret table —
begins exactly where `$268B9E + $100` ends. A harvest sized off that comment
would ship a quarter of the hull art and leave the owner's bug in place.

## 7. THE PAGE, IN A REAL BROWSER — the report, seen

Chrome + playwright over `python -m http.server`. Screenshots at five times.

```
[M] boot  lf2051  [port] dl 35 drawn 35 b0 30                     (no misses)
[M] +5s   lf2303  [port] dl 68 drawn 68 b0 60                     (no misses)
[M] +10s  lf2569  [port] dl 62 drawn 50 b0 50  NO ART 12: $166840x3 $1662C8x2
[M] +15s  lf2880  [port] dl 40 drawn 21 b0 26  NO ART 19: $1662C8x6 $166264x3
[M] +23s  lf3353  [port] dl 50 drawn 16 b0 16  NO ART 34: $12C7B0x8 $12D430x8
```

**The page names the tank hulls on its own status line.** `$166840`, `$1662C8`
and `$166264` are entries 27, 13 and 12 of `$268B9E`.

- **+5 s (lf2303): about twenty-eight COMPLETE tanks** — hull and turret — in
  formation on the road. Nothing missing, because every tank is still on the
  recorded heading.
- **+15 s (lf2880): lone gun barrels standing on the pavement**, five or six of
  them around the ship, each with its shadow and no vehicle underneath. That is
  the owner's sentence, on the glass.

The turrets are the right size, the right colour, in the right places and
tracking. There is simply nothing beneath them.

## 8. THE FOUR CANDIDATES, ANSWERED

| # | candidate | verdict |
|---|---|---|
| 1 | different producers, different LATENCY | **RULED OUT.** [M] the hull and its turret are in the SAME frame's list at ADJACENT SLOTS — hull slot N at x, turret slot N+1 at x+8, same y. E1's one-frame hold applies to the whole list at once and cannot separate them |
| 2 | the body's art is in the MISS SET | **THIS IS IT.** [M] 2 of 64 hull streams shipped; 4,002 hull records emitted in 1,000 frames, **0 drawn**; 21,147 turret records, **21,147 drawn** |
| 3 | bucket ordering / z-order | **RULED OUT.** [M] both are bucket 0, adjacent slots, hull in the LOWER index — and a higher index draws in front, so the turret correctly sits on top of its hull. The order is right |
| 4 | a body producer that is not wired | **RULED OUT.** [M] it is wired and running: `$2689C6` emits the hull through `($2A,A5)` every frame, 4,002 records, correctly positioned, and the guard names every one |

## 9. VERDICT — WHICH WAVE FIXES IT

**E2 — THE ART HARVEST, BY ADDRESS. Nothing else.**

`43-plan-enemy-layer.md` E2's scope is already exactly right ("harvest by ROM
address — the mechanism `export-web.mjs` already uses for the ship's 16 tilts").
What this diagnosis adds is a **specific, priced, 27.1 KiB first item that
removes the owner's complaint on its own**, and the warning that the tables are
64 and 32 entries rather than the 16 the source comment claims.

**E1's render path is correct and there is NO one-line fix that belongs in it.**
I looked for one, and I am saying plainly that I did not find one:

- It could not draw the hull. The art is not in the bundle.
- It **must not** substitute a neighbouring heading's image. That is exactly the
  "no modulo, no clamp, no nearest-stream" rule `43-plan` §5 D4 sets, and a tank
  drawn facing the wrong way is the failure mode this project pays most for: a
  picture that looks nearly right and lies.
- **It must not hide the orphaned turret either**, tempting as that is. A
  hardware sprite record carries no grouping — nothing in it says "this turret
  belongs to that hull". Suppressing a drawn record because some OTHER record was
  skipped would make the page invent that relationship, and it would hide exactly
  the evidence that produced this diagnosis.

The one change that does belong in `src/handlers.js` is a COMMENT, and it is
load-bearing for E2 rather than cosmetic. **NOT APPLIED — the laser wave owns
`src/` right now:**

```
  src/handlers.js:180-184, replace

      // 16-direction sprite-pointer tables, by handler (ROM addresses, build B)
      const SPRITE_TAB = {
        h11_main: 0x268b9e,   // $2689B6 lea (heading -> sub +$0A sprite)
        h11_fire: 0x268c9e,   // $268A4E lea (facing -> record +$22 sprite, post-slew)
      };

  with

      // Sprite-pointer tables, by handler (ROM addresses, build B).  NOT
      // "16-direction": [M] W46 measured the extents from the index arithmetic
      // and the two tables' adjacency.  h11_main is 64 LONGWORDS
      // ($268B9E..$268C9A) -- $2689A0 builds d1 = (($1A,A6) & $3E) << 2, which
      // reaches $F8, and $2689B4 adds 4 on the mirror bit -- and h11_fire is 32
      // ($268C9E..$268D1A), from $268A46's ((($33,A5)+1) & $3E) * 2.  The two
      // are adjacent, which is what pins h11_main's end.
      //
      // THE SHIPPED SHEET HOLDS 32 OF 32 h11_fire AND 2 OF 64 h11_main (entries
      // 44 and 45), because the turret tracks the PLAYER and swept the whole
      // circle during the 161-frame recording while the tanks all drove one way.
      // That is why the page draws turrets with no hulls under them
      // (46-diag-orphan-turrets.md).  E2 must harvest 64, not 16.
      const SPRITE_TAB = {
        h11_main: 0x268b9e,   // $2689B6 lea -- 64 entries, HEADING
        h11_fire: 0x268c9e,   // $268A4E lea -- 32 entries, FACING, post-slew
      };
```

## 10. WHAT I DID NOT DETERMINE

1. **Whether 64 is the whole of `$268B9E`.** It is pinned from ABOVE by the index
   arithmetic ($F8 + the mirror's 4 = entry 63) and from BELOW by `$268C9E` being
   the next table. I did not read the data past `$268C9A` to confirm there is no
   further continuation, and `43-plan`'s own standing rule about reading past the
   apparent end applies to tables too.
2. **The other handlers' tables beyond the five above.** `$26990E`'s 24 entries
   are my reading of a 6-byte-entry / stride-8 walk (`animStep31`); I did not
   find where it ends. Types `$80`, `$85`/`$86` and the midboss have their own
   sprite pointers that I did not enumerate — the 326-address miss set in
   `44-impl-E1-render.md` §3.3 is still the complete list, and this file
   explains 145 of them.
3. **Whether the hulls will look RIGHT once shipped.** Same limit as E1: nothing
   here is compared against MAME pixels. What §4 proves is that the port asks for
   the same stream ADDRESS the board asked for, 160 of 160 frames — which is a
   great deal more than E1 could say, and still not a pixel comparison.
4. **The lag question in §5**, deliberately left open with the measurement that
   raises it and the measurement that would settle it.

## LOG (appended as findings arrive)

- opened.
- §1 [M]: **THE CAUSE. Type $11's TURRET table `$268C9E` is 32 of 32 in the
  shipped sheet; its HULL table `$268B9E` is 2 of 64.** The turret is indexed by
  FACING (which swept the whole circle during the recording), the hull by
  HEADING (which did not). E2, art, by address.
- §1 [M]: and the hull table is **64 entries, not the 32 (or the "16" in
  `handlers.js`'s comment)** — `d1 = (d7 & $3E) << 2` reaches $F8 and the mirror
  adds 4. E2 must harvest 64.
- §2/§3 [M]: 1,000 frames — turret records **21,147 / 21,147 drawn**, hull
  records **4,002 / 0 drawn**. First orphan lf2458 (+7.75 s). Hull at x, turret
  at x+8, hull in the lower list slot: **geometry and z-order are correct.**
- §4 [M]: **the rival explanation is dead.** The BOARD's own recording uses hull
  indices 44 and 45 and NOTHING ELSE over all 161 frames, and so does the port.
  Port vs board on hull index AND live-tank count: **160/160 at lag 2**, 107/161
  at lag 1, 67/161 at lag 0, over 29 distinct keys that change on 54 of 160
  boundaries. The producer is right; the sheet is short.
- §5 [M]: an OPEN finding, not this bug — that lag sweep is the first
  port-vs-board comparison of the `$800000` list ever made here and it favours
  lag 2 over the page's lag 1. **Not to be acted on alone**; §5 names what would
  settle it.
- §6 [M]: priced. **62 missing type-$11 hulls = 27.1 KiB gz** and they are 23.6 %
  of every missed record in the 6,185-frame run. All five body tables = 145
  streams / 105.7 KiB. And the tables are **64 and 32 entries, not the 16**
  `handlers.js` claims — a trap for E2's harvest.
- §7 [M]: seen in the browser. At +5 s, twenty-eight whole tanks; at +15 s, lone
  gun barrels on the pavement and `NO ART 19: $1662C8x6 $166264x3` on the page's
  own status line.
- §9: **E2 fixes it.** E1's render path is correct and I found no one-line fix
  that belongs in it; the one change that does belong in `src/` is a COMMENT,
  written out in §9 and NOT applied.

status: **DONE**
