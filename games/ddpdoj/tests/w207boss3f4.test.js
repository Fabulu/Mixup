// W207: Stage-3 boss F4 -> MAIN3/E3/E4, stopping at F5.

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

test('W207 natural Stage-3 boss path reaches F5 after MAIN3/E3/E4',
  { skip: SKIP }, () => {
  const { ram, a5 } = liveBoss();
  const seen = { main3: false, e3: false, e4: false, dummy9a: 0,
    e4Sites: new Set() };
  let stop = 0;

  for (let frame = 0; frame < 6000 && stop === 0; frame++) {
    for (const b of BUCKETS) ram.setU16(b.counter, 0);
    const log = new UnportedLog();
    const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
      soundPost() {}, effectSpawn() {},
      bulletSpawn(site) { if (site >= 0x29daae && site <= 0x29dbbc) seen.e4Sites.add(site); } };
    try { runHandler(0x29be28, ram, ROM, a5, ctx); }
    catch (e) {
      if (!(e instanceof Unreached)) throw e;
      stop = e.romAddress;
    }
    if (stop !== 0) break;
    processDeferred(ram, ROM, log, MT,
      (kind, type) => { if (kind === 'deferred' && type === 0x9a) seen.dummy9a++; });
    seen.main3 ||= ram.u16(SCHED.seqCursor) === 3;
    seen.e3 ||= hasSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 3);
    seen.e4 ||= hasSlot(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride, 4);
  }

  assert.equal(stop, 0x29d0d4, 'F5 is the next deliberately loud scheduler entry');
  assert.deepEqual([seen.main3, seen.e3, seen.e4], [true, true, true]);
  assert.ok(seen.dummy9a > 0, 'E3 requested and drained the self-freeing type $9A');
  assert.equal(Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .filter((p) => ram.u16(p) !== 0 && ram.u8(p + 0x0c) === 0x9a).length, 0);
  assert.deepEqual([...seen.e4Sites].sort((a, b) => a - b), [
    0x29daae, 0x29dadc,
    0x29dafe, 0x29db0a, 0x29db1c, 0x29db2e,
    0x29db40, 0x29db4c, 0x29db5e, 0x29db70,
    0x29db88, 0x29db92, 0x29db9c, 0x29dba8, 0x29dbb2, 0x29dbbc,
  ]);
});
