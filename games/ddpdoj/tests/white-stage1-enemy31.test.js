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
import { BgVram } from '../src/background.js';
import { PaletteState, PALSTAGE } from '../src/palette.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import {
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType31Resources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x1316f4;
const AUX = 0x13182e;
const MOVEMENT = 0x1323f4;
const REC = ENEMY.bandCommon;
const SUB = 0x81521c;
const TYPE31_WINDOWS = Object.freeze([
  Object.freeze({ base: '$1250B8', len: 0x0040 }),
  Object.freeze({ base: '$1251B8', len: 0x0040 }),
  Object.freeze({ base: '$13FBE4', len: 0x0016 }),
  Object.freeze({ base: '$166A24', len: 0x0008 }),
  Object.freeze({ base: '$1687C4', len: 0x0008 }),
  Object.freeze({ base: '$168828', len: 0x0014 }),
  Object.freeze({ base: '$168846', len: 0x0028 }),
  Object.freeze({ base: '$168986', len: 0x0230 }),
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
      `White Type $31 ${read.method} escaped Build A at $${read.address.toString(16)}`);
    assert.ok(fixture.numeric.some(({ start, end }) =>
      read.address >= start && read.end <= end),
    `White Type $31 ${read.method} at $${read.address.toString(16)} crossed a window seam`);
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
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x01e1);
  const initSounds = [];
  assert.deepEqual(runSpawnWalker(
    ram, cartridge.rom, machineCtx.unportedLog, world.tables,
    null, palette, (address) => initSounds.push(address), world.resources,
  ), { script: 1, deferred: 0 });
  return { ...cartridge, ram, palette, machineCtx, world, initSounds };
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

