// Map objects -- the $C1E8 array.  ROM: driver sub_01_4230.
//
// The oracle covers type 7 frame-by-frame on difficulty 0 (l1-water-spouts).
// These cover the difficulty scaling, which no oracle scenario reaches because
// the harness always boots on the default setting.

import test from 'node:test';
import assert from 'node:assert/strict';

import { updateActors, UNIMPLEMENTED_TYPES } from '../src/actors.js';
import { mapCollision, mapTile } from '../src/state.js';
import { makeState, grid } from './helpers.js';

/** A type-7 water spout in its own column, as level 1 places them. */
function makeSpout(state, col, row = 0x13) {
  const r = state.actors[0];
  r.fill(0);
  r[0] = 7;
  r[1] = col;          // X hi
  r[3] = row;          // Y hi, the current cursor
  r[7] = 0x10;
  r[0x0F] = row;       // the row it resets to
  return r;
}

function makeWorld(playerCol) {
  const g = grid(24);
  for (let c = 0; c < 24; c++) g[14][c] = '#';
  const s = makeState(g);
  s.player.x = (playerCol << 8) | 0x80;
  s.player.y = 13 * 0x100;
  s.camera.x = (playerCol - 5) << 8;
  return s;
}

/** Run n frames of the driver. */
const run = (s, n) => { for (let i = 0; i < n; i++) updateActors(s); };

test('a water spout stays dormant until the player is within 5 columns', () => {
  // $4470: a distance test on the high bytes, tighter than the driver's own
  // activation window.
  const far = makeWorld(2);
  makeSpout(far, 10);
  run(far, 30);
  assert.equal(far.actors[0][0x0B], 0, 'still asleep');

  const near = makeWorld(8);
  makeSpout(near, 10);
  updateActors(near);
  assert.equal(near.actors[0][0x0B], 1, 'armed');
});

test('a spout stamps its column downward, then erases it', () => {
  // The spout is TERRAIN, not a sprite: it writes graphic $47 / collision $FD
  // one cell at a time from its start row down to $1F.
  const s = makeWorld(8);
  const r = makeSpout(s, 10);
  const wet = () => {
    const rows = [];
    for (let row = 0x13; row < 0x20; row++) {
      if (mapCollision(s, 10, row) === 0xFD) rows.push(row);
    }
    return rows;
  };

  // Two arming frames, then one cell every third frame (the +$0C gate).
  run(s, 20);
  const stamped = wet();
  assert.ok(stamped.length > 3, `expected a column of water, got ${stamped}`);
  assert.equal(stamped[0], 0x13, 'starting at its own row');
  assert.ok(stamped.length < 13, 'and not the whole column yet');

  // Run on until it goes idle -- the erase pass has to leave nothing behind,
  // or the level would silently fill up with permanent hazard cells.
  for (let i = 0; i < 2000 && !(r[0x0B] === 0 && r[0x0C] > 4); i++) updateActors(s);
  assert.deepEqual(wet(), [], 'the column is cleared again');
});

test('the spout steps and pauses faster on higher difficulty', () => {
  // $44D6 sets the per-row gate to 1 above difficulty 0, and $4509-$4511 make
  // the gap between pulses $50 / $28 / $10. Hard runs roughly five times as
  // often as easy.
  const gaps = [];
  for (const difficulty of [0, 1, 2]) {
    const s = makeWorld(8);
    s.flow.difficulty = difficulty;
    const r = makeSpout(s, 10);

    // Drive it to the end of the erase pass, where the pause is loaded.
    let pause = null;
    for (let i = 0; i < 2000; i++) {
      updateActors(s);
      if (r[0x0B] === 0 && r[0x0C] > 4) { pause = r[0x0C]; break; }
    }
    gaps.push(pause);
  }
  assert.deepEqual(gaps, [0x50, 0x28, 0x10]);
});

