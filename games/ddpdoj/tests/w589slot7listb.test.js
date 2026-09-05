// W589: complete slot [7] list-B post-boss presentation family.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { runAnimObjects24683E } from '../src/animobjects.js';
import { RAM, P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import {
  POOL7, SCRIPT7, SLOT7, resourceLoader2907E2, sequenceDriver291470,
} from '../src/objslot7pool.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs, tableBeforeW589,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const MANIFEST = path.join(ASSETS, 'manifest.json');
const STREAM_MAP = path.join(ASSETS, 'spr/streams.u32.gz');
const ASSET_TABLES = path.join(ASSETS, 'player.tables.json.gz');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00151631.json');
const required = [TABLES, IMAGE, EXPORTER];
const SKIP = required.every(existsSync) ? false
  : 'exact W589 image, tables, or exporter absent. This is a skip, not a pass.';
const SKIP_ASSETS = [MANIFEST, STREAM_MAP, ASSET_TABLES].every(existsSync) && !SKIP ? false
  : 'regenerated W589 web assets absent. This is a skip, not a pass.';
const SKIP_ROUTE = [CHECKPOINT, path.join(ASSETS, 'seed.bin.gz'), ASSET_TABLES]
  .every(existsSync) && !SKIP ? false
  : 'exact W587 checkpoint or regenerated W589 assets absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W588_TABLE = SKIP ? null : tableBeforeW589(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const LIVE_TABLE_HASH = '41557fca0aa2251133792a2b4f061a340bcc2eed6fa3bad649e6d6c411cee6f7';
const W588_TABLE_HASH = '6ba6ed93f3b995ed1baf60fc757808379e548adb2919e040ac95f8d0e17081aa';
const STORED_CHECKPOINT_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const FAMILY_HASH = '5ac350be51f40c6d0714f82ec621cb1288ea2dce91f8a8e8a17c974837d8ac9b';
const SPARSE_HASH = '47546e70b923a30e3285d74367a803b10f7433027e59807b8edafc52d30d5e2a';
const COMBINED_HASH = 'ba061a0b9af5adcc955b79b9ce40fe0814324506e1a2d74e4741725da4aca8b6';
const LIST = 0x291816;

const SCRIPT_SPECS = Object.freeze([
  Object.freeze([0x291836, 0x0078,
    'c411495ca12b35274c79c40f2163a9766b02d498d12d4f516b58df198b792787']),
  Object.freeze([0x2918ae, 0x0064,
    '421c09b51982d612c22ff5438fbb994277589442e364d513c6252295fb527e09']),
  Object.freeze([0x291912, 0x0046,
    'f819ec1d83006cc50ffadb864280d3e57a86586030b21fc4ed15f438886a0bee']),
  Object.freeze([0x291958, 0x0082,
    '2bd833407dacad41cc728e51f4272cc3157cdcf776a5b67d44846e9ca453810b']),
  Object.freeze([0x2919da, 0x00ae,
    '38d11e4ea2476de370b547c06abb390d26961580682b38ac0bd852a04257c91a']),
  Object.freeze([0x291a88, 0x007c,
    'ada7a81cc9a81ade4a7307ffe51eb745b84ad46a99d08cde35d01cb76ff61cd8']),
  Object.freeze([0x291b04, 0x0036,
    '562edc46973aa815d4d4f7748db691370bb93a9158a11802ac024db5beaf22a3']),
]);

const SPARSE = Object.freeze([
  [0x055, 0x290416, 0x001eb3ec], [0x063, 0x29044e, 0x001eb5e4],
  [0x066, 0x29045a, 0x001eb650], [0x06d, 0x290476, 0x001eb74c],
  [0x06f, 0x29047e, 0x001eb794], [0x070, 0x290482, 0x001eb7b8],
  [0x07a, 0x2904aa, 0x001eb920], [0x087, 0x2904de, 0x001ebaf4],
  [0x089, 0x2904e6, 0x001ebb3c], [0x090, 0x290502, 0x001ebc38],
  [0x099, 0x290526, 0x001ebd7c], [0x09a, 0x29052a, 0x001ebda0],
  [0x0a9, 0x290566, 0x001ebfbc], [0x0aa, 0x29056a, 0x001ebfe0],
  [0x0ab, 0x29056e, 0x001ec004], [0x0ac, 0x290572, 0x001ec028],
  [0x0b0, 0x290582, 0x001ec0b8], [0x0b2, 0x29058a, 0x001ec100],
  [0x0b4, 0x290592, 0x001ec148], [0x0b5, 0x290596, 0x001ec16c],
  [0x0b7, 0x29059e, 0x001ec1b4], [0x0ba, 0x2905aa, 0x001ec220],
  [0x0bc, 0x2905b2, 0x001ec268], [0x0bd, 0x2905b6, 0x001ec28c],
  [0x0be, 0x2905ba, 0x001ec2b0], [0x0bf, 0x2905be, 0x001ec2d4],
  [0x0c6, 0x2905da, 0x001ec3d0], [0x0cb, 0x2905ee, 0x001ec484],
  [0x0cd, 0x2905f6, 0x001ec4cc], [0x0d0, 0x290602, 0x001ec538],
  [0x0d6, 0x29061a, 0x001ec610], [0x0db, 0x29062e, 0x001ec6c4],
  [0x0dc, 0x290632, 0x001ec6e8], [0x0dd, 0x290636, 0x001ec70c],
  [0x0df, 0x29063e, 0x001ec754], [0x0ef, 0x29067e, 0x001ec994],
  [0x0f7, 0x29069e, 0x001ecab4], [0x0fa, 0x2906aa, 0x001ecb20],
  [0x0fb, 0x2906ae, 0x001ecb44], [0x0fc, 0x2906b2, 0x001ecb68],
  [0x0fd, 0x2906b6, 0x001ecb8c], [0x100, 0x2906c2, 0x001ecbf8],
  [0x108, 0x2906e2, 0x001ecd18], [0x109, 0x2906e6, 0x001ecd3c],
  [0x10d, 0x2906f6, 0x001ecdcc],
].map(Object.freeze));

const EXPECTED_SEMANTICS = Object.freeze([
  Object.freeze([
    ['banner', 3, 3], ['cadence', 0x2000],
    ['group', 0x30000200, 11, '0d694ee5b84433ab97bfa79df9e44bcd5248439fccb0ba5abb68ea5db38e29a2'],
    ['group', 0x28000200, 11, '30627e40ee514999cf48a2139f137fba8aa800657a17bbba6c792d5d76e0ee30'],
    ['group', 0x20000200, 10, '1fe9e302e634f2ef2eed25055ce0a9a39bc0599b372358ebc22fdc2753deb624'],
    ['group', 0x18000200, 6, 'd94e1b7dc6a43aa404d220676e1e09faf000a0d68eb678d046f296a8434a5502'],
    ['wait', 0x0100], ['resource', 0], ['end'],
  ].map(Object.freeze)),
  Object.freeze([
    ['cadence', 0],
    ['group', 0x30000200, 12, '0aaa539088c5d35eeab9ae449878a99b82d36d37c608b463e736a1bd5bfdd4ff'],
    ['group', 0x28000200, 11, 'd824b6fcd6de5fd0851e2218235138c8184a18da57893fdc1e895d8f09e47696'],
    ['group', 0x20000200, 11, '35e8befe040e7f4702e1c09c2fce11790fbcd9908d114b85a03a62a5fedd6bd6'],
    ['wait', 0x00c0], ['resource', 0], ['end'],
  ].map(Object.freeze)),
  Object.freeze([
    ['cadence', 0x0404],
    ['group', 0x30000200, 11, 'b8fc66bf764a6fe04d8e1e211b32d9848f62d0d145e92e5c56ae2cca2344df4f'],
    ['group', 0x28000200, 11, '5564a4e41fb19a811a452f2b6ee414220918b11003ea56d1114c49bc2200a5a4'],
    ['wait', 0x0060], ['resource', 0], ['end'],
  ].map(Object.freeze)),
  Object.freeze([
    ['cadence', 0],
    ['group', 0x30000200, 7, 'abe3ba751be2e2ddd682b6474d58d64e21d7b351214e900fc48a90b52d13e379'],
    ['group', 0x28000200, 13, '3a3dac495e3dd35e5864efc105902fc6bdd2c01ce42753fc0097dc6dfb45238f'],
    ['group', 0x20000200, 10, 'bb4af0dae4e2a980083d8c706f3b7627ca9f7e0d22f4fd4b6b4e3bfa7b8f9171'],
    ['group', 0x18000200, 13, '2f9bdeba67a70a1a0495136e06940f29b5775ba1f7068016167df4770838040b'],
    ['wait', 0x0100], ['banner', 0, 3], ['resource', 3], ['end'],
  ].map(Object.freeze)),
  Object.freeze([
    ['cadence', 0x0808],
    ['group', 0x50000200, 6, '06243f44ed38c1ebbff0ce59ab77613df805896de127003225ba12b5c385925b'],
    ['cadence', 0x2002],
    ['group', 0x48000200, 13, 'ca988dda3c43c7a7c6c91828cb4557bef9f221e1ba5df7e5924ecaa35d749a8f'],
    ['group', 0x40000200, 7, 'b77a5eb81f7caa49e729f99fd08495cac8c4b97c6a82fa10e0fa54329fbd60fc'],
    ['group', 0x38000200, 9, '9d8e60d95a5f528802dcb2e9ee8dff6a566644cf571b81ed4237fa576757fe09'],
    ['cadence', 0x4002],
    ['group', 0x28000200, 10, '3c8ec1a3fd65047b25e55b2b127c182bdfbba8a10c5f5fbcfc6ee6be1aff3d80'],
    ['group', 0x20000200, 13, 'fd08691d6513027bb19fd46908ca5b814d0bb81f25e882befd760f7a8075af32'],
    ['wait', 0x0100], ['resource', 0], ['end'],
  ].map(Object.freeze)),
  Object.freeze([
    ['banner', 4, 4], ['cadence', 0x2000],
    ['group', 0x30000200, 12, 'a0a7390ae58cb138dc31210acf017d3748a00508fc7c21c09dd37c551d81f206'],
    ['group', 0x28000200, 6, '016c75e8e44f6cf0df809de16a3b3ab1190a7d92a806d2436996ceae3ffac39d'],
    ['group', 0x20000200, 12, '09f7756b1d042040ec6316539a5617000d8154b04e7cd7c46a7548007431d98e'],
    ['group', 0x18000200, 10, '5107b883b20aeb1921c5dafe6d6347e3fbb492f65e372d1b11725b1103995d75'],
    ['wait', 0x0100], ['resource', 0], ['end'],
  ].map(Object.freeze)),
  Object.freeze([
    ['banner', 0, 7], ['cadence', 0x0404],
    ['group', 0x30000200, 12, '160ef0ab9ae1aadcbae0a1406cc72e4cc1e37487215d7ac35eab9e09f478ba7a'],
    ['cadence', 0x1818], ['wait', 0x0060], ['resource', 4], ['end'],
  ].map(Object.freeze)),
]);

const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const faultAt = (address) => (error) => error?.romAddress === address;

function decodeScript(base, len) {
  const commands = [];
  const indices = [];
  let activeGroup = null;
  let at = base;
  while (at < base + len) {
    const word = ROM.u16(at);
    if ((word & 0x8000) === 0) {
      if (activeGroup === null) {
        throw new Error(`plain picture $${word.toString(16)} outside an $8001 group at `
          + `$${at.toString(16)} in script $${base.toString(16)}`);
      }
      activeGroup.pictures.push(word);
      indices.push(word);
      at += 2;
      continue;
    }
    if (word === 0xffff) {
      commands.push(['end']);
      at += 2;
      break;
    }
    if (word === 0x8000) {
      commands.push(['cadence', ROM.u16(at + 2)]);
      at += 4;
      continue;
    }
    if (word === 0x8001) {
      activeGroup = { target: ROM.u32(at + 2), pictures: [] };
      commands.push(activeGroup);
      at += 6;
      continue;
    }
    if (word === 0x8002 || word === 0x8003) {
      commands.push([word === 0x8002 ? 'wait' : 'resource', ROM.u16(at + 2)]);
      at += 4;
      continue;
    }
    if (word === 0x8005) {
      commands.push(['banner', ROM.u16(at + 2), ROM.u16(at + 4)]);
      at += 6;
      continue;
    }
    throw new Error(`unknown opcode $${word.toString(16)} at $${at.toString(16)}`);
  }
  assert.equal(at, base + len, `script $${base.toString(16)} exact boundary`);
  return {
    commands: commands.map((command) => {
      if (Array.isArray(command)) return command;
      const bytes = Buffer.alloc(command.pictures.length * 2);
      command.pictures.forEach((picture, index) => bytes.writeUInt16BE(picture, index * 2));
      return ['group', command.target, command.pictures.length, binaryHash(bytes)];
    }),
    indices,
  };
}

function livePoolRecords(ram) {
  return Array.from({ length: POOL7.entries }, (_, index) => {
    const at = POOL7.base + index * POOL7.stride;
    return { art: ram.u32(at), position: ram.u32(at + 4), kind: ram.u16(at + 8) };
  }).filter(({ art }) => art !== 0);
}

function packedStreamMap() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.spr.streamsFormat, 'planes-delta-1');
  const raw = gunzipSync(readFileSync(STREAM_MAP));
  const words = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >>> 2);
  const n = manifest.spr.streamCount;
  assert.equal(words.length, n * 3);
  const byRom = new Map();
  let romOffset = 0;
  let packedBase = 0;
  for (let i = 0; i < n; i++) {
    romOffset = (romOffset + words[i]) >>> 0;
    packedBase = (packedBase + words[n + i]) >>> 0;
    byRom.set(romOffset, { base: packedBase, maskWords: words[2 * n + i] });
  }
  return { manifest, byRom };
}

