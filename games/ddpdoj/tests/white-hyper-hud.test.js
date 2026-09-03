import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BLACK_HUD_RESOURCES } from '../src/hud.js';
import {
  BLACK_HYPER_RESOURCES,
  endHyper285AF2,
  endHyperWithResources,
  stepHyper285A12,
  stepHyperWithResources,
} from '../src/hyper.js';
import { P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS } from '../src/spritequeue.js';
import {
  WHITE_HUD_RESOURCES,
  WHITE_HYPER_HUD_RESOURCES,
  WHITE_HYPER_RESOURCES,
  createWhiteStage1HyperHudHandlers,
  whiteHudTick18C046,
  whiteSlideArm18659C,
} from '../src/white-hyper-hud.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const IMAGE = fileURLToPath(new URL('../tools/oracle/out/maincpu.bin', import.meta.url));
assert.ok(existsSync(TABLES), `${TABLES} missing; run export-tables.py`);
assert.ok(existsSync(IMAGE), `${IMAGE} missing; run the local cartridge exporter`);
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
const image = readFileSync(IMAGE);
const imageU32 = (address) => image.readUInt32BE(address);

const HUD = WHITE_HUD_RESOURCES.ram;
const HUD_TABLES = WHITE_HUD_RESOURCES.tables;
const PRESENTATION = WHITE_HUD_RESOURCES.presentation;
const TEXT = WHITE_HUD_RESOURCES.text;
const P1 = WHITE_HYPER_RESOURCES.sides[0];
const P2 = WHITE_HYPER_RESOURCES.sides[1];
const SLOT = 0x80e240;

function whiteRam() {
  return new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
}

function callbacks(overrides = {}) {
  return {
    conversion() {},
    endReset() {},
    pendingFlush() {},
    postHudTail() {},
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    whiteHyperHudCallbacks: callbacks(),
    ...overrides,
  };
}

function liveHud(ram) {
  ram.setU8(SLOT + WHITE_HUD_RESOURCES.object.stateAt, 1);
  return ram;
}

function openText(ram) {
  ram.setU32(TEXT.cursor, TEXT.head);
}

function recordingRom(reads = []) {
  const windowRom = new RomWindows(tables.rom);
  return new Proxy(windowRom, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isInteger(address)) reads.push({ method: property, address });
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
}

function spriteTiles(ram, bucket = 25) {
  const { buffer, counter } = BUCKETS[bucket];
  const tiles = [];
  for (let offset = 0; offset < ram.u16(counter); offset += 12) {
    tiles.push(ram.u32(buffer + offset + 4));
  }
  return tiles;
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function numericLeaves(value, found = new Set(), seen = new Set()) {
  if (typeof value === 'number') found.add(value);
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')
      || seen.has(value)) return found;
  seen.add(value);
  for (const child of Object.values(value)) numericLeaves(child, found, seen);
  return found;
}

test('White hyper HUD capability rejects before cartridge or RAM access', () => {
  let romReads = 0;
  let ramReads = 0;
  const protectedRom = new Proxy({}, {
    get() {
      romReads++;
      throw new Error('cartridge touched');
    },
  });
  const protectedRam = new Proxy({}, {
    get() {
      ramReads++;
      throw new Error('RAM touched');
    },
  });

  assert.throws(
    () => createWhiteStage1HyperHudHandlers(protectedRom, BLACK_LABEL_PROFILE),
    /White Label Stage 1 hyper HUD handler map is unavailable/,
  );
  assert.throws(
    () => whiteHudTick18C046(
      protectedRam, protectedRom, SLOT, null, BLACK_LABEL_PROFILE,
    ),
    /White Label Stage 1 hyper HUD tick is unavailable/,
  );
  assert.throws(
    () => whiteSlideArm18659C(protectedRam, BLACK_LABEL_PROFILE),
    /White Label Stage 1 HUD slide arm is unavailable/,
  );
  assert.deepEqual([romReads, ramReads], [0, 0]);
});

