// W635: export the complete late HUD item/extend-row phase family.

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

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const BASE_TABLE = 0x28592c;
const PHASE_TABLE = 0x285954;
const TABLE_END = 0x28595c;
const BASE_COUNT = 10;
const BIASES = Object.freeze([0x000, 0x208, 0x410]);
const STREAM_COUNT = BASE_COUNT * BIASES.length;
const RAW_STREAM_WORDS = 0x34;
const REQUEST_SIZE = 0x0610;
const MASK_WORDS = 50;
const TARGET = 0x1cdf68;
const required = [
  IMAGE,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'spr', 'streams.u32.gz'),
  path.join(ASSETS, 'spr', 'mask.shard17.u16.gz'),
  path.join(ASSETS, 'spr', 'col.shard17.u16.gz'),
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

function cartridgeFamily() {
  assert.equal(BASE_TABLE + BASE_COUNT * 4, PHASE_TABLE,
    'the ten-long late table closes exactly on the phase-word table');
  assert.equal(PHASE_TABLE + 4 * 2, TABLE_END,
    'the four phase words close exactly on the adjacent suffix table');
  const bases = Array.from({ length: BASE_COUNT }, (_, index) =>
    IMG.readUInt32BE(BASE_TABLE + index * 4) & 0x7fffff);
  const phaseWords = Array.from({ length: 4 }, (_, index) =>
    IMG.readUInt16BE(PHASE_TABLE + index * 2));
  assert.deepEqual(phaseWords, [0x000, 0x410, 0x208, 0x410],
    'the producer has three unique reachable phase biases and one $410 alias');
  assert.deepEqual([...new Set(phaseWords)].sort((a, b) => a - b), BIASES);
  return {
    bases,
    requested: BIASES.flatMap((bias) => bases.map((base) => base + bias)),
  };
}

test('W635 all thirty late item-row streams retain exact packaged cartridge geometry',
  { skip: SKIP }, async () => {
    const { bases, requested } = cartridgeFamily();
    assert.deepEqual(bases, [
      0x1cdb24, 0x1cdb58, 0x1cdb8c, 0x1cdbc0, 0x1cdbf4,
      0x1cdc28, 0x1cdc5c, 0x1cdc90, 0x1cdcc4, 0x1cdcf8,
    ]);
    assert.deepEqual([requested.length, new Set(requested).size],
      [STREAM_COUNT, STREAM_COUNT]);
    assert.deepEqual([requested[0], requested.at(-1)], [0x1cdb24, 0x1ce108]);
    for (let index = 1; index < requested.length; index++) {
      assert.equal(requested[index] - requested[index - 1], RAW_STREAM_WORDS,
        `effective stream ${index} follows the complete prior raw stream`);
    }
    assert.equal(bases[1] + BIASES[2], TARGET,
      'digit 1 plus the late $410 phase reproduces the cold-campaign request');

    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const local = regions();
    const shard = b.manifest.spr.shards[17];
    const packedMask = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'mask.shard17.u16.gz'))));
    const packedCol = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'col.shard17.u16.gz'))));
    assert.deepEqual([packedMask.length, packedCol.length], [shard.maskLen, shard.colLen]);

    const colourRanges = [];
    let colourWords = 0;
    for (const offset of requested) {
      const extent = streamExtent(local.sprmask, local.sprcol.length, offset);
      assert.equal(extent.maskWords, MASK_WORDS,
        `$${offset.toString(16)} has the complete 3 by 16 packed mask extent`);
      assert.ok(offset + RAW_STREAM_WORDS <= local.sprmask.length,
        `$${offset.toString(16)} raw mask extent remains in the assembled ROM`);
      assert.ok(extent.colStart + extent.colWords <= local.sprcol.length,
        `$${offset.toString(16)} colour extent remains in the assembled ROM`);
      colourWords += extent.colWords;
      colourRanges.push([extent.colStart, extent.colStart + extent.colWords]);

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.equal(hit[2], 17, `$${offset.toString(16)} keeps shard 17 ownership`);
      assert.equal(hit[1], MASK_WORDS,
        `$${offset.toString(16)} packs its complete mask extent`);
      assert.ok(hit[0] >= shard.maskFrom
        && hit[0] + hit[1] <= shard.maskFrom + shard.maskLen,
      `$${offset.toString(16)} fits the packed shard mask geometry`);

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
      `$${offset.toString(16)} packed colour payload remains in shard 17`);
      const packedColAt = packedColBase - shard.colFrom;
      assert.deepEqual(
        packedCol.subarray(packedColAt, packedColAt + extent.colWords),
        local.sprcol.subarray(extent.colStart, extent.colStart + extent.colWords),
        `$${offset.toString(16)} packed colour payload matches cartridge words`,
      );
    }
    assert.equal(colourWords, 3323,
      'the thirty late item-row frames retain their exact colour-word total');
    colourRanges.sort((a, b2) => a[0] - b2[0]);
    assert.equal(colourRanges[0][0], 0x3d92e1,
      'the contiguous colour union begins exactly at $3D92E1');
    for (let index = 1; index < colourRanges.length; index++) {
      assert.equal(colourRanges[index][0], colourRanges[index - 1][1],
        `colour range ${index} starts exactly where the prior range ends`);
    }
    assert.equal(colourRanges.at(-1)[1], 0x3d9fdc,
      'the contiguous colour union closes exactly at $3D9FDC');

    const targetExtent = streamExtent(local.sprmask, local.sprcol.length, TARGET);
    assert.deepEqual(
      [targetExtent.colStart, targetExtent.colStart + targetExtent.colWords],
      [0x3d9c8b, 0x3d9cdc],
      'the observed target retains its exact 81-word colour extent');
    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$28592C'), {
      shard: 17, at: '$28592C', entries: 10, stride: 4, distinct: 30,
      runsTo: 10, endsAt: '$285954', added: 30, already: 0,
      promoted: 0, promotedFrom: [],
    });
    assert.equal(b.manifest.spr.streamCount, 6190);
    assert.equal(b.manifest.spr.maskUsed, 2993108);
    assert.equal(b.manifest.spr.colUsed, 7454936);
    assert.equal(shard.streams, 1783);
    assert.equal(shard.maskLen, 927494);
    assert.equal(shard.colLen, 2318852);
  });

test('W635 the cold-campaign $1CDF68 request reaches the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    const { bases } = cartridgeFamily();
    const offset = bases[1] + BIASES[2];
    assert.equal(offset, TARGET);
    ram.setU16(RAM.spriteList + 4, (offset >>> 16) & 0x7f);
    ram.setU16(RAM.spriteList + 6, offset & 0xffff);
    ram.setU16(RAM.spriteList + 8, REQUEST_SIZE);

    const result = portSpriteList(ram, packed, { shardReady: () => true });
    assert.deepEqual([
      result.records, result.drawn, result.skipped,
      result.missing.size, result.pending.size,
    ], [1, 1, 0, 0, 0]);
    const base = packed.get(offset)[0];
    assert.equal(result.words[2] & 0x7f, (base >>> 16) & 0x7f);
    assert.equal(result.words[3], base & 0xffff);
  });
