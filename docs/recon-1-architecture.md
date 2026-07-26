# RECON-1 — Code Architecture & Banking

ROM: `Batman - Return of the Joker (USA, Europe).gb` — 131072 bytes, 8 banks,
header `$0147=$01` (MBC1), `$0148=$02` (128 KB), `$0149=$00` (no cart RAM),
licensee `$014B=$BB` (Sunsoft), title `BATMAN ROJ`, `$0143=$00` (DMG-only).

Tooling produced by this pass (all in `tools/`):

| script | purpose |
|---|---|
| `banktrace.py` | bank-context-aware tracer: constant-folds `LD A,n / LD [$2000],A` so CALLs into `$4000-$7FFF` resolve to the right physical bank; optional `--jt` follows `JP HL` dispatch tables |
| `bankscan.py` | brute-force scan for every write to the MBC1 bank register + surrounding idiom |
| `bankclass.py` | statistical code-vs-data classifier per bank |
| `dump.py` | linear disassembly of an arbitrary `(bank, start, end)` window |

Regenerated listings live in `disasm2/bank_XX.asm` (bank-aware; the original
`disasm/` set mis-attributes every `$4xxx` target to bank 0 — see *Tooling
caveat* at the end).

```
python tools/banktrace.py "Batman - Return of the Joker (USA, Europe).gb" --jt --coverage --switches --jtlist --unresolved
python tools/banktrace.py "Batman - Return of the Joker (USA, Europe).gb" --jt --outdir disasm2
```

---

## 1. Boot path

`$0100 NOP / JP $0150`. Everything below is bank 0.

| addr | stage |
|---|---|
| `$0150` | `XOR A` → `rIF`, `rIE`, `rTIMA`, `rTMA`, `rTAC` = 0. Also the **soft-reset target** (`$0A57` jumps here when the reset combo is held). |
| `$0150-$0179` | zero-fill WRAM/HRAM (`LD BC,$xxxx` + `DEC BC` loops), then `XOR A; LD [$C000],A` |
| `$017D-$0183` | `rIF=0`, `rIE=0`, `DI`, `LD SP,$CFFF` (stack top = `$CFFF`, grows down) |
| `$0186` | `CALL $09DD` — LCD off (waits `rLY==$91`, then clears `rLCDC` bit 7) |
| `$0189` | `CALL $09C2` — copies the 10-byte **OAM-DMA routine** from `$09D0` into HRAM `$FFF0` |
| `$018C-$0199` | bank 1 → `$C703`/`$2000`; then bank 7; |
| `$019E` | `CALL $4000` **in bank 7** — sound-hardware init (`NR52`, `NR51`, `NR50`, `NR30/32/34`, `NR10`, clears sound RAM `$C800..$C94C`) |
| `$01A1-$01AA` | restore bank 1 |
| `$01AB-$01BD` | fill VRAM `$8000-$9FFF` with `$2F` using the `LD SP,$9FFF` + `PUSH DE` trick (fastest clear on LR35902), then `LD [$9800],A` |
| `$01BE` | `LD SP,$CFFF` (restore stack) |
| `$01C1-$01C9` | `CALL $0A77` — memset `$8000`, `$1800` bytes, `D=0` (clear tile RAM) |
| `$01CC` | `CALL $0A61` — clear shadow OAM `$C000-$C09F` (again with the SP trick) |
| `$01D4-$01FB` | **generates 192 bytes of machine code at `$C4CB`** — a 64×unrolled `LD A,[HL+] / LD [DE],A / INC E` copier terminated by `RET` (see §6) |
| `$01FC-$0228` | init HRAM game vars, `CALL $0B15` twice (`A=$02`, `A=$1B`) to load font/title tiles, fill `$9C00` with `$2F` |
| `$022E-$0247` | bank 5 excursion → `LD DE,$52F5; CALL $0A0E` (VRAM script = Sunsoft copyright text) |
| `$0248-$0255` | timer setup: `rTMA=$BB`, `rTIMA=$BB`, `rTAC=$04` (4096 Hz, enabled) ⇒ IRQ every `256-$BB = 69` ticks ≈ **59.4 Hz sound tick** |
| `$0257-$0260` | `rIF=0`, `rIE=$05` (VBlank+Timer), `EI` |
| `$0261-$0263` | `rLCDC=$E7` — **LCD on** (BG+OBJ+WIN on, WIN map `$9C00`, tiles `$8000`, 8×16 OBJ) |
| `$0265-$0278` | fade in (`CALL $0A7F` with `C=$80`), copyright screen delay loop |
| `$027D-$035A` | Sunsoft logo → title screen build (bank 5/6 excursions) |
| `$02C4` | **title/menu loop** (`CALL $0A4F` = wait VBlank; polls `$FFE2`) |
| `$03DC` | **option-screen loop** |
| `$04BB-$0564` | level entry: `CALL $333F`, LCD off, clear `$9C40`, per-level VRAM script `$32A3`, wipe ~40 game-state vars, `CALL $2889` (level gfx), `$0C34` (level map → `$D000`), `$104E`, `$0D50`, `$4DDA` (bank 1) |
| **`$0567`** | **MAIN GAME LOOP head** |
| `$0650` | `JP $0567` — loop back |

### Main loop body (`$0567` → `$0650`)

```
0567  poll pause/level flags, CALL $0F7B (HUD), CALL $29E7
057D  per-level special-case scroll bookkeeping ($C742/$C743)
05AD  CALL $0BC6            ; draw a metasprite
05B7  CALL $121F            ; camera / scroll update
05BA  CALL $4230  (bank 1)  ; ACTOR UPDATE LOOP  ($C1E8, 16-byte records)
05BD  CALL $1336            ; ?background/parallax state
05C6  CALL $2CBE            ; per-level logic
05C9  CALL $2C13
05CC  CALL $3A35
05CF  CALL $4E0C  (bank 1)  ; player state machine
05D6  CALL $4BB0  (bank 1)  ; conditional, on $C733
05EF  CALL $7AD3  (bank 1)
05FE  pause handling; bank 7 excursions CALL $405D / $4083 (sound pause/resume)
064A  CALL $0C1F            ; clear unused shadow-OAM entries
064D  CALL $0A4F            ; WAIT FOR VBLANK  (HALT until $FFE7 cleared)
0650  JP $0567
```

