# W49 RECON - WHAT ENDS STAGE 1?

status: **DONE** - see the WAVE ESTIMATE (§8) and WHAT I COULD NOT DETERMINE
(§9). Headline, and **the brief's premise is wrong in its first sentence**:
**nothing freezes the camera for the boss.** The camera never stops. It keeps
travelling at **4.000 px/frame forever** while a 14-column band of map repeats;
what the scroll program freezes is the DISTANCE CLOCK, and the picture only
*looks* parked. And the thing that ends stage 1 is not an unfreeze at all -
**the background object is DESTROYED and a new one is built for stage 2**, by a
machine the boss reaches in one instruction the boss recon read and did not
follow: `$292922 jsr $242952`.

wave: 49. role: RECON (READ-ONLY; the only file I write is this one).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin`, the decrypted build-B
image, address == file offset, 6,291,456 B. Disassembly `tools/oracle/w27disasm.py`
and `xref.py dasm` (capstone `CS_MODE_M68K_030`); cross-references `xref.py`
(absolute-long only) **plus a second scratch scanner of my own** (`refs.py`)
that covers `bsr.b/.w/.l`, `bra.b/.w/.l`, `jsr/jmp (d16,PC)`, `lea (d16,PC)`
and raw longword occurrences over `$230000..$2B0000`. Two independent methods
agree on every census below. Anything reached through `jsr (An)` or a computed
jump is invisible to both, so **every "N callers" is a LOWER BOUND**.
concurrency: an implementer is editing `games/ddpdoj/src/` and `tools/`. Every
statement about the port is a snapshot of a tree that may be mid-edit; I read
`src/` only to say what is and is not cited.

---

## 0. THE BRIEF'S PREMISE, CHECKED

The brief says, quoting the boss recon:

> **The boss does NOT stop the scroll.** It arrives into a camera the scroll
> program has ALREADY frozen.

The first sentence is right. **The second is wrong**, and the correction changes
what a port has to build.

`$261792` is an op-`$0C` FREEZE. I read `$26214C` (its handler) and
`$2612A0..$261376` (the per-frame body) instruction by instruction this session.
The freeze word `($8,A5)` is read at **exactly one place in the per-frame path**:

```
261324: 4a6d0008     tst.w  $8(a5)        <-- the freeze
261328: 66000008     bne.w  $261332
26132C: 5279008130ce addq.w #$1, $8130ce  <-- ...and this is ALL it gates
```

Everything that moves the camera is **outside** that guard and above it:

```
2612FE: 3c2d001c     move.w $1c(a5), d6        the SPEED, read unconditionally
261308..261314:      jsr $240b94               the BG camera accumulate
261336..261376:      the column accumulator, $261F76, and the 9-longword
                     column write -- all unconditional
```

So a FROZEN background **keeps scrolling at whatever speed the last op-`$08`
record set**. `src/background.js`'s `BGO.frozen` comment already says this in
prose (citing W19); the brief, the boss recon §4.2 and the phrase "the boss
lock" have been reading it the other way for several waves.

**I then measured it.** `sim.py` (scratch) simulates stage 1's along axis using
only the instructions above plus `$261F76`, `$262062`, `$262102`, `$26213A`,
`$26214C`, with the record table read live out of the ROM:

```
LOCK reached at frame 7317: clock=$0344 speed=$0100 (4.000 px/f) px=8486
                            cols=265 loops=$FFFF cur=$261798
  +    1 frames: clock=$0344 frozen=1 speed=$0100 px=8490  cols=265
  +  112 frames: clock=$0344 frozen=1 speed=$0100 px=8934  cols=279
  + 1000 frames: clock=$0344 frozen=1 speed=$0100 px=12486 cols=390
  + 5000 frames: clock=$0344 frozen=1 speed=$0100 px=28486 cols=890
