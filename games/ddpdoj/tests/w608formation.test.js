// W608 Wave 1: synchronized authentic two-ship formation runtime and player seams.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { ProtLatch } from '../src/protsim.js';
import { Game } from '../src/main.js';
import { playerObject2491C0, updatePlayer } from '../src/player.js';
import { ALLOC } from '../src/objalloc.js';
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
const POSITIONS = [
  RAM.player1 + P.posY,
  RAM.player1 + P.posX,
  RAM.player2 + P.posY,
  RAM.player2 + P.posX,
];

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
  return { game: { ram, tables }, calls };
}

function trackWordWrites(ram, fn) {
  const writes = [];
  const original = ram.setU16.bind(ram);
  ram.setU16 = (addr, value) => {
    writes.push(addr);
    return original(addr, value);
  };
  try {
    const result = fn();
    return { writes, result };
  } finally {
    ram.setU16 = original;
  }
}

function assertOnlyPositionBytesChanged(before, ram) {
  const allowed = new Set();
  for (const addr of POSITIONS) {
    const offset = addr - MACHINE.ramBase;
    allowed.add(offset);
    allowed.add(offset + 1);
  }
  for (let i = 0; i < before.length; i++) {
    if (!allowed.has(i)) assert.equal(ram.b[i], before[i],
      `unexpected RAM change at $${(MACHINE.ramBase + i).toString(16)}`);
  }
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
    ship: 0, style: 2, p2: { ship: 2, style: 2 },
  });
  const explicit = { ship: 2, style: 6, p2: { ship: 0, style: 4 } };
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE, explicit), explicit);
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 2, style: 4 }), {
    ship: 2, style: 4, p2: { ship: 2, style: 2 },
  }, 'a P1-only override keeps the required default P2 pair');
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 2 }), {
    ship: 2, style: 2, p2: { ship: 2, style: 2 },
  }, 'a partial P1 override keeps the missing style and default P2');
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { p2: { style: 6 } }), {
    ship: 0, style: 2, p2: { ship: 2, style: 6 },
  }, 'a partial P2 override keeps the formation Type-B default');
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE,
    { p2: { ship: 0, style: 6 } }), {
    ship: 0, style: 2, p2: { ship: 0, style: 6 },
  }, 'a P2-only override keeps the default P1 pair');
  assert.equal(resolveFormationAuthenticSelection(FORMATION_MODE,
    { ship: 9, style: 2, p2: { ship: 2, style: 2 } }), null);
  assert.equal(resolveFormationAuthenticSelection(FORMATION_MODE,
    { p2: 'invalid' }), null);
  assert.deepEqual(resolveFormationAuthenticSelection(null, explicit), explicit);

  assert.equal(MOD_IDS.length, 32);
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

