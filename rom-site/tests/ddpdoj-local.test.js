import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticP2Joined, latchAuthenticP2Joined,
} from '../src/ddpdoj-local-state.js';

test('local touch ownership opens only for the cartridge two-player count', () => {
  assert.equal(authenticP2Joined(0xffff), false,
    'no active player is not an authentic P2 join');
  assert.equal(authenticP2Joined(0), false,
    'one-player play keeps the touch panel on P1');
  assert.equal(authenticP2Joined(1), true,
    'the cartridge two-player count enables authentic P2 touch ownership');
});

test('formation companions never count as authentic P2', () => {
  assert.equal(authenticP2Joined(1, { mode: 'formation' }), false,
    'a private P1-owned formation cannot unlock the P2 touch panel');
});

test('an authentic P2 join stays latched for the runtime', () => {
  assert.equal(latchAuthenticP2Joined(false, 1), true,
    'the cartridge two-player state opens P2 ownership');
  assert.equal(latchAuthenticP2Joined(true, 0), true,
    'P2 death or continue does not revoke an established join');
  assert.equal(latchAuthenticP2Joined(false, 1, { mode: 'formation' }), false,
    'formation state never creates an authentic P2 join');
});
