// W560: HIBACHI A2 OBJECTS 9, 11, 12, 13 AND 15.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import {
  ROM_OVERLAP_PAIRS, overlappingPairs,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const EXPORT_TABLES = here('../tools/export-tables.py');
const EXPORT_WEB = here('../tools/export-web.mjs');
const MANIFEST = here('../assets/manifest.json');
const STREAMS = here('../assets/spr/streams.u32.gz');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_ASSETS = existsSync(MANIFEST) && existsSync(STREAMS) ? false
  : 'generated web assets absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const WINDOW_WHY = 'W560: HIBACHI A2 objects 9 and 15 share these six art longwords, selected by '
  + 'the signed word byte offset at A6+$126. The exact span begins after the shared routine\'s '
  + '$2A4B3E alignment and ends at object 11 code at $2A4B58';
const W560_WINDOW = SKIP ? null : Object.freeze({
  base: '$2A4B40',
  len: 0x18,
  why: WINDOW_WHY,
  hex: IMG.subarray(0x2a4b40, 0x2a4b58).toString('hex'),
});
const POST_W560_BASES = new Set([
  '$2A9318', '$2A934E', '$2A967A', '$2A96B6', '$2A97B6',
  '$2A9A68', '$2A9E50', '$2AA004', '$2AA040',
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
]);
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(TABLE_JSON));
  copy.rom.windows = copy.rom.windows.filter((w) =>
    w.base !== '$2A4B40' && !POST_W560_BASES.has(w.base));
  return copy;
})();
const FUTURE_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(PRIOR_TABLE));
  const after = copy.rom.windows.findIndex((w) => w.base === '$2A49F6');
  assert.notEqual(after, -1, 'the W558 predecessor window exists');
  copy.rom.windows.splice(after + 1, 0, W560_WINDOW);
  return copy;
})();
const ROM = SKIP ? null : new RomWindows(FUTURE_TABLE.rom);
const MT = SKIP ? null : new MoveTables(FUTURE_TABLE, ROM);
const A5 = 0x81332c;
const A6 = 0x81533c;
const PRIOR_TABLE_SHA256 = '250d097bf5c060d214fe690ef264b71a50225690909174320b3b921a76e33e1d';
const W560_TABLE_SHA256 = 'd55cfe3af945d92941c3b4b397cf52d11c864513cfb43a2502cc38f348ea6694';
const POINTERS = Object.freeze([
  0x2a4702, 0x2a478c, 0x2a47d6, 0x2a4816, 0x2a4866,
  0x2a48b6, 0x2a4906, 0x2a4956, 0x2a49a6, 0x2a4af6,
  0x2a4c42, 0x2a4b58, 0x2a4bc8, 0x2a4ba0, 0x2a4c08,
  0x2a4af6, 0x2a4cfc, 0x2a4d5e, 0x2a4de0,
]);
const IMPLEMENTED = Object.freeze([9, 11, 12, 13, 15]);
const REQUESTS = Object.freeze([
  '87b683af000fddfc12a00010',
  '875983c70010125416700012',
  '872983e3001017280c380012',
  '87ce83ce0011796c0e600011',
  '87b683af000fddfc12a00010',
]);
const TABLE_STREAMS = Object.freeze([
  0x000fd858, 0x000fddfc, 0x000fe3a0,
  0x000fe944, 0x000feee8, 0x000ff48c,
]);
const OBJECT13_STREAM = 0x0011796c;

const beU16 = (address) => IMG.readUInt16BE(address);
const beU32 = (address) => IMG.readUInt32BE(address);
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};
const requestHex = (ram, index) => Buffer.from(Array.from(
  { length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[1].buffer + index * RECORD_BYTES + i),
)).toString('hex');

function bench() {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: A5, bossSubRec: A6, tables: MT, unported: log, unportedLog: log };
  ram.setU32(A5 + 0x06, A6);
  installScripts(ram, ROM, { a2: HIBACHI_A2.table });
  ram.setU16(A6 + 0x02, 0xff80);
  ram.setU16(A6 + 0x04, 0xffc0);
  ram.setU8(A6 + 0x131, 0xc6);
  ram.setU16(A6 + 0x126, 0x0004);
  ram.setU8(A6 + 0x13d, 0x86);
  ram.setU16(A6 + 0x128, 0x0014);
  ram.setU8(A6 + 0x0e6, 0x10);
  ram.setU8(A6 + 0x0e7, 0x11);
  ram.setU8(A6 + 0x0e8, 0x12);
  return { ram, ctx };
}

