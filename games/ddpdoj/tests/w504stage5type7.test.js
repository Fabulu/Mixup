// W504: drive the loop-2 type-$13 handoff into type 7 and close its first script step.
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
const NEXT_SCRIPT = 0x290f8e;
const FIRST_INDICES = Object.freeze([0xe0, 0x4a, 0x65, 0xcc, 0x73, 0x5b, 0x59, 0x05]);
const FIRST_ART = Object.freeze([
  0x1ec778, 0x1eb260, 0x1eb62c, 0x1ec4a8,
  0x1eb824, 0x1eb4c4, 0x1eb47c, 0x1ea8ac,
]);

function clearSpriteCounters(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

function livePoolArt(ram) {
  const out = [];
  for (let i = 0; i < POOL7.entries; i++) {
    const art = ram.u32(POOL7.base + i * POOL7.stride) >>> 0;
    if (art !== 0) out.push(art);
  }
  return out;
}

test('W504: natural loop-2 type $13 handoff completes type 7 first script step',
  { skip: SKIP }, () => {
    assert.equal(ROM.u32(0x290f12), 0x290f1e,
      '$290F12 variant 0 points at its five-step list');
    assert.equal(ROM.u32(0x290f1e), FIRST_SCRIPT,
      'the first list entry is the common $290F66 script');
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => ROM.u16(FIRST_SCRIPT + i * 2)), [
      0x8000, 0x3000, 0x8001, 0x3c00, 0x0800,
      0x00e0, 0x004a, 0x0065, 0x00cc, 0x0073,
      0x005b, 0x0059, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$290F66..$290F8D is the exact first script');
    assert.deepEqual(FIRST_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      FIRST_ART, 'the eight concrete data words resolve through $2902C2');

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
    let sawResource = false;
    let maxLiveArt = 0;
    let nextError = null;
    const seenArt = new Set();
    for (let frame = 0; frame < 400 && nextError == null; frame++) {
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
      if (ram.u32(SCRIPT7.resource) !== 0) sawResource = true;
      const liveArt = livePoolArt(ram);
      maxLiveArt = Math.max(maxLiveArt, liveArt.length);
      for (const art of liveArt) seenArt.add(art);
    }

    assert.ok(sawType7, '$28D5FA staged type 7 and the object driver committed it');
    assert.ok(events.some(([kind]) => kind === 'ending-handoff'),
      'the exact type-$13 handoff fired');
    assert.equal(maxLiveArt, 10, 'all ten plain data words allocated one pool record');
    assert.deepEqual([...seenArt], FIRST_ART,
      'the ten spawns exposed all eight distinct cartridge-selected art pointers in order');
    assert.ok(sawResource, '$8003 loaded and waited on its one-node $290E58 resource');
    assert.equal(ram.u32(SCRIPT7.resource), 0,
      '$290A92..$290AA2 freed the completed resource and advanced the script cursor');
    assert.equal(ram.u16(SLOT7.work + 0x0c), 4,
      'inner state 0 advanced from list entry 0 to list entry 1');
    assert.ok(nextError instanceof Unreached,
      `the bounded run should stop at the next unwidened script, got ${nextError}`);
    assert.equal(nextError.romAddress, NEXT_SCRIPT,
      'the next executable edge is the second common script at $290F8E');
    assert.equal(ram.u16(ALLOC.createSp), 0, 'the type-7 create queue drained');
  });
