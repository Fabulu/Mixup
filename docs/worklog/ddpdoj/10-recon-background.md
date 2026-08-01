# Wave 10 recon — the playfield: tilemaps, scroll, stage-1 layout data

status: **DONE on the six questions asked, with the BLOCKERS named in §8.**
started / finished: 2026-08-01
role: recon (READER — nothing under `games/ddpdoj/src/` was touched)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER), the `$2xxxxx` build.
Every address below is build B unless the line says otherwise. Build-A twins are
given where the xref found them, because the A build is a free second reading.

New probes added by this wave (readers, no oracle command was changed):

```
games/ddpdoj/tools/oracle/bgrecon.lua    the census + per-frame TSV
games/ddpdoj/tools/oracle/bgrecon.py     driver: the stage1-open input script
games/ddpdoj/tools/oracle/bgrecon2.py    driver: attract | play, N frames
```

Runs behind every number here (each one asserted `fails=0` and build B):

```
python bgrecon.py  2600                     -> out/bgrecon.tsv     (play,   2600 lf)
python bgrecon2.py 4000 bg-attract attract  -> out/bg-attract.tsv  (attract,4000 lf)
python bgrecon2.py 7000 bg-deep    play     -> out/bg-deep.tsv     (play,   7000 lf)
```

13,600 logic frames total. `bgrecon.lua` uses only WRITE taps and sample-point
reads — a read tap on the 68000 fires on the prefetch and CURPC does not
identify an opcode fetch (`00-recon-hard.md` §3). Tap handles and the frame
notifier live in globals.

---

## 0. FIRST: the question's own address is wrong, and it matters

The brief says *"the bg_scale register at $B07000"*. Measured:

* **`$B04000` is `bg_scale`.** That is where wave 1/3 saw `0x210` and `0x610`
  written from PC `$0065E2` (the PGM BIOS, `move.w $80340E,$B04000`), and it is
  the address `frame.lua` already watches.
* **`$B07000` is the read-only current-raster-line register.** `00-recon-hard.md`
  §7/§10 counted 0 reads of it in every booted run and found no absolute-long
  code site. This wave did not re-open that.

Everything below about scale is about `$B04000`.

## 1. THE MAP — measured, not assumed

`bgrecon.lua` prints the MAME share sizes on every run:

```
PROBE SHARES bg_videoram=4096 tx_videoram=8192 rowscrollram=4096 sram=131072
```

and the game's own VRAM clear/RAM-test routines fix the 68k side of it
(`xref.py dasm 23C622 / 23C638 / 23C668`, and the service-mode RAM test at
`$2593AE/$2593C0/$2593D2` which walks `$900000→$904000`, `$904000→$906000`,
`$907000→$907400`):

| 68k range | what | clear routine (B / A) |
|---|---|---|
| `$900000..$903FFF` | **BG videoram** — 64×16 entries of 4 bytes; the tilemap the renderer reads is the first `$1000` bytes | `$23C638` / `$13C9A4` |
| `$904000..$905FFF` | **TX videoram** — 64×32 entries of 4 bytes | `$23C622` / `$13C98E` |
| `$907000..$9073FF` | **rowscroll** — 256 longwords cleared | `$23C668` / `$13C9D4` |
| `$B02000` | `bg_yscroll` | written by `$240CEC` |
| `$B03000` | `bg_xscroll` | written by `$240CEA` |
| `$B04000` | `bg_scale` | `$23C5EE` (game), `$0065E2` (BIOS) |
| `$B05000` / `$B06000` | `tx_yscroll` / `tx_xscroll` | `$23C5F8` / `$23C602` |
| `$B0E000` | `ctrl` | `$23C00E` — the **main-loop head**, every iteration |

**The cabinet is TATE, so read the register names rotated.** `bg_xscroll`
(`$B03000`) is the raster X axis = **the game's vertical scroll**, and it is the
one the stage program drives. `bg_yscroll` is the game's horizontal axis and
carries the camera's sideways drift.

## 2. WHO WRITES THE TILEMAPS PER FRAME — one PC each, measured

`play, 2600 lf`:

