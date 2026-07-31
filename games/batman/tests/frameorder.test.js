// THE FRAME'S CALL ORDER AND ITS SHADOW-OAM ORDER.  ROM: the $0567 main-loop
// body, $0567-$0650.
//
// WHY THIS FILE EXISTS, and it is a measurement rather than a worry. Before it
// was written, FIVE distinct order mutations all passed the whole 691-test
// suite: deleting the $FFA7 parity reversal in the enemy driver, hoisting the
// lag gate above tryActivate, swapping the stun and hit arms, moving main.js's
// SECOND drawEnemies flush past updateDoors, and reversing the draw queue at
// flush. Every one of them is a visible fault on the cartridge -- OAM index IS
// DMG sprite priority and IS the ten-sprites-per-line cut -- and nothing in the
// unit suite could see any of them. The only gate that could was
// tools/oracle/oamdiff.mjs, which needs PyBoy and the ROM and covers three
// levels. This file is the part that runs everywhere, in 30 ms, with no ROM.
//
// TWO TESTS, AND THEY ARE NOT THE SAME KIND OF THING:
//
//   1. THE SPRITE-QUEUE ASSERTION is behavioural and it is the real check. It
//      builds a scene with one sprite from every producer the loop drives, runs
//      tick() at BOTH $FFA7 parities and on a PAUSED frame, and asserts the
//      full ordered contents of state.video.sprites. If a refactor reorders the
//      loop, the queue changes and this goes red.
//
//   2. THE SOURCE-ORDER LIST IS A CHANGE DETECTOR AND NOTHING MORE. It reads
//      the source of the file containing tick() and asserts the ~24 subsystem
//      calls appear in one written-down order, each with its ROM address. It
//      CANNOT tell you the order is RIGHT -- only that somebody changed it.
//      That is the correct instrument for guarding a decomposition, and saying
//      so here is the point: a test whose limits are undocumented is how a
//      vacuous gate gets in. tests/conveyor.test.js:528 already uses the same
//      source-grep idiom to pin one pair of calls; this is that, exhaustively.
//
// TWO SCENES, BECAUSE ONE IS IMPOSSIBLE. The moon ($057D) draws only on levels
// 9/$0A/$0B and the water splash ($05EF) only on levels 1-2, so no single level
// can hold both. Scene A is level 9 (moon, no splash) and scene B is level 1
// (splash, no moon); between them every ordered draw site in the loop is
// covered.
//
// WHAT IS WRITTEN DOWN AND WHAT IS FIXTURE. The ORDER of the expected list is
// transcribed from the ROM listing, with the address beside each entry. The
// tile ids and coordinates are the fixture's own -- this test PLACES every
// producer at a chosen camera-relative offset and the expected pixel is that
// offset divided by 16, so the values are derived from the placement rather
// than read back from the port. The one exception is the player's Y, which is
// the camera's business and not this file's; it is normalised out explicitly
// rather than pinned, so a camera change cannot make an ORDER test go red.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tick } from '../src/game/frame.js';
import { spawnDrop } from '../src/drops.js';
import { makeState, corridor, placePlayer } from './helpers.js';

/**
 * The file that owns tick(). ONE constant, on purpose: when the frame body is
 * extracted into its own module this test is repointed in a single line, and
 * the mutation matrix is re-run against the new home to prove it still bites.
 *
 * Phase 10 did exactly that. $0567-$0650 moved out of src/main.js into
 * src/game/frame.js in the same commit that changed this line, and M4 (the
 * second drawEnemies flush moved past updateDoors) and M5 (the draw queue
 * reversed at flush) were re-applied to the NEW file afterwards and both went
 * red -- 5 failures and 2 failures respectively, the same counts as before the
 * move. Importing tick from src/main.js still works, and deliberately so, but
 * this constant must name the file the code is actually IN or the change
 * detector below silently stops detecting anything.
 */
const TICK_SOURCE = new URL('../src/game/frame.js', import.meta.url);

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/** $0F8D: the bar id for full HP (10) is $82 + ((10 - 1) >> 1) = $86. */
const HUD_ID = 0x86;
/** $05A9: LD E,$34 -- the moon. Two 8x16 sprites, tiles $E0/$E2, attr $10. */
const MOON_ID = 0x34;

/**
 * Synthetic, like tests/main.test.js's: metasprite N is a single sprite whose
 * TILE is N, so a tile id in the queue names the metasprite that queued it. The
 * HUD and the moon keep their real sprite counts (five and two) because the
 * paused-frame count of seven only means something if they do.
 */
