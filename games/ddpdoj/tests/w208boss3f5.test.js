// W208: Stage-3 boss F5 -> D4/E8/D5/F7 -> the existing F2 cycle.

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
  const a5 = Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((p) => ram.u8(p + 0x0c) === 0xa0);
  assert.ok(a5);
  return { ram, a5 };
}

test('W208 natural Stage-3 boss path closes F5 back into F2',
  { skip: SKIP }, () => {
  const { ram, a5 } = liveBoss();
  const seen = { f5: false, d4: false, e8: false, d5: false, f7: false,
    returnedF2: false, e8Sites: new Set() };
  let stop = 0;

  for (let frame = 0; frame < 9000 && stop === 0 && !seen.returnedF2; frame++) {
    for (const b of BUCKETS) ram.setU16(b.counter, 0);
    const log = new UnportedLog();
    const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
      soundPost() {}, effectSpawn() {},
      bulletSpawn(site) {
        if (site >= 0x29e446 && site <= 0x29e4c8) seen.e8Sites.add(site);
      } };
    try { runHandler(0x29be28, ram, ROM, a5, ctx); }
    catch (e) {
      if (!(e instanceof Unreached)) throw e;
      stop = e.romAddress;
    }
    if (stop !== 0) break;
    processDeferred(ram, ROM, log, MT);

    const f5 = hasSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 5);
    const d4 = hasSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 4);
    const e8 = hasSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 8);
    const d5 = hasSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 5);
    const f7 = hasSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 7);
    seen.f5 ||= f5;
    seen.d4 ||= seen.f5 && d4;
    seen.e8 ||= seen.f5 && e8;
    seen.d5 ||= seen.e8 && d5;
    seen.f7 ||= seen.e8 && f7;
    seen.returnedF2 ||= seen.f7 && !e8 && !d5
      && hasSlot(ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride, 2);
  }

  assert.equal(stop, 0);
  assert.deepEqual([seen.f5, seen.d4, seen.e8, seen.d5, seen.f7, seen.returnedF2],
    [true, true, true, true, true, true]);
  assert.deepEqual([...seen.e8Sites].sort((a, b) => a - b),
    [0x29e446, 0x29e476, 0x29e488, 0x29e498, 0x29e4aa]);
});
