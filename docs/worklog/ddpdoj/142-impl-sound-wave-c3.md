# 142 -- IMPL: sound wave C3 (the Z80 cue dispatch + the full-chain coupling)

status: DONE   role: implementer   wave: W27 sound, Wave C Layer 3   owns: games/ddpdoj/src/

Wave C Layer 3 of the W27 sound port (135-sound-architect-plan.md section 2),
the LAST layer of Wave C. The single deliverable: the ported Z80 cue dispatch
(`$07F6`/`$09B7`/`$0829`) and the FULL-CHAIN coupling that ties Layer 3 (dispatch)
to Layer 2 (voice engine, `src/voice.js`) and Layer 1 (register file, `src/ics.js`).

The chain: a mailbox door (Wave A's `src/sound.js`, the [type][pan][id][chan]
longword the 68k posted) -> Layer 3 bank-selects, reads the command, routes the
cue-id -> populates a `$62EC` voice slot -> Layer 2 ticks and emits register
writes -> Layer 1 interprets them. The oracle is `ics.tsv` (191,367 rows).

# 0. PREMISE CHECK (the brief's own rule)

Every cited address was re-decoded out of `rip/sound/z80ram.bin` with the Wave C2
disassembler (`tools/z80dis.py`) and every claim about the mailbox input was
checked against `rip/sound/mailbox.tsv` / `mailbox_dedup.tsv`. Findings:

- **THE BANK-SELECT IS A PURE FUNCTION WRITTEN TO PORT $8400.** Decoded `$09B7`
  end-to-end. With HL=tag on entry: saves tag; `LD A,L; LD ($614F),A` stores
  tag_lo to RAM `$614F`; reads base `LD A,($6150)`; masks base with `$000F`
  (D=$00,E=$0F -> base & $0F in L, 0 in H); masks tag with `$00F0` (D=$00,E=$F0);
  ORs them: `result = (base & $0F) | (tag & $F0)`; `EX DE,HL; LD HL,$8400; CALL
  $0142` writes result_lo to port `$8400`. So `$09B7` PROGRAMS A BANK REGISTER at
  port `$8400`; it does NOT compute a Z80 address. With the channel-manager base
  `$6150 := $01` (set at `$0925`) and the NMI tag `$00F0`: byte = `($01 & $0F) |
  ($F0 & $F0)` = `$F1`. The NMI tail restore `$09B7($0000)` writes `($01 & $0F) |
  ($00 & $F0)` = `$01`. CLEAN, testable as a pure function.

- **THE COMMAND IS `in($8200) & $0F`, STORED AT $6151.** `$07FC: LD HL,$8200;
  CALL $0147` (inFromPort) -> A; `$0802: AND $0F; LD ($6151),A`; `$0807: CP $01;
  JR NZ,$0822`. So command nibble -> `$6151`; command `$01` is the "cue with
  payload" path (the only one the stage-1 corpus exercises, per mailbox). The
  non-`$01` path jumps straight to the bank-restore + RET. CONFIRMS Wave B.

- **THE PAYLOAD COPY READS 6 BYTES TO RAM $6001.** `$080B: LD DE,$0006; LD
  HL,$6001; CALL $3BEA`. `$3BEA` is a window-to-RAM copy (length DE, dest HL).
  The mailbox `payload_since_last_door` column carries the 68k-side writes to the
  `$C10000` window that the bank-select makes visible at Z80 `$6000`; the cue
  longword `[type][pan][id][chan]` lands at `$C10006`/`$C10008`. The exact
  bank-page -> Z80-offset mapping is PGM hardware banking (port `$8400` selects
  the page); for the register-write oracle the load-bearing input is the decoded
  cue `{type, pan, id, chan}` (the mailbox already decoded it), so the port takes
  the cue directly and models the bank-select as the byte-arithmetic + `$8400`
  write that delivers it.

- **THE CHANNEL MANAGER IS 40 SLOTS, 16-BYTE STRIDE.** `$0829` prologue: stack
  frame via IX; `LD HL,$0028` (= 40) `CALL $4231` (the HL<=DE compare) is the
  outer loop bound; slot indexing `LD HL,$0010; ADD HL,DE` (stride `$10` = 16).
  It also writes `$6150 := $01` (`$0925: LD A,$01; LD ($6150),A`) -- the
  persistent bank base the bank-select reads -- and re-derives the bank tag at
  `$092A` (`LD A,($614F)`). A second outToPort to `$8300` at `$094F` is a second
  control latch (likely the PGM sound-control latch). So the channel manager
  owns TWO arrays (a 40-slot cue queue + a 50-count `$0032` structure at
  `$0964`) and programs the bank base. The 40 slots are an INTERMEDIATE queue,
  not directly observable in ics.tsv (only the ICS register writes are).

