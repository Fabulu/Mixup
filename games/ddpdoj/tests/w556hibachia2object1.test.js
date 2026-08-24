// W556: HIBACHI A2 OBJECT 1, `$2A478C..$2A47D5`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
const STREAMS = here('../assets/spr/streams.u32.gz');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_ASSETS = existsSync(MANIFEST) && existsSync(STREAMS) ? false
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
  ram.setU8(A6 + 0x1a, 0x18);
  ram.setU8(A6 + 0x1b, 0x86);
  ram.setU8(A6 + 0xe7, 0x11);
  return { ram, ctx };
}

const requestHex = (ram, index = 0) => Buffer.from(Array.from(
  { length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[1].buffer + index * RECORD_BYTES + i),
)).toString('hex');

test('W556 cartridge pins object 1, its fixed art immediate, and object 2 boundary',
  { skip: SKIP }, () => {
    assert.equal(HIBACHI_A2.object1, 0x2a478c);
    assert.equal(HIBACHI_A2.object1CodeEnd, 0x2a47d4);
    assert.equal(HIBACHI_A2.object1Art, 0x00116768);
    assert.equal(HIBACHI_A2.object2, 0x2a47d6);
    assert.equal(beU16(HIBACHI_A2.object1), 0x7000, '$2A478C clears D0 with moveq');
    assert.equal(beU16(0x2a47be), 0x243c, '$2A47BE loads a fixed art immediate');
    assert.equal(beU32(0x2a47c0), HIBACHI_A2.object1Art);
    assert.equal(beU16(0x2a47ce), 0x4ef9, '$2A47CE is the tail jmp');
    assert.equal(beU32(0x2a47d0), 0x23dfea, 'the tail target is the bucket-1 stub');
    assert.equal(beU16(HIBACHI_A2.object1CodeEnd), 0x4e71, '$2A47D4 is alignment nop');
    assert.equal(beU16(HIBACHI_A2.object2), 0x303c, '$2A47D6 begins object 2');
    assert.equal(ROM.u32(HIBACHI_A2.table + 4), HIBACHI_A2.object1);
    assert.equal(ROM.u32(HIBACHI_A2.table + 8), HIBACHI_A2.object2);
    assert.ok(scriptAddresses().includes(HIBACHI_A2.object1));
    assert.equal(TABLE_JSON.rom.windows.some((w) => w.base === '$2A478C'), false,
      'object 1 reads no cartridge data and declares no code-as-data window');
  });

test('W556 object 1 stores its vector, emits exactly, and persists', { skip: SKIP }, () => {
  const b = bench();
  const slot = SCHED.a2Base + SCHED.a2Stride;
  assert.equal(b.ram.u16(slot), 0x8000);
  assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object1);
  a2Run2598E6(b.ram, 1);
  assert.equal(b.ram.u16(slot), 0x8001);

  assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
  assert.equal(b.ram.u8(A6 + 0x1b), 0x88);
  assert.equal(b.ram.u16(A6 + 0x1fa), 0xfef8);
  assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES);
  assert.equal(requestHex(b.ram), '862a83e00011676821200011');
  assert.equal(b.ram.u16(slot), 0x8001, 'object 1 does not retire itself');

  assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
  assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 2);
  assert.equal(b.ram.u16(slot), 0x8001, 'object 1 persists across later dispatches');
  assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object1);
});

test('W556 object 9 is now the live blocker after objects 1 through 8 emit', { skip: SKIP }, () => {
  const b = bench();
  for (let id = 1; id <= 9; id++) a2Run2598E6(b.ram, id);
  const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
  assert.equal(error?.romAddress, HIBACHI_A2.object9);
  for (let id = 1; id <= 9; id++) {
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * id), 0x8001);
  }
  assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 8);
  assert.equal(requestHex(b.ram), '862a83e00011676821200011');
});

test('W556 ships the one fixed lower-body stream in the boss shard',
  { skip: SKIP_ASSETS }, () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const raw = gunzipSync(readFileSync(STREAMS));
    const flat = new Uint32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const rows = new Map();
    let offs = 0, base = 0;
    for (let i = 0; i < manifest.spr.streamCount; i++) {
      offs = (offs + flat[i]) >>> 0;
      base = (base + flat[manifest.spr.streamCount + i]) >>> 0;
      rows.set(offs, { base, maskWords: flat[manifest.spr.streamCount * 2 + i] });
    }
    const row = rows.get(HIBACHI_A2.object1Art);
    const shard = manifest.spr.shards[17];
    assert.deepEqual(row, { base: 2270886, maskWords: 4610 });
    assert.ok(row.base >= shard.maskFrom && row.base + row.maskWords <= shard.maskFrom + shard.maskLen);
    assert.equal(manifest.spr.streamCount, 4979);
    assert.equal(shard.streams, 1303);
    assert.equal(shard.maskLen, 816278);
    assert.equal(shard.colLen, 2001559);
    assert.equal(manifest.spr.maskUsed, 2656278);
  });
