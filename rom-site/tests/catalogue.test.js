import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOGUE } from '../src/catalogue.js';
import { classifyMetadata, formatDiagnostic, summarizeReports } from '../src/diagnostics.js';

const metadata = (identity, name = identity.name) => ({
  name: name ?? 'local-maincpu.bin', size: identity.size, sha256: identity.sha256,
});

test('catalogue records exact complete identities and regions', () => {
  const { batman, gradius, ddpdoj } = GAME_CATALOGUE;
  assert.equal(batman.region, 'USA, Europe');
  assert.equal(batman.accepted[0].size, 131072);
  assert.equal(batman.accepted[0].sha256, '152fc252bba7130e786d408eed310b3009b8e05834f8003dfbf514ec804cbaea');
  assert.equal(gradius.region, 'USA');
  assert.equal(gradius.accepted[0].size, 65552);
  assert.equal(ddpdoj.region, 'Japan');
  assert.equal(ddpdoj.set, 'ddpdojblk');
  assert.equal(ddpdoj.accepted.length, 10);
  assert.equal(ddpdoj.alternateForms.length, 1);
  assert.ok(ddpdoj.knownAlternates.length >= 10);
  assert.deepEqual(new Set(ddpdoj.knownAlternates.map((identity) => identity.set)),
    new Set(['ddp3', 'ddpdoj', 'ddpdoja', 'ddpdojb', 'ddpdojp', 'ddpdojblka',
      'ddpdojblkb', 'ddpdojblka or ddpdojblkb', 'ddpdojblkbl']));
  for (const identity of ddpdoj.knownAlternates) {
    assert.match(identity.sha1, /^[0-9a-f]{40}$/);
    assert.match(identity.crc32, /^[0-9a-f]{8}$/);
  }
  for (const game of Object.values(GAME_CATALOGUE)) {
    for (const identity of [...game.accepted, ...(game.alternateForms ?? [])]) {
      assert.match(identity.sha256, /^[0-9a-f]{64}$/);
      assert.ok(Number.isSafeInteger(identity.size) && identity.size > 0);
      assert.ok(identity.inputForm);
    }
  }
});

test('exact content remains accepted after a rename', () => {
  const identity = GAME_CATALOGUE.batman.accepted[0];
  const report = classifyMetadata('batman', metadata(identity, 'my-cart.gb'));
  assert.equal(report.status, 'accepted-renamed');
  assert.deepEqual(report.satisfiesNames, [identity.name]);
  assert.equal(report.expected.sha256, identity.sha256);
});

test('known archive, wrong bytes, and unknown digest stay evidence-bounded', () => {
  const archive = classifyMetadata('ddpdoj', {
    name: 'ddpdojblk.zip', size: 123, sha256: '0'.repeat(64),
  });
  assert.equal(archive.status, 'unsupported-archive');
  assert.match(archive.correctiveAction, /valid, unencrypted ZIP or 7z/);

  const expected = GAME_CATALOGUE.ddpdoj.accepted.find((entry) => entry.name === 'ddp3blk_defaults.nv');
  const wrong = classifyMetadata('ddpdoj', {
    name: expected.name, size: expected.size, sha256: '1'.repeat(64),
  });
  assert.equal(wrong.status, 'expected-name-wrong-bytes');
  assert.match(wrong.likelyCauses.join(' '), /known bad/);

  const unknown = classifyMetadata('ddpdoj', {
    name: 'mystery.u45', size: 2097152, sha256: '2'.repeat(64),
  });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.knownIdentity, null);
  assert.match(unknown.likelyCauses.join(' '), /not a revision assignment/);
});

test('known MAME alternates are identified by exact SHA-1 without being accepted', () => {
  const alternate = GAME_CATALOGUE.ddpdoj.knownAlternates.find((identity) =>
    identity.set === 'ddpdojblka');
  const report = classifyMetadata('ddpdoj', {
    name: alternate.name,
    size: alternate.size,
    sha256: '3'.repeat(64),
    sha1: alternate.sha1,
  });
  assert.equal(report.status, 'known-alternate-revision');
  assert.deepEqual(report.satisfiesNames, []);
  assert.match(report.knownIdentity, /ddpdojblka/);
  assert.match(report.knownIdentity, new RegExp(alternate.crc32));
  assert.match(formatDiagnostic(summarizeReports('ddpdoj', [report])),
    new RegExp(alternate.sha1));
});

test('byte-swapped and decrypted DaiOuJou program forms are distinguished', () => {
  const raw = GAME_CATALOGUE.ddpdoj.accepted.find((entry) => entry.name === 'ddb10_10_8_434f.u45');
  const swapped = classifyMetadata('ddpdoj', {
    name: raw.name, size: raw.size, sha256: raw.byteSwappedSha256,
  });
  assert.equal(swapped.status, 'known-byte-swapped-program');
  assert.match(swapped.knownIdentity, /byte swapping/);

  const decrypted = GAME_CATALOGUE.ddpdoj.alternateForms[0];
  const accepted = classifyMetadata('ddpdoj', metadata(decrypted, 'whatever.bin'));
  assert.equal(accepted.status, 'accepted-alternate-form');
  assert.deepEqual(accepted.satisfiesNames,
    ['ddb10_10_8_434f.u45', 'ddp3_bios.u37']);
});

test('summary reports missing and duplicate identities', () => {
  const identity = GAME_CATALOGUE.gradius.accepted[0];
  const exact = classifyMetadata('gradius', metadata(identity));
  assert.equal(summarizeReports('gradius', [exact]).complete, true);

  const duplicated = summarizeReports('gradius', [exact, exact]);
  assert.equal(duplicated.complete, false);
  assert.deepEqual(duplicated.duplicates, [{ name: identity.name, count: 2 }]);

  const missing = summarizeReports('gradius', []);
  assert.equal(missing.missing[0].name, identity.name);
  const text = formatDiagnostic(missing);
  assert.match(text, /Missing required inputs/);
  assert.match(text, new RegExp(identity.sha256));
});

test('an exact input for another selected game is identified without relabeling it', () => {
  const batman = GAME_CATALOGUE.batman.accepted[0];
  const report = classifyMetadata('gradius', metadata(batman));
  assert.equal(report.status, 'known-other-game');
  assert.match(report.knownIdentity, /Batman/);
});
