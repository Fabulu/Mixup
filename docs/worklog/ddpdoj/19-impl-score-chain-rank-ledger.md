# W19 IMPL - the score / chain / rank ledger, and why FREEZE does not stop the scroll

status: DONE
started: 2026-08-02
role: implementer (DAIOUJOU wave 19)
target: ddpdojblk VERSION-B. Every address below is build B (`$23xxxx`–`$28xxxx`)
unless the line says otherwise; `games/ddpdoj/NOTES-build-split.md` is the rule.

Findings are written here AS THEY ARE LEARNED.

Tooling: `tools/oracle/xref.py` over the decrypted `out/maincpu.bin` (absolute-long
operands only - it CANNOT see `(d16,An)`, `(An)+`, PC-relative), plus a
scratch `pcx.py` that adds (a) a PC-relative `bsr`/`bra` caller scan and (b) an
absolute-operand census restricted to a build range. Every count below is
therefore a LOWER BOUND on sites reached through a base register, and says so.

---

# JOB 2 - WHY FREEZE DOES NOT STOP THE SCROLL

## The answer: neither (a) nor (b). `$0C` IS ported, it IS held, and holding it does not stop the scroll - on the board either.

The brief offered two candidates: (a) `$0C` decoded but a no-op, (b) `$0C`
ported but released immediately by a condition an enemy-less port satisfies.
**Both are wrong.** The port executes `$0C`, the freeze latches, and it is
still latched 5,683 frames later. What `$0C` freezes is not the scroll.

### 2.1 What `($8,A5)` actually gates - ONE instruction

`$26214C` (op `$0C`) sets `($8,A5) = 1`. Static census of `($8,A5)` in the
background module (`src/background.js` cites all of them; the listing is
`20-recon-scroll-engine.md` §3):

| site | what |
|---|---|
| `$26214C` | op `$0C` sets it to 1, and stashes `($16,A6) = $8130CE + 4` |
| `$261FC0` | op `$04`'s repeat countdown completing clears it (`$261FB8` arm) |
| `$26204A` | `$26200E`'s fast-forward clears it after the replay |
| `$2612E8..$2612F8` | the external `$81317E` arm sets it to 1 (if `$81317E==1`) or 0 |
| **`$261324`** | **the ONLY READ** |

`$261324` is `tst.w ($8,A5) / bne`, and it guards exactly one instruction:
`$26132C addq.w #1,$8130CE` - the distance odometer. Everything else in
`$2612A0`'s frame is OUTSIDE the gate:

* `$261308` → `$240B94`, the BG camera accumulate - **runs frozen**;
* `$26133C..$261376`, the `$800` column accumulator, `$261348`'s `repeatStep`,
  the nine `move.l` map writes and the ring-cursor bump - **run frozen**;
* `$26138A` → `$240C22`, the TX camera - **runs frozen**.

So `$0C` freezes the SCRIPT'S PROGRAM COUNTER (the clock is what `$26207C`
matches records against), not the picture. **The background keeps scrolling at
whatever speed the last `$08` record set.** The recon's name "FREEZE the clock"
is exact; the informal reading "FREEZE the scroll" is what produced this wave's
question.

### 2.2 What DOES make the stage stop advancing: op `$04` with `loops = $FFFF`

The stage-1 boss stop is the last two records **together** -
`$261786 04 FFF2 000E FFFF` + `$261792 0C`. The `$04` rewinds the column
pointer 14 columns and arms an INFINITE repeat (`$261FA4` `cmpi.w #$FFFF` →
always take the rewind branch); the `$0C` parks the clock so no later record
can fire. The camera never stops. The player sees the same 14 map columns
(210..223) scroll past forever.

**That is what the owner saw as "it runs to the end".** It is the correct
behaviour of the board, and it is not distinguishable from "the stage
continues" without counting columns.

### 2.3 MEASURED - the port, free-run from the ROM, 13,000 frames

`freerun.mjs` (scratch; the same construction as `tools/scrollportgate.mjs` -
the port's own `$26114C` builds the object from ROM, three warm-up dispatches,
entry clock 0, stage index 0), NO board input, NO TSV:

```
f1     FROZEN -1->0  clock=$1    col=15  colsWritten=15   b012=$200
f53    FROZEN  0->1  clock=$34   col=28  colsWritten=28   b012=$6A00      <- FREEZE #1
f280   FROZEN  1->0  clock=$38   col=21  colsWritten=85   b012=$23000     <- released by $261FC0
f7317  FROZEN  0->1  clock=$344  col=24  colsWritten=280  b012=$84980     <- FREEZE #2, the boss lock
END f=13000  clock=$344  frozen=1  cursor=30  streamPtr=$227A44 -> map column 219
             colsWritten=990   b012=$1E7C80
scr0 block: cur=$261798 (the $FFFF terminator)  rewind=$227900 (= column 210)
            loops=$FFFF  len=$E  count=5
```

