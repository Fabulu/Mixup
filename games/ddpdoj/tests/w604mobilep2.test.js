// W604: the one mobile panel can belong to an authentically joined P2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BIT } from '../src/machine.js';
import {
  attachPad, clearCoin, clearTouch, CONTROLS, currentCoinWord, currentMask,
  currentP2Mask, currentPortWord, currentTouchOwner, KEYMAP, selectTouchOwner,
  setTouchButton, setTouchDirections, tickCoinPulse,
} from '../src/web/input.js';

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = { ...dataset };
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 90, height: 90 }; }
  fire(type, init = {}) {
    const e = { pointerId: 7, clientX: 45, clientY: 45, preventDefault() {}, ...init };
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}

function resetInput() {
  clearCoin();
  clearTouch();
  assert.equal(selectTouchOwner('P1'), true);
}

function spendCoinPulse() {
  for (let i = 0; i < 12; i++) tickCoinPulse();
}

test('W604 touch ownership defaults safely and packs exact P1/P2 board words', () => {
  resetInput();
  assert.equal(currentTouchOwner(), 'P1');
  setTouchButton('START', true);
  assert.equal(currentPortWord(), 0xfffe, 'default P1 START stays board-exact');
  clearTouch();

  setTouchDirections(1 << CONTROLS.LEFT);
  setTouchButton('SHOT', true);
  const held = (1 << BIT.left) | (1 << BIT.b1);
  assert.equal(currentMask(), held);
  assert.equal(selectTouchOwner('P2'), false, 'an unjoined P2 is rejected');
  assert.equal(selectTouchOwner('P2', null), false, 'invalid join options are rejected');
  assert.equal(selectTouchOwner('P2', { p2Joined: 1 }), false,
    'the join assertion must be the explicit boolean true');
  assert.equal(selectTouchOwner('P3', { p2Joined: true }), false,
    'an invalid owner is rejected');
  assert.equal(currentTouchOwner(), 'P1');
  assert.equal(currentMask(), held, 'invalid selection does not disturb held P1 input');
  assert.equal(currentP2Mask(), 0);

  assert.equal(selectTouchOwner('P2', { p2Joined: true }), true);
  assert.equal(currentTouchOwner(), 'P2');
  assert.equal(currentMask(), 0, 'switching clears held P1 input');
  assert.equal(currentP2Mask(), 0, 'held input cannot transfer to P2');

  setTouchDirections(1 << CONTROLS.RIGHT);
  setTouchButton('SHOT', true);
  assert.equal(currentMask(), 0);
  assert.equal(currentP2Mask(), (1 << BIT.right) | (1 << BIT.b1));
  assert.equal(currentPortWord(), 0xcfff, 'P2 RIGHT plus SHOT packs as $CFFF');

  clearTouch();
  setTouchButton('START', true);
  assert.equal(currentPortWord(), 0xfeff, 'P2 START packs as $FEFF');
  assert.equal(selectTouchOwner('P1'), true);
  assert.equal(currentMask(), 0);
  assert.equal(currentP2Mask(), 0, 'switching back clears held P2 START');
  setTouchButton('START', true);
  assert.equal(currentPortWord(), 0xfffe, 'switching back restores P1 routing');

  assert.equal(KEYMAP.KeyY, 'SHOT');
  assert.equal(KEYMAP.KeyZ, 'SHOT');
  resetInput();
});

test('W604 the attached shared pad routes P2 play and changes coin ports safely', () => {
  resetInput();
  const dpad = new FakeElement();
  const coin = new FakeElement({ coin: 'COIN1' });
  const start = new FakeElement({ btn: 'START' });
  const shot = new FakeElement({ btn: 'SHOT' });
  const backstop = attachPad(dpad, [coin, start, shot]);

  assert.equal(selectTouchOwner('P2', { p2Joined: true }), true);
  backstop();
  coin.dataset.coin = 'COIN2';

  dpad.fire('pointerdown', { clientX: 85, clientY: 45 });
  shot.fire('pointerdown');
  assert.equal(currentPortWord(), 0xcfff, 'shared directions and SHOT reach P2');
  dpad.fire('pointerup');
  shot.fire('pointerup');
  start.fire('pointerdown');
  assert.equal(currentPortWord(), 0xfeff, 'shared START reaches P2');
  start.fire('pointerup');

  coin.fire('pointerdown');
  assert.equal(currentCoinWord(), 0xfffd, 'P2 coin clears $C08004 bit 1');
  assert.equal(currentPortWord(), 0xffff, 'P2 coin never enters the player port');
  coin.fire('pointerup');
  assert.equal(currentCoinWord(), 0xfffd, 'release preserves the fixed coin pulse');
  spendCoinPulse();
  assert.equal(currentCoinWord(), 0xffff);

  assert.equal(selectTouchOwner('P1'), true);
  backstop();
  coin.dataset.coin = 'COIN1';
  dpad.fire('pointerdown', { clientX: 85, clientY: 45 });
  shot.fire('pointerdown');
  assert.equal(currentMask(), (1 << BIT.right) | (1 << BIT.b1));
  assert.equal(currentP2Mask(), 0);
  assert.equal(currentPortWord(), 0xffcf, 'the same shared controls route back to P1');
  dpad.fire('pointerup');
  shot.fire('pointerup');

  coin.fire('pointerdown');
  assert.equal(currentCoinWord(), 0xfffe, 'the shared coin routes back to COIN1');
  coin.dataset.coin = 'COIN2';
  coin.fire('pointerup');
  spendCoinPulse();
  coin.dataset.coin = 'COIN1';
  coin.fire('pointerdown');
  assert.equal(currentCoinWord(), 0xfffe,
    'release uses the press-time route even if data-coin changed while held');
  coin.fire('pointerup');
  backstop();
  resetInput();
});

test('W604 static page enables one P2 pad selector only after an authentic join', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ownerMarkup = html.match(/<button id="pad-owner"[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.match(ownerMarkup, /hidden disabled/,
    'a normal one-player launch starts with no usable P2 selector');
  assert.doesNotMatch(ownerMarkup, /data-(btn|coin)=/,
    'the selector itself is not a board input');
  assert.equal([...html.matchAll(/id="pad"/g)].length, 1, 'the mobile panel is shared');
  assert.equal([...html.matchAll(/id="dpad"/g)].length, 1, 'the d-pad is not duplicated');
  assert.match(html, /import \{ RAM \} from '\.\/src\/machine\.js';/);
  assert.match(html, /let p2Joined = false;/);
  assert.match(html, /latchP2Joined\(authenticSelection\?\.p2 != null\);/,
    'the normalized explicit P2 pair is converted to an exact join boolean');
  assert.match(html,
    /const routed = selectedFormation\s*\? selectTouchOwner\(owner, \{ p2Joined: false \}\)\s*: selectTouchOwner\(owner, \{ p2Joined \}\);/,
    'formation stays P1-only while ordinary cabinets route the latched join fact');
  assert.match(html,
    /if \(selectedFormation \|\| p2Joined \|\| joined !== true\) return;\s*p2Joined = true;\s*padOwnerBtn\.hidden = false;\s*padOwnerBtn\.disabled = false;/,
    'only the exact true runtime fact reveals and enables the shared P2 selector');
  assert.match(html,
    /latchP2Joined\(app\.game\.ram\.u16\(RAM\.playerCountM1\) === 1\);/,
    'the live cold cabinet latches its native two-player state');
});
