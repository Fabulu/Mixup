// Single entry point for the whole test suite.
//
//   npm run test-all              everything
//   npm run test-all -- --fast    unit tests + tunables only (no PyBoy)
//   node tools/test-all.mjs --only oracle-regression
//
// Stages run in cheapest-first order so a broken export or a bad constant is
// reported before anything spends 30 s inside an emulator:
//
//   unit-tests        node --test games/batman/tests/  the port's unit tests
//   tunables-check    tools/gen_tunables.py --check 44 constants still match the ROM bytes
//   asset-integrity   tools/verify_assets.py        assets/ vs the real ROM, all 14 levels  [PyBoy]
//   vram-scripts      tools/oracle/vramdiff.mjs     sub_00_0A0E write stream vs the ROM      [PyBoy]
//   title-build       tools/oracle/titlediff.mjs    title + round select built, not captured [PyBoy]
//   round-select      tools/oracle/roundseldiff.mjs menu cursor logic vs the ROM             [PyBoy]
//   oracle-regression tools/oracle/regress.mjs      port vs ROM, frame-exact, whole corpus  [PyBoy]
//
// Exits non-zero if any stage fails, and names the stage.
//
// A MISSING PATH IS A FAILURE, NOT A SKIP. This used to derive hasUnitTests
// from <ROOT>/tests and hasAssets from <ROOT>/assets/manifest.json, hand 24 of
// the 26 stages a `skip:` reason when the probe missed, and still print
// ALL GREEN and exit 0 -- so a tree whose layout had moved under the runner
// reported success having run two stages. assets/ is gitignored, so such a move
// leaves no trace in a diff either. Now: if a probed path is missing the run
// EXITS NON-ZERO and names the path it probed. `--allow-missing` restores the
// old tolerance for someone who genuinely has no ROM-derived assets, and says
// so loudly in the banner.
//
// --fast is unaffected: that is a DELIBERATE scope reduction, not a missing
// path, and its skips are still skips.

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
              '  --fast           skip the PyBoy-dependent stages\n' +
              '  --keep-going     run every stage even after one fails\n' +
              '  --only <stage>   run one stage by name\n' +
              '  --allow-missing  a missing tests/ or assets/ SKIPs instead of failing\n' +
              '  PYTHON=<exe>     override the python interpreter');
  process.exit(0);
}

const allowMissing = has('allow-missing');

// The two paths the whole gate hangs off. Spelled once, printed on every run,
// and checked before a single stage starts -- because the failure they guard
// against is a runner pointed at the wrong root, which is silent by
// construction.
// GAME_DIR is the one place this runner knows which game it is gating. It is
// spelled here rather than imported from tools/oracle/_env.mjs so the gate
// keeps working if the oracle preamble is broken -- a runner that cannot start
// because the thing it tests is broken is a runner that cannot report it.
const GAME_DIR = path.join(ROOT, 'games', 'batman');
const TESTS_REL = 'games/batman/tests/';
const TESTS_DIR = path.join(GAME_DIR, 'tests');
const ASSET_MANIFEST = path.join(GAME_DIR, 'assets', 'manifest.json');

const hasUnitTests = fs.existsSync(TESTS_DIR) &&
  fs.readdirSync(TESTS_DIR).some((f) => f.endsWith('.test.js'));
const hasAssets = fs.existsSync(ASSET_MANIFEST);

console.log('root          ' + ROOT);
console.log('unit tests    ' + TESTS_DIR + (hasUnitTests ? '' : '   *** MISSING ***'));
console.log('asset manifest ' + ASSET_MANIFEST + (hasAssets ? '' : '   *** MISSING ***'));

if (!allowMissing && (!hasUnitTests || !hasAssets)) {
  const missing = [];
  if (!hasUnitTests) missing.push(`${TESTS_DIR}  (no *.test.js found there)`);
  if (!hasAssets) missing.push(`${ASSET_MANIFEST}  (run: ${PY} tools/export_assets.py)`);
  console.error('\nREFUSING TO RUN: the gate cannot see its own inputs.\n' +
                missing.map((m) => '  missing: ' + m).join('\n') +
                '\n\nEvery stage that depends on these would have been reported SKIP and the\n' +
                'run would have printed ALL GREEN having tested almost nothing. If that is\n' +
                'genuinely what you want, pass --allow-missing.');
  process.exit(1);
}

