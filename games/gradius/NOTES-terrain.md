# The Gradius terrain streamer and the scroll

**Status: the streamer is fully re-derived and verified against the running
cartridge. The port can be written from this file.**

Everything marked PROVEN below was produced by
`games/gradius/tools/oracle/terrain.py`, which runs the real cartridge headless
under Mesen, re-implements the streamer in Python **straight out of the PRG
tables**, and compares its output against the bytes the ROM actually pushed
through `$2006`/`$2007` and stored in RAM. Every check in it has been watched
to go red (`--neuter`, section 8).

The headline, because it is the thing that changes the plan: **do not hand-paint
a map, and do not plan to.** Stage 1's terrain is 504 bytes of screen layout
plus a 14-byte page order. The entire streamer is about 200 bytes of 6502. All
seven stages use the same decoder and the same five per-stage table pointers.

---

## 1. The camera — PROVEN

```
$3D   sub-pixel fraction (8 bit)
$3E   world X, low byte      \  16-bit world X in PIXELS
$3F   world X, high byte     /   -- also the "page" number
```

`$98EE`, called once per frame from `$9AA0`:

```
98EE  A9 80     LDA #$80
98F0  18 65 3D  CLC / ADC $3D
98F3  85 3D     STA $3D          sub-pixel accumulator
98F5  A9 00 2A  LDA #$00 / ROL A carry out
98F8  A2 3E     LDX #$3E
98FA  4C 02 84  JMP $8402        16-bit add A into $3E/$3F
```

`$8402` is the house 16-bit add (`CLC / ADC $00,X / STA $00,X / BCC / INC $01,X`);
`$840C` is its subtract.

**Base scroll speed is exactly 1/2 pixel per frame.** Measured over a
4000-frame run of the attract demo: `cam24 = $3D | $3E<<8 | $3F<<16` advanced by
exactly `$80` on all 3207 frames where `$98EE` ran, and by exactly 0 on the 789
frames where it did not. `$98EE` never ran twice in a frame.

There is a second adder: `st_984F` (`$1B` = 14 or 15) does `LDX #$3E / LDA #$04
/ JSR $8402`, i.e. **4 px/frame**. It fired 12 times in the same run.

A write census on `$3D-$3F` says the camera is *only* ever incremented by those
two, or wiped wholesale by an init routine:

| writer PC (post-instruction) | writes | what |
|---|---|---|
| `$98F5` | 3207 | `STA $3D` in `$98EE` |
| `$8407` | 3207 | `STA $00,X` in `$8402` — the `$3E` half |
| `$840B` | 12 | `INC $01,X` — carry into `$3F` |
| `$8310` | 3 | `STA $00,X` in `$8307`, the `$12-$EF` zero-page wipe on stage (re)start |
| `$802E`, `$8438`, `$9B44`, `$9B6C` | 3, 6, 3, 1 | RESET and stage-init clears |

### What the PPU is told, and **when** — PROVEN, and it is a one-frame lag

`$9A79`, on the gameplay path, **before** `$9AA0` calls `$98EE`:

```
9A79  A5 3E 85 12     LDA $3E / STA $12       PPUSCROLL X shadow
9A7D  A5 3F 4A        LDA $3F / LSR A         carry = bit 0 of $3F
9A80  A5 10 29 FC     LDA $10 / AND #$FC
9A84  69 00 85 10     ADC #$00 / STA $10      nametable select = bit 0 of $3F
```

and `$8281` (from the NMI at `$809C`, i.e. the **next** frame) pushes it:

```
8281  LDA $2002 / LDA #$20 / STA $2006 / LDA #$00 / STA $2006
828E  LDX $2002 / LDX $12 / STX $2005 / LDX $13 / STX $2005
829B  LDX $10 / STX $2000
```

So **`$12` is always one frame behind `$3E`.** Measured: over 3206 consecutive
scrolling frames, `$12[N] == $3E[N-1]` on **3206/3206**, and `$12[N] == $3E[N]`
on only **1603/3206** (the halves where the fraction did not carry). Same for
the nametable bit. A port that writes the current camera to the scroll register
will be one frame ahead of the cartridge half the time. `--neuter nolag` forces
`$12 = $3E` and turns this check red.