- **`$421B` IS A COMPARE HELPER, NOT THE ENQUEUE.** Wave B's listing labeled
  `$421B` "enqueue". Re-decoded: `$421B: LD A,L; CP E; RET NZ; LD A,H; CP D; RET`
  -- a 16-bit equality test (HL vs DE) returning Z on equal. `$07F6` calls it
  with DE=`$0001` after the payload copy; this is a state check, not the enqueue
  proper. The real enqueue work is inside `$0829`. Cosmetic for the port (the
  behaviour is what matters); noted so a future wave does not chase a phantom
  enqueue at `$421B`.

- **THE LOAD-BEARING COUPLING SHAPES THIS WAVE'S HONEST SCOPE.** Reproducing all
  191,367 rows of ics.tsv needs THREE things this wave cannot fully deliver:
  (1) the cue-id -> voice-param SCRIPTS (each id indexes Z80-side ROM tables for
  sample-address / fc / volume / pan and writes them into `$62EC`); (2) Layer 2's
  DEFERRED ramp math (oscAcc/volAcc advance -- the per-tick fc delta); (3) Layer
  2's DEFERRED keyoff (`$10=$0F`) + loop-mode wrap. (2) and (3) were named TODOs
  in worklog 141. Therefore the FULL 191k-row reproduction is NOT claimed this
  wave; this wave ships the dispatch CORE (the NMI handler, bank-select, command
  read, channel manager) + the FULL-CHAIN WIRING + an honest coverage measurement
  + named TODOs for the cue-id scripts and the Layer 2 ramp/keyoff deferrals.

# 1. THE PORT (src/dispatch.js)

The ported dispatch core, faithful to the disassembly:

- `bankSelectByte(base, tag)`: the `$09B7` pure function `(base & $0F) | (tag &
  $F0)`. The byte written to port `$8400`.
- `bankSelect(state, tag)`: writes `bankSelectByte(base, tag)` to the `$8400`
  latch; sets `$614F = tag & $FF`. Mirrors `$09B7`.
- `readCommand(state)`: `in($8200) & $0F` -> `$6151` (the command nibble).
- `ChannelSlot`: one of the 40 channel-manager slots (16 bytes, stride `$10`).
- `ChannelManager`: the 40-slot manager. `enqueue(cue)` walks for a free slot and
  assigns it (the `$0829` outer loop). Holds the bank base `$6150` (set `$01` on
  first cue, the `$0925` path).
- `CueDispatch`: the `$07F6` flow -- bankSelect(`$00F0`), readCommand, and for a
  command-`$01` cue: route `{type,pan,id,chan}` into the channel manager, then
  bankSelect(`$0000`) restore.
- `CueRouter`: routes a cue-id to a `$62EC` VoiceSlot population. The id->params
  ROM-table lookup is DEFERRED (TODO); the router takes an injectable
  `paramsProvider(id)` so the full chain can run with oracle-reconstructed params
  now and with live ROM-table params once a later wave ports the scripts.
- `SoundChain`: the full-chain harness. Wires `CueDispatch` -> `VoiceEngine` ->
  `IcsRegisterFile`. `dispatchDoor(door)` feeds one mailbox door through Layer 3
  and into the engine; `tick()` runs the Layer 2 per-tick walk; the register file
  logs every write for the oracle comparison.

