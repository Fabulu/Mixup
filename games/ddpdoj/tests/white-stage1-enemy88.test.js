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
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType88Resources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x131304;
const MOVEMENT = 0x131eb0;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const TYPE88_WINDOWS = Object.freeze([
  Object.freeze({ base: '$171DCE', len: 0x0080 }),
  Object.freeze({ base: '$17224E', len: 0x0080 }),
  Object.freeze({ base: '$174E3A', len: 0x0008 }),
  Object.freeze({ base: '$174F44', len: 0x008e }),
  Object.freeze({ base: '$17547A', len: 0x002c }),
  Object.freeze({ base: '$177382', len: 0x0030 }),
  Object.freeze({ base: '$17D504', len: 0x0008 }),
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
  'every White Type $88 cartridge read stays below $200000');
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

function spawnWhite88() {
  const fixture = createWhiteFixture();
  const { ram, rom, machineCtx, world } = fixture;
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x3000);
  ram.setU16(0x8103ea, 0x2000);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x0142);
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

function isolateHandler(ram, descriptor) {
  ram.setU32(REC + 0x12, 0);
  ram.setU32(REC + 0x44, descriptor.cueCursor + 0x2a);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU8(SUB, 1);
  ram.setU8(SUB + 0x01, ram.u8(SUB + 0x01) & 0xbf);
  ram.setU8(SUB + 0x1a, 0);
  ram.setU8(SUB + 0x1b, 0x10);
  ram.setU16(SUB + 0x18, 0x1000);
  ram.setU16(SUB + 0x38, 0x1000);
  ram.setU8(REC + 0x16, 1);
  ram.setU32(0x8130d2, 0);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813172, 0);
}

function bulletAddress(result) {
  return BUL.pool + result.slot * BUL.stride;
}

function queuedBytes(ram) {
  return BUCKETS.reduce((sum, bucket) => sum + ram.u16(bucket.counter), 0);
}

