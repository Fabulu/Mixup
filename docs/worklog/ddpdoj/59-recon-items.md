# 59 - RECON: ITEM DROPS AND POWER-UPS

status: **DONE** - see the WAVE ESTIMATE (§10) and the work list (§11).

started / finished: 2026-08-05
role: RECON (read-only). This file is the only thing I write or commit.
`games/ddpdoj/tools/` belongs to E3 this wave - read freely, write nothing.
`games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Build B = `$23xxxx..$2Axxxx`.
**Every address below is build B.** Where an absolute-operand census returns
`$1xxxxx` hits those are build A's copy of the same code and are named as such.

**THE OWNER, PLAYING THE LIVE BUILD:** *"There's some bigger ships that show up
now and they're supposed drop powerups, which they don't. And I'm sure the
powerups don't work yet."* - and, mid-recon: *"laser and shots will likely also
need new updated sprites for powerups."*

instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` - the decrypted build-B
image, **address == file offset**, 6,291,456 B (gitignored, `derive.py`).
Disassembly and absolute cross-references: `games/ddpdoj/tools/oracle/xref.py`
(**absolute-long operands only** → every caller count from it is a LOWER BOUND;
a clean result is "no absolute-long site", never "nothing does this"). I added a
scratch scanner in the session scratchpad that also sees **`bsr.b`/`bsr.w`/
`bra.b`/`bra.w`/`jsr (d16,PC)`/`jmp (d16,PC)`/`lea (d16,PC)`** over
`$230000..$2B0000`; where both were run the line says so. Neither can see
`jsr (An)` through a pointer.

`[M]` = measured by me this session. Anything from another document says so and
names it. **No MAME was run. Nothing here is compared against the board.**

---

## 0. THE HEADLINE

**The brief's premise is RIGHT: items are an entirely unported subsystem, not a
defect in a ported one.** [M] Not one line of item logic exists under
`games/ddpdoj/src/`. What exists is **two counted notes and one type-5 call
listed but not made** - §7.

**And the owner is right about both halves, with a precision worth stating:**

* **The drop the owner is missing is 26 bytes above an explosion the port
  already ports.** [M] `$275B06 jsr $27E812` and `$275B1A jsr $27E812` sit
  inside `handler85`'s death arm, immediately before `$275B20 moveq #$5,D0 /
  jsr $289004` - which W54 ported. The port runs the explosion and skips the
  drop, in the same twelve instructions. Types **`$85` and `$86`**.
* **"the powerups don't work yet"** - the whole chain is absent: the six pools,
  the allocator family, the driver (**type-5 call #18, `$28B64C`**), the six
  item bodies, the ten collect routines, the collision block, and the art.

**FOUR CORRECTIONS the plan needs:**

| the record says | [M] this session |
|---|---|
| `src/handlers.js:70` and `:1562`: "`$27F92A`/`$27E812` (the `$816B7A` pool family)" | **`$27F92A` is NOT the item family.** `$27F936 lea $817DC6,A0 / moveq #$9,D7` - it is the IMPACT pool A's reserved-10 allocator, exactly as `50-recon-effects` §1.1 says [CITED]. Two notes in `handlers.js` file it under the wrong pool. `$27E812` IS the item family. |
| the coordinator's mid-recon note: "recon 38 measured rank = base + clock + 16·max(power1,power2), **so power level feeds RANK directly**" | **NO. The shot power word is `$810406`/`$810408`; the rank power word is `$81B646`. They are different words and nothing writes one from the other.** [M] `$81B646`'s complete build-B census is 13 sites and **not one is an item collection** (§5). Items reach rank by a longer, *worse* route - §5.2 - and the safety-critical statement is different from the one the note assumes. |
| the coordinator's: "collecting a power-up likely changes what the shot and the laser LOOK LIKE … how many streams per level" | **[M] I read all four readers of the power cursor and in every one the word it points at is a `dbra` COUNT, never an art index.** Shot and laser art is selected by SHIP (`$810440` / `($58,A4)`) and WEAPON (`$81043E`), neither of which a power-up writes. **A power-up buys more simultaneous shot slots, drawn from the same streams** (§4.4). Stated with its limit in §4.4. |
| `50-recon-effects` enumerated FIVE pools; `54-impl-E5b` reproduced them | **There is a SIXTH family, and it is bigger than any of them by slot count in RAM terms: six ITEM pools, `$816B7A..$8171B9`, 25 slots of `$40`, closing EXACTLY on `$8171BA`, whose next word but one is `$8171BE` - pool A's base.** No document in this repo names it. §1. |

---

## 1. THE ITEM POOLS - SIX, and they sit directly below the impact pool

[M] Every base, stride, slot count and count word read out of an instruction
this session, and **the geometry closes exactly.**

| D0 | pool base | stride | `dbra` D2 | **slots** | body | what it is (§3) |
|---:|---|---:|---:|---:|---|---|
| `$00` | `$816B7A` | `$40` | 7 | **8** | `$27EA2A` | **POWER-UP** (+1 shot level, +1 laser level) |
| `$04` | `$816D7A` | `$40` | 1 | **2** | `$27EBDC` | **FULL POWER** (both to max) |
| `$08` | `$816DFA` | `$40` | 1 | **2** | `$27ED8C` | the `$81040A`/`$81040B` counter item |
| `$0C` | `$816E7A` | `$40` | 5 | **6** | `$27EF50` | **P1 HYPER STOCK** (`$2530BE`) |
| `$14` | `$816FFA` | `$40` | 5 | **6** | `$27F254` | **P2 HYPER STOCK** (`$2530E6`) |
| *any other* (`$10` in practice) | `$81717A` | `$40` | 0 | **1** | `$27F1A6` | the `$8130BE` counter item, cap 20 |

```
[M] $816B7A + 8*$40 == $816D7A     EXACT
[M] $816D7A + 2*$40 == $816DFA     EXACT
[M] $816DFA + 2*$40 == $816E7A     EXACT
[M] $816E7A + 6*$40 == $816FFA     EXACT
[M] $816FFA + 6*$40 == $81717A     EXACT
[M] $81717A + 1*$40 == $8171BA  == THE LIVE COUNT WORD          EXACT
[M] $8171BA - $816B7A == $640 == 1,600 == 25 x $40              EXACT
[M] $27E98A, the whole-family CLEAR: `move.w #$321,D0` + a `(A0)+`
    dbra loop = $322 words = 1,604 B = 25 slots + $8171BA + $8171BC.  EXACT
[M] $8171BE is IMPACT POOL A's base (50-recon 1.1 [CITED]) -- so the item
    family and the five effect pools are ONE contiguous 25 + 240 slot region.
```

**The `$81717A` catch-all is a REAL POOL, not a bit bucket.** Unlike pool B's
`$81C8B2` (`54-impl` §0.1 [CITED]), a record written there is walked by the
driver and collected normally. Note that `D0 = $10` - the only value any caller
actually passes into it, `$27B4A0` - reaches it through the *else* arm, so
**a wrong D0 silently changes the item's pool AND its kind**.

### 1.1 THE THREE ALLOCATORS - near-identical, and they are not interchangeable [M]

| entry | bytes | what | tail |
|---|---:|---|---|
| **`$27E812`** | 118 | allocate ONE | `$27E878 beq.w $27F6AE` - the **32-byte** fill |
| **`$27E88A`** | 136 | allocate **D1+1** in a loop, pushing/popping D1 | `$27E8F4 bsr.w $27F6AE` |
| **`$27E912`** | 118 | allocate ONE | `$27E978 beq.w $27F6E4` - a **DIFFERENT, shorter** fill that takes D6 |

**[M] `$27E88A` HAS NO CALLER**, absolute-long or PC-relative, in
`$230000..$2B0000`. Recorded as transcribed-and-unreachable rather than
"unused"; the scan cannot see `jsr (An)`.

**[M] `$27E812` has NINE call sites and `$27E912` has FOUR** - §2. Both scans
(absolute + PC-relative) were run for both; **zero PC-relative sites**, so the
nine and the four are not lower bounds by the usual margin.

### 1.2 THE RECORD, `$40` bytes - the fill and the template table [M]

`$27F6AE` (the fill used by the drop path), read in full:

```
$27F6B2  D1 = D0 | $8000                     <- THE STATUS WORD
$27F6B8  lea ($27F746,PC),A2 / movea.l (A2,D0.w),A2    <- D0 as a BYTE offset
$27F6C2  (A0)+ = D1                          +$00  STATUS
$27F6C4  (A0)+ = ($2,A6) LONG                +$02  POSITION, from the DYING object
$27F6C8  (A0)+ = (A2)+ x6 longs, then a word +$06..+$1F  from the ROM TEMPLATE
$27F6DC  addq.w #1,$8171BA                   <- THE LIVE COUNT
```

**[M] `$27F746` is an 8-ENTRY pointer table and only SIX of its targets are
templates:**

```
[0]$00 -> $27F766   [1]$04 -> $27F780   [2]$08 -> $27F79A
[3]$0C -> $27F7B4   [4]$10 -> $27F7CE   [5]$14 -> $27F7B4  (ALIASES [3])
[6]$18 -> $27F7E8   [7]$1C -> $27F7E8   <- ONE PAST THE LAST TEMPLATE
[M] $27F7E8 = 4E75 204E 4A50 6AF8 ... = `rts / movea.l A6,A0 / tst.w (A0) /
    bpl` -- IT IS CODE.  D0 = $18 or $1C copies 26 bytes of CODE into a record.
