// Edition-bound cartridge roots for the shared stage-world translators.

import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';
import { BLACK_AIM64_RESOURCES, BLACK_AIM256_RESOURCES } from './aim.js';
import {
  BLACK_SCORE_RESOURCES, BLACK_TYPE11_EFFECT_RESOURCES,
  WHITE_TYPE11_EFFECT_RESOURCES,
} from './type11-resources.js';
import {
  WHITE_AIM256_RESOURCES, WHITE_BULLET_SPAWN_RESOURCES,
} from './white-bullets.js';
import { BLACK_CUE_RESOURCES, WHITE_CUE_RESOURCES } from './cues.js';
import { BLACK_ITEM_RESOURCES, WHITE_ITEM_RESOURCES } from './item-resources.js';

const WHITE_STANDARD_BULLET_KINDS = Object.freeze([12, 13]);
const WHITE_TYPE80_FAN_KINDS = Object.freeze([4, 5]);
const WHITE_TYPE80_LASER_KINDS = Object.freeze([19]);

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

const sharedSpawnRam = {
  resetBase: 0x81332c, resetWords: 0x1c27, resetEnd: 0x816b7a,
  liveCursor: 0x8132cc, auxBase: 0x8132d0, distanceClock: 0x8130ce,
  deferredBase: 0x815eaa, deferredCount: 0x815ea8, deferredCap: 0x0c80,
  deferredStride: 0x50, deferredDummy: 0x816b2a,
  subCommon: 0x81459c, subCommonCount: 100,
  subSpecial: 0x81521c, subSpecialCount: 50, subStride: 0x20,
};

const black11 = {
  type: 0x11, algorithm: 'type11', initStub: 0x268714, initBody: 0x26871c,
  handler: 0x2688cc, subPrototype: 0x268828, recordPrototype: 0x268808,
  bucketTable: 0x267f70, palette: 0x2687fe, muzzle: 0x268b1e,
  mainSprite: 0x268b9e, fireSprite: 0x268c9e,
  rankByteRng: { table: 0x242e42, entries: 128 },
  aim64: BLACK_AIM64_RESOURCES,
  fireGate: {
    entry: 0x267fc6, boxD3: 0x242562, boxD2: 0x242576,
    boxD3Rank: 0x24258a, boxD2Rank: 0x24259e, thresholds: 0x2680a2,
  },
  bullet: { site: 0x268b14, ...BLACK_BULLET_SPAWN_RESOURCES },
  score: BLACK_SCORE_RESOURCES,
  effects: BLACK_TYPE11_EFFECT_RESOURCES,
  remaps: { death: 0x267fa0, hit: 0x267fac, secondary: 0x267fb8 },
  sound: { death: 0x28c25a },
};

const white11 = {
  type: 0x11, algorithm: 'type11', initStub: 0x16778c, initBody: 0x167794,
  handler: 0x167944, subPrototype: 0x1678a0, recordPrototype: 0x167880,
  bucketTable: 0x166fe8, palette: 0x167876, muzzle: 0x167b96,
  mainSprite: 0x167c16, fireSprite: 0x167d16,
  rankByteRng: { table: 0x143192, entries: 128 },
  fireGate: {
    entry: 0x16703e, boxD3: 0x14289c, boxD2: 0x1428b0,
    boxD3Rank: 0x1428c4, boxD2Rank: 0x1428d8, thresholds: 0x16711a,
  },
  bullet: {
    site: 0x167b8c, ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
  },
  score: {
    hit: 0x184cf0, kill: 0x184db8, capTable: 0x18692e, refillTable: 0x186932,
  },
  effects: WHITE_TYPE11_EFFECT_RESOURCES,
  remaps: { death: 0x167018, hit: 0x167024, secondary: 0x167030 },
  sound: { death: 0x18ad80 },
  aim64: {
    ops: 0x142400, sub: 0x1423e8, add: 0x1423f4,
    base: 0x142420, lut: 0x142430, entries: 129,
  },
};

