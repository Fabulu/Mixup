// Stable Playable Hibachi lifecycle, rollback, and replay state.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import {
  bindModGame, createModState, exportModReplaySeed, resolveLoadout,
  restoreModReplaySeed, validateModReplaySeed,
} from '../src/mods.js';
import {
  PLAYABLE_HIBACHI_BASES, PLAYABLE_HIBACHI_BULLET_POWER,
  PLAYABLE_HIBACHI_BULLET_SLOTS,
  PLAYABLE_HIBACHI_CONFLICT, PLAYABLE_HIBACHI_EXTERNAL_KIND,
  PLAYABLE_HIBACHI_PALETTE_BANKS, PLAYABLE_HIBACHI_PALETTE_SOURCES,
  PLAYABLE_HIBACHI_SIDECAR_BYTES,
  armPlayableHibachiLaunchPresentation,
  beginPlayableHibachiCreditedRun, bindPlayableHibachiGame,
  capturePlayableHibachiLaunch, createPlayableHibachiState, endPlayableHibachiRun,
  exportPlayableHibachiReplayState, importPlayableHibachiReplayState,
  playableHibachiStateForGame, restorePlayableHibachiRunaheadState,
  savePlayableHibachiRunaheadState,
} from '../src/playablehibachi.js';

function fakeGame() {
  const reads = [];
  const game = {
    ram: new Ram(),
    rom: {
      bytes(address, length) {
        reads.push([address, length]);
        return Uint8Array.from({ length }, (_, index) => (address + index) & 0xff);
      },
    },
    tables: {},
  };
  return { game, reads };
}

test('Playable Hibachi publishes exact private geometry and palette identity', () => {
  assert.equal(PLAYABLE_HIBACHI_CONFLICT,
    'Formation cannot be combined with Playable Hibachi');
  assert.equal(PLAYABLE_HIBACHI_EXTERNAL_KIND, 'ddpdoj.playable-hibachi/v2');
  assert.deepEqual(PLAYABLE_HIBACHI_BASES, [0x11000000, 0x11010000]);
  assert.equal(PLAYABLE_HIBACHI_SIDECAR_BYTES, 0x276);
  assert.equal(PLAYABLE_HIBACHI_BULLET_SLOTS, 210);
  assert.equal(PLAYABLE_HIBACHI_BULLET_POWER, 0x0100);
  assert.deepEqual(PLAYABLE_HIBACHI_PALETTE_BANKS,
    [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x0f]);
  assert.deepEqual(PLAYABLE_HIBACHI_PALETTE_SOURCES,
    Array.from({ length: 9 }, (_, index) => 0x223038 + index * 0x40));

  const state = createPlayableHibachiState();
  assert.equal(state.sidecars.length, 2);
  assert.equal(state.sidecars[0].byteLength, 0x276);
  assert.equal(state.sidecars[1].byteLength, 0x276);
  assert.deepEqual([...state.selectedGuns], [-1, -1]);
  assert.deepEqual([...state.ordinaryPatternCursors], [5, 5]);
  assert.deepEqual([...state.hyperPatternCursors], [1, 1]);
  assert.deepEqual(state.lifecycle, {
    bound: false, pending: true, launchEligible: false,
    active: false, credited: false, generation: 0,
  });
  assert.equal(state.privatePaletteWords.length, 9 * 32);
  assert.equal(state.fingerprints.bulletPower, PLAYABLE_HIBACHI_BULLET_POWER);
});

