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

// --------------------------------------------------------------- stage 1b2 --
// tablecoverage.py: does the EXPORT ship every table the port INDEXES, and
// does metasprites.json contain every id the CARTRIDGE names?
//
// WAVE 21. Both directions have already failed in this tree:
//
//   LOUD   wave 15 crashed on $B086/$B088 -- a ported handler indexed a range
//          no exporter shipped. The census then found 28 more in that state,
//          so the next 24 handlers were going to repeat it one at a time.
//   QUIET  metasprite $A2 (18 records, named by explosion scripts 4 and 5) was
//          dropped by an invented `n > 16` bound, and drawMetasprite() returns
//          the cursor unchanged for a missing id -- it would have drawn nothing
//          and thrown nothing.
//
// The quiet one is why this is a stage and not just a unit test: it can only be
// seen by walking the ROM and asking what it NAMES. The tool walks all 42
// $AE1C dispatch targets plus $C413 with a real decoder, so it needs no
// hand-maintained list and cannot go stale as handlers are ported.
//
// It reads assets/prg.bin, not the .nes, so it runs wherever the export does.
stage('every indexed table is exported (tablecoverage.py)', () => {
  if (!assetsPresent) return { status: 'SKIP', note: 'needs assets/' };
  return run('python', ['games/gradius/tools/tablecoverage.py'])
    ? { status: 'PASS' } : { status: 'FAIL', note: 'a table an $AE1C handler '
           + 'indexes is in no exported range, or a metasprite id the ROM '
           + 'names is not in metasprites.json' };
});

// ---------------------------------------------------------------- stage 1c --
// snddata.py --selfcheck: the sound data decoded PURELY from the ROM bytes says
// index $13 (the stage-1 pulse-1 part) lasts 512 ticks, and the cartridge was
// MEASURED holding $B2 = $13 for 513 game frames (310..822 inclusive) -- 1 setup
// frame plus 512. Two independent derivations of one number
// (docs/knowledge/03), and the recon watched it fail both ways:
//
//   dur = base << exp        (instead of base*(exp+1))  -> 768 ticks  [FAIL]
//   loop while c == cnt + 1  (instead of c == cnt)       -> 640 ticks  [FAIL]
//
// It is exactly the two readings src/sound.js could plausibly have taken for
// $EECE-$EED5 and $ECEB, so it guards the port and not just the recon. It reads
// the .nes itself, hence the ROM-absent skip.
stage('sound data == the measured ownership window (snddata.py --selfcheck)', () => {
  if (!romPresent) {
    return { status: 'SKIP', note: 'snddata.py reads the .nes itself; no '
           + 'cartridge at the repo root' };
  }
  return run('python', ['games/gradius/tools/oracle/snddata.py', '--selfcheck'])
    ? { status: 'PASS' } : { status: 'FAIL' };
});

