// W611: P1-owned three-ship formation foundation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { MACHINE, P, RAM, BIT } from '../src/machine.js';
import {
  ALLOC, commitCreates, objTableInit24107C, stageCreate,
} from '../src/objalloc.js';
import { ObjOrder, runObjectDriver } from '../src/objdriver.js';
import { UnportedLog } from '../src/unported.js';
import { MOD_IDS, MODS } from '../src/mods.js';
import {
  FORMATION_MODE, FORMATION_THREE_MODE, formationMode, formationToHash,
  hashToFormation,
} from '../src/formation.js';
import { portWordFromPlayerBits, mirrorsFromPort } from '../src/input.js';
import {
  FORMATION_ACTOR_BINDINGS, P3_FORMATION_ACTOR_BINDING, P3_VIRTUAL_BASE,
  StrictSidecarMemory, THREE_PILOT_FORMATION_MODE, attachFormationCompanions,
  attachThreePilotFoundation, formationActorBindingForMarker,
  prepareFormationCompanionFrame, resolveThreePilotActor,
  threePilotFoundationForGame, transformThreePilotInput,
} from '../src/formationactors.js';

function fakeGame({
  p1Y = 0x2000,
  p1X = 0x1000,
  p2Y = 0x3000,
  p2X = 0x3300,
  p1State = 0x8000,
  p2State = 0x8000,
  speed = 0x17,
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
    rom: {
      u16(address) {
        if (address >= ALLOC.dispatch && address < ALLOC.dispatch + 0x40) return 0x10;
        return 0;
      },
    },
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

function activate(managerValue) {
  const manager = managerValue.companions ? managerValue : managerValue.manager;
  const created = commitCreates(manager.game.ram);
  manager.objectDriverHook({
    phase: 'after-commit', ram: manager.game.ram, killed: 0, created,
  });
  return created;
}

function objectByMarker(ram, type, marker) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0xff) === type && ram.u8(rec + 0x07) === marker) return rec;
  }
  return null;
}

function actorId(ram, rec) {
  return ram.u32(rec + ALLOC.idOff);
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

function bytes(ram, address, length) {
  const offset = address - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

test('W611 publishes the exact P1-owned three-ship mode outside the mod catalogue', () => {
  const id = 'all-three-pilots-each-piloting-a-ship';
  assert.deepEqual(THREE_PILOT_FORMATION_MODE, {
    id,
    name: 'All Three Pilots, Each Piloting a Ship',
    authenticSelection: { ship: 0, style: 2 },
    companions: [
      { ship: 0, style: 6, marker: 2, position: 'center' },
      { ship: 2, style: 4, marker: 3, position: 'right' },
    ],
  });
  assert.strictEqual(FORMATION_THREE_MODE, THREE_PILOT_FORMATION_MODE);
  assert.strictEqual(formationMode(FORMATION_MODE.id), FORMATION_MODE);
  assert.strictEqual(formationMode(id), THREE_PILOT_FORMATION_MODE);
  assert.strictEqual(hashToFormation(`#formation=${id}`), THREE_PILOT_FORMATION_MODE);
  assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE), `formation=${id}`);
  assert.equal(MOD_IDS.length, 36);
  assert.equal(MOD_IDS.includes(id), false);
  assert.equal(Object.hasOwn(MODS, id), false);

  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  assert.match(start, /id="formation-three"/);
  assert.match(start, /All Three Ships/);
});

test('W611 bindings reserve markers 2 and 3 for companions and never claim marker 1', () => {
  assert.deepEqual(FORMATION_ACTOR_BINDINGS.map((binding) => ({
    logicalIndex: binding.logicalIndex,
    marker: binding.marker,
    objectType: binding.objectType,
    targetIndex: binding.targetIndex,
    selection: binding.selection ?? null,
  })), [
    { logicalIndex: 0, marker: 0, objectType: 2, targetIndex: 0, selection: null },
    { logicalIndex: 2, marker: 2, objectType: 3, targetIndex: 2,
      selection: { ship: 0, style: 6 } },
    { logicalIndex: 2, marker: 3, objectType: 3, targetIndex: 1,
      selection: { ship: 2, style: 4 } },
  ]);
  assert.strictEqual(formationActorBindingForMarker(2), P3_FORMATION_ACTOR_BINDING);
  assert.equal(formationActorBindingForMarker(3).marker, 3);
  assert.throws(() => formationActorBindingForMarker(1), /unknown formation actor marker 1/);
});