function fakeManifest() {
  const table1 = [];
  for (let i = 0; i <= 0x100; i++) table1[i] = { sprites: [[0, 0, i & 0xFF, 0]] };
  table1[HUD_ID] = { sprites: [0, 1, 2, 3, 4].map((i) => [0, i * 8, 0xB0 + i, 0]) };
  table1[MOON_ID] = { sprites: [[0, 0, 0xE0, 0x10], [0, 8, 0xE2, 0x10]] };
  const table2 = [];
  for (let i = 0; i <= 0x100; i++) table2[i] = { sprites: [[0, 0, i & 0xFF, 0]] };
  return {
    metasprites: { table1, table2 },
    player: { hitboxes: Array.from({ length: 0x20 }, () => [15, 15]), anims: [] },
  };
}
const MANIFEST = fakeManifest();

/**
 * Shaped ROM tables. The three draw tables carry DISTINCT constants so each
 * producer's sprites are identifiable in the queue by tile id alone:
 * batarangs $51, door debris $63, and the enemy pose is written straight into
 * the record at +6 ($7A).
 */
const TABLES = {
  deathBurstInit: new Array(8 * 5).fill(0),
  deathBurstSprites: new Array(8).fill(0),
  deathBurstPath: new Array(0x114).fill(0),
  batarangAnim: new Array(8).fill(0x51),      // 1:$41B8, the spin cycle
  doorSprites: new Array(8).fill(0x63),       // 1:$4D08's flight poses
  doorSteps: new Array(8).fill(0),
  doorDebrisVel: new Array(32).fill(0),
  effectSprites: Array.from({ length: 5 }, () => new Array(4).fill(0)),
};

const run = (s, pressed = 0) => {
  s.input.pressed = pressed;
  s.input.held = pressed;
  tick(s, MANIFEST, MANIFEST.playerTiles ?? null);
};

/** Tile ids the fixture assigns, so the expectations below read as names. */
const HUD = [0xB0, 0xB1, 0xB2, 0xB3, 0xB4];
const MOON = [0xE0, 0xE2];
const EFFECT = 0x0F;      // $13C3, the plain effect's fixed sprite
const DROP = 0x96;        // $1557's pickup sprite
const PLAYER = 0x00;      // table1[msIndex]; a settled idle pose is msIndex 0
const BATARANG = 0x51;
const ENEMY = 0x7A;
const DEBRIS = 0x63;
const SPLASH = 0x65;      // $7B31's first spin frame

/**
 * One frame's worth of every producer, placed CAMERA-RELATIVE so the expected
 * screen pixel is the chosen offset >> 4 and nothing depends on where the
 * camera actually settled.
 *
 * The tick is run once as a warm-up first, because the camera moves on the
 * frame after a level is placed and this test is not about the camera.
 */
