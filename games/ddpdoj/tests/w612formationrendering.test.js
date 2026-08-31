// W612: private P3 body and trail rendering without native render aliases.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { MACHINE, P, RAM } from '../src/machine.js';
import { ALLOC, commitCreates } from '../src/objalloc.js';
import {
  P3_VIRTUAL, THREE_PILOT_FORMATION_MODE, attachThreePilotFoundation,
} from '../src/formationactors.js';
import { renderThreePilotRequests } from '../src/formationrender.js';
import {
  BUCKETS, NAMED_BUCKETS, RECORD_BYTES, bulkWrite, encodeRegisterRequest,
  enqueueRegisters,
} from '../src/spritequeue.js';
import { DL, buildDisplayList } from '../src/displaylist.js';
import { TRAIL } from '../src/shipsprite.js';
import { parseSpriteList, RAM_STRIDE, SPRITE_LIMIT } from '../src/render/spritelist.js';
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
  : 'exact browser bundle absent; private P3 rendering proof is skipped, not passed';
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

const DIR_TABLE = Object.freeze([
  0xff, 0x00, 0x20, 0xff, 0x30, 0x38, 0x28, 0xff,
  0x10, 0x08, 0x18, 0xff, 0xff, 0xff, 0xff, 0xff,
]);
const ANIM_DESCRIPTORS = Object.freeze({
  0: Object.freeze([
    0x1200, 0x1264, 0x12c8, 0x132c, 0x1390, 0x13f4, 0x1458, 0x14bc, 0x1520,
    0x1584, 0x15e8, 0x164c, 0x16b0, 0x1714, 0x1778, 0x17dc, 0x1840,
  ]),
  2: Object.freeze([
    0x18a4, 0x1908, 0x196c, 0x19d0, 0x1a34, 0x1a98, 0x1afc, 0x1b60, 0x1bc4,
    0x1c28, 0x1c8c, 0x1cf0, 0x1d54, 0x1db8, 0x1e1c, 0x1e80, 0x1ee4,
  ]),
});

function fakeGame({ p1Y = 0x1179, p1X = 0x14c0 } = {}) {
  const ram = new Ram();
  ram.setU16(RAM.player1 + P.state, 0x8000);
  ram.setU16(RAM.player2 + P.state, 0x8000);
  ram.setU16(RAM.player1 + P.posY, p1Y);
  ram.setU16(RAM.player1 + P.posX, p1X);
  ram.setU16(RAM.player2 + P.posY, p1Y);
  ram.setU16(RAM.player2 + P.posX, p1X + 0x1000);
  ram.setU8(RAM.player1 + P.speedIdx, 0x16);
  const game = {
    ram,
    rom: { u16() { return 0x10; } },
    tables: {
      angleFor(nibble) { return DIR_TABLE[nibble & 0x0f]; },
      vector() { return { dy: 0, dx: 0 }; },
      anim(tilt, selector) {
        const signedTilt = tilt & 0x8000 ? tilt - 0x10000 : tilt;
        const index = (signedTilt + 0x20) / 4;
        if (!Number.isInteger(index) || index < 0 || index > 16) {
          throw new RangeError(`bad fake tilt ${signedTilt}`);
        }
        const descriptors = ANIM_DESCRIPTORS[selector];
        if (!descriptors) throw new RangeError(`bad fake selector ${selector}`);
        return { a: [0, descriptors[index]], hitX: [0, 0] };
      },
    },
  };
  return game;
}

function activate(state) {
  const created = commitCreates(state.game.ram);
  state.objectDriverHook({ phase: 'after-commit', ram: state.game.ram, created, killed: 0 });
  assert.equal(state.lifecycle, 'alive');
}

function bytesAt(ram, address, length) {
  const start = address - MACHINE.ramBase;
  return ram.b.slice(start, start + length);
}

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function wordsAt(ram, address, count) {
  return Uint16Array.from({ length: count }, (_, i) => ram.u16(address + i * 2));
}

