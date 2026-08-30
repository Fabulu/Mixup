// W595: complete fresh Black Label ship-0/style-2 two-loop route.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAuthenticSelection } from '../src/authentic.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P } from '../src/machine.js';
import { Game } from '../src/main.js';
import { RomWindows } from '../src/rom.js';
import { loadBundle } from '../src/web/assets.js';
import { CONTROLS } from '../src/web/input.js';
import {
  CHECKPOINT_SCHEMA, checkpointDocument,
} from '../tools/progression-checkpoint.mjs';
import { round2Input } from '../tools/progression-probe.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_BYTES, ROM_WINDOW_COUNT,
  overlappingPairs, tableBeforeW595, tableBeforeW596,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const ASSETS = here('../assets');
const WITNESS = here('./w595ship0style2route.hashes.json');
const required = [
  TABLES, path.join(ASSETS, 'manifest.json'), path.join(ASSETS, 'seed.bin.gz'),
  path.join(ASSETS, 'player.tables.json.gz'),
];
const SKIP = required.every(existsSync) ? false
  : 'exact W595 tables or web bundle absent. This is a skip, not a pass.';
const TABLE_JSON = existsSync(TABLES)
  ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const EXPECTED = JSON.parse(readFileSync(WITNESS, 'utf8'));

const PAIR = Object.freeze({ ship: 0, style: 2 });
const RAW = Object.freeze({
  stage: 0x813092, stageX2: 0x813094, stageX4: 0x813096, loop: 0x813098,
});
const word = (...names) => portWordFromBits(names.map((name) => CONTROLS[name]));
const DOWN_SHOT = word('DOWN', 'SHOT');
const TOTAL_STEPS = 173697;
const CADENCE = 500;
const CURRENT_TABLE_HASH = '1654f079b80372640f000e11aaa32f7e4ec24bb546a6d683623c7e82ef755944';
const W595_TABLE_HASH = '706201adef09d00737f1fafc687e52d12ab81f437bc842690af229afab258445';
const PRE_W595_TABLE_HASH = '83ffbc84cbaec6b527bf784e1e3b3ba8c9b893546252a135ca5db34a7c64a23d';
const SEED_HASH = '6886bc97b999e3dc0263b8e2d2cdf1df701be09b3039d9de46cdfbe870f9c0fb';
const TERMINAL_RAM_HASH = '25d2d190c871e63eb276bcebc02cbdc88437ffd83f8f61adb9f88f343192cc9c';
const TERMINAL_GAME_HASH = 'ca0f82de27b5cbf08a04631e50b6292782d72d527daa5a6d024baf0e8e4a16e5';

const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const byteHash = (value) => createHash('sha256').update(value).digest('hex');

function windowShape(tables) {
  return tables.rom.windows.map((window) => [
    parseInt(String(window.base).replace('$', ''), 16), window.len,
  ]);
}

function rawPosition(game) {
  return {
    stage: game.ram.u16(RAW.stage),
    stageX2: game.ram.u16(RAW.stageX2),
    stageX4: game.ram.u16(RAW.stageX4),
    loop: game.ram.u16(RAW.loop),
  };
}

function identity(game, bundle, inputWord, stepped) {
  const state = checkpointDocument(game, bundle, {
    ...PAIR, inputWord, invulnerable: true,
  });
  return [
    stepped, state.frame.logic, state.frame.video,
    state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
    state.inputWord, state.ramSha256, state.gameSha256,
  ];
}

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W595 is one exact BIOS-window widening and reconstructs the $000BEC fault',
  { skip: SKIP }, () => {
    const w595 = tableBeforeW596(TABLE_JSON);
    const before = tableBeforeW595(TABLE_JSON);
    assert.deepEqual([
      canonicalHash(TABLE_JSON), TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(TABLE_JSON)),
    ], [CURRENT_TABLE_HASH, ROM_WINDOW_COUNT, ROM_WINDOW_BYTES, ROM_OVERLAP_PAIRS]);
    assert.deepEqual([
      canonicalHash(w595), w595.rom.windows.length,
      w595.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(w595)),
    ], [W595_TABLE_HASH, 907, 453765, 77]);
    assert.deepEqual([
      canonicalHash(before), before.rom.windows.length,
      before.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(before)),
    ], [PRE_W595_TABLE_HASH, 907, 453749, 77]);
    assert.deepEqual(EXPECTED.tables, {
      sha256: CURRENT_TABLE_HASH, windows: 949, bytes: 457509, overlapPairs: 77,
    });
    assert.deepEqual(EXPECTED.preW595Tables, {
      sha256: PRE_W595_TABLE_HASH, windows: 907, bytes: 453749,
      overlapPairs: 77, faultAddress: 0x000bec,
    });

    const liveWindow = w595.rom.windows.filter(({ base }) => base === '$000BE0');
    const oldWindow = before.rom.windows.filter(({ base }) => base === '$000BF0');
    assert.deepEqual(liveWindow.map(({ len, why }) => [len, why]), [[0x24,
      "W595 type-$9C offscreen family-$11 satellite's nine 24-bit-wrapped "
        + 'BIOS animation longwords']]);
    assert.deepEqual(oldWindow.map(({ len, why }) => [len, why]), [[0x14,
      "W534 type-$9C offscreen satellite's five 24-bit-wrapped BIOS animation longwords"]]);
    assert.deepEqual(
      w595.rom.windows.filter(({ base }) => base !== '$000BE0'),
      before.rom.windows.filter(({ base }) => base !== '$000BF0'),
      'W595 changes no other cartridge window');

    const currentRom = new RomWindows(w595.rom);
    const oldRom = new RomWindows(before.rom);
    const addresses = [0x0c00, 0x0bfc, 0x0bf8, 0x0bf4, 0x0bf0,
      0x0bec, 0x0be8, 0x0be4, 0x0be0];
    for (const address of addresses.slice(0, 5)) {
      assert.equal(oldRom.u32(address), currentRom.u32(address));
    }
    assert.throws(() => oldRom.u32(0x000bec),
      /longword at \$BEC is outside every ROM window/,
      'the exact pre-W595 table reproduces the production fault');
    for (const address of addresses) assert.doesNotThrow(() => currentRom.u32(address));
  });

