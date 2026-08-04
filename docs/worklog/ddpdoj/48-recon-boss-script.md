# W48 RECON — stage-1 boss `$292902` and the `$294AD8` "script format"

status: **DONE** — see the WAVE ESTIMATE at the foot. Headline: **the brief's
premise is wrong — `$294AD8` is not a script interpreter and there is no opcode
set**; the format is a task scheduler (`$259554`/`$25962E`) over INIT/STEP
pointer pairs, the stage-1 boss's five tables hold **52 script ids / 111 entry
points, 0 ported**, its static closure is **257 routines / 31,768 B**, and it
reaches bullet kinds **9 and 11** at 10 sites — the first execution of any of
W27's 29 transcribed bodies.

wave: 48. role: RECON (READ-ONLY; the only file I write is this one).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address below is
build B (`$23xxxx..$2Axxxx`) unless a line says otherwise.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` — the decrypted build-B
image, **address == file offset**, 6,291,456 B, produced by `derive.py`
(gitignored). Disassembly: `tools/oracle/w27disasm.py` (capstone 5.0.7,
`CS_MODE_M68K_030`); cross-references: `tools/oracle/xref.py`.
Concurrency: an implementer is editing `games/ddpdoj/src/` and `tools/` while I
read. **I read `src/` only to state what is and is not ported, and every such
statement is a snapshot of a tree that may be mid-edit.**

---

## 0. THE HEADLINE, AND THE BRIEF'S PREMISE

**THE BRIEF'S PREMISE IS WRONG IN ITS CENTRAL WORD, AND THE CORRECTION IS GOOD
NEWS.** The brief — and W36 §2.2, W28 §6 and W33 §8 behind it — call `$294AD8`
"the boss BRAIN / the installed script tables" and ask for "the opcode set,
operand layout, record stride, terminator, and how the interpreter walks it",
with the 7-opcode scroll VM as the precedent to match.

**There is no bytecode and there are no opcodes.** I looked for them and §1.5
says exactly where I looked. What is there is a **cooperative task/coroutine
scheduler living in RAM at `$812980..$812E07`**, installed by **`$259554`**,
stepped once per logic frame by **`$25962E`** — and the "scripts" are ordinary
68000 subroutines reached through **pointer-PAIR tables**, one (INIT, STEP) pair
per script id, 8-byte stride.

So the enumerable inventory is not an opcode set. It is:

- **one scheduler**, `$259554..$259C1F`, 27 routines, shared by **five bosses**
  (`$259554` has exactly five callers, §1.1);
- **five tables per boss**, and for the stage-1 boss they are
  `$293104` / `$295856` / `$292932` / `$29370A` / `$294F68` (§2), holding
  **52 script ids and 7 object routines** — a complete, closed, countable list.

`$294AD8` is not the interpreter either. It is the boss's **per-frame damage and
part-destruction routine** (§3.2): three destructible parts, three HP longwords,
three death chains, and the whole-boss death chain at `$294DD4`.

**`$292902` really is ten instructions** — W36 §2.2 is right about that, and §3.1
reproduces it.

---

## 1. THE SCHEDULER — `$259554..$259C1F`

### 1.1 Five callers of the installer, i.e. five bosses

`python xref.py callers 259554` — absolute-long `jsr`/`jmp` only, so a LOWER
BOUND (the `xref.py` rule):

```
$29272E   <-- the STAGE-1 BOSS's init body $2926E2, see §3.0
$297174
$29BC3E
$29ECC4
$2A432E
```

Five sites, all in the boss bank. DaiOuJou has five stages. **I did not confirm
which of the other four belongs to which stage** and did not try.

### 1.2 `$259554` — THE INSTALLER. Five tables in five address registers.

```
$259554 movem.l d0-d7/a0-a6,-(a7)
$259558 lea $812980,a6
$25955E move.w #$243,d0
$259562 move.w #0,(a6)+ / dbra d0            <-- clears $243+1 = 580 WORDS
                                                 = $488 B: $812980..$812E07
$25956A a0 != 0 ?  -> $812984 := a0 ; $81298A := $FFFF   MAIN table
$259582 a3 != 0 ?  -> $812A70 := a3                      table D
$259592 a1 != 0 ?  -> $812BD4 := a1                      table E
$2595A2 a2 != 0 ?  -> $8129CC := a2, then the COPY LOOP: OBJECT list
          $2595B8 move.l (a2)+,d0
          $2595BA cmpi.l #$FFFFFFFF,d0 / beq       <-- THE ONLY TERMINATOR
          $2595C4 move.w #$8000,(a6)               <-- status: allocated, DISARMED
          $2595C8 move.l d0,$2(a6)                 <-- the routine pointer
          $2595CC lea $8(a6),a6                    <-- stride 8
$2595D2 a4 != 0 ?  -> $812D38 := a4                      table F
$2595E2 movem.l (a7)+,d0-d7/a0-a6 / rts
```

**A null pointer in any of the five registers means "this boss has no table of
that class"**; the base longword stays 0 and every runner tests its base for 0
first. That is the whole optional-table mechanism, and it is why a port must
model five independently-present tables rather than five mandatory ones.

### 1.3 THE RAM BLOCK — `$812980..$812E07`, `$488` bytes, cleared on install

Every offset below is one I read out of an instruction this session.

| RAM | size | what |
|---|---|---|
| `$812980` | w | MAIN: "a start is pending" |
| `$812982` | w | MAIN: the pending script id |
| `$812984` | l | MAIN table base (A0) |
| `$812988` | w | MAIN: sub-offset in the entry — 0 (INIT) or 4 (STEP) |
| `$81298A` | w | MAIN: current id, **`$FFFF` = none** |
| `$81298C..$8129AB` | $20 | MAIN: the live 16-word local block (A4 for main scripts) |
| `$8129AC..$8129CB` | $20 | MAIN: the 16-word ARGUMENT staging block — `$2598D0` returns A0 = here |
| `$8129CC` | l | OBJECT list base (A2) |
| `$8129D0..$812A6F` | 20 × 8 | OBJECT slots: status word, routine ptr at `+2` |
| `$812A70` | l | table D base (A3) |
| `$812A74..$812BB3` | 10 × $20 | table D channels |
| `$812BB4..$812BD3` | $20 | table D OVERFLOW block (`$2599A8`) |
| `$812BD4` | l | table E base (A1) |
| `$812BD8..$812D17` | 10 × $20 | table E channels |
| `$812D18..$812D37` | $20 | table E OVERFLOW block (`$259A3E`) |
| `$812D38` | l | table F base (A4) |
| `$812D3C..$812DDB` | 5 × $20 | table F channels |
| `$812DDC..$812DFB` | $20 | table F OVERFLOW block (`$259832`) |
| `$812DFC` `$812DFE` `$812E00` `$812E02` `$812E04` | w | the `$259B7E`/`$259BB4` timed effect |
| `$812E06` | w | GLOBAL SUSPEND — `$2595E8` sets it; `$25962E` then returns C=1 having done nothing |

**The three OVERFLOW blocks are why "the table is full" is silent rather than a
crash.** `$25980C`, `$259962` and `$259A18` walk their slot array for a free
one and, finding none, return A0 pointing at a `$20`-byte scratch block that no
runner ever visits. The start request is DROPPED. **A port must reproduce the
drop, not grow the array** — this is exactly the shape of defect W33 §4 found in
the sub-record pool.

### 1.4 THE CHANNEL RECORD — `$20` bytes; the status word IS the format

```
+$00  w   STATUS.  bit15 = allocated (the start call writes `id | $8000`)
                   bit 0 = "INIT has already run"   (bset at dispatch)
                   bit 1 = a per-channel user flag  (tables D/E only)
                   low byte = THE SCRIPT ID