test('Playable Hibachi binds once and activates only on credited non-demo handoff', () => {
  const state = createPlayableHibachiState();
  const { game, reads } = fakeGame();
  const owners = {
    players: state.players,
    player0: state.players[0],
    runtime0: state.players[0].runtime,
    sidecars: state.sidecars,
    sidecar0: state.sidecars[0],
    bytes: state.sidecarBytes,
    bytes0: state.sidecarBytes[0],
    bullets: state.ownedBullets,
    guns: state.selectedGuns,
    ordinaryCursors: state.ordinaryPatternCursors,
    hyperCursors: state.hyperPatternCursors,
    palette: state.privatePaletteWords,
    leases: state.paletteLeases,
    requests: state.virtualRequests,
    fingerprints: state.fingerprints,
    lifecycle: state.lifecycle,
  };

  assert.strictEqual(bindPlayableHibachiGame(state, game), state);
  assert.strictEqual(playableHibachiStateForGame(game), state);
  assert.deepEqual(reads, PLAYABLE_HIBACHI_PALETTE_SOURCES.map((address) => [address, 0x40]));
  assert.equal(state.privatePaletteWords[0], 0x3839);
  assert.equal(state.privatePaletteWords[32], 0x7879);
  assert.equal(armPlayableHibachiLaunchPresentation(state), true);
  assert.equal(state.lifecycle.launchEligible, true);

  Object.assign(state.players[0].runtime, {
    presentationFrames: 7,
    presentationStarted: true,
    launchActive: true,
    launchY: 0x3600,
    launchX: 0x14c0,
  });
  assert.equal(beginPlayableHibachiCreditedRun(state, game, { demo: true }), false);
  assert.deepEqual(state.lifecycle, {
    bound: true, pending: true, launchEligible: true,
    active: false, credited: false, generation: 0,
  });
  assert.deepEqual({
    presentationFrames: state.players[0].runtime.presentationFrames,
    presentationStarted: state.players[0].runtime.presentationStarted,
    launchActive: state.players[0].runtime.launchActive,
    launchY: state.players[0].runtime.launchY,
    launchX: state.players[0].runtime.launchX,
  }, {
    presentationFrames: 0, presentationStarted: false, launchActive: false,
    launchY: 0, launchX: 0,
  }, 'demo handoff clears provisional presentation');
  assert.equal(capturePlayableHibachiLaunch(state, {
    phase: 'launch', demo: false, playerIdx: 0, anchor: 0x360014c0,
  }), true, 'a demo handoff remains eligible for the next credited selector descent');

  Object.assign(state.players[0].runtime, {
    presentationFrames: 9,
    presentationStarted: true,
    launchActive: true,
    launchY: 0x2e00,
    launchX: 0x14c0,
  });
  assert.equal(beginPlayableHibachiCreditedRun(state, game, { demo: false }), true);
  assert.deepEqual(state.lifecycle, {
    bound: true, pending: false, launchEligible: false,
    active: true, credited: true, generation: 1,
  });
  assert.deepEqual({
    presentationFrames: state.players[0].runtime.presentationFrames,
    presentationStarted: state.players[0].runtime.presentationStarted,
    launchActive: state.players[0].runtime.launchActive,
    launchY: state.players[0].runtime.launchY,
    launchX: state.players[0].runtime.launchX,
  }, {
    presentationFrames: 9, presentationStarted: true, launchActive: true,
    launchY: 0x2e00, launchX: 0x14c0,
  }, 'credited handoff preserves provisional presentation');

  state.sidecars[0].setU32(PLAYABLE_HIBACHI_BASES[0], 0x12345678);
  state.ownedBullets[7] = 1;
  state.selectedGuns[0] = 8;
  state.players[0].runtime.initialized = true;
  state.virtualRequests.push({ bucket: 4, bytes: new Uint8Array(12) });
  endPlayableHibachiRun(state, game);
  assert.equal(state.sidecars[0].u32(PLAYABLE_HIBACHI_BASES[0]), 0);
  assert.equal(state.ownedBullets[7], 0);
  assert.deepEqual([...state.selectedGuns], [-1, -1]);
  assert.deepEqual([...state.ordinaryPatternCursors], [5, 5]);
  assert.deepEqual([...state.hyperPatternCursors], [1, 1]);
  assert.deepEqual(state.lifecycle, {
    bound: true, pending: true, launchEligible: true,
    active: false, credited: false, generation: 1,
  });
  assert.equal(state.players[0].runtime.initialized, false);
  assert.deepEqual({
    presentationFrames: state.players[0].runtime.presentationFrames,
    presentationStarted: state.players[0].runtime.presentationStarted,
    launchActive: state.players[0].runtime.launchActive,
    launchY: state.players[0].runtime.launchY,
    launchX: state.players[0].runtime.launchX,
  }, {
    presentationFrames: 0, presentationStarted: false, launchActive: false,
    launchY: 0, launchX: 0,
  });
  assert.equal(state.virtualRequests.length, 0);

  assert.strictEqual(state.players, owners.players);
  assert.strictEqual(state.players[0], owners.player0);
  assert.strictEqual(state.players[0].runtime, owners.runtime0);
  assert.strictEqual(state.sidecars, owners.sidecars);
  assert.strictEqual(state.sidecars[0], owners.sidecar0);
  assert.strictEqual(state.sidecarBytes, owners.bytes);
  assert.strictEqual(state.sidecarBytes[0], owners.bytes0);
  assert.strictEqual(state.ownedBullets, owners.bullets);
  assert.strictEqual(state.selectedGuns, owners.guns);
  assert.strictEqual(state.ordinaryPatternCursors, owners.ordinaryCursors);
  assert.strictEqual(state.hyperPatternCursors, owners.hyperCursors);
  assert.strictEqual(state.privatePaletteWords, owners.palette);
  assert.strictEqual(state.paletteLeases, owners.leases);
  assert.strictEqual(state.virtualRequests, owners.requests);
  assert.strictEqual(state.fingerprints, owners.fingerprints);
  assert.strictEqual(state.lifecycle, owners.lifecycle);
  assert.equal(beginPlayableHibachiCreditedRun(state, game, {}), true);
  assert.equal(state.lifecycle.generation, 2);
});