```
CENSUS bgvram writer PCs (20) 23C642:16384 13C9AE:16384 240D9A:2016 000E6C:512 ... 25BB98:196
CENSUS txvram writer PCs (23) 240D10:170072 141042:112168 14126C:46426 23C62C:24576 ...
CENSUS rowscroll writer PCs (3) 23C672:2048 13C9DE:512 000F44:256
CENSUS bg writes/logic frame max=16384  0:2499  18:97  16384:2  8388:1  270:1
CENSUS tx writes/logic frame max=12428  112:525 178:500 0:286 104:271 118:186 ...
CENSUS rowscroll writes/logic frame max=1024  0:2596  512:2  1024:1  768:1
```

`deep play, 7000 lf` and `attract, 4000 lf` reproduce the same three sets
(`240D9A:2214` / `240D9A:936`, `25BB98:392` / `25BB98:588`, rowscroll unchanged).

* **BG, in play, has exactly ONE per-frame writer: `$240D9A`** — the store inside
  `$240D76`. It fires **18 word-writes on 97 of 2,600 frames and 0 on the other
  2,499** (18 = 9 longwords × 2 word-writes on a 16-bit space). That is **one
  column of 9 tiles, written once per 32 px of scroll**, and nothing else.
  `$23C642`/`$13C9AE` are the clear loops; `$25BB98` is the static
  title/menu-screen loader at `$25BB7E` (a 14×7 block from `$2302E0`).
* **TX is rewritten every frame** by `$240D10` — the store inside `$240CF0`,
  a "draw a `D3+1 × D2+1` block of consecutive tile numbers at (D0,D1)" printer
  with 8 absolute-long call sites (`$23CDA0 $256F3E $256F68 $256F8E $257BAE
  $259FE8 $25A13A $25A166`) plus `$240D2C` from `$24101E`. This is the HUD /
  score / text, not scenery.
* **rowscroll is written by three PCs in 13,600 logic frames and all three are
  CLEAR LOOPS** (`$23C672` build B, `$13C9DE` build A, `$000F44` BIOS).

## 3. ROWSCROLL — all zero, every frame, in three scenarios

The probe reads `rowscrollram[0..223]` (the 224 raster lines
`src/render/igs023.js` actually indexes) at the sample point and reports the
distinct-count / non-zero-count / min / max:

```
play 2600 lf     CENSUS rowscroll[0..223] shape (1) d1/nz0/mn0000/mx0000:2600
attract 4000 lf  CENSUS rowscroll[0..223] shape (1) d1/nz0/mn0000/mx0000:4000
deep 7000 lf     CENSUS rowscroll[0..223] shape (1) d1/nz0/mn0000/mx0000:7000
```

**One distinct value, zero, on all 13,600 logic frames.** The static half:
`xref.py abs 907000` finds 8 absolute-long sites in the whole image and the two
in build B are the clear (`$23C668`) and the service-mode RAM test (`$2592D0`).

**This is a PRESENCE measurement and a bounded listing result, not an absence
proof.** A write through an address register is invisible to both halves, and
the corpus never left stage 1 (§6). The correct sentence is: *no scenario in
this corpus has ever produced a non-zero rowscroll value, and no absolute-long
site in build B writes one outside the clear.* Not "the game does not use
rowscroll".

## 4. `bg_scale` AND `ctrl` — measured across the whole corpus

```
CENSUS bg_scale at sample point (1) 0210:2600 / 0210:4000 / 0210:7000
CENSUS ctrl     at sample point (1) 001F:2600 / 001F:4000 / 001F:7000
CENSUS videoreg values written  scale=0210:2 scale=0610:2 (BIOS, PC 0065E2, pre-frame)
                                ctrl=001F ctrl=001E ctrl=0017 ctrl=001B ctrl=001A ctrl=0016 ...
CENSUS videoreg writer PCs      scale@0065E2:2  scale@23C5EE:1  scale@13C95A:1
```

The game's own write is a hard-coded constant:

```
23c5dc: lea $B04000,A0
23c5e2: move.w #$10,D0
23c5e6: ori.w #$200,D0
23c5ea: ori.w #$0,D0        <- an assembled-in zero; a patch slot, not a variable
23c5ee: move.w D0,(A0)      -> $0210
```

