// W610 Wave 3: exact-bundle P1-owned formation lifecycle proof.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACHINE, P, RAM, BIT } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { BOMBRAM } from '../src/bomb.js';
import { HUDRAM } from '../src/hud.js';
import { HYPER } from '../src/hyper.js';
import { DEATH } from '../src/player.js';
import { CONTINUE } from '../src/continuescreen.js';
import { TALLY } from '../src/tally.js';
import { MOD_IDS } from '../src/mods.js';
import {
  FORMATION_MODE, FORMATION_THREE_MODE, prepareFormationFrame,
} from '../src/formation.js';
import { mirrorsFromPort, portWordFromPlayerBits } from '../src/input.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  clearCoin, clearTouch, selectTouchOwner, setTouchButton, setTouchDirections,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'exact browser bundle absent; lifecycle proof is skipped, not passed';
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

function allocatorActors(ram, type, marker = null) {
  return Array.from({ length: ALLOC.slots }, (_, i) => ALLOC.table + i * ALLOC.stride)
    .filter((slot) => ram.u16(slot) === (0x8000 | type)
      && (marker == null || ram.u8(slot + 0x07) === marker));
}

function bytes(ram, begin, length) {
  const offset = begin - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

function bombLedger(ram, p2 = false) {
  return {
    stock: ram.u8((p2 ? RAM.player2 : RAM.player1) + BOMBRAM.stockOffset),
    count: ram.u16(p2 ? BOMBRAM.countP2 : BOMBRAM.countP1),
    used: ram.u16(p2 ? BOMBRAM.usedP2 : BOMBRAM.usedP1),
  };
}

function nativeP2Resources(ram) {
  return {
    player: bytes(ram, RAM.player2, P.stride),
    lives: ram.u16(DEATH.p2.lives),
    hudScore: {
      total: ram.u32(HUDRAM.totalP2),
      overflow: ram.u16(HUDRAM.ovfP2),
      pending: ram.u32(HUDRAM.pendingP2),
      extendNext: ram.u32(HUDRAM.extendNextP2),
      extendIndex: ram.u16(HUDRAM.extendIdxP2),
      digitState: ram.u16(HUDRAM.digitStateP2),
      digits: bytes(ram, HUDRAM.digitsP2, 9 * 0x0a),
    },
    bombs: bombLedger(ram, true),
    hyper: {
      active: ram.u16(HYPER.p2.active),
      gauge: ram.u16(HYPER.p2.gauge),
      earn: ram.u16(HYPER.p2.earn),
      power: ram.u16(HYPER.p2.power),
      level: ram.u16(HYPER.p2.level),
      request: ram.u16(HYPER.p2.req),
      stock: ram.u16(HYPER.p2.stock),
      pending: ram.u16(HYPER.p2.pending),
    },
    tally: bytes(ram, TALLY.side1, TALLY.stride),
    continue: bytes(ram, CONTINUE.recordB, 0x16),
    respawn: {
      ready: ram.u16(DEATH.p2.ready),
      flag: ram.u16(DEATH.p2.flag),
      noMiss: ram.u16(DEATH.p2.noMiss),
      activeSave: ram.u16(DEATH.p2.activeSave),
      suffix: ram.u16(DEATH.p2.suffix),
      reloadA: ram.u16(DEATH.p2.reloadA),
      reloadB: ram.u16(DEATH.p2.reloadB),
      dropGate: ram.u16(DEATH.p2.dropGate),
      dropCount: ram.u16(DEATH.p2.dropCount),
    },
  };
}

function seedNativeP2Resources(ram) {
  for (let offset = 0; offset < P.stride; offset++) {
    ram.setU8(RAM.player2 + offset, (0x31 + offset * 7) & 0xff);
  }
  ram.setU16(DEATH.p2.lives, 0x4321);
  ram.setU32(HUDRAM.totalP2, 0x12345678);
  ram.setU16(HUDRAM.ovfP2, 0x2345);
  ram.setU32(HUDRAM.pendingP2, 0x3456789a);
  ram.setU32(HUDRAM.extendNextP2, 0x456789ab);
  ram.setU16(HUDRAM.extendIdxP2, 0x5678);
  ram.setU16(HUDRAM.digitStateP2, 0x6789);
  for (let offset = 0; offset < 9 * 0x0a; offset++) {
    ram.setU8(HUDRAM.digitsP2 + offset, (0x5a + offset * 3) & 0xff);
  }
  ram.setU8(RAM.player2 + BOMBRAM.stockOffset, 0x76);
  ram.setU16(BOMBRAM.countP2, 0x789a);
  ram.setU16(BOMBRAM.usedP2, 0x89ab);
  [
    HYPER.p2.active, HYPER.p2.gauge, HYPER.p2.earn, HYPER.p2.power,
    HYPER.p2.level, HYPER.p2.req, HYPER.p2.stock, HYPER.p2.pending,
  ].forEach((address, index) => ram.setU16(address, 0x1001 + index * 0x111));
  for (let offset = 0; offset < TALLY.stride; offset++) {
    ram.setU8(TALLY.side1 + offset, (0x81 + offset * 5) & 0xff);
  }
  for (let offset = 0; offset < 0x16; offset++) {
    ram.setU8(CONTINUE.recordB + offset, (0xa1 + offset * 9) & 0xff);
  }
  [
    DEATH.p2.ready, DEATH.p2.flag, DEATH.p2.noMiss,
    DEATH.p2.activeSave, DEATH.p2.suffix, DEATH.p2.reloadA,
    DEATH.p2.reloadB, DEATH.p2.dropGate, DEATH.p2.dropCount,
  ].forEach((address, index) => ram.setU16(address, 0x2002 + index * 0x101));
}

function activeDemo(bundle, mode = FORMATION_THREE_MODE) {
  return new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
    undefined, null, null, null, null, mode);
}

