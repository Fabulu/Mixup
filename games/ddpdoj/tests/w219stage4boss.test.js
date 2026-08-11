// W219: final Stage-4 spawn record and Type-$40 boss arrival bootstrap.

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
import { boss4Damage29FB5C } from '../src/boss4.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
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

function enemyOfType(ram, type) {
  return Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === type);
}

function stage4Boss() {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x02e8);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x236498);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2364a0);
  const a5 = enemyOfType(ram, 0x40);
  assert.ok(a5);
  return { ram, log, palette, a5, a6: ram.u32(a5 + 0x06) };
}

test('W219 pins the final Stage-4 record, arrival closure, and 16 live streams',
  { skip: SKIP }, () => {
    assert.ok(INIT_BODY_ADDRESSES.includes(0x29ec82));
    assert.ok(HANDLER_ADDRESSES.includes(0x29ef0a));
    for (const addr of [0x2a017a, 0x2a019a, 0x29f5bc, 0x29f5fe, 0x29f3f0])
      assert.ok(scriptAddresses().includes(addr), `$${addr.toString(16)} is registered`);
    assert.equal(sha(0x29ec7a, 0x0b16),
      'd095fb4bc73b048e594d7c0b51b99a33ef568f0b16fb76691dbae0c95468cb7f');
    assert.equal(sha(0x29fb5a, 0x052e),
      'c5dc134df1b53a704ecff76f79b3459107b140918789f4ddc059631f9f34ce58');
    assert.equal(sha(0x2a0088, 0x0116),
      'e2caffa1c7ec13b0592968c6461d70e13e4d580484acf46ac007d21fc6ee8ffa');
    assert.equal(Buffer.from(ROM.bytes(0x236498, 16)).toString('hex'),
      '02e800004080009cffffffffffffffff');
    assert.equal(Buffer.from(ROM.bytes(0x267a24, 8)).toString('hex'),
      '0029ec7a0029ef0a');
    const h = manifest.spr.harvest.find((x) => x.at === '$29F414');
    assert.deepEqual([h.entries, h.distinct, h.added], [16, 16, 16]);
    assert.equal(manifest.spr.streamCount, 4244);
  });

test('W219 real clock-$2E8 spawn runs F0, MAIN0, and the visible body same pass',
  { skip: SKIP }, () => {
    const { ram, log, palette, a5, a6 } = stage4Boss();
    assert.equal(ram.u16(a5 + 0x04), 12, 'runLen $C owns thirteen subrecords');
    assert.equal(ram.u32(a5 + 0x16), 0x00046000);
    assert.deepEqual([ram.u32(SCHED.ptrA0), ram.u32(SCHED.ptrA1),
      ram.u32(SCHED.ptrA2), ram.u32(SCHED.ptrA3), ram.u32(SCHED.ptrA4)],
    [0x29f498, 0x2a1608, 0x29ef54, 0x2a1370, 0x2a0088]);
    assert.equal(palette.installCount, 3);
    assert.equal(ram.u16(SCHED.a4Base), 0x8000);

    const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
      palette, soundPost() {}, effectSpawn() {}, bulletSpawn() {} };
    runHandler(0x29ef0a, ram, ROM, a5, ctx);

    assert.equal(palette.installCount, 4);
    assert.equal(ram.u16(SCHED.a4Base), 0,
      'F0 falls through to its step and clears itself');
    assert.deepEqual([ram.u16(SCHED.seqCursor), ram.u16(SCHED.seqSub)], [0, 4]);
    assert.deepEqual([ram.u8(SCHED.seqDst + 0x02), ram.u16(SCHED.seqDst + 0x08),
      ram.u16(SCHED.seqDst + 0x0c)], [0, 0x027b, 0x0101]);
    assert.deepEqual([ram.u16(a6 + 0x02), ram.u16(a6 + 0x04),
      ram.u16(a6 + 0x126), ram.u16(a6 + 0x168)],
    [0xca80, 0x1d90, 0x0018, 0]);
    assert.equal(ram.u16(SCHED.a2Base + 10 * SCHED.a2Stride), 0x8001);

    const b = BUCKETS[7];
    assert.equal(ram.u16(b.counter), 12);
    assert.deepEqual([ram.u32(b.buffer), ram.u32(b.buffer + 4),
      ram.u16(b.buffer + 8), ram.u16(b.buffer + 10)],
    [0x863a8016, ROM.u32(0x29f414 + 0x18), 0x28c0, 0x0015]);
  });

test('W219 linked damage keeps the largest delta and honors the part-flash gate',
  { skip: SKIP }, () => {
    const { ram, log, a5, a6 } = stage4Boss();
    ram.setU32(a5 + 0x16, 0x00030000);
    ram.setU16(a6 + 0x168, 0);
    ram.setU8(a6 + 0x20, 0x84);
    ram.setU16(a6 + 0x38, 0x7fef);
    ram.setU16(a6 + 0x58, 0x7fdf);
    ram.setU16(a6 + 0x78, 0x7ff0);
    ram.setU8(a6 + 0x5f, 1);
    for (const [off, value] of [
      [0x146, 0x13], [0x147, 0x14], [0x148, 0x15],
      [0x149, 0x15], [0x14a, 0x15], [0x14b, 0x14],
    ]) ram.setU8(a6 + off, value);
    const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
      soundPost() {}, effectSpawn() {}, bulletSpawn() {} };
    boss4Damage29FB5C(ram, ROM, a5, a6, ctx);
    assert.equal(ram.u32(a5 + 0x16), 0x0002ffe0);
    assert.deepEqual([0x38, 0x58, 0x78].map((off) => ram.u16(a6 + off)),
      [0x7fff, 0x7fff, 0x7fff]);
    assert.deepEqual([0x146, 0x147, 0x148, 0x149, 0x14a, 0x14b]
      .map((off) => ram.u8(a6 + off)), [0x1f, 0x14, 0x15, 0x15, 0x15, 0x1f]);
  });
