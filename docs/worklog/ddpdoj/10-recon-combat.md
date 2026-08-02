# WAVE 10 RECON 4/5 — weapons, hitboxes, collision, damage, scoring, HELD fire

status: **DONE as recon** -- five questions answered with measurements, four
named gaps at the end that each need one run or one tap.
wave: 10   role: recon (READER — nothing in `games/ddpdoj/src/` was edited)
started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER)
unless a line says build A. Machine pin printed on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes.

New tooling added (reader-safe, under `tools/`):
`games/ddpdoj/tools/oracle/w10combat.py` — one `frame.lua` run per invocation
through `pgm.trace`, PROBE_WATCH / PROBE_EXEC / PROBE_RAWDUMP / PROBE_RAMDUMP
only. **It pokes nothing.**

```
python games/ddpdoj/tools/oracle/w10combat.py hold        # B1 held 600 frames
python games/ddpdoj/tools/oracle/w10combat.py dump-hold-2999
python games/ddpdoj/tools/oracle/w10combat.py dump-none-2999
```

---

## 0. THE HEADLINE

```
THE PLAYER HITBOX -- MEASURED, live, VERSION-B, at $8103E6+$10/$12/$14/$16:
   $8103F6 = $0080   $8103F8 = $0100   $8103FA = $0080   $8103FC = $0080
   i.e.  Y: -$100..+$80   X: -$80..+$80   in 1/64 px  ->  4 px WIDE, 6 px TALL
   constant on all 3,000 logic frames of the run (tilt stayed 0)

BLACK LABEL vs THE ORIGINAL, from the SAME cartridge, read from ROM:
   build B ($2553CA -> $2553F2)  X half-extents at tilt 0 =  $0080 / $0080
   build A ($154986 -> $1549AE)  X half-extents at tilt 0 =  $00C0 / $00C0
   -> BLACK LABEL'S HORIZONTAL HITBOX IS EXACTLY 2/3 OF THE ORIGINAL'S
      (4 px wide instead of 6). The belief is TRUE and here is the number.

HELD FIRE -- the held bit DOES reach the cadence machine, on exactly ONE frame,
and that is CORRECT:  $249B48 tests ($19,A6) = $803972 = the EDGE word.
   MEASURED: p1raw=$10 on lf2001..2600 (600 frames), p1edge=$10 on lf2001 ONLY,
   and PROBE_EXEC on $249B50 = 1 at lf2001 and 0 on the other 599.
THE LASER IS NOT IN THE PLAYER ROUTINE AT ALL. It is in the OPTION object:
   $24C134  move.b ($18,A4),($40,A6)   A4 = $8103E6 (player), A6 = option record
   $24C164  btst   #$4,($40,A6)        <-- THE LASER GATE, on the RAW HELD bit
   MEASURED: $8104EA ( = option +$40) = $10 on every one of the 600 held frames.
   MEASURED on the board, holding B1: 6 shots (lf2001..2007), then at
   lf2018 (+17) $8104AB bit 2 latches, then at lf2021 (+20) the LASER RECORD
   $811EF2 goes live ($8200 -> $8201/$9201) and stays live for the rest of the
   hold, while the shot count $81295C falls to 0 and stays there.

THE SCORE AND THE CHAIN EXIST AND ARE NAMED (three waves said they could not be
found; they are in the player's own tail, which the port `note()`s):
   $81B440..$81B443   P1 SCORE, packed BCD (MEASURED 5271 firing vs 64 not)
   $81B4C0..$81B4C3   P1 PENDING score, added into $81B440 by $2842FE and
                      then CLEARED -- reads 0 at every sample point
   $8128F6 (long)     P1 per-frame score INCREMENT, packed BCD
   $8128F4 (word)     P1 chain VALUE, +$4D per step     ($252ED6)
   $8128FE (word)     P1 HIT/CHAIN COUNTER, capped $63 = 99  ($252ECC/$252EDE)
   $812900 (word)     BCD($8128FE) -- the displayed HIT number
   $812910/$812914/$812916   the chain TIMER ($25295E subq.w #1,$812914)
   P2 mirrors: $812902 / $81290C / $812904 / $812908 / $81290E / $812912 /
               $812918 / $81291A
   $242AC6 is the binary->packed-BCD converter (`abcd D1,D1` at $242AD4).

WAVE 8 MISLABELLED ONE THING: `$254078` is **not** the laser, it is the HYPER
shot. `$249C32 btst #0,($1,A6) / $249C3A addq.w #4,D0` selects $2554EA[1] or
[3]; bit 0 of ($1,A6) is set at `$24989E` INSIDE THE BOMB/HYPER BLOCK and
cleared at `$25329A bclr #0,$8103E7`. The templates in [1]/[3] carry type word
`$8004`, and `$25551A[1]/[3]` carry `$8005` -> dispatch entries [4] and [5].
```

---

## 1. THE SHIP-TYPE JUMP TABLE — what its arms actually are

```
249be2: move.w ($58,A6),D0
249be6: add.w  D0,D0
249be8: lea    ($249bf4,PC),A0
249bee: adda.w D0,A0
249bf0: jmp    (A0)
249bf4: bra $249bfc      <- arm 0, ship selector 0
249bf8: bra $249d2c      <- arm 1, ship selector 2
```

**TWO ARMS, and NEITHER is a weapon.** `add.w D0,D0` makes the offset
`ship * 2` and each entry is a 4-byte `bra.w`, so only selectors **0** and **2**
land on an entry; selector 4 would land on `$249BFC` (the *body* of arm 0) and
an odd selector lands mid-instruction. That the game has exactly two ships is
independently visible in the animation pointer table `$25533A`, whose only two
valid longwords are `$255362` and `$2553A6` (entries [2] and [3] are `$001200`
and `$001264`, not ROM addresses).

**Both arms are THE SHOT SPAWN.** The three weapons are chosen elsewhere:

| weapon | where the decision is | gate |
|---|---|---|
| SHOT | `$249B48` in the player routine | mirror bit 4 of the **EDGE** byte `($19,A6)` |
| HYPER | `$249C32`/`$249C3A`, same spawn, different template table | bit 0 of `($1,A6)`, set at `$24989E` in the bomb block |
| BOMB | `$249814` | `$2497FE cmpi.w #$4,$8130CE` AND edge bit 5 |
| LASER | **`$24C164` inside the OPTION object `$24C096`** | bit 4 of `($40,A6)` = the **RAW HELD** byte |

