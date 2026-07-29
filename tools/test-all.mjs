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
//   title-build       tools/oracle/titlediff.mjs    title + round select built, not captured [PyBoy]
//   round-select      tools/oracle/roundseldiff.mjs menu cursor logic vs the ROM             [PyBoy]
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
    name: 'title-build',
    what: 'title + round-select VRAM built from ROM data, all 8192 B each',
    cmd: process.execPath,
    args: ['tools/oracle/titlediff.mjs', '--record'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'level-art',
    what: 'the window map + animated tiles BUILT from ROM data, 11 levels',
    cmd: process.execPath,
    args: ['tools/oracle/waterdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'title-state',
    what: "the title's 8 LCD registers and state 4's press-start flash",
    cmd: process.execPath,
    args: ['tools/oracle/titlestatediff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'stage-intro',
    what: 'sub_00_333F built from ROM data, 8 levels x 5 states of VRAM',
    cmd: process.execPath,
    args: ['tools/oracle/introdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    // The PICTURE, not the data. stage-intro proves the VRAM; this proves what
    // the renderer makes of it, and it exists because the card was
    // 327680/327680 on VRAM and still rendered wrong.
    name: 'stage-intro-screen',
    what: "the card's 160x144 pixels vs what the cartridge displayed",
    cmd: process.execPath,
    args: ['tools/oracle/introscreen.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'ending',
    what: 'loc_00_3652: 4 pictures, the 13-line crawl and THE END',
    cmd: process.execPath,
    args: ['tools/oracle/endingdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'ending-screen',
    what: "the ending's pixels vs the cartridge's own framebuffer",
    cmd: process.execPath,
    args: ['tools/oracle/endingshot.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'game-over-lettering',
    what: "the $C1C0 GAME OVER letters: shadow OAM and records, 4 levels",
    cmd: process.execPath,
    args: ['tools/oracle/gameoverdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'round-select',
    what: 'route/mode cursor logic vs the ROM, three $C753/$FFB5 states',
    cmd: process.execPath,
    args: ['tools/oracle/roundseldiff.mjs', '--record'],
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
  {
    name: 'map-objects',
    what: 'the $C1E8 handlers, all 16 record bytes plus stamped map cells',
    cmd: process.execPath,
    args: ['tools/oracle/objregress.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'progress-flow',
    what: 'route clears, death, CONTINUE and game over vs $C753/$FFB5',
    cmd: process.execPath,
    args: ['tools/oracle/flowdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'raster-bands',
    what: 'the $0857 STAT program per SCANLINE: SCX/SCY/BGP/OBP0/OBP1',
    cmd: process.execPath,
    args: ['tools/oracle/rasterdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'door-sequencer',
    what: 'punch-opened doors, the debris pool and the $C693 effect pool',
    cmd: process.execPath,
    args: ['tools/oracle/doordiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'subsystems',
    what: 'the six sub_00_2CBE branches: conveyor, respawner, freeze, collapse',
    cmd: process.execPath,
    args: ['tools/oracle/subsysdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    name: 'death-sequences',
    what: 'the boss countdown into the fanfare, and the 452-frame player death',
    cmd: process.execPath,
    args: ['tools/oracle/deathdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    // No PyBoy: it replays recordings already on disk, so it is cheap enough
    // to run every time and still covers all 47 ROM sound ids.
    name: 'sound-driver',
    what: 'every recorded sound id, all four channels plus NR50/NR51',
    cmd: process.execPath,
    args: ['tools/oracle/sounddiff.mjs', '--all'],
    pyboy: false,
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
