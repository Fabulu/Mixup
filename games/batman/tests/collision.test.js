// Collision probing.
// ROM: sub_00_20BA (core) + loc_00_227C (the empty-cell fallback sweep),
//      sub_00_1DB9 floor, sub_00_1EA6 ceiling, sub_00_1EF9/$1FAF horizontal,
//      addressing sub_00_11B9.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  probe, probeFloor, probeCeiling, horizontalCell, resolveWall,
  COLL, PROBE_DX_RIGHT, PROBE_DX_LEFT,
  MODE_HORIZONTAL, MODE_CEILING, MODE_FLOOR, MODE_PUNCH, updateBreakables,
} from '../src/collision.js';
import { mapCollision, mapTile } from '../src/state.js';
import { BTN } from '../src/player.js';

import {
  makeState, grid, put, fillCol, floorFrom, placePlayer, setInput, corridor,
} from './helpers.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

test('probe mode ids match $C72B (master reference §6.4)', () => {
  assert.equal(MODE_HORIZONTAL, 1);
  assert.equal(MODE_CEILING, 3);
  assert.equal(MODE_FLOOR, 4);
  assert.equal(MODE_PUNCH, 5);
});

test('collision byte values match master reference §6.3', () => {
  assert.equal(COLL.AIR, 0x00);
  assert.equal(COLL.SOLID, 0x01);
  assert.equal(COLL.CONVEYOR_R, 0x02);
  assert.equal(COLL.CONVEYOR_L, 0x03);
  assert.equal(COLL.EXIT, 0x04);
  assert.equal(COLL.TRIGGER, 0x05);
  assert.equal(COLL.BREAKABLE, 0x06);
  assert.equal(COLL.SOLID2, 0x07);
  assert.equal(COLL.WATER, 0x08);
  assert.equal(COLL.SOLID_STEP, 0x09);
  assert.equal(COLL.DOOR, 0x1F);
  assert.equal(COLL.PICKUP_ENERGY, 0x20);
  assert.equal(COLL.PICKUP_AMMO, 0x21);
  assert.equal(COLL.PICKUP_MAXHP, 0x22);
  assert.equal(COLL.SPIKE, 0xFD);
  assert.equal(COLL.SOLID_RUNTIME, 0xFF);
});

test('horizontal probe offsets are +8 px / -9 px, asymmetrically', () => {
  // ROM: $1EFE (DE = $0080) and $1FB4 (DE = $FF70 = -$0090).
  assert.equal(PROBE_DX_RIGHT, 0x0080);
  assert.equal(PROBE_DX_LEFT, -0x0090);
  assert.notEqual(PROBE_DX_RIGHT, -PROBE_DX_LEFT);
});

// ---------------------------------------------------------------------------
// probe()
// ---------------------------------------------------------------------------

test('probe reads the cell at (position + offset)', () => {
  // ROM: sub_00_20BA $20D3-$20E7.
  const g = grid(8);
  put(g, 3, 5, '#');
  const state = makeState(g);
  placePlayer(state, 2, 5, 0x80, 0x40);

  const hit = probe(state, 0x0100, 0);
  assert.equal(hit.col, 3);
  assert.equal(hit.row, 0x15);            // Y hi, not the folded map row
  assert.equal(hit.value, COLL.SOLID);
});

test('probe reports subX, the pixel within the metatile (feeds the slope tables)', () => {
  // ROM: $20E1 -> $FFBC, indexes the 16-entry height tables at 0:$221C.
  const state = makeState(grid(8));
  placePlayer(state, 2, 5, 0x80, 0x00);
  assert.equal(probe(state, 0, 0).subX, 0x08);
  placePlayer(state, 2, 5, 0x3F, 0x00);
  assert.equal(probe(state, 0, 0).subX, 0x03);
});

test('probe below the world returns 0 without touching the map', () => {
  // ROM: $20CB `CP $20 / JR NC` -- Y hi $20 is past the bottom row.
  const state = makeState(floorFrom(grid(8), 0, '#'));
  placePlayer(state, 2, 15, 0x80, 0x00);   // Y hi = $1F
  const hit = probe(state, 0, 0x0100);
  assert.equal(hit.row, 0x20);
  assert.equal(hit.value, 0);
});

test('probe off the side of the map reads SOLID', () => {
  // ROM: mapCollision fallback -- the world is walled in.
  const state = makeState(grid(4));
  placePlayer(state, 3, 5, 0x80);
  assert.equal(probe(state, 0x0100, 0).value, COLL.SOLID);
});

// ---------------------------------------------------------------------------
// probeFloor()
// ---------------------------------------------------------------------------

/** Player on map row 13 with the given cell directly under him at row 14. */
function floorFixture(ch, { ylo = 0x30 } = {}) {
  const g = grid(8);
  put(g, 3, 14, ch);
  const state = makeState(g);
  placePlayer(state, 3, 13, 0x80, ylo);
  state.player.vy = -20;
  return state;
}

test('probeFloor lands on solid: snaps the Y low byte to 0 and zeroes VelY', () => {
  // ROM: loc_00_1E35 -- `XOR A / LD ($FF84),A` then `LD ($FF87),A`.
  const state = floorFixture('#');
  const r = probeFloor(state);
  assert.equal(r.landed, true);
  assert.equal(state.player.y & 0xFF, 0x00);
  assert.equal(state.player.y >> 8, 0x1D);      // still on its own row
  assert.equal(state.player.vy, 0);
});

test('probeFloor probes exactly one hitbox-height (a whole metatile) below', () => {
  // ROM: $1DBB loads BC from $FF8D ($10 px = $100 subpx).
  const state = floorFixture('#');
  const r = probeFloor(state);
  assert.equal(r.row, 0x1E);
  assert.equal(r.col, 3);
});

