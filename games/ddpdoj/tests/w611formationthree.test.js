// W611: private three-pilot formation foundation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { MACHINE, OPT, P, RAM, BIT } from '../src/machine.js';
import {
  ALLOC, commitCreates, objTableInit24107C, queueKill, stageCreate,
} from '../src/objalloc.js';
import { ObjOrder, runObjectDriver } from '../src/objdriver.js';
import { UnportedLog } from '../src/unported.js';
import { MOD_IDS, MODS } from '../src/mods.js';
import {
  FORMATION_MODE, formationMode, formationToHash, hashToFormation,
} from '../src/formation.js';
import { portWordFromPlayerBits, mirrorsFromPort } from '../src/input.js';
import { SHOT } from '../src/weapons.js';
import { BEAM, SEG } from '../src/laser.js';
import { BOMBRAM } from '../src/bomb.js';
import { HUDRAM } from '../src/hud.js';
import { TALLY } from '../src/tally.js';
import {
  FORMATION_ACTOR_BINDINGS,
  P3_FORMATION_ACTOR_BINDING,
  P3_VIRTUAL,
  StrictSidecarMemory,
  THREE_PILOT_FORMATION_MODE,
  attachThreePilotFoundation,
  formationActorBindingForMarker,
  prepareThreePilotFrame,
  resolveThreePilotActor,
  threePilotFoundationForGame,
  transformThreePilotInput,
} from '../src/formationactors.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'exact browser bundle absent; three-actor proof is skipped, not passed';
let bundlePromise;
function localBundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

function fakeCanvas() {
  const context = {
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {},
  };
  return {
    width: 0, height: 0, style: {}, dataset: {},
    getContext() { return context; },
  };
}

function fakeGame({
  p1Y = 0x2000,
  p1X = 0x1000,
  p2Y = 0x2000,
  p2X = 0x2000,
  p1State = 0x8000,
  p2State = 0x8000,
  speed = 0x17,
  priority = 0x10,
  vectors = {},
} = {}) {
  const ram = new Ram();
  ram.setU16(RAM.player1 + P.state, p1State);
  ram.setU16(RAM.player2 + P.state, p2State);
  ram.setU16(RAM.player1 + P.posY, p1Y);
  ram.setU16(RAM.player1 + P.posX, p1X);
  ram.setU16(RAM.player2 + P.posY, p2Y);
  ram.setU16(RAM.player2 + P.posX, p2X);
  ram.setU8(RAM.player1 + P.speedIdx, speed);
  const calls = { angles: [], vectors: [] };
  const game = {
    ram,
    rom: { u16() { return priority; } },
    tables: {
      angleFor(nibble) {
        calls.angles.push(nibble);
        return nibble === 0 ? 0xff : nibble;
      },
      vector(speedIndex, angle) {
        calls.vectors.push([speedIndex, angle]);
        return vectors[angle] ?? { dy: 0, dx: 0 };
      },
    },
  };
  return { game, calls };
}

function activate(state) {
  const created = commitCreates(state.game.ram);
  state.objectDriverHook({
    phase: 'after-commit', ram: state.game.ram, killed: 0, created,
  });
  return created;
}

function driverContext(hook) {
  return {
    budget: {
      exhausted: false,
      charge() {},
      truncate(_site, message) { throw new Error(message); },
    },
    unportedLog: new UnportedLog(),
    order: new ObjOrder(),
    objectDriverHook: hook,
  };
}

function objectByMarker(ram, type, marker) {
  for (let i = 0; i < ALLOC.slots; i++) {
    const rec = ALLOC.table + i * ALLOC.stride;
    if ((ram.u16(rec) & 0xff) === type && ram.u8(rec + 0x07) === marker) return rec;
  }
  return null;
}

function actorId(ram, rec) {
  return ram.u32(rec + ALLOC.idOff);
}

