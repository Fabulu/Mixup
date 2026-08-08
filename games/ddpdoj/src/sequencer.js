// Live Z80 BGM Layer 3 driver (W153).
//
// Score bytes mutate the 41-byte `$6184` track records, the 16-entry `$4316`
// table advances those records, and `$14AB/$15B3` resolve immutable descriptor
// and pitch parameters into ICS register writes. No oracle keyon history is a
// production input.

import { VoiceSlot } from './voice.js';
import { N_BGM_TRACKS, TRACK_STRIDE } from './bgmscore.js';

export const BGM = Object.freeze({
  cueLoader: 0x2e38, scheduler: 0x25f2, cueStop: 0x2d9b,
  trackArray: 0x6184, trackPtr: 0x617f, cueActive: 0x6181,
  cueFlag: 0x6182, tempoDiv: 0x62da, tempoCount: 0x62d9,
  waitCount: 0x62d8, colIndex: 0x62d2, selector: 0x62d3,
  stepCount: 0x62d4, rowStreamPtr: 0x62db, ptrTablePtr: 0x62dd,
  rowLen: 0x62e1, trackCount: 0x62e0, dfReg: 0x62df,
  emitKeyoff: 0x0a0c, emitKeyon: 0x15b3,
  eventSwitch: 0x2bc6, paramResolve: 0x14ab,
  TEMPO_DIV: 6, STEP_MAX: 0x3f,
});

export const STATE_HANDLER_ADDRS = Object.freeze([
  0x1d2e, 0x1df6, 0x1e3b, 0x1e7e, 0x1e9b, 0x1ee4, 0x1eeb, 0x1ef2,
  0x1f3b, 0x1f3c, 0x1f84, 0x1f88, 0x1fe5, 0x2037, 0x245a, 0x247a,
]);

export const STATE14_HANDLER_ADDRS = Object.freeze([
  0x1f3b, 0x20d1, 0x212c, 0x2189, 0x219d, 0x21c0, 0x2229, 0x2277,
  0x1f3b, 0x22a9, 0x22e5, 0x234c, 0x23b0, 0x23f3, 0x243d, 0x1f3b,
]);

export const TOFF = Object.freeze({
  active: 0x00, voice: 0x01, keyoffArm: 0x02, level: 0x03,
  fcDirty: 0x04, volumeDirty: 0x05, baseLevel: 0x06, waitCnt: 0x07,
  descriptor: 0x08, descPtr: 0x09, ptrTable: 0x0b, streamPtr: 0x0d,
  evState: 0x0f, evState2: 0x10, note: 0x11,
  currentPeriod: 0x12, targetPeriod: 0x14, basePeriod: 0x16,
  pitchRate: 0x18, quantize: 0x19,
  pitchPhase: 0x1a, pitchStep: 0x1b, pitchDepth: 0x1c,
  volumePhase: 0x1d, volumeStep: 0x1e, volumeDepth: 0x1f,
  flags: 0x20, modifier: 0x21, keyonArm: 0x25,
  retrigger: 0x26, fcReg: 0x27,
});

function integer(name, value, lo, hi) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new RangeError(`BGM driver: ${name} must be in ${lo}..${hi}`);
  }
  return value;
}
const u8 = (track, offset) => track.raw[offset];
const set8 = (track, offset, value) => { track.raw[offset] = value & 0xff; };
const u16 = (track, offset) => track.raw[offset] | (track.raw[offset + 1] << 8);
const set16 = (track, offset, value) => {
  track.raw[offset] = value & 0xff;
  track.raw[offset + 1] = (value >>> 8) & 0xff;
};
const u32 = (track, offset) => (track.raw[offset]
  | (track.raw[offset + 1] << 8) | (track.raw[offset + 2] << 16)
  | (track.raw[offset + 3] << 24)) >>> 0;
const set32 = (track, offset, value) => {
  const v = value >>> 0;
  for (let i = 0; i < 4; i++) track.raw[offset + i] = (v >>> (i * 8)) & 0xff;
};

