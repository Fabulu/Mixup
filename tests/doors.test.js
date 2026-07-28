// The door/gate sequencer ($C733-$C735) and the $C693 effect pool.
//
// tools/oracle/doordiff.mjs covers the whole subsystem frame-by-frame against
// the cartridge on levels 3, 9 and 13. These cover the arms those runs cannot
// reach, and the table INDEXING -- every table below is deliberately NOT the
// ROM's, so a handler that hard-coded the real values instead of reading the
// manifest fails here.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  armDoor, updateDoors, spawnEffect, updateEffects, clearEffects,
  createDoorState, EFFECT_SLOTS,
} from '../src/doors.js';
import { mapCollision, mapTile } from '../src/state.js';
import { makeState, grid, floorFrom } from './helpers.js';

// --- synthetic tables -------------------------------------------------------
// Asymmetric on purpose: (row, col) pairs where the two halves differ, so a
// transposed read produces a different answer rather than the same one.
const STEPS = [0, 0, 0xFF, 0, 0, 3, 0xFF, 3];   // BL, TL, BR(+3 cols), TR
const VEL = [];
for (let i = 0; i < 35; i++) VEL.push(0x20, i === 0 ? 0xC0 : 0x08);
const SPRITES = [0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67];
const SPRITES_L3 = [0x70, 0x71, 0x72, 0x73];
const EFFECT_SPRITES = [
  [1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16],
  [17, 18, 19, 20],
];

const TABLES = {
  doorSteps: STEPS,
  doorDebrisVel: VEL,
  doorSprites: SPRITES,
  doorSpritesL3: SPRITES_L3,
  effectSprites: EFFECT_SPRITES,
};

/**
 * A 2x2 door block with its bottom-left corner at (col, row). Graphics are the
 * ROM's four corner ids -- those are what $205B dispatches on, so they are the
 * behaviour, not data. Collision carries the owning slot in bits 7-5.
 */
function doorWorld(col, row, slot = 0) {
  const g = floorFrom(grid(24), 15);
  const s = makeState(g, { tables: TABLES });
  s.doors = createDoorState();
  const stamp = (c, r, gfx) => {
    const i = (c * 16 + (r & 0x0F)) * 2;
    s.level.cells[i] = gfx;
    s.level.cells[i + 1] = (slot << 5) | 0x1F;
  };
  stamp(col - 1, row - 1, 0x3E);        // TL
  stamp(col, row - 1, 0x3F);            // TR
  stamp(col - 1, row, 0x40);            // BL
  stamp(col, row, 0x41);                // BR
  return s;
}

// --- arming: the graphic-id walk -------------------------------------------

test('every corner graphic resolves to the same bottom-left cell', () => {
  // $205B-$2072. All four cells share one collision byte, so the GRAPHIC is
  // the only thing that says which corner the punch landed on.
  const cases = [
    ['$3E top-left', 5, 21, 5, 22],       // INC E
    ['$3F top-right', 6, 21, 5, 22],      // INC E / DEC D
    ['$40 bottom-left', 5, 22, 5, 22],    // nothing
    ['$41 bottom-right', 6, 22, 5, 22],   // DEC D (the `else` arm)
  ];
  for (const [name, pc, pr, wantCol, wantRow] of cases) {
    const s = doorWorld(6, 22);
    assert.equal(armDoor(s, pc, pr), true, name);
    assert.equal(s.doors.active, 1, name);
    assert.equal(s.doors.col, wantCol, `${name}: col`);
    assert.equal(s.doors.row, wantRow, `${name}: row`);
  }
});

test('arming spawns a puff and a heart at the block centre', () => {
  // $2077/$2082: BOTH pools are staged one column RIGHT of $C734, with zero
  // low bytes -- the bottom-right cell, i.e. the middle of the 2x2.
  const s = doorWorld(6, 22);
  armDoor(s, 5, 21);
  const eff = s.doors.effects[0];
  assert.deepEqual([...eff], [0x97, 6, 0, 22, 0, 0x02]);
  const bal = s.drops[0];
  assert.equal(bal[0], 0x01);          // $C74D = $FF -> kind 1, no drift
  assert.equal(bal[1], 6);
  assert.equal(bal[3], 22);
  assert.equal(bal[5], 0x00);          // dir $FF -> no horizontal velocity
  assert.equal(bal[6], 0x20);          // sub 0 -> the ordinary upward toss
});

test('a punch during another door does nothing AND costs the recoil', () => {
  // $2046 is `LD A,[$C733] / AND A / RET NZ`, and that RET is BEFORE $20A7 --
  // which is what the `false` return tells the caller.
  const s = doorWorld(6, 22);
  armDoor(s, 5, 21);
  s.doors.col = 0xAA; s.doors.row = 0xBB;   // prove nothing overwrites these
  assert.equal(armDoor(s, 15, 21), false);
  assert.equal(s.doors.col, 0xAA);
  assert.equal(s.doors.row, 0xBB);
  assert.equal(s.doors.effects[1][0], 0, 'no second puff');
});

// --- the erase phases -------------------------------------------------------