`$13` (scroll Y) is `$0C` during stage 1, set at `$9650`.

The status bar is the sprite-0 split at `$9AA3` (`NOTES-rom.md`): after the hit
it writes `$2005 = 0, $2005 = 0` and clears the nametable bits, so **the bottom
band is unscrolled**. Two raster bands, as already established.

---

## 2. Who writes the nametable — PROVEN by census

Every write to `$2000/$2005/$2006/$2007` over 600 frames of boot-plus-gameplay,
tagged with the writing PC (Mesen reports the PC *after* the storing
instruction, hence the +3):

| port | store at | writes | what |
|---|---|---|---|
| `$2007` | `$8A88` | 9008 | **the VRAM queue drainer `$8A51`** — everything during gameplay |
| `$2007` | `$888B` | 5429 | `$8871`, the RLE full-screen loader; runs once, at the stage load |
| `$2007` | `$887D` | 203 | same routine, literal-byte path |
| `$2006` | `$8A69`, `$8A70` | 1290 each | the queue's own address writes |
| `$2006` | `$8286`, `$828B` | 600 each | `$8281`'s latch reset before the scroll writes |
| `$2005` | `$8293`, `$8298` | 600 each | `$8281`, the per-frame scroll |
| `$2005` | `$9AB2`, `$9AB5` | 286 each | the sprite-0 split |

**There is exactly one nametable writer during gameplay: `$8A51`.**

### The VRAM queue — `$0700`, cursor `$0E`

`$8A51` is called from the NMI at `$8099`, near the top, so **a block queued
during frame N reaches the PPU at the start of frame N+1**. Packet format,
read out of `$8A51-$8A9A`:

```
[mode][addrHi][addrLo][data ...][$FF]      repeated, terminated by mode $00
```

* `mode` indexes `$8A4B` (`$8A4B..$8A50 = 60 00 04 00 04 00`) and the byte is
  OR'd into PPUCTRL: mode 1/3/5 -> increment 1, mode 2/4 -> increment 32.
* `$FF` ends a packet **unless** the following byte is `>= 3`, in which case
  `$8A86` emits a literal `$FF` and keeps going. That is the escape.
* `$0E` is the write cursor; `$8A76` zeroes `$0700` and `$0E` when the queue is
  drained. A packet costs `4 + n` bytes of it (3 header + data + `$FF`), so one
  terrain block is `4*8 + 5 = 37` — checked against the cartridge, which reads
  `$0E = 38` at `$80B5` on a block frame, the extra 1 being `$8641`'s.
* `$8645`/`$8647` append; `$85E8`/`$85F3` push a canned packet from the 39-entry
  pointer table at `$864E` (score, power-up bar, "STAGE n" — the HUD).
* **`$8641` is a one-byte routine and is NOT a HUD producer.** `LDA #$00 /
  BEQ $8645 / LDX $0E / STA $0700,X / INX / STX $0E / RTS` — it appends the
  drainer's mode-0 stop byte, and the NMI calls it at `$80B0`, last of all. The
  real HUD tick is `$9AC7 JSR $8898`. Mislabelling `$8641` sent the terrain
  knownFail's diagnosis at the wrong routine and hid a constant one-byte
  divergence in `$0E` on every compared frame until wave 1.

---

## 3. The streamer — `$9D83` / `$9D8E`, one 32x32 block per call — PROVEN

Called once per frame from `$9ACE`. Gate at `$9D83`:

```
9D83  A5 3A  LDA $3A / BNE rts      not while $3A is set
9D87  A5 0E  LDA $0E / CMP #$04     only if the queue holds fewer than 4 BYTES
9D8B  90 01  BCC $9D8E
```

**`$0E` is a BYTE cursor, so `CMP #$04` is four bytes — less than one packet's
three-byte header.** The port compared a packet count against it until wave 1
and got away with it because the drainer zeroes `$0E` at `$8099` and the
streamer was the only producer, so the gate always read 0.

