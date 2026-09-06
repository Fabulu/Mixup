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
import { BUCKETS, resolveZoomStub } from '../src/spritequeue.js';
import {
  B as IMPACT, POOL_A, allocBee27F92A, allocPoolAWithResources,
  runPoolADriverWithResources,
} from '../src/bee.js';
import { LEDGER } from '../src/score.js';
import { POOL_B, runEffectDriver } from '../src/effects.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x130e8c;
const MOVEMENT = 0x1323da;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const TYPE_8B = WHITE_WORLD_RESOURCES.enemyTypes[0x8b];
const WHITE_POOL = TYPE_8B.poolA;
const WHITE_MEDAL = WHITE_POOL.medal;
const WHITE_BEE = WHITE_POOL.bee;

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
  assert.equal(allowed.size, 847,
    'the overlapping White runtime categories resolve to 847 unique windows');
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
    'every tracked White Type $8B cartridge read stays below $200000');
}

function spawnWhite8B() {
  const { rom, reads } = trackedWhiteCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x00b3);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, null, null, null, null, world.resources,
  ), { script: 4, deferred: 0 });
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

function killWhite8B(fixture, extra = {}, killMask = 0x10) {
  fixture.ram.setU32(SUB + IMPACT.pos, 0x40002000);
  fixture.ram.setU8(SUB, fixture.ram.u8(SUB) | killMask);
  fixture.ram.setU16(SUB + 0x18, 0xffff);
  runHandler(TYPE_8B.handler, fixture.ram, fixture.rom, REC,
    handlerContext(fixture, extra), WHITE_WORLD_RESOURCES);
}

function driveWhitePool(fixture, extra = {}) {
  return runPoolADriverWithResources(fixture.ram, fixture.rom,
    handlerContext(fixture, extra), WHITE_POOL);
}

function pendingScore(ram, ledger) {
  return ram.u32(ledger.pendingEnd - 4);
}

function ramSlice(ram, address, length) {
  const base = ram.ramLayout.machine.ramBase;
  return Array.from(ram.b.slice(address - base, address - base + length));
}

function livePoolB(ram) {
  let count = 0;
  for (let i = 0; i < POOL_B.slots; i++) {
    if (ram.u16(POOL_B.base + i * POOL_B.stride) !== 0) count++;
  }
  return count;
}

test('Type $8B descriptors and maps keep Black and White identities isolated', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x8b];
  const white = TYPE_8B;

  assert.deepEqual(tables.editions.whiteLabel.stage1Type8B, {
    init: {
      start: '$1758BE', end: '$175920',
      sha256: '2153ba01d77c266125445cb4f4206763e7a1f54ee5c7a5e44e2dec5bc4169eb3',
    },
    handler: {
      start: '$175920', end: '$1759E0',
      sha256: '9b78e8e623df459e8ff7a3ab4d0948d59dd199c37b60a4f70219bba6c189bc6b',
    },
  });
  assert.equal(black.edition, 'black');
  assert.equal(white.edition, 'white');
  assert.equal(black.poolA.edition, black.edition);
  assert.equal(white.poolA.edition, white.edition);
  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.recordPrototype,
    black.subPrototype, black.scrollCompensation, black.poolA.allocator,
    black.poolAKind, black.effect.site, black.sound.death, black.retirement.entry,
  ], [
    0x27681c, 0x276824, 0x27687e, 0x27685e,
    0x276862, 0x24179e, 0x27f8ee,
    0x08, 0x276910, 0x28c25a, 0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.recordPrototype,
    white.subPrototype, white.scrollCompensation, white.poolA.allocator,
    white.poolAKind, white.effect.site, white.effect.remap,
    white.sound.death, white.retirement.entry,
  ], [
    0x1758be, 0x1758c6, 0x175920, 0x175900,
    0x175904, 0x141ad8, 0x17e9a0,
    0x08, 0x1759b2, 0x1773be,
    0x18ad80, 0x1627dc,
  ]);
  for (const value of [black, white, black.effect, white.effect,
    black.poolA, white.poolA, black.poolA.medal, white.poolA.medal]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const blackBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(blackBodies.has(black.initBody), true);
  assert.equal(blackBodies.has(white.initBody), false);
  assert.equal(whiteBodies.has(white.initBody), true);
  assert.equal(whiteBodies.has(black.initBody), false);
  const partialBodies = createInitBodyMap({
    0x8a: WHITE_WORLD_RESOURCES.enemyTypes[0x8a],
  });
  assert.equal(partialBodies.has(black.initBody), true,
    'a partial map that replaces another algorithm retains Black Type $8B');
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(black.handler), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(white.handler), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(white.handler), true);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(black.handler), false);
});

