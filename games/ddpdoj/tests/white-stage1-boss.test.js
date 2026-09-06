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
  DEFQ_D1, enqueueDeferred, processDeferred, runSpawnWalker,
} from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { PaletteState } from '../src/palette.js';
import { BUCKETS } from '../src/spritequeue.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { B, POOL_B } from '../src/effects.js';
import { BUL, REC as BULLET_REC } from '../src/bullets.js';
import { BOSS, W425 } from '../src/boss.js';
import { e12Step2966B8, W103 } from '../src/bossf23.js';
import { RNG } from '../src/rng.js';
import { SCHED, clearDispatched, dumpDispatched } from '../src/scheduler.js';
import {
  BLACK_TYPE0E_RESOURCES, BLACK_TYPE1E_RESOURCES,
  WHITE_TYPE0E_RESOURCES, WHITE_TYPE1E_RESOURCES,
  requireType0EResources, requireType1EResources,
} from '../src/boss-resources.js';
import {
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x1316fc;
const BOSS_REC = ENEMY.bandCommon;
const BOSS_SUB = 0x81521c;

function whiteCartridgeWindows() {
  const white = tables.editions.whiteLabel;
  const descriptors = [
    ...white.frontendWindows, ...white.worldRuntimeWindows,
    ...white.hyperHudRuntimeWindows, ...white.playerWindows,
    ...white.shotProducerWindows, ...white.shotRuntimeWindows,
    ...white.shotSpeedWindows, ...white.optionRuntimeWindows,
    ...white.bulletRuntimeWindows, ...white.bulletSpeedWindows,
    ...white.button2RuntimeWindows,
  ];
  const key = ({ base, len }) => `${base}:${len}`;
  const allowed = new Set(descriptors.map(key));
  const windows = tables.rom.windows.filter((window) => allowed.has(key(window)));
  assert.equal(windows.length, allowed.size,
    'every unique White descriptor resolves to one global ROM window');
  return windows;
}

function trackedWhiteCartridge() {
  const windows = whiteCartridgeWindows();
  const numeric = windows.map(({ base, len }) => ({
    start: Number.parseInt(base.slice(1), 16),
    end: Number.parseInt(base.slice(1), 16) + len,
  }));
  const reads = [];
  const source = new RomWindows({ windows });
  const widths = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4 };
  const rom = new Proxy(source, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isInteger(address)) {
          const length = property === 'bytes' ? (args[0] ?? 0) : (widths[property] ?? 0);
          reads.push({ method: property, address, end: address + length });
        }
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  return { rom, reads, numeric, windows };
}

function assertWholeWhiteReads(fixture) {
  for (const read of fixture.reads) {
    assert.ok(read.address >= 0 && read.end <= 0x200000,
      `White boss ${read.method} escaped Build A at $${read.address.toString(16)}`);
    assert.ok(fixture.numeric.some(({ start, end }) =>
      read.address >= start && read.end <= end),
    `White boss ${read.method} at $${read.address.toString(16)} crossed a window seam`);
  }
}

function assertDeepFrozen(root) {
  const seen = new WeakSet();
  const visit = (value) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) visit(child);
  };
  visit(root);
}

function type0ERoute(resources) {
  return [
    resources.edition, resources.type, resources.algorithm,
    resources.initStub, resources.initBody, resources.handler,
    resources.recordPrototype, resources.subPrototype,
    ...Object.values(resources.scripts), resources.movement.entry,
    resources.lifecycle.retirement.entry,
    resources.lifecycle.retirement.semantic,
    resources.lifecycle.objectDispatch, resources.lifecycle.childType,
    resources.d.d6.state5, resources.d.d6.state4Wait,
    resources.d.d6.whiteState5,
    resources.e.e12.count, resources.e.e12.muzzle,
    resources.e.e12.hpGate, resources.e.e12.angles,
    resources.e.e12.increment, resources.e.e12.callsPerMuzzle,
  ];
}

function type1ERoute(resources) {
  return [
    resources.edition, resources.type, resources.algorithm,
    resources.initStub, resources.initBody, resources.handler,
    resources.subPrototype, resources.movement.entry,
    resources.bullet.entry, resources.fanTables, resources.countDeltas,
    resources.animationTable, resources.emitter, resources.sites.effects,
    resources.retirement.entry, resources.retirement.semantic,
  ];
}

