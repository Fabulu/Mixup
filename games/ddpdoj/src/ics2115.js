// THE EXERCISED DOJ ICS2115 SYNTHESIZER CORE -- W155.
//
// This is deliberately not a generic ICS2115 emulator.  It implements the
// signed linear-8, forward, static-volume subset measured in W151 and refuses
// every unexercised format rather than turning a guess into game behavior.
// Two hardware facts remain unsettled (W154): the gain at center pan and the
// equality edge at OscEnd.  Consequently construction requires both policies
// explicitly; there is no audible default.

import { N_VOICES, VOICE_REG, unpack } from './ics.js';

export const ICS_CLOCK = 33_868_800;
export const ACTIVE_OSC = 31;
export const ICS_SOURCE_RATE = ICS_CLOCK / ((ACTIVE_OSC + 1) * 32); // 33,075
export const LOGIC_RATE_NUM = 15_625;
export const LOGIC_RATE_DEN = 264;

export const ENDPOINT_POLICY = Object.freeze({
  EQUALITY: 'equality',
  STRICT_CROSSING: 'strict-crossing',
});

const ENDPOINTS = new Set(Object.values(ENDPOINT_POLICY));
const MASK_29 = 0x1fffffff;
const REG_COUNT = 0x13;

function integer(name, value, lo, hi) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new Error(`ICS2115: ${name} must be an integer in ${lo}..${hi}, got ${value}`);
  }
  return value;
}

/** Signed linear-8 sample expanded onto the chip's signed 16-bit bus. */
export function linear8(byte) {
  integer('sample byte', byte, 0, 0xff);
  return ((byte << 24) >> 24) * 256;
}

/** Exact nine-bit linear interpolation. */
export function interpolate9(a, b, fraction) {
  integer('interpolation fraction', fraction, 0, 0x1ff);
  return a + Math.floor(((b - a) * fraction) / 512);
}

/** Static logarithmic gain before the unresolved pan stage. */
export function volumeGain(volAcc) {
  integer('VolAcc', volAcc, 0, 0xffff);
  return volumeIndexGain(volAcc >>> 4);
}

/** W151's exact logarithmic conversion at the 12-bit volume-index stage. */
export function volumeIndexGain(index) {
  integer('volume index', index, 0, 0xfff);
  if (index === 0) return 0;
  const exponent = index >>> 8;
  const mantissa = index & 0xff;
  if (exponent === 0) return mantissa >>> 7;
  return Math.floor((((0x100 | mantissa) * (2 ** (exponent - 1))) + 0xff) / 0x100);
}

/** The 29-bit 20.9 phase encoded by the accumulator register pair. */
export function accumulatorPhase(high16, low16) {
  integer('accumulator high word', high16, 0, 0xffff);
  integer('accumulator low word', low16, 0, 0xffff);
  return ((high16 * 0x2000) + (low16 & 0x1fff)) & MASK_29;
}

/** The 29-bit 20.9 phase encoded by a loop/end register pair. */
export function boundaryPhase(high16, lowWord) {
  integer('boundary high word', high16, 0, 0xffff);
  integer('boundary low word', lowWord, 0, 0xffff);
  // DOJ uses the HIGH lane of the nominal low register as the eight address
  // bits.  The low lane is written by the 16-bit primitive but is not part of
  // the 20.9 address.
  return ((high16 * 0x2000) + ((lowWord >>> 8) * 0x20)) & MASK_29;
}

function freezeFragments(fragments) {
  return Object.freeze(fragments.map((f) => Object.freeze({ ...f })));
}

/** Strict un-stitcher for sample.shard.u8 + sample.index.json. */
export class IcsSampleMap {
  #shard;