function scene(level, parity) {
  const s = makeState(corridor(32, 14), { level, tables: TABLES });
  placePlayer(s, 3, 13);
  s.camera.x = 0;
  s.camera.y = 0x1000;
  s.sound = { queue: [] };
  s.frame = 1;                  // NOT a multiple of 8: $0F56's draw-Y bob is
  s.parity = 0;                 // gated on `$FFB1 & 7 == 0` and levels 9/$0A/
  run(s);                       // $0B are exactly the bob's levels.
  s.frame = 1;
  s.parity = parity;

  const cx = s.camera.x, cy = s.camera.y;
  const at = (dx) => cx + dx, atY = (dy) => cy + dy;

  // $1391, the $C693 effect pool, reached through $1349. Bit 7 CLEAR is the
  // plain arm: a fixed sprite $0F that cannot free its own slot.
  s.doors.effects[0].set([0x40, at(0x0500) >> 8, at(0x0500) & 0xFF,
                          atY(0x0200) >> 8, atY(0x0200) & 0xFF, 0x00]);

  // $1444, the ballistic pool -- one heart. It falls 2 px on its first frame,
  // which is why its expected Y is 30 and not 32.
  spawnDrop(s, at(0x0600), atY(0x0200), 0xFF, 0x00, 0x00);

  // $3A35/$3D15. screenY is `(y >> 4) - $100 - camY`, so the world Y is built
  // back from the screen offset we want.
  const b = s.batarangs[0];
  b.active = 1;
  b.flags = 0;
  b.x = at(0x0700);
  b.y = (0x100 + (cy >> 4) + 0x30) << 4;
  b.vx = 0; b.vy = 0;
  b.timer = 0x40;

  // $05CF, slot 0. State $0C (dormant) with the LANDING-ANIM bit ($5BA0) takes
  // the record straight to loc_01_5CA8 with no physics at all, and animTick's
  // $5E90 arm returns r[6] verbatim when the +$19 timer is already 0 -- so the
  // queued pose is exactly the byte written here and nothing about the enemy's
  // own animation machine is under test.
  const ex = at(0x0300), ey = atY(0x0200);
  const r = s.enemies[0];
  r[0] = 0x80; r[1] = 0x20; r[2] = 0x0C; r[6] = ENEMY;
  r[0x0E] = (ex >> 8) & 0xFF; r[0x0F] = ex & 0xFF;
  r[0x10] = (ey >> 8) & 0xFF; r[0x11] = ey & 0xFF;
  r[0x16] = 4; r[0x19] = 0;

  // $05D2 -> $4C41, the door sequencer in its debris-flight phase. Four pieces,
  // 2 px apart, so their order inside the block is visible too.
  s.doors.active = 6;
  for (let i = 0; i < 4; i++) {
    const dx = at(0x0800 + i * 0x20), dy = atY(0x0200);
    s.doors.debris[i].set([(dx >> 8) & 0xFF, dx & 0xFF, (dy >> 8) & 0xFF, dy & 0xFF]);
  }

  // $05EF -> 1:$7AD3. Levels 1-2 only.
  if (level === 1 || level === 2) {
    s.water.splashes[0].timer = 0x20;
    s.water.splashes[0].x = at(0x0900);
    s.water.windowY = 0x40;
  }
  return s;
}

/**
 * The queue as [tile, x, y]. The PLAYER's Y is replaced by 'cam' -- where the
 * camera puts Batman is not what this file asserts, and pinning it would make
 * a camera change look like an order regression.
 */
function queue(s) {
  return s.video.sprites.map((q) => [q.tile, q.x, q.tile === PLAYER ? 'cam' : q.y]);
}

// ---------------------------------------------------------------------------
// 1. The behavioural check: the full ordered sprite queue
// ---------------------------------------------------------------------------

// Everything the loop draws between the two HUD arms, in the listing's order.
const MIDDLE = [
  [EFFECT, 80, 32],           // $1349 -> loc_00_1391, the $C693 pool
  [DROP, 96, 30],             // $1444, the ballistic pool
  [PLAYER, 40, 'cam'],        // $1D0C, after $170A's chain
  [BATARANG, 112, 48],        // $3D15, after $3A35's physics
  [ENEMY, 48, 32],            // $05CF's driver, flushed between $05CF and $05D2
  [DEBRIS, 128, 32],          // $05D2 -> loc_01_4CA0, four pieces in slot order
  [DEBRIS, 130, 32],
  [DEBRIS, 132, 32],
  [DEBRIS, 134, 32],
];
const hudBlock = HUD.map((t, i) => [t, 8 + i * 8, 8]);      // $0F94: BC = $1810
const moonBlock = MOON.map((t, i) => [t, 120 + i * 8, 8]);  // $05A6: BC = $1880

test('$FFA7 == 0: the HUD leads the whole frame, and everything else follows in listing order', () => {
  // $056E: `LDH A,[$FFA7] / AND A / JP NZ, loc_00_05D9`. Zero runs $0573, so
  // the energy bar occupies OAM 0-4 and wins DMG priority over every sprite
  // after it.
  const s = scene(9, 0);
  run(s);
  assert.deepEqual(queue(s), [...hudBlock, ...moonBlock, ...MIDDLE]);
});

test('$FFA7 == 1: the SAME frame with the HUD moved to the tail', () => {
  // $05E5, the other arm. Nothing else moves -- that is the claim, and it is
  // the one a decomposition is most likely to break, because the two arms look
  // like duplication worth "cleaning up".
  const s = scene(9, 1);
  run(s);
  assert.deepEqual(queue(s), [...moonBlock, ...MIDDLE, ...hudBlock]);
});

test('the splash queues LAST, behind even the odd-frame HUD ($05EF)', () => {
  // 1:$7AD3 pushes onto the same enemy draw list the driver uses, and its flush
  // is the THIRD one -- after $05E5/$05EC. So on an odd frame a splash draws
  // behind the energy bar, and on an even frame it is still last.
  const even = scene(1, 0);
  run(even);
  assert.deepEqual(queue(even), [...hudBlock, ...MIDDLE, [SPLASH, 144, 60]]);

  const odd = scene(1, 1);
  run(odd);
  assert.deepEqual(queue(odd), [...MIDDLE, ...hudBlock, [SPLASH, 144, 60]]);
});