test('White resources are deeply frozen and the handler island contains only type 0', () => {
  assertDeepFrozen(WHITE_HYPER_HUD_RESOURCES);
  assertDeepFrozen(WHITE_HUD_RESOURCES);
  assertDeepFrozen(WHITE_HYPER_RESOURCES);
  assert.deepEqual(WHITE_HUD_RESOURCES.object, {
    stateAt: 0x02, idAt: 0x4c, priority: 0x09,
    killTarget: 0x1415cc, aliveFlag: 0x81b6f0,
  });
  assert.deepEqual(WHITE_HYPER_RESOURCES.callbacks, {
    conversion: [0x15286c, 0x152886],
    endReset: [0x1528a8, 0x1528b6],
    pendingFlush: [0x1860f2, 0x186154],
  });
  const blackCartridgeIdentities = new Set([
    ...numericLeaves(BLACK_HUD_RESOURCES),
    ...numericLeaves(BLACK_HYPER_RESOURCES),
  ].filter((address) => address >= 0x200000 && address < 0x300000));
  const whiteIdentities = numericLeaves(WHITE_HYPER_HUD_RESOURCES);
  for (const address of blackCartridgeIdentities) {
    assert.equal(whiteIdentities.has(address), false,
      `White resource graph contains Black identity $${address.toString(16).toUpperCase()}`);
  }
  const handlers = createWhiteStage1HyperHudHandlers(recordingRom());
  assert.deepEqual([...handlers.keys()], [0x00]);
  assert.equal(typeof handlers.get(0x00), 'function');
});

test('type 0 constructs, runs its exact state-1 order, and queues destruction', () => {
  const ram = whiteRam();
  const rom = recordingRom();
  const trace = [];
  const ctx = context({
    whiteHyperHudHook(event) {
      assert.equal(Object.isFrozen(event), true);
      trace.push([event.call, event.target]);
    },
  });

  whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.equal(ram.u8(SLOT + 2), 1);
  assert.equal(ram.u16(HUD.objFlag), 1);
  assert.deepEqual(trace, []);

  whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.deepEqual(trace, [
    ['score-drain', 0x182f0e],
    ['cursor-a', 0x184be4],
    ['cursor-b', 0x184bac],
    ['hyper-p1', 0x18466c],
    ['hyper-p2', 0x184796],
    ['post-tail', 0x1830c6],
  ]);

  ram.setU8(SLOT + 2, 2);
  ram.setU32(SLOT + 0x4c, 0x12345678);
  whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.equal(ram.u16(HUD.objFlag), 0);
  assert.equal(ram.u32(ALLOC.killQueue), 0x12345678);
  assert.equal(ram.u16(ALLOC.killSp), ALLOC.stride);
});

test('score drain handles P1 before P2', () => {
  const ram = liveHud(whiteRam());
  const rom = recordingRom();
  const events = [];
  openText(ram);
  for (const [pending, next, alive] of [
    [HUD.pendingP1, HUD.extendNextP1, HUD.aliveP1],
    [HUD.pendingP2, HUD.extendNextP2, HUD.aliveP2],
  ]) {
    ram.setU32(pending, 1);
    ram.setU32(next, 1);
    ram.setU16(alive, 1);
  }
  whiteHudTick18C046(ram, rom, SLOT, context({
    hudEvent(name, ownerIndex) {
      if (name === 'extend') events.push(ownerIndex);
    },
  }));
  assert.deepEqual(events, [0, 1]);
  assert.equal(ram.u32(HUD.totalP1), 1);
  assert.equal(ram.u32(HUD.totalP2), 1);
  assert.equal(ram.u32(HUD.pendingP1), 0);
  assert.equal(ram.u32(HUD.pendingP2), 0);
});