export class BgmTrack {
  constructor(idx) {
    this.idx = idx;
    this.raw = new Uint8Array(TRACK_STRIDE);
    this.ptrTableBase = 0;
    this.streamStart = 0;
    this.streamPos = 0;
    this.stream = Object.freeze([]);
    this.slot = new VoiceSlot();
  }
  get active() { return u8(this, TOFF.active) !== 0; }
  set active(value) { set8(this, TOFF.active, value ? 1 : 0); }
  get voice() { return u8(this, TOFF.voice); }
  set voice(value) { set8(this, TOFF.voice, value); this.slot.icsVoice = value; }
  get wait() { return u8(this, TOFF.waitCnt); }
  set wait(value) { set8(this, TOFF.waitCnt, value); }
}

export const EV_FAMILY = Object.freeze({
  WAIT: 0x00, STATE: 0x40, NOTE_DESCRIPTOR: 0x80, CONTROL: 0xc0,
  NOTE: 0x00, NOTE2: 0x40, CMD80: 0x80, CMDC0: 0xc0,
});
export const C0_FAMILY = Object.freeze({ COMBINED: 0x00, NOTE: 0x10,
  DESCRIPTOR: 0x20, COMBINED_F: 0x30 });

export function eventFamily(byte) { return byte & 0xc0; }

function eventBytes(stream, pos, count) {
  if (!Array.isArray(stream) || !Number.isInteger(pos) || pos < 0
    || pos + count > stream.length) {
    throw new RangeError(`BGM event at ${pos} is truncated (needs ${count} bytes)`);
  }
  return stream.slice(pos, pos + count);
}

/** `$28AC-$2BB8`: decode exactly one live event and its exact arity. */
export function parseEvent(stream, pos) {
  if (pos >= stream.length) return null;
  const first = stream[pos];
  const family = eventFamily(first);
  if (family === EV_FAMILY.WAIT) {
    const raw = eventBytes(stream, pos, 1);
    return { family, kind: 'wait', wait: first & 0x3f, raw, next: pos + 1 };
  }
  if (family === EV_FAMILY.STATE) {
    const raw = eventBytes(stream, pos, 2);
    return { family, kind: 'state', state: first & 0x0f,
      parameter: raw[1], raw, next: pos + 2 };
  }
  if (family === EV_FAMILY.NOTE_DESCRIPTOR) {
    const raw = eventBytes(stream, pos, 2);
    return { family, kind: 'noteDescriptor', state: 8,
      note: first & 0x3f, descriptor: raw[1], raw, next: pos + 2 };
  }
  const secondary = first & 0x30;
  const count = secondary === C0_FAMILY.NOTE || secondary === C0_FAMILY.DESCRIPTOR
    ? 3 : 4;
  const raw = eventBytes(stream, pos, count);
  const result = { family, secondary, state: first & 0x0f,
    parameter: raw[1], raw, next: pos + count };
  if (secondary !== C0_FAMILY.DESCRIPTOR) result.note = raw[2];
  if (secondary !== C0_FAMILY.NOTE) result.descriptor = raw[count - 1];
  result.kind = secondary === C0_FAMILY.NOTE ? 'controlNote'
    : secondary === C0_FAMILY.DESCRIPTOR ? 'controlDescriptor' : 'controlCombined';
  return result;
}

const clearEvent = (track) => {
  set8(track, TOFF.evState, 0);
  set8(track, TOFF.evState2, 0);
};

function requireParams(params) {
  if (!params || typeof params.bgm !== 'function' || typeof params.pitch !== 'function'
    || typeof params.frequency !== 'function' || typeof params.volume !== 'function') {
    throw new Error('BGM driver: validated driver parameters are not loaded');
  }
  return params;
}

