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
import { createInitBodyMap, runInitBodyAddr } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';
import { runEnemyFrame } from '../src/enemyframe.js';
import { aim64AtTarget } from '../src/aim.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

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
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x27];
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x27);
  ram.setU8(REC + 0x0d, flags);
  ram.setU32(REC + 0x12, 0);
  ram.setU8(REC + 0x18, 0);
  ram.setU8(REC + 0x23, 0);
  ram.setU16(REC + 0x26, 0);
  ram.setU32(REC + 0x2c, rom.u32(descriptor.armBArt));
  ram.setU32(REC + 0x4c, descriptor.handler);

  ram.setU8(SUB, subFlags);
  ram.setU32(SUB + 0x02, 0x40002000);
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
    'the private Type $27 path never reads a Build B cartridge root');
}

test('Type $27 descriptors keep the edition identities isolated and frozen', () => {
  const black = BLACK_WORLD_RESOURCES.enemyTypes[0x27];
  const white = WHITE_WORLD_RESOURCES.enemyTypes[0x27];
  const white11 = WHITE_WORLD_RESOURCES.enemyTypes[0x11];

  assert.deepEqual([
    black.initStub, black.initBody, black.handler,
    black.initAim.typeBit5, black.initAim.target,
    black.bullet.entry, black.bullet.site, black.effectSite,
  ], [
    0x26a1e2, 0x26a1ea, 0x26a2e2,
    0x242a80, 0x24202c,
    0x2814ac, 0x26a4aa, 0x269d1e,
  ]);
  assert.deepEqual([
    white.initStub, white.initBody, white.handler,
    white.initAim.typeBit5, white.initAim.target,
    white.bullet.entry, white.bullet.coreA, white.bullet.templatePtrs,
    white.bullet.site, white.sound.death,
  ], [
    0x16925a, 0x169262, 0x16935a,
    0x142dd0, 0x142366,
    0x1804f8, 0x180502, 0x18093e,
    0x169522, 0x18adce,
  ]);
  assert.equal(black.initAim.translated, false,
    'the public Black route keeps its existing fallback behavior');
  assert.equal(white.initAim.translated, true,
    'only the private White descriptor enables the newly translated init aim');
  assert.equal(white.score, white11.score);
  assert.equal(white.effects, white11.effects);
  assert.equal(white.aim64, white11.aim64);
  assert.equal(white.fireGate, white11.fireGate);
  assert.deepEqual(white.bullet.supportedKinds, [12, 13]);
  for (const descriptor of [black, white]) {
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor.initAim), true);
    assert.equal(Object.isFrozen(descriptor.bullet), true);
  }

  const staticBodies = createInitBodyMap();
  const whiteBodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes);
  assert.equal(staticBodies.has(0x26a1ea), true);
  assert.equal(staticBodies.has(0x169262), false);
  assert.equal(whiteBodies.has(0x169262), true);
  assert.equal(whiteBodies.has(0x26a1ea), false,
    'the private init registry rejects the foreign Black Type $27 body');
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(0x26a2e2), true);
  assert.equal(handlerMap(BLACK_WORLD_RESOURCES).has(0x16935a), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(0x26a2e2), false);
  assert.equal(handlerMap(WHITE_WORLD_RESOURCES).has(0x16935a), true);
});

test('the static Black Type $27 initializer keeps its legacy fallback state', () => {
  const rom = new RomWindows(tables.rom);
  const ram = new Ram(undefined, BLACK_LABEL_PROFILE.ramLayout);
  const descriptor = BLACK_WORLD_RESOURCES.enemyTypes[0x27];
  const unported = new UnportedLog();
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x27);

  runInitBodyAddr(descriptor.initBody, ram, rom, REC, unported);

  assert.equal(ram.u8(REC + 0x23), 0x20);
  assert.deepEqual(unported.report(), [
    '      1 x $242A80 $242A80 aim (type-bit-5) in damage-first init '
      + '$26A1EA -- writes to record sprite fields, not a done-when stat',
  ]);
});

