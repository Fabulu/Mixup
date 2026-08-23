import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOGUE } from '../src/catalogue.js';
import { inspectInventory } from '../src/diagnostics.js';

function digestFile(identity, name = identity.name ?? 'decrypted-maincpu.bin') {
  const digestBytes = Buffer.from(identity.sha256, 'hex');
  return {
    name,
    size: identity.size,
    lastModified: 1,
    arrayBuffer: async () => digestBytes.buffer.slice(
      digestBytes.byteOffset, digestBytes.byteOffset + digestBytes.byteLength),
  };
}

function allExactFiles() {
  return Object.values(GAME_CATALOGUE).flatMap((game) =>
    game.accepted.map((identity) => digestFile(identity)));
}

function identityDigest(counter) {
  return async (algorithm, bytes) => {
    counter.calls++;
    return algorithm === 'SHA-1' ? bytes.slice(0, 20) : bytes;
  };
}

test('one mixed folder hashes each file once and unlocks all three games', async () => {
  const files = allExactFiles();
  const counter = { calls: 0 };
  const inventory = await inspectInventory(files, { digest: identityDigest(counter) });
  assert.equal(counter.calls, files.length);
  assert.equal(inventory.games.batman.complete, true);
  assert.equal(inventory.games.gradius.complete, true);
  assert.equal(inventory.games.ddpdoj.complete, true);
  assert.equal(inventory.games.batman.acceptedFiles.length, 1);
  assert.equal(inventory.games.gradius.acceptedFiles.length, 1);
  assert.equal(inventory.games.ddpdoj.acceptedFiles.length, 10);
  assert.equal(inventory.games.ddpdoj.acceptedInputs.length, 10);
  assert.deepEqual(inventory.games.ddpdoj.acceptedInputs[0].satisfiesNames,
    [GAME_CATALOGUE.ddpdoj.accepted[0].name]);
});

test('unknown extras remain diagnostic but do not relock an exact game', async () => {
  const batman = digestFile(GAME_CATALOGUE.batman.accepted[0]);
  const unknownDigest = Buffer.alloc(32, 0x44);
  const unknown = {
    name: 'unrelated-file.bin', size: 321, lastModified: 2,
    arrayBuffer: async () => unknownDigest.buffer.slice(
      unknownDigest.byteOffset, unknownDigest.byteOffset + unknownDigest.byteLength),
  };
  const counter = { calls: 0 };
  const inventory = await inspectInventory([batman, unknown], {
    digest: identityDigest(counter),
  });
  assert.equal(counter.calls, 3, 'accepted input needs SHA-256; unknown input also gets SHA-1');
  assert.equal(inventory.games.batman.complete, true);
  assert.equal(inventory.games.batman.acceptedFiles.length, 1);
  assert.equal(inventory.games.batman.extras.length, 1);
  assert.equal(inventory.games.batman.extras[0].status, 'unknown');
  assert.equal(inventory.games.gradius.complete, false);
  assert.equal(inventory.games.ddpdoj.complete, false);
});

test('unknown SHA-256 inputs get one evidence-bounded SHA-1 revision lookup', async () => {
  const alternate = GAME_CATALOGUE.ddpdoj.knownAlternates.find((identity) =>
    identity.set === 'ddpdojblkb');
  const sha1 = Buffer.from(alternate.sha1, 'hex');
  const file = {
    name: alternate.name,
    size: alternate.size,
    arrayBuffer: async () => sha1.buffer.slice(sha1.byteOffset, sha1.byteOffset + sha1.byteLength),
  };
  const algorithms = [];
  const inventory = await inspectInventory([file], {
    digest: async (algorithm, bytes) => {
      algorithms.push(algorithm);
      return algorithm === 'SHA-256' ? Buffer.alloc(32, 0xaa) : bytes;
    },
  });
  assert.deepEqual(algorithms, ['SHA-256', 'SHA-1']);
  assert.equal(inventory.games.ddpdoj.reports[0].status, 'known-alternate-revision');
  assert.match(inventory.games.ddpdoj.reports[0].knownIdentity, /ddpdojblkb/);
  assert.equal(inventory.games.ddpdoj.complete, false);
});

test('decrypted maincpu replaces both raw u45 and BIOS requirements', async () => {
  const game = GAME_CATALOGUE.ddpdoj;
  const replaced = new Set(['ddb10_10_8_434f.u45', 'ddp3_bios.u37']);
  const files = [
    ...game.accepted.filter((identity) => !replaced.has(identity.name)).map((identity) => digestFile(identity)),
    digestFile(game.alternateForms[0]),
  ];
  assert.equal(files.length, 9);
  const counter = { calls: 0 };
  const inventory = await inspectInventory(files, { digest: identityDigest(counter) });
  const summary = inventory.games.ddpdoj;
  assert.equal(counter.calls, 9);
  assert.equal(summary.complete, true);
  assert.deepEqual(summary.missing, []);
  assert.deepEqual(summary.duplicates, []);
  assert.equal(summary.acceptedFiles.length, 9);
  assert.equal(summary.acceptedInputs.length, 9);
  assert.ok(summary.acceptedInputs.some((input) => input.satisfiesNames.length === 2));
});

test('duplicate or conflicting required identities lock only the affected game', async () => {
  const files = allExactFiles();
  files.push(digestFile(GAME_CATALOGUE.batman.accepted[0]));
  const inventory = await inspectInventory(files, {
    digest: identityDigest({ calls: 0 }),
  });
  assert.equal(inventory.games.batman.complete, false);
  assert.deepEqual(inventory.games.batman.duplicates, [{
    name: GAME_CATALOGUE.batman.accepted[0].name,
    count: 2,
  }]);
  assert.equal(inventory.games.gradius.complete, true);
  assert.equal(inventory.games.ddpdoj.complete, true);

  const goodRenamed = digestFile(GAME_CATALOGUE.batman.accepted[0], 'known-good.gb');
  const wrongDigest = Buffer.alloc(32, 0x55);
  const wrongNamed = {
    name: GAME_CATALOGUE.batman.accepted[0].name,
    size: GAME_CATALOGUE.batman.accepted[0].size,
    lastModified: 3,
    arrayBuffer: async () => wrongDigest.buffer.slice(
      wrongDigest.byteOffset, wrongDigest.byteOffset + wrongDigest.byteLength),
  };
  const conflict = await inspectInventory([goodRenamed, wrongNamed], {
    digest: identityDigest({ calls: 0 }),
  });
  assert.equal(conflict.games.batman.missing.length, 0);
  assert.equal(conflict.games.batman.conflicts.length, 1);
  assert.equal(conflict.games.batman.complete, false);
});
