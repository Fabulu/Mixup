#!/usr/bin/env node
// W157 static sound-sample coverage recon gate.
//
// Derives every interval from the uploaded Z80 descriptor tables and reachable
// score streams. Captured ICS writes are a bidirectional validator only; they
// never define the static asset inventory.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { driverParamsFromJson, driverParamsToJson } from '../src/driverparams.js';
import { parseScore } from '../src/bgmscore.js';
import { parseEvent } from '../src/sequencer.js';
import { accumulatorPhase, boundaryPhase } from '../src/ics2115.js';
import { SOUND_WRAPPERS } from '../src/sound.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RIP = join(ROOT, 'rip', 'sound');
const ROM = join(ROOT, 'rip', 'rom', 'cave_m04401b032.u17');
const INDEX = join(ROOT, 'assets', 'snd', 'sample.index.json.gz');
const mutation = process.env.W157_MUTATION ?? '';

const EXPECT = Object.freeze({
  tableSfxDescriptors: 69,
  fixedWrapperSfxDescriptors: 54,
  missingSfx: Object.freeze([8, 9, 10, 11, 17, 21, 35, 38, 39, 61, 62,
    65, 66, 67, 68]),
  bgmDescriptors: 159,
  missingBgm: 45,
  selectedStreams: 288,
  scoreEvents: 11_413,
  descriptorIntervals: 228,
  fragments: 6,
  raw: 3_612_873,
  gzip: 2_818_499,
  fullRaw: 4_194_304,
  fullGzip: 2_832_370,
  dynamicKeyons: 1_620,
  dynamicMinusStatic: 0,
  staticIntervalsWithoutDynamic: 182,
  staticFragmentsWithoutDynamic: 0,
  sfxRaw: 1_392_495,
  sfxGzip: 1_051_879,
  cueRaw: Object.freeze([305917, 179081, 461951, 500875, 395395, 350141,
    31795, 147837, 121749, 192149, 141659]),
  cueGzip: Object.freeze([213449, 124838, 355816, 413897, 325721, 307173,
    29231, 115207, 100347, 153903, 119807]),
});

let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log(`ok ${checks} - ${label}`);
}

function rows(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const names = lines.shift().split('\t');
  return lines.map((line) => Object.fromEntries(
    line.split('\t').map((value, i) => [names[i], value])));
}

function mergeIntervals(input) {
  const sorted = input.filter((x) => x.end > x.start)
    .slice().sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    const joinGap = mutation === 'merge-gap' ? 1 : 0;
    if (previous && interval.start <= previous.end + joinGap) {
      previous.end = Math.max(previous.end, interval.end);
      previous.witnesses.push(interval);
    } else {
      merged.push({ start: interval.start, end: interval.end,
        witnesses: [interval] });
    }
  }
  return merged;
}

const contains = (outer, inner) => outer.start <= inner.start && inner.end <= outer.end;
const coveredBy = (interval, union) => union.some((fragment) => contains(fragment, interval));

function descriptorInterval(record, kind, index) {
  let bank = record.r11 & 0x0f;
  if (mutation === 'wrong-rom' && kind === 'sfx' && index === 0) bank = 0;
  const base = bank * 0x100000;
  const accumulator = base
    + Math.floor(accumulatorPhase(record.r0A, record.r0B) / 512);
  // The 12-byte SFX record has no independent r02/r03 pair. `$3245` writes
  // its r0A/r0B pair both as the accumulator and, through the boundary-width
  // encoding, as OscStart. BGM has the explicit r02/r03 pair.
  const loopStart = base + Math.floor((kind === 'sfx'
    ? boundaryPhase(record.r0A, record.r0B)
    : boundaryPhase(record.r02, record.r03)) / 512);
  const neighbor = mutation === 'endpoint-one' ? 1 : 2;
  const end = base + Math.floor(boundaryPhase(record.r04, record.r05) / 512)
    + neighbor;
  const conf = kind === 'bgm' ? record.r00 : 0x20;
  // Every SFX selector is accepted by cmd $02 as a forward loop even though
  // the descriptor's stored r00 byte is zero; its live loop return is r02/r03.
  const mayLoop = kind === 'sfx' || (conf & 0x08);
  return Object.freeze({ start: mayLoop ? Math.min(accumulator, loopStart)
    : accumulator, end, kind, index, bank, conf });
}

const z80 = new Uint8Array(readFileSync(join(RIP, 'z80ram.bin')));
const params = driverParamsFromJson(driverParamsToJson(z80));
// Group 0 alone already reaches the conservative 159/160 descriptor union;
// W162 separately proves every other live group is a subset of that same union.
const score = parseScore(z80);