`sub_00_0A4F` is the frame gate and also the soft-reset check:

```
0A4F  3E 01     LD A,$01
0A51  E0 E7     LDH [$FFE7],A     ; "frame pending" flag
0A53  F0 E1     LDH A,[$FFE1]     ; held buttons
0A55  FE 0F     CP $0F
0A57  CA 50 01  JP Z,$0150        ; A+B+Select+Start -> soft reset
0A5A  76        HALT
0A5B  F0 E7     LDH A,[$FFE7]
0A5D  A7        AND A
0A5E  20 F3     JR NZ,$0A53
0A60  C9        RET
```

---

## 2. Interrupt vectors

| vector | contents | used |
|---|---|---|
| `$0040` VBlank | `JP $0653` | **yes** |
| `$0048` STAT/LCDC | `JP $0857` | **yes** (only when `rIE=$07`) |
| `$0050` Timer | `JP $095F` | **yes** |
| `$0058` Serial | `RETI` | no |
| `$0060` Joypad | `RETI` | no |

`rIE` is `$05` (VBlank+Timer) during normal play and `$07` (+STAT) whenever a
raster split is armed — written at `$0EB7`, `$0EDE`, `$0F2D`, `$35C7`, `$38C3`,
always paired with `rSTAT=$40` (LYC interrupt) at `$0EA6`, `$0ECD`, `$0F15`,
`$35B6`, `$38AF`.

### VBlank `$0653`

1. `PUSH AF/BC/DE/HL`.
2. If `$FFE7 == 0` (main loop not waiting) → set `$C757=1` and skip straight to
   `$081E` (lag-frame path: only SCX/SCY are refreshed).
3. `CALL $FFF0` — **OAM DMA from `$C000`** (HRAM stub, 10 bytes, see §6).
4. If `$FFB0 == 6` skip the transfer block.
5. **Column transfer**: descriptor at `$C100` — `[C100]=dest hi`, `[C101]=dest lo`,
   then 18 (or 9 when `$FFB0` is 9/`$0A`) tile bytes written with `ADD HL,BC`
   (`BC=$0020`) stride, i.e. a vertical tilemap column for horizontal scrolling.
   `$99xx` wrap handled at `$0688` (`LD H,$99; LD A,$08; RST $30`). Clears `$C100` when done.
6. **VRAM script drain** (`$0714`): if `[$C61B] != 0` run `CALL $0A0E` on it.
7. **2×2 tile-write queue drain** (`$0727`): entries at `$C130`, 6 bytes each
   `{dest hi, dest lo, t0, t1, t2, t3}` written as two pairs `$20` apart;
   terminated by a zero byte; clears `$C130` and `$FF9F` (queue cursor).
8. **Row transfer** (`$074E`): if `$FF9B/$FF9C != 0`, copy 33 bytes from `$C5CB`
   to that VRAM address (horizontal tilemap row for vertical scrolling).
9. **Tile transfer** (`$07BC`): if `$FF99/$FF9A != 0`, `LD HL,$C58B` and
   `CALL $C4CB` — the generated 64-byte copier (4 tiles of graphics).
10. **Joypad read** (`$07CC-$07F6`): standard two-nibble read, `$FFE1` = held,
    `$FFE2` = newly pressed (`old XOR new AND new`).
11. Frame counter `$FFB1++`, then `rWX,rWY,rBGP,rOBP0,rOBP1` written from
    `$FFAB..$FFAF`, `$FFE7=0`, `$C757=0`.
12. `$081E`: `rSCX,rSCY` from `$FFA9/$FFAA`; if `$FFC7==7` re-arm the LYC chain
    (`rLYC=0`, `$C764/$C765` reset, palette-cycle counter at `$C765` ping-pongs 0..11).
13. `POP HL/DE/BC/AF; RETI`.

**The VBlank handler never touches `$2000`** — it is bank-agnostic and only
reads bank-0 code + RAM. That is what makes the un-guarded bank excursions in
the main loop safe.

### STAT/LYC `$0857` — raster effects

A state machine dispatched on `$FFC7` (0..7). Each state writes `rSCX`/`rSCY`
mid-frame and programs the next `rLYC`:

| `$FFC7` | at | does |
|---|---|---|
| 0 | `$0878` | `rSCY = $FFAA - 2` every 8th frame, `rSCX = $FFCC`, `rLYC = $70`, next state 1 |
| 1 | `$0898` | `rSCX=$FFA9`, `rSCY=$FFAA`, `rLYC=$22`, next 0 |
| 2 | `$08A9` | `rSCX=[$C742]` (parallax layer 1), `rLYC=$30`, next 3 |
| 3 | `$08BC` | `rSCX=[$C743]` (parallax layer 2), `rSCY=$FFAA+3`, `rLYC=$40`, next 4 |
| 4 | `$08DD` | `rSCX=$FFA9`, `rLYC=0`, next 2 |
| 5 | `$08EA` | `rWX=$A8` (window off) |
| 6 | `$08F0` | **per-scanline sine wobble**: `rSCX = $FFA9 + sine[( LY>>1 + $FFB1) & $1F]` using the 32-entry signed table at **`$09A2`**; also sets `rOBP1=$80`, `rOBP0=$90`; advances `rLYC` by 4 |
| 7 | `$0935` | 16-bit fractional scroll accumulator at `$C763/$C764`, `rLYC++`, `rBGP=$1B` past line `$44` |