/** `$4316`: execute one of the 16 live track-state handlers. */
export function applyStateHandler(index, track, driver) {
  integer('state handler', index, 0, 15);
  const parameter = u8(track, TOFF.evState2);
  const low = parameter & 0x0f;
  const high = parameter >>> 4;
  switch (index) {
    case 0: { // `$1D2E`: three-phase arpeggio.
      if (parameter === 0) break;
      const phase = driver.tempoCount % 3;
      const note = u8(track, TOFF.note) + (phase === 1 ? high : phase === 2 ? low : 0);
      set16(track, TOFF.currentPeriod, driver.pitchFor(track, note));
      set8(track, TOFF.fcDirty, 1);
      driver.handlerDirty = 1;
      break;
    }
    case 1:
      if (driver.tempoCount !== 0) {
        set16(track, TOFF.targetPeriod, u16(track, TOFF.targetPeriod) - parameter);
        set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
        set8(track, TOFF.fcDirty, 1);
      }
      break;
    case 2:
      if (driver.tempoCount !== 0) {
        set16(track, TOFF.targetPeriod, u16(track, TOFF.targetPeriod) + parameter);
        set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
        set8(track, TOFF.fcDirty, 1);
      }
      break;
    case 3:
      if (parameter !== 0) set8(track, TOFF.pitchRate, parameter);
      driver.pitchSlide(track);
      break;
    case 4:
      if (low !== 0) set8(track, TOFF.pitchDepth, low);
      if (high !== 0) set8(track, TOFF.pitchStep, high);
      set8(track, TOFF.evState2, 0);
      driver.pitchModulation(track);
      break;
    case 5:
      driver.pitchSlide(track);
      driver.levelSweep(track);
      break;
    case 6:
      driver.pitchModulation(track);
      driver.levelSweep(track);
      break;
    case 7:
      if (low !== 0) set8(track, TOFF.volumeDepth, low);
      if (high !== 0) set8(track, TOFF.volumeStep, high);
      set8(track, TOFF.evState2, 0);
      driver.volumeModulation(track);
      break;
    case 8:
      break;
    case 9:
      set32(track, TOFF.modifier, parameter << 8);
      clearEvent(track);
      break;
    case 10:
      driver.levelSweep(track);
      break;
    case 11:
      driver.rowJump(track, parameter);
      break;
    case 12:
      set8(track, TOFF.baseLevel, parameter);
      clearEvent(track);
      set8(track, TOFF.level, u8(track, TOFF.baseLevel));
      set8(track, TOFF.volumeDirty, 1);
      break;
    case 13:
      driver.groupJump(track, parameter);
      break;
    case 14:
      applyState14(high, track, driver, low);
      break;
    case 15:
      if (parameter !== 0) {
        if (parameter < 0x20) driver.tempoDiv = parameter;
        else driver.raw616c = parameter;
      }
      clearEvent(track);
      break;
  }
}

function applyState14(index, track, driver, low) {
  switch (index) {
    case 0: case 8: case 15:
      break;
    case 1:
      set16(track, TOFF.targetPeriod, u16(track, TOFF.targetPeriod) - low);
      set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
      set8(track, TOFF.fcDirty, 1); clearEvent(track); break;
    case 2:
      set16(track, TOFF.targetPeriod, u16(track, TOFF.targetPeriod) + low);
      set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
      set8(track, TOFF.fcDirty, 1); clearEvent(track); break;
    case 3:
      set8(track, TOFF.quantize, low); break;
    case 4:
      set8(track, TOFF.flags, (u8(track, TOFF.flags) & 0xf0) | low); break;
    case 5:
      set16(track, TOFF.targetPeriod, driver.pitchFor(track, u8(track, TOFF.note), low));
      set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
      set8(track, TOFF.fcDirty, 1); clearEvent(track); break;
    case 6:
      if (low !== 0) {
        if (driver.repeatCount !== 0) driver.repeatCount--;
        else driver.repeatCount = low;
        if (driver.repeatCount !== 0) driver.deferredRow = 1;
        else driver.deferredStep = (driver.stepCount - 1) & 0xff;
      }
      clearEvent(track); break;
    case 7:
      set8(track, TOFF.flags, (u8(track, TOFF.flags) & 0x0f) | (low << 4)); break;
    case 9: {
      if (low === 0) break;
      if (u8(track, TOFF.retrigger) === 0) {
        set8(track, TOFF.keyonArm, 1);
        set8(track, TOFF.retrigger, low);
      }
      set8(track, TOFF.retrigger, u8(track, TOFF.retrigger) - 1);
      break;
    }
    case 10:
      set8(track, TOFF.baseLevel, Math.min(0x40, u8(track, TOFF.baseLevel) + low));
      clearEvent(track); set8(track, TOFF.level, u8(track, TOFF.baseLevel));
      set8(track, TOFF.volumeDirty, 1); break;
    case 11:
      set8(track, TOFF.baseLevel, Math.max(0, u8(track, TOFF.baseLevel) - low));
      clearEvent(track); set8(track, TOFF.level, u8(track, TOFF.baseLevel));
      set8(track, TOFF.volumeDirty, 1); break;
    case 12:
      set8(track, TOFF.keyonArm, 0); set8(track, TOFF.keyoffArm, 0);
      set8(track, TOFF.level, 0); set8(track, TOFF.baseLevel, 0);
      set8(track, TOFF.volumeDirty, 1); set8(track, TOFF.fcDirty, 0);
      clearEvent(track); break;
    case 13:
      if (driver.tempoCount < low) set8(track, TOFF.keyonArm, 0);
      else { set8(track, TOFF.keyonArm, 1); clearEvent(track); }
      break;
    case 14:
      driver.wait = low; clearEvent(track); break;
  }
}

