// W630: type $800C name-entry presentation and its complete boot-art family.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  BUCKETS, RECORD_BYTES, ZOOM_REG_SCALE_TABLE, resolveEmitStub, resolveZoomRegisterStub,
} from '../src/spritequeue.js';
import {
  NAME_REC, drawNamePanel28F7F4, drawNameFurniture28FAF4,
  drawNameScore28FB8A, drawNameHeader28FC36,
} from '../src/hiscorename.js';
import { loadBundle } from '../src/web/assets.js';
import { romToPackedMap } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(ROOT, 'rip', 'sound', 'maincpu.bin');
const ASSETS = path.join(ROOT, 'assets');
const DIRECT_REQUIRED = [TABLES, IMAGE];
const MANIFEST_FILE = path.join(ASSETS, 'manifest.json');
const MANIFEST = existsSync(MANIFEST_FILE)
  ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) : null;
function requiredAssetNames(manifest) {
  if (!manifest) return ['manifest.json'];
  const bgShards = Array.isArray(manifest.gfx?.bg?.shards) ? manifest.gfx.bg.shards : [];
  const sprShards = Array.isArray(manifest.spr?.shards) ? manifest.spr.shards : [];
  return [...new Set([
    'manifest.json',
    'gfx/tx.tiles.u8.gz', 'gfx/tx.tileno.u16.gz',
    'gfx/bg.tileno.u16.gz', 'gfx/bg.pal.u16.gz', 'gfx/bg.smap.u16.gz',
    ...bgShards.map(({ i }) => `gfx/bg.shard${i}.tiles.u8.gz`),
    manifest.spr?.streamsFile ?? 'spr/streams.u32.gz',
    ...sprShards.flatMap(({ i }) => [
      `spr/mask.shard${i}.u16.gz`, `spr/col.shard${i}.u16.gz`,
    ]),
    'capture.json.gz', 'capture.bin.gz', 'seed.bin.gz', 'player.tables.json.gz',
  ])];
}
const ASSET_REQUIRED = [
  ...DIRECT_REQUIRED,
  ...requiredAssetNames(MANIFEST).map((name) => path.join(ASSETS, name)),
];
const SKIP_DIRECT = DIRECT_REQUIRED.every(existsSync) ? false
  : 'exact program or generated ROM tables absent; skip, not pass';
const SKIP_ASSETS = ASSET_REQUIRED.every(existsSync) ? false
  : 'exact program, generated tables, or complete web bundle absent; skip, not pass';
const TABLE_JSON = SKIP_DIRECT ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP_DIRECT ? null : new RomWindows(TABLE_JSON.rom);
const IMG = SKIP_DIRECT ? null : readFileSync(IMAGE);

const A4 = 0x81f200;
const ROW = 0x81f280;
const PANEL_TABLE = 0x28fa24;
const MASK = 0x07ff03ff;
const NO_ZOOM = 0x80008000;

const u16 = (n) => n & 0xffff;
const i16 = (n) => ((n & 0x8000) !== 0 ? (n & 0xffff) - 0x10000 : n & 0xffff);
const wordAdd = (d1, delta) => ((d1 & 0xffff0000) | u16(d1 + delta)) >>> 0;

function request(position, art, d3, d4) {
  const out = new Uint8Array(RECORD_BYTES);
  const view = new DataView(out.buffer);
  view.setUint32(0, position >>> 0, false);
  view.setUint32(4, art >>> 0, false);
  view.setUint16(8, d3 & 0xffff, false);
  view.setUint16(10, d4 & 0xffff, false);
  return out;
}

function ordinaryBytes(d1, d2, d3, d4) {
  const packed = (d1 | 0) >> 6;
  return request(((packed & MASK) | NO_ZOOM) >>> 0, d2, d3, d4);
}

function zoomBytes(d1, d2, d3, d4, d6) {
  const flags = d6 >>> 0;
  const height = d3 & 0x01ff;
  const widthByte = (d3 >>> 8) & 0xff;
  const shortScale = ZOOM_REG_SCALE_TABLE[(height >> 1) >> 2];
  const longScale = ZOOM_REG_SCALE_TABLE[widthByte & 0x3e];
  const shortAdj = i16(u16(0x80 - u16(flags >>> 8)) * shortScale);
  const longAdj = i16(u16(0x80 - ((flags >>> 24) & 0xff)) * longScale);
  const long = u16(i16(d1 >>> 16) + longAdj);
  const short = u16(i16(d1) + shortAdj);
  const packed = (((long << 16) | short) | 0) >> 6;
  return request(((packed & MASK) | flags) >>> 0, d2, d3, d4);
}

