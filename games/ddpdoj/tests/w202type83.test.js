// W202: Stage-3 linked-hitbox aimed-ring enemy type $83.

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
import { AIM } from '../src/aim.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function context(ram, sites = []) {
  const log = new UnportedLog();
  return { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost() {}, bulletSpawn(site) { sites.push(site); }, effectSpawn() {} };
}

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8083);
  ram.setU16(A5 + 4, 1);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, 0x83);
  ram.setU32(A5 + 0x12, 0x2356ea);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  runInitBodyAddr(0x274b74, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

test('W202 type-$83 init, linked damage, draws and both attack families',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x274b74));
  assert.ok(HANDLER_ADDRESSES.includes(0x274c90));
  assert.equal(createHash('sha256').update(Buffer.from(ROM.bytes(0x274b6c, 0x5e0)))
    .digest('hex'),
  '435fcab41c45cdfecf3893d7aa3a00275bebe794047d102cfe2b8d217a1b56d2');

  const ram = fixture();
  assert.equal(ram.u32(A5 + 0x44), 0x274c64);
  assert.deepEqual([ram.u8(A6 + 0x1d), ram.u8(A5 + 0x1c),
    ram.u8(A5 + 0x1d), ram.u8(A5 + 0x30), ram.u8(A5 + 0x31)],
  [0x0c, 0x0c, 0x13, 0x18, 0x10]);
  assert.equal(ram.u16(A6 + 0x18), 0x1700);
  assert.equal(ram.u16(A6 + 0x38), 0x1700);

  ram.setU32(A5 + 0x12, 0);
  ram.setU32(A6 + 2, 0x30002000);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU8(A6 + 0x20, ram.u8(A6 + 0x20) | 0x08);
  ram.setU16(A6 + 0x18, 0x1000);
  ram.setU16(A6 + 0x38, 0x0f00);
  ram.setU16(0x8130d2, 1);
  runHandler(0x274c90, ram, ROM, A5, context(ram));
  assert.equal(ram.u16(A6 + 0x18), 0x0f00);
  assert.equal(ram.u16(A6 + 0x38), 0x0f00);
  assert.equal(ram.u8(A6 + 0x1d), 0x1f);
  assert.equal(BUCKETS.reduce((n, b) => n + ram.u16(b.counter), 0), 24,
    'primary and overlay each enqueue one 12-byte display record');

  ram.setU16(0x8130d2, 0);
  ram.setU16(AIM.selP1, 0x8000);
  ram.setU32(AIM.selP1 + 2, 0x50000000);
  ram.setU16(AIM.selP2, 0);
  ram.setU8(A5 + 0x1e, 0);
  const aimed = [];
  runHandler(0x274c90, ram, ROM, A5, context(ram, aimed));
  assert.deepEqual(aimed, Array(5).fill(0x274e22));

  ram.setU8(A5 + 0x1e, 1);
  ram.setU16(A5 + 0x32, 1);
  ram.setU16(A5 + 0x2c, 0x14);
  ram.setU8(A5 + 0x22, 0);
  const rings = [];
  runHandler(0x274c90, ram, ROM, A5, context(ram, rings));
  assert.deepEqual(rings.reduce((m, site) => m.set(site, (m.get(site) ?? 0) + 1),
    new Map()), new Map([
    [0x274f76, 6], [0x274f96, 5], [0x274fb6, 4],
    [0x274fea, 6], [0x27500a, 5], [0x27502a, 4],
  ]));
});

test('W202 real Stage-3 clock-$11D pass crosses the type-$83 frontier',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x011d);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234c1a);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234c22);
  const live = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).find((p) => ram.u8(p + 0x0c) === 0x83);
  assert.ok(live);
  assert.equal(ram.u32(live + ENEMY.handlerOff), 0x274c90);
  ram.setU16(0x8130d2, 1);
  runHandler(0x274c90, ram, ROM, live, context(ram));
  assert.equal(BUCKETS.reduce((n, b) => n + ram.u16(b.counter), 0), 24);
});
