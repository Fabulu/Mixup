import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { AudioController, MAX_BACKLOG_FRAMES } from '../../../shared/audio.js';
import { driverParamsFromJson } from '../src/driverparams.js';
import { scoreFromJson } from '../src/bgmscore.js';
import { parseEvent } from '../src/sequencer.js';
import { ENDPOINT_POLICY, IcsSampleMap, accumulatorPhase, boundaryPhase } from '../src/ics2115.js';
import { IRQ_TIMING_POLICY, SoundRuntime } from '../src/soundruntime.js';
import {
  AMD_US5659466_CENTER_APPROXIMATION, APPROVED_SOUND_POLICIES,
} from '../src/soundpolicy.js';
import { loadSoundAssets } from '../src/web/assets.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SND = fileURLToPath(new URL('../assets/snd/', import.meta.url));
const text = (name) => gunzipSync(readFileSync(SND + name)).toString('utf8');
const bytes = (name) => new Uint8Array(gunzipSync(readFileSync(SND + name)));
const PARAMS = driverParamsFromJson(text('driver-params.json.gz'));
const SCORE = scoreFromJson(text('bgm-score.json.gz'));
const INDEX = JSON.parse(text('sample.index.json.gz'));
const SHARD = bytes('sample.shard.u8.gz');
const MAP = new IcsSampleMap(INDEX, SHARD);
const runtime = () => new SoundRuntime(PARAMS, SCORE, MAP, APPROVED_SOUND_POLICIES);

function interval(record, kind, index) {
  const base = (record.r11 & 15) * 0x100000;
  const attack = base + Math.floor(accumulatorPhase(record.r0A, record.r0B) / 512);
  const loop = base + Math.floor((kind === 'sfx'
    ? boundaryPhase(record.r0A, record.r0B)
    : boundaryPhase(record.r02, record.r03)) / 512);
  const end = base + Math.floor(boundaryPhase(record.r04, record.r05) / 512) + 2;
  const mayLoop = kind === 'sfx' || (record.r00 & 8);
  return { kind, index, start: mayLoop ? Math.min(attack, loop) : attack, end };
}

function reachableBgm() {
  const result = new Set([0]);
  for (const cue of SCORE.cues) {
    const selectors = new Set(cue.rowStream);
    for (let track = 0; track < 8; track++) for (const selector of selectors) {
      const stream = cue.noteStreams[track * cue.df + selector];
      for (let pos = 0; pos < stream.length;) {
        const event = parseEvent(stream, pos);
        if (event.descriptor) result.add(event.descriptor - 1);
        pos = event.next;
      }
    }
  }
  return result;
}

test('W158 AMD patent-derived center approximation freezes the four approved rows', () => {
  const rows = [
    [0x7ff0, [99, 93]], [0xe600, [7872, 7472]],
    [0xfd60, [22656, 21056]], [0xffff, [25280, 23680]],
  ];
  assert.equal(AMD_US5659466_CENTER_APPROXIMATION.name,
    'amd-us5659466-center-approximation');
  assert.equal(AMD_US5659466_CENTER_APPROXIMATION.approximation, true);
  assert.equal(APPROVED_SOUND_POLICIES.endpointPolicy, ENDPOINT_POLICY.STRICT_CROSSING);
  assert.equal(APPROVED_SOUND_POLICIES.irqTimingPolicy,
    IRQ_TIMING_POLICY.AFTER_NATIVE_FRAME);
  for (const [volAcc, expected] of rows) {
    assert.deepEqual(AMD_US5659466_CENTER_APPROXIMATION.centerGains(volAcc), expected);
  }
  // Deliberate arithmetic counterexample: applying 115/140 is observably not
  // the approved policy, so the fixture does not merely test stereo shape.
  assert.notDeepEqual([100, 94], rows[0][1]);
});

test('W158 every reachable descriptor edge and interpolation neighbour maps', () => {
  const descriptors = Array.from({ length: 69 }, (_, i) => interval(PARAMS.sfx(i), 'sfx', i));
  const bgm = [...reachableBgm()].sort((a, b) => a - b)
    .map((i) => interval(PARAMS.bgm(i), 'bgm', i));
  descriptors.push(...bgm);
  assert.equal(descriptors.length, 228);
  assert.equal(bgm.length, 159);
  for (const d of descriptors) {
    assert.doesNotThrow(() => MAP.byte(d.start), `${d.kind}${d.index} start`);
    assert.doesNotThrow(() => MAP.byte(d.end - 1), `${d.kind}${d.index} neighbour`);
  }
  assert.doesNotThrow(() => MAP.byte(0x69fdf0), 'cue 9 regression address');
});

test('W158 all 69 live SFX selectors execute loop command form without shard refusal', () => {
  for (let selector = 0; selector < 69; selector++) {
    const rt = runtime();
    assert.doesNotThrow(() => rt.frame(Uint8Array.of(0x02, 0xff, selector, 0), false),
      `SFX selector ${selector}`);
    assert.equal(rt.lastFrame.door.selector, selector);
    assert.ok(rt.chain.keyonCount > 0);
  }
});