const ordinary = (stub, d1, d2, d3, d4) => ({
  bucket: resolveEmitStub(ROM, stub).bucket,
  bytes: ordinaryBytes(d1, d2, d3, d4),
});
const zoom = (stub, d1, d2, d3, d4, d6) => ({
  bucket: resolveZoomRegisterStub(ROM, stub).bucket,
  bytes: zoomBytes(d1, d2, d3, d4, d6),
});

function bucketRecords(ram, bucket) {
  const spec = BUCKETS[bucket];
  const count = ram.u16(spec.counter) / RECORD_BYTES;
  return Array.from({ length: count }, (_, index) =>
    Uint8Array.from({ length: RECORD_BYTES }, (__, offset) =>
      ram.u8(spec.buffer + index * RECORD_BYTES + offset)));
}

function assertRequests(ram, expected, label) {
  const grouped = new Map();
  for (const item of expected) {
    if (!grouped.has(item.bucket)) grouped.set(item.bucket, []);
    grouped.get(item.bucket).push(item.bytes);
  }
  for (const bucket of BUCKETS) {
    const actual = bucketRecords(ram, bucket.i);
    assert.deepEqual(actual, grouped.get(bucket.i) ?? [], `${label}, bucket ${bucket.i}`);
  }
}

function panelRam(side, entered, cell, phase = 0) {
  const ram = new Ram();
  ram.setU16(A4 + NAME_REC.side, side);
  ram.setU32(A4 + NAME_REC.entry, ROW);
  ram.setU16(A4 + 0x16, entered);
  ram.setU16(A4 + 0x18, cell);
  ram.setU16(A4 + 0x3e, phase);
  return ram;
}

function expectedPanel(side, entered, cell, phase, chars) {
  let d1 = side === 0 ? 0x48400380 : 0x48402240;
  const out = [];
  for (let i = 0; i < entered; i++) {
    out.push(zoom(0x23e45a, d1, ROM.u32(PANEL_TABLE + chars[i]),
      0x0418, 0x0004, 0x40004000));
    d1 = wordAdd(d1, 0x0600);
  }
  if (entered === 3) return out;
  out.push(ordinary(0x23e056, d1, ROM.u32(PANEL_TABLE + cell * 4), 0x0418, 0x0004));
  if (entered >= 2) return out;
  let blankPhase = phase;
  for (let i = 0; i < 2 - entered; i++) {
    d1 = wordAdd(d1, 0x0600);
    out.push(zoom(0x23e45a, d1, ROM.u32(PANEL_TABLE + blankPhase),
      0x0418, 0x0004, 0x40004000));
    blankPhase = u16(blankPhase + 0x34);
    if (blankPhase >= 0x006c) blankPhase = u16(blankPhase - 0x006c);
  }
  return out;
}

function furnitureExpected(side, base, phaseA, phaseB) {
  const artA = side === 0 ? 0x28f9ac : 0x28f9bc;
  const artB = side === 0 ? 0x28f9cc : 0x28f9ec;
  const delta = side === 0 ? 0x28fa0c : 0x28fa18;
  return [
    ordinary(0x23dfea, (base + ROM.u32(delta)) >>> 0,
      ROM.u32(artB + phaseB), 0x3808, 0x0005),
    ordinary(0x23dfea, (base + ROM.u32(delta + 4)) >>> 0,
      ROM.u32(artB + phaseB + 4), 0x03c0, 0x0005),
    ordinary(0x23e020, (base + ROM.u32(delta + 8)) >>> 0,
      ROM.u32(artA + phaseA), 0x0620, 0x0005),
  ];
}

function scoreExpected(side, prefix, score, overflow) {
  let d1 = side === 0 ? 0x40401540 : 0x40403300;
  const out = [];
  const emit = (digit) => {
    const art = 0x323be8 + ROM.u16(0x28fc16 + (digit & 0x0f) * 2);
    out.push(ordinary(0x23e056, d1, art, 0x0208, 0x0004));
  };
  emit(prefix);
  d1 = wordAdd(d1, -0x0200);
  let value = score >>> 0;
  let left = 7;
  for (;;) {
    emit(value & 0x0f);
    d1 = wordAdd(d1, -0x0200);
    value >>>= 4;
    if (value === 0) break;
    left--;
    if (left < 0) break;
  }
  left--;
  if (overflow !== 0) {
    while (left >= 0) {
      emit(0);
      d1 = wordAdd(d1, -0x0200);
      left--;
    }
    emit(overflow);
  }
  return out;
}

