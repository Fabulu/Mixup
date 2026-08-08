// THE Z80 VOICE ENGINE -- Wave C Layer 2.
//
// See docs/worklog/ddpdoj/141-impl-sound-wave-c2.md (this wave) and
// 135-sound-architect-plan.md section 2 (Wave C, Layer 2). Layer 1
// (src/ics.js, the ICS2115 register file) ships; this layer EMITS the register
// writes that Layer 1 consumes. Layer 3 (the cue dispatch) is the next wave.
//
// The engine is `$376C` in the uploaded Z80 program: a per-tick 32-voice update
// over the `$62EC` voice-state array, driven by INT `$0038` -> `$010B` (reads
// status `$8000`, bit0 = timer-0) -> `$0FC8` -> `$376C`. Every cited address is
// decoded in the worklog's premise check; the disassembler that produced it
// lives in tools/z80dis.py.
//
// WHAT THIS WAVE OWNS and what it defers. Layer 2 owns the engine CORE: the
// per-tick 32-voice walk, the ICS-voice allocator, and the register-write
// EMISSION CONTRACT (the keyon sequence + the per-tick refresh -- the two
// patterns that are the bulk of ics.tsv). Hardware-rate oscillator phase,
// boundary, sample and IRQ behavior lives in `ics2115.js`; it is not duplicated
// here at logic-frame granularity. The `$62EC` voice-state array
// is POPULATED BY THE CUE DISPATCH (Layer 3); Layer 2 advances and emits, so it
// is driven with reconstructed state in tests and with live cues once Layer 3
// lands.

import { ICS_PORT, N_VOICES, VOICE_REG, GLOB_REG } from './ics.js';

// --------------------------------------------------------------- the driver map
// The addresses below are decoded in worklog 141 section 0 and cited from the
// Wave B listing (z80.js). Restated here by symbol so the port names what it
// ports and a reviewer checks any one against the disassembly.
export const ENGINE = {
  voiceEngine:  0x376C,   // THE per-tick 32-voice update
  voiceArray:   0x62EC,   // per-voice state: 32 voices x 19 bytes ($62EC..$654B)
  voiceStride:  0x13,     // 19 bytes per voice struct
  icsShadow:    0x654E,   // ICS register shadow: 32 voices x 10 bytes
  icsShadowStride: 0x0A,  // 10 bytes per shadow record
  allocStart:   0x654D,   // round-robin voice-allocator search start
  acquire:      0x3E8F,   // the voice allocator (scans $654E for a free slot)
  cmpLE:        0x4231,   // carry iff HL <= DE (the 16-bit compare; loop bound)
  mul16:        0x4243,   // HL = HL * DE (the 16x16 multiply; array indexing)
  switchTable:  0x3B10,   // the 4-entry state-dispatch table
  switchDisp:   0x41D0,   // the switch dispatcher
  loopExit:     0x3B23,   // JP target when all 32 voices walked
  // the four state handlers (the switch arms)
  stKeyon:      0x37DB,   // state 1: keyon / voice start
  stRetrig:     0x3911,   // state 2: re-trigger / ramp-update
  stTransit:    0x3A47,   // state 3: transition
  stSustain:    0x3A56,   // state 4: sustain / phase+volume advance
  // the four state byte values (the switch keys, from the table at $3B10)
  STATE_KEYON:    1,
  STATE_RETRIG:   2,
  STATE_TRANSIT:  3,
  STATE_SUSTAIN:  4,
  // THE KEYOFF PATH (Wave C5). Decoded in worklog 146 sec 0; re-decoded out of
  // z80ram.bin instruction-by-instruction. The keyoff closes the allocator
  // cycle ($3E8F alloc -> ... -> $3F11 free) and is fired by TWO triggers (W143
  // TODO 3): (i) the oscillator-end IRQ ($0F IRQV, this wave) and (ii) the BGM
  // sequencer note-duration ($25F2, the C7 wave -- DEFERRED, TODO in tick()).
  emitKeyoff:   0x0A0C,   // the keyoff register-write emission (stops a voice)
  freeShadow:   0x3F11,   // free the $654E ICS shadow slot (shadow[voice][0] = 0)
  releaseBusy:  0x3F22,   // release-if-busy: if shadow[voice][0], $0A0C + free
  irqEntry:     0x0FEA,   // the oscillator-end IRQ entry (status bit1 -> $0FEA)
  irqvDispatch: 0x1000,   // the $0F IRQV read + keyoff dispatch loop
  irqvReg:      0x000F,   // the IRQ-voice register number ($0F)
  oscIrqBit:    0x02,     // status $8000 bit1 -> oscillator-end IRQ ($0FEA)
  timerIrqBit:  0x01,     // status $8000 bit0 -> timer-0 tick ($0FC8)
};

