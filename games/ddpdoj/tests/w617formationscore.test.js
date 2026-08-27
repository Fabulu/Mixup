// W617: private P3 score and chain ownership.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACHINE, P } from '../src/machine.js';
import { ALLOC, commitCreates, objTableInit24107C } from '../src/objalloc.js';
import { DMG, PRIVATE_DAMAGE_GEOMETRY } from '../src/damage.js';
import { ENEMY } from '../src/enemies.js';
import { runHandler } from '../src/handlers.js';
import { HUDRAM, makeHudObject } from '../src/hud.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { SPAWN } from '../src/spawn.js';
import {
  P3_PRIVATE_SCORE_LEDGER, P3_VIRTUAL, P3_VIRTUAL_RANGES,
  THREE_PILOT_FORMATION_MODE, attachThreePilotFoundation,
  runThreePilotDamageObject,
} from '../src/formationactors.js';
import {
  LEDGER, PRIVATE_SCORE_LAYOUT, SCORE, bombHitChain, privateBcdAdd, privateScoreFrame,
  privateScoreHit, privateScoreKill, scoreHit, scoreKill,
} from '../src/score.js';
import { MOD_IDS, MODS } from '../src/mods.js';
import { formationMode, formationToHash, hashToFormation } from '../src/formation.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'exact browser bundle absent; private P3 score proof is skipped, not passed';
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

function privateScoreState(state) {
  return bytes(state.memory, P3_PRIVATE_SCORE_LEDGER.base,
    P3_PRIVATE_SCORE_LEDGER.length);
}

function clearPrivateScore(state) {
  clearRange(state.memory, P3_PRIVATE_SCORE_LEDGER.base,
    P3_PRIVATE_SCORE_LEDGER.length);
}

function resetCombat(state, game) {
  clearRange(game.ram, ENEMY.table, ENEMY.slots * ENEMY.stride);
  clearRange(game.ram, DMG.poolA,
    PRIVATE_DAMAGE_GEOMETRY.enemySlots * DMG.enemyStride);
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
  game.ram.setU16(SCORE.g30f8, 0);
  game.ram.setU16(SCORE.laserRec, 0);
  state.memory.setU16(P3_VIRTUAL.player + P.state, 0x8000);
  state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 0);
  state.shots.actorId = state.actorId;
  state.beam.actorId = state.actorId;
}

function putOwner(ram, rec, span = 1) {
  const main = ENEMY.table;
  ram.setU16(main, 0x8000);
  ram.setU16(main + ENEMY.seqOff, span - 1);
  ram.setU32(main + ENEMY.subRecOff, rec);
  ram.setU8(main + ENEMY.classOff, 0x11);
  ram.setU32(main + ENEMY.handlerOff, 0x2688cc);
  return main;
}

function putShot(memory, power = 0x0400) {
  const rec = P3_VIRTUAL.shots;
  memory.setU16(rec, 0x8000);
  memory.setU16(rec + 0x02, 0x1000);
  memory.setU16(rec + 0x04, 0x1800);
  memory.setU16(rec + 0x10, 0x0100);
  memory.setU16(rec + 0x12, 0x0080);
  memory.setU16(rec + 0x14, 0x0120);
  memory.setU16(rec + 0x16, 0x0060);
  memory.setU16(rec + 0x18, power);
}

function putWeaponObject(memory, rec, power = 0x0400) {
  memory.setU16(rec, 0x8000);
  memory.setU16(rec + 0x02, 0x0c00);
  memory.setU16(rec + 0x04, 0x1000);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) {
    memory.setU16(rec + offset, 0x0800);
  }
  memory.setU16(rec + 0x18, power);
}

function putBeam(memory, power = 0x0400) {
  const rec = P3_VIRTUAL.beamControl;
  memory.setU16(rec, 0x8000);
  memory.setU16(rec + 0x02, 0x2c00);
  memory.setU16(rec + 0x04, 0x3000);
  memory.setU16(rec + 0x06, 0x1000);
  memory.setU16(rec + 0x08, 0x0400);
  memory.setU16(rec + 0x0a, 0x0400);
  memory.setU16(rec + 0x0e, power);
  memory.setU16(rec + 0x1a, 0);
  memory.setU16(rec + 0x1c, power);
  return rec;
}

function armReceipt(state, game, nativeMask = 0) {
  resetCombat(state, game);
  const rec = DMG.poolA;
  game.ram.setU16(rec, 0xa000 | ((nativeMask & 0x5c) << 8));
  game.ram.setU16(rec + 0x02, 0x1000);
  game.ram.setU16(rec + 0x04, 0x1800);
  game.ram.setU16(rec + 0x10, 0x0200);
  game.ram.setU16(rec + 0x12, 0x0180);
  game.ram.setU16(rec + 0x14, 0x0140);
  game.ram.setU16(rec + 0x16, 0x0100);
  game.ram.setU16(rec + 0x18, 0x1000);
  const main = putOwner(game.ram, rec);
  putShot(state.memory);
  game.ram.setU16(DMG.poolACount, 1);
  runThreePilotDamageObject(game);
  assert.notEqual(state.memory.u8(P3_VIRTUAL.damageReceipts), 0,
    'the score proof requires a committed W616 receipt');
  return { main, rec, rawMask: game.ram.u8(rec) & 0x5c };
}

