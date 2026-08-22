// W492: four additional transformative mods and their narrow host seams.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Game } from '../src/main.js';
import { UnportedLog } from '../src/unported.js';
import { POOL_A, B, KIND, clearPoolA, runPoolADriver } from '../src/bee.js';
import { BUL, REC, WriteLog, poolClear, spawnCore } from '../src/bullets.js';
import {
  MODS, MOD_RAM, resolveLoadout, createModState, loadoutToHash,
  applyPreFrameMods, applyPostFrameMods, adaptiveSlowMotionScale,
  transformModTiming, modGameOptions, replayPolicy,
} from '../src/mods.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
const stateOf = (...ids) => createModState(resolveLoadout(ids));

function freshBeeRam(status = KIND.bee | 0x8000) {
  const ram = new Ram();
  clearPoolA(ram);
  ram.setU16(POOL_A.scrollShort, 0);
  ram.setU16(POOL_A.freeze, 0);
  const slot = POOL_A.reservedBase;
  ram.setU16(slot + B.status, status);
  ram.setU32(slot + B.pos, 0x40002000);
  ram.setU32(slot + B.sprite, 0x001bca34);
  ram.setU32(slot + B.layerEmitter, 0x23d762);
  ram.setU16(slot + B.blinkTimer, 1);
  ram.setU16(slot + B.hitCount, 0x9601);
  ram.setU16(POOL_A.liveCount, 1);
  return { ram, slot };
}

function beeCtx(hook) {
  return { beeRecordHook: hook, unportedLog: new UnportedLog() };
}

function makeGame(ids = []) {
  const state = stateOf(...ids);
  return new Game(new Uint8Array(0x20000), TABLES, {
    palCatchUp: false,
    ...(modGameOptions(state) ?? {}),
  });
}

function spawnOne(game, speedBias = 0) {
  const log = new WriteLog(game.ram);
  const regs = {
    d0: ((speedBias & 0xffff) << 16) | 5,
    d1: 0x11, d2: 0x40002000, d3: 0, d4: 0, d5: 0, a5: 0,
  };
  const before = { ...regs };
  const result = spawnCore({ ram: game.ram, rom: game.rom, log }, regs, 'B');
  return { result, regs, before };
}

test('W492 catalogue entries are exposed by the existing Arsenal and Challenge menu', () => {
  const expected = {
    'hyper-overdrive': 'arsenal',
    'adaptive-slow-motion': 'challenge',
    'bee-magnet': 'arsenal',
    'boss-enrage': 'challenge',
  };
  for (const [id, category] of Object.entries(expected)) {
    assert.equal(MODS[id].category, category);
    assert.equal(MODS[id].replaySafe, false);
    assert.ok(MODS[id].name && MODS[id].effects.length);
  }

  const menu = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  assert.match(menu, /Object\.entries\(MODS\)/);
  assert.match(menu, /data-category="arsenal"/);
  assert.match(menu, /data-category="challenge"/);
  assert.deepEqual(new Set(replayPolicy(stateOf(...Object.keys(expected))).blocking),
    new Set(Object.keys(expected)));
});

test('W492 Adaptive Slow Motion wins the timing conflict and uses bounded live density', () => {
  const loadout = resolveLoadout(['turbo', 'bullet-time', 'adaptive-slow-motion']);
  assert.deepEqual(loadout.ids, ['adaptive-slow-motion']);
  assert.deepEqual(loadout.conflicts, [{
    group: 'timing', winner: 'adaptive-slow-motion', dropped: ['turbo', 'bullet-time'],
  }]);

  assert.equal(adaptiveSlowMotionScale(-1), 1);
  assert.equal(adaptiveSlowMotionScale(48), 1);
  assert.equal(adaptiveSlowMotionScale(210), 2.25);
  assert.equal(adaptiveSlowMotionScale(999), 2.25);

  const state = createModState(loadout);
  const ram = new Ram();
  ram.setU16(MOD_RAM.bulletDensity, 180);
  applyPostFrameMods(state, ram);
  assert.equal(state.runtime.bulletDensity, 180);
  const period = transformModTiming(state, 16);
  assert.equal(period, 16 * adaptiveSlowMotionScale(180));
  assert.ok(period > 28, 'dense patterns are materially slower');
});

test('W492 Hyper Overdrive protects only the exact two-point active drain for both players', () => {
  const state = stateOf('hyper-overdrive');
  const ram = new Ram();
  ram.setU16(MOD_RAM.hyperActiveP1, 1);
  ram.setU16(MOD_RAM.hyperActiveP2, 1);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0x120);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0x220);
  ram.setU16(0x81b646, 7);
  ram.setU16(0x81b654, 4);

  applyPreFrameMods(state, ram);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0x11e);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0x21e);
  applyPostFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP1), 0x120);
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP2), 0x220);
  assert.equal(ram.u16(0x81b646), 7, 'hyper power is untouched');
  assert.equal(ram.u16(0x81b654), 4, 'hyper level is untouched');

  ram.setU16(MOD_RAM.hyperActiveP1, 0);
  ram.setU16(MOD_RAM.hyperActiveP2, 0);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0x180);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0x280);
  applyPreFrameMods(state, ram);
  ram.setU16(MOD_RAM.hyperActiveP1, 1);
  ram.setU16(MOD_RAM.hyperActiveP2, 1);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0x17e);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0x27e);
  applyPostFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP1), 0x180,
    'P1 activation-frame drain is protected');
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP2), 0x280,
    'P2 activation-frame drain is protected');

  applyPreFrameMods(state, ram);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0x100);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0x230);
  applyPostFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP1), 0x100, 'a larger loss remains authentic');
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP2), 0x230, 'a gain remains authentic');

  applyPreFrameMods(state, ram);
  ram.setU16(MOD_RAM.hyperActiveP1, 0);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0xfe);
  applyPostFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.hyperActiveP1), 0, 'deactivation is untouched');
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP1), 0xfe, 'deactivation gauge state is untouched');
});

