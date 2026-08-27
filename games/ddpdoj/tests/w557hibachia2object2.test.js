// W557: HIBACHI A2 OBJECT 2, `$2A47D6..$2A4815`.

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
import { ROM_WINDOW_COUNT } from './romwindowset.js';

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
  ram.setU8(A6 + 0x0e8, 0x12);
  ram.setU8(A6 + 0x13d, 0xc6);
  return { ram, ctx };
}

const requestHex = (ram, index = 0) => Buffer.from(Array.from(
  { length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[1].buffer + index * RECORD_BYTES + i),
)).toString('hex');

test('W557 cartridge pins object 2, its fixed art immediate, and object 3 boundary',
  { skip: SKIP }, () => {
    assert.equal(HIBACHI_A2.object2, 0x2a47d6);
    assert.equal(HIBACHI_A2.object2CodeEnd, 0x2a4814);
    assert.equal(HIBACHI_A2.object2Art, 0x00101728);
    assert.equal(HIBACHI_A2.object3, 0x2a4816);
    assert.equal(beU16(HIBACHI_A2.object2), 0x303c, '$2A47D6 is move.w #$1A,D0');
    assert.equal(beU16(0x2a47fe), 0x243c, '$2A47FE loads a fixed art immediate');
    assert.equal(beU32(0x2a4800), HIBACHI_A2.object2Art);
    assert.equal(beU16(0x2a4804), 0x363c, '$2A4804 loads the fixed sprite flags');
    assert.equal(beU16(0x2a4806), 0x0c38);
    assert.equal(beU16(0x2a480e), 0x4ef9, '$2A480E is the tail jmp');
    assert.equal(beU32(0x2a4810), 0x23dfea, 'the tail target is the bucket-1 stub');
    assert.equal(beU16(HIBACHI_A2.object2CodeEnd), 0x4e71, '$2A4814 is alignment nop');
    assert.equal(beU16(HIBACHI_A2.object3), 0x303c, '$2A4816 begins object 3');
    assert.equal(ROM.u32(HIBACHI_A2.table + 8), HIBACHI_A2.object2);
    assert.equal(ROM.u32(HIBACHI_A2.table + 12), HIBACHI_A2.object3);
    assert.ok(scriptAddresses().includes(HIBACHI_A2.object2));
    assert.equal(TABLE_JSON.rom.windows.length, ROM_WINDOW_COUNT);
    assert.equal(TABLE_JSON.rom.windows.some((w) => w.base === '$2A47D6'), false,
      'object 2 reads no cartridge data and declares no code-as-data window');
  });

test('W557 object 2 emits exactly without advancing its angle and persists',
  { skip: SKIP }, () => {
    const b = bench();
    const slot = SCHED.a2Base + SCHED.a2Stride * 2;
    assert.equal(b.ram.u16(slot), 0x8000);
    assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object2);
    a2Run2598E6(b.ram, 2);
    assert.equal(b.ram.u16(slot), 0x8001);

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u8(A6 + 0x13d), 0xc6, 'object 2 reads but does not advance the angle');
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES);
    assert.equal(requestHex(b.ram), '81cf8054001017280c380012',
      'the two long additions preserve low-word carry before $23DFEA shifts D1');
    assert.equal(b.ram.u16(slot), 0x8001, 'object 2 does not retire itself');

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 2);
    assert.equal(requestHex(b.ram, 1), '81cf8054001017280c380012');
    assert.equal(b.ram.u16(slot), 0x8001, 'object 2 persists across later dispatches');
    assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object2);
  });

test('W557 objects 2 through 9 emit before the later W576 object 10 completes', { skip: SKIP }, () => {
  const b = bench();
  for (let id = 2; id <= 10; id++) a2Run2598E6(b.ram, id);
  const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
  assert.equal(error, null, 'W576 ports object 10 and its exact selector table');
  for (let id = 2; id <= 10; id++) {
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * id), 0x8001);
  }
  assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 9,
    'objects 2 through 10 all emit in ascending scheduler order');
  assert.equal(requestHex(b.ram, 8), '86b783f0001032080f000014',
    'object 10 emits the exact first W576 selector row after object 9');
  assert.equal(requestHex(b.ram), '81cf8054001017280c380012');
});

test('W557 ships the fixed upper-body stream in the boss shard',
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
    const row = rows.get(HIBACHI_A2.object2Art);
    const shard = manifest.spr.shards[17];
    assert.deepEqual(row, { base: 2420952, maskWords: 338 });
    assert.ok(row.base >= shard.maskFrom && row.base + row.maskWords <= shard.maskFrom + shard.maskLen);
    assert.equal(manifest.spr.streamCount, 5636);
    assert.equal(shard.streams, 1516);
    assert.equal(shard.maskLen, 851232);
    assert.equal(shard.colLen, 2149650);
    assert.equal(manifest.spr.maskUsed, 2868952);
    assert.equal(manifest.spr.colUsed, 7163964);
  });
