# RECON 20 (wave 20, recon 4 of 5) - PLAYER-TRACKING: the aim routines, and why the oracle cannot enumerate them

status: **DONE** on the five questions asked, with six named gaps in
"What I could NOT do". Every number below was produced by a command in this
file. Nothing is quoted from another worklog as if it were measured here.
wave: 20   role: recon (READER - nothing in `games/ddpdoj/src/` was edited)
started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$2Axxxx`, 2002.10.07 BLACK VER).
`$200920` and `$2418B4` are shared DATA below `$230000`, not build-A code; every
such citation says so. Machine pin unchanged: `ddpdojblk`, `maincpu` 6,291,456
bytes.

New tools, all under `games/ddpdoj/tools/recon20/` (nothing in `src/` touched):

| file | what it is |
|---|---|
| `aimref.py` | enumerates the player-tracking library's 43 entry points and **every call site of each**, absolute-long AND PC-relative, over the decrypted image |
| `aimmodel.py` | THE AIM, transcribed from the listing: `aim64()`, `aim256()`, the three ROM tables each reads, an exhaustive back-half census, and `check` - a row-by-row diff against a board capture |
| `aimcheck.lua` + `runaimcheck.py` | the capture: every completed atan2 with the registers and the live player position at that instant |

---

## THE HEADLINE - three results

**1. The aim is a PURE FUNCTION of two 16-bit deltas, and the transcription is
now EXACT against the cartridge on 6,139 live calls with zero mismatches.**

```
$ python games/ddpdoj/tools/recon20/runaimcheck.py 3600 --invuln --autofire --move --tag mv2
  PROBE WROTE .../recon20/out/mv2.tsv rows=12281 dropped=0
  PROBE DONE logicframes=3600 videoframes=3636 aims=12281 fails=0

$ (the offset-aware check, section 4)
  VALIDATED rows=6139 mismatch=0   distinct (octant,ratio) states covered=738
```

**2. THE AXIS SCALE.** The aim does not compute `atan2(Δy, Δx)`. It computes
`atan2(Δy, 1.5·Δx)` - `$24205C move.w D1,D2 / asr.w #1,D2 / add.w D2,D1`. That
is not a bug and not a deliberate miss: **the direction→velocity table
`$200920` carries the same 1.5**, and the two cancel exactly, so the shot flies
down the true line. Measured over all 120 speed rows of that table:

```
speed  dir0 (the +$2 axis)  dir16 (the +$4 axis)   ratio
   4         44                    29              1.5172
  16        179                   119              1.5042
  64  ...   (120 rows, ratio 1.4865 .. 1.5714, converging on 1.505)
```

A port that writes a textbook `atan2` **and** a textbook unit-circle velocity
table is self-consistent and will still be wrong, because the two 1.5s cancel in
the ROM and not in the port. They must be ported as a PAIR.

**3. THE DENOMINATOR.** The library has **43 entry points; 20 are called from
anywhere in the 6 MB image and 23 have no reference at all.** Of the 260 aim
call sites, a 3,600-frame stage-1 corpus with a full stick sweep reached
**16 - 6 %.** The 256-direction aim has **111 call sites and executed 12 times**
in 3,600 frames. This is the owner's rule in one table: the corpus is not a
census.

---

## 1. THE INVENTORY - 43 entry points, counted from the ROM

`$241F00`–`$242A70` is one self-contained player-tracking library: an atan2 in
two precisions, four target selectors, eleven distance functions, five
slew limiters, and one random-direction generator. It reads **no global except
through the target selectors**, and the two cores read no memory at all beyond
their own PC-relative tables.

