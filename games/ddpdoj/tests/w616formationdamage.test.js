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

async function exactState() {
  const demo = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz,
    undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
  const state = attachThreePilotFoundation(demo.game, { inputWord: 0xffff });
  activate(state);
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
  clearRange(state.memory, P3_VIRTUAL.shots,
    PRIVATE_DAMAGE_GEOMETRY.shotSlots * PRIVATE_DAMAGE_GEOMETRY.shotStride);
  clearRange(state.memory, P3_VIRTUAL.beamControl, 0x20);
  clearRange(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot27, 0x30);
  clearRange(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot30, 0x30);
  game.ram.setU16(DMG.poolACount, 0);
  game.ram.setU16(DMG.poolBCount, 0);
  game.ram.setU16(DMG.mirror2, 0);
  game.ram.setU16(DMG.gate308c, 1);
  game.ram.setU16(DMG.b410, 0);
  game.ram.setU16(DMG.g309c, 0);
  game.ram.setU16(0x8130f8, 0);
  game.ram.setU16(0x81312c, 0);
  state.memory.setU16(P3_VIRTUAL.player + P.state, 0x8000);
  state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 0);
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
  return state.memory.u8(P3_VIRTUAL.damageReceipts + receiptIndex(rec));
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

test('W616 runs only on phase zero and keys liveness to P3 rather than physical P1',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const enemy = putEnemy(game.ram, DMG.poolA, { hp: 0x1000 });
    const shot = putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    game.ram.setU16(DMG.p1rec, 0);

    game.ram.setU16(DMG.mirror2, 1);
    const blocked = runThreePilotDamageObject(game);
    assert.equal(blocked.ran, false);
    assert.equal(game.ram.u16(enemy + 0x18), 0x1000);
    assert.equal(state.memory.u16(shot + 0x18), 0x0400);

    game.ram.setU16(DMG.mirror2, 0);
    const live = runThreePilotDamageObject(game);
    assert.equal(live.ran, true);
    assert.equal(live.hitsA, 1);
    assert.equal(game.ram.u16(enemy + 0x18), 0x0c00,
      'a dead physical P1 does not suppress logical P3 outgoing damage');

    state.memory.setU16(P3_VIRTUAL.player + P.state, 0);
    game.ram.setU16(enemy + 0x18, 0x1000);
    state.memory.setU16(shot + 0x18, 0x0400);
    assert.equal(runThreePilotDamageObject(game), null);
    assert.equal(game.ram.u16(enemy + 0x18), 0x1000,
      'a live physical player cannot substitute for dead P3');
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

test('W616 private-only hit and kill suppress every native ledger while retaining killEvent',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x0100 });
    const main = ENEMY.table;
    putShot(state.memory, 0, { power: 0x0200 });
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(rec) & 0x5c, 0x40);

    enterEnemy(state, game, main, rec, 1);
    const kills = [];
    const ctx = {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
    };
    const nativeBefore = game.ram.b.slice();
    scoreHit(game.ram, ctx, rec, 0);
    scoreKill(game.ram, game.rom, ctx, 0x1234, 0);
    assert.deepEqual(game.ram.b, nativeBefore,
      'P3-only score paths skip score, chain, cap, rank, hyper, and tally RAM');
    assert.deepEqual(kills, [[0x1234, 0]],
      'the kill event survives with native ownership normalized to zero');
    exitEnemy(state, game, main, rec, 1);
    assert.equal(receiptByte(state, rec), 0);
  });

test('W616 real type $45 zero-mask death suppresses native score state',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x0100 });
    const main = ENEMY.table;
    putShot(state.memory, 0, { power: 0x0200 });
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u16(rec + 0x18) & 0x8000, 0x8000);

    game.ram.setU8(main + 0x17, 4);
    const before = scoreState(game.ram);
    const kills = [];
    enterEnemy(state, game, main, rec, 1);
    handlerMap().get(0x270e36)(game.ram, game.rom, main, {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
      soundPost: () => {},
    });
    exitEnemy(state, game, main, rec, 1);

    assert.deepEqual(scoreState(game.ram), before,
      'the real d1 = 0 score-hit and score-kill path leaves every native ledger untouched');
    assert.deepEqual(kills, [[0x34, 0]]);
    assert.equal(game.ram.u16(main), 0, 'the authentic death arm still frees the enemy');
  });

