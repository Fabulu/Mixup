# W21 recon - the Rosetta stone: cross-build comparison as a method

status: DONE
agent: recon (read-only; no edits to games/*/src; no commits)
started: 2026-08-02

## Brief

The owner: "We have the encrypted code, and we have a similar version of the same
game with fully accessible code, our Rosetta stone. We need to leverage these more."

Goal: deliver a *method* for aligning routines across builds, then use it on
(1) $813098's writer, (2) routine boundaries for already-ported code,
(3) table extents.

## Log

(appended as I learn things; nothing here is a fact until it says MEASURED)

### 1. SIX decrypted images now exist, not one. MEASURED.

`init_ddp3()` decrypts `:maincpu` in place, so the only way to read any of these
is from a running machine. `tools/oracle/dumpcpu.lua` works unchanged on every
set on this disk. All six dumped, `-noreadconfig`, 8 emulated seconds each:

```
games/ddpdoj/rip/rosetta/img-{ddpdojblk,ddpdojblkbl,ddpdojp,ddp3,ddpdoj,ddpdojb}.bin
```

each 6,291,456 B (= the whole `:maincpu` region, $000000-$5FFFFF). rip/ is
gitignored; nothing ROM-derived is committed.

**The raw ROM files are NOT plaintext.** `ca008.cod_prom.u13.27c322`
(ddpdojp's 4 MiB "unprotected" program) has no ASCII strings at all. "UNPROTECTED"
in the brief means *no ARM7 ASIC* - MAME loads ddpdojp with no
`ddp3_igs027a.bin` warning, where every other set warns - **it does not mean
un-encrypted.** The 68k program is still `pgm_py2k2`-encrypted and still has to
come out of a running machine. (ddpdojblkbl, the bootleg, also loads with no
ASIC warning.)

Content map, MEASURED (4 KiB blocks with >4 distinct byte values):

| set | code/data extents in the region | version string(s) |
|---|---|---|
| ddpdojblk | `$100000-$1C7FFF` + `$200000-$2CFFFF` | `$15A006` 2002.04.05.MASTER, `$25ABDA` 2002.10.07.BLACK |
| ddpdojblkbl | `$100000-$1C7FFF` + `$200000-$2CFFFF` | `$15A006` 2002.04.05.MASTER, `$25A810` 2002.10.07 BLACK VER. |
| ddpdojp | `$100000-$1C7FFF` + `$200000-$2A8FFF` | `$1598EE` 2002.04.05 MASTER **only** |
| ddp3 | `$100000-$2Cxxxx` | `$159A94` 2002.05.15 MASTER |
| ddpdoj | `$100000-$2Cxxxx` | `$159B26` 2002.04.05.MASTER |
| ddpdojb | `$100000-$2Cxxxx` | `$1599C6` 2002.04.05 MASTER |

(everything above `$2D0000` in the blk/blkbl/ddp3/ddpdoj/ddpdojb images is
decryption noise over unloaded region bytes; in ddpdojp it is `$FF`.)

**CORRECTION TO THE BRIEF.** ddpdojp is NOT a second program build sitting at
`$2xxxxx`. It carries ONE build, at `$10xxxx-$1C7FFF`, with DATA at `$2xxxxx` -
the same shape as ddp3/ddpdoj/ddpdojb. The `$2xxxxx` *code* region is unique to
ddpdojblk/ddpdojblkbl, which relocated the Black-Label build there to sit beside
the Master build. So the Rosetta candidates are:

* **ddpdojblkbl** - a relayout of BOTH our builds. 97.53 % of `$100000-$1C7FFF`
  is byte-identical *at the same offset* to ddpdojblk. Closest relative by far.
* **ddpdojp / ddpdojb / ddpdoj / ddp3** - independent relayouts of the Master
  build. Pairwise same-offset identity is ~30 % (i.e. no fixed offset; ~30 % is
  the zero-padding floor, not a signal).

### 2. THE ALIGNMENT METHOD - RAM-reference sequence alignment

The invariant the brief needs: **code addresses relocate between builds, RAM and
I/O addresses do not.** So take, per image, the ordered list of every 4-byte
big-endian value at an even offset in the code range that lands in
`$800000-$8FFFFF` / `$A00000-$AFFFFF` / `$C00000-$C0FFFF`. That is the
absolute-long operand stream, and it is a build-invariant token sequence.
ddpdojblk yields 24,992 such tokens over both builds; ddpdojp 12,334 - about one
token per 60 bytes of code, dense enough to align on.

Same caveat as `xref.py`/`derive.py`, and it must be quoted every time: this sees
**absolute-long operands only**. `(d16,An)`, `(An)+`, `(d8,An,Xn)` and
PC-relative are invisible. So a match is evidence; a gap is not absence.

**First test of the idea, and it works.** Every absolute-long site of `$813098`
(the fan/loop gate) in ddpdojblk, with the two preceding opcode words:

* build A `$13xxxx-$1Axxxx`: 190 sites. build B `$23xxxx-$2Axxxx`: 190 sites.
* they align **one-for-one in address order with identical preceding opcode
  words**: `13C61C↔23C2BC`, `1428FC↔2425C2`, `149534↔249E90`, `14BAA6↔24C3F2`,
  `15F794↔26043A`, `18F234↔290766`, … - including the two `3439` (`move.w
  abs.l,D2`) sites and the one `38B9` site, in the same relative positions.

That is the alignment method in miniature, and the next section is what it found.

### 3. $813098 - THE ANSWER. A THIRD WRITER, AND W10's "EXACTLY TWO" IS WRONG

MEASURED, statically, from the decrypted ddpdojblk image. `move.w #imm,$813098`
is `33FC iiii 0081 3098`. In build B there are **three**, not two:

```
$259DB0   move.w #$0,$813098      (W10 has this)
$259DC6   move.w #$1,$813098      (W10 has this)
$290762   move.w #$1,$813098      <-- NEW. W10 MISSED IT.
```

W10 (`10-recon-flow.md` §6) wrote "written at **exactly two**" and stated its
filter in the same sentence - "filtered to `$23xxxx-$28xxxx`". **`$290762` is at
`$29xxxx` and fell outside the filter.** The claim was never wrong about what it
searched; it was quoted afterwards as if it were a claim about build B.

And build A has the same third writer, at **`$18F230`** - same opcode, same
neighbours (`$18ECC4 ↔ $2901E2`, both `4A79`/`2D80`). The debug-select pair
`$259DB0`/`$259DC6` has **no build-A counterpart** in the aligned list.

### 4. THE TOOL - `games/ddpdoj/tools/rosetta.py`

```
python rosetta.py dump [set ...]      dump the decrypted :maincpu per set
python rosetta.py map                 content extents + version strings
python rosetta.py sites RAMADDR       every abs.l site of a RAM address, all images
python rosetta.py align ADDR [--from S:B] [--to S:B]
python rosetta.py bounds ADDR         cross-build routine-boundary check
python rosetta.py table ADDR STRIDE   cross-build table-extent check
python rosetta.py codexref ADDR       EVERY reference to a code address,
                                      INCLUDING PC-relative ones
python rosetta.py dasm ADDR N --set S
```

`align` works in three stages:

1. **anchor** - difflib longest-matching-blocks over the two RAM-token VALUE
   streams. The block containing the query gives an exact token-to-token pin.
2. **refine** - the anchor pins a token, not an entry point. Prologues differ:
   measured, `$2410BC`'s nearest anchor is 8 bytes past its true entry. So score
   every even candidate within +/-$60 by masked word agreement, where a 32-bit
   value landing in CODE space on BOTH sides counts as a wildcard (a relocated
   pointer in the same slot).
3. **confidence** - HIGH needs run>=8 AND identical preceding opcode words AND a
   unique 6-token n-gram AND a refine margin >= 2. Anything less is MEDIUM/LOW.
   **A LOW pairing may not be quoted as a fact.**

`codexref` closes `xref.py`'s documented blind spot: it decodes `jsr/jmp abs.l`,
`lea abs.l,An`, `bsr/bra.s`, `bsr/bra.w`, `jsr/jmp (d16,PC)` and `lea (d16,PC),An`.
It still cannot see a computed `jmp (d8,PC,Xn)` jump table, so "no reference
found" is a strong result and still not a proof of unreachability.

**SELF-TEST, and it passes from an independent direction.** The tool maps
`$2410BC -> $1413F6` HIGH. Disassembled, the two are instruction-for-instruction
identical for 40 bytes (`bsr / bsr / lea $80E240,A5 / moveq #$13,D0 / ... /
lea ($240F62,PC),A0` vs `lea ($141294,PC),A0`). Wave 2's build-A object driver
"`$1413FE`" is the THIRD instruction of that routine, not its entry; the entry
pair is **`$2410BC <-> $1413F6`** and the dispatch-table pair is
**`$240F62 <-> $141294`** - the latter is the address wave 2 quoted, so that one
was right.

### 5. THE MAIN LOOP, PAIRED CALL FOR CALL. HIGH.

Build A `$13C356`, build B `$23BFDC`: seven calls and a `bra` back, same order.

| # | build A | build B | note |
|---|---|---|---|
| 1 | `jsr $13BE8C` | `jsr $23BE8C` | |
| 2 | `jsr $1562F0` | `jsr $256D5A` | |
| 3 | `jsr $1413F6` | `jsr $2410BC` | **the object driver** |
| 4 | `jsr $145F1C` | `jsr $24683E` | |
| 5 | `jsr $13D61A` | `jsr $23D2AE` | |
| 6 | `jsr $13C5B6` | `jsr $23C212` | **the frame sync** |
| 7 | `jsr $13D496` | `jsr $23D12A` | the input latch (disassembled: `$23D12A`) |

Independent confirmation: the arm-PC census printed by every probe run on this
project is `13C5B6` (build A) / `23C212` (build B) - call #6 in this table,
derived here with no reference to any existing landmark file.

### 6. $813098 - THE FULL ANSWER

**Three writers in build B, not two, and one of them is a `dbra` clear loop.**

```
$259DB0  move.w #$0,$813098   inside the DEBUG STAGE SELECT $259D04
$259DC6  move.w #$1,$813098   ditto, taken when the selector >= 6 ("STAGE R*")
$290762  move.w #$1,$813098   NEW -- W10's $23xxxx-$28xxxx filter missed it
```

MEASURED dynamically over a 3,000-logic-frame VERSION-B run with a write tap on
`$813098` (boot + coin + coin + start; `ARM 23C212 = 2301` frames of build B):

```
W98 pc=2603E4 n=2 firstlf=699 values=0000
W98 pc=15F73E n=1 firstlf=0   values=0000
```

**and that resolves the W10 / W17 contradiction.** W17 reported "3 writes, all
init (`$15F73E`, `$2603E4` x2), value 0"; W10 reported "exactly two writes, both
`move.w #imm`". Both are right, and neither `$2603E4` nor `$15F73E` is a writer
of `$813098` in any useful sense:

```
2603da: lea $81308C,A0 / move.w #$65,D0
2603e4: move.w #$0,(A0)+ / dbra D0,$2603E4      ; clears $81308C..$8131BC
```

a `dbra` clear loop over $66 words that sweeps across `$813098` on its way past.
`$15F73E` is **the same loop in build A** - `$15F734` and `$2603DA` are
instruction-for-instruction identical and `rosetta.py align 2603DA` pins them
HIGH. So the dynamic tap has never seen a purposeful writer at all, and nothing
about "`$813098` = 0 on 16,000 frames" is explained by those two PCs.

#### 6a. THE DEBUG STAGE SELECT IS GATED ON A REAL DIP SWITCH - and MAME has it

```
259d14: move.w $C08006,D0
259d1a: btst   #$7,D0
259d1e: bne    $259D30          ; bit 7 SET -> clear state, rts. FEATURE OFF.
```

MAME's `ddpdojblk` exposes port `:DSW` with exactly two fields - MEASURED by
enumerating `machine.ioport.ports` at runtime:

```
:DSW  mask=0001 def=0001  "Service Mode"
:DSW  mask=0080 def=0080  "Unknown"      <-- $C08006 bit 7, default = feature OFF
```

So the stage select is a DIP-SWITCH feature and MAME can set it. **That is not a
poke.** The same read appears at `$259CBE`, in the display half `$259CB8`.

**BUILD A HAS NO SUCH GATE.** Build A's counterpart `$159250` reads
`jsr ($159204,PC) / jsr $15960E / lea $812E08,A4 / tst.b ($1,A4)` - straight past
where build B inserts the `$C08006` test. Black Label added the DIP gate.
(Confidence: MEDIUM on the routine pairing - `align` reports LOW for the entry
and the pairing rests on the shared `$812E08` state block, the identical `$28`-frame
hold, the identical `btst #4/#5` buttons and the identical `$8130C6` clear.
HIGH on "build B reads `$C08006` there and build A does not", which is two
listings side by side and needs no alignment at all.)

#### 6b. AND YET: $259D04 HAS NO CALLER IN BUILD B. MEASURED, TWO WAYS.

Static: `rosetta.py codexref 259D04` finds nothing, in either build's range, in
any of the seven encodings. A full-image longword scan for `$00259D04` across all
6,291,456 bytes finds nothing.

Build A's counterpart IS called, and by exactly one site:

```
13c7c8: jsr $159250.l
```

whose caller is a SECOND main-loop body that build B does not have:

```
13c7a8: move.w D7,$803944
13c7ae: move.l #$0,$8130C6
13c7b8: moveq  #$1,D6
13c7bc: jsr $15F8FE
13c7c2: jsr $1413F6          <-- the object driver, a SECOND call site
13c7c8: jsr $159250          <-- the debug stage select
13c7ce: jmp ($13C5A4,PC)     <-- back into the frame sync
```

Build A calls the object driver from **two** sites (`$13C362`, `$13C7C2`); build
B from **one** (`$23BFE8` - which is `frame.lua`'s `PROBE_INJECT_SITE` default,
so that landmark is independently re-confirmed here). The byte pattern
`33C7 0080 3944` (`move.w D7,$803944`) occurs exactly once in the whole 6 MiB,
at `$13C7A8`; `23FC 00000000 0081 30C6` occurs at `$13C7AE`, `$1592EA`, `$259DCE`
and nowhere else. **Build B has no counterpart of that block.**

Dynamic, and this is the half that matters: a write tap over the entire
`$812E08..$812E4B` state block, VERSION-B pinned, DIP `:DSW`/"Unknown" forced to
0, through boot + coin + coin + start, 3,000 logic frames:

```
SEL 812E0A:259C58 n=2 firstlf=699    SEL 812E48:259CA6 n=2 firstlf=699   (...)
```

**every writer is the INITIALISER `$259C4A`, twice, at logic frame 699. Not one
write from `$259D04`'s body - `$259D28`, `$259D48`, `$259D7C`, `$259D84`,
`$259D88` all write that block and would fire every frame the handler ran.**
The handler did not run.

STATUS, stated the way docs/knowledge/08 requires: **I could not reach `$259D04`
in build B. What I tried: the DIP cleared, a full boot to VERSION-B, coin/coin/
start, 3,000 logic frames with a write tap that would have caught a single
frame of it, and a static reference search that finds no caller in 6 MiB.**
Not ruled out: a computed `jmp (d8,PC,Xn)` jump table, which no address search
can see.


#### 6c. THE REACHABLE WRITER: `$290762`, object type 7, sub-state 2

```
240F9A = $290BE8                      ; dispatch table entry [7]
290be8: tst.b   ($2,A5)
290bec: beq     $290ACC
290bf0: cmpi.b  #$2,($2,A5)
290bf6: beq     $290746               ; <-- HERE
...
290746: tst.w   $81E116 / beq $29077C
290750: move.w  #$0,$81E116
290758: tst.w   $81E112 / bne $290B4C
290762: move.w  #$1,$813098           ; THE LOOP FLAG GOES TO 1
29076a: move.w  #$11,D0 / jsr $241182 ; allocate object type $11 = $25CEB8
290774: jmp     $241292
```

`$81E116` is set to 1 at `$2911CA`, in the same routine that sets `$81E112 = 1`
and `$81E114 = $258` (600) and loads a script; `$81E112` is a counter, `addq.w
#1` at `$29125C`/`$291276` off an input read (`($18,A6)` holds `$23D186` or
`$23D18E`, the two masked-input readers). So the gate is "the message/script
sequence finished AND nobody pressed anything".

Cross-build: `align 290746 -> $18F214` HIGH, and build A's `$18F230` is the same
`move.w #$1,$813098`. **Both builds have this path; it is not a Black-Label
addition.** Build A's type-7 handler is `$18F698` (table entry [7]).

This is the writer a later wave should try to reach: it needs no DIP switch, it
is on the normal object-dispatch path, and both builds agree on it. I did not
reach it in this wave - reaching it means getting to whatever sequence sets
`$81E116`, and that is a play-through problem, not a recon problem.

### 7. ROUTINE BOUNDARIES - the fall-through, checked from a second build

`rosetta.py bounds 24C390 --span 0x300`:

```
ENTRY $24C390 [ddpdojblk:B] <-> $14BA44 [ddpdojblk:A]  HIGH
  B terminators:  +$0162 bra.w $24D480 | +$0166 rts | +$02FA bra.w | +$02FE rts
  A terminators:  +$0162 bra.w $14CB34 | +$0166 rts | +$02FA bra.w | +$02FE rts
  AGREE at offsets: 0x162 0x166 0x2fa 0x2fe
```

**Both builds place their first `rts` at +$166, which is PAST `$24C476` (+$E6).**
W12.5's finding - that `$24C390` falls through into `$24C476` - is confirmed by
an independent implementation of the same routine. That is the check the brief
asked for, and here the two readings agree, so the reading stands.

The general recipe: `bounds` prints the first N terminators of both builds as
OFFSETS FROM THE ENTRY. Agreement on the offsets is the check. Disagreement
means one reading is wrong OR the builds genuinely differ - and the tool says
so rather than picking.

### 8. TABLE EXTENTS - pinned from both ends, and one real disagreement

#### 8a. THE OBJECT DISPATCH TABLE IS 20 ENTRIES IN BUILD B AND 21 IN BUILD A

`rosetta.py table 240F62 8`:

```
ddpdojblk:B  $240F62   [0]$28D520 [1]$26127A [2]$2491C0 [3]$249246 [4]$260B30
                       [5]$28B5E0 [6]$28D63C [7]$290BE8 [8]$25A770 [9]$25CACA
                       [10]$260794 [11]$25DBB4 [12]$28F3AC [13]$288A60
                       [14]$288C6C [15]$291F66 [16]$256E7A [17]$25CEB8
                       [18]$24902A [19]$28EE88
                       [20] $241002 = $36390080  -> NOT a pointer: extent = 20
ddpdojblk:A  $141294   [0]..[19] as above, and additionally
                       [20] $141334 = $0013BEEA -> a REAL handler
                       [21] $14133C = $36390080  -> extent = 21
```

Both tables are followed by the identical instruction `move.w $80E880,D3` at
`$241002` / `$14133C`, and those two routines are byte-for-byte the same
listing. So the extent is pinned from the far end in both builds, independently,
and **they differ by one entry.** Build A's extra type `$14` is real: build A
allocates it at `$13C34C` (`move.w #$14,D0 / jsr $1414BC`) immediately before
entering the main loop, and `$13BEEA` opens `tst.w ($2,A5)` - the object
convention. Build B's counterpart `$23BFC4` allocates type 8 with `($4,A0)=$D`
instead.

**Consequence for the port: 20 types is correct for build B, and anyone who
cross-checks against build A will find a 21st that must NOT be added.** This is
precisely the "a build-A reading quoted as a build-B fact" failure the brief
warns about, caught before it happened.

#### 8b. THE $813098-INDEXED TABLES - loop-2 data is READABLE even though the
flag never rises

Two tables are indexed by `$813098` directly:

| | build B | build A | reader |
|---|---|---|---|
| word table -> `$81B5B2` (hyper-meter CAP) | `$287DF0` | `$18692E` | `$28615E` / `$184DB8` |
| longword table of two sub-tables | `$28809E` | `$186BDC` | `$2859DC` / `$184636` |

`align` mapped `$287DF0 -> $18692E` and `$28809E -> $186BDC`; **both were then
confirmed exactly from the listing** (`lea $18692E,A0` at `$184DC0`,
`lea $186BDC,A0` at `$184640`). So two MEDIUM alignments verified HIGH by hand.

```
CAP TABLE   [0] B=56  A=56      <- W19 MEASURED 56 on loop 1. Confirms both.
            [1] B=90  A=90      <- THE LOOP-2 CAP. Never observable dynamically.
            [2] B=20  A=20
            [3] B=18  A=18
            [4] B=280 A=114     <- DIVERGES: the shared block ends at 4 words
PTR TABLE   [0] -> B $2880A6 / A $186BE4     (loop 1)
            [1] -> B $28811A / A $186C58     (loop 2)
            sub-table size $74 = 58 words, IDENTICAL in both builds
  loop 1: 0000 083C 083C 07F8 07F8 07B4 07B4 0770 0770 072C 072C 06E8 ...
  loop 2: 0000 083C 083C 083C 07F8 07F8 07F8 07B4 07B4 07B4 0770 0770 ...
```

Loop 2 repeats each value **three** times where loop 1 repeats it twice - a
slower ramp over the same value ladder. Both builds agree byte for byte.

**This is the general unlock for W31.** `$813098` has read 0 on every frame ever
measured, but every table it indexes carries its loop-2 row in ROM, and build A
carries the same row. So loop-2 CONSTANTS can be extracted at HIGH confidence
with no poking at all; only loop-2 BEHAVIOUR still needs the flag forced.

### 9. THE ISR QUESTION - SETTLED, on the run type NOTES-build-split asked for

`games/ddpdoj/NOTES-build-split.md` says the measurement it needed had not been
taken: "Reading the interrupt vectors on a default boot does not test this
claim... The measurement has to be taken after the chooser has selected
VERSION-B."

Taken. VERSION-B pinned (`ARM 23C212 = 1701`, `ARM 13C5B6 = 699` over 2,400
logic frames), vectors sampled every 300 logic frames from lf 300 to lf 2400:

```
VEC lf=300  irq4=0013BDAA irq6=0013BDBA
VEC lf=600  irq4=0013BDAA irq6=0013BDBA
...
VEC lf=2400 irq4=0013BDAA irq6=0013BDBA
```

**Build A's trampolines, on a VERSION-B run, at every sample. NOTES-build-split
is CONFIRMED.**

And the cross-build pairing says exactly what build B's unused copies are:

```
A $13BDAA  movem / jsr $1453A6 / movem / rte      <-- IRQ4, THIS ONE RUNS
B $23BDAA  movem / jsr $245CC8 / movem / rte      <-- exists, never vectored
A $13BDBA  movem / jsr $13C7D4 / movem / rte      <-- IRQ6, THIS ONE RUNS
B $23BDBA  movem / jsr $23C43A / movem / rte      <-- exists, never vectored
```

`align 13BDAA -> $23BDAA` HIGH, delta **exactly +$100000**, run=376. `$23C43A`
is the routine whose body is `jsr $23CC4E / $23D0F8 / $28C19A / tst.b $803940 /
jsr $24133C / $240CC0 / $240F26 / $287286 / subq.b #1,$803940 / jmp $23C158` -
i.e. **every build-B ISR address wave 2's phase table names is inside `$23C43A`,
and `$23C43A` is never vectored.** The note is right and now has its measurement.

**The pairs a later wave needs, so the RIGHT ISR gets ported:**

| runs (build A) | build B's unused twin | confidence |
|---|---|---|
| IRQ4 body `$1453A6` | `$245CC8` | HIGH (trampoline pairing is byte-identical) |
| IRQ6 body `$13C7D4` | `$23C43A` | HIGH (same) |

### 10. HOW WELL THE METHOD WORKS - MEASURED, not asserted

`rosetta.py calibrate` takes every `jsr abs.l` TARGET in the source build (a
routine entry both builds must have if they implement the same routine), aligns
a random sample, and asks whether the mapped address is also a `jsr` target in
the destination. Chance baseline: 658 targets over 409,600 even addresses in the
range = **0.16 %**.

```
ddpdojblk:B -> ddpdojblk:A   sample 250
  HIGH   n=189   99.5 %      <- ~600x chance
  MEDIUM n= 46   78.3 %
  LOW    n= 15   73.3 %
ddpdojblk:A -> ddpdojblk:B   sample 250
  HIGH   n=192   99.5 %
  MEDIUM n= 41   92.7 %
  LOW    n= 17   76.5 %
ddpdojblk:B -> ddpdojblkbl:B sample 150   HIGH n= 20 100.0 %  MEDIUM n= 84 96.4 %
ddpdojblk:A -> ddpdojb:A     sample 150   HIGH n=  4 100.0 %  MEDIUM n=101 95.0 %
ddpdojb:A   -> ddpdojp:A     sample 150   HIGH n=122 100.0 %  MEDIUM n= 22 100.0 %
```

Note the honest limit: "lands on a real routine entry" is NECESSARY, not
SUFFICIENT. It cannot distinguish the right entry from a neighbouring one. Every
HIGH pairing quoted in this log was additionally checked by reading both
listings, and two of them (`$287DF0`, `$28809E`) upgraded a MEDIUM to a
verified fact that way. **The rule for later waves: HIGH is usable as a lead and
must still be confirmed by disassembling both sides before it becomes a fact.**

Raw token-stream agreement per pair (share of source RAM tokens inside a
matching block; blocks of >= 8 in brackets):

```
ddpdojblk:B <-> ddpdojblk:A     96.5 %  [95.3 %]  longest run 772   <- THE PAIR
ddpdojb:A   <-> ddpdojp:A       99.9 %  [99.9 %]  longest run 3209
ddpdojblk:A <-> ddpdojblkbl:A   52.2 %  [40.1 %]
ddpdojblk:B <-> ddpdojblkbl:B   49.9 %  [37.4 %]
ddpdoj:A    <-> ddpdojb:A       42.8 %  [30.9 %]
everything else                ~30 %   [~19 %]
```

### 11. THE ROSETTA STONE IS NOT ddpdojp. IT IS BUILD A, IN OUR OWN CARTRIDGE.

This is the correction the brief most needs. **The other five sets do not share
our RAM map.** MEASURED - every absolute-long site of six landmark RAM addresses,
across all six images:

| RAM | blk A | blk B | blkbl | ddpdojp | ddp3 | ddpdoj | ddpdojb |
|---|---|---|---|---|---|---|---|
| `$80E240` object slots | 7 | 7 | **0** | **0** | **0** | **0** | **0** |
| `$8130F8` | 91 | 91 | **0** | **0** | **0** | **0** | **0** |
| `$812970` | 23 | 23 | 2 | **0** | **0** | **0** | **0** |
| `$813098` | 191 | 207 | 26 | 4 | **0** | **0** | 4 |
| `$80390A` frame counter | 40 | 43 | 83 | 4 | 4 | 4 | 4 |

and the object driver, located in every set by the byte pattern
`4BF9 0080xxxx / 70xx / 3215` (`lea $80xxxx,A5 / moveq #$13,D0 / move.w (A5),D1`):

| set | driver | slot table | slots |
|---|---|---|---|
| ddpdojblk A | `$1413FE` | `$80E240` | 20 |
| ddpdojblk B | `$2410C4` | `$80E240` | 20 |
| ddpdojblkbl A/B | `$1413FE` / `$24104E` | `$80E23C` | 20 |
| ddpdojp | `$140F24` | `$80E1A8` | 20 |
| ddp3 | `$140EB4` | `$80E402` | 20 |
| ddpdoj | `$14104C` | `$80E1B4` | 20 |
| ddpdojb | `$140F2A` | `$80E1A8` | 20 |

(The `lea` site is the third instruction of the driver; the ENTRY is 8 bytes
earlier - `$2410BC` / `$1413F6` for our cart.) **Every build has 20 object
slots.** And the RAM bases differ by $4, $8C, $98, $1C2 - I tested whether a
single constant rebase recovers the alignment and it does **not**: rebasing
ddpdojblkbl by -4 drops the token match from 52.2 % to 44.6 % and the longest run
from 1081 to 108. The other sets' RAM maps are relaid out, not shifted.

Two further facts about the candidates the brief hoped for:

* **ddpdojp is the same build as ddpdojb**, 99.9 % token agreement, longest run
  3209, same slot base `$80E1A8`, same version string date. It is not a richer
  debug build; it is 2002.04.05 Master with a different program-ROM layout.
* **ddpdojp / ddpdoj / ddpdojb do not even carry the 12-entry "STAGE  1 ...
  STAGE RE" name table** (one `"STAGE\0"` string each). Only ddp3 (2002.05.15
  World) and the Black-Label pair have it. So the location test is the WORST of
  the six for the stage-select question, not the best.
* **"UNPROTECTED" != decrypted.** ddpdojp and ddpdojblkbl load with no
  `ddp3_igs027a.bin` warning (every other set warns), so they have no ARM7 ASIC;
  their 68k program is still `pgm_py2k2`-encrypted in the file and still has to
  be dumped from a running machine.

What ddpdojblkbl IS good for: 97.5 % of its `$100000-$1C7FFF` is byte-identical
to ddpdojblk AT THE SAME OFFSET, and B->B calibration is HIGH 100 % / MEDIUM
96.4 %. It is a third opinion on code shape. It is NOT a third opinion on any
RAM address.

### 12. A BONUS THE MAP HANDED OVER: ~230 KiB IS DUPLICATED AT EXACTLY +$100000

MEASURED, 256-byte granularity, runs >= 4 KiB where build A's bytes equal build
B's at +$100000:

```
$100E00-$121500   $122900-$125900   $125B00-$130400   $130500-$139F00
```

So for any address in those ranges the cross-build map is **delta = +$100000,
byte-identical, confidence 100 %, no tool needed**. `$122838` (a data blob
loaded by `jsr $141844` in build A) is `$222838` in build B, and the two 2 KiB
windows compare equal. The ISR trampolines sit just above the shared region and
still pair at +$100000 exactly (`$13BDAA <-> $23BDAA`, HIGH).

### 13. THE CONFIDENT PAIRINGS THIS WAVE ESTABLISHED

Every row confirmed by reading BOTH listings unless the note says otherwise.

| build B | build A | what it is | confidence |
|---|---|---|---|
| `$2410BC` | `$1413F6` | object driver ENTRY (not `$1413FE`, which is +8) | HIGH, listings compared |
| `$240F62` | `$141294` | object dispatch table | HIGH, both dumped |
| `$241182` | `$1414BC` | object allocator | HIGH |
| `$2414BE` | `$1417F8` | (allocator sibling, `$80F886`) | HIGH |
| `$24150A` | `$141844` | loader called with `lea $2228xx/$1228xx,A0` | HIGH |
| `$241292` | `$1415CC` | driver tail / destroy | HIGH |
| `$241002` | `$14133C` | post-table routine, `move.w $80E880,D3` | HIGH, byte-identical |
| `$240D2C` | `$14105E` | called by the above | MEDIUM |
| `$23BFDC..$23C006` | `$13C356..$13C380` | THE MAIN LOOP, 7 calls in order | HIGH |
| `$23C212` | `$13C5B6` | frame sync (= the arm PC every probe prints) | HIGH |
| `$23D12A` | `$13D496` | input latch | HIGH |
| `$23D0F8` | - | input read `$C08000` -> `$803970`/`$803976` | build B listing |
| `$23BDAA` | `$13BDAA` | IRQ4 trampoline (A's runs) | HIGH, delta +$100000 |
| `$23BDBA` | `$13BDBA` | IRQ6 trampoline (A's runs) | HIGH, delta +$100000 |
| `$245CC8` | `$1453A6` | IRQ4 body | HIGH (from the trampolines) |
| `$23C43A` | `$13C7D4` | IRQ6 body - **build B's is never vectored** | HIGH |
| `$24C390` | `$14BA44` | the fall-through routine; first `rts` at +$166 in BOTH | HIGH |
| `$2603DA` | `$15F734` | the `$81308C` dbra clear loop (W17's "writers") | HIGH |
| `$290746` | `$18F214` | the `$813098 = 1` path, type 7 sub-state 2 | HIGH |
| `$290BE8` | `$18F698` | object type 7 handler | MEDIUM (dispatch tables agree; `align` says LOW) |
| `$25CEB8` | `$15C22C` | object type `$11`, spawned by the loop transition | HIGH |
| `$287DF0` | `$18692E` | `$813098`-indexed meter CAP table, `[0]=56 [1]=90` | HIGH, `lea` read on both sides |
| `$28809E` | `$186BDC` | `$813098`-indexed sub-table pointers, 58 words each | HIGH, `lea` read on both sides |
| `$2429C4` | `$142D14` | stage starter (`bset #3,$8130F8`, alloc type 6) | MEDIUM |
| `$23EFEE` | `$13F33C` | sprite emit called from `$24C390` twice | MEDIUM |
| `$259D04` | `$159250` | debug stage select handler | MEDIUM (state block + logic; `align` LOW) |
| `$259C4A` | `$1591E0` | its initialiser - **and this one DOES run**, lf 699 | MEDIUM + measured |
| `$259C42` | `$1591D8` | reads the selector `$812E0A`; 5 abs.l callers in B | HIGH |

### 14. WHAT THIS UNLOCKS, AND WHAT IT DOES NOT

**W31 (`$813098` and the fans).** Three things changed.
1. The writer inventory is now complete and correct: `$259DB0`/`$259DC6` (debug
   select, handler unreferenced in build B) and **`$290762` (object type 7
   sub-state 2, reachable, present in both builds)**. W10's "exactly two" and
   W17's "3 writes, all init" are both superseded - the latter was a `dbra`
   clear loop.
2. Every `$813098`-INDEXED CONSTANT can be read now, at HIGH confidence, from
   two builds, with no poking: meter cap 56 -> 90, and the 58-word ramp whose
   loop-2 row repeats each step 3x instead of 2x. Poking is still required for
   loop-2 BEHAVIOUR, not for loop-2 NUMBERS.
3. The DIP switch is real and MAME has it (`:DSW` field "Unknown", `$C08006`
   bit 7). It buys nothing in build B because the handler is unreferenced, but
   it is the correct lever in build A and it is a configuration, not a poke.

**Anything already ported.** `bounds` turns a fall-through judgement call into a
two-build offset comparison. `$24C390` is now confirmed. Run it on every routine
the port has translated; it costs seconds each.

**Table extents (the Gradius W21 problem).** `table` reads a table in both builds
and stops where the entries stop being pointers. The dispatch table came out 20
(B) / 21 (A) - a real difference that would have become a phantom object type if
anyone had cross-checked naively.

**The ISR.** Settled with the measurement the notes asked for, plus the exact
build-B twins so nobody ports them by mistake.

**What it does NOT unlock.**
* The boss script format (W30). Not attempted this wave.
* The 20 unreachable bullet kinds. Not attempted this wave.
* ddpdojp as an "atlas to cheat". It is the same build as ddpdojb, with a
  different RAM map from ours, and it has no stage-name table. It is a dead end
  for this project except as a fourth opinion on shared-library code.
* Reaching `$259D04` in build B. I could not; see 6b for exactly what I tried.

### 15. THINGS IN THE CORPUS THIS WAVE CONTRADICTS

1. `10-recon-flow.md` §6: "`$813098` ... is written at **exactly two**" - three,
   `$290762` was outside the stated `$23xxxx-$28xxxx` filter.
2. `17-impl-invuln-stage-run.md` §7: "`$813098` ... 3 writes, all init
   (`$15F73E`, `$2603E4` x2)" - those are one `dbra` clear loop sweeping the
   word, in build B and build A respectively; neither is a writer of the flag.
3. Wave 2 / the brief: "build A ... same table, same 20 slots ... allocator
   `$1414BC`" - the allocator is right; the driver ENTRY is `$1413F6`, and
   `$1413FE` is its third instruction. Build A's dispatch table has **21**
   entries, not 20.
4. The brief: "ddpdojp ... **4 MiB UNPROTECTED program**" - unprotected means no
   ARM7 ASIC. The program is still encrypted and must be dumped from a running
   machine, and only ~1.7 MiB of the 4 MiB EPROM is programmed.
5. The brief: ddpdojp as a second build at `$2xxxxx` - it has one build at
   `$10xxxx-$1C7FFF`; its `$2xxxxx` region is data.

## Files

* `games/ddpdoj/tools/rosetta.py` - the tool (new)
* `games/ddpdoj/tools/oracle/w21loop.lua` - the DIP + P2 + `$813098` + vector
  probe (new)
* `games/ddpdoj/rip/rosetta/img-*.bin` - six decrypted images (gitignored,
  reproducible with `python rosetta.py dump`)

status: DONE