+$02 .. +$1F      $1E bytes of script-private state, laid out by the script.
                  Observed in the stage-1 boss: `$2(a4)` a frame countdown,
                  `$4(a4)` `$6(a4)` `$8(a4)` per-script parameters.
```

**A script ENDS by `clr.w (a4)`.** Status 0 means free. The idiom
`42 54 4E 75` = `clr.w (a4) / rts` sits immediately before the first routine of
table D (`$2937B2`) and of table E (`$2958CE`) — the shared "script done" tail,
and a useful landmark for bounding the tables.

### 1.5 THE DISPATCH — the "record stride" and the "terminator"

Identical in all four channel classes (table F shown, `$2596D8`):

```
$2596D8 move.w (a4),d0            status
$2596DA beq  <next slot>          0 = free
$2596DE andi.w #$FF,d0            <-- THE ID IS THE LOW BYTE. 256 ids possible.
$2596E2 lsl.w #3,d0               <-- STRIDE 8
$2596E4 bset.b #0,(a4)
$2596E8 beq  +4                   first call?   -> use entry +0
$2596EC addq.w #4,d0              already run   -> use entry +4
$2596EE movea.l $812D38,a0
$2596F4 movea.l (a0,d0.w),a0
$2596FA jsr (a0)                  a4 = channel record, d7 = slot index
```

> **The "record" is A PAIR OF LONGWORDS per script id: `[+0]` runs on the first
> frame after the start call, `[+4]` on every frame after that.** There is no
> terminator inside these tables — **their extent is bounded by where their own
> code begins**, which is how I bounded all four (§2). The only terminator in
> the whole format is the `$FFFFFFFF` ending the A2 OBJECT list.

**WHAT I LOOKED FOR AND DID NOT FIND** (stated the way `docs/knowledge` requires).
I read every instruction of `$259554..$259C1F` looking for a byte/word
fetch-and-switch: a `move.b (An)+,Dn` feeding a jump table, a `dbra` over a
stream, any stride other than 4 / 8 / $20. **There is none in that range.** The
only pointer indirections are `movea.l (a0,d0.w),a0` with `d0 = id<<3 (+4)` and
`movea.l $2(a4),a3`. I did NOT read the other four bosses' tables, so I cannot
say no boss anywhere carries a byte stream; I can say **the SCHEDULER has no
opcode fetch**.

### 1.6 `$25962E` — the per-frame entry, and it can run the scripts TWICE

Called by `$292902`; returns the carry flag the boss handler branches on.

```
$25962E tst.w $812E06  != 0 -> ori #1,sr (C=1), RTS        global suspend
$25963E tst.w $8130D2  != 0 -> skip to $259682             (pause)
$259648 bsr $2596C6                                        <-- PASS 1
$25964C btst #6,$8130F8   set   -> skip     (set by $294DD4, the boss death)
$259656 btst #4,$8130F8   clear -> skip
$259660 d0 = $81B63E | $81B640 ; == 0 -> skip
$25966E tst.w $81309C     minus -> skip
$259676 tst.w $80390C     == 0  -> skip
$25967E bsr $2596C6                                        <-- PASS 2
$259682 if $8129CC != 0: the 20 OBJECT slots at $8129D0, stride 8, running
          those with bit15 SET **and bit0 SET**, a3 := $2(a4), d7 = $13..0
$2596BC bsr $259BB4                                        the timed effect
$2596C0 andi #$FFFE,sr (C=0) / rts
```

`$2596C6` runs, IN THIS ORDER: **table F (5) → the MAIN script (1) → table E
(10) → table D (10)**. Order within the frame is semantics here (HANDOVER §8.3),
and it is **not** the order the tables are installed in.

Two consequences a port must not miss:

1. **The OBJECT slots still run when the double pass is skipped and when
   `$8130D2` pauses** — `$259644`'s branch goes to `$259682`, not to the `rts`.
2. **`$8130F8` bit 6 is set by `$294DD4`**, the boss death chain, so the "run
   the scripts twice" arm switches itself off the instant the boss dies.

### 1.7 THE COMPLETE API — 27 routines, all read this session

| routine | class | what it does |
|---|---|---|
| `$259554` | — | install the five tables |
| `$2595E8` | — | `$812E06 := 1` — SUSPEND the whole scheduler |
| `$2595F2` | — | difficulty/spread index — **always returns 4, see below** |
| `$25962E` | — | the per-frame entry (§1.6) |
| `$2596C6` | — | one pass over F, MAIN, E, D |
| `$25980C` | F | start id d0 in the first free of 5 |
| `$25983E` | F | is id d0 running? C=1 yes |
| `$259876` | F | stop id d0 |
| `$2598A2` | F | stop ALL 5 |
| `$2598BE` | MAIN | stop (`$81298A := $FFFF`) |
| `$2598C8` | MAIN | read the current id into d0 |
| `$2598D0` | MAIN | request start of id d0; returns **a0 = `$8129AC`** |
| `$2598E6` | OBJ | ARM object index d0 (`ori.w #1`) |
| `$2598FE` | OBJ | arm every allocated object |
| `$259924` | OBJ | disarm every allocated object |
| `$25994A` | OBJ | disarm object index d0 |
| `$259962` | D | start id d0 in the first free of 10 |
| `$2599B4` | D | is id d0 running? |
| `$2599EC` | D | stop id d0 |
| `$259A18` | E | start id d0 in the first free of 10 |
| `$259A4A` | E | is id d0 running? |
| `$259A82` | E | is id d0 running **and** its bit1 set? |
| `$259AC2` | E | clear bit1 on every channel of id d0; C=1 if any matched |
| `$259B08` | E | stop id d0 |
| `$259B34` | E | stop ALL 10 |
| `$259B50` | E | set bit1 on every channel of id d0 |
| `$259B7E` | fx | arm: `$812DFE:=d0, $812DFC:=1, $812E00:=$1C00, $812E02:=1` |
| `$259B9E` | fx | is the effect running? |
| `$259BB4` | fx | step it (tail of `$25962E`) |