test('W616 aggregate multipart scoring removes only P3-introduced ownership',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const root = DMG.poolA;
    const main = putOwner(game.ram, root, { span: 14 });
    const parts = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0];
    for (const offset of parts) {
      const rec = root + offset;
      game.ram.setU16(rec, 0xa000);
      game.ram.setU16(rec + 0x02, 0x5000);
      game.ram.setU16(rec + 0x04, 0x5000);
      game.ram.setU16(rec + 0x18, 0x7fff);
    }
    game.ram.setU8(root, game.ram.u8(root) | 0x10);
    const privatePart = root + 0x20;
    game.ram.setU16(privatePart + 0x02, 0x1000);
    game.ram.setU16(privatePart + 0x04, 0x1000);
    for (const offset of [0x10, 0x12, 0x14, 0x16]) {
      game.ram.setU16(privatePart + offset, 0x0200);
    }
    game.ram.setU32(main + 0x16, 0x00030000);
    state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 1);
    putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot27, {
      y: 0x0c00, x: 0x1000, power: 0x0400,
    });
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(root) & 0x5c, 0x10);
    assert.equal(game.ram.u8(privatePart) & 0x5c, 0x44);

    const oracle = game.ram.clone();
    oracle.setU8(privatePart, oracle.u8(privatePart) & 0xa3);
    bossBody2A6B94(oracle, game.rom, main, root, {
      rom: game.rom,
      soundPost: () => {},
    });

    enterEnemy(state, game, main, root, 14);
    bossBody2A6B94(game.ram, game.rom, main, root, {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
      soundPost: () => {},
    });
    exitEnemy(state, game, main, root, 14);
    assert.deepEqual(changedAddresses(oracle.b, game.ram.b), [root + 0x10b],
      'only the handler raw-hit latch keeps aggregate $54 rather than native $10');
    assert.deepEqual(scoreState(game.ram), scoreState(oracle),
      'aggregate scoring is byte-identical to native P1 ownership alone');
    assert.equal(game.ram.u32(main + 0x16), oracle.u32(main + 0x16),
      'the P3 part damage still reaches the authentic shared boss pool');
    assert.equal(receiptByte(state, privatePart), 0);
  });

test('W616 Stage-4 deferred mixed side hit restores native ownership on frame N+1',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main, root, side } = prepareBoss4SideHit(state, game, 0x10);
    const ctx = boss4Context(state, game);
    assert.equal(game.ram.u8(side) & 0x5c, 0x54);
    assert.equal(receiptByte(state, side), 0x90);

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.equal(game.ram.u16(0x8130e8), 0x0400);
    assert.equal(game.ram.u16(0x8130ea), 0x0054);
    assert.equal(receiptByte(state, side), 0,
      'defer-score moves ownership out of the live subrecord slot');
    const deferred = state.damage.deferredEvents.get(0x8130e8);
    assert.equal(deferred?.receipt, true);
    assert.deepEqual(deferred?.snapshots.map((snapshot) => ({
      preMask: snapshot.preMask,
      postMask: snapshot.postMask,
      rec: snapshot.rec,
    })), [{ preMask: 0x10, postMask: 0x54, rec: side }]);

    const oracle = game.ram.clone();
    oracle.setU16(0x8130ea, 0x0010);
    boss4Damage29FB5C(oracle, game.rom, main, root, {
      rom: game.rom,
      unported: game.unportedLog,
      soundPost: () => {},
    });

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.deepEqual(scoreState(game.ram), scoreState(oracle),
      'frame N+1 scoring is identical to native P1 $10 ownership');
    assert.equal(game.ram.u32(main + 0x16), oracle.u32(main + 0x16),
      'the deferred P3 damage remains in the authentic boss pool debit');
    assert.deepEqual(changedAddresses(oracle.b, game.ram.b),
      [0x8130eb, root + 0x16b],
      'only the two authentic raw-hit latches retain aggregate $54');
    assert.equal(receiptByte(state, side), 0);
  });

test('W616 Stage-4 deferred P3-only lethal hit suppresses every native ledger',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main, root, side } = prepareBoss4SideHit(state, game);
    const kills = [];
    const ctx = {
      ...boss4Context(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
    };
    assert.equal(game.ram.u8(side) & 0x5c, 0x44);

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.equal(receiptByte(state, side), 0);
    assert.equal(state.damage.deferredEvents.size, 1,
      'P3-only ownership lives in the independent deferred event');
    assert.equal(state.damage.deferredEvents.get(0x8130e8)?.snapshots[0]?.preMask, 0);
    assert.equal(game.ram.u16(0x8130ea), 0x0044);

    game.ram.setU32(main + 0x16, 0x00000100);
    const before = scoreState(game.ram);
    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);

    assert.deepEqual(scoreState(game.ram), before,
      'deferred P3-only lethal ownership cannot mutate score, cap, chain, rank, or hyper RAM');
    assert.deepEqual(kills, []);
    assert.equal(game.ram.u16(root + 0x166), 1, 'the authentic boss death conductor still starts');
    assert.equal(game.ram.u32(main + 0x16), 0xffffffff);
    assert.equal(receiptByte(state, side), 0);
  });

