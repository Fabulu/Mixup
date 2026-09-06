import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC, TYPEBIT } from '../src/bullets.js';
import { B as EFFECT_REC } from '../src/effects.js';
import { LEDGER } from '../src/score.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { runSpawnWalker } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { runWhiteBulletDriver } from '../src/white-bullets.js';
import { UnportedLog } from '../src/unported.js';
import {
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType0BResources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x131474;
const MOVEMENT = 0x131a16;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const QUEUE_7_BYTES = 0x80afc8;
const QUEUE_3_BYTES = 0x80afc6;
const TYPE0B_WINDOWS = Object.freeze([
  Object.freeze({ base: '$1668F4', len: 0x0008 }),
  Object.freeze({ base: '$169C10', len: 0x0008 }),
  Object.freeze({ base: '$169D6E', len: 0x0016 }),
  Object.freeze({ base: '$169D84', len: 0x001c }),
]);

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
          reads.push({ address, end: address + length });
        }
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  return { rom, reads };
}

function assertWhiteOnly(reads) {
  assert.deepEqual(reads.filter(({ address, end }) =>
    address >= 0x200000 || end > 0x200000), [],
  'every White Type $0B cartridge read stays below $200000');
}

function assertRead(reads, address) {
  assert.equal(reads.some((read) => read.address === address), true,
    `missing White cartridge read at $${address.toString(16)}`);
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

function createWhiteFixture() {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  return { ram, rom, reads, machineCtx, world };
}

function spawnWhite0B() {
  const fixture = createWhiteFixture();
  const { ram, rom, machineCtx, world } = fixture;
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x1000);
  ram.setU16(0x810448, 0x8000);
  ram.setU16(0x81044a, 0x7000);
  ram.setU16(0x81044c, 0x3000);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x0179);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, null, null, null, null, world.resources,
  ), { script: 1, deferred: 0 });
  return fixture;
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

function isolateHandler(fixture, { mirror = 0, speed = 0 } = {}) {
  const { ram } = fixture;
  ram.setU32(REC + 0x12, 0);
  ram.setU8(REC + 0x16, 1);
  ram.setU8(REC + 0x18, 0x20);
  ram.setU8(REC + 0x22, 0);
  ram.setU8(REC + 0x23, 0x11);
  ram.setU16(REC + 0x24, 0x4001);
  ram.setU16(REC + 0x26, 0);
  ram.setU16(REC + 0x28, 0x0120);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU8(SUB, 1);
  ram.setU8(SUB + 0x01, ram.u8(SUB + 0x01) & 0xbf);
  ram.setU16(SUB + 0x18, 0x1000);
  ram.setU8(SUB + 0x1a, speed);
  ram.setU8(SUB + 0x1b, 0x10);
  ram.setU16(SUB + 0x38, 0x1000);
  ram.setU16(0x80390c, mirror);
  ram.setU16(0x803910, 1);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813096, 0);
  ram.setU16(0x813098, 0);
  ram.setU16(0x8130b4, 0);
  ram.setU16(0x8130d2, 0);
  ram.setU16(0x813172, 0);
}

function bulletAddress(result) {
  return BUL.pool + result.slot * BUL.stride;
}

function fireOnce(fixture, phase) {
  const descriptor = fixture.world.resources.enemyTypes[0x0b];
  isolateHandler(fixture);
  if (phase === 0) {
    fixture.ram.setU8(REC + 0x28, 1);
  } else {
    fixture.ram.setU8(REC + 0x26, 1);
    fixture.ram.setU8(REC + 0x27, 1);
    fixture.ram.setU8(REC + 0x18, 1);
  }
  fixture.reads.length = 0;
  fixture.ram.setU16(0x8103e8, 0x7000);
  fixture.ram.setU16(0x8103ea, 0x7000);
  const calls = [];
  const ctx = handlerContext(fixture, {
    bulletSpawn: (site, result) => calls.push({ site, result }),
  });
  runHandler(descriptor.handler, fixture.ram, fixture.rom, REC, ctx,
    fixture.world.resources);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].result.length, 1);
  return { descriptor, calls, ctx, bullet: bulletAddress(calls[0].result[0]) };
}

