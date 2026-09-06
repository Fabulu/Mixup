import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Aim256Tables, aim256 } from '../src/aim.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC, TPL } from '../src/bullets.js';
import { B, POOL_B } from '../src/effects.js';
import { CUE } from '../src/cues.js';
import { DMG } from '../src/damage.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { runSpawnWalker } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { resolveZoomStub } from '../src/spritequeue.js';
import { UnportedLog } from '../src/unported.js';
import {
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType82Resources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x13106c;
const MOVEMENT = 0x131c76;
const CUE_SCRIPT = 0x1737fc;
const CUE_END = 0x173818;
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

const numericWindows = tables.rom.windows.map(({ base, len }) => ({
  start: typeof base === 'string' ? parseInt(base.replace('$', ''), 16) : base,
  end: (typeof base === 'string' ? parseInt(base.replace('$', ''), 16) : base) + len,
}));

function assertWholeWhiteReads(reads) {
  for (const read of reads) {
    assert.ok(read.address >= 0 && read.end <= 0x200000,
      `White Type $82 ${read.method} escaped Build A at $${read.address.toString(16)}`);
    assert.ok(numericWindows.some(({ start, end }) =>
      read.address >= start && read.end <= end),
    `White Type $82 ${read.method} at $${read.address.toString(16)} crossed a window seam`);
  }
}

function assertRead(reads, address) {
  assert.equal(reads.some((read) => read.address === address), true,
    `missing White cartridge read at $${address.toString(16)}`);
}

function assertNoRead(reads, address) {
  assert.equal(reads.some((read) => read.address === address), false,
    `unexpected White cartridge read at $${address.toString(16)}`);
}

function assertPrimaryAimReads(reads, descriptor) {
  for (const address of [
    descriptor.aim256.lut, descriptor.aim256.base, descriptor.aim256.ops,
  ]) assertRead(reads, address);
  for (const address of [
    descriptor.aim64.lut, descriptor.aim64.base, descriptor.aim64.ops,
  ]) assertNoRead(reads, address);
}

function createWhiteFixture() {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  return { ram, rom, reads, machineCtx, world };
}

function spawnWhite82(player = { y: 0x3000, x: 0x2000 }) {
  const fixture = createWhiteFixture();
  const { ram, rom, machineCtx, world } = fixture;
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU16(DMG.p1rec + 0x02, player.y);
  ram.setU16(DMG.p1rec + 0x04, player.x);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x00e3);
  runSpawnWalker(ram, rom, machineCtx.unportedLog, null, null, null, null,
    world.resources);
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

function isolateHandler(ram, cue = CUE_END) {
  ram.setU32(REC + 0x12, 0);
  ram.setU32(REC + 0x44, cue);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU8(REC + 0x16, 1);
  ram.setU32(0x8130d2, 0);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813172, 0);
}

const descriptorWindows = [
  { base: '$173676', len: 0x0008 },
  { base: '$173794', len: 0x0070 },
  { base: '$1737FC', len: 0x001e },
  { base: '$17D4D4', len: 0x0008 },
];

