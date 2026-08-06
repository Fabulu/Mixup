# RECON 20 - the enemy census: 256 types, 111 handlers, the pattern tables, the boss

status: **DONE** on the five things asked, with six named gaps in "What I could
NOT do". Every number below is produced by a command shown in this file.
wave: 20 (recon 5 of 5)   role: recon   started: 2026-08-01

All addresses are VERSION-B (`$23xxxx`–`$2A6xxx`, 2002.10.07 BLACK VER) unless a
line says otherwise. `$2xxxxx` below `$230000` and `$23xxxx` data (`$230C6C`,
`$23D762`) is shared DATA/library, not build-A code, and every citation says
which.

New tools, all under `games/ddpdoj/tools/recon20/` (nothing in `src/` touched):

| file | what it is |
|---|---|
| `flow.py` | a FLOW-FOLLOWING disassembler over `out/maincpu.bin`. Follows both edges of every `Bcc`/`DBcc`, follows `bra` and local `jmp`, stops only when every path has hit a terminator. Built to READ PAST THE APPARENT END. Caches unidasm output in `out/dasm-cache.json`. |
| `census.py` | the 256-type roster, the stage table, the script reader |
| `census2.py` | walks all 126 live types' `init+8` and handler, emits `out/census.json` |

---

## THE HEADLINE, and it is a systemic fall-through

**All 256 inits in the type table are EXACTLY 8 bytes.** Every one of them is

```
<init>+0: 3b7c 000N 0004   move.w #$N,($4,A5)     the sub-record run length - 1
<init>+6: 4e75             rts
<init>+8: ...              THE ACTUAL INITIALISATION
```

verified mechanically over all 256 entries:

```
$ python -c "... flow.insn(init) / flow.insn(init+6) for t in range(256) ..."
  inits NOT of the form 'move.w #N,($4,A5) / rts': 0
  sub-record run lengths written by init (($4,A5) = run-1):
     #$0  x218   #$1 x21   #$2 x3   #$6 x2   #$3 x2   #$4 x2
     #$10 x1  #$8 x1  #$b x1  #$c x1  #$5 x1  #$a x1  #$9 x1  #$f x1
```

The second entry point is reached by recon 10's `$26361A addq.w #8,A1 /
$263650 jsr (A1)`. Recon 10 wrote the mechanism down correctly and warned that
"a port that translates only the first entry point silently loses half of every
enemy's initialisation". **It is worse than half: the first entry point is 8
bytes of run-length and nothing else. 115 real init bodies are 100% at +8.**

And the trap is not confined to the inits. Walking every handler twice - once
linearly to the first `rts`/`jmp`/`bra` (what a lazy port reads) and once by
following all edges:

```
HANDLERS whose true extent runs PAST the first terminator: 105 of 111
worst 12 (bytes beyond the naive end):
   $26C3E2  naive end $26C450  true $26C3E2..$26D3FE  +4014 bytes (37x)
   $263C7C  naive end $263C9A  true $263C7C..$264562  +2248 bytes (76x)
   $278C0E  naive end $278C66  true $278BE0..$279502  +2204 bytes (27x)
   $26B6FA  naive end $26B742  true $26B6FA..$26BF40  +2046 bytes (29x)
   $2A3AF6  naive end $2A3B4E  true $2A3AF6..$2A4252  +1796 bytes (21x)
   $274076  naive end $274096  true $274076..$274608  +1394 bytes (45x)
   $27B78A  naive end $27B7B0  true $27B424..$27BCE0  +1328 bytes (59x)
   $2739C0  naive end $2739F2  true $2739C0..$273F04  +1298 bytes (27x)
   $2752B0  naive end $275300  true $2752B0..$2757C8  +1224 bytes (16x)
   $27A548  naive end $27A56E  true $27A4EE..$27A9EC  +1150 bytes (34x)
   $275F30  naive end $275F86  true $275F30..$2763D6  +1104 bytes (14x)
   $274C90  naive end $274CC2  true $274C90..$275100  +1086 bytes (23x)
