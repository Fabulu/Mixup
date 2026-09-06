import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC, TYPEBIT } from '../src/bullets.js';
import { B as IMPACT } from '../src/bee.js';
import { B, POOL_B } from '../src/effects.js';
import { LEDGER } from '../src/score.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { runSpawnWalker } from '../src/spawn.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { runWhiteBulletDriver } from '../src/white-bullets.js';
import { UnportedLog } from '../src/unported.js';
import {
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType89Resources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x1311fc;
const MOVEMENT = 0x131e50;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const TYPE89_WINDOWS = Object.freeze([
  Object.freeze({ base: '$171ECE', len: 0x0080 }),
  Object.freeze({ base: '$17234E', len: 0x0100 }),
  Object.freeze({ base: '$176312', len: 0x0008 }),
  Object.freeze({ base: '$1763AE', len: 0x0032 }),
  Object.freeze({ base: '$17D50C', len: 0x0008 }),
  Object.freeze({ base: '$18062A', len: 0x0004 }),
  Object.freeze({ base: '$180956', len: 0x0004 }),
  Object.freeze({ base: '$180A48', len: 0x0012 }),
  Object.freeze({ base: '$180FE8', len: 0x0004 }),
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
          reads.push({ method: property, address, end: address + length });
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
  'every White Type $89 cartridge read stays below $200000');
}

function assertRead(reads, address) {
  assert.equal(reads.some((read) => read.address === address), true,
    `missing White cartridge read at $${address.toString(16)}`);
}

function createWhiteFixture() {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  return { ram, rom, reads, machineCtx, world };
}

function spawnWhite89() {
  const fixture = createWhiteFixture();
  const { ram, rom, machineCtx, world } = fixture;
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x3000);
  ram.setU16(0x8103ea, 0x2000);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x011b);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, null, null, null, null, world.resources,
  ), { script: 2, deferred: 0 });
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

function isolateHandler(ram) {
  ram.setU32(REC + 0x12, 0);
  ram.setU32(REC + 0x44, 0);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU8(REC + 0x16, 1);
  ram.setU32(0x8130d2, 0);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813172, 0);
}

function bulletAddress(result) {
  return BUL.pool + result.slot * BUL.stride;
}