```
$ python games/ddpdoj/tools/recon20/aimref.py
ENTRY     n  by form                     what
241FEA    0                              aim64  target=(3,A5)  self=(2,A6)  -> STORE (1B,A6)
241FF4    0                              aim64  target=(2E,A6) self=(2,A6)  -> D1
241FFC    0                              aim64  target=(2E,A6) self=CALLER  -> D1
24200A   61  jsr.l=61                    aim64  target=(3,A5)  self=CALLER  -> D1
242018    0                              aim64  target=P2 FIXED self=(2,A6) -> D1
242022    0                              aim64  target=P1 FIXED self=(2,A6) -> D1
24202C   37  bsr=3 jsr.l=34              aim64  target=(3,A5)  self=(2,A6)  -> D1
24203E   48  bra=2 jsr.l=46              aim64  CORE  self=D0/D1 target=D2/D3 -> D1
242178    8  jsr.l=8                     aim64+turn1 -> STORE (1B,A6)
242186    0                              aim64+turn1 -> D1
24218C    2  bsr=1 jsr.l=1               turn64  cur=(1B,A6) step 1
242190   84  jsr.l=84                    turn64  cur=D0 step 1
2421AC    2  bra=1 bsr=1                 turn256 cur=(1B,A6) step 1
2421C6    0                              turn64  step up to D5
242206    0                              turn256 step up to D5
242242    0                              aim256 target=(3,A5) +turn1 -> STORE
242252    0                              aim256 target=(3,A5) +turn1 -> D1
24225C    0                              aim256 target=(3,A5)        -> STORE
242266    0                              aim256 target=(2E,A6)       -> D1
24226E   48  jsr.l=48                    aim256 target=(3,A5) self=CALLER -> D1
24227C    0                              aim256 target=P2 FIXED      -> D1
242286    0                              aim256 target=P1 FIXED      -> D1
242290   21  bsr=3 jsr.l=18              aim256 target=(3,A5) self=(2,A6) -> D1
2422A2   46  bra=1 jsr.l=45              aim256 CORE
24270A    6  bsr=5 jsr.l=1               target-select by (3,A5)
242730    3  bsr=3                       target-select by (2E,A6)
242748    1  jsr.l=1                     target-select by (2A,A6)
242760    0                              target-select PSEUDO-RANDOM $242784[$803916.b++]
2423A4    0                              dist: min(both) vs STAGE table $242410 -> CCR
2423E0    2  bsr=2                       dist: one player, octagonal
2423FA    0                              dist: vs STAGE table $242410 -> CCR
24241A    0                              dist: vs STAGE table $24242E -> CCR
242438    3  bsr=2 jsr.l=1               dist: min over both players
242454    0                              dist: to (3,A5)-selected target
24245C    0                              dist: to P1 else P2, -1 if none
242486    2  bsr=2                       dist: one player (A0), self=(2,A6)
24249A   12  bra=1 jsr.l=11              dist CORE: max(3/4|dy|,|dx|) + min/2
2424BA    0                              dist |dY| min over both, A0 = the nearer
2424EA    2  bsr=2                       dist |dY| one player
2424FC    3  jsr.l=3                     dist |dX| min over both
24252C    2  bsr=2                       dist |dX| one player
242A48    7  jsr.l=7                     RANDOM direction (contrast, not tracking)
ENTRY POINTS: 43   CALL SITES (candidates): 400
```

**Twenty-three of the 43 have NO REFERENCE ANYWHERE IN THE 6 MB IMAGE** - not a
branch, not a `jsr`, and not a longword in any pointer table (a separate scan of
every longword in the image; that is what would catch a `jsr (A0)` dispatch).
Among the dead: both fixed-target variants (`$242022` aim-at-P1,
`$242018` aim-at-P2), both multi-step slew limiters, the pseudo-random target
chooser `$242760`, and all three distance-versus-stage-table gates
(`$2423A4`/`$2423FA`/`$24241A`). This is shared IGS/Cave middleware; DaiOuJou
uses a subset. **A port that translates the library entry-by-entry does 23
routines of dead work.**

External build-B call sites, excluding the library's own internal branches:

| family | entries | call sites | banks $26–$28 | banks $29–$2A |
|---|---|---|---|---|
| **aim, 64 direction** | `$24200A $24202C $24203E $242178` | **149** | | |
| **aim, 256 direction** | `$24226E $242290 $2422A2` | **111** | | |
| both | | **260** | **146** | **114** |
| slew limiter `$242190`/`$24218C` | | 85 | | |
| target selectors | `$24270A $242730 $242748` | 8 | | |
| distance | seven live entries | 24 | | |
| random direction `$242A48` | | 7 | | |

---

## 2. THE FUNCTION - `$24203E`, twelve instructions and three tables

