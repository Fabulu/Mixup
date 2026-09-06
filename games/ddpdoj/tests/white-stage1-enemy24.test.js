import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { LEDGER } from '../src/score.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { runSpawnWalker } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { PaletteState, PALSTAGE } from '../src/palette.js';
import { BUCKETS, encodeRegisterRequest } from '../src/spritequeue.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import {
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType24Resources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x1316ec;
const MOVEMENT = 0x13247a;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const TYPE24_WINDOWS = Object.freeze([
  Object.freeze({ base: '$122BF8', len: 0x0040 }),
  Object.freeze({ base: '$1669BC', len: 0x0008 }),
  Object.freeze({ base: '$1959DE', len: 0x0008 }),
  Object.freeze({ base: '$195A28', len: 0x001c }),
  Object.freeze({ base: '$195B0E', len: 0x0040 }),
]);

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
  return { rom, reads, numeric };
}

function assertWholeWhiteReads(fixture) {
  for (const read of fixture.reads) {
    assert.ok(read.address >= 0 && read.end <= 0x200000,
      `White Type $24 ${read.method} escaped Build A at $${read.address.toString(16)}`);
    assert.ok(fixture.numeric.some(({ start, end }) =>
      read.address >= start && read.end <= end),
    `White Type $24 ${read.method} at $${read.address.toString(16)} crossed a window seam`);
  }
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
  const cartridge = trackedWhiteCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const palette = new PaletteState();
  const machineCtx = {};
  createWhiteStage1Machine(cartridge.rom, palette, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  world.resetSpawn(ram, cartridge.rom, machineCtx);
  return { ...cartridge, ram, palette, machineCtx, world };
}

function spawnWhite24() {
  const fixture = createWhiteFixture();
  const { ram, rom, palette, machineCtx, world } = fixture;
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x01d0);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, world.tables, null, palette, null, world.resources,
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

function requestBytes(ram, address) {
  return Array.from({ length: 12 }, (_, index) => ram.u8(address + index));
}

test('White Type $24 owns five exact windows, palette install, and natural $1316EC route', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x24];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x24];
  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.subPrototype,
    black.palette.bank, black.palette.block, black.palette.site, black.palette.installer,
    black.motion.scrollCompensation, black.motion.velocity,
    black.draw.emitter, black.draw.fixedSprite, black.draw.spriteTable,
    black.draw.positionBias, black.draw.size, black.draw.palette,
    black.retirement.entry,
  ], [
    0x296fa8, 0x296fb0, 0x29700c, 0x296ff2,
    0x13, 0x222bf8, 0x296fc6, 0x24150a,
    0x24179e, 0x2417de,
    0x23dece, 0x0007e8ac, 0x2970d8,
    0xfdc00080, 0x1488, 0x13,
    0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.subPrototype,
    white.palette.bank, white.palette.block, white.palette.site, white.palette.installer,
    white.motion.scrollCompensation, white.motion.velocity,
    white.draw.emitter, white.draw.fixedSprite, white.draw.spriteTable,
    white.draw.positionBias, white.draw.size, white.draw.palette,
    white.retirement.entry,
  ], [
    0x1959de, 0x1959e6, 0x195a42, 0x195a28,
    0x13, 0x122bf8, 0x1959fc, 0x141844,
    0x141ad8, 0x141b18,
    0x13e21c, 0x0007e8ac, 0x195b0e,
    0xfdc00080, 0x1488, 0x13,
    0x1627dc,
  ]);
  assertDeepFrozen(black);
  assertDeepFrozen(white);
  assert.throws(() => requireType24Resources({ ...white }, 'white'),
    /canonical frozen edition descriptor/);
  assert.throws(() => requireType24Resources(black, 'white'),
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

  assert.deepEqual(tables.editions.whiteLabel.stage1Type24, {
    init: {
      start: '$1959DE', end: '$195A42',
      sha256: 'fb397f6e7ae41fadb713880902857925b8209f910900840060383e04abbc0b41',
    },
    handler: {
      start: '$195A42', end: '$195B0E',
      sha256: '9b0c498bdb4ac423f98908975732d06775dead684f4bcc7597a307da3814679b',
    },
  });
  assert.equal(TYPE24_WINDOWS.reduce((sum, window) => sum + window.len, 0), 0x00ac);
  const manifest = tables.editions.whiteLabel.worldRuntimeWindows;
  for (const expected of TYPE24_WINDOWS) {
    assert.equal(manifest.filter((window) =>
      window.base === expected.base && window.len === expected.len).length, 1);
    const global = tables.rom.windows.filter((window) =>
      window.base === expected.base && window.len === expected.len);
    assert.equal(global.length, 1);
    assert.equal(global[0].hex.length, expected.len * 2);
    assert.match(global[0].why, /^White A /);
    assert.ok(Number.parseInt(expected.base.slice(1), 16) + expected.len <= 0x200000);
  }

  const fixture = spawnWhite24();
  const { ram, rom, reads, palette, machineCtx, world } = fixture;
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x01, 0xd0, 0x00, 0x00, 0x24, 0x01, 0x00, 0x96,
  ]);
  assert.equal(rom.u16(0x131838), 0x0c28);
  assert.deepEqual(Array.from(rom.bytes(MOVEMENT, 8)), [
    0x40, 0x00, 0x5a, 0xc0, 0xc0, 0x04, 0x37, 0x70,
  ]);
  assert.deepEqual([rom.u32(0x1669bc), rom.u32(0x1669c0)],
    [white.initStub, white.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u8(REC + 0x0c), ram.u32(REC + 0x06),
    ram.u32(REC + 0x12), ram.u32(REC + 0x4c),
    ram.u16(REC + 0x18), ram.u16(REC + 0x1a),
    ram.u16(REC + 0x1c), ram.u16(REC + 0x1e),
    ram.u16(SUB), ram.u32(SUB + 0x02),
    ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b),
  ], [
    0x8000, 0x24, SUB,
    MOVEMENT + 6, white.handler,
    0, 0,
    0x0120, 0,
    0x8000, 0x420052c0,
    0x04, 0x37,
  ]);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
  assert.equal(palette.installCount, 1);
  const paletteStage = PALSTAGE.spr.stage + white.palette.bank * 64;
  assert.deepEqual(
    Array.from({ length: 64 }, (_, index) => ram.u8(paletteStage + index)),
    Array.from(rom.bytes(white.palette.block, 64)),
  );
  assert.deepEqual(machineCtx.unportedLog.report(), []);
  for (const address of [
    SOURCE, 0x131838, MOVEMENT, 0x1669bc,
    white.initStub + 2, white.subPrototype, white.palette.block,
  ]) assertRead(reads, address);
  assertWholeWhiteReads(fixture);
});

