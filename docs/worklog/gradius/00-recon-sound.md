# RECON 3/5 — the $ED02 sound driver: request protocol, data format, per-frame contract
status: DONE (with three named unresolved items)
wave: 0   role: recon   started: 2026-07-31 (date given in-session)

## The task, as I understood it

Map (NOT port) the audio driver called from the Gradius NMI at `$80A1`
(`JSR $ED02`). Answer, by MEASUREMENT against `Gradius (USA).nes` under headless
Mesen 2.1.1:

1. How music and SFX are *requested* — which RAM byte(s), which values.
2. The sequence data format and where the tracks live in PRG.
3. How many channels, and how the NES APU registers get written.
4. What the driver does per *frame* vs per *tick*.
5. **Critical:** does the driver's work vary with load in a way that could
   contribute to a dropped NMI? Cross-ref `docs/knowledge/06-lag-and-slowdown.md`.

I am a READER. No edits under `src/`. New probe files under
`games/gradius/tools/oracle/` only, plus this worklog. Nothing committed.

## What I did

Tools I added (all recon-only; their output goes to `out/`, which is gitignored):

| file | what |
|---|---|
| `games/gradius/tools/oracle/soundprobe.lua` | hooks `$EC1E` (request), `$ED02`/`$80A4` (driver window), `$806A`/`$80B5`/`$80B7` (NMI + lag), `$9AA3` (sprite-0 spin), `$ED77` (command events), `$EF56` (octave loop), `$EC4D` (request accepted), plus write taps on `$4000-$4017` and read/write taps on all of RAM |
| `games/gradius/tools/oracle/soundprobe.py` | driver; `SND_SILENCE=1` forces every channel free at the `$ED02` hook (the controlled intervention); `SND_POKE="D4=36@400-400,…"` forces ZP bytes |
| `games/gradius/tools/oracle/snddata.py` | decodes the sound table and the sequence streams; `--selfcheck` cross-checks the decode against a number measured on the cartridge |

Static side: `python games/gradius/tools/dis6502.py "Gradius (USA).nes" trace ED02`
and `xref`, plus a scan of every absolute access to `$4000-$401F`.

---

## What I MEASURED

### 0. The driver's place in the frame

`dis6502 xref ED02` → **exactly one caller**: `80A1  20 02 ED  JSR $ED02`.
It sits immediately after `$809F INC $04` (the frame lock) and **before**
`$80A4 JSR $81BF` (joypad) and `$80AA JSR $80BE` (state machine). So in a port,
**sound advances before input is read and before any game logic runs.**

The lock bail at `$8075` is upstream of it, so **a dropped NMI skips the music
tick entirely**. Measured, `--tag boot`, 600 game frames:

```
nmiEntries = 601   lagFrames = 1   driverCalls = 600   gameFrames = 600
```

i.e. `driverCalls == nmiEntries - lagFrames`. One tick per *non-dropped* NMI.

### 1. The request protocol — one byte in A, through `$EC1E`

`$EC1E` is the entry (`STA $DF` is its first instruction; the request arrives in
**A**, not in a RAM byte). 28 call sites; `dis6502 xref EC1E`.

```
requestByte:  nnrrrrrr
  rrrrrr (bits 0-5) = sound INDEX, 1..$3F, into the 3-byte table at $EFCD
  nn     (bits 6-7) = (number of channels - 1); the driver consumes
                      records index, index+1, … index+nn
```
Derived from `$EC26 ROL A ×3 / AND #$03 → $E0` and `$EC2F AND #$3F → $DF`, and
confirmed by the requests observed on the cartridge.

Table record at `$EFCD + 3*index` = `{apuOffset, ptrLo, ptrHi}` where
`apuOffset ∈ {0,4,8,$0C}` and `apuOffset/4` indexes the channel-base table at
`$ECB2` = **`$B0, $C1, $D2, $E3`**.

**Priority, and it is load-bearing.** `$EC45 LDA $DF / BEQ / CMP $02,X / BCC
skip`: `$02,X` holds the index of the sound currently owning that channel, and a
new request is **rejected unless its index is >= the current owner's**. Cleared
to 0 when a stream hits `$FF` (`$ECB6`). Measured on a 1200-frame autofire run
(`--tag census`): **123 requests, 51 channel-records accepted** — and, decisively:

```
shot SFX ($01) requests: 83 total, 73 issued while pulse-1's owner byte was > 1
  -> REJECTED (silent), 10 accepted
```

