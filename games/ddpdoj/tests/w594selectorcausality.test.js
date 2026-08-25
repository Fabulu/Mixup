// W594: selector reads, enemy ancestry, indirect wave causes, and the bounded
// 0/2 intervention. Bulk MAME traces and events remain ignored.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { chainHit, LEDGER, SCORE } from '../src/score.js';
import {
  CAUSALITY_STATE_COLUMNS, CAUSALITY_TRACE_COLUMNS, CAUSALITY_WITNESS_SHA256,
  causalityWitnessSha256, normalizeCausalityTrace, shouldSubstituteSelectorRead,
  substituteSelectorWord, verifyCausalityScenarios, verifyCausalityWitness,
} from '../tools/causalitygate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WITNESS = JSON.parse(readFileSync(
  path.resolve(HERE, '../tools/oracle/w594-selector-causality.json'), 'utf8'));
const SCENARIOS = JSON.parse(readFileSync(
  path.resolve(HERE, '../tools/oracle/scenarios.json'), 'utf8'));
const DIRECT_COUNTS = new Map([
  ['0/2', [38, 2076, 2330, '0000']],
  ['0/4', [34, 2078, 2330, '0000']],
  ['0/6', [37, 2076, 2330, '0000']],
  ['2/2', [41, 2080, 2330, '0002']],
  ['2/4', [37, 2076, 2330, '0002']],
  ['2/6', [39, 2080, 2330, '0002']],
]);

function direct(pair) {
  return pair.selectorReads.filter((fact) => fact.ancestry.length > 0);
}

function rejects(mutate, pattern) {
  const copy = structuredClone(WITNESS);
  mutate(copy);
  assert.throws(() => verifyCausalityWitness(copy), pattern);
}

test('W594 witness pins all direct reads, indirect causes, and interventions', () => {
  assert.equal(verifyCausalityScenarios(SCENARIOS), true);
  assert.equal(verifyCausalityWitness(WITNESS), true);
  assert.equal(causalityWitnessSha256(WITNESS), CAUSALITY_WITNESS_SHA256);
  assert.equal(WITNESS.pairs.length, 6);
  assert.equal(WITNESS.comparisons.length, 15);
  assert.deepEqual(WITNESS.scenario.baselineWords, {
    '81043E': '0000', '810440': '0002', '8104A0': '0000', '8104A2': '0000',
    '813084': '0000', '813086': '00FF', '813088': '0002', '81308A': '00FF',
  });
  assert.deepEqual(WITNESS.reader, {
    pc: '2862C8', address: '81043E', mask: 'FFFF',
    instruction: 'move.w $81043E.l,D2',
    continuation: [
      '2862CE lea $287DF4.l,A0',
      '2862D4 move.w (A0,D2.w),$81B5E0.l',
    ],
    table: {
      address: '287DF4', indexScaling: 'none-selector-is-byte-offset',
      entries: [{ selector: 0, refill: 20 }, { selector: 2, refill: 18 }],
    },
    ancestry: ['2634FE', '26353A'],
    classification: 'enemy-hit-chain-refill-not-wave-scheduling',
  });

  for (const pair of WITNESS.pairs) {
    const reads = direct(pair);
    assert.equal(reads.length, 1, `${pair.key} direct reader count`);
    assert.deepEqual([
      reads[0].count, reads[0].firstLogicFrame, reads[0].lastLogicFrame, reads[0].value,
    ], DIRECT_COUNTS.get(pair.key), `${pair.key} direct reader`);
    assert.deepEqual(reads[0].ancestry, ['2634FE', '26353A']);
    assert.equal(pair.intervention.substitutions[0].count, reads[0].count);
    assert.equal(pair.intervention.substitutions[0].returned, '0000');
    assert.equal(pair.intervention.events.orderSha256, pair.events.orderSha256,
      `${pair.key} semantic event ordering`);
    if (pair.ship === 0) {
      assert.deepEqual(pair.intervention.changedCausalColumns, []);
      assert.deepEqual(pair.intervention.changedTraceColumns, {});
    } else {
      assert.deepEqual(pair.intervention.changedCausalColumns, ['c_display']);
      assert.equal(pair.intervention.changedTraceColumns.c_display, reads[0].firstLogicFrame);
      for (const unchanged of [
        'c_enemy', 'c_collision', 'c_bullets', 'c_enemy_n0', 'c_enemy_n1',
        'c_enemy_n2', 'c_bullet_n', 'c_rankclock0', 'c_rankclock1', 'c_rank',
        'c_rng', 'c_prod5', 'c_prod14', 'c_prod15', 'c_prod16', 'c_prod19',
      ]) {
        assert.equal(pair.intervention.changedTraceColumns[unchanged], undefined,
          `${pair.key} ${unchanged} remains natural`);
      }
    }
  }

  for (const comparison of WITNESS.comparisons) {
    const field = comparison.sameShip ? 'c_rng' : 'c_px';
    assert.equal(comparison.enemyCause.field, field);
    assert.equal(comparison.bulletCause.field, field);
    assert.ok(comparison.enemyCause.logicFrame < comparison.enemyCause.targetLogicFrame,
      `${comparison.key} earlier enemy cause`);
    assert.ok(comparison.bulletCause.logicFrame < comparison.bulletCause.targetLogicFrame,
      `${comparison.key} earlier bullet cause`);
    assert.deepEqual(Object.keys(comparison.firstDivergence), [...CAUSALITY_STATE_COLUMNS]);
  }
});

