# RECON 20 - THE ENEMY-BULLET PATTERN TABLES

status: **DONE as recon**, with five named gaps in "What I could NOT do".
wave: 20 (recon 3 of 5)   role: recon (READER - nothing in `games/ddpdoj/src/` touched)
started / finished: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$2Axxxx`, 2002.10.07 BLACK VER)
unless a line says build A. Every static read is against the decrypted image
`games/ddpdoj/tools/oracle/out/maincpu.bin`, 6,291,456 bytes.

New tooling, `games/ddpdoj/tools/recon20b/` - a PRIVATE directory. A sibling
agent was concurrently writing `games/ddpdoj/tools/recon20/`, so this wave's
files were copied out of the shared path mid-run to avoid clobbering. Nothing
in `src/` was touched.

| file | what it is |
|---|---|
| `firescan.py` | every `jsr`/`jmp` to a fire ENTRY POINT, with D0 back-decoded |
| `firemap.py` | the same, attributed to the enemy TYPE whose code region contains it |
| `recon20.lua` + `run.py` | the runtime census: every bullet spawned, its kind / speed / direction / firing enemy |
| `pcprobe.lua` + `runpc.py` | the diagnostic that measured WHICH PCs write the bullet pool |

---

## 0. THE HEADLINE

**Wave 10 §6 named the wrong pool, and the owner's framing is right but the
tables are not where a Cave-hardware instinct puts them.**

```
THE ENEMY BULLET SYSTEM, counted from the ROM:

  POOL          $817F8C   210 slots x $40 bytes   ($817F8C..$81B40B)
                cleared by $281330 `move.w #$D1,D0` -- 210, from the listing
  LIVE COUNT    $81B40C, accumulated once per live bullet at $281E58
  ACTIVE WINDOW $81B414/$81B416/$81B418/$81B41A gate 70/110/160/190/210 slots
  MOVER         $281DDE
  SPAWN CORES   $2814B6 (angle x4 inside)   $2817C2 (angle pre-scaled, sets bit 9)
  ENTRY BANK    TWENTY entry points in two banks, $2813F0..$2814B6 and
                $2816F6..$2817C2 -- the N-way / speed-layer GENERATORS
  KIND TABLES   $281956 template[39]  $2815C6 spawn-init[39]  $282030 behaviour[39]
  ANGLE MATHS   $284190 -> $283F50 (256-word fold) + $200920 (256 speed tables
                of 65 x 8 bytes) + $2841C2 (4-way quadrant negate)

  39 BULLET KINDS TOTAL.  911 FIRE CALL SITES.  20 GENERATOR ENTRY POINTS.
  STAGE 1: 91 fire sites, 9 distinct kinds, in 15 of the script's 21 types.
```

**Wave 10 §6's `$8171BE` is the IMPACT/EFFECT pool, not the bullet pool.** It is
80 records of `$2C` (70 at `$8171BE` + 10 at `$817DC6`; allocators `$27F8F8` and
`$27F92A`; spawner `$280B3E`; 20-entry tables `$280E4A` and `$280BCE`; mover
`$27F95A` with a **20**-entry dispatch at `$27F99E`, not 32 - entry 20 at
`$27F9EE` disassembles as `moveq #1,D0 / lea $817F86,A0`, i.e. code). Its
callers include `$281D2E`, which sits **inside the loop over the player-shot
pool, on expiry**.

The proof that `$817F8C` is the enemy bullets is the bomb - nothing else is
worth points to a bomb:

```
244074: lea $817F8C,A2 / move.w #$D1,D7        210 slots
244080: tst.w (A2) / bpl                        the alive bit
24408A: moveq #$46,D0 / jsr $28614A             SCORE for a cancelled bullet
2440A0: lea ($40,A2),A2 / dbra D7
2440B6: lea $817F8C,A0 / move.w #$D1,D7 / move.w #$5100,D2
2440CC: addq.w #1,$81B5B4                       count of CANCELLABLE bullets
```

**And the structural headline for the port:** there is no bullet-pattern DATA
record. A pattern is a *call* - an entry point (the fan shape) plus five
registers - and the fan counts and angle steps are immediates in unrolled or
`dbra`-looped code at 911 sites. The tables are the 39 bullet KINDS, the
velocity field, and the muzzle ellipses. Port the generator bank and the kind
tables once and every call site becomes a five-tuple.

---

## 1. HOW A BULLET IS SPAWNED - the parameter record IS the register set

The call convention, read off `$281554` (core `$2814B6`) and `$281860`
(core `$2817C2`):

| reg | meaning | evidence |
|---|---|---|
| **D0.l** | the PATTERN WORD. `D0 & $3F` = **BULLET KIND** (0..38); `D0 >> 16` = a signed **SPEED BIAS** | `$281556 andi.w #$3F,D0`; `$281578 add.w (A7),D7` - `(A7)` is the HIGH word of the `move.l D0,-(A7)` pushed at `$281554` |
| **D1.b** | the **ANGLE**. Bank A (`$2813F0`…) takes it in **1/64 turn** and scales it (`add.b D1,D1` twice at `$281586`); bank B (`$2816F6`…) takes it already in **1/256 turn** | `$281586`, `$2813D4`, `$281862` |
| **D2.l** | the spawn POSITION, axis A in the high word, axis B in the low | `$28156A move.l D2,(A0)+` |
| **D3.l** | a position DELTA applied after the copy; for some kinds also a pattern parameter stored at rec+`$28` | `$28159C tst.l D3 / $2815A0`; `$2818B4` |
| **D4.l / D5.l** | per-kind extra parameters, written by the spawn-init | `$2818B4 move.l D4,($1c,A0)`; `$2818F4 move.w D5,($26,A0)` |
| **A5** | the FIRING ENEMY's record - kind 28's init copies `($3,A5)`, the target-player index | `$281930 move.b ($3,A5),($1a,A0)` |

