// Leaf constants shared by edition resource graphs and their translators.

export const BLACK_SCORE_RESOURCES = Object.freeze({
  hit: 0x286096,
  kill: 0x28615e,
  capTable: 0x287df0,
  refillTable: 0x287df4,
});

const freezeList = (values) => Object.freeze(values);
const freezeRng = (routine, table, entries) => Object.freeze({
  routine, table, entries,
});

const BLACK_EFFECT_EMITTERS = freezeList([
  0x23d762, 0x23d79e, 0x23d7da, 0x23d816, 0x23d852,
]);
const WHITE_EFFECT_EMITTERS = freezeList([
  0x13dab0, 0x13daec, 0x13db28, 0x13db64, 0x13dba0,
]);

export const BLACK_TYPE11_EFFECT_RESOURCES = Object.freeze({
  edition: 'black',
  poolBClear: 0x288e0c,
  poolBWalker: 0x288e20,
  poolBDriver: 0x288e4e,
  poolBAllocator: 0x289004,
  poolBTableA: 0x221520,
  poolBTableB: 0x221630,
  poolBEmitTable: 0x288ff0,
  poolBEmitters: BLACK_EFFECT_EMITTERS,
  poolBSubSpawnSite: 0x288ef0,
  poolBScrollCompensation: 0x24179e,
  poolBVector: 0x241d34,
  poolDClear: 0x289084,
  poolDAllocator: 0x289098,
  poolDDriver: 0x2890f2,
  poolDAnimate: 0x289610,
  poolDFill: 0x289658,
  poolDInitPrimary: 0x28979e,
  poolDInitAlternate: 0x2897e0,
  poolDSelectorTable: 0x2897d0,
  poolDTemplateTable: 0x2897fc,
  poolDEmitTable: 0x28924a,
  poolDEmitters: BLACK_EFFECT_EMITTERS,
  poolDVector: 0x241e34,
  poolDVectorOffsets: 0x2893d0,
  poolCEntry: 0x289af4,
  poolCDriver: 0x289b80,
  poolCEmitTable: 0x289c26,
  poolCEmitters: BLACK_EFFECT_EMITTERS,
  poolCTemplateTable: 0x289dea,
  descriptorPointerBias: 0,
  rng: Object.freeze({
    signed: freezeRng(0x242fde, 0x24301a, 256),
    byte128: freezeRng(0x24311a, 0x243174, 128),
    byte64: freezeRng(0x2431f4, 0x24324e, 64),
    poolDPosition: freezeRng(0x24397a, 0x24399c, 64),
    poolDSpeed: freezeRng(0x242ec2, 0x242ede, 256),
    poolDHold: freezeRng(0x242cac, 0x242d24, 256),
    poolDAngle: freezeRng(0x242b3c, 0x242bac, 256),
    poolDPositiveAngle: freezeRng(0x242e24, 0x242e42, 128),
  }),
});

export const WHITE_TYPE11_EFFECT_RESOURCES = Object.freeze({
  edition: 'white',
  poolBClear: 0x187948,
  poolBWalker: 0x18795c,
  poolBDriver: 0x18798a,
  poolBAllocator: 0x187b40,
  poolBTableA: 0x121520,
  poolBTableB: 0x121630,
  poolBEmitTable: 0x187b2c,
  poolBEmitters: WHITE_EFFECT_EMITTERS,
  poolBSubSpawnSite: 0x187a2c,
  poolBScrollCompensation: 0x141ad8,
  poolBVector: 0x14206e,
  poolDClear: 0x187bc0,
  poolDAllocator: 0x187bd4,
  poolDDriver: 0x187c2e,
  poolDAnimate: 0x18814c,
  poolDFill: 0x188194,
  poolDInitPrimary: 0x1882da,
  poolDInitAlternate: 0x18831c,
  poolDSelectorTable: 0x18830c,
  poolDTemplateTable: 0x188338,
  poolDEmitTable: 0x187d86,
  poolDEmitters: WHITE_EFFECT_EMITTERS,
  poolDVector: 0x14216e,
  poolDVectorOffsets: 0x187f0c,
  poolCEntry: 0x188630,
  poolCDriver: 0x1886bc,
  poolCEmitTable: 0x188762,
  poolCEmitters: WHITE_EFFECT_EMITTERS,
  poolCTemplateTable: 0x188926,
  descriptorPointerBias: -0x100000,
  rng: Object.freeze({
    signed: freezeRng(0x14332e, 0x14336a, 256),
    byte128: freezeRng(0x1434a6, 0x1434c4, 128),
    byte64: freezeRng(0x143544, 0x14359e, 64),
    poolDPosition: freezeRng(0x143cca, 0x143cec, 64),
    poolDSpeed: freezeRng(0x143212, 0x14322e, 256),
    poolDHold: freezeRng(0x142ffc, 0x143074, 256),
    poolDAngle: freezeRng(0x142e8c, 0x142efc, 256),
    poolDPositiveAngle: freezeRng(0x143174, 0x143192, 128),
  }),
});