test('probeFloor: air does not land', () => {
  const state = floorFixture('.');
  const before = state.player.y;
  const r = probeFloor(state);
  assert.equal(r.landed, false);
  assert.equal(state.player.y, before);
  assert.equal(state.player.vy, -20);
});

test('probeFloor: spikes hurt but do NOT stop the fall', () => {
  // ROM: $1DDA -- the spike arm returns without touching $FF84/$FF87.
  const state = floorFixture('^');
  const before = state.player.y;
  const r = probeFloor(state);
  assert.equal(r.landed, false);
  assert.equal(r.value, COLL.SPIKE);
  assert.equal(state.player.y, before);
  assert.equal(state.player.vy, -20);
});

test('probeFloor: SOLID2 lands via the loc_00_1E35 arms', () => {
  for (const ch of ['#', 'S', 'T']) {
    const state = floorFixture(ch);
    assert.equal(probeFloor(state).landed, true, `char ${ch}`);
    assert.equal(state.player.vy, 0, `char ${ch}`);
  }
});

test('probeFloor: runtime-solid ($FF) lands WITHOUT snapping Y or VelY', () => {
  // $1DDE `CP $FF / RET Z` fires before the `AND $1F` at $1DE1, so $FF never
  // reaches the door arm and never runs loc_00_1E35. That matters now that the
  // object-overlap scan can return $FF: the scan has already placed the player
  // on the object's surface, and $1E35 would drag him to metatile alignment.
  // VelY is cleared a step later by the caller, at loc_00_1B41.
  const state = floorFixture('X');
  const before = state.player.y;
  const r = probeFloor(state);
  assert.equal(r.landed, true);
  assert.equal(state.player.y, before, 'Y untouched by the probe');
  assert.equal(state.player.vy, -20, 'VelY untouched by the probe');
});

test('probeFloor: an actor-owned destructible ($1F in the low 5 bits) is solid', () => {
  // ROM: $1DE1 `AND $1F / CP $1F` -- the top 3 bits are the $C1E8 slot.
  for (const ch of ['D', 'd']) {                 // $1F and $3F
    const state = floorFixture(ch);
    assert.equal(probeFloor(state).landed, true, `char ${ch}`);
    assert.equal(state.player.y & 0xFF, 0x00, `char ${ch}`);
  }
});

test('probeFloor: water is passable and sets ONLY the behind-BG attr', () => {
  // ROM: loc_00_1EA0 is `LD A,$80 / LDH [$FF96],A / XOR A / RET` -- it writes
  // $FF96 (the OAM attribute) and nothing else. It does NOT set $FF95:
  // slow/water movement is armed by the water-surface subsystem, not by
  // touching a water cell. Setting slowMode here halves gravity everywhere a
  // water tile is touched and desynced level 5 within 80 frames.
  const state = floorFixture('~');
  const r = probeFloor(state);
  assert.equal(r.landed, false);
  assert.equal(state.player.attrMask, 0x80);
  assert.equal(state.player.slowMode, 0, 'water must NOT arm slow mode');
  assert.equal(state.player.vy, -20, 'water does not stop the fall');
});

test('probeFloor: conveyors land you and queue a +/-4 carry', () => {
  // ROM: $1E3D / $1E51 -- $C72F = +4 / -4.
  const right = floorFixture('>');
  assert.equal(probeFloor(right).landed, true);
  assert.equal(right.carry.x, 4);
  assert.equal(right.player.vy, 0);

  const left = floorFixture('<');
  assert.equal(probeFloor(left).landed, true);
  assert.equal(left.carry.x, -4);
});

test('probeFloor: a conveyor does not carry you mid rope-flight ($C71E == 2)', () => {
  // ROM: $1E45 -- the action-2 check skips the $C72F write.
  const state = floorFixture('>');
  state.player.action = 2;
  assert.equal(probeFloor(state).landed, true);
  assert.equal(state.carry.x, 0);
});

test('probeFloor: breakable lands, turns solid, and does NOT snap Y or VelY', () => {
  // ROM: $1E65 -- `LD (HL),$01` plus a timer at $C67B, then `LD A,$01 / RET`.
  // Like the step-solid arm below it never reaches loc_00_1E35, so $FF84 and
  // $FF87 are left alone; the caller's $1B44 is what zeroes vy on the landing
  // transition. MEASURED on level 7 (the col-16 floor is a $06 cell): the
  // cartridge lands at y = 6668 with its low byte intact, and a port that
  // snapped here landed a whole frame early.
  const state = floorFixture('B');
  const r = probeFloor(state);
  assert.equal(r.landed, true);
  assert.equal(mapCollision(state, 3, 14), COLL.SOLID, 'the cell went solid');
  assert.equal(state.player.y & 0xFF, 0x30, 'no Y snap on this arm');
  assert.equal(state.player.vy, -20, 'no VelY reset on this arm');
});

test('a broken cell is ERASED when its timer expires, not restored', () => {
  // ROM: $1364 -- `XOR A / LD [HL+],A / LD (HL),A` clears the graphic AND the
  // collision byte. The cell crumbles away and leaves a hole; putting $06 back
  // (the port's old behaviour) leaves a floor the cartridge does not have.
  const state = floorFixture('B');
  state.level.number = 7;
  state.flow.difficulty = 1;                        // $1E8A: a $0C timer
  probeFloor(state);
  for (let i = 0; i < 0x0C; i++) updateBreakables(state);
  assert.equal(mapCollision(state, 3, 14), 0, 'collision cleared');
  assert.equal(mapTile(state, 3, 14), 0, 'graphic cleared too');
});

test('the restore queue only ticks on levels 5, 7 and $0C', () => {
  // ROM: $1339-$1347. Everywhere else sub_00_1336 jumps past loc_00_1349, so
  // a stepped-on breakable stays solid for the rest of the level. Consistent
  // with the data: levels 5, 7 and 12 are the ONLY ones whose maps contain a
  // $06 cell at all.
  const state = floorFixture('B');
  state.level.number = 3;
  state.flow.difficulty = 1;
  probeFloor(state);
  for (let i = 0; i < 0x40; i++) updateBreakables(state);
  assert.equal(mapCollision(state, 3, 14), COLL.SOLID, 'still solid');
});

