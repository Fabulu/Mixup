// W193: Stage-3 type $36, the seven-part carrier at clock $000A.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE36_ART } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { B, POOL_B } from '../src/effects.js';
import { CUE } from '../src/cues.js';
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
  ram.setU16(A5 + 0x04, 6);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x2350a8);
  ram.setU8(A5 + 0x0c, 0x36);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0a);
  runInitBodyAddr(0x263a58, ram, ROM, A5, new UnportedLog(), MT);
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

test('W193/1 type-$36 loads seven parts, sums linked damage, and lingers on death',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x263a58));
  assert.ok(HANDLER_ADDRESSES.includes(0x263c7c));
  assert.deepEqual(TYPE36_ART, {
    body: 0x178c8c, upperTable: 0x272cfa, lowerTable: 0x272dfa, headings: 32,
  });
  const ram = fixture();
  const c = context(ram);
  assert.equal(ram.u32(A5 + 0x44), 0x263bf0);
  assert.equal(ram.u32(A5 + 0x1a), 0x3000);
  assert.equal(ram.u16(A6 + 6 * 0x20), 0x8000);
  assert.deepEqual([ram.u8(A6 + 0x5c), ram.u8(A6 + 0x5e)], [0x10, 0x0f]);
  assert.deepEqual([ram.u16(0x8130f2), ram.u16(0x8130f4), ram.u16(0x8130f6)],
    [1, 1, 1]);

  ram.setU32(A6 + 0x02, 0x30002000);
  ram.setU16(0x8130d2, 1);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x6fff);
  ram.setU16(A6 + 0x38, 0x6fff);
  runHandler(0x263c7c, ram, ROM, A5, c.ctx);
  assert.equal(ram.u32(A5 + 0x1a), 0x1000, 'both $1000 hitbox deltas are subtracted');
  assert.deepEqual([ram.u16(A6 + 0x18), ram.u16(A6 + 0x38)], [0x7fff, 0x7fff]);
  assert.deepEqual(c.kills, [[0x13, 0x10], [0x13, 0x10], [0x11, 0x10], [0x32, 0x10]]);
  assert.deepEqual(c.effects.map(([kind]) => kind), [0x83, 0x83, 0x84, 0x84]);
  assert.equal(ram.u16(CUE.count), 4);
  assert.equal(ram.u8(A6 + 0x1d), 0x0f, 'the first hit flashes the prototype-zero palette');

  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x6ffe);
  runHandler(0x263c7c, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A6 + 0xda), 1);
  assert.equal(ram.u8(A6 + 0xdb), 0x0f);
  assert.equal(ram.u16(A5), 0x8000, 'death begins a 16-pass linger instead of freeing');
  assert.equal(c.kills.at(-1)[0], 0x174);
  assert.deepEqual(c.effects.slice(-6).map(([kind]) => kind),
    [0x0d, 0x85, 0x85, 0x0d, 0x0d, 0x85]);
  assert.equal(c.sounds.at(-1), 0x28c2dc);
  for (let i = 0; i < 14; i++) runHandler(0x263c7c, ram, ROM, A5, c.ctx);
  assert.notEqual(ram.u16(A5), 0);
  runHandler(0x263c7c, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
});

test('W193/2 real Stage-3 clock-$A spawn dispatches type $36 and draws all five parts',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(0x813096, 8);
  ram.setU16(0x813092, 2);
  ram.setU16(0x813094, 4);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0a);
  resetAndInstallStage26331E(ram, ROM, new UnportedLog());
  runSpawnWalker(ram, ROM, new UnportedLog(), MT);
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x23432a);

  let rec = 0;
  for (let i = 0; i < ENEMY.slots; i++) {
    const at = ENEMY.table + i * ENEMY.stride;
    if (ram.u32(at + ENEMY.handlerOff) === 0x263c7c) { rec = at; break; }
  }
  assert.notEqual(rec, 0);
  const sub = ram.u32(rec + ENEMY.subRecOff);
  const c = context(ram);
  ram.setU16(0x8130d2, 1);
  runHandler(0x263c7c, ram, ROM, rec, c.ctx);
  const bucket = resolveEmitStub(ROM, 0x23e056).bucket;
  assert.equal(ram.u16(BUCKETS[bucket].counter), 5 * 12);
  assert.equal(ram.u32(BUCKETS[bucket].buffer + 4), TYPE36_ART.body);
  assert.equal(ram.u16(rec + 0x04), 6);
  assert.equal(ram.u16(sub + 6 * 0x20), 0x8000);
  assert.equal(ram.u16(POOL_B.base + B.status), 0, 'drawing does not invent effects');
});
