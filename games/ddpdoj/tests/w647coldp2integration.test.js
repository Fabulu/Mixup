// W647: one cold production cabinet proves native two-controller P2 end to end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HUDRAM } from '../src/hud.js';
import { COIN } from '../src/isr.js';
import { MACHINE, RAM, P } from '../src/machine.js';
import { ALLOC, resolveHandle241298 } from '../src/objalloc.js';
import { SCREEN17 } from '../src/objslot17.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '../src/render/index.js';
import { TALLY } from '../src/tally.js';
import { SCREEN11 } from '../src/tallyscreen.js';
import { SHOT } from '../src/weapons.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  attachInput, clearCoin, clearTouch, currentCoinWord, currentPortWord, pollInput,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const MANIFEST_FILE = path.join(ASSETS, 'manifest.json');
const MANIFEST = existsSync(MANIFEST_FILE)
  ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) : null;

function requiredAssetNames(manifest) {
  if (!manifest) return ['manifest.json'];
  const bgShards = Array.isArray(manifest.gfx?.bg?.shards) ? manifest.gfx.bg.shards : [];
  const sprShards = Array.isArray(manifest.spr?.shards) ? manifest.spr.shards : [];
  return [...new Set([
    'manifest.json',
    'gfx/tx.tiles.u8.gz', 'gfx/tx.tileno.u16.gz',
    'gfx/bg.tileno.u16.gz', 'gfx/bg.pal.u16.gz', 'gfx/bg.smap.u16.gz',
    ...bgShards.map(({ i }) => `gfx/bg.shard${i}.tiles.u8.gz`),
    manifest.spr?.streamsFile ?? 'spr/streams.u32.gz',
    ...sprShards.flatMap(({ i }) => [
      `spr/mask.shard${i}.u16.gz`, `spr/col.shard${i}.u16.gz`,
    ]),
    'capture.json.gz', 'capture.bin.gz', 'seed.bin.gz', 'player.tables.json.gz',
  ])];
}

const ASSET_NAMES = Object.freeze(requiredAssetNames(MANIFEST));
const REQUIRED_FILES = Object.freeze(ASSET_NAMES.map((name) => path.join(ASSETS, name)));
const SHARDS_PRESENT = Array.isArray(MANIFEST?.gfx?.bg?.shards)
  && Array.isArray(MANIFEST?.spr?.shards);
const MISSING_FILES = Object.freeze(REQUIRED_FILES.filter((file) => !existsSync(file)));
const SKIP = SHARDS_PRESENT && MISSING_FILES.length === 0 ? false
  : `complete exact production bundle absent: ${MISSING_FILES.join(', ')}`;

const BUTTON = Object.freeze({ A: 0, AUTO: 2, BACK: 8, START: 9, DOWN: 13, RIGHT: 15 });
const RAW = Object.freeze({
  stage: 0x813092, stageX2: 0x813094, stageX4: 0x813096, loop: 0x813098,
});
const SELECT = Object.freeze({
  p1Ship: 0x813084, p2Ship: 0x813086, p1Style: 0x813088, p2Style: 0x81308a,
});

