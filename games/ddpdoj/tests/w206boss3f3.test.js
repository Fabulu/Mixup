// W206: Stage-3 boss F3 -> MAIN2/D4 -> E5/D5/F6, stopping at F4.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog, Unreached } from '../src/unported.js';
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

function hasSlot(ram, base, slots, stride, id) {
  for (let i = 0; i < slots; i++) {
    const a = base + i * stride;
    if (ram.u16(a) !== 0 && ram.u8(a + 1) === id) return true;
  }
  return false;
}

test('W206 natural Stage-3 boss path reaches F4 after F3/E5/D5',
  { skip: SKIP }, () => {
  const { ram, a5 } = liveBoss();
  const seen = { main2: false, d4: false, e5: false, d5: false, e5Sites: new Set() };
  let stop = 0;

  for (let frame = 0; frame < 4000 && stop === 0; frame++) {
    for (const b of BUCKETS) ram.setU16(b.counter, 0);
    const log = new UnportedLog();
    const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
      soundPost() {}, effectSpawn() {},
      bulletSpawn(site) { if (site >= 0x29e18a && site <= 0x29e1ce) seen.e5Sites.add(site); } };
    try { runHandler(0x29be28, ram, ROM, a5, ctx); }
    catch (e) {
      if (!(e instanceof Unreached)) throw e;
      stop = e.romAddress;
    }
    seen.main2 ||= ram.u16(SCHED.seqCursor) === 2;
    seen.d4 ||= hasSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 4);
    seen.e5 ||= hasSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 5);
    seen.d5 ||= hasSlot(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride, 5);
  }

  assert.equal(stop, 0x29d0a6, 'F4 is the next deliberately loud scheduler entry');
  assert.deepEqual([seen.main2, seen.d4, seen.e5, seen.d5], [true, true, true, true]);
  assert.deepEqual([...seen.e5Sites].sort((a, b) => a - b),
    [0x29e18a, 0x29e198, 0x29e1a6, 0x29e1b2, 0x29e1c0, 0x29e1ce]);
});