async function bundle(tables) {
  const assets = await loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
  return { ...assets, tables };
}

function objectByType(ram, type) {
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    if (ram.u16(at) === type) return at;
  }
  return null;
}

test('W589 registry is exact, reconstructs W588 strictly, and stops at $291B3A',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS, TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0),
      overlappingPairs(TABLE_JSON.rom.windows.map((window) => [
        Number.parseInt(window.base.slice(1), 16), window.len,
      ])),
      canonicalHash(TABLE_JSON),
    ], [1773, 79, 1773, 658833, 79, LIVE_TABLE_HASH]);
    assert.deepEqual([
      W588_TABLE.rom.windows.length,
      W588_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(W588_TABLE),
    ], [856, 452817, W588_TABLE_HASH]);

    const expected = [
      ...SCRIPT_SPECS.map(([base, len]) => [base, len]),
      ...SPARSE.map(([, base]) => [base, 4]),
    ].sort((a, b) => a[0] - b[0]);
    const windows = TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W589:'));
    assert.equal(windows.length, 52);
    assert.deepEqual(windows.map(({ base, len }) => [Number.parseInt(base.slice(1), 16), len])
      .sort((a, b) => a[0] - b[0]), expected);
    for (const window of windows) {
      const base = Number.parseInt(window.base.slice(1), 16);
      assert.equal(window.hex, IMG.subarray(base, base + window.len).toString('hex'));
    }

    const exporter = readFileSync(EXPORTER, 'utf8');
    for (const [base, len] of expected) {
      const row = `(0x${base.toString(16).toUpperCase()}, 0x${len.toString(16)
        .toUpperCase().padStart(4, '0')},`;
      assert.equal(exporter.split(row).length - 1, 1, `${row} is declared exactly once`);
    }
    assert.deepEqual(tableBeforeW589(W588_TABLE), W588_TABLE,
      'W589 reconstruction is idempotent on the exact W588 table');
    const partial = clone(TABLE_JSON);
    partial.rom.windows = partial.rom.windows.filter((window) => window.base !== '$2906E6');
    assert.throws(() => tableBeforeW589(partial), /only partially present/);
    const malformed = clone(TABLE_JSON);
    malformed.rom.windows.find((window) => window.base === '$2919DA').len++;
    assert.throws(() => tableBeforeW589(malformed), /not the exact W589 additive shape/);
    const duplicate = clone(TABLE_JSON);
    duplicate.rom.windows.push(clone(duplicate.rom.windows.find((window) =>
      window.base === '$291836')));
    assert.throws(() => tableBeforeW589(duplicate), /only partially present/);

    assert.throws(() => ROM.u16(0x291b3a), faultAt(0x291b3a),
      '$291B3A remains outside every ROM window and is not a fabricated frontier');
  });

