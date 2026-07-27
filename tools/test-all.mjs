// Single entry point for the whole test suite.
//
//   npm run test-all              everything
//   npm run test-all -- --fast    unit tests + tunables only (no PyBoy)
//   node tools/test-all.mjs --only oracle-regression
//
// Stages run in cheapest-first order so a broken export or a bad constant is
// reported before anything spends 30 s inside an emulator:
//
//   unit-tests        node --test tests/            TEST-A's unit tests for src/*.js
//   tunables-check    tools/gen_tunables.py --check 44 constants still match the ROM bytes
//   asset-integrity   tools/verify_assets.py        assets/ vs the real ROM, all 14 levels  [PyBoy]
//   vram-scripts      tools/oracle/vramdiff.mjs     sub_00_0A0E write stream vs the ROM      [PyBoy]
//   oracle-regression tools/oracle/regress.mjs      port vs ROM, frame-exact, whole corpus  [PyBoy]
//
// Exits non-zero if any stage fails, and names the stage. Stages that cannot
// run (no tests/ directory, no exported assets) are reported as SKIP and do
// not fail the run; a stage that runs and fails always does.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const fast = has('fast');
const keepGoing = has('keep-going');
const only = arg('only', null);
const PY = process.env.PYTHON || 'python';

if (has('help')) {
  console.log('usage: node tools/test-all.mjs [--fast] [--keep-going] [--only <stage>]\n' +
              '  --fast          skip the PyBoy-dependent stages\n' +
              '  --keep-going    run every stage even after one fails\n' +
              '  --only <stage>  run one stage by name\n' +
              '  PYTHON=<exe>    override the python interpreter');
  process.exit(0);
}

const hasUnitTests = fs.existsSync(path.join(ROOT, 'tests')) &&
  fs.readdirSync(path.join(ROOT, 'tests')).some((f) => f.endsWith('.test.js'));
const hasAssets = fs.existsSync(path.join(ROOT, 'assets', 'manifest.json'));

const STAGES = [
  {
    name: 'unit-tests',
    what: "TEST-A's unit tests for src/*.js",
    cmd: process.execPath,
    args: ['--test', 'tests/'],
    skip: hasUnitTests ? null : 'no tests/*.test.js yet',
  },
  {
    name: 'tunables-check',
    what: '44 ROM constants still match their file offsets',
    cmd: PY,
    args: ['tools/gen_tunables.py', '--check'],
  },
  {
    name: 'asset-integrity',
    what: 'assets/ vs the real ROM under PyBoy, all 14 levels',
    cmd: PY,
    args: ['tools/verify_assets.py'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing - run: ' +
                             `${PY} tools/export_assets.py`,
  },
  {
    name: 'vram-scripts',
    what: 'sub_00_0A0E write stream vs the ROM, address+value+order',
    cmd: process.execPath,
    args: ['tools/oracle/vramdiff.mjs', '--record'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'oracle-regression',
    what: 'port vs ROM, frame-exact, whole input-script corpus',
    cmd: process.execPath,
    args: ['tools/oracle/regress.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
];

const results = [];
let failedStage = null;

for (const s of STAGES) {
  if (only && s.name !== only) continue;
  if (fast && s.pyboy) {
    results.push({ ...s, status: 'SKIP', note: '--fast', ms: 0 });
    continue;
  }
  if (s.skip) {
    results.push({ ...s, status: 'SKIP', note: s.skip, ms: 0 });
    continue;
  }

  console.log(`\n=== ${s.name} : ${s.what} ===`);
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, { cwd: ROOT, stdio: 'inherit' });
  const ms = Date.now() - t0;

  if (r.error) {
    results.push({ ...s, status: 'FAIL', note: r.error.message, ms });
    failedStage = failedStage || s.name;
    if (!keepGoing) break;
    continue;
  }
  const okStage = r.status === 0;
  results.push({ ...s, status: okStage ? 'PASS' : 'FAIL',
                 note: okStage ? '' : `exit ${r.status}`, ms });
  if (!okStage) {
    failedStage = failedStage || s.name;
    if (!keepGoing) break;
  }
}

if (!results.length) {
  console.error(`no stage named "${only}". Known: ` +
                STAGES.map((s) => s.name).join(', '));
  process.exit(2);
}

const w = Math.max(...results.map((r) => r.name.length));
console.log('\n' + '='.repeat(w + 30));
console.log('SUMMARY');
for (const r of results) {
  console.log(`  ${r.status.padEnd(5)} ${r.name.padEnd(w)} ` +
              `${String((r.ms / 1000).toFixed(1) + 's').padStart(7)}` +
              (r.note ? `   ${r.note}` : ''));
}
const skipped = results.filter((r) => r.status === 'SKIP').length;
const passed = results.filter((r) => r.status === 'PASS').length;

if (failedStage) {
  const failed = results.filter((r) => r.status === 'FAIL').map((r) => r.name);
  const notRun = (only ? 1 : STAGES.length) - results.length;
  console.log(`\nFAILED at stage: ${failedStage}` +
              (failed.length > 1 ? ` (also: ${failed.slice(1).join(', ')})` : '') +
              (notRun > 0 ? ` -- ${notRun} later stage(s) not run, ` +
                            'pass --keep-going to run them anyway' : ''));
  process.exit(1);
}
console.log(`\nALL GREEN - ${passed} stage(s) passed` +
            (skipped ? `, ${skipped} skipped` : ''));
