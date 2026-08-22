// W499: indexed two-controller play and practical browser gamepad profiles.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInput } from '../../../shared/input.js';
import { BIT } from '../src/machine.js';
import { mirrorsFromPort } from '../src/input.js';
import {
  attachCoinKeys, attachInput, clearCoin, clearTouch, currentCoinWord,
  currentMask, currentP2Mask, currentPortWord, pollInput, setTouchButton,
  setTouchDirections, tickCoinPulse,
} from '../src/web/input.js';

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  fire(type, init = {}) {
    const event = { preventDefault() {}, ...init };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

const button = () => ({ pressed: false, value: 0 });
const makePad = ({ index, id, mapping = '', buttonCount = 17, axisCount = 2 }) => ({
  index,
  id,
  mapping,
  connected: true,
  buttons: Array.from({ length: buttonCount }, button),
  axes: Array(axisCount).fill(0),
});
const setButtons = (pad, indexes, down) => {
  for (const index of indexes) {
    pad.buttons[index].pressed = down;
    pad.buttons[index].value = down ? 1 : 0;
  }
};
const spendCoinPulse = () => {
  for (let i = 0; i < 12; i++) tickCoinPulse();
};

function installNavigator(t, initialPads) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let pads = initialPads;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  });
  t.after(() => {
    clearCoin();
    clearTouch();
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
  return (next) => { pads = next; };
}

const PANEL_MASK = (1 << BIT.up) | (1 << BIT.down) | (1 << BIT.left)
  | (1 << BIT.right) | (1 << BIT.b1) | (1 << BIT.b2) | (1 << BIT.b3)
  | (1 << BIT.start);

test('W499 Gamepad.index 0 drives P1 and index 1 drives the board P2 half', (t) => {
  const p1 = makePad({ index: 0, id: 'W499 Standard pad', mapping: 'standard' });
  const p2 = makePad({
    index: 1,
    id: 'PLAYSTATION(R)3 Controller Vendor: 054c Product: 0268',
  });
  installNavigator(t, [p1, p2]);
  attachInput(new FakeTarget());
  clearTouch();

  const p1Controls = [12, 13, 14, 15, 0, 1, 2, 9];
  const p2Controls = [4, 6, 7, 5, 14, 13, 15, 3];

  setButtons(p1, p1Controls, true);
  pollInput();
  assert.equal(currentMask() & PANEL_MASK, PANEL_MASK, 'index 0 exposes every P1 control');
  assert.equal(currentP2Mask(), 0, 'index 0 does not leak into P2');
  assert.equal(currentPortWord(), 0xff00, 'only the board P1 byte is active');
  assert.deepEqual(mirrorsFromPort(currentPortWord()), { p1: 0x807f, p2: 0x7f80 });

  setButtons(p1, p1Controls, false);
  setButtons(p2, p2Controls, true);
  pollInput();
  assert.equal(currentMask(), 0, 'index 1 does not leak into P1');
  assert.equal(currentP2Mask() & PANEL_MASK, PANEL_MASK,
    'legacy PlayStation profile exposes every P2 control');
  assert.equal(currentPortWord(), 0x00ff, 'only the board P2 byte is active');
  assert.deepEqual(mirrorsFromPort(currentPortWord()), { p1: 0x7f80, p2: 0xffff });

  setButtons(p2, p2Controls, false);
  pollInput();
  setTouchDirections(1 << BIT.left);
  setTouchButton('SHOT', true);
  assert.equal(currentMask(), (1 << BIT.left) | (1 << BIT.b1));
  assert.equal(currentP2Mask(), 0, 'mobile remains P1-only');
  assert.equal(currentPortWord() >>> 8, 0xff, 'mobile leaves the P2 port byte idle');
});

test('W499 COIN1 and COIN2 use separate edges and block held pads across lifecycle loss', (t) => {
  const p1 = makePad({ index: 0, id: 'W499 Standard pad', mapping: 'standard' });
  const p2 = makePad({
    index: 1,
    id: 'PLAYSTATION(R)3 Controller Vendor: 054c Product: 0268',
  });
  const setPads = installNavigator(t, [p1, p2]);
  const windowTarget = new FakeTarget();
  const documentTarget = new FakeTarget();
  attachInput(windowTarget);
  attachCoinKeys(windowTarget, documentTarget);
  clearCoin();
  pollInput();

  setButtons(p1, [8], true);
  pollInput();
  assert.equal(currentCoinWord(), 0xfffe, 'index 0 select clears COIN1 bit 0');
  spendCoinPulse();
  pollInput();
  assert.equal(currentCoinWord(), 0xffff, 'held P1 select does not rearm');
  setButtons(p1, [8], false);
  pollInput();

  setButtons(p2, [0], true);
  pollInput();
  assert.equal(currentCoinWord(), 0xfffd, 'index 1 select clears COIN2 bit 1');
  clearCoin();
  pollInput();
  assert.equal(currentCoinWord(), 0xffff, 'replay-style clear blocks held P2 select');
  setButtons(p2, [0], false);
  pollInput();
  setButtons(p2, [0], true);
  pollInput();
  assert.equal(currentCoinWord(), 0xfffd, 'P2 release followed by press rearms COIN2');

  clearCoin();
  setButtons(p1, [8], false);
  setButtons(p2, [0], false);
  pollInput();
  setButtons(p1, [8], true);
  setButtons(p2, [0], true);
  pollInput();
  assert.equal(currentCoinWord(), 0xfffc, 'simultaneous genuine edges keep both coin paths');
  windowTarget.fire('blur');
  assert.equal(currentCoinWord(), 0xffff, 'blur cancels both pulses');
  pollInput();
  assert.equal(currentCoinWord(), 0xffff, 'blur blocks both held selects');
  setButtons(p1, [8], false);
  setButtons(p2, [0], false);
  pollInput();

  setButtons(p2, [0], true);
  pollInput();
  assert.equal(currentCoinWord(), 0xfffd);
  setPads([p1, null]);
  windowTarget.fire('gamepaddisconnected', { gamepad: p2 });
  assert.equal(currentCoinWord(), 0xffff, 'disconnect clears COIN2 immediately');
  setPads([p1, p2]);
  pollInput();
  assert.equal(currentCoinWord(), 0xffff, 'held P2 select on reconnect remains blocked');
  setButtons(p2, [0], false);
  pollInput();
  setButtons(p2, [0], true);
  pollInput();
  assert.equal(currentCoinWord(), 0xfffd, 'release after reconnect enables the next P2 edge');
});

test('W499 Nintendo and generic DirectInput profiles map practical raw layouts', (t) => {
  const nintendo = makePad({ index: 0, id: 'Nintendo Switch Pro Controller' });
  const setPads = installNavigator(t, [nintendo]);
  const map = { a: 'A1', b: 'A2', x: 'A3', back: 'SELECT', start: 'START' };
  const switchInput = createInput({ gamepad: map, gamepadIndex: 0 });
  setButtons(nintendo, [0, 1, 2, 8, 9, 14], true);
  switchInput.pollGamepad();
  assert.equal(switchInput.profile, 'nintendo-switch-directinput');
  assert.deepEqual(switchInput.state(), {
    up: false, down: false, left: true, right: false,
    a1: true, a2: true, a3: true, start: true, select: true,
    source: 'gamepad',
  });

  const generic = makePad({
    index: 0, id: 'Generic USB DirectInput Pad', buttonCount: 10, axisCount: 10,
  });
  generic.axes[9] = -3 / 7; // DirectInput POV-hat RIGHT detent.
  setButtons(generic, [0, 1, 2, 8, 9], true);
  setPads([generic]);
  const directInput = createInput({ gamepad: map, gamepadIndex: 0 });
  directInput.pollGamepad();
  assert.equal(directInput.profile, 'generic-directinput');
  assert.deepEqual(directInput.state(), {
    up: false, down: false, left: false, right: true,
    a1: true, a2: true, a3: true, start: true, select: true,
    source: 'gamepad',
  });
});
