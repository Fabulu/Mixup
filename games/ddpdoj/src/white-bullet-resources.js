// Build A enemy-bullet cartridge roots shared by edition-bound resource graphs.

import { BLACK_BULLET_SPAWN_RESOURCES } from './bullets.js';

export const WHITE_BULLET_KINDS = Object.freeze([3, 4, 5, 6, 7, 11, 12, 13, 19]);

export const WHITE_BULLET_SPAWN_RESOURCES = Object.freeze({
  ...BLACK_BULLET_SPAWN_RESOURCES,
  entry: 0x180486,
  coreA: 0x180502,
  coreB: 0x1807aa,
  templatePtrs: 0x18093e,
  spawnInitPtrs: 0x180612,
  kinds: 36,
  supportedKinds: WHITE_BULLET_KINDS,
  spawnInitDispatch: Object.freeze({
    0x180894: 0x2818ac,
    0x18089c: 0x2818b4,
    0x1808c8: 0x2818e0,
  }),
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
