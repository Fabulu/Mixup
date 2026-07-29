// Round select / continue.  ROM: loc_00_035B setup, loc_00_03DC-$0479 loop.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, GAMEPLAY_PALETTES } from '../src/state.js';
import { SYNTHETIC_TABLES } from './helpers.js';
import { makeTunables } from '../src/tunables.js';
import {
  showRoundSelect, tickRoundSelect, hideRoundSelect, routeIfOpen,
  continueLevel, ROUTE_LEVEL,
} from '../src/roundselect.js';

const UP = 0x40, DOWN = 0x80, LEFT = 0x20, RIGHT = 0x10, START = 0x08;

function fakeArt() {
  return { bgMap: new Uint8Array(0x400), tiles: {}, vram: new Uint8Array(0x2000) };
}

function makeScreen({ mask = 0, canContinue = 0 } = {}) {
  const s = createState(makeTunables());
  s.tables = { ...SYNTHETIC_TABLES, ...CONTINUE_FIXTURE };
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

test('the OBJ palettes stay live, whatever $0365 appears to say', () => {
  // $0365 zeroes both shadows, but they do not STAY zero -- measured on the
  // cartridge mid-screen: rOBP0 $E4, rOBP1 $C4. Transcribing the write
  // literally makes the bat cursor invisible, because a zeroed OBP maps every
  // shade to colour 0: the sprite is still in OAM and still drawn.
  const s = makeScreen();
  assert.equal(s.video.obp0, GAMEPLAY_PALETTES.obp0);
  assert.equal(s.video.obp1, GAMEPLAY_PALETTES.obp1);
});

test('the screen asks for its own theme, song $01', () => {
  // Measured by hooking sub_00_0AE1 across the transition: $0D (confirm blip,
  // sent by title.js) then $01 mask $03. Without it the screen keeps playing
  // whatever the title left running.
  const s = createState(makeTunables());
  s.tables = { ...SYNTHETIC_TABLES, ...CONTINUE_FIXTURE };
  s.sound = { queue: [] };
  s.titleManifest = null;
  showRoundSelect(s, fakeArt());
  assert.deepEqual(s.sound.queue.at(-1), { id: 0x01, mask: 0x03 });
});

// ---------------------------------------------------------------------------
// CONTINUE.  ROM: $03B8-$03C3 (drawn) and $047C-$049B (taken).
//
// The values here are MEASURED, not read off the listing: the cartridge was
// taken to round select twice -- once from the title, once by dying on level
// 3 -- and $8000-$9FFF dumped at $0472 both times. The whole on-screen
// difference is eight tiles at $9A04 and the life count at $9A0E.
// (tools/oracle/flowdiff.mjs holds the ROM against the port end to end.)
// ---------------------------------------------------------------------------

// The CONTINUE line, as a sub_00_0A0E script: {dest $9A04, count 8, tiles}.
// Synthetic and declared here -- this suite never reads assets/ -- but shaped
// exactly like 0:$3328 so it exercises the real interpreter path. That the
// SHIPPED script is the cartridge's is checked by check_tables in
// tools/verify_assets.py, which re-reads 0:$3328 from the ROM file.
const CONTINUE_ROW = [0x8C, 0x98, 0x97, 0x9D, 0x92, 0x97, 0x9E, 0x8E];
const CONTINUE_FIXTURE = {
  continueScript: [0x9A, 0x04, 0x08, ...CONTINUE_ROW, 0x00],
};
const readRow = (s) => Array.from({ length: 8 },
                                  (_, i) => s.video.bgMap[0x9A04 - 0x9800 + i]);

test('the CONTINUE line is drawn only when $FFB5 is set', () => {
  const off = makeScreen({ canContinue: 0 });
  assert.deepEqual(readRow(off), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(off.video.bgMap[0x9A0E - 0x9800], 0);

  const on = makeScreen({ canContinue: 1 });
  assert.deepEqual(readRow(on), CONTINUE_ROW);
});

test('the life count is drawn as $80 + lives, unclamped', () => {
  // $03BE-$03C3: LD A,[$C767] / ADD A,$80. Nothing bounds it, so a run with
  // more than nine lives draws a letter. Reproduced rather than fixed.
  const s = createState(makeTunables());
  s.tables = { ...SYNTHETIC_TABLES, ...CONTINUE_FIXTURE };
  s.flow.continueAvailable = 1;
  s.flow.lives = 4;
  s.titleManifest = null;
  showRoundSelect(s, fakeArt());
  assert.equal(s.video.bgMap[0x9A0E - 0x9800], 0x84);

  s.flow.lives = 12;
  showRoundSelect(s, fakeArt());
  assert.equal(s.video.bgMap[0x9A0E - 0x9800], 0x8C);
});

test('CONTINUE keeps the level you died on and ignores the route cursor', () => {
  // $0480 jumps PAST loc_00_049D, so the route the cursor sits on is not
  // consulted at all. MEASURED: dying on level 3 and pressing START reaches
  // loc_00_04BB with $FFB0 = 3.
  const s = makeScreen({ canContinue: 1 });
  s.level.number = 3;
  s.roundSelect.cursor = 2;                 // would be level 9 on the START arm
  assert.equal(continueLevel(s), 3);
});

test('CONTINUE on a level that ENDS something steps back one', () => {
  // $0486-$0499: 4, 8, $0B and $0E each take the DEC A. MEASURED: dying on
  // level 4 continues at level 3.
  const s = makeScreen({ canContinue: 1 });
  for (const [died, resumed] of [[4, 3], [8, 7], [0x0B, 0x0A], [0x0E, 0x0D],
                                 [3, 3], [5, 5], [0x0C, 0x0C]]) {
    s.level.number = died;
    assert.equal(continueLevel(s), resumed, `level ${died}`);
  }
});

test('CONTINUE restores HP from the maximum', () => {
  const s = makeScreen({ canContinue: 1 });
  s.player.hp = 1;
  s.player.hpMax = 10;
  continueLevel(s);                          // $0482: $FF8A <- $FF8E
  assert.equal(s.player.hp, 10);
});

test('the routes map to levels 1/5/9 and the Joker warp', () => {
  // loc_00_049D. Route 3 only becomes reachable once $C753 reads $07, which
  // is the same condition $361E uses to jump straight into level $0C.
  assert.deepEqual(ROUTE_LEVEL, [1, 5, 9, 12]);
});