function armSpecialReceipt(state, game, source = 'slot-27', nativeMask = 0) {
  resetCombat(state, game);
  const rec = DMG.poolA;
  const beam = source === 'beam';
  game.ram.setU16(rec, 0xa000 | ((nativeMask & 0x5c) << 8));
  game.ram.setU16(rec + 0x02, beam ? 0x3000 : 0x1000);
  game.ram.setU16(rec + 0x04, beam ? 0x3000 : 0x1000);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) {
    game.ram.setU16(rec + offset, 0x0200);
  }
  game.ram.setU16(rec + 0x18, 0x1000);
  const main = putOwner(game.ram, rec);
  state.memory.setU8(P3_VIRTUAL.player + DMG.laserByte, 1);
  if (source === 'slot-27') {
    putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot27);
  } else if (source === 'slot-30') {
    putWeaponObject(state.memory, PRIVATE_DAMAGE_GEOMETRY.slot30);
  } else if (beam) {
    putBeam(state.memory);
  } else {
    throw new RangeError(`unknown special receipt source ${source}`);
  }
  let result = runThreePilotDamageObject(game);
  if (beam) result = runThreePilotDamageObject(game);
  assert.equal(source === 'slot-27' ? result.weapon.hits27
    : source === 'slot-30' ? result.weapon.hits30 : result.weapon.beam, 1);
  assert.equal(game.ram.u8(rec) & 0x5c, 0x44 | (nativeMask & 0x5c));
  assert.notEqual(state.memory.u8(P3_VIRTUAL.damageReceipts), 0);
  return { main, rec, rawMask: game.ram.u8(rec) & 0x5c };
}

function enterEnemy(state, game, main, rec, span = 1) {
  state.privateDamageReceiptHook(game, {
    phase: 'enter-enemy', ram: game.ram, main, sub: rec, span,
  });
}

function exitEnemy(state, game, main, rec, span = 1) {
  state.privateDamageReceiptHook(game, {
    phase: 'exit-enemy', ram: game.ram, main, sub: rec, span,
  });
}

function scoreContext(state, game, extra = {}) {
  return {
    rom: game.rom,
    privateDamageReceiptHook: (event) =>
      state.privateDamageReceiptHook(game, event),
    privateScoreEventHook: (event) => state.privateScoreEventHook(game, event),
    ...extra,
  };
}

function runHudFrame(state, game) {
  const object = 0x81fff0;
  game.ram.setU8(object + 0x02, 1);
  const ctx = {
    rom: game.rom,
    tables: game.tables,
    unported: game.unportedLog,
    unportedLog: game.unportedLog,
    privateScoreFrameHook: (event) => state.privateScoreFrameHook(game, event),
  };
  makeHudObject(game.rom)(game.ram, object, 0, ctx);
}

function runPrivateHitAndKill(state, game, nativeMask, d0) {
  const armed = armReceipt(state, game, nativeMask);
  const ctx = scoreContext(state, game);
  enterEnemy(state, game, armed.main, armed.rec);
  scoreHit(game.ram, ctx, armed.rec, armed.rawMask);
  scoreKill(game.ram, game.rom, ctx, d0, armed.rawMask);
  exitEnemy(state, game, armed.main, armed.rec);
  return armed;
}

const L = P3_PRIVATE_SCORE_LEDGER;

test('W617 score reservation is exactly 32 non-overlapping private bytes', () => {
  assert.deepEqual(PRIVATE_SCORE_LAYOUT, {
    length: 0x20,
    total: 0x00,
    overflow: 0x04,
    pending: 0x06,
    meter: 0x0a,
    chain: 0x0c,
    hiwater: 0x0e,
    prior: 0x10,
    accA: 0x14,
    accB: 0x18,
    specialCadence: 0x1c,
  });
  assert.equal(Object.isFrozen(PRIVATE_SCORE_LAYOUT), true);
  assert.deepEqual(L, {
    base: 0x10001500,
    length: 0x20,
    total: 0x10001500,
    overflow: 0x10001504,
    pending: 0x10001506,
    pendingEnd: 0x1000150a,
    meter: 0x1000150a,
    chain: 0x1000150c,
    hiwater: 0x1000150e,
    prior: 0x10001510,
    accA: 0x10001514,
    accB: 0x10001518,
    specialCadence: 0x1000151c,
    weaponSel: 0x10000158,
    power: 0x10000122,
    formation: 0x1000015a,
  });
  assert.equal(Object.isFrozen(L), true);
  const scoreRange = P3_VIRTUAL_RANGES.find((range) => range.name === 'p3-score');
  assert.deepEqual(scoreRange, { name: 'p3-score', start: L.base, length: L.length });
  const ordered = [...P3_VIRTUAL_RANGES].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i - 1].start + ordered[i - 1].length <= ordered[i].start,
      `${ordered[i - 1].name} overlaps ${ordered[i].name}`);
  }
  assert.equal(L.base + L.length, 0x10001520);
  assert.ok(P3_VIRTUAL.damageReceipts + 150 <= L.base);
  assert.ok(L.base + L.length <= P3_VIRTUAL.bomb);
});

