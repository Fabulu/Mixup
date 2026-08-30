// W310: the name-entry cursor -- a 7x4 grid with a per-cell adjacency table.
//
// The grid's shape is asserted from BOTH tables independently, because the interesting thing
// about it is that they agree: the adjacency graph says cell 0's DOWN is 7, and the position
// table says cell 7's Y is one step below cell 0's. Between them they also explain the two
// differing words in W305's per-side setup blocks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, i16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import {
  NAME_REC, NAME_SCREEN, CURSOR, NAME_ALPHA,
  cursorMove28FE7A, cursorHeld28FDB0, cursorFrame28F55E,
} from '../src/hiscorename.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const A4 = 0x81f200;
const UP = 1; const DOWN = 2; const LEFT = 4; const RIGHT = 8;

const factory = () => {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
};
const world = () => {
  const posts = [];
  return { posts, ctx: { rom: ROM, soundPost: (address) => posts.push(address) } };
};
/** `($2A,A4)` set and one axis engaged, so a `cursorMove` is legal. */
function at(cell, bits) {
  const ram = factory();
  ram.setU16(A4 + CURSOR.cellField, cell);
  ram.setU16(A4 + CURSOR.bitsField, bits);
  return ram;
}
/** The destination the ROM's graph gives for `cell` under `bits`. */
const dest = (cell, bits) =>
  i16(ROM.u16(ROM.u32(CURSOR.pointers + cell * 4) + (bits - 1) * 2));

// ==================== 1. THE THREE TABLES, AND WHY 28 IS EXACT

test('W310 the pointer table is 28 CONSECUTIVE adjacency tables', { skip: SKIP }, () => {
  // Each pointer is `$28FF40 + i*$14`, which is what makes the three tables one contiguous run
  // and one window. Checked as arithmetic rather than as a list.
  for (let i = 0; i < CURSOR.cells; i++) {
    assert.equal(ROM.u32(CURSOR.pointers + i * 4), CURSOR.graph + i * CURSOR.graphStride,
      `cell ${i}`);
  }
  assert.equal(CURSOR.pointers + CURSOR.cells * 4, CURSOR.graph, 'and they abut');
  assert.equal(CURSOR.graph + CURSOR.cells * CURSOR.graphStride, CURSOR.positions);
});

test('W310 28 is pinned from BOTH sides', { skip: SKIP_IMG }, () => {
  // The pointer table's 29th longword reads `$FFFF0007` -- the first adjacency table's data, not
  // a pointer -- and `$2901E0` is `tst.w $813098`, code. So a 29-cell reading breaks at one end
  // and a 27-cell reading leaves END unreachable.
  assert.equal(IMG.readUInt32BE(CURSOR.pointers + CURSOR.cells * 4), 0xffff0007,
    'the 29th longword is adjacency data');
  assert.equal(IMG.readUInt16BE(CURSOR.positions + CURSOR.cells * 4), 0x4a79, '$2901E0 is tst.w');
  assert.equal(IMG.readUInt32BE(CURSOR.positions + CURSOR.cells * 4 + 2), 0x00813098,
    'of $813098');
  // And W309's END cell is the last of the 28.
  assert.equal(CURSOR.endCell, CURSOR.cells - 1);
  assert.equal(NAME_ALPHA.last, CURSOR.endCell + 1, 'whose glyph is index 28');
});

// ==================== 2. THE GRID IS 7x4, FROM TWO INDEPENDENT TABLES

test('W310 the ADJACENCY table says the grid is seven wide', { skip: SKIP }, () => {
  // Every cell not on the bottom row steps DOWN by exactly the width, and every cell not on the
  // right edge steps RIGHT by one. Asserted over the whole grid rather than at a few corners.
  for (let c = 0; c < CURSOR.cells; c++) {
    const row = Math.floor(c / CURSOR.width);
    const col = c % CURSOR.width;
    assert.equal(dest(c, DOWN), row === 3 ? -1 : c + CURSOR.width, `cell ${c} DOWN`);
    assert.equal(dest(c, UP), row === 0 ? -1 : c - CURSOR.width, `cell ${c} UP`);
    assert.equal(dest(c, RIGHT), col === CURSOR.width - 1 ? -1 : c + 1, `cell ${c} RIGHT`);
    assert.equal(dest(c, LEFT), col === 0 ? -1 : c - 1, `cell ${c} LEFT`);
  }
  assert.equal(CURSOR.cells, CURSOR.width * 4, 'four rows of seven');
});

