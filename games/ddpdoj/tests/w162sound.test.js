// W162: stage-1 BGM bank and timer regressions. ROM/listing defines the score;
// keyon.tsv is a secondary timeline witness and never a production input.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseScoreGroups, scoreFromJson, scoreToJson } from '../src/bgmscore.js';
import { unpack } from '../src/ics.js';
import { Ram } from '../src/ram.js';
import { SOUND, SoundState, STREAMING_LEAVES,
  postWrapperWithRuntime } from '../src/sound.js';
import { soundRuntimeFromAssets } from '../src/soundruntime.js';
import { APPROVED_SOUND_POLICIES } from '../src/soundpolicy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (name) => JSON.parse(gunzipSync(readFileSync(join(ROOT, 'assets', 'snd', name))));
const ASSETS = Object.freeze({
  driverParams: json('driver-params.json.gz'),
  bgmScore: json('bgm-score.json.gz'),
  sampleIndex: json('sample.index.json.gz'),
  sampleShard: new Uint8Array(gunzipSync(readFileSync(join(ROOT, 'assets', 'snd',
    'sample.shard.u8.gz')))),
});

test('W162 `$28B884/$28CF36` exports all seven banks and stage leaf selects group 1 cue 0', () => {
  const rom = new Uint8Array(readFileSync(join(ROOT, 'rip', 'sound', 'maincpu.bin')));
  const parsed = parseScoreGroups(rom);
  const artifact = scoreFromJson(ASSETS.bgmScore);
  assert.deepEqual(parsed.groups.map((group) => group.cueCount), [11, 2, 2, 2, 1, 2, 1]);
  assert.deepEqual(scoreToJson(parsed), (({ note, ...score }) => score)(ASSETS.bgmScore));
  assert.deepEqual(STREAMING_LEAVES.get(0x28cb9c),
    { index: 11, group: 1, id: 0, type: 0x12 });
  assert.equal(artifact.groups[1].cues[0].rowlen, 44);
  assert.equal(artifact.groups[1].cues[0].df, 28);
  assert.deepEqual(artifact.groups[1].cues[0].noteStreams[0].slice(0, 8),
    [0xcf, 0x03, 0x2a, 0x13, 0x06, 0xaa, 0x13, 0x36]);
  assert.deepEqual(artifact.groups[1].cues[0].noteStreams[56].slice(0, 4),
    [0xcf, 0x87, 0x20, 0x51]);
});

test('W162 stage cue 0 sustains the authentic voice order and hardware timer cadence', () => {
  const rt = soundRuntimeFromAssets(ASSETS, APPROVED_SOUND_POLICIES);
  rt.selectScoreGroup(1);
  rt.timerHoldFrames = 1; // captured NMI/timer phase at lf1562
  const produced = [];
  const activeFrames = new Set();
  for (let lf = 1562; lf <= 1999; lf++) {
    rt.frame(lf === 1562 ? Uint8Array.of(0x12, 0xeb, 0, 0) : new Uint8Array(0), false);
    for (const packed of rt.lastFrame.registerLog) {
      const row = unpack(packed);
      if (row.voice < 8 && row.reg === 0x10 && row.half === 2 && row.data === 0) {
        produced.push({ lf, voice: row.voice });
        activeFrames.add(lf);
      }
    }
  }
  assert.deepEqual(produced.slice(0, 14), [
    ...[0, 1, 2, 3, 4, 6, 7].map((voice) => ({ lf: 1564, voice })),
    { lf: 1568, voice: 4 }, { lf: 1571, voice: 3 }, { lf: 1571, voice: 4 },
    { lf: 1574, voice: 4 }, { lf: 1578, voice: 1 },
    { lf: 1578, voice: 3 }, { lf: 1578, voice: 4 },
  ]);
  assert.ok(produced.length >= 186, 'stage music must not regress to W160\'s 19 sparse keyons');
  assert.ok(activeFrames.size >= 120, 'cue 0 must remain active across the pre-seed timeline');
  assert.equal(rt.chain.sequencer.raw616c, 0x87);
  assert.equal(rt.chain.driverParams.timer0Preset(0x87), 0x74);
  assert.equal(rt.timerIrqCount, 396);

  const lines = readFileSync(join(ROOT, 'rip', 'sound', 'keyon.tsv'), 'utf8')
    .trim().split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const authenticVoices = lines.map((line) => {
    const fields = line.split('\t');
    return Object.fromEntries(headers.map((name, i) => [name, fields[i]]));
  }).filter((row) => +row.lf >= 1564 && +row.lf <= 1999 && +row.voice < 8)
    .map((row) => +row.voice);
  assert.equal(authenticVoices.length, 187);
  assert.deepEqual(produced.map((row) => row.voice), authenticVoices.slice(0, produced.length),
    'production follows the full captured track/keyon order without oracle injection');
});

test('W162 timer and group loaders reject drift loudly', () => {
  const badScore = structuredClone(ASSETS.bgmScore);
  badScore.groups[1].descriptorAddr++;
  assert.throws(() => scoreFromJson(badScore), /inventory/);
  const rt = soundRuntimeFromAssets(ASSETS, APPROVED_SOUND_POLICIES);
  assert.throws(() => rt.selectScoreGroup(7), /outside 0\.\.6/);
  assert.throws(() => rt.chain.driverParams.timer0Preset(0xc9), /0\.\.200/);
});

test('W162 the Game-facing leaf boundary orders group upload before its four-byte post', () => {
  const ram = new Ram();
  const state = new SoundState();
  ram.setU16(SOUND.gateDual, 0);
  ram.setU16(SOUND.masterVol, 0);
  const calls = [];
  const sink = { selectScoreGroup(group) { calls.push(group); } };
  assert.equal(postWrapperWithRuntime(ram, state, sink, 0x28cb9c), true);
  assert.deepEqual(calls, [1]);
  assert.equal(ram.u16(SOUND.tail), 4);
  assert.equal(ram.u32(SOUND.ring), 0x12eb0000);
});
