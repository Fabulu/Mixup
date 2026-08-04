# 38 — RECON: the BOMB and the HYPER (and how they feed RANK)

status: DONE
started / finished: 2026-08-04
role: recon (read-only; this is the only file I wrote; no commits; I did not
touch `games/ddpdoj/src/`, `games/gradius/` or `37-recon-laser.md`)
target: `ddpdojblk` **VERSION-B**. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

**METHOD.** Every number marked **[M]** was measured by me this session with
capstone (`CS_ARCH_M68K` / `CS_MODE_M68K_000`) over
`games/ddpdoj/tools/oracle/out/maincpu.bin` (6,291,456 B, address == file
offset), plus a scratch scanner that finds absolute-long `jsr`/`jmp` **and**
PC-relative `bsr.b`/`bsr.w`/`bra.b`/`bra.w` over `$230000..$2B0000`, and an
absolute-operand census restricted to the same range. Neither can see
`jsr (An)` through a pointer nor `jsr (d16,PC)` — **§7 contains a case where
that mattered.** So every count is a **LOWER BOUND**; a zero means "no site of
those kinds", never "nothing does this". Counts marked **[CITED]** name the
document they come from and were **not** re-measured by me. **No MAME was run;
every dynamic figure quoted is [CITED].** Coverage below is branches and table
entries, never frames.

Binding constraint (`20-OWNER-scoring-must-be-exact.md`): "One false move, one
wrong rank gain from using super and the entire route breaks or the chain
doesn't work." Order WITHIN a frame is semantics.

---

## 0. THE HEADLINE

### 0.1 The brief's premise is HALF WRONG, and here is the half

The brief says "Neither is ported; there is no bomb or hyper source file."
**True of the code.** But `19-impl-score-chain-rank-ledger.md` §1.4 already
enumerated the hyper's rank credit *from the listing* and `src/score.js` carries
it in a comment, so this is not virgin ground — it is ground with **six wrong
signposts** on it (§7.2). What nobody had done is **read the two routines past
their apparent ends**, and that is where every answer below is.

### 0.2 THE STRUCTURAL FACT NOBODY HAS WRITTEN DOWN

**`$249814` is not "the bomb".** It is one button — Button 2, mirror bit 5 —
with a **two-way fork**, and the fork is the hyper stock `$81B65C` **[M]**:

```
$2497FE cmpi.w #$4,$8130CE / bcs $249B2C   the DISTANCE CLOCK gate
$24980A btst  #5,($19,A6)  / beq $249B2C   BUTTON 2
$249814 tst.b ($7,A5)                      which player
$249864 move.w (A1),D1                     A1 = $81B65C  -- THE HYPER STOCK
$249866 beq.b  $2498E2                     ZERO -> THE BOMB
        $249868..$2498DE                   NON-ZERO -> THE HYPER REQUEST
```

**One press is either a bomb or a hyper, and which one it is depends on a word
neither `src/player.js` nor `src/score.js` names as the fork.**
`src/player.js:363` throws `THE BOMB ($249814)` for *both* arms. Any wave that
implements "the bomb" at `$249814` will implement the hyper arm by accident.

### 0.3 The one-paragraph rank answer

**Using a super adds the hyper STOCK LEVEL to a persistent per-player power
word `$81B646` (`$285A62`, capped at `$23`), and rank = base + clock +
16 × max(power1,power2) — but the 16× term is gated on a hyper being ACTIVE
(`$2608F4`), so the gain is visible only while hypering.** [M, and it
reproduces W19 §1.4 independently.] Three more movers of that word, **none of
which W19 decoded**: bombing while hypering costs **−3** (`$249976`), dying
**quarters it** (`$24A00C lsr.w #2`), and two leaves zero it. All of them land
**after** the frame's rank recompute, so **every rank change from a bomb or a
hyper appears on the NEXT logic frame** — with one caveat in §3.4.

---

## 1. THE BOMB

### 1.1 Trigger and stock

| | |
|---|---|
| input | **mirror bit 5 of `($19,A6)`** — Button 2, `$24980A btst #5,$19(a6)` **[M]** |
| pre-gate | `$2497FE cmpi.w #$4,$8130CE / bcs` — the DISTANCE CLOCK ≥ 4 **[M]** (already a note in `src/player.js`) |
| fork | `$249866 beq $2498E2` — **no hyper stock** ⇒ the bomb **[M]** |
| **stock** | **`($24,A6)` — a BYTE in the player's own object record.** `$2498E2 tst.b $24(a6)`; consumed by `$249916 subq.b #1,$24(a6)` **[M]** |

**`($24,A6)` IS THE BOMB STOCK, AND IT HAS NEVER BEEN NAMED IN THIS REPO.**
`src/player.js:46-52` records eight waves of a wrong name (`$8130CE`) and ends
"The REAL bomb stock is still unlocated (20-plan W28)". It is `($24,A6)`; the
two instructions that prove it are `$2498E6 beq $249B2C` (no stock ⇒ the press
is dropped entirely) and `$249916 subq.b #1,$24(a6)`.

### 1.2 The three refusals, in order, BEFORE the stock is consumed [M]

```
$2498E2 tst.b ($24,A6)  / beq $249B2C     no stock
$2498FC tst.w $81B6FE   / bne $249B2C     ($81B700 for P2) a bomb is ALREADY RUNNING
$249908 tst.w $811F72   / bmi $249B2C     the LASER record is NEGATIVE
$24990E move.w #$1,$803938                a queue word, set BEFORE the consume
$249916 subq.b #1,($24,A6)                <- THE STOCK IS CONSUMED HERE
```

`$811F72` is the same word `src/score.js` calls `laserRec`. **Firing the laser
BLOCKS the bomb** — a hard coupling between two unported subsystems, and the
laser recon (`37-recon-laser.md`) owns the other end of it.

### 1.3 What firing one DOES — all three: objects, a flag, and a timed sequence

In ROM order **[M]**:

