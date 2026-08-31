// W640: export the complete Stage-4 Type-$42 child animation family.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { RAM } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import {
  SPRCOL_LAYOUT, SPRMASK_LAYOUT, loadRegions,
} from '../src/render/regions.js';
import { colourBase, streamExtent } from '../src/render/spritedir.js';
import { handler42 } from '../src/stage4type42.js';
import { loadBundle } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const TABLE_START = 0x2a4252;
const TABLE_END = 0x2a4272;
const REQUEST_SIZE = 0x0620;
const MASK_WORDS = 98;
const POINTERS = Object.freeze([
  0x0e8458, 0x0e84bc, 0x0e8520, 0x0e8584,
  0x0e85e8, 0x0e864c, 0x0e86b0, 0x0e8714,
]);
const EXTENTS = Object.freeze([
  [0x1cdcbf, 301, 901],
  [0x1cddec, 302, 904],
  [0x1cdf1a, 301, 902],
  [0x1ce047, 304, 911],
  [0x1ce177, 303, 908],
  [0x1ce2a6, 302, 906],
  [0x1ce3d4, 303, 909],
  [0x1ce503, 300, 900],
]);
const required = [
  IMAGE,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'spr', 'streams.u32.gz'),
  path.join(ASSETS, 'spr', 'mask.shard11.u16.gz'),
  path.join(ASSETS, 'spr', 'col.shard11.u16.gz'),
  ...[...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT].map(([name]) => path.join(ROM_DIR, name)),
];
const SKIP = required.every(existsSync) ? false
  : 'exact program, web bundle, or local graphics ROMs absent. '
    + 'This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const ROM = SKIP ? null : Object.freeze({
  u8: (address) => IMG.readUInt8(address),
  u16: (address) => IMG.readUInt16BE(address),
  i16: (address) => IMG.readInt16BE(address),
  u32: (address) => IMG.readUInt32BE(address),
});

let bundlePromise;
function bundle() {
  bundlePromise ??= loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
  return bundlePromise;
}

let localRegions;
function regions() {
  localRegions ??= loadRegions((name) => {
    const body = readFileSync(path.join(ROM_DIR, name));
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  });
  return localRegions;
}

function u16Body(body) {
  return new Uint16Array(body.buffer, body.byteOffset, body.byteLength >>> 1);
}

function tablePointers() {
  assert.equal(TABLE_START + POINTERS.length * 4, TABLE_END,
    'the eight-entry Type-$42 table closes exactly at the speed ladder');
  const requested = Array.from({ length: POINTERS.length }, (_, index) =>
    IMG.readUInt32BE(TABLE_START + index * 4) & 0x7fffff);
  assert.deepEqual(requested, POINTERS);
  assert.equal(new Set(requested).size, POINTERS.length);
  return requested;
}

test('W640 Type $42 reaches all eight descriptor rows and requests $0620',
  { skip: SKIP }, () => {
    assert.equal(Buffer.from(IMG.subarray(0x2a41e2, TABLE_START)).toString('hex'),
      '532d003e640000121b6d003f003e586d003c026d001f003c4a2e001f670000500c2e0070003c670000460c2e0071003c6700003c41fa003a4e71d0ed003c2410363c06207800382e001c222e00020681fa00fc000c2e000100716700000a4ef90023df2a4e714ef90023f7c64e714e75',
      'the cartridge masks the byte cursor with $001F, indexes $2A4252, and requests $0620');

    const ram = new Ram();
    const enemy = 0x814000;
    const sub = 0x81b732;
    ram.setU32(enemy + 0x06, sub);
    ram.setU8(sub + 0x1f, 1);
    ram.setU16(0x8130d2, 1);
    ram.setU16(enemy + 0x3c, 0x1c);
    const seen = [];
    for (let index = 0; index < 8; index++) {
      ram.setU8(enemy + 0x3e, 0);
      handler42(ram, ROM, enemy, {});
      seen.push(ram.u16(enemy + 0x3c));
    }
    assert.deepEqual(seen, [0, 4, 8, 0x0c, 0x10, 0x14, 0x18, 0x1c],
      '$2A41F4 exposes every descriptor row before wrapping');
    tablePointers();
  });