test('White Type $89 owns its exact descriptors, windows, and natural $1311FC route', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x89];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x89];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.headingArt, black.pairedFan,
    black.bullet.entry, ...black.bullet.sites, black.emitter.dispatch,
    black.effect.site, black.effect.remap, black.sound.death, black.retirement.entry,
  ], [
    0x277270, 0x277278, 0x27733e, 0x272e7a, 0x2732fa,
    0x2813f0, 0x27745c, 0x277464, 0x27829c,
    0x2774d0, 0x278320, 0x28c25a, 0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.palette,
    white.recordPrototype, white.subPrototype, white.initAimSite,
    white.headingArt, white.pairedFan, white.aim.entry, white.aim.slew,
    white.playerDistance, white.bullet.entry, ...white.bullet.sites,
    white.emitter.dispatch, white.effect.site, white.effect.remap,
    white.sound.death, white.retirement.entry,
  ], [
    0x176312, 0x17631a, 0x1763e0, 0x1763ae,
    0x1763b8, 0x1763c4, 0x142366,
    0x171ece, 0x17234e, 0x142378, 0x1424ca,
    0x167090, 0x180474, 0x1764fe, 0x176506,
    0x17733a, 0x176572, 0x1773be,
    0x18ad80, 0x1627dc,
  ]);
  assert.deepEqual(white.bullet.supportedKinds, [6]);
  assert.equal(white.poolAKind, 0x08);
  assert.equal(white.effect.kind, 0x0c);
  for (const value of [black, white, white.aim, white.aim64, white.fireGate,
    white.bullet, white.bullet.supportedKinds, white.emitter, white.score,
    white.effects, white.effect, white.poolA, white.sound, white.retirement]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => requireType89Resources({ ...white }, 'white'),
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

  assert.deepEqual(tables.editions.whiteLabel.stage1Type89, {
    init: {
      start: '$176312', end: '$1763E0',
      sha256: 'c173ffefab1a57da8b6a1007f42565a636a4a5bce0e1e9621202b586ca4bfae1',
    },
    handler: {
      start: '$1763E0', end: '$1765B4',
      sha256: '447b057b4dd401052b5c0b178370968f9116836c59bdb71f71dea012c29cec97',
    },
  });
  const manifest = [
    ...tables.editions.whiteLabel.worldRuntimeWindows,
    ...tables.editions.whiteLabel.bulletRuntimeWindows,
  ];
  assert.equal(TYPE89_WINDOWS.reduce((sum, window) => sum + window.len, 0), 0x01e0);
  for (const expected of TYPE89_WINDOWS) {
    assert.equal(manifest.filter((window) =>
      window.base === expected.base && window.len === expected.len).length, 1);
    const global = tables.rom.windows.filter((window) =>
      window.base === expected.base && window.len === expected.len);
    assert.equal(global.length, 1);
    assert.equal(global[0].hex.length, expected.len * 2);
    assert.match(global[0].why, /^White A /);
    assert.ok(Number.parseInt(expected.base.slice(1), 16) + expected.len <= 0x200000);
  }

  const { ram, rom, reads, machineCtx, world } = spawnWhite89();
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x01, 0x1b, 0x00, 0x00, 0x89, 0x01, 0x10, 0x51,
  ]);
  assert.equal(rom.u16(0x1317ae), 0x05fe);
  assert.deepEqual(Array.from(rom.bytes(MOVEMENT, 16)), [
    0x75, 0x80, 0x1e, 0x00, 0x81, 0x04, 0x60, 0x00,
    0x76, 0x00, 0x08, 0x80, 0x81, 0x04, 0x60, 0x00,
  ]);
  assert.deepEqual([rom.u32(0x17d50c), rom.u32(0x17d510)],
    [white.initStub, white.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u8(REC + 0x0c), ram.u32(REC + 0x06),
    ram.u32(REC + 0x12), ram.u32(REC + 0x4c),
    ram.u16(SUB + 0x02), ram.u16(SUB + 0x04), ram.u16(SUB + 0x18),
    ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b), ram.u8(SUB + 0x1d),
    ram.u16(SUB + 0x1e), ram.u8(REC + 0x21),
  ], [
    0x8000, 0x89, SUB,
    MOVEMENT + 6, white.handler,
    0x7580, 0x1600, 0x0480,
    0x10, 0x60, 0x0e,
    0x04, 0x60,
  ]);
  assert.equal(ram.u32(SUB + 0x0a),
    rom.u32(white.headingArt + ((ram.u8(SUB + 0x1b) & 0x3e) * 2)));
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 16);
  assert.deepEqual(machineCtx.unportedLog.report(), [
    '      1 x $142366 $142366 aim in type $89 init -- sprite tracks movement heading',
  ]);
  for (const address of [
    SOURCE, 0x1317ae, MOVEMENT, 0x17d50c,
    white.initStub + 2, white.recordPrototype, white.subPrototype,
    white.palette,
    white.headingArt + ((ram.u8(SUB + 0x1b) & 0x3e) * 2),
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});

test('White Type $89 aims, emits, fires its paired kind $06 fan, and continues both bullets', () => {
  const fixture = spawnWhite89();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x89];
  isolateHandler(ram);
  reads.length = 0;
  ram.setU16(0x8103e8, 0x7000);
  ram.setU16(0x8103ea, 0x7000);
  ram.setU16(REC + 0x20, 0x0013);
  ram.setU8(REC + 0x1a, 0);
  ram.setU8(REC + 0x17, 0x20);
  ram.setU8(REC + 0x1c, 0x40);
  ram.setU8(REC + 0x1d, 0x40);
  ram.setU8(REC + 0x1e, 0);
  ram.setU8(REC + 0x1f, 0x20);

  const emitterStub = rom.u32(
    descriptor.emitter.dispatch + ram.u16(SUB + 0x1e) * 4,
  );
  const emitter = resolveEmitStub(rom, emitterStub);
  const emitterBefore = ram.u16(BUCKETS[emitter.bucket].counter);
  const calls = [];
  const ctx = handlerContext(fixture, {
    bulletSpawn: (site, result) => calls.push({ site, result }),
  });
  runHandler(descriptor.handler, ram, rom, REC, ctx, world.resources);

  assert.deepEqual(calls.map(({ site }) => site), descriptor.bullet.sites);
  const bullets = calls.map(({ result }) => bulletAddress(result[0]));
  assert.deepEqual(bullets, [BUL.pool, BUL.pool + BUL.stride]);
  const facing = ram.u16(REC + 0x20);
  assert.notEqual(facing, 0x0013);
  const headingCell = descriptor.headingArt + ((facing & 0x3e) * 2);
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(headingCell));
  assert.equal(ram.u16(BUCKETS[emitter.bucket].counter) - emitterBefore, 12);
  assert.equal(ram.u32(BUCKETS[emitter.bucket].buffer + emitterBefore + 4),
    ram.u32(SUB + 0x0a));

  const fanOffset = u16(u16((facing & 0x3e) * 2) * 2);
  for (let i = 0; i < 2; i++) {
    const vector = rom.u32(descriptor.pairedFan + fanOffset + i * 4);
    const expected = (u16((vector >>> 16) + 0x4000) * 0x10000
      + u16(vector + 0x2000)) >>> 0;
    assert.equal(ram.u16(bullets[i] + BULLET_REC.typeWord), 0x8106);
    assert.equal(ram.u32(bullets[i] + BULLET_REC.posA), expected);
  }

  runWhiteBulletDriver({ ram, rom });
  for (const bullet of bullets) {
    assert.equal(ram.u16(bullet + BULLET_REC.typeWord), 0x8006);
    assert.equal(ram.u32(bullet + BULLET_REC.continuation), 0x1815e8);
  }
  const beforeContinuation = bullets.map((bullet) =>
    ram.u32(bullet + BULLET_REC.posA));
  runWhiteBulletDriver({ ram, rom });
  for (let i = 0; i < bullets.length; i++) {
    assert.notEqual(ram.u16(bullets[i] + BULLET_REC.typeWord) & TYPEBIT.alive, 0);
    assert.equal(ram.u32(bullets[i] + BULLET_REC.continuation), 0x1815e8);
    assert.notEqual(ram.u32(bullets[i] + BULLET_REC.posA), beforeContinuation[i]);
  }
  assert.deepEqual(ctx.unported.report(), []);
  for (const address of [
    descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
    headingCell, descriptor.pairedFan + fanOffset,
    descriptor.emitter.dispatch + ram.u16(SUB + 0x1e) * 4,
    descriptor.bullet.templatePtrs + 4 * 6,
    descriptor.bullet.spawnInitPtrs + 4 * 6,
    0x180a48, 0x180fe8,
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});