[M] template stride 26 B, six of them, $27F766..$27F7E7 -- five spacings all
    exactly 26.                                                    EXACT
```

Same shape as `$288FF0`'s entry [5] and `$27F99E`'s entries 20..31 [both CITED
`50-recon` §1.3/§1.5]. **Range-check D0 to {0,4,8,$C,$10,$14} and throw.**

The six templates, as words (they fill `+$06..+$1F`):

```
[M] $27F766 (D0=$00)  FC00 FD00 0000 0000 0418 0600 0600 0500 0500 0000 0000 0000 0000
[M] $27F780 (D0=$04)  FC00 FC00 0000 0000 0420 0600 0600 0700 0700 0000 0000 0000 0000
[M] $27F79A (D0=$08)  FC00 FD00 0000 0000 0418 0600 0600 0500 0500 0000 0000 0000 0000
[M] $27F7B4 (D0=$0C,  FC00 FD00 0000 0000 0000 0600 0600 0500 0500 0000 0000 0000 0000
             D0=$14)
[M] $27F7CE (D0=$10)  FC00 FC00 0000 0000 0420 0600 0600 0500 0500 0000 0000 0000 0000
```

Field map, every offset read out of an instruction [M]:

| off | what |
|---|---|
| `+$00` | **STATUS.** bit15 allocated; **low bits 2..5 = THE KIND** (`moveq #$3C,D0 / and.w D1,D0`); bit 13 (`bset #5,(A6)`) = the body has initialised; **bit 12 = P1 IS TOUCHING IT, bit 11 = P2** (§4); bit 0 = collected-normally; bit 7 = collected-at-max. `move.l D0,(A6)` with D0=0 = FREE. |
| `+$02`/`+$04` | position, X then Y, copied from the dying object's `($2,A6)` |
| `+$06`..`+$09` | the draw-offset pair (`$FC00FD00` / `$FC00FC00`) |
| `+$0A` | the collected-animation cursor (`$27F54C` writes A0 here) |
| `+$0C`/`+$0D` | animation frame countdown / its reload (`#$202` = 2/2) |
| `+$0E` | animation cursor, `addq.w #4` masked `$F` (4 frames) or `$3F` (16) |
| `+$10`/`+$12` | **THE COLLISION HALF-EXTENTS** - `$0600` × `$0600` for every kind [M] |
| `+$18` | lifetime/drift timer (`$27EACE move.l #$7000B00,($18,A6)`) |
| `+$1A` | speed byte; `+$1B` angle byte |
| `+$1E`/`+$1F` | a sub-tick and its reload (kind `$08`'s homing) |

### 1.3 THE DRIVER `$27E99E` - type-5 call #18 [M]

`$27E99E..$27E9F7`, **90 B**. [M] Its **only** absolute-long caller is
`$28B64C`, i.e. type 5 `$28B5E0` and nothing else - and `src/type5.js`'s own
`calls` array already lists `0x27e99e` at index 17 (**call #18**), unported.

```
$27E99E  D7 = $8171BA ; beq rts          <- LIVE-COUNT driven, not a full walk
$27E9A8  A6 = $816B7A                    <- walks all 25 slots as ONE array
$27E9B4  D1 = (A6) ; beq -> next         <- free test is +$00
$27E9B8  ($4,A6) -= $813176              <- THE SCROLL, same word pool B uses
$27E9C2  btst #7,($1,A6) -> $27E9D6      <- collected-at-max
$27E9CC  btst #0,($1,A6) -> fall through <- collected-normally
$27E9D6  bsr $27F5F4                     <- THE COLLECTED ANIMATION
$27E9DE  moveq #$3C,D0 / and.w D1,D0
         lea ($27E9F8,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
```

**[M] `$27E9F8` is an 8-ENTRY PC-relative table and entry [8] is CODE:**

```
[0]$00 $27EA2A  [1]$04 $27EBDC  [2]$08 $27ED8C  [3]$0C $27EF50
[4]$10 $27F1A6  [5]$14 $27F254  [6]$18 $27F2F0  [7]$1C $27EA18
[M] the longword at $27EA18 is `4E75 001B` -- $27EA18 IS the `rts`, so entry
    [7] is a deliberate NO-OP; entry [6] is THE FREE ($27F2F0).
[M] the mask is $3C -- 4 bits, 16 indices -- and the table has 8.  Indices
    8..15 would `jsr` into the sprite-address table at $27EA1A.
```

So: **six kinds, one free, one no-op - and eight of sixteen reachable indices
land in data.** Range-check and throw, exactly as `50-recon` §1.3 requires for
`$288FF0`.

`$27F2F0`, THE FREE, **14 B**: `moveq #0,D0 / move.l D0,(A6) / subq.w #1,$8171BA
/ ori #$1,SR / rts`. **It clears a LONGWORD** - `+$00` and `+$02` - which is
what lets the collision block test `+$02` for emptiness while the driver tests
`+$00` (§4). [M] **eleven `bcc.w`/`bra.w` sites reach it**, one per body's
off-screen test plus both collected-animation ends.

---

## 2. WHAT DROPS - nine sites, and only ONE pair is reachable in stage 1

[M] `xref.py callers 27E812` **plus** the PC-relative scan:
**9 absolute-long sites, 0 PC-relative.**

| site | D0 | who | reachable in the port's stage 1? |
|---|---|---|---|
| **`$275B06`** | `$0` or `$8` | **`handler85`'s death arm - types `$85` AND `$86`** | **YES - and the port already runs 26 bytes further down** |
| **`$275B1A`** | `$0` | the same arm's SECOND drop | **YES** |
| `$24A10E` | `$4` or `$0`, ×D7+1 | the PLAYER's own death (`$24A0E0`) | only when the player dies |
| `$267CAC` | `$0`/`$4`/`$8`/`$C`/`$10` | behind `$23D18E` bit 6 and `$259C42` | **unattributed - §9.1** |
| `$27B4A0` | `$10` | a `$27Bxxx` body, behind `($2E,A5)` borrowing | **unattributed - §9.1** |
| `$294C5E` | `$C` or `$14` | **the stage-1 BOSS**, forked on `btst #4,D1` (which player killed it) | no - W48: 0 of 111 boss script entry points ported [CITED] |
| `$294C7E` | `$C`/`$14` | the same, the OTHER player, behind `($114,A6)` | no |
| `$294D42`, `$294D62` | - | the same bank | no |

### 2.1 THE DROP THE OWNER IS MISSING, instruction by instruction [M]

```
$275AF2  moveq #$25,D0 / jsr $28615E      <- THE KILL SCORE.  ** PORTED (W34) **
$275AFA  moveq #$0,D0
$275AFC  cmpi.b #$86,($C,A5)              <- ($C,A5) is THE TYPE BYTE
$275B02  bne $275B06
$275B04  moveq #$8,D0                     <- type $86 drops KIND $8
$275B06  jsr $27E812                      <- ** DROP #1.  A NOTE IN THE PORT **
$275B0C  tst.w $81308C / bne $275B20      <- the two-player gate
$275B14  cmpi.w #$8,D0 / beq $275B20
$275B1A  jsr $27E812                      <- ** DROP #2.  A NOTE IN THE PORT **
$275B20  moveq #$5,D0 / jsr $289004       <- the explosion.  ** PORTED (W54) **
```

**So: type `$85` drops kind `$0` (the POWER-UP) - TWICE when `$81308C == 0`, and
ONCE otherwise. Type `$86` drops kind `$8` - always exactly once.**

**IT IS NOT RANDOM AND THERE IS NO RNG IN IT.** [M] No `$242B3C`/`$242E24`/
`$803916`/`$803917` appears anywhere in `$275AF2..$275B20`. **The drop is
GUARANTEED, and the only conditions are the enemy's own type byte and
`$81308C`.** (`$81308C` is the same word `src/shots.js` records as *"a FROZEN
global … the fly-around run prints `$81308C = $0001`"* [CITED] - so **on the
port's own measured state the second drop does NOT happen** and type `$85` gives
one power-up, not two. That is a live semantic an implementer will get wrong if
they read the listing without reading `shots.js`.)

**[M] The enemy type table is at `$27E016`, stride 8, `[step, init]`:**

```
[M] $27E016 + 8*$85 == $27E43E -> step $275914  init $275BAE     EXACT
[M] $27E016 + 8*$86 == $27E446 -> step $275914  init $275C32     EXACT
```
i.e. **`$275914` is the step handler for BOTH `$85` and `$86`**, which
`src/handlers.js`'s `handler85` already says from the other side [CITED
`handlers.js:960`: *"`$275BAE` is type `$86`'s init stub"*]. I found the table
independently by searching the image for the longword `$00275914`; it has
exactly two occurrences in build B, and they are 8 apart.

**I did NOT verify that types `$85`/`$86` are the owner's "bigger ships"** -
that is a picture question and nothing here was run. What is measured is that
they are **the only enemy types in the whole type table whose handler drops an
item**, and that their handler is ported and their drop is not.

### 2.2 The `$27E912` family - hyper items only [M]

All four callers are inside the item/stock machine `38-recon` §2.4 named
[CITED], and all four spawn a HYPER item:

```
[M] $2875FC  D0=$C, in a `dbra D7` loop with D6 += $800 per iteration
             ($2875B4, P1's pending-grant flush)
[M] $28765E  D0=$14 (the P2 mirror, $287616)
[M] $28770C  D0=$C   ($287702, i.e. $287682's spawn arm)
[M] $2877AC  D0=$14  ($2877A2, the P2 mirror)
```

**[M] `$2530BE` reproduces `38-recon` §2.2 exactly**: `tst.w $81B65C / bne` →
`bsr $252904` on the 0→1 edge only → `addq.w #1,$81B65C` → `move.w #$95F,$81B642`
→ `bsr $25349A` → `jmp $286ED6`. **Uncapped at the increment**, as recon 38 says.

---

## 3. THE SIX ITEM KINDS - enumerated from the ROM

Each body has the same five-part shape [M]: an init behind `btst #$D,D1`, the
`andi.w #$1800,D1` COLLECTION test, a motion `bsr`, the animation advance, and a
`jmp $23EB06` emit.

### KIND `$00` - **THE POWER-UP.** `$27EA2A`, collect `$252C96` (P1) / `$252D24` (P2)

```
[M] $252C96  D0 = $810406 + $810408
             cmpi.w #$10,D0 / beq $252D1E   <- BOTH AT MAX ($8+$8) -> REFUSE
             $252D1E moveq #0,D0 / subq.w #1,D0 / rts   <- returns CARRY SET
             if $810408 != 8:  $810408 += 2 ; bsr $25270C ; clr.w $8104FA
             if $810406 != 8:  $810406 += 2 ; ...and then the CURSOR ADVANCE:
               D0 = (($810440 - 2)*2 + $81043E) * 4
               A1 = ($4,$25520C,D0) ; D1 = ($8,A1)      <- the LASER list's word[4]
               A0 = (  $25520C,D0)  ; D0 = ($8,A0)      <- the SHOT  list's word[4]
               A1 = $8127E4 ; if (long at $8127E4)^ != D0 then $8127E4 += 2
               A2 = $8127E8 ; if (long at $8127E8)^ != D1 then $8127E8 += 2
[M] $252D24 is the P2 mirror: $810468/$81046A, $8104A0/$8104A2, $8127EC/$8127F0.
```

**So ONE power-up writes SIX words: `$810406 += 2`, `$810408 += 2`,
`$8127E4 += 2`, `$8127E8 += 2`, `$8104FA := 0`, and whatever `$25270C` rebuilds.**

### KIND `$04` - **FULL POWER.** `$27EBDC`, collect `$252DAC` / `$252E26`

[M] Same refusal test, then **assignment rather than increment**:
`$810408 := 8`, `$810406 := 8`, and the two cursors are written outright -
`(long at $8127E4) := $25520C[n]` and `($4,$8127E4) := $25520C[n+1]`, **each then
`addq.l #8`** (`$252E16`/`$252E18`), i.e. straight to word[4] of a five-word list.

### KIND `$08` - the `$81040A`/`$81040B` counter. `$27ED8C`, collect `$252E9A` / `$252FAC`

```
[M] $252E9A  D6 = $81040A ; cmp.b $81040B,D6 ; beq $252F34   <- ALREADY AT TARGET
             D5 = D6 + 1 ; $81040A := D5
             if D5 == $81040B:                                <- THE SET COMPLETES
               bclr #6,$8103E6 ; bset #1,$8103E7              <- PLAYER STATE
               if $8128FE != $63:  $8128F4 += $4D ; $8128FE += 1
               three $242AC6 BCD conversions -> $8128F6, $8128FA, $812900
               jsr ($25349A,PC)                               <- the HUD
             else: if $81B65C == 0: jsr ($2533C8,PC)          <- a cue
[M] $252F34 (the already-complete arm) awards $4D again, and a SECOND $4D if
    BOTH $8103E6 bit 6 was clear AND $8103E7 bit 1 was clear.
```

**`$81040B` is a TARGET the item counts toward and I did not find its writer**
(§9.2). Its only build-B sites are `$252EA2`, `$252EB6` (these reads) and
`$2534A6` (the HUD). This kind's own DROP is type `$86`'s.

### KIND `$0C` - **P1 HYPER STOCK.** `$27EF50`, collect `$2530BE`

```
[M] $27EF78  tst.w $81DF22 / bne -> FREE                      <- a global suppressor
[M] $27EF82  tst.w $81B63E / bne -> $27EF8A                   <- ALREADY HYPERING
[M] $27EF9C  D0 = $81B65C ; cmpi.w #$5,D0 / beq -> $27EF8A    <- STOCK ALREADY 5
[M] $27EF8A  moveq #$1C,D0 / moveq #$5,D2 / jsr $27F8EE / bra $27F2F0
             ^ it spawns an IMPACT-POOL record and FREES ITSELF -- the refused
               hyper item does NOT go through $27F582's score path
[M] $27EFCA  btst #$C,D1 -> jsr $2530BE / bcs $27F582 ; jsr $28C65E ;
             lea ($27F400,PC),A0 ; bra $27F54C
```

### KIND `$14` - **P2 HYPER STOCK.** `$27F254`, collect `$2530E6`

[M] Byte-for-byte the P1 body against `$81B640`, `$81B65E`, `$2530E6`, and it
shares P1's motion/animation tail by `beq $27EFEC`. **The collection bit is
`btst #$B,D1` here, not `#$C`.**

### KIND `$10` - the `$8130BE` counter, cap 20. `$27F1A6`, collect `$25310E` / `$253126`

```
[M] $25310E  cmpi.w #$14,$8130BE / beq rts    <- capped at 20, REFUSES (no carry)
             addq.w #1,$8130BE
             jsr $2878CC                      <- a HUD draw that reads $8130BE
                                                 and lays out up to 5 icons a row
[M] $253126 is the P2 mirror on $8130C0.
[M] its body is the only one that calls a SOUND before the collect
    ($27F1CA jsr $28C678) and the only one whose motion is horizontal
    ($27F23E jsr $2417B6 / add.w D2,($2,A6)).
```

**Note the asymmetry an implementer will get wrong:** kinds `$0`, `$4`, `$8`
return **carry** on refusal and the driver routes to `$27F582`; kind `$10`'s
`$25310E` returns with carry CLEAR at the cap, and its body **never tests carry
at all** (`$27F1E8 lea ($27F300,PC),A0 / bra $27F54C` unconditionally). So a
21st `$10` item is collected normally, scores `$10`, and grants nothing.

---

## 4. COLLECTION - the block `$244D62` that W34 noted away

### 4.1 The detection is `$244D94..$244DFE`, `$244D62`'s SECOND block [M]

```
$244D9C  D6 = $8171BA ; beq -> block 3        <- THE ITEM LIVE COUNT
$244DA8  A6 = $816B7C                          <- base + 2, walked at stride $40
$244DB4  D4 = (A6)+ ; beq -> next              <- the FREE test is on +$02 (X)
$244DB8..$244DE0   an AABB against D0..D3 with the $2800 bias, using
                   ($C,A6) = +$10 and ($E,A6) = +$12, the HALF-EXTENTS
$244DE2  D4 = (-$4,A6)          <- +$00, THE STATUS
$244DE6  andi.w #$C0,D4 / bne -> next          <- already collected -> skip
$244DEC  D4 = $80FA72                          <- THE CALLER'S D0
$244DF2  or.w D4,(-$4,A6)                      <- ** THE COLLECTION FLAG **
```

**So collection is one `or.w` of the caller's own player mask into the item's
status word, and `$1800` in §3's `andi.w #$1800,D1` is that mask.** `$80FA72` is
written at `$244D62` itself from D0 - **and `src/damage.js` already ports that
write** (`ram.setU16(DMG.fa72, mask)`). The port therefore already has the mask;
it has no pool to OR it into.

**[M] `src/damage.js` names this block precisely and defers it on purpose:**
its own table calls it *"| 2 | `$244D94..$244DFE` | `$816B7C` x `$8171BA` | NOTE"*
and the note says *"the port cannot run blocks 2-4 without block 1's box, so all
four defer together"*. **That is right and it is the gating dependency for this
whole wave: `$2459D0`, the player's own bounding box, is unported (ledger row
L16).** Items cannot be collected until `$2459D0` ships.