test('W616 old deferred side ownership cannot consume a simultaneous mixed body receipt',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main, root, side } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.equal(state.damage.deferredEvents.size, 1);
    assert.equal(receiptByte(state, side), 0);

    const body = root + 0x20;
    game.ram.setU16(side + 0x02, 0x5000);
    game.ram.setU16(side + 0x04, 0x5000);
    putBoss4WeaponHit(state, game, body, 0x10);
    assert.equal(game.ram.u8(body) & 0x5c, 0x54);
    assert.equal(receiptByte(state, body), 0x90);
    assert.equal(state.damage.deferredEvents.size, 1,
      'the old side snapshot and current body receipt coexist');

    const before = scoreState(game.ram);
    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    assert.deepEqual(scoreState(game.ram), before,
      'the old P3-only event cannot gain false P1 ownership from the body receipt');
    assert.equal(state.damage.deferredEvents.size, 0);
    assert.equal(receiptByte(state, body), 0x90,
      'consuming the old event does not consume current body ownership');

    const bodyOwnership = state.privateDamageReceiptHook(game, {
      phase: 'score-hit', ram: game.ram, a6: body, d1: 0x54,
    });
    assert.deepEqual(bodyOwnership, {
      receipt: true,
      mask: 0x10,
      privateOnly: false,
      rawMask: 0x54,
      subrecord: body,
      subrecords: [body],
    }, 'the body generation remains independently resolvable');
    exitEnemy(state, game, main, root, 14);
    assert.equal(receiptByte(state, body), 0);
  });

test('W616 two deferred hits on one side retain separate ownership generations',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main, root, side } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.equal(receiptByte(state, side), 0);
    assert.equal(state.damage.deferredEvents.get(0x8130e8)?.snapshots[0]?.preMask, 0);

    putBoss4WeaponHit(state, game, side, 0x10);
    assert.equal(game.ram.u8(side) & 0x5c, 0x54);
    assert.equal(receiptByte(state, side), 0x90);
    assert.equal(state.damage.deferredEvents.size, 1,
      'the old snapshot survives beside the new live receipt');

    const before = scoreState(game.ram);
    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    assert.deepEqual(scoreState(game.ram), before,
      'frame N+1 consumes the old P3-only generation first');
    assert.equal(receiptByte(state, side), 0,
      'the new generation moves out of the reused side slot');
    assert.equal(state.damage.deferredEvents.get(0x8130e8)?.snapshots[0]?.preMask, 0x10);
    assert.equal(game.ram.u16(0x8130e8), 0x0400);
    assert.equal(game.ram.u16(0x8130ea), 0x0054);
    exitEnemy(state, game, main, root, 14);

    const oracle = game.ram.clone();
    oracle.setU16(0x8130ea, 0x0010);
    boss4Damage29FB5C(oracle, game.rom, main, root, {
      rom: game.rom,
      unported: game.unportedLog,
      soundPost: () => {},
    });

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    assert.deepEqual(scoreState(game.ram), scoreState(oracle),
      'frame N+2 resolves the new generation as native P1 plus P3');
    assert.notDeepEqual(scoreState(game.ram), before,
      'the second generation takes its native P1 score path');
    assert.equal(game.ram.u32(main + 0x16), oracle.u32(main + 0x16));
    assert.equal(state.damage.deferredEvents.size, 0);
  });

test('W616 native deferred ownership bypasses an unrelated current P2 and P3 receipt',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main, root, side } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);
    state.privateDamageReceiptHook(game, { phase: 'allocator-reset', ram: game.ram });
    game.ram.setU16(side, 0xb000);
    game.ram.setU16(side + 0x18, 0x7bff);

    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    exitEnemy(state, game, main, root, 14);
    const marker = state.damage.deferredEvents.get(0x8130e8);
    assert.equal(marker?.receipt, false);
    assert.deepEqual(marker?.snapshots, []);

    const body = root + 0x20;
    game.ram.setU16(side + 0x02, 0x5000);
    game.ram.setU16(side + 0x04, 0x5000);
    putBoss4WeaponHit(state, game, body, 0x04);
    assert.equal(game.ram.u8(body) & 0x5c, 0x44);
    assert.equal(receiptByte(state, body), 0x84);

    const oracle = game.ram.clone();
    boss4Damage29FB5C(oracle, game.rom, main, root, {
      rom: game.rom,
      unported: game.unportedLog,
      soundPost: () => {},
    });
    enterEnemy(state, game, main, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, main, root, ctx);
    assert.deepEqual(scoreState(game.ram), scoreState(oracle),
      'the explicit native marker prevents current private ownership from joining the old event');
    assert.equal(receiptByte(state, body), 0x84,
      'the unrelated current receipt was not consumed by deferred scoring');
    exitEnemy(state, game, main, root, 14);
    assert.equal(receiptByte(state, body), 0);
    assert.equal(state.damage.deferredEvents.size, 0);
  });

