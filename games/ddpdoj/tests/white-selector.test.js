import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALLOC } from '../src/objalloc.js';
import { BLACK_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { FullRom } from '../src/rom.js';
import { WHITE_CHOOSER } from '../src/white-frontend.js';
import {
  WHITE_RANK, clearWhiteRank15F734, playerRecords15F1B0,
} from '../src/white-rank.js';
import {
  WHITE_SELECTOR,
  seedWhiteSelector15BC16,
  whiteSelectorTick15BE3E,
} from '../src/white-selector.js';

const IMAGE = fileURLToPath(new URL('../rip/rosetta/img-ddpdojblk.bin', import.meta.url));
const rawTest = (name, fn) => test(name, { skip: !existsSync(IMAGE) }, fn);

function syntheticRom() {
  const reads = [];
  return {
    reads,
    u16(address) {
      reads.push(['u16', address]);
      if (address === WHITE_CHOOSER.dispatchTable + WHITE_SELECTOR.childType * 8 + 4) return 0x001f;
      if (address >= WHITE_SELECTOR.shipTable
          && address < WHITE_SELECTOR.shipTable + WHITE_SELECTOR.shipChoices * 2) {
        return [0, 2][(address - WHITE_SELECTOR.shipTable) / 2];
      }
      if (address >= WHITE_SELECTOR.styleTable
          && address < WHITE_SELECTOR.styleTable + WHITE_SELECTOR.styleChoices * 2) {
        return [2, 4, 6][(address - WHITE_SELECTOR.styleTable) / 2];
      }
      for (const [side, table] of WHITE_SELECTOR.styleOrderTables.entries()) {
        if (address >= table && address < table + WHITE_SELECTOR.styleChoices * 2) {
          return [[0, 1, 2], [2, 1, 0]][side][(address - table) / 2];
        }
      }
      throw new Error(`unexpected synthetic u16 read $${address.toString(16)}`);
    },
    u32(address) {
      reads.push(['u32', address]);
      if (address >= WHITE_SELECTOR.copySource
          && address < WHITE_SELECTOR.copySource + WHITE_SELECTOR.copyLongs * 4) {
        return (0xa5000000 | (address - WHITE_SELECTOR.copySource)) >>> 0;
      }
      throw new Error(`unexpected synthetic u32 read $${address.toString(16)}`);
    },
    bytes(address, length) {
      reads.push(['bytes', address, length]);
      return new Uint8Array(length);
    },
  };
}

function fillWords(ram, base, words, value = 0xdead) {
  for (let i = 0; i < words; i++) ram.setU16(base + i * 2, value);
}

function bytesAt(ram, base, length) {
  return Array.from({ length }, (_, i) => ram.u8(base + i));
}

function seed(ram, rom, mask, ctx) {
  const a5 = ALLOC.table;
  ram.setU8(a5 + WHITE_SELECTOR.objectMaskAt, mask);
  return seedWhiteSelector15BC16(ram, rom, a5, ctx, undefined);
}

function tick(ram, rom, ctx) {
  return whiteSelectorTick15BE3E(ram, rom, ALLOC.table, ctx, undefined);
}

function chooseSingle(side, shipIndex, styleIndex, suppliedRom) {
  const ram = new Ram();
  const rom = suppliedRom ?? syntheticRom();
  const mask = side === 0 ? 1 : 2;
  seed(ram, rom, mask);

  tick(ram, rom);
  const edge = side === 0 ? WHITE_SELECTOR.p1EdgeAddress : WHITE_SELECTOR.p2EdgeAddress;
  if (shipIndex !== 0) {
    ram.setU16(edge, WHITE_SELECTOR.nextBit);
    tick(ram, rom);
  }
  ram.setU16(edge, 0x10);
  tick(ram, rom);
  ram.setU16(edge, 0);
  tick(ram, rom);
  const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
  const currentStyle = ram.u16(record + WHITE_SELECTOR.styleCursorAt);
  const styleSteps = (styleIndex - currentStyle + WHITE_SELECTOR.styleChoices)
    % WHITE_SELECTOR.styleChoices;
  for (let i = 0; i < styleSteps; i++) {
    ram.setU16(edge, WHITE_SELECTOR.nextBit);
    tick(ram, rom);
  }
  ram.setU16(edge, 0x10);
  const result = tick(ram, rom);
  return { ram, result };
}

test('White selector rejects other editions before RAM or ROM access', () => {
  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected selector input was touched');
    },
  });
  assert.throws(
    () => seedWhiteSelector15BC16(untouched, untouched, 0, undefined, BLACK_LABEL_PROFILE),
    /White Label selector seed is unavailable/,
  );
  assert.equal(reads, 0);
});

