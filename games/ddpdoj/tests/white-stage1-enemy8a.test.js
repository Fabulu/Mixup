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
import { runSpawnWalker } from '../src/spawn.js';
import { BUCKETS, resolveEmitStub, resolveZoomStub } from '../src/spritequeue.js';
import { B as BEE, KIND, POOL_A, runPoolADriverWithResources } from '../src/bee.js';
import { DMG, impactCollisionBlock } from '../src/damage.js';
import { LEDGER } from '../src/score.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x130e6c;
const MOVEMENT = 0x13211e;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;

function trackedCartridge() {
  const reads = [];
  const source = new RomWindows(tables.rom);
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
    'every White Type $8A runtime cartridge read stays below $200000');
}

function spawnWhite8A() {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x00ad);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, null, null, null, null, world.resources,
  ), { script: 1, deferred: 0 });
  return { ram, rom, reads, machineCtx, world };
}

function handlerContext(fixture, extra = {}) {
  const unported = new UnportedLog();
  return {
    ...fixture.machineCtx,
    ram: fixture.ram,
    rom: fixture.rom,
    tables: fixture.world.tables,
    unported,
    unportedLog: unported,
    ...extra,
  };
}

const TYPE_8A = WHITE_WORLD_RESOURCES.enemyTypes[0x8a];
const WHITE_POOL = TYPE_8A.poolA;
const WHITE_BEE = WHITE_POOL.bee;

function killWhite8A(fixture, extra = {}, killMask = 0x10) {
  fixture.ram.setU8(SUB, fixture.ram.u8(SUB) | killMask);
  fixture.ram.setU16(SUB + 0x18, 0xffff);
  runHandler(TYPE_8A.handler, fixture.ram, fixture.rom, REC,
    handlerContext(fixture, extra), WHITE_WORLD_RESOURCES);
}

function touchBee(ram, slot, touchMask) {
  ram.setU16(DMG.fa72, touchMask);
  const y = ram.u16(slot + BEE.pos);
  const x = ram.u16(slot + BEE.posX);
  const d7 = 0x2800;
  return impactCollisionBlock(ram, {
    d0: (y + d7 + 0x1000) & 0xffff,
    d1: (y + d7 - 0x1000) & 0xffff,
    d2: (x + d7 + 0x1000) & 0xffff,
    d3: (x + d7 - 0x1000) & 0xffff,
  }, d7);
}

function driveWhitePool(fixture, extra = {}) {
  return runPoolADriverWithResources(fixture.ram, fixture.rom,
    handlerContext(fixture, extra), WHITE_POOL);
}

function pendingScore(ram, ledger) {
  return ram.u32(ledger.pendingEnd - 4);
}

test('Type $8A descriptors keep Black and White identities isolated and frozen', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x8a];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x8a];

  assert.deepEqual(tables.editions.whiteLabel.stage1Type8A, {
    backgroundConstructor: {
      start: '$1617D8', end: '$1617F6',
      sha256: '6d0fc2b135583282b9ce00848f9d5e6e7ff662979e4340d55c4fcc7c151b8147',
    },
    backgroundUpdate: {
      start: '$1617F6', end: '$16182A',
      sha256: '77cf9cb0103e23cfd4074ab652927c2392d13bf8def0ff606397fbc4694f60ac',
    },
    init: {
      start: '$175748', end: '$1757A4',
      sha256: '65a63362dd3fba694a9d5ce0ef7b5e944a463d8ebe4511d82a98917d001c6d80',
    },
    handler: {
      start: '$1757A4', end: '$1758BE',
      sha256: 'c6f145228d69b143d1056a1daaa03e3351f99b369c26bfcc824620b951974a5c',
    },
  });

  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.emitter.dispatch,
    black.poolA.allocator, black.sound.death, black.retirement.entry,
  ], [0x2766a6, 0x2766ae, 0x276702, 0x27829c, 0x27f92a, 0x28c25a, 0x263762]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.recordPrototype,
    white.subPrototype, white.emitter.dispatch, white.effect.remap,
    white.poolA.allocator, white.sound.death, white.retirement.entry,
  ], [
    0x175748, 0x175750, 0x1757a4, 0x175782,
    0x175788, 0x17733a, 0x1773be,
    0x17e9a0, 0x18ad80, 0x1627dc,
  ]);
  for (const value of [black, white, black.emitter, white.emitter,
    black.effect, white.effect, black.poolA, white.poolA]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const blackBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(blackBodies.has(black.initBody), true);
  assert.equal(blackBodies.has(white.initBody), false);
  assert.equal(whiteBodies.has(white.initBody), true);
  assert.equal(whiteBodies.has(black.initBody), false);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(black.handler), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(white.handler), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(white.handler), true);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(black.handler), false);
});

