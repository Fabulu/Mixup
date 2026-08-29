// W615: private P3 laser ownership, segment presentation, and beam draw.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BIT, MACHINE, OPT, P, RAM } from '../src/machine.js';
import { portWordFromPlayerBits } from '../src/input.js';
import { commitCreates, objTableInit24107C } from '../src/objalloc.js';
import {
  FORMATION_ACTOR_BINDINGS, P3_FORMATION_ACTOR_BINDING, P3_VIRTUAL,
  P3_VIRTUAL_RANGES, THREE_PILOT_FORMATION_MODE, attachThreePilotFoundation,
  prepareThreePilotFrame, runThreePilotBeamDrawObject, runThreePilotOptionObject,
  runThreePilotSegmentObject, runThreePilotShotObject,
} from '../src/formationactors.js';
import { BEAM, LASER, PRIVATE_BEAM_GEOMETRY, S, SEG, assertPrivateBeamCapabilities,
  runBeamDraw, runSegmentDriver } from '../src/laser.js';
import { OPTION_BLOCKS, assertOptionOwnerInputAllowed, runOptionBlock } from '../src/options.js';
import { BUCKETS, RECORD_BYTES, encodeRecordRequest, resolveEmitStub } from '../src/spritequeue.js';
import { MOD_IDS, MODS } from '../src/mods.js';
import {
  FORMATION_MODE, createFormationState, formationMode, formationToHash, hashToFormation,
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
  : 'exact browser bundle absent; private P3 laser proof is skipped, not passed';
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

async function exactState(activateActor = true) {
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
  for (let offset = 0; offset < length; offset++) ram.setU8(to + offset, memory.u8(from + offset));
}

function setP3Buttons(state, raw, edge) {
  state.memory.setU8(P3_VIRTUAL.player + P.dirByte, raw);
  state.memory.setU8(P3_VIRTUAL.player + P.btnByte, edge);
}

function primeOptions(state, game) {
  for (let frame = 0; frame < 48; frame++) {
    setP3Buttons(state, 0, 0);
    runThreePilotOptionObject(game);
    state.weapons.requests.length = 0;
  }
  assert.equal(state.memory.u16(P3_VIRTUAL.options + OPT.state) & 0x0002, 0x0002);
}

function activeBeamSlots(memory, pool = P3_VIRTUAL.beamPool) {
  const slots = [];
  for (let slot = 0; slot < SEG.slots; slot++) {
    if (memory.u16(pool + slot * SEG.stride) !== 0) slots.push(slot);
  }
  return slots;
}

function physicalRequests(ram, bucket) {
  const def = BUCKETS[bucket];
  const length = ram.u16(def.counter);
  const bytes = ramBytes(ram, def.buffer, length);
  const requests = [];
  for (let offset = 0; offset < bytes.length; offset += RECORD_BYTES) {
    requests.push(bytes.slice(offset, offset + RECORD_BYTES));
  }
  return requests;
}

function clearPhysicalCounters(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

function assertBytesEqual(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
}

function assertPrivateMatchesP1(state, reference, frame) {
  const b = state.beam.resources;
  const p1 = BEAM[0];
  assertBytesEqual(sidecarBytes(state.memory, b.player, P.stride),
    ramBytes(reference, p1.player, P.stride), `player frame ${frame}`);
  assertBytesEqual(sidecarBytes(state.memory, b.opt, OPT.stride),
    ramBytes(reference, p1.opt, OPT.stride), `options frame ${frame}`);
  assertBytesEqual(sidecarBytes(state.memory, b.pool, SEG.slots * SEG.stride),
    ramBytes(reference, p1.pool, SEG.slots * SEG.stride), `pool frame ${frame}`);
  assertBytesEqual(sidecarBytes(state.memory, b.rec, 0x20),
    ramBytes(reference, p1.rec, 0x20), `control frame ${frame}`);
  assertBytesEqual(sidecarBytes(state.memory, b.blk, 0x20),
    ramBytes(reference, p1.blk, 0x20), `draw frame ${frame}`);
  assert.equal(state.memory.u16(b.word), reference.u16(p1.word), `beam word frame ${frame}`);
  assertBytesEqual(sidecarBytes(state.memory, b.posHistory, 0x40),
    ramBytes(reference, p1.posHistory, 0x40), `position history frame ${frame}`);
  assertBytesEqual(sidecarBytes(state.memory, b.imgHistory, 0x40),
    ramBytes(reference, p1.imgHistory, 0x40), `image history frame ${frame}`);
}

function dirtyBeam(state) {
  const b = state.beam.resources;
  state.memory.setU16(b.rec, 0x8010);
  state.memory.setU16(b.blk, 0x8000);
  state.memory.setU16(b.word, 0x3456);
  state.memory.setU16(b.pool, 0x8002);
  state.memory.setU32(b.posHistory, 0x12345678);
  state.memory.setU32(b.imgHistory, 0x87654321);
  state.beam.requests.push({ bucket: LASER.emitBucket, bytes: new Uint8Array(RECORD_BYTES) });
  state.beam.actorId = state.actorId;
  state.beam.segmentCalls = 3;
  state.beam.drawCalls = 4;
}

function assertBeamCleared(state, telemetry = true) {
  const b = state.beam.resources;
  assertBytesEqual(sidecarBytes(state.memory, b.rec, 0x42), new Uint8Array(0x42));
  assertBytesEqual(sidecarBytes(state.memory, b.pool, SEG.slots * SEG.stride),
    new Uint8Array(SEG.slots * SEG.stride));
  assertBytesEqual(sidecarBytes(state.memory, b.posHistory, 0x40), new Uint8Array(0x40));
  assertBytesEqual(sidecarBytes(state.memory, b.imgHistory, 0x40), new Uint8Array(0x40));
  assert.equal(state.beam.requests.length, 0);
  if (telemetry) {
    assert.equal(state.beam.segmentCalls, 0);
    assert.equal(state.beam.drawCalls, 0);
  }
}

test('W615 exact private geometry separates logical owner from P1 polarity',
  { skip: SKIP_ASSETS }, async () => {
    assert.equal(BEAM.length, 2);
    assert.equal(OPTION_BLOCKS.length, 2);
    assert.deepEqual(BEAM.map((beam) => beam.ownerIndex), [0, 1]);
    assert.equal(FORMATION_ACTOR_BINDINGS.length, 3);
    assert.equal(P3_FORMATION_ACTOR_BINDING.logicalIndex, 2);

    assert.deepEqual(PRIVATE_BEAM_GEOMETRY, {
      ownerIndex: 2,
      player: 0x10000100,
      opt: 0x10000200,
      control: 0x10000b00,
      draw: 0x10000b20,
      word: 0x10000b40,
      pool: 0x10000c00,
      poolEnd: 0x10001200,
      posHistory: 0x10001200,
      imgHistory: 0x10001240,
      historyBytes: 0x40,
      head: 0x10001110,
      muzzle: 0x10001140,
      pair: 0x100011a0,
      dispatch: LASER.dispatchP1,
      drawBias: 0x180,
    });
    const ranges = new Map(P3_VIRTUAL_RANGES.map((range) => [range.start, range]));
    assert.equal(ranges.get(P3_VIRTUAL.beamPool).length, 32 * 0x30);
    assert.equal(ranges.get(P3_VIRTUAL.positionHistory).length, 0x40);
    assert.equal(ranges.get(P3_VIRTUAL.imageHistory).length, 0x40);
    assert.equal(P3_VIRTUAL.imageHistory + 0x40 <= P3_VIRTUAL.hyper, true);

    const { state, game } = await exactState();
    const b = state.beam.resources;
    assert.equal(assertPrivateBeamCapabilities(b), b);
    assert.equal(b.ownerIndex, 2);
    assert.equal(b.d7, 1);
    assert.equal(b.segmentOwnerWord, 1);
    assert.equal(b.dispatch, LASER.dispatchP1);
    assert.equal(b.drawBias, 0x180);
    assert.equal(b.head, b.pool + 0x510);
    assert.equal(b.muzzle, b.pool + 0x540);
    assert.equal(b.pair, b.pool + 0x5a0);
    assert.equal(b.presentationBucket, 16);
    assert.deepEqual(resolveEmitStub(game.rom, LASER.emitStub), { bucket: 16, conv: 'record' });
    assert.equal(b.soundPolicy, 'silent');
    assert.equal(b.effectPolicy, 'none');
    state.render.positionHistory[3] = 0x12345678;
    assert.equal(state.memory.u32(b.posHistory + 12), 0x12345678);
    state.memory.setU32(b.imgHistory + 20, 0x87654321);
    assert.equal(state.render.imageHistory[5], 0x87654321,
      'rendering and laser use one address-backed history authority');

    const before = sidecarBytes(state.memory, b.rec, 0x42);
    for (const malformed of [
      { ...b, ownerIndex: 0 },
      { ...b, d7: 0 },
      { ...b, segmentOwnerWord: 0 },
      { ...b, pool: BEAM[0].pool },
      { ...b, dispatch: LASER.dispatchP2 },
      { ...b, pair: BEAM[0].pair },
      { ...b, posHistory: BEAM[0].posHistory },
      { ...b, presentationBucket: 15 },
      { ...b, presentationSink: null },
    ]) {
      assert.throws(() => assertPrivateBeamCapabilities(malformed), /private beam/);
      assertBytesEqual(sidecarBytes(state.memory, b.rec, 0x42), before,
        'capability refusal precedes mutation');
    }
  });

test('W615 private laser is state and request exact with normalized native P1',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    primeOptions(state, game);
    game.ram.setU16(0x80390c, 0);
    game.ram.setU16(0x81308c, 1);
    let privateSoundPosts = 0;
    let nativeSegmentSoundPosts = 0;
    let inNativeSegment = false;
    game.soundPost = () => { privateSoundPosts++; };

    const reference = game.ram.clone();
    const p1 = BEAM[0];
    const p2 = BEAM[1];
    copySidecarRange(state.memory, P3_VIRTUAL.player, reference, p1.player, P.stride);
    copySidecarRange(state.memory, P3_VIRTUAL.options, reference, p1.opt, OPT.stride);
    for (const beam of [p1, p2]) {
      clearRange(reference, beam.pool, SEG.slots * SEG.stride);
      clearRange(reference, beam.rec, 0x20);
      clearRange(reference, beam.blk, 0x20);
      reference.setU16(beam.word, 0);
      clearRange(reference, beam.posHistory, 0x40);
      clearRange(reference, beam.imgHistory, 0x40);
    }
    reference.setU16(p2.player, 0);
    clearRange(reference, 0x810572, 36 * 0x30);
    reference.setU16(0x81294c, 0);
    const ctx = {
      rom: game.rom,
      tables: game.tables,
      unportedLog: game.unportedLog,
      soundPost: () => {
        if (inNativeSegment) nativeSegmentSoundPosts++;
      },
    };

    let sawMuzzle = false;
    let sawControl = false;
    let sawPair = false;
    let sawHead = false;
    let sawDraw = false;
    let sawGrowth = false;
    let sawRequests = false;
    let sawBodyDividerStep = false;
    for (let frame = 0; frame < 48; frame++) {
      const edge = frame === 0 ? 0x10 : 0;
      setP3Buttons(state, 0x10, edge);
      reference.setU8(p1.player + P.dirByte, 0x10);
      reference.setU8(p1.player + P.btnByte, edge);
      clearPhysicalCounters(reference);

      runOptionBlock(reference, ctx, OPTION_BLOCKS[0]);
      runThreePilotOptionObject(game);
      inNativeSegment = true;
      const nativeSegments = runSegmentDriver(reference, ctx);
      inNativeSegment = false;
      const privateSegments = runThreePilotSegmentObject(game);
      const nativeDraw = runBeamDraw(reference, ctx);
      const privateDraw = runThreePilotBeamDrawObject(game);

      assert.equal(privateSegments, nativeSegments, `segment count frame ${frame}`);
      assert.equal(privateDraw, nativeDraw, `draw count frame ${frame}`);
      assertPrivateMatchesP1(state, reference, frame);
      assert.deepEqual(state.beam.requests.map((request) => request.bucket),
        new Array(state.beam.requests.length).fill(LASER.emitBucket));
      assert.deepEqual(state.beam.requests.map((request) => request.bytes),
        physicalRequests(reference, LASER.emitBucket), `virtual request order frame ${frame}`);

      const slots = activeBeamSlots(state.memory);
      sawMuzzle ||= slots.includes(28);
      sawControl ||= (state.memory.u16(state.beam.resources.rec) & 0x8000) !== 0;
      sawPair ||= slots.includes(30) || slots.includes(31);
      sawHead ||= slots.includes(27);
      sawDraw ||= (state.memory.u16(state.beam.resources.blk) & 0x8000) !== 0;
      sawGrowth ||= slots.filter((slot) => slot < 27).length >= 3;
      sawRequests ||= state.beam.requests.length > 1;
      sawBodyDividerStep ||= slots.some((slot) => {
        const rec = state.beam.resources.pool + slot * SEG.stride;
        const type = state.memory.u16(rec + S.type) & 0x1f;
        return [1, 6, 11, 16].includes(type)
          && state.memory.u8(rec + S.w26) !== state.memory.u8(rec + S.w26 + 1);
      });
    }
    assert.equal(sawBodyDividerStep, true,
      'private body records advance the authentic effect-divider cadence');
    assert.ok(nativeSegmentSoundPosts > 0,
      'the normalized native segment owner reaches an observable sound site');
    assert.equal(privateSoundPosts, 0,
      'the same private call-10 context remains silent at that sound site');

    // The native bright column is armed by the excluded collision pass. Supply
    // only its observable control bit to both owners, then prove call 10 builds
    // the draw record and call 11 appends the same request without running damage.
    const privateBeam = state.beam.resources;
    state.memory.bset8(privateBeam.rec, 4);
    reference.bset8(p1.rec, 4);
    setP3Buttons(state, 0x10, 0);
    reference.setU8(p1.player + P.dirByte, 0x10);
    reference.setU8(p1.player + P.btnByte, 0);
    clearPhysicalCounters(reference);
    runOptionBlock(reference, ctx, OPTION_BLOCKS[0]);
    runThreePilotOptionObject(game);
    const nativeSegments = runSegmentDriver(reference, ctx);
    const privateSegments = runThreePilotSegmentObject(game);
    assert.equal(privateSegments, nativeSegments);
    assert.ok((state.memory.u16(privateBeam.blk) & 0x8000) !== 0,
      'the normalized native hit marker lets call 10 build the draw record');
    const segmentRequestCount = state.beam.requests.length;
    const nativeDraw = runBeamDraw(reference, ctx);
    const privateDraw = runThreePilotBeamDrawObject(game);
    assert.equal(privateDraw, nativeDraw);
    assert.ok(privateDraw > 0, 'the distinct private call 11 emits the beam column');
    assert.ok(state.beam.requests.length > segmentRequestCount,
      'call 11 appends after all call-10 segment requests');
    assertPrivateMatchesP1(state, reference, 'normalized draw');
    assert.deepEqual(state.beam.requests.map((request) => request.bytes),
      physicalRequests(reference, LASER.emitBucket), 'normalized draw request order');
    sawDraw = true;
    sawRequests ||= segmentRequestCount > 0;

    assert.equal(sawMuzzle, true, 'slot 28 seeds the two-stage bootstrap');
    assert.equal(sawControl, true, 'the private control record becomes live');
    assert.equal(sawPair, true, 'the private pair starts at slot 30');
    assert.equal(sawHead, true, 'the private head uses slot 27');
    assert.equal(sawDraw, true, 'the private draw record becomes live');
    assert.equal(sawGrowth, true, 'ordinary body segments grow independently');
    assert.equal(sawRequests, true, 'segment requests precede the beam-draw request');

    setP3Buttons(state, 0, 0);
    reference.setU8(p1.player + P.dirByte, 0);
    reference.setU8(p1.player + P.btnByte, 0);
    clearPhysicalCounters(reference);
    runOptionBlock(reference, ctx, OPTION_BLOCKS[0]);
    runThreePilotOptionObject(game);
    runSegmentDriver(reference, ctx);
    runThreePilotSegmentObject(game);
    runBeamDraw(reference, ctx);
    runThreePilotBeamDrawObject(game);
    assertPrivateMatchesP1(state, reference, 'release');
    assert.deepEqual(activeBeamSlots(state.memory), []);
    assert.equal(state.memory.u16(state.beam.resources.rec), 0);
    assert.equal(state.memory.u16(state.beam.resources.blk), 0);
  });

test('W615 real type-5 frames invoke both private hooks and publish held-B1 segments',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const companions = state.manager.companions;
    const segmentCalls = companions.map((companion) => companion.beam.segmentCalls);
    const drawCalls = companions.map((companion) => companion.beam.drawCalls);
    const idle = portWordFromPlayerBits([]);
    const heldB1 = portWordFromPlayerBits([BIT.b1]);
    for (let frame = 0; frame < 48; frame++) {
      game.step(prepareThreePilotFrame(state, game, idle));
    }
    let sawVirtualBeam = false;
    for (let frame = 0; frame < 48; frame++) {
      game.step(prepareThreePilotFrame(state, game, heldB1));
      sawVirtualBeam ||= game.displayList.perBucketVirtualRecords[LASER.emitBucket] > 0;
    }
    assert.deepEqual(companions.map((companion) => companion.beam.segmentCalls),
      segmentCalls.map((calls) => calls + 96));
    assert.deepEqual(companions.map((companion) => companion.beam.drawCalls),
      drawCalls.map((calls) => calls + 96));
    for (const companion of companions) {
      assert.ok(activeBeamSlots(companion.memory, companion.binding.beam.pool).length > 0);
      assert.ok((companion.memory.u16(companion.beam.resources.rec) & 0x8000) !== 0);
    }
    assert.equal(sawVirtualBeam, true,
      'the merged display list receives both companions private bucket-16 segment records');
  });

