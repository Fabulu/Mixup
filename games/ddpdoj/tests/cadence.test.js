import assert from 'node:assert/strict';
import test from 'node:test';

import { DdpdojCadence } from '../src/cadence.js';

const PERIOD = 10;

function run(cadence, elapsedMs, logicPeriodMs, events, maxLogicSteps = 8) {
  return cadence.advance(elapsedMs, {
    logicPeriodMs,
    stepLogic: () => events.push('logic'),
    stepSound: () => events.push('sound'),
    maxLogicSteps,
  });
}

test('arm two services sound before and after the delayed logic boundary', () => {
  const cadence = new DdpdojCadence(PERIOD);
  const events = [];
  const logicPeriodMs = () => 2 * PERIOD;

  assert.deepEqual(run(cadence, PERIOD, logicPeriodMs, events), {
    logicSteps: 0, soundTicks: 1, blocked: false, pendingMs: 0,
  });
  assert.deepEqual(events, ['sound']);

  run(cadence, PERIOD, logicPeriodMs, events);
  assert.deepEqual(events, ['sound', 'logic', 'sound'],
    'canonical logic posts its command before the coincident sound tick');
});

test('sound cadence stays fixed under turbo and fractional timing scales', () => {
  for (const [name, logicPeriod, expectedLogic] of [
    ['turbo', PERIOD / 2, 4],
    ['bullet time', PERIOD * 2, 1],
    ['adaptive', PERIOD * 1.5, 1],
  ]) {
    const cadence = new DdpdojCadence(PERIOD);
    const events = [];
    const result = run(cadence, PERIOD * 2, () => logicPeriod, events);
    assert.equal(result.logicSteps, expectedLogic, name);
    assert.equal(result.soundTicks, 2, `${name} preserves two hardware sound ticks`);
  }
});

test('logic deadline is recomputed after every canonical step', () => {
  const cadence = new DdpdojCadence(PERIOD);
  const events = [];
  let arm = 1;
  const result = cadence.advance(PERIOD * 5, {
    logicPeriodMs: () => PERIOD * arm,
    stepLogic() {
      events.push(`logic-${arm}`);
      arm = 5;
    },
    stepSound: () => events.push('sound'),
  });

  assert.deepEqual(events, [
    'logic-1', 'sound', 'sound', 'sound', 'sound', 'sound',
  ]);
  assert.equal(result.logicSteps, 1);
  assert.equal(result.soundTicks, 5);
});

test('logic cap stops the whole chronology before a later sound event', () => {
  const cadence = new DdpdojCadence(PERIOD);
  const events = [];
  const first = run(cadence, PERIOD * 2, () => PERIOD / 10, events);

  assert.equal(first.logicSteps, 8);
  assert.equal(first.soundTicks, 0,
    'sound cannot pass an earlier logic event left behind by the cap');
  assert.equal(first.blocked, true);
  assert.ok(first.pendingMs > PERIOD);
  assert.deepEqual(new Set(events), new Set(['logic']));

  const resumed = run(cadence, 0, () => PERIOD / 10, events);
  assert.equal(resumed.soundTicks, 1,
    'the blocked timeline resumes in chronological order on the next batch');
  assert.equal(events[9], 'logic');
  assert.equal(events[10], 'sound');
});

test('cold arm zero runs logic immediately without inventing a sound tick', () => {
  const cadence = new DdpdojCadence(PERIOD);
  const events = [];
  let cold = true;
  const result = cadence.advance(0, {
    logicPeriodMs: () => cold ? 0 : PERIOD,
    stepLogic() {
      events.push('logic');
      cold = false;
    },
    stepSound: () => events.push('sound'),
  });

  assert.deepEqual(result, {
    logicSteps: 1, soundTicks: 0, blocked: false, pendingMs: 0,
  });
  assert.deepEqual(events, ['logic']);
});

test('reset discards stale elapsed time and restores the hardware phase', () => {
  const cadence = new DdpdojCadence(PERIOD);
  const events = [];
  run(cadence, PERIOD * 0.75, () => PERIOD, events);
  cadence.reset();
  run(cadence, PERIOD * 0.25, () => PERIOD, events);
  assert.deepEqual(events, []);
  run(cadence, PERIOD * 0.75, () => PERIOD, events);
  assert.deepEqual(events, ['logic', 'sound']);
});

test('cadence rejects invalid clocks and callbacks', () => {
  assert.throws(() => new DdpdojCadence(0), /positive and finite/);
  const cadence = new DdpdojCadence(PERIOD);
  assert.throws(() => cadence.advance(-1, {}), /non-negative finite/);
  assert.throws(() => cadence.advance(0, {
    logicPeriodMs: () => Number.NaN,
    stepLogic() {},
    stepSound() {},
  }), /logic period/);
});
