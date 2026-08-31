// W634: export the complete HUD item/extend-counter suffix art family.

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
const TABLE_START = 0x28595c;
const TABLE_END = 0x285994;
const STREAM_COUNT = 14;
const RAW_STREAM_WORDS = 0x44;
const REQUEST_SIZE = 0x0420;
const MASK_WORDS = 66;
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

function tablePointers() {
  assert.equal(TABLE_START + STREAM_COUNT * 4, TABLE_END,
    'the fourteen-entry suffix table closes exactly at $285994');
  return Array.from({ length: STREAM_COUNT }, (_, index) =>
    IMG.readUInt32BE(TABLE_START + index * 4) & 0x7fffff);
}

test('W634 all fourteen HUD suffix streams retain exact packaged cartridge geometry',
  { skip: SKIP }, async () => {
    const requested = tablePointers();
    assert.deepEqual([requested.length, new Set(requested).size], [14, 14]);
    assert.equal(requested[0], 0x1ce8e8);
    assert.equal(requested.at(-1), 0x1ce574);
    for (let index = 1; index < requested.length; index++) {
      assert.equal(requested[index - 1] - requested[index], RAW_STREAM_WORDS,
        `suffix entry ${index} remains one complete raw stream behind its predecessor`);
    }

    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const local = regions();
    const shard = b.manifest.spr.shards[17];
    const packedMask = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'mask.shard17.u16.gz'))));
    const packedCol = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'col.shard17.u16.gz'))));
    assert.deepEqual([packedMask.length, packedCol.length], [shard.maskLen, shard.colLen]);

    let colourWords = 0;
    for (const offset of requested) {
      const extent = streamExtent(local.sprmask, local.sprcol.length, offset);
      assert.equal(extent.maskWords, MASK_WORDS,
        `$${offset.toString(16)} has the complete 2 by 32 packed mask extent`);
      assert.ok(offset + RAW_STREAM_WORDS <= local.sprmask.length,
        `$${offset.toString(16)} raw mask extent remains in the assembled ROM`);
      assert.ok(extent.colStart + extent.colWords <= local.sprcol.length,
        `$${offset.toString(16)} colour extent remains in the assembled ROM`);
      colourWords += extent.colWords;

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
    assert.equal(colourWords, 1254,
      'the fourteen suffix frames retain their exact contiguous colour union');
  });

test('W634 the cold-campaign $1CE574 request reaches the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    const requested = tablePointers();
    const offset = requested[13];
    assert.equal(TABLE_START + 13 * 4, 0x285990,
      'suffix lookup byte offset $34 selects the final table entry');
    assert.equal(offset, 0x1ce574);
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