let bundlePromise;
const requestedAssets = new Set();
function exactBundle() {
  bundlePromise ??= loadBundle(async (name) => {
    requestedAssets.add(name);
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

async function waitForQueue(queue, label) {
  queue.prefetchAll();
  const deadline = Date.now() + 30_000;
  while (queue.status().ready !== queue.status().total) {
    assert.deepEqual(queue.status().failed, [], `${label} deferred assets failed`);
    if (Date.now() >= deadline) assert.fail(`${label} deferred assets did not become ready`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function canvasHarness() {
  let image = null;
  const ctx = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData(next) { image = next; },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const metrics = () => {
    assert.ok(image, 'Demo.draw() did not present a canvas image');
    let colored = 0;
    const colors = new Set();
    for (let i = 0; i < image.data.length; i += 4) {
      const rgb = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
      if (rgb !== 0) colored++;
      colors.add(rgb);
    }
    return { colored, colors: colors.size, width: image.width, height: image.height };
  };
  return { canvas, metrics };
}

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== fn));
  }
}

const button = () => ({ pressed: false, value: 0 });
const makePad = (index) => ({
  index, id: 'W647 Standard pad', mapping: 'standard', connected: true,
  buttons: Array.from({ length: 17 }, button), axes: [0, 0],
});
function setButtons(pad, indexes, down) {
  for (const index of indexes) {
    pad.buttons[index].pressed = down;
    pad.buttons[index].value = down ? 1 : 0;
  }
}

function installPads(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pads = [makePad(0), makePad(1)];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { getGamepads: () => pads },
  });
  attachInput(new FakeTarget());
  clearCoin();
  clearTouch();
  t.after(() => {
    clearCoin();
    clearTouch();
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
  return pads;
}

function activeObjects(game) {
  const objects = [];
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const at = ALLOC.table + slot * ALLOC.stride;
    const word = game.ram.u16(at);
    if (word === 0) continue;
    objects.push({ slot, at, word, type: word & 0xff, id: game.ram.u32(at + ALLOC.idOff) });
  }
  return objects;
}

function activeTypes(game) {
  return activeObjects(game).map(({ type }) => type);
}

function objectByType(game, type) {
  return activeObjects(game).find((object) => object.type === type) ?? null;
}

function liveShots(ram, table) {
  let count = 0;
  for (let slot = 0; slot < SHOT.slots; slot++) {
    if (ram.u16(table + slot * SHOT.stride) !== 0) count++;
  }
  return count;
}

function readSpriteRecords(ram) {
  let records = 0;
  for (; records < SPRITE_LIMIT; records++) {
    const base = RAM.spriteList + records * RAM_STRIDE * 2;
    if ((ram.u16(base + 8) & 0x7fff) === 0) break;
  }
  return records;
}

function describeMissingSpriteRecords(ram, missing) {
  const offsets = new Set(missing.keys());
  const descriptions = [];
  for (let record = 0; record < SPRITE_LIMIT; record++) {
    const base = RAM.spriteList + record * RAM_STRIDE * 2;
    const words = Array.from({ length: RAM_STRIDE }, (_, index) => ram.u16(base + index * 2));
    if ((words[4] & 0x7fff) === 0) break;
    const offs = ((words[2] & 0x007f) << 16) | words[3];
    if (offsets.has(offs)) {
      descriptions.push(`r${record}[$${words.map((word) => word.toString(16)).join(',')}]`);
    }
  }
  return descriptions.join(' ');
}

function auditTiles(demo) {
  const bg = demo.game.vram.w;
  for (let index = 0; index < 64 * 16; index++) {
    demo.renderer.cache.bgGet(bg[index * 2], (bg[index * 2 + 1] & 0xc0) >> 6);
  }
  const tx = demo.game.txvram.w;
  for (let index = 0; index < 64 * 32; index++) {
    demo.renderer.cache.txGet(tx[index * 2], (tx[index * 2 + 1] & 0xc0) >> 6);
  }
}

function createStepper(demo, exact, harness) {
  let frames = 0;
  let maxP1Shots = 0;
  let maxP2Shots = 0;
  const audit = () => {
    auditTiles(demo);
    assert.deepEqual([...exact.missingTxTiles], [], `missing TX tile at LF${demo.game.logicFrame}`);
    assert.deepEqual([...exact.missingBgTiles], [], `missing BG tile at LF${demo.game.logicFrame}`);
  };
  return {
    step(afterPoll = null) {
      pollInput();
      afterPoll?.();
      const heldRam = demo.game.ram.clone();
      const heldBuckets = [...(demo.game.displayList?.perBucketRecords ?? [])];
      const rawRecords = readSpriteRecords(heldRam);
      demo.step();
      assert.equal(demo.portList.records, rawRecords,
        `raw and packed sprite record counts match at LF${demo.game.logicFrame}`);
      assert.equal(demo.portList.missing.size, 0,
        `no sprite stream is missing at LF${demo.game.logicFrame}: ${
          [...demo.portList.missing.entries()].map(([at, count]) => `${at}x${count}`).join(' ')} ${
          describeMissingSpriteRecords(heldRam, demo.portList.missing)} `
          + `buckets=${JSON.stringify(heldBuckets)}`);
      assert.equal(demo.portList.pending.size, 0,
        `no sprite stream is pending at LF${demo.game.logicFrame}`);
      assert.equal(demo.portList.skipped, 0,
        `no sprite record is skipped at LF${demo.game.logicFrame}`);
      assert.equal(demo.portList.records, demo.portList.drawn + demo.portList.blank,
        `every sprite record is accounted at LF${demo.game.logicFrame}`);
      maxP1Shots = Math.max(maxP1Shots, liveShots(demo.game.ram, SHOT.p1Table));
      maxP2Shots = Math.max(maxP2Shots, liveShots(demo.game.ram, SHOT.p2Table));
      audit();
      frames++;
      return activeTypes(demo.game);
    },
    landmark(label, minimumDrawn = 1) {
      demo.draw();
      audit();
      const metrics = harness.metrics();
      assert.deepEqual([metrics.width, metrics.height], [224, 448], `${label} canvas shape`);
      assert.ok(metrics.colored > 500, `${label} is visibly nonblank`);
      assert.ok(metrics.colors > 8, `${label} has meaningful color variation`);
      assert.ok(demo.portList.drawn >= minimumDrawn,
        `${label} draws at least ${minimumDrawn} production sprite records`);
      return {
        label, logicFrame: demo.game.logicFrame, stage: demo.game.ram.u16(RAW.stage),
        records: demo.portList.records, drawn: demo.portList.drawn,
      };
    },
    frames: () => frames,
    shotPeaks: () => ({ p1: maxP1Shots, p2: maxP2Shots }),
  };
}

function advanceUntil(stepper, demo, predicate, limit, label) {
  if (predicate()) return 0;
  for (let frame = 1; frame <= limit; frame++) {
    stepper.step();
    if (predicate()) return frame;
  }
  assert.fail(`${label} did not arrive within ${limit} frames at LF${demo.game.logicFrame}; `
    + `types=${activeTypes(demo.game).map((type) => type.toString(16)).join(',')} `
    + `selector=${demo.game.ram.u8(SCREEN17.recs)}/${demo.game.ram.u8(SCREEN17.recs + SCREEN17.phaseAt)},`
    + `${demo.game.ram.u8(SCREEN17.recs + SCREEN17.recStride)}/`
    + `${demo.game.ram.u8(SCREEN17.recs + SCREEN17.recStride + SCREEN17.phaseAt)} `
    + `players=${demo.game.ram.u16(RAM.player1 + P.state).toString(16)}/`
    + `${demo.game.ram.u16(RAM.player2 + P.state).toString(16)}`);
}

function frames(stepper, count) {
  for (let frame = 0; frame < count; frame++) stepper.step();
}

function pulse(stepper, pads, indexes, held = 2, released = 2) {
  for (const pad of pads) setButtons(pad, indexes, true);
  frames(stepper, held);
  for (const pad of pads) setButtons(pad, indexes, false);
  frames(stepper, released);
}

function score(ram, side) {
  const total = side === 0 ? HUDRAM.totalP1 : HUDRAM.totalP2;
  const pending = side === 0 ? HUDRAM.pendingP1 : HUDRAM.pendingP2;
  return { total: ram.u32(total), pending: ram.u32(pending) };
}

function scoreNonzero(value) {
  return value.total !== 0 || value.pending !== 0;
}

function stageTuple(ram) {
  return [RAW.stage, RAW.stageX2, RAW.stageX4, RAW.loop].map((at) => ram.u16(at));
}

function continueScreen(game, side) {
  const tally = side === 0 ? TALLY.side0 : TALLY.side1;
  const id = game.ram.u32(tally + 0x1c);
  if (id === 0) return null;
  const resolved = resolveHandle241298(game.ram, id);
  if (!resolved.found) return null;
  if ((game.ram.u16(resolved.rec) & 0xff) !== 0x0b) return null;
  return { id, rec: resolved.rec, side: game.ram.u8(resolved.rec + SCREEN11.side),
    phase: game.ram.u8(resolved.rec + SCREEN11.phase) };
}

function releasePad(pad) {
  setButtons(pad, Object.values(BUTTON), false);
}

function holdCampaignFire(pads) {
  for (const pad of pads) setButtons(pad, [BUTTON.AUTO], true);
}

function noGameOverStep(stepper, label, afterPoll = null) {
  const types = stepper.step(afterPoll);
  assert.equal(types.includes(0x0e), false, `${label} must not enter terminal type-$0E`);
  return types;
}

function noGameOverFrames(stepper, count, label) {
  for (let frame = 0; frame < count; frame++) noGameOverStep(stepper, label);
}

function acceptContinue(stepper, demo, pads, side, expectedId) {
  const pad = pads[side];
  for (const item of pads) releasePad(item);
  noGameOverFrames(stepper, 2, `side-${side} input release`);

  let screen = continueScreen(demo.game, side);
  assert.ok(screen, `side ${side} owns a live continue screen`);
  assert.equal(screen.id, expectedId, `side ${side} keeps the exact allocator screen ID`);
  assert.equal(screen.side, side, `the continue object belongs to side ${side}`);
  assert.equal(screen.phase, 0, `side ${side} begins at continue phase 0`);

  setButtons(pad, [BUTTON.BACK], true);
  noGameOverStep(stepper, `side-${side} coin`, () => assert.equal(currentCoinWord(),
    side === 0 ? 0xfffe : 0xfffd, `pad index ${side} emits its native coin word`));
  noGameOverFrames(stepper, 29, `side-${side} coin debounce`);
  setButtons(pad, [BUTTON.BACK], false);
  noGameOverFrames(stepper, 2, `side-${side} coin release`);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
    `side ${side} coin adds exactly one shared continue credit`);

  setButtons(pad, [BUTTON.START], true);
  noGameOverStep(stepper, `side-${side} continue START`, () => assert.equal(currentPortWord(),
    side === 0 ? 0xfffe : 0xfeff, `pad index ${side} emits its native START word`));
  setButtons(pad, [BUTTON.START], false);
  noGameOverStep(stepper, `side-${side} START release`);
  screen = continueScreen(demo.game, side);
  assert.ok(screen, `side ${side} continue screen survives for its two cursors`);
  assert.equal(screen.id, expectedId);
  assert.equal(screen.phase, 1, `side ${side} credited START reaches the X cursor`);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0,
    `side ${side} START spends exactly its one continue credit`);

  setButtons(pad, [BUTTON.A], true);
  noGameOverStep(stepper, `side-${side} X confirmation`);
  setButtons(pad, [BUTTON.A], false);
  noGameOverStep(stepper, `side-${side} X release`);
  screen = continueScreen(demo.game, side);
  assert.ok(screen, `side ${side} continue screen remains for Y`);
  assert.equal(screen.phase, 2, `side ${side} A confirms X and reaches Y`);

  setButtons(pad, [BUTTON.A], true);
  noGameOverStep(stepper, `side-${side} Y confirmation`);
  setButtons(pad, [BUTTON.A], false);
  noGameOverFrames(stepper, 3, `side-${side} Y release`);
  assert.equal(resolveHandle241298(demo.game.ram, expectedId).found, false,
    `side ${side} Y confirmation retires its exact continue screen`);

  advanceUntil(stepper, demo, () => {
    const actor = objectByType(demo.game, side === 0 ? 0x02 : 0x03);
    const player = side === 0 ? RAM.player1 : RAM.player2;
    return actor !== null && (demo.game.ram.u16(player + P.state) & 0x8000) !== 0;
  }, 80, `side-${side} continued player`);
  return objectByType(demo.game, side === 0 ? 0x02 : 0x03);
}

