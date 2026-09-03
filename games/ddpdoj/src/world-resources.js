// Edition-bound cartridge roots for the shared stage-world translators.

import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';
import {
  BLACK_SCORE_RESOURCES, BLACK_TYPE11_EFFECT_RESOURCES,
} from './type11-resources.js';
import { WHITE_BULLET_SPAWN_RESOURCES } from './white-bullets.js';

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
  bullet: { site: 0x167b8c, ...WHITE_BULLET_SPAWN_RESOURCES },
  score: {
    hit: 0x184cf0, kill: 0x184db8, capTable: 0x18692e, refillTable: 0x186932,
  },
  effects: {
    poolBAllocator: 0x187b40, poolCEntry: 0x188630,
    poolCTemplateTable: 0x188926, descriptorPointerBias: -0x100000,
    rng: {
      signed: { table: 0x14336a, entries: 256 },
      byte128: { table: 0x1434c4, entries: 128 },
      byte64: { table: 0x14359e, entries: 64 },
    },
  },
  remaps: { death: 0x167018, hit: 0x167024, secondary: 0x167030 },
  sound: { death: 0x18ad80 },
  aim64: {
    ops: 0x142400, sub: 0x1423e8, add: 0x1423f4,
    base: 0x142420, lut: 0x142430, entries: 129,
  },
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
  enemyTypes: { 0x11: black11 },
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
  enemyTypes: { 0x11: white11 },
  displayList: { filler: [0xfbff, 0xfc00, 0, 0, 0x0201], coordinates: 'direct' },
});
