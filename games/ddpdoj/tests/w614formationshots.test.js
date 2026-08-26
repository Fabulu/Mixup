// W614: private P3 ordinary shots and virtual shot requests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BIT, MACHINE, OPT, P, RAM } from '../src/machine.js';
import { commitCreates, objTableInit24107C } from '../src/objalloc.js';
import {
  P3_VIRTUAL, P3_VIRTUAL_RANGES, THREE_PILOT_SHARED_RANGES,
  THREE_PILOT_FORMATION_MODE, attachThreePilotFoundation,
  prepareThreePilotFrame, runThreePilotOptionObject, runThreePilotShotObject,
} from '../src/formationactors.js';
import {
  NATIVE_ORDINARY_SHOT_OWNERS, runOrdinaryShotPath2497AA,
} from '../src/player.js';
import { shotHandlers, spawnShotWithResources } from '../src/shots.js';
import { NATIVE_SHOT_DRIVER_RESOURCES, SHOT, runShotPool } from '../src/weapons.js';
import { BUCKETS, encodeRecordRequest, RECORD_BYTES } from '../src/spritequeue.js';
import { DMG, shotBoundingBox } from '../src/damage.js';
import { MOD_IDS, MODS } from '../src/mods.js';
import {
  FORMATION_MODE, createFormationState, formationMode, formationToHash,
  hashToFormation,
} from '../src/formation.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'exact browser bundle absent; private P3 shot proof is skipped, not passed';
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

async function exactState({ activateActor = true } = {}) {
  const demo = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz,
    undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
  const state = attachThreePilotFoundation(demo.game, { inputWord: 0xffff });
  if (activateActor) activate(state);
  return { demo, game: demo.game, state };
}

function sidecarBytes(memory, address, length) {
  return Uint8Array.from({ length }, (_, offset) => memory.u8(address + offset));
}

function ramBytes(ram, address, length) {
  return ram.b.slice(address - MACHINE.ramBase, address - MACHINE.ramBase + length);
}

function clearRange(ram, address, length) {
  for (let offset = 0; offset < length; offset++) ram.setU8(address + offset, 0);
}

function copySidecarRange(memory, from, ram, to, length) {
  for (let offset = 0; offset < length; offset++) {
    ram.setU8(to + offset, memory.u8(from + offset));
  }
}

function activeSlots(memory, pool = P3_VIRTUAL.shots) {
  const slots = [];
  for (let slot = 0; slot < SHOT.slots; slot++) {
    if (memory.u16(pool + slot * SHOT.stride) & 0x8000) slots.push(slot);
  }
  return slots;
}

function requestsAt(requests, bucket) {
  return requests.filter((request) => request.bucket === bucket)
    .map((request) => request.bytes);
}

function setP3Buttons(state, raw, edge) {
  state.memory.setU8(P3_VIRTUAL.player + P.dirByte, raw);
  state.memory.setU8(P3_VIRTUAL.player + P.btnByte, edge);
}

function dirtyP3Cadence(state) {
  const player = P3_VIRTUAL.player;
  state.memory.bset8(player + P.flags1, 3);
  state.memory.bset8(player + P.flags1, 4);
  state.memory.bset8(player + P.state, 3);
  state.memory.setU8(player + 0x2a, 0x31);
  state.memory.setU8(player + 0x2b, 0x32);
  state.memory.setU8(player + 0x3c, 0x33);
  state.shots.calls = 7;
  state.weapons.calls = 9;
}

function assertP3CadenceCleared(state) {
  const player = P3_VIRTUAL.player;
  assert.equal(state.memory.btst8(player + P.flags1, 3), 0);
  assert.equal(state.memory.btst8(player + P.flags1, 4), 0);
  assert.equal(state.memory.btst8(player + P.state, 3), 0);
  assert.equal(state.memory.u8(player + 0x2a), 0);
  assert.equal(state.memory.u8(player + 0x2b), 0);
  assert.equal(state.memory.u8(player + 0x3c), 0);
  assert.equal(state.shots.calls, 0);
  assert.equal(state.weapons.calls, 0);
  assert.equal(state.shots.actorId, 0);
  assert.equal(state.weapons.actorId, 0);
}

