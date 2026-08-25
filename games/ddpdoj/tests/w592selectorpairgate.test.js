// W592: six-pair VERSION-B selector evidence and strict offline verification.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAIR_KEYS, validatePairgateScenarios, validatePairgateWitness,
} from '../tools/pairgate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORACLE = path.join(HERE, '..', 'tools', 'oracle');
const WITNESS_PATH = path.join(ORACLE, 'w592selectorpairgate.board.json');
const SCENARIOS_PATH = path.join(ORACLE, 'scenarios.json');
const WITNESS = JSON.parse(fs.readFileSync(WITNESS_PATH, 'utf8'));
const SCENARIOS = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf8'));
const clone = () => structuredClone(WITNESS);

function rejected(mutator, pattern) {
  const changed = clone();
  mutator(changed);
  assert.throws(() => validatePairgateWitness(changed, SCENARIOS), pattern);
}

test('W592 tracked pairgate witness verifies all six exact selector pairs offline', () => {
  assert.equal(validatePairgateScenarios(SCENARIOS), true);
  assert.equal(validatePairgateWitness(WITNESS, SCENARIOS), true);
  assert.deepEqual(Object.keys(WITNESS.pairs), PAIR_KEYS);
  assert.deepEqual(WITNESS.oracle, {
    mame: '0.288 (mame0288)',
    set: 'ddpdojblk',
    build: 'B',
    maincpuSize: 6291456,
    decryptedMaincpuFnv64: 'D4C25CA9C91B9D47',
  });

  for (const key of PAIR_KEYS) {
    const pair = WITNESS.pairs[key];
    assert.equal(pair.selectorCommit.mailboxShip, pair.ship, `${key} committed ship mailbox`);
    assert.equal(pair.selectorCommit.mailboxStyle, pair.style, `${key} committed style mailbox`);
    assert.equal(pair.playerCreated.cachedShip, pair.ship, `${key} cached ship selector`);
    assert.equal(pair.playerCreated.cachedStyle, pair.style, `${key} cached style selector`);
    assert.deepEqual(pair.playerCreated, pair.liveLf2000,
      `${key} canonical player facts remain stable through lf2000`);
    assert.equal(pair.trace.rows, 2050);
    assert.match(pair.trace.sha256, /^[0-9a-f]{64}$/);
    assert.equal(pair.snapshotLf2000.videoFrame, 2036);
    assert.match(pair.snapshotLf2000.sha256, /^[0-9a-f]{64}$/);
  }
});

test('W592 board facts pin bomb stock, hitbox high word, movement, laser floor and cursors', () => {
  const at = (ship, style) => WITNESS.pairs[`${ship},${style}`].playerCreated;
  for (const ship of [0, 2]) {
    assert.deepEqual([2, 4, 6].map((style) => at(ship, style).bombPlus24), [3, 2, 1]);
    assert.deepEqual([2, 4, 6].map((style) => at(ship, style).bombPlus25), [3, 2, 1]);
  }
  assert.deepEqual([2, 4, 6].map((style) => at(0, style).hitboxHighWord), [0x80, 0x80, 0x80]);
  assert.deepEqual([2, 4, 6].map((style) => at(2, style).hitboxHighWord), [0x100, 0x100, 0x100]);
  assert.deepEqual([2, 4, 6].map((style) => at(0, style).speedIndex), [0x16, 0x16, 0x16]);
  assert.deepEqual([2, 4, 6].map((style) => at(2, style).speedIndex), [0x13, 0x13, 0x13]);
  assert.deepEqual([2, 4, 6].map((style) => at(0, style).laserFloor), [0x0c, 0x10, 0x10]);
  assert.deepEqual([2, 4, 6].map((style) => at(2, style).laserFloor), [0x0c, 0x0f, 0x0f]);
  assert.deepEqual(PAIR_KEYS.map((key) => WITNESS.pairs[key].playerCreated.powerCursorE4),
    [0x25523c, 0x255250, 0x255264, 0x255246, 0x25525a, 0x25526e]);
  assert.ok(PAIR_KEYS.every((key) => {
    const facts = WITNESS.pairs[key].playerCreated;
    return facts.powerCursorE8 === facts.powerCursorE4 + 0x3c;
  }), 'second power cursor is exactly $3C bytes after the first');
});

test('W592 verifier rejects partial, mislabeled, stale and malformed witnesses', () => {
  rejected((w) => { delete w.pairs['2,6']; }, /witness\.pairs: keys/);
  rejected((w) => { w.pairs['0,2'].ship = 2; }, /\.ship:/);
  rejected((w) => { w.oracle.mame = '0.289'; }, /oracle\.mame/);
  rejected((w) => { w.oracle.decryptedMaincpuFnv64 = '0000000000000000'; }, /MaincpuFnv64/);
  rejected((w) => { w.pairs['0,4'].script += ';2000=A'; }, /\.script:/);
  rejected((w) => { w.pairs['0,6'].transitions.selectorCommit.lf = 1618; }, /selectorCommit\.lf/);
  rejected((w) => { w.pairs['2,2'].selectorCommit.mailboxShip = 0; }, /mailboxShip/);
  rejected((w) => { w.pairs['2,4'].playerCreated.cachedStyle = 6; }, /cachedStyle/);
  rejected((w) => { w.pairs['2,6'].playerCreated.bombPlus24 = 2; }, /bombPlus24/);
  rejected((w) => { w.pairs['0,6'].liveLf2000.bombPlus25 = 2; }, /bombPlus25/);
  rejected((w) => { w.pairs['0,2'].playerCreated.speedIndex = 0x13; }, /speedIndex/);
  rejected((w) => { w.pairs['2,4'].playerCreated.laserFloor = 0x10; }, /laserFloor/);
  rejected((w) => { w.pairs['2,6'].playerCreated.powerCursorE4++; }, /powerCursorE4/);
  rejected((w) => { w.pairs['0,4'].trace.sha256 = '0'.repeat(64); }, /trace\.sha256/);
  rejected((w) => { w.pairs['0,4'].snapshotLf2000.sha256 = 'f'.repeat(64); }, /snapshotLf2000\.sha256/);
  rejected((w) => { w.pairs['0,2'].unexpected = true; }, /keys/);
});

test('W592 witness is compact and explicitly does not claim effects coverage', () => {
  const bytes = fs.readFileSync(WITNESS_PATH);
  const text = bytes.toString('utf8');
  assert.ok(bytes.length < 30000, 'tracked witness contains facts and identities, not captures');
  assert.doesNotMatch(text, /[A-Za-z]:\\|\.tsv"|\.png"|framebufferBytes|romBytes/);
  assert.match(WITNESS.scope, /Effects, sprite buckets and pixel crops are not covered/);
});
