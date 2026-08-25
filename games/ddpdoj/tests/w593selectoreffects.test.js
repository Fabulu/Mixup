// W593: compact MAME 0.288 Version-B witnesses for all six selector pairs.
// The ignored paireffects corpus remains the reproducible raw source. These
// fixed hashes make the ordinary browser replay fail if movement, normal shots,
// focused-beam producers, option history, or style palette 23 regresses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAuthenticSelection } from '../src/authentic.js';
import {
  effectGfxIdentity, effectWitnessSha256, EFFECT_GFX_AT, EFFECT_GFX_FILE_SIZES,
  EFFECT_GFX_FRAMES, EFFECT_WITNESS_SHA256, normalizeEffectTrace, verifyEffectGfx,
  verifyEffectScenarios, verifyEffectTrace, verifyEffectWitness,
} from '../tools/effectgate.mjs';
import { Game, PRODUCED_BUCKETS } from '../src/main.js';
import { P, RAM } from '../src/machine.js';
import { mergePalette } from '../src/palette.js';
import { loadBundle } from '../src/web/assets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const WITNESS = JSON.parse(readFileSync(
  path.resolve(HERE, '../tools/oracle/w593-selector-effects.json'), 'utf8'));
const SCENARIOS = JSON.parse(readFileSync(
  path.resolve(HERE, '../tools/oracle/scenarios.json'), 'utf8'));
const WITNESS_PAIRS = new Map(WITNESS.pairs.map((pair) => [pair.key, pair]));
const HAVE = existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz'))
  && existsSync(path.join(ASSETS, 'capture.bin.gz'));