let bundlePromise;
function bundle() {
  bundlePromise ??= loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
  return bundlePromise;
}

test('W630 panel emits byte-exact requests for both sides and all 29 table cells',
  { skip: SKIP_DIRECT }, () => {
    assert.equal(resolveEmitStub(ROM, 0x23e056).bucket, 3);
    assert.equal(resolveZoomRegisterStub(ROM, 0x23e45a).bucket, 3);
    for (const side of [0, 1]) {
      for (let cell = 0; cell < 29; cell++) {
        const ram = panelRam(side, 0, cell);
        drawNamePanel28F7F4(ram, ROM, A4);
        assertRequests(ram, expectedPanel(side, 0, cell, 0, []),
          `side ${side}, panel cell ${cell}`);
        assert.equal(ram.u16(A4 + 0x3e), 4, 'the phase advances after using its old value');
      }
    }
    assert.equal(ROM.u32(PANEL_TABLE + 27 * 4), 0x323b28, 'cell 27 remains in the panel table');
    assert.equal(ROM.u32(PANEL_TABLE + 28 * 4), 0x322f44, 'cell 28 is the animated blank stream');
  });

test('W630 panel reads entered longs, advances X by words, and wraps phase $68 to zero',
  { skip: SKIP_DIRECT }, () => {
    const chars = [0x70, 0x00, 0x04];
    for (const side of [0, 1]) {
      const full = panelRam(side, 3, 28, 0x44);
      chars.forEach((value, index) => full.setU32(ROW + index * 4, value));
      drawNamePanel28F7F4(full, ROM, A4);
      assertRequests(full, expectedPanel(side, 3, 28, 0x44, chars),
        `side ${side}, three entered characters`);
      assert.equal(full.u16(A4 + 0x3e), 0x44, 'a full name does not touch blank phase');
    }

    const wrap = panelRam(1, 0, 28, 0x68);
    drawNamePanel28F7F4(wrap, ROM, A4);
    assertRequests(wrap, expectedPanel(1, 0, 28, 0x68, []), 'phase-wrap frame');
    assert.equal(wrap.u16(A4 + 0x3e), 0, 'old phase $68 wraps the stored phase to zero');
  });

test('W630 furniture preserves byte timers and word phases on both sides',
  { skip: SKIP_DIRECT }, () => {
    const borrow = new Ram();
    borrow.setU16(A4 + NAME_REC.side, 0);
    borrow.setU32(A4 + 0x06, 0x35000a40);
    borrow.setU8(A4 + 0x22, 0);
    borrow.setU8(A4 + 0x23, 2);
    borrow.setU16(A4 + 0x24, 0);
    borrow.setU8(A4 + 0x26, 2);
    borrow.setU8(A4 + 0x27, 5);
    borrow.setU16(A4 + 0x28, 0);
    drawNameFurniture28FAF4(borrow, ROM, A4);
    assert.deepEqual([
      borrow.u8(A4 + 0x22), borrow.u16(A4 + 0x24),
      borrow.u8(A4 + 0x26), borrow.u16(A4 + 0x28),
    ], [2, 0x0c, 5, 0x18]);
    assertRequests(borrow, furnitureExpected(0, 0x35000a40, 0x0c, 0x18),
      'P1 borrow and reload phases');

    const advance = new Ram();
    advance.setU16(A4 + NAME_REC.side, 1);
    advance.setU32(A4 + 0x06, 0x35001000);
    advance.setU8(A4 + 0x22, 2);
    advance.setU8(A4 + 0x23, 9);
    advance.setU16(A4 + 0x24, 8);
    advance.setU8(A4 + 0x26, 0);
    advance.setU8(A4 + 0x27, 7);
    advance.setU16(A4 + 0x28, 0x10);
    drawNameFurniture28FAF4(advance, ROM, A4);
    assert.deepEqual([
      advance.u8(A4 + 0x22), advance.u16(A4 + 0x24),
      advance.u8(A4 + 0x26), advance.u16(A4 + 0x28),
    ], [1, 8, 7, 8]);
    assertRequests(advance, furnitureExpected(1, 0x35001000, 8, 8),
      'P2 non-borrow phases');
  });