test('a spout resets its cursor to the row it started from', () => {
  // $4518 reloads +3 from +$0F rather than from a constant, so two spouts at
  // different heights each return to their own.
  const s = makeWorld(8);
  const r = makeSpout(s, 10, 0x15);
  run(s, 400);
  assert.equal(r[3], 0x15);
});

test('type 7 is no longer listed as unimplemented', () => {
  assert.ok(!UNIMPLEMENTED_TYPES.has(7));
});

// ---------------------------------------------------------------------------
// Types 1/2/3/4/5/6/$0B.  The oracle covers each of these frame-by-frame on
// the level where it ships (tools/oracle/objregress.mjs). What is left for
// unit tests is what no scenario can reach: the arms that only fire on other
// difficulty settings or other spawn data, and the arithmetic edges the ROM's
// four mutually-jumping entry points make easy to get wrong.
// ---------------------------------------------------------------------------

/** Put a record in slot 0 with the shipped-blob defaults for a moving object. */
function makeObject(state, type, col, row, extra = {}) {
  const r = state.actors[0];
  r.fill(0);
  r[0] = type;
  r[1] = col;
  r[3] = row;
  r[4] = 0x80;
  r[7] = 0x10;
  r[8] = 0x09;
  r[0x0E] = col;
  r[0x0F] = row;
  for (const [k, v] of Object.entries(extra)) r[Number(k)] = v;
  return r;
}

test('the X oscillator brakes 1 per frame through a reversal, not 2', () => {
  // The trap in the listing: jt_01_488D and jt_01_48E4 JUMP INTO EACH OTHER.
  // A type 2 carrying a positive velocity brakes by 2 at $48F3 and then falls
  // into loc_01_4890, which adds 1 back at $48AB -- so the step actually taken
  // is v-1. Reading either entry point on its own gives v-2 and puts the
  // object permanently one frame ahead.
  const s = makeWorld(8);
  const r = makeObject(s, 2, 10, 0x18, { 5: 0x10 });
  const x0 = (r[1] << 8) | r[2];
  updateActors(s);
  assert.equal(r[5], 0x0F, 'velocity 16 -> 15');
  assert.equal(((r[1] << 8) | r[2]) - x0, 0x0F, 'and it moved by 15, not 14');
});

test('the X oscillator reverses by rewriting its own type byte', () => {
  // sub_01_4AA0 + the table at 1:$4AB3: 1 <-> 2, and bit 7 (the live flag)
  // survives. This is why type 2 never appears in any level's spawn blob.
  const s = makeWorld(8);
  const r = makeObject(s, 1, 10, 0x18, { 0x0B: 2, 5: 0x0F });
  for (let i = 0; i < 40 && (r[0] & 0x7F) === 1; i++) updateActors(s);
  assert.equal(r[0] & 0x7F, 2, 'flipped to the leftward twin');
  assert.equal(r[0] & 0x80, 0x80, 'and is still live');
  assert.ok(r[1] - 10 >= 2, 'after travelling its full +$0B range');
});

test('the Y oscillator caps at $10 down and $F0 up', () => {
  // $495E-$4965 and $49BB-$49C2. The upward clamp is an UNSIGNED CP $F0, so a
  // velocity that would wrap past -16 pins there instead of running away.
  const down = makeWorld(8);
  const rd = makeObject(down, 4, 10, 0x18, { 0x0C: 0x40 });
  for (let i = 0; i < 40; i++) updateActors(down);
  assert.equal(rd[6], 0x10);

  const up = makeWorld(8);
  const ru = makeObject(up, 3, 10, 0x18, { 0x0C: 0x40 });
  for (let i = 0; i < 40; i++) updateActors(up);
  assert.equal(ru[6], 0xF0);
});