export class BgmSequencer {
  constructor(engine, cues = [], driverParams = null) {
    this.engine = engine;
    this.cues = cues;
    this.params = driverParams;
    this.tracks = Array.from({ length: N_BGM_TRACKS }, (_, i) => new BgmTrack(i));
    this.cueActive = false;
    this.activeMode = 0;
    this.cueId = -1;
    this.cue = null;
    this.flag = 1;
    this.tempoCount = 0;
    this.tempoDiv = BGM.TEMPO_DIV;
    this.wait = 0;
    this.colIndex = 0;
    this.selector = 0;
    this.stepCount = 0;
    this.repeatCount = 0;
    this.groupPending = 0;
    this.groupStep = 0;
    this.deferredRow = 0;
    this.deferredStep = 0;
    this.handlerDirty = 0;
    // `$13B7` boot default. Handler 15 may replace this requested timer rate;
    // `$13D4` maps it through `$4376` before programming ICS timer 0.
    this.raw616c = 0x7d;
    this.keyonCount = 0;
    this.keyoffCount = 0;
  }

  loadCue(cueId, flag = 0, looping = true) {
    if (!Number.isInteger(cueId) || cueId < 0 || cueId >= this.cues.length) return false;
    requireParams(this.params);
    this.stop();
    const cue = this.cues[cueId];
    if (cue.tracks !== N_BGM_TRACKS) throw new Error('BGM driver: cue does not have 8 tracks');
    this.cueId = cueId;
    this.cue = cue;
    this.flag = (flag & 0xff) || 1;
    this.tempoDiv = BGM.TEMPO_DIV;
    this.tempoCount = this.tempoDiv;
    this.wait = 0;
    this.colIndex = 0;
    this.selector = cue.rowStream[0];
    this.stepCount = 0;
    this.repeatCount = 0;
    this.groupPending = 0;
    this.groupStep = 0;
    this.deferredRow = 0;
    this.deferredStep = 0;
    for (let index = 0; index < N_BGM_TRACKS; index++) {
      const track = this.tracks[index];
      track.raw.fill(0);
      track.active = true;
      track.voice = index;
      set8(track, TOFF.keyoffArm, 1);
      // `$2F25 -> $0268`: `flag * $40 >> 7`, not the unscaled flag.
      set8(track, TOFF.baseLevel, (this.flag * 0x40) >>> 7);
      track.ptrTableBase = cue.ptrTableAddr + index * cue.df * 2;
      set16(track, TOFF.ptrTable, track.ptrTableBase);
      this.selectStream(track, this.selector);
      this.engine.initializeBgmVoice(index, this.params.pan(7));
    }
    this.activeMode = looping ? 1 : -1;
    this.cueActive = true;
    return true;
  }

  stop() {
    for (const track of this.tracks) {
      if (track.active && this.engine.icsShadow[track.voice][0] !== 0) {
        this.engine.emitKeyoff(track.slot);
        this.engine.releaseIcsVoice(track.voice);
      }
      track.active = false;
      track.slot.state = 0;
    }
    this.cueActive = false;
    this.activeMode = 0;
  }

  selectStream(track, selector) {
    const index = this.cue.pointerIndex(track.idx, selector);
    track.streamStart = this.cue.noteStreamAddrs[index];
    track.stream = this.cue.noteStreams[index];
    track.streamPos = 0;
    set16(track, TOFF.streamPtr, track.streamStart);
    track.wait = 0;
  }

  pitchFor(track, note, bankOverride = null) {
    integer('note', note, 0, 59);
    const descriptor = this.params.bgm(u8(track, TOFF.descriptor));
    const bank = bankOverride ?? descriptor.pitchBank;
    return this.params.pitch(bank, note);
  }

