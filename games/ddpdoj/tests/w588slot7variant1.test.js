// W588: slot [7] variant-1 third script and the next exact frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runAnimObjects24683E } from '../src/animobjects.js';
import {
  POOL7, SCRIPT7, SLOT7, scriptStep2909AA, sequenceDriver291470,
} from '../src/objslot7pool.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs, tableBeforeW588,
  tableBeforeW589,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const required = [TABLES, IMAGE, EXPORTER];
const SKIP = required.every(existsSync) ? false
  : 'exact W588 image, tables, or exporter absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W588_TABLE = SKIP ? null : tableBeforeW589(TABLE_JSON);
const PRIOR_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(W588_TABLE.rom);
const SCRIPT = 0x291040;
const SCRIPT_END = 0x29109c;
const VARIANT_1_LIST = 0x290f36;
const LIVE_TABLE_HASH = '18fd1b8ac5c4b066e1d310d10da39d363f8a848e2a40b1894a040a0cd12a82c8';
const TABLE_HASH = 'e6375da211814c6ff3bbbb3bfcaddb88fbd5f2dd93894008191e68aa0cdc19b2';
const PRIOR_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const SCRIPT_HASH = '0d1653d2d5d777820678bfd8178688498ca9b3aa68370b8bef0a022a8a32443a';
const WORDS = Object.freeze([
  0x8000, 0x0000,
  0x8001, 0x4800, 0x0200,
  0x0096, 0x0078, 0x0088, 0x0091, 0x0098, 0x0065, 0x0106, 0x0102, 0x0062, 0x006c,
  0x8001, 0x4000, 0x0200,
  0x00ec, 0x0064, 0x008e, 0x007e, 0x0007, 0x007d, 0x0098, 0x008a, 0x0092, 0x0007,
  0x0081, 0x0062,
  0x8001, 0x3800, 0x0200,
  0x0082, 0x0078, 0x008b, 0x0054, 0x0059, 0x0005, 0x0005, 0x0005,
  0x8002, 0x00c0,
  0x8003, 0x0000,
  0xffff,
]);
const INDICES = Object.freeze([
  0x96, 0x78, 0x88, 0x91, 0x98, 0x65, 0x106, 0x102, 0x62, 0x6c,
  0xec, 0x64, 0x8e, 0x7e, 0x07, 0x7d, 0x98, 0x8a, 0x92, 0x07, 0x81, 0x62,
  0x82, 0x78, 0x8b, 0x54, 0x59, 0x05, 0x05, 0x05,
]);
const ART = Object.freeze([
  0x1ebd10, 0x1eb8d8, 0x1ebb18, 0x1ebc5c, 0x1ebd58,
  0x1eb62c, 0x1eccd0, 0x1ecc40, 0x1eb5c0, 0x1eb728,
  0x1ec928, 0x1eb608, 0x1ebbf0, 0x1eb9b0, 0x1ea8f4, 0x1eb98c,
  0x1ebd58, 0x1ebb60, 0x1ebc80, 0x1ea8f4, 0x1eba1c, 0x1eb5c0,
  0x1eba40, 0x1eb8d8, 0x1ebb84, 0x1eb3c8, 0x1eb47c,
  0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const POSITIONS = Object.freeze([
  ...Array.from({ length: 10 }, (_, index) => 0x48000200 + index * 0x400),
  ...Array.from({ length: 12 }, (_, index) => 0x40000200 + index * 0x400),
  ...Array.from({ length: 8 }, (_, index) => 0x38000200 + index * 0x400),
]);
const WINDOW_SPECS = Object.freeze([
  Object.freeze([0x291040, 0x005c]),
  Object.freeze([0x2904e2, 0x0004]),
  Object.freeze([0x290506, 0x0004]),
]);
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const livePoolRecords = (ram) => Array.from({ length: POOL7.entries }, (_, index) => {
  const at = POOL7.base + index * POOL7.stride;
  return { art: ram.u32(at), position: ram.u32(at + 4), kind: ram.u16(at + 8) };
}).filter(({ art }) => art !== 0);

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function faultAt(address) {
  return (error) => error?.romAddress === address;
}

test('W588 exports the exact script and two previously absent spawn pointers',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS, TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(TABLE_JSON),
    ], [906, 77, 906, 453757, LIVE_TABLE_HASH]);
    assert.deepEqual([
      W588_TABLE.rom.windows.length,
      W588_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(W588_TABLE),
    ], [854, 452789, TABLE_HASH]);
    assert.deepEqual([
      PRIOR_TABLE.rom.windows.length,
      PRIOR_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(PRIOR_TABLE),
    ], [851, 452689, PRIOR_HASH]);
    assert.equal(overlappingPairs(W588_TABLE.rom.windows.map((window) => [
      Number.parseInt(window.base.slice(1), 16), window.len,
    ])), 77);

    const windows = W588_TABLE.rom.windows.filter((window) => window.why.startsWith('W588:'));
    assert.deepEqual(windows.map(({ base, len }) => [base, len]), [
      ['$291040', 0x005c], ['$2904E2', 0x0004], ['$290506', 0x0004],
    ]);
    for (let index = 0; index < WINDOW_SPECS.length; index++) {
      const [base, len] = WINDOW_SPECS[index];
      assert.equal(windows[index].hex, IMG.subarray(base, base + len).toString('hex'));
    }
    assert.equal(binaryHash(IMG.subarray(SCRIPT, SCRIPT_END)), SCRIPT_HASH);
    assert.deepEqual(Array.from({ length: WORDS.length }, (_, index) =>
      ROM.u16(SCRIPT + index * 2)), WORDS);
    assert.equal(WORDS.length * 2, 0x5c);
    assert.equal(ROM.u16(SCRIPT_END - 2), 0xffff);
    assert.throws(() => ROM.u16(SCRIPT_END), faultAt(SCRIPT_END),
      '$29109C remains the exact adjacent variant-2 boundary');

    assert.deepEqual([
      ROM.u32(0x290f3e), ROM.u32(0x290f42), ROM.u32(0x290f56),
    ], [0x291040, 0x2910f6, 0x29109c]);
    assert.deepEqual(INDICES.map((index) => ROM.u32(SCRIPT7.spawnTable + index * 4)), ART);
    assert.deepEqual([
      ROM.u32(SCRIPT7.spawnTable + 0x88 * 4),
      ROM.u32(SCRIPT7.spawnTable + 0x91 * 4),
    ], [0x001ebb18, 0x001ebc5c]);

    const exporter = readFileSync(EXPORTER, 'utf8');
    for (const [base, len] of WINDOW_SPECS) {
      const row = `(0x${base.toString(16).toUpperCase()}, 0x${len.toString(16)
        .toUpperCase().padStart(4, '0')},`;
      assert.equal(exporter.split(row).length - 1, 1, `${row} is declared exactly once`);
    }
    assert.deepEqual(tableBeforeW588(PRIOR_TABLE), PRIOR_TABLE,
      'the W588 reconstruction is idempotent on the exact W587 table');
    const partial = clone(TABLE_JSON);
    partial.rom.windows = partial.rom.windows.filter((window) => window.base !== '$290506');
    assert.throws(() => tableBeforeW588(partial), /only partially present/);
    const malformed = clone(TABLE_JSON);
    malformed.rom.windows.find((window) => window.base === '$291040').len++;
    assert.throws(() => tableBeforeW588(malformed), /not the exact W588 additive shape/);
  });

