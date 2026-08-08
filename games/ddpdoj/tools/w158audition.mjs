#!/usr/bin/env node
// Generate a short human-audition WAV from the production W158 policies.
// Output is diagnostic scratch only and must never be committed.

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { soundRuntimeFromAssets } from '../src/soundruntime.js';
import { APPROVED_SOUND_POLICIES } from '../src/soundpolicy.js';

const output = process.argv[2];
if (!output) throw new Error('usage: node games/ddpdoj/tools/w158audition.mjs <scratch.wav>');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SND = join(ROOT, 'assets', 'snd');
const raw = (name) => new Uint8Array(gunzipSync(readFileSync(join(SND, name))));
const text = (name) => new TextDecoder().decode(raw(name));
const runtime = soundRuntimeFromAssets({
  driverParams: text('driver-params.json.gz'),
  bgmScore: text('bgm-score.json.gz'),
  sampleIndex: text('sample.index.json.gz'),
  sampleShard: raw('sample.shard.u8.gz'),
}, APPROVED_SOUND_POLICIES);

// Production cue 0, then three seconds of native output.
runtime.frame(Uint8Array.of(0x11, 0xff, 0, 0), true);
for (let frame = 1; frame < 178; frame++) runtime.frame(new Uint8Array(0), true);
const count = runtime.outLen;
const channels = [new Float32Array(count), new Float32Array(count)];
runtime.drain(count, channels);

const pcm = Buffer.alloc(count * 4);
for (let i = 0; i < count; i++) for (let channel = 0; channel < 2; channel++) {
  const sample = Math.max(-1, Math.min(1, channels[channel][i]));
  pcm.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), (i * 2 + channel) * 2);
}
const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22); wav.writeUInt32LE(runtime.sourceRate, 24);
wav.writeUInt32LE(runtime.sourceRate * 4, 28); wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);
writeFileSync(resolve(output), wav);
console.log(`W158 audition: ${resolve(output)} ${count} frames, ${wav.length} bytes, `
  + `SHA-256 ${createHash('sha256').update(wav).digest('hex')}`);
