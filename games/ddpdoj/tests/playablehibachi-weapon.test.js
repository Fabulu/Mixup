// Playable Hibachi enters after native Button 2 and replaces ordinary weapons.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BOMBRAM, bombDamageAlt2456A6 } from '../src/bomb.js';
import { BULLET_DRIVER, runScreenClear } from '../src/bulletdriver.js';
import { BUL, REC as BULLET_REC, poolClear } from '../src/bullets.js';
import { DMG, poolDamage, shotBoundingBox } from '../src/damage.js';
import { Game } from '../src/main.js';
import { BEAM, SEG } from '../src/laser.js';
import { P, RAM } from '../src/machine.js';
import {
  bindModGame, createModState, modGameOptions, prepareModCabinetBoot,
  resolveLoadout,
} from '../src/mods.js';
import { runMover } from '../src/mover.js';
import {
  PLAYABLE_HIBACHI_BULLET_POWER, PLAYABLE_HIBACHI_LAYOUTS,
  beginPlayableHibachiCreditedRun,
  bindPlayableHibachiGame, clearPlayableHibachiBulletOnSpawn,
  createPlayableHibachiState, filterPlayableHibachiGrazeEvent,
  playableHibachiAllowsBulletCollision, playableHibachiAllowsFriendlyConversion,
  playableHibachiBulletOwner, retirePlayableHibachiBullet,
  runPlayableHibachiDamage, stepPlayableHibachiWeapon,
} from '../src/playablehibachi.js';
import {
  bombAndShotGuards, runNativeButton2Path2497FE,
} from '../src/player.js';
import { Ram } from '../src/ram.js';
import { RUNAHEAD_EXTERNAL_STATE } from '../src/runahead-state.js';
import { SCHED, a1Stop259B08 } from '../src/scheduler.js';
import { BUCKETS, NAMED_BUCKETS } from '../src/spritequeue.js';
import { rebuildWorld25FD38 } from '../src/stageend.js';
import { makeType5, notStarted28B5A8 } from '../src/type5.js';
import { UnportedLog } from '../src/unported.js';
import { SHOT, runShotDriver } from '../src/weapons.js';
import { PS, shotHandlers } from '../src/shots.js';
import { loadBundle } from '../src/web/assets.js';
import { romToPackedMap } from '../src/web/app.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
let exactBundlePromise;
function exactBundle() {
  exactBundlePromise ??= loadBundle(async (name) => new Uint8Array(readFileSync(
    new URL(`../assets/${name}`, import.meta.url),
  )));
  return exactBundlePromise;
}
const ZERO_ROM = { u8: () => 0, u16: () => 0, u32: () => 0, i16: () => 0 };

function bench(playerIdx = 0) {
  const ram = new Ram();
  const rec = playerIdx === 0 ? RAM.player1 : RAM.player2;
  ram.setU16(rec, 0x8000);
  ram.setU8(rec + P.playerIdx, playerIdx);
  ram.setU16(rec + P.shipSel, 0);
  ram.setU16(0x8130ce, 8);
  ram.setU8(0x80380f, 1);
  const ctx = {
    rom: ZERO_ROM,
    unportedLog: new UnportedLog(),
    soundPost: () => true,
  };
  return { ram, rec, ctx };
}

function type5OptionPass(playerOptionFilter) {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const ram = game.ram;
  const log = new UnportedLog();
  const seen = [];
  ram.setU8(0x80e240 + 2, 1);
  ram.setU32(0x8132cc, 0x231704);
  const ctx = {
    ram,
    rom: game.rom,
    tables: game.tables,
    prot: game.prot,
    unportedLog: log,
    notes: log,
    unported: log,
    budget: { spend() {} },
    order: { note() {} },
    soundPost: () => true,
    shotSpawn() {},
    shotRequests() {},
    playerOptionFilter,
    privateOptionObjectHook: () => seen.push('option'),
    privateSegmentDriverHook: () => seen.push('segment'),
    privateBeamDrawHook: () => seen.push('beam'),
  };
  makeType5(game.rom)(ram, 0x80e240, 5, ctx);
  return { game, seen };
}

function playableRetireBench() {
  const mods = createModState(resolveLoadout(['playable-hibachi']));
  const game = new Game(null, TABLES, {
    palCatchUp: false,
    ...modGameOptions(mods),
  });
  bindModGame(mods, game);
  beginPlayableHibachiCreditedRun(mods.playableHibachi, game, {});
  const seen = [];
  const productionRetire = game.bulletRetireHook;
  game.bulletRetireHook = (ram, event, ctx) => {
    seen.push({
      event: { ...event },
      status: event.addr === undefined ? null : ram.u16(event.addr),
      posA: event.addr === undefined ? null : ram.u16(event.addr + 0x02),
      sameCtx: ctx === game,
    });
    productionRetire(ram, event, ctx);
  };
  return { game, mods, seen };
}

function armBeamRecord(ram) {
  ram.setU16(BOMBRAM.g12952, 0x7800);
  ram.setU16(BOMBRAM.rec, 0x8001);
  ram.setU16(BOMBRAM.rec + 0x02, 0x1000);
  ram.setU16(BOMBRAM.rec + 0x04, 0x1000);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) {
    ram.setU16(BOMBRAM.rec + offset, 0x2000);
  }
  ram.bset8(RAM.player1 + 0x01, 6);
}