`$3A` is the **stage-advance latch**, not an uncharacterised flag: written at
`$96D7` and `$97E1` (`STA $3A`, A = 0, stage init) and `$993D` (`INC $3A`, in
the stage-end block that also does `INC $19` and `$3F = 0`). Measured 0 on 700
of 700 frames of a boot-and-play run — it never rises during stage 1.

and four times back-to-back from `$9C24` during the stage load.

### The build cursor

```
$54/$55   16-bit world X of the 128 px half-page being built (pixels)
$58       progress inside it
$57       result flag: 0 = this frame built (or is mid half-page),
          1 = the 384 px lead throttled it
```

`$9D8E` is `LDA #$00 / STA $57` — **`$57` is cleared on every pass of the gate
above**, before the throttle is even evaluated, and `INC`'d at `$9DAF` only when
the throttle refuses. It is a result, not an input, and a frame that does not
get past the `$3A`/`$0E` gate does not write it at all.

`$9D92-$9DB1`: if `$58 != 0` the half-page is in progress, keep going.
Otherwise compute `($54/$55) - ($3E/$3F)` as a 16-bit `SBC` and branch on the
flags of the **high byte**:

```
9DA1  30 0F  BMI $9DB2     the lead is NEGATIVE -- the camera has overtaken the
                           build cursor -- BUILD, do not throttle
9DA3  C9 01 90 0B          high byte 0, i.e. lead < $0100 -> build
9DA7  D0 06                high byte >= 2, i.e. lead >= $0200 -> INC $57
9DA9  A5 98 C9 80 90 03    high byte 1: build while the low byte is < $80
9DAF  E6 57  INC $57
```

so it stops once the cursor is **>= 384 px (`$0180`) ahead of the camera** *and
is ahead at all*. The `BMI` arm is easy to lose in translation — an unsigned
lead compared against `$0180` turns "you are behind, catch up" into "you are
miles ahead, stop", and then never recovers, because the cursor stays put while
the camera keeps moving. That was live in `src/terrain.js` until wave 1.

**`$58 = blockCol*32 + blockRow`**, `blockRow` 0..6 and `blockCol` 0..3.
Proven by the advance at `$9F94`:

```
9F94  LDA $58 / AND #$07 / CMP #$06
9F9A  BCC $9FB1        row < 6 -> INC $58
9F9C  LDA #$19 / ADC $58 / STA $58     row 6 -> += $1A (next block column)
9FA2  CMP #$80 / BCC rts
9FA6  LDA #$00 / STA $58               wrapped
9FAA  LDX #$54 / LDA #$80 / JMP $8402  $54/$55 += 128
```

So a half-page is **4 block columns x 7 block rows = 28 blocks = 128 x 224 px**,
one block per call. Observed exactly: `$58` took 28 distinct values.

### The addresses, all verified against the ROM's own `$2006` writes

With `half = ($54 & $80) != 0`, `page = $55 & 1`,
`row = $58 & 7`, `col = ($58 & $F0) >> 5`:

```
nametable  = ($20 or $24)<<8            $9DBC, from $9D6F,X
           + (half ? $10 : 0)           $9DCE  LDY $54 / BPL
           + row*128                    $9DE9
           + ($58 & $F8) >> 3           $9DFC   ( == col*4 )
attribute  = ($23 or $27)<<8            $9DC1  ORA #$03
           + (half ? $C4 : $C0)         $9DD6  LSR/LSR/ORA #$C0
           + row*8 + col                $9E0E / $9E17
layoutIdx  = row*8 + col + (half ? 4 : 0)   $9E1B-$9E36
```

**448 blocks over the attract demo: 0 wrong.**

---

## 4. The source data — PROVEN

Five per-stage pointers, one table each, indexed by the stage number `$19`:

| table | read at | meaning | stage 1 |
|---|---|---|---|
| `$9FB4,Y` | `$9F55` | collision threshold | `$40` |
| `$9FBC,X` | `$9E3E` | **screen-order list**, indexed by the page `$55` | `$CF4E` |
| `$9FCC,X` | `$9E60` | base of the 56-byte screen layout arrays | `$CF96` |
| `$9FDC,X` | `$9E73` | block id -> 4x4 tile stream, pointer table | `$D778` |
| `$9FEC,X` | `$9E8A` | block id -> attribute byte | `$D6F8` |

