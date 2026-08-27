// W616: private P3 outgoing enemy collision and damage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACHINE, P, RAM } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import { commitCreates, objTableInit24107C } from '../src/objalloc.js';
import { ENEMY } from '../src/enemies.js';
import {
  DMG, PRIVATE_DAMAGE_GEOMETRY, poolDamage, privateOutgoingDamagePass,
  shotBoundingBox,
} from '../src/damage.js';
import {
  P3_PRIVATE_DAMAGE_RESOURCES, P3_VIRTUAL, P3_VIRTUAL_RANGES,
  THREE_PILOT_FORMATION_MODE, THREE_PILOT_SHARED_RANGES,
  attachThreePilotFoundation, runThreePilotDamageObject,
  runThreePilotOptionObject, runThreePilotShotObject,
} from '../src/formationactors.js';
import { SCORE, LEDGER, scoreHit, scoreKill } from '../src/score.js';
import { BOSS, bossBody2A6B94, bossDamage294AD8 } from '../src/boss.js';
import { boss4Damage29FB5C } from '../src/boss4.js';
import { handler42 } from '../src/stage4type42.js';
import { handlerMap, runHandler } from '../src/handlers.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { ITEM } from '../src/items.js';
import { SPARK } from '../src/spark.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'exact browser bundle absent; private P3 damage proof is skipped, not passed';
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

function activate(state) {
  const created = commitCreates(state.game.ram);
  state.objectDriverHook({
    phase: 'after-commit', ram: state.game.ram, created, killed: 0,
  });
  assert.equal(state.lifecycle, 'alive');
}

async function exactState(marker = 2) {
  const demo = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz,
    undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
  const foundation = attachThreePilotFoundation(demo.game, { inputWord: 0xffff });
  activate(foundation);
  const state = foundation.manager.companions.find(
    (candidate) => candidate.binding.marker === marker);
  assert.ok(state);
  return { demo, game: demo.game, state };
}

function clearRange(memory, address, length) {
  for (let offset = 0; offset < length; offset++) memory.setU8(address + offset, 0);
}

function bytes(memory, address, length) {
  return Uint8Array.from({ length }, (_, offset) => memory.u8(address + offset));
}

function scoreState(ram) {
  return bytes(ram, 0x81b4c0, 0x01a0);
}

function resetCombat(state, game) {
  clearRange(game.ram, ENEMY.table, ENEMY.slots * ENEMY.stride);
  clearRange(game.ram, DMG.poolA, PRIVATE_DAMAGE_GEOMETRY.enemySlots * DMG.enemyStride);
  clearRange(state.memory, state.binding.shots,
    PRIVATE_DAMAGE_GEOMETRY.shotSlots * PRIVATE_DAMAGE_GEOMETRY.shotStride);
  clearRange(state.memory, state.damage.resources.beamControl, 0x20);
  clearRange(state.memory, state.damage.resources.slot27, 0x30);
  clearRange(state.memory, state.damage.resources.slot30, 0x30);
  game.ram.setU16(DMG.poolACount, 0);
  game.ram.setU16(DMG.poolBCount, 0);
  game.ram.setU16(DMG.mirror2, 0);
  game.ram.setU16(DMG.gate308c, 1);
  game.ram.setU16(DMG.b410, 0);
  game.ram.setU16(DMG.g309c, 0);
  game.ram.setU16(0x8130f8, 0);
  game.ram.setU16(0x81312c, 0);
  state.memory.setU16(state.binding.player + P.state, 0x8000);
  state.memory.setU8(state.binding.player + DMG.laserByte, 0);
  state.shots.actorId = state.actorId;
  state.beam.actorId = state.actorId;
}

function putOwner(ram, rec, { mainSlot = 0, span = 1 } = {}) {
  const main = ENEMY.table + mainSlot * ENEMY.stride;
  ram.setU16(main, 0x8000 | mainSlot);
  ram.setU16(main + ENEMY.seqOff, span - 1);
  ram.setU32(main + ENEMY.subRecOff, rec);
  ram.setU8(main + ENEMY.classOff, 0x11 + mainSlot);
  ram.setU32(main + ENEMY.handlerOff, 0x2688cc + mainSlot * 2);
  return main;
}

