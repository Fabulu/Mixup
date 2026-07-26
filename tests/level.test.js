// Level data.  ROM: sub_00_2889 (metatiles), level init $04BB, 1:$7CED
// (player start).  Master reference §6.2.

import test from 'node:test';
import assert from 'node:assert/strict';

import { metatileTile, resetPlayer } from '../src/level.js';
import { DEFAULT_TUNABLES } from '../src/tunables.js';
import { makeState, grid } from './helpers.js';

/** Two metatiles whose four ids are distinguishable at a glance. */
const METATILES = [
  [0xA0, 0xA1, 0xA2, 0xA3],   // TL, BL, TR, BR
  [0xB0, 0xB1, 0xB2, 0xB3],
];

const withMetatiles = () => makeState(grid(4), { metatiles: METATILES });

test('metatileTile is COLUMN-major: the stored order is TL, BL, TR, BR', () => {
  // ROM: 5:$4000 entries are 4 tile ids column-major (master reference §6.2).
  // Index = subCol * 2 + subRow, NOT subRow * 2 + subCol.
  const state = withMetatiles();
  assert.equal(metatileTile(state, 0, 0, 0), 0xA0, 'top-left');
  assert.equal(metatileTile(state, 0, 0, 1), 0xA1, 'bottom-left');
  assert.equal(metatileTile(state, 0, 1, 0), 0xA2, 'top-right');
  assert.equal(metatileTile(state, 0, 1, 1), 0xA3, 'bottom-right');
});

test('metatileTile row-major would give a different answer (the ordering matters)', () => {
  // Guard against a "fix" that swaps the two sub-indices.
  const state = withMetatiles();
  assert.notEqual(metatileTile(state, 0, 0, 1), metatileTile(state, 0, 1, 0));
});

test('metatileTile indexes the metatile table by id', () => {
  const state = withMetatiles();
  assert.equal(metatileTile(state, 1, 0, 0), 0xB0);
  assert.equal(metatileTile(state, 1, 1, 1), 0xB3);
});

test('metatileTile falls back to the blank fill tile $2F for a missing metatile', () => {
  // Master reference §6.2: L9-14 reference id len/4, one past the end.
  const state = withMetatiles();
  assert.equal(metatileTile(state, 99, 0, 0), 0x2F);
  assert.equal(metatileTile(state, 2, 1, 1), 0x2F);
});

test('every sub-cell of every metatile is reachable exactly once', () => {
  // Sanity: the four (subCol, subRow) pairs map onto the four stored ids.
  const state = withMetatiles();
  const got = [];
  for (let subCol = 0; subCol < 2; subCol++) {
    for (let subRow = 0; subRow < 2; subRow++) got.push(metatileTile(state, 0, subCol, subRow));
  }
  assert.deepEqual(got.slice().sort(), [...METATILES[0]].sort());
});

// ---------------------------------------------------------------------------
// resetPlayer.  ROM: level init at $04BB, start position from 1:$7CED.
// ---------------------------------------------------------------------------

test('resetPlayer forces the X low byte to $80 and drops the player in falling', () => {
  // ROM: $04BB -- 1:$7CED stores {Xhi, Yhi} only; $FF82 is written with $80.
  const state = makeState(grid(8));
  resetPlayer(state, { startX: 7, startY: 0x12 });
  const p = state.player;
  assert.equal(p.x, (7 << 8) | 0x80);
  assert.equal(p.y, 0x12 << 8);
  assert.equal(p.air, 2, 'starts falling onto the ground');
  assert.equal(p.facing, 0);
  assert.equal(p.vx, 0);
  assert.equal(p.vy, 0);
});

test('resetPlayer takes HP and the hitbox from the tunables', () => {
  // ROM: $00201 startingMaxHP, $0052D/$00531 hitbox.
  const state = makeState(grid(8));
  resetPlayer(state, { startX: 1, startY: 0x10 });
  const p = state.player;
  assert.equal(p.hp, DEFAULT_TUNABLES.startingMaxHP);
  assert.equal(p.hpMax, DEFAULT_TUNABLES.startingMaxHP);
  assert.equal(p.halfW, DEFAULT_TUNABLES.hitboxHalfWidth);
  assert.equal(p.halfH, DEFAULT_TUNABLES.hitboxHalfHeight);
});

test('resetPlayer honours overridden tunables', () => {
  // docs/02-MOD-SYSTEM: mods override at load time and nothing may inline these.
  const state = makeState(grid(8), {
    tunables: { startingMaxHP: 3, hitboxHalfWidth: 9, hitboxHalfHeight: 11 },
  });
  resetPlayer(state, { startX: 1, startY: 0x10 });
  assert.equal(state.player.hpMax, 3);
  assert.equal(state.player.halfW, 9);
  assert.equal(state.player.halfH, 11);
});

test('resetPlayer clears every modal timer and flag', () => {
  // ROM: $04BB writes the whole $FF8F-$FFC2 block.
  const state = makeState(grid(8));
  Object.assign(state.player, {
    turnTimer: 5, squatTimer: 5, airThrottle: 3, jumpReleased: 1,
    clingLock: 0x5F, slowMode: 0x80, attrMask: 0x80, action: 2,
    springArmed: 1, iframes: 40,
  });
  resetPlayer(state, { startX: 1, startY: 0x10 });
  const p = state.player;
  for (const k of ['turnTimer', 'squatTimer', 'airThrottle', 'jumpReleased',
    'clingLock', 'slowMode', 'attrMask', 'action', 'springArmed', 'iframes']) {
    assert.equal(p[k], 0, `${k} not cleared`);
  }
  assert.equal(p.animPrev, 0xFF, 'forces a full repaint');
  assert.equal(p.msIndex, 1, 'facing XOR 1');
});
