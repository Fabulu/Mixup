import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { HYPER, updateBulletSpeedBias252BD0 } from '../src/hyper.js';
import { TYPE5, TYPE5_PORTED } from '../src/type5.js';

function fixture() {
  const reads = [];
  const values = new Map();
  return {
    ram: new Ram(),
    reads,
    values,
    rom: {
      u16(address) {
        reads.push(address);
        return values.get(address) ?? 0;
      },
    },
  };
}

test('W478 $252BD0 derives and caps both loops enemy-bullet speed bias', () => {
  {
    const { ram, rom, values, reads } = fixture();
    ram.setU16(HYPER.p1.power, 0x20);
    ram.setU16(HYPER.p2.power, 0x10);
    ram.setU16(HYPER.p1.active, 1);
    values.set(0x252b44 + 0x1f * 2, 3);
    ram.setU8(HYPER.flags, 0x04);
    ram.setU16(HYPER.stage, 2);
    ram.setU16(HYPER.firstLoopBossGate, 1);
    ram.setU16(HYPER.bossPhase, 2);

    assert.equal(updateBulletSpeedBias252BD0(ram, rom), 8, 'loop 1 caps at eight');
    assert.deepEqual(reads, [0x252b44 + 0x1f * 2], 'uses the unsigned maximum power');
    assert.equal(ram.u16(HYPER.bulletSpeedBias), 8);
  }

  {
    const { ram, rom, values, reads } = fixture();
    ram.setU16(HYPER.p1.power, 8);
    values.set(0x252b44 + 2, 3);

    assert.equal(updateBulletSpeedBias252BD0(ram, rom), 3, 'inactive power is quartered');
    assert.deepEqual(reads, [0x252b44 + 2]);
  }

  {
    const { ram, rom, reads } = fixture();
    ram.setU16(HYPER.secondLoop, 1);
    ram.setU16(HYPER.stage, 4);
    ram.setU16(HYPER.bossPhase, 1);
    ram.setU8(HYPER.flags, 0x04);

    assert.equal(updateBulletSpeedBias252BD0(ram, rom), 7,
      'zero power still receives flag, stage and loop additions');
    assert.deepEqual(reads, [], 'zero power does not read before either table');
  }

  {
    const { ram, rom, values, reads } = fixture();
    ram.setU16(HYPER.p1.power, 1);
    ram.setU16(HYPER.p1.active, 1);
    ram.setU16(HYPER.secondLoop, 1);
    values.set(0x252b8a, 20);

    assert.equal(updateBulletSpeedBias252BD0(ram, rom), 15, 'loop 2 caps at fifteen');
    assert.deepEqual(reads, [0x252b8a]);
  }
});

test('W478 type-5 runs $252BD0 immediately before the bullet driver', () => {
  const speed = TYPE5.calls.indexOf(0x252bd0);
  assert.equal(speed, 18, '$252BD0 is call 19');
  assert.equal(TYPE5.calls[speed + 1], 0x281d9a, '$281D9A remains call 20');
  assert.ok(TYPE5_PORTED.has(0x252bd0));
  assert.equal(TYPE5_PORTED.size, 21);
});
