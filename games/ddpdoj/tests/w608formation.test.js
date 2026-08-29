// W608 Wave 1: synchronized authentic two-ship formation runtime and player seams.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { ProtLatch } from '../src/protsim.js';
import { Game } from '../src/main.js';
import { playerObject2491C0, updatePlayer } from '../src/player.js';
import { ALLOC, commitCreates } from '../src/objalloc.js';
import { MACHINE, P, RAM, BIT } from '../src/machine.js';
import {
  portWordFromPlayerBits, mirrorsFromPort,
} from '../src/input.js';
import {
  MODS, MOD_IDS, createModState, resolveLoadout, transformModInput,
} from '../src/mods.js';
import {
  FORMATION_MODE,
  createFormationState,
  formationGameOptions,
  formationMode,
  formationToHash,
  hashToFormation,
  initializeFormation,
  prepareFormationFrame,
  resolveFormationAuthenticSelection,
  transformFormationInput,
} from '../src/formation.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
const MOVE = new MoveTables(TABLES, ROM);
const ID = 'fly-both-ships-side-by-side';

function activeState() {
  return createFormationState(formationMode(ID));
}

function seedPlayers(ram, {
  p1State = 0x8000,
  p2State = 0x8000,
  p1Y = 0x2000,
  p1X = 0x1000,
  p2Y = 0x2800,
  p2X = 0x2800,
  speed = 7,
} = {}) {
  ram.setU16(RAM.player1 + P.state, p1State);
  ram.setU16(RAM.player2 + P.state, p2State);
  ram.setU16(RAM.player1 + P.posY, p1Y);
  ram.setU16(RAM.player1 + P.posX, p1X);
  ram.setU16(RAM.player2 + P.posY, p2Y);
  ram.setU16(RAM.player2 + P.posX, p2X);
  ram.setU8(RAM.player1 + P.speedIdx, speed);
}

function fakeGame(options = {}) {
  const ram = new Ram();
  seedPlayers(ram, options);
  const calls = { angles: [], vectors: [] };
  const vectors = options.vectors ?? {
    1: { dy: 0x100, dx: 0 },
    2: { dy: -0x100, dx: 0 },
    4: { dy: 0, dx: -0x100 },
    8: { dy: 0, dx: 0x100 },
  };
  const tables = {
    angleFor(nibble) {
      calls.angles.push(nibble);
      return nibble === 0 ? 0xff : nibble;
    },
    vector(speed, angle) {
      calls.vectors.push([speed, angle]);
      return vectors[angle] ?? { dy: 0, dx: 0 };
    },
  };
  const game = {
    ram,
    rom: {
      u16(address) {
        if (address >= ALLOC.dispatch && address < ALLOC.dispatch + 0x40) return 0x10;
        return 0;
      },
    },
    tables,
  };
  return { game, calls };
}

function activate(state) {
  const manager = state.foundation;
  const created = commitCreates(manager.game.ram);
  manager.objectDriverHook({
    phase: 'after-commit', ram: manager.game.ram, killed: 0, created,
  });
}

function playerSlot(ram, { y = 0x1000, x = 0x0e00 } = {}) {
  const slot = ALLOC.table;
  ram.setU16(slot, 0x8002);
  ram.setU8(slot + 0x03, 0);
  ram.setU8(slot + 0x06, 0);
  ram.setU8(slot + 0x07, 0);
  ram.setU16(slot + 0x08, y);
  ram.setU16(slot + 0x0a, x);
  return slot;
}

function playerCtx(extra = {}) {
  const log = new UnportedLog();
  return {
    rom: ROM,
    tables: MOVE,
    palette: new PaletteState(),
    prot: new ProtLatch(),
    unported: log,
    unportedLog: log,
    soundPost() {},
    effectSpawn() {},
    bulletSpawn() {},
    wallHit() {},
    ...extra,
  };
}