```

**Frame 7,317 and 8,486 px** - the two numbers HANDOVER carries for the lock,
reproduced here from the ROM by a model written this session that shares no code
with `scrollgate.py` or with `src/background.js`. And then the camera keeps
going: **20,000 more pixels and 625 more columns in the next 5,000 frames**, the
column stream cycling a 14-column band forever. (My band prints as map columns
195..209; W19's says 210..223. The difference is exactly the 15-column pre-fill
`$26114C` performs before the handler's first frame, which I did not model. Same
band, different origin.)

> **THE STAGE-1 "BOSS LOCK" IS NOT A FROZEN CAMERA. It is: the distance clock
> parked at `$0344`, the record cursor sitting on the `$FFFF` terminator, and a
> 14-column map band repeating under a camera that never slows down.**

That matters for the port because "unfreeze the camera" is not a thing anyone
has to implement. Nothing ever unfreezes it. §3 says what actually happens.

---

## 1. THE STAGE-1 SCROLL PROGRAM, DECODED FROM THE ROM THIS SESSION

`recs.py` (scratch) walks the record stream from the per-stage script pair
table, decoding `time.w / cond.w / op.w / operands` with the operand widths
taken from the seven opcode handlers. **This is my own decode, not a citation.**

```
script $261610  objstream=$26157A cuestream=$261602 records from $261618
  ... 39 records ...
  $261756  t=$01DA op=$14 CUE     n=1
  $26175E  t=$01E4 op=$08 SPEED   speed=$0040 = 1.000 px/f
  $261766  t=$01E8 op=$08 SPEED   speed=$0080 = 2.000 px/f
  $26176E  t=$01F2 op=$14 CUE     n=1
  $261776  t=$01F8 op=$08 SPEED   speed=$00C0 = 3.000 px/f
  $26177E  t=$0218 op=$08 SPEED   speed=$0100 = 4.000 px/f     <-- THE LAST SPEED
  $261786  t=$0344 op=$04 REPEAT  rewind=-14 len=14 loops=$FFFF
  $261792  t=$0344 op=$0C FREEZE
  $261798  TERMINATOR $FFFF
  41 records

script $26179A  objstream=$000000 cuestream=$000000 records from $2617A2
  ... 16 records, all op $08, last is
  $26181A  t=$0218 op=$08 SPEED   speed=$0100 = 4.000 px/f
  $261822  TERMINATOR $FFFF
  16 records
```

41 + 16 = **57 records**, the number HANDOVER carries, re-measured.

### 1.1 Q4 - **IS THE BOSS THE END? YES, AND THE LISTING PROVES IT**

This is one of the rare "absence" claims the listing itself can settle, so I am
making it flatly:

> **STAGE 1's SCROLL PROGRAM HAS ZERO RECORDS AFTER THE BOSS FREEZE.**
> `$261792` (op `$0C`) is the LAST record of script 0; the very next word,
> `$261798`, is the `$FFFF` terminator that `$262074` stops on. Script 1's last
> record is `$26181A` at t=`$0218`, which is **before** `$0344`, so script 1
> has nothing after it either. There is no content beyond the boss.
> Denominators: **41 of 41** script-0 records and **16 of 16** script-1 records
> decoded, terminators found at both ends.

And the boss's `$0344` freeze is **the second** freeze in the stage, not the
first: `$26162C` at `t=$0034` is an identical op-`$0C` whose op-`$04` partner
(`$261620`) armed `loops=$0002` - a finite repeat, which `$261FB8`/`$261FC0`/
`$261FC4` releases after 56 columns. So the format has a working release and the
boss record deliberately does not use it (`loops=$FFFF`). **1 of the stage's 2
freezes is releasable from inside the VM.**

---

## 2. Q2 - THE DOOR CENSUS. NOT FIVE. TEN, AND THE TWO THAT MATTER WERE MISSED

The boss recon says "none of the five known unfreeze doors appears anywhere in
the boss's 257-routine static closure". I re-measured every door it named and
found the ones it did not have. Every count below is from BOTH scanners.

| # | door | what it writes | refs in `$230000..$2B0000` | who |
|---|---|---|---|---|
| 1 | `$261138` | `$81317E := 1` - external freeze **ON** | **0** (abs.l, all bsr widths, `(d16,PC)`, raw longword) | nobody |
| 2 | `$261142` | `$81317E := 2` → `$2612F0 clr.w $8(a5)` - external freeze **OFF** | **2** | `$26C7F4`, `$26D254`, both enemy state machines, each `+ clr.w $8130F4` |
| 3 | `$261100` | `$813180:=1`, `$813182:=D0`, `$813184:=D1` → `$2612BC` overwrites `($1C,A5)`/`($22,A5)` - external **SPEED PUSH** | **9** | `$26B73C`(the stage-1 midboss) `$26D804 $26D866 $26E04E $26E154 $26F616 $26F6C8 $2A5D2A $2A61E2` |
| 4 | `$25FD82` | `$8130D2 := 1` - the whole handler is skipped (`$2612A0`) | **3** | `$25FCFA`, `$25FDE0`, `$288AD0` |
| 5 | `$25FD8C` | `$8130D2 := 0` | **1** | `$25FDD2` (inside the alive-player counter `$25FD94`) |
| 6 | `$261FB8`/`$261FC0`/`$261FC4` | rewind:=0, `($8,A5)`:=0, clock:=resume - the VM's **own** release | in-VM | `$261F76`, and **only when `loops != $FFFF`** |
| 7 | `$26204A` | `($8,A5) := 0` | in-VM | `$26200E`'s fast-forward, i.e. object creation only |
| **8** | **`$25FCFA`** | `bsr $25FD82` **then `lea $813144,A0 / jmp $241238`** - pause the background **and DESTROY the background object** | **1** | **`$28D5D6`** |
| **9** | **`$25FD24`** | `lea $8130CE,A0 / move.w #$15,D0 / move.w #0,(A0)+ / dbra` - **22 words = `$8130CE..$8130F9` wiped**, which includes the distance clock, `$8130D2` and both boss flag bytes | **3** | `$25FD38`, `$260596`, `$2605BA` |
| **10** | **`$25FD38`** | `bsr $25FD24`, eight subsystem resets, then `move.w #$1,D0 / jsr $241182 / move.l D0,$813144 / move.w #$0,($6,A0)` - **build a NEW type-1 background object with entry clock 0** | **1** | **`$28D674`** |

