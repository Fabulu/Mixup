import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { HYPER, drawBonusFollowers25292A } from '../src/hyper.js';
import { TYPE5, TYPE5_PORTED } from '../src/type5.js';
import { BUCKETS } from '../src/spritequeue.js';

test('W479 $25292A advances and draws both bonus followers', () => {
  const ram = new Ram();
  const reads = [];
  const rom = {
    u32(address) {
      reads.push(address);
      return address === 0x252924 ? 0x1a : 0x19;
    },
  };
  const p1 = HYPER.p1;
  const p2 = HYPER.p2;
  ram.setU16(p1.player, 0x8000);
  ram.setU16(p2.player, 0x8000);
  ram.setU16(p1.bonus, 1);
  ram.setU16(p2.bonus, 1);
  ram.setU32(p1.bonusPos, 0x001c8ccc);
  ram.setU32(p2.bonusPos, 0x001c4410);
  ram.setU16(p1.bonusTick, 0);
  ram.setU16(p1.bonusReload, 5);
  ram.setU16(p2.bonusTick, 2);
  ram.setU16(p2.bonusFrame, 8);
  ram.setU16(HYPER.phase, 1);
  ram.setU16(HYPER.bossPhase, 1);

  assert.equal(drawBonusFollowers25292A(ram, rom), 2);
  assert.deepEqual(reads, [0x25291c, 0x252924]);
  assert.equal(ram.u16(p1.bonusTick), 5, 'an underflow reloads P1 animation');
  assert.equal(ram.u16(p2.bonusTick), 1, 'a live P2 tick decrements');
  assert.equal(ram.u32(p1.bonusPos), 0x001c4410, 'the follower path wraps');
  assert.equal(ram.u32(p2.bonusPos), 0x001c4410, 'boss phase holds the start position');

  const bucket = BUCKETS[28];
  assert.equal(ram.u16(bucket.counter), 24);
  assert.equal(ram.u32(bucket.buffer + 4), 0x001c4410);
  assert.equal(ram.u16(bucket.buffer + 10), 0x19);
  assert.equal(ram.u32(bucket.buffer + 16), 0x001c4410);
  assert.equal(ram.u16(bucket.buffer + 22), 0x1a);
});

test('W479 $25292A preserves pause and player eligibility gates', () => {
  const ram = new Ram();
  const rom = { u32() { throw new Error('no table read expected'); } };
  ram.setU16(HYPER.p1.player, 0xc000);
  ram.setU16(HYPER.p1.bonus, 1);
  ram.setU16(HYPER.p2.player, 0x8000);
  ram.setU16(HYPER.pause, 1);
  assert.equal(drawBonusFollowers25292A(ram, rom), 0);
  assert.equal(ram.u16(BUCKETS[28].counter), 0);
  ram.setU16(HYPER.pause, 0);
  assert.equal(drawBonusFollowers25292A(ram, rom), 0, 'bit 14 and a zero bonus suppress each side');
});

test('W479 type-5 ports call 22 in cartridge order', () => {
  assert.equal(TYPE5.calls[21], 0x25292a);
  assert.ok(TYPE5_PORTED.has(0x25292a));
  assert.equal(TYPE5_PORTED.size, 23, 'W480 completed call 23 after this one');
});