So: **the game writes `bg_scale` once, to `$0210`, and never touches it again in
13,600 logic frames of boot + attract + play.** The two non-`0210` writes are the
BIOS's, before the first logic frame, exactly as wave 3 recorded. `bg_scale` is
not a gameplay register in this corpus and the port can hold it at `0x210`.

`ctrl` is written **every main-loop iteration** from `$23C00E` (the loop head)
and is `0x001F` at every sample point. Bits 11/12/13 — TX disable, BG disable,
priority-only — are never set (no value above `0x7B` was ever written). The port
must still write it per iteration, because `ctrl` is in the renderer's contract.

## 5. THE SCROLL ENGINE — three layers, all read out of the listing and
## then confirmed frame-by-frame against the TSV

### 5a. The register upload, `$240CC0`, gated inside IRQ6

Wave 2 already listed this as gated call #9 ("an overrun frame does not update
the scroll registers"). Disassembled:

```
240cc0: lea $80B010,A0 / lea $B02000,A1 / lea $B03000,A2
240cd2: D0 = ($2,A0)    ; = $80B012, long
240cd6: D1 = ($6,A0)    ; = $80B016, long
240cda: lsr.l #6,D0     ; 1/64 px -> px
240cdc: lsr.l #6,D1
240cde: D0 -= $80B054   ; the SHAKE offset
240ce4: D1 -= $80B056
240cea: (A2) = D0       -> $B03000  bg_xscroll   (the game's VERTICAL scroll)
240cec: (A1) = D1       -> $B02000  bg_yscroll   (the game's HORIZONTAL drift)
```

Its only caller is `$23C45A`, inside the IRQ6 (A)-gate. `$B05000`/`$B06000` (TX
scroll) are written **once each at init** (`tx_yscroll=0`, `tx_xscroll=1`) and
never again — measured: `txy@23C5F8:1  txx@23C602:1` over 2,600 frames.

### 5b. The camera accumulators — TWO layers, `$80B010` (BG) and `$80B032` (TX)

```
240b0e  RESET      zero $80B012 $80B016 $80B026 $80B028 $80B02A $80B02E
                        $80B034 $80B038 $80B048..$80B050, $80B054/$80B056
240b94  SCROLL BG BY (D0,D1)      240c22  SCROLL TX BY (D0,D1)
        $80B02A += D0 (long)              $80B04C += D0
        D2 = $80B02A & ~$3F              (identical shape on $80B034/$80B038,
        $80B012 += D2                     $80B048/$80B04A, $80B03C/$80B03E)
        $80B02A &= $3F
        ...same for D1 -> $80B016
        $80B026 += D0.w ; $80B01A = -($80B026 & ~$3F) ; $80B026 &= $3F
```

**64 sub-units = 1 pixel**, the same 1/64 fixed point the player uses. The
registers only ever receive whole pixels; the fraction lives in `$80B02A`.
Callers: `$240B94` ← `$2611A6` (init) and `$261314` (per frame); `$240C22` ←
`$26119C` and `$26139A`. `$240B0E` ← `$23BF56 $25AC2E $25BB78 $25C7C2 $261174`.

Measured, and this is the fractional accumulator caught in the act: at script
speed `$20` the register advances `$40` on alternate frames and `$0` between —
exactly `(accum & ~$3F)`.

### 5c. The scroll object is a TOP-LEVEL OBJECT, type 1, priority `$1A`

`xref.py abs 26127A` → **one hit, `$240F6A`**. The dispatch table at `$240F62`
is *(handler, priority)* pairs of 8 bytes, ten types:

```
[0] $28D520 pri 09   [1] $26127A pri 1A  <- THE BACKGROUND   [2] $2491C0 pri 1C
[3] $249246 pri 1B   [4] $260B30 pri 09   [5] $28B5E0 pri 18  <- the weapons
[6] $28D63C pri 0A   [7] $290BE8 pri 1E   [8] $25A770 pri 0A  [9] $25CACA pri 0A
```

`$26127A` is the per-frame handler, `$26114C` the init. Wave 5's steady-state
census listed priority `$1A` among the eight live objects, so the background
object is live in the same window the port already compares.

Per frame (`$2612A0`, with A5 = the object record):

