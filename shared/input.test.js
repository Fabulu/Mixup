// Tests for the shared input layer.  These are the ONLY tests that exercise the
// normalized controller and the 8-way gate; the per-game input tests drive their
// own touch setters and ROM shuffles.
//
// Red-validated: each assertion here was confirmed to FAIL when the code under
// test was deliberately broken (gate8way's octant table scrambled; the launch-
// Enter guard removed), then restored to green.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gate8way, createInput, NORMAL, STD } from './input.js';

// ------------------------------------------------------------- gate8way

test('gate8way: below the deadzone is neutral', () => {
  const g = gate8way(0.1, 0.1, 0.28);
  assert.deepEqual(g, { up: false, down: false, left: false, right: false });
});

test('gate8way: pure cardinals set exactly one direction', () => {
  assert.deepEqual(gate8way(1, 0, 0.28), { up: false, down: false, left: false, right: true });
  assert.deepEqual(gate8way(-1, 0, 0.28), { up: false, down: false, left: true, right: false });
  assert.deepEqual(gate8way(0, 1, 0.28), { up: false, down: true, left: false, right: false });
  assert.deepEqual(gate8way(0, -1, 0.28), { up: true, down: false, left: false, right: false });
});

test('gate8way: pure diagonals set TWO directions', () => {
  const dr = gate8way(0.7, 0.7, 0.28);
  assert.equal(dr.down, true);
  assert.equal(dr.right, true);
  assert.equal(dr.up, false);
  assert.equal(dr.left, false);

  const ul = gate8way(-0.7, -0.7, 0.28);
  assert.equal(ul.up, true);
  assert.equal(ul.left, true);
  assert.equal(ul.down, false);
  assert.equal(ul.right, false);
});

test('gate8way: a near-cardinal with a small off-axis component does NOT set the off axis', () => {
  // (0.95, -0.05) is almost pure RIGHT.  Per-axis `y < 0` would wrongly set UP.
  const g = gate8way(0.95, -0.05, 0.28);
  assert.equal(g.right, true);
  assert.equal(g.up, false, 'a small negative y on a near-pure-right vector must NOT set up');
});

test('gate8way: default deadzone is 0.28', () => {
  // 0.25 magnitude with no explicit deadzone: below 0.28, so neutral.
  assert.deepEqual(gate8way(0.25, 0), { up: false, down: false, left: false, right: false });
  // 0.30 magnitude: above 0.28, so RIGHT.
  assert.equal(gate8way(0.30, 0).right, true);
});

// ------------------------------------------------------------- createInput

// A minimal event target for headless keyboard simulation.
class FakeTarget {
  constructor() { this._l = {}; }
  addEventListener(t, fn) { (this._l[t] ??= []).push(fn); }
  removeEventListener(t, fn) {
    this._l[t] = (this._l[t] || []).filter((f) => f !== fn);
  }
  dispatch(type, opts = {}) {
    for (const fn of (this._l[type] || [])) fn({ preventDefault() {}, ...opts });
  }
}

const KEYMAP = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyZ: 'A1', KeyY: 'A1',   // Swiss QWERTZ: both -> A1
  KeyX: 'A2', Enter: 'START',
};

test('createInput: keyboard down/up sets and clears the normalized bit', () => {
  const t = new FakeTarget();
  const c = createInput({ keyboard: KEYMAP });
  c.attach(t);
  t.dispatch('keydown', { code: 'KeyZ', repeat: false });
  assert.equal(c.state().a1, true);
  assert.equal(c.state().source, 'keyboard');
  t.dispatch('keyup', { code: 'KeyZ', repeat: false });
  assert.equal(c.state().a1, false);
  c.detach();
});

test('createInput: Swiss QWERTZ -- releasing KeyY while KeyZ is held keeps A1', () => {
  const t = new FakeTarget();
  const c = createInput({ keyboard: KEYMAP });
  c.attach(t);
  t.dispatch('keydown', { code: 'KeyZ', repeat: false });
  t.dispatch('keydown', { code: 'KeyY', repeat: false });
  assert.equal(c.state().a1, true);
  // Releasing one of the two A1 keys must NOT clear A1 while the other is held.
  t.dispatch('keyup', { code: 'KeyY', repeat: false });
  assert.equal(c.state().a1, true, 'KeyZ still held -> A1 stays true');
  t.dispatch('keyup', { code: 'KeyZ', repeat: false });
  assert.equal(c.state().a1, false);
  c.detach();
});

test('createInput: launch-Enter guard -- a repeat for an unseen key is suppressed', () => {
  // The Enter that clicked LAUNCH is already down when the page loads, so its
  // first keydown arrives as a REPEAT.  Without the guard it registers as START
  // on frame 1 and the player drops into the level.  With the guard it is
  // ignored until a fresh (non-repeat) press.
  const t = new FakeTarget();
  const c = createInput({ keyboard: KEYMAP });
  c.attach(t);
  t.dispatch('keydown', { code: 'Enter', repeat: true });
  assert.equal(c.state().start, false, 'a repeat for a key never freshly pressed must NOT register');
  t.dispatch('keydown', { code: 'Enter', repeat: false });
  assert.equal(c.state().start, true);
  t.dispatch('keyup', { code: 'Enter', repeat: false });
  assert.equal(c.state().start, false);
  c.detach();
});

test('createInput: blur clears the keyboard state (backstop)', () => {
  const t = new FakeTarget();
  const c = createInput({ keyboard: KEYMAP });
  c.attach(t);
  t.dispatch('keydown', { code: 'KeyZ', repeat: false });
  t.dispatch('keydown', { code: 'ArrowUp', repeat: false });
  assert.equal(c.state().a1, true);
  assert.equal(c.state().up, true);
  t.dispatch('blur');
  assert.equal(c.state().a1, false);
  assert.equal(c.state().up, false);
  c.detach();
});

test('createInput: an unbound key does nothing', () => {
  const t = new FakeTarget();
  const c = createInput({ keyboard: KEYMAP });
  c.attach(t);
  t.dispatch('keydown', { code: 'KeyQ', repeat: false });
  assert.deepEqual(c.state().a1, false);
  c.detach();
});

test('createInput: state() returns a fresh object each call', () => {
  const c = createInput({ keyboard: KEYMAP });
  const s1 = c.state();
  const s2 = c.state();
  assert.notEqual(s1, s2);
});

test('NORMAL is frozen and carries the full shape', () => {
  assert.ok(Object.isFrozen(NORMAL));
  assert.deepEqual(Object.keys(NORMAL).sort(),
    ['a1', 'a2', 'a3', 'down', 'left', 'right', 'select', 'source', 'start', 'up']);
});

test('STD carries the Standard Gamepad indices', () => {
  assert.equal(STD.dup, 12);
  assert.equal(STD.ddown, 13);
  assert.equal(STD.dleft, 14);
  assert.equal(STD.dright, 15);
  assert.equal(STD.a, 0);
  assert.equal(STD.b, 1);
  assert.equal(STD.x, 2);
  assert.equal(STD.start, 9);
  assert.equal(STD.back, 8);
});