function parsedList(ram) {
  return parseSpriteList(wordsAt(ram, DL.list, SPRITE_LIMIT * RAM_STRIDE), RAM_STRIDE);
}

function requestWords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: 6 }, (_, i) => view.getUint16(i * 2, false));
}

function physicalBuffers(ram) {
  return BUCKETS.slice(1).map((bucket) => bytesAt(ram, bucket.buffer, bucket.capBytes));
}

function queueRequests(game) {
  return Array.from({ length: game.displayList.queueBytes / RECORD_BYTES }, (_, i) =>
    hex(bytesAt(game.ram, DL.queue + i * RECORD_BYTES, RECORD_BYTES)));
}

function stagedBytes(game) {
  return game.staged.map(({ i, count, bytes }) => ({ i, count, hex: hex(bytes) }));
}

test('W612 pure register encoding is byte-identical to the physical stub', () => {
  const ram = new Ram();
  const args = [0x11791cc0, 0x00001520, 0x0620, 0x0000];
  const pure = encodeRegisterRequest(...args);
  enqueueRegisters(ram, NAMED_BUCKETS.player, ...args);
  assert.equal(pure.length, RECORD_BYTES);
  assert.deepEqual(bytesAt(ram, BUCKETS[NAMED_BUCKETS.player].buffer, RECORD_BYTES), pure);
  assert.equal(ram.u16(BUCKETS[NAMED_BUCKETS.player].counter), RECORD_BYTES);
});

test('W612 absent virtual extras leave the exact display list and RAM byte-identical', () => {
  const a = new Ram();
  const b = new Ram();
  enqueueRegisters(a, 5, 0x20001800, 0x00001111, 0x0210, 0x0018);
  enqueueRegisters(a, 19, 0x30002000, 0x00002222, 0x0620, 0x0000);
  b.b.set(a.b);

  const ordinary = buildDisplayList(a);
  const emptyVirtual = buildDisplayList(b, { virtualRequests: [] });
  assert.deepEqual(b.b, a.b);
  assert.equal('virtualRecords' in ordinary, false,
    'vanilla telemetry keeps its checkpoint-stable shape');
  assert.equal('virtualDropped' in ordinary, false);
  assert.equal('perBucketVirtualRecords' in ordinary, false);
  assert.deepEqual([
    emptyVirtual.pendingBytes, emptyVirtual.queueBytes, emptyVirtual.records,
    emptyVirtual.fillers, emptyVirtual.terminated, emptyVirtual.capFired,
    emptyVirtual.perBucketRecords,
  ], [
    ordinary.pendingBytes, ordinary.queueBytes, ordinary.records,
    ordinary.fillers, ordinary.terminated, ordinary.capFired,
    ordinary.perBucketRecords,
  ]);
  assert.equal(emptyVirtual.virtualRecords, 0);
});

test('W612 exact body request parses through both selector families and existing list stream', () => {
  const game = fakeGame();
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  activate(state);
  const ramBefore = game.ram.b.slice();

  const requestsA = state.virtualSpriteRequestHook(game);
  assert.equal(state.memory.u16(P3_VIRTUAL.player + P.shipSel), 0);
  assert.equal(state.memory.u16(P3_VIRTUAL.player + P.optFormation), 6);
  assert.deepEqual(requestsA.map(({ bucket }) => bucket),
    [NAMED_BUCKETS.player, NAMED_BUCKETS.player]);
  assert.equal(hex(requestsA[0].bytes), '802d80630000152006200000');
  assert.deepEqual(requestWords(requestsA[1].bytes).slice(2), [0, 0x1bc4, 0x0620, 0]);
  assert.notDeepEqual(requestWords(requestsA[1].bytes).slice(0, 2),
    requestWords(requestsA[0].bytes).slice(0, 2));
  assert.deepEqual(game.ram.b, ramBefore, 'the host request producer writes no cartridge RAM');

  for (const [selector, descriptor] of [[0, 0x1520], [2, 0x1bc4]]) {
    state.memory.setU16(P3_VIRTUAL.player + P.shipSel, selector);
    const [body] = renderThreePilotRequests(state, game);
    assert.deepEqual(requestWords(body.bytes), [0x802d, 0x8063, 0, descriptor, 0x0620, 0]);
    const listRam = new Ram();
    const telemetry = buildDisplayList(listRam, { virtualRequests: [body] });
    assert.equal(telemetry.virtualRecords, 1);
    const [sprite] = parsedList(listRam);
    assert.deepEqual({
      x: sprite.x, y: sprite.y, offs: sprite.offs, width: sprite.width,
      height: sprite.height, color: sprite.color, flip: sprite.flip,
    }, {
      x: 45, y: 99, offs: descriptor, width: 3,
      height: 32, color: 0, flip: 0,
    });
  }
});

