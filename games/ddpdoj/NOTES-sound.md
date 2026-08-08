# Sound - why this is not the Game Boy problem, and how to attack it anyway

status: PLANNING (no port work started)   raised: 2026-08-01

## 2026-08-08 W151 correction

The planning-era format labels below are stale. `keyon.tsv` says `fmt=16bit`
because the capture helper decoded the OscConf format bit incorrectly. The live
stage-1 modes `$20`, `$08`, and `$00` are all signed 8-bit linear on PGM's
byte-wide M-ROM bus. Bit 1 selects 16-bit and is clear in all 1,620 keyons; bit
3 is loop, so `$08` is the looping BGM mode; bit 5 is oscillator IRQ enable, so
`$20` is the IRQ-producing one-shot SFX mode. `$A0` appears only in three reset
writes and is never keyed on. FC `$0100` advances half a byte sample per 33,075
Hz native frame, or 16,537.5 sample bytes per second. See W151 for evidence,
integer fixtures, the exact center-pan measurement still required, and the
endpoint-equality question. Do not use `sampledump.py`'s current `fmt` branch as
hardware truth until that diagnostic tool is corrected in an implementation
wave.

## The thing that changed

Batman's sound was a handful of DMG channels: square, wave, noise, a driver
ticking per frame, and a register set small enough to reason about whole.
Gradius wave 8 ported the NES `$ED02` driver **state-exact first, audio output as
the stretch**, and that was the right bar for an APU.

**DaiOuJou is not that.** The PGM's audio chip is an **ICS2115** - a multi-voice
wavetable/sample synthesiser with per-voice sample position, pitch, volume
envelopes, interrupts and timers. It is a small synthesiser, not four channels.

And the second half matters as much: **MAME's own ICS2115 implementation
contains details that are unresolved or not fully verified** (`src/devices/
sound/ics2115.cpp`, public source; we have MAME's binary distribution only, so
this is on the owner's report and the file should be read before any port work).

## Which makes it the LAG problem again, and that is good news

`NOTES-slowdown-oracle.md` already carries the split that rescues work when the
emulator is authoritative about some things and not others. Sound needs the same
table:

| question | who can answer it | confidence |
|---|---|---|
| **WHAT THE GAME ASKS FOR** - which command the 68k sends, which voice is keyed on, with what sample, pitch, envelope and volume, on which frame | MAME. This is the GAME'S CODE and the register writes it makes. | high - verifiable frame-exact, same as every other subsystem |
| **WHAT COMES OUT OF THE CHIP** - the actual waveform | MAME's ICS2115 model, which is itself incompletely verified | low - NOT ground truth |

So the bar is the same one Gradius set and for a sharper reason:
**state-exactness first.** A port that issues byte-identical voice commands on
byte-identical frames is *correct in the part we can prove*, and can be given a
better synthesiser later without redoing the driver. A port that chases MAME's
audio output risks baking in someone else's unverified guesses about hardware,
which is `docs/knowledge/06`'s rule with the nouns changed:

> MAME is authoritative for WHAT the game computes, not for what the hardware
> then does with it.

## What we already know, measured

From `docs/worklog/ddpdoj/00-recon-assets.md` (status PARTIAL on sound):

- **The 68k→Z80 command protocol is a MAILBOX, not a byte.** A write tap on
  `0xc00003` sees the handshake. That is the boundary to port first and the one
  most likely to be verifiable end to end.
- Regions: `ics` is 0x1000000, assembled from `pgm_m01s.rom` @0x000000 and
  `cave_m04401b032.u17` @**0x400000** (the offset is not what a reader would
  guess - the same class of trap as the tile ROM at 0x180000).
- A first live sample capture exists; nothing is decoded or verified.

## The three things to settle before writing any code

1. **Read `ics2115.cpp` and classify every uncertainty.** For each unresolved
   detail: is it a hardware fact MAME has approximated, or a workaround for
   something nobody has measured? Reproduce the first; never bake in the second.
   This is the same task as `TODO-zoom-table-quirk.md` and should be done in the
   same pass over the driver's comments.
2. **Decide what "verified sound" MEANS here**, before claiming it. Candidates,
   strongest first: (a) the command stream to the chip is byte-exact per frame;
   (b) the per-voice register state is byte-exact at the sample point; (c) the
   emitted PCM matches MAME's. **(c) is the weakest claim despite sounding like
   the strongest**, because it inherits MAME's uncertainty - and it is the one a
   naive gate would reach for, because comparing audio buffers is easy.
3. **Where the samples live at runtime.** `cave_m04401b032.u17` is 4 MiB and
   `pgm_m01s.rom` is 2 MiB. This is the first asset in the project big enough
   that shipping it is a real decision - see the deferred sharding question.
   The published slice today is 363 KiB total; sound would dwarf everything
   else, and that is the trigger for designing shard boundaries rather than
   doing it prematurely.

## The honest expectation

Getting *state-exact* sound is tractable and worth doing: it is a driver, a
mailbox and a register file, and this project is good at those.

Getting *audible, correct* sound depends on a synthesiser model whose reference
implementation is admittedly incomplete. That is a research problem, not a
porting problem, and it should be labelled as one rather than allowed to look
like the last 10% of a port. If it is attempted, the ICS2115's own
documentation - not MAME's source - is the reference to work from.