// The switch table at $3B10: {stateByte -> handler} (decoded: stride 4, 4 arms).
export const STATE_HANDLER = {
  1: ENGINE.stKeyon,
  2: ENGINE.stRetrig,
  3: ENGINE.stTransit,
  4: ENGINE.stSustain,
};

// --------------------------------------------------------------- a voice slot
// One entry of the $62EC array. The Z80 struct is 19 bytes; the first byte is
// the STATE the engine dispatches on, byte +4 holds the bound ICS voice index,
// and the cue-supplied parameters live at +5..+0C. The exact struct-offset ->
// register mapping inside the $0B92/$0CF1 buffered-write helpers is DEFERRED
// (a later wave traces them); this wave models the slot by the REGISTER values
// it emits, which is what the oracle verifies. Field offsets decoded from the
// disassembly are named below for the trace that follows.
export const VOFF = {
  state:    0x00,   // the dispatch state byte (1=keyon, 2=retrig, 3=transit, 4=sustain)
  icsVoice: 0x04,   // the bound ICS voice index (0..31), set by acquireIcsVoice
  // 0x05..0x0C: cue-supplied register parameters (offsets decoded; full
  // mapping deferred). Named by the register they emit.
};
export const STRIDE = ENGINE.voiceStride;   // 19

/**
 * One voice slot. Holds the state byte and the register values the engine
 * emits. `active` is the engine's test for "this slot is in play" (state != 0);
 * the Z80 skips a slot whose state byte is 0 (`LD A,(HL); AND A; JR Z` at
 * $37C1, which jumps to the loop increment).
 */
export class VoiceSlot {
  constructor() {
    this.state = 0;        // the $62EC state byte
    this.icsVoice = -1;    // the bound ICS voice (allocated by `$37DB` at keyon)
    this.selector = -1;    // slot +$02: 10-bit selector matched by `$34FB`
    // Register values this slot emits (the cue payload, mirrored from the
    // struct offsets the engine reads). Named by ICS register.
    this.fc = 0;           // $01 OscFC (16-bit)
    this.saddr = 0;        // $11 Saddr (8-bit)
    this.r0B = 0;          // $0B (16-bit; accumulator/volume candidate)
    this.r0A = 0;          // $0A (16-bit)
    this.oscStrt = 0;      // $02 OscStrt hi+mid (16-bit) -- emitted when hasLoop
    this.oscStrtLo = 0;    // $03 OscStrt lo (16-bit)    -- emitted when hasLoop
    this.oscEndLo = 0;     // $05 OscEnd lo (16-bit)
    this.oscEnd = 0;       // $04 OscEnd hi+mid (16-bit)
    this.pan = 0;          // $0C OscPan (8-bit)         -- emitted when hasPan
    this.r09 = 0;          // $09 (16-bit)               -- emitted when hasR09
    this.oscConf = 0;      // $00 OscConf (8-bit)
    this.hasLoop = true;   // emit $02/$03 loop-start span (false for ~361 keyons)
    this.hasPan = true;    // emit $0C
    this.hasR09 = true;    // emit $09
  }
  /** The engine skips slots whose state byte is zero. */
  get active() { return this.state !== 0; }
}

// --------------------------------------------------------------- write helpers
// The Layer 1 IcsRegisterFile consumes the (port, data) protocol. These helpers
// drive it the same way the Z80's register primitives do, so Layer 1 logs the
// same (voice, reg, half, data) tuples ics.tsv carries. See ics.js + worklog 139.
//
//   writeReg16(reg, lo, hi):  sel reg, lo, hi   (16-bit regs, both lanes)
//   writeReg8hi(reg, hi):     sel reg, hi       (8-bit regs, HI lane only)
//   selectVoice(v):           sel $4F, lo=v     (the $4F voice-select)

function selectReg(rf, reg) { rf.write(ICS_PORT.regSel, reg); }
function writeLo(rf, data) { rf.write(ICS_PORT.dataLo, data); }
function writeHi(rf, data) { rf.write(ICS_PORT.dataHi, data); }

function writeReg16(rf, reg, lo, hi) {
  selectReg(rf, reg);
  writeLo(rf, lo);
  writeHi(rf, hi);
}

function writeReg8hi(rf, reg, hi) {
  selectReg(rf, reg);
  writeHi(rf, hi);
}

function selectVoice(rf, v) {
  // $4F is a LO-lane voice-select: writing the voice number to the lo lane sets
  // currentVoice (Layer 1 _dataWrite handles $4F specially).
  selectReg(rf, GLOB_REG.voiceSel);
  writeLo(rf, v);
}