test('W608 active-low input copies movement, B1, and B3 but never P1 B2', () => {
  const state = activeState();
  const p1 = [BIT.up, BIT.left, BIT.b1, BIT.b2, BIT.b3, BIT.start];
  const p2 = [BIT.down, BIT.right, BIT.b1, BIT.b2, BIT.b3, BIT.start];
  const raw = portWordFromPlayerBits(p1, p2);
  const transformed = transformFormationInput(state, raw);
  const before = mirrorsFromPort(raw);
  const after = mirrorsFromPort(transformed);

  assert.equal(transformed & 0x00ff, raw & 0x00ff, 'the complete P1 byte is preserved');
  assert.equal(transformed & 0x0100, raw & 0x0100, 'P2 Start is preserved');
  assert.equal(after.p1 & 0x807f, before.p1 & 0x807f,
    'all P1 direction, button, and Start bits are unchanged');
  assert.equal(after.p2 & 0x0f, after.p1 & 0x0f, 'all four directions copy');
  assert.equal(after.p2 & (1 << BIT.b1), after.p1 & (1 << BIT.b1));
  assert.equal(after.p2 & (1 << BIT.b3), after.p1 & (1 << BIT.b3));
  assert.equal(after.p2 & (1 << BIT.b2), 0, 'P2 Button 2 is released');
  assert.equal(after.p2 & (1 << BIT.start), before.p2 & (1 << BIT.start));

  const p2Only = portWordFromPlayerBits([], [
    BIT.up, BIT.down, BIT.left, BIT.right, BIT.b1, BIT.b2, BIT.b3, BIT.start,
  ]);
  const released = mirrorsFromPort(transformFormationInput(state, p2Only));
  assert.equal(released.p2 & 0x7f, 0, 'old P2 direction and button holds are released');
  assert.notEqual(released.p2 & (1 << BIT.start), 0, 'P2 Start still survives release');
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

test('W608 pre-frame moves one anchor and writes exactly four position words', () => {
  const { game, calls } = fakeGame({
    p1Y: 0x2000, p1X: 0x1000, p2Y: 0x3333, p2X: 0x2f00,
    vectors: { 8: { dy: 0x0080, dx: 0x0100 } },
  });
  // Sentinels throughout both records make any whole-record copy visible.
  for (const rec of [RAM.player1, RAM.player2]) {
    for (let offset = 6; offset < P.stride; offset++) {
      game.ram.setU8(rec + offset, (offset * 13 + (rec & 0xff)) & 0xff);
    }
  }
  game.ram.setU8(RAM.player1 + P.speedIdx, 0x17);
  const state = activeState();
  initializeFormation(state, game);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x2000, 0x1400]);
  const before = game.ram.b.slice();

  const raw = portWordFromPlayerBits([BIT.right], [BIT.left, BIT.b2]);
  const { writes, result } = trackWordWrites(game.ram,
    () => prepareFormationFrame(state, game, raw));
  assert.equal(result, transformFormationInput(state, raw));
  assert.deepEqual(calls.angles, [1 << BIT.right]);
  assert.deepEqual(calls.vectors, [[0x17, 1 << BIT.right]]);
  assert.deepEqual(writes, POSITIONS);
  assert.deepEqual([
    game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
    game.ram.u16(RAM.player2 + P.posY), game.ram.u16(RAM.player2 + P.posX),
  ], [0x2080, 0x1100, 0x2080, 0x1900]);
  assert.equal(game.ram.u16(RAM.player2 + P.posX)
    - game.ram.u16(RAM.player1 + P.posX), 0x0800);
  const callback = formationGameOptions(state).playerPositionTransform;
  assert.deepEqual(callback(game.ram, 0, 0, 0), { y: 0x2080, x: 0x1100 });
  assert.deepEqual(callback(game.ram, 1, 0, 0), { y: 0x2080, x: 0x1900 });
  assertOnlyPositionBytesChanged(before, game.ram);
});

test('W608 anchor clamps at all four walls and honors movement disable', () => {
  const cases = [
    { input: BIT.left, p1Y: 0x2000, p1X: 0x0300,
      vectors: { 4: { dy: 0, dx: -0x900 } }, anchor: [0x2000, 0x0700],
      positions: [0x2000, 0x0300, 0x2000, 0x0b00] },
    { input: BIT.right, p1Y: 0x2000, p1X: 0x3500,
      vectors: { 8: { dy: 0, dx: 0x900 } }, anchor: [0x2000, 0x3100],
      positions: [0x2000, 0x2d00, 0x2000, 0x3500] },
    { input: BIT.down, p1Y: 0x0800, p1X: 0x1000,
      vectors: { 2: { dy: -0x900, dx: 0 } }, anchor: [0x0800, 0x1400],
      positions: [0x0800, 0x1000, 0x0800, 0x1800] },
    { input: BIT.up, p1Y: 0x6500, p1X: 0x1000,
      vectors: { 1: { dy: 0x900, dx: 0 } }, anchor: [0x6500, 0x1400],
      positions: [0x6500, 0x1000, 0x6500, 0x1800] },
  ];
  for (const c of cases) {
    const { game } = fakeGame(c);
    const state = activeState();
    initializeFormation(state, game);
    prepareFormationFrame(state, game, portWordFromPlayerBits([c.input], []));
    assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], c.anchor);
    assert.deepEqual(POSITIONS.map((addr) => game.ram.u16(addr)), c.positions);
    assert.equal(game.ram.u16(RAM.player2 + P.posX)
      - game.ram.u16(RAM.player1 + P.posX), 0x0800);
  }

  const { game, calls } = fakeGame();
  const state = activeState();
  initializeFormation(state, game);
  game.ram.setU16(0x8130d2, 1);
  prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.right], []));
  assert.deepEqual(calls.vectors, []);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x2000, 0x1400]);
});

