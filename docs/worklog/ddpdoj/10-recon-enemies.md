# RECON 10 - enemies: the wave script, the dispatch, the handlers, the aim

status: **DONE** on the seven questions asked, with five named gaps in
"What I could NOT do". Every number below was produced by a command in this
file; nothing is quoted from another document as if it were measured here.
wave: 10 (recon 3 of 5)   role: recon   started: 2026-08-01

All addresses are VERSION-B (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER) unless
a line says build A. `$2xxxxx` below `$230000` is shared DATA, not build-A code
(`$200920`, `$221520`, `$230C6C`); every such citation says what it is.

New tools, all under `games/ddpdoj/tools/recon10/` (nothing in `src/` touched):

| file | what it is |
|---|---|
| `pcref.py` | the scan `xref.py` says it CANNOT do: `bsr`/`bra`/`Bcc`/`jsr (d16,PC)`/`lea (d16,PC)` by brute force. A byte scan - every hit must be confirmed by disassembling backwards. |
| `enemytypes.py` | reads THE ENEMY TYPE TABLE and any stage's spawn script out of the image |
| `dump.py` | hex / record / word dumps of the decrypted image |
| `recon10.lua` + `run.py` | the runtime census: handlers, types, bands, spawns, alloc failures, the wave clock |
| `aimprobe.lua` + `runaim.py` | who reads the LIVE player, from where, how often |

---

## THE HEADLINE

**Wave 5's five enemy handlers were scenario-bounded by a factor of four, and
its "there is no table to read" is false. There IS a table.**

```
$ python games/ddpdoj/tools/recon10/run.py 9500 --tag long --autofire --invuln --continues
  ENEMY handlers dispatched: 20 DISTINCT
  ENEMY handlers 2688CC:74564 27687E:34387 268232:15666 26A2E2:14342 276702:10167
                 2747C6:9752 27733E:7025 2739C0:4275 269CEA:4170 275F30:3125
                 26AD28:2782 26A5E4:2148 272AAC:1978 26B6FA:1858 26A860:1393
                 292902:1315 275914:1216 29700C:524 2697F6:209 296DD6:56
  ENEMY type bytes ($c,A5): 22 distinct
  HANDLER-vs-TYPETABLE mismatches: 0 distinct  (none)
  SPAWN bands C_common48:366 B_boss8:6  total=372  aborted_no_subrecord=0
  WAVECLOCK $8130CE range 0..836 over 9500 logic frames
  DONE logicframes=9500 videoframes=9539 fails=0
```

`$813096` (the stage word) is **0 for all 9,500 frames** and the script cursor
`$8132CC` walks from `$230C6C` to `$231704` - the terminator address the static
walk predicted - so **all twenty are stage 1**. Wave 5's `stage1-open` reached
wave-clock 165 of 488; this run reached 488 and then the clock ran on to 836
and froze with one live enemy (the boss).

And the enumeration is now bounded from ABOVE by the listing, not by a run:

```
$ python games/ddpdoj/tools/recon10/enemytypes.py script 230C6C
  script $230C6C: 339 records, 2712 bytes, terminator at $231704
  TYPES USED (21 distinct)      HANDLERS NEEDED (19 distinct)
$ python games/ddpdoj/tools/recon10/enemytypes.py table
  DISTINCT handlers over all 256 types: 113
```

19 from the script + 1 that the script does not name (`$296DD6`, type `$1E`,
56 dispatches, 2 spawns) - that one arrives through the SECOND spawn path,
the deferred queue at `$815EAA`, i.e. **an enemy spawned by another enemy**.
That is the mechanism that makes "read the script" a lower bound and it is
measured, not assumed.

---

## 1. THE PER-TYPE DISPATCH - a static table, contradicting wave 5

Wave 5: *"An enemy's identity is a FUNCTION POINTER at `+$4C`, not a type word …
Enumerate the handlers by measurement; there is no table to read."* The pointer
at `+$4C` is real. Where it comes from is `$2635F6`, the enemy INIT, called from
both spawn paths with A5 = the fresh record:

```
2635f6: moveq #$0,D7 / move.b ($c,A5),D7      the TYPE byte
2635fc: lea $267824,A0                        TABLE LO   types $00..$7F
263602: cmpi.w #$80,D7 / blt $263612
263608: lea $27e412,A0 / subi.w #$80,D7       TABLE HI   types $80..$FF
263612: lsl.w #3,D7                           8 BYTES PER TYPE
263614: movea.l (A0,D7.w),A1 / jsr (A1)       [+0] THE INIT ROUTINE
26361a: addq.w #8,A1                          <- A1 becomes init+8 …
26361c: move.w ($4,A5),D0 / bsr $2635b2       … the SUB-RECORD allocator
263622: bcs $263674                           no free run -> clr.w (A5), SPAWN LOST
263624: move.l A6,($6,A5)                     the sub-record pointer
263628: movea.l ($4,A0,D7.w),A0
26362c: move.l A0,($4c,A5)                    [+4] THE PER-FRAME HANDLER
263630: moveq #$0,D0 / lea $8103e6,A0         P1 record
263638: btst #$0,($1,A5) / beq $263648
263640: lea $810448,A0 / moveq #$1,D0         P2 record (stride $62)
263648: move.b D0,($3,A5)                     THE TARGET-PLAYER INDEX
26364c: clr.w ($3e,A5)
263650: jsr (A1)                              init+8, with A0 = the player record
```

