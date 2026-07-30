// Camera.  ROM: sub_00_121F, called per frame from the main loop at $05B7.
//
// sub_00_104E is the INIT-ONLY variant ($0557 / $2845) and differs in three
// ways: it masks the low byte with $F0, uses `SUB $15` for the Y follow, and
// tests $1D. Every test here pins the per-frame routine's behaviour instead.

import test from 'node:test';
import assert from 'node:assert/strict';

import { updateCamera, cameraPixels } from '../src/camera.js';
import { createState } from '../src/state.js';

/** Bare state -- updateCamera reads no map data. */
function cam({ x = 0, y = 0, level = 1, bossId = 0, clampRight = 100 } = {}) {
  const state = createState();
  state.player.x = x;
  state.player.y = y;
  state.level.number = level;
  state.level.bossId = bossId;
  state.camera.clampRight = clampRight;
  return state;
}

const at = (metatile, lowByte = 0x00) => ((metatile & 0xFF) << 8) | (lowByte & 0xFF);

// ---------------------------------------------------------------------------
// X  ($121F-$1249)
// ---------------------------------------------------------------------------

test('camera X: the left clamp pins to metatile 1 below column 6', () => {
  // ROM: $122C `CP $06 / JR C` -> $0105C cameraClampLeft.
  for (const col of [0, 1, 5]) {
    const state = cam({ x: at(col, 0x77) });
    updateCamera(state);
    assert.equal(state.camera.x, 0x0100, `col ${col}`);
  }
});

test('camera X: from column 6 it follows with a 5-metatile lead', () => {
  // ROM: $1244 `SUB $05` -> $01052 cameraLeadX.
  const state = cam({ x: at(20, 0x37) });
  updateCamera(state);
  assert.equal(state.camera.x >> 8, 15);
});

test('camera X: the low byte is copied straight through, NOT masked with $F0', () => {
  // ROM: $1244. sub_00_104E is the one that masks -- using it here produces a
  // camera that judders by up to 15 subpixels.
  for (const lo of [0x00, 0x0F, 0x37, 0xFF]) {
    const state = cam({ x: at(20, lo) });
    updateCamera(state);
    assert.equal(state.camera.x & 0xFF, lo, `low byte ${lo}`);
  }
});

test('camera X: boundary at column 6', () => {
  // ROM: $122C is `JR C`, so column 6 itself already follows.
  const below = cam({ x: at(5, 0x40) });
  updateCamera(below);
  assert.equal(below.camera.x, 0x0100);

  const on = cam({ x: at(6, 0x40) });
  updateCamera(on);
  assert.equal(on.camera.x, at(1, 0x40));
});

test('camera X: the right clamp is $C732 - 5, and the pinned value is 10 back', () => {
  // ROM: $1238 `CP B / JR C` with B = clamp-5, then $123E `SUB $05` again.
  const state = cam({ x: at(95, 0x40), clampRight: 100 });
  updateCamera(state);
  assert.equal(state.camera.x, at(90, 0x00), 'pinned, and the low byte is dropped');

  const inside = cam({ x: at(94, 0x40), clampRight: 100 });
  updateCamera(inside);
  assert.equal(inside.camera.x, at(89, 0x40), 'still following one column earlier');
});

test('camera X: the right clamp holds for every column past it', () => {
  // ROM: $1238.
  for (const col of [95, 110, 200]) {
    const state = cam({ x: at(col, 0x40), clampRight: 100 });
    updateCamera(state);
    assert.equal(state.camera.x, at(90), `col ${col}`);
  }
});

test('camera X: the clamp arithmetic wraps in 8 bits', () => {
  // ROM: $1233 is `SUB $05` on A, with no 16-bit widening.
  // clamp $02 -> ($02-$05)&$FF = $FD; a column at or past $FD then pins to
  // ($FD-$05)&$FF = $F8.
  const state = cam({ x: at(254, 0x40), clampRight: 2 });
  updateCamera(state);
  assert.equal(state.camera.x, at(0xF8), 'pinned at the wrapped clamp');

  const under = cam({ x: at(250, 0x40), clampRight: 2 });
  updateCamera(under);
  assert.equal(under.camera.x, at(245, 0x40), 'still below the wrapped clamp');
});

// ---------------------------------------------------------------------------
// Y  ($124A-$1286)
// ---------------------------------------------------------------------------

test('camera Y: level 6 pins the camera low', () => {
  // ROM: $1279 -- level 6 is the vertical vehicle stage.
  const state = cam({ level: 0x06, y: at(0x10) });
  updateCamera(state);
  assert.equal(state.camera.y, at(0x17));
});

test('camera Y: any boss level ($C73E != 0) pins the camera low', () => {
  // ROM: $1279 via $C73E, the low nibble of 0:$1015 (1-4 boss, 5 vehicle).
  for (const bossId of [1, 2, 3, 4, 5]) {
    const state = cam({ level: 3, bossId, y: at(0x10) });
    updateCamera(state);
    assert.equal(state.camera.y, at(0x17), `bossId ${bossId}`);
  }
});

