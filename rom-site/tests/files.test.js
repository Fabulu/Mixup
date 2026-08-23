import test from 'node:test';
import assert from 'node:assert/strict';
import { filesFromDataTransfer, normalizeFiles } from '../src/files.js';

function fakeFile(name, size = 4, lastModified = 1) {
  return { name, size, lastModified, arrayBuffer: async () => new ArrayBuffer(size) };
}

function fileEntry(name, file) {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file(success) { queueMicrotask(() => success(file)); },
  };
}

function directoryEntry(name, batches) {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let index = 0;
      return {
        readEntries(success) { queueMicrotask(() => success(batches[index++] ?? [])); },
      };
    },
  };
}

test('intake normalization deduplicates repeated enumeration but preserves different paths', () => {
  const first = fakeFile('same.rom');
  const duplicate = fakeFile('same.rom');
  const otherPath = fakeFile('same.rom');
  otherPath.mixupRelativePath = 'other/same.rom';
  const files = normalizeFiles([[first, duplicate], [first, otherPath]]);
  assert.equal(files.length, 2);
  assert.equal(files[0], first);
  assert.equal(files[1], otherPath);
});

test('drop intake falls back to flat DataTransfer files when entries are unavailable', async () => {
  const one = fakeFile('one.gb');
  const files = await filesFromDataTransfer({ files: [one, one], items: [] });
  assert.deepEqual(files, [one]);
});

test('drop intake recursively reads folders and all reader batches', async () => {
  const one = fakeFile('one.u7');
  const two = fakeFile('two.u8');
  const nested = directoryEntry('nested', [[fileEntry('two.u8', two)], []]);
  const root = directoryEntry('ddpdojblk', [[fileEntry('one.u7', one)], [nested], []]);
  const transfer = {
    items: [{ webkitGetAsEntry: () => root }],
    files: [],
  };
  const files = await filesFromDataTransfer(transfer);
  assert.deepEqual(files, [one, two]);
  assert.equal(one.mixupRelativePath, 'ddpdojblk/one.u7');
  assert.equal(two.mixupRelativePath, 'ddpdojblk/nested/two.u8');
});

test('drop recursion enforces a bounded file count', async () => {
  const root = directoryEntry('many', [[
    fileEntry('one.rom', fakeFile('one.rom')),
    fileEntry('two.rom', fakeFile('two.rom')),
  ], []]);
  await assert.rejects(() => filesFromDataTransfer({
    items: [{ webkitGetAsEntry: () => root }], files: [],
  }, { maxFiles: 1 }), /exceeds 1 files/);
});