Both cores:

1. bail if `$8130D4 + $8130D2 + $811F72 != 0` (freeze / pause / bomb), with an
   escape at `$28153C`/`$281848` when `$811F72` is negative with bit 0 set;
2. search the pool from slot 0 for `tst.w (A0) == 0`, **5 slots per unrolled
   iteration**, `D7+1` iterations, `D7 = $D/$15/$1F/$25/$29` selected by
   `$81B414`/`$81B416`/`$81B418`/`$81B41A` → **70 / 110 / 160 / 190 / 210
   slots**. Pool full → `ori #1,SR` (CARRY) and **the shot is silently dropped**;
3. copy the 20-byte TEMPLATE for the kind;
4. `speed = template.speed + D0.hi + $813160 + $812950`;
5. `jsr` the per-kind SPAWN-INIT from `$2815C6[kind]` iff the template's last
   word is non-zero.

### The bullet record - `$40` bytes

| off | field | written by |
|---|---|---|
| `+$00` w | TYPE WORD. `$8100\|kind` from the template, `\|$200` from `$2817C2`. bit15 alive, **bit 8 = "run the behaviour dispatch"**, bit 7 = the `$281F3E` mover path, bit 12 = kill | `$281568` / `$28187A` |
| `+$02` l | POSITION, axis A high / axis B low, 1/64 px | `$28156A` |
| `+$06` w, `+$08` w | sprite render offsets (template) | `$28156C` |
| `+$0A` l | sprite descriptor | `$28156E`, rewritten by the behaviour |
| `+$0E` w | graphic index | `$281570` |
| `+$1A` b | **SPEED INDEX** (0..255) | `$28158A` / `$281898` |
| `+$1B` b | **DIRECTION**, 8-bit = 1/256 turn | `$28158E` / `$28189C` |
| `+$1C` w | sprite attribute | `$281572` |
| `+$1E` l | VELOCITY, dA high / dB low - **recomputed from `+$1A`/`+$1B` every frame** | `$281F02 movem.w D2-D3,($1e,A6)` |
| `+$22` l | **THE PER-BULLET CONTINUATION** - `jmp`ed every frame | installed by the behaviour, jumped at `$281EBC` |
| `+$28`..`+$36` | per-kind pattern parameters (D3/D4/D5, `$8130D8`/`$8130DA`, the target index) | `$2818B4`..`$281942` |
| `+$3A` b, `+$3B` b | the ORIGINAL speed / direction | `$281592` / `$281596` |

### The TEMPLATE record - 20 bytes, at `$2819F4 + kind*$14`

| off | size | meaning | across all 39 |
|---|---|---|---|
| `+$00` | w | type word | `$8100\|kind`, plus bit 7 for kinds 16,17,18,20,21 and bit 5 for kind 35 |
| `+$02` | l | sprite render offsets | `$FC00FD00` / `$FC00FE00` / `$FE00FE00` |
| `+$06` | l | sprite descriptor | `$00000000` in every one |
| `+$0A` | w | graphic index | `$0418` / `$0410` / `$0210` |
| `+$0C` | w | sprite attribute → rec+`$1C` | `$001A` in every one |
| `+$0E` | w | **BASE SPEED** | **20 in every one of the 39** |
| `+$10` | w | run the spawn-init? | 0 or 1 |
| `+$12` | w | padding | 0 |

Kinds 10, 14 and 15 share template `$281ABC`, so **37 distinct templates behind
39 kinds**.

---

## 2. THE TWENTY GENERATORS - the "patterns", and they are code

`$2813F0..$2814B6` (bank A, angle in 1/64 turn) and `$2816F6..$2817C2` (bank B,
angle in 1/256 turn) are two banks of entry points. Each is a fixed sequence of
core calls with angle and speed deltas, and most are gated on the RANK word
`$813098` - the scan that found them:

```
$ python - (byte scan for `tst.w $813098` in $281000-$282000)
rank-gated entry heads: 281264 2813F0 281402 281420 281432 281442 281450
                        281484 2814AC 2816F6 281708 281726 281744 281754
                        281764 281776 2817A8 2817B8
```