```
24203e: move.w #$1800,D4 / add.w D4,D0..D3      THE BIAS  (see "domain" below)
24204a: moveq #8,D4
24204c: sub.w D3,D1 / bcc / neg.w D1 ; D4=0      |dX| and the sign bit
242054: sub.w D2,D0 / bcc / neg.w D0 ; D4+=4     |dY| and the sign bit
24205c: move.w D1,D2 / asr.w #1,D2 / add.w D2,D1 D1 = |dX| * 3/2   <-- THE AXIS SCALE
242062: cmp.w D0,D1 / bcc / D4+=2 ; exg D0,D1    the octant, and min/max
24206a: swap D0 / clr.w D0 / swap D0             zero-extend the min
242070: tst.w D1 / beq -> rts (D1 = 0)           both deltas zero -> direction 0
242074: asl.l #6,D0 / divu.w D1,D0               64 * min/max
242078: (double quotient and remainder, +1 if 2*rem > max)   ROUND TO NEAREST
242086: move.l A0,-(A7)                          <- the execution hook
242088: move.b ($2420F6,PC,D0.w),D0              THE ARCTAN LUT, 129 bytes
242092: move.w ($2420E6,PC,D4.w),D1              THE OCTANT BASE, 8 words
24209c: jmp ($2420C6,PC,D4*2)                    THE OCTANT SIGN, 8 longwords
2420ae: sub.w D0,D1 / addq #4 / lsr.w #3 / andi.w #$3f     -> 0..63
2420ba: add.w D0,D1 / addq #4 / lsr.w #3 / andi.w #$3f
```

```
$ python games/ddpdoj/tools/recon20/aimmodel.py tables
LUT64  $2420F6[129] = 00 01 01 02 02 03 04 05 06 07 08 08 09 09 0A 0A 0B 0B 0C 0C 0D 0D 0E 0E 0F
                      10 10 11 12 12 13 14 14 15 15 16 16 17 17 18 19 1A 1A 1B 1B 1C 1C 1D 1E 1F
                      1F 20 20 21 21 22 22 23 23 24 24 25 25 26 26 27 27 28 28 29 2A 2A 2B 2B 2C
                      2C 2C 2D 2D 2D 2E 2E 2E 2F 2F 30 30 31 31 32 32 33 33 34 34 35 35 36 36 36
                      37 37 37 38 38 38 39 39 39 3A 3A 3A 3B 3B 3B 3C 3C 3C 3D 3D 3D 3E 3E 3E 3F
                      3F 3F 40 40
BASE64 $2420E6[8]   = [128, 256, 128, 0, 384, 256, 384, 0]
OPS64  $2420C6[8]   = ['ADD', 'SUB', 'SUB', 'ADD', 'SUB', 'ADD', 'ADD', 'SUB']
LUT256 $242362[65]  = 00 01 02 02 03 04 04 05 06 06 07 07 08 09 09 0A 0A 0B 0B 0C 0D 0D 0E 0E 0F
                      10 10 11 11 12 12 13 13 14 14 15 16 16 16 17 17 17 18 18 19 19 1A 1A 1B 1B
                      1B 1C 1C 1C 1D 1D 1E 1E 1E 1E 1F 1F 1F 20 20
BASE256$242352[8]   = [64, 128, 64, 0, 192, 128, 192, 0]
  aim64 N (player straight 'up', -Y)   = 32   aim256 = 128
  aim64 E (player at +X)               = 16   aim256 =  64
  aim64 S (player at +Y)               =  0   aim256 =   0
  aim64 W (player at -X)               = 48   aim256 = 192
  aim64 SE 45 deg TRUE                 = 10   aim256 =  40   <-- not 8
  aim64 SE 45 deg in TABLE units       =  8   aim256 =  32
```

**What each part is, stated so a port can be written from this alone:**

* **the maths** is a classic octant atan2: three sign/magnitude tests build an
  octant in `D4` (0,2,…,14), `divu` produces the ratio `min/max` scaled to
  0..128, an arctan LUT converts that to an angle inside the octant, and a
  per-octant base and sign fold it back to the circle.
* **the internal precision is 512 steps per turn** (the bases are 0/128/256/384
  and the LUT tops out at 64 = 45°). `addq #4 / lsr.w #3` is a
  **round-to-nearest** down to **64 steps per turn = 5.625° per step**. The
  256-direction variant keeps 256 steps = 1.40625° and does not shift.
* **the LUT is an arctan.** `LUT64[i]` versus `512·atan(i/128)/2π`: worst error
  **+1.65 units of 512 (1.16°) at i=10**, and ≤ ±0.55 for i ≥ 19. It is not a
  clean formula and must be **shipped as data** - the deviation at small ratios
  is exactly the near-axis region a shooter's shots spend most of their life in.
* **the divide rounds to nearest**, not toward zero (`$24207C` doubles quotient
  and remainder and compares against the divisor). Getting that wrong shifts one
  LUT index and therefore up to one whole direction step.
