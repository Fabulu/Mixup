// W494: revenge bullets, control-driven bullet polarity, and score mayhem.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Game } from '../src/main.js';
import { RAM, P } from '../src/machine.js';
import { ENEMY, runEnemyDriver } from '../src/enemies.js';
import { BUL, REC, TYPEBIT, poolClear } from '../src/bullets.js';
import { DMG, playerBox } from '../src/damage.js';
import { LEDGER, bcdAdd } from '../src/score.js';
import {
  MODS, MOD_IDS, MOD_RAM, resolveLoadout, createModState, modGameOptions, replayPolicy,
} from '../src/mods.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
const stateOf = (...ids) => createModState(resolveLoadout(ids));

function makeGame(...ids) {
  const state = stateOf(...ids);
  const game = new Game(new Uint8Array(0x20000), TABLES, {
    palCatchUp: false,
    ...(modGameOptions(state) ?? {}),
  });
  return { game, state };
}

function putPlayer(ram, rec, y = 0x4000, x = 0x2000, focused = false) {
  ram.setU16(rec, 0x8000);
  ram.setU16(rec + P.posY, y);
  ram.setU16(rec + P.posX, x);
  ram.setU8(rec + P.dirByte, focused ? 0x10 : 0);
  for (const offset of [P.hitYPlus, P.hitYMinus, P.hitXPlus, P.hitXMinus]) {
    ram.setU16(rec + offset, 0x100);
  }
}

function putBullet(ram, slot, bank, y = 0x4000, x = 0x2000) {
  const rec = BUL.pool + slot * BUL.stride;
  ram.setU16(rec, 0x8000 | (bank === 'B' ? TYPEBIT.coreB : 0));
  ram.setU16(rec + REC.posA, y);
  ram.setU16(rec + REC.posB, x);
  return rec;
}

function driveEnemy(options, rec, handler) {
  const ram = new Ram();
  poolClear(ram);
  putPlayer(ram, RAM.player1);
  const sub = DMG.poolA;
  ram.setU16(rec, 0x8000);
  ram.setU32(rec + ENEMY.subRecOff, sub);
  ram.setU32(rec + ENEMY.handlerOff, 0x123456);
  ram.setU16(sub + 0x02, 0x3000);
  ram.setU16(sub + 0x04, 0x1800);
  runEnemyDriver(ram, new Map([[0x123456, handler]]), {
    rom: ROM,
    ...options,
  });
  return ram;
}

test('W494 catalogue remains present after later additions and all three mods block replay v1', () => {
  const ids = ['revenge-bullets', 'bullet-polarity', 'score-multiplier-mayhem'];
  assert.equal(MOD_IDS.length, 37);
  for (const id of ids) {
    assert.equal(MODS[id].category, 'challenge');
    assert.equal(MODS[id].replaySafe, false);
    assert.ok(MODS[id].name && MODS[id].effects.length);
  }
  const loadout = resolveLoadout([...ids, 'low-rank', 'maximum-rank']);
  assert.deepEqual(loadout.ids, ['maximum-rank', ...ids]);
  assert.deepEqual(loadout.conflicts, [{
    group: 'rank', winner: 'maximum-rank', dropped: ['low-rank'],
  }]);
  assert.deepEqual(replayPolicy(stateOf(...ids)).blocking, ids);

  const { game: modded } = makeGame(...ids);
  for (const name of ['enemyDeathHook', 'enemyBulletCollisionFilter', 'scoreAddendTransform']) {
    assert.equal(typeof modded[name], 'function');
  }
  const { game: vanilla } = makeGame();
  assert.equal(modGameOptions(null), null);
  for (const name of ['enemyDeathHook', 'enemyBulletCollisionFilter', 'scoreAddendTransform']) {
    assert.equal(Object.hasOwn(vanilla, name), false, `${name} is absent from a null loadout`);
  }
});

test('W494 Revenge Bullets fires once only for a scored fatal common-band retirement', () => {
  const options = modGameOptions(stateOf('revenge-bullets'));
  const killed = driveEnemy(options, ENEMY.bandCommon, (ram, rec, _slot, ctx) => {
    ctx.killEvent?.(0x100, 0x10);
    ram.setU16(rec, 0);
  });
  assert.equal(killed.u16(BUL.pool) & TYPEBIT.alive, TYPEBIT.alive);
  assert.equal(killed.u16(BUL.pool) & TYPEBIT.coreB, 0, 'revenge shot uses authentic bank A');
  assert.deepEqual([
    killed.u16(BUL.pool + REC.posA), killed.u16(BUL.pool + REC.posB),
  ], [0x3000, 0x1800], 'the bullet starts at the enemy final position');

  const retired = driveEnemy(options, ENEMY.bandCommon, (ram, rec) => ram.setU16(rec, 0));
  assert.equal(retired.u16(BUL.pool), 0, 'offscreen retirement has no score-kill signal');

  const boss = driveEnemy(options, ENEMY.bandBoss, (ram, rec, _slot, ctx) => {
    ctx.killEvent?.(0x1000, 0x10);
    ram.setU16(rec, 0);
  });
  assert.equal(boss.u16(BUL.pool), 0, 'boss-band phase retirement is excluded');

  let calls = 0;
  const free = new Ram();
  runEnemyDriver(free, new Map(), { enemyDeathHook() { calls++; } });
  assert.equal(calls, 0, 'free records never reach the callback');
});