const SKIP = HAVE ? false : 'exact local selector bundle absent; this is a skip, not a pass';
const PAIRS = [[0, 2], [0, 4], [0, 6], [2, 2], [2, 4], [2, 6]];
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const MEASURED = {
  '0/2': {
    option: '0277d565dfd5c76566a4c692b43aa879751d4dd1610c1dcc0abc7077628344c5',
    palette23: '1703e92eb275f6450797646675f3e606f437155bad95c7604114304185a0fc84',
    movement: ['6b17c41ac1d700a1ac03b105b9c6d60a62ae56f65d37e1f68957292fb7cd385d', 4473, 5475, 0, 163],
    shot1: ['9ebe4b0af4ae10f50c7b1b2ff5c790eb5e340b3b81f9379cf6ebfc9b4023f3d7', '673f5ea9ba458e012e2433a01511dd5347888e41baf7b6d996b09aa50c00c566', 4],
    shot2: ['01bae61c858c04c31b5be324fdaa821e1602600e6061ddc9bdd00179f9caac4d', '37d1142b5ea231d0ea1c50dc9ceeb46ea5fecf25d2f003936f8411b67f0584e3', 16],
    laser1: [EMPTY, 0], laser2: ['df4a4a88e412e8d874f881175e9a5e1159acbca0984362daac8c19acde82a675', 120],
  },
  '0/4': {
    option: 'c27f430dd750e0e6a2cdce23d774ad55826e75c96dec3144ad0123c7c541bda5',
    palette23: '491798a139c04a0658edc60b44cb5b8c3ec7c93cb224298b1acf9aab8b801c47',
    movement: ['80c1bd3d5b44cbd9fd59fadbeea6dbd30c2f7c0ca05d3605b997c5dcf77f8e0e', 4473, 5475, 0, 163],
    shot1: ['e2fe4c0d13f671c35ced7609f28eeeb6ce3fbec11e38a1bdc9b970b31558b4a4', '8dc79bb6e1d3809e2963f466f92cb44c4fed7a0c4fd3082a23e9fc35609626fe', 3],
    shot2: ['bbe15ace216f73fe330aa98668edce8bb12cfb8ebccc861cec20425122d8fc98', 'bde6ca6887b8338626d317d5b59dcfbb7ed5c9c307a6ace4ecbb11696d3702e1', 9],
    laser1: ['33a196a1e6c9d3d43b09e8b0cb127c62dfb7a7fd690562923ef09e74ee9e63bf', 12],
    laser2: ['3ed49c8dc2217a394b57ea4e09dfa670bd1117f388ecdb78b3fc7ee1694fa082', 156],
  },
  '0/6': {
    option: 'dea7c69d95a7f381a43d4e39d6a064d4a677b7ff3d3a937529d8291e2744a5e3',
    palette23: '6dd4f2b2f60afcdee9ef874e6a9a3ac0ffc044abb76c56eb264784c39c144d5b',
    movement: ['8945cf18aa1c70c0c3a1f3e90cad24749eac51c15e999f2602d2818c86c62b39', 4473, 5475, 0, 163],
    shot1: ['42d65e343d23817fe2b932622cca4b362f09041851bd4f1bcde2c57ba896f1c1', '84c707f7e95d5f966880223695583e99283c1837b0e37cdb17680520a60f5497', 4],
    shot2: ['5f32dc7248fabd164b72cc5ea236e1b63998baed8d8d36696b708675c6e46fe1', 'd6a5d4ddfc633fff88f61b160dcc199684c4d6a30e8278ebe77df22ff170a315', 12],
    laser1: ['67315583ccdd862e01a485e18856774168f76ac835011cb7a6c4a1e385574204', 36],
    laser2: ['434028837892e1e8b97cac69540ca771238dcf0964f1291bfd17cc2660816ffe', 168],
  },
  '2/2': {
    option: 'c0e122f6e40ab8dee6a54c8496a0beb7230560fdbdc11861a041057afe52ad42',
    palette23: '1703e92eb275f6450797646675f3e606f437155bad95c7604114304185a0fc84',
    movement: ['c2c0f47bd92840483cad17d5568721d03c0e87187bfba847d6704467e77f33f6', 4473, 5453, 0, 141],
    shot1: ['d6d7abe0a67355fc2373581692dd502b0f1dd51e9ca885baabbdb813b439a4dc', '719aa90962046c19560b4205c63ce4f10e6484eb5140cdc611dcefb9c0af564f', 4],
    shot2: ['eb6837782608199fe5b0cd1b9d7653c5779d743bc155f1044ab284ab564d3939', 'bad3f52b138610eb383c79e99660eb5a8053f5a4b6e378a7154d7bbb1d918de4', 16],
    laser1: [EMPTY, 0], laser2: ['42c150b09687dc64da401c623c02673919eb0092156e3fc1909654e4f1de2c06', 84],
  },
  '2/4': {
    option: 'e0bda44200a5a70f72e31f54c7f0ab2d5609e6b59e7472a0dd73435d71d06285',
    palette23: '491798a139c04a0658edc60b44cb5b8c3ec7c93cb224298b1acf9aab8b801c47',
    movement: ['9984fd189900d6e22a4b1331867f9a977aa6f2f4232875b664672dc78472f8d0', 4473, 5453, 0, 141],
    shot1: ['3cb588e9199e9ae79f2fe8bf8038025c4e955ba81b0d4495c6def23101e15c10', 'e56b968f7cee5a97fc412df3b86bca3ae6f36570161c27abcb215fd0cb8d66ac', 3],
    shot2: ['773573ae132cee5c1e820ac323d0b77191ed77c9b63523889b44f19a7597d8b8', '39be57e9d5558138f64987725a478140399dd97ab2c844a959dafb7aafbc7f2a', 9],
    laser1: ['3356e15fc24f1882586ac2aeb9f9f9e2f1491ede0af828610eeb9941e0b901d4', 12],
    laser2: ['47c038f939b27cdd221987266f0a1cf48316cc85b00de40f00770c9b153aaad6', 156],
  },
  '2/6': {
    option: 'e27e9afd505251acca67a59375c08c5e2cd5152d59c068453764e51698ade087',
    palette23: '6dd4f2b2f60afcdee9ef874e6a9a3ac0ffc044abb76c56eb264784c39c144d5b',
    movement: ['bc65c7a6c2637cea32b3dfd10a4d3e814e9518db34cb285c8f68db25274a6328', 4473, 5453, 0, 141],
    shot1: ['3d29f0681c9e5d5ab7d9b2d00e7431f095372b0b7d637b1fed6c3a39170834ad', '719aa90962046c19560b4205c63ce4f10e6484eb5140cdc611dcefb9c0af564f', 4],
    shot2: ['dbdd26c3dd041dc0bc7a5e521e1992185f915e7b6f82c5bb8ba2597d86bf8a04', '1bb7bc726008ce8987cec7608ae7da108d7221ede6fb8949157c6119c5338f35', 12],
    laser1: ['610370c182c472a9cac2ea1ba8b217dafe512dc6614f651aa8a609cfd5e912dc', 36],
    laser2: ['d5244edd4a7e4da3926d07fc71035b4c2e7ec62601c06b67253dd0ad4d7aa2dc', 168],
  },
};

