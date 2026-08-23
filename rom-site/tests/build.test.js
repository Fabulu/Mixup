import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIST_ROM,
  SOURCE_ALLOWLIST,
  auditAssetFreeOutput,
  buildAssetFreeSite,
} from '../../tools/build-rom-dist.mjs';

test('source allowlist is closed and contains no game asset tree', () => {
  assert.ok(SOURCE_ALLOWLIST.length > 0);
  assert.ok(SOURCE_ALLOWLIST.every((entry) => entry.startsWith('rom-site/')));
  assert.ok(SOURCE_ALLOWLIST.every((entry) => !entry.includes('/assets/')));
  assert.ok(SOURCE_ALLOWLIST.every((entry) => !/\.(?:bin|rom|gb|nes|zip|7z|gz)$/i.test(entry)));
});

test('asset-free builder emits only audited shell files and stamps its build id', () => {
  const built = buildAssetFreeSite({ buildId: '20260823000000', cartridges: [] });
  assert.equal(built.buildId, '20260823000000');
  assert.equal(built.comparisons, 0);
  assert.match(fs.readFileSync(path.join(DIST_ROM, 'src', 'buildid.js'), 'utf8'),
    /20260823000000/);
  assert.match(fs.readFileSync(path.join(DIST_ROM, '_headers'), 'utf8'),
    /Content-Security-Policy/);
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