test('W589 scripts, list, sparse mapping, opcode order, and payload hashes are exact',
  { skip: SKIP }, () => {
    assert.deepEqual(Array.from({ length: 8 }, (_, index) => ROM.u32(LIST + index * 4)), [
      ...SCRIPT_SPECS.map(([base]) => base), 0xffffffff,
    ]);
    const scriptBytes = [];
    const allIndices = [];
    for (let index = 0; index < SCRIPT_SPECS.length; index++) {
      const [base, len, hash] = SCRIPT_SPECS[index];
      const bytes = IMG.subarray(base, base + len);
      scriptBytes.push(bytes);
      assert.equal(binaryHash(bytes), hash);
      const decoded = decodeScript(base, len);
      assert.deepEqual(decoded.commands, EXPECTED_SEMANTICS[index]);
      allIndices.push(...decoded.indices);
      assert.equal(ROM.u16(base + len - 2), 0xffff);
      if (index + 1 < SCRIPT_SPECS.length) {
        assert.equal(base + len, SCRIPT_SPECS[index + 1][0]);
      }
    }
    assert.deepEqual(allIndices.length, 247);
    assert.equal(new Set(allIndices).size, 103);

    for (const [picture, base, art] of SPARSE) {
      assert.equal(base, SCRIPT7.spawnTable + picture * 4);
      assert.equal(ROM.u32(base), art);
    }
    const sparseBytes = Buffer.concat(SPARSE.map(([, base]) => IMG.subarray(base, base + 4)));
    const familyBytes = Buffer.concat(scriptBytes);
    assert.deepEqual([
      familyBytes.length, binaryHash(familyBytes),
      sparseBytes.length, binaryHash(sparseBytes),
      familyBytes.length + sparseBytes.length,
      binaryHash(Buffer.concat([familyBytes, sparseBytes])),
    ], [772, FAMILY_HASH, 180, SPARSE_HASH, 952, COMBINED_HASH]);
  });