* **the quantisation cost is real.** One step of 64 is 5.625°; half a step at
  300 px of separation is 15 px. A port that keeps float angles and rounds at
  the end will disagree with the board on a large fraction of shots.
* **the 1.5 is on the `+$4` axis.** `+$2` is the vertical axis and `+$4` the
  horizontal - established independently by 10-recon-combat's measurement that
  the tilt table `$2553F2` writes the `+$14/+$16` pair (which pairs with `+$4`)
  and that pair is the ship's 4-px WIDTH.

### The domain, stated because "pure function" needs one

The `#$1800` bias cancels in every subtraction, but it is not dead: it makes the
`bcc` after `sub.w` - an UNSIGNED borrow - behave as a sign test for coordinates
in `[-$1800, $E7FF]`. Measured on the model:

```
f depends only on (dy,dx) over realistic coords : 0 / 300,000 disagreements
f depends only on (dy,dx) over the FULL 16-bit range : 160,325 / 300,000
```

So: **`aim64` is a pure function of the pair (Δ+$2, Δ+$4) for any object whose
own coordinate is ≥ −$1800 and ≤ $E7FF**, and outside that window it is a
function of the four absolute coordinates. A port must keep the bias.

---

## 3. TARGET SELECTION - three live selectors, and the 1P fallback carries half the calls

```
24270a: lea $8103e6,A0 / lea $810448,A1
242716: tst.b ($3,A5) / beq / exg A0,A1      the enemy record's target index
24271e: tst.w (A0) / bmi (use it)            bit 15 = that player is ALIVE
242722: tst.w (A1) / bmi (use the other)     THE FALLBACK
242726: ori #$1,SR / rts                     both dead -> CARRY, no aim
```

`$242730` and `$242748` are the same routine keyed on `($2E,A6)` and `($2A,A6)`
instead. `$242760` - the one that picks by a **256-byte pseudo-random table at
`$242784`, exactly 128 ones and 128 zeros, stepped by `addq.b #1,$803917`** - is
**dead in this cartridge** (no reference anywhere). Two enemy handlers,
`$2759D0` and `$273C04`, carry an **inline copy** of `$24270A`, so the selector
is not always reached by a call and a static caller count of `$24270A` is a
lower bound on target selections.

Measured over the capture (12,281 rows):

```
($3,A5) == 0 (nominally P1) : 6,341     ($3,A5) == 1 (nominally P2) : 5,916
P2 alive word $810448       : 0000 on ALL 12,281 rows
```

**48 % of all aims nominally target P2 and are rescued onto P1 by
`$242722`.** In a one-player game the fallback is not an edge case, it is half
the traffic - and the model reproduces it, which is part of what the 0-mismatch
result validates.

---

## 4. THE VALIDATION - 6,139 rows, zero mismatches

**The hook.** `$242086 move.l A0,-(A7)` is a stack WRITE between the divide and
the LUT, so it is a genuine execution hook (00-recon-hard §3: a read tap only
proves prefetch). At that instant `D4` is the octant and `D0` the 0..128 ratio -
together the complete output of the front half. `$2422EA` is the same
instruction in the 256-direction core.

**Why the inputs are recoverable.** The routine never touches A5/A6, so the
shooter's `($2,A6)/($4,A6)` are still readable at the tap, and the target is
whichever player `$24270A` picked - reproducible from `($3,A5)` and the two
alive words, all read at the same instant. The longword above the pushed A0 is
the caller's return address, so every row is attributable to a call site.

**First pass, model with no caller offset:**

```
ENTRY     rows   mismatch
  24200A/242086   4811     4615    95.9% differ
  24202C/242086    886        0    EXACT
  24203E/242086    430      426    99.1% differ
  24226E/2422EA      2        2
  2422A2/2422EA     10        9
```

`$24202C` loads the shooter position itself; `$24200A` and the two CORE entries
take it from the caller - and every one of those callers **biases it first**.
Reading the `addi.w` pair immediately before each call out of the listing and
feeding it to the model:

