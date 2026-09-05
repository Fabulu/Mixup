// Edition-bound cartridge resources for the item subsystem.  This module is
// deliberately dependency-free so world descriptors can share these exact
// objects without importing the item gameplay graph.

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

const BLACK_ITEM_DISPATCH = Object.freeze([
  0x27ea2a, 0x27ebdc, 0x27ed8c, 0x27ef50,
  0x27f1a6, 0x27f254, 0x27f2f0, 0x27ea18,
]);
const BLACK_ITEM_TEMPLATES = Object.freeze([
  0x27f766, 0x27f780, 0x27f79a, 0x27f7b4,
  0x27f7ce, 0x27f7b4, 0x27f7e8, 0x27f7e8,
]);
const WHITE_ITEM_DISPATCH = Object.freeze([
  0x17dadc, 0x17dc8e, 0x17de3e, 0x17e002,
  0x17e258, 0x17e306, 0x17e3a2, 0x17daca,
]);
const WHITE_ITEM_TEMPLATES = Object.freeze([
  0x17e818, 0x17e832, 0x17e84c, 0x17e866,
  0x17e880, 0x17e866, 0x17e89a, 0x17e89a,
]);

export const BLACK_ITEM_RESOURCES = deepFreeze({
  edition: 'black', supportedKinds: null,
  alloc: 0x27e812, clear: 0x27e98a, driver: 0x27e99e,
  fill: 0x27f6ae, free: 0x27f2f0,
  dispatch: { table: 0x27e9f8, entries: 8, expected: BLACK_ITEM_DISPATCH },
  templates: { table: 0x27f746, expected: BLACK_ITEM_TEMPLATES },
  kind0: {
    body: 0x27ea2a, template: 0x27f766, init: 0x27eace, motion: 0x27eae8,
    art: { table: 0x27ea1a, entries: 4 }, emitter: 0x23eb06,
  },
  collected: {
    normalList: 0x27f480, maxList: 0x27f500,
    normalTail: 0x27f54c, maxTail: 0x27f582, sharedTail: 0x27f5c2,
    stepper: 0x27f5f4, maxStepper: 0x27f656,
    bounds: { normal: 0x78, atMax: 0x44 },
  },
  collection: {
    p1: 0x252c96, p2: 0x252d24,
    p1CursorDiagnostic: 0x252ce6, p2CursorDiagnostic: 0x252d74,
    powerLists: { root: 0x25520c, count: 12, words: 5 },
    scoreRoutine: 0x286128,
  },
  rng: {
    launch: { routine: 0x242e24, table: 0x242e42, entries: 128 },
    bounce: { routine: 0x242b3c, table: 0x242bac, entries: 256 },
  },
  sounds: { pickup: 0x28c5ca, powerUp: 0x28c9f8, atMax: 0x28c5ca },
  diagnostics: {
    allocElse: 0x27e86c, allocFull: 0x27e884, driverScan: 0x27e9b0,
    dispatchLookup: 0x27e9e2, templateLookup: 0x27f6b8, artLookup: 0x27eab6,
  },
});

export const WHITE_ITEM_RESOURCES = deepFreeze({
  edition: 'white', supportedKinds: [0],
  alloc: 0x17d8c4, clear: 0x17da3c, driver: 0x17da50,
  fill: 0x17e760, free: 0x17e3a2,
  dispatch: { table: 0x17daaa, entries: 8, expected: WHITE_ITEM_DISPATCH },
  templates: { table: 0x17e7f8, expected: WHITE_ITEM_TEMPLATES },
  kind0: {
    body: 0x17dadc, template: 0x17e818, init: 0x17db80, motion: 0x17db9a,
    art: { table: 0x17dacc, entries: 4 }, emitter: 0x13ee54,
  },
  collected: {
    normalList: 0x17e532, maxList: 0x17e5b2,
    normalTail: 0x17e5fe, maxTail: 0x17e634, sharedTail: 0x17e674,
    stepper: 0x17e6a6, maxStepper: 0x17e708,
    bounds: { normal: 0x78, atMax: 0x44 },
  },
  collection: {
    p1: 0x1522a4, p2: 0x152332,
    p1CursorDiagnostic: 0x1522f4, p2CursorDiagnostic: 0x152382,
    powerLists: { root: 0x1547c8, count: 12, words: 5 },
    scoreRoutine: 0x184d82,
  },
  rng: {
    launch: { routine: 0x143174, table: 0x143192, entries: 128 },
    bounce: { routine: 0x142e8c, table: 0x142efc, entries: 256 },
  },
  sounds: { pickup: 0x18b0f0, powerUp: 0x18b51e, atMax: 0x18b0f0 },
  diagnostics: {
    allocElse: 0x17d91e, allocFull: 0x17d936, driverScan: 0x17da62,
    dispatchLookup: 0x17da94, templateLookup: 0x17e76a, artLookup: 0x17db68,
  },
});

