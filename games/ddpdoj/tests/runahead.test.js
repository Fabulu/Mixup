import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { projectRunahead, RunaheadProjectionError } from '../src/runahead.js';
import { RUNAHEAD_EXTERNAL_STATE } from '../src/runahead-state.js';
import {
  createModState,
  modGameOptions,
  resolveLoadout,
} from '../src/mods.js';
import { COIN } from '../src/isr.js';
import { SOUND, postWrapper } from '../src/sound.js';

const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const seed = new Uint8Array(readFileSync(SEED));
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));

function game(options = {}) {
  return new Game(seed, tables, { palCatchUp: false, ...options });
}

function values(g) {
  return {
    ram: g.ram.b,
    scalars: [
      g.logicFrame, g.videoFrame, g.irq6Count, g.releases, g.objn,
      g.armedVblanks, g.coinPort, g.bombHits, g.beamHitsA, g.beamHitsB,
      g.beamErased, g.beamDamageFrames, g.bombDraws, g.shotTableFull,
      g.shotRequests,
    ],
    maps: {
      allocEvents: g.allocEvents,
      bulletSpawns: g.bulletSpawns,
      bulletKinds: g.bulletKinds,
      effectSpawns: g.effectSpawns,
      itemSpawns: g.itemSpawns,
      itemCollects: g.itemCollects,
      hudEvents: g.hudEvents,
      bombEvents: g.bombEvents,
      killValues: g.kills.byValue,
      shotSpawns: g.shotSpawns,
      unported: g.unportedLog.calls,
      paletteInstalls: g.palette.installs,
    },
    arrays: {
      scrollEvents: g.scrollEvents,
      wallHits: g.wallHits,
      stageEndEvents: g.stageEndEvents,
      hudMarks: g.hudMarks,
      bombMarks: g.bombMarks,
      soundDoorLog: g.sound.doorLog,
      soundShadow: g.sound.shadow,
      streamingResolvers: g.sound.streamingResolvers,
    },
    frame: Object.fromEntries([
      'frameRequests', 'frameRequestsOther', 'effectFrame', 'itemFrame',
      'enemyFrame', 'bulletFrame', 'damageFrame', 'trailRecords',
      'beamImpacts', 'animFrame', 'bucket2Bytes', 'staged', 'displayList',
      'paletteFlush', 'soundFrame', 'soundInput',
    ].map((name) => [name, {
      present: Object.hasOwn(g, name),
      value: g[name],
    }])),
    kills: { n: g.kills.n, score: g.kills.score },
    budget: { spent: g.budget.spent, exhaustedFrames: g.budget.exhaustedFrames },
    prot: { slot: g.prot.slot, written: g.prot.written },
    order: { h: g.order.h, n: g.order.n },
    vram: {
      words: g.vram.w,
      columnsWritten: g.vram.columnsWritten,
      streamPtr: g.vram.streamPtr,
    },
    tx: g.txvram.w,
    slots: g.slotTable.w,
    video: {
      bg_scale: g.video.bg_scale,
      bg_yscroll: g.video.bg_yscroll,
      bg_xscroll: g.video.bg_xscroll,
      tx_yscroll: g.video.tx_yscroll,
      tx_xscroll: g.video.tx_xscroll,
      ctrl: g.video.ctrl,
    },
    palette: {
      words: g.palette.words,
      sourced: g.palette.sourced,
      spr: g.palette.stageSourced.spr,
      bg: g.palette.stageSourced.bg,
      tx: g.palette.stageSourced.tx,
      installCount: g.palette.installCount,
      flushes: g.palette.flushes,
      copies: g.palette.copies,
      lastFade: g.palette.lastFade,
    },
    sound: {
      frameDoors: g.sound.frameDoors,
      framePosts: g.sound.framePosts,
      frameDrops: g.sound.frameDrops,
      digest: g.sound.digest,
      postCount: g.sound.postCount,
      dropCount: g.sound.dropCount,
      doorCount: g.sound.doorCount,
    },
  };
}

