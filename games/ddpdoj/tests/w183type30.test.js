// W183: the final stage-2 spawn record, its full multi-part controller and
// arrival MAIN 0, derived statically from the Version-B ROM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { boss2Damage298310 } from '../src/boss2.js';
import { SCHED } from '../src/scheduler.js';

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

test('W183/1 static ROM closure pins the sole type $30 record and scheduler roots',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x297120));
  assert.ok(HANDLER_ADDRESSES.includes(0x297398));
  assert.deepEqual([ROM.u16(0x233020), ROM.u8(0x233024), ROM.u16(0x233026) & 0xfff],
    [0x01dc, 0x30, 0x000]);
  assert.equal(Buffer.from(ROM.bytes(0x297118, 8)).toString('hex'),
    '3b7c000b00044e75');
  assert.equal(Buffer.from(ROM.bytes(0x297398, 0x20)).toString('hex'),
    '4eb9002983104eb90025962e640000104eb9002429524ef9002637624e714e75');
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => [
    ROM.u32(0x297950 + i * 8), ROM.u32(0x297954 + i * 8),
  ]), [
    [0x297a10, 0x297a28], [0x297ae6, 0x297ae6],
    [0x297b22, 0x297b48], [0x297be8, 0x297bfc],
    [0x297c58, 0x297c6c], [0x297cc2, 0x297cfa],
    [0x297d6a, 0x297d7c], [0x297e12, 0x297e1c],
  ]);
  assert.deepEqual([ROM.u32(0x297ee0), ROM.u32(0x297ee4)],
    [0x297f54, 0x297f60]);
});

test('W183/2 init copies all twelve prototypes and installs the five schedulers',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.deepEqual([ram.u16(A5 + 0x16), ram.u16(A5 + 0x18), ram.u16(A5 + 0x1a)],
    [0x0002, 0xbdc0, 0x2a30]);
  assert.deepEqual([ram.u16(A6 + 0x02), ram.u16(A6 + 0x04)], [0x9c00, 0x1be0]);
  assert.equal(ram.u16(A6), 0x8000);
  assert.equal(ram.u16(A6 + 11 * 0x20), 0x8000);
  assert.deepEqual([
    ram.u32(SCHED.ptrA0), ram.u32(SCHED.ptrA1), ram.u32(SCHED.ptrA2),
    ram.u32(SCHED.ptrA3), ram.u32(SCHED.ptrA4),
  ], [0x297950, 0x2998ac, 0x297432, 0x297ee0, 0x298c66]);
  for (let i = 0; i < 11; i++)
    assert.equal(ram.u16(SCHED.a2Base + i * SCHED.a2Stride), 0x8001);
  assert.equal(ram.u16(SCHED.a2Base + 11 * SCHED.a2Stride), 0);
  assert.equal(ram.u16(SCHED.a4Base), 0x8000);
  assert.equal(ram.u16(A6 + 0x148), 1);
  for (const off of [0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0x100])
    assert.equal(ram.u16(A6 + off), 0x8000);
});

test('W183/3 first handler frame runs controller, MAIN 0 and initial A3 scripts',
  { skip: SKIP }, () => {
  const ram = fixture();
  const unportedLog = new UnportedLog();
  const ctx = { ram, rom: ROM, unportedLog };
  assert.throws(() => runHandler(0x297398, ram, ROM, A5, ctx),
    (e) => e instanceof Unreached && e.romAddress === 0x297462);
  assert.equal(ram.u16(A5 + 0x1a), 0x2a2f,
    '$298C30 spends the first real timeout frame before scheduler dispatch');
  assert.equal(ram.u16(SCHED.seqCursor), 0);
  assert.deepEqual([
    ram.u8(SCHED.seqDst + 0x02), ram.u16(SCHED.seqDst + 0x04),
    ram.u16(SCHED.seqDst + 0x06), ram.u16(SCHED.seqDst + 0x08),
  ], [0, 0x01bf, 0, 0]);
  assert.equal(ram.u16(SCHED.a3Base), 0x8100,
    'D0 is started by A4 bootstrap and marked initialized');
  assert.deepEqual([ram.u8(A6 + 0x26), ram.u8(A6 + 0x27), ram.u16(A6 + 0x28)],
    [2, 2, 4], 'D0 init falls through into its first timer/selector step');
  assert.deepEqual([ram.u16(A6 + 0x22), ram.u16(A6 + 0x24)], [0x8400, 0x1ee0],
    'MAIN 0 immediately runs the shared first-child placement tail');
});

test('W183/4 linked central hit subtracts the largest snapshot delta once',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU8(A6 + 0x14c, 1);
  ram.setU32(A5 + 0x16, 0x00010000);
  ram.setU16(A6 + 0x148, 0);
  ram.setU8(A6, 0x10);
  ram.setU16(A6 + 0x18, 0x7fef);
  ram.setU16(A6 + 0x38, 0x7fdf);
  ram.setU16(A6 + 0xd8, 0x7fff);
  ram.setU16(A6 + 0xf8, 0x7ff0);
  ram.setU16(A6 + 0x100, 0x8000);
  ram.setU16(0x8130d2, 1);
  boss2Damage298310(ram, ROM, A5, A6, { unportedLog: new UnportedLog() });
  assert.equal(ram.u32(A5 + 0x16), 0x0000ffe0,
    'max(16,32,0,15) is subtracted once, not summed or minimized');
  assert.deepEqual([0x18, 0x38, 0xd8, 0xf8].map((off) => ram.u16(A6 + off)),
    [0x7fff, 0x7fff, 0x7fff, 0x7fff]);
  assert.equal(ram.u16(A6 + 0x14a), 0x10);
});
