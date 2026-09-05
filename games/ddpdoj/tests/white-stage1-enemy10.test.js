import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC } from '../src/bullets.js';
import { B as POOL_B_REC, C as POOL_C_REC } from '../src/effects.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';
import { runEnemyFrame } from '../src/enemyframe.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const QUEUE_0 = 0x80397c;
const QUEUE_0_BYTES = 0x80afc0;

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

function assertBuildAOnly(reads) {
  assert.deepEqual(reads.filter((read) => read.address >= 0x200000), [],
    'the private Type $10 path never reads a Build B cartridge root');
}

function seedHandler(ram, rom, descriptor, { rank = 0, fire = false } = {}) {
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x10);
  ram.setU8(REC + 0x0d, 1);
  ram.setU32(REC + 0x12, 0);
  ram.setU8(REC + 0x16, 1);
  ram.setU8(REC + 0x18, 2);
  ram.setU8(REC + 0x1c, 0);
  ram.setU8(REC + 0x1d, fire ? 1 : 0);
  ram.setU8(REC + 0x20, 0);
  ram.setU16(REC + 0x26, 6);
  ram.setU8(REC + 0x28, 1);
  ram.setU32(REC + 0x2a, rom.u32(descriptor.bucketTable));
  ram.setU32(REC + 0x2e, rom.u32(descriptor.bucketTable + 4));
  ram.setU8(REC + 0x33, 0);
  ram.setU8(REC + 0x34, 0x12);
  ram.setU32(REC + 0x4c, descriptor.handler);

  ram.setU8(SUB, fire ? 0x20 : 0);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU32(SUB + 0x0a, rom.u32(descriptor.mainSprite));
  ram.setU16(SUB + 0x18, 5);
  ram.setU8(SUB + 0x1d, 0x34);

  ram.setU16(0x80390c, 0);
  ram.setU16(0x811f72, 0);
  ram.setU16(0x812950, 0);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813096, 0);
  ram.setU16(0x813098, rank);
  ram.setU16(0x8130aa, 0);
  ram.setU16(0x8130b8, 0);
  ram.setU16(0x8130ba, 0);
  ram.setU16(0x8130bc, 0);
  ram.setU16(0x8130d2, 0);
  ram.setU16(0x8130d4, 0);
  ram.setU16(0x8130d8, 0);
  ram.setU16(0x813160, 0);
  ram.setU16(0x813172, 0);

  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x8000);
  ram.setU16(0x810448, 0);
}

function privateHandlerFixture(options) {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x10];
  seedHandler(ram, rom, descriptor, options);
  return { ram, rom, reads, descriptor };
}

