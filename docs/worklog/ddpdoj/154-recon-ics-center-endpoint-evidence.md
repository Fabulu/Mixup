# W154: recon ICS2115 center and endpoint evidence

**Status: COMPLETE**

Source-code and archival evidence recon for the two exercised ICS2115 facts
left unresolved by W151: exact `$7F` center-pan integer DAC gain for the four
fixture volumes, and equality versus strict crossing at a forward one-shot
endpoint.

## Premise audit

Verified against live HEAD `76b2475` before task work. W151's premise remains
live:

- `games/ddpdoj/tools/w151icsrecon.mjs` still deliberately has no exact
  center-pan expected values;
- W151 still labels the equality edge unresolved;
- no later committed source settles either fact;
- W153 is concurrently untracked and outside this docs-only wave.

No DOJ runtime source, test, exporter, asset, or W153 file is changed here.

## Result

Neither fact is settled to an authentic ICS2115 standard.

The search did find two license-safe approximations and a stronger way to
classify them:

1. Current MAME is BSD-3-Clause and therefore usable as code provenance, but
   its pan law was merged in 2021 with an explicit request for confirmation
   from real hardware owners. That confirmation is still absent from MAME's
   source and review record. Its endpoint comparison also retains an inline
   question about the equality choice. MAME is license-safe but is not strong
   enough to support an authentic claim for either fact.
2. AMD's register-compatible InterWave/GF1 descendant patent publishes a
   16-position constant-power pan table and defines boundary-cross as a
   negative remainder after `ADD + FC`. It is independent of the 2026 GPL PGM
   project and is stronger technical evidence than MAME's unconfirmed pan
   approximation. It is still cross-chip evidence, not ICS2115 silicon proof.

The public PGM project contains a physical-board experiment harness and a GPL
implementation, but no raw pan CSV and no endpoint event log. Its GitHub
recursive tree contains the scripts and implementation only, and the project
has no GitHub release assets. No table entry, constant, transformed value, or
prose from that GPL project is copied here.

## Evidence and license ledger

| source | license or publication class | measurement provenance | useful result | authority for ICS2115 |
|---|---|---|---|---|
| ICS2115 Rev B datasheet and 1994 data book | manufacturer publication | primary design document | defines register names and phase widths, but gives no pan law and no endpoint comparator wording | primary, but silent on both questions |
| UltraSound SDK 2.22 | original vendor SDK | primary GF1 documentation | says rollover IRQ occurs at equality, calls the end point inclusive, and warns interpolation can read beyond it | register-compatible ancestor analogy only |
| AMD US 5,659,466 | public patent disclosure | primary InterWave design description | gives the 16-position offset table and defines boundary-cross only when the post-step remainder is negative | register-compatible descendant analogy only |
| MAME `ics2115.cpp` | BSD-3-Clause | implementation, no published ICS pan capture | current pan is explicitly unconfirmed; current endpoint chooses equality with a question in source | license-safe secondary approximation |
| MiSTer PGM release `cb19330` | GPL-2.0 project | states physical-board origin, but raw distinguishing captures are absent | contains a pan sweep harness and a strict-crossing implementation candidate | classified secondary implementation, not copied |

## Question 1: exact `$7F` center gain

### Manufacturer evidence

The ICS2115 datasheet identifies OscPan as an 8-bit value and says the related
ICS2210 has ten bits. It does not define attenuation, rounding, channel
orientation, or how the low nibble is treated. No manufacturer erratum,
application note, WaveFront SDK, archived CSV, or DAC trace that adds those
facts was located.

The public PGM release tree contains `audio_tests/vol_pan.py` and a test-ROM
page, but no output from them. The repository's one public release commit is
`cb193301d9ea8ef3c284d8e0c7d2893c46355642`, and its recursive tree has no
pan CSV or log. GitHub reports no release assets. Therefore the GPL
implementation's assertion that its table is measured cannot be independently
recalculated from the public artifacts.

### Current MAME approximation