### 4.2 `andi.w #$C0` and the two collected flags - an inconsistency, named [M]

`$27F54C` (collected NORMALLY) does `move.b #$80,(A6)` then `bset #0,($1,A6)`
→ status bit **0**.
`$27F582` (collected AT MAX) does the same then `bset #7,($1,A6)` → bit **7**.
The collision's guard is `andi.w #$C0` → bits **6 and 7**.

**So the guard catches the at-max flag and NOT the normal one, and I could not
find any writer of bit 6 of an item status word** (§9.3). It is harmless today
because the driver's `btst #0` routes to the collected animation before the kind
dispatch is reached - but a port that "tidies" the guard to `$81` changes
behaviour on the frame a normally-collected item is still inside the player's
box. Transcribe `$C0`.

### 4.3 What collection WRITES - the complete list [M]

| word | kind | write |
|---|---|---|
| `$810406` / `$810468` | `$0` | `+= 2`, refuse at 8 |
| `$810408` / `$81046A` | `$0` | `+= 2`, refuse at 8; **also `bsr $25270C`** |
| both of the above | `$4` | `:= 8` |
| `$8127E4` / `$8127EC` | `$0`,`$4` | the P1/P2 **SHOT** power cursor, `+= 2` or `+= 8` |
| `$8127E8` / `$8127F0` | `$0`,`$4` | the P1/P2 **LASER/POD** power cursor, ditto |
| `$8104FA` / `$81055E` | `$0`,`$4` | cleared |
| `$81040A` / `$81046C` | `$8` | `+= 1` toward `$81040B` / `$81046D` |
| `$8103E6` bit 6 / `$8103E7` bit 1 | `$8` | cleared / set, on completion |
| `$8128F4`,`$8128FE`,`$8128F6`,`$8128FA`,`$812900` | `$8` | `+$4D`, `+1` (cap 99), three BCD |
| **`$81B65C` / `$81B65E`** | `$C`,`$14` | **`+= 1`, UNCAPPED at the increment** |
| **`$81B642` / `$81B644`** | `$C`,`$14` | **`:= $95F`, the hyper gauge** |
| `$8130BE` / `$8130C0` | `$10` | `+= 1`, refuse at `$14` = 20 |
| **the SCORE** | all | `$27F54C`: `moveq #$10,D0 / jsr $286128`. `$27F582`: `move.l #$1000,D0 / jsr $286128` |

