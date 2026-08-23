import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOGUE } from '../src/catalogue.js';
import { classifyMetadata, summarizeReports } from '../src/diagnostics.js';
import {
  applyValidation,
  createLauncherState,
  selectPrimary,
  toggleSecondary,
} from '../src/selection.js';

function exactSummary(gameId) {
  const reports = GAME_CATALOGUE[gameId].accepted.map((identity) =>
    classifyMetadata(gameId, {
      name: identity.name, size: identity.size, sha256: identity.sha256,
    }));
  return summarizeReports(gameId, reports);
}

test('game cards start disabled and invalid or incomplete inputs do not enable them', () => {
  let state = createLauncherState();
  assert.deepEqual(state.validated, { batman: false, gradius: false, ddpdoj: false });

  const unknown = classifyMetadata('batman', {
    name: 'Batman.gb', size: 131072, sha256: '0'.repeat(64),
  });
  const incomplete = summarizeReports('batman', [unknown]);
  state = applyValidation(state, 'batman', incomplete.complete);
  assert.equal(state.validated.batman, false);
  assert.equal(selectPrimary(state, 'batman').primary, null);
});

test('an exact validated identity enables only its matching primary game', () => {
  let state = createLauncherState();
  state = applyValidation(state, 'batman', exactSummary('batman').complete);
  assert.deepEqual(state.validated, { batman: true, gradius: false, ddpdoj: false });
  state = selectPrimary(state, 'batman');
  assert.equal(state.primary, 'batman');
  assert.equal(selectPrimary(state, 'gradius').primary, 'batman');
});

test('primary and reserved secondary roles remain separate', () => {
  let state = createLauncherState();
  state = applyValidation(state, 'batman', true);
  state = applyValidation(state, 'gradius', true);
  state = selectPrimary(state, 'batman');
  state = toggleSecondary(state, 'gradius');
  assert.equal(state.primary, 'batman');
  assert.deepEqual(state.secondary, ['gradius']);
  assert.deepEqual(toggleSecondary(state, 'batman').secondary, ['gradius']);

  state = applyValidation(state, 'batman', false);
  assert.equal(state.primary, null);
  assert.deepEqual(state.secondary, ['gradius']);
});
