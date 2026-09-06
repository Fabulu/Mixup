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
  BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES, requireType09Resources,
} from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

const SOURCE = 0x13154c;
const MOVEMENT = 0x131a16;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const QUEUE_7_BYTES = 0x80afc8;
const QUEUE_3_BYTES = 0x80afc6;
const TYPE09_WINDOWS = Object.freeze([
  Object.freeze({ base: '$1668E4', len: 0x0008 }),
  Object.freeze({ base: '$169804', len: 0x0008 }),
  Object.freeze({ base: '$1698A6', len: 0x0016 }),
  Object.freeze({ base: '$1698BC', len: 0x001c }),
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
  'every White Type $09 cartridge read stays below $200000');
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

function spawnWhite09() {
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
  ram.setU16(world.resources.spawn.distanceClock, 0x01a4);
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

function isolateHandler(fixture, {
  cooldown = 0x20, mirror = 1, phaseCounter = 0x40, speed = 0,
} = {}) {
  const { ram } = fixture;
  ram.setU32(REC + 0x12, 0);
  ram.setU8(REC + 0x16, 1);
  ram.setU8(REC + 0x18, cooldown);
  ram.setU8(REC + 0x1a, 0);
  ram.setU8(REC + 0x22, 0x0d);
  ram.setU8(REC + 0x23, 0x12);
  ram.setU8(REC + 0x24, phaseCounter);
  ram.setU8(REC + 0x25, 2);
  ram.setU16(REC + 0x26, 0);
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

test('White Type $09 owns its descriptors, four windows, and natural $13154C route', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x09];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x09];
  const white11 = WHITE_WORLD_RESOURCES.enemyTypes[0x11];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.recordPrototype, black.subPrototype,
    black.animation, black.sprite, black.armBArt, black.muzzle,
    black.emitters.record, black.emitters.armA, black.emitters.armB,
    black.effectSite, black.initAim.typeBit5, black.initAim.target,
    black.bullet.entry, black.bullet.site, black.sound.death, black.retirement.entry,
  ], [
    0x26a78c, 0x26a794, 0x26a860,
    0x26a82e, 0x26a844,
    0x269bb6, 0x269e48, 0x269ec8, 0x269f48,
    0x23d852, 0x23df86, 0x23df58,
    0x26a894, 0x242a80, 0x24202c,
    0x2814ac, 0x26a93e, 0x28c2a8, 0x263762,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.recordPrototype, white.subPrototype,
    white.animation, white.sprite, white.armBArt, white.muzzle,
    white.emitters.record, white.emitters.armA, white.emitters.armB,
    white.effectSite, white.initAim.typeBit5, white.initAim.target,
    white.bullet.entry, white.bullet.site, white.sound.death, white.retirement.entry,
  ], [
    0x169804, 0x16980c, 0x1698d8,
    0x1698a6, 0x1698bc,
    0x168c2e, 0x168ec0, 0x168f40, 0x168fc0,
    0x13dba0, 0x13e2d4, 0x13e2a6,
    0x16990c, 0x142dd0, 0x142366,
    0x1804f8, 0x1699b6, 0x18adce, 0x1627dc,
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
  assert.throws(() => requireType09Resources({ ...white }, 'white'),
    /canonical frozen edition descriptor/);
  assert.throws(() => requireType09Resources(black, 'white'),
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

  assert.deepEqual(tables.editions.whiteLabel.stage1Type09, {
    init: {
      start: '$169804', end: '$1698D8',
      sha256: 'fd0daf32b411dac85eb2581b6bb45f13ea969a800fb7ce9404397be837ea7f92',
    },
    handler: {
      start: '$1698D8', end: '$169A40',
      sha256: '1a3ebad7c89aacd72fed85ecaf740add68358e04016e4092b51776cb034659d2',
    },
  });
  assert.equal(TYPE09_WINDOWS.reduce((sum, window) => sum + window.len, 0), 0x42);
  const manifest = tables.editions.whiteLabel.worldRuntimeWindows;
  for (const expected of TYPE09_WINDOWS) {
    assert.equal(manifest.filter((window) =>
      window.base === expected.base && window.len === expected.len).length, 1);
    const global = tables.rom.windows.filter((window) =>
      window.base === expected.base && window.len === expected.len);
    assert.equal(global.length, 1);
    assert.equal(global[0].hex.length, expected.len * 2);
    assert.match(global[0].why, /^White A /);
    assert.ok(Number.parseInt(expected.base.slice(1), 16) + expected.len <= 0x200000);
  }

  const { ram, rom, reads, machineCtx, world } = spawnWhite09();
  assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
    0x01, 0xa4, 0x00, 0x1a, 0x09, 0x00, 0x00, 0x23,
  ]);
  assert.equal(rom.u16(0x131752), 0x01c4);
  assert.deepEqual(Array.from(rom.bytes(MOVEMENT, 20)), [
    0x77, 0x80, 0x04, 0x00, 0x89, 0x01, 0x20, 0x00, 0x66, 0x40,
    0x4e, 0x80, 0xc0, 0x03, 0x2d, 0x00, 0x7a, 0x80, 0x3b, 0x80,
  ]);
  assert.deepEqual([rom.u32(0x1668e4), rom.u32(0x1668e8)],
    [white.initStub, white.handler]);
  assert.deepEqual([
    ram.u16(REC), ram.u8(REC + 0x0c), ram.u32(REC + 0x06),
    ram.u32(REC + 0x12), ram.u32(REC + 0x4c),
    ram.u8(REC + 0x18), ram.u8(REC + 0x22), ram.u8(REC + 0x23),
    ram.u16(REC + 0x24), ram.u16(REC + 0x26),
    ram.u32(SUB + 0x02), ram.u16(SUB + 0x18),
    ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b), ram.u8(SUB + 0x1d),
  ], [
    0x8000, 0x09, SUB,
    MOVEMENT + 6, white.handler,
    0x28, 0x00, 0x27,
    0x0102, 0,
    0x77803000, 0x0020,
    0x1d, 0x20, 0x0b,
  ]);
  const index = ((ram.u8(SUB + 0x1b) + 1) & 0x3e) * 2;
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(white.sprite + index));
  assert.equal(ram.u32(REC + 0x2c), rom.u32(white.armBArt + index));
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
  assert.deepEqual(machineCtx.unportedLog.report(), []);
  for (const address of [
    SOURCE, 0x131752, MOVEMENT, 0x1668e4,
    white.initStub + 2, white.recordPrototype, white.subPrototype,
    white.sprite + index, white.armBArt + index,
    white.aim64.ops, white.aim64.base, white.aim64.lut,
  ]) assertRead(reads, address);
  assertWhiteOnly(reads);
});

