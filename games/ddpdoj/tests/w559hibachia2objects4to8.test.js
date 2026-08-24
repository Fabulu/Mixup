// W559: HIBACHI A2 OBJECTS 4..8, `$2A4866..$2A49F5`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, installScripts, a2Run2598E6, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import { HIBACHI_A2 } from '../src/hibachiend.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const A5 = 0x81332c;
const A6 = 0x81533c;
const PARTS = Object.freeze([
  { id: 4, entry: 0x2a4866, end: 0x2a48b4, part: 0x040 },
  { id: 5, entry: 0x2a48b6, end: 0x2a4904, part: 0x020 },
  { id: 6, entry: 0x2a4906, end: 0x2a4954, part: 0x0c0 },
  { id: 7, entry: 0x2a4956, end: 0x2a49a4, part: 0x0a0 },
  { id: 8, entry: 0x2a49a6, end: 0x2a49f4, part: 0x080 },
]);
const SELECTORS = Object.freeze([0, 1, 2, 3, 0x3f]);
const REQUESTS = Object.freeze([
  '800580010010da681100a012',
  '800d80060010dc9c1101a112',
  '8015800b0010ded01102a212',
  '801d80100010e1041103a312',
  '80258015001165341104a412',
]);

const beU16 = (address) => IMG.readUInt16BE(address);
const beU32 = (address) => IMG.readUInt32BE(address);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};
const requestHex = (ram, index) => Buffer.from(Array.from(
  { length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[1].buffer + index * RECORD_BYTES + i),
)).toString('hex');

function bench() {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: A5, bossSubRec: A6, unported: log, unportedLog: log };
  ram.setU32(A5 + 0x06, A6);
  installScripts(ram, ROM, { a2: HIBACHI_A2.table });
  ram.setU16(A6 + 0x1fa, 0x01f0);
  ram.setU8(A6 + 0x0e9, 0x12);

  PARTS.forEach(({ part }, i) => {
    ram.setU16(A6 + part + 0x02, 0xff80 + i * 0x0200);
    ram.setU16(A6 + part + 0x04, 0xffc0 + i * 0x0100);
    ram.setU32(A6 + part + 0x06, 0x00010080 + i * 0x00010040);
    ram.setU16(A6 + part + 0x0e, 0x1100 + i);
    ram.setU16(A6 + part + 0x1a, SELECTORS[i]);
    ram.setU16(A6 + part + 0x1c, ((0xa0 + i) << 8) | 0xee);
  });
  return { ram, ctx };
}

test('W559 pins all five exact routine boundaries and their one shared art table',
  { skip: SKIP }, () => {
    assert.deepEqual(PARTS.map(({ entry }) => entry), [
      HIBACHI_A2.object4, HIBACHI_A2.object5, HIBACHI_A2.object6,
      HIBACHI_A2.object7, HIBACHI_A2.object8,
    ]);
    assert.deepEqual(PARTS.map(({ end }) => end), [
      HIBACHI_A2.object4CodeEnd, HIBACHI_A2.object5CodeEnd, HIBACHI_A2.object6CodeEnd,
      HIBACHI_A2.object7CodeEnd, HIBACHI_A2.object8CodeEnd,
    ]);

    for (const { id, entry, end } of PARTS) {
      assert.equal(ROM.u32(HIBACHI_A2.table + id * 4), entry);
      assert.equal(end, entry + 0x4e, `object ${id} has $4E instruction bytes`);
      assert.equal(beU16(entry), 0x303c, `object ${id} starts with move.w #$A00,D0`);
      assert.equal(beU16(entry + 0x18), 0x41fa, `object ${id} uses PC-relative art`);
      assert.equal(entry + 0x1a + IMG.readInt16BE(entry + 0x1a), HIBACHI_A2.object3Art,
        `object ${id} resolves the shared table exactly`);
      assert.equal(beU16(entry + 0x48), 0x4ef9, `object ${id} ends in a tail jmp`);
      assert.equal(beU32(entry + 0x4a), 0x23dfea, `object ${id} targets bucket 1`);
      assert.equal(beU16(end), 0x4e71, `object ${id} is followed by its alignment nop`);
      assert.ok(scriptAddresses().includes(entry), `object ${id} is registered`);
    }
    for (let i = 0; i < PARTS.length - 1; i++) {
      assert.equal(PARTS[i].end + 2, PARTS[i + 1].entry);
    }
    assert.equal(HIBACHI_A2.object8CodeEnd + 2, HIBACHI_A2.object3Art);
    assert.equal(HIBACHI_A2.object3Art + HIBACHI_A2.object3ArtFrames * 4,
      HIBACHI_A2.object9);
    assert.equal(ROM.u32(HIBACHI_A2.table + 9 * 4), HIBACHI_A2.object9);
    assert.equal(beU16(HIBACHI_A2.object9), 0x303c, '$2A4AF6 starts object 9');
  });

test('W559 scheduler runs objects 4 through 8 faithfully before object 9 blocks',
  { skip: SKIP }, () => {
    const b = bench();
    for (let id = 4; id <= 9; id++) a2Run2598E6(b.ram, id);

    const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
    assert.equal(error?.romAddress, HIBACHI_A2.object9,
      'object 9 is the exact next live blocker');
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * PARTS.length,
      'all five registered objects emitted before slot 9 was reached');

    PARTS.forEach(({ id, part }, i) => {
      const slot = SCHED.a2Base + SCHED.a2Stride * id;
      assert.equal(b.ram.u16(slot), 0x8001, `object ${id} remains present and running`);
      assert.equal(b.ram.u32(slot + 2), PARTS[i].entry);
      assert.equal(b.ram.u16(A6 + part + 0x10), 0x0bf0);
      assert.equal(b.ram.u16(A6 + part + 0x12), 0x0410);
      assert.equal(b.ram.u16(A6 + part + 0x1a), SELECTORS[i],
        `object ${id} does not advance its art selector`);
      assert.equal(requestHex(b.ram, i), REQUESTS[i]);
      assert.equal(b.ram.u32(BUCKETS[1].buffer + i * RECORD_BYTES + 4),
        beU32(HIBACHI_A2.object3Art + SELECTORS[i] * 4));
    });
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * 9), 0x8001);
    assert.equal(b.ram.u16(A6 + 0x1fa), 0x01f0,
      'the five handlers share but do not change the root vector');
  });