test('Version A seed creates two exact records and applies all native join masks', () => {
  for (const mask of [0, 1, 2, 3]) {
    const ram = new Ram();
    const rom = syntheticRom();
    fillWords(ram, WHITE_SELECTOR.selectRecords, WHITE_SELECTOR.selectRecordWords);
    fillWords(ram, WHITE_SELECTOR.aux, WHITE_SELECTOR.auxWords);
    fillWords(ram, WHITE_SELECTOR.frontend, WHITE_SELECTOR.frontendWords);
    fillWords(ram, WHITE_SELECTOR.records, WHITE_SELECTOR.recordWords);
    fillWords(ram, WHITE_SELECTOR.copyTarget, WHITE_SELECTOR.copyLongs * 2);
    ram.setU16(WHITE_SELECTOR.selectRecords - 2, 0x55aa);
    const afterCopy = WHITE_SELECTOR.copyTarget + WHITE_SELECTOR.copyLongs * 4;
    ram.setU16(afterCopy, 0xaa55);
    const result = seed(ram, rom, mask);

    assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectStateAt), 1);
    assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectMaskAt), 0xff,
      'the consumed mask becomes the first no-choice sentinel');
    assert.deepEqual(result.live, [mask & 1 ? 1 : 0, mask & 2 ? 1 : 0]);
    assert.deepEqual(bytesAt(ram, WHITE_SELECTOR.selectRecords,
      WHITE_SELECTOR.selectRecordWords * 2), new Array(WHITE_SELECTOR.selectRecordWords * 2).fill(0));
    assert.deepEqual(Array.from({ length: WHITE_SELECTOR.auxWords },
      (_, i) => ram.u16(WHITE_SELECTOR.aux + i * 2)), [WHITE_SELECTOR.auxSeed, 0, 0, 0, 0]);
    assert.deepEqual(bytesAt(ram, WHITE_SELECTOR.frontend, WHITE_SELECTOR.frontendWords * 2),
      new Array(WHITE_SELECTOR.frontendWords * 2).fill(0));
    for (let side = 0; side < WHITE_SELECTOR.recordCount; side++) {
      const expectedRecord = new Uint8Array(WHITE_SELECTOR.recordStride);
      const view = new DataView(expectedRecord.buffer);
      expectedRecord[WHITE_SELECTOR.liveAt] = result.live[side];
      view.setUint32(0x56, 0xffffffff, false);
      for (const [offset, value] of WHITE_SELECTOR.recordFields) {
        view.setUint16(offset, value, false);
      }
      assert.deepEqual(bytesAt(ram,
        WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride,
        WHITE_SELECTOR.recordStride), [...expectedRecord]);
    }
    assert.equal(ram.u16(WHITE_SELECTOR.selectRecords - 2), 0x55aa);
    assert.equal(ram.u16(afterCopy), 0xaa55);
    assert.equal(ram.u32(WHITE_SELECTOR.records + 0x56), 0xffffffff);
    assert.equal(ram.u32(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride + 0x56), 0xffffffff);
    assert.equal(ram.u16(WHITE_SELECTOR.records + 0x64), 1);
    assert.equal(ram.u16(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride + 0x6c), 0x0140);
    assert.equal(result.made.addr, ALLOC.createStage);
    assert.equal(ram.u16(result.made.addr), 0x800a);
    assert.equal(ram.u16(result.made.addr + ALLOC.priOff), 0x001f);
    assert.equal(ram.u16(result.made.addr + WHITE_SELECTOR.childArmAt), 0);
    for (let i = 0; i < WHITE_SELECTOR.copyLongs; i++) {
      assert.equal(ram.u32(WHITE_SELECTOR.copyTarget + i * 4),
        (0xa5000000 | i * 4) >>> 0);
    }
  }
});