function armDamageEnemy(ram, {
  enemy = DMG.poolA, y = 0x3000, x = 0x1800, hp = 0x7fff, extent = 0x0100,
} = {}) {
  ram.setU16(enemy, 0xa000);
  ram.setU16(enemy + 0x02, y);
  ram.setU16(enemy + 0x04, x);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(enemy + offset, extent);
  ram.setU16(enemy + 0x18, hp);
  return enemy;
}

const SUSTAINED_DAMAGE_FRAMES = 120;

function nativeSustainedDamage(bundle, ship) {
  const game = new Game(bundle.seed, bundle.tables, { palCatchUp: false });
  game.shotRequests = () => {};
  game.shotSpawn = () => {};
  const { ram } = game;
  const rec = RAM.player1;
  for (let slot = 0; slot < SHOT.slots; slot++) {
    for (let offset = 0; offset < SHOT.stride; offset++) {
      ram.setU8(SHOT.p1Table + slot * SHOT.stride + offset, 0);
    }
  }
  ram.setU16(rec, 0x8000);
  ram.setU8(rec + P.playerIdx, 0);
  ram.setU16(rec + P.posY, 0x3000);
  ram.setU16(rec + P.posX, 0x1800);
  ram.setU16(rec + P.shipSel, ship);
  ram.setU16(rec + PS.formation, 2);
  ram.setU16(rec + PS.power, 8);
  ram.setU8(rec + PS.powerByte, 8);
  ram.setU16(rec + PS.animPhase, 8);
  ram.setU16(rec + PS.animIdx, 4);
  ram.setU8(rec + P.dirByte, 0x40);
  ram.setU8(0x80380f, 1);
  ram.setU16(0x8130ce, 8);
  const enemy = armDamageEnemy(ram, {
    y: 0x3000, x: 0x1800, hp: 0x7fff, extent: 0x1000,
  });
  ram.setU16(DMG.gate308c, 1);
  let hits = 0;
  let maxFrameDamage = 0;
  for (let frame = 0; frame < SUSTAINED_DAMAGE_FRAMES; frame++) {
    const hp0 = ram.u16(enemy + 0x18);
    bombAndShotGuards(ram, rec, game, 0);
    runShotDriver(ram, game.rom, shotHandlers(), game);
    if (shotBoundingBox(ram, SHOT.p1Table, 0x2800)) {
      hits += poolDamage(ram, enemy, 1, SHOT.p1Table, 0x2800,
        DMG.maskP1, ram.u16(DMG.gate308c), 'A', game);
    }
    maxFrameDamage = Math.max(maxFrameDamage, hp0 - ram.u16(enemy + 0x18));
  }
  return {
    hits,
    damage: 0x7fff - ram.u16(enemy + 0x18),
    maxFrameDamage,
  };
}

function hibachiSustainedDamage() {
  const { game, mods } = playableRetireBench();
  const rec = RAM.player1;
  game.ram.setU16(rec, 0x8000);
  game.ram.setU8(rec + P.playerIdx, 0);
  game.ram.setU16(rec + P.posY, 0x3000);
  game.ram.setU16(rec + P.posX, 0x1800);
  game.ram.setU8(rec + P.dirByte, 0);
  const enemy = armDamageEnemy(game.ram, {
    y: 0x3000, x: 0x1800, hp: 0x7fff, extent: 0x1000,
  });
  game.ram.setU16(DMG.gate308c, 1);
  let hits = 0;
  let maxFrameDamage = 0;
  for (let frame = 0; frame < SUSTAINED_DAMAGE_FRAMES; frame++) {
    const hp0 = game.ram.u16(enemy + 0x18);
    assert.equal(game.playerWeaponHook(game.ram, rec, 0, game), true);
    runMover(game);
    hits += game.privateDamageTailHook(game);
    maxFrameDamage = Math.max(maxFrameDamage,
      hp0 - game.ram.u16(enemy + 0x18));
  }
  return {
    hits,
    damage: 0x7fff - game.ram.u16(enemy + 0x18),
    maxFrameDamage,
    hp: game.ram.u16(enemy + 0x18),
  };
}

test('playerWeaponHook skips native auto-shot and ordinary cadence for P1 and P2', () => {
  for (const playerIdx of [0, 1]) {
    const { ram, rec, ctx } = bench(playerIdx);
    ram.setU8(rec + P.dirByte, 0x40);
    ram.setU8(rec + P.btnByte, 0x10);
    const calls = [];
    ctx.playerWeaponHook = (...args) => calls.push(args);

    bombAndShotGuards(ram, rec, ctx, playerIdx);

    assert.equal(calls.length, 1);
    assert.strictEqual(calls[0][0], ram);
    assert.equal(calls[0][1], rec);
    assert.equal(calls[0][2], playerIdx);
    assert.strictEqual(calls[0][3], ctx);
    assert.equal(ram.u8(rec + P.flags1), 0,
      'native auto-shot does not synthesize state on the handled path');
    assert.equal(ram.u8(rec + 0x3c), 0,
      'ordinary cadence does not arm on the handled path');
  }
});