export const BLACK_HYPER_ITEM_RESOURCES = deepFreeze({
  edition: 'black', alloc: 0x27e912, fill: 0x27f6e4,
  templateTable: 0x27f746,
  templatePointers: { 0x0c: 0x27f7b4, 0x14: 0x27f7b4 },
  templateLength: 0x1a,
  pools: { 0x0c: 0x816e7a, 0x14: 0x816ffa },
  slots: 6, stride: 0x40, count: 0x8171ba, variant: 0x8171bc,
  full: 0x27e984,
});

export const BLACK_HYPER_GRANT_RESOURCES = deepFreeze({
  edition: 'black', threshold: 0x095f, stockCap: 5, pendingCap: 4,
  gate: 0x81b6e4, arm: 0x81b410, mode: 0x81b412,
  sides: [
    {
      who: 1, kind: 0x0c, player: 0x8103e6, set: 0x81040a,
      active: 0x81b63e, earn: 0x81b64a, stock: 0x81b65c, pending: 0x81b6e0,
      entry: 0x287682, immediateSite: 0x28770c,
      modeTable: 0x25531c, modeBase: 0x20, modeAtFive: 0x2c,
    },
    {
      who: 2, kind: 0x14, player: 0x810448, set: 0x81046c,
      active: 0x81b640, earn: 0x81b64c, stock: 0x81b65e, pending: 0x81b6e2,
      entry: 0x287722, immediateSite: 0x2877ac,
      modeTable: 0x25531c, modeBase: 0x30, modeAtFive: 0x3c,
    },
  ],
  item: BLACK_HYPER_ITEM_RESOURCES,
});

export const WHITE_HYPER_ITEM_RESOURCES = deepFreeze({
  edition: 'white', alloc: 0x17d9c4, fill: 0x17e796,
  templateTable: 0x17e7f8,
  templatePointers: { 0x0c: 0x17e866, 0x14: 0x17e866 },
  templateLength: 0x1a,
  pools: { 0x0c: 0x816e7a, 0x14: 0x816ffa },
  slots: 6, stride: 0x40, count: 0x8171ba, variant: 0x8171bc,
  full: 0x17da36,
});

export const WHITE_HYPER_GRANT_RESOURCES = deepFreeze({
  edition: 'white', threshold: 0x095f, stockCap: 5, pendingCap: 4,
  gate: 0x81b6e4, arm: 0x81b410, mode: 0x81b412,
  sides: [
    {
      who: 1, kind: 0x0c, player: 0x8103e6, set: 0x81040a,
      active: 0x81b63e, earn: 0x81b64a, stock: 0x81b65c, pending: 0x81b6e0,
      entry: 0x1861c0, immediateSite: 0x18624a,
      modeTable: 0x1548d8, modeBase: 0x20, modeAtFive: 0x2c,
    },
    {
      who: 2, kind: 0x14, player: 0x810448, set: 0x81046c,
      active: 0x81b640, earn: 0x81b64c, stock: 0x81b65e, pending: 0x81b6e2,
      entry: 0x186260, immediateSite: 0x1862ea,
      modeTable: 0x1548d8, modeBase: 0x30, modeAtFive: 0x3c,
    },
  ],
  item: WHITE_HYPER_ITEM_RESOURCES,
});