const STAGES = [
  {
    name: 'unit-tests',
    what: "TEST-A's unit tests for games/batman/src/*.js",
    cmd: process.execPath,
    args: ['--test', TESTS_REL],
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
    // The PICTURE of a death, and it is here because the tool existed, was RED,
    // and nothing ran it -- which is exactly how the defect it now guards
    // rotted. game-over-lettering above compares 13504/13504 shadow-OAM bytes
    // and says itself that it "deliberately does not compare order"; it drives
    // src/effects.js directly and is blind to main.js's call site by
    // construction. The burst was driven from the head of updatePlayer instead
    // of from $057A/$05EC, which put its letters at the wrong OAM index on odd
    // frames -- 68 wrong pixels on death-l1 f441, invisible to every stage in
    // this list.
    //
    // death-l9 is deliberately EXCLUDED, with both of its residuals named:
    //   f321  75 px, the enemy-flush order component -- CLOSED by moving the
    //         drawEnemies flush to $05CF, and now 0
    //   f100  447 px, measured NOT to be an order error (the order-only delta
    //         at f100 is 0 px) and otherwise undiagnosed
    // Add death-l9 to this stage once f100 has an owner.
    name: 'death-pixels',
    what: 'a player death and the GAME OVER burst, on screen, levels 1 and 3',
    cmd: process.execPath,
    args: ['tools/oracle/deathpix.mjs', '--only', 'death-l1,death-l3'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    // No PyBoy: the $0BEA 8-bit shadow-OAM Y wrap, asserted on the queue AND on
    // the pixels, against numbers written down in the tool. pixeldiff.mjs sees
    // the same 15 pixels but compares against a RECORDED reference, so a
    // re-record would silence it; this one cannot be re-recorded.
    name: 'oam-wrap',
    what: "sub_00_0BC6's 8-bit Y: level 12's banner is drawn on row 0",
    cmd: process.execPath,
    args: ['tools/oracle/oamwrap.mjs'],
    pyboy: false,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    // No PyBoy on the port side, but it re-runs oamorder.py when the cartridge
    // dumps are absent. Shadow-OAM ORDER, which is DMG sprite priority and the
    // ten-per-line cut -- and which every byte-for-byte OAM comparison in this
    // list is blind to by definition.
    name: 'oam-order',
    what: 'the sprite queue in CALL ORDER vs the cartridge, levels 6/1/9',
    cmd: process.execPath,
    args: ['tools/oracle/oamdiff.mjs'],
    pyboy: true,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    // No PyBoy: it asserts level 14's init block against the listing, value by
    // value. It was written months ago, was RED on all three difficulties the
    // whole time, and nothing ran it -- the $FFAD blackout seed was missing and
    // the Joker level rendered on the wrong background for the entire entrance
    // (pixeldiff l14-walk: 11.90% at f40 and f80). A check outside the gate is
    // a check that rots.
    name: 'l14-init',
    what: "level 14's entrance block: $C750/$C740/$C741/balloon/$C73D/BGP",
    cmd: process.execPath,
    args: ['tools/oracle/l14init.mjs'],
    pyboy: false,
    skip: hasAssets ? null : 'assets/manifest.json missing',
  },
  {
    // No PyBoy: pure port, and it guards a SOFTLOCK that shipped. Level 6 is
    // the only level whose clear leaves through a transition, and its fanfare
    // fades the palette to white -- so a transition arm that forgets to restore
    // it loads level 7 into a blank screen and the game plays on, invisible.
    // Reported from play as "the boss explodes, the screen fades to white, and
    // then we softlock". The stage asserts the handover AND that the
    // framebuffer has more than one shade.
    name: 'level6-clear',
    what: 'clearing level 6 reaches level 7 and the screen is still visible',
    cmd: process.execPath,
    args: ['tools/oracle/l6clear.mjs'],
    pyboy: false,
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
// The banner must not be readable charitably. "ALL GREEN, 2 passed, 24
// skipped" is not a green run and must not look like one, so a run with any
// skip at all says PARTIAL and names how many of the known stages actually
// executed.
const total = only ? 1 : STAGES.length;
if (skipped) {
  console.log(`\nPARTIAL - ${passed}/${total} stage(s) passed, ${skipped} SKIPPED ` +
              `(nothing was tested by those). Reasons above.`);
} else {
  console.log(`\nALL GREEN - ${passed}/${total} stage(s) passed, 0 skipped`);
}
