// W597: all six authentic fighter/style pairs under cartridge-activated hyper.
//
// The direct MAME captures grant one stock and a full gauge once, press Button 2,
// then tap normal shot and hold laser. All six pairs damaged enemies with both
// weapons. Browser replay exposed clipped option-shot data and missing Type-A
// attached art. This focused test keeps only those concrete repair boundaries and
// derives every art family from the local cartridge image and generated manifest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RomWindows } from '../src/rom.js';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_BYTES, ROM_WINDOW_COUNT,
  overlappingPairs, tableBeforeW597,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const MANIFEST = here('../assets/manifest.json');
const STREAMS = here('../assets/spr/streams.u32.gz');
const SCENARIOS = here('../tools/oracle/scenarios.json');
const required = [IMAGE, TABLES, MANIFEST, STREAMS];
const SKIP = required.every(existsSync) ? false
  : 'exact image, tables, or regenerated sprite bundle absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const PRIOR_TABLE = SKIP ? null : tableBeforeW597(TABLE_JSON);
const PRIOR_ROM = SKIP ? null : new RomWindows(PRIOR_TABLE.rom);

const CURRENT_HASH = 'a262d979e0a369afba14cec7858efdf6932ca4ce7b3f6aab13d433c87f0860cc';
const W596_HASH = '919c9b20ee1a40068ef808694fb8b9fb5e503e9fd41ccbf7c613630bba720047';
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const u16 = (at) => IMG.readUInt16BE(at);
const u32 = (at) => IMG.readUInt32BE(at);
const windowShape = (tables) => tables.rom.windows.map((window) => [
  Number.parseInt(window.base.slice(1), 16), window.len,
]);
const faultAt = (address) => (error) => error?.romAddress === address;

const WIDENINGS = Object.freeze([
  Object.freeze([0x251526, 0x0082, 0x00be]),
  Object.freeze([0x2519e0, 0x00aa, 0x0136]),
  Object.freeze([0x25211c, 0x0082, 0x00be]),
  Object.freeze([0x2525d6, 0x00aa, 0x0136]),
  Object.freeze([0x251b36, 0x03ca, 0x03e2]),
]);
const ADDITIONS = Object.freeze([
  Object.freeze([0x251914, 0x00cc]),
  Object.freeze([0x25250a, 0x00cc]),
  Object.freeze([0x251fa0, 0x004c]),
]);
const W597_SHAPES = Object.freeze([
  Object.freeze([0x251526, 0x00be]), Object.freeze([0x251914, 0x00cc]),
  Object.freeze([0x2519e0, 0x0136]), Object.freeze([0x25211c, 0x00be]),
  Object.freeze([0x25250a, 0x00cc]), Object.freeze([0x2525d6, 0x0136]),
  Object.freeze([0x251b36, 0x03e2]), Object.freeze([0x251fa0, 0x004c]),
]);

function shipped() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
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
  const shardOf = (row) => manifest.spr.shards.find((shard) =>
    row.base >= shard.maskFrom && row.base < shard.maskFrom + shard.maskLen)?.i ?? -1;
  return { manifest, byRom, shardOf };
}

function assertPackedFamily(label, offsets, expectedShard, bundle) {
  assert.equal(new Set(offsets).size, offsets.length, `${label} has no duplicate frame`);
  const missing = offsets.filter((offset) => !bundle.byRom.has(offset));
  assert.deepEqual(missing, [], `${label} is complete in the generated stream map`);
  for (const offset of offsets) {
    const row = bundle.byRom.get(offset);
    const shard = bundle.manifest.spr.shards[expectedShard];
    assert.equal(bundle.shardOf(row), expectedShard,
      `${label} $${offset.toString(16).toUpperCase()} belongs to shard ${expectedShard}`);
    assert.ok(row.maskWords > 2, `${label} has a drawable cartridge extent`);
    assert.ok(row.base + row.maskWords <= shard.maskFrom + shard.maskLen,
      `${label} lies wholly inside its packed shard`);
  }
}

test('W597 is five strict hyper-data widenings plus three exact additions',
  { skip: SKIP }, () => {
    assert.deepEqual([
      canonicalHash(TABLE_JSON), TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(TABLE_JSON)),
    ], [CURRENT_HASH, ROM_WINDOW_COUNT, ROM_WINDOW_BYTES, ROM_OVERLAP_PAIRS]);
    assert.deepEqual([
      canonicalHash(PRIOR_TABLE), PRIOR_TABLE.rom.windows.length,
      PRIOR_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(PRIOR_TABLE)),
    ], [W596_HASH, 909, 453859, 77]);

    const windows = TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W597'));
    assert.deepEqual(windows.map((window) => [
      Number.parseInt(window.base.slice(1), 16), window.len,
    ]), W597_SHAPES);
    for (const [base, len] of W597_SHAPES) {
      const window = windows.find((candidate) =>
        Number.parseInt(candidate.base.slice(1), 16) === base);
      assert.equal(window.hex, IMG.subarray(base, base + len).toString('hex'));
    }

    for (const [base, beforeLen] of WIDENINGS) {
      const firstNew = base + beforeLen;
      assert.throws(() => PRIOR_ROM.u16(firstNew), faultAt(firstNew));
      assert.equal(ROM.u16(firstNew), u16(firstNew));
    }
    for (const [base] of ADDITIONS) {
      assert.throws(() => PRIOR_ROM.u16(base), faultAt(base));
      assert.equal(ROM.u16(base), u16(base));
    }
    assert.deepEqual(tableBeforeW597(PRIOR_TABLE), PRIOR_TABLE,
      'the exact W596 reconstruction is idempotent');
  });