Read the last two lines: **5,683 frames after the freeze latched, the camera
has advanced `$1E7C80 − $84980 = $162B00` (1,452,800 sixty-fourths = 22,700 px)
and 710 more map columns have been written**, cycling `$227900..$227ADC`
= columns 210..223. The port is doing exactly what the listing says. The clock
is parked at `$0344` and the record cursor is parked at the terminator.

This also confirms the recon's frame arithmetic against a SECOND, independent
translation: recon frame 52 / 279 / 7316 against the port's f53 / f280 / f7317
(the port's counter is 1-based from the first handler frame; the recon's is
0-based - same frames).

### 2.4 The two stage-1 FREEZE records, located (lookup, per the owner note)

| record | time | frame | px | map column | what releases it |
|---|---|---|---|---|---|
| `$26162C` | `$0034` | 52 | 416 | 28 | `$261FB8/$261FC0` - the paired `$261620` `04 FFE4 001C 0002` repeat runs its 2 passes (56 columns) and completes at frame 279 |
| `$261792` | `$0344` | 7316 | 8482 | 210 (loops 210..223) | **nothing inside the VM.** The paired `$261786` `04 FFF2 000E FFFF` never completes |

### 2.5 The exit W17 found, now NAMED - and it is an enemy

The only door out of a `loops=$FFFF` freeze is the external arm `$81317E`.
Complete census of `$81317E` in `$230000..$2A0000` (4 sites, all of them):

```
$261138  move.w #$1,$81317e     -- freeze ON     : ZERO callers, abs OR pc-relative
$261142  move.w #$2,$81317e     -- freeze OFF    : TWO callers
$2612D8  move.w $81317e,D0      -- the consumer ($2612E2 clears, $2612E8..F8 applies)
```

The two callers of `$261142` are **both in enemy code**, and both do the same
two things:

```
$26C7F4: jsr $261142.l  /  $26C7FA: clr.w $8130F4   (guard: ($25,A5)==2, ($26,A5) countdown hits 0)
$26D254: jsr $261142.l  /  $26D25A: clr.w $8130F4   (guard: ($1A,A5)==2 and ($2,A6) >= $6A00)
```

`$8130F4` is the companion flag - 10 absolute sites, 6 of them writes:
set 1 at `$263AF0`, `$263B08`, `$26C2AE`; cleared at `$263F70`, `$26C7FA`,
`$26D25A`; read at `$263AB8`, `$265B8C`, `$26D4BE` (`cmpi #0`), `$26D4CA`
(`cmpi #2`).

**So the owner's model is right and now has addresses on it: the script
freezes itself with `$0C`, and an ENEMY releases it by calling `$261142`.**
A port with no enemies therefore stalls at the boss lock permanently, which is
correct, not a defect.

### 2.6 The ONLY thing that stops the scroll dead - and it is not an enemy

`$8130D2`, tested at `$2612A0` and skipping the WHOLE handler. Complete census
in `$230000..$2A0000`: **122 absolute sites, of which exactly TWO are writes** -

```
$25FD82  move.w #$1,$8130d2      set
$25FD8C  clr.w  $8130d2          clear
```

Both are two-instruction leaf routines in the flow layer at `$25FDxx`. The
other 120 sites are `tst.w`/`tst.l` reads spread over the whole enemy and boss
range - i.e. it is the GLOBAL PAUSE (death pause, stage clear; W17 measured
both edges) and every object obeys it. No enemy writes it.

### 2.7 The stage-1 midboss does NOT freeze the scroll - it pushes a SPEED

`$261100` is the external speed push (`move.w #$1,$813180` /
`$261108 move.w D0,$813182` / `$26110E move.w D1,$813184` / `rts`) - the exact
three addresses W17's write tap logged at lf4377 and could not attribute.
Nine absolute callers, no PC-relative ones. One of them is inside the stage-1
midboss `$26B6FA`:

```
26b722: cmpi.b #$30,($17,A5)     ; the midboss's own countdown
26b728: bne    $26b740
26b72c: clr.w  $8130d8
26b732: move.w #$20,D0           ; BG speed  = $0020 = 0.5 px/frame
26b736: move.w #$20,D1           ; TX speed  = $0020
26b73a: jsr    $261100.l
```

W17 measured **exactly one** external speed push in the whole of stage 1 -
lf4377, clock `$00F8`, values `$0020/$0020` - and recorded that its caller was
unidentified. **It is `$26B73A`, the midboss.** (`scrollportgate.mjs`'s
`EXT_SPEED_PUSH` table carries those two values; its comment can now name the
writer.) The push was a no-op only because the script's own `$00F0` record had
already set `$0020` - a coincidence, as that file already says.

So in stage 1 the midboss does not stop the scroll at all. It sets it to
0.5 px/f. The other eight `$261100` callers are where to look for a speed-0
push in the later stages the owner was unsure about.

### 2.8 The black cutout is NOT at a FREEZE record

Decoded stage 1's map straight out of the image (`$225B78`, 224 columns × 9
longwords, tile base `$0AA9` - the same arithmetic `tools/export-web.mjs`
uses). The blank tile is `$0AA9` (2,729), 189 of the 2,016 cells.

* **There is no all-blank column anywhere in the 224.** So the hole is not a
  map hole and not an export gap.