**THE `$1000`-vs-`$10` FORK IS THE WHOLE POINT OF THE REFUSAL PATH.** [M] A
collected item scores `$10`; an item collected **when the thing it grants is
already at maximum** scores `$1000` through the same `$286128`, plus a sound
`$28C5CA` and a **different, shorter collected animation** (17 frames off
`$27F508` vs 30 off `$27F308`/`$380`/`$400`/`$480`).

**[M] `src/score.js` has no `$286128`.** Its ledger names `$28614A`/`$286154`
(the bullet-cancel adders, `38-recon` §1.4 [CITED]) and `$28615E` (the kill).
`$286128` is a **third** entry into the same pending-score machine and it is
absent - so **the score half of item collection has no arithmetic in the port
either.**

### 4.4 WHAT THE POWER LEVEL ACTUALLY CHANGES - five levels, and NO new art

**[M] There are FIVE power levels and the ROM proves the count three ways:**

1. `$810406` and `$810408` step by 2 and refuse at 8 → **0,2,4,6,8 = 5 states.**
2. The cursor walks a list and stops when the word at the cursor equals the
   list's word[4] → **5 words.**
3. [M] **The twelve lists at `$25523C..$2552B3` are EXACTLY 5 words each**, and
   the spacing closes: `$255246 − $25523C = 10 = 5×2`, and all eleven spacings
   are 10. Twelve lists × 10 = 120 = `$2552B4 − $25523C`. **EXACT.**

```
[M] the twelve five-word lists, verbatim:
    $25523C  0004 0004 0005 0006 0006      $255278  0004 0005 0005 0006 0006
    $255246  0004 0004 0005 0005 0006      $255282  0003 0004 0005 0005 0006
    $255250  0003 0004 0005 0006 0006      $25528C  0003 0004 0005 0006 0006
    $25525A  0003 0004 0004 0005 0006      $255296  0003 0004 0005 0005 0006
    $255264  0004 0004 0005 0006 0006      $2552A0  0004 0005 0005 0006 0006
    $25526E  0004 0004 0005 0005 0006      $2552AA  0003 0004 0005 0005 0006
[M] the pointer array at $25520C is TWELVE longwords holding exactly those
    twelve addresses, and the index arithmetic reads TWO of them 4 bytes apart:
    ($25520C + n*4) = the SHOT list, ($25520C + n*4 + 4) = the LASER list.
```

**AND THE VALUE IS A `dbra` COUNT IN ALL FOUR OF ITS READERS. [M] I read every
one:**

| reader | what it does with the word |
|---|---|
| `$249C04` (P1 shot spawn) | `D7 = (A2)`, then `$249C74 move.w D7,D6` and `$249C7E dbra D7` - **a SEARCH LENGTH over `$30`-byte slots**, capped to 3 when `$81308C == 0` |
| `$24D48A` (the option pods) | `D4 = (A1)`, capped to 4 when `$81308C == 0`, then `$24D528 dbra D4` |
| `$24D5E6` | the same load, the `$450` variant |
| `$24D766` | the same load |
| `$252CFE`, `$252D0C`, `$252E08` | the power-up's own advance |