function putShot(memory, slot = 0, options = {}) {
  const rec = P3_VIRTUAL.shots + slot * DMG.shotStride;
  memory.setU16(rec, options.type ?? 0x8000);
  memory.setU16(rec + 0x02, options.y ?? 0x1000);
  memory.setU16(rec + 0x04, options.x ?? 0x1800);
  memory.setU16(rec + 0x10, options.yp ?? 0x0100);
  memory.setU16(rec + 0x12, options.ym ?? 0x0080);
  memory.setU16(rec + 0x14, options.xp ?? 0x0120);
  memory.setU16(rec + 0x16, options.xm ?? 0x0060);
  memory.setU16(rec + 0x18, options.power ?? 0x0400);
  return rec;
}

function putNativeShot(ram, slot = 0, options = {}) {
  const rec = DMG.p1shots + slot * DMG.shotStride;
  ram.setU16(rec, options.type ?? 0x8000);
  ram.setU16(rec + 0x02, options.y ?? 0x1000);
  ram.setU16(rec + 0x04, options.x ?? 0x1800);
  ram.setU16(rec + 0x10, options.yp ?? 0x0100);
  ram.setU16(rec + 0x12, options.ym ?? 0x0080);
  ram.setU16(rec + 0x14, options.xp ?? 0x0120);
  ram.setU16(rec + 0x16, options.xm ?? 0x0060);
  ram.setU16(rec + 0x18, options.power ?? 0x0400);
  return rec;
}

function putEnemy(ram, rec, options = {}) {
  ram.setU16(rec, options.tw ?? 0xa000);
  ram.setU16(rec + 0x02, options.y ?? 0x1000);
  ram.setU16(rec + 0x04, options.x ?? 0x1800);
  ram.setU16(rec + 0x10, options.yp ?? 0x0200);
  ram.setU16(rec + 0x12, options.ym ?? 0x0180);
  ram.setU16(rec + 0x14, options.xp ?? 0x0140);
  ram.setU16(rec + 0x16, options.xm ?? 0x0100);
  ram.setU16(rec + 0x18, options.hp ?? 0x1000);
  putOwner(ram, rec, options);
  return rec;
}

function putWeaponObject(memory, rec, options = {}) {
  memory.setU16(rec, options.type ?? 0x8000);
  memory.setU16(rec + 0x02, options.y ?? 0x0c00);
  memory.setU16(rec + 0x04, options.x ?? 0x1000);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) {
    memory.setU16(rec + offset, options.extent ?? 0x0800);
  }
  memory.setU16(rec + 0x18, options.power ?? 0x0400);
}

function putBeam(memory, options = {}) {
  const rec = P3_VIRTUAL.beamControl;
  memory.setU16(rec, options.type ?? 0x8000);
  memory.setU16(rec + 0x02, options.y ?? 0x2c00);
  memory.setU16(rec + 0x04, options.x ?? 0x3000);
  memory.setU16(rec + 0x06, options.height ?? 0x1000);
  memory.setU16(rec + 0x08, options.xp ?? 0x0400);
  memory.setU16(rec + 0x0a, options.xm ?? 0x0400);
  memory.setU16(rec + 0x0e, options.damage ?? 0x0400);
  memory.setU16(rec + 0x1a, options.formation ?? 0);
  memory.setU16(rec + 0x1c, options.baseDamage ?? 0x0400);
  return rec;
}

