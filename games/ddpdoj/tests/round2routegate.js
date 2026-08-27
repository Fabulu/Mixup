// Shared exact gate for one fresh Black Label round-2 route witness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBundle } from '../src/web/assets.js';
import { CHECKPOINT_SCHEMA } from '../tools/progression-checkpoint.mjs';
import {
  ROUND2_IDENTITY_COLUMNS, ROUND2_INPUT_STATE_MACHINE, ROUND2_START_INPUT,
  runColdRound2Route,
} from './round2routeharness.js';

const TABLE_HASH = '1b5e97385bc33328b5ce9b3e253b91f61576f4ffe2dd6311ef80542edfb1a6e9';
const SEED_HASH = '6886bc97b999e3dc0263b8e2d2cdf1df701be09b3039d9de46cdfbe870f9c0fb';
const TABLE_META = Object.freeze({
  sha256: TABLE_HASH,
  windows: 941,
  bytes: 457059,
  overlapPairs: 77,
});
const ROOT_KEYS = Object.freeze([
  'schema', 'checkpointSchema', 'identityColumns', 'selection', 'probe',
  'seed', 'tables', 'successfulSteps', 'start', 'inputFrontiers',
  'frontiers', 'periodic', 'terminal',
]);
const RAW_FRONTIERS = Object.freeze([
  [1, 2, 4, 0],
  [2, 4, 8, 0],
  [3, 6, 12, 0],
  [4, 8, 16, 0],
  [4, 8, 16, 1],
  [0, 0, 0, 1],
  [1, 2, 4, 1],
  [2, 4, 8, 1],
  [3, 6, 12, 1],
  [4, 8, 16, 1],
  [0, 0, 0, 0],
]);
const INPUT_WORDS = Object.freeze([
  ROUND2_START_INPUT, 0xffff, 0xfff7, 0xffff, 0xffdf, ROUND2_START_INPUT,
]);
const HASH = /^[0-9a-f]{64}$/;

const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const byteHash = (value) => createHash('sha256').update(value).digest('hex');