test('W608 formation lookup, hash, selection, and catalogue separation are exact', () => {
  assert.equal(FORMATION_MODE.id, ID);
  assert.equal(FORMATION_MODE.name, 'Fly Both Ships Side by Side');
  assert.strictEqual(formationMode(ID), FORMATION_MODE);
  assert.equal(formationMode(null), null);
  assert.equal(formationMode('unknown-formation'), null);

  const hash = 'formation=fly-both-ships-side-by-side';
  assert.equal(formationToHash(FORMATION_MODE), hash);
  assert.strictEqual(hashToFormation(`#${hash}`), FORMATION_MODE);
  assert.equal(formationToHash('unknown-formation'), '');
  assert.equal(hashToFormation('#formation=unknown-formation'), null);

  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE), {
    ship: 0, style: 2,
  });
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 2, style: 6 }), { ship: 2, style: 6 });
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 2 }), { ship: 2, style: 2 });
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { style: 4 }), { ship: 0, style: 4 });
  assert.equal(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 0, style: 2, p2: { ship: 2, style: 2 } }), null);
  assert.equal(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 9, style: 2 }), null);
  assert.deepEqual(resolveFormationAuthenticSelection(null,
    { ship: 2, style: 6 }), { ship: 2, style: 6 });
  assert.equal(resolveFormationAuthenticSelection(null,
    { ship: 2, style: 6, p2: { ship: 0, style: 4 } }), null);

  assert.equal(MOD_IDS.length, 36);
  assert.equal(MOD_IDS.includes(ID), false);
  assert.equal(Object.hasOwn(MODS, ID), false);
});

test('W608 off and unknown formation paths are true no-ops', () => {
  const { game } = fakeGame();
  const before = game.ram.b.slice();
  const raw = 0x12345;
  assert.equal(createFormationState(null), null);
  assert.equal(createFormationState('unknown-formation'), null);
  assert.equal(formationGameOptions(null), null);
  assert.equal(initializeFormation(null, null), null);
  assert.equal(transformFormationInput(null, raw), raw & 0xffff);
  assert.equal(prepareFormationFrame(null, null, raw), raw & 0xffff);
  assert.deepEqual(game.ram.b, before);
});

test('W608 formation runtime is isolated per Game', () => {
  const a = fakeGame({ p1Y: 0x1800, p1X: 0x0800 });
  const b = fakeGame({ p1Y: 0x2800, p1X: 0x2000 });
  const stateA = activeState();
  const stateB = activeState();
  initializeFormation(stateA, a.game);
  initializeFormation(stateB, b.game);
  const beforeB = { ...stateB.runtime };

  prepareFormationFrame(stateA, a.game, portWordFromPlayerBits([BIT.right], []));
  assert.notEqual(stateA.runtime.anchorX, beforeB.anchorX);
  assert.equal(stateB.runtime.anchorX, beforeB.anchorX);
  assert.equal(stateB.runtime.anchorY, beforeB.anchorY);
  assert.equal(stateB.runtime.rebasePending, beforeB.rebasePending);
});

test('W608 physical input and genuine P2 stay exact while the companion gets P1 controls', () => {
  const { game } = fakeGame({ p2State: 0x8123, p2Y: 0x3456, p2X: 0x4567 });
  game.ram.setU16(RAM.p2raw, 0x1357);
  game.ram.setU16(RAM.p2prev, 0x2468);
  game.ram.setU16(RAM.p2edge, 0x369c);
  const state = activeState();
  initializeFormation(state, game, {
    inputWord: portWordFromPlayerBits([], [BIT.left, BIT.b1]),
  });
  const p2Before = game.ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  );
  const raw = portWordFromPlayerBits([
    BIT.up, BIT.left, BIT.b1, BIT.b2, BIT.b3, BIT.start,
  ], [BIT.down, BIT.right, BIT.b1, BIT.b2, BIT.b3, BIT.start]);

  assert.equal(transformFormationInput(state, raw), raw & 0xffff);
  assert.equal(prepareFormationFrame(state, game, raw), raw & 0xffff);
  const expected = mirrorsFromPort(raw).p1 & 0x005f;
  const companion = state.foundation.companions[0];
  assert.equal(companion.memory.u16(companion.binding.input.raw), expected);
  assert.equal(companion.memory.u16(companion.binding.input.previous), expected);
  assert.equal(companion.memory.u16(companion.binding.input.edge), expected);
  assert.equal(companion.memory.u16(companion.binding.input.raw) & (1 << BIT.b2), 0);
  assert.equal(companion.memory.u16(companion.binding.input.raw) & (1 << BIT.start), 0);
  assert.deepEqual([
    game.ram.u16(RAM.p2raw), game.ram.u16(RAM.p2prev), game.ram.u16(RAM.p2edge),
  ], [0x1357, 0x2468, 0x369c]);
  assert.deepEqual(game.ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  ), p2Before);
});

