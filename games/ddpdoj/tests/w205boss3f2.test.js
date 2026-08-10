// W205: Stage-3 boss normal-arrival F2, its same-pass leaves, and A2 body draw.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED } from '../src/scheduler.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';

function makeContext(ram, bullets = []) {
  const log = new UnportedLog();
  return { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost() {}, effectSpawn() {},
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
}

function findEnemy(ram, type) {
  return Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((p) => ram.u8(p + 0x0c) === type);
}

function findSlot(ram, base, slots, stride, id) {
  for (let i = 0; i < slots; i++) {
    const a = base + i * stride;
    if (ram.u16(a) !== 0 && ram.u8(a + 1) === id) return a;
  }
  return 0;
}

function realBoss() {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x2000);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x01a7);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234fa2);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 1, deferred: 0 });
  const a5 = findEnemy(ram, 0xa0);
  assert.ok(a5);
  return { ram, a5, a6: ram.u32(a5 + 6) };
}

function clearDrawBuckets(ram) {
  for (const b of BUCKETS) ram.setU16(b.counter, 0);
}

test('W205 F2 arrival arms D0/D1/D6, nine A2 draws, MAIN1, E6 and E7',
  { skip: SKIP }, () => {
  assert.equal(createHash('sha256').update(Buffer.from(ROM.bytes(0x29d010, 0x1006)))
    .digest('hex'),
  '60f53b0359f33f730e8912b52bf284e092e5c74fc6a7019dde9be4380b785e8c');

  const { ram, a5, a6 } = realBoss();
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram));

  const d7 = findSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 7);
  assert.ok(d7);
  for (let calls = 0; calls < 1000 && !findSlot(ram, SCHED.a3Base,
    SCHED.a3Slots, SCHED.a3Stride, 0); calls++) {
    clearDrawBuckets(ram);
    runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  }

  assert.equal(findSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 0),
    d7, 'the natural arrival ends with D0 reclaiming D7\'s visited slot');
  assert.ok(findSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 1));
  assert.ok(findSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 6));
  assert.equal(ram.u16(d7), 0x8000, 'reclaimed D0 waits for the next scheduler walk');
  for (let id = 0; id <= 8; id++)
    assert.equal(ram.u16(SCHED.a2Base + id * SCHED.a2Stride), 0x8001);
  assert.equal(ram.u16(SCHED.a2Base + 9 * SCHED.a2Stride), 0x8000);
  assert.equal(ram.u16(BUCKETS[1].counter), 9 * 12);

  for (let calls = 0; calls < 400 && !findSlot(ram, SCHED.a4Base,
    SCHED.a4Slots, SCHED.a4Stride, 2); calls++) {
    clearDrawBuckets(ram);
    runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  }
  assert.ok(findSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 2));

  clearDrawBuckets(ram);
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  const e6 = findSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 6);
  const e7 = findSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 7);
  assert.ok(e6 && e7);
  assert.equal(ram.u16(e6), 0x8106);
  assert.equal(ram.u16(e7), 0x8107);
  assert.equal(ram.u16(SCHED.seqCursor), 1);
  assert.equal(ram.u16(BUCKETS[1].counter), 9 * 12);

  // MAIN1's middle/high-screen branch keeps the raw RNG direction.
  ram.setU8(a6 + 0x1a, 0);
  ram.setU16(a6 + 0x02, 0x5000);
  ram.setU16(a6 + 0x04, 0x1800);
  ram.setU16(0x803916, 0x0000);
  const expected = ROM.u8(0x242bac + 1) & 0x3f;
  clearDrawBuckets(ram);
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  assert.equal(ram.u8(SCHED.seqDst), expected);
});

test('W205 E7 uses independent counters, the shared reload, and 17-call fans',
  { skip: SKIP }, () => {
  const { ram, a5 } = realBoss();
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  const d7 = findSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 7);
  ram.setU16(d7 + 6, 0); ram.setU8(d7 + 2, 0);
  ram.setU16(ram.u32(a5 + 6) + 0xbc, 0x01d4);
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  for (let calls = 0; calls < 400 && !findSlot(ram, SCHED.a4Base,
    SCHED.a4Slots, SCHED.a4Stride, 2); calls++) {
    clearDrawBuckets(ram);
    runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  }
  clearDrawBuckets(ram);
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram));
  const e6 = findSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 6);
  const e7 = findSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 7);
  assert.ok(e6 && e7);
  ram.setU8(e6 + 2, 1);
  ram.setU8(e7 + 2, 0); ram.setU8(e7 + 3, 0x12);
  ram.setU8(e7 + 4, 0); ram.setU8(e7 + 5, 0x34);
  const bullets = [];
  clearDrawBuckets(ram);
  runHandler(0x29be28, ram, ROM, a5, makeContext(ram, bullets));
  assert.equal(ram.u8(e7 + 2), 0x34,
    'both independent counters reload from the ROM\'s shared +5 byte');
  assert.equal(ram.u8(e7 + 4), 0x34);
  assert.equal(bullets.length, 34, '17 generator calls per side');
  assert.equal(bullets.filter((b) => b.site >= 0x29df70 && b.site <= 0x29df90).length,
    17);
  assert.equal(bullets.filter((b) => b.site >= 0x29dfe8 && b.site <= 0x29e008).length,
    17);
});
