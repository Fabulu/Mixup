// W643: export the complete slot-7 loop-choice menu intro sprite family.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { RAM } from '../src/machine.js';
import { POOL7, SCRIPT7 } from '../src/objslot7pool.js';
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
const LIST_START = 0x291396;
const SCRIPT_START = 0x29139e;
const SCRIPT_END = 0x291470;
const INTRO_HASH = '6bce608701378f07dc56b0f0bc9b0ad5e663cbe99bec2537bf91b29e7fd0c3f2';
const MASK_WORDS = 34;
const RAW_STRIDE = 0x24;
const OPCODE_WIDTHS = Object.freeze({
  0x8000: 4,
  0x8001: 6,
  0x8002: 4,
  0x8003: 4,
  0x8005: 6,
});
const EXPECTED_STREAMS = Object.freeze([
  0x1eb380, 0x1eb608, 0x1eb3a4, 0x1eb314, 0x1eb5c0, 0x1eb62c, 0x1ecc1c,
  0x1ece14, 0x1ec94c, 0x1eb530, 0x1ec124, 0x1eb770, 0x1eb284, 0x1eb59c,
  0x1ec1d8, 0x1ec340, 0x1ecbd4, 0x1ec094, 0x1eb578, 0x1eb728, 0x1eb2f0,
  0x1eb23c, 0x1eb47c, 0x1eb848, 0x1eb698, 0x1eb4c4, 0x1eb50c, 0x1eb260,
  0x1eb410, 0x1ea840, 0x1eb458, 0x1eb800, 0x1ebba8, 0x1ebd10, 0x1eb8d8,
  0x1eb3c8, 0x1eb2cc, 0x1ea918, 0x1eb2a8,
]);
const MENU_ONLY = Object.freeze(new Map([
  [0x1ea840, 0x40e25d],
  [0x1ea918, 0x40e65f],
  [0x1eb578, 0x412127],
  [0x1ec124, 0x415898],
]));
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

function menuIntroFamily() {
  assert.deepEqual([
    IMG.readUInt32BE(LIST_START), IMG.readUInt32BE(LIST_START + 4),
  ], [SCRIPT_START, 0xffffffff],
  'the loop-choice menu list contains exactly the $29139E intro script');
  assert.equal(createHash('sha256').update(IMG.subarray(SCRIPT_START, SCRIPT_END))
    .digest('hex'), INTRO_HASH, 'the exact cartridge intro bytecode is unchanged');

  const occurrences = [];
  let at = SCRIPT_START;
  for (;;) {
    const word = IMG.readUInt16BE(at);
    if (word === SCRIPT7.END) {
      at += 2;
      break;
    }
    if ((word & 0x8000) === 0) {
      occurrences.push({
        index: word,
        stream: IMG.readUInt32BE(SCRIPT7.spawnTable + word * 4) & 0x7fffff,
      });
      at += 2;
      continue;
    }
    const width = OPCODE_WIDTHS[word];
    assert.notEqual(width, undefined,
      `opcode $${word.toString(16)} at $${at.toString(16)} has an exact width`);
    at += width;
  }

  assert.equal(at, SCRIPT_END, 'the terminator closes exactly before $291470 code');
  assert.equal(occurrences.length, 50, 'the script emits fifty picture occurrences');
  const streams = [...new Set(occurrences.map(({ stream }) => stream))];
  assert.deepEqual(streams, EXPECTED_STREAMS,
    'the authentic spawn-table walk resolves all 39 streams in first-use order');
  assert.deepEqual(occurrences.filter(({ stream }) => MENU_ONLY.has(stream))
    .map(({ index, stream }) => [index, stream]), [
    [0x00b3, 0x1ec124],
    [0x0060, 0x1eb578],
    [0x0002, 0x1ea840],
    [0x0008, 0x1ea918],
  ], 'the four menu-only spawn indices are reached by the production script');
  return streams;
}

test('W643 the exact menu-intro script owns fifty uses of thirty-nine streams',
  { skip: SKIP }, () => {
    assert.equal(SCRIPT7.spawnTable, 0x2902c2);
    assert.equal(POOL7.drawAttr, 0x0410);
    menuIntroFamily();
  });

test('W643 all thirty-nine menu-intro streams retain exact packaged cartridge data',
  { skip: SKIP }, async () => {
    const requested = menuIntroFamily();
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const local = regions();
    const shard = b.manifest.spr.shards[17];
    const packedMask = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'mask.shard17.u16.gz'))));
    const packedCol = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'col.shard17.u16.gz'))));
    assert.deepEqual([packedMask.length, packedCol.length], [shard.maskLen, shard.colLen]);

    let maskWords = 0;
    let colourWords = 0;
    for (const offset of requested) {
      const extent = streamExtent(local.sprmask, local.sprcol.length, offset);
      assert.deepEqual(
        [extent.maskWords, extent.colWords, extent.stride, extent.pixels],
        [MASK_WORDS, 171, RAW_STRIDE, 512],
        `$${offset.toString(16)} retains its complete cartridge extent`,
      );
      maskWords += extent.maskWords;
      colourWords += extent.colWords;
      if (MENU_ONLY.has(offset)) {
        assert.equal(extent.colStart, MENU_ONLY.get(offset),
          `$${offset.toString(16)} retains its exact menu-only colour address`);
      }

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
    assert.deepEqual([maskWords, colourWords], [1326, 6669]);

    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$291396'), {
      shard: 17, at: '$291396', entries: 50, stride: 0, distinct: 39,
      runsTo: 1, endsAt: '$291470', added: 4, already: 35,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [1783, 927494, 2318852]);
  });

test('W643 all thirty-nine menu-intro requests reach the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    const requested = menuIntroFamily();
    for (let index = 0; index < requested.length; index++) {
      const record = RAM.spriteList + index * 10;
      const offset = requested[index];
      ram.setU16(record + 4, (offset >>> 16) & 0x7f);
      ram.setU16(record + 6, offset & 0xffff);
      ram.setU16(record + 8, POOL7.drawAttr);
    }

    const result = portSpriteList(ram, packed, { shardReady: () => true });
    assert.deepEqual([
      result.records, result.drawn, result.skipped, result.blank,
      result.missing.size, result.pending.size,
    ], [39, 39, 0, 0, 0, 0]);
    for (let index = 0; index < requested.length; index++) {
      const base = packed.get(requested[index])[0];
      const word = index * 5;
      assert.equal(result.words[word + 2] & 0x7f, (base >>> 16) & 0x7f);
      assert.equal(result.words[word + 3], base & 0xffff);
      assert.equal(result.words[word + 4], POOL7.drawAttr);
    }
  });