test('slide arm blocks 84 HUD calls and starts both hyper steps on call 85', () => {
  const ram = liveHud(whiteRam());
  const rom = recordingRom();
  const traces = [];
  ram.setU16(HUD.aliveP1, 0xffff);
  ram.setU16(HUD.aliveP2, 0xffff);
  whiteSlideArm18659C(ram);
  assert.equal(ram.u16(HUD.bannerTimer), 0x53);
  assert.equal(ram.u16(HUD.slideFlag), 1);

  const ctx = context({
    whiteHyperHudHook({ call }) {
      if (call.startsWith('hyper-')) traces.push(call);
    },
  });
  for (let call = 1; call <= 83; call++) whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.equal(ram.u16(HUD.bannerTimer), 0);
  assert.equal(ram.u16(HUD.slideFlag), 1);
  assert.deepEqual(traces, []);

  whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.equal(ram.u16(HUD.slideFlag), 0);
  assert.deepEqual(traces, []);

  whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.deepEqual(traces, ['hyper-p1', 'hyper-p2']);

  ram.setU16(HUD.bannerTimer, 0x1234);
  ram.setU8(HUD.flags9, 1);
  whiteSlideArm18659C(ram);
  assert.equal(ram.u16(HUD.bannerTimer), 0x1234);
  assert.equal(ram.u16(HUD.slideFlag), 1);
});

test('flags9 special slide presents P1 then P2 and rejoins both hypers in one call', () => {
  const ram = liveHud(whiteRam());
  const reads = [];
  const rom = recordingRom(reads);
  const trace = [];
  const conversions = [];
  openText(ram);
  ram.setU8(HUD.flags9, 1);
  ram.setU8(HUD.bannerFlagsBoss, 0x10);
  ram.setU16(HUD.slideFlag, 1);
  for (const [alive, stock, req, gauge] of [
    [HUD.aliveP1, P1.stock, P1.req, P1.gauge],
    [HUD.aliveP2, P2.stock, P2.req, P2.gauge],
  ]) {
    ram.setU16(alive, 1);
    ram.setU16(stock, 1);
    ram.setU16(req, 1);
    ram.setU16(gauge, 0x100);
  }
  const ctx = context({
    whiteHyperHudHook({ call }) { trace.push(call); },
    whiteHyperHudCallbacks: callbacks({
      conversion(_ram, _rom, _ctx, ownerIndex) { conversions.push(ownerIndex); },
    }),
  });

  whiteHudTick18C046(ram, rom, SLOT, ctx);
  assert.equal(ram.u16(HUD.slideFlag), 0);
  assert.deepEqual(trace, [
    'score-drain', 'cursor-a', 'cursor-b', 'slide',
    'hyper-p1', 'hyper-p2', 'post-tail',
  ]);
  assert.deepEqual(conversions, [0, 1]);
  assert.deepEqual(reads.map(({ address }) => address).filter((address) => [
    HUD_TABLES.settledStock + 4,
    HUD_TABLES.settledLivesP1,
    HUD_TABLES.settledLivesP2,
  ].includes(address)), [
    HUD_TABLES.settledStock + 4,
    HUD_TABLES.settledLivesP1,
    HUD_TABLES.settledStock + 4,
    HUD_TABLES.settledLivesP2,
  ]);
  assert.deepEqual([ram.u16(P1.active), ram.u16(P2.active)], [1, 1]);
});

test('blocked P1 activation still runs P2 and the post-tail callback', () => {
  const ram = liveHud(whiteRam());
  const trace = [];
  const tails = [];
  ram.setU16(P1.req, 1);
  ram.setU16(P1.stock, 1);
  ram.setU8(P1.player, 0x10);

  whiteHudTick18C046(ram, recordingRom(), SLOT, context({
    whiteHyperHudHook({ call }) { trace.push(call); },
    whiteHyperHudCallbacks: callbacks({
      postHudTail() { tails.push('tail'); },
    }),
  }));

  assert.equal(ram.u16(P1.active), 0);
  assert.equal(ram.u16(P1.stock), 1);
  assert.deepEqual(trace.slice(-3), ['hyper-p1', 'hyper-p2', 'post-tail']);
  assert.deepEqual(tails, ['tail']);
});