test('White Type $09 transitions, draws both native arms, and fires a continuing kind $0D bullet', () => {
  const transition = spawnWhite09();
  const descriptor = transition.world.resources.enemyTypes[0x09];
  isolateHandler(transition, { phaseCounter: 0, speed: 1 });
  transition.reads.length = 0;
  runHandler(descriptor.handler, transition.ram, transition.rom, REC,
    handlerContext(transition), transition.world.resources);

  assert.deepEqual([
    transition.ram.u16(REC + 0x26), transition.ram.u16(REC + 0x24),
    transition.ram.u16(REC + 0x18), transition.ram.u8(REC + 0x1a),
    transition.ram.u8(SUB + 0x1a), transition.ram.u8(SUB + 0x1b),
  ], [1, 2, 0x3008, 0x30, 0, 0x0d]);
  assert.equal(transition.ram.u16(QUEUE_7_BYTES), 24,
    'record and ARM-A emitters each queue one native request');
  assert.equal(transition.ram.u16(QUEUE_3_BYTES), 0);
  for (const address of [
    descriptor.emitters.record, descriptor.emitters.armA,
    descriptor.animation, descriptor.sprite + 0x24, descriptor.armBArt + 0x24,
  ]) assertRead(transition.reads, address);
  assertWhiteOnly(transition.reads);

  const firing = spawnWhite09();
  isolateHandler(firing, { cooldown: 1, mirror: 0 });
  firing.reads.length = 0;
  firing.ram.setU16(0x8103e8, 0x7000);
  firing.ram.setU16(0x8103ea, 0x7000);
  const calls = [];
  const ctx = handlerContext(firing, {
    bulletSpawn: (site, result) => calls.push({ site, result }),
  });
  runHandler(descriptor.handler, firing.ram, firing.rom, REC, ctx,
    firing.world.resources);

  assert.equal(firing.ram.u16(QUEUE_7_BYTES), 12);
  assert.equal(firing.ram.u16(QUEUE_3_BYTES), 12,
    'record and ARM-B emitters each queue one native request');
  assert.deepEqual(calls.map(({ site }) => site), [descriptor.bullet.site]);
  assert.deepEqual(calls.map(({ result }) => result.length), [1]);
  const bullet = bulletAddress(calls[0].result[0]);
  assert.equal(firing.ram.u16(bullet + BULLET_REC.typeWord), 0x810d);
  assert.equal(firing.ram.u16(bullet + BULLET_REC.graphic), 0x0418);
  assert.equal(firing.ram.u16(bullet + BULLET_REC.attribute), 0x001a);
  assert.equal(firing.ram.u8(bullet + BULLET_REC.speed), 0x14);
  const direction = firing.ram.u8(bullet + BULLET_REC.origDir) >> 2;
  const muzzleIndex = u16((u16(direction + 1) & 0x3e) * 2);
  assert.equal(firing.ram.u32(bullet + BULLET_REC.posA),
    (firing.rom.u32(descriptor.muzzle + muzzleIndex) + 0x40002000) >>> 0);

  runWhiteBulletDriver({ ram: firing.ram, rom: firing.rom });
  assert.equal(firing.ram.u32(bullet + BULLET_REC.continuation), 0x181932);
  assert.equal(firing.ram.u16(bullet + BULLET_REC.typeWord), 0x800d);
  const beforeContinuation = firing.ram.u32(bullet + BULLET_REC.posA);
  runWhiteBulletDriver({ ram: firing.ram, rom: firing.rom });
  assert.notEqual(firing.ram.u16(bullet + BULLET_REC.typeWord) & TYPEBIT.alive, 0);
  assert.notEqual(firing.ram.u32(bullet + BULLET_REC.posA), beforeContinuation);
  assert.equal(firing.ram.u32(bullet + BULLET_REC.continuation), 0x181932);
  assert.deepEqual(ctx.unported.report(), []);
  for (const address of [
    descriptor.emitters.record, descriptor.emitters.armB,
    descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
    descriptor.fireGate.boxD3, descriptor.fireGate.boxD2,
    descriptor.muzzle + muzzleIndex,
    descriptor.bullet.templatePtrs + 4 * 13,
  ]) assertRead(firing.reads, address);
  assertWhiteOnly(firing.reads);
});

test('White Type $09 lethal P2 damage credits only P2 and uses native cleanup', () => {
  const fixture = spawnWhite09();
  const { ram, rom, reads, world } = fixture;
  const descriptor = world.resources.enemyTypes[0x09];
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
