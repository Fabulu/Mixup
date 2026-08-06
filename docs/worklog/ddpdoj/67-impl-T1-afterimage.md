# 67 - IMPL T1: THE SHIP'S AFTERIMAGE TRAIL (`$253604`, BUCKET 12)

*(the brief calls it SIX-DEEP. `[M]` the listing says **FIVE** records off a
**SIXTEEN**-long ring - §1.)*

status: **DONE** - **THE OWNER CAN SEE THE TRAIL.** `[M]` in Chrome, local AND
on the live build `20260805175616`: hold fire until the beam is up, bank left,
and **five overlapping blue ghost ships** hang off the ship - its own picture at
the positions it held 3, 6, 9, 12 and 15 draw calls ago, drawn behind it.
**Bucket 12: 0 -> 3,597 records, 3,597 DRAWN, 0 named-missing, 17 distinct
streams, NO NEW ART.** The check this wave leaves is **the PRODUCER CENSUS**
(`tools/w67trailgate.mjs`), which asks the cartridge which buckets a ported
routine can feed and requires the port to fill every one - run against
W12..W66's tree it names bucket 12 and measures zero. 934 unit tests (was 922),
webgate 17/17 and bundlegate 100.0000 % unmoved, 11 of 11 mutants red,
**and two of my own checks could not fail.** The gate's one red row is a
concurrent wave's (§5.3, proven).

started: 2026-08-05
wave: 67. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
`games/gradius/` NOT TOUCHED.

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.

brief: port `$24A53E jsr $253604` - the ship's six-deep afterimage trail into
bucket 12, bucket 12's ONLY producer in the cartridge, unported. W55 §4.3 is the
source of every claim in the brief.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `55-diag-invisible-content.md`, `66-impl-E6-bomb-art.md`,
`58-impl-E3-art.md`, `HANDOVER.md`, `docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE BRIEF'S PREMISE, CHECKED - right in KIND, wrong in three NUMBERS

The brief rests on `55-diag` §4.3. It holds where it matters - `$253604` is the
ship's afterimage trail, it is bucket 12's only producer, it needs no new art
and no gate here could see it - and **three of its specifics are wrong**, all
three in the same direction (reading `moveq #$5,D7` as the shape of the thing).

| the brief / W55 §4.3 says | `[M]` this session, from the cartridge |
|---|---|
| a **SIX**-deep trail, "up to six extra records per frame" | **FIVE.** `dbra` runs the body six times, but the sixth reads `tst.w D7` as 0, takes `$253680` - store-the-new-head - and `rts`es. It never reaches `$2536AA`. `[M]` measured: a 1,500-frame held-fire run's records-per-frame histogram is `{1:2, 2:1, 3:2, 4:48, 5:679}`. **Six never occurs** |
| "`$253660 moveq #$5,D7` <- SIX entries" / "its 6-entry ring" | the ring is **SIXTEEN** longs. `$253658 lea ($40,A1),A1` walks past `$40` bytes, the shift moves exactly 16 slots (1 + 5x3), and the initialiser `$2536B6` fills 16 (`moveq #$f,D0`). The five records are **taps at slots 15, 12, 9, 6 and 3** - the ship as it was 3, 6, 9, 12 and 15 calls ago |
| "`$2536AA` … BUCKET 12" and bucket 12 has ONE producer | **CONFIRMED, twice, and there is a SECOND STUB.** `xref.py callers 23FDB2` -> `$2536AA` only; `callers 253604` -> `$24A53E` only. And `$23FDE8` is a **second** enqueue on the same `$80AF24`/`$80AFEA` pair - the ZOOMING register convention - with **zero** absolute-long callers. `xref.py`'s own rule makes that a lower bound, so it is named, not declared dead |
| "**NO NEW ART IS NEEDED** - verify it" | **TRUE, and now measured rather than argued.** `[M]` the 3,597 records a 1,500-frame run emits ask for **17** distinct streams, `$001200 $001264 … $001840` in steps of `$64` - exactly `$25533A[0]`'s seventeen tilt frames, i.e. the ship's own image. `[M]` **0 named-missing, 0 pending, 3,597 of 3,597 DRAWN** |
| "`tst.b ($3f,A6)` gates it and I did not find the writer … the trail may only run in a state `fly-around` never entered" | **THE GATE IS THE LASER, and it is armed in ordinary play.** `$24C282 move.b #$1,($3f,A4)` sets it the frame the beam's arm-up completes; `$24C2D6 move.b D0,($3f,A4)` clears it on release. It is the same byte `src/player.js` reads at `$249B40` to switch the shot cadence machine off while a beam is up - the port has known this since W45 and called the field `P.dead`. `[M]` on the shipped seed with fire HELD it is set **during step 16** (`$24C164`'s sixteen frames of arm-up, then the latch) and is already 1 when a probe reads it before step 17 - the two numbers in this worklog are the same event sampled either side of `Game.step` |
| W55 §6: "the board draws ZERO colour-31 records" (in 161 captured frames) | **CONSISTENT, NOT CONTRADICTORY.** `$25364A move.w #$1f,D4` really does make the trail colour 31 - and `fly-around` never holds the fire button, so `($3f,A6)` is 0 on all 161 frames and the trail cannot have been in that capture. It is **not** the hitbox box of §6, which is 1x16 at `#$001F/$401F/$201F/$601F`; this is 3x32 at the ship's own offsets |