test('W310 the POSITION table agrees it is 7x4, but its columns are NOT evenly spaced',
  { skip: SKIP }, () => {
    // The two tables agree on the SHAPE -- four rows of seven -- which is the check, since either
    // alone could be a coincidence. Y is constant across a row and steps by `-$740` between them,
    // and the seven X values repeat identically on all four rows.
    //
    // But NEITHER axis is evenly spaced. The X gaps are `$5C0 $600 $580 $680 $5C0 $5C0` and the
    // Y gaps are `$740 $7C0 $780`. My first draft assumed a uniform column step and failed on
    // cell 2; my second assumed a uniform row step and failed on cell 14. **That irregularity is
    // the reason the table exists** -- a port computing either axis arithmetically would misplace
    // most of the grid, and would look almost right while doing it.
    const pos = (c) => ROM.u32(CURSOR.positions + c * 4);
    const y = (c) => pos(c) >>> 16;
    const x = (c) => pos(c) & 0xffff;
    assert.equal(pos(0), 0x35000a40);

    const cols = [0, 1, 2, 3, 4, 5, 6].map((c) => x(c));
    const rows = [0, 1, 2, 3].map((r) => y(r * CURSOR.width));
    assert.deepEqual(cols, [0x0a40, 0x1000, 0x1600, 0x1b80, 0x2200, 0x27c0, 0x2d80]);
    assert.deepEqual(rows, [0x3500, 0x2dc0, 0x2600, 0x1e80]);
    const xGaps = cols.slice(1).map((v, i) => v - cols[i]);
    const yGaps = rows.slice(1).map((v, i) => rows[i] - v);
    assert.deepEqual(xGaps, [0x5c0, 0x600, 0x580, 0x680, 0x5c0, 0x5c0]);
    assert.deepEqual(yGaps, [0x740, 0x7c0, 0x780]);
    assert.ok(new Set(xGaps).size > 1, 'the columns are irregular');
    assert.ok(new Set(yGaps).size > 1, 'and so are the rows');

    // What IS regular is that the table is the PRODUCT of those two lists: every cell takes its
    // row's Y and its column's X, which is what makes it a 7x4 grid at all.
    for (let c = 0; c < CURSOR.cells; c++) {
      assert.equal(x(c), cols[c % CURSOR.width], `cell ${c} reuses its column's X`);
      assert.equal(y(c), rows[Math.floor(c / CURSOR.width)], `cell ${c} reuses its row's Y`);
    }
  });

test('W310 diagonals combine the two axes, and impossible bits are blocked by DATA',
  { skip: SKIP }, () => {
    // Indices 2 (up+down) and 6 (up+down+left) are `-1` in every cell -- the ROM blocks them with
    // data rather than by refusing to index. A port that special-cased them in code would be
    // adding a rule the cartridge does not have.
    for (let c = 0; c < CURSOR.cells; c++) {
      assert.equal(dest(c, UP | DOWN), -1, `cell ${c} up+down`);
      assert.equal(dest(c, UP | DOWN | LEFT), -1, `cell ${c} up+down+left`);
    }
    // And a real diagonal is the two steps composed.
    assert.equal(dest(0, DOWN | RIGHT), CURSOR.width + 1, 'cell 0 down-right is cell 8');
    assert.equal(dest(CURSOR.cells - 1, UP | LEFT), CURSOR.cells - 2 - CURSOR.width);
  });

// ==================== 3. THE MOVE

test('W310 a move rewrites the cell AND its screen position', { skip: SKIP }, () => {
  // `move.w D0,($18,A4)` then `move.l (A0,D0.w),($6,A4)`. Updating one without the other leaves
  // the cursor drawn where it is not.
  const ram = at(0, RIGHT);
  const w = world();
  assert.equal(cursorMove28FE7A(ram, ROM, A4, w.ctx), true);
  assert.equal(ram.u16(A4 + CURSOR.cellField), 1);
  assert.equal(ram.u32(A4 + CURSOR.posField), ROM.u32(CURSOR.positions + 4));
});