This is a genuine scanline-accurate effect: **a JS port cannot render this with
a single full-frame blit.**

### Timer `$095F` — sound tick (~59.4 Hz)

```
095F  FB           EI                     ; re-enables IRQs immediately (nested)
0960  F5           PUSH AF
0961  F0 EA        LDH A,[$FFEA]          ; re-entrancy guard
0964  20 3A        JR NZ,$09A0
0966  3D           DEC A                  ; A=$FF
0967  E0 EA        LDH [$FFEA],A
0969  C5 D5 E5     PUSH BC/DE/HL
096C  F0 A1        LDH A,[$FFA1]          ; sound-queue read index (0,2,4,6)
096E  4F 06 00     LD C,A / LD B,$00
0971  21 FB C6     LD HL,$C6FB            ; sound command queue
0974  09           ADD HL,BC
0975  2A E0 D3     LD A,[HL+] / LDH [$FFD3],A   ; song / sfx id
0978  7E E0 D2     LD A,(HL)  / LDH [$FFD2],A   ; command bitmask
097B  F0 A1 C6 02  LDH A,[$FFA1] / ADD A,$02
097F  FE 07 38 01  CP $07 / JR C,+1
0983  AF           XOR A                  ; wrap 0..6
0984  E0 A1        LDH [$FFA1],A
0986  AF 32 77     XOR A / LD [HL-],A / LD (HL),A   ; free the slot
0989  F3           DI
098A  3E 07        LD A,$07
098C  EA 00 20     LD [$2000],A           ; bank 7  -- NOTE: $C703 NOT written
098F  FB           EI
0990  CD 2B 41     CALL $412B             ; sound driver tick (bank 7)
0993  F3           DI
0994  FA 03 C7     LD A,[$C703]
0997  EA 00 20     LD [$2000],A           ; restore whatever the foreground had
099A  AF E0 EA     XOR A / LDH [$FFEA],A
099D  E1 D1 C1     POP HL/DE/BC
09A0  F1 D9        POP AF / RETI
```

This is the **only** place the shadow variable is used as a *save/restore*
rather than a mirror, and it is exactly why `$098C` deliberately does not
update `$C703`.

---

## 3. THE BANKING MECHANISM

**There is no far-call trampoline and no bank-parameter calling convention.**
Every bank switch is an *inline, statically-known* immediate written directly to
the MBC1 ROM-bank register. Verified by brute-force byte scan (`tools/bankscan.py`):

* 69 occurrences of `EA lo hi` with `$2000 ≤ nn16 ≤ $3FFF` in the whole 128 KB.
* 63 are in bank 0; 6 are inside graphics data in banks 2 and 5 (`02:6D1E`,
  `02:720D`, `02:72CD`, `05:57A5`, `05:65DE`, `05:65E2`) and are not code.
* **All 63 real sites target `$2000` exactly.** No write anywhere to `$0000-$1FFF`
  (RAM enable), `$4000-$5FFF` (RAM bank / upper ROM bits) or `$6000-$7FFF`
  (banking mode). MBC1 therefore stays in mode 0 with only bits 0-2 of the bank
  register ever used, and cart RAM is never enabled. **`LD [$2000],A` is the
  entire MBC surface of this game.**
* No `LD HL,$2000`-style indirect write exists (checked all `LD rr,d16` with a
  `$2000-$3FFF` immediate — every hit is unrelated data or a real address such
  as `$3337`, `$32A3`).
* No `PUSH rr / RET` indirect-call idiom anywhere in traced code.
* RST vectors are **not** used for far calls (see below).

### The idiom, verbatim

Outbound (59 of 62 traced sites match this byte-for-byte):

```
0231  F3        DI
0232  3E 05     LD A,$05          ; <-- the destination bank, always an immediate
0234  EA 00 20  LD [$2000],A      ; MBC1 ROM bank register
0237  EA 03 C7  LD [$C703],A      ; shadow copy of the current bank
023A  FB        EI
                ...body, reads/calls in $4000-$7FFF...
```

Return (always to bank 1, hard-coded):

```
023E  F3        DI
023F  3E 01     LD A,$01
0241  EA 00 20  LD [$2000],A
0244  EA 03 C7  LD [$C703],A
0247  FB        EI
```

Exceptions to the 62 traced sites: `$0191` (init — writes `$C703` *before*
`$2000`), and the two Timer-IRQ sites `$098C`/`$0997` described above.

### Calling convention summary

* **Which register holds the bank?** `A`, but only as an immediate at the write
  site. There is no callee that takes a bank number as an argument.
* **Is the target inline after the call?** No.
* **Is there a jump table?** Not for code. There *is* one banked **data** table
  (see `$0B15` below).
* **Where does the current bank live in RAM?** **`$C703`**, updated at 59/62
  sites, read only by the Timer IRQ restore at `$0994`.
* **Default / resident bank:** **1**. Reset maps bank 1 at `$4000`; every
  excursion returns to 1.
* **Interrupt safety:** the `DI`/`EI` brackets protect only the register write
  pair, *not* the excursion body. The design is safe because (a) VBlank never
  touches `$2000` and (b) Timer saves/restores through `$C703`.

### The one banked-resource "trampoline": `sub_00_0B15`

The closest thing to a Sunsoft far-call helper. Takes a **resource index in A**
and copies a blob out of a banked ROM into VRAM:

