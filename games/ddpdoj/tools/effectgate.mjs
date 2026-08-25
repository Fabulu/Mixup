#!/usr/bin/env node
// W593 compact selector-effects witness verifier.
// Raw MAME traces, framebuffers, palettes, and sprite buffers remain ignored.
// This gate validates the tracked hash-only reduction before tests compare its
// movement and producer facts with the browser simulation.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mamePixelsToRgb, SCREEN_H, SCREEN_W,
} from '../src/render/index.js';

export const EFFECT_SCHEMA = 'ddpdoj-w593-selector-effects-v1';
export const EFFECT_PAIRS = Object.freeze(['0/2', '0/4', '0/6', '2/2', '2/4', '2/6']);
export const EFFECT_EVENTS = Object.freeze([2002, 2051, 2071, 2116, 2129, 2241, 2301, 2361]);
export const EFFECT_BUCKETS = Object.freeze([5, 14, 15, 16, 19]);
export const EFFECT_SUFFIX =
  '2001=R;2033=;2050=A;2051=;2070=A;2071=;2100=A;2240=AR;2300=A;2360=';
export const EFFECT_GFX_AT =
  '2000,2032,2033,2049,2050,2051,2052,2069,2070,2071,2072,2099,2100,2101,2102,'
  + '2103,2104,2105,2106,2107,2108,2109,2110,2111,2112,2113,2114,2115,2116,2117,'
  + '2118,2119,2120,2121,2122,2123,2124,2125,2126,2127,2128,2129,2130,2131,2239,'
  + '2240,2241,2299,2300,2301,2359,2360,2361,2362,2363,2364,2365,2366,2367,2368,'
  + '2369,2370';
export const EFFECT_GFX_FRAMES = Object.freeze([
  2036, 2037, 2068, 2069, 2070, 2085, 2086, 2087, 2088, 2089,
  2105, 2106, 2107, 2108, 2109, 2135, 2136, 2137, 2138, 2139,
  2140, 2141, 2142, 2143, 2144, 2145, 2146, 2147, 2148, 2149,
  2150, 2151, 2152, 2153, 2154, 2155, 2156, 2157, 2158, 2159,
  2160, 2161, 2162, 2163, 2164, 2165, 2166, 2167, 2168, 2275,
  2276, 2277, 2278, 2335, 2336, 2337, 2338, 2395, 2396, 2397,
  2398, 2399, 2400, 2401, 2402, 2403, 2404, 2405, 2406, 2407,
]);
export const EFFECT_GFX_FILE_SIZES = Object.freeze({
  'bg_videoram.bin': 4096,
  'palette.bin': 5120,
  'pixels.bin': 401408,
  'regs.txt': 88,
  'rowscroll.bin': 4096,
  'spritebuffer.bin': 4096,
  'spriteram.bin': 2560,
  'tx_videoram.bin': 8192,
  'zoomram.bin': 64,
});
export const EFFECT_BUCKET_CAPACITIES = Object.freeze({
  5: 72, 14: 864, 15: 48, 16: 768, 19: 192,
});
// Filled from the sorted-key canonical form after every intended witness update.
export const EFFECT_WITNESS_SHA256 =
  'fc6901ef513552eb869b06af6343af465ae7225fae23866a13cd2facfb3ab1ff';
const EVENT_PORTS = new Map([
  [2002, 0xffef], [2051, 0xffdf], [2071, 0xffdf], [2116, 0xffdf],
  [2129, 0xffdf], [2241, 0xffcf], [2301, 0xffdf], [2361, 0xffff],
]);
const SHA256 = /^[0-9a-f]{64}$/;

