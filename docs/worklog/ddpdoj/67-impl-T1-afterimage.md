# 67 — IMPL T1: THE SHIP'S SIX-DEEP AFTERIMAGE TRAIL (`$253604`, BUCKET 12)

status: **IN PROGRESS**

started: 2026-08-05
wave: 67. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
`games/gradius/` NOT TOUCHED.

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.

brief: port `$24A53E jsr $253604` — the ship's six-deep afterimage trail into
bucket 12, bucket 12's ONLY producer in the cartridge, unported. W55 §4.3 is the
source of every claim in the brief.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `55-diag-invisible-content.md`, `66-impl-E6-bomb-art.md`,
`58-impl-E3-art.md`, `HANDOVER.md`, `docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE BRIEF'S PREMISE, CHECKED — right in KIND, wrong in three NUMBERS

The brief rests on `55-diag` §4.3. It holds where it matters — `$253604` is the
ship's afterimage trail, it is bucket 12's only producer, it needs no new art
and no gate here could see it — and **three of its specifics are wrong**, all
three in the same direction (reading `moveq #$5,D7` as the shape of the thing).

| the brief / W55 §4.3 says | `[M]` this session, from the cartridge |
|---|---|
| a **SIX**-deep trail, "up to six extra records per frame" | **FIVE.** `dbra` runs the body six times, but the sixth reads `tst.w D7` as 0, takes `$253680` — store-the-new-head — and `rts`es. It never reaches `$2536AA`. `[M]` measured: a 1,500-frame held-fire run's records-per-frame histogram is `{1:2, 2:1, 3:2, 4:48, 5:679}`. **Six never occurs** |
| "`$253660 moveq #$5,D7` <- SIX entries" / "its 6-entry ring" | the ring is **SIXTEEN** longs. `$253658 lea ($40,A1),A1` walks past `$40` bytes, the shift moves exactly 16 slots (1 + 5x3), and the initialiser `$2536B6` fills 16 (`moveq #$f,D0`). The five records are **taps at slots 15, 12, 9, 6 and 3** — the ship as it was 3, 6, 9, 12 and 15 calls ago |
| "`$2536AA` … BUCKET 12" and bucket 12 has ONE producer | **CONFIRMED, twice, and there is a SECOND STUB.** `xref.py callers 23FDB2` -> `$2536AA` only; `callers 253604` -> `$24A53E` only. And `$23FDE8` is a **second** enqueue on the same `$80AF24`/`$80AFEA` pair — the ZOOMING register convention — with **zero** absolute-long callers. `xref.py`'s own rule makes that a lower bound, so it is named, not declared dead |
| "**NO NEW ART IS NEEDED** — verify it" | **TRUE, and now measured rather than argued.** `[M]` the 3,597 records a 1,500-frame run emits ask for **17** distinct streams, `$001200 $001264 … $001840` in steps of `$64` — exactly `$25533A[0]`'s seventeen tilt frames, i.e. the ship's own image. `[M]` **0 named-missing, 0 pending, 3,597 of 3,597 DRAWN** |
| "`tst.b ($3f,A6)` gates it and I did not find the writer … the trail may only run in a state `fly-around` never entered" | **THE GATE IS THE LASER, and it is armed in ordinary play.** `$24C282 move.b #$1,($3f,A4)` sets it the frame the beam's arm-up completes; `$24C2D6 move.b D0,($3f,A4)` clears it on release. It is the same byte `src/player.js` reads at `$249B40` to switch the shot cadence machine off while a beam is up — the port has known this since W45 and called the field `P.dead`. `[M]` on the shipped seed with fire HELD it is set at **logic frame 17** |
| W55 §6: "the board draws ZERO colour-31 records" (in 161 captured frames) | **CONSISTENT, NOT CONTRADICTORY.** `$25364A move.w #$1f,D4` really does make the trail colour 31 — and `fly-around` never holds the fire button, so `($3f,A6)` is 0 on all 161 frames and the trail cannot have been in that capture. It is **not** the hitbox box of §6, which is 1x16 at `#$001F/$401F/$201F/$601F`; this is 3x32 at the ship's own offsets |

**AND ONE THING THE PORT ALREADY HAD AND NEVER READ.** The ring INITIALISER
`$2536B6`/`$2536D0` has been ported since W45 — `src/laser.js
seedPositionHistory`, called at `$24C288` on the frame the beam arms. So the
port has been filling two 16-long rings on every laser for twenty-two waves and
**nothing has ever read them.** That is the same shape as E6's finding one wave
earlier: state that was right, with no record ever emitted from it.

## 2. BEFORE AND AFTER — BUCKET 12