function exactKeys(value, keys, label) {
  assert.ok(value != null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${label} has an unknown or missing field`);
}

function validateIdentity(identity, label) {
  assert.ok(Array.isArray(identity), `${label} must be an array`);
  assert.equal(identity.length, 10, `${label} must have ten identity columns`);
  for (let index = 0; index < 8; index++) {
    assert.ok(Number.isInteger(identity[index]), `${label}[${index}] must be an integer`);
  }
  assert.ok(identity[0] >= 0, `${label} stepped count must be nonnegative`);
  assert.ok(identity[1] >= 2000, `${label} logic frame predates the exact seed`);
  assert.ok(identity[2] >= 2036, `${label} video frame predates the exact seed`);
  assert.ok(identity[7] >= 0 && identity[7] <= 0xffff,
    `${label} input word is outside 16 bits`);
  assert.match(identity[8], HASH, `${label} RAM hash is not exact SHA-256`);
  assert.match(identity[9], HASH, `${label} Game hash is not exact SHA-256`);
}

export function validateRound2RouteWitness(expected, descriptor) {
  const { pair, start, terminal } = descriptor;
  exactKeys(expected, ROOT_KEYS, 'route witness');
  assert.equal(expected.schema, 'ddpdoj.w619-route-hashes.v1');
  assert.equal(expected.checkpointSchema, CHECKPOINT_SCHEMA);
  assert.deepEqual(expected.identityColumns, ROUND2_IDENTITY_COLUMNS);
  exactKeys(expected.selection, ['ship', 'style'], 'selection');
  assert.deepEqual(expected.selection, pair);
  exactKeys(expected.probe, [
    'invulnerable', 'inputStateMachine', 'cadence', 'startInputWord', 'maxSteps',
  ], 'probe');
  assert.deepEqual(expected.probe, {
    invulnerable: true,
    inputStateMachine: ROUND2_INPUT_STATE_MACHINE,
    cadence: 500,
    startInputWord: ROUND2_START_INPUT,
    maxSteps: 200000,
  });
  exactKeys(expected.seed, ['bytes', 'sha256'], 'seed');
  assert.deepEqual(expected.seed, { bytes: 131072, sha256: SEED_HASH });
  exactKeys(expected.tables, ['sha256', 'windows', 'bytes', 'overlapPairs'], 'tables');
  assert.deepEqual(expected.tables, TABLE_META);

  assert.ok(Number.isInteger(expected.successfulSteps));
  assert.equal(expected.successfulSteps, terminal.steps);
  validateIdentity(expected.start, 'start');
  assert.deepEqual(expected.start, start, 'the complete fresh selection identity is exact');
  validateIdentity(expected.terminal, 'terminal');
  assert.deepEqual(expected.terminal, [
    terminal.steps, terminal.logicFrame, terminal.videoFrame,
    0, 0, 0, 0, ROUND2_START_INPUT,
    terminal.ramSha256, terminal.gameSha256,
  ]);
  assert.equal(terminal.logicFrame, 2000 + terminal.steps);
  assert.notEqual(terminal.steps % expected.probe.cadence, 0,
    'the terminal reset must remain separate from cadence identities');

  assert.ok(Array.isArray(expected.inputFrontiers));
  assert.equal(expected.inputFrontiers.length, INPUT_WORDS.length);
  assert.deepEqual(expected.inputFrontiers.map((frontier) => frontier[2]), INPUT_WORDS,
    'the real round-2 menu edges remain exact');
  for (let index = 0; index < expected.inputFrontiers.length; index++) {
    const frontier = expected.inputFrontiers[index];
    assert.ok(Array.isArray(frontier));
    assert.equal(frontier.length, 3);
    for (const value of frontier) assert.ok(Number.isInteger(value));
    if (index === 0) {
      assert.deepEqual(frontier, [0, 2000, ROUND2_START_INPUT]);
    } else {
      assert.ok(frontier[0] > expected.inputFrontiers[index - 1][0]);
      assert.equal(frontier[1], 1999 + frontier[0],
        'input frontiers are sampled immediately before their successful step');
    }
  }

  assert.ok(Array.isArray(expected.frontiers));
  assert.equal(expected.frontiers.length, RAW_FRONTIERS.length);
  for (let index = 0; index < expected.frontiers.length; index++) {
    const frontier = expected.frontiers[index];
    assert.ok(Array.isArray(frontier));
    assert.equal(frontier.length, 7);
    for (const value of frontier) assert.ok(Number.isInteger(value));
    assert.equal(frontier[1], 2000 + frontier[0]);
    if (index > 0) assert.ok(frontier[0] > expected.frontiers[index - 1][0]);
  }
  assert.deepEqual(expected.frontiers.map((frontier) => frontier.slice(3)), RAW_FRONTIERS,
    'the route traverses all five stages in both Black Label loops');
  const firstTerminalReset = expected.frontiers.findIndex((frontier) =>
    frontier[3] === 0 && frontier[4] === 0 && frontier[5] === 0 && frontier[6] === 0);
  assert.equal(firstTerminalReset, expected.frontiers.length - 1,
    'the first all-zero reset occurs only after loop 1 was observed');
  assert.ok(expected.frontiers.slice(0, -1).some((frontier) => frontier[6] === 1));
  assert.deepEqual(expected.frontiers.at(-1), expected.terminal.slice(0, 7));

  assert.ok(Array.isArray(expected.periodic));
  assert.equal(expected.periodic.length,
    Math.floor(terminal.steps / expected.probe.cadence));
  for (let index = 0; index < expected.periodic.length; index++) {
    const identity = expected.periodic[index];
    validateIdentity(identity, `periodic[${index}]`);
    assert.equal(identity[0], (index + 1) * expected.probe.cadence,
      'every 500-step identity is present exactly once');
    assert.equal(identity[1], 2000 + identity[0]);
  }
  assert.ok(expected.periodic.at(-1)[0] < expected.terminal[0]);
  return true;
}

export function registerRound2RouteGate(metaUrl, descriptor) {
  const { pair, fixture } = descriptor;
  const here = (relative) => fileURLToPath(new URL(relative, metaUrl));
  const tablesPath = here('../rip/port/player.tables.json');
  const assets = here('../assets');
  const witnessPath = here(`./${fixture}`);
  const expected = JSON.parse(readFileSync(witnessPath, 'utf8'));
  const requiredAssets = [
    tablesPath,
    path.join(assets, 'manifest.json'),
    path.join(assets, 'seed.bin.gz'),
    path.join(assets, 'player.tables.json.gz'),
  ];
  const skip = requiredAssets.every(existsSync) ? false
    : `exact ship-${pair.ship}/style-${pair.style} web bundle absent. This is a skip, not a pass.`;
  const tableJson = existsSync(tablesPath)
    ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;

  test(`W619 ship-${pair.ship}/style-${pair.style} fixture closes offline`, () => {
    assert.equal(validateRound2RouteWitness(expected, descriptor), true);
  });

  test(`W619 fresh ship-${pair.ship}/style-${pair.style} route pins both loops through terminal reset`,
    { skip }, async () => {
      validateRound2RouteWitness(expected, descriptor);
      const exact = await loadBundle(async (name) =>
        new Uint8Array(readFileSync(path.join(assets, name))));
      assert.deepEqual(exact.tables, tableJson,
        'the web bundle carries the exact production cartridge table');
      assert.deepEqual([
        exact.seed.byteLength,
        byteHash(exact.seed),
        canonicalHash(exact.tables),
      ], [131072, SEED_HASH, TABLE_HASH]);

      const actual = runColdRound2Route(exact, pair, {
        cadence: expected.probe.cadence,
        maxSteps: expected.probe.maxSteps,
      });
      assert.deepEqual(actual, {
        selection: expected.selection,
        successfulSteps: expected.successfulSteps,
        start: expected.start,
        inputFrontiers: expected.inputFrontiers,
        frontiers: expected.frontiers,
        periodic: expected.periodic,
        terminal: expected.terminal,
      }, 'the independent fresh route replay reproduces every exact witness identity');
    });
}
