// Enemy-area hunter: runs a scenario through both harnesses and diffs a
// user-chosen field set. Same shape as regress.mjs, but the scenario list is
// scoped to enemy behaviour that regress.mjs does not reach.
//
//   node tools/oracle/enemyhunt.mjs [--only NAME] [--record]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './_env.mjs';

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

const E0 = ['en0f', 'en0f1', 'en0s', 'en0d', 'en0ms', 'en0x', 'en0y',
            'en0vx', 'en0vy', 'en0at', 'en0hp', 'en0sx', 'en0sy'];
const E1 = ['en1f', 'en1f1', 'en1s', 'en1d', 'en1ms', 'en1x', 'en1y',
            'en1vx', 'en1vy', 'en1at', 'en1hp'];
const E3 = ['en3f', 'en3f1', 'en3s', 'en3d', 'en3ms', 'en3x', 'en3y',
            'en3vx', 'en3vy', 'en3at', 'en3hp'];
const E4 = ['en4f', 'en4f1', 'en4s', 'en4d', 'en4ms', 'en4x', 'en4y',
            'en4vx', 'en4vy', 'en4at', 'en4hp'];
const E5 = ['en5f', 'en5f1', 'en5s', 'en5d', 'en5ms', 'en5x', 'en5y',
            'en5vx', 'en5vy', 'en5at', 'en5hp'];
const CORE = ['x', 'y', 'vx', 'vy', 'air', 'facing', 'camX', 'camY', 'hp'];

const ALL = [...E0, ...E1, ...E3, ...E4, ...E5];

const SCEN = [
  { name: 'l6-vehicle-idle', level: 6, frames: 400, script: '400:',
    extra: [...E0] },
  { name: 'l6-vehicle-walk-right', level: 6, frames: 400, script: '20:,380:R',
    extra: [...E0] },
  { name: 'l6-vehicle-walk-left', level: 6, frames: 400, script: '20:,380:L',
    extra: [...E0] },
  // Per-level branches regress.mjs never reaches: the gap-leap table has its
  // own arm for levels 2, 3, 7 and 13, and the flyer runs on 10 as well as 9.
  { name: 'l2-walkers', level: 2, frames: 400, script: '20:,55:R,325:', extra: ALL },
  { name: 'l3-walkers-run', level: 3, frames: 620, script: '20:,600:R', extra: ALL },
  { name: 'l7-walkerjump', level: 7, frames: 620, script: '20:,600:R', extra: ALL },
  { name: 'l13-walkerjump', level: 13, frames: 620, script: '20:,600:R', extra: ALL },
  { name: 'l10-flyers', level: 10, frames: 620, script: '20:,600:R', extra: ALL },

  // The batarang's ARMORED arm ($3C8A). Documented as never executed by any
  // regress scenario: states 2 / 7 / $0A.  State 2 lives on 5/7/13, $0A is
  // boss 1 (level 4) and 7 is boss 2 (level 8, only the grounded half is
  // covered by l8-boss2-batarang-spin).
  { name: 'l5-batarang-armored', level: 5, frames: 620, ammo: 9, skipFrames: 1,
    script: '20:,200:R,4:B,40:R,4:B,40:R,4:B,40:R,4:B,40:R,4:B,220:R',
    extra: [...ALL, 'bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc',
            'bat1', 'bat2', 'ammo', 'bossCrit', 'bossRage', 'bossHop'] },
  { name: 'l4-batarang-boss1', level: 4, frames: 500, ammo: 9, skipFrames: 1,
    script: '60:,4:B,60:,4:B,60:,4:B,60:,4:B,248:',
    extra: [...E0, 'bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc',
            'bat1', 'bat2', 'ammo', 'bossCrit', 'bossRage', 'bossHop'] },
  { name: 'l14-batarang-joker', level: 14, frames: 900, ammo: 9, skipFrames: 1,
    script: '300:,4:B,60:,4:B,60:,4:B,60:,4:B,412:',
    extra: [...E0, ...E1, 'bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc',
            'ammo', 'bossCrit', 'bossRage', 'bossHop'] },
  { name: 'l8-boss2-batarang-air', level: 8, frames: 558, ammo: 9, skipFrames: 1,
    script: '20:,110:R,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:,4:B,40:',
    extra: [...E0, ...E1, 'bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc',
            'bat1', 'bat2', 'ammo', 'bossCrit', 'bossRage', 'bossHop'] },
];

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
const rows = [];
for (const s of SCEN) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const ammo = s.ammo === undefined ? [] : ['--ammo', String(s.ammo)];
  const warp = s.warp === undefined ? [] : ['--warp', String(s.warp)];
  const lvl = String(s.level);
  run('python', ['tools/oracle/trace.py', '--frames', String(s.frames),
                 '--script', s.script, '--level', lvl, ...ammo, ...warp]);
  run('node', ['tools/render-frame.mjs', '--frames', String(s.frames),
               '--script', s.script, '--level', lvl, ...ammo, ...warp]);
  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'rip/oracle/trace_L' + lvl.padStart(2, '0') + '.json'),
    'utf8')).frames;
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/port/trace.json'), 'utf8'));
  const n = Math.min(o.length, p.length);
  const fields = [...CORE, ...(s.extra || [])];
  const bad = {};
  const start = s.skipFrames || 0;
  for (const f of fields) {
    for (let i = start; i < n; i++) {
      if (o[i][f] === p[i][f]) continue;
      if (!bad[f]) bad[f] = { frame: i + 1, oracle: o[i][f], port: p[i][f], count: 0 };
      bad[f].count++;
    }
  }
  rows.push({ name: s.name, n, bad, fields });
  process.stderr.write('done\n');
}

for (const r of rows) {
  const keys = Object.keys(r.bad);
  console.log('\n=== ' + r.name + '  (' + r.n + ' frames)  ' +
              (keys.length ? keys.length + ' fields diverge' : 'CLEAN'));
  for (const k of keys) {
    const b = r.bad[k];
    console.log('  ' + k.padEnd(8) + ' first f' + String(b.frame).padStart(4) +
                '  oracle=' + b.oracle + ' port=' + b.port +
                '   (' + b.count + '/' + r.n + ' frames)');
  }
}