test('Type $10 descriptors keep every edition identity isolated and frozen', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x10];
  const black11 = BLACK_WORLD_RESOURCES.enemyTypes[0x11];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x10];
  const white11 = WHITE_WORLD_RESOURCES.enemyTypes[0x11];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.subPrototype, black.recordPrototype, black.bucketTable, black.palette,
    black.muzzle, black.mainSprite, black.fireSprite,
    black.turret.block, black.turret.aimSite,
    black.bullet.entry, black.bullet.site,
    black.effectSites.firstZero, black.effectSites.death, black.sound.death,
  ], [
    0x2680b0, 0x2680b8, 0x268232,
    0x2681b2, 0x268192, 0x267f70, 0x268188,
    0x268494, 0x268594, 0x268694,
    0x268376, 0x268398,
    0x281402, 0x26848a,
    0x2682c0, 0x2681dc, 0x28c25a,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.subPrototype, white.recordPrototype, white.bucketTable, white.palette,
    white.muzzle, white.mainSprite, white.fireSprite,
    white.turret.block, white.turret.aimSite,
    white.bullet.entry, white.bullet.coreA, white.bullet.templatePtrs,
    white.bullet.site, white.effectSites.firstZero, white.effectSites.death,
    white.sound.death,
  ], [
    0x167128, 0x167130, 0x1672aa,
    0x16722a, 0x16720a, 0x166fe8, 0x167200,
    0x16750c, 0x16760c, 0x16770c,
    0x1673ee, 0x167410,
    0x180486, 0x180502, 0x18093e,
    0x167502, 0x167338, 0x167254,
    0x18ad80,
  ]);
  assert.equal(black.fireGate, black11.fireGate);
  assert.equal(black.score, black11.score);
  assert.equal(black.effects, black11.effects);
  assert.equal(black.remaps, black11.remaps);
  assert.equal(white.aim64, white11.aim64);
  assert.equal(white.fireGate, white11.fireGate);
  assert.equal(white.score, white11.score);
  assert.equal(white.effects, white11.effects);
  assert.equal(white.remaps, white11.remaps);
  assert.deepEqual(white.bullet.supportedKinds, [12, 13]);
  for (const descriptor of [black, white]) {
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor.turret), true);
    assert.equal(Object.isFrozen(descriptor.bullet), true);
    assert.equal(Object.isFrozen(descriptor.effectSites), true);
  }

  const staticBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(staticBodies.has(black.initBody), true);
  assert.equal(staticBodies.has(white.initBody), false);
  assert.equal(whiteBodies.has(white.initBody), true);
  assert.equal(whiteBodies.has(black.initBody), false,
    'the private initializer registry rejects the foreign Black Type $10 body');
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(black.handler), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(white.handler), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(black.handler), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(white.handler), true);
});

test('White Type $10 spawns, initializes, moves, and renders on its native frame', () => {
  const source = 0x130d4c;
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const ctx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, ctx);
  const world = ctx.stage1WorldPrivate;
  const descriptor = world.resources.enemyTypes[0x10];

  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x1000);
  ram.setU16(0x810448, 0x8000);
  ram.setU16(0x81044c, 0x3000);
  world.resetSpawn(ram, rom, ctx);
  ram.setU32(world.resources.spawn.liveCursor, source);
  ram.setU16(world.resources.spawn.distanceClock, 0x0079);

  assert.deepEqual(runEnemyFrame(
    ram,
    rom,
    { ...ctx, tables: world.tables },
    world.enemyHandlers,
    world.resources,
  ), { script: 1, deferred: 0, driven: 1 });

  assert.deepEqual(Array.from(rom.bytes(source, 8)), [
    0x00, 0x79, 0x00, 0x00, 0x10, 0x01, 0x10, 0x1c,
  ]);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), 0x130d54);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u8(REC + 0x0c), 0x10);
  assert.equal(ram.u8(REC + 0x0d), 1);
  assert.equal(ram.u32(REC + 0x12), 0x1319b6);
  assert.equal(ram.u32(REC + 0x4c), descriptor.handler);
  assert.equal(ram.u16(SUB + 0x02), 0x78b7,
    'native speed $03 and heading $2D move initial Y $78C0 by -$0009');
  assert.equal(ram.u16(SUB + 0x04), 0x2eeb,
    'native speed $03 and heading $2D move initial X $2F00 by -$0015');
  assert.equal(ram.u8(SUB + 0x1a), 0x03);
  assert.equal(ram.u8(SUB + 0x1b), 0x2d);
  assert.equal(ram.u16(SUB), rom.u16(descriptor.subPrototype));
  assert.equal(ram.u8(REC + 0x18),
    (rom.u8(descriptor.recordPrototype + 2) - 1) & 0xff);
  assert.equal(ram.u32(REC + 0x2a), rom.u32(descriptor.bucketTable));
  assert.equal(ram.u32(REC + 0x2e), rom.u32(descriptor.bucketTable + 4));
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(descriptor.mainSprite + 0xb0));
  assert.equal(ram.u32(REC + 0x22), rom.u32(descriptor.fireSprite + 0x5c));

  assert.equal(ram.u16(QUEUE_0_BYTES), 24,
    'the native record and register emitters each append one sprite');
  assert.equal(ram.u32(QUEUE_0 + 4), ram.u32(SUB + 0x0a));
  assert.equal(ram.u32(QUEUE_0 + 12 + 4), ram.u32(REC + 0x22));
  assert.equal(ram.u16(QUEUE_0 + 8), 0x0830);
  assert.equal(ram.u16(QUEUE_0 + 12 + 8), 0x0830);
  assert.equal(reads.some((read) => read.address === 0x13dab0), true,
    'the first sprite resolves the native record-convention emitter');
  assert.equal(reads.some((read) => read.address === 0x13e21c), true,
    'the second sprite resolves the native register-convention emitter');
  assert.deepEqual(ctx.unportedLog.report(), []);
  assertBuildAOnly(reads);
});