test('W589 complete list runs seven scripts, frees resources, clears each entry, and terminates',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const a5 = ALLOC.table;
    const a6 = SLOT7.work;
    const ctx = { palette: null };
    ram.setU16(a6 + 0x06, 0);
    const cursors = [];
    const handles = new Set();
    let resourceAllocations = 0;
    let priorResourceHandle = 0;
    let priorCursor = 0;
    let sawPoolAllocation = false;

    for (let attempt = 1; attempt <= 12000 && ram.u8(a5 + SLOT7.stateAt) !== 2; attempt++) {
      runAnimObjects24683E(ram, ROM);
      sequenceDriver291470(ram, ROM, ctx, a5, a6, LIST);
      resourceLoader2907E2(ram, ROM, ctx);
      sawPoolAllocation ||= livePoolRecords(ram).length !== 0;
      const resourceHandle = ram.u32(SCRIPT7.resource);
      if (resourceHandle !== 0 && priorResourceHandle === 0) resourceAllocations++;
      priorResourceHandle = resourceHandle;
      for (const at of [SCRIPT7.resource, 0x81e10e]) {
        const handle = ram.u32(at);
        if (handle !== 0) handles.add(handle);
      }
      const cursor = ram.u16(a6 + 0x0c);
      if (cursor !== priorCursor) {
        cursors.push(cursor);
        assert.equal(cursor, priorCursor + 4);
        assert.deepEqual(livePoolRecords(ram), [],
          `list cursor ${cursor} clears the preceding script's pool records`);
        assert.deepEqual([
          ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.counter),
          ram.u16(SCRIPT7.loopCount), ram.u32(SCRIPT7.resource),
          ram.u32(SCRIPT7.scriptPtr),
        ], [0, 0, 0, 0, 0], 'the sequence boundary clears all interpreter fields');
        priorCursor = cursor;
      }
    }

    assert.equal(sawPoolAllocation, true);
    assert.deepEqual(cursors, [4, 8, 12, 16, 20, 24, 28]);
    assert.equal(ROM.u32(LIST + 28), 0xffffffff);
    assert.equal(ram.u8(a5 + SLOT7.stateAt), 2,
      'the exact list terminator hands the outer slot [7] object to state 2');
    assert.equal(ram.u16(a6 + 0x0c), 28, 'terminator handling leaves the cursor at 28');
    assert.equal(ram.u16(SLOT7.bannerSel), 0, 'the seventh script clears the banner');
    assert.equal(resourceAllocations, 7, 'each $8003 command allocates once');
    assert.ok(handles.size > 0, 'resource allocation exposes animation-object roots');
    for (const handle of handles) {
      assert.equal(ram.u16(handle) & 0x8000, 0,
        `animation-object root $${handle.toString(16)} was freed`);
    }
    assert.deepEqual(livePoolRecords(ram), []);
  });