`$2497AA..$2497FE` is the AUTO-SHOT block: operator byte `$80380F` non-zero AND
**raw** bit 6 (Button 3) held AND `($3c,A6) == 0` synthesises an edge with
`bchg #4,($1,A6)` / `bset #4,($19,A6)` on alternate frames — and also sets bit 3
of `($1,A6)` on the player **and on the option record `$8104AA`**.

## 2. HELD vs EDGE — the diagnosis, with the numbers

`$803970` is the RAW HELD mirror, `$803972` the EDGE (`$23D146 not.w D2 /
$23D156 and.w D0,D2`). `$249558` copies raw into `($18,A6)` and edge into
`($19,A6)`. Inside the whole player routine `$249490..$249E90` the EDGE byte is
read at four places (`$249712` bit 6, `$2497D2`/`$2497F8` bit 4, `$24980A`
bit 5, `$249B48` bit 4) and the RAW byte at six (`$2495AA` the direction
nibble, `$2495E2`/`$249622`/`$249666`/`$249682` the four directions, `$2497B2`
bit 6).

**A from-scratch byte scan of `$200000-$2A0000` finds ZERO instructions of the
form `btst #4,($18,An)`** — nothing tests the raw held Button-1 bit through a
`(d16,An)` bit test anywhere in build B. `$803970` itself has only two
absolute-long readers in build B, `$23D16C` and `$23D174`, and `$23D174` has no
absolute-long caller. (Both are LOWER BOUNDS: a base-register or PC-relative
read is invisible to this scan.)

The one consumer that was reachable is the OPTION object, which copies the
player's raw held byte into its own record and tests it there:

```
24c096: lea $8104aa,A6      the P1 OPTION record
24c09c: lea $8103e6,A4      THE PLAYER RECORD
...
24c134: move.b ($18,A4),($40,A6)      <- the RAW HELD byte, copied
24c13a: move.b ($19,A4),($41,A6)      <- and the EDGE byte
24c15a: btst #5,(A4) / beq $24c164
24c160: clr.w ($40,A6)                <- skipped unless player bit 5 is set
24c164: btst #$4,($40,A6)             <- THE LASER GATE
24c16a: beq $24c29e                   <- not held: the ordinary pod path
24c180: jsr $2536fa
24c186: btst #2,($1,A6) / bne -> $24c8be   the SPEED RAMP (wave 4 §4)
24c19c: bsr $24c8be / bsr $24c906 / bcc
24c1a8: bset #2,($1,A6)               <- THE LASER LATCHES ON
```

### What the board actually did, measured

`w10combat.py hold`, VERSION-B, Button 1 held lf2001..2600 (600 logic frames):

```
lf    p1raw p1edge sedge($249B50)  ohold($8104EA)  optf($8104AB)  lz($811EF2)  nshot
2000    0      0        0                0             3             0           0
2001   16     16        1               16             3             0           2
2004   16      0        0               16            19             0           6
2007   16      0        0               16            19             0          10
2008   16      0        0               16             3             0          12
2018   16      0        0               16             7             0          12   <- bit 2 latches
2021   16      0        0               16             7         33280 ($8200)  12   <- LASER LIVE
2022   16      0        0               16           135         33281           12
2043   16      0        0               16             7         37377            0   <- no shots left
...    (lz alternates $8201/$9201 and optf 7/$87 for the rest of the hold)
2601    0      0        0                0             3             0           0
```

Read that as three separate results:

