# W151: recon ICS2115 audible semantics

**Status: COMPLETE**

Fidelity-critical hardware recon for the exercised DOJ ICS2115 modes. This wave
produces an implementation-ready E1 contract and fixtures, not runtime code.

## Premise audit

Verified against live HEAD `8830137` before task work. Production remains
inaudible and no ICS synth exists. The Wave E hardware questions remain live,
with one load-bearing scope correction from the captured register stream:

- all 1,620 keyons use OscConf `$20` (641), `$08` (618), or `$00` (361);
- OscConf `$A0` is written only three times, each in a reset/release-all
  sequence on voice 0 and immediately overwritten by `$00`; it is not an
  exercised audible format or loop mode;
- all 1,620 keyons use center pan `$7F`;
- ActiveOsc `$0E` is written six times and is always `$1F`, so all 32 voices
  are active;
- VCtl writes are only `$03` (3,533) and `$01` (1,720); OscCtl writes are only
  `$00` keyon (1,620) and `$0F` keyoff (1,720);
- the primary clock/rate relationship at 32 voices is
  `33,868,800 / (32 * 32) = 33,075 Hz` exactly, not an approximate 33.8 kHz.

Therefore E1 needs audible semantics for `$20/$08/$00`, center pan, 32-voice
timing, the two control values on each control register, and the formats those
three configurations select. `$A0` needs reset-safe state handling only. This
wave will not generalize unexercised synth modes merely because the chip has
them.

## Scope-breaking format correction

The `fmt=16bit` field in `keyon.tsv` is a stale decoder label, not a hardware
observation. It came from the old `soundprobe.lua` bit assignment and is false
for every stage-1 keyon. The control layout is:

| bit | OscConf meaning | evidence |
|---:|---|---|
| 0 | mu-law | real-board test harness and two independent implementations agree; not exercised |
| 1 | 16-bit linear when set, 8-bit linear when clear | real-board format probe; the register-compatible GF1 puts this function at bit 2, so the GF1 SDK is analogy, not proof of this shifted ICS2115 bit |
| 3 | loop | real-board probe and DOJ's long BGM sample windows |
| 4 | bidirectional | board probe; not exercised |
| 5 | oscillator-end IRQ enable | board IRQ probe and DOJ `$20` one-shot service path |
| 6 | reverse | board probe; not exercised |
| 7 | oscillator IRQ pending | board probe; `$A0` is only reset-time pending plus enable |

Consequently the live modes are exactly:

- `$20`: signed 8-bit linear, forward, non-looping, oscillator IRQ enabled;
- `$08`: signed 8-bit linear, forward, looping, IRQ disabled;
- `$00`: signed 8-bit linear, forward, non-looping, IRQ disabled;
- `$A0`: the `$20` control with pending already set, seen only in three reset
  writes and overwritten before keyon.

This also corrects the loop-bit guess in W146 and `src/voice.js`: bit 3, not
bit 1, selects looping. No runtime source is changed in this recon wave. E1 and
the later L3 integration must use bit 3; until then the existing frame-level
countdown remains explicitly non-authoritative hardware modeling.

## Exercised-state inventory

Replaying the 191,367 writes into a per-voice register shadow at each of the
1,620 `$10/hi = $00` keyons gives:

- pan `$7F`, VMode `$00`, and VCtl `$03` at every keyon;
- VIncr is `$00` or `$3F`, but VCtl `$03` has both DONE and STOP set, so the
  accumulator is static while the oscillator is audible;
- 50 VolAcc words are exercised, from `$7FF0` through `$FD60`;
- oscillator control `$00` clears DONE and STOP and starts playback; `$0F`
  has those low two bits set and is the only DOJ keyoff value;
- no audible keyon selects 16-bit linear or mu-law, no volume ramp runs while
  audible, no non-center pan is programmed, and no reverse or bidirectional
  oscillator is programmed.

The bounded E1 synth therefore needs one sample decoder, linear interpolation,
static logarithmic volume, one center-pan setting, forward one-shot and forward
loop boundaries, and oscillator-end IRQ. Generic mu-law, 16-bit sample-pair,
non-center pan, reverse, bidirectional, and live volume-ramp synthesis are not
stage-1 requirements and must remain loud unsupported modes rather than guesses.

## Evidence ledger

The evidence classes below are deliberately separate. A public implementation
claim is not promoted to a datasheet fact merely because two implementations
agree.

