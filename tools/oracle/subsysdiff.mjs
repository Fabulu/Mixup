// sub_00_2CBE regression corpus: one scenario per per-level branch, port vs
// cartridge, byte for byte, frame by frame.
//
//   node tools/oracle/subsysdiff.mjs                     # everything
//   node tools/oracle/subsysdiff.mjs --only l6-conveyor-track
//   node tools/oracle/subsysdiff.mjs --verbose
//
// Why this is separate from regress.mjs and objregress.mjs: neither carries
// $FFC8/$FFC9/$FFCA/$FFCB/$FFCC, $C717, $C736, $C73B or the $C75B-$C762 block,
// and those eleven bytes ARE the subsystems. objregress compares what the
// map-object handlers do with the track; this compares who moves it.
//
// The rules the older runners live by apply unchanged:
//   * frames are capped just SHORT of the first lag frame ($C757).
//     subsystrace.py prints the lag list of every run, so every cap below is
//     measured, never guessed (docs/03-VERIFICATION.md section 28).
//   * `warp` places the player, because most of this content is unreachable
//     from a scripted input, and it lands AFTER frame 1 in both harnesses.
//   * a scenario that diverges prints the first bad frame per field -- that
//     frame is the bug.
//   * `knownFail` marks a DIAGNOSED, unfixed gap: it may diverge (xfail) but
//     may not start passing silently (an XPASS fails the run).
//
// $C740 is deliberately not compared. The cartridge holds $FF there for a live
// level and the port carries the same byte as flow.levelCleared with the sense
// inverted (0 = live), because main.js consumes it as a clear REQUEST. The
// level-6 branch's `$C740 == $FF` gate is ported against that inversion.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const verbose = argv.includes('--verbose');

const BYTE = ['type', 'xhi', 'xlo', 'yhi', 'ylo', 'accum', 'vel', 'halfW',
              'halfH', 'sx', 'sy', 'state', 'wait', 'ride', 'origX', 'origY'];
// Player fields any of these branches can move, plus the ones that prove it
// did not move anything it should not have.
const PLAYER = ['x', 'y', 'vx', 'vy', 'air', 'camX', 'camY', 'hp',
                'facing', 'action', 'atk', 'cling', 'carryX', 'carryY'];
// `squat` ($FF90) is sampled but NOT compared, and the reason is a pre-existing
// port gap rather than anything this file owns. The ROM writes the landing
// squat at $1B3F and DECREMENTS it at $1CB8-$1CCE; src/player.js only writes
// it, so the port sits at 16 forever from the first landing while the
// cartridge reads 0. Measured on level 6 idle: 240 frames of 240 mismatch,
// every other player field bit-exact. The level-$0B freeze zeroes $FF90
// ($2D1E) and conveyor.js reproduces that, so this exclusion hides nothing
// this branch does -- but it does hide a real bug, and player.js should grow
// the countdown.
// The subsystem bytes themselves.
const SUBSYS = ['park', 'dir', 'track', 'plx', 'seqTimer', 'spring',
                'cursor', 'respawns', 'cheat'];
const DROP = ['$C75B', '$C75C', '$C75D', '$C75E', '$C75F',
              '$C760', '$C761', '$C762'];

const SCENARIOS = [
  // --- level 6: loc_00_2EF4, the conveyor track --------------------------
  // The one that unblocks something else: objregress's `l6-conveyor-deck`
  // scenario currently INJECTS the cartridge's own $FFCA/$FFCB/$FFC9 because
  // nothing in the port wrote them. This proves the writer.
  //
  // Idle is the whole scenario on purpose. The track is a CHASE -- it walks
  // toward the player's column and stops on it -- so standing still at column
  // $01 makes it run its full travel ($0700 -> $01F8 at 8/frame, measured) and
  // then hold, which exercises the walk, the arrival stop at $2F48 (which
  // leaves $FFC9 at 2, not 0) and 12 frames of rest in one 240-frame run.
  // No lag frames in the window (measured: none in 240).
  { name: 'l6-conveyor-track', level: 6, frames: 240, script: '240:',
    slots: [0] },

  // --- level 7: loc_00_2F5F, the map-object respawner --------------------
  // Fires on frame 1 -- level 7's blob is two records long, so slots 4/5/6
  // are already free -- and then must NOT fire again while they are occupied.
  // That gate is the whole point: $C73B stays 1 for the entire run.
  //
  // Capped at 53: f54 is the run's only lag frame ($C757, measured).
  { name: 'l7-object-respawner', level: 7, frames: 53, script: '53:',
    slots: [4, 5, 6] },

  // --- level $0B: loc_00_2CED, the entrance freeze ------------------------
  // Walk right until the player lands on exactly (column $0B, row $17) and
  // the game takes the controls for 240 frames. Measured: arms at f197 with
  // $C717 = $F0, counts to 1 at f436, spends itself ($FF) at f437 and the
  // player walks off. RIGHT is held throughout, so the scenario also proves
  // the freeze is enforced by $C751 suppressing input at $1820 and not by
  // anything in the branch itself -- x, y and vx are pinned for 240 frames
  // with the button down.
  //
  // 460 frames, no lag anywhere in the window (measured: none in 500).
  //
  // It is also the scenario that found two src/player.js bugs, both of them
  // $C751 arms the port only half-implemented. The branch itself is exact --
  // x, y, vx, vy, $C717 and $C751 are bit-exact for all 460 frames, arm frame
  // and release frame included -- and the two fields that diverge are
  // consequences one frame later:
  //   $1820  `LD A,[$C751] / AND A / JR NZ loc_00_183B` is missing from
  //          horizontal()'s `blocked`, so RIGHT still turns the player. Add
  //          `|| p.springArmed !== 0` beside the $FF97 and $C71E tests.
  //   $1ABF  `JP NZ, loc_00_1B41` is ported as a bare `return` in falling().
  //          $1B41 is not a return site: it is the landing tail, so a frozen
  //          player is re-grounded every frame (air = 0, vy = 0, $FFB2 = 0,
  //          $FFC2 = 0). Without it the port goes airborne at f198 and stays
  //          there for the whole freeze.
  // Both are safe to make: $C751's ONLY setter in the entire ROM is $2D0B,
  // this branch, so the "spring jump" is really "the jump that ends level
  // $0B's cutscene" and nothing else can observe either change.
  { name: 'l11-entrance-freeze', level: 0x0B, frames: 460,
    script: '20:,440:R', slots: [],
    script: '45:', slots: [0, 1, 2],
    slots: [] },
];

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
const rows = [];