MAME PR 8489 introduced the pan law in August 2021, years before the 2026 PGM
board project. The PR says it is a logarithmic approximation derived from the
AMD patent and needs confirmation by hardware owners. The code remains
BSD-3-Clause and its source still carries the same confirmation warning.

At pan `$7F`, current MAME subtracts 9 volume-index steps on the left and 10 on
the right. Applying W151's already established volume conversion gives this
fully reproducible approximation:

| VolAcc | MAME left gain | MAME right gain | DAC word for byte `$80`, left | DAC word for byte `$80`, right |
|---:|---:|---:|---:|---:|
| `$7FF0` | 126 | 126 | -126 | -126 |
| `$E600` | 10,976 | 10,944 | -10,976 | -10,944 |
| `$FD60` | 29,504 | 29,440 | -29,504 | -29,440 |
| `$FFFF` | 32,128 | 32,064 | -32,128 | -32,064 |

Those integers are license-safe to reproduce from MAME's BSD source, but they
are not hardware measurements. More importantly, the approximation does not
reproduce the patent's published 16-position offsets, so the patent citation
does not upgrade it to primary evidence.

### Patent-derived approximation

AMD US 5,659,466 publishes constant-power left and right offsets for all
sixteen single-pan positions. For position 7, corresponding to the high nibble
of DOJ's `$7F`, the disclosed offsets are 116 left and 141 right. Applying
those independent primary values to W151's volume conversion gives:

| VolAcc | patent-derived left gain | patent-derived right gain | DAC word for byte `$80`, left | DAC word for byte `$80`, right |
|---:|---:|---:|---:|---:|
| `$7FF0` | 99 | 93 | -99 | -93 |
| `$E600` | 7,872 | 7,472 | -7,872 | -7,472 |
| `$FD60` | 22,656 | 21,056 | -22,656 | -21,056 |
| `$FFFF` | 25,280 | 23,680 | -25,280 | -23,680 |

This is a much larger center attenuation than current MAME. The calculation is
reproducible without the GPL PGM table and its provenance predates that project
by decades. It is nevertheless an InterWave/GF1-descendant result. The
ICS2115 could use different offsets or rounding, so these rows remain an
owner-approved approximation rather than authentic expected values.

### Pan conclusion

Exact ICS2115 center gain remains unresolved. The four W151 fixture cells must
not be filled as authentic from either MAME or the AMD patent. If the owner
authorizes an approximation, the patent-derived rows have materially stronger
technical provenance than current MAME. A physical PGM serial-DAC capture is
still the only evidence sufficient to close the authentic gate.

## Question 2: equality or strict crossing

### Exact wording and phase units

The ICS2115 manufacturer document provides these units only:

- OscFC: 6 integer plus 9 fractional bits;
- OscAcc: 20 integer plus 9 fractional bits;
- OscEnd: 20 integer plus 4 fractional bits.

It never defines whether the comparator observes equality or only a negative
post-step remainder.

The original GF1 SDK uses two descriptions that do not completely determine
service ordering:

- section 3.11 says the rollover IRQ occurs when current position equals the
  end position;
- section 3.9 says a sample's end point is inclusive, and warns that the GF1
  can interpolate data beyond that point.

With a render-then-update engine, stopping on the service whose update first
makes phase equal would omit the endpoint sample. Stopping only after crossing
would render it. The SDK does not state where render, compare, and accumulator
write fall inside one voice service, so its prose cannot distinguish the two
W151 candidates by itself.

AMD US 5,659,466 is precise for the register-compatible descendant. Its
boundary-cross flag becomes one when `END - (ADD + FC)` is negative for forward
motion. Equality produces zero, not negative, so that design uses strict
crossing.

Current MAME does the opposite: after adding FC it treats zero remainder as an
endpoint event. The adjacent source comment asks whether the comparison was
chosen to avoid crackling, and the file's TODO list still asks for interrupt
verification. That is executable BSD behavior, but not evidence that the chip
does it.

The public PGM GPL release chooses strict crossing. Its committed board script
reads accumulator and control state only at half-second intervals, not on the
two adjacent native services, and no endpoint event log is committed. Thus the
implementation choice and its physical-board attribution cannot be audited to
the one-frame distinction.