test('a PAUSED frame rebuilds the screen from the HUD and the moon alone, in parity order', () => {
  // $05B0-$05B4 is a JUMP, not a return: it lands past the camera and the
  // player but IN FRONT of the second HUD arm, the splash pass and $064A's OAM
  // clear. MEASURED (tools/oracle/pauseoam.py): a paused cartridge frame holds
  // exactly SEVEN shadow-OAM entries where the frame before held 22 -- and the
  // parity still decides which of the two survivors comes first.
  const even = scene(9, 0);
  even.flow.paused = true;
  run(even);
  assert.deepEqual(queue(even), [...hudBlock, ...moonBlock]);

  const odd = scene(9, 1);
  odd.flow.paused = true;
  run(odd);
  assert.deepEqual(queue(odd), [...moonBlock, ...hudBlock]);
});

test('the enemy flush sits BETWEEN $05CF and $05D2, not at the end of the frame', () => {
  // The consequence, stated on its own so a failure names it: 1:$5CA8 appends
  // from INSIDE the driver, so the driver's sprites are already in shadow OAM
  // before $05D2 lets the door routine append after them. MEASURED on the
  // cartridge ($FF9D read on entry to $05CF and $05D2, level 6, 400 frames):
  // the cursor stands at 7-9 at $05CF and 10-22 at $05D2.
  //
  // The port once held the enemies until after the HUD and pushed door sprites
  // immediately: 201/400 frames exact, all 199 misses on $FFA7 = 1, multiset
  // identical on all 400 -- an ORDER fault and nothing else.
  for (const parity of [0, 1]) {
    const s = scene(9, parity);
    run(s);
    const t = s.video.sprites.map((q) => q.tile);
    assert.ok(t.indexOf(ENEMY) < t.indexOf(DEBRIS),
      `parity ${parity}: the enemy flush must precede the door routine`);
    assert.ok(t.indexOf(BATARANG) < t.indexOf(ENEMY),
      `parity ${parity}: $3D15 precedes $05CF`);
  }
});

test('drawEnemies flushes in INSERTION order, not slot order and not reversed', () => {
  // The queue is the ROM's OAM push order made explicit. Reversing it at the
  // flush would leave every multiset in the suite identical and every sprite
  // priority backwards -- which is why it needs its own assertion rather than
  // relying on a single-enemy scene.
  const s = scene(9, 0);
  // Three more dormant records, deliberately NOT in ascending X, so slot order
  // and insertion order and X order are three different sequences.
  const place = (slot, dx, pose) => {
    const r = s.enemies[slot];
    const ex = s.camera.x + dx, ey = s.camera.y + 0x0200;
    r[0] = 0x80; r[1] = 0x20; r[2] = 0x0C; r[6] = pose;
    r[0x0E] = (ex >> 8) & 0xFF; r[0x0F] = ex & 0xFF;
    r[0x10] = (ey >> 8) & 0xFF; r[0x11] = ey & 0xFF;
    r[0x16] = 4; r[0x19] = 0;
  };
  place(1, 0x0100, 0x71);
  place(2, 0x0500, 0x72);
  place(3, 0x0200, 0x73);
  run(s);
  const t = s.video.sprites.map((q) => q.tile).filter((x) => x >= 0x71 && x <= 0x7A);
  assert.deepEqual(t, [ENEMY, 0x71, 0x72, 0x73],
    'even frames walk slots 0->7 and the flush preserves that exact order');
});

// ---------------------------------------------------------------------------
// 2. The CHANGE DETECTOR.  Read the header: this proves nothing about whether
//    the order is correct. It proves that a refactor did not quietly move a
//    call, which is the only thing a decomposition guard can honestly claim.
// ---------------------------------------------------------------------------

/**
 * The $0567 body, transcribed. Each entry is [needle, ROM address, what it is].
 * The needles are matched SEQUENTIALLY from the previous match, so a repeated
 * call (drawHud twice, deathTick twice, drawEnemies three times) pins its own
 * position rather than collapsing onto the first occurrence.
 */