**Runtime check: `HANDLER-vs-TYPETABLE mismatches: 0` over 190,952 dispatches**
- `recon10.lua` recomputes `table[($c,A5)]` from the image on every dispatched
enemy and compares it to `($4c,A5)`. The table is authoritative.

Consequences for the port:

* the handler set is 113 routines for the whole game, **19–20 for stage 1**;
* `($C,A5)` (the type byte) and `($D,A5)` (a flags byte) come straight out of
  the spawn record - wave 5's `allocEnemy(ram, d0, d1, d3)` already stores them;
* `addq.w #8,A1` means every INIT routine has a **second entry point 8 bytes
  in**, called after the sub-record exists and with A0 = the target player's
  record. A port that translates only the first entry point silently loses half
  of every enemy's initialisation.

---

## 2. THE STAGE-1 SPAWN SCRIPT - `$230C6C`, 339 records of 8 bytes

`$2634F4` is the whole enemy subsystem's per-frame entry, and it is TWO things:

```
2634f4: move.l A5,-(A7)
2634f6: bsr $2633be        THE SPAWN WALKER   (this section)
2634fa: bsr $263502        THE ENEMY DRIVER   (wave 5's $263502)
2634fe: movea.l (A7)+,A5 / rts
```

`xref.py callers 2634F4` → **exactly one, `$28B5EC`**, inside `$28B5E0` =
top-level object dispatch entry **[5]**. Wave 5's "seven things" item 1 says the
enemies are *"reached from type 10"* and the shots *"from type 5"*; wave 5's own
§"why the done-when is blocked" item 4 lists `$28B5E0` calling **both**
`$2634F4` and `$253A70`. The second is right: `$28B5E0` = `jsr $289B80 /
$2634F4 / $28AD54 / $27F95A / $288E4E / $2890F2 / $255DD8 / $253A70 / $24C096 /
…`, re-disassembled here. **Enemies AND player shots AND enemy bullets are all
under top-level type 5.**

### The stage table - `$263336`, 4 longwords per stage

```
263386: lea $8132cc,A4
26338c: move.w $813096,D0 / add.w D0,D0 / add.w D0,D0      D0 = 4 * $813096
263396: lea ($263336,PC),A0 / adda.w D0,A0
26339c: (A4) = (A0)+          $8132CC = THE SCRIPT POINTER (the cursor)
26339e: ($4,A4) = (A0)+       $8132D0 = an aux WORD table
2633a2: D0 = (A0)+            pushed with #$1F to $246D04 (resource install)
2633b6: clr.w $815ea8                                     the deferred queue
```

```
$ python games/ddpdoj/tools/recon10/enemytypes.py ...   (dump.py ptrtable)
  [ 0] $263336  $230C6C   [ 1] $26333A  $23170C   [ 2] $26333E  $231852   [ 3] 0
  [ 4] $263346  $2325D0   [ 5] $26334A  $233038   [ 6] $26334E  $233194   [ 7] 0
  [ 8] $263356  $2342BA   [ 9] $26335A  $234FB2   [10] $26335E  $2350A8   [11] 0
  [12] $263366  $2358B0   [13] $26336A  $2364A8   [14] $26336E  $2365E2   [15] 0
  [16] $263376  $237978   [17] $26337A  $239190   [18] $26337E  $239396   [19] 0
```

**Five stages, 16 bytes each, fourth longword always 0.** Stage 1 = script
`$230C6C`, aux table `$23170C`, resource list `$231852`. The `*4` against a
16-byte stride means `$813096` holds **stage × 4**, not the stage number - a
port that stores the stage index there is off by 4× and lands in the middle of
the previous stage's triple. NOT independently confirmed: `$813096` measured 0
throughout the run, so only stage 1 is exercised.

### The walker - `$2633BE`, and the record format

```
2633be: lea $8132cc,A3 / movea.l (A3),A2          A2 = the cursor
2633c6: move.w (A2),D0
2633c8: cmpi.w #-1,D0 / beq $263444                $FFFF = END OF SCRIPT
2633d0: cmp.w $8130ce,D0                           THE WAVE CLOCK
2633d6: blt $263440                                already passed -> skip
2633da: bne $263444                                not yet -> stop (sorted list)
2633de: moveq #0,D0 / move.b ($4,A2),D0            D0 = byte +4
2633e4: move.l ($4,A2),D1 / andi.l #$fff000,D1 / lsr.l #16,D1
                                                   D1 = byte +5  (the $FFF000
                                                   mask's low nibble is dead -
                                                   the shift discards it)
2633f2: move.w ($6,A2),D7 / andi.w #$fff,D7        D7 = 12-bit DATA INDEX
2633fa: movea.l ($4,A3),A1 / add.w D7,D7
263400: move.w (A1,D7.w),D7                        aux table -> a word offset
263404: … jsr $246cac(#$1F) …  movea.l D0,A1 / adda.w D7,A1
263420: bsr $2636d6                                THE ENEMY ALLOCATOR
263424: bcs $263440                                TABLE FULL -> SPAWN DROPPED
263428: move.w ($2,A2),($a,A0)                     word +2 -> record +$A
26342e: move.l A1,($12,A0)                         the MOVEMENT SCRIPT pointer
263436: movea.l A0,A5 / bsr $2635f6                THE INIT (section 1)
263440: addq.w #8,A2 / bra $2633c6
263444: move.l A2,(A3)                             the cursor persists
```