All eight entries:

```
threshold   40 41 40 40 40 42 40 40
screenOrder CF4E CF6A CF78 CF5C CF84 DF86 E707 E707
layoutBase  CF96 D386 D49E D18E CF96 DDC6 E547 E547
patternTbl  D778 D778 D60A D778 D778 E009 E77A E77A
attrTbl     D6F8 D6F8 D5EE D6F8 D6F8 DF98 E718 E718
```

### The chain

```
world x  --(>>8)-->  page $55
page     --$CF4E[page]-->  screen index          (14 bytes for stage 1)
screen   --layoutBase + 56*screen-->  56-byte layout array
layout[row*8 + col]  =  block id                 (8 wide x 7 tall, 32x32 px each)
block id --$D778[id] (word)-->  RLE'd 4x4 tile stream
         --$D6F8[id]-->        one attribute byte
```

A "screen" is **256 x 224 px = 8 x 7 blocks = 56 bytes**. The stride is read
from `$9D4F` (`0000 0038 0070 ...` — `$38` = 56).

For stages other than 0, `$9E4C-$9E58` subtracts 1 from the screen index and
falls back to **stage 0's tables with screen 0** when the entry is `$00` — one
shared empty starfield screen.

### The 4x4 tile stream — RLE, `$9EBE-$9F4C`

The stream is read as 4 rows of 4 tiles. A byte is a **literal tile** if it is
`$00` or has a non-zero high nibble. Otherwise it is a control code:

| code | effect |
|---|---|
| `$09` / `$0A` | fill the rest of the row alternating `$41,$40,...` / `$40,$41,...` |
| `$07` / `$08` | emit `$ED` / `$00` twice, keep decoding the row |
| `$01`-`$06`, `$0B`-`$0F` | fill the rest of the row with `$9D73[code]` |

`$9D73[1..6] = 00 3A DC 40 DD BB`, `$9D73[$0B..$0F] = ED EE E3 EB E5`.

After a "fill the rest of the row" code the source index is restored to just
after the code (`STY $9B` at `$9EEE`, `LDY $9B` at `$9F32`) — the fill consumes
one source byte, not four.

**Sharp edge for the port:** the `$07`/`$08` path's loop-back at `$9F24` tests
`X` (the queue cursor), *not* the remaining tile count. If a row ever ended
exactly on an `$07`/`$08`, the ROM would keep consuming. Expanding **every
block of all seven stages** offline (`tools/stage1map.py`) never hits it, so the
data avoids it — but a port that "cleans up" the loop condition is not
translating the ROM, it is fixing it. `terrain.py`'s `decode_block()` raises
instead of guessing.

### Stage 1's shape

```
pages 0..13            = 3584 px of world
screen order           = [0,0,0,0,1,6,2,3,4,5,6,7,8,0]
distinct screens       = 9  ->  9 x 56 = 504 bytes of layout
distinct block ids     = 40  ($00..$7F)
boss trigger at page   $0C   ($9A3D,Y, tested at $9A4F and $9986)
stage ends at page     $0E   ($98FD,Y, tested at $9926)
```

`tools/stage1map.py` expands this offline and writes `games/gradius/rip/`
(gitignored). The picture it prints is unmistakably stage 1: open starfield for
four pages, then ceiling and floor from page 4, the volcano ramps, the eye-shaped
formation at page 11, twin peaks at page 12, and an empty page 13 for the boss.

---

## 5. Terrain collision — SAME DATA AS THE VISUALS — PROVEN

This is the answer to the question that mattered on Batman, and here it is
unambiguous: **collision is derived from the tile indices the streamer has just
queued**, by thresholding, in the same routine.

`$9F55-$9F92`, immediately after the four tile packets are in the queue
(`$AF` points at the first packet header, the tiles are at `$0703,$AF` with a
stride of 8):