function prepareBoss4SideHit(state, game, nativeMask = 0) {
  resetCombat(state, game);
  const root = DMG.poolA;
  const main = putOwner(game.ram, root, { span: 14 });
  game.ram.setU32(main + 0x16, 0x00030000);
  game.ram.setU16(main + 0x1a, 0xffff);
  game.ram.setU16(main + 0x1c, 0xffff);
  game.ram.setU16(0x8130e6, 0);
  game.ram.setU16(0x8130e8, 0);
  game.ram.setU16(0x8130ea, 0);
  for (const part of [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0]) {
    const rec = root + part;
    game.ram.setU16(rec, 0xa000);
    game.ram.setU16(rec + 0x02, 0x5000);
    game.ram.setU16(rec + 0x04, 0x5000);
    for (const offset of [0x10, 0x12, 0x14, 0x16]) {
      game.ram.setU16(rec + offset, 0x0200);
    }
    game.ram.setU16(rec + 0x18, 0x7fff);
  }
  const side = root + 0xa0;
  game.ram.setU16(side, 0xa000 | (nativeMask << 8));
  game.ram.setU16(side + 0x02, 0x1000);
  game.ram.setU16(side + 0x04, 0x1000);
  game.ram.setU8(root + 0x9f, 1);
  game.ram.setU8(root + 0xbf, 1);
  game.ram.setU16(RAM.player1, 0x8000);
  state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 1);
  putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot27, {
    y: 0x0c00, x: 0x1000, power: 0x0400,
  });
  runThreePilotDamageObject(game);
  return { main, root, side };
}

function boss4Context(state, game) {
  return {
    ram: game.ram,
    rom: game.rom,
    tables: game.tables,
    unported: game.unportedLog,
    privateDamageReceiptHook: receiptHook(state, game),
    soundPost: () => {},
  };
}

function putBoss4WeaponHit(state, game, rec, nativeMask = 0, power = 0x0400) {
  game.ram.setU16(rec, 0xa000 | (nativeMask << 8));
  game.ram.setU16(rec + 0x02, 0x1000);
  game.ram.setU16(rec + 0x04, 0x1000);
  game.ram.setU16(rec + 0x18, 0x7fff);
  state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 1);
  putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot27, {
    y: 0x0c00, x: 0x1000, power,
  });
  runThreePilotDamageObject(game);
}

function putType42Target(game, rec, mainSlot) {
  const main = putOwner(game.ram, rec, { mainSlot, span: 4 });
  game.ram.setU8(rec + 0x3c, 0x70);
  game.ram.setU8(rec + 0x3e, 0);
  game.ram.setU8(rec + 0x3f, 0);
  game.ram.setU16(0x8130f0, 0);
  game.ram.setU16(0x8130f4, 0);
  game.ram.setU16(0x8130d2, 1);
  return main;
}

function receiptIndex(rec) {
  return (rec - PRIVATE_DAMAGE_GEOMETRY.enemyBase) / DMG.enemyStride;
}

function receiptByte(state, rec) {
  return state.memory.u8(state.binding.virtual.damageReceipts + receiptIndex(rec));
}

function receiptHook(state, game) {
  return (event) => state.privateDamageReceiptHook(game, event);
}

function enterEnemy(state, game, main, sub, span) {
  state.privateDamageReceiptHook(game, {
    phase: 'enter-enemy', ram: game.ram, main, sub, span,
  });
}

function exitEnemy(state, game, main, sub, span) {
  state.privateDamageReceiptHook(game, {
    phase: 'exit-enemy', ram: game.ram, main, sub, span,
  });
}

function changedAddresses(before, after) {
  const changed = [];
  for (let offset = 0; offset < before.length; offset++) {
    if (before[offset] !== after[offset]) changed.push(MACHINE.ramBase + offset);
  }
  return changed;
}

function primePrivateOrdinaryShots(state, game) {
  for (let frame = 0; frame < 48; frame++) {
    state.memory.setU8(P3_VIRTUAL.player + P.dirByte, 0);
    state.memory.setU8(P3_VIRTUAL.player + P.btnByte, 0);
    runThreePilotOptionObject(game);
    state.weapons.requests.length = 0;
  }
  state.memory.setU8(P3_VIRTUAL.player + P.dirByte, 0x10);
  state.memory.setU8(P3_VIRTUAL.player + P.btnByte, 0x10);
  runThreePilotShotObject(game);
  runThreePilotOptionObject(game);
}

