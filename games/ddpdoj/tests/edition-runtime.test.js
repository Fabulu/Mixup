import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { forceAuthenticP1Selection } from '../src/authentic.js';
import {
  assertMainCpuIdentity, buildMainCpu, decryptPy2k2, tablesFromMainCpu,
} from '../src/localrom.js';
import { Game } from '../src/main.js';
import { saveRunaheadState } from '../src/runahead-state.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import {
  BLACK_RUNTIME_BINDING,
  WHITE_RUNTIME_BINDING,
  requireRuntimeCapability,
  resolveGameRuntime,
  resolveRuntimeProfile,
} from '../src/runtime-profile.js';
import {
  AssetError,
  loadBundle,
  resolveBundleManifestIdentity,
} from '../src/web/assets.js';
import {
  FORMAT_V2, armRecorder, validateReplay,
} from '../src/web/replay.js';
import {
  readCheckpoint, restoreCheckpoint,
} from '../tools/progression-checkpoint.mjs';

const HAS_BUNDLE = existsSync(fileURLToPath(new URL('../assets/manifest.json', import.meta.url)));
const bundleTest = (name, fn) => test(name, { skip: !HAS_BUNDLE }, fn);

const LEGACY_MANIFEST = Object.freeze({
  game: 'ddpdoj',
  set: 'ddpdojblk',
  build: 'B',
  encoding: 'gzip',
});

function assertHiddenIdentity(owner, name, value) {
  assert.equal(owner[name], value);
  assert.equal(Object.keys(owner).includes(name), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(owner, name), {
    value,
    writable: false,
    enumerable: false,
    configurable: false,
  });
}

test('exact audited profiles receive only their independently registered capabilities', () => {
  assert.equal(resolveGameRuntime(BLACK_LABEL_PROFILE), BLACK_RUNTIME_BINDING);
  assert.equal(resolveGameRuntime(WHITE_LABEL_PROFILE), WHITE_RUNTIME_BINDING);
  const resolved = resolveRuntimeProfile();
  assert.equal(resolved.profile, BLACK_LABEL_PROFILE);
  assert.equal(resolved.runtime, BLACK_RUNTIME_BINDING);
  assert.equal(Object.isFrozen(resolved), true);
  for (const runtime of [BLACK_RUNTIME_BINDING, WHITE_RUNTIME_BINDING]) {
    assert.equal(Object.isFrozen(runtime), true);
    assert.equal(Object.isFrozen(runtime.capabilities), true);
  }
  assert.equal(WHITE_RUNTIME_BINDING.profile, WHITE_LABEL_PROFILE);
  assert.equal(Object.hasOwn(WHITE_RUNTIME_BINDING.capabilities, 'frontendBootstrap'), true);
  assert.equal(Object.hasOwn(WHITE_RUNTIME_BINDING.capabilities, 'stage1Players'), true);
  assert.equal(WHITE_RUNTIME_BINDING.capabilities.stage1Shots,
    'ddpdoj.runtime.white-label-a.stage1-shots.v1');
  assert.equal(WHITE_RUNTIME_BINDING.capabilities.stage1EnemyBullets,
    'ddpdoj.runtime.white-label-a.stage1-enemy-bullets.v1');
  assert.deepEqual(Object.keys(WHITE_RUNTIME_BINDING.capabilities), [
    'frontendBootstrap', 'stage1Players', 'stage1Shots', 'stage1EnemyBullets',
  ]);
  for (const capability of [
    'game', 'authenticSelector', 'localRom', 'legacyReplay', 'legacyCheckpoint', 'legacyBundle',
  ]) {
    assert.throws(
      () => requireRuntimeCapability(WHITE_RUNTIME_BINDING, capability, 'White operation'),
      /White operation is unavailable/,
    );
  }

  const measuredClone = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  assert.throws(() => resolveGameRuntime(measuredClone), /no executable runtime/);
  assert.throws(
    () => requireRuntimeCapability({ ...BLACK_RUNTIME_BINDING }, 'game', 'Test operation'),
    /Test operation is unavailable/,
  );

  let reads = 0;
  const forgedRuntime = new Proxy({}, {
    get() {
      reads++;
      throw new Error('forged runtime was inspected');
    },
  });
  assert.throws(
    () => requireRuntimeCapability(forgedRuntime, 'game', 'Forged operation'),
    /Forged operation is unavailable/,
  );
  assert.equal(reads, 0);
});

