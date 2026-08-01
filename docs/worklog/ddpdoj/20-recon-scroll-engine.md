# Wave 20 recon 1/5 — THE WHOLE SCROLLING LEVEL: the scroll program end to end

status: **DONE on the six questions asked**, with the blockers named in §9.
date: 2026-08-01
role: recon (READER — nothing under `games/ddpdoj/src/` was touched, nothing committed)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx–$29xxxx`) unless the line says otherwise (`NOTES-build-split.md`).

New tools this wave, both READERS, both under `games/ddpdoj/tools/oracle/`:

```
scrollmap.py    the STATIC decoder: the five per-stage tables, every script
                record of all ten scripts, the object/cue streams, the BG-element
                tables, the tile census, and a frame-exact SIMULATION of the
                scroll program (subcommands: tables script scripts sim cols elem tiles)
scrollgate.py   the VALIDATOR: replays scrollmap's model one logic frame at a
                time against a measured bgrecon TSV, gated by the measured
                $8130D2, and counts divergent frames on four columns
```

No emulator was run this wave. The validation in §7 reuses wave 10's existing
`out/bg-deep.tsv`, `out/bgrecon.tsv` (13,600 logic frames already on disk).

---

## 0. THE HEADLINE NUMBER THE OWNER ASKED FOR

**Stage 1 is 7,317 logic frames — 122.0 s at 60 Hz — and 8,486 pixels of scroll,
from stage start to the boss lock. The 161-frame capture covers 1.9 % of it.**

| | stage 1, whole | the capture (`fly-around`, lf 2000..2160) | covered |
|---|---|---|---|
| logic frames | **7,317** (122.0 s) | 161 | **2.20 %** |
| scroll distance | **8,486 px** | 160 px | **1.89 %** |
| BG map columns written | **265** (+15 pre-filled) | 5 | **1.89 %** |
| distance-clock ticks (`$8130CE`) | **836** | 20 | **2.39 %** |
| stage-1 script records executed | **57** | 0 | **0 %** |

The last row is the one to read twice. The capture window sits between record
`t=$0068` (frame 375, speed → 1.0 px/f) and record `t=$0090` (frame 694, the
first background element). **The recording contains no scroll-program event at
all** — it is 161 frames of constant-speed scrolling taken from the quietest
stretch of the stage, and everything the scroll VM does is outside it.

Measured, not asserted: capture frames lf2000→lf2160 move `$80B012` from
`$29180` to `$2B980` = `$2800` sub-units = **160 px**, and `$81318A` (the ring
cursor) from `$21` to `$26` = **5 columns**. Read from
`assets/capture.json`'s per-frame `regs` (bg_xscroll 2629 → 2789) and cross-read
from `out/bg-deep.tsv` rows lf2000/lf2160.

## 1. THE SUBSYSTEM, CONFIRMED AND CORRECTED

Wave 10 (`10-recon-background.md`) called it "a 7-opcode VM with four camera
routines". **Verified — with two corrections and one closure:**

* the VM has exactly **7 opcodes**, table `$2620C2`, 7 longwords (§3);
* the camera is **four routines** — `$240B0E` reset, `$240B94` BG accumulate,
  `$240C22` TX accumulate, `$240CC0` register upload;
* **CORRECTION (wave 10 §6b):** the column streams and the palette blocks are
  **INTERLEAVED**, not two separate regions. Wave 10 happened to bound each
  stream by its own palette (right) and each palette by `$800` (right), so its
  numbers are right, but the layout sentence in that worklog reads as two
  blocks and it is one alternating block: `stream0 pal0 stream1 pal1 … pal4`;
* **CLOSURE (wave 10 blocker 3, `$8130D2`'s writer): FOUND** — §6;
* **NEW ABSENCE (listing-proven): `$261F84` — the repeat/rewind entry point for
  SCRIPT 1 — has no caller of any kind in build B.** Scanned all of
  `$230000..$2A0000` for `jsr.l`, `jmp.l`, `bsr` (all three displacement widths)
  and `jsr (d16,PC)`: zero hits. Script 1 therefore can never rewind, which is
  exactly why all five stages' script 1 is nothing but speed records (§4).

## 2. THE MAP OF THE SUBSYSTEM — every table, from the ROM

Five parallel per-stage tables, all indexed by `$813096` (= stage index × 4):

```
$26153E  script pair       -> {script0, script1}      read by $26152C
$261252  BG palette block  -> $2415E8 (D0=0,D1=$1F)   read at $2611B2
$261266  BG column stream                             read at $2611D6
$240D62  BG tile base, ADDED to every map longword    read at $240D80
$262302  BG-element handler table                     read at $262328 -> $8132C8
```

`python scrollmap.py tables`, ACTUAL output:

```
stage  scriptpair  script0   script1   palette   colstream tilebase   elemtab
  0    $261552    $261610  $26179A  $227E58  $225B78  $0AA90000 $26224A
  1    $26155A    $2618DA  $26199E  $229DF8  $228658  $12A90000 $26227E
  2    $261562    $261A62  $261B36  $22A9E8  $22A5F8  $1AA90000 $26229E
  3    $26156A    $261C0E  $261CE6  $22CF70  $22B1E8  $1EA90000 $2622D6
  4    $261572    $261DA8  $261EDC  $22FAE0  $22D770  $26A90000 $2622F2

