import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IcsRegisterFile, VOICE_REG } from '../src/ics.js';
import { VoiceEngine, VoiceSlot } from '../src/voice.js';
import {
  ACTIVE_OSC, ENDPOINT_POLICY, ICS_SOURCE_RATE, Ics2115Core, IcsSampleMap,
  LOGIC_RATE_DEN, LOGIC_RATE_NUM, accumulatorPhase, boundaryPhase,
  interpolate9, linear8, volumeGain,
} from '../src/ics2115.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET = join(HERE, '..', 'assets', 'snd');
const REAL_INDEX = JSON.parse(gunzipSync(readFileSync(join(ASSET, 'sample.index.json.gz'))));
const REAL_SHARD = new Uint8Array(gunzipSync(readFileSync(join(ASSET, 'sample.shard.u8.gz'))));

// Deliberately synthetic and non-authoritative: this tests mechanics only.  It
// is not exported by production and contains no center-pan hardware number.
const UNIT_CENTER = Object.freeze({
  name: 'test-only-unit-center (non-authoritative)',
  center(sample) { return [sample, sample]; },
});

function syntheticMap() {
  const fragments = [];
  const shard = new Uint8Array(28 * 16);
  for (let i = 0; i < 28; i++) {
    const romOffset = i * 32;
    fragments.push({ romOffset, icsBase: 0x400000 + romOffset,
      shardOffset: i * 16, len: 16 });
    for (let j = 0; j < 16; j++) shard[i * 16 + j] = (i * 16 + j) & 0xff;
  }
  shard[0] = 0xff;
  shard[1] = 0xfe;
  return new IcsSampleMap({ rom: 'cave_m04401b032.u17', icsBase: 0x400000,
    shardBytes: shard.length, fragments }, shard);
}

function packed(voice, reg, half, data) {
  return (((voice & 0xff) << 24) | ((reg & 0xff) << 16)
    | ((half & 0xff) << 8) | (data & 0xff)) >>> 0;
}

function hi(voice, reg, value) { return packed(voice, reg, 2, value); }
function word(voice, reg, value) {
  return [packed(voice, reg, 1, value & 0xff), packed(voice, reg, 2, value >>> 8)];
}

function keyon(voice = 0, { conf = 0x20, fc = 0x0200, startLo = 0,
  endLo = 0x1000, accHi = 0, accLo = 0, pan = 0x7f, vol = 0xe600 } = {}) {
  return [
    ...word(voice, VOICE_REG.fc, fc),
    ...word(voice, VOICE_REG.oscStrt, 0), ...word(voice, VOICE_REG.oscStrtLo, startLo),
    ...word(voice, VOICE_REG.oscEnd, 0), ...word(voice, VOICE_REG.oscEndLo, endLo),
    ...word(voice, VOICE_REG.oscAccLo, accLo), ...word(voice, VOICE_REG.oscAccHi, accHi),
    ...word(voice, VOICE_REG.volAcc, vol),
    hi(voice, VOICE_REG.saddr, 4), hi(voice, VOICE_REG.pan, pan),
    hi(voice, 0x12, 0), hi(voice, VOICE_REG.oscConf, conf),
    hi(voice, VOICE_REG.vCtl, 3), hi(voice, VOICE_REG.oscCtl, 0),
  ];
}

function core(endpointPolicy = ENDPOINT_POLICY.STRICT_CROSSING, map = syntheticMap()) {
  return new Ics2115Core(map, { endpointPolicy, panPolicy: UNIT_CENTER });
}

test('W151 arithmetic vectors and the 32-oscillator native rate are exact', () => {
  assert.deepEqual([0, 1, 0x7f, 0x80, 0xff].map(linear8),
    [0, 256, 32512, -32768, -256]);
  assert.deepEqual([0, 128, 256, 384, 511].map((f) => interpolate9(-256, -512, f)),
    [-256, -320, -384, -448, -512]);
  assert.deepEqual([0x7ff0, 0xe600, 0xfd60].map(volumeGain), [128, 11264, 30080]);
  assert.equal(accumulatorPhase(0x1234, 0x15a5), 0x024695a5);
  assert.equal(boundaryPhase(0x1234, 0xa500), 0x024694a0);
  assert.equal(ICS_SOURCE_RATE, 33075);
  assert.equal(ACTIVE_OSC, 31);
});

