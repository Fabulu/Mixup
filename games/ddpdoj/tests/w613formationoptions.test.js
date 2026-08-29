// W613: private P3 options and virtual pod requests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BIT, MACHINE, OPT, P, RAM } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { commitCreates } from '../src/objalloc.js';
import {
  P3_VIRTUAL, P3_VIRTUAL_RANGES, THREE_PILOT_SHARED_RANGES,
  THREE_PILOT_FORMATION_MODE, attachThreePilotFoundation,
  prepareThreePilotFrame, runThreePilotOptionObject,
} from '../src/formationactors.js';
import { OPTION_BLOCKS, runOptionBlock } from '../src/options.js';
import { BUCKETS, NAMED_BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
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
  : 'exact browser bundle absent; private P3 option proof is skipped, not passed';
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

function ramBytes(ram, address, length) {
  return ram.b.slice(address - MACHINE.ramBase, address - MACHINE.ramBase + length);
}

function sidecarBytes(memory, address, length) {
  return Uint8Array.from({ length }, (_, offset) => memory.u8(address + offset));
}

function activate(state) {
  const created = commitCreates(state.game.ram);
  state.objectDriverHook({
    phase: 'after-commit', ram: state.game.ram, created, killed: 0,
  });
  assert.equal(state.lifecycle, 'alive');
}

async function exactState() {
  const bundle = await localBundle();
  const demo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
    undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
  demo.game.ram.setU8(RAM.player1 + P.speedIdx, 0x7f);
  demo.game.ram.setU8(RAM.player2 + P.speedIdx, 0x3e);
  demo.game.ram.setU16(RAM.player1 + P.shipSel, 2);
  demo.game.ram.setU16(RAM.player2 + P.optFormation, 2);
  const state = attachThreePilotFoundation(demo.game, { inputWord: 0xffff });
  activate(state);
  return { demo, game: demo.game, state };
}

function clearPhysicalCounters(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

function physicalRequests(ram, bucketIndex) {
  const bucket = BUCKETS[bucketIndex];
  const count = ram.u16(bucket.counter) / RECORD_BYTES;
  return Array.from({ length: count }, (_, index) =>
    ramBytes(ram, bucket.buffer + index * RECORD_BYTES, RECORD_BYTES));
}

function virtualRequests(state, bucket) {
  return state.weapons.requests
    .filter((request) => request.bucket === bucket)
    .map((request) => request.bytes);
}

function copySidecarPlayerToP1(state, ram) {
  for (let offset = 0; offset < P.stride; offset++) {
    ram.setU8(RAM.player1 + offset, state.memory.u8(P3_VIRTUAL.player + offset));
  }
  for (let offset = 0; offset < OPT.stride; offset++) {
    ram.setU8(RAM.p1Options + offset, 0);
  }
  ram.setU16(RAM.p1Options + OPT.state, 0x8000);
}

test('W613 virtual ranges stay exact, disjoint, strict, and capability bounded',
  { skip: SKIP_ASSETS }, async () => {
    const ranges = P3_VIRTUAL_RANGES.map(({ name, start, length }) => ({ name, start, length }));
    assert.deepEqual(ranges.slice(0, 3), [
      { name: 'p3-input', start: P3_VIRTUAL.input.raw, length: 0x06 },
      { name: 'p3-player', start: P3_VIRTUAL.player, length: P.stride },
      { name: 'p3-options', start: P3_VIRTUAL.options, length: OPT.stride },
    ]);
    for (let index = 1; index < P3_VIRTUAL_RANGES.length; index++) {
      const previous = P3_VIRTUAL_RANGES[index - 1];
      const current = P3_VIRTUAL_RANGES[index];
      assert.ok(previous.start + previous.length <= current.start,
        `${previous.name} must not overlap ${current.name}`);
    }
    assert.ok(THREE_PILOT_SHARED_RANGES.some((range) => range.writable === false));

    const { state, game } = await exactState();
    assert.throws(() => state.memory.setU16(0x812972, 1), /stage-clear is read-only/);
    assert.throws(() => state.memory.bset8(0x8130d2, 0), /movement-disable is read-only/);
    assert.throws(() => state.memory.setU8(RAM.player1 + P.speedIdx, 1),
      /p1-speed is read-only/);
    const x = game.ram.u16(RAM.player1 + P.posX);
    state.memory.setU16(RAM.player1 + P.posX, x + 1);
    assert.equal(game.ram.u16(RAM.player1 + P.posX), x + 1);
    assert.throws(() => state.memory.u8(P3_VIRTUAL.options + OPT.stride),
      /undeclared virtual address/);
  });

test('W613 P3 player initialization comes from the selected cartridge rows',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const player = P3_VIRTUAL.player;
    assert.equal(state.memory.u16(player + P.state), 0x8000);
    assert.equal(state.memory.u8(player + P.playerIdx), 2);
    assert.equal(state.memory.u16(player + P.shipSel), 0);
    assert.equal(state.memory.u16(player + P.optFormation), 6);
    assert.equal(state.memory.u8(player + P.speedIdx), game.rom.u8(0x255208));
    assert.equal(state.memory.u8(player + P.baseSpeed), game.rom.u8(0x255208));
    assert.equal(state.memory.u8(player + P.speedIdx) === 0x7f, false);
    assert.equal(state.memory.u32(player + P.animA), game.rom.u32(0x2551ea));
    assert.equal(state.memory.u32(player + P.hitYPlus), game.rom.u32(0x2551ee));
    assert.equal(state.memory.u16(player + 0x2c), game.rom.u16(0x2552d4));
    assert.equal(state.memory.u16(player + 0x36), game.rom.u16(0x2552d6));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
  });

test('W613 commit and restage preserve the current private input bytes',
  { skip: SKIP_ASSETS }, async () => {
    const bundle = await localBundle();
    const demo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
    const { game } = demo;
    const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
    const button1 = portWordFromBits([BIT.b1]);

    prepareThreePilotFrame(state, game, button1);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.dirByte), 0x10);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.btnByte), 0x10);
    activate(state);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.dirByte), 0x10);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.btnByte), 0x10);
    assert.doesNotThrow(() => runThreePilotOptionObject(game));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      new Uint8Array(0x40));

    prepareThreePilotFrame(state, game, 0xffff);
    state.lifecycle = 'detached';
    state.restagePending = true;
    prepareThreePilotFrame(state, game, button1);
    assert.equal(state.lifecycle, 'staged');
    activate(state);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.dirByte), 0x10);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.btnByte), 0x10);
    assert.doesNotThrow(() => runThreePilotOptionObject(game));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      new Uint8Array(0x40));
  });