test('White Type $88 owns its exact descriptors, windows, and natural $131304 route', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x88];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x88];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.palette,
    black.recordPrototype, black.subPrototype, black.cueCursor, black.initAimSite,
    black.headingArt, black.fanVectors, black.aim.entry, black.aim.slew,
    black.spriteTable, black.emitter.recordDispatch, black.emitter.registerDispatch,
    black.bullet.direct.entry, black.bullet.spreadTwo.entry, ...black.bullet.sites,
    ...black.effect.sites, black.effect.remap, black.secondaryBurst,
    black.poolAOffsets, black.sound.death, black.retirement.entry,
  ], [
    0x275d98, 0x275da0, 0x275f30, 0x275ea2,
    0x275eac, 0x275ecc, 0x275f04, 0x24200a,
    0x272d7a, 0x2731fa, 0x24203e, 0x242190,
    0x2763d8, 0x27829c, 0x2782e4,
    0x2813f0, 0x281442,
    0x2761de, 0x2761e6, 0x2761ee, 0x27622e, 0x276236, 0x27623e,
    0x2762c6, 0x276304, 0x276348, 0x27638e, 0x278320, 0x289b22,
    0x2763e8, 0x28c2dc, 0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.palette,
    white.recordPrototype, white.subPrototype, white.cueCursor, white.initAimSite,
    white.headingArt, white.fanVectors, white.aim.entry, white.aim.slew,
    white.spriteTable, white.emitter.recordDispatch, white.emitter.registerDispatch,
    white.bullet.direct.entry, white.bullet.spreadTwo.entry, ...white.bullet.sites,
    ...white.effect.sites, white.effect.remap, white.secondaryBurst,
    white.poolAOffsets, white.sound.death, white.retirement.entry,
  ], [
    0x174e3a, 0x174e42, 0x174fd2, 0x174f44,
    0x174f4e, 0x174f6e, 0x174fa6, 0x142344,
    0x171dce, 0x17224e, 0x142378, 0x1424ca,
    0x17547a, 0x17733a, 0x177382,
    0x180474, 0x1804c2,
    0x175280, 0x175288, 0x175290, 0x1752d0, 0x1752d8, 0x1752e0,
    0x175368, 0x1753a6, 0x1753ea, 0x175430, 0x1773be, 0x18865e,
    0x17548a, 0x18ae02, 0x1627dc,
  ]);
  assert.deepEqual(white.bullet.direct.supportedKinds, [4]);
  assert.deepEqual(white.bullet.spreadTwo.supportedKinds, [4]);
  assert.equal(white.poolAKind, 0x08);
  for (const value of [black, white, white.aim, white.aim64, white.emitter,
    white.bullet, white.bullet.direct, white.bullet.spreadTwo,
    white.bullet.direct.supportedKinds, white.score, white.cues, white.effects,
    white.effect, white.poolA, white.sound, white.retirement]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => requireType88Resources({ ...white }, 'white'),
    /canonical frozen edition descriptor/);
  assert.throws(() => requireType88Resources(black, 'white'),
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

  assert.deepEqual(tables.editions.whiteLabel.stage1Type88, {
    init: {
      start: '$174E3A', end: '$174FD2',
      sha256: '5e7ff6ebd4ecb64e5f8800791412767443431855a2a27244129b2a1e12de85fd',
    },
    handler: {
      start: '$174FD2', end: '$17547A',
      sha256: '11be73a632a6fdb1d2bbed7f93741a2b21cf4ee19cffb817f2fa236518502efb',
    },
  });
  const manifest = [
    ...tables.editions.whiteLabel.worldRuntimeWindows,
    ...tables.editions.whiteLabel.bulletRuntimeWindows,
  ];
  assert.equal(TYPE88_WINDOWS.reduce((sum, window) => sum + window.len, 0), 0x01fa);
  for (const expected of TYPE88_WINDOWS) {
    assert.equal(manifest.filter((window) =>
      window.base === expected.base && window.len === expected.len).length, 1);
    const global = tables.rom.windows.filter((window) =>
      window.base === expected.base && window.len === expected.len);
    assert.equal(global.length, 1);
    assert.equal(global[0].hex.length, expected.len * 2);
    assert.match(global[0].why, /^White A /);
    assert.ok(Number.parseInt(expected.base.slice(1), 16) + expected.len <= 0x200000);
  }

  const { ram, rom, reads, machineCtx, world } = spawnWhite88();
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x01, 0x42, 0x00, 0x00, 0x88, 0x01, 0x10, 0x59,
  ]);
  assert.equal(rom.u16(0x1317be), 0x065e);
  assert.deepEqual(Array.from(rom.bytes(MOVEMENT, 16)), [
    0x6f, 0xc0, 0xf3, 0xc0, 0x81, 0x04, 0xc0, 0x05,
    0x10, 0x90, 0xc0, 0x04, 0x10, 0x10, 0xc0, 0x03,
  ]);
  assert.deepEqual([rom.u32(0x17d504), rom.u32(0x17d508)],
    [white.initStub, white.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u8(REC + 0x0c), ram.u32(REC + 0x06),
    ram.u32(REC + 0x12), ram.u32(REC + 0x44), ram.u32(REC + 0x4c),
    ram.u16(SUB + 0x02), ram.u16(SUB + 0x04), ram.u32(SUB + 0x0a),
    ram.u16(SUB + 0x18), ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b),
    ram.u8(SUB + 0x1d), ram.u16(SUB + 0x1e),
  ], [
    0x8000, 0x88, SUB,
    MOVEMENT + 8, white.cueCursor, white.handler,
    0x6fc0, 0xebc0, 0x0017d480,
    0x1280, 0x05, 0x10,
    0x0d, 0x04,
  ]);
  assert.deepEqual([
    ram.u8(REC + 0x1c), ram.u8(REC + 0x1d), ram.u8(REC + 0x1e),
    ram.u8(REC + 0x20), ram.u8(REC + 0x21),
    ram.u16(REC + 0x28), ram.u16(REC + 0x2e),
    ram.u8(REC + 0x31), ram.u8(REC + 0x32), ram.u8(REC + 0x33),
  ], [0x0d, 0x12, 0x80, 1, 1, 0x10, 0x10, 4, 2, 2]);
  assert.equal(ram.u32(REC + 0x24),
    rom.u32(white.headingArt + ((ram.u16(REC + 0x28) & 0x3e) * 2)));
  assert.equal(ram.u32(REC + 0x2a),
    rom.u32(white.headingArt + ((ram.u16(REC + 0x2e) & 0x3e) * 2)));
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 16);
  assert.deepEqual(machineCtx.unportedLog.report(), [
    '      1 x $142344 $142344 aim in type $88 init -- bucket tracks movement heading',
  ]);
  for (const address of [
    SOURCE, 0x1317be, MOVEMENT, 0x17d504,
    white.initStub + 2, white.recordPrototype, white.subPrototype,
    white.palette, white.spriteTable,
    white.headingArt + ((ram.u16(REC + 0x28) & 0x3e) * 2),
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});

