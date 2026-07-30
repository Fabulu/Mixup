// Difficulty sweep for the enemy area: the same scenario run at $C756 = 0, 1
// and 2 against the cartridge, using difftrace.py + portrun.mjs (which are
// trace.py / render-frame.mjs with a --difficulty flag bolted on).
//
//   node tools/oracle/diffhunt.mjs [--only NAME]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './_env.mjs';

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

const E = (n) => ['f', 'f1', 's', 'd', 'ms', 'x', 'y', 'vx', 'vy', 'at', 'hp']
  .map((k) => `en${n}${k}`);
const CORE = ['x', 'y', 'vx', 'vy', 'air', 'facing', 'camX', 'camY', 'hp'];
const BAT = ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc', 'ammo'];
const BOSS = ['bossRage', 'bossCrit', 'bossHop'];

const SCEN = [
  { name: 'l4-boss1-idle', level: 4, frames: 400, script: '400:',
    extra: [...E(0), ...BOSS], diffs: [0, 2] },
  { name: 'l4-boss1-punch', level: 4, frames: 400, ammo: 0, skipFrames: 1,
    script: '20:,60:R,6:B,20:,6:B,20:,6:B,268:',
    extra: [...E(0), ...BOSS], diffs: [0, 2] },
  { name: 'l8-boss2-engage', level: 8, frames: 558, script: '20:,110:R,428:',
    extra: [...E(0), ...E(1), ...E(2), ...BOSS], diffs: [0, 2] },
  // Boss 2's ARMOUR FORK, which nothing else in this corpus reaches. $3C94 is
  // the only place a batarang hit splits on the target's air state: with
  // r[0] & 0x03 non-zero -- boss 2 off the ground -- $3C9E falls through to the
  // ordinary damage arm and the armour does nothing; grounded, $3CA2 writes
  // $C741 = $1E and he spins instead, unhurt, for 30 frames. The grounded half
  // is covered by l8-boss2-engage; the airborne half was covered by nothing, so
  // a port that always took the $1E branch would report GREEN everywhere and
  // make boss 2 unkillable by batarang -- which is exactly how he behaves in
  // play (82 connections, 0 damage, 2000 cartridge frames), so the symptom
  // would not have looked like a bug either.
  //
  // The script closes the distance, then throws on a 20-frame cadence with a
  // left tap first so the hop is in flight when the batarang arrives.
  // 398 frames, not 400: 0:$065C lags at f399 on difficulty 2 (measured by
  // hooking it over this exact script), so the cap sits below the lag frame the
  // way every other entry's does.
  //
  // TEETH, executed: delete the `if (r[0] & 0x03) { armoredDamage = true; }
  // else` fork at src/batarang.js and always take the bossHop = $1E branch.
  // Difficulty 2 goes red at f179 -- en0hp oracle 32 port 33, bossHop oracle 0
  // port 29, and bat0/bat0spd/bat0arc, 22 fields in all -- while difficulties 0
  // and 1 stay CLEAN. That asymmetry is the point: 0 and 1 only ever reach the
  // GROUNDED spin, which l8-boss2-engage already covers, so a scenario that
  // went red on all three would not be evidence that the airborne arm is
  // tested. It is the only entry here with diffs [0, 1, 2] for that reason.
  { name: 'l8-boss2-batarang-armour', level: 8, frames: 398, ammo: 99,
    skipFrames: 1,
    script: '20:,110:R,20:' + ',3:L,3:,6:B,8:'.repeat(18),
    extra: [...E(0), ...E(1), ...E(2), ...BOSS], diffs: [0, 1, 2] },
  { name: 'l11-boss3-patience', level: 11, frames: 700, script: '700:',
    extra: [...E(0), ...BOSS], diffs: [0, 2] },
  { name: 'l14-entrance', level: 14, frames: 900, script: '900:',
    extra: [...E(0), ...E(1), ...BOSS], diffs: [0, 2],
    knownLag: { en1x: 'ONE lag frame at f764, MEASURED by hooking $065C: '
                      + 'exactly one hit in 800 frames. The chaser drifts left '
                      + '4/frame, the ROM drops that step, the port never lags '
                      + 'and is one step ahead from f765 on.' } },
  // The Joker fight's throw. The entrance gate opens at f728 ($C740 -> $FF),
  // so the press has to land after it; ammo is injected because a launcher
  // boot into level 14 starts with none. Above easy this is the arm where the
  // throw sets bit 7 at once ($19C0), the flight homes on enemy slot 1
  // ($3A6B/$3ADE) and the CHASER -- not Batman -- catches it ($3BF5). Porting
  // the first two without the third caught every batarang on its own first
  // frame: ammo spent, nothing on screen, final boss unwinnable.
  // skipFrames 1 for the documented --ammo harness skew ONLY (docs 03: trace.py
  // injects after frame 1 is sampled, render-frame.mjs before its first tick).
  { name: 'l14-batarang', level: 14, frames: 800, ammo: 10, skipFrames: 1,
    script: '739:,2:B,59:',
    extra: [...E(1), ...BOSS], diffs: [0, 2],
    knownLag: { en1x: 'the same f764 lag frame as l14-entrance -- it is in the '
                      + 'entrance with no throw at all, so it is not the '
                      + 'batarang.' } },
  // MELEE is how the Joker is beaten -- measured, and it answers "how do I
  // even hurt him": batarangs home on the CHASER ($3A6B/$3ADE) and the chaser
  // ABSORBS them ($3BF5), so they are not the damage source. A punch takes him
  // for 2, i.e. 24 punches for his 48 HP. MEASURED on the cartridge with this
  // script: en0hp 48 -> 46 at f1368.
  //
  // Both sides are bit-exact for 1254 frames. Everything after is ONE REAL LAG
  // FRAME, measured by hooking $065C over this exact script: the only hit in
  // 1500 frames is f1254, and the first divergence in every field is f1255.
  // The cartridge drops that iteration's actor/enemy updates (docs/03 §28) and
  // the port never lags, so the Joker's vy reads 9 against 8 and the player's
  // rising vy 7 against 8, and the missed punch at f1368 is downstream of that
  // -- not a melee bug. Tagged rather than hidden so the tail stays visible.
  //
  // This scenario earns its place anyway: it is the only thing in the corpus
  // that exercises a punch CONNECTING on the Joker, which is the one damage
  // source that works on him.
  { name: 'l14-joker-melee', level: 14, frames: 1500, ammo: 20, skipFrames: 1,
    script: '730:' + ',10:R,6:B,4:'.repeat(40),
    extra: [...E(0), ...E(1), ...BOSS], diffs: [1],
    knownLag: Object.fromEntries([
      'x', 'y', 'vx', 'vy', 'air', 'hp', 'en0f', 'en0f1', 'en0d', 'en0ms',
      'en0x', 'en0y', 'en0vx', 'en0vy', 'en0at', 'en0hp', 'en1x', 'bossHop',
    ].map((k) => [k, 'downstream of the f1254 lag frame ($065C, measured: the '
                   + 'only hit in 1500 frames)'])) },
  { name: 'l5-walkerjump', level: 5, frames: 620, script: '20:,600:R',
    extra: [...E(0), ...E(1), ...E(3), ...E(4), ...E(5)], diffs: [0, 2] },
  { name: 'l9-flyer', level: 9, frames: 620, script: '20:,600:R',
    extra: [...E(0), ...E(1), ...E(3), ...E(4), ...E(5)], diffs: [0, 2] },
  { name: 'l1-walker', level: 1, frames: 620, script: '20:,600:R',
    extra: [...E(0), ...E(1), ...E(3), ...E(4), ...E(5)], diffs: [0, 2] },
];

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

