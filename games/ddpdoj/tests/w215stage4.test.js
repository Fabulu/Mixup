// W215: Stage-4 type $9D three-part carrier and its live type $9E child.

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

test('W215 exact type-$9D/$9E closures and 56 visible streams', { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27b2fe));
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27c28e));
  assert.ok(HANDLER_ADDRESSES.includes(0x27b78a));
  assert.ok(HANDLER_ADDRESSES.includes(0x27c2fc));
  assert.equal(sha(0x27b2f6, 0x0f90),
    '7ee65e988c57544bd013dadff0755b72e6d5e2439e4c96698191f5f019aea372');
  assert.equal(sha(0x27c286, 0x027a),
    '2b1ec0224f5ca19eafb565fbd15a69289e0825cd7f9ef2956f70bbca0d1efe5b');
  assert.equal(sha(0x27e4fa, 8),
    '69984ca2d8ee4d3f160d2c5578c9c3b7a979367648efa899d4314de41116988e');
  assert.equal(Buffer.from(ROM.bytes(0x235ff0, 8)).toString('hex'),
    '01d800009d81100f');
  assert.equal(Buffer.from(ROM.bytes(0x2367ce, 6)).toString('hex'),
    'aa0024004000');
  for (const [at, entries] of [['$27C1C4', 16], ['$27C204', 4], ['$27C480', 32]]) {
    const h = manifest.spr.harvest.find((x) => x.at === at);
    assert.ok(h, `W215 harvest ${at}`);
    assert.deepEqual([h.entries, h.distinct, h.added], [entries, entries, entries]);
  }
  const attached = manifest.spr.harvest.find((x) => x.at === '$27B396');
  assert.deepEqual([attached.entries, attached.distinct, attached.added], [4, 4, 4]);
  assert.equal(manifest.spr.streamCount, 3804);
});

test('W215 real clock-$1D8 carrier draws and launches a live type-$9E child',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x01d8);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x235ff0);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x235ff8);

  const a5 = findType(ram, 0x9d);
  assert.ok(a5, 'type $9D allocated');
  const root = ram.u32(a5 + 6);
  assert.equal(ram.u16(a5 + 4), 2, 'root plus two attached subrecords');
  assert.deepEqual([ram.u16(0x8130d8), ram.u16(0x8130dc), ram.u16(0x81b414)],
    [1, 1, 1]);

  const bullets = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    bulletSpawn: (site, result) => bullets.push([site, result]) };
  ram.setU16(0x8130d2, 1);
  runHandler(0x27b78a, ram, ROM, a5, ctx);
  assert.equal(ram.u16(BUCKETS[3].counter), 36,
    'root and both attached parts draw while frozen');

  ram.setU16(0x8130d2, 0);
  ram.setU16(a5 + 0x18, 2);
  ram.setU8(a5 + 0x28, 0);
  ram.setU16(a5 + 0x20, 0x24);
  ram.setU8(a5 + 0x2c, 1);
  runHandler(0x27b78a, ram, ROM, a5, ctx);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 0, deferred: 1 });
  const child = findType(ram, 0x9e);
  assert.ok(child, 'type $9E deferred child materialized');
  assert.equal(ram.u32(child + 0x4c), 0x27c2fc);
  ram.setU16(ram.u32(child + 6) + 2, 0x2000);
  runHandler(0x27c2fc, ram, ROM, child, ctx);
  assert.ok(ram.u16(BUCKETS[2].counter) > 0,
    'the live child emits its own cartridge sprite');
});
