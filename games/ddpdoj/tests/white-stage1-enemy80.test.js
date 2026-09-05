import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { BUL, REC as BULLET_REC } from '../src/bullets.js';
import { B, POOL_B } from '../src/effects.js';
import { CUE } from '../src/cues.js';
import { DMG } from '../src/damage.js';
import { createInitBodyMap } from '../src/initbody.js';
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

const SOURCE = 0x130e64;
const MOVEMENT = 0x1318ba;
const REC = ENEMY.bandCommon;
const SUB = 0x81459c;
const QUEUE_7_BYTES = 0x80afc8;
const QUEUE_7 = 0x807450;
const QUEUE_3_BYTES = 0x80afc6;
const QUEUE_3 = 0x80688c;
const CUE_SCRIPT = 0x1729da;
const CUE_END = 0x172a12;

const u16 = (value) => value & 0xffff;

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
  assert.deepEqual(reads.filter(({ address, end }) => address >= 0x200000 || end > 0x200000), [],
    'every White Type $80 runtime cartridge read stays below $200000');
}

function seedPlayers(ram) {
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU16(DMG.p1rec + 0x02, 0x7000);
  ram.setU16(DMG.p1rec + 0x04, 0x3000);
  ram.setU16(DMG.p2rec, 0x8000);
  ram.setU16(DMG.p2rec + 0x02, 0x6000);
  ram.setU16(DMG.p2rec + 0x04, 0x1000);
}

function createWhiteWorldFixture() {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  return { ram, rom, reads, machineCtx, world };
}

function spawnWhite80() {
  const fixture = createWhiteWorldFixture();
  const { ram, rom, machineCtx, world } = fixture;
  seedPlayers(ram);
  world.resetSpawn(ram, rom, machineCtx);
  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, 0x00a8);
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

function isolateHandler(ram, { frozen = true } = {}) {
  ram.setU32(REC + 0x12, 0);
  ram.setU32(REC + 0x44, CUE_END);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU8(REC + 0x16, 1);
  ram.setU16(REC + 0x36, 0x8000);
  ram.setU32(0x8130d2, frozen ? 1 : 0);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813172, 0);
}

function applyDamage(ram, mask, hp) {
  ram.setU8(SUB, ram.u8(SUB) | (mask & 0x10));
  ram.setU8(SUB + 0x20, ram.u8(SUB + 0x20) | (mask & 0x08));
  ram.setU16(SUB + 0x18, hp);
  ram.setU16(SUB + 0x38, hp);
}

test('Type $80 descriptors keep Black and White identities isolated and frozen', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x80];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x80];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.bullet.wide.entry, black.bullet.narrow.entry, black.bullet.laser.entry,
    black.sound.death,
  ], [0x2737fa, 0x273802, 0x2739c0, 0x2817b8, 0x2817a8, 0x281484, 0x28c2dc]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler, white.palette,
    white.recordPrototype, white.subPrototype, white.aimSprite, white.muzzle,
    white.fan.wideTable, white.fan.narrowTable,
    white.bullet.wide.entry, white.bullet.narrow.entry, white.bullet.laser.entry,
    white.sound.death, white.retirement.entry,
  ], [
    0x17284e, 0x172856, 0x172a14, 0x172976,
    0x172980, 0x1729a2, 0x171fce, 0x1724ce,
    0x17264e, 0x17274e,
    0x1807a0, 0x180790, 0x1804d0,
    0x18ae02, 0x1627dc,
  ]);
  assert.deepEqual(white.effectSites,
    [0x172e16, 0x172e3e, 0x172e72, 0x172eaa, 0x172ee2, 0x172f1c]);
  assert.deepEqual([
    white.bullet.wide.supportedKinds,
    white.bullet.narrow.supportedKinds,
    white.bullet.laser.supportedKinds,
  ], [[4, 5], [4, 5], [19]]);
  for (const value of [black, white, black.fan, white.fan, black.bullet, white.bullet,
    black.bullet.wide, black.bullet.narrow, black.bullet.laser,
    white.bullet.wide, white.bullet.narrow, white.bullet.laser,
    black.effectSites, white.effectSites]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const blackBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(blackBodies.has(black.initBody), true);
  assert.equal(blackBodies.has(white.initBody), false);
  assert.equal(whiteBodies.has(white.initBody), true);
  assert.equal(whiteBodies.has(black.initBody), false);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(black.handler), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(white.handler), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(white.handler), true);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(black.handler), false);
});

