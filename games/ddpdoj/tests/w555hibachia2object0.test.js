// W555: HIBACHI A2 OBJECT 0, `$2A4702..$2A478B`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, installScripts, a2Run2598E6, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import { HIBACHI_A2 } from '../src/hibachiend.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const MANIFEST = here('../assets/manifest.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_ASSETS = existsSync(MANIFEST) ? false
  : 'generated web assets absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const A5 = 0x81332c;
const A6 = 0x81533c;

const beU16 = (address) => IMG.readUInt16BE(address);
const beU32 = (address) => IMG.readUInt32BE(address);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

function bench() {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: A5, bossSubRec: A6, tables: MT, unported: log, unportedLog: log };
  ram.setU32(A5 + 0x06, A6);
  installScripts(ram, ROM, { a2: HIBACHI_A2.table });
  ram.setU16(A6 + 0x02, 0xafc0);
  ram.setU16(A6 + 0x04, 0x1c00);
  ram.setU8(A6 + 0x0e8, 0x12);
  ram.setU16(A6 + 0x128, 0x0004);
  ram.setU8(A6 + 0x13d, 0xc6);
  return { ram, ctx };
}

const requestHex = (ram, index = 0) => Buffer.from(Array.from(
  { length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[1].buffer + index * RECORD_BYTES + i),
)).toString('hex');

test('W555 cartridge pins the object-0 code, art table, and direct registration',
  { skip: SKIP }, () => {
    assert.deepEqual(HIBACHI_A2, {
      table: 0x2a46b2,
      objects: 19,
      object0: 0x2a4702,
      object0CodeEnd: 0x2a4772,
      object0Art: 0x2a4774,
      object0ArtFrames: 6,
      object1: 0x2a478c,
      object1CodeEnd: 0x2a47d4,
      object1Art: 0x00116768,
      object2: 0x2a47d6,
      object2CodeEnd: 0x2a4814,
      object2Art: 0x00101728,
      object3: 0x2a4816,
    });
    assert.equal(beU16(HIBACHI_A2.object0), 0x303c, '$2A4702 is move.w #$1A,D0');
    assert.equal(beU16(0x2a476c), 0x4ef9, '$2A476C is the tail jmp');
    assert.equal(beU32(0x2a476e), 0x23dfea, 'the tail target is the bucket-1 register stub');
    assert.equal(beU16(HIBACHI_A2.object0CodeEnd), 0x4e71, '$2A4772 is alignment nop');

    const art = [0x000ffa30, 0x000fff04, 0x001003d8,
      0x001008ac, 0x00100d80, 0x00101254];
    assert.deepEqual(Array.from({ length: HIBACHI_A2.object0ArtFrames },
      (_, i) => beU32(HIBACHI_A2.object0Art + i * 4)), art);
    assert.deepEqual(Array.from({ length: HIBACHI_A2.object0ArtFrames },
      (_, i) => ROM.u32(HIBACHI_A2.object0Art + i * 4)), art);
    const window = TABLE_JSON.rom.windows.find((w) => w.base === '$2A4774');
    assert.equal(window?.len, 0x18);
    assert.equal(HIBACHI_A2.object0Art + 0x18, HIBACHI_A2.object1);

    assert.equal(ROM.u32(HIBACHI_A2.table), HIBACHI_A2.object0);
    assert.equal(ROM.u32(HIBACHI_A2.table + 4), HIBACHI_A2.object1);
    assert.equal(ROM.u32(HIBACHI_A2.table + HIBACHI_A2.objects * 4) >>> 0, 0xffffffff);
    assert.ok(scriptAddresses().includes(HIBACHI_A2.object0));
  });

test('W555 object 0 emits the exact checkpoint request and remains running',
  { skip: SKIP }, () => {
    const b = bench();
    const slot = SCHED.a2Base;
    assert.equal(b.ram.u16(slot), 0x8000, 'the list installer marks object 0 present');
    assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object0);
    a2Run2598E6(b.ram, 0);
    assert.equal(b.ram.u16(slot), 0x8001, '$2598E6 adds only the RUN bit');

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u8(A6 + 0x13d), 0xc8);
    assert.deepEqual([
      b.ram.u16(A6 + 0x010), b.ram.u16(A6 + 0x012),
      b.ram.u16(A6 + 0x1b0), b.ram.u16(A6 + 0x1b2),
    ], [0x1428, 0x21d8, 0xde28, 0x25d8]);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES);
    assert.equal(requestHex(b.ram), '81ff8038000fff0416700012',
      'the two long additions preserve the low-word carry before $23DFEA shifts D1');
    assert.equal(b.ram.u16(slot), 0x8001, 'the routine does not retire itself');

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 2);
    assert.equal(b.ram.u16(slot), 0x8001, 'object 0 persists across later dispatches');
    assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object0);
  });

test('W555 object 3 is the next scheduler blocker after objects 0, 1, and 2 emit',
  { skip: SKIP }, () => {
    const b = bench();
    a2Run2598E6(b.ram, 0);
    a2Run2598E6(b.ram, 1);
    a2Run2598E6(b.ram, 2);
    a2Run2598E6(b.ram, 3);
    const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
    assert.equal(error?.romAddress, HIBACHI_A2.object3);
    assert.equal(b.ram.u16(SCHED.a2Base), 0x8001);
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride), 0x8001);
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * 2), 0x8001);
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * 3), 0x8001);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 3,
      'objects 0, 1, and 2 emitted before object 3 stopped the frame');
    assert.equal(requestHex(b.ram), '81ff8038000fff0416700012');
  });

test('W555 exports exactly six new authentic frames into the boss shard',
  { skip: SKIP_ASSETS }, () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const row = manifest.spr.harvest.find((entry) => entry.at === '$2A4774');
    assert.deepEqual(row, {
      shard: 17,
      at: '$2A4774',
      entries: 6,
      stride: 4,
      distinct: 6,
      runsTo: 6,
      endsAt: '$2A478C',
      added: 6,
      already: 0,
    });
    assert.equal(manifest.spr.streamCount, 4915);
    assert.equal(manifest.spr.shards[17].streams, 1239);
    assert.equal(manifest.spr.shards[17].maskLen, 780310);
    assert.equal(manifest.spr.shards[17].colLen, 1969112);
    assert.equal(manifest.spr.maskUsed, 2620310);
  });
