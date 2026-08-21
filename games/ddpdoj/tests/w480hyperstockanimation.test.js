import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { HYPER, drawHyperStockAnimations252A52 } from '../src/hyper.js';
import { TYPE5, TYPE5_PORTED } from '../src/type5.js';
import { BUCKETS } from '../src/spritequeue.js';

test('W480 $252A52 advances and draws both hyper-stock animations', () => {
  const ram = new Ram();
  const p1 = HYPER.p1;
  const p2 = HYPER.p2;
  ram.setU16(p1.player, 0x8000);
  ram.setU16(p2.player, 0x8000);
  ram.setU16(p1.stock, 1);
  ram.setU16(p2.stock, 2);
  ram.setU16(p2.bonus, 1);
  ram.setU16(HYPER.frame, 2);
  ram.setU8(p1.stockAnimTick, 0);
  ram.setU8(p1.stockAnimReload, 3);
  ram.setU32(p1.stockAnimPos, 0x001c4070);
  ram.setU8(p2.stockAnimTick, 1);
  ram.setU32(p2.stockAnimPos, 0x001c4410);

  assert.equal(drawHyperStockAnimations252A52(ram), 2);
  assert.equal(ram.u8(p1.stockAnimTick), 0x10, 'the midpoint installs its long pause');
  assert.equal(ram.u32(p1.stockAnimPos), 0x001c40e4);
  assert.equal(ram.u8(p2.stockAnimTick), 0);
  assert.equal(ram.u32(p2.stockAnimPos), 0x001c3f14, 'the endpoint wraps');

  const bucket = BUCKETS[29];
  assert.equal(ram.u16(bucket.counter), 24);
  assert.equal(ram.u32(bucket.buffer + 4), 0x001c40e4);
  assert.equal(ram.u16(bucket.buffer + 8), 0x0270);
  assert.equal(ram.u16(bucket.buffer + 10), 9);
  assert.equal(ram.u32(bucket.buffer + 16), 0x001c3f14);
  assert.equal(ram.u16(bucket.buffer + 22), 9);
});

test('W480 $252A52 preserves pause and conditional bonus gates', () => {
  const ram = new Ram();
  for (const h of [HYPER.p1, HYPER.p2]) {
    ram.setU16(h.player, 0xc000);
    ram.setU16(h.stock, 1);
    ram.setU16(h.bonus, 1);
  }
  ram.setU16(HYPER.pause, 1);
  assert.equal(drawHyperStockAnimations252A52(ram), 0);

  ram.setU16(HYPER.pause, 0);
  ram.setU16(HYPER.p1.player, 0x8000);
  ram.setU16(HYPER.p2.player, 0x8000);
  assert.equal(drawHyperStockAnimations252A52(ram), 0,
    'P1 gate word and P2 frame bit are both clear');

  ram.setU16(HYPER.p1.player, 0xc000);
  ram.setU16(HYPER.p2.player, 0xc000);
  assert.equal(drawHyperStockAnimations252A52(ram), 2, 'bit 14 bypasses the bonus gates');
});

test('W480 closes all 23 type-5 calls in cartridge order', () => {
  assert.equal(TYPE5.calls[22], 0x252a52);
  assert.ok(TYPE5_PORTED.has(0x252a52));
  assert.equal(TYPE5_PORTED.size, 23);
});