function primeOptions(state, game) {
  for (let frame = 0; frame < 48; frame++) {
    setP3Buttons(state, 0, 0);
    runThreePilotOptionObject(game);
    state.weapons.requests.length = 0;
  }
  assert.equal(state.memory.u16(P3_VIRTUAL.options + OPT.state) & 0x0002, 0x0002);
}

function produceB1(state, game) {
  primeOptions(state, game);
  setP3Buttons(state, 0x10, 0x10);
  const nativeBefore = game.ram.b.slice();
  runThreePilotShotObject(game);
  const shipRequests = requestsAt(state.shots.requests, 14).map((bytes) => bytes.slice());
  runThreePilotOptionObject(game);
  assert.deepEqual(game.ram.b, nativeBefore,
    'private ship, pod, driver, and presentation production must not mutate native RAM');
  return { nativeBefore, shipRequests };
}

test('W614 capabilities bind one exact 36 by $30 private pool',
  { skip: SKIP_ASSETS }, async () => {
    const shotRange = P3_VIRTUAL_RANGES.find((range) => range.start === P3_VIRTUAL.shots);
    assert.deepEqual(shotRange, {
      name: 'p3-shots-reserved', start: P3_VIRTUAL.shots, length: 36 * 0x30,
    });
    for (const address of [0x80380f, 0x8127e4, 0x8127e8, 0x81308c, 0x813176]) {
      assert.ok(THREE_PILOT_SHARED_RANGES.some((range) =>
        address >= range.start && address < range.start + range.length),
      `$${address.toString(16)} must be a declared narrow capability`);
    }

    const { state, game } = await exactState();
    const resources = state.shots.resources;
    for (const resource of [resources.ship, resources.options, resources.driver]) {
      assert.equal(resource.ownerIndex, 2);
      assert.equal(resource.pool, P3_VIRTUAL.shots);
      assert.equal(resource.slots, 36);
      assert.equal(resource.stride, 0x30);
    }
    assert.equal(resources.ordinary.options, P3_VIRTUAL.options);
    assert.equal(resources.ordinary.autoShotSetting, 0x80380f);
    assert.equal(resources.ship.soundPolicy, 'silent');
    assert.equal(resources.driver.liveCounter, null);
    assert.equal(resources.driver.requestTelemetry, false);
    assert.equal(typeof resources.options.presentationSink, 'function');
    assert.equal(typeof resources.driver.presentationSink, 'function');
    assert.equal(NATIVE_ORDINARY_SHOT_OWNERS.length, 2);
    assert.deepEqual(NATIVE_ORDINARY_SHOT_OWNERS.map((owner) => owner.ownerIndex), [0, 1]);

    const { ownerIndex: omittedOwner, ...ownerlessShip } = resources.ship;
    assert.equal(omittedOwner, 2);
    assert.throws(() => spawnShotWithResources(state.memory, game.rom,
      P3_VIRTUAL.player, {}, ownerlessShip), /must supply owner/);
    assert.throws(() => runOrdinaryShotPath2497AA(state.memory, P3_VIRTUAL.player,
      { rom: game.rom }, {
        ...resources.ordinary,
        shotResources: { ...resources.ship, ownerIndex: 1 },
      }), /matching ownership/);
    assert.throws(() => runShotPool(state.memory, game.rom, shotHandlers(), {}, {
      ...resources.driver, liveCounter: undefined,
    }), /live counter/);
    assert.deepEqual(activeSlots(state.memory), [],
      'malformed capabilities are rejected before private pool mutation');
  });

