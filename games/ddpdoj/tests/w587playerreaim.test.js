// W587: canonical kind-28 player re-aim, split spawn, and exact frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUL, REC } from '../src/bullets.js';
import { RAM, P } from '../src/machine.js';
import { SLOT7 } from '../src/objslot7pool.js';
import { RomWindows } from '../src/rom.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, tableBeforeW588, tableBeforeW589,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const CHECKPOINTS = Object.freeze([
  here('../probes/checkpoints/ship0-style4-lf00151631.json'),
  here('../probes/checkpoints/ship0-style4-lf00152131.json'),
  here('../probes/checkpoints/ship0-style4-lf00152631.json'),
  here('../probes/checkpoints/ship0-style4-lf00153131.json'),
  here('../probes/checkpoints/ship0-style4-lf00153631.json'),
]);
const SKIP = [TABLES, IMAGE].every(existsSync) ? false
  : 'exact W587 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [...CHECKPOINTS,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W587 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W588_TABLE = SKIP ? null : tableBeforeW589(TABLE_JSON);
const PRIOR_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const PRIOR_ROM = SKIP ? null : new RomWindows(PRIOR_TABLE.rom);
const LIVE_TABLE_HASH = '41557fca0aa2251133792a2b4f061a340bcc2eed6fa3bad649e6d6c411cee6f7';
const W588_TABLE_HASH = '6ba6ed93f3b995ed1baf60fc757808379e548adb2919e040ac95f8d0e17081aa';
const TABLE_HASH = 'a410f3af26547bb3122e54b18d2d11c294d432a264a490ee6936865bcb43cd99';
const STORED_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

async function bundle(tables) {
  const assets = await loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
  return { ...assets, tables };
}

test('W587 pins the raw target selection, mid-entry aim, and kind-28 split arm',
  { skip: SKIP }, () => {
    assert.equal(IMG.subarray(0x242748, 0x242760).toString('hex'),
      '41f9008103e643f9008104484a2e002a67c4c1496000ffc0');
    assert.equal(IMG.subarray(0x242296, 0x2422a2).toString('hex'),
      '4ca8000c00024cae00030002');
    assert.equal(IMG.subarray(0x2832a0, 0x2832d2).toString('hex'),
      '4eb9002427486500002a4eb9002422964a79008130dc6600000a122e001b0601'
      + '00b0202e002c242e0002760078004ebae4f2');
    assert.deepEqual([
      binaryHash(IMG.subarray(0x242748, 0x242760)),
      binaryHash(IMG.subarray(0x242296, 0x2422a2)),
      binaryHash(IMG.subarray(0x2832a0, 0x2832d2)),
    ], [
      '65bc154d7208a4bcceff697e6ec7cb61729bfe6a6146b894870317b25b641df3',
      'f27a0bacea77352e88556429c58df3af9773c95d221a5d031de0eb9623201a43',
      '53a2f9d157191341c8204ae4e927ba998a47d5f7a2fb50cd5254da00db62ba1b',
    ]);
  });

test('W587 adds no ROM window; W597 live, W588, and W587 tables stay exact',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 1773);
    assert.equal(ROM_OVERLAP_PAIRS, 79);
    assert.equal(TABLE_JSON.rom.windows.length, 1773);
    assert.equal(TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0),
      658833);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual([
      W588_TABLE.rom.windows.length,
      W588_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(W588_TABLE),
    ], [856, 452817, W588_TABLE_HASH]);
    assert.deepEqual([
      PRIOR_TABLE.rom.windows.length,
      PRIOR_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(PRIOR_TABLE),
    ], [853, 452717, TABLE_HASH]);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((window) =>
      window.why.startsWith('W587:')), []);
    assert.throws(() => PRIOR_ROM.u16(0x291040),
      (error) => error?.romAddress === 0x291040);
    assert.equal(ROM.u16(0x291040), 0x8000);
  });

