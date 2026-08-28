// W629: ordinary mod URLs configure a future credited run without bypassing
// the production warning, title, credit, START, and fighter-selection flow.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACHINE } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { ARM5SCREEN, SCREEN8 } from '../src/objslot8.js';
import { COIN } from '../src/isr.js';
import { MOD_IDS, MOD_RAM, resolveLoadout } from '../src/mods.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  clearCoin, clearTouch, setCoinKey, setTouchButton,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED = [
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'capture.bin.gz'),
  path.join(ASSETS, 'seed.bin.gz'),
  path.join(ASSETS, 'player.tables.json.gz'),
];
const SKIP = REQUIRED.every(existsSync) ? false
  : 'exact production browser bundle absent; this is a skip, not a pass';

let bundlePromise;
async function readAsset(name) {
  const file = path.join(ASSETS, name);
  if (!existsSync(file)) throw new AssetError(`${file} is missing`);
  return new Uint8Array(readFileSync(file));
}

function exactBundle() {
  bundlePromise ??= loadBundle(readAsset);
  return bundlePromise;
}

function canvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
  };
  return { width: 0, height: 0, getContext: () => context };
}

function advanceTo(demo, frame) {
  assert.ok(frame >= demo.game.logicFrame);
  while (demo.game.logicFrame < frame) demo.step();
}

function activeTypes(demo) {
  const types = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const word = demo.game.ram.u16(ALLOC.table + i * ALLOC.stride);
    if (word !== 0) types.push(word & 0xff);
  }
  return types;
}

function modDemo(bundle, ...ids) {
  return new Demo(canvas(), bundle, MACHINE.refreshHz, undefined, null, null,
    resolveLoadout(ids));
}

function frontEndFingerprint(demo) {
  assert.equal(demo.coldBoot, true);
  assert.equal(demo.seedLf, 0);
  assert.equal(demo.game.logicFrame, 0);
  assert.equal(demo.game.videoFrame, 0);
  assert.equal(demo.game.armedVblanks, 0);
  assert.ok(demo.game.bootResult);

  advanceTo(demo, 20);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 13, 'warning screen');
  advanceTo(demo, 305);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 2, 'high scores and zero-credit prompt');
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);
  setTouchButton('START', true);
  demo.step();
  setTouchButton('START', false);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 2, 'uncredited START is refused');
  advanceTo(demo, 1190);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 1, 'title screen');
  return Uint8Array.from(demo.game.ram.b);
}

function enterCreditedGameplay(demo, prepareCredit = null) {
  advanceTo(demo, 20);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 13);
  advanceTo(demo, 305);
  setTouchButton('START', true);
  demo.step();
  setTouchButton('START', false);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 2);

  advanceTo(demo, 1190);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 1);
  advanceTo(demo, 1940);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 5);
  assert.equal(demo.game.ram.u16(ARM5SCREEN.demoFlag), 1);
  assert.equal(demo.mods.runtime.cabinetRunActive, false,
    'attract gameplay cannot activate a selected run policy');

  advanceTo(demo, 4340);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 2);
  assert.equal(demo.game.ram.u16(ARM5SCREEN.demoFlag), 0);
  prepareCredit?.(demo);

  setCoinKey('COIN1', true);
  for (let i = 0; i < 30; i++) demo.step();
  setCoinKey('COIN1', false);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 3);

  setTouchButton('START', true);
  for (let i = 0; i < 12; i++) demo.step();
  setTouchButton('START', false);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 14);
  assert.ok(activeTypes(demo).includes(9), 'credited START creates the authentic selector');

  const selectedAt = demo.game.logicFrame;
  advanceTo(demo, selectedAt + 2500);
  const types = activeTypes(demo);
  assert.ok(types.includes(2), 'selector hands off to the P1 object');
  assert.ok(types.includes(11), 'selector hands off to the stage object');
  assert.equal(types.includes(9), false, 'selector retires without a reload');
  assert.equal(demo.mods.runtime.cabinetRunActive, true,
    'the configured policy activates only at the credited selector handoff');
}

test('W629 every catalogue mod preserves the same production cabinet front end',
  { skip: SKIP, timeout: 180_000 }, async (t) => {
    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });
    const bundle = await exactBundle();
    const vanilla = new Demo(canvas(), bundle, MACHINE.refreshHz);
    const expected = frontEndFingerprint(vanilla);

    for (const id of MOD_IDS) {
      clearCoin();
      clearTouch();
      const demo = modDemo(bundle, id);
      assert.deepEqual(demo.mods.loadout.ids, [id]);
      assert.equal(demo.mods.runtime.cabinetRunActive, false, `${id} begins pending`);
      const actual = frontEndFingerprint(demo);
      assert.deepEqual(actual, expected,
        `${id} leaves warning, credit refusal, and title cartridge RAM exact`);
    }
  });

