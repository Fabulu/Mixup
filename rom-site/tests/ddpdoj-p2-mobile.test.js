import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { p2CanJoin } from '../src/ddpdoj-local-state.js';

test('P2 mobile ownership accepts only an exact authentic join boolean', () => {
  assert.equal(p2CanJoin(true), true);
  for (const value of [false, 1, 'true', {}, [], null, undefined]) {
    assert.equal(p2CanJoin(value), false, `${JSON.stringify(value)} cannot authorize P2`);
  }
  assert.equal(p2CanJoin(true, { mode: 'formation' }), false,
    'formation companions remain owned by P1');
});

test('the local shell applies strict P2 authorization and revokes stale ownership', async () => {
  const source = await readFile(new URL('../src/local-shell.js', import.meta.url), 'utf8');
  assert.match(source,
    /import \{ p2CanJoin \} from '\.\/ddpdoj-local-state\.js';/);
  assert.match(source,
    /this\.p2Joined = p2CanJoin\(joined, formation\);/);
  assert.match(source,
    /const p2Joined = p2CanJoin\(this\.p2Joined, formation\);/);
  assert.match(source,
    /if \(!this\.p2Joined && DdpInput\.currentTouchOwner\(\) === 'P2'\) \{\s*this\.applyPadOwner\('P1'\);\s*return;\s*\}/);
  assert.match(source,
    /if \(owner === 'P2' && !p2Joined\) return false;/);
  assert.match(source,
    /DdpInput\.selectTouchOwner\(owner, \{ p2Joined \}\)/);
});