test('White Type $10 fires its native kind-$0C bullet at both rank states', () => {
  for (const [rank, speed] of [[0, 0x14], [1, 0x18]]) {
    const { ram, rom, reads, descriptor } = privateHandlerFixture({ rank, fire: true });
    const callbacks = [];
    runHandler(descriptor.handler, ram, rom, REC, {
      tables: null,
      unported: new UnportedLog(),
      bulletSpawn: (site, result) => callbacks.push({ site, result }),
    }, WHITE_WORLD_RESOURCES);

    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].site, descriptor.bullet.site);
    assert.deepEqual(callbacks[0].result, [{
      carry: false, slot: 0, addr: BUL.pool, declined: false,
    }]);
    const bullet = BUL.pool;
    assert.equal(ram.u16(bullet + BULLET_REC.typeWord), 0x810c);
    assert.equal(ram.u32(bullet + BULLET_REC.posA), 0x48002000);
    assert.equal(ram.u32(bullet + BULLET_REC.renderOffs), 0xfc00fd00);
    assert.equal(ram.u32(bullet + BULLET_REC.descriptor), 0);
    assert.equal(ram.u16(bullet + BULLET_REC.graphic), 0x0418);
    assert.equal(ram.u16(bullet + BULLET_REC.attribute), 0x001a);
    assert.equal(ram.u8(bullet + BULLET_REC.speed), speed);
    assert.equal(ram.u8(bullet + BULLET_REC.origSpeed), speed);
    assert.equal(ram.u8(bullet + BULLET_REC.dir), 0);
    assert.equal(reads.some((read) =>
      read.address === descriptor.bullet.templatePtrs + 4 * 12), true);
    assert.equal(reads.some((read) => read.address === 0x180ac0), true,
      'kind $0C uses its native Build A template');
    assert.equal(reads.some((read) => read.address === 0x180ad0), true,
      'kind $0C keeps its adjacent run-init word as a separate cartridge read');
    assertBuildAOnly(reads);
  }
});

test('White Type $10 survives a nonlethal P1 receipt and credits hit score', () => {
  const { ram, rom, reads, descriptor } = privateHandlerFixture();
  ram.setU8(SUB, 0x10);
  ram.setU16(SUB + 0x18, 5);
  ram.setU16(0x8130d2, 1);
  const effects = [];
  const sounds = [];
  const kills = [];

  runHandler(descriptor.handler, ram, rom, REC, {
    tables: null,
    unported: new UnportedLog(),
    effectSpawn: (...args) => effects.push(args),
    soundPost: (address) => sounds.push(address),
    killEvent: (...args) => kills.push(args),
  }, WHITE_WORLD_RESOURCES);

  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u8(SUB), 0);
  assert.equal(ram.u16(SUB + 0x18), 5);
  assert.equal(ram.u32(0x81b4c0), 1, 'the native P1 damage mask credits P1');
  assert.deepEqual(effects, []);
  assert.deepEqual(sounds, []);
  assert.deepEqual(kills, []);
  assertBuildAOnly(reads);
});