function liveEffects(ram) {
  return Array.from({ length: POOL_B.slots }, (_, index) =>
    POOL_B.base + index * POOL_B.stride).filter((address) =>
    ram.u16(address + B.status) !== 0);
}

function liveBullets(ram) {
  return Array.from({ length: BUL.slots }, (_, index) =>
    BUL.pool + index * BUL.stride).filter((address) =>
    ram.u16(address + BULLET_REC.typeWord) !== 0);
}

function addPosition(position, offset) {
  return (((position >>> 16) + (offset >>> 16)) & 0xffff) * 0x10000
    + (((position & 0xffff) + (offset & 0xffff)) & 0xffff);
}

test('White Stage 1 boss follows its native Type $0E and Type $1E route', () => {
  assert.equal(BLACK_WORLD_RESOURCES.enemyTypes[0x0e], BLACK_TYPE0E_RESOURCES);
  assert.equal(BLACK_WORLD_RESOURCES.enemyTypes[0x1e], BLACK_TYPE1E_RESOURCES);
  assert.equal(WHITE_WORLD_RESOURCES.enemyTypes[0x0e], WHITE_TYPE0E_RESOURCES);
  assert.equal(WHITE_WORLD_RESOURCES.enemyTypes[0x1e], WHITE_TYPE1E_RESOURCES);

  assert.deepEqual(type0ERoute(BLACK_TYPE0E_RESOURCES), [
    'black', 0x0e, 'type0E',
    0x2926da, 0x2926e2, 0x292902, 0x2927f6, 0x292806,
    0x293104, 0x295856, 0x292932, 0x29370a, 0x294f68,
    0x2417de, 0x263762, 'freeEnemy', 0x240f62, 0x1e,
    null, 8, false,
    0x29668c, 0x29667c, 0x48cc, [0x84, 0x7c], 0x12, 5,
  ]);
  assert.deepEqual(type0ERoute(WHITE_TYPE0E_RESOURCES), [
    'white', 0x0e, 'type0E',
    0x1910c6, 0x1910ce, 0x1912f6, 0x1911ea, 0x1911fa,
    0x191af8, 0x1942a2, 0x191326, 0x1920f6, 0x1939c0,
    0x141b18, 0x1627dc, 'freeEnemy', 0x141294, 0x1e,
    0x192d40, null, true,
    0x1950cc, 0x1950bc, null, [0x80, 0x80], 0x0c, 5,
  ]);
  assert.deepEqual(type1ERoute(BLACK_TYPE1E_RESOURCES), [
    'black', 0x1e, 'type1E',
    0x296d82, 0x296d8a, 0x296dd6, 0x296dbc, 0x2417de,
    0x2813f0, [0x2736fa, 0x2735fa, 0x2734fa], [4, 3],
    0x296f68, 0x23f7c6, [0x296dfc, 0x296e4a],
    0x263762, 'freeEnemy',
  ]);
  assert.deepEqual(type1ERoute(WHITE_TYPE1E_RESOURCES), [
    'white', 0x1e, 'type1E',
    0x1957b8, 0x1957c0, 0x19580c, 0x1957f2, 0x141b18,
    0x180474, [0x17274e, 0x17264e, 0x17254e], [5, 5],
    0x19599e, 0x13fb14, [0x195832, 0x195880],
    0x1627dc, 'freeEnemy',
  ]);

  for (const resources of [BLACK_TYPE0E_RESOURCES, WHITE_TYPE0E_RESOURCES,
    BLACK_TYPE1E_RESOURCES, WHITE_TYPE1E_RESOURCES]) {
    assertDeepFrozen(resources);
    const requireResources = resources.type === 0x0e
      ? requireType0EResources : requireType1EResources;
    assert.throws(() => requireResources({ ...resources }, resources.edition),
      /complete recursively frozen edition descriptor/);
  }

  const blackBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes, 'white');
  const blackHandlers = handlerMap(BLACK_WORLD_RESOURCES);
  const whiteHandlers = handlerMap(WHITE_WORLD_RESOURCES);
  assert.deepEqual([
    blackBodies.has(BLACK_TYPE0E_RESOURCES.initBody),
    blackBodies.has(BLACK_TYPE1E_RESOURCES.initBody),
    blackBodies.has(WHITE_TYPE0E_RESOURCES.initBody),
    blackBodies.has(WHITE_TYPE1E_RESOURCES.initBody),
    whiteBodies.has(BLACK_TYPE0E_RESOURCES.initBody),
    whiteBodies.has(BLACK_TYPE1E_RESOURCES.initBody),
    whiteBodies.has(WHITE_TYPE0E_RESOURCES.initBody),
    whiteBodies.has(WHITE_TYPE1E_RESOURCES.initBody),
    blackHandlers.has(BLACK_TYPE0E_RESOURCES.handler),
    blackHandlers.has(BLACK_TYPE1E_RESOURCES.handler),
    blackHandlers.has(WHITE_TYPE0E_RESOURCES.handler),
    blackHandlers.has(WHITE_TYPE1E_RESOURCES.handler),
    whiteHandlers.has(BLACK_TYPE0E_RESOURCES.handler),
    whiteHandlers.has(BLACK_TYPE1E_RESOURCES.handler),
    whiteHandlers.has(WHITE_TYPE0E_RESOURCES.handler),
    whiteHandlers.has(WHITE_TYPE1E_RESOURCES.handler),
  ], [
    true, true, false, false, false, false, true, true,
    true, true, false, false, false, false, true, true,
  ]);

  assert.deepEqual(tables.editions.whiteLabel.stage1Type0E, {
    init: {
      start: '$1910C6', end: '$1912F6',
      sha256: '598bb902364ace359687cf9e06a3aef842c20a50955bc9b2ac4e2958eaf363e3',
    },
    handler: {
      start: '$1912F6', end: '$191326',
      sha256: 'c91b79f6d8b6ac90699acd56f67ee3ecb44aa608cfa45fa08551053cf5bba2c0',
    },
    type1EInit: {
      start: '$1957B8', end: '$19580C',
      sha256: '81c8e133efc102538173f67e5f4dd59d1e3c9f12dd0d54c85706f11d75ffac6d',
    },
    type1EHandler: {
      start: '$19580C', end: '$19599E',
      sha256: 'd6e8382b6d2861d87663834d14ac22f1bc8ed9a2b20a5b76064db0c6e2263388',
    },
  });

  const fixture = trackedWhiteCartridge();
  const { rom, reads, windows } = fixture;
  assert.equal(windows.some(({ base, len }) => {
    const start = Number.parseInt(base.slice(1), 16);
    return WHITE_TYPE1E_RESOURCES.emitter >= start
      && WHITE_TYPE1E_RESOURCES.emitter < start + len;
  }), false, 'the Type $1E executable emitter is not a runtime data window');
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 16)), [
    0x01, 0xe8, 0x00, 0x00, 0x0e, 0x80, 0x00, 0x92,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  ]);
  assert.deepEqual([rom.u32(0x16690c), rom.u32(0x166910)],
    [WHITE_TYPE0E_RESOURCES.initStub, WHITE_TYPE0E_RESOURCES.handler]);
  assert.deepEqual([rom.u32(0x16698c), rom.u32(0x166990)],
    [WHITE_TYPE1E_RESOURCES.initStub, WHITE_TYPE1E_RESOURCES.handler]);

  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const palette = new PaletteState();
  const machineCtx = {};
  createWhiteStage1Machine(rom, palette, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  world.resetSpawn(ram, rom, machineCtx);
  const paletteBefore = palette.installCount;
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x01e8);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, world.tables,
    null, palette, null, world.resources,
  ), { script: 1, deferred: 0 });
  assert.deepEqual([
    ram.u16(BOSS_REC), ram.u8(BOSS_REC + 0x0c),
    ram.u16(BOSS_REC + 0x04), ram.u32(BOSS_REC + BOSS.subRec),
    ram.u32(BOSS_REC + 0x4c), ram.u32(BOSS_SUB + 0x02),
    ram.u32(SCHED.ptrA0), ram.u32(SCHED.ptrA1), ram.u32(SCHED.ptrA2),
    ram.u32(SCHED.ptrA3), ram.u32(SCHED.ptrA4), ram.u16(0x81b6e4),
    ram.u32(world.resources.spawn.liveCursor), palette.installCount - paletteBefore,
  ], [
    0x8000, 0x0e, 8, BOSS_SUB, WHITE_TYPE0E_RESOURCES.handler,
    WHITE_TYPE0E_RESOURCES.position,
    WHITE_TYPE0E_RESOURCES.scripts.a0, WHITE_TYPE0E_RESOURCES.scripts.a1,
    WHITE_TYPE0E_RESOURCES.scripts.a2, WHITE_TYPE0E_RESOURCES.scripts.a3,
    WHITE_TYPE0E_RESOURCES.scripts.a4, 1, SOURCE + 8, 5,
  ]);

  const unported = new UnportedLog();
  const handlerCtx = {
    ...machineCtx, ram, rom, tables: world.tables,
    palette, unported, unportedLog: unported,
  };
  clearDispatched();
  runHandler(WHITE_TYPE0E_RESOURCES.handler, ram, rom, BOSS_REC,
    handlerCtx, world.resources);
  assert.deepEqual(dumpDispatched(), [0x19193e, 0x1939f8],
    'the natural frame records native White scheduler identities');

  const queued = enqueueDeferred(
    ram, WHITE_TYPE1E_RESOURCES.type, DEFQ_D1.FIXED00, 0, world.resources,
  );
  assert.equal(queued.dropped, false);
  ram.setU32(queued.addr + 0x16, 0x40002000);
  ram.setU16(queued.addr + 0x1a, 0x2020);
  ram.setU16(queued.addr + 0x1c, 3);
  ram.setU16(queued.addr + 0x1e, 8);
  assert.equal(processDeferred(
    ram, rom, unported, world.tables, null, palette, null, world.resources,
  ), 1);

  const child = BOSS_REC + ENEMY.stride;
  const childSub = world.resources.spawn.subCommon;
  assert.deepEqual([
    ram.u16(child), ram.u8(child + 0x0c), ram.u32(child + 0x06),
    ram.u32(child + 0x4c), ram.u32(childSub + 0x02),
    ram.u16(childSub + 0x1a), ram.u16(child + 0x24),
  ], [
    0x8001, 0x1e, childSub, WHITE_TYPE1E_RESOURCES.handler,
    0x40002000, 0x2020, 8,
  ]);
  ram.setU8(W103.bossFlags, ram.u8(W103.bossFlags) & 0xbf);
  ram.setU8(child + 0x26, 0x20);
  ram.setU8(childSub + 0x1a, 8);
  ram.setU16(BUCKETS[22].counter, 0);
  const childReadStart = reads.length;
  runHandler(WHITE_TYPE1E_RESOURCES.handler, ram, rom, child,
    handlerCtx, world.resources);
  const childReads = reads.slice(childReadStart);
  assert.equal(ram.u16(BUCKETS[22].counter), 12);
  assert.equal(childReads.some(({ address }) =>
    address === WHITE_TYPE1E_RESOURCES.animationTable), true);
  assert.equal(childReads.some(({ address, end }) =>
    address <= WHITE_TYPE1E_RESOURCES.emitter
      && end > WHITE_TYPE1E_RESOURCES.emitter), false,
  'the live Type $1E draw never reads its executable emitter as data');

  const deathRam = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const deathA4 = 0x812a74;
  const deathSub = 0x81521c;
  const deathPos = 0x50002000;
  const sounds = [];
  const sentinels = [
    [0x803930, 0x1111], [0x813186, 0x2222], [0x813188, 0x3333],
    [0x80b054, 0x4444], [0x80b056, 0x5555],
    [0x803934, 0x6666], [0x803936, 0x7777],
  ];
  deathRam.setU32(deathSub + 0x02, deathPos);
  deathRam.setU8(deathA4 + W425.D6.state, 5);
  deathRam.setU16(deathA4 + W425.D6.wait, 0x1234);
  for (const [address, value] of sentinels) deathRam.setU16(address, value);
  W425.d6Step293E04(deathRam, rom, {
    bossResources: WHITE_TYPE0E_RESOURCES,
    bossSubRec: deathSub,
    soundPost: (address) => sounds.push(address),
  }, deathA4);

  assert.deepEqual(sounds, [0x28c392, 0x28c310, 0x28c392]);
  assert.equal(deathRam.u8(RNG.counter), 44);
  assert.equal(deathRam.u16(deathA4 + W425.D6.wait), 0x80,
    'White state 5 ignores the pre-existing wait');
  assert.equal(deathRam.u8(deathA4 + W425.D6.state), 6);
  assert.deepEqual(sentinels.map(([address]) => deathRam.u16(address)),
    sentinels.map(([, value]) => value),
  'the Black final blast and screen-shake fields stay untouched');
  assert.equal(reads.some(({ address }) =>
    address === WHITE_TYPE0E_RESOURCES.d.d6.state5), true);

  const effects = liveEffects(deathRam);
  assert.equal(effects.length, 41);
  const randomByte = (index) => rom.u8(WHITE_TYPE0E_RESOURCES.rng.byte.table + index);
  const signedByte = (value) => value >= 0x80 ? value - 0x100 : value;
  const burstRows = [
    [0, 0, 0xe800fe00, 8, 0x00], [1, 0, 0xf4000400, 8, 0x20],
    [2, 0, 0xfe000000, 8, 0x40], [3, 0x40, 0xf600fc00, 8, 0x60],
    [4, 0x40, 0x0400fa00, 8, 0x80], [5, 0, 0xe8000400, 8, 0xa0],
    [6, 0x40, 0x0c000200, 8, 0xc0], [7, 0x40, 0xf6000000, 8, 0xe0],
  ];
  assert.deepEqual(effects.slice(0, 8).map((address, index) => [
    deathRam.u16(address + B.status) & 0x7fff,
    deathRam.u16(address + B.bucket), deathRam.u32(address + B.pos),
    deathRam.u16(address + B.delay), deathRam.u8(address + B.f1c),
    deathRam.u32(address + B.nudge), deathRam.u8(address + B.speed),
    deathRam.u8(address + B.angle),
  ]), burstRows.map(([delay, f1c, nudge, speed, angle], index) => [
    0x0d, 4, deathPos, delay, f1c, nudge, speed,
    (angle + signedByte(randomByte(index + 1))) & 0xff,
  ]));

  const kinds = [7, 4, 7, 4, 7, 4, 7, 5, 4, 5, 5];
  const speeds = [5, 7, 10, 14, 18, 22, 28, 34, 40, 46, 52];
  const delays = [0, 1, 2, 3, 6, 8, 10, 12, 14, 16, 18];
  const groups = [
    [(deathPos + 0xf8000a00) >>> 0, 0x40],
    [(deathPos + 0xfffff800) >>> 0, 0xb0],
    [(deathPos + 0xf4000000) >>> 0, 0x80],
  ];
  let randomIndex = 9;
  for (let group = 0; group < groups.length; group++) {
    const [position, bias] = groups[group];
    const baseAngle = (randomByte(randomIndex++) * 4 + bias) & 0xff;
    const records = effects.slice(8 + group * 11, 19 + group * 11);
    assert.deepEqual(records.map((address, index) => [
      deathRam.u16(address + B.status) & 0x7fff,
      deathRam.u16(address + B.bucket), deathRam.u32(address + B.pos),
      deathRam.u8(address + B.speed), deathRam.u8(address + B.angle),
      deathRam.u16(address + B.delay),
    ]), kinds.map((kind, index) => [
      kind, 0x0c, position, speeds[index],
      (baseAngle + (signedByte(randomByte(randomIndex++)) >> 2)) & 0xff,
      delays[index],
    ]));
  }
  assert.equal(randomIndex, 45);

  const bulletRam = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const e12A4 = 0x812f00;
  const e12A5 = 0x813300;
  const e12A6 = 0x815000;
  const bulletPos = 0x60002000;
  bulletRam.setU8(e12A4 + 0x02, 0);
  bulletRam.setU8(e12A4 + 0x03, 4);
  bulletRam.setU16(e12A4 + 0x04, 1);
  bulletRam.setU32(e12A5 + 0x16, 0x00010000);
  bulletRam.setU32(e12A6 + 0x02, bulletPos);
  bulletRam.setU16(BUL.rank, 0);
  e12Step2966B8(bulletRam, rom, { bossResources: WHITE_TYPE0E_RESOURCES },
    e12A4, e12A5, e12A6, WHITE_TYPE0E_RESOURCES);
  const bullets = liveBullets(bulletRam);
  assert.equal(bullets.length, 10,
    'White E12 fires above the Black HP gate and emits five shots per muzzle');
  const angles = [0x80, 0x8c, 0x98, 0x74, 0x68];
  const muzzlePositions = [0, 4].map((offset) =>
    addPosition(bulletPos, rom.u32(WHITE_TYPE0E_RESOURCES.e.e12.muzzle + offset)));
  assert.deepEqual(bullets.map((address) => [
    bulletRam.u32(address + BULLET_REC.posA),
    bulletRam.u8(address + BULLET_REC.dir),
  ]), muzzlePositions.flatMap((position) =>
    angles.map((angle) => [position, angle])));

  assertWholeWhiteReads(fixture);
});