  constructor(index, shard) {
    if (!index || typeof index !== 'object' || Array.isArray(index)) {
      throw new Error('ICS2115 sample index must be an object');
    }
    if (!(shard instanceof Uint8Array)) {
      throw new Error('ICS2115 sample shard must be a Uint8Array');
    }
    if (index.version !== 1
        || index.layout !== 'ics2115-static-fragment-stitch-v1') {
      throw new Error('ICS2115 sample index requires version 1 layout '
        + '"ics2115-static-fragment-stitch-v1"');
    }
    if (index.rom !== 'cave_m04401b032.u17') {
      throw new Error(`ICS2115 sample index rom mismatch: ${index.rom}`);
    }
    integer('sample index icsBase', index.icsBase, 0, 0xffffff);
    if (index.icsBase !== 0x400000) {
      throw new Error(`ICS2115 sample index base must be $400000, got $${index.icsBase.toString(16)}`);
    }
    integer('sample index shardBytes', index.shardBytes, 1, 0xffffff);
    if (index.shardBytes !== shard.length) {
      throw new Error(`ICS2115 sample shard length ${shard.length} != index ${index.shardBytes}`);
    }
    integer('sample index fragmentCount', index.fragmentCount, 1, 0xffff);
    if (!Array.isArray(index.fragments)
        || index.fragments.length !== index.fragmentCount) {
      throw new Error(`ICS2115 sample index fragments length must equal declared `
        + `fragmentCount ${index.fragmentCount}`);
    }

    let packed = 0;
    let previousIcsEnd = -1;
    let previousRomEnd = -1;
    const fragments = [];
    for (let i = 0; i < index.fragments.length; i++) {
      const f = index.fragments[i];
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        throw new Error(`ICS2115 sample fragment ${i} must be an object`);
      }
      for (const key of ['romOffset', 'icsBase', 'shardOffset', 'len']) {
        integer(`sample fragment ${i} ${key}`, f[key], 0, 0xffffff);
      }
      if (f.len === 0) throw new Error(`ICS2115 sample fragment ${i} is empty`);
      if (f.icsBase !== index.icsBase + f.romOffset) {
        throw new Error(`ICS2115 sample fragment ${i} has inconsistent ROM/ICS bases`);
      }
      if (f.shardOffset !== packed) {
        throw new Error(`ICS2115 sample fragment ${i} shard offset ${f.shardOffset} != ${packed}`);
      }
      const icsEnd = f.icsBase + f.len;
      const romEnd = f.romOffset + f.len;
      if (icsEnd > 0x1000000) throw new Error(`ICS2115 sample fragment ${i} exceeds 24-bit space`);
      if (f.icsBase <= previousIcsEnd || f.romOffset <= previousRomEnd) {
        throw new Error(`ICS2115 sample fragment ${i} overlaps or touches its predecessor`);
      }
      packed += f.len;
      if (packed > shard.length) throw new Error(`ICS2115 sample fragment ${i} exceeds shard`);
      previousIcsEnd = icsEnd;
      previousRomEnd = romEnd;
      fragments.push({ romOffset: f.romOffset, icsBase: f.icsBase,
        shardOffset: f.shardOffset, len: f.len });
    }
    if (packed !== shard.length) {
      throw new Error(`ICS2115 sample fragments cover ${packed} bytes, shard has ${shard.length}`);
    }
    this.fragments = freezeFragments(fragments);
    this.#shard = new Uint8Array(shard);
    Object.freeze(this);
  }

  byte(address) {
    integer('24-bit sample address', address, 0, 0xffffff);
    let lo = 0;
    let hi = this.fragments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const f = this.fragments[mid];
      if (address < f.icsBase) hi = mid - 1;
      else if (address >= f.icsBase + f.len) lo = mid + 1;
      else return this.#shard[f.shardOffset + address - f.icsBase];
    }
    throw new Error(`ICS2115 sample address $${address.toString(16).padStart(6, '0')} is outside the deferred shard`);
  }
}

class Oscillator {
  constructor() {
    this.lo = new Uint8Array(REG_COUNT);
    this.hi = new Uint8Array(REG_COUNT);
    this.phase = 0;
    this.running = false;
    this.irqCondition = false;
    this.irqLatched = false;
  }
  u16(reg) { return this.lo[reg] | (this.hi[reg] << 8); }
  u8(reg) { return this.hi[reg]; }
}

