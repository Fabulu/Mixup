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

// ---------------------------------------------------------------------------
// The enemy scan -- loc_00_3C17-$3D14, run on every flight frame, outbound and
// returning alike.  Only reachable through updateBatarangs(), which is how the
// ROM reaches it too ($3BE9 falls into it).
// ---------------------------------------------------------------------------

// Camera at the origin, so sub_00_1172 is (world >> 4) + 8 for X and
// ((world & $0FFF) >> 4) + $10 for Y -- the pair $3BD1 caches at +7/+8 and
// $3C36 reads back one instruction later.
const BAT_X = 0x0600, BAT_Y = 0x1500;
const BAT_SX = 0x68, BAT_SY = 0x60;            // 104, 96

/**
 * A live outbound batarang with an enemy whose CACHED +7/+8 sit (dsx, dsy)
 * screen pixels away.
 *
 * speed 4 is chosen so the outbound step ($3B9A: SUB $02) leaves 2 and moves X
 * by 2 SUBpixels -- under the >> 4, so the screen position the hit test sees is
 * exactly the one set up here. The player is parked 80 px away so the catch
 * test at $3C0B can never fire first.
 */
function batScene({ dsx = 0, dsy = 0, st = 1, flags = 0x80, hp = 6 } = {}) {
  const s = makeState(grid(24));
  s.player.x = 0x0100;
  s.player.y = BAT_Y;
  const b = s.batarangs[0];
  b.active = true;
  b.flags = 0x01;                              // outbound, facing right
  b.speed = 4;
  b.arc = 0;
  b.x = BAT_X;
  b.y = BAT_Y;
  const r = s.enemies[0];
  r[0] = flags;
  r[2] = st;
  r[7] = (BAT_SX + dsx) & 0xFF;
  r[8] = (BAT_SY + dsy) & 0xFF;
  r[0x16] = hp;
  return s;
}

/** One flight frame; report what is left of the enemy's HP. */
function flyHp(s) {
  updateBatarangs(s);
  return s.enemies[0][0x16];
}

test('the batarang box is INCLUSIVE, where the melee scan is strict', () => {
  // ROM: sub_00_0C88 tests `CP H / JR Z` BEFORE `JR NC` on both axes, so exact
  // equality passes; loc_00_2643's own compares are bare `JR C` / `JR NC` and
  // equality fails there. Box $1216 = 18 x 22, half-extents, and it is fixed --
  // the batarang does not consult the enemy's own hitbox bytes at all.
  // The two scans read almost identically and sit 600 bytes apart. Do not tidy
  // them into agreement; this pair of tests is the reason not to.
  assert.equal(flyHp(batScene({ dsx: 0x12 })), 5, '18 px hits');
  assert.equal(flyHp(batScene({ dsx: 0x13 })), 6, '19 px does not');
  assert.equal(flyHp(batScene({ dsy: 0x16 })), 5, '22 px hits');
  assert.equal(flyHp(batScene({ dsy: 0x17 })), 6, '23 px does not');
});

test('a hit is 1 damage, a $3C stun and the flash bit -- and never wraps', () => {
  // ROM: loc_00_3CF4-$3D0B. The damage is a single `DEC (HL)` guarded by
  // `AND A / JR Z`, not a SUB: half the melee's 2, and an enemy already at zero
  // stays at zero instead of wrapping to 255 and becoming unkillable.
  const s = batScene({ hp: 6 });
  const r = s.enemies[0];
  updateBatarangs(s);
  assert.equal(r[0x16], 5);
  assert.equal(r[0x17], 0x3C);
  assert.equal(r[0] & 0x04, 0x04);
  assert.deepEqual(s.sound.queue, [{ id: 0x19, mask: 1 }]);

  assert.equal(flyHp(batScene({ hp: 0 })), 0);
});

test('a batarang damages EVERY overlapping enemy in one pass', () => {
  // ROM: the damage arm falls through to loc_00_3D0C, the next slot -- there is
  // no early return anywhere in $3C1B's loop. The melee scan does return from
  // inside its loop ($271F), so one punch is one enemy and one batarang is all
  // of them.
  const s = batScene();
  s.enemies[1].set(s.enemies[0]);
  s.enemies[2].set(s.enemies[0]);
  updateBatarangs(s);
  for (const i of [0, 1, 2]) assert.equal(s.enemies[i][0x16], 5, `slot ${i}`);
});

test('an enemy already flashing takes no second batarang hit', () => {
  // ROM: $3CF4 `BIT 2,(HL) / JR NZ` -- the guard the melee arm does not have.
  // Without it a batarang hovering inside an enemy drains it a point a frame.
  const s = batScene({ hp: 6 });
  assert.equal(flyHp(s), 5);
  assert.equal(flyHp(s), 5, 'still overlapping, still stunned, no second hit');
});

test('states 4, $0B and $0D are immune to a batarang', () => {
  // ROM: $3C79-$3C85. $0B is the enemy projectile: batarangs cannot shoot down
  // incoming fire, and they do not bounce off it either -- the slot is simply
  // skipped, so the batarang flies on unchanged.
  for (const st of [0x04, 0x0B, 0x0D]) {
    const s = batScene({ st });
    assert.equal(flyHp(s), 6, `state $${st.toString(16)}`);
    assert.equal(s.batarangs[0].flags & FLAG_RETURNING, 0, 'still outbound');
  }
});

test('states 2, 7 and $0A are ARMOURED: no damage, they turn, the batarang bounces', () => {
  // ROM: $3C6F-$3C77 -> loc_00_3C8A. Sound $1D instead of $19, no HP change at
  // all, the attack bit 3 and its $1F timer ($3CBD; boss 1 uses $10), the
  // enemy's facing rewritten from the BATARANG's direction bits ($3CC9), and
  // the batarang forced home with $3CD1's `XOR $0F / OR $80` and the fixed
  // $40/$C0 velocity pair.
  for (const st of [0x02, 0x07, 0x0A]) {
    assert.equal(flyHp(batScene({ st })), 6, `state $${st.toString(16)} takes no damage`);
  }

  const s = batScene({ st: 2 });
  const r = s.enemies[0];
  const b = s.batarangs[0];
  updateBatarangs(s);
  assert.equal(r[0] & 0x08, 0x08, 'attack state armed');
  assert.equal(r[0x14], 0x1F);
  assert.equal(r[5], 1, 'turned away from the batarang');
  assert.deepEqual(s.sound.queue, [{ id: 0x1D, mask: 1 }]);

  assert.equal(b.flags, 0x8E, '(1 ^ $0F) | $80 -- returning, with all four axis bits');
  assert.equal(b.speed, 0xC0, 'bit 0 clear -> -64');
  assert.equal(b.arc, 0xC0, 'bit 2 set -> -64');
});

test('a second armoured hit does not re-arm the attack timer', () => {
  // ROM: $3C90 `BIT 3,(HL) / JR NZ, loc_00_3CC4` -- the sound and the bounce
  // still happen, the state change does not.
  const s = batScene({ st: 2 });
  updateBatarangs(s);
  const r = s.enemies[0];
  r[0x14] = 3;                                 // let the timer run down a little
  s.batarangs[0].flags = 0x01;                 // and send the batarang back in
  s.batarangs[0].speed = 4;
  updateBatarangs(s);
  assert.equal(r[0x14], 3, 'timer untouched');
  assert.equal(s.batarangs[0].flags & FLAG_RETURNING, FLAG_RETURNING, 'still bounced');
});
