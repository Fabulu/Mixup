# Gradius ROM - first findings

Everything here was **read out of the PRG image**, not looked up. Byte evidence is quoted
so the next person can check it without re-deriving. Nothing here needed an emulator.

`Gradius (USA).nes`, SHA-1 `92645fe1…`. 32 KB PRG at `$8000-$FFFF`, no banking.

## Vectors

| vector | address |
|---|---|
| NMI | **`$806A`** |
| RESET | `$8010` |
| IRQ/BRK | `$80BD` |

## RESET - `$8010`

```
8010  D8         CLD
8011  78         SEI
8012  AD 02 20   LDA $2002
8015  10 FB      BPL $8012        ; wait for vblank
8017  AD 02 20   LDA $2002
801A  10 FB      BPL $8017        ; wait again -- the standard two-wait warm-up
801C  20 36 83   JSR $8336        ; PPU/APU shutdown helper (NMI calls it too)
801F  A2 FF      LDX #$FF
8021  9A         TXS
```

Textbook. Nothing surprising.

## NMI - `$806A`, and it is the frame heartbeat

This is the equivalent of the Game Boy port's VBlank ISR, and it is where the oracle
should sample. Annotated:

```
806A  08 48 8A 48 98 48   PHP / PHA / TXA / PHA / TYA / PHA
8070  AD 02 20   LDA $2002        ; clear the vblank flag
8073  A4 04      LDY $04          ; <-- THE LOCK, see below
8075  D0 40      BNE $80B7        ; main loop has not consumed the last frame -> bail
8077  20 36 83   JSR $8336
807A  A9 00      LDA #$00
807C  8D 00 20   STA $2000        ; PPUCTRL = 0
807F  8D 01 20   STA $2001        ; PPUMASK = 0   (rendering off for the transfer)
8082  8D 03 20   STA $2003        ; OAMADDR = 0
8085  A0 02      LDY #$02
8087  8C 14 40   STY $4014        ; OAM DMA from page $02
808A  A5 11      LDA $11          ; PPUMASK shadow
808C  A6 0D      LDX $0D          ; a countdown
808E  F0 06      BEQ +6
8090  C6 0D      DEC $0D
8092  F0 02      BEQ +2
8094  A9 00      LDA #$00         ; ...still counting -> keep rendering OFF
8096  8D 01 20   STA $2001        ; PPUMASK <- A
8099  20 51 8A   JSR $8A51
809C  20 81 82   JSR $8281
809F  E6 04      INC $04          ; <-- raise the lock
80A1  20 02 ED   JSR $ED02
80A4  20 BF 81   JSR $81BF        ; controller read (see below)
80A7  20 10 8B   JSR $8B10
80AA  20 BE 80   JSR $80BE
80AD  20 AB 8B   JSR $8BAB
80B0  20 41 86   JSR $8641
80B3  A9 00      LDA #$00
80B5  85 04      STA $04          ; clear the lock
80B7  68 A8 68 AA 68 28 40        PLA/TAY/PLA/TAX/PLA/PLP/RTI
```

### What this buys us

**Shadow OAM is at `$0200-$02FF`.** `LDY #$02 / STY $4014` - confirmed by the bytes at
`$8085`. That is the standard convention and now it is a measured fact for this cartridge.

**`$04` is a frame lock, and it is the lag-frame mechanism.** The handler *reads* it at
`$8073` and bails if non-zero; it *raises* it at `$809F` and clears it at `$80B5`. So an
NMI that arrives while the previous frame's work is still running does almost nothing.
This is structurally the same as the Game Boy's `$FFE7`/`$C757` lag flag that drops
actor and enemy updates - and docs/03 lesson 28 says that class is out of scope but must
be *measured and tagged*, never chased. Expect to do the same here.

**Zero-page fields already identified:**

