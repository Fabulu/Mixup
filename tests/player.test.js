// Batman's state machine.
// ROM: bank 0 inline, $1820 horizontal dispatch, sub_00_1D3D accelerate,
//      loc_00_1840 friction, $1A43 jump, $1A63 rising, $1ABB falling,
//      $1B1B floor, loc_00_17EA cling lock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { updatePlayer, BTN, ANIM } from '../src/player.js';
import { i8, u8 } from '../src/state.js';

import {
  makeState, grid, put, fillCol, floorFrom, placePlayer, setInput, step, corridor,
} from './helpers.js';

const GROUNDED = 0, RISING = 1, FALLING = 2;

/**
 * Stand-in $C1C0 tables for the death sequence.
 *
 * Deliberately NOT the cartridge's -- nothing ROM-derived is committed, and
 * these tests are about WHEN the machine does things, not what the sparks look
 * like. The shapes and the one value that matters are real:
 *   deathBurstInit    8 x {flags, ctrLo, ctrHi, X, Y}, all dormant, as 0:$2AD7
 *   deathBurstPath    $114 entries so index $113 -- the parking index -- exists
 *   $22 packs dy = +2, dx = +2, so a slot's position is its own step count and
 *   the arithmetic stays checkable by hand.
 * src/effects.js REFUSES to run without them, which is the point: a missing
 * table has to throw, not silently produce a death with no burst.
 */
const BURST_TABLES = {
  deathBurstSprites: [0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x15, 0x18],
  deathBurstInit: Array.from({ length: 40 }, (_, i) =>
    (i % 5 === 3 ? 0x40 + (i / 5 | 0) * 8 : i % 5 === 4 ? 0x38 : 0)),
  deathBurstPath: new Array(0x114).fill(0x22),
};

/** Player standing on flat ground in an open corridor. */
function ground(patch = {}, opts = {}) {
  const state = makeState(corridor(32, 14), { tables: BURST_TABLES, ...opts });
  placePlayer(state, 5, 13, 0x80, 0x00);
  Object.assign(state.player, { air: GROUNDED, vx: 0, vy: 0, facing: 0 }, patch);
  return state;
}

/** Player in an endless open shaft: nothing to land on, nothing to hit. */
function sky(patch = {}, opts = {}) {
  const state = makeState(grid(32), { tables: BURST_TABLES, ...opts });
  placePlayer(state, 5, 2, 0x80, 0x00);
  Object.assign(state.player, { air: FALLING, vx: 0, vy: 0, facing: 0 }, patch);
  return state;
}

// ---------------------------------------------------------------------------
// joypad bit layout
// ---------------------------------------------------------------------------

test('joypad bits match $FFE1', () => {
  // ROM: the VBlank joypad read at $07CC.
  assert.deepEqual(BTN, {
    A: 0x01, B: 0x02, SELECT: 0x04, START: 0x08,
    RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80,
  });
});

// ---------------------------------------------------------------------------
// 2. accelerate -- three branches, thresholds distinct from the caps
// ---------------------------------------------------------------------------

test('accelerate right arm 1: below the cap, +1 per frame', () => {
  // ROM: $1D62 `CP B / JR C` -- B = $18.
  const state = ground({ vx: 10 });
  setInput(state, BTN.RIGHT);
  step(state);
  assert.equal(state.player.vx, 11);
});

test('accelerate right arm 2: between the cap $18 and the threshold $1A it SNAPS to the cap', () => {
  // ROM: $1D65 `CP $1A / JR C` -> LD A,B. The threshold is NOT the cap.
  for (const [from, to] of [[23, 24], [24, 24]]) {
    const state = ground({ vx: from });
    setInput(state, BTN.RIGHT);
    step(state);
    assert.equal(state.player.vx, to, `vx ${from}`);
  }
});

test('accelerate right arm 3: at or past the threshold $1A it DECAYS by 2', () => {
  // ROM: $1D6A `SUB $02` -- how you bleed off conveyor / knockback overspeed.
  for (const [from, to] of [[25, 24], [40, 39], [60, 59]]) {
    const state = ground({ vx: from });
    setInput(state, BTN.RIGHT);
    step(state);
    assert.equal(state.player.vx, to, `vx ${from}`);
  }
});

test('accelerate left arm 1: above the cap $E8, -1 per frame', () => {
  // ROM: $1D91 `CP B / JR NC` -- B = $E8.
  const state = ground({ vx: -10, facing: 1 });
  setInput(state, BTN.LEFT);
  step(state);
  assert.equal(state.player.vx, -11);
});

test('accelerate left arm 2: between $E8 and $E6 it SNAPS to the cap', () => {
  // ROM: $1D94 `CP $E6 / JR NC` -> LD A,B.
  for (const [from, to] of [[-24, -24], [-25, -24]]) {
    const state = ground({ vx: from, facing: 1 });
    setInput(state, BTN.LEFT);
    step(state);
    assert.equal(state.player.vx, to, `vx ${from}`);
  }
});

