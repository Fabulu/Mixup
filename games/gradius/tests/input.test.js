// Input: the keyboard path, the on-screen (touch) path, and the promise that
// they are the SAME path.
//
// The joypad bits are $0007's, MEASURED by A/B RAM diff (PROBE.md 4):
//   RIGHT $01  LEFT $02  DOWN $04  UP $08  START $10  SELECT $20  B $40  A $80
//
// The load-bearing test here is `every on-screen button drives the same bits as
// its key`. It compares the two paths BUTTON BY BUTTON through readJoypad(),
// i.e. through the cartridge's own edge computation, rather than comparing two
// tables of constants -- a table-vs-table check passes when both tables are
// wrong in the same way, and it cannot see a touch path that never reaches
// state.input at all.
//
// It was SEEN TO FAIL: transposing A and B inside TOUCH_BUTTONS in
// src/input.js turns it red on the first button of the pair (expected 128, got
// 64). Both directions of the vacuous-pass trap are closed too -- the test
// asserts the keyboard mask is non-zero, so "both sides produce 0" cannot pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BTN } from '../src/state.js';
import {
  attachInput, detachInput, resetInput, currentButtons, readJoypad,
  inputQueueStats, TOUCH_BUTTONS, DPAD_MASK, setTouchButton, setTouchDirections,
  clearTouchButtons, dpadMask,
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
 * A fresh target with the module's shared masks cleared. `held`/`seen` are at
 * module scope, as the real thing needs them to be, so every case resets both
 * halves: blur for the keyboard, clearTouchButtons() for the pad.
 */
function attachFresh() {
  const t = fakeTarget();
  attachInput(t);
  t.fire('blur', {});
  clearTouchButtons();
  return t;
}

/**
 * One frame of the MASK chain: currentButtons() -> readJoypad() -> $0007/$0005.
 *
 * NOT the frame loop's chain any more. Since wave 14 the loop reads
 * `nextInputWord()` -- one word per LOGIC frame, off a queue -- and this file
 * deliberately keeps using the live mask, because what it is testing is that a
 * touch control and a key set the SAME BIT. Interposing the queue would put a
 * transition-coalescing rule between the button and the assertion for no gain.
 * The queue's own behaviour, and the fact that src/main.js goes through it, are
 * tests/loop.test.js.
 */
function frame(state) {
  readJoypad(state, currentButtons());
  return state.input;
}

// The key each on-screen button stands in for. These are the codes
// src/input.js's KEYMAP binds; the alternates (KeyD/KeyA/KeyW/KeyS, Space,
// KeyY, KeyC, ShiftLeft) go through the same table.
const KEY_FOR = {
  RIGHT: 'ArrowRight', LEFT: 'ArrowLeft', DOWN: 'ArrowDown', UP: 'ArrowUp',
  A: 'KeyX', B: 'KeyZ', START: 'Enter', SELECT: 'ShiftRight',
};

test('input attachment is idempotent and detach clears the transition queue', () => {
  const target = fakeTarget();
  resetInput();
  attachInput(target);
  attachInput(target);
  assert.equal(target.handlerCount('keydown'), 1);
  assert.equal(target.handlerCount('keyup'), 1);
  assert.equal(target.handlerCount('blur'), 1);

  target.keydown('ArrowRight');
  assert.equal(inputQueueStats().depth, 1);
  assert.equal(currentButtons(), BTN.RIGHT);
  detachInput();
  assert.equal(target.handlerCount('keydown'), 0);
  assert.equal(target.handlerCount('keyup'), 0);
  assert.equal(target.handlerCount('blur'), 0);
  assert.deepEqual(inputQueueStats(), {
    depth: 0, live: 0, repeats: 0, coalesced: 0, carried: 0, lostEdges: 0, cap: 2,
  });
  assert.equal(currentButtons(), 0);
});

test('every on-screen button drives the same $0007/$0005 bits as its key', () => {
  for (const [name, code] of Object.entries(KEY_FOR)) {
    // --- keyboard -----------------------------------------------------------
    const t = attachFresh();
    const kb = newState();
    frame(kb);                                  // seed prev
    t.keydown(code);
    const kbDown = { ...frame(kb) };
    frame(kb);                                  // still held, second frame
    const kbHeld = { ...kb.input };
    t.keyup(code);
    const kbUp = { ...frame(kb) };

    // --- on-screen ----------------------------------------------------------
    clearTouchButtons();
    const tp = newState();
    frame(tp);
    setTouchButton(TOUCH_BUTTONS[name], true);
    const tpDown = { ...frame(tp) };
    const tpHeld = { ...frame(tp) };
    setTouchButton(TOUCH_BUTTONS[name], false);
    const tpUp = { ...frame(tp) };
    clearTouchButtons();

    // Guard against the vacuous pass: two zeroes are equal too.
    assert.notEqual(kbDown.held, 0, `${name}: the KEYBOARD case must do something`);
    assert.equal(kbDown.held, BTN[name], `${name}: keyboard sets its own bit`);

    assert.deepEqual(tpDown, kbDown, `${name}: press frame ($0007 and $0005)`);
    assert.deepEqual(tpHeld, kbHeld, `${name}: held frame -- edge gone, hold stays`);
    assert.deepEqual(tpUp, kbUp, `${name}: release frame`);
  }
});

test('a held on-screen button reports HELD every frame, not one edge', () => {
  // Firing is a HELD button on this machine ($35 = 20, the autofire reload),
  // so a pad that only produced $0005 would fire once and stop.
  attachFresh();
  const s = newState();
  frame(s);
  setTouchButton(TOUCH_BUTTONS.A, true);
  assert.equal(frame(s).pressed & BTN.A, BTN.A, 'frame 1 is an edge');
  for (let f = 2; f <= 40; f++) {
    const inp = frame(s);
    assert.equal(inp.held & BTN.A, BTN.A, `frame ${f}: still held`);
    assert.equal(inp.pressed & BTN.A, 0, `frame ${f}: not a second edge`);
  }
  clearTouchButtons();
});

test('the d-pad reports diagonals -- two bits, same as two keys', () => {
  // updatePlayer() tests X and Y independently ($A021/$A033 then $A04B/$A065),
  // so a diagonal is literally two bits in $0007 and nothing else.
  const corners = [
    ['UP', 'LEFT', 0.1, 0.1], ['UP', 'RIGHT', 0.9, 0.1],
    ['DOWN', 'LEFT', 0.1, 0.9], ['DOWN', 'RIGHT', 0.9, 0.9],
  ];
  for (const [vName, hName, fx, fy] of corners) {
    const t = attachFresh();
    const kb = newState();
    frame(kb);
    t.keydown(KEY_FOR[vName]);
    t.keydown(KEY_FOR[hName]);
    const kbHeld = frame(kb).held;
    t.keyup(KEY_FOR[vName]); t.keyup(KEY_FOR[hName]);

    clearTouchButtons();
    const tp = newState();
    frame(tp);
    // 144x144 stands in for the pad's bounding box; the hit test is scale-free.
    setTouchDirections(dpadMask(fx * 144, fy * 144, 144, 144));
    const tpHeld = frame(tp).held;
    clearTouchButtons();

    assert.equal(kbHeld, BTN[vName] | BTN[hName], `${vName}+${hName}: two keys, two bits`);
    assert.equal(tpHeld, kbHeld, `${vName}+${hName}: the d-pad corner agrees`);
  }
});

test('dpadMask is a 3x3 grid: middle third neutral, edges single, corners double', () => {
  const m = (fx, fy) => dpadMask(fx * 90, fy * 90, 90, 90);
  assert.equal(m(0.5, 0.5), 0, 'dead centre is neutral');
  assert.equal(m(0.5, 0.1), BTN.UP, 'top middle is UP alone');
  assert.equal(m(0.5, 0.9), BTN.DOWN, 'bottom middle is DOWN alone');
  assert.equal(m(0.1, 0.5), BTN.LEFT, 'left middle is LEFT alone');
  assert.equal(m(0.9, 0.5), BTN.RIGHT, 'right middle is RIGHT alone');
  assert.equal(m(0.1, 0.1), BTN.UP | BTN.LEFT, 'the corner third is a diagonal');
  // Exactly on the boundaries: [0,1/3) is the outer band, [1/3,2/3) neutral.
  assert.equal(m(1 / 3, 0.5), 0, 'the 1/3 boundary belongs to the neutral band');
  assert.equal(m(2 / 3, 0.5), BTN.RIGHT, 'the 2/3 boundary belongs to RIGHT');
  // A finger dragged clean off the pad keeps its direction rather than going
  // neutral -- the capture still delivers the release.
  assert.equal(m(-3, 0.5), BTN.LEFT, 'off the left edge is still LEFT');
  assert.equal(m(4, 4), BTN.RIGHT | BTN.DOWN, 'off the bottom-right is still down-right');
  // Degenerate box (element not laid out yet) must not divide by zero.
  assert.equal(dpadMask(0, 0, 0, 0), 0, 'a zero-sized pad reports nothing');
});

test('the d-pad replaces only the direction nibble', () => {
  attachFresh();
  const s = newState();
  setTouchButton(TOUCH_BUTTONS.A, true);
  setTouchDirections(BTN.LEFT | BTN.UP);
  assert.equal(frame(s).held, BTN.A | BTN.LEFT | BTN.UP, 'fire survives a direction');
  setTouchDirections(0);
  assert.equal(frame(s).held, BTN.A, 'letting go of the pad leaves fire held');
  assert.equal(DPAD_MASK, 0x0F, 'the direction nibble is $0F -- AND #$0F at $A082');
  clearTouchButtons();
});

test('keyboard and touch masks OR together and recover independently', () => {
  const t = attachFresh();
  const s = newState();
  t.keydown('ArrowRight');
  setTouchButton(TOUCH_BUTTONS.A, true);
  assert.equal(frame(s).held, BTN.RIGHT | BTN.A, 'both paths are live at once');

  // Blur is the keyboard's recovery. It must NOT wipe a finger that is still
  // on the screen, and the pad's backstop must not wipe the keyboard.
  t.fire('blur', {});
  assert.equal(frame(s).held, BTN.A, 'blur clears the keys, not the pad');
  t.keydown('ArrowRight');
  clearTouchButtons();
  assert.equal(frame(s).held, BTN.RIGHT, 'clearTouchButtons clears the pad, not the keys');
  t.fire('blur', {});
});

test('clearTouchButtons clears every bit the pad can set', () => {
  attachFresh();
  const s = newState();
  for (const bit of Object.values(TOUCH_BUTTONS)) setTouchButton(bit, true);
  assert.equal(frame(s).held, 0xFF, 'all eight pad bits, i.e. every bit of $0007');
  clearTouchButtons();
  assert.equal(frame(s).held, 0, 'the backstop clears the WHOLE mask');
});

// ---------------------------------------------------------------------------
// The page and the manifest, held against the bits.
//
// index.html is not loaded by anything in the gate (there is no DOM here), so
// what CAN be checked is that every control it names is a control this module
// knows about -- the failure mode being a data-btn typo that silently resolves
// to 0 and gives a button that presses nothing.
// ---------------------------------------------------------------------------
const GAME = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, GAME), 'utf8');