test('Type $80 validates ordinary retirement before entering movement', () => {
  const fixture = spawnWhite80();
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
  const invalidDescriptor = {
    ...descriptor,
    retirement: { ...descriptor.retirement, semantic: 'markOnly' },
  };
  const resources = {
    ...WHITE_WORLD_RESOURCES,
    enemyTypes: { ...WHITE_WORLD_RESOURCES.enemyTypes, 0x80: invalidDescriptor },
  };
  fixture.ram.setU32(REC + 0x12, 0x00deadbe);

  assert.throws(() => runHandler(descriptor.handler,
    fixture.ram, fixture.rom, REC, handlerContext(fixture), resources),
  /type-\$80 requires ordinary freeEnemy retirement/);
  assert.equal(fixture.ram.u16(REC), 0x8000);
});

test('Type $80 rejects missing edition aim tables before entering movement', () => {
  const fixture = spawnWhite80();
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
  const invalidDescriptor = { ...descriptor, aim64: null, aim256: null };
  const resources = {
    ...WHITE_WORLD_RESOURCES,
    enemyTypes: { ...WHITE_WORLD_RESOURCES.enemyTypes, 0x80: invalidDescriptor },
  };
  fixture.ram.setU32(REC + 0x12, 0x00deadbe);

  assert.throws(() => runHandler(descriptor.handler,
    fixture.ram, fixture.rom, REC, handlerContext(fixture), resources),
  /type-\$80 requires edition-bound aim64 and aim256 tables/);
  assert.equal(fixture.ram.u16(REC), 0x8000);
  assertWhiteOnly(fixture.reads);
});

test('White high-table row resolves Type $80 to its native init and handler',
  () => {
    const { rom, reads } = trackedCartridge();
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
    assert.equal(WHITE_WORLD_RESOURCES.spawn.high.table, 0x17d4c4);
    assert.equal(rom.u32(0x17d4c4), descriptor.initStub);
    assert.equal(rom.u32(0x17d4c8), descriptor.handler);
    assertWhiteOnly(reads);
  });

test('White Type $80 initializes from native source and performs both turret aims',
  () => {
    const { ram, rom, reads, world } = spawnWhite80();
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];

    assert.deepEqual(Array.from(rom.bytes(SOURCE, 8)), [
      0x00, 0xa8, 0x00, 0x0c, 0x80, 0x00, 0x00, 0x0a,
    ]);
    assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
    assert.equal(ram.u16(REC), 0x8000);
    assert.equal(ram.u16(REC + 0x04), 1);
    assert.equal(ram.u32(REC + 0x06), SUB);
    assert.equal(ram.u16(REC + 0x0a), 0x000c);
    assert.equal(ram.u8(REC + 0x0c), 0x80);
    assert.equal(ram.u32(REC + 0x12), MOVEMENT + 8);
    assert.equal(ram.u32(REC + 0x44), CUE_SCRIPT);
    assert.equal(ram.u32(REC + 0x4c), descriptor.handler);
    assert.equal(ram.u8(SUB + 0x1a), 0x08);
    assert.equal(ram.u8(SUB + 0x1b), 0x20);
    assert.equal(ram.u16(SUB), 0xa001);
    assert.equal(ram.u16(SUB + 0x20), 0xa001);

    const left = ram.u16(REC + 0x2c);
    const right = ram.u16(REC + 0x32);
    const aimArtReads = reads.filter(({ method, address }) => method === 'u32'
      && address >= descriptor.aimSprite && address < descriptor.aimSprite + 0x100);
    assert.equal(aimArtReads.length, 2,
      'the two authentic initializer aim calls each resolve one turret art pointer');
    assert.equal(ram.u32(REC + 0x28),
      rom.u32(descriptor.aimSprite + ((left & 0x3e) << 1)));
    assert.equal(ram.u32(REC + 0x2e),
      rom.u32(descriptor.aimSprite + ((right & 0x3e) << 1)));
    for (const address of [
      SOURCE, 0x17d4c4, MOVEMENT, descriptor.subPrototype,
      descriptor.recordPrototype, descriptor.palette,
      descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
    ]) {
      assert.equal(reads.some((read) => read.address === address), true,
        `missing White initialization read at $${address.toString(16)}`);
    }
    assertWhiteOnly(reads);
  });