function identities(g) {
  return {
    ram: g.ram,
    bytes: g.ram.b,
    buffer: g.ram.b.buffer,
    dataView: g.ram.dv,
    budget: g.budget,
    prot: g.prot,
    protSlot: g.prot.slot,
    protWritten: g.prot.written,
    unported: g.unportedLog,
    unportedCalls: g.unportedLog.calls,
    order: g.order,
    vram: g.vram,
    vramWords: g.vram.w,
    tx: g.txvram,
    txWords: g.txvram.w,
    slotTable: g.slotTable,
    slotWords: g.slotTable.w,
    video: g.video,
    palette: g.palette,
    paletteWords: g.palette.words,
    paletteSourced: g.palette.sourced,
    paletteStage: g.palette.stageSourced,
    paletteSpr: g.palette.stageSourced.spr,
    paletteBg: g.palette.stageSourced.bg,
    paletteTx: g.palette.stageSourced.tx,
    paletteCopies: g.palette.copies,
    paletteInstalls: g.palette.installs,
    sound: g.sound,
    maps: [
      g.allocEvents, g.bulletSpawns, g.bulletKinds, g.effectSpawns,
      g.itemSpawns, g.itemCollects, g.hudEvents, g.bombEvents,
      g.kills.byValue, g.shotSpawns,
    ],
    arrays: [g.scrollEvents, g.wallHits, g.stageEndEvents, g.hudMarks, g.bombMarks],
  };
}

test('one through three speculative frames restore every public simulation owner in place', async (t) => {
  for (const depth of [1, 2, 3]) {
    await t.test(`${depth} frame(s)`, () => {
      const g = game();
      const spawnRecord = { fired: 2, spawned: 1, declined: 0, dropped: 1 };
      const kindRecord = { addr: 0x282000, n: 3 };
      const installRecord = { n: 4, bank: 7 };
      g.bulletSpawns.set('seed', spawnRecord);
      g.bulletKinds.set(2, kindRecord);
      g.palette.installs.set('seed', installRecord);
      delete g.effectFrame;
      delete g.itemFrame;

      const before = structuredClone(values(g));
      const owners = identities(g);
      const frameRequests = g.frameRequests;
      const soundInput = g.soundInput;
      const checkpoint = g.saveRunaheadState(depth);
      try {
        for (let frame = 0; frame < depth; frame++) g.step(0xffff);
      } finally {
        g.restoreRunaheadState(checkpoint);
      }

      assert.deepEqual(values(g), before);
      assert.deepEqual(identities(g), owners);
      assert.strictEqual(g.bulletSpawns.get('seed'), spawnRecord);
      assert.strictEqual(g.bulletKinds.get(2), kindRecord);
      assert.strictEqual(g.palette.installs.get('seed'), installRecord);
      assert.strictEqual(g.frameRequests, frameRequests);
      assert.strictEqual(g.soundInput, soundInput);
      assert.equal(Object.hasOwn(g, 'effectFrame'), false);
      assert.equal(Object.hasOwn(g, 'itemFrame'), false);
    });
  }
});

test('restored simulation repeats the same future exactly', () => {
  const g = game();
  const checkpoint = g.saveRunaheadState(3);
  for (let frame = 0; frame < 3; frame++) g.step(0xffff);
  const projected = structuredClone(values(g));
  g.restoreRunaheadState(checkpoint);
  for (let frame = 0; frame < 3; frame++) g.step(0xffff);
  assert.deepEqual(values(g), projected);
});

test('runahead checkpoints are bounded, one-shot, non-nesting, and Game-owned', () => {
  const first = game();
  const second = game();
  for (const depth of [0, 1.5, 4, NaN]) {
    assert.throws(() => first.saveRunaheadState(depth), /integer from 1 through 3/);
  }

  const checkpoint = first.saveRunaheadState(1);
  assert.throws(() => first.saveRunaheadState(1), /cannot be nested/);
  assert.throws(() => second.restoreRunaheadState(checkpoint), /another Game/);
  assert.throws(() => first.boot(), /unavailable during runahead/);
  first.step(0xffff);
  assert.throws(() => first.step(0xffff), /only 1 speculative step/);
  first.restoreRunaheadState(checkpoint);
  assert.throws(() => first.restoreRunaheadState(checkpoint), /already restored/);
  assert.throws(() => first.restoreRunaheadState({}), /Unknown runahead checkpoint/);
});