```
tst.w $8130D2 ; bne -> skip the whole thing        (SCROLL FROZEN; 814 of 7000 deep frames)
$813180 flag -> load ($1C,A5) from $813182, ($22,A5) from $813184
jsr ($26146C,PC)     the camera-follow gate
jsr $262062          THE STAGE SCRIPT INTERPRETER
$81317E -> ($8,A5)   the distance-counter mode
D6 = ($1C,A5)                                       BG SPEED, 1/64 px per frame
D1 = $81316E                                        the cross-axis delta
jsr $240B94                                         scroll the BG camera
($1E,A5) += D6 ; if >= $200 { -= $200 ; if ($8,A5)==0 $8130CE++ }
($20,A5) += D6 ; if >= $800 { -= $800 ; jsr $261F76 ; WRITE ONE COLUMN OF 9 TILES
                              from ($A,A5), ($E,A5) = (($E,A5)+1) & $3F }
$81318A = ($E,A5) ; $81318C = ($20,A5)
D6 = ($22,A5) ; jsr $240C22                         scroll the TX camera
jsr $26233A                                         the 8-slot background-element driver
jsr ($260EC8,PC)                                    THE SCREEN SHAKE
```

`$800` = 2,048 sub-units = **32 px = one BG tile**, `$200` = 512 = **8 px**.
So `$8130CE` counts 8-pixel steps of travelled distance and `$81318A` is a
**mod-64 ring cursor into the BG map's column axis** — the map is a 64-column
ring and the game writes the column just entering the screen.

### 5d. The screen shake, `$260EC8`

`$813186` selects a table at `$260F38`; `$813188` steps 4 bytes per frame through
a word-pair stream; the pairs land in `$80B054`/`$80B056`, which `$240CC0`
subtracts. `$813186 == 1` uses the pair as-is, anything else halves it
(`asr.w #1`). Terminator: a zero word → `$813186 = 0`, offsets cleared,
`jsr $23C4D0`. **Measured: `$813186 == 0` and `$80B054/$80B056 == 0` on all
7,000 deep-play frames — the shake never fired in this corpus.**

### 5e. The camera follow, `$2614C0` — and what `$813176` actually is

```
2614c0: if $8103E6 >= 0: A6 = $810448          ; the two player records
2614ce: D0 = ($4,A6) ; D0 -= $1C00 ; D0 = divs.w #$C8 ; D0 <<= 6 ; D0 -= ($28,A5)
2614e4: $81316A = D0                            the REQUESTED cross delta
2614ea: bsr $2613B4                             clamp to +-$800/frame, flag $81317A
2614ee: $81316E = D0                            the ACTUAL cross delta (fed to 5c)
2614f4: D1 = ($28,A5) ; D2 = D1>>6 ; D1 = D2<<6
2614fe: $813170 = $813172 ; $813172 = D1
26150e: D0 = $813174 ; $813174 = D2 ; D2 -= D0 ; D2 <<= 6
26151e: $813176 = D2                            <- THE PER-FRAME CROSS-AXIS DELTA
261524: $813178 -= D2
```

**`$813176` is NOT the stage scroll.** It is the whole-pixel change in the
camera's *cross* (game-horizontal) offset, in 1/64 px, and it is what the enemy
driver (`$26352E`), the shot driver (`$253AA6`) and the background-element driver
(`$26234E`) subtract from their records. Measured over 7,000 deep frames:
`0000:6886  0040:73  FFC0:41` — i.e. ±1 px on 114 frames and zero on the rest.
The main vertical scroll needs no such compensation because objects are already
in camera space along that axis. `$81316E` carries identical values.

## 6. THE STAGE PROGRAM — a byte-coded VM, and where stage 1's data lives

### 6a. The interpreter, `$262062`, clocked by DISTANCE not by frames

```
262062: D7 = $8130CE                    ; THE CLOCK = 8-pixel steps travelled
262068: A6 = $813192 ; D6 = 1           ; TWO PARALLEL SCRIPTS, $18-byte blocks
262070: A1 = (A6) ; D1 = (A1)+          ; time
        if D1 == $FFFF -> next script   ; terminator
        if D1 != D7    -> next script   ; EXACT equality
        A1 += 2                         ; the cond word is SKIPPED, not tested
        D2 = (A1)+                      ; op
        A2 = (($2620C2,PC) + D2) ; jsr (A2)
        (A6) = A1 ; loop                ; several records may share one time
262096: A6 += $18 ; dbra D6             ; script 1 -> $8131AA
26209E: a deferred callback: $8131C4 with countdown $8131C2
```

