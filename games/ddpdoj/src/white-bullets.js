// Capability-gated Build A enemy-bullet and Pool-A resource graph.

import { WHITE_LABEL_PROFILE, resolveGameProfile } from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import { runPoolADriverWithResources } from './bee.js';
import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';
import {
  runBulletDriverWithResources, runClearTimerWithResources, runScreenClearWithResources,
} from './bulletdriver.js';

const SUPPORTED_KINDS = Object.freeze([3, 4, 5, 7, 12, 13, 19]);

export const WHITE_VECTOR_RESOURCES = Object.freeze({
  entry: 0x141d3e,
  speedPtrs: 0x100920,
  speedLevels: 256,
  quadEntries: 65,
  quadStride: 0x0208,
  fold: 0x141e2e,
  foldEntries: 256,
});

export const WHITE_BULLET_SPAWN_RESOURCES = Object.freeze({
  ...BLACK_BULLET_SPAWN_RESOURCES,
  entry: 0x180486,
  coreA: 0x180502,
  coreB: 0x1807aa,
  templatePtrs: 0x18093e,
  spawnInitPtrs: 0x180612,
  kinds: 36,
  supportedKinds: Object.freeze([12, 13]),
});

export const WHITE_AIM256_RESOURCES = Object.freeze({
  entry: 0x1425d0,
  lut: 0x14269c,
  lutEntries: 65,
  base: 0x14268c,
  baseEntries: 8,
  ops: 0x14264c,
  opStride: 8,
  opEntries: 8,
});

const WHITE_POOL_A_DISPATCH = Object.freeze([
  0x17eab4, 0x17eb50, 0x17ee92, 0x17ef56, 0x17eab4,
  0x17f01e, 0x17f106, 0x17f1ee, 0x17f2d6, 0x17f3ee,
  0x17f50a, 0x17f626, 0x17f742, 0x17f85a, 0x17f976,
  0x17fa92, 0x17eb50, 0x17f01e, 0x17f106, 0x17f1ee,
]);
const WHITE_LAYER_EMITTERS = Object.freeze([
  0x13dab0, 0x13dab0, 0x13daec, 0x13db28, 0x13db64, 0x13dba0,
]);
const WHITE_TEMPLATE_POINTERS = Object.freeze({
  0x00: 0x17ff1e,
  0x20: 0x17ff1e,
  0x2c: 0x17ffa2,
  0x30: 0x17ff1e,
  0x3c: 0x17ffa2,
});
const WHITE_FILL_HOOKS = Object.freeze({
  0x00: 0x17fce2,
  0x20: 0x17fdfa,
  0x2c: 0x17fe0c,
  0x30: 0x17fdc2,
  0x3c: 0x17fdec,
});
const WHITE_FILL_HOOK_DISPATCH = Object.freeze({
  0x17fce2: 'kind0',
  0x17fdfa: 'hyper',
  0x17fe0c: 'hyper',
  0x17fdc2: 'hyper',
  0x17fdec: 'hyper',
});
const WHITE_HOOK_DATA = Object.freeze({
  0x00: 0x17fcd2,
  0x20: 0x17fcd2,
  0x2c: 0x17fcc2,
  0x30: 0x17fcd2,
  0x3c: 0x17fcc2,
});
const WHITE_BODY_DISPATCH = Object.freeze({
  0x17eab4: 0x27fa30,
  0x17f2d6: 0x280252,
  0x17f626: 0x2805a2,
  0x17f742: 0x2806be,
  0x17fa92: 0x280a0e,
});
const WHITE_HYPER_BY_BODY = Object.freeze({
  0x17f2d6: Object.freeze({ site: 0x17f2d6, bit: 0x1000, counter: 0x817f86, add: 1,
    selector: 0x00050000, score: 0x50, sound: 0x18b10a,
    step: 0x24, wrap: 0x001bcd0c, base: 0x001bcacc, aimY: 0x000c, aimX: 0x673c }),
  0x17f626: Object.freeze({ site: 0x17f626, bit: 0x1000, counter: 0x817f86, add: 8,
    selector: 0x00010008, score: 0x1000, sound: 0x18b10a,
    step: 0xc4, wrap: 0x001be2cc, base: 0x001bd68c, aimY: 0x000c, aimX: 0x6740 }),
  0x17f742: Object.freeze({ site: 0x17f742, bit: 0x0800, counter: 0x817f8a, add: 1,
    selector: 0x00050000, score: 0x50, sound: 0x18b10a,
    step: 0x24, wrap: 0x001bcd0c, base: 0x001bcacc, aimY: 0x000b, aimX: 0x673c }),
  0x17fa92: Object.freeze({ site: 0x17fa92, bit: 0x0800, counter: 0x817f8a, add: 8,
    selector: 0x00010008, score: 0x1000, sound: 0x18b10a,
    step: 0xc4, wrap: 0x001be2cc, base: 0x001bd68c, aimY: 0x000b, aimX: 0x6740 }),
});