| entry | rank≠0 shape | rank=0 | sites |
|---|---|---|---|
| `$2813F0` | 1 bullet | 1 | 86 |
| `$281402` | 1 bullet, **speed +4** | 1 | 27 |
| `$281420` | 2 bullets, same angle, speed +0/+6 | 1 | 4 |
| `$281432` | 3 bullets, same angle, speed +0/+5/+10 | 1 | 0 |
| `$281442` | 2 bullets, **angle −8 / +8** (1/256 units = ±11.25°) | 1 | 20 |
| `$281450` | as `$281442`, speed +4 | 1 | 10 |
| `$281484` | 3 bullets: centre speed +2, then −8 / +8 | 1 | 8 |
| `$281494` | 2 bullets, same angle, speed +0/+4 | 1 | 0 |
| `$2814AC` | flags-adaptive: `($D,A5) & $81` picks 2-way, else bit 1 of the sub-record picks 2-way, else 3-way | 1 | 42 |
| `$2814B6` | the core | - | 0 |
| `$2816F6` | 1 bullet | 1 | **120** |
| `$281708` | 1 bullet, speed +4 | 1 | **111** |
| `$281726` | 1 bullet, speed +2 | 1 | 4 |
| `$281744` | 2 bullets, speed +0/+6 | 1 | 57 |
| `$281754` | 3 bullets, speed +0/+5/+10 | 1 | 0 |
| `$281764` | 2 bullets, angle −8/+8 | 1 | 85 |
| `$281776` | 2 bullets, angle −8/+8, speed +6 | 1 | 1 |
| `$2817A8` | 3 bullets: centre, −8, +8 | 1 | 17 |
| `$2817B8` | flags-adaptive, as `$2814AC` | 1 | **271** |
| `$2817C2` | the core, called directly | - | 48 |
| | | **TOTAL** | **911** |

**Every rank-0 path emits ONE bullet.** Rank is what turns a single into a fan.
That is the single most important gameplay-shaping fact in this subsystem and it
was never exercised: `$813098` measured **0** in every run below.

### The fans above 3-way are LOOPS at the call site, with immediates

Two idioms, both parameterised exactly the way the owner predicted - count,
step, base offset, kind, speed - but as instruction operands, not table rows.

`$273B44`, the stage-1 midboss (type `$80`), a `dbra` ring:

```
273B4E: moveq #$4,D0                          KIND 4, speed bias 0
273B50: cmpi.w #$4,$813092 / beq -> D0 = $FFFF0004    speed bias -1 on loop 4
273B62: subi.b #$1C,D1                        BASE = aim - 28/256
273B66: moveq #$8,D6                          STEP  = 8/256  (11.25 deg)
273B68: moveq #$7,D7                          COUNT = 8
273B6A: lea $2735FA,A0                        the 64-entry MUZZLE ELLIPSE
273B70: D3 = D1 + 2 ; D3 &= $FC ; D3 = (A0,D3.w) ; D3 += D5   the muzzle point
273B7E: jsr $2817B8                           FIRE
273B84: add.w D6,D1 / dbra D7                 step and repeat
```

and immediately after it, the same shape with **KIND 5, base = aim − 36, step
12/256, count 7**, over muzzle table `$2736FA`.

`$264084`, a boss, the same thing HAND-UNROLLED over `$2814AC` eight times with
`subq.b #4,D1` / `addi.b #$10,D1` / `addq.b #4,D1`.

`$2735FA` is a **64-entry table of (dA,dB) muzzle offsets forming an ELLIPSE**,
semi-axes 716 and 476 - ratio 1.504:

```
 0:(  716,    0)   8:(  500,  336)  16:(    0,  476)  24:( -500,  336)
32:( -716,    0)  40:( -500, -336)  48:(    0, -476)  56:(  500, -336)
```

`$268B1E` is a second one, 32 entries, semi-axes 1408 and 960, sampled every
other entry by `andi.w #$3C,D1 / D2 = D1*2`. `$2736FA` is a third.

---

## 3. THE ANGLE AND SPEED MATHS - `$284190`, exactly

```
284190: D0 = speed * 4
284194: A3 = [$200920 + speed*4]            the per-speed table
28419E: D3 = dir * 2
2841A2: A2 = $283F50 + dir*2 ; A3 += (A2)   the FOLD table
2841AA: D2 = (A3)+ (long)  D3 = (A3)+ (long)
2841AE: D2 >>= 4 ; D3 >>= 4                 arithmetic; the tables are 1/16ths
2841B2: D1 &= $C0 ; jmp ($2841C2,D1)        the QUADRANT
        +$00  $2841C2  rts                        Q0  ( dA,  dB)
        +$40  $284202  neg.w D2 ; rts             Q1  (-dA,  dB)
        +$80  $284242  neg.w D2 ; neg.w D3 ; rts  Q2  (-dA, -dB)
        +$C0  $284282  neg.w D3 ; rts             Q3  ( dA, -dB)
```

* **DIRECTION unit = 1/256 turn** (1.40625°). Bits 0..5 pick the quarter-angle,
  bits 6..7 pick the negation. Call sites in bank A pass **1/64 turn** and
  `$281586` multiplies by 4; bank A's `andi.w #$3C,D1` idiom therefore quantises
  the aim to 1/64 before scaling.
* `$283F50` is **256 words, measured to be exactly `8 * fold(i)`** with `fold` a
  triangle of period 128 peaking at 64. Verified in full:
  `all values multiple of 8: True   max: 512   exact triangle wave: True`.
* `$200920` is **256 longwords**, entry *s* = `$200D20 + s*$208`, verified as an
  exact arithmetic progression over all 256 with the last table ending at
  `$221520` (the next known data object). Each table is **65 records of 8 bytes**
  (two longwords, dA then dB) for quarter-angles 0..64 inclusive.
  **256 speeds x 65 angles x 8 bytes = 133,120 bytes of velocity table.**