test('W589 browser bundle packs every list-B picture and banner in shard 17',
  { skip: SKIP_ASSETS }, () => {
    assert.deepEqual(JSON.parse(gunzipSync(readFileSync(ASSET_TABLES))), TABLE_JSON,
      'the regenerated browser table payload is byte-current with the live export');
    const decoded = SCRIPT_SPECS.map(([base, len]) => decodeScript(base, len));
    const streams = new Set(decoded.flatMap(({ indices }) => indices)
      .map((picture) => ROM.u32(SCRIPT7.spawnTable + picture * 4) & 0x7fffff));
    for (const selector of [3, 4]) {
      streams.add(ROM.u32(SLOT7.bannerTable + selector * 4) & 0x7fffff);
    }
    assert.equal(streams.size, 105);

    const { manifest, byRom } = packedStreamMap();
    const shard = manifest.spr.shards.find(({ i }) => i === 17);
    assert.deepEqual([
      manifest.spr.streamCount, shard.streams,
      manifest.spr.maskUsed, manifest.spr.colUsed,
      shard.maskLen, shard.colLen,
    ], [6190, 1783, 2993108, 7454936, 927494, 2318852],
    'W647 adds exactly 32 cold-P2 rank and tally streams to the W645 bundle');
    const absent = [...streams].filter((offs) => !byRom.has(offs));
    assert.deepEqual(absent, []);
    for (const offs of streams) {
      const packed = byRom.get(offs);
      assert.ok(packed.base >= shard.maskFrom && packed.base < shard.maskFrom + shard.maskLen,
        `stream $${offs.toString(16)} is owned by deferred shard 17`);
      assert.ok(packed.maskWords > 2);
    }
  });