test('W158 all eleven BGM cues reach a keyon and advance without shard refusal', () => {
  for (let cue = 0; cue < 11; cue++) {
    const rt = runtime();
    rt.frame(Uint8Array.of(0x11, 0xff, cue, 0), false);
    for (let frame = 1; frame < 192 && rt.chain.sequencer.keyonCount === 0; frame++) {
      rt.frame(new Uint8Array(0), false);
    }
    assert.equal(rt.chain.sequencer.cueId, cue);
    assert.ok(rt.chain.sequencer.keyonCount > 0, `cue ${cue} reached a live keyon`);
  }
});

test('W158 approved production policies produce deterministic nonzero stereo PCM', () => {
  const rt = runtime();
  rt.frame(Uint8Array.of(0x01, 0xff, 36, 0), true);
  while (!rt.core.voices[8].running) rt.frame(new Uint8Array(0), true);
  assert.ok(rt.outLen > 0);
  assert.ok(rt.core.out[0].subarray(0, rt.outLen).some((x) => x !== 0));
  assert.ok(rt.core.out[1].subarray(0, rt.outLen).some((x) => x !== 0));
  const h = createHash('sha256');
  h.update(new Uint8Array(rt.core.out[0].buffer, 0, rt.outLen * 4));
  h.update(new Uint8Array(rt.core.out[1].buffer, 0, rt.outLen * 4));
  assert.equal(h.digest('hex'), 'c85b5731fa226236e9a3bbf196d52f06cea4846c7fa442248c654567fc046ec6');
});

test('W158 deferred loader fetches exactly four sound bodies and rejects manifest drift', async () => {
  const manifest = JSON.parse(readFileSync(ROOT + '/assets/manifest.json', 'utf8'));
  const names = [];
  const reader = async (name) => { names.push(name); return new Uint8Array(readFileSync(ROOT + '/assets/' + name)); };
  const assets = await loadSoundAssets(reader, manifest);
  assert.deepEqual(names.sort(), [manifest.sound.bgmScore, manifest.sound.driverParams,
    manifest.sound.index, manifest.sound.shard].sort());
  assert.equal(assets.sampleShard.length, 3_612_873);
  const bad = structuredClone(manifest); bad.sound.shard = '../full-rom.bin';
  await assert.rejects(() => loadSoundAssets(reader, bad), /sound.sampleShard/);
  const badTopology = structuredClone(manifest); badTopology.sound.fragments = 5;
  await assert.rejects(() => loadSoundAssets(reader, badTopology), /static command union/);
});

class FakeAudioContext {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; this.resumes = 0; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, getChannelData: (c) => data[c] };
  }
  createBufferSource() { return { connect() {}, start() {} }; }
  resume() { this.resumes++; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

test('W158 gesture-first deferred controller owns one chip, backlog, mute and firewall', () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const errors = [];
    const controller = new AudioController(null, (e) => errors.push(e));
    controller.frame(Uint8Array.of(1));
    assert.deepEqual(controller.stats(), { status: 'locked', preReadyFrames: 1 });
    controller.arm();
    assert.equal(controller.stats().status, 'loading');
    assert.equal(controller.ctx.resumes, 1);
    const calls = [];
    const chip = { sourceRate: 48000, channels: 2, outLen: 0,
      frame(log, emit) { calls.push([Array.from(log), emit]); }, drain() { return 0; } };
    let built = 0;
    const factory = () => { built++; return chip; };
    controller.setFactory(factory);
    assert.equal(built, 1, 'asset completion attaches the singleton immediately');
    controller.arm();
    assert.equal(built, 1, 'second arm resumes without duplicate construction');
    for (let i = 0; i < MAX_BACKLOG_FRAMES + 3; i++) controller.frame(Uint8Array.of(i));
    controller.pump();
    assert.equal(calls.length, MAX_BACKLOG_FRAMES + 3);
    assert.equal(calls.filter((x) => x[1] === false).length, 3, 'backlog frames advance silently');
    controller.setMuted(true);
    controller.frame(Uint8Array.of(99)); controller.pump();
    assert.equal(calls.length, MAX_BACKLOG_FRAMES + 4, 'mute keeps synth state advancing');
    assert.equal(controller.stats().status, 'muted');
    assert.deepEqual(errors, []);
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('W158 page has accessible non-overlapping sound UI and no sound title tooltip', () => {
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  const button = html.match(/<button id="sound"[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.match(button, /aria-label="Enable or mute game sound"/);
  assert.doesNotMatch(button, /\btitle=/);
  assert.match(html, /#sound-state[^}]*pointer-events:\s*none/);
  assert.match(html, /app\.sound\.arm\(\);\s*\/\/ synchronous gesture boundary/);
  assert.match(html, /two permanently[\s\S]*approximations/i);
});