test('W597 hyper scenario covers all six pairs and grants only stock plus gauge once', () => {
  const defs = JSON.parse(readFileSync(SCENARIOS, 'utf8'));
  assert.deepEqual(defs.pairgate.pairs.map(({ ship, style }) => [ship, style]), [
    [0, 2], [0, 4], [0, 6], [2, 2], [2, 4], [2, 6],
  ]);
  const spec = defs.pairhyper;
  assert.equal(spec.schema, 'ddpdoj-pair-hyper-scenarios-v1');
  assert.deepEqual(spec.pokeOnce.split(','), ['81B65C=0001:w', '81B642=095F:w']);
  assert.deepEqual([spec.pokeOnceFrom, spec.pokeOnceTo], [1999, 1999]);
  assert.equal(spec.pokeOnce.includes('81B63E'), false,
    'the intervention never writes the active flag');
  assert.ok(spec.suffix.startsWith('2000=B;2001=R;'),
    'Button 2 requests activation through cartridge logic');
  assert.match(spec.suffix, /2050=A;2051=;2070=A;2071=;/,
    'two hyper normal-shot taps are captured');
  assert.match(spec.suffix, /2100=A;2240=AR;2300=A;2360=/,
    'the hyper laser is held across enemy contact');
  assert.equal(spec.buckets, '5,14,15,16,19,20');
  assert.match(spec.rawDump, /enemies=81459C:12C0/);
  assert.match(spec.rawDump, /poolE=81D394:7F8/);
  assert.deepEqual(spec.exec.split(',').map((entry) => entry.split('=')[0]), [
    'shot_a_mark', 'shot_a_hp', 'shot_b_mark', 'shot_b_hp',
    'beam_a_mark', 'beam_a_hp', 'beam_b_mark', 'beam_b_hp',
  ]);
});

test('W597 packs every Type-A and Type-B attached shadow and glow tilt',
  { skip: SKIP }, () => {
    const bundle = shipped();
    const families = [
      ['shadow', 0x25545a, [null], 17],
      ['ordinary glow', 0x2556e2, [0, 4], 34],
      ['down-stick glow', 0x255882, [0, 4], 34],
    ];
    for (const [ship, tableOffset] of [['Type-A', 0], ['Type-B', 4]]) {
      for (const [name, table, phases, expected] of families) {
        const center = u32(table + tableOffset);
        const offsets = [];
        for (let tilt = -0x20; tilt <= 0x20; tilt += 4) {
          const cell = u32(center + tilt);
          for (const phase of phases) {
            offsets.push((phase === null ? cell : u32(cell + phase)) & 0x7fffff);
          }
        }
        assert.equal(new Set(offsets).size, expected,
          `${ship} ${name} resolves the complete selector domain`);
        assertPackedFamily(`${ship} ${name}`, offsets, 0, bundle);
      }
    }
  });

test('W597 bundle contains hyper shots, aura, beam, impact, and enemy hitspark families',
  { skip: SKIP }, () => {
    const bundle = shipped();
    const hyperShots = [0x007cdc, 0x007da8, 0x007e74, 0x010ddc, 0x010e40, 0x010ea4];
    assertPackedFamily('hyper normal shot', hyperShots, 6, bundle);

    const aura = Array.from({ length: 34 }, (_, index) => 0x0530fc + index * 0x234);
    assertPackedFamily('hyper aura', aura, 13, bundle);

    const effects = (table) => Array.from({ length: 36 }, (_, index) =>
      u32(table + index * 4) & 0x7fffff);
    assertPackedFamily('laser impact', effects(0x28a51c), 8, bundle);
    assertPackedFamily('Pool-E kind-$14 enemy hitspark', effects(0x28a5c2), 8, bundle);

    const pairTable = u32(0x255028);
    const hyperGroup = u16(0x25500a);
    const first = hyperGroup / 8;
    const blocks = Array.from({ length: 5 }, (_, index) =>
      u32(pairTable + (first + index) * 8 + 4));
    assert.equal(new Set(blocks).size, 1,
      'all five hyper power steps share one beam animation block');
    const beam = [];
    for (let offset = 0x1e; offset >= 0; offset -= 0x0a) {
      beam.push(u32(blocks[0] + offset + 4) & 0x7fffff);
    }
    assertPackedFamily('hyper laser body', beam, 10, bundle);
    assert.deepEqual(beam.map((offset) => bundle.byRom.get(offset).maskWords),
      [482, 482, 482, 482], 'all four historical missing beams have full extents');
  });
