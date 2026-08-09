// W185: stage-2 boss A2 draw objects and their deferred type-$4D satellite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { runHandler } from '../src/handlers.js';
import { MoveTables } from '../src/vectors.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function bossFixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 11);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x233194);
  ram.setU8(A5 + 0x0c, 0x30);
  ram.setU16(0x813172, 0x0020);
  runInitBodyAddr(0x297120, ram, ROM, A5, new UnportedLog());
  return ram;
}

test('W185/1 A2 list order and both ROM closures are exact', { skip: SKIP }, () => {
  assert.deepEqual(Array.from({ length: 11 }, (_, i) => ROM.u32(0x297432 + i * 4)),
    [0x297462, 0x2974fe, 0x297578, 0x2974b0, 0x2975e0, 0x297654,
      0x2976c6, 0x29777c, 0x2977b0, 0x297866, 0x29789a]);
  assert.equal(ROM.u32(0x29745e), 0xffffffff);
  assert.equal(Buffer.from(ROM.bytes(0x267a8c, 8)).toString('hex'),
    '0029bb1e0029bb64');
  assert.equal(Buffer.from(ROM.bytes(0x29bb4a + 26, 2)).toString('hex'), '4eb9',
    'the 28-byte prototype intentionally overlaps the handler opcode');
});

test('W185/2 all eleven A2 objects emit their selected art in list order',
  { skip: SKIP }, () => {
  const ram = bossFixture();
  runHandler(0x297398, ram, ROM, A5,
    { ram, rom: ROM, tables: MT, unportedLog: new UnportedLog() });
  const cursor64 = (off) => ((ram.u8(A6 + off) + 1) & 0x3e) << 1;
  const expected = [
    ROM.u32(0x297490 + ram.u16(A6 + 0x28)),
    ROM.u32(0x297538 + ram.u16(A6 + 0x166)),
    ROM.u32(0x2975a8 + ram.u16(A6 + 0x16a)),
    ROM.u32(0x2974da + ram.u16(A6 + 0x06)),
    ROM.u32(0x297686 + ram.u16(A6 + 0xc6)),
    ROM.u32(0x297614 + ram.u16(A6 + 0xe6)),
    ROM.u32(0x2976fc + cursor64(0x5b)),
    ROM.u32(0x2976fc + cursor64(0x7b)),
    ROM.u32(0x2977e6 + cursor64(0x9b)),
    ROM.u32(0x2977e6 + cursor64(0xbb)),
    ROM.u32(0x2978d0 + cursor64(0x11b)),
  ];
  assert.equal(ram.u16(BUCKETS[1].counter), expected.length * RECORD_BYTES);
  assert.deepEqual(expected.map((_, i) => ram.u32(BUCKETS[1].buffer + i * 12 + 4)),
    expected);
});

test('W185/3 type $4D loads the overlapping prototype and draws frame zero',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const rec = 0x81332c, sub = 0x81459c;
  ram.setU32(rec + 0x06, sub);
  ram.setU32(rec + 0x16, 0x40001000);
  runInitBodyAddr(0x29bb26, ram, ROM, rec, new UnportedLog());
  assert.equal(ram.u32(sub + 0x02), 0x40001000);
  assert.equal(ram.u32(rec + 0x16), 0x00001000,
    'clr.b record+$16 clears only the copied source long high byte');
  assert.equal(ram.u16(sub + 0x1e), 0x4eb9);
  runHandler(0x29bb64, ram, ROM, rec,
    { ram, rom: ROM, tables: MT, unportedLog: new UnportedLog() });
  assert.equal(ram.u8(rec + 0x16), 1);
  assert.equal(ram.u16(rec + 0x20), 0);
  assert.equal(ram.u16(BUCKETS[0].counter), RECORD_BYTES);
  assert.equal(ram.u32(BUCKETS[0].buffer + 4), ROM.u32(0x29bbd4));
});