column streams (each bounded by its OWN stage's palette block):
  stage0 $225B78..$227E58    8928 B   248.000 columns  OK    7936 px
  stage1 $228658..$229DF8    6048 B   168.000 columns  OK    5376 px
  stage2 $22A5F8..$22A9E8    1008 B    28.000 columns  OK     896 px
  stage3 $22B1E8..$22CF70    7560 B   210.000 columns  OK    6720 px
  stage4 $22D770..$22FAE0    9072 B   252.000 columns  OK    8064 px
  TOTAL 32616 B  906 columns
palette blocks (bounded by the NEXT stage's column stream):
  stage0..3 exactly 2048 B each; stage4's upper bound is not derivable here
```

Nine independent consistency checks in that one output: five stream lengths ≡ 0
mod 36, four palette blocks exactly `$800`.

**Column record: 9 longwords = 36 bytes**, `(tile:u16, attr:u16)` per row, nine
rows written per column by `$26135A`'s `dbra D6` loop with `D6 = 8`.

**The ring writer, `$240D76`, exactly as written:**

```
240d7a: D2 = $813096            ; stage x 4
240d80: A0 = ($240D62,PC) + D2  ; the per-stage tile base
240d86: D2 = (A0) ; D4 += D2    ; base ADDED to the whole longword
240d8a: D0 = (D0 << 6) + D1     ; row*64 + col
240d8e: D0 <<= 2                ; *4
240d92: ($900000 + D0) = D4
```

Row 0..8, column 0..63 → the write is always below `$1000`, which is why MAME's
4,096-byte `bg_videoram` share never truncates anything (wave 10 open item 5 is
therefore harmless — still unexplained, still harmless).

## 3. THE VM — record format and all seven opcodes, from the listing

Interpreter `$262062`, called once per frame from `$2612D2`:

```
262062: D7 = $8130CE               ; THE CLOCK: 8-px steps travelled
262068: A6 = $813192 ; D6 = 1      ; TWO scripts, $18-byte state blocks
262070: A1 = (A6) ; D1 = (A1)+     ; time word
        if D1 == $FFFF -> next script
        if D1 != D7    -> next script      ; EXACT equality, never >=
262082: addq.w #2,A1               ; the SECOND WORD IS SKIPPED, not tested
262084: D2 = (A1)+                 ; op = a BYTE OFFSET into the table
262086: A2 = ($2620C2,PC) + D2 ; A2 = (A2) ; jsr (A2)
262092: (A6) = A1                  ; several records may share one time
262096: A6 += $18 ; dbra D6        ; script 1 block = $8131AA
26209E: the deferred callback: $8131C4 with countdown $8131C2
```

**Record = `time:u16, unused:u16, op:u16, payload`.** `python scrollmap.py
script 0` reports the second word is `$FFFF` on all 57 stage-1 records and the
interpreter never reads it — it is padding, not a condition. (Wave 10 called it
`cond`; the listing shows it is skipped unconditionally. Same bytes, honest
name.)

| op | handler | payload | semantics, translated as written |
|---|---|---|---|
| `$00` | `$2620DE` | 1 w = N | **SPAWN N**: walk N `(ptr:long, param:word)` from the script's object stream (`+$4`), `jsr $24150A` on each; `$FFFFFFFF` ends the stream; the cursor is written back |
| `$04` | `$262102` | 3 w | **REWIND + REPEAT**: `colptr += (signed w)*36` **immediately**, `($C,A6)=colptr` saved, `($12,A6)=len`, `($14,A6)=len+1`, `($10,A6)=loops` |
| `$08` | `$26213A` | 1 w | **SPEED** → `($1C,A5)` for script 0, `($22,A5)` for script 1. Units: **1/64 px per frame** |
| `$0C` | `$26214C` | 0 w | **FREEZE the clock**: `($8,A5)=1`, `($16,A6) = $8130CE + 4` |
| `$10` | `$262160` | 3 w (word + long) | **SPAWN A BG ELEMENT**: id → the per-stage handler table via `$262366`; the long's low word gets `- $800 - $813170`; **skipped while `$813190` (fast-forward) is set** |
| `$14` | `$262180` | 1 w = N | **CUE**: N sub-records from the cue stream (`+$8`), 3 sub-ops (`$2621AA`): 0 = arm the deferred callback (`word→$8131C2, long→$8131C4`), 1 = `jsr $28C170`, 2 = `word→D1, jsr $28C186` |
| `$18` | `$2621D6` | 1 w | **POWER/FLAG LADDER**: level 1..N sets `$81B414`, `$81B416`, `$81B418`, `$81B41A`… to 1. Used only by stage index 4 (3 records) |

`$28C170` / `$28C186` are `jsr $28BBAC` with `D0 = $15` / `$16`, and the stage-1
deferred callback `$28CB88` is `jsr ($28CAFC,PC)` with `D0 = $C, D7 = $FF`:
**the cue stream is the SOUND/BGM channel of the stage script.**

**The repeat/unfreeze partner, `$261F76`** — called once per new column, from
`$261348`, BEFORE the column is read:

```
261f8e: A2 = ($C,A0) ; if 0 -> rts          ; no repeat armed
261f9c: ($14,A0) -= 1 ; if > 0 -> rts       ; countdown
261fa4: if ($10,A0) == $FFFF -> $261FD0     ; INFINITE loop: always rewind
261fb0: ($10,A0) -= 1 ; if > 0 -> $261FD0
261fb8: ($C,A0) = 0 ; ($8,A5) = 0 ; $8130CE = ($16,A0)   ; DONE: unfreeze + resume
261fd0: ($14,A0) = ($12,A0) ; (A1) = A2                  ; reload + rewind
```

Consequence, and it is the part nobody would guess: **the countdown is armed at
`len+1` and reloaded at `len`, so the loop count word is exactly the number of
`len`-column passes**, and the stream ends up back where it started before the
rewind. `04 FFE4 001C 0002` = "back up 28 columns, play those 28 columns twice,
carry on" = 56 columns of scrolling that consume zero net stream.

## 4. THE COMPLETE SCRIPT INVENTORY — all ten scripts of the cartridge

`python scrollmap.py scripts`, ACTUAL output:

```
stage/scr  addr     recs  bytes  ops
  0/0   $261610    41    384  $00x6 $04x2 $08x16 $0Cx2 $10x13 $14x2
  0/1   $26179A    16    128  $08x16
  1/0   $2618DA    19    186  $00x4 $04x1 $08x2 $0Cx1 $10x8 $14x3
  1/1   $26199E     2     16  $08x2
  2/0   $261A62    21    202  $00x2 $04x1 $08x6 $0Cx1 $10x8 $14x3
  2/1   $261B36     6     48  $08x6
  3/0   $261C0E    23    206  $00x8 $04x1 $08x5 $0Cx1 $10x5 $14x3
  3/1   $261CE6     5     40  $08x5
  4/0   $261DA8    35    298  $00x5 $04x1 $08x18 $0Cx1 $10x4 $14x3 $18x3
  4/1   $261EDC    18    144  $08x18
  GRAND $00(SPAWN)x25 $04(REPEAT)x6 $08(SPEED)x94 $0C(FREEZE)x6
        $10(BGELEM)x38 $14(CUE)x14 $18(FLAG)x3
  total records: 186
```

**186 records is the WHOLE GAME's scroll program**, loop 1, all five stages.
Stage 1 is 57 of them. That is the denominator, and it is small.

## 5. STAGE 1, EVERY RECORD, DECODED (`scrollmap.py script 0`)

Script 0, `$261610`, header `[objstream $26157A, cuestream $261602]`, records
`$261618..$261797`, terminator `$FFFF` at `$261798`. **Frame/px/column columns
come from §7's validated simulation, not from the ROM.**

| addr | time | op | what | frame | px | col |
|---|---|---|---|---|---|---|
| `$261618` | `$0000` | `08` | speed `$0200` = **8.000 px/f** | 0 | 0 | 0 |
| `$261620` | `$0034` | `04` | rewind **−28** cols, len 28, **2 loops** | 52 | 416 | 28→0 |
| `$26162C` | `$0034` | `0C` | **FREEZE**, resume at `$0038` | 52 | 416 | |
| — | — | — | *(repeat runs 56 columns; unfreeze)* | **279** | 2240 | 28 |
| `$261632` | `$0038` | `00` | spawn 6 | 280 | 2240 | 28 |
| `$26163A` | `$0039` | `00` | spawn 8 | 281 | 2248 | 28 |
| `$261642` | `$003A` | `00` | spawn 4 | 282 | 2256 | 28 |
| `$26164A` | `$003C` | `08` | 7.000 px/f | 284 | 2272 | 29 |
| `$261652` | `$0044` | `08` | 6.000 | 294 | 2342 | 31 |
| `$26165A` | `$004C` | `08` | 5.000 | 304 | 2402 | 33 |
| `$261662` | `$0054` | `08` | 4.000 | 317 | 2467 | 35 |
| `$26166A` | `$005C` | `08` | 3.000 | 333 | 2531 | 37 |
| `$261672` | `$0060` | `08` | 2.000 | 343 | 2561 | 38 |
| `$26167A` | `$0068` | `08` | 1.000 | 375 | 2625 | 40 |
| `$261682` | `$0090` | `10` | bgelem **id 12** arg `$70000C00` | 694 | 2944 | 50 |
| `$26168E` | `$0092` | `10` | bgelem **id 1** `$70000000` | 710 | 2960 | 50 |
| `$26169A` | `$0098` | `08` | 0.500 | 758 | 3008 | 52 |
| `$2616A2` | `$009E` | `10` | bgelem **id 2** `$70002400` | 854 | 3056 | 53 |
| `$2616AE` | `$00C0` | `10` | bgelem **id 0** `$70000A00` | 1398 | 3328 | 62 |
| `$2616BA` | `$00E0` | `00` | spawn 1 | 1910 | 3584 | 70 |
| `$2616C2` | `$00E5` | `08` | 0.250 | 1990 | 3624 | 71 |
| `$2616CA` | `$00E7` | `08` | **0.125 px/f** (the slowest in the game) | 2054 | 3640 | 72 |
| `$2616D2` | `$00EE` | `10` | bgelem **id 3** | 2502 | 3696 | 74 |
| `$2616DE` | `$00F0` | `08` | 0.500 | 2630 | 3712 | 74 |
| `$2616E6` | `$00FE` | `10` | bgelem **id 5** `$70003000` | 2854 | 3824 | 78 |
| `$2616F2` | `$0113` | `00` | spawn 1 | 3190 | 3992 | 83 |
| `$2616FA` | `$0114` | `10` | bgelem **id 4** | 3206 | 4000 | 84 |
| `$261706` | `$0126` | `10` | bgelem **id 6** `$70001800` | 3494 | 4144 | 88 |
| `$261712` | `$0140` | `00` | spawn 2 | 3910 | 4352 | 95 |
| `$26171A` | `$0146` | `10` | bgelem **id 8** | 4006 | 4400 | 96 |
| `$261726` | `$014E` | `10` | bgelem **id 7** `$70003000` | 4134 | 4464 | 98 |
| `$261732` | `$0170` | `10` | bgelem **id 9** | 4678 | 4736 | 106 |
| `$26173E` | `$018C` | `10` | bgelem **id 10** `$70002800` | 5126 | 4960 | 113 |
| `$26174A` | `$01AD` | `10` | bgelem **id 11** | 5654 | 5224 | 122 |
| `$261756` | `$01DA` | `14` | **cue** ×1 → sub-op 2, `$28C186(0)` | 6374 | 5584 | 133 |
| `$26175E` | `$01E4` | `08` | 1.000 | 6534 | 5664 | 136 |
| `$261766` | `$01E8` | `08` | 2.000 | 6566 | 5696 | 137 |
| `$26176E` | `$01F2` | `14` | **cue** ×1 → sub-op 0, arm `$28CB88` cd 0 | 6606 | 5776 | 139 |
| `$261776` | `$01F8` | `08` | 3.000 | 6630 | 5824 | 141 |
| `$26177E` | `$0218` | `08` | 4.000 | 6716 | 6082 | 149 |
| `$261786` | `$0344` | `04` | rewind **−14**, len 14, **loops `$FFFF` = FOREVER** | 7316 | 8482 | 224→210 |
| `$261792` | `$0344` | `0C` | **FREEZE** | 7316 | 8482 | 210 |

**THE BOSS STOP IS THOSE LAST TWO RECORDS.** `04 FFF2 000E FFFF` + `0C` = park
the clock at `$0344` and loop map columns **210..223** forever. `$261F76`'s
`$FFFF` arm always takes the rewind branch, so nothing in the script can ever
end it: **the stage-1 boss lock is permanent until something OUTSIDE the VM
intervenes** (`$813180`/`$813182` push a new speed, or `$25FCFA` freezes and
destroys the whole background object at stage end — §6).

Script 1, `$26179A`, 16 records, **all op `$08`, identical times and identical
speeds to script 0**. That is the listing's reason for wave 10's measured
`$80B034 == $80B012` on 13,600 frames: the TX camera is literally given the same
speed program. Header is `[0, 0]` — no object stream, no cue stream.

**Object stream `$26157A`, 22 entries of `(long, word)`, terminator `$FFFFFFFF`
at `$2615FE`** — and the six SPAWN records consume `6+8+4+1+1+2 = 22`
**exactly**. Entries (ptr, param):

```
$2238B8/000A  $223878/000B  $2237F8/000C  $223838/000D  $2239B8/000E
$223938/000F  $246BB8/0018  $2252B8/0019  $2243F8/001A  $2242F8/001B
$224338/001C  $224438/001E  $224378/001D  $225278/001F  $2244B8/0013
$224478/0014  $2245F8/0015  $2244F8/0016  $224538/0012  $223938/000F
$224578/0013  $2245B8/0014
```

Twenty-one of the twenty-two point into the `$22xxxx` data region; **one,
`$246BB8`, points into build-B CODE** and is flagged in §9.

**Cue stream `$261602..$26160F`, 14 bytes**, consumed exactly by the two CUE
records: `0002 0000` (sub-op 2, `$28C186(D1=0)`) then `0000 0000 0028CB88`
(sub-op 0, arm `$28CB88` with countdown 0). No `$FFFF` needed and none present —
the boundary lands precisely on `$261610`, the script-0 header. Another
consistency check that would have failed on a wrong payload size.

**BG-element handler tables**, `python scrollmap.py elem N`:

```
stage0 $26224A  13 entries  $2623A4 $2623FC $26244A $26249C $2624EE $26253C
                            $26258A $2625D8 $262626 $262674 $2626C2 $262710 $26275E
stage1 $26227E   8   stage2 $26229E  14   stage3 $2622D6   7   stage4 $2622F2   4
```

**Stage 1 uses ids 0..12, each exactly once, and the table has exactly 13
entries.** Stage 1's script has 8 BGELEM records and its table has 8 entries;
stage 4's has 4 and 4. (Stages 2 and 3 have 14/8 and 7/5 — unused entries there.)
Each handler is a 4-line constructor of the shape seen at `$2623A4`:

```
2623a4: ($10,A6) = #$22CBCC    ; the sprite/pixel table
2623ac: ($14,A6) = #$24D0      ; a parameter word
2623b2: ($8,A6)  = #$2623C2    ; the per-frame updater
2623ba: ($D,A6)  = #$14        ; ... then the updater scroll-compensates via
2623c2:   if $8130DA -> die ; D0 = ($2,A6) + $4800 ; if < 0 -> die
2623dc:   jsr $24179E ; jmp $23DF2A          <- the sprite enqueue
```

## 6. `$8130D2` — WAVE 10's OPEN BLOCKER, CLOSED

`$8130D2` gates the ENTIRE background handler (`$2612A0: tst.w $8130D2 / bne
$2613A0`) and 60+ other read sites in build B. Wave 10 could not find its writer.

**It has exactly two writers, both one-instruction leaf routines:**

```
25fd82: move.w #$1,$8130D2 ; rts        SET
25fd8c: clr.w  $8130D2     ; rts        CLEAR
```

Reference scan over `$230000..$2A0000` for `jsr.l`, `jmp.l`, `bsr` (byte/word/long
displacement) and `jsr (d16,PC)`:

```
$25FD82  bsr@25FCFA  bsr@25FDE0  jsr.l@288AD0
$25FD8C  bsr@25FDD2
```

and `$25FDD2`/`$25FDE0` are both inside the alive-player counter `$25FD94`:

```
25fd94: A2 = $8130FA ; A3 = $81311E     ; the two player records
25fda0: $81308C = 0 ; += 1 per player with ($18,An) != 0
25fdc2: $81308C -= 1 ; $81308E = $81308C
25fdd2: bsr $25FD8C                     ; UNFREEZE
25fdd4: if $81308E == $FFFF: bsr $25FD82   ; ALL PLAYERS DEAD -> FREEZE
```

`$25FD94` is called from four sites in the life machine (`jsr (d16,PC)` at
`$25FF2E $26005C $2601E4 $2602B0`).

**`$8130D2` = "every player is dead". It is the death pause.** Confirmed against
wave 10's own data, which nobody read this way: in `out/bg-deep.tsv` the flag is
1 on **exactly one contiguous run, lf 3289..4102 (814 frames)**, and at lf4103
`$8130CE` and `$80B012` both go to 0 — the run died, sat out the pause, and the
game reset to the title. The other writer, `jsr $25FD82` at `$288AD0`, is in the
banner/message object and freezes the scroll for a message.

The third mover of the same machinery, unchanged from wave 10 and still
listing-only: `$813180` → load `($1C,A5)`/`($22,A5)` from `$813182`/`$813184`
(an external speed override), and `$81317E` → set/clear `($8,A5)` (an external
freeze). Neither was seen non-zero in any TSV on disk.

## 7. THE VALIDATION — 0 DIVERGENT FRAMES over 1,668 measured logic frames

Enumeration is the ROM's job; the verdict is the board's. `scrollgate.py` runs
the §3/§5 model one logic frame at a time, **skipping every frame the board
itself skipped** (measured `$8130D2`), and compares four columns.

```
$ python scrollgate.py out/bg-deep.tsv    0 1620 0        (deep play, 7,000 lf)
  reset detected at lf=4103 -- window ends here
  frames compared: 1668   handler-skipped ($8130D2=1): 814
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0

$ python scrollgate.py out/bgrecon.tsv    0 1620 0        (play, 2,600 lf)
  frames compared: 980   handler-skipped ($8130D2=1): 0
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0

$ python scrollgate.py out/bg-attract.tsv 0 2636 0x38     (attract, 4,000 lf)
  frames compared: 1364   handler-skipped ($8130D2=1): 0
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0
```

Columns compared: `$8130CE` (the distance clock), `$81318A` (the mod-64 ring
cursor), `$81318C` (the `($20,A5)` column accumulator) and `$80B012` (the BG
camera's along-axis register, modelled through `$240B94`'s exact
`&~$3F` / `&$3F` split). **4,012 logic frames, four columns, zero divergences,
across two entry clocks.**

**And the third run found something.** The attract TSV does not align at ANY
frame offset with an entry clock of 0 (`scrollgate.py sweep` over k=1000..2600:
best is 279 clock divergences and 1,644 `b012` divergences — i.e. no alignment).
It aligns to **zero divergences at entry clock `$0038`**. That is the resume
value the opening `0C` FREEZE stashes: **the attract demo creates the background
object with `($6,A5) = $0038` and skips the entire opening rewind/repeat/freeze
block, arriving at the first spawn.** Which in turn is a byte-exact confirmation
of `$26200E`'s fast-forward path as modelled: replay the interpreter for clocks
`0..$37`, **restore `($A,A5)`/`($10,A5)` from the stack** (`$262028` push /
`$26203C` pop — so the replayed `04` rewind is undone), and clear the repeat
state at `$81319E`/`$8131B6`. Model any one of those three wrong and the attract
run diverges immediately.

Wave 10 wrote "attract and play share everything — do not build two paths".
Correct about the code; **the entry clock differs**, and a port that starts the
attract page at clock 0 will show the wrong 2,240 pixels of stage 1.

Three things this proves that no listing reading could:

1. **The repeat/freeze arithmetic is right to the frame.** The model puts the
   `$0034` freeze at frame 52 and the unfreeze at frame 279; wave 10 measured
   the clock jumping `$0034 → $0038` at **lf1900** = sim frame 280 with
   `lf = simframe + 1620`. Every one of wave 10's nine measured speed-change
   frames lands on the same `+1620` constant.
2. **The `len+1` / `len` countdown reading is right.** Read it as `len`/`len` and
   the unfreeze lands 4 frames early; read the loop word as "extra passes" and it
   lands 112 frames late. Both go red immediately on this gate.
3. **The fast-forward path (`$26200E`) is right**, including the two details a
   reader would drop: the pointer save/restore and the repeat-state clear.

Not proven: everything past lf3288 of the deep run. **The corpus has never
reached stage 1 past clock `$00D0` in play (frame 1,668 of 7,317) or `$00E1` in
attract.** §9.

## 8. THE OTHER THREE QUESTIONS

### 8a. Tilemap sources for the whole stage, and how much data it is

`python scrollmap.py tiles`:

```
stage0: 248 columns, 2232 map entries, 1820 distinct tile numbers $0AA9..$11C6,
        24 distinct attr words ($0000,$0002,..,$001E and up)
stage1: 168 cols, 1512 entries, 1404 tiles $12AA..$1891, 16 attrs
stage2:  28 cols,  252 entries,  252 tiles $1AAA..$1BA5,  1 attr  ($0000)
stage3: 210 cols, 1890 entries, 1890 tiles $1EAA..$260B, 12 attrs
stage4: 252 cols, 2268 entries, 2268 tiles $26AA..$2F85, 31 attrs
```

Stage-1 tile numbers are the stream word **plus** the per-stage base
`$0AA90000`; the five ranges are disjoint, so the whole game is **7,634 distinct
BG tiles**. Stage 1's byte budget:

| item | source | bytes |
|---|---|---|
| column stream | `$225B78..$227E57` | **8,928** |
| palette block (32 × 32 colours) | `$227E58..$228657` | **2,048** |
| script 0 records + header | `$261610..$261797` | 392 |
| script 1 records + header | `$26179A..$261821` | 136 |
| object stream | `$26157A..$2615FE` | 136 |
| cue stream | `$261602..$26160F` | 14 |
| **all of the above** | | **11,654 B** |
| 1,820 BG tiles, packed in the igs023 ROM (5 bpp, 640 B/tile) | | **1,164,800** |
| the same tiles decoded to 1 byte/pixel | | **1,863,680** |

So the stage-1 *program and map* is **11.4 KB** — trivially portable — and the
whole cost is the tile pixels, exactly as `PLAN-no-recordings.md` L7/W15 says.
The bundle currently harvests **415** tiles from the capture; stage 1 needs
**1,820**. Whole game: 32,616 B of streams + 10,240 B of palettes + 7,634 tiles
(4,885,760 B packed).

**Every column of stage 1's stream is NOT used.** The program reads columns
**0..223**; the stream has **248**. 24 columns / 864 bytes / 768 px of map are
never reached by a clean run (§9 item 3).

### 8b. The rowscroll mechanism (`:igs023:rowscrollram`, 4,096 B) and what drives it

**Mechanism** (`src/render/igs023.js:93`, from MAME's `igs023_video.cpp`): for
each raster line `y`, the BG layer samples the 2048×512 tilemap at
`sx = (bg_xscroll + rowscroll[y]) & 0x7FF`. It is a **per-raster-line additive
offset to bg_xscroll**, and since the cabinet is TATE and `bg_xscroll` is the
game's VERTICAL scroll, a non-zero entry would push one game-*column* up or down
independently — a vertical shear, not a horizontal one.

**What drives it in DoJ: nothing.** Static, both builds, every absolute-long
reference to `$907000` in the 6 MB image (`xref.py abs 907000`, `lea 907000`):

```
$006934 $00DFE2   PGM BIOS clear
$13C9D4/$13C9D6   build-A clear loop
$23C668/$23C66A   build-B clear loop        ($900000->$904000, $904000->$906000,
$158866 $158968   build-A SERVICE-MODE RAM TEST ($907000->$907400, walking
$2592D0/$2592D2   build-B SERVICE-MODE RAM TEST   pattern at $15898E / $2592xx)
$2593D2/$2593D4
```

Disassembled `$158866` and `$158968` this wave to be sure they were not an
effect: both are the `$15898E` walking-pattern RAM test, i.e. **there is not one
gameplay writer of rowscroll in either build at any absolute-long site.** Wave 10
adds the dynamic half: one distinct value, zero, on all 13,600 logic frames.

The hardware/driver sizes disagree and it is worth writing down: MAME's share is
**4,096 B**, the game clears and tests only `$907000..$9073FF` = **1,024 B** =
256 longwords, and the renderer indexes `[0..223]`. Nothing reads or writes
`$907400..$907FFF` in the image.

**The honest sentence:** *no absolute-long site in either build writes a non-zero
rowscroll value, and no frame in a 13,600-frame corpus has ever held one.* Not
"the game does not use rowscroll" — a write through an address register stays
invisible to both halves, and every stage past 1 is unmeasured.

### 8c. The other four stages, for scale

`python scrollmap.py sim N` (listing-derived, no external override, no
`$8130D2`):

| stage idx | frames to lock | seconds | px | columns written | stream cols | ends with |
|---|---|---|---|---|---|---|
| 0 (stage 1) | **7,317** | 122.0 | 8,486 | 265 | 248 | infinite 14-col loop + freeze |
| 1 | 8,473 | 141.2 | 4,898 | 153 | 168 | infinite loop + freeze |
| 2 | 833 | 13.9 | 416 | 13 | 28 | infinite **28**-col loop at clock `$0034` |
| 3 | 11,900 | 198.3 | 6,245 | 195 | 210 | infinite loop + freeze |
| 4 | 17,338 | 289.0 | 6,704 | 209 | 252 | **speed `$0000`** — the scroll stops dead |

Loop 1's scroll programs total **45,861 logic frames ≈ 12.7 minutes of
scrolling**, excluding every boss fight (those happen *inside* the locks and are
not counted). Stage index 2 is the outlier and it is not a bug: it has 28 columns
of map and locks into them after 14 seconds — a short arena stage.

## 9. WHAT I COULD NOT DO, AND WHAT IS STILL WRONG TO GUESS

1. **The corpus stops at clock `$00D0`, frame 1,668 of 7,317 (22.8 %).** Every
   TSV on disk dies or resets there. §7's zero divergences cover the opening,
   the first repeat/freeze, and the whole speed ramp — and **nothing after
   `$00D0`**: not the 9 later background elements, not the two cues, not the
   final boss lock. A wave that ports this must produce a longer scenario
   (invulnerable, ≥9,000 lf) before claiming stage 1.
2. **The infinite boss lock has no exit inside the VM and I did not find its
   exit outside it.** `$813180`/`$813182`/`$813184` (external speed) and
   `$81317E` (external freeze) are the two mechanisms that exist; neither has
   been seen non-zero, and I did not hunt their writers. A port that assumes the
   background resumes after the boss is guessing.
3. **24 of stage 1's 248 map columns (864 B, 768 px) are unreachable** by the
   script as decoded. Either the boss lock is exited by an external mechanism
   that resumes the stream (item 2), or they are unused data. **Do not delete
   them from the export on my say-so** — this is arithmetic over a listing, not
   a measurement.
4. **Object stream entry 7 is `$246BB8`, a build-B CODE address** where the
   other 21 are `$22xxxx` data. `$24150A` (the create) has ~150 absolute-long
   call sites and was not disassembled this wave, so I cannot say whether that
   entry is a different record kind or a data island inside the code region.
   Flagging it rather than smoothing it.
5. **Ops `$00` and `$10` were decoded but not followed.** `$24150A`'s record
   format is unopened; `$262366`'s 8-slot element table (`$8131C8`, `$20` bytes
   per slot) and the 13 stage-1 element handlers were read only as far as their
   constructor shape (§5). The sprite tables they point at (`$22CBCC`,
   `$22DA70`, …) are unsized.
6. **`$80B03C`** is read by `$24179E` to scroll-compensate every background
   element and I did not find its writer — it is not written by `$240B94` or
   `$240C22`. A ported element that ignores it will drift.
7. **The screen shake `$260EC8` is still cold** (`$813186 == 0`, 7,000 frames)
   and its trigger is still unlocated. Unchanged from wave 10.
8. **`$8130DA`** gates the element updaters (`$2623C2: tst.w $8130DA / bne ->
   die`) — unidentified, unmeasured.
9. **Nothing was measured this wave.** Every dynamic number here is wave 10's
   data re-read. That is deliberate (the validator needed no new runs) but it
   means the machine pin, build check and `fails=0` assertions in §7 are wave
   10's, not mine.

## 10. IF SOMEONE PICKS THIS UP COLD

```
python games/ddpdoj/tools/oracle/scrollmap.py tables      the five per-stage tables
python games/ddpdoj/tools/oracle/scrollmap.py script 0    stage 1, every record
python games/ddpdoj/tools/oracle/scrollmap.py scripts     all ten scripts, counted
python games/ddpdoj/tools/oracle/scrollmap.py sim 0       the frame/px/column timeline
python games/ddpdoj/tools/oracle/scrollmap.py tiles       the tile census, all stages
python games/ddpdoj/tools/oracle/scrollgate.py out/bg-deep.tsv    0 1620 0
python games/ddpdoj/tools/oracle/scrollgate.py out/bg-attract.tsv 0 2636 0x38
```

Six things that will save the hours they cost me:

1. **The clock is not a frame counter and it is not monotonic.** `$8130CE` ticks
   once per `$200` of scroll, can be FROZEN, and can be **written backwards** by
   `$261F76`'s resume. The interpreter matches on **exact equality**, so a clock
   that skips a value skips a record forever.
2. **`04`'s countdown is `len+1` then `len`.** The loop word is the number of
   passes. Off-by-one here moves the unfreeze by 4 frames and `scrollgate.py`
   catches it instantly.
3. **The record's second word is padding, not a condition.** `$262082` is
   `addq.w #2,A1` — it is never read.
4. **`$8130D2` is "all players are dead"** (`$25FD94`), and the background
   handler does not run at all on those frames. Anything that models the scroll
   per-frame must be gated by it or it runs 814 frames ahead by the first death.
5. **Script 1 cannot rewind.** `$261F84` has no caller in build B, and all five
   stages' script 1 is speed-only. Do not build a second repeat machine.
6. **The background object has an ENTRY CLOCK, `($6,A5)`, and attract uses
   `$0038`.** The stage start uses 0 (`$25FD7A: move.w #$0,($6,A0)`). Everything
   downstream of it — `($20,A5) = (clock&3)*512`, `colptr = base +
   (clock>>2)*36`, the `$26200E` replay — is derived from that one word.