test('W612 contradictory direction decays P3 banking through cartridge normalization', () => {
  const game = fakeGame();
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  activate(state);

  state.memory.setU16(P3_VIRTUAL.input.raw, 0x0008);
  for (let i = 0; i < 4; i++) renderThreePilotRequests(state, game);
  assert.equal(state.render.animationPhase, 8);
  assert.equal(game.tables.angleFor(0x0c), 0xff);

  state.memory.setU16(P3_VIRTUAL.input.raw, 0x000c);
  const phases = [];
  let body;
  for (let i = 0; i < 3; i++) {
    [body] = renderThreePilotRequests(state, game);
    phases.push(state.render.animationPhase);
  }
  assert.deepEqual(phases, [4, 0, 0]);
  assert.equal(requestWords(body.bytes)[3], 0x1520,
    'contradictory horizontal input returns to the neutral Type-A image');
});

test('W612 trail uses five authentic taps and private bounded histories only', () => {
  const game = fakeGame();
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  activate(state);
  renderThreePilotRequests(state, game);

  assert.equal(state.render.positionHistory.length, TRAIL.entries);
  assert.equal(state.render.imageHistory.length, TRAIL.entries);
  for (let i = 0; i < TRAIL.entries; i++) {
    const y = 0x1000 + i * 0x100;
    const x = 0x0800 + i * 0x100;
    state.render.positionHistory[i] = ((y << 16) | x) >>> 0;
    state.render.imageHistory[i] = 0x00003000 + i;
  }
  state.memory.setU16(P3_VIRTUAL.player + P.posY, 0x5000);
  state.memory.setU16(P3_VIRTUAL.player + P.posX, 0x3000);
  game.ram.setU16(0x80390c, 1);

  const nativeBefore = game.ram.b.slice();
  const requests = renderThreePilotRequests(state, game);
  const trails = requests.filter(({ bucket }) => bucket === NAMED_BUCKETS.trail);
  assert.equal(trails.length, 5);
  assert.deepEqual(trails.map(({ bytes }) => new DataView(
    bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false)),
  [14, 11, 8, 5, 2].map((i) => 0x00003000 + i));
  assert.deepEqual(requestWords(trails[0].bytes).slice(4), [TRAIL.size, TRAIL.flip]);
  assert.deepEqual(game.ram.b, nativeBefore,
    'P3 trail history and requests mutate no physical player, ring, or bucket byte');
  assert.deepEqual(requests.map(({ bucket }) => bucket).sort((a, b) => a - b),
    [12, 12, 12, 12, 12, 19]);
});

