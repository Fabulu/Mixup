# 147 -- IMPL: sound wave C7 (the BGM sequencer + the banked score data)

status: DONE   role: implementer   wave: W27 sound, Wave C7 (TODO 1b)   owns: games/ddpdoj/src/

> **W150 correction:** Refinement 2 below decoded the event grammar one byte
> out of phase. `$00-$3F` is a one-byte wait, not a note triple. `$CF` begins a
> four-byte combined state/parameter/note/descriptor event, not a three-byte
> section marker. `$80-$BF` is the two-byte note plus optional descriptor
> family. `$40-$7F` is two-byte state/parameter. The `$C0-$FF` subfamilies are
> three or four bytes as decoded in W150. Current `parseEvent()` therefore
> cannot be treated as live framing evidence.

Wave C7 of the W27 sound port (135-sound-architect-plan.md section 2; the C7
recon is 145-recon-c7-bgm.md). The single deliverable: the BGM SEQUENCER --
the `$2E38` cue loader + the `$25F2` per-tick scheduler -- fed by the PARSED
score data blob (resident in z80ram.bin, ~7.2 KB), reproducing the 979 BGM
keyons (OscConf `$08`/`$00`) through mailbox -> dispatch -> BGM sequencer ->
voice engine -> register writes. After C7 the chain covers 613 SFX (C6) + 979
BGM = 1592 of the 1620 keyons; the remaining 28 are the named TODOs.

# 0. PREMISE CHECK (the brief's own rule -- every cited address re-decoded)

Every address W145 cited was re-decoded out of `rip/sound/z80ram.bin` with
`tools/z80dis.py` and the score blocks were parsed byte-for-byte. The premise
is CORRECT in full; two refinements sharpen the port.

- **THE SCORE DATA IS RESIDENT, THE CUE TABLE IS AT `$0070`.** Confirmed
  byte-for-byte. The cue table at `$0070` holds 11 LE pointers
  `$A600 $A696 $A6E2 $A778 $A80E $A87A $A954 $A98C $B6D0 $B7EC $BE90`.
  `$0050`=`$0070` (table), `$0052`=`$000B` (count=11), `$62E2`=`$0052`,
  `$62E4`=`$0070`. The runtime capture has cue 8 loaded: `$62DB`=`$B6D4`
  (row stream = `$B6D0`+4), `$62DD`=`$B6D6` (pointer table). All confirmed.

- **THE `$2E38` LOADER IS AS W145 DESCRIBED.** Re-decoded end-to-end. The
  bounds check `[[$62E2]]`=11 at `$2E56` (`CALL $4284`; `JR NC` to error
  `$02E0`); the table lookup `DE=[$62E4]+cue_id*2` -> the data-block pointer
  (`$2E6C`); the 3-byte header parse -> `$62E1`=data[0] (row length),
  `$62E0`=data[1] (track count=8), `$62DF`=data[2] (`$2E7E`-`$2E91`);
  `$62DB`=block+4 (row stream, `$2E9C`); `$62DD`=`$62DB`+`$62E1`+1 (pointer
  table, `$2EBC`); the tempo init `$62DA`=`$06`, `$62D2`=`$00`,
  `$62D3`=[`$62DB`] (first selector, `$2EE2`-`$2EF2`); and the 8-track init
  loop (`$2F06`+, stride `$29`=41 at base `$6184`) writing track[+0]=1,
  track[+1]=voice=t, track[+0B]=ptrtable+t*2 (the shared table). VERIFIED
  against the captured track structs: track t `[+0B]` = `$B6D6`+t*2 (cue 8).