Record layout: `time:u16, cond:u16 (always $FFFF in stage 1), op:u16, payload`.
The op word is a byte offset into a 7-entry longword table at `$2620C2`:

| op | handler | payload | what it does — read from the listing |
|---|---|---|---|
| `$0000` | `$2620DE` | 1 w | **SPAWN N OBJECTS**: walk N `(ptr:long, param:word)` from the script's object stream (block `+$4`), `jsr $24150A` each; `$FFFFFFFF` ends the stream |
| `$0004` | `$262102` | 3 w | **REWIND + REPEAT the tilemap column stream**: `ptr += (signed w)*36`, repeat count `w+1`, loop count `w` (`$FFFF` = forever) |
| `$0008` | `$26213A` | 1 w | **SET SCROLL SPEED** → `($1C,A5)` (BG) or `($22,A5)` (TX) |
| `$000C` | `$26214C` | 0 w | **FREEZE the distance counter** (`($8,A5)=1`) and remember `$8130CE+4` for the resume |
| `$0010` | `$262160` | 3 w | **SPAWN A BACKGROUND ELEMENT** into the 8-slot `$8131C8` table via `$262366`, at cross coord `low - $800 - $813170`; skipped while fast-forwarding |
| `$0014` | `$262180` | 1 w | **CUE STREAM** (block `+$8`), 3 sub-ops: arm a deferred callback; `jsr $28C170`; `jsr $28C186` with a word |
| `$0018` | `$2621D6` | 1 w | sets `$81B414`/`$81B416` flags (1/2/3…) |

`$261F76` is the freeze/repeat partner: it counts `($14,A0)` down each new column,
decrements the loop count `($10,A0)`, and when it expires clears `($8,A5)` and
**writes `($16,A0)` back into `$8130CE`** — i.e. the script resumes at the time
op `$000C` stashed.

**The fast-forward path is real and load-bearing**: `$26200E`, at init, if
`$8130CE != 0` runs the interpreter once for every clock value `0..$8130CE-1`
with `$813190 = 1` (which suppresses op `$0010`). That is how a mid-stage restart
rebuilds the background state.

### 6b. Where stage 1's data lives — every offset checked for consistency

`$26152C` (called from `$261FDA`): a 5-entry pointer table at `$26153E` indexed by
`$813096` (stage index × 4). Each entry is a 2-longword struct = the two scripts:

```
stage0 $261552 -> [$261610, $26179A]      stage3 $26156A -> [$261C0E, $261CE6]
stage1 $26155A -> [$2618DA, $26199E]      stage4 $261572 -> [$261DA8, $261EDC]
stage2 $261562 -> [$261A62, $261B36]
```

Each script begins with two longwords (object stream, cue stream) and then the
records. A walker written from the payload sizes above lands **exactly** on both
terminators, which is the structural check that the sizes are right — get any
one of them wrong and the walk desyncs and never sees `$FFFF`:

```
stage1 script0 $261610: header [$26157A, $261602], records $261618..$261797,
      41 records, 384 bytes, terminator $FFFF at $261798
      ops: 16x $08 (speed)  13x $10 (bg element)  6x $00 (spawn)
            2x $04 (repeat)  2x $0C (freeze)       2x $14 (cue)
stage1 script1 $26179A: header [0, 0], records $2617A2..$261821,
      16 records, 128 bytes, ALL of them op $08
object stream   $26157A: 22 entries of (long, word), terminator $FFFFFFFF at $2615FE
```

Script 1 being nothing but speed records is why the TSV shows
`$80B034 == $80B012` and `$80B038 == $80B016` on every one of 13,600 frames:
**the TX camera is driven at exactly the BG's speeds.**

Two more 5-entry tables inside the scroll object:

```
$261252  per-stage BG PALETTE block   [$227E58 $229DF8 $22A9E8 $22CF70 $22FAE0]
         -> jsr $2415E8 (D0=0, D1=$1F): 32 blocks of 64 bytes into $80F086
            = palette shadow $80E886 + $800 = palette word $400 = the BG base,
            then $80FA68 = 1 (the "palette dirty" flag the gated uploader reads)
$261266  per-stage BG COLUMN STREAM   [$225B78 $228658 $22A5F8 $22B1E8 $22D770]
$240D62  per-stage BG TILE BASE, added to every map longword by $240D88:
         [$0AA90000 $12A90000 $1AA90000 $1EA90000 $26A90000]
```

