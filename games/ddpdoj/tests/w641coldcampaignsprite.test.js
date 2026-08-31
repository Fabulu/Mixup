// W641: export the complete early HUD item/extend-row digit family.

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
const JUMP_TABLE = 0x28587c;
const TABLE_START = 0x28588c;
const TABLE_END = 0x28592c;
const REQUEST_SIZE = 0x0610;
const MASK_WORDS = 50;
const RAW_STRIDE = 0x34;
const TARGET = 0x1ccfa0;
const TABLE_BASES = Object.freeze([0x28588c, 0x2858b4, 0x2858dc, 0x285904]);
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
  assert.equal(JUMP_TABLE + TABLE_BASES.length * 4, TABLE_START,
    'the four-entry jump table closes exactly on its first digit table');
  const bases = Array.from({ length: TABLE_BASES.length }, (_, index) =>
    IMG.readUInt32BE(JUMP_TABLE + index * 4));
  assert.deepEqual(bases, TABLE_BASES);
  assert.equal(bases.at(-1) + 10 * 4, TABLE_END,
    'the fourth ten-digit table closes exactly on the separately owned late arm');
  const requested = bases.flatMap((base) =>
    Array.from({ length: 10 }, (_, digit) => IMG.readUInt32BE(base + digit * 4) & 0x7fffff));
  assert.deepEqual([requested.length, new Set(requested).size], [40, 40]);
  assert.deepEqual([requested[0], requested.at(-1)], [0x1ccd64, 0x1cd550]);
  for (let index = 1; index < requested.length; index++) {
    assert.equal(requested[index] - requested[index - 1], RAW_STRIDE,
      `digit stream ${index} follows the complete prior raw stream`);
  }
  return requested;
}

test('W641 the early item-row producer selects four complete ten-digit tables',
  { skip: SKIP }, () => {
    assert.equal(Buffer.from(IMG.subarray(0x2857f2, 0x28581a)).toString('hex'),
      '0c46000c64227a003f06044600036504584560f63c1f41fa007220705000d442d44224302000601e',
      'the cartridge gates at $C, divides the phase by three, and indexes $28587C by 0/4/8/$C');
    const requested = cartridgeFamily();
    assert.equal(requested[11], TARGET,
      'zoom row one and digit one reproduce the cold-campaign request');
  });

test('W641 all forty early item-row streams retain exact packaged cartridge data',
  { skip: SKIP }, async () => {
    const requested = cartridgeFamily();
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
      assert.deepEqual([extent.maskWords, extent.stride], [MASK_WORDS, RAW_STRIDE],
        `$${offset.toString(16)} retains its complete 3 by 16 mask record`);
      colourWords += extent.colWords;
      colourRanges.push([extent.colStart, extent.colStart + extent.colWords]);

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.deepEqual(hit.slice(1), [MASK_WORDS, 17],
        `$${offset.toString(16)} keeps complete shard-17 ownership`);
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
    assert.equal(colourWords, 3251,
      'the complete forty-frame family retains its exact colour-word total');
    assert.equal(colourRanges[0][0], 0x3d7db0);
    for (let index = 1; index < colourRanges.length; index++) {
      assert.equal(colourRanges[index][0], colourRanges[index - 1][1],
        `colour range ${index} starts exactly where the prior range ends`);
    }
    assert.equal(colourRanges.at(-1)[1], 0x3d8a63);

    const targetExtent = streamExtent(local.sprmask, local.sprcol.length, TARGET);
    assert.deepEqual(
      [targetExtent.colStart, targetExtent.colWords, targetExtent.pixels],
      [0x3d80ec, 125, 374],
      'the observed target retains its exact cartridge geometry');
    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$28587C'), {
      shard: 17, at: '$28587C', entries: 4, stride: 4, distinct: 40,
      runsTo: 4, endsAt: '$28592C', added: 40, already: 0,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [1783, 927494, 2318852]);
  });

test('W641 the cold-campaign $1CCFA0 request reaches the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    cartridgeFamily();
    ram.setU16(RAM.spriteList + 4, (TARGET >>> 16) & 0x7f);
    ram.setU16(RAM.spriteList + 6, TARGET & 0xffff);
    ram.setU16(RAM.spriteList + 8, REQUEST_SIZE);

    const result = portSpriteList(ram, packed, { shardReady: () => true });
    assert.deepEqual([
      result.records, result.drawn, result.skipped, result.blank,
      result.missing.size, result.pending.size,
    ], [1, 1, 0, 0, 0, 0]);
    const base = packed.get(TARGET)[0];
    assert.equal(result.words[2] & 0x7f, (base >>> 16) & 0x7f);
    assert.equal(result.words[3], base & 0xffff);
    assert.equal(result.words[4], REQUEST_SIZE);
  });