test('White Type $10 keeps its first zero alive, then performs its final death', () => {
  const { ram, rom, reads, descriptor } = privateHandlerFixture();
  ram.setU16(0x8130d2, 1);
  const effects = [];
  const poolC = [];
  const sounds = [];
  const kills = [];
  const ctx = {
    tables: null,
    unported: new UnportedLog(),
    effectSpawn: (...args) => effects.push(args),
    poolCSpawn: (...args) => poolC.push(args),
    soundPost: (address) => sounds.push(address),
    killEvent: (...args) => kills.push(args),
  };

  ram.setU8(SUB, 0x10);
  ram.setU16(SUB + 0x18, 0x8001);
  runHandler(descriptor.handler, ram, rom, REC, ctx, WHITE_WORLD_RESOURCES);

  assert.equal(ram.u16(REC), 0x8000,
    'the first zero reloads HP and keeps the enemy record alive');
  assert.equal(ram.u8(SUB), 0);
  assert.equal(ram.u16(SUB + 0x18), 6);
  assert.equal(ram.u8(REC + 0x20) & 0x80, 0x80);
  assert.equal(ram.u32(0x81b4c0), 0x00000009,
    'the first P1 receipt credits one hit point and packed-BCD score $08');
  assert.deepEqual(kills, [[0x08, 0x10]]);
  assert.deepEqual(effects, [[
    0x03, descriptor.effectSites.firstZero, 0x81b732,
    descriptor.effects.poolBAllocator,
  ]]);
  assert.equal(ram.u16(0x81b732 + POOL_B_REC.status), 0x8003);
  assert.deepEqual(poolC, []);
  assert.deepEqual(sounds, []);

  ram.setU8(SUB, 0x10);
  ram.setU16(SUB + 0x18, 0x8001);
  runHandler(descriptor.handler, ram, rom, REC, ctx, WHITE_WORLD_RESOURCES);

  assert.equal(ram.u16(REC), 0, 'the second zero frees the enemy record');
  assert.equal(ram.u8(SUB), 1, 'the owned damage sub-record is retired');
  assert.equal(ram.u32(0x81b4c0), 0x00000028,
    'both P1 receipts and native kill awards stay on the P1 score');
  assert.deepEqual(kills, [[0x08, 0x10], [0x10, 0x10]]);
  assert.deepEqual(effects, [
    [0x03, descriptor.effectSites.firstZero, 0x81b732,
      descriptor.effects.poolBAllocator],
    [0x04, descriptor.effectSites.death, 0x81b76a,
      descriptor.effects.poolBAllocator],
  ]);
  assert.deepEqual(poolC, [[0x81cdee, 0x04, 0]]);
  assert.deepEqual(sounds, [descriptor.sound.death]);
  assert.equal(ram.u16(0x81b76a + POOL_B_REC.status), 0x8004);
  assert.equal(ram.u16(0x81cdee + POOL_C_REC.status) & 0x8000, 0x8000);
  assert.equal(reads.some((read) => read.address === descriptor.score.capTable), true);
  assert.equal(reads.some((read) => read.address === descriptor.score.refillTable), true);
  assertBuildAOnly(reads);
});

test('the static Black Type $10 handler keeps its native bullet route', () => {
  const rom = new RomWindows(tables.rom);
  const ram = new Ram(undefined, BLACK_LABEL_PROFILE.ramLayout);
  const descriptor = BLACK_WORLD_RESOURCES.enemyTypes[0x10];
  seedHandler(ram, rom, descriptor, { rank: 0, fire: true });
  const callbacks = [];

  runHandler(descriptor.handler, ram, rom, REC, {
    tables: null,
    unported: new UnportedLog(),
    bulletSpawn: (site, result) => callbacks.push({ site, result }),
  });

  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].site, 0x26848a);
  assert.deepEqual(callbacks[0].result, [{
    carry: false, slot: 0, addr: BUL.pool, declined: false,
  }]);
  assert.equal(ram.u16(BUL.pool + BULLET_REC.typeWord), 0x810c);
  assert.equal(ram.u8(BUL.pool + BULLET_REC.speed), 0x14);
  assert.equal(ram.u8(BUL.pool + BULLET_REC.origSpeed), 0x14);
});