INIT BODIES (init+8) whose true extent runs past the first terminator: 22 of 115
```

**94.6% of the enemy handlers are longer than they look, by up to 76x.** Nine
of the 111 also start BEFORE their table address (a shared prologue reached by a
backward `Bcc`): `$265850` runs from `$265648`, `$2673FA` from `$2673AC`,
`$268232` from `$2681CE`, `$2688CC` from `$268844`, `$278C0E` from `$278BE0`,
`$27B78A` from `$27B424`, `$27C81A` from `$27C6C8`, `$27D674` from `$27D4D0`,
`$27A548` from `$27A4EE`; and the eight-strong `$269CEA`…`$26B034` family all
share one prologue at `$269B3E`.

---

## 1. THE DENOMINATOR - the type table, counted

```
$ python games/ddpdoj/tools/recon20/census.py table
  types                       256
  NULL types (handler = $26781C or $27E40A)  130
  LIVE types                  126
  distinct handlers           113   (of which 2 are the NULL stub)
  distinct REAL handlers      111
  distinct inits              117   (of which 2 are the NULL stub)
  distinct REAL inits         115
```

Recon 10's "113 distinct handlers" is right and **two of the 113 are the same
do-nothing stub**, which is a whole different denominator:

```
267814: move.w #$0,($4,A5) / rts        the NULL init  (types $00 $1D $2D-$2F $5A-$7E)
26781c: jmp $263762.l                   the NULL handler: free me this frame
27e402/27e40a: byte-identical, for the $80-$FF half (types $A7-$FF except $B0)
```

So **130 of the 256 type codes are deliberate holes** and the real work is
**111 handlers / 115 init bodies over 126 live types**.

Handlers serving more than one type (the aliases a port must not duplicate):

```
  $272AAC x4   types $20 $21 $22 $23      (one init $272A42 for all four)
  $2647A6 x4   types $37 $38 $39 $3A      (FOUR different inits: $264738 $264C14 $264C7C $264CE4)
  $269CEA x2   $05 $25     $26A098 x2  $06 $26     $26A2E2 x2  $07 $27
  $26A5E4 x2   $08 $28     $26A860 x2  $09 $29     $26AA8C x2  $0A $2A
  $26AD28 x2   $0B $2B     $26B034 x2  $0C $2C     $275914 x2  $85 $86
```

`$05`–`$0C` and `$25`–`$2C` are **exact aliases** - same init AND same handler.
`$85`/`$86` share a handler but have different inits (`$275812`/`$275BAE`).

---

## 2. THE PER-TYPE STAT TABLES - found, and this is the answer to "where are the
tables kept"

Every init body begins by loading two prototypes through two library routines at
`$26377A`–`$263800`, which this recon disassembled:

```
26377a: lea ($16,A5),A1 / move.w (A0)+,(A1)+ / dbra D0     D0+1 WORDS -> ($16,A5)
2637a2: D7 = ($4,A5)                                       once per sub-record:
        move.w (A0)+,(A1)+        sub +$00   status/flags word
        addq.w #4,A1                         (+$02/+$04 position: left alone)
        move.l (A0)+,(A1)+ x6     sub +$06 .. +$1D
        move.w (A0)+,(A1)+        sub +$1E
        dbra D7                              -> exactly $20 bytes per sub-record
26378e: D0+1 (word offset, longword value) pairs, applied relative to A6
2637e0: a variant of $2637A2 whose sign bit picks a shorter form
```

Usage across the 126 live types: **`$2637A2` in 124 of them, `$26377A` in 105**,
`$26378E`/`$2637E0` in none of the live inits (they are used elsewhere).
`census2.py` resolves the `lea (table,PC),A0` feeding each call: **208
(loader, table) pairs, 0 unresolved.**

Decoded, with type `$11` (104 of stage 1's 339 spawns) as the worked example:

```
TYPE $11  sub-record prototype @$268828, 28 bytes, run length 1
  flags=$A200
  +06 fa00  +08 fc00  +0A 0000  +0C 0000  +0E 0620
  +10 0480  +12 0600  +14 0440  +16 0440    <- THE FOUR HITBOX HALF-EXTENTS
  +18 0038                                  <- HP = 56
  +1A 04    +1B 10                          <- speed index 4, heading $10
  +1C 00    +1D 15                          <- palette $15
  +1E 0000                                  <- animation frame