test('W630 score emits low nibbles first and zero-fills before its overflow nibble',
  { skip: SKIP_DIRECT }, () => {
    const plain = new Ram();
    plain.setU16(A4 + NAME_REC.side, 0);
    plain.setU16(A4 + NAME_REC.digits, 9);
    plain.setU32(A4 + NAME_REC.score, 0x00001234);
    plain.setU16(A4 + NAME_REC.overflow, 0);
    drawNameScore28FB8A(plain, ROM, A4);
    assertRequests(plain, scoreExpected(0, 9, 0x1234, 0), 'P1 score nibbles 4,3,2,1');

    const overflow = new Ram();
    overflow.setU16(A4 + NAME_REC.side, 1);
    overflow.setU16(A4 + NAME_REC.digits, 0x000a);
    overflow.setU32(A4 + NAME_REC.score, 0x00000021);
    overflow.setU16(A4 + NAME_REC.overflow, 0x000f);
    drawNameScore28FB8A(overflow, ROM, A4);
    const expected = scoreExpected(1, 0x0a, 0x21, 0x0f);
    assert.equal(expected.length, 10, 'prefix, eight score slots, then overflow');
    assertRequests(overflow, expected, 'P2 score with overflow');
  });

test('W630 header emits byte-exact side and row requests for rows zero through four',
  { skip: SKIP_DIRECT }, () => {
    for (const side of [0, 1]) {
      for (let row = 0; row < 5; row++) {
        const ram = new Ram();
        ram.setU16(A4 + NAME_REC.side, side);
        ram.setU16(A4 + NAME_REC.index, row);
        drawNameHeader28FC36(ram, ROM, A4);
        const expected = [
          ordinary(0x23e020,
            side === 0 ? 0x52000c00 : 0x52002240,
            side === 0 ? 0x31f348 : 0x31f374, 0x0228, 0x0005),
          ordinary(0x23e056,
            side === 0 ? 0x52000440 : 0x52002d40,
            ROM.u32(0x28fc96 + row * 4), 0x0218, 0x0004),
        ];
        assertRequests(ram, expected, `side ${side}, header row ${row}`);
      }
    }
  });

test('W630 all 70 structurally derived presentation streams map to boot shard zero',
  { skip: SKIP_ASSETS }, async () => {
    const furniture = Array.from({ length: 24 }, (_, i) =>
      IMG.readUInt32BE(0x28f9ac + i * 4) & 0x7fffff);
    const panel = Array.from({ length: 29 }, (_, i) =>
      IMG.readUInt32BE(0x28fa24 + i * 4) & 0x7fffff);
    const offsets = Array.from({ length: 16 }, (_, i) => IMG.readUInt16BE(0x28fc16 + i * 2));
    assert.deepEqual(offsets, [
      0x00, 0x0c, 0x18, 0x24, 0x30, 0x3c, 0x48, 0x54,
      0x60, 0x6c, 0, 0, 0, 0, 0, 0,
    ], 'ten score digits followed by six zero aliases');
    const score = offsets.slice(0, 10).map((offset) => 0x323be8 + offset);
    const header = [
      0x31f348, 0x31f374,
      ...Array.from({ length: 5 }, (_, i) => IMG.readUInt32BE(0x28fc96 + i * 4) & 0x7fffff),
    ];
    assert.deepEqual([furniture.length, panel.length, score.length, header.length], [24, 29, 10, 7]);
    assert.ok(panel.includes(0x323b28), 'the panel cell-27 stream is part of the raw table');
    assert.ok(panel.includes(0x322f44), 'the animated blank stream is part of the raw table');
    const required = [...new Set([...furniture, ...panel, ...score, ...header])];
    assert.equal(required.length, 70, 'the four raw cartridge structures have 70 distinct streams');

    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    for (const stream of required) {
      const hit = packed.get(stream);
      assert.ok(hit, `$${stream.toString(16).toUpperCase()} has a packed mapping`);
      assert.equal(hit[2], 0, `$${stream.toString(16).toUpperCase()} belongs to boot shard 0`);
      assert.ok(b.spr.boot.includes(b.spr.shardOfBase(hit[0])),
        `$${stream.toString(16).toUpperCase()} is present before deferred shards load`);
    }
  });
