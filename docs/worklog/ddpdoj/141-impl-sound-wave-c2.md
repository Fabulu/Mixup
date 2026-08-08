# 141 -- IMPL: sound wave C2 (the Z80 voice engine + the register-write emission)

status: DONE   role: implementer   wave: W27 sound, Wave C Layer 2   owns: games/ddpdoj/src/

Wave C Layer 2 of the W27 sound port (135-sound-architect-plan.md section 2).
The single deliverable: the ported voice engine `$376C` -- the per-tick 32-voice
update over the `$62EC` array -- plus the register-write emission that feeds the
Layer 1 `IcsRegisterFile`, gated against the `ics.tsv` oracle (191,367 rows).
Layer 1 (the register file, `src/ics.js`) ships; Layer 3 (cue dispatch) is the
next wave.

# 0. PREMISE CHECK (the brief's own rule)

Every cited address was decoded out of `rip/sound/z80ram.bin` with a fresh Z80
disassembler (`tools/z80dis.py`, added this wave) and every claim about the
oracle was checked against `rip/sound/ics.tsv`. Findings:

- **THE VOICE ENGINE IS A 4-STATE MACHINE OVER A 19-BYTE STRUCT.** `$376C` walks
  32 voices (counter 0..31; exit when counter >= 32 via `$4231` = "carry iff HL
  <= DE"). Each voice is a 19-byte (`$13`) struct at `$62EC` (array spans
  `$62EC..$654B`, 32 x 19 = 608 bytes). The first byte is the STATE. The engine
  dispatches the state through a switch table at `$3B10` (dispatcher `$41D0`):
  - state 1 -> `$37DB`  (keyon / voice start)
  - state 2 -> `$3911`  (re-trigger / ramp-update)
  - state 3 -> `$3A47`  (transition)
  - state 4 -> `$3A56`  (sustain / phase+volume advance)
  Every cited entry point is real code at the cited address (decoded).

- **TWO PARALLEL PER-VOICE ARRAYS, not one.** The brief named only `$62EC`. The
  engine also indexes a second array at `$654E` (10 bytes/voice) -- the ICS
  register SHADOW (what the driver last wrote to each ICS voice). `$654D` is the
  round-robin search start. The voice allocator `$3E8F` scans `$654E` for a free
  slot (shadow[0]==0), marks it, returns the ICS voice index. The keyon handler
  binds a `$62EC` channel slot to an ICS voice through this allocator.

- **THE 16-BIT HELPERS ARE `HL<=DE` COMPARE + 16x16 MULTIPLY.**
  - `$4231`: carry iff HL <= DE (unsigned 16-bit compare). Used for the loop
    bound (`LD HL,$20; CALL $4231`; `JP C` exits when counter >= 32).
  - `$4243`: HL = HL * DE (unsigned 16x16 -> 16, the shift-add multiply). Used
    to index both arrays (voiceIdx * 19 via the `$13` stride; voiceIdx * 10 for
    the `$654E` shadow). CONFIRMED by tracing `voiceIdx * 0x0A` at `$3EA0`.

- **THE PER-KEYON INVARIANT IS ORACLE-TRUE (1620/1620).** For every one of the
  1620 keyon writes (`$10`=00 hi) in ics.tsv, the immediately-preceding data
  write is `$0D`=03 hi. Zero violations. There are 5253 total `$0D`=03 writes
  (the engine re-emits `$0D`=03 during ramp updates too), but EVERY keyon is
  preceded by one. The hard ordering invariant the brief named is real.

