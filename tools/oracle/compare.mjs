// Diff the JS port's frame trace against the PyBoy oracle's, field by field.
// Reports the FIRST frame each field diverges on, which is the failing frame.
//
// Usage:
//   python tools/oracle/trace.py --frames 120 --script "20:,40:R,10:RA,50:R"
//   node   tools/render-frame.mjs --frames 120 --script "20:,40:R,10:RA,50:R"
//   node   tools/oracle/compare.mjs
//
//   --fields x,y,vx,vy,air     restrict to specific fields
//   --level 1                  which level's traces to compare

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './_env.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const level = parseInt(arg('level', '1'), 10);
const pad = String(level).padStart(2, '0');

const oraclePath = path.join(ROOT, `rip/oracle/trace_L${pad}.json`);
const portPath = path.join(ROOT, 'rip/port/trace.json');

for (const [p, hint] of [[oraclePath, 'python tools/oracle/trace.py'],
                         [portPath, 'node tools/render-frame.mjs']]) {
  if (!fs.existsSync(p)) {
    console.error(`missing ${path.relative(ROOT, p)} - run: ${hint}`);
    process.exit(2);
  }
}

const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
const port = JSON.parse(fs.readFileSync(portPath, 'utf8'));

// Fields the port currently models.
//
// `anim` and `animFrame` are here now. They were not, for a long time, and a
// comment claiming they were "compared but not enforced" was simply false --
// nothing compared them at all, and when they finally were, anim diverged in
// 26 of 28 corpus scenarios and animFrame in all 28. loc_00_1B4A (pose select)
// and sub_00_2C13 (the tile streamer that owns $FFC4) are now translated and
// both are bit-exact, so they belong in the default set like any other field.
//
// trace.py additionally samples $FF89/$FF90/$FF91/$FF92 as `animTimer`,
// `squat`, `prevVx` and `crouch` -- loc_00_1B4A's private scratch. They are not
// compared by default because nothing outside that routine reads them, but
// `--fields ...,animTimer,squat` is the fastest way to localise a pose bug: the
// pose is a consequence, those four are the cause.
const DEFAULT_FIELDS = ['x', 'y', 'vx', 'vy', 'air', 'facing', 'camX', 'camY',
                        'anim', 'animFrame'];
const fields = (arg('fields', '') || '').trim()
  ? arg('fields').split(',').map((s) => s.trim())
  : DEFAULT_FIELDS;

const n = Math.min(oracle.frames.length, port.length);
if (n === 0) { console.error('empty trace'); process.exit(2); }

const first = {};      // field -> first divergent frame
const counts = {};     // field -> number of divergent frames
const worst = {};      // field -> largest absolute difference

for (const f of fields) { counts[f] = 0; worst[f] = 0; }

for (let i = 0; i < n; i++) {
  const o = oracle.frames[i];
  const p = port[i];
  for (const f of fields) {
    if (o[f] === undefined || p[f] === undefined) continue;
    const d = Math.abs(o[f] - p[f]);
    if (d !== 0) {
      counts[f]++;
      if (first[f] === undefined) first[f] = { frame: o.f, oracle: o[f], port: p[f] };
      if (d > worst[f]) worst[f] = d;
    }
  }
}

console.log(`oracle: ${oracle.frames.length} frames, script "${oracle.script}"`);
console.log(`port  : ${port.length} frames`);
console.log(`compared ${n} frames on ${fields.length} fields\n`);

const pct = (c) => `${((1 - c / n) * 100).toFixed(1)}%`;
console.log(`${'field'.padEnd(8)}${'match'.padStart(8)}${'bad'.padStart(6)}` +
            `${'maxdiff'.padStart(9)}   first divergence`);
let clean = true;
for (const f of fields) {
  const c = counts[f];
  if (c) clean = false;
  const d = first[f]
    ? `frame ${first[f].frame}: oracle=${first[f].oracle} port=${first[f].port}`
    : '-';
  console.log(`${f.padEnd(8)}${pct(c).padStart(8)}${String(c).padStart(6)}` +
              `${String(worst[f]).padStart(9)}   ${d}`);
}

if (clean) {
  console.log('\nEXACT MATCH on every compared field.');
  process.exit(0);
}

// Show a window around the earliest divergence -- that is the frame to debug.
const earliest = Math.min(...Object.values(first).map((v) => v.frame));
console.log(`\nearliest divergence: frame ${earliest}\n`);
console.log(`${'f'.padStart(5)}  ${'side'.padEnd(7)}` +
            fields.map((f) => f.padStart(8)).join(''));
for (let i = Math.max(0, earliest - 4); i < Math.min(n, earliest + 4); i++) {
  const o = oracle.frames[i], p = port[i];
  console.log(`${String(o.f).padStart(5)}  ${'oracle'.padEnd(7)}` +
              fields.map((f) => String(o[f] ?? '-').padStart(8)).join(''));
  console.log(`${''.padStart(5)}  ${'port'.padEnd(7)}` +
              fields.map((f) => String(p[f] ?? '-').padStart(8)).join('') +
              `   ${fields.some((f) => o[f] !== p[f]) ? '<-- differs' : ''}`);
}
process.exit(1);