test('White Type $80 moves and performs its complete first draw',
  () => {
    const fixture = spawnWhite80();
    const { ram, rom, reads, machineCtx, world } = fixture;
    ram.setU16(0x80390c, 1);
    ram.setU32(SUB + 0x02, 0x40002000);
    const before = ram.u32(SUB + 0x02);
    const velocity = world.tables.vector(ram.u8(SUB + 0x1a), ram.u8(SUB + 0x1b));

    assert.deepEqual(runEnemyFrame(
      ram, rom, { ...machineCtx, tables: world.tables },
      world.enemyHandlers, world.resources,
    ), { script: 0, deferred: 0, driven: 1 });

    assert.equal(ram.u16(SUB + 0x02), u16((before >>> 16) + velocity.dy));
    assert.equal(ram.u16(SUB + 0x04), u16((before & 0xffff) + velocity.dx));
    assert.equal(ram.u8(REC + 0x16), 1);
    assert.equal(ram.u16(QUEUE_7_BYTES), 36);
    assert.equal(ram.u16(QUEUE_3_BYTES), 12);
    assert.equal(ram.u32(QUEUE_7 + 4), ram.u32(SUB + 0x0a));
    assert.equal(ram.u32(QUEUE_7 + 16), ram.u32(REC + 0x28));
    assert.equal(ram.u32(QUEUE_7 + 28), ram.u32(REC + 0x2e));
    assert.equal(ram.u32(QUEUE_3 + 4), WHITE_WORLD_RESOURCES.enemyTypes[0x80].mirrorSprite);
    assert.deepEqual(machineCtx.unportedLog.report(), []);
    assertWhiteOnly(reads);
  });

for (const fan of [
  {
    name: 'wide eight-way', salvo: 1, count: 8,
    root: 0x1807a0, kind: 4, template: 0x180a20,
  },
  {
    name: 'narrow seven-way', salvo: 3, count: 7,
    root: 0x180790, kind: 5, template: 0x180a34,
  },
]) {
  test(`White Type $80 fires its ${fan.name} fan through the native callback root`,
    () => {
      const fixture = spawnWhite80();
      const { ram, rom, reads } = fixture;
      const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
      const bullet = fan.salvo === 1 ? descriptor.bullet.wide : descriptor.bullet.narrow;
      const vectorTable = fan.salvo === 1
        ? descriptor.fan.wideTable : descriptor.fan.narrowTable;
      isolateHandler(ram, { frozen: false });
      const origin = ram.u32(SUB + 0x02);
      ram.setU16(REC + 0x18, 0);
      ram.setU8(REC + 0x1e, 0);
      ram.setU8(REC + 0x20, fan.salvo);
      ram.setU8(REC + 0x22, 1);
      ram.setU8(REC + 0x26, 1);
      const callbacks = [];

      runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture, {
        bulletSpawn: (root, result) => callbacks.push({ root, result }),
      }), WHITE_WORLD_RESOURCES);
      const runtimeReads = reads.slice();

      assert.equal(callbacks.length, fan.count);
      assert.deepEqual(callbacks.map(({ root }) => root), Array(fan.count).fill(fan.root));
      assert.equal(rom.u32(bullet.templatePtrs + 4 * fan.kind), fan.template);
      assert.equal(rom.u32(bullet.spawnInitPtrs + 4 * fan.kind), 0x18089c);
      for (let i = 0; i < fan.count; i++) {
        const base = BUL.pool + i * BUL.stride;
        const direction = ram.u8(base + BULLET_REC.dir);
        const vectorAddress = vectorTable + ((direction + 2) & 0xfc);
        const delta = (rom.u32(vectorAddress) + 0xfe000000) >>> 0;
        const expectedPosition = ((u16((origin >>> 16) + (delta >>> 16)) << 16)
          | u16((origin & 0xffff) + (delta & 0xffff))) >>> 0;
        assert.deepEqual(callbacks[i].result, [{
          carry: false, slot: i, addr: base, declined: false,
        }]);
        assert.equal(ram.u16(base + BULLET_REC.typeWord) & 0x3f, fan.kind);
        assert.equal(ram.u32(base + BULLET_REC.posA), expectedPosition);
        assert.equal(ram.u32(base + BULLET_REC.param28), delta);
        assert.equal(ram.u32(base + BULLET_REC.param2c), 0);
        assert.equal(ram.u8(base + BULLET_REC.param34), 0);
        assert.equal(runtimeReads.some(({ method, address }) =>
          method === 'u32' && address === vectorAddress), true,
        `missing native ${fan.name} vector read at $${vectorAddress.toString(16)}`);
      }
      assertWhiteOnly(reads);
    });
}