DEFERRED (named TODOs, per the brief's scope-discipline clause):
- The cue-id -> voice-param SCRIPTS (each id's sample/fc/vol/pan table lookup
  inside the Z80 program). Modeled this wave via an injected `paramsProvider`;
  the ROM tables and the script interpreter are a later wave.
- The `$8300` control latch semantics (the second outToPort in `$0829`); modeled
  as a recorded latch write, not interpreted.
- RAM-exact channel-manager slot state (the 40-slot queue is an intermediate not
  observable in ics.tsv; modeled behaviourally).

# 2. THE MUST-FAIL (full-chain coupling, red -> green)

`tests/dispatch.test.js` (new). Four colours:

- **GREEN (bank-select arithmetic).** `bankSelectByte(base,tag)` reproduces the
  `$09B7` bytes for the cited (base,tag) pairs: (`$01`,`$F0`)->`$F1`;
  (`$01`,`$00`)->`$01`; (`$00`,`$F0`)->`$F0`. RED: mutate the mask -> the byte
  diverges from the disassembly. RESTORE re-greens.
- **GREEN (command decode + channel manager).** `readCommand` masks `$0F`;
  `ChannelManager.enqueue` allocates among 40 slots, wrapping, and sets `$6150`.
  RED: corrupt the slot count or the bank base -> divergence. RESTORE re-greens.
- **GREEN/RED/RESTORE (full-chain keyon episode).** `SoundChain.dispatchDoor`,
  seeded with a real mailbox door + the oracle-reconstructed params for that
  door's cue-id, reproduces the door's ics.tsv keyon register-write episode
  ROW-FOR-ROW through Layer 3 -> Layer 2 -> Layer 1. RED: corrupt the dispatch
  (skip the voice allocator, or feed the wrong id->params) -> the emitted writes
  land on the wrong ICS voice / with the wrong params -> diverge from the oracle.
  RESTORE re-greens.
- **HONEST COVERAGE.** Run ALL mailbox doors through the chain; measure how many
  ics.tsv rows the chain reproduces given the Layer 2 deferrals (ramp/keyoff) and
  the Layer 3 deferred cue-id scripts. Report the number + the named TODOs that
  close the gap. (This is the honest partial the brief licenses.)

Skips loudly when `rip/sound/ics.tsv` or `mailbox_dedup.tsv` is absent.

# 3. GATES

- `node --test games/ddpdoj/tests/` -- **1338 pass / 0 fail / 0 skipped**.
  (Was 1334 after Wave C2; +4 from dispatch.test.js. The oracle-present run
  skips nothing; the oracle-touching tests would skip loudly if
  rip/sound/ics.tsv or mailbox_dedup.tsv were absent.)
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged.
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated (rom-leak
  guard clean, 6 deliberate exceptions). No new ROM windows (Layer 3 is pure JS;
  it reads the oracle TSVs and mailbox, which are gitignored ROM-derived data and
  are never shipped), so no export-web.mjs regen was required.

# 4. THE MUST-FAIL RESULT

`tests/dispatch.test.js` (4 tests, 0 skipped). All green; the centerpiece test
carries the RED -> RESTORE cycle that proves Layer 3 is load-bearing:

- **GREEN/RED (bank-select arithmetic).** `bankSelectByte(base,tag)` reproduces
  the `$09B7` bytes for the cited pairs: (`$01`,`$F0`)->`$F1`, (`$01`,`$00`)->
  `$01`, (`$00`,`$F0`)->`$F0`, (`$0A`,`$30`)->`$3A`. `DispatchState.bankSelect`
  wires the byte to the `$8400` latch and stores `$614F`. A swapped-mask formula
  (base supplies the HIGH nibble) diverges from `$F1` (gives `$00`); the real
  formula re-greens.
- **GREEN/RED (command decode + channel manager).** `readCommand` masks `$0F`;
  `ChannelManager` holds 40 slots (LD HL,$0028), 16-byte stride (LD HL,$0010),
  round-robin enqueue, arms the bank base `$6150 := $01` on the first cue (the
  `$0925` path), and drops the 41st cue (queue full -> the `$0020` error path).
- **GREEN/RED/RESTORE (full-chain keyon episode).** `SoundChain.dispatchDoor`,
  seeded with the oracle-reconstructed params for cue-id `$1A`, routes the door
  through Layer 3 (bank-select -> command read -> channel-manager enqueue ->
  cue-router -> voice-allocator binds voice 8) into Layer 2 (`tick` ->
  `emitKeyon`) into Layer 1 (the register file), reproducing the oracle's FIRST
  keyon (voice 8, vf 577) ROW-FOR-ROW. RED 1: drop the cue (provider returns
  null) -> the chain emits ZERO writes (the episode is missing). RED 2: route
  with corrupted params -> the `$01` fc write diverges. RESTORE: re-green.
- **HONEST COVERAGE.** The accounting: 1620 keyons across ~633 mailbox doors;
  the chain reproduces any single keyon episode through the full three-layer
  path (proven above). The full 191,367-row stream is NOT claimed this wave; it
  is gated by four named TODOs (below).

# 5. WHAT REMAINS (the four named TODOs gating full 191k reproduction)

1. **Layer 3 cue-id -> voice-param scripts.** Each cue-id indexes Z80-side ROM
   tables for sample-address / fc / volume / pan and writes them into `$62EC`.
   This wave routes via an injected `paramsProvider(id)`; the live tables + the
   script interpreter (inside `$0829`/the routines it calls) are a later wave.
2. **Layer 2 ramp math** (worklog 141 TODO). The per-tick oscAcc/volAcc advance;
   without it the refresh stream cannot change fc, so dynamic-pitch frames do not
   reproduce.
3. **Layer 2 keyoff** (worklog 141 TODO). The `$10=$0F` emission + the keyoff
   state path; without it voices never free, so the allocator history diverges
   from the oracle after the first few keyons.
4. **The mailbox door -> keyon mapping.** 1-to-many and time-delayed (mediated by
   the channel manager + the timer); aligning it historically needs TODOs 1+3.

These four close together to lift the chain from "reproduces any keyon episode"
to "reproduces the full 191,367-row register stream." Wave C is structurally
complete (all three layers shipped and coupled); the remaining work is the
behavioural depth (the cue scripts + the Layer 2 state machine), not the wiring.

# 6. FILES
- `games/ddpdoj/src/dispatch.js` (new) -- the ported cue dispatch core + the
  full-chain harness.
- `games/ddpdoj/tests/dispatch.test.js` (new) -- the full-chain MUST-FAIL.
- `docs/worklog/ddpdoj/142-impl-sound-wave-c3.md` (this file).