// =================================================================== the engine
/**
 * The ported voice engine. Holds the 32-voice `$62EC` array, the `$654E` ICS
 * register shadow, and the round-robin allocator start. `rf` is the Layer 1
 * IcsRegisterFile the engine emits into (the write sink).
 */
export class VoiceEngine {
  constructor(rf) {
    this.rf = rf;
    this.voices = Array.from({ length: N_VOICES }, () => new VoiceSlot());
    // The $654E ICS register shadow: 32 records of 10 bytes. shadow[v][0]==0
    // means the ICS voice is free (the allocator's test).
    this.icsShadow = Array.from({ length: N_VOICES }, () => new Uint8Array(ENGINE.icsShadowStride));
    this.allocStart = 8;   // $654D init (the allocator reseeds this to 8 on wrap)
  }

  /**
   * Acquire a free ICS voice (the `$3E8F` allocator). Round-robin scan of the
   * `$654E` shadow starting at `allocStart`, wrapping at 32, for the first slot
   * whose shadow[0]==0. Mark it with `marker` and return its index. Mirrors the
   * Z80: reseeds `$654D` to the next index, wrapping to 8 at 32.
   * @param {number} marker the byte to mark the shadow slot non-free
   * @returns {number} the ICS voice index 0..31
   */
  acquireIcsVoice(marker = 1) {
    for (let step = 0; step < N_VOICES; step++) {
      const v = (this.allocStart + step) % N_VOICES;
      if (this.icsShadow[v][0] === 0) {
        this.icsShadow[v][0] = marker & 0xFF;
        // Advance the round-robin start past the allocated voice, wrapping to 8
        // at 32 (the Z80 reseeds $654D to 8 on overflow: worklog 141 sec 0).
        this.allocStart = (v + 1) >= N_VOICES ? 8 : (v + 1);
        return v;
      }
    }
    throw new Error('voice: acquireIcsVoice -- no free ICS voice (all 32 in use)');
  }

  /** `$311C`: first inactive logical `$62EC` slot, independent of ICS voice. */
  acquireSlot() {
    const slot = this.voices.find((candidate) => !candidate.active);
    if (!slot) throw new Error('voice: $311C has no free logical voice slot');
    return slot;
  }

  /** `$0E55`: write one active ICS voice's OscFC register immediately. */
  writeVoiceFrequency(voice, value) {
    selectVoice(this.rf, voice);
    writeReg16(this.rf, VOICE_REG.fc, value & 0xff, (value >> 8) & 0xff);
  }

  /** `$0E81`: write one active ICS voice's converted volume immediately. */
  writeVoiceVolume(voice, value) {
    selectVoice(this.rf, voice);
    writeReg16(this.rf, 0x09, value & 0xff, (value >> 8) & 0xff);
  }

  /** `$3E6D/$0EB8`: reserve one fixed BGM voice and install pan/start level. */
  initializeBgmVoice(voice, pan) {
    if (!Number.isInteger(voice) || voice < 0 || voice >= N_VOICES) {
      throw new RangeError(`voice: BGM voice ${voice} is outside 0..31`);
    }
    this.icsShadow[voice][0] = 2;
    selectVoice(this.rf, voice);
    writeReg8hi(this.rf, VOICE_REG.pan, pan & 0xff);
    writeReg16(this.rf, 0x06, 0x3f, 0x00);
  }

