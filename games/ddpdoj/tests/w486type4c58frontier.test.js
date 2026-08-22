import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u32 } from '../src/ram.js';
import { handlerMap, TYPE_SPECS } from '../src/handlers.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { processDeferred, SPAWN } from '../src/spawn.js';
import { BUCKETS } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES_PATH = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(TABLES_PATH);
const JSON_TABLES = HAVE ? JSON.parse(readFileSync(TABLES_PATH, 'utf8')) : null;
const W487_PROTO = Object.freeze({
  base: '$270C3A', len: 0x2c,
  why: 'W487 focused fixture for the newly declared type $58 prototype window',
  hex: '00000002000000000000000010030008a00110010000000000000000020002000200020002000c0000130000',
});
const ROM_SPEC = HAVE ? {
  ...JSON_TABLES.rom,
  windows: JSON_TABLES.rom.windows.some((w) =>
    parseInt(String(w.base).replace('$', ''), 16) === 0x270c3a)
    ? JSON_TABLES.rom.windows : [...JSON_TABLES.rom.windows, W487_PROTO],
} : null;
const ROM = HAVE ? new RomWindows(ROM_SPEC) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const T4C = TYPE_SPECS.get(0x4c);

const A5 = 0x8137c0;
const A6 = 0x8139c0;
const POSITION = 0x10001000;

function resetDrawBuckets(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

function fixture() {
  const ram = new Ram();
  const unported = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + T4C.hpPoolAt, 0x00007fff);
  ram.setU16(A5 + T4C.rampAt, 0x0580);
  ram.setU32(A6 + 0x02, POSITION);
  ram.setU16(A6 + T4C.damageAccumAt, T4C.hpReset);
  ram.setU16(A6 + T4C.stateAt, 4);
  ram.setU16(A6 + T4C.stepAt, 2);
  ram.setU8(A6 + 0x2a, 1);
  return {
    ram,
    unported,
    ctx: {
      tables: { vector: () => ({ dy: 0, dx: 0 }) },
      unported,
      unportedLog: unported,
      notes: unported,
      soundPost: () => {},
    },
  };
}

test('W486 state 4 completes eight paired type $58 passes and drains every child',
  { skip: SKIP }, () => {
    const run = handlerMap().get(T4C.handler);
    const frame = (f, counter) => {
      resetDrawBuckets(f.ram);
      f.ram.setU16(T4C.spawnParityGlobal, counter);
      run(f.ram, ROM, A5, f.ctx);
    };

    const gate = fixture();
    gate.ram.setU16(A6 + T4C.stepAt, 1);
    gate.ram.setU8(A6 + T4C.bandAt, 0x0a);
    gate.ram.setU8(A6 + 0x2a, 0);
    gate.ram.setU16(A5 + T4C.rampAt, 0);
    frame(gate, 1);
    assert.equal(gate.ram.u16(A6 + T4C.stepAt), 1,
      'step 1 remains armed while steering to $3200/$1C00 is in progress');
    assert.equal(gate.ram.u8(A6 + T4C.bandAt), 0x0a,
      'travel withholds the gated band $04 write');
    assert.equal(gate.ram.u8(A6 + 0x2a), 0,
      'the paired arm remains disarmed before the step-1 waypoint is reached');

    gate.ram.setU32(A6 + 0x02, 0x32001c00);
    frame(gate, 2);
    assert.equal(gate.ram.u16(A6 + T4C.stepAt), 2,
      'arrival at $3200/$1C00 advances to step 2');
    assert.equal(gate.ram.u8(A6 + T4C.bandAt), 0x04,
      'arrival writes band $04 after the steerer returns carry clear');
    assert.equal(gate.ram.u8(A6 + 0x2a), 1,
      'arrival arms phase 1 only after the step-1 steering gate clears');

    const f = fixture();
    frame(f, 0);
    assert.equal(f.ram.u16(A5 + T4C.rampAt), 0x05c0,
      'the first fall-through adds exactly $40');
    assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 0,
      'phase 1 emits nothing before the ramp reaches $600');

    for (let pass = 0; pass < 8; pass++) {
      frame(f, pass * 8);
      const afterDue = f.ram.u16(SPAWN.DEFQ_COUNT);
      frame(f, pass * 8 + 1);
      assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), afterDue,
        `pass ${pass} emits nothing on the following off-cycle frame`);
    }

    assert.equal(f.ram.u16(A5 + T4C.rampAt), T4C.rampCap, 'the record ramp clamps at $600');
    assert.equal(f.ram.u8(A6 + 0x2a), 0, 'the phase clears only after all eight passes');
    assert.equal(f.ram.u8(A6 + 0x2b), 0, 'the eight-pass counter drains to zero');
    assert.equal(f.ram.u8(A6 + 0x34), 0, 'sixteen independent heading increments wrap to zero');
    assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 16 * SPAWN.DEFQ_STRIDE);

    for (let pass = 0; pass < 8; pass++) {
      const tableIndex = (8 - pass) & 7;
      const tableBias = ROM.u32(T4C.spawnBiasTable + tableIndex * 4);
      const headingBase = (pass * 2) & 7;
      for (let side = 0; side < 2; side++) {
        const queued = SPAWN.DEFQ_BASE + (pass * 2 + side) * SPAWN.DEFQ_STRIDE;
        assert.equal(f.ram.u16(queued + 0x02), 0x58,
          `pass ${pass} side ${side} queues type $58`);
        assert.equal(f.ram.u16(queued + 0x04), 0, 'both calls use the fixed-zero queue entry');
        assert.equal(f.ram.u32(queued + 0x16),
          u32(u32(POSITION + T4C.spawnBiases[side]) + tableBias),
          `pass ${pass} side ${side} copies position with its own packed bias`);
        assert.equal(f.ram.u8(queued + 0x1a),
          (4 - ((headingBase + side) & 7)) & 0x3f,
          `pass ${pass} side ${side} copies its independently advanced heading`);
      }
    }

    assert.equal(processDeferred(f.ram, ROM, f.unported, f.ctx.tables), 16,
      'the proven type-$58-only queue drains all sixteen records through the W487 body');
    assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 0, 'the deferred queue is empty after the drain');
  });
