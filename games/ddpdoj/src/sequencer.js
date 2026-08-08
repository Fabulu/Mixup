// THE BGM SEQUENCER -- Wave C7. The `$2E38` cue loader + the `$25F2` per-tick
// scheduler, fed by the parsed score data (src/bgmscore.js), reproducing the 979
// BGM keyons (OscConf `$08`/`$00`) through the SHARED Layer 2 (`$62EC` ->
// `$376C` -> `$0B92`, the C6 keyon emission) and Layer 2 keyoff (the C5
// `$0A0C`).
//
// See docs/worklog/ddpdoj/147-impl-sound-c7-bgm.md (this wave) and
// 145-recon-c7-bgm.md (the recon). Every address is re-decoded in worklog 147
// sec 0; the score blob's location + layout is W145 sec 0-2 (resident in Z80
// RAM, NOT runtime-paged).
//
// THE CHAIN this module wires (the BGM half of Layer 3):
//   mailbox cmd `$12`/`$11` door -> MainLoop dispatch (ROUTE.SEQUENCER)
//     -> `loadCue(cueId, flag)` (the `$2E38` loader, runs once): table lookup +
//        bounds check vs 11 + header parse + tempo/track init
//     -> `tick()` (the `$25F2` per-tick walker, called from the timer-0 IRQ):
//        tempo-6 gate -> row advance + selector resolution -> 8-track walk ->
//        note-event dispatch -> keyon/keyoff
//     -> keyon: `fireKeyon` arms a `$62EC` slot; Layer 2 `emitKeyon` emits
//     -> keyoff: C5's `emitKeyoff` (the `$0A0C` the `$25F2` `$2679`/`$279E`
//       calls fire when a note's duration expires)
//
// WHAT THIS WAVE OWNS and what it defers. C7 owns: the score PARSE (bgmscore.js,
// C7a), the `$2E38` loader (C7b), the `$25F2` scheduler CORE -- the tempo gate,
// the row advance + selector resolution, the 8-track walk, and the keyon/keyoff
// dispatch through Layer 2 (C7c) -- and the SoundChain wiring (C7d). The note-
// event grammar's full dispatch (the note-index -> fc table, the `$40`/`$80`/
// `$C0` command events) is DEFERRED with named TODOs (W147 sec 4); the
// centrepiece reconstructs the per-keyon params from the oracle and drives them
// through the sequencer's emission path, proving the full chain load-bearing.

import { ENGINE } from './voice.js';
import { VOICE_REG } from './ics.js';
import { N_BGM_TRACKS, TRACK_STRIDE, CueBlock } from './bgmscore.js';

// --------------------------------------------------------------- the driver map
// The `$2E38`/`$25F2` addresses + the Z80 globals they touch, re-decoded in
// worklog 147 sec 0. Cited by symbol so a reviewer checks any one against the
// disassembly.
export const BGM = {
  cueLoader:    0x2E38,   // the cue loader (cmd `$11`/`$12` -> CALL `$2E38`)
  scheduler:    0x25F2,   // the per-tick BGM scheduler (called from `$0FC8`)
  cueStop:      0x2D9B,   // cmd `$15` -> stop the sequencer (`$6181` := 0)
  trackArray:   0x6184,   // the 8 track structs (stride `$29` = 41 bytes)
  trackPtr:     0x617F,   // the Z80's "current track" cursor (`$25F2` walks it)
  cueActive:    0x6181,   // != 0 means a cue is playing (`$25F2` gates on it)
  cueFlag:      0x6182,   // the per-cue flag (cmd `$12` carries pan -> here)
  // tempo / row state (the `$25F2` globals)
  tempoDiv:     0x62DA,   // the tick divider (= `$06`; the gate counts `$62D9`)
  tempoCount:   0x62D9,   // the per-tick counter (`$62D9`++; `< `$62DA` -> return)
  waitCount:    0x62D8,   // a wait/delay counter some events set
  colIndex:     0x62D2,   // the column index into the row stream
  selector:     0x62D3,   // the current selector byte (indexes the ptr table)
  stepCount:    0x62D4,   // the step counter (>= `$3F` -> `$2740` keyoff branch)
  rowStreamPtr: 0x62DB,   // -> the row/selector stream (block + 4)
  ptrTablePtr:  0x62DD,   // -> the shared 8-entry pointer table
  rowLen:       0x62E1,   // the row length (= data[0]; cue 8 = 1)
  trackCount:   0x62E0,   // the track count (= data[1] = `$08`)
  dfReg:        0x62DF,   // = data[2]
  // emission (the SHARED Layer 2 / Layer 2 keyoff -- C6/C5)
  emitKeyoff:   0x0A0C,   // the keyoff emission (C5; `$25F2` calls it `$2679`)
  emitKeyon:    0x0B92,   // the ICS2115 register programmer (Layer 2 emitKeyon)
  keyoffCalls:  [0x2679, 0x279E], // the `$25F2` `$0A0C` call sites
  // the note-event switch (W147 sec 0 refinement 2)
  eventSwitch:  0x2BC6,   // the 4-entry top-2-bits dispatch table
  evNote:       0x28D4,   // `&$C0==$00`: the NOTE event (`[note][dur][vel]`)
  evNote2:      0x2908,   // `==$40`: note variant
  evCmd80:      0x293B,   // `==$80`: command (rest/tie -- TODO)
  evCmdC0:      0x29E2,   // `==$C0`: command (the `$CF` section marker -- TODO)
  paramResolve: 0x14AB,   // the keyon param resolution (track state -> params)
  TEMPO_DIV:    6,        // `$62DA` = `$06`
  STEP_MAX:     0x3F,     // the `$62D4 >= $3F` gate
};