test('moving and settled slide paths emit real sprite and text presentation', () => {
  const ram = liveHud(whiteRam());
  const rom = recordingRom();
  openText(ram);
  ram.setU16(HUD.aliveP1, 1);
  ram.setU16(HUD.aliveP2, 1);
  ram.setU16(P1.stock, 1);
  ram.setU16(P2.stock, 1);
  ram.setU16(HUD.bannerTimer, 1);
  ram.setU16(HUD.slideFlag, 1);

  whiteHudTick18C046(ram, rom, SLOT, context());
  const movingTiles = spriteTiles(ram);
  assert.equal(ram.u16(HUD.bannerTimer), 0);
  assert.equal(ram.u16(HUD.slideFlag), 1);
  assert.ok(movingTiles.includes(PRESENTATION.panelP1));
  assert.ok(movingTiles.includes(PRESENTATION.panelP2));
  assert.ok(movingTiles.includes(imageU32(HUD_TABLES.movingLivesP1)));
  assert.ok(movingTiles.includes(imageU32(HUD_TABLES.movingLivesP2)));
  assert.ok(movingTiles.includes(imageU32(HUD_TABLES.movingStock + 4)));

  const cursorBefore = ram.u32(TEXT.cursor);
  whiteHudTick18C046(ram, rom, SLOT, context());
  assert.equal(ram.u16(HUD.slideFlag), 0);
  assert.ok(ram.u32(TEXT.cursor) > cursorBefore);
  assert.notEqual(ram.u32(TEXT.head), 0);
});

test('linear-art reconstruction matches all native gauge and rank pointers', () => {
  assert.deepEqual(tables.editions.whiteLabel.hyperHud.presentation.linearArt, {
    sourceMax: 0x095f,
    gauge: {
      base: '$186D30', entries: 45, reachableMaxIndex: 43, step: -0x64,
    },
    rank: {
      base: ['$186DE4', '$186E64'], entries: 32, reachableMaxIndex: 31, step: -0x1c,
    },
  });
  const rom = new RomWindows(tables.rom);
  const cases = [
    [HUD_TABLES.gauge, 45, -0x64],
    [HUD_TABLES.rankP1, 32, -0x1c],
    [HUD_TABLES.rankP2, 32, -0x1c],
  ];
  for (const [base, count, expectedStep] of cases) {
    const first = rom.u32(base);
    const step = (rom.u32(base + 4) - first) | 0;
    assert.equal(step, expectedStep);
    for (let index = 0; index < count; index++) {
      const reconstructed = (first + Math.imul(index, step)) >>> 0;
      assert.equal(reconstructed, imageU32(base + index * 4));
    }
  }
});

test('linear-art readers use only slope anchors with no clamp or wrap', () => {
  const reads = [];
  const rom = recordingRom(reads);
  const ram = liveHud(whiteRam());
  ram.setU16(HUD.aliveP1, 0);
  ram.setU16(HUD.aliveP2, 0);
  ram.setU16(P1.active, 1);
  ram.setU16(P2.active, 1);
  ram.setU16(P1.gauge, 0x095f);
  ram.setU16(P2.gauge, 0x095f);
  ram.setU16(HUD.rankAccumP1, 0x095f);
  ram.setU16(HUD.rankAccumP2, 0x095f);
  ram.setU16(HUD.bannerTimer, 1);
  ram.setU16(HUD.slideFlag, 1);

  whiteHudTick18C046(ram, rom, SLOT, context());
  assert.deepEqual(spriteTiles(ram), [
    PRESENTATION.panelP1, 0x001caecc, 0x001ca008,
    PRESENTATION.panelP2, 0x001caecc, 0x001ce9b4,
  ]);
  const linearAddresses = reads.map(({ address }) => address).filter((address) =>
    address >= HUD_TABLES.gauge && address < HUD_TABLES.rankP2 + 0x80);
  assert.deepEqual(linearAddresses, [
    HUD_TABLES.gauge, HUD_TABLES.gauge + 4,
    HUD_TABLES.rankP1, HUD_TABLES.rankP1 + 4,
    HUD_TABLES.gauge, HUD_TABLES.gauge + 4,
    HUD_TABLES.rankP2, HUD_TABLES.rankP2 + 4,
  ]);

  const boundaryRam = liveHud(whiteRam());
  const boundaryReads = [];
  const boundaryRom = recordingRom(boundaryReads);
  boundaryRam.setU16(HUD.aliveP1, 0);
  boundaryRam.setU16(HUD.aliveP2, 0);
  boundaryRam.setU16(HUD.rankAccumP1, 0x0258);
  boundaryRam.setU16(HUD.rankAccumP2, 0x0258);
  boundaryRam.setU16(HUD.bannerTimer, 1);
  boundaryRam.setU16(HUD.slideFlag, 1);
  whiteHudTick18C046(boundaryRam, boundaryRom, SLOT, context());
  assert.deepEqual(spriteTiles(boundaryRam), [
    imageU32(HUD_TABLES.movingStock), PRESENTATION.panelP1, 0x001ca28c,
    imageU32(HUD_TABLES.movingStock), PRESENTATION.panelP2, 0x001cec38,
  ]);
  assert.ok(boundaryReads.every(({ address }) =>
    address !== HUD_TABLES.rankP1 + 0x20 && address !== HUD_TABLES.rankP2 + 0x20));
});