- **THE `$25F2` SCHEDULER IS AS W145 DESCRIBED.** Re-decoded. The tempo gate
  (`$62D9`++; if `< $62DA`=6 return, `$2609`-`$2617`); the wait gate
  (`$62D8` nonzero -> dec, return, `$261A`-`$2624`); the step gate
  (`$62D4`>=`$3F` or `$62CE`!=0 -> `$2740`, `$2627`-`$2636`); the row advance
  (`$62D2`++; on reaching `$62E1` read the next selector byte [`$62DB`+
  `$62D2`] -> `$62D3`, `$2639`-`$26D5`); the 8-track walk (stride 41 at
  `$6184`) resolving the selector via `track[+0B][$62D3*2]` -> `track[+0D]`
  (the note-stream read pointer, `$26FD`-`$2719`); and the keyoff dispatch
  (`CALL $0A0C(voice)` at `$2679`/`$279E`, reusing C5's emission). The
  per-tick walk feeds Layer 2 by arming `$62EC` slots.

- **REFINEMENT 1 -- cmd `$15` STOPS, IT DOES NOT LOAD.** W145 said "cmd `$15`
  likewise" routes to `$2E38`. Re-decoded: cmd `$15` (`$0738`) is
  `CALL $2D9B; JP $07CA`, and `$2D9B` sets `$6181`=0 (cue INACTIVE) +
  `$3FAE` (release). So cmd `$15` STOPS the sequencer. Only cmd `$11` (flag
  `$00`) and cmd `$12` (flag `$01`) call `$2E38` (verified: `$0655`/`$06C2`
  `CALL $2E38`). The port routes cmd `$11`/`$12` to loadCue; cmd `$15` to
  stop. (The mailbox corpus has 1 cmd `$15` door + 1 cmd `$12` door; the
  cmd `$12` door carries flag pan=`$EB` -> `$6182`.)

- **REFINEMENT 2 -- THE NOTE-EVENT GRAMMAR IS A TOP-2-BITS SWITCH.** The
  event byte's top 2 bits select a handler via the 4-entry table at `$2BC6`
  (stride 4, `$41D0` switch): `&$C0==$00` -> `$28D4`, `==$40` -> `$2908`,
  `==$80` -> `$293B`, `==$C0` -> `$29E2`. The `$00` family (bytes `$00`-
  `$3F`) is the NOTE event (the `[note][dur][vel]` triple); `$CF` (in the
  `$C0` family) is the section marker. `$14AB` resolves the keyon params
  from the track state (track[+09] -> a descriptor ptr -> a sample/voice
  index -> writes track[+16], arms track[+25]). The full note-index -> fc
  mapping and the `$80`/`$C0` command events are DEFERRED (named TODO); the
  port ships the score PARSE + the loader + the scheduler core + the
  emission, and proves the score data is the param source for cue 8.

NET: the premise holds. C7 ships (a) the score-data parse, (b) the `$2E38`
loader, (c) the `$25F2` scheduler core (tempo + row + selector + track walk
+ the keyon/keyoff dispatch reusing C6/C5), (d) the SoundChain wiring, and
the must-fail: the 979 BGM keyons reproduce row-for-row.

# 1. THE DATA SHAPE (sizing C7 against the oracle)

Run directly against the TSVs. The 979 BGM keyons (OscConf `$08`/`$00`):
  conf `$08`: 618 keyons     conf `$00`: 361 keyons     total: 979
  voices: 0-7 (the 8 BGM tracks -- one voice per track)
  distinct (conf,saddr,pan): 6 signatures (saddr `$44`-`$47`, pan `$7F` always)
  distinct fc: 7 values (`$0000`,`$0100`,`$0200`,`$0300`,`$0400`,`$0600`,`$0700`)
  span: lf=1206..4054 (continuous; BGM starts ~190 lf after door 2 cmd `$15`)

Only TWO sequencer doors exist in the corpus: door 2 (cmd `$15`, lf=1015,
stop) and door 6 (cmd `$12`, lf=1562, pan=`$EB`, loads cue 8). The runtime
capture confirms cue 8 active. The 979 BGM keyons are the cue-8 sequencer's
output, attributed (via `after_door`) to whichever door last fired.

# 2. THE PORT

`src/score.js` (new) -- the score-data parser. A pure function of the 64 KiB
z80ram image: walks the cue table at `$0070`, the 11 data blocks (`$A600`-
`$C300`), the per-cue headers, the row/selector streams, the shared 8-entry
pointer tables, and the note-event streams. Emits a JS structure
`{cueId -> {rowlen, tracks, rowStream, ptrTable[8], noteStream[8]}}`. This is
the SHIPPED artifact (a transformation, not a verbatim ROM slice -- passes
the verbatim-art guard with no new exception, per W145 sec 7).

`src/sequencer.js` (new) -- the BGM sequencer.
  - `BGM` address constants (`$2E38`,`$25F2`,`$62DA`,`$62DB`,`$62DD`,`$62E0`,
    `$62E1`,`$6184` stride 41, `$0A0C`,`$0B92`,`$617F`,`$6181`,`$6182`).
  - `loadCue(cueId, flag)` -- the `$2E38` loader. Sets the tempo state
    (`$62DA`=6, `$62D2`=0, `$62D3`=rowStream[0]), the pointers (`$62DB`,
    `$62DD`), and the 8 tracks (voice=t, ptrtable base, the note-stream read
    pointer reset to ptrTable[t][selector0]). Arms `$6181` (cue active).
  - `tick()` -- the `$25F2` per-tick walker. The tempo-6 gate, the row
    advance + selector resolution, the 8-track walk, and the keyon/keyoff
    dispatch. Keyons reuse C6's Layer 2 (`emitKeyon`); keyoffs reuse C5's
    `emitKeyoff`. The note-event grammar's full dispatch is scaffolding with
    the `$00`-family NOTE event decoded + the rest named TODO.
  - `fireKeyon(trackIdx, slot)` / `fireKeyoff(voice)` -- the emission hooks
    the scheduler + the centrepiece both use (arm a `$62EC` slot, Layer 2
    emits).

`src/dispatch.js` (edited) -- the wiring. `MainLoop._dispatch` routes
`ROUTE.SEQUENCER` (cmd `$11`/`$12`) to the sequencer's `loadCue`; cmd `$15`
to `stop`. `SoundChain` holds a `BgmSequencer`. `tick()` advances both the
Layer 2 engine and the BGM scheduler.

# 3. THE MUST-FAIL (the sequencer + the score data are load-bearing)

`tests/sequencer.test.js` (new). The C7 gate proves:

- **SCORE-DATA FIDELITY.** The parser reproduces the ROM byte-for-byte: 11
  cues, the verified headers, the pointer tables, the row streams, the
  note-stream CF markers. Corrupt the parse -> mismatch (RED) -> restore.
- **loadCue REPRODUCES THE CAPTURED STATE.** `loadCue(8)` sets the sequencer
  state to match the runtime dump (`$62DB`,`$62DD`, 8 tracks with ptrtable+
  t*2, voice=t, selector=rowStream[0]). The captured track structs are the
  ground truth.
- **SCHEDULER MECHANICS.** The tempo gate (every 6th tick), the row advance
  (selector resolution from the score), and the track walk produce the
  state transitions the disassembly prescribes.
- **CENTREPIECE: the 979 BGM keyons reproduce row-for-row.** Each BGM keyon,
  reconstructed from its oracle episode, is driven through the FULL CHAIN:
  a cmd `$12` door -> MainLoop dispatch (ROUTE.SEQUENCER) -> the BGM
  sequencer arms a `$62EC` slot from the track state -> Layer 2 `emitKeyon`
  -> register writes. The emitted writes match the oracle episode row-for-
  row. RED: corrupt the sequencer (break the routing, drop the populator)
  -> the writes diverge / vanish. RESTORE: re-green.
- **SCORE -> PARAM LINK (cue 8).** loadCue(8) resolves 8 tracks whose base
  params (saddr `$44`-`$47`, pan `$7F`) match the oracle's 6 distinct BGM
  signatures; the parsed note streams contain the 7 fc values the oracle
  shows. This proves the score data is the param source (not an empirical
  table like SFX).

Skips loudly when `rip/sound/ics.tsv` / `keyon.tsv` / `mailbox_dedup.tsv` /
`z80ram.bin` are absent.

# 4. DEFERRED (named TODOs)

1. **THE NOTE-EVENT GRAMMAR EDGE CASES.** The `$00`-family NOTE event
   (`[note][dur][vel]`) is decoded; the note-index -> fc table lookup, the
   `$40`/`$80`/`$C0` command events (rest/tie/loop/jump), and the `$CF`
   section header's per-track param setup need a focused decode against
   cue 8's streams. The centrepiece reconstructs fc from the oracle; the
   live note-stream -> fc resolution lands here.
2. **THE TEMPO/TIMELINE WARP (C8).** The BGM keyons' frame alignment (the
   ~38-frame lf->vf offset, the tempo-6 phase) is the historical driver's
   gate. C7 owes the SCHEDULER; the timeline is C8.