test('White Type $31 follows its native spawn, palette, animation, sound, draw, and retirement route', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x31];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x31];
  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.recordPrototype, black.subPrototype, black.initHook,
    black.palette.installer,
    black.palette.first.bankTable, black.palette.first.block, black.palette.first.site,
    black.palette.second.bankTable, black.palette.second.block, black.palette.second.site,
    black.animationTable, black.draw.emitter, black.sound.cue, black.retirement.entry,
  ], [
    0x26974c, 0x269754, 0x2697f6,
    0x2697ce, 0x2697da, 0x28ca60,
    0x24150a,
    0x2697b0, 0x2251b8, 0x269792,
    0x2697ba, 0x2250b8, 0x2697a8,
    0x26990e, 0x23f896, 0x28c692, 0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.recordPrototype, white.subPrototype, white.initHook,
    white.palette.installer,
    white.palette.first.bankTable, white.palette.first.block, white.palette.first.site,
    white.palette.second.bankTable, white.palette.second.block, white.palette.second.site,
    white.animationTable, white.draw.emitter, white.sound.cue, white.retirement.entry,
  ], [
    0x1687c4, 0x1687cc, 0x16886e,
    0x168846, 0x168852, 0x18b586,
    0x141844,
    0x168828, 0x1251b8, 0x16880a,
    0x168832, 0x1250b8, 0x168820,
    0x168986, 0x13fbe4, 0x18b1b8, 0x1627dc,
  ]);
  assertDeepFrozen(black);
  assertDeepFrozen(white);
  assert.throws(() => requireType31Resources({ ...white }, 'white'),
    /canonical frozen edition descriptor/);
  assert.throws(() => requireType31Resources(black, 'white'),
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

  assert.deepEqual(tables.editions.whiteLabel.stage1Type31, {
    init: {
      start: '$1687C4', end: '$16886E',
      sha256: '91a2098c93051d8e0a93ba8cd6eea80653bafb7d2c0d4f10b5c0acd436965563',
    },
    handler: {
      start: '$16886E', end: '$168986',
      sha256: '9f55845d8135fff1a5265254d3c5bf311bbc5f7da8ed91d209ffa4cedc9e7a54',
    },
  });
  assert.equal(TYPE31_WINDOWS.reduce((sum, window) => sum + window.len, 0), 0x0312);
  const manifest = tables.editions.whiteLabel.worldRuntimeWindows;
  for (const expected of TYPE31_WINDOWS) {
    assert.equal(manifest.filter((window) =>
      window.base === expected.base && window.len === expected.len).length, 1);
    const global = tables.rom.windows.filter((window) =>
      window.base === expected.base && window.len === expected.len);
    assert.equal(global.length, 1);
    assert.equal(global[0].hex.length, expected.len * 2);
    assert.match(global[0].why, /^White A /);
    assert.ok(Number.parseInt(expected.base.slice(1), 16) + expected.len <= 0x200000);
  }

  const fixture = createWhiteFixture();
  const { ram, rom, reads, palette, machineCtx, world, initSounds } = fixture;
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x01, 0xe1, 0x00, 0x00, 0x31, 0x80, 0x00, 0x91,
  ]);
  assert.equal(rom.u16(AUX), 0x0ba2);
  assert.deepEqual([rom.u32(0x166a24), rom.u32(0x166a28)],
    [white.initStub, white.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u8(REC + 0x0c), ram.u32(REC + 0x06),
    ram.u32(REC + 0x12), ram.u32(REC + 0x4c),
    ram.u16(REC + 0x1c), ram.u16(REC + 0x1e), ram.u16(REC + 0x20),
    ram.u16(SUB), ram.u32(SUB + 0x02),
  ], [
    0x8000, 0x31, SUB,
    MOVEMENT, white.handler,
    0x0006, 0x0040, 0x0005,
    0x8000, 0x40001c00,
  ]);
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
  assert.equal(palette.installCount, 2);
  const paletteBanks = [
    [rom.u16(white.palette.first.bankTable), white.palette.first.block],
    [rom.u16(white.palette.second.bankTable), white.palette.second.block],
  ];
  assert.deepEqual(paletteBanks.map(([bank]) => bank), [0x0b, 0x0d]);
  for (const [bank, block] of paletteBanks) {
    const stage = PALSTAGE.spr.stage + bank * 64;
    assert.deepEqual(
      Array.from({ length: 64 }, (_, index) => ram.u8(stage + index)),
      Array.from(rom.bytes(block, 64)),
    );
  }
  assert.deepEqual(initSounds, [white.initHook]);
  assert.equal(white.initHook, 0x18b586, 'the init cue uses the native White wrapper');
  assert.deepEqual(machineCtx.unportedLog.report(), []);
  for (const address of [
    SOURCE, AUX, 0x166a24, white.initStub + 2,
    white.recordPrototype, white.subPrototype,
    white.palette.first.bankTable, white.palette.second.bankTable,
    white.palette.first.block, white.palette.second.block,
  ]) assertRead(reads, address);

  const emitter = resolveEmitStub(rom, white.draw.emitter);
  assert.deepEqual(emitter, { bucket: 21, conv: 'record' });
  ram.setU16(BUCKETS[emitter.bucket].counter, 0);
  ram.setU16(REC + 0x18, 0);
  ram.setU16(REC + 0x1a, 0x18);
  ram.setU16(REC + 0x1e, 0);
  ram.setU16(REC + 0x20, 1);
  ram.setU16(0x80390c, 0);
  reads.length = 0;
  const sounds = [];
  runHandler(white.handler, ram, rom, REC,
    handlerContext(fixture, { soundPost: (address) => sounds.push(address) }),
    world.resources);
  assert.deepEqual(sounds, [white.sound.cue]);
  assert.equal(white.sound.cue, 0x18b1b8, 'the cue uses the native White wrapper');
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(white.animationTable + 0x18));
  assert.equal(ram.u16(REC + 0x18), rom.u16(white.animationTable + 0x1c));
  assert.equal(ram.u16(REC + 0x1a), 0x20);
  assert.equal(ram.u16(SUB + 0x04), 0x1c00);
  assert.equal(ram.u16(BUCKETS[emitter.bucket].counter), 12);
  assertRead(reads, white.animationTable + 0x18);
  assertRead(reads, white.draw.emitter);

  ram.setU16(BUCKETS[emitter.bucket].counter, 0);
  ram.setU16(REC, 0x8000);
  ram.setU16(REC + 0x16, 2);
  ram.setU16(REC + 0x18, 0);
  ram.setU16(REC + 0x1a, 0x228);
  ram.setU16(REC + 0x20, 0);
  runHandler(white.handler, ram, rom, REC, handlerContext(fixture), world.resources);
  assert.deepEqual([ram.u16(REC), ram.u8(SUB)], [0, 1]);
  assert.equal(ram.u16(BUCKETS[emitter.bucket].counter), 0,
    'the final animation entry retires before drawing');
  assertWholeWhiteReads(fixture);
});
