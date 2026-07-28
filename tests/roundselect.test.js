// Round select / continue.  ROM: loc_00_035B setup, loc_00_03DC-$0479 loop.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, GAMEPLAY_PALETTES } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import {
  showRoundSelect, tickRoundSelect, hideRoundSelect, routeIfOpen,
} from '../src/roundselect.js';

const UP = 0x40, DOWN = 0x80, LEFT = 0x20, RIGHT = 0x10, START = 0x08;

function fakeArt() {
  return { bgMap: new Uint8Array(0x400), tiles: {}, vram: new Uint8Array(0x2000) };
}

function makeScreen({ mask = 0, canContinue = 0 } = {}) {
  const s = createState(makeTunables());
  s.flow.routeMask = mask;
  s.flow.continueAvailable = canContinue;
  s.titleManifest = null;                 // cursor sprite is not under test
  showRoundSelect(s, fakeArt());
  return s;
}

const press = (s, bits) => { s.input.pressed = bits; s.input.held = bits; };
const cursorTile = (s) => s.video.bgMap[0x99CD - 0x9800];

// ---------------------------------------------------------------------------
// sub_00_0FE6
// ---------------------------------------------------------------------------

test('routeIfOpen maps routes 0/1/2 to $C753 bits 0/1/2', () => {
  assert.equal(routeIfOpen(0b000, 0), 0);
  assert.equal(routeIfOpen(0b001, 0), 0xFF);
  assert.equal(routeIfOpen(0b010, 1), 0xFF);
  assert.equal(routeIfOpen(0b100, 2), 0xFF);
  assert.equal(routeIfOpen(0b011, 2), 2, 'route 2 only cares about bit 2');
});

test('route 3 shares route 2s bit', () => {
  // $0FF3 is the else-arm: anything that is not 0 or 1 tests BIT 2.
  assert.equal(routeIfOpen(0b100, 3), 0xFF);
  assert.equal(routeIfOpen(0b011, 3), 3);
});

// ---------------------------------------------------------------------------
// setup, loc_00_035B
// ---------------------------------------------------------------------------

test('the cursor starts on the first route that is not cleared', () => {
  assert.equal(makeScreen({ mask: 0b000 }).roundSelect.cursor, 0);
  assert.equal(makeScreen({ mask: 0b001 }).roundSelect.cursor, 1);
  assert.equal(makeScreen({ mask: 0b011 }).roundSelect.cursor, 2);
});

test('every route cleared pins the cursor at 3', () => {
  // $038E: CP $07 short-circuits the scan entirely.
  assert.equal(makeScreen({ mask: 0x07 }).roundSelect.cursor, 3);
});

test('the route cursor is a TILE in the BG map, from table 0:$1008', () => {
  assert.equal(cursorTile(makeScreen({ mask: 0 })), 0x81);
  assert.equal(cursorTile(makeScreen({ mask: 0b001 })), 0x82);
  assert.equal(cursorTile(makeScreen({ mask: 0b011 })), 0x83);
  assert.equal(cursorTile(makeScreen({ mask: 0x07 })), 0x84);
});

test('CONTINUE starts selected when it is available at all', () => {
  // $03C6: LD A,$01 / LD [$C713],A, inside the $FFB5 branch.
  assert.equal(makeScreen({ canContinue: 0 }).roundSelect.mode, 0);
  assert.equal(makeScreen({ canContinue: 1 }).roundSelect.mode, 1);
});

// ---------------------------------------------------------------------------
// loop, loc_00_03DC
// ---------------------------------------------------------------------------

test('UP selects START, DOWN selects CONTINUE', () => {
  const s = makeScreen({ canContinue: 1 });
  press(s, UP);
  tickRoundSelect(s);
  assert.equal(s.roundSelect.mode, 0);
  press(s, DOWN);
  tickRoundSelect(s);
  assert.equal(s.roundSelect.mode, 1);
});

test('DOWN does nothing when there is no continue to select', () => {
  // $03F9: the $FFB5 test comes BEFORE the write, so the press is swallowed.
  const s = makeScreen({ canContinue: 0 });
  press(s, DOWN);
  tickRoundSelect(s);
  assert.equal(s.roundSelect.mode, 0);
});

test('RIGHT walks the routes and wraps at 3', () => {
  const s = makeScreen({ mask: 0 });
  for (const want of [1, 2, 0, 1]) {
    press(s, RIGHT);
    tickRoundSelect(s);
    assert.equal(s.roundSelect.cursor, want);
  }
});

test('LEFT walks the other way and wraps to 2', () => {
  const s = makeScreen({ mask: 0 });
  for (const want of [2, 1, 0, 2]) {
    press(s, LEFT);
    tickRoundSelect(s);
    assert.equal(s.roundSelect.cursor, want);
  }
});

test('cleared routes are stepped straight over', () => {
  // mask $02 clears route 1, so RIGHT from 0 must land on 2, not 1.
  const s = makeScreen({ mask: 0b010 });
  assert.equal(s.roundSelect.cursor, 0);
  press(s, RIGHT);
  tickRoundSelect(s);
  assert.equal(s.roundSelect.cursor, 2);
});

test('the routes do not move while CONTINUE is selected', () => {
  // $040F: LD A,[$C713] / AND A / JR NZ -- left and right are dropped.
  const s = makeScreen({ canContinue: 1, mask: 0 });
  assert.equal(s.roundSelect.mode, 1);
  press(s, RIGHT);
  tickRoundSelect(s);
  assert.equal(s.roundSelect.cursor, 0, 'unchanged');
});

test('moving the cursor repaints its tile', () => {
  const s = makeScreen({ mask: 0 });
  press(s, RIGHT);
  tickRoundSelect(s);
  assert.equal(cursorTile(s), 0x82);
});

test('START leaves the screen', () => {
  const s = makeScreen();
  press(s, 0);
  assert.equal(tickRoundSelect(s), 'roundselect');
  press(s, START);
  assert.equal(tickRoundSelect(s), 'start');
});

test('hideRoundSelect drops the map so the level can take it back', () => {
  const s = makeScreen();
  hideRoundSelect(s);
  assert.equal(s.video.bgMap, null);
  assert.equal(s.roundSelect, null);
});

test('leaving round select must restore the OBJ palettes it zeroed', () => {
  // $0365 zeroes both object palette shadows for the menu. A zeroed OBP maps
  // every shade to colour 0, so sprites keep being drawn and stay completely
  // invisible -- which reads as "the level did not load", not as a palette.
  // main.js puts GAMEPLAY_PALETTES back; this pins the precondition.
  const s = makeScreen();
  assert.equal(s.video.obp0, 0, 'the menu really does zero them');
  assert.equal(s.video.obp1, 0);
  assert.notEqual(GAMEPLAY_PALETTES.obp0, 0, 'and gameplay really needs them back');
  assert.notEqual(GAMEPLAY_PALETTES.obp1, 0);
});
