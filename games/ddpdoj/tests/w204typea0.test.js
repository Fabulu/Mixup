// W204: final Stage-3 spawn record, boss type $A0 entry and arrival bootstrap.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { boss3Damage29C912 } from '../src/boss3.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED } from '../src/scheduler.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function context(ram) {
  const log = new UnportedLog();
  return { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost() {}, effectSpawn() {}, bulletSpawn() {} };
}
function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x80a0);
  ram.setU16(A5 + 4, 9);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, 0xa0);
  ram.setU8(A5 + 0x0d, 0x80);
  ram.setU32(A5 + 0x12, 0x2356b0);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  runInitBodyAddr(0x29bbfc, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

test('W204 type-$A0 init and first handler execute the exact arrival bootstrap',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x29bbfc));
  assert.ok(HANDLER_ADDRESSES.includes(0x29be28));
  assert.equal(createHash('sha256').update(Buffer.from(ROM.bytes(0x29bbf4, 0x1040)))
    .digest('hex'),
  '72b61270da4f043cb98a087a33403d75d2d3b6f2c54196a5edac56eb6a1d7f7a');

  const ram = fixture();
  assert.deepEqual([ram.u16(A5 + 0x16), ram.u16(A5 + 0x18), ram.u16(A5 + 0x1a)],
    [0x0004, 0x0c00, 0x3840]);
  assert.deepEqual([ram.u32(SCHED.ptrA0), ram.u32(SCHED.ptrA1),
    ram.u32(SCHED.ptrA2), ram.u32(SCHED.ptrA3), ram.u32(SCHED.ptrA4)],
  [0x29c2e0, 0x29d24a, 0x29be46, 0x29c4ee, 0x29cbd0]);
  for (let i = 0; i < 10; i++)
    assert.equal(ram.u16(SCHED.a2Base + i * SCHED.a2Stride), i === 9 ? 0x8001 : 0x8000);
  assert.equal(ram.u16(SCHED.a4Base), 0x8000);
  for (const off of [0, 0x20, 0x40, 0xc0, 0xe0]) assert.equal(ram.u16(A6 + off), 0x8000);

  runHandler(0x29be28, ram, ROM, A5, context(ram));
  assert.equal(ram.u16(A5 + 0x1a), 0x383f);
  assert.deepEqual([ram.u8(A6 + 0x66), ram.u8(A6 + 0x67), ram.u8(A6 + 0x68)],
    [0x10, 0x11, 0x12]);
  assert.equal(ram.u16(SCHED.a4Base), 0, 'F0 init falls through and retires itself');
  assert.deepEqual([ram.u16(SCHED.seqCursor), ram.u16(SCHED.seqDst),
    ram.u16(A6 + 2), ram.u16(A6 + 4)], [0, 0x1718, 0x4418, 0xec57]);
  assert.deepEqual([ram.u16(A6 + 0x22), ram.u16(A6 + 0x24),
    ram.u16(A6 + 0x42), ram.u16(A6 + 0x44)], [0x3c18, 0xe057, 0x3c18, 0xf857]);
  assert.deepEqual([ram.u16(SCHED.a3Base + 2), ram.u16(SCHED.a3Base + 4),
    ram.u16(SCHED.a3Base + 6), ram.u16(A6 + 0xbc)], [1, 0x0102, 0x00bf, 0]);
  const b = BUCKETS[1];
  assert.equal(ram.u16(b.counter), 12);
  assert.deepEqual([ram.u32(b.buffer), ram.u32(b.buffer + 4),
    ram.u16(b.buffer + 8), ram.u16(b.buffer + 10)],
  [0x80748369, 0x000b1964, 0x1e90, 0x0013]);
});

test('W204 controller subtracts the minimum linked snapshot once', { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU32(A5 + 0x16, 0x00020000);
  ram.setU8(A6, 0x10);
  ram.setU16(A6 + 0x18, 0x7fef);
  ram.setU16(A6 + 0x38, 0x7fdf);
  ram.setU16(A6 + 0x58, 0x7ff8);
  ram.setU16(A6 + 0xd8, 0x7fff);
  ram.setU16(A6 + 0xf8, 0x7ff0);
  ram.setU16(0x8130d2, 1);
  boss3Damage29C912(ram, ROM, A5, A6, context(ram));
  assert.equal(ram.u32(A5 + 0x16), 0x0001ffe0,
    'minimum HP snapshot $7FDF means the largest linked damage delta $20');
  assert.deepEqual([0x18, 0x38, 0x58, 0xd8, 0xf8].map((o) => ram.u16(A6 + o)),
    [0x7fff, 0x7fff, 0x7fff, 0x7fff, 0x7fff]);
});

test('W204 real Stage-3 clock-$1A7 pass consumes the final script record',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x01a7);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234fa2);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234faa);
  const live = Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((p) => ram.u8(p + 0x0c) === 0xa0);
  assert.ok(live);
  assert.equal(ram.u32(live + ENEMY.handlerOff), 0x29be28);
  runHandler(0x29be28, ram, ROM, live, context(ram));
  assert.equal(ram.u16(BUCKETS[1].counter), 12);
});