test('W614 B1 makes ordinary ship and pod shots without entering laser or native RAM',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const liveCountBefore = game.ram.u16(SHOT.liveCount);
    const countersBefore = BUCKETS.map((bucket) => game.ram.u16(bucket.counter));
    const soundBefore = ramBytes(game.ram, 0x81deb4, 0x10);
    const beamBefore = sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40);

    const { shipRequests } = produceB1(state, game);
    assert.deepEqual(activeSlots(state.memory), [0, 1, 14, 21],
      'style 6 uses authentic pod slots 0/1 and ship slots 14/21 in one pool');
    assert.equal(shipRequests.length, 2);
    assert.equal(requestsAt(state.shots.requests, 0).length, 2);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40), beamBefore);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamPool, 32 * 0x30),
      new Uint8Array(32 * 0x30));
    assert.equal(game.ram.u16(SHOT.liveCount), liveCountBefore,
      'P3 never contributes to $81295C');
    assert.deepEqual(BUCKETS.map((bucket) => game.ram.u16(bucket.counter)), countersBefore,
      'P3 never stages a physical sprite request');
    assert.deepEqual(ramBytes(game.ram, 0x81deb4, 0x10), soundBefore,
      'silent private production never touches native sound state');
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.dirByte) & 0x20, 0,
      'B2 remains excluded');
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.dirByte) & 0x80, 0,
      'Start remains excluded');
  });

test('W614 call 8 rejects B2 and Start before any private or native mutation',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    for (const [raw, edge] of [
      [0x20, 0], [0, 0x20], [0x80, 0], [0, 0x80], [0xa0, 0xa0],
    ]) {
      setP3Buttons(state, raw, edge);
      const playerBefore = sidecarBytes(state.memory, P3_VIRTUAL.player, P.stride);
      const optionsBefore = sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride);
      const shotsBefore = sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30);
      const nativeBefore = game.ram.b.slice();
      const ownerBefore = state.shots.actorId;
      const callsBefore = state.shots.calls;
      const requestsBefore = state.shots.requests.slice();

      assert.throws(() => runThreePilotShotObject(game), /excluded B2 or Start/);
      assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.player, P.stride), playerBefore);
      assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride), optionsBefore);
      assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30), shotsBefore);
      assert.deepEqual(game.ram.b, nativeBefore);
      assert.equal(state.shots.actorId, ownerBefore);
      assert.equal(state.shots.calls, callsBefore);
      assert.deepEqual(state.shots.requests, requestsBefore);
    }
  });

test('W614 laser-disabled options keep angle zero on the ordinary formation path',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    primeOptions(state, game);
    setP3Buttons(state, 0, 0);
    state.memory.setU8(P3_VIRTUAL.options + OPT.angle, 0);
    const beamBefore = sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40);
    const nativeBefore = game.ram.b.slice();

    assert.doesNotThrow(() => runThreePilotOptionObject(game));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40), beamBefore);
    assert.deepEqual(game.ram.b, nativeBefore);
    assert.ok(state.weapons.requests.length > 0,
      'angle zero still reaches the private ordinary formation presentation');
  });

test('W614 B3 preserves the authentic alternate-frame ship and pod cadence',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    primeOptions(state, game);
    game.ram.setU8(0x80380f, 1);
    const counts = [];
    for (let frame = 0; frame < 6; frame++) {
      setP3Buttons(state, 0x40, 0);
      runThreePilotShotObject(game);
      runThreePilotOptionObject(game);
      counts.push(activeSlots(state.memory).length);
      state.shots.requests.length = 0;
      state.weapons.requests.length = 0;
    }
    assert.deepEqual(counts, [4, 4, 8, 8, 12, 12]);
    assert.equal(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40)
      .some((byte) => byte !== 0), false);
  });