const reachableBgm = new Set([0]);
const cueDescriptors = [];
let selectedStreams = 0;
let scoreEvents = 0;
let state9Events = 0;
for (const cue of score.cues) {
  const descriptors = new Set([0]);
  const selectors = new Set(cue.rowStream);
  for (let track = 0; track < 8; track++) {
    for (const selector of selectors) {
      selectedStreams++;
      const stream = cue.noteStreams[track * cue.df + selector];
      for (let pos = 0; pos < stream.length;) {
        const event = parseEvent(stream, pos);
        scoreEvents++;
        if (event.descriptor !== undefined && event.descriptor !== 0) {
          assert.ok(event.descriptor <= 160,
            `cue ${cue.id} descriptor byte ${event.descriptor} exceeds the table`);
          descriptors.add(event.descriptor - 1);
          reachableBgm.add(event.descriptor - 1);
        }
        if (event.state === 9) state9Events++;
        pos = event.next;
      }
    }
  }
  cueDescriptors.push(descriptors);
}
if (mutation === 'include-unreachable') reachableBgm.add(EXPECT.missingBgm);

const noteOnEntries = new Set([0x28c02a, 0x28c074, 0x28c0ae]);
const fixedWrapperSfx = [...new Set(Object.values(SOUND_WRAPPERS)
  .filter((wrapper) => noteOnEntries.has(wrapper.entry))
  .map((wrapper) => wrapper.id))].sort((a, b) => a - b);
const sfxIntervals = Array.from({ length: 69 }, (_, index) =>
  descriptorInterval(params.sfx(index), 'sfx', index));
const bgmIntervals = [...reachableBgm].sort((a, b) => a - b)
  .map((index) => descriptorInterval(params.bgm(index), 'bgm', index));
const descriptorIntervals = [...sfxIntervals, ...bgmIntervals];
let staticFragments = mergeIntervals(descriptorIntervals);
if (mutation === 'drop-fragment') staticFragments = staticFragments.slice(0, -1);
if (process.env.W157_DUMP === '1') {
  console.log(JSON.stringify(staticFragments.map(({ start, end }) => ({ start, end })), null, 2));
}

check('raw Z80 accepts 69 SFX selectors; fixed wrappers name a 54-selector subset', () => {
  for (let index = 0; index < EXPECT.tableSfxDescriptors; index++) params.sfx(index);
  assert.equal(fixedWrapperSfx.length, EXPECT.fixedWrapperSfxDescriptors);
  assert.deepEqual(Array.from({ length: 69 }, (_, i) => i)
    .filter((i) => !fixedWrapperSfx.includes(i)), [...EXPECT.missingSfx]);
  assert.ok(sfxIntervals.every((x) => x.conf === 0x20));
});
check('score topology reaches 159 BGM descriptors and only index 45 is absent', () => {
  assert.equal(reachableBgm.size, EXPECT.bgmDescriptors);
  assert.deepEqual(Array.from({ length: 160 }, (_, i) => i)
    .filter((i) => !reachableBgm.has(i)), [EXPECT.missingBgm]);
});
check('all statically selected score streams parse with no state-9 offset family', () => {
  assert.equal(selectedStreams, EXPECT.selectedStreams);
  assert.equal(scoreEvents, EXPECT.scoreEvents);
  assert.equal(state9Events, 0);
});
check('all reachable descriptors use exercised linear8 banks in u17 only', () => {
  assert.deepEqual([...new Set(descriptorIntervals.map((x) => x.bank))], [4, 5, 6, 7]);
  assert.ok(bgmIntervals.every((x) => x.conf === 0x00 || x.conf === 0x08));
});
check('228 reachable command intervals merge to the tight non-redundant union', () => {
  assert.equal(descriptorIntervals.length, EXPECT.descriptorIntervals);
  assert.equal(staticFragments.length, EXPECT.fragments);
  for (let i = 0; i < staticFragments.length; i++) {
    const fragment = staticFragments[i];
    assert.ok(fragment.witnesses.length > 0, `fragment ${i} lacks a descriptor witness`);
    assert.ok(i === 0 || staticFragments[i - 1].end < fragment.start,
      `fragment ${i} overlaps or touches its predecessor`);
  }
  for (const interval of descriptorIntervals) {
    assert.ok(coveredBy(interval, staticFragments),
      `${interval.kind}${interval.index} is not covered`);
  }
});

