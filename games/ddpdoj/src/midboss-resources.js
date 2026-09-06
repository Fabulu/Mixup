// Canonical edition-bound resource graphs for Stage 1 Type $0D and its Type $1C child.

import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';
import { BLACK_AIM256_RESOURCES } from './aim.js';
import {
  BLACK_SCORE_RESOURCES, BLACK_TYPE11_EFFECT_RESOURCES,
  WHITE_TYPE11_EFFECT_RESOURCES,
} from './type11-resources.js';
import { BLACK_CUE_RESOURCES, WHITE_CUE_RESOURCES } from './cues.js';

const MIDBOSS_BULLET_KINDS = Object.freeze([3, 4, 7]);

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function generator(base, entry, semantic) {
  return {
    ...base, entry, semantic, supportedKinds: [...MIDBOSS_BULLET_KINDS],
  };
}

const QUEUE_RAM = {
  deferredBase: 0x815eaa, deferredCount: 0x815ea8, deferredCap: 0x0c80,
  deferredStride: 0x50, deferredDummy: 0x816b2a,
};

export const WHITE_SCORE_RESOURCES = deepFreeze({
  hit: 0x184cf0, kill: 0x184db8, capTable: 0x18692e, refillTable: 0x186932,
});

const SHARED_LAYOUT = { armCount: 8, armStride: 0x40, armBase: 0x20 };

// Keep this module a resource-only leaf. Importing the operational White bullet
// driver here closes a cycle through mover, enemy handlers, and initbody.
const BLACK_MIDBOSS_CLEAR_DRIVER = {
  armWord: 0x81b410, modeWord: 0x81b412,
  pool: 0x817f8c, stride: 0x40, mover: { slots: 210 },
};
const WHITE_MIDBOSS_CLEAR_DRIVER = {
  armWord: 0x81b410, modeWord: 0x81b412,
  pool: 0x817f8c, stride: 0x40, mover: { slots: 210 },
};
const WHITE_MIDBOSS_BULLET_SPAWN_RESOURCES = {
  ...BLACK_BULLET_SPAWN_RESOURCES,
  entry: 0x180486,
  coreA: 0x180502,
  coreB: 0x1807aa,
  templatePtrs: 0x18093e,
  spawnInitPtrs: 0x180612,
  kinds: 36,
  supportedKinds: [3, 4, 5, 7, 12, 13, 19],
  spawnInitDispatch: {
    0x180894: 0x2818ac,
    0x18089c: 0x2818b4,
    0x1808c8: 0x2818e0,
  },
};
const WHITE_MIDBOSS_AIM256_RESOURCES = {
  entry: 0x1425d0,
  lut: 0x14269c,
  lutEntries: 65,
  base: 0x14268c,
  baseEntries: 8,
  ops: 0x14264c,
  opStride: 8,
  opEntries: 8,
};

