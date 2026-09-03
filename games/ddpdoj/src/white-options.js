// Capability-gated Build A option pods and ordinary laser type-5 composition.

import { OPT, P, RAM } from './machine.js';
import {
  deriveProfileContext, resolveGameProfile, WHITE_LABEL_PROFILE,
} from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import {
  assertOptionOwnerInputAllowed, runOptionObjectWithResources,
  validateOptionEditionResources,
} from './options.js';
import {
  S, preflightSegmentDispatch, runBeamDrawWithResources,
  runSegmentDriverWithResources, wipeSegmentPoolWithResources,
} from './laser.js';
import { shotAndOptionHandlersWithResources } from './shots.js';
import { runShotPool } from './weapons.js';
import { clearPoolWithResources, runSparkDriverWithResources } from './spark.js';
import { runBuildAType5CollisionBeforeBombDamage18A1AC } from './damage.js';
import { enqueueRequest } from './spritequeue.js';
import {
  drawBonusFollowersWithResources, drawHyperStockAnimations252A52,
} from './hyper.js';
import {
  WHITE_SHOT, WHITE_SHOT_DRIVER_RESOURCES, WHITE_SHOT_LIFECYCLE_RESOURCES,
  WHITE_SPARK_RESOURCES, WHITE_TYPE5_PRESENTATION_RESOURCES,
  createWhiteShotTables,
} from './white-shots.js';
import {
  runWhiteBulletDriver, runWhiteClearTimer, runWhitePoolADriver,
} from './white-bullets.js';
import {
  runWhiteBombDamage144CE8, runWhiteBombDriver155394,
  preflightWhiteBombPointers,
} from './white-bomb.js';
import { runEnemyFrame } from './enemyframe.js';

const freezeObject = (entries) => Object.freeze(Object.fromEntries(entries));
const freezeRows = (rows) => Object.freeze(
  rows.map((row) => Object.freeze(row)),
);

