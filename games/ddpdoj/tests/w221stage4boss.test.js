// W221: Stage-4 boss A4/F3 first attack conductor.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { RAM, P } from '../src/machine.js';
import { f3Step2A0984 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

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
  return { ram, a5, a6, ctx };
}

test('W221 pins and registers the complete F3 conductor closure', { skip: SKIP }, () => {
  for (const addr of [0x2a092c, 0x2a0984, 0x29f790, 0x29f7a2])
    assert.ok(scriptAddresses().includes(addr), `$${addr.toString(16)} registered`);
  assert.equal(sha(0x2a092c, 0x02a0),
    '881f4920330be501003b102fde1a995c807dd08c82e57bb16bb070f8ce4b7eaa');
  assert.equal(sha(0x2a1608, 0x78),
    'd04557d9649b318df73b1901ce18a583f18b6d1ec5dfefc90b3a6ffccdc06009');
  assert.equal(sha(0x2a1720, 0x58),
    '53502b4dd43be8ce9c20213cb4a5a233ffc35551a5b540a6646823d05cd40454');
  assert.equal(sha(0x29f790, 0x7a),
    '7a1a698dce4bdb06e8e24269215e5405943de9e153f7f332cc080b109e0a42e8');
  assert.equal(Buffer.from(ROM.bytes(0x2a0bc8, 4)).toString('hex'), '00010002');
});

test('W221 F3 starts on the authentic next boss pass and owns both A1 handoffs',
  { skip: SKIP }, () => {
    const { ram, a5, a6, ctx } = fixture();
    const oldC6 = ram.u16(a6 + 0xc6);
    const oldE6 = ram.u16(a6 + 0xe6);
    const oldRng = ram.u8(0x803917);

    runHandler(0x29ef0a, ram, ROM, a5, ctx);

    const slot = SCHED.a4Base;
    assert.equal(ram.u16(slot), 0x8103);
    assert.equal(ram.u8(0x803917), (oldRng + 2) & 0xff);
    assert.ok(ram.u16(slot + 0x08) < 0x10);
    assert.ok(ram.u16(slot + 0x0a) < 0x10);
    assert.deepEqual([ram.u16(slot + 0x0c), ram.u16(slot + 0x0e),
      ram.u16(slot + 0x10)], [0x0101, 0x0020, 0x0808]);
    assert.deepEqual([ram.u8(slot + 0x12), ram.u8(slot + 0x13),
      ram.u8(slot + 0x14), ram.u8(slot + 0x15)], [2, 2, 2, 0x10]);
    assert.equal(ram.u16(a6 + 0xc6), oldC6 === ram.u16(slot + 0x08)
      ? oldC6 : (oldC6 + 1 === 0x18 ? 0 : oldC6 + 1));
    assert.equal(ram.u16(a6 + 0xe6), oldE6 === ram.u16(slot + 0x0a)
      ? oldE6 : (u16(oldE6 - 1) === 0xffff ? 0x17 : u16(oldE6 - 1)));

    for (let i = 0; i < SCHED.a1Slots; i++)
      ram.setU16(SCHED.a1Base + i * SCHED.a1Stride, 0);
    ram.setU8(slot + 0x02, 1);
    ram.setU8(slot + 0x04, 0);
    ram.setU8(slot + 0x05, 0x0c);
    ram.setU8(slot + 0x0c, 1);
    ram.setU16(slot + 0x0e, 0x20);
    f3Step2A0984(ram, ROM, ctx, slot);
    assert.deepEqual([ram.u16(SCHED.a1Base), ram.u16(SCHED.a1Base + 2)],
      [0x8001, 0]);
    assert.equal(ram.u16(slot + 0x06), 2);

    ram.setU16(SCHED.a1Base, 0);
    ram.setU8(slot + 0x02, 2);
    ram.setU8(slot + 0x15, 0);
    ram.setU8(slot + 0x04, 1);
    ram.setU8(slot + 0x10, 0);
    ram.setU8(slot + 0x11, 8);
    ram.setU8(slot + 0x12, 2);
    f3Step2A0984(ram, ROM, ctx, slot);
    assert.deepEqual([ram.u16(SCHED.a1Base), ram.u16(SCHED.a1Base + 2)],
      [0x8002, 2]);
  });