test('White Type $0B owns its exact resources, windows, and natural $131474 route', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x0b];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x0b];
  const white11 = WHITE_WORLD_RESOURCES.enemyTypes[0x11];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.recordPrototype, black.subPrototype,
    black.effectSite, black.bullet.entry,
    black.bullet.sites.aimed, black.bullet.sites.facing,
  ], [
    0x26ab98, 0x26aba0, 0x26ad28,
    0x26acf6, 0x26ad0c,
    0x26ad5c, 0x2814ac, 0x26ae0a, 0x26aecc,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.recordPrototype, white.subPrototype,
    white.animation, white.sprite, white.armBArt, white.muzzle,
    white.emitters.record, white.emitters.armA, white.emitters.armB,
    white.effectSite, white.initAim.typeBit5, white.initAim.target,
    white.bullet.entry, white.bullet.sites.aimed, white.bullet.sites.facing,
    white.sound.death, white.retirement.entry,
  ], [
    0x169c10, 0x169c18, 0x169da0,
    0x169d6e, 0x169d84,
    0x168c2e, 0x168ec0, 0x168f40, 0x168fc0,
    0x13dba0, 0x13e2d4, 0x13e2a6,
    0x169dd4, 0x142dd0, 0x142366,
    0x1804f8, 0x169e82, 0x169f44,
    0x18adce, 0x1627dc,
  ]);
  assert.equal(black.initAim.translated, false);
  assert.equal(white.initAim.translated, true);
  assert.equal(white.aim64, white11.aim64);
  assert.equal(white.score, white11.score);
  assert.equal(white.effects, white11.effects);
  assert.equal(white.fireGate, white11.fireGate);
  assert.deepEqual(white.bullet.supportedKinds, [12, 13]);
  assertDeepFrozen(black);
  assertDeepFrozen(white);
  assert.throws(() => requireType0BResources({ ...white }, 'white'),
    /canonical frozen edition descriptor/);
  assert.throws(() => requireType0BResources(black, 'white'),
    /canonical frozen edition descriptor/);

  const blackBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes, 'white');
  assert.deepEqual([
    blackBodies.has(black.initBody), blackBodies.has(white.initBody),
    whiteBodies.has(black.initBody), whiteBodies.has(white.initBody),
    handlerMap(BLACK_WORLD_RESOURCES).has(black.handler),
    handlerMap(BLACK_WORLD_RESOURCES).has(white.handler),
    handlerMap(WHITE_WORLD_RESOURCES).has(black.handler),
    handlerMap(WHITE_WORLD_RESOURCES).has(white.handler),
  ], [true, false, false, true, true, false, false, true]);

  assert.deepEqual(tables.editions.whiteLabel.stage1Type0B, {
    init: {
      start: '$169C10', end: '$169DA0',
      sha256: '09a0806425dbfadaa971aa1fd4cbb7041e1845fd9b85e44081c2da008a5af0df',
    },
    handler: {
      start: '$169DA0', end: '$169F9E',
      sha256: '469b8995d477c8dda9c1078290c761781a7daa0474ed46e045b290c9c847e4b4',
    },
  });
  assert.equal(TYPE0B_WINDOWS.reduce((sum, window) => sum + window.len, 0), 0x42);
  const manifest = tables.editions.whiteLabel.worldRuntimeWindows;
  for (const expected of TYPE0B_WINDOWS) {
    assert.equal(manifest.filter((window) =>
      window.base === expected.base && window.len === expected.len).length, 1);
    const global = tables.rom.windows.filter((window) =>
      window.base === expected.base && window.len === expected.len);
    assert.equal(global.length, 1);
    assert.equal(global[0].hex.length, expected.len * 2);
    assert.match(global[0].why, /^White A /);
    assert.ok(Number.parseInt(expected.base.slice(1), 16) + expected.len <= 0x200000);
  }

  const { ram, rom, reads, machineCtx, world } = spawnWhite0B();
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x01, 0x79, 0x00, 0x0c, 0x0b, 0x00, 0x00, 0x23,
  ]);
  assert.deepEqual([rom.u32(0x1668f4), rom.u32(0x1668f8)],
    [white.initStub, white.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u8(REC + 0x0c), ram.u32(REC + 0x06),
    ram.u32(REC + 0x12), ram.u32(REC + 0x4c),
    ram.u8(REC + 0x18), ram.u8(REC + 0x22), ram.u8(REC + 0x23),
    ram.u8(REC + 0x28), ram.u8(REC + 0x29),
    ram.u32(SUB + 0x02), ram.u16(SUB + 0x18),
    ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b), ram.u8(SUB + 0x1d),
  ], [
    0x8000, 0x0b, SUB,
    MOVEMENT + 6, white.handler,
    0x28, 0x00, 0x21, 0x20, 0x50,
    0x77801400, 0x0020,
    0x24, 0x20, 0x0b,
  ]);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
  assert.deepEqual(machineCtx.unportedLog.report(), []);
  const index = ((ram.u8(SUB + 0x1b) + 1) & 0x3e) * 2;
  for (const address of [
    SOURCE, MOVEMENT, 0x1668f4,
    white.initStub + 2, white.recordPrototype, white.subPrototype,
    white.sprite + index, white.armBArt + index,
    white.aim64.ops, white.aim64.base, white.aim64.lut,
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});

