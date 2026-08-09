// W184: stage-2 boss A3/D0, statically closed at $297F54..$297F84.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { runHandler } from '../src/handlers.js';
import { SCHED } from '../src/scheduler.js';
import { SPAWN } from '../src/spawn.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 11);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x233194);
  ram.setU8(A5 + 0x0c, 0x30);
  ram.setU16(0x813172, 0x0020);
  runInitBodyAddr(0x297120, ram, ROM, A5, new UnportedLog());
  return ram;
}

test('W184/1 D0 ROM closure is exact and has no external dependencies',
  { skip: SKIP }, () => {
  assert.equal(Buffer.from(ROM.bytes(0x297f54, 0x30)).toString('hex'),
    '3d7c000200263d7c00000028532e00266400001c1d6e00270026586e0028'
    + '0c6e00200028660000083d7c000000284e75');
});

test('W184/2 the initial A3 set runs before A2 object 0 becomes the frontier',
  { skip: SKIP }, () => {
  const ram = fixture();
  const ctx = { ram, rom: ROM, unportedLog: new UnportedLog() };
  assert.throws(() => runHandler(0x297398, ram, ROM, A5, ctx),
    (e) => e instanceof Unreached && e.romAddress === 0x297462);
  assert.deepEqual([ram.u8(A6 + 0x26), ram.u8(A6 + 0x27), ram.u16(A6 + 0x28)],
    [2, 2, 4]);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) =>
    ram.u16(SCHED.a3Base + i * SCHED.a3Stride)),
  [0x8100, 0x8102, 0x810b, 0x810c, 0x810d]);
  assert.deepEqual([
    ram.u8(SCHED.a3Base + SCHED.a3Stride + 0x02),
    ram.u8(SCHED.a3Base + SCHED.a3Stride + 0x03),
    ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x04), ram.u16(A6 + 0x06),
  ], [3, 3, 2, 0], 'D2 initializes and emits selector zero immediately');
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
  assert.equal(ram.u16(SPAWN.DEFQ_BASE + 0x02), 0x004d);
  assert.equal(ram.u32(SPAWN.DEFQ_BASE + 0x16),
    (ram.u32(A6 + 0x22) + 0xf000f500) >>> 0);
});
