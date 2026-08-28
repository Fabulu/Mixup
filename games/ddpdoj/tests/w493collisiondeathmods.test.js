// W493: graze, damage, lethal-hit, and authentic respawn mods.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Game } from '../src/main.js';
import { RAM, P } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import { PaletteState } from '../src/palette.js';
import { ALLOC } from '../src/objalloc.js';
import { LEDGER } from '../src/score.js';
import {
  DMG, playerBox, poolDamage, shotBoundingBox, runType5Tail,
} from '../src/damage.js';
import { WriteLog, spawnCore, poolClear } from '../src/bullets.js';
import { BOMBRAM, bombDamage24560A } from '../src/bomb.js';
import {
  DEATH, playerHit249F8A, playerLethalHit249542, updatePlayer,
} from '../src/player.js';
import { bonusLine125FFA8 } from '../src/tally.js';
import {
  MODS, MOD_RAM, resolveLoadout, createModState, modGameOptions,
  replayPolicy, applyPreFrameMods, applyPostFrameMods,
} from '../src/mods.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
const stateOf = (...ids) => createModState(resolveLoadout(ids));

function makeGame(ids = []) {
  const state = stateOf(...ids);
  return new Game(new Uint8Array(0x20000), TABLES, {
    palCatchUp: false,
    ...(modGameOptions(state) ?? {}),
  });
}

function putPlayerBox(ram, rec, y = 0x2000, x = 0x1000) {
  ram.setU16(rec, 0x8000);
  ram.setU16(rec + P.posY, y);
  ram.setU16(rec + P.posX, x);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(rec + offset, 0x100);
}

function putBullet(ram, slot, y, x, status = 0x8000) {
  const rec = DMG.bulletPool + slot * DMG.bulletStride;
  ram.setU16(rec, status);
  ram.setU16(rec + 0x02, y);
  ram.setU16(rec + 0x04, x);
  return rec;
}

function putShot(ram, table, y = 0x1000, x = 0x2000, power = 0x400) {
  const rec = table;
  ram.setU16(rec, 0x8000);
  ram.setU16(rec + 0x02, y);
  ram.setU16(rec + 0x04, x);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(rec + offset, 0x100);
  ram.setU16(rec + 0x18, power);
  return rec;
}

function putEnemy(ram, pool, y = 0x1000, x = 0x2000, hp = 0x1000) {
  const rec = pool;
  ram.setU16(rec, 0xa000);
  ram.setU16(rec + 0x02, y);
  ram.setU16(rec + 0x04, x);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(rec + offset, 0x100);
  ram.setU16(rec + 0x18, hp);
  return rec;
}

function bombCtx(extra = {}) {
  return {
    rom: ROM,
    unportedLog: new UnportedLog(),
    soundPost() {},
    ...extra,
  };
}

function deathCtx(options) {
  return {
    rom: ROM,
    palette: new PaletteState(),
    unportedLog: new UnportedLog(),
    soundPost() {},
    hyperEvent() {},
    ...options,
  };
}

function respawnEntry(ram, side, lives = 2, y = 0x1000, x = 0x0e00) {
  const rec = side === 0 ? 0x8130fa : 0x81311e;
  const d = side === 0 ? DEATH.p1 : DEATH.p2;
  ram.setU16(rec, 1);
  ram.setU32(rec + 0x08, d.lives);
  ram.setU16(rec + 0x0c, y);
  ram.setU16(rec + 0x0e, x);
  ram.setU16(rec + 0x14, side === 0 ? 2 : 3);
  ram.setU8(rec + 0x17, side);
  ram.setU16(d.lives, lives);
  return { rec, d };
}