TYPE $11  record prototype @$268808, D0=$F -> 16 words into ($16,A5)..($35,A5)
  ($18,A5)=$0101  ($1A,A5)=$1000  ($26,A5)=$0070   <- HP RELOAD = 112 (2x the 56)
  ($28,A5)=$60A0  ($2A,A5)=$0023D762  ($2E,A5)=$0023DECE

TYPE $10  sub proto @$2681B2 / rec proto @$268192
  hitbox +10 0830 +12 0600 +14 06C0 +16 0540   HP +18 $00C0 = 192
  speed $04 heading $10 palette $14            HP reload ($26,A5) = $00E0 = 224
```

`($2A,A5)` and `($2E,A5)` are **not** "a behaviour sub-routine" - recon 10
guessed that from the `jsr (A0)` at `$2689C2`. They are **display-list bucket
emitters** in the shared `$23Dxxx` library:

```
23d762: lea $80397c,A0 / adda.w $80afc0,A0      bucket base + bucket cursor
23d76e: lea ($2,A6),A1 ... asr.l #6 / andi.l #$7FF03FF / ori.l #$80008000
23d78a: move.l D0,(A0)+ / move.l (A1)+,(A0)+ / move.w (A1)+,(A0)+ / move.w ($1c,A6),(A0)+
23d794: addi.w #$c,$80afc0                      12-byte display-list entry
23d79e: the same for bucket $805104 / cursor $80afc2
23dece: the parameterised form: D1 = position, D2 = graphic, D3, D4
```

So the per-type record prototype selects **which of the display-list buckets
recon 11 ported the enemy draws into**. `$280BB6` is the same emitter set as a
6-entry table (`$23D762 $23D762 $23D79E $23D7DA $23D816 $23D852`).

**This is the enemy definition, and it is entirely table-driven: run length
(the init's one immediate), hitbox, HP, speed, heading, palette, animation, HP
reload, and the draw bucket. 208 tables, all located.**

---

## 3. THE PATTERNS - the generators and their 39-entry parameter table

The owner's instruction was to find the tables, not to trace shots. They are at
`$281956` and `$2815C6`, behind two emitters and nineteen rank-gated wrappers.

### 3a. The two bullet pools

```
POOL A   $817F8C   211 slots x $40   emitters $2814B6 and $2817C2
         active length gated by the PLAYER's four power words:
           $2814CE: D7 = $D / $15 / $1F / $25 / $29 on $81B414/$81B416/$81B418/$81B41A
           x5 unrolled slots per dbra ->  70 / 110 / 160 / 190 / 210 SLOTS
         cleared by $28131E ($1A4A+1 words), sentinel $FFFF at +2, stride $40
         swept for hits by $2459D0, whose own count 6/$A/$F/$12/$14 on the SAME
         four words x10 unrolled = 70/110/160/190/210 - an EXACT match, so the
         allocator and the hit test walk the same active prefix.

