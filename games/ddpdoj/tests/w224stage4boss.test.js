// W224: Stage-4 boss damage-driven F1 destruction, MAIN2/MAIN3, and the A3/D0
// part swap that replaces the intact body with the damaged one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B } from '../src/effects.js';
import { RAM, P } from '../src/machine.js';

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

/** The real Type-$40 boss, advanced through MAIN0's terminal handoff so the
 *  first attack phase is live exactly as W220/W221 leave it. */
function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x02e8);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x236498);
  runSpawnWalker(ram, ROM, log, MT, undefined, palette);
  const a5 = Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === 0x40);
  const a6 = ram.u32(a5 + 0x06);
  const sounds = [];
  const effects = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log, palette,
    soundPost(at) { sounds.push(at); },
    effectSpawn(kind, site, at) { effects.push({ kind, site, at }); },
    bulletSpawn() {} };
  const pass = () => {
    sounds.length = 0;
    effects.length = 0;
    runHandler(0x29ef0a, ram, ROM, a5, ctx);
  };
  pass();
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  ram.setU8(SCHED.seqDst + 0x06, 1);
  ram.setU8(SCHED.seqDst + 0x0c, 0);
  ram.setU8(SCHED.seqDst + 0x0d, 1);
  ram.setU16(a6 + 0x128, 0x001c);
  ram.setU16(SCHED.a2Base + 10 * SCHED.a2Stride, 0x8000);
  ram.setU16(SCHED.a2Base + 11 * SCHED.a2Stride, 0x8001);
  pass();
  return { ram, log, a5, a6, ctx, sounds, effects, pass,
    a2: (i) => ram.u16(SCHED.a2Base + i * SCHED.a2Stride),
    a4: () => Array.from({ length: SCHED.a4Slots },
      (_, i) => ram.u16(SCHED.a4Base + i * SCHED.a4Stride)),
    a3Slot: (id) => Array.from({ length: SCHED.a3Slots },
      (_, i) => SCHED.a3Base + i * SCHED.a3Stride)
      .find((a) => ram.u16(a) !== 0 && (ram.u16(a) & 0xff) === id) };
}

const kindsAt = (effects, site) =>
  effects.filter((e) => e.site === site).map((e) => e.kind);

test('W224 pins the F1/MAIN2/MAIN3/D0 slice, its dispatch entries, and its assets',
  { skip: SKIP }, () => {
    for (const addr of [0x2a019e, 0x2a01d8, 0x29f80a, 0x29f822,
      0x29f826, 0x29f840, 0x2a13cc, 0x2a13e8,
      0x29efd2, 0x29f2de, 0x29f37a, 0x29f03e])
      assert.ok(scriptAddresses().includes(addr), `$${addr.toString(16)} registered`);

    // the five live tables must be what actually names these addresses
    assert.deepEqual([ROM.u32(0x2a0088 + 1 * 8), ROM.u32(0x2a0088 + 1 * 8 + 4)],
      [0x2a019e, 0x2a01d8], 'A4 id1 is F1');
    assert.deepEqual([ROM.u32(0x29f498 + 2 * 8), ROM.u32(0x29f498 + 2 * 8 + 4)],
      [0x29f80a, 0x29f822], 'MAIN2');
    assert.deepEqual([ROM.u32(0x29f498 + 3 * 8), ROM.u32(0x29f498 + 3 * 8 + 4)],
      [0x29f826, 0x29f840], 'MAIN3');
    assert.deepEqual([ROM.u32(0x2a1370), ROM.u32(0x2a1370 + 4)],
      [0x2a13cc, 0x2a13e8], 'A3 id0 is D0');
    assert.deepEqual([6, 7, 8, 9].map((i) => ROM.u32(0x29ef54 + i * 4)),
      [0x29efd2, 0x29f2de, 0x29f37a, 0x29f03e], 'A2 objects 6..9');

    assert.equal(sha(0x2a019e, 0x037c),
      '29396afa0d61d95a89e47332de56ea13cfaa466f1c20c866dcc55a5e24cdc9e9');
    assert.equal(sha(0x29f80a, 0x00c2),
      '36407e0eee1231efba5b07884db6c3caf8b7fa5d6fc9fcc70535e68e2383dee8');
    assert.equal(sha(0x2a13c8, 0x009a),
      'aa1ccf139b04d01adc736d2ef09a183788a2c787e001847a350f3289a426a3aa');

    // the four F1 effect tables end where the port stops reading them
    for (const [at, rows] of [[0x2a046a, 2], [0x2a0484, 1],
      [0x2a0492, 5], [0x2a04d0, 6]]) {
      for (let n = 0; n < rows; n++)
        assert.notEqual(ROM.u16(at + n * 12), 0xffff, `${at.toString(16)} row ${n}`);
      assert.equal(ROM.u16(at + rows * 12), 0xffff,
        `$${at.toString(16)} terminates after ${rows} rows`);
    }

    for (const [at, entries] of [['$29F002', 15], ['$29F096', 16], ['$29F336', 8],
      ['$29F356', 8], ['$29F3D0', 8], ['$DAFC4', 1]]) {
      const h = manifest.spr.harvest.find((x) => x.at === at);
      assert.deepEqual([h.entries, h.distinct, h.added], [entries, entries, entries],
        `${at} harvested`);
    }
    // W414 (docket D51): 4,267 -> 4,291. The exporter gained pool-A kind index 2's
    // sixteen-frame animation and the eight-frame collected popup the star shares
    // with it -- TWENTY-FOUR streams, all into shard 11. This file's own harvest
    // assertions above are the untouched witnesses: none of them moved.
    assert.equal(manifest.spr.streamCount, 4291);
  });

