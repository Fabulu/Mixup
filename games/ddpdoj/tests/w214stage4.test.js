// W214: Stage-4 type $9C root ship and paired satellite array.

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
import { POOL_B } from '../src/effects.js';

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

function findType(ram, type) {
  for (let i = 0; i < ENEMY.slots; i++) {
    const a5 = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(a5) !== 0 && ram.u8(a5 + 0x0c) === type) return a5;
  }
  return 0;
}

test('W214 exact type-$9C root/satellite closure, eleven records, and four new streams',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27ad96));
  assert.ok(HANDLER_ADDRESSES.includes(0x27aee0));
  assert.equal(sha(0x27ad8e, 0x568),
    'f2a32a19490b590e97c7361b81895d916b2d8c60879290e17f9a1fd78bcfce0e');
  assert.equal(sha(0x27dbf4, 0x80e),
    '493d455a324c184b39eb8d4cba860a82e3d61886b4db48f40a9d0f57164c0958');
  assert.equal(sha(0x27e4f2, 8),
    '9892835205bbbd387126413350ecd7045be7a187dae48d5b0e9f1f0ac1d34cb9');
  const addrs = [0x235b48, 0x235b80, 0x235bd0, 0x235be8, 0x235c00,
    0x235c58, 0x235cb8, 0x235cd0, 0x235ce8, 0x235d28, 0x235d60];
  assert.equal(createHash('sha256').update(Buffer.concat(addrs.map((a) =>
    Buffer.from(ROM.bytes(a, 8))))).digest('hex'),
  '45f072f626465407bf5dc642f0e98cff3610b7677dba99f25b01533af42a76e9');
  const art = manifest.spr.harvest.find((h) => h.at === '$27B07C');
  assert.ok(art, 'four-frame type-$9C root animation harvest');
  assert.deepEqual([art.entries, art.distinct, art.added], [4, 4, 4]);
  assert.equal(manifest.spr.streamCount, 3739);
});

test('W214 real clock-$E5 root initializes five satellite pairs, fires, draws, and dies',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  const bullets = [], sounds = [];
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x00e5);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x235b48);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 2, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x235b58);
  const a5 = findType(ram, 0x9c);
  assert.ok(a5);
  const root = ram.u32(a5 + 6);
  assert.equal(ram.u16(a5 + 4), 10, 'root plus ten paired satellite subrecords');
  assert.notEqual(ram.u8(root + 0x1c), 0x40, 'clock-E5 movement selects five-pair form');
  for (const off of [0x20, 0x60, 0xa0, 0xe0, 0x120])
    assert.notEqual(ram.u16(root + off), 0, `satellite primary +$${off.toString(16)}`);

  ram.setU32(root + 2, 0x40002000);
  ram.setU8(a5 + 0x26, 0);
  ram.setU8(a5 + 0x28, 0);
  ram.setU8(a5 + 0x29, 1);
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost: (a) => sounds.push(a),
    bulletSpawn: (site, result) => bullets.push([site, result]) };
  runHandler(0x27aee0, ram, ROM, a5, ctx);
  assert.ok(bullets.some(([site]) => site === 0x27afcc), 'root fires its kind-$13 shot');
  assert.ok(ram.u16(BUCKETS[2].counter) >= 12, 'root and satellites emit real sprites');

  ram.setU8(root, ram.u8(root) | 0x04);
  ram.setU16(root + 0x18, 0x8000);
  runHandler(0x27aee0, ram, ROM, a5, ctx);
  assert.equal(ram.u16(a5), 0, 'root death frees the allocation after its effect sequence');
  assert.deepEqual(sounds, [0x28c2dc]);
  assert.equal(Array.from({ length: POOL_B.slots }, (_, i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride)).filter(Boolean).length, 9,
  'nine root-death effect rows are armed');
});
