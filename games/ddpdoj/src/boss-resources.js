// Canonical edition-bound resource graphs for the Stage 1 boss and its Type $1E child.

import { BLACK_AIM64_RESOURCES, BLACK_AIM256_RESOURCES } from './aim.js';
import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';
import { BLACK_CUE_RESOURCES, WHITE_CUE_RESOURCES } from './cues.js';
import { BLACK_ITEM_RESOURCES, WHITE_ITEM_RESOURCES } from './item-resources.js';
import { WHITE_SCORE_RESOURCES } from './midboss-resources.js';
import {
  BLACK_SCORE_RESOURCES, BLACK_TYPE11_EFFECT_RESOURCES,
  WHITE_TYPE11_EFFECT_RESOURCES,
} from './type11-resources.js';
import {
  WHITE_AIM256_RESOURCES, WHITE_BULLET_SPAWN_RESOURCES,
} from './white-bullet-resources.js';

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

const BOSS_BULLET_KINDS = Object.freeze([3, 4, 5, 6, 7, 11, 12, 13, 19]);
const WHITE_AIM64_RESOURCES = Object.freeze({
  ops: 0x142400, sub: 0x1423e8, add: 0x1423f4,
  base: 0x142420, lut: 0x142430, entries: 129,
});

function generator(base, entry, semantic) {
  return {
    ...base, entry, semantic, supportedKinds: [...BOSS_BULLET_KINDS],
  };
}

export const WHITE_BOSS_SCRIPT_ALIASES = deepFreeze([
  // A0 main scripts.
  [0x191bf8, 0x293204], [0x191c10, 0x29321c],
  [0x191dae, 0x2933c2],
  [0x191e0c, 0x293420], [0x191e1e, 0x293432],
  [0x191e8e, 0x2934a2], [0x191e98, 0x2934ac],
  [0x191ee4, 0x2934f8], [0x191ef2, 0x293506],
  [0x191f64, 0x293578], [0x191f8a, 0x29359e],
  [0x191fca, 0x2935de], [0x191fd4, 0x2935e8],
  [0x192020, 0x293634], [0x19202e, 0x293642],
  [0x1920a0, 0x2936b4], [0x1920aa, 0x2936be],

  // A1 E-scripts whose Black implementations are ported.
  [0x19433e, 0x2958f2], [0x194394, 0x295948],
  [0x1944ca, 0x295a7e], [0x19452c, 0x295ae0],
  [0x19485a, 0x295e0e], [0x1948aa, 0x295e5e],
  [0x194990, 0x295f44], [0x1949e0, 0x295f94],
  [0x194ace, 0x296082], [0x194b40, 0x2960f4],
  [0x194bd4, 0x296188], [0x194c4c, 0x296200],
  [0x194dae, 0x296362], [0x194dee, 0x2963a2],
  [0x195044, 0x2965f8], [0x195060, 0x296614],
  [0x1950dc, 0x29669c], [0x1950f8, 0x2966b8],
  [0x195188, 0x296752], [0x1951c6, 0x296790],
  [0x19531c, 0x2968e6], [0x195334, 0x2968fe],

  // A2 object scripts.
  [0x191346, 0x292952], [0x191366, 0x292972],
  [0x1914fc, 0x292b08], [0x1915ee, 0x292bfa],
  [0x1917fe, 0x292e0a], [0x191832, 0x292e3e],
  [0x19193e, 0x292f4a],

  // A3 D-scripts.
  [0x1921a2, 0x2937b6], [0x1921b8, 0x2937cc],
  [0x1921ec, 0x293800], [0x192202, 0x293816],
  [0x192236, 0x29384a], [0x19223e, 0x293852],
  [0x192268, 0x29387c], [0x192270, 0x293884],
  [0x192326, 0x29393a], [0x192352, 0x293966],
  [0x19256e, 0x293b82], [0x19259a, 0x293bae],
  [0x1927b2, 0x293dc6], [0x1927f0, 0x293e04],
  [0x192e08, 0x2943b0],
  [0x192e46, 0x2943ee], [0x192e54, 0x2943fc],
  [0x192ebe, 0x294466], [0x192ecc, 0x294474],
  [0x192f36, 0x2944de], [0x192f3e, 0x2944e6],
  [0x192f6a, 0x294512], [0x192f72, 0x29451a],
  [0x1931b6, 0x29475e], [0x1931ca, 0x294772],
  [0x193240, 0x2947e8], [0x193254, 0x2947fc],
  [0x192fbe, 0x294566], [0x1930b0, 0x294658],
  [0x1932ca, 0x294872], [0x1932d0, 0x294878],
  [0x19330e, 0x2948b6], [0x19331c, 0x2948c4],
  [0x193386, 0x29492e], [0x193394, 0x29493c],
  [0x1933fe, 0x2949a6], [0x193412, 0x2949ba],
  [0x193488, 0x294a30], [0x19349c, 0x294a44],
  [0x193512, 0x294aba], [0x193518, 0x294ac0],

  // A4 F-scripts.
  [0x1939f8, 0x294fa0], [0x1939fe, 0x294fa6],
  [0x193a5a, 0x295002], [0x193b6c, 0x295120],
  [0x193d24, 0x2952d8], [0x193d50, 0x295304],
  [0x193e58, 0x29540c], [0x193e7e, 0x295432],
  [0x193f96, 0x29554a], [0x193fb8, 0x29556c],
  [0x194062, 0x295616], [0x194072, 0x295626],
  [0x1940d0, 0x295684], [0x194142, 0x2956f6],
]);

