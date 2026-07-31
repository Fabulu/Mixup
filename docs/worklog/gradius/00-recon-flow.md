# RECON 4/5 — Game flow: mode machine, stage intro, HUD, death/respawn
status: DONE
wave: 0   role: recon   started: 2026-07-29

## The task, as I understood it

Map everything around gameplay that is not gameplay in `Gradius (USA).nes`, and
say what the port at `games/gradius/src/` has and does not have:

- the mode dispatch at `$80AA`/`$80BE`/`$80D1` — every mode value, what each does
- the stage-intro sub-state gated by `$96B7: LDA $1B / BPL $96BE`
- `$8871`'s full-screen load (the port replaces it with `preloadTerrain()`)
- the status bar at `$864E` and its canned packets
- the death sequence (`$0100` 1→2, `$1B` $80→$A0)
- respawn, lives, checkpoint, game over
- how title/attract reaches mode 5

Reader role. No file under `src/` was touched. Nothing committed.

## What I did

Wrote two new probes (allowed by my brief):

- `games/gradius/tools/oracle/flowprobe.lua`
- `games/gradius/tools/oracle/flowprobe.py`

Same sample point as `probe.lua` (`$80B5`, the last instruction of the NMI's
own frame), same zero input lead, and the same `$04 == 1` assertion — it printed
`guardViolations = 0` on every run below, so the hook is where I think it is.
The probe adds:

- a 50-field flow state vector (`$00 $01 $02 $03 $09 $0A $0B $0D $0E $15 $16
  $18 $19 $1A $1B $1C $1E $1F $20 $21 $22 $24 $26 $28 $2A $2D $33 $39 $3A $12
  $13 $3E $3F $42 $4C $4D $57 $5B $5C $5E $B0 $0100 $0120 $0140 $0160 $0320
  $0360 $0005 $0007`), printed as **transitions** rather than as a table;
- per-frame exec-hook hit counts for an arbitrary address list;
- an "arghook" that logs A/X/Y **and `ppu.scanline`/`ppu.cycle`** at every
  execution of one address (this is how the packet indices and the split
  scanline below were taken);
- `PROBE_VRAM=2380-23BF` — a PPU nametable read at the last sampled frame;
- `--poke ADDR=VAL@FROM-TO` (same grammar as `probe.py`).

Static side: `python games/gradius/tools/nesdis.py "Gradius (USA).nes" --out
<scratchpad>/prg.asm` (11,121 lines, written OUTSIDE the repo — it is
ROM-derived).

## What I MEASURED

### 1. The mode machine — `$00`, dispatched at `$80D1`

`$80BE` is the whole of it:

```
80BE  E6 02     INC $02          ; the free-running frame counter
80C0  A5 00     LDA $00
80C2  C9 03     CMP #$03
80C4  B0 09     BCS $80CF        ; mode >= 3 -> no title input
80C6  A5 03     LDA $03
80C8  29 40     AND #$40
80CA  D0 03     BNE $80CF        ; game already started -> no title input
80CC  20 1A 82  JSR $821A        ; START/SELECT on the title
80CF  A5 00     LDA $00
80D1  20 E4 83  JSR $83E4        ; Konami inline-jump-table dispatcher
80D4  <7 words>
```

`$83E4` is `ASL A / TAY / INY / PLA PLA (the return address) / LDA ($98),Y ...
JMP ($0098)` — index = `A`, table immediately after the `JSR`. **The table has
exactly 7 entries, `$80D4-$80E1`**, because `$80E2` is mode 0's own code.

