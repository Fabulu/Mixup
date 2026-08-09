// W175: stage-2 type $96, exact init/handler/data/art/death-tail closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE96_ART } from '../src/handlers.js';
import { BUCKETS, EMIT_TABLE, resolveEmitStub } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';
import { BULLET_DRIVER } from '../src/bulletdriver.js';
import { armScreenClear, armScreenClear243E02 } from '../src/midboss.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A5 + 0x0c, 0x96);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8130bc, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x5000);
  runInitBodyAddr(0x27a454, ram, ROM, A5, new UnportedLog(), MT);
  ram.setU32(A6 + 0x02, 0x20004000);
  return ram;
}

function context(ram) {
  const sounds = [], bullets = [], kills = [], effects = [];
  const unported = new UnportedLog();
  return { sounds, bullets, kills, effects, unported, ctx: {
    ram, rom: ROM, tables: MT, unported, unportedLog: unported,
    soundPost: (a) => sounds.push(a),
    bulletSpawn: (site, result) => bullets.push([site, result]),
    killEvent: (score, hit) => kills.push([score, hit]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
  } };
}

function sprites(ram, bucket) {
  const b = BUCKETS[bucket], out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12)
    out.push(ram.u32(b.buffer + off + 4));
  return out;
}

test('W175/1 ROM pins the sole occurrence, movement, 17-stream art and type $8C frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27a454));
  assert.ok(HANDLER_ADDRESSES.includes(0x27a548));
  assert.deepEqual(TYPE96_ART,
    { animationTable: 0x27a9ec, frames: 16, death: 0x2799f4 });
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => ROM.u32(0x27a9ec + i * 8)),
    Array.from({ length: 16 }, (_, i) => 0x2731b4 + i * 0x684));
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => ROM.u32(0x27a9f0 + i * 8)),
    Array.from({ length: 16 }, (_, i) => {
      const w = 0x0600 + i * 0x40; return (w * 0x10001) >>> 0;
    }));
  assert.equal(ROM.u32(0x27a9ec + 15 * 8) + 0x684, TYPE96_ART.death);
  assert.equal(ROM.u16(0x27aa6c), 0x3b7c, 'the next local type $98 stub bounds the table');
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => ROM.u8(0x23369a + i)),
    [0x8a, 0x00, 0x24, 0x00, 0x81, 0x04, 0x40, 0x00]);
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x96) rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [[0x2329c0, 0x00b8, 0x03c]]);
  assert.deepEqual([ROM.u16(0x232c00), ROM.u8(0x232c04), ROM.u16(0x232c06) & 0xfff],
    [0x0118, 0x8c, 0x03f]);
  assert.equal(ROM.u16(0x2789ee), 0x3b7c, 'type $8C run-length stub is exported');
});

test('W175/2 init copies exact prototypes, adjacent palette bytes and rank cadence',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa000);
  assert.equal(ram.u32(A6 + 0x0a), 0x2731b4);
  assert.equal(ram.u8(A6 + 0x1d), 0x12);
  assert.equal(ram.u8(A5 + 0x1a), 0x12);
  assert.equal(ram.u8(A5 + 0x1b), 0x0d);
  assert.equal(ram.u8(A5 + 0x17), 6, 'stage <= 1 selects six');
  assert.equal(ram.u8(A5 + 0x1d), 0x1e, '$20 minus the low byte of $8130BC');
  assert.equal(ram.u16(A5 + 0x24), 0x0212);
  assert.equal(ram.u16(A5 + 0x28), 0x0064);
  assert.equal(ram.u16(A5 + 0x2a), 0x0018);
});