  resolveDescriptor(track, oneBased) {
    if (oneBased === 0) return;
    const index = oneBased - 1;
    const descriptor = this.params.bgm(index);
    set8(track, TOFF.descriptor, index);
    set16(track, TOFF.descPtr, 0x6840 + index * 22);
    set8(track, TOFF.baseLevel, descriptor.baseLevel);
    set8(track, TOFF.level, descriptor.baseLevel);
    set8(track, TOFF.retrigger, 0);
  }

  resolveNote(track, oneBased) {
    if (oneBased === 0) return;
    const note = oneBased - 1;
    integer('one-based note', note, 0, 59);
    set8(track, TOFF.note, note);
    const period = this.pitchFor(track, note);
    set16(track, TOFF.basePeriod, period);
    const state = u8(track, TOFF.evState);
    if (state === 3 || state === 5) set8(track, TOFF.keyonArm, 0);
    else {
      set16(track, TOFF.targetPeriod, period);
      set8(track, TOFF.keyonArm, 1);
    }
    set32(track, TOFF.modifier, 0);
    if ((u8(track, TOFF.flags) & 0x40) === 0) set8(track, TOFF.volumePhase, 0);
    if ((u8(track, TOFF.flags) & 0x04) === 0) set8(track, TOFF.pitchPhase, 0);
  }

  applyEvent(track, event) {
    if (event.kind === 'wait') {
      clearEvent(track);
      track.wait = event.wait;
    } else if (event.kind === 'state') {
      set8(track, TOFF.evState, event.state);
      set8(track, TOFF.evState2, event.parameter);
    } else {
      if (event.descriptor !== undefined) this.resolveDescriptor(track, event.descriptor);
      set8(track, TOFF.evState, event.state);
      if (event.parameter !== undefined) set8(track, TOFF.evState2, event.parameter);
      if (event.note !== undefined) this.resolveNote(track, event.note & 0x3f);
    }
    track.streamPos = event.next;
    set16(track, TOFF.streamPtr, track.streamStart + track.streamPos);
  }

  pitchSlide(track) {
    if (this.tempoCount === 0) {
      set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
      set8(track, TOFF.fcDirty, 1);
      return;
    }
    let target = u16(track, TOFF.targetPeriod);
    const base = u16(track, TOFF.basePeriod);
    const rate = u8(track, TOFF.pitchRate);
    if (target !== base) {
      const distance = Math.abs(target - base);
      target = distance <= rate ? base : target < base ? target + rate : target - rate;
      set16(track, TOFF.targetPeriod, target);
    }
    if (u8(track, TOFF.quantize) !== 0) {
      let closest = this.pitchFor(track, 59);
      for (let note = 0; note < 60; note++) {
        const candidate = this.pitchFor(track, note);
        // `$1A34-$1A77` walks the descending bank until target >= candidate.
        if (target >= candidate) { closest = candidate; break; }
      }
      set16(track, TOFF.currentPeriod, closest);
    } else set16(track, TOFF.currentPeriod, target);
    set8(track, TOFF.fcDirty, 1);
  }

  wave(phase, mode) {
    const index = (phase >>> 2) & 0x1f;
    if (mode === 0) {
      // Exact `$4356` 32-step sine table, transcribed as semantic values.
      return [0,24,49,74,97,120,141,161,180,197,212,225,235,244,250,253,
        255,253,250,244,235,225,212,197,180,161,141,120,97,74,49,24][index];
    }
    if (mode === 1) return index * 8;
    return 0xff;
  }

  pitchModulation(track) {
    const amplitude = (this.wave(u8(track, TOFF.pitchPhase),
      u8(track, TOFF.flags) & 3) * u8(track, TOFF.pitchDepth)) >>> 7;
    const target = u16(track, TOFF.targetPeriod);
    set16(track, TOFF.currentPeriod, (u8(track, TOFF.pitchPhase) & 0x80)
      ? target - amplitude : target + amplitude);
    if (this.tempoCount !== 0) {
      set8(track, TOFF.pitchPhase,
        u8(track, TOFF.pitchPhase) + u8(track, TOFF.pitchStep));
    }
    set8(track, TOFF.fcDirty, 1);
  }

  volumeModulation(track) {
    const mode = (u8(track, TOFF.flags) >>> 4) & 3;
    const amplitude = (this.wave(u8(track, TOFF.volumePhase), mode)
      * u8(track, TOFF.volumeDepth)) >>> 6;
    const base = u8(track, TOFF.baseLevel);
    set8(track, TOFF.level, (u8(track, TOFF.volumePhase) & 0x80)
      ? Math.max(0, base - amplitude) : Math.min(0x40, base + amplitude));
    if (this.tempoCount !== 0) {
      set8(track, TOFF.volumePhase,
        u8(track, TOFF.volumePhase) + u8(track, TOFF.volumeStep));
    }
    set8(track, TOFF.volumeDirty, 1);
  }

