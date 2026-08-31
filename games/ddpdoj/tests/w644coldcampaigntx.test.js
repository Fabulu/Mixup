// W644: export all complete set-item icon TX families.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { CAM, deferReset } from '../src/background.js';
import { POWER, collect252E9A } from '../src/items.js';
import { Ram } from '../src/ram.js';
import {
  IGS023_LAYOUT, IGS023_SIZE, assemble,
} from '../src/render/regions.js';
import { txTile } from '../src/render/tiles.js';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const TABLE_START = 0x2534e0;
const TABLE_END = 0x2534f8;
const TILE_BYTES = 64;
const TABLE = Object.freeze([
  0x02de000a, 0x0302000a, 0x0326000a,
  0x034a000a, 0x034a000a, 0x034a000a,
]);
const DISTINCT_BASES = Object.freeze([0xc2de, 0xc302, 0xc326, 0xc34a]);
const PRODUCER_HEX = '48e7ff80323c0100780018390081040b601048e7ff80323c0f00780018390081046d303c00087402760b5344d844d84441fa00144e71283040004eb900240dc24cdf01ff4e75';
const required = [
  IMAGE,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'gfx', 'tx.tileno.u16.gz'),
  path.join(ASSETS, 'gfx', 'tx.tiles.u8.gz'),
  ...IGS023_LAYOUT.map(([name]) => path.join(ROM_DIR, name)),
];
const SKIP = required.every(existsSync) ? false
  : 'exact program, web bundle, or local graphics ROMs absent. '
    + 'This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const ROM = SKIP ? null : Object.freeze({
  u32: (address) => IMG.readUInt32BE(address),
});

function u16Body(body) {
  return new Uint16Array(body.buffer, body.byteOffset, body.byteLength >>> 1);
}

function deferredPairs(ram) {
  const pairs = [];
  for (let at = CAM.deferHead; ram.u32(at) !== 0xffffffff; at += 8) {
    pairs.push({ address: ram.u32(at), value: ram.u32(at + 4) });
  }
  return pairs;
}

function expectedTileFamily(base) {
  return Array.from({ length: 36 }, (_, index) => base + index);
}

function driveTarget(target) {
  const ram = new Ram();
  deferReset(ram);
  ram.setU8(POWER.setP1, target);
  ram.setU8(POWER.setTargetP1, target);
  assert.equal(collect252E9A(ram, ROM, {}), false);
  return deferredPairs(ram);
}

let localIgs023;
function igs023() {
  localIgs023 ??= assemble((name) => {
    const body = readFileSync(path.join(ROM_DIR, name));
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }, IGS023_LAYOUT, IGS023_SIZE);
  return localIgs023;
}

test('W644 the exact set-item producer owns six legal target rows',
  { skip: SKIP }, () => {
    assert.equal(Buffer.from(IMG.subarray(0x25349a, TABLE_START)).toString('hex'),
      PRODUCER_HEX,
      'the P1/P2 arms, target indexing, 3 by 12 dimensions, and TX call are unchanged');
    assert.equal(TABLE_START + TABLE.length * 4, TABLE_END,
      'six longwords close exactly where $2534F8 code resumes');
    assert.deepEqual(Array.from({ length: TABLE.length }, (_, index) =>
      IMG.readUInt32BE(TABLE_START + index * 4)), TABLE);
    assert.deepEqual([...new Set(TABLE.map((value) => (value >>> 16) | 0xc000))],
      DISTINCT_BASES,
      'targets four through six deliberately share the saturated fourth picture');
  });

test('W644 every legal target reaches one complete production 3 by 12 TX grid',
  { skip: SKIP }, () => {
    for (let target = 1; target <= 6; target++) {
      const pairs = driveTarget(target);
      const base = (TABLE[target - 1] >>> 16) | 0xc000;
      assert.equal(pairs.length, 36, `target ${target} writes exactly 3 by 12 cells`);
      assert.deepEqual(pairs.map(({ value }) => value >>> 16), expectedTileFamily(base),
        `target ${target} advances through its complete tile family`);
      assert.deepEqual(pairs.map(({ value }) => value & 0xffff),
        Array(36).fill(0x000a), `target ${target} preserves the palette/control word`);
      assert.deepEqual(pairs.map(({ address }) => address),
        Array.from({ length: 36 }, (_, index) => {
          const column = Math.floor(index / 12);
          const row = index % 12;
          return 0x904000 + 0x0100 + row * 0x0100 + 8 - column * 4;
        }), `target ${target} uses the authentic P1 grid destinations`);
    }
  });

test('W644 all four complete families retain exact packaged cartridge tile bytes',
  { skip: SKIP }, () => {
    const manifest = JSON.parse(readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
    const nos = u16Body(gunzipSync(
      readFileSync(path.join(ASSETS, 'gfx', 'tx.tileno.u16.gz'))));
    const pixels = gunzipSync(readFileSync(path.join(ASSETS, 'gfx', 'tx.tiles.u8.gz')));
    assert.equal(manifest.gfx.tx.tiles, 6505);
    assert.deepEqual([nos.length, pixels.length], [6505, 6505 * TILE_BYTES]);
    assert.deepEqual(manifest.gfx.tx.sources.find((row) => row.at === '$2534E0'), {
      at: '$2534E0', entries: 6, name: 'set-item icon rows',
    });

    const slot = new Int32Array(0x10000).fill(-1);
    for (let index = 0; index < nos.length; index++) {
      assert.equal(slot[nos[index]], -1,
        `TX tile $${nos[index].toString(16)} has only one packed slot`);
      slot[nos[index]] = index;
    }
    const requested = DISTINCT_BASES.flatMap(expectedTileFamily);
    assert.deepEqual([requested.length, new Set(requested).size], [144, 144]);
    assert.deepEqual([requested[0], requested.at(-1)], [0xc2de, 0xc36d]);
    for (const tile of requested) {
      const index = slot[tile];
      assert.ok(index >= 0, `TX tile $${tile.toString(16)} is packaged`);
      assert.deepEqual(
        pixels.subarray(index * TILE_BYTES, (index + 1) * TILE_BYTES),
        Buffer.from(txTile({ igs023: igs023() }, tile)),
        `TX tile $${tile.toString(16)} matches the local cartridge graphics`,
      );
    }
  });