test('Version A selector exposes every authentic ship and style pair for P1 and P2', () => {
  const expected = [];
  for (const side of [0, 1]) {
    for (const shipIndex of [0, 1]) {
      for (const styleIndex of [0, 1, 2]) {
        const { ram, result } = chooseSingle(side, shipIndex, styleIndex);
        const choice = result.choices[side];
        assert.deepEqual(choice, {
          ship: [0, 2][shipIndex],
          style: [2, 4, 6][styleIndex],
        });
        assert.equal(result.phases[side], 7);
        assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectBusyAt), 3);
        assert.equal(ram.u8(WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride
          + WHITE_SELECTOR.phaseAt), 7);
        expected.push(`${side}:${choice.ship}:${choice.style}`);
      }
    }
  }
  assert.equal(new Set(expected).size, 12);
});

test('two native records keep style cursors mutually exclusive in both directions', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  seed(ram, rom, 3);
  tick(ram, rom);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, 0x10);
  ram.setU16(WHITE_SELECTOR.p2EdgeAddress, 0x10);
  tick(ram, rom);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, 0);
  ram.setU16(WHITE_SELECTOR.p2EdgeAddress, 0);
  tick(ram, rom);

  assert.equal(ram.u8(ALLOC.table + 0x06), 0);
  assert.equal(ram.u8(ALLOC.table + 0x07), 2);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, WHITE_SELECTOR.nextBit);
  ram.setU16(WHITE_SELECTOR.p2EdgeAddress, WHITE_SELECTOR.previousBit);
  tick(ram, rom);
  assert.equal(ram.u8(ALLOC.table + 0x06), 1);
  assert.equal(ram.u8(ALLOC.table + 0x07), 0,
    'P2 skips P1 style index 1 instead of colliding with it');
});

test('genuine P2 may join mid-selector only before the active side commits', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  seed(ram, rom, 1);
  tick(ram, rom);
  ram.setU8(0x803808, 0);
  ram.setU8(0x80380b, 1);
  ram.setU8(0x803960, 1);
  ram.setU16(0x803976, 0x8000);

  const joined = tick(ram, rom);
  assert.deepEqual(joined.joined, [1]);
  assert.equal(ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride), 1);
  assert.equal(ram.u8(0x803960), 0);

  ram.setU8(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride, 0);
  ram.setU8(WHITE_SELECTOR.records + WHITE_SELECTOR.phaseAt, 6);
  ram.setU8(0x803960, 1);
  const refused = tick(ram, rom);
  assert.deepEqual(refused.joined, []);
  assert.equal(ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride), 0);
  assert.equal(ram.u8(0x803960), 1,
    'late join rejection happens before consuming the P2 credit');
});

test('packed-BCD timeout tests the complete native word before decrementing', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  seed(ram, rom, 1);
  tick(ram, rom);
  const record = WHITE_SELECTOR.records;
  ram.setU16(record + WHITE_SELECTOR.timeoutWordAt, 0x0001);
  ram.setU8(record + WHITE_SELECTOR.timeoutTickAt, 1);
  ram.setU8(record + WHITE_SELECTOR.autoConfirmAt, 0);

  tick(ram, rom);
  assert.equal(ram.u16(record + WHITE_SELECTOR.timeoutWordAt), 0);
  assert.equal(ram.u8(record + WHITE_SELECTOR.autoConfirmAt), 0,
    'native auto-confirm starts on a later tick after the word was already zero');
});