  /**
   * Emit the keyon register-write sequence for one voice slot (the state-1
   * handler's emission contract). This is the INVARIANT order every keyon in
   * ics.tsv follows (verified 1620/1620), ending in the hard `$0D=03` then
   * `$10=00` pair. Optional spans ($02/$03 loop-start, $0C pan, $09) are gated
   * by the slot's flags.
   *
   * The order (decoded from the oracle; see worklog 141 section 0):
   *   $4F/lo  $01  $11  $0B  $0A  [$03 $02]  $05  $04  [$0C]  [$09]  $00  $0D=03  $10=00
   */
  emitKeyon(slot) {
    const rf = this.rf;
    const v = slot.icsVoice;
    selectVoice(rf, v);                                   // $4F/lo = voice
    writeReg16(rf, VOICE_REG.fc, slot.fc & 0xFF, (slot.fc >> 8) & 0xFF);  // $01
    writeReg8hi(rf, VOICE_REG.saddr, slot.saddr);         // $11
    writeReg16(rf, 0x0B, slot.r0B & 0xFF, (slot.r0B >> 8) & 0xFF);        // $0B
    writeReg16(rf, 0x0A, slot.r0A & 0xFF, (slot.r0A >> 8) & 0xFF);        // $0A
    if (slot.hasLoop) {
      writeReg16(rf, VOICE_REG.oscStrtLo, slot.oscStrtLo & 0xFF, (slot.oscStrtLo >> 8) & 0xFF); // $03
      writeReg16(rf, VOICE_REG.oscStrt, slot.oscStrt & 0xFF, (slot.oscStrt >> 8) & 0xFF);       // $02
    }
    writeReg16(rf, VOICE_REG.oscEndLo, slot.oscEndLo & 0xFF, (slot.oscEndLo >> 8) & 0xFF);  // $05
    writeReg16(rf, VOICE_REG.oscEnd, slot.oscEnd & 0xFF, (slot.oscEnd >> 8) & 0xFF);        // $04
    if (slot.hasPan) {
      writeReg8hi(rf, VOICE_REG.pan, slot.pan);           // $0C
    }
    if (slot.hasR09) {
      writeReg16(rf, 0x09, slot.r09 & 0xFF, (slot.r09 >> 8) & 0xFF);  // $09
    }
    writeReg8hi(rf, VOICE_REG.oscConf, slot.oscConf);     // $00
    writeReg8hi(rf, VOICE_REG.vCtl, 0x03);                // $0D = 03 (arm/fire)
    writeReg8hi(rf, VOICE_REG.oscCtl, 0x00);              // $10 = 00 (keyon)
    // Post-keyon the Z80 transitions the slot to the sustain/refresh state.
    slot.state = ENGINE.STATE_SUSTAIN;
  }

  /**
   * Emit the per-tick sustain refresh for one voice slot (the state-4 emission,
   * the dominant output of the engine and the bulk of ics.tsv): select the
   * voice, then re-emit its OscFC. The fixed order, decoded from the oracle:
   *   sel $4F, lo $4F=voice, sel $01, lo $01=fc_lo, hi $01=fc_hi
   *
   * TODO(later-wave): advance the pitch accumulator (oscAcc) here and derive fc
   * from it; this wave emits the current fc (the value the cue/ramp left).
   */
  emitRefresh(slot) {
    const rf = this.rf;
    selectVoice(rf, slot.icsVoice);                       // sel $4F, lo $4F=voice
    writeReg16(rf, VOICE_REG.fc, slot.fc & 0xFF, (slot.fc >> 8) & 0xFF);  // sel $01, lo, hi
  }

  // == THE KEYOFF PATH (Wave C5) =============================================
  // The `$0A0C` emission + the `$3F11` free + the oscillator-end trigger. See
  // worklog 146. The keyoff reuses the Layer 1 IcsRegisterFile write sink (the
  // same path emitKeyon feeds), so the oracle sees the same (voice, reg, half,
  // data) tuples the real Z80 produces.

  /**
   * Emit the keyoff register-write sequence for one voice slot (the `$0A0C`
   * emission contract). This is the INVARIANT 15-row sequence every keyoff in
   * ics.tsv follows (verified 1720/1720), decoded row-for-row from the oracle:
   *   sel $4F, lo $4F=V, sel $0D (read), sel $0D, hi $0D=masked,
   *   sel $07, hi $07=01, sel $08, hi $08=01, sel $10, hi $10=0F,
   *   sel $0D (re-read), sel $0D, hi $0D=03, sel $00, hi $00=00
   *
   * The current VCtl is READ from the Layer 1 shadow (`$0D` of the voice) and
   * masked: `vctl & $C3`, with bit0 set when bit1 was set. The double `$0D` sel
   * (sel,sel,hi) is the read-then-write artifact: `$0A0C` reads `$0D` via `$028E`
   * (one sel row) before writing it via `$02A4` (a second sel row). The `$00=$00`
   * tail fires when the masked VCtl has bit0 set (always true in stage 1: the
   * masked value is `$01`). Post-emission the slot returns to idle (state 0).
   *
   * See worklog 146 sec 0-1. TODO(Wave E): the 29-bit oscAcc handshake the
   * `$0A5F JR Z` spin waits on is modelled as immediate (the chip acks within
   * the IRQ); the spin never loops in the stage-1 corpus.
   */
  emitKeyoff(slot) {
    const rf = this.rf;
    const v = slot.icsVoice;
    selectVoice(rf, v);                                         // sel $4F, lo $4F
    // READ $0D (the VCtl) from the Layer 1 shadow, mask it the way $0A0C does.
    const vctl = rf.voices[v].u8(VOICE_REG.vCtl);
    let masked = vctl & 0xC3;
    if (masked & 0x02) masked |= 0x01;
    // read-then-write $0D (sel,sel,hi): the read's sel + the write's sel + hi.
    selectReg(rf, VOICE_REG.vCtl);                              // sel $0D (the READ)
    writeReg8hi(rf, VOICE_REG.vCtl, masked);                    // sel $0D, hi $0D = masked
    writeReg8hi(rf, 0x07, 0x01);                                // $07 = 01 (VolLo)
    writeReg8hi(rf, 0x08, 0x01);                                // $08 = 01 (VolHi)
    writeReg8hi(rf, VOICE_REG.oscCtl, 0x0F);                    // $10 = 0F (OscCtl = KEYOFF)
    // re-READ $0D (the $0A52 read that gates the optional $00 tail), then re-arm.
    selectReg(rf, VOICE_REG.vCtl);                              // sel $0D (the re-READ)
    writeReg8hi(rf, VOICE_REG.vCtl, 0x03);                      // sel $0D, hi $0D = 03 (re-arm)
    if (masked & 0x01) {                                        // bit0 set -> $00 = 00
      writeReg8hi(rf, VOICE_REG.oscConf, 0x00);                 // sel $00, hi $00 = 00
    }
    // Post-keyoff the slot is idle; the caller frees the shadow ($3F11).
    slot.state = 0;
  }