function stepUntil(demo, predicate, limit, message) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return i;
    demo.step();
  }
  assert.fail(`${message} within ${limit} logic frames`);
}

test('W610 exact three-ship bundle clamps P1 and both companions at all four walls',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    const demo = activeDemo(await localBundle());
    const { ram } = demo.game;
    stepUntil(demo, () => allocatorActors(ram, 3, 2).length === 1
      && allocatorActors(ram, 3, 3).length === 1, 4,
    'both private companion actors must become live');
    const manager = demo.formation.foundation;
    const p2Before = bytes(ram, RAM.player2, P.stride);
    const cases = [
      { name: 'left', bit: BIT.left, anchor: [0x2000, 0x0b00],
        positions: [[0x2000, 0x0300], [0x2000, 0x0b00], [0x2000, 0x1300]] },
      { name: 'right', bit: BIT.right, anchor: [0x2000, 0x2d00],
        positions: [[0x2000, 0x2500], [0x2000, 0x2d00], [0x2000, 0x3500]] },
      { name: 'bottom', bit: BIT.down, anchor: [0x0800, 0x1c00],
        positions: [[0x0800, 0x1400], [0x0800, 0x1c00], [0x0800, 0x2400]] },
      { name: 'top', bit: BIT.up, anchor: [0x6500, 0x1c00],
        positions: [[0x6500, 0x1400], [0x6500, 0x1c00], [0x6500, 0x2400]] },
    ];

    for (const entry of cases) {
      [manager.runtime.anchorY, manager.runtime.anchorX] = entry.anchor;
      const raw = portWordFromPlayerBits([entry.bit], []);
      assert.equal(prepareFormationFrame(demo.formation, demo.game, raw), raw & 0xffff);
      assert.deepEqual([manager.runtime.anchorY, manager.runtime.anchorX], entry.anchor,
        `${entry.name} anchor clamps exactly`);
      assert.deepEqual([
        ram.u16(RAM.player1 + P.posY), ram.u16(RAM.player1 + P.posX),
      ], entry.positions[0]);
      manager.companions.forEach((companion, index) => {
        assert.deepEqual([
          companion.memory.u16(companion.binding.player + P.posY),
          companion.memory.u16(companion.binding.player + P.posX),
        ], entry.positions[index + 1]);
      });
      const packed = mirrorsFromPort(raw);
      assert.notEqual(packed.p1 & (1 << entry.bit), 0);
      assert.equal(packed.p2 & 0x7f, 0);
      assert.deepEqual(bytes(ram, RAM.player2, P.stride), p2Before);
    }
  });