test('W492 Bee Magnet pulls allocated bees toward live P1 and P2 without bypassing the body', () => {
  const hook = modGameOptions(stateOf('bee-magnet')).beeRecordHook;

  {
    const { ram, slot } = freshBeeRam();
    ram.setU16(MOD_RAM.player1, 0x8000);
    ram.setU16(MOD_RAM.player1Y, 0x5000);
    ram.setU16(MOD_RAM.player1X, 0x3000);
    const telemetry = runPoolADriver(ram, ROM, beeCtx(hook));
    assert.equal(ram.u16(slot + B.pos), 0x4080);
    assert.equal(ram.u16(slot + B.posX), 0x2080);
    assert.equal(telemetry.emitted, 1, 'the authentic bee body still emits normally');
  }

  {
    const { ram, slot } = freshBeeRam();
    ram.setU16(MOD_RAM.player2, 0x8000);
    ram.setU16(MOD_RAM.player2Y, 0x3000);
    ram.setU16(MOD_RAM.player2X, 0x1000);
    runPoolADriver(ram, ROM, beeCtx(hook));
    assert.equal(ram.u16(slot + B.pos), 0x3f80);
    assert.equal(ram.u16(slot + B.posX), 0x1f80);
  }

  {
    let calls = 0;
    const { ram } = freshBeeRam(KIND.bee);
    runPoolADriver(ram, ROM, beeCtx(() => { calls++; }));
    assert.equal(calls, 0, 'a non-allocated record does not reach the optional seam');
  }

  {
    let calls = 0;
    const { ram } = freshBeeRam(KIND.bee | 0x8001);
    runPoolADriver(ram, ROM, beeCtx(() => { calls++; }));
    assert.equal(calls, 0, 'a collected bee popup no longer follows the player');
  }
});

test('W492 Boss Enrage changes only boss-phase spawns and clamps both speed fields', () => {
  const vanilla = makeGame();
  assert.equal(Object.hasOwn(vanilla, 'bulletSpeedTransform'), false);
  poolClear(vanilla.ram);
  const baseSpawn = spawnOne(vanilla);
  const baseSpeed = vanilla.ram.u8(BUL.pool + REC.speed);
  assert.deepEqual(baseSpawn.regs, baseSpawn.before, 'the vanilla bank-B core preserves registers');

  const enraged = makeGame(['boss-enrage']);
  assert.equal(typeof enraged.bulletSpeedTransform, 'function');
  poolClear(enraged.ram);
  enraged.ram.setU16(MOD_RAM.bossPhase, 0);
  const outside = spawnOne(enraged);
  assert.equal(enraged.ram.u8(BUL.pool + REC.speed), baseSpeed);
  assert.deepEqual(outside.regs, outside.before);

  poolClear(enraged.ram);
  enraged.ram.setU16(MOD_RAM.bossPhase, 1);
  const during = spawnOne(enraged);
  assert.equal(enraged.ram.u8(BUL.pool + REC.speed), baseSpeed + 6);
  assert.equal(enraged.ram.u8(BUL.pool + REC.origSpeed), baseSpeed + 6);
  assert.deepEqual(during.regs, during.before, 'the transform does not touch caller registers');

  poolClear(enraged.ram);
  spawnOne(enraged, 0xeb);
  assert.equal(enraged.ram.u8(BUL.pool + REC.speed), 0xff);
  assert.equal(enraged.ram.u8(BUL.pool + REC.origSpeed), 0xff);

  const laterVanilla = makeGame();
  poolClear(laterVanilla.ram);
  laterVanilla.ram.setU16(MOD_RAM.bossPhase, 1);
  spawnOne(laterVanilla);
  assert.equal(laterVanilla.ram.u8(BUL.pool + REC.speed), baseSpeed,
    'a modded Game does not leak its transform into a later vanilla Game');
  assert.equal(laterVanilla.ram.u8(BUL.pool + REC.origSpeed), baseSpeed);
});

test('W492 empty, unknown-only, direct, and Original paths install no policy or callbacks', () => {
  const empty = createModState(resolveLoadout([]));
  const unknown = createModState(resolveLoadout(['not-a-mod']));
  assert.equal(empty, null);
  assert.equal(unknown, null);
  assert.equal(loadoutToHash([]), '');
  assert.equal(modGameOptions(empty), null);
  assert.equal(modGameOptions(unknown), null);
  assert.equal(modGameOptions(stateOf('invincibility')), null,
    'mods without simulation callbacks install no unrelated callbacks');

  const trapRam = new Proxy({}, {
    get() { throw new Error('vanilla mod hook touched RAM'); },
  });
  assert.doesNotThrow(() => applyPreFrameMods(null, trapRam));
  assert.doesNotThrow(() => applyPostFrameMods(null, trapRam));
  assert.equal(transformModTiming(null, 16.896), 16.896);

  const vanilla = makeGame();
  assert.equal(Object.hasOwn(vanilla, 'beeRecordHook'), false);
  assert.equal(Object.hasOwn(vanilla, 'bulletSpeedTransform'), false);
});