```
  24200A@268398 off=(+$200,  0)      n=  593 mismatch=0  EXACT
  24200A@26841C off=(+$200,  0)      n=   24 mismatch=0  EXACT
  24200A@268A30 off=(+$200,  0)      n= 4189 mismatch=0  EXACT
  24200A@27384E off=(+$680, +$500)   n=    2 mismatch=0  EXACT
  24200A@273878 off=(+$680, -$500)   n=    2 mismatch=0  EXACT
  24200A@27584E off=(-$700,  0)      n=    1 mismatch=0  EXACT
  24202C@242176 off=(0,0)            n=  383 mismatch=0  EXACT
  24202C@269DE2 off=(0,0)            n=    9 mismatch=0  EXACT
  24202C@26A282 off=(0,0)            n=   24 mismatch=0  EXACT
  24202C@26A3E6 off=(0,0)            n=  458 mismatch=0  EXACT
  24202C@26A480 off=(0,0)            n=   12 mismatch=0  EXACT
  24203E@273C4A off=(+$680, +$500)   n=  123 mismatch=0  EXACT
  24203E@273C74 off=(+$680, -$500)   n=  122 mismatch=0  EXACT
  24203E@2759FE off=(-$700,  0)      n=  185 mismatch=0  EXACT
  24226E@26B9CC off=(+$2700, 0)      n=    2 mismatch=0  EXACT
  2422A2@273B08 off=(-$200,  0)      n=   10 mismatch=0  EXACT
VALIDATED rows=6139 mismatch=0   distinct (octant,ratio) states covered=738
```

That is one result and two by-products.

* **The result:** the transcription in `aimmodel.py` is byte-exact against the
  cartridge for both cores, over 8 octants, 128 of the 129 ratio indices, and
  738 of the 1,032 reachable internal states - including the P2→P1 fallback.
* **By-product 1: MUZZLE OFFSETS ARE REAL AND PER-SITE.** `$268A30` aims from
  `($2,A6) + $200`; `$273C4A`/`$273C74` are two turrets at `+$680, ±$500`
  alternated by `bchg #6,($1,A6)`; `$27584E`/`$2759FE` aim from `−$700`. An
  enemy does not aim from its origin, and a port that does will be one to three
  direction steps off for every one of those sites.
* **By-product 2: 10-recon-enemies' aim COUNT is 2× too high.** The
  `$242086` tap fires **twice** per aim - `move.l A0,-(A7)` is two word writes on
  a 16-bit bus. 5,546 of 6,128 adjacent row pairs are byte-identical except for
  the (word-swapped) return-address read. The true rate is **6,128 aims in 3,600
  logic frames = 1.70 per frame**, not 3.5. Recon 10's "14,922" and "12,884" are
  each double the real figure. Nothing else in that document depends on it.

---

## 5. WHAT THE CALLERS DO WITH THE ANSWER - three more quantisers

The aim's 6-bit output is almost never used raw.

**(a) The slew limiter `$242190` - 84 call sites, the single most-called entry
in the library.**

```
242190: moveq #$3f,D2 / and.w D2,D0 / and.w D2,D1     cur, target
242196: sub.b D0,D1 / beq (already there)
24219a: addq.b #1,D0 / and.w D2,D1                    assume TURN ONE STEP UP
24219e: cmpi.w #$20,D1 / bcs                          shorter way round?
2421a4: subq.b #2,D0                                  no -> ONE STEP DOWN
```

**A tracking enemy turns at most one direction step - 5.625° - per call**, and
the call is per frame. `$2421AC` is the 256-step version. The multi-step
versions `$2421C6`/`$242206` (D5 steps) are dead. So the port needs the aim AND
a per-record facing byte AND the slew, or turrets snap instantly and look wrong
even with a perfect atan2.

**(b) The sprite quantiser.** `$268A46 addq.b #1,D1 / andi.w #$3e,D1 /
add.w D1,D1 / move.l (A0,D1.w),($22,A5)` - the facing is rounded to **32
directions** to index a longword graphic table. `$268424` goes further:
`addq.b #2,D2 / and.w #$3c,D2` on both the new aim and the current facing -
**16 directions** - and only redraws when those disagree.

**(c) The two-argument entries.** `$24203E`/`$2422A2` take BOTH positions in
registers, so they are not always player-tracking: `$293224` loads
`D2 = #$5400`, `D3 = #$1C00 − $813172` and aims at a **fixed world point**. Of
the 91 core call sites I read 6; **the split between player-tracking and
fixed-point core calls is not established** (see gaps).

---

## 6. RANK - what it does to aiming HERE, which is nothing, and what it does instead

**The aim core reads no global.** `$24203E`…`$2420C4` and `$2422A2`…`$242318`
touch only D0–D4, A0, A7 and three PC-relative tables in ROM. There is no rank
input, no difficulty input, no stage input and no RNG input. **Rank cannot
change the aim.** That is a listing fact, not a measurement, and it is the kind
of absence only a listing can establish.

