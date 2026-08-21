import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { ENEMY } from '../src/enemies.js';
import { B, POOL_B } from '../src/effects.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { DEFQ_D1, enqueueDeferred, processDeferred, SPAWN } from '../src/spawn.js';

const TYPE = 0x52;
const INIT = 0x270634;
const BODY = 0x27063c;
const HANDLER = 0x270694;
const RECORD_PROTO = 0x270666;
const SUB_PROTO = 0x270678;

function fixtureRom() {
  const bytes = new Map();
  const w8 = (a, v) => bytes.set(a, v & 0xff);
  const w16 = (a, v) => { w8(a, v >>> 8); w8(a + 1, v); };
  const w32 = (a, v) => { w16(a, v >>> 16); w16(a + 2, v); };

  const table = SPAWN.TYPE_LO + TYPE * SPAWN.TYPE_STRIDE;
  w32(table, INIT);
  w32(table + 4, HANDLER);
  w16(INIT + 2, 0);                                      // one sub-record

  // Nine record words copied to +$16. State $09, lifetime 2 and four volleys.
  [0, 0x0009, 0, 2, 0, 0, 4, 0, 0]
    .forEach((v, i) => w16(RECORD_PROTO + i * 2, v));

  // One long-form sub-record. Position is the loader's four-byte hole and is supplied by the parent.
  w16(SUB_PROTO, 0x8000);
  for (let i = 0; i < 4; i++) w32(SUB_PROTO + 2 + i * 4, 0);
  w32(SUB_PROTO + 0x12, 0x0000ffff);                     // HP at +$18 is negative
  w32(SUB_PROTO + 0x16, 0x20000013);                     // speed $20, palette $13
  w16(SUB_PROTO + 0x1a, 0);

  return {
    u8: (a) => bytes.get(a) ?? 0,
    u16: (a) => (((bytes.get(a) ?? 0) << 8) | (bytes.get(a + 1) ?? 0)) >>> 0,
    u32(a) { return ((this.u16(a) << 16) | this.u16(a + 2)) >>> 0; },
  };
}

test('W481 type $52 drains from type $4C, initializes, moves, explodes and frees', () => {
  const ram = new Ram();
  const rom = fixtureRom();
  const unported = new UnportedLog();
  const events = [];
  const vectors = [];
  const sounds = [];
  const effects = [];
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
  assert.equal(ram.u8(sub + 0x1a), 0x20);
  assert.equal(ram.u8(sub + 0x1b), 0x06);
  assert.equal(ram.u8(rec + 0x19), 0x09);
  assert.equal(ram.u16(rec + 0x1c), 2);

  ram.setU16(0x8130de, 1);
  ram.setU8(sub, ram.u8(sub) | 0x04);
  handlerMap().get(HANDLER)(ram, rom, rec, {
    tables,
    unported,
    unportedLog: unported,
    soundPost: (site) => sounds.push(site),
    effectSpawn: (kind, site, addr) => effects.push([kind, site, addr]),
  });

  assert.deepEqual(vectors, [[0x20, 0x06]]);
  assert.deepEqual(effects, [[0x14, 0x2706d8, POOL_B.base]]);
  assert.deepEqual(sounds, [0x28c2c2]);
  assert.equal(ram.u16(POOL_B.base), 0x8014);
  assert.equal(ram.u32(POOL_B.base + B.pos), 0x21002380);
  assert.equal(ram.u16(POOL_B.base + B.bucket), 0x10);
  assert.equal(ram.u8(sub + 0x1d), 0x1f);
  assert.equal(ram.u16(rec), 0);
  assert.equal(ram.u8(sub), 1);
});