test('W614 private call 8 is byte-exact and state-exact with normalized native P1',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    setP3Buttons(state, 0x10, 0x10);
    const reference = game.ram.clone();
    clearRange(reference, SHOT.p1Table, SHOT.slots * SHOT.stride);
    copySidecarRange(state.memory, P3_VIRTUAL.player,
      reference, RAM.player1, P.stride);
    copySidecarRange(state.memory, P3_VIRTUAL.options,
      reference, RAM.p1Options, OPT.stride);
    const referenceRequests = [];
    const referenceCtx = { rom: game.rom, tables: game.tables, unportedLog: game.unportedLog };
    runOrdinaryShotPath2497AA(reference, RAM.player1, referenceCtx,
      NATIVE_ORDINARY_SHOT_OWNERS[0]);
    runShotPool(reference, game.rom, shotHandlers(), referenceCtx, {
      ...NATIVE_SHOT_DRIVER_RESOURCES[0],
      liveCounter: null,
      requestTelemetry: false,
      presentationSink: (ram, rec) => referenceRequests.push(encodeRecordRequest(ram, rec)),
    });

    const nativeBefore = game.ram.b.slice();
    runThreePilotShotObject(game);
    assert.deepEqual(game.ram.b, nativeBefore);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.player, P.stride),
      ramBytes(reference, RAM.player1, P.stride));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      ramBytes(reference, RAM.p1Options, OPT.stride));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30),
      ramBytes(reference, SHOT.p1Table, 36 * 0x30));
    assert.deepEqual(requestsAt(state.shots.requests, 14), referenceRequests);
  });

test('W614 call order gives ship shots same-frame drive and pod shots next-frame drive',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const { shipRequests } = produceB1(state, game);
    const pool = P3_VIRTUAL.shots;
    assert.equal(state.memory.u8(pool + 14 * 0x30 + 1) & 0x40, 0x40);
    assert.equal(state.memory.u8(pool + 21 * 0x30 + 1) & 0x40, 0x40);
    assert.equal(state.memory.u8(pool + 0 * 0x30 + 1) & 0x40, 0);
    assert.equal(state.memory.u8(pool + 1 * 0x30 + 1) & 0x40, 0);
    assert.deepEqual(shipRequests, [
      encodeRecordRequest(state.memory, pool + 14 * 0x30),
      encodeRecordRequest(state.memory, pool + 21 * 0x30),
    ]);
    assert.deepEqual(requestsAt(state.shots.requests, 0), [
      encodeRecordRequest(state.memory, pool + 1 * 0x30),
      encodeRecordRequest(state.memory, pool + 0 * 0x30),
    ]);

    state.shots.requests.length = 0;
    state.weapons.requests.length = 0;
    setP3Buttons(state, 0, 0);
    runThreePilotShotObject(game);
    assert.equal(state.memory.u8(pool + 0 * 0x30 + 1) & 0x40, 0x40);
    assert.equal(state.memory.u8(pool + 1 * 0x30 + 1) & 0x40, 0x40);
    assert.deepEqual(requestsAt(state.shots.requests, 14), [0, 1, 14, 21]
      .map((slot) => encodeRecordRequest(state.memory, pool + slot * 0x30)));
  });

test('W614 W613 option requests compose with exact bucket-0 and bucket-14 shot bytes',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    produceB1(state, game);
    const optionBefore = state.weapons.requests.map((request) => ({
      bucket: request.bucket, bytes: request.bytes.slice(),
    }));
    const shotsBefore = state.shots.requests.map((request) => ({
      bucket: request.bucket, bytes: request.bytes.slice(),
    }));
    assert.ok(optionBefore.length > 0);
    assert.equal(requestsAt(shotsBefore, 0).length, 2);
    assert.equal(requestsAt(shotsBefore, 14).length, 2);
    for (const request of shotsBefore) assert.equal(request.bytes.length, RECORD_BYTES);

    const collected = game.virtualSpriteRequestHook(game);
    for (const request of optionBefore) {
      assert.ok(collected.some((candidate) => candidate.bucket === request.bucket
        && Buffer.from(candidate.bytes).equals(Buffer.from(request.bytes))));
    }
    for (const request of shotsBefore) {
      assert.ok(collected.some((candidate) => candidate.bucket === request.bucket
        && Buffer.from(candidate.bytes).equals(Buffer.from(request.bytes))));
    }
    assert.equal(state.weapons.requests.length, 0);
    assert.equal(state.shots.requests.length, 0);
  });