let bundlePromise;
function bundle() {
  bundlePromise ??= loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
  return bundlePromise;
}
function bytes(ram, start, length) {
  return Uint8Array.from({ length }, (_, i) => ram.u8(start + i));
}
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
function beBytes(words) {
  const out = new Uint8Array(words.length * 2);
  for (let i = 0; i < words.length; i++) {
    out[i * 2] = words[i] >>> 8;
    out[i * 2 + 1] = words[i] & 0xff;
  }
  return out;
}
function staged(game, bucket) {
  return game.staged[PRODUCED_BUCKETS.indexOf(bucket)].bytes;
}
function targetInputBytes(game) {
  const parts = [];
  for (const bucket of [5, 14, 15, 16, 19]) {
    const value = staged(game, bucket);
    const prefix = Buffer.alloc(5);
    prefix.writeUInt8(bucket, 0);
    prefix.writeUInt32BE(value.length, 1);
    parts.push(prefix, value);
  }
  return Buffer.concat(parts);
}
function targetInputHash(game) {
  return hash(targetInputBytes(game));
}
function updateCoverage(digest, lf, value) {
  const prefix = Buffer.alloc(8);
  prefix.writeUInt32BE(lf, 0);
  prefix.writeUInt32BE(value.length, 4);
  digest.update(prefix).update(value);
}
function assertTargetEvent(game, event, label) {
  assert.equal(targetInputHash(game), event.targetInputSha256, `${label} target input`);
  for (const bucket of [5, 14, 15, 16, 19]) {
    const value = staged(game, bucket);
    assert.deepEqual([value.length, hash(value)], [
      event.targetBuckets[bucket].bytes, event.targetBuckets[bucket].sha256,
    ], `${label} bucket ${bucket}`);
  }
}
function inputAt(lf) {
  if (lf >= 2002 && lf <= 2033) return 0xffef;
  if (lf === 2051 || lf === 2071) return 0xffdf;
  if (lf >= 2101 && lf <= 2240) return 0xffdf;
  if (lf >= 2241 && lf <= 2300) return 0xffcf;
  if (lf >= 2301 && lf <= 2360) return 0xffdf;
  return 0xffff;
}
function activeShots(ram) {
  let count = 0;
  for (let slot = 0; slot < 36; slot++) {
    if (ram.u16(0x810572 + slot * 0x30) & 0x8000) count++;
  }
  return count;
}

function syntheticGfxName(frame, suffix) {
  return `f${String(frame).padStart(6, '0')}.${suffix}`;
}
function syntheticGfxPayload(name) {
  const suffix = name.slice(8);
  const payload = Buffer.alloc(EFFECT_GFX_FILE_SIZES[suffix]);
  const marker = createHash('sha256').update(name).digest();
  marker.copy(payload, 0);
  marker.copy(payload, payload.length - marker.length);
  return payload;
}
function swapFilePayloads(directory, left, right) {
  const leftPayload = readFileSync(path.join(directory, left));
  const rightPayload = readFileSync(path.join(directory, right));
  writeFileSync(path.join(directory, left), rightPayload);
  writeFileSync(path.join(directory, right), leftPayload);
}