test('W310 a blocked direction moves nothing and is not an error', { skip: SKIP }, () => {
  // `bmi $28FEC8` on a negative destination. Cell 0 has no UP and no LEFT.
  for (const bits of [UP, LEFT]) {
    const ram = at(0, bits);
    const before = ram.u32(A4 + CURSOR.posField);
    assert.equal(cursorMove28FE7A(ram, ROM, A4, world().ctx), false);
    assert.equal(ram.u16(A4 + CURSOR.cellField), 0, 'the cell did not move');
    assert.equal(ram.u32(A4 + CURSOR.posField), before, 'nor the position');
  }
});

test('W310 the move CLEARS the direction bits and disarms the repeat', { skip: SKIP }, () => {
  // `clr.b ($20)` and `clr.b ($21)` come first, and `clr.w ($2A)` follows the read. Together they
  // make a fired repeat one-shot; leaving `($2A)` set would move again next frame with no input.
  const ram = at(0, RIGHT);
  ram.setU8(A4 + CURSOR.axesField, 1);
  ram.setU8(A4 + CURSOR.delayField, 3);
  cursorMove28FE7A(ram, ROM, A4, world().ctx);
  assert.equal(ram.u8(A4 + CURSOR.axesField), 0);
  assert.equal(ram.u8(A4 + CURSOR.delayField), 0);
  assert.equal(ram.u16(A4 + CURSOR.bitsField), 0, 'and the bits are consumed');
});

test('W310 zero bits and out-of-range bits both decline', { skip: SKIP }, () => {
  // `subq.w #1,D0 / bcs` catches zero and `cmpi.w #$A / bcc` catches 11 and up, which is what
  // left+right (12) produces.
  for (const bits of [0, LEFT | RIGHT, 0x0f]) {
    const ram = at(0, bits);
    assert.equal(cursorMove28FE7A(ram, ROM, A4, world().ctx), false, `bits ${bits}`);
  }
  assert.equal(CURSOR.dirs, 10, 'ten reachable indices');
});

test('W310 a cell past the table throws', { skip: SKIP }, () => {
  const ram = at(CURSOR.cells, RIGHT);
  assert.throws(() => cursorMove28FE7A(ram, ROM, A4, world().ctx), /29th longword/);
});

// ==================== 4. THE AUTO-REPEAT

test('W310 `($20,A4)` counts ENGAGED AXES, so a diagonal moves at once', { skip: SKIP }, () => {
  // The vertical arms SET it to 1 and the horizontal arms INCREMENT it, so 2 means both axes.
  // `$28FE00 cmpi.b #$2 / beq $28FE7A` then skips the delay entirely.
  const ram = factory();
  ram.setU16(A4 + CURSOR.cellField, 0);
  assert.equal(cursorHeld28FDB0(ram, ROM, A4, DOWN | RIGHT, world().ctx), 'diagonal');
  assert.equal(ram.u16(A4 + CURSOR.cellField), CURSOR.width + 1, 'it moved on frame one');
});

test('W310 a single axis arms a four-frame delay and then repeats', { skip: SKIP }, () => {
  // `move.b #$4,($21,A4)`, then `subq.b #1` per frame with the move on zero.
  const ram = factory();
  ram.setU16(A4 + CURSOR.cellField, 0);
  assert.equal(cursorHeld28FDB0(ram, ROM, A4, RIGHT, world().ctx), 'first');
  assert.equal(ram.u16(A4 + CURSOR.cellField), 0, 'the FIRST frame does not move');
  assert.equal(ram.u8(A4 + CURSOR.delayField), CURSOR.delay);
  for (let i = 0; i < CURSOR.delay - 1; i++) {
    assert.equal(cursorHeld28FDB0(ram, ROM, A4, RIGHT, world().ctx), 'waiting', `frame ${i + 2}`);
    assert.equal(ram.u16(A4 + CURSOR.cellField), 0);
  }
  assert.equal(cursorHeld28FDB0(ram, ROM, A4, RIGHT, world().ctx), 'repeat');
  assert.equal(ram.u16(A4 + CURSOR.cellField), 1, 'and now it moves');
});

test('W310 the direction is captured on the FIRST frame only', { skip: SKIP }, () => {
  // With `($20)` already 1 the routine jumps straight to the delay branch and never reads the
  // nibble, so `($2A,A4)` holds the original direction even if the player changes it mid-delay.
  const ram = factory();
  ram.setU16(A4 + CURSOR.cellField, 8);
  cursorHeld28FDB0(ram, ROM, A4, RIGHT, world().ctx);
  assert.equal(ram.u16(A4 + CURSOR.bitsField), RIGHT);
  cursorHeld28FDB0(ram, ROM, A4, LEFT, world().ctx);           // a different direction
  assert.equal(ram.u16(A4 + CURSOR.bitsField), RIGHT, 'still the first one');
});

