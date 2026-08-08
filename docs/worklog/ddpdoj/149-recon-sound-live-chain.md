# W149: recon and architecture for the live sound chain

**Status: DONE**

The assigned deliverable was a Wave E ICS2115 synthesizer plus the DOJ adapter
to shared Wave F, described as finishing sound to audible. The premise audit
found that the register producer which both depend on is not live. This wave is
therefore reclassified as recon and architecture. It does not ship a synth or
claim browser audio.

## 1. Premise audit against HEAD

Audited against `2125003` before implementation.

- **CORRECT:** Wave D's deferred assets exist after regeneration:
  `snd/sample.shard.u8.gz`, `snd/sample.index.json.gz`, and
  `snd/bgm-score.json.gz`. The manifest marks all three deferred. The sample
  sidecar maps 28 stitched u17 windows into ICS addresses.
- **CORRECT:** shared Wave F has landed. `shared/audio.js` supplies the
  gesture-created `AudioContext`, mute-keeps-running behavior, backlog valve,
  stereo buffers, streaming resampler, limiter, and error firewall. Its chip
  contract is `{frame, drain, outLen, sourceRate, channels}`.
- **CORRECTION, LOAD-BEARING:** `SoundChain` is not on the live game path.
  `Game` constructs only `SoundState` at `src/main.js:225-231` and stops after
  one `drainFrame` at `src/main.js:654-662`. There are zero production
  `SoundChain` constructors. Every external constructor, `enqueueDoor`, and
  `runMainLoop` call is in a test.
- **CORRECTION, LOAD-BEARING:** Wave C6 does not contain a production parameter
  source. The default `SfxParamTable` is empty. The 613-keyon test constructs a
  new per-door table from `ics.tsv` and injects the oracle's historical voice.
  An arbitrary live cue therefore arms zero voices.
- **CORRECTION, LOAD-BEARING:** Wave C7 does not emit a live note stream.
  `BgmSequencer.tick()` explicitly returns zero at the track walk because note
  resolution and the `$40/$80/$C0` event families remain TODO. The 979-keyon
  test calls `fireKeyon()` directly with oracle-reconstructed parameters and
  force-loads cue 8. It proves the emission hook, not a live score-to-register
  path.
- **CORRECTION:** `postStreamingRejoiner()` has no caller, so the live 68k game
  does not currently post the streaming BGM start represented by the historical
  cmd `$12` door.
- **CORRECTION:** Wave C2's `ChannelManager` and its claimed `$0829` route are
  stale recon. W143 re-decoded `$0829` as an init/format routine and proved the
  live path is NMI `$07F6` to queue drain `$3BEA`, main loop `$0321`, dispatcher
  `$41D0`, populator `$3150`, and voice engine. `dispatch.js` still constructs
  and feeds the fictional manager.
- **CORRECTION:** DOJ's browser app imports no audio module, `loadBundle()` has
  no sound API, and the page has no production mute/audio UI. The manifest only
  names deferred sound artifacts.
- **CORRECTION:** the manufacturer Rev B datasheet fixes the clock, address and
  frequency field widths, supported sample classes, byte-wide ROM interface,
  and stereo signed DAC stream. It does not publish the OscConf, OscCtl, or VCtl
  bit layouts, the volume curve, the pan law, the envelope increment law, or
  the PGM board's single-ROM wiring. Those facts cannot be attributed to the
  datasheet.
- **CORRECTED RATE:** for active-oscillator value 31, the measured divider is
  `(31 + 1) * 32`, hence `33,868,800 / 1,024 = 33,075 Hz`. At the game's
  `15,625 / 264 Hz` refresh this is 558.8352 native samples per logic frame,
  requiring a fractional sample clock rather than a rounded constant.

The complete TODO inventory agrees with the call-site audit: `voice.js`
250/296/358-360/415-417/428-429, `sequencer.js`
68-69/193-195/219-222/249/257-259, and `dispatch.js` 247/323/328.

## 2. Static live-chain trace

### 2.1 Immediate SFX has a missing two-byte payload

The Z80 dump bounds the C6 data source but also confirms why the current
four-byte door cannot select it:

1. `[$62EA] = $7600` is the sample-descriptor base.
2. `[[$62E8]] = $0045`, so valid indices are bounded by 69 descriptors.
3. `$3150` masks the caller value with `$03FF`, multiplies it by 12, adds
   `[$62EA]`, and stores the descriptor pointer in the voice slot.
4. The 12-byte entries at `$7600` contain the sample bank and 29-bit start/end
   material. Their fields include the dominant sample signatures measured in
   W143.
5. NMI `$07F6` calls `$3BEA` with `DE = 6`, so the Z80 queue record copied from
   the banked mailbox is six bytes. The current `SoundState` retains only the
   four-byte `[type][pan][id][chan]` longword.

