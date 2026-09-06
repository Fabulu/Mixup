// Edition-bound cartridge roots for the shared stage-world translators.

import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';
import { BLACK_AIM64_RESOURCES, BLACK_AIM256_RESOURCES } from './aim.js';
import {
  BLACK_SCORE_RESOURCES, BLACK_TYPE11_EFFECT_RESOURCES,
  WHITE_TYPE11_EFFECT_RESOURCES,
} from './type11-resources.js';
import { BLACK_POOL_A_RESOURCES } from './pool-a-resources.js';
import {
  WHITE_AIM256_RESOURCES, WHITE_BULLET_SPAWN_RESOURCES, WHITE_POOL_A_RESOURCES,
} from './white-bullets.js';
import { BLACK_CUE_RESOURCES, WHITE_CUE_RESOURCES } from './cues.js';
import { BLACK_ITEM_RESOURCES, WHITE_ITEM_RESOURCES } from './item-resources.js';
import {
  BLACK_TYPE0D_RESOURCES, BLACK_TYPE1C_RESOURCES, WHITE_SCORE_RESOURCES,
  WHITE_TYPE0D_RESOURCES, WHITE_TYPE1C_RESOURCES,
} from './midboss-resources.js';
import {
  BLACK_TYPE0E_RESOURCES, BLACK_TYPE1E_RESOURCES,
  WHITE_TYPE0E_RESOURCES, WHITE_TYPE1E_RESOURCES,
} from './boss-resources.js';

const WHITE_STANDARD_BULLET_KINDS = Object.freeze([12, 13]);
const WHITE_TYPE80_FAN_KINDS = Object.freeze([4, 5]);
const WHITE_TYPE80_LASER_KINDS = Object.freeze([19]);
const WHITE_TYPE88_BULLET_KINDS = Object.freeze([4]);
const WHITE_TYPE89_BULLET_KINDS = Object.freeze([6]);

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
  score: WHITE_SCORE_RESOURCES,
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

