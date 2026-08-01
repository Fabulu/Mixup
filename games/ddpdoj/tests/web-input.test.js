// THE PAGE'S CONTROLS, held against the three places that describe them.
//
// A control is spelled in THREE files: `index.html` (the layout, as data-*
// names), `src/web/input.js` (the bits) and `game.json` (the written
// description). Two of those can drift silently -- a typo in a `data-btn`
// gives a button that lights up and does nothing, which is exactly the failure
// Gradius's tests/input.test.js exists to prevent. These tests hold all three
// against each other, and against `src/machine.js` BIT, which is the measured
// authority for the $803970 layout.
//
// NOTHING HERE TOUCHES THE CARTRIDGE. `node --test games/ddpdoj/tests/` is the
// cheap stage that has to work on a tree with no ROMs extracted, and a test
// that skips when `rip/` is missing is a test that never runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BIT } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import {
  CONTROLS, KEYMAP, DPAD_MASK, dpadMask, currentMask, currentBits,
  currentPortWord, setTouchButton, setTouchDirections, clearTouch, clearKeyboard,
} from '../src/web/input.js';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameJson = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
// The MARKUP of the pad only. The stylesheet also contains `data-cell=""` (the
// rule that hides the neutral centre cell's background), and scanning the whole
// file counted ten cells in a 3x3 grid -- caught by this file's own assertion,
// which is the point of asserting the shape rather than trusting the scrape.
const padHtml = html.slice(html.indexOf('<div id="pad">'), html.indexOf('<div id="hud">'));

test('CONTROLS carries the measured $803970 bit positions', () => {
  assert.equal(CONTROLS.UP, BIT.up);
  assert.equal(CONTROLS.DOWN, BIT.down);
  assert.equal(CONTROLS.LEFT, BIT.left);
  assert.equal(CONTROLS.RIGHT, BIT.right);
  assert.equal(CONTROLS.SHOT, BIT.b1);
  assert.equal(CONTROLS.BOMB, BIT.b2);
  assert.equal(CONTROLS.AUTO, BIT.b3);
  assert.equal(CONTROLS.START, BIT.start);
});

test('game.json input.buttons equals CONTROLS, bit and mask', () => {
  const seen = new Set();
  for (const b of gameJson.input.buttons) {
    assert.equal(b.bit, CONTROLS[b.id], `${b.id} bit`);
    assert.equal(b.mask, 1 << CONTROLS[b.id], `${b.id} mask`);
    seen.add(b.id);
  }
  assert.deepEqual([...seen].sort(), Object.keys(CONTROLS).sort());
});

test('game.json defaultKeymap equals KEYMAP', () => {
  assert.deepEqual(gameJson.input.defaultKeymap, { ...KEYMAP });
});

// THE STANDING REQUIREMENT, in its own test so it cannot be quietly dropped by
// somebody tidying the keymap. The owner's keyboard is Swiss QWERTZ: the key
// printed Z is where QWERTY has Y and reports `KeyY`. Asked for twice.
test('both KeyZ and KeyY are SHOT (Swiss QWERTZ)', () => {
  assert.equal(KEYMAP.KeyZ, 'SHOT');
  assert.equal(KEYMAP.KeyY, 'SHOT');
  assert.equal(gameJson.input.defaultKeymap.KeyZ, 'SHOT');
  assert.equal(gameJson.input.defaultKeymap.KeyY, 'SHOT');
});

test('every key is bound by e.code, i.e. by physical position', () => {
  for (const code of Object.keys(KEYMAP)) {
    assert.match(code, /^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Space|Enter)$/,
      `${code} is not a KeyboardEvent.code`);
  }
});

test('index.html data-btn names are all real controls', () => {
  const names = [...padHtml.matchAll(/data-btn="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 4, 'the page has on-screen buttons');
  for (const n of names) assert.ok(n in CONTROLS, `data-btn="${n}"`);
  // ...and game.json's written description names the same set.
  const declared = gameJson.input.touchLayout.clusters.flat().sort();
  assert.deepEqual(names.slice().sort(), declared);
});

test('index.html d-pad cells match game.json and dpadMask()', () => {
  const cells = [...padHtml.matchAll(/data-cell="([^"]*)"/g)]
    .map((m) => m[1].split(/\s+/).filter(Boolean));
  assert.equal(cells.length, 9, 'a 3x3 grid');
  assert.deepEqual(cells, gameJson.input.touchLayout.dpad);
  // The hit test is the authority: the centre of cell (r,c) must produce
  // exactly the bits that cell claims.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const want = cells[r * 3 + c].reduce((m, n) => m | (1 << CONTROLS[n]), 0);
      const got = dpadMask((c + 0.5) * 30, (r + 0.5) * 30, 90, 90);
      assert.equal(got, want, `cell ${r},${c}`);
    }
  }
});

