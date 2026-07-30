// Map-object regression corpus: the $C1E8 array, port vs cartridge, byte for
// byte, frame by frame.
//
//   node tools/oracle/objregress.mjs                 # everything
//   node tools/oracle/objregress.mjs --only l3-type6-block-stack
//
// Why this is separate from regress.mjs: that runner compares a fixed state
// vector carrying four bytes of two object slots, and a map-object handler is
// exactly the kind of code that can look right while the +9/+$0A screen cache
// -- the ONLY coordinates loc_00_2426 ever compares against -- is wrong. So
// each scenario here names the slots it cares about and every byte of those
// records is compared, cache included, plus the player fields an object moves
// and (for type 6) the $D000 map cells the object turns into terrain.
//
// The rules regress.mjs lives by apply unchanged:
//   * frames are capped just SHORT of the first lag frame ($C757). objtrace.py
//     prints the lag list of every run, so the cap is measured, never guessed.
//   * `warp` places the player, because none of this content is reachable from
//     a scripted input, and it lands AFTER frame 1 in both harnesses.
//   * a scenario that diverges prints the first bad frame per byte -- that
//     frame is the bug.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const verbose = argv.includes('--verbose');

// Record byte names, for readable failures.
const BYTE = ['type', 'xhi', 'xlo', 'yhi', 'ylo', 'accum', 'vel', 'halfW',
              'halfH', 'sx', 'sy', 'state', 'wait', 'ride', 'origX', 'origY'];
const PLAYER = ['x', 'y', 'vx', 'vy', 'air', 'camX', 'camY', 'hp'];

const SCENARIOS = [
  // --- type 5: the platform that gives way (jt_01_4291) --------------------
  // Level 3 slot 5 sits at column $13 row $1A, one row above real floor, so
  // the falling player lands on the OBJECT first (the scan rewrites his Y) and
  // that sets +$0D. Covers the whole life of the type: the rider gate, the
  // seven arming frames, the 1-per-frame acceleration to the $30 cap, the
  // carry that keeps the player glued to it, and -- at f85 -- $42DE zeroing
  // the slot when its Y high byte reaches $21, with the +9/+$0A cache left
  // frozen at f84's value because that arm skips the screen tail.
  //
  // Capped at 150: f154 is the run's only lag frame ($C757, measured).
  { name: 'l3-type5-give-way', level: 3, frames: 150, warp: '19,22',
    script: '150:', slots: [5] },

  // --- type 6: the falling block that becomes terrain (jt_01_42E3) ---------
  // Level 3 columns 97/98 carry FOUR of them stacked at rows $0F/$0B/$08/$05.
  // Warping to column 96 is inside the 5-column arming window and outside
  // their 2x2 footprint, so all four run their whole cycle while the player
  // stands still: arm at f2, fall from f3, cap at $50 by f29, then land one
  // after another at f60/f67/f70/f73 -- each ON TOP of the block below it,
  // because the previous landing stamped real solid map. The stamped cells are
  // compared as well as the records: graphics $3E/$3F/$40/$41 and collision
  // `slot * 32 | $1F`, which is the slot-ownership encoding level 13's
  // destructible cells are built on.
  { name: 'l3-type6-block-stack', level: 3, frames: 120, warp: '96,26',
    script: '120:', slots: [1, 2, 3, 4],
    cells: '97,28;98,28;97,29;98,29;97,26;98,26;97,25;98,25;97,23;98,23' },

  // --- type 1: the horizontal oscillator (jt_01_488D) ----------------------
  // Level 3 slot 6, column $25 row $18, range 4 columns either side of +$0E.
  // Warping above it lands the player on it at f23, so this covers the carry
  // as well as the movement. The point of the run is f73: the object reaches
  // column $29 and REWRITES ITS OWN TYPE BYTE to 2 (sub_01_4AA0), after which
  // the deceleration runs through the OTHER entry point -- $10, $0F, $0E ...
  // one per frame, not two. It reverses again on the way back at ~f150.
  { name: 'l3-type1-oscillate-flip', level: 3, frames: 190, warp: '37,20',
    script: '190:', slots: [6], extraPlayer: true },

  // --- types 3 and 4: the vertical oscillator pair (jt_01_499B / $4940) ----
  // Level 7 is the only level that ships both halves: slot 0 is a type 3
  // (rising) at column $0F and slot 1 a type 4 (falling) at column $12, both
  // with a 2-row range. They flip at f32 and f33 respectively, in opposite
  // directions, so one run pins both entry points and both limit tests.
  //
  // This is also the scenario that condemned the previous type-3 port: it
  // braked a positive velocity by 2 and moved by v-2, where the cartridge
  // moves by v-1 (the brake jumps into the accelerating half, which adds 1
  // back). Slot 1 at f34 reads velocity $0F, not $0E.
  { name: 'l7-type34-oscillator-pair', level: 7, frames: 200, warp: '16,20',
    script: '200:', slots: [0, 1] },

  // --- type 5 on level 12, where an ENEMY stands on one of them ------------
  // Level 12 is dense with unported machinery (regress.mjs lists the hazards),
  // so the placement matters: column 44 is clear of the col 3-14 collapsing
  // floor and far from the col-92 shooter whose muzzle breaks a wall the port
  // does not model. Slot 2 (column $2C row $1D) runs its entire life here --
  // rider at f25, committed at f32, cleared at ~f95 -- while slot 3 sits
  // armed-but-unridden two columns away, which is the arm that proves the
  // rider gate is a gate and not a timer.
  { name: 'l12-type5-give-way', level: 12, frames: 200, warp: '44,26',
    script: '200:', slots: [2, 3] },

  // --- the type-6 pair on a SECOND level ------------------------------------
  // Level 13 slots 1 and 2 are type 6 at column $0E rows $16/$14, and warping
  // to column 13 is inside their arming window. Worth its own entry because
  // level 13 is the level whose 88 destructible cells are actor-owned, so the
  // `slot * 32 | $1F` stamp is load-bearing there rather than incidental --
  // and because it re-runs the type-8 platforms (slots 0 and 6) and the type-3
  // (slot 5) on a level no other scenario visits.
  { name: 'l13-type6-pair', level: 13, frames: 150, warp: '13,22',
    script: '150:', slots: [0, 1, 2, 5, 6],
    cells: '13,26;14,26;13,27;14,27;13,24;14,24;13,25;14,25' },

  // --- the screen-tail ordering, on the types that must NOT get a cache ----
  // Level 5 slot 0 is the only shipped type 3 outside level 7, and slots 1-3
  // are the type-9 spike traps. $49F7 tests the type BEFORE the cache write at
  // $4A05, so masked 7/9/$0B never receive one: MEASURED, all three traps hold
  // +9/+$0A = 0 for their entire extend/retract cycle. A port that cached
  // first (as this one did) diverges on two bytes of three records with no
  // gameplay symptom at all, because the overlap scan skips masked 7 and 9 --
  // exactly the sort of silent state rot a scenario exists to catch.
  { name: 'l5-type3-and-spike-cache', level: 5, frames: 90, warp: '20,25',
    script: '90:', slots: [0, 1, 2, 3] },

  // --- type $0B: the level-6 conveyor deck (jt_01_483C) --------------------
  // This used to inject the cartridge's own $FFCA/$FFCB/$FFC9 because the
  // handler's INPUT -- loc_00_2EF4, the level-6 branch of sub_00_2CBE -- was
  // unported. It is ported now (src/conveyor.js), the injection is gone, and
  // the scenario still passes: the +1/+2 copy, the hand-written +9/+$0A cache
  // (the shared tail refuses masked type $0B, so nothing else writes it), the
  // $C72F carry AND the track that drives them are all bit-exact.
  //
  // WALKING, and 400 frames, because idling reaches only ONE of loc_00_2EF4's
  // three arms. MEASURED, port side, both scripts:
  //
  //   '120:'        the player never leaves column 1, so $2F23 (col < trackHi,
  //                 falls into $2F26 trackDown) is the only arm taken. $FFC9
  //                 holds 2 for all 120 frames and the track walks monotonically
  //                 down from $0700 to $0340, still going when the run ends.
  //   '20:,380:R'   the track undershoots to $04F8 at f65, the player's column
  //                 catches it, and $2F0F/$2F12 (trackUp) runs -- $FFC9 flips
  //                 2 -> 1 at f69 -- then $2F48 parks it at $0500 for the rest
  //                 of the run.
  //
  // TEETH, and this is why the widening is not cosmetic. Delete the trackUp
  // call in src/conveyor.js's level6Track `col > trackHi` arm: this scenario
  // goes red at f70 on s0.xhi/xlo/sx (oracle 10 0 152, port 9 248 151) and at
  // f74 on the player's own x/vx, while the OLD '120:' entry stays bit-exact
  // and reports PASS. Both runs were executed. $C757 is clear for all 400
  // frames, so the cap is measured rather than assumed.
  { name: 'l6-conveyor-deck', level: 6, frames: 400, script: '20:,380:R',
    slots: [0] },
];

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
const rows = [];