**Doors 8, 9 and 10 are the real ones, and the boss recon did not have them.**
Doors 1–7 are the ones it counted; door 1 has no caller anywhere in build B by
any of the four reference forms I scanned, so "five known doors" overcounts by
one dead door and undercounts by three live ones.

Note what doors 8/9/10 mean: **the stage-1 lock is never released.** The object
holding it is queued for destruction (`$241238` pushes the handle at `(A0)` onto
the deferred-kill list at `$80DBFE`, cursor `$80E23E`, drained by `$241262` into
`$2411E2`), its RAM is wiped, and a fresh one is constructed. The camera does
not stop at the boss and it does not resume after him - **it is replaced**.

---

## 3. Q1 + Q3 - THE WHOLE CHAIN, BOSS DEATH TO STAGE 2, EVERY LINK MEASURED

The boss recon printed `$292902` in full and stopped at its tenth instruction.
The answer is inside it. Re-disassembled this session:

```
292902: 4eb900294ad8   jsr $294AD8.l      the damage / part-destruction pass
292908: 4a6d0024       tst.w $24(a5)
29290C: 670a           beq.b $292918
29290E: 536d0024       subq.w #$1,$24(a5)
292912: 4eb900243dd0   jsr $243DD0.l
292918: 4eb90025962e   jsr $25962E.l      THE SCHEDULER, one frame
29291E: 64000010       bcc.w $292930      C clear -> just rts
292922: 4eb900242952   jsr $242952.l      <-- ****** THE STAGE ADVANCE ******
292928: 4ef900263762   jmp $263762.l      free the boss enemy
292930: 4e75           rts
```

### 3.1 The links, in order

**LINK 1 - the boss dies.** `$294AD8` part 0's HP `$16(a5)` goes negative, or
the timeout at `$294F32` expires (§5). Either way `$294DD4` runs, and among the
things it does is **start table-D script id 6**.

**LINK 2 - D script 6 suspends the scheduler.** `$293DC6` (INIT) loads
`move.w #$8,$4(a4)`, `#$1209,$6(a4)`, **`#$20,$A(a4)`**. `$293E04` (STEP):

```
293E04: cmpi.b #$6,$2(a4) / bne $293E20
293E0E: subq.w #$1,$A(a4) / bne $293E1E      <-- 32 frames
293E16: jsr $2595E8.l                        <-- $812E06 := 1  GLOBAL SUSPEND
293E1C: clr.w (a4)                           <-- the channel retires itself
```

`$2595E8` is `move.w #$1,$812E06 / rts`, and it has **six callers** - one per
boss (`$293E16 $298E14 $29CC72 $2A0646 $2A6466 $2A6B88`).

**LINK 3 - the suspend turns the boss handler's `bcc` around.**

```
25962E: tst.w $812E06 / beq $25963E
259638: ori.w #$1,sr        <-- C = 1
25963C: rts
```

So on the frame after the suspend, `$29291E bcc` is NOT taken and
`$292922 jsr $242952` fires. Exactly once, because `$292928` frees the enemy.

**LINK 4 - `$242952` IS THE STAGE ADVANCE.** Read out this session, and the
`addq.w` is the write the brief asked for:

```
242952: 4eb90028cb60   jsr $28CB60.l                 (sound)
242958: 08f90003…30f8  bset.b #$3,$8130F8            "the stage is clearing"
242960: 08b90004…30f8  bclr.b #$4,$8130F8            disarms the boss's DOUBLE-PASS
242968: 33fc0001…2972  move.w #$1,$812972
242970..2429B0:        bset #5 on $8103E6 / $810448  (both player records)
2429B8: 3e390081 3092  move.w $813092,D7             <-- THE STAGE NUMBER
2429BE: 5247           addq.w #$1,D7                 <-- ****** THE ADVANCE ******
2429C0: 6000006e       bra $242A30
242A30: 303c0006       move.w #$6,D0
242A34: 4eb900241182   jsr $241182.l                 create OBJECT TYPE 6
242A3A: 31470004       move.w D7,$4(A0)              <-- with ($4,A5) = stage+1
242A3E: 4e75           rts
```