test('Type $82 owns canonical edition descriptors and exact White executable evidence', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x82];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x82];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler, black.bullet.entry,
    black.emitters.zoomScale, black.sound.death, black.retirement.entry,
  ], [0x274622, 0x27462a, 0x2747c6, 0x281484, 0x23e54a, 0x28c274, 0x263762]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.palette,
    white.recordPrototype, white.subPrototype, white.aimSprite, white.muzzle,
    white.bullet.entry, white.bullet.site, white.emitters.zoom,
    white.emitters.zoomScale, white.emitters.heading, white.emitters.alternate,
    white.alternateSprite, white.sound.death, white.retirement.entry,
  ], [
    0x173676, 0x17367e, 0x17381a, 0x17379e,
    0x1737a8, 0x1737c4, 0x171e4e, 0x1722ce,
    0x1804d0, 0x173b20, 0x13df18,
    0x13e898, 0x13e2d4, 0x13e2a6,
    0x173810, 0x18ad9a, 0x1627dc,
  ]);
  assert.deepEqual(white.effectSites, [0x173b54, 0x173b82]);
  assert.deepEqual([
    black.aim256.entry, black.primaryFan.aimCore,
    black.primaryFan.baseD0, black.primaryFan.plus4D0,
    black.primaryFan.plus4.entry, black.primaryFan.spreadTwo.entry,
    white.aim256.entry, white.primaryFan.aimCore,
    white.primaryFan.baseD0, white.primaryFan.plus4D0,
    white.primaryFan.plus4.entry, white.primaryFan.spreadTwo.entry,
  ], [
    0x2422a2, 0x2422a2, 0x0003000c, 0xfffd000d, 0x281708, 0x281764,
    0x1425d0, 0x1425dc, 0x0005000c, 0xffff000d, 0x180746, 0x180782,
  ]);
  assert.deepEqual(white.primaryFan.plus4.sites,
    [0x17397e, 0x17398c, 0x1739ce, 0x1739dc]);
  assert.deepEqual(white.primaryFan.spreadTwo.sites, [0x173996, 0x1739e6]);
  assert.deepEqual([
    white.score.capTable, white.score.refillTable,
    white.effects.poolBTableA, white.effects.poolBTableB,
    white.effects.poolBAllocator,
  ], [0x18692e, 0x186932, 0x121520, 0x121630, 0x187b40]);
  for (const value of [black, white, white.aim64, white.aim256, white.primaryFan,
    white.primaryFan.plus4, white.primaryFan.plus4.sites,
    white.primaryFan.spreadTwo, white.primaryFan.spreadTwo.sites, white.bullet,
    white.score, white.cues, white.effects, white.effectSites, white.emitters,
    white.sound, white.retirement]) {
    assert.equal(Object.isFrozen(value), true);
  }

  assert.deepEqual(tables.editions.whiteLabel.stage1Type82, {
    init: {
      start: '$173676', end: '$17381A',
      sha256: '32a2859d0e0c79a09c0e8e5569b516cea97470865a271800ff0a0f974d4b9f9b',
    },
    handler: {
      start: '$17381A', end: '$173BC0',
      sha256: 'c871a325f02618695ad45556fb92121229d0220176cd9b0546495f14f6725b65',
    },
  });
  for (const expected of descriptorWindows) {
    assert.equal(tables.editions.whiteLabel.worldRuntimeWindows.some((window) =>
      window.base === expected.base && window.len === expected.len), true);
  }

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
  assert.throws(() => requireType82Resources({ ...white }, 'white'),
    /canonical frozen edition descriptor/);
});

test('natural $13106C spawn follows the White auxiliary, dispatch, and initializer route', () => {
  const { ram, rom, reads, machineCtx, world } = spawnWhite82({ y: 0x1000, x: 0x6000 });
  const descriptor = world.resources.enemyTypes[0x82];

  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x00, 0xe3, 0x00, 0x0e, 0x82, 0x00, 0x00, 0x3f,
  ]);
  assert.deepEqual([rom.u16(0x13178a), rom.u16(0x13178c)], [0x0424, 0x0456]);
  assert.deepEqual([rom.u32(0x17d4d4), rom.u32(0x17d4d8)],
    [descriptor.initStub, descriptor.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u16(REC + 0x04), ram.u8(REC + 0x0c),
    ram.u32(REC + 0x06), ram.u32(REC + 0x12),
    ram.u32(REC + 0x44), ram.u32(REC + 0x4c),
  ], [0x8000, 1, 0x82, SUB, MOVEMENT + 8, CUE_SCRIPT, descriptor.handler]);
  assert.deepEqual([
    ram.u32(SUB + 0x0a), ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b),
    ram.u16(SUB + 0x18), ram.u16(SUB + 0x38),
    ram.u8(SUB + 0x1d), ram.u8(REC + 0x1c), ram.u8(REC + 0x1d),
  ], [0x1735fc, 0x18, 0x20, 0x0200, 0x0200, 0x0c, 0x0c, 0x13]);
  assert.notEqual(ram.u8(REC + 0x2d), ram.u8(SUB + 0x1b),
    'the native $142344 aim replaces the movement-heading fallback while P1 is alive');
  assert.equal(ram.u32(REC + 0x28),
    rom.u32(descriptor.aimSprite + ((ram.u8(REC + 0x2d) & 0x3e) * 2)));
  assert.deepEqual(machineCtx.unportedLog.report(), []);

  for (const address of [
    SOURCE, 0x13178a, 0x13178c, MOVEMENT, 0x17d4d4,
    descriptor.initStub + 2, descriptor.subPrototype, descriptor.recordPrototype,
    descriptor.palette, descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
    descriptor.aimSprite + ((ram.u8(REC + 0x2d) & 0x3e) * 2),
  ]) assertRead(reads, address);
  assertWholeWhiteReads(reads);
});

