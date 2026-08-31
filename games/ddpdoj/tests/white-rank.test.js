import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALLOC, commitCreates } from '../src/objalloc.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { FullRom } from '../src/rom.js';
import {
  WHITE_PLAYER_PALETTES, WHITE_RANK, WHITE_RANK_INIT_TX,
  clearWhiteRank15F734, dispatchRequests15F2E8, handoff15FA60,
  playerRecords15F1B0, savedSelections15CCFE, selectionRecords15E7CC,
  stagePair15F758, whiteRankTick15FAE8,
} from '../src/white-rank.js';

const IMAGE = fileURLToPath(new URL('../rip/rosetta/img-ddpdojblk.bin', import.meta.url));
const rawTest = (name, fn) => test(name, { skip: !existsSync(IMAGE) }, fn);
const rawRom = () => new FullRom(new Uint8Array(readFileSync(IMAGE)));
const whiteRam = () => new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);

function staged(ram, index) {
  return ALLOC.createStage + index * ALLOC.stride;
}

function activeTypes(ram) {
  const types = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const type = ram.u16(ALLOC.table + i * ALLOC.stride);
    if (type !== 0) types.push(type & 0xff);
  }
  return types;
}

test('White rank handler rejects Black before RAM or cartridge access', () => {
  let ramReads = 0;
  let romReads = 0;
  const protectedRam = new Proxy({}, { get() { ramReads++; throw new Error('RAM touched'); } });
  const protectedRom = new Proxy({}, { get() { romReads++; throw new Error('ROM touched'); } });
  assert.throws(
    () => whiteRankTick15FAE8(protectedRam, protectedRom, 0x80e240, null,
      BLACK_LABEL_PROFILE),
    /White Label rank frontend tick is unavailable/,
  );
  assert.equal(ramReads, 0);
  assert.equal(romReads, 0);
});

test('Version A saved-selection conversion preserves absent sides and native indexes', () => {
  const ram = whiteRam();
  assert.deepEqual(savedSelections15CCFE(ram, 0, 0xff, 6, 0xff), {
    p1: [0, 2], p2: [0xff, 0xff],
  });
  assert.deepEqual(savedSelections15CCFE(ram, 2, 0, 4, 2), {
    p1: [1, 1], p2: [0, 0],
  });
});

rawTest('Version A player records copy the exact templates and stage three children', () => {
  const ram = whiteRam();
  const rom = rawRom();
  const made = playerRecords15F1B0(ram, rom);

  assert.equal(made.length, 3);
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => rom.u8(WHITE_RANK.recordsTable + i)),
    [0x10, 0, 0x0e, 0, 0x10, 0, 0x0e, 0, 0, 2, 0, 0, 0, 0x81, 0x30, 0xbe]);
  assert.deepEqual(Array.from({ length: 2 }, (_, side) => {
    const record = WHITE_RANK.records + side * WHITE_RANK.recordStride;
    return {
      type: ram.u16(record + 0x14),
      side: ram.u8(record + 0x17),
      lives: ram.u32(record + 0x08),
      position: ram.u32(record + 0x10),
    };
  }), [
    { type: 2, side: 0, lives: 0x8130be, position: 0x10000e00 },
    { type: 3, side: 1, lives: 0x8130c0, position: 0x10002a00 },
  ]);
  assert.deepEqual([0, 1, 2].map((index) => ram.u16(staged(ram, index))),
    [0x8000, 0x8004, 0x8004]);
  assert.equal(ram.u8(staged(ram, 1) + 7), 0);
  assert.equal(ram.u8(staged(ram, 2) + 7), 1);
  assert.deepEqual([ram.u32(WHITE_RANK.idType0), ram.u32(WHITE_RANK.idType4P1),
    ram.u32(WHITE_RANK.idType4P2)], [1, 2, 3]);
});

