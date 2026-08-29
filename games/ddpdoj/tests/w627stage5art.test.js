// W627: complete late-game art families, Stage 5 terrain, and Hibachi A2 object 18.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { HIBACHI_A2, a2Object18_2A4DE0 } from '../src/hibachiend.js';
import { RAM } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import {
  SPRCOL_LAYOUT, SPRMASK_LAYOUT, loadRegions,
} from '../src/render/regions.js';
import { colourBase, streamExtent } from '../src/render/spritedir.js';
import { bgTile } from '../src/render/tiles.js';
import { RomWindows } from '../src/rom.js';
import { scriptAddresses } from '../src/scheduler.js';
import {
  BUCKETS, RECORD_BYTES, encodeRegisterRequest,
} from '../src/spritequeue.js';
import { loadBundle } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_BYTES, ROM_WINDOW_COUNT,
  overlappingPairs, tableBeforeW627,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const required = [
  IMAGE, TABLES, path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'spr', 'streams.u32.gz'),
  path.join(ASSETS, 'spr', 'mask.shard17.u16.gz'),
  path.join(ASSETS, 'spr', 'col.shard17.u16.gz'),
  ...[...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT].map(([name]) => path.join(ROM_DIR, name)),
];
const SKIP = required.every(existsSync) ? false
  : 'exact program, generated tables, web bundle, or local graphics ROMs absent. '
    + 'This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);

const FAMILIES = Object.freeze([
  Object.freeze([0x269246, 4, 4]),
  Object.freeze([0x27100c, 8, 4]),
  Object.freeze([0x2a4c36, 3, 4]),
  Object.freeze([0x2a4c6c, 24, 6]),
  Object.freeze([0x2a4d3e, 8, 4]),
  Object.freeze([0x2a4e16, 16, 4]),
]);
const HELICOPTER_FAMILIES = Object.freeze([
  Object.freeze({
    name: 'type $05',
    tables: Object.freeze([
      Object.freeze([0x269e48, 32, 4]),
      Object.freeze([0x269ec8, 32, 4]),
      Object.freeze([0x269bb6, 4, 4]),
    ]),
  }),
  Object.freeze({
    name: 'late Stage 5',
    tables: Object.freeze([
      Object.freeze([0x272c7a, 32, 4]),
      Object.freeze([0x272cfa, 32, 4]),
      Object.freeze([0x269246, 4, 4]),
    ]),
  }),
]);
const PHASE = BUCKETS[1];
const SUB = 0x814800;

const pointers = (families) => families.flatMap(([base, count, stride]) =>
  Array.from({ length: count }, (_, index) =>
    IMG.readUInt32BE(base + index * stride) & 0x7fffff));
const bytes = (ram, base, length) =>
  Array.from({ length }, (_, offset) => ram.u8(base + offset));
const faultAt = (address) => (error) => error?.romAddress === address;
const windowShape = (tables) => tables.rom.windows.map((window) => [
  Number.parseInt(window.base.slice(1), 16), window.len,
]);

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

test('W627 all 63 requested streams map in packaged and asset-free geometry',
  { skip: SKIP }, async () => {
    const requested = pointers(FAMILIES);
    assert.deepEqual([requested.length, new Set(requested).size], [63, 63]);

    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));
    const local = regions();
    const shard = b.manifest.spr.shards[17];
    const packedMask = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'mask.shard17.u16.gz'))));
    const packedCol = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'spr', 'col.shard17.u16.gz'))));
    assert.deepEqual([packedMask.length, packedCol.length], [shard.maskLen, shard.colLen]);

    for (const offset of requested) {
      const extent = streamExtent(local.sprmask, local.sprcol.length, offset);
      assert.ok(offset + extent.maskWords <= local.sprmask.length,
        `local mask extent for $${offset.toString(16)} is in the assembled ROM`);
      assert.ok(extent.colStart + extent.colWords <= local.sprcol.length,
        `local colour extent for $${offset.toString(16)} is in the assembled ROM`);

      const hit = packed.get(offset);
      assert.ok(hit, `$${offset.toString(16)} exists in romToPackedMap()`);
      assert.equal(hit[2], 17, `$${offset.toString(16)} keeps natural shard 17 ownership`);
      assert.equal(hit[1], extent.maskWords,
        `$${offset.toString(16)} packs its complete local mask extent`);
      assert.ok(hit[0] >= shard.maskFrom
        && hit[0] + hit[1] <= shard.maskFrom + shard.maskLen,
      `$${offset.toString(16)} fits the packed shard mask geometry`);

      const packedMaskAt = hit[0] - shard.maskFrom;
      assert.deepEqual(
        packedMask.subarray(packedMaskAt + 2, packedMaskAt + extent.maskWords),
        local.sprmask.subarray(offset + 2, offset + extent.maskWords),
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
  });

