import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { createInitBodyMap } from '../src/initbody.js';
import { handler1C, handlerMap, runHandler } from '../src/handlers.js';
import {
  REC as SCRIPT_REC, SPAWN, processDeferred, resolveMovementPtr, runSpawnWalker,
} from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { PaletteState, PALSTAGE } from '../src/palette.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { UnportedLog } from '../src/unported.js';
import { BUL, TYPEBIT } from '../src/bullets.js';
import { BULLET_DRIVER } from '../src/bulletdriver.js';
import { POOL_B } from '../src/effects.js';
import { BUCKETS } from '../src/spritequeue.js';
import { CUE } from '../src/cues.js';
import { ANIM_OBJECT } from '../src/animobjects.js';
import { handlerMidboss, MIDBOSS } from '../src/midboss.js';
import {
  BLACK_TYPE0D_RESOURCES, BLACK_TYPE1C_RESOURCES,
  WHITE_TYPE0D_RESOURCES, WHITE_TYPE1C_RESOURCES,
  requireType0DResources, requireType1CResources,
} from '../src/midboss-resources.js';
import { WHITE_WORLD_RESOURCES } from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));
const TYPE_0D = WHITE_TYPE0D_RESOURCES;
const TYPE_1C = WHITE_TYPE1C_RESOURCES;
const REC = ENEMY.bandCommon;
const SUB = SPAWN.SUB_SPECIAL;
const SOURCE = TYPE_0D.natural.source;
const { R, S, A } = MIDBOSS;
const arm = (n, sub = SUB) => sub + TYPE_0D.armBase + n * TYPE_0D.armStride;

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
  return { windows };
}

function trackedWhiteCartridge() {
  const reads = [];
  const source = new RomWindows(whiteCartridgeWindows());
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
  return { rom, reads };
}

function assertWhiteOnly(reads) {
  assert.deepEqual(reads.filter(({ address, end }) =>
    address < 0 || address >= 0x200000 || end > 0x200000), [],
  'every tracked White midboss cartridge read stays below $200000');
}

function createWorldFixture() {
  const { rom, reads } = trackedWhiteCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const palette = new PaletteState();
  const vram = new BgVram();
  const machineCtx = {};
  createWhiteStage1Machine(rom, palette, vram).step(ram, machineCtx);
  const world = machineCtx.stage1WorldPrivate;
  world.resetSpawn(ram, rom, machineCtx);
  return { ram, rom, reads, palette, vram, machineCtx, world };
}

function runtimeContext(fixture) {
  const spawns = [], kills = [], sounds = [];
  const unported = fixture.machineCtx.unportedLog ?? new UnportedLog();
  return {
    ctx: {
      ...fixture.machineCtx, ram: fixture.ram, rom: fixture.rom,
      tables: fixture.world.tables, vram: fixture.vram,
      unported, unportedLog: unported, notes: unported,
      bulletSpawn: (site, result) => spawns.push({ site, result }),
      killEvent: (d0, d1) => kills.push({ d0, d1 }),
      soundPost: (address) => sounds.push(address),
    },
    unported, spawns, kills, sounds,
  };
}

function recursivelyFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => recursivelyFrozen(child, seen));
}

function seedLiveMidboss(fixture) {
  const { ram } = fixture;
  ram.setU16(REC, 0x8000);
  ram.setU8(REC + 0x03, 0);
  ram.setU16(REC + 0x04, 0x10);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0c, 0x0d);
  ram.setU8(REC + 0x0d, 0x81);
  ram.setU32(REC + 0x4c, TYPE_0D.handler);
  ram.setU8(REC + R.onScreen, 1);
  ram.setU8(REC + R.hitFlags, 1);
  ram.setU32(SUB + S.posX, 0x40002000);
  ram.setU16(SUB + S.hp, 0x0100);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813096, 0);
  ram.setU16(0x813172, 0);
  for (let n = 0; n < TYPE_0D.armCount; n++) {
    ram.setU16(arm(n) + A.flags, 0x8000);
  }
  return REC;
}