const black10 = {
  type: 0x10, algorithm: 'type10', initStub: 0x2680b0, initBody: 0x2680b8,
  handler: 0x268232, subPrototype: 0x2681b2, recordPrototype: 0x268192,
  bucketTable: 0x267f70, palette: 0x268188, muzzle: 0x268494,
  mainSprite: 0x268594, fireSprite: 0x268694,
  turret: { block: 0x268376, aimSite: 0x268398, muzzleY: 0x0200 },
  aim64: black11.aim64,
  fireGate: black11.fireGate,
  bullet: { site: 0x26848a, ...BLACK_BULLET_SPAWN_RESOURCES },
  score: black11.score,
  effects: black11.effects,
  remaps: black11.remaps,
  effectSites: { firstZero: 0x2682c0, death: 0x2681dc },
  sound: { death: 0x28c25a },
};

const white10 = {
  type: 0x10, algorithm: 'type10', initStub: 0x167128, initBody: 0x167130,
  handler: 0x1672aa, subPrototype: 0x16722a, recordPrototype: 0x16720a,
  bucketTable: 0x166fe8, palette: 0x167200, muzzle: 0x16750c,
  mainSprite: 0x16760c, fireSprite: 0x16770c,
  turret: { block: 0x1673ee, aimSite: 0x167410, muzzleY: 0x0200 },
  aim64: white11.aim64,
  fireGate: white11.fireGate,
  bullet: {
    site: 0x167502, ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
  },
  score: white11.score,
  effects: white11.effects,
  remaps: white11.remaps,
  effectSites: { firstZero: 0x167338, death: 0x167254 },
  sound: { death: 0x18ad80 },
};