test('W616 binds exact owner-2 geometry and narrow scratch, receipt, RNG, and spark capabilities', () => {
  assert.deepEqual(PRIVATE_DAMAGE_GEOMETRY, {
    ownerIndex: 2,
    player: 0x10000100,
    shots: 0x10000400,
    shotSlots: 36,
    shotStride: 0x30,
    beamControl: 0x10000b00,
    slot27: 0x10001110,
    slot30: 0x100011a0,
    scratch: 0x10001400,
    scratchLength: 0x0e,
    hyperShadows: 0x1000140e,
    hyperShadowLength: 0x04,
    receipts: 0x10001420,
    receiptCount: 150,
    enemyBase: 0x81459c,
    enemySlots: 150,
    enemyStride: 0x20,
    ordinaryMask: 0x4000,
    weaponMask: 0x4400,
    phaseAddress: 0x80390c,
  });
  assert.equal(P3_PRIVATE_DAMAGE_RESOURCES.incomingPolicy, 'none');
  assert.equal(P3_PRIVATE_DAMAGE_RESOURCES.bombPolicy, 'none');
  assert.equal(P3_PRIVATE_DAMAGE_RESOURCES.bulletErasePolicy, 'none');
  assert.equal(P3_PRIVATE_DAMAGE_RESOURCES.itemPolicy, 'none');
  assert.equal(P3_PRIVATE_DAMAGE_RESOURCES.hyperPolicy, 'zero-shadow');
  const ranges = new Map(P3_VIRTUAL_RANGES.map((range) => [range.start, range]));
  assert.equal(ranges.get(P3_VIRTUAL.damageScratch).length, 0x0e);
  assert.equal(ranges.get(P3_VIRTUAL.damageHyperShadows).length, 0x04);
  assert.equal(ranges.get(P3_VIRTUAL.damageReceipts).length, 150);
  for (const [start, length] of [[0x803916, 2], [SPARK.p1Base, 30 * 0x22], [SPARK.count, 2]]) {
    assert.ok(THREE_PILOT_SHARED_RANGES.some((range) =>
      range.start === start && range.length === length));
  }
});

test('W616 rejects ordinary RAM, malformed geometry, and undeclared writes before mutation',
  { skip: SKIP_ASSETS }, async () => {
    const plain = new Ram();
    assert.throws(() => privateOutgoingDamagePass(plain, {}, P3_PRIVATE_DAMAGE_RESOURCES),
      /strict composite memory adapter/);

    const { state, game } = await exactState();
    resetCombat(state, game);
    const nativeBefore = game.ram.b.slice();
    const shotsBefore = bytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30);
    assert.throws(() => privateOutgoingDamagePass(state.damage.memory, {}, {
      ...P3_PRIVATE_DAMAGE_RESOURCES, ownerIndex: 1,
    }), /exact owner-2 geometry/);
    assert.deepEqual(game.ram.b, nativeBefore);
    assert.deepEqual(bytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30), shotsBefore);

    assert.throws(() => state.damage.memory.setU16(P3_VIRTUAL.player, 0), /read-only/);
    assert.throws(() => state.damage.memory.setU16(0x810000, 1), /rejected native write/);
    assert.throws(() => state.damage.memory.setU8(DMG.poolA, 0), /rejected native write/);
    assert.throws(() => state.damage.memory.u16(0x817f8c), /rejected native read/);
    assert.deepEqual(game.ram.b, nativeBefore,
      'all rejection paths leave cartridge RAM byte-for-byte unchanged');
  });