`[M]` 1,500 logic frames from the shipped seed, **fire HELD** (so `$24C282`
arms the gate) and the ship **sweeping left/right every 60 frames** (so the
`$FF80FF80` coarse-position test can ever be unequal — a stationary ship has no
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
number of RECORDS IN `$800000`, not a counter in the port — and every one of
them resolved to a picture in the shipped sheet.

## 3. WHAT IS ON THE SCREEN — and it is BLUE

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

### 3.1 THE PIXELS, ISOLATED — `.scratch/t1pixels.mjs`

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
five overlapping BLUE ghost ships** trails down and to the right of the ship —
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
their TILTED frames** — and they are missing the instant the player banks, which
is most of real play. `55-diag` §5 saw four of them (`$001F48 $0021AC $002188
$0023EC`) and §10 scheduled the whole set as **W57 — ART: THE SHIP AND THE LAST
ENEMIES, 4.3 KiB gz**. `[M]` W57 went to the midboss instead and **the ship's
art wave was never run**; E3 and E6 both reported "zero missing streams" and
both were right, because **their scenarios fly UP and never bank**, so nothing
ever asked for a tilted frame. One scenario is a floor — `55-diag` §7 says so in
its own words, and this is the bill.

**IT IS NOT THIS WAVE'S**, and the control is what says so rather than an
argument: the miss set is byte-for-byte identical with `no-trail`. Handed on,
priced by `55-diag` §2.5 at **b19 29 streams / 2.9 KiB + b5 17 / 0.4 KiB**.

## 5. EVERY CHECK SEEN TO FAIL

`tools/w67trailgate.mjs`, four breaks, each run and each required to redden a
NAMED row. `[M]`:

| break | what goes red |
|---|---|
| `no-trail` — `$253604` emits nothing (**the W12..W66 tree**) | **(B) BUCKET 12 -- the cartridge names 1 site and the port staged 0**, plus (C2) (C3) (C5) (C6) (C7). Six rows |
| `trail-every-phase` — drop `$25368A tst.w $80390C` | (C4): 433 of 864 frames on the aura's phase, 431 on the other (expect 0) |
| `trail-no-coarse-skip` — drop `$25369C cmp.l D6,D5` | (C5): the MOTIONLESS ship emits 2,210 records (expect 0) |
| `census-no-recursion` — do not follow a non-stub call | (A) the census names `[5, 19]` over 8 sites instead of `[5, 12, 19]` over 9, and (A2). **The control that proves the walk, not a typed table, is what finds bucket 12** |

**AND ONE OF MY OWN COULD NOT FAIL AS FIRST WRITTEN** — the seventh wave running
(`66-impl` §6.1, and `docs/knowledge/03`). `--break census-depth-1` was meant to
be that control and was **GREEN**: `walk(lo, hi, 1, [])` still recurses one
level, which is exactly the level `$24A53E jsr $253604` needs, so cutting the
depth from two to one changed nothing at all. It is `census-no-recursion`
(depth 0) now, and it goes red. Recorded rather than quietly repaired.

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
  absolute-long callers and is **not** declared dead — `xref.py`'s rule.
- `P.dead` is still the wrong name for `($3f,A6)`; it is the LASER's "beam up"
  flag and renaming it touches six files in a wave whose subject is the trail.
- **`games/gradius/` NOT TOUCHED.**

## LOG (appended as findings arrive)

- opened.
- §1 `[M]`: the premise holds in kind. **FIVE records, not six**; the ring is
  **SIXTEEN** deep with taps at 15/12/9/6/3; bucket 12 has a **second, uncalled
  stub** `$23FDE8`.
- §1 `[M]`: **THE GATE IS THE LASER** — `$24C282`/`$24C2D6`, `P.dead`. On the
  shipped seed with fire held it is set at logic frame **17**. W55's open
  question is closed and the trail is armed in ordinary play.
- §1 `[M]`: the ring INITIALISER was already ported (W45, `laser.js
  seedPositionHistory`) and **nothing had ever read the rings**.
- §2 `[M]`: **bucket 12 goes 0 -> 3,597 records, 3,597 DRAWN, 0 missing, 17
  distinct streams — all of them the ship's own `$25533A[0]` tilt frames.**
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
- **A CONCURRENT AGENT (W69) COMMITTED MY `pgm.py` HUNK INSIDE ITS OWN COMMIT**
  (`ec25618`) while I was working. Nothing was lost and nothing of theirs was
  clobbered, but the census stages are in HEAD under someone else's message.
  `HANDOVER` §10's stage-during-sweep race, third occurrence.
