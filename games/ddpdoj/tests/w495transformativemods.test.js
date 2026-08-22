// W495: friendly cancel conversions and a loop-2 stage-1 launch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { Game } from '../src/main.js';
import { MACHINE, RAM, P } from '../src/machine.js';
import { BUL, REC, TYPEBIT } from '../src/bullets.js';
import { BULLET_DRIVER, runScreenClear } from '../src/bulletdriver.js';
import { DMG, playerBox, poolDamage, shotBoundingBox } from '../src/damage.js';
import { SHOT, runShotDriver } from '../src/weapons.js';
import { PLAYER_SLOTS, S, shotHandlers } from '../src/shots.js';
import { launchSeedForBrowser } from '../src/web/app.js';
import {
  MODS, MOD_IDS, MOD_RAM, applyPreFrameMods, createModState, modGameOptions,
  replayPolicy, resolveLoadout,
} from '../src/mods.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const stateOf = (...ids) => createModState(resolveLoadout(ids));

function makeGame(...ids) {
  const state = stateOf(...ids);
  const options = modGameOptions(state);
  const game = new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false,
    ...(options ?? {}),
  });
  return { game, options, state };
}

function screenClear(game, options) {
  return runScreenClear({
    ram: game.ram, rom: game.rom, tables: game.tables, ...(options ?? {}),
  });
}

function putBullet(ram, slot, y = 0x3000, x = 0x1800) {
  const rec = BUL.pool + slot * BUL.stride;
  ram.setU16(rec, TYPEBIT.alive | 3);
  ram.setU16(rec + REC.posA, y);
  ram.setU16(rec + REC.posB, x);
  return rec;
}

function convertedSlots() {
  const slots = [];
  for (const [first, last] of [PLAYER_SLOTS.primary, PLAYER_SLOTS.secondary]) {
    for (let slot = first; slot <= last; slot++) slots.push(slot);
  }
  return slots;
}

test('W495 catalogue has 28 entries and both mods block replay v1', () => {
  const ids = ['friendly-converted-bullets', 'loop-2-from-stage-1'];
  assert.equal(MOD_IDS.length, 28);
  for (const id of ids) {
    assert.equal(MODS[id].replaySafe, false);
    assert.ok(MODS[id].name && MODS[id].effects.length);
  }
  assert.deepEqual(replayPolicy(stateOf(...ids)).blocking, ids);

  const { game } = makeGame('friendly-converted-bullets');
  assert.equal(typeof game.friendlyBulletConvertHook, 'function');
  assert.throws(() => new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false, friendlyBulletConvertHook: 1,
  }), /friendlyBulletConvertHook must be a function/);

  const vanilla = makeGame().game;
  assert.equal(modGameOptions(null), null);
  assert.equal(modGameOptions(stateOf('loop-2-from-stage-1')), null);
  assert.equal(Object.hasOwn(vanilla, 'friendlyBulletConvertHook'), false);
});

test('W495 canceled live bullets become authentic upward player shots and retain the clear effect', () => {
  const { game, options } = makeGame('friendly-converted-bullets');
  const ram = game.ram;
  const canceled = putBullet(ram, 0, 0x3000, 0x1800);
  const uncanceled = putBullet(ram, 100, 0x4200, 0x2200);
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0);
  const impacts0 = ram.u16(DMG.impactCount);

  assert.equal(screenClear(game, options), 1);
  assert.equal(ram.u16(canceled), 0);
  assert.equal(ram.u16(canceled + REC.posA), 0xffff);
  assert.equal(ram.u16(uncanceled) & TYPEBIT.alive, TYPEBIT.alive,
    'a live slot outside the active clear window is not converted');
  assert.equal(ram.u16(DMG.impactCount), impacts0 + 1,
    'the authentic cancel impact still allocates');

  const shot = SHOT.p1Table + PLAYER_SLOTS.primary[0] * SHOT.stride;
  assert.equal(ram.u16(shot) & 0x800f, 0x8008);
  assert.deepEqual([ram.u16(shot + S.posY), ram.u16(shot + S.posX)], [0x3000, 0x1800]);
  assert.deepEqual([ram.u16(shot + S.velY), ram.u16(shot + S.velX)], [0x0400, 0],
    'the translated up direction increases the long-axis coordinate');
  assert.equal(ram.u16(SHOT.liveCount), 1,
    'the frame governor sees the newly live shot immediately');
  assert.equal(convertedSlots().filter((slot) =>
    (ram.u16(SHOT.p1Table + slot * SHOT.stride) & 0x8000) !== 0).length, 1,
  'free enemy-bullet records do not create extra projectiles');
  assert.equal(runShotDriver(ram, game.rom, shotHandlers(), { tables: game.tables }), 1);
  assert.equal(ram.u16(shot + S.posY), 0x3400,
    'the authentic player-shot driver advances the converted projectile upward');

  const enemy = DMG.poolA;
  ram.setU16(enemy, 0xa001);
  ram.setU16(enemy + 0x02, 0x3400);
  ram.setU16(enemy + 0x04, 0x1800);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(enemy + offset, 0x100);
  ram.setU16(enemy + 0x18, 0x0100);
  assert.equal(shotBoundingBox(ram, SHOT.p1Table, 0x2800), true);
  assert.equal(poolDamage(ram, enemy, 1, SHOT.p1Table, 0x2800,
    DMG.maskP1, 1, 'A'), 1);
  assert.equal(ram.u16(enemy + 0x18), 0x00cc,
    'the converted record damages an ordinary enemy through poolDamage');
});