function bytes(ram, start, length) {
  const offset = start - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

function snapshots(ram, ranges) {
  return ranges.map(([start, length]) => bytes(ram, start, length));
}

function formationPositions(state) {
  return FORMATION_ACTOR_BINDINGS.map((binding) => [
    state.memory.u16(binding.player + P.posY),
    state.memory.u16(binding.player + P.posX),
  ]);
}

const PRIVATE_RANGES = [
  [RAM.player1, P.stride * 2],
  [RAM.p1Options, OPT.stride * 2],
  [SHOT.p1Table, SHOT.slots * SHOT.stride],
  [SHOT.p2Table, SHOT.slots * SHOT.stride],
  [BEAM[0].rec, 0x40],
  [BEAM[1].rec, 0x40],
  [BEAM[0].pool, SEG.slots * SEG.stride],
  [BEAM[1].pool, SEG.slots * SEG.stride],
  [0x81b5ae, 0x158],
  [HUDRAM.totalP1, 0x08],
  [HUDRAM.pendingP1, 0x08],
  [BOMBRAM.countP1, 0x08],
  [HUDRAM.aliveP1, 0x04],
  [TALLY.side0, TALLY.stride * 2],
  [RAM.p1raw, 0x0c],
];

test('W611 metadata, defaults, bindings, catalogue boundary, and public refusal are exact', () => {
  const id = 'all-three-pilots-each-piloting-a-ship';
  assert.deepEqual(THREE_PILOT_FORMATION_MODE, {
    id,
    name: 'All Three Pilots, Each Piloting a Ship',
    authenticSelection: {
      ship: 0, style: 2,
      p2: { ship: 2, style: 4 },
      p3: { ship: 0, style: 6 },
    },
  });
  assert.strictEqual(formationMode(FORMATION_MODE.id), FORMATION_MODE,
    'the established two-ship export remains the public formation');
  assert.equal(formationMode(id), null);
  assert.equal(hashToFormation(`#formation=${id}`), null);
  assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE), '');
  assert.equal(MOD_IDS.length, 32);
  assert.equal(MOD_IDS.includes(id), false);
  assert.equal(Object.hasOwn(MODS, id), false);

  assert.deepEqual(FORMATION_ACTOR_BINDINGS.map((binding) => ({
    logicalIndex: binding.logicalIndex,
    marker: binding.marker,
    objectType: binding.objectType,
    renderVariant: binding.renderVariant,
  })), [
    { logicalIndex: 0, marker: 0, objectType: 2, renderVariant: 0 },
    { logicalIndex: 1, marker: 1, objectType: 3, renderVariant: 1 },
    { logicalIndex: 2, marker: 2, objectType: 3, renderVariant: 0 },
  ]);
  assert.strictEqual(formationActorBindingForMarker(2), P3_FORMATION_ACTOR_BINDING);
  assert.throws(() => formationActorBindingForMarker(3), /unknown formation actor marker 3/);

  for (const page of ['../start.html', '../index.html']) {
    const source = readFileSync(new URL(page, import.meta.url), 'utf8');
    assert.equal(source.includes(id), false, `${page} must not expose the incomplete mode`);
    assert.equal(source.includes(THREE_PILOT_FORMATION_MODE.name), false);
  }
});

test('W611 sidecar is big-endian, bit-exact, delegated, strict, and isolated per Game', () => {
  const real = new Ram();
  const virtual = 0x11000000;
  const memory = new StrictSidecarMemory(real, {
    virtualRanges: [
      { name: 'first', start: virtual, length: 4 },
      { name: 'second', start: virtual + 8, length: 2 },
    ],
    sharedRanges: [{ name: 'shared-word', start: RAM.p1raw, length: 2 }],
  });

  memory.setU32(virtual, 0x89abcdef);
  assert.deepEqual([0, 1, 2, 3].map((offset) => memory.u8(virtual + offset)),
    [0x89, 0xab, 0xcd, 0xef]);
  assert.equal(memory.u16(virtual), 0x89ab);
  assert.equal(memory.i16(virtual), -0x7655);
  assert.equal(memory.u32(virtual), 0x89abcdef);
  assert.equal(memory.btst8(virtual, 7), 1);
  assert.equal(memory.bclr8(virtual, 7), 1);
  assert.equal(memory.bclr8(virtual, 7), 0);
  assert.equal(memory.bset8(virtual, 7), 0);
  assert.equal(memory.bchg8(virtual, 1), 0);
  assert.equal(memory.bchg8(virtual, 1), 1);

  memory.setU16(RAM.p1raw, 0x1234);
  assert.equal(real.u16(RAM.p1raw), 0x1234);
  real.setU16(RAM.p1raw, 0xabcd);
  assert.equal(memory.u16(RAM.p1raw), 0xabcd);
  assert.equal(memory.bclr8(RAM.p1raw, 7), 1);
  assert.equal(real.u8(RAM.p1raw), 0x2b);

  assert.throws(() => memory.u8(virtual + 4), /undeclared virtual address/);
  assert.throws(() => memory.u8(RAM.p1raw + 2), /undeclared shared address/);
  assert.throws(() => memory.u16(virtual + 3), /crosses first/);
  assert.throws(() => memory.u32(virtual + 8), /crosses second/);

  const a = fakeGame().game;
  const b = fakeGame({ p1X: 0x2000 }).game;
  const stateA = attachThreePilotFoundation(a, { inputWord: 0xffff });
  const stateB = attachThreePilotFoundation(b, { inputWord: 0xffff });
  assert.strictEqual(threePilotFoundationForGame(a), stateA);
  assert.strictEqual(threePilotFoundationForGame(b), stateB);
  assert.notStrictEqual(stateA, stateB);
  assert.notStrictEqual(stateA.memory, stateB.memory);
  stateA.memory.setU32(P3_VIRTUAL.score, 0x10203040);
  assert.equal(stateA.memory.u32(P3_VIRTUAL.score), 0x10203040);
  assert.equal(stateB.memory.u32(P3_VIRTUAL.score), 0);
  assert.notEqual(stateA.runtime.anchorX, stateB.runtime.anchorX);
});

