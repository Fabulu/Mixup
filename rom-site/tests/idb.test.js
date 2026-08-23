import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forgetDirectoryHandle,
  loadDirectoryHandle,
  queryDirectoryPermission,
  requestDirectoryPermission,
  reusableDirectory,
  saveDirectoryHandle,
} from '../src/idb.js';

test('unsupported IndexedDB falls back without storing bytes or handles', async () => {
  const unavailable = async () => null;
  assert.equal(await loadDirectoryHandle(unavailable), null);
  assert.equal(await saveDirectoryHandle({ kind: 'directory' }, unavailable), false);
  assert.equal(await forgetDirectoryHandle(unavailable), false);
  assert.deepEqual(await reusableDirectory(unavailable), { handle: null, permission: 'missing' });
});

test('startup permission check queries but does not request', async () => {
  const calls = [];
  const handle = {
    queryPermission: async (options) => { calls.push(['query', options]); return 'prompt'; },
    requestPermission: async (options) => { calls.push(['request', options]); return 'granted'; },
  };
  assert.equal(await queryDirectoryPermission(handle), 'prompt');
  assert.deepEqual(calls, [['query', { mode: 'read' }]]);

  assert.equal(await requestDirectoryPermission(handle), 'granted');
  assert.deepEqual(calls, [
    ['query', { mode: 'read' }],
    ['request', { mode: 'read' }],
  ]);
});

test('permission APIs fail gracefully when unsupported', async () => {
  assert.equal(await queryDirectoryPermission({}), 'unsupported');
  assert.equal(await requestDirectoryPermission({}), 'unsupported');
});

test('saving rejects non-directory handles', async () => {
  await assert.rejects(() => saveDirectoryHandle({ kind: 'file' }, async () => null),
    /directory handle/);
});
