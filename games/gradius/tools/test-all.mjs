// The Gradius gate. One command, every layer, in cheapest-first order.
//
//     node games/gradius/tools/test-all.mjs
//
// NOTE FOR WHOEVER OWNS tools/test-all.mjs AT THE REPO ROOT: this is
// deliberately NOT wired into it. Another workflow is restructuring games/ and
// tools/ and owns that file; adding a stage there from here would be two
// writers in one file. **This should be wired in as a stage of the root runner
// later** -- one line, `node games/gradius/tools/test-all.mjs`, exit code
// forwarded.
//
// ================= SKIP IS NOT PASS, AND SOME SKIPS ARE FAILURES =============
//
// docs/knowledge/03: a stage that cannot run for an ENVIRONMENTAL reason (no
// emulator, no cartridge) is a legitimate SKIP. A stage that cannot run because
// a path moved is a FAILURE. The two are told apart here rather than lumped
// together, because "ALL GREEN -- 2 stages passed, 24 skipped" is the most
// dangerous output a test runner can produce:
//
//   * no ROM at the repo root            -> SKIP everything downstream of it
//   * ROM present, assets/ missing       -> FAIL: you have the cartridge, run
//                                          the exporter
//   * ROM + assets, no Mesen             -> SKIP the oracle comparison
//   * Mesen present, no recorded corpus  -> SKIP, naming the command
//   * anything else missing              -> FAIL
//
// The skipped count is printed on the last line, next to the verdict, where it
// cannot be missed.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = dirname(HERE);
const REPO = dirname(dirname(GAME));
const ROM = join(REPO, 'Gradius (USA).nes');
const ASSETS = join(GAME, 'assets');
const SCEN = join(HERE, 'oracle', 'out', 'scen');

const results = [];
function stage(name, fn) {
  process.stdout.write(`\n---- ${name} ----\n`);
  const r = fn();
  // A stage that forgot to return a verdict used to print `[undefined]` and
  // then crash in the summary -- i.e. an unknown result read as "not a
  // failure". Caught by doing exactly that; now it is a failure.
  if (!r || !['PASS', 'FAIL', 'SKIP'].includes(r.status)) {
    throw new Error(`stage ${JSON.stringify(name)} returned no verdict `
                  + `(${JSON.stringify(r)}) -- a stage with no result is a bug, `
                  + `not a pass`);
  }
  results.push({ name, ...r });
  console.log(`  [${r.status}] ${name}${r.note ? ' -- ' + r.note : ''}`);
  return r;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO, shell: false, ...opts });
  return r.status === 0;
}

// ---------------------------------------------------------------- stage 0 ---
const romPresent = existsSync(ROM);
const assetsPresent = existsSync(join(ASSETS, 'manifest.json'))
                   && existsSync(join(ASSETS, 'metasprites.json'))
                   && existsSync(join(ASSETS, 'chr', 'tiles.u8'))
                   && existsSync(join(ASSETS, 'terrain', 'stages.json'));

stage('inputs', () => {
  console.log(`  ROM     ${romPresent ? 'present' : 'ABSENT'}  ${ROM}`);
  console.log(`  assets  ${assetsPresent ? 'present' : 'ABSENT'}  ${ASSETS}`);
  if (!romPresent && !assetsPresent) {
    return { status: 'SKIP', note: 'no cartridge and no export: nothing can run' };
  }
  if (romPresent && !assetsPresent) {
    // The cartridge is here, so this is not environmental -- it is a missing
    // build step, and a missing build step is a failure.
    return { status: 'FAIL', note: 'ROM is present but assets/ is not. Run: '
           + 'python games/gradius/tools/export_assets.py && '
           + 'python games/gradius/tools/export_metasprites.py' };
  }
  return { status: 'PASS' };
});

// ---------------------------------------------------------------- stage 1 ---
stage('unit tests (node --test games/gradius/tests/)', () => {
  if (!assetsPresent) return { status: 'SKIP', note: 'needs assets/' };
  return run(process.execPath, ['--test', 'games/gradius/tests/'])
    ? { status: 'PASS' } : { status: 'FAIL' };
});

// ---------------------------------------------------------------- stage 1b --
// The assets are ROM-derived and every port fact that reads a table reads THEM,
// not the ROM. verify_assets.py re-derives all nine check families by a second
// route and its --self-test corrupts each one in turn to prove the check
// notices. It had been sitting outside the gate since it was written, which is
// docs/knowledge/02 trap 5 -- a check outside the gate rots -- and wave 2 added
// a family to it ("hud", the 39 canned packets at $864E), so it goes in.
//
// It needs BOTH the ROM (it re-parses the .nes) and assets/, so ROM-absent is
// an environmental SKIP and ROM-present-assets-absent is already a FAIL above.
stage('assets == the cartridge (verify_assets.py --self-test)', () => {
  if (!assetsPresent) return { status: 'SKIP', note: 'needs assets/' };
  if (!romPresent) {
    return { status: 'SKIP', note: 'verify_assets.py re-parses the .nes itself; '
           + 'no cartridge at the repo root' };
  }
  return run('python', ['games/gradius/tools/verify_assets.py', '--self-test'])
    ? { status: 'PASS' } : { status: 'FAIL' };
});

