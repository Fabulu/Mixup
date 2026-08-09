// W178: stage-2 type $92, exact mirrored init/handler/death closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE92_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture(movement = 0) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, movement);
  ram.setU8(A5 + 0x0c, 0x92);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  runInitBodyAddr(0x279cd0, ram, ROM, A5, new UnportedLog(), MT);
  if (movement === 0) ram.setU32(A6 + 0x02, 0x20004000);
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

test('W178/1 ROM pins both type $92 records, movements, closure and type $97 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x279cd0));
  assert.ok(HANDLER_ADDRESSES.includes(0x279d72));
  assert.deepEqual(TYPE92_ART, { main: 0x23624c });
  assert.equal(ROM.u32(0x279d30), TYPE92_ART.main);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => [
    ROM.u8(0x279d1c + i * 2), ROM.u8(0x279d1d + i * 2),
  ]), [[0x10, 0x0f], [0x12, 0x0d], [0x10, 0x0f], [0x10, 0x0f], [0x10, 0x0f]]);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => ROM.u8(0x233676 + i)),
    [0x84, 0x00, 0x06, 0x00, 0x81, 0x03, 0x40, 0x00]);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => ROM.u8(0x233686 + i)),
    [0x84, 0x40, 0x42, 0x00, 0x88, 0x01, 0x81, 0x03, 0x40, 0x00]);
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x92) rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [[0x232d58, 0x0155, 0x038], [0x232e10, 0x0177, 0x03a]]);
  assert.deepEqual([ROM.u16(0x232da8), ROM.u8(0x232dac), ROM.u16(0x232dae) & 0xfff],
    [0x0162, 0x97, 0x065]);
  assert.equal(ROM.u16(0x277de2), 0, 'the next type $97 run-length stub is exported');
});

test('W178/2 init folds escape $88 into mirror bit 6 and preserves low selector 3',
  { skip: SKIP }, () => {
  const plain = fixture(0x233676);
  assert.equal(plain.u16(A6), 0xa000);
  assert.equal(plain.u32(A6 + 0x0a), TYPE92_ART.main);
  assert.equal(plain.u16(A6 + 0x18), 0x0e00);
  assert.equal(plain.u8(A5 + 0x17), 0x12);
  assert.equal(plain.u8(A5 + 0x18), 0x12);
  assert.equal(plain.u8(A5 + 0x19), 0x0d);
  assert.equal(plain.u8(A6 + 0x1e), 0);
  assert.equal(plain.u8(A6 + 0x1c) & 0x40, 0);
  assert.equal(plain.u8(A6 + 0x1f), 3);
  assert.equal(plain.u16(A6 + 0x1e), 3, 'low selector byte survives the high-byte clear');

  const mirrored = fixture(0x233686);
  assert.equal(mirrored.u8(A6 + 0x1e), 0, 'escape $88 selector is consumed');
  assert.equal(mirrored.u8(A6 + 0x1c) & 0x40, 0x40, 'selector becomes mirror attribute');
  assert.equal(mirrored.u8(A6 + 0x1f), 3);
  assert.equal(mirrored.u16(A6 + 0x1e), 3);
});

test('W178/3 live and damage paths select palettes and emit through $27829C',
  { skip: SKIP }, () => {
  const ram = fixture(0x233676);
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x20004000);
  ram.setU16(A6 + 0x18, 0x037f);
  runHandler(0x279d72, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A6 + 0x1d), 0x19);
  assert.deepEqual(sprites(ram, 2), [TYPE92_ART.main],
    'selector 3 resolves through $2782A8 to $23D7DA, bucket 2');
  ram.setU8(A6, ram.u8(A6) | 0x10);
  runHandler(0x279d72, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A6) & 0x5c, 0);
  assert.equal(ram.u8(A6 + 0x1d), 0x1f, 'base $12 XOR flash $0D');
});

test('W178/4 lethal damage scores $14 and creates exact 0D/05 pool-B effects',
  { skip: SKIP }, () => {
  const ram = fixture(0x233676);
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x20004000);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279d72, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.deepEqual(c.kills, [[0x14, 0x10]]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]),
    [[0x0d, 0x279e16], [0x05, 0x279e5a]]);
  assert.equal(ram.u16(A6), 0x8080);
  assert.equal(ram.u8(A6 + 0x1d), 0x12);
  const effect = (n, off, kind = 'u16') => ram[kind](POOL_B.base + n * POOL_B.stride + off);
  assert.deepEqual([effect(0, B.sub12), effect(1, B.sub12)], [1, 1]);
  assert.deepEqual([effect(0, B.sub14), effect(1, B.sub14)], [0x400, 0]);
  assert.deepEqual([effect(0, B.nudge, 'u32'), effect(1, B.nudge, 'u32')],
    [0x00000000, 0xf2000080]);
  assert.deepEqual([effect(0, B.delay), effect(1, B.delay)], [3, 0]);
  assert.deepEqual([effect(0, B.bucket), effect(1, B.bucket)], [8, 8],
    'selector 3 remaps through $278326 for both death effects');
});

test('W178/5 death tail mirrors only D1 low word, preserves D2 and frees on borrow',
  { skip: SKIP }, () => {
  for (const [mirror, want] of [[0, '$FF00FE00'], [0x40, '$FF000200']]) {
    const ram = fixture();
    const c = context(ram);
    ram.setU16(A6, 0x8080);
    ram.setU8(A6 + 0x1c, mirror);
    ram.setU8(A6 + 0x1f, 3);
    ram.setU8(A5 + 0x17, 0);
    runHandler(0x279d72, ram, ROM, A5, c.ctx);
    assert.equal(ram.u16(A5), 0);
    const notes = c.unported.report().filter((x) => x.includes('$27F8F0'));
    assert.equal(notes.length, 1);
    assert.match(notes[0], new RegExp(`D1=\\${want}`));
    assert.match(notes[0], /D2=\$3/);
  }
});