test('W589 production route completes entries, terminates, hands to type $800F, and stays quiet',
  { skip: SKIP_ROUTE }, async () => {
    const assets = await bundle(TABLE_JSON);
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.equal(checkpoint.tablesSha256, STORED_CHECKPOINT_TABLE_HASH);
    const resumed = restoreCheckpoint(
      { ...checkpoint, tablesSha256: LIVE_TABLE_HASH }, assets, checkpoint.selection);
    const completions = [];
    let priorCursor = resumed.game.ram.u16(SLOT7.work + 0x0c);
    let error = null;

    for (let attempted = 1; attempted <= 12000; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
      const cursor = resumed.game.ram.u16(SLOT7.work + 0x0c);
      if (attempted === 2940) {
        completions.length = 0;
        priorCursor = cursor;
      } else if (attempted > 2940 && cursor !== priorCursor && cursor <= 28) {
        completions.push([attempted, cursor]);
        priorCursor = cursor;
      }
      if (attempted === 5242) {
        const slot7 = objectByType(resumed.game.ram, 0x8007);
        const state = checkpointDocument(resumed.game, assets, {
          ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
        });
        assert.notEqual(slot7, null);
        assert.deepEqual([
          resumed.game.logicFrame, resumed.game.videoFrame,
          resumed.game.ram.u8(slot7 + SLOT7.stateAt),
          state.ramSha256, state.gameSha256,
        ], [156873, 167534, 2,
          'd68e9734acd8127caf4cc85be311430886a51d31c7013e16fddcad99127d2ea2',
          'bf30261b4edb68730c3e0b638949af354102bc68c1bab9a90e99df5cfde3c5be']);
      }
      if (attempted === 5244) {
        const state = checkpointDocument(resumed.game, assets, {
          ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
        });
        assert.deepEqual([
          resumed.game.logicFrame, resumed.game.videoFrame,
          resumed.game.ram.u16(ALLOC.table), resumed.game.ram.u8(ALLOC.table + 2),
          resumed.game.ram.u32(ALLOC.table + ALLOC.idOff),
          state.ramSha256, state.gameSha256,
        ], [156875, 167536, 0x800f, 1, 2,
          'd96a3c6717aa59a4604268b5edfc726e60efeceffe2feea43907ac4dfc239feb',
          'bc28ef70247a96fc8c1f08c6de227a6f4014b1734c56256e6cf2b33256591aa4']);
      }
    }

    assert.equal(error, null, 'no loud ROM failure occurs through 12000 attempts');
    assert.deepEqual(completions, [
      [3274, 4], [3509, 8], [3724, 12], [4056, 16],
      [4623, 20], [4960, 24], [5241, 28],
    ]);
  });