test('W608 caches P1 speed through death, freezes with neither live, and skips death records', () => {
  const { game, calls } = fakeGame({ speed: 0x22 });
  const state = activeState();
  initializeFormation(state, game);
  prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.right], []));
  assert.deepEqual(calls.vectors.at(-1), [0x22, 8]);

  game.ram.setU16(RAM.player1 + P.state, 0x0100);
  game.ram.setU8(RAM.player1 + P.speedIdx, 0x77);
  const deathPosition = [0x4444, 0x5555];
  game.ram.setU16(RAM.player1 + P.posY, deathPosition[0]);
  game.ram.setU16(RAM.player1 + P.posX, deathPosition[1]);
  const { writes } = trackWordWrites(game.ram,
    () => prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.right], [])));
  assert.deepEqual(calls.vectors.at(-1), [0x22, 8], 'dead P1 cannot replace cached speed');
  assert.deepEqual(writes, [RAM.player2 + P.posY, RAM.player2 + P.posX]);
  assert.deepEqual([
    game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
  ], deathPosition);
  assert.equal(formationGameOptions(state).playerPositionTransform(
    game.ram, 0, deathPosition[0], deathPosition[1]), null);

  game.ram.setU16(RAM.player2 + P.state, 0);
  const anchor = [state.runtime.anchorY, state.runtime.anchorX];
  const callsBefore = calls.vectors.length;
  const frozen = trackWordWrites(game.ram,
    () => prepareFormationFrame(state, game, portWordFromPlayerBits([BIT.left], [])));
  assert.deepEqual(frozen.writes, []);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], anchor);
  assert.equal(calls.vectors.length, callsBefore);
});

test('W608 stage-clear suspends geometry and rebases from P1, then live P2 fallback', () => {
  const { game } = fakeGame();
  const state = activeState();
  initializeFormation(state, game);
  const callback = formationGameOptions(state).playerPositionTransform;
  const initialAnchor = [state.runtime.anchorY, state.runtime.anchorX];

  game.ram.setU16(0x812972, 1);
  game.ram.setU16(RAM.player1 + P.posY, 0x2400);
  game.ram.setU16(RAM.player1 + P.posX, 0x1800);
  game.ram.setU16(RAM.player2 + P.posY, 0x3300);
  game.ram.setU16(RAM.player2 + P.posX, 0x2a00);
  const suspended = trackWordWrites(game.ram,
    () => prepareFormationFrame(state, game, 0xffff));
  assert.deepEqual(suspended.writes, []);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], initialAnchor);
  assert.equal(callback(game.ram, 0, 0x2400, 0x1800), null);

  game.ram.setU16(0x812972, 0);
  const p1Rebase = trackWordWrites(game.ram,
    () => prepareFormationFrame(state, game, 0xffff));
  assert.deepEqual(p1Rebase.writes, POSITIONS);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x2400, 0x1c00]);
  assert.deepEqual(POSITIONS.map((addr) => game.ram.u16(addr)),
    [0x2400, 0x1800, 0x2400, 0x2000]);

  game.ram.setU16(0x812972, 1);
  prepareFormationFrame(state, game, 0xffff);
  game.ram.setU16(RAM.player1 + P.state, 0x0100);
  game.ram.setU16(RAM.player2 + P.state, 0x8000);
  game.ram.setU16(RAM.player2 + P.posY, 0x3000);
  game.ram.setU16(RAM.player2 + P.posX, 0x2200);
  game.ram.setU16(0x812972, 0);
  const p2Rebase = trackWordWrites(game.ram,
    () => prepareFormationFrame(state, game, 0xffff));
  assert.deepEqual(p2Rebase.writes, [RAM.player2 + P.posY, RAM.player2 + P.posX]);
  assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], [0x3000, 0x1e00]);
  assert.deepEqual([
    game.ram.u16(RAM.player2 + P.posY), game.ram.u16(RAM.player2 + P.posX),
  ], [0x3000, 0x2200]);
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