**Record: 8 bytes, `[+0]=trigger word, [+2]=parameter word → record +$A,
[+4]=type byte, [+5]=flags byte, [+6..7]&$FFF = data index`, sorted ascending on
the trigger, `$FFFF`-terminated.** Stage 1: 339 records, `$230C6C..$231703`,
triggers 96…488.

```
[  0] 230c6c: 00 60 00 00 11 01 10 01   trig=96  type=$11 flags=$01 idx=$001
[ 24] 230d2c: 00 76 00 05 27 00 00 23   trig=118 type=$27 flags=$00 idx=$023
[ 41] 230db4: 00 94 00 06 85 00 00 02   trig=148 type=$85 flags=$00 idx=$002
[ 45] 230dd4: 00 9d 00 19 05 00 00 97   trig=157 type=$05 flags=$00 idx=$097
```

`($12,A5)` is a pointer INTO the resource loaded as `#$1F` - the enemy's
per-frame movement script, read by `$2638A6` (section 4). The aux table
`$23170C` maps the 12-bit index to a word offset inside that resource.

### The wave clock `$8130CE` - measured

```
2,600-frame run:  WAVECLOCK ticks: 163 values, lf 1..2586 -> 15.667 lf/tick
9,500-frame run:  WAVECLOCK ticks: 834 values, lf 1..8936 -> 10.688 lf/tick
```

Not a constant. Over the stage-1 script only (lf1830 clk52 -> lf8130 clk482) the
rate is **14.65 logic frames per tick**; after the script terminates the clock
jumps to ~2.9 lf/tick (clk 482->836 in 900 frames) and then freezes at 836.

**And the reason is in the listing: it is a SCROLL ODOMETER, not a timer.** A
byte scan of the 160 absolute-long occurrences of `$8130CE` in `$130000..$2B0000`
finds exactly ONE write-shaped opcode in build B:

```
2612fe: move.w ($1c,A5),D6                 the per-frame SCROLL SPEED
261302: move.w ($1e,A5),D5 / add.w D6,D5   a fractional accumulator
26131a: cmpi.w #$200,D5 / blt $261332
261320: subi.w #$200,D5
261324: tst.w ($8,A5) / bne $261332        the SCROLL-PAUSE flag
26132c: addq.w #1,$8130ce                  <- THE ONLY INCREMENT
261332: move.w D5,($1e,A5)
261336: (a second accumulator ($20,A5), threshold $800 -> jsr $261F76)
```

**One tick per `$200` units of background scroll, suppressed while `($8,A5)` is
set.** That explains both measured rates and the freeze: the scroll speeds up
after the script ends and stops dead at the boss. A port that ticks the wave
clock per FRAME will spawn stage 1 in the wrong places the moment the scroll
speed changes -- and it changes inside stage 1.

`$26114C move.w ($6,A5),$8130CE` restores it (checkpoint / continue). The clock
has 80 absolute-long readers in build B (`xref.py abs 8130ce`, a lower bound).

Caveat on the scan, stated because it bounds the claim: it matched the absolute
address at instruction+2, so an instruction with a longer prefix (`$26114C`'s
`move.w (d16,A5),abs.l`, address at +4) is found only by eye. **"One
incrementer" is therefore strong but not exhaustive** -- a write tap on
`$8130CE` closes it and I did not run one.

### The SECOND spawn path - the deferred queue `$815EAA`

```
263444: move.l A2,(A3)
263446: move.w $815ea8,D6 / beq $2634f2         the queue's byte length
263450: subi.w #$50,D6 / lea $815eaa,A4 / adda.w D6,A4   drained LIFO
26345c: D0 = ($2,A4) & $FF   D1 = ($4,A4)       (D1 is a WORD here - this path
263468: jsr ($2636d6,PC)                         CAN pick the 2-slot special band)
26346e: bcs $2634d2
263472..2634cc:  copies ($2,A4)->($2,A0) and every longword $12..$4A, i.e. a
                 WHOLE $50-byte PROTOTYPE record, then $2634E2 movea.l A0,A5 /
                 bsr $2635f6 (the same init)
2634d8: cmpa.l #$81454c,A0 / beq $2634e8         the DUMMY: skip the init
2634e8: tst.w $815ea8 / bne $263446              drain until empty
```

Enqueue is `$263678` / `$263684` / `$263690` (three entry points differing only
in D1 = `$80` / `$0` / caller's) and it has **13 absolute-long callers in the
enemy region** (`$259E14 $265C22 $26DEC6` / `$259E08 $265A4C $26B7E2 $26CB16
$26D004 $26E9E4 $26F9EE $26FA0A` / `$265C46 $272B22`), so enemies spawning
enemies is normal, not exotic. Cap `$815EA8 == $C80` = **64 entries of `$50`**,
overflow returns the dummy `$816B2A` - **a FOURTH allocation-failure convention**
on top of wave 5's three (objects: D0=0 + `$80D51C`; enemies: carry + `$81454C`;
sprite queue: carry + count zeroed). It is a *fifth* if you count `$289004`'s
80×`$38` pool at `$81B732` returning `$81C8B2`.