test('White Type $8A spawns from its native source, prototypes, and movement', () => {
  const { ram, rom, reads, world } = spawnWhite8A();
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x8a];

  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x00, 0xad, 0x00, 0x00, 0x8a, 0x01, 0x10, 0x70,
  ]);
  assert.deepEqual(Array.from(rom.bytes(MOVEMENT, 8)), [
    0x75, 0x40, 0x43, 0xc0, 0x81, 0x04, 0x40, 0x00,
  ]);
  assert.equal(rom.u32(0x17d514), descriptor.initStub);
  assert.equal(rom.u32(0x17d518), descriptor.handler);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u8(REC + 0x0c), 0x8a);
  assert.equal(ram.u32(REC + 0x12), MOVEMENT + 6,
    'the initializer stops on the first heading byte');
  assert.equal(ram.u32(REC + 0x4c), descriptor.handler);
  assert.equal(ram.u16(SUB + 0x02), 0x7540);
  assert.equal(ram.u16(SUB + 0x04), 0x3bc0,
    'the native shared initializer applies its $0800 spawn-odometer bias');
  assert.equal(ram.u8(SUB + 0x1a), 0x10);
  assert.equal(ram.u8(SUB + 0x1b), 0x40);
  assert.equal(ram.u16(SUB + 0x1e), 0x0004);
  for (const address of [
    SOURCE, 0x17d514, MOVEMENT, descriptor.subPrototype, descriptor.recordPrototype,
  ]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing White initialization read at $${address.toString(16)}`);
  }
  assertWhiteOnly(reads);
});

test('White Type $8A stays scroll-locked and alternates its native emitter', () => {
  const fixture = spawnWhite8A();
  const { ram, rom, reads } = fixture;
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x8a];
  const cursor = ram.u32(REC + 0x12);
  const sprite = ram.u32(SUB + 0x0a);
  const index = ram.u16(SUB + 0x1e);
  const stub = rom.u32(descriptor.emitter.dispatch + index * 4);
  const bucket = resolveEmitStub(rom, stub).bucket;

  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU8(REC + 0x16, 1);
  ram.setU16(REC + 0x18, 5);
  ram.setU16(0x811f72, 1);
  ram.setU16(0x813172, 0);
  ram.setU8(SUB + 0x01, ram.u8(SUB + 0x01) & ~0x40);
  const before = ram.u16(BUCKETS[bucket].counter);

  runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture),
    WHITE_WORLD_RESOURCES);
  assert.equal(ram.u32(REC + 0x12), cursor,
    'the scroll-locked handler does not execute the movement script');
  assert.equal(ram.u16(BUCKETS[bucket].counter) - before, 12);
  assert.equal(ram.u32(SUB + 0x0a), (sprite ^ 0xb4) >>> 0);
  assert.equal(ram.u8(SUB + 0x01) & 0x40, 0x40);

  runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture),
    WHITE_WORLD_RESOURCES);
  assert.equal(ram.u16(BUCKETS[bucket].counter) - before, 12,
    'the old bit-6 value suppresses the second-frame draw');
  assert.equal(ram.u8(SUB + 0x01) & 0x40, 0);
  assertWhiteOnly(reads);
});

test('White Type $8A rejects incomplete edition resources before mutating the record', () => {
  const fixture = spawnWhite8A();
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x8a];
  const invalid = { ...descriptor, poolA: null };
  const resources = {
    ...WHITE_WORLD_RESOURCES,
    enemyTypes: { ...WHITE_WORLD_RESOURCES.enemyTypes, 0x8a: invalid },
  };

  assert.throws(() => runHandler(descriptor.handler,
    fixture.ram, fixture.rom, REC, handlerContext(fixture), resources),
  /type-\$8A requires complete edition-bound resources/);
  assert.equal(fixture.ram.u16(REC), 0x8000);
  assertWhiteOnly(fixture.reads);
});

test('White Type $8A death allocates its bee from the general seventy', () => {
  const fixture = spawnWhite8A();
  const { ram, rom, reads } = fixture;
  const sourcePos = ram.u32(SUB + BEE.pos);

  killWhite8A(fixture);

  const slot = WHITE_POOL.base;
  assert.equal(ram.u16(REC), 0, 'the carrier retires after its native death arm');
  assert.equal(ram.u16(WHITE_POOL.liveCount), 1);
  assert.equal(ram.u16(slot + BEE.status), 0x8000 | KIND.bee);
  assert.equal(ram.u32(slot + BEE.pos), sourcePos);
  assert.equal(ram.u32(slot + BEE.sprite), 0x001bca34);
  assert.equal(ram.u16(slot + BEE.hitCount), 0x9601);
  const layerCell = WHITE_POOL.layerTable + ram.u8(SUB + 0x1f) * 4;
  assert.equal(ram.u32(slot + BEE.layerEmitter), rom.u32(layerCell));
  for (let i = 0; i < 10; i++) {
    assert.equal(ram.u16(POOL_A.reservedBase + i * WHITE_POOL.stride), 0,
      `Black reserved slot ${i} stays free`);
  }
  for (const address of [
    WHITE_POOL.dispatch, WHITE_POOL.templateTable + KIND.bee,
    WHITE_POOL.fillHookTable + KIND.bee, layerCell,
    WHITE_BEE.templatePointers[KIND.bee],
  ]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing White bee allocation read at $${address.toString(16)}`);
  }
  assertWhiteOnly(reads);
});