function setPlayers(ram, p1Alive, p2Alive) {
  ram.setU16(TYPE_0D.players.p1, p1Alive ? 0x8000 : 0);
  ram.setU16(TYPE_0D.players.p1 + 2, 0x2800);
  ram.setU16(TYPE_0D.players.p1 + 4, 0x1800);
  ram.setU16(TYPE_0D.players.p2, p2Alive ? 0x8000 : 0);
  ram.setU16(TYPE_0D.players.p2 + 2, 0x6800);
  ram.setU16(TYPE_0D.players.p2 + 4, 0x5800);
}

function armFanFrame(ram, fanCtr) {
  ram.setU8(SUB + S.state, 2);
  ram.setU8(SUB + S.fanCtr, fanCtr);
  ram.setU8(SUB + S.fanCad, 0);
  ram.setU8(SUB + S.fanRel, 2);
  ram.setU8(REC + R.hitFlags, 1);
}

function liveBullets(ram) {
  const out = [];
  for (let slot = 0; slot < BUL.slots; slot++) {
    const at = BUL.pool + slot * BUL.stride;
    const type = ram.u16(at);
    if ((type & TYPEBIT.alive) !== 0) {
      out.push({ slot, kind: type & 0x3f, position: ram.u32(at + 0x02),
        speed: ram.u8(at + 0x1a), angle: ram.u8(at + 0x1b) });
    }
  }
  return out;
}

function bulletFingerprint(ram) {
  return liveBullets(ram).map(({ kind, position, speed, angle }) =>
    [kind, position, speed, angle]);
}

function changedVram(vram, before = new Uint16Array(vram.w.length)) {
  const cells = [];
  for (let i = 0; i < 1024; i++) {
    if (before[i * 2] !== vram.w[i * 2]
        || before[i * 2 + 1] !== vram.w[i * 2 + 1]) {
      cells.push({ row: i >>> 6, col: i & 63 });
    }
  }
  return cells;
}

test('White Type $0D/$1C descriptors, type rows, and maps are edition-bound', () => {
  assert.equal(requireType0DResources(TYPE_0D, 'white'), TYPE_0D);
  assert.equal(requireType1CResources(TYPE_1C, 'white'), TYPE_1C);
  for (const descriptor of [
    BLACK_TYPE0D_RESOURCES, BLACK_TYPE1C_RESOURCES, TYPE_0D, TYPE_1C,
  ]) assert.equal(recursivelyFrozen(descriptor), true);
  assert.notEqual(TYPE_0D, BLACK_TYPE0D_RESOURCES);
  assert.notEqual(TYPE_1C, BLACK_TYPE1C_RESOURCES);

  const { rom, reads } = trackedWhiteCartridge();
  for (const [type, descriptor] of [[0x0d, TYPE_0D], [0x1c, TYPE_1C]]) {
    const row = WHITE_WORLD_RESOURCES.spawn.low.table + type * 8;
    assert.equal(rom.u32(row), descriptor.initStub);
    assert.equal(rom.u32(row + 4), descriptor.handler);
  }
  const bodies = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes, 'white');
  const handlers = handlerMap(WHITE_WORLD_RESOURCES);
  assert.equal(bodies.has(TYPE_0D.initBody), true);
  assert.equal(bodies.has(TYPE_1C.initBody), true);
  assert.equal(bodies.has(BLACK_TYPE0D_RESOURCES.initBody), false);
  assert.equal(bodies.has(BLACK_TYPE1C_RESOURCES.initBody), false);
  assert.equal(handlers.has(TYPE_0D.handler), true);
  assert.equal(handlers.has(TYPE_1C.handler), true);
  assert.equal(handlers.has(BLACK_TYPE0D_RESOURCES.handler), false);
  assert.equal(handlers.has(BLACK_TYPE1C_RESOURCES.handler), false);
  assertWhiteOnly(reads);
});