// ---------------------------------------------------------------- stage 2 ---
// The port-side trace must be able to produce probe.lua's exact field list.
// This is a shape check and it is cheap; it catches a renamed field before four
// minutes of emulator time do.
stage('port trace shape == probe.lua state vector', () => {
  if (!assetsPresent) return { status: 'SKIP', note: 'needs assets/' };
  return run(process.execPath, ['games/gradius/tools/oracle/shapecheck.mjs'])
    ? { status: 'PASS' } : { status: 'FAIL' };
});

// ---------------------------------------------------------------- stage 3 ---
const corpus = existsSync(SCEN)
  ? readdirSync(SCEN).filter((f) => f.endsWith('.json')
      && !f.includes('.port.') && !f.includes('.probe.') && !f.includes('.objloop.'))
  : [];

stage('port vs cartridge (compare.mjs)', () => {
  if (!assetsPresent) return { status: 'SKIP', note: 'needs assets/' };
  if (corpus.length === 0) {
    return { status: 'SKIP', note: 'no recorded oracle corpus (needs Mesen + the '
           + 'ROM). Record it with: python games/gradius/tools/oracle/scen.py' };
  }
  return run(process.execPath, ['games/gradius/tools/oracle/compare.mjs'])
    ? { status: 'PASS' } : { status: 'FAIL' };
});

// ---------------------------------------------------------------- stage 4 ---
// The comparison must be SEEN TO FAIL, every run, not once when it was written.
// A deliberate break is injected and the runner asserts the comparison goes
// red; if it stays green, the gate fails -- because a comparison that cannot
// fail is a decoration (docs/knowledge/03).
stage('self-check: the comparison goes red when the port is broken', () => {
  if (corpus.length === 0 || !assetsPresent) {
    return { status: 'SKIP', note: 'needs the recorded corpus' };
  }
  // The verdict is the TIER 1 FAILURE COUNT, not the exit code.
  //
  // The first version of this stage used the exit code and was WRONG: a subset
  // run also fails on clamp coverage (two scenarios do not reach all four
  // walls), so a deliberately misspelt neuter -- which changed nothing at all
  // -- was reported as "RED (good)". The stage was validating the comparison
  // using a signal the comparison produces for another reason entirely. Counted
  // failures cannot do that.
  const subset = 'wiggle,corner-br,speed3-diag,opt2-wiggle';
  const failures = (neuter) => {
    const argv = ['games/gradius/tools/oracle/compare.mjs', '--only', subset];
    if (neuter) argv.push('--neuter', neuter);
    const r = spawnSync(process.execPath, argv, { cwd: REPO, encoding: 'utf8' });
    const m = /(\d+) failures/.exec(r.stdout);
    if (!m) return { n: null, err: (r.stderr || r.stdout).trim().split('\n')[0] };
    return { n: Number(m[1]) };
  };

  const base = failures(null);
  if (base.n !== 0) {
    return { status: 'FAIL', note: `the unneutered subset is not clean `
           + `(${base.n ?? 'crash: ' + base.err}) -- the self-check cannot mean `
           + `anything until it is` };
  }
  const breaks = ['lead1', 'seed-x+1', 'laginject=450'];
  const survived = [];
  for (const b of breaks) {
    const r = failures(b);
    const red = r.n !== null && r.n > 0;
    console.log(`  neuter ${b.padEnd(14)} -> `
              + (red ? `RED, ${r.n} TIER 1 failures (good)`
                     : `NOT RED (${r.n === null ? r.err : r.n + ' failures'})`));
    if (!red) survived.push(b);
  }
  return survived.length
    ? { status: 'FAIL', note: `these breaks did NOT turn the comparison red: ${survived}` }
    : { status: 'PASS',
        note: `subset clean at 0 failures, ${breaks.length} deliberate breaks all red` };
});

// -------------------------------------------------------------- the verdict -
const fail = results.filter((r) => r.status === 'FAIL');
const skip = results.filter((r) => r.status === 'SKIP');
const pass = results.filter((r) => r.status === 'PASS');
console.log('\n================================================================');
for (const r of results) console.log(`  ${r.status.padEnd(4)}  ${r.name}`);
console.log(`\n  ${fail.length ? 'RED' : 'GREEN'} -- ${pass.length} passed, `
          + `${fail.length} failed, ${skip.length} SKIPPED`);
if (skip.length) {
  console.log('  A skipped stage proves nothing. Skipped:');
  for (const r of skip) console.log(`    ${r.name}: ${r.note}`);
}
process.exit(fail.length ? 1 : 0);
