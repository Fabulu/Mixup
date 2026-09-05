import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC } from '../src/bullets.js';
import { B as EFFECT_REC } from '../src/effects.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';
import { runEnemyFrame } from '../src/enemyframe.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x130dd4;
const MOVEMENT_SOURCE = 0x1324aa;
const MOVEMENT_CURSOR = 0x1324b2;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const QUEUE_7_BYTES = 0x80afc8;
const QUEUE_7 = 0x807450;
const QUEUE_3_BYTES = 0x80afc6;
const QUEUE_3 = 0x80688c;

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

function seedHandler(ram, rom, { rank = 0, flags = 0, subFlags = 0,
  mirror = 1 } = {}) {
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x05];
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x05);
  ram.setU8(REC + 0x0d, flags);
  ram.setU32(REC + 0x12, 0);
  ram.setU8(REC + 0x18, 0);
  ram.setU8(REC + 0x1a, 0);
  ram.setU8(REC + 0x1b, 0);
  ram.setU16(REC + 0x28, 0);
  ram.setU32(REC + 0x2c, rom.u32(descriptor.armBArt));
  ram.setU32(REC + 0x4c, descriptor.handler);

  ram.setU8(SUB, subFlags);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU32(SUB + 0x0a, rom.u32(descriptor.sprite));
  ram.setU16(SUB + 0x0e, 0x0410);
  ram.setU16(SUB + 0x18, 0x0100);
  ram.setU8(SUB + 0x1a, 0);
  ram.setU8(SUB + 0x1b, 0);
  ram.setU16(SUB + 0x1c, 0x2900);

  ram.setU16(0x80390c, mirror);
  ram.setU16(0x803910, 1);
  ram.setU16(0x811f72, 0);
  ram.setU16(0x812950, 0);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813096, 0);
  ram.setU16(0x813098, rank);
  ram.setU16(0x8130b4, 0);
  ram.setU16(0x8130d2, 0);
  ram.setU16(0x8130d4, 0);
  ram.setU16(0x8130d8, 0);
  ram.setU16(0x813160, 0);
  ram.setU16(0x813172, 0);

  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x5000);
  ram.setU16(0x8103ea, 0x2000);
  ram.setU16(0x810448, 0);
}

function privateHandlerFixture(options) {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  seedHandler(ram, rom, options);
  return { ram, rom, reads, moveTables: machineCtx.stage1WorldPrivate.tables };
}

function assertBuildAOnly(reads) {
  assert.deepEqual(reads.filter((read) => read.address >= 0x200000), [],
    'the private Type $05 path never reads a Build B cartridge root');
}

function applyDamage(ram, mask, hp) {
  ram.setU8(SUB, mask);
  ram.setU16(SUB + 0x18, hp);
}

test('Type $05 descriptors and the Type $07 alias are isolated and frozen', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x05];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x05];
  const white11 = WHITE_WORLD_RESOURCES.enemyTypes[0x11];
  const rom = new RomWindows(tables.rom);

  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.recordPrototype, black.subPrototype,
    black.sprite, black.armBArt, black.muzzle,
    black.bullet.entry, black.bullet.site, black.effectSite,
    black.sound.death, black.retirement.entry,
  ], [
    0x269bc6, 0x269bce, 0x269cea,
    0x269cb4, 0x269cce,
    0x269e48, 0x269ec8, 0x269f48,
    0x2814ac, 0x269e10, 0x269d1e,
    0x28c2a8, 0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.recordPrototype, white.subPrototype,
    white.sprite, white.armBArt, white.muzzle,
    white.bullet.entry, white.bullet.site, white.effectSite,
    white.sound.death, white.retirement.entry,
  ], [
    0x168c3e, 0x168c46, 0x168d62,
    0x168d2c, 0x168d46,
    0x168ec0, 0x168f40, 0x168fc0,
    0x1804f8, 0x168e88, 0x168d96,
    0x18adce, 0x1627dc,
  ]);
  assert.deepEqual(Array.from(rom.bytes(white.initStub, 8)), [
    0x3b, 0x7c, 0x00, 0x00, 0x00, 0x04, 0x4e, 0x75,
  ]);
  assert.equal(BLACK_WORLD_RESOURCES.enemyTypes[0x07],
    BLACK_WORLD_RESOURCES.enemyTypes[0x27]);
  assert.equal(WHITE_WORLD_RESOURCES.enemyTypes[0x07],
    WHITE_WORLD_RESOURCES.enemyTypes[0x27]);
  assert.deepEqual([
    rom.u32(0x1668c4), rom.u32(0x1668c8),
    rom.u32(0x1668d4), rom.u32(0x1668d8),
  ], [
    white.initStub, white.handler,
    WHITE_WORLD_RESOURCES.enemyTypes[0x27].initStub,
    WHITE_WORLD_RESOURCES.enemyTypes[0x27].handler,
  ]);
  assert.equal(white.score, white11.score);
  assert.equal(white.effects, white11.effects);
  assert.equal(white.aim64, white11.aim64);
  assert.equal(white.fireGate, white11.fireGate);
  assert.deepEqual(white.bullet.supportedKinds, [12, 13]);
  for (const value of [black, white, white.bullet, white.aim64,
    white.fireGate, white.retirement]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const staticBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(staticBodies.has(0x269bce), true);
  assert.equal(staticBodies.has(0x168c46), false);
  assert.equal(whiteBodies.has(0x168c46), true);
  assert.equal(whiteBodies.has(0x269bce), false);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(0x269cea), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(0x168d62), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(0x269cea), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(0x168d62), true);
});