test('White Type $8A drops its bee when all seventy general slots are full', () => {
  const fixture = spawnWhite8A();
  const { ram, reads } = fixture;
  for (let i = 0; i < WHITE_POOL.generalSlots; i++) {
    ram.setU16(WHITE_POOL.base + i * WHITE_POOL.stride, 0x8000);
  }
  ram.setU16(WHITE_POOL.liveCount, WHITE_POOL.generalSlots);

  killWhite8A(fixture);

  assert.equal(ram.u16(REC), 0, 'a full bee pool does not keep the carrier alive');
  assert.equal(ram.u16(WHITE_POOL.liveCount), WHITE_POOL.generalSlots,
    'the failed allocation does not leak the live census');
  for (let i = 0; i < 10; i++) {
    assert.equal(ram.u16(POOL_A.reservedBase + i * WHITE_POOL.stride), 0,
      `the White allocator does not spill into reserved slot ${i}`);
  }
  assertWhiteOnly(reads);
});

test('White bee collection keeps P1 and P2 score ownership separate', () => {
  for (const { player, touchMask, ledger, otherLedger } of [
    { player: 1, touchMask: 0x1000, ledger: LEDGER.p1, otherLedger: LEDGER.p2 },
    { player: 2, touchMask: 0x0800, ledger: LEDGER.p2, otherLedger: LEDGER.p1 },
  ]) {
    const fixture = spawnWhite8A();
    const { ram, reads } = fixture;
    killWhite8A(fixture);
    const slot = WHITE_POOL.base;
    ram.setU32(ledger.pendingEnd - 4, 0);
    ram.setU32(otherLedger.pendingEnd - 4, 0);
    ram.setU16(POOL_A.beeCount, 0);
    ram.setU16(player === 1 ? POOL_A.chainMeterP1 : POOL_A.chainMeterP2, 0);

    assert.equal(touchBee(ram, slot, touchMask), 1,
      `P${player} legally overlaps the White bee`);
    assert.equal(ram.u16(slot + BEE.status) & touchMask, touchMask);
    assert.equal(ram.u16(slot + BEE.status) & 1, 0,
      'collision records ownership before the pool driver collects');

    const collected = driveWhitePool(fixture);
    assert.equal(collected.collected, 1);
    assert.equal(ram.u16(slot + BEE.status) & 1, 1,
      'the following pool frame enters collected presentation');
    assert.equal(pendingScore(ram, ledger), 0x00000100,
      `P${player} receives the White base score`);
    assert.equal(pendingScore(ram, otherLedger), 0,
      `the other player's score remains unchanged`);
    assert.equal(ram.u16(POOL_A.beeCount), 1);
    assertWhiteOnly(reads);
  }
});

