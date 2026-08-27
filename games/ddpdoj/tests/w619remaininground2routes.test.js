// W619: offline schema, mutation controls, and static closure for all remaining routes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRound2RouteWitness } from './round2routegate.js';
import { W619_ROUTES } from './w619routes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const HARNESS = path.join(HERE, 'round2routeharness.js');
const CLOSURE = path.join(ROOT, 'games/ddpdoj/tools/round2closure.py');
const CLOSURE_ROM = path.join(ROOT, 'games/ddpdoj/tools/oracle/out/maincpu.bin');
const witnesses = W619_ROUTES.map((descriptor) => JSON.parse(readFileSync(
  path.join(HERE, descriptor.fixture), 'utf8',
)));
const clone = (value) => JSON.parse(JSON.stringify(value));

function rejected(mutator, pattern) {
  const document = clone(witnesses[0]);
  mutator(document);
  assert.throws(
    () => validateRound2RouteWitness(document, W619_ROUTES[0]),
    pattern,
  );
}

test('W619 four fixtures close offline under one strict payload-free schema', () => {
  assert.equal(W619_ROUTES.length, 4);
  assert.equal(new Set(W619_ROUTES.map(({ fixture }) => fixture)).size, 4);
  assert.deepEqual(
    W619_ROUTES.map(({ pair }) => `${pair.ship}/${pair.style}`).sort(),
    ['0/6', '2/2', '2/4', '2/6'],
  );
  for (let index = 0; index < W619_ROUTES.length; index++) {
    assert.equal(validateRound2RouteWitness(witnesses[index], W619_ROUTES[index]), true);
  }

  const source = readFileSync(HARNESS, 'utf8');
  for (const forbidden of [
    /node:fs/, /node:path/, /readCheckpoint/, /writeCheckpoint/,
    /restoreCheckpoint/, /checkpointFileName/, /probes[\\/]checkpoints/,
    /\bresume\b/,
  ]) {
    assert.doesNotMatch(source, forbidden,
      `cold route harness must not gain checkpoint or filesystem access: ${forbidden}`);
  }
});

test('W619 fixture validator rejects schema, payload, cadence, and topology mutants', () => {
  rejected((document) => { document.payload = 'forbidden'; }, /unknown or missing field/);
  rejected((document) => { document.ram = 'forbidden'; }, /unknown or missing field/);
  rejected((document) => { document.game = {}; }, /unknown or missing field/);
  rejected((document) => { document.checkpointPath = 'local.json'; }, /unknown or missing field/);
  rejected((document) => { document.selection.p2 = { ship: 2, style: 2 }; },
    /unknown or missing field/);
  rejected((document) => { document.probe.resume = 'local.json'; },
    /unknown or missing field/);
  rejected((document) => { document.periodic[0].push('extra'); },
    /ten identity columns/);
  rejected((document) => { document.periodic.splice(10, 1); }, undefined);
  rejected((document) => { document.periodic[10][0]++; },
    /every 500-step identity/);
  rejected((document) => { document.periodic[10][8] = '0'.repeat(63); },
    /RAM hash/);
  rejected((document) => { document.frontiers[2][3] = 0; },
    /all five stages/);
  rejected((document) => { document.frontiers[2].splice(3, 4, 0, 0, 0, 0); },
    /all five stages|first all-zero reset/);
  rejected((document) => { document.terminal[6] = 1; }, undefined);
});

test('W619 retains the W533 all-stage static closure', {
  skip: existsSync(CLOSURE_ROM) ? false
    : 'local decrypted ROM absent; this is a skip, not a pass',
}, () => {
  const result = spawnSync(process.env.PYTHON || 'python', [CLOSURE], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /UNRESOLVED 0\r?\nCLOSED/);
});