test('W608 geometry consumes the final input after catalogue mod transformation', () => {
  const { game, calls } = fakeGame();
  const state = activeState();
  initializeFormation(state, game);
  const raw = portWordFromPlayerBits([BIT.right], []);
  const precision = createModState(resolveLoadout(['precision-ship']));
  const finalInput = transformModInput(precision, raw, 1);

  prepareFormationFrame(state, game, finalInput);
  assert.deepEqual(calls.angles, [0], 'released mod direction is what formation derives');
  assert.deepEqual(calls.vectors, []);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x2000, 0x1400]);
});

test('W608 pre-frame moves P1 and its sidecar companion without writing native P2', () => {
  const angle = 1 << BIT.right;
  const { game, calls } = fakeGame({
    p1Y: 0x2000, p1X: 0x1000, p2Y: 0x3333, p2X: 0x2f00,
    vectors: { [angle]: { dy: 0x0080, dx: 0x0100 } },
  });
  game.ram.setU8(RAM.player1 + P.speedIdx, 0x17);
  const state = activeState();
  initializeFormation(state, game);
  activate(state);
  const p2Before = game.ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  );

  const raw = portWordFromPlayerBits([BIT.right], [BIT.left, BIT.b2]);
  assert.equal(prepareFormationFrame(state, game, raw), raw & 0xffff);
  assert.deepEqual(calls.angles, [angle]);
  assert.deepEqual(calls.vectors, [[0x17, angle]]);
  assert.deepEqual([
    game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
  ], [0x2080, 0x1100]);
  const companion = state.foundation.companions[0];
  assert.deepEqual([
    companion.memory.u16(companion.binding.player + P.posY),
    companion.memory.u16(companion.binding.player + P.posX),
  ], [0x2080, 0x1900]);
  assert.deepEqual(game.ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  ), p2Before);
  assert.deepEqual(game.playerPositionTransform(game.ram, 0, 0, 0),
    { y: 0x2080, x: 0x1100 });
  assert.equal(game.playerPositionTransform(game.ram, 1, 0, 0), null);
  assert.equal(formationGameOptions(state), null);
});

test('W608 anchor clamps both P1-owned ships at all four walls and honors movement disable', () => {
  const cases = [
    { input: BIT.left, p1Y: 0x2000, p1X: 0x0300,
      vectors: { 4: { dy: 0, dx: -0x900 } }, anchor: [0x2000, 0x0700],
      p1: [0x2000, 0x0300], companion: [0x2000, 0x0b00] },
    { input: BIT.right, p1Y: 0x2000, p1X: 0x3500,
      vectors: { 8: { dy: 0, dx: 0x900 } }, anchor: [0x2000, 0x3100],
      p1: [0x2000, 0x2d00], companion: [0x2000, 0x3500] },
    { input: BIT.down, p1Y: 0x0800, p1X: 0x1000,
      vectors: { 2: { dy: -0x900, dx: 0 } }, anchor: [0x0800, 0x1400],
      p1: [0x0800, 0x1000], companion: [0x0800, 0x1800] },
    { input: BIT.up, p1Y: 0x6500, p1X: 0x1000,
      vectors: { 1: { dy: 0x900, dx: 0 } }, anchor: [0x6500, 0x1400],
      p1: [0x6500, 0x1000], companion: [0x6500, 0x1800] },
  ];
  for (const c of cases) {
    const { game } = fakeGame(c);
    const state = activeState();
    initializeFormation(state, game);
    activate(state);
    prepareFormationFrame(state, game, portWordFromPlayerBits([c.input], []));
    assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], c.anchor);
    assert.deepEqual([
      game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
    ], c.p1);
    const companion = state.foundation.companions[0];
    assert.deepEqual([
      companion.memory.u16(companion.binding.player + P.posY),
      companion.memory.u16(companion.binding.player + P.posX),
    ], c.companion);
  }

  const { game, calls } = fakeGame();
  const state = activeState();
  initializeFormation(state, game);
  game.ram.setU16(0x8130d2, 1);
  prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.right], []));
  assert.deepEqual(calls.vectors, []);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x2000, 0x1400]);
});