  /**
   * Free the ICS shadow slot for `voice` (the `$3F11` routine). Zeroes
   * `shadow[voice][0]`, the byte the `$3E8F` allocator tests for "free". This
   * closes the allocator cycle: `$3E8F` alloc -> ... -> `$3F11` free. Decoded:
   * `HL = voice*10 + $654E; (HL) = 0` (the mul16 $4243 + the $654E base).
   */
  releaseIcsVoice(v) {
    this.icsShadow[v][0] = 0;
  }

  /**
   * The `$3F22` "release if busy" composite: if `shadow[voice][0] != 0` (the
   * voice is still bound), run the keyoff emission THEN free the shadow. This is
   * the path the boot release-all (vf=5, the 95 orphan keyoffs) and the
   * sequencer's explicit note-off use. The slot is looked up by ICS voice index;
   * a voice not currently bound is a no-op (matches `$3F3E JR Z` skip).
   */
  releaseVoiceIfBusy(v) {
    if (this.icsShadow[v][0] === 0) return false;
    // `$62EC` logical slots and `$654E` ICS voices are separate arrays. Find
    // the logical owner rather than treating both indices as interchangeable.
    const slot = this.voices.find((candidate) => candidate.active
      && candidate.icsVoice === v) ?? this.voices[v];
    slot.icsVoice = v;
    this.emitKeyoff(slot);
    this.releaseIcsVoice(v);
    return true;
  }

  /**
   * The per-tick 32-voice walk (the `$376C` main loop, called from the timer-0
   * IRQ `$0FC8` at `$0FD8`). For each active slot, dispatch on the state byte and
   * emit. Implements the SUSTAIN refresh (state 4) and the KEYON emission (state
   * 1); states 2 and 3 fall through to the refresh for now (their full ramp math
   * is deferred). The loop walks voices in index order, the way the Z80 does.
   *
   * KEYOFF is NOT dispatched from this walk: the oscillator-end keyoff is a
   * SEPARATE IRQ path (status bit1 -> `$0FEA` -> `$1000`). `ics2115.js` now owns
   * the hardware-rate phase and IRQV state; `SoundRuntime` wires each completed
   * native-frame IRQV result back to this exact `releaseVoiceIfBusy` path.
   *
   * TODO(later-wave): the state-2/3/4 accumulator advances (oscAcc phase ramp,
   * volAcc volume ramp toward vEnd at vIncr).
   * TODO(C7 wave): trigger (ii) -- wire `$25F2`'s note-duration expiry to
   * `emitKeyoff` for the BGM keyoffs (the `$2679` call site).
   */
  tick() {
    for (let i = 0; i < N_VOICES; i++) {
      const slot = this.voices[i];
      if (!slot.active) continue;   // the $37C1 `AND A; JR Z` skip
      switch (slot.state) {
        case ENGINE.STATE_KEYON:
          if (slot.icsVoice < 0) slot.icsVoice = this.acquireIcsVoice(0x04);
          this.emitKeyon(slot);
          break;
        case ENGINE.STATE_RETRIG:   // TODO: full re-trigger path
        case ENGINE.STATE_TRANSIT:  // TODO: full transition path
        case ENGINE.STATE_SUSTAIN:
          this.emitRefresh(slot);
          break;
        default:
          // Unknown state: the Z80 default-arms the switch to loop (no work).
          break;
      }
    }
  }
}
