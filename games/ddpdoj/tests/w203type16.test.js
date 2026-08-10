// W203: Stage-3 wobbling paired-shot enemy type $16.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
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
  ram.setU16(A5, 0x8016);
  ram.setU16(A5 + 4, 0);
  ram.setU32(A5 + 6, A6);
  ram.setU8(A5 + 0x0c, 0x16);
  ram.setU32(A5 + 0x12, 0x23553a);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  runInitBodyAddr(0x266d36, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

test('W203 type-$16 init, wobble, paired volley and two-table animation',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x266d36));
  assert.ok(HANDLER_ADDRESSES.includes(0x266e34));
  assert.equal(createHash('sha256').update(Buffer.from(ROM.bytes(0x266d2e, 0x4b2)))
    .digest('hex'),
  'f1e647c57939ca31bfa13d0d7c71d5aa5be28bc3a24ccc8f24b92ed3fff7e288');

  const ram = fixture();
  assert.deepEqual([ram.u8(A5 + 0x18), ram.u8(A5 + 0x19),
    ram.u8(A5 + 0x1c), ram.u8(A5 + 0x1d), ram.u8(A5 + 0x24),
    ram.u8(A5 + 0x25), ram.u8(A5 + 0x26), ram.u8(A5 + 0x27)],
  [0x10, 0x0f, 1, 1, 0, 8, 2, 2]);
  assert.equal(ram.u8(A5 + 0x22), ram.u8(A6 + 0x1b),
    'both players dead preserves the movement heading');

  ram.setU32(A5 + 0x12, 0);
  ram.setU32(A6 + 2, 0x30002000);
  ram.setU16(AIM.selP1, 0x8000);
  ram.setU32(AIM.selP1 + 2, 0x50002000);
  ram.setU16(AIM.selP2, 0);
  ram.setU8(A5 + 0x24, 0);
  ram.setU8(A5 + 0x26, 2);
  ram.setU8(A5 + 0x27, 2);
  ram.setU16(A5 + 0x1e, 0x0100);
  ram.setU8(A5 + 0x21, 0);
  const sites = [];
  runHandler(0x266e34, ram, ROM, A5, context(ram, sites));
  assert.deepEqual(sites, [0x26703c, 0x26704a]);
  assert.deepEqual([ram.u8(A5 + 0x24), ram.u8(A5 + 0x26)], [8, 1]);
  const sway = MT.shotVector(0x28, 0).dy;
  assert.equal(ram.u16(A6 + 2), u16(0x3000 - 0x0100 + sway),
    'old sway is removed before the new shot-vector offset is applied');

  const bucket7 = BUCKETS[7];
  const art0 = ram.u32(bucket7.buffer + 4);
  assert.ok(Array.from({ length: 32 }, (_, n) => ROM.u32(0x2670e0 + n * 4))
    .includes(art0));
  ram.setU8(A5 + 0x24, 1);
  runHandler(0x266e34, ram, ROM, A5, context(ram));
  const art1 = ram.u32(bucket7.buffer + 12 + 4);
  assert.ok(Array.from({ length: 32 }, (_, n) => ROM.u32(0x267160 + n * 4))
    .includes(art1));
});

test('W203 real Stage-3 clock-$13D pass consumes all eight type-$16 records',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x013d);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234c92);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 8, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234cd2);
  const live = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).filter((p) => ram.u8(p + 0x0c) === 0x16);
  assert.equal(live.length, 8);
  assert.ok(live.every((p) => ram.u32(p + ENEMY.handlerOff) === 0x266e34));
  const rec = live[0], sub = ram.u32(rec + 6);
  ram.setU32(rec + 0x12, 0);
  ram.setU16(sub + 2, 0x1000);
  runHandler(0x266e34, ram, ROM, rec, context(ram));
  assert.equal(ram.u16(BUCKETS[7].counter), 12);
  assert.ok(Array.from({ length: 64 }, (_, n) =>
    ROM.u32((n < 32 ? 0x2670e0 : 0x267160) + (n & 31) * 4))
    .includes(ram.u32(BUCKETS[7].buffer + 4)));
});