**`$242952` has exactly five callers, and they are the five bosses' handlers**
(`xref.py callers 242952`): `$292922` (stage 1), `$2973A8`, `$29BE36`,
`$29EF14`, `$2A4614`. Five callers, five stages. That closes the enumeration.

Type 6 is `$240F92` in the object dispatch table `$240F62` - stride 8, so
**`(($240F92-$240F62)/8) = index 6`**, handler `$28D63C`. (The port's own table
map in `src/main.js` uses the same stride: `$240F62[1] = $26127A` background,
`[2]/[3]` the two players.)

**LINK 5 - type 6's INIT destroys the background.** `$28D566`, reached from
`$28D640 beq` on the first dispatch:

```
28D566: move.b #$1,$2(a5) / move.b #$0,$6(a5) / move.b #$4,$7(a5)
28D578: jsr $24631C / bsr $28D552 ($81DEBE, $77 words cleared) / jsr $287DC8
28D586: bset #0,$81DF1E / bset #3,$81DF1E / jsr $28E7A2
28D59C: $81DF20 := 1 / $81DF22 := 1
28D5AC: clr.w $81B414 $81B416 $81B418 $81B41A
28D5C4: jsr $23C47A / jsr $260EBE / jsr $28EC86
28D5D6: jsr $25FCFA.l          <-- ****** $8130D2 := 1, AND KILL $813144 ******
28D5DC: $812970 := 1 / rts
```

`$813144` is written at exactly one place - `$25FD74 move.l D0,$813144`,
immediately after `$25FD6E jsr $241182` with **D0 = 1, the background object**.
So `$25FCFA` destroys the scroll VM, the camera, the column writer and the whole
`($8,A5)` freeze in one call. The lock is not released; its owner is deleted.

**LINK 6 - type 6's state machine, `$28D63C`.** `($6,A5)` is the state,
`($4,A5)` the stage number `$242952` handed it:

| state | what runs | leaves on |
|---|---|---|
| `0` | `jsr $28ECCE` | C clear → state `$A` |
| `$A` | `bsr $28D9AA`, `subq.b #1,($7,A5)` (loaded 4) | 4 frames → `$28E7C0`, `$246410` off `$28D7FE`, → state `1` |
| `1` | `bsr $28D9AA` | `$28DE1E` (below) |
| `$B` | `bsr $28D9AA`; `$24681A(($8,A5))`; then `$246800`, `$25313E`, `$25318E`, `bclr #3,$81DF1E`, **`clr.w $8130F8`**, `clr.w $81296E` | → state `2` |
| `2` | `move.w ($4,A5),D0` / **`jsr $25FD0C`** ; `$27F8C4`; `$81DF22:=0`; `$28EDB6`; `$28E7DC`; `$287DDC`; `clr.w $812970` | → state `3` |
| `3` | **`jsr $25FD38`**; `andi.b #$FC,$81DF1E`; `clr.w $812972` | → state `4` |
| `4` | `jsr $28E7E6` (waits on `$81DFF6`) | C clear → `($2,A5) := 2` = destroy self (`$28D5E6` → `$241292`) |
| `$15` | `bsr $28D9AA` | the ENDING arm (stage 5 only) |

and the branch that chooses, inside `$28D9AA`'s tail:

```
28DE0E: tst.w $3E(a6) / bpl $28DE1E
28DE16: bset.b #$2,$8130F9              "the result list has finished"
28DE1E: btst.b #$1,$8130F9 / bne $28DE2A / rts
28DE2A: cmpi.b #$B,($6,A5)  / beq rts    already advancing
28DE32: cmpi.b #$15,($6,A5) / beq rts
28DE3A: cmpi.w #$5,($4,A5)  / bne $28DE5C
28DE44:   lea ($28D8C4,PC),A0 ; ($6,A5) := $15 ; D0=$13 ; jsr $241182   <- THE ENDING
28DE5C:   lea ($28D862,PC),A0 ; ($6,A5) := $B  ; jsr $24652A ; ($8,A5) := D0
28DE70: moveq #0,D1 / jsr $28C186
```

**`$8130F9` bit 1 is the handshake, and it is a CLOSED enumeration.** Every
build-B reference to `$8130F9`, decoded (31 sites):

* **bit 0** - `bset` at **6** sites, `$2927A4 $297A60 $29BCC4 $29ED42 $2A599C
  $2A63BA`, i.e. once per boss init; `btst` at **15** sites, all in
  `$284xxx..$287xxx` (the HUD / effects). "A boss is on screen."