**AND ONE THING THE PORT ALREADY HAD AND NEVER READ.** The ring INITIALISER
`$2536B6`/`$2536D0` has been ported since W45 - `src/laser.js
seedPositionHistory`, called at `$24C288` on the frame the beam arms. So the
port has been filling two 16-long rings on every laser for twenty-two waves and
**nothing has ever read them.** That is the same shape as E6's finding one wave
earlier: state that was right, with no record ever emitted from it.

### 1.1 READ PAST BOTH ENDS - and the routine next door is the HITBOX BOX

`[M]` **After** `$2536B4 rts` comes `$2536B6`/`$2536D0`, the ring INITIALISERS
(`moveq #$f,D0`, sixteen `move.l ($2,A2),(A0)+` / `($a,A2),(A1)+`) and then
`$2536FA`, the laser's `($60,A4)` ramp - already ported, both of them.
`[M]` **Before** `$253604` is the tail of `$253578`: `move.w #$601F,D4 / jmp
$23F7F4` and a `nop` pad at `$253602`. **That is `55-diag` §6's unreachable
four-corner HITBOX BOX** - the ROM puts it immediately in front of the trail and
both write colour `$1F`, which is very likely why §6 and §4.3 read as one
finding. **They are two routines: the box is 1x16 at `#$001F/$401F/$201F/$601F`
into bucket 22 with no caller of any kind; the trail is 3x32 at the ship's own
offsets into bucket 12 with one.** The `jmp` tail means there is **no
fall-through** into `$253604` - checked because ten incidents say to check.

## 2. BEFORE AND AFTER - BUCKET 12

`[M]` 1,500 logic frames from the shipped seed, **fire HELD** (so `$24C282`
arms the gate) and the ship **sweeping left/right every 60 frames** (so the
`$FF80FF80` coarse-position test can ever be unequal - a stationary ship has no
trail at all, by `$25369C cmp.l D6,D5 / beq`). Probe: `.scratch/t1bucket12.mjs`,
reading `buildDisplayList`'s own `perBucketRecords[12]` and attributing the
`$800000` entries by the cumulative drain boundaries, fillers excluded.

| | BEFORE | AFTER |
|---|---|---|
| bucket 12 records **EMITTED** | **0** | **3,597** on 732 of 1,500 frames, first at frame 18 |
| **DRAWN** (the sheet has the picture) | 0 | **3,597** |
| PENDING on a shard | 0 | **0** |
| **NAMED-MISSING** | 0 | **0** |
| distinct streams | 0 | **17** (`$001200`..`$001840` step `$64`) |

732 of 1,500 is the `$80390C` 50 % duty (`$25368A`), the same one the aura and
the glow are on. The `{4:48, 3:2, 2:1, 1:2}` tail of the histogram is the
coarse-position skip firing as the ship decelerates at each sweep reversal.

**E6's DEFECT SHAPE IS EXPLICITLY EXCLUDED:** the count that moved is the
number of RECORDS IN `$800000`, not a counter in the port - and every one of
them resolved to a picture in the shipped sheet.

## 3. WHAT IS ON THE SCREEN - and it is BLUE

`[M]` Chrome + Python `playwright`, W58/W66's recipe, over a local
`python -m http.server 8791`. **Three controls, because one screenshot of a
busy playfield proves nothing** (my first pass mistook DoDonPachi's magenta
enemy bullets for the trail, and the control shots are what caught that):