* **SPEED unit**: after `>>4` the values are position deltas in 1/64 px/frame.
  Sampled at quarter-angles 0,8,16,24,32,40,48,56,64:

```
speed  1 @200f28: (11,0) (10,1) (10,2) (9,4) (7,5) (6,6) (4,6) (2,7) (0,7)
speed 16 @202da0: (179,0) (174,22) (165,44) (148,66) (125,84) (99,98) (67,110) (33,116) (0,119)
speed 32 @204e20: (358,0) (348,44) (330,88) (296,132) (250,168) (198,196) (134,220) (66,232) (0,238)
speed 63 @208d18: (704,0) (685,86) (649,173) (582,259) (492,330) (389,385) (263,433) (129,456) (0,468)
```

  magnitude ≈ **11.17·s along axis A and 7.43·s along axis B** - **the field is
  an ELLIPSE, 1.5:1, the same ratio as every muzzle table.** Speed 0 is all
  zeros. Template base speed 20 ⇒ ≈3.5 px/frame before biases; speed 63 ⇒ 11
  px/frame on axis A.
* **Velocity is recomputed from `(+$1A, +$1B)` every frame** (`$281EFA..$281F02`),
  so a pattern curves by writing the direction byte; it never integrates a
  stored vector. A port that stores dx/dy and forgets the recompute will get
  every curving and homing bullet wrong.

---

## 4. THE 39 KINDS - the complete inventory

`$281956[39]` templates, `$2815C6[39]` spawn-inits, `$282030[39]` behaviours.
All three end at index 38: `$281956+39*4 = $2819F2` is immediately followed by
template data at `$2819F4`; `$2815C6+39*4 = $281662` is code; `$282030+39*4 =
$2820CC` is code. **39, three independent ways.**

**The `$282030` entry is an INITIALISER, not the per-frame behaviour.** It runs
once (the mover dispatches it while type-word bit 8 is set), sets up the
graphic, and **installs a per-bullet continuation at rec+`$22`** which the mover
then `jmp`s every frame at `$281EBC movea.l ($22,A6),A0 / jmp (A0)`. Measured
statically: **all 39 install exactly one continuation** (`move.l #imm,($22,A6)`),
and kinds 2 and 21 share `$283CE4`.

Nine distinct SPAWN-INITs - this is the closest thing to a per-kind parameter
record:

| init | writes (offsets from the record base) | kinds |
|---|---|---|
| `$2818AC` | nothing | 21 kinds |
| `$2818B4` | `+$28`=D3.l, `+$2C`=D4.l, `+$34`=0 | 3,4,5,6,35 |
| `$2818C8` | `+$34`=D4.b | 17 |
| `$2818D4` | `+$34`=D4.w | 18 |
| `$2818E0` | as `$2818B4` | 19,22 |
| `$2818F4` | as `$2818B4` plus `+$36`=D5.w | 23,24 |
| `$28190C` | `+$28`=`$8130D8`, `+$2A`=`$8130DA`, `+$2C`=D4.l, `+$34`=0, `+$36`=D5.l | 27,32,36,37,38 |
| `$281930` | `+$2A` = `($3,A5)` **the target-player index**, `+$2C`=D4.l | 28 |
| `$281942` | `+$28`=D3.l, `+$2C`=D4.l, `+$34`=D5.l | 30,31 |

