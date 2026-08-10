// W209: Stage-3 boss low-HP F9/F8 geometry loop and live type-$99 pair.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import {
  resetAndInstallStage26331E, runSpawnWalker, processDeferred, SPAWN,
} from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED } from '../src/scheduler.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';

function hasSlot(ram, base, slots, stride, id) {
  for (let i = 0; i < slots; i++) {
    const a = base + i * stride;
    if (ram.u16(a) !== 0 && ram.u8(a + 1) === id) return true;
  }
  return false;
}

function enemiesOfType(ram, type) {
  return Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .filter((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === type);
}

function liveBoss() {
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
  const a5 = enemiesOfType(ram, 0xa0)[0];
  assert.ok(a5);
  return { ram, a5, a6: ram.u32(a5 + 0x06) };
}

test('W209 low-HP branch completes F9/F8, geometry loop, and mirrored type-$99 pair',
  { skip: SKIP }, () => {
  const { ram, a5, a6 } = liveBoss();
  assert.equal(ROM.u32(0x27e4da), 0x0029e578);
  assert.equal(ROM.u32(0x27e4de), 0x0029e6b0);

  // Enter through the real controller branch before F0 is consumed. This
  // isolates the low-HP graph while retaining the real boss records/tables.
  ram.setU32(a5 + 0x16, 0x000117ff);
  ram.setU8(a6 + 0x86, 0);
  ram.setU8(a6 + 0x8c, 0);

  const seen = { f9: false, f8: false, d2: false, e1: false, e2: false,
    d3: false, restartedD2: false, type99: false, active99: false };
  const knownChildren = new Set();
  const activeArt = new Set(Array.from({ length: 8 }, (_, i) => ROM.u32(0x29e976 + i * 4)));
  let f9Effects = 0;
  let stop = 0;

  for (let frame = 0; frame < 2500 && stop === 0 && !seen.restartedD2; frame++) {
    for (const b of BUCKETS) ram.setU16(b.counter, 0);
    const log = new UnportedLog();
    const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
      soundPost() {},
      effectSpawn(_kind, site) { if (site === 0x29d1c8) f9Effects++; },
      bulletSpawn() {} };
    try {
      runHandler(0x29be28, ram, ROM, a5, ctx);
      for (const child of enemiesOfType(ram, 0x99)) {
        if (knownChildren.has(child)) runHandler(0x29e6b0, ram, ROM, child, ctx);
      }
    } catch (e) {
      if (!(e instanceof Unreached)) throw e;
      stop = e.romAddress;
    }
    if (stop !== 0) break;

    processDeferred(ram, ROM, log, MT, undefined, undefined, () => {});
    const children = enemiesOfType(ram, 0x99);
    seen.type99 ||= children.length === 2;
    for (const child of children) {
      knownChildren.add(child);
      const sub = ram.u32(child + 0x06);
      seen.active99 ||= ram.u16(child + 0x18) !== 0 && activeArt.has(ram.u32(sub + 0x0a));
    }

    const f9 = hasSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 9);
    const f8 = hasSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 8);
    const d2 = hasSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 2);
    seen.f9 ||= f9;
    seen.f8 ||= f8;
    seen.d2 ||= d2;
    seen.e1 ||= hasSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 1);
    seen.e2 ||= hasSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 2);
    seen.d3 ||= hasSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 3);
    seen.restartedD2 ||= seen.d3 && d2 && seen.type99 && seen.active99;
  }

  assert.equal(stop, 0);
  assert.equal(f9Effects, 24);
  assert.deepEqual(Object.values(seen), [true, true, true, true, true, true, true, true, true]);
  assert.equal(ram.u16(SCHED.a2Base + 8 * SCHED.a2Stride) & 1, 0,
    'F9 stops A2 object 8');
  assert.equal(ram.u16(SCHED.a2Base + 2 * SCHED.a2Stride) & 1, 1,
    'D3 re-arms A2 object 2');
  assert.equal(ram.u16(SCHED.a2Base + 3 * SCHED.a2Stride) & 1, 1,
    'D3 re-arms A2 object 3');
  assert.equal(enemiesOfType(ram, 0x99).length, 2,
    'E0 creates exactly one mirrored pair');
});