test('W611 attachment rejects incompatible callbacks before staging', () => {
  const positionFixture = fakeGame();
  const positionTransform = () => null;
  positionFixture.game.playerPositionTransform = positionTransform;
  const positionSp = positionFixture.game.ram.u16(ALLOC.createSp);
  assert.throws(() => attachThreePilotFoundation(positionFixture.game),
    /incompatible playerPositionTransform/);
  assert.strictEqual(positionFixture.game.playerPositionTransform, positionTransform);
  assert.equal(positionFixture.game.ram.u16(ALLOC.createSp), positionSp);
  assert.equal(positionFixture.game.objectDriverHook, undefined);
  assert.equal(threePilotFoundationForGame(positionFixture.game), null);

  const driverFixture = fakeGame();
  const driverHook = () => false;
  driverFixture.game.objectDriverHook = driverHook;
  const driverSp = driverFixture.game.ram.u16(ALLOC.createSp);
  assert.throws(() => attachThreePilotFoundation(driverFixture.game),
    /already has an objectDriverHook/);
  assert.strictEqual(driverFixture.game.objectDriverHook, driverHook);
  assert.equal(driverFixture.game.ram.u16(ALLOC.createSp), driverSp);
  assert.equal(driverFixture.game.playerPositionTransform, undefined);
  assert.equal(threePilotFoundationForGame(driverFixture.game), null);
});

test('W611 attachment refuses allocator ID zero without any partial mutation', () => {
  const { game } = fakeGame();
  game.ram.setU32(ALLOC.idCounter, 0xffffffff);
  const before = game.ram.b.slice();
  assert.throws(() => attachThreePilotFoundation(game),
    /P3 allocator ID would wrap to zero/);
  assert.deepEqual(game.ram.b, before);
  assert.equal(game.ram.u32(ALLOC.idCounter), 0xffffffff);
  assert.equal(game.ram.u16(ALLOC.createSp), 0);
  assert.equal(game.objectDriverHook, undefined);
  assert.equal(game.playerPositionTransform, undefined);
  assert.equal(threePilotFoundationForGame(game), null);
});

test('W611 input transform validates attachment, Game identity, and active lifecycle first', () => {
  const word = 0x10021;
  const original = 0x0021;
  const copied = 0x6021;
  const fixture = fakeGame();
  const foreign = fakeGame();
  const state = attachThreePilotFoundation(fixture.game);
  assert.equal(state.lifecycle, 'staged');
  assert.equal(transformThreePilotInput(state, word), copied,
    'the initial staged lifecycle is active');

  const anchor = [state.runtime.anchorY, state.runtime.anchorX];
  assert.equal(prepareThreePilotFrame(state, foreign.game, word), original,
    'a state cannot transform input for another Game');
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], anchor);
  assert.equal(state.inputSeeded, false);
  assert.equal(prepareThreePilotFrame(null, fixture.game, word), original);
  assert.equal(transformThreePilotInput({
    mode: THREE_PILOT_FORMATION_MODE,
    game: fixture.game,
    lifecycle: 'alive',
  }, word), original, 'an unattached lookalike state is inactive');

  for (const lifecycle of ['dropped', 'detached', 'inactive']) {
    state.lifecycle = lifecycle;
    state.restagePending = false;
    assert.equal(transformThreePilotInput(state, word), original,
      `${lifecycle} direct input remains physical`);
    assert.equal(prepareThreePilotFrame(state, fixture.game, word), original,
      `${lifecycle} frame input remains physical`);
    assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], anchor);
    assert.equal(state.inputSeeded, false);
  }

  state.lifecycle = 'staged';
  assert.equal(prepareThreePilotFrame(state, fixture.game, word), copied);
  assert.equal(state.inputSeeded, true);
  activate(state);
  assert.equal(state.lifecycle, 'alive');
  assert.equal(transformThreePilotInput(state, word), copied,
    'the committed alive lifecycle remains active');
});

