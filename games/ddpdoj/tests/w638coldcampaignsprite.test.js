// W638: export the complete Stage-4 boss arrival object-11 art family.

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
import { loadBundle } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const TABLE_START = 0x29f478;
const TABLE_END = 0x29f498;
const REQUEST_SIZE = 0x2490;
const MASK_WORDS = 2594;
const POINTERS = Object.freeze([
  0x0f8738, 0x0f915c, 0x0f9b80, 0x0fa5a4,
  0x0fafc8, 0x0fb9ec, 0x0fc410, 0x0fce34,
]);
const EXTENTS = Object.freeze([
  [0x1e786a, 4978, 14933],
  [0x1e8bdc, 5315, 15945],
  [0x1ea09f, 5691, 17073],
  [0x1eb6da, 6072, 18214],
  [0x1ece92, 6478, 19434],
  [0x1ee7e0, 7314, 21941],
  [0x1f0472, 8690, 26069],
  [0x1f2664, 9150, 27449],
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
    'the eight-entry object-11 table closes exactly at $29F498');
  const requested = Array.from({ length: POINTERS.length }, (_, index) =>
    IMG.readUInt32BE(TABLE_START + index * 4) & 0x7fffff);
  assert.deepEqual(requested, POINTERS);
  assert.equal(new Set(requested).size, POINTERS.length);
  return requested;
}

test('W638 object 11 selects all eight cartridge rows before active handoff',
  { skip: SKIP }, () => {
    assert.deepEqual(
      Buffer.from(IMG.subarray(0x29f454, TABLE_START)).toString('hex'),
      '41fa00224e71d0ee01282410222e01220681dc00ee00363c249078154ef90023df864e71',
      'object 11 indexes $29F478 with ($128,A6), requests $2490, and jumps to bucket 7',
    );
    assert.equal(IMG.readUInt32BE(0x29f6a0), 0x586e0128,
      'MAIN0 advances the object-11 cursor by four bytes');
    assert.equal(Buffer.from(IMG.subarray(0x29f6a4, 0x29f6aa)).toString('hex'),
      '0c6e001c0128', 'MAIN0 retains cursor values through $001C');
    assert.equal(Buffer.from(IMG.subarray(0x29f6ae, 0x29f6b4)).toString('hex'),
      '3d7c00000128', 'the active handoff resets the cursor after the eighth row');
    assert.deepEqual(Array.from({ length: 8 }, (_, index) => index * 4),
      [0x00, 0x04, 0x08, 0x0c, 0x10, 0x14, 0x18, 0x1c]);
    tablePointers();
  });

test('W638 all eight object-11 streams retain exact packaged cartridge geometry',
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
        [MASK_WORDS, ...EXTENTS[index].slice(0, 2), 2596, EXTENTS[index][2]],
        `$${offset.toString(16)} retains its complete cartridge extent`,
      );
      assert.ok(offset + extent.stride <= local.sprmask.length,
        `$${offset.toString(16)} mask extent remains in the assembled ROM`);
      assert.ok(extent.colStart + extent.colWords <= local.sprcol.length,
        `$${offset.toString(16)} colour extent remains in the assembled ROM`);
      colourWords += extent.colWords;

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.equal(hit[2], 11, `$${offset.toString(16)} keeps structure-shard ownership`);
      assert.equal(hit[1], MASK_WORDS,
        `$${offset.toString(16)} packs its complete mask extent`);
      assert.ok(hit[0] >= shard.maskFrom
        && hit[0] + hit[1] <= shard.maskFrom + shard.maskLen,
      `$${offset.toString(16)} fits the packed structure-shard mask geometry`);

      const packedMaskAt = hit[0] - shard.maskFrom;
      assert.deepEqual(
        packedMask.subarray(packedMaskAt + 2, packedMaskAt + MASK_WORDS),
        local.sprmask.subarray(offset + 2, offset + MASK_WORDS),
        `$${offset.toString(16)} packed mask body matches cartridge words`,
      );

      const packedColBase = colourBase(packedMask, packedMaskAt);
      assert.equal(packedMask[packedMaskAt] & 3, 0,
        `$${offset.toString(16)} rebased colour pointer has zero discarded bits`);
      assert.ok(packedColBase >= shard.colFrom
        && packedColBase + extent.colWords <= shard.colFrom + shard.colLen,
      `$${offset.toString(16)} packed colour payload remains in the structure shard`);
      const packedColAt = packedColBase - shard.colFrom;
      assert.deepEqual(
        packedCol.subarray(packedColAt, packedColAt + extent.colWords),
        local.sprcol.subarray(extent.colStart, extent.colStart + extent.colWords),
        `$${offset.toString(16)} packed colour payload matches cartridge words`,
      );
    }
    assert.equal(colourWords, 53688,
      'the eight arrival frames retain their exact contiguous colour union');
    assert.equal(EXTENTS[0][0], 0x1e786a);
    assert.equal(EXTENTS.at(-1)[0] + EXTENTS.at(-1)[1], 0x1f4a22);

    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$29F478'), {
      shard: 11, at: '$29F478', entries: 8, stride: 4, distinct: 8,
      runsTo: 8, endsAt: '$29F498', added: 8, already: 0,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [853, 1192370, 3327007]);
  });

test('W638 all eight object-11 requests reach the packed draw path',
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
