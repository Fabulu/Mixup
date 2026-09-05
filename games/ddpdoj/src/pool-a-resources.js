// Dependency-light Build B Pool-A cartridge resource graph.

import { BLACK_AIM256_RESOURCES } from './aim.js';
import { BLACK_HYPER_GRANT_RESOURCES } from './item-resources.js';

const DISPATCH = Object.freeze([
  0x27fa30, 0x27facc, 0x27fe0e, 0x27fed2, 0x27fa30,
  0x27ff9a, 0x280082, 0x28016a, 0x280252, 0x28036a,
  0x280486, 0x2805a2, 0x2806be, 0x2807d6, 0x2808f2,
  0x280a0e, 0x27facc, 0x27ff9a, 0x280082, 0x28016a,
]);

const BASE_LADDER = Object.freeze([
  0x00000100, 0x00000200, 0x00000300, 0x00000400, 0x00000500,
  0x00000600, 0x00000700, 0x00000800, 0x00000900, 0x00001000,
]);

export const BLACK_POOL_A_RESOURCES = Object.freeze({
  allocator: 0x27f92a,
  allocation: 'reserved-ten',
  alloc: 0x27f8f0,
  driver: 0x27f95a,
  dispatch: 0x27f99e,
  dispatchEntries: DISPATCH,
  validateDispatch: false,
  bodyDispatch: null,
  base: 0x8171be,
  liveCount: 0x817f7e,
  stride: 0x2c,
  generalSlots: 70,
  totalSlots: 80,
  scrollShort: 0x813176,
  ownerAt: 0x24,
  collectedImpact: true,
  kind0Collect: true,
  kind0Body: 0x27fa30,
  kind0Threshold: 0x3c,
  hyperThreshold: 0x28,
  ownerDistance: 0x600,
  presentationStub: 0x23eba0,
  aim: BLACK_AIM256_RESOURCES,
  hyperByBody: null,
  soundRequestMap: null,
  bee: Object.freeze({
    allocator: 0x27f92a, allocation: 'reserved-ten',
    scanBase: 0x817dc6, slots: 10,
    supportedKinds: Object.freeze([0x04, 0x40]),
    body: 0x27facc, canonicalBody: 0x27facc,
    templatePointers: null, fillHooks: null,
    baseLadder: 0x27fd22, baseValues: BASE_LADDER,
    popupLadder: 0x27fd4a,
    waypoint: 0x27fd72,
    collectionTable: 0x280f34,
    collectionSelectors: 3,
    collectionSpriteEntries: 10,
    collectedBody: 0x28112c, transform: 0x280fdc,
    ordinaryEmitter: 0x23eba0, collectedEmitter: 0x23dbca,
    zoomScaleTable: 0x23e54a,
    x2Table: 0x2812d4, sound: 0x28c62a,
    bounceRng: Object.freeze({ table: 0x242bac, entries: 256 }),
    grant: BLACK_HYPER_GRANT_RESOURCES,
  }),
});
