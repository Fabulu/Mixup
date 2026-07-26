// Byte/word wrap helpers and $D000 map addressing.
// ROM: sub_00_11B9 (cell address = $D000 + (Xhi << 5) + (Yhi & $0F) * 2).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  i8, u8, u16, createState,
  mapTile, mapCollision, mapCollisionByIndex, cellIndex, setMapCollision,
  SUBPX_PER_PX, SUBPX_PER_METATILE,
} from '../src/state.js';

import { makeState, grid, put, fillRow, buildCells, CHAR_COLL } from './helpers.js';

// ---------------------------------------------------------------------------
// wrap helpers
// ---------------------------------------------------------------------------

test('i8 reinterprets a byte as signed', () => {
  // ROM: every `LD A,(VelX) / BIT 7,A` sign test in $1820-$1D3D.
  assert.equal(i8(0x00), 0);
  assert.equal(i8(0x7F), 127);
  assert.equal(i8(0x80), -128);
  assert.equal(i8(0xBE), -66);      // ROM: $1AFB terminal velocity
  assert.equal(i8(0xE8), -24);      // ROM: $1D7B walk speed max left
  assert.equal(i8(0xFF), -1);
});

test('i8 masks to 8 bits before sign extension', () => {
  // ROM: 8-bit register arithmetic never carries out of A.
  assert.equal(i8(0x100), 0);
  assert.equal(i8(0x1FF), -1);
  assert.equal(i8(300), 44);
  assert.equal(i8(-1), -1);
  assert.equal(i8(-129), 127);
});

test('u8 wraps to an unsigned byte', () => {
  // ROM: $1AFA compares the WRAPPED byte, which is why u8 exists at all.
  assert.equal(u8(0), 0);
  assert.equal(u8(255), 255);
  assert.equal(u8(256), 0);
  assert.equal(u8(-1), 255);
  assert.equal(u8(-66), 0xBE);
  assert.equal(u8(-24), 0xE8);
  assert.equal(u8(0x1234), 0x34);
});

test('u16 wraps to an unsigned word', () => {
  // ROM: HL/DE position arithmetic in sub_00_18E7 / sub_00_18F1.
  assert.equal(u16(0), 0);
  assert.equal(u16(0xFFFF), 0xFFFF);
  assert.equal(u16(0x10000), 0);
  assert.equal(u16(-1), 0xFFFF);
  assert.equal(u16(0x12345), 0x2345);
});

test('u8/i8 round-trip every byte', () => {
  // ROM: the port's whole velocity model rests on this identity.
  for (let b = 0; b < 256; b++) {
    assert.equal(u8(i8(b)), b, `byte ${b}`);
  }
});

test('fixed-point scale constants match 12.4 (master reference §4)', () => {
  assert.equal(SUBPX_PER_PX, 16);
  assert.equal(SUBPX_PER_METATILE, 256);
});

// ---------------------------------------------------------------------------
// map addressing
// ---------------------------------------------------------------------------

test('cellIndex is column-major with 16 rows per column', () => {
  // ROM: sub_00_11B9 -- (Xhi << 5) is 32 bytes = 16 cells per column.
  assert.equal(cellIndex(0, 0), 0);
  assert.equal(cellIndex(0, 15), 15);
  assert.equal(cellIndex(1, 0), 16);
  assert.equal(cellIndex(3, 7), 55);
});

test('cellIndex masks the row with $0F so Y hi $10-$1F folds onto rows 0-15', () => {
  // ROM: sub_00_11B9 `AND $0F` -- Y hi in play runs $10-$20 (master ref §4).
  assert.equal(cellIndex(2, 0x10), cellIndex(2, 0));
  assert.equal(cellIndex(2, 0x1F), cellIndex(2, 0x0F));
  assert.equal(cellIndex(2, 0x25), cellIndex(2, 0x05));
});

test('mapTile reads the metatile graphic id (byte 0 of the cell)', () => {
  // ROM: sub_00_0C34 stores the raw id first, collisionLUT[id] second.
  const g = grid(4);
  put(g, 2, 3, '#');
  const state = makeState(g);
  assert.equal(mapTile(state, 2, 3), '#'.charCodeAt(0));
  assert.equal(mapTile(state, 2, 4), '.'.charCodeAt(0));
});

test('mapTile folds Y hi $10+ onto the map row', () => {
  // ROM: sub_00_11B9 `AND $0F`.
  const g = grid(4);
  put(g, 1, 5, '#');
  const state = makeState(g);
  assert.equal(mapTile(state, 1, 0x15), '#'.charCodeAt(0));
});

test('mapTile off the left/right edge reads 0', () => {
  // ROM: columns outside the loaded map were never written to $D000.
  const state = makeState(grid(4));
  assert.equal(mapTile(state, -1, 0), 0);
  assert.equal(mapTile(state, 4, 0), 0);
  assert.equal(mapTile(state, 99, 0), 0);
});