const WHITE_LASER_CARTRIDGE_IDENTITY = Object.freeze({
  pointerFamilies: freezeRows([
    [0x14c66e, 0x149fe6, 0x14a00c, 0x14a032, 0x14a058, 0x14a07e,
      0x14a0a4, 0x14a0ca, 0x14a0f0, 0x14a116, 0x14a13c],
    [0x14c696, 0x14a162, 0x14a188, 0x14a1ae, 0x14a1d4, 0x14a1fa,
      0x14a220, 0x14a246, 0x14a26c, 0x14a292, 0x14a2b8],
    [0x14c6be, 0x14a2de, 0x14a304, 0x14a32a, 0x14a350, 0x14a376],
    [0x14c6e6, 0x14a646, 0x14a654],
    [0x14c6ee, 0x14a662, 0x14a670, 0x14a67e, 0x14a68c, 0x14a69a],
    [0x14c702, 0x14a6a8, 0x14a6b6, 0x14a6c4, 0x14a6d2, 0x14a6e0],
    [0x14c716, 0x14a6ee, 0x14a6ee, 0x14a6ee, 0x14a6ee, 0x14a6ee],
    [0x14c72a, 0x14c732, 0x14c746],
    [0x14c732, 0x14a754, 0x14a774, 0x14a794, 0x14a7b4, 0x14a7d4],
    [0x14c746, 0x14a7f4, 0x14a814, 0x14a834, 0x14a854, 0x14a874],
    [0x14c75a, 0x14c762, 0x14c776],
    [0x14c762, 0x14a894, 0x14a8b4, 0x14a8d4, 0x14a8f4, 0x14a914],
    [0x14c776, 0x14a934, 0x14a954, 0x14a974, 0x14a994, 0x14a9b4],
    [0x14c78a, 0x14a9d4, 0x14a9f4, 0x14aa14, 0x14aa34, 0x14aa54],
  ]),
  seedRecords: freezeRows([
    [0x149fe6, 0x149f1e, 0x14aad4, 0x14ad86],
    [0x14a00c, 0x149f1e, 0x14aad4, 0x14ad94],
    [0x14a032, 0x149f1e, 0x14aad4, 0x14ada2],
    [0x14a058, 0x149f1e, 0x14aad4, 0x14adb0],
    [0x14a07e, 0x149f1e, 0x14aad4, 0x14adbe],
    [0x14a0a4, 0x149f50, 0x14aafe, 0x14adcc],
    [0x14a0ca, 0x149f50, 0x14aafe, 0x14adda],
    [0x14a0f0, 0x149f50, 0x14aafe, 0x14ade8],
    [0x14a116, 0x149f50, 0x14aafe, 0x14adf6],
    [0x14a13c, 0x149f50, 0x14aafe, 0x14ae04],
    [0x14a162, 0x149f82, 0x14ab28, 0x14ae12],
    [0x14a188, 0x149f82, 0x14ab28, 0x14ae20],
    [0x14a1ae, 0x149f82, 0x14ab28, 0x14ae2e],
    [0x14a1d4, 0x149f82, 0x14ab28, 0x14ae3c],
    [0x14a1fa, 0x149f82, 0x14ab28, 0x14ae4a],
    [0x14a220, 0x149f82, 0x14ab52, 0x14ae12],
    [0x14a246, 0x149f82, 0x14ab52, 0x14ae20],
    [0x14a26c, 0x149f82, 0x14ab52, 0x14ae2e],
    [0x14a292, 0x149f82, 0x14ab52, 0x14ae3c],
    [0x14a2b8, 0x149f82, 0x14ab52, 0x14ae4a],
    [0x14a2de, 0x149fb4, 0x14ab7c, 0x14ae90],
    [0x14a304, 0x149fb4, 0x14ab7c, 0x14ae90],
    [0x14a32a, 0x149fb4, 0x14ab7c, 0x14ae90],
    [0x14a350, 0x149fb4, 0x14ab7c, 0x14ae90],
    [0x14a376, 0x149fb4, 0x14ab7c, 0x14ae90],
  ]),
  segmentRecords: freezeRows([
    [0x14a662, 0x14a464], [0x14a670, 0x14a48c],
    [0x14a67e, 0x14a4b4], [0x14a68c, 0x14a4dc],
    [0x14a69a, 0x14a504], [0x14a6a8, 0x14a52c],
    [0x14a6b6, 0x14a554], [0x14a6c4, 0x14a57c],
    [0x14a6d2, 0x14a5a4], [0x14a6e0, 0x14a5cc],
    [0x14a6ee, 0x14a5f4],
  ]),
  headScripts: freezeRows([
    [0x14c732, 0x14a6fc, 0x14a704, 0x14a70c, 0x14a714, 0x14a71c],
    [0x14c746, 0x14a724, 0x14a72c, 0x14a734, 0x14a73c, 0x14a744],
    [0x14c762, 0x14a6fc, 0x14a704, 0x14a70c, 0x14a714, 0x14a71c],
    [0x14c776, 0x14a724, 0x14a72c, 0x14a734, 0x14a73c, 0x14a744],
    [0x14c78a, 0x14a74c, 0x14a74c, 0x14a74c, 0x14a74c, 0x14a74c],
  ]),
  seedScriptFrames: freezeRows([
    [0x149f1e, 0x0000, 0x011e8c], [0x149f24, 0x0000, 0x0120c0],
    [0x149f2a, 0x0000, 0x0122f4], [0x149f30, 0xffff, 0x012528],
    [0x149f36, 0x0000, 0x01275c], [0x149f3c, 0x0000, 0x012990],
    [0x149f42, 0x0000, 0x012bc4], [0x149f48, 0x0000, 0x012df8],
    [0x149f4e, 0xff80],
    [0x149f50, 0x0000, 0x016078], [0x149f56, 0x0000, 0x0162ac],
    [0x149f5c, 0x0000, 0x0164e0], [0x149f62, 0x0000, 0x016714],
    [0x149f68, 0x0000, 0x016948], [0x149f6e, 0x0000, 0x016b7c],
    [0x149f74, 0xffff, 0x016db0], [0x149f7a, 0x0000, 0x016fe4],
    [0x149f80, 0xff80],
    [0x149f82, 0x0000, 0x01a584], [0x149f88, 0x0000, 0x01a7b8],
    [0x149f8e, 0xffff, 0x01a9ec], [0x149f94, 0x0000, 0x01ac20],
    [0x149f9a, 0x0000, 0x01ae54], [0x149fa0, 0x0000, 0x01b088],
    [0x149fa6, 0x0000, 0x01b2bc], [0x149fac, 0x0000, 0x01b4f0],
    [0x149fb2, 0xff80],
    [0x149fb4, 0x0000, 0x01e378], [0x149fba, 0xffff, 0x01e5ac],
    [0x149fc0, 0x0000, 0x01e7e0], [0x149fc6, 0x0000, 0x01ea14],
    [0x149fcc, 0x0000, 0x01ec48], [0x149fd2, 0x0000, 0x01ee7c],
    [0x149fd8, 0x0000, 0x01f0b0], [0x149fde, 0x0000, 0x01f2e4],
    [0x149fe4, 0xff80],
  ]),
  shipAnimationRows: freezeRows([
    [0x14aa74, 0x022e20, 0x022d7c, 0x022cd8, 0x022c34, 0x022b90, 0x022aec],
    [0x14aa8c, 0x022e20, 0x022d7c, 0x022cd8, 0x022c34, 0x022b90, 0x022aec],
    [0x14aaa4, 0x023828, 0x02370c, 0x0235f0, 0x0234d4, 0x0233b8, 0x02329c],
    [0x14aabc, 0x024448, 0x024214, 0x023fe0, 0x023dac, 0x023b78, 0x023944],
  ]),
  podPointerRows: freezeRows([
    [0x14aba6, 0x14abba, 0x14abc4, 0x14abce, 0x14abd8, 0x14abe2],
    [0x14abec, 0x14ac00, 0x14ac0a, 0x14ac14, 0x14ac1e, 0x14ac28],
    [0x14ac32, 0x14ac46, 0x14ac50, 0x14ac5a, 0x14ac64, 0x14ac6e],
    [0x14ac78, 0x14ac8c, 0x14ac8c, 0x14ac8c, 0x14ac8c, 0x14ac8c],
  ]),
  podAnimationRows: freezeRows([
    [0x14abba, 0x14ac96], [0x14abc4, 0x14aca2],
    [0x14abce, 0x14acae], [0x14abd8, 0x14acba],
    [0x14abe2, 0x14acc6], [0x14ac00, 0x14acd2],
    [0x14ac0a, 0x14acde], [0x14ac14, 0x14acea],
    [0x14ac1e, 0x14acf6], [0x14ac28, 0x14ad02],
    [0x14ac46, 0x14ad0e], [0x14ac50, 0x14ad1a],
    [0x14ac5a, 0x14ad26], [0x14ac64, 0x14ad32],
    [0x14ac6e, 0x14ad3e], [0x14ac8c, 0x14ad7a],
  ]),
  requestTargets: Object.freeze([
    0x14ae9e, 0x14aec6, 0x14aeee, 0x14af16, 0x14af3e,
    0x14af66, 0x14af8e, 0x14afb6, 0x14afde, 0x14b006,
    0x14b02e, 0x14b056, 0x14b07e, 0x14b0a6, 0x14b0ce,
    0x14b196, 0x14b196, 0x14b196, 0x14b196, 0x14b196,
  ]),
  liveScriptFamilies: freezeRows([
    [2, 2, 0, 0x14aad4, 0x149f1e, 0x149f4e,
      0x14ad86, 0x14ad94, 0x14ada2, 0x14adb0, 0x14adbe],
    [7, 2, 2, 0x14aafe, 0x149f50, 0x149f80,
      0x14adcc, 0x14adda, 0x14ade8, 0x14adf6, 0x14ae04],
    [12, 4, 0, 0x14ab28, 0x149f82, 0x149fb2,
      0x14ae12, 0x14ae20, 0x14ae2e, 0x14ae3c, 0x14ae4a],
    [12, 4, 2, 0x14ab52, 0x149f82, 0x149fb2,
      0x14ae12, 0x14ae20, 0x14ae2e, 0x14ae3c, 0x14ae4a],
    [17, 6, -1, 0x14ab7c, 0x149fb4, 0x149fe4, 0x14ae90],
  ]),
  liveBodyFamilies: freezeRows([
    [1, 2, 0, 0x14a6fc, 0x14a704, 0x14a70c, 0x14a714, 0x14a71c],
    [6, 2, 2, 0x14a724, 0x14a72c, 0x14a734, 0x14a73c, 0x14a744],
    [11, 4, 0, 0x14a6fc, 0x14a704, 0x14a70c, 0x14a714, 0x14a71c],
    [11, 4, 2, 0x14a724, 0x14a72c, 0x14a734, 0x14a73c, 0x14a744],
    [16, 6, -1, 0x14a74c],
  ]),
  livePairFamilies: freezeRows([
    [3, 0x14aa74, 4, 0x14aba6],
    [8, 0x14aa8c, 9, 0x14abec],
    [13, 0x14aaa4, 14, 0x14ac32],
    [18, 0x14aabc, 19, 0x14ac78],
  ]),
});

