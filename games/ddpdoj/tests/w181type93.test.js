// W181: stage-2 type $93, exact heavy damage-threshold closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE93_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B, POOL_B } from '../src/effects.js';
// W374 wired `$279F3C jsr $27F8F0` to `allocPoolA27F8F0`, so the impact is now observable as a
// pool-A slot rather than as an unported note.
import { POOL_A, B as BEE, LAYER_EMITTERS } from '../src/bee.js';

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
  ram.setU32(A5 + 0x12, 0x2336a2);
  ram.setU8(A5 + 0x0c, 0x93);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  runInitBodyAddr(0x279ec2, ram, ROM, A5, new UnportedLog(), MT);
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

test('W181/1 ROM pins the sole record, movement, full closure and following type $86 row',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x279ec2));
  assert.ok(HANDLER_ADDRESSES.includes(0x279f4a));
  assert.deepEqual(TYPE93_ART, { main: 0x237470 });
  assert.deepEqual([ROM.u16(0x232ef0), ROM.u8(0x232ef4), ROM.u16(0x232ef6) & 0xfff],
    [0x0197, 0x93, 0x03d]);
  assert.equal(Buffer.from(ROM.bytes(0x2336a2, 6)).toString('hex'), '840009004000');
  assert.equal(ROM.u32(0x279f12), TYPE93_ART.main);
  assert.equal(Buffer.from(ROM.bytes(0x27a0c8, 24)).toString('hex'),
    '000c00040a0001800500fd8000000180fb00fd80f6000180');
  assert.deepEqual([ROM.u16(0x233018), ROM.u8(0x23301c), ROM.u16(0x23301e) & 0xfff],
    [0x01d5, 0x86, 0x002]);
});

test('W181/2 init loads the immediate body, palette pair and linger counter',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa000);
  assert.equal(ram.u32(A6 + 0x0a), TYPE93_ART.main);
  assert.equal(ram.u16(A6 + 0x18), 0x0e00);
  assert.equal(ram.u16(A6 + 0x1e), 0);
  assert.equal(ram.u8(A5 + 0x17), 0x12);
  assert.deepEqual([ram.u8(A6 + 0x1d), ram.u8(A5 + 0x18), ram.u8(A5 + 0x19)],
    [0x14, 0x14, 0x0b]);
});

test('W181/3 live threshold palette and selector zero emit the exact body',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU16(A6 + 0x18, 0x037f);
  runHandler(0x279f4a, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A6 + 0x1d), 0x19);
  assert.deepEqual(sprites(ram, 0), [TYPE93_ART.main]);
});

test('W181/4 lethal damage arms exact three effects, lingers, impacts and frees',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279f4a, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0x8000, 'death enters the authentic linger state');
  assert.equal(ram.u16(A6), 0x8080);
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.deepEqual(c.kills, [[0x15, 0x10]]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]),
    [[0x85, 0x279ff2], [0x0d, 0x27a03c], [0x85, 0x27a082]]);

  const effect = (n, off, kind = 'u16') => ram[kind](POOL_B.base + n * POOL_B.stride + off);
  assert.deepEqual([0, 1, 2].map((n) => effect(n, B.bucket)), [0, 0, 0]);
  assert.deepEqual([0, 1, 2].map((n) => effect(n, B.sub12)), [1, 2, 1]);
  assert.deepEqual([0, 1, 2].map((n) => effect(n, B.sub14)), [0, 0x0400, 0]);
  assert.deepEqual([0, 1, 2].map((n) => effect(n, B.nudge, 'u32')),
    [0x0c00fe80, 0xfa00ff00, 0xee000000]);
  assert.deepEqual([0, 1, 2].map((n) => effect(n, B.delay)), [2, 1, 0]);
  assert.equal(effect(0, B.f1c, 'u8'), 0x40);

  const live = ram.u16(POOL_A.liveCount);
  for (let i = 0; i < 19; i++) runHandler(0x279f4a, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  // W374: the tail CALLS `$27F8F0` now. `$279F30 moveq #$C,D0`, `$279F32 move.l #$FAC0FA40,D1`
  // as a FULL long through `$280B56 add.l ($2,A6),D1`, and `$279F38 move.b ($1F,A6),D2` = 0.
  // `freeEnemy` clears A5 and never touches A6, so ($2,A6) still holds the position the fill
  // read, which is what makes this an exact expectation rather than a transcribed constant.
  assert.equal(ram.u16(POOL_A.liveCount), live + 1, 'the impact was allocated');
  assert.equal(ram.u16(POOL_A.base + BEE.status), 0x800c, 'D0 = $C');
  assert.equal(ram.u32(POOL_A.base + BEE.pos), (ram.u32(A6 + 0x02) + 0xfac0fa40) >>> 0,
    'carrier position plus the WHOLE long, high word and low-to-high carry included');
  assert.equal(ram.u32(POOL_A.base + BEE.layerEmitter), LAYER_EMITTERS[0], 'D2 = 0');
  assert.deepEqual(c.unported.report().filter((x) => x.includes('$27F8F0')), [],
    'and the deferral is gone');
});