export const BLACK_TYPE0D_RESOURCES = deepFreeze({
  edition: 'black', type: 0x0d, algorithm: 'type0D',
  initStub: 0x26b47c, initBody: 0x26b484, handler: 0x26b6fa,
  recordPrototype: 0x26b4fa, recordPrototypeWordsMinusOne: 0x09,
  subPrototype: 0x26b50e, subRecords: 17, cueCursor: 0x26b6ea,
  helpers: {
    deathBurst: 0x26b184, armInit: 0x26b286,
    swingRoll: 0x26b2ac, armKinematics: 0x26b304,
  },
  ...SHARED_LAYOUT,
  positionBias: 0x0a40,
  burstList: 0x26b214,
  tables: {
    armAnimation: 0x26be70, armGraphic: 0x26be90,
    tail: 0x26bf42, body: 0x26bfe8,
  },
  fanTable: 0x2736fa,
  rng: {
    byte64: BLACK_TYPE11_EFFECT_RESOURCES.rng.byte64,
    signed: BLACK_TYPE11_EFFECT_RESOURCES.rng.signed,
  },
  shotVector: {
    entry: 0x241d34, speedPtrs: 0x200920, speedLevels: 256,
    quadEntries: 65, quadStride: 0x0208, fold: 0x241af4, foldEntries: 256,
  },
  aim256: BLACK_AIM256_RESOURCES, aimSite: 0x24226e,
  players: { p1: 0x8103e6, p2: 0x810448 },
  bullet: {
    bigAdaptive: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x2817b8,
      'bank-b-adaptive'),
    bigSpreadTwo: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x281764,
      'bank-b-spread-two'),
    armSpreadThree: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x2817a8,
      'bank-b-spread-three'),
  },
  bulletSites: {
    bigPre: 0x26ba04,
    bigBlocks: [
      0x26ba3e, 0x26ba6c, 0x26ba9a, 0x26bac8, 0x26baf6, 0x26bb24,
      0x26bb52, 0x26bb80, 0x26bbae, 0x26bbdc, 0x26bc0a,
    ],
    armIdle: 0x26bce4, armBurst: 0x26bd76,
  },
  score: BLACK_SCORE_RESOURCES, effects: BLACK_TYPE11_EFFECT_RESOURCES,
  effectSites: { armDeath: 0x26b884, armBurst: 0x26b19a, listBurst: 0x26b1e4 },
  cues: BLACK_CUE_RESOURCES,
  animationObjects: { entry: 0x246410, table: 0x26c0fc },
  enqueue: { entry: 0x263684, semantic: 'fixed-D1-00', type: 0x1c, ...QUEUE_RAM },
  bulletDriver: BLACK_MIDBOSS_CLEAR_DRIVER,
  clear: { entry: 0x243e7c, mode: 0, scoreWalk: 0x244074, noOpArm: 0x2440ae },
  scrollCompensation: 0x24179e,
  scrollRelease: { entry: 0x261100, d0: 0x20, d1: 0x20 },
  palettes: {
    installer: 0x24150a,
    installs: [
      { bank: 0x10, block: 0x223338, site: 0x26b4d2 },
      { bank: 0x11, block: 0x223378, site: 0x26b4e2 },
      { bank: 0x0f, block: 0x2233b8, site: 0x26b4f2 },
    ],
  },
  emitters: { arm: 0x23e056, body: 0x23df58, tail: 0x23df58 },
  sound: { deathBurst: 0x28c310, armDeath: 0x28c25a },
  deathGateClock: 0x00e7,
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
});


export const WHITE_TYPE0D_RESOURCES = deepFreeze({
  edition: 'white', type: 0x0d, algorithm: 'type0D',
  initStub: 0x16a4f4, initBody: 0x16a4fc, handler: 0x16a772,
  recordPrototype: 0x16a572, recordPrototypeWordsMinusOne: 0x09,
  subPrototype: 0x16a586, subRecords: 17, cueCursor: 0x16a762,
  helpers: {
    deathBurst: 0x16a1fc, armInit: 0x16a2fe,
    swingRoll: 0x16a324, armKinematics: 0x16a37c,
  },
  ...SHARED_LAYOUT,
  positionBias: 0x0a40,
  burstList: 0x16a28c,
  tables: {
    armAnimation: 0x16aed2, armGraphic: 0x16aef2,
    tail: 0x16afa4, body: 0x16b04a,
  },
  fanTable: 0x17274e,
  rng: {
    byte64: WHITE_TYPE11_EFFECT_RESOURCES.rng.byte64,
    signed: WHITE_TYPE11_EFFECT_RESOURCES.rng.signed,
  },
  shotVector: {
    entry: 0x14206e, speedPtrs: 0x100920, speedLevels: 256,
    quadEntries: 65, quadStride: 0x0208, fold: 0x141e2e, foldEntries: 256,
  },
  aim256: WHITE_MIDBOSS_AIM256_RESOURCES, aimSite: 0x1425a8,
  players: { p1: 0x8103e6, p2: 0x810448 },
  bullet: {
    bigAdaptive: generator(WHITE_MIDBOSS_BULLET_SPAWN_RESOURCES, 0x1807a0,
      'bank-b-adaptive'),
    bigSpreadTwo: generator(WHITE_MIDBOSS_BULLET_SPAWN_RESOURCES, 0x180782,
      'bank-b-spread-two'),
    armSpreadThree: generator(WHITE_MIDBOSS_BULLET_SPAWN_RESOURCES, 0x180790,
      'bank-b-spread-three'),
  },
  bulletSites: {
    bigPre: 0x16aa66,
    bigBlocks: [
      0x16aaa0, 0x16aace, 0x16aafc, 0x16ab2a, 0x16ab58, 0x16ab86,
      0x16abb4, 0x16abe2, 0x16ac10, 0x16ac3e, 0x16ac6c,
    ],
    armIdle: 0x16ad46, armBurst: 0x16add8,
  },
  score: WHITE_SCORE_RESOURCES, effects: WHITE_TYPE11_EFFECT_RESOURCES,
  effectSites: { armDeath: 0x16a8e6, armBurst: 0x16a212, listBurst: 0x16a25c },
  cues: WHITE_CUE_RESOURCES,
  animationObjects: { entry: 0x145aee, table: 0x16b15e },
  enqueue: { entry: 0x1626fe, semantic: 'fixed-D1-00', type: 0x1c, ...QUEUE_RAM },
  bulletDriver: WHITE_MIDBOSS_CLEAR_DRIVER,
  clear: { entry: 0x1441cc, mode: 0, scoreWalk: 0x1443c4, noOpArm: 0x1443fe },
  scrollCompensation: 0x141ad8,
  scrollRelease: { entry: 0x16017e, d0: 0x20, d1: 0x20 },
  palettes: {
    installer: 0x141844,
    installs: [
      { bank: 0x10, block: 0x123338, site: 0x16a54a },
      { bank: 0x11, block: 0x123378, site: 0x16a55a },
      { bank: 0x0f, block: 0x1233b8, site: 0x16a56a },
    ],
  },
  emitters: { arm: 0x13e3a4, body: 0x13e2a6, tail: 0x13e2a6 },
  sound: { deathBurst: 0x18ae36, armDeath: 0x18ad80 },
  deathGateClock: null,
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
  natural: { source: 0x130fcc, triggerClock: 0x00c5, auxiliary: 0x1040,
    movement: 0x131ca8 },
});


