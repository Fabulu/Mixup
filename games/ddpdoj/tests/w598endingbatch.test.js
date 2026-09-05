// W598: all three authentic ending families, their shared intro, and all six
// fighter/style pairs from one checkpoint taken before slot [7] caches style.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAuthenticSelection } from '../src/authentic.js';
import { NAME_REC } from '../src/hiscorename.js';
import { RAM, P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { SLOT12 } from '../src/objslot12.js';
import { SLOT7 } from '../src/objslot7pool.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '../src/render/index.js';
import {
  SPRCOL_SIZE, SPRMASK_LAYOUT, SPRMASK_SIZE, assemble,
} from '../src/render/regions.js';
import {
  SpriteDirError, boundedStreamExtent, streamExtent,
} from '../src/render/spritedir.js';
import { RomWindows } from '../src/rom.js';
import { loadBundle } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_BYTES, ROM_WINDOW_COUNT,
  overlappingPairs, tableBeforeW598,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00151631.json');
const ASSETS = here('../assets');
const ROM_DIR = here('../rip/rom');
const STREAMS = path.join(ASSETS, 'spr', 'streams.u32.gz');
const required = [
  IMAGE, TABLES, CHECKPOINT, path.join(ASSETS, 'manifest.json'), STREAMS,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz'),
  ...SPRMASK_LAYOUT.map(([name]) => path.join(ROM_DIR, name)),
];
const SKIP = required.every(existsSync) ? false
  : 'exact image, late checkpoint, tables, ROMs, or regenerated web bundle absent. '
    + 'This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const PRIOR_TABLE = SKIP ? null : tableBeforeW598(TABLE_JSON);

const CURRENT_HASH = '16c1c946669d2565b0a45224618036449cdfa2614508cc44c21097f8e522f5f5';
const W597_HASH = '46064f29e4cde17e95d86b1a823e82d852346ca80325ed5ea9fbcbb6ddbda4c9';
const STORED_CHECKPOINT_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const OPCODE_WIDTHS = new Map([
  [0x8000, 4], [0x8001, 6], [0x8002, 4], [0x8003, 4], [0x8005, 6],
]);
const FAMILIES = Object.freeze([
  Object.freeze({ style: 2, selector: 0, list: 0x2914c8,
    scripts: 9, occurrences: 217, pictures: 92, banners: [1, 2], total: 94 }),
  Object.freeze({ style: 4, selector: 1, list: 0x291816,
    scripts: 7, occurrences: 247, pictures: 103, banners: [3, 4], total: 105 }),
  Object.freeze({ style: 6, selector: 2, list: 0x291b92,
    scripts: 6, occurrences: 157, pictures: 75, banners: [5, 6], total: 77 }),
]);
const INTRO_LISTS = Object.freeze([0x290f1e, 0x290f36, 0x290f4e]);
const INTRO_TOTALS = Object.freeze([73, 71, 71]);
const PAIRS = Object.freeze([
  Object.freeze([0, 2]), Object.freeze([0, 4]), Object.freeze([0, 6]),
  Object.freeze([2, 2]), Object.freeze([2, 4]), Object.freeze([2, 6]),
]);

const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const windowShape = (tables) => tables.rom.windows.map((window) => [
  Number.parseInt(window.base.slice(1), 16), window.len,
]);

function decodeList(rom, listBase) {
  const pictures = new Set(), banners = new Set(), streams = new Set();
  let scripts = 0, occurrences = 0;
  for (;; scripts++) {
    const script = rom.u32(listBase + scripts * 4);
    if (script === 0xffffffff) break;
    for (let at = script; ;) {
      const word = rom.u16(at);
      if (word === 0xffff) break;
      if ((word & 0x8000) === 0) {
        const offset = rom.u32(0x2902c2 + word * 4) & 0x7fffff;
        pictures.add(offset);
        streams.add(offset);
        occurrences++;
        at += 2;
        continue;
      }
      const width = OPCODE_WIDTHS.get(word);
      assert.notEqual(width, undefined,
        `script at $${script.toString(16)} has known cartridge bytecode`);
      if (word === 0x8005) {
        const selector = rom.u16(at + 2);
        if (selector !== 0) {
          banners.add(selector);
          streams.add(rom.u32(0x290c72 + selector * 4) & 0x7fffff);
        }
      }
      at += width;
    }
  }
  return { scripts, occurrences, pictures, banners, streams };
}

function shipped() {
  const manifest = JSON.parse(readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const raw = gunzipSync(readFileSync(STREAMS));
  const planes = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >>> 2);
  const count = manifest.spr.streamCount;
  assert.equal(planes.length, count * 3, 'stream map is three planes');
  const byRom = new Map();
  let rom = 0, base = 0;
  for (let index = 0; index < count; index++) {
    rom = (rom + planes[index]) >>> 0;
    base = (base + planes[count + index]) >>> 0;
    byRom.set(rom, { base, maskWords: planes[count * 2 + index] });
  }
  return { manifest, byRom };
}

function objectByType(ram, type) {
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    if (ram.u16(at) === type) return at;
  }
  return null;
}