| site | what |
|---|---|
| `$24991A bne $249930` | skip the next call unless the stock reached **zero** |
| `$249922 jsr $2875B4` (P1) / `$24992A jsr $287616` (P2) | **only on the LAST bomb** — the item/stock re-grant machine (§2.6) |
| `$249936 move.w #$1,$812944` | P1's bomb-used flag (`$812946` P2) |
| `$24993E cmpi.w #$63,$812940 / bcc / $24994A addq.w #$1` | a **bomb-use counter capped at 99 (`$63`)** |
| `$249962 move.w $81B5C0,D0` | the CHAIN METER is read into D0 and used at `$2499D4` |
| **`$249968 tst.w $81B63E / beq $2499D4`** | **is a HYPER up?** |
| **`$249970 jsr $285AF2`** | **YES ⇒ THE HYPER IS ENDED** (§2.4) |
| **`$249976 subq.w #$3,$81B646 / bcc / $24997E clr.w`** | **YES ⇒ the POWER word −3, floored at 0 — THE RANK DEBIT** |
| `$2499D4 tst.w D0 / $2499D8 move.w #$1,(A3)` | A3 = `$81B5AE` — set only if the meter was non-zero |
| `$2499E8 subi.w #$9A,$0(A4)` / `$2499F4 clr.w` | A4 = `$8128F4`, the per-weapon pending counter: **−$9A, floored** |
| `$249A02/$249A10/$249A1E jsr $242AC6` | three conversions into `($2,A4)`, `($6,A4)`, `($C,A4)` |
| `$249A28 jsr $2532EA` | sound/effect |
| `$249A2E bset #6,(A6)` / `$249A32 bset #6,($1,A6)` | the player's BOMB-ACTIVE bits |
| `$249A56 move.b #$FF,($3E,A6)` | |
| `$249A62 jsr $260852` **or** `$249A80 jsr $26085C` | forked on `($3F,A6)` — **a DEATH bomb is a distinct path** with `($26,A6)=$0101`, `($28,A6)=$C` against `$0`/`$3C` |
| `$249A78`/`$249AF0 lea $24A440(pc),A0` + `$249AF6 adda.w D1,A0` + `$249AF8 move.w (A0)+,D0 / beq` | **AN ANOMALY I COULD NOT RESOLVE — see §7.1 item 5.** Both `lea`s resolve to `$24A440` (`$249A7A + $09C6`, `$249AF2 + $094E`), D1 = `($58,A6)*2` — but `$24A440` disassembles as the **ship-draw routines** `$24A440/44C/458/46C` that `src/shipsprite.js` already ports. Reading code as a word table. |
| `$249ABE jsr $252714` (P1) / `$249AD2 jsr $25275C` (P2) | the bomb's own object spawn; `$249AD8/$249ADE` write `($38,A1)=$26`, `($56,A1)=$8` |
| `$249AEA jsr $243DA0` | **the BULLET CANCEL** (§1.4) |

So a bomb is **all three** of the brief's options at once: it spawns objects, it
sets a screen-clear flag, and it drives a timed sequence.

### 1.4 THE SCREEN CLEAR — 14 entries, and it scores 46 per bullet

`$243CE0..$2440DE` is **1,023 bytes / 218 instructions [M]** and is a table of
**14 near-identical entries [M]**, **one of which — `$243E7C` — IS ALREADY
PORTED**, by W31 in `src/midboss.js` `armScreenClear()`. So this is not virgin
code and the port already has the right model for the arming half. Each entry
has the shape

```
tst.w $81B410 / beq <arm>          ; nothing running -> arm
cmpi.w #$20,$81B412 / bcs <arm>    ; the window
cmpi.w #$3C,$81B412 / bhi <arm>
rts                                ; a class $20..$3C cancel is already running
<arm>: $81B410 = 1 ; $81B412 = K   ; K in {$FFFF, $0, $44, $48, $4C}  [M]
       btst #1,$8130F8 -> $2440AE  ; the OTHER arm
       D1 = $8010 (P1) / $8008 (P2) / computed by $244030
       bra $244074
```

* **`$244074` — the cancel loop.** `lea $817F8C,A2`, `move.w #$D1,D7` ⇒
  **210 bullet slots of stride `$40` [M]**. For each live bullet
  (`(A2)` negative) it does `moveq #$46,D0 / jsr $28614A` for P1 and/or
  `$286154` for P2 — **46 points per bullet erased, packed BCD, straight into
  the PENDING score and NOT through any chain machine [M]**. This is the site
  W19 §1.0 found the whole ledger from.
* **`$2440AE` — the other arm.** Counts qualifying bullets
  (`and.w #$5100,D0 / beq`) into `$81B5B4` (`$2440CC addq.w #1`), which
  `$28444E`'s `$284468..$2844A0` then drains **at most 4 per frame** into
  `$81B610` **[M]**. That is the "bullets become items" half.
* Selector: **`btst #1,$8130F8`** decides which arm **[M]**.
* `$244030` builds D1 from the two players' state words (`$8103E6`, `$810448`):
  negative and bit 0 clear ⇒ credit that player **[M]**.
