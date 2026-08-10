// W197: Stage-3 types $38/$39/$3A, three data variants of handler $2647A6.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, TYPE37_ART, TYPE38_FAMILY_ART } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { C, POOL_C } from '../src/effects.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon, A6 = SPAWN.SUB_COMMON;

const CASES = [
  { type: 0x38, body: 0x264c1c, move: 0x23525c, clock: 0x64,
    xy: [0x82c0, 0x2e00], origin: 0x0e00fdc0,
    selector: 0x1460, hull: 0x2a63fc, fixed: 0xec00f400 },
  { type: 0x39, body: 0x264c84, move: 0x235262, clock: 0x83,
    xy: [0x8440, 0x3780], origin: 0x09c0fdc0,
    selector: 0x1250, hull: 0x2a67c0, fixed: 0xee00f600 },
  { type: 0x3a, body: 0x264cec, move: 0x235268, clock: 0xbf,
    xy: [0x8200, 0xffc0], origin: 0x0e000280,
    selector: 0x1660, hull: 0x2a6a94, fixed: 0xea00f400 },
];

function fixture(v) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x02, v.clock);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, v.move);
  ram.setU8(A5 + 0x0c, v.type);
  ram.setU16(SPAWN.DISTANCE_CLOCK, v.clock);
  ram.setU16(0x813096, 8);
  runInitBodyAddr(v.body, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const kills = [], poolC = [], sounds = [];
  return { kills, poolC, sounds, ctx: {
    ram, rom: ROM, tables: MT, unported: new UnportedLog(),
    killEvent: (score, hit) => kills.push([score, hit]),
    poolCSpawn: (slot, kind, bucket) => poolC.push([slot, kind, bucket]),
    soundPost: (addr) => sounds.push(addr),
  } };
}

test('W197 type-$38/$39/$3A variants initialize and draw their own hulls',
  { skip: SKIP }, () => {
  assert.deepEqual(TYPE38_FAMILY_ART, [0x2a63fc, 0x2a67c0, 0x2a6a94]);
  for (const v of CASES) {
    assert.ok(INIT_BODY_ADDRESSES.includes(v.body));
    const ram = fixture(v);
    assert.deepEqual([ram.u16(A6 + 2), ram.u16(A6 + 4)], v.xy);
    assert.deepEqual([ram.u32(A6 + 6), ram.u16(A6 + 0x18)],
      [v.origin, 0x0780]);
    assert.deepEqual([ram.u16(A5 + 0x26), ram.u32(A5 + 0x28), ram.u32(A5 + 0x2c)],
      [v.selector, v.hull, v.fixed]);
    assert.deepEqual([ram.u8(A5 + 0x1b), ram.u8(A5 + 0x1c), ram.u8(A5 + 0x1d)],
      [0x13, 0x13, 0x0c]);

    const c = context(ram);
    ram.setU32(A6 + 2, 0x30002000);
    runHandler(0x2647a6, ram, ROM, A5, c.ctx);
    const fixedBucket = resolveEmitStub(ROM, 0x23e020).bucket;
    const rotatingBucket = resolveEmitStub(ROM, 0x23e08c).bucket;
    assert.equal(ram.u32(BUCKETS[fixedBucket].buffer + 4), v.hull);
    assert.equal(ram.u32(BUCKETS[rotatingBucket].buffer + 4),
      ROM.u32(TYPE37_ART.table + 4));
  }

  const v = CASES[2];
  const dead = fixture(v);
  const d = context(dead);
  dead.setU32(A6 + 2, 0x30002000);
  dead.setU8(A6, dead.u8(A6) | 0x10);
  dead.setU16(A6 + 0x18, 0xffff);
  runHandler(0x2647a6, dead, ROM, A5, d.ctx);
  assert.deepEqual(d.kills.at(-1), [0x47, 0x10]);
  assert.deepEqual(d.poolC.map(([, kind, bucket]) => [kind, bucket]), [[4, 0x0c]]);
  assert.equal(dead.u32(POOL_C.base + C.pos), 0x3a002280,
    'the shared death uses type $3A\'s own rotating-origin offset');
  assert.equal(d.sounds.at(-1), 0x28c2c2);
  assert.equal(dead.u32(BUCKETS[resolveEmitStub(ROM, 0x23e020).bucket].buffer + 4),
    v.hull, 'the type-specific fixed hull remains on the death frame');
});

test('W197 real clock batches cross all three shared-handler variants',
  { skip: SKIP }, () => {
  for (const [clock, cursor, script, next] of [
    [0x64, 0x2345d2, 2, 0x2345e2],
    [0x83, 0x23469a, 3, 0x2346b2],
    [0xbf, 0x23480a, 2, 0x23481a],
  ]) {
    const ram = new Ram();
    ram.setU16(0x813092, 2);
    ram.setU16(0x813094, 4);
    ram.setU16(0x813096, 8);
    ram.setU16(SPAWN.DISTANCE_CLOCK, clock);
    resetAndInstallStage26331E(ram, ROM, new UnportedLog());
    ram.setU32(SPAWN.LIVE_CURSOR, cursor);
    assert.deepEqual(runSpawnWalker(ram, ROM, new UnportedLog(), MT),
      { script, deferred: 0 });
    assert.equal(ram.u32(SPAWN.LIVE_CURSOR), next);
  }
});