| `$00` | handler | what it does | measured |
|---|---|---|---|
| 0 | `$80E2` | `$01==0`: `JSR $882C` (full-screen load), `JSR $8256` (title screen + palette fade + menu cursor), `$2D=3`, `$12=$FE`, `INC $01`. Then per frame: `$12 -= 2` until 0 → mode 1. | frames **0-127**, 128 frames, `$12` $FE→0 at 2/frame |
| 1 | `$8116` | title menu: redraw the 1P/2P cursor (`$82A1`), 16-bit `DEC $4C:$4D`; at 0 → mode 2 (attract). | frames **128-384**, timer is **`$4C:$4D = $0100` = 256**, not 511 |
| 2 | `$8121` | attract/demo. `$01==0`: `INC $01`, `JMP $82C7` (clear RAM, `INC $20`, `INC $09` = demo flag). Then `JSR $964D` every frame; if `$0B != 0` → `$00 = 0`. | entered f385; **`$964D` is `JSR $9C6D` FALLING THROUGH INTO `$9650`** — the demo *is* mode 5 with a canned input source |
| 3 | `$8137` | the "PLAYER 1" banner: `$4C = $50` (80), blink packet 1 on/off on bit 3 of `$4C`, sound cue `$90`; at 0 `INC $01`; then `JSR $82D5` and → mode 4. | frames **200-280** after START at 200; 81 samples |
| 4 | `$8165` | **`$1B = 0`, `INC $00`.** Three instructions. | frame **281**, exactly one frame |
| 5 | `$9650` | stage play. | from frame **282** |
| 6 | `$816C` | clear `$0100-$017F` and `$0020-$0097`, `$03 &= $0F`, → mode 0. | **never executed.** `hook.816C = total 0` over a 1800-frame attract cycle and over every play run |

**Mode 6 looks unreachable.** The only writes to `$00` in PRG are `$8059` (=0,
RESET), `$8186` (`INC`, reached only from modes 0→1, 1→2, 3→4, 4→5), `$818F`
(=0 or =3), `$852E` (=0), `$9712` (=4, continue) and `$9756` (=0, game over).
Nothing produces 6. I did not chase `$ED5E: INC $00,X` in the sound driver — see
open questions.

`$01` is the per-mode init step; `$8186`/`$8188` clears it and `$0B` on every
mode change.

### 2. Title → mode 5, and the attract loop

`$821A`, called from `$80CC` for modes 0/1/2 while `($03 & $40) == 0`:

```
LDA $05 / AND #$30      ; START|SELECT, EDGE-triggered ($05, not $07)
BEQ rts
JSR $8279               ; $4C:$4D = $0100 -- reset the 256-frame attract timer
LDX $00 / CPX #$01
BNE $8248               ; mode 0 or 2: $0E=0, JSR $8256 (rebuild title), $00 = 1
  AND #$20 / BNE $8239  ; SELECT -> toggle $0F (0 = 1 PLAYER, 1 = 2 PLAYERS)
  LDX $0F / LDA $8254,X ; $40 for 1P, $70 for 2P
  STA $03               ; bit 6 of $03 is what stops $80CC calling this again
  LDA #$03 / JMP $818F  ; $00 = 3
```

Measured with START held for 10 frames from game frame 200: `mode 1 -> 3` at
frame **200** — zero input lead, on a *flow* consequence this time.

Full boot chain, measured (`--script "200:,10:S,210:"`):

```
f0-f127   mode 0     f128-f199 mode 1    f200-f280 mode 3
f281      mode 4     f282      mode 5    $1B: 0,1,2,3,4 ... 4, then $80 at f309
f310      first $982A (play)
```

Attract, measured (`--script "1800:"`, no input at all):

```
f0-f127 mode 0   f128-f384 mode 1   f385 mode 2   f386 $09=1 (demo), $20=1
f387 $1B=1 ... f413 $1B=$80   f414 first $982A
```

The demo runs the real mode-5 handler; `$9C6D` runs first and is the demo's
input source. It had not died after 1386 demo frames.

### 3. Mode 5's sub-state `$1B` — the whole of it

`$9650` first: `$13 = $0C`, `$5D = $5B = $5C = 0`, then `LDA $15 / BNE -> JMP
$9A8C` (**pause**, see 8). Then, if stage `$19 == 4`, `$5C` = the number of
non-zero `$0600/$0630/$0660/$0690` and, if `$5C >= 2` on an odd frame, a
completely separate half-rate call sequence at `$968E`. **`$5C >= 2` is
stage-5-only** — that answers `nmi.js`'s `throw` and `NOTES-player.md` open
question 1: the path is not reachable in stage 1 at all.

Then `$96A5` tests `$1B` bit by bit, in this order:

| test | target | meaning |
|---|---|---|
| `$1B & $10` | `$96CF` | **next stage**: `INC $19`, clear `$39 $3A $3F $50-$70`, `$55=1`, `JSR $9BF0`, `JSR $9C3C` (→ `$1B = $80`) |
| `$1B & $20` | `$96EF` | **dying**: `$4C != 0` → `DEC $4C`; `$4C == 0` → `JMP $979D` (respawn) |
| `$1B & $40` | `$96FB` | **game over / continue** |
| `$1B & $80` | `$982A` | **playing**, dispatch on the low nibble, 16 entries at `$982F` |
| none | `$96BE` | **stage intro**: `$0D = 3`, dispatch on `$1B` itself, 5 entries at `$96C5` |

Play sub-states (`$982F`, index = `$1B & $0F` because `$83E4` does `ASL A`):

```
$80 $9A4D  normal play: if $3F >= $9A3D[$19] then $1B = $9A45[$19] = $81
$81 $9A0E  end-of-stage: set the $4C:$4D timer, INC $1B
$82 $99E9  count $4C:$4D down; at 0 INC $1B
$83 $99C0  INC $1B; if $19 >= 5 then $1B = $86
$84 $9982 / $85 $997E / $86 $9904   the stage-end / boss-approach chain
$87 $9B3E  $88 $9BED  $89 $9C12  $8A $9C1E   (the intro states, shared)
$8B $988C  $8C $98DD  $8D $98E5  $8E/$8F $984F  fast forced scroll:
           $3E:$3F += 4/frame until $3F >= $11, then $1B = $90 (next stage)
```

`$9A3D` (stage-end threshold on `$3F`) reads `0C 0C 0C 0C 0B 0B 0C 02` and
`$9A45` reads `81 81 81 81 81 81 81 81`. **Stage 1 ends at `$3F >= $0C`**, i.e.
world X ≥ 3072 px — confirmed by intervention: poking `$3F = 20` during play
made `$1B` step `$80 → $81 → $82` on the next two frames.

### 4. The stage intro — 28 frames, and it is NOT a fixed 28

`$96BE: LDX #$03 / STX $0D / JSR $83E4`, table `$96C5`, 5 entries:

| `$1B` | handler | what it does |
|---|---|---|
| 0 | `$9B3E` | clears `$3D-$97` and `$0100-$017F`/`$0300-$037F`/`$0500-$06FF`; `$35=$14`; restores `$42←$22,X`, **`$3F←$24,X` and `$55←$24,X`** (the checkpoint), `$19←$26,X`, `$1A←$28,X`; `INC $1B`; **`JSR $882C` — THE FULL-SCREEN LOAD**; `$11=$1E`, `$10=$A8`, `$0120=1`; start position from `$9BD4[$9BCC[$19] + ($3F>>1)]` (`&$F0` for Y, `<<4` for X) written into slots 0/1/2 **and into all 24 entries of both rings**; `$0100 = 1`; `$0D = 6`; sound `$FC` |
| 1 | `$9BED` | sound `$FC`, then **falls through into `sub_9BF0`** (also called from `$96E6`): queue canned packets 16, `8+$19`, 7, 5; `INC $1B` |
| 2 | `$9C12` | `JSR $88B6` (lives), `$88F6` (top score), `$892C` (score); `INC $1B` |
| 3 | `$9C1E` | `JSR $89E3` (the power-up meter); `INC $1B` |
| 4 | `$9C24` | `$0D = 5`; **if `$57 == 0`: `JSR $9D8E` ×3 then `JMP $9D8E` — four ungated terrain blocks, and `$1B` is NOT advanced**; else `$1F = 1` and **fall through into `sub_9C3C`**: `$60 = 1`, `$1B = $80` |

Measured, boot run (`--script "200:,10:S,110:"`):

```
f282 $1B=0   f283 $1B=1   f284 $1B=2   f285 $1B=3   f286 $1B=4
f287..f308   $1B=4, h_9D8E = 4 on every one of those 22 frames  (88 calls)
f308         $57 0 -> 1
f309         h_9C24=1, h_9D8E=0, h_9C3C=1, $1B -> $80
f310         first $982A
```

