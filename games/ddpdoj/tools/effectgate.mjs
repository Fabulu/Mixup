#!/usr/bin/env node
// W593 compact selector-effects witness verifier.
// Raw MAME traces, framebuffers, palettes, and sprite buffers remain ignored.
// This gate validates the tracked hash-only reduction before tests compare its
// movement and producer facts with the browser simulation.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EFFECT_SCHEMA = 'ddpdoj-w593-selector-effects-v1';
export const EFFECT_PAIRS = Object.freeze(['0/2', '0/4', '0/6', '2/2', '2/4', '2/6']);
export const EFFECT_EVENTS = Object.freeze([2002, 2051, 2071, 2116, 2129, 2241, 2301, 2361]);
export const EFFECT_BUCKETS = Object.freeze([5, 14, 15, 16, 19]);
export const EFFECT_SUFFIX =
  '2001=R;2033=;2050=A;2051=;2070=A;2071=;2100=A;2240=AR;2300=A;2360=';
export const EFFECT_BUCKET_CAPACITIES = Object.freeze({
  5: 72, 14: 864, 15: 48, 16: 768, 19: 192,
});
// Filled from the sorted-key canonical form after every intended witness update.
export const EFFECT_WITNESS_SHA256 =
  '87f20c5ca76d2d09c93f5b9389565826d8a3feaf56d2e984eeda9e904c718465';
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
    exactKeys(pair.trace, ['logicFrames', 'rows', 'sha256'], `${pair.key} trace`);
    need(JSON.stringify(pair.trace.logicFrames) === JSON.stringify([1, 2372]),
      `${pair.key} trace logic-frame bounds changed`);
    need(pair.trace.rows === 2372, `${pair.key} trace row count changed`);
    sha(pair.trace.sha256, `${pair.key} trace`);
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

export function verifyEffectTrace(witness, pairKey, payload) {
  const pair = witness?.pairs?.find((entry) => entry.key === pairKey);
  need(pair, `capture pair ${JSON.stringify(pairKey)} is not authentic`);
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const lines = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  need(lines.length === pair.trace.rows + 1,
    `${pairKey} capture row count changed`);
  const columns = lines[0].split('\t');
  const lfColumn = columns.indexOf('lf');
  need(lfColumn >= 0, `${pairKey} capture has no logic-frame column`);
  for (let index = 1; index < lines.length; index++) {
    const lf = Number(lines[index].split('\t')[lfColumn]);
    need(lf === index, `${pairKey} capture logic frame ${index} changed`);
  }
  need(createHash('sha256').update(bytes).digest('hex') === pair.trace.sha256,
    `${pairKey} capture SHA-256 changed`);
  return true;
}

function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let file = path.join(here, 'oracle', 'w593-selector-effects.json');
  let capture = null;
  let pairKey = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--capture') capture = argv[++index];
    else if (arg === '--pair') pairKey = argv[++index];
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
    else if (file !== path.join(here, 'oracle', 'w593-selector-effects.json')) {
      fail('more than one witness path');
    } else file = arg;
  }
  need((capture === null) === (pairKey === null),
    '--capture and --pair must be supplied together');
  const witness = JSON.parse(readFileSync(file, 'utf8'));
  const scenarios = JSON.parse(readFileSync(path.join(here, 'oracle', 'scenarios.json'), 'utf8'));
  verifyEffectScenarios(scenarios);
  verifyEffectWitness(witness);
  if (capture) {
    verifyEffectTrace(witness, pairKey, readFileSync(capture));
    console.log(`EFFECTGATE CAPTURE OK: ${pairKey}, ${witness.pairs.find((p) => p.key === pairKey).trace.rows} rows`);
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