export const WHITE_LASER_EDITION_RESOURCES = Object.freeze({
  ptrFamily1: 0x14c66e,
  ptrFamily2a: 0x14c696,
  ptrFamily2b: 0x14c6be,
  ptrSeg: 0x14c6e6,
  ptrHead: 0x14c72a,
  ptrHeadAlt: 0x14c75a,
  ptrHeadBombLaser: 0x14c78a,
  beamRequestTable: 0x14b1be,
  hitboxTable: 0x149ed8,
  emitStub: 0x13f856,
  emitBucket: 16,
  cartridgeIdentity: WHITE_LASER_CARTRIDGE_IDENTITY,
  sparkResources: WHITE_SPARK_RESOURCES,
  segmentHandlerKinds: freezeObject([
    [0x153d6e, 'step'], [0x153d7c, 'step'],
    [0x153da2, 'body'], [0x153dbc, 'body'],
    [0x153e80, 'script'], [0x153eac, 'script'],
    [0x153e96, 'script'], [0x153ec0, 'script'],
    [0x153f42, 'script-select'], [0x153f78, 'script-select'],
    [0x153f64, 'script'], [0x153f9a, 'script'],
    [0x15401c, 'on-ship'], [0x154024, 'on-ship'],
    [0x15407a, 'on-pod'], [0x154088, 'on-pod'],
    [0x154124, 'step'], [0x154132, 'step'],
    [0x15415a, 'step'], [0x154168, 'step'],
  ]),
  segmentSounds: freezeObject([
    [0x153e80, 0x18af2e], [0x153eac, 0x18af48],
    [0x153e96, 0x18af8e], [0x153ec0, 0x18afa8],
    [0x153f64, 0x18afee], [0x153f9a, 0x18b008],
  ]),
  selectorSounds: Object.freeze([
    Object.freeze([0x18af2e, 0x18af8e]),
    Object.freeze([0x18af48, 0x18afa8]),
  ]),
  wipeSounds: Object.freeze([
    Object.freeze({ normal: Object.freeze([0x18af62, 0x18afc2]), hyper: 0x18b022 }),
    Object.freeze({ normal: Object.freeze([0x18af78, 0x18afd8]), hyper: 0x18b038 }),
  ]),
  soundRequestMap: freezeObject([
    [0x18af2e, 0x28c408], [0x18af48, 0x28c422],
    [0x18af8e, 0x28c468], [0x18afa8, 0x28c482],
    [0x18afee, 0x28c4c8], [0x18b008, 0x28c4e2],
    [0x18af62, 0x28c43c], [0x18afc2, 0x28c49c],
    [0x18b022, 0x28c4fc], [0x18af78, 0x28c452],
    [0x18afd8, 0x28c4b2], [0x18b038, 0x28c512],
  ]),
  expectedDispatch: Object.freeze([
    Object.freeze([
      0x153d6e, 0x153da2, 0x153e80, 0x15401c, 0x15407a,
      0x153d6e, 0x153da2, 0x153e96, 0x15401c, 0x15407a,
      0x154124, 0x153da2, 0x153f42, 0x15401c, 0x15407a,
      0x15415a, 0x153da2, 0x153f64, 0x15401c, 0x15407a,
    ]),
    Object.freeze([
      0x153d7c, 0x153dbc, 0x153eac, 0x154024, 0x154088,
      0x153d7c, 0x153dbc, 0x153ec0, 0x154024, 0x154088,
      0x154132, 0x153dbc, 0x153f78, 0x154024, 0x154088,
      0x154168, 0x153dbc, 0x153f9a, 0x154024, 0x154088,
    ]),
  ]),
});

function whiteLaserPresentationSink(ram, rec) {
  return enqueueRequest(ram, 16, rec);
}

const freezeBeam = (ownerIndex, values) => Object.freeze({
  scope: 'white', ownerIndex,
  slots: 32, stride: 0x30,
  soundPolicy: 'native', effectPolicy: 'native',
  presentationSink: whiteLaserPresentationSink,
  edition: WHITE_LASER_EDITION_RESOURCES,
  ...values,
});

export const WHITE_BEAMS = Object.freeze([
  freezeBeam(0, {
    d7: 1, segmentOwnerWord: 1,
    pool: 0x8112f2, rec: 0x811ef2, blk: 0x811f32, pair: 0x811892,
    word: 0x812964, player: RAM.player1, opt: RAM.p1Options,
    impact: 0x188afc, dispatch: 0x153cce,
    sound2: 0x81294c, sound1: 0x81294e,
    posHistory: 0x8127f4, imgHistory: 0x812874, drawBias: 0x180,
  }),
  freezeBeam(1, {
    d7: 0, segmentOwnerWord: 0,
    pool: 0x8118f2, rec: 0x811f12, blk: 0x811f52, pair: 0x811e92,
    word: 0x812966, player: RAM.player2, opt: RAM.p2Options,
    impact: 0x188b16, dispatch: 0x153d1e,
    sound2: 0x81294e, sound1: 0x81294c,
    posHistory: 0x812834, imgHistory: 0x8128b4, drawBias: 0,
  }),
]);