| addr | evidence | meaning |
|---|---|---|
| `$04` | `LDY $04 / BNE`, `INC $04`, `STA $04` in NMI | frame lock / NMI-busy |
| `$0D` | `LDX $0D / BEQ / DEC $0D` gating PPUMASK | blank-screen countdown |
| `$10` | `LDA $10 / AND #$FC / STA $2000` at `$9AB6` | **PPUCTRL shadow** |
| `$11` | `LDA $11` immediately before `STA $2001` | **PPUMASK shadow** |
| `$15`, `$5B` | gates at the top of the split routine | mode flags, meaning TBD |

## The status-bar split - sprite-0 hit at `$9AA3`

Mapper 3 has **no scanline IRQ**, so any mid-frame change has to come from sprite-0 hit or
cycle-timed code. It is sprite-0, and here it is:

```
9A98  A5 15      LDA $15
9A9A  D0 07      BNE +7
9A9C  A5 5B      LDA $5B
9A9E  D0 03      BNE +3
9AA0  20 EE 98   JSR $98EE
9AA3  AD 02 20   LDA $2002
9AA6  29 40      AND #$40         ; sprite-0 hit flag
9AA8  F0 F9      BEQ $9AA3        ; spin until it fires
9AAA  20 C3 8B   JSR $8BC3
9AAD  AD 02 20   LDA $2002        ; reset the $2005/$2006 write latch
9AB0  A2 00      LDX #$00
9AB2  8E 05 20   STX $2005        ; scroll X = 0
9AB5  8E 05 20   STX $2005        ; scroll Y = 0
9AB8  A5 10      LDA $10
9ABA  29 FC      AND #$FC
9ABC  8D 00 20   STA $2000        ; and the nametable bits with it
```

**This is the single most important structural finding so far.** It means the renderer
needs a **per-scanline model**, exactly like the Game Boy port's raster bands - the screen
is not one flat scroll. The port cannot render Gradius as a single background offset and
be correct.

It also means the oracle needs a per-scanline register comparison from day one. On the
Game Boy that check compares 335,664 scanlines of `(SCX, SCY, BGP, OBP0, OBP1)` and it
caught things whole-frame screenshots could not. Build the NES equivalent early.

## Controllers - `$81BF`

```
81C1  8E 16 40   STX $4016        ; strobe
81C5  8E 16 40   STX $4016
81CA  AD 16 40   LDA $4016        ; player 1
81D5  AD 17 40   LDA $4017        ; player 2
```

Standard strobe-then-shift. Called from NMI at `$80A4`, so **input is read inside the NMI
and consumed by the main loop afterwards** - the same shape as the Game Boy, which means
the harness will need the same one-frame **input lead** (docs/knowledge/01). Measure it;
do not assume it is exactly one.

## Idiom census across the whole PRG

| idiom | count | addresses |
|---|---|---|
| `STY $4014` OAM DMA | 1 | `$8087` |
| `STX $4016` strobe | 2 | `$81C1`, `$81C5` |
| `LDA $4016` / `LDA $4017` | 1 each | `$81CA`, `$81D5` |
| `STA $2000` PPUCTRL | 9 | `$807C $81B9 $832F $8338 $8528 $85B6 $8A5F $8A82 $9ABC` |
| `STA $2001` PPUMASK | 6 | `$807F $8096 $833B $852B $85C1 $9878` |
| `STA $2005` scroll | 2 | `$85B9`, `$85BC` |
| `STX $2005` scroll | 2 | `$9AB2`, `$9AB5` (the split) |
| `STA $2006` PPU addr | 5 | `$8286 $828B $851C $8A69 $8A70` |
| `STA $2007` PPU data | 3 | `$887D $888B $8A88` |
| sprite-0 poll | 1 | `$9AA3` |

Only **one** OAM DMA site and **one** sprite-0 poll - the frame structure is simple and
centralised, which is good news for building a faithful frame loop.

## What to do with this next

1. Sample the oracle at the NMI (`$806A`) - but **after** the `$04` lock test at `$8073`,
   so lag frames are distinguishable rather than silently mixed in.
2. Find the player's RAM fields by diffing `$0000-$07FF` while holding a direction. The
   zero page is clearly where the game lives (`$04`, `$0D`, `$10`, `$11`, `$15`, `$5B` all
   in use already).
3. Build the per-scanline register comparison before the renderer, not after.