export const BLACK_TYPE1C_RESOURCES = deepFreeze({
  edition: 'black', type: 0x1c, algorithm: 'type1C',
  initStub: 0x26c1c2, initBody: 0x26c1ca, handler: 0x26c20c,
  recordPrototype: 0x26c1ee, recordPrototypeWordsMinusOne: 0,
  subPrototype: 0x26c1f0, position: 0x38001c00,
  painter: {
    source: 0x227af8, destination: 0x9000bc, alternateDestination: 0x9000a4,
    alternateSelector: 0x803926, columns: 23, rows: 9,
    columnStride: 4, rowStride: 0x100, lowWordMask: 0x00ff,
    tileBase: 0x32a90000, retireClock: 0x0105,
  },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
});

export const WHITE_TYPE1C_RESOURCES = deepFreeze({
  edition: 'white', type: 0x1c, algorithm: 'type1C',
  initStub: 0x16b224, initBody: 0x16b22c, handler: 0x16b26e,
  recordPrototype: 0x16b250, recordPrototypeWordsMinusOne: 0,
  subPrototype: 0x16b252, position: 0x38001c00,
  painter: {
    source: 0x127af8, destination: 0x9000bc, alternateDestination: 0x9000a4,
    alternateSelector: 0x803926, columns: 23, rows: 9,
    columnStride: 4, rowStride: 0x100, lowWordMask: 0x00ff,
    tileBase: 0x32a90000, retireClock: 0x0105,
  },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
});

function recursivelyFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => recursivelyFrozen(child, seen));
}

function canonicalFor(resources, type) {
  if (type === 0x0d) {
    if (resources?.edition === 'black') return BLACK_TYPE0D_RESOURCES;
    if (resources?.edition === 'white') return WHITE_TYPE0D_RESOURCES;
  }
  if (type === 0x1c) {
    if (resources?.edition === 'black') return BLACK_TYPE1C_RESOURCES;
    if (resources?.edition === 'white') return WHITE_TYPE1C_RESOURCES;
  }
  return null;
}

function requireCanonical(resources, type, algorithm, edition = null) {
  const canonical = canonicalFor(resources, type);
  if (!resources || resources !== canonical || resources.type !== type
      || resources.algorithm !== algorithm || !recursivelyFrozen(resources)
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError(`type $${type.toString(16).toUpperCase()} needs its complete recursively frozen edition descriptor`);
  }
  return resources;
}

export function requireType0DResources(resources = BLACK_TYPE0D_RESOURCES,
  edition = null) {
  return requireCanonical(resources, 0x0d, 'type0D', edition);
}

export function requireType1CResources(resources = BLACK_TYPE1C_RESOURCES,
  edition = null) {
  return requireCanonical(resources, 0x1c, 'type1C', edition);
}