const BLACK_BOSS_BULLETS = {
  bankADirect: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x2813f0, 'bank-a-direct'),
  bankASpreadThree: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x281484, 'bank-a-spread-three'),
  bankBDirect: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x2816f6, 'bank-b-direct'),
  bankBPlusFour: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x281708, 'bank-b-plus4'),
  bankBSpreadTwo: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x281764, 'bank-b-spread-two'),
  bankBAdaptive: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x2817b8, 'bank-b-adaptive'),
};
const WHITE_BOSS_BULLETS = {
  bankADirect: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x180474, 'bank-a-direct'),
  bankASpreadThree: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x1804d0, 'bank-a-spread-three'),
  bankBDirect: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x180736, 'bank-b-direct'),
  bankBPlusFour: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x180746, 'bank-b-plus4'),
  bankBSpreadTwo: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x180782, 'bank-b-spread-two'),
  bankBAdaptive: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x1807a0, 'bank-b-adaptive'),
};

const BLACK_SIZE_MULTIPLIERS = [
  [0x23e88c, 1], [0x23e88e, 2], [0x23e892, 3], [0x23e89a, 4], [0x23e8a0, 5],
  [0x23e8aa, 6], [0x23e8b4, 7], [0x23e8bc, 8], [0x23e8c0, 9], [0x23e8c8, 10],
  [0x23e8d4, 11], [0x23e8e2, 12], [0x23e8ee, 13], [0x23e8fc, 14], [0x23e906, 15],
  [0x23e90e, 16], [0x23e912, 17], [0x23e91a, 18], [0x23e924, 19], [0x23e930, 20],
  [0x23e93e, 21], [0x23e94c, 22], [0x23e95c, 23], [0x23e968, 24], [0x23e972, 21],
  [0x23e982, 26], [0x23e992, 27], [0x23e9a0, 28], [0x23e9b0, 29], [0x23e9bc, 30],
  [0x23e9c6, 31], [0x23e9ce, 56],
];
const WHITE_SIZE_MULTIPLIERS = [
  [0x13ebda, 1], [0x13ebdc, 2], [0x13ebe0, 3], [0x13ebe8, 4], [0x13ebee, 5],
  [0x13ebf8, 6], [0x13ec02, 7], [0x13ec0a, 8], [0x13ec0e, 9], [0x13ec16, 10],
  [0x13ec22, 11], [0x13ec30, 12], [0x13ec3c, 13], [0x13ec4a, 14], [0x13ec54, 15],
  [0x13ec5c, 16], [0x13ec60, 17], [0x13ec68, 18], [0x13ec72, 19], [0x13ec7e, 20],
  [0x13ec8c, 21], [0x13ec9a, 22], [0x13ecaa, 23], [0x13ecb6, 24], [0x13ecc0, 21],
  [0x13ecd0, 26], [0x13ece0, 27], [0x13ecee, 28], [0x13ecfe, 29], [0x13ed0a, 30],
  [0x13ed14, 31], [0x13ed1c, 56],
];

