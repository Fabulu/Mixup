import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { ENEMY } from '../src/enemies.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { DEFQ_D1, enqueueDeferred, processDeferred, SPAWN } from '../src/spawn.js';
import { BUCKETS } from '../src/spritequeue.js';

const TYPE = 0x51;
const INIT = 0x2704c8;
const BODY = 0x2704d0;
const HANDLER = 0x270516;
const RECORD_PROTO = 0x2704f4;
const SUB_PROTO = 0x2704fa;
const ART = 0x2705fc;
const ART_LONGS = [
  0x0014b158, 0x0014b24c, 0x0014b340, 0x0014b434,
  0x0014b528, 0x0014b61c, 0x0014b710, 0x0014b804,
  0x0014b8f8, 0x0014b9ec, 0x0014bae0, 0x0014bbd4,
  0x0014bcc8, 0x0014bdbc,
];

function fixtureRom() {
  const bytes = new Map();
  const w8 = (a, v) => bytes.set(a, v & 0xff);
  const w16 = (a, v) => { w8(a, v >>> 8); w8(a + 1, v); };
  const w32 = (a, v) => { w16(a, v >>> 16); w16(a + 2, v); };

  const table = SPAWN.TYPE_LO + TYPE * SPAWN.TYPE_STRIDE;
  w32(table, INIT);
  w32(table + 4, HANDLER);
  w16(INIT + 2, 0);                                      // one sub-record
  [0x0000, 0x0000, 0x0101]
    .forEach((v, i) => w16(RECORD_PROTO + i * 2, v));
  w16(SUB_PROTO, 0x8000);
  [0x10010000, 0x00000000, 0x00000400,
    0x04000400, 0x04007fff, 0x18000014]
    .forEach((v, i) => w32(SUB_PROTO + 2 + i * 4, v));
  w16(SUB_PROTO + 0x1a, 0x0000);
  ART_LONGS.forEach((v, i) => w32(ART + i * 4, v));

  return {
    u8: (a) => bytes.get(a) ?? 0,
    u16: (a) => (((bytes.get(a) ?? 0) << 8) | (bytes.get(a + 1) ?? 0)) >>> 0,
    u32(a) { return ((this.u16(a) << 16) | this.u16(a + 2)) >>> 0; },
  };
}

function resetBuckets(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

test('W485 type $51 initializes, reverses, rank-accelerates, animates, zoom-draws and retires off screen', () => {
  const ram = new Ram();
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

  const queued = enqueueDeferred(ram, TYPE, DEFQ_D1.FIXED00);
  ram.setU32(queued.addr + 0x16, 0x20002400);
  assert.equal(processDeferred(ram, rom, unported, tables), 1);

  const rec = ENEMY.bandCommon;
  const sub = SPAWN.SUB_COMMON;
  const run = handlerMap().get(HANDLER);
  const normal = BUCKETS[7];
  const alternate = BUCKETS[22];
  assert.equal(ram.u32(rec + 0x4c), HANDLER);
  assert.equal(ram.u32(sub + 0x02), 0x20002400);
  assert.equal(ram.u16(rec + 0x18), 0);
  assert.equal(ram.u16(rec + 0x1a), 0x0101);
  assert.equal(ram.u16(sub), 0x8000);
  assert.equal(ram.u16(sub + 0x18), 0x7fff);
  assert.equal(ram.u8(sub + 0x1a), 0x18);
  assert.equal(ram.u8(sub + 0x1b), 0x00);
  assert.equal(ram.u8(sub + 0x1d), 0x14);

  const ctx = { tables, unported, unportedLog: unported };
  run(ram, rom, rec, ctx);
  assert.deepEqual(vectors, [[0x18, 0x00]]);
  assert.equal(ram.u32(sub + 0x02), 0x21002380);
  assert.equal(ram.u8(rec + 0x16), 1);
  assert.equal(ram.u8(sub + 0x1a), 0x17);
  assert.equal(ram.u16(normal.counter), 12);
  assert.equal(ram.u32(normal.buffer + 4), ART_LONGS[0]);
  assert.equal(ram.u16(normal.buffer + 8), 0x0a30);
  assert.equal(ram.u16(normal.buffer + 10), 0x0014);

  resetBuckets(ram);
  ram.setU8(sub + 0x1a, 1);
  run(ram, rom, rec, ctx);
  assert.equal(ram.u8(rec + 0x17), 1);
  assert.equal(ram.u16(sub), 0x8001);
  assert.equal(ram.u8(sub + 0x1a), 0);
  assert.equal(ram.u8(sub + 0x1b), 0x20);
  assert.equal(ram.u16(rec + 0x18), 4);
  assert.equal(ram.u32(normal.buffer + 4), ART_LONGS[1]);

  resetBuckets(ram);
  ram.setU8(sub + 0x1a, 0x1b);
  ram.setU16(0x813098, 0);
  run(ram, rom, rec, ctx);
  assert.equal(ram.u8(sub + 0x1a), 0x1c, 'rank zero accelerates to $1C one step at a time');

  resetBuckets(ram);
  ram.setU8(sub + 0x1a, 0x38);
  ram.setU8(rec + 0x1a, 0);
  ram.setU16(rec + 0x18, 0x34);
  ram.setU16(0x813098, 1);
  ram.setU16(0x803910, 1);
  run(ram, rom, rec, ctx);
  assert.equal(ram.u8(sub + 0x1a), 0x3c, 'nonzero rank accelerates by four up to $3C');
  assert.equal(ram.u16(rec + 0x18), 0x28, 'cursor $38 wraps to $28 before the art read');
  assert.equal(ram.u16(alternate.counter), 12);
  assert.equal(ram.u32(alternate.buffer + 4), ART_LONGS[10]);

  const vectorCount = vectors.length;
  resetBuckets(ram);
  ram.setU32(sub + 0x02, 0x78002000);
  run(ram, rom, rec, ctx);
  assert.equal(ram.u16(rec), 0);
  assert.equal(ram.u8(sub), 1);
  assert.equal(vectors.length, vectorCount, 'seen-on-screen retirement happens before movement');
  assert.equal(ram.u16(normal.counter), 0);
  assert.equal(ram.u16(alternate.counter), 0);
});