* The blank cells are concentrated in **columns 76..115**, up to **6 of 9 rows
  blank per column** (76:1 → 81..84:6 → 100..104:5 → 115:1). Columns 52..57 and
  63..69 have smaller patches (2..5 rows).
* The two FREEZE records sit at **column 28** and **columns 210..223**. Neither
  is in any blank patch; columns 190..223 have **zero** blank cells.

Columns 76..115 is exactly the stretch the script fills with op-`$10` BGELEM
records - ids 3, 5, 4, 6, 8, 7, 9 at columns 74, 78, 84, 88, 96, 98, 106
(`20-recon-scroll-engine.md` §5). **The map is authored with holes and the
background ELEMENTS supply the art.** Op `$10`'s payload is decoded by the port
and its handler `$262366` is unported - W18. So the black cutout is the
missing BGELEM set-pieces, and it has nothing to do with FREEZE, minibosses or
wave 14's tile exhaustion.

For the record of when the page reaches each: the published page seeds at
`$8130CE = $0068` (`assets/seed.bin.gz`, record cursor `$261682`, i.e. frame
~375 of the object, map column ~40). So from the page's first frame the blank
stretch is ~2,100–3,100 frames away (~35–52 s) and the boss lock is ~6,940
frames away (~116 s).

### 2.9 What the port must do

Nothing about `$0C`. It is right. What the port must NOT acquire is a "release
the freeze when nothing is alive" rule - there is no such rule in the listing;
the release is a call from a specific enemy's state machine (`$26C7F4`,
`$26D254`) paired with `$8130F4`.


### 2.10 What changed in the port for JOB 2 (same commit)

* `src/background.js` - `BGO.frozen`'s comment now carries the one-read census
  and names the three external doors by address; op `$0C` emits an
  `unportedLog` note naming `$261142` when its op-`$04` partner armed
  `loops = $FFFF`, so the boss lock is LOUD instead of silent; and a new red
  switch `freeze-stops-the-scroll` implements the misreading.
* `tools/scrollportgate.mjs` - the switch is registered with what it must move.
* `tests/background.test.js` - three tests (§5 below).

MEASURED on the board corpus after the change:

```
node tools/scrollportgate.mjs tools/oracle/out/w17-stage1-invuln.tsv
  RESULT 0 DIVERGENT FRAMES on 12 columns over 10431 logic frames
        1 x $261142 ... op $0C at t=$0344 latched a freeze ... W19 §2
node tools/scrollportgate.mjs ... --break freeze-stops-the-scroll
  RED on 12 column(s): d0ce=10152 d18a=10240 d18c=10218 b012=10379 b016=10083
  b034=10379 b038=10083 b03c=10147 scr0=10151 scr1=10147 bgx=10378 bgy=10082
  first d18c@lf1673
```

The note fires exactly ONCE in 10,431 board frames, at the record the recon
predicted. The mutation reddens every column, first at lf1673 - the opening
freeze (object frame 52 = lf1670), not the boss lock, because the opening
freeze already scrolls 1,824 px while frozen.

---

# JOB 1 - THE LEDGER, ENUMERATED

## 1.0 How this was produced, and what closes wave 5's gap

Wave 5 reported that the score and chain words DO NOT EXIST in our notes. They
do now, and the way they were found is worth recording because the static
census alone would have named the wrong addresses:

1. **Static**: `$286626` was reached from the bomb-cancel loop the plan already
   named (`$24408A moveq #$46,D0 / jsr $28614A`). It is four `abcd` - the whole
   game's scores are PACKED BCD.
2. **Dynamic**: `tools/oracle/w19ledger.lua` + `w19run.py` - a **PLAYING** run
   (auto-shot from lf1800, the owner's left/centre/right drift from lf1900, a
   bomb press every 600 logic frames), write taps with `CURPC` on every
   candidate region, 4,600 logic frames. **THE INTERVENTION, NAMED:
   invulnerability, `$810424 := $FF` from lf1250** - so this run is valid for
   identifying which word is which and which PC writes it, and INVALID for
   pacing or for a rank trajectory. `--poke 0` is the on-distribution control.

**The static census was wrong twice and the write taps caught both:**

* `xref.py` said the rank clock's reset is `$259DCE move.l #$0,$8130C6`. The
  measured reset PC is **`$2603E4`** - a bulk `clr` loop through a base register
  that no absolute-operand search can see. Both exist; only `$2603E4` ran.
* Every `lea $81B4C4,A0` in the score module addresses the long **ending** at
  `$81B4C3`, because `$286626`'s adds are `abcd -(A1),-(A0)`. **The
  predecrement is the whole trap.** Read the `lea` as the address of the
  accumulator and every player is off by one slot - which is exactly the
  contradiction that made two readings of `$2842B0` and `$286096` irreconcilable
  until the tap reported the OFFSETS it was writing.

## 1.1 THE MAP

