import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dataTransferIncludesDirectory, filesFromDataTransfer, normalizeFiles, searchRomCandidates,
} from '../src/files.js';

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

test('folder ROM search keeps only exact raw sizes and bounded supported archives', () => {
  const renamedRom = fakeFile('whatever.data', 8388608);
  const nvram = fakeFile('renamed.bin', 131072);
  const zip = fakeFile('custom.ZIP', 1024);
  const sevenZip = fakeFile('set.7z', 2048);
  const save = fakeFile('SLPM-65378 (AEDB8BB2).00.p2s', 20000000);
  const movie = fakeFile('movie.mkv', 500000000);
  const oversizedArchive = fakeFile('backup.zip', 70000000);
  const rar = fakeFile('unrelated.rar', 1024);
  const result = searchRomCandidates([
    save, movie, oversizedArchive, rar, renamedRom, nvram, zip, sevenZip,
  ], {
    rawSizes: new Set([131072, 8388608]),
    maxArchiveBytes: 64 * 1024 * 1024,
  });
  assert.deepEqual(result.files, [renamedRom, nvram, zip, sevenZip]);
  assert.equal(result.ignored, 4);
  assert.equal(result.ignoredBytes, 590001024);
});

test('folder ROM search reads no candidate or unrelated file bytes', () => {
  let reads = 0;
  const files = [
    { ...fakeFile('renamed.rom', 4194304), arrayBuffer: async () => { reads++; } },
    { ...fakeFile('huge.iso', 4000000000), arrayBuffer: async () => { reads++; } },
  ];
  const result = searchRomCandidates(files, {
    rawSizes: [4194304], maxArchiveBytes: 64 * 1024 * 1024,
  });
  assert.deepEqual(result.files, [files[0]]);
  assert.equal(reads, 0);
});

test('drop intake distinguishes explicit files from folders', () => {
  const file = fileEntry('one.rom', fakeFile('one.rom'));
  const folder = directoryEntry('roms', [[]]);
  assert.equal(dataTransferIncludesDirectory({
    items: [{ webkitGetAsEntry: () => file }],
  }), false);
  assert.equal(dataTransferIncludesDirectory({
    items: [{ webkitGetAsEntry: () => file }, { webkitGetAsEntry: () => folder }],
  }), true);
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