const TARGET_TYPES = new Set([0x8007, 0x800f, 0x800e, 0x800c, 0x8008]);
function targetObjects(ram) {
  const found = new Map();
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    const type = ram.u16(at);
    if (TARGET_TYPES.has(type)) found.set(type, at);
  }
  return found;
}

function collectArt(ram, ending, intro, seenEnding, seenIntro) {
  const before = seenEnding.size + seenIntro.size;
  for (let record = 0; record < SPRITE_LIMIT; record++) {
    const base = RAM.spriteList + record * RAM_STRIDE * 2;
    if ((ram.u16(base + 8) & 0x7fff) === 0) break;
    const w2 = ram.u16(base + 4);
    const offset = ((w2 & 0x007f) << 16) | ram.u16(base + 6);
    if (ending.has(offset)) seenEnding.add(offset);
    if (intro.has(offset)) seenIntro.add(offset);
  }
  return seenEnding.size + seenIntro.size !== before;
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W598 adds exactly six list-C scripts and nineteen picture pointers',
  { skip: SKIP }, () => {
    assert.deepEqual([
      canonicalHash(TABLE_JSON), TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(TABLE_JSON)),
    ], [CURRENT_HASH, ROM_WINDOW_COUNT, ROM_WINDOW_BYTES, ROM_OVERLAP_PAIRS]);
    assert.deepEqual([
      canonicalHash(PRIOR_TABLE), PRIOR_TABLE.rom.windows.length,
      PRIOR_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
    ], [W597_HASH, 912, 454767]);
    assert.deepEqual(tableBeforeW598(PRIOR_TABLE), PRIOR_TABLE,
      'the exact W597 reconstruction is idempotent');

    const windows = TABLE_JSON.rom.windows.filter(({ why }) => why.startsWith('W598:'));
    assert.deepEqual([
      windows.length,
      windows.filter(({ len }) => len > 4).length,
      windows.filter(({ len }) => len === 4).length,
    ], [25, 6, 19]);
    for (const window of windows) {
      const base = Number.parseInt(window.base.slice(1), 16);
      assert.equal(window.hex, IMG.subarray(base, base + window.len).toString('hex'),
        `${window.base} is byte-exact to the local cartridge image`);
    }
  });

test('W598 packs complete A, B, C, and shared intro art with terminal extent',
  { skip: SKIP }, () => {
    const packed = shipped();
    const allEnding = new Set(), introUnion = new Set();
    for (const family of FAMILIES) {
      const decoded = decodeList(ROM, family.list);
      assert.deepEqual([
        decoded.scripts, decoded.occurrences, decoded.pictures.size,
        [...decoded.banners].sort((a, b) => a - b), decoded.streams.size,
      ], [family.scripts, family.occurrences, family.pictures, family.banners, family.total]);
      for (const offset of decoded.streams) allEnding.add(offset);
    }
    for (let index = 0; index < INTRO_LISTS.length; index++) {
      const decoded = decodeList(ROM, INTRO_LISTS[index]);
      assert.deepEqual([decoded.scripts, decoded.streams.size, decoded.banners.size],
        [5, INTRO_TOTALS[index], 0]);
      for (const offset of decoded.streams) introUnion.add(offset);
    }
    assert.equal(introUnion.size, 79, 'the three intro variants share an exact 79-stream union');
    for (const [label, offsets] of [['ending', allEnding], ['intro', introUnion]]) {
      const missing = [...offsets].filter((offset) => !packed.byRom.has(offset));
      assert.deepEqual(missing, [], `all ${label} streams exist in the browser map`);
      for (const offset of offsets) {
        assert.ok(packed.byRom.get(offset).maskWords > 2,
          `${label} $${offset.toString(16)} has a drawable packed extent`);
      }
    }

    const maskBytes = assemble((name) =>
      new Uint8Array(readFileSync(path.join(ROM_DIR, name))), SPRMASK_LAYOUT, SPRMASK_SIZE);
    const mask = new Uint16Array(maskBytes.buffer);
    const previous = streamExtent(mask, SPRCOL_SIZE / 2, 0x339aa0);
    const terminal = boundedStreamExtent(mask, SPRCOL_SIZE / 2, 0x33a6e4, 14 * 224);
    assert.deepEqual(previous, {
      maskWords: 3138, colStart: 8217532, colWords: 16726,
      stride: 3140, pixels: 50176,
    });
    assert.deepEqual(terminal, {
      maskWords: 3138, colStart: 8234258, colWords: 16726,
      stride: 3140, pixels: 50176,
    });
    assert.equal(0x339aa0 + previous.stride, 0x33a6e4,
      'the terminal picture immediately follows the same-shape predecessor');
    assert.equal(packed.byRom.get(0x33a6e4).maskWords, terminal.maskWords,
      'the browser ships the complete terminal picture');
    assert.throws(() => boundedStreamExtent(mask, SPRCOL_SIZE / 2, 0x33a6e4, 0),
      SpriteDirError);
  });

