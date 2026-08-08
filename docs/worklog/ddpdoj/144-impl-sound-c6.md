# 144 -- IMPL: sound wave C6 (the main-loop dispatcher + the immediate note-on)

status: DONE   role: implementer   wave: W27 sound, Wave C depth (TODO 1a)   owns: games/ddpdoj/src/

Wave C depth, sub-wave C6 of the W27 sound port (143-recon-c-depth.md
section C6 / TODO 1a). The single deliverable: the ported Z80 MAIN-LOOP
dispatcher (`$0321` poll / `$3CDD` dequeue / `$41D0` switch over the 15-command
table at `$078E`) + the immediate-SFX note-on path (cmds `$00`/`$01` ->
`$3245` -> `$3150` populator -> `$62EC`), REPLACING W142's injected
`paramsProvider(id)` with the real Z80 dispatch. After C6 the chain reproduces
the 641 SFX keyons through mailbox -> dispatch -> note-on -> voice engine ->
register writes.

# 0. PREMISE CHECK (the brief's own rule -- every cited address re-decoded)

Every address the brief and W143 cited was re-decoded out of
`rip/sound/z80ram.bin` with `tools/z80dis.py`. Findings (all CONFIRM the recon):

- **THE MAIN LOOP IS AT `$0321`, BACK-EDGE `$07CA`.** Decoded `$0321` end-to-
  end. The loop: `$033F: LD HL,$6001; CALL $3BB5` (poll the mailbox queue);
  `$0345: LD A,H; OR L; JP NZ,$07CA` (if the queue is empty, loop back);
  `$034A: ...; CALL $3CDD` (dequeue one message); `$036E: JP $41D0` (the switch
  dispatcher over the table at `$078E`). `$07CA: JP $0321` -- CONFIRMED the
  main-loop back-edge (re-decoded: literally `JP $0321`). The W138 claim that
  "the main thread idles" is corrected: the main thread RUNS this dispatch loop.

- **`$3BB5` IS THE NON-EMPTY POLL.** Returns HL=0 if the queue struct
  (`$6001+$0C` head/tail field) is non-empty (has work), HL=1 if empty. So
  `JP NZ,$07CA` loops while empty, falls through to dequeue when there is work.
  (The recon said "if empty JP $07CA" -- CONFIRMED: empty -> HL!=0 -> jump.)

- **THE 15-COMMAND TABLE AT `$078E` IS EXACTLY AS CITED.** 4-byte stride
  `[cmd][00][addr_lo][addr_hi]`, scanned by `$41D0`. All 15 entries re-decoded
  and MATCH the recon byte-for-byte:
    `$00`->`$0371` `$01`->`$03E5` `$02`->`$0468` `$0D`->`$0527` `$0E`->`$0592`
    `$0F`->`$04DD` `$10`->`$0521` `$11`->`$05F0` `$12`->`$065B` `$13`->`$06C8`
    `$14`->`$0700` `$15`->`$0738` `$16`->`$073E` `$1D`->`$0776` `$20`->`$077F`

- **THE IMMEDIATE NOTE-ON ROUTING IS CMDS `$00`/`$01`/`$02` -> `$3245`.** A scan
  of every handler for `CALL $3245` / `CALL $3150` / `CALL $2E38` confirms:
    cmd `$00` (`$0371`): `CALL $3245` at `$03DD`  -- immediate note-on
    cmd `$01` (`$03E5`): `CALL $3245` at `$0460`  -- immediate note-on
    cmd `$02` (`$0468`): `CALL $3245` at `$04D5`  -- immediate note-on (not in stage 1)
    cmd `$11` (`$05F0`): `CALL $2E38` at `$0655`  -- cue-id sequencer (C7)
    cmd `$12` (`$065B`): `CALL $2E38` at `$06C2`  -- cue-id sequencer (C7)
  The mailbox TYPE byte IS the command opcode (stage-1 doors are type `$00`/
  `$01`/`$0F`/`$12`/`$15` = cmd `$00`/`$01`/`$0F`/`$12`/`$15`). Cmd `$0F`
  (`$04DD`) calls `$34FB`, NOT `$3245` -- a different note-on variant, OUT OF
  SCOPE this wave (the 10 SFX keyons from the 8 type-`$0F` doors are deferred).

- **`$3150` IS THE `$62EC` POPULATOR (faithfully structured as the recon said).**
  Decoded: `CALL $311C` (allocate a slot via the `$62EC`/`$654E` allocator);
  if `$FF` returned, bail. Then writes struct fields: `[+2/+3]` a 16-bit caller
  pointer; computes `masked = caller & $03FF`; `[+5/+6] = [$62EA] + masked*12`
  (sample-base + a 12-byte-stride sample-descriptor index); validates against
  the limit `[[$62E8]]`; writes `[+7/+8]`, `[+9/+0A]`. The state byte `[+0]` is
  armed to `$01` (KEYON) later by `$37DB`. CONFIRMED.

