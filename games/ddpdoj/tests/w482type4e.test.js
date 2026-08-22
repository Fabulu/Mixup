import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { ENEMY } from '../src/enemies.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { DEFQ_D1, enqueueDeferred, processDeferred, SPAWN } from '../src/spawn.js';

const TYPE = 0x4e;
const INIT = 0x2701d6;
const BODY = 0x2701de;
const HANDLER = 0x270222;
const RECORD_PROTO = 0x270202;
const SUB_PROTO = 0x270206;

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
  w16(RECORD_PROTO + 2, 0x0028);                         // 40-frame lifetime

  // The exact 28-byte long-form prototype at $270206.
  w16(SUB_PROTO, 0x8001);
  [0x10010000, 0, 0x00000600, 0x06000180, 0x01807fff, 0x0a200012]
    .forEach((v, i) => w32(SUB_PROTO + 2 + i * 4, v));
  w16(SUB_PROTO + 0x1a, 0);

  return {
    u8: (a) => bytes.get(a) ?? 0,
    u16: (a) => (((bytes.get(a) ?? 0) << 8) | (bytes.get(a + 1) ?? 0)) >>> 0,
    u32(a) { return ((this.u16(a) << 16) | this.u16(a + 2)) >>> 0; },
  };
}

test('W482 type $4E drains, initializes, moves, splits into two type $4F children and frees', () => {
  const ram = new Ram();
  const rom = fixtureRom();
  const unported = new UnportedLog();
  const events = [];
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
  ram.setU16(queued.addr + 0x1a, 0x0600);
  assert.equal(processDeferred(ram, rom, unported, tables,
    (event, type) => events.push([event, type])), 1);

  const rec = ENEMY.bandCommon;
  const sub = SPAWN.SUB_COMMON;
  assert.deepEqual(events, [['deferred', TYPE]]);
  assert.equal(ram.u32(rec + 0x4c), HANDLER);
  assert.equal(ram.u32(sub + 0x02), 0x20002400);
  assert.equal(ram.u16(rec + 0x18), 0x0028);
  assert.equal(ram.u16(rec + 0x1a), 0x0600,
    'the short record prototype leaves the parent lateral bias intact');
  assert.equal(ram.u8(sub + 0x1a), 0x0a);
  assert.equal(ram.u8(sub + 0x1b), 0x20);
  assert.equal(ram.u8(sub + 0x1d), 0x12);
  assert.equal(ram.u16(sub + 0x18), 0x7fff);

  ram.setU16(rec + 0x18, 1);
  handlerMap().get(HANDLER)(ram, rom, rec, { tables, unported });

  assert.deepEqual(vectors, [[0x0a, 0x20]]);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE * 2);
  const first = SPAWN.DEFQ_BASE;
  const second = first + SPAWN.DEFQ_STRIDE;
  assert.equal(ram.u16(first + 0x02), 0x4f);
  assert.equal(ram.u16(second + 0x02), 0x4f);
  assert.equal(ram.u32(first + 0x16), 0x21002380,
    'first child inherits the moved parent position');
  assert.equal(ram.u32(second + 0x16), 0x2b002980,
    'second child adds $0A00 and the parent-supplied $0600 as separate words');
  assert.equal(ram.u16(rec), 0);
  assert.equal(ram.u8(sub), 1);
});
