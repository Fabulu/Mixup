// W214: Stage-4 type $9C root ship and paired satellite array.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS } from '../src/spritequeue.js';
import { POOL_B } from '../src/effects.js';
import { tableBeforeW595 } from './romwindowset.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const manifestPath = new URL('../assets/manifest.json', import.meta.url);
const HAVE = existsSync(tablesPath) && existsSync(manifestPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const manifest = HAVE ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const PRE_W595 = HAVE ? tableBeforeW595(json) : null;
const PRE_W595_ROM = HAVE ? new RomWindows(PRE_W595.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables/assets absent; skip, not pass';

function sha(at, len) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(at, len))).digest('hex');
}

function findType(ram, type) {
  for (let i = 0; i < ENEMY.slots; i++) {
    const a5 = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(a5) !== 0 && ram.u8(a5 + 0x0c) === type) return a5;
  }
  return 0;
}

test('W214 exact type-$9C root/satellite closure, eleven records, and four new streams',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27ad96));
  assert.ok(HANDLER_ADDRESSES.includes(0x27aee0));
  assert.equal(sha(0x27ad8e, 0x568),
    'f2a32a19490b590e97c7361b81895d916b2d8c60879290e17f9a1fd78bcfce0e');
  assert.equal(sha(0x27dbf4, 0x80e),
    '493d455a324c184b39eb8d4cba860a82e3d61886b4db48f40a9d0f57164c0958');
  assert.equal(sha(0x27e4f2, 8),
    '9892835205bbbd387126413350ecd7045be7a187dae48d5b0e9f1f0ac1d34cb9');
  const addrs = [0x235b48, 0x235b80, 0x235bd0, 0x235be8, 0x235c00,
    0x235c58, 0x235cb8, 0x235cd0, 0x235ce8, 0x235d28, 0x235d60];
  assert.equal(createHash('sha256').update(Buffer.concat(addrs.map((a) =>
    Buffer.from(ROM.bytes(a, 8))))).digest('hex'),
  '45f072f626465407bf5dc642f0e98cff3610b7677dba99f25b01533af42a76e9');
  const art = manifest.spr.harvest.find((h) => h.at === '$27B07C');
  assert.ok(art, 'four-frame type-$9C root animation harvest');
  assert.deepEqual([art.entries, art.distinct, art.added], [4, 4, 4]);
  // W414 (docket D51): 4,267 -> 4,291. The exporter gained pool-A kind index 2's
  // sixteen-frame animation and the eight-frame collected popup the star shares
  // with it -- TWENTY-FOUR streams, all into shard 11. This file's own harvest
  // assertions above are the untouched witnesses: none of them moved.
  // W417: 4,291 -> 4,307. The exporter gained pool-A kind index 3's OWN sixteen-frame
  // animation ($1BE94C..$1BF4C8, stride $C4), whose body W417 ports in the same wave;
  // all sixteen land on shard 11. This file's own harvest assertions above are the
  // untouched witnesses: none of them moved.
  // W419: 4,307 -> 4,343. Pool C's kind-0, kind-8 and kind-$C death satellites --
  // THREE families x three animation lists x four cells = 36 distinct streams, all
  // new, all onto shard 9 beside the explosion they accompany. W419 opened
  // `$289B50`'s guard from kind 4 alone to the table's real domain, and art with no
  // guard behind it is the half W415 refused to ship on its own. [M] shard 9 goes
  // 277 -> 313 streams, its maskLen 158,466 -> 166,218 and `spr.maskUsed` by the SAME
  // 7,752 -- so nothing but these 36 moved. Shard 11 held at 862/1,170,804/3,272,730.
  // W422: 4,343 -> 4,351. Pool-A kind index 5's COLLECTED popup -- eight frames at
  // $1E24DC stride $54, shipped in the same wave as its body $27FF9A. All eight land
  // on shard 11 beside the star's and kind 18's popups. [M] shard 11 goes 862 -> 870
  // streams and 1,170,804 -> 1,171,460 mask words, `spr.maskUsed` grows by the SAME
  // 656, and shard 9 HELD at 313/166,218 -- so nothing but these 8 moved.
  // W443: 4,351 -> 4,355. **DOCKET D56, the owner's oldest complaint.** The HYPER
  // beam's own four frames ($022084 $022268 $02244C $022630, stride $1E4) -- the
  // block $24BAE2 that pair-table entries 15..19, the `+$78` group `$255008
  // addi.w #$78,D3` selects, all five point at. They had never been exported, so
  // the port drew 88 bucket-16 records in 100 frames with no picture: the beam
  // that "just cuts off". All four land on SHARD 10, the laser's own. [M] shard 10
  // goes 407 -> 411 streams and 54,582 -> 56,510 mask words, `spr.maskUsed` grows
  // by the SAME 1,928, and every other shard HELD -- shard 11 at 870/1,171,460 and
  // shard 9 at 313/166,218.
  assert.equal(manifest.spr.streamCount, 5636);
});

