// Leaf constants shared by edition resource graphs and their translators.

export const BLACK_SCORE_RESOURCES = Object.freeze({
  hit: 0x286096,
  kill: 0x28615e,
  capTable: 0x287df0,
  refillTable: 0x287df4,
});

export const BLACK_TYPE11_EFFECT_RESOURCES = Object.freeze({
  poolBAllocator: 0x289004,
  poolCEntry: 0x289af4,
  poolCTemplateTable: 0x289dea,
  descriptorPointerBias: 0,
  rng: Object.freeze({
    signed: Object.freeze({ table: 0x24301a, entries: 256 }),
    byte128: Object.freeze({ table: 0x243174, entries: 128 }),
    byte64: Object.freeze({ table: 0x24324e, entries: 64 }),
  }),
});