test('W616 type $42 mixed hit keeps P1 ownership through later Boss-4 consumption',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main: bossMain, root, side } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);
    state.privateDamageReceiptHook(game, { phase: 'allocator-reset', ram: game.ram });
    game.ram.setU16(side, 0xa000);
    game.ram.setU16(side + 0x02, 0x5000);
    game.ram.setU16(side + 0x04, 0x5000);
    game.ram.setU16(side + 0x18, 0x7fff);

    const child = root + 0x200;
    const childMain = putType42Target(game, child, 1);
    putBoss4WeaponHit(state, game, child, 0x10);
    assert.equal(game.ram.u8(child) & 0x5c, 0x54);
    assert.equal(receiptByte(state, child), 0x90);

    enterEnemy(state, game, childMain, child, 4);
    handler42(game.ram, game.rom, childMain, ctx);
    exitEnemy(state, game, childMain, child, 4);
    assert.equal(game.ram.u16(0x8130e8), 0x0400);
    assert.equal(game.ram.u16(0x8130ea), 0x0054);
    assert.equal(receiptByte(state, child), 0);
    const pending = state.damage.deferredEvents.get(0x8130e8);
    assert.equal(pending?.damage, 0x0400);
    assert.equal(pending?.d1, 0x0054);
    assert.equal(pending?.snapshots[0]?.preMask, 0x10);
    assert.equal(pending?.main, childMain,
      'the pending event retains its type $42 writer identity');

    const oracle = game.ram.clone();
    oracle.setU16(0x8130ea, 0x0010);
    boss4Damage29FB5C(oracle, game.rom, bossMain, root, {
      rom: game.rom,
      unported: game.unportedLog,
      soundPost: () => {},
    });
    enterEnemy(state, game, bossMain, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, bossMain, root, ctx);
    exitEnemy(state, game, bossMain, root, 14);
    assert.deepEqual(scoreState(game.ram), scoreState(oracle),
      'Boss-4 consumes the child snapshot as native P1 ordinary ownership');
    assert.equal(game.ram.u32(bossMain + 0x16), oracle.u32(bossMain + 0x16));
    assert.equal(state.damage.deferredEvents.size, 0);
  });

test('W616 competing Boss-4 and type $42 max writers keep damage and ownership paired',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main: bossMain, root, side } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);

    enterEnemy(state, game, bossMain, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, bossMain, root, ctx);
    exitEnemy(state, game, bossMain, root, 14);
    assert.equal(game.ram.u16(0x8130e8), 0x0400);
    assert.equal(state.damage.deferredEvents.get(0x8130e8)?.snapshots[0]?.preMask, 0);

    game.ram.setU16(side + 0x02, 0x5000);
    game.ram.setU16(side + 0x04, 0x5000);
    const winner = root + 0x200;
    const winnerMain = putType42Target(game, winner, 1);
    putBoss4WeaponHit(state, game, winner, 0x10, 0x0600);
    enterEnemy(state, game, winnerMain, winner, 4);
    handler42(game.ram, game.rom, winnerMain, ctx);
    exitEnemy(state, game, winnerMain, winner, 4);

    const winningEvent = state.damage.deferredEvents.get(0x8130e8);
    assert.equal(game.ram.u16(0x8130e8), 0x0600);
    assert.equal(game.ram.u16(0x8130ea), 0x0054);
    assert.equal(winningEvent?.damage, 0x0600);
    assert.equal(winningEvent?.d1, 0x0054);
    assert.equal(winningEvent?.snapshots[0]?.preMask, 0x10,
      'the larger type $42 hit replaces the older P3-only boss-side snapshot');

    game.ram.setU16(winner + 0x02, 0x5000);
    game.ram.setU16(winner + 0x04, 0x5000);
    const loser = root + 0x280;
    const loserMain = putType42Target(game, loser, 2);
    putBoss4WeaponHit(state, game, loser, 0x04, 0x0200);
    enterEnemy(state, game, loserMain, loser, 4);
    handler42(game.ram, game.rom, loserMain, ctx);
    exitEnemy(state, game, loserMain, loser, 4);
    assert.equal(state.damage.deferredEvents.get(0x8130e8), winningEvent,
      'a smaller max candidate replaces neither the snapshot nor its generation');
    assert.equal(game.ram.u16(0x8130e8), 0x0600);
    assert.equal(game.ram.u16(0x8130ea), 0x0054);

    const oracle = game.ram.clone();
    oracle.setU16(0x8130ea, 0x0010);
    boss4Damage29FB5C(oracle, game.rom, bossMain, root, {
      rom: game.rom,
      unported: game.unportedLog,
      soundPost: () => {},
    });
    enterEnemy(state, game, bossMain, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, bossMain, root, ctx);
    exitEnemy(state, game, bossMain, root, 14);
    assert.deepEqual(scoreState(game.ram), scoreState(oracle));
    assert.equal(game.ram.u32(bossMain + 0x16), oracle.u32(bossMain + 0x16));
    assert.equal(state.damage.deferredEvents.size, 0);
  });