```
9F66  LDA $0703,Y      a tile byte we just queued
9F69  CMP $98          $98 = $9FB4[stage], $40 on stage 1
9F6B  BCC $9F6F        below the threshold -> keep the tile
9F6D  LDA #$80         at or above -> $80
9F6F  ASL A / ROR $99  two bits per tile, low bits first
      ... 4 rows ...
9F7D  LDA $99
9F7F  STA ($A8,X)      X = 0
9F81  $A8 += 8         next tile column
```

`ROR` shifts the carry in at bit 7 and the byte right, so after eight shifts the
**first** bit shifted in sits at bit 0. Per tile that gives a 2-bit field
`(bit6 << 1) | bit7` of the substituted byte:

* tile **>= threshold** -> `$80` -> field = **1**
* tile **< threshold** -> the tile itself -> field = its own `(b6, b7)`, which
  is `0` for stage 1's starfield tiles (`$00`, `$3A`-`$3F`)

Confirmed on the demo run: the only non-zero bytes stored were
`$50` (240x), `$55`, `$54`, `$01`, `$05`, `$40`, `$04` — i.e. **only field
values 0 and 1 ever occur on stage 1**. Fields 2 and 3 are reachable in
principle on stage 6, whose threshold is `$42`, so `$40`/`$41` would fall
through as literals; that has not been run.

### The map

```
$0500-$05FF   even pages ($55 bit 0 = 0)     from $9D6D,X = $05/$06
$0600-$06FF   odd pages
index         = (tile column mod 32)*8 + block row      (0..6 used, 7 idle)
byte          = 4 tile rows, 2 bits each, row 0 in bits 0-1
```

Cleared at stage end by `$994A` (`STA $0500/$0540/.../$06C0,X` for X = `$3F`
down to 0, i.e. all 512 bytes), gated on `$3E >= $D0`.

**How the map is compared, and what that cost to work out (wave 10).** The
range is in no watch list — 512 addresses that read 0 on every frame of every
align-400 scenario, because stage 1's camera pages 0-3 contain no solid tile
bits. Wave 10 changed both halves of that. `porttrace.mjs` now SEEDS the map out
of `seedRam`, because a window that starts at frame 1900 begins with 65 of the
512 already written and the port cannot rebuild them; and `compare.mjs` compares
the map the port ENDS each window with against the cartridge's, out of the RAM
dump `scen.py` was already taking. Both were necessary and the order matters:

* seeding it alone made the WRITE path invisible. MEASURED — `$9F7F`'s base
  `u8($54 + $58)` made `+ 1`, and `$9F81`'s `c * 8` stride made `c * 4`, are
  BOTH green across `deep-ground`, `terrain-death` and `deep-page3`, because
  every cell that kills the ship was written before the align frame. The two
  `terrain-death` scenarios cannot see it either: they POKE a cell into an
  all-zero map and never run `$9F55` at all.
* comparing the end-of-window map is what holds `$9F55-$9F92` to account, and
  `compare.mjs` prints how many cells the CARTRIDGE rewrote over each window so
  the check states its own coverage.

### And it is READ from there — `$C3D3`

```
C3D3  LDA $A4 / CLC / ADC #$08 / ADC $3E / AND #$F8 / STA $A0   screen X -> world, tile-aligned
C3DE  LDA $3F / ADC #$00 / AND #$01 / CLC / ADC #$05 / STA $A1  page -> $05 or $06
C3E9  LDA $A5 / CLC / ADC #$14 / LSR/LSR/LSR / STA $A3          (screen Y + 20) >> 3 = tile row
C3F3  LSR / LSR / CLC / ADC $A0 / STA $A0                       + (tile row >> 2) = block row
C3FC  LDA ($A0),Y  (Y=0) / STA $A2 / BEQ rts
C402  LDA $A3 / AND #$03 / TAY
C409  LDA $A2 / AND $C40F,Y          $C40F = 03 0C 30 C0
```

`$C3A3` is the player's entry (`$0320`/`$0360`); `$C3AF` is the per-actor entry
(`$0323,X` / `$0363,X`, with `+3` for slots >= 6 and `+10` for type 1).
Exactly the inverse of the write. **Verified two ways**: a census of `$A1` at
`$C3FC` (only ever `$05`/`$06`), and the `--neuter solid` intervention.