test('W613 u16-only ROM adapters initialize P3 speed from the cartridge row',
  { skip: SKIP_ASSETS }, async () => {
    const bundle = await localBundle();
    const demo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, THREE_PILOT_FORMATION_MODE.authenticSelection);
    const { game } = demo;
    const fullRom = game.rom;
    const expected = fullRom.u8(0x255208);
    game.ram.setU8(RAM.player1 + P.speedIdx, expected ^ 0xff);
    game.rom = { u16: (address) => fullRom.u16(address) };

    const state = attachThreePilotFoundation(game, { inputWord: 0xffff });
    activate(state);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.speedIdx), expected);
    assert.equal(state.memory.u8(P3_VIRTUAL.player + P.baseSpeed), expected);
    assert.notEqual(state.memory.u8(P3_VIRTUAL.player + P.speedIdx),
      game.ram.u8(RAM.player1 + P.speedIdx));
  });

test('W613 style-6 deployment matches an isolated native owner and emits copied requests',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const reference = game.ram.clone();
    copySidecarPlayerToP1(state, reference);
    const nativeBefore = game.ram.b.slice();
    clearPhysicalCounters(reference);

    runOptionBlock(reference, { rom: game.rom, tables: game.tables }, OPTION_BLOCKS[0]);
    const emitted = runThreePilotOptionObject(game);
    assert.ok(emitted >= 2);
    assert.deepEqual(game.ram.b, nativeBefore,
      'private P3 options may not mutate any native RAM byte');
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      ramBytes(reference, RAM.p1Options, OPT.stride));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.player, P.stride),
      ramBytes(reference, RAM.player1, P.stride));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      new Uint8Array(0x40), 'options-only P3 never initializes reserved laser state');

    for (const bucket of [NAMED_BUCKETS.shadows, NAMED_BUCKETS.options]) {
      assert.deepEqual(virtualRequests(state, bucket), physicalRequests(reference, bucket));
      for (const request of virtualRequests(state, bucket)) {
        assert.equal(request.length, RECORD_BYTES);
      }
      assert.equal(game.ram.u16(BUCKETS[bucket].counter), 0);
    }
  });

test('W613 style-6 movement stays native-exact across deployment and active frames',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const reference = game.ram.clone();
    copySidecarPlayerToP1(state, reference);

    for (let frame = 0; frame < 40; frame++) {
      clearPhysicalCounters(reference);
      runOptionBlock(reference, { rom: game.rom, tables: game.tables }, OPTION_BLOCKS[0]);
      runThreePilotOptionObject(game);
      assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
        ramBytes(reference, RAM.p1Options, OPT.stride), `option block frame ${frame}`);
      assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.player, P.stride),
        ramBytes(reference, RAM.player1, P.stride), `player record frame ${frame}`);
      for (const bucket of [NAMED_BUCKETS.shadows, NAMED_BUCKETS.options]) {
        assert.deepEqual(virtualRequests(state, bucket), physicalRequests(reference, bucket),
          `bucket ${bucket} frame ${frame}`);
      }
    }
    assert.equal(state.memory.u16(P3_VIRTUAL.options + OPT.state) & 0x0002, 0x0002);
  });

