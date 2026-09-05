import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { createWhiteShotTables } from '../src/white-shots.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC } from '../src/bullets.js';
import {
  B, D, POOL_B, POOL_D, runEffectDriver, runSubEffectDriver,
} from '../src/effects.js';
import {
  CUE, WHITE_CUE_RESOURCES, runCueDriver28AD70, selectEmitter28ACFE,
} from '../src/cues.js';
import {
  ITEM, I, POWER, WHITE_ITEM_RESOURCES, beamReset25270C, runItemDriver,
} from '../src/items.js';
import { WHITE_ITEM_BEAM_RESET } from '../src/white-options.js';
import { NATIVE_LASER_EDITION_RESOURCES } from '../src/laser.js';
import {
  DMG, runBuildAType5CollisionBeforeBombDamage18A1AC,
} from '../src/damage.js';
import { createInitBodyMap, runInitBodyAddr } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { runSpawnWalker } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';
import { runEnemyFrame } from '../src/enemyframe.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x130db4;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const QUEUE_7_BYTES = 0x80afc8;
const QUEUE_3_BYTES = 0x80afc6;

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
    'the private Type $85 path never reads a Build B cartridge root');
}

function createWhiteWorldFixture() {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  return { ram, rom, reads, machineCtx, world };
}

function seedPlayers(ram) {
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU16(DMG.p1rec + 0x02, 0x5000);
  ram.setU16(DMG.p1rec + 0x04, 0x3000);
  ram.setU16(DMG.p2rec, 0x8000);
  ram.setU16(DMG.p2rec + 0x02, 0x6000);
  ram.setU16(DMG.p2rec + 0x04, 0x1000);
}

function spawnWhite85() {
  const fixture = createWhiteWorldFixture();
  const { ram, rom, machineCtx, world } = fixture;
  seedPlayers(ram);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x0094);
  const spawned = runSpawnWalker(
    ram, rom, machineCtx.unportedLog, null, null, null, null, world.resources,
  );
  assert.deepEqual(spawned, { script: 1, deferred: 0 });
  return fixture;
}

function handlerContext(fixture, extra = {}) {
  const unported = new UnportedLog();
  const shotTables = createWhiteShotTables(fixture.rom);
  return {
    ...fixture.machineCtx,
    ram: fixture.ram,
    rom: fixture.rom,
    tables: { ...fixture.world.tables, ...shotTables },
    itemBeamReset: WHITE_ITEM_BEAM_RESET,
    unported,
    unportedLog: unported,
    ...extra,
  };
}

function isolateHandler(ram) {
  ram.setU32(REC + 0x12, 0);
  ram.setU32(REC + 0x44, 0x174966);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU32(SUB + 0x22, 0x40002000);
  ram.setU8(REC + 0x16, 1);
  ram.setU32(0x8130d2, 1);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813172, 0);
}

function applyDamage(ram, mask, hp) {
  ram.setU8(SUB, ram.u8(SUB) | (mask & 0x10));
  ram.setU8(SUB + 0x20, ram.u8(SUB + 0x20) | (mask & 0x08));
  ram.setU16(SUB + 0x18, hp);
  ram.setU16(SUB + 0x38, hp);
}