test('cloned and cross-edition descriptors fail before side effects', () => {
  for (const [descriptor, handler, type] of [
    [TYPE_0D, handlerMidboss, 0x0d],
    [TYPE_1C, handler1C, 0x1c],
  ]) {
    const clone = Object.freeze({ ...descriptor });
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    ram.setU32(REC + 0x06, SUB);
    const before = Uint8Array.from(ram.b);
    let reads = 0;
    const rom = new Proxy({}, { get() { reads++; throw new Error('ROM touched'); } });
    assert.throws(() => handler(ram, rom, REC, { vram: new BgVram() }, clone), TypeError);
    assert.deepEqual(ram.b, before);
    assert.equal(reads, 0);
    assert.throws(() => createInitBodyMap({ [type]: clone }, 'white'), TypeError);
  }

  assert.throws(() => handlerMap({
    edition: 'white', enemyTypes: { 0x0d: BLACK_TYPE0D_RESOURCES },
  }), TypeError);
  assert.throws(() => handlerMap({
    edition: 'white', enemyTypes: { 0x1c: BLACK_TYPE1C_RESOURCES },
  }), TypeError);
});

test('natural White Type $0D uses the native masked $1040 route and initializes all direct state', () => {
  const fixture = createWorldFixture();
  const { ram, rom, reads, palette, machineCtx, world } = fixture;
  assert.equal(rom.u16(SOURCE), TYPE_0D.natural.triggerClock);
  assert.equal(rom.u8(SOURCE + SCRIPT_REC.type), 0x0d);
  assert.equal(rom.u8(SOURCE + SCRIPT_REC.flags), 0x81);
  assert.equal(rom.u16(SOURCE + SCRIPT_REC.idx), TYPE_0D.natural.auxiliary);
  assert.equal(resolveMovementPtr(
    ram, rom, SOURCE, machineCtx.unportedLog, world.resources,
  ), 0x131ca8, 'native andi.w #$0FFF masks $1040 to lookup index $0040');

  ram.setU32(world.resources.spawn.liveCursor, SOURCE);
  ram.setU16(world.resources.spawn.distanceClock, TYPE_0D.natural.triggerClock);
  assert.deepEqual(runSpawnWalker(
    ram, rom, machineCtx.unportedLog, world.tables, null, palette, null, world.resources,
  ), { script: 1, deferred: 0 });
  assert.equal(ram.u32(world.resources.spawn.liveCursor), SOURCE + 8);
  assert.equal(ram.u16(REC), 0x8000);
  assert.equal(ram.u16(REC + 0x04), 0x10);
  assert.equal(ram.u32(REC + 0x06), SUB);
  assert.equal(ram.u32(REC + 0x44), TYPE_0D.cueCursor);
  assert.equal(ram.u32(REC + 0x4c), TYPE_0D.handler);
  assert.equal(ram.u32(REC + 0x12), 0x131cac);
  assert.equal(ram.u32(SUB + S.posX), 0x8a401c00);
  assert.equal(ram.u8(0x803917), 4, 'arm initialization performs four RNG draws');
  assert.equal(ram.u16(0x8130d8), 1);
  assert.equal(ram.u16(0x8130da), 0);
  assert.deepEqual(Array.from({ length: 17 }, (_, n) => ram.u16(SUB + n * 0x20)),
    [0xa000, 0xa000, 0x8000, 0xa000, 0x8000, 0xa000, 0x8000, 0xa000, 0x8000,
      0xa000, 0x8000, 0xa000, 0x8000, 0xa000, 0x8000, 0xa000, 0x8000]);
  assert.deepEqual(Array.from({ length: 8 }, (_, n) => ram.u8(arm(n) + A.facing)),
    [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0]);
  assert.deepEqual(Array.from({ length: 8 }, (_, n) => ram.u8(arm(n) + A.spread)),
    [0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38]);
  assert.deepEqual(Array.from({ length: 8 }, (_, n) => ram.u32(arm(n) + A.posX)),
    [0x9aef1bfc, 0x9684252c, 0x8c452904, 0x82012531,
      0x7d911c03, 0x81fb12d3, 0x8c3a0efc, 0x967e12ce]);
  assert.equal(palette.installCount, 3);
  assert.deepEqual([...palette.installs.values()].map(({ bank }) => bank), [0x10, 0x11, 0x0f]);
  for (const { bank, block } of TYPE_0D.palettes.installs) {
    const at = PALSTAGE.spr.stage + bank * 64;
    assert.equal(ram.u16(at), rom.u16(block));
  }

  ram.setU16(SUB + S.hp, rom.u16(TYPE_0D.cueCursor));
  ram.setU16(0x8130d2, 1);
  const runtime = runtimeContext(fixture);
  runHandler(TYPE_0D.handler, ram, rom, REC, runtime.ctx, world.resources);
  assert.equal(ram.u32(REC + 0x44), TYPE_0D.cueCursor + 14);
  assert.equal(ram.u16(CUE.count), 1);
  assert.notEqual(ram.u16(CUE.base), 0);
  assert.equal(ram.u32(CUE.base + 0x10), SUB);
  assert.equal([...runtime.unported.calls.keys()].some((key) => key.startsWith('$18AC72 ')), false,
    'the White cue routine executes instead of leaving the obsolete note');
  assertWhiteOnly(reads);
});