```
0B15  47        LD B,A
0B16  87        ADD A,A
0B17  88        ADC A,B        ; A = index*3
0B18  5F 16 00  LD E,A / LD D,$00
0B1B  26 0B     LD H,$0B
0B1D  2E 43     LD L,$43       ; HL = $0B43  (table base)
0B1F  19        ADD HL,DE
0B20  2A        LD A,[HL+]     ; entry byte 0 = BANK
0B21  F3        DI
0B22  7F        LD A,A         ; (encoder artefact; A unchanged)
0B23  EA 00 20  LD [$2000],A   ; <-- the only DYNAMIC bank write in the game
0B26  EA 03 C7  LD [$C703],A
0B29  FB        EI
0B2A  2A 66 6F  LD A,[HL+] / LD H,(HL) / LD L,A   ; entry bytes 1-2 = LE src ptr
0B2D  2A 5F     LD A,[HL+] / LD E,A               ; header: dest lo
0B2F  2A 57     LD A,[HL+] / LD D,A               ;         dest hi
0B31  2A 4F     LD A,[HL+] / LD C,A               ;         len lo
0B33  2A 47     LD A,[HL+] / LD B,A               ;         len hi
0B35  CD FB 09  CALL $09FB                        ; memcpy HL->DE, BC bytes
0B38  F3 3E 01 EA 00 20 EA 03 C7 FB               ; restore bank 1
0B42  C9        RET
```

**Table `$0B43`-`$0BAE`: 36 entries × 3 bytes `{bank, srcptr_lo, srcptr_hi}`.**
Each `srcptr` points at a 4-byte header `{dest_lo, dest_hi, len_lo, len_hi}`
followed immediately by the payload. All 34 valid destinations are inside VRAM
`$8000-$97FF` — i.e. this is the tile-graphics loader.

| idx | bank | src | dest | len | | idx | bank | src | dest | len |
|---|---|---|---|---|---|---|---|---|---|---|
| 00 | 2 | `$4000` | `$80C0` | `$0340` | | 12 | 4 | `$5368` | `$90E0` | `$0500` |
| 01 | 6 | `$4000` | `$8E00` | `$0200` | | 13 | 4 | `$6114` | `$8D80` | `$0280` |
| 02 | 6 | `$54B0` | `$8800` | `$0470` | | 14 | 4 | `$5A70` | `$90E0` | `$06A0` |
| 03 | 3 | `$7E54` | `$8D00` | `$0100` | | 15 | 4 | `$6398` | `$8400` | `$0680` |
| 04 | 3 | `$7D70` | `$9000` | `$00E0` | | 16 | 4 | `$6A1C` | `$8400` | `$0900` |
| 05 | 6 | `$4204` | `$90E0` | `$0720` | | 17 | — | unused (`FF FF`) | | |
| 06 | 4 | `$586C` | `$8E00` | `$0200` | | 18 | — | unused (`FF FF`) | | |
| 07 | 2 | `$6BB2` | `$90E0` | `$0720` | | 19 | 6 | `$4928` | `$8400` | `$0460` |
| 08 | 2 | `$4344` | `$8400` | `$0840` | | 1A | 6 | `$4D8C` | `$8400` | `$0720` |
| 09 | 2 | `$4B88` | `$8E00` | `$0200` | | 1B | 6 | `$5924` | `$8C70` | `$0690` |
| 0A | 4 | `$4000` | `$90E0` | `$0680` | | 1C | 2 | `$73DA` | `$8400` | `$0BC0` |
| 0B | 2 | `$72D6` | `$8E00` | `$0100` | | 1D | 6 | `$5FB8` | `$8C80` | `$0160` |
| 0C | 4 | `$45A4` | `$9570` | `$0290` | | 1E | 6 | `$648C` | `$8400` | `$09E0` |
| 0D | 4 | `$4838` | `$8FC0` | `$0040` | | 1F | 6 | `$6E70` | `$9000` | `$0800` |
| 0E | — | unused (`FF FF`) | | | | 20 | 4 | `$7320` | `$8400` | `$0C00` |
| 0F | 4 | `$487C` | `$8E00` | `$0200` | | 21 | 6 | `$7735` | `$9000` | `$07F0` |
| 10 | 4 | `$4A80` | `$90E0` | `$0720` | | 22 | 5 | `$5398` | `$8400` | `$0BC0` |
| 11 | 4 | `$51A4` | `$8E40` | `$01C0` | | 23 | 5 | `$5374` | `$8C70` | `$0020` |

(Entry `$0A` and the chain starting at `4:$45A4` physically overlap by `$E0`
bytes — deliberate tile sharing, not a decode error; the `$45A4` chain is
contiguous: `$45A4 → $4838 → $487C → $4A80 → $51A4 → $5368 → $586C → $5A70 →
$6114 → $6398 → $6A1C → $7320 → $7F24`.)

### RST vectors — arithmetic helpers, not far calls

| vector | bytes | meaning | xrefs |
|---|---|---|---|
| `$00` | `C9` | `RET` (unused stub) | 0 |
| `$08` `$10` `$18` `$20` | `FF FF ...` | unfilled (`$FF` = `RST $38`), never called | 0 |
| `$28` | `85 6F D0 24 C9` | `ADD A,L / LD L,A / RET NC / INC H / RET` → **HL += A** | 13 |
| `$30` | `83 5F D0 14 C9` | **DE += A** | 15 |
| `$38` | `81 4F D0 04 C9` | **BC += A** | 33 |

These are 1-byte 16-bit table-index helpers, used everywhere for
`LD HL,table / LD A,idx*2 / RST $28 / LD A,[HL+] / LD H,(HL) / LD L,A`.
They are *not* bank helpers.

---

## 4. Per-bank code / data classification

### Coverage achieved

Baseline (`tools/gbdis.py`) → **bank 0 96.9%, banks 1-7 0.0%**.
With `tools/banktrace.py --jt`:

```
bank 0:  14751/16384 traced as code ( 90.0%)
bank 1:  13598/16384 traced as code ( 83.0%)
bank 2:      0/16384                (  0.0%)
bank 3:      0/16384                (  0.0%)
bank 4:      0/16384                (  0.0%)
bank 5:      0/16384                (  0.0%)
bank 6:      0/16384                (  0.0%)
bank 7:   1625/16384 traced as code (  9.9%)
total : 29974/131072 (22.9%)
```