test('W640 all eight Type-$42 streams retain exact packaged cartridge geometry',
  { skip: SKIP }, async () => {
    const requested = tablePointers();
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const local = regions();
    const shard = b.manifest.spr.shards[11];
    const packedMask = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'mask.shard11.u16.gz'))));
    const packedCol = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'col.shard11.u16.gz'))));
    assert.deepEqual([packedMask.length, packedCol.length], [shard.maskLen, shard.colLen]);

    let colourWords = 0;
    for (let index = 0; index < requested.length; index++) {
      const offset = requested[index];
      const extent = streamExtent(local.sprmask, local.sprcol.length, offset);
      assert.deepEqual(
        [extent.maskWords, extent.colStart, extent.colWords, extent.stride, extent.pixels],
        [MASK_WORDS, ...EXTENTS[index].slice(0, 2), 100, EXTENTS[index][2]],
        `$${offset.toString(16)} retains its complete cartridge extent`,
      );
      colourWords += extent.colWords;

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.deepEqual(hit.slice(1), [MASK_WORDS, 11],
        `$${offset.toString(16)} keeps complete structure-shard ownership`);
      const packedMaskAt = hit[0] - shard.maskFrom;
      assert.ok(packedMaskAt >= 0 && packedMaskAt + MASK_WORDS <= shard.maskLen);
      assert.deepEqual(
        packedMask.subarray(packedMaskAt + 2, packedMaskAt + MASK_WORDS),
        local.sprmask.subarray(offset + 2, offset + MASK_WORDS),
        `$${offset.toString(16)} packed mask body matches cartridge words`,
      );

      const packedColBase = colourBase(packedMask, packedMaskAt);
      assert.equal(packedMask[packedMaskAt] & 3, 0);
      const packedColAt = packedColBase - shard.colFrom;
      assert.ok(packedColAt >= 0 && packedColAt + extent.colWords <= shard.colLen);
      assert.deepEqual(
        packedCol.subarray(packedColAt, packedColAt + extent.colWords),
        local.sprcol.subarray(extent.colStart, extent.colStart + extent.colWords),
        `$${offset.toString(16)} packed colour payload matches cartridge words`,
      );
    }
    assert.equal(colourWords, 2416,
      'the complete eight-frame family retains its exact contiguous colour union');
    assert.equal(EXTENTS[0][0], 0x1cdcbf);
    assert.equal(EXTENTS.at(-1)[0] + EXTENTS.at(-1)[1], 0x1ce62f);

    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$2A4252'), {
      shard: 11, at: '$2A4252', entries: 8, stride: 4, distinct: 8,
      runsTo: 8, endsAt: '$2A4272', added: 8, already: 0,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [853, 1192370, 3327007]);
  });

test('W640 all eight Type-$42 requests reach the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    const requested = tablePointers();
    for (let index = 0; index < requested.length; index++) {
      const record = RAM.spriteList + index * 10;
      const offset = requested[index];
      ram.setU16(record + 4, (offset >>> 16) & 0x7f);
      ram.setU16(record + 6, offset & 0xffff);
      ram.setU16(record + 8, REQUEST_SIZE);
    }

    const result = portSpriteList(ram, packed, { shardReady: () => true });
    assert.deepEqual([
      result.records, result.drawn, result.skipped, result.blank,
      result.missing.size, result.pending.size,
    ], [8, 8, 0, 0, 0, 0]);
    for (let index = 0; index < requested.length; index++) {
      const base = packed.get(requested[index])[0];
      const word = index * 5;
      assert.equal(result.words[word + 2] & 0x7f, (base >>> 16) & 0x7f);
      assert.equal(result.words[word + 3], base & 0xffff);
      assert.equal(result.words[word + 4], REQUEST_SIZE);
    }
  });