test('W647 one cold cabinet proves genuine native P2 through both Standard pads',
  { skip: SKIP, timeout: 600_000 }, async (t) => {
    const exact = await exactBundle();
    await Promise.all([
      waitForQueue(exact.bg, 'BG'),
      waitForQueue(exact.spr, 'sprite'),
    ]);
    assert.deepEqual([...requestedAssets].sort(), [...ASSET_NAMES].sort(),
      'the proof loads every production asset in the exact bundle');

    const pads = installPads(t);
    const harness = canvasHarness();
    const demo = new Demo(harness.canvas, exact, MACHINE.refreshHz);
    const sameDemo = demo;
    const sameGame = demo.game;
    const stepper = createStepper(demo, exact, harness);

    assert.equal(demo.coldBoot, true);
    assert.equal(demo.seedLf, 0);
    assert.equal(demo.seedVf, 0);
    assert.equal(demo.game.logicFrame, 0);
    assert.ok(demo.game.bootResult, 'zero-RAM construction executed production Game.boot');
    assert.equal(demo.authentic, undefined, 'no direct authentic selection was supplied');
    assert.equal(demo.rung, null, 'no rung, saved seed, or checkpoint was supplied');
    assert.equal(demo.formation, null, 'no formation patched either player');
    assert.deepEqual(demo.progressionPokes, [], 'no host progression writes were configured');
    assert.equal(demo.mods, undefined, 'the cold P2 proof uses no simulation mods');

    advanceUntil(stepper, demo, () => demo.game.logicFrame >= 305,
      305, 'cold cabinet score screen');
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);

    setButtons(pads[1], [BUTTON.BACK], true);
    stepper.step(() => assert.equal(currentCoinWord(), 0xfffd,
      'pad index 1 Back emits exact native COIN2'));
    frames(stepper, 29);
    setButtons(pads[1], [BUTTON.BACK], false);
    frames(stepper, 2);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
      'COIN2 adds exactly one shared cartridge credit');

    setButtons(pads[0], [BUTTON.BACK], true);
    stepper.step(() => assert.equal(currentCoinWord(), 0xfffe,
      'pad index 0 Back emits exact native COIN1'));
    frames(stepper, 29);
    setButtons(pads[0], [BUTTON.BACK], false);
    frames(stepper, 2);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 2,
      'the second indexed pad adds the second shared credit');

    setButtons(pads[1], [BUTTON.START], true);
    stepper.step(() => assert.equal(currentPortWord(), 0xfeff,
      'pad index 1 START emits the exact P2 board word'));
    frames(stepper, 11);
    setButtons(pads[1], [BUTTON.START], false);
    frames(stepper, 2);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
      'P2 START spends exactly one shared credit');
    assert.ok(activeTypes(demo.game).includes(0x09),
      'P2 START opens the native type-$09 selector');

    setButtons(pads[0], [BUTTON.START], true);
    stepper.step(() => assert.equal(currentPortWord(), 0xfffe,
      'pad index 0 START emits the exact P1 board word'));
    frames(stepper, 11);
    setButtons(pads[0], [BUTTON.START], false);
    frames(stepper, 2);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0,
      'late P1 START spends the second shared credit');

    const rec0 = SCREEN17.recs;
    const rec1 = rec0 + SCREEN17.recStride;
    advanceUntil(stepper, demo, () => demo.game.ram.u8(rec0) === 1
        && demo.game.ram.u8(rec1) === 1
        && demo.game.ram.u8(rec0 + SCREEN17.phaseAt) === 1
        && demo.game.ram.u8(rec1 + SCREEN17.phaseAt) === 1,
    60, 'both native ship cursors');
    const selector = stepper.landmark('cold two-player fighter selector', 10);

    pulse(stepper, pads, [BUTTON.A]);
    advanceUntil(stepper, demo, () => demo.game.ram.u8(rec0 + SCREEN17.phaseAt) === 4
        && demo.game.ram.u8(rec1 + SCREEN17.phaseAt) === 4,
    60, 'both native style cursors');
    pulse(stepper, pads, [BUTTON.A]);

    advanceUntil(stepper, demo, () => {
      const types = activeTypes(demo.game);
      return types.includes(0x02) && types.includes(0x03)
        && !types.includes(0x09)
        && (demo.game.ram.u16(RAM.player1 + P.state) & 0x8000) !== 0
        && (demo.game.ram.u16(RAM.player2 + P.state) & 0x8000) !== 0;
    }, 1000, 'two-player gameplay handoff');
    assert.ok(activeTypes(demo.game).includes(0x0a),
      'the same cold route reaches the live cartridge rank and stage state');
    assert.deepEqual([
      demo.game.ram.u16(SELECT.p1Ship), demo.game.ram.u16(SELECT.p2Ship),
      demo.game.ram.u16(SELECT.p1Style), demo.game.ram.u16(SELECT.p2Style),
    ], [0, 0, 2, 6], 'both indexed pads commit their own cartridge default pair');
    assert.equal(demo.game.ram.u16(RAM.playerCountM1), 1,
      'the cartridge records two live native players');
    assert.equal(demo.game.ram.u8(RAM.player1 + P.playerIdx), 0);
    assert.equal(demo.game.ram.u8(RAM.player2 + P.playerIdx), 1);
    const firstP2 = objectByType(demo.game, 0x03);
    assert.ok(firstP2, 'the allocator owns a genuine type-$03 P2 actor');
    const gameplay = stepper.landmark('cold native two-player gameplay', 5);

    frames(stepper, 12);
    const p2X = demo.game.ram.u16(RAM.player2 + P.posX);
    const p1Score = score(demo.game.ram, 0);
    setButtons(pads[1], [BUTTON.RIGHT, BUTTON.A], true);
    stepper.step();
    assert.equal(demo.game.ram.u16(RAM.p1raw), 0x1800,
      'the packed P1 mailbox contains no P1 direction or button bits');
    assert.equal(demo.game.ram.u16(RAM.p2raw), 0x7f98,
      'P2 RIGHT plus A reaches the exact native P2 held mailbox');
    assert.equal(demo.game.ram.u8(RAM.player1 + P.dirByte), 0,
      'P2-only input gives P1 no player-direction byte');
    assert.equal(demo.game.ram.u8(RAM.player2 + P.dirByte), 0x98,
      'P2-only input reaches the type-$03 actor direction and button byte');
    frames(stepper, 19);
    setButtons(pads[1], [BUTTON.RIGHT], false);
    assert.ok(demo.game.ram.u16(RAM.player2 + P.posX) > p2X,
      'P2-only RIGHT causally moves the native type-$03 actor');
    assert.ok(stepper.shotPeaks().p2 > 0, 'P2-only A allocates native P2 shot records');
    assert.equal(stepper.shotPeaks().p1, 0, 'P2-only A allocates no P1 shot records');

    setButtons(pads[1], [BUTTON.DOWN, BUTTON.A], true);
    advanceUntil(stepper, demo, () => scoreNonzero(score(demo.game.ram, 1)),
      300, 'P2-owned score increase');
    assert.deepEqual(score(demo.game.ram, 0), p1Score,
      'P2-owned hits do not alter P1 score');
    const scored = stepper.landmark('P2-owned shots and score', 5);
    releasePad(pads[1]);
    frames(stepper, 2);

    const firstReserveCount = demo.game.ram.u16(HUDRAM.aliveP2);
    assert.equal(firstReserveCount, 2, 'a cold P2 begins with two reserve lives');
    advanceUntil(stepper, demo,
      () => (demo.game.ram.u8(RAM.player2 + P.state) & 1) !== 0,
      2000, 'P2 natural lethal-hit state');
    assert.equal(objectByType(demo.game, 0x03)?.id, firstP2.id,
      'natural death first belongs to the original type-$03 allocator identity');
    assert.ok(objectByType(demo.game, 0x02), 'P1 remains present through P2 death');
    const death = stepper.landmark('natural native P2 death', 5);

    advanceUntil(stepper, demo, () => {
      const actor = objectByType(demo.game, 0x03);
      return actor !== null && actor.id !== firstP2.id
        && (demo.game.ram.u16(RAM.player2 + P.state) & 0x8000) !== 0
        && (demo.game.ram.u8(RAM.player2 + P.state) & 1) === 0;
    }, 800, 'P2 reserve respawn');
    const reserveP2 = objectByType(demo.game, 0x03);
    assert.ok(reserveP2, 'P2 reserve respawn owns a type-$03 actor');
    assert.notEqual(reserveP2.id, firstP2.id,
      'the reserve respawn changes allocator identity even if a slot is reused');
    assert.equal(demo.game.ram.u16(HUDRAM.aliveP2), firstReserveCount - 1,
      'the natural respawn spends exactly one P2 reserve');
    assert.ok(objectByType(demo.game, 0x02), 'P1 stays independently live after P2 respawns');
    const respawn = stepper.landmark('native P2 reserve respawn', 5);

    advanceUntil(stepper, demo, () => demo.game.ram.u16(HUDRAM.aliveP2) === 0xffff
        && objectByType(demo.game, 0x03) === null
        && objectByType(demo.game, 0x02) !== null,
    5000, 'P2 reserve exhaustion while P1 remains live');
    assert.notEqual(demo.game.ram.u16(HUDRAM.aliveP1), 0xffff,
      'P1 still owns reserve state when P2 alone exhausts');
    assert.equal(activeTypes(demo.game).includes(0x0e), false,
      'P2 exhaustion reaches a continue choice, not terminal Game Over');

    advanceUntil(stepper, demo, () => {
      const screen = continueScreen(demo.game, 1);
      return screen !== null && screen.phase === 0;
    }, 80, 'side-1 continue countdown');
    const firstContinue = continueScreen(demo.game, 1);
    assert.ok(firstContinue, 'P2 tally line stores a resolvable continue-screen ID');
    assert.equal(firstContinue.side, 1, 'the exact continue screen is side 1');
    assert.equal(firstContinue.phase, 0, 'P2 exhaustion begins at cartridge phase 0');
    assert.equal(continueScreen(demo.game, 0), null,
      'P1 does not inherit P2 continued-side ownership');
    const countdown = stepper.landmark('native side-1 continue countdown', 5);

    const continuedP2 = acceptContinue(stepper, demo, pads, 1, firstContinue.id);
    assert.ok(continuedP2, 'P2 continue creates a fresh native type-$03 actor');
    assert.notEqual(continuedP2.id, reserveP2.id,
      'continued P2 has a new allocator identity after reserve exhaustion');
    assert.equal(demo.game.ram.u16(HUDRAM.aliveP2), 2,
      'accepted P2 continue restores the cartridge reserve count');
    assert.ok(objectByType(demo.game, 0x02), 'P1 remains live after P2 accepts continue');
    const continued = stepper.landmark('credited native P2 continue', 5);

    const targetStage2 = [1, 2, 4, 0];
    const servicedIds = new Set([firstContinue.id]);
    const continueSides = [0, 1];
    const postContinueStart = stepper.frames();
    holdCampaignFire(pads);
    while (!targetStage2.every((value, index) => stageTuple(demo.game.ram)[index] === value)) {
      assert.ok(stepper.frames() - postContinueStart < 20_000,
        `Stage 2 did not arrive within 20000 post-continue frames: ${stageTuple(demo.game.ram)}`);
      noGameOverStep(stepper, 'continued Stage 1 campaign');

      for (let side = 0; side < 2; side++) {
        const screen = continueScreen(demo.game, side);
        if (!screen || screen.phase !== 0 || servicedIds.has(screen.id)) continue;
        assert.ok(servicedIds.size < 20, 'the Stage-2 route needs at most 20 continues');
        servicedIds.add(screen.id);
        acceptContinue(stepper, demo, pads, side, screen.id);
        holdCampaignFire(pads);
        continueSides[side]++;
        assert.equal(demo, sameDemo, 'continued campaign never replaces Demo');
        assert.equal(demo.game, sameGame, 'continued campaign never replaces Game');
        break;
      }
    }

    assert.deepEqual(stageTuple(demo.game.ram), targetStage2,
      'ordinary side-correct continues naturally advance Stage 1 into Stage 2');
    assert.equal(servicedIds.size, 7,
      'the deterministic auto-fire route services seven ordinary credited continues');
    assert.deepEqual(continueSides, [4, 3],
      'each indexed pad accepts repeated side-owned continues, including three for P2');
    assert.ok(stepper.frames() - postContinueStart < 20_000,
      'the natural Stage-2 frontier stays inside the measured frame bound');
    const stage2 = stepper.landmark('same-cabinet native two-player Stage 2', 5);

    assert.equal(demo, sameDemo);
    assert.equal(demo.game, sameGame);
    assert.deepEqual([
      selector.label, gameplay.label, scored.label, death.label, respawn.label,
      countdown.label, continued.label, stage2.label,
    ], [
      'cold two-player fighter selector', 'cold native two-player gameplay',
      'P2-owned shots and score', 'natural native P2 death',
      'native P2 reserve respawn', 'native side-1 continue countdown',
      'credited native P2 continue', 'same-cabinet native two-player Stage 2',
    ], 'all renderer landmarks belong to the same unreloaded production cabinet');
  });