const WHITE_OPTION_CARTRIDGE_IDENTITY = Object.freeze({
  templates: freezeRows([
    [2, 0x14b622, 0x14b5fe, 0x14b26e, 0x14b3b2, 0x007c],
    [4, 0x14b67c, 0x14b60a, 0x14b2ee, 0x14b432, 0x003c],
    [6, 0x14b6d6, 0x14b616, 0x14b372, 0x14b4b6, 0x003c],
  ]),
  shotRoots: freezeRows([
    [0x14c9b0, 0x14c9c0, 0x14c9e8, 0x14c9d4, 0x14c9fc],
    [0x14ca10, 0x14ca20, 0x14ca48, 0x14ca34, 0x14ca5c],
    [0x14ca70, 0x14ca80, 0x14caa8, 0x14ca94, 0x14cabc],
    [0x14cad0, 0x14cae0, 0x14cb08, 0x14caf4, 0x14cb1c],
  ]),
  ordinaryPowerRows: freezeRows([
    [0x14c9c0, 0x14efa0, 0x14efec, 0x14f038, 0x14f084, 0x14f0d0],
    [0x14c9d4, 0x14fc3e, 0x14fc8a, 0x14fcd6, 0x14fd22, 0x14fd6e],
    [0x14ca20, 0x14efc6, 0x14f012, 0x14f05e, 0x14f0aa, 0x14f0f6],
    [0x14ca34, 0x14fc64, 0x14fcb0, 0x14fcfc, 0x14fd48, 0x14fd94],
    [0x14ca80, 0x14f11c, 0x14f13e, 0x14f160, 0x14f182, 0x14f1a4],
    [0x14ca94, 0x14fdba, 0x14fddc, 0x14fdfe, 0x14fe20, 0x14fe42],
    [0x14cae0, 0x14f1c6, 0x14f212, 0x14f25e, 0x14f2aa, 0x14f2f6],
    [0x14caf4, 0x14fe64, 0x14feb0, 0x14fefc, 0x14ff48, 0x14ff94],
  ]),
  templateAnimations: freezeRows([
    [0x14efa0, 0x14ec98], [0x14efec, 0x14ec98],
    [0x14f038, 0x14eca4], [0x14f084, 0x14eca4], [0x14f0d0, 0x14ecb0],
    [0x14efc6, 0x14ec98], [0x14f012, 0x14ec98],
    [0x14f05e, 0x14eca4], [0x14f0aa, 0x14eca4], [0x14f0f6, 0x14ecb0],
    [0x14fc3e, 0x14f936], [0x14fc8a, 0x14f936],
    [0x14fcd6, 0x14f942], [0x14fd22, 0x14f942], [0x14fd6e, 0x14f94e],
    [0x14fc64, 0x14f936], [0x14fcb0, 0x14f936],
    [0x14fcfc, 0x14f942], [0x14fd48, 0x14f942], [0x14fd94, 0x14f94e],
    [0x14f11c, 0x14ecbc], [0x14f13e, 0x14ecbc],
    [0x14f160, 0x14ecc8], [0x14f182, 0x14ecc8], [0x14f1a4, 0x14ecd4],
    [0x14fdba, 0x14f95a], [0x14fddc, 0x14f95a],
    [0x14fdfe, 0x14f966], [0x14fe20, 0x14f966], [0x14fe42, 0x14f972],
    [0x14f1c6, 0x14ece0], [0x14f212, 0x14ece0],
    [0x14f25e, 0x14ecec], [0x14f2aa, 0x14ecec], [0x14f2f6, 0x14ecf8],
    [0x14fe64, 0x14f97e], [0x14feb0, 0x14f97e],
    [0x14fefc, 0x14f98a], [0x14ff48, 0x14f98a], [0x14ff94, 0x14f996],
  ]),
  rotatingShotRoots: freezeRows([
    [0x14f11c, 0x14f400], [0x14f13e, 0x14f4d0],
    [0x14f160, 0x14f59c], [0x14f182, 0x14f668],
    [0x14f1a4, 0x14f734], [0x14fdba, 0x15009e],
    [0x14fddc, 0x15016e], [0x14fdfe, 0x15023a],
    [0x14fe20, 0x150306], [0x14fe42, 0x1503d2],
  ]),
  rotationTargetRows: freezeRows([
    [0x14f400, 0x44, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x76, 0x7e, 0x86,
      0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb8, 0xc0, 0xc8],
    [0x14f4d0, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x14f59c, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x14f668, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x14f734, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x15009e, 0x44, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x76, 0x7e, 0x86,
      0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb8, 0xc0, 0xc8],
    [0x15016e, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x15023a, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x150306, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
    [0x1503d2, 0x44, 0x4c, 0x54, 0x5c, 0x64, 0x6c, 0x74, 0x7c, 0x84,
      0x8c, 0x94, 0x9c, 0xa4, 0xac, 0xb4, 0xbc, 0xc4],
  ]),
  powerCursorRows: freezeRows([
    [2, 0, 0x1547f8, 0x154834], [2, 2, 0x154802, 0x15483e],
    [4, 0, 0x15480c, 0x154848], [4, 2, 0x154816, 0x154852],
    [6, 0, 0x154820, 0x15485c], [6, 2, 0x15482a, 0x154866],
  ]),
  countRows: freezeRows([
    [0x154834, 4, 5, 5, 6, 6], [0x15483e, 3, 4, 5, 5, 6],
    [0x154848, 3, 4, 5, 6, 6], [0x154852, 3, 4, 5, 5, 6],
    [0x15485c, 4, 5, 5, 6, 6], [0x154866, 3, 4, 5, 5, 6],
  ]),
  countPointers: Object.freeze([
    0x154834, 0x15483e, 0x154848, 0x154852, 0x15485c, 0x154866,
  ]),
});

export const WHITE_OPTION_EDITION_RESOURCES = Object.freeze({
  templates: 0x14b25e,
  rotate: 0x14b57a,
  deployTargets: 0x14bfdc,
  knockSettle: 0x14c936,
  knockRamp: 0x14c942,
  cartridgeIdentity: WHITE_OPTION_CARTRIDGE_IDENTITY,
  laser: WHITE_LASER_EDITION_RESOURCES,
  beams: WHITE_BEAMS,
});

const freezeShot = (ownerIndex, pool, countPointer) => Object.freeze({
  ownerIndex, pool, countPointer,
  slots: 36, stride: 0x30,
  gate308c: 0x81308c,
  formation2PrimaryTable: 0x14c9b0,
  formation2SecondaryTable: 0x14ca10,
  formation4Table: 0x14ca70,
  formation6Table: 0x14cad0,
  hyperCounts: 0x14cb30,
  presentationSink: null,
});

export const WHITE_OPTION_SHOT_RESOURCES = Object.freeze([
  freezeShot(0, 0x810572, 0x8127e8),
  freezeShot(1, 0x810c32, 0x8127f0),
]);

const freezeOption = (ownerIndex, values) => Object.freeze({
  ownerIndex,
  allowLaser: true,
  allowShots: true,
  virtualRequests: null,
  excludedInputMask: 0,
  edition: WHITE_OPTION_EDITION_RESOURCES,
  ...values,
});

export const WHITE_OPTION_BLOCKS = Object.freeze([
  freezeOption(0, {
    d7: 1, opt: RAM.p1Options, player: RAM.player1,
    laser: 0x811f32, beam: WHITE_BEAMS[0], rampGuard: 0x811f72,
    shotResources: WHITE_OPTION_SHOT_RESOURCES[0],
  }),
  freezeOption(1, {
    d7: 0, opt: RAM.p2Options, player: RAM.player2,
    laser: 0x811f52, beam: WHITE_BEAMS[1], rampGuard: 0x811f72,
    shotResources: WHITE_OPTION_SHOT_RESOURCES[1],
  }),
]);

function requireWhiteOptions(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1Options', operation);
  return profile;
}

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function') {
    throw new TypeError('White Label Stage 1 options need the embedded cartridge image');
  }
}