test('W594 verifier rejects changed verdicts, ancestry, bounds, identities, and ordering', () => {
  const changedScenario = structuredClone(SCENARIOS);
  changedScenario.paircausality.baselineWords = changedScenario.paircausality.baselineWords
    .replace('81043E=0000', '81043E=0002');
  assert.throws(() => verifyCausalityScenarios(changedScenario), /baseline selector words changed/);

  rejects((w) => { w.verdict.directWaveSchedulingObserved = true; }, /causality verdict changed/);
  rejects((w) => { direct(w.pairs[0])[0].ancestry = ['2634FA']; }, /direct selector identity changed/);
  rejects((w) => { w.pairs[0].events.logicFrames[0] = 1999; }, /natural events bounds changed/);
  rejects((w) => { w.pairs[0].key = '2/6'; }, /unknown or duplicate pair|selector fields disagree/);
  rejects((w) => {
    w.comparisons[0].enemyCause.logicFrame = w.comparisons[0].enemyCause.targetLogicFrame;
  }, /not strictly earlier/);
  rejects((w) => { w.pairs[0].trace.sha256 = '0'.repeat(64); },
    /canonical digest changed|intervention control changed/);
  rejects((w) => { w.pairs[0].events.sha256 = '0'.repeat(64); },
    /canonical digest changed|intervention control changed/);
  rejects((w) => { w.reader.pc = '2862CA'; }, /direct reader instruction changed/);
  rejects((w) => { direct(w.pairs[0])[0].address = '810440'; }, /direct selector identity changed/);
  rejects((w) => { direct(w.pairs[0])[0].value = '0002'; }, /direct selector value changed/);
  rejects((w) => { w.pairs[0].intervention.substitutions[0].count--; },
    /did not cover exactly the direct reads/);
  rejects((w) => { w.pairs[0].intervention.changedCausalColumns.push('c_enemy'); },
    /changed enemy, collision, bullet/);
});

test('W594 trace normalization omits only d_date and preserves exact framing', () => {
  const header = [...CAUSALITY_TRACE_COLUMNS];
  const row = Object.fromEntries(header.map((name) => [name, `${name}-value`]));
  row.lf = '1';
  row.d_date = 'calendar-a';
  const line = (value) => header.map((name) => value[name]).join('\t');
  const first = Buffer.from(`${header.join('\t')}\n${line(row)}\n`);
  const otherDateRow = { ...row, d_date: 'calendar-b' };
  const otherDate = Buffer.from(`${header.join('\t')}\n${line(otherDateRow)}\n`);
  assert.deepEqual(normalizeCausalityTrace(first), normalizeCausalityTrace(otherDate));

  const changed = { ...row, c_enemy: 'changed-enemy' };
  const changedPayload = Buffer.from(`${header.join('\t')}\n${line(changed)}\n`);
  assert.notDeepEqual(normalizeCausalityTrace(first), normalizeCausalityTrace(changedPayload));
  assert.throws(() => normalizeCausalityTrace(Buffer.from(first.toString().replace(
    'c_enemy\t', 'stale_enemy\t'))), /columns changed/);
  assert.throws(() => normalizeCausalityTrace(first.subarray(0, first.length - 1)),
    /terminal newline/);
});

test('W594 intervention predicate permits only the one observed direct read', () => {
  const eligible = {
    pc: '2862C8', address: '81043E', mask: 'FFFF', ancestry: ['2634FE', '26353A'],
  };
  assert.equal(shouldSubstituteSelectorRead(eligible), true);
  const rejectsRead = (change, label) => assert.equal(
    shouldSubstituteSelectorRead({ ...eligible, ...change }), false, label);

  rejectsRead({ address: '813084' }, 'mailbox read');
  rejectsRead({ address: '8104A0' }, 'P2 read');
  rejectsRead({ address: '810440' }, 'style read');
  rejectsRead({ pc: '2862CA' }, 'wrong CURPC');
  rejectsRead({ mask: 'FF00' }, 'high-byte read');
  rejectsRead({ mask: '00FF' }, 'low-byte read');
  rejectsRead({ ancestry: ['26353A'] }, 'missing $2634FE');
  rejectsRead({ ancestry: ['2634FE'] }, 'missing $26353A');
  rejectsRead({ ancestry: ['2634FA'] }, 'spawn-only ancestry');
  rejectsRead({ ancestry: ['263652'] }, 'init-only ancestry');
  rejectsRead({ pc: '249BCE' }, 'player-facing selector reader');
  rejectsRead({ ancestry: '2634FE,26353A' }, 'not one parsed live stack snapshot');
});

test('W594 0/2 substitution merges full, high, and low big-endian lanes', () => {
  assert.equal(substituteSelectorWord(0xab34, 0xffff, 0x0012), 0x0012);
  assert.equal(substituteSelectorWord(0xab34, 0xff00, 0x0012), 0x0034);
  assert.equal(substituteSelectorWord(0xab34, 0x00ff, 0x0012), 0xab12);
  assert.equal(substituteSelectorWord(0xab34, 0x0000, 0x0012), 0xab34);
});

test('W594 chainHit uses authentic selector byte offsets for refills 20 and 18', () => {
  for (const [selector, refill] of [[0, 20], [2, 18]]) {
    const ram = new Ram();
    ram.setU16(LEDGER.p1.weaponSel, selector);
    ram.setU16(SCORE.laserRec, 0x8000);
    let reads = 0;
    const rom = {
      u16(address) {
        reads += 1;
        assert.equal(address, SCORE.refillTable + selector,
          `selector ${selector} remains an unscaled byte offset`);
        return refill;
      },
    };
    assert.equal(chainHit(ram, rom, {}, LEDGER.p1, 0x1234, 0), 0x1234);
    assert.equal(ram.u16(SCORE.refillAmt), refill);
    assert.equal(reads, 1);
  }
});