| claim | class | result |
|---|---|---|
| 33.868800 MHz standard crystal; 24 voices at 44.1 kHz and 32 near 33.8 kHz | manufacturer datasheet | primary fact |
| OscFC is 6 integer plus 9 fractional bits; OscAcc is 20 integer plus 9 fractional bits; loop endpoints are 20 integer plus 4 fractional bits | manufacturer datasheet | primary fact |
| wavetable ROM data bus is byte-wide; DAC stream is stereo signed two's complement with internal 16-bit data sign-extended to 24 bits | manufacturer datasheet | primary fact |
| linear interpolation between adjacent samples at the accumulator fraction | original Gravis/Forte GF1 SDK for the register-compatible ancestor | primary cross-chip analogy, corroborated by both ICS2115 implementations |
| control bit layout, active-low IRQV source bits, and exponent/mantissa volume layout | original GF1 SDK plus PGM real-board probes | GF1 layout is analogy; shifted ICS2115 format bit and split OscCtl are board-measured claims |
| `$20/$08/$00` inventory, VCtl `$03`, center `$7F`, static volumes, and exact addresses | DOJ ROM-derived listing/captures | proves what DOJ programs, not silicon response |
| 8-bit format expands signed byte `b` to `int8(b) * 256` | byte bus plus board format probe | settled for every exercised DOJ format |
| exact logarithmic volume integer rounding | public real-board sweep, independently upstreamed to MAME in July 2026 | board-measured claim; MAME PCM is not used as truth |
| center-pan attenuation constants | GPL PGM core says hardware-measured, but its raw CSV is absent | unresolved here; no GPL table entries copied |
| IRQV is active-low source plus voice, scans round-robin, read consumes the selected event latch, and an uncleared end condition reasserts | dated PGM board-probe report and test ROM | board-measured claim; raw event log is absent from the public tree |
| equality versus strict crossing at an oscillator endpoint | GF1 wording, MAME, and the PGM secondary implementation disagree by one native sample | unresolved |

The local GPL tree was inspected read-only at release commit `cb19330`. No code,
lookup table, pan entry, or transformed GPL value is present in this repository.
Its `audio_tests` and Z80 test ROM establish that the claims came from a physical
PGM board and show the experiment shape. The large raw audio and IRQ captures
are not committed there, so another researcher cannot reproduce the numeric
pan result from that repository alone.

## Primary arithmetic contract for E1

All arithmetic below is integer arithmetic. JavaScript implementations must use
values that remain exact under Number, or explicit 32-bit operations where the
sign is intended. No floating point phase or volume state is needed.

### Clock and phase

For `ActiveOsc = n`, the native stereo-frame rate is:

```text
sourceRate = 33,868,800 / ((n + 1) * 32)
```

DOJ always writes `n = 31`, hence exactly 33,075 stereo frames per second. One
native frame services every active oscillator once. `emit=false` must execute
the same service, phase, boundary, done, and IRQ transitions, then discard the
stereo result.

Use a 29-bit 20.9 unsigned phase:

```text
loopRaw = (loopHigh16 << 13) | (loopLow8 << 5)
accRaw  = (accHigh16  << 13) | (accLow16 & $1FFF)
stepRaw = OscFC >>> 1
byteAddress = ((OscSAddr & $0F) << 20) | (accRaw >>> 9)   // PGM 24-bit bus
fraction = accRaw & $1FF
```

This corrects another stale statement: at 32 voices, `$0100` advances half an
8-bit sample per native frame and traverses 16,537.5 sample bytes per second.
The old `fc * 33075 / 1024` note was off by two because it treated bit 0 as a
fractional data bit instead of unused.

### Sample and interpolation

Every exercised configuration is signed 8-bit linear. The complete live decode
is therefore:

```text
s16(byte) = signExtend8(byte) << 8
interp(a, b, f) = a + floor(((b - a) * f) / 512), 0 <= f < 512
```

The interpolation fixture uses bytes `$FF,$FE`, giving samples `-256,-512` and
fractions `0,128,256,384,511` giving `-256,-320,-384,-448,-512`. The checker
also proves that all 1,501 non-empty keyon windows map into the deferred shard
and observes bytes on both sides of the sign boundary. It commits no new ROM
bytes.

The GF1 SDK's loop-padding instructions show that interpolation reads the
physically adjacent byte at a loop edge, rather than magically substituting the
loop-start byte. That is a cross-chip inference, but it is the least speculative
E1 behavior and matches both classified secondary implementations.

