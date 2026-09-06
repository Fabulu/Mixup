import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import {
  REC as SCRIPT_REC, SPAWN, processDeferred, resolveMovementPtr, runSpawnWalker,
} from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const TYPE_20 = WHITE_WORLD_RESOURCES.enemyTypes[0x20];
const REC = ENEMY.bandBoss;
const SUB = SPAWN.SUB_COMMON;
const SOURCE = 0x130f7c;
const STREAMS = [
  { source: 0x130f7c, clock: 0x00bc, type: 0x20, movement: 0x131cae,
    position: 0x74404c40, child: 0x11, salvo: 0x06, cooldown: 0x34 },
  { source: 0x1312d4, clock: 0x0139, type: 0x20, movement: 0x13201e,
    position: 0x53803e80, child: 0x11, salvo: 0x04, cooldown: 0x40 },
  { source: 0x1313c4, clock: 0x015f, type: 0x20, movement: 0x13203a,
    position: 0x5ac00e00, child: 0x11, salvo: 0x06, cooldown: 0x38 },
  { source: 0x1313dc, clock: 0x0162, type: 0x20, movement: 0x132058,
    position: 0x4c000800, child: 0x11, salvo: 0x05, cooldown: 0x38 },
  { source: 0x13145c, clock: 0x0178, type: 0x20, movement: 0x132126,
    position: 0x60004480, child: 0x11, salvo: 0x0a, cooldown: 0x38 },
  { source: 0x13146c, clock: 0x0179, type: 0x21, movement: 0x132148,
    position: 0x66804e00, child: 0x10, salvo: 0x07, cooldown: 0x50 },
];

function whiteCartridgeWindows() {
  const white = tables.editions.whiteLabel;
  const descriptors = [
    ...white.frontendWindows,
    ...white.worldRuntimeWindows,
    ...white.hyperHudRuntimeWindows,
    ...white.playerWindows,
    ...white.shotProducerWindows,
    ...white.shotRuntimeWindows,
    ...white.shotSpeedWindows,
    ...white.optionRuntimeWindows,
    ...white.bulletRuntimeWindows,
    ...white.bulletSpeedWindows,
    ...white.button2RuntimeWindows,
  ];
  const key = ({ base, len }) => `${base}:${len}`;
  const allowed = new Set(descriptors.map(key));
  const windows = tables.rom.windows.filter((window) => allowed.has(key(window)));
  assert.equal(windows.length, allowed.size,
    'every unique White descriptor resolves to one global ROM window');
  return { windows };
}

function trackedWhiteCartridge() {
  const reads = [];
  const source = new RomWindows(whiteCartridgeWindows());
  const rom = new Proxy(source, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isInteger(address)) {
          const length = property === 'bytes' ? (args[0] ?? 0)
            : property === 'u32' ? 4 : property === 'u16' ? 2 : 1;
          reads.push({ method: property, address, end: address + length });
        }
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  return { rom, reads };
}

function assertWhiteOnly(reads) {
  assert.deepEqual(reads.filter(({ address, end }) => address >= 0x200000 || end > 0x200000), [],
    'every tracked White Type $20 family cartridge read stays below $200000');
}

function createWorldFixture() {
  const { rom, reads } = trackedWhiteCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  world.resetSpawn(ram, rom, machineCtx);
  return { ram, rom, reads, machineCtx, world };
}

function handlerContext(fixture) {
  const unported = new UnportedLog();
  return {
    ...fixture.machineCtx,
    ram: fixture.ram,
    rom: fixture.rom,
    tables: fixture.world.tables,
    unported,
    unportedLog: unported,
  };
}

function initCarrier(fixture, stream = STREAMS[0]) {
  const { ram, rom, machineCtx } = fixture;
  ram.setU16(REC, 0x8000);
  ram.setU16(REC + 0x04, 0);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, stream.type);
  ram.setU8(REC + 0x0d, 0x01);
  ram.setU32(REC + 0x12, stream.movement);
  createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes).get(TYPE_20.initBody)(
    ram, rom, REC, SUB, machineCtx.unportedLog,
  );
  return REC;
}

function liveCarrier({ cooldown = 0, reload = 0x30, salvo = 0, salvoCtr = 0 } = {}) {
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x20);
  ram.setU8(REC + 0x0d, 0x01);
  ram.setU32(REC + 0x12, 0x00131900);
  ram.setU16(REC + 0x16, 0x0011);
  ram.setU16(REC + 0x18, salvo);
  ram.setU8(REC + 0x19, salvoCtr);
  ram.setU8(REC + 0x1a, cooldown);
  ram.setU8(REC + 0x1b, reload);
  ram.setU32(SUB + 0x02, 0x30001000);
  ram.setU16(SUB + 0x06, 1);
  ram.setU16(SUB + 0x08, 1);
  return ram;
}