test('White Type $8B naturally loads its prototypes, movement, and early clock gate', () => {
  const fixture = spawnWhite8B();
  const { ram, rom, reads, world } = fixture;

  assert.equal(rom.u16(SOURCE), 0x00b3);
  assert.equal(rom.u8(SOURCE + 4), 0x8b);
  assert.equal(rom.u32(0x17d51c), TYPE_8B.initStub);
  assert.equal(rom.u32(0x17d520), TYPE_8B.handler);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 32);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u8(REC + 0x0c), 0x8b);
  assert.equal(ram.u32(REC + 0x12), MOVEMENT + 4,
    'the shared initializer consumes the native position prefix');
  assert.equal(ram.u32(REC + 0x4c), TYPE_8B.handler);
  const protoRam = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  protoRam.setU16(REC + 0x04, 0);
  protoRam.setU32(REC + 0x06, SUB);
  protoRam.setU32(REC + 0x12, 0);
  createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes).get(TYPE_8B.initBody)(
    protoRam, rom, REC, SUB, fixture.machineCtx.unportedLog,
  );
  assert.deepEqual(ramSlice(protoRam, REC + 0x16, 4),
    Array.from(rom.bytes(TYPE_8B.recordPrototype, 4)));
  assert.deepEqual(ramSlice(protoRam, SUB, 0x20), [
    ...rom.bytes(TYPE_8B.subPrototype, 2),
    0, 0, 0, 0,
    ...rom.bytes(TYPE_8B.subPrototype + 2, 0x1a),
  ], 'the 28 source bytes use the native long-form 32-byte RAM layout');

  ram.setU32(REC + 0x12, MOVEMENT);
  ram.setU16(0x813092, 1);
  ram.setU16(0x8130ce, 0xffff);
  createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes).get(TYPE_8B.initBody)(
    ram, rom, REC, SUB, fixture.machineCtx.unportedLog,
  );
  assert.equal(ram.u16(SUB), 0x8000,
    'the signed clock gate hides Stage 1 records below four');
  for (const address of [SOURCE, 0x17d51c, MOVEMENT,
    TYPE_8B.recordPrototype, TYPE_8B.subPrototype]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing White initialization read at $${address.toString(16)}`);
  }
  assertWhiteOnly(reads);
});

test('White Type $8B remains scroll-locked and opens its Stage 1 clock gate at four', () => {
  const fixture = spawnWhite8B();
  const { ram, rom, reads } = fixture;
  const movement = ram.u32(REC + 0x12);
  ram.setU32(SUB + IMPACT.pos, 0x40002000);
  ram.setU8(REC + 0x16, 1);
  ram.setU16(0x80b03c, 0x0020);
  ram.setU16(0x813172, 0);
  ram.setU16(0x813092, 1);
  ram.setU16(0x8130ce, 3);
  ram.setU8(SUB, ram.u8(SUB) & ~0x20);

  runHandler(TYPE_8B.handler, ram, rom, REC, handlerContext(fixture), WHITE_WORLD_RESOURCES);
  assert.equal(ram.u32(REC + 0x12), movement,
    'the scroll-locked handler never advances the movement stream');
  assert.equal(ram.u16(SUB + IMPACT.pos), 0x4020);
  assert.equal(ram.u8(SUB) & 0x20, 0);

  ram.setU16(0x8130ce, 4);
  runHandler(TYPE_8B.handler, ram, rom, REC, handlerContext(fixture), WHITE_WORLD_RESOURCES);
  assert.equal(ram.u8(SUB) & 0x20, 0x20);
  assertWhiteOnly(reads);
});

test('White Type $8B preserves nonlethal behavior without score, sound, or drops', () => {
  const fixture = spawnWhite8B();
  const events = [];
  const { ram, rom, reads } = fixture;
  ram.setU32(SUB + IMPACT.pos, 0x40002000);
  ram.setU8(SUB, ram.u8(SUB) | 0x10);
  ram.setU16(SUB + 0x18, 1);
  ram.setU32(LEDGER.p1.pendingEnd - 4, 0);

  runHandler(TYPE_8B.handler, ram, rom, REC,
    handlerContext(fixture, { soundPost: (request) => events.push(request) }),
    WHITE_WORLD_RESOURCES);

  assert.notEqual(ram.u16(REC), 0);
  assert.equal(ram.u8(SUB) & 0x5c, 0);
  assert.equal(pendingScore(ram, LEDGER.p1), 0);
  assert.equal(ram.u16(WHITE_POOL.liveCount), 0);
  assert.equal(ram.u16(POOL_B.base), 0);
  assert.deepEqual(events, []);
  assertWhiteOnly(reads);
});

test('White lethal route uses kind $08 template, jitter, effects, and the first general slot', () => {
  const fixture = spawnWhite8B();
  const { ram, rom, reads } = fixture;
  const events = [];
  const slot = WHITE_POOL.base;
  ram.setU16(slot + IMPACT.waypoint + 2, 0x5a5a);
  ram.setU16(0x803916, 0);
  const draw = rom.u8(WHITE_POOL.rng.jitter.table + 1);
  const template = WHITE_POOL.templatePointers[0x08];

  killWhite8B(fixture, { soundPost: (request) => events.push(request) });

  assert.equal(rom.u32(WHITE_POOL.templateTable + 0x08), template);
  assert.equal(rom.u32(WHITE_POOL.fillHookTable + 0x08), WHITE_POOL.fillHooks[0x08]);
  assert.equal(WHITE_POOL.fillHookDispatch[WHITE_POOL.fillHooks[0x08]], 'jitter');
  assert.equal(WHITE_POOL.bodyDispatch[WHITE_MEDAL.body], WHITE_MEDAL.canonicalBody);
  assert.equal(ram.u16(REC), 0, 'the enemy retires after its complete death arm');
  assert.equal(ram.u16(WHITE_POOL.liveCount), 1);
  assert.equal(ram.u16(slot + IMPACT.status), 0x8008);
  assert.equal(ram.u8(slot + IMPACT.blinkTimer),
    (rom.u8(template + 18) + (draw & 0x1f)) & 0xff);
  assert.equal(ram.u8(0x803917), 1);
  assert.equal(ram.u16(slot + IMPACT.waypoint), 0);
  assert.equal(ram.u16(slot + IMPACT.waypoint + 2), 0x5a5a,
    'the jitter hook does not run shared velocity setup');
  assert.notEqual(ram.u16(POOL_B.base), 0, 'the edition Pool-B kind-$01 effect spawns');
  assert.equal(ram.u16(POOL_B.base) & 0x7f, 1);
  assert.deepEqual(events, [TYPE_8B.sound.death]);
  assertWhiteOnly(reads);
});

test('White Type $8B drops cleanly when all seventy general slots are full', () => {
  const fixture = spawnWhite8B();
  const { ram, reads } = fixture;
  for (let i = 0; i < WHITE_POOL.generalSlots; i++) {
    ram.setU16(WHITE_POOL.base + i * WHITE_POOL.stride, 0x8000);
  }
  ram.setU16(WHITE_POOL.liveCount, WHITE_POOL.generalSlots);

  killWhite8B(fixture);

  assert.equal(ram.u16(REC), 0);
  assert.equal(ram.u16(WHITE_POOL.liveCount), WHITE_POOL.generalSlots);
  for (let i = 0; i < 10; i++) {
    assert.equal(ram.u16(POOL_A.reservedBase + i * WHITE_POOL.stride), 0,
      `the White general allocator does not spill into reserved slot ${i}`);
  }
  assertWhiteOnly(reads);
});

test('Black Type $8B uses general slots while its Type $8A bee keeps reserved ownership', () => {
  const blackType8B = BLACK_WORLD_RESOURCES.enemyTypes[0x8b];
  const blackType8A = BLACK_WORLD_RESOURCES.enemyTypes[0x8a];
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const carrier = SUB;
  ram.setU32(carrier + IMPACT.pos, 0x40002000);
  ram.setU16(0x813172, 0);
  ram.setU16(0x813176, 0);

  assert.equal(blackType8B.poolA.allocator, 0x27f8ee);
  assert.equal(blackType8B.poolA.allocation, 'general-seventy');
  assert.equal(blackType8A.poolA.bee.allocator, 0x27f92a);
  assert.equal(blackType8A.poolA.bee.allocation, 'reserved-ten');
  assert.equal(allocPoolAWithResources(ram, rom, {}, 0x08, 0, 0,
    carrier, blackType8B.poolA), POOL_A.base);
  assert.equal(allocBee27F92A(ram, rom, {}, 0x04, 0,
    carrier, blackType8A.poolA), POOL_A.reservedBase);
  assert.equal(ram.u16(POOL_A.base), 0x8008);
  assert.equal(ram.u16(POOL_A.reservedBase), 0x8004);
});

test('White kind $08 steps, collects for either player, caps counters, and maps sound', () => {
  for (const { touch, ledger, other, counter, start, expected } of [
    { touch: 0x1000, ledger: LEDGER.p1, other: LEDGER.p2,
      counter: WHITE_MEDAL.collectP1, start: 0, expected: 1 },
    { touch: 0x0800, ledger: LEDGER.p2, other: LEDGER.p1,
      counter: WHITE_MEDAL.collectP2, start: WHITE_MEDAL.collectCap,
      expected: WHITE_MEDAL.collectCap },
  ]) {
    const fixture = spawnWhite8B();
    const { ram, reads } = fixture;
    const events = [];
    killWhite8B(fixture);
    const slot = WHITE_POOL.base;
    ram.setU16(WHITE_POOL.scrollShort, 0);
    ram.setU16(WHITE_POOL.scrollLong, 0x0020);
    ram.setU16(WHITE_POOL.freeze, 0);
    ram.setU32(slot + IMPACT.pos, 0x40002000);
    const stepped = driveWhitePool(fixture);
    assert.equal(stepped.emitted, 1);
    assert.equal(ram.u16(slot + IMPACT.pos), 0x4020);

    ram.setU16(counter, start);
    ram.setU32(ledger.pendingEnd - 4, 0);
    ram.setU32(other.pendingEnd - 4, 0);
    ram.setU16(slot + IMPACT.status, ram.u16(slot + IMPACT.status) | touch);
    const collected = driveWhitePool(fixture,
      { soundPost: (request) => events.push(request) });
    assert.equal(collected.collected, 1);
    assert.equal(ram.u16(counter), expected);
    assert.equal(pendingScore(ram, ledger), WHITE_MEDAL.collectScore);
    assert.equal(pendingScore(ram, other), 0);
    assert.deepEqual(events, [0x28c5e4],
      'White wrapper $18B10A maps to the canonical runtime sound request');
    assert.equal(events.includes(WHITE_POOL.collectionWrapper), false);
    assert.equal(ram.u16(slot + IMPACT.status) & 0x80, 0x80);
    assertWhiteOnly(reads);
  }
});

test('White collected kind $08 uses its continuation and frees its live census', () => {
  const fixture = spawnWhite8B();
  const { ram, rom, reads } = fixture;
  killWhite8B(fixture);
  const slot = WHITE_POOL.base;
  ram.setU16(slot + IMPACT.status, ram.u16(slot + IMPACT.status) | 0x1000);
  driveWhitePool(fixture);

  const bucket = resolveZoomStub(
    rom, WHITE_BEE.collectedEmitter, WHITE_BEE.zoomScaleTable,
  ).bucket;
  const before = ram.u16(BUCKETS[bucket].counter);
  const continued = driveWhitePool(fixture);
  assert.equal(continued.collected, 1);
  assert.equal(continued.emitted, 1);
  assert.equal(ram.u16(BUCKETS[bucket].counter) - before, 12);

  ram.setU8(slot + IMPACT.hitShortA, 1);
  ram.setU8(slot + IMPACT.blinkTimer + 1, 1);
  const retired = driveWhitePool(fixture);
  assert.equal(retired.freed, 1);
  assert.equal(ram.u16(slot + IMPACT.status), 0);
  assert.equal(ram.u16(WHITE_POOL.liveCount), 0);
  assertWhiteOnly(reads);
});

test('White Pool-B kind $01 follows its private script pair and drains', () => {
  const fixture = spawnWhite8B();
  const { ram, rom, reads } = fixture;
  killWhite8B(fixture);
  const script = rom.u32(0x121528);
  const duration = rom.u32(0x12152c);
  assert.ok(script >= 0x12180e && script < 0x121860);
  assert.ok(duration >= 0x12180e && duration < 0x121860);
  assert.equal(livePoolB(ram), 1);

  let frames = 0;
  while (livePoolB(ram) !== 0 && frames < 512) {
    runEffectDriver(ram, rom, handlerContext(fixture), TYPE_8B.effects);
    frames++;
  }
  assert.ok(frames > 0 && frames < 512, `kind $01 drained in ${frames} frames`);
  assert.equal(livePoolB(ram), 0);
  for (const address of [0x121528, script, duration]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing White Pool-B read at $${address.toString(16)}`);
  }
  assertWhiteOnly(reads);
});

