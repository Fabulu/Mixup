// W200: Stage-3 carrier $15 and its live child types $17/$18.

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
  SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS } from '../src/spritequeue.js';
import { AIM } from '../src/aim.js';

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
    soundPost() {}, bulletSpawn() {}, effectSpawn() {} };
}

function init(type, body, runLen, pos, speed) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000 | type);
  ram.setU16(A5 + 4, runLen);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, type);
  ram.setU32(A5 + 0x16, pos);
  ram.setU32(A5 + 0x1a, speed);
  runInitBodyAddr(body, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

test('W200 carrier queues exact child classes and all three handlers draw',
  { skip: SKIP }, () => {
  for (const a of [0x265bf4, 0x265df0, 0x266324])
    assert.ok(INIT_BODY_ADDRESSES.includes(a));
  for (const a of [0x265ca0, 0x265e84, 0x2663e0])
    assert.ok(HANDLER_ADDRESSES.includes(a));

  const ram = new Ram();
  ram.setU16(A5, 0x8015);
  ram.setU16(A5 + 4, 0);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, 0x15);
  ram.setU32(A5 + 0x12, 0x235386);
  ram.setU16(0x8130ce, 0x010d);
  runInitBodyAddr(0x265bf4, ram, ROM, A5, new UnportedLog(), MT);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
  assert.deepEqual([ram.u16(SPAWN.DEFQ_BASE + 2),
    ram.u16(SPAWN.DEFQ_BASE + 4)], [0x17, 0x20]);
  assert.equal(ram.u32(SPAWN.DEFQ_BASE + 0x16),
    (ram.u32(A6 + 2) + 0x10000400) >>> 0);
  processDeferred(ram, ROM, new UnportedLog(), MT);
  const child17 = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).find((p) => ram.u8(p + 0x0c) === 0x17);
  assert.ok(child17);
  assert.equal(ram.u32(child17 + ENEMY.handlerOff), 0x265e84);
  assert.equal(ram.u16(0x803934), 1);

  ram.setU32(A6 + 2, 0x30002000);
  ram.setU32(A5 + 0x12, 0);
  runHandler(0x265ca0, ram, ROM, A5, context(ram));
  assert.equal(BUCKETS.reduce((n, b) => n + ram.u16(b.counter), 0), 4 * 12,
    'all four visible carrier pieces enqueue');

  const r18 = init(0x18, 0x266324, 3, 0x30002000, 0x0410);
  r18.setU16(0x8130d2, 1);
  runHandler(0x2663e0, r18, ROM, A5, context(r18));
  assert.equal(BUCKETS.reduce((n, b) => n + r18.u16(b.counter), 0), 12);
  assert.ok(Array.from({ length: 16 }, (_, n) => ROM.u32(0x2665aa + n * 4))
    .includes(r18.u32(BUCKETS.find((b) => r18.u16(b.counter)).buffer + 4)));
});

test('W200 both child attack dispatchers produce their first live volleys',
  { skip: SKIP }, () => {
  for (const [type, body, runLen, handler, expected] of [
    [0x17, 0x265df0, 1, 0x265e84,
      [0x26616e, 0x26617a, 0x266186, 0x26619c, 0x2661a8, 0x2661b4]],
    [0x18, 0x266324, 3, 0x2663e0,
      [0x2667cc, 0x2668c4, 0x2668c4, 0x2668c4, 0x2668c4]],
  ]) {
    const ram = init(type, body, runLen, 0x30002000, 0x0010);
    ram.setU16(AIM.selP1, 0x8000);
    ram.setU32(AIM.selP1 + 2, 0x50002000);
    ram.setU8(A5 + 0x17, 2);
    ram.setU16(A5 + 0x2c, 0);
    ram.setU8(A5 + 0x28, 0);
    const sites = [];
    const c = context(ram);
    c.bulletSpawn = (site) => sites.push(site);
    runHandler(handler, ram, ROM, A5, c);
    assert.deepEqual(sites, expected);
  }
});

test('W200 real Stage-3 clock-$10D pass materializes type $15 and child $17',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x010d);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234af2);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 2, deferred: 1 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234b02);
  const types = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).filter((p) => ram.u16(p) !== 0)
    .map((p) => ram.u8(p + 0x0c));
  assert.ok(types.includes(0x15));
  assert.ok(types.includes(0x17));
});
