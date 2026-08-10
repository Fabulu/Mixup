// W223: Stage-4 boss F4 bridge, E3/E5, and emitted type $41.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { f4Init2A0BCC, f4Step2A0BDE } from '../src/boss4.js';
import { runHandler } from '../src/handlers.js';
import { processDeferred, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS } from '../src/spritequeue.js';
import { SCHED, runScheduler25962E, scriptAddresses } from '../src/scheduler.js';
import { RAM, P } from '../src/machine.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

function sha(at, len) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(at, len))).digest('hex');
}

function scriptSlot(ram, base, slots, stride, id) {
  return Array.from({ length: slots }, (_, n) => base + n * stride)
    .find((a) => ram.u16(a) !== 0 && (ram.u16(a) & 0xff) === id);
}

function bossContext(ram, bullets = []) {
  const log = new UnportedLog();
  const a5 = 0x814000, a6 = 0x81b732;
  ram.setU32(a5 + 0x06, a6);
  ram.setU32(a6 + 0x62, 0x30001c00);
  ram.setU32(a6 + 0x102, 0x30001c00);
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  return { a5, a6, ctx: { ram, rom: ROM, tables: MT, bossRec: a5,
    bossSubRec: a6, unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); } } };
}

test('W223 pins and registers the complete live F4 dependency slice', { skip: SKIP }, () => {
  for (const addr of [0x2a0bcc, 0x2a0bde, 0x2a1462, 0x2a1468,
    0x2a1486, 0x2a148c, 0x2a280c, 0x2a282e, 0x2a2cc2, 0x2a2cc8])
    assert.ok(scriptAddresses().includes(addr), `$${addr.toString(16)} registered`);
  assert.equal(sha(0x2a0bcc, 0x12a),
    'a993a068fffd259bb56e1221ad496f123f23d745bb4dc7e46293584d6fcec493');
  assert.equal(sha(0x2a37dc, 0x16c),
    '69449559545079234bbb42f00153507aa1ac3ff9a04b6b348658105362f611c1');
  assert.equal(sha(0x29ec22, 0x58),
    'b84b62c190ee40a43c254b052f6767fc050e7572c076c491b741f218c1948e4d');
});

test('W223 F4 walks all five E5 rows and returns to F3', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = bossContext(ram);
  const slot = SCHED.a4Base;
  ram.setU16(slot, 0x8104);
  f4Init2A0BCC(ram, ROM, ctx, slot);
  assert.equal(ram.u8(slot + 2), 0);
  assert.equal(ram.u16(slot + 4), 0x1f, 'INIT falls through and spends first tick');

  ram.setU16(slot + 4, 1);
  f4Step2A0BDE(ram, ROM, ctx, slot);
  assert.equal(ram.u8(slot + 2), 1);
  assert.equal(ram.u16(slot + 4), 0x1f, 'state 1 also ticks on promotion call');
  assert.ok(scriptSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 3));

  ram.setU16(slot + 4, 1);
  f4Step2A0BDE(ram, ROM, ctx, slot);
  assert.equal(ram.u8(slot + 2), 2);
  assert.equal(ram.u16(slot + 4), 0x0f, 'state 2 ticks on promotion call');
  assert.ok(scriptSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 1));

  const rows = [[0x0100, 4, 0x1002], [0x0200, 8, 0x0c02],
    [0x0100, 12, 0x0802], [0x0200, 16, 0x0402], [0x0300, 32, 0x4002]];
  ram.setU16(slot + 4, 0);
  for (let n = 0; n < rows.length; n++) {
    f4Step2A0BDE(ram, ROM, ctx, slot);
    const e5 = scriptSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 5);
    assert.ok(e5, `E5 row ${n} started`);
    assert.deepEqual([ram.u16(e5 + 2), ram.u16(e5 + 8), ram.u16(e5 + 4)], rows[n]);
    ram.setU16(e5, 0);
  }
  f4Step2A0BDE(ram, ROM, ctx, slot);
  assert.equal(ram.u8(slot + 2), 4);
  assert.equal(ram.u16(slot + 4), 0x7f, 'state 4 ticks on promotion call');
  assert.equal(scriptSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 3),
    undefined, 'E3 stopped');
  assert.ok(scriptSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 2));
  ram.setU16(slot + 4, 1);
  f4Step2A0BDE(ram, ROM, ctx, slot);
  assert.equal(ram.u16(slot) & 0xff, 3, 'the retired slot is immediately reused by F3');
  assert.ok(scriptSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 3));
});

test('W223 E3 fires nineteen shots and E5 materializes a rendering type $41',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const bullets = [];
    const { a6, ctx } = bossContext(ram, bullets);
    ram.setU32(SCHED.ptrA1, 0x2a1608);

    const e3 = SCHED.a1Base;
    ram.setU16(e3, 0x8003);
    runScheduler25962E(ram, ROM, ctx);
    ram.setU8(e3 + 4, 0);
    runScheduler25962E(ram, ROM, ctx);
    assert.equal(bullets.length, 19);
    assert.deepEqual(bullets.map((b) => b.site), [0x2a2882,
      ...Array(3).fill(0x2a288e), ...Array(6).fill(0x2a28b4),
      ...Array(3).fill(0x2a28ce), ...Array(6).fill(0x2a28f4)]);

    ram.setU16(e3, 0);
    const e5 = SCHED.a1Base;
    ram.setU16(e5, 0x8005);
    ram.setU16(e5 + 2, 0x0100);
    ram.setU16(e5 + 4, 0);
    ram.setU16(e5 + 8, 1);
    runScheduler25962E(ram, ROM, ctx);
    assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
    assert.equal(processDeferred(ram, ROM, ctx.unportedLog, MT), 1);
    const child = Array.from({ length: ENEMY.slots }, (_, n) =>
      ENEMY.table + n * ENEMY.stride).find((a) => ram.u8(a + 0x0c) === 0x41);
    assert.ok(child, 'type $41 allocated');
    assert.equal(ram.u32(ram.u32(child + 6) + 2),
      (ram.u32(a6 + 0x62) + 0x0780fe40) >>> 0);
    const before = ram.u16(BUCKETS[22].counter);
    runHandler(0x2a3840, ram, ROM, child, ctx);
    assert.equal(ram.u16(BUCKETS[22].counter), before + 12,
      'type $41 reaches the extent-scaled bucket-22 renderer');
  });