Measured: 372 successful allocations against 339 script records, so **at least
33 stage-1 spawns come from the deferred queue** (at least, because a script
record whose band was full is silently dropped at `$263424 bcs`). Per type the
extras are concentrated: script `$11` x104 vs spawned `$11` x133, and
`$1E` x0 in the script vs x2 spawned -- `$1E` is the type whose handler
(`$296DD6`) no static read of the script could have predicted. 6 of the 372
land in the 8-slot BOSS band (types `$20`/`$21`, `$2636DA cmpi.w #$20 / cmpi.w #$23`). The
2-slot special band was never used. `aborted_no_subrecord = 0`.

---

## 3. THE SUB-RECORD ALLOCATOR `$2635B2` - and a table that overruns its neighbour

Every enemy owns a RUN of `($4,A5)+1` consecutive 32-byte sub-records; A6 in
every handler is the first of them.

```
2635b2: move.w D0,D1 / move.b ($d,A5),D2
2635b8: tst.b D2 / bmi  -> lea $81521c,A6 / moveq #$32,D2     51 slots
2635c6: btst #$5,D2 / bne -> same
2635cc:                      lea $81459c,A6 / moveq #$64,D2   101 tests
2635d4: subq.w #1,D2 / bcs $2635f4   (return with CARRY = no run available)
2635d8: tst.b (A6) / lea ($20,A6),A6 / beq -> dbra D1 (run continues)
2635e8: lea (-$20,A6),A6 / move.w #$8000,(A6) / dbra D0       mark the run
```

`$81459C + 100 × $20 = $81521C` - **the 101st slot the loop tests is slot 0 of
the OTHER table.** `$263584` walks the same base with `moveq #$63,D3` (100
slots) and `$28AD54` walks it with `move.w #$95,D0` (150 slots). Three different
lengths for one table in three routines. I did not resolve which is intended;
translated as written, the aliasing is reachable and a port that "tidies" it to
100 will diverge exactly when the table is nearly full. **Flagged, not resolved.**

Failure is loud in the right way: `$263622 bcs $263674` → `clr.w (A5)` → the
enemy slot is freed and **the spawn is lost after the allocator already
committed it**. Measured 0 times in 9,500 frames.

---

## 4. WHAT THE HANDLERS DO - the shared machinery, then the families

Every stage-1 handler is a thin shell over four shared routines. The shell is
what differs; the machinery is common and is where the port's leverage is.

### 4a. `$2638A6` - THE MOVEMENT SCRIPT INTERPRETER

```
2638a6: tst.w $8130d2 / bne  ->                    a global FREEZE flag
2638ae: btst #$0,($d,A5) / bne jsr $24179e         scroll-locked enemies
2638bc: movea.l ($12,A5),A0                        the byte-stream cursor
2638c0: move.b (A0)+,D1 / bmi $263926              $80+ = an ESCAPE opcode
2638c4: move.b (A0)+,D0 / beq $2638d2              0 = run forever
2638c8: cmp.b ($10,A5),D0 / beq $263916            step counter -> next entry
2638ce: addq.b #1,($10,A5)
2638d2: andi.w #$7f,D1 / move.b D1,($1b,A6)        THE DIRECTION BYTE
2638da: cmpi.w #$40,D1 / bcc $263910               >= $40 -> D2=D3=0, stationary
2638e0: btst #$5,($2,A5) / bne $2638fa
2638e8: movem.w ($40,A5),D2-D3                     the CACHED velocity
2638ee: add.w D2,($2,A6) / add.w D3,($4,A6)
2638fa: bclr #$5,($2,A5) / jsr $2417de             recompute, then cache it
```

So an enemy's path is a **(direction, duration) byte pair stream** with the
velocity cached in `($40,A5)`/`($42,A5)` and invalidated by bit 5 of `($2,A5)`.

A direction byte with bit 7 set is an ESCAPE (`$263926`):

```
263926: cmpi.b #$c0,D1 / bcs $263932
26392c: move.b (A0)+,($1a,A6)                 >= $C0 : SET SPEED
263932: andi.w #$f,D1 / *4 / lea ($263948,PC),A1 / movea.l (A1,D1.w),A1 / jsr
263948: 12 LONGWORDS -- $263978 $263982 $263988 $26399A $2639AC $2639B2
                       $2639CE $2639EA $2639F0 $2639F6 $263A04 $263A0C
  [0] $263978  JUMP BACK: D0 = (A0)+ ; A0 -= D0*2      (the loop opcode)
  [1] $263982  ($1f,A6) = (A0)+
  [2] $263988  (A0)+ == 1 ? bclr #5,(A6) : bset #5,(A6)
  [3] $26399A  (A0)+ == 1 ? andi.w #$dffe,(A6) : ori.w #$2001,(A6)
  [4..11] not read
```

**13 movement opcodes** (12 escapes + set-speed), a byte-code the port has to
interpret rather than 19 hand-written movement functions.

### 4b. `$241812` - DIRECTION+SPEED → VELOCITY