test('W629 Invincibility and Loop 2 traverse credit and authentic selection before activation',
  { skip: SKIP, timeout: 180_000 }, async (t) => {
    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });
    const bundle = await exactBundle();

    const invincible = modDemo(bundle, 'invincibility');
    enterCreditedGameplay(invincible);
    assert.equal(invincible.game.enemyBulletCollisionFilter(invincible.game.ram,
      { player: MOD_RAM.player1, bank: 'A' }), false,
    'Invincibility is live after selection');

    clearCoin();
    clearTouch();
    const loop2 = modDemo(bundle, 'loop-2-from-stage-1');
    enterCreditedGameplay(loop2);
    assert.equal(loop2.game.ram.u16(MOD_RAM.loopCounter), 1,
      'loop 2 is armed after selection and before stage initialization');
  });

const MASH_BUTTONS = Object.freeze([
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'SHOT', 'BOMB', 'AUTO', 'START',
]);

test('W629 a completed mod run returns to pending before an immediate second credit',
  { skip: SKIP, timeout: 180_000 }, async (t) => {
    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });
    const bundle = await exactBundle();
    const demo = modDemo(bundle,
      'native-auto-fire', 'turbo', 'loop-2-from-stage-1', 'stage-remix');

    enterCreditedGameplay(demo, (cabinet) => {
      cabinet.game.ram.setU8(MOD_RAM.autoFireDip, 0);
    });
    assert.equal(demo.game.ram.u8(MOD_RAM.autoFireDip), 1,
      'Native Auto-Fire is live only after the first credited selector');
    assert.equal(demo.game.stageAdvanceTransform(1), 2,
      'the first credited run owns its selected stage policy');

    let countdownFrame = 0;
    for (let frame = 1; frame <= 5000; frame++) {
      demo.step();
      if (activeTypes(demo).includes(0x0d)) {
        countdownFrame = frame;
        break;
      }
    }
    assert.ok(countdownFrame > 0,
      'natural hits exhausted the first run and created the continue countdown');

    let firstGameOver = 0;
    let firstNameEntry = 0;
    let firstCabinet = 0;
    for (let frame = 1; frame <= 2000; frame++) {
      const pressed = (frame & 1) === 0;
      for (const name of MASH_BUTTONS) setTouchButton(name, pressed);
      demo.step();
      const types = activeTypes(demo);
      if (!firstGameOver && types.includes(0x0e)) {
        firstGameOver = frame;
        assert.equal(demo.mods.runtime.cabinetRunActive, true,
          'run policy remains active through visible Game Over');
      }
      if (!firstNameEntry && types.includes(0x0c)) {
        firstNameEntry = frame;
        assert.equal(demo.mods.runtime.cabinetRunActive, true,
          'run policy remains active through name handling');
      }
      if (firstNameEntry && types.includes(0x08)) {
        firstCabinet = frame;
        break;
      }
    }
    clearTouch();

    assert.ok(firstGameOver > 0, 'the first run reached visible Game Over');
    assert.ok(firstNameEntry > firstGameOver, 'Game Over reached name entry');
    assert.ok(firstCabinet > firstNameEntry, 'name entry staged the type $08 cabinet successor');
    assert.equal(demo.mods.runtime.cabinetRunActive, false,
      'the exact cartridge return seam retired the first run policy');
    assert.equal(demo.game.ram.u16(MOD_RAM.loopCounter), 0,
      'the cartridge teardown cleared the first run loop policy');
    assert.equal(demo.game.ram.u8(MOD_RAM.autoFireDip), 0,
      'the returned cabinet restored the pre-run operator auto-fire byte');
    assert.equal(demo.game.stageAdvanceTransform(1), 1,
      'the immediate cabinet leaves the configured stage policy pending');

    setCoinKey('COIN1', true);
    for (let i = 0; i < 30; i++) demo.step();
    setCoinKey('COIN1', false);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
      'the same cabinet accepted a second real credit');

    setTouchButton('START', true);
    for (let i = 0; i < 12; i++) demo.step();
    setTouchButton('START', false);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 14);
    assert.ok(activeTypes(demo).includes(9),
      'the immediate second credit created another authentic selector');
    assert.equal(demo.mods.runtime.cabinetRunActive, false,
      'the second selector cannot inherit the completed run policy');
    assert.equal(demo.game.ram.u8(MOD_RAM.autoFireDip), 0,
      'Native Auto-Fire remains pending through the second selector');
    assert.equal(demo.game.stageAdvanceTransform(1), 1);

    const selectedAt = demo.game.logicFrame;
    advanceTo(demo, selectedAt + 2500);
    const types = activeTypes(demo);
    assert.ok(types.includes(2), 'the second selector created P1');
    assert.ok(types.includes(11), 'the second selector created the stage');
    assert.equal(types.includes(9), false, 'the second selector retired');
    assert.equal(demo.mods.runtime.cabinetRunActive, true,
      'the second credited handoff reactivated the configured policies');
    assert.equal(demo.game.ram.u16(MOD_RAM.loopCounter), 1,
      'the second handoff armed loop 2 before stage initialization');
    assert.equal(demo.game.ram.u8(MOD_RAM.autoFireDip), 1,
      'the second handoff reactivated Native Auto-Fire');
    assert.equal(demo.game.stageAdvanceTransform(1), 2);
  });