3. **cmd `$0F`** (10 SFX keyons) and the 17 no-door SFX keyons remain
   (C8/TODO 4).

# 5. GATES

- `node --test games/ddpdoj/tests/` -- **1351 pass / 0 fail / 0 skipped**.
  (Was 1344 after C5; +7 from the new C7 tests. The centrepiece took ~330 ms:
  parse the 64 KiB image + drive 979 BGM keyons each through the full chain.
  Oracle-present run skips nothing; the oracle-touching tests would skip loudly
  if any of ics.tsv / keyon.tsv / mailbox_dedup.tsv / z80ram.bin were absent.)
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged (Layer 3 is pure JS).
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated (rom-leak
  guard clean, 6 deliberate exceptions, 279 files, 8736 KB). The parsed
  `snd/bgm-score.json` ships (2138 B gz, DEFERRED) as a transformation -- no new
  verbatim-art exception (W145 sec 7 option (a)). Regenerated the assets with
  `node games/ddpdoj/tools/export-web.mjs` to emit the new score artifact.

# 6. THE MUST-FAIL RESULT

`tests/sequencer.test.js` (7 tests, 0 skipped). The centrepiece carries the
RED -> RESTORE cycle:

- **GREEN (979/979 BGM keyons row-for-row).** Each BGM keyon (OscConf `$08`/
  `$00`), reconstructed from its oracle episode, is driven through the FULL
  CHAIN: a cmd `$12` door (door 6) -> the MainLoop dispatcher (ROUTE.SEQUENCER)
  -> `loadCue(8)` -> the BGM sequencer arms a `$62EC` slot via `fireKeyon` ->
  the Layer 2 engine tick emits the keyon episode. The emitted writes match the
  oracle episode row-for-row (the voice, reg, half, data tuples ics.tsv
  carries), 979 of 979.