test('an inactive playerWeaponHook delegates to the exact native weapon path', () => {
  for (const stock of [0, 2]) {
    const vanilla = bench();
    const delegated = bench();
    for (const current of [vanilla, delegated]) {
      current.ram.setU8(current.rec + P.dirByte, 0x40);
      current.ram.setU8(current.rec + P.btnByte, 0x20);
      current.ram.bset8(current.rec + P.flags1, 4);
      current.ram.setU8(current.rec + BOMBRAM.stockOffset, stock);
      current.ram.setU8(current.rec + P.invuln, 0xff);
      current.ram.setU16(current.rec + P.posY, 0x2000);
      current.ram.setU16(current.rec + P.posX, 0x1800);
    }
    let activeChecks = 0;
    let weaponCalls = 0;
    delegated.ctx.playerWeaponActiveHook = () => { activeChecks++; return false; };
    delegated.ctx.playerWeaponHook = () => { weaponCalls++; return true; };

    bombAndShotGuards(vanilla.ram, vanilla.rec, vanilla.ctx, 0);
    bombAndShotGuards(delegated.ram, delegated.rec, delegated.ctx, 0);

    assert.equal(activeChecks, 1);
    assert.equal(weaponCalls, 0);
    assert.deepEqual(delegated.ram.b, vanilla.ram.b,
      `inactive Playable preserves native fire with bomb stock ${stock}`);
  }
});

test('a refused native bomb falls through to playerWeaponHook', () => {
  const { ram, rec, ctx } = bench();
  ram.setU8(rec + P.btnByte, 0x20);
  ram.setU8(rec + BOMBRAM.stockOffset, 0);
  let weapons = 0;
  const bombs = [];
  ctx.playerWeaponHook = () => { weapons++; return true; };
  ctx.bombEvent = (...event) => bombs.push(event);

  bombAndShotGuards(ram, rec, ctx, 0);

  assert.equal(weapons, 1);
  assert.deepEqual(bombs, [['press', 'no-stock']]);
});

test('a fired native bomb bypasses playerWeaponHook', () => {
  const { ram, rec, ctx } = bench();
  ram.setU8(rec + P.btnByte, 0x20);
  ram.setU8(rec + BOMBRAM.stockOffset, 2);
  ram.setU8(rec + P.invuln, 0xff);
  ram.setU16(rec + P.posY, 0x2000);
  ram.setU16(rec + P.posX, 0x1800);
  let weapons = 0;
  ctx.playerWeaponHook = () => { weapons++; };

  bombAndShotGuards(ram, rec, ctx, 0);

  assert.equal(weapons, 0);
  assert.ok((ram.u16(BOMBRAM.rec) & 0x8000) !== 0);
  assert.equal(ram.u8(rec + BOMBRAM.stockOffset), 1);
});

test('Game validates and runahead admits every Playable Hibachi callback', () => {
  const callbacks = Object.fromEntries([
    'playerWeaponHook', 'playerWeaponActiveHook', 'playerOptionFilter',
    'playerSpriteFilter', 'bulletRetireHook', 'deathPositionCapture',
    'virtualSpriteRequestHook',
    'privateDamageTailHook',
  ].map((name) => [name, () => {}]));
  let restored = false;
  const adapter = {
    callbacks,
    save: () => 17,
    restore: (token) => { restored = token === 17; },
  };
  const game = new Game(null, TABLES, {
    palCatchUp: false,
    ...callbacks,
    [RUNAHEAD_EXTERNAL_STATE]: adapter,
  });
  for (const [name, callback] of Object.entries(callbacks)) {
    assert.strictEqual(game[name], callback);
    assert.throws(() => new Game(null, TABLES, {
      palCatchUp: false,
      [name]: true,
    }), new RegExp(`Game ${name} must be a function`));
  }
  const checkpoint = game.saveRunaheadState(1);
  game.restoreRunaheadState(checkpoint);
  assert.equal(restored, true);
});

test('credited activation purges every queued native player and option remnant', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  for (const pool of [SHOT.p1Table, SHOT.p2Table]) {
    for (let slot = 0; slot < SHOT.slots; slot++) {
      game.ram.setU16(pool + slot * SHOT.stride, 0x8000 | slot);
    }
  }
  game.ram.setU16(SHOT.liveCount, 72);
  for (const beam of BEAM) {
    game.ram.setU16(beam.rec, 0x8000);
    game.ram.setU16(beam.blk, 0x8000);
    game.ram.setU16(beam.blk + 0x16, 0x8000);
    for (let slot = 0; slot < SEG.slots; slot++) {
      game.ram.setU16(beam.pool + slot * SEG.stride, 0x8000 | slot);
    }
  }
  game.ram.setU16(RAM.p1Options, 0x8000);
  game.ram.setU16(RAM.p2Options, 0x8000);
  const playerBuckets = [
    NAMED_BUCKETS.shadows, NAMED_BUCKETS.trail, NAMED_BUCKETS.shots,
    NAMED_BUCKETS.options, NAMED_BUCKETS.beam, NAMED_BUCKETS.player,
  ];
  for (const bucket of playerBuckets) game.ram.setU16(BUCKETS[bucket].counter, 12);

  beginPlayableHibachiCreditedRun(state, game, {});

  for (const pool of [SHOT.p1Table, SHOT.p2Table]) {
    assert.ok(Array.from({ length: SHOT.slots }, (_, slot) =>
      game.ram.u16(pool + slot * SHOT.stride)).every((type) => type === 0));
  }
  assert.equal(game.ram.u16(SHOT.liveCount), 0);
  for (const beam of BEAM) {
    assert.equal(game.ram.u16(beam.rec), 0);
    assert.equal(game.ram.u16(beam.blk), 0);
    assert.equal(game.ram.u16(beam.blk + 0x16), 0);
    assert.ok(Array.from({ length: SEG.slots }, (_, slot) =>
      game.ram.u16(beam.pool + slot * SEG.stride)).every((type) => type === 0));
  }
  assert.equal(game.ram.u16(RAM.p1Options), 0);
  assert.equal(game.ram.u16(RAM.p2Options), 0);
  assert.ok(playerBuckets.every((bucket) => game.ram.u16(BUCKETS[bucket].counter) === 0),
    'the handoff removes a ship or pod queued earlier in the same logic frame');
});