test('W611 exact bundle keeps three allocator actors and reapplies cached native targets',
  { skip: SKIP_ASSETS }, async () => {
    const selection = THREE_PILOT_FORMATION_MODE.authenticSelection;
    const demo = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz,
      undefined, null, null, null, selection);
    assert.equal(demo.formation, null, 'the private foundation does not activate W608 formation');
    assert.equal(demo.game.playerPositionTransform, undefined);

    const state = attachThreePilotFoundation(demo.game, { inputWord: 0xffff });
    assert.equal(demo.game.ram.u16(TALLY.side1), 4,
      'the physical P2 still comes from authentic request 4');

    demo.step();
    demo.step();
    const ram = demo.game.ram;
    const p1 = objectByMarker(ram, 2, 0);
    const p2 = objectByMarker(ram, 3, 1);
    const p3 = objectByMarker(ram, 3, 2);
    assert.notEqual(p1, null);
    assert.notEqual(p2, null);
    assert.notEqual(p3, null);
    assert.equal(state.lifecycle, 'alive');
    assert.strictEqual(resolveThreePilotActor(state), p3);
    const ids = [actorId(ram, p1), actorId(ram, p2), actorId(ram, p3)];
    assert.equal(new Set(ids).size, 3);
    assert.equal(state.actorId, ids[2]);
    assert.deepEqual(demo.authentic, {
      ship: 0, style: 2, p2: { ship: 2, style: 4 },
    });
    assert.deepEqual([
      state.memory.u16(P3_VIRTUAL.player + P.shipSel),
      state.memory.u16(P3_VIRTUAL.player + P.optFormation),
      state.memory.u8(P3_VIRTUAL.player + P.playerIdx),
    ], [0, 6, 2]);

    const input = portWordFromPlayerBits([BIT.right], []);
    prepareThreePilotFrame(state, demo.game, input);
    const targets = state.runtime.targets.slice(0, 2)
      .map(({ y, x }) => [y, x]);
    const callbacks = [];
    const installedTransform = demo.game.playerPositionTransform;
    demo.game.playerPositionTransform = (callbackRam, playerIdx, y, x) => {
      const result = installedTransform(callbackRam, playerIdx, y, x);
      callbacks.push([playerIdx, result]);
      return result;
    };
    demo.game.step(input);
    assert.deepEqual([
      [ram.u16(RAM.player1 + P.posY), ram.u16(RAM.player1 + P.posX)],
      [ram.u16(RAM.player2 + P.posY), ram.u16(RAM.player2 + P.posX)],
    ], targets, 'native player handlers cannot overwrite the cached three-pilot targets');
    for (const playerIdx of [0, 1]) {
      assert.equal(callbacks.some(([idx, result]) => idx === playerIdx && result != null), true,
        `native player ${playerIdx + 1} consumes the installed post-movement callback`);
    }
  });

test('W611 full-ID resolution follows allocator movement and dropped staging stays dead', () => {
  const first = fakeGame({ priority: 0x10 });
  first.game.ram.setU32(ALLOC.idCounter, 0x12340000);
  const preceding = stageCreate(first.game.ram, 4, () => 0x20);
  assert.equal(preceding.ok, true);
  const precedingId = first.game.ram.u32(preceding.addr + ALLOC.idOff);
  first.game.ram.setU32(ALLOC.idCounter, 0x56780000);
  const state = attachThreePilotFoundation(first.game, { inputWord: 0xffff });
  assert.equal(state.actorId, 0x56780001);
  assert.equal(precedingId & 0xffff, state.actorId & 0xffff,
    'the neighboring IDs deliberately collide in their low word');
  assert.notEqual(precedingId >>> 16, state.actorId >>> 16);
  assert.equal(state.lifecycle, 'staged');
  assert.equal(state.memory.u16(P3_VIRTUAL.player + P.state), 0,
    'a staged object is not live before allocator commit');
  activate(state);
  assert.equal(resolveThreePilotActor(state), ALLOC.table + ALLOC.stride,
    'full-ID lookup skips the low-word collision in the preceding record');

  queueKill(first.game.ram, precedingId);
  runObjectDriver(first.game.ram, new Map(), driverContext(state.objectDriverHook));
  assert.equal(state.lifecycle, 'alive');
  assert.equal(resolveThreePilotActor(state), ALLOC.table,
    'P3 is found by its full ID after deletion memmoves its record');
  assert.equal(Object.hasOwn(state, 'actorAddress'), false);

  const dropped = fakeGame({ priority: 0x10 });
  dropped.game.ram.setU32(ALLOC.idCounter, 0x22000000);
  for (let i = 0; i < ALLOC.slots; i++) {
    const rec = ALLOC.table + i * ALLOC.stride;
    dropped.game.ram.setU16(rec, 0x8004);
    dropped.game.ram.setU16(rec + ALLOC.priOff, 0x7fff);
    dropped.game.ram.setU32(rec + ALLOC.idOff, 0x33000000 + i);
  }
  const droppedState = attachThreePilotFoundation(dropped.game, { inputWord: 0xffff });
  const result = runObjectDriver(dropped.game.ram, new Map(),
    driverContext(droppedState.objectDriverHook));
  assert.equal(result, ALLOC.slots);
  assert.equal(droppedState.lifecycle, 'dropped');
  assert.equal(resolveThreePilotActor(droppedState), null);
  assert.equal(objectByMarker(dropped.game.ram, 3, 2), null);
  assert.equal(droppedState.memory.u16(P3_VIRTUAL.player + P.state), 0);
});