test('W627 all 136 type $05 and late Stage 5 helicopter streams still draw',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const packed = romToPackedMap(b.manifest, b.spr.shardOfBase.bind(b.spr));

    for (const family of HELICOPTER_FAMILIES) {
      const streams = pointers(family.tables);
      assert.deepEqual([streams.length, new Set(streams).size], [68, 68], family.name);

      for (const offset of streams) {
        const ram = new Ram();
        ram.setU16(RAM.spriteList + 4, (offset >>> 16) & 0x7f);
        ram.setU16(RAM.spriteList + 6, offset & 0xffff);
        ram.setU16(RAM.spriteList + 8, 0x0201); // one mask block by one row
        const result = portSpriteList(ram, packed, { shardReady: () => true });
        assert.deepEqual([
          result.records, result.drawn, result.skipped,
          result.missing.size, result.pending.size,
        ], [1, 1, 0, 0, 0],
        `${family.name} $${offset.toString(16)} reaches the packed draw path`);
        const base = packed.get(offset)[0];
        assert.equal(result.words[2] & 0x7f, (base >>> 16) & 0x7f);
        assert.equal(result.words[3], base & 0xffff);
      }
    }
  });

test('W627 every tile in all 252 Stage 5 columns resolves in packaged shard 11',
  { skip: SKIP }, async () => {
    const b = await bundle();
    const meta = b.manifest.gfx.bg.shards[11];
    assert.deepEqual({ kind: meta.kind, cols: meta.cols, tiles: meta.tiles },
      { kind: 'stage5', cols: [0, 251], tiles: 2268 });
    await b.bg.fetch(11);
    assert.equal(b.bg.state[11], 'ready');
    const local = regions();
    const tileBytes = b.sheets.bg.tileBytes;

    const seenTiles = new Set();
    const seenSlots = new Set();
    const resolvedByColumn = [];
    for (let column = 0; column < 252; column++) {
      let resolved = 0;
      for (let row = 0; row < 9; row++) {
        const at = 0x22d770 + column * 36 + row * 4;
        const tile = (((IMG.readUInt32BE(at) >>> 16) + 0x26a9) & 0xffff);
        seenTiles.add(tile);
        assert.equal(b.bg.shardOfTile[tile], 11,
          `column ${column} row ${row} belongs to Stage 5 shard 11`);
        const slot = b.sheets.bg.slot[tile];
        assert.ok(slot >= meta.firstSlot && slot < meta.firstSlot + meta.tiles,
          `column ${column} row ${row} resolves to a loaded packaged slot`);
        seenSlots.add(slot);
        assert.deepEqual(
          b.sheets.bg.pixels.subarray(slot * tileBytes, (slot + 1) * tileBytes),
          bgTile(local, tile),
          `column ${column} row ${row} tile $${tile.toString(16)} matches decoded pixels`,
        );
        resolved++;
      }
      resolvedByColumn.push(resolved);
    }
    assert.deepEqual(new Set(resolvedByColumn), new Set([9]));
    assert.deepEqual([seenTiles.size, seenSlots.size], [2268, 2268]);
    assert.deepEqual([
      Math.min(...seenTiles), Math.max(...seenTiles),
    ], [0x26aa, 0x2f85]);
  });