test('White Type $89 lethal P2 ownership scores $34 and uses native drop, effect, and retirement', () => {
  const fixture = spawnWhite89();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x89];
  isolateHandler(ram);
  reads.length = 0;
  ram.setU16(0x810448, 0x8000);
  ram.setU16(0x81044a, 0x7000);
  ram.setU16(0x81044c, 0x7000);
  ram.setU8(SUB, ram.u8(SUB) | 0x08);
  ram.setU16(SUB + 0x18, 0xffff);
  ram.setU16(SUB + 0x38, 0xffff);
  const kills = [];
  const sounds = [];
  const effects = [];
  const ctx = handlerContext(fixture, {
    killEvent: (...args) => kills.push(args),
    soundPost: (address) => sounds.push(address),
    effectSpawn: (...args) => effects.push(args),
  });

  runHandler(descriptor.handler, ram, rom, REC, ctx, world.resources);

  assert.deepEqual(kills, [[0x34, 0x08]]);
  assert.deepEqual([
    ram.u32(LEDGER.p1.pendingEnd - 4), ram.u32(LEDGER.p2.pendingEnd - 4),
  ], [0, 0x35]);
  assert.deepEqual(sounds, [descriptor.sound.death]);
  assert.deepEqual(effects.map(([kind, site, address, allocator]) =>
    [kind, site, address, allocator]), [[
    descriptor.effect.kind, descriptor.effect.site, POOL_B.base,
    descriptor.effects.poolBAllocator,
  ]]);

  const drop = descriptor.poolA.base;
  assert.equal(ram.u16(descriptor.poolA.liveCount), 1);
  assert.equal(ram.u16(drop + IMPACT.status), 0x8008);
  assert.equal(ram.u32(drop + IMPACT.pos), 0x40002000);
  assert.equal(ram.u16(POOL_B.base + B.status), 0x800c);
  assert.equal(ram.u32(POOL_B.base + B.pos), 0x40002000);
  assert.equal(ram.u16(POOL_B.base + B.bucket),
    rom.u16(descriptor.effect.remap + ram.u16(SUB + 0x1e) * 2));
  assert.deepEqual([
    ram.u16(POOL_B.base + B.sub12), ram.u16(POOL_B.base + B.sub14),
    ram.u16(POOL_B.base + B.nudge), ram.u16(POOL_B.base + B.nudge + 2),
    ram.u16(POOL_B.base + B.hook),
  ], [1, 0, 0xfe00, 0, 1]);
  assert.deepEqual(ctx.unported.report(), [
    '      1 x $188630 effect $188630 (D0=$8 secondary) (W26) rec $81364c',
  ]);
  assert.deepEqual([ram.u16(REC), ram.u8(SUB)], [0, 1]);
  for (const address of [
    descriptor.score.capTable, descriptor.score.refillTable,
    descriptor.poolA.dispatch + descriptor.poolAKind,
    descriptor.poolA.templateTable + descriptor.poolAKind,
    descriptor.effect.remap + ram.u16(SUB + 0x1e) * 2,
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});
