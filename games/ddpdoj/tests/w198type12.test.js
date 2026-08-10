// W198: Stage-3 carrier $12 and its directly spawned children $13/$14.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, processDeferred,
  enqueueDeferred, DEFQ_D1, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { enemyHandlerMap, runEnemyFrame } from '../src/enemyframe.js';
import { BUCKETS } from '../src/spritequeue.js';
import { AIM } from '../src/aim.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function ctx(ram) {
  const log = new UnportedLog();
  return { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost() {}, bulletSpawn() {}, effectSpawn() {} };
}

function init(type, body, runLen, setup = () => {}) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000 | type);
  ram.setU16(A5 + 4, runLen);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, type);
  setup(ram);
  runInitBodyAddr(body, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

test('W198 carrier init, entry transition, and both child init paths are live',
  { skip: SKIP }, () => {
  for (const a of [0x26c26e, 0x26d446, 0x265a5c])
    assert.ok(INIT_BODY_ADDRESSES.includes(a));
  for (const a of [0x26c3e2, 0x26d4b4, 0x265adc])
    assert.ok(HANDLER_ADDRESSES.includes(a));

  const ram = init(0x12, 0x26c26e, 6);
  assert.equal(ram.u32(A6 + 2), 0xf0001c00);
  assert.equal(ram.u32(A5 + 0x20), 0x00007800);
  assert.equal(ram.u16(A5 + 0x2e), 0x0708);
  assert.equal(ram.u32(A5 + 0x44), 0x26c3d2);
  assert.deepEqual(Array.from({ length: 7 }, (_, n) => ram.u16(A6 + n * 0x20)),
    [0x8000, 0x8000, 0x8000, 0x8000, 0x8000, 0x8000, 0x8000]);

  ram.setU16(A6 + 2, 0x3d00);
  ram.setU16(A6 + 0x66, 0);
  runHandler(0x26c3e2, ram, ROM, A5, ctx(ram));
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE,
    'entry completion queues the type-$14 curtain');
  assert.equal(ram.u16(SPAWN.DEFQ_BASE + 2), 0x14);

  processDeferred(ram, ROM, new UnportedLog(), MT);
  const child14 = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).find((p) => ram.u8(p + 0x0c) === 0x14);
  assert.ok(child14);
  const child14Sub = ram.u32(child14 + 6);
  assert.equal(ram.u16(child14Sub + 2), 0x7000);
  assert.equal(ram.u8(child14Sub + 0x1f), 1);

  const r13 = enqueueDeferred(ram, 0x13, DEFQ_D1.FIXED00);
  ram.setU32(r13.addr + 0x16, 0x30002000);
  ram.setU16(r13.addr + 0x1a, 0x0410);
  processDeferred(ram, ROM, new UnportedLog(), MT);
  const child13 = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).find((p) => ram.u8(p + 0x0c) === 0x13);
  assert.ok(child13);
  assert.equal(ram.u32(ram.u32(child13 + 6) + 2), 0x30002000);
});

test('W198 real Stage-3 clock-$E0 spawn crosses the old type-$12 frontier',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x00e0);
  ram.setU16(AIM.selP1, 0x8000);
  ram.setU32(AIM.selP1 + 2, 0x50002000);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x2348b2);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2348ba);
  const live = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).find((p) => ram.u8(p + 0x0c) === 0x12);
  assert.ok(live);
  assert.equal(ram.u32(ram.u32(live + 6) + 2), 0xf0001c00);

  const events = [];
  const frameCtx = ctx(ram);
  frameCtx.unportedLog = frameCtx.unported;
  frameCtx.spawnEvent = (kind, type) => events.push([kind, type]);
  const handlers = enemyHandlerMap(ROM);
  for (let frame = 0; frame < 1000; frame++) {
    for (const b of BUCKETS) ram.setU16(b.counter, 0);
    runEnemyFrame(ram, ROM, frameCtx, handlers);
  }
  assert.ok(events.some(([, type]) => type === 0x14),
    'the real parent handler reaches its type-$14 entry child');
  assert.ok(events.some(([, type]) => type === 0x13),
    'the real parent handler reaches its type-$13 hatch children');
});