const black05 = {
  type: 0x05, algorithm: 'type05',
  initStub: 0x269bc6, initBody: 0x269bce, handler: 0x269cea,
  recordPrototype: 0x269cb4, subPrototype: 0x269cce,
  animation: 0x269bb6, sprite: 0x269e48, armBArt: 0x269ec8, muzzle: 0x269f48,
  emitters: { record: 0x23d852, armA: 0x23df86, armB: 0x23df58 },
  effectSite: 0x269d1e,
  aim64: BLACK_AIM64_RESOURCES,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2814ac, semantic: 'bank-a-adaptive', site: 0x269e10,
  },
  score: black11.score,
  effects: black11.effects,
  fireGate: black11.fireGate,
  sound: { death: 0x28c2a8 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white05 = {
  type: 0x05, algorithm: 'type05',
  initStub: 0x168c3e, initBody: 0x168c46, handler: 0x168d62,
  recordPrototype: 0x168d2c, subPrototype: 0x168d46,
  animation: 0x168c2e, sprite: 0x168ec0, armBArt: 0x168f40, muzzle: 0x168fc0,
  emitters: { record: 0x13dba0, armA: 0x13e2d4, armB: 0x13e2a6 },
  effectSite: 0x168d96,
  aim64: white11.aim64,
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
    entry: 0x1804f8, semantic: 'bank-a-adaptive', site: 0x168e88,
  },
  score: white11.score,
  effects: white11.effects,
  fireGate: white11.fireGate,
  sound: { death: 0x18adce },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black27 = {
  type: 0x27, algorithm: 'type07-family',
  initStub: 0x26a1e2, initBody: 0x26a1ea, handler: 0x26a2e2,
  recordPrototype: 0x26a2b0, subPrototype: 0x26a2c6,
  animation: 0x269bb6, sprite: 0x269e48, armBArt: 0x269ec8, muzzle: 0x269f48,
  emitters: { record: 0x23d852, armA: 0x23df86, armB: 0x23df58 },
  effectSite: 0x269d1e,
  initAim: { typeBit5: 0x242a80, target: 0x24202c, translated: false },
  aim64: BLACK_AIM64_RESOURCES,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2814ac, semantic: 'bank-a-adaptive', site: 0x26a4aa,
  },
  score: black11.score,
  effects: black11.effects,
  fireGate: black11.fireGate,
  sound: { death: 0x28c2a8 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white27 = {
  type: 0x27, algorithm: 'type07-family',
  initStub: 0x16925a, initBody: 0x169262, handler: 0x16935a,
  recordPrototype: 0x169328, subPrototype: 0x16933e,
  animation: 0x168c2e, sprite: 0x168ec0, armBArt: 0x168f40, muzzle: 0x168fc0,
  emitters: { record: 0x13dba0, armA: 0x13e2d4, armB: 0x13e2a6 },
  effectSite: 0x16938e,
  initAim: { typeBit5: 0x142dd0, target: 0x142366, translated: true },
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
    entry: 0x1804f8, semantic: 'bank-a-adaptive', site: 0x169522,
  },
  score: white11.score,
  effects: white11.effects,
  aim64: white11.aim64,
  fireGate: white11.fireGate,
  sound: { death: 0x18adce },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black80 = {
  type: 0x80, algorithm: 'type80', initStub: 0x2737fa, initBody: 0x273802,
  handler: 0x2739c0, palette: 0x273922,
  recordPrototype: 0x27392c, subPrototype: 0x27394e,
  aimSprite: 0x272f7a, muzzle: 0x27347a,
  fan: { wideTable: 0x2735fa, narrowTable: 0x2736fa },
  aim64: black27.aim64,
  aim256: BLACK_AIM256_RESOURCES,
  initAim: { translated: false, site: 0x24200a },
  bullet: {
    wide: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x2817b8, semantic: 'bank-b-adaptive',
    },
    narrow: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x2817a8, semantic: 'bank-b-spread-three',
    },
    laser: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x281484, semantic: 'bank-a-spread-three',
    },
  },
  score: black11.score,
  cues: BLACK_CUE_RESOURCES,
  effects: black11.effects,
  effectSites: [0x273dc2, 0x273dea, 0x273e1e, 0x273e56, 0x273e8e, 0x273ec8],
  emitters: { record: 0x23d852, turret: 0x23df86, alternate: 0x23df58 },
  mirrorSprite: 0x172d18,
  sound: { death: 0x28c2dc },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white80 = {
  type: 0x80, algorithm: 'type80', initStub: 0x17284e, initBody: 0x172856,
  handler: 0x172a14, palette: 0x172976,
  recordPrototype: 0x172980, subPrototype: 0x1729a2,
  aimSprite: 0x171fce, muzzle: 0x1724ce,
  fan: { wideTable: 0x17264e, narrowTable: 0x17274e },
  aim64: white11.aim64,
  aim256: WHITE_AIM256_RESOURCES,
  initAim: { translated: true },
  bullet: {
    wide: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: WHITE_TYPE80_FAN_KINDS,
      entry: 0x1807a0, semantic: 'bank-b-adaptive',
    },
    narrow: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: WHITE_TYPE80_FAN_KINDS,
      entry: 0x180790, semantic: 'bank-b-spread-three',
    },
    laser: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: WHITE_TYPE80_LASER_KINDS,
      entry: 0x1804d0, semantic: 'bank-a-spread-three',
    },
  },
  score: white11.score,
  cues: WHITE_CUE_RESOURCES,
  effects: white11.effects,
  effectSites: [0x172e16, 0x172e3e, 0x172e72, 0x172eaa, 0x172ee2, 0x172f1c],
  emitters: { record: 0x13dba0, turret: 0x13e2d4, alternate: 0x13e2a6 },
  mirrorSprite: 0x172d18,
  sound: { death: 0x18ae02 },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black85 = {
  type: 0x85, algorithm: 'type85', initStub: 0x275812, initBody: 0x27581a,
  handler: 0x275914, palette: 0x275890,
  recordPrototype: 0x27589a, subPrototype: 0x2758b0,
  aimSprite: 0x272dfa, muzzle: 0x27327a,
  aim64: black27.aim64,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2813f0, semantic: 'bank-a-direct', site: 0x275ad0,
  },
  score: black11.score,
  cues: BLACK_CUE_RESOURCES,
  items: {
    ...BLACK_ITEM_RESOURCES, allocator: BLACK_ITEM_RESOURCES.alloc,
    kind: 0, alternateType: 0x86, alternateKind: 8,
    sites: { first: 0x275b06, second: 0x275b1a },
  },
  effects: black11.effects,
  effectSites: { first: 0x275b22, second: 0x275b4e, third: 0x275b76 },
  sound: { death: 0x28c274 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white85 = {
  type: 0x85, algorithm: 'type85', initStub: 0x174866, initBody: 0x17486e,
  foreignInitBodies: [0x27581a, 0x275bb6],
  handler: 0x174968, palette: 0x1748e4,
  recordPrototype: 0x1748ee, subPrototype: 0x174904,
  secondSubPrototype: 0x174920,
  aimSprite: 0x171e4e, muzzle: 0x1722ce,
  aim64: white11.aim64,
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
    entry: 0x180474, semantic: 'bank-a-direct', site: 0x174b24,
  },
  score: white11.score,
  cues: WHITE_CUE_RESOURCES,
  items: {
    ...WHITE_ITEM_RESOURCES, allocator: WHITE_ITEM_RESOURCES.alloc, kind: 0,
    sites: { first: 0x174b5a, second: 0x174b6e },
  },
  effects: white11.effects,
  effectSites: { first: 0x174b76, second: 0x174ba2, third: 0x174bca },
  sound: { death: 0x18ad9a },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

export const BLACK_WORLD_RESOURCES = deepFreeze({
  edition: 'black', objectDispatch: 0x240f62,
  background: {
    entry: 0x26127a, init: 0x26114c, frame: 0x2612a0,
    scriptPair: 0x26153e, palette: 0x261252, column: 0x261266,
    tileBase: 0x240d62, opcode: 0x2620c2, element: 0x262302,
  },
  spawn: {
    entryReset: 0x26331e, installer: 0x263386, walker: 0x2633be,
    stageTable: 0x263336,
    ...sharedSpawnRam,
    low: { nullInit: 0x267814, nullHandler: 0x26781c, table: 0x267824 },
    high: { nullInit: 0x27e402, nullHandler: 0x27e40a, table: 0x27e412 },
    typeStride: 8,
  },
  enemyFrame: { entry: 0x2634f4, walker: 0x2633be, driver: 0x263502 },
  movement: { entry: 0x241812, speedPointers: 0x200920, fold: 0x2418b4 },
  enemyTypes: {
    0x05: black05, 0x07: black27, 0x10: black10, 0x11: black11,
    0x27: black27, 0x80: black80, 0x85: black85,
  },
  displayList: { filler: [0xfc00, 0x3800, 0, 0, 0x0201], coordinates: 'black' },
});

export const WHITE_WORLD_RESOURCES = deepFreeze({
  edition: 'white', objectDispatch: 0x141294,
  background: {
    entry: 0x1602f8, init: 0x1601ca, frame: 0x16031e,
    scriptPair: 0x1605b8, palette: 0x1602d0, column: 0x1602e4,
    tileBase: 0x141094, opcode: 0x16113c, element: 0x16137c,
  },
  spawn: {
    entryReset: 0x162398, installer: 0x162400, walker: 0x162438,
    stageTable: 0x1623b0,
    ...sharedSpawnRam,
    low: { nullInit: 0x16688c, nullHandler: 0x166894, table: 0x16689c },
    high: { nullInit: 0x17d4b4, nullHandler: 0x17d4bc, table: 0x17d4c4 },
    typeStride: 8,
  },
  enemyFrame: { entry: 0x16256e, walker: 0x162438, driver: 0x162670 },
  movement: { entry: 0x141b60, speedPointers: 0x100920, fold: 0x141bee },
  enemyTypes: {
    0x05: white05, 0x07: white27, 0x10: white10, 0x11: white11,
    0x27: white27, 0x80: white80, 0x85: white85,
  },
  displayList: { filler: [0xfbff, 0xfc00, 0, 0, 0x0201], coordinates: 'direct' },
});