test('W560 pins the exact pointer table, routine boundaries, and shared six-frame window',
  { skip: SKIP }, () => {
    assert.equal(HIBACHI_A2.objects, POINTERS.length);
    assert.deepEqual(Array.from({ length: HIBACHI_A2.objects },
      (_, id) => ROM.u32(HIBACHI_A2.table + id * 4)), POINTERS);
    assert.equal(ROM.u32(HIBACHI_A2.table + HIBACHI_A2.objects * 4) >>> 0, 0xffffffff);
    assert.equal(HIBACHI_A2.object9, HIBACHI_A2.object15,
      'table ids 9 and 15 intentionally share one routine');

    const routines = [
      { id: 9, entry: 0x2a4af6, end: 0x2a4b3e, first: 0x303c, tail: 0x2a4b38 },
      { id: 11, entry: 0x2a4b58, end: 0x2a4b9e, first: 0x303c, tail: 0x2a4b98 },
      { id: 13, entry: 0x2a4ba0, end: 0x2a4bc6, first: 0x243c, tail: 0x2a4bc0 },
      { id: 12, entry: 0x2a4bc8, end: 0x2a4c06, first: 0x303c, tail: 0x2a4c00 },
    ];
    for (const r of routines) {
      assert.equal(POINTERS[r.id], r.entry);
      assert.equal(beU16(r.entry), r.first, `object ${r.id} exact first opcode`);
      assert.equal(beU16(r.tail), 0x4ef9, `object ${r.id} exact tail jmp`);
      assert.equal(beU32(r.tail + 2), 0x23dfea, `object ${r.id} uses bucket 1`);
      assert.equal(beU16(r.end), 0x4e71, `object ${r.id} exact alignment word`);
      assert.ok(scriptAddresses().includes(r.entry), `object ${r.id} is registered`);
    }
    assert.equal(HIBACHI_A2.object9CodeEnd + 2, HIBACHI_A2.object9Art);
    assert.equal(HIBACHI_A2.object9Art + HIBACHI_A2.object9ArtFrames * 4,
      HIBACHI_A2.object11);
    assert.equal(HIBACHI_A2.object11CodeEnd + 2, HIBACHI_A2.object13);
    assert.equal(HIBACHI_A2.object13CodeEnd + 2, HIBACHI_A2.object12);
    assert.equal(HIBACHI_A2.object12CodeEnd + 2, HIBACHI_A2.object14);

    assert.deepEqual(Array.from({ length: HIBACHI_A2.object9ArtFrames },
      (_, i) => ROM.u32(HIBACHI_A2.object9Art + i * 4)), TABLE_STREAMS);
    assert.equal(W560_WINDOW.hex, '000fd858000fddfc000fe3a0000fe944000feee8000ff48c');
  });