test('White big fans route kinds $03/$04 and execute bank-b-spread-two', () => {
  const run = (fanCtr) => {
    const fixture = createWorldFixture();
    seedLiveMidboss(fixture);
    setPlayers(fixture.ram, true, false);
    armFanFrame(fixture.ram, fanCtr);
    const runtime = runtimeContext(fixture);
    runHandler(TYPE_0D.handler, fixture.ram, fixture.rom, REC,
      runtime.ctx, fixture.world.resources);
    assertWhiteOnly(fixture.reads);
    return { bullets: liveBullets(fixture.ram), spawns: runtime.spawns };
  };

  const even = run(2);
  assert.equal(even.bullets.length, 24);
  assert.deepEqual([...new Set(even.bullets.map(({ kind }) => kind))], [3]);
  assert.ok(even.spawns.some(({ site }) => site === 0x16aaa0));

  const odd = run(3);
  assert.equal(odd.bullets.length, 27);
  assert.deepEqual([...new Set(odd.bullets.map(({ kind }) => kind))].sort(), [3, 4]);
  assert.ok(odd.spawns.some(({ site }) => site === 0x16aa66));
  assert.ok(odd.spawns.some(({ site }) => site === 0x16aace));
  assert.equal(TYPE_0D.bullet.bigSpreadTwo.semantic, 'bank-b-spread-two');
});

test('White Type $0D targets P1/P2, falls back to the survivor, and suppresses both-dead fire', () => {
  const run = ({ owner, p1, p2 }) => {
    const fixture = createWorldFixture();
    seedLiveMidboss(fixture);
    fixture.ram.setU8(REC + 0x03, owner);
    setPlayers(fixture.ram, p1, p2);
    armFanFrame(fixture.ram, 2);
    const runtime = runtimeContext(fixture);
    runHandler(TYPE_0D.handler, fixture.ram, fixture.rom, REC,
      runtime.ctx, fixture.world.resources);
    assertWhiteOnly(fixture.reads);
    return { bullets: bulletFingerprint(fixture.ram), callbacks: runtime.spawns.length };
  };
  const p1 = run({ owner: 0, p1: true, p2: true });
  const p2 = run({ owner: 1, p1: true, p2: true });
  assert.notDeepEqual(p1.bullets, p2.bullets, 'the two target positions produce distinct vectors');
  assert.deepEqual(run({ owner: 1, p1: true, p2: false }).bullets, p1.bullets,
    'a dead nominated P2 falls back to P1');
  const dead = run({ owner: 0, p1: false, p2: false });
  assert.deepEqual(dead.bullets, []);
  assert.equal(dead.callbacks, 0);
});

test('White arm firing reaches kind $07 through its White site', () => {
  const fixture = createWorldFixture();
  seedLiveMidboss(fixture);
  setPlayers(fixture.ram, true, false);
  fixture.ram.setU8(REC + R.armsFired, 1);
  fixture.ram.setU8(REC + R.phase, 2);
  const a4 = arm(0);
  fixture.ram.setU16(a4 + A.flags, 0);
  fixture.ram.setU8(a4 + A.state, 0);
  fixture.ram.setU8(a4 + A.fireCad, 0);
  fixture.ram.setU8(a4 + A.gateA, 0);
  fixture.ram.setU8(a4 + A.gateB, 0);
  fixture.ram.setU8(a4 + A.facing, 0x80);
  fixture.ram.setU32(a4 + A.posX, 0x30001000);
  const runtime = runtimeContext(fixture);
  runHandler(TYPE_0D.handler, fixture.ram, fixture.rom, REC,
    runtime.ctx, fixture.world.resources);
  assert.deepEqual(liveBullets(fixture.ram).map(({ kind }) => kind), [7]);
  assert.ok(runtime.spawns.some(({ site }) => site === 0x16ad46));
  assertWhiteOnly(fixture.reads);
});