function validatePanPolicy(policy) {
  if (!policy || typeof policy !== 'object' || typeof policy.name !== 'string'
      || policy.name.length === 0 || typeof policy.centerGains !== 'function') {
    throw new Error('ICS2115 audible stereo requires an explicit named panPolicy '
      + 'with centerGains(volAcc, voice)');
  }
  return policy;
}

/**
 * Deterministic chip-facing core.  `frame` consumes packed IcsRegisterFile log
 * entries, applies them in order, and services exactly one logic frame.
 */
export class Ics2115Core {
  constructor(sampleMap, { endpointPolicy, panPolicy } = {}) {
    if (!(sampleMap instanceof IcsSampleMap)) {
      throw new Error('ICS2115 requires a validated IcsSampleMap; full-ROM fallback is forbidden');
    }
    if (!ENDPOINTS.has(endpointPolicy)) {
      throw new Error('ICS2115 audible stereo requires endpointPolicy "equality" or "strict-crossing"');
    }
    this.panPolicy = validatePanPolicy(panPolicy);
    this.endpointPolicy = endpointPolicy;
    this.samples = sampleMap;
    this.voices = Array.from({ length: N_VOICES }, () => new Oscillator());
    this.activeOsc = ACTIVE_OSC;
    this.lastIrqVoice = ACTIVE_OSC;
    this.nativeClockAcc = 0;
    this.frameCount = 0;
    this.sourceRate = ICS_SOURCE_RATE;
    this.channels = 2;
    this.out = [new Float32Array(2048), new Float32Array(2048)];
    this.outLen = 0;
  }

  _ensureOut(extra) {
    const need = this.outLen + extra;
    if (need <= this.out[0].length) return;
    let cap = this.out[0].length;
    while (cap < need) cap *= 2;
    for (let c = 0; c < 2; c++) {
      const next = new Float32Array(cap);
      next.set(this.out[c].subarray(0, this.outLen));
      this.out[c] = next;
    }
  }

  _write(voiceNo, reg, half, data) {
    if (half === 0) return; // register-select row: order is retained by the log
    if (reg === VOICE_REG.activeOsc && half === 2) {
      if (data !== ACTIVE_OSC) {
        throw new Error(`ICS2115 unsupported ActiveOsc $${data.toString(16)}; DOJ exercises only $1F`);
      }
      this.activeOsc = data;
      return;
    }
    if (reg > 0x12) return; // global timer/control writes do not alter synthesis
    integer('register-log voice', voiceNo, 0, this.activeOsc);
    const voice = this.voices[voiceNo];
    (half === 1 ? voice.lo : voice.hi)[reg] = data;

    if (reg === VOICE_REG.oscConf && half === 2 && data === 0xa0) {
      // The three boot/reset writes are never keyed on.  Treat them as reset,
      // not as an audible fourth format.
      voice.running = false;
      voice.irqCondition = false;
      voice.irqLatched = false;
    }
    if (reg === VOICE_REG.vCtl && half === 2 && voice.running
        && data !== 0x03 && data !== 0x01) {
      throw new Error(`ICS2115 unsupported live volume-ramp VCtl $${data.toString(16)}`);
    }
    if (reg === VOICE_REG.oscCtl && half === 2) this._oscCtl(voiceNo, data);
  }