test('W617 P3-only hit and kill credit private pending without native mutation',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armReceipt(state, game);
    const before = game.ram.b.slice();
    const kills = [];
    const sideEffects = [];
    const ctx = scoreContext(state, game, {
      killEvent: (d0, d1) => kills.push([d0, d1]),
      soundPost: () => sideEffects.push('sound'),
      itemSpawn: () => sideEffects.push('item'),
      hudEvent: () => sideEffects.push('hud'),
    });

    enterEnemy(state, game, armed.main, armed.rec);
    scoreHit(game.ram, ctx, armed.rec, armed.rawMask);
    scoreKill(game.ram, game.rom, ctx, 0x25, armed.rawMask);
    exitEnemy(state, game, armed.main, armed.rec);

    assert.deepEqual(game.ram.b, before);
    assert.equal(state.memory.u32(L.pending), 0x00000026);
    assert.equal(state.memory.u16(L.meter), 20);
    assert.equal(state.memory.u32(L.prior), 0x00000025);
    assert.deepEqual(kills, [[0x25, 0]], 'P3 never becomes a native kill owner');
    assert.deepEqual(sideEffects, []);
  });

test('W617 mixed P1/P3 and P2/P3 events preserve native oracles and credit P3',
  { skip: SKIP_ASSETS }, async () => {
    for (const nativeMask of [0x10, 0x08]) {
      const { state, game } = await exactState();
      const armed = armReceipt(state, game, nativeMask);
      game.ram.setU16(LEDGER.p1.hyper, 0);
      game.ram.setU16(LEDGER.p2.hyper, 0);
      game.ram.setU16(SCORE.loop, 0);
      const oracle = game.ram.clone();
      scoreHit(oracle, { rom: game.rom }, armed.rec, nativeMask);
      scoreKill(oracle, game.rom, { rom: game.rom }, 0x25, nativeMask);

      const ctx = scoreContext(state, game);
      enterEnemy(state, game, armed.main, armed.rec);
      scoreHit(game.ram, ctx, armed.rec, armed.rawMask);
      scoreKill(game.ram, game.rom, ctx, 0x25, armed.rawMask);
      exitEnemy(state, game, armed.main, armed.rec);

      assert.deepEqual(game.ram.b, oracle.b,
        `native owner $${nativeMask.toString(16)} diverged`);
      assert.equal(state.memory.u32(L.pending), 0x00000026);
    }
  });

test('W617 no-score enemies consume ownership but receive no private hit point',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armReceipt(state, game);
    game.ram.setU8(armed.rec, game.ram.u8(armed.rec) | 0x02);
    const before = game.ram.b.slice();
    enterEnemy(state, game, armed.main, armed.rec);
    scoreHit(game.ram, scoreContext(state, game), armed.rec, armed.rawMask);
    exitEnemy(state, game, armed.main, armed.rec);
    assert.equal(state.memory.u32(L.pending), 0);
    assert.deepEqual(game.ram.b, before);
  });

test('W617 receipt source mask survives zero-mask and mixed-native normalization',
  { skip: SKIP_ASSETS }, async () => {
    const special = await exactState();
    const specialArmed = armSpecialReceipt(special.state, special.game);
    enterEnemy(special.state, special.game, specialArmed.main, specialArmed.rec);
    scoreHit(special.game.ram, scoreContext(special.state, special.game),
      specialArmed.rec, 0);
    exitEnemy(special.state, special.game, specialArmed.main, specialArmed.rec);
    assert.equal(special.state.memory.u16(L.meter), 10,
      'a cleared handler mask still projects the private slot-27 $04 path');
    assert.equal(special.state.memory.u32(L.pending), 0);

    const mixed = await exactState();
    const ordinaryArmed = armReceipt(mixed.state, mixed.game, 0x54);
    const oracle = mixed.game.ram.clone();
    scoreHit(oracle, { rom: mixed.game.rom }, ordinaryArmed.rec, 0x54);
    enterEnemy(mixed.state, mixed.game, ordinaryArmed.main, ordinaryArmed.rec);
    scoreHit(mixed.game.ram, scoreContext(mixed.state, mixed.game),
      ordinaryArmed.rec, ordinaryArmed.rawMask);
    exitEnemy(mixed.state, mixed.game, ordinaryArmed.main, ordinaryArmed.rec);
    assert.deepEqual(mixed.game.ram.b, oracle.b);
    assert.equal(mixed.state.memory.u32(L.pending), 1,
      'native $04 cannot turn an ordinary private source into $44');
    assert.equal(mixed.state.memory.u16(L.meter), 0);
  });