test('White Type $82 advances its cue, aims, draws all emitters, and fires kind $07', () => {
  const fixture = spawnWhite82();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x82];
  isolateHandler(ram, CUE_SCRIPT);
  reads.length = 0;
  ram.setU16(SUB + 0x18, 0x015e);
  ram.setU16(SUB + 0x38, 0x015e);
  ram.setU8(REC + 0x1e, 2);
  ram.setU8(REC + 0x22, 0);
  ram.setU8(REC + 0x24, 1);
  ram.setU8(REC + 0x25, 1);
  ram.setU8(REC + 0x26, 0);
  ram.setU8(REC + 0x2f, 5);
  ram.setU16(REC + 0x2c, 0);
  ram.setU16(0x80390c, 1);
  const calls = [];
  const ctx = handlerContext(fixture, {
    bulletSpawn: (site, result) => calls.push({ site, result }),
  });

  runHandler(descriptor.handler, ram, rom, REC, ctx, world.resources);

  assert.equal(ram.u16(CUE.count), 1);
  assert.equal(ram.u32(REC + 0x44), CUE_SCRIPT + 14);
  assert.deepEqual(resolveZoomStub(rom, descriptor.emitters.zoom,
    descriptor.emitters.zoomScale), { bucket: 7 });
  assert.deepEqual([ram.u16(QUEUE_7_BYTES), ram.u16(QUEUE_3_BYTES)], [24, 12]);
  assert.deepEqual([
    ram.u32(QUEUE_7 + 4), ram.u32(QUEUE_7 + 16), ram.u32(QUEUE_3 + 4),
  ], [ram.u32(SUB + 0x0a), ram.u32(REC + 0x28), descriptor.alternateSprite]);
  const facing = ram.u16(REC + 0x2c);
  assert.notEqual(facing, 0);
  const spriteAddress = descriptor.aimSprite + ((facing & 0x3e) * 2);
  assert.equal(ram.u32(REC + 0x28), rom.u32(spriteAddress));
  assert.equal(descriptor.bullet.entry, 0x1804d0);
  assert.deepEqual(calls, [{
    site: descriptor.bullet.site,
    result: [{ carry: false, slot: 0, addr: BUL.pool, declined: false }],
  }]);
  assert.equal(ram.u16(BUL.pool + BULLET_REC.typeWord), 0x8107);
  assert.deepEqual(ctx.unported.report(), []);

  const muzzle = descriptor.muzzle + ((facing & 0x3e) * 2);
  for (const address of [
    CUE_SCRIPT, descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
    spriteAddress, descriptor.emitters.zoom, descriptor.emitters.heading,
    descriptor.emitters.alternate, muzzle,
    descriptor.bullet.templatePtrs + 4 * 7,
    descriptor.bullet.spawnInitPtrs + 4 * 7,
  ]) assertRead(reads, address);
  assertWholeWhiteReads(reads);
});