function fail(message) { throw new Error(`W593 witness: ${message}`); }
function need(value, message) { if (!value) fail(message); }
function exactKeys(object, expected, label) {
  need(object && typeof object === 'object' && !Array.isArray(object), `${label} is not an object`);
  const actual = Object.keys(object).sort();
  const want = [...expected].map(String).sort();
  need(JSON.stringify(actual) === JSON.stringify(want),
    `${label} keys ${JSON.stringify(actual)} != ${JSON.stringify(want)}`);
}
function sha(value, label) { need(typeof value === 'string' && SHA256.test(value), `${label} is not SHA-256`); }
function integer(value, label) { need(Number.isInteger(value), `${label} is not an integer`); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function effectWitnessSha256(witness) {
  return createHash('sha256').update(canonical(witness)).digest('hex');
}

export function verifyEffectScenarios(scenarios) {
  const spec = scenarios?.paireffects;
  need(spec?.schema === 'ddpdoj-pair-effects-scenarios-v1', 'scenario schema changed');
  need(spec.frames === 2372 && Number(spec.fromLogicFrame) === 1999,
    'scenario frame bounds changed');
  need(spec.suffix === EFFECT_SUFFIX, 'scenario input suffix changed');
  need(spec.buckets === EFFECT_BUCKETS.join(','), 'scenario bucket list changed');
  need(spec.gfxAt === EFFECT_GFX_AT, 'scenario GFX trigger corpus changed');
  return true;
}
function coverage(entry, logicFrames, frames, label) {
  exactKeys(entry, ['logicFrames', 'frames', 'sha256'], label);
  need(JSON.stringify(entry.logicFrames) === JSON.stringify(logicFrames),
    `${label} logic-frame bounds changed`);
  need(entry.frames === frames, `${label} frame count changed`);
  sha(entry.sha256, `${label} digest`);
}

export function verifyEffectWitness(witness) {
  need(witness?.schema === EFFECT_SCHEMA, `schema ${JSON.stringify(witness?.schema)}`);
  need(witness.oracle?.emulator === 'MAME 0.288', 'emulator is not MAME 0.288');
  need(witness.oracle?.set === 'ddpdojblk' && witness.oracle?.version === 'B',
    'set/version is not ddpdojblk Version B');
  need(witness.oracle?.decryptedMainCpu?.size === 6291456
    && witness.oracle?.decryptedMainCpu?.fnv64 === 'D4C25CA9C91B9D47',
  'decrypted main CPU identity changed');
  need(JSON.stringify(witness.scenario?.targetBuckets) === JSON.stringify(EFFECT_BUCKETS),
    'target bucket list changed');
  need(JSON.stringify(witness.scenario?.logicFrames) === JSON.stringify([2000, 2371]),
    'logic-frame bounds changed');
  need(witness.scenario?.suffix === EFFECT_SUFFIX, 'input suffix changed');
  need(witness.scenario?.boardStateUsesPaletteAndPixelsFromNextVideoFrame === true,
    'N to N+1 video sample rule missing');
  need(JSON.stringify(witness.bounds?.allPairTargetBucketsExact) === JSON.stringify([2001, 2143]),
    'common exact producer bound changed');
  need(JSON.stringify(witness.bounds?.allPairOptionsExact) === JSON.stringify([2001, 2371]),
    'option exactness bound changed');
  need(JSON.stringify(witness.bounds?.allPairShotAllocationsExact) === JSON.stringify([2051, 2071]),
    'shot allocation frames changed');
  need(JSON.stringify(witness.bounds?.fullTargetRangeExactPairs)
    === JSON.stringify(['0/4', '0/6', '2/4', '2/6']),
  'extended producer pair set changed');

  exactKeys(witness.gfxCorpus,
    ['triggerLogicFrames', 'videoFrames', 'filesPerFrame', 'fileSizes', 'consecutivePairs'],
    'GFX corpus');
  need(JSON.stringify(witness.gfxCorpus.triggerLogicFrames)
    === JSON.stringify(EFFECT_GFX_AT.split(',').map(Number)),
  'GFX trigger logic frames changed');
  need(JSON.stringify(witness.gfxCorpus.videoFrames) === JSON.stringify(EFFECT_GFX_FRAMES),
    'GFX video-frame corpus changed');
  need(witness.gfxCorpus.filesPerFrame === Object.keys(EFFECT_GFX_FILE_SIZES).length,
    'GFX files-per-frame count changed');
  need(JSON.stringify(witness.gfxCorpus.fileSizes) === JSON.stringify(EFFECT_GFX_FILE_SIZES),
    'GFX file sizes changed');
  need(witness.gfxCorpus.consecutivePairs === 62, 'GFX consecutive-pair count changed');

  const pixel = witness.pixelGate;
  need(pixel?.verdict === 'PASS' && pixel.exact === pixel.total && pixel.percent === 100,
    'pixel gate is not exact');
  need(pixel.pairs === 372 && pixel.total === 37330944,
    'pixel corpus size changed');
  need(pixel.densestRun >= 30 && pixel.busiestSprites >= 90
    && pixel.largestPaletteDeltaWords >= 10,
  'pixel corpus lost density, sprite load, or palette motion');

  need(Array.isArray(witness.pairs) && witness.pairs.length === EFFECT_PAIRS.length,
    'pair count is not six');
  const pairs = new Map();
  for (const pair of witness.pairs) {
    need(EFFECT_PAIRS.includes(pair?.key), `unknown pair ${JSON.stringify(pair?.key)}`);
    need(!pairs.has(pair.key), `duplicate pair ${pair.key}`);
    need(pair.key === `${pair.ship}/${pair.style}`, `${pair.key} selector fields disagree`);
    const fullTargetRange = witness.bounds.fullTargetRangeExactPairs.includes(pair.key);
    pairs.set(pair.key, pair);
    sha(pair.initial?.optionSha256, `${pair.key} initial option`);
    sha(pair.initial?.palette23Sha256, `${pair.key} initial palette 23`);
    exactKeys(pair.trace, ['logicFrames', 'normalization', 'rows', 'sha256'],
      `${pair.key} trace`);
    need(JSON.stringify(pair.trace.logicFrames) === JSON.stringify([1, 2372]),
      `${pair.key} trace logic-frame bounds changed`);
    need(pair.trace.rows === 2372, `${pair.key} trace row count changed`);
    need(pair.trace.normalization === 'omit-d_date-only-v1',
      `${pair.key} trace normalization changed`);
    sha(pair.trace.sha256, `${pair.key} normalized trace`);
    exactKeys(pair.gfx, [
      'allSha256', 'bytes', 'displayStateSha256', 'files', 'paletteSha256',
      'rgb24Sha256',
    ], `${pair.key} GFX identity`);
    need(pair.gfx.files === EFFECT_GFX_FRAMES.length * Object.keys(EFFECT_GFX_FILE_SIZES).length,
      `${pair.key} GFX file count changed`);
    need(pair.gfx.bytes === EFFECT_GFX_FRAMES.length
      * Object.values(EFFECT_GFX_FILE_SIZES).reduce((sum, size) => sum + size, 0),
    `${pair.key} GFX byte count changed`);
    for (const field of ['allSha256', 'displayStateSha256', 'paletteSha256', 'rgb24Sha256']) {
      sha(pair.gfx[field], `${pair.key} GFX ${field}`);
    }
    need(pair.initial?.p1Invulnerability === 0xd0,
      `${pair.key} LF2000 P1 invulnerability is not 0xd0`);
    exactKeys(pair.coverage, fullTargetRange
      ? ['commonTarget', 'fullOptions', 'fullTarget']
      : ['commonTarget', 'fullOptions'], `${pair.key} exhaustive coverage`);
    coverage(pair.coverage.commonTarget, [2001, 2143], 143,
      `${pair.key} common target coverage`);
    coverage(pair.coverage.fullOptions, [2001, 2371], 371,
      `${pair.key} option coverage`);
    if (fullTargetRange) {
      coverage(pair.coverage.fullTarget, [2001, 2371], 371,
        `${pair.key} full target coverage`);
    }
    exactKeys(pair.events, EFFECT_EVENTS, `${pair.key} events`);

    for (const lf of EFFECT_EVENTS) {
      const event = pair.events[lf];
      need(event.portWord === EVENT_PORTS.get(lf), `${pair.key} LF${lf} port word changed`);
      sha(event.optionSha256, `${pair.key} LF${lf} options`);
      sha(event.targetInputSha256, `${pair.key} LF${lf} target input`);
      exactKeys(event.targetBuckets, EFFECT_BUCKETS, `${pair.key} LF${lf} buckets`);
      for (const bucket of EFFECT_BUCKETS) {
        const fact = event.targetBuckets[bucket];
        integer(fact?.bytes, `${pair.key} LF${lf} bucket ${bucket} bytes`);
        need(fact.bytes >= 0 && fact.bytes % 12 === 0,
          `${pair.key} LF${lf} bucket ${bucket} has a partial request`);
        need(fact.bytes <= EFFECT_BUCKET_CAPACITIES[bucket],
          `${pair.key} LF${lf} bucket ${bucket} exceeds its exact capacity`);
        sha(fact.sha256, `${pair.key} LF${lf} bucket ${bucket}`);
      }

      const movement = event.movement;
      for (const field of ['posLong', 'posShort', 'velLong', 'velShort',
        'speedIndex', 'laserFloor', 'tilt']) integer(movement?.[field], `${pair.key} LF${lf} ${field}`);
      need(/^0x[0-9a-f]{8}$/.test(movement?.image), `${pair.key} LF${lf} image is malformed`);
      sha(movement.p1WithoutInvulnerabilitySha256, `${pair.key} LF${lf} P1`);

      const display = event.boardDisplay;
      integer(display?.records, `${pair.key} LF${lf} display records`);
      need(display.records > 0 && display.records <= 160, `${pair.key} LF${lf} display record count`);
      sha(display.sha256, `${pair.key} LF${lf} display`);
      if (lf <= witness.bounds.allPairTargetBucketsExact[1] || fullTargetRange) {
        need(display.hybridSha256 === display.sha256,
          `${pair.key} LF${lf} exact target replacement changed display input`);
      } else {
        need(display.hybridSha256 === undefined,
          `${pair.key} LF${lf} overclaims a collision-contaminated hybrid display`);
      }

      if (lf === 2051 || lf === 2071) {
        integer(event.shots?.active, `${pair.key} LF${lf} active shots`);
        sha(event.shots?.sha256, `${pair.key} LF${lf} shots`);
      } else need(event.shots === undefined, `${pair.key} LF${lf} has an unexpected shot fact`);
      if (lf === 2116 || lf === 2129) {
        integer(event.segments?.active, `${pair.key} LF${lf} active segments`);
        sha(event.segments?.sha256, `${pair.key} LF${lf} segments`);
      } else need(event.segments === undefined, `${pair.key} LF${lf} has an unexpected segment fact`);

      if (lf === 2002) {
        need(event.pixels === undefined, `${pair.key} LF2002 unexpectedly claims a pixel dump`);
      } else {
        need(event.pixels?.videoFrame === lf + 37, `${pair.key} LF${lf} N+1 video frame changed`);
        sha(event.pixels.fullRgb24Sha256, `${pair.key} LF${lf} framebuffer`);
        sha(event.pixels.fighterCropRgb24Sha256, `${pair.key} LF${lf} fighter crop`);
        sha(event.pixels.beamStripRgb24Sha256, `${pair.key} LF${lf} beam crop`);
      }
    }
  }
  need([...pairs.keys()].sort().join(',') === [...EFFECT_PAIRS].sort().join(','),
    'one or more authentic pairs are absent');
  need(new Set(witness.pairs.map((pair) => pair.events[2002].movement.image)).size === 2,
    'witness does not contain two fighter image families');
  need(new Set(witness.pairs.map((pair) => pair.initial.palette23Sha256)).size === 3,
    'witness does not contain three style palette families');
  for (const field of ['fighterCropRgb24Sha256', 'beamStripRgb24Sha256']) {
    need(new Set(witness.pairs.map((pair) => pair.events[2129].pixels[field])).size === 6,
      `${field} does not distinguish all six pairs`);
  }
  need(effectWitnessSha256(witness) === EFFECT_WITNESS_SHA256,
    'canonical digest changed');
  return true;
}

export function normalizeEffectTrace(payload) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const text = bytes.toString('utf8');
  need(Buffer.from(text).equals(bytes), 'capture is not canonical UTF-8');
  const lines = text.split('\n');
  const contentRows = lines.at(-1) === '' ? lines.length - 1 : lines.length;
  need(contentRows > 1, 'capture has no rows');
  const columns = lines[0].split('\t');
  const dateColumns = columns.flatMap((name, index) => name === 'd_date' ? [index] : []);
  need(dateColumns.length === 1, 'capture must have exactly one d_date column');
  const dateColumn = dateColumns[0];
  const normalized = [];
  for (let index = 0; index < contentRows; index++) {
    need(lines[index] !== '', `capture has an empty row at line ${index + 1}`);
    const fields = lines[index].split('\t');
    need(fields.length === columns.length,
      `capture line ${index + 1} column count changed`);
    fields.splice(dateColumn, 1);
    normalized.push(fields.join('\t'));
  }
  if (lines.at(-1) === '') normalized.push('');
  return Buffer.from(normalized.join('\n'));
}