test('W617 source score masks remain distinct from receipt wake masks',
  { skip: SKIP_ASSETS }, async () => {
    for (const [source, expectedScoreMask] of [
      ['ordinary', 0x00], ['slot-27', 0x04], ['slot-30', 0x44], ['beam', 0x04],
    ]) {
      const { state, game } = await exactState();
      const armed = source === 'ordinary'
        ? armReceipt(state, game, 0x10)
        : armSpecialReceipt(state, game, source, 0x10);
      enterEnemy(state, game, armed.main, armed.rec);
      const ownership = state.privateDamageReceiptHook(game, {
        phase: 'score-hit', ram: game.ram, a6: armed.rec, d1: armed.rawMask,
      });
      assert.deepEqual({
        mask: ownership.mask,
        privateMask: ownership.privateMask,
        privateScoreMask: ownership.privateScoreMask,
      }, {
        mask: 0x10,
        privateMask: source === 'ordinary' ? 0x40 : 0x44,
        privateScoreMask: expectedScoreMask,
      }, source);
      exitEnemy(state, game, armed.main, armed.rec);
    }
  });

test('W617 ordinary chains start, continue, carry packed BCD, and expire',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    clearPrivateScore(state);
    game.ram.setU16(SCORE.loop, 0);
    state.memory.setU16(L.weaponSel, 0);
    const oracle = game.ram.clone();
    const native = LEDGER.p1;
    for (const [address, length] of [
      [native.pendingEnd - 4, 4], [native.meter, 2], [native.chain, 2],
      [native.hiwater, 2], [native.acc1, 4], [native.acc2, 4],
      [native.accA, 4], [native.accB, 4], [native.acc3, 4],
    ]) {
      clearRange(oracle, address, length);
    }
    oracle.setU16(SCORE.loop, 0);
    oracle.setU16(native.weaponSel, 0);
    oracle.setU16(native.hyper, 0);
    oracle.setU16(native.guard, 0);
    oracle.setU16(SCORE.laserRec, 0);
    oracle.setU8(SCORE.g30f9, 0);

    privateScoreKill(state.memory, game.rom, L, 0x25, 0x10);
    assert.deepEqual({
      pending: state.memory.u32(L.pending),
      meter: state.memory.u16(L.meter),
      chain: state.memory.u16(L.chain),
      prior: state.memory.u32(L.prior),
    }, { pending: 0x25, meter: 20, chain: 0, prior: 0x25 });

    privateScoreKill(state.memory, game.rom, L, 0x10, 0x10);
    assert.deepEqual({
      pending: state.memory.u32(L.pending),
      meter: state.memory.u16(L.meter),
      chain: state.memory.u16(L.chain),
      hiwater: state.memory.u16(L.hiwater),
      accA: state.memory.u32(L.accA),
      accB: state.memory.u32(L.accB),
      specialCadence: state.memory.u16(L.specialCadence),
    }, {
      pending: 0x60, meter: 40, chain: 0x0002, hiwater: 0x0002,
      accA: 0x35, accB: 0x60, specialCadence: 0x1e,
    });

    scoreKill(oracle, game.rom, { rom: game.rom }, 0x25, 0x10);
    scoreKill(oracle, game.rom, { rom: game.rom }, 0x10, 0x10);
    assert.deepEqual({
      pending: state.memory.u32(L.pending),
      meter: state.memory.u16(L.meter),
      chain: state.memory.u16(L.chain),
      hiwater: state.memory.u16(L.hiwater),
      prior: state.memory.u32(L.prior),
      accA: state.memory.u32(L.accA),
      accB: state.memory.u32(L.accB),
      specialCadence: state.memory.u16(L.specialCadence),
    }, {
      pending: oracle.u32(native.pendingEnd - 4),
      meter: oracle.u16(native.meter),
      chain: oracle.u16(native.chain),
      hiwater: oracle.u16(native.hiwater),
      prior: oracle.u32(native.acc1),
      accA: oracle.u32(native.accA),
      accB: oracle.u32(native.accB),
      specialCadence: oracle.u16(native.w1e),
    }, 'private ordinary score and chain arithmetic matches the native P1 projection');

    state.memory.setU16(L.chain, 0x0099);
    state.memory.setU16(L.hiwater, 0x0099);
    state.memory.setU32(L.prior, 0);
    privateScoreKill(state.memory, game.rom, L, 0x01, 0x10);
    assert.equal(state.memory.u16(L.chain), 0x0100);
    assert.equal(state.memory.u16(L.hiwater), 0x0100);

    state.memory.setU16(L.meter, 1);
    state.memory.setU32(L.accA, 0x12345678);
    state.memory.setU32(L.accB, 0x87654321);
    privateScoreFrame(state.memory, L);
    assert.equal(state.memory.u16(L.meter), 0);
    assert.equal(state.memory.u32(L.accA), 0);
    assert.equal(state.memory.u32(L.accB), 0);
  });