### Stage 5 is the exception, and it corroborates the rest

`$9F4F: LDY $19 / CPY #$04 / BEQ $9F94` — **stage index 4 skips the collision
write entirely.** Independently, `$9663` (`LDA $19 / CMP #$04 / BNE ...`) reads
`$0600`, `$0630`, `$0660`, `$0690` as four object slots, and `$8BD9`/`$8C06`
draw from `$0600+X`, `$0615+X`, `$0618+X`, `$0620+X` with X in
`{$00,$30,$60,$90}`. Two unrelated routines agree that page `$0600` means
something else on that stage. Offline expansion agrees a third time: stage 5's
screen order is all zeros and it produces **0 solid tiles**.

---

## 6. Scripted vs streamed — stage 1 is streamed; the ENEMIES are the script

* **Terrain: 100% streamed.** No scripted camera moves in stage 1's normal
  path — the camera is a constant 1/2 px/frame and the terrain is a pure
  function of the camera position and the tables in section 4. The scripted
  parts are only the boundaries: the stage-entry sub-state sequence
  (`$1B` = 1,2,3,4,`$80`), the boss trigger at page `$0C`, the stage end at
  page `$0E`, and the 4 px/frame `st_984F` state.
* **Enemies: a scroll-triggered script — LIKELY, not yet measured by me.**
  `sub_A2C0` reads a per-stage pointer table at `$A7D0,Y` (stage 1 -> `$A7DE`),
  indexes it by `$3F & $0E` (an **even** page number, i.e. one stream per 512
  px), and stores the stream pointer in `$6A/$6B`. `$A30A-$A328` then compares
  the camera `$3E/$3F` against a trigger position stored as a doubled byte
  (2 px resolution) and fires at `$A335`. Stage 1's per-512px stream pointers
  are `$A844 $A859 $A87A $A8A3 $A8C6 $A8ED $A8ED $A8ED`. **Read from the
  listing; I did not hook it.** It is the natural next probe and it is not in
  this area.

---

## 7. What the port needs, in order

1. `cam = {sub: $3D, x: $3E|$3F<<8}`, `cam += 0.5 px/frame` while the gameplay
   gate holds — and that gate is **`$1B` bit 7, `$1E`, `$1F`, `$0D` and then
   `$15`/`$5B`** (`$9A88-$9AA0`), not the sprite-0 split, which is reached
   whether the camera advanced or not; the PPU scroll and nametable bit are
   **last frame's** `cam`.
2. A `Queue` of `{addr, inc, bytes[]}` packets plus the BYTE cursor `$0E`,
   drained at the top of the next frame. The streamer appends; the HUD appends;
   `$8641` appends one stop byte at `$80B0`; nothing else writes VRAM.
3. `streamBlock()`: the gate (`$3A`, `$0E < 4` **bytes**, the signed 384 px
   lead with its `BMI` catch-up arm, and `$57` written as a result), the `$58`
   walk, the address math of section 3, the RLE of section 4, then the
   collision derivation of section 5 **from the tiles it just produced** — not
   from a second table, and not precomputed, because the ROM's ordering is
   observable: the map for a column exists only once the column has been
   queued.
4. Level data: five per-stage pointers, a page->screen list, 56-byte screens,
   a block->tiles table and a block->attribute table. That is the whole of it.

---

## 8. The checks, and each of them going red

The reference run is the **attract-mode demo**, 4000 game frames, empty input
script:

```
python games/gradius/tools/oracle/terrain.py --frames 4000 --script "4000:" \
       --vramfrom 1200 --mapat 3999
```

