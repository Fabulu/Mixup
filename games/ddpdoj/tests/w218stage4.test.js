// W218: Stage-4 type $9F structure and its live type-$A4 fragments.

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
import {
  resetAndInstallStage26331E, runSpawnWalker, processDeferred, SPAWN,
} from '../src/spawn.js';
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

function enemiesOfType(ram, type) {
  return Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .filter((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === type);
}

function stage4At266() {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0266);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x2361f0);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 3, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x236208);
  const a5 = enemiesOfType(ram, 0x9f)[0];
  assert.ok(a5);
  return { ram, log, palette, a5, root: ram.u32(a5 + 0x06) };
}

test('W218 pins the type-$9F/$A4 closures and complete live art set',
  { skip: SKIP }, () => {
    assert.ok(INIT_BODY_ADDRESSES.includes(0x27c5be));
    assert.ok(INIT_BODY_ADDRESSES.includes(0x27da78));
    assert.ok(HANDLER_ADDRESSES.includes(0x27c81a));
    assert.ok(HANDLER_ADDRESSES.includes(0x27db30));
    assert.equal(sha(0x27c5b6, 0x08f6),
      '747e71a5bc3e5171bc7765157d1cbcd7e2f5af0eb5c380b00b3101ce7b6308a2');
    assert.equal(sha(0x27da70, 0x0184),
      '01ec65e86e5e0d2c36a1f9eb5a07eae6b6374d088974c74ccc37a156e7b7d9ce');
    assert.equal(Buffer.from(ROM.bytes(0x27e50a, 8)).toString('hex'),
      '0027c5b60027c81a');
    assert.equal(Buffer.from(ROM.bytes(0x27e532, 8)).toString('hex'),
      '0027da700027db30');
    assert.equal(Buffer.from(ROM.bytes(0x2361f0, 8)).toString('hex'),
      '026600009f811011');
    assert.equal(Buffer.from(ROM.bytes(0x2367da, 6)).toString('hex'),
      'b80024004000');

    for (const [at, entries] of [
      ['$27CB7A', 15], ['$2EF328', 1], ['$2F12AC', 1], ['$2F3230', 1],
      ['$52C1C', 8], ['$52DBC', 8], ['$52F5C', 8],
    ]) {
      const h = manifest.spr.harvest.find((x) => x.at === at);
      assert.ok(h, `${at} harvest exists`);
      assert.equal(h.entries, entries);
      assert.equal(h.distinct, entries);
    }
    // W414 (docket D51): 4,267 -> 4,291. The exporter gained pool-A kind index 2's
    // sixteen-frame animation and the eight-frame collected popup the star shares
    // with it -- TWENTY-FOUR streams, all into shard 11. This file's own harvest
    // assertions above are the untouched witnesses: none of them moved.
    // W417: 4,291 -> 4,307. Pool-A kind index 3's own sixteen-frame animation
    // ($1BE94C..$1BF4C8, stride $C4), whose body W417 ports in the same wave.
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
    assert.equal(manifest.spr.streamCount, 5091,
      'W220 adds 64 live boss-part streams after the arrival body; W275 adds the 50 '
      + 'of the ship\'s dying animation. W497 then adds 543 authentic Type-B/selection '
      + 'streams, W498 adds nine Game Over streams, and W589 adds 105 slot-7 list-B '
      + 'streams. The bundle total is exact, not a floor');
  });

test('W218 real clock-$266 spawn damages, sheds a live fragment, and draws it',
  { skip: SKIP }, () => {
    const { ram, log, palette, a5, root } = stage4At266();
    assert.equal(ram.u16(a5 + 0x04), 2);
    assert.equal(ram.u32(a5 + 0x44), 0x27c68e);
    assert.equal(palette.installCount, 3);
    assert.equal(ram.u32(root + 0x0a), 0x002ef328);

    // Exercise the linked signed-min damage path while state 2 emits the
    // actual deferred fragment record used during the structure opening.
    ram.setU32(a5 + 0x12, 0);                          // isolate from movement
    ram.setU16(root + 0x02, 0x5000);
    ram.setU16(root + 0x04, 0x2400);
    ram.setU8(root, 0x84);
    ram.setU8(root + 0x40, 0x88);
    ram.setU16(root + 0x18, 0x7000);
    ram.setU16(root + 0x58, 0x6000);
    ram.setU16(a5 + 0x32, 0);                          // armor interval has expired
    ram.setU16(a5 + 0x18, 2);
    ram.setU16(a5 + 0x38, 0);
    const sounds = [];
    const ctx = { tables: MT, unported: log, palette,
      soundPost: (entry) => sounds.push(entry) };
    runHandler(0x27c81a, ram, ROM, a5, ctx);
    assert.equal(ram.u16(root + 0x18), 0x6000);
    assert.equal(ram.u16(root + 0x58), 0x6000);
    assert.equal(ram.u8(root + 0x1d), 0x1f);
    assert.equal(processDeferred(ram, ROM, log, MT), 1);

    const child = enemiesOfType(ram, 0xa4)[0];
    assert.ok(child, 'state 2 materializes its live type-$A4 child');
    assert.equal(ram.u32(child + 0x24), root + 0x20);
    assert.equal(ram.u16(child + 0x28), 0x0800);
    const sub = ram.u32(child + 0x06);
    const first = ram.u32(sub + 0x0a);
    runHandler(0x27db30, ram, ROM, child, ctx);
    assert.notEqual(ram.u32(child + 0x1c), 0,
      'the live fragment computes its independent shifted-vector draw position');
    ram.setU16(0x8130d2, 1);                           // deterministic due art step
    runHandler(0x27db30, ram, ROM, child, ctx);
    assert.equal(ram.u32(sub + 0x0a), first + 0x34);
  });
