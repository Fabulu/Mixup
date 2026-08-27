// Shared fresh-bundle Black Label round-2 route witness harness.

import { applyAuthenticSelection } from '../src/authentic.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P } from '../src/machine.js';
import { Game } from '../src/main.js';
import { CONTROLS } from '../src/web/input.js';
import { checkpointDocument } from '../tools/progression-checkpoint.mjs';
import { round2Input } from '../tools/progression-probe.mjs';

export const ROUND2_RAW = Object.freeze({
  stage: 0x813092,
  stageX2: 0x813094,
  stageX4: 0x813096,
  loop: 0x813098,
});
export const ROUND2_IDENTITY_COLUMNS = Object.freeze([
  'stepped', 'logicFrame', 'videoFrame', 'rawStage', 'rawStageX2',
  'rawStageX4', 'rawLoop', 'inputWord', 'ramSha256', 'gameSha256',
]);
export const ROUND2_INPUT_STATE_MACHINE = 'tools/progression-probe.mjs round2Input';
export const ROUND2_START_INPUT = portWordFromBits([
  CONTROLS.DOWN, CONTROLS.SHOT,
]);

export function round2RawPosition(game) {
  return {
    stage: game.ram.u16(ROUND2_RAW.stage),
    stageX2: game.ram.u16(ROUND2_RAW.stageX2),
    stageX4: game.ram.u16(ROUND2_RAW.stageX4),
    loop: game.ram.u16(ROUND2_RAW.loop),
  };
}

export function round2RouteIdentity(game, bundle, pair, inputWord, stepped) {
  const state = checkpointDocument(game, bundle, {
    ...pair,
    inputWord,
    invulnerable: true,
  });
  return [
    stepped, state.frame.logic, state.frame.video,
    state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
    state.inputWord, state.ramSha256, state.gameSha256,
  ];
}

function sameFrontier(left, right) {
  return left.stage === right.stage && left.loop === right.loop;
}

function isTerminalReset(raw) {
  return raw.stage === 0 && raw.stageX2 === 0 && raw.stageX4 === 0 && raw.loop === 0;
}

export function runColdRound2Route(bundle, pair, {
  cadence = 500,
  maxSteps = 200000,
} = {}) {
  if (!Number.isInteger(cadence) || cadence <= 0) {
    throw new RangeError('route witness cadence must be a positive integer');
  }
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
    throw new RangeError('route witness maxSteps must be a positive integer');
  }

  const game = new Game(bundle.seed, bundle.tables, {
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  const selection = applyAuthenticSelection(game, pair);
  if (selection == null) {
    throw new RangeError(`ship-${pair.ship}/style-${pair.style} is not an authentic selection`);
  }

  let inputWord = ROUND2_START_INPUT;
  let previousRaw = round2RawPosition(game);
  let enteredLoop2 = false;
  const start = round2RouteIdentity(game, bundle, pair, inputWord, 0);
  const periodic = [];
  const frontiers = [];
  const inputFrontiers = [[0, game.logicFrame, inputWord]];

  for (let stepped = 1; stepped <= maxSteps; stepped++) {
    game.ram.setU8(RAM.player1 + P.invuln, 0xff);
    const nextInput = round2Input(game, inputWord);
    if (nextInput !== inputWord) {
      inputFrontiers.push([stepped, game.logicFrame, nextInput]);
    }
    inputWord = nextInput;
    game.step(inputWord);

    const raw = round2RawPosition(game);
    if (!sameFrontier(raw, previousRaw)) {
      frontiers.push([
        stepped, game.logicFrame, game.videoFrame,
        raw.stage, raw.stageX2, raw.stageX4, raw.loop,
      ]);
      previousRaw = raw;
    }
    if (stepped % cadence === 0) {
      periodic.push(round2RouteIdentity(game, bundle, pair, inputWord, stepped));
    }
    if (raw.loop === 1) enteredLoop2 = true;
    if (enteredLoop2 && isTerminalReset(raw)) {
      return {
        selection,
        successfulSteps: stepped,
        start,
        inputFrontiers,
        frontiers,
        periodic,
        terminal: round2RouteIdentity(game, bundle, pair, inputWord, stepped),
      };
    }
  }

  throw new Error(
    `ship-${pair.ship}/style-${pair.style} did not reach its loop-2 terminal reset within ${maxSteps} steps`,
  );
}
