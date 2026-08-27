import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAuthenticSelection } from '../src/authentic.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P } from '../src/machine.js';
import { Game } from '../src/main.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { CONTROLS } from '../src/web/input.js';
import {
  captureGameState,
  checkpointDocument,
  restoreCheckpoint,
} from '../tools/progression-checkpoint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const HAVE = existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz'));
const SKIP = HAVE ? false : 'exact local bundle absent; this is a skip, not a pass';

async function bundle() {
  return loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
}

function fresh(exact, selection) {
  const game = new Game(exact.seed, exact.tables, {
    logicFrame: exact.cap.frames[0].lf,
    videoFrame: exact.cap.frames[0].vf,
    bgSeed: exact.cap.part(0, 'bg'),
  });
  applyAuthenticSelection(game, selection);
  return game;
}

const INPUT = portWordFromBits([CONTROLS.DOWN, CONTROLS.SHOT]);

function stepProbe(game, count) {
  for (let i = 0; i < count; i++) {
    game.ram.setU8(RAM.player1 + P.invuln, 0xff);
    game.step(INPUT);
  }
}

test('W532 exact checkpoint restore matches uninterrupted progression',
  { skip: SKIP }, async () => {
  const exact = await bundle();
  const selection = { ship: 2, style: 6 };
  const uninterrupted = fresh(exact, selection);
  stepProbe(uninterrupted, 4);

  const serialized = JSON.parse(JSON.stringify(checkpointDocument(uninterrupted, exact, {
    ...selection, inputWord: INPUT, invulnerable: true,
  })));
  assert.equal(serialized.frame.logic, exact.cap.frames[0].lf + 4);
  assert.deepEqual(serialized.selection, selection);
  assert.equal(serialized.inputWord, INPUT);
  assert.deepEqual(serialized.probeOnly, { invulnerable: true });
  assert.match(serialized.ramSha256, /^[0-9a-f]{64}$/);
  assert.match(serialized.gameSha256, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(serialized.game.props, 'slotTable'), false,
    '$907000 is reconstructed board scratch and must not perturb historical Game-state hashes');
  assert.equal(serialized.raw.stage, uninterrupted.ram.u16(0x813092));
  assert.equal(serialized.raw.loop, uninterrupted.ram.u16(0x813098));

  const corrupt = structuredClone(serialized);
  corrupt.ram = (corrupt.ram[0] === 'A' ? 'B' : 'A') + corrupt.ram.slice(1);
  assert.throws(() => restoreCheckpoint(corrupt, exact, selection),
    /RAM payload failed its integrity hash/);

  const { game: restored, probe } = restoreCheckpoint(serialized, exact, selection);
  assert.deepEqual(probe, { ...selection, inputWord: INPUT, invulnerable: true });

  stepProbe(uninterrupted, 5);
  stepProbe(restored, 5);
  assert.deepEqual(restored.ram.b, uninterrupted.ram.b);
  assert.deepEqual(captureGameState(restored), captureGameState(uninterrupted));
});
