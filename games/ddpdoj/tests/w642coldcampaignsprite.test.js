// W642: export both complete sixteen-frame transformed-bullet families.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { RAM } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import { BUL, REC, TYPEBIT } from '../src/bullets.js';
import { BULLET_DRIVER, runBulletDriver } from '../src/bulletdriver.js';
import { MOVER } from '../src/mover.js';
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
const REQUEST_SIZE = 0x0410;
const MASK_WORDS = 34;
const RAW_STRIDE = 0x24;
const FAMILIES = Object.freeze([
  Object.freeze({ kind: 3, base: 0x1c1418, end: 0x1c1658 }),
  Object.freeze({ kind: 0, base: 0x1c1658, end: 0x1c1898 }),
]);
const required = [
  IMAGE,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'spr', 'streams.u32.gz'),
  path.join(ASSETS, 'spr', 'mask.shard7.u16.gz'),
  path.join(ASSETS, 'spr', 'col.shard7.u16.gz'),
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

function cartridgeFamilies() {
  const requested = [];
  for (const family of FAMILIES) {
    assert.equal(family.base + 16 * RAW_STRIDE, family.end,
      `$${family.base.toString(16)} has exactly sixteen cartridge rows`);
    for (let index = 0; index < 16; index++) {
      requested.push(family.base + index * RAW_STRIDE);
    }
  }
  assert.deepEqual([requested.length, new Set(requested).size], [32, 32]);
  return requested;
}

function transformedDraws(kind, familyBase) {
  const ram = new Ram();
  const base = BUL.pool;
  ram.setU16(base, TYPEBIT.alive | kind);
  ram.setU16(base + REC.posA, 0x2000);
  ram.setU16(base + REC.posB, 0x2000);
  ram.setU16(base + REC.velA, 0);
  ram.setU16(base + REC.velB, 0);
  ram.setU32(base + REC.descriptor, 0x11111111);
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0x8000);
  const ctx = { ram, rom: ROM, notes: { note() {} } };

  runBulletDriver(ctx);
  assert.equal(ram.u32(base + REC.descriptor), familyBase + RAW_STRIDE,
    'the transform installs its family base and immediately advances one row');
  const seen = [];
  for (let frame = 1; frame < 16; frame++) {
    const result = runBulletDriver(ctx);
    assert.equal(result.emitted, 1, `transformed frame ${frame} emits one bullet sprite`);
    seen.push(ram.u32(MOVER.spriteBuf + 4) & 0x7fffff);
  }
  assert.equal(ram.u16(base), 0, 'the $10-frame transform lifetime retires the bullet');
  return seen;
}

test('W642 the transform owns two sixteen-row $24-stride sprite families',
  { skip: SKIP }, () => {
    assert.equal(Buffer.from(IMG.subarray(0x281fb4, 0x28200e)).toString('hex'),
      '08d6000566462d7c001c1658000a30160240003fd040d04043faf988d2c022510c690001fffe66082d7c001c1418000a3d7c0410000e2d7cfc00fe0000063d7c00100016e0ee001ee0ee002006ae00000024000a536e00166618',
      'the cartridge selects either base, sets $10 frames, and advances the sprite by $24');
    assert.equal(ROM.u16(ROM.u32(BUL.templatePtrs + 3 * 4) + 0x10), 1,
      'kind 3 selects the $1C1418 override');
    assert.equal(ROM.u16(ROM.u32(BUL.templatePtrs) + 0x10), 0,
      'kind 0 retains the ordinary $1C1658 family');

    const requested = cartridgeFamilies();
    for (const family of FAMILIES) {
      assert.deepEqual(transformedDraws(family.kind, family.base),
        Array.from({ length: 15 }, (_, index) => family.base + (index + 1) * RAW_STRIDE),
        `kind ${family.kind} draws every post-transform row through its exact last frame`);
    }
    assert.equal(requested[1], 0x1c143c,
      'the first advanced row reproduces the cold-campaign request');
  });

test('W642 both transformed-bullet families retain exact packaged cartridge data',
  { skip: SKIP }, async () => {
    const requested = cartridgeFamilies();
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const local = regions();
    const shard = b.manifest.spr.shards[7];
    const packedMask = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'mask.shard7.u16.gz'))));
    const packedCol = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'col.shard7.u16.gz'))));
    assert.deepEqual([packedMask.length, packedCol.length], [shard.maskLen, shard.colLen]);

    const colourRanges = [];
    let colourWords = 0;
    for (const offset of requested) {
      const extent = streamExtent(local.sprmask, local.sprcol.length, offset);
      assert.deepEqual([extent.maskWords, extent.stride], [MASK_WORDS, RAW_STRIDE],
        `$${offset.toString(16)} retains its complete cartridge mask record`);
      colourWords += extent.colWords;
      colourRanges.push([extent.colStart, extent.colStart + extent.colWords]);

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.deepEqual(hit.slice(1), [MASK_WORDS, 7],
        `$${offset.toString(16)} keeps complete bullet-shard ownership`);
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
    assert.equal(colourWords, 1138);
    assert.equal(colourRanges[0][0], 0x3bd8f9);
    for (let index = 1; index < colourRanges.length; index++) {
      assert.equal(colourRanges[index][0], colourRanges[index - 1][1],
        `colour range ${index} starts exactly where the prior range ends`);
    }
    assert.equal(colourRanges.at(-1)[1], 0x3bdd6b);

    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$1BF58C'), {
      shard: 7, at: '$1BF58C', entries: 336, stride: 0, distinct: 336,
      runsTo: 336, endsAt: '$1C23D8', added: 328, already: 8,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [328, 8848, 12035]);
  });

test('W642 all thirty-two transformed-bullet rows reach the packed draw path',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const ram = new Ram();
    const requested = cartridgeFamilies();
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
    ], [32, 32, 0, 0, 0, 0]);
    for (let index = 0; index < requested.length; index++) {
      const base = packed.get(requested[index])[0];
      const word = index * 5;
      assert.equal(result.words[word + 2] & 0x7f, (base >>> 16) & 0x7f);
      assert.equal(result.words[word + 3], base & 0xffff);
      assert.equal(result.words[word + 4], REQUEST_SIZE);
    }
  });
