import { GAME_IDS } from './catalogue.js';

function knownGame(gameId) {
  if (!GAME_IDS.includes(gameId)) throw new RangeError(`Unknown game id ${gameId}`);
}

export function createLauncherState() {
  return {
    validated: Object.fromEntries(GAME_IDS.map((gameId) => [gameId, false])),
    primary: null,
    secondary: [],
  };
}

export function applyValidation(state, gameId, complete) {
  knownGame(gameId);
  const validated = { ...state.validated, [gameId]: complete === true };
  return {
    validated,
    primary: validated[state.primary] ? state.primary : null,
    secondary: state.secondary.filter((id) => validated[id]),
  };
}

export function selectPrimary(state, gameId) {
  knownGame(gameId);
  if (!state.validated[gameId]) return state;
  return { ...state, primary: gameId };
}

export function toggleSecondary(state, gameId) {
  knownGame(gameId);
  if (!state.validated[gameId] || state.primary === gameId) return state;
  const present = state.secondary.includes(gameId);
  return {
    ...state,
    secondary: present
      ? state.secondary.filter((id) => id !== gameId)
      : [...state.secondary, gameId],
  };
}