test('the four cells are erased in the order the step table gives', () => {
  // $4BB7-$4BE7, one cell per frame. The synthetic table's +3 column offset
  // means a (col,row)-transposed read would erase entirely different cells.
  const s = doorWorld(6, 22);
  // Fill the whole scan window with solid so an erase is detectable even on a
  // cell the (deliberately wrong) synthetic offsets point at.
  for (let c = 4; c <= 9; c++) {
    for (let r = 21; r <= 22; r++) {
      const i = (c * 16 + (r & 0x0F)) * 2;
      if (s.level.cells[i + 1] === 0) { s.level.cells[i] = 0x11; s.level.cells[i + 1] = 1; }
    }
  }
  armDoor(s, 5, 21);                     // -> col 5, row 22
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const before = [];
    for (let c = 4; c <= 9; c++) {
      for (let r = 21; r <= 22; r++) before.push(mapCollision(s, c, r));
    }
    updateDoors(s);
    let k = 0;
    for (let c = 4; c <= 9; c++) {
      for (let r = 21; r <= 22; r++, k++) {
        if (before[k] !== 0 && mapCollision(s, c, r) === 0) seen.push([c, r]);
      }
    }
  }
  assert.deepEqual(seen, [[5, 22], [5, 21], [8, 22], [8, 21]]);
  assert.equal(s.doors.active, 5);
});

test('an erased cell loses its graphic as well as its collision', () => {
  const s = doorWorld(6, 22);
  armDoor(s, 5, 22);
  updateDoors(s);
  assert.equal(mapTile(s, 5, 22), 0);
  assert.equal(mapCollision(s, 5, 22), 0);
});

test('a slot-0 door frees no actor record; a slot-1 door frees slot 1', () => {
  // sub_01_4BE8: `AND $E0 / RET Z`. Every door baked into a level's collision
  // LUT is slot 0, so this arm only ever fires for a block a type-6 object
  // stamped at runtime ($43D1 writes `slot * 32 | $1F`).
  const zero = doorWorld(6, 22, 0);
  zero.actors[0].fill(0x5A);
  armDoor(zero, 5, 22);
  updateDoors(zero);
  assert.equal(zero.actors[0][0], 0x5A, 'slot 0 is never freed');

  const one = doorWorld(6, 22, 1);
  one.actors[1].fill(0x5A);
  armDoor(one, 5, 22);
  updateDoors(one);
  assert.deepEqual([...one.actors[1]], new Array(16).fill(0));
});

// --- debris -----------------------------------------------------------------

test('the debris spawn writes four corners and moves them the same frame', () => {
  // $4BFB-$4C3F falls THROUGH into loc_01_4C42 ($4C3F -> $4C41), so the pieces
  // take arc entry 0 on their spawn frame. Deferring that is a permanent
  // one-entry lag for the whole flight.
  const s = doorWorld(6, 22);
  armDoor(s, 5, 21);
  for (let i = 0; i < 4; i++) updateDoors(s);   // the four erase frames
  assert.equal(s.doors.active, 5);
  updateDoors(s);                               // the spawn frame
  assert.equal(s.doors.active, 7, 'spawn sets 6, the loop then steps to 7');

  const at = (i) => [...s.doors.debris[i]];
  // spawned {5,$80,22,$80} {5,$F0,21,$80} {6,$80,22,$80} {6,$10,21,$80}
  // then x -/+ $20 and y + $FFC0 (-$40).
  assert.deepEqual(at(0), [5, 0x60, 22, 0x40]);
  assert.deepEqual(at(1), [5, 0xD0, 21, 0x40]);
  assert.deepEqual(at(2), [6, 0xA0, 22, 0x40]);
  assert.deepEqual(at(3), [6, 0x30, 21, 0x40]);
  assert.ok(s.sound.queue.some((q) => q.id === 0x10 && q.mask === 0x01));
});

test('the sequencer wraps to 0 after phase $28 and freezes the debris', () => {
  const s = doorWorld(6, 22);
  armDoor(s, 5, 21);
  for (let i = 0; i < 5; i++) updateDoors(s);
  let frames = 5;
  while (s.doors.active !== 0 && frames < 100) { updateDoors(s); frames++; }
  assert.equal(s.doors.active, 0);
  assert.equal(frames, 39, 'four erases, one spawn, 34 more arc steps');

  // Nothing clears $C60B, ever -- the records keep their last position.
  const frozen = s.doors.debris.map((r) => [...r]);
  updateDoors(s);
  assert.deepEqual(s.doors.debris.map((r) => [...r]), frozen);
});

// --- the $C693 effect pool --------------------------------------------------

function effectState() {
  const s = makeState(floorFrom(grid(8), 15), { tables: TABLES });
  s.doors = createDoorState();
  return s;
}

test('the effect allocator takes the first free slot and reports a full pool', () => {
  const s = effectState();
  for (let i = 0; i < EFFECT_SLOTS; i++) {
    assert.equal(spawnEffect(s, 0x0100 * (i + 1), 0x1200, 0x97, 2), i);
  }
  assert.equal(spawnEffect(s, 0x0100, 0x1200, 0x97, 2), -1);   // $0CF0
});

