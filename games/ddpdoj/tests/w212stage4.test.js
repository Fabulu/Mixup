// W212: Stage-4 type $9B linked structure pair.

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

test('W212 exact type-$9B closure, five occurrences, and two live streams',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27ac4a));
  assert.ok(HANDLER_ADDRESSES.includes(0x27ace4));
  assert.equal(sha(0x27ac42, 0x014c),
    '94827f3662515eb5488185b64823fcd3737f1cc1f20650734d938e4d6b4c1088');
  assert.deepEqual([0x2358e0, 0x235a18, 0x235d48, 0x236008, 0x236460]
    .map((a) => Buffer.from(ROM.bytes(a, 8)).toString('hex')),
  ['001900009b01100c', '00a500009b01103e', '016900009b011060',
    '021100009b011013', '02b900009b011013']);
  assert.deepEqual([0x2367a6, 0x236c7c, 0x237014, 0x2367fa]
    .map((a, i) => Buffer.from(ROM.bytes(a, i === 3 ? 10 : 12)).toString('hex')),
  ['9000240040f0401088014000', '9000240040f0406088014000',
    '9000240040f0402088014000', '9000240040e088014000']);
  const art = manifest.spr.harvest.find((h) => h.at === '$27ACB2');
  assert.ok(art, 'two direct type-$9B prototype streams');
  assert.deepEqual([art.entries, art.distinct, art.added], [2, 2, 2]);
  assert.equal(manifest.spr.streamCount, 3974);
});

test('W212 real clock-$19 spawn draws both parts, then hides and retires them',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0019);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x2358e0);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 1, deferred: 0 });
  const a5 = findType(ram, 0x9b);
  assert.ok(a5, 'clock-$19 type $9B allocation');
  const a6 = ram.u32(a5 + 0x06);
  assert.equal(ram.u16(a5 + 0x04), 1);
  assert.deepEqual([ram.u32(a6 + 0x0a), ram.u32(a6 + 0x2a)],
    [0x2af6cc, 0x2aecc8]);
  assert.equal(palette.installCount, 1);
  assert.equal(palette.stageSourced.spr[0x14 * 32], 1);
  assert.equal(palette.stageSourced.spr[0x16 * 32], 0);

  const ctx = { tables: MT, unported: log };
  runHandler(0x27ace4, ram, ROM, a5, ctx);
  assert.equal(ram.u16(BUCKETS[1].counter), 24);
  assert.deepEqual([ram.u32(BUCKETS[1].buffer + 4),
    ram.u32(BUCKETS[1].buffer + 16)], [0x2af6cc, 0x2aecc8]);

  ram.setU8(a6 + 0x1e, 1);
  ram.setU16(a5 + 0x18, 0x2640);
  ram.setU16(BUCKETS[1].counter, 0);
  runHandler(0x27ace4, ram, ROM, a5, ctx);
  assert.equal(ram.u16(a5 + 0x18), 0x2680);
  assert.equal(ram.u16(BUCKETS[1].counter), 12, 'lower part hidden at $2680');

  ram.setU16(a5 + 0x18, 0x2a40);
  runHandler(0x27ace4, ram, ROM, a5, ctx);
  assert.equal(ram.u16(a5), 0, 'allocation frees at spread $2A80');
});