So **the intro is mode-5 frames 282..309 = 28 frames**, `main.js`'s number is
right — but state 4 is a *loop with a data-dependent exit*, not a fixed count.
Measured again after a death: intro ran f614..f639, **26 frames**. The number
is not a constant.

`$0D` is non-zero throughout (3 in states 0-3, 6 after `$9B3E`, 5 in state 4),
and the NMI's `$808E-$8096` arm forces `PPUMASK = 0` while it counts. **The
screen is BLANK for the whole intro** and for four frames after it (`$0D`
5→0 across f310-f314). `state.js` says `$0D` "was never non-zero in any
measured run" — that is only true because the corpus seeds at frame 400.

### 5. `$8871`, the full-screen load

```
$882C: LDX #$00 ;  $8824: $2D=3, LDX #$02, -> $882E   (two different screens)
$882E: $9B:$9C = $8893+X ($8C78 for X=0, $8C8C for X=2)
       JSR $8333 ($0D = $10, PPUCTRL=0, PPUMASK=0 -- 16 blank frames)
       $0E=$1F=$13=$12=0 ; PPUADDR = $2000
       for Y = 0,2,4,6,8,10:  $99:$9A = ($9B),Y ; JSR $8871
$8871: RLE straight to $2007:  $34 = run (count, value), $39 = end,
       anything else = one literal byte.  Y is 8-bit, so <=256 bytes per chunk.
```

Measured hit counts (`--hooks 882E,8871,887D,888B,8856`):

```
frame 0    h_882E=2  h_8871=12  h_887D=203  h_888B=3125   (title path)
frame 283  h_882E=1  h_8871=6   h_887D=0    h_888B=2304   (stage load)
```

So the stage load is **2304 `$2007` writes, all of them run bytes, no
literals**, starting at `$2000` — i.e. more than one nametable. Six chunks per
load, always six (`h_8856 = 7` per load = 6 iterations + the exit test).

`src/terrain.js` says of `preloadTerrain()`: "*$9C24 calls the streamer four
times back to back and $8871 pushes a full-screen RLE image before that;
NEITHER has been measured*". Both are measured now, and the "four times" is
four times **per frame for 22 frames**, not four times total.

### 6. The status bar — `$864E` and the canned packets

`$864E` is a **table of 39 little-endian pointers** (`$864E-$869B`; entry 37 is
`$869C`, which is where the packet data starts — that is how the length is
pinned). The producer is:

```
$85E8: PHA / $9B = 2 / A = $01 -> append to the queue / PLA / fall into $85F3
$85F3: $9A = A ; X = A*2 ; $98:$99 = $864E[X]
       copy ($98),Y into $0700+$0E until a control byte:
         $FF -> stop WITHOUT a terminator (the queue packet stays OPEN)
         $FE -> append $FF, stop
         $FD -> append $FF, append control $01, $9B = 2, keep going
       IF BIT 7 OF THE INDEX IS SET, every byte after the first two (the VRAM
       address) is REPLACED BY $00 ($861F stores A, and A is $9B == 0 there).
$863D: append a raw $FF     $8641: append $00 = END OF QUEUE (NMI $80B0)
```

The bit-7 trick is a **blanker**, not a doubler. Measured: mode 3 calls `$85F3`
with `A = $81` on frames 201-208 and `A = $01` on 209-216, alternating every 8
frames, and the nametable at `$222D` reads `00 00 ...` at frame 205 and
`31 00 34 08 02 09 04 07` at frame 213. That is the blinking "PLAYER 1" banner.

The queue consumer `$8A51` is the mirror image: control byte 0 ends the queue,
1 and 2 select `$8A4B+X` = `$00`/`$04` → PPUCTRL increment 1 or 32, then two
address bytes, then data until `$FF`; an `$FF` followed by a byte ≥ 3 is a
literal `$FF` (`$8A86`) and `$FF` followed by 0/1/2 starts the next packet.
Measured: `h_8A86 = 0` over 300 frames — the escape never fires in practice.

**The bar itself, read out of PPU memory at frame 340:**

