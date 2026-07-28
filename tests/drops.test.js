// The $C6CF ballistic pool. ROM: sub_00_0CF3 + loc_00_1444.
//
// Every number asserted here was READ OFF THE CARTRIDGE with
// tools/oracle/drops.py, not derived from the listing -- see the header of
// src/drops.js for the raw trace. The bounce in particular is easy to get one
// frame wrong, because gravity is applied before the rebound is computed.

import test from 'node:test';
import assert from 'node:assert/strict';

import { grid, makeState, floorFrom, placePlayer } from './helpers.js';
import {
  spawnDrop, updateDrops, clearDrops, createDrops, SLOTS,
} from '../src/drops.js';
import { cachePlayerScreen } from '../src/render/metasprite.js';

/**
 * Put the player somewhere AND publish the screen position the pool reads.
 *
 * updateDrops runs at $1444, ahead of the player update whose tail ($1B58)
 * writes $FF93/$FF94 -- so the pool always reads what the PREVIOUS frame left.
 * Seeding it here is what the previous frame would have done.
 */
function playerAt(state, col, row) {
  placePlayer(state, col, row);
  cachePlayerScreen(state);
}

/** A level with solid ground, and the drop pool wired in. */
function dropState(opts = {}) {
  const state = makeState(floorFrom(grid(32), 4), opts);
  state.drops = createDrops();
  state.sound = { queue: [] };
  state.camera.x = 0;
  state.camera.y = 0;
  return state;
}

test('spawnDrop lays out the record exactly as sub_00_0CF3 does', () => {
  const state = dropState();
  // The enemy death site: dir $FF, D = 0, E = 0.
  assert.equal(spawnDrop(state, 0x0981, 0x1200, 0xFF, 0x00, 0x00), 0);
  assert.deepEqual([...state.drops[0]],
                   [0x01, 0x09, 0x81, 0x12, 0x00, 0x00, 0x20, 0x00]);
});

test('spawnDrop: the staging byte picks the drift, and E picks the kind', () => {
  const state = dropState();
  // $0D21: $FF -> no drift, $01 -> -8, anything else -> +8.
  spawnDrop(state, 0x0100, 0x1100, 0x01, 0x00, 0x00);
  assert.equal(state.drops[0][5], 0xF8);
  spawnDrop(state, 0x0100, 0x1100, 0x07, 0x00, 0x00);
  assert.equal(state.drops[1][5], 0x08);
  // $0D03/$0D33: E bit 0 makes it kind $FF with no upward launch at all.
  spawnDrop(state, 0x0100, 0x1100, 0xFF, 0x00, 0x01);
  assert.equal(state.drops[2][0], 0xFF);
  assert.equal(state.drops[2][6], 0x00);
  // $0D33: D bit 0 launches harder.
  spawnDrop(state, 0x0100, 0x1100, 0xFF, 0x01, 0x00);
  assert.equal(state.drops[3][6], 0x38);
});

test('spawnDrop returns -1 once all four slots are taken', () => {
  const state = dropState();
  for (let i = 0; i < SLOTS; i++) {
    assert.equal(spawnDrop(state, 0x0100, 0x1100), i);
  }
  // $0D4F: the fifth request is dropped on the floor. This is the real reason
  // a kill "sometimes" yields nothing.
  assert.equal(spawnDrop(state, 0x0100, 0x1100), -1);
});

test('the arc matches the cartridge frame for frame, bounce included', () => {
  // MEASURED, level 3, enemy killed at x $0981 y $1200. The Y column below is
  // copied straight out of the probe output.
  const want = [
    /* f0  */ [0x1200, 0x20], [0x11E3, 0x1D], [0x11C9, 0x1A], [0x11B2, 0x17],
    /* f4  */ [0x119E, 0x14], [0x118D, 0x11], [0x117F, 0x0E], [0x1174, 0x0B],
    /* f8  */ [0x116C, 0x08], [0x1167, 0x05], [0x1165, 0x02], [0x1166, 0xFF],
    /* f12 */ [0x116A, 0xFC], [0x1171, 0xF9], [0x117B, 0xF6], [0x1188, 0xF3],
  ];

  // A floor low enough that nothing lands during the window above: the arc
  // apex is row $11 and it is still falling through row $11 at f15.
  const state = dropState();
  state.camera.x = 0x0800;
  spawnDrop(state, 0x0981, 0x1200, 0xFF, 0x00, 0x00);
  // The spawn frame itself is the record as written -- the first tick is f1.
  assert.deepEqual([(state.drops[0][3] << 8) | state.drops[0][4],
                    state.drops[0][6]], want[0]);

  for (let f = 1; f < want.length; f++) {
    updateDrops(state, null);
    const r = state.drops[0];
    assert.deepEqual([(r[3] << 8) | r[4], r[6]], want[f],
                     `frame ${f}`);
  }
});