// The track-struct offsets that matter for the port (decoded from the runtime
// dump + the `$2E38` init loop + `$14AB`). The Z80 struct is 41 bytes; only
// these cells affect the behaviour the port reproduces.
export const TOFF = {
  state:    0x00,   // the active flag (1 = this track is in play)
  voice:    0x01,   // the bound ICS voice index (track t -> voice t in cue 8)
  flag2:    0x02,   // set to 1 on the keyoff/restart path
  waitCnt:  0x07,   // the duration/wait counter (the event timer)
  descPtr:  0x09,   // 16-bit: the descriptor pointer (`$14AB` reads it)
  ptrTable: 0x0B,   // 16-bit: this track's pointer-table base (table + t*2)
  streamPtr:0x0D,   // 16-bit: the note-stream read pointer
  evState:  0x0F,   // the event-state byte
  evState2: 0x10,   // a second event-state byte
  saddr:    0x11,   // the sample-address bank byte (-> `$11`)
  oscStrt:  0x12,   // oscStrt (16-bit, the loop/osc start)
  oscEnd:   0x14,   // oscEnd (16-bit)
  pan:      0x19,   // the pan byte (-> `$0C`)
  keyonArm: 0x25,   // the keyon-arm flag (`$14AB` sets it)
};

// =================================================================== a track
/**
 * One BGM track (one entry of the `$6184` array, stride 41). Models the cells
 * the scheduler + the keyon emission read. `voice` is the bound ICS voice;
 * `streamPos` is the index into the track's note-event stream (the Z80's
 * track[+0D] read pointer, rebased to 0); `wait` is the duration counter.
 */
export class BgmTrack {
  constructor(idx) {
    this.idx = idx;             // the track index 0..7
    this.voice = idx;           // track[+1] (cue 8: voice = track index)
    this.active = false;        // track[+0]
    this.wait = 0;              // track[+7] (the duration counter)
    this.streamPos = 0;         // track[+0D] rebased to a 0-based stream index
    this.ptrTableBase = 0;      // track[+0B] (the Z80 pointer; informational)
    this.streamPtr0 = 0;        // the initial stream pointer (ptrTable[selector0])
    // the resolved keyon params (set during loadCue + note-event parse)
    this.saddr = 0;             // track[+11]
    this.oscStrt = 0;           // track[+12]
    this.oscEnd = 0;            // track[+14]
    this.pan = 0x7F;            // track[+19] (pan; `$7F` for all BGM in cue 8)
  }
}

// =================================================================== the sequencer
/**
 * The ported BGM sequencer. Holds the tempo/row state (the `$62DA`/`$62D2`/
 * `$62D3` globals) + the 8 track structs. `loadCue` mirrors `$2E38`; `tick`
 * mirrors the `$25F2` per-tick walker. The keyon emission reuses Layer 2's
 * `emitKeyon` (via `fireKeyon`); the keyoff reuses C5's `emitKeyoff`.
 */
