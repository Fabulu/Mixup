// Batarang flight.  ROM: throw loc_00_19BE, flight sub_00_3A35.
//
// The frame-by-frame proof is in the oracle corpus (four batarang-* scenarios,
// all bit-exact). These pin the asymmetry that shapes the whole return leg,
// because it is the kind of thing a refactor would happily "simplify" away.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import { throwBatarang, updateBatarangs, findFreeSlot, FLAG_RETURNING }
  from '../src/batarang.js';
import { makeState, grid } from './helpers.js';

function makeWorld() {
  const g = grid(24);
  for (let c = 0; c < 24; c++) g[14][c] = '#';
  const s = makeState(g);
  s.player.x = 8 * 0x100 + 0x80;
  s.player.y = 13 * 0x100;
  s.flow.ammo = 5;
  return s;
}

/** Put a returning batarang at a chosen offset from the player. */
function returning(s, { dx = 0, dy = 0, speed = 0, arc = 0 } = {}) {
  const b = s.batarangs[0];
  b.active = true;
  b.flags = FLAG_RETURNING | 1;
  b.x = (s.player.x + dx) & 0xFFFF;
  b.y = (s.player.y + dy) & 0xFFFF;
  b.speed = speed;
  b.arc = arc;
  return b;
}

// ---------------------------------------------------------------------------
// the outbound leg
// ---------------------------------------------------------------------------

test('the outbound leg decays its own speed and then turns around', () => {
  // $3B99: SUB $02 every frame; reaching zero flips to returning rather than
  // despawning, so a batarang always comes back.
  const s = makeWorld();
  throwBatarang(s, 0);
  const start = s.batarangs[0].speed;
  assert.ok(start > 0);

  for (let i = 0; i < 200 && !(s.batarangs[0].flags & FLAG_RETURNING); i++) {
    updateBatarangs(s);
  }
  assert.ok(s.batarangs[0].flags & FLAG_RETURNING, 'turned around');
  assert.ok(s.batarangs[0].x > s.player.x, 'after travelling out to the right');
});

// ---------------------------------------------------------------------------
// the return leg -- braking
// ---------------------------------------------------------------------------

test('braking is twice as strong as accelerating', () => {
  // $3B52 vs $3B0B. Moving LEFT at -46 while the player is to the RIGHT: the
  // ROM adds 4, not 2. Getting this wrong is a 2x error in how fast the
  // batarang can reverse.
  const s = makeWorld();
  const b = returning(s, { dx: -0x400, speed: (-46) & 0xFF });
  updateBatarangs(s);
  assert.equal(b.speed, (-42) & 0xFF);
});

test('braking stops dead at zero instead of crossing it', () => {
  // $3B55 / $3B44: the carry/borrow out of the +-4 step clamps to zero. This is
  // what keeps the return a single sweep -- accelerating through zero instead
  // turns it into a visible zigzag, because the target row only changes every
  // 16 px while the velocity keeps overshooting.
  const s = makeWorld();
  const b = returning(s, { dx: -0x400, speed: (-3) & 0xFF });
  updateBatarangs(s);
  assert.equal(b.speed, 0, 'not +1');

  const s2 = makeWorld();
  const b2 = returning(s2, { dx: 0x400, speed: 3 });
  updateBatarangs(s2);
  assert.equal(b2.speed, 0, 'not -1');
});

test('accelerating in the direction it already moves is 2 per frame', () => {
  const s = makeWorld();
  const b = returning(s, { dx: -0x400, speed: 10 });   // right, already going right
  updateBatarangs(s);
  assert.equal(b.speed, 12);
});

test('the velocity caps at +-64', () => {
  // $3A9C / $3ABC. Both compares are UNSIGNED, so the negative cap is $C0.
  const s = makeWorld();
  const b = returning(s, { dx: -0x2000, speed: 0x3F });
  updateBatarangs(s);
  assert.equal(b.speed, 0x40);
  updateBatarangs(s);
  assert.equal(b.speed, 0x40, 'held at the cap');

  const s2 = makeWorld();
  const b2 = returning(s2, { dx: 0x2000, speed: 0xC1 });
  updateBatarangs(s2);
  assert.equal(b2.speed, 0xC0);
});

test('the vertical axis brakes the same way', () => {
  // $3B79 / $3B6B, on slot+6. The Y axis reuses the byte that carried the
  // throw-time arc flag.
  const s = makeWorld();
  // Below the target while still moving down: it has to reverse.
  const b = returning(s, { dy: 0x400, arc: 0x40 });
  updateBatarangs(s);
  assert.equal(b.arc, 0x3C, 'braked by 4, not accelerated by 2');
});

// ---------------------------------------------------------------------------
// homing target
// ---------------------------------------------------------------------------

test('the vertical target is one row above the player', () => {
  // $3A78: DEC A. The batarang returns to chest height, not to the origin, so
  // sitting exactly level with the player still pulls it up a row.
  const s = makeWorld();
  const b = returning(s, { arc: 0 });
  b.y = s.player.y;                     // same row as the player
  updateBatarangs(s);
  assert.ok((b.arc & 0x80) !== 0, 'pulled upward');
});

test('a batarang past map column $A0 always steers right', () => {
  // $3AD4: an off-map guard that runs before the player comparison.
  const s = makeWorld();
  const b = returning(s, { speed: 0 });
  b.x = 0xA500;
  updateBatarangs(s);
  assert.equal(b.flags & 0x03, 0x01, 'F_RIGHT');
});

// ---------------------------------------------------------------------------
// the throw itself
// ---------------------------------------------------------------------------

test('holding Down spawns the batarang below the player, Up sets the arc', () => {
  // $19E0 / $1A08.
  const s = makeWorld();
  s.input.held = 0x80;                 // Down
  throwBatarang(s, 0);
  assert.equal(s.batarangs[0].y, (s.player.y + 0x0060) & 0xFFFF);
  assert.equal(s.batarangs[0].arc, 0);

  const s2 = makeWorld();
  s2.input.held = 0x40;                // Up
  throwBatarang(s2, 0);
  assert.equal(s2.batarangs[0].y, (s2.player.y - 0x0040) & 0xFFFF);
  assert.equal(s2.batarangs[0].arc, 0x40);
});

test('the pool holds three and then reports full', () => {
  const s = makeWorld();
  for (let i = 0; i < 3; i++) {
    const slot = findFreeSlot(s.batarangs);
    assert.notEqual(slot, -1);
    throwBatarang(s, slot);
  }
  assert.equal(findFreeSlot(s.batarangs), -1);
});