test('W224 the $23000 threshold destroys the body and D0 swaps the damaged one in',
  { skip: SKIP }, () => {
    const { ram, log, a5, a6, pass, sounds, effects, a2, a3Slot, a4 } = fixture();
    const slot = SCHED.a4Base;

    // ---- the damage controller reaches A4 id1 on HP, not on its timeout
    ram.setU32(a5 + 0x16, 0x00022000);
    pass();
    assert.deepEqual(a4(), [0x8001, 0, 0, 0, 0], 'A4 is cleared and F1 armed');
    assert.notEqual(ram.u16(a5 + 0x1a), 0, 'the HP threshold armed it, not the timeout');
    assert.deepEqual([ram.u8(a6 + 0x16c), ram.u8(a6 + 0x5f), ram.u16(0x8130e2)],
      [1, 1, 1]);
    assert.deepEqual(Array.from({ length: SCHED.a1Slots },
      (_, i) => ram.u16(SCHED.a1Base + i * SCHED.a1Stride)), Array(10).fill(0));
    assert.equal(ram.u16(SCHED.seqCursor), 1, 'MAIN1 still owns the sequencer');

    // ---- F1 INIT, and MAIN2 in the same walk because A4 runs before A0
    pass();
    assert.equal(ram.u16(slot), 0x8101);
    assert.deepEqual([ram.u16(a6 + 0x168), ram.u16(a6 + 0x40), ram.u16(a6 + 0x60)],
      [1, 0x8000, 0x8000]);
    assert.deepEqual([ram.u8(slot + 0x02), ram.u16(slot + 0x04)], [0, 0],
      'INIT falls through into STEP and spends its initial word tick');
    assert.deepEqual([ram.u16(slot + 0x06), ram.u16(slot + 0x08)], [0xff02, 0xff04],
      'both byte effects start disabled');
    assert.deepEqual([sounds.length, effects.length], [0, 0]);
    assert.equal(ram.u16(SCHED.seqCursor), 2, 'MAIN2 starts in this same walk');
    assert.equal(ram.u16(SCHED.seqSub), 4, 'MAIN2 ran its INIT; STEP is next');
    assert.deepEqual([ram.u8(a6 + 0x1a), ram.u8(a6 + 0x1b), ram.u8(SCHED.seqDst + 0x02)],
      [0, 0x20, 0x20]);

    // ---- state 0: the central hull goes
    const hull = ram.u32(a6 + 0x102);
    ram.setU16(slot + 0x04, 0);
    pass();
    assert.deepEqual([ram.u8(slot + 0x02), ram.u16(slot + 0x04)], [1, 7],
      'state 1 spends the timer state 0 just wrote');
    assert.equal(ram.u16(slot + 0x06), 0x0002, 'the small byte effect is armed');
    assert.deepEqual(sounds, [0x28c2c2]);
    assert.deepEqual(effects.map((e) => [e.kind, e.site]),
      [[5, 0x2a00cc], [8, 0x2a00cc]]);
    assert.equal(ram.u32(effects[0].at + B.pos), hull);
    assert.equal(a2(5) & 1, 0, 'object 5 stopped');

    // ---- state 1: both pods, and the byte effect fires on its old-zero borrow
    const pod = ram.u32(a6 + 0xc2);
    ram.setU16(slot + 0x04, 0);
    pass();
    assert.deepEqual([ram.u8(slot + 0x02), ram.u16(slot + 0x04)], [2, 7]);
    assert.deepEqual([ram.u16(slot + 0x06), ram.u16(slot + 0x08)], [0x0202, 0x0004]);
    assert.deepEqual(sounds, [0x28c25a]);
    assert.deepEqual(kindsAt(effects, 0x2a01f2), [1], 'the byte effect spawned first');
    assert.deepEqual(kindsAt(effects, 0x2a033c), [4, 7, 4, 5, 5], 'the pod burst');
    assert.deepEqual(kindsAt(effects, 0x2a00cc), [5, 5], 'one row for each pod');
    assert.deepEqual([ram.u16(effects[0].at + B.bucket), ram.u8(effects[0].at + B.speed)],
      [0x0c, 0x10]);
    assert.equal(ram.u32(effects[1].at + B.pos), pod);
    assert.deepEqual([a2(3) & 1, a2(4) & 1], [0, 0], 'objects 3 and 4 stopped');

    // ---- state 2: the mount, whose rows carry the exact table fields
    const mount = ram.u32(a6 + 0x62);
    const speed = ram.u8(a6 + 0x1a);
    const angle = ram.u8(a6 + 0x1b);
    ram.setU16(slot + 0x04, 0);
    pass();
    assert.deepEqual([ram.u8(slot + 0x02), ram.u16(slot + 0x04)], [3, 0x5f]);
    assert.deepEqual(sounds, [0x28c274]);
    assert.deepEqual(kindsAt(effects, 0x2a024e), [0x10]);
    assert.deepEqual(kindsAt(effects, 0x2a0292), [0x10]);
    assert.deepEqual(kindsAt(effects, 0x2a00cc), [8, 0x85, 0x8d, 8, 0x85]);
    const row3 = effects.filter((e) => e.site === 0x2a00cc)[3].at;
    assert.deepEqual([ram.u16(row3 + B.delay), ram.u8(row3 + B.f1c),
      ram.u32(row3 + B.nudge), ram.u32(row3 + B.pos), ram.u16(row3 + B.bucket),
      ram.u8(row3 + B.speed), ram.u8(row3 + B.angle)],
    [0x000c, 0x40, 0xf000fc00, mount, 0x10, speed, (angle * 4) & 0xff]);
    assert.equal(a2(2) & 1, 0, 'object 2 stopped');

    // ---- state 3: F1 retires into MAIN3, which starts D0 in the same walk
    ram.setU16(slot + 0x04, 0);
    pass();
    assert.deepEqual(sounds, [0x28c2dc]);
    assert.deepEqual(kindsAt(effects, 0x2a03f8), [4, 7, 4, 5, 5]);
    assert.deepEqual(kindsAt(effects, 0x2a041c), [4, 7, 4, 5, 5]);
    assert.deepEqual(kindsAt(effects, 0x2a00cc), [8, 0x85, 0x8d, 8, 0x85, 0x85]);
    assert.deepEqual(a4(), [0, 0, 0, 0, 0], 'F1 retired and F5 is not armed yet');
    assert.equal(ram.u16(SCHED.seqCursor), 3, 'MAIN3');
    assert.deepEqual([ram.u8(SCHED.seqDst + 0x02), ram.u8(SCHED.seqDst + 0x06)],
      [0x20, 0], 'MAIN3 is still far from its target');
    const d0 = a3Slot(0);
    assert.ok(d0, 'D0 started in this same walk');
    assert.equal(ram.u16(d0 + 0x02), 0x0102,
      'D0 INIT falls through and spends its byte tick');
    assert.deepEqual([a2(1) & 1, a2(0) & 1, a2(6)], [0, 0, 0x8001],
      'D0 swapped object 0 for object 6 before the A2 walk');

    // ---- D0 walks the fifteen opening rows, +4 every third call, and ends on $3C
    const bucket = BUCKETS[3];
    const drawn = [];
    let passes = 0;
    let advances = 0;
    while (ram.u16(d0) !== 0) {
      const before = ram.u16(a6 + 0x106);
      const count = ram.u16(bucket.counter);
      pass();
      passes++;
      assert.ok(passes <= 44, 'D0 terminates on exact equality, it does not run on');
      if (ram.u16(a6 + 0x106) !== before) advances++;
      if (ram.u16(d0) !== 0) {
        drawn.push([ram.u16(a6 + 0x106),
          ram.u32(bucket.buffer + count + 4), ram.u16(bucket.counter) - count]);
      } else {
        assert.deepEqual([ram.u32(bucket.buffer + count + 4),
          ram.u32(bucket.buffer + count + 16)], [ROM.u32(0x29f096), 0x000dafc4],
        'the terminal pass draws object 9 and its fixed overlay stream');
        assert.equal(ram.u16(bucket.counter) - count, 24);
      }
    }
    assert.deepEqual([passes, advances], [44, 15]);
    assert.deepEqual([...new Set(drawn.map((d) => d[0]))].sort((x, y) => x - y),
      Array.from({ length: 15 }, (_, i) => i * 4), 'all fifteen opening rows');
    for (const [cursor, descriptor, bytes] of drawn) {
      assert.equal(descriptor, ROM.u32(0x29f002 + cursor), `row $${cursor.toString(16)}`);
      assert.equal(bytes, 12, 'object 6 is the only boss draw while D0 runs');
    }

    // ---- the damaged body: object 6 gone, objects 9/7/8 live, geometry swapped
    assert.deepEqual(Array.from({ length: 7 }, (_, i) => a2(i)), Array(7).fill(0x8000));
    assert.deepEqual([a2(7), a2(8), a2(9)], [0x8001, 0x8001, 0x8001]);
    assert.deepEqual([0x30, 0x32, 0x34, 0x36].map((off) => ram.u16(a6 + off)),
      [0x0c00, 0x0d80, 0x0900, 0x0900]);
    assert.deepEqual([ram.u16(a6 + 0x80), ram.u16(a6 + 0xa0), ram.u16(a6 + 0x106),
      ram.u16(a6 + 0x168)], [0xa001, 0xa001, 0, 0]);

    const pods = BUCKETS[1];
    const podCount = ram.u16(pods.counter);
    const hullCount = ram.u16(bucket.counter);
    pass();
    assert.equal(ram.u16(pods.counter) - podCount, 48, 'objects 7 and 8, two records each');
    assert.deepEqual(Array.from({ length: 4 },
      (_, i) => ram.u32(pods.buffer + podCount + i * 12 + 4)),
    [ROM.u32(0x29f336 + ram.u16(a6 + 0x86)), ROM.u32(0x29f356 + ram.u16(a6 + 0x88)),
      ROM.u32(0x29f3d0 + ram.u16(a6 + 0xa6)), ROM.u32(0x29f356 + ram.u16(a6 + 0xa8))]);
    assert.equal(ram.u32(pods.buffer + podCount + 16),
      ram.u32(pods.buffer + podCount + 40), 'objects 7 and 8 share one overlay table');
    assert.equal(ram.u16(bucket.counter) - hullCount, 24, 'object 9 keeps drawing');
    assert.deepEqual(log.report(), [], 'the whole transition runs without a gap');
  });