1. **The held bit reaches the cadence machine exactly once, and the ROM means
   it to.** `sedge` is 1 on lf2001 and 0 on the other 599 held frames, because
   `$249B48` tests the EDGE. What follows is the cadence machine's own release
   path (`$249B96`), which drains `($2b,A6)` = 2 and emits a **burst of six
   shots** (`$81295C` 2,4,6,8,10,12) and then goes quiet.
2. **The raw held bit DOES arrive at the laser gate on every frame** — `ohold`
   is `$10` on all 600. `PROBE_EXEC` on `$24C160` (`clr.w ($40,A6)`, the
   *not-taken* side of `$24C15A`) is **0 on every frame of the run**, which is
   the proof that the copy is not cleared before `$24C164` reads it.
   `PROBE_EXEC` on `$24C134` is **1 every frame** — the option object runs.
3. **The laser then comes up, 17–20 frames later**, and the ship stops firing
   shots for as long as it is held. That is the behaviour the owner expects and
   the port does not have.

### The diagnosability answer

The port's held-fire path is **not** silent as of wave 9 — `type5.js:140` now
throws. But the trigger it uses is the SPEED RAMP, not the laser gate:

```js
laserRampWouldMove(held, speedIdx, laserFloor)
  => held >= TYPE5.laserRampFrames && speedIdx !== laserFloor
```

Two measured problems with that trigger, both fixable in one sitting:

* it fires on the **4th** held frame, whereas the board's laser gate `$24C164`
  is entered on the **1st**; and
* `speedIdx !== laserFloor` means **a player already at the speed floor holds
  fire and still gets silence** — the exact failure mode the throw exists to
  prevent, narrowed rather than removed.

The honest trigger is the one the board uses: `($18,A6) bit 4` set, i.e.
`RAM.p1raw & $10`, cited to `$24C134`/`$24C164`, with no dependence on the
speed index at all.

### EVERY OTHER PLACE THE PORT CAN RETURN QUIETLY

`note()` is counted-but-non-throwing by design (`unported.js`). These are the
call sites, and the middle column is what a player can do that lands there:

| site | reachable by | what is lost |
|---|---|---|
| `type5.js:65` **$24C096** | HOLDING fire | **THE LASER** — the whole option object |
| `type5.js:65` **$2634F4** | always | the ENEMY driver ($263502) |
| `type5.js:65` (20 more) | always | `$289B80 $28AD54 $27F95A $288E4E $2890F2 $255DD8 $254680 $255042 $28A098 $2527CE $24A458 $24A46C $24A440 $24A44C $27E99E $252BD0 $281D9A $25354C $25292A $252A52` |
| `type5.js:72` **$28B670** | always | the tail — and **$244D62, THE PLAYER-vs-BULLET COLLISION**, is reached only from here (`$28B6B8/$28B6FE/$28B766/$28B79C jmp $244D62`) |
| `objdriver.js:105` | always | the unported top-level dispatch entries |
| `main.js:204/206/213` | always | main-loop calls #1, #3 and the sprite-list build |
| `shots.js:256` **$28C3BA** | TAPPING fire | the shot's SOUND ($28C3EE for the hyper) |
| `player.js:278` **$249E7E** | always | the shadow emit **and THE SCORE BCD ADD $249F16..$249F88** |
| `isr.js:45/47/51/54`, `input.js:72` | always | four ISR6 routines |
| `player.js:336/345` | firing | **not holes** — these are the ROM's own `bra $249E4E` |

Two of those deserve to be read twice. **`player.js:278` is where the score
lives**: the port counts "player tail: shadow emit + the BCD block" once per
frame and the BCD block is `$249F16 lea $81B4C4,A0 … abcd -(A1),-(A0) ×4`.
And **`type5.js:72` is where the player's collision lives**: `$244D62` has no
other caller.


---

## 3. THE HITBOX — measured, and the Black Label number

### Where it is

`$28B69A lea $8103E6,A4` sets A4 to the player record, then
`$28B6B8 jmp $244D62`, whose first real act is `$244D84 jsr ($2459D0,PC)`:

```
2459d0: move.w ($2,A4),D0
2459d4: move.w D0,D1
2459d6: add.w  ($10,A4),D0      D0 = player Y + (+$10)
2459da: sub.w  ($12,A4),D1      D1 = player Y - (+$12)
2459de: move.w ($4,A4),D2
2459e2: move.w D2,D3
2459e4: add.w  ($14,A4),D2      D2 = player X + (+$14)
2459e8: sub.w  ($16,A4),D3      D3 = player X - (+$16)
```

so the player's four half-extents are **`$8103F6` `$8103F8` `$8103FA`
`$8103FC`**. Wave 2's / wave 4's lead (`$2458C0`, half-extents `($14,A6)` and
`($16,A6)`, `bset #4,(A6)` at `$2458D8`) is the SAME FIELD LAYOUT but on a
different record: that loop's A6 walks `$811F72`, the 45 x `$30` LASER-SEGMENT
table, and `bset #4,(A6)` marks a laser segment, not the ship. **Three waves
have been reading the laser's hitbox and calling it the player's.**

