// W189: stage-2 boss F1/F2/F8 phase conductors and immediate dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { MoveTables } from '../src/vectors.js';
import { POOL_B } from '../src/effects.js';
import { screenShake260EC8 } from '../src/background.js';
import {
  SCHED, a1Clear259B34, a4Clear2598A2, a4Start25980C,
  runScheduler25962E, scriptAddresses,
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

function context(ram, events = {}) {
  return {
    ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unportedLog: new UnportedLog(),
    soundPost: (site) => events.sounds?.push(site),
    effectSpawn: (kind, site) => events.effects?.push([kind, site]),
    bulletSpawn: (site) => events.bullets?.push(site),
  };
}

test('W189/1 all phase entries, same-frame descendants and sixteen A1 pairs are pinned',
  { skip: SKIP }, () => {
    const registered = new Set(scriptAddresses());
    for (const addr of [
      0x298ce2, 0x298d24, 0x297be8, 0x297bfc,
      0x298dc2, 0x298e02, 0x297ae6,
      0x299882, 0x2998aa, 0x298218, 0x29821e, 0x29b6d6, 0x29b6f0,
    ]) assert.ok(registered.has(addr), `$${addr.toString(16)} is registered`);
    assert.deepEqual([14, 15].map((id) => [
      ROM.u32(0x2998ac + id * 8), ROM.u32(0x2998b0 + id * 8),
    ]), [[0x29b0a6, 0x29b0d0], [0x29b6d6, 0x29b6f0]]);
    assert.equal(ROM.u32(0x297950 + 3 * 8), 0x297be8);
    assert.equal(ROM.u32(0x297954 + 3 * 8), 0x297bfc);
    assert.equal(ROM.u32(0x297950 + 1 * 8), 0x297ae6);
    assert.equal(ROM.u32(0x297ee0 + 10 * 8), 0x298218);
    assert.equal(ROM.u32(0x297ee4 + 10 * 8), 0x29821e);
  });

test('W189/2 F1 falls through, emits four effects, posts sound and runs MAIN3',
  { skip: SKIP }, () => {
    const ram = fixture();
    const events = { sounds: [], effects: [], bullets: [] };
    a4Start25980C(ram, 1);
    runScheduler25962E(ram, ROM, context(ram, events));
    const slot = SCHED.a4Base;
    assert.equal(ram.u16(slot), 0x8101);
    assert.equal(ram.u8(slot + 0x02), 1);
    assert.equal(ram.u16(slot + 0x04), 0x000f);
    assert.equal(ram.u16(slot + 0x06), 0x0404);
    assert.equal(ram.u16(slot + 0x14), 4);
    assert.deepEqual(events.sounds, [0x28c25a]);
    assert.equal(events.effects.length, 4);
    assert.equal(ram.u16(SCHED.seqCursor), 3);
    assert.equal(ram.u16(SCHED.seqSub), 4);
    assert.equal(ram.u16(A6 + 0x148), 1);
  });

test('W189/3 F8 runs E15 and D10 in the same scheduler pass',
  { skip: SKIP }, () => {
    const ram = fixture();
    const events = { sounds: [], effects: [], bullets: [] };
    ram.setU32(A5 + 0x16, 0x00002000);
    a4Start25980C(ram, 8);
    runScheduler25962E(ram, ROM, context(ram, events));
    assert.equal(ram.u16(SCHED.a4Base), 0x8108);
    assert.equal(ram.u16(SCHED.a1Base), 0x810f);
    assert.equal(ram.u16(SCHED.a3Base), 0x810a);
    assert.equal(ram.u16(SCHED.a3Base + 0x02), 0x0001,
      'D10 INIT fell through and spent its first non-borrow tick');
    assert.ok(events.bullets.length >= 2, 'low-HP E15 ran its two aimed iterations');
    assert.equal(ram.u16(0x803934), 1);
  });

test('W189/4 F2 reaches the final blast and completes its 42-frame shake',
  { skip: SKIP }, () => {
    const ram = fixture();
    const events = { sounds: [], effects: [], bullets: [] };
    const ctx = context(ram, events);
    a4Start25980C(ram, 2);
    runScheduler25962E(ram, ROM, ctx);
    const slot = SCHED.a4Base;
    assert.equal(ram.u16(slot), 0x8102);
    assert.equal(ram.u16(SCHED.seqCursor), 1);
    assert.deepEqual(events.sounds, [0x28c25a]);

    ram.setU8(slot + 0x02, 3);
    ram.setU16(slot + 0x04, 1);
    runScheduler25962E(ram, ROM, ctx);
    assert.equal(ram.u8(slot + 0x02), 4);
    assert.equal(ram.u16(0x813186), 1);
    assert.equal(events.effects.length, 40);
    assert.notEqual(ram.u16(POOL_B.base), 0);

    for (let i = 0; i < 43; i++) screenShake260EC8(ram, ROM, ctx);
    assert.equal(ram.u16(0x813186), 0);
    assert.equal(ram.u16(0x80b054), 0);
    assert.equal(ram.u16(0x80b056), 0);
    assert.equal(ram.u16(0x803936), 1);
  });