export function verifyEffectTrace(witness, pairKey, payload) {
  const pair = witness?.pairs?.find((entry) => entry.key === pairKey);
  need(pair, `capture pair ${JSON.stringify(pairKey)} is not authentic`);
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const lines = bytes.toString('utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  need(lines.length === pair.trace.rows + 1,
    `${pairKey} capture row count changed`);
  const columns = lines[0].split('\t');
  const lfColumn = columns.indexOf('lf');
  need(lfColumn >= 0, `${pairKey} capture has no logic-frame column`);
  for (let index = 1; index < lines.length; index++) {
    const fields = lines[index].split('\t');
    need(fields.length === columns.length, `${pairKey} capture row ${index} width changed`);
    const lf = Number(fields[lfColumn]);
    need(lf === index, `${pairKey} capture logic frame ${index} changed`);
  }
  const normalized = normalizeEffectTrace(bytes);
  need(createHash('sha256').update(normalized).digest('hex') === pair.trace.sha256,
    `${pairKey} normalized capture SHA-256 changed`);
  return true;
}

function framedUpdate(digest, name, payload) {
  const nameBytes = Buffer.from(name, 'utf8');
  const lengths = Buffer.alloc(8);
  lengths.writeUInt32BE(nameBytes.length, 0);
  lengths.writeUInt32BE(payload.length, 4);
  digest.update(lengths).update(nameBytes).update(payload);
}