Bank 0 drops from 96.9% to 90.0% because the bank-aware tracer no longer
mis-decodes `$4xxx` targets as bank-0 addresses; the 90.0% is the honest figure.

### Classification table

| bank | verdict | code extent | evidence |
|---|---|---|---|
| **0** | **CODE** (~90%, rest = tables) | `$0150-$3FFF` | resident home bank; 301 `CALL` opcodes; 90% traced from `$0100` |
| **1** | **CODE** (~83%) | `$4000-$7E3F` | the resident gameplay bank — always mapped except during excursions. Reached by direct `CALL $4xxx` from the main loop (`$055D→$4DDA`, `$05BA→$4230`, `$05CF→$4E0C`, `$05D6→$4BB0`, `$05EF→$7AD3`). `$7E3F-$8000` is `$00` padding. |
| **2** | **DATA** (tile graphics) | none | never a `CALL`/`JP` target; only reached via resource table (idx 00,07,08,09,0B,1C) and via `LD HL,$4D8C / ADD HL,BC` at `00:2C49` (pointer table). Linear-sweep: 3.65% illegal opcodes, only 17 `CD` bytes in 16 KB, mean legal run 34.8 |
| **3** | **DATA** (level maps + tables) | none | pointer table at `3:$4000` (16 LE entries: `401C 481D 4A2E 514F 5210 5731 5852 5D73 5E34 6635 6C56 6D27 7348 7969 4F80 4F4F`) indexed by `$FFB0-1` at `00:$0C45`; also `3:$7A2A`, `3:$7BF9`, `3:$7C15`, `3:$7C4C`. **Zero `C9` (RET) and zero `CD` (CALL) bytes in the entire 16 KB** — conclusive |
| **4** | **DATA** (tile graphics only) | none | referenced *only* by the `$0B15` resource table (13 entries). 2.62% illegal, 15 `CD` bytes |
| **5** | **DATA** (metasprite tables + VRAM scripts) | none | metasprite pointer tables `5:$5F5C` and `5:$736B` (used by `$0BAF`/`$0BC6`), VRAM scripts `$52F5`, `$5170`, `$5276`, `$4FB0`. **7.02% illegal opcodes** — highest in the ROM |
| **6** | **DATA** (tile graphics + tables) | none | pointer table `6:$611C`, blobs `6:$642A`/`6:$6459`, VRAM script `6:$7674`, plus 9 resource-table entries |
| **7** | **MIXED** | `$4000-$46D5` (1749 B, 1625 traced = 92.9% of the code region) | sound engine. Entries: `$4000` init, `$405D` pause, `$4083` resume, `$412B` tick. 56-entry command jump table at `$43CE`. `$46D5-$7FFF` (14635 B) = music/SFX data; song pointer table at `7:$477D` (`480A 49E7 4B6D 50CD 5653 5B37 5E6C 61A8 64FD 6601 677E 6E4B ...`) |

### Proof that banks 2-6 hold no code

1. **Reachability.** Every one of the 63 bank-register writes was examined with
   its following instructions (`tools/bankscan.py`, then a per-site dump). Only
   two destination banks are ever followed by a `CALL`/`JP` into `$4000-$7FFF`:
   bank 1 (resident) and bank 7 (`$019E→$4000`, `$061E→$405D`, `$063D→$4083`,
   `$0990→$412B`). Every switch to banks 2/3/5/6 is immediately followed by a
   *data* access — `LD DE,$xxxx; CALL $0A0E`, `LD HL,$xxxx; ADD HL,BC`, or
   `LD HL,$xxxx; LD DE,$C61B; LD BC,n; CALL $09FB`. Bank 4 is never even
   selected by an inline immediate; it is reachable only through `$0B15`.
2. **Forced disassembly fails.** `gbdis --entry N:4000` on each bank:

   | bank | bytes decoded before hitting an illegal opcode / dead end |
   |---|---|
   | 2 | 31 |
   | 3 | 10 |
   | 4 | 112 |
   | 5 | 39 |
   | 6 | 29 |

3. **Byte statistics** (`tools/bankclass.py`):

   | bank | illegal % | `C9` count | `CD` count | zero % | mean legal run |
   |---|---|---|---|---|---|
   | 0 | 0.80 | 131 | 301 | 3.0 | 61.2 |
   | 1 | 0.96 | 55 | 193 | 4.9 | 61.6 |
   | 2 | 3.65 | 11 | 17 | 17.2 | 34.8 |
   | 3 | 0.86 | 0 | 0 | 34.4 | 61.4 |
   | 4 | 2.62 | 12 | 15 | 21.1 | 40.7 |
   | 5 | 7.02 | 4 | 3 | 20.5 | 33.4 |
   | 6 | 3.89 | 17 | 10 | 15.9 | 38.0 |
   | 7 | 4.75 | 9 | 200 | 3.4 | 28.0 |

   Bank 3's high mean-run figure is an artefact of its `$00`-heavy (34%)
   content (`NOP` is legal); its zero `RET`/`CALL` counts settle it.

---

## 5. Bank-0 call graph (ranked by call-site count)

`n` = number of distinct `CALL` instructions targeting the routine, across all
traced banks.

