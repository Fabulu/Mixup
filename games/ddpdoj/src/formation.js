// Optional synchronized two-ship formations.
//
// Formations are deliberately separate from the mod catalogue. An absent or
// unknown mode creates no runtime state, no Game callback, and no RAM writes.
// Every mutable value below belongs to one createFormationState() result.

import { normalizeAuthenticSelection } from './authentic.js';
import { mirrorsFromPort } from './input.js';
import { P, RAM } from './machine.js';

const SIDE_BY_SIDE_ID = 'fly-both-ships-side-by-side';
const OFFSET_X = 0x0400;
const ANCHOR = Object.freeze({
  xMin: 0x0700,
  xMax: 0x3100,
  yMin: 0x0800,
  yMax: 0x6500,
});
const STAGE_CLEAR = 0x812972;
const MOVEMENT_DISABLE = 0x8130d2;

const DEFAULT_SELECTION = Object.freeze({
  ship: 0,
  style: 2,
  p2: Object.freeze({ ship: 2, style: 2 }),
});

export const FORMATION_MODE = Object.freeze({
  id: SIDE_BY_SIDE_ID,
  name: 'Fly Both Ships Side by Side',
  authenticSelection: DEFAULT_SELECTION,
});

/** Look up the one recognized formation. Null and unknown ids mean off. */
export function formationMode(id) {
  return id === SIDE_BY_SIDE_ID ? FORMATION_MODE : null;
}

function resolveMode(value) {
  if (typeof value === 'string') return formationMode(value);
  return formationMode(value?.id);
}

/** Exact shareable form, without the leading hash marker. */
export function formationToHash(value) {
  const mode = resolveMode(value);
  return mode ? `formation=${encodeURIComponent(mode.id)}` : '';
}

/** Resolve a formation hash. Missing and unknown values are off. */
export function hashToFormation(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  return formationMode(params.get('formation'));
}

/**
 * Resolve the authentic two-player selection used to launch a formation.
 * Explicit fields override their side of the mode's pair. Missing fields keep
 * the formation defaults, including its required P2. Off mode leaves ordinary
 * authentic selection normalization alone.
 */
export function resolveFormationAuthenticSelection(modeValue, explicitSelection = null) {
  const mode = resolveMode(modeValue);
  if (!mode || explicitSelection == null) {
    return normalizeAuthenticSelection(mode?.authenticSelection ?? explicitSelection);
  }
  if (typeof explicitSelection !== 'object'
      || (explicitSelection.p2 != null && typeof explicitSelection.p2 !== 'object')) {
    return null;
  }

  const defaults = mode.authenticSelection;
  const candidate = {
    ship: explicitSelection.ship ?? defaults.ship,
    style: explicitSelection.style ?? defaults.style,
    p2: {
      ship: explicitSelection.p2?.ship ?? defaults.p2.ship,
      style: explicitSelection.p2?.style ?? defaults.p2.style,
    },
  };
  return normalizeAuthenticSelection(candidate);
}