test('White Type $0B draws and preserves its two distinct kind $0D firing phases', () => {
  const aimed = spawnWhite0B();
  const phase0 = fireOnce(aimed, 0);
  assert.deepEqual(phase0.calls.map(({ site }) => site),
    [phase0.descriptor.bullet.sites.aimed]);
  assert.equal(aimed.ram.u16(QUEUE_7_BYTES), 12);
  assert.equal(aimed.ram.u16(QUEUE_3_BYTES), 12);
  const muzzleIndex = u16((u16(0x11 + 1) & 0x3e) * 2);
  assert.equal(aimed.ram.u32(phase0.bullet + BULLET_REC.posA),
    (aimed.rom.u32(phase0.descriptor.muzzle + muzzleIndex) + 0x40002000) >>> 0);
  assert.notEqual(aimed.ram.u8(phase0.bullet + BULLET_REC.origDir) >> 2, 0x11,
    'phase zero aims D1 but keeps record facing $11 as muzzle index D2');
  for (const address of [
    phase0.descriptor.emitters.record, phase0.descriptor.emitters.armB,
    phase0.descriptor.aim64.ops, phase0.descriptor.aim64.base,
    phase0.descriptor.aim64.lut, phase0.descriptor.fireGate.boxD3,
    phase0.descriptor.fireGate.boxD2, phase0.descriptor.muzzle + muzzleIndex,
    phase0.descriptor.bullet.templatePtrs + 4 * 13,
  ]) assertRead(aimed.reads, address);
  assertWhiteOnly(aimed.reads);

  const facing = spawnWhite0B();
  const phase1 = fireOnce(facing, 1);
  assert.deepEqual(phase1.calls.map(({ site }) => site),
    [phase1.descriptor.bullet.sites.facing]);
  assert.equal(facing.ram.u8(phase1.bullet + BULLET_REC.origDir) >> 2, 0x11,
    'phase one takes both D1 and D2 from record facing $11');
  assert.equal(facing.ram.u16(phase1.bullet + BULLET_REC.typeWord), 0x810d);
  assert.equal(facing.ram.u16(phase1.bullet + BULLET_REC.graphic), 0x0418);
  assert.equal(facing.ram.u16(phase1.bullet + BULLET_REC.attribute), 0x001a);
  assert.equal(facing.ram.u8(phase1.bullet + BULLET_REC.speed), 0x14);
  runWhiteBulletDriver({ ram: facing.ram, rom: facing.rom });
  assert.equal(facing.ram.u32(phase1.bullet + BULLET_REC.continuation), 0x181932);
  assert.equal(facing.ram.u16(phase1.bullet + BULLET_REC.typeWord), 0x800d);
  const before = facing.ram.u32(phase1.bullet + BULLET_REC.posA);
  runWhiteBulletDriver({ ram: facing.ram, rom: facing.rom });
  assert.notEqual(facing.ram.u16(phase1.bullet + BULLET_REC.typeWord) & TYPEBIT.alive, 0);
  assert.notEqual(facing.ram.u32(phase1.bullet + BULLET_REC.posA), before);
  assert.equal(facing.ram.u32(phase1.bullet + BULLET_REC.continuation), 0x181932);
  assert.deepEqual(phase0.ctx.unported.report(), []);
  assert.deepEqual(phase1.ctx.unported.report(), []);
  for (const address of [
    phase1.descriptor.emitters.record, phase1.descriptor.emitters.armB,
    phase1.descriptor.fireGate.boxD3, phase1.descriptor.fireGate.boxD2,
    phase1.descriptor.muzzle + muzzleIndex,
    phase1.descriptor.bullet.templatePtrs + 4 * 13,
  ]) assertRead(facing.reads, address);
  assertWhiteOnly(facing.reads);
});

test('White Type $0B lethal P2 damage credits only P2 and uses native cleanup', () => {
  const fixture = spawnWhite0B();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x0b];
  isolateHandler(fixture);
  reads.length = 0;
  ram.setU8(SUB, 0x09);
  ram.setU32(SUB + 0x02, 0x12345678);
  ram.setU16(SUB + 0x18, 0xffff);
  ram.setU8(SUB + 0x1a, 0x03);
  ram.setU8(SUB + 0x1b, 0x11);
  const kills = [];
  const sounds = [];
  const effects = [];
  const ctx = handlerContext(fixture, {
    killEvent: (...args) => kills.push(args),
    soundPost: (address) => sounds.push(address),
    effectSpawn: (...args) => effects.push(args),
  });

  runHandler(descriptor.handler, ram, rom, REC, ctx, world.resources);

  const effect = 0x81b732;
  assert.deepEqual(kills, [[0x08, 0x08]]);
  assert.deepEqual([
    ram.u32(LEDGER.p1.pendingEnd - 4), ram.u32(LEDGER.p2.pendingEnd - 4),
  ], [0, 0x09]);
  assert.deepEqual(effects, [[
    0x02, descriptor.effectSite, effect, descriptor.effects.poolBAllocator,
  ]]);
  assert.deepEqual(sounds, [descriptor.sound.death]);
  assert.equal(ram.u16(effect + EFFECT_REC.status), 0x8002);
  assert.equal(ram.u32(effect + EFFECT_REC.pos), 0x12345678);
  assert.equal(ram.u8(effect + EFFECT_REC.speed), 0x0b);
  assert.equal(ram.u8(effect + EFFECT_REC.angle), 0x44);
  assert.equal(ram.u16(effect + EFFECT_REC.bucket), 0x0010);
  assert.equal(ram.u16(effect + EFFECT_REC.sub12), 0xffff);
  assert.deepEqual([ram.u16(REC), ram.u8(SUB)], [0, 1]);
  for (const address of [descriptor.score.capTable, descriptor.score.refillTable]) {
    assertRead(reads, address);
  }
  assertWhiteOnly(reads);
});