```
[M] A  stick swept, NO fire      trail 0     ($3f,A6) never set
[M] B  beam UP, ship STILL       trail 0     $25369C skips all five
[M] C  beam UP, ship MOVING      trail 5     <- the wave
[M] D  beam UP, stick released   trail 0     back to nothing
[M] PAGE ERRORS: none.  60.0-60.2 Hz.  spr 14/14.
```

`trail N` is new on the page's own status line this wave (`src/web/app.js
dlTrail`, `index.html`), for W66 §4's reason: the thing that would have shown
`$253604` missing for fifty-four waves is a number on the page the owner plays.

### 3.0b THE LIVE DEPLOYED BUILD, `20260805175616` - and it AGREES

```
[M] A nobeam+moving  trail 0     B beam+still  trail 0     D stopped  trail 0
[M] C4/C5/C7/C8 beam+moving  trail 5 5 5 5    C9  trail 2
[M] PAGE ERRORS: none
```

**[M] On the live page the ship banks left out of its orange aura and a blue
cascade of ghost ships hangs off its right-hand side** - the same picture the
local build draws, on the machine the owner plays.
Screenshots `.scratch/t1live-*.png`; local `.scratch/t1ship-*.png`.

**[M] BOTH SERVERS-OF-ONE I STARTED WERE KILLED.** `Get-CimInstance
Win32_Process` finds **no `http.server` process anywhere** and there is **no
listener** on 8000, 8766, 8767, 8771 or 8791 - checked by PROCESS and by PORT,
as W61 §6b, W63, W65 and W66 did.

### 3.1 THE PIXELS, ISOLATED - `.scratch/t1pixels.mjs`

Eyeballing a playfield with a bomb aura, a beam and a wall of bullets on it is
not a measurement, so: two identical runs through the page's own `Renderer`,
one with `SHIP_MUTATE='no-trail'` (**which IS the W12..W66 tree**), the same
frame from each, and the difference.

```
[M] frame 400, fire HELD + sweep:  trail records this frame = 5
[M]   the port's list      57 -> 62 records,  drawn 56 -> 61
[M]   PIXELS CHANGED       534 of 100,352  (0.53 %)
[M]   palette INDICES      $03E8..$03FE   -- palette bank 31 x 32 pens = $3E0
[M]   colours              #4A6BE7 #2131E7 #6394E7 #292973 ... a BLUE ramp
[M]   changed region       x 47..72, y 358..400 = 26 x 43 screen px
```

**WHAT I SAW.** With the beam up and the ship banking left, a **staircase of
five overlapping BLUE ghost ships** trails down and to the right of the ship -
the ship's own 48x32 picture, five copies, at the positions it held 3, 6, 9, 12
and 15 draw calls ago, drawn BEHIND it (bucket 12 drains before bucket 19, so
the solid red ship is always in front of its own ghosts). Isolated it is
unmistakably five ship silhouettes in a diagonal cascade; on the live playfield
it reads as a blue motion-blur smear off the ship's tail.
Screenshots: `.scratch/t1px-400-ZOOM.png`, `-ZOOMONLY.png`, `-ON.png`, `-OFF.png`,
and the browser run's `.scratch/t1ship-*.png`, `.scratch/t1sweep-*.png`.

### 3.2 **THE HUE IS NOT VERIFIED, AND SAYING SO IS THE POINT**

`$25364A move.w #$1f,D4` is the cartridge's, so **colour 31 is measured**. What
the blue ramp in bank 31 *is* is not: the port's palette is spliced out of the
161-frame `fly-around` capture, and `55-diag` §6 measured that the board draws
**zero** colour-31 records in it. So the board's own palette bank 31 at that
instant is whatever the game happened to have uploaded, and nothing here has
compared it against a board frame that draws a trail. **The SHAPE, the POSITION
and the COLOUR INDEX are the ROM's; the RGB is the recording's.** No capture in
this repo holds the fire button, so there is no board oracle for this at all.

## 4. A GAP THIS WAVE'S SCENARIO EXPOSED AND DID NOT CAUSE

`[M]` `.scratch/t1missing.mjs`, five inputs x 2,600 frames, each run TWICE --
once as shipped and once with `SHIP_MUTATE='no-trail'`, i.e. the W12..W66 tree:

