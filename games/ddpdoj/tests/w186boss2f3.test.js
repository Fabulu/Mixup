// W186: stage-2 boss F3 conductor, MAIN2 waypoint mover and A3/D3 driver.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { runHandler } from '../src/handlers.js';
import { MoveTables } from '../src/vectors.js';
import { SCHED, a4Clear2598A2, a4Start25980C } from '../src/scheduler.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
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

function context(ram) {
  return { ram, rom: ROM, tables: MT, unportedLog: new UnportedLog() };
}

test('W186/1 F3, MAIN2, D3 and the complete A1 pointer table are ROM-pinned',
  { skip: SKIP }, () => {
    assert.equal(Buffer.from(ROM.bytes(0x2993a4, 0x10)).toString('hex'),
      '00060040000700a00008004000090030');
    assert.deepEqual([ROM.u32(0x297950 + 2 * 8), ROM.u32(0x297954 + 2 * 8)],
      [0x297b22, 0x297b48]);
    assert.deepEqual([ROM.u32(0x297ee0 + 3 * 8), ROM.u32(0x297ee4 + 3 * 8)],
      [0x29804c, 0x298066]);
    assert.deepEqual([ROM.u32(0x298c66 + 3 * 8), ROM.u32(0x298c6a + 3 * 8)],
      [0x299194, 0x2991bc]);
    assert.deepEqual([6, 7, 8, 9, 10, 11].map((id) => [
      ROM.u32(0x2998ac + id * 8), ROM.u32(0x2998b0 + id * 8),
    ]), [
      [0x299e90, 0x299eda], [0x29a0f6, 0x29a146],
      [0x29a4c4, 0x29a528], [0x29a886, 0x29a8f2],
      [0x29ab50, 0x29ab7e], [0x29ae48, 0x29ae4c],
    ]);
  });

test('W186/2 F3 immediately dispatches MAIN2 and D3 in scheduler order',
  { skip: SKIP }, () => {
    const ram = fixture();
    const ctx = context(ram);
    runHandler(0x297398, ram, ROM, A5, ctx); // Install and run the F0 arrival set.
    a4Clear2598A2(ram);
    a4Start25980C(ram, 3);
    runHandler(0x297398, ram, ROM, A5, ctx);

    assert.equal(ram.u16(SCHED.seqCursor), 2);
    assert.equal(ram.u16(SCHED.seqSub), 4);
    assert.equal(ram.u16(SCHED.a4Base), 0x8103);
    assert.equal(ram.u16(SCHED.a4Base + 0x04), 0x003f,
      'F3 init falls through and spends its first scheduler-call countdown');
    const d3 = SCHED.a3Base + 5 * SCHED.a3Stride;
    assert.equal(ram.u16(d3), 0x8103);
    assert.ok(ram.u8(A6 + 0x11b) === 1 || ram.u8(A6 + 0x11b) === 0x3f);
  });

test('W186/3 the startup countdown reaches the honest E6 frontier',
  { skip: SKIP }, () => {
    const ram = fixture();
    const ctx = context(ram);
    runHandler(0x297398, ram, ROM, A5, ctx);
    a4Clear2598A2(ram);
    a4Start25980C(ram, 3);
    runHandler(0x297398, ram, ROM, A5, ctx);
    ram.setU16(SCHED.a4Base + 0x04, 1);
    assert.throws(() => runHandler(0x297398, ram, ROM, A5, ctx), (err) => {
      assert.ok(err instanceof Unreached);
      assert.equal(err.romAddress, 0x299e90);
      return true;
    });
  });