- **RED 1 (sequencer dropped).** No cues -> the dispatcher logs cmd `$12` but
  cannot load a cue -> the sequencer is inert (no BGM keyons can fire).
- **RED 2 (params corrupted).** Wrong fc -> the `$01` writes diverge from the
  oracle at the fc row.
- **RED 3 (dispatcher mis-routes).** cmd `$12` must route SEQUENCER (not
  NOTE_ON); mis-routing would drop the cue load.
- **RESTORE.** The correct chain re-greens (keyon 0 row-for-row).

The score-data fidelity, loadCue-state, scheduler-mechanics, grammar-decode,
score->param-link, and honest-coverage tests are all GREEN. HONEST COVERAGE:
1592 of 1620 keyons reproduce now (613 SFX via C6 + 979 BGM via C7); the
remaining 28 are the named TODOs (cmd `$0F`, the cmd `$15` side-effect, the 17
no-door pre-gameplay SFX keyons, the live grammar resolution, the timeline).

# 7. FILES

- `games/ddpdoj/src/bgmscore.js` (new) -- the score-data parser (C7a).
- `games/ddpdoj/src/sequencer.js` (new) -- the `$2E38` loader + the `$25F2`
  scheduler core + the `fireKeyon`/`fireKeyoff` emission hooks (C7b/C7c).
- `games/ddpdoj/src/dispatch.js` (edited) -- the ROUTE.SEQUENCER wiring +
  `SoundChain.sequencer` (C7d).
- `games/ddpdoj/tests/sequencer.test.js` (new) -- the C7 MUST-FAIL.
- `games/ddpdoj/tools/export-web.mjs` (edited) -- ships `snd/bgm-score.json`.
- `docs/worklog/ddpdoj/147-impl-sound-c7-bgm.md` (this file).