`$259554..$259C1F` is **$6CC = 1,740 bytes** by that bound; the last routine
`$259BB4` runs past `$259BFC` and I have not walked it to its `rts` (§9).

**A GENUINE ODDITY, AND IT IS NOT AN ARTEFACT OF SOMETHING BEING UNPORTED.**
`$2595F2` — which the boss calls at `$295018` to pick an index from `$80380C`
and `$81309E` — computes an elaborate clamped value across four branches and
then **every path falls into `$25962A moveq #$4,d0`**, which discards it.
`$2595F2` ALWAYS RETURNS 4. Bytes: `$259628 = 70 07` (`moveq #7,d0`, 2 B), then
`$25962A = 70 04`. Nothing branches over `$25962A`. **A port must return the
constant 4 and cite this**; a port that implements the arithmetic will be wrong.
This is the `docs/knowledge/02` fall-through trap wearing a different hat — the
computed value looks like the answer and the last two bytes decide it.

---

## 2. THE STAGE-1 BOSS'S FIVE TABLES — the complete inventory

Installed at `$292710..$29272E` (§3.0). Each extent is bounded by where that
table's own first routine begins; I checked the boundary longword decodes as
code in every case.

| reg | RAM base | class | extent | ids | pointers |
|---|---|---|---|---|---|
| A0 | `$812984` | MAIN | `$293104..$29314B` = $48 B | **9** | 18 |
| A1 | `$812BD4` | E | `$295856..$2958CD` = $78 B | **15** | 30 |
| A2 | `$8129CC` | OBJECT | `$292932..$29294D` + `$FFFFFFFF` | **7** | 7 |
| A3 | `$812A70` | D | `$29370A..$2937B1` = $A8 B | **21** | 42 |
| A4 | `$812D38` | F | `$294F68..$294F9F` = $38 B | **7** | 14 |

**52 script ids, 104 pointers, plus 7 object routines = 111 entry points.**

### 2.1 A2 — the OBJECT list, `$292932`

```
$292932: 00292972  00292B08  00292952  00292BFA
$292942: 00292E0A  00292E3E  00292F4A  FFFFFFFF
```
Seven routines, index 0..6. **Index 6 = `$292F4A` is the only one the init arms**
(`$292734 moveq #6 / jsr $2598E6`); the other six are installed with bit 0 clear
and stay dormant until some script arms them.

### 2.2 A4 — table F, `$294F68`, 7 ids

| id | INIT | STEP |
|---|---|---|
| 0 | `$294FA0` | `$294FA6` |
| 1 | `$295002` | `$295120` |
| 2 | `$2952D8` | `$295304` |
| 3 | `$29540C` | `$295432` |
| 4 | `$29554A` | `$29556C` |
| 5 | `$295616` | `$295626` |
| 6 | `$295684` | `$2956F6` |

**Id 0 validates the whole reading of the format.** `$294FA0 move.w #$C0,$2(a4)`
(INIT: load a 192-frame timer) falls straight through into
`$294FA6 subq.w #$1,$2(a4) / bne.w $294FC8` (STEP: count it down); on expiry it
does `moveq #0,d0 / jsr $2598D0` (start MAIN script 0), loads stream `$13` from
`$222AF8` via `$24150A`, and `clr.w (a4)` — the channel retires itself. INIT at
`+0`, STEP at `+4`, and STEP is INIT plus the length of the init-only prologue.

### 2.3 A0 — the MAIN script table, `$293104`, 9 ids

| id | INIT | STEP |
|---|---|---|
| 0 | `$293204` | `$29321C` |
| 1 | `$2933C2` | `$2933C2` |
| 2 | `$293420` | `$293432` |
| 3 | `$2934A2` | `$2934AC` |
| 4 | `$2934F8` | `$293506` |
| 5 | `$293578` | `$29359E` |
| 6 | `$2935DE` | `$2935E8` |
| 7 | `$293634` | `$293642` |
| 8 | `$2936B4` | `$2936BE` |

Id 1's two pointers are EQUAL — a script with no separate init.

### 2.4 A3 — table D, `$29370A`, 21 ids

| id | INIT | STEP | | id | INIT | STEP |
|---|---|---|---|---|---|---|
| 0 | `$2937B6` | `$2937CC` | | 11 | `$294512` | `$29451A` |
| 1 | `$293800` | `$293816` | | 12 | `$29475E` | `$294772` |
| 2 | `$29384A` | `$293852` | | 13 | `$2947E8` | `$2947FC` |
| 3 | `$29387C` | `$293884` | | 14 | `$294566` | `$294658` |
| 4 | `$29393A` | `$293966` | | 15 | `$294872` | `$294878` |
| 5 | `$293B82` | `$293BAE` | | 16 | `$2948B6` | `$2948C4` |
| 6 | `$293DC6` | `$293E04` | | 17 | `$29492E` | `$29493C` |
| 7 | `$2943B0` | `$2943B0` | | 18 | `$2949A6` | `$2949BA` |
| 8 | `$2943EE` | `$2943FC` | | 19 | `$294A30` | `$294A44` |
| 9 | `$294466` | `$294474` | | 20 | `$294ABA` | `$294AC0` |
| 10 | `$2944DE` | `$2944E6` | | | | |