  levelSweep(track) {
    const parameter = u8(track, TOFF.evState2);
    let level = Math.min(0x40, u8(track, TOFF.baseLevel) + (parameter >>> 4));
    level = Math.max(0, level - (parameter & 0x0f));
    set8(track, TOFF.baseLevel, level);
    set8(track, TOFF.level, level);
    set8(track, TOFF.volumeDirty, 1);
  }

  rowJump(track, column) {
    if (this.groupPending !== 0) { clearEvent(track); return; }
    this.groupPending = 1;
    this.colIndex = column;
    clearEvent(track);
    if (this.colIndex >= this.cue.rowlen) this.stepCount = 0x40;
    else { this.selector = this.cue.rowStream[this.colIndex]; this.stepCount = 0; }
  }

  groupJump(track, parameter) {
    if (this.groupPending !== 0) { clearEvent(track); return; }
    this.groupPending = 1;
    this.colIndex = (this.colIndex + 1) & 0xff;
    if (parameter !== 0) this.groupStep = (((parameter >>> 4) & 7) * 10)
      + (parameter & 0x0f);
    clearEvent(track);
    if (this.colIndex >= this.cue.rowlen) this.stepCount = 0x40;
    else {
      if (this.groupStep >= 0x40) this.groupStep -= 0x40;
      this.selector = this.cue.rowStream[this.colIndex];
      this.stepCount = this.groupStep;
    }
  }

  fastForward(count) {
    for (const track of this.tracks) {
      track.wait = 0;
      for (let step = 0; step < count; step++) {
        if (track.wait !== 0) { track.wait--; continue; }
        const event = parseEvent(track.stream, track.streamPos);
        if (!event) throw new Error(`BGM driver: track ${track.idx} stream exhausted`);
        track.streamPos = event.next;
        set16(track, TOFF.streamPtr, track.streamStart + track.streamPos);
        if (event.kind === 'wait') track.wait = event.wait;
      }
    }
  }

  resetStreams(selector) {
    for (const track of this.tracks) this.selectStream(track, selector);
  }

  updateFrequency(track) {
    const period = Math.max(0x32, Math.min(0x716, u16(track, TOFF.currentPeriod)));
    set16(track, TOFF.fcReg, this.params.frequency(period));
  }

  convertedVolume(track) {
    let level = ((u8(track, TOFF.level) * this.flag) >>> 7) & 0xff;
    if (level === 0) level = 1;
    return this.params.volume(level);
  }

  emitTrack(track, overrides = null) {
    if (overrides) {
      Object.assign(track.slot, overrides);
      track.slot.icsVoice = track.voice;
      this.engine.emitKeyon(track.slot);
      this.keyonCount++;
      return 1;
    }
    if (u8(track, TOFF.fcDirty)) this.updateFrequency(track);
    if (u8(track, TOFF.keyonArm)) {
      const descriptor = this.params.bgm(u8(track, TOFF.descriptor));
      const modifier = u32(track, TOFF.modifier);
      const slot = track.slot;
      slot.icsVoice = track.voice;
      slot.fc = u16(track, TOFF.fcReg);
      slot.saddr = descriptor.r11;
      // `$163F-$16E7`: translate the raw 32-bit offset into the ICS split
      // address words: low `(offset << 12) & $FFFF`, high
      // `(offset & $FFFFF000) >>> 4`.
      slot.r0B = (descriptor.r0B + ((modifier << 12) & 0xffff)) & 0xffff;
      slot.r0A = (descriptor.r0A + ((modifier & 0xfffff000) >>> 4)) & 0xffff;
      slot.oscStrtLo = descriptor.r03;
      slot.oscStrt = descriptor.r02;
      slot.oscEndLo = descriptor.r05;
      slot.oscEnd = descriptor.r04;
      slot.pan = this.params.pan(7);
      slot.r09 = this.convertedVolume(track);
      slot.oscConf = descriptor.r00;
      slot.hasLoop = descriptor.r00 !== 0;
      slot.hasPan = false;
      slot.hasR09 = true;
      if (u8(track, TOFF.keyoffArm) === 0) this.engine.emitKeyoff(slot);
      set8(track, TOFF.keyoffArm, 0);
      this.engine.emitKeyon(slot);
      set8(track, TOFF.keyonArm, 0);
      set8(track, TOFF.volumeDirty, 0);
      this.keyonCount++;
      return 1;
    }
    if (u8(track, TOFF.fcDirty)) {
      this.engine.writeVoiceFrequency(track.voice, u16(track, TOFF.fcReg));
      set8(track, TOFF.fcDirty, 0);
    }
    if (u8(track, TOFF.volumeDirty)) {
      this.engine.writeVoiceVolume(track.voice, this.convertedVolume(track));
      set8(track, TOFF.volumeDirty, 0);
    }
    return 0;
  }