test('accelerate left arm 3: past the threshold $E6 it DECAYS by 2', () => {
  // ROM: $1D99 `ADD $02`.
  for (const [from, to] of [[-26, -25], [-40, -39], [-60, -59]]) {
    const state = ground({ vx: from, facing: 1 });
    setInput(state, BTN.LEFT);
    step(state);
    assert.equal(state.player.vx, to, `vx ${from}`);
  }
});

test('the caps and the thresholds really are different numbers', () => {
  // ROM: $01D4C ($18) vs $1D65 ($1A); $01D7B ($E8) vs $1D94 ($E6).
  const state = ground({ vx: 0 });
  setInput(state, BTN.RIGHT);
  step(state, 40);
  assert.equal(state.player.vx, 24, 'right settles on $18, never $1A');

  const left = ground({ vx: 0, facing: 1 });
  setInput(left, BTN.LEFT);
  step(left, 40);
  assert.equal(left.player.vx, -24, 'left settles on $E8, never $E6');
});

test('water halves the walk cap (speed snaps down to +/-8)', () => {
  // ROM: $01D48 / $01D77, selected by $FF95.
  const state = ground({ vx: 10, slowMode: 0x80 });
  setInput(state, BTN.RIGHT);
  step(state);
  assert.equal(state.player.vx, 8);

  const left = ground({ vx: -10, facing: 1, slowMode: 0x80 });
  setInput(left, BTN.LEFT);
  step(left);
  assert.equal(left.player.vx, -8);
});

// ---------------------------------------------------------------------------
// friction, and 3. pressing into your own momentum
// ---------------------------------------------------------------------------

test('grounded with no input bleeds 1 subpx/frame toward zero', () => {
  // ROM: $183B -> loc_00_1840.
  const right = ground({ vx: 10 });
  step(right);
  assert.equal(right.player.vx, 9);

  const left = ground({ vx: -10 });
  step(left);
  assert.equal(left.player.vx, -9);

  const still = ground({ vx: 0 });
  step(still);
  assert.equal(still.player.vx, 0);
});

test('airborne with no input keeps its velocity -- there is no air friction', () => {
  // ROM: $1859 falls straight through to the move.
  const state = sky({ vx: 10 });
  step(state);
  assert.equal(state.player.vx, 10);
});

test('pressing RIGHT while moving LEFT brakes by 1, it does not accelerate', () => {
  // ROM: $1881 `BIT 7,A / JR NZ -> loc_00_1840`.
  const state = ground({ vx: -10 });
  setInput(state, BTN.RIGHT);
  step(state);
  assert.equal(state.player.vx, -9);
  assert.equal(state.player.facing, 0, 'the facing still flips immediately');
});

test('pressing LEFT while moving RIGHT brakes by 1, it does not accelerate', () => {
  // ROM: $18C0.
  const state = ground({ vx: 10 });
  setInput(state, BTN.LEFT);
  step(state);
  assert.equal(state.player.vx, 9);
  assert.equal(state.player.facing, 1);
});

test('braking into your own momentum applies IN THE AIR too, and skips the throttle', () => {
  // ROM: $1881 is reached before sub_00_1D3D, so $FF98 is never touched.
  const state = sky({ vx: -10, airThrottle: 0 });
  setInput(state, BTN.RIGHT);
  step(state);
  assert.equal(state.player.vx, -9);
  assert.equal(state.player.airThrottle, 0, 'friction does not consume the throttle');

  const other = sky({ vx: 10, airThrottle: 0, facing: 1 });
  setInput(other, BTN.LEFT);
  step(other);
  assert.equal(other.player.vx, 9);
  assert.equal(other.player.airThrottle, 0);
});

test('braking takes 10 frames to reverse a -10 velocity, then acceleration starts', () => {
  // ROM: the combined $1881 / $1D3D path -- direction changes are soft.
  const state = ground({ vx: -10 });
  setInput(state, BTN.RIGHT);
  step(state, 10);
  assert.equal(state.player.vx, 0);
  step(state, 1);
  assert.equal(state.player.vx, 1, 'only now does it accelerate');
});

test('a diagonal does not walk: $182D is `AND $F0 / CP $10`, exact match only', () => {
  // ROM: $182D -- Up is the bat-rope and Down the low throw, so diagonals idle.
  const state = ground({ vx: 10 });
  setInput(state, BTN.RIGHT | BTN.UP);
  step(state);
  assert.equal(state.player.vx, 9, 'friction, not acceleration');

  const both = ground({ vx: 10 });
  setInput(both, BTN.RIGHT | BTN.LEFT);
  step(both);
  assert.equal(both.player.vx, 9);
});

test('turning on the ground arms the 15-frame turn stall (animation only)', () => {
  // ROM: loc_00_18A9 -> $FF8F = $0F, anims $14/$13 at $1BAC.
  const state = ground({ vx: 0, facing: 0 });
  setInput(state, BTN.LEFT);
  step(state);
  assert.equal(state.player.facing, 1);
  assert.ok(state.player.turnTimer > 0);
  assert.ok(state.player.anim === ANIM.TURN_A || state.player.anim === ANIM.TURN_B);
  assert.equal(state.player.vx, -1, 'the stall does not block movement');
});