test('Playable Hibachi suppresses the complete native option and beam call family', () => {
  const mods = createModState(resolveLoadout(['playable-hibachi']));
  prepareModCabinetBoot(mods);
  const game = new Game(null, TABLES, {
    palCatchUp: false,
    ...modGameOptions(mods),
  });
  bindModGame(mods, game);
  assert.equal(game.playerOptionFilter(game.ram, game), true,
    'the cabinet front end retains its native presentation');
  game.cabinetRunStartHook(game.ram, { demo: false });
  assert.equal(game.playerOptionFilter(game.ram, game), false);

  let checks = 0;
  const suppressed = type5OptionPass((ram, ctx) => {
    checks++;
    return game.playerOptionFilter(ram, ctx);
  });
  assert.equal(checks, 1, 'one predicate controls all three consecutive native calls');
  assert.deepEqual(suppressed.seen, []);
  assert.equal(suppressed.game.ram.u16(BUCKETS[NAMED_BUCKETS.options].counter), 0);
  assert.equal(suppressed.game.ram.u16(BUCKETS[NAMED_BUCKETS.beam].counter), 0);

  game.cabinetRunEndHook(game.ram);
  assert.equal(game.playerOptionFilter(game.ram, game), true);
  assert.deepEqual(type5OptionPass(game.playerOptionFilter).seen,
    ['option', 'segment', 'beam'],
    'inactive Playable keeps the exact native type-5 family');
});

test('native death capture resets each Playable Hibachi life without crossing owners', () => {
  const mods = createModState(resolveLoadout([
    'resurrection-in-place', 'playable-hibachi',
  ]));
  prepareModCabinetBoot(mods);
  const game = new Game(null, TABLES, {
    palCatchUp: false,
    ...modGameOptions(mods),
  });
  bindModGame(mods, game);
  game.cabinetRunStartHook(game.ram, { demo: false });
  const playable = mods.playableHibachi;
  const records = [RAM.player1, RAM.player2];
  for (let side = 0; side < 2; side++) {
    const rec = records[side];
    game.ram.setU16(rec, 0x8000);
    game.ram.setU16(rec + P.posY, 0x3000 + side * 0x100);
    game.ram.setU16(rec + P.posX, 0x1800 + side * 0x100);
    assert.equal(game.playerWeaponHook(game.ram, rec, side, game), true);
    playable.players[side].runtime.frames = 7 + side;
    playable.players[side].runtime.presentationFrames = 11 + side;
    playable.players[side].runtime.presentationStarted = true;
  }
  const slots = [3, 4];
  for (let side = 0; side < 2; side++) {
    const bullet = BUL.pool + slots[side] * BUL.stride;
    playable.ownedBullets[slots[side]] = side + 1;
    game.ram.setU16(bullet, 0x8000);
    game.ram.setU16(bullet + BULLET_REC.posA, 0x2400 + side * 0x100);
  }

  game.deathPositionCapture(game.ram, 0, 0x3100, 0x1900, true);

  assert.deepEqual(playable.players[0].runtime, {
    bodyInitialized: false,
    initialized: false,
    retired: false,
    live: false,
    lifeIdentity: 1,
    gun: -1,
    frames: 0,
    presentationFrames: 0,
    presentationStarted: false,
    launchActive: false,
    launchY: 0,
    launchX: 0,
  });
  assert.ok(playable.players[0].bytes.every((byte) => byte === 0));
  assert.equal(playable.selectedGuns[0], -1);
  assert.equal(playable.players[1].runtime.live, true);
  assert.equal(playable.players[1].runtime.presentationFrames, 12);
  assert.equal(playable.players[1].runtime.presentationStarted, true);
  assert.equal(playable.ownedBullets[slots[0]], 0);
  assert.equal(game.ram.u16(BUL.pool + slots[0] * BUL.stride), 0);
  assert.equal(game.ram.u16(BUL.pool + slots[0] * BUL.stride + BULLET_REC.posA), 0xffff);
  assert.equal(playable.ownedBullets[slots[1]], 2);
  assert.equal(game.ram.u16(BUL.pool + slots[1] * BUL.stride), 0x8000);
  assert.deepEqual(game.respawnPositionTransform(
    game.ram, 0, 0x6000, 0x2000), { y: 0x3100, x: 0x1900 });

  assert.equal(game.playerWeaponHook(game.ram, RAM.player1, 0, game), true);
  assert.equal(playable.players[0].runtime.lifeIdentity, 2);
  assert.equal(playable.players[0].runtime.presentationFrames, 0);
  game.deathPositionCapture(game.ram, 1, 0x3200, 0x1a00, true);
  assert.equal(playable.players[1].runtime.live, false);
  assert.equal(playable.players[1].runtime.lifeIdentity, 1);
  assert.equal(playable.players[1].runtime.presentationFrames, 0);
  assert.equal(playable.ownedBullets[slots[1]], 0);
  assert.equal(playable.players[0].runtime.live, true);
  assert.equal(game.playerWeaponHook(game.ram, RAM.player2, 1, game), true);
  assert.equal(playable.players[1].runtime.lifeIdentity, 2);
  assert.equal(playable.players[1].runtime.presentationFrames, 0);
});