Id 7's pointers are equal. Id 14's pair is out of address order — the STEP
(`$294658`) is far from the INIT (`$294566`) — which is a reason to read that
one carefully rather than assume adjacency.

### 2.5 A1 — table E, `$295856`, 15 ids

| id | INIT | STEP |
|---|---|---|
| 0 | `$2958F2` | `$295948` |
| 1 | `$295A7E` | `$295AE0` |
| 2 | `$295CAC` | `$295CD8` |
| 3 | `$295E0E` | `$295E5E` |
| 4 | `$295F44` | `$295F94` |
| 5 | `$296082` | `$2960F4` |
| 6 | `$296188` | `$296200` |
| 7 | `$296294` | `$2962BA` |
| 8 | `$296362` | `$2963A2` |
| 9 | `$2964BE` | `$2964DA` |
| 10 | `$29655E` | `$296580` |
| 11 | `$2965F8` | `$296614` |
| 12 | `$29669C` | `$2966B8` |
| 13 | `$296752` | `$296790` |
| 14 | `$2968E6` | `$2968FE` |

**Table E is where the boss's own spawns are.** W36 §2.3 measured type `$1E`
being enqueued at `$2963C2 $2963F4 $29642C $29645E` — all four inside table E
id 8's STEP routine `$2963A2`.

---

## 3. THE BOSS ITSELF

### 3.0 `$2926E2` — the init body (type `$0E`), and where the tables come from

Already in the port as a `note()` (`src/initbody.js:654`, read at a moment when
an implementer may have been editing it). What it actually does:

```
$2926E2 lea $292806(pc),a0 / nop / jsr $2637A2      the PROTOTYPE loader (W23)
$2926EE lea $2927F6(pc),a0 / nop / moveq #7,d0
        jsr $26377A                                 SEVEN sub-records
$2926FE move.l #$97FFFE00,$2(a6)                    fixed entry position
$292706 move.w $813172,d0 / sub.w d0,$4(a6)         Y relative to the SCROLL
$292710 lea $293104,a0     MAIN table
$292716 lea $295856,a1     table E
$29271C lea $292932,a2     OBJECT list
$292722 lea $29370A,a3     table D
$292728 lea $294F68,a4     table F
$29272E jsr $259554                                 INSTALL
$292734 moveq #6 / jsr $2598E6                      arm OBJECT 6 only
$29273C moveq #0 / jsr $25980C                      start F script 0
$292744..$29278E  five `jsr $24150A` stream loads, ids $15 $16 $17 $12 $11,
        from $222B38 $222B78 $222BB8 $246BF8 $222C38
$292794 bset #0,$8130F8 / bset #2,$8130F8 / bset #0,$8130F9
$2927AC move.l #$1A0,$81B626                        <-- 416, the HP-BAR MAX
$2927B6 lea $16(a5),a0 / move.l a0,$81B62A           <-- the HP-BAR SOURCE ptr
$2927C0 jsr $294AD6         <-- **A BARE `rts`.** See below.
$2927C6 jsr $294EEA         $E8(a6) := 1   (damage suppressed)
$2927CC jsr $294F0A         (a6) = $20(a6) = $60(a6) := $8000  (parts inert)
$2927D2 $81B414 := 1 ; $81B416 := 1
$2927E2 if $813098 != 0 then $81B418 := 1
$2927F4 rts
```

**[M] `$294AD6` IS A BARE `rts`.** The two bytes at `$294AD6` are `4E 75`; the
preceding routine `$294ACE` ends with its own `rts` at `$294AD4`. So
`$2927C0 jsr $294AD6` is a call to nothing. `src/initbody.js:668` currently
`note()`s it as "boss bespoke `$294AD6`/`$294EEA`/`$294F0A` -- W30", which is
right to defer it but will mislead an implementer into looking for a body.
**There is no body.** A port should transcribe it as an empty routine with this
address and this measurement, not merge it into `$294AD8`.

### 3.1 `$292902` — the handler, exactly ten instructions, 46 bytes

```
$292902 jsr $294AD8.l            the boss's DAMAGE / PART-DESTRUCTION pass
$292908 tst.w $24(a5)
$29290C beq.b $292918
$29290E subq.w #$1,$24(a5)       a hit-stop counter, reloaded to $6E by $294AD8
$292912 jsr $243DD0.l
$292918 jsr $25962E.l            THE SCHEDULER, one frame  (C set = suspended)
$29291E bcc.w $292930
$292922 jsr $242952.l
$292928 jmp $263762.l            the enemy-free/mark-dying tail
$29292E nop
$292930 rts
```

`$292930` is the routine's real end; `$292932` is the OBJECT table (§2.1). I
read past it, as `docs/knowledge/02` requires, and the next code is `$292952`,
which is OBJECT index 2.

### 3.2 `$294AD8` — the damage pass. Three parts, three HP words, three deaths.

Not an interpreter. `$294AD8..$294F31`, and its structure is three near-identical
blocks, one per destructible part, at object offsets `(a6)+$00`, `+$20`, `+$60`:

| | part 0 | part 1 | part 2 |
|---|---|---|---|
| hit-flag word | `(a6)` | `$20(a6)` | `$60(a6)` |
| HP longword | `$16(a5)` | `$1A(a5)` | `$1E(a5)` |
| animation byte | `$1D(a6)`, `$BD(a6)` | `$3D(a6)` | `$7D(a6)` |
| accumulated-damage word | `$18(a6)` | `$38(a6)` | `$78(a6)` |
| destroyed flag | `$1F(a6)` | `$3F(a6)` | `$7F(a6)` |
| "critical" HP threshold | `$48CC` | `$3000` | `$3000` |
| death routine | `$294DD4` (whole boss) | `$294E3E` | `$294E94` |

Each block: mask the hit bits (`moveq #$5C,d1 / and.b`, clear with `#$A3`),
`jsr $286096` (the hit effect), flip the animation byte by `eori`, subtract
`$7FFF - accumulated` from the HP **unless `$E8(a6)` is non-zero** (that is the
invulnerability switch `$294EEA`/`$294EF2` toggles), and when the HP goes
negative run that part's death. Below the "critical" threshold **and** with
`$8130CA` clear, the animation byte is forced to `$19`.