test('turning in the air does not arm the turn stall', () => {
  // ROM: loc_00_18A9 tests $FF80 first.
  const state = sky({ vx: 0, facing: 0, airThrottle: 0 });
  setInput(state, BTN.LEFT);
  step(state);
  assert.equal(state.player.facing, 1);
  assert.equal(state.player.turnTimer, 0);
});

// ---------------------------------------------------------------------------
// 4. air throttle
// ---------------------------------------------------------------------------

test('airborne acceleration happens only every other frame', () => {
  // ROM: $1D4D -- $FF98 is decremented on the skipped frames.
  const state = sky({ vx: 0, airThrottle: 1 });
  setInput(state, BTN.RIGHT);
  const seen = [];
  for (let i = 0; i < 6; i++) { step(state); seen.push(state.player.vx); }
  assert.deepEqual(seen, [0, 1, 1, 2, 2, 3]);
});

test('the air throttle phase is observable: starting at 0 accelerates immediately', () => {
  // ROM: $1D4D -- the phase, not the frame parity, is what matters.
  const state = sky({ vx: 0, airThrottle: 0 });
  setInput(state, BTN.RIGHT);
  const seen = [];
  for (let i = 0; i < 6; i++) { step(state); seen.push(state.player.vx); }
  assert.deepEqual(seen, [1, 1, 2, 2, 3, 3]);
});

test('a jump sets the air throttle to 1, NOT 0', () => {
  // ROM: $1A3F `LD A,$01 / LD ($FF98),A`.
  const state = ground({ airThrottle: 0 });
  setInput(state, BTN.A, BTN.A);
  step(state);
  assert.equal(state.player.air, RISING);
  assert.equal(state.player.airThrottle, 1);
});

test('landing NEVER resets the air throttle', () => {
  // ROM: there is no write to $FF98 anywhere in the loc_00_1B41 landing path.
  for (const throttle of [0, 1]) {
    const state = makeState(corridor(32, 14));
    placePlayer(state, 5, 12, 0x80, 0xF0);
    Object.assign(state.player, { air: FALLING, vy: -40, vx: 0, airThrottle: throttle });
    setInput(state, 0);
    step(state);
    assert.equal(state.player.air, GROUNDED, 'the fixture must actually land');
    assert.equal(state.player.airThrottle, throttle, `throttle ${throttle} survived`);
  }
});

// ---------------------------------------------------------------------------
// 5. gravity
// ---------------------------------------------------------------------------

test('gravity while rising is 1 with A held', () => {
  // ROM: $1A7D -- the variable-height jump.
  const state = sky({ air: RISING, vy: 34 });
  setInput(state, BTN.A);
  step(state);
  assert.equal(state.player.vy, 33);
  assert.equal(state.player.jumpReleased, 0);
});

test('gravity while rising is 2 once A is released, and $FFC2 is set', () => {
  // ROM: $1A6F -> $FFC2 = 1, then $1A79 B = 2.
  const state = sky({ air: RISING, vy: 34 });
  setInput(state, 0);
  step(state);
  assert.equal(state.player.vy, 32);
  assert.equal(state.player.jumpReleased, 1, 'releasing A is what enables the wall jump');
});

test('gravity while rising is 1 in water even with A released', () => {
  // ROM: $1A73 -- $FF95 selects the light value.
  const state = sky({ air: RISING, vy: 34, slowMode: 0x80 });
  setInput(state, 0);
  step(state);
  assert.equal(state.player.vy, 33);
});

test('gravity while falling is 3, whether or not A is held', () => {
  // ROM: $1AF4 -- loc_00_1ABB does not consult A for the gravity value.
  const released = sky({ air: FALLING, vy: 0 });
  setInput(released, 0);
  step(released);
  assert.equal(released.player.vy, -3);

  const held = sky({ air: FALLING, vy: 0 });
  setInput(held, BTN.A);
  step(held);
  assert.equal(held.player.vy, -3);
});

test('the apex frame applies BOTH the rising and the falling gravity', () => {
  // ROM: $1A84 flips $FF80 to 2, but loc_00_1ABB is still reached this frame.
  const state = sky({ air: RISING, vy: 0 });
  setInput(state, 0);
  step(state);
  assert.equal(state.player.air, FALLING);
  assert.equal(state.player.vy, -5, '0 -2 (rising, released) then -3 (falling)');
});

test('in water gravity is applied only 1 frame in 8', () => {
  // ROM: $1AE4 `LD A,($FFB1) / AND $07 / JR NZ`.
  const on = sky({ air: FALLING, vy: 0, slowMode: 0x80 });
  on.frame = 0;
  setInput(on, 0);
  step(on);
  assert.equal(on.player.vy, -2);                 // ROM: $01AF0 waterGravity

  const off = sky({ air: FALLING, vy: 0, slowMode: 0x80 });
  off.frame = 1;
  setInput(off, 0);
  step(off);
  assert.equal(off.player.vy, 0, 'no gravity on the other 7 frames');
});

// ---------------------------------------------------------------------------
// 1. terminal velocity -- an UNSIGNED byte compare
// ---------------------------------------------------------------------------

