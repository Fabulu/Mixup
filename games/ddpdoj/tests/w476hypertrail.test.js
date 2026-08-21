import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { HYPER, drawHyperStockTrail2527CE } from '../src/hyper.js';
import { TYPE5_PORTED } from '../src/type5.js';
import { BUCKETS } from '../src/spritequeue.js';

test('W476 $2527CE shifts the hyper history and draws the stock follower', () => {
  const ram = new Ram();
  const h = HYPER.p1;
  for (let n = 0; n < 16; n++) {
    ram.setU32(h.trail + n * 4, ((0x2000 + n * 0x100) << 16) | (0x3000 + n * 0x10));
  }
  ram.setU16(h.player, 0x8000);
  ram.setU16(h.player + 2, 0x5000);
  ram.setU16(h.player + 4, 0x4000);
  ram.setU16(h.stock, 3);
  ram.setU16(HYPER.frame, 6);

  assert.equal(drawHyperStockTrail2527CE(ram), 1);
  assert.equal(ram.u32(h.trail + 4), 0x47004000, 'entry one captures the current ship');
  for (let n = 2; n < 16; n++) {
    assert.equal(ram.u32(h.trail + n * 4),
      ((0x2000 + (n - 1) * 0x100) << 16) | (0x3000 + (n - 1) * 0x10));
  }

  const bucket = BUCKETS[18];
  assert.equal(ram.u16(bucket.counter), 12);
  assert.equal(ram.u32(bucket.buffer), 0x807880b5, 'stock 3 uses history entry nine');
  assert.equal(ram.u32(bucket.buffer + 4), 0x001b8614, 'the slow 16-frame animation');
  assert.equal(ram.u16(bucket.buffer + 8), 0x0418);
  assert.equal(ram.u16(bucket.buffer + 10), 5);
  assert.ok(TYPE5_PORTED.has(0x2527ce), 'the type-5 call now runs instead of being noted');
});
