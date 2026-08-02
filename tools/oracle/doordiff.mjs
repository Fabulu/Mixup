// Door-sequencer regression corpus: $C733-$C735, the $C60B debris pool, the
// $C693 effect pool, the $C6CF ballistic pool and the $D000 cells a door
// actually opens -- port vs cartridge, byte for byte, frame by frame.
//
//   node tools/oracle/doordiff.mjs                       # everything
//   node tools/oracle/doordiff.mjs --only l13-door-punch-open
//   node tools/oracle/doordiff.mjs --verbose
//
// Why this is separate from regress.mjs and objregress.mjs: neither samples a
// single byte of any of the four pools, and the thing under test is almost
// entirely pool state. A door is also the one subsystem where a screenshot is
// actively misleading -- for the first four frames the cartridge and a port
// that erased nothing look identical, because the tilemap update lands in the
// following VBlank either way. What separates them is two bytes per cell in
// $D000, which is what this compares.
//
// The rules the other two runners live by apply unchanged:
//   * caps sit BELOW the first lag frame ($C757). doortrace.py prints the lag
//     list of every run, so each cap is measured rather than guessed. Note
//     that level 13 idling has a lag frame at f46 while level 13 WALKING has
//     none in 120 -- the caps here come from the exact scripts below, not from
//     a level-wide claim.
//   * `warp` places the player, because none of this content is reachable from
//     a scripted input, and it lands AFTER frame 1 in both harnesses.
//   * a scenario that diverges prints the first bad frame per field.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './_env.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const verbose = argv.includes('--verbose');

const PLAYER = ['x', 'y', 'vx', 'vy', 'air', 'facing', 'hp', 'atk',
                'camX', 'camY'];
const SEQ = ['seq', 'dcol', 'drow'];
const DEBRIS_BYTE = ['xhi', 'xlo', 'yhi', 'ylo'];
const EFFECT_BYTE = ['b0', 'xhi', 'xlo', 'yhi', 'ylo', 'sub'];
const BAL_BYTE = ['kind', 'xhi', 'xlo', 'yhi', 'ylo', 'vx', 'vy', 'sub'];