function expectU16(rom, address, expected, label) {
  if (rom.u16(address) !== expected) {
    throw new RangeError(`${label} changed at $${address.toString(16)}`);
  }
}

function expectU32(rom, address, expected, label) {
  if (rom.u32(address) !== expected) {
    throw new RangeError(`${label} changed at $${address.toString(16)}`);
  }
}

function preflightWhiteLaserCartridge(rom) {
  const identity = WHITE_LASER_CARTRIDGE_IDENTITY;
  const pointerRows = new Map();
  for (const [base, ...expected] of identity.pointerFamilies) {
    pointerRows.set(base, expected);
    for (let index = 0; index < expected.length; index++) {
      expectU32(rom, base + index * 4, expected[index], 'White laser pointer family');
    }
  }
  for (const [source, script, pair, beamRecord] of identity.seedRecords) {
    expectU32(rom, source + 20, script, 'White laser seed script');
    expectU32(rom, source + 30, pair, 'White laser seed pair');
    expectU32(rom, source + 34, beamRecord, 'White laser seed beam record');
  }
  for (let index = 0; index < identity.segmentRecords.length; index++) {
    const [source, animation] = identity.segmentRecords[index];
    const type = index < 5 ? 0x8005 : index < 10 ? 0x800a : 0x800f;
    expectU16(rom, source, type, 'White laser segment type');
    expectU32(rom, source + 6, animation, 'White laser segment animation');
  }
  const headTypes = new Map([
    [0x14c732, 0x8001], [0x14c746, 0x8006],
    [0x14c762, 0x800b], [0x14c776, 0x800b], [0x14c78a, 0x8010],
  ]);
  for (const [family, ...scripts] of identity.headScripts) {
    const sources = pointerRows.get(family);
    if (!sources || sources.length !== scripts.length) {
      throw new TypeError('White laser head identity graph is incomplete');
    }
    for (let index = 0; index < sources.length; index++) {
      expectU16(rom, sources[index], headTypes.get(family), 'White laser head type');
      expectU32(rom, sources[index] + 20, scripts[index], 'White laser head script');
    }
  }
  for (const [cursor, word, animation] of identity.seedScriptFrames) {
    expectU16(rom, cursor, word, 'White laser seed script word');
    if (word !== 0xff80) {
      expectU32(rom, cursor + 2, animation, 'White laser seed script image');
    }
  }
  const pairRoots = [0x14aad4, 0x14aafe, 0x14ab28, 0x14ab52, 0x14ab7c];
  const pairFamilies = [0, 1, 2, 2, 3];
  for (let index = 0; index < pairRoots.length; index++) {
    const pair = pairRoots[index];
    const family = identity.livePairFamilies[pairFamilies[index]];
    expectU16(rom, pair, 0x8000 | family[0], 'White laser on-ship type');
    expectU32(rom, pair + 18, family[1], 'White laser on-ship root');
    expectU16(rom, pair + 26, 0x8000 | family[2], 'White laser on-pod type');
    expectU32(rom, pair + 30, family[3], 'White laser on-pod root');
    expectU32(rom, pair + 38, 0x0008ffff, 'White laser on-pod sentinel');
  }
  for (const [base, ...images] of identity.shipAnimationRows) {
    for (let index = 0; index < images.length; index++) {
      expectU32(rom, base + index * 4, images[index], 'White laser ship animation');
    }
  }
  for (const [base, ...targets] of identity.podPointerRows) {
    for (let index = 0; index < targets.length; index++) {
      expectU32(rom, base + index * 4, targets[index], 'White laser pod pointer');
    }
  }
  for (const [target, animation] of identity.podAnimationRows) {
    expectU32(rom, target, animation, 'White laser pod animation');
  }
  for (let index = 0; index < identity.requestTargets.length; index++) {
    const entry = WHITE_LASER_EDITION_RESOURCES.beamRequestTable + index * 8;
    expectU32(rom, entry, 0x1e, 'White laser request offset');
    expectU32(rom, entry + 4, identity.requestTargets[index], 'White laser request target');
  }
}

function preflightWhiteOptionCartridge(rom) {
  const identity = WHITE_OPTION_CARTRIDGE_IDENTITY;
  for (let index = 0; index < identity.templates.length; index++) {
    const [formation, template, script, animation, shadow] = identity.templates[index];
    expectU32(
      rom, WHITE_OPTION_EDITION_RESOURCES.templates + index * 4,
      template, `White formation-${formation} option template`,
    );
    expectU32(rom, template + 0x10, script, 'White option laser script');
    expectU32(rom, template + 0x26, script, 'White option laser script reset');
    expectU32(rom, template + 0x3c, animation, 'White option animation table');
    expectU32(rom, template + 0x4e, shadow, 'White option shadow table');
  }
  for (const [base, ...targets] of identity.shotRoots) {
    for (let index = 0; index < targets.length; index++) {
      expectU32(rom, base + index * 4, targets[index], 'White option-shot root');
    }
  }
  for (const [base, ...templates] of identity.ordinaryPowerRows) {
    for (let index = 0; index < templates.length; index++) {
      expectU32(rom, base + index * 4, templates[index], 'White option-shot power row');
    }
  }
  for (const [template, animation] of identity.templateAnimations) {
    expectU32(rom, template + 0x0a, animation, 'White option-shot animation list');
  }
  for (const [template, root] of identity.rotatingShotRoots) {
    expectU32(rom, template + 2, root, 'White rotating option-shot root');
    const targetRow = identity.rotationTargetRows.find((row) => row[0] === root);
    if (!targetRow) throw new TypeError('White rotating option-shot identity graph is incomplete');
    const offsets = targetRow.slice(1);
    for (let index = 0; index < offsets.length; index++) {
      expectU32(
        rom, root + index * 4, root + offsets[index],
        'White rotating option-shot row',
      );
    }
  }
  if (identity.countPointers.length !== identity.powerCursorRows.length
      || identity.countPointers.some((pointer, index) =>
        pointer !== identity.powerCursorRows[index][3]
        || !identity.countRows.some((row) => row[0] === pointer))) {
    throw new TypeError('White option-shot count-pointer graph is incomplete');
  }
  for (const [base, ...counts] of identity.countRows) {
    for (let index = 0; index < counts.length; index++) {
      expectU16(rom, base + index * 2, counts[index], 'White option-shot count row');
    }
  }
}