### Endpoint conclusion

Strict crossing has the stronger cross-chip case: the AMD primary formula, the
GF1 inclusive-end instruction, and the public PGM implementation candidate all
point that way. Equality has the GF1 rollover sentence and current MAME. None
is a direct, reproducible ICS2115 observation. The exact ICS2115 service remains
unresolved and must not be labeled authentic.

## Smallest physical-board experiment packet

This packet uses only synthetic test data and manufacturer-published register
facts. It needs no game ROM bytes and no GPL table.

### Capture requirements

Use one physical PGM motherboard, a test cartridge whose synthetic M region is
licensed for redistribution, and a logic or serial-DAC capture that records:

- ICS2115 `LRCLK`, `BCK`, and `SERDATA` decoded as signed 16-bit left/right
  words;
- the ICS2115 IRQ pin;
- preferably the wavetable ROM address and select lines, so endpoint fetches
  can be observed without depending on amplitude;
- the timestamp of the final OscCtl key-on write.

Retain the raw capture, the exact test M image hash, the register-write log,
the decoder version, and the derived CSV in the repository that owns the board
experiment. A prose summary alone is not enough.

### Packet P: center gain

1. Fill the synthetic test sample window with byte `$80` for at least 256
   bytes. Stop all voices, select 32 active oscillators, and run only voice 0.
2. Program forward linear-8 looping with FC zero, static volume, and pan `$7F`.
   Keep every register except VolAcc identical between rows.
3. For each VolAcc `$7FF0`, `$E600`, `$FD60`, and `$FFFF`, discard the first
   128 DAC frames after the write, then retain 1,024 stable frames.
4. Repeat each row after a full voice stop and restart. Also capture one `$00`
   and one `$F0` pan row at `$FFFF` to establish channel orientation only.
5. Emit CSV columns
   `run,pan,volacc,frame,left_s16,right_s16,stable_start,stable_end`.

Acceptance requires both repeats to have one exact integer mode per channel,
with no disagreement after settling. For source byte `$80`, the magnitude of
the stable signed DAC word is the integer channel gain. These eight integers
directly fill the four W151 cells.

### Packet E: endpoint edge

1. Put distinct synthetic bytes at sample addresses 0, 1, and 2 so the endpoint
   fetch can be recognized on the ROM bus. Stop all voices and configure voice
   0 with start raw 0, end raw 512, accumulator raw 0, and OscFC `$0200`. In
   W151's 20.9 phase units the step is 256.
2. Use forward linear-8 one-shot mode with oscillator IRQ enabled, 32 active
   voices, and then perform the final OscCtl `$00` key-on write.
3. Capture from before key-on until at least four native DAC frames after the
   IRQ edge. Repeat 128 times from a full voice reset.
4. Decode the voice services as phase 0, phase 256, and phase 512. The
   equality candidate raises DONE/IRQ on the service that updates 256 to 512.
   The strict-crossing candidate retains phase 512 for one more service and
   raises DONE/IRQ only when the next update would pass it.
5. Emit CSV columns
   `run,service,phase_before,rom_address,irq_before,irq_after,oscctl,irqv`.

Acceptance is binary: all valid trials either show or do not show the endpoint
fetch before the first IRQ assertion. Discard trials where register buffering
cannot establish the first active service. Publishing the raw logic capture is
mandatory because asynchronous host reads cannot distinguish one 33,075 Hz
service reliably.

## E1 decision table

| behavior | authentic subset E1 can ship now | refused without more evidence | owner-approved approximation |
|---|---|---|---|
| phase, 8-bit decode, interpolation, pre-pan logarithmic gain, 32-voice rate | yes, as specified and checked by W151 | generic unexercised formats and envelopes | none needed |
| `$7F` center pan | register state and a loud unresolved policy only | any claim of exact audible amplitude | AMD patent-derived rows are strongest; current MAME rows are license-safe but weaker |
| forward one-shot endpoint and IRQ | phase can advance up to the undecided edge; policy can be isolated and named | claiming equality or strict crossing as authentic ICS2115 | strict crossing is the stronger approximation; equality matches current MAME only |