export const WHITE_POOL_A_RESOURCES = Object.freeze({
  alloc: 0x17e9aa,
  fill: 0x17fbc2,
  driver: 0x17e9de,
  dispatch: 0x17ea22,
  dispatchEntries: WHITE_POOL_A_DISPATCH,
  validateDispatch: true,
  bodyDispatch: WHITE_BODY_DISPATCH,
  base: 0x8171be,
  liveCount: 0x817f7e,
  stride: 0x2c,
  generalSlots: 70,
  totalSlots: 80,
  scrollShort: 0x813176,
  ownerAt: 0x24,
  collectedImpact: false,
  kind0Collect: false,
  kind0Body: 0x17eab4,
  kind0Threshold: 0x34,
  hyperThreshold: 0x23,
  ownerDistance: 0x600,
  presentationStub: 0x13eeee,
  collectionWrapper: 0x18b10a,
  aim: WHITE_AIM256_RESOURCES,
  vectors: WHITE_VECTOR_RESOURCES,
  hyperByBody: WHITE_HYPER_BY_BODY,
  soundRequestMap: Object.freeze({ 0x18b10a: 0x28c5e4 }),
  supportedKinds: Object.freeze([0x00, 0x20, 0x2c, 0x30, 0x3c]),
  templateTable: 0x17fece,
  templatePointers: WHITE_TEMPLATE_POINTERS,
  fillHookTable: 0x17fc52,
  fillHooks: WHITE_FILL_HOOKS,
  fillHookDispatch: WHITE_FILL_HOOK_DISPATCH,
  hookData: WHITE_HOOK_DATA,
  layerTable: 0x17fc3a,
  layerEntries: 6,
  layerEmitters: WHITE_LAYER_EMITTERS,
  ownerByKind: Object.freeze({
    0x20: 0x8103e6, 0x2c: 0x8103e6,
    0x30: 0x810448, 0x3c: 0x810448,
  }),
  rng: Object.freeze({
    phase: Object.freeze({ table: 0x14322e, entries: 256 }),
    spread: Object.freeze({ table: 0x14336a, entries: 256 }),
    speed: Object.freeze({ table: 0x14359e, entries: 64 }),
  }),
});

const WHITE_BEHAVIOUR_EXPECTED = Object.freeze({
  3: 0x181380,
  4: 0x18143c,
  5: 0x1814f8,
  7: 0x181670,
  12: 0x18189c,
  13: 0x1818f6,
  19: 0x181ac4,
});
export const WHITE_BULLET_BEHAVIOUR_RESOURCES = Object.freeze({
  table: 0x180fd0,
  entry: 0x180d7e,
  kinds: 39,
  supportedKinds: SUPPORTED_KINDS,
  expected: WHITE_BEHAVIOUR_EXPECTED,
});
const WHITE_INITIALIZER_DISPATCH = Object.freeze({
  0x181380: 0x2823ec,
  0x18143c: 0x2824a8,
  0x1814f8: 0x282564,
  0x181670: 0x2826dc,
  0x18189c: 0x282908,
  0x1818f6: 0x282962,
  0x181ac4: 0x282b30,
});
const WHITE_CONTINUATION_DISPATCH = Object.freeze({
  0x1813b4: 0x282420,
  0x181470: 0x2824dc,
  0x18152c: 0x282598,
  0x1816cc: 0x282738,
  0x1818d8: 0x282944,
  0x181932: 0x28299e,
  0x181af8: 0x282b64,
});
const WHITE_CONTINUATION_STORE = Object.freeze({
  0x282420: 0x1813b4,
  0x2824dc: 0x181470,
  0x282598: 0x18152c,
  0x282738: 0x1816cc,
  0x282944: 0x1818d8,
  0x28299e: 0x181932,
  0x282b64: 0x181af8,
});

