# RECON 10 — game flow: stage structure, death, respawn, continue, loop-2 gate

status: **DONE on the mode machine, death, lives, respawn, score and the stage
script — BLOCKED on the loop-2 decision routine and BLOCKED on the bees**, with
the measurements that say so in §11. Two 7,000-frame VERSION-B runs, both
`fails=0`, `frames_on_required=6301`.
wave: 10   role: recon   started: 2026-08-01
target: DODONPACHI DAIOUJOU, IGS PGM, set `ddpdojblk`, **VERSION-B**
(`2002.10.07 BLACK VER`, code `$23xxxx`–`$28xxxx`).
Machine pin re-measured this session: `maincpu_fnv64=D4C25CA9C91B9D47`,
6,291,456 bytes, `BUILD required=B frames_on_required=6301 frames_on_other=699`.

Every address below is build B. `docs/worklog/ddpdoj/00-recon-hard.md` and
`NOTES-build-split.md` were read first; nothing here is an ISR address, so the
build-A-ISR exception does not apply to any line in this file.

## The question

1. the stage/mode state machine on VERSION-B; stage start and stage end
2. player death, explosion, respawn; lives
3. the CONTINUE path (this is a coin-op — the oracle can use it)
4. the loop-2 decision routine and the counters it reads
5. the bees: 10 per stage, laser-revealed, cross-stage carry

`games/ddpdoj/NOTES-progression.md` is third-party player documentation. Every
line of it is a hypothesis here and is labelled CONFIRMED / CONTRADICTED /
UNRESOLVED at the end.

## What I ran

```
python games/ddpdoj/tools/flowrecon.py snaps 7000 "" 500     (new, this wave)
  CENSUS logicframes=7000 videoframes=7037
  BUILD required=B frames_on_required=6301 frames_on_other=699
  CENSUS object_slots_processed 0:699 1:1504 2:1 4:1 5:2457 7:353 8:1373 9:612
  CENSUS armpc 13C5B6:699 23C212:6301
  DONE logicframes=7000 videoframes=7037 fails=0
  -> 12 framebuffer PNGs, out/snap/flow_lf00????.png
python games/ddpdoj/tools/flowrecon.py watch "<18 columns>" 7000
python games/ddpdoj/tools/oracle/xref.py dasm|abs|lea|ptrtable   (many)
plus three ad-hoc scanners over out/maincpu.bin (opcode-form write scan,
  PC-relative bsr/jsr scan, allocation-site scan) — inline in this log
```

`games/ddpdoj/tools/flowrecon.py` is new and is a thin wrapper over
`tools/oracle/pgm.py`'s `trace()`, so every run inherits `BOOT_B`, the five
determinism flags, `PROBE_REQUIRE_BUILD=B` and the object-driver census.
It adds no oracle of its own.

---

## 1. THE TOP-LEVEL MODE MACHINE — `$812E56`, 15 modes, driver `$25A770`

The main loop's own init (`$23BFCC`) allocates **object type 8** and writes
`($4,A0) = $D`:

```
23bfcc: move.w #$8,D0 / jsr $241182 / move.w #$d,($4,A0)
```

Type 8 is dispatch entry [8] of the 20-entry object table — and the table's
stride is **8, not 4** (`$2410D4 lsl.w #3,D1`). Re-derived here because a
stride-4 read doubles every index:

| ty | handler | pri | ty | handler | pri |
|---|---|---|---|---|---|
| 0 | `$28D520` | 09 | 10 | `$260794` | 1F |
| 1 | `$26127A` | 1A | 11 | `$25DBB4` | 0A |
| 2 | `$2491C0` | 1C | 12 | `$28F3AC` | 09 |
| 3 | `$249246` | 1B | 13 | `$288A60` | 0B |
| 4 | `$260B30` | 09 | 14 | `$288C6C` | 14 |
| 5 | `$28B5E0` | 18 | 15 | `$291F66` | 1E |
| 6 | `$28D63C` | 0A | 16 | `$256E7A` | 1E |
| 7 | `$290BE8` | 1E | 17 | `$25CEB8` | 0A |
| 8 | `$25A770` | 0A | 18 | `$24902A` | 0A |
| 9 | `$25CACA` | 0A | 19 | `$28EE88` | 1E |

This reproduces wave 5's measured steady-state set `10 2 1 5 11 4 4 0` at
priorities `1F 1C 1A 18 0A 09 09 09` exactly, which is the cross-check that the
stride is right.

`$25A770` is the mode driver:

```
25a764: clr.b ($3,A5) / move.w D0,$812E56      THE MODE SETTER
25a770: tst.b ($2,A5) / beq $25A8AE            not entered yet -> enter
25a778: mode in {$E,$3,$D} -> skip the idle/credit path
25a796: if $803808.b == $12 -> bsr $25ACAC     THE START/CREDIT CHECK
25a7a6: $23C956 / $23C932  -> credits present? -> tear down, spawn type 8
                                                 with ($4,A0)=3  (mode 3)
25a862: move.w $812E56,D0 / add D0,D0 / add D0,D0 / jmp ($4,PC,D0.w)
25a870: 15 bra entries
```