test('W493 catalogue, conflict, replay policy, and per-Game seams are explicit', () => {
  const expected = {
    'graze-reactor': 'arsenal',
    'glass-cannon': 'challenge',
    'auto-deathbomb': 'survival',
    'resurrection-in-place': 'survival',
  };
  for (const [id, category] of Object.entries(expected)) {
    assert.equal(MODS[id].category, category);
    assert.equal(MODS[id].replaySafe, false);
    assert.ok(MODS[id].name && MODS[id].effects.length);
  }
  assert.deepEqual(new Set(replayPolicy(stateOf(...Object.keys(expected))).blocking),
    new Set(Object.keys(expected)), 'all four simulation mods block replay v1');

  const conflict = resolveLoadout(['invincibility', 'glass-cannon']);
  assert.deepEqual(conflict.ids, ['glass-cannon']);
  assert.deepEqual(conflict.conflicts, [{
    group: 'player-durability', winner: 'glass-cannon', dropped: ['invincibility'],
  }]);

  const modded = makeGame(Object.keys(expected));
  for (const name of [
    'bulletSpawnHook', 'playerGrazeHook', 'playerDamageTransform', 'lethalHitHook',
    'deathPositionCapture', 'respawnPositionTransform',
  ]) assert.equal(typeof modded[name], 'function', `${name} is scoped to this Game`);

  const vanilla = makeGame();
  for (const name of [
    'bulletSpawnHook', 'playerGrazeHook', 'playerDamageTransform', 'lethalHitHook',
    'deathPositionCapture', 'respawnPositionTransform',
  ]) assert.equal(Object.hasOwn(vanilla, name), false, `${name} is absent in vanilla`);
});

test('W493 Invincibility filters ordinary P1 bullets while P2 and polarity stay authentic', () => {
  const options = modGameOptions(stateOf('invincibility'));

  const p1 = new Ram();
  putPlayerBox(p1, RAM.player1);
  const p1Bullet = putBullet(p1, 0, 0x2000, 0x1000);
  const p1Result = playerBox(p1, RAM.player1, options);
  assert.equal(p1Result.hit, false);
  assert.equal(Boolean(p1.btst8(RAM.player1, 4)), false,
    'P1 never receives the ordinary pending-hit bit');
  assert.equal(Boolean(p1.btst8(p1Bullet, 4)), false,
    'the ignored bullet is not consumed by a fake collision');

  const p2 = new Ram();
  putPlayerBox(p2, RAM.player2);
  const p2Bullet = putBullet(p2, 0, 0x2000, 0x1000);
  const p2Result = playerBox(p2, RAM.player2, options);
  assert.equal(p2Result.hit, true, 'P2 remains vulnerable to the same ordinary overlap');
  assert.equal(Boolean(p2.btst8(RAM.player2, 4)), true);
  assert.equal(Boolean(p2.btst8(p2Bullet, 4)), true);

  const composed = modGameOptions(stateOf('invincibility', 'bullet-polarity'))
    .enemyBulletCollisionFilter;
  assert.equal(composed(p2, { player: RAM.player1, bank: 'B' }), false,
    'Invincibility remains authoritative for P1 when polarity is selected');
  assert.equal(composed(p2, { player: RAM.player2, bank: 'B' }), true,
    'unfocused P2 still collides with polarity bank B');
  assert.equal(composed(p2, { player: RAM.player2, bank: 'A' }), false,
    'unfocused P2 still phases through polarity bank A');
});

test('W493 Invincibility leaves cartridge-authored P1 retirement active', () => {
  const options = modGameOptions(stateOf('invincibility'));
  const ram = new Ram();
  const slot = ALLOC.table;
  const events = [];
  ram.setU16(RAM.player1, 0x9000);
  ram.setU8(RAM.player1 + P.invuln, 0);
  ram.setU8(slot + 0x07, 0);
  ram.setU32(slot + ALLOC.idOff, 1);

  updatePlayer(ram, slot, 0, deathCtx({
    ...options,
    deathEvent: (...event) => events.push(event),
  }));

  assert.equal(ram.u16(RAM.player1), 0x0100,
    'the cartridge pending-hit bit still initializes its death state');
  assert.equal(events[0]?.[0], 'hit');
});