test('Type $85 descriptors keep Black and White identities isolated and frozen', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x85];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x85];
  const white11 = WHITE_WORLD_RESOURCES.enemyTypes[0x11];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.palette,
    black.bullet.entry, black.items.alloc, black.sound.death,
  ], [
    0x275812, 0x27581a, 0x275914, 0x275890,
    0x2813f0, 0x27e812, 0x28c274,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.palette, white.recordPrototype, white.subPrototype,
    white.secondSubPrototype, white.aimSprite, white.muzzle,
    white.bullet.entry, white.bullet.site,
    white.items.alloc, white.sound.death,
  ], [
    0x174866, 0x17486e, 0x174968,
    0x1748e4, 0x1748ee, 0x174904,
    0x174920, 0x171e4e, 0x1722ce,
    0x180474, 0x174b24,
    0x17d8c4, 0x18ad9a,
  ]);
  assert.deepEqual(white.foreignInitBodies, [0x27581a, 0x275bb6]);
  assert.equal(white.score, white11.score);
  assert.equal(white.effects, white11.effects);
  assert.equal(white.aim64, white11.aim64);
  assert.equal(WHITE_ITEM_BEAM_RESET.beams[0].scope, 'white');
  assert.equal(WHITE_ITEM_BEAM_RESET.beams[1].scope, 'white');
  assert.equal(Object.isFrozen(WHITE_ITEM_BEAM_RESET), true);
  assert.equal(Object.isFrozen(WHITE_ITEM_BEAM_RESET.beams), true);
  assert.equal(Object.isFrozen(WHITE_ITEM_BEAM_RESET.resources), true);
  for (const value of [white, white.foreignInitBodies, white.bullet,
    white.items, white.cues, white.effects]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const staticBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(staticBodies.has(0x27581a), true);
  assert.equal(staticBodies.has(0x275bb6), true);
  assert.equal(staticBodies.has(0x17486e), false);
  assert.equal(whiteBodies.has(0x17486e), true);
  assert.equal(whiteBodies.has(0x27581a), false);
  assert.equal(whiteBodies.has(0x275bb6), false);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(0x275914), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(0x174968), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(0x174968), true);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(0x275914), false);
});

test('White item beam reset rejects malformed and mixed edition bindings', () => {
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  assert.throws(
    () => beamReset25270C(ram, { itemBeamReset: null }, 0),
    /needs edition resources and beam owners/,
  );
  assert.throws(
    () => beamReset25270C(ram, { itemBeamReset: { beams: WHITE_ITEM_BEAM_RESET.beams } }, 0),
    /needs edition resources and beam owners/,
  );
  assert.throws(
    () => beamReset25270C(ram, {
      itemBeamReset: {
        beams: WHITE_ITEM_BEAM_RESET.beams,
        resources: NATIVE_LASER_EDITION_RESOURCES,
      },
    }, 0),
    /mixed or mutable geometry/,
  );
});