test('W615 private calls compose with shots and options without native mutation',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    primeOptions(state, game);
    const nativeBefore = game.ram.b.slice();
    const bombBefore = sidecarBytes(state.memory, P3_VIRTUAL.bomb, 0x20);
    let soundPosts = 0;
    game.soundPost = () => { soundPosts++; };
    let maxShots = 0;
    let maxOptions = 0;
    let maxBeam = 0;
    let sawShotBucket = false;
    let sawOptionBucket = false;
    let sawBeamBucket = false;
    let sawOrderedComposition = false;
    for (let frame = 0; frame < 42; frame++) {
      setP3Buttons(state, 0x10, frame === 0 ? 0x10 : 0);
      runThreePilotShotObject(game);
      runThreePilotOptionObject(game);
      runThreePilotSegmentObject(game);
      runThreePilotBeamDrawObject(game);
      maxShots = Math.max(maxShots, state.shots.requests.length);
      maxOptions = Math.max(maxOptions, state.weapons.requests.length);
      maxBeam = Math.max(maxBeam, state.beam.requests.length);
      const collected = game.virtualSpriteRequestHook(game);
      const shotIndex = collected.findIndex((request) => request.bucket === 0
        || request.bucket === 14);
      const optionIndex = collected.findIndex((request) => request.bucket === 15);
      const beamIndex = collected.findIndex((request) => request.bucket === LASER.emitBucket);
      sawShotBucket ||= shotIndex >= 0;
      sawOptionBucket ||= optionIndex >= 0;
      sawBeamBucket ||= beamIndex >= 0;
      if (shotIndex >= 0 && optionIndex >= 0 && beamIndex >= 0) {
        assert.ok(shotIndex < optionIndex && optionIndex < beamIndex,
          'collection keeps call-8 shots before call-9 options before call-10/11 beam');
        sawOrderedComposition = true;
      }
    }
    assert.ok(maxShots > 0, 'W614 ordinary shot requests remain active');
    assert.ok(maxOptions > 0, 'W613 option requests remain active');
    assert.ok(maxBeam > 0, 'W615 beam requests compose after them');
    assert.equal(sawShotBucket, true);
    assert.equal(sawOptionBucket, true);
    assert.equal(sawBeamBucket, true);
    assert.equal(sawOrderedComposition, true);
    assert.deepEqual(game.ram.b, nativeBefore,
      'private call 8 through call 11 do not mutate native RAM or physical staging');
    assertBytesEqual(sidecarBytes(state.memory, P3_VIRTUAL.bomb, 0x20), bombBefore,
      'the excluded private bomb range remains unchanged');

    assert.equal(soundPosts, 0, 'private beam bootstrap and segments stay silent');
    assert.equal(game.beamHitsA, 0);
    assert.equal(game.beamHitsB, 0);
    assert.equal(game.beamErased, 0);
    assert.equal(game.beamDamageFrames, 0);
  });

