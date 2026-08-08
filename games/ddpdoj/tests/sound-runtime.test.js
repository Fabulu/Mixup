import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { SOUND, postWrapper, soundFrameInput } from '../src/sound.js';
import { ENDPOINT_POLICY, boundaryPhase, volumeGain } from '../src/ics2115.js';
import { IRQ_TIMING_POLICY, soundRuntimeFromAssets } from '../src/soundruntime.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SND = fileURLToPath(new URL('../assets/snd/', import.meta.url));
const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));

const bytes = (name) => new Uint8Array(gunzipSync(readFileSync(SND + name)));
const text = (name) => gunzipSync(readFileSync(SND + name)).toString('utf8');
const ASSETS = Object.freeze({
  driverParams: text('driver-params.json.gz'),
  bgmScore: text('bgm-score.json.gz'),
  sampleIndex: text('sample.index.json.gz'),
  sampleShard: bytes('sample.shard.u8.gz'),
});

// Deliberately synthetic structural policy. It is not an ICS center-pan claim.
const SYNTHETIC_PAN = Object.freeze({
  name: 'synthetic-unity-structural-test',
  centerGains(volAcc) { const gain = volumeGain(volAcc); return [gain, gain]; },
});
const POLICIES = Object.freeze({
  endpointPolicy: ENDPOINT_POLICY.EQUALITY,
  panPolicy: SYNTHETIC_PAN,
  irqTimingPolicy: IRQ_TIMING_POLICY.AFTER_NATIVE_FRAME,
});

function runtime(policies = POLICIES, assets = ASSETS) {
  return soundRuntimeFromAssets(assets, policies);
}

function game(sink = null) {
  return new Game(new Uint8Array(readFileSync(SEED)),
    JSON.parse(readFileSync(TABLES, 'utf8')),
    { palCatchUp: false, soundSink: sink });
}

function emptyMailbox(g) {
  g.ram.setU16(SOUND.head, 0);
  g.ram.setU16(SOUND.tail, 0);
  g.ram.setU16(SOUND.gateDual, 0);
  g.ram.setU16(SOUND.masterVol, 0);
  g.ram.setU8(SOUND.debounceA, 0);
  g.ram.setU8(SOUND.debounceB, 0);
}

function pcmHash(rt) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(rt.core.out[0].buffer, 0, rt.outLen * 4));
  hash.update(Buffer.from(rt.core.out[1].buffer, 0, rt.outLen * 4));
  return hash.digest('hex');
}

test('compact Game boundary preserves precisely zero or four door bytes', () => {
  assert.deepEqual(Array.from(soundFrameInput(null)), []);
  assert.deepEqual(Array.from(soundFrameInput({
    type: 0x12, pan: 0x34, id: 0x56, packedChannel: 0x79,
  })), [0x12, 0x34, 0x56, 0x79]);
  assert.throws(() => soundFrameInput({ type: 256, pan: 0, id: 0, chan: 0 }),
    /outside 0\.\.255/);
  assert.throws(() => game({}), /soundSink must expose frame/);
  const noSound = game();
  emptyMailbox(noSound);
  noSound.step(0xffff);
  assert.deepEqual(Array.from(noSound.soundInput), []);
  assert.equal(noSound.logicFrame, 1);
});

test('runtime loudly refuses missing assets, malformed inputs, and every implicit policy', () => {
  assert.throws(() => soundRuntimeFromAssets({}, POLICIES), /missing asset driverParams/);
  assert.throws(() => soundRuntimeFromAssets({ ...ASSETS, sampleShard: [] }, POLICIES),
    /sampleShard must be a Uint8Array/);
  assert.throws(() => runtime({ endpointPolicy: ENDPOINT_POLICY.EQUALITY,
    panPolicy: SYNTHETIC_PAN }), /explicit irqTimingPolicy/);
  assert.throws(() => runtime({ irqTimingPolicy: IRQ_TIMING_POLICY.AFTER_NATIVE_FRAME,
    panPolicy: SYNTHETIC_PAN }), /requires endpointPolicy/);
  assert.throws(() => runtime({ irqTimingPolicy: IRQ_TIMING_POLICY.AFTER_NATIVE_FRAME,
    endpointPolicy: ENDPOINT_POLICY.EQUALITY }), /explicit named panPolicy/);
  const badIndex = JSON.parse(ASSETS.sampleIndex);
  badIndex.shardBytes++;
  assert.throws(() => runtime(POLICIES, { ...ASSETS, sampleIndex: badIndex }),
    /complete static/);
  const rt = runtime();
  assert.throws(() => rt.frame([]), /must be a Uint8Array/);
  assert.throws(() => rt.frame(Uint8Array.of(1, 2, 3)), /0 or 4 bytes/);
});