test('White Type $27 leaves its aim tables unread when both players are dead', () => {
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  let materialized = false;
  const aimed = aim64AtTarget(() => {
    materialized = true;
    throw new Error('dead-player aim must return before loading cartridge tables');
  }, ram, REC, SUB);

  assert.deepEqual(aimed, { dir: 0, carry: true });
  assert.equal(materialized, false);
});

test('White Type $27 initializes from its native source, mirrors X, and aims at P1', () => {
  const source = 0x130d2c;
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const resources = WHITE_WORLD_RESOURCES;
  const descriptor = resources.enemyTypes[0x27];
  const unported = new UnportedLog();

  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x1000);
  ram.setU16(0x810448, 0x8000);
  ram.setU16(0x81044c, 0x3000);
  resetAndInstallStage26331E(ram, rom, unported, null, null, resources);
  ram.setU32(resources.spawn.liveCursor, source);
  ram.setU16(resources.spawn.distanceClock, 0x0076);
  assert.deepEqual(runSpawnWalker(
    ram, rom, unported, null, null, null, null, resources,
  ), { script: 1, deferred: 0 });

  const sub = ram.u32(REC + 0x06);
  const heading = ram.u8(sub + 0x1b);
  const index = (heading & 0x3e) << 1;
  assert.equal(sub, SUB);
  assert.equal(ram.u8(REC + 0x0c), 0x27);
  assert.equal(ram.u16(REC + 0x0a), 0x0005);
  assert.equal(ram.u32(REC + 0x12), 0x131a1c);
  assert.equal(ram.u16(sub + 0x02), 0x7780);
  assert.equal(ram.u16(sub + 0x04), 0x3200,
    '$142DD0 mirrors native X $0600 around $1C00 when P1 is on the same side');
  assert.equal(heading, 0x20);
  assert.equal(ram.u8(REC + 0x22), 0x00);
  assert.equal(ram.u8(REC + 0x23), 0x28,
    '$142366 stores the live target aim instead of the no-player fallback $20');
  assert.equal(ram.u32(sub + 0x0a), rom.u32(descriptor.sprite + index));
  assert.equal(ram.u32(REC + 0x2c), rom.u32(descriptor.armBArt + index));
  assert.equal(ram.u16(sub), rom.u16(descriptor.subPrototype));
  assert.equal(ram.u8(sub + 0x1d), ram.u8(REC + 0x2a));
  assert.equal(unported.report().some((line) => line.includes('type-bit-5')), false);

  ram.setU8(REC + 0x03, 0x02);
  ram.setU32(REC + 0x12, 0x131a16);
  runInitBodyAddr(descriptor.initBody, ram, rom, REC, unported,
    null, null, null, createInitBodyMap(resources.enemyTypes), resources);
  assert.equal(ram.u16(SUB + 0x04), 0x3200,
    '$142DD6 tests only target bit 0, so target byte $02 still selects P1');

  for (const address of [
    descriptor.subPrototype, descriptor.recordPrototype,
    descriptor.sprite + index, descriptor.armBArt + index,
    descriptor.aim64.ops, descriptor.aim64.base, descriptor.aim64.lut,
  ]) {
    assert.equal(reads.some((read) => read.address === address), true,
      `missing Build A initialization read at $${address.toString(16)}`);
  }
  assertBuildAOnly(reads);
});