for (const s of SCEN) {
  if (only && s.name !== only) continue;
  for (const d of s.diffs) {
    process.stderr.write(`running ${s.name} @ diff ${d} ... `);
    const ammo = s.ammo === undefined ? [] : ['--ammo', String(s.ammo)];
    const warp = s.warp === undefined ? [] : ['--warp', String(s.warp)];
    const lvl = String(s.level);
    run('python', ['tools/oracle/difftrace.py', '--frames', String(s.frames),
                   '--script', s.script, '--level', lvl,
                   '--difficulty', String(d), ...ammo, ...warp]);
    run('node', ['tools/oracle/portrun.mjs', '--frames', String(s.frames),
                 '--script', s.script, '--level', lvl,
                 '--difficulty', String(d), ...ammo, ...warp]);
    const o = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'rip/oracle/trace_L' + lvl.padStart(2, '0') + '.json'),
      'utf8')).frames;
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/port/trace.json'), 'utf8'));
    const n = Math.min(o.length, p.length);
    const fields = [...CORE, ...(s.extra || []), ...(s.ammo !== undefined ? BAT : [])];
    const start = s.skipFrames || 0;
    const bad = {};
    for (const f of fields) {
      for (let i = start; i < n; i++) {
        if (o[i][f] === p[i][f]) continue;
        if (!bad[f]) bad[f] = { frame: i + 1, oracle: o[i][f], port: p[i][f], count: 0 };
        bad[f].count++;
      }
    }
    const keys = Object.keys(bad);
    // knownLag: fields whose divergence is a REAL LAG FRAME (docs 03 lesson
    // 28) -- the cartridge drops that iteration's enemy update, the port never
    // lags, and everything downstream runs one step ahead forever. That is
    // instruction-level timing and out of scope by the project's definition.
    // Tagged rather than hidden, so it stays visible and cannot quietly grow.
    const lag = s.knownLag || {};
    const real = keys.filter((k) => !lag[k]);
    process.stderr.write('done\n');
    console.log(`\n=== ${s.name} @ $C756=${d}  (${n} frames)  ` +
                (real.length ? real.length + ' fields diverge' : 'CLEAN') +
                (keys.length > real.length
                  ? `  (+${keys.length - real.length} known lag)` : ''));
    for (const k of keys) {
      const b = bad[k];
      console.log((lag[k] ? '  LAG ' : '  ') + k.padEnd(lag[k] ? 5 : 9) +
                  ' first f' + String(b.frame).padStart(4) +
                  '  oracle=' + b.oracle + ' port=' + b.port +
                  '   (' + b.count + '/' + n + ')' +
                  (lag[k] ? '  ' + lag[k] : ''));
    }
  }
}