| addr | n | name / purpose |
|---|---|---|
| `$0AE1` | 66 | **`SoundRequest(B=id, C=cmdmask)`** — finds a free slot in the 4×2-byte ring at `$C6FB`; consumed by the Timer IRQ. Typical `LD BC,$1301; CALL $0AE1` |
| `$0A4F` | 34 | **`WaitVBlank`** — sets `$FFE7`, `HALT`s until VBlank clears it; also the soft-reset check |
| `$0BC6` | 28 | **`DrawMetasprite`** — table `5:$5F5C`, entry `E`, adds `B/C` offsets, emits 4-byte OAM records at `$C000+[$FF9D]`, `$FF9E` = attribute OR-mask, terminator `$FF`; stops at `$A0` (40 sprites) |
| `$0BAF` | 9 | same but table `5:$736B` (second metasprite set) |
| `$11B9` | 21 | **`WorldToMapAddr`** — `BC:C` world coords → `HL` inside the level map at `$D000` (`>>4` tile, `*2` metatile) |
| `$11F1` | 19 | **`QueueTileWrite`** — appends a 6-byte `{dest,4 tiles}` record to the VBlank queue at `$C130`, cursor `$FF9F` (+6 per entry); source block from `$C368 + E*4` |
| `$1172` | 17 | **`WorldToScreen`** — subtracts camera `$FFA2/$FFA3` (X) and `$FFA4/$FFA5` (Y) from a 12.4 fixed-point world position, `<<4`, returns `C` = OAM X (+8), `B` = OAM Y (+16) |
| `$0A0E` | 16 | **`RunVRAMScript(DE)`** — see format below |
| `$0A7F` | 16 | **`Fade(C)`** — 33 steps through the `$0B09`/`$0B11` palette ramps into `$FFAD/$FFAE/$FFAF`; `C` bit 7 = fade out, low bits select which of BGP/OBP0/OBP1 |
| `$0C1F` | 16 | **`ClearUnusedOAM`** — zeroes shadow OAM from `$C000+[$FF9D]` to `$C0A0`, resets `$FF9D` |
| `$09FB` | 14 | **`memcpy(HL→DE, BC)`** |
| `$0B15` | 12 | **`LoadBankedResource(A)`** — see §3 |
| `$0CC2` | 11 | **`AllocSlot_C693`** — first free of 10 × 6-byte records at `$C693` |
| `$11D9` | 10 | **`WorldToBGMapAddr`** — world coords → `$9800`-based tilemap address |
| `$34A4` | 8 | **`ClearBGMap(D)`** — LCD off, `LD SP,$9A3F` + `PUSH DE` fill of `$9800-$9A3F` |
| `$18E7` | 6 | **`AddToPos16($FF82:$FF81, BC)`** — 16-bit signed add into the player X accumulator (`$18F1` = same for `$FF84:$FF83`, Y) |
| `$20BA` | 5 | 16-bit add of `BC` to `$FF83:$FF84`, mirrored into `$FFB8/$FFC1/$FFB9/$FFC2` |
| `$09DD` | 4 | **`LCDOff`** — waits `rLY==$91` after masking `rIE` low bits (saved in `$FFE8`) |
| `$0FCC` | 4 | **`DrawBlinkingCursor`** — sprite id from `$3337 + ((frame>>3)&3)` |
| `$0CF3` | 4 | **`AllocSlot_C6CF`** — 8-byte records |
| `$11A7` | 4 | proximity test vs camera X (`|$FFA2+5 - B| < 9`) |
| `$2777` | 4 | subtract `B` from `$FF8A` (health/timer) then `SoundRequest($12,$01)` |
| `$0A61` | 3 | **`ClearShadowOAM`** (`LD SP,$C09F` + `PUSH DE` ×79) |
| `$09C2` | 2 | **`InstallOAMDMA`** — copies `$09D0`(10 B) → `$FFF0` |
| `$0A77` | — | **`memset(HL, BC, D)`** |
| `$0C34` | 2 | **`LoadLevelMap`** — bank 3, pointer table `3:$4000` indexed by `$FFB0-1`, RLE-expands into `$D000`, per-level tile-translation table via `3:$7A2A` |
| `$104E`/`$121F` | 2/1 | **`UpdateCamera`** — identical prologue, clamps camera to `[$C732]-5` |
| `$0D50` | 2 | **`InitRasterMode`** — sets `$FFC7` from the per-level table at `$1015` |
| `$2889` | 2 | **`LoadLevelGraphics`** — bank 5, table at `5:$4000`, 4 bytes/level |
| `$333F` | 2 | per-level init dispatch on `$FFB0` |
| `$0F39` | — | HUD tile selection from tables `$1023`/`$1031` |
| `$0F7B` | 2 | **`DrawHUD`** (lives/energy, `$FF8A`) |
| `$2FAE` | 3 | 16-byte copy `DE→HL` |
| `$1336` | 1 | background/parallax state per level |
| `$2CBE`,`$2C13`,`$3A35`,`$29E7` | 1 each | main-loop per-level subsystems |
| `$0C88` | 3 | signed distance / range test (`|D-B| vs H`) |

Cross-bank leaf calls from bank 0's main loop into **bank 1**:
`$4DDA` (level-specific setup), `$4230` (**actor update loop** over `$C1E8`,
16-byte records, index `SWAP`ped ×16), `$4E0C` (player state machine, jump table
`$60EF`), `$4BB0` (table `1:$4D00`), `$7AD3`. Most-called bank-1 routines:
`1:$63AD` (25 — 16-bit add-to-`(HL)`), `1:$6616` (12), `1:$63B4` (8),
`1:$6499` (8), `1:$4A79` (6).

### `sub_00_0A0E` — the VRAM script interpreter (16 call sites, drives every screen)

```
0A0E  1A        LD A,[DE]          ; dest HIGH byte
0A0F  FE 00     CP $00
0A11  20 F1     JR NZ,$0A04
0A13  C9        RET                ; terminator = $00
0A04  13 67     INC DE / LD H,A
0A05  1A 6F 13  LD A,[DE] / LD L,A / INC DE   ; dest LOW byte  (BIG-endian!)
0A09  1A 13     LD A,[DE] / INC DE            ; control byte
0A0B  CD 14 0A  CALL $0A14
```

Control byte: `count = ctrl & $3F`, `mode = ctrl >> 6`.