test('W608 P1 death and stage clear suspend the companion without a live-P2 fallback', () => {
  const { game, calls } = fakeGame({ p2State: 0x8123, speed: 0x22 });
  const state = activeState();
  initializeFormation(state, game);
  activate(state);
  const companion = state.foundation.companions[0];
  const p2Before = game.ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  );
  prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.right], []));
  assert.deepEqual(calls.vectors.at(-1), [0x22, 8]);

  game.ram.setU16(RAM.player1 + P.state, 0x0100);
  const frozenAnchor = [state.runtime.anchorY, state.runtime.anchorX];
  const vectorCount = calls.vectors.length;
  prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.left], []));
  assert.equal(companion.memory.u16(companion.binding.player + P.state), 0);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], frozenAnchor);
  assert.equal(calls.vectors.length, vectorCount);
  assert.equal(game.playerPositionTransform(game.ram, 0, 0, 0), null);
  assert.equal(game.playerPositionTransform(game.ram, 1, 0, 0), null);

  game.ram.setU16(RAM.player1 + P.state, 0x8000);
  game.ram.setU16(RAM.player1 + P.posY, 0x2400);
  game.ram.setU16(RAM.player1 + P.posX, 0x1800);
  prepareFormationFrame(state, game, 0xffff);
  assert.equal(companion.memory.u16(companion.binding.player + P.state), 0x8000);

  game.ram.setU16(0x812972, 1);
  prepareFormationFrame(state, game, 0xffff);
  assert.equal(companion.memory.u16(companion.binding.player + P.state), 0);
  game.ram.setU16(0x812972, 0);
  prepareFormationFrame(state, game, 0xffff);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x2400, 0x1c00]);
  assert.equal(companion.memory.u16(companion.binding.player + P.state), 0x8000);
  assert.deepEqual(game.ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  ), p2Before);
});

test('W608 Game owns and forwards the optional callback only when supplied', () => {
  let vanillaCtx;
  const vanilla = new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false,
    handlers: new Map([[2, (_ram, _slot, _slotIdx, ctx) => { vanillaCtx = ctx; }]]),
  });
  assert.equal(Object.hasOwn(vanilla, 'playerPositionTransform'), false);
  vanilla.ram.setU16(RAM.objTable, 0x8002);
  vanilla.step(0xffff);
  assert.equal(Object.hasOwn(vanillaCtx, 'playerPositionTransform'), false);

  const hook = () => null;
  let selectedCtx;
  const selected = new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false,
    handlers: new Map([[2, (_ram, _slot, _slotIdx, ctx) => { selectedCtx = ctx; }]]),
    playerPositionTransform: hook,
  });
  assert.equal(Object.hasOwn(selected, 'playerPositionTransform'), true);
  assert.strictEqual(selected.playerPositionTransform, hook);
  selected.ram.setU16(RAM.objTable, 0x8002);
  selected.step(0xffff);
  assert.strictEqual(selectedCtx.playerPositionTransform, hook);
  assert.throws(() => new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false, handlers: new Map(), playerPositionTransform: 1,
  }), /playerPositionTransform must be a function/);
});