Nor is there a randomised lead of the Gradius kind:

```
aim call sites (jsr.l) = 260
aim sites with an RNG READ or CALL within +-0x60 bytes: 2
   275CB2 -> 275D02 jsr $23D17E     both on the RANDOM-DIRECTION branch
   275CE0 -> 275D02 jsr $23D17E     after `jsr $242A48`, not on the aim
```

and `$23D17E` is not a generator, it is `move.w $803976,D0` - a read of a
system word. The only randomness near a direction in this library is
`$242A48`, which **replaces** the aim rather than perturbing it: `jsr $23D17E /
andi.w #$f,D0 / move.b ($242A70,PC,D0.w),($1b,A6)` with the 16-byte table
`FF 00 20 FF 30 38 28 FF 10 08 18 FF FF FF FF FF` - the eight 45° directions and
seven `$FF` "stationary" slots (`$2638DA cmpi.w #$40,D1 / bcc` treats ≥ `$40` as
no movement). 7 call sites.

**What plays rank's part in this cartridge, and where it lands:**

| word | what it is | how it reaches aiming |
|---|---|---|
| `$813092` / `$813094` / `$813096` | STAGE ×1 / ×2 / ×4 (10-recon-flow §5) | `$813094` indexes the distance-gate tables `$242410` = `1A00 1800 1400 1000 0E00` and `$24242E` = `1400 1400 1200 0E00 0A00` - **but all three routines that read them (`$2423A4`, `$2423FA`, `$24241A`) are DEAD**. It also indexes the frame-pacing thresholds at `$23C36E`. |
| `$813098` | the LOOP flag, 0/1 (10-recon-flow §6) | picks the alternate off-screen window tables at `$2425C0`/`$2425E8` (`$242562`→`$24258A`, `$242576`→`$24259E`) - i.e. on loop 2 enemies stay live further off screen, so **more of them aim**. Never the aim itself. |
| `$81B414`..`$81B41A` | the player's power ladder | selects 6/10/15/18/20 hitbox entries (10-recon-enemies §4d) and 13/21/31/37/41 at `$2814D4`. Not aiming. |
| `$803932` / `$803940` | the per-frame pacing/throttle engine `$23C212` | reads `$81295C` (shot count), `$815EA0` (live enemy sub-records), thresholds by stage and loop, and writes `$803940` = 1/2/3, the value the frame loop spins on. Not aiming. |
| `$803910` | gates whether the damage-first handlers RE-AIM at all (`$26A3DE`, `$26A6C6`, `$26A9A8`, `$26AB78`, `$26AE62`) | it is a whether, not a what. Unidentified; see gaps. |

Measured across all 12,281 captured aims: `$813094 = 0` and `$813098 = 0` on
every row. **Every number in this document is at stage 1, loop 1.** An unforced
corpus never leaves it - exactly the caveat 10-recon-enemies raised, restated
here with the count.

---

## 7. IS EXHAUSTIVE TESTING AFFORDABLE? YES, AND HERE IS THE SHAPE OF IT

The question is worth answering precisely because the answer changes what the
oracle is for.

**The input space is 2^32** (two 16-bit deltas). **The internal state space is
1,032** - the front half provably factors through `(octant ∈ 8, ratio ∈ 0..128)`,
and everything after `$242086` is three table reads and four instructions:

```
$ python games/ddpdoj/tools/recon20/aimmodel.py sweep
BACK HALF: 8 octants x 129 ratios = 1032 states, 64 distinct results
  directions NEVER produced: none
FRONT+BACK over 66049 (dy,dx) samples in +-384: 64 distinct directions
distinct front-half states over dy,dx in +-512 (1,050,625 pairs): 1029 of 1032
```

So:

1. **The back half needs no emulator at all.** Its 1,032 states are enumerated
   by reading three ROM tables, and all 64 output directions are reachable. Done
   above, in 0.1 s.
2. **The front half is exhaustively testable in the MODEL.** Measured Python
   throughput **201,340 evaluations/s**, so all 2^32 delta pairs is **6 hours
   single-core Python** and minutes in numpy or C. A ±512 window - 1,050,625
   pairs, ~5 s - already reaches **1,029 of the 1,032** internal states.