test('W593 tracked witness pins all-six target lists and rendered pixels', () => {
  assert.equal(verifyEffectScenarios(SCENARIOS), true);
  assert.equal(verifyEffectWitness(WITNESS), true);
  assert.equal(effectWitnessSha256(WITNESS), EFFECT_WITNESS_SHA256);
  assert.equal(WITNESS.schema, 'ddpdoj-w593-selector-effects-v1');
  assert.deepEqual(WITNESS.oracle, {
    emulator: 'MAME 0.288', set: 'ddpdojblk', version: 'B',
    decryptedMainCpu: { size: 6291456, fnv64: 'D4C25CA9C91B9D47' },
  });
  assert.deepEqual(WITNESS.scenario.targetBuckets, [5, 14, 15, 16, 19]);
  assert.deepEqual(WITNESS.bounds.allPairTargetBucketsExact, [2001, 2143]);
  assert.deepEqual(WITNESS.gfxCorpus.triggerLogicFrames, EFFECT_GFX_AT.split(',').map(Number));
  assert.deepEqual(WITNESS.gfxCorpus.videoFrames, [...EFFECT_GFX_FRAMES]);
  assert.deepEqual([
    WITNESS.gfxCorpus.filesPerFrame, WITNESS.gfxCorpus.consecutivePairs,
  ], [9, 62]);
  assert.deepEqual(WITNESS.pixelGate, {
    verdict: 'PASS', pairs: 372, exact: 37330944, total: 37330944,
    percent: 100, densestRun: 33, busiestSprites: 109,
    largestPaletteDeltaWords: 10,
  });
  assert.equal(WITNESS_PAIRS.size, 6);

  const images = new Set();
  const stylePalettes = new Set();
  const fighterPixels = new Set();
  const beamPixels = new Set();
  const targetLists = new Set();
  const boardLists = new Set();
  for (const [ship, style] of PAIRS) {
    const key = `${ship}/${style}`;
    const pair = WITNESS_PAIRS.get(key);
    const measured = MEASURED[key];
    const fullTargetRange = WITNESS.bounds.fullTargetRangeExactPairs.includes(key);
    assert.ok(pair, `${key} missing from tracked witness`);
    assert.deepEqual(pair.initial, {
      optionSha256: measured.option, palette23Sha256: measured.palette23,
      p1Invulnerability: 0xd0,
    });
    stylePalettes.add(pair.initial.palette23Sha256);

    const move = pair.events[2002].movement;
    const [p1Hash, y, x, vy, vx] = measured.movement;
    assert.deepEqual([
      move.p1WithoutInvulnerabilitySha256, move.posLong, move.posShort,
      move.velLong, move.velShort,
    ], [p1Hash, y, x, vy, vx], `${key} compact movement fact`);
    images.add(move.image);

    for (const [lf, fact] of [[2051, measured.shot1], [2071, measured.shot2]]) {
      const event = pair.events[lf];
      assert.deepEqual([
        event.shots.sha256, event.targetBuckets[14].sha256, event.shots.active,
      ], fact, `${key} LF${lf} compact shot fact`);
    }
    for (const [lf, fact] of [[2116, measured.laser1], [2129, measured.laser2]]) {
      const event = pair.events[lf];
      assert.deepEqual([
        event.targetBuckets[16].sha256, event.targetBuckets[16].bytes,
      ], fact, `${key} LF${lf} compact laser fact`);
    }

    for (const lf of [2051, 2071, 2116, 2129, 2241, 2301, 2361]) {
      const event = pair.events[lf];
      assert.deepEqual(Object.keys(event.targetBuckets).map(Number), [5, 14, 15, 16, 19]);
      const exactTarget = lf <= WITNESS.bounds.allPairTargetBucketsExact[1]
        || fullTargetRange;
      if (exactTarget) {
        assert.equal(event.boardDisplay.hybridSha256, event.boardDisplay.sha256,
          `${key} LF${lf} exact target replacement changed call-4 input`);
      } else {
        assert.equal(event.boardDisplay.hybridSha256, undefined,
          `${key} LF${lf} collision-contaminated target replacement was overclaimed`);
      }
      assert.ok(event.boardDisplay.records > 0, `${key} LF${lf} empty board display list`);
      assert.match(event.pixels.fullRgb24Sha256, /^[0-9a-f]{64}$/);
    }
    fighterPixels.add(pair.events[2129].pixels.fighterCropRgb24Sha256);
    beamPixels.add(pair.events[2129].pixels.beamStripRgb24Sha256);
    targetLists.add(pair.events[2129].targetInputSha256);
    boardLists.add(pair.events[2129].boardDisplay.sha256);
  }

  assert.equal(images.size, 2, 'the six pairs use two measured fighter body families');
  assert.equal(stylePalettes.size, 3, 'the six pairs use three measured style palettes');
  assert.equal(fighterPixels.size, 6, 'fighter and option pixels distinguish all six pairs');
  assert.equal(beamPixels.size, 6, 'focused beam-strip pixels distinguish all six pairs');
  assert.equal(targetLists.size, 6, 'target producer input distinguishes all six pairs');
  assert.equal(boardLists.size, 6, 'board call-4 output distinguishes all six pairs');
});