test('White Type $24 performs its native transition, two draws, and 32-bit tail bias', () => {
  const fixture = spawnWhite24();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x24];
  const bucket = BUCKETS[0];
  ram.setU16(bucket.counter, 0);
  ram.setU32(SUB + 0x02, 0x1234fff0);
  ram.setU8(SUB + 0x1a, 0);
  ram.setU8(SUB + 0x1b, 0);
  ram.setU16(REC + 0x18, 0);
  ram.setU16(REC + 0x1a, 0);
  ram.setU16(REC + 0x1c, 1);
  ram.setU16(REC + 0x1e, 0);
  ram.setU16(0x8130d2, 0);
  ram.setU16(0x813172, 0);
  reads.length = 0;

  runHandler(descriptor.handler, ram, rom, REC,
    handlerContext(fixture), world.resources);

  assert.deepEqual([
    ram.u16(REC + 0x18), ram.u16(REC + 0x1a),
    ram.u16(REC + 0x1c), ram.u16(REC + 0x1e),
    ram.u16(SUB + 0x1a), ram.u16(bucket.counter),
  ], [0x0004, 0x0000, 0x0708, 0x0001, 0x0537, 24]);
  const first = encodeRegisterRequest(
    0x1234fff0, descriptor.draw.fixedSprite,
    descriptor.draw.size, descriptor.draw.palette,
  );
  const tailPosition = (0x1234fff0 + descriptor.draw.positionBias) >>> 0;
  assert.equal(tailPosition, 0x0ff50070,
    'the low-half carry reaches the high half of the packed position');
  const selectedArt = rom.u32(descriptor.draw.spriteTable + 4);
  const second = encodeRegisterRequest(
    tailPosition, selectedArt, descriptor.draw.size, descriptor.draw.palette,
  );
  assert.deepEqual(requestBytes(ram, bucket.buffer), Array.from(first));
  assert.deepEqual(requestBytes(ram, bucket.buffer + 12), Array.from(second));
  assertRead(reads, descriptor.draw.emitter);
  assertRead(reads, descriptor.draw.spriteTable + 4);

  const frozenState = [
    ram.u32(SUB + 0x02), ram.u16(SUB + 0x1a), ram.u16(REC + 0x18),
    ram.u16(REC + 0x1a), ram.u16(REC + 0x1c), ram.u16(REC + 0x1e),
  ];
  ram.setU16(0x8130d2, 1);
  runHandler(descriptor.handler, ram, rom, REC,
    handlerContext(fixture), world.resources);
  assert.deepEqual([
    ram.u32(SUB + 0x02), ram.u16(SUB + 0x1a), ram.u16(REC + 0x18),
    ram.u16(REC + 0x1a), ram.u16(REC + 0x1c), ram.u16(REC + 0x1e),
  ], frozenState);
  assert.equal(ram.u16(bucket.counter), 48,
    'freeze preserves both native draw requests while suppressing state updates');
  assertWholeWhiteReads(fixture);
});