test('W617 refill selectors 0 and 2 and loop caps 56 and 90 are cartridge exact',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    for (const [selector, refill] of [[0, 20], [2, 18]]) {
      clearPrivateScore(state);
      game.ram.setU16(SCORE.loop, 0);
      state.memory.setU16(L.weaponSel, selector);
      privateScoreKill(state.memory, game.rom, L, 1, 0x10);
      assert.equal(state.memory.u16(L.meter), refill);
    }

    clearPrivateScore(state);
    game.ram.setU16(SCORE.loop, 0);
    state.memory.setU16(L.weaponSel, 0);
    state.memory.setU16(L.meter, 55);
    privateScoreKill(state.memory, game.rom, L, 1, 0x10);
    assert.equal(state.memory.u16(L.meter), 56);

    clearPrivateScore(state);
    game.ram.setU16(SCORE.loop, 1);
    state.memory.setU16(L.weaponSel, 2);
    state.memory.setU16(L.meter, 1);
    privateScoreKill(state.memory, game.rom, L, 1, 0x10);
    assert.equal(state.memory.u16(L.meter), 90);
  });

test('W617 special score masks follow the natural divider and one-or-two chain cadence',
  { skip: SKIP_ASSETS }, async () => {
    for (const mask of [0x04, 0x44]) {
      const { state, game } = await exactState();
      clearPrivateScore(state);
      const hyperBefore = bytes(state.memory, P3_VIRTUAL.hyper, 0x100);
      const oracle = game.ram.clone();
      const native = LEDGER.p1;
      for (const [address, length] of [
        [native.pendingEnd - 4, 4], [native.meter, 2], [native.chain, 2],
        [native.hiwater, 2], [native.acc1, 4], [native.acc2, 4],
        [native.accA, 4], [native.accB, 4], [native.acc3, 4],
      ]) {
        clearRange(oracle, address, length);
      }
      oracle.setU16(SCORE.loop, 0);
      oracle.setU16(native.weaponSel, 0);
      oracle.setU16(native.hyper, 0);
      oracle.setU16(native.guard, 0);
      oracle.setU16(native.power, 0);
      oracle.setU16(native.formation, 2);
      oracle.setU16(native.rankDivider, 0);
      oracle.setU16(native.rankAccum, 0);
      oracle.setU16(native.bombStock, 0);
      oracle.setU16(SCORE.laserRec, 0);
      oracle.setU8(SCORE.g30f8, 0);
      oracle.setU8(SCORE.g30f9, 0);
      game.ram.setU16(SCORE.loop, 0);
      const nativeBefore = game.ram.b.slice();
      state.memory.setU16(L.weaponSel, 0);
      state.memory.setU16(L.power, 0);
      state.memory.setU16(L.formation, 2);

      scoreKill(oracle, game.rom, { rom: game.rom }, 0x10, 0x10);
      privateScoreKill(state.memory, game.rom, L, 0x10, 0x10);
      for (let hit = 1; hit <= 31; hit++) {
        bombHitChain(oracle, { rom: game.rom }, 1, mask);
        privateScoreHit(state.memory, L, mask);
        assert.deepEqual({
          pending: state.memory.u32(L.pending),
          meter: state.memory.u16(L.meter),
          chain: state.memory.u16(L.chain),
          hiwater: state.memory.u16(L.hiwater),
          prior: state.memory.u32(L.prior),
          accA: state.memory.u32(L.accA),
          accB: state.memory.u32(L.accB),
          specialCadence: state.memory.u16(L.specialCadence),
        }, {
          pending: oracle.u32(native.pendingEnd - 4),
          meter: oracle.u16(native.meter),
          chain: oracle.u16(native.chain),
          hiwater: oracle.u16(native.hiwater),
          prior: oracle.u32(native.acc1),
          accA: oracle.u32(native.accA),
          accB: oracle.u32(native.accB),
          specialCadence: oracle.u16(native.w1e),
        }, `mask $${mask.toString(16)} hit ${hit}`);
      }
      assert.deepEqual({
        pending: state.memory.u32(L.pending),
        meter: state.memory.u16(L.meter),
        chain: state.memory.u16(L.chain),
        accA: state.memory.u32(L.accA),
        accB: state.memory.u32(L.accB),
        specialCadence: state.memory.u16(L.specialCadence),
      }, {
        pending: 0x21,
        meter: 20,
        chain: mask === 0x44 ? 3 : 2,
        accA: 0x11,
        accB: 0x21,
        specialCadence: 0x1e,
      });
      assert.deepEqual(game.ram.b, nativeBefore);
      assert.deepEqual(bytes(state.memory, P3_VIRTUAL.hyper, 0x100), hyperBefore);
    }
  });