**The ART, in both, comes from somewhere else entirely** [M]:
`$249C3E lea $2554EA,A1 / movea.l (A1,D0.w),A1` with
`D0 = (($5A,A6) − 2)*4 (+4 if ($1,A6) bit 0)`, then `movea.l (A1,($20,A6)*2),A1`;
and `$24D4E2 lea ($24D2FC,PC),A1 / lea ($24D35C,PC),A2` indexed by
`($58,A4)*4` and `($20,A4)*2`. **`($5A,A6)`, `($58,A4)`, `($20,A6)` and
`($20,A4)` are the FORMATION, the SHIP and an animation phase. None of them is
written by any of the ten collect routines** - [M] I censused every write in
`$252C96..$25313C` and the complete write set is §4.3's table.

> **THEREFORE: a power-up does NOT change the shot's or the laser's sprite. It
> widens the slot-search window, so MORE shots are alive at once, drawn from the
> same streams the port already ships.**
>
> **Its limit, stated:** I proved this by reading the four cursor readers and
> the two art-selection chains. I did **not** walk `$24A222`'s 30-byte fill to
> the pixel - [M] I read it and its art comes from `movea.l (A1)+,A2 /
> move.w ($42,A6),D0 / move.l (A2,D0.w),(A0)+`, i.e. from the **same A1** and
> an animation phase, not from the slot index - but I did not disassemble
> `$24D530`'s pod fill to the same depth. **If the coordinator wants a hard
> "zero new shot/laser streams", that is the one remaining read.**

**AND THE MEASUREMENT CONSEQUENCE THE COORDINATOR ASKED FOR, ANSWERED:** the
project's art figures are indeed all base-power, but **that costs LESS than the
note feared, not more.** `55-diag`'s 220 missing streams and its laser row are
base-power numbers; [M] what raising the power level adds is **more RECORDS of
streams already in the count**, and **zero new stream addresses on the shot or
laser paths**. The enlargement this recon adds is §6's **139 item streams**, all
of them the items' own art, none of them shot or laser art.

---

## 5. SCORING AND RANK - the brief's most dangerous sentence, corrected

### 5.1 Rank is NOT moved by a power-up [M]

`$2608D2`'s power term reads `$81B646` and `$81B648` (`38-recon` §3.1 [CITED]).
**[M] The complete build-B absolute census of `$81B646` is thirteen sites:**

```
$249834  $249978  $249980  $24A008  $24A010  $252BD2  $2539AC  $253A0E
$259EBA  $260904  $285A64  $285A6C  $285A76
```

**Not one of them is an item body or a collect routine.** The item code
(`$27E812..$27F801`, `$252C96..$25313C`) contains **zero** references to
`$81B646`. Reproduces `38-recon` §3.2's own list [CITED], and it settles the
coordinator's question: **`$810406`/`$810408` are the SHOT power; `$81B646` is
the HYPER power; nothing writes one from the other.**

**Collecting a power-up moves rank by ZERO on the frame it happens, and on every
later frame, unless the player uses a hyper.**

### 5.2 BUT ITEMS DO MOVE RANK - through the hyper stock, and it is WORSE than a direct write

The chain, every link [M]:

```
item kind $C (or $14)  ->  $2530CA addq.w #1,$81B65C     THE HYPER STOCK, +1
                                                          (uncapped here)
    ...player presses Button 2, $249864 reads $81B65C, non-zero -> the HYPER arm
    ...$285A56 D0 = $81B65C
    ...$285A62 add.w D0,$81B646          <- THE RANK POWER, += THE WHOLE STOCK
    ...$285A68 cap at $23
    ...$2608D2: rank += 16 * max($81B646, $81B648), gated on a hyper being ACTIVE
```

> **ONE EXTRA HYPER ITEM = ONE EXTRA STOCK LEVEL = +1 to `$81B646` AT THE NEXT
> ACTIVATION = +16 RANK, PERMANENTLY, because `$285A64` ACCUMULATES.**

That is exactly the owner's *"one wrong rank gain from using super and the entire
route breaks"* - and note **the error is deferred**: it is planted when the item
is collected and paid when the super is used, possibly minutes later. A port
that gets the item right and the hyper wrong, or the item wrong and the hyper
right, produces the same visible symptom.

**THE FRAME POSITION, and it is NOT the item's own frame** [M]:

* The item driver `$27E99E` is **type-5 call #18** (`$28B64C`). The hyper machine
  `$285A12` is inside `$28444E`, inside object **type 0** `$28D520` (`38-recon`
  §2.1 [CITED]). The rank recompute `$2608D2` is inside object **type 10**
  `$260794` [CITED]. **Three different objects.**
* So the write order within a frame is: *item collected (type 5) → `$81B65C` +1*,
  and then on **some later frame** *`$285A62` (type 0) → `$81B646`*, and on the
  frame after **that** *`$2608D2` (type 10) → `$81309E`* - because W19 measured
  `rank=` running BEFORE the drain, i.e. before `$28444E` [CITED via `38-recon`
  §3.3].
* **The one ordering fact this recon adds:** `$244D62` (the collision that SETS
  the collect bit) and `$28B64C` (the driver that ACTS on it) are in different
  objects too, so **an item is flagged on frame N and collected on frame N+1 at
  the earliest**. `$244D62` is reached from the player object's tail; type 5
  runs later or earlier depending on slot order, and **`38-recon` §7.1 records
  that the player object's slot order relative to type 10's is UNRESOLVED.**
  **The same unresolved fact bounds this recon.** §9.4.

### 5.3 Score and chain [M]

* **Score: yes, directly.** `$27F54C moveq #$10,D0 / jsr $286128` and
  `$27F582 move.l #$1000,D0 / jsr $286128`. **`$286128` is absent from
  `src/score.js`** (§4.3).
* **Chain: no.** [M] Nothing in `$27E812..$27F801` or `$252C96..$25313C`
  references `$81B5C0`, `$81B5DA`, `$81B5B2` or `$81B5E0`.
* **But the shot power word feeds the BOMB's chain machine.** [M] `$810408`'s
  build-B readers outside the item code are `$2428EE`, `$254AC6`, **`$2868C6`,
  `$286912`, `$286ADC`, `$286B40`** and `$28A298`. The first four `$286xxx` are
  inside `$286876`/`$286B9C` - the parallel bomb chain machine `38-recon` §4.1
  measured, whose N-hits-per-link is *"`(8−$810408)×1.5 + $12`"* [CITED].
  **So POWER LEVEL SHORTENS THE BOMB'S CHAIN LINK.** That is a second
  rank-adjacent coupling and it is not in any plan.

---

## 6. THE ART - 139 streams, 0 of 139 in the shipped sheet

[M] Every sprite address walked out of the six bodies' own PC-relative tables
and literals this session:

| set | table | entries | distinct | in the sheet | range |
|---|---|---:|---:|---:|---|
| kind `$00` animation | `$27EA1A` | 4 | 4 | **0** | `$1B8318..$1B83FC` |
| kind `$04` animation | `$27EBCC` | 4 | 4 | **0** | `$1B88B8..$1B8984` |
| kind `$08` animation | `$27ED7C` | 4 | 4 | **0** | `$1B8448..$1B852C` |
| kinds `$0C`/`$14` animation | `$27EF10` | 16 | 16 | **0** | `$1B8578..$1B8884` |
| kind `$10` animation | `$27F196` | 4 | 4 | **0** | `$1B89C8..$1B8A94` |
| kinds `$0C`/`$14` literals | `$27EFBE`,`$27F03E`,`$27F2C2` | 3 | 3 | **0** | `$1B8B28..$1B8C80` |
| collected animation A | `$27F308` | 30 | 24 | **0** | `$1B8CB4..$1B9B70` |
| collected animation B | `$27F388` | 30 | 24 | **0** | `$1B9C14..$1BAAD0` |
| collected animation C | `$27F408` | 30 | 24 | **0** | `$1BAB74..$1BBA30` |
| collected animation D | `$27F488` | 30 | 24 | **0** | `$1BBAD4..$1BC990` |
| **the AT-MAX animation** | `$27F508` | 17 | 8 | **0** | `$1E3F9C..$1E4258` |
| | | **172** | **139** | **0 of 139** | `$1B8318..$1E4258` |