3. **Against the BOARD, exhaustive over 2^32 is not affordable and does not
   need to be.** Two routes, in order of cost:
   * **Free, and already done:** the natural corpus. 3,600 frames gave 6,139
     attributable calls covering **738 of the 1,032 states** with zero
     mismatches. A 9,500-frame run of the kind 10-recon-enemies already runs
     would give ~16,000 calls; the states it cannot reach are the ones no enemy
     is ever positioned to ask for.
   * **Complete, and buildable in one sitting:** the routine from `$24203E` is a
     **pure leaf** - after the bias it reads no RAM, writes no RAM except the A0
     push, and calls nothing. So an in-emulator evaluator only has to set
     D0–D3, run to the `rts`, and read D1. The clean way is `pgm.run(...,
     debugger=True)` with a breakpoint at `$24203E`: set the four registers,
     step to `$2420AC`, read D1, restore. At even 1,000 evaluations/s the whole
     1,032-state cover takes **one second**, and a 1-million-pair delta sweep
     takes 17 minutes. **I designed this and did not build it** - the
     0-mismatch result on 6,139 live rows made it unnecessary for THIS wave, but
     it is the right harness for the next person who changes `aimmodel.py`.

**The general lesson, in the owner's terms.** A player-tracking generator is
exactly the thing a corpus cannot enumerate - the capture never shows the same
input twice, and 16 of 260 call sites ever ran. But it is also exactly the thing
that is *cheapest* to prove correct once you have read it, because it is pure:
the ROM gives you the whole domain, and the board only has to arbitrate. Read
the generator, enumerate its state space from the tables, and spend the oracle
on the parts that are not pure.

---

## 8. THE DISTANCE FUNCTIONS - measured, because they gate firing

Seven live entries, all reducing to `$24249A`:

```
24249a: sub.w D2,D0 / bpl / neg.w D0            |dY|
2424a0: move.w D0,D4 / lsr.w #2,D4 / sub.w D4,D0   D0 = |dY| * 3/4
2424a6: sub.w D3,D1 / bpl / neg.w D1            |dX|
2424ac: cmp.w D1,D0 / bcc / exg D1,D0           max, min
2424b2: lsr.w #1,D1 / add.w D1,D0               max + min/2
```

An **octagonal** metric - and note it uses **3/4 on the vertical axis where the
aim uses 3/2 on the horizontal**. Those are not the same anisotropy (3/4 = 1÷1.333
against 1÷1.5), so the distance metric and the aim disagree about the shape of a
circle. Translate both as written; do not unify them.

`$2424BA`/`$2424FC` are one-axis versions that also return **which player is
nearer** in A0. `$268024` is a fourth, hand-inlined nearest-player selection at
spawn time.

---

## 9. Commands, and their actual output

```
python games/ddpdoj/tools/recon20/aimref.py             43 entries, 400 call sites
python games/ddpdoj/tools/recon20/aimref.py sites       every site address
python games/ddpdoj/tools/recon20/aimmodel.py tables    the five tables + cardinals
python games/ddpdoj/tools/recon20/aimmodel.py sweep     1032 back-half states
python games/ddpdoj/tools/recon20/runaimcheck.py 3600 --invuln --autofire --move --tag mv2
python games/ddpdoj/tools/recon20/aimmodel.py check games/ddpdoj/tools/recon20/out/mv2.tsv
python games/ddpdoj/tools/oracle/xref.py dasm 24203E 140     THE AIM
python games/ddpdoj/tools/oracle/xref.py dasm 2422A2 130     the 256-direction aim
python games/ddpdoj/tools/oracle/xref.py dasm 242190  30     the slew limiter
python games/ddpdoj/tools/oracle/xref.py dasm 24270A  60     the target selectors
python games/ddpdoj/tools/oracle/xref.py dasm 241812  60     direction+speed -> velocity
```