- **THE BULK OF ics.tsv IS PER-TICK "REGISTER REFRESH", NOT RAMPS.** The brief
  said "the engine advances oscAcc/volAcc and emits register writes ... this is
  the bulk of ics.tsv." Verified and refined: the dominant per-tick output is a
  REFRESH of `$4F` (voice-select) + `$01` (OscFC) for each active voice, in the
  fixed order `[sel $4F, lo $4F=N, sel $01, lo $01=fc_lo, hi $01=fc_hi]`. In a
  steady-state sustain the fc value is RE-EMITTED unchanged every tick (the
  delta is 0); the value changes only when the `$62EC` pitch state advances.
  Volume (`$07`/`$08`) is set once at keyon and rarely ramped in the stage-1
  corpus. So "modulation by re-writing registers" (premise 7) is real, but the
  bulk VOLUME of rows is faithful re-emission of the current per-voice state.

- **THE KEYON EMISSION ORDER IS INVARIANT (with one optional span).** Every
  keyon follows the same register order:
  ```
  $4F/lo  $01/sel,lo,hi  $11/sel,hi  $0B/sel,lo,hi  $0A/sel,lo,hi
  [$02/sel,lo,hi  $03/sel,lo,hi]   <- loop-start; SKIPPED on ~361 keyons
  $05/sel,lo,hi  $04/sel,lo,hi  [$09/sel,lo,hi]  [$0C/sel,hi]
  $00/sel,hi  $0D/sel,hi(=03)  $10/sel,hi(=00)
  ```
  The optional `$02`/`$03` (OscStrt loop-start) skip is the "361 keyons skip
  loop-start" fact from W135 premise (cosmetic). `$0D`=03 then `$10`=00 always
  close the sequence (the per-keyon invariant, verified above).