The stage-1 BGM's pulse-1 part owns `$B2 = $13` from game frame 310 to 822.
Every shot fired in that window makes **no sound at all**. At f823 the pulse-1
part ends (`$FF`), `$B2` → 0, and from then on `$01`/`$06`/`$0D` take the
channel freely. A port that always plays the shot SFX is audibly wrong for the
first ~8.5 seconds of every stage-1 life.

**Illegal request codes.** Index 0 has no record: `$EFCD..$EFCF` = `C0 03 8A`,
which is really the last entry of the *pitch* table (the two tables deliberately
overlap by two bytes). `$EC47 BEQ` skips the priority test for index 0 and then
reads that garbage record: `$C0/4 = 48`, `LDX $ECB2+48` is off the end of a
4-byte table. **Any request byte whose low 6 bits are 0 (`$00 $40 $80 $C0`) is a
crash-shaped bug**; the game never issues one (measured: every observed request
was `$01 $06 $0D $3B $7D $90 $93 $F7 $FC`).

**The RAM byte that does exist** is `$1C`, at the *caller* level, not in the
driver: `$839B` is "set BGM" — `CPX $1C / BEQ ret / STX $1C / LDA #$7D /
JSR $EC1E / LDA $1C / JMP $EC1E`, i.e. it de-duplicates against `$1C`, sends
`$7D` (stop pulse2+triangle) and then the new code. `$83AB` is "stop everything"
(`LDA #$FC / JMP $EC1E`), 6 call sites. `$8381 LDX #$93` is the stage BGM,
`$838A LDX #$A5` the boss BGM, `$833F,Y` the per-stage area theme.

Observed request codes and their meaning:

| code | records | meaning |
|---|---|---|
| `$FC` | `$3C $3D $3E $3F` | stop all four channels |
| `$7D` | `$3D $3E` | stop pulse2 + triangle |
| `$90` | `$10 $11 $12` | title music |
| `$93` | `$13 $14 $15` | stage-1 BGM |
| `$F7` | `$37 $38 $39 $3A` | death jingle (4 ch) |
| `$3B` | `$3B` | **pause jingle** |
| `$01 $06 $0D` | 1 record | SFX on pulse 1 |

`$3C-$3F` all point at `$F08F`, whose first byte is `$00`. `$EC74` sees the 0,
forces `$DF = 0`, so `$02,X` is left at 0 (channel free) — **the stream is never
parsed**; the silencing is done by `$EC83-$EC8E` writing `$30` (or `$00` for
triangle) to `$4000+off` and `$4001+off`. `$F08F` is literally two bytes into the
middle of the `$3B` pause jingle; that is fine precisely because it is never read
as a sequence.

### 2. Channels and APU registers — four, no DMC

Every absolute access to `$4000-$401F` in the whole 32 KB PRG (scanned):

```
81AD STA $4015   (init, LDA #$1F)      81B2 STA $4017 (init, LDA #$C0)
81CA/81D5 LDA $4016/$4017 (joypad)     8087 STY $4014 (OAM DMA, in NMI)
9B2B STA $4000 / 9B30 STA $4008        (unpause)
EC8B/EC8E $4000,Y $4001,Y (request init)
ECC3 EDD1 EE1F EE7E EF2C EF41 $4000,X
EDF9 $4001,X   ED65/EFA2 $4002,X   ED68/EF9B $4003,X
ED36 $4008  ED39 $4009  ED6B $4008  ED70 $400C
```

**No `$4010-$4013` anywhere → the DMC channel is never used**, even though
`$4015 = $1F` enables it. `$4017 = $C0` = 5-step frame sequencer, frame IRQ
inhibited — so the APU frame counter is not used as a clock either.

Per-run write census (900 frames, `--tag base`): `$4014` exactly once per game
frame; `$4015`/`$4017` exactly once for the whole run; everything else is
`$4000-$400F` only.

### 3. The per-frame contract: one tick per NMI, no divider

`$ED02` is a flat 4-iteration loop over the channel bases (`$F8` = struct base,
`$F9` = APU offset 0/4/8/$0C; `$F8 += $11` per iteration, terminating on `$F4`).
Per channel it does `DEC $00,X`; when that reaches 0 it parses the next event.
**There is no tempo divider anywhere** — one tick == one non-dropped NMI, and
tempo lives entirely in the duration bytes.

Independent confirmation, and this is the check I made fail on purpose:
`snddata.py --selfcheck` decodes index `$13` (stage-1 pulse-1 part) purely from
the ROM bytes and gets **512 ticks**; the cartridge held `$B2 = $13` for
**513 game frames** (310..822 inclusive) — 1 setup frame (`$EC63` seeds
`$00,X = 1`, so the first command is parsed on the *next* driver call) + 512.

