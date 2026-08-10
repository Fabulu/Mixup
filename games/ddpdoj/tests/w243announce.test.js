// W243: object dispatch [4] $260B30, the per-side announcement text.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { announce260B30 } from '../src/rank.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const SLOT = 0x80e240;                 // ALLOC.table, slot 0
const BOX = [0x813162, 0x813166];
const TX = { head: 0x80b058, cursor: 0x80c8d8 };

const cells = (ram) => {
  let n = 0;
  for (let a = TX.head; a < TX.cursor; a += 8) {
    if (ram.u32(a) === 0xffffffff) break;
    n++;
  }
  return n;
};

function fixture(side = 0) {
  const ram = new Ram();
  deferReset(ram);
  ram.setU8(SLOT + 0x07, side);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log } };
}

test('W243 the text lists are eight longwords each, pinned twice over',
  { skip: SKIP }, () => {
    // The cursor steps four and `cmpi.w #$20,$c(a5) / blt` wraps it, so EIGHT; and
    // $260D22 + $40 is $260D62, state 3's own code.
    for (const base of [0x260d22, 0x260d42]) {
      for (let i = 0; i < 8; i++) assert.notEqual(ROM.u32(base + i * 4), 0);
    }
    assert.throws(() => ROM.u32(0x260d22 + 0x40), (e) => e.name === 'Unreached',
      'and the window stops at $260D62');
    // States 1 and 3 have their OWN lists and wrap at $40, so sixteen apiece.
    for (const base of [0x260c28, 0x260df6]) {
      for (let i = 0; i < 16; i++) assert.notEqual(ROM.u32(base + i * 4), 0);
    }
    assert.throws(() => ROM.u32(0x260c28 + 0x40), (e) => e.name === 'Unreached',
      'and state 1 stops at $260C68, which is state 2 code');
  });

test('W243 the first frame initialises and clears its own mailbox', { skip: SKIP }, () => {
  for (const side of [0, 1]) {
    const f = fixture(side);
    f.ram.setU32(BOX[side], 0x0001000c);        // a posted request, which INIT drops
    announce260B30(f.ram, SLOT, 0, f.ctx);
    assert.equal(f.ram.u8(SLOT + 0x02), 1, '$260B10 move.b #$1,$2(A5)');
    assert.equal(f.ram.u32(BOX[side]), 0, '$260B28 clears the mailbox, not reads it');
    assert.equal(f.ram.u16(SLOT + 0x04), 0);
    assert.equal(cells(f.ram), 0, 'and it draws nothing on that frame');
  }
});

test('W243 a posted state switches, drops the latch, and blanks the strip',
  { skip: SKIP }, () => {
    const f = fixture(0);
    announce260B30(f.ram, SLOT, 0, f.ctx);      // the init frame
    f.ram.setU32(BOX[0], 0x00010004);           // flag set, state = $4 (index 1)
    announce260B30(f.ram, SLOT, 0, f.ctx);
    assert.equal(f.ram.u16(BOX[0]), 0, '$260B44 clr.w (A4) -- the flag is consumed');
    assert.equal(f.ram.u16(SLOT + 0x04), 4, '$260B56 move.w D0,$4(A5)');
    assert.equal(f.ram.u8(SLOT + 0x03), 1, 'the per-state latch is set once');
    // Every state opens with `bsr $260A34`, which is $240EBC -- the FILL variant --
    // over a 2x14 block, so the strip is blanked.
    assert.ok(cells(f.ram) >= 28, `blanked ${cells(f.ram)} cells`);
    // $0102 and not $0202: $260BCE falls THROUGH into state 1's own tail, so the
    // timer it just wrote is spent on the same frame.
    assert.equal(f.ram.u16(SLOT + 0x0e), 0x0102, '$260BB8, less the same-frame tick');
    assert.deepEqual(f.log.report(), [], 'and it reaches no unported path');
  });

test('W243 state 2 arms the scroller and prints from its own list', { skip: SKIP }, () => {
  const f = fixture(0);
  announce260B30(f.ram, SLOT, 0, f.ctx);
  f.ram.setU32(BOX[0], 0x00010008);             // state = $8 (index 2)
  announce260B30(f.ram, SLOT, 0, f.ctx);
  assert.equal(f.ram.u32(SLOT + 0x10), 0x260d22, '$260CB2 the P1 list');
  assert.equal(f.ram.u16(0x81b57c), 1, '$2872D8 armed its nine words');
  assert.equal(f.ram.u16(0x81b4c8), 1);
  // The tail prints one cell per advance, and $6(a5) is what says "advance".
  const before = cells(f.ram);
  f.ram.setU8(SLOT + 0x06, 1);
  announce260B30(f.ram, SLOT, 0, f.ctx);
  assert.ok(cells(f.ram) > before, 'a cell was printed');
  assert.equal(f.ram.u8(SLOT + 0x06), 0, '$260D00 clears the advance flag');
});

test('W243 the cursor wraps at $20, which is what makes the list eight long',
  { skip: SKIP }, () => {
    const f = fixture(0);
    announce260B30(f.ram, SLOT, 0, f.ctx);
    f.ram.setU32(BOX[0], 0x00010008);
    announce260B30(f.ram, SLOT, 0, f.ctx);
    const seen = new Set();
    for (let n = 0; n < 12; n++) {
      f.ram.setU8(SLOT + 0x0e, 0);              // force the borrow every frame
      announce260B30(f.ram, SLOT, 0, f.ctx);
      seen.add(f.ram.u16(SLOT + 0x0c));
    }
    assert.deepEqual([...seen].sort((a, b) => a - b),
      [0, 4, 8, 0x0c, 0x10, 0x14, 0x18, 0x1c], 'eight cursors, then back to zero');
  });

test('W243 a state past the table is a loud throw, not a silent read', { skip: SKIP }, () => {
  const f = fixture(0);
  announce260B30(f.ram, SLOT, 0, f.ctx);
  f.ram.setU32(BOX[0], 0x00010010);             // state $10 -- one past the four
  assert.throws(() => announce260B30(f.ram, SLOT, 0, f.ctx),
    (e) => e.name === 'Unreached' && e.romAddress === 0x260b5a);
});
