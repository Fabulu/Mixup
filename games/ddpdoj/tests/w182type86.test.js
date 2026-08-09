// W182: stage-2 type $86, its shared type-$85 data/cue closure and exact
// type-specific initializer/death-drop branch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { CUE } from '../src/cues.js';

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
  ram.setU16(A5 + 0x04, 1);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x2331b4);
  ram.setU8(A5 + 0x0c, 0x86);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x5000);
  ram.setU16(0x8103ea, 0x3000);
  runInitBodyAddr(0x275bb6, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const sounds = [], kills = [], items = [], effects = [];
  const unported = new UnportedLog();
  return { sounds, kills, items, effects, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (addr) => sounds.push(addr),
    killEvent: (score, hit) => kills.push([score, hit]),
    itemSpawn: (kind, site, slot) => items.push([kind, site, slot]),
    effectSpawn: (kind, site, slot) => effects.push([kind, site, slot]),
  } };
}

test('W182/1 ROM pins the sole record, movement, shared data and type $30 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x275bb6));
  assert.ok(HANDLER_ADDRESSES.includes(0x275914));
  assert.deepEqual([ROM.u16(0x233018), ROM.u8(0x23301c), ROM.u16(0x23301e) & 0xfff],
    [0x01d5, 0x86, 0x002]);
  assert.equal(Buffer.from(ROM.bytes(0x2331b4, 34)).toString('hex'),
    '800006008901c00c2020c00a2010c0082010c0062010c0042040c0052000c0062000');
  assert.equal(Buffer.from(ROM.bytes(0x275bae, 0x84)).toString('hex'),
    '3b7c000100044e7541fafcf84eb9002637a22b48004441fafcd4700a4eb90026377a'
    + '4eb90026380845f900272dfa4cae000300020640f9004eb90024200a6404122e001b'
    + '1b4100290241003ed2412b72100000243039008130b6912d001e30390081309441fa'
    + '00144e71d0c01d50001d1b58001c1b58001d4e75120d0e110e110d120d12');
  assert.equal(Buffer.from(ROM.bytes(0x2758e8, 44)).toString('hex'),
    '04e60800fc00001400000028af8a0380fa000200001400000028af8a'
    + '0219fe00fe00000800000028af84ffff');
  assert.deepEqual([ROM.u16(0x233020), ROM.u8(0x233024), ROM.u16(0x233026) & 0xfff],
    [0x01dc, 0x30, 0x000]);
  assert.equal(Buffer.from(ROM.bytes(0x297118, 8)).toString('hex'),
    '3b7c000b00044e75');
});

test('W182/2 init copies both prototypes, stores the true cue end and aims art',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa001);
  assert.equal(ram.u16(A6 + 0x20), 0xa001);
  assert.equal(ram.u32(A6 + 0x0a), 0x1928bc);
  assert.equal(ram.u32(A5 + 0x44), 0x2758e8,
    'the loader returns after both 28-byte prototypes, not inside prototype two');
  assert.deepEqual([ram.u8(A6 + 0x1d), ram.u8(A5 + 0x1c), ram.u8(A5 + 0x1d)],
    [0x0e, 0x0e, 0x11]);
  const heading = ram.u8(A5 + 0x29);
  assert.equal(ram.u32(A5 + 0x24), ROM.u32(0x272dfa + ((heading & 0x3e) << 1)));
});

test('W182/3 the shared word-threshold engine creates and advances the first cue',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU8(A5 + 0x16, 1);
  ram.setU16(A6 + 0x18, 0x04e6);
  ram.setU32(0x8130d2, 1);
  runHandler(0x275914, ram, ROM, A5, c.ctx);
  assert.equal(ram.u32(A5 + 0x44), 0x2758f6);
  assert.equal(ram.u16(CUE.count), 1);
  assert.equal(ram.u32(CUE.base + 0x10), A6);
  assert.equal(ram.u32(CUE.base + 0x14), 0x0800fc00);
  assert.equal(ram.u32(CUE.base + 0x18), 0x00140000);
});

test('W182/4 lethal type $86 damage takes the exact guaranteed kind-$08 drop arm',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A5 + 0x12, 0);
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x275914, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.kills, [[0x25, 0x10]]);
  assert.deepEqual(c.items.map(([kind, site]) => [kind, site]), [[8, 0x275b06]]);
  assert.deepEqual(c.effects.map(([kind, site]) => [kind, site]),
    [[5, 0x275b22], [0x0c, 0x275b4e], [0x84, 0x275b76]]);
  assert.deepEqual(c.sounds, [0x28c274]);
});
