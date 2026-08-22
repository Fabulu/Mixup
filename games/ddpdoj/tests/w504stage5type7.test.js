// W504/W505/W506: drive the loop-2 type-$13 handoff through type 7's first three scripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { WorkBudget } from '../src/budget.js';
import { ObjOrder, runObjectDriver, OBJ } from '../src/objdriver.js';
import { stageCreate, ALLOC } from '../src/objalloc.js';
import { SE, ENDING13, makeStage5Ending } from '../src/stageend.js';
import { objSlot7, POOL7, SCRIPT7, SLOT7 } from '../src/objslot7pool.js';
import { runAnimObjects24683E } from '../src/animobjects.js';
import { BUCKETS } from '../src/spritequeue.js';
import { BgVram, TxVram, VideoRegs, SlotTable907000 } from '../src/background.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TJ.rom) : null;
const MOVE = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false : 'rip/port/player.tables.json missing; run export-tables.py';

const FIRST_SCRIPT = 0x290f66;
const SECOND_SCRIPT = 0x290f8e;
const THIRD_SCRIPT = 0x290fe2;
const NEXT_SCRIPT = 0x2910f6;
const FIRST_INDICES = Object.freeze([0xe0, 0x4a, 0x65, 0xcc, 0x73, 0x5b, 0x59, 0x05]);
const FIRST_ART = Object.freeze([
  0x1ec778, 0x1eb260, 0x1eb62c, 0x1ec4a8,
  0x1eb824, 0x1eb4c4, 0x1eb47c, 0x1ea8ac,
]);
const SECOND_INDICES = Object.freeze([
  0xc1, 0xcc, 0xff, 0xaf, 0x64,
  0x9b, 0xf0, 0xed, 0x61, 0xa5, 0x10f, 0x64, 0xe1, 0x62,
  0x10f, 0xda, 0x4f, 0x6e, 0x4b, 0x5f, 0x54, 0x59, 0xc8, 0x05, 0x05, 0x05,
]);
const SECOND_ART = Object.freeze([
  0x1ec31c, 0x1ec4a8, 0x1ecbd4, 0x1ec094, 0x1eb608,
  0x1ebdc4, 0x1ec9b8, 0x1ec94c, 0x1eb59c, 0x1ebf2c, 0x1ece14, 0x1eb608,
  0x1ec79c, 0x1eb5c0, 0x1ece14, 0x1ec6a0, 0x1eb314, 0x1eb770, 0x1eb284,
  0x1eb554, 0x1eb3c8, 0x1eb47c, 0x1ec418, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SECOND_POSITIONS = Object.freeze([
  ...Array.from({ length: 5 }, (_, i) => 0x48000200 + i * 0x400),
  ...Array.from({ length: 9 }, (_, i) => 0x40000200 + i * 0x400),
  ...Array.from({ length: 12 }, (_, i) => 0x38000200 + i * 0x400),
]);
const THIRD_INDICES = Object.freeze([
  0x7f, 0x93, 0x07, 0x84, 0x77, 0x76, 0x65, 0x106, 0x102, 0x62, 0x6c,
  0xec, 0x64, 0x8e, 0x7e, 0x07, 0x7d, 0x98, 0x8a, 0x92, 0x07, 0x81, 0x62,
  0x82, 0x78, 0x8b, 0x54, 0x59, 0x05, 0x05, 0x05,
]);
const THIRD_ART = Object.freeze([
  0x1eb9d4, 0x1ebca4, 0x1ea8f4, 0x1eba88, 0x1eb8b4, 0x1eb890, 0x1eb62c,
  0x1eccd0, 0x1ecc40, 0x1eb5c0, 0x1eb728, 0x1ec928, 0x1eb608, 0x1ebbf0,
  0x1eb9b0, 0x1ea8f4, 0x1eb98c, 0x1ebd58, 0x1ebb60, 0x1ebc80, 0x1ea8f4,
  0x1eba1c, 0x1eb5c0, 0x1eba40, 0x1eb8d8, 0x1ebb84, 0x1eb3c8, 0x1eb47c,
  0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const THIRD_POSITIONS = Object.freeze([
  ...Array.from({ length: 11 }, (_, i) => 0x48000200 + i * 0x400),
  ...Array.from({ length: 12 }, (_, i) => 0x40000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x38000200 + i * 0x400),
]);

function clearSpriteCounters(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

function livePoolRecords(ram) {
  const out = [];
  for (let i = 0; i < POOL7.entries; i++) {
    const at = POOL7.base + i * POOL7.stride;
    const art = ram.u32(at) >>> 0;
    if (art !== 0) out.push({ art, position: ram.u32(at + 4) >>> 0 });
  }
  return out;
}

test('W504/W505/W506: natural loop-2 type $13 handoff completes type 7 first three scripts',
  { skip: SKIP }, () => {
    assert.equal(ROM.u32(0x290f12), 0x290f1e,
      '$290F12 variant 0 points at its five-step list');
    assert.equal(ROM.u32(0x290f1e), FIRST_SCRIPT,
      'the first list entry is the common $290F66 script');
    assert.deepEqual([0x290f22, 0x290f3a, 0x290f52].map((at) => ROM.u32(at)),
      [SECOND_SCRIPT, SECOND_SCRIPT, SECOND_SCRIPT],
      'all three variant lists use $290F8E as entry 1');
    assert.equal(ROM.u32(0x290f26), THIRD_SCRIPT,
      'variant 0 entry 2 selects $290FE2 after the common script');
    assert.equal(ROM.u32(0x290f2a), NEXT_SCRIPT,
      'variant 0 entry 3 selects the next common $2910F6 script');
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => ROM.u16(FIRST_SCRIPT + i * 2)), [
      0x8000, 0x3000, 0x8001, 0x3c00, 0x0800,
      0x00e0, 0x004a, 0x0065, 0x00cc, 0x0073,
      0x005b, 0x0059, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$290F66..$290F8D is the exact first script');
    assert.deepEqual(FIRST_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      FIRST_ART, 'the first script resolves its eight concrete data words through $2902C2');
    assert.deepEqual(Array.from({ length: 42 }, (_, i) => ROM.u16(SECOND_SCRIPT + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x4800, 0x0200, 0x00c1, 0x00cc, 0x00ff, 0x00af, 0x0064,
      0x8001, 0x4000, 0x0200, 0x009b, 0x00f0, 0x00ed, 0x0061, 0x00a5,
      0x010f, 0x0064, 0x00e1, 0x0062,
      0x8001, 0x3800, 0x0200, 0x010f, 0x00da, 0x004f, 0x006e, 0x004b,
      0x005f, 0x0054, 0x0059, 0x00c8, 0x0005, 0x0005, 0x0005,
      0x8002, 0x00c0, 0x8003, 0x0000, 0xffff,
    ], '$290F8E..$290FE1 is the exact second script');
    assert.deepEqual(SECOND_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      SECOND_ART, 'the second script resolves all 26 data words through $2902C2');
    assert.deepEqual(Array.from({ length: 47 }, (_, i) => ROM.u16(THIRD_SCRIPT + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x4800, 0x0200, 0x007f, 0x0093, 0x0007, 0x0084, 0x0077,
      0x0076, 0x0065, 0x0106, 0x0102, 0x0062, 0x006c,
      0x8001, 0x4000, 0x0200, 0x00ec, 0x0064, 0x008e, 0x007e, 0x0007,
      0x007d, 0x0098, 0x008a, 0x0092, 0x0007, 0x0081, 0x0062,
      0x8001, 0x3800, 0x0200, 0x0082, 0x0078, 0x008b, 0x0054, 0x0059,
      0x0005, 0x0005, 0x0005, 0x8002, 0x00c0, 0x8003, 0x0000, 0xffff,
    ], '$290FE2..$29103F is the exact variant-0 third script');
    assert.deepEqual(THIRD_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      THIRD_ART, 'the third script resolves all 31 data words through $2902C2');

    const ram = new Ram();
    const log = new UnportedLog();
    const events = [];
    const ctx = {
      rom: ROM,
      tables: MOVE,
      budget: new WorkBudget(),
      order: new ObjOrder(),
      unportedLog: log,
      unported: log,
      videoRegs: new VideoRegs(),
      tx: new TxVram(),
      bgVram: new BgVram(),
      slotTable: new SlotTable907000(),
      soundPost: () => true,
      stageEndEvent: (...event) => events.push(event),
    };
    const handlers = new Map([
      [0x13, makeStage5Ending(ROM)],
      [0x07, (r, slot, _index, c) => objSlot7(r, ROM, slot, c)],
    ]);

    ram.setU16(SE.p1, 0x8000);
    ram.setU16(0x813098, 1);
    ram.setU16(SLOT7.postD1[0], 2);
    const created = stageCreate(ram, 0x13,
      (type) => ROM.u16(SE.dispatch + type * 8 + 4));
    assert.equal(created.result, 'ok');

    let sawType7 = false;
    let sawFirstResource = false;
    let sawSecondResource = false;
    let sawThirdResource = false;
    let maxFirstLive = 0;
    let maxSecondLive = 0;
    let maxThirdLive = 0;
    let secondPeak = [];
    let thirdPeak = [];
    let nextError = null;
    const firstSeenArt = new Set();
    for (let frame = 0; frame < 1200 && nextError == null; frame++) {
      clearSpriteCounters(ram);
      ctx.budget.beginFrame();
      try {
        runObjectDriver(ram, handlers, ctx);
      } catch (error) {
        nextError = error;
        break;
      }
      if (frame === 0) ram.setU16(ENDING13.base + ENDING13.timer, 0);
      runAnimObjects24683E(ram, ROM);

      for (let i = 0; i < OBJ.slots; i++) {
        if ((ram.u16(OBJ.base + i * OBJ.stride) & 0xff) === 7) sawType7 = true;
      }
      const sequenceCursor = ram.u16(SLOT7.work + 0x0c);
      if (ram.u32(SCRIPT7.resource) !== 0) {
        if (sequenceCursor === 0) sawFirstResource = true;
        if (sequenceCursor === 4) sawSecondResource = true;
        if (sequenceCursor === 8) sawThirdResource = true;
      }
      const live = livePoolRecords(ram);
      if (sequenceCursor === 0) {
        maxFirstLive = Math.max(maxFirstLive, live.length);
        for (const { art } of live) firstSeenArt.add(art);
      }
      if (sequenceCursor === 4 && live.length > maxSecondLive) {
        maxSecondLive = live.length;
        secondPeak = live;
      }
      if (sequenceCursor === 8 && live.length > maxThirdLive) {
        maxThirdLive = live.length;
        thirdPeak = live;
      }
    }

    assert.ok(sawType7, '$28D5FA staged type 7 and the object driver committed it');
    assert.ok(events.some(([kind]) => kind === 'ending-handoff'),
      'the exact type-$13 handoff fired');
    assert.equal(maxFirstLive, 10, 'the first script allocated all ten pool records');
    assert.deepEqual([...firstSeenArt], FIRST_ART,
      'the first script exposed all eight distinct cartridge-selected art pointers in order');
    assert.ok(sawFirstResource, 'the first $8003 loaded its one-node $290E58 resource');
    assert.equal(maxSecondLive, 26, 'the second script allocated all 26 pool records');
    assert.deepEqual(secondPeak.map(({ art }) => art), SECOND_ART,
      'the second script preserved all cartridge-selected art pointers and repetitions');
    assert.deepEqual(secondPeak.map(({ position }) => position), SECOND_POSITIONS,
      'the second script preserved all three $8001 bases and each $400 low-word bump');
    assert.ok(sawSecondResource, 'the second $8003 loaded its one-node $290E58 resource');
    assert.equal(maxThirdLive, 31, 'the third script allocated all 31 pool records');
    assert.deepEqual(thirdPeak.map(({ art }) => art), THIRD_ART,
      'the third script preserved all cartridge-selected art pointers and repetitions');
    assert.deepEqual(thirdPeak.map(({ position }) => position), THIRD_POSITIONS,
      'the third script preserved all three $8001 bases and each $400 low-word bump');
    assert.ok(sawThirdResource, 'the third $8003 loaded its one-node $290E58 resource');
    assert.equal(ram.u32(SCRIPT7.resource), 0,
      'the third resource completed the shared load, wait, free, clear, and advance path');
    assert.equal(ram.u16(SLOT7.work + 0x0c), 12,
      'inner state 0 advanced from list entry 2 to list entry 3');
    assert.ok(nextError instanceof Unreached,
      `the bounded run should stop at the fourth unwidened script, got ${nextError}`);
    assert.equal(nextError.romAddress, NEXT_SCRIPT,
      'the next executable edge is variant 0 fourth script at $2910F6');
    assert.equal(ram.u16(ALLOC.createSp), 0, 'the type-7 create queue drained');
  });
