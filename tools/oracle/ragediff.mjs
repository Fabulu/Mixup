// "Would this scenario be green once someone else's fix lands?", measured
// rather than assumed.
//
// diffhunt's l14-entrance @ $C756=2 diverges on `bossRage` from frame 1: the
// cartridge runs level 14 with $C73D = 0 because $0DFA clears it AFTER $0D8A's
// hard-mode `$C73D = 1`, and src/level.js's applyDifficultyInit only has the
// $0D8A half. That is a level.js fix, i.e. another bundle's file. This runs the
// port with the $0DFA clear applied from outside so the rest of the scenario
// can be judged on its own merits -- and so a claim of "green after their fix"
// is a measurement instead of a promise.
//
// Compares against a difftrace.py recording taken at the SAME difficulty. Pass
// --oracle and give difftrace.py a matching --out: rip/oracle/trace_LNN.json is
// a SHARED path and other agents working this tree overwrite it. That is not
// hypothetical -- this file's first two runs disagreed with each other because
// somebody else's level-14 recording landed in between, and a comparator whose
// reference silently changes underneath it is worse than no comparator.
//
//   python tools/oracle/difftrace.py --level 14 --frames 900 --script "900:" \
//       --difficulty 2 --out rip/oracle/bundleC
//   node tools/oracle/ragediff.mjs --oracle rip/oracle/bundleC/trace_L14.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.indexOf(`--${n}`) >= 0
  ? argv[argv.indexOf(`--${n}`) + 1] : d);
const level = parseInt(arg('level', '14'), 10);
const frames = parseInt(arg('frames', '900'), 10);
const difficulty = parseInt(arg('difficulty', '2'), 10);
const script = arg('script', '');
const oracleFile = arg('oracle', null);

// Same expansion as portrun.mjs: "20:,110:R" -> a per-frame button mask.
const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const timeline = [];
for (const seg of script.split(',').filter(Boolean)) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const state = createState(makeTunables());
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
state.flow.difficulty = difficulty;
await initLevel(state, level);
state.flow.difficulty = difficulty;
// $0DFA: level $0E clears $C73D again, after $0D8A set it on hard.
if (level === 0x0E) state.flow.bossRage = 0;

const en = (i, r) => ({
  [`en${i}f`]: r[0], [`en${i}f1`]: r[1], [`en${i}s`]: r[2], [`en${i}d`]: r[5],
  [`en${i}ms`]: r[6],
  [`en${i}x`]: (r[0x0E] << 8) | r[0x0F], [`en${i}y`]: (r[0x10] << 8) | r[0x11],
  [`en${i}vx`]: r[0x12], [`en${i}vy`]: r[0x13], [`en${i}at`]: r[0x14],
  [`en${i}hp`]: r[0x16],
});

const trace = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline.length
    ? (timeline[Math.min(f - 1, timeline.length - 1)] ?? 0) : 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);
  const p = state.player;
  trace.push({
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, air: p.air, facing: p.facing,
    camX: state.camera.x, camY: state.camera.y, hp: p.hp,
    ...en(0, state.enemies[0]), ...en(1, state.enemies[1]),
    ...en(2, state.enemies[2]),
    bossRage: state.flow.bossRage, bossCrit: state.flow.bossCrit,
    bossHop: state.flow.bossHop,
  });
}

// --dump FIELD:FROM:TO -- both sides of one field over a window, for the
// "which frame did the step happen on" question a first-divergence cannot answer.
const dump = arg('dump', null);

const file = path.join(ROOT, oracleFile || ('rip/oracle/trace_L' +
                       String(level).padStart(2, '0') + '.json'));
const o = JSON.parse(fs.readFileSync(file, 'utf8')).frames;
const n = Math.min(o.length, trace.length);
const fields = Object.keys(trace[0]).filter((k) => k in o[0]);

if (dump) {
  const [k, a, b] = dump.split(':');
  for (let i = parseInt(a, 10) - 1; i < Math.min(parseInt(b, 10), n); i++) {
    console.log(`  f${String(i + 1).padStart(4)}  oracle=${o[i][k]}` +
                `  port=${trace[i][k]}` +
                (o[i][k] === trace[i][k] ? '' : '   <-'));
  }
}
let bad = 0;
for (const k of fields) {
  for (let i = 0; i < n; i++) {
    if (o[i][k] === trace[i][k]) continue;
    console.log(`  ${k.padEnd(9)} first f${String(i + 1).padStart(4)}` +
                `  oracle=${o[i][k]} port=${trace[i][k]}`);
    bad++;
    break;
  }
}
console.log(`level ${level} @ $C756=${difficulty}, ${n} frames, ` +
            `${fields.length} fields: ${bad ? bad + ' DIVERGE' : 'CLEAN'}`);
process.exit(bad ? 1 : 0);