test('speculative frames suppress host sound and coin effects, then the real frame emits once', () => {
  let coinTicks = 0;
  const soundCommands = [];
  const g = game({
    coinTick: () => { coinTicks++; },
    soundSink: { command: (input) => soundCommands.push(Array.from(input)) },
  });
  g.ram.setU16(COIN.irq4Phase, 1);
  g.ram.setU16(SOUND.head, 0);
  g.ram.setU16(SOUND.tail, 0);
  g.ram.setU16(SOUND.gateDual, 0);
  g.ram.setU16(SOUND.masterVol, 0);
  g.ram.setU8(SOUND.debounceA, 0);
  g.ram.setU8(SOUND.debounceB, 0);
  assert.equal(postWrapper(g.ram, g.sound, 0x28c714), true);

  const checkpoint = g.saveRunaheadState(1);
  g.step(0xffff);
  assert.equal(coinTicks, 0);
  assert.deepEqual(soundCommands, []);
  g.restoreRunaheadState(checkpoint);

  g.step(0xffff);
  assert.equal(coinTicks, 1);
  assert.equal(soundCommands.length, 1);
});

test('projection restores canonical state and identifies speculative failures', () => {
  for (const failAt of ['advance', 'capture']) {
    const g = game();
    const before = structuredClone(values(g));
    assert.throws(() => projectRunahead(g, 2,
      (target, frame) => {
        target.step(0xffff);
        if (failAt === 'advance' && frame === 1) throw new Error('advance failed');
      },
      () => {
        if (failAt === 'capture') throw new Error('capture failed');
        return null;
      }), (error) => error instanceof RunaheadProjectionError
        && error.cause?.message === `${failAt} failed`);
    assert.deepEqual(values(g), before);

    const checkpoint = g.saveRunaheadState(1);
    g.step(0xffff);
    g.restoreRunaheadState(checkpoint);
  }
});

test('projection never masks a failed canonical restore', () => {
  const g = game();
  g.restoreRunaheadState = () => { throw new Error('restore failed'); };
  assert.throws(() => projectRunahead(g, 1,
    () => { throw new Error('speculation failed'); },
    () => null), /restore failed/);
});

