// Bat-rope.  ROM: loc_00_1944, loc_00_3D5F, loc_01_4072.
//
// The frame-by-frame proof lives in the oracle corpus (rope-fire-and-swing and
// rope-release-launch, both bit-exact over 320 frames). These cover the pieces
// that a single input script cannot reach, and the arithmetic quirks that took
// two rounds against the ROM to get right.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';
import { startRope, updateRope } from '../src/rope.js';
import { makeState, grid } from './helpers.js';

/** Metasprite ids the rope draws; only their presence matters here. */
/**
 * The chain's metasprite ids. Synthetic, and declared HERE rather than read
 * from assets/ -- this suite runs without the ROM. They only have to be
 * distinguishable and to exist in fakeManifest below; whether the shipped ids
 * are the right ROM ids is settled by check_tables in tools/verify_assets.py.
 */
const ROPE_FIXTURE = {
  ropeLinks: [0x30, 0x31, 0x32, 0x33, 0x34, 0x34, 0x33, 0x32, 0x31, 0x30],
  ropeHooks: [0x35, 0x36],
};

function fakeManifest() {
  const table1 = [];
  for (const id of [...ROPE_FIXTURE.ropeLinks, ...ROPE_FIXTURE.ropeHooks]) {
    table1[id] = { sprites: [[0, 0, id, 0]] };
  }
  return { metasprites: { table1 } };
}

/** An open shaft with a solid ceiling `up` metatiles above the player. */
function makeShaft(ceilRow) {
  const g = grid(16);
  for (let c = 0; c < 16; c++) {
    g[14][c] = '#';
    if (ceilRow !== undefined) g[ceilRow][c] = '#';
  }
  const state = makeState(g, { tables: ROPE_FIXTURE });
  state.player.x = 5 * 0x100 + 0x80;
  state.player.y = 13 * 0x100;
  return state;
}

const MF = fakeManifest();

// ---------------------------------------------------------------------------
// arming
// ---------------------------------------------------------------------------

test('arming seeds the hand from the player, asymmetrically by facing', () => {
  // $196F/$1974: +4 px facing right but -12 px facing left, because the
  // player's origin sits at the left edge of the sprite rather than its centre.
  for (const [facing, dx] of [[0, 0x0040], [1, -0x00C0]]) {
    const s = makeShaft();
    s.player.facing = facing;
    const { x, y } = s.player;
    startRope(s);
    assert.equal(s.rope.slots[5].x, (x + dx) & 0xFFFF);
    assert.equal(s.rope.slots[5].y, (y - 0x0140) & 0xFFFF);   // $1984
    assert.equal(s.player.action, 1);
    assert.equal(s.player.ropeSegments, 5);
  }
});

// ---------------------------------------------------------------------------
// extension
// ---------------------------------------------------------------------------

test('the rope extends one link every other frame', () => {
  // $3D80: $C721 gates every second frame, so five links take ten frames.
  const s = makeShaft();
  startRope(s);
  const seen = [];
  for (let i = 0; i < 12; i++) { updateRope(s, MF); seen.push(s.player.ropeSegments); }
  assert.deepEqual(seen.slice(0, 10), [5, 4, 4, 3, 3, 2, 2, 1, 1, 0]);
});

test('running out of segments retracts instead of hanging', () => {
  // $3D8D: the SUB borrows past zero -> state 3, which reels back in one link
  // per frame and then clears. Nothing to bite means nothing happens, not a
  // rope stuck out forever.
  const s = makeShaft();
  startRope(s);
  for (let i = 0; i < 40; i++) updateRope(s, MF);
  assert.equal(s.player.action, 0, 'the rope is gone');
});

test('the rope bites solid ground and starts swinging', () => {
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  assert.equal(s.player.action, 2);
  assert.equal(s.player.ropeLength, 1, 'the biting frame swings immediately');
});

