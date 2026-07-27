// Run the whole input-script corpus through both the oracle and the port and
// report a fidelity table. This is the regression suite -- every playtest
// scenario worth keeping should become an entry in SCRIPTS.
//
// Usage: node tools/oracle/regress.mjs [--level 1] [--only <name>]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const level = arg('level', '1');
const only = arg('only', null);

const ENEMY_FIELDS = ['en0f', 'en0s', 'en0x', 'en0hp', 'en1f', 'en2f'];
const ROPE_FIELDS = ['action', 'ropeSeg', 'ropePh', 'ropeFlip', 'ropeDly',
                     'rope0x', 'rope0y', 'rope5x', 'rope5y', 'carryY'];

// Every entry is a permanent test. Scripts are tuned against the level-1
// geometry (see the ASCII map in docs/03-VERIFICATION.md "Test suite"):
// the spawn platform is cols 0-3 with its top at row 8, the main floor is row
// 13 spanning cols 4-13, and a 3-cell wall at cols 13-14 rows 10-12 caps it.
const SCRIPTS = [
  // --- original corpus ---
  { name: 'fall-and-walk',   frames: 150, script: '20:,130:R' },
  { name: 'walk-jump-walk',  frames: 120, script: '20:,40:R,10:RA,50:R' },
  { name: 'walljump-reverse', frames: 200,
    script: '15:,25:R,8:RA,20:R,10:A,30:L,12:LA,40:R,40:' },
  { name: 'idle-then-left',  frames: 140, script: '30:,90:L,20:' },
  { name: 'jump-spam',       frames: 180,
    script: '10:,20:RA,10:R,20:RA,10:R,20:RA,90:R' },

  // --- collision against vertical surfaces ---
  // Run the full length of the floor into the col-14 wall, then keep holding
  // RIGHT into it for ~80 more frames. Covers the wall push at loc_00_1F61
  // (1 px shove + the xlo=$80 snap) and proves standing pressed against a wall
  // is a fixed point rather than a slow drift.
  { name: 'wall-run-into-right', frames: 260, script: '20:,240:R' },
  // Same contact from the other side: walk LEFT into the level's left boundary
  // (loc_00_1F87 is the mirrored push) and hold.
  { name: 'wall-into-left-boundary', frames: 160, script: '20:,140:L' },

  // --- leaving the ground ---
  // Walk off the right edge of the spawn platform, release everything mid-air,
  // fall and land: ground -> air transition with no jump involved.
  { name: 'ledge-walk-off', frames: 140, script: '40:,40:R,60:' },

  // --- variable jump height: same jump, A held for 2 vs 45 frames ---
  // gravityRisingHeld ($01) vs gravityRisingReleased ($02) diverge from the
  // frame A comes up, so the two apexes differ by 16 px.
  { name: 'jump-tap-min-height', frames: 140, script: '40:,2:A,98:' },
  { name: 'jump-hold-max-height', frames: 140, script: '40:,45:A,55:' },
  // Short hop with nothing else happening: the landing frame itself is the
  // assertion (air, vy, anim and the landing squat must all flip together).
  { name: 'jump-land-exact-frame', frames: 110, script: '40:,3:A,67:' },

  // --- wall jumps ---
  // Jump into the shaft's right-hand wall, cling ($FFB2 = $50), sit through
  // the 16-frame total freeze, and launch. Stops before the divergence the
  // chain scenario below documents, so the cling itself stays protected.
  { name: 'walljump-launch-off-right-wall', frames: 115,
    script: '40:,50:R,10:RA,15:L' },
  // Cling + launch off a wall on the right, then off a wall on the left,
  // without touching the ground in between: two 16-frame freezes ($FFB2),
  // both launch directions, and the direction bits surviving the countdown.
  // This one was the project's first xfail. Closing it needed three separate
  // fixes: the horizontal probe must pass THROUGH slope graphics rather than
  // treat them as walls, it must apply the X-snap tables at 0:$23B8-$2417
  // (indexed by the VERTICAL position within the metatile), and -- the actual
  // culprit -- the floor probe must run while RISING ($1AD4) yet have its
  // result IGNORED while rising ($1B38), so a slope rewrites Y mid-ascent
  // without landing the player.
  { name: 'walljump-chain-both-walls', frames: 260,
    script: '40:,50:R,10:RA,50:L,10:LA,50:R,10:RA,40:R' },

  // --- gravity ---
  // Max-height jump from the spawn platform, drifting right off its edge, so
  // the fall runs ~116 px and sits pinned at terminalVelocity ($BE = -66) for
  // 17 consecutive frames.
  { name: 'long-fall-terminal', frames: 200, script: '40:,30:R,45:RA,85:R' },

  // --- horizontal acceleration ---
  // Full speed right, reverse to full speed left, reverse again. Exercises
  // $1881: pressing against your own momentum brakes 1 subpx/frame and does
  // not accelerate, so each reversal is a 48-frame bleed through zero.
  { name: 'reverse-at-full-speed', frames: 220, script: '40:,80:R,60:L,40:R' },

  // --- attacks (both harnesses take --ammo, so the throw path is reachable
  //     without walking to a pickup; `extra` adds fields to the comparison) ---
  // No ammo: every B press is a punch. Checks the attack timer's own cadence
  // and that a second press during the first swing does not restart it ($1A1B).
  { name: 'punch-standing-no-ammo', frames: 160, ammo: 0,
    script: '40:,4:B,26:,4:B,6:,4:B,76:',
    extra: ['action', 'atkTimer', 'atkPose', 'ammo'] },
  // Three throws in quick succession fill all three batarang slots, then a
  // fourth press with the pool full spends ammo AND punches -- the deliberate
  // $1990-$19AD ordering quirk. Tracks the flight of slot 0 too.
  { name: 'batarang-fill-all-slots', frames: 200, ammo: 5, skipFrames: 1,
    script: '40:,4:B,10:,4:B,10:,4:B,10:,4:B,118:',
    extra: ['atkTimer', 'atkPose', 'ammo', 'bat0', 'bat0x', 'bat0y', 'bat0spd',
            'bat0arc', 'bat1', 'bat2'] },
  // Throw one batarang and stand still for the whole out-and-back. The catch is
  // the assertion: the return leg is where the homing lives, and X alone looked
  // fine while the vertical axis was wrong.
  { name: 'batarang-full-return', frames: 220, ammo: 5, skipFrames: 1,
    script: '40:,4:B,176:',
    extra: ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc'] },
  // The way it is actually played: throw on the run and keep running. The
  // return leg homes on a player who has moved, which is where the vertical
  // hysteresis in slot+0 earns its keep.
  { name: 'batarang-throw-on-the-run', frames: 240, ammo: 5, skipFrames: 1,
    script: '20:,30:R,4:RB,186:R',
    extra: ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc'] },
  // Thrown while airborne and holding Up (the arc flag at $1A08), landing
  // mid-flight so the return target moves vertically as well as horizontally.
  { name: 'batarang-arc-throw-in-air', frames: 240, ammo: 5, skipFrames: 1,
    script: '20:,20:R,10:RA,4:RUB,186:R',
    extra: ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc'] },

  // --- bat-rope -------------------------------------------------------------
  // Walk right along the main floor, then fire the rope with UP. Covers the
  // extension steps ($FFB4 counting 5 down to 0), whichever of "bites" or "runs
  // out and retracts" the level-1 ceiling actually produces, and -- if it bites
  // -- the pendulum, the facing flip at the extreme, and the carry that moves
  // Batman. Ropes NOT firing at all would also show here as a flat ropeSeg.
  { name: 'rope-fire-and-swing', level: 1, frames: 320,
    script: '20:,60:R,1:U,239:',
    extra: ROPE_FIELDS },
  // Fire the rope and press A partway through the swing: the tangent launch at
  // $3FD6, including the rule that there is no upward kick before the bottom of
  // the arc.
  { name: 'rope-release-launch', level: 1, frames: 320,
    script: '20:,60:R,1:U,60:,1:A,178:',
    extra: ROPE_FIELDS },

  // --- map objects + the water body -----------------------------------------
  // Level 1's four type-7 water spouts, at columns 99-112 over the pit. Warped
  // in because nothing can walk there yet. The spouts are TERRAIN: they stamp a
  // column of $FD one cell at a time, erase it, pause, repeat -- so what is
  // being checked here is the phase machine and the row cursor.
  //
  // The 400-frame window also covers the level-1/2 WATER BODY (src/water.js):
  // the waterfall trigger + 7-cell stamp, the surface rising through the
  // player's row, and -- at f264/f265 -- the $2E8D water hit (1 dmg, $5A) and
  // its $1776 knockback launch, which an earlier note misattributed to the
  // walker at column 95. That walker melees at f174 (bit-exact) and then runs
  // ONE frame behind the ROM from f226 on: f226 is a real lag frame ($C757 --
  // the VBlank fired before the main loop finished, so the cartridge's enemy
  // driver skipped one update). Instruction-level timing is out of scope for
  // the port, so the en3 slot is traced by the harnesses but deliberately NOT
  // compared here; nothing the walker does after f226 touches a compared
  // field within 400 frames.
  { name: 'l1-water-spouts', level: 1, frames: 400, warp: '95,27',
    script: '400:',
    extra: ['ob0t', 'ob0y', 'ob0st', 'ob0w', 'ob1t', 'ob1st', 'ob1w',
            ...ENEMY_FIELDS,
            'hp', 'slow', 'watLv', 'watPh', 'watSt', 'watWy'] },
  // The water body alone: column 74 is the one deep shaft outside EVERY
  // enemy activation window (the col-67 walker misses by exactly one column)
  // and far from the spouts. Six full hit cycles -- surface reaches the
  // player, $2E8D hit, $1776 knockback, 90-frame invulnerability, repeat
  // (hp 10 -> 4) -- plus walking both ways in slow mode ($FF95 speed caps)
  // and the 1-in-8 $FFB1-phased water fall gravity, which is what pinned the
  // port's frame counter to the cartridge's $6D boot phase.
  { name: 'l1-water-rising-hits', level: 1, frames: 620, warp: '74,28',
    script: '300:,40:R,40:L,240:',
    extra: ['hp', 'slow', 'watLv', 'watPh', 'watSt', 'watWy',
            ...ENEMY_FIELDS] },

  // --- enemy AI (a scenario may carry its own `level:`) ---------------------
  // The enemy fields ride along on every one of these: slot-0 flags/state/
  // world-X/HP plus the slot-1/2 flag bytes.

  // Level 1: holding RIGHT stops at the col-13/14 wall, which keeps the camera
  // short of every walker's activation window -- NO level-1 enemy activates
  // here (an earlier comment claimed otherwise; verified false). What this
  // protects is 620 frames of dormant records staying dormant while the
  // player grinds a wall. Real level-1 walker coverage -- activation, the
  // distance bands, a gap leap, the f174 melee -- lives in l1-water-spouts.
  { name: 'l1-walker-approach', level: 1, frames: 620, script: '20:,600:R',
    extra: ENEMY_FIELDS },
  // Level 5, state 2 (walker+jump, 1:$5399): idle -> chase across two ledges
  // (falls, landings, the ledge scan at $5288), melee lunge at f216 (the
  // attack probe hits the player: knockback + iframes), post-attack committed
  // walk, and the turn-anim-expiry wall jumps at f257/f388.
  { name: 'l5-walkerjump-approach', level: 5, frames: 620, script: '20:,600:R',
    extra: ENEMY_FIELDS },
  // Level 9, state 3 (flyer, 1:$55AA): slow-sink gravity, committed flight,
  // wall hops via the turn-anim jump, and the dive attack.
  { name: 'l9-flyer-dive', level: 9, frames: 620, script: '20:,600:R',
    extra: ENEMY_FIELDS },
  // Level 5 gauntlet: four jumps deep into the level, under the descending
  // type-9 spike traps. Covers the trap's extend/retract map stamping, the
  // ceiling probe pushing a falling player down a row ($1AA7 via the level-5
  // spike-ceiling rule at $1EE9), grounded spike damage, two enemy melees and
  // enemy knockback. Capped at 578: the player dies there, and the port's
  // post-death respawn deliberately deviates from the ROM's round-select.
  { name: 'l5-spike-trap-gauntlet', level: 5, frames: 578,
    script: '20:,140:R,20:RA,120:R,20:RA,120:R,20:RA,120:R,20:RA,320:R',
    extra: ENEMY_FIELDS },
  // Level 3 exists to pin the map-object overlap scan (loc_00_2426). The
  // level's start column has no floor in the map at all: what the player lands
  // on is $C1E8 slot 0, a type $08, and the scan is the only thing that finds
  // it. Before the scan was ported he fell straight to the death row, which is
  // what the "level 2 -> 3 arrival kills you" bug actually was.
  //
  // Capped at 317 because frame 318 is a LAG FRAME -- $C757 is set there, the
  // only one in the run, measured. The enemy driver skips that iteration, so
  // the cartridge's enemy 0 stalls one step and every later enemy X sits 21
  // world units behind the port's. That is instruction-level timing and out of
  // scope by definition (see docs/03-VERIFICATION.md §28), not a porting bug.
  //
  // Downstream, it is also the whole explanation for the "port takes a
  // knockback at 358 that the cartridge does not": 21 units is enough to put
  // the enemy in contact range one frame early. Nothing to fix.
  //
  // 317 is deliberately chosen so ENEMY_FIELDS can be compared too -- the
  // alternative was a longer run that only passes because enemy fields are
  // excluded, which would hide the divergence rather than bound it.
  { name: 'l3-object-floor', level: 3, frames: 317,
    script: '20:,120:R,20:RA,120:R,20:RA,180:R', extra: ENEMY_FIELDS },
];

const FIELDS = ['x', 'y', 'vx', 'vy', 'air', 'facing', 'camX', 'camY'];
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

const rows = [];
for (const s of SCRIPTS) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const ammo = s.ammo === undefined ? [] : ['--ammo', String(s.ammo)];
  // Late-level content is unreachable from a scripted input, so a scenario may
  // ask both harnesses to place the player directly.
  const warp = s.warp === undefined ? [] : ['--warp', String(s.warp)];
  const lvl = String(s.level ?? level);       // per-scenario level wins
  run('python', ['tools/oracle/trace.py', '--frames', String(s.frames),
                 '--script', s.script, '--level', lvl, ...ammo, ...warp]);
  run('node', ['tools/render-frame.mjs', '--frames', String(s.frames),
               '--script', s.script, '--level', lvl, ...ammo, ...warp]);

  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'rip/oracle/trace_L' + lvl.padStart(2, '0') + '.json'),
    'utf8')).frames;
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/port/trace.json'), 'utf8'));
  const n = Math.min(o.length, p.length);

  // `skipFrames` drops leading frames from the comparison. Only legitimate use:
  // trace.py injects --ammo AFTER frame 1 has already been sampled (frame 1's
  // $0A4F sample is collected during boot_to_gameplay), while render-frame.mjs
  // sets it before its first tick. That is a one-frame harness skew, not a port
  // divergence. Never use it to hide a real diff.
  const start = s.skipFrames || 0;
  const pct = {};
  const firstBad = {};
  for (const f of [...FIELDS, ...(s.extra || [])]) {
    let bad = 0;
    for (let i = start; i < n; i++) {
      if (o[i][f] === p[i][f]) continue;
      if (bad === 0) firstBad[f] = { frame: i + 1, oracle: o[i][f], port: p[i][f] };
      bad++;
    }
    pct[f] = (1 - bad / (n - start)) * 100;
  }
  rows.push({ name: s.name, frames: n, pct, firstBad,
              knownFail: s.knownFail, extra: s.extra || [] });
  process.stderr.write('done\n');
}

