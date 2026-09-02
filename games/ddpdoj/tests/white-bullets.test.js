import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  B, BLACK_POOL_A_RESOURCES, allocPoolAWithResources,
} from '../src/bee.js';
import {
  BLACK_BULLET_DRIVER_RESOURCES, runClearTimer,
} from '../src/bulletdriver.js';
import { REC, TYPEBIT } from '../src/bullets.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_RUNTIME_BINDING } from '../src/runtime-profile.js';
import { LEDGER } from '../src/score.js';
import { Unreached } from '../src/unported.js';
import {
  WHITE_BULLET_DRIVER_RESOURCES, WHITE_ENEMY_BULLET_RESOURCES,
  WHITE_MOVER_RESOURCES, WHITE_POOL_A_RESOURCES,
  runWhiteBulletDriver, runWhiteClearTimer, runWhitePoolADriver,
  runWhiteScreenClear,
} from '../src/white-bullets.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
assert.ok(existsSync(TABLES),
  `${TABLES} missing; run: python games/ddpdoj/tools/export-tables.py`);
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
const rom = new RomWindows(tables.rom);
const white = tables.editions.whiteLabel;

function bulletRanges() {
  return [...white.bulletRuntimeWindows, ...white.bulletSpeedWindows]
    .map(({ base, len }) => ({ base: Number.parseInt(base.slice(1), 16), len }));
}

function covered(ranges, address, size = 1) {
  return ranges.some(({ base, len }) =>
    base <= address && address + size <= base + len);
}

function guardedRom(source = rom) {
  const reads = [];
  const widths = { u8: 1, u16: 2, u32: 4 };
  return {
    reads,
    rom: new Proxy(source, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;
        return (address, ...args) => {
          if (Number.isSafeInteger(address)) {
            const size = property === 'bytes' ? args[0] : (widths[property] ?? 1);
            reads.push({ address, size });
          }
          return Reflect.apply(value, target, [address, ...args]);
        };
      },
    }),
  };
}

function bulletBase(slot = 0) {
  return WHITE_MOVER_RESOURCES.pool + slot * WHITE_MOVER_RESOURCES.stride;
}

function seedBullet(ram, {
  slot = 0, type = 0x8103, posA = 0x2000, posB = 0x2000,
  speed = 0x14, direction = 0x10, continuation = 0,
} = {}) {
  const base = bulletBase(slot);
  ram.setU16(base + REC.typeWord, type);
  ram.setU16(base + REC.posA, posA);
  ram.setU16(base + REC.posB, posB);
  ram.setU8(base + REC.speed, speed);
  ram.setU8(base + REC.dir, direction);
  ram.setU32(base + REC.continuation, continuation);
  return base;
}