test('White Type $88 alternates aim, emits four sprites, fires six kind $04 bullets, and continues them', () => {
  const fixture = spawnWhite88();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x88];
  isolateHandler(ram, descriptor);
  reads.length = 0;
  ram.setU16(0x8103e8, 0x7000);
  ram.setU16(0x8103ea, 0x7000);
  ram.setU16(REC + 0x28, 0x0008);
  ram.setU16(REC + 0x2e, 0x0014);
  ram.setU8(REC + 0x20, 0x40);
  ram.setU8(REC + 0x21, 0x40);
  ram.setU8(REC + 0x22, 0);
  ram.setU8(REC + 0x1e, 0);
  ram.setU8(REC + 0x31, 0x20);
  ram.setU8(REC + 0x32, 0x40);

  const emitterIndex = ram.u16(SUB + 0x1e) * 4;
  const recordEmitter = resolveEmitStub(rom,
    rom.u32(descriptor.emitter.recordDispatch + emitterIndex));
  const registerEmitter = resolveEmitStub(rom,
    rom.u32(descriptor.emitter.registerDispatch + emitterIndex));
  assert.equal(recordEmitter.conv, 'record');
  assert.equal(registerEmitter.conv, 'register');
  const emittedBefore = queuedBytes(ram);
  const calls = [];
  const ctx = handlerContext(fixture, {
    bulletSpawn: (site, result) => calls.push({ site, result }),
  });
  runHandler(descriptor.handler, ram, rom, REC, ctx, world.resources);

  assert.equal(queuedBytes(ram) - emittedBefore, 4 * 12);
  assert.deepEqual(calls.map(({ site }) => site), descriptor.bullet.sites);
  assert.deepEqual(calls.map(({ result }) => result.length), [1, 1, 1, 1, 1, 1]);
  const bullets = calls.flatMap(({ result }) => result.map(bulletAddress));
  assert.equal(bullets.length, 6);
  for (const bullet of bullets) assert.equal(ram.u16(bullet + BULLET_REC.typeWord), 0x8104);

  const facingA = ram.u16(REC + 0x28);
  const facingB = ram.u16(REC + 0x2e);
  assert.notEqual(facingA, 0x0008);
  assert.equal(facingB, 0x0014);
  assert.equal(ram.u8(SUB + 0x01) & 0x40, 0x40);
  assert.equal(ram.u32(REC + 0x24),
    rom.u32(descriptor.headingArt + ((facingA & 0x3e) * 2)));
  assert.deepEqual(
    bullets.slice(0, 3).map((bullet) =>
      (ram.u8(bullet + BULLET_REC.origDir) - ram.u8(bullets[0] + BULLET_REC.origDir)) & 0xff),
    [0, (-20) & 0xff, (-40) & 0xff],
  );
  assert.deepEqual(
    bullets.slice(3).map((bullet) =>
      (ram.u8(bullet + BULLET_REC.origDir) - ram.u8(bullets[3] + BULLET_REC.origDir)) & 0xff),
    [0, 20, 40],
  );

  ram.setU16(0x8103e8, 0x1800);
  ram.setU16(0x8103ea, 0x1800);
  ram.setU8(REC + 0x21, ram.u8(REC + 0x20));
  ram.setU8(REC + 0x22, 0);
  ram.setU8(REC + 0x1e, 0x40);
  const facingABefore = ram.u16(REC + 0x28);
  runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture), world.resources);
  assert.equal(ram.u16(REC + 0x28), facingABefore);
  assert.notEqual(ram.u16(REC + 0x2e), facingB);
  assert.equal(ram.u8(SUB + 0x01) & 0x40, 0);
  assert.equal(ram.u32(REC + 0x2a), rom.u32(
    descriptor.headingArt + ((ram.u16(REC + 0x2e) & 0x3e) * 2),
  ));

  runWhiteBulletDriver({ ram, rom });
  const continuations = bullets.map((bullet) => ram.u32(bullet + BULLET_REC.continuation));
  assert.deepEqual(continuations, Array(6).fill(0x181470));
  for (const bullet of bullets) assert.equal(ram.u16(bullet + BULLET_REC.typeWord), 0x8004);
  const beforeContinuation = bullets.map((bullet) => ram.u32(bullet + BULLET_REC.posA));
  runWhiteBulletDriver({ ram, rom });
  for (let i = 0; i < bullets.length; i++) {
    assert.notEqual(ram.u16(bullets[i] + BULLET_REC.typeWord) & TYPEBIT.alive, 0);
    assert.equal(ram.u32(bullets[i] + BULLET_REC.continuation), continuations[i]);
    assert.notEqual(ram.u32(bullets[i] + BULLET_REC.posA), beforeContinuation[i]);
  }
  assert.deepEqual(ctx.unported.report(), []);
  for (const address of [
    descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
    descriptor.headingArt + ((facingA & 0x3e) * 2),
    descriptor.fanVectors + u16((facingA & 0x3e) * 2),
    descriptor.emitter.recordDispatch + emitterIndex,
    descriptor.emitter.registerDispatch + emitterIndex,
    descriptor.bullet.direct.templatePtrs + 4 * 4,
    descriptor.bullet.direct.spawnInitPtrs + 4 * 4,
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});