test('mod callback state and owner identities restore through the Game adapter', () => {
  const state = createModState(resolveLoadout(['graze-reactor', 'runahead-1']));
  const firstBullet = { slot: 1 };
  const secondBullet = { slot: 2 };
  state.runtime.hyperGauge = 91;
  state.runtime.bulletDensity = 37;
  state.runtime.grazedBullets[0].add(firstBullet);
  state.runtime.grazedBullets[1].add(secondBullet);
  state.runtime.grazeCount.splice(0, 2, 4, 8);
  state.runtime.resurrectionPositions.splice(0, 2, { y: 1, x: 2 }, null);
  state.runtime.cabinetRamRestore.push({ addr: 0x810000, width: 2, value: 7 });
  state.runtime.cabinetBoot = true;
  state.runtime.cabinetRunActive = false;

  const owners = {
    grazedBullets: state.runtime.grazedBullets,
    grazedP1: state.runtime.grazedBullets[0],
    grazedP2: state.runtime.grazedBullets[1],
    grazeCount: state.runtime.grazeCount,
    resurrectionPositions: state.runtime.resurrectionPositions,
    cabinetRamRestore: state.runtime.cabinetRamRestore,
  };
  const options = modGameOptions(state);
  const adapter = options[RUNAHEAD_EXTERNAL_STATE];
  assert.ok(adapter);
  for (const [name, callback] of Object.entries(adapter.callbacks)) {
    assert.strictEqual(options[name], callback);
  }
  assert.doesNotThrow(() => game(options));
  assert.throws(() => game({ ...options, playerGrazeHook: () => {} }),
    /does not match its adapter/);

  const g = game(options);
  const checkpoint = g.saveRunaheadState(1);
  state.runtime.hyperGauge = -1;
  state.runtime.bulletDensity = -2;
  state.runtime.grazedBullets = [new Set(), new Set()];
  state.runtime.grazeCount = [99, 98];
  state.runtime.resurrectionPositions = [null, null];
  state.runtime.cabinetRamRestore = [];
  delete state.runtime.cabinetBoot;
  state.runtime.cabinetRunActive = true;
  g.restoreRunaheadState(checkpoint);

  assert.equal(state.runtime.hyperGauge, 91);
  assert.equal(state.runtime.bulletDensity, 37);
  assert.strictEqual(state.runtime.grazedBullets, owners.grazedBullets);
  assert.strictEqual(state.runtime.grazedBullets[0], owners.grazedP1);
  assert.strictEqual(state.runtime.grazedBullets[1], owners.grazedP2);
  assert.deepEqual([...state.runtime.grazedBullets[0]], [firstBullet]);
  assert.deepEqual([...state.runtime.grazedBullets[1]], [secondBullet]);
  assert.strictEqual(state.runtime.grazeCount, owners.grazeCount);
  assert.deepEqual(state.runtime.grazeCount, [4, 8]);
  assert.strictEqual(state.runtime.resurrectionPositions, owners.resurrectionPositions);
  assert.deepEqual(state.runtime.resurrectionPositions, [{ y: 1, x: 2 }, null]);
  assert.strictEqual(state.runtime.cabinetRamRestore, owners.cabinetRamRestore);
  assert.deepEqual(state.runtime.cabinetRamRestore,
    [{ addr: 0x810000, width: 2, value: 7 }]);
  assert.equal(state.runtime.cabinetBoot, true);
  assert.equal(state.runtime.cabinetRunActive, false);
});

test('external restoration runs after a Game restore failure and consumes the checkpoint', () => {
  let external = 11;
  const callback = (amount) => amount;
  const adapter = {
    callbacks: { playerDamageTransform: callback },
    save: () => external,
    restore: (saved) => { external = saved; },
  };
  const g = game({
    playerDamageTransform: callback,
    [RUNAHEAD_EXTERNAL_STATE]: adapter,
  });
  const checkpoint = g.saveRunaheadState(1);
  external = 29;
  g.ram = null;

  assert.throws(() => g.restoreRunaheadState(checkpoint), TypeError);
  assert.equal(external, 11);
  assert.throws(() => g.restoreRunaheadState(checkpoint), /already restored/);
});

test('external adapters receive their exact opaque checkpoint token', () => {
  const tokens = [];
  const adapter = {
    callbacks: {},
    save: () => undefined,
    restore: (token) => { tokens.push(token); },
  };
  const g = game({ [RUNAHEAD_EXTERNAL_STATE]: adapter });
  const checkpoint = g.saveRunaheadState(1);
  g.restoreRunaheadState(checkpoint);
  assert.deepEqual(tokens, [undefined]);
});

test('custom simulation seams and formation-owned private hooks reject runahead', () => {
  const customHandlers = game({ handlers: new Map() });
  assert.throws(() => customHandlers.saveRunaheadState(1), /custom object handlers/);

  const customVideo = game({ video: {} });
  assert.throws(() => customVideo.saveRunaheadState(1), /custom video-register owner/);

  const replacedVideo = game();
  replacedVideo.video = {};
  assert.throws(() => replacedVideo.saveRunaheadState(1), /custom video-register owner/);

  const customBackground = game({ bgMutate: () => {} });
  assert.throws(() => customBackground.saveRunaheadState(1), /background mutator/);

  for (const property of ['playerDamageTransform', 'privateShotObjectHook',
    'virtualSpriteRequestHook']) {
    const g = game();
    g[property] = () => {};
    assert.throws(() => g.saveRunaheadState(1), new RegExp(property));
  }
});
