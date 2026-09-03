import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WorkBudget } from '../src/budget.js';
import { ALLOC } from '../src/objalloc.js';
import { ObjOrder, runObjectDriver } from '../src/objdriver.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  WHITE_CHOOSER, WHITE_FRONTEND, WHITE_VERSION_CHOOSER,
  provisionWhiteCabinetNvram,
} from '../src/white-frontend.js';
import { bootWhiteCabinet13C24E } from '../src/white-reset.js';
import {
  createWhiteFrontendHandlers, createWhiteStage1Handlers, createWhiteStage1ShotHandlers,
} from '../src/white-runtime.js';
import { WHITE_PLAYER } from '../src/white-player.js';
import { WHITE_RANK } from '../src/white-rank.js';
import { WHITE_SELECTOR } from '../src/white-selector.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
assert.ok(existsSync(TABLES),
  `${TABLES} missing; run: python games/ddpdoj/tools/export-tables.py`);
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
const WHITE_RAM = WHITE_LABEL_PROFILE.ramLayout.addresses;
const P = WHITE_LABEL_PROFILE.ramLayout.playerFields;

test('White handler-map capability rejects Black before cartridge access', () => {
  let reads = 0;
  const protectedRom = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected cartridge was touched');
    },
  });
  assert.throws(
    () => createWhiteFrontendHandlers(protectedRom, BLACK_LABEL_PROFILE),
    /White Label frontend handler map is unavailable/,
  );
  assert.throws(
    () => createWhiteStage1Handlers(protectedRom, BLACK_LABEL_PROFILE),
    /White Label frontend handler map is unavailable/,
  );
  assert.equal(reads, 0);
});

test('White Stage 1 map joins the independently gated dispatch islands', () => {
  const rom = { u8() { return 0; }, u16() { return 0; }, u32() { return 0; } };
  const frontend = createWhiteFrontendHandlers(rom, WHITE_LABEL_PROFILE);
  assert.deepEqual([...frontend.keys()], [0x14, 0x08, 0x09, 0x0a]);
  const shots = createWhiteStage1ShotHandlers(rom, WHITE_LABEL_PROFILE);
  assert.deepEqual([...shots.keys()], [0x05]);
  const handlers = createWhiteStage1Handlers(rom, WHITE_LABEL_PROFILE);
  assert.deepEqual([...handlers.keys()], [0x14, 0x08, 0x09, 0x0a, 0x02, 0x03, 0x05, 0x00]);
  for (const handler of handlers.values()) assert.equal(typeof handler, 'function');
});