test('real Game SFX wrapper reaches registers, PCM, native IRQ keyoff, and allocator recycling', () => {
  const rt = runtime();
  const g = game(rt);
  emptyMailbox(g);
  assert.equal(postWrapper(g.ram, g.sound, 0x28c714), true);
  g.step(0xffff);

  assert.deepEqual(Array.from(g.soundInput), [0x01, 0x4e, 0x24, 0x0c]);
  assert.equal(rt.lastFrame.door.selector, 0x24);
  assert.equal(rt.lastFrame.door.channel, 3);
  assert.equal(rt.lastFrame.nativeFrames, 558);
  while (!rt.core.voices[8].running) rt.frame(new Uint8Array(0));
  assert.ok(rt.lastFrame.registerLog.length > 30);
  assert.deepEqual(rt.lastFrame.irqs, [], 'the authentic FC does not end in 19 ms');
  assert.ok(rt.outLen > 0);
  assert.ok(rt.core.out[0].subarray(0, rt.outLen).some((sample) => sample !== 0));

  const ended = [];
  for (let guard = 0; !rt.lastFrame.irqs.length; guard++) {
    assert.ok(guard < 200, 'selector $24 must eventually raise oscillator IRQ');
    rt.frame(new Uint8Array(0), false);
  }
  ended.push(rt.lastFrame.irqs[0].voice);
  assert.ok(rt.lastFrame.irqs[0].registerLog.length > 10);
  assert.equal(rt.chain.engine.icsShadow[8][0], 0);
  for (let i = 1; i < 25; i++) {
    g.ram.setU8(SOUND.debounceB, 0);
    assert.equal(postWrapper(g.ram, g.sound, 0x28c714), true);
    g.step(0xffff);
    for (let guard = 0; !rt.lastFrame.irqs.length; guard++) {
      assert.ok(guard < 200, 'each selector $24 voice must eventually end');
      rt.frame(new Uint8Array(0), false);
    }
    ended.push(rt.lastFrame.irqs[0].voice);
  }
  assert.deepEqual(ended, [...Array.from({ length: 24 }, (_, i) => i + 8), 8]);
  assert.equal(rt.frameCount, rt.core.frameCount); // one owner, no duplicate advancement
  assert.equal(rt.chain.keyonCount, 25);
  assert.equal(pcmHash(rt), '2b98e2758ab15110d9d362b8c2096ba04cd265ca692f96555fc59e092903e1f0');
});

test('a real streaming leaf starts a live BGM cue and reaches stereo samples', () => {
  const rt = runtime();
  const g = game(rt);
  emptyMailbox(g);
  // `$28CB9C` is a real type-$12 resolver leaf whose group maps to cue 0.
  rt.selectScoreGroup(1);
  assert.equal(postWrapper(g.ram, g.sound, 0x28cb9c), true);
  g.step(0xffff);
  assert.deepEqual(Array.from(g.soundInput), [0x12, 0xeb, 0x00, 0x00]);
  assert.equal(rt.lastFrame.door.cmd, 0x12);
  assert.equal(rt.chain.sequencer.cueId, 0);
  assert.equal(rt.chain.sequencer.cueActive, true);
  while (rt.chain.sequencer.keyonCount === 0) rt.frame(new Uint8Array(0));
  assert.ok(rt.chain.sequencer.keyonCount > 0);
  assert.ok(rt.lastFrame.registerLog.length > 100);
  assert.ok(rt.core.out[0].subarray(0, rt.outLen).some((sample) => sample !== 0));
  assert.equal(pcmHash(rt), '1b03ea2580402ecb0f5e65d2b678ab26995e4a3bb3e47d5897c9ee8475281861');
  const before = rt.outLen;
  const dests = [new Float32Array(before), new Float32Array(before)];
  assert.equal(rt.drain(before, dests), before);
  assert.equal(rt.outLen, 0);
  assert.ok(dests[0].some((sample) => sample !== 0));
});

