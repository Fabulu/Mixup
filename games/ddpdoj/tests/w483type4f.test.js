import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { ENEMY } from '../src/enemies.js';
import { B, POOL_B } from '../src/effects.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { DEFQ_D1, enqueueDeferred, processDeferred, SPAWN } from '../src/spawn.js';

const TYPE = 0x4f;
const INIT = 0x270298;
const BODY = 0x2702a0;
const HANDLER = 0x2702e6;
const RECORD_PROTO = 0x2702c4;
const SUB_PROTO = 0x2702ca;
const ART = 0x2703ba;
const NORMAL = { buffer: 0x807450, counter: 0x80afc8 };
const ALTERNATE = { buffer: 0x809274, counter: 0x80afe0 };
const ART_LONGS = [
  0x0014beb0, 0x0014bf14, 0x0014bf78, 0x0014bfdc,
  0x0014c040, 0x0014c0a4, 0x0014c108, 0x0014c16c,
  0x0014c1d0, 0x0014c234, 0x0014c298,
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
  w16(SUB_PROTO, 0x8001);
  [0x10010000, 0x00000000, 0x00000400,
    0x04000280, 0x02807fff, 0x10000014]
    .forEach((v, i) => w32(SUB_PROTO + 2 + i * 4, v));
  w16(SUB_PROTO + 0x1a, 0x0000);
  ART_LONGS.forEach((v, i) => w32(ART + i * 4, v));

  return {
    u8: (a) => bytes.get(a) ?? 0,
    u16: (a) => (((bytes.get(a) ?? 0) << 8) | (bytes.get(a + 1) ?? 0)) >>> 0,
    u32(a) { return ((this.u16(a) << 16) | this.u16(a + 2)) >>> 0; },
  };
}

test('W483 type $4F drains, reverses, rank-accelerates, zoom-draws and retires with effect $04', () => {
  const ram = new Ram();
  const rom = fixtureRom();
  const unported = new UnportedLog();
  const events = [];
  const effects = [];
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
  assert.equal(processDeferred(ram, rom, unported, tables,
    (event, type) => events.push([event, type])), 1);

  const rec = ENEMY.bandCommon;
  const sub = SPAWN.SUB_COMMON;
  const run = handlerMap().get(HANDLER);
  assert.deepEqual(events, [['deferred', TYPE]]);
  assert.equal(ram.u32(rec + 0x4c), HANDLER);
  assert.equal(ram.u32(sub + 0x02), 0x20002400,
    'the body preserves the type $4E supplied position across prototype loading');
  assert.equal(ram.u16(sub), 0x8001);
  assert.equal(ram.u16(sub + 0x18), 0x7fff);
  assert.equal(ram.u8(sub + 0x1a), 0x10);
  assert.equal(ram.u8(sub + 0x1b), 0x00);
  assert.equal(ram.u8(sub + 0x1d), 0x14);
  assert.equal(ram.u32(rec + 0x16), 0x00000000);
  assert.equal(ram.u16(rec + 0x1a), 0x0101);

  const ctx = {
    tables, unported, unportedLog: unported,
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
  };
  ram.setU16(0x8130e0, 1);

  run(ram, rom, rec, ctx);
  assert.deepEqual(vectors, [[0x10, 0x00]]);
  assert.equal(ram.u32(sub + 0x02), 0x21002380);
  assert.equal(ram.u8(sub + 0x1a), 0x0f);
  assert.equal(ram.u8(rec + 0x16), 1, 'first on-screen frame arms later off-screen retirement');
  assert.equal(ram.u16(NORMAL.counter), 12);
  assert.equal(ram.u32(NORMAL.buffer + 4), ART_LONGS[0]);
  assert.equal(ram.u16(NORMAL.buffer + 8), 0x0620);
  assert.equal(ram.u16(NORMAL.buffer + 10), 0x0014);

  ram.setU8(sub + 0x1a, 1);
  run(ram, rom, rec, ctx);
  assert.equal(ram.u8(sub + 0x1a), 0);
  assert.equal(ram.u8(sub + 0x1b), 0x20);
  assert.equal(ram.u8(rec + 0x17), 1);
  assert.equal(ram.u16(rec + 0x18), 4,
    'cadence borrow advances the animation cursor by one longword');

  ram.setU8(sub + 0x1a, 0x10);
  ram.setU8(rec + 0x1a, 0);
  ram.setU16(rec + 0x18, 0x28);
  ram.setU16(0x813098, 1);
  ram.setU16(0x803910, 1);
  run(ram, rom, rec, ctx);
  assert.deepEqual(vectors, [[0x10, 0x00], [0x01, 0x00], [0x10, 0x20]],
    'velocity lookup sees pre-update speed and heading on every frame');
  assert.equal(ram.u8(sub + 0x1a), 0x12,
    'reversed motion accelerates twice while the rank word is nonzero');
  assert.equal(ram.u16(rec + 0x18), 0x14,
    'cursor $2C wraps to $14 before art is read');
  assert.equal(ram.u16(ALTERNATE.counter), 12);
  assert.equal(ram.u32(ALTERNATE.buffer + 4), ART_LONGS[5]);

  ram.setU16(0x8130e0, 0);
  run(ram, rom, rec, ctx);
  assert.deepEqual(effects, [[0x04, 0x2704ae, POOL_B.base]]);
  assert.equal(ram.u16(POOL_B.base + B.status) & 0xff, 0x04);
  assert.equal(ram.u32(POOL_B.base + B.pos), 0x23002280);
  assert.equal(ram.u16(POOL_B.base + B.bucket), 0x10);
  assert.equal(ram.u16(rec), 0);
  assert.equal(ram.u8(sub), 1);
});