test('W616 type $42 global clear retires the paired deferred ownership event',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { main: bossMain, root } = prepareBoss4SideHit(state, game);
    const ctx = boss4Context(state, game);
    enterEnemy(state, game, bossMain, root, 14);
    boss4Damage29FB5C(game.ram, game.rom, bossMain, root, ctx);
    exitEnemy(state, game, bossMain, root, 14);
    assert.equal(state.damage.deferredEvents.size, 1);

    const child = root + 0x200;
    const childMain = putType42Target(game, child, 1);
    game.ram.setU16(0x8130f0, 1);
    enterEnemy(state, game, childMain, child, 4);
    assert.equal(handler42(game.ram, game.rom, childMain, ctx), true);
    assert.equal(game.ram.u16(0x8130e8), 0);
    assert.equal(game.ram.u16(0x8130ea), 0);
    assert.equal(state.damage.deferredEvents.size, 0,
      'clearing the RAM pair also clears its ownership generation');
    exitEnemy(state, game, childMain, child, 4);
  });

test('W616 type $36 keeps P3-only ownership across every threshold kill',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const main = ENEMY.table;
    const root = DMG.poolA;
    game.ram.setU16(main, 0x8000);
    game.ram.setU16(main + ENEMY.seqOff, 6);
    game.ram.setU32(main + ENEMY.subRecOff, root);
    game.ram.setU32(main + 0x12, 0x2350a8);
    game.ram.setU8(main + ENEMY.classOff, 0x36);
    runInitBodyAddr(0x263a58, game.ram, game.rom, main,
      game.unportedLog, game.tables);
    game.ram.setU32(main + 0x1a, 0x3000);
    game.ram.setU16(root, 0xa000);
    game.ram.setU32(root + 0x02, 0x10001800);
    for (const offset of [0x10, 0x12, 0x14, 0x16]) {
      game.ram.setU16(root + offset, 0x0200);
    }
    for (let part = 0; part < 7; part++) {
      const rec = root + part * DMG.enemyStride;
      game.ram.setU16(rec + 0x18, 0x7fff);
      if (part !== 0) game.ram.setU32(rec + 0x02, 0x50005000);
    }
    putShot(state.memory, 0, { power: 0x2000 });
    game.ram.setU16(DMG.poolACount, 7);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(root) & 0x5c, 0x40);

    const before = scoreState(game.ram);
    const kills = [];
    enterEnemy(state, game, main, root, 7);
    runHandler(0x263c7c, game.ram, game.rom, main, {
      ram: game.ram,
      rom: game.rom,
      tables: game.tables,
      unported: game.unportedLog,
      privateDamageReceiptHook: receiptHook(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
      soundPost: () => {},
    });
    exitEnemy(state, game, main, root, 7);

    assert.deepEqual(kills, [[0x13, 0], [0x13, 0], [0x11, 0], [0x32, 0]],
      'every authentic threshold event survives with normalized private ownership');
    assert.deepEqual(scoreState(game.ram), before,
      'every score, cap, chain, rank, hyper, and tally mutation stays suppressed');
    assert.equal(receiptByte(state, root), 0);
  });

test('W616 a later native no-receipt arm does not inherit private hit ownership',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const privateRec = putEnemy(game.ram, DMG.poolA, { hp: 0x1000, span: 2 });
    const nativeRec = privateRec + DMG.enemyStride;
    game.ram.setU16(nativeRec, 0xb000);
    game.ram.setU16(nativeRec + 0x18, 0x1000);
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);

    const main = ENEMY.table;
    const ctx = {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
    };
    enterEnemy(state, game, main, privateRec, 2);
    scoreHit(game.ram, ctx, privateRec, 0);

    const oracle = game.ram.clone();
    scoreHit(oracle, { rom: game.rom }, nativeRec, 0x10);
    scoreKill(oracle, game.rom, { rom: game.rom }, 0x08, 0x10);
    scoreHit(game.ram, ctx, nativeRec, 0x10);
    scoreKill(game.ram, game.rom, ctx, 0x08, 0x10);
    assert.deepEqual(game.ram.b, oracle.b,
      'the next score-hit starts a native arm instead of reusing the prior private pairing');
    exitEnemy(state, game, main, privateRec, 2);
  });
