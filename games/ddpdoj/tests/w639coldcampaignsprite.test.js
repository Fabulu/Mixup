// W639: close the Stage-4 boss pod overlay table on its reachable $20 row.

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
import { a3Ramp } from '../src/boss4.js';
import { SCHED } from '../src/scheduler.js';
import { loadBundle } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const TABLE_START = 0x29f356;
const TABLE_END = 0x29f37a;
const REQUEST_SIZE = 0x0620;
const POINTERS = Object.freeze([
  0x0e80d4, 0x0e8138, 0x0e819c, 0x0e8200, 0x0e8264,
  0x0e82c8, 0x0e832c, 0x0e8390, 0x0e83f4,
]);
const EXTENTS = Object.freeze([
  [0x1cd379, 268, 802],
  [0x1cd485, 262, 784],
  [0x1cd58b, 262, 784],
  [0x1cd691, 262, 784],
  [0x1cd797, 262, 784],
  [0x1cd89d, 262, 784],
  [0x1cd9a3, 262, 784],
  [0x1cdaa9, 262, 784],
  [0x1cdbaf, 272, 815],
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
    'the nine-entry shared overlay table closes exactly on object 8');
  const requested = Array.from({ length: POINTERS.length }, (_, index) =>
    IMG.readUInt32BE(TABLE_START + index * 4) & 0x7fffff);
  assert.deepEqual(requested, POINTERS);
  assert.equal(new Set(requested).size, POINTERS.length);
  return requested;
}

function rampCursors(initAddress, cursorOffset, id) {
  const ram = new Ram();
  const boss = 0x81b732;
  const slot = SCHED.a3Base;
  const seen = [ram.u16(boss + cursorOffset)];
  ram.setU16(slot, 0x8000 | id);
  const ramp = a3Ramp(initAddress);
  ramp.init(ram, null, { bossSubRec: boss }, slot);
  let previous = seen[0];
  for (let frame = 1; ram.u16(slot) !== 0; frame++) {
    const cursor = ram.u16(boss + cursorOffset);
    if (cursor !== previous) {
      seen.push(cursor);
      previous = cursor;
    }
    assert.ok(frame < 20, `A3 ${id} reaches its cartridge limit`);
    ramp.step(ram, null, { bossSubRec: boss }, slot);
  }
  const cursor = ram.u16(boss + cursorOffset);
  if (cursor !== previous) seen.push(cursor);
  return seen;
}

test('W639 both pod ramps reach all nine shared-overlay rows', { skip: SKIP }, () => {
  const cursors = [
    rampCursors(0x2a1506, 0x88, 5),
    rampCursors(0x2a1562, 0xa8, 7),
  ];
  const expected = Array.from({ length: 9 }, (_, index) => index * 4);
  assert.deepEqual(cursors, [expected, expected]);
  assert.equal(expected.at(-1), 0x20,
    'both visible pod cursors select the ninth longword before retiring');

  assert.equal(Buffer.from(IMG.subarray(0x29f2de, 0x29f336)).toString('hex'),
    '41fa00564e71d0ee00862410222e00820681f000f800363c1040382e009c182e014c4eb90023defc41fa004e4e71d0ee00882410222e00820681fa00fc000681f9400200363c0620382e009c182e014c4ef90023defc4e71',
    'object 7 indexes ($88,A6) into $29F356 and requests $0620');
  assert.equal(Buffer.from(IMG.subarray(0x29f37a, 0x29f3d0)).toString('hex'),
    '41fa00544e71d0ee00a62410222e00a20681f000f800363c1040382e00bc182e014d4eb90023defc41faffb2d0ee00a82410222e00a20681fa00fc000681f93ffe40363c0620382e00bc182e014c4ef90023defc4e71',
    'object 8 indexes ($A8,A6) into the same table and requests $0620');
  tablePointers();
});

test('W639 all nine shared-overlay streams retain exact packaged cartridge geometry',
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
        [98, ...EXTENTS[index].slice(0, 2), 100, EXTENTS[index][2]],
        `$${offset.toString(16)} retains its complete cartridge extent`,
      );
      colourWords += extent.colWords;

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.deepEqual(hit.slice(1), [98, 11],
        `$${offset.toString(16)} keeps complete structure-shard ownership`);
      const packedMaskAt = hit[0] - shard.maskFrom;
      assert.ok(packedMaskAt >= 0 && packedMaskAt + 98 <= shard.maskLen);
      assert.deepEqual(
        packedMask.subarray(packedMaskAt + 2, packedMaskAt + 98),
        local.sprmask.subarray(offset + 2, offset + 98),
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
    assert.equal(colourWords, 2374,
      'the complete nine-frame family retains its exact contiguous colour union');
    assert.equal(EXTENTS[0][0], 0x1cd379);
    assert.equal(EXTENTS.at(-1)[0] + EXTENTS.at(-1)[1], 0x1cdcbf);

    assert.deepEqual(b.manifest.spr.harvest.find((row) => row.at === '$29F356'), {
      shard: 11, at: '$29F356', entries: 9, stride: 4, distinct: 9,
      runsTo: 9, endsAt: '$29F37A', added: 9, already: 0,
      promoted: 0, promotedFrom: [],
    });
    assert.deepEqual(
      [b.manifest.spr.streamCount, b.manifest.spr.maskUsed, b.manifest.spr.colUsed],
      [6190, 2993108, 7454936],
    );
    assert.deepEqual([shard.streams, shard.maskLen, shard.colLen],
      [853, 1192370, 3327007]);
  });

test('W639 all nine shared-overlay requests reach the packed draw path',
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
    ], [9, 9, 0, 0, 0, 0]);
    for (let index = 0; index < requested.length; index++) {
      const base = packed.get(requested[index])[0];
      const word = index * 5;
      assert.equal(result.words[word + 2] & 0x7f, (base >>> 16) & 0x7f);
      assert.equal(result.words[word + 3], base & 0xffff);
      assert.equal(result.words[word + 4], REQUEST_SIZE);
    }
  });