```
[PASS] decoded tick count matches the measured channel-ownership window
```

Seen red, twice, by deliberately breaking the decoder:

```
dur = base << exp        (instead of base*(exp+1))  -> 768 ticks  [FAIL] rc=1
loop while c == cnt + 1  (instead of c == cnt)       -> 640 ticks  [FAIL] rc=1
restored                                             -> 512 ticks  [PASS] rc=0
```

### 4. The channel struct — 17 bytes, and it overlaps on purpose

Four structs, `$B0`, `$C1`, `$D2`, `$E3`, stride `$11` = 17.

| off | meaning | evidence |
|---|---|---|
| +0 | duration counter (ticks to next event) | `DEC $00,X` `$ED50` |
| +1 | default note length (dialect A) | `$EDCA`, `$EDD9` |
| +2 | **owner / priority** = sound index, 0 = free | `$EC93`, `$ECB6`, `$EC49` |
| +3/+4 | stream pointer lo/hi | `$ED48` |
| +5 | volume/envelope byte for `$4000+off` | `$EE98`, `$EF26` |
| +6 | loop-repeat counter | `$ECEB` |
| +7 | last `$4003+off` written (retrigger guard) | `$EF85`, `$EF95` |
| +8 | shadow of the `$4000+off` byte | `$EDD6`, `$EE1B` |
| +9 | bit7 "inside a sub-phrase"; low7 = dialect flag | `$ED81`, `$EDB5` |
| +$A | base duration (dialect B) | `$EE95`, `$EEDB` |
| +$B | shadow of `$4001+off` (sweep) | `$EDFC` |
| +$C | detune added to the period low byte | `$EDEA`, `$EF6E` |
| +$D | release countdown | `$EE54` |
| +$E/+$F | release offset / rate | `$EEAA`, `$EEB0` |
| +$10 | octave (shift count = 4 − value) | `$EEBF`, `$EF54` |

Two deliberate overlaps, both confirmed by the code paths that skip the fields:

* **triangle** (`$D2`) never executes the `$10`/`$11` commands (`$EDDD CPX #$D2
  BEQ`), so its `+$B`/`+$C` (`$DD`/`$DE`) are reused as the **global**
  sub-phrase return address (`$ED8D`, `$EDAA`).
* **noise** (`$E3`) ends at `$F3`, and `+$D..+$10` are the globals
  **`$F0` `$F1` `$F2` `$F3`** used by the fade epilogue.

### 5. The sequence format — two dialects, one discriminator

`$EC72-$EC7F`: `$09,X` is set to **0 if the stream's first byte has high nibble
`$2`**, else **1**. That flag picks the parser: `$EDBE` (dialect A) or `$EE82`
(dialect B). Classification of all 63 indices is in
`snddata.py --table`; `$01-$0F` are all dialect A (SFX), `$10-$27` and `$2E-$34`
are dialect B (music), `$28-$2D` and `$35-$3A` are dialect A.

**Control commands (both dialects), parsed at `$ED77`:**

| byte | operands | effect |
|---|---|---|
| `$FF` | — | if inside a sub-phrase, return to `$DD/$DE`; else **end stream, `$02,X := 0`, silence the channel** (`$ECB6`) |
| `$FD` | `lo hi` | call sub-phrase; return address = stream+3 stored in the **global** `$DD/$DE` |
| `$FE` | `cnt lo hi` | loop: `cnt` **total passes** through the block; on the last pass, skip 4 bytes |

`$FD`/`$FE`/`$FF` all end with `$ECE5` (`$00,X := 1`) and `JMP $ED46`, so control
commands are chained and executed **within the same tick** — by `JMP`, not `JSR`,
so no stack growth.

**Dialect B (music), `$EE82`:** optional `$Dn vv [dd]` (n → base duration,
vv → `$4000+off` volume/envelope byte, dd → release offset/rate nibbles —
**absent on the triangle channel**, `$EE9D`), optional `$En` (octave), then one
**note byte** `NNNNdddd`: `NNNN` = pitch 0-11 (`$0C` = rest), `dddd` = duration
multiplier. **`duration = base * (dddd + 1)`** — `$EECE-$EED5` is a repeated
`ADC $0A,X`, *not* a shift. Pitch table `$EFB8`, 12 big-endian 11-bit periods,
C..B, one octave (1710 … 906; ratio 1.888 = 2^(11/12)); the octave is applied as
`(4 − $10,X)` right-shifts of the 16-bit period (`$EF54`).