test('W616 native plus P3 co-hits resolve to the exact saved native mask',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x1000, tw: 0xb000 });
    const main = ENEMY.table;
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(rec) & 0x5c, 0x50);
    assert.equal(receiptByte(state, rec), 0x90,
      'the byte saves only the pre-P3 native P1 mask $10');

    enterEnemy(state, game, main, rec, 1);
    const oracle = game.ram.clone();
    const oracleCtx = { rom: game.rom };
    scoreHit(oracle, oracleCtx, rec, 0x10);
    scoreKill(oracle, game.rom, oracleCtx, 0x08, 0x10);

    const kills = [];
    const ctx = {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
    };
    scoreHit(game.ram, ctx, rec, 0x50);
    scoreKill(game.ram, game.rom, ctx, 0x08, 0x50);
    assert.deepEqual(game.ram.b, oracle.b,
      'co-hit scoring is byte-identical to native P1 ownership alone');
    assert.deepEqual(kills, [[0x08, 0x10]]);
    exitEnemy(state, game, main, rec, 1);
  });

test('W616 receipt normalization preserves native $40 special-path ownership exactly',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x1000, tw: 0xf400 });
    const main = ENEMY.table;
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.equal(receiptByte(state, rec), 0xd4,
      'presence bit plus exact pre-mask $54, including native bit $40');

    enterEnemy(state, game, main, rec, 1);
    const oracle = game.ram.clone();
    scoreHit(oracle, { rom: game.rom }, rec, 0x54);
    scoreHit(game.ram, {
      rom: game.rom,
      privateDamageReceiptHook: receiptHook(state, game),
    }, rec, 0x54);
    assert.deepEqual(game.ram.b, oracle.b,
      'the special weapon and P1 paths receive the saved $54 without reinterpretation');
    exitEnemy(state, game, main, rec, 1);
  });

test('W616 committed receipts survive P3 detach, retire on consumption, and reset explicitly',
  { skip: SKIP_ASSETS }, async () => {
    const detached = await exactState();
    resetCombat(detached.state, detached.game);
    const rec = putEnemy(detached.game.ram, DMG.poolA, { hp: 0x0100 });
    const main = ENEMY.table;
    putShot(detached.state.memory, 0, { power: 0x0200 });
    detached.game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(detached.game);
    assert.equal(receiptByte(detached.state, rec), 0x80);

    objTableInit24107C(detached.game.ram);
    detached.state.objectDriverHook({
      phase: 'after-driver', ram: detached.game.ram, created: 0, killed: 0,
    });
    assert.equal(detached.state.lifecycle, 'detached');
    assert.equal(receiptByte(detached.state, rec), 0x80,
      'ordinary P3 cleanup does not erase an enemy-handler obligation');

    enterEnemy(detached.state, detached.game, main, rec, 1);
    scoreKill(detached.game.ram, detached.game.rom, {
      privateDamageReceiptHook: receiptHook(detached.state, detached.game),
    }, 0x10, 0x40);
    exitEnemy(detached.state, detached.game, main, rec, 1);
    assert.equal(receiptByte(detached.state, rec), 0,
      'enemy handling consumes and retires the committed receipt');

    const reset = await exactState();
    resetCombat(reset.state, reset.game);
    const rec2 = putEnemy(reset.game.ram, DMG.poolA, { hp: 0x0100 });
    putShot(reset.state.memory, 0, { power: 0x0200 });
    reset.game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(reset.game);
    assert.notEqual(receiptByte(reset.state, rec2), 0);
    reset.state.privateDamageReceiptHook(reset.game, {
      phase: 'allocator-reset', ram: reset.game.ram,
    });
    assert.equal(receiptByte(reset.state, rec2), 0);
  });

test('W616 changed main-record identity invalidates a stale receipt before reuse',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x1000 });
    putShot(state.memory);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.notEqual(receiptByte(state, rec), 0);
    game.ram.setU32(ENEMY.table + ENEMY.handlerOff, 0x269cea);
    state.privateDamageReceiptHook(game, {
      phase: 'enter-enemy', ram: game.ram, main: ENEMY.table, sub: rec, span: 1,
    });
    assert.equal(receiptByte(state, rec), 0,
      'handler identity drift cannot transfer private ownership to a reused enemy');
    state.privateDamageReceiptHook(game, {
      phase: 'exit-enemy', ram: game.ram, main: ENEMY.table, sub: rec, span: 1,
    });
  });