test('collision values 0 and 7 are not anchors', () => {
  // $3DE9/$3DEC: empty space and collision 7 read straight through.
  const g = grid(16);
  for (let c = 0; c < 16; c++) { g[14][c] = '#'; g[11][c] = 'S'; }   // 'S' -> 7
  const s = makeState(g, { tables: ROPE_FIXTURE });
  s.player.x = 5 * 0x100 + 0x80;
  s.player.y = 13 * 0x100;
  startRope(s);
  for (let i = 0; i < 40; i++) updateRope(s, MF);
  assert.equal(s.player.action, 0, 'passed through and retracted');
});

// ---------------------------------------------------------------------------
// the swing
// ---------------------------------------------------------------------------

test('the swing carries the player, scaled further out than the links', () => {
  // $3EC9: the multiplier is the distance from the anchor -- 1 for the anchor
  // itself, then 2, 3, ... outward -- and the player rides the last step as a
  // platform carry rather than as a velocity.
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  assert.equal(s.player.action, 2);

  s.carry.y = 0;
  updateRope(s, MF);
  assert.notEqual(s.carry.y, 0, 'the player is being pulled along');
});

test('a swing turns around every 50 phase steps, pausing two frames', () => {
  // $4188 ends the phase at $32; $419D then spends one frame noticing and one
  // acting. The `XOR A` at $41B0 lands in $C720 as well as $C71F, so the
  // counter resets -- every turn costs the same two frames, not just the first.
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  const facing0 = s.player.facing;

  // Stand in for the player update, which consumes the carry at the top of
  // every frame ($1738). Leave it in place and the guard at $3F80 sees its own
  // previous write once the swing turns upward, and releases the rope.
  const states = [];
  for (let i = 0; i < 120; i++) {
    s.carry.x = 0; s.carry.y = 0;
    updateRope(s, MF);
    states.push(s.player.action);
  }

  assert.ok(states.includes(4), 'the pause at the extreme is a real state');
  assert.equal(s.rope.flip, 0, 'the counter resets on every turn');
  // 50 phase steps + 2 turn frames, so the facing flips at least twice in 120.
  assert.equal(s.player.facing, facing0);
});

// ---------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------

test('A releases the rope', () => {
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  s.input.pressed = 0x01;
  updateRope(s, MF);
  assert.equal(s.player.action, 0);
});

test('releasing before the bottom of the arc gives no upward kick', () => {
  // $401B: the Y table is positive for the first half of the swing, and the
  // launch only applies a rise when it is NEGATIVE. Let go early and you get
  // the horizontal throw and keep falling.
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  s.player.ropeLength = 5;                 // still on the way down
  s.player.air = 2;
  s.input.pressed = 0x01;
  updateRope(s, MF);
  assert.equal(s.player.air, 2, 'still falling');
  assert.equal(s.player.vy, 0);
});

test('releasing past the bottom of the arc launches upward', () => {
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  s.player.ropeLength = 35;                // Y table is negative here
  s.player.air = 2;
  s.input.pressed = 0x01;
  updateRope(s, MF);
  assert.equal(s.player.air, 1, 'rising');
  assert.ok(s.player.vy > 0, 'with real upward speed');
});

// ---------------------------------------------------------------------------
// interaction with the rest of the player machine
// ---------------------------------------------------------------------------

test('an inactive rope costs nothing', () => {
  const s = makeShaft();
  s.video.sprites.length = 0;
  updateRope(s, MF);
  assert.equal(s.video.sprites.length, 0);
});

test('pausing freezes the swing but still draws it', () => {
  // $3D69 / $4183: the draw runs, the phase does not.
  const s = makeShaft(11);
  startRope(s);
  for (let i = 0; i < 12 && s.player.action === 1; i++) updateRope(s, MF);
  const ph = s.player.ropeLength;

  s.flow.paused = true;
  s.video.sprites.length = 0;
  updateRope(s, MF);
  assert.equal(s.player.ropeLength, ph, 'frozen');
  assert.ok(s.video.sprites.length > 0, 'still on screen');
});