function preflightWhiteOwnerPointers(ram, block) {
  const { player, opt } = block;
  if ((ram.u16(opt) & 0x8000) === 0) return;
  const identity = WHITE_OPTION_CARTRIDGE_IDENTITY;
  const formation = ram.u16(player + P.optFormation);
  const template = identity.templates.find((row) => row[0] === formation);
  if (!template) throw new RangeError(`White option formation ${formation} is unsupported`);
  const ship = ram.u16(player + P.shipSel);
  const power = ram.u16(player + 0x20);
  const beamPower = ram.u16(player + 0x22);
  if ((ship !== 0 && ship !== 2) || power > 8 || (power & 1) !== 0
      || beamPower > 8 || (beamPower & 1) !== 0) {
    throw new RangeError(`White option owner ${block.ownerIndex} has an invalid selector`);
  }
  const cursorRow = identity.powerCursorRows.find(
    (row) => row[0] === formation && row[1] === ship,
  );
  const countPointer = ram.u32(block.shotResources.countPointer);
  if (!cursorRow || countPointer !== cursorRow[3] + power) {
    throw new RangeError(`White option owner ${block.ownerIndex} has an invalid shot-count pointer`);
  }
  if (!ram.btst8(opt + OPT.flags1, 0)) return;
  const [, , script, animation, shadow, maximumIndex] = template;
  const index = ram.u16(opt + OPT.animIdx);
  const invalidAnimationIndex = formation === 4
    ? index > 0x80 || (index & 3) !== 0
    : index > maximumIndex || (index & 3) !== 0;
  if (ram.u32(opt + 0x16) !== script || ram.u32(opt + 0x30) !== script
      || ram.u32(opt + OPT.animTable) !== animation
      || ram.u32(opt + OPT.shadowTable) !== shadow
      || invalidAnimationIndex
      || (formation !== 4 && ram.u16(opt + OPT.animIdxReload) !== maximumIndex)) {
    throw new RangeError(`White option owner ${block.ownerIndex} has a malformed dynamic pointer`);
  }
}

function preflightWhiteLiveLaserPointers(ram) {
  const identity = WHITE_LASER_CARTRIDGE_IDENTITY;
  for (const beam of WHITE_BEAMS) {
    const playerPresent = (ram.u16(beam.player) & 0x8000) !== 0;
    const beamActive = (ram.u16(beam.blk) & 0x8000) !== 0;
    if (!playerPresent && !beamActive) continue;
    const ship = ram.u16(beam.player + P.shipSel);
    const formation = ram.u16(beam.player + P.optFormation);
    if (playerPresent) {
      for (let slot = 0; slot < beam.slots; slot++) {
      const record = beam.pool + slot * beam.stride;
      const type = ram.u16(record + S.type);
      if (type === 0) continue;
      const kind = type & 0x1f;
      const group = formation === 2 ? (ship === 0 ? 0 : 5)
        : formation === 4 ? 10 : formation === 6 ? 15 : -1;
      if (kind > 19 || group < 0 || kind < group || kind >= group + 5) {
        throw new RangeError(`White laser owner ${beam.ownerIndex} has segment type ${kind}`);
      }
      const family = kind % 5;
      if (family === 0) continue;
      const script = ram.u32(record + S.script);
      const index = ram.u16(record + S.w24);
      if (family === 1) {
        const row = identity.liveBodyFamilies.find(
          (candidate) => candidate[0] === kind && candidate[1] === formation
            && (candidate[2] < 0 || candidate[2] === ship),
        );
        const validScripts = row?.slice(3) ?? [];
        if (!row || !validScripts.includes(script) || (index !== 0 && index !== 4)) {
          throw new RangeError('White laser body has a malformed dynamic pointer');
        }
        continue;
      }
      if (family === 2) {
        const row = identity.liveScriptFamilies.find(
          (candidate) => candidate[0] === kind && candidate[1] === formation
            && (candidate[2] < 0 || candidate[2] === ship),
        );
        const frame = identity.seedScriptFrames.find(
          (candidate) => candidate[0] === script,
        );
        const validBeamRecords = row?.slice(6) ?? [];
        if (!row || !frame || script < row[4] || script > row[5]
            || (script - row[4]) % 6 !== 0) {
          throw new RangeError('White laser script has a malformed dynamic pointer');
        }
        if (ram.u32(record + S.w28) !== row[3]
            || !validBeamRecords.includes(ram.u32(record + S.w2c))) {
          throw new RangeError('White laser script has a malformed nested identity');
        }
        continue;
      }
      const pair = identity.livePairFamilies.find(
        (candidate) => candidate[family === 3 ? 0 : 2] === kind,
      );
      if (!pair) throw new RangeError(`White laser segment family ${kind} is unsupported`);
      if (family === 3) {
        if (script !== pair[1] || (index & 3) !== 0 || index > 20) {
          throw new RangeError('White laser ship segment has a malformed dynamic pointer');
        }
        continue;
      }
      if (script !== pair[3] || (index & 3) !== 0 || index > 8) {
        throw new RangeError('White laser pod segment has a malformed dynamic pointer');
      }
      const storedPower = ram.u16(record + S.w28);
      if (storedPower === 0xffff) continue;
      if (storedPower > 8 || (storedPower & 1) !== 0) {
        throw new RangeError('White laser pod segment has a malformed power identity');
      }
      const pointerRow = identity.podPointerRows.find((row) => row[0] === script);
      const nested = pointerRow?.[1 + storedPower / 2];
      const animation = identity.podAnimationRows.find((row) => row[0] === nested)?.[1];
      if (animation === undefined || ram.u32(record + S.w2a) !== animation) {
        throw new RangeError('White laser pod segment has a malformed animation identity');
      }
      }
    }
    if (beamActive) {
      const group = formation === 2 ? (ship === 0 ? 0 : 5)
        : formation === 4 ? 10 : formation === 6 ? 15 : -1;
      const target = ram.u32(beam.blk + 0x12);
      const validTargets = group < 0 ? [] : identity.requestTargets.slice(group, group + 5);
      if (!validTargets.includes(target)
          || ![0, 10, 20, 30].includes(ram.u16(beam.blk + 0x10))
          || ram.u16(beam.blk + 0x18) !== 30) {
        throw new RangeError(`White laser owner ${beam.ownerIndex} has a malformed beam request`);
      }
    }
  }
}

function prepareWhiteCombatBase(
  rom, ctx, profileRequest, trustedProfile = undefined,
) {
  const profile = trustedProfile ?? requireWhiteOptions(
    profileRequest, 'White Label Stage 1 option and laser island',
  );
  assertRom(rom);
  if (ctx?.rom !== undefined && ctx.rom !== rom) {
    throw new TypeError('White Label option context must use the supplied cartridge windows');
  }
  validateOptionEditionResources(
    WHITE_OPTION_EDITION_RESOURCES, WHITE_OPTION_BLOCKS,
  );
  return profile;
}