The column stream is **9 longwords = 36 bytes per column**, `(tileDelta:u16,
attr:u16)`, and the streams are exactly bounded by the palette blocks:

```
stage0 $225B78..$227E58   8928 B = 248 columns (7936 px)  1820 distinct BG tiles $AA9..$11C6
stage1 $228658..$229DF8   6048 B = 168 columns (5376 px)  1404 distinct        $12AA..$1891
stage2 $22A5F8..$22A9E8   1008 B =  28 columns ( 896 px)   252 distinct        $1AAA..$1BA5
stage3 $22B1E8..$22CF70   7560 B = 210 columns (6720 px)  1890 distinct        $1EAA..$260B
stage4 $22D770..$22FAE0   9072 B = 252 columns (8064 px)  2268 distinct        $26AA..$2F85
palettes: five blocks of exactly $800 bytes = 32 palettes x 32 colours
```

**All five gaps are exact multiples of 36 and all five palette blocks are exactly
`$800`.** That is five independent consistency checks on one reading, and it is
why I am confident in the layout rather than merely plausible. Total BG map data
for the whole game: 906 columns, 32,616 bytes, plus 10,240 bytes of palette.

The first three columns of stage 1 read `0052 0053 0054 0055 0056 0057 0058 0059
005A | 0049..0051 | 0040..0048` — contiguous runs, as a hand-drawn map is.

### 6c. THE SCRIPT, DECODED AND THEN CONFIRMED FRAME-BY-FRAME

Stage-1 script 0, the opening (`time  op  args`):

```
0000  08 0200        speed = $200 (8.0 px/frame)
0034  04 FFE4 001C 0002    rewind 28 columns, repeat 28, loop twice
0034  0C                   freeze the clock; resume at $38
0038  00 0006        spawn 6      0039  00 0008        spawn 8
003A  00 0004        spawn 4      003C  08 01C0        speed 7.0 px
0044  08 0180        6.0 px       004C  08 0140        5.0 px
0054  08 0100        4.0 px       005C  08 00C0        3.0 px
0060  08 0080        2.0 px       0068  08 0040        1.0 px
0090  10 000C 70000C00   background element        0092  10 0001 70000000
0098  08 0020        0.5 px       009E  10 0002 70002400
00C0  10 0000 70000A00                     00E0  00 0001
00E5  08 0010        0.25 px      00E7  08 0008        0.125 px
...   (40 records, ending 0344 04 FFF2 000E FFFF / 0344 0C / FFFF)
```

Measured, `out/bg-deep.tsv`, the frame at which `$80B012`'s per-frame delta
changes and the value of `$8130CE` on that frame:

```
lf=1621 speed=$200 d0ce=0001      lf=1954 speed=$C0  d0ce=005C
lf=1905 speed=$1C0 d0ce=003C      lf=1964 speed=$80  d0ce=0060
lf=1915 speed=$180 d0ce=0045      lf=1996 speed=$40  d0ce=0068
lf=1925 speed=$140 d0ce=004C      lf=2379 speed=$20  d0ce=0098 (alternating $40/$0)
lf=1938 speed=$100 d0ce=0054
```

**`003C 0044 004C 0054 005C 0060 0068 0098` in the ROM against
`003C 0045 004C 0054 005C 0060 0068 0098` measured** — the one-off at `$0045` is
the sample point reading the counter after the increment. That is the script,
executing, in the numbers.

And the freeze/repeat, which is the part that would have been impossible to guess:
`$8130CE` sits at **`$0034` from lf1700 to lf1899** while `$81318A` keeps
advancing (columns keep being written from the rewound stream), and then
**jumps straight to `$0038` at lf1900** — exactly `$34 + 4`, the value op `$000C`
stashed. Both halves of the mechanism, observed.

## 7. ATTRACT vs PLAY — the same code, measured

`bgrecon2.py 4000 bg-attract attract` chooses VERSION-B and then presses nothing.