**Part 0's death is the BOSS's death** (`$294B9A`/`$294BA4 bra $294DD4`), guarded
by `jsr $2428A6` — when that returns 0 the HP is instead re-floored to `$200`, so
**there is a condition under which the boss cannot die**; I did not read
`$2428A6` (§9).

`$294D70..$294DCC` is the part-destroyed bookkeeping: when both side parts are
gone (`$3F(a6) + $7F(a6) == 2`) it starts F script 5, and each individual
destruction starts F script 4 — this is the **phase driver** (§4).

`$294DCC jmp $294F32(pc)` — **a fall-through the address would not tell you
about**. `$294F32` is a `$8130D2`-gated countdown on `$22(a5)` which, on expiry
and with `$2428A6` non-zero, `jmp $294DD4(pc)` — a **timeout kill**.

`$294DD4` — the whole-boss death chain, in order: `bset #6,$8130F8`,
`bset #7,$8130F8`, `jsr $23C4D0`, `jsr $253564` (clamps `$811F8C` up to `$14`),
`jsr $242922`, `bsr $294F2A`, `bsr $294E3E`, `bsr $294E94` (kill the other two
parts), `jsr $259B34` (E.stopAll), `jsr $2598A2` (F.stopAll),
`$16(a5) := $FFFFFFFF`, `$1F(a6) := 1`, `(a6) := $8000`, `MAIN.start 1`,
`D.start 6`.

### 3.3 SIZE — N of M, with the denominators I counted

`tools/…/w27disasm.py`-based closure walk (`walk.py`, scratch; method: per
routine, closure over its OWN intra-routine branches; `jsr`/`bsr`/`jmp`/tail-`bra`
out of range are CALLS; **`jsr (An)` through a register is invisible, so every
figure is a LOWER BOUND**). Roots: all 111 table entry points plus `$292902` and
`$2926E2`.

```
STATIC CLOSURE FROM THE STAGE-1 BOSS
  257 routines   7,816 instructions   31,768 bytes
    boss-local $292000..$296FFF : 131 routines  4,065 insn  17,592 B
    shared / engine            : 126 routines  3,751 insn  14,176 B
```

**PORTED / UNPORTED, and the denominator is honest about its method.** I have no
machine-readable "is ported" oracle, so I used *"does any `$XXXXXX` in
`games/ddpdoj/src/**/*.js` name this address"* as the test. That OVERSTATES the
ported side (a `note()` or a throw counts) and it is the direction that makes my
"unported" number safe:

| | routines | cited in `src/` | NOT cited |
|---|---|---|---|
| boss-local | 131 | **6** (all of them notes/throws — `$2926E2 $292902 $294AD6 $294AD8 $294EEA $294F0A`) | **125** (16,380 B) |
| shared/engine | 126 | 61 (7,986 B) | **65** (6,190 B) |
| **total** | **257** | 67 | **190 — 22,570 B** |

> **THE BOSS IS 0 OF 111 SCRIPT ENTRY POINTS AND 0 OF 131 BOSS-LOCAL
> ROUTINES PORTED.** The port has 61 of the 126 shared routines it calls.
> Nothing of the scheduler is ported: 22 of the 257 are `$259xxx` and every one
> is in the NOT-cited column.

For scale, `docs/worklog/ddpdoj/28` measured the whole rest of stage 1's
thirteen unported handlers at **2,063 instructions** (that figure is CITED, not
mine). The boss's boss-local code alone is **4,065**, ~2× all of them together.

### 3.4 THE ACTIVATION GRAPH — 134 scheduler calls, every argument resolved

`api.py` (scratch) resolves the immediate reaching D0 at every call to the 27
scheduler entry points inside the closure. **134 sites; every one that takes an
id has a resolved immediate** (the `??` rows are `MAIN.get`, `E.stopAll`,
`F.stopAll` and `SUSPEND`, which take no id). That is the complete wiring
diagram, and it is what makes this boss portable as data rather than guesswork.
The full listing is reproducible from the ROM with that script; the shape is:

- **F (5 slots) is the CONDUCTOR.** Every `MAIN.start` but three comes from an
  F script or from another MAIN script.
- **MAIN (1 slot) is the PHASE.** 9 ids, and the transitions are
  `F0 → MAIN 0`, `MAIN 0 → MAIN 2`, `F1 → MAIN 5`, `F2 → MAIN 8 / MAIN 5`,
  `F3 → MAIN 3 / MAIN 5`, `F6 → MAIN 6`, `MAIN 3 → MAIN 4`, `MAIN 5 → MAIN 2`,
  `MAIN 6 → MAIN 7`, `MAIN 8 → MAIN 4`, and the death chain `→ MAIN 1`.
- **D (10 slots, 21 ids) is the MOVEMENT/limb layer** — ids 0,1,2,3,7 start at
  the arrival, 8/9/12..20 later, and the death chain stops
  0,1,2,3,8,9,10,11,12,13 by name.
- **E (10 slots, 15 ids) is the GUNS.** Every one of the 49 bullet sites is in a
  table-E routine.
- **OBJECT (20 slots, 7 installed)** — index 6 armed at init, then at arrival
  0..5 armed and 6 disarmed; `$293ABA`/`$293CFE`/`$293F20`/`$293F28`/`$293F30`/
  `$294108` disarm 0,1,2,4,5,3 one at a time — **the parts falling off**.

---

## 4. PHASES, AND THE SCROLL

### 4.1 There are phases, and they are driven by the MAIN script id

Nine MAIN ids = nine boss states. The transitions I resolved statically are in
§3.4. The **gates** on those transitions are of three measured kinds:

1. **ARRIVAL.** MAIN 0 (`$293204`/`$29321C`) walks the boss to
   `(d2,d3) = ($5400, $1C00 - $813172)` and counts `$11A(a6)` up in steps of
   `$10`; at exactly `$180` it does the whole arm-up at `$2932D6`:
   `bset #4,$8130F8` (**the flag `$25962E` needs to run the scripts TWICE**),
   `bset #1,$8130F8`, `$81B6E4 := 1`, `MAIN.start 2`, `F.start 1`,
   `$294EF2` (`$E8(a6) := 0` — **damage now lands**), `$294EFA`
   (`or #$A001` into all three part words — **the parts become hittable**),
   `D.start 0,1,2,3,7`, `OBJ.arm 0..5`, `OBJ.disarm 6`.