test('W493 Graze Reactor rewards genuine live near misses once per slot lifetime and player', () => {
  const state = stateOf('graze-reactor');
  const hook = modGameOptions(state).playerGrazeHook;
  const ram = new Ram();
  putPlayerBox(ram, RAM.player1);
  putPlayerBox(ram, RAM.player2);
  const near = putBullet(ram, 0, 0x2200, 0x1000); // one pixel outside the +Y edge
  putBullet(ram, 1, 0x2000, 0x1000);             // inside the exact hitbox
  putBullet(ram, 2, 0x3000, 0x1000);             // live but too far away

  const first = playerBox(ram, RAM.player1, { playerGrazeHook: hook });
  assert.equal(first.hit, true, 'the exact-overlap control remains an authentic hit');
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000100,
    'one live near miss gives a concrete packed-BCD +100');

  playerBox(ram, RAM.player1, { playerGrazeHook: hook });
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000100,
    'the same still-live bullet cannot reward twice');

  ram.setU16(near, 0);
  playerBox(ram, RAM.player1, { playerGrazeHook: hook });
  ram.setU16(near, 0x8000);
  playerBox(ram, RAM.player1, { playerGrazeHook: hook });
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000200,
    'observing the slot inactive explicitly resets its eligibility');

  playerBox(ram, RAM.player2, { playerGrazeHook: hook });
  assert.equal(ram.u32(LEDGER.p2.pendingEnd - 4), 0x00000100,
    'P2 independently rewards the same live bullet');
  assert.deepEqual(state.runtime.grazeCount, [2, 1]);
});

test('W493 Graze Reactor leaves vanilla unchanged and keeps history state-local', () => {
  const vanillaRam = new Ram();
  putPlayerBox(vanillaRam, RAM.player1);
  putBullet(vanillaRam, 0, 0x2200, 0x1000);
  assert.equal(playerBox(vanillaRam, RAM.player1).hit, false);
  assert.equal(vanillaRam.u32(LEDGER.p1.pendingEnd - 4), 0,
    'a vanilla near miss does not alter score');

  const a = stateOf('graze-reactor');
  const b = stateOf('graze-reactor');
  const ram = new Ram();
  putPlayerBox(ram, RAM.player1);
  putBullet(ram, 0, 0x2200, 0x1000);
  playerBox(ram, RAM.player1, { playerGrazeHook: modGameOptions(a).playerGrazeHook });
  playerBox(ram, RAM.player1, { playerGrazeHook: modGameOptions(b).playerGrazeHook });
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000200,
    'a separate mod state has no inherited grazed-slot history');
  assert.deepEqual(a.runtime.grazeCount, [1, 0]);
  assert.deepEqual(b.runtime.grazeCount, [1, 0]);
});

test('W493 both bullet allocation cores invalidate graze history across unobserved slot reuse', () => {
  for (const bank of ['A', 'B']) {
    const state = stateOf('graze-reactor');
    const game = makeGame(['graze-reactor']);
    const options = modGameOptions(state);
    const ram = game.ram;
    poolClear(ram);
    putPlayerBox(ram, RAM.player1, 0x4000, 0x2000);
    const reused = putBullet(ram, 0, 0x4200, 0x2000);
    playerBox(ram, RAM.player1, { playerGrazeHook: game.playerGrazeHook });
    assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000100);

    ram.setU16(reused, 0);
    const regs = {
      d0: 5, d1: 0x11, d2: 0x42002000, d3: 0, d4: 0, d5: 0, a5: 0,
    };
    const result = spawnCore({ ram, rom: game.rom, log: new WriteLog(ram) }, regs, bank);
    assert.equal(result.addr, reused, `bank ${bank} reallocated the same free slot`);
    ram.setU8(reused, ram.u8(reused) & ~0x51);
    ram.setU16(reused + 0x02, 0x4200);
    ram.setU16(reused + 0x04, 0x2000);
    playerBox(ram, RAM.player1, { playerGrazeHook: game.playerGrazeHook });
    assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000200,
      `bank ${bank} allocation invalidates history without an inactive playerBox scan`);

    assert.deepEqual(state.runtime.grazeCount, [0, 0],
      'a different mod runtime is not reached by this Game allocation');
    assert.equal(typeof options.bulletSpawnHook, 'function');
  }
});