| input | drawn% BEFORE | drawn% AFTER | named-missing | **streams the TRAIL added** |
|---|---|---|---|---|
| E3's (up, tap, two 120-frame holds per 600) | 100.0 % | 100.0 % | 10 (`$000000` only) | **NONE** |
| fire HELD, no stick | 100.0 % | 100.0 % | 10 | **NONE** |
| fire TAPPED, no stick | 100.0 % | 100.0 % | 10 | **NONE** |
| fire HELD + sweep every 14 | 98.5 % | 98.5 % | 2,240 / 17 streams | **NONE** |
| fire HELD + sweep every 60 | 98.1 % | 98.2 % | 2,483 / 49 streams | **NONE** |

**E3/E6's result is unmoved: 100.0 % and zero missing streams on all three of
their inputs**, and the trail added **zero** missing streams on any input. The
`$000000` x10 is W44's known null-stream over-read guard, present on both trees.

**BUT THE SWEEP INPUTS ARE AT 98 %, ON BOTH TREES, AND NOBODY HAD LOOKED.**
`[M]` attributed by bucket (`.scratch/t1whomiss.mjs`, 2,600 frames):

```
[M] bucket  5  16 streams, 1,258 records   $06501C $065030 $065044 $065058
                                           $06506C $065080 $065094 $0650A8
                                           $0650D0 $0650E4 $0650F8 $06510C
                                           $065120 $065134 $065148 $06515C
[M] bucket 19  32 streams, 1,215 records   $001F48 $001F6C $001F90 $001FB4
                                           $001FD8 $001FFC $002020 $002044
                                           $00208C $0020B0 $0020D4 $0020F8
                                           $00211C $002140 $002164 $002188
                                           $0021AC $0021D0 $0021F4 $002218
                                           $00223C $002260 $002284 $0022A8
                                           $0022F0 $002314 $002338 $00235C
                                           $002380 $0023A4 $0023C8 $0023EC
```

**These are the ship's own GLOW (bucket 19) and its ground SHADOW (bucket 5), in
their TILTED frames** - and they are missing the instant the player banks, which
is most of real play. `55-diag` §5 saw four of them (`$001F48 $0021AC $002188
$0023EC`) and §10 scheduled the whole set as **W57 - ART: THE SHIP AND THE LAST
ENEMIES, 4.3 KiB gz**. `[M]` W57 went to the midboss instead and **the ship's
art wave was never run**; E3 and E6 both reported "zero missing streams" and
both were right, because **their scenarios fly UP and never bank**, so nothing
ever asked for a tilted frame. One scenario is a floor - `55-diag` §7 says so in
its own words, and this is the bill.

**IT IS NOT THIS WAVE'S**, and the control is what says so rather than an
argument: the miss set is byte-for-byte identical with `no-trail`. Handed on,
priced by `55-diag` §2.5 at **b19 29 streams / 2.9 KiB + b5 17 / 0.4 KiB**.

## 5. EVERY CHECK SEEN TO FAIL

`tools/w67trailgate.mjs`, four breaks, each run and each required to redden a
NAMED row. `[M]`:

| break | what goes red |
|---|---|
| `no-trail` - `$253604` emits nothing (**the W12..W66 tree**) | **(B) BUCKET 12 -- the cartridge names 1 site and the port staged 0**, plus (C2) (C3) (C5) (C6) (C7). Six rows |
| `trail-every-phase` - drop `$25368A tst.w $80390C` | (C4): 433 of 864 frames on the aura's phase, 431 on the other (expect 0) |
| `trail-no-coarse-skip` - drop `$25369C cmp.l D6,D5` | (C5): the MOTIONLESS ship emits 2,210 records (expect 0) |
| `census-no-recursion` - do not follow a non-stub call | (A) the census names `[5, 19]` over 8 sites instead of `[5, 12, 19]` over 9, and (A2). **The control that proves the walk, not a typed table, is what finds bucket 12** |

### 5.1 THE UNIT TESTS, MUTATED - 11 of 11 RED, 0 survivors

`.scratch/mutate67.mjs`, W66's rules: ONE edit with a single-occurrence anchor,
ONE check, a NAMED assertion required red, restore, **sha256 verified
byte-identical both ways** (the script throws if a restore does not match).

```
[M] 11 of 11 mutants turned a NAMED test RED; survivors 0
```

