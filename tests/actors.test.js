// Map objects -- the $C1E8 array.  ROM: driver sub_01_4230.
//
// The oracle covers type 7 frame-by-frame on difficulty 0 (l1-water-spouts).
// These cover the difficulty scaling, which no oracle scenario reaches because
// the harness always boots on the default setting.

import test from 'node:test';
import assert from 'node:assert/strict';

import { updateActors, UNIMPLEMENTED_TYPES } from '../src/actors.js';
import { mapCollision } from '../src/state.js';
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