test('W610 one P1 Button 2 edge spends one P1 bomb and reaches no companion',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    const demo = activeDemo(await localBundle());
    const { ram } = demo.game;
    stepUntil(demo, () => allocatorActors(ram, 3, 2).length === 1
      && allocatorActors(ram, 3, 3).length === 1, 4,
    'both private companion actors must become live');
    assert.equal(selectTouchOwner('P1'), true);
    const p1Before = bombLedger(ram);
    const p2Before = bombLedger(ram, true);
    const p2RecordBefore = bytes(ram, RAM.player2, P.stride);
    setTouchButton('BOMB', true);

    try {
      demo.step();
      assert.deepEqual(p1Before, { stock: 3, count: 0, used: 0 });
      assert.deepEqual(bombLedger(ram), { stock: 2, count: 1, used: 1 });
      assert.deepEqual(bombLedger(ram, true), p2Before);
      assert.deepEqual(bytes(ram, RAM.player2, P.stride), p2RecordBefore);
      assert.notEqual(ram.u16(RAM.p1edge) & (1 << BIT.b2), 0);
      assert.equal(ram.u16(RAM.p2edge) & (1 << BIT.b2), 0);
      for (const companion of demo.formation.foundation.companions) {
        assert.equal(companion.memory.u16(companion.binding.input.raw)
          & (1 << BIT.b2), 0);
        assert.equal(companion.memory.u16(companion.binding.input.edge)
          & (1 << BIT.b2), 0);
      }
    } finally {
      clearTouch();
      clearCoin();
    }
  });

test('W610 P1 death and revival preserve every native P2 lifecycle resource',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    const demo = activeDemo(await localBundle());
    const { ram } = demo.game;
    stepUntil(demo, () => allocatorActors(ram, 3, 2).length === 1
      && allocatorActors(ram, 3, 3).length === 1, 4,
    'both private companion actors must become live');
    const manager = demo.formation.foundation;
    const actorIds = manager.companions.map((state) => state.actorId);

    seedNativeP2Resources(ram);
    const before = nativeP2Resources(ram);
    ram.setU16(RAM.player1 + P.state, 0x8100);
    prepareFormationFrame(demo.formation, demo.game, 0xffff);

    assert.deepEqual(manager.companions.map((state) =>
      state.memory.u16(state.binding.player + P.state)), [0, 0]);
    assert.deepEqual(manager.companions.map((state) => state.actorId), actorIds);
    assert.deepEqual(nativeP2Resources(ram), before);

    ram.setU16(RAM.player1 + P.state, 0x8000);
    prepareFormationFrame(demo.formation, demo.game, 0xffff);

    assert.deepEqual(manager.companions.map((state) =>
      state.memory.u16(state.binding.player + P.state)), [0x8000, 0x8000]);
    assert.deepEqual(manager.companions.map((state) => state.actorId), actorIds);
    assert.deepEqual(nativeP2Resources(ram), before);
  });

test('W610 vanilla exact-bundle Demo leaves native P2 controls and actors untouched',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    assert.equal(selectTouchOwner('P1'), true);
    setTouchDirections(1 << BIT.right);
    setTouchButton('SHOT', true);
    const demo = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz);
    const p2Before = bytes(demo.game.ram, RAM.player2, P.stride);
    let packedWord = null;
    const realStep = demo.game.step.bind(demo.game);
    demo.game.step = (word) => {
      packedWord = word;
      return realStep(word);
    };

    try {
      assert.equal(demo.formation, null);
      assert.equal(Object.hasOwn(demo.game, 'playerPositionTransform'), false);
      assert.equal(demo.game.ram.u16(TALLY.side1), 0);
      demo.step();
      demo.step();
      const packed = mirrorsFromPort(packedWord);
      assert.notEqual(packed.p1 & (1 << BIT.right), 0);
      assert.notEqual(packed.p1 & (1 << BIT.b1), 0);
      assert.equal(packed.p2 & 0x7f, 0);
      assert.equal(demo.game.ram.u16(TALLY.side1), 0);
      assert.deepEqual(bytes(demo.game.ram, RAM.player2, P.stride), p2Before);
      assert.deepEqual(allocatorActors(demo.game.ram, 3), []);
      assert.equal(MOD_IDS.length, 35);
      assert.equal(MOD_IDS.includes(FORMATION_MODE.id), false);
      assert.equal(MOD_IDS.includes(FORMATION_THREE_MODE.id), false);
    } finally {
      clearTouch();
      clearCoin();
    }
  });