export const BLACK_TYPE0E_RESOURCES = deepFreeze({
  edition: 'black', type: 0x0e, algorithm: 'type0E',
  initStub: 0x2926da, initBody: 0x2926e2, handler: 0x292902,
  recordPrototype: 0x2927f6, recordPrototypeWordsMinusOne: 7,
  subPrototype: 0x292806, position: 0x97fffe00,
  scripts: {
    a0: 0x293104, a1: 0x295856, a2: 0x292932,
    a3: 0x29370a, a4: 0x294f68,
  },
  aim64: BLACK_AIM64_RESOURCES,
  aim256: BLACK_AIM256_RESOURCES,
  rng: {
    waypoint: BLACK_TYPE11_EFFECT_RESOURCES.rng.poolDPositiveAngle,
    signed: BLACK_TYPE11_EFFECT_RESOURCES.rng.signed,
    byte: BLACK_TYPE11_EFFECT_RESOURCES.rng.poolDAngle,
    wordByte: BLACK_TYPE11_EFFECT_RESOURCES.rng.poolDSpeed,
    muzzleJitter: { table: 0x2432ae, entries: 128 },
  },
  bullets: BLACK_BOSS_BULLETS,
  effects: BLACK_TYPE11_EFFECT_RESOURCES,
  score: BLACK_SCORE_RESOURCES,
  items: BLACK_ITEM_RESOURCES,
  cues: BLACK_CUE_RESOURCES,
  movement: { entry: 0x2417de },
  render: {
    obj6Frames: 0x292f84, obj0Frames: 0x292a88, obj1Frames: 0x292b7a,
    partSprites: 0x292a08, partEmitters: 0x2929e8,
    sizeDispatch: 0x23e78c, sizeMultipliers: BLACK_SIZE_MULTIPLIERS,
    bodyEmitter: 0x23e08c, sharedEmitter: 0x23e020,
    extentEmitters: [[0x23e3e2, 2], [0x23e36a, 1], [0x23e45a, 3], [0x23f82a, 22]],
    obj3Table: 0x292c2a, obj4Table: 0x292e32, obj5Table: 0x292eca,
  },
  main: {
    m0: {
      animationObjects: { entry: 0x246410, table: 0x29337a },
      hpDisplayAtHandoff: true,
    },
    m2: { waypoints: 0x293482 }, m4: { waypoints: 0x293558 },
    m7: { waypoints: 0x293694 },
  },
  f: {
    f0: { palette: { bank: 0x13, source: 0x222af8, site: 0x294fc0 } },
    f1: {
      period: 0x294fca, angle: 0x294fd2, cadence: 0x294fda,
      count: 0x294fe2, spread: 0x294ff2, sequence: 0x2952d2,
      rankPeriodIncrement: true,
    },
    f6: { table: 0x295664 },
  },
  d: {
    part4: { state0: 0x293aee, state2: 0x293b50 },
    part5: { state0: 0x293d32, state2: 0x293d94 },
    d14: { cadence: 0x294546, count: 0x29454e, fan: 0x294556 },
    d6: {
      timerD: 0x294134, timerDMask: 0x1f,
      state0: 0x294154, state1: 0x2941b6, timerC: 0x2941e8,
      state2: 0x29434a, state4: 0x294392, state5: null,
      state4Wait: 8, whiteState5: false,
    },
  },
  e: {
    e0: { tables: [0x2958d2, 0x2958e2], muzzle: 0x2959c4, hpGate: 0x48cc, shots: 2 },
    e1: { muzzle: 0x2959d4, table: 0x295a6e, parameter8: -5 },
    partGun: { muzzles: 0x295dd2 },
    rotation: { cadence: 0x29607a },
    e8: { cadence: 0x296342, count: 0x296352, normalSpeedFacing: 0x1c20 },
    e11: { table: 0x2965e8, muzzle: 0x29667c, hpGate: 0x48cc },
    e12: {
      count: 0x29668c, muzzle: 0x29667c, hpGate: 0x48cc,
      angles: [0x84, 0x7c], increment: 0x12, callsPerMuzzle: 5,
    },
    e13: { fan: 0x2736fa, slotIncrement: 1 },
    e14: { hardSpeed: 4, hardBackoff: 9, hardStep: 3 },
    e56: { cadence: 8, rankCadence: 5, rankSpeed: 0xfff9, step: 0x0f },
  },
  damage: { body: 0x48cc, part1: 0x3000, part2: 0x3000 },
  sound: {
    bossClear: 0x28c170,
    d6: { wrappers: [0x28c392, 0x28c2c2, 0x28c2a8] },
    part: [0x28c2a8, 0x28c2c2], stageAdvance: 0x28cb60,
    requestMap: {
      [0x28c170]: [0x28c170], [0x28c25a]: [0x28c25a],
      [0x28c274]: [0x28c274], [0x28c2a8]: [0x28c2a8],
      [0x28c2c2]: [0x28c2c2], [0x28c392]: [0x28c392],
      [0x28cb60]: [0x28cb60],
    },
  },
  lifecycle: {
    retirement: { entry: 0x263762, semantic: 'freeEnemy' },
    stageAdvance: {
      entry: 0x242952, body: 0x242952, prelude: null, wrapAt: null,
    },
    objectDispatch: 0x240f62,
    timeoutFloor: 0x78, childType: 0x1e,
  },
  palettes: { init: [
    { bank: 0x15, source: 0x222b38, site: 0x29274e, label: 'the BOSS, install 1 of 5' },
    { bank: 0x16, source: 0x222b78, site: 0x29275e, label: 'the BOSS, install 2 of 5' },
    { bank: 0x17, source: 0x222bb8, site: 0x29276e, label: 'the BOSS, install 3 of 5' },
    { bank: 0x12, source: 0x246bf8, site: 0x29277e, label: 'the BOSS, install 4 of 5' },
    { bank: 0x11, source: 0x222c38, site: 0x29278e, label: 'the BOSS, install 5 of 5' },
  ] },
  hpDisplayOnInit: false,
  sites: { handler: 0x294ad6 },
});