test('TOUCH_BUTTONS is BTN, spelled once', () => {
  assert.deepEqual({ ...TOUCH_BUTTONS }, { ...BTN },
    'the pad must be able to press every joypad bit, and only real ones');
});

test('every data-btn / data-cell in index.html is a real button', () => {
  const html = readText('index.html');
  const names = [...html.matchAll(/data-(?:btn|cell)="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
  assert.ok(names.length >= 8 + 8,
    `index.html should name the four buttons and the eight d-pad cells, `
    + `found ${names.length}`);
  for (const n of names) {
    assert.ok(n in TOUCH_BUTTONS, `data-* "${n}" is a button TOUCH_BUTTONS knows`);
  }
  for (const id of ['A', 'B', 'START', 'SELECT']) {
    assert.ok(names.includes(id), `the pad has a ${id} button`);
  }
});

test('game.json input.buttons is the $0007 layout, not a second opinion', () => {
  const m = JSON.parse(readText('game.json'));
  const fromManifest = Object.fromEntries(m.input.buttons.map((b) => [b.id, b.mask]));
  assert.deepEqual(fromManifest, { ...BTN },
    'game.json input.buttons must equal BTN in src/state.js -- the launcher '
    + 'will read touch masks from the manifest and the game reads $0007 from '
    + 'BTN, so a drift between them is a pad that presses the wrong button');
});

test('game.json defaultKeymap names buttons that exist and keys src/input.js binds', () => {
  const m = JSON.parse(readText('game.json'));
  const src = readText('src/input.js');
  for (const [code, name] of Object.entries(m.input.defaultKeymap)) {
    assert.ok(name in BTN, `${code} -> ${name} is a real button`);
    assert.ok(src.includes(`${code}:`), `src/input.js binds ${code}`);
  }
});

test('game.json touchLayout describes the pad index.html actually draws', () => {
  const m = JSON.parse(readText('game.json'));
  const layout = m.input.touchLayout;
  for (const cell of layout.dpad) {
    for (const n of cell) assert.ok(n in BTN, `dpad cell names ${n}`);
  }
  assert.equal(layout.dpad.length, 9, 'a 3x3 grid');
  assert.deepEqual(layout.dpad[4], [], 'the middle cell is neutral');
  for (const c of layout.clusters) {
    for (const b of c) assert.ok(b in BTN, `cluster button ${b}`);
  }
  const html = readText('index.html');
  for (const cell of layout.dpad) {
    if (cell.length) assert.ok(html.includes(`data-cell="${cell.join(' ')}"`),
      `index.html draws the ${cell.join('+')} cell`);
  }
});