test('W493 Glass Cannon removes both protection windows without a vanilla RAM policy', () => {
  const ram = new Ram();
  ram.setU8(MOD_RAM.invulnP1, 0x44);
  ram.setU8(MOD_RAM.invulnP2, 0x55);
  applyPreFrameMods(null, ram);
  applyPostFrameMods(null, ram);
  assert.deepEqual([ram.u8(MOD_RAM.invulnP1), ram.u8(MOD_RAM.invulnP2)], [0x44, 0x55]);

  const state = stateOf('glass-cannon');
  applyPreFrameMods(state, ram);
  assert.deepEqual([ram.u8(MOD_RAM.invulnP1), ram.u8(MOD_RAM.invulnP2)], [0, 0]);
  ram.setU8(MOD_RAM.invulnP1, 9);
  ram.setU8(MOD_RAM.invulnP2, 10);
  applyPostFrameMods(state, ram);
  assert.deepEqual([ram.u8(MOD_RAM.invulnP1), ram.u8(MOD_RAM.invulnP2)], [0, 0]);
});

test('W493 Glass Cannon doubles P1/P2 shot and bomb HP subtraction at resolution', () => {
  const transform = modGameOptions(stateOf('glass-cannon')).playerDamageTransform;
  const shotDamage = (table, mask, ctx = null) => {
    const ram = new Ram();
    putShot(ram, table);
    const enemy = putEnemy(ram, DMG.poolA);
    shotBoundingBox(ram, table, 0x2800);
    assert.equal(poolDamage(ram, DMG.poolA, 1, table, 0x2800, mask, 1, 'A', ctx), 1);
    return ram.u16(enemy + 0x18);
  };
  assert.equal(shotDamage(DMG.p1shots, DMG.maskP1), 0x0c00, 'vanilla shot damage is $400');
  assert.equal(shotDamage(DMG.p1shots, DMG.maskP1,
    { playerDamageTransform: transform }), 0x0800, 'P1 damage is doubled to $800');
  assert.equal(shotDamage(DMG.p2shots, DMG.maskP2,
    { playerDamageTransform: transform }), 0x0800, 'P2 uses the same actual subtraction seam');

  const bombDamage = (ctx = {}) => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8000);
    ram.setU16(BOMBRAM.rec + 0x1e, 1);
    ram.bset8(RAM.player1 + 0x01, 6);
    ram.setU16(BOMBRAM.hitMask, DMG.maskP1);
    const enemy = putEnemy(ram, BOMBRAM.poolA, 0x2000, 0x1800);
    const result = bombDamage24560A(ram, ctx, RAM.player1);
    return { hp: ram.u16(enemy + 0x18), result };
  };
  assert.deepEqual(bombDamage(), { hp: 0x0fb0, result: { hits: 1, hp: 0x50 } });
  assert.deepEqual(bombDamage({ playerDamageTransform: transform }),
    { hp: 0x0f60, result: { hits: 1, hp: 0xa0 } });

  assert.equal(transform(0xff00), 0xff00, 'negative translated damage words are unchanged');
  assert.equal(transform(0x5000), 0x7fff, 'positive doubled damage is bounded');
});

test('W493 Glass Cannon routes ramming through the same actual HP subtraction policy', () => {
  const transform = modGameOptions(stateOf('glass-cannon')).playerDamageTransform;
  const ramDamage = (extra = {}) => {
    const ram = new Ram();
    putPlayerBox(ram, RAM.player1);
    const enemy = putEnemy(ram, DMG.poolA, 0x2000, 0x1000, 0x300);
    ram.setU16(enemy, 0x8001);
    for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(enemy + offset, 0x400);
    ram.setU16(DMG.poolACount, 1);
    ram.setU16(DMG.gate308c, 1);
    ram.setU16(DMG.mirror2, 0);
    const result = runType5Tail(ram, { unportedLog: new UnportedLog(), ...extra });
    assert.equal(result.player.rammed, true);
    return ram.u16(enemy + 0x18);
  };
  assert.equal(ramDamage(), 0x2ff, 'vanilla ramming still subtracts one HP');
  assert.equal(ramDamage({ playerDamageTransform: transform }), 0x2fe,
    'Glass Cannon ramming subtracts two HP at the real enemy field');
});