test('phase 6 announces an inactive partner and phase 7 retires both records together', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const announcements = [];
  const ctx = { announceSide: (side) => announcements.push(side) };
  seed(ram, rom, 1, ctx);
  tick(ram, rom, ctx);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, WHITE_SELECTOR.confirmMask);
  tick(ram, rom, ctx);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, 0);
  tick(ram, rom, ctx);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, WHITE_SELECTOR.confirmMask);
  tick(ram, rom, ctx);
  assert.deepEqual(announcements.slice(0, 2), [0, 1]);

  const record = WHITE_SELECTOR.records;
  ram.setU16(record + 0x32, 0x00ef);
  ram.setU16(record + 0x4a, 0x1800);
  ram.setU16(record + 0x5a, 1);
  ram.setU16(WHITE_SELECTOR.p1EdgeAddress, 0);
  const retired = tick(ram, rom, ctx);
  assert.deepEqual(retired.phases, [WHITE_SELECTOR.retiredPhase, WHITE_SELECTOR.retiredPhase]);
  assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectStateAt), WHITE_SELECTOR.killState);
  assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectBusyAt), 3);
  const killed = tick(ram, rom, ctx);
  assert.equal(killed.retired, true);
});

test('phase 7 waits for a live partner before advancing retirement counters', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  seed(ram, rom, 3);
  for (const side of [0, 1]) {
    const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
    ram.setU8(record + WHITE_SELECTOR.phaseAt, side === 0 ? 7 : 6);
    ram.setU16(record + 0x32, 0x0042);
  }

  tick(ram, rom);
  assert.equal(ram.u16(WHITE_SELECTOR.records + 0x32), 0x0042);
  assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectBusyAt), 3);
});

test('phase 7 announces the opposite side every frame while the loop gate is set', () => {
  const ram = new Ram();
  const rom = syntheticRom();
  const announcements = [];
  seed(ram, rom, 1);
  ram.setU8(WHITE_SELECTOR.records + WHITE_SELECTOR.phaseAt, 7);
  ram.setU16(WHITE_SELECTOR.gate, 1);

  tick(ram, rom, { announceSide: (side) => announcements.push(side) });
  assert.deepEqual(announcements, [1]);
});