test('W627 object 18 has one exact data window and one registered script',
  { skip: SKIP }, () => {
    assert.deepEqual([
      HIBACHI_A2.object18, HIBACHI_A2.object18CodeEnd,
      HIBACHI_A2.object18Art, HIBACHI_A2.object18ArtFrames,
    ], [0x2a4de0, 0x2a4e14, 0x2a4e16, 16]);
    assert.equal(scriptAddresses().filter((address) =>
      address === HIBACHI_A2.object18).length, 1);

    const additions = TABLE_JSON.rom.windows.filter((window) =>
      window.why.startsWith('W627:'));
    assert.deepEqual(additions.map(({ base, len }) => [base, len]), [
      ['$2A4E16', 0x0040],
    ]);
    assert.deepEqual(ROM.bytes(HIBACHI_A2.object18Art, 0x40),
      Array.from(IMG.subarray(HIBACHI_A2.object18Art, 0x2a4e56)));
    assert.throws(() => ROM.u8(HIBACHI_A2.object18), faultAt(HIBACHI_A2.object18));
    assert.throws(() => ROM.u32(0x2a4e54), faultAt(0x2a4e54),
      'a long read cannot cross the exact table end');

    const prior = tableBeforeW627(TABLE_JSON, { preserveContinue: true });
    assert.deepEqual([
      TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(TABLE_JSON)),
    ], [ROM_WINDOW_COUNT, ROM_WINDOW_BYTES, ROM_OVERLAP_PAIRS]);
    assert.deepEqual([
      prior.rom.windows.length,
      prior.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(prior)),
    ], [ROM_WINDOW_COUNT - 1, ROM_WINDOW_BYTES - 0x40, ROM_OVERLAP_PAIRS]);
    assert.deepEqual(tableBeforeW627(prior, { preserveContinue: true }), prior,
      'the exact additive migration is idempotent');
  });

test('W627 object 18 gate and all signed selectors emit exact register requests',
  { skip: SKIP }, () => {
    const gated = new Ram();
    gated.setU32(SUB + 0x02, 0x1234f800);
    gated.setU16(SUB + 0x138, 0x003c);
    gated.setU8(SUB + 0x0ee, 0x7a);
    const before = Uint8Array.from(gated.b);
    const poison = { u32: () => { throw new Error('gate read art'); } };
    assert.doesNotThrow(() =>
      a2Object18_2A4DE0(gated, poison, { bossSubRec: SUB }));
    assert.deepEqual(gated.b, before, 'a zero gate reads no art and writes no queue byte');

    const ram = new Ram();
    const position = 0x1234f800;
    ram.setU16(0x80390c, 1);
    ram.setU32(SUB + 0x02, position);
    ram.setU8(SUB + 0x0ee, 0x7a);
    const d1 = (position + 0xff800000 + 0xf000f800) >>> 0;
    for (let index = 0; index < 16; index++) {
      const selector = index * 4;
      const art = IMG.readUInt32BE(HIBACHI_A2.object18Art + selector);
      ram.setU16(SUB + 0x138, selector);
      a2Object18_2A4DE0(ram, ROM, { bossSubRec: SUB });
      assert.deepEqual(bytes(ram, PHASE.buffer + index * RECORD_BYTES, RECORD_BYTES),
        [...encodeRegisterRequest(d1, art, 0x1040, 0x7a)],
        `selector $${selector.toString(16)} carries exact art, position, attr, and palette`);
    }
    assert.equal(ram.u16(PHASE.counter), 16 * RECORD_BYTES);

    const counter = ram.u16(PHASE.counter);
    ram.setU16(SUB + 0x138, 0xfffc);
    assert.throws(() => a2Object18_2A4DE0(ram, ROM, { bossSubRec: SUB }),
      faultAt(HIBACHI_A2.object18Art - 4), 'the selector is signed');
    assert.equal(ram.u16(PHASE.counter), counter, 'the signed data fault happens before enqueue');
  });