test('lethal White P2 mask preserves score, effects, animation, and fixed-D1 child', () => {
  const damageMask = 0x08;
  const fixture = createWorldFixture();
  seedLiveMidboss(fixture);
  fixture.ram.setU8(SUB, damageMask);
  fixture.ram.setU16(SUB + S.anim, 1);
  fixture.ram.setU16(SUB + S.hp, 0x8001);
  const runtime = runtimeContext(fixture);
  runHandler(TYPE_0D.handler, fixture.ram, fixture.rom, REC,
    runtime.ctx, fixture.world.resources);

  assert.equal(fixture.ram.u8(REC + R.deathCtr), 0x70);
  assert.equal(fixture.ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE);
  assert.equal(fixture.ram.u16(SPAWN.DEFQ_BASE + 0x02), 0x001c);
  assert.equal(fixture.ram.u16(SPAWN.DEFQ_BASE + 0x04), 0x0000,
    '$1626FE takes the fixed-D1 $00 enqueue entry');
  assert.equal(fixture.ram.u32(SPAWN.DEFQ_BASE + 0x12), 0);
  assert.equal(fixture.ram.u16(REC + R.fireD1), damageMask);
  assert.deepEqual(runtime.kills, [{ d0: 0x353, d1: damageMask }]);
  assert.deepEqual(runtime.sounds, [TYPE_0D.sound.deathBurst]);
  assert.equal(fixture.ram.u16(BULLET_DRIVER.armWord), 1);

  const effects = Array.from({ length: POOL_B.slots }, (_, n) =>
    POOL_B.base + n * POOL_B.stride).filter((at) => fixture.ram.u16(at) !== 0);
  assert.equal(effects.length, 22, 'eight arm effects plus fourteen list effects execute');
  assert.equal(fixture.ram.u16(BUCKETS[3].counter), 12,
    'the death frame emits exactly the White body sprite');

  const root = ANIM_OBJECT.roots;
  assert.equal(fixture.ram.u16(root), 0x8000);
  let node = fixture.ram.u32(root + 0x2c);
  let nodes = 0;
  while (node !== 0) {
    nodes++;
    if (nodes === 1) {
      assert.equal(fixture.ram.u32(node + 0x0a),
        fixture.rom.u32(TYPE_0D.animationObjects.table + 8));
    }
    node = fixture.ram.u32(node + 0x2c);
  }
  assert.equal(nodes, 14);

  const readsBeforeChild = fixture.reads.length;
  assert.equal(processDeferred(
    fixture.ram, fixture.rom, runtime.unported, fixture.world.tables,
    null, fixture.palette, null, fixture.world.resources,
  ), 1);
  const child = ENEMY.bandCommon + ENEMY.stride;
  const childSub = fixture.ram.u32(child + 0x06);
  assert.equal(fixture.ram.u8(child + 0x0c), 0x1c);
  assert.equal(fixture.ram.u8(child + 0x0d), 0);
  assert.equal(fixture.ram.u16(child + 0x04), 0);
  assert.equal(fixture.ram.u32(child + 0x4c), TYPE_1C.handler);
  assert.equal(fixture.ram.u32(childSub + 0x02), TYPE_1C.position);
  assert.equal(fixture.reads.slice(readsBeforeChild).some(({ address }) =>
    address === 0 || address === 0xdeadbee0), false,
  'Type $1C initialization does not consult a movement stream');
  assertWhiteOnly(fixture.reads);
});