test('White Type $85 initializes from the native Stage 1 source', () => {
  const { ram, rom, reads } = spawnWhite85();
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x85];

  assert.equal(ram.u32(WHITE_WORLD_RESOURCES.spawn.liveCursor), SOURCE + 8);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u16(REC + 0x04), 1);
  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u16(REC + 0x0a), 0x0006);
  assert.equal(ram.u8(REC + 0x0c), 0x85);
  assert.equal(ram.u32(REC + 0x12), 0x131868);
  assert.equal(ram.u32(REC + 0x44), 0x17493c);
  assert.equal(ram.u32(REC + 0x4c), descriptor.handler);

  assert.equal(ram.u16(SUB), 0xa001);
  assert.equal(ram.u16(SUB + 0x20), 0xa001);
  assert.equal(ram.u32(SUB + 0x02), 0x80000a00);
  assert.equal(ram.u32(SUB + 0x06), 0xf200f900);
  assert.equal(ram.u32(SUB + 0x0a), 0x1928bc);
  assert.equal(ram.u16(SUB + 0x0e), 0x0e38);
  assert.equal(ram.u16(SUB + 0x18), 0x0700);
  assert.equal(ram.u8(SUB + 0x1a), 0x0c);
  assert.equal(ram.u8(SUB + 0x1b), 0x20);
  assert.equal(ram.u8(SUB + 0x1d), 0x0f);
  assert.equal(ram.u16(SUB + 0x38), 0x0700);
  assert.equal(ram.u8(REC + 0x1c), 0x0f);
  assert.equal(ram.u8(REC + 0x1d), 0x10);
  assert.equal(ram.u8(REC + 0x1e), 0x40);
  assert.equal(ram.u8(REC + 0x20), 0x02);
  assert.equal(ram.u8(REC + 0x21), 0x02);
  assert.equal(ram.u8(REC + 0x22), 0x01);
  assert.equal(ram.u8(REC + 0x23), 0x01);
  const heading = ram.u8(REC + 0x29);
  assert.equal(ram.u32(REC + 0x24),
    rom.u32(descriptor.aimSprite + ((heading & 0x3e) << 1)));

  for (const address of [
    SOURCE, descriptor.subPrototype, descriptor.secondSubPrototype,
    descriptor.recordPrototype, descriptor.palette,
    descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
  ]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing Build A initialization read at $${address.toString(16)}`);
  }
  assertBuildAOnly(reads);
});

test('White Type $85 moves and renders on its integrated spawn frame', () => {
  const { ram, rom, reads, machineCtx, world } = createWhiteWorldFixture();
  seedPlayers(ram);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x0094);

  assert.deepEqual(runEnemyFrame(
    ram, rom, { ...machineCtx, tables: world.tables },
    world.enemyHandlers, world.resources,
  ), { script: 1, deferred: 0, driven: 1 });

  assert.equal(ram.u8(REC + 0x0c), 0x85);
  assert.equal(ram.u32(SUB + 0x02), 0x7f7a0a00,
    'native speed $0C and heading $20 move Y by -$0086 on the spawn frame');
  assert.equal(ram.u32(SUB + 0x22), 0x7f7a0a00);
  assert.equal(ram.u8(REC + 0x16), 1);
  assert.equal(ram.u16(QUEUE_7_BYTES), 24);
  assert.equal(ram.u16(QUEUE_3_BYTES), 0);
  assert.deepEqual(machineCtx.unportedLog.report(), []);
  assertBuildAOnly(reads);
});

test('White Type $85 aims and fires its native kind-$0D bullet', () => {
  const fixture = spawnWhite85();
  const { ram, rom, reads } = fixture;
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x85];
  isolateHandler(ram);
  ram.setU32(0x8130d2, 0);
  ram.setU16(DMG.p1rec + 0x02, 0x7000);
  ram.setU16(DMG.p1rec + 0x04, 0x3000);
  ram.setU8(REC + 0x22, 0);
  ram.setU8(REC + 0x20, ram.u8(REC + 0x21));
  ram.setU16(REC + 0x28, 0);
  ram.setU8(REC + 0x1e, 0);
  const spawns = [];

  runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture, {
    bulletSpawn: (site, result) => spawns.push([site, result]),
  }), WHITE_WORLD_RESOURCES);

  assert.equal(spawns.length, 1);
  assert.equal(spawns[0][0], descriptor.bullet.site);
  assert.deepEqual(spawns[0][1], [{
    carry: false, slot: 0, addr: BUL.pool, declined: false,
  }]);
  assert.equal(ram.u16(BUL.pool + BULLET_REC.typeWord) & 0x3f, 0x0d);
  assert.equal(ram.u8(REC + 0x1e), 6);
  assert.notEqual(ram.u16(REC + 0x28), 0,
    'the zero-cadence frame slews the aim before firing');
  assert.equal(ram.u32(REC + 0x24), rom.u32(
    descriptor.aimSprite + ((ram.u16(REC + 0x28) & 0x3e) << 1),
  ));
  assert.equal(reads.some((read) => read.address === descriptor.muzzle), true);
  assert.equal(reads.some((read) =>
    read.address === descriptor.bullet.templatePtrs + 4 * 13), true);
  assertBuildAOnly(reads);
});

test('White Type $85 preserves P1, P2, and combined hit ownership', () => {
  const cases = [
    { mask: 0x10, p1: 1, p2: 0 },
    { mask: 0x08, p1: 0, p2: 1 },
    { mask: 0x18, p1: 1, p2: 1 },
  ];
  for (const expected of cases) {
    const fixture = spawnWhite85();
    const { ram, rom, reads } = fixture;
    isolateHandler(ram);
    applyDamage(ram, expected.mask, 0x0500);

    runHandler(0x174968, ram, rom, REC, handlerContext(fixture),
      WHITE_WORLD_RESOURCES);

    assert.equal(ram.u16(REC), 0x8000);
    assert.equal(ram.u8(SUB) & 0x5c, 0);
    assert.equal(ram.u8(SUB + 0x20) & 0x5c, 0);
    assert.equal(ram.u32(0x81b4c0), expected.p1);
    assert.equal(ram.u32(0x81b4c4), expected.p2);
    assert.equal(ram.u16(SUB + 0x18), 0x0500);
    assert.equal(ram.u16(SUB + 0x38), 0x0500);
    assertBuildAOnly(reads);
  }
});

test('White Type $85 preserves P1, P2, and combined lethal ownership', () => {
  const cases = [
    { mask: 0x10, p1: 0x26, p2: 0 },
    { mask: 0x08, p1: 0, p2: 0x26 },
    { mask: 0x18, p1: 0x26, p2: 0x26 },
  ];
  for (const expected of cases) {
    const fixture = spawnWhite85();
    const { ram, rom, reads } = fixture;
    isolateHandler(ram);
    ram.setU16(0x81308c, 1);
    applyDamage(ram, expected.mask, 0x8001);
    const kills = [];

    runHandler(0x174968, ram, rom, REC, handlerContext(fixture, {
      killEvent: (...args) => kills.push(args),
    }), WHITE_WORLD_RESOURCES);

    assert.deepEqual(kills, [[0x25, expected.mask]]);
    assert.equal(ram.u32(0x81b4c0), expected.p1);
    assert.equal(ram.u32(0x81b4c4), expected.p2);
    assert.equal(ram.u16(REC), 0);
    assert.equal(ram.u8(SUB), 1);
    assert.equal(ram.u8(SUB + 0x20), 1);
    assert.equal(ram.u16(ITEM.count), 1);
    assertBuildAOnly(reads);
  }
});

test('White Type $85 creates all threshold cues, advances them, and reaps them', () => {
  const fixture = spawnWhite85();
  const { ram, rom, reads } = fixture;
  isolateHandler(ram);
  ram.setU32(REC + 0x44, 0x17493c);
  const thresholds = [
    [0x04e6, 0x17494a],
    [0x0380, 0x174958],
    [0x0219, 0x174966],
  ];
  for (let i = 0; i < thresholds.length; i++) {
    const [hp, cursor] = thresholds[i];
    ram.setU16(SUB + 0x18, hp);
    ram.setU16(SUB + 0x38, hp);
    runHandler(0x174968, ram, rom, REC, handlerContext(fixture),
      WHITE_WORLD_RESOURCES);
    assert.equal(ram.u32(REC + 0x44), cursor);
    assert.equal(ram.u16(CUE.count), i + 1);
  }

  assert.equal(ram.u16(CUE.base), 0x8000);
  assert.equal(ram.u32(CUE.base + 0x02), ram.u32(SUB + 0x02));
  assert.equal(ram.u32(CUE.base + 0x06), 0xfc00fe00);
  assert.equal(ram.u32(CUE.base + 0x0a), 0);
  assert.equal(ram.u16(CUE.base + 0x0e), 0x0410);
  assert.equal(ram.u32(CUE.base + 0x10), SUB);
  assert.equal(ram.u32(CUE.base + 0x14), 0x0800fc00);
  assert.equal(ram.u32(CUE.base + 0x18), 0x00140000);
  assert.equal(ram.u16(CUE.base + 0x1c), 0x001e);
  assert.equal(ram.u32(CUE.base + 0x1e), 0x00189ac8);
  assert.equal(ram.u32(CUE.base + 0x22), 0x00b4000c);

  ram.setU16(0x80390c, 1);
  for (let i = 0; i < 3; i++) {
    ram.setU16(CUE.base + i * CUE.stride + 0x22, 1);
  }
  assert.deepEqual(runCueDriver28AD70(ram, rom, WHITE_CUE_RESOURCES), {
    live: 3, emitted: 3, freed: 0, advanced: 3,
  });
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(CUE.base + i * CUE.stride) & 0x7c), [0x04, 0x04, 0x04]);

  for (let i = 0; i < 3; i++) {
    ram.setU16(CUE.base + i * CUE.stride + 0x22, 1);
  }
  assert.deepEqual(runCueDriver28AD70(ram, rom, WHITE_CUE_RESOURCES), {
    live: 3, emitted: 3, freed: 0, advanced: 2,
  });
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(CUE.base + i * CUE.stride) & 0x7c), [0x08, 0x08, 0x04]);

  ram.setU16(SUB, 0);
  assert.deepEqual(runCueDriver28AD70(ram, rom, WHITE_CUE_RESOURCES), {
    live: 3, emitted: 0, freed: 3, advanced: 0,
  });
  assert.equal(ram.u16(CUE.count), 0);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(CUE.base + i * CUE.stride)), [0, 0, 0]);
  assertBuildAOnly(reads);
});

test('White cue high-bit emitter mutation uses the White RNG table', () => {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  ram.setU8(0x803917, 0);

  assert.equal(selectEmitter28ACFE(
    ram, rom, 0x0010ffbf, WHITE_CUE_RESOURCES,
  ), 0x0010ff00);
  assert.equal(ram.u8(0x803917), 1);
  assert.equal(reads.some((read) => read.address === 0x14336b), true);
  assert.equal(reads.some((read) => read.address === 0x14301b), false);
  assertBuildAOnly(reads);
});

test('White Type $85 death allocates guaranteed items and complete debris', () => {
  const fixture = spawnWhite85();
  const { ram, rom, reads } = fixture;
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x85];
  isolateHandler(ram);
  ram.setU16(0x81308c, 1);
  applyDamage(ram, 0x10, 0x8001);
  const kills = [], items = [], effects = [], sounds = [];
  const ctx = handlerContext(fixture, {
    killEvent: (...args) => kills.push(args),
    itemSpawn: (...args) => items.push(args),
    effectSpawn: (...args) => effects.push(args),
    soundPost: (address) => sounds.push(address),
  });

  runHandler(descriptor.handler, ram, rom, REC, ctx, WHITE_WORLD_RESOURCES);

  assert.deepEqual(kills, [[0x25, 0x10]]);
  assert.deepEqual(items.map(([kind, site, slot]) => [kind, site, slot]), [
    [0, 0x174b5a, ITEM.base],
  ]);
  assert.deepEqual(effects, [
    [0x05, 0x174b76, POOL_B.base, descriptor.effects.poolBAllocator],
    [0x0c, 0x174ba2, POOL_B.base + POOL_B.stride,
      descriptor.effects.poolBAllocator],
    [0x84, 0x174bca, POOL_B.base + 2 * POOL_B.stride,
      descriptor.effects.poolBAllocator],
  ]);
  assert.deepEqual(sounds, [descriptor.sound.death]);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride) & 0xff), [0x05, 0x0c, 0x84]);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u32(POOL_B.base + i * POOL_B.stride + B.pos)),
  Array(3).fill(0x40002000));
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.bucket)),
  Array(3).fill(0x0010));
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.sub12)), [0, 0, 0]);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u32(POOL_B.base + i * POOL_B.stride + B.nudge)),
  [0x02000200, 0xf6000000, 0xee00fe00]);

  const effectFrame = runEffectDriver(ram, rom, ctx, descriptor.effects);
  assert.equal(effectFrame.subSpawned, 3);
  assert.equal(ram.u16(POOL_D.count), 3);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.sub12)),
  [0xffff, 0xffff, 0xffff]);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(POOL_D.base + i * POOL_D.stride + D.status) & 0x8000),
  [0x8000, 0x8000, 0x8000]);
  assert.deepEqual([0, 1, 2].map((i) =>
    ram.u16(POOL_D.base + i * POOL_D.stride + D.mode)), [0x04, 0x00, 0x00]);
  for (let i = 0; i < 3; i++) {
    const speed = ram.u8(POOL_D.base + i * POOL_D.stride + D.speed);
    assert.ok(speed >= 0x1a && speed <= 0x29,
      `Pool D speed $${speed.toString(16)} stays inside the native range`);
  }

  const subFrame = runSubEffectDriver(ram, rom, ctx, descriptor.effects);
  assert.equal(subFrame.live, 3);
  assert.equal(subFrame.emitted, 3);
  assert.equal(ram.u16(REC), 0);
  assert.equal(ram.u8(SUB), 1);
  assert.equal(ram.u8(SUB + 0x20), 1);
  assertBuildAOnly(reads);
});

function seedPowerRows(ram, rom) {
  const root = WHITE_ITEM_RESOURCES.collection.powerLists.root;
  const shotList = rom.u32(root);
  const laserList = rom.u32(root + 4);
  for (const who of [0, 1]) {
    ram.setU16(who === 0 ? POWER.p1Ship : POWER.p2Ship, 2);
    ram.setU16(who === 0 ? POWER.p1Weapon : POWER.p2Weapon, 0);
    ram.setU32(who === 0 ? POWER.p1Cursor : POWER.p2Cursor, shotList);
    ram.setU32(who === 0 ? POWER.p1PodCursor : POWER.p2PodCursor, laserList);
  }
  return { shotList, laserList };
}

function putCollectingPlayer(ram, player, item) {
  ram.setU16(player, 0x8000);
  ram.setU16(player + 0x02, ram.u16(item + I.pos));
  ram.setU16(player + 0x04, ram.u16(item + I.posX));
  ram.setU16(player + 0x10, 0x0400);
  ram.setU16(player + 0x12, 0x0300);
  ram.setU16(player + 0x14, 0x0200);
  ram.setU16(player + 0x16, 0x0100);
}

test('White Type $85 items collect on Frame N+1 for native P1 and P2', () => {
  for (const ownerIndex of [0, 1]) {
    const fixture = spawnWhite85();
    const { ram, rom, reads } = fixture;
    isolateHandler(ram);
    ram.setU16(0x81308c, 1);
    applyDamage(ram, ownerIndex === 0 ? 0x10 : 0x08, 0x8001);
    runHandler(0x174968, ram, rom, REC, handlerContext(fixture),
      WHITE_WORLD_RESOURCES);
    assert.equal(ram.u16(ITEM.count), 1);

    const cursors = seedPowerRows(ram, rom);
    const sounds = [], collected = [];
    const ctx = handlerContext(fixture, {
      soundPost: (address) => sounds.push(address),
      itemCollect: (...args) => collected.push(args),
    });
    const frameN = runItemDriver(ram, rom, ctx, WHITE_ITEM_RESOURCES);
    assert.deepEqual(frameN, {
      live: 1, emitted: 1, freed: 0, collected: 0, walked: 1,
    });
    assert.deepEqual(collected, []);

    const player = ownerIndex === 0 ? DMG.p1rec : DMG.p2rec;
    const otherPlayer = ownerIndex === 0 ? DMG.p2rec : DMG.p1rec;
    ram.setU16(otherPlayer, 0);
    putCollectingPlayer(ram, player, ITEM.base);
    ram.setU16(DMG.gate308c, 1);
    ram.setU16(DMG.mirror2, ownerIndex);
    ram.setU16(DMG.loop98, 0);
    const collision = runBuildAType5CollisionBeforeBombDamage18A1AC(ram, ctx);
    assert.equal(collision.path, 'full');
    assert.equal(collision.ownerIndex, ownerIndex);
    assert.equal(collision.player.items, 1);
    assert.equal(ram.u16(ITEM.base) & 0x1800,
      ownerIndex === 0 ? DMG.maskP1 : DMG.maskP2);
    assert.deepEqual(collected, []);

    const frameN1 = runItemDriver(ram, rom, ctx, WHITE_ITEM_RESOURCES);
    assert.equal(frameN1.collected, 0,
      'the initial pickup changes state before collected-animation telemetry');
    assert.equal(ram.u16(ITEM.base), 0x8001);
    assert.equal(ram.u32(ITEM.base + I.list), 0x17e532);
    assert.equal(ram.u16(ITEM.base + I.cursor), 0);
    assert.equal(collected.length, 1);

    const selected = ownerIndex === 0
      ? [POWER.p1Shot, POWER.p1Laser, POWER.p1Cursor, POWER.p1PodCursor]
      : [POWER.p2Shot, POWER.p2Laser, POWER.p2Cursor, POWER.p2PodCursor];
    const other = ownerIndex === 0
      ? [POWER.p2Shot, POWER.p2Laser, POWER.p2Cursor, POWER.p2PodCursor]
      : [POWER.p1Shot, POWER.p1Laser, POWER.p1Cursor, POWER.p1PodCursor];
    assert.deepEqual(selected.slice(0, 2).map((address) => ram.u16(address)), [2, 2]);
    assert.deepEqual(selected.slice(2).map((address) => ram.u32(address)),
      [cursors.shotList + 2, cursors.laserList + 2]);
    assert.deepEqual(other.slice(0, 2).map((address) => ram.u16(address)), [0, 0]);
    assert.deepEqual(other.slice(2).map((address) => ram.u32(address)),
      [cursors.shotList, cursors.laserList]);
    assert.deepEqual(sounds, [
      ownerIndex === 0 ? 0x28c43c : 0x28c452,
      WHITE_ITEM_RESOURCES.sounds.pickup,
      WHITE_ITEM_RESOURCES.sounds.powerUp,
    ]);
    assertBuildAOnly(reads);
  }
});

test('static Black Type $85 and $86 keep their shared handler compatibility', () => {
  const rom = new RomWindows(tables.rom);
  const moveTables = new MoveTables(tables, rom);
  for (const [type, body] of [[0x85, 0x27581a], [0x86, 0x275bb6]]) {
    const ram = new Ram(undefined, BLACK_LABEL_PROFILE.ramLayout);
    const unported = new UnportedLog();
    const items = [];
    ram.setU16(REC, 0x8000);
    ram.setU16(REC + 0x04, 1);
    ram.setU32(REC + 0x06, SUB);
    ram.setU8(REC + 0x0c, type);
    ram.setU32(REC + 0x12, 0x2331b4);
    ram.setU16(0x813092, 1);
    ram.setU16(0x813094, type === 0x86 ? 2 : 0);
    ram.setU16(DMG.p1rec, 0x8000);
    ram.setU16(DMG.p1rec + 0x02, 0x5000);
    ram.setU16(DMG.p1rec + 0x04, 0x3000);

    runInitBodyAddr(body, ram, rom, REC, unported, moveTables);
    assert.equal(ram.u16(SUB), 0xa001);
    assert.equal(ram.u16(SUB + 0x20), 0xa001);
    assert.equal(ram.u32(REC + 0x44), 0x2758e8);
    ram.setU32(REC + 0x12, 0);
    ram.setU32(SUB + 0x02, 0x40002000);
    ram.setU16(SUB + 0x18, 0x0700);
    ram.setU16(SUB + 0x38, 0x0700);
    ram.setU8(REC + 0x16, 1);
    ram.setU32(0x8130d2, 1);
    const ctx = {
      ram, rom, tables: moveTables, unported,
      itemSpawn: (kind, site) => items.push([kind, site]),
    };

    runHandler(0x275914, ram, rom, REC, ctx);
    assert.equal(ram.u16(REC), 0x8000);
    assert.equal(ram.u32(SUB + 0x22), 0x40002000);
    assert.equal(ram.u16(QUEUE_7_BYTES), 24);

    if (type === 0x86) {
      ram.setU16(0x81308c, 1);
      applyDamage(ram, 0x10, 0x8001);
      runHandler(0x275914, ram, rom, REC, ctx);
      assert.deepEqual(items, [[8, 0x275b06]]);
      assert.equal(ram.u16(REC), 0);
    }
  }
});