test('terminal velocity clamps at -66 and never overshoots', () => {
  // ROM: $1AFA `CP C / JR NC` with C = $BE. -66 wraps to the byte $BE, so
  // the comparison is unsigned "not yet at terminal".
  const state = sky({ air: FALLING, vy: 0 });
  setInput(state, 0);
  const seen = [];
  for (let i = 0; i < 40; i++) { step(state); seen.push(state.player.vy); }

  assert.equal(seen[20], -63, 'free fall steps by 3');
  assert.equal(seen[21], -66, 'the step that would reach -66 lands exactly on it');
  assert.equal(seen[39], -66, 'and stays there');
  for (const vy of seen) assert.ok(vy >= -66, `vy ${vy} overshot terminal`);
});

test('terminal velocity clamps rather than stepping past it', () => {
  // ROM: $1AFA -- from -65 the raw step is -68, which must clamp to -66.
  for (const from of [-64, -65, -66]) {
    const state = sky({ air: FALLING, vy: from });
    setInput(state, 0);
    step(state);
    assert.equal(state.player.vy, -66, `from ${from}`);
  }
});

test('the clamp really is unsigned: the compared bytes are $BE-relative', () => {
  // ROM: $1AFB stores $BE, not $C2 (-62) or any signed reading.
  assert.equal(u8(-66), 0xBE);
  assert.equal(i8(0xBE), -66);
  assert.ok(u8(-63) > 0xBE, '-63 is "above terminal" as an unsigned byte');
  assert.ok(u8(-70) < 0xBE, '-70 is "below terminal" as an unsigned byte');
});

test('water terminal velocity is -12', () => {
  // ROM: $01AFF.
  const state = sky({ air: FALLING, vy: 0, slowMode: 0x80 });
  setInput(state, 0);
  for (let i = 0; i < 200; i++) { state.frame = 0; step(state); state.frame = 0; }
  assert.equal(state.player.vy, -12);
});

// ---------------------------------------------------------------------------
// jump
// ---------------------------------------------------------------------------

test('A newly pressed on the ground starts a jump at +$22', () => {
  // ROM: $1A43 -- $FF80 = 1, $FF87 = jumpVelocity, $FFC2 = 0.
  const state = ground({ jumpReleased: 1 });
  setInput(state, BTN.A, BTN.A);
  step(state);
  assert.equal(state.player.air, RISING);
  assert.equal(state.player.vy, 0x22 - 1, 'jump velocity, less one frame of gravity');
  assert.equal(state.player.jumpReleased, 0);
});

test('a jump only starts when grounded, idle-actioned, and A is NEWLY pressed', () => {
  // ROM: $1A43 tests $FFE2, $FF80 and $C71E.
  const held = ground();
  setInput(held, BTN.A, 0);                 // held, not newly pressed
  step(held);
  assert.equal(held.player.air, GROUNDED);

  const airborne = sky({ air: FALLING, vy: 0 });
  setInput(airborne, BTN.A, BTN.A);
  step(airborne);
  assert.equal(airborne.player.air, FALLING, 'no double jump');

  const roping = ground({ action: 1 });
  setInput(roping, BTN.A, BTN.A);
  step(roping);
  assert.equal(roping.player.air, GROUNDED);
});

test('an armed spring jump uses the higher velocity and disarms itself', () => {
  // ROM: $1A4A ($32) selected by $C751, cleared at $1A54.
  const state = ground({ springArmed: 1 });
  setInput(state, BTN.A, BTN.A);
  step(state);
  assert.equal(state.player.vy, 0x32 - 1);
  assert.equal(state.player.springArmed, 0);
});

test('a ceiling stops the rise, snaps down a row and clears the throttle', () => {
  // ROM: loc_00_1A9D -- $1AA7 INC $FF83 / clear $FF84, $1AAF $FF80 = 2,
  // $FF87 = 0, $FF98 = 0.  As at the apex, loc_00_1ABB is still reached on
  // the same frame, so one step of falling gravity lands on top of the snap.
  const g = floorFrom(grid(16), 14);
  for (let c = 0; c < 16; c++) g[3][c] = '#';         // ceiling at map row 3
  const state = makeState(g);
  placePlayer(state, 5, 4, 0x80, 0x80);
  Object.assign(state.player, { air: RISING, vy: 0x22, vx: 0, airThrottle: 1 });
  setInput(state, BTN.A);
  step(state);
  assert.equal(state.player.air, FALLING);
  assert.equal(state.player.airThrottle, 0);
  assert.equal(state.player.y >> 8, 0x15, 'pushed down to the next row');
  assert.equal(state.player.vy, -3, 'the same frame\'s falling gravity applies');
  assert.equal(state.player.y & 0xFF, 3, 'and integrates 3 subpx off the boundary');
});

// ---------------------------------------------------------------------------
// 9. landing
// ---------------------------------------------------------------------------