test('White Type $82 fires both native primary-fan branches with P2 selection and fallback', () => {
  const runPrimary = ({ stage, salvo, targetP2 }) => {
    const fixture = spawnWhite82();
    const { ram, rom, reads, world } = fixture;
    const descriptor = world.resources.enemyTypes[0x82];
    isolateHandler(ram);
    reads.length = 0;
    ram.setU16(0x813092, stage);
    ram.setU16(0x813098, 1);
    ram.setU8(REC + 0x03, 1);
    ram.setU8(REC + 0x1e, 0);
    ram.setU8(REC + 0x20, salvo);
    ram.setU8(REC + 0x21, salvo);
    ram.setU8(REC + 0x22, 1);
    ram.setU8(REC + 0x26, 1);
    if (targetP2) {
      ram.setU16(DMG.p2rec, 0x8000);
      ram.setU16(DMG.p2rec + 0x02, 0x1000);
      ram.setU16(DMG.p2rec + 0x04, 0x6000);
    } else {
      ram.setU16(DMG.p2rec, 0);
    }
    const target = targetP2 ? DMG.p2rec : DMG.p1rec;
    const aimTables = new Aim256Tables(new RomWindows(tables.rom), descriptor.aim256);
    const selfY = ram.u16(SUB + 0x02);
    const selfX = ram.u16(SUB + 0x04);
    const expectedAim = [
      aim256(aimTables, (selfY + 0xf7c0) & 0xffff, (selfX + 0xfac0) & 0xffff,
        ram.u16(target + 0x02), ram.u16(target + 0x04)),
      aim256(aimTables, (selfY + 0xf7c0) & 0xffff, (selfX + 0x0500) & 0xffff,
        ram.u16(target + 0x02), ram.u16(target + 0x04)),
    ];
    const calls = [];
    const ctx = handlerContext(fixture, {
      bulletSpawn: (site, result) => calls.push({ site, result }),
    });
    runHandler(descriptor.handler, ram, rom, REC, ctx, world.resources);
    return { fixture, descriptor, calls, ctx, expectedAim };
  };

  const spread = runPrimary({ stage: 2, salvo: 1, targetP2: false });
  assert.deepEqual([
    spread.fixture.ram.u8(REC + 0x30), spread.fixture.ram.u8(REC + 0x31),
  ], spread.expectedAim, 'a dead nominated P2 falls back to the live P1 for both origins');
  assert.deepEqual(spread.calls.map(({ site }) => site),
    spread.descriptor.primaryFan.spreadTwo.sites);
  assert.deepEqual(spread.calls.map(({ result }) => result.length), [2, 2]);
  const spreadDirs = [
    spread.expectedAim[0] - 8, spread.expectedAim[0] + 8,
    spread.expectedAim[1] - 8, spread.expectedAim[1] + 8,
  ].map((value) => value & 0xff);
  const spreadPositions = [0x37c01ac0, 0x37c01ac0, 0x37c02500, 0x37c02500];
  const spreadBullet = spread.descriptor.primaryFan.spreadTwo;
  const spreadTemplate = spread.fixture.rom.u32(spreadBullet.templatePtrs + 4 * 12);
  const spreadSpeed = (spread.fixture.rom.u16(spreadTemplate + TPL.baseSpeed) + 5
    + spread.fixture.ram.u16(spreadBullet.speedBias1)
    + spread.fixture.ram.u16(spreadBullet.speedBias2)) & 0xff;
  for (let slot = 0; slot < 4; slot++) {
    const bullet = BUL.pool + slot * BUL.stride;
    assert.equal(spread.fixture.ram.u16(bullet) & 0x3f, 12);
    assert.equal(spread.fixture.ram.u16(bullet) & 0x0200, 0x0200);
    assert.equal(spread.fixture.ram.u8(bullet + BULLET_REC.dir), spreadDirs[slot]);
    assert.equal(spread.fixture.ram.u8(bullet + BULLET_REC.speed), spreadSpeed);
    assert.equal(spread.fixture.ram.u32(bullet + BULLET_REC.posA), spreadPositions[slot]);
  }
  assert.equal(spread.fixture.ram.u8(REC + 0x20), 0);
  assert.equal(spread.fixture.ram.u8(REC + 0x1e), spread.fixture.ram.u8(REC + 0x2e));
  assert.deepEqual(spread.ctx.unported.report(), []);
  assertPrimaryAimReads(spread.fixture.reads, spread.descriptor);
  assertWholeWhiteReads(spread.fixture.reads);

  const plus4 = runPrimary({ stage: 3, salvo: 0, targetP2: true });
  assert.deepEqual([
    plus4.fixture.ram.u8(REC + 0x30), plus4.fixture.ram.u8(REC + 0x31),
  ], plus4.expectedAim, 'a live nominated P2 owns both Aim256 target coordinates');
  assert.deepEqual(plus4.calls.map(({ site }) => site),
    plus4.descriptor.primaryFan.plus4.sites);
  assert.deepEqual(plus4.calls.map(({ result }) => result.length), [1, 1, 1, 1]);
  const plusDirs = [
    plus4.expectedAim[0] + 2, plus4.expectedAim[0] + 7,
    plus4.expectedAim[1] - 2, plus4.expectedAim[1] - 7,
  ].map((value) => value & 0xff);
  const plusPositions = [0x37c01ac0, 0x37c01ac0, 0x37c02500, 0x37c02500];
  const plusBullet = plus4.descriptor.primaryFan.plus4;
  const plusTemplate = plus4.fixture.rom.u32(plusBullet.templatePtrs + 4 * 13);
  const baseSpeed = plus4.fixture.rom.u16(plusTemplate + TPL.baseSpeed)
    + plus4.fixture.ram.u16(plusBullet.speedBias1)
    + plus4.fixture.ram.u16(plusBullet.speedBias2);
  const plusSpeeds = [baseSpeed + 3, baseSpeed + 1, baseSpeed + 3, baseSpeed + 1]
    .map((value) => value & 0xff);
  for (let slot = 0; slot < 4; slot++) {
    const bullet = BUL.pool + slot * BUL.stride;
    assert.equal(plus4.fixture.ram.u16(bullet) & 0x3f, 13);
    assert.equal(plus4.fixture.ram.u16(bullet) & 0x0200, 0x0200);
    assert.equal(plus4.fixture.ram.u8(bullet + BULLET_REC.dir), plusDirs[slot]);
    assert.equal(plus4.fixture.ram.u8(bullet + BULLET_REC.speed), plusSpeeds[slot]);
    assert.equal(plus4.fixture.ram.u32(bullet + BULLET_REC.posA), plusPositions[slot]);
  }
  assert.equal(plus4.fixture.ram.u8(REC + 0x20), 0);
  assert.equal(plus4.fixture.ram.u8(REC + 0x1e),
    (0x70 - plus4.fixture.ram.u16(0x8130b2) - 4) & 0xff);
  assert.deepEqual(plus4.ctx.unported.report(), []);
  assertPrimaryAimReads(plus4.fixture.reads, plus4.descriptor);
  assertWholeWhiteReads(plus4.fixture.reads);
});