test('W617 private BCD drain carries and saturates at 9:99999999',
  { skip: SKIP_ASSETS }, async () => {
    const { state } = await exactState();
    clearPrivateScore(state);
    state.memory.setU32(L.total, 0x99999999);
    state.memory.setU32(L.pending, 1);
    privateScoreFrame(state.memory, L);
    assert.equal(state.memory.u32(L.total), 0);
    assert.equal(state.memory.u16(L.overflow), 1);
    assert.equal(state.memory.u32(L.pending), 0);

    state.memory.setU32(L.total, 0x99999999);
    state.memory.setU16(L.overflow, 9);
    state.memory.setU32(L.pending, 1);
    privateScoreFrame(state.memory, L);
    assert.equal(state.memory.u32(L.total), 0x99999999);
    assert.equal(state.memory.u16(L.overflow), 9);

    clearPrivateScore(state);
    privateBcdAdd(state.memory, L.pendingEnd, 0x00009999);
    privateBcdAdd(state.memory, L.pendingEnd, 0x00000001);
    assert.equal(state.memory.u32(L.pending), 0x00010000);
  });

test('W617 HUD drains private pending before one eligible meter expiry',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armReceipt(state, game);
    enterEnemy(state, game, armed.main, armed.rec);
    scoreHit(game.ram, scoreContext(state, game), armed.rec, armed.rawMask);
    assert.equal(state.memory.u32(L.pending), 1);
    assert.equal(state.memory.u32(L.total), 0);
    exitEnemy(state, game, armed.main, armed.rec);

    state.memory.setU16(L.meter, 1);
    state.memory.setU32(L.accA, 0x25);
    state.memory.setU32(L.accB, 0x25);
    game.ram.setU16(HUDRAM.slideFlag, 0);
    game.ram.setU8(HUDRAM.flags9, game.ram.u8(HUDRAM.flags9) & ~0x01);
    game.ram.setU8(HUDRAM.dfFlags, game.ram.u8(HUDRAM.dfFlags) & ~0x08);
    runHudFrame(state, game);
    assert.equal(state.memory.u32(L.total), 1);
    assert.equal(state.memory.u32(L.pending), 0);
    assert.equal(state.memory.u16(L.meter), 0);
    assert.equal(state.memory.u32(L.accA), 0);
    assert.equal(state.memory.u32(L.accB), 0);
  });

test('W617 Game context invokes phased private hooks at HUD state-1 boundaries',
  { skip: SKIP_ASSETS }, async () => {
    const { game, state } = await exactState();
    clearPrivateScore(state);
    state.memory.setU32(L.pending, 0x00000087);
    state.memory.setU16(L.meter, 2);
    game.ram.setU16(HUDRAM.slideFlag, 0);
    game.ram.setU8(HUDRAM.flags9, game.ram.u8(HUDRAM.flags9) & ~0x01);
    game.ram.setU8(HUDRAM.dfFlags, game.ram.u8(HUDRAM.dfFlags) & ~0x08);
    const installed = game.privateScoreFrameHook;
    const phases = [];
    game.privateScoreFrameHook = (hookGame, event) => {
      phases.push(event.phase);
      return installed(hookGame, event);
    };
    game.step(0xffff);
    assert.deepEqual(phases, ['drain', 'meter']);
    assert.equal(state.memory.u32(L.pending), 0);
    assert.equal(state.memory.u32(L.total), 0x00000087);
    assert.equal(state.memory.u16(L.meter), 1);
  });

test('W617 slide-in drains pending while freezing private meter expiry',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    clearPrivateScore(state);
    state.memory.setU32(L.pending, 0x12);
    state.memory.setU16(L.meter, 3);
    state.memory.setU32(L.accA, 0x25);
    state.memory.setU32(L.accB, 0x25);
    game.ram.setU16(HUDRAM.slideFlag, 1);
    game.ram.setU16(HUDRAM.bannerTimer, 2);
    game.ram.setU8(HUDRAM.flags9, game.ram.u8(HUDRAM.flags9) & ~0x01);
    game.ram.setU16(HUDRAM.aliveP1, 0xffff);
    game.ram.setU16(HUDRAM.aliveP2, 0xffff);
    runHudFrame(state, game);
    assert.equal(state.memory.u32(L.total), 0x12);
    assert.equal(state.memory.u32(L.pending), 0);
    assert.equal(state.memory.u16(L.meter), 3);
    assert.equal(state.memory.u32(L.accA), 0x25);
    assert.equal(state.memory.u32(L.accB), 0x25);
  });

