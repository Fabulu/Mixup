// W645: export the complete P2 continue-label flash sprite family.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { HUD, hyperFlash285FA6 } from '../src/hud.js';
import { RAM } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import {
  SPRCOL_LAYOUT, SPRMASK_LAYOUT, loadRegions,
} from '../src/render/regions.js';
import { colourBase, streamExtent } from '../src/render/spritedir.js';
import { BUCKETS } from '../src/spritequeue.js';
import { loadBundle } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const TABLE_START = 0x287eca;
const TABLE_END = 0x287f7a;
const TABLE_ENTRIES = 44;
const TABLE_HASH = '4b3606666dd52c7353e257ef1306082a8a3c5ab231ae8ae9e5745ebd178de6e1';
const CURSOR_HASH = '8d2a5170df03643b2e10de9cc9596e32da0ff6e33cf7dcabcd398665e2bbe685';
const P2_GATE_HASH = '2b6fbb33cb8457556cc3507039f9c54b2f3b6f5db2541abb915e065ee18c674a';
const MASK_WORDS = 98;
const RAW_STRIDE = 0x64;
const REQUEST_SIZE = 0x0430;
const B25 = BUCKETS[25];
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

function hash(start, end) {
  return createHash('sha256').update(IMG.subarray(start, end)).digest('hex');
}

function cartridgeFamily() {
  assert.equal(TABLE_START + TABLE_ENTRIES * 4, TABLE_END,
    '44 longwords end exactly on the adjacent credit-suffix TX table');
  assert.equal(hash(TABLE_START, TABLE_END), TABLE_HASH,
    'the exact cartridge pointer table is unchanged');
  const requested = Array.from({ length: TABLE_ENTRIES }, (_, index) =>
    IMG.readUInt32BE(TABLE_START + index * 4) & 0x7fffff);
  assert.deepEqual([requested.length, new Set(requested).size], [44, 44]);
  assert.deepEqual([requested[0], requested.at(-1)], [0x1d0230, 0x1cf164]);
  for (let index = 1; index < requested.length; index++) {
    assert.equal(requested[index - 1] - requested[index], RAW_STRIDE,
      `flash frame ${index} follows the complete prior raw stream`);
  }
  return requested;
}

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

test('W645 the exact P2 gate reaches all 44 continue-label flash frames',
  { skip: SKIP }, () => {
    assert.equal(HUD.cursorTableA, TABLE_START);
    assert.equal(hash(0x285f8a, 0x285fa6), CURSOR_HASH,
      'the cartridge masks the frame cursor to six bits and reads $287ECA');
    assert.equal(hash(0x2846e4, 0x28473c), P2_GATE_HASH,
      'the P2 continue-label arm compares that cursor with the exact $2C duty');
    const requested = cartridgeFamily();
    for (const stream of requested) {
      const ram = new Ram();
      hyperFlash285FA6(ram, {}, {}, 0x64c02800, stream);
      assert.equal(ram.u16(B25.counter), 12, 'one production request enters bucket 25');
      assert.equal(ram.u32(B25.buffer + 4) & 0x7fffff, stream,
        `$${stream.toString(16)} reaches the production sprite producer`);
      assert.equal(ram.u16(B25.buffer + 8), REQUEST_SIZE);
    }
  });

test('W645 all 44 continue-label requests reach the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    const requested = cartridgeFamily();
    for (let index = 0; index < requested.length; index++) {
      const record = RAM.spriteList + index * 10;
      const stream = requested[index];
      ram.setU16(record + 4, (stream >>> 16) & 0x7f);
      ram.setU16(record + 6, stream & 0xffff);
      ram.setU16(record + 8, REQUEST_SIZE);
    }
    const result = portSpriteList(ram, packed, { shardReady: () => true });
    assert.deepEqual([
      result.records, result.drawn, result.skipped, result.blank,
      result.missing.size, result.pending.size,
    ], [44, 44, 0, 0, 0, 0]);
  });

test('W645 all 44 frames retain exact packaged cartridge sprite data',
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

    const extents = [];
    let maskWords = 0;
    let colourWords = 0;
    for (const stream of requested) {
      const extent = streamExtent(local.sprmask, local.sprcol.length, stream);
      assert.deepEqual([extent.maskWords, extent.stride], [MASK_WORDS, RAW_STRIDE],
        `$${stream.toString(16)} retains its complete 2 by 48 mask record`);
      extents.push(extent);
      maskWords += extent.maskWords;
      colourWords += extent.colWords;

      const hit = packed.get(stream);
      assert.ok(hit, `$${stream.toString(16)} exists in romToPackedMap()`);
      assert.deepEqual(hit.slice(1), [MASK_WORDS, 17],
        `$${stream.toString(16)} keeps complete shard-17 ownership`);
      const packedMaskAt = hit[0] - shard.maskFrom;
      assert.ok(packedMaskAt >= 0 && packedMaskAt + MASK_WORDS <= shard.maskLen);
      assert.deepEqual(
        packedMask.subarray(packedMaskAt + 2, packedMaskAt + MASK_WORDS),
        local.sprmask.subarray(stream + 2, stream + MASK_WORDS),
        `$${stream.toString(16)} packed mask body matches cartridge words`,
      );
      if (extent.colWords !== 0) {
        const packedColAt = colourBase(packedMask, packedMaskAt) - shard.colFrom;
        assert.ok(packedColAt >= 0 && packedColAt + extent.colWords <= shard.colLen,
          `$${stream.toString(16)} packed colour range ${packedColAt}..${
            packedColAt + extent.colWords} stays inside shard length ${shard.colLen}`);
        assert.deepEqual(
          packedCol.subarray(packedColAt, packedColAt + extent.colWords),
          local.sprcol.subarray(extent.colStart, extent.colStart + extent.colWords),
          `$${stream.toString(16)} packed colour payload matches cartridge words`,
        );
      }
    }
    assert.deepEqual([maskWords, colourWords], [4312, 4684]);
    for (let index = 1; index < extents.length; index++) {
      assert.equal(extents[index].colStart + extents[index].colWords,
        extents[index - 1].colStart,
        `reverse frame ${index} ends exactly where the prior colour stream begins`);
    }
    assert.deepEqual([
      extents.at(-1).colStart,
      extents[0].colStart + extents[0].colWords,
    ], [0x3dbe0d, 0x3dd059]);

    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$287ECA'), {
      shard: 17, at: '$287ECA', entries: 44, stride: 4, distinct: 44,
      runsTo: 44, endsAt: '$287F7A', added: 44, already: 0,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [1783, 927494, 2318852]);
  });