test('gauge and rank sources above $095F are rejected before slope reads', () => {
  for (const kind of ['gauge', 'rank']) {
    const reads = [];
    const ram = liveHud(whiteRam());
    const rom = recordingRom(reads);
    ram.setU16(HUD.aliveP1, 0);
    ram.setU16(HUD.aliveP2, 0xffff);
    ram.setU16(HUD.bannerTimer, 1);
    ram.setU16(HUD.slideFlag, 1);
    if (kind === 'gauge') {
      ram.setU16(P1.active, 1);
      ram.setU16(P1.gauge, 0x0960);
    } else {
      ram.setU16(HUD.rankAccumP1, 0x0960);
    }
    assert.throws(
      () => whiteHudTick18C046(ram, rom, SLOT, context()),
      new RegExp(`${kind === 'gauge' ? 'hyper gauge' : 'rank accumulator'}.*\\$095F`),
    );
    const forbidden = kind === 'gauge' ? HUD_TABLES.gauge : HUD_TABLES.rankP1;
    assert.equal(reads.some(({ address }) => address === forbidden), false);
  }
});

test('every exercised White HUD cartridge read stays in the seven exact windows', () => {
  const reads = [];
  const rom = recordingRom(reads);

  const scoreRam = liveHud(whiteRam());
  openText(scoreRam);
  scoreRam.setU32(HUD.pendingP1, 1);
  scoreRam.setU32(HUD.extendNextP1, 1);
  scoreRam.setU16(HUD.aliveP1, 1);
  scoreRam.setU16(HUD.aliveP2, 0xffff);
  whiteHudTick18C046(scoreRam, rom, SLOT, context());

  const movingRam = liveHud(whiteRam());
  movingRam.setU16(HUD.aliveP1, 1);
  movingRam.setU16(HUD.aliveP2, 1);
  movingRam.setU16(P1.stock, 1);
  movingRam.setU16(P2.stock, 1);
  movingRam.setU16(HUD.rankAccumP1, 0x0258);
  movingRam.setU16(HUD.rankAccumP2, 0x0258);
  movingRam.setU16(HUD.bannerTimer, 1);
  movingRam.setU16(HUD.slideFlag, 1);
  whiteHudTick18C046(movingRam, rom, SLOT, context());
  openText(movingRam);
  whiteHudTick18C046(movingRam, rom, SLOT, context());

  const gaugeRam = liveHud(whiteRam());
  gaugeRam.setU16(HUD.aliveP1, 0);
  gaugeRam.setU16(HUD.aliveP2, 0xffff);
  gaugeRam.setU16(P1.active, 1);
  gaugeRam.setU16(P1.gauge, 0x095f);
  gaugeRam.setU16(HUD.bannerTimer, 1);
  gaugeRam.setU16(HUD.slideFlag, 1);
  whiteHudTick18C046(gaugeRam, rom, SLOT, context());

  const flashRam = whiteRam();
  flashRam.setU16(P1.endFlash, 0x48);
  stepHyperWithResources(flashRam, rom, context(), false, null, WHITE_HYPER_RESOURCES);

  const windows = tables.editions.whiteLabel.hyperHudRuntimeWindows.map(({ base, len }) => ({
    base: Number.parseInt(base.slice(1), 16),
    len,
  }));
  assert.equal(windows.length, 7);
  assert.ok(reads.length > 0);
  assert.ok(reads.every(({ address }) => address < 0x200000));
  assert.ok(reads.every(({ address, method }) => {
    const width = method === 'u32' ? 4 : method === 'u16' ? 2 : 1;
    return windows.some((window) =>
      address >= window.base && address + width <= window.base + window.len);
  }));
  const touched = new Set(windows.filter((window) => reads.some(({ address }) =>
    address >= window.base && address < window.base + window.len)).map(({ base }) => base));
  assert.deepEqual(touched, new Set(windows.map(({ base }) => base)));
});

