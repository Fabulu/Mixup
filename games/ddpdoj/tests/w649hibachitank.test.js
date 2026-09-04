import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { BUL, REC as BULLET_REC } from '../src/bullets.js';
import { DMG } from '../src/damage.js';
import { ENEMY } from '../src/enemies.js';
import { Game } from '../src/main.js';
import { P, RAM } from '../src/machine.js';
import {
  bindModGame, createModState, modGameOptions, resolveLoadout,
} from '../src/mods.js';
import {
  playableHibachiAcceptsTarget, playableHibachiBulletOverlapsEnemy,
} from '../src/playablehibachi.js';
import { SPAWN, resolveMovementPtr } from '../src/spawn.js';

const ASSETS = new URL('../assets/', import.meta.url);
const SEED_URL = new URL('seed.bin.gz', ASSETS);
const TABLES_URL = new URL('player.tables.json.gz', ASSETS);
const HAVE = existsSync(SEED_URL) && existsSync(TABLES_URL);
const SKIP = HAVE ? false : 'exact local Stage 1 bundle absent; this is a skip, not a pass';
const SEED = HAVE ? new Uint8Array(gunzipSync(readFileSync(SEED_URL))) : null;
const TABLES = HAVE ? JSON.parse(gunzipSync(readFileSync(TABLES_URL)).toString('utf8')) : null;

const HELD_P1_SHOT = 0xffdf;
const MAX_FRAMES = 5800;
const TARGETS = [
  {
    name: 'late Type $88',
    type: 0x88,
    trigger: 390,
    stageRecord: 0x231504,
    movementRecord: 0x2320fa,
    liveMovement: 0x232102,
    handler: 0x275f30,
    initialHp: [0x1280, 0x0000],
  },
  {
    name: 'first final Type $80',
    type: 0x80,
    trigger: 455,
    stageRecord: 0x2316d4,
    movementRecord: 0x232426,
    liveMovement: 0x23242e,
    handler: 0x2739c0,
    initialHp: [0x0e00, 0x0e00],
    shield: 0xffff,
  },
  {
    name: 'second final Type $80',
    type: 0x80,
    trigger: 458,
    stageRecord: 0x2316e4,
    movementRecord: 0x23244c,
    liveMovement: 0x232454,
    handler: 0x2739c0,
    initialHp: [0x0e00, 0x0e00],
    shield: 0xffff,
  },
];

function enemyVariant(enemy) {
  const slot = (enemy - DMG.poolA) / DMG.enemyStride;
  assert.equal(Number.isInteger(slot), true, 'enemy address belongs to the damage pool');
  assert.ok(slot >= 0 && slot < 150, 'enemy address stays inside the damage pool');
  return slot < 100 ? 'A' : 'B';
}

function firstBulletDestinations(game, playable) {
  const { ram } = game;
  const destinations = new Map();
  for (let slot = 0; slot < playable.ownedBullets.length; slot++) {
    if (playable.ownedBullets[slot] === 0) continue;
    const bullet = BUL.pool + slot * BUL.stride;
    if ((ram.u16(bullet) & 0x9000) !== 0x8000) continue;
    const y = ram.u16(bullet + BULLET_REC.posA);
    const x = ram.u16(bullet + BULLET_REC.posB);
    const halfExtent = playable.bulletHalfExtents[slot];
    for (let enemySlot = 0; enemySlot < 150; enemySlot++) {
      const enemy = DMG.poolA + enemySlot * DMG.enemyStride;
      if (!playableHibachiAcceptsTarget(ram, enemy)) continue;
      if (!playableHibachiBulletOverlapsEnemy(
        ram, enemy, y, x, halfExtent, enemyVariant(enemy))) continue;
      destinations.set(slot, enemy);
      break;
    }
  }
  return destinations;
}

function matchingRoot(ram, target) {
  const matches = [];
  for (let slot = 0; slot < ENEMY.slots; slot++) {
    const root = ENEMY.table + slot * ENEMY.stride;
    if ((ram.u16(root) & 0x8000) === 0) continue;
    if (ram.u8(root + 0x0c) !== target.type) continue;
    if ((ram.u32(root + ENEMY.handlerOff) & 0xffffff) !== target.handler) continue;
    if ((ram.u32(root + 0x12) & 0xffffff) !== target.liveMovement) continue;
    matches.push(root);
  }
  assert.equal(matches.length, 1,
    `${target.name} has one exact live root at trigger ${target.trigger}`);
  return matches[0];
}