test('W615 B2 and Start reject before mutation while laser is enabled',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    primeOptions(state, game);
    assert.equal(state.beam.resources.scope, 'private');
    for (const [raw, edge] of [[0x20, 0], [0, 0x20], [0x80, 0], [0, 0x80]]) {
      setP3Buttons(state, raw, edge);
      const sidecarBefore = P3_VIRTUAL_RANGES.map((range) =>
        sidecarBytes(state.memory, range.start, range.length));
      const nativeBefore = game.ram.b.slice();
      const requestsBefore = state.beam.requests.map((request) => request.bytes.slice());
      assert.throws(() => assertOptionOwnerInputAllowed(state.memory, {
        ownerIndex: 2,
        player: P3_VIRTUAL.player,
        opt: P3_VIRTUAL.options,
        rampGuard: P3_VIRTUAL.bomb,
        allowLaser: false,
      }), /excluded B2 or Start/,
      'rejection is independent of allowLaser');
      assert.throws(() => runThreePilotOptionObject(game), /excluded B2 or Start/);
      assert.throws(() => runThreePilotSegmentObject(game), /excluded B2 or Start/);
      assert.throws(() => runThreePilotBeamDrawObject(game), /excluded B2 or Start/);
      assert.deepEqual(P3_VIRTUAL_RANGES.map((range) =>
        sidecarBytes(state.memory, range.start, range.length)), sidecarBefore);
      assert.deepEqual(game.ram.b, nativeBefore);
      assert.deepEqual(state.beam.requests.map((request) => request.bytes), requestsBefore);
    }
  });