E1 can land the settled arithmetic and explicit policy boundary now. A live
audible runtime needs one pan policy and one endpoint policy. Selecting either
approximation changes fidelity semantics and therefore requires explicit owner
approval. Without that approval, exact amplitude and final one-shot transition
remain refused rather than guessed.

## Executable claims

No checker was added. Neither unresolved ICS2115 fact became a newly supported
authentic claim, and an executable test containing approximation values would
risk laundering them into expected hardware output. The two approximation
tables above were independently recalculated from the cited BSD/patent inputs
and W151's existing volume arithmetic.

## Gates

Revalidated on stable HEAD `c7a3328` after W153 landed:

```text
node games/ddpdoj/tools/w151icsrecon.mjs
W151 GREEN: 21 checks, 1,620 keyons, 1,501 sharded windows, mutation=none

node --test games/ddpdoj/tests/
tests 1369, pass 1369, fail 0, skipped 0, todo 0

node tools/publish.mjs --only ddpdoj --dry
tests 1369, pass 1369, fail 0, skipped 0, todo 0
rom-leak guard: 277 files, 53 decompressed, 12 ROMs, clean
dist: 281 files, 8,756 KB
--dry: built and gated, not deployed
```

The dry publish reported the same six deliberate verbatim exceptions. W154
adds no runtime source, test, asset, ROM byte, publish exception, or deployed
artifact. No new executable claim was added, so there is no W154 mutation to
demonstrate. W151's existing executable fixture remains green and continues to
label its strict-crossing vector as a candidate rather than physical proof.

## Sources

- Integrated Circuit Systems, *ICS2115 WaveFront Synthesizer, Rev B,
  1994-07-26*: <https://stuff.mit.edu/afs/sipb/contrib/doc/specs/ic/audio/ics2115.pdf>
- Integrated Circuit Systems, *1994 Data Book*:
  <https://www.bitsavers.org/pdf/integratedCircuitSystems/1994_Integrated_Circuit_Systems_Data_Book.pdf>
- Advanced Gravis, Forte Technologies, and Ingenuity Software, *UltraSound
  Software Development Kit 2.22*, especially sections 2.6.2, 3.9, and 3.11:
  <https://www.infania.net/misc1/GUS/docs/UltraSound%20Lowlevel%20ToolKit%20v2.22%20%2821%20December%201994%29.pdf>
- AMD, *Monolithic PC audio circuit with enhanced digital wavetable audio
  synthesizer*, US 5,659,466, volume/pan and address-generator sections:
  <https://patents.justia.com/patent/5659466>
- MAME current ICS2115 source at merge commit `6067258`, BSD-3-Clause:
  <https://github.com/mamedev/mame/blob/60672585a12e6dab7816f50cceecf319248bc25c/src/devices/sound/ics2115.cpp>
- MAME pan commit `aa4ca64` and PR 8489, including the explicit hardware
  confirmation caveat:
  <https://github.com/mamedev/mame/commit/aa4ca64ecbf3c364da3e8aa50ff5e5235ae32217>
  and <https://github.com/mamedev/mame/pull/8489>
- MAME volume measurement merge PR 15686, cited only to separate the newer
  volume provenance from the older unconfirmed pan law:
  <https://github.com/mamedev/mame/pull/15686>
- MiSTer PGM release tree `cb19330`, GPL-2.0, inspected only for experiment
  provenance and missing raw artifacts:
  <https://github.com/MiSTer-devel/Arcade-IGSPGM_MiSTer/tree/cb193301d9ea8ef3c284d8e0c7d2893c46355642/audio_tests>
- Exact public recursive tree used to confirm the missing CSV/log:
  <https://api.github.com/repos/MiSTer-devel/Arcade-IGSPGM_MiSTer/git/trees/c3d0bd57cce1305526c12f52289218c9c9c550b9?recursive=1>