test('$FFC6 is cleared at the head of the player update', () => {
  // ROM: $1336-$1338, `XOR A / LDH [$FFC6],A`, before anything else in
  // sub_00_1336 -- and nothing else in the game ever zeroes it. The overlap
  // scan rebuilds it, and every object's +$0D riding flag hangs off it, so a
  // latched $FFC6 means a platform keeps carrying a player who stepped off.
  const state = floorFixture('#');
  state.standingOnActor = 1;
  updateBreakables(state);
  assert.equal(state.standingOnActor, 0);
});

test('probeFloor: step-solid ($09) reports landed but does NOT snap Y or VelY', () => {
  // ROM: $1E3A -- this arm skips loc_00_1E35. Documents actual behaviour.
  const state = floorFixture('s', { ylo: 0x30 });
  const r = probeFloor(state);
  assert.equal(r.landed, true);
  assert.equal(state.player.y & 0xFF, 0x30, 'no Y snap on this arm');
  assert.equal(state.player.vy, -20, 'no VelY reset on this arm');
});

test('probeFloor: an energy pickup is consumed, clears its cell, and is not solid', () => {
  // ROM: $1DE7 -> loc_01_4D4E.
  const state = floorFixture('e');
  state.player.hp = 1;
  const r = probeFloor(state);
  assert.equal(r.landed, false);
  assert.equal(state.player.hp, 7);                     // +6, ROM: $04DB6
  assert.equal(mapCollision(state, 3, 14), COLL.AIR);   // cell cleared
});

test('probeFloor: an energy pickup cannot exceed max HP', () => {
  const state = floorFixture('e');
  state.player.hp = 9;
  state.player.hpMax = 10;
  probeFloor(state);
  assert.equal(state.player.hp, 10);
});

test('probeFloor: ammo and max-HP pickups', () => {
  // ROM: $04DA0 (+10 batarangs) and $04D69 (+2 max HP, cap $10 at $04D6F).
  const ammo = floorFixture('a');
  probeFloor(ammo);
  assert.equal(ammo.flow.ammo, 10);

  const max = floorFixture('m');
  max.player.hp = 3;
  max.player.hpMax = 10;
  probeFloor(max);
  assert.equal(max.player.hpMax, 12);
  assert.equal(max.player.hp, 12, 'a max-HP pickup refills');

  const capped = floorFixture('m');
  capped.player.hpMax = 16;
  probeFloor(capped);
  assert.equal(capped.player.hpMax, 16);
});

// ---------------------------------------------------------------------------
// probeCeiling()
// ---------------------------------------------------------------------------

/** Player on map row 6 with the given cell above him at row 5. */
function ceilingFixture(ch) {
  const g = grid(8);
  put(g, 3, 5, ch);
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x80, 0x00);
  return state;
}

test('probeCeiling probes one half-WIDTH above and flattens solids to 1', () => {
  // ROM: sub_00_1EA6, BC = -$FF8C (the half-width, not height), and every
  // solid funnels into $1EE2 which returns exactly 1 -- only $FF survives
  // with its own value, so the caller can skip the row snap at $1AA5.
  assert.equal(probeCeiling(ceilingFixture('#')), 1);
  assert.equal(probeCeiling(ceilingFixture('S')), 1);
  assert.equal(probeCeiling(ceilingFixture('X')), COLL.SOLID_RUNTIME);
});

test('probeCeiling ignores air, water, spikes and pickups', () => {
  // ROM: $1EA6 arms -- only solid stops a rise.
  for (const ch of ['.', '~', '^', 'e', 'a', 'm']) {
    assert.equal(probeCeiling(ceilingFixture(ch)), 0, `char ${ch}`);
  }
});

// ---------------------------------------------------------------------------
// horizontalCell() -- the THREE-CELL sweep
// ---------------------------------------------------------------------------

/**
 * Player at col 3; the right probe (+8 px from xlo $80) lands in col 4.
 * `cells` is {own, above, below} for col 4 rows 6 / 5 / 7.
 */
function sweepFixture({ own = '.', above = '.', below = '.', ylo = 0x00 } = {}) {
  const g = grid(8);
  put(g, 4, 6, own);
  put(g, 4, 5, above);
  put(g, 4, 7, below);
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x80, ylo);
  return state;
}