test('the real 28-fragment shard maps every edge and refuses every gap', () => {
  const map = new IcsSampleMap(REAL_INDEX, REAL_SHARD);
  for (let i = 0; i < REAL_INDEX.fragments.length; i++) {
    const f = REAL_INDEX.fragments[i];
    assert.equal(map.byte(f.icsBase), REAL_SHARD[f.shardOffset]);
    assert.equal(map.byte(f.icsBase + f.len - 1), REAL_SHARD[f.shardOffset + f.len - 1]);
    if (i + 1 < REAL_INDEX.fragments.length) {
      assert.throws(() => map.byte(f.icsBase + f.len), /outside the deferred shard/);
    }
  }
  assert.throws(() => map.byte(0x3fffff), /outside the deferred shard/);
  assert.throws(() => map.byte(0x1000000), /24-bit/);
});

test('sample loader rejects malformed index, topology, bounds, and shard length', () => {
  const copy = () => structuredClone(REAL_INDEX);
  let bad = copy(); bad.rom = 'full-rom.bin';
  assert.throws(() => new IcsSampleMap(bad, REAL_SHARD), /rom mismatch/);
  bad = copy(); bad.icsBase = 0;
  assert.throws(() => new IcsSampleMap(bad, REAL_SHARD), /base must be/);
  bad = copy(); bad.fragments.pop();
  assert.throws(() => new IcsSampleMap(bad, REAL_SHARD), /exactly 28/);
  bad = copy(); bad.fragments[1].icsBase = bad.fragments[0].icsBase;
  assert.throws(() => new IcsSampleMap(bad, REAL_SHARD), /inconsistent|overlaps/);
  bad = copy(); bad.fragments[4].shardOffset++;
  assert.throws(() => new IcsSampleMap(bad, REAL_SHARD), /shard offset/);
  assert.throws(() => new IcsSampleMap(copy(), REAL_SHARD.subarray(1)), /length/);
});

test('audible construction refuses missing pan or endpoint policy; both mechanics are named', () => {
  const map = syntheticMap();
  assert.throws(() => new Ics2115Core(map), /endpointPolicy/);
  assert.throws(() => new Ics2115Core(map, { endpointPolicy: 'guess' }), /endpointPolicy/);
  assert.throws(() => new Ics2115Core(map,
    { endpointPolicy: ENDPOINT_POLICY.EQUALITY }), /panPolicy/);
  assert.throws(() => new Ics2115Core(map,
    { endpointPolicy: ENDPOINT_POLICY.EQUALITY, panPolicy: {} }), /named panPolicy/);
  assert.doesNotThrow(() => core(ENDPOINT_POLICY.EQUALITY, map));
  assert.doesNotThrow(() => core(ENDPOINT_POLICY.STRICT_CROSSING, map));
});

test('equality and strict-crossing policies differ by exactly the endpoint service', () => {
  const equality = core(ENDPOINT_POLICY.EQUALITY);
  const crossing = core(ENDPOINT_POLICY.STRICT_CROSSING);
  equality.applyLog(keyon()); crossing.applyLog(keyon());
  equality.runNative(2, false); crossing.runNative(2, false);
  assert.equal(equality.voices[0].running, false, 'equality ends on update to endpoint');
  assert.equal(crossing.voices[0].running, true, 'strict crossing retains endpoint');
  assert.equal(crossing.voices[0].phase, 512);
  crossing.runNative(1, false);
  assert.equal(crossing.voices[0].running, false, 'strict crossing ends next service');
  assert.equal(equality.status(), 2); assert.equal(crossing.status(), 2);
});

test('all live OscConf values work: $08 wraps overshoot, $00 stops silently, $20 IRQs, $A0 resets', () => {
  let chip = core();
  chip.applyLog(keyon(0, { conf: 0x08, fc: 0x0600 })); // step 768 across end 512
  chip.runNative(1, false);
  assert.equal(chip.voices[0].phase, 256, 'loop keeps next-end overshoot');
  assert.equal(chip.voices[0].running, true);
  assert.equal(chip.status(), 0);

  chip = core(); chip.applyLog(keyon(0, { conf: 0x00, fc: 0x0600 }));
  chip.runNative(1, false);
  assert.equal(chip.voices[0].running, false); assert.equal(chip.status(), 0);

  chip = core(); chip.applyLog(keyon(0, { conf: 0x20, fc: 0x0600 }));
  chip.runNative(1, false);
  assert.equal(chip.status(), 2);
  chip.applyLog([hi(0, VOICE_REG.oscConf, 0xa0)]);
  assert.equal(chip.status(), 0); assert.equal(chip.voices[0].running, false);
});