test('the bounce rebounds at three quarters, AFTER gravity is applied', () => {
  // MEASURED: vy $D2 becomes $25, not $23. Gravity takes it to $CF (-49)
  // first, and 49 - (49 >> 2) = 37 = $25. The second bounce is the same rule:
  // $E0 -> -35 -> 35 - 8 = 27 = $1B.
  // Row is the low nibble of Y hi, so $13 is map row 3 (air in this fixture)
  // and the drop has to actually cross into row 4 for the landing test to
  // fire. $13F0 + 49 = $1421, which is row 4.
  const state = dropState();
  const r = state.drops[0];
  state.camera.x = 0x0100;
  r.set([0x01, 0x02, 0x00, 0x13, 0xF0, 0x00, 0xD2, 0x00]);
  updateDrops(state, null);
  assert.equal(r[6], 0x25, 'first bounce');

  r.set([0x01, 0x02, 0x00, 0x13, 0xF0, 0x00, 0xE0, 0x00]);
  updateDrops(state, null);
  assert.equal(r[6], 0x1B, 'second bounce');
});

test('a rebound under $08 comes to rest instead of bouncing forever', () => {
  const state = dropState();
  const r = state.drops[0];
  state.camera.x = 0x0100;
  // $F7 - 3 = -12; 12 - 3 = 9, still bouncing.
  r.set([0x01, 0x02, 0x00, 0x13, 0xFC, 0x00, 0xF7, 0x00]);
  updateDrops(state, null);
  assert.equal(r[6], 0x09);
  assert.equal(r[0], 0x01, 'still airborne');

  // $FB - 3 = -8; 8 - 2 = 6, below the floor -> $1535 latches it at rest.
  r.set([0x01, 0x02, 0x00, 0x13, 0xFC, 0x00, 0xFB, 0x00]);
  updateDrops(state, null);
  assert.equal(r[0], 0xFF, 'at rest');
});

test('a hazard drop shatters on landing with sound $17', () => {
  // $14DC: a nonzero subtype takes the other arm entirely -- the slot is
  // freed on impact instead of bouncing. $14FC: LD BC,$1701.
  const state = dropState();
  const r = state.drops[0];
  state.camera.x = 0x0100;
  r.set([0x01, 0x02, 0x00, 0x13, 0xF0, 0x00, 0xD2, 0x01]);
  updateDrops(state, null);
  assert.equal(r[0], 0, 'shattered, not bounced');
  assert.deepEqual(state.sound.queue, [{ id: 0x17, mask: 0x01 }]);
});

test('a rising drop is never terrain-tested', () => {
  // $14B9 tests bit 7 of the VELOCITY, so a drop on the way up passes through
  // solid cells. Reproduced deliberately: it is what lets a heart thrown from
  // under a ledge clear it.
  const state = dropState();
  const r = state.drops[0];
  r.set([0x01, 0x02, 0x00, 0x14, 0x00, 0x00, 0x20, 0x00]);   // row 4 = solid
  state.camera.x = 0x0100;
  updateDrops(state, null);
  assert.equal(r[0], 0x01, 'not resting');
  assert.ok(r[6] < 0x20, 'still integrating');
});

test('gravity clamps at -96 only once the velocity is negative', () => {
  const state = dropState();
  const r = state.drops[0];
  // Falling in open air, well above the floor, so nothing interrupts.
  r.set([0x01, 0x02, 0x00, 0x10, 0x00, 0x00, 0xA1, 0x00]);
  state.camera.x = 0x0100;
  updateDrops(state, null);
  assert.equal(r[6], 0xA0, '$1473: clamped, not $9E');
  updateDrops(state, null);
  assert.equal(r[6], 0xA0, 'stays there');
});