test('W611 allocator wrap keeps a live full-ID P3 resolvable and intercepted', () => {
  const { game } = fakeGame({ priority: 0x10 });
  game.ram.setU32(ALLOC.idCounter, 0xfffffffe);
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  assert.equal(state.actorId, 0xffffffff);
  activate(state);
  assert.equal(state.lifecycle, 'alive');

  const ordinary = stageCreate(game.ram, 4, () => 0x10);
  assert.equal(ordinary.ok, true);
  assert.equal(game.ram.u32(ordinary.addr + ALLOC.idOff), 0);
  assert.equal(game.ram.u32(ALLOC.idCounter), 0);
  game.ram.setU8(ordinary.addr + 0x07, 0);

  let nativeType3Calls = 0;
  const processed = runObjectDriver(game.ram, new Map([[3, () => {
    nativeType3Calls++;
  }]]), driverContext(state.objectDriverHook));
  assert.equal(processed, 2);
  assert.equal(state.lifecycle, 'alive');
  const p3 = objectByMarker(game.ram, 3, 2);
  assert.notEqual(p3, null);
  assert.equal(actorId(game.ram, p3), 0xffffffff);
  assert.strictEqual(resolveThreePilotActor(state), p3);
  assert.equal(nativeType3Calls, 0,
    'marker 2 remains owned by the P3 hook after an ordinary ID-zero create');
});