test('White Type $27 renders through both native emitter arms', () => {
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x27];

  for (const arm of ['A', 'B']) {
    const { ram, rom, reads, moveTables } = privateHandlerFixture({
      rank: arm === 'A' ? 1 : 0,
      mirror: arm === 'A' ? 1 : 0,
    });
    ram.setU16(0x8130d2, 1);
    ram.setU8(REC + 0x23, 0x06);
    runHandler(descriptor.handler, ram, rom, REC, {
      tables: moveTables,
      unported: new UnportedLog(),
    }, WHITE_WORLD_RESOURCES);

    const index = 0x0c;
    assert.equal(ram.u32(SUB + 0x0a), rom.u32(descriptor.sprite + index));
    assert.equal(ram.u32(REC + 0x2c), rom.u32(descriptor.armBArt + index));
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

test('White Type $27 adaptive fire uses its rank-zero, two-shot, and three-shot arms', () => {
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x27];
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

test('White Type $27 spawns and moves on its first integrated enemy frame', () => {
  const source = 0x130d2c;
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const ctx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, ctx);
  const world = ctx.stage1WorldPrivate;

  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x1000);
  ram.setU16(0x810448, 0x8000);
  ram.setU16(0x81044c, 0x3000);
  world.resetSpawn(ram, rom, ctx);
  ram.setU32(world.resources.spawn.liveCursor, source);
  ram.setU16(world.resources.spawn.distanceClock, 0x0076);

  assert.deepEqual(runEnemyFrame(
    ram,
    rom,
    { ...ctx, tables: world.tables },
    world.enemyHandlers,
    world.resources,
  ), { script: 1, deferred: 0, driven: 1 });

  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u8(REC + 0x0c), 0x27);
  assert.equal(ram.u32(REC + 0x12), 0x131a1c);
  assert.equal(ram.u16(SUB + 0x02), 0x763c,
    'the native speed $1D and heading $20 move Y by -$0144 on the spawn frame');
  assert.equal(ram.u16(SUB + 0x04), 0x3200);
  assert.equal(ram.u8(SUB + 0x1a), 0x1d);
  assert.equal(ram.u8(SUB + 0x1b), 0x20);
  assert.equal(ram.u8(REC + 0x16), 1);
  assert.equal(ram.u8(REC + 0x18), 0x27);
  assert.deepEqual(ctx.unportedLog.report(), []);
  assertBuildAOnly(reads);
});

test('White Type $27 survives a nonlethal P1 hit and credits its hit score', () => {
  const { ram, rom, reads, moveTables } = privateHandlerFixture();
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x27];
  ram.setU8(SUB, 0x10);
  ram.setU16(SUB + 0x18, 0x0005);
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

  assert.equal(ram.u16(REC), 0x8000, 'the enemy record remains active');
  assert.equal(ram.u8(SUB), 0, 'the consumed P1 damage flag is cleared');
  assert.equal(ram.u16(SUB + 0x18), 0x0005, 'positive HP survives the damage receipt');
  assert.equal(ram.u32(0x81b4c0), 0x00000001, 'the live P1 hit credits one point');
  assert.equal(ram.u8(SUB + 0x1d), 0x26, 'the hit frame uses the emitter XOR palette');
  assert.deepEqual(effects, []);
  assert.deepEqual(sounds, []);
  assert.deepEqual(kills, []);
  assertBuildAOnly(reads);
});

test('White Type $27 credits P1, allocates its death effect, sounds, and retires', () => {
  const { rom, reads } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x27];
  seedHandler(ram, rom);
  ram.setU8(SUB, 0x10);
  ram.setU32(SUB + 0x02, 0x12345678);
  ram.setU16(SUB + 0x18, 0x8001);
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
  assert.equal(ram.u16(REC), 0, 'the enemy record is retired');
  assert.equal(ram.u8(SUB), 1, 'the owned damage sub-record is retired');
  assert.equal(ram.u32(0x81b4c0), 0x00000009,
    'the real P1 receipt credits one hit point and packed-BCD kill score $08');
  assert.deepEqual(kills, [[0x08, 0x10]]);
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
});

test('the static Black Type $27 handler keeps its original frozen draw behavior', () => {
  const rom = new RomWindows(tables.rom);
  const ram = new Ram(undefined, BLACK_LABEL_PROFILE.ramLayout);
  const descriptor = BLACK_WORLD_RESOURCES.enemyTypes[0x27];
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x27);
  ram.setU8(REC + 0x23, 0x06);
  ram.setU16(SUB + 0x18, 0x0100);
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU16(SUB + 0x0e, 0x0410);
  ram.setU16(0x80390c, 0);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813098, 1);
  ram.setU16(0x8130d2, 1);

  runHandler(descriptor.handler, ram, rom, REC, {
    tables: null,
    unported: new UnportedLog(),
  });

  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u32(SUB + 0x0a), rom.u32(descriptor.sprite + 0x0c));
  assert.equal(ram.u32(REC + 0x2c), rom.u32(descriptor.armBArt + 0x0c));
  assert.equal(ram.u16(QUEUE_7_BYTES), 12);
  assert.equal(ram.u16(QUEUE_3_BYTES), 0);
});