test('walking onto a drop is +1 HP, capped, and frees the slot', () => {
  const state = dropState();
  playerAt(state, 2, 3);
  state.player.hp = 3;
  state.player.hpMax = 10;
  // At rest, exactly on the player.
  state.drops[0].set([0xFF, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00]);
  updateDrops(state, null);
  assert.equal(state.player.hp, 4, 'MEASURED on the cartridge: 3 -> 4');
  assert.equal(state.drops[0][0], 0, 'slot freed');
  // $15FF: LD BC,$1601 -> sub_00_0AE1 takes B as the ID and C as the mask.
  // Reversed, this asked for sound $01 and the pickup chimed with the wrong
  // cue -- audible, and not something any memory comparison would catch.
  assert.deepEqual(state.sound.queue, [{ id: 0x16, mask: 0x01 }]);
});

test('a drop taken at full HP is still consumed', () => {
  // $1608 CP B / JR NC skips the increment but the slot was already cleared at
  // $15CF -- which is why the probe at full health showed nothing happening.
  const state = dropState();
  playerAt(state, 2, 3);
  state.player.hp = 10;
  state.player.hpMax = 10;
  state.drops[0].set([0xFF, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00]);
  updateDrops(state, null);
  assert.equal(state.player.hp, 10);
  assert.equal(state.drops[0][0], 0, 'consumed anyway');
});

test('a hazard drop damages 2 and stamps knockback by facing', () => {
  const state = dropState();
  playerAt(state, 2, 3);
  state.player.hp = 8;
  state.player.facing = 0;
  state.drops[0].set([0xFF, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x01]);
  updateDrops(state, null);
  assert.equal(state.player.hp, 6);
  assert.equal(state.player.iframes, 0xDA, '$FF88 == 0 -> $DA');

  state.player.hp = 8;
  state.player.iframes = 0;
  state.player.facing = 1;
  state.drops[1].set([0xFF, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x01]);
  updateDrops(state, null);
  assert.equal(state.player.iframes, 0x5A);
});

test('a hazard cannot hit while knockback or death is still running', () => {
  const state = dropState();
  playerAt(state, 2, 3);
  state.player.hp = 8;
  state.player.iframes = 0x40;                 // $15DF: $C714 still counting
  state.drops[0].set([0xFF, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x01]);
  updateDrops(state, null);
  assert.equal(state.player.hp, 8, 'no damage');
  assert.equal(state.drops[0][0], 0, 'but the drop is gone regardless');
});

test('the resting counter steps every OTHER frame and then frees the slot', () => {
  const state = dropState();
  playerAt(state, 20, 3);                   // far from the drop
  const r = state.drops[0];
  // Row 4, i.e. ON the floor -- a resting drop over air takes the $156F arm
  // and starts falling again instead of counting down.
  r.set([0xFF, 0x02, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00]);

  state.frame = 0;
  updateDrops(state, null);
  assert.equal(r[0], 0xFE, '$FFB1 even -> steps');
  state.frame = 1;
  updateDrops(state, null);
  assert.equal(r[0], 0xFE, '$FFB1 odd -> holds');

  // Run it out. $7F steps at one per two frames.
  r[0] = 0x81;
  state.frame = 0;
  updateDrops(state, null);
  assert.equal(r[0], 0x00, 'the last step frees the slot outright');
});

test('a resting drop falls again if the ground under it disappears', () => {
  const state = dropState();
  playerAt(state, 20, 3);
  const r = state.drops[0];
  r.set([0xC0, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00]);
  // Row 3 is air in this fixture -- the floor starts at 4 -- so $156F fires.
  state.frame = 1;                             // hold the counter still
  updateDrops(state, null);
  assert.equal(r[0] & 0x80, 0, 'RES 7: airborne again');
});

test('a resting drop rides a conveyor', () => {
  const g = floorFrom(grid(32), 4);
  g[3].fill('>');                              // collision $02, conveyor right
  const state = makeState(g);
  state.drops = createDrops();
  state.sound = { queue: [] };
  state.camera.x = 0; state.camera.y = 0;
  playerAt(state, 20, 3);
  const r = state.drops[0];
  r.set([0xC0, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00]);
  state.frame = 1;
  updateDrops(state, null);
  assert.equal((r[1] << 8) | r[2], 0x0204, '$1580: +4');

  g[3].fill('<');                              // collision $03
  state.level.cells = makeState(g).level.cells;
  r.set([0xC0, 0x02, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00]);
  updateDrops(state, null);
  assert.equal((r[1] << 8) | r[2], 0x01FC, '$157B: -4');
});

test('clearDrops empties the pool', () => {
  const state = dropState();
  spawnDrop(state, 0x0100, 0x1100);
  clearDrops(state);
  assert.ok(state.drops.every((r) => r[0] === 0));
});