2. **HP.** `cmpi.l #$48CC,$16(a5)` gates table-E id 0's STEP (`$295948`) and
   ids 11/12's STEPs (`$296614`, `$2966B8`) — i.e. some guns only fire once the
   boss is below `$48CC` HP. `$294AD8` uses the same `$48CC` and `$3000` for the
   "critical" animation.
3. **PART DESTRUCTION.** `$294D70` — one side part gone starts **F 4**, both
   gone starts **F 5**; F 5 and F 6 then re-cut the D and E sets.

**HP is `$1A0` = 416 on the bar** (`$2927AC move.l #$1A0,$81B626`) with the bar
reading `$16(a5)` directly (`$2927B6`).

### 4.2 The scroll — the owner's question, answered and part-unresolved

**The stage-1 boss does NOT stop the scroll. The LEVEL DATA does, before the
boss exists, and the port already models that.** `src/background.js:745` (which
I read, not measured) records the lock as scroll-program record `$261792`,
clock `$0344`: an op-`$0C` FREEZE whose op-`$04` partner armed `loops = $FFFF`,
which the scroll VM can never release from the inside.

What I measured about the boss's side of it:

- The boss's init **READS** `$813172` twice (`$292708`, and `$293224`/`$293264`
  inside MAIN 0) to place itself relative to the frozen camera. **Nothing in the
  257-routine closure WRITES `$813172`.**
- **`$261142` (the external unfreeze), `$261100` (the external speed push),
  `$25FD82`/`$25FD8C` (`$8130D2`) and `$26C7F4`/`$26D254` do not appear anywhere
  in the boss's 257-routine closure.** I checked by exact address against the
  closure list. `$8130D2` appears only as a `tst.w` at `$294F34`, `$296AF8`,
  `$296E94`.
- The death chain's only progress write I can name is
  `$253564 cmpi.w #$14,$811F8C / bcs / move.w #$14,$811F8C` — and `$811F8C` has
  **exactly two absolute-long references in the whole of build B, both inside
  `$253564` itself**, so I cannot say from an absolute-long search who reads it.

> **UNRESOLVED, AND IT IS THE MOST IMPORTANT THING I COULD NOT SETTLE:** *what
> ends stage 1 after the boss dies.* No statically visible path from the boss
> releases the scroll lock. Either the stage transition is driven from outside
> the boss (most likely — `$8130F8` bit 7 is set by `$294DD4` and
> `src/handlers.js:813` already models bit 7 as a "stage kill" gate that frees
> enemies), or the release goes through a `jsr (An)` I cannot see. **What I
> tried:** the full closure walk, exact-address membership tests for all five
> known doors, and an absolute-long xref on `$811F8C`.

So the owner's midboss rule (`20-OWNER-minibosses-stop-the-scroll.md`, and the
`$813172` pinning verified for `$813172` at the midboss) does **not** transfer
to the stage-1 boss as a mechanism: the boss arrives into an already-frozen
camera rather than freezing it.

---

## 5. BULLET KINDS — CONFIRMED. The boss reaches 9 and 11.