test('W587 exact 500-frame checkpoints restore byte-for-byte',
  { skip: SKIP_CHECKPOINT }, async () => {
    const assets = await bundle(PRIOR_TABLE);
    assert.equal(canonicalHash(assets.tables), TABLE_HASH);
    assert.deepEqual(assets.tables, PRIOR_TABLE);
    const expected = [
      [151631, 162268,
        '79b1078f95179e6a4ce3289bee1636a9479f197ac552ac3538520aeb77b9bd62',
        '31204f6c3c5028328fd9fde23f9ea01ebbeea2706a60af477f16665fa5534c28',
        '877ec10961450c63b869ce15c9aeb8d760aecc0f094454b529b46230364b61b1'],
      [152131, 162768,
        '294f240fe32fd407ab4c2fdfdc30fe0d245bcbc366e3f237b2a6d2efc8e495e8',
        '801b087b64c9ba8a743555da623de1ffd03905a61099d563572cf99173da5277',
        '568a2a21671f2bfe0dbec03efc9937479ee7af89bcee7d01801d82fe3ab3194c'],
      [152631, 163292,
        'f43b5f7e4816e58ebc9158b3a35615de1970ab172d65ec84d2c2723f8408d015',
        'b94d7d5c8d18ccf0d0f2d1f93976429d6ef04c018340e36ddb072419b3527621',
        '8054a3d6bb85ff350980f17b7cc5d147758c2389850b726bb48f73e3853af004'],
      [153131, 163792,
        '909bbc064a34c8e536ce3d215425d569b237afb1825c381749c4513d65553ec4',
        '42346bda274f702331f4cf3023a9741369d5900cd9f0391cf12d2c4e9d5650c5',
        'ff9bbe7cca79d5223b8276f676df879d8749b4774561a7ad6991a39390db8bbb'],
      [153631, 164292,
        '74e3fd892f5397d81034cc153e1014f4c3af85e61ffce82b693fd7ef19ccf742',
        '66981316f01a795ca76cbae08ce3a8a5b6876a18a4ff1251dff7a0adc75d658a',
        '9f3927701f8ce702e5a167da9d281702e8c50864be8c4c71c0a627306195764d'],
    ];
    for (let index = 0; index < CHECKPOINTS.length; index++) {
      const bytes = readFileSync(CHECKPOINTS[index]);
      const checkpoint = JSON.parse(bytes);
      const [logic, video, ramSha256, gameSha256, fileSha256] = expected[index];
      assert.deepEqual([
        checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
        checkpoint.raw.stage, checkpoint.raw.stageX2, checkpoint.raw.stageX4,
        checkpoint.raw.loop, checkpoint.ramSha256, checkpoint.gameSha256,
        checkpoint.selection.ship, checkpoint.selection.style,
        checkpoint.inputWord, checkpoint.probeOnly.invulnerable, binaryHash(bytes),
      ], [
        STORED_TABLE_HASH, logic, video, 4, 8, 16, 1, ramSha256, gameSha256,
        0, 4, 65499, true, fileSha256,
      ]);
      const adoptedCheckpoint = { ...checkpoint, tablesSha256: TABLE_HASH };
      assert.deepEqual({ ...adoptedCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
        'W623 adoption changes only the stored checkpoint table identity');
      const resumed = restoreCheckpoint(adoptedCheckpoint, assets, checkpoint.selection);
      const restored = checkpointDocument(resumed.game, assets, {
        ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
      });
      assert.deepEqual([
        resumed.game.logicFrame, resumed.game.videoFrame,
        restored.ramSha256, restored.gameSha256,
      ], [logic, video, ramSha256, gameSha256]);
    }
  });

test('W587 crosses the exact split and W588 reaches the $291836 ROM-table frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const assets = await bundle(W588_TABLE);
    const checkpoint = JSON.parse(readFileSync(CHECKPOINTS[0], 'utf8'));
    const resumed = restoreCheckpoint(
      { ...checkpoint, tablesSha256: W588_TABLE_HASH }, assets, checkpoint.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 3200; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
      if (attempted === 211) {
        const parent = BUL.pool + 19 * BUL.stride;
        const child = BUL.pool + 15 * BUL.stride;
        assert.deepEqual([
          resumed.game.logicFrame, resumed.game.videoFrame,
          resumed.game.ram.u16(parent), resumed.game.ram.u32(parent + REC.posA),
          resumed.game.ram.u8(parent + REC.dir), resumed.game.ram.u16(parent + 0x28),
          resumed.game.ram.u8(parent + 0x2a), resumed.game.ram.u32(parent + 0x2c),
        ], [151842, 162479, 0x821c, 0x6b862983, 0x23, 0x0010, 0, 0x00030016]);
        assert.deepEqual([
          resumed.game.ram.u16(child), resumed.game.ram.u32(child + REC.posA),
          resumed.game.ram.u32(child + REC.renderOffs),
          resumed.game.ram.u32(child + REC.descriptor),
          resumed.game.ram.u16(child + REC.graphic),
          resumed.game.ram.u16(child + REC.attribute),
          resumed.game.ram.u8(child + REC.speed), resumed.game.ram.u8(child + REC.dir),
          resumed.game.ram.u8(child + REC.origSpeed),
          resumed.game.ram.u8(child + REC.origDir),
          resumed.game.ram.u32(child + REC.continuation),
        ], [0x8316, 0x6b862983, 0xfe00fe00, 0, 0x0210, 0x001a,
          0x1c, 0xd3, 0x1c, 0xd3, 0x282598]);
      }
    }
    const state = checkpointDocument(resumed.game, assets, {
      ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame, error?.romAddress,
      state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
      state.ramSha256, state.gameSha256,
    ], [
      2940, 154570, 165232, 0x291836, 4, 8, 16, 1,
      '02391e349f1c93276bb26a140c3e3912d0221d893838e258aa9ae64381426427',
      '2b48ebe14151ae6b75b2a23e1a834ab81bdb4d9c10cffb66d0d94fb72abbedb2',
    ]);
    assert.equal(SLOT7.seqLists[1], 0x291816);
    assert.equal(ROM.u32(SLOT7.seqLists[1]), 0x291836,
      '$291816 list-B entry 0 is the next script at $291836');
    assert.match(error?.message ?? '', /word at \$291836 is outside every ROM window/);
  });
