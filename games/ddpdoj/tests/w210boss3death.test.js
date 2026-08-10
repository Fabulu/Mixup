// W210: Stage-3 boss F1 death presentation, suspension, and stage advance.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import {
  resetAndInstallStage26331E, runSpawnWalker, SPAWN,
} from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import {
  SCHED, a1Clear259B34, a4Clear2598A2, a4Start25980C, runScheduler25962E,
} from '../src/scheduler.js';
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
    .find((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === 0xa0);
  assert.ok(a5);
  return { ram, a5, a6: ram.u32(a5 + 0x06) };
}

function context(ram, a5, a6, events) {
  const log = new UnportedLog();
  return { ram, rom: ROM, tables: MT, bossRec: a5, bossSubRec: a6,
    unported: log, unportedLog: log,
    soundPost(addr) { events.sounds.push(addr); },
    effectSpawn(kind, site) { events.effects.push([kind, site]); },
    stageEndEvent(kind, d7) { events.stage.push([kind, d7]); } };
}

test('W210 F1 final state emits the shared 39-row blast and suspends',
  { skip: SKIP }, () => {
  const { ram, a5, a6 } = liveBoss();
  const events = { sounds: [], effects: [], stage: [] };
  const ctx = context(ram, a5, a6, events);
  a1Clear259B34(ram);
  a4Clear2598A2(ram);
  a4Start25980C(ram, 1);
  runScheduler25962E(ram, ROM, ctx);
  const slot = SCHED.a4Base;
  assert.equal(ram.u16(slot), 0x8101);
  assert.equal(ram.u16(slot + 0x02), 0);

  ram.setU16(slot + 0x02, 3);
  ram.setU16(slot + 0x04, 1);
  runScheduler25962E(ram, ROM, ctx);
  assert.equal(ram.u16(slot + 0x02), 4);
  assert.equal(events.effects.filter(([, site]) => site === 0x2440f8).length, 39);
  assert.equal(ram.u16(0x813186), 1);
  assert.ok(events.sounds.includes(0x28c392));

  ram.setU16(slot + 0x04, 1);
  runScheduler25962E(ram, ROM, ctx);
  assert.equal(ram.u16(SCHED.suspend), 1);
  assert.equal(ram.u16(slot), 0);
});

test('W210 real negative-HP controller path advances from Stage 3',
  { skip: SKIP }, () => {
  const { ram, a5, a6 } = liveBoss();
  const events = { sounds: [], effects: [], stage: [] };
  let stop = 0;

  ram.setU8(a6 + 0x86, 0);
  ram.setU16(a6 + 0x88, 0);
  ram.setU32(a5 + 0x16, 0xffffffff);
  ram.setU8(a6, ram.u8(a6) | 0x04);
  for (const off of [0x18, 0x38, 0x58, 0xd8, 0xf8]) ram.setU16(a6 + off, 0x7fff);

  for (let frame = 0; frame < 5000 && ram.u16(a5) !== 0 && stop === 0; frame++) {
    for (const b of BUCKETS) ram.setU16(b.counter, 0);
    const ctx = context(ram, a5, a6, events);
    try { runHandler(0x29be28, ram, ROM, a5, ctx); }
    catch (e) {
      if (!(e instanceof Unreached)) throw e;
      stop = e.romAddress;
    }
  }

  assert.equal(stop, 0);
  assert.equal(ram.u16(a5), 0, 'the wrapper frees the boss after suspension');
  assert.deepEqual(events.stage, [['stage-advance', 3]]);
  assert.equal(events.effects.filter(([, site]) => site === 0x2440f8).length, 39);
  assert.ok(events.sounds.includes(0x28c392));
  assert.ok(events.sounds.includes(0x28cb60), 'stage advance posts its fixed sound');
});