test('W611 reset detaches P3 and later prepare honestly restages it', () => {
  const rightAngle = 1 << BIT.right;
  const { game } = fakeGame({
    priority: 0x10,
    vectors: { [rightAngle]: { dy: 0, dx: 0x0100 } },
  });
  const idle = portWordFromPlayerBits([], []);
  const right = portWordFromPlayerBits([BIT.right], []);
  const resetter = stageCreate(game.ram, 4, () => 0x10);
  assert.equal(resetter.ok, true);
  const state = attachThreePilotFoundation(game, { inputWord: idle });
  const installedHook = game.objectDriverHook;
  const installedTransform = game.playerPositionTransform;
  const oldId = state.actorId;
  activate(state);
  assert.equal(state.lifecycle, 'alive');
  assert.notEqual(resolveThreePilotActor(state), null);

  runObjectDriver(game.ram, new Map([[4, (ram) => objTableInit24107C(ram)]]),
    driverContext(state.objectDriverHook));
  assert.equal(game.ram.u32(ALLOC.idCounter), 0);
  assert.equal(state.lifecycle, 'detached');
  assert.equal(state.actorId, 0);
  assert.equal(state.restagePending, true);
  assert.equal(state.memory.u16(P3_VIRTUAL.player + P.state), 0);
  assert.equal(resolveThreePilotActor(state), null);
  assert.equal(objectByMarker(game.ram, 3, 2), null);

  game.ram.setU32(ALLOC.idCounter, 0xffffffff);
  const zeroRefusalRam = game.ram.b.slice();
  const zeroRefusalPositions = formationPositions(state);
  const zeroRefusalInput = [
    state.memory.u16(P3_VIRTUAL.input.raw),
    state.memory.u16(P3_VIRTUAL.input.previous),
    state.memory.u16(P3_VIRTUAL.input.edge),
  ];
  const zeroRefusalAnchor = [state.runtime.anchorY, state.runtime.anchorX];
  assert.equal(prepareThreePilotFrame(state, game, 0x10000 | right), right,
    'a recovery that would allocate ID zero leaves physical input unchanged');
  assert.deepEqual(game.ram.b, zeroRefusalRam);
  assert.deepEqual(formationPositions(state), zeroRefusalPositions);
  assert.deepEqual([
    state.memory.u16(P3_VIRTUAL.input.raw),
    state.memory.u16(P3_VIRTUAL.input.previous),
    state.memory.u16(P3_VIRTUAL.input.edge),
  ], zeroRefusalInput);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], zeroRefusalAnchor);
  assert.deepEqual([state.lifecycle, state.actorId, state.restagePending],
    ['detached', 0, true]);

  objTableInit24107C(game.ram);
  game.ram.setU32(ALLOC.idCounter, 0x100);
  for (let i = 0; i < ALLOC.slots; i++) {
    const made = stageCreate(game.ram, 4, () => 0x10);
    assert.equal(made.ok, true);
    game.ram.setU8(made.addr + 0x07, 0);
  }
  assert.equal(game.ram.u16(ALLOC.createSp), ALLOC.createCap);
  const fullQueueRam = game.ram.b.slice();
  const fullQueuePositions = formationPositions(state);
  const fullQueueInput = [
    state.memory.u16(P3_VIRTUAL.input.raw),
    state.memory.u16(P3_VIRTUAL.input.previous),
    state.memory.u16(P3_VIRTUAL.input.edge),
  ];
  const fullQueueAnchor = [state.runtime.anchorY, state.runtime.anchorX];
  assert.equal(prepareThreePilotFrame(state, game, 0x10000 | right), right,
    'a full create queue retries later without transforming input');
  assert.deepEqual(game.ram.b, fullQueueRam,
    'queue-full recovery writes neither the queue nor its dummy alias');
  assert.deepEqual(formationPositions(state), fullQueuePositions);
  assert.deepEqual([
    state.memory.u16(P3_VIRTUAL.input.raw),
    state.memory.u16(P3_VIRTUAL.input.previous),
    state.memory.u16(P3_VIRTUAL.input.edge),
  ], fullQueueInput);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], fullQueueAnchor);
  assert.deepEqual([state.lifecycle, state.actorId, state.restagePending],
    ['detached', 0, true]);

  objTableInit24107C(game.ram);
  const anchorBeforeRecovery = state.runtime.anchorX;
  const recoveredInput = prepareThreePilotFrame(state, game, 0x10000 | right);
  assert.equal(recoveredInput, transformThreePilotInput(state, right));
  assert.notEqual(recoveredInput, right);
  assert.equal(state.lifecycle, 'staged');
  assert.equal(state.restagePending, false);
  assert.equal(state.actorId, 1);
  assert.notEqual(state.actorId, oldId);
  assert.equal(game.ram.u16(ALLOC.createSp), ALLOC.stride);
  assert.equal(game.ram.u16(ALLOC.createStage) & 0xff, 3);
  assert.equal(game.ram.u8(ALLOC.createStage + 0x07), 2);
  assert.equal(game.ram.u32(ALLOC.createStage + ALLOC.idOff), state.actorId);
  assert.equal(state.memory.u16(P3_VIRTUAL.player + P.state), 0,
    'the recovered actor remains dead while staged');
  assert.equal(state.runtime.anchorX, anchorBeforeRecovery + 0x0100);
  assert.deepEqual([
    game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
    game.ram.u16(RAM.player2 + P.posY), game.ram.u16(RAM.player2 + P.posX),
  ], [
    state.runtime.targets[0].y, state.runtime.targets[0].x,
    state.runtime.targets[1].y, state.runtime.targets[1].x,
  ], 'native geometry resumes as soon as recovery is honestly staged');
  const expectedP3Input = mirrorsFromPort(right).p1 & 0x005f;
  assert.deepEqual([
    state.memory.u16(P3_VIRTUAL.input.raw),
    state.memory.u16(P3_VIRTUAL.input.previous),
    state.memory.u16(P3_VIRTUAL.input.edge),
  ], [expectedP3Input, expectedP3Input, expectedP3Input]);
  assert.strictEqual(game.objectDriverHook, installedHook);
  assert.strictEqual(game.playerPositionTransform, installedTransform);

  assert.deepEqual(activate(state), ['ok']);
  assert.equal(state.lifecycle, 'alive');
  const recovered = resolveThreePilotActor(state);
  assert.notEqual(recovered, null);
  assert.equal(game.ram.u16(recovered) & 0xff, 3);
  assert.equal(game.ram.u8(recovered + 0x07), 2);
  assert.equal(actorId(game.ram, recovered), state.actorId);
  assert.equal(state.memory.u16(P3_VIRTUAL.player + P.state), 0x8000);
  assert.deepEqual([
    state.memory.u16(P3_VIRTUAL.player + P.posY),
    state.memory.u16(P3_VIRTUAL.player + P.posX),
  ], [state.runtime.targets[2].y, state.runtime.targets[2].x]);

  const aliveAnchor = state.runtime.anchorX;
  prepareThreePilotFrame(state, game, right);
  assert.equal(state.runtime.anchorX, aliveAnchor + 0x0100);
  assert.deepEqual([
    state.memory.u16(P3_VIRTUAL.player + P.posY),
    state.memory.u16(P3_VIRTUAL.player + P.posX),
  ], [state.runtime.targets[2].y, state.runtime.targets[2].x]);

  let nativeType3Calls = 0;
  assert.equal(runObjectDriver(game.ram, new Map([[3, () => {
    nativeType3Calls++;
  }]]), driverContext(state.objectDriverHook)), 1);
  assert.equal(nativeType3Calls, 0,
    'the recovered marker-2 actor never aliases the native P2 path');
  assert.equal(state.lifecycle, 'alive');
  assert.strictEqual(game.objectDriverHook, installedHook);
  assert.strictEqual(game.playerPositionTransform, installedTransform);
});