test('W588 interpreter spawns 10/12/8 groups, completes resource 0, and clears',
  { skip: SKIP }, () => {
    const ram = new Ram();
    for (let index = 0; index < INDICES.length; index++) {
      assert.equal(scriptStep2909AA(ram, ROM, {}, SCRIPT), true);
      assert.equal(livePoolRecords(ram).length, index + 1);
    }
    assert.deepEqual(livePoolRecords(ram), ART.map((art, index) => ({
      art, position: POSITIONS[index] >>> 0, kind: 0,
    })));
    assert.deepEqual([
      ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.loopCount),
    ], [0x52, 0]);

    for (let wait = 1; wait <= 192; wait++) {
      assert.equal(scriptStep2909AA(ram, ROM, {}, SCRIPT), true);
      assert.deepEqual([
        ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.loopCount), ram.u32(SCRIPT7.resource),
      ], [0x52, wait, 0]);
    }
    assert.equal(scriptStep2909AA(ram, ROM, {}, SCRIPT), true);
    assert.equal(ram.u16(SCRIPT7.cursor), 0x56);
    assert.equal(ram.u16(SCRIPT7.loopCount), 0);
    assert.equal(ROM.u32(SCRIPT7.resTable), 0x290e58,
      '$8003 operand 0 selects W372 resource record $290E58');
    const handle = ram.u32(SCRIPT7.resource);
    const node = ram.u32(handle + 0x2c);
    assert.notEqual(handle, 0);
    assert.notEqual(node, 0);
    assert.notEqual(ram.u16(handle) & 0x8000, 0);
    assert.notEqual(ram.u16(node) & 0x8000, 0);

    let resourceFrames = 0;
    let running = true;
    while (running && resourceFrames < 1000) {
      runAnimObjects24683E(ram, ROM);
      running = scriptStep2909AA(ram, ROM, {}, SCRIPT);
      resourceFrames++;
    }
    assert.equal(running, false, 'resource completion reaches the script terminator');
    assert.ok(resourceFrames > 0 && resourceFrames < 1000);
    assert.equal(ram.u32(SCRIPT7.resource), 0);
    assert.equal(ram.u16(handle) & 0x8000, 0, 'resource root is freed on completion');
    assert.equal(ram.u16(node) & 0x8000, 0, 'resource node is freed on completion');
    assert.equal(ram.u16(SCRIPT7.cursor), 0x5a,
      'the cursor advances past $8003 and stops on $FFFF');

    const a5 = 0x80e300;
    const a6 = SLOT7.work;
    ram.setU16(a6 + 0x06, 1);
    ram.setU16(a6 + 0x0c, 8);
    assert.equal(livePoolRecords(ram).length, 30);
    sequenceDriver291470(ram, ROM, { palette: null }, a5, a6, VARIANT_1_LIST);
    assert.equal(ram.u16(a6 + 0x0c), 12, 'list cursor advances from 8 to 12');
    assert.deepEqual(livePoolRecords(ram), [], 'the sequence boundary clears all 30 pool records');
    assert.deepEqual([
      ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.counter), ram.u16(SCRIPT7.loopCount),
      ram.u32(SCRIPT7.resource), ram.u32(SCRIPT7.scriptPtr),
    ], [0, 0, 0, 0, 0], 'pool clear resets every interpreter field');
  });