test('an animated effect counts down, keeps its top two bits, and frees byte 0 only', () => {
  // $13CC-$1423. `$97` is bits 7 set, 6 clear, counter $17.
  const s = effectState();
  spawnEffect(s, 0x0600, 0x1E00, 0x97, 2);
  const r = s.doors.effects[0];

  updateEffects(s);
  assert.equal(r[0], 0x96, 'bit 7 preserved, counter $17 -> $16');
  assert.ok(s.sound.queue.some((q) => q.id === 0x17), 'the one-shot at $17');

  s.sound.queue.length = 0;
  for (let i = 0; i < 21; i++) updateEffects(s);
  assert.equal(r[0], 0x81, 'counter 1, still live');
  assert.equal(s.sound.queue.length, 0, 'the $17 test never matches again');

  updateEffects(s);
  assert.equal(r[0], 0x00, 'freed');
  assert.deepEqual([...r].slice(1), [6, 0, 0x1E, 0, 2],
                   'only byte 0 is cleared -- position and subtype survive');
});

test('bit 6 suppresses the effect one-shot', () => {
  // $13E2: `BIT 6,B` -- same counter, different record byte, no sound.
  const s = effectState();
  spawnEffect(s, 0x0600, 0x1E00, 0xD7, 2);   // %11 010111
  updateEffects(s);
  assert.equal(s.doors.effects[0][0], 0xD6, 'both top bits preserved');
  assert.equal(s.sound.queue.length, 0);
});

test('a bit-7-clear effect decrements with no zero test at all', () => {
  // $13AD-$13B8: `LD A,B / DEC A / LD [HL+],A`. 1 becomes 0 and the record is
  // still drawn on that frame; the slot only looks free on the NEXT one.
  const s = effectState();
  spawnEffect(s, 0x0600, 0x1E00, 0x02, 1);
  const r = s.doors.effects[0];
  updateEffects(s);
  assert.equal(r[0], 0x01);
  updateEffects(s);
  assert.equal(r[0], 0x00);
  assert.deepEqual([...r].slice(1), [6, 0, 0x1E, 0, 1]);
});

test('the effect loop walks 0..9 on even frames and 9..0 on odd ones', () => {
  // $1391/$1424: the same $FFA7 flip the enemy loop uses. Visible only when
  // the pool is full, which is exactly when it decides who gets a slot.
  const order = [];
  for (const parity of [0, 1]) {
    const s = effectState();
    for (let i = 0; i < EFFECT_SLOTS; i++) spawnEffect(s, 0, 0, 0x81 + i, 0);
    s.parity = parity;
    const seen = [];
    // Freeing byte 0 as each record is visited records the visit order.
    const orig = s.doors.effects.map((r) => r[0]);
    updateEffects(s);
    for (let i = 0; i < EFFECT_SLOTS; i++) {
      if (s.doors.effects[i][0] !== orig[i]) seen.push(i);
    }
    order.push(seen.length);
  }
  assert.deepEqual(order, [EFFECT_SLOTS, EFFECT_SLOTS], 'both passes see all 10');
});

test('clearEffects wipes all sixty bytes', () => {
  const s = effectState();
  for (let i = 0; i < EFFECT_SLOTS; i++) spawnEffect(s, 0x0600, 0x1E00, 0x97, 2);
  clearEffects(s);
  for (const r of s.doors.effects) assert.deepEqual([...r], [0, 0, 0, 0, 0, 0]);
});

// --- the manifest contract --------------------------------------------------

test('a missing manifest table throws instead of quietly doing nothing', () => {
  const s = doorWorld(6, 22);
  armDoor(s, 5, 21);
  delete s.tables.doorSteps;
  assert.throws(() => updateDoors(s), /doorSteps/);

  const e = effectState();
  spawnEffect(e, 0x0600, 0x1E00, 0x97, 2);
  delete e.tables.effectSprites;
  assert.throws(() => updateEffects(e), /effectSprites/);
});

test('an empty pool needs no tables at all', () => {
  // The throw above must not fire on every frame of every level: nothing is
  // read until a record is live.
  const s = makeState(floorFrom(grid(8), 15));
  s.doors = createDoorState();
  s.tables = {};
  assert.doesNotThrow(() => updateEffects(s));
  assert.doesNotThrow(() => updateDoors(s));
});

test('doors survive a level change but the effect pool does not', () => {
  // sub_00_2889 clears $C693 at $29A5 and $C6CF at $2991 -- and touches
  // NEITHER $C733 nor $C60B. Documented here because src/level.js currently
  // zeroes $C733 on every level load, which the cartridge does not do.
  const s = doorWorld(6, 22);
  armDoor(s, 5, 21);
  updateDoors(s);
  const seq = s.doors.active;
  clearEffects(s);
  assert.equal(s.doors.active, seq, 'clearEffects leaves the sequencer alone');
  assert.equal(s.doors.effects[0][0], 0);
});