test('W310 the vertical arms are exclusive and the horizontal ones OR in', { skip: SKIP }, () => {
  // `bra $28FDDE` after UP skips the DOWN test, and both horizontal arms use `ori.w`. So up+down
  // resolves to UP alone, while up+left is a real pair.
  const v = factory();
  cursorHeld28FDB0(v, ROM, A4, UP | DOWN, world().ctx);
  assert.equal(v.u16(A4 + CURSOR.bitsField), UP, 'up wins over down');
  const both = factory();
  both.setU16(A4 + CURSOR.cellField, 8);
  cursorHeld28FDB0(both, ROM, A4, UP | LEFT, world().ctx);
  assert.equal(both.u16(A4 + CURSOR.cellField), 0, 'up+left from cell 8 is cell 0');
});

test('W310 releasing keeps an ARMED repeat ticking, and an unarmed one idle', { skip: SKIP }, () => {
  // `$28F566 tst.b ($20,A4) / beq` -- the release path only ticks if an axis was engaged, and
  // `$28FE7A` clears that on every move, so the repeat cannot free-run after firing.
  const idle = factory();
  assert.equal(cursorFrame28F55E(idle, ROM, A4, world().ctx), 'idle', 'nothing engaged');

  const armed = factory();
  armed.setU16(A4 + CURSOR.cellField, 0);
  armed.setU16(A4 + NAME_REC.input, RIGHT);
  assert.equal(cursorFrame28F55E(armed, ROM, A4, world().ctx), 'first');
  armed.setU16(A4 + NAME_REC.input, 0);                        // the player lets go
  for (let i = 0; i < CURSOR.delay - 1; i++) {
    assert.equal(cursorFrame28F55E(armed, ROM, A4, world().ctx), 'waiting');
  }
  assert.equal(cursorFrame28F55E(armed, ROM, A4, world().ctx), 'released-repeat');
  assert.equal(armed.u16(A4 + CURSOR.cellField), 1, 'the armed repeat still fired');
  assert.equal(cursorFrame28F55E(armed, ROM, A4, world().ctx), 'idle', 'and then it is done');
});

// ==================== 5. W305'S TWO DIFFERING BLOCK WORDS, EXPLAINED

test('W310 the per-side blocks differ in the cursor\'s STARTING CELL and its X', { skip: SKIP }, () => {
  // W305 could only call them "an X and a flag". The blocks fill `($6)`, `($8)`, `($14)`,
  // `($16)`, `($18)` in that order, so word 1 is `($8,A4)` and word 4 is `($18,A4)` -- the X and
  // the grid cell. P1 starts on cell 0 and P2 on cell 1, and the "X" is those two cells' X out of
  // the same position table. One difference expressed twice, and neither word was a flag.
  const w = (side, i) => ROM.u16(NAME_SCREEN.blocks[side] + i * 2);
  assert.deepEqual([w(0, 4), w(1, 4)], [0, 1], 'word 4 is the starting cell');
  assert.equal(w(0, 1), ROM.u32(CURSOR.positions + 0 * 4) & 0xffff, 'P1\'s X is cell 0\'s');
  assert.equal(w(1, 1), ROM.u32(CURSOR.positions + 1 * 4) & 0xffff, 'and P2\'s is cell 1\'s');
  // Word 0 is the Y half, and both sides share it because the two cells are on the same row.
  assert.equal(w(0, 0), ROM.u32(CURSOR.positions) >>> 16);
  assert.equal(w(0, 0), w(1, 0), 'so the Y word does not differ');
  // The block's first two words together ARE cell 0's position long.
  assert.equal(((w(0, 0) << 16) | w(0, 1)) >>> 0, ROM.u32(CURSOR.positions));
});

test('W310 a real move posts the live `$28C6FA` cue exactly once', { skip: SKIP }, () => {
  const ram = at(0, RIGHT);
  const w = world();
  cursorMove28FE7A(ram, ROM, A4, w.ctx);
  assert.deepEqual(w.posts, [0x28c6fa]);
  assert.equal(CURSOR.cue, 0x28c6fa);
});