test('a type-5 platform waits for a rider, then falls out of the world', () => {
  // $429E gates the whole thing on +$0D, which only the collision scan writes
  // ($2534). Without a rider it never moves at all.
  const idle = makeWorld(8);
  const ri = makeObject(idle, 5, 10, 0x18);
  run(idle, 60);
  assert.equal(ri[0x0B], 0, 'still dormant');
  assert.equal(ri[3], 0x18, 'and has not moved');

  const s = makeWorld(8);
  const r = makeObject(s, 5, 10, 0x18);
  r[0x0D] = 1;                                   // the scan says he is on it
  updateActors(s);
  assert.equal(r[0x0B], 1, 'arming starts the frame after the rider appears');
  for (let i = 0; i < 7; i++) updateActors(s);
  assert.equal(r[0x0B], 0xFF, 'seven frames later it is committed');
  assert.equal(r[6], 1, 'and takes its first 1-subpixel step');

  // $42BE caps the speed at $30, and $42DE ZEROES the slot at Y hi $21 --
  // the record is gone, not retired.
  for (let i = 0; i < 200 && r[0] !== 0; i++) updateActors(s);
  assert.equal(r[0], 0, 'the slot is emptied');
});

test('a type-6 block stamps slot-owned terrain where it lands', () => {
  // The collision byte is `slot * 32 | $1F` ($43D8-$43E0), which is how level
  // 13's destructible cells know which $C1E8 record owns them. Slot 0 gives
  // $1F; the four graphics are $3E $3F $40 $41 over a 2x2 footprint.
  const g = grid(24);
  for (let c = 0; c < 24; c++) g[14][c] = '#';
  const s = makeState(g);
  s.player.x = (10 << 8) | 0x80;
  s.player.y = 13 * 0x100;
  s.camera.x = 5 << 8;
  const r = makeObject(s, 6, 10, 0x11, { 4: 0, 8: 0x10 });

  for (let i = 0; i < 200 && r[0x0B] !== 0xFE; i++) updateActors(s);
  assert.equal(r[0x0B], 0xFE, 'it landed');
  assert.equal(r[3], 0x1D, 'on the row above the floor at map row 14');
  assert.equal(r[6], 0, 'velocity cleared');
  assert.equal(r[4], 0, 'and the Y low byte pinned');

  for (const [col, row, tile] of [[10, 0x1D, 0x41], [10, 0x1C, 0x3F],
                                  [9, 0x1C, 0x3E], [9, 0x1D, 0x40]]) {
    assert.equal(mapTile(s, col, row), tile, `graphic at ${col},${row}`);
    assert.equal(mapCollision(s, col, row), 0x1F, `collision at ${col},${row}`);
  }
  // $431B pins the screen cache off-screen once it is terrain, so the overlap
  // scan cannot find it as an object as well.
  updateActors(s);
  assert.equal(r[9], 0xFF);
  assert.equal(r[0x0A], 0xFF);
});

test('a landed type-6 block falls again if its support disappears', () => {
  // $4377: the landed record keeps probing, and a cleared cell underneath
  // wipes its own four stamped cells and puts it back to $FF.
  const g = grid(24);
  for (let c = 0; c < 24; c++) g[14][c] = '#';
  const s = makeState(g);
  s.player.x = (10 << 8) | 0x80;
  s.player.y = 13 * 0x100;
  s.camera.x = 5 << 8;
  const r = makeObject(s, 6, 10, 0x11, { 4: 0, 8: 0x10 });
  for (let i = 0; i < 200 && r[0x0B] !== 0xFE; i++) updateActors(s);

  // Take the floor out from under both columns of the footprint.
  const cells = s.level.cells;
  for (const col of [9, 10]) cells[(col * 16 + 14) * 2 + 1] = 0;

  updateActors(s);
  assert.equal(r[0x0B], 0xFF, 'falling again');
  assert.equal(mapCollision(s, 10, 0x1D), 0, 'and it took its terrain with it');
  assert.equal(mapTile(s, 9, 0x1C), 0);
});

test('every placed map-object type now has a handler', () => {
  // Types 2 and 10 are the only ones the shipped spawn blobs never contain,
  // and type 2 is reachable anyway -- it is what a type 1 turns into.
  for (const t of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0x0B]) {
    assert.ok(!UNIMPLEMENTED_TYPES.has(t), `type ${t}`);
  }
});