test('White Type $88 lethal P2 ownership scores $115 and uses native drops, effects, sound, and retirement', () => {
  const fixture = spawnWhite88();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x88];
  isolateHandler(ram, descriptor);
  reads.length = 0;
  ram.setU16(0x810448, 0x8000);
  ram.setU16(0x81044a, 0x7000);
  ram.setU16(0x81044c, 0x7000);
  ram.setU8(SUB, 0x09);
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

  assert.deepEqual(kills, [[0x115, 0x08]]);
  assert.deepEqual([
    ram.u32(LEDGER.p1.pendingEnd - 4), ram.u32(LEDGER.p2.pendingEnd - 4),
  ], [0, 0x116]);
  assert.deepEqual(sounds, [descriptor.sound.death]);
  assert.deepEqual(effects.map(([kind, site, address, allocator]) =>
    [kind, site, address, allocator]), [
    [0x0d, descriptor.effect.sites[0], POOL_B.base, descriptor.effects.poolBAllocator],
    [0x0c, descriptor.effect.sites[1], POOL_B.base + POOL_B.stride,
      descriptor.effects.poolBAllocator],
    [0x0c, descriptor.effect.sites[2], POOL_B.base + 2 * POOL_B.stride,
      descriptor.effects.poolBAllocator],
    [0x85, descriptor.effect.sites[3], POOL_B.base + 3 * POOL_B.stride,
      descriptor.effects.poolBAllocator],
  ]);

  assert.equal(ram.u16(descriptor.poolA.liveCount), 7);
  for (let i = 0; i < 7; i++) {
    const drop = descriptor.poolA.base + i * descriptor.poolA.stride;
    assert.equal(ram.u16(drop + IMPACT.status), 0x8008);
    assert.equal(ram.u32(drop + IMPACT.pos),
      (0x40002000 + rom.u32(descriptor.poolAOffsets + i * 4)) >>> 0);
  }
  assert.deepEqual([0, 1, 2, 3].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.status) & 0xff),
  [0x0d, 0x0c, 0x0c, 0x85]);
  assert.deepEqual([0, 1, 2, 3].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.sub12)), [1, 1, 1, 1]);
  assert.deepEqual([0, 1, 2, 3].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.sub14)),
  [0x0400, 0, 0x0400, 0]);
  assert.deepEqual([0, 1, 2, 3].map((i) =>
    ram.u32(POOL_B.base + i * POOL_B.stride + B.nudge)),
  [0x02000000, 0xfe00fa00, 0xfc000200, 0xfe000000]);
  assert.deepEqual([0, 1, 2, 3].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.speed)),
  [0, 0x05c0, 0x0440, 0x0380]);
  assert.deepEqual([0, 1, 2, 3].map((i) =>
    ram.u16(POOL_B.base + i * POOL_B.stride + B.hook)), [1, 1, 1, 1]);
  const notes = ctx.unported.report().join('\n');
  assert.match(notes, /\$18865E.*D0=\$C, D2=\$FFFFFA00/);
  assert.match(notes, /\$18865E.*D0=\$C, D2=\$00000600/);
  assert.deepEqual([ram.u16(REC), ram.u8(SUB)], [0, 1]);
  for (const address of [
    descriptor.score.capTable, descriptor.score.refillTable,
    descriptor.poolA.dispatch + descriptor.poolAKind,
    descriptor.poolA.templateTable + descriptor.poolAKind,
    descriptor.poolAOffsets, descriptor.poolAOffsets + 6 * 4,
    descriptor.effect.remap + ram.u16(SUB + 0x1e) * 2,
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});