test('W175/3 both draw arms resolve the live ROM index; hardcoded index zero goes red',
  { skip: SKIP }, () => {
  const normal = fixture(), nc = context(normal);
  runHandler(0x27a548, normal, ROM, A5, nc.ctx);
  assert.deepEqual(resolveEmitStub(ROM, ROM.u32(EMIT_TABLE.dispatch27829C)),
    { bucket: 0, conv: 'record' });
  assert.deepEqual(sprites(normal, 0), [normal.u32(A6 + 0x0a)]);

  const mutated = fixture(), mc = context(mutated);
  mutated.setU16(A6 + 0x1e, 5);
  runHandler(0x27a548, mutated, ROM, A5, mc.ctx);
  assert.equal(ROM.u32(EMIT_TABLE.dispatch27829C + 5 * 4), 0x23d852);
  assert.deepEqual(sprites(mutated, 7), [mutated.u32(A6 + 0x0a)]);
  assert.deepEqual(sprites(mutated, 0), [], 'hardcoding table index zero fails here');

  mutated.setU8(A6 + 1, mutated.u8(A6 + 1) | 0x80);
  runHandler(0x27a548, mutated, ROM, A5, mc.ctx);
  assert.equal(sprites(mutated, 7).length, 2, 'the death-tail draw uses the same live index');
});

test('W175/4 HP activation and odd/even fan widths follow exact carry/parity semantics',
  { skip: SKIP }, () => {
  const ram = fixture(), c = context(ram);
  ram.setU16(A5 + 0x24, 0);
  ram.setU16(A6 + 0x18, 0x1234);
  runHandler(0x27a548, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5 + 0x24), 0xffff);
  assert.equal(ram.u16(A6 + 0x18), 0x0600, 'borrow installs the live HP value');

  ram.setU16(A5 + 0x18, 2);
  ram.setU8(A5 + 0x1c, 0);
  ram.setU8(A5 + 0x1e, 5);
  runHandler(0x27a548, ram, ROM, A5, c.ctx);
  assert.equal(c.bullets.length, 6, 'odd salvo byte uses DBRA #5');
  assert.ok(c.bullets.every(([site]) => site === 0x27a6d0));
  ram.setU8(A5 + 0x1c, 0);
  ram.setU8(A5 + 0x1e, 4);
  runHandler(0x27a548, ram, ROM, A5, c.ctx);
  assert.equal(c.bullets.length, 13, 'even salvo byte adds DBRA #6');
  assert.ok(c.bullets.slice(6).every(([site]) => site === 0x27a6f4));
});

test('W175/5 death scores $256, emits nine exact effects and enters the mode-$FFFF tail',
  { skip: SKIP }, () => {
  const ram = fixture(), c = context(ram);
  ram.setU16(A5 + 0x24, 0xffff);                       // HP gate already complete
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x27a548, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.kills, [[0x256, 0x10]]);
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]), [
    [0x85, 0x27a7ac], [0x85, 0x27a7ec], [0x85, 0x27a82c],
    [0x85, 0x27a86c], [0x85, 0x27a8ac], [0x0d, 0x27a8f2],
    [0x85, 0x27a932], [0x0d, 0x27a972], [0x0d, 0x27a9b2],
  ]);
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 1);
  assert.equal(ram.u16(BULLET_DRIVER.modeWord), 0xffff);
  assert.equal(ram.u16(A5 + 0x28), 0x63, 'the first tail pass decrements 100');
  assert.equal(ram.u16(A5 + 0x2a), 0x17, 'the first tail pass decrements 24');
  assert.equal(ram.u16(A6), 0x8080);
  const last = POOL_B.base + 8 * POOL_B.stride;
  assert.equal(ram.u16(last) & 0xff, 0x0d);
  assert.equal(ram.u32(last + B.nudge), 0xf4000000);
  assert.equal(ram.u16(last + B.delay), 0x10);
  assert.equal(ram.u16(last + B.speed), 0, 'the ninth arm deliberately has no speed write');
});

test('W175/6 $243E02 differs from $243E7C only in its big-endian mode word', () => {
  const r0 = new Ram();
  assert.equal(armScreenClear(r0, {}, 0x10, 'test'), true);
  assert.equal(r0.u16(BULLET_DRIVER.modeWord), 0x0000);
  const rf = new Ram();
  assert.equal(armScreenClear243E02(rf, {}, 0x10, 'test'), true);
  assert.equal(rf.u16(BULLET_DRIVER.modeWord), 0xffff);
  rf.setU16(BULLET_DRIVER.armWord, 7);
  rf.setU16(BULLET_DRIVER.modeWord, 0x2a);
  assert.equal(armScreenClear243E02(rf, {}, 0x10, 'test'), false);
  assert.equal(rf.u16(BULLET_DRIVER.armWord), 7, 'the authentic guarded band writes nothing');
});