test('Type $8B refuses incomplete init and handler resources before RAM mutation', () => {
  const fixture = spawnWhite8B();
  const { ram, rom, reads } = fixture;

  const badInit = Object.freeze({ ...TYPE_8B, subPrototype: null });
  const initMap = createInitBodyMap({ 0x8b: badInit });
  let before = Array.from(ram.b);
  assert.throws(() => initMap.get(TYPE_8B.initBody)(
    ram, rom, REC, SUB, fixture.machineCtx.unportedLog,
  ), /type \$8B init needs a complete frozen edition descriptor/);
  assert.deepEqual(Array.from(ram.b), before);

  const foreignInit = Object.freeze({
    ...TYPE_8B,
    subPrototype: BLACK_WORLD_RESOURCES.enemyTypes[0x8b].subPrototype,
  });
  before = Array.from(ram.b);
  assert.throws(() => createInitBodyMap({ 0x8b: foreignInit }).get(TYPE_8B.initBody)(
    ram, rom, REC, SUB, fixture.machineCtx.unportedLog,
  ), /type \$8B init needs a complete frozen edition descriptor/);
  assert.deepEqual(Array.from(ram.b), before,
    'foreign prototype addresses refuse before the initializer writes either record');

  const badHandler = Object.freeze({ ...TYPE_8B, poolA: null });
  const badWorld = Object.freeze({
    ...WHITE_WORLD_RESOURCES,
    enemyTypes: Object.freeze({ ...WHITE_WORLD_RESOURCES.enemyTypes, 0x8b: badHandler }),
  });
  before = Array.from(ram.b);
  assert.throws(() => runHandler(TYPE_8B.handler, ram, rom, REC,
    handlerContext(fixture), badWorld),
  /type \$8B handler needs a complete frozen edition resource graph/);
  assert.deepEqual(Array.from(ram.b), before);

  const poolWithoutKinds = Object.freeze(Object.fromEntries(
    Object.entries(TYPE_8B.poolA).filter(([key]) => key !== 'supportedKinds'),
  ));
  const badAllocation = Object.freeze({ ...TYPE_8B, poolA: poolWithoutKinds });
  const badAllocationWorld = Object.freeze({
    ...WHITE_WORLD_RESOURCES,
    enemyTypes: Object.freeze({
      ...WHITE_WORLD_RESOURCES.enemyTypes, 0x8b: badAllocation,
    }),
  });
  before = Array.from(ram.b);
  assert.throws(() => runHandler(TYPE_8B.handler, ram, rom, REC,
    handlerContext(fixture), badAllocationWorld),
  /type \$8B handler needs a complete frozen edition resource graph/);
  assert.deepEqual(Array.from(ram.b), before,
    'allocator capability refusal occurs before damage, score, sound, or retirement');

  const assertHandlerRefusal = (badDescriptor, label) => {
    const badWorld = Object.freeze({
      ...WHITE_WORLD_RESOURCES,
      enemyTypes: Object.freeze({
        ...WHITE_WORLD_RESOURCES.enemyTypes, 0x8b: badDescriptor,
      }),
    });
    const events = [];
    const snapshot = Array.from(ram.b);
    assert.throws(() => runHandler(TYPE_8B.handler, ram, rom, REC,
      handlerContext(fixture, { soundPost: (request) => events.push(request) }), badWorld),
    /type \$8B handler needs a complete frozen edition resource graph/);
    assert.deepEqual(Array.from(ram.b), snapshot, label);
    assert.deepEqual(events, [], `${label}: no sound posts`);
  };

  const poolWithoutScroll = Object.freeze(Object.fromEntries(
    Object.entries(TYPE_8B.poolA).filter(([key]) => key !== 'scrollShort'),
  ));
  assertHandlerRefusal(Object.freeze({ ...TYPE_8B, poolA: poolWithoutScroll }),
    'missing scrollShort refuses before any RAM mutation');
  assertHandlerRefusal(Object.freeze({
    ...TYPE_8B, poolA: BLACK_WORLD_RESOURCES.enemyTypes[0x8b].poolA,
  }), 'a White descriptor cannot use the Black Pool-A graph');
  assertHandlerRefusal(Object.freeze({
    ...TYPE_8B, sound: BLACK_WORLD_RESOURCES.enemyTypes[0x8b].sound,
  }), 'a White descriptor cannot post Black sound resources');
  for (const effect of [
    Object.freeze({ ...TYPE_8B.effect, kind: 2 }),
    Object.freeze({ ...TYPE_8B.effect, hook: 2 }),
  ]) {
    assertHandlerRefusal(Object.freeze({ ...TYPE_8B, effect }),
      'Type $8B requires the native kind-one, hook-one death effect');
  }

  const shiftedBee = Object.freeze({ ...WHITE_POOL.bee, scanBase: POOL_A.reservedBase });
  const shiftedPool = Object.freeze({
    ...WHITE_POOL, base: POOL_A.reservedBase, bee: shiftedBee,
  });
  before = Array.from(ram.b);
  assert.throws(() => allocPoolAWithResources(ram, rom, {}, 0x08, 0, 0, SUB, shiftedPool),
    /complete frozen general-seventy resource graph/);
  assert.deepEqual(Array.from(ram.b), before,
    'a fabricated White graph cannot redirect allocation into reserved RAM');

  const foreignRomPool = Object.freeze({
    ...WHITE_POOL,
    dispatch: 0x27f99e,
    templateTable: 0x280e4a,
    templatePointers: Object.freeze({ ...WHITE_POOL.templatePointers, 0x08: 0x280ec6 }),
    fillHookTable: 0x280bce,
    layerTable: 0x280bb6,
  });
  const readsBeforeForeignGraph = reads.length;
  before = Array.from(ram.b);
  assert.throws(() => allocPoolAWithResources(
    ram, rom, {}, 0x08, 0, 0, SUB, foreignRomPool,
  ), /complete frozen general-seventy resource graph/);
  assert.deepEqual(Array.from(ram.b), before,
    'foreign Pool-A cartridge tables refuse before RAM mutation');
  assert.equal(reads.length, readsBeforeForeignGraph,
    'foreign Pool-A cartridge tables refuse before any ROM read');

  const foreignJitterPool = Object.freeze({
    ...WHITE_POOL,
    rng: Object.freeze({
      ...WHITE_POOL.rng,
      jitter: Object.freeze({ ...WHITE_POOL.rng.jitter, table: 0x242e42 }),
    }),
  });
  const readsBeforeForeignJitter = reads.length;
  before = Array.from(ram.b);
  assert.throws(() => allocPoolAWithResources(
    ram, rom, {}, 0x08, 0, 0, SUB, foreignJitterPool,
  ), /complete frozen edition collection resource graph/);
  assert.deepEqual(Array.from(ram.b), before,
    'a foreign jitter table refuses before RAM mutation');
  assert.equal(reads.length, readsBeforeForeignJitter,
    'a foreign jitter table refuses before any ROM read');

  ram.setU8(SUB, ram.u8(SUB) | 0x10);
  ram.setU16(SUB + 0x18, 0xffff);
  ram.setU16(REC + 0x18, 0x0c);
  const events = [];
  before = Array.from(ram.b);
  assert.throws(() => runHandler(TYPE_8B.handler, ram, rom, REC,
    handlerContext(fixture, { soundPost: (request) => events.push(request) }),
    WHITE_WORLD_RESOURCES), /1759AA/);
  assert.deepEqual(Array.from(ram.b), before,
    'a foreign death-drop kind refuses before scroll, damage, score, or retirement');
  assert.deepEqual(events, []);
  assertWhiteOnly(reads);
});