```
[M] both ends of every collected-animation list are PINNED BY THE CODE, not by
    my reading:  $27F5F4's walk is `addq.w #4,($a,A6) / cmpi.w #$78,($a,A6) /
    bge -> FREE`  ->  30 entries; and $27F656's is `cmpi.w #$44` -> 17.
    $27F308 + 30*4 == $27F380 == the NEXT list's header.            EXACT
    $27F388 + 30*4 == $27F400   $27F408 + 30*4 == $27F480           EXACT
    $27F488 + 30*4 == $27F500 == the AT-MAX list's header.          EXACT
    $27F508 + 17*4 == $27F54C == $27F54C, THE COLLECT TAIL ITSELF.  EXACT
[M] every list carries an 8-byte header ($FC00 $F600 $0450 $0000, or $FC00
    $FA00 $0430 $0000 for the at-max one) that $27F5F4 consumes as
    `d.l = pos + (A0)+ ; D3 = (A0)+ ; A0 += 2` before indexing.
```

**Method for the membership test:** decoded `games/ddpdoj/assets/spr/streams.u32.gz`
with the port's own `planes-delta-1` accumulator out of `src/web/assets.js`
(**1,605 streams, 1,605 distinct, `$000000..$233F34`**), then tested membership.
**[M] 102 shipped keys already lie in `$1B0000..$1BFFFF`, so 0 of 139 is not a
range artefact** - the item art is genuinely absent from a region the bundle
otherwise reaches. And [M] **0 shipped keys lie in `$1E0000..$1EFFFF`**, so the
at-max animation is in virgin territory.

**RELATION TO E3'S WAVE AND TO `55-diag`'s 220** [M]: `55-diag` §2.5's 220 is
*"a floor for this input over 3,000 frames of stage 1"* [CITED] - **and items
never spawn in any run this project has made, so none of these 139 can be in
it.** These are **additive**. E3's wave is NOT already covering them.

**Unpriced.** I did not run the port's `streamExtent` + coalesce + `gzip -9`
chain, so I have **no KiB figure** and I will not estimate one. For scale, and
CITED only: `54-impl` §3 priced 269 effect streams at **218.4 KiB gz** and
`55-diag` priced its 220 at **12.1 KiB**, which is a 17× spread per stream -
**so an estimate from either would be worthless.** Pricing 139 streams with
`export-web.mjs`'s own arithmetic is the first thing the implementer should do.

---

## 7. WHAT IS ALREADY THERE - bodies read, not names trusted

[M] `grep` over `games/ddpdoj/src/` for every address in §1–§4, then the body of
every hit read:

| thing | state |
|---|---|
| `$27E812` | **NOTE ×2** - `src/handlers.js:1148/1153`, inside `deathSeq85`. **The D0 arithmetic IS transcribed** (`ram.u8(a5+0x0c) === 0x86 ? 8 : 0`) and so is the `$81308C` gate, because they are the handler's own control flow |
| `$27E99E` | **listed and NOT called** - `src/type5.js` `calls[17]`, i.e. type-5 call #18 |
| `$27E88A`, `$27E912`, `$27E98A`, `$27F6AE`, `$27F6E4`, `$27F2F0`, `$27F54C`, `$27F582`, `$27F5F4` | **ABSENT** - zero hits, code or comment |
| the six pool bases, `$8171BA` | `$8171BA` appears **twice in `src/damage.js`** (the deferred block-2 note). The six bases: **`$816B7A` appears only inside two `handlers.js` NOTE STRINGS**, and the other five are absent entirely |
| `$252C96`/`$252D24`/`$252DAC`/`$252E26`/`$252E9A`/`$252FAC`/`$25310E`/`$253126` | **ABSENT**, all eight |
| `$2530BE`/`$2530E6` | **ABSENT** (`38-recon` §5 said so [CITED]; re-checked, still true) |
| `$810406`, `$810440`, `$81043E` | **ABSENT** |
| `$810408` | **one hit, `src/score.js:223`**, in a comment |
| **`$8127E4`** | **LIVE READ** - `src/shots.js` `SPAWN.countPtrP1`, and `state.js` compares against it |
| **`$8127E8`** | **LIVE READ** - `src/options.js podShotSpawn`: `ram.u32(0x8127e8)` then `ctx.rom.u16(cursor)`. `tools/export-tables.py` exports the ROM window behind it |
| `$8130BE` | **ABSENT** |
| `$244D94..$244DFE` (the collision) | **NOTE**, correctly, in `src/damage.js`'s block table, deferred **with blocks 1, 3 and 4 as one unit** because `$2459D0` computes the box all four consume |
| `$80FA72` | **PORTED** - `src/damage.js` writes it at `$244D62` |
| `$286128` (the item score adder) | **ABSENT** from `src/score.js` |

> **THE SINGLE MOST USEFUL THING IN THIS SECTION:** [M] `src/options.js` says
> *"a ROM pointer held in RAM. **MEASURED `$255278`** in the shipped seed"*, and
> `src/shots.js` says *"the ROM word behind `$8127E4`, **MEASURED = 4**"*
> [both CITED, from the port's own comments]. `$255278`'s five words are
> `0004 0005 0005 0006 0006`. **So the port is already reading the power table,
> already at level 0, and the only thing it never does is advance the cursor.**
> Two `+= 2`s are the whole difference between the port's shot spread and the
> board's at full power.

**Net: ZERO lines of item logic. Two correct notes, one type-5 call listed but
not made, one correctly-deferred collision block, and two RAM cursors already
being read at their level-0 value.**

---

## 8. SIZE IT - one contiguous block, and three satellites

[M] Spans between landmarks I read this session. `$27E812..$27F7E7` is **ONE
UNBROKEN BLOCK** and its last byte is pinned by data, not by a guess: the
sixth template ends at `$27F7E7` and `$27F7E8` disassembles as `rts`.

| span | bytes | what |
|---|---:|---|
| `$27E812..$27E889` | **120** | allocator - the DROP path, tail `$27F6AE` |
| `$27E88A..$27E911` | **136** | allocator - the D1+1 loop. **NO CALLER, either scan** |
| `$27E912..$27E989` | **120** | allocator - the HYPER-ITEM path, tail `$27F6E4` |
| `$27E98A..$27E99D` | **20** | the whole-family clear, `#$321` |
| `$27E99E..$27E9F7` | **90** | **THE DRIVER**, type-5 call #18 |
| `$27E9F8..$27EA19` | **34** | the 8-entry kind dispatch + the `rts` entry [7] |
| `$27EA1A..$27F2FF` | **2,278** | six bodies, six motion routines, five sprite tables, the FREE |
| `$27F300..$27F54B` | **588** | five collected-animation lists (30/30/30/30/17) |
| `$27F54C..$27F5F3` | **168** | the two collect tails (`$10` score / `$1000` score) |
| `$27F5F4..$27F6AD` | **186** | the two collected-animation steppers |
| `$27F6AE..$27F6E3` | **54** | fill A (26-byte template) |
| `$27F6E4..$27F745` | **98** | fill B (+ the `$8171BC` variant counter, `+$C`, wrapping at `$9C`→0 and `$A2`→6) |
| `$27F746..$27F7E7` | **162** | the 8-entry template table + six 26-byte templates |
| **`$27E812..$27F7E7`** | **4,054** | **the item subsystem, whole** |
| `$252C96..$25313D` | **~1,192** | the TEN collect routines, incl. both hyper grants (end read to `$253130`; §9.5) |
| `$25520C..$2552B3` | **168** | 12 pointers + **12 five-word POWER LISTS** - a ROM window |
| `$244D94..$244DFD` | **106** | the collision block, inside `$244D62` |
| `$2875B4..$287720` | 365 [CITED `38-recon` §6] | the hyper-item/stock machine (all four `$27E912` sites) |

**Pool slots to model: 25** (8 + 2 + 2 + 6 + 6 + 1), stride `$40`.
**Table entries: 8 dispatch (6 kinds + free + rts) · 8 template pointers (6
distinct) · 12 power lists × 5 words · 5 collected-animation lists · 5 sprite
animation tables.**
**Art: 139 distinct streams, 0 of 139 shipped, UNPRICED (§6).**