* **bit 1** - `bset` at **EXACTLY ONE** site, `$285496`; `btst` at **exactly
  two**, `$28540C` (the setter's own gate) and `$28DE1E` (the stage advance).
* **bit 2** - `bset` at one site, `$28DE16`; `btst` at one, `$285400`.
* **bit 3** - `bset` `$28DB52`; `btst` `$2853D2`. **bit 4** - `bset` `$2853DC`.

So the advance is a two-flag handshake between type 6 and the HUD:
`$28DE16` (bit 2, "start the tally") → `$285400..$285568` runs the
`$81B610`/`$81B614`/`$81B616` countdown, awarding score through `$28C6C6` /
`$28614A` / `$286154`, with `$28556C` letting the player's buttons (`$23D16C` /
`$23D17E`, mask `$70`) speed it up → `$285496` (bit 1, "done") → `$28DE1E`.

**LINK 7 - `$25FD0C` IS THE STAGE COUNTER WRITE.** The brief asked to name the
write and its address:

```
25FD0C: 33c000813092   move.w D0,$813092      <-- THE STAGE COUNTER
25FD12: d040           add.w  D0,D0
25FD14: 33c000813094   move.w D0,$813094      <-- stage * 2
25FD1A: d040           add.w  D0,D0
25FD1C: 33c000813096   move.w D0,$813096      <-- stage * 4, the table index
25FD22: 4e75           rts
```

Two callers total: `$28D69C` (type 6, state 2) and `$2606CE` (a `bsr` from the
`$260xxx` life machine - the fresh-game / continue path). `$813096` is the index
every per-stage table uses (`BGTAB.scriptPair $26153E`, `palette $261252`,
`colStream $261266`, `tileBase $240D62`, `elemTable $262302`).

**LINK 8 - `$25FD38` REBUILDS THE WORLD.**

```
25FD38: 61ea           bsr $25FD24            clear $8130CE..$8130F9 (22 words):
                                              the distance clock, $8130D2 (so the
                                              PAUSE $25FCFA set is lifted here),
                                              $8130DA, and BOTH boss flag bytes
25FD3A..25FD64: jsr $26331E $288E0C $289084 $289AE0 $28AC3A $289F3A $27E98A $28131E
25FD6A: move.w #$1,D0
25FD6E: jsr $241182                           create OBJECT TYPE 1 = THE BACKGROUND
25FD74: move.l D0,$813144
25FD7A: move.w #$0,($6,A0)                    <-- ENTRY CLOCK = 0
25FD80: rts
```

and type 1's init `$26114C` calls `$240B0E` at `$261174`, which resets the whole
two-camera block `$80B010..$80B056`. **Stage 2 starts with a zeroed camera, a
zeroed clock, and its own scroll program read through the new `$813096`.**

There is one more camera write worth naming, in `$28D9AA`'s own first phase:

```
28D9C2: 7000           moveq #$0,D0
28D9C4: 33c000813172   move.w D0,$813172     the CROSS-axis camera position
28D9CA: 33c000813176   move.w D0,$813176     its per-frame delta
```

That is the write that makes everything on screen stop side-to-side when the
result screen comes up. It is not a scroll release; it is the result screen
zeroing the axis it is about to draw over.

### 3.2 The chain in one line

```
$294AD8 HP<0 (or $294F32 timeout)
  -> $294DD4  D.start 6
  -> $293E04  32 frames  -> $2595E8  $812E06 := 1
  -> $25962E  returns C=1
  -> $292922  jsr $242952   D7 = $813092 + 1 ; create type 6 with ($4,A5)=D7
  -> $28D566  $25FCFA:  $8130D2 := 1  AND  kill the background object $813144
  -> $28D63C  states 0 -> $A -> 1, running $28D9AA (the result screen)
  -> $28DE16  $8130F9 bit 2 -> $285400 tally -> $285496 $8130F9 bit 1
  -> $28DE5C  state := $B   (or $15 if ($4,A5) == 5 -- THE ENDING)
  -> $28D674  state $B: clr.w $8130F8 -> state 2
  -> $28D69C  $25FD0C:  $813092/$813094/$813096 := the new stage
  -> $28D674  $25FD38:  wipe $8130CE..$8130F9, rebuild, NEW background, clock 0
  -> $28D658  $28E7E6 -> ($2,A5) := 2 -> type 6 destroys itself
  -> STAGE 2 SCROLLS
```

---

## 4. WHAT THE BOSS RECON'S OPEN ITEM WAS, AND WHY IT STAYED OPEN

The recon (§4.2, §9) checked the boss's 257-routine closure for the five doors
by exact address and found none - and that check was **correct**. The path out
does not go through a door. It goes through `$242952`, which the recon printed
in its own transcription of `$292902` and classified only as part of "the
enemy-free/mark-dying tail". The instruction it needed was on the page.

Two other of its statements I can now settle:

* **`$811F8C`** - the recon could not say who reads what `$253564` clamps.
  I re-measured: exactly **two** absolute-long references in build B, `$253568`
  and `$253572`, both inside `$253564` itself. Still unresolved by absolute-long
  search, and now known not to be on the stage-advance path - the advance runs
  off `$813092`, not `$811F8C`.
* **`$8130F8` bit 7** (`$294DD4 bset #7`): six setters, one per boss
  (`$294DE0 $29896E $29CAA2 $29FE96 $2A6DB8 $2A723A`), and **no `btst`/`bclr`
  of bit 7 anywhere in build B**. The only readers that could see it are the
  three `tst.b $8130F8` sites (`$276702`, `$276880`, `$28AD9C`), where bit 7 is
  the sign bit, and the four `tst.w` sites. `clr.w $8130F8` at `$28D616` and
  `$28D722` (type 6, states `$B` and an init arm) is what clears it. So bit 7 is
  **not** the stage-advance trigger; `$812E06` is.

---

## 5. Q5 - THE MINIMUM PORT, AND A FINDING THAT MAKES IT MUCH CHEAPER

### 5.1 **THE BOSS HAS A 10,800-FRAME HARD TIMEOUT AND IT ENDS THE STAGE**

`$2926EE lea $2927F6(pc),A0 / moveq #7,D0 / jsr $26377A` copies **8 words** into
`$16(a5)..$25(a5)` (`$26377A` is `loadRecordProto`, `dbra` so D0+1 words). Those
eight words, read out of the ROM this session:

```
$2927F6:  0001 6C00  0000 A000  0000 A000  2A30  0000
          $16(a5)=$00016C00  part-0 HP = 93,184
          $1A(a5)=$0000A000  part-1 HP = 40,960
          $1E(a5)=$0000A000  part-2 HP = 40,960
          $22(a5)=$2A30      = 10,800
          $24(a5)=$0000      the hit-stop counter
```

and `$294F32`, the fall-through the boss recon correctly flagged
(`$294DCC jmp $294F32(pc)`), is the consumer:

```
294F32: tst.w $8130D2 / bne rts          not while the death pause is up
294F3C: subq.w #$1,$22(a5) / bne rts     <-- once per logic frame
294F44: jsr $2428A6 / tst.w D0
294F4C: bne $294F5A
294F50:   move.w #$78,$22(a5) / rts      no live player -> re-floor to 120
294F5A: move.w #$0,$EA(a6)
294F60: jmp $294DD4(pc)                  <-- THE BOSS DIES
```

`$2428A6` returns `$10` if P1 is live, `+$8` if P2 is - i.e. non-zero iff at
least one player is alive.

> **STAGE 1 ENDS BY ITSELF.** 10,800 logic frames (`$2A30`) after the boss
> record is created, with a live player and no pause, the boss dies on the
> timeout, `$294DD4` runs, and the whole chain in §3.2 fires. **A port does not
> need the boss to be shootable for stage 1 to end.**

### 5.2 The minimum, measured

`walk.py` (scratch; per routine, closure over its own intra-routine branches,
`jsr`/`bsr`/far-`bcc`/tail-`jmp` are CALLS; `jsr (An)` invisible, so a LOWER
BOUND). Roots `$242952` + `$28D63C`:

```
WHOLE STAGE-END CLOSURE   190 routines   4,340 instructions   24,216 bytes
   cited anywhere in src/:  44  (5,224 B)
   NOT cited             : 146  (18,992 B)
```

Split into the three things a wave could buy separately:

| tier | routines | insn | what |
|---|---|---|---|
| **CORE - the machinery** | 17 | **284** | `$242952 $28D63C $28D566 $28D5E6 $25FCFA $25FD0C $25FD24 $25FD38 $241238 $241262 $2411E2 $241292 $28ECCE $28E7E6 $28E7C0 $28E7DC $28E7A2` - the state machine, the destroy, the stage write and the rebuild |
| **BOSS-SIDE TRIGGER** | 4 | ~**40** | `$292902` (10) + `$294F32` (13) + `$294DD4`'s `D.start 6` arm + `$25962E`'s first four instructions (the `$812E06` C=1 arm) and `$2595E8` (2) |
| **PRESENTATION - the result screen** | ~40 | **1,319** | `$28D9AA` (447) `$28DED8` (155) `$28E1AC` (351) `$28E7F8` (242) `$285400` (103) `$28556C` (21) - and `$8130F9` bit 1 comes **only** from `$285496`, inside it |

The subsystem resets `$25FD38` calls (`$26331E $288E0C $289084 $289AE0 $28AC3A
$289F3A $27E98A $28131E`) are eight more routines; several are the same
`$288xxx`/`$289xxx` cluster W36 already defers.

### 5.3 The cheapest path that makes stage 1 END