test('W614 native collision scans consume neither private slots nor private ownership',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    state.memory.setU16(P3_VIRTUAL.shots, 0x80c2);
    state.memory.setU16(P3_VIRTUAL.shots + 2, 0x2000);
    state.memory.setU16(P3_VIRTUAL.shots + 4, 0x1800);
    const before = sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30);
    shotBoundingBox(game.ram, DMG.p1shots, 0x2800);
    shotBoundingBox(game.ram, DMG.p2shots, 0x2800);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30), before);

    const damageSource = readFileSync(new URL('../src/damage.js', import.meta.url), 'utf8');
    const tail = damageSource.slice(damageSource.indexOf('export function runType5Tail'));
    assert.match(tail, /table: DMG\.p1shots/);
    assert.match(tail, /table: DMG\.p2shots/);
    assert.equal(tail.includes('P3_VIRTUAL'), false);
    assert.deepEqual([DMG.p1shots, DMG.p2shots], [SHOT.p1Table, SHOT.p2Table]);
  });

test('W614 stage clear, detach, drop, allocator change, and restage clear all weapon state',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    state.memory.setU16(P3_VIRTUAL.shots, 0x8040);
    state.memory.setU16(P3_VIRTUAL.options + OPT.state, 0x8003);
    state.shots.actorId = state.actorId;
    state.weapons.actorId = state.actorId;
    dirtyP3Cadence(state);
    state.shots.requests.push({ bucket: 14, bytes: new Uint8Array(RECORD_BYTES) });
    state.weapons.requests.push({ bucket: 15, bytes: new Uint8Array(RECORD_BYTES) });
    const inputBefore = sidecarBytes(state.memory, P3_VIRTUAL.input.raw, 0x06);

    game.ram.setU16(0x812972, 1);
    prepareThreePilotFrame(state, game, 0xffff);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30),
      new Uint8Array(36 * 0x30));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    assert.equal(state.shots.requests.length, 0);
    assert.equal(state.weapons.requests.length, 0);
    assertP3CadenceCleared(state);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.input.raw, 0x06), inputBefore,
      'weapon cleanup preserves the repaired W613 input mirrors');

    game.ram.setU16(0x812972, 0);
    state.memory.setU16(P3_VIRTUAL.shots, 0x8040);
    state.memory.setU16(P3_VIRTUAL.options + OPT.state, 0x8003);
    state.shots.actorId = state.actorId;
    state.weapons.actorId = state.actorId;
    dirtyP3Cadence(state);
    state.shots.requests.push({ bucket: 14, bytes: new Uint8Array(RECORD_BYTES) });
    state.weapons.requests.push({ bucket: 15, bytes: new Uint8Array(RECORD_BYTES) });
    const oldActorId = state.actorId;
    objTableInit24107C(game.ram);
    state.objectDriverHook({ phase: 'after-driver', ram: game.ram, created: 0, killed: 0 });
    assert.equal(state.lifecycle, 'detached');
    assert.equal(state.actorId, 0);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30),
      new Uint8Array(36 * 0x30));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    assert.equal(state.shots.requests.length, 0);
    assert.equal(state.weapons.requests.length, 0);
    assertP3CadenceCleared(state);

    state.memory.setU16(P3_VIRTUAL.shots, 0x8040);
    state.memory.setU16(P3_VIRTUAL.options + OPT.state, 0x8003);
    dirtyP3Cadence(state);
    prepareThreePilotFrame(state, game, 0xffff);
    assert.equal(state.lifecycle, 'staged');
    assert.notEqual(state.actorId, oldActorId);
    activate(state);
    assert.equal(state.shots.actorId, 0, 'new allocator identity starts with no shot owner');
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30),
      new Uint8Array(36 * 0x30));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    assertP3CadenceCleared(state);

    const dropped = await exactState({ activateActor: false });
    dropped.state.memory.setU16(P3_VIRTUAL.shots, 0x8040);
    dropped.state.memory.setU16(P3_VIRTUAL.options + OPT.state, 0x8003);
    dropped.state.shots.actorId = dropped.state.actorId;
    dropped.state.weapons.actorId = dropped.state.actorId;
    dirtyP3Cadence(dropped.state);
    dropped.state.shots.requests.push({ bucket: 14, bytes: new Uint8Array(RECORD_BYTES) });
    dropped.state.weapons.requests.push({ bucket: 15, bytes: new Uint8Array(RECORD_BYTES) });
    objTableInit24107C(dropped.game.ram);
    dropped.state.objectDriverHook({
      phase: 'after-driver', ram: dropped.game.ram, created: 0, killed: 0,
    });
    assert.equal(dropped.state.lifecycle, 'dropped');
    assert.deepEqual(sidecarBytes(dropped.state.memory, P3_VIRTUAL.shots, 36 * 0x30),
      new Uint8Array(36 * 0x30));
    assert.deepEqual(sidecarBytes(dropped.state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    assert.equal(dropped.state.shots.requests.length, 0);
    assert.equal(dropped.state.weapons.requests.length, 0);
    assertP3CadenceCleared(dropped.state);
  });