test('White x2 bee uses White collection art and retires after its finite popup', () => {
  const fixture = spawnWhite8A();
  const { ram, rom, reads } = fixture;
  killWhite8A(fixture);
  const slot = WHITE_POOL.base;
  ram.setU32(LEDGER.p1.pendingEnd - 4, 0);
  ram.setU16(POOL_A.beeCount, 9);
  ram.setU16(POOL_A.cursor, 32);
  ram.setU16(POOL_A.noMissP1, 0);
  ram.setU16(POOL_A.chainMeterP1, 0);

  assert.equal(touchBee(ram, slot, 0x1000), 1);
  const transformed = driveWhitePool(fixture);
  assert.equal(transformed.collected, 1);
  assert.equal(ram.u16(slot + BEE.status) & 0x2001, 0x2001,
    'the tenth no-miss bee sets x2 and collected flags');
  assert.equal(ram.u32(slot + BEE.sprite), 0x001e39dc,
    'the selector reads the White collection sprite graph');
  assert.equal(ram.u16(POOL_A.cursor), 36);
  assert.equal(pendingScore(ram, LEDGER.p1), 0x00001200,
    'the native packed-BCD binary-double bug survives the White route');

  const zoomBucket = resolveZoomStub(
    rom, WHITE_BEE.collectedEmitter, WHITE_BEE.zoomScaleTable,
  ).bucket;
  const zoomBefore = ram.u16(BUCKETS[zoomBucket].counter);
  const popupBefore = ram.u16(BUCKETS[8].counter);
  ram.setU16(POOL_A.collisionPhase, 1);
  const presented = driveWhitePool(fixture);
  assert.equal(presented.emitted, 1);
  assert.equal(ram.u16(BUCKETS[zoomBucket].counter) - zoomBefore, 12,
    'the collected bee emits through the White zooming family');
  assert.equal(ram.u16(BUCKETS[8].counter) - popupBefore, 0,
    'the popup waits through its native two-byte timer floor');

  let collectedSteps = 1;
  while (ram.u16(BUCKETS[8].counter) === popupBefore && collectedSteps < 67) {
    driveWhitePool(fixture);
    collectedSteps++;
  }
  assert.equal(ram.u16(BUCKETS[8].counter) - popupBefore, 24,
    'the score digits and x2 indicator both emit when the popup opens');
  assert.equal(ram.u32(BUCKETS[8].buffer + popupBefore + 16), rom.u32(WHITE_BEE.x2Table + 0x10),
    'the x2 indicator reads the White tile table');

  for (let step = collectedSteps + 1; step <= 67; step++) {
    driveWhitePool(fixture);
    assert.notEqual(ram.u16(slot + BEE.status), 0,
      `the White popup remains live through collected step ${step}`);
  }
  const retired = driveWhitePool(fixture);
  assert.equal(retired.freed, 1);
  assert.equal(ram.u16(slot + BEE.status), 0);
  assert.equal(ram.u16(WHITE_POOL.liveCount), 0);
  assertWhiteOnly(reads);
});