test('W560 is a strict one-window additive superset with exact count and hashes',
  { skip: SKIP }, () => {
    assert.equal(PRIOR_TABLE.rom.windows.length, 815);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_TABLE_SHA256,
      'removing W560, if present, reconstructs the W558 checkpoint identity');
    assert.equal(TABLE_JSON.rom.windows.filter((w) => POST_W560_BASES.has(w.base)).length, 23,
      'historical reconstruction strips all twenty-three post-W560 windows');
    assert.equal(FUTURE_TABLE.rom.windows.length, 816);
    assert.equal(canonicalHash(FUTURE_TABLE), W560_TABLE_SHA256);

    const addedAt = FUTURE_TABLE.rom.windows.findIndex((w) => w.base === W560_WINDOW.base);
    assert.notEqual(addedAt, -1);
    assert.deepEqual(FUTURE_TABLE.rom.windows[addedAt], W560_WINDOW);
    const stripped = JSON.parse(JSON.stringify(FUTURE_TABLE));
    assert.deepEqual(stripped.rom.windows.splice(addedAt, 1), [W560_WINDOW]);
    assert.deepEqual(stripped, PRIOR_TABLE,
      'removing exactly the W560 window reconstructs every byte of the prior table');
    assert.equal(overlappingPairs(FUTURE_TABLE.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), ROM_OVERLAP_PAIRS, 'the new exact window is disjoint');

    const exporter = readFileSync(EXPORT_TABLES, 'utf8');
    assert.match(exporter, /\(0x2A4B40, 0x0018, "W560: HIBACHI A2 objects 9 and 15/);
    assert.match(exporter, /routine's \$2A4B3E alignment and ends at object 11 code at \$2A4B58/);
    const web = readFileSync(EXPORT_WEB, 'utf8');
    assert.match(web, /\[17, 0x2a4b40, 6, 4, 6, 0x2a4b58,/,
      'browser harvest includes the six previously absent selector streams');
    assert.match(web, /\[17, 0x11796c, 'Hibachi A2 object 13 fixed centre-part stream'/,
      'browser harvest includes object 13\'s previously absent fixed stream');
  });

test('W560 ships all six table streams and object 13 fixed stream in the boss shard',
  { skip: SKIP_ASSETS }, () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.deepEqual(manifest.spr.harvest.find((row) => row.at === '$2A4B40'), {
      shard: 17, at: '$2A4B40', entries: 6, stride: 4, distinct: 6,
      runsTo: 6, endsAt: '$2A4B58', added: 6, already: 0,
    });

    const raw = gunzipSync(readFileSync(STREAMS));
    const flat = new Uint32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const rows = new Map();
    let offs = 0, base = 0;
    for (let i = 0; i < manifest.spr.streamCount; i++) {
      offs = (offs + flat[i]) >>> 0;
      base = (base + flat[manifest.spr.streamCount + i]) >>> 0;
      rows.set(offs, { base, maskWords: flat[manifest.spr.streamCount * 2 + i] });
    }
    assert.deepEqual(TABLE_STREAMS.map((at) => rows.get(at)), [
      { base: 2227176, maskWords: 1442 }, { base: 2228618, maskWords: 1442 },
      { base: 2230060, maskWords: 1442 }, { base: 2231502, maskWords: 1442 },
      { base: 2232944, maskWords: 1442 }, { base: 2234386, maskWords: 1442 },
    ]);
    assert.deepEqual(rows.get(OBJECT13_STREAM), { base: 2284148, maskWords: 674 });

    const shard = manifest.spr.shards[17];
    assert.equal(manifest.spr.streamCount, 4986);
    assert.equal(shard.streams, 1310);
    assert.equal(shard.maskLen, 825604);
    assert.equal(shard.colLen, 2015094);
    assert.equal(manifest.spr.maskUsed, 2665604);
    assert.equal(manifest.spr.colUsed, 6497985);
  });

test('W560 all five implemented ids emit exact requests and remain running',
  { skip: SKIP }, () => {
    const b = bench();
    for (const id of IMPLEMENTED) a2Run2598E6(b.ram, id);

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u8(A6 + 0x131), 0xca,
      'ids 9 and 15 each advance the shared heading by two');
    assert.equal(b.ram.u8(A6 + 0x13d), 0x89,
      'object 11 advances by three and object 12 only reads the result');
    assert.equal(b.ram.u16(A6 + 0x126), 0x0004);
    assert.equal(b.ram.u16(A6 + 0x128), 0x0014);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * IMPLEMENTED.length);
    assert.deepEqual(IMPLEMENTED.map((_, i) => requestHex(b.ram, i)), REQUESTS,
      'word-vector arithmetic, long carries, art selection, size, and palette are exact');

    for (const id of IMPLEMENTED) {
      const slot = SCHED.a2Base + SCHED.a2Stride * id;
      assert.equal(b.ram.u16(slot), 0x8001, `object ${id} remains present and running`);
      assert.equal(b.ram.u32(slot + 2), POINTERS[id]);
    }
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * IMPLEMENTED.length * 2);
    assert.equal(b.ram.u8(A6 + 0x131), 0xce);
    assert.equal(b.ram.u8(A6 + 0x13d), 0x8c);
    for (const id of IMPLEMENTED) {
      assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * id), 0x8001,
        `object ${id} does not remove itself on a later dispatch`);
    }
  });

test('W560 cumulative A2 progression reaches object 10 as the first exact unported address',
  { skip: SKIP }, () => {
    const b = bench();
    for (let id = 0; id <= 10; id++) a2Run2598E6(b.ram, id);

    const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
    assert.equal(error?.romAddress, HIBACHI_A2.object10);
    assert.equal(HIBACHI_A2.object10, 0x2a4c42);
    assert.equal(scriptAddresses().includes(HIBACHI_A2.object10), false);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 10,
      'objects 0 through 9 emit before slot 10 blocks');
    for (let id = 0; id <= 10; id++) {
      assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * id), 0x8001);
    }
  });