test('White Type $80 alternates turret facings and art on consecutive aim cadences',
  () => {
    const fixture = spawnWhite80();
    const { ram, rom, reads } = fixture;
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
    isolateHandler(ram, { frozen: false });
    ram.setU16(REC + 0x18, 0);
    ram.setU8(REC + 0x1e, 1);
    ram.setU8(REC + 0x24, 0);
    ram.setU8(REC + 0x25, 0);
    ram.setU8(REC + 0x26, 0);
    ram.setU8(REC + 0x27, 1);
    ram.setU16(REC + 0x2c, 0);
    ram.setU16(REC + 0x32, 0);
    ram.setU8(SUB + 0x01, ram.u8(SUB + 0x01) & ~0x40);

    runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture),
      WHITE_WORLD_RESOURCES);
    const left = ram.u16(REC + 0x2c);
    assert.equal(ram.u8(SUB + 0x01) & 0x40, 0x40);
    assert.notEqual(left, 0);
    assert.equal(ram.u16(REC + 0x32), 0);
    assert.equal(ram.u32(REC + 0x28),
      rom.u32(descriptor.aimSprite + ((left & 0x3e) << 1)));

    ram.setU8(REC + 0x1e, 1);
    ram.setU8(REC + 0x26, 0);
    runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture),
      WHITE_WORLD_RESOURCES);
    const right = ram.u16(REC + 0x32);
    assert.equal(ram.u8(SUB + 0x01) & 0x40, 0);
    assert.notEqual(right, 0);
    assert.equal(ram.u16(REC + 0x2c), left);
    assert.equal(ram.u32(REC + 0x2e),
      rom.u32(descriptor.aimSprite + ((right & 0x3e) << 1)));
    assertWhiteOnly(reads);
  });

