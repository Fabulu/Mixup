import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BLACK_LABEL_PROFILE,
  DEFAULT_PROFILE_ID,
  PROFILE_IDS,
  SHARED_RAM_LAYOUT,
  deriveProfileContext,
  resolveGameProfile,
  validateGameProfile,
} from '../src/profiles.js';
import { MACHINE, RAM, ROM, P, OPT, CLAMP, BIT } from '../src/machine.js';
import { Game } from '../src/main.js';
import { Ram } from '../src/ram.js';
import { OBJ } from '../src/objdriver.js';

const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const HAS_RUNTIME_FIXTURES = existsSync(SEED) && existsSync(TABLES);
const runtimeTest = (name, fn) => test(name, { skip: !HAS_RUNTIME_FIXTURES }, fn);
let runtimeFixtures = null;

function fixtures() {
  runtimeFixtures ??= {
    seedBytes: new Uint8Array(readFileSync(SEED)),
    tables: JSON.parse(readFileSync(TABLES, 'utf8')),
  };
  return runtimeFixtures;
}

function game(profile) {
  const { seedBytes, tables } = fixtures();
  return new Game(seedBytes.slice(), tables, {
    ...(profile === undefined ? {} : { profile }),
    palCatchUp: false,
  });
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function firstEmptySlot(g) {
  for (let i = 0; i < OBJ.slots; i++) {
    const slot = OBJ.base + i * OBJ.stride;
    if (g.ram.u16(slot + OBJ.typeOff) === 0) return slot;
  }
  throw new Error('profile context test requires one empty object slot');
}

test('Black edition profile is trusted, data-only, and recursively frozen', () => {
  assert.equal(DEFAULT_PROFILE_ID, PROFILE_IDS.BLACK_LABEL);
  assert.equal(resolveGameProfile(), BLACK_LABEL_PROFILE);
  assert.equal(resolveGameProfile(PROFILE_IDS.BLACK_LABEL), BLACK_LABEL_PROFILE);
  assert.equal(resolveGameProfile(BLACK_LABEL_PROFILE), BLACK_LABEL_PROFILE);
  assert.equal(validateGameProfile(BLACK_LABEL_PROFILE), BLACK_LABEL_PROFILE);
  assertDeepFrozen(BLACK_LABEL_PROFILE);

  const visit = (value) => {
    if (value == null || typeof value !== 'object') {
      assert.notEqual(typeof value, 'function');
      assert.notEqual(typeof value, 'symbol');
      return;
    }
    assert.ok(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
    for (const child of Object.values(value)) visit(child);
  };
  visit(BLACK_LABEL_PROFILE);

  const invalid = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  invalid.progressionProfile.callback = () => {};
  assert.throws(() => validateGameProfile(invalid), /unsupported function data/);
});

test('profile validation is order-independent but rejects incomplete or hidden data', () => {
  const clone = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  const reordered = Object.fromEntries(Object.entries(clone).reverse());
  assert.equal(validateGameProfile(reordered), reordered);

  const incomplete = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  incomplete.bootProfile = null;
  assert.throws(() => validateGameProfile(incomplete), /profile\.bootProfile/);

  const hidden = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  Object.defineProperty(hidden, 'hidden', { value: 1 });
  assert.throws(() => validateGameProfile(hidden), /enumerable profile data/);

  let subclassCalls = 0;
  class ExecutableArray extends Array {
    some() {
      subclassCalls++;
      return false;
    }
  }
  const subclassed = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  subclassed.programIdentity.buildARegion = ExecutableArray.from(
    subclassed.programIdentity.buildARegion,
  );
  assert.throws(() => validateGameProfile(subclassed), /non-plain object/);
  assert.equal(subclassCalls, 0);
});

test('forged profile accessors are rejected without executing their getter', () => {
  let calls = 0;
  const forged = {};
  Object.defineProperty(forged, 'id', {
    enumerable: true,
    get() {
      calls++;
      return PROFILE_IDS.BLACK_LABEL;
    },
  });
  assert.throws(() => resolveGameProfile(forged), /must not be an accessor/);
  assert.equal(calls, 0);
});

test('derived handler contexts preserve immutable hidden profile identity', () => {
  const source = { tables: {}, unportedLog: {} };
  Object.defineProperty(source, 'profile', { value: BLACK_LABEL_PROFILE });
  const derived = deriveProfileContext(source, { unported: source.unportedLog });
  assert.equal(derived.profile, BLACK_LABEL_PROFILE);
  assert.equal(Object.keys(derived).includes('profile'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(derived, 'profile'), {
    value: BLACK_LABEL_PROFILE,
    writable: false,
    enumerable: false,
    configurable: false,
  });
});

test('legacy machine exports preserve exact Black values, order, descriptors, and mutability', () => {
  const expected = [
    [MACHINE, {
      set: BLACK_LABEL_PROFILE.revisionIdentity.set,
      build: BLACK_LABEL_PROFILE.revisionIdentity.build,
      ...SHARED_RAM_LAYOUT.machine,
    }],
    [RAM, SHARED_RAM_LAYOUT.addresses],
    [P, SHARED_RAM_LAYOUT.playerFields],
    [OPT, SHARED_RAM_LAYOUT.optionFields],
    [ROM, BLACK_LABEL_PROFILE.codeLandmarks],
    [CLAMP, BLACK_LABEL_PROFILE.selectorProfile.clamp],
    [BIT, BLACK_LABEL_PROFILE.bootProfile.inputBits],
  ];
  for (const [legacy, profileValue] of expected) {
    assert.deepEqual(legacy, profileValue);
    assert.notEqual(legacy, profileValue);
    assert.equal(Object.isFrozen(legacy), false);
    for (const key of Object.keys(legacy)) {
      const descriptor = Object.getOwnPropertyDescriptor(legacy, key);
      assert.equal(descriptor.writable, true);
      assert.equal(descriptor.enumerable, true);
      assert.equal(descriptor.configurable, true);
    }
  }
  assert.notEqual(ROM.isr6Gated, BLACK_LABEL_PROFILE.codeLandmarks.isr6Gated);
  assert.equal(Object.isFrozen(ROM.isr6Gated), false);
  assert.deepEqual(Object.keys(MACHINE), [
    'set', 'build', 'refreshHz', 'frameNs', 'cyclesPerFrame', 'ramBase', 'ramSize',
  ]);

  const fingerprints = {
    MACHINE: '8b194adb4d75447ac7822b6b463b563abaf8cb7230607570e1ad826f320c24a4',
    RAM: '1a32b8bd1fa2af37f73aaaa9472380c44d0a17a6ba0cf711304dcd1b04b5686a',
    ROM: '7ea3b9e9c77fee9075cd01e97238071d1bdcdc6228673ac6a2bbc1b88b105432',
    P: 'de4ea3b184799a8846d111fcef86a999f2f174fdc2af5fa2b3b214659cfe132c',
    OPT: 'ff7c739886201b26b3f4e75a9f48092bcc21b83459114d008b793031c1d616c6',
    CLAMP: '6e5f426ce5df52842ae6a68098967c6e60f1db025fc34577dedb3d516ac6d681',
    BIT: '5e4d51a88ad5732ea5b089739510eb7807780013bfab57ab1bdb2a7354c002da',
  };
  for (const [name, value] of Object.entries({ MACHINE, RAM, ROM, P, OPT, CLAMP, BIT })) {
    const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    assert.equal(digest, fingerprints[name], `${name} compatibility fingerprint`);
  }

  const oldRank = RAM.rank;
  const oldGate = ROM.isr6Gated[0];
  try {
    RAM.rank = 0;
    ROM.isr6Gated[0] = 0;
    assert.equal(SHARED_RAM_LAYOUT.addresses.rank, oldRank);
    assert.equal(BLACK_LABEL_PROFILE.codeLandmarks.isr6Gated[0], oldGate);
  } finally {
    RAM.rank = oldRank;
    ROM.isr6Gated[0] = oldGate;
  }
});

test('Game rejects unknown and forged profiles before reading seed or tables', () => {
  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('constructor touched protected input');
    },
  });
  assert.throws(
    () => new Game(untouched, untouched, { profile: 'ddpdoj/white-label/a' }),
    /unsupported DaiOuJou edition profile ddpdoj\/white-label\/a/,
  );
  assert.equal(reads, 0);

  const forged = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  assert.throws(
    () => new Game(untouched, untouched, { profile: forged }),
    /unregistered DaiOuJou edition profile ddpdoj\/black-label\/b/,
  );
  assert.equal(reads, 0);

  assert.throws(
    () => new Game(untouched, {
      set: 'ddpdojblk',
      build: 'A',
      image_sha256: BLACK_LABEL_PROFILE.programIdentity.imageSha256,
    }, { profile: BLACK_LABEL_PROFILE }),
    /tables do not match edition profile ddpdoj\/black-label\/b/,
  );
  assert.equal(reads, 0);
});