| k | template | type word | init ($282030) | continuation | spawn-init | notable |
|---|---|---|---|---|---|---|
| 0 | `$2819F4` | `8100` | `$282104` | `$28213E` | `$2818AC` | |
| 1 | `$281A08` | `8101` | `$282162` | `$28219E` | `$2818AC` | |
| 2 | `$281A1C` | `8102` | `$2821C2` | `$283CE4` | `$2818AC` | 554 bytes |
| 3 | `$281A30` | `8103` | `$2823EC` | `$282420` | `$2818B4` | |
| 4 | `$281A44` | `8104` | `$2824A8` | `$2824DC` | `$2818B4` | most-fired kind in stage 1 |
| 5 | `$281A58` | `8105` | `$282564` | `$282598` | `$2818B4` | |
| 6 | `$281A6C` | `8106` | `$282620` | `$282654` | `$2818B4` | |
| 7 | `$281A80` | `8107` | `$2826DC` | `$282738` | `$2818AC` | |
| 8 | `$281A94` | `8108` | `$282772` | `$2827BC` | `$2818AC` | |
| 9 | `$281AA8` | `8109` | `$2827E0` | `$28281C` | `$2818AC` | |
| 10 | `$281ABC` | `810A` | `$282840` | `$28287C` | `$2818AC` | |
| 11 | `$281AD0` | `810B` | `$2828A0` | `$2828EA` | `$2818AC` | |
| 12 | `$281AE4` | `810C` | `$282908` | `$282944` | `$2818AC` | |
| 13 | `$281AF8` | `810D` | `$282962` | `$28299E` | `$2818AC` | the common aimed shot |
| 14 | `$281ABC` | `810A` | `$282840` | `$28287C` | `$2818AC` | shares kind 10 |
| 15 | `$281ABC` | `810A` | `$282840` | `$28287C` | `$2818AC` | shares kind 10 |
| 16 | `$281B0C` | `8190` | `$2829BC` | `$2829FE` | `$2818AC` | bit 7 ⇒ `$281F3E` mover path |
| 17 | `$281B20` | `8191` | `$282A1E` | `$282A66` | `$2818C8` | bit 7 |
| 18 | `$281B34` | `8192` | `$282AAE` | `$282AF6` | `$2818D4` | bit 7; **calls `$263684` - SPAWNS AN ENEMY** |
| 19 | `$281B48` | `8113` | `$282B30` | `$282B64` | `$2818E0` | |
| 20 | `$281B5C` | `8194` | `$282BEE` | `$282C2A` | `$2818AC` | bit 7 |
| 21 | `$281B70` | `8195` | `$282C56` | `$283CE4` | `$2818AC` | bit 7 |
| 22 | `$281B84` | `8116` | `$282D42` | `$282D76` | `$2818E0` | |
| 23 | `$281B98` | `8117` | `$282E00` | `$282E4A` | `$2818F4` | |
| 24 | `$281BAC` | `8118` | `$282EBC` | `$282EF0` | `$2818F4` | |
| 25 | `$281BC0` | `8119` | `$282F6E` | `$282F9E` | `$2818AC` | 324 bytes |
| 26 | `$281BD4` | `811A` | `$2830B2` | `$28310E` | `$2818AC` | |
| 27 | `$281BE8` | `811B` | `$283148` | `$283194` | `$28190C` | inlines `$283F50`+`$2841C2` - CURVES |
| 28 | `$281BFC` | `811C` | `$283260` | `$283290` | `$281930` | **calls `$242748` (AIM) and `$2817C2` - the TRACKING bullet** |
| 29 | `$281C10` | `811D` | `$28330C` | `$28333C` | `$2818AC` | |
| 30 | `$281C24` | `811E` | `$283430` | `$28349A` | `$281942` | |
| 31 | `$281C38` | `811F` | `$2834FE` | `$283568` | `$281942` | |
| 32 | `$281C4C` | `8120` | `$2835CC` | `$283616` | `$28190C` | |
| 33 | `$281C60` | `8121` | `$2836A8` | `$2836D0` | `$2818AC` | |
| 34 | `$281C74` | `8122` | `$28371C` | `$28374C` | `$2818AC` | |
| 35 | `$281C88` | `81A3` | `$283850` | `$28388A` | `$2818B4` | |
| 36 | `$281C9C` | `8124` | `$2838C6` | `$283912` | `$28190C` | inlines the angle maths - CURVES |
| 37 | `$281CB0` | `8125` | `$2839DE` | `$283A2A` | `$28190C` | inlines the angle maths - CURVES |
| 38 | `$281CC4` | `8126` | `$283AF6` | `$283B42` | `$28190C` | |

Behaviours + continuations occupy `$282104..$283BAF`, ≈6.7 KB.

---

## 5. HOW A PATTERN IS SELECTED

Four choices; three are static and one is not:

1. **Which enemy fires** - the type table `$267824`/`$27E412` (wave 10) gives the
   handler; the handler contains the fire call sites.
2. **Which generator** - the `jsr` target, one of the 20, hard-coded.
3. **Which kind and speed** - D0, a hard-coded immediate at 903 of 911 sites.
4. **Which ANGLE** - D1, and this is the half a recording cannot supply. The
   common shape, from `$2688CC` (type `$11`, the most-dispatched stage-1 enemy):

```
268A26: movem.w ($2,A6),D0-D1 / addi.w #$200,D0 / jsr $24200A     AIM at the LIVE player
268A38: move.b ($33,A5),D0 / jsr $242190 / move.b D1,($33,A5)     STEP the facing 1 unit
268ADE: D1 = ($33,A5) + 2 ; D1 &= $3C                             quantise to 1/64
268AEC: D2 = ($268B1E + D1*2) ; D2 += ($2,A6)                     the muzzle
268AFA: moveq #$D,D0                                              KIND 13
268AFC: cmpi.w #$3,$813092 / bcs -> keep ; else move.l #$FFFC000D,D0   SPEED -4 from stage 3
268B0E: move.l #$2000000,D3
268B14: jsr $281402                                               FIRE
```

**The kind is a constant; the angle is a function of the player position sampled
inside the frame; the count is a function of rank.** That is the owner's point
in one listing.

---

## 6. STAGE 1 - the subset, statically

`firemap.py` partitions build-B code by the sorted set of all 512 type-table
entries (256 inits + 256 handlers) and attributes each fire site to the region
it lands in. **This is an ADDRESS PARTITION, not a call graph** - a fire site in
a helper between two handlers is attributed to the earlier one, and a handler
that calls a far-away helper loses its sites. It is a LOWER BOUND.