| mutated | what went red |
|---|---|
| `d7 = TRAIL.passes` - SIX emitting passes | *FIVE records, not six* + 5 more |
| `pairs = 3` on the first pass - the `bra $253674` entry dropped | *the ring is SIXTEEN longs and the taps are 15/12/9/6/3* |
| the `$80390C` test dropped | *the trail is on the aura/glow phase* |
| the `$25369C` coarse skip dropped | *a STATIONARY ship has no trail at all* |
| **the `$FA00FC00` bias as TWO 16-bit adds** | *addi.l is ONE LONG add* - **see §5.2** |
| `$25360E bne` takes the wrong ring pair | the taps test + 6 more |
| the head taken from the RING, not from `($a,A6)` | *`$253680`/`$253684` store the NEW head* |
| `$253608 tst.b/beq` inverted | *THE GATE IS THE LASER* + 7 more |
| colour 30 instead of 31 | *3x32 in COLOUR 31* |
| the size word off by one | the same |
| `$2536B6`'s seed cut to EIGHT of sixteen longs | *the port and the LASER agree on the four ring addresses* |

### 5.2 **THE `addi.l` FIXTURE COULD NOT FAIL, AND WHY IS A FACT ABOUT THE ROUTINE**

The two-16-bit-add mutant **SURVIVED** the first version of that test, which
used ring position `$30001000`. The reason is not a typo:

```
[M] LONG add   $30001000 + $FA00FC00 = $2A010C00
[M] TWO adds   $2A00 | $0C00          = $2A000C00     <- a DIFFERENT D1
[M] ...but $23FDB2 does asr.l #6 then andi.l #$07FF03FF, and the carry's
[M]    bit 16 lands on bit 10 -- inside the SHORT axis's 10-bit mask, which
[M]    throws it away.  SAME RECORD.
```

**The long-vs-word distinction in `$2536A2` is observable at exactly 1 position
in 64** - the long axis only moves when the carry crosses bit 22, i.e. when the
long half's low six bits are all 1. The fixture is `$303F1000` now, where
`[M]` the long axis reads `$0A9` for the ROM's add and `$0A8` for the wrong one,
and the mutant goes red. It is the same shape as `shipgate`'s
`shadow-no-borrow` ("RED on 10 of 2,200 frames") and it is written down here so
the next reader does not delete the odd-looking constant.

**AND ONE OF MY GATE'S OWN CONTROLS COULD NOT FAIL AS FIRST WRITTEN** - the
seventh wave running
(`66-impl` §6.1, and `docs/knowledge/03`). `--break census-depth-1` was meant to
be that control and was **GREEN**: `walk(lo, hi, 1, [])` still recurses one
level, which is exactly the level `$24A53E jsr $253604` needs, so cutting the
depth from two to one changed nothing at all. It is `census-no-recursion`
(depth 0) now, and it goes red. Recorded rather than quietly repaired.

**So TWO of my own checks could not fail: `census-depth-1` and the `addi.l`
fixture.** Both are fixed, both were re-run red, and both are recorded rather
than quietly repaired.

Three of my own unit-test expectations were also wrong on first run and each was
a real thing to learn rather than a typo:
* the ring head comes from **the record** (`$253680 move.l ($a,A6),(A3)`), not
  from ring slot 0, so a test seeded with markers must expect `($a,A6)`;
* `$30000100 + $FA00FC00` has **no carry** ($100 + $FC00 = $FD00 < $10000), so
  the first `addi.l` fixture could not tell a long add from two word adds. It is
  `$30001000` now, where the carry fires and the wrong port gives `$2A00` where
  the ROM gives `$2A01`;
* a P2 test must not assert that P1's rings hold P1's data when nothing seeded
  them.

## 5.3 THE GATE - and the one red row is **NOT THIS WAVE'S**

```
[M] node --test games/ddpdoj/tests/        934 pass, 0 fail, 0 SKIPPED  (was 922)
[M] node games/ddpdoj/tools/w67trailgate.mjs      13 of 13 PASS  (new)
[M]   --break no-trail / trail-every-phase / trail-no-coarse-skip /
[M]         census-no-recursion                   all four EXPECTED-RED
[M] node games/ddpdoj/tools/webgate.mjs           17 of 17 PASS  <- UNMOVED
[M] node games/ddpdoj/tools/bundlegate.mjs        15955968/15955968 = 100.0000%  <- UNMOVED
[M] node games/ddpdoj/tools/w64bombgate.mjs exit 0   w65beamgate exit 0
[M] node tools/build-dist.mjs   clean, 5 deliberate exception(s)  <- UNMOVED
[M] python games/ddpdoj/tools/oracle/pgm.py check
[M]     BEFORE this wave (baseline, 67 stages)        ALL GREEN 67 / 0 / 0
[M]     WITH the trail, 67 stages (the runner as it stood)  ALL GREEN 67 / 0 / 0
[M]     FINAL, 74 stages                             73 passed, 1 FAILED, 0 SKIPPED
```