```
$2380  00 00 00 00 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C
       1D 62 63 1F 00 00 00 00
$23A0  00 00 00 61 00 33 00 00 31 66 00 30 30 30 30 30 30 30 00 00 64 65 00 30
       30 35 30 30 30 30 00 00
```

- `$2384` + 24 tiles = the power-up bar, built by `$89E3` as **one open VRAM
  run**: packet 15 (`$8732`, addr `$2384`, data `09 0A 0B 0C`, terminator `$FF`
  → stays open), then five `$85F3` calls appending 4 bytes each — packet 21/25,
  22/25, 23/25, 24/25, 27/25 depending on `$41`, `$44==2`, `$44==1`, `$45>=2`,
  `$46` — then `$863D` closes it with `$FF`. Packet 25 (`$8766: 1D 1E 1E 1F`) is
  the unlit box.
- `$23A2`: packet 17, 4 tiles, then `$88B6` **patches the queue in place** at
  `$0700+$0E-4/-3/-2` with the life icon `$61`, tens and ones. With 3 lives the
  tens digit is skipped (`$88DD CPX #$00 / BNE` … `CMP #$30 / BEQ`), which is
  why `$23A4` reads `00`. **A life count of 0 writes nothing at all** and the
  packet's own `$00` blanks the digit.
- `$23A8`: packet 19 (`31 66 00`, `$18`-selected: 20 is the same address with
  tile `32`) + 6 BCD digits from `$07E4-$07E6` + a fixed trailing `30`.
- `$23B4`: packet 18 (`64 65 00`) + 6 digits from `$07E0-$07E2` + `30`.

Rotation during play: `$9AC7: JSR $8898` — `if $0E < 4 and ($02 & 1)` then
`INC $48` and dispatch `$48 & 3` through `$88AD` = `{$88B6, $88F6, $89E3,
$892C}`. **One HUD job every other frame, four-way round robin.** Measured
`h_8898 = 363` on the 700-frame `right-wall` run — it is called on every frame
that reaches `$9AC4`, including the 120 death frames; the `$0E`/`$02` gates are
inside it, not around the call.

The `$0E < 4` gate is the same one `scenarios.json`'s `knownFail` blames for the
terrain streamer running at double rate in the port. Confirmed from the other
side: the HUD producer is what puts bytes in `$0E`.

**The split.** `$9AA3` first fires at game frame **314**, not 310, and always at
**`ppu.scanline = 207`** (dot 267-287, i.e. in the horizontal blank) — measured
with the arghook on `$9AAA` over 104 frames, `sl=207` on every one. The gate is
`$9A8C`: `$1E != 0 && $1F != 0 && $0D == 0`; the split waits for `$0D` to finish
counting out of the intro.

### 7. Death → respawn — the exact sequence

The killer is **`$C1D6`** (xrefs `$C1BF $C24B $C290 $C2C1`, all collision):

```
C1D6  LDA $1B / CMP #$81 / BCC $C1E0 / LDA #$00 / STA $60
C1E0  LDA #$78 / STA $4C          ; 120-frame death wait
C1E4  LDA #$02 / STA $0100        ; the ship is DYING
C1E9  LDA #$00 / STA $0160 / STA $0140
C1F1  LDA #$A0 / STA $1B
C1F5  LDA #$F7 / JSR $EC1E        ; the death sound
C1FA  JMP $C2C4
```

Measured on the `right-wall` script (`200:,10:S,190:,240:R`), which dies
naturally:

```
f493  h_C1D6=1   $1B $80 -> $A0   $0100 1 -> 2   $4C 0 -> 120
                 $0140 7 -> 0     $0160 21 -> 0
f494  $0120 1 -> $2D          ; explosion, advanced by $C0C7 from table $C0FA
f504/514/524      $2E, $2F, $30
f544  $0120 -> 0              ; table byte 0 -> also clears $0121/$0122/$0140
f494-f613  $96EF DECs $4C, 120 times, one per frame
f614  $4C == 0 -> JMP $979D:
        DEC $20,X            lives 3 -> 2
        $22,X = ($42 ? 1 : 0)
        $26,X = $19          stage
        $24,X = min($3F & $0E, 8)     <-- THE CHECKPOINT
        $28,X = $1A
        $20,X >= 0 -> $97C5 (player switch) -> $97DD:
          $39=$3A=$5D=$33=$1C=0, $1B = 0, JSR $9C09 ($57=0, $5E=$3F),
          JMP $9B3E  -- SAME FRAME
      so at the f614 sample: $1B=1, $0100=1, $0120=1, $0D=6, lives=2
f615-f639  the intro again ($1B 2,3,4,4,...)
f640  $1B = $80        f641 first $982A
```