test('White Type $82 lethal P2 ownership uses native score, effects, sound, and retirement', () => {
  const fixture = spawnWhite82();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x82];
  isolateHandler(ram);
  reads.length = 0;
  ram.setU8(SUB + 0x20, ram.u8(SUB + 0x20) | 0x08);
  ram.setU16(SUB + 0x18, 0x8001);
  ram.setU16(SUB + 0x38, 0x8001);
  const kills = [];
  const effects = [];
  const sounds = [];

  runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture, {
    killEvent: (...args) => kills.push(args),
    effectSpawn: (...args) => effects.push(args),
    soundPost: (address) => sounds.push(address),
  }), world.resources);

  assert.deepEqual(kills, [[0x42, 0x08]]);
  assert.deepEqual([ram.u32(0x81b4c0), ram.u32(0x81b4c4)], [0, 0x43]);
  assert.deepEqual(effects.map(([kind, site, , allocator]) => [kind, site, allocator]), [
    [0x0d, descriptor.effectSites[0], descriptor.effects.poolBAllocator],
    [0x08, descriptor.effectSites[1], descriptor.effects.poolBAllocator],
  ]);
  assert.deepEqual(sounds, [descriptor.sound.death]);
  assert.equal(ram.u16(REC), 0);
  assert.deepEqual([ram.u8(SUB), ram.u8(SUB + 0x20)], [1, 1]);
  for (let i = 0; i < 2; i++) {
    const effect = POOL_B.base + i * POOL_B.stride;
    assert.equal(ram.u16(effect + B.status), 0x8000 | (i === 0 ? 0x0d : 0x08));
    assert.equal(ram.u32(effect + B.pos), 0x40002000);
    assert.equal(ram.u16(effect + B.bucket), 0x0010);
    assert.equal(ram.u32(effect + B.nudge), 0xf6000000);
    assert.equal(ram.u16(effect + B.sub12), 1);
    assert.equal(ram.u16(effect + B.sub14), 0x0400);
  }
  assert.equal(ram.u16(POOL_B.base + POOL_B.stride + B.speed), 0x0680);
  assert.equal(ram.u8(POOL_B.base + POOL_B.stride + B.f1c), 0x40);
  assertRead(reads, descriptor.score.capTable);
  assertRead(reads, descriptor.score.refillTable);
  assertWholeWhiteReads(reads);
});
