import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCHIVE_LIMITS,
  archiveKind,
  magicArchiveKind,
  normalizeArchivePath,
  parseSevenZipListing,
  rejectNestedArchive,
  validateArchiveEntries,
  validateArchiveSelection,
} from '../src/archive-policy.js';

const zipMagic = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
const sevenMagic = Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const entry = (overrides = {}) => ({
  path: 'set/member.rom',
  type: 'file',
  size: 1024,
  encrypted: false,
  method: 'Deflate',
  dictionaryBytes: null,
  ...overrides,
});

function rejects(message, fn) {
  assert.throws(fn, (error) => {
    assert.match(error.message, message);
    return true;
  });
}

test('archive signatures and extensions must agree exactly', () => {
  assert.equal(magicArchiveKind(zipMagic), 'zip');
  assert.equal(magicArchiveKind(sevenMagic), '7z');
  assert.equal(archiveKind('owned.ZIP', zipMagic), 'zip');
  assert.equal(archiveKind('owned.7z', sevenMagic), '7z');
  assert.equal(archiveKind('member.rom', Uint8Array.of(1, 2, 3)), null);
  rejects(/does not match/, () => archiveKind('owned.zip', sevenMagic));
  rejects(/matching .zip or .7z/, () => archiveKind('disguised.bin', zipMagic));
  rejects(/RAR archives/, () => archiveKind('owned.rar', Uint8Array.of(1, 2, 3)));
  rejects(/split or spanned/, () =>
    archiveKind('split.zip', Uint8Array.from([0x50, 0x4b, 0x07, 0x08])));
});

test('archive paths normalize separators and reject traversal or ambiguous names', () => {
  assert.equal(normalizeArchivePath('set\\member.rom'), 'set/member.rom');
  assert.equal(normalizeArchivePath('set/folder/', { directory: true }), 'set/folder');
  for (const value of [
    '../member.rom', '/member.rom', '\\server\\member.rom', 'C:\\member.rom',
    'set//member.rom', 'set/./member.rom', 'set/member.rom.', 'set/NUL.bin',
    `set/bad${String.fromCodePoint(0x202e)}name.rom`,
  ]) rejects(/Unsafe archive path/, () => normalizeArchivePath(value));
  rejects(/too long/, () => normalizeArchivePath(`set/${'a'.repeat(238)}`));
  rejects(/Unsafe archive path/, () => normalizeArchivePath('a/b/c/d/e.rom'));
});

test('7-Zip technical listings parse ZIP and solid 7z metadata strictly', () => {
  assert.deepEqual(parseSevenZipListing([
    'Path = set/member.rom', 'Folder = -', 'Size = 4', 'Packed Size = 6',
    'Encrypted = -', 'Method = Deflate', 'Volume Index = 0', '',
  ], 'zip'), [{
    path: 'set/member.rom', type: 'file', size: 4,
    encrypted: false, method: 'Deflate', dictionaryBytes: null,
  }]);
  assert.deepEqual(parseSevenZipListing([
    'Path = member.rom', 'Size = 8388608', 'Packed Size = ',
    'Encrypted = -', 'Method = LZMA:24:lc4', 'Block = 0', '',
  ], '7z'), [{
    path: 'member.rom', type: 'file', size: 8388608,
    encrypted: false, method: 'LZMA:24:lc4', dictionaryBytes: 16 * 1024 * 1024,
  }]);
  rejects(/malformed line/, () => parseSevenZipListing([
    'Path = safe.rom', 'injected newline', 'Size = 4', '',
  ], 'zip'));
  rejects(/repeats field/, () => parseSevenZipListing([
    'Path = safe.rom', 'Size = 4', 'Size = 5', '',
  ], 'zip'));
  rejects(/archive links/, () => parseSevenZipListing([
    'Path = safe.rom', 'Size = 4', 'Symbolic Link = target', '',
  ], 'zip'));
});

test('valid ZIP and 7z listings pass strict metadata limits', () => {
  const zip = validateArchiveEntries('zip', [
    { path: 'set/', type: 'directory' },
    entry(),
    entry({ path: 'set/other.rom', size: 2048, method: 'Store' }),
  ], 512);
  assert.deepEqual(zip, {
    files: [entry(), entry({ path: 'set/other.rom', size: 2048, method: 'Store' })],
    expandedBytes: 3072,
    entries: 3,
  });

  const seven = validateArchiveEntries('7z', [entry({
    path: 'member.rom', method: 'LZMA2:24', dictionaryBytes: 16 * 1024 * 1024,
  })], 512);
  assert.equal(seven.expandedBytes, 1024);
});

test('entry policy rejects unsafe types, methods, sizes, encryption, and duplicates', () => {
  const cases = [
    [/unsupported entry type/, [entry({ type: 'symlink' })]],
    [/expanded size/, [entry({ size: 0 })]],
    [/expanded size/, [entry({ size: ARCHIVE_LIMITS.maxMemberSize + 1 })]],
    [/is encrypted/, [entry({ encrypted: true })]],
    [/unsupported zip method/, [entry({ method: 'BZip2' })]],
    [/duplicate path/, [entry(), entry()]],
    [/duplicate basename/, [entry(), entry({ path: 'other/member.rom' })]],
    [/dictionary exceeds/, [entry({ method: 'LZMA2:27', dictionaryBytes: 128 * 1024 * 1024 })]],
  ];
  for (const [message, entries] of cases) {
    const kind = entries[0]?.method?.startsWith('LZMA') ? '7z' : 'zip';
    rejects(message, () => validateArchiveEntries(kind, entries, 1024));
  }
});

test('archive and selection aggregate limits fail closed', () => {
  rejects(/entry count/, () => validateArchiveEntries('zip',
    Array.from({ length: ARCHIVE_LIMITS.maxEntriesPerArchive + 1 }, (_, index) =>
      entry({ path: `member-${index}.rom` })), 1024));
  rejects(/expansion ratio/, () => validateArchiveEntries('zip',
    [entry({ size: 201 })], 1));
  rejects(new RegExp(`at most ${ARCHIVE_LIMITS.maxArchives} archives`), () =>
    validateArchiveSelection(Array.from({ length: ARCHIVE_LIMITS.maxArchives + 1 }, () => ({
      compressedBytes: 1, expandedBytes: 1, entries: 1,
    }))));
  rejects(/compressed bytes/, () => validateArchiveSelection([{
    compressedBytes: ARCHIVE_LIMITS.maxCompressedTotal + 1,
    expandedBytes: 1,
    entries: 1,
  }]));
  rejects(/total entries/, () => validateArchiveSelection([{
    compressedBytes: 1,
    expandedBytes: 1,
    entries: ARCHIVE_LIMITS.maxEntriesTotal + 1,
  }]));
});

test('nested archives are rejected by name or magic', () => {
  rejects(/nested archives/, () => rejectNestedArchive('nested.zip', Uint8Array.of(1)));
  rejects(/nested archives/, () => rejectNestedArchive('nested.bin', sevenMagic));
  assert.doesNotThrow(() => rejectNestedArchive('member.rom', Uint8Array.of(1, 2, 3)));
});