The layout is universal in this game: every collidable record carries
`+$0` flags (bit 15 = live), `+$2` Y, `+$4` X, `+$10 +$12` the Y half-extents,
`+$14 +$16` the X half-extents, and (on the `$20`-stride target records) `+$18`
HP. Position and extents are in 1/64 px -- `$23F3AE`'s `asr.l #6`.

### What it is, measured

`w10combat.py hold`, VERSION-B, 3,000 logic frames:

```
$8103F6 = 128 ($0080)   $8103F8 = 256 ($0100)
$8103FA = 128 ($0080)   $8103FC = 128 ($0080)
ONE distinct value each over the whole run, and the same four words appear in
the 128 KiB RAM image at lf1990:  8103F6: 0080 0100 0080 0080
```

So the ship's own box is **X +/-$80 = +/-2.0 px (4 px wide)** and
**Y -$100..+$80 = 6 px tall**. An enemy bullet's own extents are added on top
(`$244DBC`/`$244DC4` use one word, `($c,A6)`, for BOTH Y edges and `($e,A6)`
for both X edges -- the bullets are symmetric, the ship is not).

### THE X EXTENTS ARE ANIMATION-DRIVEN — and the port already writes them

```
249e68: lea $2553ca,A0
249e6e: moveq #$0,D1 / add.w D1,D1 / add.w D1,D1     (D1 is always 0)
249e74: movea.l (A0,D1.w),A0                          -> $2553F2
249e78: move.l (A0,D0.w),($14,A6)     D0 = ($4e,A6), THE TILT, -$20..+$20 step 4
```

The port already does this: `player.js:274` writes `ctx.tables.anim(tilt).b` to
`rec + P.animB`, and `P.animB` **is `+$14`**. `export-tables.py` exports it as
`anim.b` with `TILT_MIN`/`TILT_STEP` and asserts 17 entries. **It is not an
animation table. It is the ship's horizontal hitbox, and it is already in the
port's RAM under the wrong name.** Renaming it is a comment-and-symbol change
with no behavioural risk, and it turns four bytes of "animation" into the
number the whole game is about.

### BLACK LABEL vs THE ORIGINAL, from the same cartridge

Build A has the identical instruction -- a byte scan of the whole image for
`2D70 0000 0014` (`move.l (A0,D0.w),($14,A6)`) returns exactly two hits,
`$14951C` (build A) and `$249E78` (build B) -- reading a different table:

| tilt | build B `$2553F2` (+X / -X) | build A `$1549AE` (+X / -X) |
|---:|---|---|
| -32 | `0000 / 0080` | `0040 / 00C0` |
| -16 | `0040 / 0080` | `0080 / 00C0` |
| **0** | **`0080 / 0080`** | **`00C0 / 00C0`** |
| +16 | `0080 / 0040` | `00C0 / 0080` |
| +32 | `0080 / 0000` | `00C0 / 0040` |

**Black Label's horizontal hitbox is $80 where the original is $C0 -- exactly
2/3, 4 px wide instead of 6.** Both builds are in `ddpdojblk` and both tables
were read out of the same decrypted image, so this is a comparison and not a
recollection. (The Y half-extents `$8103F6`/`$8103F8` are written at player
init by a path I did not find -- no absolute-long writer, no matching immediate
in the image -- so the A-vs-B comparison above is X only. Measuring A's Y
extents needs one VERSION-A probe run; see BLOCKERS.)

## 4. THE COLLISION LOOPS — five of them, one layout