export const WHITE_MOVER_RESOURCES = Object.freeze({
  entry: 0x180d7e,
  driver: 0x180d3a,
  scrollComp: 0x813176,
  liveCount: 0x81b40c,
  cadence: 0x81b40e,
  window: Object.freeze([0x81b414, 0x81b416, 0x81b418, 0x81b41a]),
  iterCounts: Object.freeze([0x45, 0x6d, 0x9f, 0xbd, 0xd1]),
  freezeC: 0x811f72,
  stageKill: 0x8130f8,
  pool: 0x817f8c,
  slots: 210,
  stride: 0x40,
  templatePtrs: 0x18093e,
  muzzleTable: 0x1829aa,
  directionTable: 0x1828aa,
  directionSpriteTables: Object.freeze({ 0x282714: 0x1816a8 }),
  spriteEmit: 0x182ee4,
  behaviour: WHITE_BULLET_BEHAVIOUR_RESOURCES,
  vectors: WHITE_VECTOR_RESOURCES,
  initializerDispatch: WHITE_INITIALIZER_DISPATCH,
  continuationDispatch: WHITE_CONTINUATION_DISPATCH,
  continuationStore: WHITE_CONTINUATION_STORE,
  poolA: WHITE_POOL_A_RESOURCES,
});

export const WHITE_BULLET_DRIVER_RESOURCES = Object.freeze({
  entry: 0x180d3a,
  screenClear: 0x180c76,
  timer: 0x152b5a,
  armWord: 0x81b410,
  modeWord: 0x81b412,
  liveCount: 0x81b40c,
  trailCursor: 0x81b41c,
  buf22: 0x809274,
  ctr22: 0x80afe0,
  buf23: 0x809c4c,
  ctr23: 0x80afe2,
  pool: 0x817f8c,
  stride: 0x40,
  mover: WHITE_MOVER_RESOURCES,
  poolA: WHITE_POOL_A_RESOURCES,
});

export const WHITE_ENEMY_BULLET_RESOURCES = Object.freeze({
  spawn: WHITE_BULLET_SPAWN_RESOURCES,
  vectors: WHITE_VECTOR_RESOURCES,
  aim256: WHITE_AIM256_RESOURCES,
  poolA: WHITE_POOL_A_RESOURCES,
  behaviours: WHITE_BULLET_BEHAVIOUR_RESOURCES,
  mover: WHITE_MOVER_RESOURCES,
  driver: WHITE_BULLET_DRIVER_RESOURCES,
});

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function' || typeof rom.bytes !== 'function') {
    throw new TypeError('White Label enemy bullets need the embedded cartridge image');
  }
}

function requireWhiteBullets(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1EnemyBullets', operation);
  return profile;
}

export function runWhitePoolADriver(ram, rom, ctx, profileRequest) {
  requireWhiteBullets(profileRequest, 'White Label Stage 1 Pool-A driver');
  assertRom(rom);
  return runPoolADriverWithResources(ram, rom, ctx, WHITE_POOL_A_RESOURCES);
}

export function runWhiteScreenClear(ctx, profileRequest) {
  requireWhiteBullets(profileRequest, 'White Label Stage 1 screen clear');
  assertRom(ctx?.rom);
  return runScreenClearWithResources(ctx, WHITE_BULLET_DRIVER_RESOURCES);
}

export function runWhiteBulletDriver(ctx, profileRequest) {
  requireWhiteBullets(profileRequest, 'White Label Stage 1 enemy-bullet driver');
  assertRom(ctx?.rom);
  return runBulletDriverWithResources(ctx, WHITE_BULLET_DRIVER_RESOURCES);
}

export function runWhiteClearTimer(ram, profileRequest) {
  requireWhiteBullets(profileRequest, 'White Label Stage 1 clear timer');
  return runClearTimerWithResources(ram, WHITE_BULLET_DRIVER_RESOURCES);
}