function seedCarrier(ram, address = 0x810000) {
  ram.setU32(address + B.pos, 0x20002000);
  return address;
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

test('White enemy-bullet capability is narrow and rejects Black before touching inputs', () => {
  assert.equal(Object.hasOwn(WHITE_RUNTIME_BINDING.capabilities, 'stage1EnemyBullets'), true);
  assert.equal(Object.hasOwn(WHITE_RUNTIME_BINDING.capabilities, 'game'), false);

  let touches = 0;
  const untouched = new Proxy({}, {
    get() {
      touches++;
      throw new Error('protected input was touched');
    },
  });
  assert.throws(() => runWhitePoolADriver(
    untouched, untouched, untouched, BLACK_LABEL_PROFILE,
  ), /White Label Stage 1 Pool-A driver is unavailable/);
  assert.throws(() => runWhiteScreenClear(
    untouched, BLACK_LABEL_PROFILE,
  ), /White Label Stage 1 screen clear is unavailable/);
  assert.throws(() => runWhiteBulletDriver(
    untouched, BLACK_LABEL_PROFILE,
  ), /White Label Stage 1 enemy-bullet driver is unavailable/);
  assert.throws(() => runWhiteClearTimer(
    untouched, BLACK_LABEL_PROFILE,
  ), /White Label Stage 1 clear timer is unavailable/);
  assert.equal(touches, 0);
});

test('White enemy-bullet resource graph and manifest are exact, complete, and deeply frozen', () => {
  assertDeepFrozen(WHITE_ENEMY_BULLET_RESOURCES);
  assert.equal(WHITE_POOL_A_RESOURCES.kind0Threshold, 0x34);
  assert.equal(WHITE_POOL_A_RESOURCES.hyperThreshold, 0x23);
  assert.equal(WHITE_POOL_A_RESOURCES.ownerDistance, 0x600);
  assert.equal(BLACK_POOL_A_RESOURCES.kind0Threshold, 0x3c);
  assert.equal(BLACK_POOL_A_RESOURCES.hyperThreshold, 0x28);
  assert.equal(BLACK_BULLET_DRIVER_RESOURCES.screenClear, 0x281cd6);

  assert.deepEqual(white.enemyBullets, {
    screenClear: '$180C76', clearTimer: '$152B5A',
    driver: '$180D3A', mover: '$180D7E',
    poolA: {
      allocator: '$17E9AA', driver: '$17E9DE', dispatch: '$17EA22', fill: '$17FBC2',
      layerTable: '$17FC3A', fillHookTable: '$17FC52',
      fillData: ['$17FCA2', '$17FCB2', '$17FCC2', '$17FCD2'],
      templates: '$17FECE', conversionOffsets: [0x20, 0x2c, 0x30, 0x3c],
      conversionBodies: ['$17F2D6', '$17F626', '$17F742', '$17FA92'],
    },
    rngTable: '$14322E',
    aim256: ['$1425D0', '$1425DC', '$14264C', '$14268C', '$14269C'],
    vectorPointers: '$100920', vectorFoldTable: '$141E2E',
    presentationStub: '$13EEEE', collectionWrapper: '$18B10A',
    collectionLiveTarget: '$28C5E4', bulletPool: '$817F8C',
    behaviourTable: '$180FD0', templatePointers: '$18093E',
    muzzleTable: '$1829AA', directionTable: '$1828AA', spriteEmitter: '$182EE4',
    type5PresentationCalls: ['$151FDE', '$152106'],
    stage1Kinds: [3, 4, 5, 7, 12, 13, 19],
  });
  assert.deepEqual(white.bulletSpeedLevels, Array.from({ length: 256 }, (_, i) => i));
  assert.equal(white.bulletSpeedWindows.length, 512);
  assert.equal(white.bulletRuntimeWindows.length, 53);

  const keys = new Set(white.bulletSpeedWindows.map(({ base, len }) => `${base}:${len}`));
  for (let speed = 0; speed < 256; speed++) {
    const pointer = `$${(0x100920 + speed * 4).toString(16).toUpperCase().padStart(6, '0')}:4`;
    const quadrant = `$${(0x100d20 + speed * 0x208).toString(16).toUpperCase().padStart(6, '0')}:520`;
    assert.equal(keys.has(pointer), true, `speed ${speed} pointer is projected`);
    assert.equal(keys.has(quadrant), true, `speed ${speed} quadrant is projected`);
  }
  const ranges = bulletRanges();
  assert.ok(ranges.every(({ base, len }) => base >= 0 && base + len <= 0x200000));
});

test('every direct White Pool-A, Aim256, mover, and presentation read is guarded', () => {
  const guarded = guardedRom();
  const continuations = new Map([
    [3, 0x1813b4], [4, 0x181470], [5, 0x18152c], [7, 0x1816cc],
    [12, 0x1818d8], [13, 0x181932], [19, 0x181af8],
  ]);
  for (const [kind, continuation] of continuations) {
    const ram = new Ram();
    const base = seedBullet(ram, { type: 0x8100 | kind });
    runWhiteBulletDriver({ ram, rom: guarded.rom });
    assert.equal(ram.u32(base + REC.continuation), continuation,
      `kind ${kind} stores its authentic White continuation`);
    assert.equal(ram.u16(base) & TYPEBIT.dispatch, 0);
    runWhiteBulletDriver({ ram, rom: guarded.rom });
    assert.equal(ram.u32(base + REC.continuation), continuation,
      `kind ${kind} dispatches through its White continuation without replacing it`);
    assert.notEqual(ram.u16(base) & TYPEBIT.alive, 0,
      `kind ${kind} remains live after its continuation frame`);
  }

  const poolRam = new Ram();
  const carrier = seedCarrier(poolRam);
  poolRam.setU16(0x8103e6, 0x8000);
  poolRam.setU16(0x8103e8, 0x1800);
  poolRam.setU16(0x8103ea, 0x2000);
  const star = allocPoolAWithResources(
    poolRam, guarded.rom, {}, 0x20, 0, 0, carrier, WHITE_POOL_A_RESOURCES,
  );
  assert.notEqual(star, null);
  runWhitePoolADriver(poolRam, guarded.rom, {});

  const clearRam = new Ram();
  const clearBullet = seedBullet(clearRam, { type: 0x8003 });
  clearRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.armWord, 1);
  clearRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.modeWord, 0);
  runWhiteScreenClear({ ram: clearRam, rom: guarded.rom });
  assert.equal(clearRam.u16(clearBullet), 0);

  const ranges = bulletRanges();
  assert.ok(guarded.reads.length > 100);
  for (const { address, size } of guarded.reads) {
    assert.ok(address >= 0 && address + size <= 0x200000,
      `read $${address.toString(16)}+${size} stays in Build A`);
    assert.equal(covered(ranges, address, size), true,
      `read $${address.toString(16)}+${size} belongs to the bullet manifest`);
  }
});