test('bundle manifest identity accepts exact explicit and legacy Black forms only', () => {
  for (const manifest of [
    LEGACY_MANIFEST,
    { profileId: BLACK_LABEL_PROFILE.id },
    { ...LEGACY_MANIFEST, profileId: BLACK_LABEL_PROFILE.id },
  ]) {
    const identity = resolveBundleManifestIdentity(manifest);
    assert.equal(identity.profile, BLACK_LABEL_PROFILE);
    assert.equal(identity.runtime, BLACK_RUNTIME_BINDING);
  }

  assert.throws(
    () => resolveBundleManifestIdentity({ ...LEGACY_MANIFEST, build: 'A' }),
    /legacy game\/set\/build identity does not match/,
  );
  assert.throws(
    () => resolveBundleManifestIdentity({
      ...LEGACY_MANIFEST,
      profileId: BLACK_LABEL_PROFILE.id,
      build: 'A',
    }),
    /profile identity conflicts/,
  );
  assert.throws(
    () => resolveBundleManifestIdentity({ profileId: 'ddpdoj/white-label/a' }),
    /does not match edition profile/,
  );
});

test('bundle request and table identity fail before unrelated asset reads', async () => {
  let reads = 0;
  await assert.rejects(
    loadBundle(async () => {
      reads++;
      throw new Error('asset input was touched');
    }, { profile: 'ddpdoj/white-label/a' }),
    /Published bundle is unavailable for this DaiOuJou edition runtime/,
  );
  assert.equal(reads, 0);

  const requested = [];
  const badTables = gzipSync(JSON.stringify({
    set: 'ddpdojblk',
    build: 'A',
    image_sha256: BLACK_LABEL_PROFILE.programIdentity.imageSha256,
  }));
  await assert.rejects(
    loadBundle(async (name) => {
      requested.push(name);
      if (name === 'manifest.json') {
        return new TextEncoder().encode(JSON.stringify(LEGACY_MANIFEST));
      }
      if (name === 'player.tables.json.gz') return new Uint8Array(badTables);
      throw new Error(`unexpected asset read ${name}`);
    }),
    /player\.tables\.json identity does not match manifest profile/,
  );
  assert.deepEqual(requested, ['manifest.json', 'player.tables.json.gz']);
});

test('Black-only selector, local tables, and replay ingress reject invalid identity first', () => {
  assert.throws(
    () => forceAuthenticP1Selection({ profile: BLACK_LABEL_PROFILE }, { ship: 0, style: 2 }),
    /requires one coherent edition runtime and RAM layout/,
  );

  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('ROM input was touched');
    },
  });
  assert.throws(
    () => tablesFromMainCpu(untouched, 'ddpdoj/white-label/a'),
    /Local table extraction is unavailable for this DaiOuJou edition runtime/,
  );
  assert.equal(reads, 0);

  const replay = new Proxy({}, {
    get() {
      reads++;
      throw new Error('replay payload was touched');
    },
  });
  assert.throws(
    () => validateReplay(replay, { profile: 'ddpdoj/white-label/a' }),
    /Legacy replay is unavailable for this DaiOuJou edition runtime/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => validateReplay({ format: FORMAT_V2, build: 'A' }),
    /unsupported replay build A/,
  );
});

