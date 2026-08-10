// W237: the SET-item icon row $25349A and its progress cue $2533C8 (docket D11).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { collect252E9A, collect252FAC, POWER } from '../src/items.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const TX = { head: 0x80b058, cursor: 0x80c8d8 };

function ctxOf(ram) {
  const log = new UnportedLog();
  return { log, ctx: { ram, rom: ROM, unported: log, unportedLog: log,
    soundPost() {}, hudEvent() {} } };
}

/** The (dest, tile) pairs sitting in the defer buffer, up to its terminator. */
function pairs(ram) {
  const out = [];
  for (let a = TX.head; a < TX.cursor; a += 8) {
    const dest = ram.u32(a);
    if (dest === 0xffffffff) break;
    out.push([dest, ram.u32(a + 4)]);
  }
  return out;
}

test('W237 the icon row tile table is six longwords, ending at code',
  { skip: SKIP }, () => {
    const tiles = Array.from({ length: 6 }, (_, i) => ROM.u32(0x2534e0 + i * 4));
    assert.deepEqual(tiles.map((t) => t >>> 16),
      [0x02de, 0x0302, 0x0326, 0x034a, 0x034a, 0x034a],
      'the column ramps by $24 three times and then saturates');
    assert.ok(tiles.every((t) => (t & 0xffff) === 0x000a), 'and the low word is $A');
    // $2534F8 is `tst.w $81B65C`, the head of the routine after the table, so the
    // extent is pinned by code and the window stops there.
    assert.throws(() => ROM.u32(0x2534e0 + 6 * 4), (e) => e.name === 'Unreached');
  });

test('W237 completing the set prints the icon row through the ported printer',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { log, ctx } = ctxOf(ram);
    deferReset(ram);                       // arm the defer buffer, as $240B8E does
    // $252E9A: D6 is the CURRENT byte and the target is the next one, so a set that
    // completes needs cur + 1 === tgt.
    ram.setU8(POWER.setP1, 3);
    ram.setU8(POWER.setTargetP1, 4);

    collect252E9A(ram, ROM, ctx);

    const cells = pairs(ram);
    // $2534BC: D2 = 2 and D3 = $B, so THREE columns of TWELVE -- 36 cells.
    assert.equal(cells.length, 36, 'three outer passes of twelve');
    // ...and every destination is inside the $904000 tilemap, which is the whole
    // point: the printer writes (dest, tile) pairs the ISR6 flush drains.
    for (const [dest] of cells) {
      assert.ok(dest >= 0x904000 && dest < 0x906000, `dest $${dest.toString(16)}`);
    }
    // $240DC2 ors $C0000000 into the tile and steps $10000 per cell.
    const base = ROM.u32(0x2534e0 + (4 - 1) * 4);
    assert.equal(cells[0][1] >>> 0, (base + 0xc0000000) >>> 0);
    assert.equal(cells[1][1] >>> 0, (base + 0xc0000000 + 0x10000) >>> 0);
    assert.deepEqual(log.report(), [], 'and nothing about the row is counted now');
  });

test('W237 the progress cue slides with the set byte', { skip: SKIP }, () => {
  const shot = (cur) => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    deferReset(ram);
    // cur + 1 !== tgt, and the stock is zero, which is the cue's own gate at
    // $252F22 tst.w $81B65C.
    ram.setU8(POWER.setP1, cur);
    ram.setU8(POWER.setTargetP1, 9);
    ram.setU16(0x81b65c, 0);
    collect252E9A(ram, ROM, ctx);
    return pairs(ram);
  };
  const a = shot(1);
  const b = shot(3);
  // $2533E0: D2 = 2 and D3 = 1, so three columns of two -- six cells.
  assert.equal(a.length, 6, 'three passes of two');
  assert.equal(b.length, 6);
  // D6 is shifted left NINE and added to the base column, so a later set byte puts
  // the cue further along. `$904000 + (D6 + D0)` is the destination.
  assert.notEqual(a[0][0], b[0][0], 'the cue moved');
  assert.equal(b[0][0] - a[0][0], (3 - 1) << 9, 'by exactly (D6 delta) << 9');
});

test('W237 P2 mirrors the row and NEGATES the cue offset', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf(ram);
  deferReset(ram);
  ram.setU8(POWER.setP2, 3);
  ram.setU8(POWER.setTargetP2, 4);
  collect252FAC(ram, ROM, ctx);
  const cells = pairs(ram);
  assert.equal(cells.length, 36, 'the same three-by-twelve grid');
  // $2534B0 move.w #$F00,D1 against P1's #$100: a different base column.
  const ram2 = new Ram();
  const { ctx: ctx2 } = ctxOf(ram2);
  deferReset(ram2);
  ram2.setU8(POWER.setP1, 3);
  ram2.setU8(POWER.setTargetP1, 4);
  collect252E9A(ram2, ROM, ctx2);
  assert.notEqual(cells[0][0], pairs(ram2)[0][0], 'P2 draws in a different column');
});