export const WHITE_TYPE0E_RESOURCES = deepFreeze({
  edition: 'white', type: 0x0e, algorithm: 'type0E',
  initStub: 0x1910c6, initBody: 0x1910ce, handler: 0x1912f6,
  recordPrototype: 0x1911ea, recordPrototypeWordsMinusOne: 7,
  subPrototype: 0x1911fa, position: 0x97fffe00,
  scripts: {
    a0: 0x191af8, a1: 0x1942a2, a2: 0x191326,
    a3: 0x1920f6, a4: 0x1939c0,
  },
  aim64: WHITE_AIM64_RESOURCES,
  aim256: WHITE_AIM256_RESOURCES,
  rng: {
    waypoint: WHITE_TYPE11_EFFECT_RESOURCES.rng.poolDPositiveAngle,
    signed: WHITE_TYPE11_EFFECT_RESOURCES.rng.signed,
    byte: WHITE_TYPE11_EFFECT_RESOURCES.rng.poolDAngle,
    wordByte: WHITE_TYPE11_EFFECT_RESOURCES.rng.poolDSpeed,
    muzzleJitter: { table: 0x1435fe, entries: 128 },
  },
  bullets: WHITE_BOSS_BULLETS,
  effects: WHITE_TYPE11_EFFECT_RESOURCES,
  score: WHITE_SCORE_RESOURCES,
  items: WHITE_ITEM_RESOURCES,
  cues: WHITE_CUE_RESOURCES,
  movement: { entry: 0x141b18 },
  render: {
    obj6Frames: 0x191978, obj0Frames: 0x19147c, obj1Frames: 0x19156e,
    partSprites: 0x1913fc, partEmitters: 0x1913dc,
    sizeDispatch: 0x13eada, sizeMultipliers: WHITE_SIZE_MULTIPLIERS,
    bodyEmitter: 0x13e3da, sharedEmitter: 0x13e36e,
    extentEmitters: [[0x13e730, 2], [0x13e6b8, 1], [0x13e7a8, 3], [0x13fb78, 22]],
    obj3Table: 0x19161e, obj4Table: 0x191826, obj5Table: 0x1918be,
  },
  main: {
    m0: {
      animationObjects: { entry: 0x145aee, table: 0x191d66 },
      hpDisplayAtHandoff: false,
    },
    m2: { waypoints: 0x191e6e }, m4: { waypoints: 0x191f44 },
    m7: { waypoints: 0x192080 },
  },
  f: {
    f0: { palette: { bank: 0x13, source: 0x122af8, site: 0x193a18 } },
    f1: {
      period: 0x193a22, angle: 0x193a2a, cadence: 0x193a32,
      count: 0x193a3a, spread: 0x193a4a, sequence: 0x193d1e,
      rankPeriodIncrement: false,
    },
    f6: { table: 0x1940b0 },
  },
  d: {
    part4: { state0: 0x1924da, state2: 0x19253c },
    part5: { state0: 0x19271e, state2: 0x192780 },
    d14: { cadence: 0x192f9e, count: 0x192fa6, fan: 0x192fae },
    d6: {
      timerD: 0x192b8c, timerDMask: 0x1f,
      state0: 0x192bac, state1: 0x192c0e, timerC: 0x192c40,
      state2: 0x192da2, state4: 0x192dea, state5: 0x192d40,
      state4Wait: null, whiteState5: true,
    },
  },
  e: {
    e0: { tables: [0x19431e, 0x19432e], muzzle: 0x194410, hpGate: null, shots: 4 },
    e1: { muzzle: 0x194420, table: 0x1944ba, parameter8: -4 },
    partGun: { muzzles: 0x19481e },
    rotation: { cadence: 0x194ac6 },
    e8: { cadence: 0x194d8e, count: 0x194d9e, normalSpeedFacing: 0x2020 },
    e11: { table: 0x195034, muzzle: 0x1950bc, hpGate: null },
    e12: {
      count: 0x1950cc, muzzle: 0x1950bc, hpGate: null,
      angles: [0x80, 0x80], increment: 0x0c, callsPerMuzzle: 5,
    },
    e13: { fan: 0x17274e, slotIncrement: 2 },
    e14: { hardSpeed: 3, hardBackoff: 0x0c, hardStep: 4 },
    e56: { cadence: 6, rankCadence: 3, rankSpeed: 0xfffb, step: 0x0b },
  },
  damage: { body: 0x6d33, part1: 0x2b33, part2: 0x2b33 },
  sound: {
    bossClear: 0x18ac96,
    d6: { wrappers: [0x18aeb8, 0x18ade8, 0x18adce] },
    part: [0x18adce, 0x18ade8], stageAdvance: 0x18b686,
    requestMap: {
      [0x18ac96]: [0x28c170], [0x18ad80]: [0x28c25a],
      [0x18ad9a]: [0x28c274], [0x18adce]: [0x28c2a8],
      [0x18ade8]: [0x28c2c2],
      [0x18aeb8]: [0x28c392, 0x28c310, 0x28c392],
      [0x18b686]: [0x28cb60],
    },
  },
  lifecycle: {
    retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
    stageAdvance: {
      entry: 0x142c8c, body: 0x142c92, prelude: 0x13c814, wrapAt: 5,
    },
    objectDispatch: 0x141294,
    timeoutFloor: 0x78, childType: 0x1e,
  },
  palettes: { init: [
    { bank: 0x15, source: 0x122b38, site: 0x19113a, label: 'the White BOSS, install 1 of 5' },
    { bank: 0x16, source: 0x122b78, site: 0x19114a, label: 'the White BOSS, install 2 of 5' },
    { bank: 0x17, source: 0x122bb8, site: 0x19115a, label: 'the White BOSS, install 3 of 5' },
    { bank: 0x12, source: 0x1462d6, site: 0x19116a, label: 'the White BOSS, install 4 of 5' },
    { bank: 0x11, source: 0x122c38, site: 0x19117a, label: 'the White BOSS, install 5 of 5' },
  ] },
  hpDisplayOnInit: true,
  sites: { handler: 0x19352e },
});

