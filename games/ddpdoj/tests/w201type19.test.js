// W201: Stage-3 type $19 invisible pulse controller.

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
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8019);
  ram.setU16(A5 + 4, 0);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, 0x19);
  ram.setU32(A5 + 0x12, 0x235656);
  runInitBodyAddr(0x2671e8, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

test('W201 type-$19 init and exact 5,5,5,17 pulse cadence', { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2671e8));
  assert.ok(HANDLER_ADDRESSES.includes(0x267226));
  assert.equal(createHash('sha256').update(Buffer.from(ROM.bytes(0x2671e0, 0x7a)))
    .digest('hex'),
  'cce454ced9cbd0480cd1d86803d9b8fbaabb75e05c1565d15d6df6f00bb4d91d');

  const ram = fixture();
  assert.equal(ram.u32(A6 + 2), 0x38001c00);
  assert.deepEqual([ram.u8(A5 + 0x16), ram.u8(A5 + 0x17),
    ram.u8(A5 + 0x18), ram.u8(A5 + 0x19)], [0, 4, 3, 3]);
  assert.equal(ram.u32(A5 + 0x12), 0x235656, 'movement is intentionally unread');

  const pulses = [], states = new Map();
  for (let frame = 1; frame <= 48; frame++) {
    runHandler(0x267226, ram, ROM, A5, {});
    if (ram.u16(0x8130e8) !== 0) pulses.push(frame);
    if (frame === 16 || frame === 33)
      states.set(frame, [ram.u8(A5 + 0x16), ram.u8(A5 + 0x18)]);
  }
  assert.deepEqual(pulses, [1, 6, 11, 16, 33, 38, 43, 48]);
  assert.deepEqual(states.get(16), [0x10, 3]);
  assert.deepEqual(states.get(33), [4, 2]);
  assert.equal(BUCKETS.reduce((n, b) => n + ram.u16(b.counter), 0), 0);
});

test('W201 real Stage-3 clock-$110 pass crosses the type-$19 frontier',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0110);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234b32);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234b3a);
  const live = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).find((p) => ram.u8(p + 0x0c) === 0x19);
  assert.ok(live);
  assert.equal(ram.u32(live + ENEMY.handlerOff), 0x267226);
  runHandler(0x267226, ram, ROM, live, {});
  assert.equal(ram.u16(0x8130e8), 1);
});