/** Return mutable runtime state only for the recognized active formation. */
export function createFormationState(modeValue) {
  const mode = resolveMode(modeValue);
  if (!mode) return null;
  return {
    mode,
    runtime: {
      initialized: false,
      anchorX: 0,
      anchorY: 0,
      lastP1Speed: null,
      targets: [{ y: 0, x: 0 }, { y: 0, x: 0 }],
      rebasePending: false,
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function playerRecord(playerIdx) {
  return playerIdx === 0 ? RAM.player1 : playerIdx === 1 ? RAM.player2 : null;
}

function liveNonDeathPlayer(ram, playerIdx) {
  const rec = playerRecord(playerIdx);
  if (rec == null) return false;
  const state = ram.u16(rec + P.state);
  return (state & 0x8000) !== 0 && (state & 0x0100) === 0;
}

function cacheTargets(runtime) {
  runtime.targets[0].y = runtime.anchorY;
  runtime.targets[0].x = runtime.anchorX - OFFSET_X;
  runtime.targets[1].y = runtime.anchorY;
  runtime.targets[1].x = runtime.anchorX + OFFSET_X;
}

function rebaseFromPlayer(runtime, ram, playerIdx) {
  const rec = playerRecord(playerIdx);
  const anchorX = ram.u16(rec + P.posX) + (playerIdx === 0 ? OFFSET_X : -OFFSET_X);
  runtime.anchorX = clamp(anchorX, ANCHOR.xMin, ANCHOR.xMax);
  runtime.anchorY = clamp(ram.u16(rec + P.posY), ANCHOR.yMin, ANCHOR.yMax);
  cacheTargets(runtime);
}

function cachedPositionTransform(state, ram, playerIdx) {
  const runtime = state.runtime;
  if (!runtime.initialized || runtime.rebasePending || ram.u16(STAGE_CLEAR) !== 0
      || !liveNonDeathPlayer(ram, playerIdx)) return null;
  const target = runtime.targets[playerIdx];
  return target ? { y: target.y, x: target.x } : null;
}

/** Per-Game callback options, or null when formation mode is off. */
export function formationGameOptions(state) {
  if (!state?.mode || resolveMode(state.mode) !== FORMATION_MODE) return null;
  return Object.freeze({
    playerPositionTransform: (ram, playerIdx, y, x) => {
      void y; void x;
      return cachedPositionTransform(state, ram, playerIdx);
    },
  });
}

/**
 * Seed the per-Game anchor from the existing P1 position. This does not write
 * RAM; the first active prepareFormationFrame() owns the geometry writes.
 */
export function initializeFormation(state, game) {
  if (!state?.mode || resolveMode(state.mode) !== FORMATION_MODE) return null;
  const runtime = state.runtime;
  if (runtime.initialized) return state;

  rebaseFromPlayer(runtime, game.ram, 0);
  if (liveNonDeathPlayer(game.ram, 0)) {
    runtime.lastP1Speed = game.ram.u8(RAM.player1 + P.speedIdx);
  }
  runtime.rebasePending = game.ram.u16(STAGE_CLEAR) !== 0;
  runtime.initialized = true;
  return state;
}

/**
 * Copy the leader controls to P2 in the active-low packed cabinet word. P1's
 * complete byte and both physical Start bits remain untouched. P2 Button 2 is
 * always released, leaving manual bomb and hyper ownership with P1.
 */
export function transformFormationInput(state, word) {
  const input = word & 0xffff;
  if (!state?.mode || resolveMode(state.mode) !== FORMATION_MODE) return input;

  // In each panel byte, physical bits 1..4 are directions, 5 is B1, 6 is
  // B2, and 7 is B3. Physical bit 0 is Start. The port is active-low.
  const p1 = input & 0x00ff;
  const p2Start = input & 0x0100;
  const copied = p1 & 0x00be;
  return (p1 | p2Start | 0x4000 | (copied << 8)) & 0xffff;
}

/**
 * Prepare one active frame and return the final packed input word. The caller
 * passes input after any catalogue mod transform. Geometry derives from that
 * same final word, moves the shared anchor once, and writes only live players'
 * two position words.
 */
export function prepareFormationFrame(state, game, word) {
  const input = transformFormationInput(state, word);
  if (!state?.mode || resolveMode(state.mode) !== FORMATION_MODE
      || !state.runtime.initialized) return input;

  const { ram, tables } = game;
  const runtime = state.runtime;
  if (ram.u16(STAGE_CLEAR) !== 0) {
    runtime.rebasePending = true;
    return input;
  }

  const liveP1 = liveNonDeathPlayer(ram, 0);
  const liveP2 = liveNonDeathPlayer(ram, 1);
  if (!liveP1 && !liveP2) return input;

  if (runtime.rebasePending) {
    rebaseFromPlayer(runtime, ram, liveP1 ? 0 : 1);
    runtime.rebasePending = false;
  }

  if (liveP1) runtime.lastP1Speed = ram.u8(RAM.player1 + P.speedIdx);

  let dy = 0;
  let dx = 0;
  const angle = tables.angleFor(mirrorsFromPort(input).p1 & 0x0f);
  if (ram.u16(MOVEMENT_DISABLE) === 0 && (angle & 0x80) === 0
      && runtime.lastP1Speed != null) {
    const vector = tables.vector(runtime.lastP1Speed, angle);
    dy = vector.dy;
    dx = vector.dx;
  }

  runtime.anchorX = clamp(runtime.anchorX + dx, ANCHOR.xMin, ANCHOR.xMax);
  runtime.anchorY = clamp(runtime.anchorY + dy, ANCHOR.yMin, ANCHOR.yMax);
  cacheTargets(runtime);

  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    if (!liveNonDeathPlayer(ram, playerIdx)) continue;
    const rec = playerRecord(playerIdx);
    const target = runtime.targets[playerIdx];
    ram.setU16(rec + P.posY, target.y);
    ram.setU16(rec + P.posX, target.x);
  }
  return input;
}