// A vertical shooter without diagonals is not playable, and four separate
// pointer-capturing buttons can never produce one -- the capture that stops a
// stuck direction is what stops a second button ever seeing the finger. So the
// corner thirds MUST carry two bits.
test('the corner thirds report two bits each', () => {
  assert.equal(dpadMask(5, 5, 90, 90), (1 << CONTROLS.UP) | (1 << CONTROLS.LEFT));
  assert.equal(dpadMask(85, 5, 90, 90), (1 << CONTROLS.UP) | (1 << CONTROLS.RIGHT));
  assert.equal(dpadMask(5, 85, 90, 90), (1 << CONTROLS.DOWN) | (1 << CONTROLS.LEFT));
  assert.equal(dpadMask(85, 85, 90, 90), (1 << CONTROLS.DOWN) | (1 << CONTROLS.RIGHT));
  assert.equal(dpadMask(45, 45, 90, 90), 0, 'the middle third is neutral');
});

test('a finger that has slid off the pad keeps the direction it slid towards', () => {
  // Out-of-range coordinates land in the outer bands by construction. The
  // release still arrives, because the pad holds a pointer capture.
  assert.equal(dpadMask(-40, 45, 90, 90), 1 << CONTROLS.LEFT);
  assert.equal(dpadMask(200, 45, 90, 90), 1 << CONTROLS.RIGHT);
  assert.equal(dpadMask(45, -40, 90, 90), 1 << CONTROLS.UP);
  assert.equal(dpadMask(45, 200, 90, 90), 1 << CONTROLS.DOWN);
});

test('a zero-sized pad reports nothing rather than dividing by zero', () => {
  assert.equal(dpadMask(0, 0, 0, 0), 0);
});

test('setTouchDirections replaces the whole nibble and leaves the face buttons', () => {
  clearTouch(); clearKeyboard();
  setTouchButton('SHOT', true);
  setTouchDirections((1 << CONTROLS.UP) | (1 << CONTROLS.LEFT));
  assert.equal(currentMask(),
    (1 << CONTROLS.SHOT) | (1 << CONTROLS.UP) | (1 << CONTROLS.LEFT));
  setTouchDirections(1 << CONTROLS.RIGHT);
  assert.equal(currentMask(), (1 << CONTROLS.SHOT) | (1 << CONTROLS.RIGHT));
  setTouchDirections(0);
  assert.equal(currentMask(), 1 << CONTROLS.SHOT);
  // The backstop clears everything, including a button whose release was lost.
  clearTouch();
  assert.equal(currentMask(), 0);
});

test('DPAD_MASK is exactly the four directions', () => {
  assert.equal(DPAD_MASK, (1 << BIT.up) | (1 << BIT.down) | (1 << BIT.left)
    | (1 << BIT.right));
});

// The bits only matter if they come out as the port word the board would see.
// These two are MEASURED on the board (src/input.js): 1P Start alone -> $FFFE,
// P1 Button 3 held -> $FF7F.
test('the pad produces the board\'s own measured port words', () => {
  clearTouch(); clearKeyboard();
  setTouchButton('START', true);
  assert.equal(currentPortWord(), 0xfffe);
  clearTouch();
  setTouchButton('AUTO', true);            // Button 3
  assert.equal(currentPortWord(), 0xff7f);
  clearTouch();
  assert.equal(currentPortWord(), 0xffff, 'nothing held is an all-ones word');
});

test('currentBits enumerates the positions portWordFromBits wants', () => {
  clearTouch(); clearKeyboard();
  setTouchDirections((1 << CONTROLS.DOWN) | (1 << CONTROLS.RIGHT));
  assert.deepEqual(currentBits(), [BIT.down, BIT.right]);
  assert.equal(currentPortWord(), portWordFromBits([BIT.down, BIT.right]));
  clearTouch();
});

test('game.json spells the frame rate as the derived 15625/264', () => {
  assert.ok(Math.abs(gameJson.display.frameHz - 15625 / 264) < 1e-6,
    `${gameJson.display.frameHz} is not 15625/264`);
  // ...and it is the only place the page reads it from.
  assert.match(fs.readFileSync(path.join(GAME, 'src/web/app.js'), 'utf8'),
    /gameJson\.display\.frameHz/);
});

test('game.json carries code.page and NOT code.entry', () => {
  // The root launcher imports entry + mods + input to boot a game inline; this
  // port has none of the three. A code.entry here would make the picker try.
  assert.equal(gameJson.code.entry, null);
  assert.equal(gameJson.code.mods, null);
  assert.equal(gameJson.code.input, null);
  assert.equal(gameJson.code.page, 'index.html');
});