runtimeTest('Game binds one immutable non-enumerable profile before RAM construction', () => {
  const g = game();
  assert.equal(g.profile, BLACK_LABEL_PROFILE);
  assert.equal(g.ram.ramLayout, BLACK_LABEL_PROFILE.ramLayout);
  assert.equal(Object.keys(g).includes('profile'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(g, 'profile'), {
    value: BLACK_LABEL_PROFILE,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.throws(() => { g.profile = null; }, TypeError);
});

test('Ram clone preserves bytes and the exact immutable layout identity', () => {
  const bytes = new Uint8Array(MACHINE.ramSize);
  bytes[0] = 0x12;
  bytes[bytes.length - 1] = 0x34;
  const ram = new Ram(bytes);
  const clone = ram.clone();

  assert.equal(ram.ramLayout, BLACK_LABEL_PROFILE.ramLayout);
  assert.equal(clone.ramLayout, ram.ramLayout);
  assert.deepEqual(clone.b, ram.b);
  assert.notEqual(clone.b, ram.b);
  assert.equal(Object.keys(ram).includes('ramLayout'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(ram, 'ramLayout'), {
    value: BLACK_LABEL_PROFILE.ramLayout,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.throws(() => { clone.ramLayout = null; }, TypeError);
});

runtimeTest('ported handler context carries the same profile without changing enumerable keys', () => {
  const g = game();
  const type = 0x33;
  assert.equal(g.handlers.has(type), false);
  let captured = null;
  g.handlers.set(type, (_ram, _slot, _index, ctx) => { captured = ctx; });
  const slot = firstEmptySlot(g);
  for (let i = 0; i < OBJ.stride; i++) g.ram.setU8(slot + i, 0);
  g.ram.setU16(slot + OBJ.typeOff, type);

  g.step(0);

  assert.ok(captured);
  assert.equal(captured.profile, g.profile);
  assert.equal(Object.hasOwn(captured, 'profile'), true);
  assert.equal(Object.keys(captured).includes('profile'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(captured, 'profile'), {
    value: BLACK_LABEL_PROFILE,
    writable: false,
    enumerable: false,
    configurable: false,
  });
});

runtimeTest('default and explicit Black construction remain deterministic', () => {
  const implicit = game();
  const explicit = game(BLACK_LABEL_PROFILE);
  assert.deepEqual(explicit.ram.b, implicit.ram.b);
  assert.deepEqual([...explicit.handlers.keys()], [...implicit.handlers.keys()]);

  implicit.step(0);
  explicit.step(0);

  assert.deepEqual(explicit.ram.b, implicit.ram.b);
  assert.equal(explicit.logicFrame, implicit.logicFrame);
  assert.equal(explicit.videoFrame, implicit.videoFrame);
  assert.deepEqual(explicit.frameRequests, implicit.frameRequests);
  assert.deepEqual(explicit.unportedLog.report(), implicit.unportedLog.report());
});