export function effectGfxIdentity(directory) {
  need(typeof directory === 'string' && statSync(directory).isDirectory(),
    'GFX capture path is not a directory');
  const suffixes = Object.keys(EFFECT_GFX_FILE_SIZES).sort();
  const expected = EFFECT_GFX_FRAMES.flatMap((frame) => suffixes.map((suffix) =>
    `f${String(frame).padStart(6, '0')}.${suffix}`)).sort();
  const actual = readdirSync(directory).sort();
  need(JSON.stringify(actual) === JSON.stringify(expected), 'GFX capture file set or order changed');

  const all = createHash('sha256');
  const palette = createHash('sha256');
  const display = createHash('sha256');
  const rgb24 = createHash('sha256');
  let bytes = 0;
  for (const name of actual) {
    const suffix = name.slice(8);
    const payload = readFileSync(path.join(directory, name));
    need(payload.length === EFFECT_GFX_FILE_SIZES[suffix],
      `GFX ${name} size ${payload.length} changed`);
    bytes += payload.length;
    framedUpdate(all, name, payload);
    if (suffix === 'palette.bin') framedUpdate(palette, name, payload);
    else if (suffix === 'pixels.bin') {
      const rgb = Buffer.from(mamePixelsToRgb(payload, SCREEN_W, SCREEN_H));
      framedUpdate(rgb24, name.replace(/pixels\.bin$/, 'rgb24'), rgb);
    } else framedUpdate(display, name, payload);
  }
  return {
    files: actual.length,
    bytes,
    allSha256: all.digest('hex'),
    paletteSha256: palette.digest('hex'),
    displayStateSha256: display.digest('hex'),
    rgb24Sha256: rgb24.digest('hex'),
  };
}