test('W611 marker 2 bypasses native player resources and unknown marker 2 fails loudly', () => {
  const { game } = fakeGame();
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  activate(state);
  const before = snapshots(game.ram, PRIVATE_RANGES);
  let nativeCalls = 0;
  const native = new Map([[3, (ram) => {
    nativeCalls++;
    ram.setU16(RAM.player2 + P.state, 0xdead);
  }]]);
  assert.equal(runObjectDriver(game.ram, native, driverContext(state.objectDriverHook)), 1);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(snapshots(game.ram, PRIVATE_RANGES), before,
    'marker-2 dispatch writes no P1/P2 player, option, shot, beam, hyper, score, bomb, lives, tally, or input bytes');

  const unknown = stageCreate(game.ram, 3, () => 0x10);
  assert.equal(unknown.ok, true);
  game.ram.setU8(unknown.addr + 0x07, 2);
  assert.throws(() => runObjectDriver(game.ram, native,
    driverContext(state.objectDriverHook)), /unknown marker-2 type-3 object/);
  assert.equal(nativeCalls, 0);

  const noController = fakeGame();
  const unclaimed = stageCreate(noController.game.ram, 3, () => 0x10);
  noController.game.ram.setU8(unclaimed.addr + 0x07, 2);
  assert.throws(() => runObjectDriver(noController.game.ram, native,
    driverContext(null)), /marker-2 type-3 object.*not intercepted/);
});

test('W611 P3 input has independent raw, previous, and edge words with safe copying', () => {
  const initial = portWordFromPlayerBits([
    BIT.up, BIT.left, BIT.b1, BIT.b2, BIT.b3, BIT.start,
  ], []);
  const { game } = fakeGame();
  const state = attachThreePilotFoundation(game, { inputWord: initial });
  activate(state);
  const input = P3_FORMATION_ACTOR_BINDING.input;
  assert.equal(new Set([input.raw, input.previous, input.edge]).size, 3);
  const expectedInitial = mirrorsFromPort(initial).p1 & 0x005f;
  assert.deepEqual([
    state.memory.u16(input.raw),
    state.memory.u16(input.previous),
    state.memory.u16(input.edge),
  ], [expectedInitial, expectedInitial, 0], 'attachment seeds previous without an edge');

  const nativeBefore = bytes(game.ram, RAM.p1raw, 0x0c);
  prepareThreePilotFrame(state, game, initial);
  assert.equal(state.memory.u16(input.edge), 0);
  prepareThreePilotFrame(state, game, portWordFromPlayerBits([], []));
  assert.deepEqual([
    state.memory.u16(input.raw), state.memory.u16(input.previous),
    state.memory.u16(input.edge),
  ], [0, 0, 0]);

  const pressed = portWordFromPlayerBits([
    BIT.right, BIT.b1, BIT.b2, BIT.b3, BIT.start,
  ], []);
  prepareThreePilotFrame(state, game, pressed);
  const expected = (1 << BIT.right) | (1 << BIT.b1) | (1 << BIT.b3);
  assert.deepEqual([
    state.memory.u16(input.raw), state.memory.u16(input.previous),
    state.memory.u16(input.edge),
  ], [expected, expected, expected]);
  assert.equal(state.memory.u16(input.raw) & (1 << BIT.b2), 0);
  assert.equal(state.memory.u16(input.raw) & (1 << BIT.start), 0);
  assert.deepEqual(bytes(game.ram, RAM.p1raw, 0x0c), nativeBefore,
    'virtual P3 input never borrows either native input range');
});

test('W611 stage clear suspends geometry and rebases from P1, P2, then P3', () => {
  const cases = [
    {
      name: 'P1', p1State: 0x8000, p2State: 0x8000,
      expectedAnchor: [0x3100, 0x1a00],
    },
    {
      name: 'P2 fallback', p1State: 0x8100, p2State: 0x8000,
      expectedAnchor: [0x4200, 0x1e00],
    },
    {
      name: 'P3 fallback', p1State: 0x8100, p2State: 0x8100,
      expectedAnchor: [0x5300, 0x2a00],
    },
  ];
  const idle = portWordFromPlayerBits([], []);

  for (const entry of cases) {
    const { game } = fakeGame();
    const state = attachThreePilotFoundation(game, { inputWord: idle });
    activate(state);
    game.ram.setU16(RAM.player1 + P.state, entry.p1State);
    game.ram.setU16(RAM.player2 + P.state, entry.p2State);
    game.ram.setU16(0x812972, 1);
    game.ram.setU16(RAM.player1 + P.posY, 0x3100);
    game.ram.setU16(RAM.player1 + P.posX, 0x1200);
    game.ram.setU16(RAM.player2 + P.posY, 0x4200);
    game.ram.setU16(RAM.player2 + P.posX, 0x2600);
    state.memory.setU16(P3_VIRTUAL.player + P.posY, 0x5300);
    state.memory.setU16(P3_VIRTUAL.player + P.posX, 0x2a00);
    const suspendedPositions = formationPositions(state);
    const suspendedAnchor = [state.runtime.anchorY, state.runtime.anchorX];

    prepareThreePilotFrame(state, game, idle);
    assert.deepEqual(formationPositions(state), suspendedPositions,
      `${entry.name} scripted stage-clear positions remain untouched`);
    assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], suspendedAnchor);
    assert.equal(state.runtime.rebasePending, true);

    game.ram.setU16(0x812972, 0);
    prepareThreePilotFrame(state, game, idle);
    assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], entry.expectedAnchor,
      `${entry.name} owns the first post-clear anchor`);
    assert.equal(state.runtime.rebasePending, false);
  }
});