test('W616 runs only on phase zero and companion availability follows P1',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const enemy = putEnemy(game.ram, DMG.poolA, { hp: 0x1000 });
    const shot = putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    game.ram.setU16(DMG.p1rec, 0x8000);

    game.ram.setU16(DMG.mirror2, 1);
    const blocked = runThreePilotDamageObject(game);
    assert.equal(blocked.ran, false);
    assert.equal(game.ram.u16(enemy + 0x18), 0x1000);
    assert.equal(state.memory.u16(shot + 0x18), 0x0400);

    game.ram.setU16(DMG.mirror2, 0);
    const live = runThreePilotDamageObject(game);
    assert.equal(live.ran, true);
    assert.equal(live.hitsA, 1);
    assert.equal(game.ram.u16(enemy + 0x18), 0x0c00);

    game.ram.setU16(DMG.p1rec, 0);
    game.ram.setU16(enemy + 0x18, 0x1000);
    state.memory.setU16(shot + 0x18, 0x0400);
    assert.equal(runThreePilotDamageObject(game), null);
    assert.equal(game.ram.u16(enemy + 0x18), 0x1000,
      'a dead P1 suspends every companion outgoing path');

    game.ram.setU16(DMG.p1rec, 0x8000);
    state.memory.setU16(P3_VIRTUAL.player + P.state, 0);
    assert.equal(runThreePilotDamageObject(game), null);
  });

test('W616 ordinary pool A and B reuse exact debit and reduction arithmetic',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    resetCombat(a.state, a.game);
    const shotA = putShot(a.state.memory, 0, { power: 0x0400 });
    const enemyA = putEnemy(a.game.ram, DMG.poolA, { hp: 0x0600 });
    a.game.ram.setU16(DMG.poolACount, 1);
    const resultA = runThreePilotDamageObject(a.game);
    assert.equal(resultA.hitsA, 1);
    assert.equal(a.game.ram.u16(enemyA + 0x18), 0x0200,
      'pool A applies all $400 damage when $81308C is nonzero');
    assert.equal(a.state.memory.u16(shotA + 0x18), 0xfe00,
      'the piercing budget subtracts the enemy pre-hit HP, not damage dealt');
    assert.equal(a.game.ram.u8(enemyA) & 0x5c, 0x40);
    assert.equal(receiptByte(a.state, enemyA), 0x80,
      'the receipt saves a zero native mask before the first private write');

    const b = await exactState();
    resetCombat(b.state, b.game);
    b.game.ram.setU16(DMG.gate308c, 0);
    const shotB = putShot(b.state.memory, 0, { power: 0x0400 });
    const enemyB = putEnemy(b.game.ram, DMG.poolB, { hp: 0x0500 });
    b.game.ram.setU16(DMG.poolBCount, 1);
    const resultB = runThreePilotDamageObject(b.game);
    assert.equal(resultB.hitsB, 1);
    assert.equal(b.game.ram.u16(enemyB + 0x18), 0x0200,
      'pool B applies $400 - ($400 >> 2) = $300');
    assert.equal(b.state.memory.u16(shotB + 0x18), 0xff00,
      'pool B also debits the original $500 HP from the shot budget');
    assert.equal(b.state.memory.u16(P3_VIRTUAL.damageScratch + 0x02), 0x2900,
      'pool B rebiases shot max-Y $1100 from $2800 to $1800');
  });

test('W616 slot 27, slot 30, and held beam use private geometry and raw $4400 wakes',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 1);
    putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot27, {
      y: 0x0c00, x: 0x1000, power: 0x0400,
    });
    putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot30, {
      y: 0x1c00, x: 0x2000, power: 0x0200,
    });
    const enemy27 = putEnemy(game.ram, DMG.poolA, {
      y: 0x1000, x: 0x1000, hp: 0x1000, mainSlot: 0,
    });
    const enemy30 = putEnemy(game.ram, DMG.poolA + DMG.enemyStride, {
      y: 0x2000, x: 0x2000, hp: 0x1000, mainSlot: 1,
    });
    const enemyBeam = putEnemy(game.ram, DMG.poolA + 2 * DMG.enemyStride, {
      y: 0x3000, x: 0x3000, hp: 0x1000, mainSlot: 2,
    });
    const beam = putBeam(state.memory);

    const first = runThreePilotDamageObject(game);
    assert.deepEqual(first.weapon, { hits27: 1, hits30: 1, beam: 0 });
    assert.equal(game.ram.u16(enemy27 + 0x18), 0x0c00);
    assert.equal(game.ram.u16(enemy30 + 0x18), 0x0e00);
    assert.equal(game.ram.u8(enemy27) & 0x5c, 0x44);
    assert.equal(game.ram.u8(enemy30) & 0x5c, 0x44);
    assert.equal(state.memory.u16(beam), 0x8200,
      'the first held-beam pass arms private bit $0200 without damage');

    state.memory.setU16(PRIVATE_DAMAGE_GEOMETRY.slot27, 0);
    state.memory.setU16(PRIVATE_DAMAGE_GEOMETRY.slot30, 0);
    const second = runThreePilotDamageObject(game);
    assert.deepEqual(second.weapon, { hits27: 0, hits30: 0, beam: 1 });
    assert.equal(game.ram.u16(enemyBeam + 0x18), 0x0c00);
    assert.equal(game.ram.u8(enemyBeam) & 0x5c, 0x44);
    assert.equal(state.memory.u16(beam), 0x9201,
      'a private beam hit earns the authentic bright-column bits');
    assert.equal(state.memory.u16(beam + 0x10), 0x2e80,
      'reach is enemy Y $3000 minus $180 after the $2800 bias is removed');
  });