test('W617 non-rejoining banner drains pending while freezing private meter expiry',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    clearPrivateScore(state);
    state.memory.setU32(L.pending, 0x34);
    state.memory.setU16(L.meter, 3);
    state.memory.setU32(L.accA, 0x25);
    state.memory.setU32(L.accB, 0x25);
    game.ram.setU16(HUDRAM.slideFlag, 0);
    game.ram.setU8(HUDRAM.flags9, game.ram.u8(HUDRAM.flags9) | 0x01);
    game.ram.setU8(HUDRAM.flags8, game.ram.u8(HUDRAM.flags8) | 0x08);
    game.ram.setU8(HUDRAM.bannerFlagsClear, 0x08);
    game.ram.setU16(HUDRAM.itemCount, 1);
    game.ram.setU16(HUDRAM.bannerTimer, 2);
    game.ram.setU16(HUDRAM.aliveP1, 0xffff);
    game.ram.setU16(HUDRAM.aliveP2, 0xffff);
    runHudFrame(state, game);
    assert.equal(state.memory.u32(L.total), 0x34);
    assert.equal(state.memory.u32(L.pending), 0);
    assert.equal(state.memory.u16(L.meter), 3);
    assert.equal(state.memory.u32(L.accA), 0x25);
    assert.equal(state.memory.u32(L.accB), 0x25);
  });

test('W617 real type $36 mixed receipt preserves P1 and credits all four P3 awards',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    resetCombat(state, game);
    clearPrivateScore(state);
    const main = ENEMY.table;
    const rec = SPAWN.SUB_COMMON;
    game.ram.setU16(main, 0x8000);
    game.ram.setU16(main + 0x04, 6);
    game.ram.setU32(main + 0x06, rec);
    game.ram.setU32(main + 0x12, 0x2350a8);
    game.ram.setU8(main + 0x0c, 0x36);
    game.ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0a);
    runInitBodyAddr(0x263a58, game.ram, game.rom, main,
      game.unportedLog, game.tables);
    game.ram.setU8(rec, (game.ram.u8(rec) & ~0x5c) | 0x10);
    game.ram.setU16(rec + 0x02, 0x1000);
    game.ram.setU16(rec + 0x04, 0x1800);
    for (const offset of [0x10, 0x12, 0x14, 0x16]) {
      game.ram.setU16(rec + offset, 0x0200);
    }
    game.ram.setU16(rec + 0x18, 0x1000);
    putShot(state.memory, 0x0200);
    game.ram.setU16(DMG.poolACount, 1);
    runThreePilotDamageObject(game);
    assert.equal(game.ram.u8(rec) & 0x5c, 0x50);
    assert.notEqual(state.memory.u8(P3_VIRTUAL.damageReceipts), 0);

    game.ram.setU32(rec + 0x02, 0x30002000);
    game.ram.setU32(main + 0x1a, 0x00003000);
    game.ram.setU16(rec + 0x18, 0x6fff);
    game.ram.setU16(rec + 0x38, 0x6fff);
    game.ram.setU16(0x8130d2, 1);
    game.ram.setU16(LEDGER.p1.hyper, 0);
    game.ram.setU16(SCORE.loop, 0);
    const oracle = game.ram.clone();
    oracle.setU8(rec, (oracle.u8(rec) & ~0x5c) | 0x10);
    const baseCtx = {
      rom: game.rom,
      tables: game.tables,
      unported: game.unportedLog,
      soundPost() {},
      effectSpawn() {},
      bulletSpawn() {},
    };
    runHandler(0x263c7c, oracle, game.rom, main, { ...baseCtx, ram: oracle });

    enterEnemy(state, game, main, rec, 7);
    runHandler(0x263c7c, game.ram, game.rom, main, {
      ...baseCtx,
      ...scoreContext(state, game),
      ram: game.ram,
      tables: game.tables,
      unported: game.unportedLog,
    });
    assert.deepEqual(game.ram.b, oracle.b,
      'mixed type $36 leaves the native P1 machine byte-identical');
    assert.deepEqual({
      pending: state.memory.u32(L.pending),
      meter: state.memory.u16(L.meter),
      chain: state.memory.u16(L.chain),
      hiwater: state.memory.u16(L.hiwater),
      accA: state.memory.u32(L.accA),
      accB: state.memory.u32(L.accB),
    }, {
      pending: 0x146, meter: 56, chain: 4, hiwater: 4,
      accA: 0x69, accB: 0x145,
    });
    exitEnemy(state, game, main, rec, 7);
    const after = privateScoreState(state);
    runHandler(0x263c7c, game.ram, game.rom, main, {
      ...baseCtx, ...scoreContext(state, game), ram: game.ram,
    });
    assert.deepEqual(privateScoreState(state), after,
      'the next type $36 pass cannot inherit the consumed receipt');
  });

