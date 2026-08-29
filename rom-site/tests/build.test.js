import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIST_ROM,
  SOURCE_ALLOWLIST,
  VENDOR_ALLOWLIST,
  auditAssetFreeOutput,
  buildAssetFreeSite,
} from '../../tools/build-rom-dist.mjs';

test('source allowlist is a closed hand-authored browser graph with no game data', () => {
  assert.ok(SOURCE_ALLOWLIST.length > 0);
  assert.ok(SOURCE_ALLOWLIST.every((entry) =>
    entry.startsWith('rom-site/') || entry.startsWith('games/batman/src/')
      || entry.startsWith('games/gradius/src/') || entry.startsWith('games/ddpdoj/src/')
      || entry.startsWith('shared/')));
  assert.ok(SOURCE_ALLOWLIST.every((entry) => !entry.includes('/assets/')));
  assert.ok(SOURCE_ALLOWLIST.every((entry) => !entry.includes('/rip/')));
  assert.ok(SOURCE_ALLOWLIST.every((entry) => !/\.(?:bin|rom|gb|nes|zip|7z|gz)$/i.test(entry)));
  assert.ok(SOURCE_ALLOWLIST.includes('games/batman/src/localrom.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/batman/src/main.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/gradius/src/localrom.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/gradius/src/main.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/ddpdoj/src/localrom.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/ddpdoj/src/main.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/ddpdoj/src/cadence.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/ddpdoj/src/runahead.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('games/ddpdoj/src/runahead-state.js'));
  assert.ok(SOURCE_ALLOWLIST.includes('shared/input.js'));
  assert.ok(!SOURCE_ALLOWLIST.includes('games/ddpdoj/src/web/assets.js'));
  assert.deepEqual(VENDOR_ALLOWLIST.map(({ output, bytes }) => [output, bytes]), [
    ['src/vendor/sevenzip-wasm/sevenzip-wasm.js', 80875],
    ['src/vendor/sevenzip-wasm/sevenzip-wasm.wasm', 1166682],
    ['src/vendor/sevenzip-wasm/LICENSE', 6288],
  ]);
  assert.ok(VENDOR_ALLOWLIST.every((vendor) => /^[0-9a-f]{64}$/.test(vendor.sha256)));
});

test('asset-free builder emits only audited shell files and stamps its build id', () => {
  const built = buildAssetFreeSite({ buildId: '20260823000000', cartridges: [] });
  assert.equal(built.buildId, '20260823000000');
  assert.equal(built.comparisons, 0);
  assert.match(fs.readFileSync(path.join(DIST_ROM, 'src', 'buildid.js'), 'utf8'),
    /20260823000000/);
  const headers = fs.readFileSync(path.join(DIST_ROM, '_headers'), 'utf8');
  assert.match(headers, /Content-Security-Policy/);
  assert.match(headers, /'wasm-unsafe-eval'/);
  assert.match(headers, /sevenzip-wasm\.wasm\n  Content-Type: application\/wasm/);
  for (const vendor of VENDOR_ALLOWLIST) {
    assert.equal(fs.statSync(path.join(DIST_ROM, vendor.output)).size, vendor.bytes);
  }
  const runtimeSources = SOURCE_ALLOWLIST.filter((source) => source.endsWith('.js'))
    .map((source) => fs.readFileSync(path.join(DIST_ROM,
      source.replace(/^rom-site\//, '')), 'utf8'));
  assert.ok(runtimeSources.every((source) => !/\bfetch\s*\(/.test(source)),
    'the closed local runtime graph must make no game-data request');
  assert.doesNotThrow(() => auditAssetFreeOutput(DIST_ROM, { cartridges: [] }));
});

test('asset-free audit rejects any file outside the closed output list', () => {
  buildAssetFreeSite({ buildId: '20260823000001', cartridges: [] });
  const forbidden = path.join(DIST_ROM, 'payload.bin');
  fs.writeFileSync(forbidden, Buffer.from([1, 2, 3]));
  try {
    assert.throws(() => auditAssetFreeOutput(DIST_ROM, { cartridges: [] }),
      /output differs from closed allowlist/);
  } finally {
    fs.rmSync(forbidden);
  }
});

test('asset-free audit rejects an allowlisted body copied from a cartridge', () => {
  buildAssetFreeSite({ buildId: '20260823000002', cartridges: [] });
  const shell = path.join(DIST_ROM, 'styles.css');
  assert.throws(() => auditAssetFreeOutput(DIST_ROM, { cartridges: [shell] }),
    /verbatim.*cartridge slice/);
});