test('W495 free, unarmed, transform-only, and refused conversions create no shot', () => {
  const unarmed = makeGame('friendly-converted-bullets');
  const untouched = putBullet(unarmed.game.ram, 0);
  assert.equal(screenClear(unarmed.game, unarmed.options), 0);
  assert.equal(unarmed.game.ram.u16(untouched) & TYPEBIT.alive, TYPEBIT.alive);
  assert.equal(unarmed.game.ram.u16(
    SHOT.p1Table + PLAYER_SLOTS.primary[0] * SHOT.stride), 0);

  const transformed = makeGame('friendly-converted-bullets');
  const tr = putBullet(transformed.game.ram, 0);
  transformed.game.ram.setU16(BULLET_DRIVER.armWord, 1);
  transformed.game.ram.setU16(BULLET_DRIVER.modeWord, 0xffff);
  assert.equal(screenClear(transformed.game, transformed.options), 1);
  assert.equal(transformed.game.ram.u16(tr) & 0xc000, 0xc000);
  assert.equal(transformed.game.ram.u16(
    SHOT.p1Table + PLAYER_SLOTS.primary[0] * SHOT.stride), 0,
  'the high-bit transform arm never reaches the conversion hook');

  const refused = makeGame('friendly-converted-bullets');
  for (const slot of convertedSlots()) {
    refused.game.ram.setU16(SHOT.p1Table + slot * SHOT.stride, 0x8000);
  }
  const canceled = putBullet(refused.game.ram, 0);
  refused.game.ram.setU16(BULLET_DRIVER.armWord, 1);
  refused.game.ram.setU16(BULLET_DRIVER.modeWord, 0);
  assert.equal(screenClear(refused.game, refused.options), 1);
  assert.equal(refused.game.ram.u16(canceled), 0, 'the authentic clear still frees the bullet');
  for (const slot of convertedSlots()) {
    assert.equal(refused.game.ram.u16(SHOT.p1Table + slot * SHOT.stride), 0x8000,
      'a full authentic shot window is not overwritten');
  }

  const vanilla = makeGame();
  putBullet(vanilla.game.ram, 0);
  vanilla.game.ram.setU16(BULLET_DRIVER.armWord, 1);
  vanilla.game.ram.setU16(BULLET_DRIVER.modeWord, 0);
  assert.equal(screenClear(vanilla.game, vanilla.options), 1);
  assert.equal(vanilla.game.ram.u16(
    SHOT.p1Table + PLAYER_SLOTS.primary[0] * SHOT.stride), 0,
  'a null loadout clears normally without invoking a conversion callback');
});

test('W495 Friendly Converted Bullets does not change ordinary enemy-bullet collisions', () => {
  const { game } = makeGame('friendly-converted-bullets');
  const ram = game.ram;
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x4000);
  ram.setU16(RAM.player1 + P.posX, 0x2000);
  for (const offset of [P.hitYPlus, P.hitYMinus, P.hitXPlus, P.hitXMinus]) {
    ram.setU16(RAM.player1 + offset, 0x100);
  }
  const bullet = putBullet(ram, 0, 0x4000, 0x2000);
  assert.equal(playerBox(ram, RAM.player1).hit, true);
  assert.equal(ram.u16(bullet), 0x9003);
});

test('W495 Loop 2 From Stage 1 changes only an ordinary selected launch, once', () => {
  const seed = new Uint8Array(MACHINE.ramSize);
  const loop = MOD_RAM.loopCounter - MACHINE.ramBase;
  const stage = 0x813096 - MACHINE.ramBase;
  const invuln = MOD_RAM.invulnP1 - MACHINE.ramBase;
  seed[loop] = 0;
  seed[loop + 1] = 7;
  seed[stage] = 0;
  seed[stage + 1] = 1;
  seed[invuln] = 0xff;
  const state = stateOf('loop-2-from-stage-1');

  const launched = launchSeedForBrowser(seed, null, state);
  const ram = new Ram(launched);
  assert.equal(ram.u16(MOD_RAM.loopCounter), 1);
  assert.equal(ram.u16(0x813096), 1, 'stage 1 is retained');
  assert.equal(ram.u8(MOD_RAM.invulnP1), 0, 'the launch remains mortal');
  assert.equal(seed[loop + 1], 7, 'the source seed is not mutated');

  ram.setU16(MOD_RAM.loopCounter, 2);
  ram.setU16(0x813096, 2);
  applyPreFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.loopCounter), 2, 'the loop counter is not held after launch');
  assert.equal(ram.u16(0x813096), 2, 'normal stage progression remains cartridge-owned');

  const rung = { poke: '813098=0007' };
  assert.equal(launchSeedForBrowser(seed, rung, state), seed,
    'a labelled progression seed is returned byte-for-byte');
  const replayGame = new Game(seed, TABLES, { palCatchUp: false,
    ...(modGameOptions(state) ?? {}) });
  assert.equal(replayGame.ram.u16(MOD_RAM.loopCounter), 7,
    'the per-Game options do not rewrite a replay seed');

  const laterVanilla = launchSeedForBrowser(seed, null, null);
  assert.equal(new Ram(laterVanilla).u16(MOD_RAM.loopCounter), 7,
    'the selected launch does not leak into a later vanilla Game');
});