const black08 = {
  edition: 'black',
  type: 0x08, algorithm: 'type08',
  initStub: 0x26a4b4, initBody: 0x26a4bc, handler: 0x26a5e4,
  recordPrototype: 0x26a5b2, subPrototype: 0x26a5c8,
  animation: 0x269bb6, sprite: 0x269e48, armBArt: 0x269ec8, muzzle: 0x269f48,
  emitters: { record: 0x23d852, armA: 0x23df86, armB: 0x23df58 },
  effectSite: 0x26a618,
  initAim: { typeBit5: 0x242a80, target: 0x24202c, translated: false },
  aim64: BLACK_AIM64_RESOURCES,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2814ac, semantic: 'bank-a-adaptive', site: 0x26a782,
  },
  score: black11.score,
  effects: black11.effects,
  fireGate: black11.fireGate,
  sound: { death: 0x28c2a8 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white08 = {
  edition: 'white',
  type: 0x08, algorithm: 'type08',
  initStub: 0x16952c, initBody: 0x169534, handler: 0x16965c,
  recordPrototype: 0x16962a, subPrototype: 0x169640,
  animation: 0x168c2e, sprite: 0x168ec0, armBArt: 0x168f40, muzzle: 0x168fc0,
  emitters: { record: 0x13dba0, armA: 0x13e2d4, armB: 0x13e2a6 },
  effectSite: 0x169690,
  initAim: { typeBit5: 0x142dd0, target: 0x142366, translated: true },
  aim64: white11.aim64,
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
    entry: 0x1804f8, semantic: 'bank-a-adaptive', site: 0x1697fa,
  },
  score: white11.score,
  effects: white11.effects,
  fireGate: white11.fireGate,
  sound: { death: 0x18adce },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black09 = {
  edition: 'black',
  type: 0x09, algorithm: 'type09',
  initStub: 0x26a78c, initBody: 0x26a794, handler: 0x26a860,
  recordPrototype: 0x26a82e, subPrototype: 0x26a844,
  animation: 0x269bb6, sprite: 0x269e48, armBArt: 0x269ec8, muzzle: 0x269f48,
  emitters: { record: 0x23d852, armA: 0x23df86, armB: 0x23df58 },
  effectSite: 0x26a894,
  initAim: { typeBit5: 0x242a80, target: 0x24202c, translated: false },
  aim64: BLACK_AIM64_RESOURCES,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2814ac, semantic: 'bank-a-adaptive', site: 0x26a93e,
  },
  score: black11.score,
  effects: black11.effects,
  fireGate: black11.fireGate,
  sound: { death: 0x28c2a8 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white09 = {
  edition: 'white',
  type: 0x09, algorithm: 'type09',
  initStub: 0x169804, initBody: 0x16980c, handler: 0x1698d8,
  recordPrototype: 0x1698a6, subPrototype: 0x1698bc,
  animation: 0x168c2e, sprite: 0x168ec0, armBArt: 0x168f40, muzzle: 0x168fc0,
  emitters: { record: 0x13dba0, armA: 0x13e2d4, armB: 0x13e2a6 },
  effectSite: 0x16990c,
  initAim: { typeBit5: 0x142dd0, target: 0x142366, translated: true },
  aim64: white11.aim64,
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
    entry: 0x1804f8, semantic: 'bank-a-adaptive', site: 0x1699b6,
  },
  score: white11.score,
  effects: white11.effects,
  fireGate: white11.fireGate,
  sound: { death: 0x18adce },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black0B = {
  edition: 'black',
  type: 0x0b, algorithm: 'type0B',
  initStub: 0x26ab98, initBody: 0x26aba0, handler: 0x26ad28,
  recordPrototype: 0x26acf6, subPrototype: 0x26ad0c,
  animation: 0x269bb6, sprite: 0x269e48, armBArt: 0x269ec8, muzzle: 0x269f48,
  emitters: { record: 0x23d852, armA: 0x23df86, armB: 0x23df58 },
  effectSite: 0x26ad5c,
  initAim: { typeBit5: 0x242a80, target: 0x24202c, translated: false },
  aim64: BLACK_AIM64_RESOURCES,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2814ac, semantic: 'bank-a-adaptive',
    sites: { aimed: 0x26ae0a, facing: 0x26aecc },
  },
  score: black11.score,
  effects: black11.effects,
  fireGate: black11.fireGate,
  sound: { death: 0x28c2a8 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white0B = {
  edition: 'white',
  type: 0x0b, algorithm: 'type0B',
  initStub: 0x169c10, initBody: 0x169c18, handler: 0x169da0,
  recordPrototype: 0x169d6e, subPrototype: 0x169d84,
  animation: 0x168c2e, sprite: 0x168ec0, armBArt: 0x168f40, muzzle: 0x168fc0,
  emitters: { record: 0x13dba0, armA: 0x13e2d4, armB: 0x13e2a6 },
  effectSite: 0x169dd4,
  initAim: { typeBit5: 0x142dd0, target: 0x142366, translated: true },
  aim64: white11.aim64,
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_STANDARD_BULLET_KINDS,
    entry: 0x1804f8, semantic: 'bank-a-adaptive',
    sites: { aimed: 0x169e82, facing: 0x169f44 },
  },
  score: white11.score,
  effects: white11.effects,
  fireGate: white11.fireGate,
  sound: { death: 0x18adce },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black20 = {
  edition: 'black',
  type: 0x20, types: [0x20, 0x21, 0x22, 0x23], algorithm: 'type20',
  initStub: 0x272a42, initBody: 0x272a4a,
  handler: 0x272aac, subPrototype: 0x272a90,
  scrollCompensation: 0x24179e,
  enqueue: { entry: 0x263690, d1: 'caller' },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white20 = {
  edition: 'white',
  type: 0x20, types: [0x20, 0x21, 0x22, 0x23], algorithm: 'type20',
  initStub: 0x171a96, initBody: 0x171a9e,
  handler: 0x171b00, subPrototype: 0x171ae4,
  scrollCompensation: 0x141ad8,
  enqueue: { entry: 0x16270a, d1: 'caller' },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black24 = {
  edition: 'black',
  type: 0x24, algorithm: 'type24',
  initStub: 0x296fa8, initBody: 0x296fb0, handler: 0x29700c,
  subPrototype: 0x296ff2,
  palette: { bank: 0x13, block: 0x222bf8, site: 0x296fc6, installer: 0x24150a },
  motion: { scrollCompensation: 0x24179e, velocity: 0x2417de },
  draw: {
    emitter: 0x23dece, fixedSprite: 0x0007e8ac, spriteTable: 0x2970d8,
    positionBias: 0xfdc00080, size: 0x1488, palette: 0x13,
  },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white24 = {
  edition: 'white',
  type: 0x24, algorithm: 'type24',
  initStub: 0x1959de, initBody: 0x1959e6, handler: 0x195a42,
  subPrototype: 0x195a28,
  palette: { bank: 0x13, block: 0x122bf8, site: 0x1959fc, installer: 0x141844 },
  motion: { scrollCompensation: 0x141ad8, velocity: 0x141b18 },
  draw: {
    emitter: 0x13e21c, fixedSprite: 0x0007e8ac, spriteTable: 0x195b0e,
    positionBias: 0xfdc00080, size: 0x1488, palette: 0x13,
  },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black31 = {
  edition: 'black',
  type: 0x31, algorithm: 'type31',
  initStub: 0x26974c, initBody: 0x269754, handler: 0x2697f6,
  recordPrototype: 0x2697ce, subPrototype: 0x2697da, initHook: 0x28ca60,
  palette: {
    installer: 0x24150a,
    first: { bankTable: 0x2697b0, block: 0x2251b8, site: 0x269792 },
    second: { bankTable: 0x2697ba, block: 0x2250b8, site: 0x2697a8 },
  },
  animationTable: 0x26990e,
  draw: { emitter: 0x23f896 },
  sound: { cue: 0x28c692 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white31 = {
  edition: 'white',
  type: 0x31, algorithm: 'type31',
  initStub: 0x1687c4, initBody: 0x1687cc, handler: 0x16886e,
  recordPrototype: 0x168846, subPrototype: 0x168852, initHook: 0x18b586,
  palette: {
    installer: 0x141844,
    first: { bankTable: 0x168828, block: 0x1251b8, site: 0x16880a },
    second: { bankTable: 0x168832, block: 0x1250b8, site: 0x168820 },
  },
  animationTable: 0x168986,
  draw: { emitter: 0x13fbe4 },
  sound: { cue: 0x18b1b8 },
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

const black82 = {
  edition: 'black',
  type: 0x82, algorithm: 'type82', initStub: 0x274622, initBody: 0x27462a,
  handler: 0x2747c6, palette: 0x27474a,
  recordPrototype: 0x274754, subPrototype: 0x274770,
  aimSprite: 0x272dfa, muzzle: 0x27327a, initAimSite: 0x24200a,
  aim64: black11.aim64, aim256: BLACK_AIM256_RESOURCES,
  primaryFan: {
    site: 0x27487a, aimCore: 0x2422a2,
    baseD0: 0x0003000c, plus4D0: 0xfffd000d,
    plus4: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x281708, semantic: 'bank-b-plus4',
      sites: [0x27492a, 0x274938, 0x27497a, 0x274988],
    },
    spreadTwo: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x281764, semantic: 'bank-b-spread-two',
      sites: [0x274942, 0x274992],
    },
  },
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x281484, semantic: 'bank-a-spread-three', site: 0x274acc,
  },
  score: black11.score, cues: BLACK_CUE_RESOURCES, effects: black11.effects,
  effectSites: [0x274b00, 0x274b2e],
  emitters: {
    zoom: 0x23dbca, zoomScale: 0x23e54a, heading: 0x23df86, alternate: 0x23df58,
  },
  alternateSprite: 0x173810,
  sound: { death: 0x28c274 },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white82 = {
  edition: 'white',
  type: 0x82, algorithm: 'type82', initStub: 0x173676, initBody: 0x17367e,
  handler: 0x17381a, palette: 0x17379e,
  recordPrototype: 0x1737a8, subPrototype: 0x1737c4,
  aimSprite: 0x171e4e, muzzle: 0x1722ce, initAimSite: 0x142344,
  aim64: white11.aim64, aim256: WHITE_AIM256_RESOURCES,
  primaryFan: {
    site: 0x1738ce, aimCore: 0x1425dc,
    baseD0: 0x0005000c, plus4D0: 0xffff000d,
    plus4: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: [13],
      entry: 0x180746, semantic: 'bank-b-plus4',
      sites: [0x17397e, 0x17398c, 0x1739ce, 0x1739dc],
    },
    spreadTwo: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: [12],
      entry: 0x180782, semantic: 'bank-b-spread-two',
      sites: [0x173996, 0x1739e6],
    },
  },
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    entry: 0x1804d0, semantic: 'bank-a-spread-three', site: 0x173b20,
  },
  score: white11.score, cues: WHITE_CUE_RESOURCES, effects: white11.effects,
  effectSites: [0x173b54, 0x173b82],
  emitters: {
    zoom: 0x13df18, zoomScale: 0x13e898, heading: 0x13e2d4, alternate: 0x13e2a6,
  },
  alternateSprite: 0x173810,
  sound: { death: 0x18ad9a },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black88 = {
  edition: 'black',
  type: 0x88, algorithm: 'type88', initStub: 0x275d98, initBody: 0x275da0,
  handler: 0x275f30, palette: 0x275ea2,
  recordPrototype: 0x275eac, subPrototype: 0x275ecc, cueCursor: 0x275f04,
  initAimSite: 0x24200a, headingArt: 0x272d7a, fanVectors: 0x2731fa,
  aim: { entry: 0x24203e, slew: 0x242190 }, aim64: black11.aim64,
  spriteTable: 0x2763d8,
  emitter: { recordDispatch: 0x27829c, recordEntries: 18,
    registerDispatch: 0x2782e4, registerEntries: 12 },
  bullet: {
    direct: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x2813f0, semantic: 'bank-a-direct',
    },
    spreadTwo: {
      ...BLACK_BULLET_SPAWN_RESOURCES,
      entry: 0x281442, semantic: 'bank-a-spread-two',
    },
    sites: [0x2761de, 0x2761e6, 0x2761ee, 0x27622e, 0x276236, 0x27623e],
  },
  score: black11.score, cues: BLACK_CUE_RESOURCES, effects: black11.effects,
  effect: {
    sites: [0x2762c6, 0x276304, 0x276348, 0x27638e],
    remap: 0x278320, hook: 1,
  },
  secondaryBurst: 0x289b22,
  poolA: BLACK_POOL_A_RESOURCES, poolAKind: 0x08, poolAOffsets: 0x2763e8,
  sound: { death: 0x28c2dc },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white88 = {
  edition: 'white',
  type: 0x88, algorithm: 'type88', initStub: 0x174e3a, initBody: 0x174e42,
  handler: 0x174fd2, palette: 0x174f44,
  recordPrototype: 0x174f4e, subPrototype: 0x174f6e, cueCursor: 0x174fa6,
  initAimSite: 0x142344, headingArt: 0x171dce, fanVectors: 0x17224e,
  aim: { entry: 0x142378, slew: 0x1424ca }, aim64: white11.aim64,
  spriteTable: 0x17547a,
  emitter: { recordDispatch: 0x17733a, recordEntries: 18,
    registerDispatch: 0x177382, registerEntries: 12 },
  bullet: {
    direct: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: WHITE_TYPE88_BULLET_KINDS,
      entry: 0x180474, semantic: 'bank-a-direct',
    },
    spreadTwo: {
      ...WHITE_BULLET_SPAWN_RESOURCES,
      supportedKinds: WHITE_TYPE88_BULLET_KINDS,
      entry: 0x1804c2, semantic: 'bank-a-spread-two',
    },
    sites: [0x175280, 0x175288, 0x175290, 0x1752d0, 0x1752d8, 0x1752e0],
  },
  score: white11.score, cues: WHITE_CUE_RESOURCES, effects: white11.effects,
  effect: {
    sites: [0x175368, 0x1753a6, 0x1753ea, 0x175430],
    remap: 0x1773be, hook: 1,
  },
  secondaryBurst: 0x18865e,
  poolA: WHITE_POOL_A_RESOURCES, poolAKind: 0x08, poolAOffsets: 0x17548a,
  sound: { death: 0x18ae02 },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black89 = {
  edition: 'black',
  type: 0x89, algorithm: 'type89', initStub: 0x277270, initBody: 0x277278,
  handler: 0x27733e, palette: 0x27730c,
  recordPrototype: 0x277316, subPrototype: 0x277322,
  initAimSite: 0x24202c, headingArt: 0x272e7a, pairedFan: 0x2732fa,
  aim: { entry: 0x24203e, slew: 0x242190 },
  aim64: black11.aim64,
  playerDistance: 0x268018, fireGate: black11.fireGate,
  bullet: {
    ...BLACK_BULLET_SPAWN_RESOURCES,
    entry: 0x2813f0, semantic: 'bank-a-direct', sites: [0x27745c, 0x277464],
  },
  emitter: { dispatch: 0x27829c, entries: 18 },
  score: black11.score, effects: black11.effects,
  effect: { kind: 0x0c, site: 0x2774d0, remap: 0x278320, hook: 1 },
  poolA: BLACK_POOL_A_RESOURCES, poolAKind: 0x08,
  sound: { death: 0x28c25a },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white89 = {
  edition: 'white',
  type: 0x89, algorithm: 'type89', initStub: 0x176312, initBody: 0x17631a,
  handler: 0x1763e0, palette: 0x1763ae,
  recordPrototype: 0x1763b8, subPrototype: 0x1763c4,
  initAimSite: 0x142366, headingArt: 0x171ece, pairedFan: 0x17234e,
  aim: { entry: 0x142378, slew: 0x1424ca },
  aim64: white11.aim64,
  playerDistance: 0x167090, fireGate: white11.fireGate,
  bullet: {
    ...WHITE_BULLET_SPAWN_RESOURCES,
    supportedKinds: WHITE_TYPE89_BULLET_KINDS,
    entry: 0x180474, semantic: 'bank-a-direct', sites: [0x1764fe, 0x176506],
  },
  emitter: { dispatch: 0x17733a, entries: 18 },
  score: white11.score, effects: white11.effects,
  effect: { kind: 0x0c, site: 0x176572, remap: 0x1773be, hook: 1 },
  poolA: WHITE_POOL_A_RESOURCES, poolAKind: 0x08,
  sound: { death: 0x18ad80 },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black8A = {
  edition: 'black',
  type: 0x8a, algorithm: 'type8A', initStub: 0x2766a6, initBody: 0x2766ae,
  handler: 0x276702, recordPrototype: 0x2766e0, subPrototype: 0x2766e6,
  scrollCompensation: 0x24179e, playersAlive: 0x242884,
  emitter: { dispatch: 0x27829c, entries: 18 },
  score: black11.score,
  effects: black11.effects,
  effect: { kind: 0x0c, site: 0x2767ee, remap: 0x278320, rowBytes: 0x0c, hook: 1 },
  sound: { death: 0x28c25a },
  poolA: BLACK_POOL_A_RESOURCES,
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white8A = {
  edition: 'white',
  type: 0x8a, algorithm: 'type8A', initStub: 0x175748, initBody: 0x175750,
  handler: 0x1757a4, recordPrototype: 0x175782, subPrototype: 0x175788,
  scrollCompensation: 0x141ad8, playersAlive: 0x142bbe,
  emitter: { dispatch: 0x17733a, entries: 18 },
  score: white11.score,
  effects: white11.effects,
  effect: { kind: 0x0c, site: 0x175890, remap: 0x1773be, rowBytes: 0x0c, hook: 1 },
  sound: { death: 0x18ad80 },
  poolA: WHITE_POOL_A_RESOURCES,
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
};

const black8B = {
  edition: 'black',
  type: 0x8b, algorithm: 'type8B', initStub: 0x27681c, initBody: 0x276824,
  handler: 0x27687e, recordPrototype: 0x27685e, subPrototype: 0x276862,
  scrollCompensation: 0x24179e,
  score: black11.score,
  effects: black11.effects,
  effect: { kind: 1, site: 0x276910, remap: 0x278320, rowBytes: 0x0c, hook: 1 },
  sound: { death: 0x28c25a },
  poolA: BLACK_POOL_A_RESOURCES,
  poolAKind: 0x08,
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
};

const white8B = {
  edition: 'white',
  type: 0x8b, algorithm: 'type8B', initStub: 0x1758be, initBody: 0x1758c6,
  handler: 0x175920, recordPrototype: 0x175900, subPrototype: 0x175904,
  scrollCompensation: 0x141ad8,
  score: white11.score,
  effects: white11.effects,
  effect: { kind: 1, site: 0x1759b2, remap: 0x1773be, rowBytes: 0x0c, hook: 1 },
  sound: { death: 0x18ad80 },
  poolA: WHITE_POOL_A_RESOURCES,
  poolAKind: 0x08,
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
    0x05: black05, 0x07: black27, 0x08: black08, 0x09: black09, 0x0b: black0B,
    0x0d: BLACK_TYPE0D_RESOURCES, 0x0e: BLACK_TYPE0E_RESOURCES,
    0x10: black10, 0x11: black11, 0x1c: BLACK_TYPE1C_RESOURCES,
    0x1e: BLACK_TYPE1E_RESOURCES,
    0x20: black20, 0x21: black20, 0x22: black20, 0x23: black20, 0x24: black24,
    0x27: black27, 0x31: black31,
    0x80: black80, 0x82: black82, 0x85: black85, 0x88: black88, 0x89: black89,
    0x8a: black8A, 0x8b: black8B,
  },
  displayList: { filler: [0xfc00, 0x3800, 0, 0, 0x0201], coordinates: 'black' },
});

export const WHITE_WORLD_RESOURCES = deepFreeze({
  edition: 'white', objectDispatch: 0x141294,
  background: {
    entry: 0x1602f8, init: 0x1601ca, frame: 0x16031e,
    scriptPair: 0x1605b8, palette: 0x1602d0, column: 0x1602e4,
    tileBase: 0x141094, opcode: 0x16113c, element: 0x16137c,
    elements: [{
      stage: 0, id: 0x0c, algorithm: 'common',
      ctor: 0x1617d8, upd: 0x1617f6, data: 0x233f34,
      yPos: 0x0a50, kind: 0x15, thr: 0x1400, v: 'wbgt', gate: false,
    }],
  },
  spawn: {
    entryReset: 0x162398, installer: 0x162400, walker: 0x162438,
    stageTable: 0x1623b0,
    ...sharedSpawnRam,
    low: { nullInit: 0x16688c, nullHandler: 0x166894, table: 0x16689c },
    high: { nullInit: 0x17d4b4, nullHandler: 0x17d4bc, table: 0x17d4c4 },
    typeStride: 8,
  },
  enemyFrame: { entry: 0x16256e, walker: 0x162438, driver: 0x16257c },
  movement: { entry: 0x141b60, speedPointers: 0x100920, fold: 0x141bee },
  enemyTypes: {
    0x05: white05, 0x07: white27, 0x08: white08, 0x09: white09, 0x0b: white0B,
    0x0d: WHITE_TYPE0D_RESOURCES, 0x0e: WHITE_TYPE0E_RESOURCES,
    0x10: white10, 0x11: white11, 0x1c: WHITE_TYPE1C_RESOURCES,
    0x1e: WHITE_TYPE1E_RESOURCES,
    0x20: white20, 0x21: white20, 0x22: white20, 0x23: white20, 0x24: white24,
    0x27: white27, 0x31: white31,
    0x80: white80, 0x82: white82, 0x85: white85, 0x88: white88, 0x89: white89,
    0x8a: white8A, 0x8b: white8B,
  },
  displayList: { filler: [0xfbff, 0xfc00, 0, 0, 0x0201], coordinates: 'direct' },
});

export function requireType08Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x08], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x08]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x08] : null;
  if (resources !== canonical || resources.type !== 0x08
      || resources.algorithm !== 'type08'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $08 needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType09Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x09], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x09]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x09] : null;
  if (resources !== canonical || resources.type !== 0x09
      || resources.algorithm !== 'type09'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $09 needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType0BResources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x0b], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x0b]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x0b] : null;
  if (resources !== canonical || resources.type !== 0x0b
      || resources.algorithm !== 'type0B'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $0B needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType24Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x24], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x24]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x24] : null;
  if (resources !== canonical || resources.type !== 0x24
      || resources.algorithm !== 'type24'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $24 needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType31Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x31], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x31]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x31] : null;
  if (resources !== canonical || resources.type !== 0x31
      || resources.algorithm !== 'type31'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $31 needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType82Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x82], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x82]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x82] : null;
  if (resources !== canonical || resources.type !== 0x82
      || resources.algorithm !== 'type82'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $82 needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType88Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x88], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x88]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x88] : null;
  if (resources !== canonical || resources.type !== 0x88
      || resources.algorithm !== 'type88'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $88 needs its canonical frozen edition descriptor');
  }
  return resources;
}

export function requireType89Resources(
  resources = BLACK_WORLD_RESOURCES.enemyTypes[0x89], edition = null,
) {
  const canonical = resources?.edition === 'black'
    ? BLACK_WORLD_RESOURCES.enemyTypes[0x89]
    : resources?.edition === 'white' ? WHITE_WORLD_RESOURCES.enemyTypes[0x89] : null;
  if (resources !== canonical || resources.type !== 0x89
      || resources.algorithm !== 'type89'
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError('type $89 needs its canonical frozen edition descriptor');
  }
  return resources;
}
