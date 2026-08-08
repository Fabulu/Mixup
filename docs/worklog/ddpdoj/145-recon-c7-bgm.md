# 145 -- RECON: sound wave C7 (the BGM sequencer + the banked score data)

status: DONE   role: recon (read-only)   wave: W27 sound, Wave C depth (TODO 1b / C7)

Resolves the highest-risk Wave C item W143 flagged (section 6, last paragraph):
the cue-id table `[$62E4]` and the BGM note streams are "BANKED FROM THE 68k ROM,
loaded through the `$C10000` window, NOT in z80ram.bin. Porting C7 needs the 68k-
side score data located and decoded (a Wave-A/banking dependency)." This recon
locates and decodes that data and the `$2E38`/`$25F2` sequencer so the C7
implementer can reproduce the 979 BGM keyons.

# 0. PREMISE VERDICT (the brief's own rule -- every cited address re-decoded)

Every address W143/W144 cited was re-decoded out of `rip/sound/z80ram.bin` with
`tools/z80dis.py` and cross-checked against `maincpu.bin`. The premise is CORRECT
in one half (the data is uploaded via `$C10000`) and OVERSTATED in the other (the
data is NOT runtime-banked -- it is RESIDENT in z80ram.bin). The correction
DE-RISKS C7 substantially: no 68k-banking emulation is needed, just a static
~7.2 KB blob. Findings:

1. THE SCORE DATA IS RESIDENT IN z80ram.bin, NOT RUNTIME-PAGED. W143's framing
   ("BANKED ... through the `$C10000`/`$6000` window") implied runtime paging. It
   is a BOOT-TIME ONE-SHOT UPLOAD (see verdict 3). The cue-id table, the per-cue
   data blocks, the pointer tables AND the note streams are all in the dump:
     cue table        `$0070`-`$0085`   (11 entries x 2 bytes + count)
     per-cue blocks   `$A600`-`$C300`   (~7.2 KB)
     total footprint  ~7.4 KB
   The Z80 reads them via ordinary HL pointer dereferences (no port I/O, no bank
   register). The only runtime `$6001`/window access is the mailbox (cmd ingress,
   W142/W144); score reads are plain RAM.

2. THE CUE TABLE IS AT `$0070`, NOT MISSING. W143 scanned `$4000`-`$5B97` and
   "found NO flat cue-id pointer table" (section 4). Correct scan, wrong range:
   the table is at `$0070` (BELOW `$4000`), inside the Z80 program image. It is
   11 little-endian pointers `$A600 $A696 $A6E2 $A778 $A80E $A87A $A954 $A98C
   $B6D0 $B7EC $BE90`, set at boot by `$1419` (called from `$0308`) from globals
   `[$0050]`=`$0070` (table), `[$0052]`=`$000B` (count=11), `[$0060]`=`$6840`.
   These globals are themselves part of the uploaded image -- constants, not
   runtime variables.