test('landing snaps the Y low byte to 0, zeroes VelY and clears the cling + jump flags', () => {
  // ROM: loc_00_1E35 ($FF84 = 0, $FF87 = 0) then loc_00_1B41
  //      ($FF80 = 0, $FFB2 = 0, $FFC2 = 0).
  const state = makeState(corridor(32, 14));
  placePlayer(state, 5, 12, 0x80, 0xF0);
  Object.assign(state.player, {
    air: FALLING, vy: -40, vx: 0, clingLock: 0x40, jumpReleased: 1,
  });
  setInput(state, 0);
  step(state);

  const p = state.player;
  assert.equal(p.air, GROUNDED);
  assert.equal(p.y & 0xFF, 0x00);
  assert.equal(p.y >> 8, 0x1D);
  assert.equal(p.vy, 0);
  assert.equal(p.clingLock, 0, 'landing clears the locked direction bits too');
  assert.equal(p.jumpReleased, 0);
  assert.equal(p.squatTimer, 0x10);        // ROM: $1B3D
});

test('landing from the grounded state does not re-arm the squat timer', () => {
  // ROM: $1B36 tests $FF80 before writing $FF90.
  const state = ground();
  setInput(state, 0);
  step(state);
  assert.equal(state.player.squatTimer, 0);
  assert.equal(state.player.air, GROUNDED);
});

test('walking off an edge flips the air state to falling', () => {
  // ROM: $1B4E -- the floor probe missed and $FF80 was 0.
  const g = grid(32);
  for (let c = 0; c < 5; c++) for (let r = 14; r < 16; r++) g[r][c] = '#';
  const state = makeState(g);
  placePlayer(state, 8, 13, 0x80, 0x00);
  Object.assign(state.player, { air: GROUNDED, vx: 0, vy: 0 });
  setInput(state, 0);
  step(state);
  assert.equal(state.player.air, FALLING);
});

// ---------------------------------------------------------------------------
// 8. wall cling -- a 16-frame total freeze
// ---------------------------------------------------------------------------

/** Airborne beside a right-hand wall with A re-held after a release. */
function clingScene() {
  const g = floorFrom(grid(8), 14);
  fillCol(g, 4, '#');
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x80, 0x00);
  Object.assign(state.player, {
    air: FALLING, vy: -10, vx: 0, facing: 0, jumpReleased: 1,
  });
  setInput(state, BTN.A);
  return state;
}

test('the cling frame flips the facing, launches away from the wall, and locks', () => {
  // ROM: loc_00_1F33 -> $1F52 facing, sub_00_1DA0 velocities, $1F56 lock $50.
  const state = clingScene();
  step(state);
  const p = state.player;
  assert.equal(p.facing, 1);
  assert.equal(p.vx, -0x14, 'launched left off a right-hand wall');
  assert.equal(p.vy, 0x22);
  assert.equal(p.air, RISING);
  assert.equal(p.clingLock, 0x50);
});

test('the cling suspends gravity on the cling frame itself', () => {
  // ROM: $17FB/$1AC2 -- vertical() returns before any integration.
  const state = clingScene();
  const y = state.player.y;
  step(state);
  assert.equal(state.player.y, y, 'no Y integration');
  assert.equal(state.player.vy, 0x22, 'the stored jump velocity is untouched');
});

test('the cling freezes position, velocity and gravity for 16 frames total', () => {
  // ROM: loc_00_17EA -- the countdown in $FFB2 bits 0-4 skips the whole update.
  const state = clingScene();
  step(state);                       // frame 1: the cling itself
  step(state);                       // frame 2: the trailing wall push settles
  const p = state.player;
  const snap = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, air: p.air };

  for (let i = 0; i < 14; i++) {     // frames 3..16 are dead still
    step(state);
    assert.deepEqual(
      { x: p.x, y: p.y, vx: p.vx, vy: p.vy, air: p.air }, snap, `frozen frame ${i + 3}`,
    );
  }
  assert.equal(p.clingLock, 0x41, 'one tick of countdown left');

  step(state);                       // frame 17: the lock expires, motion resumes
  assert.equal(p.clingLock & 0x1F, 0);
  assert.notEqual(p.y, snap.y, 'Y integrates again');
  assert.notEqual(p.x, snap.x, 'X integrates again');
  assert.equal(p.vy, 0x22 - 1, 'and only now does gravity bite');
});

test('the lock keeps its top 3 bits after the countdown expires', () => {
  // ROM: $17F1 `AND $E0 / OR (timer-1)` -- the direction bits survive.
  const state = clingScene();
  step(state, 17);
  assert.equal(state.player.clingLock, 0x40);
});

test('the locked direction bits gate input until landing clears them', () => {
  // ROM: loc_00_1806 -- `$FFB2 & $E0` SRL 1 must equal the held d-pad exactly.
  // $40 >> 1 = $20 = LEFT: the direction a right-hand wall jump launched you.
  const blocked = ground({ vx: 0, facing: 1, clingLock: 0x40 });
  setInput(blocked, BTN.RIGHT);
  step(blocked);
  assert.equal(blocked.player.vx, 0, 'RIGHT is ignored while the lock holds');
  assert.equal(blocked.player.facing, 1, 'and the facing does not flip');

  const allowed = ground({ vx: 0, facing: 1, clingLock: 0x40 });
  setInput(allowed, BTN.LEFT);
  step(allowed);
  assert.equal(allowed.player.vx, -1, 'the locked direction still works');

  const free = ground({ vx: 0, facing: 1, clingLock: 0x00 });
  setInput(free, BTN.RIGHT);
  step(free);
  assert.equal(free.player.vx, 1);
  assert.equal(free.player.facing, 0);
});