* `$812E56` = **the mode word** (0..14)
* `$812E58` = the per-mode frame counter, `addq.w #1` every frame except mode $D
* `$812E5A` = **the join mask** (bit 0 = P1 started, bit 1 = P2 started)
* `($2,A5)` = "mode entered"; `($4,A5)` = the requested mode; clearing `($2,A5)`
  re-enters. `$25A8AE` is the entry path and it clears `$812E5A` and `$812E58`.

| mode | handler | what it is | next |
|---|---|---|---|
| 0 | `$25A8AE` | the ENTER path (adopt `($4,A5)`) | — |
| 1 | `$25A8E6` | `$25BBB4`/`$25BD7C` | 5 |
| 2 | `$25A912` | `$25B3DC`/`$25B412`, palette `$222638` | $C |
| 3 | `$25A94A` | **credits inserted, waiting for START** (calls the start check itself) | — |
| 4,6,7,8,10,11 | `rts` | **unused — no handler at all** | — |
| 5 | `$25A97C` | `$25C592`/`$25C6D4` | respawns the director as mode 2 |
| 9 | `$25A9E6` | `$25C3E8`/`$25C424` | 1 |
| 12 | `$25AA10` | `$25C2AE`/`$25C2EA` | 9 |
| 13 | `$25ABF6` | **the "FOR USE IN JAPAN ONLY" warning**, text at `$25AA36`, `($4,A5)=$12C` = 300-frame timer | 2 |
| 14 | `$25AC92` | **START THE GAME**: `$24107C`, then allocate **type 9** with `($4,A0) = $812E5A` | — |

The attract cycle is therefore `2 → C → 9 → 1 → 5 → 2 → …`, mode 3 is the
credits-inserted screen and mode $E is the one-frame launcher. A string
`"DODONPACHI 3"` sits at `$25A8D8`, inside this routine's data — a useful
landmark that says you are in the right object.

`$25ACAC` (the start/credit check) is worth writing out because it is the
CONTINUE-adjacent code path:

```
25acac: move.b #$0,$812E5A
25acb4: jsr $23D16C / btst #$f,D0     P1 START edge
25acc0: jsr $23C98E / bcs             CONSUME ONE P1 CREDIT (carry = refused)
25acca: ori.b #$1,$812E5A
25acd2: jsr $23D17E / btst #$f,D0     P2 START edge
25acde: jsr $23C9F0 / bcs             CONSUME ONE P2 CREDIT
25ace8: ori.b #$2,$812E5A
25acf0: if $812E5A != 0 -> mode $E
```

So `$23C98E`/`$23C9F0` are **the credit consumers** and `$23C956`/`$23C932` the
credit readers. Those four are the oracle's coin-op levers.

## 2. THE SELECT/INTRO DIRECTOR — object type 9, `$25CACA`, players at `$812EA0`

Two player blocks, **`$812EA0` and `$812F10`, stride `$70`**, walked by
`dbra D7` with D7=1 (`$25CADE`..`$25CBFE`).

```
(A6)+$00  b  joined (0 = not in the game)
(A6)+$01  b  PLAYER SELECT STATE 0..8
(A6)+$02  w  cursor
(A6)+$03  b  chosen ship          (indexes the table at $25CF60)
(A6)+$04  w  chosen doll
(A6)+$05  b  doll index
(A6)+$2E  w  BCD select countdown, initialised to $0599
(A6)+$30  b  countdown-expired flag
(A6)+$31  b  /2 divider, reload 2   -> one BCD tick every 2 logic frames
(A6)+$56  l  score copy, initialised to $FFFFFFFF
```

`$25CB66`: the countdown only ticks while `($1,A6) < 7`. States:

| state | handler | what |
|---|---|---|
| 0 | `$25D010` | init the block, `($2E)=$0599`, load 12 palettes | → 1 |
| 1 | `$25D1DA` | **FIGHTER SELECT** cursor (up/down toggle 0/1) | → 2 |
| 2 | `$25D164` | erase the "FIGHTER SELECT" banner (`$25D1BA`) | → 3 |
| 3 | `$25D306` | set up **DOLL SELECT**, `($2E)=$0599` again | → 4 |
| 4 | `$25D402` | doll cursor | → 5 |
| 5 | `$25D39C` | erase "DOLL SELECT" (`$25D3EA`) | → 6 |
| 6 | `$25D4F0` | start the intro | → 7 |
| 7 | `$25D560` | the intro animation, `($32,A6)` frame counter | → 8 |
| 8 | — | done |

When **both** players are in state 8 (`$25CC12`/`$25CC28`), `($2,A5)=2` and the
next dispatch takes `$25CAC2: jmp $241292` — the director **deletes itself**.
Before that, `$25CA78` has allocated **object type 10 with `($4,A0)=0`** — the
real game. `$25CBB8`/`$25CBE6` are the **mid-game join**: START pressed while
`(A6)==0` consumes a credit and sets `(A6)=1`.

MEASURED: `flow_lf001250.png` is the PLAYER SELECT screen with a **`599`**
readout, which is `($2E,A6)=$0599` on the glass. That is the confirmation that
this block is what I think it is.

## 3. THE GAME DIRECTOR — object type 10, `$260794`

Init `$2605C8`:

```
2605e2..260660  ten palette loads
260660: clr.w $813080 / move.w #$1,$813082
26066e: tst.w $813098 / bne $260680        <-- THE LOOP FLAG
260678: jsr $2603DA        loop 1: clear $81308C..$813158, lives = $FFFF
260680: loop 2: lives = $FFFF, clear only $813142..$813157 (the rest CARRIES)
2606ca: move.w ($4,A5),D0 / bsr $25FD0C
2606d2..260704  $28D552 $28EBFE [$27F87C $2884E2 $287024 $24A810] $25FE42 $288574
```

```
25fd0c: move.w D0,$813092 / add D0,D0 -> $813094 / add D0,D0 -> $813096
```

**`$813092` = the STAGE INDEX** (`$813094` = ×2, `$813096` = ×4 — the two
pre-scaled table indices). An opcode-form scan of the whole build-B range for
every write form to `$00813092` finds **exactly one**: `$25FD0C`. And a
PC-relative `bsr/jsr(d16,PC)` scan finds exactly one caller of `$25FD0C`:
`$2606CE`. So the stage index changes only when the type-10 record is (re-)
entered with a new `($4,A5)`.

Per-frame (`$2607A4` onward): `$25FF7A` (the life machine, §4), the rank
computation `$2608D2`, `$288610` (the continue/game-over banners, §6).