test('W593 verifier rejects partial, stale, mislabeled, and overclaimed witnesses', () => {
  const changedScenarios = structuredClone(SCENARIOS);
  changedScenarios.paireffects.gfxAt = changedScenarios.paireffects.gfxAt.replace('2370', '2371');
  assert.throws(() => verifyEffectScenarios(changedScenarios), /GFX trigger corpus changed/);
  const rejects = (mutate, pattern) => {
    const copy = structuredClone(WITNESS);
    mutate(copy);
    assert.throws(() => verifyEffectWitness(copy), pattern);
  };
  rejects((w) => w.pairs.pop(), /pair count is not six/);
  rejects((w) => { w.pairs[0].key = '2\/6'; }, /duplicate pair|selector fields disagree/);
  rejects((w) => { w.pairs[0].events[2129].targetBuckets[16].bytes = 13; },
    /partial request/);
  rejects((w) => { w.bounds.allPairTargetBucketsExact[1] = 2371; },
    /common exact producer bound changed/);
  rejects((w) => { w.pairs[0].coverage.commonTarget.logicFrames[1] = 2142; },
    /common target coverage logic-frame bounds changed/);
  rejects((w) => { delete w.pairs[0].coverage.fullOptions.frames; },
    /option coverage keys/);
  rejects((w) => { w.pairs[0].coverage.commonTarget.sha256 = 'stale'; },
    /common target coverage digest is not SHA-256/);
  rejects((w) => { w.pairs[0].coverage.fullTarget = structuredClone(w.pairs[1].coverage.fullTarget); },
    /exhaustive coverage keys/);
  rejects((w) => { w.pairs[0].initial.p1Invulnerability = 0xcf; },
    /LF2000 P1 invulnerability is not 0xd0/);
  rejects((w) => { w.pixelGate.exact--; }, /pixel gate is not exact/);
  rejects((w) => { w.gfxCorpus.videoFrames[0]++; }, /GFX video-frame corpus changed/);
  rejects((w) => { w.pairs[0].gfx.rgb24Sha256 = '0'.repeat(64); },
    /canonical digest changed/);
  rejects((w) => { w.pairs[0].trace.normalization = 'raw-tsv'; },
    /trace normalization changed/);
  rejects((w) => { w.pairs[0].events[2129].pixels.fullRgb24Sha256 = '0'.repeat(64); },
    /canonical digest changed/);
  rejects((w) => { w.pairs[0].events[2129].targetBuckets[5].bytes = 84; },
    /bucket 5 exceeds its exact capacity/);
  rejects((w) => { w.pairs[0].events[2129].pixels.fullRgb24Sha256 = 'stale'; },
    /framebuffer is not SHA-256/);
});