test('a left-hand wall cling mirrors: lock $30, launched right', () => {
  // ROM: loc_00_1FE9 -> $200D facing, $200F lock $30. $20 >> 1 = $10 = RIGHT.
  const g = floorFrom(grid(8), 14);
  fillCol(g, 2, '#');
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x80, 0x00);
  Object.assign(state.player, {
    air: FALLING, vy: -10, vx: 0, facing: 1, jumpReleased: 1,
  });
  setInput(state, BTN.A);
  step(state);
  assert.equal(state.player.facing, 0);
  assert.equal(state.player.vx, 0x14);
  assert.equal(state.player.clingLock, 0x30);
});

test('landing after a wall jump restores normal steering', () => {
  // ROM: $1B46 -- $FFB2 = 0 clears both the countdown and the direction bits.
  const state = clingScene();
  step(state, 17);
  assert.equal(state.player.clingLock, 0x40);

  // Fall back down to the floor and land.
  setInput(state, 0);
  step(state, 90);
  assert.equal(state.player.air, GROUNDED);
  assert.equal(state.player.clingLock, 0);

  setInput(state, BTN.RIGHT);
  step(state);
  assert.equal(state.player.facing, 0, 'input is accepted again');
});

// ---------------------------------------------------------------------------
// wall resolution through the state machine
// ---------------------------------------------------------------------------

test('running into a wall zeroes VelX', () => {
  // ROM: $189A/$18A3 -- the LEADING probe blocks and clears $FF86.
  const g = floorFrom(grid(16), 14);
  fillCol(g, 8, '#');
  const state = makeState(g);
  placePlayer(state, 5, 13, 0x80, 0x00);
  Object.assign(state.player, { air: GROUNDED, vx: 0, facing: 0 });
  setInput(state, BTN.RIGHT);
  step(state, 60);
  assert.equal(state.player.vx, 0);
  assert.equal(state.player.x >> 8, 7, 'stopped in the column before the wall');
});

test('a standing player next to a wall is positionally stable', () => {
  // ROM: the $1F80 snap is exactly what makes this stable frame after frame.
  const g = floorFrom(grid(16), 14);
  fillCol(g, 6, '#');
  const state = makeState(g);
  placePlayer(state, 5, 13, 0x80, 0x00);
  Object.assign(state.player, { air: GROUNDED, vx: 0 });
  setInput(state, 0);
  step(state);
  const x = state.player.x;
  step(state, 10);
  assert.equal(state.player.x, x);
  assert.equal(x & 0xFF, 0x80);
});

// ---------------------------------------------------------------------------
// carry
// ---------------------------------------------------------------------------

test('a conveyor carry is applied on the frame after the floor probe queued it', () => {
  // ROM: loc_00_170A consumes $C72F/$C730 as the FIRST thing the player update
  // does, and everything that writes them (conveyors, platforms, the bat-rope)
  // runs later in the frame. So a carry is always a frame late, by design --
  // consuming it at the end of the same update would double the conveyor's
  // effective speed on the frame you step on.
  const g = grid(16);
  for (let c = 0; c < 16; c++) g[14][c] = '>';
  const state = makeState(g);
  placePlayer(state, 5, 13, 0x80, 0x00);
  Object.assign(state.player, { air: FALLING, vy: -4, vx: 0 });
  setInput(state, 0);
  const x = state.player.x;

  step(state);
  assert.equal(state.player.x, x, 'not yet -- the probe only queued it');
  assert.equal(state.carry.x, 4, 'queued for next frame');

  step(state);
  assert.equal(state.player.x, x + 4, 'applied at the top of the next update');
});

// ---------------------------------------------------------------------------
// animation ids (they drive the hitbox, master reference §7.4)
// ---------------------------------------------------------------------------

test('animation ids match the oracle-derived mapping', () => {
  // tools/oracle/animmap.mjs; docs/03-VERIFICATION §7.
  assert.deepEqual(ANIM.WALK_CYCLE, [0x00, 0x01, 0x02, 0x03]);
  assert.equal(ANIM.IDLE, 0x06);
  assert.equal(ANIM.LAND, 0x07);
  assert.equal(ANIM.RISING, 0x08);
  assert.equal(ANIM.FALL_START, 0x09);
  assert.equal(ANIM.FALL, 0x0A);
});

test('a changed animation forces a full 3-column repaint', () => {
  // ROM: $1B9x writes $FFC3 and the streamer at sub_00_32D2 reads $FFC5.
  const state = ground({ vx: 0 });
  setInput(state, 0);
  step(state);
  assert.equal(state.player.anim, ANIM.IDLE);
  assert.equal(state.player.animPrev, 0xFF);
  assert.equal(state.player.animFrame, 0);
});