test('W614 copied hooks reject cross-Game calls before mutation and Games stay isolated',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    a.state.memory.setU16(P3_VIRTUAL.shots, 0x8040);
    a.state.shots.requests.push({ bucket: 14, bytes: new Uint8Array(RECORD_BYTES).fill(0x61) });
    const aBefore = sidecarBytes(a.state.memory, P3_VIRTUAL.shots, 36 * 0x30);
    const aRequests = a.state.shots.requests.map((request) => request.bytes.slice());
    const bBefore = sidecarBytes(b.state.memory, P3_VIRTUAL.shots, 36 * 0x30);
    assert.throws(() => a.game.privateShotObjectHook(b.game), /different Game/);
    assert.deepEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.shots, 36 * 0x30), aBefore);
    assert.deepEqual(a.state.shots.requests.map((request) => request.bytes), aRequests);
    assert.deepEqual(sidecarBytes(b.state.memory, P3_VIRTUAL.shots, 36 * 0x30), bBefore);

    b.game.privateShotObjectHook = a.game.privateShotObjectHook;
    assert.throws(() => b.demo.step(), /different Game/);
    assert.deepEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.shots, 36 * 0x30), aBefore,
      'the Game context passes its invoking Game to a copied private hook');
    assert.deepEqual(a.state.shots.requests.map((request) => request.bytes), aRequests);

    a.state.memory.setU16(P3_VIRTUAL.shots, 0);
    a.state.shots.requests.length = 0;
    setP3Buttons(a.state, 0x10, 0x10);
    runThreePilotShotObject(a.game);
    assert.ok(activeSlots(a.state.memory).length > 0);
    assert.deepEqual(activeSlots(b.state.memory), []);
    assert.equal(b.state.shots.requests.length, 0);
  });

test('W614 call-8 and call-9 hooks remain private, ordered, replay-closed, and 32-mod closed',
  async () => {
    const id = THREE_PILOT_FORMATION_MODE.id;
    assert.equal(formationMode(id), null);
    assert.equal(hashToFormation(`#formation=${id}`), null);
    assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE), '');
    assert.equal(MOD_IDS.length, 32);
    assert.equal(MOD_IDS.includes(id), false);
    assert.equal(Object.hasOwn(MODS, id), false);
    for (const page of ['../start.html', '../index.html']) {
      const source = readFileSync(new URL(page, import.meta.url), 'utf8');
      assert.equal(source.includes(id), false);
      assert.equal(source.includes(THREE_PILOT_FORMATION_MODE.name), false);
    }

    const type5 = readFileSync(new URL('../src/type5.js', import.meta.url), 'utf8');
    const shot = type5.indexOf('ctx.shotsProcessed = runShotDriver');
    const privateShot = type5.indexOf('ctx.privateShotObjectHook?.()', shot);
    const nativeOptions = type5.indexOf('runOptionObject(ram, ctx)', privateShot);
    const privateOptions = type5.indexOf('ctx.privateOptionObjectHook?.()', nativeOptions);
    assert.ok(shot >= 0 && shot < privateShot && privateShot < nativeOptions
      && nativeOptions < privateOptions);

    const formation = createFormationState(FORMATION_MODE);
    await assert.rejects(() => Demo.prototype.armRecording.call({
      formation,
      recorder: { keep: true },
      playback: { keep: true },
      get game() { throw new Error('REC touched Game before replay refusal'); },
    }), /Replay v1 cannot encode formation state/);
  });