test('W611 caches P1 speed while P2 or P3 survives P1 death', () => {
  const angle = 1 << BIT.right;
  const { game, calls } = fakeGame({
    speed: 0x22,
    vectors: { [angle]: { dy: 0, dx: 0x0100 } },
  });
  const idle = portWordFromPlayerBits([], []);
  const right = portWordFromPlayerBits([BIT.right], []);
  const state = attachThreePilotFoundation(game, { inputWord: idle });
  activate(state);

  prepareThreePilotFrame(state, game, right);
  const firstAnchorX = state.runtime.anchorX;
  game.ram.setU16(RAM.player1 + P.state, 0x8100);
  game.ram.setU8(RAM.player1 + P.speedIdx, 0x77);
  game.ram.setU16(RAM.player1 + P.posY, 0x7777);
  game.ram.setU16(RAM.player1 + P.posX, 0x6666);
  prepareThreePilotFrame(state, game, right);

  assert.deepEqual(calls.vectors, [[0x22, angle], [0x22, angle]],
    'dead P1 still owns steering through its last live speed');
  assert.equal(state.runtime.anchorX, firstAnchorX + 0x0100);
  assert.deepEqual([
    game.ram.u16(RAM.player1 + P.posY),
    game.ram.u16(RAM.player1 + P.posX),
  ], [0x7777, 0x6666], 'formation geometry never overwrites the death record');
});

test('W611 three-target geometry uses P1 steering and exact four-wall clamps', () => {
  const cases = [
    {
      name: 'left', bit: BIT.left, p1Y: 0x2000, p1X: 0x0300,
      vector: { dy: 0, dx: -0x900 }, anchor: [0x2000, 0x0b00],
      native: [0x2000, 0x0300, 0x2000, 0x1300], p3: [0x2000, 0x0b00],
    },
    {
      name: 'right', bit: BIT.right, p1Y: 0x2000, p1X: 0x2500,
      vector: { dy: 0, dx: 0x900 }, anchor: [0x2000, 0x2d00],
      native: [0x2000, 0x2500, 0x2000, 0x3500], p3: [0x2000, 0x2d00],
    },
    {
      name: 'bottom', bit: BIT.down, p1Y: 0x0800, p1X: 0x1000,
      vector: { dy: -0x900, dx: 0 }, anchor: [0x0800, 0x1800],
      native: [0x0800, 0x1000, 0x0800, 0x2000], p3: [0x0800, 0x1800],
    },
    {
      name: 'top', bit: BIT.up, p1Y: 0x6500, p1X: 0x1000,
      vector: { dy: 0x900, dx: 0 }, anchor: [0x6500, 0x1800],
      native: [0x6500, 0x1000, 0x6500, 0x2000], p3: [0x6500, 0x1800],
    },
  ];

  for (const entry of cases) {
    const angle = 1 << entry.bit;
    const { game, calls } = fakeGame({
      p1Y: entry.p1Y,
      p1X: entry.p1X,
      vectors: { [angle]: entry.vector },
    });
    const state = attachThreePilotFoundation(game,
      { inputWord: portWordFromPlayerBits([], []) });
    activate(state);
    prepareThreePilotFrame(state, game,
      portWordFromPlayerBits([entry.bit], []));
    assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], entry.anchor,
      `${entry.name} anchor`);
    assert.deepEqual([
      game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
      game.ram.u16(RAM.player2 + P.posY), game.ram.u16(RAM.player2 + P.posX),
    ], entry.native, `${entry.name} native targets`);
    assert.deepEqual([
      state.memory.u16(P3_VIRTUAL.player + P.posY),
      state.memory.u16(P3_VIRTUAL.player + P.posX),
    ], entry.p3, `${entry.name} P3 center target`);
    assert.deepEqual(calls.vectors, [[0x17, angle]],
      `${entry.name} movement uses the P1 speed and direction`);
  }
});