```
2417de: moveq #0,D0 / move.b ($1a,A6),D0           SPEED index
2417e4: moveq #$3f,D1 / and.b ($1b,A6),D1          DIRECTION, 6 bits
241812: D1 *= 4 ; D0 *= 4
24181a: lea $200920,A3 / movea.l (A3,D0.w),A3      per-speed table of tables
241824: D3 = D1*2 / lea ($2418b4,PC),A0 / adda.w (A0,D3.w),A3
241836: D2 = (A3)+ ; D3 = (A3)+ ; asr.l #4 both    dx, dy  (fixed point >> 4)
24183e: andi.w #$c0,D1 / lsr.w #1 / jmp ($241850,A3)   QUADRANT mirroring
```

**`($1A,A6)` = speed index, `($1B,A6)` = 8-bit heading (6-bit angle + 2 quadrant
bits).** Both live in the SUB-record, not the enemy record.

### 4c. `$286096` - DAMAGE AND SCORE

```
2688cc handler:  moveq #$5c,D1 / and.b (A6),D1 / beq (no hit)
                 andi.b #$a3,(A6)          consume the hit bits
                 jsr $286096
                 tst.w ($18,A6) / bpl (still alive)
                 move.w ($26,A5),($18,A6)  RELOAD HP from the record
                 moveq #$8,D0 / jsr $28615e
                 bset #$7,($20,A5)         the DYING flag
```

