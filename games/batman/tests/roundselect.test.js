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
import { FADE_FRAMES } from '../src/title.js';
import { clearLevel } from '../src/level.js';
import { readFileSync } from 'node:fs';

const UP = 0x40, DOWN = 0x80, LEFT = 0x20, RIGHT = 0x10, START = 0x08;

/**
 * 0:$0B09 and 0:$0B11, the two GLOBAL fade ramps -- every fade in the game
 * reads the same twelve bytes. loadRoundSelect() hangs them off the art object
 * so showRoundSelect stays self-contained.
 */
const FADE_BGP = [0xE4, 0x90, 0x40, 0x00, 0x1B, 0x06, 0x01, 0x00];
const FADE_OBP1 = [0xC4, 0x80, 0x00, 0x00];

/**
 * No ramps on purpose: the cursor tests are testing loc_00_03DC and the fade
 * would only postpone it by 33 ticks. The one test that IS about the fade
 * passes its own.
 */
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

test('the screen is built BLACK and $03D7 fades it up', () => {
  // $0365-$0368 zeroes BGP and OBP0 -- two stores, not three -- and $03D7's
  // `LD C,$80 / CALL sub_00_0A7F` is a 33-frame fade IN which is what brings
  // them back to $E4/$E4/$C4. The old belief here was that "something in the
  // resource loads restores them", which is what a probe that only samples the
  // SETTLED screen concludes; the fade is the restorer.
  //
  // MEASURED (tools/oracle/menushot.py, trace `flash` tail): $FFAD holds $00
  // through the build, then steps $00 -> $40 -> $90 -> $E4 eight frames apart,
  // with the first $03DC input iteration 8 frames after the last step.
  // tools/oracle/menuflow.mjs holds the whole cadence against the cartridge.
  const s = makeScreen();
  assert.equal(s.video.bgp, 0x00);
  assert.equal(s.video.obp0, 0x00);
  // $FFAF is not written here at all -- the state's default survives. Forcing
  // $C4 made the port's OBP1 disagree with the cartridge's for the first 16
  // frames of the fade; every entry path arrives with it already zero and the
  // fade rewrites it on the way back up ($00, $00, $80, $C4).
  assert.equal(s.video.obp1, GAMEPLAY_PALETTES.obp1);
});

test('the fade BLOCKS: no input, no cursor, for 33 frames', () => {
  // $03D7 sits between the build and the loop head, so $03DC is not reached
  // until sub_00_0A7F returns. A port that ran the loop during the fade let
  // START through 33 frames early and drew a cursor onto a black screen.
  //
  // fakeArt() deliberately carries no ramps -- the cursor tests want the loop
  // -- so this one supplies them, which is also what loadRoundSelect() does.
  const s = createState(makeTunables());
  s.tables = { ...SYNTHETIC_TABLES, ...CONTINUE_FIXTURE };
  s.titleManifest = null;
  showRoundSelect(s, { ...fakeArt(), fadeBgp: FADE_BGP, fadeObp1: FADE_OBP1 });
  assert.ok(s.roundSelect.fade, '$03D7 armed the fade');

  const steps = [];              // the frame each palette CHANGE lands on
  const snap = () => [s.video.bgp, s.video.obp0, s.video.obp1].join(',');
  let prev = snap();
  for (let i = 0; i < FADE_FRAMES; i++) {
    press(s, START);
    assert.equal(tickRoundSelect(s), 'roundselect', `frame ${i} must not hand over`);
    assert.equal(s.video.sprites.length, 0, `frame ${i} draws no cursor`);
    if (snap() !== prev) { steps.push([i, snap()]); prev = snap(); }
  }
  // sub_00_0A7F steps on `(B & 7) == 0` with B counting DOWN from $21, so the
  // first step lands one frame in and the rest every eighth after it. bgp and
  // obp0 walk 0:$0B09 together (mode $80 -> C = 0, so $0A95 and $0AB4 both
  // pass); obp1 walks 0:$0B11, which is $00 $00 $80 $C4 read backwards.
  assert.deepEqual(steps, [[1, '0,0,0'], [9, '64,64,0'],
                           [17, '144,144,128'], [25, '228,228,196']]);
  assert.equal(s.roundSelect.fade, null, 'and then the loop head is reached');
  press(s, START);
  assert.equal(tickRoundSelect(s), 'start');
});

