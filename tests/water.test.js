// The level-1/2 water-surface subsystem -- src/water.js.
// ROM: sub_00_2CBE -> loc_00_2D3D, splash pool 1:$7A83/$7A99/$7AD3.
// Synthetic maps only; the oracle scenarios l1-water-spouts and
// l1-water-rising-hits carry the frame-exact proof.
// Run: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { grid, makeState, placePlayer } from './helpers.js';
import { updateWater, updateSplashes, applyWaterArt, tickWaterArt }
  from '../src/water.js';
import { mapCollision, mapTile } from '../src/state.js';

/** A wide-enough level-1 state (the waterfall stamps columns $37/$38). */
function waterState(opts = {}) {
  const state = makeState(grid(64), opts);
  state.frame = 0x6E;            // an EVEN $FFB1 -- the logic runs
  return state;
}

function sounds(state) {
  return state.sound.queue.map((s) => s.id);
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

test('odd $FFB1 frames do nothing at all', () => {
  // ROM: $2D5D -- odd frames only park the window register, no logic.
  const state = waterState();
  placePlayer(state, 0x40, 12);
  state.frame = 0x6D;                          // odd
  updateWater(state);
  assert.equal(state.water.level, 0x1F00);
  assert.equal(state.water.stampStep, 0);
  assert.equal(state.water.windowY, 0);        // the $C755 latch is untouched
  assert.equal(sounds(state).length, 0);
});

test('levels other than 1 and 2 have no water body', () => {
  // ROM: $2CC3-$2CE4 dispatches levels 6/7/$0B/$0C/$0D elsewhere.
  const state = waterState({ level: 5 });
  placePlayer(state, 0x40, 12);
  updateWater(state);
  assert.equal(state.water.level, 0x1F00);
  assert.equal(state.player.slowMode, 0);
});

// ---------------------------------------------------------------------------
// The waterfall trigger and column stamp -- $2D6F-$2DDB
// ---------------------------------------------------------------------------

test('the trigger arms only once the player passes column $36', () => {
  const state = waterState();
  placePlayer(state, 0x35, 12);
  updateWater(state);
  assert.equal(state.water.stampStep, 0);      // $2D77: still idle
  assert.equal(state.player.slowMode, 0);      // but the tail ran

  placePlayer(state, 0x36, 12);
  state.frame = 0x70;
  updateWater(state);
  assert.equal(state.water.stampStep, 2);      // $2D9B + the entry-0 stamp
  assert.ok(sounds(state).includes(0x17));     // $2D7C
});

test('the column builds one cell per even frame and skips the tail while doing so', () => {
  const state = waterState();
  placePlayer(state, 0x40, 12);
  // Force the player DEEP so the tail, if it ran, would arm slow mode.
  state.player.y = 0x1F00;
  for (let f = 0; f < 6; f++) {
    updateWater(state);
    state.frame = (state.frame + 2) & 0xFF;
    // $2DDB: stamp frames RET before the player check.
    if (state.water.phase === 0) assert.equal(state.player.slowMode, 0);
  }
  // Entries 0-5 stamped ($2DDC table): col $38 row $19 is SOLID graphic $48,
  // col $37 rows $19-$1C are WATER graphic $49/$47.
  assert.equal(mapTile(state, 0x38, 9), 0x48);
  assert.equal(mapCollision(state, 0x38, 9), 0x01);
  assert.equal(mapTile(state, 0x37, 9), 0x49);
  assert.equal(mapCollision(state, 0x37, 9), 0x08);
  assert.equal(mapCollision(state, 0x37, 0x0C), 0x08);
  assert.equal(state.water.stampStep, 7);
  assert.equal(state.water.phase, 0);

  // The 7th stamp: $2DD1 flips to phase 1, $C713 is never stored as 8, and
  // the tail RUNS this frame (the deep player picks up slow mode).
  updateWater(state);
  assert.equal(mapCollision(state, 0x37, 0x0E), 0x01);   // rows $1D/$1E solid
  assert.equal(state.water.stampStep, 7);
  assert.equal(state.water.phase, 1);
  assert.equal(state.player.slowMode, 0x80);
});

// ---------------------------------------------------------------------------
// The surface level -- $2DF8-$2E35
// ---------------------------------------------------------------------------

test('phase 1 rises 8/frame and flips to phase 2 below row $16', () => {
  const state = waterState();
  placePlayer(state, 0x10, 2);
  state.water.phase = 1;
  state.water.level = 0x1608;
  updateWater(state);
  assert.equal(state.water.level, 0x1600);     // $2E00: BC = $FFF8
  assert.equal(state.water.phase, 1);          // hi $16 is still >= $16
  state.frame += 2;
  updateWater(state);
  assert.equal(state.water.level, 0x15F8);
  assert.equal(state.water.phase, 2);          // $2E0C: hi dropped below $16
});

test('phase 2 falls and, at the bottom, parks iff the player is past column $5A', () => {
  const state = waterState();
  state.water.phase = 2;
  state.water.level = 0x1EF8;
  placePlayer(state, 0x59, 2);
  updateWater(state);
  assert.equal(state.water.level, 0x1F00);
  assert.equal(state.water.phase, 1);          // $2E31: < $5A -- another cycle

  const parked = waterState();
  parked.water.phase = 2;
  parked.water.level = 0x1EF8;
  placePlayer(parked, 0x5A, 2);
  updateWater(parked);
  assert.equal(parked.water.phase, 0xFF);      // $2E2D: parked forever
  parked.frame += 2;
  updateWater(parked);
  assert.equal(parked.water.level, 0x1F00);    // $2DFC: phase $FF holds still
});

// ---------------------------------------------------------------------------
// The player check -- $2E6A-$2E9B
// ---------------------------------------------------------------------------

test('submersion is a HIGH-BYTE row compare: slow mode, then 1 damage + $5A', () => {
  const state = waterState();
  state.water.phase = 0xFF;
  state.water.level = 0x1B40;                  // surface inside world row $1B
  placePlayer(state, 0x10, 0x0A);              // world row $1A -- above
  state.player.slowMode = 0x80;
  updateWater(state);
  assert.equal(state.player.slowMode, 0);      // $2E99
  assert.equal(state.player.hp, 10);

  placePlayer(state, 0x10, 0x0B);              // world row $1B == surface row
  state.frame += 2;
  updateWater(state);
  assert.equal(state.player.slowMode, 0x80);   // $2E7D: equal row counts as in
  assert.equal(state.player.hp, 9);            // $2E8D: 1 damage
  assert.equal(state.player.iframes, 0x5A);    // $2E92: knockback stamp, no
  assert.ok(sounds(state).includes(0x12));     //        facing test -- always $5A
});

test('difficulty 0 water never hurts; running iframes suppress the hit', () => {
  const state = waterState();
  state.flow.difficulty = 0;                   // $2E81: $C756
  state.water.phase = 0xFF;
  state.water.level = 0x1B00;
  placePlayer(state, 0x10, 0x0C);              // below the surface
  updateWater(state);
  assert.equal(state.player.slowMode, 0x80);   // still wet, still slow
  assert.equal(state.player.hp, 10);

  const s2 = waterState();
  s2.water.phase = 0xFF;
  s2.water.level = 0x1B00;
  placePlayer(s2, 0x10, 0x0C);
  s2.player.iframes = 3;                       // $2E8B
  updateWater(s2);
  assert.equal(s2.player.hp, 10);
  assert.equal(s2.player.iframes, 3);
});

test('the entry splash fires on the exact surface row, airborne only, slot 0 only', () => {
  const state = waterState();
  state.water.phase = 0xFF;
  state.water.level = 0x1B00;
  state.flow.difficulty = 0;
  placePlayer(state, 0x10, 0x0B);
  state.player.air = 2;                        // $2E75: falling in
  updateWater(state);
  assert.equal(state.water.splashes[0].timer, 0x17);   // 1:$7A8F
  assert.equal(state.water.splashes[0].x, state.player.x);
  assert.ok(sounds(state).includes(0x25));

  // A running slot-0 splash suppresses both the re-arm and the sound.
  state.water.splashes[0].timer = 5;
  state.sound.queue.length = 0;
  state.frame += 2;
  updateWater(state);
  assert.equal(state.water.splashes[0].timer, 5);      // 1:$7A86
  assert.equal(sounds(state).length, 0);

  // One row deeper: no splash, ever ($2E73 tests equality, not >=).
  const s2 = waterState();
  s2.water.phase = 0xFF;
  s2.water.level = 0x1B00;
  s2.flow.difficulty = 0;
  placePlayer(s2, 0x10, 0x0C);
  s2.player.air = 2;
  updateWater(s2);
  assert.equal(s2.water.splashes[0].timer, 0);
});

// ---------------------------------------------------------------------------
// The enemy sweep -- $2E9C-$2EF3
// ---------------------------------------------------------------------------

/** An active walker at a world row, for the sweep tests. */
function dunkEnemy(state, slot, worldRow, ylo = 0, flags = 0x82) {
  const r = state.enemies[slot];
  r.fill(0);
  r[0] = flags;                                // active (+ falling by default)
  r[0x0E] = 0x11; r[0x0F] = 0x80;
  r[0x10] = worldRow; r[0x11] = ylo;
  return r;
}

test('enemies below the surface gain the slow-fall bit, above lose it', () => {
  const state = waterState();
  state.water.phase = 0xFF;
  state.water.level = 0x1B00;
  placePlayer(state, 0x30, 2);
  const below = dunkEnemy(state, 0, 0x1C);
  const above = dunkEnemy(state, 1, 0x1A);
  above[1] = 0x02;                             // stale slow-fall bit
  updateWater(state);
  assert.equal(below[1] & 0x02, 0x02);         // $2EEB: SET 1
  assert.equal(above[1] & 0x02, 0);            // $2EDA: RES 1
});

test('the surface splash is a one-shot on the top row, moving enemies only', () => {
  const state = waterState();
  state.water.phase = 0xFF;
  state.water.level = 0x1B00;
  placePlayer(state, 0x30, 2);
  // Within $10 packed units of the surface AND vertically moving: splash into
  // slot 1 (slot 0 is the player's -- 1:$7AAA starts at 1).
  const r = dunkEnemy(state, 0, 0x1B, 0xF0);
  updateWater(state);
  assert.equal(state.water.splashes[0].timer, 0);
  assert.equal(state.water.splashes[1].timer, 0x17);
  assert.equal(state.water.splashes[1].x, (r[0x0E] << 8) | r[0x0F]);
  assert.ok(sounds(state).includes(0x25));

  // Next frame the bit is set, so no second splash (1:$7AA1).
  state.water.splashes[1].timer = 0;
  state.frame += 2;
  updateWater(state);
  assert.equal(state.water.splashes[1].timer, 0);

  // A GROUNDED record on the surface row never splashes (1:$7A9E).
  const s2 = waterState();
  s2.water.phase = 0xFF;
  s2.water.level = 0x1B00;
  placePlayer(s2, 0x30, 2);
  dunkEnemy(s2, 0, 0x1B, 0xF0, 0x80);
  updateWater(s2);
  assert.equal(s2.water.splashes[1].timer, 0);
});

// ---------------------------------------------------------------------------
// The splash pool ticker -- 1:$7AD3
// ---------------------------------------------------------------------------

test('splashes tick down and queue table-2 draws at the water line', () => {
  const state = waterState();
  state.water.windowY = 0x60;                  // the $C755 latch
  state.water.splashes[0] = { timer: 0x17, x: 0x1180 };
  state.water.splashes[2] = { timer: 0x01, x: 0x1200 };
  state.enemyDraws = [];
  updateSplashes(state);
  assert.equal(state.water.splashes[0].timer, 0x16);
  assert.equal(state.water.splashes[2].timer, 0);      // dies after this draw
  assert.equal(state.enemyDraws.length, 2);
  for (const d of state.enemyDraws) {
    assert.equal(d.alt, true);                 // sub_00_0BAF = the ALT table
    assert.equal(d.y, 0x60 + 0x0C);            // 1:$7B16
    assert.ok([0x65, 0x66, 0x67].includes(d.id));      // table 1:$7B31
  }
  // (timer $16 & $18) >> 3 = 2 -> id $67; (0 & $18) >> 3 = 0 -> id $65.
  assert.equal(state.enemyDraws[0].id, 0x67);
  assert.equal(state.enemyDraws[1].id, 0x65);
});

test('the ticker only runs on levels 1 and 2', () => {
  const state = waterState({ level: 9 });
  state.water.splashes[0] = { timer: 5, x: 0 };
  state.enemyDraws = [];
  updateSplashes(state);
  assert.equal(state.water.splashes[0].timer, 5);
  assert.equal(state.enemyDraws.length, 0);
});

// ---------------------------------------------------------------------------
// the tile flip-book (loc_00_3127's effect)
// ---------------------------------------------------------------------------

/** Stand-in for a captured level: two animated ids, three variants. */
function fakeArt() {
  const t = (v) => new Uint8Array(64).fill(v);
  return {
    map: new Uint8Array(1024),
    ids: [0x74, 0xE0],
    hold: 8,
    frames: [
      { 0x74: t(1), 0xE0: t(1) },
      { 0x74: t(2), 0xE0: t(2) },
      { 0x74: t(3), 0xE0: t(3) },
    ],
  };
}

test('the flip-book patches the tile cache, so BG and window both follow', () => {
  // The falling water is BACKGROUND -- its metatiles point at $74-$7B. Patching
  // level.tiles.bg is what the hardware streamer does to VRAM, and it is why
  // the renderer needs no special case for either layer.
  const s = waterState();
  s.level.tiles = { bg: new Array(256).fill(null), obj: [] };
  applyWaterArt(s, fakeArt());

  s.frame = 0;
  tickWaterArt(s);
  assert.equal(s.level.tiles.bg[0x74][0], 1);
  assert.equal(s.level.tiles.bg[0xE0][0], 1);

  s.frame = 8;
  tickWaterArt(s);
  assert.equal(s.level.tiles.bg[0x74][0], 2, 'advanced with the frame counter');

  s.frame = 24;
  tickWaterArt(s);
  assert.equal(s.level.tiles.bg[0x74][0], 1, 'and wraps');
});

test('the flip-book holds each variant for its measured frame count', () => {
  const s = waterState();
  s.level.tiles = { bg: new Array(256).fill(null), obj: [] };
  applyWaterArt(s, fakeArt());
  const seen = [];
  for (let f = 0; f < 24; f++) {
    s.frame = f;
    tickWaterArt(s);
    seen.push(s.level.tiles.bg[0x74][0]);
  }
  assert.deepEqual(seen, [1, 1, 1, 1, 1, 1, 1, 1,
                          2, 2, 2, 2, 2, 2, 2, 2,
                          3, 3, 3, 3, 3, 3, 3, 3]);
});

test('a level with no captured art is left alone', () => {
  // Most levels have no animated tiles at all; they must not be touched.
  const s = waterState();
  s.level.tiles = { bg: new Array(256).fill(null), obj: [] };
  applyWaterArt(s, null);
  s.frame = 40;
  assert.doesNotThrow(() => tickWaterArt(s));
  assert.equal(s.level.tiles.bg[0x74], null);
  assert.equal(s.video.windowMap, null);
});