test('W608 initializer seam truncates finite positions before first draw setup', () => {
  const ram = new Ram();
  const slot = playerSlot(ram, { y: 0x1230, x: 0x2340 });
  ram.setU16(0x813088, 2);
  const order = [];
  const tables = new Proxy(MOVE, {
    get(target, property, receiver) {
      if (property === 'anim') return (...args) => {
        order.push('draw');
        return target.anim(...args);
      };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const ctx = playerCtx({
    tables,
    playerPositionTransform(_ram, playerIdx, y, x) {
      order.push('position');
      assert.equal(playerIdx, 0);
      assert.deepEqual([y, x], [0x1230, 0x2340]);
      return { y: 0x3456 + 0.9, x: -1.2 };
    },
    deathEvent(kind) { if (kind === 'player-init') order.push('init-event'); },
  });

  playerObject2491C0(ram, slot, 0, ctx);
  assert.deepEqual([
    ram.u16(RAM.player1 + P.posY), ram.u16(RAM.player1 + P.posX),
  ], [0x3456, 0xffff]);
  assert.deepEqual(order, ['position', 'init-event', 'draw']);
});

test('W608 initializer and normal finish reject invalid transforms without changing vanilla positions', () => {
  const vanilla = new Ram();
  const invalid = new Ram();
  const vanillaSlot = playerSlot(vanilla, { y: 0x1678, x: 0x2456 });
  const invalidSlot = playerSlot(invalid, { y: 0x1678, x: 0x2456 });
  vanilla.setU16(0x813088, 2);
  invalid.setU16(0x813088, 2);
  playerObject2491C0(vanilla, vanillaSlot, 0, playerCtx());
  playerObject2491C0(invalid, invalidSlot, 0, playerCtx({
    playerPositionTransform() { return { y: Number.NaN, x: Infinity }; },
  }));
  assert.deepEqual([
    invalid.u16(RAM.player1 + P.posY), invalid.u16(RAM.player1 + P.posX),
  ], [vanilla.u16(RAM.player1 + P.posY), vanilla.u16(RAM.player1 + P.posX)]);

  function ordinaryRam() {
    const ram = new Ram();
    ram.setU16(RAM.player1 + P.state, 0x8000);
    ram.setU16(RAM.player1 + P.posY, 0x2000);
    ram.setU16(RAM.player1 + P.posX, 0x2400);
    ram.setU8(RAM.player1 + P.invuln, 0xff);
    ram.setU16(RAM.p1raw, 0);
    ram.setU16(RAM.p1edge, 0);
    ram.setU16(0x813176, 0x0100);
    ram.setU8(ALLOC.table + 0x07, 0);
    return ram;
  }
  const ordinaryVanilla = ordinaryRam();
  const ordinaryInvalid = ordinaryRam();
  updatePlayer(ordinaryVanilla, ALLOC.table, 0, playerCtx());
  updatePlayer(ordinaryInvalid, ALLOC.table, 0, playerCtx({
    playerPositionTransform() { return null; },
  }));
  assert.deepEqual([
    ordinaryInvalid.u16(RAM.player1 + P.posY),
    ordinaryInvalid.u16(RAM.player1 + P.posX),
  ], [
    ordinaryVanilla.u16(RAM.player1 + P.posY),
    ordinaryVanilla.u16(RAM.player1 + P.posX),
  ]);
});

test('W608 normal finish transforms after authentic extra-X and before weapon processing', () => {
  const ram = new Ram();
  ram.setU16(RAM.player1 + P.state, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x2400);
  ram.setU8(RAM.player1 + P.invuln, 0xff);
  ram.setU8(RAM.player1 + P.dead, 1);
  ram.setU16(RAM.p1raw, 1 << BIT.b3);
  ram.setU16(RAM.p1edge, 0);
  ram.setU16(0x813176, 0x0100);
  ram.setU8(0x80380f, 1);
  ram.setU8(ALLOC.table + 0x07, 0);
  let calls = 0;
  const ctx = playerCtx({
    playerPositionTransform(_ram, playerIdx, y, x) {
      calls++;
      assert.equal(playerIdx, 0);
      assert.deepEqual([y, x], [0x2000, 0x2300], 'the extra-X writer already ran');
      assert.equal(ram.u8(RAM.player1 + P.btnByte) & (1 << BIT.b1), 0,
        'auto-shot weapon processing has not synthesized B1 yet');
      return { y: 0x2888, x: 0x1999 };
    },
  });

  updatePlayer(ram, ALLOC.table, 0, ctx);
  assert.equal(calls, 1);
  assert.deepEqual([
    ram.u16(RAM.player1 + P.posY), ram.u16(RAM.player1 + P.posX),
  ], [0x2888, 0x1999]);
  assert.notEqual(ram.u8(RAM.player1 + P.btnByte) & (1 << BIT.b1), 0,
    'the authentic auto-shot block runs after the seam');
});