**Death costs 147 frames** (493 → 640) on this measurement.

The checkpoint rule, proved by intervention (poke `$3F` just before the death,
which is an input to the formula, not its output):

| poked `$3F` | measured `$24` | `$3F` after respawn |
|---|---|---|
| 3 | 2 | 2 |
| 7 | 6 | 6 |
| 20 (`$14`) | 4 | 4 |

i.e. `$24 = min($3F & $0E, 8)` and `$9B3E` restores `$3F` (and `$55`) from it
while `$3E` is cleared. **Five checkpoints per stage: `$3F` ∈ {0,2,4,6,8}.**

`$9B3E`'s `LDX #$5A / STA $3D,X` loop clears `$3D-$97`, which includes `$40`
(speed), `$41`, `$44`, `$45`, `$46` — **all power-ups are lost on death**, and
only `$42` survives, restored as 0 or 1 from `$22,X`.

### 8. Game over, continue, and PAUSE

`$97C1: LDA $20,X / BMI $97F1` — lives went negative:

```
$97F1  $0A &= $FE (X=0) or $FD (X=1)   ; that player is out
       $1B = $C0
       if $09 (demo) -> $0D=5, INC $0B, JMP $9C09    ; demo: end the demo
       else $980E: canned packet $1C, $06EC,X = $18+$31, sound $AF, $4C = $78
```

Measured with `--poke "0020=0@488-492"` so the f493 death is the last life:

```
f614  $20 0 -> $FF   $0A 1 -> 0   $1B $A0 -> $C0   $4C -> 120
f614-f890   $4C DOES NOT MOVE.  $96FD: LDA $B0 / BNE $975D -- $B0 is a sound
            variable and it oscillated 1,5,3,1,5,3 for 277 frames.
f891  $B0 reaches 0, $4C starts counting
f1011 $4C == 0 -> $9719 (Konami-code check, $33 != $0A) -> $974B ($0A & 3 == 0)
      -> $9751: JSR $9B3E, $00 = 0, $1B = 0            <-- GAME OVER -> TITLE
f1012 mode 0 restarts    f1140 mode 1
```

**START is gated by `$B0` too.** A second run pressing START at f690 did nothing
(`hook.970D = 0`). Pressing it at f950, after `$B0` had cleared:

```
f950  h_970D=1  JSR $82D5  ->  $0A 0 -> 1, lives $FF -> 3, $1B -> 0, $00 = 4
f951  mode 5    f952-f977 the intro    f978 play
```

`$82D5` calls `$8307`, which zeroes `$0012-$00EF` — **including `$19`, `$24`,
`$26`**. So the "continue" is a full restart at stage 1, checkpoint 0, with the
title screen skipped. The 120-frame `$4C` window is how long you have.