`kinds.py` (scratch): linear disassembly of every routine in the closure,
reporting the most recent instruction that WROTE D0 at each `jsr`/`bsr` to one
of the **19 generator entry points** the port already enumerates
(`src/bullets.js`'s `ENTRIES` map). Kind = `D0 & $3F` (`$281564` dispatch).

```
49 UNIQUE generator call sites in the boss's reachable code.
0 UNRESOLVED -- every one of the 49 has an immediate reaching D0.

  kind  3 :  2 sites   $295996 $2959A6
  kind  4 :  2 sites   $296994 $2969FA
  kind  7 :  9 sites   $295DBC $295EE4 $295F28 $29601A $29605E $29632C
                       $296838 $29688C $2968D4
  kind  9 :  8 sites   $296502 $296510 $29651E $29652C
                       $2965B8 $2965C2 $2965CC $2965D6
  kind 11 :  2 sites   $2967D6 $2967EA
  kind 12 :  4 sites   $295C70 $295C7E $295C8C $295C9A
  kind 19 : 22 sites   $296152 $29615C $296170 $29617A $29625E $296268
                       $29627C $296286 $296646 $296652 $29665E $29666A
                       $2966E2 $2966EC $2966F6 $296700 $29670A $296718
                       $296722 $29672C $296736 $296740

generator entries used: $281484(4) $2816F6(12) $281708(7) $281764(16) $2817B8(10)
```

**CONFIRMED, and now from the SITES rather than from an address range.** W33 §8
attributed kinds 9 and 11 to `$292902` "by nearest-preceding-type-table-entry",
called it a lead and said the D0 at those sites was a data read. It is not:
`$2964F2 move.l #$80009,d0`, `$2965A6 move.l #$20009,d0` and
`$2967BA move.l #$FFF9000B,d0` are immediates, and they are the only writes to
D0 before their `jsr`s.

- **kind 9** lives in table E ids **9** (`$2964BE`/`$2964DA`) and **10**
  (`$29655E`/`$296580`);
- **kind 11** lives in table E id **13**'s STEP (`$296790`).

**W27's bodies for kinds 9 and 11 exist and have never executed**:
`src/mover.js:848` `// ----- kind 9 ($2827E0 init / $28281C cont)` and
`src/mover.js:880` `// ----- kind 11 ($2828A0 init / $2828EA cont)`.
**Porting this boss would be the first time any of W27's 29 transcribed bodies
runs anywhere.** The boss's kind set is `{3,4,7,9,11,12,19}` — five of the seven
are already live, and **9 and 11 are the two additions**.

**The boss's own spawned enemy adds nothing.** Type `$1E`'s handler `$296DD6`
(W36 §2.3: enqueued at `$2963C2 $2963F4 $29642C $29645E`, all four inside table
E id 8's STEP `$2963A2`) is a separate closure — **9 routines, 367 instructions,
1,274 bytes**, of which `$23F7C6` and `$296DD6` are new — and its three
generator sites are kinds **3, 4, 5**, all already live
(`$296EBC $296EEA $296F18` → `$2813F0`).

---

## 6. DEPENDENCIES — what the boss needs that the port has not got

**65 shared routines, 6,190 bytes.** Ranked by size, the ones that are
subsystems rather than leaves:

| routine | insn | B | what it is / where it is reached |
|---|---|---|---|
| **`$2440E0`** | 555 | 2,542 | reached ONLY from table-D id 6's STEP `$293E04` — the **death explosion**. It calls `$289004`, the allocator W36 deliberately did NOT port (its only other driver is type-5 call #5 `$288E4E`, and allocating without it rebuilds W33 §4's leak). This is the `$243E7C`/`$2440AE` family `src/midboss.js:177` already `note()`s. **This is L12, the effects subsystem, arriving as a boss dependency.** |
| `$28CF36` | 193 | 558 | via `$28B884`; the `$28Bxxx`/`$28Cxxx` cluster (14 + 7 routines) |
| **`$2596C6`** | 81 | 326 | the scheduler pass itself |
| `$28B4BE` | 62 | 234 | also calls `$289004` |
| `$27E912` | 61 | 218 | under `$287682`/`$287722` |
| `$287722` | 35 | 150 | the `$286xxx`/`$287xxx` effect cluster (17 + 6 routines) |
| `$259BB4` | 24 | 140 | the timed effect, tail of every scheduler frame |
| `$23E3E2` | 43 | 120 | leaf |
| the 20 remaining `$259xxx` | — | ~700 | the scheduler API (§1.7) |

**The live-but-unmodelled reach the brief asked me to check for (the `$26C20C` /
`$900000` shape): I found none.** No routine in the boss's closure writes a
`$900000`-region address by absolute long, and `$26C20C` is not in the closure.
**What I looked at:** the 257-routine list and every absolute-long operand my
walker recorded. `jsr (An)` remains invisible, so this is a lower bound, and
`$2440E0` at 2,542 bytes is the one I have NOT read instruction by instruction —
if a `$900000` write is hiding anywhere, it is in there.

**`$289004` is the hard one and it is not new.** Three of the boss's shared
dependencies (`$2440E0`, `$28B4BE`, and the type-`$1E` closure) reach it, and
W36 §2 carries the owner-visible reason it is deferred.

---

## 7. SIZE IT — the wave estimate

**NOT one wave. THREE, and they have a forced order.**

| wave | scope | why it is its own wave |
|---|---|---|
| **A — THE SCHEDULER** | `$259554..$259C1F`: install, `$25962E`, `$2596C6`, the 27 accessors, the `$812980..$812E07` RAM block, the three overflow blocks, the double-pass gate, the `$2595F2 == 4` constant | ~1,740 B, ~27 routines, **zero boss content**. It is testable on its own (start/stop/full-table-drop/init-vs-step/`clr.w (a4)` retirement), it is shared by all five bosses, and it is the thing every later wave sits on. It also has a genuinely nasty semantic — the ORDER F→MAIN→E→D and the twice-per-frame arm — that deserves its own mutation set. |
| **B — THE BOSS BODY** | the 111 entry points, 131 boss-local routines, 17,592 B, plus the ~40 small shared leaves | This is 2× the code of all thirteen of stage 1's other unported handlers put together (W28's 2,063 instructions, CITED, vs 4,065 measured here). It should be cut by TABLE if it must split — F+MAIN first (the phase machine, 16 ids), then D (21 ids, the limbs), then E (15 ids, the guns and both new bullet kinds). |
| **C — THE DEATH** | `$2440E0` (2,542 B) + `$289004` + the `$28Bxxx`/`$28Cxxx` cluster | This is L12/the effects subsystem, it is the pre-existing `$289004` decision, and it is reached from exactly one script (D id 6). Until it lands, `$293E04` is a loud named throw and the boss simply does not explode. |

**What must ship together:** A and the F+MAIN half of B, or nothing observable
happens. The kind-9/11 payoff is in **E**, so if a wave has to be chosen for
visible value, it is A + F/MAIN + E, with D's limbs and C's explosion after.

**What must NOT be attempted in the same wave:** the scroll release (§4.2) and
the stage transition. They are outside the boss and unresolved.

---

## 8. IMPLEMENTER-READY WORK LIST

1. **Port the scheduler**, `$259554..$259C1F`. Model the RAM block at its real
   addresses (§1.3) — the boss's own code reads `$8129AC` through the pointer
   `$2598D0` returns, so a JS-object channel that is not backed by those
   addresses will diverge the moment a script writes an argument.
2. **Reproduce the three OVERFLOW blocks as DROPS.** A sixth F start, an
   eleventh D or E start, must go nowhere and must be COUNTED (the `spawnEvent`
   precedent from W33 §4 — the check that would have caught the sub-record leak
   four waves earlier).
3. **`$2595F2` returns the constant 4.** Transcribe the arithmetic as a comment,
   return 4, and cite `$25962A`. A test should pin the constant, not the
   arithmetic.
4. **Export the five tables as ROM WINDOWS, not as JS literals** —
   `$293104` ($48), `$295856` ($78), `$292932` ($20), `$29370A` ($A8),
   `$294F68` ($38). They are pointer tables in the cartridge and the port should
   read the pointers out of the cartridge, exactly as `resolveEmitStub` reads
   stub shapes (W36 §4.2). That way a wrong extent throws by address.
5. **Port `$292902` (10 insns) and `$294AD8` (three parts, §3.2) together.**
   `$294AD6` is an empty `rts` — transcribe it as one.
   `$294DCC jmp $294F32(pc)` is a FALL-THROUGH: `$294F32` is a timeout kill and
   is part of the same routine's control flow.
6. **`$2926E2`'s init**: the two loaders are already ported (`$2637A2`,
   `$26377A`), and the HP-bar pair `$81B626 = $1A0` / `$81B62A = &$16(a5)` is
   the boss health bar's whole contract.
7. **F then MAIN then E then D**, in the order `$2596C6` runs them.
8. **Kinds 9 and 11 will execute for the first time** — `src/mover.js:848` and
   `:880`. Expect W27's transcriptions to be exercised, and treat the first run
   of each as a finding, not a pass.
9. **Every unported script id is a loud named throw carrying its table base and
   its id**, so an id the port has not written announces itself as
   `$29370A[14] STEP $294658` rather than doing nothing.

---

## 9. WHAT I COULD NOT DETERMINE

- **What ends stage 1 / releases the scroll lock after the boss dies** (§4.2).
  The single most important open item. What I tried is listed there.