```
$ python games/ddpdoj/tools/recon20b/firemap.py inventory
STAGE 1 script $230C6C: 339 records, 21 distinct enemy types
FIRE ENTRY POINTS (call sites, window $230000-$2B0000):
  $2813F0 A_single         86     $2816F6 B_single        120
  $281402 A_single_sp+4    27     $281708 B_single_sp+4   111
  $281420 A_pair_sp+6       4     $281726 B_single_sp+2     4
  $281432 A_triple_sp+5     0     $281744 B_pair_sp+6      57
  $281442 A_spread2        20     $281754 B_triple_sp+5     0
  $281450 A_spread2_sp+4   10     $281764 B_spread2        85
  $281484 A_spread3         8     $281776 B_spread2_sp+6    1
  $281494 A_pair_sp+4       0     $2817A8 B_spread3        17
  $2814AC A_adaptive       42     $2817B8 B_adaptive      271
  $2814B6 A_core            0     $2817C2 B_core           48
  TOTAL 911 sites, 209 with no immediate D0 in 160 bytes
BULLET KINDS defined in ROM: 39
  referenced by ANY fire site: 17 distinct -> 0:7 1:12 2:1 3:28 4:175 5:88 6:14
        7:102 8:4 9:15 11:118 12:29 13:23 14:1 18:4 19:55 22:26
  inside stage-1-owned code:  9 distinct -> 3:9 4:15 6:2 7:12 9:8 11:2 12:5
        13:14 19:24
  stage-1 fire sites: 91, in 15 of 21 stage-1 types
        (05,07,08,09,0B,0D,0E,10,11,27,80,82,85,88,89)
```

Widening the D0 back-scan (a looser attribution, reported for the bound only):

```
back= 96  sites=911 unknown=274 kinds=15
back=160  sites=911 unknown=209 kinds=17
back=300  sites=911 unknown= 98 kinds=18
back=600  sites=911 unknown=  8 kinds=19 -> 0:8 1:12 2:16 3:28 4:202 5:90 6:30
        7:113 8:11 9:19 10:25 11:188 12:30 13:23 14:17 18:4 19:59 22:26 35:2
```

**So at most 19 of the 39 kinds are reachable from a fire call site at all.**
The other 20 are reached by IN-FLIGHT TRANSFORMATION - the continuation at
rec+`$22` rewrites the type word (e.g. `$2824DC bchg #$3,(A6)`, measured 1,608
times in 3,200 frames) or re-spawns (kind 28 calls `$2817C2` itself). That is a
second, independent way patterns are produced and a port that only implements
the spawn path will be missing half the kind space.

The stage-1 boss is type `$0E`, region `$292902`, with **50+ fire sites** across
kinds 3,4,7,9,11,12,19; the midboss is type `$0D`, region `$26B6FA`, kinds
3,4,7. `firemap.py stage1` prints all 91 lines.

---

## 7. THE MEASUREMENT - and the still/moving A/B

`recon20.lua` taps `$28158A` and `$281898` (the SPEED-byte store in each core),
capturing D7 (speed), D1 (direction), A0−`$10` (the record), A5 (the firing
enemy) and `(SP+16)` (the return address, which identifies the generator).
Interventions, both labelled: `$810424` (the invulnerability timer) held at
`$FF` from lf1990 - a value the game writes itself at `$2495A2` - and button 3
(auto-shot) held from lf1800.

```
$ python games/ddpdoj/tools/recon20b/run.py 3200 --autofire --invuln --tag still
  BULLET spawns total: 112
  CORE 2 distinct  2814B6:82 2817C2:30
  ENTRY-RETURN 9 distinct  268490:21 273B84:16 273BC8:14 268B1A:12 275AD6:11
                           273D6C:10 273D8E:10 269E16:9 26A4B0:9
  KINDS 5 distinct  13:41 12:21 19:20 4:16 5:14
  SPEEDS 4 distinct  20:49 19:25 22:20 23:18
  DIRS 33 distinct (top20)  144:22 128:14 160:11 148:5 136:5 132:5 124:5 ...
  FIRING ENEMY TYPE 7 distinct  80:50 10:21 11:12 85:11 05:9 07:6 27:3
  TYPE/KIND pairs 9 distinct  10/k12:21 80/k19:20 80/k4:16 80/k5:14 11/k13:12
                              85/k13:11 05/k13:9 07/k13:6 27/k13:3
  LIVE bullets max=25 mean=3.2 over 3200 frames
  81B414..81B41A = 0000 0000 0000 0000   813098rank=0000 813092=0000 813096=0000
  813160=0000 812950=0000 (global speed biases)
  SPname=SP tapErrors=0
  DONE logicframes=3200

$ python games/ddpdoj/tools/recon20b/run.py 3200 --autofire --invuln --move --tag move
  BULLET spawns total: 150
  CORE 2 distinct  2814B6:105 2817C2:45
  ENTRY-RETURN 9 distinct  273B84:24 268B1A:21 273BC8:21 268490:21 273D8E:15
                           26A4B0:15 275AD6:15 273D6C:15 269E16:3
  KINDS 5 distinct  13:54 19:30 4:24 12:21 5:21
  SPEEDS 4 distinct  20:66 19:36 22:30 23:18
  DIRS 44 distinct (top20)  128:24 112:15 124:12 116:10 96:8 144:7 80:7 104:7 ...
  FIRING ENEMY TYPE 7 distinct  80:75 10:21 11:21 85:15 07:11 27:4 05:3
  LIVE bullets max=34 mean=3.9 over 3200 frames
  DONE logicframes=3200
```

**THE A/B, and it is the owner's argument made numeric.** Same boot, same
auto-shot, same invulnerability poke, same 3,200 frames; the only difference is
a stick sweep.