`$244D62` (the player's pass, reached ONLY from `$28B670`, the type-5 tail):

| # | ROM | A-side (the box) | B-side (walked) | on overlap |
|---|---|---|---|---|
| 1 | `$2459D0` | the PLAYER `$8103E6` | `$817F8E`, 6/10/15/18/20 entries chosen by `$81B414..$81B41A` | `or.b #$10,(-$4,A6)` |
| 2 | `$244DB4` | the PLAYER, +`$2800` | `$816B7C`, stride `$3E`, count `$8171BA` | `or.w $80FA72,(-$4,A6)` |
| 3 | `$244E12` | the PLAYER, +`$2800` | `$8171BE`, stride `$2A`, count `$817F7E` | -- |
| 4 | `$244EE4`/`$244F8C` | the SHOT table `A0` (36 x `$30`) | `$81459C` 100 x `$20` (count `$815E9E`) | `$245044 bset #7,(-$3,A6)`, the two-way damage |
| 5 | `$2450B4` | same | `$81521C` 50 x `$20` (count `$815EA0`) | same |

`$24536E` (the LASER's pass, called from `$24CE46` inside the option object)
walks `$81521C` (50), `$81459C` (100) and `$817F8E` (70) against the 45 x `$30`
laser-segment table `$811F72`.

**THE DAMAGE NUMBERS, from the listing:**

```
SHOT   $245032 D5 = ($14,A6)                  the shot's remaining power
       $245036 tst.w $81308C / bne $245044     <- $81308C IS 1, so...
       $24503E D4 = D5>>2 ; $245042 D5 -= D4   ...THE 75 % PATH IS SKIPPED
       $245044 bset #7,(-$3,A6)                the STICKY hit bit (wave 8 sec 4)
       $24504E ($14,A6) -= ($16,A5)            shot power  -= target HP
       $24505E ($16,A5) -= D5                  target HP   -= shot power
       $245058 cmpi.w #$6f00,(A5) / bcc        ...unless the target's type word
                                                  is >= $6F00
LASER  $245814 subi.w #$208,($18,A5)           520/frame on the LOCKED target
                                                  ($812952/$812954)
       $2458E8 subi.w #$1e0,($18,A5)           480/frame on any overlapped target
```

So a player shot is a **piercing budget**: it and the target subtract each
other's numbers, and `$81308C` decides whether the shot spends 100 % or 75 % of
its power. `$81308C` is 1 in this corpus. **Nothing in this corpus has ever run
the 75 % path**, which is the wave-6 lesson repeating: a rule no frame can see.

## 5. THE SCORE AND THE CHAIN — located, in the routine the port counts

Wave 2 did not produce them, wave 5 refused to guess, wave 8 did not look.
They are in the PLAYER's own tail, twelve instructions past where the port
stops:

```
249f0e: tst.w $812914 / bne $249f4a           <- the chain TIMER gates the add
249f16: lea $81b4c4,A0                         P1 SCORE, one past the low byte
249f1c: lea $81b5aa,A1
249f22: move.l $8128f6,D0                      THE INCREMENT, packed BCD
249f28: move.l D0,(A1)+
249f2a: sub.w D2,D2                            clear X
249f2c: abcd -(A1),-(A0)  x4                   $81B4C0..$81B4C3 += $8128F6
249f34: tst.w $813098 / beq $249f4a
249f3c: addq.l #4,A0 / addq.l #4,A1
249f42: abcd -(A1),-(A0)  x4                   ...the SAME four bytes, again
249f4c: (P2) $81B4C8 / $812904 -> $81B4C4..$81B4C7
```

and the increment is built on a step:

```
252ecc: cmpi.w #$63,$8128fe / beq              the counter is CAPPED AT 99
252ed6: addi.w #$4d,$8128f4                    the chain VALUE, +77 a step
252ede: addq.w #1,$8128fe                      the chain COUNTER
252ee4: D0 = $8128f4 ; jsr $242ac6 ; $8128f6 = D2      BCD(value)
252ef8: D5 >>= 1     ; jsr $242ac6 ; $8128fa = D2      BCD(value/2)
252f08: D0 = $8128fe ; jsr $242ac6 ; $812900 = D2      BCD(counter) -- displayed
25295e: subq.w #1,$812914 / bcc / $812914 = $812916    the chain TIMER
```

`$242AC6` is the binary-to-packed-BCD converter (`abcd D1,D1 / abcd D2,D2 /
abcd D3,D3` at `$242AD4`). `$252E9A`, the routine that owns `$252ECC`, has one
caller in build B, `$27EDB8 jsr $252E9A`, under `btst #$c,D1` on an item's
flags -- so the step is driven by an ITEM pickup, and `$81040A`/`$81040B`
(player `+$24`/`+$25`) are the counter and the target it must reach first.

**What I claim and what I do not.** `$81B4C0`/`$81B4C4` are packed-BCD
accumulators that the player's tail adds `$8128F6`/`$812904` to once a frame,
and `$8128FE` is a 0..99 counter whose BCD lands in `$812900`. I measured them
all at 0 before any shot was fired (the 128 KiB RAM image at lf1990). I have
**not** confirmed by measurement that `$81B4C0` is what the HUD prints -- see
BLOCKERS. I am naming addresses I can point at instructions for, and labelling
the rest candidates.

**One quirk to translate as written, not as intended.** `$249F3C addq.l #4,A0`
runs after four `abcd -(A1),-(A0)`, which have already walked A0 down by 4 -- so
A0 returns to `$81B4C4` and the second block adds **the same increment to the
same four bytes again**. When `$813098` is non-zero the score gain is doubled,
not extended to eight bytes. I did not watch `$813098` and do not know when it
is set.

## 6. THE SHOT SUB-DRIVER `$253A70` — re-verified, plus one correction

Re-derived rather than taken on trust. `$253A70` is unchanged from wave 5:
`lea $810572,A6` / `move.w #$1,D6` in D6's HIGH word / `moveq #$23,D7` /
`D0 = (D1 & $F) * 4` / `lea ($253ADE,PC),A0 / movea.l (A0,D0.w),A0 / jsr (A0)`,
then `lea $810448,A4 / swap D6 / dbra D6` for the second player. 36 slots x
`$30`, twice.

`$253B1E` (dispatch entry [0]) re-disassembled in full:

```
253b1e: bset #$6,($1,A6) / beq $253b3a
253b26: bset #$0,(A6) / bne $253b4a
253b2c: movem.w ($30,A4),D0-D1          the PLAYER's velocity accumulators
253b32: add.w D0,($2,A6) / add.w D1,($4,A6)
253b3a: eori.b #$40,($1c,A6)
253b40: jmp $23f3ae                     THE SPRITE ENQUEUE
```

**The correction.** Wave 8 sec 6 records dispatch entry [4] `$254078` as "THE
LASER", reached from `$2554EA[1]`. Following the tables:

```
$2554EA[0] -> $255532  templates' type words: 8000 8000 8000 8000 8000
$2554EA[1] -> $25556E                         8004 8004 8004 8004 8004
$2554EA[2] -> $2555AA                         8000 ...
$2554EA[3] -> $2555D2                         8004 ...
$25551A[1]/[3]                                8005 ...
```

and `[1]`/`[3]` are selected by `$249C32 btst #0,($1,A6) / $249C3A addq.w #4,D0`
-- bit 0 of `($1,A6)`, which is **set at `$24989E`, inside the BOMB block**, and
cleared at `$25329A bclr #0,$8103E7` (plus `$26D4D6` and `$27C41C`). The same
bit picks the alternate power byte at `$249B30`, forces the reload to 8 at
`$249B5A`, forces the delay to 2 at `$249BC6`, forces D7 to 6 at `$249C1C`, and
picks the sound routine `$28C3EE` instead of `$28C3BA` at `$249D18`. That is a
HYPER, not a hold-fire laser. **`$254078` and `$2541BC` are the HYPER shot
handlers.** The laser is `$811EF2` + `$811F72`, driven from `$24C096`.

## 7. Commands, and their actual output

```
python games/ddpdoj/tools/oracle/w10combat.py hold
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  WROTE .../out/w10-hold.tsv            3000 rows, 81 columns

python games/ddpdoj/tools/oracle/w10combat.py dump-hold-1990
  WROTE .../out/w10-dump-hold-1990.ram.bin   131072 bytes
  $8103F6: 0080 0100 0080 0080     $81B4C0: 0000000000000000
  $8128F4: 0000000000000000        $812910: 0000 0000 0002 0002

python games/ddpdoj/tools/oracle/xref.py dasm 249B2C 240      the cadence machine
python games/ddpdoj/tools/oracle/xref.py dasm 24C096 140      the option object
python games/ddpdoj/tools/oracle/xref.py dasm 2459D0 120      the player box
python games/ddpdoj/tools/oracle/xref.py dasm 28B670 320      A4 = $8103E6
python games/ddpdoj/tools/oracle/xref.py dasm 249E8E 290      the score BCD add
python games/ddpdoj/tools/oracle/xref.py dasm 252EA8 130      the chain step
```

Byte scans run from scratch on `out/maincpu.bin` (state the limit every time:
these see literal opcode bytes at even offsets in a LINEAR sweep, so they are
LOWER BOUNDS and a data region can produce a false hit):

```
bset #0,($1,An)  build B: $254E1C(A0) $249A98(A1) $24CD36(A3)
                          $24989E $24C0C8 $27C410 $27F562 (A6)
btst #4,($18,An) build B: NONE           <- the raw held Button-1 bit is not
                                            bit-tested anywhere in build B
btst #4,($19,An) build B: $249B48 only   <- the EDGE, once
btst #0,($1,A6)  build B: $249B30 $249B5A $249BC6 $249C1C $249C32 $249D18
                          $249D4C $249D62 $249E3E $27E9CC
move.l (A0,D0.w),($14,A6)  WHOLE IMAGE: $14951C (build A), $249E78 (build B)
```

## 8. What I RULED OUT

1. **"The held bit never reaches the game."** False. `$8104EA` carries it on
   every one of 600 held frames; `$24C160`, the instruction that would clear it,
   executed 0 times.
2. **"The laser branch is entered and silently returns" (on the BOARD).** False.
   The board's laser latches (`$8104AB` bit 2 at lf2018) and the laser record
   `$811EF2` goes live at lf2021 and stays live. The silence is entirely on the
   port's side.
3. **"`$2458C0` / `($14,A6)` / `($16,A6)` / `bset #4,(A6)` is the player's
   hitbox."** False. That loop's A6 walks `$811F72`, the laser-segment table.
   The player's is the same four offsets on `$8103E6`, reached through
   `$2459D0` with A4 loaded at `$28B69A`.
4. **"`$254078` is the laser."** False, see sec 6. It is the hyper shot.
5. **"The score and chain words do not exist."** False. Sec 5.
6. **"The `$249BE2` jump table chooses the weapon."** False. Two arms, both the
   shot spawn, selected by ship type (`$58,A6`), which is 0 on every frame of
   every run in this corpus.
7. **The laser's collision routine did NOT run.** `PROBE_EXEC` on `$2453C6`
   (`move.w #$7400,($10,A1)`, inside `$2453C2`) is **0 on all 3,000 frames**,
   including the 580 frames on which `$811EF2` was live. `$811F02` *was* being
   written (60 distinct values), so a different instruction owns it. I did not
   establish why `$2453C2` never ran -- `$2453BA bset #1,(A1) / beq $245608`
   requires bit 1 of the laser record to be ALREADY set and the measured type
   word `$8201`/`$9201` never has it. **This is presence-of-absence and I am
   flagging it, not concluding from it.**

## 9. THE SCORE — corrected by the RAM images, and MEASURED non-zero

Section 5 named `$81B4C0` as the score. The two 128 KiB RAM images say it is
the **PENDING** accumulator, not the total, and the total is four bytes lower:

```
                         lf1990        lf2999   (the firing run)
  $81B440..$81B443       00000000  ->  00005271     <- THE P1 SCORE, packed BCD
  $81B448..$81B44B       00000000  ->  00005271     <- a second copy, same value
  $81B4C0..$81B4C3       00000000  ->  00000000     <- pending, cleared each add
  $81B590                00000000  ->  00005261     <- the PRE-add staged copy
  $81B444 $81B44C $81B450 $81B454   all 0 at both points
```

`$2842B0` is the adder, and it is the only absolute-long reader of `$81B4C0`:

```
2842b0: lea $81b444,A0     lea $81b4c0,A1     lea $81b4ac,A2
        lea $8130be,A3     lea $81b4b4,A4     lea $81b44c,A6   moveq #$0,D7
2842d6: bsr $2842fe
2842d8: lea $81b448,A0     lea $81b4c4,A1     lea $81b4b0,A2
        lea $8130c0,A3     lea $81b4b6,A4     lea $81b44e,A6   moveq #$1,D7
2842fe: tst.l (A1)+ / beq                      nothing pending -> out
284302: tst.w (A3) / bpl                       ...
28430e: move.l (-$4,A0),$81b590                stage the PRE-add total
284316: move.w (A6),$81b594
28431e: abcd -(A1),-(A0) x4                    $81B440..$81B443 += $81B4C0..$81B4C3
284326: bcc / addq.w #1,(A6) / cmpi.w #$a,(A6) the 9th digit; saturate at
284330:   move.l #$99999999,(A0) / move.w #$9,(A6)
28433c: D0 = (A2)  ($81B4AC = the EXTEND THRESHOLD, $02000000 BCD = 2,000,000)
284346: cmp.l (A0),D0 / bhi                    score reached it?
28434a: cmpi.w #$14,(A3) / beq                 at most 20 extends
284350: addq.w #1,(A3) / bsr $286fda / jsr $28c678 / jsr $2878cc   THE EXTEND
284370: move.l D6,(A1)+                        clear the pending word
```

So, in order: **event -> `$81B4C0` (pending, packed BCD) -> `$2842FE` adds it
into `$81B440` and clears it -> `$81B44C` is the 9th digit, saturating at
`$999999999` -> `$81B4AC` is the extend threshold ($02000000 BCD = 2,000,000)
and `$8130BE` counts extends, cap 20.**

`$249F2C` in the player's tail is ONE contributor to the pending word: it adds
`$8128F6` (BCD of the chain value `$8128F4`) once a frame while the chain timer
`$812914` is 0. In my window `$8128F4` was 0, `$812914` was 2, and the tail's
add therefore never ran -- yet the score still grew to `$5271`, so **there are
other writers of `$81B4C0` and they reach it through a register** (`$81B4C0`
has exactly one absolute-long reference in build B, `$2842B8`). Finding them is
a one-sitting job with a write tap on `$81B4C0..$81B4C3`; I did not run it.


### THE CONTROL LANDED — and it is the proof

`dump-none-2999` is the same 3,000-frame script with Button 1 never pressed:

```
                    hold @lf1990   hold @lf2999   NONE @lf2999
  $81B440  SCORE      00000000       00005271       00000064
  $81B448  copy       00000000       00005271       00000064
  $81B590  pre-add    00000000       00005261       00000063
  $81B4C0  pending    00000000       00000000       00000000
  $8128F4 $8128FE $81B44C   0 at all three points
```

**`$81B440` is the P1 SCORE.** Same boot, same 3,000 frames, same everything
except the fire button: 5,271 against 64. `$81B590` shows the last add was +10
in the firing run and +1 in the control, so the pipeline is live in both and
only the amount differs. `$81B4C0` reads 0 at every sample point because
`$284370` clears it in the same routine that consumes it -- which is why a
per-frame WATCH of it would have looked dead and why sec 9's correction matters.

## 10. What I could NOT do, and why

1. **No VERSION-A live run.** The Black Label hitbox comparison is X-only and
   read from ROM. The Y half-extents `$8103F6`/`$8103F8` have no absolute-long
   writer and no matching immediate anywhere in the image, so build A's Y
   numbers need one `w10combat.py` run with `build="A"` and no chooser input.
   The RAM layout is shared (build A references `$8103E6` at 40+ sites), so the
   same PROBE_WATCH string works unchanged.
2. ~~The `none` control RAM image did not finish.~~ **It did** -- see the block
   above. The score claim is measured against a control.
3. **No write tap on `$81B4C0`.** See sec 9. The per-event score writers are
   unnamed. I am not going to name a plausible one.
4. **The tilt sweep of the hitbox was never exercised.** `ptilt` was 0 on all
   3,000 frames because no direction was held, so `$8103FA`/`$8103FC` never
   left `$0080`/`$0080`. The 17-entry table is READ FROM ROM, not measured in
   motion. One run with `L`/`R` in the script closes it.
5. **The laser's collision routine never executed** -- see sec 8 item 7. I
   measured 0 and did not find out why.
6. **`$813098`, which doubles the score add at `$249F34`, was not watched.**
7. **The five enemy handlers, the bomb `$249814`, and the option object are
   still untranslated** -- unchanged from waves 5 and 8. I read them; I did not
   port them, and this wave was recon.
8. **Everything derived from a byte scan is a LOWER BOUND.** `btst #4,($18,An)`
   returning zero hits means "no `(d16,An)` bit test of that bit exists in the
   linear sweep", NOT "the game never looks at the held button". The game
   demonstrably does look at it -- through `$24C134`'s byte copy.

## 11. THE WORK LIST — in the order the measurements support

Each item is sized for one implementer in one sitting, and each says what the
`capture.bin` recording no longer has to supply once it lands.

1. **Rename `animB` to what it is, and put it in `WATCH_SPEC`.**
   `player.js` `P.animB` (`+$14`) and `export-tables.py`'s `anim.b` are the
   ship's X half-extents, table `$2553F2`, indexed by the tilt. No behaviour
   changes; four RAM words stop lying. Add `$8103F6/$8103F8/$8103FA/$8103FC` as
   compared columns (wave 5's rule 7: a compared column is the only thing that
   is checked). *Removes from the capture: nothing yet -- this is the
   prerequisite that makes everything below checkable.*
2. **Move the held-fire throw from the speed ramp to the laser gate.**
   `type5.js:140` fires on held frame 4 and only when `speedIdx !== laserFloor`;
   the board's gate is `$24C164 btst #4,($40,A6)` on held frame 1 with no such
   condition. Cite `$24C134`/`$24C164`, drop `laserRampWouldMove`'s second
   argument from the guard (keep it in the message). *Removes: nothing --
   it removes a SILENCE, which is the thing that cost the owner a play session.*
3. **Port `$244D62` + `$2459D0`: the player's hitbox and its three bullet
   passes.** It is reached only from `$28B670`, which `type5.js:72` currently
   counts. The box builder is 8 instructions; the three loops are 20 each; the
   record layout (`+$2 +$4` position, `+$10..+$16` extents) is already proven.
   Compare `$80FA74..$80FA7B` (the clip box the routine writes) and the flag
   bits it sets. *Removes: the capture no longer has to supply "the ship is
   never hit" -- the port can decide it.*
4. **Port the score pipeline: `$2842B0`/`$2842FE` and the player tail's
   `$249F16..$249F88`.** Small, self-contained, all-BCD, and it turns
   `player.js:278`'s `note()` into real code. Ship `$242AC6` (bin->BCD) with it.
   First put a write tap on `$81B4C0..$81B4C3` to enumerate the per-event
   contributors -- that is the measurement that must precede the port.
   *Removes: the HUD's score digits, which today are recorded pixels.*
5. **Port the OPTION object `$24C096` far enough to reach the laser gate.**
   The gate, the pod records `$8104AA`/`$81050E`, the `$24BBAA`-indexed
   template copy, and the branch to `$24C29E` (no laser) vs `$24C180` (laser).
   This is the single largest unlock: it is wave 8's own item 1 (it caps
   `nshot`, the sprite-request containment check and the shot window all at
   once) AND it is where the laser lives. *Removes: the option pods stop being
   spliced from the capture at a fixed offset, and HOLDING fire starts doing
   something.*
6. **Port the laser body: `$811EF2` (the beam record) and `$811F72` (45
   segments), then `$24536E` and its three target passes.** Depends on 5.
   Note sec 8 item 7 first: `$2453C2` did not execute in 580 frames of held
   fire and nobody knows why. *Removes: the beam, which the capture cannot
   supply at all because the recorded player never held fire.*
7. **Port the shot-vs-target collision `$244FEC`/`$2450B4` and the target
   tables `$81459C`/`$81521C`.** This is wave 8's blocker on the 125-frame
   window: with the hit path real, the shot gate stops needing a window with
   `hitex == 0`. Depends on the enemy records existing (item 8).
   *Removes: "nothing can be shot" -- the headline of the whole round.*
8. **The five enemy handlers** `$2688CC $268232 $26A2E2 $269CEA $275914`,
   unchanged from wave 5, plus the `$20`-stride target records they publish
   into `$81459C`/`$81521C` (counts `$815E9E`/`$815EA0`). The largest item and
   the last one that matters. *Removes: the enemies themselves.*
9. **The bomb `$249814` and the hyper `$24989E`/`$254078`/`$2541BC`.** Both are
   named throws today and both are genuinely optional for a playable slice.
   *Removes: two more recorded-only effects.*