  _oscCtl(voiceNo, value) {
    const voice = this.voices[voiceNo];
    if (value === 0x0f) {
      voice.running = false;
      voice.irqCondition = false;
      voice.irqLatched = false;
      return;
    }
    if (value !== 0x00) {
      throw new Error(`ICS2115 unsupported OscCtl $${value.toString(16)}`);
    }
    const conf = voice.u8(VOICE_REG.oscConf);
    if (conf === 0xa0) throw new Error('ICS2115 reset-only OscConf $A0 cannot be keyed on');
    if (conf & 0x01) throw new Error('ICS2115 unsupported mu-law sample mode');
    if (conf & 0x02) throw new Error('ICS2115 unsupported 16-bit sample mode');
    if (conf & 0x40) throw new Error('ICS2115 unsupported reverse oscillator mode');
    if (conf & 0x10) throw new Error('ICS2115 unsupported bidirectional loop mode');
    if (![0x00, 0x08, 0x20].includes(conf)) {
      throw new Error(`ICS2115 unsupported OscConf $${conf.toString(16).padStart(2, '0')}`);
    }
    const pan = voice.u8(VOICE_REG.pan) >>> 4;
    if (pan !== 7) throw new Error(`ICS2115 unsupported non-center pan ${pan}`);
    if (voice.u8(VOICE_REG.vCtl) !== 0x03) {
      throw new Error(`ICS2115 keyon requires exercised static VCtl $03`);
    }
    if (voice.u8(0x12) !== 0x00) throw new Error('ICS2115 unsupported volume mode');
    voice.phase = accumulatorPhase(voice.u16(0x0a), voice.u16(0x0b));
    const start = boundaryPhase(voice.u16(0x02), voice.u16(0x03));
    const end = boundaryPhase(voice.u16(0x04), voice.u16(0x05));
    // OscStrt is the forward-loop return boundary, not a lower clamp on the
    // initial accumulator. Live BGM descriptors deliberately attack before
    // OscStrt and enter the loop range later.
    if (end < start || voice.phase > end) {
      throw new Error(`ICS2115 invalid forward phase range start=${start} phase=${voice.phase} end=${end}`);
    }
    voice.running = true;
    voice.irqCondition = false;
    voice.irqLatched = false;
  }

  applyLog(log) {
    if (!log || typeof log.length !== 'number') throw new Error('ICS2115 frame log must be array-like');
    for (let i = 0; i < log.length; i++) {
      const packed = log[i];
      if (!Number.isInteger(packed) || packed < 0 || packed > 0xffffffff) {
        throw new Error(`ICS2115 malformed packed register row at ${i}`);
      }
      const { voice, reg, half, data } = unpack(packed >>> 0);
      if (half > 2) throw new Error(`ICS2115 malformed register half ${half}`);
      this._write(voice, reg, half, data);
    }
  }

  _serviceVoice(voiceNo) {
    const voice = this.voices[voiceNo];
    if (!voice.running) return null;
    const sample = this.sourceSample(voiceNo);
    const gains = this.panPolicy.centerGains(voice.u16(0x09), voiceNo);
    if (!Array.isArray(gains) || gains.length !== 2
        || gains.some((gain) => !Number.isInteger(gain) || gain < 0 || gain > 0x8000)) {
      throw new Error(`ICS2115 pan policy '${this.panPolicy.name}' returned invalid channel gains`);
    }
    const pair = [(sample * gains[0]) >> 15, (sample * gains[1]) >> 15];

    const conf = voice.u8(VOICE_REG.oscConf);
    const next = voice.phase + (voice.u16(VOICE_REG.fc) >>> 1);
    const end = boundaryPhase(voice.u16(0x04), voice.u16(0x05));
    const reached = this.endpointPolicy === ENDPOINT_POLICY.EQUALITY ? next >= end : next > end;
    if (reached) {
      if (conf & 0x08) {
        const start = boundaryPhase(voice.u16(0x02), voice.u16(0x03));
        voice.phase = start + (next - end);
      } else {
        voice.phase = end;
        voice.running = false;
        voice.hi[VOICE_REG.oscCtl] |= 0x01;
        if (conf & 0x20) {
          voice.irqCondition = true;
          voice.irqLatched = true;
        }
      }
    } else {
      voice.phase = next & MASK_29;
    }
    return pair;
  }

  /** Current signed mono contribution after static volume, before pan policy. */
  prePanSample(voiceNo) {
    const voice = this.voices[voiceNo];
    return (this.sourceSample(voiceNo) * volumeGain(voice.u16(0x09))) >> 15;
  }