test('unsupported formats, directions, pans, ramps, controls and active counts refuse loudly', () => {
  for (const [conf, message] of [[0x01, /mu-law/], [0x02, /16-bit/],
    [0x40, /reverse/], [0x10, /bidirectional/]]) {
    assert.throws(() => core().applyLog(keyon(0, { conf })), message);
  }
  assert.throws(() => core().applyLog(keyon(0, { pan: 0x6f })), /non-center pan/);
  assert.throws(() => core().applyLog([hi(0, VOICE_REG.activeOsc, 30)]), /ActiveOsc/);
  assert.throws(() => core().applyLog([hi(0, VOICE_REG.oscCtl, 2)]), /OscCtl/);
  const chip = core(); chip.applyLog(keyon(0, { conf: 0x08, fc: 0 }));
  assert.throws(() => chip.applyLog([hi(0, VOICE_REG.vCtl, 0)]), /volume-ramp/);
});

test('IRQV is round-robin, consumes/reasserts, and the real keyoff log clears its source', () => {
  const chip = core();
  chip.applyLog([...keyon(3, { fc: 0x0600 }), ...keyon(7, { fc: 0x0600 })]);
  chip.runNative(1, false);
  assert.equal(chip.status(), 2);
  assert.equal(chip.readIrqv(), 0x63);
  assert.equal(chip.readIrqv(), 0x67, 'round-robin advances to the other source');
  assert.equal(chip.readIrqv(), 0x63, 'uncleared end condition reasserts');

  const rf = new IcsRegisterFile();
  const engine = new VoiceEngine(rf);
  const slot = engine.voices[3]; slot.icsVoice = 3; slot.state = 4;
  engine.icsShadow[3][0] = 1; rf.voices[3].hi[VOICE_REG.vCtl] = 1;
  engine.releaseVoiceIfBusy(3);
  chip.applyLog(rf.regLog);
  assert.equal(chip.readIrqv(), 0x67, 'voice 3 keyoff removed its source');
});

test('emit=false advances identical state while producing no buffered samples', () => {
  const audible = core(); const discarded = core();
  const log = keyon(0, { conf: 0x08, fc: 0x0100 });
  audible.frame(log, true); discarded.frame(log, false);
  assert.deepEqual(discarded.stateSnapshot(), audible.stateSnapshot());
  assert.ok(audible.outLen > 0); assert.equal(discarded.outLen, 0);
});

test('the exercised pre-pan path has a deterministic synthetic arithmetic hash', () => {
  const chip = core();
  chip.applyLog(keyon(0, { conf: 0x08, fc: 0x0100, vol: 0xfd60 }));
  const values = [];
  for (let i = 0; i < 12; i++) {
    values.push(chip.prePanSample(0));
    chip.runNative(1, false);
  }
  const hash = createHash('sha256').update(JSON.stringify(values)).digest('hex');
  assert.equal(hash, 'a3622101a8d107a750351f62a91388bc6008d6cce10922fb7b3abf7803629dfd');
});

test('logic-to-native scheduling carries the exact multi-frame fraction', () => {
  const chip = core();
  let total = 0;
  const counts = [];
  for (let i = 0; i < 1000; i++) { const n = chip.frame([], false); counts.push(n); total += n; }
  assert.equal(total, Math.floor(1000 * ICS_SOURCE_RATE * LOGIC_RATE_DEN / LOGIC_RATE_NUM));
  assert.deepEqual([...new Set(counts)].sort(), [558, 559]);
  assert.equal(chip.nativeClockAcc,
    (1000 * ICS_SOURCE_RATE * LOGIC_RATE_DEN) % LOGIC_RATE_NUM);
});

test('a real VoiceEngine register log reaches deterministic stereo samples and drains by contract', () => {
  const rf = new IcsRegisterFile();
  const engine = new VoiceEngine(rf);
  const slot = new VoiceSlot();
  slot.icsVoice = 0; slot.fc = 0x0100; slot.saddr = 4;
  slot.r0B = 0; slot.r0A = 0; slot.oscStrt = 0; slot.oscStrtLo = 0;
  slot.oscEnd = 0; slot.oscEndLo = 0x1000; slot.pan = 0x7f;
  slot.r09 = 0xe600; slot.oscConf = 0x08;
  engine.emitKeyon(slot);
  const chip = core();
  const n = chip.frame(rf.regLog);
  assert.equal(n, 558); assert.equal(chip.outLen, 558);
  const left = new Uint8Array(chip.out[0].buffer, 0, chip.outLen * 4);
  const right = new Uint8Array(chip.out[1].buffer, 0, chip.outLen * 4);
  const hash = createHash('sha256').update(left).update(right).digest('hex');
  assert.equal(hash, '564b35650cc7faa4114eda8b0cd78fd28d9edcfef89f973ea75acc664a0c7e8e');
  const dests = [new Float32Array(600), new Float32Array(600)];
  assert.equal(chip.drain(600, dests), 558); assert.equal(chip.outLen, 0);
  assert.deepEqual(Array.from(dests[0].subarray(0, 16)), Array.from(dests[1].subarray(0, 16)));
});