**AND ONE PREREQUISITE THAT IS NOT ITEM CODE AT ALL:** `$2459D0`, the player's
own bounding box, ledger row **L16**. `src/damage.js` defers `$244D62` blocks
1–4 together for exactly this reason [CITED]. **Nothing can be collected until
it ships**, and it is not sized here.

---

## 9. WHAT I COULD NOT DETERMINE

Stated the way `docs/knowledge` requires - what I looked for, and where.

1. **Which enemy types own `$267CAC` and `$27B4A0`**, the two drop sites that
   are neither `handler85` nor a boss nor the player's death.
   **What I tried:** the enemy type table at `$27E016` (found by searching the
   image for the longword `$00275914`, which has exactly two occurrences in
   build B, 8 apart; `$27E016 + 8*$85 == $27E43E` confirms the base) - [M] **no
   longword anywhere in `$230000..$2B0000` points into `$27B3F0..$27B4B0` or
   `$267C40..$267CB0` except two**: `$267830`, which is index 3 of a
   state-pointer table starting at `$267824`, and `$262932`, which is a
   `move.l #$27B49C,($10,A6)` state INSTALL. Both are state machines whose owner
   I did not walk back to a type. **This decides whether any item drops in stage
   1 other than types `$85`/`$86`'s**, and it is a listing read of about an hour.
2. **Who writes `$81040B`** (and `$81046D`), the TARGET kind `$08` counts toward.
   [M] Its only build-B absolute sites are `$252EA2`, `$252EB6` (the two reads
   in `$252E9A`) and `$2534A6` (a HUD read). **No absolute writer exists**, so it
   is written through a base register or at an init I did not find.
   **Until it is found, kind `$08`'s completion condition cannot be ported**,
   only its increment.
3. **Who sets bit 6 of an item status word.** `$244DE6 andi.w #$C0,D4` guards on
   bits 6 and 7; [M] I found writers for bit 7 (`$27F5A2`), bit 0 (`$27F562`),
   bit 13 (`$27EA32` and its four siblings) and bit 15 (`$27F6B4`), and **none
   for bit 6**. **What I tried:** every `bset`/`ori`/`or.w` in
   `$27E812..$27F801` and in `$244D94..$244DFE`. §4.2 says why transcribing
   `$C0` anyway is the safe move.
4. **THE ORDERING ONE, and it is `38-recon` §7.1's own open item.** Whether the
   PLAYER object's slot (which runs `$244D62`, setting the collect bit) sits
   before or after type 5's (which runs `$27E99E`, acting on it) in the 20-slot
   allocation order at `$80E240`. **The object driver walks in ALLOCATION order,
   not type-table order** [CITED `src/objdriver.js`]. So I can say an item is
   flagged on frame N and collected on N or N+1, and **I cannot say which**, and
   a port must not choose. One write tap on `$244DF2` and `$27E9EC` in one
   playing frame settles it - **the same tap settles `38-recon`'s open item.**
5. **The exact end of `$25313D`.** I read P2's kind-`$10` arm to `$253130` and
   did not walk it to its `rts`; the 1,192 B is therefore ±8.
6. **The `$25520C` index arithmetic's DOMAIN.** [M] The code computes
   `n = (($810440 − 2)*2 + $81043E)` and uses `n*4` as a byte offset into a
   TWELVE-longword array, reading two entries 4 bytes apart. For rows not to
   overlap, `n` must be even, which requires `$81043E` to be even. [M]
   **`$810440` and `$81043E` are both ABSENT from `src/`**, so I could not
   measure either domain, and I will not assert that the pairing is
   (shot, laser) for every ship. **What IS certain and is what matters: each
   list is 5 words, the cursor advances one word per power-up, and it stops at
   word[4].**
7. **The price of the 139 streams.** §6. Not run, not estimated.
8. **Anything dynamic.** No MAME, no gate, no test was run. Nothing here is
   compared against the board, and **no run in this project has ever had a live
   item record**, so every branch in §3 and §4 is transcribed-and-unexercised.
9. **Whether types `$85`/`$86` are the owner's "bigger ships".** That is a
   picture question. What is measured is that they are the only *enemy types* in
   the whole `$27E016` table whose handler drops an item.

---

## 10. WAVE ESTIMATE

**THREE WAVES, AND THE FIRST ONE IS NOT ITEMS.**

| # | wave | scope | size | why it is its own wave |
|---|---|---|---|---|
| **I1** | **THE PLAYER'S BOX** - the prerequisite | `$2459D0` + `$244D62` blocks 1, 2, 3 and 4 (ledger row **L16**) | 106 B for block 2; `$2459D0` **not sized here** | `src/damage.js` already defers all four as ONE unit and says why: blocks 2–4 all consume the box block 1 computes. **No item can be collected until this ships**, and it also retires the ramming damage (`$244ED2`, one HP) and the impact-pool hit test. It is not item work and should not be scheduled as item work. |
| **I2** | **THE ITEM OBJECT AND ITS COLLECTION** - the owner's wave | `$27E812..$27F7E7` whole (4,054 B), the ten collect routines `$252C96..$25313D` (~1,192 B), the `$25520C..$2552B3` ROM window (168 B), `$286128`, and the **139-stream art shard** | ~5,414 B of code + a 168 B window + 139 streams; 25 pool slots; 8 + 8 + 12 + 5 + 5 table entries | These cannot be split: the driver `jsr`s the collect routines directly, and an item that spawns and cannot be collected is worse than no item. **Kinds `$0C` and `$14` must be REFUSED here.** |
| **I3** | **THE HYPER ITEM** - the rank-critical half | `$27E912` (120 B), `$2875B4..$287720` (365 B), `$2530BE`/`$2530E6`, the `$81B64A` earn path, and kinds `$0C`/`$14`'s collect arms | 485 B + the `38-recon` wave-2 dependency | §5.2: this is the ONLY item path that reaches rank, it reaches it through the hyper machine, and **`38-recon` §6 wave 2 (the hyper) is unported**. Granting stock with no hyper machine plants a rank error that pays out later. Refuse it, count it, ship it with the hyper. |

**Realistic range 3–4** - I2 may split its art shard off the way E5b's did, and
§9.7 means nobody yet knows whether 139 streams is a 10 KiB shard or a 100 KiB
one.

**MUST SHIP TOGETHER (the one-sentence answer):** `$27E812` + `$27F6AE` + the
`$27F746` template table **range-checked to {0,4,8,$C,$10,$14}** + `$27E99E` +
the `$27E9F8` dispatch **range-checked to 8 entries** + all six bodies +
`$27F2F0` + `$27F54C` + `$27F582` + `$27F5F4`/`$27F656` + `$27E98A` + the ten
collect routines + the `$25520C` ROM window + `$286128` + the art - **and
`$244D62`'s block 2 must already exist, which means `$2459D0` must already
exist.**

---

## 11. IMPLEMENTER-READY WORK LIST

1. **Ship `$2459D0` and `$244D62` blocks 1–4 FIRST** (I1). `src/damage.js`
   already has the note, the block table and `$80FA72`'s write; the deferral is
   one `note(ctx, DMG.playerBox, …)` to replace.