test('W612 a full physical trail bucket remains unchanged while virtual trails merge after it', () => {
  const ram = new Ram();
  const physical = Array.from({ length: 10 }, (_, i) =>
    [0x8100 + i, 0x8200 + i, 0, 0x1000 + i, TRAIL.size, TRAIL.flip]);
  bulkWrite(ram, NAMED_BUCKETS.trail, physical);
  const stagedBefore = physicalBuffers(ram);
  const virtual = Array.from({ length: 5 }, (_, i) => ({
    bucket: NAMED_BUCKETS.trail,
    bytes: encodeRegisterRequest(0x30002000 + i * 0x00400040,
      0x00004000 + i, TRAIL.size, TRAIL.flip),
  }));

  const telemetry = buildDisplayList(ram, { virtualRequests: virtual });
  assert.equal(telemetry.perBucketRecords[NAMED_BUCKETS.trail], 15);
  assert.equal(telemetry.perBucketVirtualRecords[NAMED_BUCKETS.trail], 5);
  assert.equal(telemetry.virtualRecords, 5);
  assert.equal(telemetry.capFired, false);
  assert.deepEqual(physicalBuffers(ram), stagedBefore,
    'virtual merge neither extends nor overwrites any physical bucket buffer');
  assert.equal(ram.u16(BUCKETS[NAMED_BUCKETS.trail].counter), 0);
});

test('W612 physical-first ordering and the global cap account for virtual records exactly', () => {
  const orderRam = new Ram();
  const physical = [0x30002000, 0x00001111, 0x0620, 0x0000];
  enqueueRegisters(orderRam, 19, ...physical);
  const virtual = [0x2222, 0x3333].map((descriptor) => ({
    bucket: 19,
    bytes: encodeRegisterRequest(0x30002000, descriptor, 0x0620, 0),
  }));
  const ordered = buildDisplayList(orderRam, { virtualRequests: virtual });
  assert.deepEqual(ordered.perBucketRecords.slice(19, 20), [3]);
  assert.deepEqual(parsedList(orderRam).map(({ offs }) => offs), [0x1111, 0x2222, 0x3333]);

  const dropRam = new Ram();
  bulkWrite(dropRam, 1, Array.from({ length: 250 }, (_, i) =>
    [0x8000, 0x8000, 0, i + 1, 0x0208, 0]));
  const droppableVirtual = [20, 6, 9].map((bucket, i) => ({
    bucket,
    bytes: encodeRegisterRequest(0x20002000, 0x7000 + i, 0x0208, 0),
  }));
  const dropped = buildDisplayList(dropRam, { virtualRequests: droppableVirtual });
  assert.equal(dropped.pendingRecords, 253);
  assert.equal(dropped.droppedBucket20, 1);
  assert.equal(dropped.dropped6and9, 2);
  assert.equal(dropped.virtualRecords, 0);
  assert.equal(dropped.virtualDropped, 3);
  assert.equal(dropped.records, 250);

  const capRam = new Ram();
  bulkWrite(capRam, 1, Array.from({ length: 248 }, (_, i) =>
    [0x8000, 0x8000, 0, i + 1, 0x0208, 0]));
  const capVirtual = [0x7101, 0x7102, 0x7103].map((descriptor) => ({
    bucket: 1,
    bytes: encodeRegisterRequest(0x20002000, descriptor, 0x0208, 0),
  }));
  capVirtual.push({
    bucket: 19,
    bytes: encodeRegisterRequest(0x20002000, 0x7f00, 0x0620, 0),
  });
  const capped = buildDisplayList(capRam, { virtualRequests: capVirtual });
  assert.equal(capped.pendingRecords, 252);
  assert.equal(capped.records, 251);
  assert.equal(capped.capFired, true);
  assert.equal(capped.capBucket, 1);
  assert.equal(capped.perBucketVirtualRecords[1], 3);
  assert.equal(capped.perBucketRecords[19], 0);
  assert.equal(capped.virtualDropped, 1);
  assert.equal(capped.queueBytes, DL.capBytes);
});