test('W613 B1 stays dormant before bootstrap, then enters W615 laser; B3 allocates no shot',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    const player = P3_VIRTUAL.player;
    state.memory.setU8(player + P.dirByte, 0x10);
    const firstBeamBefore = sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40);
    const firstPoolBefore = sidecarBytes(state.memory, P3_VIRTUAL.beamPool, 32 * 0x30);
    const nativeBefore = game.ram.b.slice();
    assert.doesNotThrow(() => runThreePilotOptionObject(game));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      firstBeamBefore, 'one held frame remains before the authentic laser bootstrap');
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamPool, 32 * 0x30),
      firstPoolBefore);
    assert.equal(state.weapons.actorId, state.actorId);
    assert.equal(state.weapons.calls, 1);
    assert.deepEqual(game.ram.b, nativeBefore);

    for (let frame = 1; frame < 48; frame++) {
      state.memory.setU8(player + P.dirByte, 0x10);
      state.memory.setU8(player + P.btnByte, 0);
      runThreePilotOptionObject(game);
    }
    assert.notEqual(state.memory.u16(P3_VIRTUAL.beamPool + 28 * 0x30), 0,
      'held B1 authentically seeds the private muzzle after bootstrap');
    assert.equal(sidecarBytes(state.memory, P3_VIRTUAL.positionHistory, 0x40)
      .some((byte) => byte !== 0), true,
      'laser bootstrap seeds the shared private position history');
    assert.deepEqual(game.ram.b, nativeBefore);

    state.memory.setU8(player + P.dirByte, 0);
    state.memory.setU8(player + P.btnByte, 0);
    runThreePilotOptionObject(game);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      new Uint8Array(0x40));

    state.memory.setU8(player + P.dirByte, 0x40);
    state.memory.setU8(player + P.btnByte, 0x40);
    const shotsBefore = sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30);
    runThreePilotOptionObject(game);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.shots, 36 * 0x30), shotsBefore);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      new Uint8Array(0x40));
    assert.equal(game.ram.u16(BUCKETS[0].counter), 0);
  });

test('W613 clears option requests at lifecycle, stage, and allocator boundaries',
  { skip: SKIP_ASSETS }, async () => {
    const { state, game } = await exactState();
    runThreePilotOptionObject(game);
    assert.ok(state.weapons.requests.length > 0);

    game.ram.setU16(0x812972, 1);
    assert.deepEqual(game.virtualSpriteRequestHook(game), [],
      'a stage clear raised after call 9 suppresses same-frame pod requests');
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    assert.equal(state.weapons.requests.length, 0);
    assert.equal(runThreePilotOptionObject(game), 0);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.beamRecord, 0x40),
      new Uint8Array(0x40));
    assert.equal(state.weapons.requests.length, 0);

    game.ram.setU16(0x812972, 0);
    runThreePilotOptionObject(game);
    assert.equal(state.weapons.actorId, state.actorId);
    const fresh = sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride);
    state.memory.setU32(P3_VIRTUAL.options + 0x22, 0xdeadbeef);
    state.actorId = (state.actorId + 1) >>> 0;
    runThreePilotOptionObject(game);
    assert.equal(state.weapons.actorId, state.actorId);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride), fresh);

    for (const companion of state.manager.companions) companion.lifecycle = 'detached';
    assert.equal(runThreePilotOptionObject(game), 0);
    assert.deepEqual(sidecarBytes(state.memory, P3_VIRTUAL.options, OPT.stride),
      new Uint8Array(OPT.stride));
    for (const companion of state.manager.companions) {
      companion.lifecycle = 'dropped';
      companion.weapons.requests.push({ bucket: 5, bytes: new Uint8Array(RECORD_BYTES) });
    }
    assert.equal(runThreePilotOptionObject(game), 0);
    assert.deepEqual(state.manager.companions.map((companion) =>
      companion.weapons.requests.length), [0, 0]);
  });

test('W613 real Game steps invoke the private owner at call 9 and publish its pods',
  { skip: SKIP_ASSETS }, async () => {
    const { demo, state, game } = await exactState();
    assert.strictEqual(game.privateOptionObjectHook, state.privateOptionObjectHook);
    const callsBefore = state.weapons.calls;
    demo.step();
    demo.step();
    assert.equal(state.weapons.calls, callsBefore + 2);
    assert.notEqual(state.memory.u16(P3_VIRTUAL.options + OPT.state), 0);
    assert.ok(game.displayList.perBucketVirtualRecords[NAMED_BUCKETS.options] > 0);
    assert.equal(game.ram.u16(BUCKETS[NAMED_BUCKETS.options].counter), 0);
  });