test('W214 real clock-$E5 root initializes five satellite pairs, fires, draws, and dies',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  const bullets = [], sounds = [];
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x00e5);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x235b48);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 2, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x235b58);
  const a5 = findType(ram, 0x9c);
  assert.ok(a5);
  const root = ram.u32(a5 + 6);
  assert.equal(ram.u16(a5 + 4), 10, 'root plus ten paired satellite subrecords');
  assert.notEqual(ram.u8(root + 0x1c), 0x40, 'clock-E5 movement selects five-pair form');
  for (const off of [0x20, 0x60, 0xa0, 0xe0, 0x120])
    assert.notEqual(ram.u16(root + off), 0, `satellite primary +$${off.toString(16)}`);

  ram.setU32(root + 2, 0x40002000);
  ram.setU8(a5 + 0x26, 0);
  ram.setU8(a5 + 0x28, 0);
  ram.setU8(a5 + 0x29, 1);
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost: (a) => sounds.push(a),
    bulletSpawn: (site, result) => bullets.push([site, result]) };
  runHandler(0x27aee0, ram, ROM, a5, ctx);
  assert.ok(bullets.some(([site]) => site === 0x27afcc), 'root fires its kind-$13 shot');
  assert.ok(ram.u16(BUCKETS[2].counter) >= 12, 'root and satellites emit real sprites');

  ram.setU8(root, ram.u8(root) | 0x04);
  ram.setU16(root + 0x18, 0x8000);
  runHandler(0x27aee0, ram, ROM, a5, ctx);
  assert.equal(ram.u16(a5), 0, 'root death frees the allocation after its effect sequence');
  assert.deepEqual(sounds, [0x28c2dc]);
  assert.equal(Array.from({ length: POOL_B.slots }, (_, i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride)).filter(Boolean).length, 9,
  'nine root-death effect rows are armed');
});

test('W530 type-$9C offscreen satellite wraps its RAM-backed animation read',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const log = new UnportedLog();
    const palette = new PaletteState();
    ram.setU16(0x813092, 3);
    ram.setU16(0x813094, 6);
    ram.setU16(0x813096, 12);
    resetAndInstallStage26331E(ram, ROM, log);
    ram.setU16(SPAWN.DISTANCE_CLOCK, 0x00e5);
    ram.setU32(SPAWN.LIVE_CURSOR, 0x235b48);
    runSpawnWalker(ram, ROM, log, MT, undefined, palette);

    const a5 = findType(ram, 0x9c);
    const root = ram.u32(a5 + 6);
    const child = root + 0x20;
    ram.setU32(root + 2, 0x40002000);
    ram.setU16(0x8130d2, 1);
    ram.setU16(child, 0x8080);
    ram.setU32(child + 0x10, 0x04800600);
    ram.setU8(child + 0x14, 0);
    ram.setU8(child + 0x15, 0x40);
    ram.setU16(child + 0x16, 0x0440);
    ram.setU32(0x800a40, 0x12345678);

    assert.doesNotThrow(() => runHandler(0x27aee0, ram, ROM, a5,
      { tables: MT, unported: log, soundPost() {} }));
    assert.equal(ram.u32(child + 0x0a), 0x12345678,
      '$04800600 + $0440 wraps to the cartridge RAM read at $800A40');
    assert.equal(ram.u8(child + 0x14), 0x40);
    assert.equal(ram.u16(child + 0x16), 0x043c);
  });

test('W595 exact registry extends W534 from five to nine wrapped BIOS longwords',
  { skip: SKIP }, () => {
    const addresses = [0x0c00, 0x0bfc, 0x0bf8, 0x0bf4, 0x0bf0,
      0x0bec, 0x0be8, 0x0be4, 0x0be0];
    const live = json.rom.windows.filter(({ base }) => base === '$000BE0');
    const before = PRE_W595.rom.windows.filter(({ base }) => base === '$000BF0');
    assert.deepEqual(live.map(({ len, why }) => [len, why]), [[0x24,
      "W595 type-$9C offscreen family-$11 satellite's nine 24-bit-wrapped "
        + 'BIOS animation longwords']]);
    assert.deepEqual(before.map(({ len, why }) => [len, why]), [[0x14,
      "W534 type-$9C offscreen satellite's five 24-bit-wrapped BIOS animation longwords"]]);
    for (const at of addresses.slice(0, 5)) {
      assert.equal(PRE_W595_ROM.u32(at), ROM.u32(at),
        `pre-W595 registry still serves W534's longword at $${at.toString(16).toUpperCase()}`);
    }
    assert.throws(() => PRE_W595_ROM.u32(0x0bec), /longword at \$BEC is outside every ROM window/,
      'pre-W595 registry reproduces the fresh ship-0/style-2 fault at $000BEC');
    for (const at of addresses) assert.doesNotThrow(() => ROM.u32(at));
  });

test('W534/W595 type-$9C offscreen satellite reads all nine wrapped BIOS longwords',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const log = new UnportedLog();
    const palette = new PaletteState();
    ram.setU16(0x813092, 3);
    ram.setU16(0x813094, 6);
    ram.setU16(0x813096, 12);
    resetAndInstallStage26331E(ram, ROM, log);
    ram.setU16(SPAWN.DISTANCE_CLOCK, 0x00e5);
    ram.setU32(SPAWN.LIVE_CURSOR, 0x235b48);
    runSpawnWalker(ram, ROM, log, MT, undefined, palette);

    const a5 = findType(ram, 0x9c);
    const root = ram.u32(a5 + 6);
    const child = root + 0x20;
    ram.setU32(root + 2, 0x40002000);
    ram.setU16(0x8130d2, 1);
    ram.setU16(child, 0x8080);
    ram.setU32(child + 0x10, 0x060006c0);
    ram.setU8(child + 0x15, 0x40);
    ram.setU16(child + 0x16, 0x0540);

    for (const at of [0x0c00, 0x0bfc, 0x0bf8, 0x0bf4, 0x0bf0,
      0x0bec, 0x0be8, 0x0be4, 0x0be0]) {
      ram.setU8(child + 0x14, 0);
      assert.doesNotThrow(() => runHandler(0x27aee0, ram, ROM, a5,
        { tables: MT, unported: log, soundPost() {} }));
      assert.equal(ram.u32(child + 0x0a), ROM.u32(at));
    }
    assert.equal(ram.u16(child + 0x16), 0x051c);
  });