test('W615 bomb guard is read-only and lifecycle cleanup clears every beam authority',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    primeOptions(state, game);
    for (let offset = 2; offset < 0x20; offset++) {
      state.memory.setU8(P3_VIRTUAL.bomb + offset, (offset * 7) & 0xff);
    }
    const bombBefore = sidecarBytes(state.memory, P3_VIRTUAL.bomb, 0x20);
    assert.equal(state.memory.u16(P3_VIRTUAL.bomb), 0);
    let guardReads = 0;
    const originalU16 = state.memory.u16.bind(state.memory);
    state.memory.u16 = (address) => {
      if (address === P3_VIRTUAL.bomb) guardReads++;
      return originalU16(address);
    };
    setP3Buttons(state, 0, 0);
    runThreePilotOptionObject(game);
    state.memory.u16 = originalU16;
    assert.ok(guardReads > 0, 'rampGuard reads the private invariant-zero word');
    assertBytesEqual(sidecarBytes(state.memory, P3_VIRTUAL.bomb, 0x20), bombBefore);

    dirtyBeam(state);
    game.ram.setU16(0x812972, 1);
    prepareThreePilotFrame(state, game, 0xffff);
    assertBeamCleared(state);
    assertBytesEqual(sidecarBytes(state.memory, P3_VIRTUAL.bomb, 0x20), bombBefore);

    game.ram.setU16(0x812972, 0);
    state.memory.setU16(P3_VIRTUAL.player + P.state, 0x8000);
    dirtyBeam(state);
    state.memory.setU16(P3_VIRTUAL.player + P.state, 0x8100);
    assert.equal(runThreePilotSegmentObject(game), 0);
    assertBeamCleared(state);

    state.memory.setU16(P3_VIRTUAL.player + P.state, 0x8000);
    dirtyBeam(state);
    state.actorId++;
    runThreePilotSegmentObject(game);
    assertBeamCleared(state, false);
    assert.equal(state.beam.segmentCalls, 1,
      'the new identity starts fresh telemetry only after cleanup');

    objTableInit24107C(game.ram);
    state.objectDriverHook({ phase: 'after-driver', ram: game.ram, created: 0, killed: 0 });
    assert.equal(state.lifecycle, 'detached');
    assertBeamCleared(state);
    prepareThreePilotFrame(state, game, 0xffff);
    assert.equal(state.lifecycle, 'staged');
    activate(state);
    assertBeamCleared(state);

    const dropped = await exactState(false);
    dirtyBeam(dropped.state);
    objTableInit24107C(dropped.game.ram);
    dropped.state.objectDriverHook({
      phase: 'after-commit', ram: dropped.game.ram, created: 0, killed: 0,
    });
    assert.equal(dropped.state.lifecycle, 'detached');
    assertBeamCleared(dropped.state);
  });

