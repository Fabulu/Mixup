#!/usr/bin/env node
// W162 independent live score-bank/timer/timeline gate. ROM and listing-derived
// tables are authoritative; keyon.tsv is a secondary event-order witness only.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseScoreGroups, scoreFromJson, scoreToJson } from '../src/bgmscore.js';
import { driverParamsFromJson } from '../src/driverparams.js';
import { unpack } from '../src/ics.js';
import { parseEvent } from '../src/sequencer.js';
import { STREAMING_LEAVES } from '../src/sound.js';
import { APPROVED_SOUND_POLICIES } from '../src/soundpolicy.js';
import { soundRuntimeFromAssets } from '../src/soundruntime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts));
const jsonGz = (...parts) => JSON.parse(zlib.gunzipSync(read(...parts)));
let checks = 0;
function check(condition, message) {
  checks++;
  if (!condition) throw new Error(`W162 sound gate: ${message}`);
}

const maincpu = new Uint8Array(read('rip', 'sound', 'maincpu.bin'));
const parsed = parseScoreGroups(maincpu);
const scoreJson = jsonGz('assets', 'snd', 'bgm-score.json.gz');
const score = scoreFromJson(scoreJson);
check(parsed.groups.length === 7, 'the `$28B814` inventory is not seven groups');
check(parsed.groups.map((group) => group.cueCount).join() === '11,2,2,2,1,2,1',
  'score-group cue inventory drifted');
check(JSON.stringify(scoreToJson(parsed)) === JSON.stringify((({ note, ...x }) => x)(scoreJson)),
  'semantic score artifact differs from the 68k score groups');
check(Buffer.from(maincpu.slice(0x2b240a, 0x2b241c)).toString('hex')
    === '2c081c00002b0dc2002b0c02002aef9e1c64',
  'group-1 cue-0 descriptor at `$2B240A` drifted');
check(score.groups[1].cues[0].rowlen === 44 && score.groups[1].cues[0].df === 28,
  'group-1 cue-0 generated topology is not rowlen 44 / df 28');
check(score.groups[1].cues[0].noteStreams[0].slice(0, 8).join(',')
    === '207,3,42,19,6,170,19,54',
  'group-1 cue-0 track-0 opening stream drifted');
const descriptors = new Set([0]);
for (const group of score.groups) for (const cue of group.cues) {
  for (const stream of cue.noteStreams) for (let pos = 0; pos < stream.length;) {
    const event = parseEvent(stream, pos);
    if (event.descriptor) descriptors.add(event.descriptor - 1);
    pos = event.next;
  }
}
check(descriptors.size === 159 && !descriptors.has(45),
  'all-group descriptor union differs from W157/W158 static coverage');
check(JSON.stringify(STREAMING_LEAVES.get(0x28cb9c))
    === JSON.stringify({ index: 11, group: 1, id: 0, type: 0x12 }),
  'stage start leaf no longer selects group 1 / cue 0');

const driverJson = jsonGz('assets', 'snd', 'driver-params.json.gz');
const params = driverParamsFromJson(driverJson);
check(driverJson.version === 3, 'driver parameter artifact is not timer-aware v3');
check(params.timer0Preset(0x87) === 0x74,
  '`$13D4` timer mapping `$87 -> $74` drifted');
check(driverJson.control.timer0.scale === 0x94,
  'timer-0 scale is not the live `$94`');

const assets = Object.freeze({
  driverParams: driverJson,
  bgmScore: scoreJson,
  sampleIndex: jsonGz('assets', 'snd', 'sample.index.json.gz'),
  sampleShard: new Uint8Array(zlib.gunzipSync(read('assets', 'snd', 'sample.shard.u8.gz'))),
});
const runtime = soundRuntimeFromAssets(assets, APPROVED_SOUND_POLICIES);
runtime.selectScoreGroup(1);
runtime.timerHoldFrames = 1;
const produced = [];
const activeFrames = new Set();
for (let lf = 1562; lf <= 1999; lf++) {
  runtime.frame(lf === 1562 ? Uint8Array.of(0x12, 0xeb, 0, 0) : new Uint8Array(0), false);
  for (const packed of runtime.lastFrame.registerLog) {
    const row = unpack(packed);
    if (row.voice < 8 && row.reg === 0x10 && row.half === 2 && row.data === 0) {
      produced.push({ lf, voice: row.voice });
      activeFrames.add(lf);
    }
  }
}
check(produced.length === 186, 'stage pre-seed timeline is not 186 dense keyons');
check(activeFrames.size >= 120, 'stage cue does not sustain events across the timeline');
check(runtime.timerIrqCount === 396, 'stage timer cadence is not 396 services');
check(produced.slice(0, 14).map(({ lf, voice }) => `${lf}:${voice}`).join() ===
  '1564:0,1564:1,1564:2,1564:3,1564:4,1564:6,1564:7,1568:4,1571:3,1571:4,1574:4,1578:1,1578:3,1578:4',
  'first live event batch/timeline diverged');

const lines = read('rip', 'sound', 'keyon.tsv').toString('utf8').trim().split(/\r?\n/);
const headers = lines.shift().split('\t');
const capturedVoices = lines.map((line) => {
  const fields = line.split('\t');
  return Object.fromEntries(headers.map((name, i) => [name, fields[i]]));
}).filter((row) => +row.lf >= 1564 && +row.lf <= 1999 && +row.voice < 8)
  .map((row) => +row.voice);
check(capturedVoices.length === 187, 'captured stage witness is not 187 keyons');
check(produced.every((row, i) => row.voice === capturedVoices[i]),
  'production voice order diverges from the captured stage witness');

const soundSource = read('src', 'sound.js').toString('utf8');
const runtimeSource = read('src', 'soundruntime.js').toString('utf8');
check(soundSource.includes('postWrapperWithRuntime')
    && runtimeSource.includes('timer0Preset(requestedRate)'),
  'production group-upload/timer route is absent');

console.log(`W162 sound gate: ${checks}/${checks} ROM, artifact, timer and timeline checks pass`);
