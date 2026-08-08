// ROM-derived semantic sound-driver parameters (W152).
//
// The uploaded Z80 image contains runtime score tables. This module transforms
// those tables into named numeric records and validates the published JSON on
// re-entry. No contiguous ROM byte slice is exposed by the artifact.

export const DRIVER_PARAMS = Object.freeze({
  version: 2,
  sfxBase: 0x7600, sfxStride: 12, sfxCount: 69,
  sourceRateAddress: 0x6168,
  bgmBase: 0x6840, bgmStride: 22, bgmCount: 160,
  fcMapBase: 0x4439, fcMapStride: 2, fcMapMin: 0x32, fcMapMax: 0x716,
  fcMapCount: 0x716 - 0x32 + 1,
  pitchBase: 0x5203, pitchStride: 0x78, pitchBanks: 16, pitchNotes: 60,
  panBase: 0x5987, panCount: 16,
  volumeBase: 0x5997, volumeCount: 256,
});

function integer(name, value, lo, hi) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new TypeError(`driver params: ${name} must be an integer in ${lo}..${hi}`);
  }
  return value;
}

const byte = (name, value) => integer(name, value, 0, 0xff);
const word = (name, value) => integer(name, value, 0, 0xffff);

function array(name, value, count) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new TypeError(`driver params: ${name} must contain exactly ${count} entries`);
  }
  return value;
}

function object(name, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`driver params: ${name} must be an object`);
  }
  return value;
}

function metadata(name, value, base, stride, count) {
  object(name, value);
  if (value.base !== base || value.stride !== stride) {
    throw new RangeError(`driver params: ${name} base/stride must be `
      + `$${base.toString(16)}/${stride}`);
  }
  array(`${name}.entries`, value.entries, count);
}

function le16(bytes, address) {
  return bytes[address] | (bytes[address + 1] << 8);
}

/** `$0B92`: convert the `$7600` descriptor's Hz word through `[$6168]`. */
export function sfxRateToOscFc(rateHz, sourceRateHz = 0x8133) {
  word('SFX sample rate', rateHz);
  word('driver source rate', sourceRateHz);
  if (sourceRateHz === 0) throw new RangeError('driver params: source rate must be non-zero');
  return Math.floor(rateHz * 0x400 / sourceRateHz);
}

/** Transform the runtime tables in the uploaded 64 KiB Z80 image. */
export function driverParamsToJson(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 0x10000) {
    throw new TypeError('driver params export requires the complete 64 KiB Z80 image');
  }
  const C = DRIVER_PARAMS;
  const sourceRateHz = le16(bytes, C.sourceRateAddress);
  if (sourceRateHz === 0) throw new RangeError('driver params export: [$6168] source rate is zero');
  const sfx = [];
  for (let i = 0; i < C.sfxCount; i++) {
    const p = C.sfxBase + i * C.sfxStride;
    const sampleRateHz = le16(bytes, p + 2);
    sfx.push({
      r11: bytes[p], raw01: bytes[p + 1], sampleRateHz,
      oscFc: sfxRateToOscFc(sampleRateHz, sourceRateHz),
      r0B: le16(bytes, p + 4), r0A: le16(bytes, p + 6),
      r05: le16(bytes, p + 8), r04: le16(bytes, p + 10),
    });
  }
  const bgm = [];
  for (let i = 0; i < C.bgmCount; i++) {
    const p = C.bgmBase + i * C.bgmStride;
    bgm.push({
      r11: bytes[p], r00: bytes[p + 1], raw02: le16(bytes, p + 2),
      r0B: le16(bytes, p + 4), r0A: le16(bytes, p + 6),
      r05: le16(bytes, p + 8), r04: le16(bytes, p + 10),
      baseLevel: bytes[p + 12], pitchBank: bytes[p + 13] & 0x0f,
      r03: le16(bytes, p + 14), r02: le16(bytes, p + 16),
      raw18: le16(bytes, p + 18), raw20: le16(bytes, p + 20),
    });
  }
  const banks = [];
  for (let bank = 0; bank < C.pitchBanks; bank++) {
    const row = [];
    const p = C.pitchBase + bank * C.pitchStride;
    for (let note = 0; note < C.pitchNotes; note++) row.push(le16(bytes, p + note * 2));
    banks.push(row);
  }
  const fcMap = Array.from({ length: C.fcMapCount }, (_, i) =>
    le16(bytes, C.fcMapBase + i * C.fcMapStride));
  return {
    version: C.version,
    clock: { sourceRateAddress: C.sourceRateAddress, sourceRateHz },
    sfx: { base: C.sfxBase, stride: C.sfxStride, entries: sfx },
    bgm: { base: C.bgmBase, stride: C.bgmStride, entries: bgm },
    fcMap: { base: C.fcMapBase, stride: C.fcMapStride,
      min: C.fcMapMin, max: C.fcMapMax, entries: fcMap },
    pitch: { base: C.pitchBase, stride: C.pitchStride, banks },
    control: {
      pan: { base: C.panBase, entries: Array.from(bytes.subarray(C.panBase,
        C.panBase + C.panCount)) },
      volume: { base: C.volumeBase, entries: Array.from({ length: C.volumeCount },
        (_, i) => le16(bytes, C.volumeBase + i * 2)) },
    },
  };
}

