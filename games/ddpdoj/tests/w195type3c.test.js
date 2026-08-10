// W195: Stage-3 type $3C, its four-state formation and six-muzzle patterns.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE3C_ART } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { B } from '../src/effects.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function fixture(movement = 0x235298) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x02, 0x0100);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, movement);
  ram.setU8(A5 + 0x0c, 0x3c);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x3b);
  ram.setU16(0x813096, 8);
  runInitBodyAddr(0x266968, ram, ROM, A5, new UnportedLog(), MT);
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

test('W195/1 type-$3C opens, runs both early patterns, freezes and dies visibly',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x266968));
  assert.ok(HANDLER_ADDRESSES.includes(0x2669e2));
  assert.deepEqual(TYPE3C_ART,
    { centre: 0x174040, left: 0x1741cc, right: 0x1742e8 });

  const firstHit = fixture();
  const fh = context(firstHit);
  firstHit.setU32(A6 + 0x02, 0x30002000);
  firstHit.setU8(A6, firstHit.u8(A6) | 0x10);
  firstHit.setU16(A6 + 0x18, 0xffff);
  runHandler(0x2669e2, firstHit, ROM, A5, fh.ctx);
  assert.equal(firstHit.u16(A6 + 0x18), 0x0c00,
    'the first pre-attack hit deliberately overwrites the damage result');
  assert.equal(firstHit.u8(A5 + 0x26), 0);

  const ram = fixture();
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x30002000);
  ram.setU8(A5 + 0x1c, 0);
  runHandler(0x2669e2, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A5 + 0x17), 1);
  assert.equal(ram.u8(A5 + 0x1c), 0x10);

  ram.setU16(A5 + 0x1a, 0x0340);
  ram.setU16(A6 + 0x14, 0x0340);
  ram.setU16(A6 + 0x16, 0x0340);
  runHandler(0x2669e2, ram, ROM, A5, c.ctx);
  assert.deepEqual([ram.u8(A5 + 0x17), ram.u16(A5 + 0x1a)], [2, 0x0380]);

  runHandler(0x2669e2, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.map(([site]) => site), Array(6).fill(0x266ca6));
  assert.deepEqual([ram.u16(A5 + 0x22), ram.u16(A5 + 0x24), ram.u8(A5 + 0x26)],
    [4, 1, 1]);

  ram.setU16(0x8103e6, 0x8000);
  ram.setU32(0x8103e6 + 2, 0x50002000);
  ram.setU8(A5 + 0x1e, 0);
  runHandler(0x2669e2, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.slice(6).map(([site]) => site),
    Array(6).fill(0x266c64));

  ram.setU16(0x8130d2, 1);
  const state = [ram.u8(A5 + 0x17), ram.u8(A5 + 0x1e), ram.u16(A5 + 0x24)];
  const bucket = resolveEmitStub(ROM, 0x23e08c).bucket;
  const before = ram.u16(BUCKETS[bucket].counter);
  runHandler(0x2669e2, ram, ROM, A5, c.ctx);
  assert.deepEqual([ram.u8(A5 + 0x17), ram.u8(A5 + 0x1e), ram.u16(A5 + 0x24)],
    state, 'freeze preserves the formation state');
  assert.equal(ram.u16(BUCKETS[bucket].counter), before + 36,
    'freeze still emits all three 12-byte draw records');

  const dead = fixture();
  const d = context(dead);
  dead.setU32(A6 + 0x02, 0x30002000);
  dead.setU8(A5 + 0x26, 1);
  dead.setU8(A6, dead.u8(A6) | 0x10);
  dead.setU16(A6 + 0x18, 0xffff);
  runHandler(0x2669e2, dead, ROM, A5, d.ctx);
  assert.equal(d.kills.at(-1)[0], 0x72);
  assert.equal(d.sounds.at(-1), 0x28c274);
  assert.deepEqual(d.effects.map(([kind]) => kind), [0x85, 0x85, 0x0d]);
  assert.deepEqual(d.effects.map(([, , slot]) => [
    dead.u16(slot + B.delay), dead.u32(slot + B.nudge), dead.u16(slot + B.speed),
  ]), [[0, 0x0400fb00, 0x02c0], [0, 0x04000500, 0x0240],
    [0, 0xf6000000, 0x0280]]);
  assert.equal(dead.u16(A5), 0, 'death frees the source record');
});

test('W195/2 the real clock-$3B batch now consumes $37, $10 and $3C',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(0x813096, 8);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x3b);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  ram.setU32(SPAWN.LIVE_CURSOR, 0x234502);
  assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
    { script: 3, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x23451a);
  const types = [];
  for (let i = 0; i < ENEMY.slots; i++) {
    const at = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(at) !== 0) types.push(ram.u8(at + 0x0c));
  }
  assert.deepEqual(types.slice(-3), [0x37, 0x10, 0x3c]);
});