test('White Type $80 laser pair spawns hexadecimal kind $13 with native init params',
  () => {
    const fixture = spawnWhite80();
    const { ram, rom, reads } = fixture;
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
    const bullet = descriptor.bullet.laser;
    isolateHandler(ram, { frozen: false });
    ram.setU16(REC + 0x18, 1);
    ram.setU8(REC + 0x22, 0);
    ram.setU8(REC + 0x24, 2);
    ram.setU8(REC + 0x26, 1);
    ram.setU16(REC + 0x2c, 0x04);
    ram.setU16(REC + 0x32, 0x20);
    const callbacks = [];

    runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture, {
      bulletSpawn: (root, result) => callbacks.push({ root, result }),
    }), WHITE_WORLD_RESOURCES);

    assert.deepEqual(callbacks.map(({ root }) => root), [0x1804d0, 0x1804d0]);
    assert.deepEqual(callbacks.map(({ result }) => result.length), [1, 1]);
    assert.equal(rom.u32(bullet.templatePtrs + 4 * 19), 0x180b24);
    assert.equal(rom.u32(bullet.spawnInitPtrs + 4 * 19), 0x1808c8);
    assert.equal(rom.u16(0x180b24) & 0x3f, 19);
    assert.notEqual(rom.u16(0x180b24 + 0x10), 0);

    for (let i = 0; i < 2; i++) {
      const base = BUL.pool + i * BUL.stride;
      const facing = i === 0 ? 0x04 : 0x20;
      const bias = i === 0 ? 0x0500 : 0xfb00;
      const muzzle = rom.u32(descriptor.muzzle + ((facing & 0x3e) << 1));
      const delta = ((u16((muzzle >>> 16) + 0x0680) << 16)
        | u16((muzzle & 0xffff) + bias)) >>> 0;
      assert.equal(ram.u16(base + BULLET_REC.typeWord), 0x8113);
      assert.equal(ram.u8(base + BULLET_REC.speed), 0x16);
      assert.equal(ram.u8(base + BULLET_REC.dir), (facing << 2) & 0xff);
      assert.equal(ram.u32(base + BULLET_REC.param28), delta);
      assert.equal(ram.u32(base + BULLET_REC.param2c), 0);
      assert.equal(ram.u8(base + BULLET_REC.param34), 0);
    }
    for (const address of [bullet.templatePtrs + 4 * 19, 0x180b24,
      bullet.spawnInitPtrs + 4 * 19]) {
      assert.equal(reads.some((read) => read.address === address), true,
        `missing kind-$13 cartridge read at $${address.toString(16)}`);
    }
    assertWhiteOnly(reads);
  });

test('White Type $80 advances all four native cue thresholds',
  () => {
    const fixture = spawnWhite80();
    const { ram, rom, reads } = fixture;
    const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
    isolateHandler(ram);
    ram.setU32(REC + 0x44, CUE_SCRIPT);
    const thresholds = [0x0992, 0x0785, 0x0578, 0x036b];

    for (let i = 0; i < thresholds.length; i++) {
      ram.setU16(SUB + 0x18, thresholds[i]);
      ram.setU16(SUB + 0x38, thresholds[i]);
      runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture),
        WHITE_WORLD_RESOURCES);
      assert.equal(ram.u32(REC + 0x44), CUE_SCRIPT + (i + 1) * 14);
      assert.equal(ram.u16(CUE.count), i + 1);
    }
    assert.equal(rom.u16(ram.u32(REC + 0x44)), 0xffff);
    assertWhiteOnly(reads);
  });

test('White Type $80 preserves P1, P2, and combined nonlethal ownership',
  () => {
    for (const expected of [
      { mask: 0x10, p1: 1, p2: 0 },
      { mask: 0x08, p1: 0, p2: 1 },
      { mask: 0x18, p1: 1, p2: 1 },
    ]) {
      const fixture = spawnWhite80();
      const { ram, rom, reads } = fixture;
      isolateHandler(ram);
      applyDamage(ram, expected.mask, 0x0500);

      runHandler(WHITE_WORLD_RESOURCES.enemyTypes[0x80].handler,
        ram, rom, REC, handlerContext(fixture), WHITE_WORLD_RESOURCES);

      assert.equal(ram.u16(REC), 0x8000);
      assert.equal(ram.u8(SUB) & 0x5c, 0);
      assert.equal(ram.u8(SUB + 0x20) & 0x5c, 0);
      assert.equal(ram.u16(SUB + 0x18), 0x0500);
      assert.equal(ram.u16(SUB + 0x38), 0x0500);
      assert.equal(ram.u32(0x81b4c0), expected.p1);
      assert.equal(ram.u32(0x81b4c4), expected.p2);
      assertWhiteOnly(reads);
    }
  });