**CORE + BOSS-SIDE TRIGGER = ~324 instructions**, and it is enough to make the
port's stage 1 finish and stage 2 start scrolling - *if* the `$8130F9` bit-1
handshake is satisfied. It has exactly one producer, `$285496`, and reaching it
faithfully costs the 1,319-instruction presentation tier.

So there are two honest options and they must be labelled differently:

1. **FAITHFUL (~1,650 instructions + the eight resets).** CORE + TRIGGER +
   PRESENTATION. Stage 1 ends the way the board ends it, with the result screen
   and the score tally.
2. **DEVIATION (~324 instructions).** CORE + TRIGGER, with `$28D9AA` and
   `$285400` as loud named `unportedLog` entries and a **documented, cited**
   short-circuit that sets `$8130F9` bit 1. This is a deviation of the same
   class as the Batman water dither: it must say in the source that it is one,
   name `$285496` as the instruction it is standing in for, and be pinned by a
   test that fails the moment `$285496` gets ported for real. **It must not be
   described as "the stage ends" without that caveat** - what ends is the
   camera's stage, not the game's.

Either way the boss body (the boss recon's waves A/B/C, 4,065 boss-local
instructions) is **NOT on the critical path for the stage ending.** That is the
headline for planning: `$294F32`'s timeout means the port can have a stage that
completes long before it has a boss that fights.

---

## 6. WHAT THE PORT HAS TODAY (snapshot; the tree may be mid-edit)

Of the 190 routines in the stage-end closure, 44 are named somewhere in
`games/ddpdoj/src/**/*.js` - and that test **overstates** the ported side,
because a `note()` or a `throw` counts. The 44:

```
$23BE8C $23C008 $23C194 $23C1A2 $23C212 $23C5C8 $23C5F2 $23C608 $23D12A
$23D186 $23D18E $23D2AE $23D726 $23DECE $23DF2A $240ADC $240B0E $240CB0
$240CB8 $240DC2 $240F08 $2410BC $2410F2 $24110A $24111E $241182 $2411E2
$241238 $241262 $24150A $241812 $242952 $246410 $24683E $246D04 $256D5A
$25FD82 $263386 $28131E $286128 $286626 $28BBAC $28C02A $28C186
```

Notably: the object allocator/killer (`$241182`, `$2411E2`, `$241238`,
`$241262`) is already there, and `$242952` appears - as a *comment* in
`src/handlers.js:1516` listing it after `$243DD0` and `$25962E`, i.e. the port
already knows the boss handler's shape and has not followed it either. **None of
`$28D63C`, `$28D566`, `$25FCFA`, `$25FD0C`, `$25FD24`, `$25FD38` is cited
anywhere in `src/`.** `src/background.js:745` correctly describes the lock and
correctly says the port HOLDS there.

---

## 7. IMPLEMENTER-READY WORK LIST

1. **`$242952` first.** 25 instructions, and it is the whole hinge. Model the
   `bset #3` / `bclr #4` on `$8130F8` (the second one disarms the boss's
   double-pass at `$25965A`) and the `bset #5` on both player records.
   **`$2429BE addq.w #1,D7` is the stage advance; `$25FD0C` is where it lands.**
2. **Model type 6 as a real object at `$240F62[6]`**, created through the port's
   existing `$241182`, with `($4,A5)` = the stage. Its states are bytes at
   `($2,A5)` and `($6,A5)` and `($7,A5)`; do not turn them into a JS enum that
   loses the byte offsets - `$28D9AA` and `$28DE2A` read `($6,A5)` and
   `($4,A5)` directly.
3. **`$25FCFA` destroys the background through `$241238`, not `$2411E2`.** It is
   a *deferred* kill: the handle at `$813144` goes on the `$80DBFE` list and is
   drained later by `$241262`. A port that kills it synchronously will run one
   fewer background frame than the board.
4. **`$25FD24` clears 22 words, `$8130CE..$8130F9` inclusive.** That single
   `dbra` lifts the `$8130D2` pause `$25FCFA` set, resets the distance clock and
   wipes both boss flag bytes. Do not hand-list the fields; transcribe the loop.
5. **`$25FD38`'s new object gets `($6,A0) := 0`** (`$25FD7A`). The port already
   models the entry clock (`src/background.js` `fastForward`); stage 2 must
   enter at clock 0, not at `$0038`.
6. **The boss timeout is `$22(a5) = $2A30` from `$2927F6`**, decremented at
   `$294F3C` and gated on `$8130D2`. Transcribe the `$2428A6` arm too - with no
   live player the timer re-floors to `$78` and the boss cannot die, which is a
   behaviour and not an edge case.
7. **`$8130F9` bit 1 has exactly one producer.** If a wave stubs the result
   screen, the stub must name `$285496` and must be pinned by a test that goes
   red when the real producer lands.