test('all Black-only local-ROM ingress resolves edition before reading input', async () => {
  for (const [operation, unavailable, invoke] of [
    ['decrypt', 'DaiOuJou program decryption',
      (input) => decryptPy2k2(input, 'ddpdoj/white-label/a')],
    ['identity', 'DaiOuJou maincpu validation', (input) => assertMainCpuIdentity(input, {
      profile: 'ddpdoj/white-label/a',
    })],
    ['construction', 'DaiOuJou maincpu construction', (input) => buildMainCpu(input, {
      profile: 'ddpdoj/white-label/a',
    })],
  ]) {
    let reads = 0;
    const input = new Proxy({}, {
      get() {
        reads++;
        throw new Error(`${operation} input was touched`);
      },
    });
    await assert.rejects(
      async () => invoke(input),
      new RegExp(`${unavailable} is unavailable for this DaiOuJou edition runtime`),
    );
    assert.equal(reads, 0, `${operation} touched its input`);
  }
});

test('checkpoint restore and read resolve edition before payload or file access', async () => {
  let reads = 0;
  const document = new Proxy({}, {
    get() {
      reads++;
      throw new Error('checkpoint payload was touched');
    },
  });
  assert.throws(
    () => restoreCheckpoint(document, {}, { profile: 'ddpdoj/white-label/a' }),
    /Progression checkpoint v2 is unavailable for this DaiOuJou edition runtime/,
  );
  assert.equal(reads, 0);

  await assert.rejects(
    readCheckpoint(new URL('./missing-edition-runtime-checkpoint.json', import.meta.url), {}, {
      profile: 'ddpdoj/white-label/a',
    }),
    /Progression checkpoint v2 is unavailable for this DaiOuJou edition runtime/,
  );
});

test('selector, replay, and runahead reject incoherent runtime owners', () => {
  const foreignProfile = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  assert.throws(
    () => forceAuthenticP1Selection({
      profile: foreignProfile,
      runtime: BLACK_RUNTIME_BINDING,
    }, { ship: 0, style: 2 }),
    /no executable runtime/,
  );

  assert.throws(
    () => armRecorder({ profile: BLACK_LABEL_PROFILE }, {}),
    /both edition profile and runtime identity/,
  );
  assert.throws(
    () => armRecorder({ runtime: BLACK_RUNTIME_BINDING }, {}),
    /both edition profile and runtime identity/,
  );
  assert.throws(
    () => armRecorder({
      profile: BLACK_LABEL_PROFILE,
      runtime: BLACK_RUNTIME_BINDING,
      ram: { ramLayout: Object.freeze({}) },
    }, {}),
    /RAM layout does not match/,
  );

  assert.throws(
    () => saveRunaheadState({
      profile: BLACK_LABEL_PROFILE,
      runtime: { ...BLACK_RUNTIME_BINDING },
      ram: { ramLayout: BLACK_LABEL_PROFILE.ramLayout },
    }, null, null, null, 1),
    /one coherent edition runtime and RAM layout/,
  );
});

bundleTest('loaded bundle and Game retain one hidden immutable runtime identity', async () => {
  const bundle = await loadBundle(async (name) => new Uint8Array(readFileSync(
    fileURLToPath(new URL(name, new URL('../assets/', import.meta.url))),
  )));
  assertHiddenIdentity(bundle, 'profileId', BLACK_LABEL_PROFILE.id);
  assertHiddenIdentity(bundle, 'profile', BLACK_LABEL_PROFILE);
  assertHiddenIdentity(bundle, 'runtime', BLACK_RUNTIME_BINDING);

  const game = new Game(bundle.seed, bundle.tables, {
    profile: bundle.profile,
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  assertHiddenIdentity(game, 'profile', bundle.profile);
  assertHiddenIdentity(game, 'runtime', bundle.runtime);
  assert.equal(game.ram.ramLayout, bundle.profile.ramLayout);
});

test('AssetError remains the bundle identity error type', () => {
  assert.throws(
    () => resolveBundleManifestIdentity({ ...LEGACY_MANIFEST, game: 'other' }),
    AssetError,
  );
});