for (const s of SCENARIOS) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const common = ['--frames', String(s.frames), '--script', s.script,
                  '--level', String(s.level)];
  if (s.warp) common.push('--warp', s.warp);
  if (s.cells) common.push('--cells', s.cells);

  run('python', ['tools/oracle/objtrace.py', ...common]);
  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, `rip/oracle/objtrace_L${String(s.level).padStart(2, '0')}.json`),
    'utf8')).frames;

  // `inject` hands the port a subsystem it does not own yet, so the subsystem
  // under test is the only variable. NOTHING uses it today -- every input is
  // ported -- but the mechanism stays for the next handler that lands before
  // its feed does. Never use it for anything a scenario is supposed to prove.
  //
  // If you do use it, shift it by one frame: the actor driver is $05BA and
  // sub_00_2CBE is $05C6, so a handler reads what LAST frame's branch left
  // behind, while objtrace.py samples at $0A4F after this frame's branch has
  // already moved it. Feeding the same-frame value put the deck 8 subpixels
  // left of the cartridge's from frame 1 -- which is how the shift was found.
  const inject = s.inject
    ? ['--inject', JSON.stringify([[0x0700, 0],
                                   ...o.slice(0, -1).map((f) => [f.track, f.dir])])]
    : [];
  run('node', ['tools/oracle/objport.mjs', ...common, ...inject]);
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/port/objtrace.json'),
                                       'utf8')).frames;

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
  for (const slot of s.slots) {
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

  rows.push({ name: s.name, frames: n, bad, lag: o.filter((f) => f.lag).map((f) => f.f) });
  process.stderr.write('done\n');
}

const W = Math.max(20, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(W) + 'frames  fields  verdict');
for (const r of rows) {
  console.log(r.name.padEnd(W) + String(r.frames).padStart(6) +
              String(r.bad.length).padStart(8) + '  ' +
              (r.bad.length ? 'FAIL' : 'ok'));
}
for (const r of rows) {
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

const ok = rows.every((r) => !r.bad.length && !r.lag.length);
console.log('\n' + (ok
  ? `PASS - ${rows.length}/${rows.length} map-object scenarios bit-exact against the ROM`
  : 'FAIL - a map-object field diverged from the ROM'));
process.exit(ok ? 0 : 1);