`(A6)` byte 0: **bit 4 = hit by P1, bit 3 = hit by P2, bit 2 and bit 6 = mode
bits** (`$5C = %01011100`). `$286096` reads them, adds `1 + $81B63E` (P1's power
word) or `1 + $81B640` (P2's) of damage, and dispatches to `$286626` /
`$286876` / `$286A82` / `$286B9C` / `$286DA8`. **`($18,A6)` is the HP;
`($26,A5)` is the reload value.**

The score engine lives in the same block and is worth a line here because wave 5
recorded *"the score and chain words were not located"* and *"I am not going to
name a plausible address"*: `$28663A..$2866CA` reads `$81B5E0`, accumulates into
`$81B5C0` against the threshold `$81B5B2`, indexes `($286EC2,PC)` by `$813094`,
switches on `$81B65C == 5`, and ends `add.w D0,$81B64A`. **`$81B64A` and
`$81B65C` are strong score/chain candidates from the LISTING. I did not put a
tap on them and I am not claiming them.** One write tap closes it.

### 4d. `$2459D0` - THE HIT TEST, and the enemy hitbox

```
2459d0: move.w ($2,A4),D0 / D1 = D0
2459d6: add.w ($10,A4),D0 / sub.w ($12,A4),D1      axis A: +$10 / -$12
2459de: move.w ($4,A4),D2 / D3 = D2
2459e4: add.w ($14,A4),D2 / sub.w ($16,A4),D3      axis B: +$14 / -$16
2459ec: lea $817f8e,A6 / move.w #$6,D6
2459f6: … #$a / #$f / #$12 / #$14 gated on $81B414/$81B416/$81B418/$81B41A
245a3a: moveq #$51,D4 / and.b (-$4,A6),D4 / bne (skip)
245a42: moveq #$10,D4 / or.b D4,(-$4,A6) / or.b D4,(A4)     <- SETS BIT 4
245a4a: move.w #$1,$80fa7e
```

**The enemy hitbox is four half-extents at `($10,A4)`, `($12,A4)`, `($14,A4)`,
`($16,A4)` of the SUB-record, asymmetric on both axes**, and the hit is recorded
as bit 4 of the sub-record's byte 0 - exactly the bit `$286096` consumes. Wave 2
item 6 and waves 4 and 5 all left "the hitbox" open; this is the enemy half of
it, from the listing, with the write (`or.b D4,(A4)`) that makes it a clean
execution hook for the next wave. The player-shot list it walks is `$817F8E`
and its ACTIVE LENGTH is 6/10/15/18/20 entries selected by the four power words
`$81B414..$81B41A` - i.e. **the number of shot hitboxes tested scales with the
player's power**, which is a rank-shaped amplifier and belongs in the state
vector.

### 4f. THE TWO RECORD LAYOUTS, as far as this recon read them

Fields marked (L) are from the listing with the instruction that touches them;
nothing here was guessed from a name.

**Enemy record - 58 x `$50` at `$81332C`, A5 in every handler**

| off | what | evidence |
|---|---|---|
| `+$00` w | alive word `$8000\|bandIndex`; 0 = free; `bpl` after the handler = it killed itself | `$263716`, `$26351E`, `$263544` |
| `+$01` b | bit 0 picks P1/P2 as the aim target at init | `$263638` |
| `+$02` b | bit 5 = "velocity cache is stale" | `$2638E0`, `$2638FA` |
| `+$03` b | **the target-player index** | `$263648`, read by `$242716` |
| `+$04` w | sub-record run length - 1 | `$26361C` -> `$2635B2` |
| `+$06` l | the SUB-RECORD pointer (A6) | `$263624`, `$263524` |
| `+$0A` w | the spawn record's parameter word | `$263428` |
| `+$0C` b | **THE TYPE BYTE** (dispatch index) | `$263728`, `$2635F8` |
| `+$0D` b | flags: bit 0 scroll-locked, bit 5/bit 7 pick the `$81521C` sub-table | `$26372C`, `$2638AE`, `$2635B4` |
| `+$10` b | movement-script step counter | `$2638C8` |
| `+$12` l | **the movement-script cursor** | `$26342E`, `$2638BC` |
| `+$20` b | status; bit 7 = dying | `$26893C` |
| `+$26` w | the HP RELOAD value | `$26892E` |
| `+$2A` l | a behaviour sub-routine, `jsr` | `$2689C2` |
| `+$2E` l | an emitter, tail-called `jmp` | `$268A7E` |
| `+$33` b | the current facing, stepped toward the aim | `$268A42` |
| `+$40`/`+$42` w | the cached velocity D2/D3 | `$2638E8`, `$263906` |
| `+$4C` l | **THE PER-FRAME HANDLER** | `$263532`, `$26362C` |

**Sub-record - `$20` bytes, `$81459C` (100/101/150 slots, see 3) or `$81521C`
(51), A6 in every handler**

| off | what | evidence |
|---|---|---|
| `+$00` b | bit 7 allocated, **bit 4 hit by P1, bit 3 hit by P2**, bits 2/6 mode, bit 1 = no damage | `$2635EC`, `$245A44`, `$286096`, `$28609A` |
| `+$02` w | position axis A (pairs with `$8103E8`) | `$242038`, `$268024` |
| `+$04` w | position axis B, scroll-compensated every frame | `$26352E` |
| `+$10`/`+$12` w | hitbox half-extents, axis A, + and - | `$2459D6`, `$2459DA` |
| `+$14`/`+$16` w | hitbox half-extents, axis B, + and - | `$2459E4`, `$2459E8` |
| `+$18` w | **HP**; goes negative to die | `$268920`, `$26892E` |
| `+$1A` b | speed index into `$200920` | `$2417E0` |
| `+$1B` b | **direction: 6-bit angle + 2 quadrant bits** | `$2417E6`, `$2638D6`, `$241FEE` |
| `+$1D` b | palette/attribute, `eor`'d with `($35,A5)` | `$268916` |
| `+$1E` b | animation frame | `$268966` |
| `+$2E` b | an alternative target index | `$24273C` |

**Freeing is two-phase and that is a trap.** `$263762` writes `$01` to every
sub-record byte 0 of the run and then `clr.w (A5)`; `$263754` writes `$00`
instead. `$28AD54` - the call immediately AFTER `$2634F4` in `$28B5E0` - sweeps
`$81459C` and turns any byte 0 that is non-zero-and-positive into 0. So a
sub-record freed by a handler stays "used" until the next subsystem call, and a
port that frees immediately will hand out different slots.

### 4e. The families

| family | shape | stage-1 members |
|---|---|---|
| script-mover | `jsr $2638A6` first, then an off-screen test, then `jmp $263762` (free) | `$2688CC $268232 $2739C0 $2747C6 $27733E $275F30 $275914` |
| damage-first | `moveq #$5C,D1 / and.b (A6),D1 / … jsr $286096` first | `$26A2E2 $269CEA $26A5E4 $26AD28 $26A860` |
| scroll-locked | `tst.b $8130F8 / jsr $24179E` first | `$27687E $276702` |
| bespoke | boss / midboss / special | `$272AAC $26B6FA $29700C $2697F6 $292902 $296DD6` |

`$263762` is the FREE path and it is not one instruction: it walks the enemy's
whole sub-record run writing `$01` to each byte 0 (`$263754` writes `$00`
instead - two different free flavours), then `clr.w (A5)`.

**Every enemy record carries THREE function pointers, not one:** `($4C,A5)` the
per-frame handler, `($2A,A5)` a behaviour sub-routine (`$2689C2: movea.l
($2a,A5),A0 / jsr (A0)`), and `($2E,A5)` a tail-called emitter (`$268A7E:
movea.l ($2e,A5),A0 / jmp (A0)` with D1 = position, D2 = a graphic pointer,
D3 = `$620`/`$410`, D4 = `($1C,A6)`). Wave 5 costed the job at `+$4C` only.

---

## 5. THE AIM - found, and measured against the LIVE player

This is the owner's own lesson from play, so it gets the most evidence.

### The routine

```
242022: movem.w $8103e8,D2-D3       <- AIM AT P1, read from RAM every call
242018: movem.w $81044a,D2-D3       <- AIM AT P2
24202c: bsr $24270a                 <- AIM AT THIS ENEMY'S TARGET
  24270a: lea $8103e6,A0 / lea $810448,A1
  242716: tst.b ($3,A5) / beq / exg A0,A1        the record's target index
  24271e: tst.w (A0) / bmi (use it)              bit 15 = that player is alive
  242722: tst.w (A1) / bmi (use the other)
  242726: ori #$1,SR / rts                       BOTH DEAD -> CARRY
242032: movem.w ($2,A0),D2-D3       the chosen player's position
242038: movem.w ($2,A6),D0-D1       the aiming object's own position
24203e: bias both axes by $1800
24204c: |dy|, |dx|, building the OCTANT in D4 (0,4,+2 on the three tests)
242074: asl.l #6,D0 / divu.w D1,D0  64 * min/max, rounded at $242080
242088: lea ($2420f6,PC),A0 / move.b (A0,D0.w),D0     the ARCTAN LUT
242092: lea ($2420e6,PC),A0 / move.w (A0,D4.w),D1     the octant base
24209c: lea ($2420c6,PC),A0 / jmp (A0,D4.w)           add or subtract
2420ae: sub.w D0,D1 / addq #4 / lsr.w #3 / andi.w #$3f    -> D1 = 0..63
```

Callers, by `xref.py callers` (absolute-long only - a lower bound):
`$24200A` has 12+ enemy-region callers, `$24202C` has 12+, and the variants
`$242730` (target from `($2E,A6)`), `$242748` (from `($2A,A6)`) and `$242760`
(alternating, driven by `$803916`/`$803917`) exist too. `$241FEA`/`$241FF4`/
`$241FFC`/`$242018`/`$242022` have **no** absolute-long callers and are reached
by `bsr`; `pcref.py` finds those.

### The measurement

```
$ python games/ddpdoj/tools/recon10/runaim.py 4200 --invuln --autofire --tag aim42
  READERS of $8103E8/$8103EA (P1 position): 25 distinct PCs, 46407 reads
  READERS pos 242010:12714 23F11C:4466 2495C0:4464 24C33A:4410 27676E:2831
              24A4A0:2234 261402:2233 2459D0:2233 2459DE:2233 249EA0:2232
              242032:1652 24A620:1117 24A5D2:1117 24A2DA:444 24A2E2:444
              24A22E:443 24A226:443 2759EE:274 273C28:246 268024:68 …
  READERS of $8103E6 (P1 alive word): 56 distinct PCs, 86167 reads
  READERS alive … 242722:3624 24271E:3571 242886:2831 …
  AIM $242086 executions (one per completed atan2) = 14922
  AIM callers … from268A36 from26839E from26A3EC from24217C from275A04
                from273C50 from273C7A from26A288 from268422 from274A02
                from269DE8 from26A486 from27387E from273854 from275854
                from27467C
  DONE logicframes=4200 videoframes=4260 fails=0
```

```
$ python games/ddpdoj/tools/recon10/runaim.py 4200 --invuln --autofire --move --tag aimmove
  READERS of $8103E8/$8103EA (P1 position): 28 distinct PCs, 47799 reads
  AIM $242086 executions (one per completed atan2) = 12884
  AIM octant D4/2: 8 distinct  4:3658 5:3595 1:2384 0:1600 2:1105 6:412 3:72 7:58
  AIM ratio  D0/8: 16 distinct 06:1128 08:1088 04:892 11:864 10:832 01:831 ...
  AIM player position at the aim (posA/256,posB/256): 489 distinct
                                  8,3:1428 8,20:1364 8,47:917 101,20:542 ...
  DONE logicframes=4200 videoframes=4236 fails=0
```

```
$ python games/ddpdoj/tools/recon10/runaim.py 4200 --invuln --autofire --tag aimstill
  AIM $242086 executions = 14922
  AIM octant D4/2: 6 distinct  5:6864 4:3655 1:2690 6:1147 0:380 7:186
  AIM player position at the aim (posA/256,posB/256): 1 distinct  17,20:14922
```

**THE A/B, and it is decisive.** Same boot, same auto-shot, same invulnerability
poke, same 4,200 frames; the only difference is a stick sweep.

| | still | moving |
|---|---|---|
| player position at the aim | **1** distinct value | **489** distinct values |
| aims executed | 14,922 | 12,884 |
| octants reached (D4/2) | **6** - octants 2 and 3 NEVER occur | **8** - octant 2 occurs 1,105 times, octant 3 seventy-two |
| octant 0 share | 380 | 1,600 |
| octant 5 share | 6,864 | 3,595 |

The aim's own pre-LUT output - D4 the octant and D0 the min/max ratio, which
together ARE the direction - is a different distribution, and reaches two
octants that the still run cannot reach at all. **The enemies' aim is a
function of where the player IS, sampled inside the call, and a recording
cannot supply it.**

A READ tap is legitimate here and the reason is written into `aimprobe.lua`:
`00-recon-hard.md` §3's rule ("a read tap only proves PREFETCH") is about taps
on CODE. `$8103E6..$8103EB` is main RAM the 68000 never executes from, so every
hit is a genuine DATA read and CURPC is the reader.

**The aim runs 14,922 times in 4,200 logic frames, reads `$8103E8`/`$8103EA`
out of RAM on every call, and re-selects its target through the alive bits every
call. There is no cached copy, no per-spawn snapshot.** A simulated enemy that
aims at a recorded position is wrong 3.5 times per frame.

`$268024` (68 reads) is a separate NEAREST-PLAYER selection with its own
octagonal distance metric (`max + min/2` after `dx -= dx>>2`), used at spawn.

**The 1P fallback is load-bearing and is exercised constantly.** `$263638`
assigns the target from bit 0 of `($1,A5)` -- the slot index -- so in a ONE
PLAYER game roughly half of every enemy's records nominally target P2, and
`$242722 tst.w (A1) / bmi` is what rescues them onto P1. That branch fired
2,552-3,624 times per 4,200-frame run in both the still and the moving
scenario. A port that hardcodes "aim at P1" is right by accident in 1P and
wrong the moment `($3,A5)` matters.

Not every aim is a shot: `$268A0E`, the type-`$11` fire block, uses the aim to
pick a **sprite orientation** (`$268A3C jsr $242190` steps `($33,A5)` one unit
toward the aimed angle, then `($268C9E,PC)` maps it to a graphic in `($22,A5)`)
as well as to fire. Both are pixels the capture is currently faking.

---

## 6. THE ENEMY BULLETS - located, not yet characterised

`$27F95A`, the fourth call in `$28B5E0`:

```
27f95a: move.w $817f7e,D7 / beq                 the live count
27f964: lea $8171be,A6                          THE BULLET TABLE
27f96a: move.w $813176,D6                       the scroll delta
27f97a: sub.w D6,($4,A6)                        scroll compensation, per bullet
27f97e: moveq #$7c,D0 / and.w D1,D0             (A6) & $7C -> 32 kinds
27f982: tst.b D1 / bmi $2810ca                  a whole second dispatch
27f988: lea ($27f99e,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
27f994: lea ($2c,A6),A6
```

**Stride `$2C` at `$8171BE`, live count `$817F7E`, a 32-entry PC-relative
dispatch at `$27F99E` plus a second one behind `$2810CA`.** Wave 5's
`$289004` (80 × `$38` at `$81B732`, dummy `$81C8B2`) is a DIFFERENT pool -
measured 5 allocations in 9,500 frames, so it is not the bullet pool.

I did not disassemble the 32 bullet handlers or find the bullet-vs-player hit
test. `$245900`'s loop (base `$817F8E`, 45 inner entries of stride `$30`, outer
count 69/109/159/189/209 gated on the same four power words) is adjacent to it
and reads the player position 2,233 times - one per frame - but its stride
disagrees with `$2459D0`'s `$3E` on the same base and **I did not resolve that
disagreement.** Named here rather than guessed.