test('native Button 2 path validates ownership and reports only fired bombs', () => {
  const { ram, rec, ctx } = bench();
  assert.equal(runNativeButton2Path2497FE(ram, rec, ctx, 0), false);
  assert.throws(() => runNativeButton2Path2497FE(ram, rec, ctx, 2),
    /outside \{0, 1\}/);
});

test('Playable Hibachi A5 and A6 geometry covers authentic gun accesses', () => {
  const state = createPlayableHibachiState();
  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    const memory = state.players[playerIdx].memory;
    const layout = PLAYABLE_HIBACHI_LAYOUTS[playerIdx];
    memory.setU32(layout.body + 0x06, layout.parts);
    for (const offset of [0x20, 0x60, 0xc0, 0x140, 0x1ee]) {
      memory.setU16(layout.parts + offset, 0x5100 | playerIdx);
      assert.equal(memory.u16(layout.parts + offset), 0x5100 | playerIdx);
    }
    assert.throws(() => memory.u16(layout.parts + 0x1ff), /crosses/);
  }
});

test('Playable Hibachi selects normal and hyper guns for P1 and P2', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const enemy = DMG.poolA;
  game.ram.setU16(enemy, 0xa000);
  game.ram.setU16(enemy + 0x02, 0x2400);
  game.ram.setU16(enemy + 0x04, 0x1700);
  game.ram.setU16(enemy + 0x18, 10);

  const selections = [
    [RAM.player1, 0, 0x00, 0, 0],
    [RAM.player1, 0, 0x10, 0, 1],
    [RAM.player1, 0, 0x50, 0, 2],
    [RAM.player1, 0, 0x40, 0, 3],
    [RAM.player1, 0, 0x40, 1, 8],
    [RAM.player2, 1, 0x10, 1, 6],
  ];
  for (const [rec, playerIdx, held, hyper, expected] of selections) {
    game.ram.setU16(rec, 0x8000);
    game.ram.setU16(rec + P.posY, 0x3000 + playerIdx * 0x100);
    game.ram.setU16(rec + P.posX, 0x1800 + playerIdx * 0x100);
    game.ram.setU8(rec + P.dirByte, held);
    game.ram.setU16(playerIdx === 0 ? 0x81b63e : 0x81b640, hyper);
    const presentationFrames = state.players[playerIdx].runtime.presentationFrames;
    assert.equal(stepPlayableHibachiWeapon(
      state, game.ram, rec, playerIdx, { rom: game.rom }), true);
    assert.equal(state.selectedGuns[playerIdx], expected);
    assert.equal(state.players[playerIdx].runtime.gun, expected);
    assert.equal(state.players[playerIdx].runtime.presentationFrames, presentationFrames,
      'SHOT/AUTO and hyper changes cannot restart the small-form animation');
  }

  game.ram.setU16(RAM.player1, 0);
  assert.equal(stepPlayableHibachiWeapon(
    state, game.ram, RAM.player1, 0, { rom: game.rom }), false);
  game.ram.setU16(RAM.player1, 0x8000);
  assert.equal(stepPlayableHibachiWeapon(
    state, game.ram, RAM.player1, 0, { rom: game.rom }), true);
  assert.equal(state.players[0].runtime.presentationFrames, 0,
    'a new life restarts the small-form animation');

  const p1 = state.players[0];
  assert.equal(p1.memory.u32(p1.layout.body + 0x06), p1.layout.parts);
  assert.equal(p1.memory.u16(p1.layout.target + 0x02), 0x3c00);
  assert.equal(p1.memory.u16(p1.layout.target + 0x04), 0x1900);
});

test('enemy-free aimed repertoire never falls back to native player targets', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const rec = RAM.player1;
  game.ram.setU16(rec, 0x8000);
  game.ram.setU16(rec + P.posY, 0x3000);
  game.ram.setU16(rec + P.posX, 0x1800);
  game.ram.setU8(rec + P.dirByte, 0x10);
  game.ram.setU16(RAM.player2, 0x8000);
  game.ram.setU16(RAM.player2 + P.posY, 0x2000);
  game.ram.setU16(RAM.player2 + P.posX, 0x2800);
  const shots = [];
  const ctx = { rom: game.rom, bulletSpawn: (site) => shots.push(site) };

  assert.equal(stepPlayableHibachiWeapon(state, game.ram, rec, 0, ctx), true);
  state.players[0].memory.setU8(state.players[0].layout.gun + 0x02, 0);
  assert.equal(stepPlayableHibachiWeapon(state, game.ram, rec, 0, ctx), true);

  assert.equal(state.selectedGuns[0], 1);
  assert.deepEqual(shots, [],
    'an explicit no-enemy target cannot inherit P1 or P2 from the native gun helper');
  assert.equal(state.ownedBullets.some(Boolean), false);
});

test('Playable Hibachi claims, reflects, reuses, and retires spawned bullets', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const rec = RAM.player1;
  game.ram.setU16(rec, 0x8000);
  game.ram.setU16(rec + P.posY, 0x3000);
  game.ram.setU16(rec + P.posX, 0x1800);
  game.ram.setU8(rec + P.dirByte, 0);
  const telemetry = [];
  const ctx = { rom: game.rom, bulletSpawn: (...args) => telemetry.push(args) };
  stepPlayableHibachiWeapon(state, game.ram, rec, 0, ctx);
  state.players[0].memory.setU8(state.players[0].layout.gun + 0x02, 0);
  stepPlayableHibachiWeapon(state, game.ram, rec, 0, ctx);

  const slot = state.ownedBullets.findIndex((owner) => owner === 1);
  assert.ok(slot >= 0, 'an authentic gun spawn is assigned to P1');
  assert.ok(telemetry.length > 0, 'ordinary Hibachi telemetry is preserved');
  const addr = BUL.pool + slot * BUL.stride;
  assert.equal(playableHibachiBulletOwner(state, addr), 1);
  assert.equal(game.ram.u8(addr + BULLET_REC.origDir),
    game.ram.u8(addr + BULLET_REC.dir));

  clearPlayableHibachiBulletOnSpawn(state, { slot });
  assert.equal(playableHibachiBulletOwner(state, addr), 0);
  state.ownedBullets[slot] = 2;
  retirePlayableHibachiBullet(state, { addr });
  assert.equal(state.ownedBullets[slot], 0);
  state.ownedBullets.fill(1);
  retirePlayableHibachiBullet(state, { all: true });
  assert.equal(state.ownedBullets.some(Boolean), false);
});