rawTest('phase 7 runs each Version A handoff and retirement one-shot exactly once', () => {
  const ram = new Ram();
  const rom = new FullRom(new Uint8Array(readFileSync(IMAGE)));
  const palettes = [];
  const handoffs = [];
  const ctx = {
    installPalette: (bank, _bytes, source, length) =>
      palettes.push({ bank, source, length }),
    whiteStageHandoff: (...args) => handoffs.push(args),
  };
  clearWhiteRank15F734(ram);
  seed(ram, rom, 3, ctx);
  playerRecords15F1B0(ram, rom, ctx);
  ram.setU16(WHITE_RANK.gate, 1);
  ram.setU8(ALLOC.table + 0x04, 2);
  ram.setU8(ALLOC.table + 0x05, 4);
  ram.setU8(ALLOC.table + 0x08, 0);
  ram.setU8(ALLOC.table + 0x09, 2);

  for (let side = 0; side < 2; side++) {
    const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
    ram.setU8(record + WHITE_SELECTOR.liveAt, 1);
    ram.setU8(record + WHITE_SELECTOR.phaseAt, 7);
    ram.setU16(record + 0x48, 0x02e0);
  }
  tick(ram, rom, ctx);

  for (let side = 0; side < 2; side++) {
    const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
    assert.deepEqual([
      ram.u16(record + 0x32), ram.u16(record + 0x36), ram.u16(record + 0x3a),
      ram.u16(record + 0x38), ram.u16(record + 0x3c), ram.u16(record + 0x3e),
      ram.u16(record + 0x46), ram.u16(record + 0x48),
    ], [1, 9, 9, 4, 4, 0x0200, 0x0033, 0x0313]);
  }
  assert.equal(ram.btst8(ALLOC.table + WHITE_SELECTOR.objectExtraAt, 0), 1);
  assert.equal(palettes.filter(({ bank, source, length }) =>
    bank === 0x1a && source === 0x1243f8 && length === 64).length, 1);
  assert.equal(handoffs.length, 1,
    'both live selector records share the selector-object handoff latch');
  assert.equal(handoffs[0][2], 0x15c99e);
  assert.equal(handoffs[0][0].ran, true);
  assert.deepEqual(handoffs[0][0].saved, { p1: [0, 0], p2: [1, 1] });
  assert.deepEqual(handoffs[0][1], [0, 1]);
  assert.equal(ram.u16(WHITE_RANK.gate), 0);

  const createSp = ram.u16(ALLOC.createSp);
  for (let side = 0; side < 2; side++) {
    const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
    ram.setU16(record + 0x32, 0x00ef);
    ram.setU16(record + 0x4a, 0x1800);
    ram.setU16(record + 0x4c, 2);
    ram.setU16(record + 0x5a, 0);
  }
  tick(ram, rom, ctx);
  assert.equal(ram.u16(WHITE_SELECTOR.recordTailFlag), 1);
  assert.deepEqual([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ], [4, 4]);
  assert.equal(ram.u16(ALLOC.createSp), createSp,
    'request 4 remains pending until the rank handler runs');
  assert.equal(handoffs.length, 1);

  tick(ram, rom, ctx);
  assert.deepEqual([
    ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.phaseAt),
    ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride + WHITE_SELECTOR.phaseAt),
  ], [WHITE_SELECTOR.retiredPhase, WHITE_SELECTOR.retiredPhase]);
  assert.deepEqual([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ], [4, 4], 'the second live record does not duplicate retirement work');
});

rawTest('embedded Version A image completes every native selector pair through retirement', () => {
  const image = new Uint8Array(readFileSync(IMAGE));
  for (const side of [0, 1]) {
    for (const ship of [0, 1]) {
      for (const style of [0, 1, 2]) {
        const { ram } = chooseSingle(side, ship, style, new FullRom(image));
        const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
        ram.setU16(record + 0x32, 0x00ef);
        ram.setU16(record + 0x4a, 0x1800);
        ram.setU16(record + 0x5a, 1);
        const retired = whiteSelectorTick15BE3E(ram, new FullRom(image), ALLOC.table);
        assert.equal(retired.phases[side], WHITE_SELECTOR.retiredPhase);
        assert.equal(ram.u8(ALLOC.table + WHITE_SELECTOR.objectStateAt),
          WHITE_SELECTOR.killState);
      }
    }
  }
});

rawTest('embedded Version A image proves selector dispatch and all choice tables', () => {
  const rom = new FullRom(new Uint8Array(readFileSync(IMAGE)));
  assert.equal(rom.u32(WHITE_CHOOSER.dispatchTable + 9 * 8),
    WHITE_SELECTOR.handler);
  assert.equal(rom.u16(WHITE_CHOOSER.dispatchTable + 9 * 8 + 4), 0x000a);
  assert.equal(rom.u32(WHITE_CHOOSER.dispatchTable + WHITE_SELECTOR.childType * 8), 0x15fae8);
  assert.deepEqual(Array.from({ length: WHITE_SELECTOR.shipChoices },
    (_, i) => rom.u16(WHITE_SELECTOR.shipTable + i * 2)), [0, 2]);
  assert.deepEqual(Array.from({ length: WHITE_SELECTOR.styleChoices },
    (_, i) => rom.u16(WHITE_SELECTOR.styleTable + i * 2)), [2, 4, 6]);
  assert.deepEqual(WHITE_SELECTOR.styleOrderTables.map((table) => Array.from({ length: 3 },
    (_, i) => rom.u16(table + i * 2))), [[0, 1, 2], [2, 1, 0]]);
});