test('W593 GFX identity rejects every filesystem framing and payload mutation', (t) => {
  const directory = mkdtempSync(path.join(HERE, '.w593-gfx-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const suffixes = Object.keys(EFFECT_GFX_FILE_SIZES);
  for (const frame of EFFECT_GFX_FRAMES) {
    for (const suffix of suffixes) {
      const name = syntheticGfxName(frame, suffix);
      writeFileSync(path.join(directory, name), syntheticGfxPayload(name));
    }
  }

  const baseline = effectGfxIdentity(directory);
  const witness = { pairs: [{ key: '0/2', gfx: baseline }] };
  assert.deepEqual([baseline.files, baseline.bytes], [630,
    EFFECT_GFX_FRAMES.length
      * Object.values(EFFECT_GFX_FILE_SIZES).reduce((sum, size) => sum + size, 0)]);
  assert.equal(verifyEffectGfx(witness, '0/2', directory), true);

  const firstFrame = EFFECT_GFX_FRAMES[0];
  const firstName = syntheticGfxName(firstFrame, suffixes[0]);
  const firstPath = path.join(directory, firstName);
  const renamedName = firstName.replace(/\.bin$/, '.stale.bin');
  const renamedPath = path.join(directory, renamedName);
  renameSync(firstPath, renamedPath);
  try {
    assert.throws(() => verifyEffectGfx(witness, '0/2', directory),
      /GFX capture file set or order changed/, 'wrong filename stayed green');
  } finally {
    renameSync(renamedPath, firstPath);
  }

  unlinkSync(firstPath);
  try {
    assert.throws(() => effectGfxIdentity(directory),
      /GFX capture file set or order changed/, 'missing file stayed green');
  } finally {
    writeFileSync(firstPath, syntheticGfxPayload(firstName));
  }

  const extraPath = path.join(directory, 'f999999.extra.bin');
  writeFileSync(extraPath, Buffer.from([1]));
  try {
    assert.throws(() => verifyEffectGfx(witness, '0/2', directory),
      /GFX capture file set or order changed/, 'extra file stayed green');
  } finally {
    unlinkSync(extraPath);
  }

  for (const suffix of suffixes) {
    const name = syntheticGfxName(firstFrame, suffix);
    const file = path.join(directory, name);
    const exact = syntheticGfxPayload(name);
    writeFileSync(file, exact.subarray(1));
    try {
      assert.throws(() => effectGfxIdentity(directory), /GFX .* size .* changed/,
        `${suffix} wrong size stayed green`);
    } finally {
      writeFileSync(file, exact);
    }
  }

  for (const [suffix, changedField] of [
    ['palette.bin', 'paletteSha256'],
    ['regs.txt', 'displayStateSha256'],
    ['pixels.bin', 'rgb24Sha256'],
  ]) {
    const name = syntheticGfxName(firstFrame, suffix);
    const file = path.join(directory, name);
    const exact = syntheticGfxPayload(name);
    const changedPayload = Buffer.from(exact);
    changedPayload[0] ^= 1;
    writeFileSync(file, changedPayload);
    try {
      const changed = effectGfxIdentity(directory);
      assert.notEqual(changed.allSha256, baseline.allSha256, `${suffix} aggregate mutation`);
      for (const field of ['paletteSha256', 'displayStateSha256', 'rgb24Sha256']) {
        assert.equal(changed[field] === baseline[field], field !== changedField,
          `${suffix} ${field} classification`);
      }
      assert.throws(() => verifyEffectGfx(witness, '0/2', directory),
        /GFX aggregate identity changed/, `${suffix} payload mutation stayed green`);
    } finally {
      writeFileSync(file, exact);
    }
  }

  const sameSizeLeft = syntheticGfxName(firstFrame, 'bg_videoram.bin');
  const sameSizeRight = syntheticGfxName(firstFrame, 'rowscroll.bin');
  swapFilePayloads(directory, sameSizeLeft, sameSizeRight);
  try {
    assert.throws(() => verifyEffectGfx(witness, '0/2', directory),
      /GFX aggregate identity changed/, 'same-size name association swap stayed green');
  } finally {
    swapFilePayloads(directory, sameSizeLeft, sameSizeRight);
  }

  const crossFrameLeft = syntheticGfxName(EFFECT_GFX_FRAMES[0], 'regs.txt');
  const crossFrameRight = syntheticGfxName(EFFECT_GFX_FRAMES[1], 'regs.txt');
  swapFilePayloads(directory, crossFrameLeft, crossFrameRight);
  try {
    assert.throws(() => verifyEffectGfx(witness, '0/2', directory),
      /GFX aggregate identity changed/, 'cross-frame payload association swap stayed green');
  } finally {
    swapFilePayloads(directory, crossFrameLeft, crossFrameRight);
  }

  assert.equal(verifyEffectGfx(witness, '0/2', directory), true,
    'synthetic corpus did not return to its exact identity');
});

test('W593 trace verifier omits only the host-calendar column', () => {
  const exact = Buffer.from('lf\td_date\tleft\tright\n1\tcalendar-a\ta\tb\n2\tcalendar-b\tc\td\n');
  const normalized = Buffer.from('lf\tleft\tright\n1\ta\tb\n2\tc\td\n');
  assert.deepEqual(normalizeEffectTrace(exact), normalized);
  const tiny = { pairs: [{
    key: '0/2',
    trace: {
      logicFrames: [1, 2], rows: 2, normalization: 'omit-d_date-only-v1',
      sha256: createHash('sha256').update(normalized).digest('hex'),
    },
  }] };
  assert.equal(verifyEffectTrace(tiny, '0/2', exact), true);
  const anotherCalendar = Buffer.from(exact.toString().replaceAll('calendar-a', 'host-date-x')
    .replaceAll('calendar-b', 'host-date-y'));
  assert.equal(verifyEffectTrace(tiny, '0/2', anotherCalendar), true);

  for (const [from, to] of [
    ['left', 'stale-header'], ['right', 'other-header'], ['\ta\t', '\tx\t'],
    ['\tb\n', '\ty\n'], ['\tc\t', '\tz\t'], ['\td\n', '\tw\n'],
  ]) {
    const stale = Buffer.from(exact.toString().replace(from, to));
    assert.throws(() => verifyEffectTrace(tiny, '0/2', stale),
      /normalized capture SHA-256 changed/);
  }
  assert.throws(() => verifyEffectTrace(tiny, '0/2',
    Buffer.from(exact.toString().replace('2\tcalendar-b', '3\tcalendar-b'))),
  /logic frame 2 changed/);
  assert.throws(() => verifyEffectTrace(tiny, '0/2',
    Buffer.from(exact.toString().replace('left\tright', 'left\textra\tright'))),
  /column count changed|row 1 width changed/);
  assert.throws(() => verifyEffectTrace(tiny, '2/6', exact), /is not authentic/);
});

// The decrypted main CPU used to reduce these facts is 6,291,456 bytes with
// FNV-64 D4C25CA9C91B9D47. Each port word below is the word MAME observed.
test('W593 all six pairs match movement, shot, laser, option, and palette facts',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    for (const [ship, style] of PAIRS) {
      const key = `${ship}/${style}`;
      const measured = MEASURED[key];
      const witnessPair = WITNESS_PAIRS.get(key);
      const fullTargetRange = WITNESS.bounds.fullTargetRangeExactPairs.includes(key);
      const game = new Game(exact.seed, exact.tables, {
        logicFrame: exact.cap.frames[0].lf,
        videoFrame: exact.cap.frames[0].vf,
        bgSeed: exact.cap.part(0, 'bg'),
      });
      applyAuthenticSelection(game, { ship, style });

      if (key === '0/2') {
        assert.equal(game.ram.u8(RAM.player1 + P.invuln), 0xff,
          'default pair preserves the exact LF2000 browser checkpoint');
      } else {
        assert.equal(game.ram.u8(RAM.player1 + P.invuln),
          witnessPair.initial.p1Invulnerability, `${key} LF2000 P1 invulnerability`);
      }
      assert.equal(hash(bytes(game.ram, RAM.p1Options, 0x64)), measured.option,
        `${key} LF2000 option history`);
      const palette = mergePalette(game.palette, exact.cap.part(1, 'palette'));
      assert.equal(hash(beBytes(palette.subarray(23 * 32, 24 * 32))), measured.palette23,
        `${key} LF2000 palette bank 23`);

      const commonTargetCoverage = createHash('sha256');
      const fullOptionCoverage = createHash('sha256');
      const fullTargetCoverage = fullTargetRange ? createHash('sha256') : null;
      for (let lf = 2001; lf <= 2371; lf++) {
        game.step(inputAt(lf));
        const target = targetInputBytes(game);
        if (lf <= 2143) updateCoverage(commonTargetCoverage, lf, target);
        if (fullTargetCoverage) updateCoverage(fullTargetCoverage, lf, target);
        updateCoverage(fullOptionCoverage, lf, bytes(game.ram, RAM.p1Options, 0x64));

        const event = witnessPair.events[lf];
        if (!event) continue;
        assert.equal(hash(bytes(game.ram, RAM.p1Options, 0x64)), event.optionSha256,
          `${key} LF${lf} options`);

        if (lf === 2002) {
          const p1 = bytes(game.ram, RAM.player1, 0x62);
          p1[P.invuln] = 0;
          const [p1Hash, y, x, vy, vx] = measured.movement;
          assert.equal(hash(p1), p1Hash, `${key} LF2002 P1 record`);
          assert.deepEqual([
            game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
            game.ram.i16(RAM.player1 + P.velY), game.ram.i16(RAM.player1 + P.velX),
          ], [y, x, vy, vx], `${key} movement`);
        }
        if (lf === 2241 || lf === 2301 || lf === 2361) {
          assert.deepEqual([
            game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
            game.ram.i16(RAM.player1 + P.velY), game.ram.i16(RAM.player1 + P.velX),
            game.ram.i16(RAM.player1 + P.tilt), game.ram.u32(RAM.player1 + P.animA),
          ], [
            event.movement.posLong, event.movement.posShort,
            event.movement.velLong, event.movement.velShort,
            event.movement.tilt, Number(event.movement.image),
          ], `${key} LF${lf} focused movement`);
        }
        if (lf === 2051 || lf === 2071) {
          const [poolHash, producerHash, count] = lf === 2051
            ? measured.shot1 : measured.shot2;
          assert.equal(hash(bytes(game.ram, 0x810572, 0x6c0)), poolHash,
            `${key} LF${lf} shot pool`);
          assert.equal(hash(staged(game, 14)), producerHash, `${key} LF${lf} bucket 14`);
          assert.equal(activeShots(game.ram), count, `${key} LF${lf} active shots`);
        }
        if (lf === 2116 || lf === 2129) {
          const [producerHash, length] = lf === 2116
            ? measured.laser1 : measured.laser2;
          assert.equal(hash(staged(game, 16)), producerHash, `${key} LF${lf} bucket 16`);
          assert.equal(staged(game, 16).length, length, `${key} LF${lf} beam bytes`);
        }
        if (lf <= 2129 || fullTargetRange) {
          assertTargetEvent(game, event, `${key} LF${lf}`);
        }
      }
      assert.equal(commonTargetCoverage.digest('hex'),
        witnessPair.coverage.commonTarget.sha256,
        `${key} every target producer at LF2001..LF2143`);
      assert.equal(fullOptionCoverage.digest('hex'),
        witnessPair.coverage.fullOptions.sha256,
        `${key} every option block at LF2001..LF2371`);
      if (fullTargetCoverage) {
        assert.equal(fullTargetCoverage.digest('hex'),
          witnessPair.coverage.fullTarget.sha256,
          `${key} every target producer at LF2001..LF2371`);
      }
    }
  });