`$9721` is the other continue: if `$33 == $0A` — the **Konami code**, matched by
`$9765` against `$9793 = 08 08 04 04 02 01 02 01 40 80` (UP UP DOWN DOWN LEFT
RIGHT LEFT RIGHT B A, in this ROM's own button bits) — you get 3 lives and
`$0A |= $9749,X` and go straight to `$97DD`. Not exercised.

**PAUSE, which nothing in the port or the notes mentions.** `$9AD1` (after the
frame's work) tests `$1B` bit 7 set and bits 4-6 clear, then `$9ADA`: not in the
demo (`$09`), not while `$16` or `$0D`, then `$05 & $10` = START **pressed**.
Measured: START at f450 → `$15 = 1`; the camera froze (`$3E` stuck at 68 for 50
frames), `$9FFC` ran 200 times over 250 mode-5 frames, `$9AFF` (the resume arm)
fired; START at f500 → `$15 = 0` and the camera resumed.

**A claim in `src/` that this measurement overturns.** `src/state.js` says:

> `$15` or `$5B` non-zero suppresses the sprite-0 split so the frame has ONE
> band (`$9A98`).

and `src/nmi.js` encodes it as
`state.bandB.ran = state.zp15 === 0 && state.zp5B === 0;`. The bytes are:

```
9A94  A5 0D  LDA $0D
9A96  D0 2C  BNE $9AC4      ; blanking -> NO split
9A98  A5 15  LDA $15
9A9A  D0 07  BNE $9AA3      ; -> the SPIN.  It skips $98EE, not the split.
9A9C  A5 5B  LDA $5B
9A9E  D0 03  BNE $9AA3
9AA0  20 EE 98  JSR $98EE   ; the camera advance
9AA3  AD 02 20  LDA $2002   ; the split, reached either way
```

`$15`/`$5B` gate **`advanceCamera()`**, not the split. What actually suppresses
the split is `$9A8C`'s three gates (`$1E == 0`, `$1F == 0`, `$0D != 0`) and
`$9A88` (`$1B` bit 7 clear). Corroborated by measurement from the other side:
the split first fired at frame 314, the frame `$0D` reached 0, while `$15` and
`$5B` were 0 throughout.

It has never cost the corpus anything, because `$15` and `$5B` are 0 on every
compared frame — which is exactly the shape of `docs/knowledge/03`: a field
that is a constant in the corpus can carry a wrong model indefinitely.

### 9. The gate, re-run as found

```
node games/gradius/tools/test-all.mjs
  16 scenarios, 3341 of 4184 frames compared
  (6 truncated: right-wall@493, diag-rd-lu@533, diag-ru-ld@445, lr-both@482,
   speed6-right@515, speed3-diag@529), 0 failures, 0 clamps uncovered,
   0 stale annotations.
  GREEN -- 5 passed, 0 failed, 0 SKIPPED
```

My own independent measurement of `right-wall` put the death at frame **493** —
same number, two derivations. **843 of 4184 frames (20%) of the corpus are lost
to the death path**, and every one of those frames is `$1B = $A0` or later.

## What I could not do, and why

- I did not reach the end of stage 1 (`$3F >= $0C` ≈ 6100 frames of scrolling),
  so `$1B` play sub-states `$81`-`$8F` and the `$1B = $90` next-stage arm are
  read out of the ROM, not measured. The one thing I did measure about them is
  the trigger, by poking `$3F = 20`.
- The attract demo did not die inside 1800 frames, so `$0B` → mode 0 is read,
  not measured.
- The Konami-code continue (`$33 == $0A`) is read, not measured.
- `$B0` is a sound-driver variable and I did not characterise it. It gates both
  the game-over timeout and the START-to-continue, so anyone porting game over
  needs it.
- `$1E` is written at `$8B2B` inside the display-list builder; I did not work
  out what it means, only that it is one of the three split gates.

## If someone picks this up cold

The probe is `games/gradius/tools/oracle/flowprobe.py`. Everything above
reproduces with commands of this shape:

```
python games/gradius/tools/oracle/flowprobe.py --frames 700 \
  --script "200:,10:S,190:,240:R" \
  --hooks C1D6,96EF,979D,97DD,97F1,9B3E,9C3C \
  --fields mode,sub1B,pst,lives0,st24,t4C
python games/gradius/tools/oracle/flowprobe.py --frames 900 \
  --script "200:,10:S,190:,240:R,60:,10:S,200:" --poke "0020=0@488-492" ...
PROBE_VRAM="2380-23BF" python games/gradius/tools/oracle/flowprobe.py ...
python games/gradius/tools/oracle/flowprobe.py --arghook 9AAA ...   # sl=207
```

The `out/*.tsv` it writes are ROM-derived; `tools/oracle/out/` is gitignored.

Start with the `$15`/`$5B` correction in section 8 — it is the only thing here
that makes an existing line of `src/` wrong.