The two missing bytes are load-bearing. All 368 observed
`[type=$00,id=$0D,pan=$49,chan=$28]` rows share the same captured four bytes yet
are associated with 10 distinct SFX parameter signatures. The live 10-bit
descriptor index therefore cannot be reconstructed from `id` or any other
captured door column. The next recon must trace the 68k/BIOS producer of the
full six-byte record or another live state source that reproduces it. A
production resolver can then export the transformed `$7600` table and index it
without shipping `after_door -> params` history.

Cmd `$0F` is also separate. Its handler `$04DD` calls `$34FB`, not `$3245`.
`$34FB` scans already-active `$62EC` slots and matches/modifies or releases
them; it does not call the allocator. W144's label of it as a different
note-on variant is not supported by this disassembly. The 10 SFX keyons merely
associated with eight cmd `$0F` doors cannot be assigned causally until the
live timing and six-byte payload are reconstructed.

### 2.2 BGM needs the grammar and both parameter tables

The score asset contains locations and raw note streams, but the live work is
larger than JSON rehydration:

- `$25F2` walks eight 41-byte track structs at `$6184` and dispatches event
  bytes through the four-way top-two-bit switch at `$2BC6`.
- `$28D4`, `$2908`, `$293B`, and `$29E2` have distinct lengths and state
  effects. The current port implements none of their live stream-pointer
  advancement.
- `$14AB` resolves note parameters through the 22-byte table based at
  `[$62E6] = $6840`, then through the pitch table beginning at `$5203` with a
  `$78`-byte instrument stride. The exported score JSON contains neither
  transformed table.
- The current test bypasses all of this by calling `fireKeyon()` with params
  taken from `ics.tsv`.

This is one focused recon plus one implementation wave, not adapter glue.
The JSON also needs an explicit rehydrator because the browser does not have
`CueBlock` instances or decoded hex note arrays after fetch.

### 2.3 Keyoff and allocation must couple to the chip

`voice.js` estimates one-shot expiry once per game frame by subtracting `fc`
from `end24 - start24`. Wave E advances the 29-bit oscillator once per native
sample, so that approximation cannot remain the authority after a synth lands.
The chip must surface oscillator-end IRQ state to the driver, which then runs
the existing `$0A0C` keyoff path and frees the allocator slot.

There is also a load-bearing bit contradiction. `voice.js` treats OscConf bit 1
as loop. The stage-1 corpus uses `$20` for SFX and `$08/$00` for BGM. W143 calls
both stage-1 modes one-shot in one place while the BGM data and independent
sample-byte inspection imply different format/loop behavior. No implementation
should freeze this guess into its state machine.

### 2.4 Wave E facts and unresolved semantics