| mode | at | operation |
|---|---|---|
| 0 | `$0A27` | copy `count` bytes from the stream to `[HL+]` (horizontal run) |
| 1 | `$0A2E` | fill `count` bytes at `[HL+]` with one stream byte (horizontal RLE) |
| 2 | `$0A35` | copy `count` bytes from the stream, stride `$0020` (vertical run) |
| 3 | `$0A42` | fill `count` bytes with one stream byte, stride `$0020` (vertical RLE) |

Example (`5:$52F5`): `99 61 0E | 8B 8A 9D 96 8A 97 2F 8A 97 8D 2F 8A 95 95` →
write 14 tiles at `$9961`. Text encoding: `'A'=$8A … 'Z'=$A3`, space `=$2F`,
digits `$80-$89`.

---

## 6. Translation hazards

Ranked by expected pain when hand-porting to JS.

### 6.1 Runtime-generated code in WRAM — `$C4CB` (HIGH)

`$01D4-$01FB` writes 192 bytes of *machine code* into WRAM and then
`CALL $C4CB` at `$07C9` inside the VBlank handler. Generated body:

```
for B = 0..$3F:
    emit $2A            ; LD A,[HL+]
    emit $12            ; LD [DE],A
    if B == 0        : emit $1C   ; INC E
    elif B == $3F    : (nothing)
    elif (B & $0F)!=0: emit $1C   ; INC E
    else             : emit $13   ; INC DE   (carry into D every 16 bytes)
emit $C9                ; RET
```

Net effect: an unrolled **64-byte `memcpy(HL → DE)`**. Occupies `$C4CB-$C58A`;
the 64-byte staging buffer it reads from is immediately after it at **`$C58B`**.
In JS this becomes a plain `copy(dst, src, 64)` — **but any emulator-style
"execute WRAM" fallback must still work if the port keeps a CPU core**, and any
memory map must not place data over `$C4CB-$C58A`.

### 6.2 HRAM-resident OAM DMA — `$FFF0` (MEDIUM)

`sub_00_09C2` copies `$09D0`(10 bytes) into `$FFF0`:

```
FFF0  3E C0     LD A,$C0
FFF2  E0 46     LDH [rDMA],A
FFF4  3E 28     LD A,$28
FFF6  3D        DEC A
FFF7  20 FD     JR NZ,$FFF6
FFF9  C9        RET
```

Called from VBlank at `$0664`. Shadow OAM base = `$C000`.
**Caution:** `$FFF0-$FFFD` show up in a naive HRAM-access scan only because
`LD BC,$FFF0` / `LD DE,$FFF4` are used as *negative 16-bit constants* (−16, −12)
for backwards pointer arithmetic. Filtering to real `LDH`/`LD [a16]` opcodes
shows **zero** variable accesses in `$FFF0-$FFF9` — the stub is never clobbered.
HRAM variables actually occupy `$FF80-$FFE2`, plus `$FFE7`, `$FFE8`, `$FFEA`.

### 6.3 Scanline raster effects (HIGH)

The STAT/LYC state machine at `$0857` changes `rSCX`, `rSCY`, `rBGP`, `rOBP0`,
`rOBP1` *mid-frame* at up to 36 split points per frame (state 6 re-arms `rLYC`
every 4 lines and applies a sine offset from `$09A2`). A JS renderer must be
per-scanline, or at minimum honour a scroll/palette change list keyed by `LY`.
State 7 uses a 16-bit fractional scroll accumulator at `$C763/$C764`.

### 6.4 Computed jumps (`JP HL`) — 4 sites, all with recoverable tables (MEDIUM)

| `JP HL` | table | entries | targets |
|---|---|---|---|
| `01:427A` | `01:$427B` | 11 | `488D 48E4 499B 4940 4291 42E3 4447 4525 464F 4765 483C` |
| `01:50D2` | `01:$50D3` | 13 | `50ED 5399 55AA 7750 575C 57D6 6D8A 7061 7288 7591 59E0 5B95 78A7` |
| `01:60EE` | `01:$60EF` | 12 | `6107 612E 6169 6107 6398 61B3 61DD 621F 6300 634F 6107 637F` |
| `07:4181` | `07:$43CE` | 56 | `443E 4445 444C 4458 445D … 46C9` (sound-command opcodes `$C8+n`) |

All four use the identical `LD HL,tbl / ADD HL,BC / LD A,[HL+] / LD H,(HL) /
LD L,A / JP HL` shape, and every target is in-bank. Entry counts were derived by
`tools/banktrace.py --jt` and each has been spot-checked. **The 12-entry table at
`01:$60EF` has duplicate targets (`6107` three times) — do not assume
one-handler-per-index.** `01:$50D3` entry 3 (`$7750`) is far from its neighbours;
worth re-verifying against a running emulator (UNCONFIRMED whether index 3 is
ever taken).

### 6.5 Pointer/jump-table-shaped data everywhere (MEDIUM)

Confirmed 16-bit LE pointer tables that a translator must treat as data, not code:

| location | entries | consumer |
|---|---|---|
| `0:$0B43` | 36 × 3 B `{bank,ptr}` | `$0B15` resource loader |
| `0:$09A2` | 32 signed bytes | STAT sine wobble |
| `0:$0B09`,`0:$0B11` | 8 B each | fade ramps |
| `0:$1008`, `0:$103F`, `0:$1015`, `0:$1023`, `0:$1031`, `0:$3337` | per-level byte tables indexed by `$FFB0` | HUD / raster mode / level params |
| `1:$4D00` | ≥5 × 2 B | `1:$4BB0` |
| `1:$6891` | 10 × 2 B (`68A5 68AD 68B5 68C1 68CD 68D1 …`) | data records follow the table |
| `2:$4D8C` | ≥12 × 2 B | `00:2C49` |
| `3:$4000` | 16 × 2 B | level maps, `00:$0C45` |
| `3:$7A2A`, `3:$7BF9` | 2 B each | tile translation / level attrs |
| `5:$5F5C`, `5:$736B` | metasprite pointer tables | `$0BAF` / `$0BC6` |
| `6:$611C` | ≥12 × 2 B | `00:$3520` |
| `7:$43CE` | 56 × 2 B | sound command dispatch |
| `7:$477D` | ≥24 × 2 B | song pointers |