test('activation preserves native order and White and Black caps remain distinct', () => {
  const white = whiteRam();
  const order = [];
  white.setU16(P1.req, 1);
  white.setU16(P1.stock, 5);
  white.setU16(P1.power, 0x22);
  white.setU16(P1.gauge, 0x100);
  white.setU16(P1.subTick, 0x55aa);
  white.setU16(P1.chainMeter, 1);
  white.setU16(WHITE_HYPER_RESOURCES.ram.chainSeed, 0x4321);
  const ctx = context({
    whiteHyperHudCallbacks: callbacks({
      conversion(ram, _rom, _ctx, ownerIndex, target) {
        order.push('conversion');
        assert.equal(ownerIndex, 0);
        assert.equal(target, 0x15286c);
        assert.equal(ram.u16(P1.active), 1);
        assert.equal(ram.u32(P1.flashSprite), 0x000530fc);
        assert.equal(ram.u16(P1.liveFlash), 1);
        assert.equal(ram.u16(P1.flashTick), 1);
        assert.equal(ram.u16(P1.chainMeter), 0x4321);
        assert.equal(ram.u16(P1.level), 5);
        assert.equal(ram.u16(P1.power), 0x0f);
        assert.equal(ram.u16(P1.subTick), 0);
        assert.equal(ram.u16(P1.stock), 0);
      },
    }),
  });
  stepHyperWithResources(
    white, {}, ctx, false, () => order.push('stock'), WHITE_HYPER_RESOURCES,
  );
  assert.deepEqual(order, ['stock', 'conversion']);

  const black = new Ram();
  const side = BLACK_HYPER_RESOURCES.sides[0];
  black.setU16(side.req, 1);
  black.setU16(side.stock, 5);
  black.setU16(side.power, 0x22);
  black.setU16(side.gauge, 0x100);
  stepHyperWithResources(black, {}, {}, false, null, BLACK_HYPER_RESOURCES);
  assert.equal(black.u16(side.power), 0x23);
});

test('White P2 end flash tests P1 active and clears flags before callbacks', () => {
  const run = (p1Active) => {
    const ram = whiteRam();
    const order = [];
    ram.setU16(P1.active, p1Active);
    ram.setU16(P2.active, 1);
    ram.setU8(P2.player + P.flags1, 1);
    endHyperWithResources(ram, {}, context({
      whiteHyperHudCallbacks: callbacks({
        endReset(memory, _rom, _ctx, ownerIndex, target) {
          order.push('reset');
          assert.equal(ownerIndex, 1);
          assert.equal(target, 0x1528b6);
          assert.equal(memory.u8(P2.player + P.flags1) & 1, 0);
        },
        pendingFlush(_ram, _rom, _ctx, ownerIndex, target) {
          order.push('flush');
          assert.equal(ownerIndex, 1);
          assert.equal(target, 0x186154);
        },
      }),
    }), true, () => order.push('stock'), WHITE_HYPER_RESOURCES);
    assert.deepEqual(order, ['reset', 'stock', 'flush']);
    return ram.u16(P2.endFlash);
  };
  assert.equal(run(0), 0);
  assert.equal(run(1), 0x48);

  const black = new Ram();
  const side = BLACK_HYPER_RESOURCES.sides[1];
  black.setU16(side.active, 1);
  endHyperWithResources(black, {}, {}, true, null, BLACK_HYPER_RESOURCES);
  assert.equal(black.u16(side.endFlash), 0x48);
});