const SCENARIOS = [
  // --- level 13: the level this whole subsystem unblocks -------------------
  // Its floors ARE doors: 88 cells, 22 blocks, all slot 0, all graphics
  // $3E/$3F/$40/$41 baked in by the collision LUT. The player spawns at col 1
  // row 30 on a floor that dead-ends into the col 5/6 block, and punching it
  // is the only way forward.
  //
  // Warping to col 4 puts him against that block; B on frame 1 lands the hit
  // test on f10 (the $FF97 ring reaches 8 eight frames after the press), and
  // RIGHT is held throughout so he WALKS INTO the hole the moment it opens --
  // which is the point of the level and the only part of this that a state
  // comparison of the pools alone would not cover. Cells 7,29/7,30 are the
  // NEXT block and must not change: the sequencer erases four cells, not a row.
  //
  // Measured: $C733 non-zero f10..f47, no lag frame in 120 (level 13 idling
  // has one at f46 -- walking, it does not, which is exactly why the cap is
  // taken per script).
  { name: 'l13-door-punch-open', level: 13, frames: 80, warp: '4,30',
    script: '6:,4:B,200:R',
    cells: '5,29;5,30;6,29;6,30;7,29;7,30' },

  // --- level 9: the full cycle, including the wrap -------------------------
  // A 28-column wall of doors at rows 21/22. Nothing else on this stretch is
  // active (all eight enemy records stay dormant), so the run isolates the
  // sequencer: arm at f10, four cells erased f10-f13, debris + sound $10 at
  // f14, 34 more arc steps, and at f47 $C733 hits $29 and wraps to 0. The
  // extra frames past that are deliberate -- the debris pool is NEVER cleared,
  // so all four records must FREEZE at their last position and stay there.
  { name: 'l9-door-full-cycle', level: 9, frames: 60, warp: '49,22',
    script: '6:,4:B,200:',
    cells: '50,21;50,22;51,21;51,22;52,21;52,22' },

  // --- the $40 corner: same block, punched from below ----------------------
  // DOWN held sends the punch probe +$50 instead of -$50 ($202C), so it lands
  // on the block's BOTTOM-left cell, graphic $40. That is the one arm of
  // $205B-$2072 that adjusts nothing at all, and it must still resolve to the
  // same $C734/$C735 as the $3E hit above -- if the graphic walk is wrong in
  // either direction the two runs disagree about which cells to erase.
  { name: 'l9-door-punch-down', level: 9, frames: 55, warp: '49,22',
    script: '6:,4:BD,300:D',
    cells: '50,21;50,22;51,21;51,22;52,21;52,22' },

  // --- the $3F corner: punched leftward from the far side ------------------
  // Cols 62/63 are the one gap in the wall. Standing in it facing left, the
  // probe lands on (61,21) = $3F, the block's TOP-RIGHT -- the only arm that
  // moves BOTH coordinates ($206E: INC E / DEC D), so it is the one a
  // transposed table would break. Verified to resolve to col $3C row $16.
  //
  // XFAIL, and NOT a door bug -- see `knownFail`. Kept walking (rather than
  // released after the punch) precisely because that is what exposes it.
  { name: 'l9-door-punch-left', level: 9, frames: 60, warp: '62,22',
    script: '2:,10:L,4:LB,300:L',
    cells: '59,21;59,22;60,21;60,22;61,21;61,22',
    script: '2:,10:L,2:,4:DB,300:D',
    cells: '59,21;59,22;60,21;60,22;61,21;61,22' },

  // --- a second punch while the sequencer is busy --------------------------
  // $2046 is `LD A,[$C733] / AND A / RET NZ` -- and that RET is BEFORE the
  // $20A7 recoil, so a punch thrown during another door's sequence costs the
  // player his recoil as well as doing nothing. Second press at f21, hit test
  // at f28, deep inside the f10..f47 window. The compared field that proves it
  // is `vx`: it must stay 0 on f28 and $C733 must not restart.
  { name: 'l9-door-punch-busy', level: 9, frames: 60, warp: '49,22',
    script: '6:,4:B,16:,4:B,300:',
    cells: '50,21;50,22;51,21;51,22;52,21;52,22' },

  // --- level 3: the third level with doors, and a different draw branch ----
  // $4CB1 sends level 3 alone to loc_01_4CCC, where the debris sprite comes
  // from 1:$4CF4 indexed by PIECE rather than from 1:$4CF8 indexed by phase.
  // State-identical, which is the point: the same 39 frames on a level whose
  // geometry, camera and object set are all different.
  { name: 'l3-door-punch', level: 3, frames: 60, warp: '87,29',
    script: '6:,4:B,300:',
    cells: '88,28;88,29;89,28;89,29;90,28;90,29' },

  // --- the only door in the game that is NOT slot 0 ------------------------
  // Every door baked into a level's collision LUT is slot 0, so sub_01_4BE8's
  // `AND $E0 / RET Z` frees nothing for any of the runs above. The other kind
  // of door is stamped at RUNTIME by a landed type-6 block (actors.js $43D1),
  // which writes its own slot index into the top 3 bits -- and punching one of
  // those DOES zero a live 16-byte $C1E8 record.
  //
  // Level 3 columns 97/98 carry four stacked type-6 blocks. Warping to col 96
  // drops the player beside them; slot 1 lands at f60 stamping rows 28/29 with
  // collision $3F (slot 1 * 32 | $1F), slots 2/3/4 stack on top of it, and the
  // punch at f78 opens slot 1's block out from under the whole tower. The
  // cells above are compared too, because the consequence is the interesting
  // part: with its support gone, $4377 makes the block above wipe its own four
  // cells and start falling again.
  { name: 'l3-door-punch-actor-owned', level: 3, frames: 170, warp: '96,26',
    script: '70:,4:B,300:',
    cells: '97,28;98,28;97,29;98,29;97,26;98,26;97,27;98,27;97,25;98,25' },

  // --- NO door: the $271B melee hit spark ----------------------------------
  // The seven scenarios above all punch DOORS, and a punch that resolves to a
  // solid tile never reaches loc_00_2643 at all -- so none of them allocates a
  // $C693 slot from the melee path, and the spark could sit unported for as
  // long as it did without a single one of them noticing.
  //
  // This one punches an ENEMY. Level 3, warped to col 46 row 23 and walked
  // right into the first walker; --ammo 0 so B is a punch and not a throw.
  // The hit lands at f60 and the cartridge writes slot 0 = 10 2F 67 18 00 01 --
  // sprite $10, subtype $01, and the PLAYER's position with the x high byte
  // nudged +1 for facing right ($26FC-$2708). Rows f61..f75 count byte 0 down
  // 0F..01 (the plain $13B4 arm, 16 frames) and the slot reads 0 from f76,
  // with bytes 1-5 left INTACT -- which is why the frames after the lifetime
  // are inside the cap and not trimmed off it.
  //
  // `noDoor` swaps the "did the cartridge arm $C733" sanity guard for "did the
  // cartridge put something in $C693": the guard must still prove the run did
  // something, it is a different something.
  { name: 'l3-punch-enemy', level: 3, frames: 90, warp: '46,23', ammo: 0,
    script: '20:,32:R,6:RB,2:R,20:,6:B,20:,6:B,60:', noDoor: true },
];

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
const rows = [];