`$2608D2` is the RANK: it reads a per-stage base byte through
`$81315C` indexed by `$813092`, adds `$8130C6 >> 8` (the game frame counter),
adds a term from `$81B646`/`$81B648`, and stores the result in **`$81309E`**,
clamped. `$2608A0` picks the table from the operator rank byte `$80380C`
(wave 2's finding, re-read here, unchanged) — the two tables are at `$260886`
(longwords) and `$260896` (words).

## 4. DEATH, LIVES, RESPAWN — the life machine at `$8130FA`, driver `$25FF7A`

```
25ff7a: lea $8130FA,A6 / moveq #$1,D7
25ff82: move.w (A6),D0 / beq skip
25ff8c: D0*4 -> lea ($25FF52,PC),A0 / movea.l (A0,D0),A0 / jsr (A0)
25ff9e: lea ($24,A6),A6 / dbra D7
```

Two blocks, **`$8130FA` (P1) and `$81311E` (P2), stride `$24`**.

```
(A6)+$00  w  LIFE STATE, dispatched through $25FF52
(A6)+$08  l  POINTER TO THE LIVES WORD   ($8130BE for P1, $8130C0 for P2)
(A6)+$0C  w  spawn X       ($1000)
(A6)+$0E  w  spawn Y       ($0E00 P1 / $2A00 P2)
(A6)+$10  w  respawn X, +$12 respawn Y
(A6)+$14  w  the OBJECT TYPE to allocate for the ship (2 for P1, 3 for P2)
(A6)+$16  w  player index 0/1
(A6)+$17  b  player index as a byte (the one the code actually branches on)
(A6)+$18  l  pointer to the live player object ($0 = no ship on screen)
(A6)+$1C  l, +$20 l  two more spawned-object pointers
```

The parameter table is at `$25FE22`, copied by `$25FE42`:
`1000 0E00 1000 0E00 0002 0000 0081 30BE` / `1000 2A00 1000 2A00 0003 0001 0081 30C0`.

**`$8130BE` (P1) and `$8130C0` (P2) are the LIVES WORDS.**

| state | handler | what |
|---|---|---|
| 0 | — | idle (`(A6)==0` skips dispatch entirely) |
| 1 | `$25FFA8` | **THE MISS** |
| 2 | `$260056` | **out of stock — game over / continue** |
| 3 | `$26010E` | spawn with a fresh stock from the DIP |
| 4 | `$2601F4` | **CONTINUE** — reload the stock and respawn |
| 5 | `$2602B6` | — |
| 6 | `$260348` | — |
| 7 | `$26035A` | — |
| 8 | `$26037C` | — |
| 9 | `$2603B0` | — |

State 1, verbatim, because this is the whole death mechanism:

```
25ffa8: jsr $23C668
25ffae: move.l #$0,($18,A6)          the ship object pointer is dropped
25ffb6: move.w #$78,$8130D4          120-frame death pause
25ffbe: jsr $261116
25ffc4: movea.l ($8,A6),A0
25ffc8: subq.w #1,(A0)               <-- THE LIFE IS LOST HERE
25ffca: tst.w (A0) / bpl $26000C
25ffd0: (out of stock) clear $812930/$812934/$812938 (P1)
                    or $812932/$812936/$81293A (P2)
260004: move.w #$2,(A6)              -> life state 2
26000c: (still alive) $2878CC or $28795C, then allocate ($14,A6) at
        ($C,A6)/($E,A6), store the pointer in ($18,A6), state -> 0
```

So a MISS is `subq.w #1` on `$8130BE`, and **the stock is "lives remaining"
with -1 meaning exhausted** (`bpl` — 0 is still playable).

The **stock size is the operator DIP `$80380E`** through a 5-entry word table at
`$2600CE`:

```
2600ce:  0002 0003 0004 0000 0001      lives = 2,3,4,0,1 for DIP 0..4
26010e: move.b $80380E,D0 / add D0,D0 / lea ($2600CE,PC),A1 / move.w (A1,D0),(A0)
```

`$2601F4` (state 4) does the same load, **except**: `tst.w $813098 / beq` — in
loop 2 the stock comes from `$8130C2` (P1) / `$8130C4` (P2) instead, and
`$28EF38` is what fills those: `move.w $8130BE,$8130C2` when `$813098 == 0`.
**The lives you finish loop 1 with are the lives you start loop 2 with.**

**MAX LIVES = 20.** `$28434A: cmpi.w #$14,(A3) / beq` guards the extend.

`$25FD94` counts how many of the two `($18,A6)` pointers are non-zero into
`$81308C`, mirrors it to `$81308E`, and sets `$8130D2` when `$81308E == -1`
(no ship on screen at all) — `$8130D2` gates the game-frame counter `$8130C6`
and the `$8130D4` countdown at `$2607B2`.

## 5. THE SCORE — `$81B440`, 9 BCD digits, and the EXTEND

`$2842B0` is the score accumulator and it runs both players:

```
2842b0: lea $81B444,A0    lea $81B4C0,A1    lea $81B4AC,A2
        lea $8130BE,A3    lea $81B4B4,A4    lea $81B44C,A6   moveq #$0,D7
2842d8: lea $81B448,A0    lea $81B4C4,A1    lea $81B4B0,A2
        lea $8130C0,A3    lea $81B4B6,A4    lea $81B44E,A6   moveq #$1,D7
2842fe: tst.l (A1)+ / beq rts             nothing pending
284302: tst.w (A3) / bpl                  DEAD (lives < 0) -> pending zeroed,
                                          no score is banked
28431e: abcd -(A1),-(A0)  x4              8-digit BCD add
284326: bcc  -> 284328: addq.w #1,(A6)    the NINTH digit
28432a: cmpi.w #$a,(A6) / bne  -> else move.l #$99999999,(A0) / (A6)=9  CAP
28433c: (A2) == $FFFFFFFF ? no extend : if (A0) >= (A2) and (A3) != $14
        -> addq.w #1,(A3)   EXTRA LIFE, $286FDA + $28C678 + $2878CC/$28795C
```

| | P1 | P2 |
|---|---|---|
| score, low 8 BCD digits | `$81B440` (l) | `$81B444` (l) |
| score, 9th digit | `$81B44C` (w) | `$81B44E` (w) |
| pending increment | `$81B4C0` (l) | `$81B4C4` (l) |
| extend threshold | `$81B4AC` (l) | `$81B4B0` (l) |
| extend index | `$81B4B4` (w) | `$81B4B6` (w) |

**Nine digits is 999,999,999 — so the reported 350,000,000 loop-2 threshold
does fit this representation.** A four-byte-only score would not have.

The staging routine `$249EE8` (in the player object) copies `$8128F6` (P1) /
`$812904` (P2) into `$81B5AA` and BCD-adds it into `$81B4C0`/`$81B4C4`,
gated by `$80392C`, `$8130F8` bit 0, `$81309C`, `(A6)` bit 6, `$812914`/
`$812918`. And:

```
249f34: tst.w $813098 / beq $249F4A
249f3c: addq.l #4,A0 / addq.l #4,A1 / sub.w D2,D2 / abcd x4
```

**In loop 2 the pending increment is added a SECOND time — score is doubled.**

## 6. THE LOOP FLAG `$813098`, and the only two instructions that write it

`$813098` is read at **130 distinct build-B sites** (`xref.py abs 813098`,
filtered to `$23xxxx-$28xxxx`). It is written at **exactly two**:

```
259db0: move.w #$0,$813098
259dc6: move.w #$1,$813098
```

and both are inside `$259D90`, which is a **DEBUG STAGE-SELECT**:

```
259d14: move.w $C08006,D0 / btst #$7,D0     a DSW bit; SET = feature off
259d5a: jsr $23D17E                          P2 input
259d62..259d8c: the same P2 word must be held for $28 = 40 consecutive frames
259d96: btst #$4,D3 and btst #$5,D3 (P2 buttons 1+2) and $28D53C carry-clear
        ($81DF20 == 0)
259db0:   $813098 = 0
259db8:   D3 = ($2,A4)                       the selector value, 0..$FF
259dbc:   if D3 >= 6: D3 -= 6 and $813098 = 1
259dce:   $8130C6 = 0
259dda:   jsr $2429C4 with D7 = D3           <-- STAGE START
259de4: else btst #$5 and #$6 (P2 buttons 2+3) -> $263684 / $263678
259e1e: else P1 START held + P2 stick:  up +1, down -1, right +$10, left -$10
        on ($2,A4) = $812E0A, masked to $FF, and DISPLAYED
```

and the selector's name table is at **`$259F44`**, 12 entries × 10 bytes:

```
STAGE  1  STAGE  2  STAGE  3  STAGE  4  STAGE  5  STAGE  E
STAGE R1  STAGE R2  STAGE R3  STAGE R4  STAGE R5  STAGE RE
```

So the game's own view of its structure is **six stages per loop — five
numbered plus "E" — and two loops, the second labelled "R"**. `$2429C4` is the
stage starter: it sets `$8130F8` bit 3, clears bit 4, sets `$812972 = 1`, and
allocates **object type 6 with `($4,A0) = D7`** — the stage script.

**This is the single most useful thing in this log for the corpus.** It is a
built-in warp to any stage of either loop, it needs no skill, and it writes the
loop flag itself.

## 7. THE CONTINUE / GAME-OVER BANNERS — `$81B706`, driver `$288610`

```
288610: lea $81B706,A4 / moveq #$1,D7
288618: move.w (A4),D0 / beq skip / D0*4 -> lea ($288638,PC),A0 / jsr (A0)
28862e: lea ($16,A4),A4 / dbra D7
```

Two blocks, `$81B706` and `$81B71C`, stride `$16`, table at `$288638`:
`[0] none  [1] $28864C  [2] $28871C  [3] $28875E  [4] $288952`.
State 1 is the CONTINUE banner (text `"CONTINUE"` at `$2886FC`, drawn by
`$25A14C`; the digit at `($a,A4)` is drawn separately by `$23CD80` ten pixels
lower, and a change of `($a,A4)` rings `$28C6AC`). `$288598` sets a state
directly; `$2885C6` maps state 1→2 and 3→4 (the "accepted / expired"
transitions). `$288574` clears both blocks and is called from the type-10 init.

`$28D53C` (`tst.w $81DF20`, carry if non-zero) gates both the continue banner
and the debug warp — the same interlock.

Related strings, all present in build B: `"      CONTINUE REQUIRES     "`
`$25AE1A`, `" GAME OVER    "` `$288DC8`, `"    PRESS 1P OR 2P START    "`
`$25AD9A`, `"    2002.10.07.BLACK VER    "` `$25ABD8`, and the service-menu
items `"2. CONTINUE"` `$258125`, `"2. EXTEND"` `$25893A`,
`"1 COIN CONTINUE"` `$25840C`, `"OLD: NO EXTEND"` / `"NEW: NO EXTEND"`.
So **CONTINUE and EXTEND are both operator settings**, and there are two extend
tables ("OLD"/"NEW").

## 8. THE MEASURED TIMELINE (framebuffer, 7,000 logic frames, no input after START)

`BOOT_B` = `560=D;570=;600=A;610=;1000=N;1010=;1100=N;1110=;1200=S;1210=`
(down, shot, coin, coin, start).

| lf | what the framebuffer shows |
|---|---|
| 1250 | **PLAYER SELECT**, "TYPE-A", `599` Sec, "2P PUSH START BUTTON" |
| 1750–3750 | gameplay, stage 1 |
| 4250 | gameplay; **the ship is exploding at the bottom of the screen** |
| 4750–5250 | gameplay continues, "PLAYER-1 240", bomb row `B B B B B` |
| 5750–6250 | (see the watch TSV) |
| 6750 | **TITLE SCREEN**, `1ST 20000000PTS / 2ND 20000000PTS`, `RANK: NORMAL`, `CREDITS:1` |

So an unattended run inserts 2 credits, spends 1, plays stage 1, dies out, and
is back in attract by lf 6750 with 1 credit left. **A death, a game over and a
return to attract all happen inside 7,000 logic frames with no input at all.**
That is the cheapest death scenario this project has, and it costs one run.

---

## 9. THE MEASUREMENT — every claim above, checked against the board

`python games/ddpdoj/tools/flowrecon.py watch "<18 cols>" 7000`, VERSION-B,
`BOOT_B` only (**no input at all after START**), 7,000 logic frames.
`PROBE_WATCH` columns, `out/flow/watch.tsv`. Every line below is a change of
state, printed by the reader in the log's own command list. Free-running
counters (`$812E58`, `$8130C6`, `$81309E`) elided.

```
lf     mode  join  p1blk  stage loop liv1   lst1  alive alldead cont
1      0     0     0000   0     0    FFFF   0     0     0       0
700    13    0     0000   0     0    FFFF   0     0     0       0    warning screen
1001   2     0     0000   0     0    FFFF   0     0     0       0    title
1014   3     0     0000   0     0    FFFF   0     0     0       0    coin -> credits
1201   14    0100  0000   0     0    FFFF   0     0     0       0    START -> game
1203   14    0100  0100   0     0    FFFF   0     0     0       0    P1 joined, sel state 0
1204   14    0100  0101   0     0    FFFF   0     0     0       0    FIGHTER SELECT
2404   14    0100  0103   0     0    FFFF   0     0     0       0    DOLL SELECT
2405   14    0100  0104   ...
3605   14    0100  0107   0     0    FFFF   0     0     0       0    intro
4010   14    0100  0107   0     0    FFFF   4     0     0       0    life state 4
4011   14    0100  0108   0     0    0002   0     1     0       0    <- LIVES = 2
4678   14    0100  0108   0     0    0002   1     1     0       0    <- MISS 1
4679   14    0100  0108   0     0    0001   0     1     0       0
5073   14    0100  0108   0     0    0001   1     1     0       0    <- MISS 2
5074   14    0100  0108   0     0    0000   0     1     0       0
5386   14    0100  0108   0     0    0000   1     1     0       0    <- MISS 3
5387   14    0100  0108   0     0    FFFF   2     1     0       0    <- STOCK OUT
5388   14    0100  0108   0     0    FFFF   0     0     1       0    CONTINUE window opens
6200   14    0100  0108   0     0    FFFF   6     0     1       0    <- continue EXPIRED
6202   14    0100  0108   0     0    FFFF   0     0     0       0
6203   2     0     0108   0     0    FFFF   0     0     0       0    <- back to TITLE
6205   3     0     0108   0     0    FFFF   0     0     0       0    1 credit left
```

**CONFIRMED by this run, each against the listing above:**

1. `$812E56` is the mode word and its values are 0 → 13 → 2 → 3 → 14. The
   warning screen (13) really is the first mode.
2. `$812E5A` = the join mask; it reads `$0100` as a word because it is a
   **byte** — P1 = `$01`. So a port must not treat `$812E5A` as a word.
3. `$812EA0` (byte) = joined, `$812EA1` (byte) = the select state, and the
   sequence 0 → 1 → 3 → 4 → 7 → 8 is exactly the table in §2 (states 2, 5 and 6
   last less than one logic frame and never appear at the sample point — a port
   that only ever samples once per frame will never see them, which is worth a
   named test).
4. `$8130BE` = **lives**, `2 → 1 → 0 → $FFFF` over three deaths.
   `$80380E` (the lives DIP) is 0 on the default machine → 2 spare lives.
5. `$8130FA` = the life state, `4` for the first spawn, `1` for each miss, `2`
   when the stock runs out, `6` when the continue window expires, `9` for one
   frame after a spawn.
6. `$81308C` = ships alive, `$8130D2` = "nobody on screen".
7. **The continue window is `lf 5388 .. 6199` = 812 logic frames ≈ 13.7 s.**
8. `$8130CC` stayed 0 for the whole run — nobody continued.
9. `$813092` (stage) and `$813098` (loop) stayed 0, consistent with never
   leaving stage 1 of loop 1.
10. Independently, the snapshot run's `flow_lf006750.png` shows the title with
    `CREDITS:1` — two separate runs, same conclusion.

**And the mode machine dies when the game starts.** `$25AC92` (mode $E) calls
`$24107C`, which is a **destroy-every-object**: it zeroes all 20 type words,
all 20 priority words and all 20 IDs, and resets `$80E882`, `$80E880`,
`$80DBAC`, `$80E23E`. The type-8 director erases itself, so `$25AC92` runs
exactly once and `$812E56` sits at 14 as a **stale value for the entire game**.
It is the object table, not the mode word, that carries the state during play.
A port that drives gameplay off `$812E56` will be driving off a corpse.

## 10. THE STAGE SCRIPT — object type 6, `$28D63C`, `($6,A5)` sub-state

`$2429C4` (the stage starter, called from the debug warp) ends in
`move.w #$6,D0 / jsr $241182 / move.w D7,($4,A0)`. Type 6 is `$28D63C`:

```
28d566: ($2,A5)=0 entry: ($6,A5)=0, ($7,A5)=4, $28D552 (clear $81DEBE..),
        $287DC8, bset 0 and 3 of $81DF1E, $28E7A2,
        $81DF20 = 1, $81DF22 = 1, clear $81B414/16/18/1A, ...
        $812970 = 1
28d64c: per frame: $28EDC0
28d652: ($6,A5)==4 and $28E7E6 carry-clear -> ($2,A5)=2      STAGE OVER
28d66a: ($6,A5)==3 -> $25FD38 (the per-stage reset), $81DF1E &= $FC,
        $812972=0, ($6,A5)=4
28d68e: ($6,A5)==2 -> jsr $25FD0C with ($4,A5)      <-- SETS THE STAGE INDEX
        $27F8C4, $81DF22=0, $28EDB6, $28E7DC, $287DDC, $812970=0, ($6,A5)=3
28d6ce: ($6,A5)==$15 -> $28D9AA with A6=$81DEBE
28d6e4: ($6,A5)==$B  -> $28D9AA, then ($8,A5) through $24681A
28d5e6: ($2,A5)==2  -> clear $81DF1E, clear $81DF20, jmp $241292  (self-delete)
```

So `$25FD0C` has **two** callers, not one: `$2606CE` (type-10 init, PC-relative
`bsr`, the first stage) and `$28D69C` (type 6, absolute `jsr`, every subsequent
stage). The earlier "exactly one caller" line in §3 was a PC-relative scan and
it was incomplete; this is the correction, and it is the mechanism by which the
stage index advances.

`$81DF20` is 1 while a stage script is live. `$28D53C` returns CARRY when
`$81DF20 != 0`, and **both** the continue banner (`$28864C`) and the debug
stage warp (`$259DA6`) are gated on it — the same interlock, two users.

`$28D5FA` is the big teardown: `$24631C`, `$24107C` (destroy everything),
`$28D552`, `$27F8C4`, `$287DDC`, `clr.w $8130F8`, `$25313E`, `$25318E`,
`$81B6EE = 0`, then `jmp $241182` with type 7 (`$290BE8`, priority $1E).

## 11. WHAT I RULED OUT, and what I could NOT reach

**Ruled out by measurement or by the listing:**

* **`$813098` is not a demo/attract flag.** I believed that for about an hour
  because of the `tst.w $813098 / bne <skip the select screens>` sites. It is
  the **LOOP INDEX**: `$287C3E` writes it into the ranking record as the "loop
  reached" field beside `$813092` as the "stage reached" field, `$259DC6` sets
  it to 1 for the warp targets named `STAGE R1..RE`, and `$249F34` uses it to
  add the score increment a second time. Skipping the select screens in loop 2
  is correct behaviour, not demo behaviour.
* **The score is not four bytes.** `$81B440` is 8 BCD digits and `$81B44C` is a
  ninth, capped at 9 with `$99999999`. A port with a 32-bit BCD score cannot
  represent the reported 350,000,000 threshold; this one can.
* **`$812EA0+$56` is not the running score.** It is initialised to `$FFFFFFFF`
  and the watch shows it holding `$36000066`-shaped values during the intro —
  it is reused as animation state. The running score is `$81B440`.
* **Object dispatch stride is 8, not 4.** Re-derived from `lsl.w #3,D1`.
* **`$803808 == $12`** gates the start check at `$25A796`; I did not identify
  what `$803808` is, only that the check exists.

**Could NOT reach — measurement proves presence, only the listing proves
absence, so these are gaps in MY work, not statements about the cartridge:**

1. **THE BEES. Not found at all.** What I tried: (a) a full ASCII sweep of
   `$230000-$290000` for `BEE`/`PERFECT`/`BONUS`/`SPECIAL` — the sweep found
   the stage names, the service menu, `CONTINUE`, `GAME OVER`, `FIGHTER
   SELECT`, `DOLL SELECT` and the two `NO EXTEND` strings, and **no bee string**
   (which proves nothing: the bee is a sprite, not text); (b) the constant hunt
   in (2) below; (c) `xref.py abs` on every global in `$8130xx` that the stage
   reset clears. I never located a bee object, a bee counter, a per-stage bee
   table or the laser reveal. **A corpus that never fires the laser cannot even
   confirm the mechanic exists.** This is the single biggest hole in this log.
2. **The loop-2 decision routine. NOT FOUND, and here is the negative result
   that matters:** a byte-level search of the whole 6 MiB image for
   `35000000` (BCD 350,000,000), `14DC9380` (binary), `0350000000` and
   `03500000` returns **30 / 0 / 0 / 16 hits and every single one disassembles
   as data, not as an operand of a compare** (`$26B50A`, `$22B292`, `$230392`
   are typical: all inside index tables of consecutive small integers). So
   **there is no plain `cmpi` against 350,000,000 anywhere in this ROM.** That
   is evidence against the "≥350,000,000 points" condition being implemented
   the obvious way in Black Label — consistent with the third-party note that it
   may be White Label only — but it is NOT proof of absence: the compare could
   be against a table entry, or digit-by-digit, or on the 9th-digit word
   `$81B44C` alone (a `cmpi.w #$3` there would be indistinguishable from a
   hundred other small compares).
3. **The miss counter, the bomb counter and the bee-perfect counter.** I found
   the LIVES word and the stock reload; a *cumulative* miss counter that
   survives a respawn is a different variable and I did not find it. Candidates
   I did not resolve: `$813142` (`subq.w #1` at `$260112`, one per spawn — it
   moves the right way but I never saw it non-zero), and the block
   `$81308C..$8130BC` that `$2603DA` clears wholesale at loop start.
4. **The normal loop-1 → loop-2 transition.** `$813098` is READ at 130
   build-B sites and WRITTEN by exactly two instructions, `$259DB0` and
   `$259DC6`, **both inside the debug stage-warp**. I ran an opcode-form scan
   for every write addressing mode with an absolute-long operand
   (`move.w Dn,`, `move.w #imm,`, `addq`, `subq`, `clr`, `addi`, `andi`, `ori`,
   `bset/bclr/bchg`) — two hits, both in the warp. **A write through an address
   register is invisible to that scan**, and there is no `lea $813098` anywhere
   in build B either, so if the normal transition exists it uses a base register
   loaded from somewhere I did not follow. I did not reach loop 2 and I did not
   find the branch that grants it.
5. **Life states 5, 7, 8 (`$2602B6`, `$26035A`, `$26037C`)** were never
   entered in the measured run and I did not disassemble them. State 6
   (`$260348`) I only identified from the measurement (continue expiry), not
   from its listing.
6. **`$288610`'s banner states 2, 3, 4** (`$28871C`, `$28875E`, `$288952`) —
   named, not read.
7. **The CONTINUE-accept path.** I found the banner, the countdown digit
   (`($a,A4)`), the `$28D53C` interlock and the 812-frame window by measurement,
   and `$23C98E`/`$23C9F0` as the credit consumers — but I never scripted a
   START press inside the window, so **I have not measured a continue actually
   happening**, and therefore have not measured what `$8130CC` becomes or
   whether life state 4 is what a continue takes.
8. **`$C08006` bit 7.** The debug warp's enable. I did not measure its value on
   this machine, did not poke it, and did not drive the warp. Everything in §6
   about the warp is READ FROM THE LISTING ONLY.

## 12. `NOTES-progression.md`, line by line

| claim | verdict |
|---|---|
| the oracle can coin-feed through deaths | **CONFIRMED in principle**: `$23C98E`/`$23C9F0` are the credit consumers, `$25ACAC` and `$25CBB8` the two entry points, and the measured run shows an unattended game ending with 1 credit still in the machine. Not yet demonstrated end-to-end. |
| continuing disqualifies loop 2 | **UNRESOLVED.** `$8130CC` exists, is set by `ori.b #1/#2` at `$260080`/`$260096` and `$28F32C`/`$28F348`, and stayed 0 in a run with no continue. I did not find anything that reads it against a loop decision. |
| a miss is not a continue | **CONFIRMED structurally**: a miss is `subq.w #1,$8130BE` in life state 1; running out is life state 2; they are different states with different code. |
| ≤2 misses / ≤3 bombs / Bee Perfect ×3 / ≥350,000,000 | **NOT FOUND.** See §11.2 and §11.3. The score threshold specifically: no plain compare against that constant exists in the image. |
| 5 stages | **CONTRADICTED as stated**: the game's own selector names **six** per loop — `STAGE 1..5` plus `STAGE E` — and two loops, `STAGE R1..RE` (`$259F44`, 12 × 10 bytes). |
| 10 hidden bees per stage, laser-revealed, cross-stage carry | **NOT FOUND.** §11.1. |
| scoring is a progression input | **UNRESOLVED**, but the score representation (9 BCD digits) is now measured and does have the range. |
| extend exists | **CONFIRMED and it was not in the notes**: `$28433C`, threshold `$81B4AC`, `$FFFFFFFF` = disabled, lives capped at `$14` = 20, and the service menu carries `2. EXTEND` with `OLD:`/`NEW:` variants. |

## 13. If someone picks this up cold

```
python games/ddpdoj/tools/flowrecon.py snaps 7000 "" 500      the timeline, 12 PNGs
python games/ddpdoj/tools/flowrecon.py watch "mode=812E56,join=812E5A,p1blk=812EA0,\
  stage=813092,f3098=813098,liv1=8130BE,lst1=8130FA,alive=81308C,alldead=8130D2,\
  cont=8130CC,rank=81309E" 7000                               the state changes
python games/ddpdoj/tools/oracle/xref.py ptrtable 240F62 8 20  the object table (STRIDE 8)
python games/ddpdoj/tools/oracle/xref.py dasm 25A770 200       the mode machine
python games/ddpdoj/tools/oracle/xref.py dasm 25CACA 420       the select director
python games/ddpdoj/tools/oracle/xref.py dasm 25FF7A 300       the life machine
python games/ddpdoj/tools/oracle/xref.py dasm 2842B0 200       score + extend
python games/ddpdoj/tools/oracle/xref.py dasm 259D04 200       the DEBUG STAGE WARP
python games/ddpdoj/tools/oracle/xref.py dasm 28D63C 200       the stage script
```

**The address card:**

```
$812E56 w  mode 0..14          $8130BE w  P1 LIVES      $81B440 l  P1 score, 8 BCD digits
$812E58 w  mode timer          $8130C0 w  P2 LIVES      $81B44C w  P1 score, 9th digit
$812E5A b  join mask           $8130C2 w  P1 lives ->L2 $81B444 l  P2 score
$812EA0 .. $70   P1 select     $8130C4 w  P2 lives ->L2 $81B44E w  P2 9th digit
$812F10 .. $70   P2 select     $8130C6 l  game frames   $81B4C0 l  P1 pending increment
  +$01 b state 0..8            $8130CC b  continued?    $81B4C4 l  P2 pending
  +$2E w BCD select timer      $8130D2 w  nobody alive  $81B4AC l  P1 extend threshold
$8130FA .. $24   P1 life       $8130D4 w  death pause   $81B4B0 l  P2 extend threshold
$81311E .. $24   P2 life       $81308C w  ships alive   $81B4A0 l  P1 high score
  +$00 w state 0..9            $813092 w  STAGE 0..5    $81B706 .. $16  P1 banner
  +$08 l -> the lives word     $813098 w  LOOP 0/1      $81B71C .. $16  P2 banner
  +$18 l -> the ship object    $81309E w  live rank     $81DF20 w  stage script live
$80380C b  operator RANK       $80380E b  operator LIVES DIP (table $2600CE: 2,3,4,0,1)
```

**Six things that will save you the hours they cost me:**

1. **The object dispatch table's stride is 8.** Read it with stride 4 and every
   type index is doubled and every priority looks like a pointer.
2. **`$812E56` is dead during gameplay.** `$24107C` destroys the object that
   drives it. The mode word is a boot/attract mechanism only.
3. **`$813098` is the LOOP, not a demo flag.** It doubles the score, it changes
   where the lives stock comes from, and it skips the select screens.
4. **The lives word is reached through a POINTER** at `+$08` of the life block,
   and the block's parameter table is at `$25FE22`. Do not hard-code `$8130BE`
   into the death path; the board does not.
5. **`$FFFF` is "stock exhausted", `0` is "last ship".** `tst.w / bpl` — zero is
   still alive. An off-by-one here is a whole extra life.
6. **The game names six stages per loop, not five.** `STAGE E` is in the
   selector table with the others.

