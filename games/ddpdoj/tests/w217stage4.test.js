// W217: Stage-4 type $A1 reverse-animated structure.

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

test('W217 pins the complete Type-A1 closure and sixteen new frames',
  { skip: SKIP }, () => {
    assert.ok(INIT_BODY_ADDRESSES.includes(0x27ceb4));
    assert.ok(HANDLER_ADDRESSES.includes(0x27cf0c));
    assert.equal(sha(0x27ceac, 0x00f8),
      'bbeb9978b6413ed50487e703528b3e70fbd7f119b5c85e7c559c1daa7731cf1b');
    assert.equal(Buffer.from(ROM.bytes(0x27e51a, 8)).toString('hex'),
      '0027ceac0027cf0c');
    assert.equal(Buffer.from(ROM.bytes(0x2360d8, 8)).toString('hex'),
      '02360000a1011010');
    assert.equal(Buffer.from(ROM.bytes(0x2367d4, 6)).toString('hex'),
      'aa0024004000');
    const h = manifest.spr.harvest.find((x) => x.at === '$27CF64');
    assert.ok(h);
    assert.deepEqual([h.entries, h.distinct, h.added, h.already],
      [16, 16, 16, 0]);
    // W414 (docket D51): 4,267 -> 4,291. The exporter gained pool-A kind index 2's
    // sixteen-frame animation and the eight-frame collected popup the star shares
    // with it -- TWENTY-FOUR streams, all into shard 11. This file's own harvest
    // assertions above are the untouched witnesses: none of them moved.
    assert.equal(manifest.spr.streamCount, 4291);
  });

test('W217 real clock-$236 spawn animates, draws, and retires on re-entry',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const log = new UnportedLog();
    const palette = new PaletteState();
    ram.setU16(0x813092, 3);
    ram.setU16(0x813094, 6);
    resetAndInstallStage26331E(ram, ROM, log);
    ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0236);
    ram.setU32(SPAWN.LIVE_CURSOR, 0x2360d8);
    assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
      { script: 1, deferred: 0 });
    assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2360e0);

    const a5 = findType(ram, 0xa1);
    assert.ok(a5);
    assert.equal(ram.u16(a5 + 4), 0);
    assert.equal(ram.u32(a5 + 0x44), 0x27cf0c);
    assert.equal(palette.installCount, 1);
    const root = ram.u32(a5 + 6);
    const ctx = { tables: MT, unported: log };
    ram.setU16(0x8130d2, 1);

    runHandler(0x27cf0c, ram, ROM, a5, ctx);
    assert.equal(ram.u32(root + 0x0a), 0x002d05e8,
      'first call selects the last table entry at cursor $3C');
    assert.equal(ram.u16(a5 + 0x1a), 0x0038);

    ram.setU16(root + 2, 0);
    runHandler(0x27cf0c, ram, ROM, a5, ctx);
    assert.equal(ram.u8(a5 + 0x16), 1, 'inside pass arms the re-entry latch');
    ram.setU16(root + 2, 0xaa00);
    runHandler(0x27cf0c, ram, ROM, a5, ctx);
    assert.equal(ram.u16(a5), 0, 'returning to the outside carry band frees it');
  });