test('every native bullet retirement producer clears Playable ownership with exact context', () => {
  const slot = 3;
  const addr = BUL.pool + slot * BUL.stride;
  const y = 0x2100;
  const x = 0x1800;
  const cases = [
    {
      name: 'mover',
      expected: { addr, slot, reason: 'mover', y, x },
      before: [0x9000, y],
      run(game) {
        game.ram.setU16(addr, 0x9000);
        game.ram.setU16(addr + 0x02, y);
        game.ram.setU16(addr + 0x04, x);
        runMover(game);
      },
    },
    {
      name: 'screen clear',
      expected: { addr, slot, reason: 'screen-clear', y, x },
      before: [0, 0xffff],
      run(game) {
        game.ram.setU16(BULLET_DRIVER.armWord, 1);
        game.ram.setU16(BULLET_DRIVER.modeWord, 0);
        game.ram.setU16(addr, 0x8000);
        game.ram.setU16(addr + 0x02, y);
        game.ram.setU16(addr + 0x04, x);
        runScreenClear(game);
      },
    },
    {
      name: 'laser bomb',
      expected: { addr, slot, reason: 'laser-bomb', y, x },
      before: [0, 0xffff],
      run(game) {
        armBeamRecord(game.ram);
        for (let index = 0; index < BUL.slots; index++) {
          game.ram.setU16(BUL.pool + index * BUL.stride + 0x02, 0xffff);
        }
        game.ram.setU16(addr, 0x1234);
        game.ram.setU16(addr + 0x02, y);
        game.ram.setU16(addr + 0x04, x);
        bombDamageAlt2456A6(game.ram, game, RAM.player1);
      },
    },
    {
      name: 'direct pool clear',
      expected: { all: true, reason: 'pool-clear' },
      before: [null, null],
      run(game) { poolClear(game.ram, game); },
    },
    {
      name: 'type-5 reset',
      expected: { all: true, reason: 'pool-clear' },
      before: [null, null],
      run(game) { notStarted28B5A8(game.ram, game.rom, game); },
    },
    {
      name: 'stage-end rebuild',
      expected: { all: true, reason: 'pool-clear' },
      before: [null, null],
      run(game) { rebuildWorld25FD38(game.ram, game); },
    },
  ];

  for (const scenario of cases) {
    const { game, mods, seen } = playableRetireBench();
    mods.playableHibachi.ownedBullets[slot] = 1;
    scenario.run(game);
    assert.equal(seen.length, 1, `${scenario.name} retires exactly once`);
    assert.deepEqual(seen[0].event, scenario.expected, `${scenario.name} event`);
    assert.deepEqual([seen[0].status, seen[0].posA], scenario.before,
      `${scenario.name} preserves its native callback ordering`);
    assert.equal(seen[0].sameCtx, true, `${scenario.name} forwards producer context`);
    assert.equal(mods.playableHibachi.ownedBullets[slot], 0,
      `${scenario.name} clears external ownership`);
  }
});

test('private A1 retirement cannot clear a matching native scheduler slot', () => {
  const ram = new Ram();
  ram.setU16(SCHED.a1Base, 0x8003);
  const seen = [];
  a1Stop259B08(ram, 3, {
    privateA1StopHook: (script) => { seen.push(script); return true; },
  });
  assert.deepEqual(seen, [3]);
  assert.equal(ram.u16(SCHED.a1Base), 0x8003);
  a1Stop259B08(ram, 3);
  assert.equal(ram.u16(SCHED.a1Base), 0);
});

test('owned bullets cannot graze, hit players, or convert to friendly shots', () => {
  const state = createPlayableHibachiState();
  const owned = BUL.pool + 3 * BUL.stride;
  const hostile = BUL.pool + 4 * BUL.stride;
  state.ownedBullets[3] = 1;
  assert.equal(playableHibachiAllowsBulletCollision(state, { bullet: owned }), false);
  assert.equal(playableHibachiAllowsBulletCollision(state, { bullet: hostile }), true);
  assert.equal(playableHibachiAllowsFriendlyConversion(state, { bullet: owned }), false);
  assert.equal(playableHibachiAllowsFriendlyConversion(state, { bullet: hostile }), true);
  assert.deepEqual(filterPlayableHibachiGrazeEvent(state, {
    player: RAM.player1, live: [owned, hostile], near: [owned, hostile],
  }), {
    player: RAM.player1, live: [hostile], near: [hostile],
  });
});

