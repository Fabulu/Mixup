// W180: stage-2 type $94, exact mirrored extending aimed-shooter closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE94_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { AIM } from '../src/aim.js';
import { B, POOL_B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture(movement = 0x23367e) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, movement);
  ram.setU8(A5 + 0x0c, 0x94);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  runInitBodyAddr(0x27a0e8, ram, ROM, A5, new UnportedLog(), MT);
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

test('W180/1 ROM pins six records, movements, art table and type $93 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27a0e8));
  assert.ok(HANDLER_ADDRESSES.includes(0x27a1b4));
  assert.deepEqual(TYPE94_ART, { table: 0x27a3cc, frames: 16 });
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x94)
      rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [
    [0x232dc0, 0x016b, 0x039], [0x232e00, 0x0176, 0x053],
    [0x232e50, 0x0181, 0x071], [0x232ec0, 0x018d, 0x03b],
    [0x232ef8, 0x0198, 0x072], [0x232f10, 0x01a3, 0x077],
  ]);
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => [
    ROM.u32(TYPE94_ART.table + i * 8), ROM.u16(TYPE94_ART.table + i * 8 + 4),
  ]), Array.from({ length: 16 }, (_, i) => [0x236430 + i * 0x104, 0x600 + i * 0x40]));
  const streams = [
    [0x23367e, '7800080081034000'], [0x233c7e, '7880080081034000'],
    [0x233f08, '78c0080081034000'], [0x233690, '78404000880181034000'],
    [0x233f10, '78c04000880181034000'], [0x233f66, '79004000880181034000'],
  ];
  for (const [at, hex] of streams)
    assert.equal(Buffer.from(ROM.bytes(at, hex.length / 2)).toString('hex'), hex);
  assert.deepEqual([ROM.u16(0x232ef0), ROM.u8(0x232ef4), ROM.u16(0x232ef6) & 0xfff],
    [0x0197, 0x93, 0x03d]);
  assert.equal(ROM.u32(0x279ebe), 0x00044e75);
});

test('W180/2 init selects normal or mirrored collision word and keeps selector 3',
  { skip: SKIP }, () => {
  const plain = fixture();
  assert.equal(plain.u32(A6 + 0x0a), 0x236430);
  assert.equal(plain.u32(A5 + 0x24), A6 + 0x16);
  assert.equal(plain.u16(A6 + 0x16), 0x0600);
  assert.equal(plain.u8(A6 + 0x1c) & 0x40, 0);
  assert.equal(plain.u16(A6 + 0x1e), 3);
  assert.equal(plain.u8(A5 + 0x17), 6);
  assert.deepEqual([plain.u8(A6 + 0x1d), plain.u8(A5 + 0x1a), plain.u8(A5 + 0x1b)],
    [0x13, 0x13, 0x0c]);

  const mirrored = fixture(0x233690);
  assert.equal(mirrored.u32(A5 + 0x24), A6 + 0x14);
  assert.equal(mirrored.u16(A6 + 0x14), 0x0600);
  assert.equal(mirrored.u8(A6 + 0x1c) & 0x40, 0x40);
  assert.equal(mirrored.u16(A6 + 0x1e), 3,
    'escape $88 consumes only the selector high byte');
  assert.equal(mirrored.u16(A5 + 0x28), 0);
});

test('W180/3 opening animation updates all live art, collision and draw fields',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU16(A5 + 0x18, 1);
  ram.setU8(A5 + 0x22, 0);
  runHandler(0x27a1b4, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5 + 0x20), 8);
  assert.equal(ram.u32(A6 + 0x0a), 0x236534);
  assert.equal(ram.u16(A6 + 0x16), 0x0640);
  assert.deepEqual(sprites(ram, 2), [0x236534],
    'selector 3 dispatches through $2782A8 to bucket 2');
});

test('W180/4 distance carry preserves salvo but dead targets consume it',
  { skip: SKIP }, () => {
  const near = fixture();
  const cn = context(near);
  near.setU32(A5 + 0x12, 0);
  near.setU16(A5 + 0x18, 2);
  near.setU8(A5 + 0x1c, 0);
  near.setU8(A5 + 0x1e, 2);
  near.setU16(AIM.selP1, 0x8000);
  near.setU16(AIM.selP1 + 2, near.u16(A6 + 0x02));
  near.setU16(AIM.selP1 + 4, near.u16(A6 + 0x04));
  runHandler(0x27a1b4, near, ROM, A5, cn.ctx);
  assert.equal(near.u8(A5 + 0x1e), 2);
  assert.equal(cn.bullets.length, 0);

  const dead = fixture();
  const cd = context(dead);
  dead.setU32(A5 + 0x12, 0);
  dead.setU16(A5 + 0x18, 2);
  dead.setU8(A5 + 0x1c, 0);
  dead.setU8(A5 + 0x1e, 0);
  dead.setU16(AIM.selP1, 0);
  dead.setU16(AIM.selP2, 0);
  runHandler(0x27a1b4, dead, ROM, A5, cd.ctx);
  assert.equal(dead.u16(A5 + 0x18), 3);
  assert.equal(dead.u8(A5 + 0x1e), dead.u8(A5 + 0x1f));
  assert.equal(dead.u8(A5 + 0x1c), 0x10);
  assert.equal(cd.bullets.length, 0);
});

test('W180/5 lethal damage scores $34, arms exact kind-$0C effect and frees',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x27a1b4, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.sounds, [0x28c2c2]);
  assert.deepEqual(c.kills, [[0x34, 0x10]]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]), [[0x0c, 0x27a388]]);
  const effect = (off, kind = 'u16') => ram[kind](POOL_B.base + off);
  assert.equal(effect(B.bucket), 8);
  assert.equal(effect(B.sub12), 1);
  assert.equal(effect(B.sub14), 0);
  assert.equal(effect(B.nudge, 'u32'), 0xfd000000);
  assert.equal(effect(B.hook), 1);
  assert.match(c.unported.report().join('\n'), /\$27F8EE type \$94 death D0=\$8/);
});