for (const s of SCENARIOS) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const tag = s.name;
  const common = ['--frames', String(s.frames), '--script', s.script,
                  '--level', String(s.level), '--tag', tag];
  if (s.warp) common.push('--warp', s.warp);
  if (s.cells) common.push('--cells', s.cells);

  run('python', ['tools/oracle/subsystrace.py', ...common]);
  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, `rip/oracle/subsys_${tag}.json`), 'utf8')).frames;
  run('node', ['tools/oracle/subsysport.mjs', ...common]);
  const p = JSON.parse(fs.readFileSync(
    path.join(ROOT, `rip/port/subsys_${tag}.json`), 'utf8')).frames;

  const n = Math.min(o.length, p.length);
  const bad = [];
  const check = (name, get) => {
    for (let i = 0; i < n; i++) {
      const a = get(o[i]);
      const b = get(p[i]);
      if (a === b) continue;
      bad.push({ field: name, frame: i + 1, oracle: a, port: b });
      return;                          // first divergence per field is enough
    }
  };

  for (const f of PLAYER) check(f, (fr) => fr[f]);
  for (const f of SUBSYS) check(f, (fr) => fr[f]);
  for (let k = 0; k < DROP.length; k++) check(DROP[k], (fr) => fr.drop[k]);
  for (const slot of s.slots || []) {
    for (let k = 0; k < 16; k++) {
      check(`s${slot}.${BYTE[k]}`, (fr) => fr.obj[slot * 16 + k]);
    }
  }
  if (s.cells) {
    const names = s.cells.split(';');
    for (let c = 0; c < names.length; c++) {
      check(`cell(${names[c]}).gfx`, (fr) => fr.cells[c * 2]);
      check(`cell(${names[c]}).coll`, (fr) => fr.cells[c * 2 + 1]);
    }
  }

  rows.push({ name: s.name, frames: n, bad, knownFail: s.knownFail,
              lag: o.filter((f) => f.lag).map((f) => f.f) });
  process.stderr.write('done\n');
}

const verdict = (r) => {
  if (r.knownFail) return r.bad.length ? 'xfail' : 'XPASS';
  return r.bad.length ? 'FAIL' : 'ok';
};

const W = Math.max(22, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(W) + 'frames  fields  verdict');
for (const r of rows) {
  console.log(r.name.padEnd(W) + String(r.frames).padStart(6) +
              String(r.bad.length).padStart(8) + '  ' + verdict(r));
}
for (const r of rows) {
  if (r.lag.length) {
    console.log(`\n  ${r.name}: lag frames inside the window (${r.lag.join(', ')}) ` +
                '-- the cap must sit BELOW the first of these.');
  }
  if (verdict(r) === 'XPASS') {
    console.log(`\n  ${r.name}: XPASS -- the knownFail is stale, delete it:\n` +
                `    ${r.knownFail}`);
  }
  if (!r.bad.length) continue;
  console.log(`\n  ${r.name} - first divergence per field` +
              (r.knownFail ? ` (xfail: ${r.knownFail})` : '') + ':');
  for (const d of r.bad.slice(0, verbose ? 999 : 25)) {
    console.log(`    ${d.field} @ f${d.frame}: oracle ${d.oracle}, port ${d.port}`);
  }
  if (!verbose && r.bad.length > 25) console.log(`    ... ${r.bad.length - 25} more`);
}

const ok = rows.every((r) => verdict(r) === 'ok' || verdict(r) === 'xfail')
  && rows.every((r) => !r.lag.length);
console.log('\n' + (ok
  ? `PASS - ${rows.length}/${rows.length} sub_00_2CBE scenarios accounted for ` +
    `(${rows.filter((r) => r.knownFail).length} xfail)`
  : 'FAIL - a sub_00_2CBE field diverged from the ROM'));
process.exit(ok ? 0 : 1);