### 6.6 `LD SP,addr` + `PUSH` used as a fast fill (MEDIUM)

Three places repurpose the stack pointer as a write cursor:
`$01AE` (`SP=$9FFF`, fills VRAM with `$2F2F`), `$0A61` (`SP=$C09F`, clears
shadow OAM), `$34A4` (`SP=$9A3F`, clears the BG map). Each saves/restores SP via
`LD HL,SP+0` / `LD SP,HL` and brackets the region with `DI`/`EI`. A naive
"stack = JS array" model breaks here; these must be recognised as memset loops.

### 6.7 Nested/re-entrant Timer interrupt (MEDIUM)

`$095F` executes `EI` **as its first instruction**, before pushing anything, so
VBlank can pre-empt the sound tick. The `$FFEA` guard prevents the sound driver
re-entering itself, but a JS port that models IRQs as "run to completion" will
have different timing for `$C6FB` queue consumption and for the `$C703`
save/restore window.

### 6.8 Bank-state as global mutable (MEDIUM)

Because `$C703` is a plain variable and the restore constant `$01` is hard-coded
at 32 sites (traced destination-bank histogram: `1`×32, `7`×11, `5`×7, `6`×4,
`3`×4, `2`×2, dynamic×2), any refactor that changes which bank is resident breaks the ROM.
For a JS port the cleanest model is: keep an explicit `curBank` variable, treat
`LD [$2000],A` as `curBank = A & 0x1F || 1`, and resolve every `$4000-$7FFF`
read through it. All 63 sites are enumerated in §3 / `--switches` output.

### 6.9 `RST $28/$30/$38` as inline arithmetic (LOW, but pervasive)

61 call sites. `RST $28` = `HL += A` (with carry into H), `RST $30` = `DE += A`,
`RST $38` = `BC += A`. Note the `RET NC` — the carry propagation is conditional,
so `HL += A` is a *true* 16-bit add of an unsigned 8-bit value. Inline them.

### 6.10 No self-modifying code beyond §6.1/§6.2 (verified)

No traced instruction writes into `$0000-$7FFF` other than `$2000`, and nothing
writes into `$C4CB-$C58A` or `$FFF0-$FFF9` after init. The two generated stubs
are write-once.

---

## Appendix A — memory map (as used by this ROM)

| range | use |
|---|---|
| `$C000-$C09F` | shadow OAM (DMA source) |
| `$C100-$C12F` | VBlank vertical-column transfer descriptor (`$C100`=0 → idle) |
| `$C130-$C367` | VBlank 2×2-tile write queue, 6-byte records, cursor `$FF9F` |
| `$C368-$C4CA` | tile-block source pool used by `$11F1` (`$C368 + E*4`) |
| `$C1E8-…` | actor/entity array, 16-byte stride (`1:$4230` does `SWAP C; LD HL,$C1E8; ADD HL,BC`) |
| `$C1C0-$C1E7` | 40-byte block initialised from `0:$2AD7` by `$29E7` (purpose UNCONFIRMED) |
| `$C4CB-$C58A` | **generated 64-byte copier (code)** |
| `$C58B-$C5CA` | 64-byte tile staging buffer (source for `CALL $C4CB`) |
| `$C5CB-$C5EB` | 33-byte tilemap row buffer (VBlank row transfer) |
| `$C61B-$C651` | VRAM-script staging buffer (drained by VBlank at `$0714`) |
| `$C693-$C6CE` | 10 × 6-byte object slots (`$0CC2`) |
| `$C6CF-$C6FA` | 8-byte object slots (`$0CF3`) |
| `$C6FB-$C702` | **sound command queue**, 4 × `{id, cmdmask}` |
| **`$C703`** | **current ROM bank shadow** |
| `$C70A-$C76x` | game state (`$C712` menu sel, `$C713` continue flag, `$C715` pause, `$C716` pause-sub, `$C732` level width, `$C742/$C743` parallax SCX, `$C750` boss flag, `$C753` options, `$C757` lag flag, `$C763-$C765` raster accumulators) |
| `$C800-$C94C` | sound driver RAM; 8 tracks × `$24` bytes from `$C82D` |
| `$CFFF` | stack top |
| `$D000-$DFFF` | decompressed level map |
| `$FF80-$FFE2` | HRAM game vars (`$FFA1` sound-queue read idx, `$FFA2-$FFA5` camera, `$FFA9/$FFAA` SCX/SCY, `$FFAB-$FFAF` WX/WY/BGP/OBP0/OBP1 shadows, `$FFB0` level, `$FFB1` frame counter, `$FFC7` raster mode, `$FFD2/$FFD3` sound cmd/id, `$FFE1` held buttons, `$FFE2` newly pressed) |
| `$FFE7` | VBlank-pending flag (main loop ↔ VBlank handshake) |
| `$FFE8` | saved `rIE` during `LCDOff` |
| `$FFEA` | sound-tick re-entrancy guard |
| `$FFF0-$FFF9` | **OAM-DMA stub (code)** |

## Appendix B — tooling caveat

`tools/gbdis.py`'s `Rom.offset()` computes `bank*0x4000 + (addr & 0x3FFF)`, and
`Disassembler.add_entry` keeps `bank` for targets ≥ `$4000`. When bank-0 code
does `CALL $4xxx`, the entry is recorded as `(0, $4xxx)` which aliases to file
offset `$0xxx` — bank 0's own low memory. This is why the original
`disasm/bank_00.asm` shows nonsense xrefs like `00:4101` and why its 96.9%
figure is inflated. `tools/banktrace.py` fixes this by carrying the mapped-bank
value; prefer `disasm2/` for all downstream work.