---

## What I RULED OUT

1. **"The handler enumeration can only be done by measurement."** False. The
   type table `$267824`/`$27E412` is static, 8 bytes per type, and 0 of 190,952
   runtime dispatches disagreed with it.
2. **"Wave 5's five handlers are the stage-1 set."** False by 4×: 20 measured,
   19 predicted from the script, all with `$813096 == 0`.
3. **"The enemies are reached from top-level type 10."** They are reached from
   type **5**, `$28B5E0` → `$28B5EC` → `$2634F4`, sole caller.
4. **The 2-slot "special" band is not reachable from the stage script.** The
   script path forces `D1 = byte +5 ≥ 0` (`$2633E8`'s mask/shift), and
   `$2636F6 tst.w D1 / bpl` needs it negative. Only the deferred queue
   (`$263464 move.w ($4,A4),D1`, a signed word) can select it - and it never
   did in 9,500 frames.
5. **`$81B732` is not the enemy-bullet pool.** 5 allocations in 9,500 frames.

## What I could NOT do

1. **An EXHAUSTIVE proof that `$26132C` is the only writer of `$8130CE`.** The
   byte scan that found it only matches the absolute address at instruction+2,
   so longer-prefix writes are invisible to it. One write tap closes this.
2. **The 32 enemy-bullet handlers at `$27F99E`, and the second dispatch behind
   `$2810CA`.** Located, not read.
3. **The bullet-vs-player hit test**, and the `$30`-vs-`$3E` stride
   disagreement on `$817F8E`.
4. **The score/chain words.** `$81B64A` and `$81B65C` are listing candidates
   from `$28663A`; no tap was run, so they are named as candidates only.
5. **`$81459C`'s true length** (100 / 101 / 150 in three routines).
6. **Any rank variation.** `$813098` read 0 for the entire run; every number
   here is at ONE rank. `$286096` and `$28663A` both branch on it.
7. **Anything beyond stage 1.** `$813096` never left 0.
8. **The DIRECTION BYTE actually stored.** The still/moving A/B measures the
   aim's pre-LUT output (octant + ratio), not the final 6-bit value the caller
   writes into `($1B,A6)`; the ~80 store sites (`move.b Dn,($1b,A6)` x80 and
   `($1b,A0)` x89, by byte scan) make one clean tap impossible. The A/B plus
   the listing is a strong inference, not a byte-for-byte check of the stored
   value.

## The intervention, stated

`$810424` (the player's `($3E,A6)` invulnerability timer) is held at `$FF` from
lf1990 at the game's own sample point, exactly as the `fly-around` scenario
already does and for the same reason - `$FF` is a value the game writes itself
at `$2495A2`. Without it the ship dies and the stage-1 script never reaches its
terminator. Button 3 (auto-shot, `$2497B2`) is held from lf1800. Both are
labelled on every number that depends on them.

## If someone picks this up cold

```
python games/ddpdoj/tools/recon10/enemytypes.py table          113 handlers, 256 types
python games/ddpdoj/tools/recon10/enemytypes.py script 230C6C  339 records, 19 handlers
python games/ddpdoj/tools/recon10/run.py 9500 --autofire --invuln --continues
python games/ddpdoj/tools/recon10/runaim.py 4200 --invuln --autofire         still
python games/ddpdoj/tools/recon10/runaim.py 4200 --invuln --autofire --move  moving
python games/ddpdoj/tools/recon10/pcref.py to 2636D6           the bsr callers xref.py cannot see
python games/ddpdoj/tools/oracle/xref.py dasm 2633BE 200       the spawn walker
python games/ddpdoj/tools/oracle/xref.py dasm 2635F6 100       the per-type dispatch
python games/ddpdoj/tools/oracle/xref.py dasm 24202C 120       THE AIM
```