3. THE WHOLE Z80 RAM IS UPLOADED BY THE 68k AT BOOT VIA `$C10000`. The Z80 has
   NO ROM (`NOTES-machine.md` line 143, pgm.cpp:29: "There is no ROM for the Z80,
   the program is uploaded by the 68k"). The 68k writes the full 64 KB image
   (program + globals + score data) through `0xc10000-0xc1ffff`. `pgm.py`
   `_z80_blob` (lines 937-1009) confirms the upload is "NOT a straight copy ...
   written through code rather than a block move" -- i.e. a 68k-side construct/
   relocate routine, which is why a verbatim search for the cue-table bytes in
   maincpu.bin misses but a verbatim search for the NOTE-STREAM bytes hits.

4. `$25F2` IS CALLED PER TIMER TICK FROM `$0FC8` (CONFIRMED at `$0FD5`), right
   before `$376C` (the `$62EC` voice walker). The sequencer is INT-driven and
   shares Layer 2 (`$62EC`/`$0B92`) with the SFX path (W144/C6).

NET: the C7 dependency W143 named is real but small. The "banking" is a one-time
boot upload; the port needs the ~7.2 KB score blob (extractable from z80ram.bin
OR maincpu.bin) and the `$2E38`/`$25F2` logic. No 68k-bank emulation, no Wave-A
prerequisite. C7 drops from the "highest-risk Wave C item" to a structured-port
item whose only genuine depth is the note-event grammar.

# 1. THE CUE-ID ROUTE (cmd $12/$15 -> $2E38 -> [$62E4] -> $25F2)

Re-decoded end-to-end. The chain W143 section 4(ii) described is correct in
shape; the addresses are now pinned and the runtime table is located.

- DISPATCH (W144, CONFIRMED): cmd `$12` (`$065B`) `CALL $2E38` at `$06C2`; cmd
  `$15` (`$0738`) and cmd `$11` (`$05F0`) likewise. `dispatch.js` already routes
  these to `ROUTE.SEQUENCER` (line 89) -- the C7 plug-in point.
- `$2E38(cue_id, arg, flag)` (the cue loader, runs ONCE per cue in the main loop):
    `$2E4F`: `HL = [[$62E2]]` = `[$0052]` = `$000B` = 11 (the count).
    `$2E56`: `CALL $4284` -- bounds-check `cue_id < 11`; else error `$02E0`.
    `$2E61-2E6E`: `DE = [$62E4] + cue_id*2`; `DE = table[$0070][cue_id]` (the
                  data-block pointer, e.g. cue 8 -> `$B6D0`).
    `$2E7E-2E91`: parse 3 header bytes -> `$62E1=data[0]`, `$62E0=data[1]`,
                  `$62DF=data[2]`.
    `$2E94-2E9C`: `$62DB = data_block + 4` (the row/selector stream).
    `$2E9F-2EBC`: `$62DD = $62DB + $62E1 + 1` (the per-track pointer table).
    `$2EE2-2EF6`: init tempo state `$62DA=$06` (tick divider), `$62D2=$00`,
                  `$62D3 = [$62DB]` (first selector byte).
- `$25F2` (the per-tick walker, see section 4).

THE [$62E4] TABLE: `[$62E4]` = `$0070`, set once at boot by `$1419` (above). It
is NOT populated from a mailbox window at runtime; it is a fixed table in the
uploaded Z80 image. This is the single biggest correction to W143's framing.

# 2. THE BGM NOTE STREAMS (location + format)

LOCATION (resident in Z80 RAM, verbatim in maincpu.bin):
- In z80ram.bin: the note-event streams live at `$A626`-`$C1E9`, scattered across
  the 11 cue blocks (cue 0 first stream `$A626`; cue 10 last stream `$C1E9`).
  Total score region `$A600`-`$C300` = 7424 bytes (~7.2 KB).
- In maincpu.bin (build B, decrypted): the SAME stream bytes are verbatim at
  `$1A91FC`-`$1AAC5B` (copy 1) and again at `$2AA7B6`+ (copy 2, offset
  `$1015BA` = a different ROM bank -- the two-build cartridge duplicates the
  shared sound data). The cue TABLE and cue-block HEADERS are NOT in maincpu.bin
  (the 68k-side upload routine constructs them), which is why `_z80_blob`
  reports the upload as a non-block-move.

PER-CUE DATA-BLOCK LAYOUT (decoded at `$A600`, `$A696`, ..., `$BE90`):
  [6-byte header]
    data[0] -> `$62E1`  (the row length / selector count; cue0=2, cue7=8, cue10=12)
    data[1] -> `$62E0`  (always `$08` = the track count: 8 BGM voices)
    data[2] -> `$62DF`  (== data[0])
    data[3]             (unused/pad)
  [row/selector stream at `$62DB` = data+4]
    a byte sequence read one byte per tempo-step by `$25F2`; each byte (`$62D3`)
    is a SELECTOR indexing the per-track pointer table.
  [per-track pointer table at `$62DD`]
    8 entries x 2 bytes (one per track), each a Z80-RAM pointer to a note-event
    stream. SUBTLE: the 8 tracks SHARE one pointer table at consecutive 2-byte
    offsets -- track t reads the table starting at table_base + t*2, so all
    tracks index into one interleaved stream list (verified at `$B6D6`: track 0
    -> `$B6D6`, track 1 -> `$B6D8`, ... track 7 -> `$B6E4`).
  [note-event streams]
    the actual melody bytes, e.g. cue 8 track 0 at `$B6E6`:
    `CF 78 2A | 07 04 AA | 07 04 AA | 07 06 AA | 07 02 AA | 07 00 AA | 07 1E 4F | ...`

NOTE-EVENT FORMAT (the one item still needing implementer-side precision):
- `CF` is a SECTION/START marker (27 occurrences across the whole score, so it is
  per-section, not per-note). The 2 bytes after it (`78 2A` / `20 1E` / `87 2A`)
  are a per-track header (likely a base-voice or tuning offset).
- The body is a sequence of events. The dominant pattern is a 3-byte triple
  `[note][duration][velocity]`, e.g. `07 04 AA` = note-index 7, duration 4,
  velocity `$AA`. Note indices are small (cue0 walks `01 02 03 04 05...`, cue7
  holds `13`, cue8 holds `07`). Durations vary (`00`-`1E`); velocities cluster at
  `$A2`/`$A6`/`$AA`/`$AC`/`$AE` (loud) with occasional low values (`$4F`).
- Some bytes >= `$80` appear in the velocity slot (`CE`, `BF`, `4F`); whether
  these are literal velocities or embedded command bytes (keyoff/rest/jump) was
  NOT fully resolved at recon depth. The implementer must decode the `$25F2`
  event-dispatch branch (the `$2627`-`$285F` region) against a known cue to pin
  the grammar. RISK (named in section 6).

KEYON PARAMETER RESOLUTION: at `$26FD`/`$2779`, the selector `$62D3` indexes a
per-track 16-bit table `track[+0B]` -> `track[+0D]` (a 16-bit value: the note's
param, almost certainly the fc/frequency source). `$62E0`=8 is the track count;
`$62E1` is the row length. The actual ICS2115 register programming then goes
through `$0A0C` (keyoff, W143 TODO 3) and `$37DB`/`$0B92` (keyon, W144 Layer 2),
SHARING the `$62EC` slot list with the SFX path.

# 3. THE 68k SCORE DATA LOCATION (how addressed, how much)

- ABSOLUTE ROM OFFSETS: note streams at maincpu.bin `$1A91FC`-`$1AAC5B` (~6.6 KB
  of pure stream bytes; ~7.2 KB including the constructed headers/tables once
  resident in Z80 RAM). A second copy sits at `$2AA7B6`+ (`$1015BA` higher =
  the other ROM bank; the cartridge's two builds share identical sound ROMs per
  `NOTES-machine.md` line 85, so both copies are valid sources).
- ADDRESSING MODEL: the score is NOT addressed by absolute 68k pointers. The 68k
  upload routine (run once at sound-boot) writes the Z80 RAM image through
  `$C10000`-`$C1FFFF`, CONSTRUCTING the cue headers and the per-track pointer
  tables (which hold Z80-RAM addresses like `$B6E6`). The note streams themselves
  are copied verbatim. There is NO score-data pointer table in the 68k ROM and NO
  runtime `$C10000` read for score bytes.
- BYTE COST: ~7.2 KB score data + 22-byte cue table. Trivial vs the 363 KB
  published slice or the 1.16 MB sample shard already shipped
  (`assets/snd/sample.shard.u8.gz`).

# 4. THE `$25F2` SEQUENCER (what it does + Layer 2 interaction)

Re-decoded `$25F2`-`$285F` + the `$0FC8` caller. The sequencer is the BGM
scheduler; it runs once per timer IRQ (`$0FC8` `$0FD5: CALL $25F2`) and feeds
Layer 2 by populating `$62EC` slots (the same list the SFX path uses).

Per-tick logic (when `$6181` != 0, i.e. a cue is active):
- TEMPO GATE (`$2609`-`$2624`): `$62D9++`; if `$62D9 < $62DA` (=6), return. So
  the sequencer advances every 6th timer tick. Then if `$62D8` (a wait/delay
  counter set by some events) is nonzero, dec and return.
- STEP GATE (`$2627`-`$2636`): if `$62D4` (a step counter) >= `$3F` or `$62CE` !=
  0, skip to `$2740` (the keyoff/process-tracks branch).
- ROW ADVANCE (`$2639`-`$26CA`): `$62D2++` (the column index); compare to `$62E1`
  (row length). While `$62D2 < $62E1`: walk the 8 tracks at `$6184` (stride
  `$29`=41), dispatching per-track events. When `$62D2 >= $62E1`: read the next
  selector byte `[$62DB + $62D2]` -> `$62D3`, then re-walk tracks doing the
  `track[+0B][$62D3*2]` -> `track[+0D]` lookup (the `$26CA`/`$26FD` path).
- TRACK WALK (`$2652`-`$269B`, `$26D8`-`$2739`, `$2747`-`$2845`): for each of 8
  tracks (`$62E0`=8), check the track state; call `$0A0C(voice)` (keyoff) and/or
  arm a keyon via the `$62EC`/`$37DB` path. The voice is read from `track[+1]`.
- LAYER 2 INTERACTION: identical to the SFX path (W144). Keyons flow
  `$25F2` -> `$62EC` slot -> `$376C` (the per-tick voice walker, called at
  `$0FD8` right after `$25F2`) -> `$37DB` -> `$0B92` (register programmer). So
  C7 REUSES the C6 Layer 2 (`emitKeyon`, the `$0B92` model, the `$62EC` slots);
  it only adds the SCHEDULER that decides which keyons fire when.

The keyoff-timing dependency W143 named (TODO 3 trigger (ii): BGM keyoffs from
the duration field) LIVES HERE: `$25F2` calls `$0A0C` at `$2679`/`$279E` when a
note's duration expires. So C7 and C5 (keyoff) close together -- C7's duration
field IS the C5 trigger (ii).

# 5. THE PORT PLAN (C7, four sub-waves, ~0.8 wave total)

C7a -- THE SCORE BLOB (data layer, ~0.2 wave):
  Extract the score data from z80ram.bin: cue table `$0070`-`$0085` (22 B) +
  data region `$A600`-`$C300` (7424 B). Build a JS parser that walks the 11 cue
  blocks, the per-track pointer tables and the note streams and emits a JS
  structure `{cueId -> {tracks[8] -> eventStream, rowStream, header}}`. This
  parsing is DONE ONCE at load; the scheduler then consumes the JS structure
  (no Z80 pointer chasing at runtime). Ship the parsed structure (see section 7).

C7b -- THE `$2E38` CUE LOADER (~0.1 wave):
  Port `loadCue(cueId)` -- the table lookup + bounds check + tempo-state init
  (`$62D2`/`$62D9`/`$62DA`/`$6181`). Wire it into `dispatch.js` at the existing
  `ROUTE.SEQUENCER` stub (line 89/312) for cmd `$11`/`$12`/`$15`.

C7c -- THE `$25F2` SCHEDULER (~0.4 wave, the meat):
  Port the per-tick walker: the tempo-6 divider, the row-stream advance, the
  8-track walk, the selector->param lookup, and the keyon/keyoff dispatch. The
  keyon path REUSES C6's `ImmediateNoteOn` -> `$62EC` -> `emitKeyon` (Layer 2);
  the keyoff path is C5's `emitKeyoff` (`$0A0C`, TODO 3). The two unresolved
  bits are (i) the note-event grammar (section 2 RISK) and (ii) the
  pointer-table interleaving (track t at table + t*2). Both are bounded -- a
  focused half-day decode against cue 8 (the active cue in the dump) pins them.

C7d -- INTEGRATION + GATE (~0.1 wave):
  Drive the type-`$12`/`$15` mailbox doors (1 door each in mailbox_dedup.tsv)
  through `loadCue` -> scheduler, tick-by-tick, and diff the emitted BGM
  keyons against `ics.tsv`'s 979 OscConf=`$08`/`$00` episodes (row-for-row,
  same style as the C6 centrepiece). MUST-FAIL: corrupt the score blob ->
  diverge; mis-route cmd `$12` to ImmediateNoteOn -> zero BGM keyons.