**The 74 is not 67 + my 5.** A concurrent agent (W69) wired **two** more stages
(`82afbc3`, the segment sweep) while this wave was running, so the runner went
67 -> 72 (mine) -> 74 (theirs).

**THE ONE RED ROW IS THEIRS, and here is the proof rather than the claim:**

```
[M] [FAIL] segment sweep: the port re-seeded from the board at every rung
[M]        fly-around:PASS  stage1-play:FAIL  stage1-sweep:FAIL
[M] FIRST DIVERGENT, stage1-play, segment lf2000..2250:
[M]        s14y @ lf2016   port=26122  board=25738   (+8 columns)
```

`s14y`/`s21y`/`shot1`/`shot2` are **SHOT TABLE SLOTS**. This wave writes exactly
two things - bucket 12's staging buffer `$80AF24..` and the two 16-long rings -
and neither is a compared column. And the decisive measurement, because a
column list is an argument and this is not:

```
[M] 4,000 steps under W69's own stage1-play input shape (ONE-FRAME Button-1
[M] taps every 40 logic frames, stick cycled):
[M]     frames with ($3f,A6) set : 0
[M]     $253604 records emitted  : 0
[M]     bucket 12 staged records : 0
```

**The trail's gate never opens in that scenario, so `drawTrail` returns at its
first instruction and writes nothing at all.** `[M]` The same three ladders
exited **0** when I ran `seedcmp.mjs` directly at 20:10 and **1** at 20:47 with
the ladder files unchanged (mtimes 19:30 / 19:50 / 20:03) - because W69
committed `a3de6c6 the red validation could not fail; make it differential` and
`365a749 separate the three reasons a segment is red` in between. It is their
gate, their tooling and their in-flight finding. **Nothing was narrowed,
loosened or disabled to restore green.**

## 6. WHAT THIS WAVE DID NOT DO

- **NO BOARD COMPARISON EXISTS FOR THE TRAIL.** `fly-around` never holds fire,
  so `($3f,A6)` is 0 on all 2,301 captured frames and bucket 12 is empty on both
  sides. Adding 12 to `shipgate`'s `CLAIMED_BUCKETS` would be a fixture sitting
  where two readings agree, so **it is deliberately NOT added** and the reason
  is in `src/main.js`'s `PRODUCED_BUCKETS` comment. The trail is
  port-vs-listing.
- **THE PALETTE IS NOT VERIFIED** (§3.2).
- **THE SHIP'S TILTED GLOW AND SHADOW STILL HAVE NO ART** (§4). 48 streams,
  ~3.3 KiB gz, named to the address.
- `$23FDE8`, bucket 12's SECOND stub (the zooming register convention), has zero
  absolute-long callers and is **not** declared dead - `xref.py`'s rule.
- `P.dead` is still the wrong name for `($3f,A6)`; it is the LASER's "beam up"
  flag and renaming it touches six files in a wave whose subject is the trail.
- **`games/gradius/` NOT TOUCHED.**

## 7. ONE PARAGRAPH