POOL B   $8171BE   70 slots x $2C  (+ a 10-slot annex at $817DC6)
         count $817F7E, alloc $27F8EE/$27F8F0/$27F8F8/$27F92A -> $280B3E
         per-frame driver $27F95A (call #4 of $28B5E0)
```

**Correction to recon 10 §6/§4d:** recon 10 called `$817F8E` "the player-shot
list". It is not. The player's own shot list is **`$810572`**, walked by
`$253A70` with `moveq #$23,D7` (36 entries) - the eighth call in `$28B5E0`.
`$817F8C`/`$817F8E` is Pool A above. The `$30`-vs-`$3E` stride disagreement
recon 10 left open is resolved: `$2459D0` advances `+2` then `lea ($3e,A6),A6`
= **stride $40**, matching `$28131E`'s `lea ($40,A0),A0`.

**The rank amplifier nobody had named:** the number of live enemy-side objects
Pool A will hold rises 70 → 210 as the player powers up. A port that fixes the
pool at 210 will render bullets the cartridge drops.

### 3b. The emit primitive and its parameter block

```
2814b6 / 2817c2 (identical but for `bset #$9,D7` on the flags word in $2817C2)
  D0.high = an ANGLE OFFSET      D0.low & $3F = THE PATTERN/BULLET KIND
  D1      = a base direction     D2 = the spawn position (packed long)
  D3      = a position adjust (packed long, applied to +$02/+$04)

281554/281860:  D0 &= $3F ; *4 ; A1 = ($281956 + D0)      <- THE PATTERN TABLE
   move.w (A1)+,(A0)+       slot +$00   flags word, low byte = the kind
   move.l D2,(A0)+          slot +$02   position
   move.l (A1)+,(A0)+ x2    slot +$06 .. +$0D
   move.w (A1)+,(A0)+       slot +$0E
   move.w (A1)+,($c,A0)     slot +$1C
   move.w (A1)+,D7          THE ANGLE BASE
   add.w  (A7),D7           + D0.high  (the caller's angle offset)
   add.w  $813160,D7        + a global
   add.w  $812950,D7        + a global
   D1 *= 4
   move.b D7,($a,A0) / move.b D1,($b,A0)     slot +$1A / +$1B
   move.b D7,($2a,A0)/ move.b D1,($2b,A0)    slot +$3A / +$3B  (duplicated)
   tst.w (A1) / bne -> A1 = ($2815C6 + D0) ; jmp (A1)   THE SECOND-STAGE INIT
```

```
$281956  39 valid pointers -> 20-byte prototypes at $2819F4, stride $14
         proto 0  @$2819F4: 81 00 fc00 fd00 0000 0000 0418 001a 0014 0000
         proto 1  @$281A08: 81 01 ...     proto 13 @$281AF8: 81 0d ...
         (aliases: entries 14 and 15 both point at entry 10's record)
$2815C6  39 valid pointers -> per-kind second-stage init ($2818AC, $2818B4, …)
$280E4A  20 valid pointers -> Pool B prototypes      (the $27F8xx path)
$280BCE  20 valid pointers -> Pool B per-kind init
$27F99E  20 valid pointers -> Pool B PER-FRAME handlers  (recon 10 said 32; the
         `moveq #$7c,D0` mask allows 32, only 20 entries are populated)
$280BB6   6 pointers -> the display-list bucket emitters, indexed by D2
```

### 3c. THE RANK GATE - and why no measurement so far has seen a pattern

Nineteen wrapper entry points sit in front of the two emitters. **Every one of
them opens with `tst.w $813098` and every one of them collapses to a single shot
when that word is zero.**

| entry | rank == 0 | rank != 0 |
|---|---|---|
| `$2813F0` | 1 shot | 1 shot (a dead gate) |
| `$281402` | 1 shot | 1 shot, angle **+4** |
| `$281420` | 1 shot | **2-way**, angles +0 +6 |
| `$281432` | 1 shot | **3-way**, angles +0 +5 +10 |
| `$281442` | 1 shot | **2-way in SPEED**, D1 −8 then +$10 |
| `$281450` | 1 shot | 2-way in speed, angle +4 |
| `$281484` | 1 shot | **3-way in speed**, angle +2 |
| `$281494` | 2-way, angles +0 +4 | same (the only ungated wrapper) |
| `$2814AC` | 1 shot | 2-way or 3-way, chosen by `($D,A5)` bit 0/7 and sub-record byte 0 bit 1 |
| `$2816F6` | 1 shot | 1 shot (dead gate, Pool-A-B emitter) |
| `$281708` | 1 shot | 1 shot, angle +4 |
| `$281726` | 1 shot | 1 shot, angle +2 |
| `$281744` `$281754` `$281764` `$2817A8` `$2817B8` | 1 shot | multi, generators at `$281668` `$281680` `$2816DE` `$2816C0` `$2816A4` |
| `$281776` | 1 shot | 2-way in speed, angle +6 |

`$813098` **read 0 for the entire 9,500-frame run in recon 10** (its item 6:
"Any rank variation … every number here is at ONE rank"). So:

> **At rank 0, every parameterised pattern in this game degenerates to one
> bullet, and a corpus captured at rank 0 contains no evidence that the wrappers
> exist at all.** This is the owner's point in its sharpest possible form: the
> generators and their 39-entry table are static and readable; the bullets are
> not, and the only run we have is the one run where they are all invisible.

`$813092` is a second parameter word, and it changes the AIM, not the count:
type `$11`'s fire block picks `D0 = $0000000D` normally and `D0 = $FFFC000D`
(angle −4, same kind 13) when `$813092 >= 3` (`$268AFC`).

### 3d. A worked pattern, end to end - type `$11`, the commonest stage-1 enemy

```
268a16: D1 = ($33,A5)                 the facing, stepped toward the aim by $242190
268ade: D1 = (($33,A5)+2) & $3C       quantised to 16 directions
268aec: lea ($268b1e,PC),A0 / D2 = (A0,D1*2)      a 16-entry MUZZLE OFFSET table
268af6: D2 += ($2,A6)                 muzzle = enemy position + offset
268afa: D0 = $0000000D                pattern kind 13, angle 0
268afc: if $813092 >= 3: D0 = $FFFC000D            angle -4
268b0e: D3 = $02000000
268b14: jsr $281402                   1 shot, or 1 shot at angle+4 when ranked
```

The aim that feeds `($33,A5)` is `$268A30 jsr $24200A` - recon 10 measured that
call reading the LIVE player position 14,922 times in 4,200 frames.

---

## 4. STAGE 1 - which of the 126, where, in what order

```
$ python games/ddpdoj/tools/recon20/census.py script
  stage 1: script $230C6C aux $23170C res $231852  records=339
           distinct types=21  distinct handlers=19  NULL-type records=0  trig 96..488
  stage 2: script $2325D0 aux $233038 res $233194  records=332  types=31 handlers=25  trig 1..483
  stage 3: script $2342BA aux $234FB2 res $2350A8  records=414  types=28 handlers=21  trig 6..423
  stage 4: script $2358B0 aux $2364A8 res $2365E2  records=382  types=29 handlers=25  trig 1..744
  stage 5: script $237978 aux $239190 res $239396  records=770  types=35 handlers=31  trig 1..807
                                                   ---- 2,237 records over five stages ----
```

```
live types: 126 ; referenced by ANY of the 5 stage scripts: 80 ; never referenced: 47
never referenced: $01 $02 $03 $04 $06 $0A $0C $0F $13 $14 $17 $18 $1C $1E $1F $26
                  $28 $2A $2C $32 $33 $34 $35 $3D $41 $42 $44 $4D $4E $4F $50 $51
                  $52 $53 $54 $55 $56 $57 $58 $7F $87 $98 $99 $9A $9E $A4 $A5
distinct handlers reachable from the 5 scripts: 69   (of 111)
distinct handlers reachable from the stage-1 script: 19
```

**47 live types are never named by any script.** Recon 10 measured one of them
(`$1E`, handler `$296DD6`) arriving anyway, through the deferred queue
`$815EAA` - an enemy spawned by another enemy. So "read the scripts" is a lower
bound by at least 47 types, and the queue is the only other door.

### The 21 stage-1 types, in order of first appearance

trigger = the wave clock `$8130CE`, which recon 10 proved is a **scroll
odometer** (+1 per `$200` units of background scroll at `$26132C`), not a timer.

| type | n | trig | init+8 | handler | what it does | fires |
|---|---|---|---|---|---|---|
| `$11` | **104** | 96–453 | `$26871C` | `$2688CC` | script-mover, aims, turns | `$281402` k13 |
| `$27` | 5 | 118–144 | `$26A1EA` | `$26A2E2` | alias of `$07` | `$2814AC` |
| `$10` | 16 | 121–372 | `$2680B8` | `$268232` | script-mover, aims, turns | `$281402` |
| `$85` | 2 | 148–276 | `$27581A` | `$275914` | script-mover | `$2813F0` |
| `$05` | 28 | 157–285 | `$269BCE` | `$269CEA` | damage-first family, shared prologue `$269B3E` | `$2814AC` |
| `$07` | **59** | 161–454 | `$26A1EA` | `$26A2E2` | damage-first family | `$2814AC` |
| `$80` | 6 | 168–458 | `$273802` | `$2739C0` | script-mover, 310 insns | `$281484` `$2817A8` `$2817B8` |
| `$8A` | 10 | 173–452 | `$2766AE` | `$276702` | **scroll-locked** ground gun | Pool B `$27F8EE`/`$27F92A` |
| `$8B` | 25 | 179–378 | `$276824` | `$27687E` | **scroll-locked** ground gun | Pool B `$27F8EE` |
| `$20` | 5 | 188–376 | `$272A4A` | `$272AAC` | scripted carrier: reads its own params from `($12,A5)`, spawns via the deferred queue | none |
| `$0D` | **1** | 197 | `$26B484` | `$26B6FA` | **THE MIDBOSS** - 437 insns, `$26B6FA..$26BF40` | `$281764` `$2817A8` `$2817B8` |
| `$82` | 33 | 227–434 | `$27462A` | `$2747C6` | script-mover | `$281484` `$281708` `$281764` |
| `$89` | 7 | 283–402 | `$277278` | `$27733E` | script-mover, also allocates Pool B | `$2813F0` + Pool B |
| `$88` | 3 | 322–390 | `$275DA0` | `$275F30` | script-mover, 303 insns, 4 indirect calls | `$2813F0` `$281442` |
| `$08` | 12 | 376–455 | `$26A4BC` | `$26A5E4` | damage-first family | `$2814AC` |
| `$21` | 1 | 377 | `$272A4A` | `$272AAC` | scripted carrier (alias of `$20`) | none |
| `$0B` | 12 | 377–456 | `$26ABA0` | `$26AD28` | damage-first family | `$2814AC` |
| `$09` | 7 | 420–454 | `$26A794` | `$26A860` | damage-first family | `$2814AC` |
| `$24` | 1 | 464 | `$296FB0` | `$29700C` | scroll-locked, boss-approach prop | none |
| `$31` | 1 | 481 | `$269754` | `$2697F6` | boss-approach prop | none |
| `$0E` | **1** | 488 | `$2926E2` | `$292902` | **THE STAGE-1 BOSS** | via its own state machine |

```
STAGE-1 SPAWN ORDER by 40-tick band of the scroll odometer:
  clk  80-119 : $11 x24 $27 x1
  clk 120-159 : $05 x5 $10 x2 $11 x14 $27 x4 $85 x1
  clk 160-199 : $05 x6 $07 x19 $0D x1 $10 x4 $11 x10 $20 x1 $80 x2 $8A x2 $8B x13
  clk 200-239 : $05 x9 $11 x6 $82 x4 $8A x1 $8B x9
  clk 240-279 : $05 x6 $07 x6 $10 x3 $11 x15 $82 x7 $85 x1
  clk 280-319 : $05 x2 $07 x15 $10 x3 $11 x4 $20 x1 $80 x2 $82 x4 $89 x1 $8A x2
  clk 320-359 : $07 x11 $10 x3 $11 x11 $20 x2 $82 x6 $88 x1 $89 x2 $8A x1
  clk 360-399 : $07 x2 $08 x7 $0B x4 $10 x1 $11 x2 $20 x1 $21 x1 $82 x3 $88 x2
                $89 x3 $8A x1 $8B x3
  clk 400-439 : $08 x3 $09 x3 $0B x3 $11 x2 $82 x9 $89 x1 $8A x2
  clk 440-479 : $07 x6 $08 x2 $09 x4 $0B x5 $11 x16 $24 x1 $80 x2 $8A x1
  clk 480-519 : $0E x1 $31 x1
```

The full 339-record listing (address, trigger, type, handler, flags, parameter
word, 12-bit data index) is in
`games/ddpdoj/tools/recon20/out/stage1.txt` (gitignored, ROM-derived).

Six types account for 267 of the 339 records: `$11` (104), `$07` (59), `$82`
(33), `$05` (28), `$8B` (25), `$10` (16). **Porting six handlers covers 79% of
stage 1's spawns.** Adding `$8A`, `$08`, `$0B`, `$09`, `$80`, `$89`, `$20`,
`$27` takes it to 20 of 21 types and 336 of 339 records; the remaining three are
the midboss `$0D`, the boss `$0E`, and the two props `$24`/`$31`.

---

## 5. THE BOSS

**Stage 1's boss is type `$0E`, one record at `$2316FC`, trigger 488 (the last
record in the script), init body `$2926E2`, handler `$292902`.** Recon 10
measured `$292902` dispatched 1,315 times and the wave clock freezing at 836
with one live enemy - that is this.

The handler is 10 instructions. All of the boss is behind it:

```
292902: jsr $294ad8.l                     THE BOSS BRAIN
292908: tst.w ($24,A5) / beq              a timer in the record
29290e: subq.w #1,($24,A5) / jsr $243dd0.l
292918: jsr $25962e.l                     the boss STATE MACHINE step
29291e: bcc  -> rts
292922: jsr $242952.l / jmp $263762.l     defeated: free
```

Its init body installs a five-table state machine through `$259554`:

```
2926e2: lea ($292806,PC),A0 / jsr $2637A2      sub-record prototype (hitbox/HP/...)
2926ee: lea ($2927f6,PC),A0 / moveq #$7,D0 / jsr $26377A   8 words -> ($16,A5)
2926fe: ($2,A6) = $97FFFE00                    the entry position
292710: A0=$293104  A1=$295856  A2=$292932  A3=$29370A  A4=$294F68
29272e: jsr $259554        clears $812980..$812E07 ($244 words) and installs:
            A0 -> $812984  (+ $81298A = $FFFF)   the boss SCRIPT
            A3 -> $812A70
            A1 -> $812BD4
            A2 -> $8129CC, then walked as a longword list into $8129D0+
                  -> THE BOSS PARTS list ($FFFFFFFF terminated)
292734: moveq #$6,D0 / jsr $2598E6
29273c: moveq #$0,D0 / jsr $25980C
292744: five resource installs through $24150A:
            #$15 <- $222B38   #$16 <- $222B78   #$17 <- $222BB8
            #$12 <- $246BF8   #$11 <- $222C38
292794: bset #0 and #2 of $8130F8, bset #0 of $8130F9    (scroll lock / mode)
2927ac: $81B626 = $000001A0                THE BOSS HP BAR MAXIMUM (416)
2927b6: $81B62A = &($16,A5)                THE LIVE BOSS HP POINTER
2927c0: jsr $294AD6 / $294EEA / $294F0A
```

Damage accounting is a longword, not the usual word:

```
294ae2: moveq #$5c,D1 / and.b (A6),D1 / beq       the same hit bits as every enemy
294af4: jsr $286096.l                             the shared damage routine
294afa: ($1d,A6) $19 -> $13 ; ($bd,A6) = $16      a SECOND sub-record at +$B8 => parts
294b12: ($1d,A6) ^= $0C ; ($bd,A6) ^= $09         the hit-flash palette eor
294b2a: D2 = $7FFF - ($18,A6)
294b30: ($16,A5) -= D2 (LONGWORD)                 the boss HP accumulator
294b3e: ($18,A6) = $7FFF                          the sub-record HP is re-armed
```

**The boss fires nothing through the shared wrappers**: its handler's call
closure contains no `$281xxx` entry. Its patterns come out of `$25962E` /
`$294AD8` driving the five installed tables (`$293104` `$295856` `$292932`
`$29370A` `$294F68`) - a bespoke script engine at `$2595xx`/`$294xxx` that this
recon located but did not decode. That is the largest single unread block left.

**The stage-1 MIDBOSS is type `$0D`, one record at trigger 197, init body
`$26B484`, handler `$26B6FA`** (437 instructions, `$26B6FA..$26BF40`, +2,046
bytes past its first `rts`). Unlike the boss it does use the shared library:
`$281764`, `$2817A8`, `$2817B8` - three of the rank-gated Pool-A-B wrappers -
plus the deferred-spawn queue.

Types `$20`–`$23` share handler `$272AAC` and recon 10 reported them selecting
the 8-slot "boss band" in `$2636DA`. **They are not bosses.** Their init reads
position and up to three parameters out of `($12,A5)` - the movement-script
pointer - and advances it, i.e. they are generic scripted carriers. Stage 1
spawns five `$20` and one `$21` at triggers 188–377, in the middle of the level.

---

## What I RULED OUT

1. **"113 handlers is the porting denominator."** No: two of the 113 are one
   byte-identical do-nothing stub covering 130 of the 256 type codes. The
   denominator is **111 handlers / 115 init bodies / 126 live types**.
2. **"An init routine is short."** All 256 are exactly 8 bytes and none of them
   is the routine. `init+8` is.
3. **"`$817F8E` is the player-shot list"** (recon 10 §4d/§6). It is Pool A, the
   enemy-side object pool; the player's shot list is `$810572`, driven by
   `$253A70` with `moveq #$23,D7`.
4. **"`$27F99E` is a 32-entry dispatch"** (recon 10 §6). The mask allows 32;
   **20** entries are populated, and the matching prototype (`$280E4A`) and
   init (`$280BCE`) tables are 20 long too.
5. **"Types `$20`–`$23` are the boss."** They are scripted carriers. The stage-1
   boss is type `$0E`.
6. **"`($2A,A5)`/`($2E,A5)` are behaviour sub-routines"** (recon 10 §4f). They
   are display-list bucket emitters in the `$23Dxxx` library.
7. **"The scripts enumerate the reachable types."** 47 of the 126 live types are
   named by no script in any of the five stages.

## What I could NOT do

1. **The boss's own pattern engine.** `$259554`'s five tables, `$25962E`,
   `$294AD8`, `$2598E6`, `$25980C` - located and their RAM destinations read;
   the script format is NOT decoded. This is the single largest unread block.
2. **The 39 pattern prototypes' field meanings beyond the store sequence.** I
   decoded the 20-byte record layout from `$281554`'s stores and dumped three of
   them; I did not correlate the fields to observed bullet behaviour, and 2 of
   the 20 bytes are unaccounted for.
3. **The 20 Pool-B per-frame handlers at `$27F99E`** and `$280BCE`'s 20 inits -
   counted, not read. Recon 10's "second dispatch behind `$2810CA`" is still
   unread.
4. **Any rank-nonzero measurement.** Every claim about the wrappers' multi-shot
   arms is from the listing. `$813098` has been 0 in every run this project has
   taken. **Nothing in this file about 2-way/3-way has been seen executing.**
5. **The `$2459D0` A4 question.** I proved the loop bound matches the allocator
   exactly (70/110/160/190/210 on the same four power words) and that the pool
   is written by enemy handlers; I did not put a tap on `$80FA7E` to prove A4 is
   the player rather than an enemy. The reading here (Pool A = enemy-side,
   `$2459D0` = its collision sweep) is an inference from the call sites.
6. **The aux table `$23170C` → resource `#$1F` movement-script bytes.** The
   12-bit data index per record is read and reported; the movement byte-code it
   selects is recon 10's `$2638A6` interpreter and I did not dump the streams.
7. **Stages 2–5 beyond the record/type/handler counts.** Counted, not profiled.

## If someone picks this up cold

```
python games/ddpdoj/tools/recon20/census.py table            256 types -> 111 real handlers
python games/ddpdoj/tools/recon20/census2.py                 walks init+8 and handler for all 126
python games/ddpdoj/tools/recon20/census.py routines         span + fall-through report
python games/ddpdoj/tools/oracle/xref.py dasm 26377A 130     the prototype loaders
python games/ddpdoj/tools/oracle/xref.py dasm 2814B6 300     emit primitive A
python games/ddpdoj/tools/oracle/xref.py dasm 2817C2 200     emit primitive B
python games/ddpdoj/tools/oracle/xref.py dasm 281402 260     the rank-gated wrappers
python games/ddpdoj/tools/oracle/xref.py ptrtable 281956 4 39   THE PATTERN TABLE
python games/ddpdoj/tools/oracle/xref.py dasm 2926E2 240     the boss install
```