test('mapCollision reads the collision byte (byte 1 of the cell)', () => {
  // Master reference §6.3 value table.
  const g = grid(4);
  put(g, 0, 0, '#');
  put(g, 1, 1, '~');
  put(g, 2, 2, '^');
  put(g, 3, 3, 'X');
  const state = makeState(g);
  assert.equal(mapCollision(state, 0, 0), 0x01);
  assert.equal(mapCollision(state, 1, 1), 0x08);
  assert.equal(mapCollision(state, 2, 2), 0xFD);
  assert.equal(mapCollision(state, 3, 3), 0xFF);
  assert.equal(mapCollision(state, 0, 5), 0x00);
});

test('mapCollision off the left/right edge reads SOLID', () => {
  // ROM: the map is walled in; off-map is treated as $01 so the player
  // cannot walk out of the world.
  const state = makeState(grid(4));
  assert.equal(mapCollision(state, -1, 0), 0x01);
  assert.equal(mapCollision(state, 4, 0), 0x01);
});

test('mapCollisionByIndex reads by raw index', () => {
  // ROM: sub_00_20BA keeps HL pointing straight at the cell.
  const g = grid(4);
  put(g, 2, 5, '#');
  const state = makeState(g);
  assert.equal(mapCollisionByIndex(state, cellIndex(2, 5)), 0x01);
  assert.equal(mapCollisionByIndex(state, cellIndex(2, 4)), 0x00);
});

test('index arithmetic at row 0 WRAPS into the previous column, row 15', () => {
  // ROM: loc_00_227C steps to the cell above with `DEC HL / DEC HL` on the
  // $D000 pointer -- it does not clamp at the top of a column. Deliberate.
  const g = grid(4);
  put(g, 1, 15, 'X');      // previous column's bottom cell
  put(g, 2, 0, '.');       // the cell we are "above"
  const state = makeState(g);

  const idx = cellIndex(2, 0);
  assert.equal(idx, 32);
  assert.equal(idx - 1, cellIndex(1, 15));
  assert.equal(mapCollisionByIndex(state, idx - 1), 0xFF);
});

test('index arithmetic at row 15 WRAPS into the next column, row 0', () => {
  // ROM: the mirror case -- `INC HL / INC HL` past the bottom of a column.
  const g = grid(4);
  put(g, 3, 0, 'X');
  const state = makeState(g);
  assert.equal(cellIndex(2, 15) + 1, cellIndex(3, 0));
  assert.equal(mapCollisionByIndex(state, cellIndex(2, 15) + 1), 0xFF);
});

test('mapCollisionByIndex out of range reads SOLID', () => {
  // Off the start/end of the $D000 image.
  const state = makeState(grid(4));
  assert.equal(mapCollisionByIndex(state, -1), 0x01);
  assert.equal(mapCollisionByIndex(state, 4 * 16), 0x01);
  assert.equal(mapCollisionByIndex(state, 9999), 0x01);
});

test('setMapCollision writes back and ignores off-map columns', () => {
  // ROM: loc_01_4D4E clears a consumed pickup cell; $1E65 makes a breakable solid.
  const state = makeState(grid(4));
  setMapCollision(state, 1, 2, 0xFF);
  assert.equal(mapCollision(state, 1, 2), 0xFF);
  assert.equal(mapTile(state, 1, 2), '.'.charCodeAt(0), 'graphic id untouched');

  setMapCollision(state, 9, 2, 0xFF);           // off-map: no throw, no write
  assert.equal(mapCollision(state, 9, 2), 0x01);
});

// ---------------------------------------------------------------------------
// createState shape
// ---------------------------------------------------------------------------

test('createState starts with the documented HRAM defaults', () => {
  // Master reference §4: $FF8C/$FF8D init $0F/$10, $FFC5 = $FF.
  const s = createState();
  assert.equal(s.player.halfW, 0x0F);
  assert.equal(s.player.halfH, 0x10);
  assert.equal(s.player.animPrev, 0xFF);
  assert.equal(s.player.air, 0);
  assert.equal(s.player.facing, 0);
  assert.equal(s.video.bgp, 0xE4);
  assert.equal(s.video.obp0, 0xE4);
  assert.equal(s.video.obp1, 0xC4);   // master reference §10 palettes
  assert.equal(s.level.height, 16);
});

test('buildCells lays the fixture out column-major, 2 bytes per cell', () => {
  // Same layout as the real $D000 image, so fixtures cannot lie about it.
  const g = fillRow(grid(3), 15, '#');
  const { cells, width } = buildCells(g);
  assert.equal(width, 3);
  assert.equal(cells.length, 3 * 16 * 2);
  assert.equal(cells[(0 * 16 + 15) * 2 + 1], CHAR_COLL['#']);
  assert.equal(cells[(1 * 16 + 15) * 2 + 1], CHAR_COLL['#']);
  assert.equal(cells[(1 * 16 + 14) * 2 + 1], CHAR_COLL['.']);
});
