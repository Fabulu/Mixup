// W199: Stage-3 type $3F, 84 dense two-hitbox records.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE3E_ART } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x803f);
  ram.setU16(A5 + 4, 1);
  ram.setU32(A5 + 6, A6);
  ram.setU32(A5 + 0x12, 0x2353ae);
  ram.setU8(A5 + 0x0c, 0x3f);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  runInitBodyAddr(0x2657a0, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const bullets = [];
  return { bullets, ctx: { ram, rom: ROM, tables: MT,
    unported: new UnportedLog(), soundPost() {}, effectSpawn() {},
    bulletSpawn: (site, result) => bullets.push([site, result]) } };
}

test('W199 type-$3F init, linked max damage, freeze cadence, and shared draw',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2657a0));
  assert.ok(HANDLER_ADDRESSES.includes(0x265850));
  assert.equal(createHash('sha256').update(
    Buffer.from(ROM.bytes(0x265798, 0x244))).digest('hex'),
  'c54df4cfcfb217cbcbfdc79d20009ba21fbc323c342fdf240c5c42c15f9ad6ca');

  const ram = fixture();
  assert.deepEqual([ram.u16(A6), ram.u16(A6 + 0x20)], [0xa201, 0xa200]);
  assert.equal(ram.u16(A6 + 2), 0x7480);
  const rngIndex = ram.u16(0x803916) & 0x7f;
  assert.equal(ram.u16(A6 + 4),
    (ROM.u16(0x2432ae + rngIndex * 2) + 0x1c00) & 0xffff);
  assert.equal(ram.u16(A6 + 0x1a), 0x2820);
  assert.equal(ram.u32(A5 + 0x12), 0x2353b6,
    'the live Stage-3 arm consumes movement through the first HEAD');
  assert.deepEqual([ram.u8(A5 + 0x18), ram.u8(A5 + 0x19)], [0x0d, 0x12]);

  const c = context(ram);
  ram.setU32(A6 + 2, 0x30002000);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x7ffd);
  ram.setU16(A6 + 0x38, 0x7ffb);
  ram.setU32(A5 + 0x24, 0x50);
  ram.setU16(A5 + 0x1c, 0x60);
  ram.setU8(A5 + 0x20, 0);
  ram.setU16(0x8130d2, 1);
  runHandler(0x265850, ram, ROM, A5, c.ctx);
  assert.equal(ram.u32(A5 + 0x24), 0x4c,
    'linked damage subtracts the larger delta, not their sum');
  assert.deepEqual([ram.u16(A6 + 0x18), ram.u16(A6 + 0x38)], [0x7fff, 0x7fff]);
  assert.equal(ram.u16(A5 + 0x1c), 0x60, 'freeze holds the aim duration');
  assert.deepEqual(c.bullets.map(([site]) => site), [0x2659ac],
    'the fire cooldown continues during freeze on Stage 3');
  const bucket = BUCKETS[resolveEmitStub(ROM, 0x23df86).bucket];
  assert.equal(ram.u16(bucket.counter), 12);
  assert.ok(Array.from({ length: TYPE3E_ART.frames }, (_, i) =>
    ROM.u32(TYPE3E_ART.table + i * 4)).includes(ram.u32(bucket.buffer + 4)));
});

test('W199 real Stage-3 clock-$EA pass consumes both first type-$3F records',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x00ea);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x2348ba);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 2, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2348ca);
  const live = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).filter((p) =>
    ram.u32(p + ENEMY.handlerOff) === 0x265850);
  assert.equal(live.length, 2);
  assert.ok(live.every((p) => ram.u8(p + 0x0c) === 0x3f));
});