export function verifyEffectGfx(witness, pairKey, directory) {
  const pair = witness?.pairs?.find((entry) => entry.key === pairKey);
  need(pair, `GFX pair ${JSON.stringify(pairKey)} is not authentic`);
  const actual = effectGfxIdentity(directory);
  need(JSON.stringify(actual) === JSON.stringify(pair.gfx),
    `${pairKey} GFX aggregate identity changed`);
  return true;
}

function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let file = path.join(here, 'oracle', 'w593-selector-effects.json');
  let capture = null;
  let gfx = null;
  let pairKey = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--capture') capture = argv[++index];
    else if (arg === '--gfx') gfx = argv[++index];
    else if (arg === '--pair') pairKey = argv[++index];
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
    else if (file !== path.join(here, 'oracle', 'w593-selector-effects.json')) {
      fail('more than one witness path');
    } else file = arg;
  }
  need(pairKey === null ? capture === null && gfx === null : (capture !== null || gfx !== null),
    '--pair is required with --capture or --gfx');
  need(!(capture && gfx), '--capture and --gfx are separate verification modes');
  const witness = JSON.parse(readFileSync(file, 'utf8'));
  const scenarios = JSON.parse(readFileSync(path.join(here, 'oracle', 'scenarios.json'), 'utf8'));
  verifyEffectScenarios(scenarios);
  verifyEffectWitness(witness);
  if (capture) {
    verifyEffectTrace(witness, pairKey, readFileSync(capture));
    console.log(`EFFECTGATE CAPTURE OK: ${pairKey}, ${witness.pairs.find((p) => p.key === pairKey).trace.rows} rows`);
  } else if (gfx) {
    verifyEffectGfx(witness, pairKey, gfx);
    console.log(`EFFECTGATE GFX OK: ${pairKey}, ${witness.pairs.find((p) => p.key === pairKey).gfx.files} exact files`);
  } else {
    console.log(`EFFECTGATE VERIFY OK: ${EFFECT_PAIRS.length} selector pairs, `
      + `${witness.pixelGate.pairs} exact frame pairs`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(String(error.stack || error));
    process.exitCode = 1;
  }
}