**Dialect A (SFX), `$EDBE`:** optional `$2n vv` (n → note length in ticks,
vv → `$4000+off`), `$11 vv` (detune added to the period low byte), `$10 vv`
(sweep → `$4001+off`), `$F8 vv` (volume), then a **2-byte raw period**
`hi lo` where only the low 3 bits of `hi` are used (`$EE24 AND #$07`).

Worked example, printed by `snddata.py --stream 13`, is the stage-1 riff
E B E F# B F# E B E B E F#, base 4, `$FE 4 $F396` (4 passes), `$FF`.

### 6. Pause — `$15`, and it freezes the driver rather than stopping it

Measured (`--tag pause`, START at game frame 500 and again at 560):

```
f 500 $15=1 c0=3B c1=13 c2=13  d1(pulse2 duration counter)=43
f 532 $15=1 c0=00 c1=13 c2=13  d1=43          <- pause jingle ended
f 560 $15=0 c0=13 c1=13 c2=13  d1=43          <- resumed
f 561 $15=0 c0=13 c1=13 c2=13  d1=42
```

`$9AE2`: START sets `$15 = 1`, copies the **pulse-1 struct** `$B0..$C0` to
`$01A0..$01B0`, and requests `$3B`. `$ED54-$ED5E`: with `$15` set the driver
**`INC $00,X` to undo its own `DEC`** — all durations freeze — and writes
silence, **except** for the channel whose owner is `$3B` (`$ED58 CMP #$3B`),
which is how the pause jingle plays. `$9B21` clears `$15`, restores `$B0..$C0`
from `$01A0`, restores `$4008` from `$D7`. The driver-cycle sequence for frames
491-499 and 562-570 is byte-identical (466,466,466,447,745,787,466,436,436) —
the music resumes on exactly the tick it stopped on.

### 7. The `$F0` fade — reached only by intervention

`INC $F0` at `$8398` is the only setter, gated on `$1B < $82`. **`$F0` was 0 in
every one of my 11 scripted runs**, so I forced it (`SND_POKE="F0=1@400-400"`):

```
f 400 $F0=1 $F2= 0 ... triangleOwner=13
f 447 $F0=1 $F2= 1        (and every 48 frames thereafter: 495 543 591 639 …)
f 879 $F0=1 $F2=10 ...    triangleOwner=00   <- triangle killed
```

`$ED1A-$ED3C`: `$F1` counts to `$30` (**48 frames**), then `$F2++` (clamped to
`$0B` at `$EEF0`). `$F2` is subtracted from pulse-2's volume nibble at `$EF16`,
result in `$F3`; when `$F3 < 7` the driver zeroes `$D4`, `$4008`, `$4009` —
**killing the triangle channel**. Every step landed exactly 48 frames apart.

### 8. THE LAG QUESTION — measured three ways, answer: no

**(a) Absolute cost.** 1600-frame gameplay runs:

```
driverCycles.min = 157   mean = 411..477   max = 1450 (at f311, stage-BGM start:
                                            three channels initialising at once)
```

`157` is not just a measured floor — I hand-counted the empty path off the
listing (2+2, then 39 cycles ×3 channels, 24 for the fourth, `LDA $F0`/`BEQ`/
`RTS` = 12) and got **exactly 157**. Two independent derivations, one number.
A frame is 29780.5 CPU cycles, so the driver is **0.5 % to 4.9 %** of a frame.

**(b) Where it sits.** `driverStartOffsetFromNmi.max = 3132` cycles — the driver
finishes ≲4600 cycles into the NMI. The NMI then **busy-waits on sprite-0 at
`$9AA3`**: measured `sprite0SpinIters.min = 1481` (≈11,850 cycles of pure
waiting), mean ≈1760-1911, max ≈2129. So the driver's whole cost budget is
spent inside a window that ends with the CPU deliberately doing nothing for
another 12,000 cycles.

**(c) The controlled intervention, not a correlation.** `SND_SILENCE=1` forces
all four owner bytes to 0 at the `$ED02` hook every frame, pinning the driver at
its 157-cycle path. Same input script, same 900 frames:

```
baseline:  driverCycles.mean = 411.5   nmiCycles.mean = 20006.3
silenced:  driverCycles.mean = 157.0   nmiCycles.mean = 19980.9
```

Frame-by-frame over the 586 gameplay frames:

```
driver cost removed: mean 352.3 cycles, max 1124
nmiCyc delta:        identical on 143/586 frames
                     mean +0.51, min -8, max +10
```