test('Playable Hibachi runahead restores every external owner in place', () => {
  const state = createPlayableHibachiState();
  const { game } = fakeGame();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const request = {
    bucket: 7,
    bytes: Uint8Array.from({ length: 12 }, (_, index) => index),
    privatePaletteBank: 6,
    paletteWords: Uint16Array.from({ length: 32 }, (_, index) => 0x100 + index),
  };
  state.virtualRequests.push(request);
  state.sidecars[0].setU32(PLAYABLE_HIBACHI_BASES[0], 0xaabbccdd);
  state.ownedBullets[11] = 2;
  state.selectedGuns[1] = 7;
  state.ordinaryPatternCursors.set([20, 14]);
  state.hyperPatternCursors.set([4, 3]);
  state.players[1].runtime.descriptorId = 18;
  state.players[1].runtime.gun = 7;
  state.players[1].runtime.frames = 9;
  state.players[1].runtime.presentationFrames = 13;
  state.players[1].runtime.presentationStarted = true;
  state.players[1].runtime.launchActive = true;
  state.players[1].runtime.launchY = 0x2a00;
  state.players[1].runtime.launchX = 0x2300;

  const identities = {
    players: state.players,
    players0: state.players[0],
    runtime1: state.players[1].runtime,
    sidecars: state.sidecars,
    sidecar0: state.sidecars[0],
    sidecarBytes: state.sidecarBytes,
    bytes0: state.sidecarBytes[0],
    bullets: state.ownedBullets,
    guns: state.selectedGuns,
    ordinaryCursors: state.ordinaryPatternCursors,
    hyperCursors: state.hyperPatternCursors,
    palette: state.privatePaletteWords,
    leases: state.paletteLeases,
    requests: state.virtualRequests,
    request,
    requestBytes: request.bytes,
    requestPalette: request.paletteWords,
    fingerprints: state.fingerprints,
    lifecycle: state.lifecycle,
  };
  const token = savePlayableHibachiRunaheadState(state);

  state.sidecars[0].setU32(PLAYABLE_HIBACHI_BASES[0], 0);
  state.ownedBullets.fill(0);
  state.selectedGuns.fill(-1);
  state.ordinaryPatternCursors.fill(5);
  state.hyperPatternCursors.fill(1);
  state.privatePaletteWords.fill(0);
  state.players[1].runtime.descriptorId = -1;
  state.players[1].runtime.gun = 0;
  state.players[1].runtime.frames = 100;
  state.players[1].runtime.presentationFrames = 101;
  state.players[1].runtime.presentationStarted = false;
  state.players[1].runtime.launchActive = false;
  state.players[1].runtime.launchY = 0;
  state.players[1].runtime.launchX = 0;
  request.bytes.fill(0xff);
  request.privatePaletteBank = 1;
  request.paletteWords.fill(0xffff);
  state.virtualRequests.length = 0;
  state.lifecycle.active = false;

  restorePlayableHibachiRunaheadState(state, token);
  assert.equal(state.sidecars[0].u32(PLAYABLE_HIBACHI_BASES[0]), 0xaabbccdd);
  assert.equal(state.ownedBullets[11], 2);
  assert.equal(state.selectedGuns[1], 7);
  assert.deepEqual([...state.ordinaryPatternCursors], [20, 14]);
  assert.deepEqual([...state.hyperPatternCursors], [4, 3]);
  assert.equal(state.players[1].runtime.descriptorId, 18);
  assert.equal(state.players[1].runtime.gun, 7);
  assert.equal(state.players[1].runtime.frames, 9);
  assert.equal(state.players[1].runtime.presentationFrames, 13);
  assert.equal(state.players[1].runtime.presentationStarted, true);
  assert.equal(state.players[1].runtime.launchActive, true);
  assert.equal(state.players[1].runtime.launchY, 0x2a00);
  assert.equal(state.players[1].runtime.launchX, 0x2300);
  assert.strictEqual(state.virtualRequests[0], request);
  assert.deepEqual([...request.bytes], Array.from({ length: 12 }, (_, index) => index));
  assert.equal(request.privatePaletteBank, 6);
  assert.equal(request.paletteWords[31], 0x11f);
  assert.equal(state.lifecycle.active, true);

  assert.strictEqual(state.players, identities.players);
  assert.strictEqual(state.players[0], identities.players0);
  assert.strictEqual(state.players[1].runtime, identities.runtime1);
  assert.strictEqual(state.sidecars, identities.sidecars);
  assert.strictEqual(state.sidecars[0], identities.sidecar0);
  assert.strictEqual(state.sidecarBytes, identities.sidecarBytes);
  assert.strictEqual(state.sidecarBytes[0], identities.bytes0);
  assert.strictEqual(state.ownedBullets, identities.bullets);
  assert.strictEqual(state.selectedGuns, identities.guns);
  assert.strictEqual(state.ordinaryPatternCursors, identities.ordinaryCursors);
  assert.strictEqual(state.hyperPatternCursors, identities.hyperCursors);
  assert.strictEqual(state.privatePaletteWords, identities.palette);
  assert.strictEqual(state.paletteLeases, identities.leases);
  assert.strictEqual(state.virtualRequests, identities.requests);
  assert.strictEqual(request.bytes, identities.requestBytes);
  assert.strictEqual(request.paletteWords, identities.requestPalette);
  assert.strictEqual(state.fingerprints, identities.fingerprints);
  assert.strictEqual(state.lifecycle, identities.lifecycle);
  assert.throws(() => restorePlayableHibachiRunaheadState(state, token), /already restored/);

  const ownerToken = savePlayableHibachiRunaheadState(state);
  const ordinaryOwner = state.ordinaryPatternCursors;
  state.ownedBullets[11] = 0;
  state.ordinaryPatternCursors = Uint8Array.of(5, 5);
  assert.throws(() => restorePlayableHibachiRunaheadState(state, ownerToken),
    /external owner identity changed/);
  assert.equal(state.ownedBullets[11], 0,
    'owner validation rejects before mutating any other state');
  state.ordinaryPatternCursors = ordinaryOwner;
  restorePlayableHibachiRunaheadState(state, ownerToken);
  assert.equal(state.ownedBullets[11], 2);

  const requestToken = savePlayableHibachiRunaheadState(state);
  const bytesOwner = request.bytes;
  request.bytes = new Uint8Array(12);
  state.ownedBullets[11] = 0;
  assert.throws(() => restorePlayableHibachiRunaheadState(state, requestToken),
    /request 0 owner identity changed/);
  assert.equal(state.ownedBullets[11], 0);
  request.bytes = bytesOwner;
  restorePlayableHibachiRunaheadState(state, requestToken);
  assert.equal(state.ownedBullets[11], 2);

  const lengthToken = savePlayableHibachiRunaheadState(state);
  state.players.push(state.players[0]);
  state.ownedBullets[11] = 0;
  assert.throws(() => restorePlayableHibachiRunaheadState(state, lengthToken),
    /external owner identity changed/);
  assert.equal(state.ownedBullets[11], 0);
  state.players.pop();
  restorePlayableHibachiRunaheadState(state, lengthToken);
  assert.equal(state.ownedBullets[11], 2);

  const bindingToken = savePlayableHibachiRunaheadState(state);
  const ramOwner = state.ramBinding.current;
  state.ramBinding.current = new Ram();
  state.ownedBullets[11] = 0;
  assert.throws(() => restorePlayableHibachiRunaheadState(state, bindingToken),
    /external owner identity changed/);
  assert.equal(state.ownedBullets[11], 0);
  state.ramBinding.current = ramOwner;
  restorePlayableHibachiRunaheadState(state, bindingToken);
  assert.equal(state.ownedBullets[11], 2);
});