test('W595 fresh ship-0/style-2 route pins both loops through terminal reset',
  { skip: SKIP }, async () => {
    assert.deepEqual(EXPECTED.identityColumns, [
      'stepped', 'logicFrame', 'videoFrame', 'rawStage', 'rawStageX2',
      'rawStageX4', 'rawLoop', 'inputWord', 'ramSha256', 'gameSha256',
    ]);
    assert.equal(EXPECTED.schema, 'ddpdoj.w595-route-hashes.v1');
    assert.equal(EXPECTED.checkpointSchema, CHECKPOINT_SCHEMA);
    assert.deepEqual(EXPECTED.selection, PAIR);
    assert.deepEqual(EXPECTED.probe, {
      invulnerable: true,
      inputStateMachine: 'tools/progression-probe.mjs round2Input',
      cadence: CADENCE,
      startInputWord: DOWN_SHOT,
    });
    assert.deepEqual(EXPECTED.seed, { bytes: 131072, sha256: SEED_HASH });
    assert.equal(EXPECTED.periodic.length, 347,
      '173500 / 500 gives all 347 successful cadence identities');
    assert.equal(EXPECTED.periodic.at(-1)[0], 173500);
    assert.notEqual(TOTAL_STEPS % CADENCE, 0, 'terminal is a distinct non-cadence identity');

    const exact = await bundle();
    assert.deepEqual(exact.tables, TABLE_JSON,
      'the regenerated web bundle carries the exact W630 production table');
    assert.deepEqual([
      exact.seed.byteLength, byteHash(exact.seed), canonicalHash(exact.tables),
    ], [131072, SEED_HASH, CURRENT_TABLE_HASH]);

    const game = new Game(exact.seed, exact.tables, {
      logicFrame: exact.cap.frames[0].lf,
      videoFrame: exact.cap.frames[0].vf,
      bgSeed: exact.cap.part(0, 'bg'),
    });
    applyAuthenticSelection(game, PAIR);
    let inputWord = DOWN_SHOT;
    assert.deepEqual(identity(game, exact, inputWord, 0), EXPECTED.start,
      'the route starts fresh at the exact LF2000 bundle identity');
    assert.deepEqual([game.logicFrame, game.videoFrame, ...Object.values(rawPosition(game))],
      [2000, 2036, 0, 0, 0, 0]);

    const periodic = [];
    const frontiers = [];
    const inputFrontiers = [[0, game.logicFrame, inputWord]];
    let previousRaw = rawPosition(game);
    for (let stepped = 1; stepped <= TOTAL_STEPS; stepped++) {
      game.ram.setU8(RAM.player1 + P.invuln, 0xff);
      const nextInput = round2Input(game, inputWord);
      if (nextInput !== inputWord) {
        inputFrontiers.push([stepped, game.logicFrame, nextInput]);
      }
      inputWord = nextInput;
      game.step(inputWord);

      const now = rawPosition(game);
      if (now.stage !== previousRaw.stage || now.loop !== previousRaw.loop) {
        frontiers.push([
          stepped, game.logicFrame, game.videoFrame,
          now.stage, now.stageX2, now.stageX4, now.loop,
        ]);
        previousRaw = now;
      }
      if (stepped % CADENCE === 0) {
        periodic.push(identity(game, exact, inputWord, stepped));
      }
    }

    assert.deepEqual(inputFrontiers, EXPECTED.inputFrontiers,
      'the shared real menu-input state machine has every exact edge');
    assert.deepEqual(frontiers, EXPECTED.frontiers,
      'all stage and loop frontiers have exact stepped/LF/VF/raw identities');
    assert.deepEqual(frontiers[4], [80219, 82219, 86696, 4, 8, 16, 1],
      'round 2 begins at LF82219');
    assert.deepEqual(periodic, EXPECTED.periodic,
      'all 347 checkpointDocument hash identities match at 500 successful-step cadence');

    const terminal = identity(game, exact, inputWord, TOTAL_STEPS);
    assert.deepEqual(terminal, EXPECTED.terminal,
      'the terminal non-cadence checkpointDocument identity is exact');
    assert.deepEqual(terminal, [
      173697, 175697, 187099, 0, 0, 0, 0, DOWN_SHOT,
      TERMINAL_RAM_HASH, TERMINAL_GAME_HASH,
    ]);
    assert.deepEqual(frontiers.at(-1), [173697, 175697, 187099, 0, 0, 0, 0],
      'terminal reset occurs first on stepped frame 173697');
  });