// --------------------------------------------------------------- stage 1d ---
// THE COST CHECK. WAVE 14.
//
// Everything else in this runner measures CORRECTNESS. Nothing measured COST,
// and docs/worklog/gradius/13-FINDING-input-granularity-under-load.md said so
// in as many words -- "Nobody has ever measured how long one logic frame takes
// ... It is entirely possible the port now needs more than 16.6 ms per frame on
// a loaded machine, and no check in this repo would notice."
//
// It was worse than that. When wave 14 finally measured it, renderFrame() was
// costing a MEDIAN of 6.07 ms of the 16.639 ms frame -- 36% of the budget, more
// than nmi() and the whole synthesiser put together -- because its background
// loop called tileRow() once per PIXEL and threw away seven eighths of every
// read. Fourteen waves of bit-exact scenarios had gone past it. A port can be
// pixel-perfect, byte-exact against the cartridge on 14,098 frames, and
// unplayable, and until this stage existed the gate would have said GREEN.
//
// It needs only assets/ (it runs the port headlessly), so ROM-absent is not a
// reason to skip it. ~20 s.
stage('one frame fits in the budget (framecost.mjs)', () => {
  if (!assetsPresent) return { status: 'SKIP', note: 'needs assets/' };
  return run(process.execPath, ['games/gradius/tools/framecost.mjs'])
    ? { status: 'PASS' } : { status: 'FAIL', note: 'a stage of the frame is over '
      + 'its share of the 16.639 ms budget -- see the table above. The limits and '
      + 'the margin are stated at the top of tools/framecost.mjs.' };
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

// --------------------------------------------------------------- stage 2b ---
// THE RENDERER GATE, wired in by the FINAL VERIFICATION pass (wave 99).
//
// It was in the tree and in NO runner from the day it was written, and
// docs/knowledge/02 trap 5 says what happens to a check outside the gate: it
// rots. This is not a hypothetical here -- it is measured. Waves 5, 6, 7 and 8
// each recorded, in their own worklog, that they did not run it:
//
//   05-review-fidelity.md  "What I did NOT run is tools/oracle/rendergate.py"
//   06-review-fidelity.md  "are in the tree and are in neither test-all.mjs nor
//                           anything else"
//   07-review-fidelity.md  "not run at all this review ... the highest-value hole"
//   08-review-fidelity.md  "I did not run rendergate.py"
//
// Four consecutive waves is enough evidence. It rebuilds seven captured frames
// from the model in NOTES-render.md and compares all 61,440 pixels of each,
// and it runs its own eleven negative controls and fails if any is seen by no
// frame. It needs Mesen and the cartridge (it captures the frames itself), so
// ROM-absent is an environmental SKIP like the oracle stages.
//
// It is the slowest stage (~4 min: it drives the emulator to frame 2600 twice).
// That is the price of it being run at all, and it is cheaper than the four
// waves that skipped it.
stage('the renderer rebuilds the cartridge pixel-exactly (rendergate.py)', () => {
  if (!romPresent) {
    return { status: 'SKIP', note: 'rendergate.py drives Mesen against the .nes '
           + 'itself; no cartridge at the repo root' };
  }
  return run('python', ['games/gradius/tools/oracle/rendergate.py'])
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
  // WAVE 10 ADDED `deep-ground`, and it is not padding. The subset was four
  // align-400 scenarios, and on every one of them the collision map $0500-$06FF
  // is 0/512 at the align frame -- so `seed-coll0` (delete the map the seed
  // installs) is a NO-OP there and would have been reported as a break that
  // does not break. `deep-ground` aligns at 1700 with 32/512 non-zero and the
  // ship dies on the ground at f1866; without the map the port flies through
  // it. It costs one 249-frame port trace.
  // WAVE 11 ADDED `enemy-bullet-rank`, for the same reason wave 10 added
  // `deep-ground`: the subset could not see the thing the new neuter breaks.
  // Every scenario above has ZERO live enemy-bullet slots on every frame -- the
  // pool is empty at align 400 and nothing in their scripts fills it -- so
  // `bullet-nosub` would have been a break that does not break. This one has up
  // to ten bullets in flight, four allocation failures and four shield
  // absorptions over 299 frames.
  const subset = 'wiggle,corner-br,speed3-diag,opt2-wiggle,deep-ground,'
               + 'enemy-bullet-rank';
  const failures = (neuter) => {
    const argv = ['games/gradius/tools/oracle/compare.mjs', '--only', subset];
    if (neuter) argv.push('--neuter', neuter);
    const r = spawnSync(process.execPath, argv, { cwd: REPO, encoding: 'utf8' });
    // ANCHORED ON THE SUMMARY LINE, not on the first `N failures` anywhere in
    // stdout. It used to be `/(\d+) failures/` and wave 10 walked straight into
    // it: compare.mjs prints each scenario's `why` prose, and `deep-ground`'s
    // why QUOTES a failure count ("seed-coll0 -> 104 failures") as its evidence.
    // The stage then read that number instead of the run's, which is the exact
    // shape of the bug this stage's own header already describes -- validating a
    // check using a signal that means something else.
    const m = /frames compared \([^)]*\), (\d+) failures/.exec(r.stdout);
    if (!m) return { n: null, err: (r.stderr || r.stdout).trim().split('\n')[0] };
    return { n: Number(m[1]) };
  };

  const base = failures(null);
  if (base.n !== 0) {
    return { status: 'FAIL', note: `the unneutered subset is not clean `
           + `(${base.n ?? 'crash: ' + base.err}) -- the self-check cannot mean `
           + `anything until it is` };
  }
  // The three original breaks, plus three that WAVE 10 added because seeding
  // inverts the usual trap: the risk is not that the harness invents state, it
  // is that the seed HIDES a bug by handing the port a value it should have
  // produced. Each of these deletes or corrupts one thing seedFromCartridge()
  // installs, so "is anything looking at this?" is answered every gate run:
  //
  //   seed-nt+1    one nametable byte  -> the wave-10 VIDEO block, which is the
  //                only thing in this repo that has ever compared the port's
  //                screen against the cartridge's
  //   seed-pal+1   one palette byte    -> same block
  //   seed-coll0   the whole collision map -> needs `deep-ground`, see above
  //
  // `seed-oam0` exists too and is deliberately NOT here: it is MEASURED green,
  // because $8087's DMA rewrites all 256 bytes of hardware OAM on the first
  // ported frame. That is documented in porttrace.mjs at the assignment and in
  // docs/worklog/gradius/10-impl-seed-anywhere.md, not hidden by omission.
  //   bullet-nosub the enemy bullets' sub-pixel accumulators -> needs
  //                `enemy-bullet-rank`, see above. Wave 11.
  const breaks = ['lead1', 'seed-x+1', 'laginject=450',
                  'seed-nt+1', 'seed-pal+1', 'seed-coll0', 'bullet-nosub'];
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