test('Playable Hibachi replay validates completely before restoring in place', () => {
  const state = createPlayableHibachiState();
  const { game } = fakeGame();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  state.sidecars[0].setU32(PLAYABLE_HIBACHI_BASES[0], 0x01020304);
  state.ownedBullets[0] = 1;
  state.ownedBullets[209] = 2;
  state.selectedGuns.set([3, 8]);
  state.ordinaryPatternCursors.set([8, 20]);
  state.hyperPatternCursors.set([4, 4]);
  state.players[0].runtime.descriptorId = 3;
  state.players[0].runtime.gun = 3;
  state.players[1].runtime.descriptorId = 19;
  state.players[1].runtime.gun = 8;
  state.players[0].runtime.presentationFrames = 13;
  state.players[1].runtime.presentationFrames = 17;
  state.players[0].runtime.presentationStarted = true;
  state.players[1].runtime.presentationStarted = false;
  state.players[0].runtime.launchActive = true;
  state.players[0].runtime.launchY = 0x3600;
  state.players[0].runtime.launchX = 0x14c0;
  const external = exportPlayableHibachiReplayState(state);

  beginPlayableHibachiCreditedRun(state, game, {});
  state.sidecars[0].setU32(PLAYABLE_HIBACHI_BASES[0], 0xdeadbeef);
  const corrupt = structuredClone(external);
  corrupt.fingerprints.sidecarBytes = 1;
  assert.throws(() => importPlayableHibachiReplayState(state, corrupt),
    /fingerprint sidecarBytes does not match/);
  assert.equal(state.sidecars[0].u32(PLAYABLE_HIBACHI_BASES[0]), 0xdeadbeef,
    'failed validation does not partially mutate sidecars');
  assert.deepEqual([...state.selectedGuns], [-1, -1]);

  const owners = [
    state.sidecars[0], state.sidecarBytes[0], state.ownedBullets,
    state.selectedGuns, state.ordinaryPatternCursors, state.hyperPatternCursors,
    state.privatePaletteWords, state.lifecycle,
  ];
  importPlayableHibachiReplayState(state, external);
  assert.equal(state.sidecars[0].u32(PLAYABLE_HIBACHI_BASES[0]), 0x01020304);
  assert.equal(state.ownedBullets[0], 1);
  assert.equal(state.ownedBullets[209], 2);
  assert.deepEqual([...state.selectedGuns], [3, 8]);
  assert.deepEqual([...state.ordinaryPatternCursors], [8, 20]);
  assert.deepEqual([...state.hyperPatternCursors], [4, 4]);
  assert.equal(state.players[0].runtime.descriptorId, 3);
  assert.equal(state.players[0].runtime.gun, 3);
  assert.equal(state.players[1].runtime.descriptorId, 19);
  assert.equal(state.players[1].runtime.gun, 8);
  assert.equal(state.players[0].runtime.presentationFrames, 13);
  assert.equal(state.players[1].runtime.presentationFrames, 17);
  assert.equal(state.players[0].runtime.presentationStarted, true);
  assert.equal(state.players[1].runtime.presentationStarted, false);
  assert.equal(state.players[0].runtime.launchActive, true);
  assert.equal(state.players[0].runtime.launchY, 0x3600);
  assert.equal(state.players[0].runtime.launchX, 0x14c0);
  assert.deepEqual(owners, [
    state.sidecars[0], state.sidecarBytes[0], state.ownedBullets,
    state.selectedGuns, state.ordinaryPatternCursors, state.hyperPatternCursors,
    state.privatePaletteWords, state.lifecycle,
  ]);

  const rejectWithoutMutation = (mutate, pattern) => {
    const before = exportPlayableHibachiReplayState(state);
    const candidate = structuredClone(external);
    mutate(candidate);
    assert.throws(() => importPlayableHibachiReplayState(state, candidate), pattern);
    assert.deepEqual(exportPlayableHibachiReplayState(state), before,
      'every rejected v2 payload leaves live state unchanged');
  };
  rejectWithoutMutation((value) => { value.kind = 'ddpdoj.playable-hibachi/v1'; },
    /external kind must be ddpdoj\.playable-hibachi\/v2/);
  rejectWithoutMutation((value) => { delete value.lifecycle.launchEligible; },
    /lifecycle launchEligible is invalid/);
  rejectWithoutMutation((value) => { delete value.ordinaryPatternCursors; },
    /ordinary pattern cursors are invalid/);
  rejectWithoutMutation((value) => { value.ordinaryPatternCursors = [5]; },
    /ordinary pattern cursors are invalid/);
  rejectWithoutMutation((value) => { value.ordinaryPatternCursors[0] = 5.5; },
    /ordinary pattern cursors are invalid/);
  rejectWithoutMutation((value) => { value.ordinaryPatternCursors[0] = 21; },
    /ordinary pattern cursors are invalid/);
  rejectWithoutMutation((value) => { value.hyperPatternCursors = [1]; },
    /hyper pattern cursors are invalid/);
  rejectWithoutMutation((value) => { value.hyperPatternCursors[1] = 1.5; },
    /hyper pattern cursors are invalid/);
  rejectWithoutMutation((value) => { value.hyperPatternCursors[1] = 0; },
    /hyper pattern cursors are invalid/);
  rejectWithoutMutation((value) => { delete value.playerRuntime[0].descriptorId; },
    /P1 runtime descriptorId is invalid/);
  rejectWithoutMutation((value) => { value.playerRuntime[0].descriptorId = 20; },
    /P1 runtime descriptorId is invalid/);
  rejectWithoutMutation((value) => { value.playerRuntime[0].gun = 2; },
    /P1 descriptor gun telemetry does not match/);
  rejectWithoutMutation((value) => { value.selectedGuns[0] = 2; },
    /P1 descriptor gun telemetry does not match/);
  rejectWithoutMutation((value) => { value.ordinaryPatternCursors[0] = 9; },
    /P1 active pattern cursor does not match/);
  rejectWithoutMutation((value) => { value.fingerprints.descriptors = 'wrong'; },
    /fingerprint descriptors does not match/);
  for (const field of [
    'presentationFrames', 'presentationStarted', 'launchActive', 'launchY', 'launchX',
  ]) {
    rejectWithoutMutation((value) => { delete value.playerRuntime[0][field]; },
      new RegExp(`P1 runtime ${field} is invalid`));
  }
});

