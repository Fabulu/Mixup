// W194: Stage-3 type $37 and its pool-C death satellite at clock $003B.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE37_ART } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { B, C, POOL_B, POOL_C, runPoolCDriver } from '../src/effects.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x02, 0x0100);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x23518e);
  ram.setU8(A5 + 0x0c, 0x37);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x3b);
  ram.setU16(0x813096, 8);
  runInitBodyAddr(0x264740, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const kills = [], effects = [], sounds = [], bullets = [], poolC = [];
  return { kills, effects, sounds, bullets, poolC, ctx: {
    ram, rom: ROM, tables: MT, unported: new UnportedLog(),
    killEvent: (score, hit) => kills.push([score, hit]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
    soundPost: (addr) => sounds.push(addr),
    bulletSpawn: (site, result) => bullets.push([site, result]),
    poolCSpawn: (slot, kind, bucket) => poolC.push([slot, kind, bucket]),
  } };
}

test('W194/1 type-$37 preserves burst cadence and death runs visible pool C',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x264740));
  assert.ok(HANDLER_ADDRESSES.includes(0x2647a6));
  assert.deepEqual(TYPE37_ART,
    { body: 0x2a60f8, table: 0x264986, frames: 128 });
  const ram = fixture();
  const c = context(ram);
  assert.deepEqual([ram.u16(A6 + 0x02), ram.u16(A6 + 0x04)], [0x7c00, 0x1000]);
  assert.equal(ram.u32(A5 + 0x28), TYPE37_ART.body);
  assert.equal(ram.u16(A5 + 0x26), 0x1060);

  ram.setU32(A6 + 0x02, 0x30002000);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU32(0x8103e6 + 2, 0x50002000);
  ram.setU8(A5 + 0x20, 1);
  ram.setU8(A5 + 0x22, 4);
  ram.setU8(A5 + 0x24, 0);
  runHandler(0x2647a6, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A5 + 0x22), 4, 'dormant burst does not tick the inner timer');
  assert.equal(c.bullets.length, 0);

  ram.setU8(A5 + 0x20, 0);
  ram.setU8(A5 + 0x22, 0);
  runHandler(0x2647a6, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.map(([site]) => site), [0x2648f6, 0x2648fe, 0x264906]);
  assert.equal(ram.u8(A5 + 0x24), 3);

  const dead = fixture();
  const d = context(dead);
  dead.setU32(A6 + 0x02, 0x30002000);
  dead.setU8(A6, dead.u8(A6) | 0x10);
  dead.setU16(A6 + 0x18, 0xffff);
  runHandler(0x2647a6, dead, ROM, A5, d.ctx);
  assert.equal(d.kills.at(-1)[0], 0x47);
  assert.deepEqual(d.effects.map(([kind]) => kind), [0x84]);
  assert.deepEqual(d.poolC.map(([, kind, bucket]) => [kind, bucket]), [[4, 0x0c]]);
  assert.equal(d.sounds.at(-1), 0x28c2c2);
  assert.equal(dead.u16(POOL_C.count), 1);
  assert.equal(dead.u16(POOL_C.base + C.status), 0x8004);
  assert.equal(dead.u8(A5 + 0x1b), dead.u8(A5 + 0x1c));
  assert.equal(dead.u32(BUCKETS[resolveEmitStub(ROM, 0x23e020).bucket].buffer + 4),
    TYPE37_ART.body, 'the fixed hull remains for the death frame');

  const frame = runPoolCDriver(dead, ROM, d.ctx);
  assert.deepEqual(frame, { live: 1, emitted: 1, freed: 0 });
  assert.equal(dead.u16(BUCKETS[resolveEmitStub(ROM, 0x23d816).bucket].counter), 12);
  assert.equal(dead.u16(POOL_B.base + B.status), 0x8084);
});

test('W194/2 real clock-$3B record still spawns $37 after type $3C is closed',
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
  let rec = 0;
  for (let i = 0; i < ENEMY.slots; i++) {
    const at = ENEMY.table + i * ENEMY.stride;
    if (ram.u32(at + ENEMY.handlerOff) === 0x2647a6) { rec = at; break; }
  }
  assert.notEqual(rec, 0);
  assert.equal(ram.u8(rec + 0x0c), 0x37);
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x23451a);
});
