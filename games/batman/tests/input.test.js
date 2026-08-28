// Keyboard input edges.  Produces $FFE1 (held) / $FFE2 (newly pressed).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BTN, attachInput, detachInput, resetInput, sampleInput,
} from '../src/input.js';

/** The smallest thing attachInput() will bind to. */
function fakeTarget() {
  const handlers = {};
  return {
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      handlers[type] = (handlers[type] || []).filter((handler) => handler !== fn);
    },
    handlerCount(type) { return (handlers[type] || []).length; },
    fire(type, ev) { for (const fn of handlers[type] || []) fn({ preventDefault() {}, ...ev }); },
    keydown(code, repeat = false) { this.fire('keydown', { code, repeat }); },
    keyup(code) { this.fire('keyup', { code }); },
  };
}

const newState = () => ({ input: { held: 0, pressed: 0, prev: 0 } });

/**
 * Attach to a fresh target and clear the module's shared key state.
 * input.js keeps `held` / `seen` / `firstSample` at module scope, as the real
 * thing must -- so tests have to reset between cases, and blur is the reset
 * the module already exposes.
 */
function attachFresh() {
  const t = fakeTarget();
  attachInput(t);
  t.fire('blur', {});
  return t;
}

test('input attachment is idempotent and detach clears launcher-era state', () => {
  const target = fakeTarget();
  resetInput();
  attachInput(target);
  attachInput(target);
  assert.equal(target.handlerCount('keydown'), 1);
  assert.equal(target.handlerCount('keyup'), 1);
  assert.equal(target.handlerCount('blur'), 1);

  const running = newState();
  sampleInput(running);
  target.keydown('Enter');
  sampleInput(running);
  assert.equal(running.input.pressed & BTN.START, BTN.START);

  detachInput();
  assert.equal(target.handlerCount('keydown'), 0);
  assert.equal(target.handlerCount('keyup'), 0);
  assert.equal(target.handlerCount('blur'), 0);
  const restarted = newState();
  sampleInput(restarted);
  assert.deepEqual(restarted.input, { held: 0, pressed: 0, prev: 0 });
});

test('a fresh keydown registers as pressed', () => {
  const t = attachFresh();
  const s = newState();
  sampleInput(s);                       // seed
  t.keydown('Enter');
  sampleInput(s);
  assert.equal(s.input.pressed & BTN.START, BTN.START);
});

test('a key held from BEFORE attach never fakes a press', () => {
  // The bug this exists for: Enter activates the launcher's LAUNCH button, the
  // real keydown goes to that button, and by the time attachInput() runs the
  // key is still down -- so the only events we ever see are auto-repeats. Taking
  // those at face value made Enter a START press on frame 1, which dismissed
  // the title screen before it was ever drawn. Whether it happened at all was a
  // race against how long boot() took, so it presented as a caching problem.
  const t = attachFresh();
  const s = newState();

  for (let f = 0; f < 30; f++) {
    t.keydown('Enter', true);           // repeats only -- no fresh keydown
    sampleInput(s);
    assert.equal(s.input.pressed & BTN.START, 0, `frame ${f} must not press START`);
    assert.equal(s.input.held & BTN.START, 0, `frame ${f} must not hold START`);
  }

  // Releasing and pressing again is a real press.
  t.keyup('Enter');
  sampleInput(s);
  t.keydown('Enter');
  sampleInput(s);
  assert.equal(s.input.pressed & BTN.START, BTN.START);
});

test('repeats of a key we DID see keep it held', () => {
  const t = attachFresh();
  const s = newState();
  sampleInput(s);
  t.keydown('ArrowRight');
  sampleInput(s);
  assert.equal(s.input.held & BTN.RIGHT, BTN.RIGHT);
  t.keydown('ArrowRight', true);        // the OS repeat while walking
  sampleInput(s);
  assert.equal(s.input.held & BTN.RIGHT, BTN.RIGHT, 'still walking');
  assert.equal(s.input.pressed & BTN.RIGHT, 0, 'but not a new press');
});

test('blur clears everything, including the seen mask', () => {
  const t = attachFresh();
  const s = newState();
  sampleInput(s);
  t.keydown('ArrowLeft');
  sampleInput(s);
  assert.equal(s.input.held & BTN.LEFT, BTN.LEFT);
  t.fire('blur', {});
  sampleInput(s);
  assert.equal(s.input.held, 0);
  // After blur the key is "unseen" again, so a repeat arriving from a key the
  // user never released cannot resurrect it.
  t.keydown('ArrowLeft', true);
  sampleInput(s);
  assert.equal(s.input.held & BTN.LEFT, 0);
});