function freezeRecord(record) { return Object.freeze(record); }

/** Validated, immutable selector-indexed access to the transformed tables. */
export class DriverParams {
  constructor(sfx, bgm, fcMap, pitch, pan, volume, sourceRateHz) {
    this.sfxEntries = Object.freeze(sfx);
    this.bgmEntries = Object.freeze(bgm);
    this.fcMapEntries = Object.freeze(fcMap);
    this.pitchBanks = Object.freeze(pitch);
    this.panEntries = Object.freeze(pan);
    this.volumeEntries = Object.freeze(volume);
    this.sourceRateHz = sourceRateHz;
    Object.freeze(this);
  }

  sfx(selector) {
    integer('SFX selector', selector, 0, DRIVER_PARAMS.sfxCount - 1);
    return this.sfxEntries[selector];
  }

  bgm(index) {
    integer('BGM descriptor', index, 0, DRIVER_PARAMS.bgmCount - 1);
    return this.bgmEntries[index];
  }

  frequency(period) {
    integer('frequency-map period', period, DRIVER_PARAMS.fcMapMin,
      DRIVER_PARAMS.fcMapMax);
    return this.fcMapEntries[period - DRIVER_PARAMS.fcMapMin];
  }

  pitch(bank, note) {
    integer('pitch bank', bank, 0, DRIVER_PARAMS.pitchBanks - 1);
    integer('pitch note', note, 0, DRIVER_PARAMS.pitchNotes - 1);
    return this.pitchBanks[bank][note];
  }

  pan(index) {
    integer('pan index', index, 0, DRIVER_PARAMS.panCount - 1);
    return this.panEntries[index];
  }

  volume(level) {
    integer('volume level', level, 0, DRIVER_PARAMS.volumeCount - 1);
    // `$0B92/$0E81`: zero uses the word at `$5999`, table entry one.
    return this.volumeEntries[level === 0 ? 1 : level];
  }
}