test('the metasprite index equals facing (NOT facing XOR 1)', () => {
  // $1BA3 reads `LDH A,[$FF88] / XOR $01 / LDH [$FF8B],A`, which looks like
  // facing XOR 1 -- but that arm is not the one the walk/idle path takes.
  // tools/oracle/checksprite.py reads the real shadow OAM: facing 0 (right)
  // selects entry 0, whose attr is $30 (X-flipped); facing 1 selects entry 1,
  // attr $10. Getting this backwards draws Batman mirrored for his whole run,
  // and cost ~276 px/frame against the real screen.
  const state = ground({ vx: 0, facing: 0 });
  setInput(state, 0);
  step(state);
  assert.equal(state.player.msIndex, 0, 'facing right -> entry 0 (attr $30)');

  const left = ground({ vx: 0, facing: 1 });
  setInput(left, 0);
  step(left);
  assert.equal(left.player.msIndex, 1, 'facing left -> entry 1 (attr $10)');
});

// ---------------------------------------------------------------------------
// The punch.  ROM: sub_00_201A -- probe mode 5 fired on attack frame 8, then
// the recoil tail at $20A7.  The enemy scan it dispatches to is pinned in
// enemies.test.js; what is pinned here is which cells let the fist through.
// ---------------------------------------------------------------------------

/**
 * One frame before the hit test fires ($1915: the timer steps 7 -> 8), in open
 * air so nothing else in the update moves the player first. `cell` is written
 * where the mode-5 probe lands: 14 px ahead ($2024) and 5 px up ($2032).
 */
function punchScene({ facing = 0, cell = null } = {}) {
  const g = grid(32);
  if (cell) put(g, facing === 0 ? 6 : 4, 12, cell);
  // critWindow 0 keeps the scan on its ordinary 2-damage arm: $26D0 reads rLY
  // mid-frame, so the port's crit is a model and cannot be asserted (docs/03
  // par.28). At frame 0 the model DOES fire, which is worth knowing.
  const state = makeState(g, { tunables: { critWindow: 0 } });
  placePlayer(state, 5, 13, 0x80, 0x00);
  Object.assign(state.player,
                { air: FALLING, vx: 0, vy: 0, facing, attackTimer: 7 });
  setInput(state, 0);
  return state;
}

/** An enemy sitting exactly on the probe point, in the SCREEN space $2430 uses. */
function enemyAtProbe(state) {
  const p = state.player;
  const px = (p.x + (p.facing === 0 ? 0x00E0 : -0x00E0)) & 0xFFFF;
  const py = (p.y - 0x0050) & 0xFFFF;
  const r = state.enemies[0];
  r[0] = 0x80;                                 // active
  r[2] = 1;                                    // walker
  r[7] = ((px >> 4) + 8) & 0xFF;               // sub_00_1172, camera at the origin
  r[8] = (((py & 0x0FFF) >> 4) + 0x10) & 0xFF;
  r[0x0B] = 7; r[0x0C] = 15;                   // the level-3 walker's box
  r[0x16] = 6;
  return r;
}

test('a punch into a wall never reaches the enemy scan -- but water is see-through', () => {
  // ROM: $20EC-$20FD. For mode 5 a non-empty cell IS the answer and $20FD
  // returns it, so an enemy standing inside solid geometry cannot be punched.
  // $20F8 is the single exception: the cell is compared against $08 and water
  // jumps to the empty path at $20FF, which is what makes the enemies wading
  // through the level-1/2 sewers hittable at all.
  const wall = punchScene({ cell: '#' });
  const walled = enemyAtProbe(wall);
  step(wall);
  assert.equal(walled[0x16], 6, 'the cell answered for the whole probe');
  assert.equal(walled[0x17], 0, 'and the scan never ran');
  assert.equal(wall.player.vx, 0, '$2041: a non-door cell goes home without recoil');

  const water = punchScene({ cell: '~' });
  const soaked = enemyAtProbe(water);
  step(water);
  assert.equal(soaked[0x16], 4, 'water counts as empty for the fist');
});

test('a connecting punch recoils the player 4 subpx AWAY from his facing', () => {
  // ROM: $20A7-$20B7, reached only when the probe came back $FF. $FC facing
  // right, $04 facing left -- landing a punch shoves you backwards. MEASURED
  // with the level-3 punch scenario; the earlier port had no recoil at all.
  const right = punchScene();
  enemyAtProbe(right);
  step(right);
  assert.equal(right.player.vx, -4);

  const left = punchScene({ facing: 1 });
  enemyAtProbe(left);
  step(left);
  assert.equal(left.player.vx, 4);
});

test('the recoil is skipped mid bat-rope, and a whiff never reaches it', () => {
  // ROM: $20A7 `LD A,[$C71E] / AND A / RET NZ`, and $203D/$2041 -- only $FF
  // (an enemy) or a cell whose low 5 bits are $1F (a door) gets that far.
  const rope = punchScene();
  enemyAtProbe(rope);
  rope.player.action = 2;                      // rope flight
  step(rope);
  assert.equal(rope.player.vx, 0);

  const whiff = punchScene();                  // no enemy, empty cell
  step(whiff);
  assert.equal(whiff.player.vx, 0);
});