test('W615 call-10 and call-11 hooks reject cross-Game use and remain isolated',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    dirtyBeam(a.state);
    const aBefore = sidecarBytes(a.state.memory, P3_VIRTUAL.beamControl, 0x42);
    const bBefore = sidecarBytes(b.state.memory, P3_VIRTUAL.beamControl, 0x42);
    assert.throws(() => a.game.privateSegmentDriverHook(b.game), /different Game/);
    assert.throws(() => a.game.privateBeamDrawHook(b.game), /different Game/);
    assertBytesEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.beamControl, 0x42), aBefore);
    assertBytesEqual(sidecarBytes(b.state.memory, P3_VIRTUAL.beamControl, 0x42), bBefore);

    b.game.privateSegmentDriverHook = a.game.privateSegmentDriverHook;
    assert.throws(() => b.demo.step(), /different Game/,
      'Game context passes the invoking Game to a copied call-10 hook');
    assertBytesEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.beamControl, 0x42), aBefore);
    assertBytesEqual(sidecarBytes(b.state.memory, P3_VIRTUAL.beamControl, 0x42), bBefore);

    const c = await exactState();
    const cBefore = sidecarBytes(c.state.memory, P3_VIRTUAL.beamControl, 0x42);
    c.game.privateBeamDrawHook = a.game.privateBeamDrawHook;
    assert.throws(() => c.demo.step(), /different Game/,
      'Game context passes the invoking Game to a copied call-11 hook');
    assertBytesEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.beamControl, 0x42), aBefore);
    assertBytesEqual(sidecarBytes(c.state.memory, P3_VIRTUAL.beamControl, 0x42), cBefore);
  });