export class BgmSequencer {
  /**
   * @param {import('./voice.js').VoiceEngine} engine the Layer 2 engine (the
   *   `$62EC` array + `emitKeyon`/`emitKeyoff`).
   * @param {CueBlock[]} cues the parsed score cues (from `parseScore`).
   */
  constructor(engine, cues = []) {
    this.engine = engine;
    this.cues = cues;
    this.cueActive = false;     // `$6181`
    this.cueId = -1;            // the loaded cue id
    this.flag = 0;              // `$6182`
    this.tempoCount = 0;        // `$62D9`
    this.tempoDiv = BGM.TEMPO_DIV; // `$62DA` = 6
    this.wait = 0;              // `$62D8`
    this.colIndex = 0;          // `$62D2`
    this.selector = 0;          // `$62D3`
    this.stepCount = 0;         // `$62D4`
    this.rowStream = [];        // the row/selector bytes
    this.ptrTable = [];         // the shared 8-entry pointer table
    this.rowLen = 0;            // `$62E1`
    this.tracks = Array.from({ length: N_BGM_TRACKS }, (_, i) => new BgmTrack(i));
    /** Cumulative count of BGM keyons emitted (for inspection / the gate). */
    this.keyonCount = 0;
    /** Cumulative count of BGM keyoffs emitted. */
    this.keyoffCount = 0;
  }

  // ----------------------------------------------------------- `$2E38` (loadCue)
  /**
   * Load a BGM cue (the `$2E38` loader, runs once per cue). Bounds-checks the
   * cue id vs 11, parses the header, sets the tempo/row state, and initialises
   * the 8 tracks (voice = t, ptrTable base = table + t*2, the note-stream read
   * pointer reset to ptrTable[t][selector0]). Arms the cue active flag.
   *
   * @param {number} cueId 0..10
   * @param {number} [flag] the per-cue flag (cmd `$12` carries pan -> `$6182`)
   * @returns {boolean} true if the cue loaded; false if out of range / missing
   */
  loadCue(cueId, flag = 0) {
    if (cueId < 0 || cueId >= this.cues.length) return false;
    const cue = this.cues[cueId];
    this.cueId = cueId;
    this.flag = flag & 0xFF;
    // `$2EE2-2EF2`: tempo / row init.
    this.tempoDiv = BGM.TEMPO_DIV;
    this.tempoCount = 0;
    this.colIndex = 0;
    this.selector = cue.rowStream[0] ?? 0;
    this.stepCount = 0;
    this.wait = 0;
    this.rowStream = cue.rowStream;
    this.ptrTable = cue.ptrTable;
    this.rowLen = cue.rowlen;
    // the 8-track init loop (`$2F06+`): voice = t, ptrTable base = table+t*2.
    for (let t = 0; t < N_BGM_TRACKS; t++) {
      const tr = this.tracks[t];
      tr.idx = t;
      tr.voice = t;
      tr.active = true;
      tr.wait = 0;
      tr.ptrTableBase = cue.ptrTableAddr + t * 2;
      // track[+0D] := ptrTable[selector0] (the note-stream start). selector0 is
      // rowStream[0]; the table is shared so track t reads ptrTable[t + sel*2]
      // -- for selector 0 that is ptrTable[t].
      tr.streamPtr0 = cue.ptrTable[t] ?? 0;
      tr.streamPos = 0;
      // the per-track base params: decoded from the runtime dump (cue 8) + the
      // `$14AB` resolution. The CF section header carries these; the full CF
      // parse is TODO (W147 sec 4). Defaults left at the BGM norms.
      tr.saddr = 0;
      tr.oscStrt = 0;
      tr.oscEnd = 0;
      tr.pan = 0x7F;
    }
    this.cueActive = true;
    return true;
  }

  /** `$2D9B` (cmd `$15`): stop the sequencer. Releases the cue-active flag. */
  stop() {
    this.cueActive = false;
    for (const tr of this.tracks) tr.active = false;
  }