test('W611 sidecars are big-endian, strict, delegated, and isolated', () => {
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
  memory.setU16(RAM.p1raw, 0x1234);
  assert.equal(real.u16(RAM.p1raw), 0x1234);
  assert.throws(() => memory.u8(virtual + 4), /undeclared virtual address/);
  assert.throws(() => memory.u8(RAM.p1raw + 2), /undeclared shared address/);
  assert.throws(() => memory.u32(virtual + 8), /crosses second/);

  const a = attachThreePilotFoundation(fakeGame().game);
  const b = attachThreePilotFoundation(fakeGame({ p1X: 0x2000 }).game);
  assert.notStrictEqual(a.memory, b.memory);
  a.memory.setU32(a.binding.virtual.score, 0x10203040);
  assert.equal(a.memory.u32(a.binding.virtual.score), 0x10203040);
  assert.equal(b.memory.u32(b.binding.virtual.score), 0);
});

test('W611 attachment stages two unique private actors and leaves native P2 untouched', () => {
  const { game } = fakeGame();
  const p2Before = bytes(game.ram, RAM.player2, P.stride);
  const manager = attachFormationCompanions(game, {
    mode: THREE_PILOT_FORMATION_MODE,
    companions: THREE_PILOT_FORMATION_MODE.companions,
    inputWord: 0xffff,
  });
  assert.equal(manager.companions.length, 2);
  assert.deepEqual(manager.companions.map((state) => state.binding.marker), [2, 3]);
  assert.deepEqual(manager.companions.map((state) => state.binding.virtual.player),
    [P3_VIRTUAL_BASE + 0x0100, P3_VIRTUAL_BASE + 0x10100]);
  assert.deepEqual(activate(manager), ['ok', 'ok']);
  assert.deepEqual(manager.companions.map((state) => state.lifecycle), ['alive', 'alive']);

  const marker2 = objectByMarker(game.ram, 3, 2);
  const marker3 = objectByMarker(game.ram, 3, 3);
  assert.notEqual(marker2, null);
  assert.notEqual(marker3, null);
  assert.equal(objectByMarker(game.ram, 3, 1), null);
  assert.equal(new Set([actorId(game.ram, marker2), actorId(game.ram, marker3)]).size, 2);
  assert.deepEqual(resolveThreePilotActor(manager), [marker2, marker3]);
  assert.deepEqual(bytes(game.ram, RAM.player2, P.stride), p2Before);
  assert.strictEqual(threePilotFoundationForGame(game), manager.companions[0]);
});

test('W611 P1 controls both companions while the physical word and P2 input stay exact', () => {
  const initial = portWordFromPlayerBits([], [BIT.left, BIT.b1]);
  const { game } = fakeGame();
  game.ram.setU16(RAM.p2raw, 0x1357);
  game.ram.setU16(RAM.p2prev, 0x2468);
  game.ram.setU16(RAM.p2edge, 0x369c);
  const manager = attachFormationCompanions(game, {
    mode: THREE_PILOT_FORMATION_MODE,
    companions: THREE_PILOT_FORMATION_MODE.companions,
    inputWord: initial,
  });
  activate(manager);

  const pressed = portWordFromPlayerBits([
    BIT.right, BIT.b1, BIT.b2, BIT.b3, BIT.start,
  ], [BIT.up, BIT.b1]);
  assert.equal(transformThreePilotInput(manager, pressed), pressed & 0xffff);
  assert.equal(prepareFormationCompanionFrame(manager, game, pressed), pressed & 0xffff);
  const expected = mirrorsFromPort(pressed).p1 & 0x005f;
  for (const state of manager.companions) {
    assert.equal(state.memory.u16(state.binding.input.raw), expected);
    assert.equal(state.memory.u16(state.binding.input.previous), expected);
    assert.equal(state.memory.u16(state.binding.input.edge), expected);
    assert.equal(state.memory.u16(state.binding.input.raw) & (1 << BIT.b2), 0);
    assert.equal(state.memory.u16(state.binding.input.raw) & (1 << BIT.start), 0);
  }
  assert.deepEqual([
    game.ram.u16(RAM.p2raw), game.ram.u16(RAM.p2prev), game.ram.u16(RAM.p2edge),
  ], [0x1357, 0x2468, 0x369c]);
});

