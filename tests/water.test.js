// The level-1/2 water-surface subsystem -- src/water.js.
// ROM: sub_00_2CBE -> loc_00_2D3D, splash pool 1:$7A83/$7A99/$7AD3.
// The branch's ENTRY ($2D3D-$2D5C) is not water at all: it is the sewer-enemy
// respawner, and the water code at $2D5D is its fall-through.
// Synthetic maps only; the oracle scenarios l1-water-spouts,
// l1-water-rising-hits and l1-sewer-respawner-emerge carry the frame-exact
// proof.
// Run: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { grid, makeState, placePlayer } from './helpers.js';
import { updateWater, updateSplashes, applyWaterArt, tickWaterArt,
         armEnemyRespawn } from '../src/water.js';
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

test('odd $FFB1 frames do not advance the water BODY', () => {
  // ROM: $2D5D -- odd frames only park the window register, no water logic.
  //
  // "Nothing at all" would be wrong now: the parity test is at $2D5D, and the
  // enemy respawner at $2D3D runs BEFORE it, on both parities. This fixture
  // has no latched slots, so it exercises the water body alone.
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
// The sewer-enemy respawner -- $0EC3 arms it, $2D3D-$2D5C refills.
//
// Slots 6 and 7 are OUTSIDE the level's 6-record spawn blob, so sub_00_2889
// leaves them zero. The two enemies that crawl out of the wall holes exist
// only because level init latches them "dead" and this respawner then fills
// them from two 32-byte bank-0 records. Reading the branch from the
// interesting-looking water label instead of from its entry deletes both.
// ---------------------------------------------------------------------------

/**
 * Stand-ins for the records at 0:$32F8 (slot 6) and 0:$32D8 (slot 7).
 * Deliberately NOT the cartridge's bytes -- those live in assets/manifest.json
 * and nothing ROM-derived is committed. What has to hold structurally: 32
 * bytes, distinguishable from each other, and a flag byte with bit 6 CLEAR,
 * because that byte lands on top of the latch that triggered the copy.
 */
function fakeTemplates() {
  const rec = (tag) => { const r = new Array(32).fill(tag); r[0] = 0x02; return r; };
  return [rec(0x11), rec(0x22)];
}

/** A record full of junk with a chosen flag byte -- a corpse, or a live enemy. */
const junk = (flag) => [flag, ...new Array(31).fill(0xFF)];

/**
 * Level 1 with the templates in place and both sewer slots full of junk.
 * The frame is ODD on purpose: updateWater then returns at $2D67, so the
 * respawner is the only thing that ran.
 */
function respawnState({ flag6 = 0x00, flag7 = 0x00, ...opts } = {}) {
  const state = waterState(opts);
  // updateWater IS sub_00_2CBE, so on a non-1/2 level it now dispatches into
  // src/conveyor.js. The level-7 arm demands its own templates and THROWS
  // without them, which is the point of that throw -- so the levels-other-than
  // -1/2 case below has to supply one, or it would be asserting on a crash.
  state.tables = {
    respawnEnemies: fakeTemplates(),
    subsysObjects: { level7: [new Array(16).fill(0), new Array(16).fill(0),
                              new Array(16).fill(0)] },
  };
  state.frame = 0x6D;
  placePlayer(state, 0x10, 2);                 // nowhere near the waterfall
  state.enemies[6].set(junk(flag6));
  state.enemies[7].set(junk(flag7));
  return state;
}

test('level init latches slots 6 and 7 dead, on levels 1 and 2 only', () => {
  // ROM: $0E74 dispatches on $FFB0 -- CP $01 / CP $02 both jump to loc_00_0EC3;
  // 9, $0A and $0B take a different arm at $0E8A and everything else falls out
  // at $0E88. The $40 latch is the ONLY thing that ever creates these two
  // enemies, so getting the level test wrong either deletes them or spawns two
  // sewer enemies into a level that has no sewer.
  for (const n of [1, 2]) {
    const state = makeState(grid(8), { level: n });
    armEnemyRespawn(state);
    assert.equal(state.enemies[6][0], 0x40, `level ${n}`);
    assert.equal(state.enemies[7][0], 0x40, `level ${n}`);
  }
  for (const n of [3, 5, 9, 10, 11, 14]) {
    const state = makeState(grid(8), { level: n });
    armEnemyRespawn(state);
    assert.equal(state.enemies[6][0], 0x00, `level ${n}`);
    assert.equal(state.enemies[7][0], 0x00, `level ${n}`);
  }
});

test('the arm STORES the flag byte and touches nothing else in either record', () => {
  // ROM: $0EC3-$0EC8 is `LD A,$40` plus two absolute stores -- one byte each,
  // and a store, not a set-bit. A slot that was live ($80) comes out $40, not
  // $C0: the latch replaces the state rather than joining it.
  const state = makeState(grid(8), { level: 1 });
  state.enemies[6].fill(0xFF);
  state.enemies[7].fill(0x80);
  armEnemyRespawn(state);
  assert.equal(state.enemies[6][0], 0x40);
  assert.equal(state.enemies[7][0], 0x40);
  assert.deepEqual(state.enemies[6].slice(1), new Uint8Array(31).fill(0xFF));
  assert.deepEqual(state.enemies[7].slice(1), new Uint8Array(31).fill(0x80));
});

test('a latched slot 6 is refilled from its record, and the refill clears the latch', () => {
  // ROM: $2D3D-$2D49. HL is $C328 -- the FLAG byte -- for BOTH the `BIT 6,(HL)`
  // and the `LD [HL+],A` loop, so the copy starts on the byte that triggered
  // it and the record's own flag (bit 6 clear) is what disarms the latch.
  // Start the copy one byte in and slot 6 respawns every frame forever, and
  // slot 7 never gets a turn at all.
  const state = respawnState({ flag6: 0x40 });
  updateWater(state);
  assert.deepEqual(Array.from(state.enemies[6]), state.tables.respawnEnemies[0]);
  assert.equal(state.enemies[6][0] & 0x40, 0, 'the dead latch is gone');
});

test('slot 6 has priority: the init arm fills 6 this frame and 7 the next', () => {
  // ROM: $2D42 -- slot 7's `BIT 6` at $2D4E is only reached when slot 6's bit
  // is CLEAR, and slot 6's copy at $2D57 falls straight through to $2D5D. One
  // record per frame, by construction. This is also the real level-start
  // sequence: $0EC3 latches both, then frames 1 and 2 create them.
  const state = respawnState();
  state.enemies[6].fill(0);
  state.enemies[7].fill(0);
  armEnemyRespawn(state);
  const [t6, t7] = state.tables.respawnEnemies;

  updateWater(state);
  assert.deepEqual(Array.from(state.enemies[6]), t6);
  assert.deepEqual(Array.from(state.enemies[7]), [0x40, ...new Array(31).fill(0)],
                   'slot 7 still waits its turn');

  state.frame += 2;
  updateWater(state);
  assert.deepEqual(Array.from(state.enemies[7]), t7, 'and each slot has its OWN record');
  assert.deepEqual(Array.from(state.enemies[6]), t6, 'slot 6 is not refilled twice');
});

test('with neither latch set the respawner copies nothing', () => {
  // ROM: $2D50 `JR Z, loc_00_2D5D` -- straight into the water code. A live
  // sewer enemy walking around must not be reset to its dormant record.
  const state = respawnState({ flag6: 0x80, flag7: 0x80 });
  const before = [Array.from(state.enemies[6]), Array.from(state.enemies[7])];
  updateWater(state);
  assert.deepEqual(Array.from(state.enemies[6]), before[0]);
  assert.deepEqual(Array.from(state.enemies[7]), before[1]);
});

test('the refill overwrites all 32 bytes, whatever the slot held before', () => {
  // ROM: $2D47 `LD B,$20`. A killed enemy leaves position, animation, timers
  // and the state byte behind; carrying any of them over respawns the sewer
  // enemy where it died instead of dormant back in its wall hole.
  const a = respawnState({ flag6: 0x40 });
  updateWater(a);

  const b = respawnState({ flag6: 0x40 });
  b.enemies[6].fill(0x5A);                     // a completely different corpse
  b.enemies[6][0] = 0x40;
  updateWater(b);

  assert.equal(a.enemies[6].length, 32);
  assert.deepEqual(Array.from(a.enemies[6]), Array.from(b.enemies[6]),
                   'the result depends on the record alone, not on the corpse');
});

test('the respawner runs on BOTH $FFB1 parities -- it sits ahead of the parity test', () => {
  // ROM: $2D3D-$2D5C comes before the `LDH A,[$FFB1] / AND $01` at $2D5D, so
  // an odd frame refills and only THEN returns at $2D67. Hanging the respawner
  // off the even-frame water logic halves the respawn rate and shifts every
  // later sewer-enemy frame.
  for (const frame of [0x6C, 0x6D]) {
    const state = respawnState({ flag6: 0x40 });
    state.frame = frame;
    updateWater(state);
    assert.equal(state.enemies[6][0] & 0x40, 0, `frame $${frame.toString(16)}`);
  }
});

test('the respawner is behind the pause gate and the levels-1/2 gate', () => {
  // ROM: sub_00_2CBE tests $C716 (`RET NZ`) at $2CBE and the level at
  // $2CC3-$2CE4, both BEFORE loc_00_2D3D. Every other level's branch has its
  // own entry and none of them fills slots 6/7 -- an unguarded respawner would
  // stamp two sewer enemies into levels that never placed them.
  for (const level of [3, 5, 6, 7, 11, 12, 13]) {
    const state = respawnState({ level, flag6: 0x40, flag7: 0x40 });
    updateWater(state);
    assert.deepEqual(Array.from(state.enemies[6]), junk(0x40), `level ${level}`);
    assert.deepEqual(Array.from(state.enemies[7]), junk(0x40), `level ${level}`);
  }

  const paused = respawnState({ flag6: 0x40 });
  paused.flow.paused = true;
  updateWater(paused);
  assert.deepEqual(Array.from(paused.enemies[6]), junk(0x40));
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