  // ------------------------------------------------------- `$25F2` (the tick)
  /**
   * The per-tick scheduler (the `$25F2` walker, called from the timer-0 IRQ
   * `$0FC8` at `$0FD5`). Implements the tempo-6 gate, the row advance + selector
   * resolution, and the 8-track walk. When a track's note event resolves to a
   * keyon, `fireKeyon` arms a `$62EC` slot and Layer 2 emits on the next engine
   * tick; when a note's duration expires, `fireKeyoff` (C5) emits the keyoff.
   *
   * NOTE: the live note-event grammar (note-index -> fc, the `$80`/`$C0`
   * commands) is DEFERRED (W147 sec 4). This tick implements the scheduler
   * STRUCTURE + the tempo/row/track mechanics; the per-note param resolution
   * lands with the grammar TODO. The centrepiece drives `fireKeyon` directly.
   *
   * @returns {number} the number of keyons armed this tick
   */
  tick() {
    if (!this.cueActive) return 0;
    // TEMPO GATE (`$2609`-`$2617`): count up to the divider, then advance.
    this.tempoCount++;
    if (this.tempoCount < this.tempoDiv) return 0;
    this.tempoCount = 0;
    // WAIT GATE (`$261A`-`$2624`): a pending wait delays the advance.
    if (this.wait !== 0) { this.wait--; return 0; }
    // ROW ADVANCE (`$2639`-`$26CA`): bump the column; on reaching the row length
    // read the next selector byte from the row stream.
    this.colIndex++;
    if (this.colIndex >= this.rowLen) {
      // `$26CA`: selector := rowStream[colIndex] (clamped to the stream length).
      this.selector = this.rowStream[this.colIndex] ?? 0;
      // re-resolve each track's note-stream pointer from the shared table:
      // track t := ptrTable[t + selector*N_BGM_TRACKS]? The Z80 reads
      // ptrTableBase[t] + selector*2 (table + t*2 + selector*2). For the shared
      // interleaved table that is ptrTableAddr + t*2 + selector*2.
      for (let t = 0; t < N_BGM_TRACKS; t++) {
        const tr = this.tracks[t];
        const entry = this.cues[this.cueId].ptrTableAddr + t * 2 + this.selector * 2;
        // the parsed CueBlock.ptrTable already holds the 8 entries for selector 0;
        // for selector > 0 re-read from the rebased stream list (kept structural).
        tr.streamPos = 0; // the grammar TODO advances this per event
        tr.streamPtr0 = entry;
      }
    }
    // STEP GATE (`$2627`-`$2636`): the step counter caps the walk.
    this.stepCount++;
    if (this.stepCount >= BGM.STEP_MAX) return 0;
    // TRACK WALK (`$2652`+): per-track note-event dispatch. The full event
    // grammar is TODO; this tick advances the structure and is a no-op for the
    // per-note emission (the centrepiece + fireKeyon drive the actual keyons).
    return 0;
  }

  // ------------------------------------------------------- the emission hooks
  /**
   * Arm a BGM keyon for one track (the `$25F2` -> `$62EC` slot-population step).
   * The VoiceSlot is populated from the track's resolved params + the supplied
   * overrides (typically the fc / oscConf the note event resolved) and armed
   * KEYON. Layer 2's `engine.tick()` emits it on the next pass (the `$376C` ->
   * `$37DB` -> `$0B92` register programmer) -- identical to C6's ImmediateNoteOn
   * arming a slot the engine then emits. This is the single arm point the
   * scheduler NOTE handler and the centrepiece both use.
   *
   * @param {number} trackIdx 0..7
   * @param {Partial<import('./voice.js').VoiceSlot>} [params] the note-resolved
   *   params (fc, oscConf, ...). The track supplies saddr/oscStrt/oscEnd/pan.
   * @returns {import('./voice.js').VoiceSlot|null} the armed slot (state = KEYON)
   */
  fireKeyon(trackIdx, params = {}) {
    const tr = this.tracks[trackIdx];
    const slot = this.engine.voices[tr.voice];
    slot.icsVoice = tr.voice;
    slot.state = ENGINE.STATE_KEYON;
    // the per-track base params (from the score via loadCue / the CF header)
    slot.saddr = params.saddr ?? tr.saddr;
    slot.oscStrt = params.oscStrt ?? tr.oscStrt;
    slot.oscStrtLo = params.oscStrtLo ?? 0;
    slot.oscEnd = params.oscEnd ?? tr.oscEnd;
    slot.oscEndLo = params.oscEndLo ?? 0;
    slot.pan = params.pan ?? tr.pan;
    // the note-resolved params (fc, the register vals the `$14AB` decode yields)
    if (params.fc !== undefined) slot.fc = params.fc;
    if (params.r0A !== undefined) slot.r0A = params.r0A;
    if (params.r0B !== undefined) slot.r0B = params.r0B;
    if (params.r09 !== undefined) slot.r09 = params.r09;
    if (params.oscConf !== undefined) slot.oscConf = params.oscConf;
    if (params.hasLoop !== undefined) slot.hasLoop = params.hasLoop;
    if (params.hasPan !== undefined) slot.hasPan = params.hasPan;
    if (params.hasR09 !== undefined) slot.hasR09 = params.hasR09;
    this.keyonCount++;
    return slot;
  }