  fireKeyon(trackIdx, params = {}) {
    integer('track', trackIdx, 0, N_BGM_TRACKS - 1);
    this.emitTrack(this.tracks[trackIdx], params);
    return this.tracks[trackIdx].slot;
  }

  fireKeyoff(voice) {
    integer('BGM voice', voice, 0, N_BGM_TRACKS - 1);
    const track = this.tracks.find((candidate) => candidate.voice === voice);
    this.engine.emitKeyoff(track.slot);
    set8(track, TOFF.keyoffArm, 1);
    track.slot.state = 0;
    this.keyoffCount++;
  }

  tick() {
    if (!this.cueActive) return 0;
    this.tempoCount = (this.tempoCount + 1) & 0xff;
    const eventTick = this.tempoCount >= this.tempoDiv;
    let parseTick = eventTick;

    if (eventTick && this.wait !== 0) {
      this.wait--;
      this.tempoCount = 0;
      parseTick = false;
    } else if (eventTick && this.stepCount > BGM.STEP_MAX && this.deferredRow === 0) {
      this.colIndex++;
      if (this.colIndex >= this.cue.rowlen) {
        if (this.activeMode === 1) {
          for (const track of this.tracks) this.fireKeyoff(track.voice);
          this.tempoDiv = BGM.TEMPO_DIV;
          this.colIndex = 0;
          this.selector = this.cue.rowStream[0];
          this.stepCount = 0;
          this.wait = 0;
          this.groupPending = 0;
          this.groupStep = 0;
          this.resetStreams(this.selector);
        } else { this.stop(); return 0; }
      } else {
        this.selector = this.cue.rowStream[this.colIndex];
        this.resetStreams(this.selector);
        this.stepCount = 0;
      }
    }

    if (parseTick && this.groupPending) {
      this.resetStreams(this.selector);
      if (this.colIndex === 0) for (const track of this.tracks) this.fireKeyoff(track.voice);
      if (this.groupStep) this.fastForward(this.groupStep);
      this.groupPending = 0;
      this.groupStep = 0;
    }
    if (parseTick) this.stepCount = (this.stepCount + 1) & 0xff;
    if (parseTick && this.deferredRow) {
      this.resetStreams(this.selector);
      if (this.deferredStep) this.fastForward(this.deferredStep);
      this.deferredRow = 0;
      this.stepCount = (this.deferredStep + 1) & 0xff;
    }

    if (parseTick) {
      for (const track of this.tracks) {
        if (track.wait !== 0) { track.wait--; continue; }
        const event = parseEvent(track.stream, track.streamPos);
        if (!event) throw new Error(`BGM driver: cue ${this.cueId} track ${track.idx} stream exhausted`);
        this.applyEvent(track, event);
      }
      // `$2BF0` runs before the `$4316` handler walk on every event tick.
      this.tempoCount = 0;
    }

    this.handlerDirty = 0;
    for (const track of this.tracks) {
      const state = u8(track, TOFF.evState);
      const parameter = u8(track, TOFF.evState2);
      if (state !== 0 || parameter !== 0) applyStateHandler(state, track, this);
      const resultingState = u8(track, TOFF.evState);
      if (this.tempoCount === 0 && (resultingState < 3 || resultingState > 6)) {
        set16(track, TOFF.currentPeriod, u16(track, TOFF.targetPeriod));
        set8(track, TOFF.fcDirty, 1);
      }
    }

    let armed = 0;
    for (const track of this.tracks) armed += this.emitTrack(track);
    return armed;
  }
}
