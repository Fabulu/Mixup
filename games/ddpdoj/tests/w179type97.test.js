// W179: stage-2 type $97, exact animated/aimed/firing carrier closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE97_ART } from '../src/handlers.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture(movement = 0x233dee) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, movement);
  ram.setU8(A5 + 0x0c, 0x97);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x6000);
  runInitBodyAddr(0x277de8, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const sounds = [], kills = [], effects = [], bullets = [];
  const unported = new UnportedLog();
  return { sounds, kills, effects, bullets, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (addr) => sounds.push(addr),
    killEvent: (score, hit) => kills.push([score, hit]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
    bulletSpawn: (site, result) => bullets.push([site, result]),
  } };
}

function sprites(ram, bucket) {
  const b = BUCKETS[bucket], out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12)
    out.push(ram.u32(b.buffer + off + 4));
  return out;
}

test('W179/1 ROM pins five records, three movements, full closure and type $94 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x277de8));
  assert.ok(HANDLER_ADDRESSES.includes(0x277f26));
  assert.deepEqual(TYPE97_ART,
    { animationTable: 0x278278, frames: 4, headingTable: 0x272c7a, headings: 32 });
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u32(0x278278 + i * 4)),
    [0x17e608, 0x17e78c, 0x17e910, 0x17ea94]);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => ROM.u32(0x278288 + i * 4)),
    [0x04000400, 0x0400fc00, 0, 0xfc00fc00, 0xfc000400]);
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x97)
      rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [
    [0x232da8, 0x0162, 0x065], [0x232de8, 0x0173, 0x06a],
    [0x232e48, 0x0180, 0x06a], [0x232e88, 0x0188, 0x055],
    [0x232f00, 0x01a0, 0x055],
  ]);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => ROM.u8(0x23367e + i)),
    [0x78, 0x00, 0x08, 0x00, 0x81, 0x03, 0x40, 0x00]);
  assert.deepEqual([ROM.u16(0x232dc0), ROM.u8(0x232dc4), ROM.u16(0x232dc6) & 0xfff],
    [0x016b, 0x94, 0x039]);
  assert.equal(ROM.u32(0x278344), 0x0022c608,
    'the last structurally enclosed shared-overlay pointer is present');
});

test('W179/2 init preserves all three movement-script variant arms',
  { skip: SKIP }, () => {
  const flag5 = fixture(0x233dee);
  assert.equal(flag5.u32(A5 + 0x44), 0x277efa);
  assert.equal(flag5.u32(A6 + 0x0a), 0x17e608);
  assert.equal(flag5.u8(A6 + 0x1d), 0x0a);
  assert.equal(flag5.u8(A5 + 0x1c), 0x0a);
  assert.equal(flag5.u8(A5 + 0x1d), 0x15);
  assert.equal(flag5.u8(A6 + 0x1c) & 0x40, 0x40);
  assert.equal(flag5.u8(A6 + 0x1e), 0);
  assert.equal(flag5.u16(A5 + 0x30), 0, 'idx $065 keeps prototype flag 5 set');

  const plain = fixture(0x233e8a);
  assert.equal(plain.u16(A5 + 0x30), 1);
  assert.equal(plain.u8(A5 + 0x33), 0);
  assert.equal(plain.u16(A6 + 0x16), 0xf800);

  const mirrored = fixture(0x233c8e);
  assert.equal(mirrored.u16(A5 + 0x30), 1);
  assert.equal(mirrored.u8(A5 + 0x33), 1);
  assert.equal(mirrored.u16(A6 + 0x14), 0xf800);
  assert.equal(mirrored.u8(A6 + 0x1e), 0, 'high selector is consumed after folding');
});

test('W179/3 word freeze animates while long freeze suppresses retarget and fire',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU16(A6 + 0x02, 0x2000);
  ram.setU16(A6 + 0x04, 0x4000);
  ram.setU8(A6 + 0x1b, 0x10);
  ram.setU8(A5 + 0x34, 0);
  ram.setU8(A6 + 0x35, 5);
  ram.setU16(A5 + 0x36, 0);
  ram.setU8(A5 + 0x22, 0);
  ram.setU8(A5 + 0x1e, 0);
  const oldHeadingArt = ram.u32(A5 + 0x24);
  ram.setU16(0x8130d2, 0);
  ram.setU16(0x8130d4, 1);
  runHandler(0x277f26, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5 + 0x36), 4);
  assert.equal(ram.u32(A6 + 0x0a), 0x17e78c);
  assert.equal(ram.u32(A5 + 0x24), oldHeadingArt);
  assert.equal(c.bullets.length, 0);
  const recBucket = resolveEmitStub(ROM, ROM.u32(0x27829c)).bucket;
  const regBucket = resolveEmitStub(ROM, ROM.u32(0x2782e4)).bucket;
  assert.equal(recBucket, regBucket);
  assert.deepEqual(sprites(ram, recBucket), [0x17e78c, oldHeadingArt]);
});

test('W179/4 retarget and paired $281420 fire use the live heading/vector tables',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU16(A6 + 0x02, 0x2000);
  ram.setU16(A6 + 0x04, 0x4000);
  ram.setU8(A5 + 0x22, 0);
  ram.setU8(A5 + 0x23, 3);
  ram.setU8(A5 + 0x1e, 0);
  ram.setU8(A5 + 0x20, 1);
  runHandler(0x277f26, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.map(([site]) => site), [0x278140, 0x278148]);
  const heading = ram.u16(A5 + 0x28);
  assert.equal(ram.u32(A5 + 0x24),
    ROM.u32(TYPE97_ART.headingTable + ((heading & 0x3e) << 1)));
});

test('W179/5 lethal damage scores $88, creates exact effects and frees immediately',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU16(A6 + 0x02, 0x2000);
  ram.setU16(A6 + 0x04, 0x4000);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x277f26, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.sounds, [0x28c28e]);
  assert.deepEqual(c.kills, [[0x88, 0x10]]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]),
    [[0x0d, 0x2781d6], [0x08, 0x278224]]);
  const effect = (n, off, kind = 'u16') => ram[kind](POOL_B.base + n * POOL_B.stride + off);
  assert.deepEqual([effect(0, B.bucket), effect(1, B.bucket)], [8, 8]);
  assert.deepEqual([effect(0, B.sub14), effect(1, B.sub14)], [0x0400, 0]);
  assert.deepEqual([effect(0, B.nudge, 'u32'), effect(1, B.nudge, 'u32')],
    [0xfc000000, 0xf6000000]);
  const notes = c.unported.report().join('\n');
  assert.match(notes, /\$289B22/);
  assert.match(notes, /\$27F8FA x5 type \$97 death/);
});