test('capability-gated queue route executes live two-player Version A movement', () => {
  const windowRom = new RomWindows(tables.rom);
  const reads = [];
  const rom = new Proxy(windowRom, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isInteger(address)) reads.push(address);
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const handlers = createWhiteStage1Handlers(rom);
  const notes = [];
  const note = (...args) => notes.push(args);
  const ctx = {
    profile: WHITE_LABEL_PROFILE,
    budget: new WorkBudget(),
    order: new ObjOrder(),
    unportedLog: { note },
    unported: { note },
    whiteHyperHudCallbacks: {
      conversion() {}, endReset() {}, pendingFlush() {}, postHudTail() {},
    },
  };
  const frame = () => runObjectDriver(ram, handlers, ctx);

  provisionWhiteCabinetNvram(ram, rom);
  const boot = bootWhiteCabinet13C24E(ram, rom, null, ctx);
  assert.equal(ram.u16(boot.made.addr), 0x8014);

  frame();
  assert.equal(ram.u16(ALLOC.table) & 0xff, 0x14);
  assert.equal(ram.u16(WHITE_VERSION_CHOOSER.lockout), 0x63);

  ram.setU16(WHITE_VERSION_CHOOSER.selection, 0);
  ram.setU16(WHITE_VERSION_CHOOSER.mainTimer, 0);
  ram.setU16(WHITE_VERSION_CHOOSER.confirmation, 1);
  frame();
  assert.equal(ram.u16(ALLOC.table), 0);
  assert.equal(ram.u16(ALLOC.createStage), 0x8008);
  assert.equal(ram.u16(ALLOC.createStage + WHITE_CHOOSER.stateField), 0x000d);

  frame();
  assert.equal(ram.u16(ALLOC.table) & 0xff, 0x08);
  assert.equal(ram.u16(WHITE_FRONTEND.stateAddress), 0x000d);

  ram.setU16(WHITE_FRONTEND.stateAddress, 2);
  ram.setU8(WHITE_FRONTEND.dipAddress, 0);
  ram.setU8(WHITE_FRONTEND.creditModeAddress, 0);
  ram.setU8(WHITE_FRONTEND.creditAAddress, 2);
  ram.setU16(WHITE_FRONTEND.p1RawAddress, WHITE_FRONTEND.startBit);
  ram.setU16(WHITE_FRONTEND.p2RawAddress, WHITE_FRONTEND.startBit);
  frame();
  assert.equal(ram.u16(ALLOC.createStage), 0x8008,
    'credit teardown first stages another type 8 record');
  assert.equal(ram.u16(ALLOC.createStage + WHITE_FRONTEND.parameterField), 3);

  frame();
  assert.equal(ram.u16(WHITE_FRONTEND.stateAddress), 3,
    'the replacement type 8 needs its construction frame');
  frame();
  assert.equal(ram.u16(WHITE_FRONTEND.stateAddress), WHITE_FRONTEND.selectorState);
  assert.equal(ram.u8(WHITE_FRONTEND.joinMaskAddress), 3);
  assert.equal(ram.u8(WHITE_FRONTEND.creditAAddress), 0);
  assert.equal(ram.u16(ALLOC.createSp), 0,
    'state 3 returns before selector staging');

  frame();
  assert.equal(ram.u16(ALLOC.createStage), 0x8009);
  frame();
  assert.equal(ram.u16(ALLOC.table) & 0xff, 0x09);
  assert.equal(ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.liveAt), 1);
  assert.equal(ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride
    + WHITE_SELECTOR.liveAt), 1);
  assert.equal(ram.u16(ALLOC.createStage), 0x800a,
    'the live selector seeds the higher-priority Version A rank child');

  ram.setU8(ALLOC.table + 0x04, 2);
  ram.setU8(ALLOC.table + 0x05, 4);
  ram.setU8(ALLOC.table + 0x08, 0);
  ram.setU8(ALLOC.table + 0x09, 2);
  for (let side = 0; side < 2; side++) {
    const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
    ram.setU8(record + WHITE_SELECTOR.phaseAt, 7);
    ram.setU16(record + 0x48, 0x02e0);
  }

  frame();
  let rankSlot = 0;
  for (let i = 0; i < ALLOC.slots; i++) {
    const slot = ALLOC.table + i * ALLOC.stride;
    if ((ram.u16(slot) & 0xff) === 0x0a) rankSlot = slot;
  }
  assert.notEqual(rankSlot, 0);
  assert.equal(ram.u8(rankSlot + WHITE_RANK.stateAt), 1);
  assert.equal(ram.u16(WHITE_RANK.gate), 0,
    'priority $1F initializes type $0A before priority $0A selector phase 7');
  const selectorSlots = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const slot = ALLOC.table + i * ALLOC.stride;
    if ((ram.u16(slot) & 0xff) === 9) selectorSlots.push(slot);
  }
  assert.ok(selectorSlots.some((slot) =>
    ram.btst8(slot + WHITE_SELECTOR.objectExtraAt, 0) === 1));
  assert.deepEqual([
    ram.u8(WHITE_RANK.savedP1), ram.u8(WHITE_RANK.savedP1 + 1),
    ram.u8(WHITE_RANK.savedP2), ram.u8(WHITE_RANK.savedP2 + 1),
  ], [0, 0, 1, 1]);
  assert.deepEqual([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ], [0, 0]);

  for (let side = 0; side < 2; side++) {
    const record = WHITE_SELECTOR.records + side * WHITE_SELECTOR.recordStride;
    ram.setU16(record + 0x32, 0x00ef);
    ram.setU16(record + 0x4a, 0x1800);
    ram.setU16(record + 0x4c, 2);
    ram.setU16(record + 0x5a, 0);
  }
  frame();
  assert.equal(ram.u16(WHITE_SELECTOR.recordTailFlag), 1);
  assert.deepEqual([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ], [4, 4]);
  assert.equal(ram.u16(ALLOC.createSp), 0,
    'the selector retirement frame arms requests without creating players');

  frame();
  assert.deepEqual([ram.u16(ALLOC.createStage), ram.u16(ALLOC.createStage + ALLOC.stride)],
    [0x8002, 0x8003]);
  assert.equal(ram.u16(ALLOC.createSp), ALLOC.stride * 2);
  const stagedPlayers = [0, 1].map((side) => {
    const slot = ALLOC.createStage + side * ALLOC.stride;
    return { y: ram.u16(slot + 0x08), x: ram.u16(slot + 0x0a) };
  });
  assert.deepEqual([
    ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.phaseAt),
    ram.u8(WHITE_SELECTOR.records + WHITE_SELECTOR.recordStride + WHITE_SELECTOR.phaseAt),
  ], [WHITE_SELECTOR.retiredPhase, WHITE_SELECTOR.retiredPhase]);

  frame();
  const activeTypes = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const type = ram.u16(ALLOC.table + i * ALLOC.stride) & 0xff;
    if (type !== 0) activeTypes.push(type);
  }
  assert.equal(activeTypes.filter((type) => type === 2).length, 1);
  assert.equal(activeTypes.filter((type) => type === 3).length, 1);
  assert.equal(ram.u16(ALLOC.createSp), 0);
  assert.deepEqual([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ], [9, 9], 'each initialized Version A owner arms its request-9 continuation');
  assert.deepEqual([
    { y: ram.u16(WHITE_PLAYER.p1.rec + P.posY), x: ram.u16(WHITE_PLAYER.p1.rec + P.posX) },
    { y: ram.u16(WHITE_PLAYER.p2.rec + P.posY), x: ram.u16(WHITE_PLAYER.p2.rec + P.posX) },
  ], stagedPlayers, 'the composed map initializes each owner at its staged slot position');

  const p1Before = ram.u16(WHITE_PLAYER.p1.rec + P.posX);
  const p2Before = ram.u16(WHITE_PLAYER.p2.rec + P.posX);
  ram.setU16(WHITE_RAM.p1raw, 0x0008);
  ram.setU16(WHITE_RAM.p2raw, 0x0004);
  frame();
  assert.ok(ram.u16(WHITE_PLAYER.p1.rec + P.posX) > p1Before,
    'P1 moves right from its own input port');
  assert.ok(ram.u16(WHITE_PLAYER.p2.rec + P.posX) < p2Before,
    'P2 moves left from its own input port');
  assert.deepEqual([
    ram.u16(WHITE_RANK.records),
    ram.u16(WHITE_RANK.records + WHITE_RANK.recordStride),
  ], [0, 0], 'request 9 is consumed before the second player frame');
  assert.ok(notes.every(([, message]) => !/dispatch entry \[(2|3)\]/.test(message)),
    'both native player owners remain connected to the composed map');
  assert.ok(notes.every(([, message]) => !/request 9/.test(message)),
    'both player continuation panels stay inside the ported route');
  assert.ok(reads.length > 100);
  assert.ok(reads.every((address) => address < 0x200000),
    'the composed Version A route never reads a Build B cartridge address');
});
