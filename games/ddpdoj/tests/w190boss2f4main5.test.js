// W190: stage-2 boss F4 conductor, its immediate leaves, and MAIN5 wander.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { MoveTables } from '../src/vectors.js';
import {
  SCHED, a1Clear259B34, a4Clear2598A2, a4Start25980C,
  runScheduler25962E, scriptAddresses, seqStart2598D0,
} from '../src/scheduler.js';
import '../src/boss2.js';

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
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x2000);
  runInitBodyAddr(0x297120, ram, ROM, A5, new UnportedLog());
  a4Clear2598A2(ram);
  a1Clear259B34(ram);
  return ram;
}

function context(ram, bullets = []) {
  return {
    ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unportedLog: new UnportedLog(),
    bulletSpawn: (site) => bullets.push(site),
  };
}

test('W190 F4 and MAIN5 run their fallthrough and same-pass descendants',
  { skip: SKIP }, () => {
    const registered = new Set(scriptAddresses());
    for (const addr of [
      0x297cc2, 0x297cfa, 0x2993b4, 0x299406,
      0x2980fa, 0x298106, 0x2981ec, 0x2981f2,
      0x299b54, 0x299b74, 0x29b00a, 0x29b024, 0x29b0a6, 0x29b0d0,
    ]) assert.ok(registered.has(addr), `$${addr.toString(16)} is registered`);
    assert.deepEqual([ROM.u32(0x297978), ROM.u32(0x29797c)],
      [0x297cc2, 0x297cfa]);
    assert.deepEqual([ROM.u32(0x298c86), ROM.u32(0x298c8a)],
      [0x2993b4, 0x299406]);

    const mainRam = fixture();
    const anchor = mainRam.u32(A6 + 0x02);
    mainRam.setU16(SCHED.a1Base, 0x8102);
    seqStart2598D0(mainRam, 5);
    runScheduler25962E(mainRam, ROM, context(mainRam));
    assert.equal(mainRam.u16(SCHED.seqCursor), 5);
    assert.equal(mainRam.u16(SCHED.seqSub), 4);
    assert.equal(mainRam.u16(SCHED.a1Base), 0, 'MAIN5 retired E2 before A1 walk');
    assert.equal(mainRam.u32(SCHED.seqDst + 0x04), anchor,
      'MAIN5 kept the original root as its wander anchor');
    assert.equal(mainRam.u8(A6 + 0x1a), 1,
      'INIT fallthrough spent the old-zero speed cadence');

    const f4Ram = fixture();
    const bullets = [];
    const ctx = context(f4Ram, bullets);
    a4Start25980C(f4Ram, 4);
    runScheduler25962E(f4Ram, ROM, ctx);
    const f4 = SCHED.a4Base;
    assert.equal(f4Ram.u16(f4 + 0x04), 0x005f);
    f4Ram.setU16(f4 + 0x04, 1);
    runScheduler25962E(f4Ram, ROM, ctx);
    assert.equal(f4Ram.u8(f4 + 0x02), 2);
    assert.equal(f4Ram.u8(f4 + 0x03), 1);
    assert.equal(f4Ram.u16(SCHED.a3Base), 0x8106);
    assert.equal(f4Ram.u16(A6 + 0x06), 4,
      'new D6 ran INIT and STEP later in the same scheduler pass');

    f4Ram.setU8(f4 + 0x16, 0);
    runScheduler25962E(f4Ram, ROM, ctx);
    assert.equal(f4Ram.u16(SCHED.a1Base), 0x810e);
    assert.ok(bullets.length >= 7,
      'new E14 fired its first widening fan in the same scheduler pass');
  });