- **`$2428A6`.** It gates whether part 0's death is the boss's death
  (`$294B82`) and it also gates the `$294F32` timeout kill. I did not read it;
  it is 12 instructions, 44 bytes, and it is in the NOT-cited column.
- **`$2440E0`'s 555 instructions.** I have its size, its single caller and its
  onward calls, and I have NOT read its body. My "no `$900000` reach" statement
  in §6 is a statement about absolute-long operands my walker saw, and that
  routine is where a counter-example would hide.
- **Which of the other four `$259554` callers is which stage's boss.** Not
  attempted.
- **What each of the 52 script ids DOES.** I enumerated all 52 and resolved
  every start/stop edge between them (§3.4); I read the bodies of MAIN 0, F 0,
  E 0's HP gate, `$294AD8` and `$294DD4` in full and the rest only far enough to
  resolve their API calls and generator calls. **A wave that ports table D or E
  will be reading 21 and 15 bodies I have only counted.**
- **Whether the double-pass arm at `$25967E` ever fires.** Its five conditions
  include `$81B63E | $81B640` and `$80390C`, none of which I traced. If it does
  fire, the boss's scripts run at TWICE the rate of everything else in the
  frame, which is a semantics difference no frame count would reveal.
- **`$811F8C`** — two absolute-long references in build B, both inside
  `$253564`. Its readers, if any, go through a base register.
- **Anything dynamic.** This wave ran no emulator and no port. Every number is
  from the decrypted image or from a listing; the two figures I take from other
  documents (W28's 2,063 instructions, `src/background.js`'s W19 census of the
  three unfreeze doors) are labelled CITED where they appear.

---

## LOG
- opened; read HANDOVER, knowledge 09/10, W36, W33 §8, W28.
- **[M] `$292902` is exactly 10 instructions, `$292902..$292930`, 46 bytes.**
- **[M] THE "SCRIPT FORMAT" IS A TASK SCHEDULER, NOT A BYTECODE.** `$259554`
  installs five pointer tables; `$25962E` steps them once per logic frame; each
  script id is a PAIR of longwords (INIT, STEP), stride 8, id = low byte of a
  `$20`-byte channel record's status word; a script ends with `clr.w (a4)`.
  **No opcode fetch exists anywhere in `$259554..$259C1F`.**
- **[M] five callers of `$259554`** — five bosses share the one scheduler.
- **[M] the stage-1 boss's five tables are enumerated COMPLETE: 52 script ids /
  104 pointers / 7 object routines = 111 entry points.**
- **[M] `$2595F2` always returns 4** — four computed branches all fall into
  `$25962A moveq #$4,d0`, which nothing branches over.
- **[M] three silent OVERFLOW blocks** (`$812BB4`/`$812D18`/`$812DDC`): a start
  request into a full table is DROPPED, not queued.
- **[M] `$294AD6`, which `$2927C0` calls and `src/initbody.js:668` notes as
  "boss bespoke", IS A BARE `rts`.** Two bytes, `4E 75`.
- **[M] `$294AD8` is the DAMAGE pass**, not an interpreter: three parts at
  `(a6)+$00/+$20/+$60`, HP longwords `$16/$1A/$1E(a5)`, critical thresholds
  `$48CC`/`$3000`/`$3000`, three death routines, and a
  `jmp $294F32(pc)` FALL-THROUGH into a timeout kill.
- **[M] THE CLOSURE: 257 routines, 7,816 instructions, 31,768 bytes** from the
  111 entry points. Boss-local 131 routines / 4,065 insn / 17,592 B — **0
  ported**. Shared 126, of which 61 are cited in `src/` and **65 (6,190 B) are
  not**. For scale, W28's figure for ALL THIRTEEN other unported stage-1
  handlers is 2,063 instructions [CITED].
- **[M] 134 scheduler API call sites, EVERY id argument resolved to an
  immediate.** That is the complete activation graph: F conducts, MAIN is the
  phase (9 ids), D is the limbs (21), E is the guns (15), OBJECT is the parts (7).
- **[M] BULLET KINDS CONFIRMED FROM THE SITES: 49 unique generator call sites,
  0 unresolved, kinds `{3,4,7,9,11,12,19}`.** Kind **9** = 8 sites in table E
  ids 9 and 10; kind **11** = 2 sites in table E id 13's STEP. W33 §8's
  "nearest-preceding-table-entry" lead is CONFIRMED, and by immediates
  (`move.l #$80009,d0`, `#$20009`, `#$FFF9000B`) rather than a data read.
  **Porting the boss would be the first execution of any of W27's 29 bodies.**
- **[M] type `$1E` (`$296DD6`, the boss's own spawn) adds nothing new**: 9
  routines / 367 insn / 1,274 B, kinds 3, 4, 5 — all already live.
- **[M] the boss does NOT stop the scroll.** Nothing in the closure writes
  `$813172`; `$261142`, `$261100`, `$25FD82`, `$25FD8C`, `$26C7F4` and
  `$26D254` are all absent from the 257. The boss arrives into a camera the
  scroll program already froze. **What RELEASES it after the boss dies is
  UNRESOLVED and is this wave's biggest open item.**
- **[M] no `$900000`-shaped live-but-unmodelled reach found** — the check the
  brief asked for, by absolute-long operand over the closure. `$2440E0`'s 555
  instructions are the one body I did not read and the one place a
  counter-example could hide.

## WAVE ESTIMATE

**THREE waves, ordered.**
**A** — the scheduler `$259554..$259C1F` (~1,740 B, 27 routines, no boss
content, independently testable, shared by all five bosses).
**B** — the boss body: 111 entry points, 131 routines, 17,592 B. Cut by TABLE if
it splits: F+MAIN (the phase machine, 16 ids) → E (15 ids, the guns and both new
bullet kinds) → D (21 ids, the limbs).
**C** — the death: `$2440E0` (2,542 B) + `$289004` + the `$28Bxxx`/`$28Cxxx`
cluster. This is L12 arriving as a boss dependency and it carries W36's standing
`$289004` decision.

**Must ship together:** A + the F/MAIN half of B, or nothing observable happens.
**Highest visible value:** A + F/MAIN + E.
**Must NOT be attempted in the same wave:** the scroll release and the stage
transition (§4.2, unresolved).

status: DONE