// Reconstruct actual accumulator/start/end state from all captured writes.
// keyon.tsv's historical `start` column is OscStrt and is not the attack
// accumulator for non-looping BGM, so it cannot be the dynamic join key.
const voices = Array.from({ length: 32 }, () => ({
  lo: new Uint8Array(0x50), hi: new Uint8Array(0x50),
}));
const dynamicIntervals = [];
for (const row of rows(join(RIP, 'ics.tsv'))) {
  const voice = voices[Number(row.voice) & 31];
  const reg = parseInt(row.reg, 16);
  const data = parseInt(row.data, 16);
  if (row.half === 'lo') voice.lo[reg] = data;
  if (row.half === 'hi') voice.hi[reg] = data;
  if (reg !== 0x10 || row.half !== 'hi' || data !== 0) continue;
  const word = (r) => voice.lo[r] | (voice.hi[r] << 8);
  const bank = voice.hi[0x11] & 0x0f;
  const base = bank * 0x100000;
  const accumulator = base
    + Math.floor(accumulatorPhase(word(0x0a), word(0x0b)) / 512);
  const loopStart = base
    + Math.floor(boundaryPhase(word(0x02), word(0x03)) / 512);
  const end = base + Math.floor(boundaryPhase(word(0x04), word(0x05)) / 512) + 2;
  const conf = voice.hi[0x00];
  const start = mutation === 'legacy-dynamic-start' ? loopStart
    : (conf & 0x08) ? Math.min(accumulator, loopStart) : accumulator;
  dynamicIntervals.push({ start, end, conf });
}
const dynamicUnion = mergeIntervals(dynamicIntervals);
const dynamicMinusStatic = dynamicIntervals.filter((x) => !coveredBy(x, staticFragments));
const staticIntervalsWithoutDynamic = descriptorIntervals
  .filter((x) => !coveredBy(x, dynamicUnion));
const staticFragmentsWithoutDynamic = staticFragments.filter((fragment) =>
  !dynamicIntervals.some((interval) => contains(fragment, interval)));

check('all 1,620 captured keyons reconstruct to valid playback intervals', () => {
  assert.equal(dynamicIntervals.length, EXPECT.dynamicKeyons);
  assert.ok(dynamicIntervals.every((x) => x.end > x.start));
});
check('dynamic-minus-static is zero', () => {
  assert.equal(dynamicMinusStatic.length, EXPECT.dynamicMinusStatic,
    `unmatched: ${dynamicMinusStatic.map((x) => `$${x.start.toString(16)}-$${x.end.toString(16)}`).join(', ')}`);
});
check('static-minus-dynamic names the capture-bounded omission', () => {
  assert.equal(staticIntervalsWithoutDynamic.length, EXPECT.staticIntervalsWithoutDynamic);
  assert.equal(staticFragmentsWithoutDynamic.length, EXPECT.staticFragmentsWithoutDynamic);
});

const u17 = readFileSync(ROM);
const packed = Buffer.concat(staticFragments.map((fragment) =>
  u17.subarray(fragment.start - 0x400000, fragment.end - 0x400000)));
const packedGzip = gzipSync(packed, { level: 9 });
const fullGzip = gzipSync(u17, { level: 9 });
check('static union is measured against actual u17 bytes', () => {
  assert.equal(u17.length, EXPECT.fullRaw);
  assert.equal(packed.length, EXPECT.raw);
  assert.equal(packedGzip.length, EXPECT.gzip);
  assert.equal(fullGzip.length, EXPECT.fullGzip);
});

function packedSize(intervals) {
  const fragments = mergeIntervals(intervals);
  const body = Buffer.concat(fragments.map((fragment) =>
    u17.subarray(fragment.start - 0x400000, fragment.end - 0x400000)));
  return { raw: body.length, gzip: gzipSync(body, { level: 9 }).length };
}
const sfxSize = packedSize(sfxIntervals);
const cueSizes = cueDescriptors.map((set) => packedSize([...set]
  .map((index) => descriptorInterval(params.bgm(index), 'bgm', index))));
check('SFX and eleven cue demand-shard measurements are stable', () => {
  assert.deepEqual(sfxSize, { raw: EXPECT.sfxRaw, gzip: EXPECT.sfxGzip });
  assert.deepEqual(cueSizes.map((x) => x.raw), [...EXPECT.cueRaw]);
  assert.deepEqual(cueSizes.map((x) => x.gzip), [...EXPECT.cueGzip]);
});

check('the shipped W158 artifact exactly equals the static command union', () => {
  const current = JSON.parse(gunzipSync(readFileSync(INDEX)));
  assert.equal(current.version, 1);
  assert.equal(current.layout, 'ics2115-static-fragment-stitch-v1');
  assert.equal(current.coverage, 'all-live-descriptors');
  assert.equal(current.descriptorIntervals, EXPECT.descriptorIntervals);
  assert.equal(current.fragmentCount, EXPECT.fragments);
  assert.deepEqual(current.fragments.map((fragment) => ({
    start: fragment.icsBase, end: fragment.icsBase + fragment.len,
  })), staticFragments.map(({ start, end }) => ({ start, end })));
});

console.log(`W157 GREEN: ${checks} checks, static=${descriptorIntervals.length} descriptors/`
  + `${staticFragments.length} fragments/${packed.length} raw/${packedGzip.length} gz, `
  + `dynamic-minus-static=${dynamicMinusStatic.length}, static-minus-dynamic=`
  + `${staticIntervalsWithoutDynamic.length}, mutation=${mutation || 'none'}`);