2. **Port the six pools as ONE 25-slot array** with a per-kind base/limit map,
   and assert §1's six arithmetics **on every build**. `$8171BA` is the live
   count and `$8171BC` a separate spawn-variant counter - two words, and
   `$8171BE` (pool A's base) must be the very next thing after them.
3. **Range-check BOTH tables and throw.** `$27F746` entries [6]/[7] point at
   `rts`-and-onward CODE; `$27E9F8`'s mask is `$3C` (16 indices) against 8
   entries. Two separate checks, two separate named throws.
4. **Transcribe `$275AF2..$275B1A` into `deathSeq85`.** The D0 arithmetic and
   the `$81308C` gate are **already there** as of W54 - this is replacing two
   `u?.note(0x27e812, …)` calls with two `spawnItem(...)` calls. Then
   **red-validate against `$81308C`**: with `$81308C = $0001` (the port's own
   measured value) type `$85` must drop exactly ONE item, not two.
5. **`$25520C..$2552B3` is a ROM WINDOW, 168 B**, not JS literals - and assert
   `$25523C + 12*10 == $2552B4` on every export, which is how the "5 words" is
   pinned. `tools/export-tables.py` already exports the window behind
   `$8127E8`; this is the table those cursors point INTO.
6. **The cursor advance IS the power-up.** `src/shots.js` and `src/options.js`
   already read `$8127E4`/`$8127E8` and the ROM word behind them; the power-up
   adds `+= 2` (kind `$0`) or `:= base+8` (kind `$4`). **Red-validate by level:**
   at level 0 the port's shot search window must be the measured 5, and at level
   4 it must be 7 for list `$25523C`.
7. **`$286128` must go into `src/score.js`** with both call sites' D0 - `$10`
   for a collect and **`$1000` for a collect at maximum**. The `$1000` arm is a
   `move.l`, the `$10` arm a `moveq`; do not merge them.
8. **REFUSE kinds `$0C` and `$14`** in I2, the way W52 refused `$27F8F8` and W54
   refused pool D. Count the refusal with `$2530BE`'s address, the player, and
   the stock the grant would have made - because §5.2 says an ungranted stock
   and a wrongly-granted stock are both permanent rank errors and only the
   counted one is diagnosable.
9. **Harvest the 139 streams by ROM address** the way `export-web.mjs`'s
   `harvest` rows already do. Five of the tables are flat longword arrays; the
   five collected-animation lists carry an 8-byte header `$27F5F4` consumes
   before indexing. **Price it before scheduling I2** (§9.7).
10. **Fix the two notes this recon falsifies:** `src/handlers.js:70` and `:1562`
    file `$27F92A` under *"the `$816B7A` pool family"*. [M] `$27F936 lea
    $817DC6,A0` - it is IMPACT POOL A's reserved-10 allocator. Both notes will
    send an implementer to the wrong pool.
11. **Do not let a wave "tidy" `$244DE6 andi.w #$C0`** to match the flags that
    are actually set (§4.2, §9.3).

---

## LOG (appended as findings arrived)

- opened. Read HANDOVER, `docs/knowledge/09` and `10`, `50-recon-effects`,
  `54-impl-E5b`, `38-recon-bomb-hyper`, `55-diag-invisible-content`.
- **[M] THE BRIEF'S PREMISE HOLDS: items are entirely unported.** Zero lines of
  item logic under `src/`; two notes, one type-5 call listed but not made.
- **[M] A SIXTH POOL FAMILY NOBODY HAS WRITTEN DOWN** - six item pools,
  `$816B7A..$8171B9`, 25 slots of `$40`, closing EXACTLY on `$8171BA` (live
  count) and `$8171BC` (spawn variant), whose next word is `$8171BE`, pool A's
  base. The item family and `50-recon`'s five effect pools are one contiguous
  265-slot region.
- **[M] THE DROP THE OWNER IS MISSING IS 26 BYTES ABOVE AN EXPLOSION W54
  PORTED.** `$275B06`/`$275B1A jsr $27E812` sit in `handler85`'s death arm
  immediately before `$275B20 jsr $289004`. Types **`$85` and `$86`**, found
  independently through the enemy type table at `$27E016`
  (`$27E016 + 8*$85 == $27E43E`, EXACT).
- **[M] THE DROP IS GUARANTEED, NOT RANDOM.** No RNG source appears anywhere in
  `$275AF2..$275B20`. Type `$85` drops kind `$0` twice, or ONCE when
  `$81308C != 0` - and the port's own measured `$81308C` is `$0001`; type `$86`
  drops kind `$8` once.
- **[M] NINE drop sites and FOUR hyper-item sites**, absolute AND PC-relative
  scans both run. **`$27E88A`, the third allocator, has NO CALLER of either
  kind.**
- **[M] SIX ITEM KINDS**, enumerated from the ROM: `$0` power-up, `$4` full
  power, `$8` the `$81040A`/`$81040B` set item, `$C` P1 hyper stock, `$10` the
  `$8130BE` counter (cap 20), `$14` P2 hyper stock. Dispatch entry [6] is the
  FREE and entry [7] is a deliberate `rts`.
- **[M] BOTH ITEM DISPATCH TABLES RUN OFF THE END INTO CODE** - `$27F746`
  entries [6]/[7], and `$27E9F8`'s `$3C` mask admitting 16 indices against 8
  entries. Same shape as `$288FF0`[5] and `$27F99E`[20..31].
- **[M] COLLECTION IS `$244D62`'s SECOND BLOCK**, `$244D94..$244DFE`, which
  `src/damage.js` already NOTES correctly and defers **with `$2459D0`** - so the
  gating dependency for the entire wave is ledger row L16, not item code. The
  flag is one `or.w $80FA72,(status)` and the port already writes `$80FA72`.
- **[M] THE COORDINATOR'S RANK PREMISE IS WRONG AND THE TRUTH IS WORSE.** The
  shot power is `$810406`/`$810408`; rank's power is `$81B646`; **nothing writes
  one from the other** (13-site census, no item among them). But kinds `$C`/`$14`
  raise `$81B65C`, and `$285A62 add.w $81B65C,$81B646` **accumulates** - so one
  extra hyper item is **+16 rank permanently, paid at the next super, not at
  pickup.** The error is planted in one object and collected in another.
- **[M] FIVE POWER LEVELS**, pinned three independent ways: `$810406`/`$810408`
  step 2 and refuse at 8; the cursor stops at word[4]; and the twelve lists at
  `$25523C` are exactly 5 words each with all eleven spacings == 10.
- **[M] A POWER-UP CHANGES NO SPRITE.** All four readers of the cursor use its
  word as a `dbra` COUNT; shot and laser art come from `$2554EA`/`$255502` and
  `$24D2FC`/`$24D35C`, indexed by SHIP and WEAPON, neither of which any collect
  routine writes. **So the answer to "how many streams per level" is ZERO** -
  with the one remaining read named in §4.4.
- **[M] THE PORT IS ALREADY READING THE POWER TABLE AT LEVEL 0.**
  `src/options.js` measured `$8127E8 = $255278` and `src/shots.js` measured the
  word behind `$8127E4` as 4 - `$255278` is `0004 0005 0005 0006 0006`. **Two
  `+= 2`s are the whole difference between the port's shot spread and the
  board's at full power.**
- **[M] COLLECTING AT MAXIMUM SCORES `$1000` INSTEAD OF `$10`**, through
  `$286128`, with its own sound and its own 17-frame animation - and
  **`$286128` is absent from `src/score.js`**, so the score half has no
  arithmetic either.
- **[M] THE ART: 139 distinct streams, `$1B8318..$1E4258`, 0 of 139 in the
  shipped sheet**, decoded with the port's own `planes-delta-1` accumulator over
  1,605 shipped streams. Not a range artefact - 102 shipped keys already lie in
  `$1B0000..$1BFFFF`. Every collected-animation list's extent is pinned by the
  stepper's own `cmpi.w #$78` / `#$44`, and `$27F508 + 17*4 == $27F54C` lands
  exactly on the collect tail. These 139 are **ADDITIVE** to `55-diag`'s 220 -
  items have never spawned in any run, so none of them can be in it.
  **UNPRICED, deliberately:** `54-impl` priced 269 streams at 218.4 KiB and
  `55-diag` priced 220 at 12.1 KiB, a 17× spread per stream, so any estimate
  from either would be worthless.
- **[M] A PORT NOTE FALSIFIED:** `src/handlers.js` files `$27F92A` under "the
  `$816B7A` pool family" in two places; `$27F936 lea $817DC6,A0` makes it
  IMPACT POOL A's reserved-10 allocator.
- **[M] SIZED:** the item subsystem is ONE contiguous 4,054-byte block
  `$27E812..$27F7E7`, plus ~1,192 B of collect routines, a 168-byte power-table
  window, and a 106-byte collision block. 25 pool slots. 139 streams.
- **WAVE ESTIMATE: THREE** (§10) - I1 the player's box (`$2459D0`, NOT item
  work, and everything waits on it), I2 the item object + collection + art with
  kinds `$C`/`$14` REFUSED, I3 the hyper item with the hyper machine. Range 3–4.
- nine things I could not determine (§9); the first two - who owns `$267CAC` and
  `$27B4A0`, and who writes `$81040B` - are the ones that bound I2's scope.

status: **DONE**