test('owned P1 and P2 bullets use native damage receipts and retire finitely', () => {
  for (const [slot, owner, mask] of [
    [5, 1, DMG.maskP1],
    [6, 2, DMG.maskP2],
  ]) {
    const { game, mods } = playableRetireBench();
    const state = mods.playableHibachi;
    const enemy = armDamageEnemy(game.ram, { hp: 0x4000 });
    game.ram.setU16(DMG.gate308c, 1);
    const bullet = BUL.pool + slot * BUL.stride;
    state.ownedBullets[slot] = owner;
    game.ram.setU16(bullet, 0x8000);
    game.ram.setU16(bullet + BULLET_REC.posA, 0x3000);
    game.ram.setU16(bullet + BULLET_REC.posB, 0x1800);

    assert.equal(game.privateDamageTailHook(game), 1);
    assert.equal(game.ram.u16(enemy + 0x18), 0x4000 - PLAYABLE_HIBACHI_BULLET_POWER);
    assert.ok((game.ram.u16(enemy) & mask) !== 0);
    assert.ok((game.ram.u16(bullet) & 0x1000) !== 0);
    assert.equal(game.privateDamageTailHook(game), 0,
      'the kill receipt prevents a second HP debit');

    runMover(game);
    assert.equal(game.ram.u16(bullet), 0, 'the native mover frees a hit projectile');
    assert.equal(state.ownedBullets[slot], 0,
      'the native retirement callback clears external ownership');
  }
});

test('all launch and second-form guns produce real damage and finite bullets', () => {
  const attacks = [
    { gun: 0, held: 0x00, hyper: 0, deadline: 34 },
    { gun: 1, held: 0x10, hyper: 0, deadline: 34 },
    { gun: 2, held: 0x50, hyper: 0, deadline: 34 },
    { gun: 3, held: 0x40, hyper: 0, deadline: 34 },
    { gun: 5, held: 0x00, hyper: 1, deadline: 34 },
    { gun: 6, held: 0x10, hyper: 1, deadline: 34 },
    { gun: 7, held: 0x50, hyper: 1, deadline: 98 },
    { gun: 8, held: 0x40, hyper: 1, deadline: 98 },
  ];

  for (const attack of attacks) {
    const { game, mods } = playableRetireBench();
    const state = mods.playableHibachi;
    const rec = RAM.player1;
    game.ram.setU16(rec, 0x8000);
    game.ram.setU16(rec + P.posY, 0x3000);
    game.ram.setU16(rec + P.posX, 0x1800);
    game.ram.setU8(rec + P.dirByte, attack.held);
    game.ram.setU16(DMG.hyper1, attack.hyper);
    const enemy = armDamageEnemy(game.ram, { y: 0x2400, x: 0x1700 });

    let frames = 0;
    while (frames < attack.deadline && !state.ownedBullets.some(Boolean)) {
      assert.equal(game.playerWeaponHook(game.ram, rec, 0, game), true);
      frames++;
    }
    assert.equal(state.selectedGuns[0], attack.gun);
    assert.ok(state.ownedBullets.some((owner) => owner === 1),
      `gun ${attack.gun} must produce a P1 projectile by frame ${attack.deadline}`);
    for (let slot = 0; slot < state.ownedBullets.length; slot++) {
      if (state.ownedBullets[slot] !== 1) continue;
      const bullet = BUL.pool + slot * BUL.stride;
      assert.equal(game.ram.u16(bullet + BULLET_REC.posA), 0x3000,
        `gun ${attack.gun} projectile ${slot} starts at the visible body's Y`);
      assert.equal(game.ram.u16(bullet + BULLET_REC.posB), 0x1800,
        `gun ${attack.gun} projectile ${slot} starts at the visible body's X`);
    }
    if (attack.gun === 0) {
      assert.equal(state.players[0].runtime.bodyInitialized, true,
        'the first form exists on the launch frame');
      assert.equal(state.players[0].memory.u16(state.players[0].layout.parts), 0x8000);
    }

    const firstSlot = state.ownedBullets.findIndex((owner) => owner === 1);
    const firstBullet = BUL.pool + firstSlot * BUL.stride;
    game.ram.setU16(enemy + 0x02, game.ram.u16(firstBullet + BULLET_REC.posA));
    game.ram.setU16(enemy + 0x04, game.ram.u16(firstBullet + BULLET_REC.posB));
    game.ram.setU16(enemy + 0x18, 0x7fff);
    for (const offset of [0x10, 0x12, 0x14, 0x16]) game.ram.setU16(enemy + offset, 0x20);
    game.ram.setU16(DMG.gate308c, 1);

    const hits = game.privateDamageTailHook(game);
    assert.ok(hits >= 1, `gun ${attack.gun} must debit real enemy HP`);
    assert.equal(game.ram.u16(enemy + 0x18),
      0x7fff - hits * PLAYABLE_HIBACHI_BULLET_POWER);
    assert.ok((game.ram.u16(enemy) & DMG.maskP1) !== 0);
    const killed = [...state.ownedBullets].flatMap((owner, slot) =>
      owner !== 0 && (game.ram.u16(BUL.pool + slot * BUL.stride) & 0x1000) !== 0
        ? [slot] : []);
    assert.equal(killed.length, hits);

    runMover(game);
    for (const slot of killed) {
      assert.equal(game.ram.u16(BUL.pool + slot * BUL.stride), 0,
        `gun ${attack.gun} bullet ${slot} must free on the next mover pass`);
      assert.equal(state.ownedBullets[slot], 0);
    }
  }
});