test('W616 marker 3 ordinary, slot 27, slot 30, and beam damage stay P1-owned',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState(3);
    resetCombat(state, game);
    assert.equal(state.binding.player, 0x10010100);
    assert.equal(state.binding.shots, 0x10010400);
    assert.equal(state.damage.resources.beamControl, 0x10010b00);
    assert.equal(state.damage.resources.slot27, 0x10011110);
    assert.equal(state.damage.resources.slot30, 0x100111a0);
    assert.equal(state.binding.virtual.damageReceipts, 0x10011420);

    state.memory.setU8(state.binding.player + DMG.laserByte, 1);
    const ordinary = state.binding.shots;
    putWeaponObject(state.memory, ordinary, {
      y: 0x4000, x: 0x0800, power: 0x0400,
    });
    putWeaponObject(state.memory, state.damage.resources.slot27, {
      y: 0x0c00, x: 0x1000, power: 0x0400,
    });
    putWeaponObject(state.memory, state.damage.resources.slot30, {
      y: 0x1c00, x: 0x2000, power: 0x0200,
    });
    const beam = state.damage.resources.beamControl;
    putWeaponObject(state.memory, beam, {
      y: 0x2c00, x: 0x3000, power: 0x0400,
    });
    state.memory.setU16(beam + 0x06, 0x1000);
    state.memory.setU16(beam + 0x08, 0x0400);
    state.memory.setU16(beam + 0x0a, 0x0400);
    state.memory.setU16(beam + 0x0e, 0x0400);
    state.memory.setU16(beam + 0x1a, 0);
    state.memory.setU16(beam + 0x1c, 0x0400);

    const enemyOrdinary = putEnemy(game.ram, DMG.poolA, {
      y: 0x4000, x: 0x0800, hp: 0x1000, mainSlot: 0,
    });
    const enemy27 = putEnemy(game.ram, DMG.poolA + DMG.enemyStride, {
      y: 0x1000, x: 0x1000, hp: 0x1000, mainSlot: 1,
    });
    const enemy30 = putEnemy(game.ram, DMG.poolA + 2 * DMG.enemyStride, {
      y: 0x2000, x: 0x2000, hp: 0x1000, mainSlot: 2,
    });
    const enemyBeam = putEnemy(game.ram, DMG.poolA + 3 * DMG.enemyStride, {
      y: 0x3000, x: 0x3000, hp: 0x1000, mainSlot: 3,
    });
    game.ram.setU16(DMG.poolACount, 4);

    runThreePilotDamageObject(game);
    assert.equal(state.damage.last.hitsA, 1);
    assert.deepEqual(state.damage.last.weapon,
      { hits27: 1, hits30: 1, beam: 0 });
    for (const [enemy, hp, mask] of [
      [enemyOrdinary, 0x0c00, 0x40],
      [enemy27, 0x0c00, 0x44],
      [enemy30, 0x0e00, 0x44],
    ]) {
      assert.equal(game.ram.u16(enemy + 0x18), hp);
      assert.equal(game.ram.u8(enemy) & 0x5c, mask);
      assert.equal(receiptByte(state, enemy), 0x80);
    }

    state.memory.setU16(ordinary, 0);
    state.memory.setU16(state.damage.resources.slot27, 0);
    state.memory.setU16(state.damage.resources.slot30, 0);
    runThreePilotDamageObject(game);
    assert.deepEqual(state.damage.last.weapon,
      { hits27: 0, hits30: 0, beam: 1 });
    assert.equal(game.ram.u16(enemyBeam + 0x18), 0x0c00);
    assert.equal(game.ram.u8(enemyBeam) & 0x5c, 0x44);
    assert.equal(receiptByte(state, enemyBeam), 0x80);
  });