const FRAME_CALLS = [
  ['state.video.sprites.length = 0;', '$064A', 'sub_00_0C1F, the shadow-OAM clear'],
  ['drawHud(state, manifest);', '$0573', 'HUD arm A, the $FFA7 == 0 side'],
  ['deathTick(state, manifest);', '$057A', 'sub_00_29E7, the GAME OVER burst'],
  ['drawSkySprite(state, manifest);', '$057D', 'the moon, levels 9/$0A/$0B'],
  ['tickRaster(state);', '$058B', 'the two sky layers behind it'],
  ['updateCamera(state);', '$05B7', 'FIRST, on last frame\'s player position'],
  ['updateActors(state, manifest);', '$05BA', '1:$4230, the $C1E8 map objects'],
  ['updateBreakables(state, manifest);', '$1349', 'tile restores + the $C693 pool'],
  ['updateDrops(state, manifest);', '$1444', 'the ballistic pool'],
  ['updatePlayer(state, manifest)', '$170A', 'the $1438..$1B4A chain'],
  ['cachePlayerScreen(state);', '$1B58', '$FF93/$FF94, the tail of $1B4A'],
  ['applyAnimHitbox(state, manifest);', '$1D2C', 'the hitbox follows the pose'],
  ['drawPlayer(state, manifest);', '$1D0C', 'Batman'],
  ['updateWater(state);', '$05C6', 'sub_00_2CBE'],
  ['drawEnemies(state, manifest);', 'flush 1', '$3113\'s rescue carrier'],
  ['streamPlayerTiles(state, manifest, playerTiles);', '$2C13', 'one column/frame'],
  ['tickTileAnim(state);', '$3127', 'the TAIL of sub_00_2C13, not a call'],
  ['updateBatarangs(state);', '$3A35', 'ballistics before the draw'],
  ['drawBatarangs(state, manifest);', '$3D15', ''],
  ['updateRope(state, manifest);', '$3D5F', 'the tail of the same routine'],
  ['updateEnemies(state);', '$05CF', '1:$4E0C, the driver'],
  ['drawEnemies(state, manifest);', 'flush 2', 'BETWEEN $05CF and $05D2'],
  ['updateDoors(state, manifest);', '$05D2', '$C733 -> 1:$4BB0'],
  ['drawHud(state, manifest);', '$05E5', 'HUD arm B, the $FFA7 != 0 side'],
  ['deathTick(state, manifest);', '$05EC', 'the burst on the odd arm'],
  ['updateSplashes(state);', '$05EF', '1:$7AD3'],
  ['drawEnemies(state, manifest);', 'flush 3', '$05EF\'s splash'],
  ['updatePause(state);', '$05F2', 'the START toggle'],
  ['state.frame = (state.frame + 1) & 0xFF;', '$FFB1', 'the VBlank counters,'],
  ['state.parity ^= 1;', '$FFA7', 'last, and they tick while paused'],
];

test('tick() calls its subsystems in the $0567 body\'s order (CHANGE DETECTOR)', () => {
  const src = readFileSync(TICK_SOURCE, 'utf8');
  const body = src.slice(src.indexOf('export function tick('));
  assert.ok(body.length > 0, 'tick() found in ' + TICK_SOURCE.pathname);

  let at = 0;
  let prev = null;
  for (const [needle, rom, note] of FRAME_CALLS) {
    const i = body.indexOf(needle, at);
    assert.notEqual(i, -1,
      `${rom} ${note}: \`${needle}\` is missing from tick(), or it has moved `
      + `above ${prev ? prev[1] + ' `' + prev[0] + '`' : 'the head of the frame'}. `
      + 'CALL ORDER IS SEMANTICS HERE -- it decides shadow-OAM order, which is '
      + 'DMG sprite priority and the ten-sprites-per-line cut, and it decides '
      + 'platform-carry order. If the move was deliberate, the sprite-queue '
      + 'assertions above are what say whether it changed the picture.');
    at = i + needle.length;
    prev = [needle, rom];
  }
});

test('there are exactly THREE enemy-queue flushes, and no more', () => {
  // Counted separately because the sequential search above would happily accept
  // a fourth. Each flush empties the queue, so an extra one is a silent no-op
  // today and a reordering hazard forever.
  const src = readFileSync(TICK_SOURCE, 'utf8');
  const body = src.slice(src.indexOf('export function tick('));
  const n = body.split('drawEnemies(state, manifest);').length - 1;
  assert.equal(n, 3, '$05C6\'s rescue carrier, $05CF\'s driver, $05EF\'s splash');
});