**The ship has had a sixth sprite producer since W12 and nothing in this repo
could see it.** `$24A53E jsr $253604` is the AFTERIMAGE TRAIL: a sixteen-long
ring of the ship's own position and image, shifted one slot per draw, tapped at
slots 15, 12, 9, 6 and 3 and re-emitted as up to **five** records - the ship's
own 48x32 picture, in **colour 31**, at the positions it held 3, 6, 9, 12 and 15
calls ago. It is bucket 12's only producer in the cartridge, it needs no new
art, and it was a counted note for fifty-four waves on a subsystem `pgm.py
shipgate` had called 0 divergent the whole time - because that gate compares
buckets 5, 15 and 19, and a gate that compares a NAMED LIST of buckets is
structurally blind to the buckets not on the list. `55-diag` found it and got
three numbers wrong in the same direction (six records, a six-entry ring); the
listing says five and sixteen, and the histogram of a 1,500-frame run never
reaches six. Its gate is the LASER - `$24C282 move.b #$1,($3f,A4)`, sixteen held
frames - which closes `55-diag`'s own open question and means **the trail is
armed on every beam, in ordinary play**. Bucket 12 goes **0 -> 3,597 records,
3,597 DRAWN, 0 missing**, and in Chrome, local and live, five blue ghost ships
hang off the ship the moment it banks with the beam up. The check this wave
leaves behind is not "compare bucket 12 too" - that would be two empty buffers,
because no capture in this repo holds fire - it is **`w67trailgate.mjs`, THE
PRODUCER CENSUS: ask the CARTRIDGE which buckets a ported routine can feed, then
require the PORT to put a record in every one of them.** Run against W12..W66's
tree it names bucket 12 and measures zero. And it found the next wave on the
way past: **a ship that BANKS asks for 48 sprite streams nobody has shipped** -
its own tilted glow and shadow - which E3 and E6 both truthfully reported as
zero missing, because their scenarios fly straight up.

## LOG (appended as findings arrive)

- opened.
- §1 `[M]`: the premise holds in kind. **FIVE records, not six**; the ring is
  **SIXTEEN** deep with taps at 15/12/9/6/3; bucket 12 has a **second, uncalled
  stub** `$23FDE8`.
- §1 `[M]`: **THE GATE IS THE LASER** - `$24C282`/`$24C2D6`, `P.dead`. On the
  shipped seed with fire held it is set at logic frame **17**. W55's open
  question is closed and the trail is armed in ordinary play.
- §1 `[M]`: the ring INITIALISER was already ported (W45, `laser.js
  seedPositionHistory`) and **nothing had ever read the rings**.
- §2 `[M]`: **bucket 12 goes 0 -> 3,597 records, 3,597 DRAWN, 0 missing, 17
  distinct streams - all of them the ship's own `$25533A[0]` tilt frames.**
- §3 `[M]`: **THE TRAIL RENDERS.** Five overlapping BLUE ghost ships trailing
  the banking ship, 534 pixels, palette bank 31 (`$03E8..$03FE`), drawn BEHIND
  the ship. Three controls (no beam / beam+still / released) all show nothing.
- §3.2 `[M]`: the COLOUR INDEX is the ROM's; **the RGB is the recording's** and
  no board frame in this repo draws a colour-31 record.
- §4 `[M]`: **E3/E6's 100.0 % and zero missing streams are UNMOVED and the trail
  adds ZERO missing streams on five inputs** -- but a SWEEPING ship sits at
  98.1 %, on BOTH trees, because **the ship's own tilted GLOW (32 streams,
  bucket 19) and SHADOW (16, bucket 5) have no art.** W55 §10's W57 never ran.
- §5 `[M]`: 4 of 4 breaks red -- **and one of my own controls could not fail as
  first written**, the seventh wave running.
- `[M]` BOOT **532.0 KiB, unmoved** -- no asset changed. The JS source costs
  **+4,186 B gzipped**, almost all of it the transcription's comment block.
- §5.1 `[M]`: **11 of 11 unit-test mutants RED, 0 survivors**, every restore
  sha256-identical.
- §5.2 `[M]`: **the `addi.l` fixture could not fail as first written** -- the
  long-vs-word carry is observable at **1 position in 64**, because `asr.l #6`
  puts bit 16 on bit 10 and `andi.l #$07FF03FF` masks it off. Second defective
  check of my own this wave.
- §5.3 `[M]`: **gate 73 passed / 1 FAILED / 0 SKIPPED over 74 stages** -- the one
  red is **W69's segment sweep**, first divergent `s14y@lf2016 port=26122
  board=25738`, and `[M]` the trail's gate never opens under that scenario's
  input (0 frames armed, 0 records, 0 staged over 4,000 steps). Baseline and the
  67-stage run with the trail were both **ALL GREEN 67/0/0**.
- **A CONCURRENT AGENT (W69) COMMITTED MY `pgm.py` HUNK INSIDE ITS OWN COMMIT**
  (`ec25618`) while I was working. Nothing was lost and nothing of theirs was
  clobbered, but the census stages are in HEAD under someone else's message.
  `HANDOVER` §10's stage-during-sweep race, third occurrence.