const NAMEW = Math.max(19, ...SCRIPTS.map((s) => s.name.length + 1));
const cell = (v) => (v === 100 ? '  100%' : v.toFixed(1).padStart(6) + '');
console.log('\n' + 'scenario'.padEnd(NAMEW) + 'frames' +
            FIELDS.map((f) => f.padStart(8)).join('') + '   extra  verdict');
// A scenario carrying `knownFail` is a diagnosed, un-fixed port bug: it is
// allowed to diverge (XFAIL) but NOT allowed to start passing silently (XPASS
// is a failure -- delete the annotation instead).
const regressions = [];
const xpasses = [];
const xfails = [];
for (const r of rows) {
  // Every field the scenario asked for, core plus `extra`.
  const clean = Object.values(r.pct).every((v) => v === 100);
  let verdict;
  if (r.knownFail) {
    verdict = clean ? 'XPASS' : 'xfail';
    (clean ? xpasses : xfails).push(r);
  } else {
    verdict = clean ? 'ok' : 'FAIL';
    if (!clean) regressions.push(r);
  }
  const extraWorst = r.extra.length
    ? cell(Math.min(...r.extra.map((f) => r.pct[f])))
    : '     -';
  console.log(r.name.padEnd(NAMEW) + String(r.frames).padStart(6) +
              // Camera included: since the $0A4F sampling fix it is exact too,
              // so any drift is a real regression, not a measurement artifact.
              FIELDS.map((f) => cell(r.pct[f]).padStart(8)).join('') +
              '  ' + extraWorst + '  ' + verdict);
}