test('W616 ordinary companion hit and kill use byte-exact P1 ownership',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x0100 });
    const main = ENEMY.table;
    putShot(state.memory, 0, { power: 0x0200 });
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(rec) & 0x5c, 0x40);

    const oracle = game.ram.clone();
    scoreHit(oracle, { rom: game.rom }, rec, 0x10);
    scoreKill(oracle, game.rom, { rom: game.rom }, 0x1234, 0x10);

    const kills = [];
    const ctx = {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
    };
    enterEnemy(state, game, main, rec, 1);
    scoreHit(game.ram, ctx, rec, 0x40);
    scoreKill(game.ram, game.rom, ctx, 0x1234, 0x40);
    exitEnemy(state, game, main, rec, 1);

    assert.deepEqual(game.ram.b, oracle.b);
    assert.deepEqual(kills, [[0x1234, 0x10]]);
    assert.equal(receiptByte(state, rec), 0);
  });

test('W616 authentic raw zero remains zero for a committed companion receipt',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x1000 });
    const main = ENEMY.table;
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    const before = game.ram.b.slice();

    enterEnemy(state, game, main, rec, 1);
    const ownership = state.privateDamageReceiptHook(game, {
      phase: 'score-hit', ram: game.ram, a6: rec, d1: 0,
    });
    assert.equal(ownership.mask, 0);
    assert.equal(ownership.receipt, true);
    scoreHit(game.ram, {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
    }, rec, 0);
    exitEnemy(state, game, main, rec, 1);
    assert.deepEqual(game.ram.b, before);
  });

test('W616 multipart ownership adds one P1 bit while retaining genuine P2',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const root = DMG.poolA;
    const companionPart = root + DMG.enemyStride;
    putEnemy(game.ram, root, {
      tw: 0xa800, y: 0x5000, x: 0x5000, hp: 0x1000, span: 2,
    });
    putEnemy(game.ram, companionPart, {
      tw: 0xa000, y: 0x1000, x: 0x1800, hp: 0x1000, span: 2,
    });
    putOwner(game.ram, root, { span: 2 });
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 2);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(root) & 0x5c, 0x08);
    assert.equal(game.ram.u8(companionPart) & 0x5c, 0x40);

    enterEnemy(state, game, ENEMY.table, root, 2);
    const ownership = state.privateDamageReceiptHook(game, {
      phase: 'score-hit', ram: game.ram, a6: root, d1: 0x48,
    });
    assert.equal(ownership.mask, 0x18);
    assert.equal(ownership.privateOnly, false);
    assert.deepEqual(ownership.subrecords, [companionPart]);
    exitEnemy(state, game, ENEMY.table, root, 2);
  });

test('W616 Stage-4 deferred companion ownership resolves as P1 on frame N+1',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main, root, side } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);
    assert.equal(game.ram.u8(side) & 0x5c, 0x44);
    assert.equal(receiptByte(state, side), 0x80);

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.equal(game.ram.u16(0x8130e8), 0x0400);
    assert.equal(game.ram.u16(0x8130ea), 0x0044);
    assert.equal(receiptByte(state, side), 0);
    assert.equal(state.damage.deferredEvents.size, 1);

    const oracle = game.ram.clone();
    oracle.setU16(0x8130ea, 0x0014);
    boss4Damage29FB5C(oracle, game.rom, main, root, {
      rom: game.rom,
      unported: game.unportedLog,
      soundPost: () => {},
    });

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.deepEqual(scoreState(game.ram), scoreState(oracle));
    assert.equal(game.ram.u32(main + 0x16), oracle.u32(main + 0x16));
    assert.equal(state.damage.deferredEvents.size, 0);
  });