test('White pointers are validated before behaviour or Pool-A dispatch', () => {
  const badBehaviourCell = 0x180fd0 + 3 * 4;
  const badBehaviour = new Proxy(rom, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'u32') return (address) =>
        address === badBehaviourCell ? 0x2823ec : target.u32(address);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const bulletRam = new Ram();
  seedBullet(bulletRam, { type: 0x8103 });
  bulletRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.ctr22, 0x0024);
  bulletRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.ctr23, 0x0030);
  bulletRam.setU32(WHITE_BULLET_DRIVER_RESOURCES.trailCursor, 0x8092a4);
  bulletRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.liveCount, 0x1234);
  const bulletBefore = Uint8Array.from(bulletRam.b);
  const bulletCtx = { ram: bulletRam, rom: badBehaviour };
  assert.throws(
    () => runWhiteBulletDriver(bulletCtx),
    (error) => error instanceof Unreached && error.romAddress === badBehaviourCell,
  );
  assert.deepEqual(bulletRam.b, bulletBefore,
    'bad behaviour leaves driver counters, cursor, live count, and record unchanged');
  assert.equal(Object.hasOwn(bulletCtx, 'spriteOut'), false);

  const badPoolCell = 0x17ea22 + 0x20;
  const badPool = new Proxy(rom, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'u32') return (address) =>
        address === badPoolCell ? 0x280252 : target.u32(address);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const poolRam = new Ram();
  const poolBase = WHITE_POOL_A_RESOURCES.base;
  poolRam.setU16(WHITE_POOL_A_RESOURCES.liveCount, 1);
  poolRam.setU16(poolBase + B.status, 0x8020);
  poolRam.setU16(poolBase + B.posX, 0x2345);
  poolRam.setU16(WHITE_POOL_A_RESOURCES.scrollShort, 0x0100);
  poolRam.setU16(0x817f86, 0x0042);
  const poolBefore = Uint8Array.from(poolRam.b);
  assert.throws(
    () => runWhitePoolADriver(poolRam, badPool, {}),
    (error) => error instanceof Unreached && error.romAddress === badPoolCell,
  );
  assert.deepEqual(poolRam.b, poolBefore,
    'bad Pool-A dispatch leaves the record, live count, and collection counters unchanged');

  const allocationRam = new Ram();
  const carrier = seedCarrier(allocationRam);
  const allocationBefore = Uint8Array.from(allocationRam.b);
  assert.throws(
    () => allocPoolAWithResources(
      allocationRam, badPool, {}, 0x20, 0, 0, carrier, WHITE_POOL_A_RESOURCES,
    ),
    (error) => error instanceof Unreached && error.romAddress === badPoolCell,
  );
  assert.deepEqual(allocationRam.b, allocationBefore,
    'bad Pool-A dispatch is rejected before allocation mutates RAM');

  const continuationRam = new Ram();
  seedBullet(continuationRam, { type: 0x8003, continuation: 0x282420 });
  continuationRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.ctr22, 0x0018);
  continuationRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.ctr23, 0x0024);
  continuationRam.setU32(WHITE_BULLET_DRIVER_RESOURCES.trailCursor, 0x80928c);
  continuationRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.liveCount, 0x4321);
  const continuationBefore = Uint8Array.from(continuationRam.b);
  assert.throws(
    () => runWhiteBulletDriver({ ram: continuationRam, rom }),
    (error) => error instanceof Unreached && error.romAddress === 0x282420,
  );
  assert.deepEqual(continuationRam.b, continuationBefore,
    'a Black continuation is rejected by White before driver or bullet mutation');
});