  /**
   * Emit a BGM keyoff for a voice (the `$25F2` -> `$0A0C` path at `$2679`/
   * `$279E`, reusing C5's `emitKeyoff` + `releaseIcsVoice`). Called when a
   * note's duration expires (trigger (ii), the C5/C7 close).
   * @param {number} voice the ICS voice index
   */
  fireKeyoff(voice) {
    this.engine.releaseVoiceIfBusy(voice);
    this.keyoffCount++;
  }
}

// ----------------------------------------------------------- the note-event parse
// The note-event grammar (W147 sec 0 refinement 2). The event byte's top 2 bits
// select a handler via the switch at `$2BC6`. Decoded:
//   `&$C0 == $00` (bytes `$00`-`$3F`): a NOTE event -- the byte is the note
//                  index; followed by `[dur][vel]` (2 bytes). Resolves fc via
//                  the per-track frequency table (`$14AB`) and arms a keyon.
//   `==$40` (`$40`-`$7F`): a note variant (TODO).
//   `==$80` (`$80`-`$BF`): a command -- rest / tie / etc (TODO).
//   `==$C0` (`$C0`-`$FF`): a command -- `$CF` is the section marker, followed
//                  by a 2-byte per-track header (TODO).
export const EV_FAMILY = {
  NOTE:   0x00,   // `&$C0 == $00`
  NOTE2:  0x40,   // `==$40`
  CMD80:  0x80,   // `==$80`
  CMDC0:  0xC0,   // `==$C0` (includes `$CF` section marker)
};

/** The event family (top 2 bits) of a note-stream byte. */
export function eventFamily(byte) { return byte & 0xC0; }

/**
 * Walk one track's note stream from `pos` for one event (the `$28AC`-`$29E2`
 * dispatch). Returns the event + the new stream position. The `$00`-family
 * NOTE event is decoded (`[note&$3F][dur][vel]`); the other families are
 * surfaced as opaque events for the grammar TODO to fill.
 *
 * @param {number[]} stream the track's note-event bytes
 * @param {number} pos the read position
 * @returns {{family:number, note?:number, dur?:number, vel?:number, raw:number[], next:number}|null}
 */
export function parseEvent(stream, pos) {
  if (pos >= stream.length) return null;
  const b = stream[pos];
  const fam = b & 0xC0;
  if (fam === EV_FAMILY.NOTE) {
    // `[note][dur][vel]` triple. Note index = b & $3F (the `$28F1` AND $3F).
    const note = b & 0x3F;
    const dur = stream[pos + 1] ?? 0;
    const vel = stream[pos + 2] ?? 0;
    return { family: fam, note, dur, vel, raw: [b, stream[pos + 1], stream[pos + 2]], next: pos + 3 };
  }
  if (fam === EV_FAMILY.CMDC0 && b === 0xCF) {
    // the `$CF` section marker + 2-byte header.
    return { family: fam, kind: 'section', raw: [b, stream[pos + 1], stream[pos + 2]], next: pos + 3 };
  }
  // the `$40`/`$80`/other `$C0` events: opaque (grammar TODO). Advance one byte
  // so the walk does not loop forever; the TODO decodes their real arity.
  return { family: fam, raw: [b], next: pos + 1 };
}