test('live BGM attack may begin before its forward-loop return boundary', () => {
  const rt = runtime();
  rt.chain.rf.resetFrame();
  rt.chain.enqueueDoor({ type: 0x11, pan: 0xff, id: 9, packedChannel: 0, lf: 0 });
  rt.chain.runMainLoop();
  rt.chain.tick(false);
  rt.core.applyLog(rt.chain.rf.regLog);
  const voice = rt.core.voices[0];
  assert.equal(voice.running, true);
  assert.ok(voice.phase < boundaryPhase(voice.u16(0x02), voice.u16(0x03)));
});

test('fractional native clock, emit=false, and empty frames preserve one deterministic state', () => {
  const audible = runtime();
  const silent = runtime();
  const counts = [];
  for (let i = 0; i < 264; i++) {
    const input = i === 0 ? Uint8Array.of(2, 0xff, 36, 0) : new Uint8Array(0);
    counts.push(audible.frame(input, true));
    silent.frame(input, false);
  }
  assert.equal(counts.reduce((a, b) => a + b, 0),
    Math.floor(33075 * 264 * 264 / 15625));
  assert.deepEqual(new Set(counts), new Set([558, 559]));
  assert.deepEqual(silent.core.stateSnapshot(), audible.core.stateSnapshot());
  assert.equal(silent.outLen, 0);
  assert.ok(audible.outLen > 0);
  assert.equal(audible.lastFrame.irqs.length, 0); // cmd $02 is the proven loop form
});

test('strict-crossing structural mechanic can interpolate through its shard edge', () => {
  const rt = runtime({ ...POLICIES, endpointPolicy: ENDPOINT_POLICY.STRICT_CROSSING });
  rt.frame(Uint8Array.of(2, 0xff, 36, 0));
  for (let i = 1; i < 264; i++) rt.frame(new Uint8Array(0));
  assert.equal(rt.lastFrame.irqs.length, 0);
  assert.ok(rt.outLen > 147000);
  assert.ok(rt.core.out[0].subarray(0, rt.outLen).some((sample) => sample !== 0));
});

test('same-boundary oscillator IRQs key off in IRQV round-robin order', () => {
  const rt = runtime();
  rt.chain.enqueueDoor({ type: 0, pan: 0xff, id: 36, packedChannel: 0, lf: 0 });
  rt.frame(Uint8Array.of(0, 0xff, 36, 0));
  for (let guard = 0; !rt.lastFrame.irqs.length; guard++) {
    assert.ok(guard < 200, 'paired voices must reach their common endpoint');
    rt.frame(new Uint8Array(0), false);
  }
  assert.deepEqual(rt.lastFrame.irqs.map((irq) => irq.voice), [8, 9]);
  assert.equal(rt.chain.engine.icsShadow[8][0], 0);
  assert.equal(rt.chain.engine.icsShadow[9][0], 0);
  assert.equal(rt.core.status(), 0);
});

test('cmd $0E waits for the next complete Game-frame record', () => {
  const rt = runtime();
  rt.frame(Uint8Array.of(2, 0xff, 36, 0)); // looping selector 36
  const before = rt.chain.queue.length;
  rt.frame(Uint8Array.of(0x0e, 0, 36, 0));
  assert.equal(before, 0);
  assert.equal(rt.chain.queue.length, 1);
  assert.equal(rt.chain.loop.dispatched.at(-1).cmd, 2);
  rt.frame(Uint8Array.of(0x34, 0x12, 0, 0));
  assert.equal(rt.chain.queue.length, 0);
  assert.equal(rt.chain.loop.dispatched.at(-1).cmd, 0x0e);
  assert.equal(rt.chain.loop.dispatched.at(-1).payload.cmd, 0x34);
});
