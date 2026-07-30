// Port-side twin of tools/oracle/breakwall.py: warp, hold a direction, and
// print the player position plus named map cells per frame.
//
//   node tools/oracle/portwall.mjs --level 5 --warp 36,27 --hold R \
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
const holdKeys = arg('hold', 'R');
const cells = all('cell').map((c) => c.split(',').map(Number));

let hold = 0;
for (const k of holdKeys) hold |= BTN[k.toUpperCase()] || 0;

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, level);

console.log(' f    x      y    air brk  ' + cells.map(([c, r]) => `c${c},${r}`).join('  ') + '   | timers');
for (let f = 0; f < frames; f++) {
  if (warp && f === 0) {
    const [c, r] = warp.split(',').map(Number);
    state.player.x = ((c & 0xFF) << 8) | 0x80;
    state.player.y = (r & 0xFF) << 8;
  }
  const held = f >= 2 ? hold : 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);
  const p = state.player;
  const cv = cells.map(([c, r]) => St.mapCollision(state, c, r).toString(16).padStart(2, '0')).join('     ');
  const t = state.breakables.slice(0, 2).map((s) => `${s.timer},${s.col},${s.row}`).join(' ');
  console.log(`${String(f).padStart(3)} $${p.x.toString(16).toUpperCase().padStart(4, '0')} `
    + `$${p.y.toString(16).toUpperCase().padStart(4, '0')} ${String(p.air).padStart(3)}      ${cv}   | ${t}`);
}
