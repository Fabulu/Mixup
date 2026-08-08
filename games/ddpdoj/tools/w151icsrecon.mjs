#!/usr/bin/env node

// W151 executable recon for the bounded DOJ ICS2115 stage-1 contract.
// This is not a synthesizer. It proves the exercised register subset and runs
// small synthetic arithmetic/timeline fixtures which E1 can lift into tests.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const KEYON = join(ROOT, 'rip', 'sound', 'keyon.tsv');
const ICS = join(ROOT, 'rip', 'sound', 'ics.tsv');
const INDEX = join(ROOT, 'assets', 'snd', 'sample.index.json.gz');
const SHARD = join(ROOT, 'assets', 'snd', 'sample.shard.u8.gz');
const mutationArg = process.argv.find((x) => x.startsWith('--mutate='));
const mutation = mutationArg?.slice('--mutate='.length) ?? '';

let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`ok ${checks} - ${name}`);
}

function rows(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const header = lines.shift().split('\t');
  return lines.map((line) => Object.fromEntries(
    line.split('\t').map((value, i) => [header[i], value]),
  ));
}

const FORMAT_16 = mutation === 'format-bit' ? 0x20 : 0x02;
function sampleFormat(conf) {
  if (conf & 0x01) return 'ulaw8';
  return (conf & FORMAT_16) ? 'linear16' : 'linear8';
}

function decodeLinear8(byte) {
  return ((byte << 24) >> 24) << 8;
}

function interpolate16(a, b, fraction9) {
  assert.ok(fraction9 >= 0 && fraction9 < 512);
  return a + Math.floor(((b - a) * fraction9) / 512);
}

function loopPhase(high16, low8) {
  return ((high16 & 0xFFFF) << 13) | ((low8 & 0xFF) << 5);
}

function accumulatorPhase(high16, low16) {
  return ((high16 & 0xFFFF) << 13) | (low16 & 0x1FFF);
}

function phaseStep(fc) {
  return mutation === 'phase-step' ? fc : fc >>> 1;
}

function volumeGain(index12) {
  if (index12 <= 0) return 0;
  const index = Math.min(index12, 0xFFF);
  const exponent = index >>> 8;
  const mantissa = index & 0xFF;
  if (exponent === 0) return mantissa >>> 7;
  return Math.floor((((0x100 | mantissa) * (2 ** (exponent - 1))) + 0xFF) / 0x100);
}

function tickForward(v) {
  const emittedPhase = v.acc;
  if (v.ctl & 0x03) return emittedPhase;
  const next = v.acc + phaseStep(v.fc);
  if (next <= v.end) {
    v.acc = next;
  } else if (v.conf & 0x08) {
    v.acc = v.start + (next - v.end);
  } else {
    v.ctl |= 0x01;
    if (v.conf & 0x20) v.pending = true;
  }
  return emittedPhase;
}

const keyons = rows(KEYON);
const writes = rows(ICS);