**Removing up to 1124 cycles of sound work per frame changes when the NMI
finishes by at most ±10 cycles.** The residue is one iteration of the 8-9-cycle
spin loop, i.e. quantisation of the sprite-0 landing. Regression on the
un-poked run agrees: `corr(drvCyc, nmiCyc) = 0.029`, slope 0.134;
`corr(drvCyc, spinIters) = −0.295`.

**(d) The driver reads no game state.** Read/write taps over all of RAM, gated
on "inside the `$ED02`…`$80A4` window", 1200 frames:

```
driverRamReads  = $0000-$0010 $0015 $00B0-$00E5 $00F0 $00F4-$00F5 $00F8-$00FB $01F3-$01F8
driverRamWrites = $00B0-$00E2 $00F4-$00F5 $00F8-$00FB $01F3-$01F6
```

`$0000-$0010` is **not** semantic — it is the 6502's dummy read at the
un-indexed address during `zp,X` addressing. Proved by attributing each one to a
PC: `$0002@ED0C x2000` is `LDA $02,X` executed 4×/frame over 500 frames;
`$0000@ED52 x719` is `DEC $00,X`. Every effective address is in `$B0-$F5`.
So the driver's footprint is **its own four structs + `$15` + the stack**, and
its cost is a function of the *music data* alone — never of object count,
sprite count or collision work.

**Conclusion for `docs/knowledge/06`:** Gradius's audio driver is a **fixed-shape
per-frame subsystem** with a data-dependent but small and load-independent cost,
positioned *before* an elastic busy-wait that absorbs it. It is not a lag source
in stage 1. The observed lag frame (game frame 283, the stage load) had the
driver at its **157-cycle minimum**. What the driver *does* do to lag is the
other direction: **a dropped NMI drops a music tick**, so lag stretches note
durations by one frame each — a permanent, audible phase shift of the music
relative to a port that never lags.

---

## What I could not do, and why

* **Stage 5 was never reached.** All slack numbers above are stage 1. The
  absorption argument depends on `spinIters > 0`; where the pre-split work
  overruns the sprite-0 hit the driver's cost becomes additive. Minimum slack I
  could produce was 1481 spin iterations ≈ 11,850 cycles. `NOTES-lag.md`'s
  Options-vs-lag experiment was not run.
* **The `$EF56` octave loop is a real worst-case hazard I could not close.**
  `LDY $10,X` then loop until `Y == 4`; if the data ever carries `$10,X > 4` the
  loop wraps Y through 256 and runs ~250 iterations (~5,000 cycles) for a single
  note. Measured across everything I could make play: `octaveLoopIters.max = 13`
  per frame. My static decoder claims index `$24` (`$FCD9`, triangle) contains
  octave operands 7 and 8; I forced that stream onto the triangle by poking the
  struct (`c2 = $24` from f400, verified) and saw **no** spike — so either my
  decoder desynchronises inside that stream's `$FD` sub-phrases, or the data path
  in question was not reached in 500 frames. **Unresolved.** It is the only place
  I found where the driver could cost thousands of cycles instead of hundreds.
* **`$F0` is only characterised by intervention**, not by reaching it in play.
  What game situation sets it (`$1B < $82` at `$8390`) is not established.
* `$28-$2D`/`$35-$3A` are dialect-A "music" — I did not identify what they are.
* Whether the `$F0`/`$F2` fade and the `$DD`/`$DE` **global** sub-phrase return
  are safe when two channels are inside `$FD` sub-phrases at once: `$DD/$DE` is
  one slot shared by all four channels, written at `$ED8D` and read at `$EDAA`
  possibly many ticks later. I did not construct a case that breaks it.

## If someone picks this up cold

```
python games/gradius/tools/oracle/snddata.py --table          # sound + pitch tables
python games/gradius/tools/oracle/snddata.py --stream 13      # decode a stream
python games/gradius/tools/oracle/snddata.py --selfcheck      # the falsifiable check
python games/gradius/tools/oracle/soundprobe.py --frames 900 --script "200:,10:S,690:" --tag base
SND_SILENCE=1 python games/gradius/tools/oracle/soundprobe.py --frames 900 --script "200:,10:S,690:" --tag silent
SND_POKE="F0=1@400-400" python games/gradius/tools/oracle/soundprobe.py --frames 900 --script "200:,10:S,690:" --tag fade
```

Input note that cost me two runs: **`A` is the shoot button, not `B`.** A
1600-frame run mashing `B` produced zero SFX requests; the same run with `A`
produced 116.