The intervention is unchanged from 10-recon-enemies and is stated on every
number: `$810424` (the player's invulnerability timer) is held at `$FF` from
lf1990 - a value the game writes itself at `$2495A2` - and Button 3 (auto-shot)
from lf1800, plus the `--move` stick sweep. Without them the ship dies and stage
1 never runs.

---

## 10. What I RULED OUT

1. **"The aim is a plain atan2 of the position difference."** False. It is
   `atan2(Δy, 1.5·Δx)`, and the velocity table `$200920` carries the matching
   1.5 on all 120 speed rows. Measured both sides.
2. **"Rank / the loop / the stage changes the aim."** False, from the listing:
   the two cores read no global. What the loop changes is the off-screen window
   (`$2425C0`), i.e. how many enemies are alive to aim at all.
3. **"There is a randomised lead like Gradius' rank ≥ 3."** False. 2 of 260 aim
   sites have an RNG within ±$60 bytes and both are on the random-*direction*
   branch, not on the aim. There is no site that perturbs the aim's output.
4. **"The pseudo-random P1/P2 target chooser is live."** False. `$242760` and
   its 256-byte table `$242784` (128 ones, 128 zeros) have **no reference
   anywhere in the 6 MB image**. Target choice is `($3,A5)` plus the alive-bit
   fallback, full stop.
5. **"An enemy aims from its own origin."** False at 11 of the 16 reached call
   sites; the offsets range from −$700 to +$2700 and two sites alternate
   ±$500 between a left and a right turret.
6. **"`$242086` fires once per aim"** (10-recon-enemies' aim counts). False:
   twice, because the push is a longword on a 16-bit bus. The real rate is
   1.70 aims per logic frame.
7. **"The library is 43 routines of work."** False. 23 of the 43 entry points
   are unreferenced anywhere in the image, including both fixed-target aims,
   both multi-step slew limiters and all three distance-versus-stage gates.

## 11. What I could NOT do, and why

1. **The 256-direction aim is barely exercised.** 111 call sites; **12
   executions** in 3,600 stage-1 frames, at 2 sites, both caller-biased. The
   model matched all 12 exactly, but 12 rows across 2 sites is not the
   validation the 64-direction core got (6,127 rows, 14 sites). One run in a
   later stage closes it; the hook (`$2422EA`) is already in `aimcheck.lua`.
2. **The 91 CORE call sites (`$24203E` + `$2422A2`) are not classified.** I read
   6. At least one (`$293224`) aims at a FIXED world point, not the player, so
   "260 aim call sites" is an upper bound on player-tracking sites and I do not
   know the split.
3. **No board-side exhaustive evaluator was built.** Section 7 designs it
   (`pgm.run(debugger=True)`, breakpoint at `$24203E`); I did not write it.
   The 1,032-state cover is therefore 738 measured + 294 argued from the tables.
4. **`$803910` is unidentified.** It gates re-aiming in five damage-first
   handlers (`$26A3DE` and four siblings) and is written somewhere in
   `$23BE26`..`$23BEC0`. One write tap names it.
5. **Why the arctan LUT deviates near the axes** (up to +1.65/512 at i=10, in a
   table that is otherwise ±0.5) is unexplained. It does not matter for the
   port - ship the bytes - but it means the table is not reconstructible from a
   formula and a port that generates it will be wrong by one direction step in
   the near-axis band.
6. **Everything is at stage 1, loop 1, one player.** `$813094` and `$813098`
   read 0 on all 12,281 rows and `$810448` (P2 alive) is 0 on all of them. The
   two-player branch of `$24270A` - where `($3,A5)` actually selects rather than
   falls back - has never executed in this project's corpus.

## 12. THE WORK LIST - in the order the measurements support

1. **Port `aim64` and its three tables verbatim, WITH the 1.5 and WITH the
   `$1800` bias.** 12 instructions, 129 + 8 + 8 table entries, all in
   `aimmodel.py` already and validated at 6,139/6,139. *Removes from the
   capture: nothing on its own - it is the prerequisite for every tracking
   enemy.*
2. **Port the direction→velocity table `$200920` in the same sitting.** 120
   speeds × 65 direction slots × 2 longwords, plus `$2418B4`'s triangle index
   and the four-quadrant mirror at `$241850`. The 1.5 in the aim is only
   correct against the 1.5 in this table. *Removes: enemies that move.*
3. **Port `$24270A` including the alive-bit fallback.** Five instructions.
   48 % of aims go through it. *Removes: "enemies aim at a recorded ship".*
4. **Port `$242190`, the one-step slew limiter.** 84 call sites, the most-called
   entry in the library, and without it every turret snaps. *Removes: the
   turret animation the capture is currently supplying.*
5. **Carry the per-site muzzle offsets.** They are `addi.w` pairs immediately
   before the call; 11 of the 16 reached sites have one. Cheap, and invisible
   until it is wrong. *Removes: nothing; prevents a class of near-miss.*
6. **Then, and only then, use the oracle.** With the generator ported, the
   comparison finally means something: run `aimcheck.lua` against the port's own
   aim on the same frames. *This is the whole point of the round - the ROM gave
   the inventory, the board gives the verdict.*
7. **Classify the 91 core call sites** (gap 2) before costing the enemy
   handlers, because an unknown fraction of them are not tracking at all.