8. **`$28D9AA`'s first phase zeroes `$813172`/`$813176`** (`$28D9C4`/`$28D9CA`).
   Anything in the port that scroll-compensates off `$813176` will see a step
   there; that is correct, not a bug.
9. **Do not write "unfreeze" anywhere in this port.** Nothing unfreezes. The
   correct verb is *destroy and rebuild*, and the correct comment on
   `src/background.js:745` is that the lock ends when `$25FCFA` kills the
   object, not when a door opens.

---

## 8. WAVE ESTIMATE - making stage 1 END

**TWO waves, and neither of them is the boss.**

| wave | scope | insn | why its own wave |
|---|---|---|---|
| **A - THE STAGE MACHINE** | `$242952`, object type 6 (`$28D63C` + `$28D566` + `$28D5E6`), `$25FCFA`, `$25FD0C`, `$25FD24`, `$25FD38` and its eight resets, the `$8130F9` bit-1/bit-2 handshake modelled as data, plus the boss-side trigger (`$292902`'s ten instructions, `$294F32`'s timeout arm, `$294DD4`'s `D.start 6` reduced to its `$2595E8` effect with a loud note, and `$25962E`'s `$812E06` arm) | **~324** | It is testable without one line of boss content: drive `$812E06 := 1` and assert that `$813092` increments, the old background object is on the kill list, and a new one exists at `$813144` with entry clock 0. It is also **shared by all five stages** - the same `$242952`, the same type 6, the same `$25FD0C`. |
| **B - THE RESULT SCREEN** | `$28D9AA` (447), `$28DED8` (155), `$28E1AC` (351), `$28E7F8` (242), the HUD tally `$285400..$285568` (103) + `$28556C` (21), and the animation-object pair `$24652A`/`$246800`/`$24681A`/`$246410` | **~1,400** | It is presentation and score, it is where `$8130F9` bit 1 really comes from, and it is the only thing standing between wave A and a faithful ending. Until it lands, wave A carries a declared deviation. |

**Wave A alone makes stage 1 end.** Wave B makes it end *correctly*.

For scale, measured this session against the boss recon's own CITED figures: the
boss body is 4,065 boss-local instructions; wave A is **324**, eight per cent of
it. **The cheapest route to "stage 1 is feature complete" does not go through
the boss at all.**

What must NOT be attempted in the same wave: anything in the `$28E1AC`/`$28E7F8`
text and banner machinery beyond what state 4's `$81DFF6` gate needs, and the
`($4,A5) == 5` ending arm (`$28DE44`, `$28D8C4`, `$241182` type `$13`) - that is
the game's ending and belongs after stage 5 exists.

---

## 9. WHAT I COULD NOT DETERMINE

* **`$28ECCE`'s exit condition.** It gates state 0 → `$A` and I read its first
  forty instructions (a `$81E024` state machine driving `$24150A` loads off the
  `$28EE1E` table). I did **not** walk it to the instruction that clears the
  carry, so I cannot say how many frames state 0 lasts.
* **`$28D9AA`'s internal phase count.** I have its size (447 instructions), its
  entry, its `$813172`/`$813176` zeroing, its two `$8130F9` writes and its tail.
  I did **not** enumerate its phases, and a wave that ports it is reading a
  routine I have only counted. Same for `$28E1AC` (351) and `$28E7F8` (242).
* **Whether the `$285400` tally can complete with a zero score.** `$28556C`
  returns C=1 immediately when `$81B610` is already 0, which branches to
  `$2854C8` (`$81B610 := $FFFF`) rather than to `$285496`. I traced the
  arithmetic but did **not** determine which arm a real zero-item clear takes,
  so I cannot say whether the tally is skippable.
* **`$2853D2`.** It sets `$8130F9` bit 4 off bit 3, and it has **no reference of
  any kind** - no absolute long, no `bsr` of any width, no `(d16,PC)`, no
  longword anywhere in the whole 6 MB image. It is reached through a register I
  cannot see. What I tried is exactly that list.
* **`$811F8C`.** Two absolute-long references in build B, both inside `$253564`.
  Who reads it is still open; it is not on the stage-advance path.
* **No board comparison.** Every number here is ROM-listing or my own
  simulation of the listing. The corpus on disk has never run past the stage-1
  boss's arrival, so **nothing in this document has been checked against the
  cartridge**, including the 10,800-frame timeout and the whole §3.2 chain.
  The first wave that ports this should record a scenario that reaches the
  timeout and compare `$813092`, `$8130CE` and `$813144` across the transition.
* **The `$2429C4` variant** of the stage-advance entry (`jsr $242A40(pc)` then
  the same tail **without** the `addq.w #1,D7`), whose one caller is `$259DDA`.
  I did not read it; it is 12 instructions and it is a second producer of type 6
  objects that a port must classify before claiming "five callers, five stages"
  covers everything.