test('W613 virtual request hooks reject cross-Game use before draining their owner',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    runThreePilotOptionObject(a.game);
    const before = a.state.weapons.requests.map(({ bucket, bytes }) =>
      ({ bucket, bytes: bytes.slice() }));
    assert.throws(() => a.game.virtualSpriteRequestHook(b.game), /different Game/);
    assert.deepEqual(a.state.weapons.requests, before);
  });

test('W613 copied option hooks reject the invoking Game before owner mutation',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    const optionsBefore = sidecarBytes(a.state.memory, P3_VIRTUAL.options, OPT.stride);
    const callsBefore = a.state.weapons.calls;
    const requestsBefore = a.state.weapons.requests.map(({ bucket, bytes }) =>
      ({ bucket, bytes: bytes.slice() }));

    b.game.privateOptionObjectHook = a.game.privateOptionObjectHook;
    assert.throws(() => b.demo.step(), /different Game/);
    assert.deepEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.options, OPT.stride),
      optionsBefore);
    assert.equal(a.state.weapons.calls, callsBefore);
    assert.deepEqual(a.state.weapons.requests, requestsBefore);
  });

test('W613 sidecars are per-Game and the public formation remains outside mods',
  { skip: SKIP_ASSETS }, async () => {
    const a = await exactState();
    const b = await exactState();
    runThreePilotOptionObject(a.game);
    assert.notDeepEqual(sidecarBytes(a.state.memory, P3_VIRTUAL.options, OPT.stride),
      sidecarBytes(b.state.memory, P3_VIRTUAL.options, OPT.stride));
    assert.equal(b.state.weapons.calls, 0);
    assert.equal(MOD_IDS.length, 36);
    assert.equal(MOD_IDS.includes(THREE_PILOT_FORMATION_MODE.id), false);
    assert.equal(Object.hasOwn(MODS, THREE_PILOT_FORMATION_MODE.id), false);
    assert.strictEqual(formationMode(THREE_PILOT_FORMATION_MODE.id),
      THREE_PILOT_FORMATION_MODE);
    assert.strictEqual(hashToFormation(`#formation=${THREE_PILOT_FORMATION_MODE.id}`),
      THREE_PILOT_FORMATION_MODE);
    assert.equal(formationToHash(THREE_PILOT_FORMATION_MODE),
      `formation=${THREE_PILOT_FORMATION_MODE.id}`);

    await assert.rejects(() => a.demo.armRecording(),
      /REC is unavailable while private three-pilot formation state is active.*Replay v1/);
    assert.throws(() => a.demo.playFrom({}),
      /PLAY is unavailable while private three-pilot formation state is active.*Replay v1/);
    a.demo.recorder = {};
    assert.throws(() => a.demo.step(),
      /REC is unavailable while private three-pilot formation state is active.*Replay v1/);
    a.demo.recorder = null;
    a.demo.playback = { ended: false };
    assert.throws(() => a.demo.step(),
      /PLAY is unavailable while private three-pilot formation state is active.*Replay v1/);
    a.demo.playback = null;

    const type5 = readFileSync(new URL('../src/type5.js', import.meta.url), 'utf8');
    const nativeCall = type5.indexOf('runOptionObject(ram, ctx);');
    const privateCall = type5.indexOf('ctx.privateOptionObjectHook?.();');
    assert.ok(nativeCall >= 0 && privateCall > nativeCall,
      'type-5 call 9 runs native P1/P2 options before the attached P3 owner');
  });

test('W613 REC refuses a stale Game replaced by PLAY during its table fetch',
  { skip: SKIP_ASSETS }, async () => {
    const bundle = await localBundle();
    const demo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz);
    await demo.armRecording();
    demo.step();
    const replay = await demo.stopRecording();
    assert.ok(replay);

    let rejectFetch;
    let markFetchStarted;
    const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
    const blockedFetch = new Promise((resolve, reject) => { rejectFetch = reject; });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      markFetchStarted();
      return blockedFetch;
    };
    demo.assetBase = 'https://example.invalid/assets/';

    try {
      const oldGame = demo.game;
      const arming = demo.armRecording();
      await fetchStarted;
      demo.playFrom(replay);
      const state = attachThreePilotFoundation(demo.game, { inputWord: 0xffff });
      assert.notStrictEqual(demo.game, oldGame);
      rejectFetch(new Error('controlled table fetch failure'));

      await assert.rejects(arming, /active Game changed while REC was arming/);
      assert.equal(demo.recorder, null);
      assert.ok(demo.playback);
      assert.strictEqual(state.game, demo.game);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