/** Parse and strictly validate a published driver-params JSON value. */
export function driverParamsFromJson(input) {
  const json = typeof input === 'string' ? JSON.parse(input) : input;
  object('root', json);
  const C = DRIVER_PARAMS;
  if (json.version !== C.version) {
    throw new RangeError(`driver params: unsupported version ${json.version}`);
  }
  object('clock', json.clock);
  if (json.clock.sourceRateAddress !== C.sourceRateAddress) {
    throw new RangeError('driver params: source-rate address mismatch');
  }
  const sourceRateHz = word('clock.sourceRateHz', json.clock.sourceRateHz);
  if (sourceRateHz === 0) throw new RangeError('driver params: source rate must be non-zero');
  metadata('sfx', json.sfx, C.sfxBase, C.sfxStride, C.sfxCount);
  metadata('bgm', json.bgm, C.bgmBase, C.bgmStride, C.bgmCount);
  metadata('fcMap', json.fcMap, C.fcMapBase, C.fcMapStride, C.fcMapCount);
  if (json.fcMap.min !== C.fcMapMin || json.fcMap.max !== C.fcMapMax) {
    throw new RangeError('driver params: frequency map range mismatch');
  }
  object('pitch', json.pitch);
  if (json.pitch.base !== C.pitchBase || json.pitch.stride !== C.pitchStride) {
    throw new RangeError('driver params: pitch base/stride mismatch');
  }
  array('pitch.banks', json.pitch.banks, C.pitchBanks);
  object('control', json.control);
  object('control.pan', json.control.pan);
  object('control.volume', json.control.volume);
  if (json.control.pan.base !== C.panBase || json.control.volume.base !== C.volumeBase) {
    throw new RangeError('driver params: control table base mismatch');
  }

  const sfx = json.sfx.entries.map((raw, i) => {
    object(`sfx.entries[${i}]`, raw);
    const sampleRateHz = word(`sfx[${i}].sampleRateHz`, raw.sampleRateHz);
    const oscFc = word(`sfx[${i}].oscFc`, raw.oscFc);
    if (oscFc !== sfxRateToOscFc(sampleRateHz, sourceRateHz)) {
      throw new RangeError(`driver params: sfx[${i}].oscFc does not match $0B92 conversion`);
    }
    return freezeRecord({
      r11: byte(`sfx[${i}].r11`, raw.r11),
      raw01: byte(`sfx[${i}].raw01`, raw.raw01),
      sampleRateHz, oscFc,
      r0B: word(`sfx[${i}].r0B`, raw.r0B),
      r0A: word(`sfx[${i}].r0A`, raw.r0A),
      r05: word(`sfx[${i}].r05`, raw.r05),
      r04: word(`sfx[${i}].r04`, raw.r04),
    });
  });
  const bgm = json.bgm.entries.map((raw, i) => {
    object(`bgm.entries[${i}]`, raw);
    return freezeRecord({
      r11: byte(`bgm[${i}].r11`, raw.r11), r00: byte(`bgm[${i}].r00`, raw.r00),
      raw02: word(`bgm[${i}].raw02`, raw.raw02),
      r0B: word(`bgm[${i}].r0B`, raw.r0B), r0A: word(`bgm[${i}].r0A`, raw.r0A),
      r05: word(`bgm[${i}].r05`, raw.r05), r04: word(`bgm[${i}].r04`, raw.r04),
      baseLevel: byte(`bgm[${i}].baseLevel`, raw.baseLevel),
      pitchBank: integer(`bgm[${i}].pitchBank`, raw.pitchBank, 0, 15),
      r03: word(`bgm[${i}].r03`, raw.r03), r02: word(`bgm[${i}].r02`, raw.r02),
      raw18: word(`bgm[${i}].raw18`, raw.raw18),
      raw20: word(`bgm[${i}].raw20`, raw.raw20),
    });
  });
  const fcMap = json.fcMap.entries.map((value, i) =>
    word(`fcMap[${i}]`, value));
  const pitch = json.pitch.banks.map((raw, bank) => Object.freeze(
    array(`pitch.banks[${bank}]`, raw, C.pitchNotes)
      .map((value, note) => word(`pitch[${bank}][${note}]`, value))));
  const pan = array('control.pan.entries', json.control.pan.entries, C.panCount)
    .map((value, i) => byte(`control.pan[${i}]`, value));
  const volume = array('control.volume.entries', json.control.volume.entries,
    C.volumeCount).map((value, i) => word(`control.volume[${i}]`, value));
  return new DriverParams(sfx, bgm, fcMap, pitch, pan, volume, sourceRateHz);
}
