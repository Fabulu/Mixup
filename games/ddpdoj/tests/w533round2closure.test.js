import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TOOL = path.join(ROOT, 'games/ddpdoj/tools/round2closure.py');
const ROM = path.join(ROOT, 'games/ddpdoj/tools/oracle/out/maincpu.bin');
const SKIP = existsSync(ROM) ? false : 'local decrypted ROM absent; this is a skip, not a pass';

test('W533 round-2 preflight closes gameplay and excludes diagnostics',
  { skip: SKIP }, () => {
  const result = spawnSync(process.env.PYTHON || 'python', [TOOL], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /stage 5: 770 records, 35 types, unknown none/);
  assert.match(result.stdout, /init stubs: 103\/103 windowed/);
  assert.match(result.stdout, /progression top objects: 18\/18 ported/);
  assert.match(result.stdout,
    /operator-only object \$10 excluded: \$256E7A operator service-menu dispatcher/);
  assert.match(result.stdout,
    /operator-only object \$12 excluded: \$24902A operator ASIC27 self-test/);
  assert.match(result.stdout,
    /mandatory-free enemy \$9A: init \$29EAE2 jmp \$263762 \(ported\); handler \$29EB7A unreachable/);
  assert.match(result.stdout, /UNRESOLVED 0\r?\nCLOSED/);
});