test('the screen asks for NO music -- every caller already has', () => {
  // loc_00_035B-$03DC contains no `CALL sub_00_0AE1` at all. The three ways in
  // each send their own cue FIRST:
  //   $0355  $01/$03  the title flash          (src/title.js)
  //   $2AC6  $2E/$03  the death sequence       (src/player.js)
  //   $3634  $01/$03  a route clear            (src/level.js clearLevel)
  //
  // MEASURED (menushot.py `songs`, which stamps every $0AE1 hit with the loop
  // counters): the last request on the title walk is $01/$03 at flash=120 and
  // there is nothing at rs >= 1. Sending $01 here restarted the theme a second
  // time on that path and -- worse -- OVERRODE the death path's $2E, so the
  // port played the round-select theme where the cartridge plays the
  // after-death one. No memory comparison can ever catch that (docs 03, 32).
  const s = createState(makeTunables());
  s.tables = { ...SYNTHETIC_TABLES, ...CONTINUE_FIXTURE };
  s.sound = { queue: [] };
  s.titleManifest = null;
  showRoundSelect(s, fakeArt());
  assert.deepEqual(s.sound.queue, []);
});

test('WIRING GAP (level.js): a route clear must send $01/$03 on its way here', () => {
  // The paired half of the test above. loc_00_035B makes no request, so the
  // THREE callers must each make their own, and $3634 -- `LD BC,$0103 / CALL
  // sub_00_0AE1`, three instructions before `JP loc_00_035B` at $363A -- is
  // the route-clear one. src/level.js's clearLevel still carries the old
  // comment ("showRoundSelect already sends exactly that, so requesting it
  // here would double the command"), which is now inverted: nobody sends it,
  // and clearing a route reaches round select SILENT.
  //
  // No memory comparison can catch this class of bug (docs/03-VERIFICATION.md
  // 32) -- the screen builds identically either way. Only a cue trace can, and
  // tools/oracle/menuflow.mjs already holds the title walk's list.
  //
  // THE FIX (src/level.js clearLevel, ~line 452, just before the
  // `return { to: 'roundselect' }`):
  //     if (state.sound && state.sound.queue.length < 4) {
  //       state.sound.queue.push({ id: 0x01, mask: 0x03 });
  //     }
  const s = createState(makeTunables());
  s.tables = { ...SYNTHETIC_TABLES };
  s.sound = { queue: [] };
  s.level.number = 0x04;
  s.level.bossId = 1;
  s.flow.routeMask = 0;
  assert.deepEqual(clearLevel(s), { to: 'roundselect' });
  assert.deepEqual(s.sound.queue, [{ id: 0x01, mask: 0x03 }],
    '$3634 is the only place the round-select theme is asked for on this path');
});

test('the OTHER two ways into round select do send their own cue', () => {
  // Kept beside the gap so "nobody sends it" is a measurement of this tree and
  // not an assumption: title.js's $0355 fires on the flash handover, and
  // player.js's $2AC6 sends $2E -- the after-death theme, which the old
  // showRoundSelect request used to OVERRIDE with $01.
  const title = readFileSync(new URL('../src/title.js', import.meta.url), 'utf8');
  assert.match(title, /requestSound\(state, 0x01, 0x03\)/,
    'title.js $0355 still sends $01/$03');
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /requestSound\(state, 0x2E, 0x03\)/,
    'player.js $2AC6 still sends $2E/$03, and nothing may replace it with $01');
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
