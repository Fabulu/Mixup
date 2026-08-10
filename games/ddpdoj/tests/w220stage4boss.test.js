// W220: Stage-4 boss MAIN0 terminal handoff, D9/D10, and A2 objects 0..5.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { BUCKETS } from '../src/spritequeue.js';
import { RAM, P } from '../src/machine.js';

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

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x02e8);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x236498);
  runSpawnWalker(ram, ROM, log, MT, undefined, palette);
  const a5 = Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === 0x40);
  const a6 = ram.u32(a5 + 0x06);
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    palette, soundPost() {}, effectSpawn() {}, bulletSpawn() {} };
  runHandler(0x29ef0a, ram, ROM, a5, ctx);
  return { ram, a5, a6, ctx };
}

test('W220 pins D9/D10 and the complete six-object visible asset set',
  { skip: SKIP }, () => {
    for (const addr of [
      0x2a15be, 0x2a15de, 0x29ef88, 0x29f0d6,
      0x29f120, 0x29f16a, 0x29f1fa, 0x29f228,
    ]) assert.ok(scriptAddresses().includes(addr), `$${addr.toString(16)} registered`);
    assert.equal(sha(0x2a1370, 0x58),
      'd0bc4d20c58f4337101a943b93216df632cd42d81c9c630f1647d0eb68cd43f8');
    assert.equal(sha(0x2a15be, 0x4a),
      'ddf3bfd249fdbbb46eac7c95aa37ddfdea4d54aad06c759dcaf2580bcccda432');
    assert.equal(Buffer.from(ROM.bytes(0x2a13b8, 16)).toString('hex'),
      '002a15be002a15be002a15de002a15de');
    assert.deepEqual(Buffer.from(ROM.bytes(0x29f19a, 0x20)),
      Buffer.from(ROM.bytes(0x29f1ba, 0x20)));
    assert.deepEqual(Buffer.from(ROM.bytes(0x29f19a, 0x20)),
      Buffer.from(ROM.bytes(0x29f1da, 0x20)));
    for (const [at, entries] of [
      ['$29EFB2', 8], ['$29F100', 8], ['$29F14A', 8],
      ['$29F19A', 8], ['$29F25E', 32],
    ]) {
      const h = manifest.spr.harvest.find((x) => x.at === at);
      assert.deepEqual([h.entries, h.distinct, h.added], [entries, entries, entries]);
    }
    assert.equal(manifest.spr.streamCount, 3985);
  });

test('W220 MAIN0 terminal runs D9, D10, and six boss draws in the same pass',
  { skip: SKIP }, () => {
    const { ram, a5, a6, ctx } = fixture();
    ram.setU16(RAM.player1, 0x8000);
    ram.setU16(RAM.player1 + P.posY, 0x2000);
    ram.setU16(RAM.player1 + P.posX, 0x1800);

    ram.setU8(SCHED.seqDst + 0x06, 1);
    ram.setU8(SCHED.seqDst + 0x0c, 0);
    ram.setU8(SCHED.seqDst + 0x0d, 1);
    ram.setU16(a6 + 0x128, 0x001c);
    ram.setU16(SCHED.a2Base + 10 * SCHED.a2Stride, 0x8000);
    ram.setU16(SCHED.a2Base + 11 * SCHED.a2Stride, 0x8001);

    runHandler(0x29ef0a, ram, ROM, a5, ctx);

    assert.deepEqual([ram.u16(SCHED.a3Base),
      ram.u16(SCHED.a3Base + SCHED.a3Stride)], [0x8109, 0x810a]);
    assert.deepEqual([0x26, 0x46, 0x86, 0xa6].map((off) => ram.u16(a6 + off)),
      [4, 4, 4, 4]);
    assert.equal(ram.u8(a6 + 0x11b), 0x21, 'D9 slews one 64-way step');
    assert.equal(ram.u16(SCHED.a4Base), 0x8003,
      'F3 is armed after the A4 walk and begins on the next pass');
    assert.deepEqual(Array.from({ length: 6 }, (_, i) =>
      ram.u16(SCHED.a2Base + i * SCHED.a2Stride)), Array(6).fill(0x8001));

    const b = BUCKETS[3];
    assert.equal(ram.u16(b.counter), 72);
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => ram.u32(b.buffer + i * 12 + 4)),
      [0x000cbb18, 0x000ce628, 0x000d1ac4,
        0x000d2358, 0x000d2358, 0x000e8fb4]);
  });