rawTest('Version A handoff saves both choices and installs the Stage 1 rank base', () => {
  const ram = whiteRam();
  const rom = rawRom();
  clearWhiteRank15F734(ram);
  playerRecords15F1B0(ram, rom);
  ram.setU16(WHITE_RANK.gate, 1);
  ram.setU16(WHITE_RANK.stage, 0);

  const result = handoff15FA60(ram, rom, null, 0, 2, 2, 4, 0);
  assert.equal(result.ran, true);
  assert.equal(ram.u16(WHITE_RANK.gate), 0);
  assert.deepEqual(result.saved, { p1: [0, 0], p2: [1, 1] });
  assert.equal(ram.u16(WHITE_RANK.stageWordD7), 0);
  assert.equal(ram.u16(WHITE_RANK.stageWordD6), 0);
  assert.equal(ram.u16(staged(ram, 3)), 0x8005);
  assert.equal(ram.u16(staged(ram, 4)), 0x8001);
  assert.equal(ram.u16(staged(ram, 4) + 6), 0);
  assert.equal(ram.u16(WHITE_RANK.rankConfig), rom.u16(WHITE_RANK.rankWordTable));
  assert.equal(ram.u32(WHITE_RANK.rankBase), rom.u32(WHITE_RANK.rankPointerTable));
  assert.equal(result.started.installed.palettes, 4);

  const second = handoff15FA60(ram, rom, null, 2, 6, 0, 2, 0);
  assert.deepEqual(second, { ran: false });
  assert.deepEqual([ram.u8(WHITE_RANK.savedP1), ram.u8(WHITE_RANK.savedP1 + 1)], [0, 0]);
});

rawTest('Version A request 4 stages both selected players before allocator commit', () => {
  const ram = whiteRam();
  const rom = rawRom();
  clearWhiteRank15F734(ram);
  playerRecords15F1B0(ram, rom);
  ram.setU16(WHITE_RANK.shipP1, 0);
  ram.setU16(WHITE_RANK.shipP2, 2);
  ram.setU16(WHITE_RANK.styleP1, 2);
  ram.setU16(WHITE_RANK.styleP2, 4);
  ram.setU8(WHITE_RANK.playerMode, 0);
  ram.setU8(WHITE_RANK.dipLives, 0);

  const palettes = [];
  const ctx = { installPalette: (bank, _bytes, source, length) =>
    palettes.push([bank, source, length]) };
  const pair = stagePair15F758(ram, rom, ctx, 0x117914c0, 0x25ab34c0);
  assert.deepEqual(pair.requests, [4, 4]);
  assert.equal(ram.u16(ALLOC.createSp), 3 * ALLOC.stride,
    'arming request 4 does not create a player synchronously');
  assert.equal(ram.u32(WHITE_RANK.records + 0x10), 0x117914c0);
  assert.equal(ram.u32(WHITE_RANK.records + WHITE_RANK.recordStride + 0x10), 0x25ab34c0);

  const players = dispatchRequests15F2E8(ram, rom, ctx);
  assert.equal(players.length, 2);
  assert.deepEqual(players.map((entry) => [entry.side, entry.type, entry.lives, entry.paletteArm]),
    [[0, 2, 2, 0], [1, 3, 2, 3]]);
  assert.deepEqual([ram.u16(staged(ram, 3)), ram.u16(staged(ram, 4))],
    [0x8002, 0x8003]);
  assert.deepEqual([3, 4].map((index) => ({
    mode: ram.u8(staged(ram, index) + 6),
    side: ram.u8(staged(ram, index) + 7),
    x: ram.u16(staged(ram, index) + 8),
    y: ram.u16(staged(ram, index) + 0x0a),
  })), [
    { mode: 0, side: 0, x: 0x1179, y: 0x14c0 },
    { mode: 0, side: 1, x: 0x25ab, y: 0x34c0 },
  ]);
  assert.deepEqual(palettes, [
    [0, 0x122878, 64], [2, 0x122978, 64], [4, 0x1229f8, 64],
    [9, 0x1226f8, 32],
    [1, 0x122938, 64], [3, 0x1229b8, 64], [4, 0x122a38, 64],
    [0x0a, 0x122758, 32],
  ]);
  assert.deepEqual([ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride)], [0, 0]);
  assert.deepEqual([ram.u16(0x813162), ram.u16(0x813164),
    ram.u16(0x813166), ram.u16(0x813168)], [1, 8, 1, 8]);

  commitCreates(ram);
  assert.ok(activeTypes(ram).includes(2));
  assert.ok(activeTypes(ram).includes(3));
});