```
CENSUS bgvram writer PCs   240D9A:936   25BB98:588   (+ the clears)
CENSUS $813176 scroll delta  0000:3700  0040:166  FFC0:134
$813096 (stage index)      0000 on all 4000 frames
speed changes at d0ce = 003C 0045 004C 0054 005C 0060 0068 0098   <- identical
```

**The attract/demo path runs the same object type 1, the same `$26127A`, the same
stage-1 script and the same column stream.** The only difference the census shows
is `$25BB98` running more (the title/menu tilemap loader) and `$813176` moving on
300 frames instead of 114 — a demo player that flies further sideways than my
scripted one. Nothing in the background is attract-specific.

Consequence for the port: **there is no separate "attract renderer" to build.**
The demo page's background can come from the same simulation the game uses.

## 8. WHAT I COULD NOT DO, AND WHY

1. **I never left stage 1.** `$813096` was `0000` on all 13,600 frames. The
   5-stage tables in §6b are read out of the listing; only entry 0 is measured.
   Stages 2–5 and every boss are *presence unknown*, and the two things most
   likely to differ there are exactly the two I am reporting as quiet: rowscroll
   and `bg_scale`.
2. **The screen shake never fired** (`$813186 == 0`, 7,000 frames). `$260EC8` is
   listing-only. Its trigger was not located.
3. **`$8130D2` (the scroll freeze) was 1 on 814 of 7,000 deep-play frames and I
   did not find its writer.** It gates the entire background handler, so a port
   that ignores it will scroll through a boss.
4. **Ops `$0000`, `$0010`, `$0014`, `$0018` were decoded but not followed
   through.** `$24150A` (the object create the spawn op calls) has 150
   absolute-long call sites and was not disassembled here; the object stream
   `$26157A` (22 `(long, word)` pairs ending `$FFFFFFFF` at `$2615FE`) was
   dumped but not interpreted; `$28C170`/`$28C186` (the cue targets, almost
   certainly sound) were not opened.
5. **I did not resolve why MAME's `bg_videoram` share is 4,096 bytes while the
   game's own clear loop writes `$4000` bytes at `$900000`.** It does not affect
   the port — the per-frame writer's index is `(row*64 + col)*4` with `row ≤ 8`
   and `col ≤ 63`, i.e. always below `$1000` — but the discrepancy is real and I
   am not going to invent a mirror to explain it.
6. **No port code was written and nothing was gated.** This wave adds
   `bgrecon.lua/.py/2.py` as readers only. The TSV columns proposed in the work
   units below have never been compared against anything.

## 9. IF SOMEONE PICKS THIS UP COLD

```
python games/ddpdoj/tools/oracle/bgrecon.py 2600                    the play census
python games/ddpdoj/tools/oracle/bgrecon2.py 4000 bg-attract attract
python games/ddpdoj/tools/oracle/xref.py dasm 26127A 400    the background handler
python games/ddpdoj/tools/oracle/xref.py dasm 262062 100    the script interpreter
python games/ddpdoj/tools/oracle/xref.py dasm 240B94 200    the camera accumulators
python games/ddpdoj/tools/oracle/xref.py dasm 240CC0 50     the register upload
python games/ddpdoj/tools/oracle/xref.py ptrtable 240F62 4 20   (stride is really 8)
```

Six things that will save you the hours they cost me:

1. **`bg_scale` is `$B04000`, not `$B07000`.** `$B07000` is the raster line.
2. **`$813176` is the camera's CROSS-axis delta, not the stage scroll.** It is 0
   on 98 % of frames. The stage scroll lives in `($1C,A5)` → `$80B02A` →
   `$80B012` → `$B03000`.
3. **The stage script is clocked by DISTANCE (`$8130CE`, 8-px steps), not by
   frames**, and the clock can be frozen and rewritten. A port that ticks it per
   frame will desync the moment the first repeat block runs — at time `$0034`,
   about 200 frames into stage 1.
4. **`$240F62` is a table of `(handler, priority)` PAIRS with stride 8.** Reading
   it as 20 longword handlers gives you `$090000` as a function pointer.
5. **The BG map is a 64-column RING** written one column ahead; `$81318A` is the
   cursor. There is no full-stage map in RAM to snapshot.
6. **Attract and play share everything.** Do not build two paths.