export const BLACK_TYPE1E_RESOURCES = deepFreeze({
  edition: 'black', type: 0x1e, algorithm: 'type1E',
  initStub: 0x296d82, initBody: 0x296d8a,
  subPrototype: 0x296dbc, handler: 0x296dd6,
  movement: { entry: 0x2417de },
  effects: BLACK_TYPE11_EFFECT_RESOURCES,
  rng: BLACK_TYPE11_EFFECT_RESOURCES.rng.poolDSpeed,
  bullet: generator(BLACK_BULLET_SPAWN_RESOURCES, 0x2813f0, 'bank-a-direct'),
  fanTables: [0x2736fa, 0x2735fa, 0x2734fa],
  countDeltas: [4, 3],
  animationTable: 0x296f68,
  emitter: 0x23f7c6,
  sites: { effects: [0x296dfc, 0x296e4a] },
  retirement: { entry: 0x263762, semantic: 'freeEnemy' },
});

export const WHITE_TYPE1E_RESOURCES = deepFreeze({
  edition: 'white', type: 0x1e, algorithm: 'type1E',
  initStub: 0x1957b8, initBody: 0x1957c0,
  subPrototype: 0x1957f2, handler: 0x19580c,
  movement: { entry: 0x141b18 },
  effects: WHITE_TYPE11_EFFECT_RESOURCES,
  rng: WHITE_TYPE11_EFFECT_RESOURCES.rng.poolDSpeed,
  bullet: generator(WHITE_BULLET_SPAWN_RESOURCES, 0x180474, 'bank-a-direct'),
  fanTables: [0x17274e, 0x17264e, 0x17254e],
  countDeltas: [5, 5],
  animationTable: 0x19599e,
  emitter: 0x13fb14,
  sites: { effects: [0x195832, 0x195880] },
  retirement: { entry: 0x1627dc, semantic: 'freeEnemy' },
});

function recursivelyFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => recursivelyFrozen(child, seen));
}

function requireCanonical(resources, type, algorithm, edition = null) {
  let canonical = null;
  if (type === 0x0e) {
    canonical = resources?.edition === 'black' ? BLACK_TYPE0E_RESOURCES
      : resources?.edition === 'white' ? WHITE_TYPE0E_RESOURCES : null;
  } else if (type === 0x1e) {
    canonical = resources?.edition === 'black' ? BLACK_TYPE1E_RESOURCES
      : resources?.edition === 'white' ? WHITE_TYPE1E_RESOURCES : null;
  }
  if (!resources || resources !== canonical || resources.type !== type
      || resources.algorithm !== algorithm || !recursivelyFrozen(resources)
      || (edition !== null && resources.edition !== edition)) {
    throw new TypeError(`type $${type.toString(16).toUpperCase()} needs its complete recursively frozen edition descriptor`);
  }
  return resources;
}

export function requireType0EResources(resources = BLACK_TYPE0E_RESOURCES,
  edition = null) {
  return requireCanonical(resources, 0x0e, 'type0E', edition);
}

export function type0EResourcesFromContext(ctx) {
  return requireType0EResources(ctx?.bossResources ?? BLACK_TYPE0E_RESOURCES);
}

export function nativeBossScriptAddress(resources, blackAddress) {
  const canonical = requireType0EResources(resources);
  if (canonical.edition === 'black') return blackAddress & 0xffffff;
  const alias = WHITE_BOSS_SCRIPT_ALIASES.find(([, target]) => target === (blackAddress & 0xffffff));
  if (!alias) throw new TypeError(`boss script $${blackAddress.toString(16).toUpperCase()} has no White alias`);
  return alias[0];
}

export function type1EResourcesForBoss(resources) {
  const boss = requireType0EResources(resources);
  return boss.edition === 'white' ? WHITE_TYPE1E_RESOURCES : BLACK_TYPE1E_RESOURCES;
}

export function requireType1EResources(resources = BLACK_TYPE1E_RESOURCES,
  edition = null) {
  return requireCanonical(resources, 0x1e, 'type1E', edition);
}