test('camera Y: levels 9, $A and $B pin the camera to the top', () => {
  // ROM: $126D -- the parallax levels.
  for (const level of [0x09, 0x0A, 0x0B]) {
    const state = cam({ level, y: at(0x1A, 0x33) });
    updateCamera(state);
    assert.equal(state.camera.y, at(0x10), `level ${level}`);
  }
});

test('camera Y: above row $15 it sits at the top', () => {
  // ROM: $1269 `CP $15 / JR C`.
  for (const row of [0x10, 0x14]) {
    const state = cam({ y: at(row, 0x88) });
    updateCamera(state);
    assert.equal(state.camera.y, at(0x10), `row ${row}`);
  }
});

test('camera Y: in the follow window it is `SUB $05` with an UNMASKED low byte', () => {
  // ROM: $1281. sub_00_104E uses SUB $15 and masks -- translating that one
  // produces a camera that is wrong the moment the player descends.
  const state = cam({ y: at(0x15, 0x27) });
  updateCamera(state);
  assert.equal(state.camera.y, at(0x10, 0x27));

  const deeper = cam({ y: at(0x1B, 0xC3) });
  updateCamera(deeper);
  assert.equal(deeper.camera.y, at(0x16, 0xC3));
});

test('camera Y: the follow window ends at $1C, not $1D', () => {
  // ROM: $1275 `CP $1C / JR C`. sub_00_104E is the one that tests $1D.
  const inside = cam({ y: at(0x1B, 0x40) });
  updateCamera(inside);
  assert.equal(inside.camera.y, at(0x16, 0x40));

  const outside = cam({ y: at(0x1C, 0x40) });
  updateCamera(outside);
  assert.equal(outside.camera.y, at(0x17), 'pinned low, low byte dropped');
});

test('camera Y: below the window it pins low', () => {
  // ROM: $1285.
  for (const row of [0x1C, 0x1F, 0x21]) {
    const state = cam({ y: at(row, 0x40) });
    updateCamera(state);
    assert.equal(state.camera.y, at(0x17), `row ${row}`);
  }
});

test('camera Y: the level checks take priority over the follow window', () => {
  // ROM: the $124A dispatch runs before $1269.
  const boss = cam({ level: 3, bossId: 1, y: at(0x10) });
  updateCamera(boss);
  assert.equal(boss.camera.y, at(0x17), 'a boss level pins low even at the top');

  const parallax = cam({ level: 0x0A, y: at(0x1F) });
  updateCamera(parallax);
  assert.equal(parallax.camera.y, at(0x10), 'a parallax level pins high even at the bottom');
});

test('camera Y: a bare createState() does NOT spuriously take the boss branch', () => {
  // Regression guard. createState() used to leave level.bossId undefined, and
  // camera.js tests `bossId !== 0` -- so `undefined !== 0` pinned the camera to
  // $1700 for any state not built by initLevel(). bossId now defaults to 0.
  const state = createState();
  state.player.y = at(0x10);
  state.level.number = 1;
  updateCamera(state);
  assert.equal(state.camera.y, at(0x10), 'player above $15 pins the camera high, not low');
});

test('updateCamera never touches the player', () => {
  // ROM: sub_00_121F only writes $FFA2-$FFA5.
  const state = cam({ x: at(20, 0x37), y: at(0x18, 0x11) });
  const before = { ...state.player };
  updateCamera(state);
  assert.deepEqual({ ...state.player }, before);
});

test('updateCamera is idempotent for a fixed player position', () => {
  // Determinism guard: it is a pure function of position + level.
  const state = cam({ x: at(20, 0x37), y: at(0x18, 0x11) });
  updateCamera(state);
  const first = { ...state.camera };
  updateCamera(state);
  assert.deepEqual({ ...state.camera }, first);
});

// ---------------------------------------------------------------------------
// cameraPixels
// ---------------------------------------------------------------------------

test('cameraPixels converts 12.4 to pixels and removes the $10-row Y bias', () => {
  // The player's Y hi runs $10-$20 (master reference §4); both axes carry the
  // same bias, so Y has 256 px subtracted.
  const state = cam({ x: at(20, 0x37), y: at(0x18, 0x11) });
  updateCamera(state);
  assert.deepEqual(cameraPixels(state), {
    x: 0x0F37 >> 4,
    y: (0x1311 >> 4) - 0x100,
  });
});

test('cameraPixels at the top of the world is Y = 0', () => {
  // camera.y = $1000 -> 256 px -> 0 after the bias.
  const state = cam({ y: at(0x10) });
  updateCamera(state);
  assert.equal(cameraPixels(state).y, 0);
});

test('cameraPixels at the low pin is Y = 112 px', () => {
  // camera.y = $1700 -> 368 px -> 112 after the bias (7 metatiles down).
  const state = cam({ y: at(0x1F) });
  updateCamera(state);
  assert.equal(cameraPixels(state).y, 0x70);
});

test('cameraPixels X at the left clamp is 16 px', () => {
  const state = cam({ x: at(0) });
  updateCamera(state);
  assert.equal(cameraPixels(state).x, 16);
});
