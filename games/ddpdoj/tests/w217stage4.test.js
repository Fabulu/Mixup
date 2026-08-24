// W217: Stage-4 type $A1 reverse-animated structure.

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

test('W217 pins the complete Type-A1 closure and sixteen new frames',
  { skip: SKIP }, () => {
    assert.ok(INIT_BODY_ADDRESSES.includes(0x27ceb4));
    assert.ok(HANDLER_ADDRESSES.includes(0x27cf0c));
    assert.equal(sha(0x27ceac, 0x00f8),
      'bbeb9978b6413ed50487e703528b3e70fbd7f119b5c85e7c559c1daa7731cf1b');
    assert.equal(Buffer.from(ROM.bytes(0x27e51a, 8)).toString('hex'),
      '0027ceac0027cf0c');
    assert.equal(Buffer.from(ROM.bytes(0x2360d8, 8)).toString('hex'),
      '02360000a1011010');
    assert.equal(Buffer.from(ROM.bytes(0x2367d4, 6)).toString('hex'),
      'aa0024004000');
    const h = manifest.spr.harvest.find((x) => x.at === '$27CF64');
    assert.ok(h);
    assert.deepEqual([h.entries, h.distinct, h.added, h.already],
      [16, 16, 16, 0]);
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
    assert.equal(manifest.spr.streamCount, 4915);
  });

test('W217 real clock-$236 spawn animates, draws, and retires on re-entry',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const log = new UnportedLog();
    const palette = new PaletteState();
    ram.setU16(0x813092, 3);
    ram.setU16(0x813094, 6);
    resetAndInstallStage26331E(ram, ROM, log);
    ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0236);
    ram.setU32(SPAWN.LIVE_CURSOR, 0x2360d8);
    assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
      { script: 1, deferred: 0 });
    assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2360e0);

    const a5 = findType(ram, 0xa1);
    assert.ok(a5);
    assert.equal(ram.u16(a5 + 4), 0);
    assert.equal(ram.u32(a5 + 0x44), 0x27cf0c);
    assert.equal(palette.installCount, 1);
    const root = ram.u32(a5 + 6);
    const ctx = { tables: MT, unported: log };
    ram.setU16(0x8130d2, 1);

    runHandler(0x27cf0c, ram, ROM, a5, ctx);
    assert.equal(ram.u32(root + 0x0a), 0x002d05e8,
      'first call selects the last table entry at cursor $3C');
    assert.equal(ram.u16(a5 + 0x1a), 0x0038);

    ram.setU16(root + 2, 0);
    runHandler(0x27cf0c, ram, ROM, a5, ctx);
    assert.equal(ram.u8(a5 + 0x16), 1, 'inside pass arms the re-entry latch');
    ram.setU16(root + 2, 0xaa00);
    runHandler(0x27cf0c, ram, ROM, a5, ctx);
    assert.equal(ram.u16(a5), 0, 'returning to the outside carry band frees it');
  });
