# 146 -- IMPL: sound wave C5 (the keyoff path)

status: DONE   role: implementer   wave: W27 sound, Wave C5 (TODO 3)   owns: games/ddpdoj/src/

Wave C5 of the W27 sound port (135-sound-architect-plan.md section 2). The single
deliverable: the KEYOFF PATH -- the `$0A0C` register-write emission that stops a
voice, the `$3F11` shadow-free that closes the allocator cycle, and the
oscillator-end IRQ trigger (`$0F` IRQV) that fires them. Gated against the
`ics.tsv` oracle (191,367 rows). Layer 2 (`src/voice.js`, W141) ships; this wave
adds the keyoff half of the emission contract plus its trigger.

# 0. PREMISE CHECK (the brief's own rule -- every cited address re-decoded)

Every address W143 TODO 3 cited was re-decoded out of `rip/sound/z80ram.bin` with
`tools/z80dis.py`, and every claim about the oracle was checked row-for-row
against `rip/sound/ics.tsv`. The premise is CORRECT in full; one refinement (the
double `$0D` sel) sharpens the row-for-row contract.

- **`$0A0C` IS THE KEYOFF EMISSION, A 15-ROW FIXED SEQUENCE.** Decoded
  instruction-by-instruction. `$0A0C(voice)` (voice passed in L):
    `$0A0E`: `LD H,$00` (HL = voice)
    `$0A10`: `CALL $02D2`           -> selectVoice: $4F/lo = voice
    `$0A13`: `LD HL,$000D; CALL $028E`  -> READ $0D (the VCtl). $028E selects $0D
                                         (one sel row) then IN $8002. The read's
                                         sel is logged; the IN is not.
    `$0A1E-$0A28`: `A &= $C3; if (A & $02) A |= $01`  -> mask VCtl, set bit0 when
                bit1 was set. Store to a stack local.
    `$0A2E`: `LD HL,$000D; CALL $02A4` -> WRITE $0D hi = masked VCtl. $02A4
                                         re-selects $0D (a SECOND sel row) then
                                         OUT $8003. Net: sel,sel,hi for $0D.
    `$0A34`: `$07/hi = $01`  (VolLo)
    `$0A3A`: `$08/hi = $01`  (VolHi)
    `$0A46`: `$10/hi = $0F`  (OscCtl = KEYOFF)
    `$0A4F`: `LD HL,$000D; CALL $028E`  -> re-READ $0D (another sel row), to test
                                         bit0 for the optional $00 write.
    `$0A61`: `$0D/hi = $03`  (VCtl re-arm)        [sel,sel,hi -- read-then-write]
    `$0A6A`: `$00/hi = $00`  (OscConf = 0)        [conditional on bit0, below]
  The full oracle sequence (verified 1720/1720, see section 1):
    `lo $4F=V, sel $0D, sel $0D, hi $0D=01, sel $07, hi $07=01, sel $08, hi $08=01,
     sel $10, hi $10=0F, sel $0D, sel $0D, hi $0D=03, sel $00, hi $00=00`
  (15 rows from `lo $4F` onward; the opening `sel $4F` is the previous episode's
  tail, same attribution rule as W141's emitKeyon.)

- **THE REFINEMENT: THE DOUBLE `$0D` sel.** W143 described the emission as
  "`$0D`/hi = VCtl & $C3 [| $01]" -- a single write. The oracle shows TWO sel
  rows before each `$0D` hi (sel,sel,hi), because `$0A0C` READS `$0D` (`$028E`,
  which selects it) before WRITING it (`$02A4`, which selects it again). Both
  `$0D` writes in the keyoff (the masked-VCtl write AND the $03 re-arm) carry
  this double-sel. The port reproduces it by emitting a `sel $0D` (a register
  select with no data) before each `$0D` write, mirroring the read primitive.

- **THE CONDITIONAL `$00=$00` IS ALWAYS TAKEN IN STAGE 1.** The `$0A5F JR Z`
  skips the `$0D=$03`/`$00=$00` tail when the re-read `$0D` has bit0 clear. In
  the corpus the masked VCtl is `$01` (bit0 set) for ALL 1720 keyoffs, so the
  skip is never taken and the `$00=$00` ALWAYS fires. The port implements the
  faithful condition (computes masked VCtl, gates `$00=$00` on bit0) so a future
  stage where VCtl differs is handled; the oracle-present tests assert the
  always-taken stage-1 behaviour.

- **`$3F11` IS THE SHADOW FREE.** Decoded: `HL = voice*10 + $654E; (HL) = 0`. It
  zeroes `shadow[voice][0]`, the byte the `$3E8F` allocator tests for "free".
  This closes the allocator cycle (`$3E8F` alloc ... `$3F11` free). Verified the
  math: `$3F14: LD DE,$000A; CALL $4243` (mul16) -> `voice * 10`; `$3F1D: ADD
  HL,DE` (HL = $654E + voice*10); `$3F1F: XOR A; LD (HL),A`.

- **`$3F22` IS THE COMPOSITE "RELEASE IF BUSY".** Decoded: if
  `shadow[voice][0] != 0` then `CALL $0A0C(voice)` then zero the shadow (the
  `$3F11` inlined). This is the path the boot release-all and the sequencer's
  explicit note-off use (the vf=5 release-all of all 32 voices, the 95 orphan
  keyoffs W143 named). Ported as `releaseVoiceIfBusy(v)`.

- **THE OSCILLATOR-END IRQ TRIGGER IS THE `$0F` IRQV READ.** Decoded end-to-end:
  INT `$0038` -> `$010B` reads status `$8000`; **bit1** -> `$0FEA` (the
  oscillator-end/IRQV path); **bit0** -> `$0FC8` (the timer-0 tick: `$25F2`
  sequencer + `$376C` engine). `$0FEA` does timer bookkeeping then falls into
  `$1000`: `LD HL,$000F; CALL $028E` (READ `$0F` IRQV); `A &= $1F` -> the voice
  that ended; if the high bits are not both set, `CALL $0A0C(voice)` then `CALL
  `$3F11(voice)` (at `$1099`/`$10A2`); loop (`JP $1000`) while more voices are
  pending. So the CHIP tells the Z80 WHEN a voice ended (the oscillator reaches
  oscEnd); the Z80 reads `$0F` for WHICH voice and dispatches the keyoff. This
  is trigger (i).

- **TRIGGER (ii) -- THE BGM NOTE-DURATION -- IS C7's `$25F2`, DEFERRED.** The
  brief allows deferring it with a named TODO. The BGM keyoff (`$25F2` calls
  `$0A0C` at `$2679` when a note's duration expires) is the C7 sequencer's
  territory (W145 recon). This wave ports trigger (i) + the emission + the free;
  trigger (ii) lands with C7. Named TODO in `src/voice.js`.

NET: the premise holds. The keyoff path is `$0FEA`/`$1000` (trigger) -> `$0A0C`
(emission) -> `$3F11` (free), reusing Layer 2's `IcsRegisterFile` write sink.
The one refinement (double `$0D` sel) is reproduced faithfully.

# 1. THE DATA SHAPE (sizing the keyoff episodes against the oracle)

Run directly against `rip/sound/ics.tsv` (1720 keyoffs = `$10` hi = `$0F`):

- **THE EMISSION IS INVARIANT (1720/1720).** Every keyoff episode is the same
  15-row sequence (above). The masked VCtl is `$01` for ALL 1720. The `$00=$00`
  write is present in ALL 1720. Zero variation in the core `$0A0C` writes.
- **THE SEQUENCE-LENGTH VARIATION IS POST-EMISSION IRQ BOOKKEEPING, NOT
  KEYOFF.** The 13 distinct "signatures" differ ONLY in what follows the
  `$00=$00` write: the `$0FEA`/`$1000` path's timer-register read-poll writes
  (`$0F sel`, `$43 sel`, `$41 sel`, `$40 sel/$40 lo`). Those belong to the timer-
  IRQ/timer-status layer (Layer 1's `$43` reads), not to `$0A0C`. The port's
  `serviceOscillatorIrq` models the `$0F` read that opens that bookkeeping; the
  downstream `$43`/`$40` poll reads are a later wave's register-file concern.
- **THE MASKED VCtl SOURCE.** For every keyoff, the most-recent `$0D` write to
  the same voice before the episode is `$01` (the "arm" state the engine leaves
  during sustain). The port computes `masked = (shadow$0D & $C3); if (masked &
  $02) masked |= $01`, reading the current VCtl from the Layer 1 shadow. With
  the stage-1 value `$01` this yields `$01` (bit1 clear, no OR), matching the
  oracle. The test seeds the shadow with the oracle's pre-keyoff `$0D`.
- **TWO TRIGGERS, PROVEN BY THE FRAME DELTAS.** keyon->keyoff frame-delta
  distribution (first 600 keyons with a later keyoff): peaks at 6 (144) and 7
  (190) -- the BGM notes (constant delta across varying fc, W143 trigger (ii));
  plus a spread 0-27 -- the SFX one-shot playthroughs (oscillator-end, trigger
  (i)). The two-trigger model is real. This wave owns trigger (i).

# 2. THE PORT (src/voice.js -- additions to the Layer 2 engine)

Additions to the existing `VoiceEngine` and `VoiceSlot`, faithful to the
disassembly. Nothing existing is changed (dispatch.js's API is preserved).

New `ENGINE` constants (the keyoff path addresses, decoded above):
  `emitKeyoff:   0x0A0C`, `freeShadow: 0x3F11`, `releaseIfBusy: 0x3F22`,
  `irqEntry:    0x0FEA` (the oscillator-end IRQ path entry),
  `irqvRead:    0x1000` (the `$0F` IRQV read + dispatch loop),
  `irqvReg:     0x000F` (the IRQV register number),
  `oscIrqBit:   0x02` (status `$8000` bit1 -> oscillator-end IRQ).

New `VoiceSlot` state for the oscillator-end trigger:
  `oscCountdown` -- samples remaining for a one-shot voice (set at keyon from
  the oscEnd/oscStrt span); decremented per tick; when it reaches zero the
  oscillator has ended and the voice is queued for keyoff.
  `loopMode` -- true when the voice loops (OscConf loop-bit set); looped voices
  do not raise oscillator-end (they wrap, not end). Stage-1 SFX (OscConf `$20`)
  are one-shot.

New methods:
  `emitKeyoff(slot)` -- the `$0A0C` emission. Reads the current VCtl from the
    Layer 1 shadow (`rf.voices[v].u8(0x0D)`), computes the masked value, emits
    the 15-row sequence (selectVoice, read+write `$0D`, `$07`, `$08`, `$10=$0F`,
    read+write `$0D=$03`, `$00=$00`). Sets the slot state to 0 (idle).
  `releaseIcsVoice(v)` -- the `$3F11` free. `icsShadow[v][0] = 0`.
  `releaseVoiceIfBusy(v)` -- the `$3F22` composite. If `icsShadow[v][0] != 0`,
    `emitKeyoff` + `releaseIcsVoice`. (The boot release-all path.)
  `serviceOscillatorIrq()` -- the `$0FEA`/`$1000` trigger. For each voice whose
    `oscCountdown` has reached zero (and not loopMode), in voice-index order,
    call `emitKeyoff` + `releaseIcsVoice`. This is the oscillator-end IRQ
    (trigger (i)). Returns the count of voices released.
  `advanceOscillators()` -- decrement each active one-shot voice's
    `oscCountdown` by its fc (the per-tick phase advance). Frame-granularity
    approximation (W143 blesses this for Wave C's register-stream gate; the
    exact 29-bit oscAcc / 15-bit fc bit layout is Wave E).

The BGM note-duration trigger (ii) is DEFERRED with a named TODO: it lives in
`$25F2` (the C7 sequencer, W145), which calls `$0A0C` at `$2679` when a note's
duration field expires. Once C7 ports `$25F2`, the keyoff emission this wave
ships is reused verbatim (same `$0A0C`).

# 3. THE MUST-FAIL (oracle emission contract + trigger, red -> green)

`tests/voice.test.js` (add tests to the existing file). Five colours tied to the
oracle and the trigger mechanism:

- **GREEN/RED/RESTORE (keyoff episode row-for-row).** `emitKeyoff`, seeded with
  voice 1's first keyoff (vf=5, the release-all) and the oracle's pre-keyoff
  `$0D=$01`, reproduces that keyoff's 15-row oracle sequence ROW-FOR-ROW.
  Corrupt the masked VCtl -> the `$0D` hi write diverges (RED). Restore re-greens.
- **GREEN (per-keyoff invariant).** ALL 1720 keyoffs in `ics.tsv` are the fixed
  15-row sequence: every `$10=$0F` is preceded (in-episode) by `$0D=$01` and
  followed by `$0D=$03` then `$00=$00`. Zero violations.
- **GREEN/RED/RESTORE (oscillator-end trigger).** Seed a one-shot SFX voice
  (oscEnd > oscStrt); `advanceOscillators` + `serviceOscillatorIrq` fires
  `emitKeyoff` + `releaseIcsVoice` for it (the keyoff writes appear, the shadow
  slot is freed). Break the trigger (mark the voice looped, so it never ends) ->
  no keyoff writes, shadow stays marked (RED). Restore -> green.
- **GREEN (`$3F11` free closes the allocator cycle).** After `releaseIcsVoice`,
  `acquireIcsVoice` reuses the freed slot (round-robin lands on it).
- **GREEN (structure).** `$0A0C`/`$3F11`/`$3F22`/`$0FEA`/`$1000` decode to the
  cited code; the `$654E` shadow math (voice*10) is self-consistent.

Skips loudly when `rip/sound/ics.tsv` is absent (gitignored ROM-derived data).

# 4. GATES

- `node --test games/ddpdoj/tests/` -- **1344 pass / 0 fail / 0 skipped**.
  (Was 1339; +5 from the new keyoff tests. The oracle-present run skips
  nothing; the oracle-touching tests would skip loudly if rip/sound/ics.tsv were
  absent.)
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged.
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated (rom-leak
  guard clean, 6 deliberate exceptions; 276 files, 8705 KB). No new ROM windows
  (the keyoff path is pure JS; the disassembler reads z80ram.bin, which is
  gitignored ROM-derived data and is never shipped), so no export-web.mjs regen
  was required.

# 5. THE MUST-FAIL RESULT

`tests/voice.test.js` (now 10 tests, 0 skipped). The five new keyoff tests, all
green; the two oracle-tied tests and the trigger test carry the RED -> RESTORE
cycle:

- **GREEN (structure).** The keyoff path addresses (`$0A0C`/`$3F11`/`$3F22`/
  `$0FEA`/`$1000`), the `$0F` IRQV register, the status bits, and the `$654E`
  shadow math (voice*10) are self-consistent.
- **GREEN (per-keyoff invariant).** All 1720 keyoffs in ics.tsv match the fixed
  15-row `$0A0C` sequence (voice-wildcarded). Zero violations.
- **GREEN/RED/RESTORE (keyoff episode).** `emitKeyoff`, seeded with voice 1's
  first keyoff (vf=5) and the oracle's pre-keyoff `$0D=$01`, reproduces that
  keyoff's 15-row episode ROW-FOR-ROW. Corrupting the pre-keyoff VCtl to `$03`
  diverges the emitted `$0D` hi write (masked `$03` vs oracle `$01`); restoring
  re-greens.
- **GREEN/RED/RESTORE (oscillator-end trigger).** A one-shot voice (oscCountdown
  set) ends after one `advanceOscillators`; `serviceOscillatorIrq` fires the
  keyoff writes + frees the shadow. Marking the voice looped (the trigger never
  fires) -> no keyoff writes, shadow stays bound; restoring (one-shot) re-greens.
  External must-fail check: breaking `serviceOscillatorIrq` to ignore `oscEnded`
  turns the test RED; restoring re-greens (10/10).
- **GREEN (`$3F11` closes the allocator cycle).** `releaseIcsVoice` zeroes the
  shadow byte; a subsequent `acquireIcsVoice` reuses the freed slot.
  `releaseVoiceIfBusy` (`$3F22`) keyoffs+frees a bound voice and is a no-op on an
  already-free one.

# 6. FILES
- `games/ddpdoj/src/voice.js` (edited) -- the keyoff emission + free + trigger.
- `games/ddpdoj/tests/voice.test.js` (edited) -- the keyoff MUST-FAIL.
- `docs/worklog/ddpdoj/146-impl-sound-c5-keyoff.md` (this file).
