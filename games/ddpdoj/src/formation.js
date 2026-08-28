// Optional synchronized P1-owned ship formations.
//
// Formations are deliberately separate from the mod catalogue. An absent or
// unknown mode creates no runtime state, no Game callback, and no RAM writes.
// Companion ships are private outgoing-only actors. They never join native P2.

import {
  AUTHENTIC_SHIPS, AUTHENTIC_STYLES, forceAuthenticP1Selection,
} from './authentic.js';
import {
  THREE_PILOT_FORMATION_MODE, attachFormationCompanions,
  prepareFormationCompanionFrame,
} from './formationactors.js';

const SIDE_BY_SIDE_ID = 'fly-both-ships-side-by-side';

const DEFAULT_SELECTION = Object.freeze({ ship: 0, style: 2 });
const DEFAULT_COMPANIONS = Object.freeze([
  Object.freeze({ ship: 2, style: 2 }),
]);

export const FORMATION_MODE = Object.freeze({
  id: SIDE_BY_SIDE_ID,
  name: 'Fly Both Ships Side by Side',
  authenticSelection: DEFAULT_SELECTION,
  companions: DEFAULT_COMPANIONS,
});
export const FORMATION_THREE_MODE = THREE_PILOT_FORMATION_MODE;

/** Look up either recognized P1-owned formation. Null and unknown ids mean off. */
export function formationMode(id) {
  if (id === SIDE_BY_SIDE_ID) return FORMATION_MODE;
  if (id === FORMATION_THREE_MODE.id) return FORMATION_THREE_MODE;
  return null;
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
 * Read only P1 selector fields present in a formation launch query. Native P2
 * fields are incompatible with formation mode and are rejected as one set.
 */
export function formationAuthenticOverridesFromParams(params) {
  const has = (name) => params?.has?.(name) ?? false;
  if (['p2', 'p2ship', 'p2style'].some(has)) return null;
  if (!has('ship') && !has('style')) return null;

  const selected = {};
  if (has('ship')) {
    const text = params.get('ship');
    if (!AUTHENTIC_SHIPS.map(String).includes(text)) return null;
    selected.ship = Number(text);
  }
  if (has('style')) {
    const text = params.get('style');
    if (!AUTHENTIC_STYLES.map(String).includes(text)) return null;
    selected.style = Number(text);
  }
  return selected;
}

/** Resolve the authentic P1 selection used to launch a formation. */
export function resolveFormationAuthenticSelection(modeValue, explicitSelection = null) {
  const mode = resolveMode(modeValue);
  if (!mode) {
    if (explicitSelection == null || typeof explicitSelection !== 'object') return null;
    const ship = explicitSelection.ship ?? 0;
    const style = explicitSelection.style ?? 2;
    if (!AUTHENTIC_SHIPS.includes(ship) || !AUTHENTIC_STYLES.includes(style)
        || explicitSelection.p2 != null) return null;
    return Object.freeze({ ship, style });
  }
  if (explicitSelection != null
      && (typeof explicitSelection !== 'object' || explicitSelection.p2 != null)) {
    return null;
  }
  const ship = explicitSelection?.ship ?? mode.authenticSelection.ship;
  const style = explicitSelection?.style ?? mode.authenticSelection.style;
  if (!AUTHENTIC_SHIPS.includes(ship) || !AUTHENTIC_STYLES.includes(style)) return null;
  return Object.freeze({ ship, style });
}

/** Replay v1 has no field for the active formation or its private actors. */
export function assertFormationReplayCompatible(state, action = 'replay') {
  const mode = resolveMode(state?.mode);
  if (mode) {
    throw new Error(`${action} is unavailable while formation mode is active: `
      + `${mode.name}. Replay v1 cannot encode formation state.`);
  }
  return true;
}

/** Return mutable runtime state only for the recognized active formation. */
export function createFormationState(modeValue) {
  const mode = resolveMode(modeValue);
  if (!mode) return null;
  return { mode, foundation: null, runtime: null };
}

/** Formation no longer installs a native P2 player-position callback. */
export function formationGameOptions(state) {
  void state;
  return null;
}

/** Attach private P1-owned companions after P1 selection is applied. */
export function initializeFormation(state, game, options = {}) {
  const mode = resolveMode(state?.mode);
  if (!mode) return null;
  if (state.foundation) return state;
  state.foundation = attachFormationCompanions(game, {
    mode,
    companions: mode.companions,
    layout: mode.companions.length === 2 ? 'three' : 'two',
    ...(Object.hasOwn(options, 'inputWord') ? { inputWord: options.inputWord } : {}),
  });
  state.runtime = state.foundation.runtime;
  return state;
}

/** Apply the declared P1 roster at every credited handoff, then attach once. */
export function beginFormationCreditedRun(state, game, selection) {
  if (!resolveMode(state?.mode)) return null;
  if (!forceAuthenticP1Selection(game, selection)) return null;
  return initializeFormation(state, game);
}

/** Formation leaves the physical cabinet word byte-exact. */
export function transformFormationInput(state, word) {
  void state;
  return word & 0xffff;
}

/** Move P1 and its private companion from P1's final transformed input. */
export function prepareFormationFrame(state, game, word) {
  const input = word & 0xffff;
  if (!state?.foundation || state.foundation.game !== game) return input;
  return prepareFormationCompanionFrame(state.foundation, game, input);
}