test('W494 Revenge Bullets preserves both authentic bullet allocator refusals', () => {
  const { game } = makeGame('revenge-bullets');
  const event = { rec: ENEMY.bandCommon, y: 0x3000, x: 0x1800 };
  putPlayer(game.ram, RAM.player1);
  poolClear(game.ram);

  game.ram.setU16(BUL.freezeA, 1);
  const declined = game.enemyDeathHook(game.ram, event, { rom: game.rom });
  assert.equal(declined.declined, true);
  assert.equal(game.ram.u16(BUL.pool), 0);

  game.ram.setU16(BUL.freezeA, 0);
  const activeSlots = 5 * (BUL.windowIters[0] + 1);
  for (let slot = 0; slot < activeSlots; slot++) {
    game.ram.setU16(BUL.pool + slot * BUL.stride, 0x8000);
  }
  const full = game.enemyDeathHook(game.ram, event, { rom: game.rom });
  assert.equal(full.carry, true);
  assert.equal(full.addr, null);
});

test('W494 Bullet Polarity resolves P1 and P2 from their own laser focus state', () => {
  const filter = modGameOptions(stateOf('bullet-polarity')).enemyBulletCollisionFilter;

  const p1 = new Ram();
  putPlayer(p1, RAM.player1, 0x4000, 0x2000, false);
  const p1A = putBullet(p1, 0, 'A');
  const p1B = putBullet(p1, 1, 'B');
  assert.equal(playerBox(p1, RAM.player1, { enemyBulletCollisionFilter: filter }).hit, true);
  assert.equal(p1.u16(p1A), 0x8000, 'unfocused P1 phases through bank A');
  assert.equal(p1.u16(p1B), 0x9200, 'unfocused P1 remains vulnerable to bank B');

  const p2 = new Ram();
  putPlayer(p2, RAM.player1, 0x5000, 0x2800, false);
  putPlayer(p2, RAM.player2, 0x4000, 0x2000, true);
  const p2B = putBullet(p2, 0, 'B');
  const p2A = putBullet(p2, 1, 'A');
  assert.equal(playerBox(p2, RAM.player2, { enemyBulletCollisionFilter: filter }).hit, true);
  assert.equal(p2.u16(p2B), 0x8200, 'focused P2 phases through bank B');
  assert.equal(p2.u16(p2A), 0x9000, 'focused P2 remains vulnerable to bank A');

  const vanilla = new Ram();
  putPlayer(vanilla, RAM.player1);
  const vanillaA = putBullet(vanilla, 0, 'A');
  assert.equal(playerBox(vanilla, RAM.player1).hit, true);
  assert.equal(vanilla.u16(vanillaA), 0x9000, 'an unselected Game keeps authentic collision');
});

test('W494 Score Multiplier Mayhem changes only final P1/P2 pending-ledger additions', () => {
  const { game } = makeGame('score-multiplier-mayhem');
  const ram = game.ram;

  ram.setU16(MOD_RAM.logicFrame, 0);
  bcdAdd(ram, LEDGER.p1.pendingEnd, 0x00000012);
  ram.setU16(MOD_RAM.logicFrame, 1);
  bcdAdd(ram, LEDGER.p1.pendingEnd, 0x00000012);
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000036, 'P1 cycles from x1 to x2');

  ram.setU16(MOD_RAM.logicFrame, 7);
  bcdAdd(ram, LEDGER.p2.pendingEnd, 0x00000125);
  assert.equal(ram.u32(LEDGER.p2.pendingEnd - 4), 0x00001000, 'P2 receives packed-BCD x8');

  bcdAdd(ram, LEDGER.p1.accB, 0x00000125);
  assert.equal(ram.u32(LEDGER.p1.accB - 4), 0x00000125,
    'an internal chain accumulator is not multiplied');

  ram.setU32(LEDGER.p2.pendingEnd - 4, 0x99999999);
  ram.setU16(MOD_RAM.logicFrame, 1);
  bcdAdd(ram, LEDGER.p2.pendingEnd, 0x00000001);
  assert.equal(ram.u32(LEDGER.p2.pendingEnd - 4), 0x00000001,
    'eight-digit overflow wraps like the authentic ledger adder');

  const { game: vanilla } = makeGame();
  vanilla.ram.setU16(MOD_RAM.logicFrame, 7);
  bcdAdd(vanilla.ram, LEDGER.p1.pendingEnd, 0x00000125);
  assert.equal(vanilla.ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000125,
    'the WeakMap policy does not leak into a later vanilla Game');
});

test('W494 score mayhem multiplies one Graze Reactor ledger award without multiplying bookkeeping', () => {
  const { game, state } = makeGame('graze-reactor', 'score-multiplier-mayhem');
  game.ram.setU16(MOD_RAM.logicFrame, 3);
  const bullet = BUL.pool;
  game.playerGrazeHook(game.ram, {
    player: RAM.player1, live: [bullet], near: [bullet],
  });
  assert.equal(game.ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000400);
  assert.deepEqual(state.runtime.grazeCount, [1, 0]);
});