* **The 14 entries fall into 5 mode groups by the `$81B412` value K, and within
  each group some ARM-AND-RETURN and some ARM-AND-WALK [M]:**
  K=`$FFFF` — `$243CE0` (walk, D1 from `$244030`), `$243D14` (walk, `$8010`),
  `$243D5A` (walk, `$8008`), **`$243DA0` (ARM ONLY — the bomb's)**,
  `$243DD0` (→`$2440AE`), `$243E02` (walk);
  K=`$0` — `$243E48`, **`$243E7C` (walk — the midboss's, PORTED)**;
  K=`$44` — `$243EC2`, `$243EF6` (walk);
  K=`$48` — `$243F3C`, `$243F70` (walk);
  K=`$4C` — `$243FB6`, `$243FEA` (walk, `ori.w #$8000,D1`).
  **6 + 2 + 2 + 2 + 2 = 14. [M]**

**Which entry each weapon uses [M]:** the HYPER arm calls `$243D14` (P1, D1 =
`$8010`) / `$243D5A` (P2, `$8008`) at `$2498BC`, **and additionally does
`$24988A addq.w #$8,$81B410` and `$249890 move.w (A3,D1.w),$81B412`
directly** — A3 = `$255326`/`$255330`, indexed by (stock−1)*2. The BOMB arm
calls `$243DA0` at `$249AEA`, whose body is only 8 instructions and sets
`$81B410=1`, `$81B412=$FFFF`, then **`rts` — it does NOT branch to `$244074`**.

> **I nearly published the opposite.** My first draft said the bomb arm never
> touches `$81B410`; it does, through `$249AEA jsr $243DA0`, which the operand
> census found and the first disassembly pass had not reached. `docs/knowledge`
> §"read past the apparent end", earned again.
>
> **But the corrected finding still contradicts `src/bulletdriver.js:50-74`,
> which says the cancel is driven "only from a bomb (`$249814`)".** The bomb's
> entry `$243DA0` arms `$81B410` and returns; **the entry that actually walks
> the 210 slots and scores 46 per bullet is the HYPER's `$243D14`/`$243D5A`.**
> A port that implements the bomb expecting the bullet cancel to come with it
> gets a bomb that arms a timer and erases nothing.

### 1.5 The bomb HIT bit — where `$400` comes from

`$286096`'s bomb arm is behind `btst #2,D1`. The two setters **[M]**:

```
$245242 ori.w #$400,D4  / $245246 or.w D4,(A5)     the A2 weapon loop ($24518A, $811802)
$2452F2 ori.w #$4400,D4 / $2452F6 or.w D4,(A5)     the A3 weapon loop ($24525C, $811892)
```

The mask the score routines see is `moveq #$5C,D1 / and.b (A6),D1` over the
**high** byte of that word, so `$400` ⇒ D1 bit 2 and `$4000` ⇒ D1 bit 6. **The
A3 weapon sets BOTH**, and bit 6 is read at `$286966 btst #6,D1 / addq.w #1,D0`
— it makes the bomb's chain increment run **twice** (§4.2). Two bomb-class
weapons with different chain values, and the difference is one `ori` immediate.

---

## 2. THE HYPER

### 2.1 Where it lives, and the routine that decides its frame order

**`$285A12` (P1) / `$285B3C` (P2), 289 bytes / 52 instructions each [M].
Callers: EXACTLY ONE each, and both are PC-relative [M]:**

```
$284460 bsr.w $285A12
$284464 bsr.w $285B3C
```

`$28444E` is the HUD/ledger object, called from `$28D534`, inside top-level
object **TYPE 0 `$28D520`** — `$240F62` entry 0 **[M, stride 8: the table's 20
entries are `$28D520 $26127A $2491C0 $249246 $260B30 $28B5E0 $28D63C $290BE8
$25A770 $25CACA $260794 $25DBB4 …`]**. `$28D520`'s body is four instructions and
two calls, in this order **[M]**:

```
$28D52E jsr $2842B0     the pending -> total DRAIN
$28D534 jsr $28444E     ... and everything below
```

**So the hyper machine and the chain-meter decrement are IN THE SAME ROUTINE,
and the order is static [M]:**

```
$28444E bsr $285F8A
$284452 bsr $285F52
$284456 tst.w $81B6EE / bne $284CF2       <- skips BOTH
$284460 bsr $285A12      *** THE HYPER, P1 ***
$284464 bsr $285B3C      *** THE HYPER, P2 ***
$284468..$2844A0         the $81B5B4 -> $81B610 drain, 4/frame
$2844A6 btst #0,$8130F9  / bne $2847FE    <- skips the decrement, NOT the hyper
$2844B2 btst #3,$81DF1E  / bne $2847FE    <- ditto
$2844BE tst.w $8130BE    / bmi $28465C    <- jumps PAST the decrement
$2845C4..$284610         the chain-BREAK popup countdown
$284614..$28464C         *** $284636 subq.w #1,$81B5C0 -- THE DECREMENT ***
```

**THE HYPER ALWAYS RUNS BEFORE THE CHAIN METER DECREMENT, IN THE SAME FRAME,
AND THREE GATES CAN SKIP THE DECREMENT WHILE THE HYPER STILL RUNS. [M]** That
is a static ordering fact, not a measured one, and it is the single most
load-bearing sentence in this document for the owner's constraint.

### 2.2 What CHARGES it, and where the charge lives

| word | what | evidence |
|---|---|---|
| **`$81B65C`** (P1) / `$81B65E` (P2) | **THE HYPER STOCK LEVEL** — 21 absolute sites each **[M]** | `$285A56 move.w $81B65C,D0` is the level the activation consumes |
| **`$81B642`** (P1) / `$81B644` (P2) | **THE HYPER GAUGE / DURATION** — 5 sites each **[M]** | set to `$95F` at grant, `subq.w #2` per frame |
| `$81B654` / `$81B656` | the ACTIVE level, copied from the stock at activation | `$285A5C` |
| `$81B63E` / `$81B640` | **HYPER ACTIVE, 0 or 1** | `$285A30 move.w #$1` |
| `$81B658` / `$81B65A` | **THE REQUEST** — the button sets it, `$285A12` consumes it | `$24989A move.w #$1,(A2)` / `$285A1E` |
| `$81B64A` / `$81B64C` | the hyper-ITEM meter, threshold `$95F` | `$287682` |
| `$81B6E0` / `$81B6E2` | pending item grants, capped at 4 | `$2876C6` / `$28769A` |

**THE GRANT, `$2530BE` (P1) / `$2530E6` (P2) — 17 instructions [M]:**

```
$2530BE tst.w $81B65C / bne $2530CA
$2530C6 bsr  $252904                   a sound, only on the 0->1 edge
$2530CA addq.w #$1,$81B65C             <- THE STOCK +1, AND IT IS UNCAPPED HERE
$2530D0 move.w #$95F,$81B642           <- THE GAUGE, RESET TO $95F = 2,399
$2530D8 bsr  $25349A
$2530DC jmp  $286ED6
```

**The cap of 5 is NOT on the counter — it is in the grantor.** `$28768C
cmpi.w #$5,$81B65C / beq $287678` makes `$287682` *refuse* rather than clamp
**[M]**. A port that writes `min(stock+1,5)` at `$2530CA` implements a different
game the moment any other grantor exists.

**Duration, derived [M]:** `$285AEA subq.w #$2,$81B642 / bcc` drains 2 per frame
from `$95F` (2,399) ⇒ **1,200 frames**, i.e. 20.28 s at 59.185606 Hz. But the
gauge is set at **GRANT**, not at activation, and nothing re-arms it on
activation, so a stock carried a long way is not a shorter hyper — the gauge
simply sits at `$95F` until spent. That is a statement about the listing; no run
in this repo has ever had `$81B63E ≠ 0` **[CITED W19 §1.4]**.

### 2.3 What ACTIVATION changes — the whole block, in order [M]

```
$285A12 tst.w $81B63E / bne $285A96     ALREADY HYPERING -> straight to the tail
$285A1C tst.w $81B658 / beq $285A0A     no REQUEST -> jmp $2873AC (the flash draw)
$285A24 moveq #$11,D0 / and.b $8103E6,D0 / bne $285B32 (rts)   player state forbids
--------- ACTIVATION ---------
$285A30 move.w #$1,$81B63E              HYPER ON
$285A38 jsr $287324                     the P1 flash record
$285A3E jsr $286ED6                     the HUD
$285A44 tst.w $81B5C0 / beq $285A56
$285A4C move.w $81B5B2,$81B5C0          <- THE CHAIN METER := THE CAP, but ONLY
                                        <- if it was already non-zero
$285A56 move.w $81B65C,D0
$285A5C move.w D0,$81B654               the ACTIVE LEVEL
$285A62 add.w  D0,$81B646               <<< THE RANK GAIN
$285A68 cmpi.w #$23,$81B646 / bls / move.w #$23,$81B646     cap 35
$285A7A move.b #$0,$81B64E              the meter sub-tick
$285A82 move.b #$0,$81B64F              ...AND ITS RELOAD  (see §4.4)
$285A8A clr.w  $81B65C                  THE STOCK IS CONSUMED
$285A90 jsr $25325E
--------- THE PER-FRAME TAIL, also reached when already hypering ---------
$285A96 jsr $287340
$285A9C btst #0,$8103E6 / bne -> $285AF2      the player died -> END IT
$285AA8 cmpi.w #$10,$81B5DA / bcs $285AD4     chain >= BCD 10 ...
$285AB2 tst.w $81B5C0 / beq $285AD4
$285ABA $81B5C8 = $78 ; $81B5CA = $81B5C0 ; $81B5C2 = $78    ... popup timers
$285AD4 btst #6,$8130F8 / bne rts
$285AE0 tst.w $80392C   / bne rts             the global pause
$285AEA subq.w #$2,$81B642 / bcc rts          <<< THE GAUGE, -2 PER FRAME
--------- THE END, $285AF2 ---------
$285AF2 tst.w $81B63E / beq $285B04
$285AFC move.w #$48,$81B6FA                   arm the flash-out
$285B04 jsr $25329A
$285B0C $81B63E = 0    HYPER OFF
$285B12 $81B642 = 0    the gauge
$285B18 $81B654 = 0    the level
$285B1E $81B658 = 0    the request
$285B24 jsr $286ED6
$285B2A jmp $2875B4                           <<< the item/stock re-grant (§2.6)
```

**What it changes about the SHOT [M].** `$252714`, called on the request arm at
`$249898` (through `$25270C`, which first does
`andi.w #$DFFB,$8104AA` — clearing bits `$2004` of the player's state word):

```
$252718 move.w $81043E,D0 / add.w D0,D0
$252720 lea ($2527BE,PC),A0 / movea.l (A0,D0.w),A0    the weapon-selector table
$25272A tst.w $81B63E / beq $252738
$252732 lea $28C4FC,A0                <<< A HYPER REPLACES THE WHOLE SHOT ROUTINE
$252738 jsr (A0)
```

So the hyper does not *modify* the shot; it **substitutes a different shot
builder (`$28C4FC`) for the weapon-table entry** [M]. `$252754`/`$25275C` is the
P2 mirror, gated on `$81B640`.

**Three ways it ENDS [M]** — `$285AF2` has four callers:
`$249970` (a bomb pressed during it), `$24A000` (the player dies),
`$29020A` (a boss/flow event) and `$285AA6` (the internal
"player state bit 0" exit); plus the gauge borrow falling through at `$285AF0`.

### 2.4 The item/stock machine `$287682` — six callers [M]

`$249FDA`, `$27FBE4`, `$2866CA` (the chain-meter cap tail), `$2867A4`,
`$2867CE`, `$2867E4`.

```
$287682 cmpi.w #$95F,$81B64A / bls rts        the item METER must EXCEED $95F
$28768C cmpi.w #$5,$81B65C   / beq $287678    stock already 5 -> pin the meter, REFUSE
$287696 cmpi.w #$4,$81B6E0   / beq $287678    4 pending      -> REFUSE
$2876A0 clr.w $81B64A
$2876BE tst.w $81B63E / beq $287702           NO HYPER UP -> spawn an ITEM
$2876C6 addq.w #$1,$81B6E0                    HYPER UP -> bank it as a PENDING grant
$2876E4 move.w ($25531C,D0),$81B410           ...and arm a bullet cancel
$287702 moveq #$C,D0 / jsr $27E912            the item spawner, pool $816E7A (5 slots)
```

and `$2875B4` (P1) / `$287616` (P2) — called on the LAST bomb (`$249922`), at
the end of every hyper (`$285B2A jmp`), and from `$28EAB8`/`$28EACE` — flushes
`$81B6E0` pending grants by spawning that many items with D6 stepping `$800`
**[M]**.

**So `src/score.js`'s "`$287682` … grants a hyper stock (`$81B65C`, capped at 5
at `$28768C`)" is wrong on both halves.** `$287682` never writes `$81B65C`; it
*reads* it as a refusal test, and what it increments is `$81B6E0`. The only
absolute write that raises the stock is `$2530CA` **[M, 21-site census]**.

---

## 3. RANK — the critical part

### 3.1 The formula, re-measured

`$2608D2`, read out of the listing this session **[M]** — it reproduces W19
§1.4 instruction for instruction, which is worth saying because W19's own §6
flags it as listing-only:

```
$2608D2 A0 = ($81315C)                        the per-STAGE base table
$2608D8 D2 = $813092                          THE STAGE INDEX
$2608E0 D1 = base[stage]
$2608E4 D2 = $8130C6 ; lsr.l #8               + THE RANK CLOCK (24.8)
$2608F4 D0 = $81B63E | $81B640 ; beq $26091A  <- THE WHOLE POWER TERM IS GATED
$260902 D0 = max($81B646, $81B648)               ON A HYPER BEING ACTIVE
$260916 D0 <<= 4 ; D1 += D0                   + 16 x power
$26091A if $813098 != 0: $81309E = $FF, or $F8 with no hyper   loop 2+: PINNED
$260944 else $81309E = D1
$260958 clamp to $F0 with no hyper up
$260970 clamp to $FF with one
$260984..$260A18  fan the low byte out into ELEVEN bytes $8130A1..$8130BD
```

Called once per frame from `$2607EA`, inside object **type 10 `$260794`**
(`$240F62` entry 10) **[M]**, immediately after `$2607E4 addq.l #1,$8130C6`.

### 3.2 THE COMPLETE LEDGER OF `$81B646` — 13 absolute sites, all of them [M]

This is the census the owner's constraint needs. Six are writes.

| site | effect | when |
|---|---|---|
| `$285A64` | **`$81B646 += $81B65C`** | **USING A SUPER** — +1 rank-power per stock level |
| `$285A76` | `:= $23` | the cap, 35 |
| **`$249978`** | **`−3`**, `$249980 clr.w` floors it at 0 | **BOMBING WHILE A HYPER IS UP** |
| **`$24A00C/$24A00E`** | **`>>= 2` — DYING QUARTERS THE POWER** | the death path, right after `$24A000 jsr $285AF2` |
| `$2539AC` | `:= 0` | the P1 hyper full reset `$2539A2` |
| `$253A0C` | `:= 0` | a two-instruction leaf `$253A0A` |
| `$249834` | read into D6 | the hyper arm indexes `$252B44`/`$252B8A` by it |
| `$260904` | **read** | `$2608D2`, the only rank consumer |
| `$259EB8` | read (`max` with `$81B648`) | a display |
| `$24A008`, `$24A010`, `$252BD2`, `$249980` | the above, second operands | |

**W19 listed `$24A00E`, `$253A0C`, `$253A16` as "not yet decoded" and guessed
"the power-up pickups, presumably".** They are not pickups: `$24A00E` is the
**death** quarter-divide and the other two are bare `:= 0` leaves **[M]**. So
the guess in `19-impl` §1.4 should be struck.

**The rank arithmetic that follows, stated once:** with base ≈ 52 **[CITED W19]**
and the clamp at `$FF` while hypering, `16 × power` saturates rank at
power ≈ 13. Since `$285A64` **accumulates across hypers** (only death, `$2539A2`
and `$253A0A` reduce it), a route that supers repeatedly saturates rank and
stays there. **That is exactly why one wrong stock level breaks a route: the
error is not per-use, it compounds into a persistent accumulator.**

### 3.3 THE FRAME, relative to the activation — the answer, and its one gap

**For the HYPER: the rank gain lands on the NEXT logic frame. [M static +
[CITED] one measured ordering.]** The chain of three facts:

1. `$285A62` runs inside `$285A12`, whose only caller is `$284460`, inside
   `$28444E`, whose caller is `$28D534`, inside object type 0 `$28D520` **[M]**.
2. `$28D520` calls `$2842B0` (the drain) at `$28D52E`, i.e. **before**
   `$28D534` **[M]**.
3. W19 §1.5 **measured**, on 40 frames of a playing run, that the frame order is
   `rankclk > rank= > […hits…] > drain > drain0 > (brkT) > meter-` **[CITED]**.
   So `$2608D2` (rank recompute) fires *before* `$2842B0` (drain), and therefore
   before `$28444E`, and therefore before `$285A62`.

⇒ **A super activated on frame N is not in `$81309E` until frame N+1's
`$2608D2`.** And because `$2608F4` gates the whole power term on `$81B63E`,
the +16 arrives and departs with the flag, one frame late at each end.

**THE GAP, NAMED.** The BOMB's debit `$249976` is in the **player object**
(types 2/3, `$2491C0`/`$249246`), and **I could not establish where the player
object's SLOT sits relative to type 10's**. The object driver walks the 20 slots
at `$80E240` in address order and dispatches each slot's type **[CITED
`src/objdriver.js`, `src/objalloc.js`]** — so the order is the *allocation*
order, a runtime fact, not the type-table index. W19's tap did not tag any
player PC. **What I tried:** the type table (order is not it), the second
longword of each table entry (`$090000`/`$1A0000`/…, which is not an order —
it does not sort), and the caller graph of the allocator. **Unresolved: whether
the bomb's `−3` and its `jsr $285AF2` land before or after the same frame's
rank recompute.** One tap on `$2607E4` and `$249976` in one playing frame
settles it, and until it is settled a port must not choose.

### 3.4 Does a bomb change rank differently from letting the timer run out?

**YES, and the difference is the specification [M]:**

| how the hyper ends | rank effect |
|---|---|
| **the gauge runs out** (`$285AEA` borrows into `$285AF2`) | `$81B63E := 0` ⇒ the 16× term drops. **`$81B646` is untouched.** |
| **a bomb is pressed** (`$249970` → `$285AF2`, then `$249976`) | the same, **PLUS `$81B646 −= 3`** — a permanent −48 to every future hyper's rank |
| **the player dies** (`$24A000` → `$285AF2`, then `$24A00C`) | the same, **PLUS `$81B646 >>= 2`** |

`$285AF2` itself never touches `$81B646` **[M]** — the debit is always at the
call site, two instructions later. **A port that puts the debit inside the
hyper-end routine gets the timer-expiry case wrong and nothing will show it
until a route depends on it.**

---

## 4. CHAIN AND SCORE

### 4.1 A bomb HIT does NOT feed the chain the way a shot hit does

`$286096` forks on `btst #2,D1` **twice** (`$2860EC` P1, `$286112` P2). With the
bit clear a hit is `bcdAdd(pending, 1 + $81B63E)` and **touches no chain state
at all**. With it set it goes to **`$286876`** (P1) / `$286B9C` (P2) — a
**complete parallel chain machine, 524 + 174 bytes / 161 instructions [M]**,
with different laws at every point:

| | shot/kill (`$2862C6`, ported) | **bomb hit (`$286876`, absent)** |
|---|---|---|
| chain start | meter `+= $81B5E0` (20 or 18 from `$287DF4`), clamped to the cap `$81B5B2` (56) | **`$2868BA move.w #$A,$81B5C0` — a flat 10** [M] |
| chain +1 | every hit (`$2863B2`) | **only when `$81B5DE` borrows** (`$2868F2 subq.w #1 / bcc`) — **N hits per +1** [M] |
| N | — | `$2868C2` `(8−$810408)×1.5 + $12`; with a hyper `$286904` `6 − $81B654`; `−3` more if `$810440 ≠ 2` [M] |
| +1 or +2 | always +1 | **`$286966 btst #6,D1 / addq.w #1,D0` makes the `dbra` run twice — the A3 weapon chains DOUBLE** [M] |
| meter floor | none | **`$2869D8`: forced up to `$A` (10), or `$19` (25) with a hyper — on EVERY bomb hit** [M] |
| score adds | `$81B5D2`, `$81B5D6`, pending | the same three, `$2869B4/$2869C4/$2869D4` |
| high-water | `$2863C2` | `$2869A2`, its own copy |

**So the bomb is the only weapon that builds a chain from NON-FATAL hits.** A
shot hit adds one point and nothing else; a bomb hit runs a chain machine.

### 4.2 A bomb KILL, though, is ordinary

`$28615E` tests only `btst #4,D1` / `btst #3,D1` — **nothing in it looks at bit
2 [M]**, so a bomb kill runs the normal chain machine `$2862C6`. The one place
bit 2 reaches it is `$28663A`:

```
$286640 btst #2,D1 / bne $28664E      bit SET  -> the ordinary add
$286646 tst.w $813098 / bne $286664   bit CLEAR + LOOP 2+ -> straight to the cap
```
**[M]** — which `src/score.js:222` transcribes correctly. On loop 1 both paths
converge; **on loop 2+ a bomb kill refills the meter and a shot kill does not.**

### 4.3 Does the hyper multiply score / extend the chain window?

**Both, by three separate mechanisms [M]:**

1. **Per hit:** `$2860E4 moveq #1,D0 / $2860E6 add.w $81B63E,D0` — 1 normally,
   **2 while hypering**. Note `$81B63E` is the **0/1 ACTIVE FLAG**, not the
   level; **`src/score.js:345` calls it "ONE POINT PLUS THE HYPER LEVEL", which
   is the wrong name for the right word** (the level is `$81B654`).
2. **Per kill:** `$28615E`'s repeat loop re-enters the chain machine `$81B654`
   times — already transcribed in `src/score.js` `killFor`.
3. **The window:** `$285A4C` refills the meter to the cap on activation, **but
   only if the meter was already non-zero** — using a super rescues a *running*
   chain and does not start one. And `$286876`'s `$2869D8` floor rises from 10
   to 25 while hypering.

### 4.4 THE "HYPER THROTTLES THE CHAIN TIMER" READING IS WRONG — and it is a
### one-line port defect waiting to happen

`$284614..$284636` **[M]**:
```
$28461C tst.w $81B63E / beq $284636       no hyper -> decrement
$284624 subq.b #1,$81B64E / bcc $28464E   hyper -> a sub-tick "throttles" it
$28462C move.b $81B64F,$81B64E            ...reload
$284636 subq.w #1,$81B5C0
```
W19 §1.3 reads that as "a sub-tick throttles it". **Census of `$81B64F` over
`$230000..$2B0000`: TWO absolute sites [M]** — `$28462E` (this read) and
`$285A86` (`move.b #$0`), plus the two `move.w D0,$81B64E` zero-writes at
`$253942`/`$2539B6` which land on **both** bytes. **Every absolute write to
`$81B64F` writes ZERO.** With the reload 0, `subq.b #1,$81B64E` always borrows,
`bcc` is never taken, and `$284636` runs **every frame anyway**. So on the
listing the hyper does **not** slow the chain drain, and a port that implements
"the hyper halves the drain" invents a rule.

*Stated with its limit:* this is an absolute-operand census. A write through a
base register — the exact mechanism that hid `$2603E4` from W19's own static
pass **[CITED W19 §1.0]** — would defeat it. **So: no absolute site sets
`$81B64F` non-zero; I could not rule out a based write, and the cheap check is
a write tap on `$81B64F` in a run that hypers.**

### 4.5 WOULD `src/score.js` BE WRONG ONCE BOMBS EXIST?

**No — it is structurally right, and that is not luck.** W34 put `$286876`,
`$286B9C`, `$286A82` and `$286674` in as **counted notes rather than code**, so
the moment a bomb sets D1 bit 2 the port stops and names the address instead of
running the shot law over a bomb hit. Checked against the ROM this session:

* the `btst #2,D1` forks at `$2860EC` and `$286112` are both present and both
  note **[M vs `score.js:383-400`]**;
* `$28663A`'s bit-2 sense is transcribed correctly (§4.2);
* `$286674`'s fall-through condition (`$28666E tst.w D1 / bmi`) is right — D1 is
  a `$5C` mask, never negative, so the board always falls into the hyper-stock
  tail, and `capClamp` notes it.

**Three things in it are wrong as DOCUMENTATION and will mislead the wave that
ports this** (none changes today's behaviour):

1. `score.js:64-67` and `:236-240`: "`$287682` … grants a hyper stock
   (`$81B65C`, capped at 5 at `$28768C`)". `$287682` never writes `$81B65C`
   (§2.4). The grantor is `$2530CA` and the "cap" is a refusal.
2. `score.js:345`: "ONE POINT PLUS THE HYPER LEVEL" — `$81B63E` is the 0/1
   flag; the value is 1 or 2, never level-scaled (§4.3).
3. `score.js:410`: "if a HYPER is up it re-enters that machine `$81B654` more
   times" — correct, but `killFor`'s comment says "No run has ever had
   `$81B63E` non-zero", which is true and is *why* none of this is exercised.

**And one thing genuinely missing:** `$244074`'s `moveq #$46,D0 / jsr $28614A`
scores **46 per cancelled bullet** with no chain interaction at all. That path
goes through `scorePending`, which exists — so the arithmetic is there and the
**caller** is not.

---

## 5. WHAT IS ALREADY THERE — hooks, stubs, absences [M, bodies read]

| thing | state | body |
|---|---|---|
| `src/player.js:362` `unreached(0x249814, 'THE BOMB')` | **a loud named throw** | fires for **both** arms; the name is wrong for the hyper arm |
| `src/player.js:348` `unreached($2497AA)` | throw | the `$80380F` auto-shot block, not bomb/hyper |
| `src/score.js` `SCORE.altBomb = $286876` | **note only** | `note(ctx, …)` in the `btst #2` arm — correct |
| `src/score.js` `$286B9C` | **note only**, inline literal | correct |
| `src/score.js` `SCORE.capTail = $286674` | **note only** | correct, wrong text |
| `src/score.js` `LEDGER.p1.hyper = $81B63E`, `hyperLvl = $81B654` | **live reads** | correct addresses |
| `src/score.js` `killFor`'s `$28618A..$286218` hyper repeat | **PORTED, never exercised** | transcribed as written incl. the 65,536-iteration `dbra` at level 0 |
| `src/score.js` `chainHit`'s `$286304 if hyper: w1e = 1` | **PORTED** | correct |
| `src/damage.js` `DMG.hyper1/2`, `hyperLvl1/2` | **live reads**, passed to the tail | `$81B63E/$81B640/$81B654/$81B656` |
| `src/damage.js` `$24518A` (A2/A3 weapon loops) | **noted, not ported** | this is where the `$400` bomb bit is set |
| `src/bulletdriver.js:50,146` `$81B410` | **noted**, with a **wrong producer** (§1.4) | |
| `src/machine.js:216 playerBomb: 0x2497aa` | a name | |
| `src/web/input.js` `BOMB: BIT.b2`, `KeyX` | **the input is already bound** | matches `btst #5` |
| **`$243E7C`** — one of the 14 cancel entries | **PORTED**, `src/midboss.js` `armScreenClear()` | the ARMING half is real code; the 210-slot walk `$244074` is a note that **counts the live bullets** so an empty-pool clear and a 27-bullet clear are different log lines |
| `$2440AE` | **noted**, correctly, as a no-op (`$2440B2 bra.w $2440DA` jumps its own loop) | I confirmed this **[M]** |
| `$24A440/44C/458/46C` | **PORTED** as the ship draw, `src/shipsprite.js` + `src/type5.js` #16/#17 | which is why `$249A78`'s `lea` is an anomaly (§7.1) |
| `$285A12`, `$285B3C`, `$2530BE`, `$2875B4`, `$287682`, `$286876`, `$286B9C`, `$28C4FC`, `$2539A2` | **ABSENT from `src/` entirely** | `grep -i` over `games/ddpdoj/src/` returns zero code hits for every one; `$285A12`/`$285B3C`/`$286876`/`$287682` appear only inside `score.js` comments and notes **[M]** |

**Net: zero lines of bomb or hyper LOGIC exist. Four correct notes and one
correct throw guard the boundary; the screen-clear ARMING is already ported for
a different caller and is the right shape to reuse; two comments and one throw
name carry wrong facts (§7.2).**

---

## 6. WAVE ESTIMATE

**Measured extents [M], capstone instruction counts:**

```
  $2497FE..$249B29    812 B   184 instr   the BOMB+HYPER trigger block
  $285A12..$285B32    289 B    52 instr   P1 hyper machine
  $285B3C..$285C5C    289 B    52 instr   P2 hyper machine
  $243CE0..$2440DE  1,023 B   218 instr   14 cancel entries + $244030/$244074/$2440AE
  $286876..$286A81    524 B   118 instr   the BOMB score/chain arm
  $286AAA..$286B57    174 B    43 instr   ...its $28687E tail
  $2875B4..$287720    365 B    88 instr   the stock + item machine
  $2530BE..$25310C     79 B    17 instr   the stock GRANT
  $25392E..$2539E3    182 B    35 instr   the four hyper RESETs
  $2873AC..$28743F    148 B    29 instr   the bomb/hyper FLASH draw
  $27E912..$27E99F    142 B    40 instr   the item spawner (partial span)
  ------------------------------------------------------------------
  TOTAL             4,027 B   876 instr   (these spans only)
```

Plus, **not sized because their extents are unbounded from where I stopped**:
`$28C4FC` (the hyper's substitute shot builder), `$24A440` (the bomb sequence
table and its handlers — one of type 5's 23 calls), `$286B9C` (the P2 bomb
chain machine, presumably ~700 B by symmetry), `$252714`/`$25275C` and their
`$2527BE` weapon tables, `$260852`/`$26085C`, `$2532EA`/`$25325E`/`$25329A`,
`$286ED6`/`$286F3E`, `$287324`/`$287340`/`$287402`/`$28741E`, `$242AC6`.

**THREE WAVES, and they are not interchangeable:**

| # | wave | why here |
|---|---|---|
| **1** | **`$28D520` / `$28444E`'s SKELETON, and nothing else.** The drain `$2842B0`, the meter decrement `$284636`, and **the two `bsr`s to `$285A12`/`$285B3C` as loud named throws.** | This is W34 §1.7's own deferred item and it is the *prerequisite for the order being right*. Every one of §2.1's ordering facts is a property of this routine. Doing it first means the hyper is later dropped into a slot the port did not choose. It also retires "a chain this port starts never expires". |
| **2** | **THE HYPER.** `$285A12`+`$285B3C`, the grant `$2530BE`, the resets `$25392E`×4, `$287682`+`$2875B4`+`$287616`, the `$81B646` ledger, and `$252714`'s `$28C4FC` substitution. | It is the rank half, it is the owner's named case, and it is the smaller of the two (≈1,100 B of the core). |
| **3** | **THE BOMB.** The `$2498E2` arm, `$243CE0`'s 14 entries and `$244074`/`$2440AE`, and **`$286876`+`$286B9C`, the parallel chain machine** (≈1,400 B and the largest single unknown here). | It depends on wave 2 for `$285AF2` and `$81B646`, and on the A2/A3 weapon loops `$24518A`/`$24525C` for its own hit bit. |

**Realistic range 3–5**, because wave 3 has a decent chance of splitting
(`$286876`'s 161 instructions are a second chain law with its own mutation
budget) and because §7.1 item 5's `$24A440` anomaly sits in the middle of the
bomb's tail and could be anything from one line to a subsystem.

**WHAT THIS DEPENDS ON THAT IS NOT YET PORTED** (all **[M]** absences from
`src/`):

* `$28D520` / `$28444E` — object type 0. **Everything.**
* `$24518A` / `$24525C` — the A2/A3 weapon loops, W34's `$244D62` blocks 7 and
  8. **Without them nothing ever sets D1 bit 2, so `$286876` stays dead code no
  run can reach — the same shape as the "unreachable" artifacts the brief
  warns about.**
* `$811F72`, the laser record — it *blocks* the bomb (§1.2) and it forks
  `$286096`. Shared with `37-recon-laser.md`.
* `$817F8C`'s 210-slot bullet pool — `$244074` walks it. **Already modelled**:
  `src/midboss.js armScreenClear()` counts its live slots. Extending that note
  into the real `$46`-per-bullet score walk is a small, well-shaped job.
* `$27E912`'s item pools (`$816B7A`/`$816D7A`/`$816DFA`/`$816E7A`/`$816FFA`) and
  whatever object type collects them — the stock cannot be *earned* without it.
* `$240DC2`, the TX printer — `$28444E` calls it four times.
* the player record's `($24,A6)`, `($3E,A6)`, `($58,A6)`, `($3F,A6)`.

---

## 7. WHAT I COULD NOT DETERMINE — and the inherited claims I corrected

### 7.1 Could not determine

1. **THE ONE THAT MATTERS: where the PLAYER object's slot sits relative to the
   RANK object's.** §3.3. It decides whether the bomb's `−3` and its
   `jsr $285AF2` are in frame N or N+1 of the rank recompute. **What I tried:**
   the `$240F62` table (order is by slot, not by type index — `$28D520` is entry
   0 yet W19 measured it running *late*), the table's second longwords
   (`$090000`/`$1A0000`/…, which do not sort into the measured order), and the
   allocator's create-queue at `$80D56C`, which is RAM. **A write tap on
   `$2607E4` and `$249976` in one frame settles it.** Until then a port must not
   pick a side, and **the hyper's answer (§3.3) does NOT transfer to the bomb** —
   they are in different objects.
2. **Whether `$81B64F` is ever non-zero.** §4.4. Absolute census says no; a
   based write would defeat it. This is a cheap tap and it decides whether the
   hyper slows the chain drain.
3. **The extent and body of `$286B9C`**, the P2 bomb chain machine. I read P1's
   `$286876` in full and inferred P2 by symmetry with `$2862C6`/`$286476`; I did
   **not** disassemble it, and W34 §2.3 found an *unreachable* P2 mirror eight
   bytes from a live one in this very module. Do not assume.
4. **`$28C4FC`** — the hyper's substitute shot builder. Located, not read.
5. **`$249A78`/`$249AF0 lea $24A440(pc),A0` — AN ANOMALY, AND I AM LEAVING IT
   UNRESOLVED RATHER THAN GUESSING.** Both displacements resolve to `$24A440`
   by hand as well as by capstone (`$249A7A + $09C6`, `$249AF2 + $094E`), the
   index is `D1 = ($58,A6)*2` (`$249A44`/`$249A4C`/`$249A4E`), and the read is
   `move.w (A0)+,D0 / beq $249B06`. But `$24A440` disassembles as four 12-byte
   routines — `lea $8103E6,A6 / move.w (A6),D0 / bmi / rts` and its three
   siblings — i.e. **the ship-draw entries type 5 calls at `$28B5E6` and that
   `src/shipsprite.js` has ported since W12.** So the bomb reads *code* as a
   word table (first word `$4DF9`). Three possibilities and I cannot choose
   between them: a deliberate code-as-data read, a mis-trace of D1 on my part,
   or a second `lea` I have not found overriding A0 between `$249AF6` and the
   read. **This is a first-order gap for anyone porting `$2498E2`'s tail**, and
   it is exactly the kind of thing `docs/knowledge/02`'s fall-through trap
   produces when the reader smooths it over.
6. **Anything dynamic.** No MAME, no gate, no test was run. `$81B63E` has never
   been non-zero in any recorded run **[CITED W19 §1.4]**, so **every branch in
   §2 and §4.3 is transcribed-and-unexercised** and there is no measurement in
   this repo that could contradict it.
7. **Whether the `$95F` gauge is re-armed anywhere I did not find.** 5 absolute
   sites for `$81B642`; I read 4.

### 7.2 Inherited claims this recon FALSIFIES

| claim | where | what the listing says [M] |
|---|---|---|
| "`$287682` … grants a hyper stock (`$81B65C`, capped at 5 at `$28768C`)" | `src/score.js:64-67`, `:236-240` | `$287682` never writes `$81B65C`; `$28768C` is a **refusal test**; the grantor is `$2530CA` and it is **uncapped** |
| "the bomb's cancel loop … only from a bomb (`$249814`)" | `src/bulletdriver.js:50-74,146` | the bomb's entry `$243DA0` arms `$81B410` and **returns**; the entry that walks the 210 slots and scores 46/bullet is the **hyper's** `$243D14`/`$243D5A` |
| "`moveq #1,D0 / add.w $81B63E,D0` — ONE POINT PLUS THE HYPER LEVEL" | `src/score.js:345` | `$81B63E` is the **0/1 active flag**; the level is `$81B654`; the value is 1 or 2 |
| "`$24A00E`, `$253A0C`, `$253A16` — the power-up pickups, presumably" | `19-impl` §1.6 | `$24A00E` is the **death** `>>= 2`; the other two are bare `:= 0` leaves |
| "a sub-tick throttles it" (the hyper and the chain drain) | `19-impl` §1.3 | every absolute write to `$81B64F` writes **zero**, so the throttle is a no-op (§4.4, with its limit stated) |
| "`$25FF7A` has exactly **2** callers, `$26059E` and `$2605C2`" | `28-recon` §1 L16 | there is a **third**: `$2607A4 jsr $25FF7A(pc)` — a `jsr (d16,PC)`, which `xref.py` explicitly cannot see and my `bsr`/`bra` scanner cannot either. **I found it by disassembling `$260794`, not by searching.** Tangential to this brief; recorded because it is the exact failure mode `docs/knowledge/09` describes and because L16 is a scheduled wave. |

### 7.3 What I did NOT falsify

The brief warned that six briefs today rested on false premises. This one's
central premise — "neither is ported, there is no bomb or hyper source file" —
**is true, with two qualifications I nearly missed [M]**: `grep -i` over
`games/ddpdoj/src/` for `285A12 285B3C 2530BE 2875B4 287682 286876 28C4FC`
returns **only comment and note hits, no code**. But `243CE0`'s family **does**
have a ported member (`$243E7C`, `src/midboss.js`) and `$24A440` **is** ported
(`src/shipsprite.js`) — so "there is no bomb source file" is right and "none of
this code exists in the port" would have been wrong. I asserted the second in a
draft and the grep caught it.

And W19 §1.4's headline claim — one level of super = +1 to `$81B646` = +16 rank,
gated on the hyper being active — **reproduces exactly**, from a different
reading, this session.

---

## LOG (appended as findings arrived)

- opened; read HANDOVER, `docs/knowledge/08`, `20-OWNER`, `34-impl`,
  `28-recon`, `19-impl`.
- **THE FORK**: `$249864` reads `$81B65C` and branches. One button, two weapons.
  `src/player.js` throws one name for both.
- **`($24,A6)` is the bomb stock** — unnamed in this repo for eight waves.
- first draft claimed the bomb never arms `$81B410`. **WRONG** — `$249AEA jsr
  $243DA0`. Corrected before publishing; the corrected finding still contradicts
  `bulletdriver.js`, differently.
- **`$285A12`'s only caller is `$284460`, inside `$28444E`** — so the hyper and
  the chain-meter decrement are in ONE routine and the order is STATIC.
- **`$286876` is a second, complete chain machine** with a flat meter of 10, an
  N-hits-per-link counter, a double-increment arm and a per-hit meter floor.
- **`$81B646`'s 13-site census**: the bomb's −3, the death `>>= 2`, and W19's
  three "not yet decoded" writers all resolved.
- **`$81B64F` is only ever written zero** ⇒ the hyper does not throttle the
  chain drain.
- `$287682` refuses rather than caps, and never writes the stock.
- sized: 4,027 B / 876 instructions over 11 spans, three waves.
- found a third caller of `$25FF7A` by disassembly that two scanners cannot see.
- **two of my own draft claims corrected by checking the port rather than the
  ROM**: `$243E7C` (one of the 14 cancel entries) is ALREADY PORTED in
  `src/midboss.js`, and `$24A440` is the ship draw, not a bomb sequence table —
  which turns a confident sentence into §7.1's unresolved anomaly. Both were
  going to ship as facts.

status: DONE