test('White Type $05 initializes from its exact native source and movement record', () => {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const resources = WHITE_WORLD_RESOURCES;
  const descriptor = resources.enemyTypes[0x05];
  const unported = new UnportedLog();

  resetAndInstallStage26331E(ram, rom, unported, null, null, resources);
  ram.setU32(resources.spawn.liveCursor, SOURCE);
  ram.setU16(resources.spawn.distanceClock, 0x009d);
  assert.deepEqual(runSpawnWalker(
    ram, rom, unported, null, null, null, null, resources,
  ), { script: 1, deferred: 0 });

  const heading = ram.u8(SUB + 0x1b);
  const index = (heading & 0x3e) << 1;
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x00, 0x9d, 0x00, 0x19, 0x05, 0x00, 0x00, 0x97,
  ]);
  assert.equal(ram.u32(resources.spawn.liveCursor), SOURCE + 8);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u16(REC + 0x0a), 0x0019);
  assert.equal(ram.u8(REC + 0x0c), 0x05);
  assert.equal(ram.u32(REC + 0x12), MOVEMENT_CURSOR);
  assert.equal(ram.u8(REC + 0x18), 0x28);
  assert.equal(ram.u32(REC + 0x4c), descriptor.handler);
  assert.equal(ram.u16(SUB), 0xa201);
  assert.equal(ram.u32(SUB + 0x02), 0x77802e00);
  assert.equal(ram.u8(SUB + 0x1a), 0x16);
  assert.equal(heading, 0x20);
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(descriptor.sprite + index));
  assert.equal(ram.u32(REC + 0x2c), rom.u32(descriptor.armBArt + index));
  assert.equal(unported.report().length, 0);

  for (const address of [
    0x1668c4, descriptor.subPrototype, descriptor.recordPrototype, descriptor.sprite + index,
    descriptor.armBArt + index, MOVEMENT_SOURCE,
  ]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing Build A initialization read at $${address.toString(16)}`);
  }
  assertBuildAOnly(reads);
});

test('White Type $05 renders through both native emitter arms', () => {
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x05];

  for (const arm of ['A', 'B']) {
    const { ram, rom, reads, moveTables } = privateHandlerFixture({
      rank: arm === 'A' ? 1 : 0,
      mirror: arm === 'A' ? 1 : 0,
    });
    ram.setU16(0x8130d2, 1);
    runHandler(descriptor.handler, ram, rom, REC, {
      tables: moveTables,
      unported: new UnportedLog(),
    }, WHITE_WORLD_RESOURCES);

    assert.equal(ram.u32(SUB + 0x0a), rom.u32(descriptor.sprite));
    assert.equal(ram.u32(REC + 0x2c), rom.u32(descriptor.armBArt));
    assert.equal(ram.u16(QUEUE_7_BYTES), arm === 'A' ? 24 : 12);
    assert.equal(ram.u16(QUEUE_3_BYTES), arm === 'A' ? 0 : 12);
    assert.equal(ram.u32(QUEUE_7 + 4), ram.u32(SUB + 0x0a));
    if (arm === 'A') {
      assert.equal(ram.u32(QUEUE_7 + 12 + 4), rom.u32(descriptor.animation));
      assert.equal(reads.some((read) => read.address === descriptor.emitters.armA), true);
    } else {
      assert.equal(ram.u32(QUEUE_3 + 4), ram.u32(REC + 0x2c));
      assert.equal(reads.some((read) => read.address === descriptor.emitters.armB), true);
    }
    assert.equal(reads.some((read) => read.address === descriptor.emitters.record), true);
    assertBuildAOnly(reads);
  }
});

test('White Type $05 slews one step through its native aim tables', () => {
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x05];
  const { ram, rom, reads, moveTables } = privateHandlerFixture();
  ram.setU8(SUB + 0x1b, 0x20);
  ram.setU16(REC + 0x28, 1);
  ram.setU8(REC + 0x1a, 0);
  ram.setU8(REC + 0x1b, 4);
  ram.setU8(REC + 0x18, 1);

  runHandler(descriptor.handler, ram, rom, REC, {
    tables: moveTables,
    unported: new UnportedLog(),
  }, WHITE_WORLD_RESOURCES);

  assert.equal(ram.u16(REC + 0x28), 0);
  assert.equal(ram.u8(REC + 0x1a), 4);
  assert.equal(ram.u8(SUB + 0x1b), 0x1f);
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(descriptor.sprite + 0x3c));
  assert.equal(ram.u32(REC + 0x2c), rom.u32(descriptor.armBArt + 0x3c));
  for (const address of [descriptor.aim64.ops, descriptor.aim64.base,
    descriptor.aim64.lut]) {
    assert.equal(reads.some((read) => read.address === address), true);
  }
  assertBuildAOnly(reads);
});

test('White Type $05 adaptive fire uses its rank-zero, two-shot, and three-shot arms', () => {
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x05];
  const cases = [
    { rank: 0, flags: 0x7e, subFlags: 0x02, shots: [[0x00, 23]] },
    { rank: 1, flags: 0x81, subFlags: 0x00, shots: [[0x00, 23], [0x00, 29]] },
    { rank: 1, flags: 0x7e, subFlags: 0x00, shots: [[0x00, 23], [0x00, 29]] },
    { rank: 1, flags: 0x7e, subFlags: 0x02,
      shots: [[0x00, 25], [0xf8, 23], [0x08, 23]] },
  ];

  for (const expected of cases) {
    const { ram, rom, reads, moveTables } = privateHandlerFixture(expected);
    const callbacks = [];
    runHandler(descriptor.handler, ram, rom, REC, {
      tables: moveTables,
      unported: new UnportedLog(),
      bulletSpawn: (site, result) => callbacks.push({ site, result }),
    }, WHITE_WORLD_RESOURCES);

    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].site, descriptor.bullet.site);
    assert.equal(callbacks[0].result.length, expected.shots.length);
    for (let i = 0; i < expected.shots.length; i++) {
      const bullet = BUL.pool + i * BUL.stride;
      assert.deepEqual(callbacks[0].result[i], {
        carry: false, slot: i, addr: bullet, declined: false,
      });
      assert.equal(ram.u16(bullet + BULLET_REC.typeWord) & 0xff, 0x0d);
      assert.equal(ram.u32(bullet + BULLET_REC.posA), 0x43802000);
      assert.equal(ram.u32(bullet + BULLET_REC.renderOffs), 0xfc00fd00);
      assert.equal(ram.u32(bullet + BULLET_REC.descriptor), 0);
      assert.equal(ram.u16(bullet + BULLET_REC.graphic), 0x0418);
      assert.equal(ram.u16(bullet + BULLET_REC.attribute), 0x001a);
      assert.equal(ram.u8(bullet + BULLET_REC.dir), expected.shots[i][0]);
      assert.equal(ram.u8(bullet + BULLET_REC.speed), expected.shots[i][1]);
      assert.equal(ram.u8(bullet + BULLET_REC.origSpeed), expected.shots[i][1]);
    }
    assert.equal(reads.some((read) => read.address === descriptor.muzzle), true);
    assert.equal(reads.some((read) =>
      read.address === descriptor.bullet.templatePtrs + 4 * 13), true);
    assertBuildAOnly(reads);
  }
});

test('White Type $05 spawns and moves on its first integrated enemy frame', () => {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const ctx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, ctx);
  const world = ctx.stage1WorldPrivate;

  world.resetSpawn(ram, rom, ctx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x009d);

  assert.deepEqual(runEnemyFrame(
    ram,
    rom,
    { ...ctx, tables: world.tables },
    world.enemyHandlers,
    world.resources,
  ), { script: 1, deferred: 0, driven: 1 });

  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u8(REC + 0x0c), 0x05);
  assert.equal(ram.u16(REC + 0x0a), 0x0019);
  assert.equal(ram.u32(REC + 0x12), MOVEMENT_CURSOR);
  assert.equal(ram.u16(SUB + 0x02), 0x768a,
    'native speed $16 and heading $20 move Y by -$00F6 on the spawn frame');
  assert.equal(ram.u16(SUB + 0x04), 0x2e00);
  assert.equal(ram.u8(SUB + 0x1a), 0x16);
  assert.equal(ram.u8(SUB + 0x1b), 0x20);
  assert.equal(ram.u8(REC + 0x16), 1);
  assert.equal(ram.u8(REC + 0x18), 0x27);
  assert.deepEqual(ctx.unportedLog.report(), []);
  assertBuildAOnly(reads);
});

test('White Type $05 preserves P1, P2, and combined hit ownership', () => {
  const cases = [
    { mask: 0x10, p1: 1, p2: 0 },
    { mask: 0x08, p1: 0, p2: 1 },
    { mask: 0x18, p1: 1, p2: 1 },
  ];
  for (const expected of cases) {
    const { ram, rom, reads, moveTables } = privateHandlerFixture();
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x05];
    applyDamage(ram, expected.mask, 0x0005);
    ram.setU8(REC + 0x2a, 0x12);
    ram.setU8(REC + 0x2b, 0x34);
    ram.setU16(0x8130d2, 1);

    const effects = [];
    const sounds = [];
    const kills = [];
    runHandler(descriptor.handler, ram, rom, REC, {
      tables: moveTables,
      unported: new UnportedLog(),
      effectSpawn: (...args) => effects.push(args),
      soundPost: (address) => sounds.push(address),
      killEvent: (...args) => kills.push(args),
    }, WHITE_WORLD_RESOURCES);

    assert.equal(ram.u16(REC), 0x8000);
    assert.equal(ram.u8(SUB) & 0x5c, 0);
    assert.equal(ram.u16(SUB + 0x18), 0x0005);
    assert.equal(ram.u32(0x81b4c0), expected.p1);
    assert.equal(ram.u32(0x81b4c4), expected.p2);
    assert.equal(ram.u8(SUB + 0x1d), 0x26);
    assert.deepEqual(effects, []);
    assert.deepEqual(sounds, []);
    assert.deepEqual(kills, []);
    assertBuildAOnly(reads);
  }
});

test('White Type $05 preserves P1, P2, and combined lethal ownership', () => {
  const cases = [
    { mask: 0x10, p1: 0x09, p2: 0 },
    { mask: 0x08, p1: 0, p2: 0x09 },
    { mask: 0x18, p1: 0x09, p2: 0x09 },
  ];
  for (const expected of cases) {
    const { rom, reads } = trackedCartridge();
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x05];
    seedHandler(ram, rom);
    applyDamage(ram, expected.mask, 0x8001);
    ram.setU32(SUB + 0x02, 0x12345678);
    ram.setU8(SUB + 0x1a, 0x03);
    ram.setU8(SUB + 0x1b, 0x11);

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

    const effect = 0x81b732;
    assert.equal(ram.u16(REC), 0);
    assert.equal(ram.u8(SUB), 1);
    assert.equal(ram.u32(0x81b4c0), expected.p1);
    assert.equal(ram.u32(0x81b4c4), expected.p2);
    assert.deepEqual(kills, [[0x08, expected.mask]]);
    assert.deepEqual(effects, [[0x02, descriptor.effectSite, effect,
      descriptor.effects.poolBAllocator]]);
    assert.deepEqual(sounds, [descriptor.sound.death]);
    assert.equal(ram.u16(effect + EFFECT_REC.status), 0x8002);
    assert.equal(ram.u32(effect + EFFECT_REC.pos), 0x12345678);
    assert.equal(ram.u8(effect + EFFECT_REC.speed), 0x0b);
    assert.equal(ram.u8(effect + EFFECT_REC.angle), 0x44);
    assert.equal(ram.u16(effect + EFFECT_REC.bucket), 0x0010);
    assert.equal(ram.u16(effect + EFFECT_REC.sub12), 0xffff);
    assert.equal(reads.some((read) => read.address === descriptor.score.capTable), true);
    assert.equal(reads.some((read) => read.address === descriptor.score.refillTable), true);
    assertBuildAOnly(reads);
  }
});

test('the static Black Type $05 handler keeps its frozen draw behavior', () => {
  const rom = new RomWindows(tables.rom);
  const ram = new Ram(undefined, BLACK_LABEL_PROFILE.ramLayout);
  const descriptor = BLACK_WORLD_RESOURCES.enemyTypes[0x05];
  const originalSprite = rom.u32(descriptor.sprite + 0x40);
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x05);
  ram.setU32(REC + 0x2c, rom.u32(descriptor.armBArt + 0x40));
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU32(SUB + 0x0a, originalSprite);
  ram.setU16(SUB + 0x0e, 0x0410);
  ram.setU16(SUB + 0x18, 0x0100);
  ram.setU16(SUB + 0x1c, 0x2900);
  ram.setU16(0x80390c, 1);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813098, 1);
  ram.setU16(0x8130d2, 1);

  runHandler(descriptor.handler, ram, rom, REC, {
    tables: null,
    unported: new UnportedLog(),
  });

  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u32(SUB + 0x0a), originalSprite,
    'the Type $05 frozen exit does not rewrite its sprite pointer');
  assert.equal(ram.u16(QUEUE_7_BYTES), 24);
  assert.equal(ram.u16(QUEUE_3_BYTES), 0);
  assert.equal(ram.u32(QUEUE_7 + 4), originalSprite);
  assert.equal(ram.u32(QUEUE_7 + 12 + 4), rom.u32(descriptor.animation));
});