| word | size | what | first named at |
|---|---|---|---|
| `$81B440` | long, packed BCD | **P1 TOTAL SCORE** (8 digits) | `$28431E` |
| `$81B444` | long, packed BCD | P2 TOTAL SCORE | `$28431E` (D7=1 pass) |
| `$81B448` | long, packed BCD | the HIGH SCORE | `$28439A` |
| `$81B44C`/`$81B44E` | word | per-player overflow digit, capped at 9 with the score pinned to `$99999999` | `$284328`/`$284330` |
| `$81B4C0` | long, packed BCD | **P1 PENDING SCORE** - what every add lands in | `$286630..$286636` |
| `$81B4C4` | long, packed BCD | P2 PENDING SCORE | same, A0 = `$81B4C8` |
| `$81B5AA` | long | `$286626`'s BCD scratch - written once per score add | `$28662C` |
| `$81B5DA` | word, packed BCD | **P1 CHAIN COUNTER** | `$2863B2` |
| `$81B604` | word, packed BCD | P2 CHAIN COUNTER | `$286552` |
| `$81B632`/`$81B634` | word BCD | the chain HIGH-WATER MARK per player | `$2863C2`/`$286572` |
| `$81B5C0` | word | **P1 CHAIN METER** - the timer. Counts DOWN 1/frame, refilled by every hit | `$284636` (−), `$28664E` (+) |
| `$81B5EA` | word | P2 chain meter | `$2866F2` |
| `$81B5B2` | word | the meter CAP, from table `$287DF0[$813098]`. **MEASURED 56 (`$38`) on loop 1** | `$28616C` |
| `$81B5E0` | word | the per-hit meter refill, from table `$287DF4[$81043E]` (P1's weapon) | `$2862D4` |
| `$81B64E`/`$81B64F` | byte | the meter's sub-tick and its reload - only consulted while the HYPER is up | `$284624`/`$28462C` |
| `$81B5CE`,`$81B5D2`,`$81B5D6`,`$81B5B8`,`$81B5BC` | long BCD | the chain's per-hit score accumulators | `$2863D4`..`$2863F8` |
| `$81B5C2`,`$81B5C4`,`$81B5C8`,`$81B5CA`,`$81B5CC` | word | the chain-BREAK POPUP timers (`$50`/`$78`/`$B4`/`$F0` = 80/120/180/240) | `$2845CC`..`$284606` |
| `$8130C6` | **long, 24.8** | **THE RANK CLOCK** | `$2607E4` |
| `$81309E` | word | **THE RANK**, 0..`$FF` | `$260944` |
| `$8130A1..$8130BD` | 11 bytes | the rank FAN-OUT | `$260996`..`$260A18` |
| `$81B646`/`$81B648` | word | the per-player POWER term of rank, capped at `$23` | `$285A62` |
| `$81B65C` | word | the HYPER STOCK LEVEL - what using a super adds to `$81B646` | `$2530CA` (+1), `$285A8A` (clear) |
| `$81B63E`/`$81B640` | word | HYPER ACTIVE | `$285A30` (set 1), `$285B0C` (clear) |
| `$8128F4`/`$812902` | word | the per-weapon pending counters | `$252ED6` `addi.w #$4D` |
| `$8128F6`/`$812904` | long BCD | the per-weapon pending SCORE | `$252EF2`/`$253004` |
| `$812914`/`$812918` | word | the pending-flush RATE LIMITER, reloaded from `$812916`/`$81291A` | `$25295E` (−1) |

## 1.2 SCORE - every site that adds, and by how much

**There is ONE adder in the whole game: `$286626`.** Four `abcd -(A1),-(A0)`
with `sub.w D2,D2` clearing X first; A1 is the scratch `$81B5AE` counting down
from the `move.l D0,(A1)+` at `$28662C`, A0 is the accumulator's END address.
Denominator, both addressing modes, over `$230000..$2A0000`:

```
$286626  ZERO absolute callers, 28 PC-RELATIVE callers -- all in $286xxx
```

Four thin wrappers stand in front of it, and they are what the rest of the game
calls. `D1` is a bitmask supplied by the caller: **bit 4 = credit P1, bit 3 =
credit P2** (`$2860DE`/`$286102`, `$286128`/`$286138`); bit 2 selects an
alternate path (`$286876`/`$286B9C`) and is not yet decoded.

| wrapper | accumulator | abs sites | pc-rel sites | D0 immediates recovered at the site |
|---|---|---|---|---|
| `$28614A` | P1 pending `$81B4C0` | 8 | 5 | `46` ×1, `500000` ×2, `3000000` ×2, `5000000` ×2, `10000000` ×1 |
| `$286154` | P2 pending `$81B4C4` | 8 | 5 | the same six values |
| `$286128` | either, by `D1` | 24 | 0 | `8`×2 `10`×1 `50`×8 `100`×3 `500`×3 `1000`×5 (22 of 24 recovered) |
| `$286102` | either, by `D1` | 0 | 1 (`$2860F6 bra.s`) | - it is `$286096`'s tail |

and two aggregate entry points that every enemy calls:

| entry | what | abs callers |
|---|---|---|
| `$286096` | **A HIT lands.** Computes its own value: `moveq #1,D0 / add.w $81B63E,D0` - **one point plus the hyper level**, not a value from the caller | **85** |
| `$28615E` | **A KILL.** `D0` = the enemy's score value, from the CALL SITE | **87** |

**Every one of `$28615E`'s 87 call sites carries its amount as an immediate,
and all 87 are recovered:**

```
0 1 8x14 10x7 11x3 13x3 14 15 19x2 20 25 26 31 32x2 34x3 42 46 47 55 72 83 88x2
113 115 130x2 133 162 173x2 174 180 234 250 256 271 290 320 350 353 385x2 457
563 600 632 683 700 712 788 800x4 1000x2 60000
```

**THE SELF-CHECK THAT MAKES THAT LIST TRUSTWORTHY:** the values are packed BCD,
so a correct recovery can contain no hex digit A–F. Across all four wrappers
**125 of 125 recovered immediates are valid BCD, zero exceptions.** A back-walk
that was picking up unrelated `moveq`s would fail that at roughly a third of
sites. (`$286096`'s "amounts" are NOT in this list and must not be: it computes
its own, and the back-walk's answers there are the 47-of-85 spurious hits that
proved the check works.)

Two more adders that do NOT go through `$286626` - they inline the same four
`abcd`, and a port that only implements `$286626` loses both:

* **`$249EF0`, THE PENDING FLUSH.** `$8128F6 → $81B4C0` (P1, `$249F16`) and
  `$812904 → $81B4C4` (P2, `$249F54`). Gated by `tst.w $812914 / bne` - a rate
  limiter reloaded from `$812916`. **And on loop 2+ (`$813098 ≠ 0`) it does
  `addq.l #4,A0/A1` and adds THE SAME FOUR BYTES A SECOND TIME** (`$249F34..
  $249F48`) - the second loop scores double, in four instructions.
* **`$2842B0`, THE DRAIN**, one absolute caller (`$28D52E`), no PC-relative
  ones. Pending → total, twice (`$81B4C0→$81B440` for D7=0, `$81B4C4→$81B444`
  for D7=1), then `$284370 move.l D6,(A1)+` clears the pending, then the extend
  check (`$81B4AC`/`$81B4B0` threshold, `$8130BE`/`$8130C0` counter capped at
  `$14`, `$286FDA` + `$28C678` + `$2878CC`/`$28795C`), then the high score.

**MEASURED over the 4,600-frame playing run** (2,983 gameplay frames):
`$28662C` fired **1,423 times** (the total number of score adds);
`$28431E`..`$284324` drained **677 times**; `$284370` cleared **677 times**;
final `$81B440` = `00071528` - 71,528 points, read straight off the BCD.

## 1.3 CHAIN - the counter, the timer, the decrement, and what resets it

The DOJ chain is a METER, not a countdown-from-N. `$2862C6` (P1) / `$286476`
(P2) are the per-hit routines; `$284614`..`$284646` is the per-frame drain.

**THE DECREMENT - `$284636 subq.w #1,$81B5C0`:**

```
284614: D6 = $81B5C0                  ; the meter
28461A: if 0 -> $28465C               ; no chain running: nothing to do
28461C: if $81B63E == 0 -> $284636    ; NO HYPER -> decrement EVERY frame
284624: subq.b #1,$81B64E             ; HYPER UP -> a sub-tick throttles it
28462A: bcc $28464E                   ; ...and only a BORROW lets it through
28462C: $81B64E = $81B64F
284636: subq.w #1,$81B5C0             ; <<< THE CHAIN TIMER DECREMENT
28463C: bne $28464E
28463E: $81B5B8 = 0 ; $81B5CE = 0     ; <<< THE CHAIN EXPIRES
```

**MEASURED: 1,619 of 1,621 per-frame decrements were exactly 1** (the other two
were the `$285A4C` hyper refill and a `$286664` cap write moving it the other
way). So the drain is one unit per LOGIC FRAME while no hyper is up - which is
the third independent reason the work budget must be counted and not timed.

**THE RESET - `$286320 clr.w $81B5DA`**, reached two ways inside `$2862C6`:
falling through from the meter-start path (`$28631C bsr $28663A`) and from the
`$8130F9`-bit-0 / `$811F72` guard at `$2862EA`. `$286314 tst.w $81B5C0 / bne
$286366` is the fork: **the chain continues if and only if the meter is
non-zero at the moment the hit registers.**

**THE INCREMENT - `$286390..$2863B2`**, a hand-rolled 2-byte BCD `+1`
(`sub.w D0,D0 / moveq #1,D0 / abcd D0,D2 / swap / abcd`), then `$2863C2`
updates the high-water mark `$81B632` when it is beaten.

**THE REFILL - `$28663A`**: `$81B5C0 += $81B5E0`, and `$286664` clamps it to
`$81B5B2`. `$81B5E0` comes from `$287DF4[$81043E]` (P1's weapon selector) at
`$2862D4`; `$81B5B2` from `$287DF0[$813098]` (the loop) at `$28616C`.

**MEASURED, whole regions, over the playing run** (`$81B5B0..$81B60F`, 11,130
writes, 178 distinct PC+offset pairs). The top writers, with their offsets
resolved:

```
$284636 -> $81B5C0  1787   THE DECREMENT
$2845CC -> $81B5C8  1779   the chain-BREAK popup countdown
$2845E0 -> $81B5CC  1779   ...its companion up-counter
$284606 -> $81B5CA  1127
$28616C -> $81B5B2   232   the meter cap, rewritten on every hit
$2862D4 -> $81B5E0   232   the per-hit refill amount
$28664E -> $81B5C0   232   the refill
$2863B2 -> $81B5DA   217   THE CHAIN COUNTER +1
$286664 -> $81B5C0   184   the cap clamp
$2863C2 -> $81B632    98   the high-water mark
```

Meter cap seen: **56 (`$0038`) and nothing else** on loop 1. Highest chain
reached in this run: **BCD `0099`**.

## 1.4 RANK - every credit and debit, and the "super" case by name

**`$2608D2` recomputes the rank FROM SCRATCH EVERY FRAME.** There is no
accumulator called "rank"; `$81309E` is a pure function of three inputs:

```
2608D2: A0 = ($81315C)                    ; the per-STAGE base table (a byte array)
2608D8: D2 = $813092                      ; the STAGE INDEX  (see the correction below)
2608E0: D1 = (A0,D2.w).b                  ;  + base[stage]
2608E4: D2 = $8130C6 ; lsr.l #8           ;  + THE RANK CLOCK, 24.8 -> whole units
2608EE: D1 += D2.w
2608F4: if ($81B63E | $81B640) != 0:      ;  + 16 x max(power1, power2), and ONLY
2608FA:    D0 = max($81B646,$81B648)      ;    while a hyper is up
260916:    D0 <<= 4 ; D1 += D0
26091A: if $813098 != 0:                  ; LOOP 2+: rank is PINNED
260924:    $81309E = $FF  (or $F8 if no hyper is up)
260944: else $81309E = D1                 ; then clamped to $F0 (no hyper) / $FF (hyper)
260984..260A18: fan D1's low byte out into ELEVEN bytes $8130A1..$8130BD
```

**THE RANK CLOCK `$8130C6` HAS THREE ABSOLUTE SITES IN THE WHOLE OF BUILD B:**

```
$2607E4  addq.l #1,$8130C6    THE ONLY INCREMENT -- +1 per LOGIC FRAME
$259DCE  move.l #$0,$8130C6   a reset (present; NOT the one that ran)
$2608E4  move.l $8130C6,D2    the read
```
plus **`$2603E4`, a bulk clear through a base register that only the write tap
saw** - measured 2 executions, and it clears `$81309E`, `$8130A0..$8130BD` and
`$8130C6..$8130C9` in one sweep.

`$2607E4` sits in `$260794`, an OBJECT handler (it is `($2,A5)`-dispatched and
has no `jsr`/`bsr` caller anywhere), and it is gated:

```
2607A8: if $813082 != 0 -> rts                 ; the whole tick is skipped
2607B2..2607CC: the $8130D4 hold-off countdown, itself gated on $8130D2
2607DA: if $8130D2 == 0: addq.l #1,$8130C6     ; <<< THE PAUSE STOPS RANK
2607EA: jsr $2608D2                            ; recompute, EVERY frame
2607F6: if $813098 != 0: $81B414 = 1           ; loop 2+ forces power-ladder rung 1
```

### The rank trajectory, MEASURED on 16,000 logic frames of the W17 corpus

`w17stage.lua` already recorded `$81309E` as column 39 and nobody had read it.
57 changes in 16,000 frames; **52 of them exactly 256 logic frames apart** -
`$8130C6 >> 8`, to the frame:

```
lf1618 rank 52   <- stage 1 starts; base[0] with the clock at 0
lf1873 rank 53   (gap 255)
lf2129..lf11857  +1 every 256 frames, to rank 92
lf12360 rank 108 (gap 503 -- $8130D2 was up for ~247 frames of the stage clear,
                  and $2607DA skipped the tick for all of them; the +16 is
                  base[stage 1] - base[stage 0])
lf12421 rank 109 (gap 61)
lf12677..lf15749 +1 every 256 frames, to rank 122
```

and the on-distribution control (`w17-stage1-noinvuln-ctl`) collapses rank to
**0 at lf4637** when the player dies out - the reset.

**CORRECTION TO `w17stage.lua`'s COLUMN LABEL:** it calls `$813092` "loop".
`$813092` went 0 → 1 at lf12360 at the same instant `$813096` (stage × 4) went
0 → 4, while `$813098` stayed 0 for the whole 16,000 frames. **`$813092` is the
STAGE INDEX; `$813098` is the loop.** That matters here because `$2608D8`
indexes the base table with `$813092` - so the base rank is **per stage**, not
per loop, and it steps by +16 from stage 1 to stage 2.

### The credits and debits, complete

| site | effect on rank | notes |
|---|---|---|
| `$2607E4` | **+1/256 per logic frame** | the only time term; paused by `$8130D2` and by `$813082` |
| `$2603E4` | **rank clock := 0** | the measured reset (bulk clear) |
| `$259DCE` | rank clock := 0 | present in the listing; did not execute in either measured run |
| `$285A62 add.w D0,$81B646` | **+16 × `$81B65C` - USING A SUPER** | D0 = the hyper stock level; `$285A68` caps `$81B646` at `$23` |
| `$285B8C` | the P2 mirror of the above, into `$81B648` | |
| `$249976 subq.w #3,$81B646` | **−48**, floored at 0 by `$24997E clr.w` | inside the block gated on `$81B63E != 0` - it only runs WHILE A HYPER IS UP |
| `$2499C6`/`$2499CE` | the P2 mirror | |
| `$2539AA` / `$2539DE` | `$81B646`/`$81B648` := 0 | the per-player hyper-state clear |
| `$24A00E` / `$24A0B2` | read-modify-write of the power word | not yet decoded |
| `$253A0C` / `$253A16` | further writers of the power words | not yet decoded |
| `$813098 ≠ 0` | rank **PINNED to `$FF`** (`$F8` with no hyper up) | loop 2+ |
| `$260958`/`$260970` | clamp to `$F0` with no hyper up, `$FF` with one | |

**THE OWNER'S CASE, CLOSED.** "One wrong rank gain from using super and the
entire route breaks":

```
285A12: if $81B63E != 0 -> already hypering
285A1C: if $81B658 == 0 -> no stock, refuse ($2873AC)
285A24: moveq #$11,D0 / and.b $8103E6,D0 / bne -> the player's state forbids it
285A30: $81B63E = 1                            ; HYPER ON
285A44: if $81B5C0 != 0: $81B5C0 = $81B5B2     ; the chain meter is REFILLED TO
                                               ;   THE CAP -- using a super
                                               ;   rescues a dying chain
285A56: D0 = $81B65C                           ; the stock LEVEL
285A5C: $81B654 = D0
285A62: $81B646 += D0                          ; <<< THE RANK GAIN
285A68: cap $81B646 at $23
285A8A: clr.w $81B65C                          ; the stock is consumed
```

**One level of super = +1 to `$81B646` = +16 rank, on the next frame's
`$2608D2` - but only while `$81B63E` is up, because `$2608F4` gates the whole
power term on "a hyper is active".** `$81B65C` is built by `$2530CA addq.w #1`
(21 absolute sites in total) and cleared by `$285A8A`/`$24A01C`/`$253954`. Get
`$81B65C` wrong by one and rank is wrong by 16 for as long as the hyper runs -
which, per `docs/knowledge/08`, is not a small divergence.

**NOT MEASURED, and named as such:** the playing run never used a super and
never collected a power-up - `$81B646` stayed 0 and `$81B63E` stayed 0 for all
4,600 frames, so the five bomb presses fell through `$249968 tst.w $81B63E /
beq` without touching the power word. **The rank credits above are read from
the listing, not watched.** A run that reaches a hyper is the obvious next
measurement and is a named gap, not a silence.

## 1.5 ORDER WITHIN A FRAME - the owner note §2, measured

`w19ledger.lua` tags 14 load-bearing PCs and prints the ORDER they fired in,
per logic frame, for every frame in which at least three different parts of the
ledger moved. 40 frames kept. **The order is the same on every one of them:**

```
rankclk > rank= > [ CHAIN+ > score+ > meter+ > (meter=cap) > score+ ]*
        > drain > drain0 > (brkT) > meter-
```

Three lines straight out of the log:

```
lf1996 chain=0002 meter=0028: rankclk > rank= > meter+ > CHAIN0 > score+
                              > CHAIN+ > score+ > meter+ > score+ > drain > drain0
lf2062 chain=0010 meter=0037: rankclk > rank= > CHAIN+ > score+ > meter+
                              > meter=cap > score+ > drain > drain0 > brkT > meter-
lf2063 chain=0010 meter=0036: rankclk > rank= > brkT > meter-
```

**The answers the owner asked for, in order:**

1. **THE RANK CLOCK TICKS FIRST**, and `$81309E` plus its eleven fan-out bytes
   are recomputed IMMEDIATELY AFTER - so every other subsystem in the frame
   reads a rank that already includes this frame's tick. `$260794` is an object
   handler, so this is an object-table ORDER fact, not a call-order one: a port
   that runs the rank object late gives the whole frame last frame's rank.
2. **A HIT LANDS BEFORE THE CHAIN TIMER DECREMENTS.** `$284636` is the LAST
   ledger event of the frame, after every hit, after the drain. So a hit on the
   frame the meter would have reached 0 SAVES the chain - the refill happens
   first. A port that decrements first drops that chain one frame early, which
   is precisely the failure `20-OWNER-scoring-must-be-exact.md` names.
3. **THE CHAIN COUNTER INCREMENTS BEFORE THE SCORE ADD**, so the score uses the
   NEW chain value (`$2863B2` then `$2863D4`/`$2863E4`/`$2863F8`).
4. **THE PENDING DRAIN IS ONCE PER FRAME, AFTER ALL HITS AND BEFORE THE
   DECREMENT.** So the visible score never lags a hit by a frame, but the chain
   meter shown alongside it is already one tick lower than when the hit landed.
5. lf1996 shows both chain paths in ONE frame: the first hit found the meter at
   0 (`meter+` → `CHAIN0` → unchained `score+`, i.e. `$28631C`→`$286320`→
   `$286326`), the second found it non-zero (`CHAIN+` → chained `score+`). A
   frame is not atomic and it is not even homogeneous.

## 1.6 What was NOT ported, and why

**Nothing of the ledger is ported.** The brief says do not port yet, and the
one thing that would have been trivially safe - the rank clock - is not, because
`$2607E4` lives in an object handler whose slot order decides item 1 above and
the object is not identified yet. Porting the arithmetic without the slot would
bake in an order that later has to be unpicked.

The DELIVERABLE is this ledger. What a later wave needs and this wave did not
produce:

* **the `D1` bitmask's bit 2** (`$2860EC`, `$286112`, `$286640`) - it selects
  `$286876`/`$286B9C` over the plain wrapper. Not decoded.
* **`$286096`'s guards**: `btst #1,(A6)`, `btst #2,$8130F8`, `$811F72`'s sign
  and bit 0. Read but not explained.
* **the two `$286128` sites whose D0 immediate the back-walk did not find**
  (22 of 24).
* **the second-loop double-score at `$249F34`** is enumerated, never executed -
  every measured run is `$813098 = 0`.
* **`$81B646`'s remaining writers** (`$24A00E`, `$253A0C`, `$253A16`) - the
  power-up pickups, presumably; not decoded and never measured non-zero.
* **the four `$2842B0` extend addresses** (`$81B4AC`/`$81B4B0` thresholds,
  `$8130BE`/`$8130C0` counters) - located, not decoded.
* **a run that uses a super.** Named in §1.4 as the gap it is.
* **`$28615E`'s inner repeat loop** (`$28618A` D2 = `$81B654 − 1`, `$2861BC`
  `dbra`) - it re-enters `$2862C6` `$81B654` times per kill, and `$81B654` is
  the hyper level. Enumerated, never executed (the run never hypered).

---

# 5. THE TESTS, AND WATCHING THEM FAIL

Three new tests in `games/ddpdoj/tests/background.test.js`, and **all three
failed on their first run** - which is the point:

| test | how it went red first |
|---|---|
| `$0C freezes THE CLOCK and NOT the scroll` | asserted the TX camera advanced by `40 × $800`; it advanced by its OWN speed word (`$0020`, `$261180`'s init, because script 1 is empty in the fixture). The assertion was wrong, not the port. Now asserts it MOVED. It then failed a second time on the column-pointer arithmetic and was replaced with a much stronger claim: the SET of stream pointers touched over 40 frozen frames has exactly `len` members. |
| `THE RED SWITCH ... freeze-stops-the-scroll` | expected a 40-frame difference, measured 41 - the mutation's early return sits AFTER `$2612D2`, so the frame on which `$26214C` latches is itself stopped. Restated as a RATIO (one column per `$800` of camera) so the off-by-one cannot become a magic number. |
| `the boss lock is LOUD` | `UnportedLog.report()` returns `"N x $ADDR what"` STRINGS, not records with `.addr`. The first version asked `r.addr === 0x261142` of a string and got `false` - **a check that could not pass**, the eighth defective check this project has found. |

The negative half of the third test (a FINITE repeat must stay silent) is what
stops the note degenerating into "always on".

Full suite after: **210 of 210 pass**. Board gate: **0 divergent on 12 columns
over 10,431 logic frames**, with the new mutation RED on all 12.

---

# 6. FOR THE REVIEWER - where to look hardest

1. **§1.0's two static-census errors.** If the `abcd -(A0)` predecrement
   reading is wrong, every player assignment in §1.1 is off by one slot and the
   whole ledger names the wrong words. The evidence is the tap's OFFSETS
   (`$286630+2` / `$286632+2` / `$286634+0` / `$286636+0` relative to
   `$81B4C0`), not the `lea`s.
2. **§1.5's order.** It is 40 frames of ONE playing run under ONE intervention.
   It is consistent on all 40 and it matches the listing's own order inside
   `$2862C6`, but it has not been checked on a frame where a chain EXPIRES on
   the same frame as a hit - the exact case item 2 is about.
3. **§1.4's rank credits are LISTING-ONLY.** No measured run has ever had
   `$81B646 ≠ 0`. The +16-per-super claim is a translation, not an observation.
4. **`$286096` computes its own value** (`1 + $81B63E`). If that is wrong, the
   per-hit score is wrong everywhere and 85 call sites inherit it.
5. **The `$28615E` amount table.** 87 of 87 recovered by a 40-byte back-walk
   for the last D0 load. The BCD self-check is strong but not a proof; spot-check
   three sites against the listing.
6. **JOB 2's claim that `$261142` has exactly two callers.** That is what makes
   "an enemy releases the boss lock" a fact rather than a story, and it rests on
   an absolute-long scan plus a PC-relative `bsr`/`bra` scan. A `jsr (An)`
   through a table would defeat both.