test('W598 all six pairs draw their ending and reach name entry, reset, and attract',
  { skip: SKIP, timeout: 300000 }, async () => {
    const liveBundle = await bundle();
    assert.deepEqual(liveBundle.tables, TABLE_JSON,
      'the regenerated browser payload contains the current table');
    const assets = { ...liveBundle, tables: TABLE_JSON };
    const map = romToPackedMap(liveBundle.manifest);
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.deepEqual([
      checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
      checkpoint.raw.stage, checkpoint.raw.loop,
      checkpoint.selection.ship, checkpoint.selection.style,
    ], [STORED_CHECKPOINT_HASH, 151631, 162268, 4, 1, 0, 4]);
    const migrated = { ...checkpoint, tablesSha256: CURRENT_HASH };
    assert.deepEqual({ ...migrated, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'W630 adoption changes only the stored checkpoint table identity');

    const endingByStyle = new Map(FAMILIES.map((family) =>
      [family.style, decodeList(ROM, family.list).streams]));
    const introByStyle = new Map(FAMILIES.map((family, index) =>
      [family.style, decodeList(ROM, INTRO_LISTS[index]).streams]));

    for (const [ship, style] of PAIRS) {
      const resumed = restoreCheckpoint(structuredClone(migrated), assets, migrated.selection);
      const { game, probe } = resumed;
      assert.equal(objectByType(game.ram, 0x8007), null,
        `${ship}/${style} selection is applied before slot [7] exists`);
      applyAuthenticSelection(game, { ship, style });
      // The source checkpoint was style 4. The ordinary default selection is a
      // deliberate no-op, so focused replay must overwrite the four values slot
      // [7] and name entry actually consume after calling the production helper.
      game.ram.setU16(0x813084, ship);
      game.ram.setU16(0x813088, style);
      game.ram.setU16(RAM.player1 + P.shipSel, ship);
      game.ram.setU16(RAM.player1 + P.optFormation, style);

      const ending = endingByStyle.get(style), intro = introByStyle.get(style);
      const seenEnding = new Set(), seenIntro = new Set(), seenTypes = new Set();
      const expectedSelector = (style - 2) / 2;
      let selectorSeen = false, nameSeen = false, resetSeen = false;
      let drawn = 0, reachedAttract = false;
      for (let attempt = 1; attempt <= 18000; attempt++) {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(probe.inputWord);

        const objects = targetObjects(game.ram);
        for (const type of objects.keys()) seenTypes.add(type);
        if (objects.has(0x8007)) {
          if (!selectorSeen) {
            assert.equal(game.ram.u16(SLOT7.work + SLOT7.seqSel), expectedSelector,
              `${ship}/${style} selects the authentic ending list`);
            selectorSeen = true;
          }
          // Direct validation walked every slot-[7] frame. The regression invokes
          // the real browser remapper whenever a new ending stream first appears,
          // avoiding thousands of redundant full-list copies.
          if (collectArt(game.ram, ending, intro, seenEnding, seenIntro)) {
            const port = portSpriteList(game.ram, map, { shardReady: () => true });
            assert.equal(port.missing.size, 0,
              `${ship}/${style} new ending art has no absent browser stream`);
            assert.equal(port.pending.size, 0);
            assert.equal(port.skipped, 0);
            drawn += port.drawn;
          }
        }

        const slot12 = objects.get(0x800c) ?? null;
        if (slot12 !== null && game.ram.u8(slot12 + SLOT12.owedAt) !== 0) {
          const record = SLOT12.records[0];
          if (game.ram.u16(record + NAME_REC.ship) === ship
              && game.ram.u16(record + NAME_REC.style) === style) nameSeen = true;
        }
        if (nameSeen && game.ram.u16(0x813092) === 0
            && game.ram.u16(0x813094) === 0 && game.ram.u16(0x813096) === 0
            && game.ram.u16(0x813098) === 0) resetSeen = true;
        if (resetSeen && objects.has(0x8008)) {
          reachedAttract = true;
          break;
        }
      }

      assert.deepEqual([...seenTypes].sort((a, b) => a - b),
        [0x8007, 0x8008, 0x800c, 0x800e, 0x800f],
        `${ship}/${style} traverses slots [7], [15], [14], [12], and attract`);
      assert.equal(selectorSeen, true);
      assert.equal(nameSeen, true, `${ship}/${style} reaches authentic P1 name entry`);
      assert.equal(resetSeen, true, `${ship}/${style} resets stage and loop state`);
      assert.equal(reachedAttract, true, `${ship}/${style} hands off to attract`);
      assert.ok(drawn > 0, `${ship}/${style} produces browser draw records`);
      assert.deepEqual([...ending].filter((offset) => !seenEnding.has(offset)), [],
        `${ship}/${style} draws every stream in its ending family`);
      assert.deepEqual([...intro].filter((offset) => !seenIntro.has(offset)), [],
        `${ship}/${style} draws every stream in its intro variant`);
    }
  });
