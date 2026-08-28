// W215: Stage-4 type $9D three-part carrier and its live type $9E child.

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

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const manifestPath = new URL('../assets/manifest.json', import.meta.url);
const HAVE = existsSync(tablesPath) && existsSync(manifestPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const manifest = HAVE ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
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

test('W215 exact type-$9D/$9E closures and 56 visible streams', { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27b2fe));
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27c28e));
  assert.ok(HANDLER_ADDRESSES.includes(0x27b78a));
  assert.ok(HANDLER_ADDRESSES.includes(0x27c2fc));
  assert.equal(sha(0x27b2f6, 0x0f90),
    '7ee65e988c57544bd013dadff0755b72e6d5e2439e4c96698191f5f019aea372');
  assert.equal(sha(0x27c286, 0x027a),
    '2b1ec0224f5ca19eafb565fbd15a69289e0825cd7f9ef2956f70bbca0d1efe5b');
  assert.equal(sha(0x27e4fa, 8),
    '69984ca2d8ee4d3f160d2c5578c9c3b7a979367648efa899d4314de41116988e');
  assert.equal(Buffer.from(ROM.bytes(0x235ff0, 8)).toString('hex'),
    '01d800009d81100f');
  assert.equal(Buffer.from(ROM.bytes(0x2367ce, 6)).toString('hex'),
    'aa0024004000');
  for (const [at, entries] of [['$27C1C4', 16], ['$27C204', 4], ['$27C480', 32]]) {
    const h = manifest.spr.harvest.find((x) => x.at === at);
    assert.ok(h, `W215 harvest ${at}`);
    assert.deepEqual([h.entries, h.distinct, h.added], [entries, entries, entries]);
  }
  const attached = manifest.spr.harvest.find((x) => x.at === '$27B396');
  assert.deepEqual([attached.entries, attached.distinct, attached.added], [4, 4, 4]);
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
  assert.equal(manifest.spr.streamCount, 5893);
});

test('W215 real clock-$1D8 carrier draws and launches a live type-$9E child',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x01d8);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x235ff0);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x235ff8);

  const a5 = findType(ram, 0x9d);
  assert.ok(a5, 'type $9D allocated');
  const root = ram.u32(a5 + 6);
  assert.equal(ram.u16(a5 + 4), 2, 'root plus two attached subrecords');
  assert.deepEqual([ram.u16(0x8130d8), ram.u16(0x8130dc), ram.u16(0x81b414)],
    [1, 1, 1]);

  const bullets = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    bulletSpawn: (site, result) => bullets.push([site, result]) };
  ram.setU16(0x8130d2, 1);
  runHandler(0x27b78a, ram, ROM, a5, ctx);
  assert.equal(ram.u16(BUCKETS[3].counter), 36,
    'root and both attached parts draw while frozen');

  ram.setU16(0x8130d2, 0);
  ram.setU16(a5 + 0x18, 2);
  ram.setU8(a5 + 0x28, 0);
  ram.setU16(a5 + 0x20, 0x24);
  ram.setU8(a5 + 0x2c, 1);
  runHandler(0x27b78a, ram, ROM, a5, ctx);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 0, deferred: 1 });
  const child = findType(ram, 0x9e);
  assert.ok(child, 'type $9E deferred child materialized');
  assert.equal(ram.u32(child + 0x4c), 0x27c2fc);
  ram.setU16(ram.u32(child + 6) + 2, 0x2000);
  runHandler(0x27c2fc, ram, ROM, child, ctx);
  assert.ok(ram.u16(BUCKETS[2].counter) > 0,
    'the live child emits its own cartridge sprite');
});

test('W535 type-$9E negative velocity uses the exact bucket-22 record stub',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const a5 = ENEMY.bandCommon;
  const sub = 0x8145bc;
  ram.setU16(0x8130d8, 1);
  ram.setU32(a5 + 0x06, sub);
  ram.setU16(a5 + 0x1a, 0xfe00);
  ram.setU16(sub + 0x02, 0x2000);
  ram.setU16(sub + 0x04, 0x3000);
  ram.setU16(sub + 0x18, 0x0400);
  ram.setU32(sub + 0x0a, 0x2c90f8);

  const before = ram.u16(BUCKETS[22].counter);
  assert.doesNotThrow(() => runHandler(0x27c2fc, ram, ROM, a5, {}));
  assert.equal(ram.u16(BUCKETS[22].counter), before + 12);
  assert.equal(ram.u16(BUCKETS[2].counter), 0,
    'the negative branch must not use the positive-velocity bucket');
});