test('W617 committed score survives detach, then allocator reset clears all 32 bytes',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armReceipt(state, game);
    objTableInit24107C(game.ram);
    state.objectDriverHook({
      phase: 'after-driver', ram: game.ram, created: 0, killed: 0,
    });
    assert.equal(state.lifecycle, 'detached');

    enterEnemy(state, game, armed.main, armed.rec);
    scoreKill(game.ram, game.rom, scoreContext(state, game), 0x25, armed.rawMask);
    exitEnemy(state, game, armed.main, armed.rec);
    assert.equal(state.memory.u32(L.pending), 0x25);
    const frozenMeter = state.memory.u16(L.meter);
    state.privateScoreFrameHook(game, { phase: 'drain', ctx: { rom: game.rom } });
    assert.equal(state.memory.u32(L.total), 0x25,
      'detached P3 still drains an already committed score');
    state.privateScoreFrameHook(game, { phase: 'meter', ctx: { rom: game.rom } });
    assert.equal(state.memory.u16(L.meter), frozenMeter,
      'detached P3 freezes its private chain meter');

    state.privateDamageReceiptHook(game, {
      phase: 'allocator-reset', ram: game.ram,
    });
    assert.deepEqual(privateScoreState(state), new Uint8Array(0x20));
  });

test('W617 stale generations and no-hook native calls cannot invent private credit',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armReceipt(state, game);
    game.ram.setU32(armed.main + ENEMY.handlerOff, 0x269cea);
    enterEnemy(state, game, armed.main, armed.rec);
    scoreKill(game.ram, game.rom, scoreContext(state, game), 0x25, 0);
    assert.deepEqual(privateScoreState(state), new Uint8Array(0x20));
    exitEnemy(state, game, armed.main, armed.rec);

    const a = game.ram.clone();
    const b = game.ram.clone();
    a.setU8(armed.rec, a.u8(armed.rec) & ~0x02);
    b.setU8(armed.rec, b.u8(armed.rec) & ~0x02);
    let privateCalls = 0;
    scoreHit(a, { rom: game.rom }, armed.rec, 0x10);
    scoreKill(a, game.rom, { rom: game.rom }, 0x25, 0x10);
    scoreHit(b, {
      rom: game.rom,
      privateScoreEventHook: () => privateCalls++,
    }, armed.rec, 0x10);
    scoreKill(b, game.rom, {
      rom: game.rom,
      privateScoreEventHook: () => privateCalls++,
    }, 0x25, 0x10);
    assert.equal(privateCalls, 0);
    assert.deepEqual(b.b, a.b);
  });

test('W617 score hooks reject cross-Game use before either ledger mutates',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    const beforeA = privateScoreState(a.state);
    const beforeB = privateScoreState(b.state);
    assert.throws(() => b.state.privateScoreEventHook(a.game, {
      phase: 'score-hit', ram: a.game.ram, receipt: true, d0: 1, d1: 0x10,
    }), /different Game/);
    assert.throws(() => b.state.privateScoreFrameHook(a.game, {
      phase: 'drain', ctx: { rom: a.game.rom },
    }), /different Game/);
    assert.throws(() => b.state.privateScoreFrameHook(a.game, {
      phase: 'meter', ctx: { rom: a.game.rom },
    }), /different Game/);
    assert.deepEqual(privateScoreState(a.state), beforeA);
    assert.deepEqual(privateScoreState(b.state), beforeB);
  });

test('W617 attachment rejects preinstalled score hooks before allocator mutation',
  { skip: SKIP_ASSETS }, async () => {
    const first = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz,
      undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
    const id1 = first.game.ram.u32(ALLOC.idCounter);
    first.game.privateScoreEventHook = () => {};
    assert.throws(() => attachThreePilotFoundation(first.game), /privateScoreEventHook/);
    assert.equal(first.game.ram.u32(ALLOC.idCounter), id1);

    const second = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz,
      undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
    const id2 = second.game.ram.u32(ALLOC.idCounter);
    second.game.privateScoreFrameHook = () => {};
    assert.throws(() => attachThreePilotFoundation(second.game), /privateScoreFrameHook/);
    assert.equal(second.game.ram.u32(ALLOC.idCounter), id2);
  });

test('W617 private score remains absent from public mods, browser hashes, and new ROM windows', () => {
  const id = THREE_PILOT_FORMATION_MODE.id;
  assert.equal(MOD_IDS.length, 32);
  assert.equal(MOD_IDS.includes(id), false);
  assert.equal(Object.hasOwn(MODS, id), false);
  assert.equal(formationMode(id), null);
  assert.equal(hashToFormation(`#formation=${id}`), null);
  assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE), '');

  const exporter = readFileSync(new URL('../tools/export-tables.py', import.meta.url), 'utf8');
  assert.equal((exporter.match(/\(0x287DF0, 0x0008/g) ?? []).length, 1,
    'W617 reuses the existing cap/refill export window');
});

test('W617 replay v1 remains closed before recording or playback mutation',
  { skip: SKIP_ASSETS }, async () => {
    const { demo } = await exactState();
    await assert.rejects(() => demo.armRecording(),
      /REC is unavailable while private three-pilot formation state is active.*Replay v1/);
    assert.throws(() => demo.playFrom({}),
      /PLAY is unavailable while private three-pilot formation state is active.*Replay v1/);
    assert.equal(demo.recorder, null);
    assert.equal(demo.playback, null);
  });