test('all four White conversion kinds preserve owner, counter, selector, score, and sound', () => {
  const cases = [
    { kind: 0x20, bit: 0x1000, owner: 0x8103e6, counter: 0x817f86,
      scoreEnd: LEDGER.p1.pendingEnd, add: 1, score: 0x50, selector: 0x00050000 },
    { kind: 0x2c, bit: 0x1000, owner: 0x8103e6, counter: 0x817f86,
      scoreEnd: LEDGER.p1.pendingEnd, add: 8, score: 0x1000, selector: 0x00010008 },
    { kind: 0x30, bit: 0x0800, owner: 0x810448, counter: 0x817f8a,
      scoreEnd: LEDGER.p2.pendingEnd, add: 1, score: 0x50, selector: 0x00050000 },
    { kind: 0x3c, bit: 0x0800, owner: 0x810448, counter: 0x817f8a,
      scoreEnd: LEDGER.p2.pendingEnd, add: 8, score: 0x1000, selector: 0x00010008 },
  ];
  for (const spec of cases) {
    const allocationRam = new Ram();
    const carrier = seedCarrier(allocationRam);
    const allocated = allocPoolAWithResources(
      allocationRam, rom, {}, spec.kind, 0, 0, carrier, WHITE_POOL_A_RESOURCES,
    );
    assert.notEqual(allocated, null);
    assert.equal(allocationRam.u32(allocated + WHITE_POOL_A_RESOURCES.ownerAt), spec.owner,
      `kind $${spec.kind.toString(16)} belongs to its native player`);

    const ram = new Ram();
    const base = WHITE_POOL_A_RESOURCES.base;
    const sounds = [];
    ram.setU16(WHITE_POOL_A_RESOURCES.liveCount, 1);
    ram.setU16(base + B.status, 0x8000 | spec.bit | spec.kind);
    const frame = runWhitePoolADriver(ram, rom, {
      soundPost(address) { sounds.push(address); },
    });
    assert.equal(frame.collected, 1);
    assert.equal(ram.u16(base + B.status), 0);
    assert.equal(ram.u16(WHITE_POOL_A_RESOURCES.liveCount), 0);
    assert.equal(ram.u16(spec.counter), spec.add);
    assert.equal(ram.u32(base + B.hitLongA), spec.selector);
    assert.equal(ram.u32(spec.scoreEnd - 4), spec.score);
    assert.deepEqual(sounds, [0x28c5e4]);
  }
});

test('White screen clear, clear timer, and finite pools preserve lifecycle bounds', () => {
  const transformRam = new Ram();
  const transformed = seedBullet(transformRam, { type: 0x8003 });
  transformRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.armWord, 1);
  transformRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.modeWord, 0x8000);
  assert.equal(runWhiteScreenClear({ ram: transformRam, rom }), 1);
  assert.equal(transformRam.u16(transformed) & 0x4000, 0x4000);
  assert.equal(transformRam.u16(transformed + 0x3c), 0xffff);

  const freeRam = new Ram();
  const freed = seedBullet(freeRam, { type: 0x8003 });
  freeRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.armWord, 1);
  freeRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.modeWord, 0);
  assert.equal(runWhiteScreenClear({ ram: freeRam, rom }), 1);
  assert.equal(freeRam.u16(freed), 0);
  assert.equal(freeRam.u16(freed + REC.posA), 0xffff);
  assert.equal(freeRam.u16(WHITE_POOL_A_RESOURCES.liveCount), 1);

  const timerRam = new Ram();
  timerRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.armWord, 2);
  timerRam.setU16(WHITE_BULLET_DRIVER_RESOURCES.modeWord, 0xbeef);
  assert.equal(runWhiteClearTimer(timerRam), false);
  assert.equal(timerRam.u16(WHITE_BULLET_DRIVER_RESOURCES.armWord), 1);
  assert.equal(runWhiteClearTimer(timerRam), true);
  assert.equal(timerRam.u16(WHITE_BULLET_DRIVER_RESOURCES.modeWord), 0);

  const fullRam = new Ram();
  const carrier = seedCarrier(fullRam);
  for (let i = 0; i < WHITE_POOL_A_RESOURCES.generalSlots; i++) {
    fullRam.setU16(WHITE_POOL_A_RESOURCES.base + i * WHITE_POOL_A_RESOURCES.stride, 1);
  }
  fullRam.setU16(WHITE_POOL_A_RESOURCES.liveCount, WHITE_POOL_A_RESOURCES.generalSlots);
  assert.equal(allocPoolAWithResources(
    fullRam, rom, {}, 0, 0, 0, carrier, WHITE_POOL_A_RESOURCES,
  ), null);
  assert.equal(fullRam.u16(WHITE_POOL_A_RESOURCES.liveCount), 70);

  const retireRam = new Ram();
  const retired = seedBullet(retireRam, {
    type: 0x800c, posA: 0x7000, continuation: 0x1818d8,
  });
  runWhiteBulletDriver({ ram: retireRam, rom });
  assert.equal(retireRam.u16(retired), 0);
  assert.equal(retireRam.u16(retired + REC.posA), 0xffff);
});

test('Black clear-timer compatibility wrapper remains unchanged', () => {
  const ram = new Ram();
  ram.setU16(BLACK_BULLET_DRIVER_RESOURCES.armWord, 1);
  ram.setU16(BLACK_BULLET_DRIVER_RESOURCES.modeWord, 0x1234);
  assert.equal(runClearTimer(ram), true);
  assert.equal(ram.u16(BLACK_BULLET_DRIVER_RESOURCES.armWord), 0);
  assert.equal(ram.u16(BLACK_BULLET_DRIVER_RESOURCES.modeWord), 0);
  assert.notEqual(WHITE_LABEL_PROFILE, BLACK_LABEL_PROFILE);
});