test('W493 Auto Deathbomb uses the authentic bomb arm for P1/P2 and only on success', () => {
  const options = modGameOptions(stateOf('auto-deathbomb'));
  for (const side of [0, 1]) {
    const ram = new Ram();
    const rec = side === 0 ? RAM.player1 : RAM.player2;
    ram.setU16(rec, 0x9000);
    ram.setU8(rec + BOMBRAM.stockOffset, 2);
    const ctx = bombCtx(options);
    assert.equal(playerLethalHit249542(ram, rec, ctx, side), false,
      `P${side + 1} authentic bomb prevents this lethal hit`);
    assert.equal(ram.u8(rec + BOMBRAM.stockOffset), 1, 'one stocked bomb is consumed');
    assert.equal(Boolean(ram.btst8(rec + P.state, 4)), false, 'the pending hit is cleared');
    assert.equal(ram.u8(rec + P.invuln), 0xff, 'the bomb arm supplies its own protection window');
    assert.equal(ram.u16(BOMBRAM.rec), side === 0 ? 0x8000 : 0x8080,
      'the authentic bomb record identifies the firing player');
  }

  const refused = new Ram();
  refused.setU16(RAM.player1, 0x9000);
  refused.setU8(RAM.player1 + BOMBRAM.stockOffset, 0);
  assert.equal(playerLethalHit249542(refused, RAM.player1, bombCtx(options), 0), true,
    'no stock preserves the original lethal result');
  assert.equal(refused.u16(BOMBRAM.rec), 0);

  const vanilla = new Ram();
  vanilla.setU16(RAM.player1, 0x9000);
  vanilla.setU8(RAM.player1 + BOMBRAM.stockOffset, 2);
  assert.equal(playerLethalHit249542(vanilla, RAM.player1, bombCtx(), 0), true);
  assert.equal(vanilla.u8(RAM.player1 + BOMBRAM.stockOffset), 2,
    'a later vanilla hit neither consumes stock nor inherits the callback');

  const policyRam = new Ram();
  policyRam.setU8(MOD_RAM.invulnP1, 7);
  applyPreFrameMods(stateOf('auto-deathbomb'), policyRam);
  applyPostFrameMods(stateOf('auto-deathbomb'), policyRam);
  assert.equal(policyRam.u8(MOD_RAM.invulnP1), 7,
    'Auto Deathbomb does not install permanent invulnerability');
});

test('W493 Resurrection in Place captures authentic P1/P2 deaths and consumes each once', () => {
  const state = stateOf('resurrection-in-place');
  const options = modGameOptions(state);
  const sides = [
    { side: 0, ram: new Ram(), rec: RAM.player1, y: 0x3456, x: 0x2345 },
    { side: 1, ram: new Ram(), rec: RAM.player2, y: 0x5678, x: 0x4567 },
  ];

  for (const f of sides) {
    putPlayerBox(f.ram, f.rec, f.y, f.x);
    const d = f.side === 0 ? DEATH.p1 : DEATH.p2;
    f.ram.setU16(d.lives, 2);
    f.ram.setU16(d.dropGate, 0);
    f.ram.setU16(d.dropCount, 0);
    playerHit249F8A(f.ram, ALLOC.table, f.rec, deathCtx(options), f.side !== 0);
    assert.deepEqual(state.runtime.resurrectionPositions[f.side], { y: f.y, x: f.x },
      `P${f.side + 1} death initializer captures its own coordinates`);
  }

  for (const f of sides) {
    const { rec, d } = respawnEntry(f.ram, f.side, 2);
    bonusLine125FFA8(f.ram, ROM, { rom: ROM, unportedLog: new UnportedLog(), ...options }, rec);
    assert.equal(f.ram.u16(d.lives), 1, 'the authentic life decrement remains');
    assert.equal(f.ram.u16(0x8130d4), 0x78, 'the authentic respawn freeze remains');
    assert.deepEqual([
      f.ram.u16(ALLOC.createStage + 0x08),
      f.ram.u16(ALLOC.createStage + 0x0a),
    ], [f.y, f.x], `P${f.side + 1} respawn object uses only its saved death position`);
    assert.equal(state.runtime.resurrectionPositions[f.side], null, 'successful spawn consumes it');
  }

  const later = new Ram();
  const { rec } = respawnEntry(later, 0, 2, 0x1111, 0x2222);
  bonusLine125FFA8(later, ROM, { rom: ROM, unportedLog: new UnportedLog(), ...options }, rec);
  assert.deepEqual([
    later.u16(ALLOC.createStage + 0x08), later.u16(ALLOC.createStage + 0x0a),
  ], [0x1111, 0x2222], 'the one-shot cache does not move a later respawn');
});