```
[PASS] cam24 += $80 per $98EE call and $400 per $9857 call, every frame
       (3207 moving, 789 still, 3 wiped by a non-adder write at [386,387,3625], 0 violations)
[PASS] $3D/$3E/$3F write census: adders [3207, 3207, 12],
       everything else {'802E': 3, '8310': 3, '8438': 6, '9B44': 3, '9B6C': 1}
[PASS] $98EE runs at most ONCE per frame -- base scroll is exactly 1/2 px/frame
[PASS] $12 (-> $2005) lags $3E by exactly one frame: 3206/3206 match $3E[N-1],
       only 1603/3206 match $3E[N]
[PASS] PPUCTRL nametable bit == bit 0 of $3F[N-1] (0 violations of 3207)
[PASS] 448 block emissions observed
[PASS] block id predicted from $9FBC/$9FCC screen tables (448 blocks, 0 wrong)
[PASS] nametable + attribute address predicted from $54/$55/$58 (0 wrong)
[PASS] every tile byte the PPU received matches the block decoder (0 wrong)
[PASS] every attribute byte matches $9FEC[blockId] (0 wrong)
[PASS] 1792 collision-map stores observed at $9F7D
[PASS] the map actually contains solid terrain -- 275 of 1792 stores are non-zero
[PASS] each store lands at ($54+$58) + 8*column on page $05/$06 (0 wrong)
[PASS] every collision byte equals the tiles it was built from (0 wrong)
[PASS] $C3FC (LDA ($A0),Y in $C3D3) reads ONLY pages $05/$06 ({'05': 19764, '06': 15767})
[PASS] RAM $0500-$06FF at frame 3999 holds exactly what $9F7D stored (448 live bytes, 0 wrong)
```

`--neuter` breaks the **world**, never the check, and each was watched to fail:

| control | what it does | what went red |
|---|---|---|
| `scroll` | force `$3D = 0` each frame | camera equation, 285 violations |
| `nolag` | force `$12 = $3E` at the sample point | the one-frame lag: 142/285 vs 285/285 |
| `blockid` | poke `$AE` over a 21-frame window | block id 9 wrong, attribute 5 wrong |
| `addr` | poke `$AA` (`+1`) | nametable address 11 wrong (`$2100` vs `$2101`) |
| `tiles` | poke `$A4` (`+4`) | tile bytes 63 wrong **and** collision 16 wrong |
| `collide` | zero `$99` just before `STA ($A8,X)` | RAM map: 141 of 448 live bytes wrong |
| `solid` | fill `$0500-$06FF` with `$FF` | the ship dies: `$1B` `$80` -> `$A0` on the first poked frame (601), restart sequence at 722-725, camera reset — on a stretch with **no terrain at all**, so the map is the only possible cause |

Three traps met along the way, all worth keeping:

* **A window with nothing in it.** The first `--neuter` window (frames 450-480)
  was green for every control, because the streamer does not run every frame:
  on the boot script it ran on 287-369 and then not again until 571, throttled
  by the 384 px lead. A control that never touched a block "passed".
* **A vacuous green.** The first long run was green on every collision check
  while the map was **entirely zero** — stage 1's opening is pure starfield and
  no tile reaches `$40`, so "predicted == actual" was `0 == 0`, 2128 times. Real
  terrain starts at page 4 (world x >= 1024) and an idle player is shot at
  around world x = 430, so **the run has to be driven with the attract-mode
  demo** (empty input script, mode 2), which plays stage 1 competently and
  reaches page `$06`. `terrain.py` now asserts the map contains solid terrain
  before believing any collision check. The `collide` control is *still*
  vacuous on the short boot script for the same reason — it only turns red on
  the demo run, which is what the anti-vacuity check is there to tell you.
* **A control with nothing in range.** `--neuter solid` on a stretch with no
  terrain was the *right* experiment for the opposite reason: it proves the map
  causes the death rather than the terrain that happens to be nearby.

---

## 9. Not measured / open

* The enemy spawn script (section 6) is read from the listing only.
* The boss at page `$0C` and everything after it.
* Stages 2-7 are expanded offline and the decoder accepts all of them, but
  none of them has been run under the emulator.
* The vertical mapping is stated as the ROM computes it (`(screenY + $14) >> 3`
  for collision, `$13 = $0C` for the scroll). How that lines up with the
  sprite-0 split's second band is the renderer's problem and is not settled
  here.
* `$3A` (the streamer gate at `$9D83`) and `$5B` (the gate on `$9ACE`) are named
  but not characterised.