| | still | moving |
|---|---|---|
| bullets spawned | 112 | **150** |
| distinct DIRECTION bytes stored | **33** | **44** |
| most common direction | 144 (22 of 112) | 128 (24 of 150) |
| max live bullets | 25 | 34 |
| distinct kinds | 5 | 5 |
| distinct speeds | 4 (20,19,22,23) | 4 (same four) |

**The kind and speed sets are IDENTICAL - they are constants in the ROM. The
direction distribution is not, and neither is the bullet count.** A recording
supplies the second and cannot supply the first correctly; the ROM supplies the
first and the second falls out of it. That is exactly the split the method note
predicts, measured.

### The long run - to the stage-1 boss

```
$ python games/ddpdoj/tools/recon20b/run.py 9500 --autofire --invuln --continues --tag long
  BULLET spawns total: 2250
  CORE 2 distinct  2817C2:1127 2814B6:1123
  ENTRY-RETURN 56 distinct  274948:126 274998:126 274AD2:122 26BCEA:120
       27746A:111 277462:111 268490:92 273B84:72 296264:65 29626E:65 273BC8:63
       296158:59 296162:59 295C84:48 295CA0:48 2967F0:48 295C92:48 295C76:48
       2967DC:48 268B1A:46 273D8E:39 273D6C:39 2761F4:36 ...
  KINDS 9 distinct  12:536 4:383 7:362 19:326 6:222 3:125 13:105 11:96 5:95
  SPEEDS 25 distinct  23:720 20:448 14:267 18:165 24:127 25:120 13:115 22:90
       19:80 17:22 10:16 11:16 26:9 30:8 42:6 38:6 34:6 46:6 21:6 16:4 ...
  DIRS 249 distinct (top20)  144:131 120:109 160:93 128:80 148:79 116:68 ...
  FIRING ENEMY TYPE 15 distinct  0E:674 82:374 0D:258 89:222 88:216 80:213
       1E:96 10:92 11:46 05:17 85:14 07:13 0B:10 27:3 09:2
  TYPE/KIND pairs 26 distinct  82/k12:252 0E/k19:248 89/k6:222 88/k4:216
       0E/k12:192 82/k7:122 0E/k7:120 0D/k7:120 0E/k11:96 0D/k3:93 10/k12:92
       80/k19:78 80/k4:72 80/k5:63 11/k13:46 0D/k4:45 1E/k4:32 1E/k3:32
       1E/k5:32 0E/k4:18 05/k13:17 85/k13:14 07/k13:13 0B/k13:10 27/k13:3 09/k13:2
  LIVE bullets max=106 mean=18.1 over 9500 frames
  81B414..81B41A = 0001 0001 0000 0000   813098rank=0000
  SPname=SP tapErrors=0   DONE logicframes=9500
```

**MEASURED stage-1 usage: 9 of 39 kinds - {3,4,5,6,7,11,12,13,19} - from 15
firing enemy types in 26 type/kind pairs, 249 of 256 direction values, 25 of
256 speed values, up to 106 live bullets.** The static partition of §6 predicted
**9** kinds too, {3,4,6,7,9,11,12,13,19}; the two lists differ in one entry
(measured 5, static 9) and that difference is a bug in the static back-decode,
not in the ROM: `$273BC2` really is **kind 5** (`$273B8E move.l #$FFFF0005,D0`),
but `firemap.py` picked the nearer `$273BA0 move.l #$FFFE0004,D0` on the
`$813092 == 4` branch that was not taken. **The nearest preceding immediate is
not always the taken one** - a static back-decode over branchy code is a
heuristic and this is the measured proof of its failure rate: 1 in 91 stage-1
sites. Kind 9 (four `$2965xx` sites in the boss) is real and simply was not
reached in 9,500 frames.

The measured firing set includes type `$1E` (96 spawns, kinds 3/4/5) - the type
wave 10 found is spawned by ANOTHER ENEMY through the deferred queue and that
stage 1's script never names. **A fire-site inventory built only from the spawn
script would miss it.**

The 3,200-frame subset (5 kinds, 7 types) is a strict subset of the 9,500-frame
one (9 kinds, 15 types), which is a strict subset of the 39 defined. The
denominator is the ROM's; the numerators are these runs'.

---

## 8. WHAT WENT WRONG AND WHAT THAT PROVED

The first census run reported `BULLET spawns total: 0` while its own frame
sampler reported `LIVE bullets max=106`. A run that contradicts itself is a bug,
not a finding. `pcprobe.lua` - every PC that writes `$817F8C..$81B40B` -
settled it:

```
$ python games/ddpdoj/tools/recon20b/runpc.py 3200 --autofire --invuln --tag pc
  SAMPLE-POINT PC nibble (build) 2 distinct  2:2501 1:699
  POOL WRITERS 100 distinct  281E80:10055 281E7A:10055 28299E:6894 28132A:6720
     282944:4278 2824E2:1616 2824DC:1608 282B74:1532 282B6C:1523 28259E:1238
     282598:1232 2829AC:1116 282952:1054 ... 28156A:164 28156C:164 28156E:164
     ... 28158E:82 281568:82 281596:82 281570:82 281592:82 281572:82 28158A:82
     ... 28187E:60 28187C:60 281880:60 2818B8:60 2818B4:60 ...
  TYPEWORD WRITERS 15 distinct  2824DC:1608 282B6C:1523 282598:1232 281568:82
     282974:41 28187A:30 28291A:21 282B30:20 2824A8:16 282564:14
     245A44:1 245AAC:1 245BB0:1 245A78:1 245B7C:1
  live=21 81B414..1A=0000 0000 0000 0000
```