test('W616 changed main-record identity invalidates a stale companion receipt',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x1000 });
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.notEqual(receiptByte(state, rec), 0);

    game.ram.setU32(ENEMY.table + ENEMY.handlerOff, 0x269cea);
    enterEnemy(state, game, ENEMY.table, rec, 1);
    assert.equal(receiptByte(state, rec), 0);
    exitEnemy(state, game, ENEMY.table, rec, 1);
  });

test('W616 copied damage and receipt hooks reject cross-Game use before mutation',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    resetCombat(a.state, a.game);
    resetCombat(b.state, b.game);
    putEnemy(a.game.ram, DMG.poolA, { hp: 0x1000 });
    putShot(a.state.memory);
    a.game.ram.setU16(DMG.poolACount, 1);
    const aRam = a.game.ram.b.slice();
    const bRam = b.game.ram.b.slice();

    assert.throws(() => a.game.privateDamageTailHook(b.game, {}), /different Game/);
    assert.throws(() => a.game.privateDamageReceiptHook(b.game, {
      phase: 'allocator-reset', ram: b.game.ram,
    }), /different Game/);
    assert.deepEqual(a.game.ram.b, aRam);
    assert.deepEqual(b.game.ram.b, bRam);
  });

test('W616 private ordinary arithmetic matches the native oracle after owner normalization',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const options = {
      y: 0x1350, x: 0x1a40, yp: 0x0130, ym: 0x0090,
      xp: 0x0150, xm: 0x0070, power: 0x0470,
    };
    const enemyOptions = {
      y: 0x1400, x: 0x1a00, yp: 0x0210, ym: 0x0170,
      xp: 0x0160, xm: 0x0110, hp: 0x0520,
    };
    const companionShot = putShot(state.memory, 0, options);
    const companionEnemy = putEnemy(game.ram, DMG.poolA, enemyOptions);
    game.ram.setU16(DMG.poolACount, 1);

    const oracle = new Ram();
    oracle.setU16(DMG.gate308c, 1);
    const p1Shot = putNativeShot(oracle, 0, options);
    const p1Enemy = putEnemy(oracle, DMG.poolA, enemyOptions);
    oracle.setU16(DMG.poolACount, 1);
    assert.equal(shotBoundingBox(oracle, DMG.p1shots, 0x2800), true);
    assert.equal(poolDamage(oracle, DMG.poolA, 1, DMG.p1shots, 0x2800,
      DMG.maskP1, 1, 'A'), 1);

    const result = runThreePilotDamageObject(game);
    assert.equal(result.hitsA, 1);
    assert.equal(game.ram.u16(companionEnemy + 0x18), oracle.u16(p1Enemy + 0x18));
    assert.deepEqual(bytes(state.memory, companionShot, DMG.shotStride),
      bytes(oracle, p1Shot, DMG.shotStride));
    assert.equal(game.ram.u16(companionEnemy) & ~0x5c00,
      oracle.u16(p1Enemy) & ~0x5c00);
  });

test('W616 type-5 order is native tail, companion tail, then native ledger publication', () => {
  const source = readFileSync(new URL('../src/type5.js', import.meta.url), 'utf8');
  const native = source.indexOf('ctx.damage = runType5Tail(ram, ctx);');
  const companionTail = source.indexOf('ctx.privateDamageTailHook?.(ctx);', native);
  const ledger = source.indexOf('notePerFrameLedger(ctx);', companionTail);
  assert.ok(native >= 0 && native < companionTail && companionTail < ledger);
  assert.equal(source.includes('privateBomb'), false);
  assert.equal(source.includes('privateBulletErase'), false);
  assert.equal(source.includes('privateIncoming'), false);
});