check('capture has 1,620 keyons', () => assert.equal(keyons.length, 1620));
check('captured OscConf inventory is $20/$08/$00', () => {
  const counts = new Map();
  for (const row of keyons) counts.set(row.conf, (counts.get(row.conf) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries([...counts].sort()), { '00': 361, '08': 618, '20': 641 });
});
check('all audible modes decode as signed 8-bit linear', () => {
  assert.deepEqual([...new Set(keyons.map((r) => sampleFormat(parseInt(r.conf, 16))))], ['linear8']);
});
check('keyon.tsv 16bit label is stale on all rows', () => {
  assert.deepEqual([...new Set(keyons.map((r) => r.fmt))], ['16bit']);
});
check('$08 is the only looping keyon mode', () => {
  for (const row of keyons) assert.equal(Number(row.loop), row.conf === '08' ? 1 : 0);
});
check('all keyons use center pan $7F', () => {
  assert.deepEqual([...new Set(keyons.map((r) => r.pan))], ['7F']);
});

const voices = Array.from({ length: 32 }, () => new Map());
const snapshots = [];
for (const row of writes) {
  const voice = Number(row.voice) & 31;
  const reg = parseInt(row.reg, 16);
  const data = parseInt(row.data, 16);
  if (row.half === 'lo') voices[voice].set(`${reg}:lo`, data);
  if (row.half === 'hi') voices[voice].set(`${reg}:hi`, data);
  if (reg === 0x10 && row.half === 'hi' && data === 0) {
    snapshots.push(new Map(voices[voice]));
  }
}

const byteValues = (reg) => new Set(snapshots.map((s) => s.get(`${reg}:hi`) ?? 0));
const wordValues = (reg) => new Set(snapshots.map((s) => (
  (s.get(`${reg}:lo`) ?? 0) | ((s.get(`${reg}:hi`) ?? 0) << 8)
)));

check('register stream has 1,620 keyon snapshots', () => assert.equal(snapshots.length, 1620));
check('every keyon has VCtl $03 and VMode $00', () => {
  assert.deepEqual([...byteValues(0x0D)], [0x03]);
  assert.deepEqual([...byteValues(0x12)], [0x00]);
});
check('audible envelope is static despite two VIncr values', () => {
  const increments = new Set(snapshots.map((s) => s.get('6:lo') ?? 0));
  assert.deepEqual([...increments].sort((a, b) => a - b), [0x00, 0x3F]);
  for (const s of snapshots) assert.equal((s.get('13:hi') ?? 0) & 0x03, 0x03);
});
check('stage 1 exercises 50 static VolAcc words', () => assert.equal(wordValues(0x09).size, 50));
check('only keyon $00 and keyoff $0F reach OscCtl', () => {
  const values = new Set(writes
    .filter((r) => r.reg === '10' && r.half === 'hi')
    .map((r) => parseInt(r.data, 16)));
  assert.deepEqual([...values].sort((a, b) => a - b), [0x00, 0x0F]);
});
check('active oscillator register is always $1F', () => {
  const active = writes.filter((r) => r.reg === '0E' && r.half === 'hi');
  assert.equal(active.length, 6);
  assert.ok(active.every((r) => r.data === '1F'));
});

check('signed 8-bit bus expansion vectors', () => {
  assert.deepEqual([0x00, 0x01, 0x7F, 0x80, 0xFF].map(decodeLinear8),
    [0, 256, 32512, -32768, -256]);
});
check('nine-bit linear interpolation vectors', () => {
  assert.deepEqual([0, 128, 256, 384, 511].map((f) => interpolate16(-256, -512, f)),
    [-256, -320, -384, -448, -512]);
});
check('29-bit register packing and FC step', () => {
  assert.equal(loopPhase(0x1234, 0xA5), 0x024694A0);
  assert.equal(accumulatorPhase(0x1234, 0x15A5), 0x024695A5);
  assert.equal(phaseStep(0x0100), 0x0080);
});
check('32-active-oscillator source rate is exactly 33,075 Hz', () => {
  assert.equal(33868800 / ((0x1F + 1) * 32), 33075);
});
check('one-shot boundary emits end point, then becomes done and pending', () => {
  const v = { acc: 0, start: 0, end: 512, fc: 0x0200, conf: 0x20, ctl: 0, pending: false };
  assert.deepEqual([tickForward(v), tickForward(v), tickForward(v)], [0, 256, 512]);
  assert.equal(v.acc, 512);
  assert.equal(v.ctl & 1, 1);
  assert.equal(v.pending, true);
});
check('forward loop preserves overshoot and does not stop', () => {
  const v = { acc: 0, start: 0, end: 512, fc: 0x0200, conf: 0x08, ctl: 0, pending: false };
  assert.deepEqual([tickForward(v), tickForward(v), tickForward(v)], [0, 256, 512]);
  assert.equal(v.acc, 256);
  assert.equal(v.ctl, 0);
  assert.equal(v.pending, false);
});
check('IRQV active-low oscillator source vector', () => {
  const voice = 3;
  const irqv = 0x60 | voice;
  assert.equal(irqv, 0x63);
  assert.equal((irqv & 0x80) === 0, true);
  assert.equal((irqv & 0x40) === 0, false);
});
check('static logarithmic volume vectors before unresolved pan attenuation', () => {
  assert.deepEqual([0x7FF0, 0xE600, 0xFD60].map((v) => volumeGain(v >>> 4)),
    [128, 11264, 30080]);
});

const index = JSON.parse(gunzipSync(readFileSync(INDEX)));
const shard = gunzipSync(readFileSync(SHARD));
function shardByte(address) {
  const fragment = index.fragments.find((f) => address >= f.icsBase && address < f.icsBase + f.len);
  assert.ok(fragment, `unsharded sample address $${address.toString(16)}`);
  return shard[fragment.shardOffset + address - fragment.icsBase];
}
check('every non-empty stage-1 sample window is covered by the deferred shard', () => {
  let covered = 0;
  const observed = [];
  for (const row of keyons) {
    const start = parseInt(row.start, 16);
    const end = parseInt(row.end, 16);
    if (end <= start) continue;
    observed.push(shardByte(start), shardByte(start + 1), shardByte(end - 1));
    covered++;
  }
  assert.equal(covered, 1501);
  assert.ok(observed.some((x) => x < 0x80));
  assert.ok(observed.some((x) => x >= 0x80));
});

console.log(`W151 GREEN: ${checks} checks, 1,620 keyons, 1,501 sharded windows, mutation=${mutation || 'none'}`);