test('W612 animation, history, and request state are isolated between Games', () => {
  const gameA = fakeGame();
  const gameB = fakeGame({ p1X: 0x18c0 });
  const stateA = attachThreePilotFoundation(gameA, { inputWord: 0xffff });
  const stateB = attachThreePilotFoundation(gameB, { inputWord: 0xffff });
  activate(stateA);
  activate(stateB);
  assert.notStrictEqual(stateA.render, stateB.render);
  assert.notStrictEqual(stateA.render.requests, stateB.render.requests);
  assert.notStrictEqual(stateA.render.positionHistory, stateB.render.positionHistory);
  assert.notStrictEqual(stateA.render.imageHistory, stateB.render.imageHistory);

  stateA.memory.setU16(P3_VIRTUAL.input.raw, 0x0008);
  for (let i = 0; i < 4; i++) renderThreePilotRequests(stateA, gameA);
  renderThreePilotRequests(stateB, gameB);
  assert.equal(stateA.render.animationPhase, 8);
  assert.equal(stateB.render.animationPhase, 0);
  assert.notDeepEqual(stateA.render.positionHistory, stateB.render.positionHistory);
  assert.equal(stateA.render.hookCalls, 4);
  assert.equal(stateB.render.hookCalls, 1);
});

test('W612 staged, detached, dropped, reset, and stage-clear states leave no stale sprite', () => {
  const game = fakeGame();
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  assert.deepEqual(renderThreePilotRequests(state, game), [], 'staged P3 is not alive');
  activate(state);
  assert.equal(renderThreePilotRequests(state, game).length, 1);
  state.render.positionHistory.fill(0xdeadbeef);
  state.render.imageHistory.fill(0xcafebabe);

  game.ram.setU16(0x812972, 1);
  assert.deepEqual(renderThreePilotRequests(state, game), []);
  assert.equal(state.render.actorId, 0);
  assert.deepEqual(Array.from(state.render.positionHistory), new Array(16).fill(0));
  game.ram.setU16(0x812972, 0);
  assert.equal(renderThreePilotRequests(state, game).length, 1,
    'post-clear body resumes with a newly seeded history');

  for (const lifecycle of ['detached', 'dropped', 'staged']) {
    state.lifecycle = lifecycle;
    assert.deepEqual(renderThreePilotRequests(state, game), [], `${lifecycle} emits nothing`);
    assert.equal(state.render.requests.length, 0);
    assert.equal(state.render.actorId, 0);
  }
  state.lifecycle = 'alive';
  state.memory.setU16(P3_VIRTUAL.player + P.state, 0);
  assert.deepEqual(renderThreePilotRequests(state, game), [], 'dead sidecar record emits nothing');
});

test('W612 attachment exclusively installs a validated seam and emits no deferred bucket', () => {
  const conflict = fakeGame();
  const prior = () => [];
  conflict.virtualSpriteRequestHook = prior;
  const createSp = conflict.ram.u16(ALLOC.createSp);
  assert.throws(() => attachThreePilotFoundation(conflict), /already has a virtualSpriteRequestHook/);
  assert.strictEqual(conflict.virtualSpriteRequestHook, prior);
  assert.equal(conflict.ram.u16(ALLOC.createSp), createSp);

  const game = fakeGame();
  assert.equal(game.virtualSpriteRequestHook, undefined);
  const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
  assert.strictEqual(game.virtualSpriteRequestHook, state.virtualSpriteRequestHook);
  activate(state);
  game.virtualSpriteRequestHook(game);
  state.render.positionHistory.fill(0);
  game.ram.setU16(0x80390c, 1);
  const buckets = new Set(game.virtualSpriteRequestHook(game).map(({ bucket }) => bucket));
  assert.deepEqual([...buckets].sort((a, b) => a - b), [12, 19]);
  for (const deferred of [5, 14, 15, 16]) assert.equal(buckets.has(deferred), false);
});

test('W612 public formation is selectable while the mod catalogue remains closed', () => {
  const id = THREE_PILOT_FORMATION_MODE.id;
  assert.equal(MOD_IDS.length, 37);
  assert.equal(MOD_IDS.includes(id), false);
  assert.equal(Object.hasOwn(MODS, id), false);
  assert.strictEqual(formationMode(id), THREE_PILOT_FORMATION_MODE);
  assert.strictEqual(hashToFormation(`#formation=${id}`), THREE_PILOT_FORMATION_MODE);
  assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE), `formation=${id}`);
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  assert.match(start, /id="formation-three"/);
  assert.match(start, /All Three Ships/);
});