// A percentage says a scenario broke; the first divergent frame says where.
// Re-run that one script through tools/oracle/compare.mjs for the full window.
const showFirst = (list, heading) => {
  if (!list.length) return;
  console.log('\n' + heading);
  for (const r of list) {
    for (const f of [...FIELDS, ...r.extra]) {
      const d = r.firstBad[f];
      if (!d) continue;
      console.log(`  ${r.name} ${f} @ frame ${d.frame}: ` +
                  `oracle ${d.oracle}, port ${d.port}`);
    }
  }
};
showFirst(regressions, 'REGRESSION - first divergence per broken field:');
showFirst(xfails, 'known failures (xfail) - first divergence per field:');
for (const r of xfails) console.log(`\n  ${r.name}: ${r.knownFail}`);
for (const r of xpasses) {
  console.log(`\n  ${r.name} is marked knownFail but is now bit-exact. ` +
              'Remove the annotation from tools/oracle/regress.mjs.');
}

const ok = regressions.length === 0 && xpasses.length === 0;
console.log('\n' + (ok
  ? `PASS - ${rows.length - xfails.length}/${rows.length} scenarios bit-exact ` +
    `against the ROM` + (xfails.length ? `, ${xfails.length} known xfail` : '')
  : (regressions.length
      ? 'REGRESSION: a field diverged from the ROM'
      : 'XPASS: a known-failing scenario now passes')));
process.exit(ok ? 0 : 1);