// ---------------------------------------------------------------------------
// Death.  ROM: loc_00_1755 (the pit), loc_00_17B6 (hp), sub_00_29E7 (the
// sequence itself).  Two separate tests at two different points of the update,
// with different rules -- they are not variants of one death check.
// ---------------------------------------------------------------------------

test('the pit test runs at the TOP of the update and eats the rest of the frame', () => {
  // ROM: $1755 sits ahead of the knockback block, and $1773 is a JP into
  // sub_00_29E7, not a CALL -- input, movement, gravity and anim select never
  // run on the death frame. Testing after vertical() instead reaches the death
  // row one frame early (MEASURED: level-3 pit, the port's f117 against the
  // cartridge's f118).
  const state = sky({ vx: -2, vy: -66 });
  state.player.y = 0x2100;                     // $FF83 = $21, the death row
  const { x, y } = state.player;
  step(state);

  assert.equal(state.player.dead, 1);
  assert.equal(state.player.hp, 0);            // $176C
  assert.equal(state.player.action, 0);        // $1769
  assert.equal(state.player.y, y, 'no gravity, no integration');
  assert.equal(state.player.x, x);
  assert.equal(state.deathTimer, 120);         // $2A00: $78
  // $2A05 is `LD BC,$0903` -- id $09 on channel mask $03. The port queues mask
  // $01, so only the id is asserted here; see the report.
  assert.equal(state.sound.queue.at(-1).id, 0x09);
});

test('sub_00_29E7 does NOT zero VelX or VelY', () => {
  // ROM: $29E7-$2A0B copies the $C1C0 particle table, writes $C715 and $C712
  // and queues the jingle. It never touches $FF86/$FF87. MEASURED: a pit death
  // mid-fall keeps vx = -2 and vy = -66 frozen in the trace for the whole
  // sequence. Zeroing them here was a port invention, and it diverged from the
  // frame after the death onwards.
  const state = sky({ vx: -2, vy: -66 });
  state.player.y = 0x2100;
  step(state);
  assert.equal(state.player.vx, -2);
  assert.equal(state.player.vy, -66);

  step(state, 10);
  assert.equal(state.player.vx, -2, 'and the sequence never touches them either');
  assert.equal(state.player.vy, -66);
  // $C712 is NOT a per-frame timer. loc_00_2A0D only decrements it from the
  // $2A89 arm, and only for SLOT 7 -- which has not even armed yet at f10.
  // MEASURED: it sits at $78 for 332 frames and then runs down in 120 more.
  assert.equal(state.deathTimer, 120, 'nothing has touched $C712 yet');
});

test('level $0B dies a metatile and a half higher than everywhere else', () => {
  // ROM: $1756 -- $FFB0 == $0B takes the `CP $1B` arm instead of `CP $21`.
  // Its floor really is higher up; sharing the row lets you fall through it.
  const deep = makeState(grid(8), { level: 0x0B, tables: BURST_TABLES });
  placePlayer(deep, 3, 0, 0x80, 0x00);
  deep.player.y = 0x1B00;
  step(deep);
  assert.equal(deep.player.dead, 1);

  const other = makeState(grid(8), { tables: BURST_TABLES });
  placePlayer(other, 3, 0, 0x80, 0x00);
  other.player.y = 0x1B00;
  step(other);
  assert.equal(other.player.dead, 0, 'the same row is survivable elsewhere');
});

test('empty hp does NOT kill an airborne player -- unless he is in rope flight', () => {
  // ROM: $17C4-$17CE, a gate the pit arm does not have. The fatal hit's own
  // knockback sets $FF80 = 1 ($179A), so the launch always plays out and the
  // death starts from the landing. $C71E == 2 is the one airborne state that
  // dies where it is.
  const airborne = sky();
  airborne.player.hp = 0;
  step(airborne);
  assert.equal(airborne.player.dead, 0);

  const rope = sky({ action: 2 });
  rope.player.hp = 0;
  step(rope);
  assert.equal(rope.player.dead, 1);
  assert.equal(rope.player.action, 0, '$17DF clears the action');

  const grounded = ground();
  grounded.player.hp = 0;
  step(grounded);
  assert.equal(grounded.player.dead, 1);
});

test('the hp death sits AFTER the knockback, so the killing blow still throws you', () => {
  // ROM: $1776 knockback, then $17B6 death -- and the knockback writes the very
  // byte the death test reads two instructions later ($1798 `LD A,$01 /
  // LDH [$FF80],A`). So the frame that empties the energy bar launches instead
  // of killing. Run the death test first and the throw is lost entirely.
  const state = ground();
  state.player.hp = 0;
  state.player.iframes = 0x5A;                 // a fresh stamp, thrown right
  step(state);
  assert.equal(state.player.air, RISING, 'the knockback ran');
  assert.equal(state.player.vx, 16);
  assert.equal(state.player.dead, 0, 'and the death did not');
});