test('Playable Hibachi naturally receipts and retires shots on late Stage 1 tanks',
  { skip: SKIP }, () => {
  const mods = createModState(resolveLoadout(['playable-hibachi']));
  const game = new Game(SEED, TABLES, {
    palCatchUp: false,
    ...modGameOptions(mods),
  });
  bindModGame(mods, game, { active: true });
  const playable = mods.playableHibachi;
  const observed = TARGETS.map((target) => ({ ...target, root: null, subs: null,
    receipt: null }));

  for (const target of observed) {
    assert.equal(game.rom.u16(target.stageRecord), target.trigger,
      `${target.name} stage trigger`);
    assert.equal(game.rom.u8(target.stageRecord + 0x04), target.type,
      `${target.name} stage type`);
    assert.equal(resolveMovementPtr(
      game.ram, game.rom, target.stageRecord, null), target.movementRecord,
    `${target.name} stage movement record`);
  }

  let frame = 0;
  const retirements = [];
  const productionRetire = game.bulletRetireHook;
  game.bulletRetireHook = (ram, event, ctx) => {
    const before = Number.isInteger(event?.addr) ? ram.u16(event.addr) : null;
    const result = productionRetire?.(ram, event, ctx);
    if (event?.reason === 'mover' && Number.isInteger(event.slot)) {
      retirements.push({
        frame,
        slot: event.slot,
        status: before,
        ownerAfter: playable.ownedBullets[event.slot],
      });
    }
    return result;
  };

  const productionDamage = game.privateDamageTailHook;
  game.privateDamageTailHook = (hookGame, invokingCtx) => {
    const { ram } = hookGame;
    const distance = ram.u16(SPAWN.DISTANCE_CLOCK);
    for (const target of observed) {
      if (target.root !== null || distance !== target.trigger) continue;
      const root = matchingRoot(ram, target);
      const sub = ram.u32(root + ENEMY.subRecOff);
      target.root = root;
      target.subs = [sub, sub + DMG.enemyStride];
      assert.equal(ram.u16(root + ENEMY.seqOff), 1, `${target.name} owns two subrecords`);
      assert.equal(ram.u16(root + 0x0a), game.rom.u16(target.stageRecord + 0x02),
        `${target.name} keeps its stage parameter`);
      assert.equal(ram.u8(root + ENEMY.classOff), game.rom.u8(target.stageRecord + 0x05),
        `${target.name} keeps its stage flags`);
      assert.deepEqual(target.subs.map((enemy) => ram.u16(enemy + 0x18)),
        target.initialHp, `${target.name} begins with cartridge HP`);
      if (target.shield !== undefined) {
        assert.equal(ram.u16(root + 0x36), target.shield,
          `${target.name} begins with its shield arm inactive`);
      }
    }

    const pending = observed.filter((target) => target.subs && !target.receipt);
    const beforeTargets = pending.map((target) => ({
      target,
      hp: target.subs.map((enemy) => ram.u16(enemy + 0x18)),
    }));
    const beforeBullets = playable.ownedBullets.map((owner, slot) => owner === 0
      ? 0 : ram.u16(BUL.pool + slot * BUL.stride));
    const destinations = pending.length ? firstBulletDestinations(hookGame, playable) : new Map();
    const hits = productionDamage(hookGame, invokingCtx);

    const received = [];
    for (let slot = 0; slot < beforeBullets.length; slot++) {
      const after = ram.u16(BUL.pool + slot * BUL.stride);
      if ((beforeBullets[slot] & 0x1000) === 0 && (after & 0x1000) !== 0) {
        received.push(slot);
      }
    }
    for (const { target, hp } of beforeTargets) {
      const afterHp = target.subs.map((enemy) => ram.u16(enemy + 0x18));
      const changed = afterHp.flatMap((value, index) => value === hp[index] ? [] : [index]);
      if (changed.length === 0) continue;
      const slots = received.filter((slot) => target.subs.includes(destinations.get(slot)));
      assert.ok(slots.length > 0,
        `${target.name} HP debit has a received Playable projectile`);
      const slot = slots[0];
      const enemy = destinations.get(slot);
      const subIndex = target.subs.indexOf(enemy);
      assert.ok(changed.includes(subIndex),
        `${target.name} received projectile identifies the debited subrecord`);
      assert.ok((ram.u16(enemy) & DMG.maskP1) !== 0,
        `${target.name} records the real P1 ordinary-shot receipt`);
      assert.equal(playable.ownedBullets[slot], 1,
        `${target.name} projectile retains P1 provenance until retirement`);
      assert.ok((ram.u16(BUL.pool + slot * BUL.stride) & 0x1000) !== 0,
        `${target.name} projectile is marked received`);
      target.receipt = {
        frame,
        slot,
        subIndex,
        hpBefore: hp[subIndex],
        hpAfter: afterHp[subIndex],
        playerY: ram.u16(RAM.player1 + P.posY),
        playerX: ram.u16(RAM.player1 + P.posX),
      };
    }
    return hits;
  };

  for (frame = 1; frame <= MAX_FRAMES; frame++) {
    game.step(HELD_P1_SHOT);
    const complete = observed.every((target) => target.receipt
      && retirements.some((event) => event.slot === target.receipt.slot
        && event.frame === target.receipt.frame + 1));
    if (complete) break;
  }

  assert.ok(frame <= MAX_FRAMES, `all natural receipts retire by frame ${MAX_FRAMES}`);
  assert.ok(game.ram.u16(SPAWN.DISTANCE_CLOCK) >= 458,
    'the production run reaches both final tank triggers');
  for (const target of observed) {
    assert.ok(target.root !== null, `${target.name} exact root was observed`);
    assert.ok(target.receipt, `${target.name} receives Playable damage`);
    assert.notEqual(target.receipt.hpAfter, target.receipt.hpBefore,
      `${target.name} loses real HP`);
    assert.deepEqual([target.receipt.playerY, target.receipt.playerX], [0x1179, 0x14c0],
      `${target.name} is hit under the matched stationary P1 trace`);
    const retired = retirements.find((event) => event.slot === target.receipt.slot
      && event.frame === target.receipt.frame + 1);
    assert.ok(retired, `${target.name} received projectile retires on the next frame`);
    assert.ok((retired.status & 0x1000) !== 0,
      `${target.name} mover sees the received status`);
    assert.equal(retired.ownerAfter, 0,
      `${target.name} mover retirement clears Playable ownership`);
  }
});