for (const s of SCENARIOS) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const common = ['--frames', String(s.frames), '--script', s.script,
                  '--level', String(s.level), '--name', s.name];
  if (s.warp) common.push('--warp', s.warp);
  if (s.cells) common.push('--cells', s.cells);
  // Both harnesses take --ammo ($C759 / state.flow.ammo). Without it B throws
  // a batarang instead of punching and the melee scan never runs.
  if (s.ammo != null) common.push('--ammo', String(s.ammo));

  run('python', ['tools/oracle/doortrace.py', ...common]);
  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, `rip/oracle/doortrace_${s.name}.json`), 'utf8')).frames;
  run('node', ['tools/oracle/doorport.mjs', ...common]);
  const p = JSON.parse(fs.readFileSync(
    path.join(ROOT, `rip/port/doortrace_${s.name}.json`), 'utf8')).frames;

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
  for (const f of SEQ) check(f, (fr) => fr[f]);
  for (let d = 0; d < 4; d++) {
    for (let k = 0; k < 4; k++) {
      check(`debris${d}.${DEBRIS_BYTE[k]}`, (fr) => fr.debris[d * 4 + k]);
    }
  }
  for (let e = 0; e < 10; e++) {
    for (let k = 0; k < 6; k++) {
      check(`eff${e}.${EFFECT_BYTE[k]}`, (fr) => fr.eff[e * 6 + k]);
    }
  }
  for (let b = 0; b < 4; b++) {
    for (let k = 0; k < 8; k++) {
      check(`bal${b}.${BAL_BYTE[k]}`, (fr) => fr.bal[b * 8 + k]);
    }
  }
  const names = s.cells ? s.cells.split(';') : [];
  for (let c = 0; c < names.length; c++) {
    check(`cell(${names[c]}).gfx`, (fr) => fr.cells[c * 2]);
    check(`cell(${names[c]}).coll`, (fr) => fr.cells[c * 2 + 1]);
  }

  const armed = o.filter((f) => f.seq).map((f) => f.f);
  // Byte 0 of any of the ten $C693 slots going non-zero: the cartridge
  // allocated an effect. This is what a noDoor scenario proves instead of
  // $C733, and it is a real assertion, not a weakened guard -- a scenario that
  // punches nothing reports NEVER here just as loudly.
  const effLive = o.some((f) => f.eff.some((v, k) => k % 6 === 0 && v !== 0));
  rows.push({ name: s.name, frames: n, bad, knownFail: s.knownFail,
              noDoor: s.noDoor, effLive,
              lag: o.filter((f) => f.lag).map((f) => f.f),
              armed: armed.length ? `${armed[0]}-${armed[armed.length - 1]}` : 'NEVER' });
  process.stderr.write('done\n');
}

// A scenario carrying `knownFail` is a diagnosed, un-fixed bug in code this
// change does not own: allowed to diverge (xfail), never allowed to start
// passing silently (XPASS fails the run and tells you to delete the note).
const xfails = rows.filter((r) => r.knownFail && r.bad.length);
const xpasses = rows.filter((r) => r.knownFail && !r.bad.length);

const W = Math.max(24, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(W) + 'frames  $C733   fields  verdict');
for (const r of rows) {
  const verdict = r.knownFail ? (r.bad.length ? 'xfail' : 'XPASS')
                              : (r.bad.length ? 'FAIL' : 'ok');
  console.log(r.name.padEnd(W) + String(r.frames).padStart(6) +
              r.armed.padStart(8) + String(r.bad.length).padStart(8) + '  ' + verdict);
}
for (const r of rows) {
  if (r.noDoor && !r.effLive) {
    console.log(`\n  ${r.name}: the cartridge never put a byte in $C693 -- the ` +
                'run proves nothing. Fix the script before reading the verdict.');
  } else if (!r.noDoor && r.armed === 'NEVER') {
    console.log(`\n  ${r.name}: the cartridge NEVER armed $C733 -- the run ` +
                'proves nothing. Fix the script before reading the verdict.');
  }
  if (r.lag.length) {
    console.log(`\n  ${r.name}: lag frames inside the window (${r.lag.join(', ')}) ` +
                '-- the cap must sit BELOW the first of these.');
  }
  if (!r.bad.length) continue;
  console.log(`\n  ${r.name} - first divergence per field:`);
  for (const d of r.bad.slice(0, verbose ? 999 : 25)) {
    console.log(`    ${d.field} @ f${d.frame}: oracle ${d.oracle}, port ${d.port}`);
  }
  if (!verbose && r.bad.length > 25) console.log(`    ... ${r.bad.length - 25} more`);
}
for (const r of xfails) console.log(`\n  ${r.name} (xfail): ${r.knownFail}`);
for (const r of xpasses) {
  console.log(`\n  ${r.name} is marked knownFail but is now bit-exact. `
              + 'Delete the annotation.');
}

const ok = rows.every((r) => (!r.bad.length || r.knownFail)
                             && !r.lag.length
                             && (r.noDoor ? r.effLive : r.armed !== 'NEVER'))
           && !xpasses.length;
const clean = rows.length - xfails.length;
console.log('\n' + (ok
  ? `PASS - ${clean}/${rows.length} door scenarios bit-exact against the ROM`
    + (xfails.length ? `, ${xfails.length} known xfail` : '')
  : (xpasses.length ? 'XPASS: a known-failing scenario now passes'
                    : 'FAIL - a door-sequencer field diverged from the ROM')));
process.exit(ok ? 0 : 1);