- **THE PARAM-SET IS SELECTED BY THE PAYLOAD'S SAMPLE INDEX, NOT THE CUE-ID.**
  Checked against the oracle: ALL 368 type-`$00` id-`$0D` doors share the
  IDENTICAL `(pan=$49, chan=$28)` yet map to 10 DISTINCT param-sets. So the
  param-set is NOT a function of the `[type][pan][id][chan]` longword the dedup
  TSV captures; it is selected by the EXTRA bytes in the 6-byte payload (the
  10-bit sample-descriptor index `$3150` masks with `$03FF`). The dedup TSV
  carries only 4 of the 6 payload bytes, so the door->param-set map CANNOT be
  derived from the mailbox columns alone. This forces the empirical shortcut.

NET: the recon's premise is correct in every load-bearing detail. The one
practical wrinkle (the param-set is payload-driven, not cue-id-driven) means
the SFX param table is reconstructed per-DOOR from the oracle's `after_door`
map, not per-cue-id. The recon sanctioned this ("the SFX side can be
reconstructed from the 1620-episode clustering and shipped as a literal
table").

# 1. THE DATA SHAPE (sizing C6 against the oracle)

Run directly against the TSVs. The 641 SFX keyons (OscConf `$20`) by triggering
door type (via keyon.tsv `after_door`):
  type `$00` (cmd `$00`): 374 keyons / 318 doors  -- IN SCOPE
  type `$01` (cmd `$01`): 239 keyons / 203 doors  -- IN SCOPE
  type `$0F` (cmd `$0F`):  10 keyons /   8 doors  -- DEFERRED (cmd $0F -> $34FB)
  type `$15` (cmd `$15`):   1 keyon  /   1 door   -- DEFERRED (cue-id sequencer)
  (no door / pre-gameplay): 17 keyons             -- DEFERRED (TODO 4 timeline)
  TOTAL: 641

So C6's immediate note-on path (cmds `$00`/`$01`) owns 613 of the 641 SFX
keyons (the 623 type-`$00`/`$01` doors; 521 produce >=1 SFX keyon, 102 produce
none -- those are control-only or route elsewhere). The remaining 28 SFX
keyons are named TODOs below. 436 doors produce 1 SFX keyon; 94 produce 2
(often with DIFFERENT param-sets -- one door can trigger two samples).

The SFX param-sets cluster to 14 distinct (fc, saddr, start24, end24, vol, pan)
signatures. The top 2 (both fc=`$0300`, saddr=`$44`) cover 540 of the 641
keyons; the recon's "14 distinct sets" is CONFIRMED.

# 2. THE PORT (src/dispatch.js additions)

The ported main-loop dispatcher, faithful to the disassembly:

- `COMMAND_TABLE`: the verified 15-entry `$078E` table (cmd -> handler addr).
- `MAINLOOP`: the address constants (`$0321`, `$3BB5`, `$3CDD`, `$41D0`,
  `$07CA`, the note-on `$3245`, the populator `$3150`, the slot allocator
  `$311C`).
- `MailboxQueue`: the Z80-RAM struct at `$6001` the NMI drains into and the
  main loop dequeues from. A FIFO of decoded messages `{cmd, pan, id, chan,
  doorLf}`. `poll()` mirrors `$3BB5` (non-empty test); `dequeue()` mirrors
  `$3CDD`.
- `MainLoop`: the `$0321` loop. `run()` polls + dequeues + dispatches each
  message via `COMMAND_TABLE` and the `$41D0` switch. Routes cmd `$00`/`$01` to
  the ImmediateNoteOn handler; other cmds to stubs (named TODOs).
- `ImmediateNoteOn`: the cmd `$00`/`$01` -> `$3245` -> `$3150` populator.
  Allocates a `$62EC` slot (the engine's `acquireIcsVoice`), looks up the
  door's param-set, writes the slot fields, arms state=KEYON.
- `SfxParamTable`: the empirical door->param-set map, built from the oracle
  (the 14 reconstructed sets; one door maps to 1 or 2 ordered sets). This is
  the "literal table" the recon sanctioned; the live banked-score-data lookup
  (the `$62EA`/sample-descriptor resolution) is a C7 dependency.
- `SoundChain` REFACTORED: `enqueueDoor(door)` (the NMI ingress from W142 --
  bank-select + decode + enqueue to the MailboxQueue); `runMainLoop()` (dequeue
  + dispatch); `tick()` (Layer 2). The injected `paramsProvider` is REMOVED;
  the real dispatcher + the SfxParamTable replace it.

DEFERRED (named TODOs, per the brief's scope-discipline):
- Cmd `$0F` (`$04DD`->`$34FB`): 10 SFX keyons. A different note-on variant; the
  `$34FB` routine is NOT ported (out of scope: cmd `$00`/`$01` only).
- Cmd `$15`/`$12` (cue-id sequencer `$2E38`): 1 SFX + the 979 BGM keyons. This
  is C7 (the banked score data dependency).
- The 17 no-door SFX keyons: pre-gameplay / timeline-orphan; TODO 4 (C8).
- The voice-allocation TIMING (which voice each keyon lands on): the allocator
  cycles 8->31->wrap, driven by keyoff freeing. Without TODO 3 (keyoff) the
  allocator cannot track the oracle's voice history; the must-fail isolates the
  populator correctness by injecting the oracle's voice per episode.

# 3. THE MUST-FAIL (the dispatcher + note-on are load-bearing)

`tests/dispatch.test.js` (updated). The C6 centrepiece carries RED -> RESTORE:

- **GREEN/RED/RESTORE (the 613 immediate-SFX keyons reproduce).** Drive ALL 623
  type-`$00`/`$01` doors through the MainLoop dispatcher. Each routes via the
  verified `COMMAND_TABLE` to ImmediateNoteOn, which populates a `$62EC` slot
  with the SfxParamTable's params for that door and arms keyon. emitKeyon
  (Layer 2) emits the register writes. The emitted keyon PARAMS (fc, saddr,
  oscStrt, oscEnd, r0A, r0B, pan, r09, oscConf) match the oracle's keyon
  episode for that door, row-for-row (the voice is the oracle's, injected to
  isolate the populator from the deferred allocator timing). 613 of 613
  immediate-SFX keyons match. RED: corrupt the SfxParamTable (wrong params for
  one door) -> that door's emitted writes diverge. RED: break the
  COMMAND_TABLE routing (map cmd `$00` to the sequencer handler) -> zero
  keyons emit. RESTORE: re-green.
- **The dispatcher mechanics** (the `$078E` table + the `$41D0` switch): a
  focused test that the switch dispatches each of the 15 cmds to the verified
  handler, and that cmd `$00`/`$01` route to ImmediateNoteOn while cmd `$11`/
  `$12` route to the (stubbed) sequencer.
- **HONEST COVERAGE**: 613 of 641 SFX keyons reproduce through the immediate
  note-on path; the remaining 28 are the named TODOs (cmd `$0F`, `$15`, the 17
  no-door). The full 191,367-row stream remains gated by TODOs 2/3/4 + C7.

Skips loudly when `rip/sound/ics.tsv` / `keyon.tsv` / `mailbox_dedup.tsv` are
absent.

# 4. GATES

- `node --test games/ddpdoj/tests/` -- **1339 pass / 0 fail / 0 skipped**.
  (Was 1338 after W142; +1 net: the 4 W142 dispatch tests became 5 C6 tests.
  The centrepiece took ~460 ms: parse 191,367 oracle rows + drive 613 keyons
  each through a fresh chain. Oracle-present run skips nothing; the
  oracle-touching tests would skip loudly if any of ics.tsv / keyon.tsv /
  mailbox_dedup.tsv were absent.)
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged (Layer 3 is pure JS).
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated
  (rom-leak guard clean, 6 deliberate exceptions). No new ROM windows (Layer 3
  reads the oracle TSVs, which are gitignored ROM-derived data and never
  shipped), so no export-web.mjs regen was required.

# 5. THE MUST-FAIL RESULT

`tests/dispatch.test.js` test 4 (the centrepiece, oracle-present): GREEN on all
613 immediate-SFX keyons (row-for-row against ics.tsv), then three REDs:

- **RED 1 (populator dropped)**: empty SfxParamTable -> the dispatcher arms no
  slot -> 0 register writes -> the episode is missing.
- **RED 2 (populator corrupted)**: wrong fc -> the `$01` writes diverge from the
  oracle.
- **RED 3 (dispatcher mis-routes)**: cmd `$00` routed to sequencer would drop
  all 613 (the routing is load-bearing).
- **RESTORE**: the correct chain re-greens.

The 613/613 row-for-row match proves the dispatcher + the note-on populator are
load-bearing across the FULL immediate-SFX corpus, not just one hand-picked
episode.

# 6. WHAT REMAINS (the named TODOs gating the remaining 28 SFX + full 191k)

1. **cmd `$0F`** (`$04DD` -> `$34FB`): 10 SFX keyons. A different note-on
   variant (not `$3245`). C6 = cmd `$00`/`$01` only.
2. **Cue-id sequencer** (cmd `$11`/`$12`/`$15` -> `$2E38`): the 979 BGM keyons +
   1 SFX keyon. Needs the banked score data (the `[$62E4]` table + note streams
   loaded from the 68k ROM). This is C7 -- the highest-risk Wave C item.
3. **17 no-door SFX keyons**: pre-gameplay / timeline-orphans. TODO 4 (C8).
4. **Layer 2 keyoff** (`$0A0C`) + oscEnd timing (TODO 3 / C5): without it the
   allocator cannot track the oracle's voice history, so the 613 keyons are
   verified with injected voices, not the live allocator.
5. **The historical door->keyon map** (TODO 4 / C8): the frame-by-frame driver
   (the +offset warp + the vf=5 release-all) that emits the full 191,367-row
   stream.

These close together to lift the chain from "reproduces the 613 immediate-SFX
keyons" to "reproduces the full 191,367-row register stream."

# 7. FILES
- `games/ddpdoj/src/dispatch.js` (rewritten) -- the NMI ingress (kept) + the
  main-loop dispatcher + the immediate note-on + the SfxParamTable.
- `games/ddpdoj/tests/dispatch.test.js` (rewritten) -- the C6 MUST-FAIL.
- `docs/worklog/ddpdoj/144-impl-sound-c6.md` (this file).
