// W192: install Stage 3 and close its first live enemy family, type $3E.

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
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN,
  stageTableEntry } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function sha(at, len) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(at, len))).digest('hex');
}

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 1);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x2352e8);
  ram.setU8(A5 + 0x0c, 0x3e);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 6);
  runInitBodyAddr(0x2653ee, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const sounds = [], kills = [], effects = [], bullets = [];
  const unported = new UnportedLog();
  return { sounds, kills, effects, bullets, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (addr) => sounds.push(addr),
    killEvent: (score, hit) => kills.push([score, hit]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
    bulletSpawn: (site, result) => bullets.push([site, result]),
  } };
}

test('W192/1 static Stage-3 census, resources, background and type-$3E closure',
  { skip: SKIP }, () => {
  assert.deepEqual(stageTableEntry(ROM, 2),
    { script: 0x2342ba, aux: 0x234fb2, res: 0x2350a8 });
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2653ee));
  assert.ok(HANDLER_ADDRESSES.includes(0x265486));
  assert.deepEqual(TYPE3E_ART, { table: 0x265698, frames: 64 });

  const counts = new Map();
  let cursor = 0x2342ba, records = 0;
  while (ROM.u16(cursor) !== 0xffff) {
    const type = ROM.u8(cursor + 4);
    counts.set(type, (counts.get(type) ?? 0) + 1);
    records++;
    cursor += 8;
  }
  assert.equal(records, 414);
  assert.equal(cursor, 0x234faa);
  assert.equal(counts.size, 28);
  assert.equal(counts.get(0x3e), 70);
  assert.deepEqual([ROM.u16(0x2342ba), ROM.u16(0x2342bc),
    ROM.u8(0x2342be), ROM.u16(0x2342c0)], [6, 4, 0x3e, 0x21]);
  assert.equal(Buffer.from(ROM.bytes(0x2352e8, 10)).toString('hex'),
    '7a4014808901c0102000');
  assert.equal(sha(0x2342ba, 0x0cf8),
    '734e4657909059baa40434983989848302960899feab90e481637178f343fafb');
  assert.equal(sha(0x2653e6, 0x03b2),
    '8b258d08e235a2efc4a872c57e3ea6c21a9babb1b27f7d8b11cda129211ba11c');
  assert.equal(sha(0x22a5f8, 0x03f0),
    '88fa4ae3d4479120fd0794164689616be5d85c6b81bd2e4ffb0995176d4c2492');
  assert.equal(sha(0x22a9e8, 0x0800),
    '09619c74fca5ac6d4106001fa60f1fd26e96d2b33bcdba64cad4391744e352f9');

  const art = Array.from({ length: 64 }, (_, i) => ROM.u32(TYPE3E_ART.table + i * 4));
  assert.equal(new Set(art).size, 64);
  assert.deepEqual([art[0], art.at(-1)], [0x16a8b4, 0x16c738]);
});

test('W192/2 type-$3E init loads both hitboxes and consumes its movement stream',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.deepEqual([ram.u16(A6), ram.u16(A6 + 0x20)], [0xa201, 0xa200]);
  assert.deepEqual([ram.u16(A6 + 0x02), ram.u16(A6 + 0x04)], [0x7a40, 0x0c80]);
  assert.equal(ram.u8(A6 + 0x1b), 0x20);
  assert.equal(ram.u8(A6 + 0x3b), 0x20);
  assert.deepEqual([ram.u16(A6 + 0x18), ram.u16(A6 + 0x38)], [0x7fff, 0x7fff]);
  assert.equal(ram.u32(A5 + 0x12), 0x2352f0);
  assert.equal(ram.u32(A5 + 0x24), 0x00000100);
});

test('W192/3 type-$3E fires at scaled heading and emits a real mirrored frame',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x30002000);
  ram.setU8(A6 + 0x1a, 0);
  ram.setU8(A6 + 0x1b, 0x20);
  ram.setU8(A5 + 0x1e, 0);
  ram.setU8(0x80390b, 2);
  runHandler(0x265486, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.map(([site]) => site), [0x2655f0, 0x2655f8, 0x265602]);
  assert.equal(ram.u16(A5 + 0x28), 4, 'any nonzero mirror byte selects the adjacent frame');
  const frame = ROM.u32(TYPE3E_ART.table + 0x84);
  const bucket = resolveEmitStub(ROM, 0x23df86).bucket;
  const b = BUCKETS[bucket];
  assert.equal(ram.u16(b.counter), 12);
  assert.equal(ram.u32(b.buffer + 4), frame);
});

test('W192/4 linked damage keeps the larger delta, scores, explodes and frees',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x30002000);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x7ffd);
  ram.setU16(A6 + 0x38, 0x7ffb);
  ram.setU32(A5 + 0x24, 3);
  runHandler(0x265486, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.kills, [[0x19, 0x10]]);
  assert.deepEqual(c.sounds, [0x28c2a8]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]), [[0x82, 0x265546]]);
  assert.equal(ram.u16(POOL_B.base + B.bucket), 0x10);
  assert.equal(ram.u8(POOL_B.base + B.speed), ram.u8(A6 + 0x1a));
  assert.equal(ram.u8(POOL_B.base + B.angle), (ram.u8(A6 + 0x1b) * 4) & 0xff);
});

test('W192/5 Stage-3 clock 6 installs and dispatches its first three live records',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const events = [];
  ram.setU16(0x813096, 8);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 6);
  const entry = resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  assert.deepEqual(entry, stageTableEntry(ROM, 2));
  const result = runSpawnWalker(ram, ROM, new UnportedLog(), MT,
    (kind, type) => events.push([kind, type]));
  assert.deepEqual(result, { script: 3, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2342d2);
  assert.deepEqual(events.map(([, type]) => type), [0x3e, 0x07, 0x05]);
  assert.equal(ram.u8(ENEMY.bandCommon + 0x0c), 0x3e);
  assert.equal(ram.u32(ENEMY.bandCommon + 0x4c), 0x265486);
});
