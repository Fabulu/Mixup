// W177: stage-2 type $91, exact init/handler/death closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE91_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';

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
  ram.setU8(A5 + 0x0c, 0x91);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  runInitBodyAddr(0x279aa2, ram, ROM, A5, new UnportedLog(), MT);
  ram.setU32(A6 + 0x02, 0x20004000);
  return ram;
}

function context(ram) {
  const sounds = [], kills = [], effects = [];
  const unported = new UnportedLog();
  return { sounds, kills, effects, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (addr) => sounds.push(addr),
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

test('W177/1 ROM pins the sole type $91 record, movement, closure and type $92 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x279aa2));
  assert.ok(HANDLER_ADDRESSES.includes(0x279b2e));
  assert.deepEqual(TYPE91_ART, { main: 0x235470 });
  assert.equal(ROM.u32(0x279af2), TYPE91_ART.main);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => [
    ROM.u8(0x279ade + i * 2), ROM.u8(0x279adf + i * 2),
  ]), [[0x10, 0x0f], [0x11, 0x0e], [0x10, 0x0f], [0x10, 0x0f], [0x10, 0x0f]]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => ROM.u8(0x233634 + i)),
    [0xc0, 0x03, 0x2d, 0x10, 0xc0, 0x02]);
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x91) rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [[0x232ce8, 0x013f, 0x02b]]);
  assert.deepEqual([ROM.u16(0x232d58), ROM.u8(0x232d5c), ROM.u16(0x232d5e) & 0xfff],
    [0x0155, 0x92, 0x038]);
});

test('W177/2 init copies the exact prototype and adjacent stage palette bytes',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa000);
  assert.equal(ram.u32(A6 + 0x0a), TYPE91_ART.main);
  assert.equal(ram.u16(A6 + 0x18), 0x0e00);
  assert.equal(ram.u8(A6 + 0x1d), 0x11);
  assert.equal(ram.u16(A6 + 0x1e), 0);
  assert.equal(ram.u8(A5 + 0x17), 0x0c);
  assert.equal(ram.u8(A5 + 0x18), 0x11);
  assert.equal(ram.u8(A5 + 0x19), 0x0e);
});

test('W177/3 live and damage paths select palettes and emit through $27829C',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A6 + 0x18, 0x037f);
  runHandler(0x279b2e, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A6 + 0x1d), 0x19, 'low HP and clear $8130CA select palette $19');
  assert.deepEqual(sprites(ram, 0), [TYPE91_ART.main]);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  runHandler(0x279b2e, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A6) & 0x5c, 0, 'damage flags are acknowledged with AND #$A3');
  assert.equal(ram.u8(A6 + 0x1d), 0x1f, 'base $11 XOR flash $0E');
});

test('W177/4 lethal damage scores $13, posts sound and creates three exact kind-5 effects',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279b2e, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.deepEqual(c.kills, [[0x13, 0x10]]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]),
    [[0x05, 0x279bd2], [0x05, 0x279c16], [0x05, 0x279c60]]);
  assert.equal(ram.u16(A6), 0x8080);
  assert.equal(ram.u8(A6 + 0x1d), 0x11);
  const effect = (n, off, kind = 'u16') => ram[kind](POOL_B.base + n * POOL_B.stride + off);
  assert.deepEqual(Array.from({ length: 3 }, (_, n) => effect(n, B.sub12)), [1, 2, 1]);
  assert.deepEqual(Array.from({ length: 3 }, (_, n) => effect(n, B.sub14)), [0, 0x400, 0]);
  assert.deepEqual(Array.from({ length: 3 }, (_, n) => effect(n, B.nudge, 'u32')),
    [0x0a000080, 0xfc00ff80, 0xee000080]);
  assert.deepEqual(Array.from({ length: 3 }, (_, n) => effect(n, B.delay)), [6, 3, 0]);
  assert.equal(effect(1, B.f1c, 'u8'), 0x40);
});

test('W177/5 death tail draws through byte zero, then requests seven ROM vectors and frees',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A6, 0x8080);
  ram.setU8(A5 + 0x17, 1);
  runHandler(0x279b2e, ram, ROM, A5, c.ctx);
  assert.notEqual(ram.u16(A5), 0, 'original linger 1 has no borrow and still draws');
  runHandler(0x279b2e, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'original linger 0 underflows and frees');
  const notes = c.unported.report().filter((x) => x.includes('$27F8FA'));
  assert.equal(notes.length, 1);
  for (const vector of [0x0c000100, 0x0800ff00, 0x04000100, 0x0000ff00,
    0xfc000100, 0xf800ff00, 0xf4000100]) {
    assert.match(notes[0], new RegExp(`\\$${vector.toString(16).toUpperCase()}`));
  }
});