  /** Current signed interpolated sample before static volume and pan. */
  sourceSample(voiceNo) {
    integer('pre-pan voice', voiceNo, 0, this.activeOsc);
    const voice = this.voices[voiceNo];
    if (!voice.running) return 0;
    const address = ((voice.u8(VOICE_REG.saddr) & 0x0f) * 0x100000)
      + Math.floor(voice.phase / 512);
    const fraction = voice.phase & 0x1ff;
    return interpolate9(linear8(this.samples.byte(address)),
      linear8(this.samples.byte(address + 1)), fraction);
  }

  runNative(count, emit = true, onNativeBoundary = null) {
    integer('native frame count', count, 0, 0x7fffffff);
    if (onNativeBoundary !== null && typeof onNativeBoundary !== 'function') {
      throw new TypeError('ICS2115 native-boundary callback must be a function');
    }
    if (emit) this._ensureOut(count);
    for (let n = 0; n < count; n++) {
      let left = 0;
      let right = 0;
      for (let v = 0; v <= this.activeOsc; v++) {
        const pair = this._serviceVoice(v);
        if (pair === null) continue;
        left += pair[0];
        right += pair[1];
      }
      if (emit) {
        this.out[0][this.outLen] = left / 32768;
        this.out[1][this.outLen] = right / 32768;
        this.outLen++;
      }
      if (onNativeBoundary) onNativeBoundary(n);
    }
  }

  frame(log, emit = true, onNativeBoundary = null) {
    this.applyLog(log);
    this.nativeClockAcc += ICS_SOURCE_RATE * LOGIC_RATE_DEN;
    const count = Math.floor(this.nativeClockAcc / LOGIC_RATE_NUM);
    this.nativeClockAcc -= count * LOGIC_RATE_NUM;
    this.frameCount++;
    this.runNative(count, emit, onNativeBoundary);
    return count;
  }

  /** Status bit 1 is the oscillator-end IRQ used by DOJ's `$0FEA` path. */
  status() {
    return this.voices.slice(0, this.activeOsc + 1).some((v) => v.irqLatched) ? 0x02 : 0;
  }

  /** Consume the round-robin IRQV source; an uncleared end condition reasserts. */
  readIrqv() {
    for (let offset = 1; offset <= this.activeOsc + 1; offset++) {
      const voiceNo = (this.lastIrqVoice + offset) % (this.activeOsc + 1);
      const voice = this.voices[voiceNo];
      if (!voice.irqLatched) continue;
      voice.irqLatched = false;
      this.lastIrqVoice = voiceNo;
      if (voice.irqCondition && (voice.u8(VOICE_REG.oscConf) & 0x20)) {
        voice.irqLatched = true;
      }
      return 0x60 | voiceNo;
    }
    return null;
  }

  drain(n, dests) {
    integer('drain count', n, 0, 0x7fffffff);
    if (!Array.isArray(dests) || dests.length !== 2
        || !(dests[0] instanceof Float32Array) || !(dests[1] instanceof Float32Array)) {
      throw new Error('ICS2115 drain requires two Float32Array destinations');
    }
    const count = Math.min(n, this.outLen, dests[0].length, dests[1].length);
    dests[0].set(this.out[0].subarray(0, count));
    dests[1].set(this.out[1].subarray(0, count));
    for (let c = 0; c < 2; c++) this.out[c].copyWithin(0, count, this.outLen);
    this.outLen -= count;
    return count;
  }

  stateSnapshot() {
    return {
      activeOsc: this.activeOsc,
      lastIrqVoice: this.lastIrqVoice,
      nativeClockAcc: this.nativeClockAcc,
      frameCount: this.frameCount,
      voices: this.voices.map((v) => ({
        lo: Array.from(v.lo), hi: Array.from(v.hi), phase: v.phase,
        running: v.running, irqCondition: v.irqCondition, irqLatched: v.irqLatched,
      })),
    };
  }
}