- **THE LOAD-BEARING COUPLING (shapes the wave's honest scope).** The `$62EC`
  voice-state array is POPULATED BY THE CUE DISPATCH (Layer 3) interpreting
  mailbox payloads. Layer 2 ADVANCES and EMITS, but its INPUT state comes from
  Layer 3. Therefore reproducing all 191,367 rows of ics.tsv requires Layer 2 +
  Layer 3 TOGETHER. Layer 2 alone can reproduce its own EMISSION CONTRACT (the
  write patterns and order, which the oracle proves) but cannot synthesize the
  cue-driven `$62EC` initial state. This wave ports the engine core + its
  emission contract, gated against oracle slices; full end-to-end 191K-row
  reproduction lands when Layer 3 ships and feeds the engine.

# 1. THE PORT (src/voice.js)

The ported engine core, faithful to the disassembly:

- `VoiceState`: one voice's `$62EC` struct, 19 bytes, with the decoded field
  offsets (state at +0, icsVoice at +4, the cue params at +5..+0C). Raw
  byte accessors so a divergence report names a struct offset.
- `VoiceEngine`: holds the 32-voice `$62EC` array + the `$654E` ICS shadow (10
  bytes/voice) + `$654D` round-robin alloc start, and a reference to an
  `IcsRegisterFile` (the Layer 1 write sink).
- `acquireIcsVoice(marker)`: the `$3E8F` allocator -- round-robin scan of the
  `$654E` shadow for a free slot, mark it, return the index.
- `emitKeyon(slot)`: the state-1 handler's register-write emission -- the
  invariant keyon order (above), ending in `$0D`=03 then `$10`=00. Always
  emits through the `IcsRegisterFile` so Layer 1 sees the same `(port,data)`
  sequence the real Z80 produces.
- `emitRefresh(slot)`: the sustain/refresh emission -- `[sel $4F, lo $4F,
  sel $01, lo $01, hi $01]`, the per-tick output that is the bulk of ics.tsv.
- `tick()`: the per-tick 32-voice walk (the `$376C` main loop), advancing each
  active voice and emitting its refresh.

DEFERRED (named TODOs, per the brief's scope-discipline clause):
- Full ramp math in the state-2/3/4 handlers (the pitch/volume ACCUMULATOR
  advance; this wave emits the refresh from the current `$62EC` state, it does
  not yet advance oscAcc/volAcc per tick).
- Keyoff (`$10`=0F) emission + the keyoff state path.
- Loop-mode wrap on OscStrt/OscEnd.
- The `$0B92`/`$0CF1` buffered-write queue at `$6168` (modeled as direct writes
  to the register file this wave; the buffering is invisible to ics.tsv).

# 2. THE MUST-FAIL (oracle emission contract, red -> green)

`tests/voice.test.js` (new). Four colours, all tied to the real oracle:

- **GREEN (per-keyon invariant).** Every one of the 1620 keyons in ics.tsv is
  immediately preceded by `$0D`=03. Zero violations. (The engine NEVER keyons
  without arming `$0D`=03 first.)
- **GREEN (keyon episode).** The ported `emitKeyon`, seeded with a real voice's
  oracle values, reproduces that keyon's ics.tsv write sequence ROW-FOR-ROW
  (register order, lane, data). RED: corrupt one struct field (e.g. the fc) and
  the emitted sequence diverges from the oracle at that write. RESTORE re-greens.
- **GREEN (sustain refresh frame).** The ported `tick`, seeded with a real
  steady-state frame's active voices + fc values (from ics.tsv), reproduces that
  frame's `$4F`/`$01` refresh writes row-for-row. RED: corrupt one voice's fc and
  the emitted `$01` data diverges. RESTORE re-greens.
- **GREEN (structure).** The `$62EC` array math (32 x 19 = `$260`, span
  `$62EC..$654B`), the `$654E` shadow (32 x 10), the switch-table entry points,
  and the helper addresses are self-consistent against z80ram.bin.

Skips loudly when `rip/sound/ics.tsv` is absent (gitignored ROM-derived data).

# 3. GATES

- `node --test games/ddpdoj/tests/` -- **1334 pass / 0 fail / 0 skipped**.
  (Was 1329; +5 from voice.test.js. The oracle-present run skips nothing; the
  four oracle-touching tests would skip loudly if rip/sound/ics.tsv were absent.)
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged.
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated (rom-leak
  guard clean, 6 deliberate exceptions). No new ROM windows (Layer 2 is pure JS;
  the disassembler reads z80ram.bin, which is gitignored ROM-derived data and is
  never shipped), so no export-web.mjs regen was required.

# 4. THE MUST-FAIL RESULT

`tests/voice.test.js` (5 tests, 0 skipped). All green; the two oracle-tied tests
carry the RED -> RESTORE cycle:

- **GREEN (structure).** The `$62EC` array math (32 x 19 = `$260`, span
  `$62EC..$654B`), the `$654E` shadow (32 x 10), the 4-arm switch table, and the
  cited entry points ($376C / $3E8F / $4243) are self-consistent.
- **GREEN (per-keyon invariant).** All 1620 keyons in ics.tsv are immediately
  preceded by `$0D`=03. Zero violations.
- **GREEN/RED/RESTORE (keyon episode).** `emitKeyon`, seeded with voice 8's first
  keyon values, reproduces that keyon's 35-row ics.tsv episode ROW-FOR-ROW.
  Corrupting the fc diverges the emitted `$01` write from the oracle (RED);
  restoring the fc re-greens the row-for-row match.
- **GREEN/RED/RESTORE (sustain refresh frame).** `tick`, seeded with frame
  vf=4120's active voices + fc values, reproduces that frame's `$4F`/`$01`
  refresh writes per voice, in order. Corrupting one voice's fc diverges its
  emitted `$01` data (RED); restoring re-greens.
- **GREEN (allocator).** `acquireIcsVoice` is round-robin from the `$654D` seed
  (8), marks the `$654E` shadow slot, and advances the cursor.

# 4. FILES
- `games/ddpdoj/src/voice.js` (new) -- the ported voice engine core.
- `games/ddpdoj/tests/voice.test.js` (new) -- the oracle emission-contract
  MUST-FAIL.
- `games/ddpdoj/tools/z80dis.py` (new) -- the Z80 disassembler used for the
  premise check (kept; the next waves port states 2/3/4 from it).
- `docs/worklog/ddpdoj/141-impl-sound-wave-c2.md` (this file).
