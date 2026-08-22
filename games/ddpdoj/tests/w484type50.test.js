import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { ENEMY } from '../src/enemies.js';
import { B, POOL_B } from '../src/effects.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { DEFQ_D1, enqueueDeferred, processDeferred, SPAWN } from '../src/spawn.js';
import { BUCKETS } from '../src/spritequeue.js';

const TYPE = 0x50;
const INIT = 0x2703fa;
const BODY = 0x270402;
const HANDLER = 0x270446;
const RECORD_PROTO = 0x270426;
const SUB_PROTO = 0x27042a;
const EMIT = 0x23df2a;

function fixtureRom() {
  const bytes = new Map();
  const w8 = (a, v) => bytes.set(a, v & 0xff);
  const w16 = (a, v) => { w8(a, v >>> 8); w8(a + 1, v); };
  const w32 = (a, v) => { w16(a, v >>> 16); w16(a + 2, v); };

  const table = SPAWN.TYPE_LO + TYPE * SPAWN.TYPE_STRIDE;
  w32(table, INIT);
  w32(table + 4, HANDLER);
  w16(INIT + 2, 0);                                      // one sub-record
  w16(RECORD_PROTO, 0);
  w16(RECORD_PROTO + 2, 0x0030);                         // 48-frame lifetime

  w16(SUB_PROTO, 0x8001);
  [0x10010000, 0x00000000, 0x00000800,
    0x08000200, 0x02007fff, 0x08200012]
    .forEach((v, i) => w32(SUB_PROTO + 2 + i * 4, v));
  w16(SUB_PROTO + 0x1a, 0);

  const bucket = BUCKETS[2];
  w16(EMIT, 0x41f9);
  w32(EMIT + 2, bucket.buffer);
  w16(EMIT + 6, 0xd0f9);
  w32(EMIT + 8, bucket.counter);
  w16(EMIT + 12, 0x2001);

  return {
    u8: (a) => bytes.get(a) ?? 0,
    u16: (a) => (((bytes.get(a) ?? 0) << 8) | (bytes.get(a + 1) ?? 0)) >>> 0,
    u32(a) { return ((this.u16(a) << 16) | this.u16(a + 2)) >>> 0; },
  };
}

function drain(ram, rom, unported, tables) {
  const queued = enqueueDeferred(ram, TYPE, DEFQ_D1.FIXED00);
  ram.setU32(queued.addr + 0x16, 0x20002400);
  assert.equal(processDeferred(ram, rom, unported, tables), 1);
  return { rec: ENEMY.bandCommon, sub: SPAWN.SUB_COMMON };
}

test('W484 type $50 initializes, moves, draws, emits type $51 and shares effect retirement', () => {
  const rom = fixtureRom();
  const unported = new UnportedLog();
  const vectors = [];
  const tables = {
    vector: (speed, heading) => {
      vectors.push([speed, heading]);
      return { dy: 0x0100, dx: -0x0080 };
    },
  };

  assert.ok(INIT_BODY_ADDRESSES.includes(BODY));
  assert.ok(HANDLER_ADDRESSES.includes(HANDLER));

  const ram = new Ram();
  const { rec, sub } = drain(ram, rom, unported, tables);
  const run = handlerMap().get(HANDLER);
  assert.equal(ram.u32(rec + 0x4c), HANDLER);
  assert.equal(ram.u32(sub + 0x02), 0x20002400);
  assert.equal(ram.u16(rec + 0x18), 0x0030);
  assert.equal(ram.u16(sub), 0x8001);
  assert.equal(ram.u16(sub + 0x18), 0x7fff);
  assert.equal(ram.u8(sub + 0x1a), 0x08);
  assert.equal(ram.u8(sub + 0x1b), 0x20);
  assert.equal(ram.u8(sub + 0x1d), 0x12);

  ram.setU16(0x8130e0, 1);
  run(ram, rom, rec, { tables, unported });
  assert.deepEqual(vectors, [[0x08, 0x20]]);
  assert.equal(ram.u32(sub + 0x02), 0x21002380);
  assert.equal(ram.u16(rec + 0x18), 0x002f);
  assert.equal(ram.u16(BUCKETS[2].counter), 12);
  assert.equal(ram.u32(BUCKETS[2].buffer + 4), 0x00149978);
  assert.equal(ram.u16(BUCKETS[2].buffer + 8), 0x0a10);
  assert.equal(ram.u16(BUCKETS[2].buffer + 10), 0x0012);

  ram.setU16(rec + 0x18, 1);
  run(ram, rom, rec, { tables, unported });
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
  assert.equal(ram.u16(SPAWN.DEFQ_BASE + 0x02), 0x51);
  assert.equal(ram.u32(SPAWN.DEFQ_BASE + 0x16), 0x22002300,
    'the child inherits position after the expiry frame movement');
  assert.equal(ram.u16(rec), 0);
  assert.equal(ram.u8(sub), 1);

  const effects = [];
  const retired = new Ram();
  const retiredSlot = drain(retired, rom, unported, tables);
  handlerMap().get(HANDLER)(retired, rom, retiredSlot.rec, {
    tables,
    unported,
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
  });
  assert.deepEqual(effects, [[0x04, 0x2704ae, POOL_B.base]]);
  assert.equal(retired.u16(POOL_B.base + B.status) & 0xff, 0x04);
  assert.equal(retired.u32(POOL_B.base + B.pos), 0x20002400);
  assert.equal(retired.u16(POOL_B.base + B.bucket), 0x10);
  assert.equal(retired.u16(retiredSlot.rec), 0);
  assert.equal(vectors.length, 2, 'parent-gated retirement happens before vector movement');
});