The taps and the pool identification were right; the callback was throwing.
Cause: **`CPU.state["A7"]` does not exist on this device - the name is `SP`** -
so the callback's first statement raised and MAME swallowed it silently. Fixed
by resolving the name once (`A7`, else `SP`) and wrapping the body in `pcall`
with an error counter that is now printed (`SPname=SP tapErrors=0`).

Three things that diagnostic establishes on its own:

1. `$2824DC` (1,608), `$282B6C` (1,523), `$282598` (1,232) and five more
   **rewrite the type word of a live bullet** - the in-flight transformation of
   §6, 4,363 rewrites against 82 fresh spawns in the same 3,200 frames.
2. `$245A44`/`$245A78`/`$245AAC`/`$245B7C`/`$245BB0` write into the pool address
   range once each - that is `$2459D0`'s `or.b D4,(A4)` hit-marking, so wave
   10's "enemy hit test" walks a list overlapping this pool. **Named, not
   resolved.**
3. `$81B414..$81B41A` read `0 0 0 0` after 3,200 frames and `0001 0001 0000
   0000` after 9,500, so the ACTIVE POOL WINDOW is 70 slots early in stage 1 and
   160 later: **the bullet cap is a progression variable, not a constant.**

---

## What I RULED OUT

1. **`$8171BE` is not the enemy-bullet pool** (wave 10 §6). §0 gives the
   evidence, including that its dispatch is 20 entries, not 32.
2. **"There is a bullet-pattern data record."** There is not. The KIND is a
   table index; the fan shape, the count, the angle step and the base offset are
   immediates in code at 911 sites.
3. **"The angle unit is 6 bits"** (wave 10's phrasing for the enemy heading).
   The STORED direction is 8 bits = 1/256 turn. Bank-A call sites pass 1/64 and
   `$281586` scales it. Confusing the two puts every bullet at 4× its angle.
4. **"Speed is a velocity."** It is an INDEX into 256 tables of 65 angle records,
   and the velocity is recomputed from (speed, direction) every frame.
5. **The velocity field is not circular.** Axis A is 1.5× axis B at every sampled
   angle and speed, and all three muzzle tables have the same ratio.
6. **`$282030[k]` is not the per-frame behaviour.** It is a one-shot initialiser
   that installs the per-frame continuation at rec+`$22`; all 39 do exactly one
   such install.

## What I could NOT do

1. **A call-graph attribution of fire sites to stage-1 handlers.** §6 is an
   address partition and a LOWER BOUND; 8 of 911 sites still have no immediate
   D0 even at a 600-byte back-scan, and a 600-byte window is itself loose.
2. **Read the 39 behaviour routines and their continuations.** They are
   classified by their calls and by the continuation they install, not read.
   ≈6.7 KB.
3. **The bullet-vs-player hit test and the bullet hitbox.** `$244074`/`$2440B6`
   are the bomb's cancel loops; the player collision against this pool was not
   located, and neither were the hitbox extents in the `$40`-byte record.
4. **Any rank variation.** `$813098` read **0** on every measured frame. Sixteen
   of the twenty generators branch on it and **every rank-0 path emits one
   bullet**, so every fan in this document is UNEXERCISED by measurement and
   read only from the listing. This is the largest single gap in the wave.
5. **Anything beyond `$813092 == 0` / `$813096 == 0`.** Both read 0 throughout;
   several fire sites branch on `$813092` (stage / loop) to change the speed
   bias, and none of those branches ran. `$813160` and `$812950`, the two global
   speed biases added to EVERY bullet, also read 0.
6. **Kind 9, and 30 of the 39 kinds generally.** The 9,500-frame run reaches
   the boss but exercises 9 kinds; kinds 0,1,2,8,9,10,14..18,20..38 were never
   spawned. For most of them that is because they belong to later stages
   (`$813096` never left 0) and for ~20 of them because they are only reachable
   by in-flight transformation (§6), which no fire-site scan can enumerate.

## If someone picks this up cold

```
python games/ddpdoj/tools/recon20b/firemap.py inventory      the counts
python games/ddpdoj/tools/recon20b/firemap.py stage1         the 91 stage-1 sites
python games/ddpdoj/tools/recon20b/run.py 3200 --autofire --invuln --tag still
python games/ddpdoj/tools/recon20b/run.py 3200 --autofire --invuln --move --tag move
python games/ddpdoj/tools/oracle/xref.py dasm 2814B6 200     THE SPAWN CORE
python games/ddpdoj/tools/oracle/xref.py dasm 284190 60      THE ANGLE MATHS
python games/ddpdoj/tools/oracle/xref.py dasm 281DDE 260     THE MOVER
python games/ddpdoj/tools/oracle/xref.py ptrtable 281956 4 39   templates
python games/ddpdoj/tools/oracle/xref.py ptrtable 2815C6 4 39   spawn-inits
python games/ddpdoj/tools/oracle/xref.py ptrtable 282030 4 39   behaviours
python games/ddpdoj/tools/oracle/xref.py dasm 273B44 160      a dbra RING, 8-way
```
