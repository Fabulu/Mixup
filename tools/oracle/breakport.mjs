// Port twin of tools/oracle/breakcells.py -- same columns, same cell address
// arithmetic, so the two tables can be diffed line for line.
//
// `--vy` exists because the cartridge harness writes the warp mid-iteration and
// therefore samples one gravity step in: seeding the port's VelY reproduces the
// cartridge's f0 exactly instead of leaving a permanent one-step skew that
// would have to be eyeballed away on every comparison.
//
//   node tools/oracle/breakport.mjs --level 5 --warp 36,27 --hold R --vy -3 \
//        --cell 37,29 --cell 37,30 --cell 37,31 --frames 40
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const St = await imp('src/state.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const all = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
const frames = parseInt(arg('frames', '40'), 10);
const level = parseInt(arg('level', '5'), 10);
const warp = arg('warp', null);
const seedVy = parseInt(arg('vy', '0'), 10);
const holdKeys = arg('hold', 'R');
const script = arg('script', null);
const watch = all('cell').map((c) => c.split(',').map(Number));

let hold = 0;
for (const k of holdKeys) hold |= BTN[k.toUpperCase()] || 0;

const timeline = [];
if (script) {
  for (const seg of script.split(',')) {
    const [n, keys = ''] = seg.split(':');
    let mask = 0;
    for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
    for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
  }
}

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, level);

if (warp) {
  const [c, r] = warp.split(',').map(Number);
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  state.player.y = (r & 0xFF) << 8;
  state.player.vy = seedVy;
  state.player.air = 2;
}

const hex4 = (v) => `$${v.toString(16).toUpperCase().padStart(4, '0')}`;
const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');

console.log(' f    x      y     vx air hp  ' + watch.map(([c, r]) => `${c},${r}`).join('  ')
  + '   | slots(timer,col,row)      | cells changed');
for (let f = 0; f < frames; f++) {
  // breakcells.py presses during iteration 3 and the ROM reads the joypad in
  // VBlank, so the cartridge first ACTS on the hold in iteration 4.
  const held = script ? (timeline[Math.min(f, timeline.length - 1)] ?? 0) : (f >= 4 ? hold : 0);
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  const before = state.level.cells.slice();
  tick(state, manifest, playerTiles);
  const p = state.player;
  const cs = watch.map(([c, r]) => {
    const i = ((c * 16) + (r & 0x0F)) * 2;
    return `${hex2(state.level.cells[i])}/${hex2(state.level.cells[i + 1])}`;
  }).join(' ');
  const sl = state.breakables.filter((s) => s.timer)
    .map((s) => `${s.timer},${s.col},${s.row}`).join(' ');
  const chg = [];
  for (let i = 0; i < before.length; i += 2) {
    if (before[i] !== state.level.cells[i] || before[i + 1] !== state.level.cells[i + 1]) {
      chg.push(`(${(i / 32) | 0},${(((i % 32) / 2) | 0) + 16}) ${hex2(before[i])}/${hex2(before[i + 1])}`
        + `->${hex2(state.level.cells[i])}/${hex2(state.level.cells[i + 1])}`);
    }
  }
  console.log(`${String(f).padStart(3)} ${hex4(p.x)} ${hex4(p.y)} ${String(p.vx).padStart(4)} `
    + `${String(p.air).padStart(2)} ${String(p.hp).padStart(2)}  ${cs}   | ${sl.padEnd(24)} | ${chg.join('  ')}`);
}