Primary evidence from the
[ICS2115 Rev B datasheet](https://dosdays.co.uk/media/ics/ICS2115_Datasheet.pdf):

- standard clock: 33.8688 MHz;
- OscFC: 6 integer and 9 fractional bits;
- OscAcc: 20 integer and 9 fractional bits;
- loop start/end: 20 integer and 4 fractional bits;
- sample classes: 16-bit linear, 8-bit linear, and 8-bit mu-law;
- byte-wide wavetable ROM bus;
- stereo 16-bit signed DAC stream, sign-extended on the serial output.

Independent inspection of shipped u17 windows shows that adjacent bytes form a
smooth signed waveform. Representative lag-1 correlations are 0.99, 0.95, and
0.96. This rejects treating ordinary consecutive PGM bytes as unrelated
little-endian sample pairs and supports board-specific byte replication or
sign extension for the observed modes. It does not by itself assign OscConf
bits `$20` and `$08`.

Still unresolved and required before a fidelity claim:

- the OscConf format and loop bits for `$20`, `$08`, `$00`, and rare `$A0`;
- the PGM byte-to-16-bit rule for each exercised mode;
- oscillator-end and loop IRQ behavior;
- volume register `$09`'s gain law across its 41 stage-1 values;
- exact center gain. Non-center pan may remain a loud stage-1 limitation because
  all 665 captured pan writes are `$7F`;
- interpolation, if any. A deterministic choice may be implemented and tested
  structurally, but it must not be presented as hardware-verified without a
  measurement.

The local `pgm-mister` tree was consulted only as a GPL cross-check. Its source
and tables are not copied. MAME PCM output is not used as truth.

## 3. Complete missing dependency graph

```text
R1 ICS/PGM bit-semantic measurement
  -> E1 deterministic ICS2115 core + sample-index reader + oscillator IRQ
       -> L3 driver/chip sample-clock and keyoff/allocator integration
            -> F1 browser asset fetch + AudioController adapter + mute/status UI

R2 live Z80 parameter recon
  -> L1 SFX descriptor resolver + cmd $0F
  -> L2 BGM event grammar + instrument/pitch resolver + score rehydration

L1 + L2 + L3
  -> G1 Game SoundState-to-SoundChain bridge + live cue-to-register gate

G1 + F1
  -> A1 arbitrary live Game cue-to-audible-samples integration gate
```

The branches can be researched independently, but browser audibility requires
all of them. The minimum complete chain is:

```text
Game soundPost
  -> SoundState ring
  -> drainFrame door
  -> live main-loop route
  -> descriptor or score-event parameters
  -> VoiceEngine register writes
  -> sample-clocked ICS2115 state and IRQ
  -> stereo 33,075 Hz samples
  -> shared AudioController
  -> browser output
```

Today the production chain stops at `drainFrame door`.

## 4. Exact next waves

The names below are dependency labels. Numeric filenames must be reserved from
a fresh directory enumeration under the repository numbering policy.

1. **R1, ICS/PGM semantics recon, 1 recon wave.** Resolve the exercised
   OscConf mode/loop bits, byte expansion, end/loop IRQ behavior, and volume
   law from the primary datasheet, patent material where primary, and
   independent board measurements. Deliver executable fixtures, not a copied
   GPL table. Center pan is the only stage-1 pan requirement.
2. **R2, live Z80 parameter recon, 1 recon wave.** Trace the full six-byte
   68k/BIOS-to-Z80 record and its 10-bit `$7600` descriptor index, decode
   `$34FB`, finish the four BGM event families, map the `$6840` 22-byte
   descriptors and `$5203` pitch table, and specify transformed exports plus
   JSON rehydration. Prove each mapping without `after_door`.
3. **L1, live SFX Layer 3 driver, 0.5 to 1 implementation wave after R2.**
   Retain the full six-byte record, export/load the `$7600` descriptors, remove
   the fictional `ChannelManager`, replace `SfxParamTable` in production, and
   implement the decoded cmd `$0F` behavior. Gate arbitrary live SFX records
   without oracle history lookup.
4. **L2, live BGM Layer 3 driver, 1 implementation wave after R2.** Export/load
   the `$6840` instrument and `$5203` pitch data, rehydrate the score JSON,
   implement the four event families and `$14AB` resolver, and connect the real
   streaming-BGM post site. Gate score bytes to register writes without oracle
   parameter injection.
5. **E1, deterministic ICS2115 core, 1 implementation wave after R1.** Consume
   ICS register writes and the fragment index, advance 29-bit oscillators at
   33,075 Hz, implement the measured stage-1 formats/volume/center pan, return
   stereo samples, honor `emit=false` by advancing while discarding output,
   and expose oscillator IRQ state. Gate deterministic hashes and structural
   properties. Keep human sounds-right as a separate manual result.
6. **G1, runtime integration, 0.5 to 1 implementation wave after L1, L2, and
   E1.**
   Construct the live sound runtime in `Game`, feed every drained door, run the
   fractional sound clock, route chip IRQ keyoffs back through the allocator,
   and define a compact byte log for shared `AudioOut.frame()`. Gate a real game
   wrapper through nonzero stereo samples with no oracle fixture.
7. **F1, browser Wave F adapter, 0.5 implementation wave after G1.** Fetch and
   validate the three deferred sound artifacts, preserve first paint, arm the
   `AudioContext` synchronously from a gesture, wire frame/pump/mute/status with
   the normal firewall, and update the currently accurate no-sound site copy.

The estimate is five implementation waves plus two recon waves when counted at
the conservative upper bounds. Combining R2 and L1, or G1 and F1, is reasonable
only if each combined wave retains a complete red-validated contract.

## 5. W149 decision

No source was implemented in this wave. An isolated synth would be deterministic
but would freeze unresolved bit semantics, while an isolated browser adapter
would receive no live register stream. Neither unit would satisfy the assigned
audible outcome. The useful result is the negative premise finding, the static
live-chain enumeration, and the dependency plan above.

No new automated check was added, so the mutation requirement is not
applicable to W149. The untracked `c1_*.py` oracle scripts remain untouched. No
publish exception is added, no asset export changed, and no deployment is
performed. The existing site statement that sound is not implemented remains
accurate and needs no edit.

## 6. Gates

- `node --test games/ddpdoj/tests/`: 1,351 passed, 0 failed, 0 skipped.
- `node tools/publish.mjs --only ddpdoj --dry`: PASS. Its embedded DOJ test run
  also reported 1,351 passed, 0 failed, 0 skipped. The bundle gate and web-fetch
  gate passed, the ROM-leak guard checked 275 files including 52 decompressed,
  retained exactly six deliberate exceptions, and built 279 files at 8,736 KB.
- Mutation evidence: not applicable. W149 adds no check or implementation.