### Static logarithmic volume

The 16-bit VolAcc register contributes its upper 12 bits as index `i =
VolAcc >>> 4`. The hardware-measured exponent/mantissa conversion, independently
expressed as arithmetic rather than copied as a lookup table, is:

```text
e = i >>> 8
m = i & $FF
gain(0xxx) = m >>> 7
gain(exxx) = ceil((($100 | m) * 2^(e - 1)) / 256), e > 0
```

Synthetic checked vectors before pan attenuation are `$7FF0 -> 128`, `$E600 ->
11264`, and `$FD60 -> 30080`. These are 15-bit unsigned gains. Per-voice mixing
uses an arithmetic right shift of 15 after `sample * gain`.

All audible keyons have VCtl `$03`, whose low bits are DONE and STOP. `$01`
appears only in the keyoff transition and still has DONE set. Thus E1 must retain
and update VIncr/VStart/VEnd/VolAcc/VCtl state but must not advance a live volume
envelope for the stage-1 stream. Direction, rollover, loop, and ramp-end behavior
remain unsupported generic-chip modes. This is not a loss of exercised fidelity.

### OscCtl, boundaries, and IRQV

OscCtl low bit is DONE and bit 1 is STOP. DOJ `$00` clears both and starts the
oscillator. `$0F` sets both low bits and stops it; the unused upper bits are
preserved in the register shadow but need no invented behavior.

For a forward oscillator, emit/interpolate at current phase, calculate `next =
phase + step`, then compare to the endpoint. On a strict crossing:

- `$08` wraps to `start + (next - end)` and remains running;
- `$20/$00` stays at the boundary and sets OscCtl DONE;
- `$20` additionally latches an oscillator IRQ because bit 5 is set;
- `$00` has no IRQ enable and stops silently.

Whether equality itself or the following strict crossing causes the transition
is still unresolved by primary ICS2115 evidence. The executable fixture records
the strict-crossing candidate used by the 2026 board project, but E1 must label
that one-native-frame choice until the experiment below is run.

IRQV's returned high byte is:

```text
bit 7 = 0 when oscillator source is reported
bit 6 = 0 when volume source is reported
bit 5 = 1
bits 4..0 = oscillator number
```

For oscillator 3 alone this is `$63`. A read consumes the selected event latch.
If the voice remains ended with oscillator IRQ enabled, the physical-board
report says the condition re-latches, so reading alone can storm. DOJ's handler
drains IRQV and immediately runs the keyoff path, which writes OscConf `$00` and
OscCtl `$0F`; that removes the source before the next drain. When several voices
are pending, the reported board behavior is round-robin starting after the last
reported oscillator. E1 should keep `lastIrqVoice` and scan `(last+1)..(last+32)`
modulo 32, limited by ActiveOsc.

## Center-pan fixture and the remaining board experiment

All 1,620 keyons use `$7F`; hardware stores only the high nibble, so the live pan
position is 7 of 15. The public physical-board project publishes a measured
16-step attenuation table, but importing its center entries or values derived
from them would violate this wave's GPL boundary. The raw CSV that could support
an independent derivation is absent. Exact left/right center attenuation is
therefore the one load-bearing audible fact this recon does not settle.

The smallest sufficient experiment is one physical PGM motherboard run:

1. Fill a known address with a constant signed byte `$80` and select linear-8,
   FC zero, OscCtl `$00`, VCtl `$03`, one active voice, and pan `$7F`.
2. For VolAcc `$7FF0`, `$E600`, `$FD60`, and `$FFFF`, capture at least 64 stable
   native left/right frames from the serial DAC bus after register settling.
3. Record the exact integer median of each channel after removing DC offset.
4. Repeat once at pan `$00` and `$F0` only to identify left/right orientation,
   not to generalize the whole pan law.

The future fixture rows are therefore fixed now, with only expected output
blank pending measurement:

| byte | pan | VolAcc | expected left | expected right |
|---:|---:|---:|---:|---:|
| `$80` | `$7F` | `$7FF0` | board capture required | board capture required |
| `$80` | `$7F` | `$E600` | board capture required | board capture required |
| `$80` | `$7F` | `$FD60` | board capture required | board capture required |
| `$80` | `$7F` | `$FFFF` | board capture required | board capture required |