test('White Type $24 ignores damage ownership and retires only at its signed boundary', () => {
  const live = spawnWhite24();
  const descriptor = live.world.resources.enemyTypes[0x24];
  const bucket = BUCKETS[0];
  live.ram.setU16(bucket.counter, 0);
  live.ram.setU16(0x8130d2, 0);
  live.ram.setU16(0x813172, 0);
  live.ram.setU32(SUB + 0x02, 0x4000e000);
  live.ram.setU8(SUB, 0x98);
  live.ram.setU16(SUB + 0x18, 0xffff);
  live.ram.setU8(SUB + 0x1a, 0);
  const kills = [], effects = [], sounds = [], bullets = [];
  runHandler(descriptor.handler, live.ram, live.rom, REC, handlerContext(live, {
    killEvent: (...args) => kills.push(args),
    effectSpawn: (...args) => effects.push(args),
    soundPost: (...args) => sounds.push(args),
    bulletSpawn: (...args) => bullets.push(args),
  }), live.world.resources);

  assert.equal(live.ram.u16(REC), 0x8000,
    'signed $E000 remains above the native $DE00 retirement boundary');
  assert.deepEqual([
    live.ram.u32(LEDGER.p1.pendingEnd - 4),
    live.ram.u32(LEDGER.p2.pendingEnd - 4),
  ], [0, 0]);
  assert.deepEqual([kills, effects, sounds, bullets], [[], [], [], []]);
  assert.equal(live.ram.u16(bucket.counter), 24);
  for (const absent of ['score', 'effects', 'sound', 'fireGate', 'bullet']) {
    assert.equal(Object.hasOwn(descriptor, absent), false);
  }
  assertWholeWhiteReads(live);

  const retired = spawnWhite24();
  retired.ram.setU16(bucket.counter, 0);
  retired.ram.setU16(0x8130d2, 0);
  retired.ram.setU16(0x813172, 0);
  retired.ram.setU32(SUB + 0x02, 0x4000de00);
  retired.ram.setU8(SUB + 0x1a, 0);
  retired.reads.length = 0;
  runHandler(descriptor.handler, retired.ram, retired.rom, REC,
    handlerContext(retired), retired.world.resources);
  assert.deepEqual([retired.ram.u16(REC), retired.ram.u8(SUB)], [0, 1]);
  assert.equal(retired.ram.u16(bucket.counter), 0,
    'retirement occurs before either draw request');
  assertWholeWhiteReads(retired);
});