test('White Type $80 lethal ownership creates six native effects, sound, and retirement',
  () => {
    const expectedEffects = [
      [0x0d, 0x172e16], [0x84, 0x172e3e], [0x84, 0x172e72],
      [0x0d, 0x172eaa], [0x0d, 0x172ee2], [0x85, 0x172f1c],
    ];
    for (const expected of [
      { mask: 0x10, p1: 0x84, p2: 0 },
      { mask: 0x08, p1: 0, p2: 0x84 },
      { mask: 0x18, p1: 0x84, p2: 0x84 },
    ]) {
      const fixture = spawnWhite80();
      const { ram, rom, reads } = fixture;
      const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x80];
      isolateHandler(ram);
      applyDamage(ram, expected.mask, 0x8001);
      const kills = [], effects = [], sounds = [];

      runHandler(descriptor.handler, ram, rom, REC, handlerContext(fixture, {
        killEvent: (...args) => kills.push(args),
        effectSpawn: (...args) => effects.push(args),
        soundPost: (address) => sounds.push(address),
      }), WHITE_WORLD_RESOURCES);

      assert.deepEqual(kills, [[0x83, expected.mask]]);
      assert.equal(ram.u32(0x81b4c0), expected.p1);
      assert.equal(ram.u32(0x81b4c4), expected.p2);
      assert.deepEqual(effects.map(([kind, site]) => [kind, site]), expectedEffects);
      assert.deepEqual(sounds, [0x18ae02]);
      assert.equal(ram.u16(REC), 0);
      assert.equal(ram.u8(SUB), 1);
      assert.equal(ram.u8(SUB + 0x20), 1);
      for (let i = 0; i < expectedEffects.length; i++) {
        const effect = POOL_B.base + i * POOL_B.stride;
        assert.equal(ram.u16(effect + B.status) & 0xff, expectedEffects[i][0]);
        assert.equal(ram.u32(effect + B.pos), 0x40002000);
        assert.equal(ram.u16(effect + B.bucket), 0x0010);
        assert.equal(ram.u16(effect + B.sub12), 1);
      }
      assertWhiteOnly(reads);
    }
  });

test('static Black Type $80 keeps all three native generator roots compatible',
  () => {
    const descriptor = BLACK_WORLD_RESOURCES.enemyTypes[0x80];
    const cases = [
      { mode: 'wide', count: 8, root: 0x2817b8 },
      { mode: 'narrow', count: 7, root: 0x2817a8 },
      { mode: 'laser', count: 2, root: 0x281484 },
    ];
    for (const expected of cases) {
      const { rom } = trackedCartridge();
      const ram = new Ram(undefined, BLACK_LABEL_PROFILE.ramLayout);
      const moveTables = new MoveTables(tables, rom);
      seedPlayers(ram);
      ram.setU16(REC, 0x8000);
      ram.setU16(REC + 0x04, 1);
      ram.setU32(REC + 0x06, SUB);
      ram.setU8(REC + 0x0c, 0x80);
      ram.setU32(REC + 0x12, 0);
      ram.setU8(REC + 0x16, 1);
      ram.setU32(REC + 0x44, 0x2739be);
      ram.setU32(REC + 0x4c, descriptor.handler);
      ram.setU16(REC + 0x36, 0x8000);
      ram.setU16(SUB, 0xa001);
      ram.setU16(SUB + 0x18, 0x0a00);
      ram.setU16(SUB + 0x38, 0x0a00);
      ram.setU32(SUB + 0x02, 0x40002000);
      ram.setU16(0x813092, 1);
      ram.setU16(0x813098, 0);
      ram.setU16(0x813172, 0);
      ram.setU32(0x8130d2, 0);
      ram.setU8(REC + 0x26, 1);
      if (expected.mode === 'wide' || expected.mode === 'narrow') {
        ram.setU16(REC + 0x18, 0);
        ram.setU8(REC + 0x1e, 0);
        ram.setU8(REC + 0x20, expected.mode === 'wide' ? 1 : 3);
        ram.setU8(REC + 0x22, 1);
      } else {
        ram.setU16(REC + 0x18, 1);
        ram.setU8(REC + 0x22, 0);
        ram.setU8(REC + 0x24, 2);
        ram.setU16(REC + 0x2c, 4);
        ram.setU16(REC + 0x32, 0x20);
      }
      const roots = [];

      runHandler(descriptor.handler, ram, rom, REC, {
        ram, rom, tables: moveTables, unported: new UnportedLog(),
        bulletSpawn: (root) => roots.push(root),
      }, BLACK_WORLD_RESOURCES);

      assert.deepEqual(roots, Array(expected.count).fill(expected.root));
      assert.equal(ram.u16(REC), 0x8000);
    }
  });
