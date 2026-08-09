// W176: stage-2 type $8C plus its shared palette-animation dependency.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE8C_ART } from '../src/handlers.js';
import { CUE, spawnCues28AC86 } from '../src/cues.js';
import { ANIM_OBJECT, runAnimObjects24683E } from '../src/animobjects.js';
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
  ram.setU16(A5 + 0x04, 2);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A5 + 0x0c, 0x8c);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x5000);
  const sounds = [];
  runInitBodyAddr(0x2789f6, ram, ROM, A5, new UnportedLog(), MT, null,
    (addr) => sounds.push(addr));
  ram.setU32(A6 + 0x02, 0x40002000);
  return { ram, sounds };
}

function context(ram, sounds = []) {
  const bullets = [], kills = [], effects = [];
  const unported = new UnportedLog();
  return { bullets, kills, effects, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (a) => sounds.push(a),
    bulletSpawn: (site, result) => bullets.push([site, result]),
    killEvent: (score, hit) => kills.push([score, hit]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
  } };
}

test('W176/1 ROM pins the sole record, exact closure and type $91 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2789f6));
  assert.ok(HANDLER_ADDRESSES.includes(0x278c0e));
  assert.deepEqual(TYPE8C_ART, {
    animationTable: 0x27959e, frames: 8,
    attachmentTable: 0x2795be, attachments: 24,
    poseTable: 0x27961e, poses: 24,
    spawnPalette: 0x278bb4, deathPalette: 0x27972e,
  });
  assert.deepEqual([ROM.u16(0x232c00), ROM.u8(0x232c04), ROM.u16(0x232c06) & 0xfff],
    [0x0118, 0x8c, 0x03f]);
  assert.deepEqual([ROM.u16(0x232ce8), ROM.u8(0x232cec), ROM.u16(0x232cee) & 0xfff],
    [0x013f, 0x91, 0x02b]);
  assert.equal(ROM.u16(0x278bb4), 3);
  assert.equal(ROM.u16(0x27972e), 15);
  assert.equal(0x27972e + 2 + 15 * 14, 0x279802);
});

test('W176/2 init copies three prototypes, starts sound and installs three palette nodes',
  { skip: SKIP }, () => {
  const { ram, sounds } = fixture();
  assert.equal(ram.u32(A5 + 0x44), 0x278b72);
  assert.equal(ram.u16(A6), 0xa001);
  assert.equal(ram.u16(A6 + 0x20) & 0x8000, 0x8000);
  assert.equal(ram.u16(A6 + 0x40), 0x8000);
  assert.deepEqual(sounds, [0x28c7a8]);
  assert.equal(ram.u16(0x8130d8), 1);
  assert.equal(ram.u16(0x81b414), 1);
  assert.equal(ram.u16(ANIM_OBJECT.roots), 0x8000);
  let node = ram.u32(ANIM_OBJECT.roots + 0x2c), count = 0;
  while (node !== 0) { count++; node = ram.u32(node + 0x2c); }
  assert.equal(count, 3);
});

test('W176/3 long thresholds advance one 16-byte record and call #3 fades staging RAM',
  { skip: SKIP }, () => {
  const { ram } = fixture();
  ram.setU32(A5 + 0x44, 0x278b72);
  spawnCues28AC86(ram, ROM, A5, 0x7000);
  assert.equal(ram.u32(A5 + 0x44), 0x278b82);
  assert.equal(ram.u16(CUE.count), 1);

  const current = 0x80e886 + 0x0540;
  assert.equal(ram.u16(current), 0);
  runAnimObjects24683E(ram, ROM);
  runAnimObjects24683E(ram, ROM);
  runAnimObjects24683E(ram, ROM);
  assert.notEqual(ram.u16(current), 0);
  assert.equal(ram.u16(0x80fa66), 1);
});

test('W176/4 live handler merges both hit parts and emits the six-piece carrier',
  { skip: SKIP }, () => {
  const { ram, sounds } = fixture();
  const c = context(ram, sounds);
  ram.setU16(A6, ram.u16(A6) | 0x0200);
  ram.setU16(A6 + 0x20, ram.u16(A6 + 0x20) | 0x0100);
  runHandler(0x278c0e, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A6 + 0x20) & 0x0300, 0x0300);
  const requests = BUCKETS.reduce((n, b) => n + ram.u16(b.counter) / 12, 0);
  assert.equal(requests, 5, 'rank-zero mirror global is off, so five of six pieces emit');
  assert.equal(ram.u8(A5 + 0x16), 1);
});

test('W176/5 lethal shared-part damage stops sound, scores $457 and emits twelve effects',
  { skip: SKIP }, () => {
  const { ram, sounds } = fixture();
  const c = context(ram, sounds);
  ram.setU8(A6 + 0x20, ram.u8(A6 + 0x20) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  ram.setU16(A6 + 0x38, 0x8001);
  runHandler(0x278c0e, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.kills, [[0x457, 0x10]]);
  assert.deepEqual(sounds, [0x28c7a8, 0x28c7c2, 0x28c310]);
  assert.equal(c.effects.length, 12);
  assert.deepEqual(c.effects.map(([kind]) => kind),
    [0x0d, 0x84, 0x84, 0x0d, 0x85, 0x85, 0x0d, 0x0d, 0x0d, 0x85, 0x85, 0x85]);
  assert.equal(ram.u16(A6), 0x8080);
  assert.equal(ram.u16(A6 + 0x20), 0x8080);
  assert.equal(ram.u16(POOL_B.base + 11 * POOL_B.stride + B.speed), 0x0588);
});