test('120 sustained frames materially beat stock Type-A and Type-B without boss erasure',
  async () => {
    const bundle = await exactBundle();
    const typeA = nativeSustainedDamage(bundle, 0);
    const typeB = nativeSustainedDamage(bundle, 2);
    const hibachi = hibachiSustainedDamage();

    assert.deepEqual(typeA, { hits: 172, damage: 11180, maxFrameDamage: 130 });
    assert.deepEqual(typeB, { hits: 172, damage: 9804, maxFrameDamage: 114 });
    assert.deepEqual(hibachi, {
      hits: 114, damage: 29184, maxFrameDamage: 16896, hp: 3583,
    });
    assert.ok(hibachi.damage > typeA.damage * 2,
      'Hibachi sustained output is more than twice Type-A');
    assert.ok(hibachi.damage > typeB.damage * 2,
      'Hibachi sustained output is more than twice Type-B');
    assert.ok(hibachi.hp < 0x7fff,
      'the sustained run proves actual enemy HP reduction');
    assert.ok(hibachi.maxFrameDamage < 0x7fff,
      'even Hibachi\'s densest collision frame cannot erase boss-scale HP');
  });

test('published bundle drives credited Playable Hibachi combat and art', async () => {
  const bundle = await exactBundle();
  const mods = createModState(resolveLoadout(['playable-hibachi']));
  prepareModCabinetBoot(mods);
  const game = new Game(null, bundle.tables, {
    palCatchUp: false,
    ...modGameOptions(mods),
  });
  bindModGame(mods, game);
  assert.equal(game.playerWeaponActiveHook(game.ram, RAM.player1, 0, game), false);
  game.cabinetRunStartHook(game.ram, { demo: false });

  assert.deepEqual(mods.playableHibachi.lifecycle, {
    bound: true, pending: false, active: true, credited: true, generation: 1,
  });
  const rec = RAM.player1;
  game.ram.setU16(rec, 0x8000);
  game.ram.setU16(rec + P.posY, 0x3000);
  game.ram.setU16(rec + P.posX, 0x1800);
  game.ram.setU8(rec + P.dirByte, 0);
  const enemy = DMG.poolA;
  game.ram.setU16(enemy, 0xa000);
  game.ram.setU16(enemy + 0x02, 0x3000);
  game.ram.setU16(enemy + 0x04, 0x1800);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) {
    game.ram.setU16(enemy + offset, 0x100);
  }
  game.ram.setU16(enemy + 0x18, 0x4000);

  let weaponCalls = 0;
  while (weaponCalls < 64 && !mods.playableHibachi.ownedBullets.some(Boolean)) {
    assert.equal(game.playerWeaponHook(game.ram, rec, 0, game), true);
    weaponCalls++;
  }
  assert.equal(weaponCalls, 34, 'published gun 0 data preserves its authentic cadence');
  const ownedSlots = [...mods.playableHibachi.ownedBullets]
    .flatMap((owner, slot) => owner ? [slot] : []);
  assert.equal(ownedSlots.length, 12,
    'authentic gun cadence creates its radial salvo without fire held');
  const slot = ownedSlots[0];
  const bullet = BUL.pool + slot * BUL.stride;
  assert.equal(mods.playableHibachi.selectedGuns[0], 0);
  assert.equal(mods.playableHibachi.ownedBullets[slot], 1);
  assert.equal(game.ram.u8(bullet + BULLET_REC.dir), 4);
  assert.equal(game.ram.u8(bullet + BULLET_REC.origDir), 4);
  assert.equal(game.ram.u16(bullet + BULLET_REC.posA), 0x3000);
  assert.equal(game.ram.u16(bullet + BULLET_REC.posB), 0x1800);

  const requests = game.virtualSpriteRequestHook(game);
  const packed = romToPackedMap(
    bundle.manifest, (base) => bundle.spr.shardOfBase(base),
  );
  const artAddress = (request) => new DataView(
    request.bytes.buffer, request.bytes.byteOffset, request.bytes.byteLength,
  ).getUint32(4, false);
  assert.equal(requests.length, 1);
  assert.equal(artAddress(requests[0]), 0x00117c10);
  assert.ok(packed.has(artAddress(requests[0])),
    'the authentic small form resolves in the published sprite manifest');
  const formView = new DataView(
    requests[0].bytes.buffer, requests[0].bytes.byteOffset, requests[0].bytes.byteLength,
  );
  assert.equal(formView.getUint16(8, false), 0x0c38);
  assert.equal(formView.getUint16(10, false), 0x6017);
  assert.equal(requests[0].privatePaletteBank, 7);

  game.ram.setU16(enemy + 0x02, game.ram.u16(bullet + BULLET_REC.posA));
  game.ram.setU16(enemy + 0x04, game.ram.u16(bullet + BULLET_REC.posB));
  game.ram.setU16(DMG.gate308c, 1);
  const hits = game.privateDamageTailHook(game);
  assert.equal(hits, 12,
    'every radial projectile starts at the visible body and reaches the centered enemy');
  assert.equal(game.ram.u16(enemy + 0x18),
    0x4000 - hits * PLAYABLE_HIBACHI_BULLET_POWER);
  assert.ok((game.ram.u16(enemy) & DMG.maskP1) !== 0);
  assert.equal(ownedSlots.filter((ownedSlot) =>
    (game.ram.u16(BUL.pool + ownedSlot * BUL.stride) & 0x1000) !== 0).length, hits);
  assert.equal(game.privateDamageTailHook(game), 0,
    'one authentic salvo produces one damage receipt per colliding bullet');
  game.cabinetRunEndHook(game.ram);
  assert.equal(game.playerWeaponActiveHook(game.ram, RAM.player1, 0, game), false);
});