test('W493 Resurrection in Place clears P1/P2 caches on last-life deaths', () => {
  const state = stateOf('resurrection-in-place');
  const options = modGameOptions(state);
  for (const side of [0, 1]) {
    const rec = side === 0 ? RAM.player1 : RAM.player2;
    const d = side === 0 ? DEATH.p1 : DEATH.p2;

    const earlier = new Ram();
    putPlayerBox(earlier, rec, 0x3000 + side * 0x100, 0x2000 + side * 0x100);
    earlier.setU16(d.lives, 2);
    earlier.setU16(d.dropGate, 0);
    earlier.setU16(d.dropCount, 0);
    playerHit249F8A(earlier, ALLOC.table, rec, deathCtx(options), side !== 0);
    assert.notEqual(state.runtime.resurrectionPositions[side], null,
      `P${side + 1} lives-in-hand death establishes the control cache`);

    const last = new Ram();
    putPlayerBox(last, rec, 0x5000 + side * 0x100, 0x4000 + side * 0x100);
    last.setU16(d.lives, 0);
    playerHit249F8A(last, ALLOC.table, rec, deathCtx(options), side !== 0);
    assert.equal(state.runtime.resurrectionPositions[side], null,
      `P${side + 1} last-life death clears rather than replacing the cache`);

    const entry = respawnEntry(last, side, 0).rec;
    bonusLine125FFA8(last, ROM,
      { rom: ROM, unportedLog: new UnportedLog(), ...options }, entry);
    assert.equal(last.u16(entry), 2, 'bonus line 1 takes its authentic game-over arm');
    assert.equal(state.runtime.resurrectionPositions[side], null,
      'game over leaves no position for a later run');
  }
});

test('W493 Resurrection in Place retains a saved position when allocation refuses', () => {
  const state = stateOf('resurrection-in-place');
  const options = modGameOptions(state);
  const failed = new Ram();
  putPlayerBox(failed, RAM.player1, 0x3333, 0x4444);
  failed.setU16(DEATH.p1.lives, 2);
  failed.setU16(DEATH.p1.dropGate, 0);
  playerHit249F8A(failed, ALLOC.table, RAM.player1, deathCtx(options), false);
  failed.setU16(ALLOC.createSp, ALLOC.createCap);
  const failedEntry = respawnEntry(failed, 0, 2).rec;
  bonusLine125FFA8(failed, ROM,
    { rom: ROM, unportedLog: new UnportedLog(), ...options }, failedEntry);
  assert.deepEqual(state.runtime.resurrectionPositions[0], { y: 0x3333, x: 0x4444 },
    'writing the authentic dummy record does not consume the cache');

  const retry = new Ram();
  const retryEntry = respawnEntry(retry, 0, 2).rec;
  bonusLine125FFA8(retry, ROM,
    { rom: ROM, unportedLog: new UnportedLog(), ...options }, retryEntry);
  assert.deepEqual([
    retry.u16(ALLOC.createStage + 0x08), retry.u16(ALLOC.createStage + 0x0a),
  ], [0x3333, 0x4444], 'the next successful authentic allocation consumes it');
  assert.equal(state.runtime.resurrectionPositions[0], null);
});