test('White Type $1C initializes without movement reads and paints 23 by 9 with both destinations', () => {
  const { rom, reads } = trackedWhiteCartridge();
  const initialize = () => {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const rec = REC;
    const sub = SPAWN.SUB_COMMON;
    ram.setU16(rec, 0x8000);
    ram.setU16(rec + 0x04, 0);
    ram.setU32(rec + 0x06, sub);
    ram.setU32(rec + 0x12, 0xdeadbee0);
    const body = createInitBodyMap(WHITE_WORLD_RESOURCES.enemyTypes, 'white').get(TYPE_1C.initBody);
    assert.doesNotThrow(() => body(ram, rom, rec, sub));
    assert.equal(ram.u16(rec + 0x16), rom.u16(TYPE_1C.recordPrototype));
    assert.equal(ram.u16(sub), rom.u16(TYPE_1C.subPrototype));
    assert.equal(ram.u32(sub + 0x02), TYPE_1C.position);
    return { ram, rec, sub };
  };

  const normal = initialize();
  normal.ram.setU16(0x8130ce, 0x00f0);
  normal.ram.setU16(TYPE_1C.painter.alternateSelector, 0);
  const vram = new BgVram();
  runHandler(TYPE_1C.handler, normal.ram, rom, normal.rec,
    { vram, unported: new UnportedLog() }, WHITE_WORLD_RESOURCES);
  const cells = changedVram(vram);
  assert.equal(cells.length, 207);
  const columns = [...new Set(cells.map(({ col }) => col))].sort((a, b) => a - b);
  assert.deepEqual(columns,
    [0, 1, 2, 3, 4, 5, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
      61, 62, 63]);
  for (const col of columns) {
    assert.equal(cells.filter((cell) => cell.col === col).length, 9);
  }
  assert.equal(vram.long(0, 47),
    (rom.u32(TYPE_1C.painter.source) + TYPE_1C.painter.tileBase) >>> 0);
  assert.equal(vram.long(1, 58),
    (rom.u32(TYPE_1C.painter.source + 100 * 4) + TYPE_1C.painter.tileBase) >>> 0);
  assert.equal(vram.long(8, 5),
    (rom.u32(TYPE_1C.painter.source + 206 * 4) + TYPE_1C.painter.tileBase) >>> 0);

  const alternate = initialize();
  alternate.ram.setU16(0x8130ce, 0x00f0);
  alternate.ram.setU16(TYPE_1C.painter.alternateSelector, 1);
  const altVram = new BgVram();
  runHandler(TYPE_1C.handler, alternate.ram, rom, alternate.rec,
    { vram: altVram, unported: new UnportedLog() }, WHITE_WORLD_RESOURCES);
  const altCells = changedVram(altVram);
  assert.equal(altCells.length, 207);
  assert.deepEqual([...new Set(altCells.map(({ col }) => col))].sort((a, b) => a - b),
    Array.from({ length: 23 }, (_, n) => 41 + n));
  assert.equal(altVram.long(0, 40), 0);
  assert.equal(altVram.long(0, 0), 0);
  assertWhiteOnly(reads);
});

test('White Type $1C retires only at $0105', () => {
  const { rom, reads } = trackedWhiteCartridge();
  const live = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  live.setU16(REC, 0x8000);
  live.setU32(REC + 0x06, SPAWN.SUB_COMMON);
  live.setU16(0x8130ce, 0x0104);
  const liveVram = new BgVram();
  runHandler(TYPE_1C.handler, live, rom, REC,
    { vram: liveVram, unported: new UnportedLog() }, WHITE_WORLD_RESOURCES);
  assert.equal(live.u16(REC), 0x8000);
  assert.equal(changedVram(liveVram).length, 207);

  const retired = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  retired.setU16(REC, 0x8000);
  retired.setU32(REC + 0x06, SPAWN.SUB_COMMON);
  retired.setU16(0x8130ce, 0x0105);
  const retiredVram = new BgVram();
  const before = Uint16Array.from(retiredVram.w);
  runHandler(TYPE_1C.handler, retired, rom, REC,
    { vram: retiredVram, unported: new UnportedLog() }, WHITE_WORLD_RESOURCES);
  assert.equal(retired.u16(REC), 0);
  assert.equal(retired.u8(SPAWN.SUB_COMMON), 1);
  assert.deepEqual(retiredVram.w, before);
  assertWhiteOnly(reads);
});