test('excluded White callbacks fail only when their boundary is reached', () => {
  const rom = recordingRom();
  const idle = liveHud(whiteRam());
  assert.doesNotThrow(() => whiteHudTick18C046(idle, rom, SLOT, {
    whiteHyperHudCallbacks: { postHudTail() {} },
  }));

  const activation = whiteRam();
  activation.setU16(P1.req, 1);
  activation.setU16(P1.stock, 1);
  activation.setU16(P1.gauge, 0x100);
  assert.throws(
    () => stepHyperWithResources(
      activation, rom, { whiteHyperHudCallbacks: {} }, false, null, WHITE_HYPER_RESOURCES,
    ),
    /UNPORTED \$15286C:.*conversion callback/,
  );

  const ending = whiteRam();
  ending.setU16(P1.active, 1);
  ending.setU8(P1.player + P.flags1, 1);
  assert.throws(
    () => endHyperWithResources(
      ending, rom, { whiteHyperHudCallbacks: {} }, false, null, WHITE_HYPER_RESOURCES,
    ),
    /UNPORTED \$1528A8:.*endReset callback/,
  );
  assert.equal(ending.u8(P1.player + P.flags1) & 1, 0);

  const flushing = whiteRam();
  flushing.setU16(P1.active, 1);
  assert.throws(
    () => endHyperWithResources(flushing, rom, {
      whiteHyperHudCallbacks: { endReset() {} },
    }, false, null, WHITE_HYPER_RESOURCES),
    /UNPORTED \$1860F2:.*pendingFlush callback/,
  );

  const tail = liveHud(whiteRam());
  assert.throws(
    () => whiteHudTick18C046(tail, rom, SLOT, {
      whiteHyperHudCallbacks: {},
    }),
    /UNPORTED \$1830C6:.*postHudTail callback/,
  );
});

test('Black wrappers preserve legacy activation and ending callback order', () => {
  const rom = { u8() { return 0; }, u16() { return 0; }, u32() { return 0; } };
  const activation = new Ram();
  const side = BLACK_HYPER_RESOURCES.sides[0];
  const activationOrder = [];
  activation.setU16(side.req, 1);
  activation.setU16(side.stock, 3);
  activation.setU16(side.power, 0x20);
  activation.setU16(side.gauge, 0x100);
  activation.setU16(side.subTick, 0x55aa);
  activation.setU16(side.chainMeter, 1);
  activation.setU16(BLACK_HYPER_RESOURCES.ram.chainSeed, 0x3456);

  stepHyper285A12(activation, rom, {
    hyperEvent(name) {
      if (name === 'activate') activationOrder.push('conversion');
    },
  }, false, () => {
    activationOrder.push('stock');
    assert.equal(activation.u16(side.chainMeter), 0x3456);
    assert.equal(activation.u16(side.level), 3);
    assert.equal(activation.u16(side.power), 0x23);
    assert.equal(activation.u16(side.subTick), 0);
    assert.equal(activation.u16(side.stock), 0);
  });
  assert.deepEqual(activationOrder, ['stock', 'conversion']);

  const ending = new Ram();
  const endingOrder = [];
  ending.setU16(side.active, 1);
  ending.setU16(side.gauge, 0x100);
  ending.setU8(side.player + P.flags1, 1);
  endHyper285AF2(ending, rom, {
    soundPost() {
      endingOrder.push('reset');
      assert.equal(ending.u8(side.player + P.flags1) & 1, 1);
    },
    hyperEvent(name) {
      if (name === 'end') {
        endingOrder.push('end');
        assert.equal(ending.u8(side.player + P.flags1) & 1, 0);
      }
    },
  }, false, () => {
    endingOrder.push('stock');
    assert.equal(ending.u8(side.player + P.flags1) & 1, 0);
  });
  assert.deepEqual(endingOrder, ['reset', 'stock', 'end']);
});