test('W615 ordering, privacy, replay refusal, and public formation closure stay explicit', async () => {
  const type5 = readFileSync(new URL('../src/type5.js', import.meta.url), 'utf8');
  const call8 = type5.indexOf('ctx.shotsProcessed = runShotDriver');
  const private8 = type5.indexOf('ctx.privateShotObjectHook?.(ctx)', call8);
  const call9 = type5.indexOf('runOptionObject(ram, ctx)', private8);
  const private9 = type5.indexOf('ctx.privateOptionObjectHook?.()', call9);
  const call10 = type5.indexOf('ctx.laserSegments = runSegmentDriver', private9);
  const private10 = type5.indexOf('ctx.privateSegmentDriverHook?.()', call10);
  const call11 = type5.indexOf('ctx.laserDrawn = runBeamDraw', private10);
  const private11 = type5.indexOf('ctx.privateBeamDrawHook?.()', call11);
  const call12 = type5.indexOf('ctx.sparkFrame = runSparkDriver', private11);
  assert.ok(call8 < private8 && private8 < call9 && call9 < private9
    && private9 < call10 && call10 < private10 && private10 < call11
    && call11 < private11 && private11 < call12);
  assert.equal(type5.includes('privateSpark'), false);

  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /installedPrivateSegmentHook\(this\)/);
  assert.match(main, /installedPrivateBeamDrawHook\(this\)/);

  const id = THREE_PILOT_FORMATION_MODE.id;
  assert.strictEqual(formationMode(id), THREE_PILOT_FORMATION_MODE);
  assert.strictEqual(hashToFormation(`#formation=${id}`), THREE_PILOT_FORMATION_MODE);
  assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE), `formation=${id}`);
  assert.equal(MOD_IDS.length, 36);
  assert.equal(MOD_IDS.includes(id), false);
  assert.equal(Object.hasOwn(MODS, id), false);
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  assert.match(start, /id="formation-three"/);
  assert.match(start, /All Three Ships/);

  const formation = createFormationState(FORMATION_MODE);
  await assert.rejects(() => Demo.prototype.armRecording.call({
    formation,
    recorder: { keep: true },
    playback: { keep: true },
    get game() { throw new Error('REC touched Game before replay refusal'); },
  }), /Replay v1 cannot encode formation state/);

  assert.equal(encodeRecordRequest({
    u16(address) { return address & 0xffff; },
  }, 0).length, RECORD_BYTES);
  assert.equal(P3_FORMATION_ACTOR_BINDING.beam.control >= 0x1000000, true);
  assert.equal(RAM.p1Options < 0x1000000, true);
});
