// W213: Stage-4 type $A2 opening/rotating gun pod.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';
import { BUL } from '../src/bullets.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const manifestPath = new URL('../assets/manifest.json', import.meta.url);
const HAVE = existsSync(tablesPath) && existsSync(manifestPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const manifest = HAVE ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables/assets absent; skip, not pass';

function sha(at, len) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(at, len))).digest('hex');
}

function findTypes(ram, type) {
  const out = [];
  for (let i = 0; i < ENEMY.slots; i++) {
    const a5 = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(a5) !== 0 && ram.u8(a5 + 0x0c) === type) out.push(a5);
  }
  return out;
}

test('W213 exact type-$A2 closure, eight occurrences, and 23 live streams',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27cfac));
  assert.ok(HANDLER_ADDRESSES.includes(0x27d072));
  assert.equal(sha(0x27cfac, 0x72),
    '9e6621c3064b1e5102023ae6e2d242d5286b75a9a03204bfbaeb09352b0b164c');
  assert.equal(sha(0x27d062, 0x2ce),
    '3e37e706d04d115768ce791e60a089ed94f7323af534adaf54b9993602f739dc');
  assert.equal(sha(0x27d39c, 0x5c),
    'df33f3e9cf1ba58c9c36e9cae53d473bbab5ab15f8821d104d295af2509abf93');
  assert.deepEqual([0x235930, 0x235938, 0x235958, 0x235960,
    0x235990, 0x235998, 0x2359c8, 0x2359d0]
    .map((a) => Buffer.from(ROM.bytes(a, 8)).toString('hex')),
  ['00360000a2011036', '00360000a2011035', '00520000a2011035',
    '00520000a2011036', '006e0000a2011035', '006e0000a2011036',
    '008a0000a2011036', '008a0000a2011035']);
  assert.deepEqual([Buffer.from(ROM.bytes(0x236b60, 6)).toString('hex'),
    Buffer.from(ROM.bytes(0x236b66, 8)).toString('hex')],
  ['8c0009004000', '8c003f0088014000']);
  const art = manifest.spr.harvest.find((h) => h.at === '$27D39C');
  assert.ok(art, '23-entry type-$A2 live art harvest');
  assert.deepEqual([art.entries, art.distinct, art.added], [23, 23, 23]);
  assert.equal(manifest.spr.streamCount, 3788);
});

test('W213 real clock-$36 pair draws, mirrors fire, and performs lingering death',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  const bullets = [], sounds = [];
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);             // stage-table byte offset: index 3 * 4
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0036);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x235930);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 2, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x235940);
  const pair = findTypes(ram, 0xa2);
  assert.equal(pair.length, 2);
  const normal = pair.find((a5) => (ram.u8(ram.u32(a5 + 6) + 0x1c) & 0x40) === 0);
  const mirror = pair.find((a5) => (ram.u8(ram.u32(a5 + 6) + 0x1c) & 0x40) !== 0);
  assert.ok(normal && mirror, 'both movement variants materialized');
  const n6 = ram.u32(normal + 6), m6 = ram.u32(mirror + 6);
  assert.deepEqual([ram.u16(normal + 0x28), ram.u16(normal + 0x2a),
    ram.u16(normal + 0x2c)], [0x0300, 0x04c0, 0x03c0]);
  assert.deepEqual([ram.u16(mirror + 0x28), ram.u16(mirror + 0x2a),
    ram.u16(mirror + 0x2c)], [0xfd00, 0xfb40, 0xfc40]);
  assert.deepEqual([ram.u8(n6 + 0x1d), ram.u8(m6 + 0x1d)], [0x0f, 0x0f]);

  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost: (a) => sounds.push(a),
    bulletSpawn: (site, result) => bullets.push([site, result]) };
  for (const [a5, a6] of [[normal, n6], [mirror, m6]]) {
    ram.setU32(a6 + 2, 0x40002000);
    ram.setU16(a6 + 0x18, 0x1000);
    ram.setU16(a5 + 0x18, 2);
    ram.setU8(a5 + 0x1c, 0);
    ram.setU8(a5 + 0x1e, 0);
    ram.setU8(a5 + 0x30, 2);
    ram.setU8(a6 + 1, ram.u8(a6 + 1) & 0x9f);
    runHandler(0x27d072, ram, ROM, a5, ctx);
  }
  assert.deepEqual(bullets.map(([site]) => site), [0x27d1c0, 0x27d1c0]);
  assert.deepEqual([ram.u8(BUL.pool + 0x3b),
    ram.u8(BUL.pool + BUL.stride + 0x3b)], [0x30, 0xd0],
  'normal and mirrored variants preserve their opposite first-shot headings');
  assert.equal(ram.u16(BUCKETS[2].counter), 24, 'one bucket-2 draw per object');

  ram.setU8(n6, ram.u8(n6) | 0x04);
  ram.setU16(n6 + 0x18, 0x8000);
  ram.setU16(BUCKETS[2].counter, 0);
  runHandler(0x27d072, ram, ROM, normal, ctx);
  assert.equal(ram.u16(n6), 0x8080);
  assert.deepEqual(sounds, [0x28c2dc]);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride) & 0xff), [0x0d, 0x0d, 0x85]);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => {
    const e = POOL_B.base + i * POOL_B.stride;
    return [ram.u16(e + B.bucket), ram.u16(e + B.sub12),
      ram.u16(e + B.sub14), ram.u16(e + B.nudge), ram.u16(e + B.hook)];
  }), [[0x10, 1, 0, 0xec00, 1], [0x10, 1, 0, 0xfc00, 1],
    [0x10, 1, 0, 0x0c00, 1]]);
  assert.equal(ram.u16(normal), 0x8001, 'death linger keeps allocation live');
  for (let i = 0; i < 15; i++) runHandler(0x27d072, ram, ROM, normal, ctx);
  assert.equal(ram.u16(normal), 0x8001, 'sixteen linger draws include death pass');
  runHandler(0x27d072, ram, ROM, normal, ctx);
  assert.equal(ram.u16(normal), 0, 'next cleanup underflow frees without drawing');
});