test('sweep arm 1: the player own row is sampled first and short-circuits', () => {
  // ROM: sub_00_20BA $20E9 -- a non-zero cell returns immediately.
  const state = sweepFixture({ own: '#', above: 'X', below: 'X' });
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('sweep arm 2: an empty own cell falls through to the cell ABOVE', () => {
  // ROM: loc_00_227C -> $22A6 `RET NZ`.
  const state = sweepFixture({ own: '.', above: '#', ylo: 0x00 });
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('sweep arm 2 is gated by half-WIDTH ($FF8C), not half-height', () => {
  // ROM: $2287 `SUB (halfW - 3)` -- the load-bearing asymmetry.
  const state = sweepFixture({ own: '.', above: '#', ylo: 0x00 });
  state.player.halfH = 0x10;

  state.player.halfW = 3;      // pixelY(0) - 0 -> no borrow -> arm skipped
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);

  state.player.halfW = 0x0F;   // pixelY(0) - 12 -> borrow -> arm taken
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('sweep arm 2 is skipped once the hitbox no longer pokes past the metatile top', () => {
  // ROM: $2287 with halfW $0F -- the borrow needs pixelY < 12.
  const state = sweepFixture({ own: '.', above: '#', ylo: 0xC0 });   // pixelY = 12
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);
  placePlayer(state, 3, 6, 0x80, 0xB0);                              // pixelY = 11
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('sweep arm 3: an empty own AND above cell falls through to the cell BELOW', () => {
  // ROM: $228A / $22C3.
  const state = sweepFixture({ own: '.', above: '.', below: '#', ylo: 0x30 });
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('sweep arm 3 is gated by half-HEIGHT ($FF8D), not half-width', () => {
  // ROM: $228A `ADD (halfH - 3)` -- the other half of the asymmetry.
  const state = sweepFixture({ own: '.', above: '.', below: '#', ylo: 0x30 });
  state.player.halfW = 0x0F;

  state.player.halfH = 3;      // pixelY(3) + 0 < $10 -> arm skipped
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);

  state.player.halfH = 0x10;   // pixelY(3) + 13 >= $10 -> arm taken
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('sweep arm 3 is skipped when the hitbox does not poke past the metatile bottom', () => {
  // ROM: $228A with halfH $10 -- needs pixelY >= 3.
  const state = sweepFixture({ own: '.', above: '.', below: '#', ylo: 0x20 });
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);   // pixelY = 2
  placePlayer(state, 3, 6, 0x80, 0x30);
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);   // pixelY = 3
});

test('the ABOVE arm wins over the BELOW arm when both would hit', () => {
  // ROM: $22A6 returns before $228A is reached.
  const state = sweepFixture({ own: '.', above: '#', below: 'X', ylo: 0x30 });
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

test('the sweep returns 0 when all three cells are empty', () => {
  const state = sweepFixture({ ylo: 0x30 });
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);
});

test('the BELOW arm stops at the bottom of the world instead of wrapping columns', () => {
  // ROM: $22B9 -- without this guard the `INC HL` would read col+1 row 0.
  const g = grid(8);
  put(g, 5, 0, 'X');           // cellIndex(4,15)+1 == cellIndex(5,0)
  const state = makeState(g);
  placePlayer(state, 3, 15, 0x80, 0x30);
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);
});

test('the sweep below the world returns 0', () => {
  // ROM: $20CB.
  const state = makeState(floorFrom(grid(8), 0, '#'));
  placePlayer(state, 3, 15, 0x80, 0x00);
  state.player.y = (0x20 << 8);
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);
});

test('the left probe reaches 9 px, one more than the right probe reaches', () => {
  // ROM: DE = $FF70 vs $0080.
  const g = grid(8);
  fillCol(g, 2, '#');
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x80, 0x00);
  assert.equal(horizontalCell(state, PROBE_DX_LEFT), COLL.SOLID);   // 3.5 px - 9 px -> col 2
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);
});

test('the sweep off the right edge of the map reads SOLID', () => {
  const state = makeState(grid(4));
  placePlayer(state, 3, 6, 0x80, 0x00);
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), COLL.SOLID);
});

// ---------------------------------------------------------------------------
// resolveWall()
// ---------------------------------------------------------------------------

/** Solid-ish column at col 4; player at col 3 so the right probe reaches it. */
function wallFixture(ch, { xlo = 0x80, vx = 0, col = 4 } = {}) {
  const g = grid(8);
  fillCol(g, col, ch);
  const state = makeState(g);
  placePlayer(state, 3, 6, xlo, 0x00);
  state.player.vx = vx;
  return state;
}

test('resolveWall: empty air does not block and does not move the player', () => {
  // ROM: $1F08 / $1FBE `RET Z`.
  const state = wallFixture('.');
  const x = state.player.x;
  assert.equal(resolveWall(state, 'right'), 0);
  assert.equal(state.player.x, x);
});

test('resolveWall: a trigger cell ($05) diverts and does not block', () => {
  // ROM: $1F20.
  const state = wallFixture('T');
  const x = state.player.x;
  assert.equal(resolveWall(state, 'right'), 0);
  assert.equal(state.player.x, x);
});

test('resolveWall: water diverts to $1EA0 and does not block', () => {
  // ROM: $1F2E -> loc_00_1EA0, which sets $FF96 only -- not $FF95.
  const state = wallFixture('~');
  assert.equal(resolveWall(state, 'right'), 0);
  assert.equal(state.player.attrMask, 0x80);
  assert.equal(state.player.slowMode, 0, 'water must NOT arm slow mode');
});

test('resolveWall: a pickup is consumed and does not block', () => {
  // ROM: $1F1B -> loc_01_4D4E.
  const state = wallFixture('e');
  state.player.hp = 1;
  assert.equal(resolveWall(state, 'right'), 0);
  assert.equal(state.player.hp, 7);
});

test('resolveWall: runtime-solid and spikes block WITHOUT the 1 px push', () => {
  // ROM: $1F65 / $1F8B -- these two arms `RET` before loc_00_1F6E.
  for (const ch of ['X', '^']) {
    const state = wallFixture(ch);
    const x = state.player.x;
    assert.equal(resolveWall(state, 'right'), 1, `char ${ch}`);
    assert.equal(state.player.x, x, `char ${ch} must not be pushed`);
  }
});

test('resolveWall right: pushes 1 px out then SNAPS xlo back to $80', () => {
  // ROM: $1F6E push, $1F74 tests, $1F80 `LD A,$80 / LD ($FF82),A`.
  // xlo $80 -> push to $70 -> below centre and VelX not carrying away -> snap.
  const state = wallFixture('#', { xlo: 0x80, vx: 0 });
  assert.equal(resolveWall(state, 'right'), 1);
  assert.equal(state.player.x, (3 << 8) | 0x80, 'standing beside a wall is stable');
});

test('resolveWall right: NO snap when VelX is already carrying the player away', () => {
  // ROM: $1F7A `BIT 7,A / JR NZ` -- moving left keeps the permanent 1 px offset.
  const state = wallFixture('#', { xlo: 0x80, vx: -1 });
  assert.equal(resolveWall(state, 'right'), 1);
  assert.equal(state.player.x, (3 << 8) | 0x70);
});

test('resolveWall right: NO snap when the push already left xlo past the centre', () => {
  // ROM: $1F74 `CP $80 / JR NC`.
  const state = wallFixture('#', { xlo: 0xA0, vx: 0 });
  assert.equal(resolveWall(state, 'right'), 1);
  assert.equal(state.player.x, (3 << 8) | 0x90);
});

test('resolveWall left: pushes 1 px out then SNAPS xlo back to $80', () => {
  // ROM: $1F94 push, $1F9A tests, $1FA9 snap.
  const state = wallFixture('#', { xlo: 0x80, vx: 0, col: 2 });
  assert.equal(resolveWall(state, 'left'), 1);
  assert.equal(state.player.x, (3 << 8) | 0x80);
});

test('resolveWall left: NO snap when VelX is already carrying the player away', () => {
  // ROM: $1FA3 -- moving right off a left-hand wall.
  const state = wallFixture('#', { xlo: 0x80, vx: 1, col: 2 });
  assert.equal(resolveWall(state, 'left'), 1);
  assert.equal(state.player.x, (3 << 8) | 0x90);
});

test('resolveWall left: NO snap when the push left xlo below the centre', () => {
  // ROM: $1F9A `CP $80 / JR C`.
  const state = wallFixture('#', { xlo: 0x60, vx: 0, col: 2 });
  assert.equal(resolveWall(state, 'left'), 1);
  assert.equal(state.player.x, (3 << 8) | 0x70);
});

test('resolveWall: an actor-owned door blocks regardless of its slot bits', () => {
  // ROM: $1F14 masks with $1F and tests for $1F BEFORE the >= $20 pickup arm.
  // The top 3 bits are the owning $C1E8 slot, so $3F is slot 1's door and is
  // still solid. Testing the pickup range first made any door with slot bits
  // set read as walkable.
  // Both report blocked. resolveWall returns the $1F84 `LD A,$01` signal, not
  // the raw collision byte.
  const state = wallFixture('d');          // $3F - slot 1's door
  assert.equal(resolveWall(state, 'right'), 1);
  const plain = wallFixture('D');          // $1F - slot 0
  assert.equal(resolveWall(plain, 'right'), 1);
});

// ---------------------------------------------------------------------------
// wall cling.  ROM: loc_00_1F33 (right) / loc_00_1FE9 (left) -> sub_00_1DA0
// ---------------------------------------------------------------------------

/** Airborne, A held after a release, facing into the wall. */
function clingFixture(side) {
  const right = side === 'right';
  const state = wallFixture('#', { xlo: 0x80, vx: 0, col: right ? 4 : 2 });
  const p = state.player;
  p.air = 2;
  p.facing = right ? 0 : 1;
  p.jumpReleased = 1;
  p.vy = -10;
  setInput(state, BTN.A);
  return state;
}

test('wall cling flips the facing BEFORE looking up VelX in 0:$27A6', () => {
  // ROM: $1F52 sets $FF88, THEN sub_00_1DA0 indexes the table with it.
  // A right-hand wall therefore launches you LEFT.
  const state = clingFixture('right');
  assert.equal(resolveWall(state, 'right'), 0, 'a cling reports "clear"');
  assert.equal(state.player.facing, 1);
  assert.equal(state.player.vx, -0x14);

  const left = clingFixture('left');
  assert.equal(resolveWall(left, 'left'), 0);
  assert.equal(left.player.facing, 0);
  assert.equal(left.player.vx, 0x14);
});

test('wall cling performs the jump immediately and sets a 16-frame lock', () => {
  // ROM: sub_00_1DA0 + $1F56 ($50) / $200F ($30). Low 5 bits = the countdown.
  const state = clingFixture('right');
  resolveWall(state, 'right');
  const p = state.player;
  assert.equal(p.clingLock, 0x50);
  assert.equal(p.clingLock & 0x1F, 16);
  assert.equal(p.clingLock & 0xE0, 0x40, 'top 3 bits hold the launch direction');
  assert.equal(p.air, 1);
  assert.equal(p.vy, 0x22);          // ROM: $01DA9 wallJumpVelocityY
  assert.equal(p.airThrottle, 1);
  assert.equal(p.jumpReleased, 0);   // ROM: $1F5D
  assert.equal(p.action, 0);         // ROM: $1F34 cancels the bat-rope
});

test('a left-wall cling uses lock $30 (direction bits $20)', () => {
  // ROM: $200F.
  const state = clingFixture('left');
  resolveWall(state, 'left');
  assert.equal(state.player.clingLock, 0x30);
  assert.equal(state.player.clingLock & 0x1F, 16);
  assert.equal(state.player.clingLock & 0xE0, 0x20);
});

test('wall cling does not move the player on the cling frame', () => {
  // ROM: $1F60 returns A = 0, so loc_00_1F6E's push is never reached.
  const state = clingFixture('right');
  const { x, y } = state.player;
  resolveWall(state, 'right');
  assert.equal(state.player.x, x);
  assert.equal(state.player.y, y);
});

test('wall cling requires: airborne, A released then re-held, and facing the wall', () => {
  // ROM: $1F3D facing, $1F42 $FFC2, $1F47 A held, $1F4D $FF80.
  const grounded = clingFixture('right');
  grounded.player.air = 0;
  assert.equal(resolveWall(grounded, 'right'), 1);
  assert.equal(grounded.player.clingLock, 0);

  const notReleased = clingFixture('right');
  notReleased.player.jumpReleased = 0;
  assert.equal(resolveWall(notReleased, 'right'), 1);
  assert.equal(notReleased.player.clingLock, 0);

  const noA = clingFixture('right');
  setInput(noA, 0);
  assert.equal(resolveWall(noA, 'right'), 1);
  assert.equal(noA.player.clingLock, 0);

  const wrongFacing = clingFixture('right');
  wrongFacing.player.facing = 1;
  assert.equal(resolveWall(wrongFacing, 'right'), 1);
  assert.equal(wrongFacing.player.clingLock, 0);
});

test('a failed cling still cancels the bat-rope action', () => {
  // ROM: $1F34 writes $C71E = 0 before any of the guards.
  const state = clingFixture('right');
  state.player.air = 0;
  state.player.action = 3;
  resolveWall(state, 'right');
  assert.equal(state.player.action, 0);
});

test('wall-jump honours BOTH velocity tunables', () => {
  // ROM: $01DA9 (Y) and the 0:$27A6 table (X). Both must come from tunables so
  // the mod system owns them -- X used to be a hard-coded module literal.
  // Facing flips to left before the lookup, so X comes out negated.
  const g = fillCol(grid(8), 4, '#');
  const state = makeState(g, { tunables: { wallJumpVelocityY: 9, wallJumpVelocityX: 99 } });
  placePlayer(state, 3, 6, 0x80, 0x00);
  Object.assign(state.player, { air: 2, facing: 0, jumpReleased: 1, vx: 0 });
  setInput(state, BTN.A);
  resolveWall(state, 'right');
  assert.equal(state.player.vy, 9, 'wallJumpVelocityY is honoured');
  assert.equal(state.player.vx, -99, 'wallJumpVelocityX is honoured');
  assert.equal(state.player.facing, 1, 'facing flips before the X lookup');
});

// ---------------------------------------------------------------------------
// smoke: a corridor is walkable
// ---------------------------------------------------------------------------

test('a fixture corridor has ground under the player and open air around him', () => {
  const state = makeState(corridor(32, 14));
  placePlayer(state, 5, 13, 0x80, 0x00);
  assert.equal(horizontalCell(state, PROBE_DX_RIGHT), 0);
  assert.equal(horizontalCell(state, PROBE_DX_LEFT), 0);
  assert.equal(probeFloor(state).landed, true);
});

// ---------------------------------------------------------------------------
// Map-object overlap.  ROM: loc_00_2426 - loc_00_2643.
// ---------------------------------------------------------------------------

/**
 * Level 3's actual arrival: an empty map column with $C1E8 slot 0, a live
 * type $08, parked underneath. Numbers are the cartridge's, read off $C1E8
 * with tools/oracle/arrival.py.
 */
function objectFloorFixture({ type = 0x88, halfW = 0x10, halfH = 0x09 } = {}) {
  const state = makeState(grid(8));            // all air
  // World row 30, column 1 -- set directly, because placePlayer() takes a MAP
  // row and biases it, and the whole point here is the un-biased world row the
  // cartridge actually spawns at.
  state.player.x = 0x0180;
  state.player.y = 0x1E00;
  state.player.halfW = 0x0F;                   // $FF8C
  state.player.halfH = 0x10;                   // $FF8D
  state.camera.x = 256;
  state.camera.y = 5888;
  const r = state.actors[0];
  r[0] = type;
  r[1] = 0x02; r[2] = 0x00;                    // world X $0200
  r[3] = 0x1F; r[4] = 0x80;                    // world Y $1F80
  r[7] = halfW;
  r[8] = halfH;
  r[9] = 0x18;                                 // cached screen X, as $4852 writes
  r[10] = 0x98;                                // cached screen Y
  return state;
}

test('a live map object is a floor where the map has none', () => {
  const state = objectFloorFixture();
  const r = probeFloor(state);
  assert.equal(r.value, COLL.SOLID_RUNTIME);
  assert.equal(r.landed, true);
  // $253A-$2559: objY - ((playerHalfH + objHalfH - 1) << 4).
  // 8064 - ((16 + 9 - 1) << 4) = 8064 - 384 = 7680. Measured on the cartridge.
  assert.equal(state.player.y, 7680);
  assert.equal(state.actors[0][13], 1, 'the riding flag is set');
  assert.equal(state.standingOnActor, 1, '$FFC6');
});

test('an object with bit 7 clear is not live and holds nobody up', () => {
  const state = objectFloorFixture({ type: 0x08 });   // $244D
  assert.equal(probeFloor(state).landed, false);
});

test('object types $07 and $09 are skipped by the scan', () => {
  // $2454 / $2459 -- which is exactly why levels 1, 5 and 7 stayed bit-exact
  // for so long without the scan existing at all.
  for (const t of [0x87, 0x89]) {
    const state = objectFloorFixture({ type: t });
    assert.equal(probeFloor(state).landed, false, `type $${t.toString(16)}`);
  }
});

test('the object scan misses once the player is beyond its half-width', () => {
  const state = objectFloorFixture({ halfW: 0x02 });
  assert.equal(probeFloor(state).landed, false);
});

/** The same fixture, but with real ground under the feet as well. */
function objectOverCellFixture(velY) {
  const g = grid(8);
  put(g, 1, 15, '#');                          // solid at the probed row
  const state = makeState(g);
  state.player.x = 0x0180;
  state.player.y = 0x1E30;
  state.player.halfW = 0x0F;
  state.player.halfH = 0x10;
  state.camera.x = 256;
  state.camera.y = 5888;
  state.actors[0].set(
    [0x88, 0x02, 0x00, 0x1F, 0x80, 0x00, velY, 0x10, 0x09, 0x18, 0x98, 0, 0, 0, 0, 0]);
  return state;
}

test('a real map cell beats an object', () => {
  // $2520: $FFBA is non-zero and +6 bit 7 is clear, so $2529 hands back the
  // map's own byte and the object never gets to move anybody.
  const state = objectOverCellFixture(0x00);
  assert.equal(probeFloor(state).value, COLL.SOLID);
});

test('...unless the object`s +6 bit 7 says it overrides', () => {
  // $2525: BIT 7,(HL) -> loc_00_2534, the object wins over solid ground.
  const state = objectOverCellFixture(0x80);
  const r = probeFloor(state);
  assert.equal(r.value, COLL.SOLID_RUNTIME);
  assert.equal(state.player.y, 7680);
});

// ---------------------------------------------------------------------------
// $1F2A / $1FE0 -- $07 goes STRAIGHT to the push handler.
// ---------------------------------------------------------------------------


/** clingFixture, but with the wall's collision byte chosen by the caller. */
function clingFixtureCh(side, ch) {
  const right = side === 'right';
  const state = wallFixture(ch, { xlo: 0x80, vx: 0, col: right ? 4 : 2 });
  const p = state.player;
  p.air = 2;
  p.facing = right ? 0 : 1;
  p.jumpReleased = 1;
  p.vy = -10;
  setInput(state, BTN.A);
  return state;
}

test('$07 must NEVER cling: it jumps past the cling entry to $1F61/$1F87', () => {
  // `CP $07 / JR Z, loc_00_1F61`. This is not a detail: $07 is column 0 of all
  // fourteen levels and BOTH walls of every boss arena, so a port that lets it
  // cling lets the player climb out of every level boundary and every boss
  // fight.
  //
  // MEASURED (playerhunt arms, level 1, script "40:,3:A,6:L,71:LA"): $1FE0
  // executes 99 times and routes to $1F87 all 99; the cling entry $1FE9
  // executes ZERO times. Reverting the arm makes the port diverge at f50 with
  // anim 17 (CLING_B) and vx 20 where the cartridge holds anim 8 and vx 0.
  for (const side of ['right', 'left']) {
    const state = clingFixtureCh(side, 'S');    // 'S' is COLL.SOLID2, $07
    const p = state.player;
    assert.equal(resolveWall(state, side), 1, `${side}: $07 BLOCKS`);
    assert.equal(p.clingLock, 0, `${side}: and never arms a cling`);
    assert.equal(p.vx, 0, `${side}: no wall-jump launch`);
    assert.equal(p.air, 2, `${side}: still falling, not rising`);
  }
});

test('...and $07 still gets the push handler head: $C71E is cancelled', () => {
  // `XOR A / LD [$C71E],A` is the FIRST instruction of $1F61/$1F87, so the
  // direct $07 arm cancels a bat-rope even though it skipped the cling entry
  // that used to supply that write.
  const state = clingFixtureCh('right', 'S');
  state.player.action = 3;
  resolveWall(state, 'right');
  assert.equal(state.player.action, 0);
});

test('an ordinary $01 wall in the same fixture DOES cling', () => {
  // The control: without it "$07 does not cling" could just mean the fixture
  // never clings at all.
  const state = clingFixture('right');
  assert.equal(resolveWall(state, 'right'), 0);
  assert.equal(state.player.clingLock, 0x50);
});

// ---------------------------------------------------------------------------
// $1F25 / $1FDB -> loc_00_1E65 -- walking into a breakable breaks it.
// ---------------------------------------------------------------------------

test('a horizontal probe BREAKS a $06 cell: blocked, no push, no $80 snap', () => {
  // `JP Z, loc_00_1E65`. That arm returns 1 (blocked) via $1E94, and note what
  // it does NOT do -- no 1 px push, no xlo snap, and no `LD [$C71E],A` either,
  // because $1E65 has no such instruction. The port simply had no horizontal
  // break arm at all.
  //
  // MEASURED frame-exact (tools/oracle/breakcells.py, level 5 warp 36,27 hold
  // right): the cartridge breaks (37,29), (37,30) and (37,31) at f13/f22/f26
  // with 12-frame restores and erases at f25/f34/f38, where the port left all
  // three $06 for the whole run.
  const state = wallFixture('B', { xlo: 0x8F, vx: 0x10 });
  state.player.action = 3;
  const x = state.player.x;
  assert.equal(resolveWall(state, 'right'), 1, 'blocked');
  assert.equal(state.player.x, x, 'no push and no snap');
  assert.equal(mapCollision(state, 4, 6), COLL.SOLID, '$1E65: (HL) = $01');
  assert.equal(state.player.action, 3, '$1E65 does not touch $C71E');
  assert.equal(state.breakables[0].col, 4, 'and it queued a restore timer');
  // $FFC1 is the probe's Y HIGH BYTE, which runs $10-$1F in play -- the slot
  // stores it raw and sub_00_11B9 masks it back down.
  assert.equal(state.breakables[0].row, 0x16);
});

test('the LEFT probe breaks too, at its own cell', () => {
  const state = wallFixture('B', { xlo: 0x10, vx: -0x10, col: 2 });
  assert.equal(resolveWall(state, 'left'), 1);
  assert.equal(mapCollision(state, 2, 6), COLL.SOLID);
  assert.equal(state.breakables[0].col, 2);
});

// ---------------------------------------------------------------------------
// $FFC0 / $FFC1 -- the RESOLVED cell, not the probe's own one.
// ---------------------------------------------------------------------------

test('the horizontal sweep hands the BELOW cell to the break arm, not its own', () => {
  // $22B6-$22BF: the sweep's third arm stores the incremented row into $FFC1
  // and falls through with it. loc_00_1E65 then writes (HL) -- the cell $FFC0/
  // $FFC1 point at -- so a breakable found one row DOWN is the one that goes
  // solid. The port used to stamp its own (empty) cell instead, i.e. put SOLID
  // into thin air and leave the real breakable alone.
  //
  // MEASURED (breakcells.py, level 12 warp 50,18 hold left): the cartridge
  // breaks (48,20) at f31 and (46,20) at f50; the port stamped (49,20) and
  // (47,20). Frame-exact now, slot table included.
  const g = grid(8);
  put(g, 4, 7, 'B');                          // one row BELOW the probe row
  const state = makeState(g);
  // ylo $30 -> pixelY 3, so `pixelY + (halfH - 3) >= $10` and the sweep
  // reaches its below arm (the same fixture the arm-3 tests above use).
  placePlayer(state, 3, 6, 0x8F, 0x30);
  assert.equal(resolveWall(state, 'right'), 1);
  assert.equal(mapCollision(state, 4, 7), COLL.SOLID, 'the BELOW cell broke');
  assert.equal(mapCollision(state, 4, 6), 0, 'and the probe own cell is untouched');
  assert.deepEqual({ col: state.breakables[0].col, row: state.breakables[0].row },
                   { col: 4, row: 0x17 });
});

test('the horizontal sweep hands the ABOVE cell over, and $22A6 leaves $FFC1 decremented', () => {
  // `RET NZ` at $22A6 returns with the row still DECREMENTED -- that is how
  // the break and pickup tails learn they are being handed the cell overhead.
  const g = grid(8);
  put(g, 4, 5, 'B');                          // one row ABOVE the probe row
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x8F, 0x00);              // pixelY 0 -> pokes above
  assert.equal(resolveWall(state, 'right'), 1);
  assert.equal(mapCollision(state, 4, 5), COLL.SOLID, 'the ABOVE cell broke');
  assert.equal(state.breakables[0].row, 0x15, '$FFC1 came back DECREMENTED');
});

test('a pickup reached through the sweep is CONSUMED and erased at its own cell', () => {
  // $1F1A is `LD A,B` -- the RESOLVED value -- and 1:$4D4E erases through
  // $FFC0/$FFC1. The port used to RE-PROBE here, which threw the retarget away
  // and read the own cell's zero, so the switch fell straight to `default`:
  // a pickup reached from a metatile edge or from the row above was never
  // collected at all.
  //
  // MEASURED (probeunit.mjs, five cases, all previously no-ops): floor
  // right-neighbour, ceiling right-neighbour, horizontal-below, and level 3's
  // ammo at (6,19) which took ammo 0 -> 10.
  const g = grid(8);
  put(g, 4, 7, 'a');                          // +10 batarangs, one row below
  const state = makeState(g);
  placePlayer(state, 3, 6, 0x8F, 0x30);              // pixelY 3 -> the below arm
  state.flow.ammo = 0;
  assert.equal(resolveWall(state, 'right'), 0, 'a pickup does not block');
  assert.equal(state.flow.ammo, 10, 'it was taken');
  assert.equal(mapCollision(state, 4, 7), 0, 'and erased at the RESOLVED cell');
  assert.equal(mapTile(state, 4, 7), 0);
});

test('the FLOOR probe retargets to the neighbouring column and consumes there', () => {
  // $2129-$212C / $2147-$214A: the slope look walks $FFC0 one column across
  // and leaves it there. $1DE7's pickup call then reads that column, not the
  // probe's own.
  const g = grid(8);
  put(g, 4, 14, 'e');                         // +6 HP, in the RIGHT neighbour
  const state = makeState(g);
  // pixelX $0B: `pixelX + 5 >= $10`, so $2116 takes the right neighbour.
  placePlayer(state, 3, 13, 0xB0, 0x00);
  state.player.hp = 4;
  probeFloor(state);
  assert.equal(state.player.hp, 10, 'the neighbour cell was consumed');
  assert.equal(mapCollision(state, 4, 14), 0, 'and erased there');
  assert.equal(mapCollision(state, 3, 14), 0, 'the own column was always empty');
});

// ---------------------------------------------------------------------------
// $1374-$1388 -- the crumble puff.
// ---------------------------------------------------------------------------

test('an expiring breakable spawns the $97/$01 puff into the $C693 pool', () => {
  // `LD B,col / LD C,row`, both low bytes forced to $80 ($137C-$1381), then
  // `LD D,$97 / LD E,$01 / CALL sub_00_0CC2` -- the same allocator and the
  // same sprite the door break uses, one subtype along. The receiver at
  // $13D9-$13E9 is what turns it into debris and the $17 cue, which is why
  // cuediff counts $17s from two sites ($14FF and $13E9) rather than one.
  const state = floorFixture('B');
  state.level.number = 7;
  state.flow.difficulty = 1;                        // a $0C timer
  probeFloor(state);
  const pool = state.doors.effects;
  assert.ok(pool.every((r) => r[0] === 0), 'the pool starts empty');

  for (let i = 0; i < 0x0C; i++) updateBreakables(state);
  const live = pool.filter((r) => r[0] !== 0);
  assert.equal(live.length, 1, 'exactly one record');
  assert.equal(live[0][0] & 0xC0, 0x80, 'animated');
  assert.equal(live[0][5], 0x01, 'subtype $01');
  assert.equal(live[0][1], 3, 'col from the slot');
  assert.equal(live[0][2], 0x80, '$137C forces the X low byte');
  assert.equal(live[0][3], 0x1E, 'row from the slot, the raw $FFC1 high byte');
  assert.equal(live[0][4], 0x80, '$1381 forces the Y low byte');
});

test('the pool record survives its own spawn frame ($1349 runs before $1391)', () => {
  // sub_00_1336 runs the tile-restore pass and the effect pool BACK TO BACK,
  // and the pool walk is downstream, so an effect spawned by the restore pass
  // IS ticked on the frame it is created. (The door's $2099 spawn is the other
  // way round -- it happens after $1391 -- which is why doors.js documents the
  // opposite. Both are the same rule: position in sub_00_1336.)
  const state = floorFixture('B');
  state.level.number = 7;
  state.flow.difficulty = 1;
  probeFloor(state);
  for (let i = 0; i < 0x0C; i++) updateBreakables(state);
  const live = state.doors.effects.find((r) => r[0] !== 0);
  assert.ok(live, 'still live at the end of its spawn frame');
  assert.ok((live[0] & 0x3F) <= 0x17, 'and already counting down from $97');
});