const NO_ROM = {};
const NO_CONTEXT = {};

function runWhiteCarrier(ram) {
  runHandler(TYPE_20.handler, ram, NO_ROM, REC, NO_CONTEXT, WHITE_WORLD_RESOURCES);
}

test('Type $20 through $23 share exact edition-private descriptors and maps', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x20];
  const white = TYPE_20;

  assert.deepEqual(tables.editions.whiteLabel.stage1Type20, {
    init: {
      start: '$171A96', end: '$171B00',
      sha256: '9746e0503c757eb8ae8120c0f4ea54692cc10ab084cc06d85fb7724a6562cb5b',
    },
    handler: {
      start: '$171B00', end: '$171B9C',
      sha256: '972f09ee88d4efaafdb3c7f4b92206cc8fc4caf9522d23174d26439bdb1dd',
    },
  });
  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.subPrototype,
    black.scrollCompensation, black.enqueue.entry, black.retirement.entry,
  ], [0x272a42, 0x272a4a, 0x272aac, 0x272a90, 0x24179e, 0x263690, 0x263762]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.subPrototype,
    white.scrollCompensation, white.enqueue.entry, white.retirement.entry,
  ], [0x171a96, 0x171a9e, 0x171b00, 0x171ae4, 0x141ad8, 0x16270a, 0x1627dc]);
  assert.notEqual(black, white);
  for (const descriptor of [black, white]) {
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor.types), true);
    assert.equal(Object.isFrozen(descriptor.enqueue), true);
    assert.equal(Object.isFrozen(descriptor.retirement), true);
    for (const type of [0x20, 0x21, 0x22, 0x23]) {
      const resources = descriptor.edition === 'black'
        ? BLACK_WORLD_RESOURCES : WHITE_WORLD_RESOURCES;
      assert.equal(resources.enemyTypes[type], descriptor);
    }
  }

  const rom = new RomWindows(tables.rom);
  for (const type of [0x20, 0x21, 0x22, 0x23]) {
    const cell = 0x16689c + type * 8;
    assert.equal(rom.u32(cell), white.initStub);
    assert.equal(rom.u32(cell + 4), white.handler);
  }

  const blackBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  const partialBodies = createInitBodyMap({ 0x8a: WHITE_WORLD_RESOURCES.enemyTypes[0x8a] });
  assert.equal(blackBodies.has(black.initBody), true);
  assert.equal(blackBodies.has(white.initBody), false);
  assert.equal(whiteBodies.has(white.initBody), true);
  assert.equal(whiteBodies.has(black.initBody), false);
  assert.equal(partialBodies.has(black.initBody), true,
    'a partial map replacing another algorithm retains the static Black initializer');
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(black.handler), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(white.handler), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(white.handler), true);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(black.handler), false);
});

