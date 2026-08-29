// W160 live audible failure regression. Raw ROM/register captures establish
// meanings; deterministic PCM is secondary and cannot prove audible identity.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioController } from '../../../shared/audio.js';
import { sfxRateToOscFc } from '../src/driverparams.js';
import {
  STAGE1_SEED_SOUND, soundRuntimeFromAssets, soundRuntimeFromSnapshot,
  soundRuntimeFromStage1Seed,
} from '../src/soundruntime.js';
import { APPROVED_SOUND_POLICIES } from '../src/soundpolicy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = (name) => JSON.parse(gunzipSync(readFileSync(join(ROOT, 'assets', 'snd', name))));
const ASSETS = Object.freeze({
  driverParams: text('driver-params.json.gz'),
  bgmScore: text('bgm-score.json.gz'),
  sampleIndex: text('sample.index.json.gz'),
  sampleShard: new Uint8Array(gunzipSync(readFileSync(join(ROOT, 'assets', 'snd',
    'sample.shard.u8.gz')))),
});
const EMPTY = new Uint8Array(0);

class FakeAudioContext {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, getChannelData: (channel) => data[channel] };
  }
  createBufferSource() { return { connect() {}, start() {} }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

function withFakeAudioContext(fn) {
  const old = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try { fn(); } finally {
    if (old === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = old;
  }
}

function trackingChip() {
  return { sourceRate: 48000, channels: 2, outLen: 0, calls: [],
    frame(log, emit) { this.calls.push({ log: Array.from(log), emit }); },
    drain() { return 0; } };
}

test('W160 `$0B92` converts SFX Hz through live `[$6168]` before OscFC', () => {
  const rt = soundRuntimeFromAssets(ASSETS, APPROVED_SOUND_POLICIES);
  assert.equal(rt.chain.driverParams.sourceRateHz, 0x8133);
  assert.equal(rt.chain.driverParams.sfx(0).sampleRateHz, 0x5622);
  assert.equal(rt.chain.driverParams.sfx(0).oscFc, 0x02aa);
  assert.equal(rt.chain.driverParams.sfx(36).sampleRateHz, 0x7d00);
  assert.equal(rt.chain.driverParams.sfx(36).oscFc, 0x03de);
  assert.equal(sfxRateToOscFc(0x5622, 0x8133), 0x02aa);
  assert.deepEqual(new Map([...new Set(rt.chain.driverParams.sfxEntries
    .map((record) => record.sampleRateHz))].map((rate) =>
    [rate, sfxRateToOscFc(rate, 0x8133)])), new Map([
    [0x5622, 0x02aa], [0x3e80, 0x01ef], [0x2b11, 0x0155], [0x7d00, 0x03de],
  ]), 'all four live SFX rate families convert exactly');

  let beforeFinal = 0;
  let count = rt.frame(Uint8Array.of(0x01, 0xa0, 0x00, 0x00), false);
  assert.equal(rt.chain.engine.voices[0].fc, 0x02aa);
  while (!rt.core.voices[8].running) count = rt.frame(EMPTY, false);
  while (rt.lastFrame.irqs.length === 0) {
    beforeFinal += count;
    assert.ok(rt.frameCount < 100, 'selector 0 must end, but not as a 19 ms pop');
    count = rt.frame(EMPTY, false);
  }
  const activeNativeSamples = beforeFinal + rt.lastFrame.irqs[0].nativeFrame + 1;
  assert.equal(activeNativeSamples, 20_500);
  assert.ok(activeNativeSamples / rt.sourceRate > 0.619);
  assert.equal(rt.outLen, 0, 'lifetime measurement advances state without PCM backlog');
});

test('W160 stage-one seed pre-roll has exact 1562/1563/2000 boundaries', () => {
  assert.deepEqual(STAGE1_SEED_SOUND, {
    startFrame: 1562, startVideoFrame: 1597,
    startLeaf: 0x28cb9c, startDoor: [0x12, 0xeb, 0, 0],
    maxPreRollTicks: 8192,
  });
  const atStart = soundRuntimeFromStage1Seed(
    ASSETS, APPROVED_SOUND_POLICIES, 1562, 1597,
  );
  assert.equal(atStart.frameCount, 0);
  assert.equal(atStart.chain.sequencer.cueActive, false);

  const afterStart = soundRuntimeFromStage1Seed(
    ASSETS, APPROVED_SOUND_POLICIES, 1563, 1598,
  );
  assert.equal(afterStart.frameCount, 1);
  assert.equal(afterStart.chain.sequencer.cueId, 0);
  assert.equal(afterStart.chain.sequencer.cueActive, true);
  assert.equal(afterStart.outLen, 0);

  const atPublishedSeed = soundRuntimeFromStage1Seed(ASSETS,
    APPROVED_SOUND_POLICIES, 2000, 2036);
  assert.equal(atPublishedSeed.frameCount, 439);
  assert.equal(atPublishedSeed.core.frameCount, 439);
  assert.equal(atPublishedSeed.chain.sequencer.cueId, 0);
  assert.equal(atPublishedSeed.chain.sequencer.cueActive, true);
  assert.ok(atPublishedSeed.chain.sequencer.keyonCount > 0);
  assert.equal(atPublishedSeed.outLen, 0, 'pre-roll creates state, never stale audio');
});

test('W160 sound snapshot resumes arbitrary replay audio without pre-roll', () => {
  const original = soundRuntimeFromStage1Seed(
    ASSETS, APPROVED_SOUND_POLICIES, 2000, 2036,
  );
  original.command(Uint8Array.of(0x01, 0xa0, 0x00, 0x00));
  const snapshot = JSON.parse(JSON.stringify(original.stateSnapshot()));
  const restored = soundRuntimeFromSnapshot(
    ASSETS, APPROVED_SOUND_POLICIES, snapshot,
  );
  assert.deepEqual(restored.stateSnapshot(), snapshot,
    'the checkpoint preserves pending Z80, sequencer, register, and oscillator state');

  for (let tick = 0; tick < 40; tick++) {
    assert.equal(restored.tick(true), original.tick(true));
  }
  assert.deepEqual(restored.stateSnapshot(), original.stateSnapshot(),
    'both runtimes remain state-identical after future sound ticks');
  assert.equal(restored.outLen, original.outLen);
  const expected = [new Float32Array(original.outLen), new Float32Array(original.outLen)];
  const actual = [new Float32Array(restored.outLen), new Float32Array(restored.outLen)];
  assert.equal(original.drain(original.outLen, expected), expected[0].length);
  assert.equal(restored.drain(restored.outLen, actual), actual[0].length);
  assert.deepEqual(actual, expected, 'future PCM resumes sample-exactly from the checkpoint');
});

test('W160 Stage 1 pre-roll rejects an unbounded video-frame claim', () => {
  assert.throws(() => soundRuntimeFromStage1Seed(
    ASSETS, APPROVED_SOUND_POLICIES, 9000,
    STAGE1_SEED_SOUND.startVideoFrame + STAGE1_SEED_SOUND.maxPreRollTicks + 1,
  ), /outside the bounded Stage 1 pre-roll window/);
});

test('W160 sound checkpoint rejects timer stalls', () => {
  const runtime = soundRuntimeFromAssets(ASSETS, APPROVED_SOUND_POLICIES);
  const hugeClock = runtime.stateSnapshot();
  hugeClock.timerClockAcc = Number.MAX_SAFE_INTEGER;
  assert.throws(() => soundRuntimeFromSnapshot(
    ASSETS, APPROVED_SOUND_POLICIES, hugeClock,
  ), /timerClockAcc must be below/);

  const hugeHold = runtime.stateSnapshot();
  hugeHold.timerHoldFrames = Number.MAX_SAFE_INTEGER;
  assert.throws(() => soundRuntimeFromSnapshot(
    ASSETS, APPROVED_SOUND_POLICIES, hugeHold,
  ), /timerHoldFrames must be zero or one/);
});

test('W160 asset-first controller advances silently then attaches the same chip', () => {
  withFakeAudioContext(() => {
    const controller = new AudioController(null);
    controller.frame(Uint8Array.of(1));
    const chip = trackingChip();
    controller.setChip(chip);
    controller.frame(Uint8Array.of(2));
    assert.deepEqual(chip.calls, [
      { log: [1], emit: false }, { log: [2], emit: false },
    ]);
    controller.arm();
    assert.equal(controller.out.chip, chip);
    controller.frame(Uint8Array.of(3));
    controller.pump();
    assert.deepEqual(chip.calls, [
      { log: [1], emit: false }, { log: [2], emit: false },
      { log: [3], emit: true },
    ], 'pending/live seam applies every frame exactly once');
  });
});

test('W160 gesture-first controller catches state up before audible ownership', () => {
  withFakeAudioContext(() => {
    const controller = new AudioController(null);
    controller.frame(Uint8Array.of(4));
    controller.arm();
    assert.equal(controller.status, 'loading');
    const chip = trackingChip();
    controller.setChip(chip);
    assert.equal(controller.out.chip, chip);
    assert.deepEqual(chip.calls, [{ log: [4], emit: false }]);
    controller.frame(Uint8Array.of(5));
    controller.pump();
    assert.deepEqual(chip.calls, [
      { log: [4], emit: false }, { log: [5], emit: true },
    ]);
  });
});

test('W160 delayed asset arrival joins seed pre-roll and pending Game input once', () => {
  withFakeAudioContext(() => {
    const controller = new AudioController(null);
    controller.frame(Uint8Array.of(0x01, 0xa0, 0x00, 0x00));
    const rt = soundRuntimeFromStage1Seed(
      ASSETS, APPROVED_SOUND_POLICIES, 2000, 2036,
    );
    assert.equal(rt.frameCount, 439);
    controller.setChip(rt);
    assert.equal(rt.frameCount, 440);
    assert.equal(rt.lastFrame.door.selector, 0);
    assert.equal(rt.chain.sequencer.cueId, 0);
    assert.equal(rt.outLen, 0);
    controller.arm();
    assert.equal(controller.out.chip, rt);
    assert.equal(rt.frameCount, 440, 'attaching AudioOut does not replay the seam');
    controller.frame(EMPTY);
    controller.pump();
    assert.equal(rt.frameCount, 441);
    assert.ok(controller.out.resampler.outLen > 0,
      'only the first post-gesture frame reaches the audible resampler');
  });
});

test('W160 browser boot uses singleton stateful attach, not a gesture-time factory', () => {
  const source = readFileSync(join(ROOT, 'src', 'web', 'app.js'), 'utf8');
  assert.match(source,
    /soundRuntimeFromStage1Seed\(assets,[\s\S]*demo\.seedLf, demo\.seedVf\)/);
  assert.match(source, /sound\.setChip\(runtime\)/);
  assert.doesNotMatch(source, /sound\.setFactory\(/);
});