test('W611 three-ship geometry moves P1, center, and right from P1 alone', () => {
  const angle = 1 << BIT.right;
  const { game, calls } = fakeGame({
    p1Y: 0x2000,
    p1X: 0x1000,
    p2Y: 0x4444,
    p2X: 0x5555,
    vectors: { [angle]: { dy: 0x0200, dx: 0x0100 } },
  });
  const manager = attachFormationCompanions(game, {
    mode: THREE_PILOT_FORMATION_MODE,
    companions: THREE_PILOT_FORMATION_MODE.companions,
    inputWord: portWordFromPlayerBits([], []),
  });
  activate(manager);
  prepareFormationCompanionFrame(manager, game,
    portWordFromPlayerBits([BIT.right], []));

  assert.deepEqual([manager.runtime.anchorY, manager.runtime.anchorX], [0x2200, 0x1900]);
  assert.deepEqual([
    game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
  ], [0x2200, 0x1100]);
  const [center, right] = manager.companions;
  assert.deepEqual([
    center.memory.u16(center.binding.player + P.posY),
    center.memory.u16(center.binding.player + P.posX),
  ], [0x2200, 0x1900]);
  assert.deepEqual([
    right.memory.u16(right.binding.player + P.posY),
    right.memory.u16(right.binding.player + P.posX),
  ], [0x2200, 0x2100]);
  assert.deepEqual([
    game.ram.u16(RAM.player2 + P.posY), game.ram.u16(RAM.player2 + P.posX),
  ], [0x4444, 0x5555]);
  assert.deepEqual(calls.vectors, [[0x17, angle]]);
  assert.equal(game.playerPositionTransform(game.ram, 1, 0, 0), null);
});

test('W611 P1 death and stage clear suspend both companions without P2 lifecycle', () => {
  const { game } = fakeGame({ p2State: 0x8123 });
  const manager = attachFormationCompanions(game, {
    mode: THREE_PILOT_FORMATION_MODE,
    companions: THREE_PILOT_FORMATION_MODE.companions,
  });
  activate(manager);
  const ids = manager.companions.map((state) => state.actorId);
  const p2Before = bytes(game.ram, RAM.player2, P.stride);

  game.ram.setU16(RAM.player1 + P.state, 0x8100);
  prepareFormationCompanionFrame(manager, game, 0xffff);
  assert.deepEqual(manager.companions.map((state) =>
    state.memory.u16(state.binding.player + P.state)), [0, 0]);
  assert.deepEqual(manager.companions.map((state) => state.actorId), ids);
  assert.deepEqual(bytes(game.ram, RAM.player2, P.stride), p2Before);

  game.ram.setU16(RAM.player1 + P.state, 0x8000);
  game.ram.setU16(RAM.player1 + P.posY, 0x3100);
  game.ram.setU16(RAM.player1 + P.posX, 0x1200);
  prepareFormationCompanionFrame(manager, game, 0xffff);
  assert.deepEqual(manager.companions.map((state) =>
    state.memory.u16(state.binding.player + P.state)), [0x8000, 0x8000]);

  game.ram.setU16(0x812972, 1);
  prepareFormationCompanionFrame(manager, game, 0xffff);
  assert.deepEqual(manager.companions.map((state) =>
    state.memory.u16(state.binding.player + P.state)), [0, 0]);
  game.ram.setU16(0x812972, 0);
  prepareFormationCompanionFrame(manager, game, 0xffff);
  assert.deepEqual([manager.runtime.anchorY, manager.runtime.anchorX], [0x3100, 0x1a00]);
  assert.deepEqual(manager.companions.map((state) =>
    state.memory.u16(state.binding.player + P.state)), [0x8000, 0x8000]);
  assert.deepEqual(bytes(game.ram, RAM.player2, P.stride), p2Before);
});

