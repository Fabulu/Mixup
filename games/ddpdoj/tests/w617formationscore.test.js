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
  P3_PRIVATE_SCORE_LEDGER, THREE_PILOT_FORMATION_MODE,
  attachThreePilotFoundation, runThreePilotDamageObject,
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

function privateScoreState(state) {
  return bytes(state.memory, state.scoreLedger.base, state.scoreLedger.length);
}

function clearPrivateScore(state) {
  clearRange(state.memory, state.scoreLedger.base, state.scoreLedger.length);
}

function resetCombat(state, game) {
  clearRange(game.ram, ENEMY.table, ENEMY.slots * ENEMY.stride);
  clearRange(game.ram, DMG.poolA,
    PRIVATE_DAMAGE_GEOMETRY.enemySlots * DMG.enemyStride);
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
  game.ram.setU16(SCORE.g30f8, 0);
  game.ram.setU16(SCORE.laserRec, 0);
  state.memory.setU16(state.binding.player + P.state, 0x8000);
  state.memory.setU8(state.binding.player + DMG.laserByte, 0);
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

function putShot(state, power = 0x0400) {
  const rec = state.binding.shots;
  state.memory.setU16(rec, 0x8000);
  state.memory.setU16(rec + 0x02, 0x1000);
  state.memory.setU16(rec + 0x04, 0x1800);
  state.memory.setU16(rec + 0x10, 0x0100);
  state.memory.setU16(rec + 0x12, 0x0080);
  state.memory.setU16(rec + 0x14, 0x0120);
  state.memory.setU16(rec + 0x16, 0x0060);
  state.memory.setU16(rec + 0x18, power);
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

function putBeam(state, power = 0x0400) {
  const rec = state.damage.resources.beamControl;
  state.memory.setU16(rec, 0x8000);
  state.memory.setU16(rec + 0x02, 0x2c00);
  state.memory.setU16(rec + 0x04, 0x3000);
  state.memory.setU16(rec + 0x06, 0x1000);
  state.memory.setU16(rec + 0x08, 0x0400);
  state.memory.setU16(rec + 0x0a, 0x0400);
  state.memory.setU16(rec + 0x0e, power);
  state.memory.setU16(rec + 0x1a, 0);
  state.memory.setU16(rec + 0x1c, power);
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
  putShot(state);
  game.ram.setU16(DMG.poolACount, 1);
  runThreePilotDamageObject(game);
  assert.equal(state.damage.last.hitsA, 1);
  assert.equal(game.ram.u16(rec + 0x18), 0x0c00);
  assert.notEqual(state.memory.u8(state.binding.virtual.damageReceipts), 0,
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
  state.memory.setU8(state.binding.player + DMG.laserByte, 1);
  if (source === 'slot-27') {
    putWeaponObject(state.memory, state.damage.resources.slot27);
  } else if (source === 'slot-30') {
    putWeaponObject(state.memory, state.damage.resources.slot30);
  } else if (beam) {
    putBeam(state);
  } else {
    throw new RangeError(`unknown special receipt source ${source}`);
  }
  runThreePilotDamageObject(game);
  if (beam) runThreePilotDamageObject(game);
  const result = state.damage.last;
  assert.equal(source === 'slot-27' ? result.weapon.hits27
    : source === 'slot-30' ? result.weapon.hits30 : result.weapon.beam, 1);
  assert.equal(game.ram.u16(rec + 0x18), 0x0c00);
  assert.equal(game.ram.u8(rec) & 0x5c, 0x44 | (nativeMask & 0x5c));
  assert.notEqual(state.memory.u8(state.binding.virtual.damageReceipts), 0);
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

test('W617 private score reservations remain dormant and no private score hook is installed',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    assert.equal(game.privateScoreEventHook, undefined);
    assert.equal(game.privateScoreFrameHook, undefined);
    for (const companion of state.manager.companions) {
      assert.deepEqual(bytes(companion.memory, companion.scoreLedger.base,
        companion.scoreLedger.length), new Uint8Array(companion.scoreLedger.length));
    }
  });

test('W617 ordinary companion hit and kill are byte-exact P1 ownership',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armReceipt(state, game);
    game.ram.setU16(LEDGER.p1.hyper, 0);
    game.ram.setU16(SCORE.loop, 0);
    const oracle = game.ram.clone();
    scoreHit(oracle, { rom: game.rom }, armed.rec, 0x10);
    scoreKill(oracle, game.rom, { rom: game.rom }, 0x25, 0x10);
    const kills = [];
    const ctx = scoreContext(state, game, {
      killEvent: (d0, d1) => kills.push([d0, d1]),
    });

    enterEnemy(state, game, armed.main, armed.rec);
    scoreHit(game.ram, ctx, armed.rec, armed.rawMask);
    const ownership = scoreKill(game.ram, game.rom, ctx, 0x25, armed.rawMask);
    exitEnemy(state, game, armed.main, armed.rec);

    assert.equal(ownership.mask, 0x10);
    assert.equal(ownership.privateOnly, false);
    assert.deepEqual(kills, [[0x25, 0x10]]);
    assert.deepEqual(game.ram.b, oracle.b);
    assert.deepEqual(privateScoreState(state), new Uint8Array(L.length));
  });

test('W617 mixed native ownership retains P2 and deduplicates P1',
  { skip: SKIP_ASSETS }, async () => {
    for (const [nativeMask, expected] of [[0x10, 0x10], [0x08, 0x18], [0x18, 0x18]]) {
      const { state, game } = await exactState();
      const armed = armReceipt(state, game, nativeMask);
      enterEnemy(state, game, armed.main, armed.rec);
      const ownership = state.privateDamageReceiptHook(game, {
        phase: 'score-hit', ram: game.ram, a6: armed.rec, d1: armed.rawMask,
      });
      assert.equal(ownership.mask, expected, `native mask $${nativeMask.toString(16)}`);
      assert.equal(ownership.privateOnly, false);
      exitEnemy(state, game, armed.main, armed.rec);
    }
  });

test('W617 marker 3 weapon sources enter byte-exact native P1 score paths',
  { skip: SKIP_ASSETS }, async () => {
    for (const [source, expectedMask, expectedSourceMask] of [
      ['ordinary', 0x10, 0x00],
      ['slot-27', 0x14, 0x04],
      ['slot-30', 0x54, 0x44],
      ['beam', 0x14, 0x04],
    ]) {
      const { state, game } = await exactState(3);
      const armed = source === 'ordinary'
        ? armReceipt(state, game)
        : armSpecialReceipt(state, game, source);
      game.ram.setU16(LEDGER.p1.hyper, 0);
      game.ram.setU16(SCORE.loop, 0);

      const oracle = game.ram.clone();
      scoreHit(oracle, { rom: game.rom }, armed.rec, expectedMask);
      scoreKill(oracle, game.rom, { rom: game.rom }, 0x25, expectedMask);

      const kills = [];
      const ctx = scoreContext(state, game, {
        killEvent: (d0, d1) => kills.push([d0, d1]),
      });
      enterEnemy(state, game, armed.main, armed.rec);
      scoreHit(game.ram, ctx, armed.rec, armed.rawMask);
      const ownership = scoreKill(
        game.ram, game.rom, ctx, 0x25, armed.rawMask);
      exitEnemy(state, game, armed.main, armed.rec);

      assert.equal(state.binding.marker, 3);
      assert.equal(ownership.mask, expectedMask, source);
      assert.equal(ownership.privateScoreMask, expectedSourceMask, source);
      assert.equal(ownership.privateOnly, false, source);
      assert.deepEqual(kills, [[0x25, expectedMask]], source);
      assert.deepEqual(game.ram.b, oracle.b, source);
      assert.deepEqual(privateScoreState(state),
        new Uint8Array(state.scoreLedger.length), source);
      assert.equal(state.memory.u8(state.binding.virtual.damageReceipts), 0, source);
    }
  });

test('W617 authentic raw zero stays zero even with a valid companion receipt',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const armed = armSpecialReceipt(state, game, 'slot-30', 0x10);
    const before = game.ram.b.slice();
    enterEnemy(state, game, armed.main, armed.rec);
    const ownership = state.privateDamageReceiptHook(game, {
      phase: 'score-hit', ram: game.ram, a6: armed.rec, d1: 0,
    });
    assert.equal(ownership.mask, 0);
    scoreHit(game.ram, scoreContext(state, game), armed.rec, 0);
    exitEnemy(state, game, armed.main, armed.rec);
    assert.deepEqual(game.ram.b, before);
    assert.deepEqual(privateScoreState(state), new Uint8Array(L.length));
  });

test('W617 both sidecars are isolated and their score reservations stay zero',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const [left, right] = state.manager.companions;
    assert.notEqual(left.binding.virtual.score, right.binding.virtual.score);
    left.memory.setU8(left.binding.virtual.damageScratch, 0x5a);
    assert.equal(right.memory.u8(right.binding.virtual.damageScratch), 0);
    game.privateDamageReceiptHook(game, { phase: 'allocator-reset', ram: game.ram });
    for (const companion of [left, right]) {
      assert.deepEqual(bytes(companion.memory, companion.scoreLedger.base,
        companion.scoreLedger.length), new Uint8Array(companion.scoreLedger.length));
    }
  });