test('White Type $20 naturally spawns at clock $00BC in the boss record band', () => {
  const fixture = createWorldFixture();
  const { ram, rom, reads, machineCtx, world } = fixture;
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x00bc);

  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, null, null, null, null, world.resources,
  ), { script: 2, deferred: 0 });
  assert.equal(rom.u16(SOURCE), 0x00bc);
  assert.equal(rom.u8(SOURCE + SCRIPT_REC.type), 0x20);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 16);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u8(REC + 0x0c), 0x20);
  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u32(REC + 0x12), 0x131cb8);
  assert.equal(ram.u32(REC + 0x4c), TYPE_20.handler);
  assert.equal(ram.u32(SUB + 0x02), 0x74404c40);
  assert.deepEqual([
    ram.u16(REC + 0x16), ram.u16(REC + 0x18), ram.u16(REC + 0x1a),
  ], [0x11, 0x06, 0x34]);
  for (const address of [SOURCE, 0x16699c, TYPE_20.initStub + 2,
    TYPE_20.subPrototype, STREAMS[0].movement]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing White carrier initialization read at $${address.toString(16)}`);
  }
  assertWhiteOnly(reads);
});

test('all six White Stage 1 carrier records resolve and consume their native streams', () => {
  const fixture = createWorldFixture();
  const { ram, rom, reads, machineCtx, world } = fixture;
  const init = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes).get(TYPE_20.initBody);

  for (const expected of STREAMS) {
    assert.equal(rom.u16(expected.source), expected.clock);
    assert.equal(rom.u8(expected.source + SCRIPT_REC.type), expected.type);
    const movement = resolveMovementPtr(
      ram, rom, expected.source, machineCtx.unportedLog, world.resources,
    );
    assert.equal(movement, expected.movement);

    const local = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    local.setU16(REC, 0x8000);
    local.setU16(REC + 0x04, 0);
    local.setU32(REC + 0x06, SUB);
    local.setU32(REC + 0x12, movement);
    init(local, rom, REC, SUB, machineCtx.unportedLog);
    assert.equal(local.u32(SUB + 0x02), expected.position);
    assert.equal(local.u16(SUB + 0x08), 0);
    assert.deepEqual([
      local.u16(REC + 0x16), local.u16(REC + 0x18), local.u16(REC + 0x1a),
    ], [expected.child, expected.salvo, expected.cooldown]);
    assert.equal(local.u32(REC + 0x12), movement + 10);
  }
  assertWhiteOnly(reads);
});

test('White initializer masks parameter bytes and preserves the escape form', () => {
  const fixture = createWorldFixture();
  const { ram, rom, reads, machineCtx } = fixture;
  const stream = 0x001f0000;
  const words = new Map([
    [stream + 4, 0xaa02], [stream + 6, 0xbb10],
    [stream + 8, 0xcc03], [stream + 10, 0xdd20],
  ]);
  const overlay = {
    u8: (address) => rom.u8(address),
    u16: (address) => words.has(address) ? words.get(address) : rom.u16(address),
    u32: (address) => address === stream ? 0x40001c00 : rom.u32(address),
  };
  ram.setU16(REC, 0x8000);
  ram.setU16(REC + 0x04, 0);
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x12, stream);

  createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes).get(TYPE_20.initBody)(
    ram, overlay, REC, SUB, machineCtx.unportedLog,
  );
  assert.equal(ram.u32(SUB + 0x02), 0x40001c00);
  assert.equal(ram.u16(SUB + 0x08), 1,
    'low-byte $02 selects the no-scroll-compensation escape');
  assert.deepEqual([
    ram.u16(REC + 0x16), ram.u16(REC + 0x18), ram.u16(REC + 0x1a),
  ], [0x10, 0x03, 0x20]);
  assert.equal(ram.u32(REC + 0x12), stream + 12, 'four parameter words were consumed');
  assertWhiteOnly(reads);
});

test('White carriers enqueue and drain native P1 Type $11 and Type $10 children', () => {
  for (const expected of [STREAMS[0], STREAMS[5]]) {
    const fixture = createWorldFixture();
    const { ram, rom, reads, machineCtx, world } = fixture;
    initCarrier(fixture, expected);
    runHandler(TYPE_20.handler, ram, rom, REC,
      handlerContext(fixture), WHITE_WORLD_RESOURCES);

    const q = SPAWN.DEFQ_BASE;
    assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
    assert.equal(ram.u16(q + 0x02), 0x4000 | expected.child);
    assert.equal(ram.u16(q + 0x04), 0x0001,
      'the caller class byte is retained by the caller-D1 enqueue');
    assert.equal(ram.u32(q + 0x12), expected.movement + 10);
    assert.equal(ram.u32(q + 0x48), expected.position);

    assert.equal(processDeferred(
      ram, rom, machineCtx.unportedLog, world.tables, null, null, null, world.resources,
    ), 1);
    const child = ENEMY.bandCommon;
    const childDescriptor = WHITE_WORLD_RESOURCES.enemyTypes[expected.child];
    assert.equal(ram.u8(child + 0x0c), expected.child);
    assert.equal(ram.u8(child + 0x0d), 0x01);
    assert.equal(ram.u8(child + 0x03), 0,
      'the carrier child remains owned by P1');
    assert.equal(ram.u32(child + 0x4c), childDescriptor.handler);
    assert.equal(ram.u16(SPAWN.DEFQ_COUNT), 0);
    assertWhiteOnly(reads);
  }
});

test('White handler preserves scroll, signed bounds, freeze, and cooldown borrow', () => {
  const scroll = liveCarrier({ cooldown: 0x7f });
  scroll.setU16(SUB + 0x08, 0);
  scroll.setU32(0x80b03c, 0x00400000);
  runWhiteCarrier(scroll);
  assert.equal(scroll.u16(SUB + 0x02), 0x3040,
    'zero escape flag applies the cross-axis scroll delta');

  const signed = liveCarrier({ cooldown: 0x7f });
  signed.setU32(SUB + 0x02, 0xfc001000);
  runWhiteCarrier(signed);
  assert.equal(signed.u16(REC), 0x8000,
    '$FC00 remains inside only when the high half is sign-extended');

  const seen = liveCarrier({ cooldown: 0x7f });
  seen.setU32(SUB + 0x02, 0xf0001000);
  runWhiteCarrier(seen);
  assert.equal(seen.u16(REC), 0);
  assert.equal(seen.u8(SUB), 1, 'offscreen retirement marks the sub-record dying');

  const unseen = liveCarrier({ cooldown: 0x7f });
  unseen.setU32(SUB + 0x02, 0xf0001000);
  unseen.setU16(SUB + 0x06, 0);
  runWhiteCarrier(unseen);
  assert.equal(unseen.u16(REC), 0x8000,
    'an offscreen carrier that has never appeared remains alive');

  const frozen = liveCarrier({ cooldown: 0 });
  frozen.setU16(0x8130d2, 1);
  runWhiteCarrier(frozen);
  assert.equal(frozen.u16(SPAWN.DEFQ_COUNT), 0);
  assert.equal(frozen.u8(REC + 0x1a), 0,
    'freeze stops the cooldown before it changes');

  const delayed = liveCarrier({ cooldown: 1 });
  runWhiteCarrier(delayed);
  assert.equal(delayed.u16(SPAWN.DEFQ_COUNT), 0);
  assert.equal(delayed.u8(REC + 0x1a), 0);
  runWhiteCarrier(delayed);
  assert.equal(delayed.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE,
    'zero fires on the following frame when the byte subtraction borrows');
  assert.equal(delayed.u8(REC + 0x1a), 0x30);
});

test('White finite salvos retire while a zero salvo runs forever', () => {
  const finite = liveCarrier({ cooldown: 0, salvo: 1, salvoCtr: 1 });
  runWhiteCarrier(finite);
  assert.equal(finite.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
  assert.equal(finite.u16(REC), 0);
  assert.equal(finite.u8(SUB), 1);

  const infinite = liveCarrier({ cooldown: 0, salvo: 0 });
  runWhiteCarrier(infinite);
  assert.equal(infinite.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
  assert.equal(infinite.u16(REC), 0x8000);
  assert.equal(infinite.u8(REC + 0x19), 0);
});

test('a full White deferred queue still receives native dummy payload writes', () => {
  const ram = liveCarrier({ cooldown: 0 });
  ram.setU16(SPAWN.DEFQ_COUNT, SPAWN.DEFQ_CAP);
  ram.setU16(SPAWN.DEFQ_DUMMY + 0x02, 0);
  ram.setU32(SPAWN.DEFQ_DUMMY + 0x12, 0);
  ram.setU32(SPAWN.DEFQ_DUMMY + 0x48, 0);

  runWhiteCarrier(ram);

  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_CAP);
  assert.equal(ram.u16(SPAWN.DEFQ_DUMMY + 0x02), 0x4000);
  assert.equal(ram.u32(SPAWN.DEFQ_DUMMY + 0x12), 0x00131900);
  assert.equal(ram.u32(SPAWN.DEFQ_DUMMY + 0x48), 0x30001000);
});

test('Type $20 family rejects malformed and cross-edition graphs before mutation', () => {
  const fixture = createWorldFixture();
  const { ram, rom, reads, machineCtx } = fixture;
  ram.setU16(REC, 0x8000);
  ram.setU16(REC + 0x04, 0);
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x12, STREAMS[0].movement);

  const foreignInit = Object.freeze({
    ...TYPE_20,
    subPrototype: BLACK_WORLD_RESOURCES.enemyTypes[0x20].subPrototype,
  });
  let before = Array.from(ram.b);
  let readsBefore = reads.length;
  assert.throws(() => createInitBodyMap({ 0x20: foreignInit }).get(TYPE_20.initBody)(
    ram, rom, REC, SUB, machineCtx.unportedLog,
  ), /type \$20 family init needs a complete frozen edition descriptor/);
  assert.deepEqual(Array.from(ram.b), before);
  assert.equal(reads.length, readsBefore,
    'foreign initializer resources refuse before any cartridge read');

  const foreignHandler = Object.freeze({
    ...TYPE_20,
    enqueue: BLACK_WORLD_RESOURCES.enemyTypes[0x20].enqueue,
  });
  const badWorld = Object.freeze({
    ...WHITE_WORLD_RESOURCES,
    enemyTypes: Object.freeze({ 0x20: foreignHandler }),
  });
  before = Array.from(ram.b);
  readsBefore = reads.length;
  assert.throws(() => runHandler(TYPE_20.handler, ram, rom, REC,
    handlerContext(fixture), badWorld),
  /type \$20 family handler needs a complete frozen edition resource graph/);
  assert.deepEqual(Array.from(ram.b), before);
  assert.equal(reads.length, readsBefore,
    'foreign handler resources refuse before any cartridge read');
  assertWhiteOnly(reads);
});