test('W612 exact-bundle Game step adds two visible P1 companion bodies without changing native requests',
  { skip: SKIP_ASSETS }, async () => {
    const bundle = await localBundle();
    const selection = THREE_PILOT_FORMATION_MODE.authenticSelection;
    const renderedDemo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, selection);
    const controlDemo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, selection);
    const rendered = attachThreePilotFoundation(renderedDemo.game, { inputWord: 0xffff });
    const control = attachThreePilotFoundation(controlDemo.game, { inputWord: 0xffff });
    // Keep this W612 proof body-only now that W613 installs the private option seam.
    (/** @type {any} */ (renderedDemo.game)).privateOptionObjectHook = undefined;
    (/** @type {any} */ (controlDemo.game)).privateOptionObjectHook = undefined;
    (/** @type {any} */ (controlDemo.game)).virtualSpriteRequestHook = undefined;

    renderedDemo.step();
    controlDemo.step();
    renderedDemo.step();
    controlDemo.step();
    assert.equal(rendered.lifecycle, 'alive');
    assert.equal(control.lifecycle, 'alive');
    assert.equal(rendered.render.hookCalls, 2, 'the render seam runs once per Game logic step');
    assert.equal(control.render.hookCalls, 0);
    assert.deepEqual(stagedBytes(renderedDemo.game), stagedBytes(controlDemo.game),
      'all native physical bucket requests remain byte-identical');

    const rt = renderedDemo.game.displayList;
    const ct = controlDemo.game.displayList;
    assert.equal(rt.perBucketVirtualRecords[19], 2);
    assert.equal(rt.perBucketRecords[19], ct.perBucketRecords[19] + 2);
    for (let bucket = 0; bucket < BUCKETS.length; bucket++) {
      if (bucket === 19) continue;
      assert.equal(rt.perBucketRecords[bucket], ct.perBucketRecords[bucket],
        `bucket ${bucket} retains its native request count`);
    }

    const renderedQueue = queueRequests(renderedDemo.game);
    const controlQueue = queueRequests(controlDemo.game);
    const companionEnd = rt.perBucketRecords.slice(0, 20)
      .reduce((sum, count) => sum + count, 0);
    const companionStart = companionEnd - 2;
    const companionRequests = renderedQueue.splice(companionStart, 2);
    assert.deepEqual(companionRequests, [
      '802d80630000152006200000',
      '802d808300001bc406200000',
    ]);
    assert.deepEqual(renderedQueue, controlQueue,
      'removing both virtual companion records leaves every native queue request exact');

    const visible = parsedList(renderedDemo.game.ram).filter((sprite) =>
      sprite.x === 45 && sprite.y === 99 && sprite.offs === 0x1520
      && sprite.width === 3 && sprite.height === 32
      && sprite.color === 0 && sprite.flip === 0);
    assert.equal(visible.length, 1, 'the center companion reaches the existing hardware list');
    const rightVisible = parsedList(renderedDemo.game.ram).filter((sprite) =>
      sprite.x === 45 && sprite.y === 131 && sprite.offs === 0x1bc4
      && sprite.width === 3 && sprite.height === 32
      && sprite.color === 0 && sprite.flip === 0);
    assert.equal(rightVisible.length, 1, 'the right companion reaches the existing hardware list');
    assert.deepEqual([
      rendered.memory.u16(P3_VIRTUAL.player + P.posY),
      rendered.memory.u16(P3_VIRTUAL.player + P.posX),
      rendered.memory.u16(P3_VIRTUAL.player + P.shipSel),
      rendered.memory.u16(P3_VIRTUAL.player + P.optFormation),
    ], [0x1179, 0x1cc0, 0, 6]);

    rendered.memory.setU16(P3_VIRTUAL.player + P.shipSel, 2);
    const [typeBBody] = renderThreePilotRequests(rendered, renderedDemo.game);
    assert.deepEqual(requestWords(typeBBody.bytes).slice(2, 4), [0, 0x1bc4],
      'the exact bundle supplies the neutral Type-B image descriptor');
  });