function prepareWhiteRecurringCombat(ram, rom, ctx, profile) {
  for (const block of WHITE_OPTION_BLOCKS) {
    assertOptionOwnerInputAllowed(ram, block);
  }
  preflightWhiteOptionCartridge(rom);
  preflightWhiteLaserCartridge(rom);
  for (const block of WHITE_OPTION_BLOCKS) {
    preflightWhiteOwnerPointers(ram, block);
  }
  preflightWhiteLiveLaserPointers(ram);
  const runtimeContext = { ...(ctx ?? {}), rom };
  preflightSegmentDispatch(
    runtimeContext, WHITE_BEAMS, WHITE_LASER_EDITION_RESOURCES, ram,
  );
  const tables = createWhiteShotTables(rom);
  const handlers = shotAndOptionHandlersWithResources(
    WHITE_SHOT.dispatchEntries, WHITE_SHOT_LIFECYCLE_RESOURCES,
  );
  return { profile, tables, handlers, runtimeContext };
}

const WHITE_RESET_SIDES = Object.freeze([
  Object.freeze({
    ownerIndex: 0, block: WHITE_OPTION_BLOCKS[0], beam: WHITE_BEAMS[0],
    weapon: 0x81043e, hyperEntry: 0x151dc0, laserBombEntry: 0x151dc8,
  }),
  Object.freeze({
    ownerIndex: 1, block: WHITE_OPTION_BLOCKS[1], beam: WHITE_BEAMS[1],
    weapon: 0x8104a0, hyperEntry: 0x151e08, laserBombEntry: 0x151e10,
  }),
]);

function prepareWhiteReset(ram, rom, ctx, ownerIndex, profileRequest) {
  requireWhiteOptions(profileRequest, 'White Label Stage 1 option reset');
  assertRom(rom);
  if (!Number.isSafeInteger(ownerIndex) || ownerIndex < 0 || ownerIndex > 1) {
    throw new RangeError(`White option reset owner ${ownerIndex} is outside {0, 1}`);
  }
  if (ctx?.rom !== undefined && ctx.rom !== rom) {
    throw new TypeError('White Label option reset context must use the supplied cartridge windows');
  }
  if (ctx?.soundPost !== undefined && typeof ctx.soundPost !== 'function') {
    throw new TypeError('White Label option reset sound callback must be a function');
  }
  validateOptionEditionResources(
    WHITE_OPTION_EDITION_RESOURCES, WHITE_OPTION_BLOCKS,
  );
  const side = WHITE_RESET_SIDES[ownerIndex];
  if (!Object.isFrozen(side) || side.ownerIndex !== ownerIndex
      || side.block !== WHITE_OPTION_BLOCKS[ownerIndex]
      || side.beam !== WHITE_BEAMS[ownerIndex]) {
    throw new TypeError('White Label option reset geometry is mixed or mutable');
  }
  const selector = ram.u16(side.weapon);
  if ((selector & 1) !== 0 || selector > 2) {
    throw new RangeError(`White option reset owner ${ownerIndex} has selector ${selector}`);
  }
  preflightWhiteOptionCartridge(rom);
  preflightWhiteLaserCartridge(rom);
  return side;
}

export function preflightWhiteOptionReset(
  ram, rom, ctx, ownerIndex, profileRequest,
) {
  return prepareWhiteReset(ram, rom, ctx, ownerIndex, profileRequest);
}

function resetWhiteOptions(ram, rom, ctx, ownerIndex, profileRequest, fullEntry) {
  const side = prepareWhiteReset(ram, rom, ctx, ownerIndex, profileRequest);
  if (fullEntry) {
    ram.setU16(side.block.opt, ram.u16(side.block.opt) & 0xdffb);
  }
  wipeSegmentPoolWithResources(
    ram, ctx, side.beam, WHITE_LASER_EDITION_RESOURCES, WHITE_BEAMS,
  );
  return Object.freeze({
    phase: 'option-reset', ownerIndex,
    boundary: fullEntry ? side.hyperEntry : side.laserBombEntry,
  });
}

/** `$151DC0` / `$151E08`: full White hyper beam reset entries. */
export function resetWhiteOptionsForHyper(
  ownerIndex, ram, rom, ctx, profileRequest,
) {
  return resetWhiteOptions(ram, rom, ctx, ownerIndex, profileRequest, true);
}

/** `$151DC8` / `$151E10`: White laser-bomb inner reset entries. */
export function resetWhiteOptionsForLaserBomb(
  ownerIndex, ram, rom, ctx, profileRequest,
) {
  return resetWhiteOptions(ram, rom, ctx, ownerIndex, profileRequest, false);
}

const WHITE_COMBAT_SEAMS = new WeakSet();

function traceWhiteType5(ctx, call, target) {
  ctx?.whiteType5SubsystemHook?.(Object.freeze({ call, target }), ctx);
}

function beginWhiteCombat(
  ram, rom, slot, ctx, profileRequest, trustedProfile = undefined,
) {
  const profile = prepareWhiteCombatBase(
    rom, ctx, profileRequest, trustedProfile,
  );
  preflightWhiteOptionCartridge(rom);
  preflightWhiteLaserCartridge(rom);
  preflightWhiteBombPointers(ram, rom, ctx, profile);
  if (ram.u8(slot + 2) === 0) {
    clearPoolWithResources(ram, WHITE_SPARK_RESOURCES);
    ram.setU8(slot + 2, 1);
    return Object.freeze({ phase: 'reset', shotsProcessed: 0 });
  }
  const prepared = prepareWhiteRecurringCombat(ram, rom, ctx, profile);
  const { runtimeContext } = prepared;
  const bulletCtx = {
    ...deriveProfileContext(runtimeContext, { tables: prepared.tables }),
    ram, rom,
  };
  const privateWorld = ctx?.stage1WorldPrivate;
  if (privateWorld) {
    const enemyFrame = runEnemyFrame(
      ram, rom, { ...runtimeContext, tables: privateWorld.tables },
      privateWorld.enemyHandlers, privateWorld.resources,
    );
    if (ctx != null) ctx.enemyFrame = enemyFrame;
    traceWhiteType5(ctx, 0x18a128, privateWorld.resources.enemyFrame.entry);
  }
  const poolAFrame = runWhitePoolADriver(ram, rom, bulletCtx, profile);
  traceWhiteType5(ctx, 0x18a134, 0x17e9de);
  const seam = Object.freeze({
    phase: 'before-bomb-call-18a146',
    ram, rom, slot, ctx, prepared, bulletCtx, poolAFrame,
  });
  WHITE_COMBAT_SEAMS.add(seam);
  return seam;
}