test('W611 markers 2 and 3 fail closed before native P2 dispatch without the manager', () => {
  for (const marker of [2, 3]) {
    const { game } = fakeGame();
    const staged = stageCreate(game.ram, 3, () => 0x10);
    assert.equal(staged.ok, true);
    game.ram.setU8(staged.addr + 0x07, marker);
    commitCreates(game.ram);
    let nativeCalls = 0;
    assert.throws(() => runObjectDriver(game.ram, new Map([[3, () => {
      nativeCalls++;
    }]]), driverContext(null)),
    new RegExp(`marker-${marker} type-3 object.*was not intercepted`));
    assert.equal(nativeCalls, 0);
  }
});

test('W611 manager intercepts markers 2 and 3 but preserves genuine marker-1 P2 dispatch', () => {
  const { game } = fakeGame();
  const state = attachThreePilotFoundation(game);
  activate(state);
  const genuineP2 = stageCreate(game.ram, 3, () => 0x10);
  assert.equal(genuineP2.ok, true);
  game.ram.setU8(genuineP2.addr + 0x07, 1);
  commitCreates(game.ram);

  let nativeCalls = 0;
  const processed = runObjectDriver(game.ram, new Map([[3, () => {
    nativeCalls++;
  }]]), driverContext(state.objectDriverHook));
  assert.equal(processed, 3);
  assert.equal(nativeCalls, 1);
  assert.notEqual(objectByMarker(game.ram, 3, 1), null);
  assert.notEqual(objectByMarker(game.ram, 3, 2), null);
  assert.notEqual(objectByMarker(game.ram, 3, 3), null);
});

test('W611 allocator reset detaches and restages both companions together', () => {
  const { game } = fakeGame();
  const manager = attachFormationCompanions(game, {
    mode: THREE_PILOT_FORMATION_MODE,
    companions: THREE_PILOT_FORMATION_MODE.companions,
  });
  activate(manager);
  const oldIds = manager.companions.map((state) => state.actorId);

  objTableInit24107C(game.ram);
  manager.objectDriverHook({
    phase: 'after-driver', ram: game.ram, created: 0, killed: 0,
  });
  assert.deepEqual(manager.companions.map((state) => state.lifecycle),
    ['detached', 'detached']);
  assert.deepEqual(manager.companions.map((state) => state.actorId), [0, 0]);

  prepareFormationCompanionFrame(manager, game, 0xffff);
  assert.deepEqual(manager.companions.map((state) => state.lifecycle), ['staged', 'staged']);
  assert.deepEqual(activate(manager), ['ok', 'ok']);
  assert.deepEqual(manager.companions.map((state) => state.lifecycle), ['alive', 'alive']);
  assert.deepEqual(manager.companions.map((state) => state.actorId), oldIds,
    'allocator reset may honestly reuse the first two complete IDs');
  assert.equal(new Set(manager.companions.map((state) => state.actorId)).size, 2);
  assert.notEqual(objectByMarker(game.ram, 3, 2), null);
  assert.notEqual(objectByMarker(game.ram, 3, 3), null);
});

test('W611 attachment rejects conflicting hooks and zero companion identities atomically', () => {
  const conflict = fakeGame();
  const transform = () => null;
  conflict.game.playerPositionTransform = transform;
  const before = conflict.game.ram.b.slice();
  assert.throws(() => attachThreePilotFoundation(conflict.game),
    /already has a playerPositionTransform/);
  assert.strictEqual(conflict.game.playerPositionTransform, transform);
  assert.deepEqual(conflict.game.ram.b, before);
  assert.equal(threePilotFoundationForGame(conflict.game), null);

  const wrapped = fakeGame();
  wrapped.game.ram.setU32(ALLOC.idCounter, 0xffffffff);
  const wrappedBefore = wrapped.game.ram.b.slice();
  assert.throws(() => attachThreePilotFoundation(wrapped.game),
    /formation companion allocator ID would wrap to zero/);
  assert.deepEqual(wrapped.game.ram.b, wrappedBefore);
  assert.equal(threePilotFoundationForGame(wrapped.game), null);
});