E1 may implement phase, sample decode, interpolation, volume before pan,
boundary state, and IRQ now. It may not claim faithful audible amplitude or a
complete sounds-right synth until those four center rows are filled. A temporary
center policy would be an explicit approximation and is not authorized by this
recon.

A second tiny board experiment settles endpoint equality: set start raw 0, end
raw 512, FC `$0200`, `$20`, and read OscAcc/OscCtl/IRQV after each native frame.
The distinguishing observation is whether DONE/IRQ appears on the service that
makes phase equal 512 or one service later. This is the only unresolved phase
boundary bit needed by DOJ.

## Executable recon and mutation

`games/ddpdoj/tools/w151icsrecon.mjs` performs 21 checks over 1,620 keyons,
191,367 register writes, synthetic integer vectors, and all 1,501 non-empty
sample windows. It does not synthesize PCM and does not consume MAME audio.

Green:

```text
node games/ddpdoj/tools/w151icsrecon.mjs
W151 GREEN: 21 checks, 1,620 keyons, 1,501 sharded windows, mutation=none
```

Deliberately changing the format-bit decoder from bit 1 to bit 5 makes check 3
fail because `$20` is then misclassified as 16-bit. Restoring the decoder returns
all 21 checks to green:

```text
node games/ddpdoj/tools/w151icsrecon.mjs --mutate=format-bit
AssertionError: actual [ 'linear16', 'linear8' ], expected [ 'linear8' ]
```

An initial attempted mutation changed the format mask to zero. That did not fail
because a zero mask still classified every row as linear-8. It was an ineffective
mutation, not evidence. The mutation was corrected to bit 5 and observed red as
shown above. No other new check was claimed without a red mechanism.

## Final gates

Revalidated on stable HEAD `02fca29` after W152 landed:

```text
node games/ddpdoj/tools/w151icsrecon.mjs
W151 GREEN: 21 checks, 1,620 keyons, 1,501 sharded windows, mutation=none

node --test games/ddpdoj/tests/
tests 1359, pass 1359, fail 0, skipped 0

node tools/publish.mjs --only ddpdoj --dry
tests 1359, pass 1359, fail 0, skipped 0
rom-leak guard: 277 files, 53 decompressed, 12 ROMs, clean
dist: 281 files, 8,744 KB
--dry: built and gated, not deployed
```

The dry publish reported the same six pre-existing deliberate verbatim
exceptions. W151 added no publish exception, no runtime source, no sample ROM
bytes, and no deployment.

## Sources

- Integrated Circuit Systems, *ICS2115 WaveFront Synthesizer, Rev B,
  1994-07-26*: <https://stuff.mit.edu/afs/sipb/contrib/doc/specs/ic/audio/ics2115.pdf>
- Integrated Circuit Systems, *1994 Data Book*, archived by Bitsavers:
  <https://www.bitsavers.org/pdf/integratedCircuitSystems/1994_Integrated_Circuit_Systems_Data_Book.pdf>
- Advanced Gravis, Forte Technologies, and Ingenuity Software, *UltraSound
  Software Development Kit 2.22*, 1994-12-21:
  <https://www.infania.net/misc1/GUS/docs/UltraSound%20Lowlevel%20ToolKit%20v2.22%20%2821%20December%201994%29.pdf>
- AMD, *Monolithic PC audio circuit with enhanced digital wavetable audio
  synthesizer*, US 5,659,466. This is used only as a register-compatible
  architectural cross-check, not as ICS2115 authority:
  <https://patents.justia.com/patent/5659466>
- PGMTech, board and cartridge bus description, including the cartridge's
  8-bit M ROM: <https://github.com/laoo/PGMTech>
- MiSTer PGM ICS2115 physical-board harness and classified GPL implementation,
  release `cb19330`: <https://github.com/MiSTer-devel/Arcade-IGSPGM_MiSTer/tree/cb19330/rtl/ics2115>
- MAME ICS2115 source, classified BSD secondary reference with its uncertainty
  list intact: <https://github.com/mamedev/mame/blob/master/src/devices/sound/ics2115.cpp>
- MAME PR 15686, which attributes the July 2026 volume change to hardware
  measurement and cites the PGM board project:
  <https://github.com/mamedev/mame/pull/15686>

No patent located in this pass is an ICS2115 manufacturer patent that defines
its omitted control bits. The AMD patents describe a related GF1/InterWave
architecture and do not override the physical PGM measurements.