Total ~0.8 wave (matches W143's estimate). The dependency on C5 (keyoff) is
REAL but small: C7 can ship with the C5 keyoff in place (else BGM voices never
free and the allocator stalls after 8 notes). Recommended order: C5 first, then
C7; OR C7 with a stub keyoff and the C5 wiring landing in parallel.

# 6. RISKS

1. THE NOTE-EVENT GRAMMAR (medium). The `[note][dur][vel]` triple is the dominant
   event but bytes >= `$80` in the velocity slot (`CE`, `BF`, `4F`) may be command
   opcodes (keyoff/rest/loop/jump). Resolved by decoding the `$25F2` event-
   dispatch branch (`$2627`-`$285F`) against cue 8 -- the active cue, whose state
   is fully captured in the dump (`$62DB`, `$62D2`, all 8 `track[+0B]` values at
   `$6184`). Bounded: a half-day against one cue pins the grammar.

2. THE POINTER-TABLE INTERLEAVING (low). The 8 tracks share one table at 2-byte
   offsets. Easy to mis-read as "8 separate tables." Mitigation: the dump gives
   all 8 `track[+0B]` values (`$B6D6`/`$B6D8`/.../`$B6E4`) -- the pattern is
   directly visible.

3. THE BOOT UPLOAD IS NOT A BLOCK COPY (low for the port). `pgm.py` `_z80_blob`
   could not find a long verbatim run for the Z80 program. This DOES NOT matter
   for C7: the port uses the resident z80ram.bin blob (already constructed), not
   the 68k-side source. It only matters if someone later wants to re-derive the
   blob from maincpu.bin alone (not required for the 979-keyon gate).

4. THE TEMPO/TIMELINE WARP (low, shared with C8). The BGM doors' lf->vf offset
   (~38 frames, W143 section 5) and the tempo-6 divider must line up so the
   first BGM keyon lands on the right vf. This is a C8 (historical-driver)
   concern; C7 only owes the SCHEDULER, the timeline is C8's gate.

# 7. THE EXPORT / SHIPPING DECISION

IS THE SCORE DATA ALREADY EXPORTED? No. The shipped sound asset today is
`assets/snd/sample.shard.u8.gz` (1.16 MB, the ICS samples) + `sample.index.json.gz`.
The score data is NOT in `assets/snd/` and NOT in the web build. The oracle TSVs
(`ics.tsv`, `keyon.tsv`) are ROM-derived but gitignored -- they are recon input,
NOT shipped. The score data, by contrast, IS needed at runtime to play BGM, so it
MUST ship.

DOES IT NEED A ROM WINDOW? No -- not in the banking sense. It needs a BUILD-TIME
extract step (parse the blob out of z80ram.bin or maincpu.bin) and a ship step.

SIZE: ~7.2 KB parsed (likely smaller as JSON if run-length-encoded). Trivial vs
the 1.16 MB sample shard.

ROM-LEAK GUARD: `build-dist.mjs`'s verbatim-art guard flags any shipped body that
is one contiguous ROM slice. A raw byte dump of `$A600`-`$C300` WOULD be flagged
(it is byte-identical to a maincpu.bin stretch). TWO clean options:
  (a) PREFERED: ship the PARSED JS/JSON structure (cues -> tracks -> events),
      not the raw bytes. This is a transformation, not a verbatim slice, so the
      guard passes -- same property `export-web.mjs` line 2403 relies on ("the
      guard asks whether the entire body is one slice; a 28-fragment stitch is
      not"). It also matches the existing pattern (`dispatch.js` ships tables).
  (b) FALLBACK: ship a rebased/stitched shard like the samples, with a
      deliberate-exception entry (W144 cited 6 existing exceptions; this would
      be a 7th). More work, no benefit over (a).

RECOMMENDATION: option (a). The parser in C7a produces the shipped artifact; no
new exception, no guard tension, ~7 KB added to the published slice.

# 8. SUMMARY (the four brief questions)

1. CUE-ID ROUTE: cmd `$12`/`$15`/`$11` -> handler -> `$2E38(cue_id,arg,flag)` ->
   bounds-check vs `[[$62E2]]`=11 -> `table[$62E4][$0070][cue_id]` -> per-cue
   data block -> `$62DB`/`$62DD`/tempo state -> `$25F2` per tick. `[$62E4]` is
   a FIXED table at `$0070` in the uploaded Z80 image (NOT runtime-banked).
2. NOTE STREAMS: resident in z80ram.bin at `$A626`-`$C1E9`; verbatim in maincpu.bin
   at `$1A91FC`-`$1AAC5B` (and a second copy at `$2AA7B6`+). Loaded via the boot
   `$C10000` upload (one-shot, NOT runtime paging). Format: per-cue block =
   [6-byte header][row stream][8-entry shared pointer table][note-event streams];
   events are `[note][dur][vel]` triples with `CF` section markers (full grammar
   is the one open decode).
3. 68k LOCATION: `$1A91FC`-`$1AAC5B` (build B; shared sound ROM). No absolute
   68k pointers -- the Z80-RAM image is constructed by the 68k upload routine.
   ~7.2 KB total.
4. `$25F2`: per-tick BGM scheduler (tempo divider 6), walks the row stream +
   8 tracks, resolves selectors to per-track params, dispatches keyon/keyoff via
   the SHARED Layer 2 (`$62EC` -> `$376C` -> `$37DB`/`$0B92`). Reuses C6's
   `emitKeyon`; the keyoff side is C5.

The highest-risk Wave C item is, after recon, a structured ~0.8-wave port whose
only genuine uncertainty is the note-event grammar (a half-day decode against
the captured cue 8). The banking dependency W143 named is real but is a boot-
time upload, fully captured in the dump -- NO Wave-A prerequisite blocks C7.
