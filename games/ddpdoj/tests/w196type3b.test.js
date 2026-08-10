// W196: Stage-3 type $3B four-satellite orbit formation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE3B_ART } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function fixture(clock = 0x48, movement = 0x23526e) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x02, clock);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, movement);
  ram.setU8(A5 + 0x0c, 0x3b);
  ram.setU16(SPAWN.DISTANCE_CLOCK, clock);
  ram.setU16(0x813096, 8);
  runInitBodyAddr(0x264d5a, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const kills = [], effects = [], sounds = [], bullets = [];
  return { kills, effects, sounds, bullets, ctx: {
    ram, rom: ROM, tables: MT, unported: new UnportedLog(),
    killEvent: (score, hit) => kills.push([score, hit]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
    soundPost: (addr) => sounds.push(addr),
    bulletSpawn: (site, result) => bullets.push([site, result]),
  } };
}

test('W196 type-$3B initializes, fires its orbit, draws and dies visibly',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x264d5a));
  assert.ok(HANDLER_ADDRESSES.includes(0x264e82));
  assert.deepEqual(TYPE3B_ART,
    { hullTable: 0x2652d0, hullFrames: 16, satellite: 0x19271c });

  const ram = fixture();
  assert.deepEqual([ram.u16(0x8130d8), ram.u16(0x8130da), ram.u16(0x8130dc)],
    [1, 1, 1]);
  assert.deepEqual([ram.u16(A6 + 2), ram.u16(A6 + 4)], [0xa280, 0x1dc0]);
  assert.ok(ram.u8(A5 + 0x38) === 0xfe || ram.u8(A5 + 0x38) === 2);

  const c = context(ram);
  ram.setU32(A6 + 2, 0x30002000);
  ram.setU16(A5 + 0x3e, 0xffff);
  runHandler(0x264e82, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.map(([site]) => site),
    [0x265132, 0x265154, 0x26517c, 0x26519e,
      0x2651c6, 0x2651e8, 0x265210, 0x265232]);
  assert.deepEqual([ram.u8(A5 + 0x24), ram.u8(A5 + 0x26)], [4, 0x1f]);
  assert.equal(ram.u16(A5 + 0x3c), 4, 'the first hull draw uses frame one');

  const dead = fixture();
  const d = context(dead);
  dead.setU32(A6 + 2, 0x30002000);
  dead.setU16(A5 + 0x3e, 0xffff);
  dead.setU8(A6, dead.u8(A6) | 0x10);
  dead.setU16(A6 + 0x18, 0xffff);
  runHandler(0x264e82, dead, ROM, A5, d.ctx);
  assert.deepEqual(d.kills.at(-1), [0x632, 0x10]);
  assert.deepEqual(d.effects.map(([kind]) => kind),
    [0x8d, 0x0d, 0x8d, 0x8d, 0x8d, 0x8d]);
  assert.deepEqual(d.effects.map(([, , slot]) => [
    dead.u16(slot + B.delay), dead.u32(slot + B.nudge), dead.u16(slot + B.speed),
  ]), [[0, 0xf200f800, 0], [1, 0xfc000c00, 0], [2, 0x02000000, 0],
    [3, 0xee000e00, 0], [4, 0xe2000600, 0], [5, 0xe600f600, 0]]);
  assert.equal(d.sounds.at(-1), 0x28c2dc);
  assert.equal(dead.u16(0x8130d8), 0);
  assert.equal(dead.u16(A5), 0);
});

test('W196 real clock-$48 batch consumes type $3B and advances once',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x48);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x23453a);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234542);
  const types = [];
  for (let i = 0; i < ENEMY.slots; i++) {
    const at = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(at) !== 0) types.push(ram.u8(at + 0x0c));
  }
  assert.equal(types.at(-1), 0x3b);
});