test('White bee hyper threshold is strict and grants immediate side-specific items', () => {
  for (const { player, touchMask, ledger, side, itemKind } of [
    { player: 1, touchMask: 0x1000, ledger: LEDGER.p1,
      side: WHITE_BEE.grant.sides[0], itemKind: 0x0c },
    { player: 2, touchMask: 0x0800, ledger: LEDGER.p2,
      side: WHITE_BEE.grant.sides[1], itemKind: 0x14 },
  ]) {
    const exact = spawnWhite8A();
    killWhite8A(exact);
    exact.ram.setU32(ledger.pendingEnd - 4, 0);
    exact.ram.setU16(player === 1 ? POOL_A.chainMeterP1 : POOL_A.chainMeterP2, 1);
    exact.ram.setU16(player === 1 ? POOL_A.chainHitsP1 : POOL_A.chainHitsP2, 0x0019);
    exact.ram.setU16(side.earn, WHITE_BEE.grant.threshold);
    assert.equal(touchBee(exact.ram, WHITE_POOL.base, touchMask), 1);
    driveWhitePool(exact);
    assert.equal(exact.ram.u16(side.earn), WHITE_BEE.grant.threshold,
      `P${player} does not grant at exactly $095F`);
    assert.equal(exact.ram.u16(WHITE_BEE.grant.item.pools[itemKind]), 0);
    assertWhiteOnly(exact.reads);

    const above = spawnWhite8A();
    const events = [];
    killWhite8A(above);
    above.ram.setU32(ledger.pendingEnd - 4, 0);
    above.ram.setU16(player === 1 ? POOL_A.chainMeterP1 : POOL_A.chainMeterP2, 1);
    above.ram.setU16(player === 1 ? POOL_A.chainHitsP1 : POOL_A.chainHitsP2, 0x0001);
    above.ram.setU16(side.earn, WHITE_BEE.grant.threshold + 1);
    assert.equal(touchBee(above.ram, WHITE_POOL.base, touchMask), 1);
    driveWhitePool(above, { hyperEvent: (...event) => events.push(event) });
    const item = WHITE_BEE.grant.item.pools[itemKind];
    assert.equal(above.ram.u16(side.earn), 0);
    assert.equal(above.ram.u16(item), 0x8000 | itemKind,
      `P${player} receives its own White hyper-item kind`);
    assert.equal(above.ram.u16(item + 2), 0x7000);
    assert.equal(above.ram.u16(WHITE_BEE.grant.item.count), 1);
    assert.deepEqual(events, [['spawn', player, 0]]);
    assertWhiteOnly(above.reads);
  }
});

test('White bee hyper refusal clamps stock-five and pending-four earn', () => {
  for (const { cap, address } of [
    { cap: WHITE_BEE.grant.stockCap, address: WHITE_BEE.grant.sides[0].stock },
    { cap: WHITE_BEE.grant.pendingCap, address: WHITE_BEE.grant.sides[0].pending },
  ]) {
    const fixture = spawnWhite8A();
    const { ram, reads } = fixture;
    killWhite8A(fixture);
    const side = WHITE_BEE.grant.sides[0];
    ram.setU16(POOL_A.chainMeterP1, 1);
    ram.setU16(POOL_A.chainHitsP1, 0x0001);
    ram.setU16(side.earn, WHITE_BEE.grant.threshold + 1);
    ram.setU16(address, cap);
    assert.equal(touchBee(ram, WHITE_POOL.base, 0x1000), 1);

    driveWhitePool(fixture);

    assert.equal(ram.u16(side.earn), WHITE_BEE.grant.threshold);
    assert.equal(ram.u16(WHITE_BEE.grant.item.pools[side.kind]), 0,
      'a refused grant does not allocate an item');
    assertWhiteOnly(reads);
  }
});

test('White bee can bank a P2 grant under the native gate', () => {
  const fixture = spawnWhite8A();
  const { ram, reads } = fixture;
  const events = [];
  const side = WHITE_BEE.grant.sides[1];
  killWhite8A(fixture);
  ram.setU16(POOL_A.chainMeterP2, 1);
  ram.setU16(POOL_A.chainHitsP2, 0x0001);
  ram.setU16(side.earn, WHITE_BEE.grant.threshold + 1);
  ram.setU16(WHITE_BEE.grant.gate, 1);
  ram.setU16(side.player, 0);
  assert.equal(touchBee(ram, WHITE_POOL.base, 0x0800), 1);

  driveWhitePool(fixture, { hyperEvent: (...event) => events.push(event) });

  assert.equal(ram.u16(side.earn), 0);
  assert.equal(ram.u16(side.pending), 1);
  assert.equal(ram.u16(WHITE_BEE.grant.item.count), 0);
  assert.equal(ram.u16(WHITE_BEE.grant.item.pools[side.kind]), 0);
  assert.deepEqual(events, [['pending', 2, 1]]);
  assertWhiteOnly(reads);
});