test('replay v2 validates and restores the exact Playable Hibachi loadout', () => {
  const sourceMods = createModState(resolveLoadout(['playable-hibachi']));
  const { game: sourceGame } = fakeGame();
  bindModGame(sourceMods, sourceGame);
  beginPlayableHibachiCreditedRun(sourceMods.playableHibachi, sourceGame, {});
  sourceMods.playableHibachi.ownedBullets[17] = 2;
  sourceMods.playableHibachi.selectedGuns.set([1, 7]);
  sourceMods.playableHibachi.ordinaryPatternCursors.set([6, 20]);
  sourceMods.playableHibachi.hyperPatternCursors.set([4, 3]);
  sourceMods.playableHibachi.players[0].runtime.descriptorId = 1;
  sourceMods.playableHibachi.players[0].runtime.gun = 1;
  sourceMods.playableHibachi.players[1].runtime.descriptorId = 18;
  sourceMods.playableHibachi.players[1].runtime.gun = 7;
  const seed = exportModReplaySeed(sourceMods);

  assert.deepEqual(seed.ids, ['playable-hibachi']);
  assert.equal(seed.playableHibachi.kind, PLAYABLE_HIBACHI_EXTERNAL_KIND);
  assert.throws(() => validateModReplaySeed({
    ids: ['playable-hibachi'], playableHibachi: null,
  }), /Playable Hibachi state is missing/);
  assert.throws(() => validateModReplaySeed({
    ids: [], playableHibachi: seed.playableHibachi,
  }), /state without its mod/);
  assert.throws(() => validateModReplaySeed({
    ids: ['playable-hibachi', 'playable-hibachi'],
    playableHibachi: seed.playableHibachi,
  }), /duplicate ids/);
  assert.throws(() => validateModReplaySeed({
    ids: ['unknown'], playableHibachi: null,
  }), /unknown, conflicting, or unordered ids/);
  assert.throws(() => validateModReplaySeed(seed, resolveLoadout([])),
    /does not match the active selection/);

  const candidate = validateModReplaySeed(seed, resolveLoadout(['playable-hibachi']));
  assert.notStrictEqual(candidate.state, sourceMods);
  assert.notStrictEqual(candidate.state.playableHibachi, sourceMods.playableHibachi);
  const { game: candidateGame } = fakeGame();
  const restored = restoreModReplaySeed(candidate, candidateGame);
  assert.strictEqual(restored, candidate.state);
  assert.equal(restored.playableHibachi.ownedBullets[17], 2);
  assert.deepEqual([...restored.playableHibachi.selectedGuns], [1, 7]);
  assert.deepEqual([...restored.playableHibachi.ordinaryPatternCursors], [6, 20]);
  assert.deepEqual([...restored.playableHibachi.hyperPatternCursors], [4, 3]);
  assert.equal(restored.playableHibachi.players[0].runtime.descriptorId, 1);
  assert.equal(restored.playableHibachi.players[0].runtime.gun, 1);
  assert.equal(restored.playableHibachi.players[1].runtime.descriptorId, 18);
  assert.equal(restored.playableHibachi.players[1].runtime.gun, 7);
});