test('W616 P3-only stage-1 boss-part death emits a kill but no false P2 hyper item',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const a5 = ENEMY.bandCommon;
    const a6 = DMG.poolB + DMG.enemyStride;
    putOwner(game.ram, a6, { mainSlot: 10, span: 10 });
    // The stage-1 boss handler itself receives A5 in the first common slot.
    // Move the same identity there so its record fields and ownership agree.
    clearRange(game.ram, a5, ENEMY.stride);
    game.ram.setU16(a5, 0x8000);
    game.ram.setU16(a5 + ENEMY.seqOff, 9);
    game.ram.setU32(a5 + ENEMY.subRecOff, a6);
    game.ram.setU8(a5 + ENEMY.classOff, 0x20);
    game.ram.setU32(a5 + ENEMY.handlerOff, 0x292902);
    game.ram.setU32(a5 + BOSS.hp0, 0x00016c00);
    game.ram.setU32(a5 + BOSS.hp1, 0x00000100);
    game.ram.setU32(a5 + BOSS.hp2, 0x0000a000);
    game.ram.setU16(a5 + BOSS.timeout, 0x2a30);
    game.ram.setU16(a6 + BOSS.st0, 0x8000);
    game.ram.setU16(a6 + BOSS.st2, 0x8000);
    game.ram.setU16(a6 + BOSS.noDamage, 0);
    game.ram.setU16(a6 + BOSS.itemGate2, 1);
    const part = a6 + BOSS.st1;
    putEnemy(game.ram, part, {
      tw: 0xa000, y: 0x1000, x: 0x1800, hp: 0x7fff, mainSlot: 0,
    });
    // putEnemy installed a one-part owner. Restore the boss's ten-part owner.
    game.ram.setU16(a5 + ENEMY.seqOff, 9);
    game.ram.setU32(a5 + ENEMY.subRecOff, a6);
    game.ram.setU32(a5 + ENEMY.handlerOff, 0x292902);
    game.ram.setU16(ENEMY.table, 0);
    putShot(state.memory, 0, { power: 0x0400 });
    game.ram.setU16(DMG.poolBCount, 2);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u16(part + BOSS.snap0), 0x7bff,
      'private damage lands in the part snapshot before boss handling');
    assert.equal(game.ram.u8(part) & 0x5c, 0x40);

    const itemBefore = bytes(game.ram, ITEM.base, ITEM.slots * ITEM.stride);
    const itemCountBefore = game.ram.u16(ITEM.count);
    const kills = [];
    enterEnemy(state, game, a5, a6, 10);
    bossDamage294AD8(game.ram, game.rom, {
      rom: game.rom,
      tables: game.tables,
      unportedLog: game.unportedLog,
      privateDamageReceiptHook: receiptHook(state, game),
      killEvent: (d0, d1) => kills.push([d0, d1]),
    }, a5, a6);
    exitEnemy(state, game, a5, a6, 10);
    assert.deepEqual(kills, [[0x1000, 0]]);
    assert.equal(game.ram.u16(ITEM.count), itemCountBefore);
    assert.deepEqual(bytes(game.ram, ITEM.base, ITEM.slots * ITEM.stride), itemBefore,
      'neither the primary nor gated second drop chooses P2 kind $14');
  });

test('W616 ordinary hit is consumed on N+1 with canonical sound and P1-half spark contention',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    primePrivateOrdinaryShots(state, game);
    state.memory.setU8(P3_VIRTUAL.player + P.dirByte, 0);
    state.memory.setU8(P3_VIRTUAL.player + P.btnByte, 0);
    runThreePilotShotObject(game);
    const live = [];
    for (let slot = 0; slot < 36; slot++) {
      const rec = P3_VIRTUAL.shots + slot * DMG.shotStride;
      if ((state.memory.u16(rec) & 0x8000) !== 0) live.push(rec);
    }
    assert.ok(live.length > 0);
    const shot = live.find((rec) => (state.memory.u8(rec + 1) & 0x7f) === 0x48)
      ?? live[0];
    const y = state.memory.u16(shot + 0x02);
    const x = state.memory.u16(shot + 0x04);
    const enemy = putEnemy(game.ram, DMG.poolA, {
      y, x, hp: 0x1000, mainSlot: 0,
    });
    game.ram.setU16(DMG.poolACount, 1);
    clearRange(game.ram, SPARK.p1Base, SPARK.perPlayer * SPARK.stride);
    game.ram.setU16(SPARK.count, 0);
    game.ram.setU16(SPARK.gateAlloc, 0);

    runThreePilotDamageObject(game, { soundPost() {} });
    assert.equal(state.memory.u8(shot + 1) & 0x80, 0x80,
      'frame N collision only marks the shot hit byte');
    assert.equal(game.ram.u16(SPARK.count), 0,
      'damage delivery does not allocate impact presentation early');

    state.memory.setU8(P3_VIRTUAL.player + P.dirByte, 0);
    state.memory.setU8(P3_VIRTUAL.player + P.btnByte, 0);
    const rngBefore = game.ram.u8(0x803917);
    const sounds = [];
    const processed = runThreePilotShotObject(game, { soundPost: (cue) => sounds.push(cue) });
    assert.ok(processed > 0, `processed ${processed}, live shot words: ${live.map((rec) =>
      `$${state.memory.u16(rec).toString(16)}`).join(', ')}`);
    assert.deepEqual(sounds, [0x28c714], `live shot words: ${live.map((rec) =>
      `$${state.memory.u16(rec).toString(16)}`).join(', ')}`);
    assert.ok(game.ram.u16(SPARK.count) > 0);
    assert.equal(game.ram.u8(0x803917), (rngBefore + 6) & 0xff,
      'private impact consumes the native allocator, fill, and scatter RNG draws');
    assert.ok(Array.from({ length: SPARK.perPlayer }, (_, slot) =>
      game.ram.u16(SPARK.p1Base + slot * SPARK.stride)).some((word) => word !== 0),
    'logical P3 impact competes honestly in the P1 visual spark half');
    assert.ok(game.ram.u16(enemy + 0x18) < 0x1000,
      'the generated private shot debits enemy HP before its impact presentation');
  });