rawTest('Version A loop 2 forces both staged player life counters to zero', () => {
  const ram = whiteRam();
  const rom = rawRom();
  clearWhiteRank15F734(ram);
  playerRecords15F1B0(ram, rom);
  ram.setU8(WHITE_RANK.loop, 1);
  ram.setU16(WHITE_RANK.shipP1, 0);
  ram.setU16(WHITE_RANK.shipP2, 2);
  ram.setU8(WHITE_RANK.dipLives, 2);
  stagePair15F758(ram, rom, null, 0x10000e00, 0x10002a00);

  const players = dispatchRequests15F2E8(ram, rom);
  assert.deepEqual(players.map(({ lives }) => lives), [0, 0]);
  assert.deepEqual([ram.u16(0x8130be), ram.u16(0x8130c0)], [0, 0]);
});

rawTest('Version A selector visuals and cartridge roots are independently pinned', () => {
  const ram = whiteRam();
  const rom = rawRom();
  const object = ALLOC.table;
  ram.setU8(object + 4, 2);
  ram.setU8(object + 5, 4);
  assert.deepEqual(selectionRecords15E7CC(ram, rom, object), [0, 1]);
  assert.equal(ram.btst8(WHITE_RANK.selectVisuals, 0), 1);
  assert.equal(ram.btst8(WHITE_RANK.selectVisuals + WHITE_RANK.selectVisualStride, 0), 1);
  assert.equal(ram.u16(WHITE_RANK.selectVisuals + 0x12), 0x17);
  assert.equal(ram.u16(WHITE_RANK.selectVisuals + WHITE_RANK.selectVisualStride + 0x12), 0x18);

  assert.equal(rom.u32(WHITE_RANK.dispatch + 0x0a * 8), WHITE_RANK.handler);
  assert.equal(rom.u16(WHITE_RANK.dispatch + 0x0a * 8 + 4), 0x001f);
  assert.equal(rom.u32(WHITE_RANK.requestTable + 4 * 4), WHITE_RANK.request4);
  assert.deepEqual(WHITE_RANK_INIT_TX.map(([, bank, source]) => [bank, source]), [
    [0, 0x122638], [1, 0x122658], [2, 0x122678], [3, 0x122698],
    [4, 0x1226b8], [5, 0x1226d8], [6, 0x122778], [7, 0x122798],
    [8, 0x1227b8], [0x0b, 0x1227d8],
  ]);
  assert.ok(WHITE_PLAYER_PALETTES.every((arm) =>
    arm.spr.every(([, source]) => source >= 0x120000 && source < 0x130000)
      && arm.tx[1] >= 0x120000 && arm.tx[1] < 0x130000));
});

rawTest('Version A type 0A initializes before the selector handoff', () => {
  const ram = whiteRam();
  const rom = rawRom();
  const slot = ALLOC.table;
  ram.setU16(slot, 0x800a);
  ram.setU16(slot + ALLOC.priOff, 0x001f);
  ram.setU16(slot + 4, 0);

  const result = whiteRankTick15FAE8(ram, rom, slot);
  assert.equal(result.state, 0);
  assert.equal(ram.u8(slot + WHITE_RANK.stateAt), 1);
  assert.equal(ram.u16(WHITE_RANK.gate), 1);
  assert.deepEqual([ram.u16(WHITE_RANK.stage), ram.u16(WHITE_RANK.stageX2),
    ram.u16(WHITE_RANK.stageX4)], [0, 0, 0]);
  assert.deepEqual([ram.u16(staged(ram, 0)), ram.u16(staged(ram, 1)),
    ram.u16(staged(ram, 2))], [0x8000, 0x8004, 0x8004]);
});