/**
 * Reach the task #237 insertion point before `$18A146 -> $155394`.
 *
 * Task #238 owns only `$18A134 -> $17E9DE` in this prefix. Task #253
 * supplies `$18A128 -> $16256E` only when the private world seam is present.
 * Neither task claims the omitted cartridge calls at `$18A122 -> $1886BC`,
 * `$18A12E -> $189890`, `$18A13A -> $18798A`, or `$18A140 -> $187C2E`.
 */
export function runWhiteType5BeforeBombCall18A146(
  ram, rom, slot, ctx, profileRequest,
) {
  return beginWhiteCombat(ram, rom, slot, ctx, profileRequest);
}

/**
 * Consume the guarded seam by running `$18A146 -> $155394`, then finish the
 * recurring type-5 graph through `$144A02 -> $144CE8`. The remaining omitted
 * cartridge calls are represented by their already-ported subsystem work.
 */
export function runWhiteType5AfterBombCall18A146Through144A02(
  ram, rom, slot, ctx, seam,
) {
  if (!WHITE_COMBAT_SEAMS.has(seam)
      || seam.phase !== 'before-bomb-call-18a146'
      || seam.ram !== ram || seam.rom !== rom || seam.slot !== slot || seam.ctx !== ctx) {
    throw new TypeError('White post-bomb phase needs its exact guarded pre-bomb seam');
  }
  WHITE_COMBAT_SEAMS.delete(seam);
  const {
    prepared, bulletCtx, poolAFrame,
  } = seam;
  const { tables, handlers } = prepared;
  const shotCtx = bulletCtx;
  const bombFrame = runWhiteBombDriver155394(
    ram, rom, shotCtx, prepared.profile,
  );
  traceWhiteType5(ctx, 0x18a146, 0x155394);
  ram.setU16(WHITE_SHOT.liveCount, 0);
  let shotsProcessed = 0;
  for (const resources of WHITE_SHOT_DRIVER_RESOURCES) {
    shotsProcessed += runShotPool(ram, rom, handlers, shotCtx, resources);
  }
  traceWhiteType5(ctx, 0x18a14c, 0x15302c);
  runOptionObjectWithResources(
    ram, shotCtx, WHITE_OPTION_BLOCKS, WHITE_OPTION_EDITION_RESOURCES,
  );
  traceWhiteType5(ctx, 0x18a152, 0x14b74a);
  const segmentsProcessed = runSegmentDriverWithResources(
    ram, shotCtx, WHITE_BEAMS, WHITE_LASER_EDITION_RESOURCES,
  );
  traceWhiteType5(ctx, 0x18a158, 0x153c3c);
  const beamDrawn = runBeamDrawWithResources(
    ram, shotCtx, WHITE_BEAMS, WHITE_LASER_EDITION_RESOURCES,
  );
  traceWhiteType5(ctx, 0x18a15e, 0x1545fe);
  const sparkFrame = runSparkDriverWithResources(
    ram, rom, shotCtx, WHITE_SPARK_RESOURCES,
  );
  traceWhiteType5(ctx, 0x18a164, 0x188bd4);
  const bulletFrame = runWhiteBulletDriver(bulletCtx, prepared.profile);
  traceWhiteType5(ctx, 0x18a194, 0x180d3a);
  const clearTimerExpired = runWhiteClearTimer(ram, prepared.profile);
  traceWhiteType5(ctx, 0x18a19a, 0x152b5a);
  const bonusFollowers = drawBonusFollowersWithResources(
    ram, rom, WHITE_TYPE5_PRESENTATION_RESOURCES.bonusFollowers,
  );
  traceWhiteType5(ctx, 0x18a1a0, 0x151fde);
  bulletCtx.whiteType5PresentationHook?.(
    ram, { address: 0x151fde, emitted: bonusFollowers }, bulletCtx,
  );
  const hyperStockAnimations = drawHyperStockAnimations252A52(ram);
  traceWhiteType5(ctx, 0x18a1a6, 0x152106);
  bulletCtx.whiteType5PresentationHook?.(
    ram, { address: 0x152106, emitted: hyperStockAnimations }, bulletCtx,
  );
  const collision = runBuildAType5CollisionBeforeBombDamage18A1AC(ram, shotCtx);
  traceWhiteType5(ctx, 0x18a1ac, collision.entry);
  let bombDamage = null;
  if (collision.reachedBombDamage) {
    bombDamage = runWhiteBombDamage144CE8(
      ram, shotCtx, collision.playerRecord, prepared.profile,
    );
    traceWhiteType5(ctx, 0x144a02, 0x144ce8);
  }

  if (ctx != null) {
    Object.assign(ctx, {
      poolAFrame, bombFrame, shotsProcessed, segmentsProcessed, beamDrawn, sparkFrame,
      bulletFrame, clearTimerExpired, bonusFollowers, hyperStockAnimations,
      whiteShotCollision: collision, whiteBombDamage: bombDamage,
    });
  }
  return Object.freeze({
    phase: 'recurring', poolAFrame, bombFrame, shotsProcessed, segmentsProcessed,
    beamDrawn, sparkFrame, bulletFrame, clearTimerExpired,
    bonusFollowers, hyperStockAnimations, collision, bombDamage,
  });
}

function tickWhiteCombat(ram, rom, slot, ctx, profileRequest, trustedProfile = undefined) {
  const seam = beginWhiteCombat(
    ram, rom, slot, ctx, profileRequest, trustedProfile,
  );
  if (seam.phase === 'reset') return seam;
  return runWhiteType5AfterBombCall18A146Through144A02(
    ram, rom, slot, ctx, seam,
  );
}

export function whiteType5CombatTick18A0E4(
  ram, rom, slot, ctx, profileRequest,
) {
  return tickWhiteCombat(ram, rom, slot, ctx, profileRequest);
}

/** Build the explicit composed type-5 map. It does not merge independent maps. */
export function createWhiteStage1CombatHandlers(rom, profileRequest) {
  const profile = requireWhiteOptions(
    profileRequest, 'White Label Stage 1 option and laser island',
  );
  assertRom(rom);
  return new Map([
    [0x05, (ram, slot, _slotIndex, ctx) => tickWhiteCombat(
      ram, rom, slot, ctx, profileRequest, profile,
    )],
  ]);
}