test('W616 native writes are limited to enemy type and HP and ctx.damage stays native-only',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    const rec = putEnemy(game.ram, DMG.poolA, { hp: 0x1234 });
    putShot(state.memory, 0, { power: 0x0111 });
    game.ram.setU16(DMG.poolACount, 1);
    const before = game.ram.b.slice();
    const nativeDamage = Object.freeze({ hitsA: 7, marker: 'native' });
    const invokingCtx = { damage: nativeDamage };
    const result = runThreePilotDamageObject(game, invokingCtx);
    assert.equal(invokingCtx.damage, nativeDamage);
    assert.equal(state.damage.last, result);
    const changed = changedAddresses(before, game.ram.b);
    const allowed = new Set([rec, rec + 1, rec + 0x18, rec + 0x19]);
    assert.ok(changed.length >= 2);
    assert.ok(changed.every((address) => allowed.has(address)),
      `undeclared cartridge mutation at ${changed.map((a) => `$${a.toString(16)}`).join(', ')}`);
  });

test('W616 copied damage and receipt hooks reject cross-Game use before either Game mutates',
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
    const aShots = bytes(a.state.memory, P3_VIRTUAL.shots, 36 * 0x30);
    const bShots = bytes(b.state.memory, P3_VIRTUAL.shots, 36 * 0x30);

    assert.throws(() => a.game.privateDamageTailHook(b.game, {}), /different Game/);
    assert.throws(() => a.game.privateDamageReceiptHook(b.game, {
      phase: 'allocator-reset', ram: b.game.ram,
    }), /different Game/);
    assert.deepEqual(a.game.ram.b, aRam);
    assert.deepEqual(b.game.ram.b, bRam);
    assert.deepEqual(bytes(a.state.memory, P3_VIRTUAL.shots, 36 * 0x30), aShots);
    assert.deepEqual(bytes(b.state.memory, P3_VIRTUAL.shots, 36 * 0x30), bShots);
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
    const p3Shot = putShot(state.memory, 0, options);
    const p3Enemy = putEnemy(game.ram, DMG.poolA, enemyOptions);
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
    assert.equal(game.ram.u16(p3Enemy + 0x18), oracle.u16(p1Enemy + 0x18));
    assert.deepEqual(bytes(state.memory, p3Shot, DMG.shotStride),
      bytes(oracle, p1Shot, DMG.shotStride));
    assert.equal(game.ram.u16(p3Enemy) & ~0x5c00,
      oracle.u16(p1Enemy) & ~0x5c00);
    assert.equal(game.ram.u8(p3Enemy) & 0x5c, 0x40);
    assert.equal(oracle.u8(p1Enemy) & 0x5c, 0x10);
    for (let offset = 0; offset < 8; offset += 2) {
      assert.equal(state.memory.u16(P3_VIRTUAL.damageScratch + 2 + offset),
        oracle.u16(DMG.box + offset), `private box word ${offset / 2}`);
    }
  });

test('W616 type-5 order is native tail, private tail, then native-only ledger publication', () => {
  const source = readFileSync(new URL('../src/type5.js', import.meta.url), 'utf8');
  const native = source.indexOf('ctx.damage = runType5Tail(ram, ctx);');
  const privateTail = source.indexOf('ctx.privateDamageTailHook?.(ctx);', native);
  const ledger = source.indexOf('notePerFrameLedger(ctx);', privateTail);
  assert.ok(native >= 0 && native < privateTail && privateTail < ledger);
  assert.equal(source.includes('privateBomb'), false);
  assert.equal(source.includes('privateBulletErase'), false);
  assert.equal(source.includes('privateIncoming'), false);

  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /installedPrivateDamageHook\(this, invokingCtx\)/);
  assert.match(main, /installedPrivateReceiptHook\(this, event\)/);
});
